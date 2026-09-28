'use strict';

const TripsFirebase = (() => {

  let _unsub = null;
  let _readyResolve = null;
  const _ready = new Promise(resolve => { _readyResolve = resolve; });

  function _col() {
    return firebase.firestore().collection('trips');
  }

  // Firestore не поддерживает вложенные массивы (например
  // importData.route[].rows — это массив пар [время, текст]), а JSON от
  // AI-экспедиций как раз такие содержит. Храним importData целиком как
  // JSON-строку в отдельном поле, чтобы это ограничение не било по формату
  // остальных полей — наружу (через listen) importData всегда возвращается
  // уже разобранным объектом, как и раньше.
  function _toDoc(trip) {
    const data = Object.assign({}, trip);
    delete data.id;
    if (data.importData !== undefined) {
      data.importDataJson = data.importData ? JSON.stringify(data.importData) : null;
      delete data.importData;
    }
    return data;
  }

  function _fromDoc(id, data) {
    const trip = Object.assign({ id }, data);
    if ('importDataJson' in trip) {
      try {
        trip.importData = trip.importDataJson ? JSON.parse(trip.importDataJson) : null;
      } catch (e) {
        trip.importData = null;
      }
      delete trip.importDataJson;
    }
    // Подстраховка от старого формата participants (массив строк-имён,
    // до перехода на {name, uid} — см. commit "participants поездки —
    // строки → {name, uid}"). Продовые документы уже мигрированы вручную,
    // но ничего в коде не гарантирует, что строка больше никогда не
    // всплывёт (восстановленный бэкап, старый клиент и т.п.) — единая
    // точка входа для чтения поездок из Firestore нормализует форму,
    // а не даёт каждому потребителю падать/портить данные по-своему.
    if (Array.isArray(trip.participants)) {
      trip.participants = trip.participants.map(p =>
        (p && typeof p === 'object') ? p : { name: String(p), uid: null }
      );
    }
    // Та же подстраховка для readiness — раньше это был фиксированный
    // объект из 6 ключей (gear/menu/shopping/medkit/tickets/route),
    // теперь свободный список [{id,label,done}] под конкретную поездку
    // (см. TripsData.getDefaultReadiness). Существующие документы в
    // Firestore ещё старой формы — превращаем в новую здесь же, одним
    // местом на все чтения, вместо миграции руками; при следующем
    // сохранении поездки новая форма и запишется обратно.
    if (trip.readiness && !Array.isArray(trip.readiness)) {
      const legacyLabels = {
        gear: 'Список снаряжения', menu: 'Меню составлено', shopping: 'Список закупки',
        medkit: 'Аптечка', tickets: 'Билеты куплены', route: 'Маршрут согласован',
      };
      trip.readiness = Object.keys(legacyLabels).map(key => ({
        id: key, label: legacyLabels[key], done: !!trip.readiness[key],
      }));
    }
    return trip;
  }

  // ── Realtime listener на всю коллекцию поездок ──────────────
  function listen(cb) {
    stopListening();
    _unsub = _col().onSnapshot(snap => {
      const arr = [];
      snap.forEach(doc => arr.push(_fromDoc(doc.id, doc.data())));
      cb(arr);
      if (_readyResolve) { _readyResolve(); _readyResolve = null; }
    }, err => {
      console.warn('trips listen:', err);
      if (_readyResolve) { _readyResolve(); _readyResolve = null; }
    });
  }

  function stopListening() {
    if (_unsub) { _unsub(); _unsub = null; }
  }

  // Резолвится один раз, когда пришёл первый снапшот (или ошибка) —
  // используется в startApp(), чтобы не показывать UI до того, как
  // кэш поездок хоть раз наполнился.
  function ready() {
    return _ready;
  }

  function addTrip(trip) {
    const id = trip.id;
    return _col().doc(id).set(_toDoc(trip), { merge: true })
      .then(() => id)
      .catch(e => { console.warn('addTrip:', e); throw e; });
  }

  function updateTrip(id, changes) {
    return _col().doc(id).set(_toDoc(changes), { merge: true })
      .catch(e => { console.warn('updateTrip:', e); throw e; });
  }

  // Вступление в поездку читает-меняет-пишет массивы participants/memberIds
  // целиком — Firestore не мержит массивы поэлементно, {merge:true} на поле-
  // массиве просто заменяет его целиком. Раньше это читало ЛОКАЛЬНЫЙ кэш
  // (мог быть уже устаревшим) и писало новый массив без всякой защиты —
  // если два человека вступают одновременно по одной ссылке-приглашению,
  // вторая запись полностью стирает участника, добавленного первой (реальная
  // гонка, найдена внешним ревью 2026-09-27). Транзакция читает СВЕЖУЮ
  // серверную версию и пишет в одной атомарной операции — Firestore сам
  // повторяет транзакцию при конфликте, потерянных записей не бывает.
  function addParticipant(tripId, { uid, name } = {}) {
    const ref = _col().doc(tripId);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found');
      const data = snap.data() || {};
      const participants = Array.isArray(data.participants) ? data.participants : [];
      const memberIds = Array.isArray(data.memberIds) ? data.memberIds : [];

      if (uid && memberIds.includes(uid)) return;

      // Совпадение по имени годится только для гостя БЕЗ uid (backfill —
      // человека раньше вписали руками, теперь у него появился аккаунт).
      // Если под этим именем уже сидит участник С уже другим uid — это
      // просто тёзка, не тот же человек: раньше такой матч молча "съедал"
      // нового участника — uid уходил в memberIds (доступ выдавался), а в
      // participants никто не добавлялся — человек попадал в поездку
      // невидимкой. Реальный баг, найден внешним ревью 2026-09-27.
      const matchIdx = name
        ? participants.findIndex(p => p.name.toLowerCase() === name.toLowerCase() && !p.uid)
        : -1;
      let newParticipants;
      if (matchIdx >= 0) {
        newParticipants = uid
          ? participants.map((p, i) => i === matchIdx ? { ...p, uid } : p)
          : participants;
      } else if (name) {
        newParticipants = [...participants, { name, uid: uid || null }];
      } else {
        newParticipants = participants;
      }
      const newMemberIds = uid ? [...new Set([...memberIds, uid])] : memberIds;

      tx.update(ref, { participants: newParticipants, memberIds: newMemberIds });
    }).catch(e => { console.warn('addParticipant:', e); throw e; });
  }

  // Удаление поездки насовсем — сам документ trips/{id} плюс все его
  // подколлекции (Firestore их не удаляет каскадно) и данные, разбросанные
  // по другим верхнеуровневым коллекциям тем же id (см. остальные *firebase.js
  // модулей: у каждого свой db.collection(...).doc(tripId) — единого списка
  // "что принадлежит поездке" в кодовой базе не было, собран здесь).
  // batch ограничен 500 операциями — с запасом для одной поездки.
  //
  // currentUid — ТОЛЬКО тот, кто реально жмёт "Удалить", не все участники:
  // gear_trip_snapshots/personal_purchases по правилам может писать (в т.ч.
  // удалять) исключительно владелец конкретного документа. Первая версия
  // пыталась удалить эти данные и за остальных участников — Firestore batch
  // атомарный, одно нарушение правила валит ВЕСЬ batch, включая то, что
  // само по себе было разрешено (сама поездка, её уловы/расходы и т.д.), и
  // "Удалить поездку" молча ничего не делало. Личные данные чужих
  // участников для уже удалённой поездки просто остаются висеть у них —
  // никому кроме них не видны, не страшно.
  async function deleteTrip(id, currentUid) {
    const tripRef = _col().doc(id);
    const batch = firebase.firestore().batch();

    const subcollections = ['catches', 'expenses', 'settlements', 'notes', 'river_points', 'river_notes'];
    for (const name of subcollections) {
      const snap = await tripRef.collection(name).get();
      snap.forEach(doc => batch.delete(doc.ref));
    }
    batch.delete(tripRef.collection('modules').doc('medkit'));

    // activity/medkit_personal тоже не попадали сюда раньше (реальная
    // дыра — оставались висеть после удаления поездки, читаемы кем угодно
    // из members, найдена внешним ревью 2026-09-27), но их нельзя мести
    // тем же простым циклом, что и subcollections выше: их правила отдают
    // delete не любому участнику, а только автору конкретного документа
    // (или isOrganizer() — см. firestore.rules). Та же батч-атомарность,
    // что и с gear_trip_snapshots/personal_purchases в комментарии выше —
    // обычный (не админ) владелец поездки чужие записи этих двух коллекций
    // удалить не может, поэтому берём только свои; все документы — только
    // если удаляет app-wide организатор.
    const isAdmin = typeof AuthActions !== 'undefined' && AuthActions.isOrganizer();
    const activitySnap = await tripRef.collection('activity').get();
    activitySnap.forEach(doc => { if (isAdmin || doc.data().uid === currentUid) batch.delete(doc.ref); });
    const medkitPersonalSnap = await tripRef.collection('medkit_personal').get();
    medkitPersonalSnap.forEach(doc => { if (isAdmin || doc.id === currentUid) batch.delete(doc.ref); });

    batch.delete(firebase.firestore().collection('menu').doc(id));
    batch.delete(firebase.firestore().collection('shopping').doc(id));
    batch.delete(firebase.firestore().collection('gear_trip_shared').doc(id));
    if (currentUid) {
      batch.delete(firebase.firestore().collection('gear_trip_snapshots').doc(currentUid + '_' + id));
      batch.delete(firebase.firestore().collection('personal_purchases').doc(currentUid).collection('trips').doc(id));
    }

    batch.delete(tripRef);
    await batch.commit();
  }

  return { listen, stopListening, ready, addTrip, updateTrip, addParticipant, deleteTrip };
})();

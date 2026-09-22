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

  return { listen, stopListening, ready, addTrip, updateTrip, deleteTrip };
})();

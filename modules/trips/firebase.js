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

  // .set(...,{merge:true}) МОЛЧА СОЗДАЁТ документ, если его уже нет — а
  // его может не быть, если владелец успел удалить поездку, а с другого
  // устройства в этот момент летело узкое сохранение (оценка, погода,
  // расписание дороги и т.п.): вместо отказа получался воскресший
  // документ ТОЛЬКО с присланными полями, без name/dates/ownerId и
  // остального. Реальный баг, найден внешним ревью 2026-09-27. Просто
  // заменить на .update() было бы неверно: некоторые поля (например
  // trip.travel — вложенная карта {имя: {legs}} на человека, см.
  // modules/tripcover/index.js) пишутся как {travel: {[name]: {legs}}},
  // рассчитывая на РЕКУРСИВНЫЙ мёрж set(...,{merge:true}) — update() без
  // dot-пути ЦЕЛИКОМ заменяет вложенное поле, стирая travel остальных
  // участников. Транзакция: та же merge-семантика, что и раньше, но
  // сначала проверяем, что документ вообще существует — иначе отказ, а не
  // воскрешение.
  function updateTrip(id, changes) {
    const ref = _col().doc(id);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found (deleted?)');
      tx.set(ref, _toDoc(changes), { merge: true });
    }).catch(e => { console.warn('updateTrip:', e); throw e; });
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
  // requireToken — только для вступления по ссылке-приглашению (не для
  // "добавить уже зарегистрированного из профиля" — там organiser явно
  // выбирает человека сам, токен ни при чём). Лист подтверждения
  // (index.html _processJoinInvite) мог провисеть открытым сколько угодно
  // между проверкой токена/ограничения и самим нажатием "Присоединиться" —
  // за это время организатор успевал отозвать ссылку или включить
  // "Добавлять людей могу только я", а транзакция ничего из этого не
  // перепроверяла и всё равно добавляла участника. Реальная дыра (TOCTOU),
  // найдена внешним ревью 2026-09-27. Проверяем по СВЕЖИМ данным здесь же,
  // в момент самой записи, а не по тому, что было на экране при открытии.
  function addParticipant(tripId, { uid, name, requireToken } = {}) {
    const ref = _col().doc(tripId);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found');
      const data = snap.data() || {};

      if (requireToken !== undefined) {
        if (!requireToken || data.inviteToken !== requireToken) throw new Error('invite-token-invalid');
        if (data.inviteRestricted) throw new Error('invite-restricted');
      }

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

  // Применяет РАЗНИЦУ в составе участников (добавили/убрали/переименовали
  // в форме редактирования поездки) к СВЕЖИМ серверным participants, а не
  // перезаписывает весь массив локальным драфтом формы. Раньше форма
  // редактирования писала participants/memberIds ЦЕЛИКОМ тем, что было в
  // драфте при открытии формы — если, пока форма была открыта, кто-то
  // вступил по ссылке-приглашению, обычное сохранение (даже правка одного
  // только названия) стирало нового участника из participants и заодно
  // ложно срабатывало определение "кого-то исключили" (отзывало ссылку-
  // приглашение). Реальный баг, найден внешним ревью 2026-09-27.
  // toAdd/toRemove/renames — {uid?, gid?, name?, newName?}[], вычисленные
  // на клиенте сравнением драфта с тем, что было загружено ПРИ ОТКРЫТИИ
  // формы (см. modules/trips/index.js _save) — сама диффовка (кто реально
  // добавлен/убран/переименован ПОЛЬЗОВАТЕЛЕМ в этом сеансе) происходит
  // там; здесь только применение этой разницы к актуальным данным.
  // Гости старых поездок ещё без gid — matchName (имя, под которым их
  // опознали в modules/trips/index.js _save, сравнивая с тем, что было
  // загружено при открытии формы) даёт тот же фолбэк ЗДЕСЬ: gid из
  // rename/fieldChange/remove — это только что сгенерированный на клиенте,
  // которого в СВЕЖЕМ серверном participants (только что прочитанном этой
  // же транзакцией) тоже ещё нет — сопоставление по нему одному не находит
  // ничего. Без этого гость дублировался бы (новая запись с gid добавлена,
  // старая безgid'ная не найдена и не убрана) — реальный баг, найден
  // внешним ревью 2026-09-27. Совпадение по имени — строго среди записей,
  // у которых тоже нет ни uid, ни gid (иначе легко перепутать с тёзкой).
  function _findParticipantIdx(participants, { uid, gid, matchName, name }) {
    let idx = participants.findIndex(p => (uid && p.uid === uid) || (!uid && gid && p.gid === gid));
    const byName = matchName || name;
    if (idx < 0 && !uid && byName) {
      idx = participants.findIndex(p => !p.uid && !p.gid && p.name && p.name.toLowerCase() === byName.toLowerCase());
    }
    return idx;
  }

  function applyParticipantsDiff(tripId, { toAdd, toRemove, renames, fieldChanges, ownerUid } = {}) {
    if (!(toAdd?.length || toRemove?.length || renames?.length || fieldChanges?.length)) return Promise.resolve(null);
    const ref = _col().doc(tripId);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found');
      const data = snap.data() || {};
      let participants = Array.isArray(data.participants) ? data.participants.slice() : [];

      (renames || []).forEach(({ uid, gid, matchName, newName }) => {
        const idx = _findParticipantIdx(participants, { uid, gid, matchName });
        if (idx < 0) return;
        const patched = { ...participants[idx], name: newName };
        if (gid && !patched.gid) patched.gid = gid; // завершаем миграцию легаси-гостя тем же ходом
        participants[idx] = patched;
      });

      (fieldChanges || []).forEach(({ uid, gid, matchName, patch }) => {
        const idx = _findParticipantIdx(participants, { uid, gid, matchName });
        if (idx < 0) return;
        const patched = { ...participants[idx], ...patch };
        if (gid && !patched.gid) patched.gid = gid;
        participants[idx] = patched;
      });

      (toRemove || []).forEach(({ uid, gid, name }) => {
        const idx = _findParticipantIdx(participants, { uid, gid, name });
        if (idx >= 0) participants.splice(idx, 1);
      });

      (toAdd || []).forEach(p => {
        const already = participants.some(o => (p.uid && o.uid === p.uid) || (!p.uid && p.gid && o.gid === p.gid));
        if (!already) participants.push(p);
      });

      const memberIds = [...new Set([
        ...participants.filter(p => p.uid).map(p => p.uid),
        ...(ownerUid ? [ownerUid] : []),
      ])];

      const updates = { participants, memberIds };
      // Кого-то исключили — отзываем ссылку-приглашение В ТОЙ ЖЕ
      // транзакции, не отдельным вызовом после неё. Раньше это была
      // отдельная асинхронная цепочка (.then после применения диффа,
      // см. modules/trips/index.js _save), которая читала _editTripId из
      // МОДУЛЬНОЙ переменной уже к моменту своего выполнения — а
      // _closeCreate() успевал сбросить её в null ДО того, как эта цепочка
      // завершалась (applyParticipantsDiff не await'ился, форма закрывалась
      // сразу). Отзыв улетал с null вместо настоящего id поездки и просто
      // не срабатывал — исключённый мог вернуться по старой ссылке.
      // Реальный баг, найден внешним ревью 2026-09-27.
      if (toRemove && toRemove.length) updates.inviteToken = _genInviteToken();

      tx.update(ref, updates);
      return { participants, memberIds };
    }).catch(e => { console.warn('applyParticipantsDiff:', e); throw e; });
  }

  // Гости без аккаунта (вставка нескольких имён через запятую) — та же
  // гонка чтения-записи, что уже чинили выше для вступления по ссылке:
  // раньше это писало participants целиком по ЛОКАЛЬНОЙ (возможно
  // устаревшей) копии — если кто-то только что вступил по ссылке, а эта
  // копия его ещё не видела, запись стирала его из participants (uid
  // оставался в memberIds — доступ есть, а в списке участников человека
  // нет). Реальный баг, найден внешним ревью 2026-09-27. Транзакция читает
  // свежую серверную версию, тем же приёмом, что и addParticipant.
  function addGuestNames(tripId, names) {
    const ref = _col().doc(tripId);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found');
      const data = snap.data() || {};
      const participants = Array.isArray(data.participants) ? data.participants : [];
      const seen = new Set(participants.map(p => p.name.toLowerCase()));
      const additions = [];
      (names || []).forEach(name => {
        const trimmed = String(name || '').trim();
        const key = trimmed.toLowerCase();
        if (!key || seen.has(key)) return;
        seen.add(key);
        additions.push({ name: trimmed, uid: null });
      });
      if (!additions.length) return;
      tx.update(ref, { participants: [...participants, ...additions] });
    }).catch(e => { console.warn('addGuestNames:', e); throw e; });
  }

  function _genInviteToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }

  // Ленивая генерация токена ссылки-приглашения (см. firestore.rules/
  // modules/trips/index.js) — раньше читала-писала по локальной копии
  // (get-then-set, не транзакция): если два устройства ОДНОВРЕМЕННО
  // впервые открывали лист приглашения для одной поездки, оба видели
  // trip.inviteToken пустым и генерировали РАЗНЫЕ токены — вторая запись
  // побеждала, и уже показанная/скопированная на первом устройстве ссылка
  // сразу становилась недействительной. Реальный баг, найден внешним
  // ревью 2026-09-27. Транзакция: если токен уже появился (в том числе
  // только что, от другого устройства) — возвращаем ЕГО, а не создаём
  // ещё один.
  function ensureInviteToken(tripId) {
    const ref = _col().doc(tripId);
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      if (!snap.exists) throw new Error('trip not found');
      const existing = snap.data().inviteToken;
      if (existing) return existing;
      const token = _genInviteToken();
      tx.update(ref, { inviteToken: token });
      return token;
    }).catch(e => { console.warn('ensureInviteToken:', e); throw e; });
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

  return { listen, stopListening, ready, addTrip, updateTrip, addParticipant, applyParticipantsDiff, addGuestNames, ensureInviteToken, deleteTrip };
})();

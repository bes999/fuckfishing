'use strict';

const CatchesFirebase = (() => {

  let _unsub     = null;
  let _tripId    = null;
  let _callbacks = [];

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  // ── Realtime listener ────────────────────────────────────────
  // Несколько экранов (например, Catches и карточка реки в Rivers) могут
  // слушать одновременно — держим один Firestore onSnapshot на выбранную
  // поездку и рассылаем данные всем подписанным колбэкам, вместо того
  // чтобы последний вызвавший listen() отбирал подписку у предыдущего.
  //
  // Возвращает функцию отписки конкретно этого подписчика — вызывайте её,
  // если экран может открываться/закрываться независимо от остальных
  // (см. modules/rivers/index.js). Глобальный stopListening() по-прежнему
  // сразу закрывает всё — его поведение для существующих вызовов не менялось.

  function listen(tripId, onCatches) {
    if (_tripId !== tripId) {
      stopListening();
      _tripId = tripId;
    }
    _callbacks.push(onCatches);

    if (!_unsub) {
      _unsub = _ref(tripId).collection('catches')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
          const arr = [];
          snap.forEach(doc => arr.push(CatchesData.normalizeCatch(doc.data(), doc.id)));
          _callbacks.slice().forEach(cb => cb(arr));
        }, err => console.warn('catches listen:', err));
    }

    return function unsubscribeOne() {
      const idx = _callbacks.indexOf(onCatches);
      if (idx !== -1) _callbacks.splice(idx, 1);
      if (_callbacks.length === 0) stopListening();
    };
  }

  function stopListening() {
    _callbacks = [];
    _tripId    = null;
    if (_unsub) { _unsub(); _unsub = null; }
  }

  // Разовое чтение без подписки — для обложки завершённой поездки, чтобы
  // не задевать уже идущую (если есть) подписку страницы Улов.
  function getOnce(tripId) {
    return _ref(tripId).collection('catches')
      .orderBy('createdAt', 'desc')
      .get()
      .then(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(CatchesData.normalizeCatch(doc.data(), doc.id)));
        return arr;
      })
      .catch(e => { console.warn('catches getOnce:', e); return []; });
  }

  // ── CRUD ─────────────────────────────────────────────────────

  function addCatch(tripId, entry) {
    const data = Object.assign({}, entry);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    return _ref(tripId).collection('catches').add(data)
      .then(ref => ref.id)
      .catch(e => console.warn('addCatch:', e));
  }

  function deleteCatch(tripId, id) {
    return _ref(tripId).collection('catches').doc(id)
      .delete()
      .catch(e => console.warn('deleteCatch:', e));
  }

  // ── Миграция из localStorage ─────────────────────────────────
  // Вызывается один раз при первом открытии, переносит старые данные

  function migrateFromLocalStorage(tripId) {
    const LS_KEY = 'ff_catches';
    try {
      const raw = localStorage.getItem(LS_KEY);
      if (!raw) return Promise.resolve();
      const arr = JSON.parse(raw) || [];
      if (!arr.length) return Promise.resolve();

      // Только записи относящиеся к этой поездке (river совпадает)
      const promises = arr.map(c => {
        const data = Object.assign({}, c);
        delete data._id;
        data.createdAt = data.createdAt || new Date().toISOString();
        return _ref(tripId).collection('catches').add(data).catch(() => {});
      });

      return Promise.all(promises).then(() => {
        // Очищаем localStorage после успешной миграции
        localStorage.removeItem(LS_KEY);
        console.log('catches: migrated', arr.length, 'records from localStorage');
      });
    } catch (e) {
      console.warn('migrateFromLocalStorage:', e);
      return Promise.resolve();
    }
  }

  return {
    listen, stopListening, getOnce,
    addCatch, deleteCatch,
    migrateFromLocalStorage,
  };
})();

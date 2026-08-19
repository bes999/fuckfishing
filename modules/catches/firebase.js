'use strict';

const CatchesFirebase = (() => {

  let _unsub = null;

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  // ── Realtime listener ────────────────────────────────────────

  function listen(tripId, onCatches) {
    stopListening();
    _unsub = _ref(tripId).collection('catches')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(CatchesData.normalizeCatch(doc.data(), doc.id)));
        onCatches(arr);
      }, err => console.warn('catches listen:', err));
  }

  function stopListening() {
    if (_unsub) { _unsub(); _unsub = null; }
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
    listen, stopListening,
    addCatch, deleteCatch,
    migrateFromLocalStorage,
  };
})();

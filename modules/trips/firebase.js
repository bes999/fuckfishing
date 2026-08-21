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

  return { listen, stopListening, ready, addTrip, updateTrip };
})();

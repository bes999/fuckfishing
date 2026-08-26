'use strict';

/* =========================================================
   RiversFirebase — точки и заметки по рекам (карточка реки)
   =========================================================
   Раньше жили только в localStorage (rv_<tripId>_points/notes) —
   данные конкретного браузера, невидимые другим участникам и на
   других устройствах. Переносим по тому же паттерну, что уже
   обкатан на уловах (modules/catches/firebase.js): подколлекции
   под trips/{tripId}, realtime-подписка, миграция старых записей.

   Точки — trips/{tripId}/river_points/{autoId}, по одному документу
   на точку (как catches) — так правки от разных участников не
   гоняются за один и тот же документ.

   Заметки — trips/{tripId}/river_notes/{riverId}, по документу на
   реку (не на всю поездку одним блобом) — по той же причине: заметки
   к разным рекам не должны толкаться за один документ.
   ========================================================= */
const RiversFirebase = (() => {

  let _unsubPoints = null;
  let _unsubNotes  = null;

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  // ── Точки ────────────────────────────────────────────────────
  function listenPoints(tripId, onUpdate) {
    stopListeningPoints();
    _unsubPoints = _ref(tripId).collection('river_points')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(Object.assign({ _id: doc.id }, doc.data())));
        onUpdate(arr);
      }, err => console.warn('river points listen:', err));
  }

  function stopListeningPoints() {
    if (_unsubPoints) { _unsubPoints(); _unsubPoints = null; }
  }

  function addPoint(tripId, point) {
    const data = Object.assign({}, point);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    data.createdBy = window.APP?.user?.uid || null;
    return _ref(tripId).collection('river_points').add(data)
      .then(ref => ref.id)
      .catch(e => console.warn('addPoint:', e));
  }

  function updatePoint(tripId, pointId, point) {
    const data = Object.assign({}, point);
    delete data._id;
    return _ref(tripId).collection('river_points').doc(pointId)
      .set(data, { merge: true })
      .catch(e => console.warn('updatePoint:', e));
  }

  function deletePoint(tripId, pointId) {
    return _ref(tripId).collection('river_points').doc(pointId)
      .delete()
      .catch(e => console.warn('deletePoint:', e));
  }

  // ── Заметки ──────────────────────────────────────────────────
  function listenNotes(tripId, onUpdate) {
    stopListeningNotes();
    _unsubNotes = _ref(tripId).collection('river_notes')
      .onSnapshot(snap => {
        const notes = {};
        snap.forEach(doc => { notes[doc.id] = doc.data().text || ''; });
        onUpdate(notes);
      }, err => console.warn('river notes listen:', err));
  }

  function stopListeningNotes() {
    if (_unsubNotes) { _unsubNotes(); _unsubNotes = null; }
  }

  function saveNote(tripId, riverId, text) {
    return _ref(tripId).collection('river_notes').doc(riverId)
      .set({ text, updatedAt: new Date().toISOString() })
      .catch(e => console.warn('saveNote:', e));
  }

  function deleteNote(tripId, riverId) {
    return _ref(tripId).collection('river_notes').doc(riverId)
      .delete()
      .catch(e => console.warn('deleteNote:', e));
  }

  // ── Миграция из localStorage — один раз при первом входе в реки
  // конкретной поездки после обновления. Точки/заметки сохранённые
  // раньше на этом устройстве переезжают в Firestore; localStorage
  // очищаем только после того, как все записи реально ушли.
  function migrateFromLocalStorage(tripId) {
    const ptsKey   = 'rv_' + tripId + '_points';
    const notesKey = 'rv_' + tripId + '_notes';
    const promises = [];

    try {
      const rawPts = localStorage.getItem(ptsKey);
      if (rawPts) {
        const pts = JSON.parse(rawPts) || {};
        Object.keys(pts).forEach(riverId => {
          (pts[riverId] || []).forEach(pt => {
            const data = Object.assign({ riverId: riverId }, pt);
            promises.push(addPoint(tripId, data));
          });
        });
      }
    } catch (e) { console.warn('migrate points:', e); }

    try {
      const rawNotes = localStorage.getItem(notesKey);
      if (rawNotes) {
        const notes = JSON.parse(rawNotes) || {};
        Object.keys(notes).forEach(riverId => {
          if (notes[riverId]) promises.push(saveNote(tripId, riverId, notes[riverId]));
        });
      }
    } catch (e) { console.warn('migrate notes:', e); }

    if (!promises.length) return Promise.resolve();
    return Promise.all(promises).then(() => {
      localStorage.removeItem(ptsKey);
      localStorage.removeItem(notesKey);
      console.log('river points/notes: migrated for trip', tripId);
    });
  }

  return {
    listenPoints, stopListeningPoints, addPoint, updatePoint, deletePoint,
    listenNotes, stopListeningNotes, saveNote, deleteNote,
    migrateFromLocalStorage,
  };
})();

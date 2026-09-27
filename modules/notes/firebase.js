'use strict';

const NotesFirebase = (() => {

  let _unsub     = null;
  let _tripId    = null;
  let _callbacks = [];

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  function normalizeNote(data, id) {
    return {
      _id:        id,
      text:       data.text || '',
      safety:     !!data.safety,
      pinned:     !!data.pinned,
      isTask:     !!data.isTask,
      done:       !!data.done,
      private:    !!data.private,
      authorName: data.authorName || 'Участник',
      createdBy:  data.createdBy || null,
      createdAt:  data.createdAt || new Date().toISOString(),
    };
  }

  // Один onSnapshot на поездку, рассылка всем подписчикам — тот же паттерн,
  // что CatchesFirebase.listen (см. modules/catches/firebase.js).
  function listen(tripId, onNotes) {
    if (_tripId !== tripId) {
      stopListening();
      _tripId = tripId;
    }
    _callbacks.push(onNotes);

    if (!_unsub) {
      _unsub = _ref(tripId).collection('notes')
        .orderBy('createdAt', 'desc')
        .onSnapshot(snap => {
          const arr = [];
          snap.forEach(doc => arr.push(normalizeNote(doc.data(), doc.id)));
          _callbacks.slice().forEach(cb => cb(arr));
        }, err => console.warn('notes listen:', err));
    }

    return function unsubscribeOne() {
      const idx = _callbacks.indexOf(onNotes);
      if (idx !== -1) _callbacks.splice(idx, 1);
      if (_callbacks.length === 0) stopListening();
    };
  }

  function stopListening() {
    _callbacks = [];
    _tripId    = null;
    if (_unsub) { _unsub(); _unsub = null; }
  }

  function addNote(tripId, { text, safety, isTask, private: isPrivate }) {
    const data = {
      text,
      safety:     !!safety,
      pinned:     false,
      isTask:     !!isTask,
      done:       false,
      private:    !!isPrivate,
      authorName: window.APP?.profile?.displayName || 'Участник',
      createdBy:  window.APP?.user?.uid || null,
      createdAt:  new Date().toISOString(),
    };
    return _ref(tripId).collection('notes').add(data)
      .then(ref => ref.id)
      .catch(e => console.warn('addNote:', e));
  }

  function setPinned(tripId, noteId, pinned) {
    return _ref(tripId).collection('notes').doc(noteId)
      .update({ pinned: !!pinned })
      .catch(e => console.warn('setPinned:', e));
  }

  // Пометить существующую заметку задачей (или снять) — отдельно от чек-
  // бокса "готово", чтобы уже написанные заметки (см. запрос Дмитрия)
  // можно было превратить в задачу постфактум, не пересоздавая их.
  function setTask(tripId, noteId, isTask) {
    const data = { isTask: !!isTask };
    if (!isTask) data.done = false;
    return _ref(tripId).collection('notes').doc(noteId)
      .update(data)
      .catch(e => console.warn('setTask:', e));
  }

  function setDone(tripId, noteId, done) {
    return _ref(tripId).collection('notes').doc(noteId)
      .update({ done: !!done })
      .catch(e => console.warn('setDone:', e));
  }

  // Личная/общая — переключается постфактум так же, как isTask. Реальную
  // приватность (другие участники не видят документ вообще, а не просто UI
  // прячет) даёт правило в firestore.rules, не эта функция.
  function setPrivate(tripId, noteId, isPrivate) {
    return _ref(tripId).collection('notes').doc(noteId)
      .update({ private: !!isPrivate })
      .catch(e => console.warn('setPrivate:', e));
  }

  // Пометка «Безопасность» постфактум (лист действий заметки в Инфо) —
  // так же, как isTask/private, уже написанную заметку можно пометить.
  function setSafety(tripId, noteId, safety) {
    return _ref(tripId).collection('notes').doc(noteId)
      .update({ safety: !!safety })
      .catch(e => console.warn('setSafety:', e));
  }

  function deleteNote(tripId, noteId) {
    return _ref(tripId).collection('notes').doc(noteId)
      .delete()
      .catch(e => console.warn('deleteNote:', e));
  }

  return { listen, stopListening, addNote, setPinned, setTask, setDone, setPrivate, setSafety, deleteNote };
})();

'use strict';

const NotesFirebase = (() => {

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

  // ВАЖНО: firestore.rules отдаёт read на приватную заметку только автору
  // (resource.data.private != true || createdBy == я) — а для СПИСОЧНОГО
  // запроса ("list") правило не фильтрует документы по одному, оно должно
  // быть доказуемо по самому запросу, иначе Firestore отклоняет ЗАПРОС
  // ЦЕЛИКОМ, как только в коллекции появляется ЧУЖАЯ приватная заметка —
  // не отдельный документ прячется, а падает вся лента у всех участников
  // разом (реальный баг, найден внешним ревью 2026-09-27). Поэтому вместо
  // одного неограниченного query — два, каждый провёрен под свою ветку
  // правила: общие (private == false) и свои (createdBy == я), сведённые
  // на клиенте. Для этого у КАЖДОЙ заметки обязательно должно быть явное
  // поле private (у старых заметок его нет — см. backfillPrivateField).
  let _unsubPublic  = null;
  let _unsubMine    = null;
  let _publicNotes  = [];
  let _mineNotes    = [];

  function _emit() {
    const byId = new Map();
    _publicNotes.forEach(n => byId.set(n._id, n));
    _mineNotes.forEach(n => byId.set(n._id, n));
    const arr = [...byId.values()];
    _callbacks.slice().forEach(cb => cb(arr));
  }

  function listen(tripId, onNotes) {
    if (_tripId !== tripId) {
      stopListening();
      _tripId = tripId;
    }
    _callbacks.push(onNotes);
    _backfillPrivateField(tripId);

    const myUid = window.APP?.user?.uid || null;

    if (!_unsubPublic) {
      _unsubPublic = _ref(tripId).collection('notes')
        .where('private', '==', false)
        .onSnapshot(snap => {
          _publicNotes = [];
          snap.forEach(doc => _publicNotes.push(normalizeNote(doc.data(), doc.id)));
          _emit();
        }, err => console.warn('notes listen (public):', err));
    }
    if (!_unsubMine && myUid) {
      _unsubMine = _ref(tripId).collection('notes')
        .where('createdBy', '==', myUid)
        .onSnapshot(snap => {
          _mineNotes = [];
          snap.forEach(doc => _mineNotes.push(normalizeNote(doc.data(), doc.id)));
          _emit();
        }, err => console.warn('notes listen (own):', err));
    }

    return function unsubscribeOne() {
      const idx = _callbacks.indexOf(onNotes);
      if (idx !== -1) _callbacks.splice(idx, 1);
      if (_callbacks.length === 0) stopListening();
    };
  }

  function stopListening() {
    _callbacks    = [];
    _tripId       = null;
    _publicNotes  = [];
    _mineNotes    = [];
    if (_unsubPublic) { _unsubPublic(); _unsubPublic = null; }
    if (_unsubMine)   { _unsubMine();   _unsubMine   = null; }
  }

  // Одноразовый бэкафилл: у заметок, созданных до фичи приватности, поля
  // private вообще нет, а не false — из-за этого они не попадают в новый
  // query "where('private','==',false)" и пропадают из чужой ленты. Зовётся
  // один раз при первом _ref(tripId) listen() — дёшево (обычно 0 правок
  // после первого раза), безопасно по правилам (update своих же/общих
  // документов, как и раньше).
  // Неограниченный query .collection('notes').get() (было раньше) упирается
  // в то же ограничение правил, что уже чинили для самой ленты (см.
  // комментарий у listen() выше) — Firestore отклоняет ЦЕЛИКОМ list-запрос,
  // если условие правила зависит от resource.data, а сам запрос это не
  // доказывает. where('createdBy','==',myUid) — безопасная, разрешённая
  // правилами ветка (notes.allow read). Чужие старые публичные заметки без
  // поля private чинятся так же, когда их СВОЙ автор откроет эту поездку —
  // рано или поздно такой момент наступает у каждой заметки. И отмечаем
  // tripId как обработанный только ПОСЛЕ успеха (в .then, не сразу) —
  // иначе первая же ошибка (как раз permission-denied от старого
  // неограниченного query) навсегда блокировала повтор в этой сессии.
  // Реальный баг, найден внешним ревью 2026-09-27.
  const _backfilledTrips = new Set();
  function _backfillPrivateField(tripId) {
    if (_backfilledTrips.has(tripId)) return;
    const myUid = window.APP?.user?.uid || null;
    if (!myUid) return;
    _ref(tripId).collection('notes').where('createdBy', '==', myUid).get().then(snap => {
      const batch = firebase.firestore().batch();
      let n = 0;
      snap.forEach(doc => {
        if (!('private' in doc.data())) { batch.update(doc.ref, { private: false }); n++; }
      });
      _backfilledTrips.add(tripId);
      if (n) return batch.commit();
    }).catch(e => console.warn('notes backfill private field:', e));
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
      .then(ref => {
        // В ленту «Что нового» — только не-приватные заметки, иначе личное
        // «только мне» светилось бы всем через ленту в обход самой приватности.
        // noteId — чтобы потом можно было убрать эту запись из ленты, если
        // заметку сделают приватной или удалят (см. setPrivate/deleteNote
        // ниже и ActivityLog.removeByNote).
        if (!isPrivate && typeof ActivityLog !== 'undefined') {
          const preview = text.length > 60 ? text.slice(0, 60) + '…' : text;
          ActivityLog.add(tripId, 'note', `написал заметку: «${preview}»`, { noteId: ref.id });
        }
        return ref.id;
      })
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
      .then(() => {
        // Стала приватной — превью в общей ленте «Что нового» больше не
        // должно быть видно остальным (см. addNote выше). Реальная утечка,
        // найдена внешним ревью 2026-09-27.
        if (isPrivate && typeof ActivityLog !== 'undefined' && ActivityLog.removeByNote) {
          ActivityLog.removeByNote(tripId, noteId);
        }
      })
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
      .then(() => {
        if (typeof ActivityLog !== 'undefined' && ActivityLog.removeByNote) ActivityLog.removeByNote(tripId, noteId);
      })
      .catch(e => console.warn('deleteNote:', e));
  }

  return { listen, stopListening, addNote, setPinned, setTask, setDone, setPrivate, setSafety, deleteNote };
})();

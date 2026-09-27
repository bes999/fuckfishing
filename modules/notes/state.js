'use strict';

const NotesState = (() => {

  const _store = {};

  function _ensure(tripId) {
    if (!_store[tripId]) _store[tripId] = [];
    return _store[tripId];
  }

  // Выполненные задачи — в самый низ (прыгает сразу при отметке, как в
  // остальных чек-листах приложения), внутри остального — закреплённые
  // первыми, дальше свежие сверху.
  function setNotes(tripId, arr) {
    _store[tripId] = arr.slice().sort((a, b) => {
      const aDone = a.isTask && a.done ? 1 : 0;
      const bDone = b.isTask && b.done ? 1 : 0;
      if (aDone !== bDone) return aDone - bDone;
      return (b.pinned - a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || '');
    });
  }

  function getNotes(tripId) {
    return _ensure(tripId);
  }

  return { setNotes, getNotes };
})();

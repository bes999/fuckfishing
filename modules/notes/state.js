'use strict';

const NotesState = (() => {

  const _store = {};

  function _ensure(tripId) {
    if (!_store[tripId]) _store[tripId] = [];
    return _store[tripId];
  }

  // Закреплённые — первыми, дальше свежие сверху.
  function setNotes(tripId, arr) {
    _store[tripId] = arr.slice().sort((a, b) =>
      (b.pinned - a.pinned) || (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function getNotes(tripId) {
    return _ensure(tripId);
  }

  return { setNotes, getNotes };
})();

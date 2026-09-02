'use strict';

const CatchesState = (() => {

  const _store = {};

  // Уловы СРАЗУ ВСЕХ поездок (из CatchesFirebase.listenAll), плоский массив
  // с полем tripId у каждой записи — в отличие от _store выше, наполняется
  // не по одной открытой поездке, а сразу целиком при старте приложения.
  // Нужен для статистики там, где на экране одновременно показываются
  // много поездок (Главная, шапка, список "Планов"), которые пользователь
  // мог ни разу не открывать — а значит, их _store[tripId] пуст.
  let _allCatches = [];

  function _ensure(tripId) {
    if (!_store[tripId]) {
      _store[tripId] = {
        catches: [],
        members: [],
        rivers:  [],
      };
    }
    return _store[tripId];
  }

  // ── Members (из поездки) ─────────────────────────────────────

  function setMembers(tripId, arr) {
    _ensure(tripId).members = arr;
  }

  function getMembers(tripId) {
    return _ensure(tripId).members;
  }

  // ── Rivers (из поездки) ──────────────────────────────────────

  function setRivers(tripId, arr) {
    _ensure(tripId).rivers = arr;
  }

  function getRivers(tripId) {
    return _ensure(tripId).rivers;
  }

  // ── Catches ──────────────────────────────────────────────────

  function setCatches(tripId, arr) {
    _ensure(tripId).catches = arr.slice().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function getCatches(tripId) {
    return _ensure(tripId).catches;
  }

  function addCatch(tripId, entry) {
    _ensure(tripId).catches.unshift(entry);
  }

  function removeCatch(tripId, id) {
    const s = _ensure(tripId);
    s.catches = s.catches.filter(c => c._id !== id);
  }

  // ── Stats ────────────────────────────────────────────────────

  function computeStats(tripId) {
    const catches = getCatches(tripId);

    let total = 0;
    let kept  = 0;
    const byFish   = {};
    const byMember = {};
    const byRiver  = {};

    catches.forEach(c => {
      const count = parseInt(c.count) || 1;
      total += count;
      if (c.kept) kept += count;

      // по виду
      byFish[c.fish] = (byFish[c.fish] || 0) + count;

      // по участнику
      if (c.member) {
        byMember[c.member] = (byMember[c.member] || 0) + count;
      }

      // по реке
      if (c.river) {
        byRiver[c.river] = (byRiver[c.river] || 0) + count;
      }
    });

    const released = total - kept;
    const species  = Object.keys(byFish).length;

    // Отсортированные массивы
    const topFish = Object.entries(byFish)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const topMembers = Object.entries(byMember)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    const topRivers = Object.entries(byRiver)
      .sort((a, b) => b[1] - a[1])
      .map(([name, count]) => ({ name, count }));

    return {
      total, kept, released, species,
      topFish, topMembers, topRivers,
      count: catches.length,
    };
  }

  // ── Глобальная статистика (по всем поездкам сразу) ─────────────

  function setAllCatches(arr) {
    _allCatches = arr || [];
  }

  // { total, list:[{species,count}] } для одной поездки — из глобального
  // кэша, а не из _store (см. комментарий у _allCatches выше).
  function speciesForTrip(tripId) {
    let total = 0;
    const byFish = {};
    _allCatches.forEach(c => {
      if (c.tripId !== tripId) return;
      const count = parseInt(c.count) || 1;
      total += count;
      byFish[c.fish] = (byFish[c.fish] || 0) + count;
    });
    const list = Object.entries(byFish)
      .sort((a, b) => b[1] - a[1])
      .map(([species, count]) => ({ species, count }));
    return { total, list };
  }

  return {
    setMembers, getMembers,
    setRivers,  getRivers,
    setCatches, getCatches,
    addCatch,   removeCatch,
    computeStats,
    setAllCatches, speciesForTrip,
  };
})();

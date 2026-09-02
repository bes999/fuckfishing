'use strict';

// Кэш поездок в памяти — наполняется из TripsFirebase.listen(), читается
// синхронно всеми страницами (Главная, Поездки, обложка, шапка и т.д.),
// как раньше читался localStorage через старый TripsData.
const TripsState = (() => {

  let _trips = [];

  function setTrips(arr) {
    _trips = arr || [];
  }

  // Статус — идёт ли поездка прямо сейчас (между startDate и endDate).
  // Пересчитывается при каждом чтении списка, а не только при сохранении
  // поездки — иначе поездка "upcoming" остаётся такой в интерфейсе и
  // после того, как она уже фактически началась, до первого редактирования.
  function _liveStatus(trip) {
    if (!trip.startDate) return trip.status;
    const now = new Date();
    const start = new Date(trip.startDate);
    const end = new Date(trip.endDate || trip.startDate);
    end.setHours(23, 59, 59, 999);
    if (end < now) return 'done';
    if (start <= now) return 'active';
    return 'upcoming';
  }

  function getAll() {
    _trips.forEach(t => {
      // "done" поездки не трогаем — рейтинг/улов проставляются вручную
      // после возвращения, дата тут не должна ничего перезаписывать.
      if (t.status !== 'done') t.status = _liveStatus(t);
    });
    return _trips;
  }

  function getById(id) {
    return getAll().find(t => t.id === id) || null;
  }

  // Только поездки, где uid реально в участниках (memberIds) — чтобы
  // собственный список/Главная не захламлялись поездками с другой
  // компанией. Профиль (чужая история поездок) сюда не ходит — там
  // специально показывают ВСЕ поездки человека, см. modules/members/render.js.
  function getMine(uid) {
    if (!uid) return [];
    return getAll().filter(t => (t.memberIds || []).includes(uid));
  }

  function getUpcoming(uid) {
    return getMine(uid)
      .filter(t => t.status === 'upcoming' || t.status === 'active')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0] || null;
  }

  function getByYear(uid) {
    const trips = getMine(uid).slice().sort((a, b) =>
      new Date(b.startDate) - new Date(a.startDate)
    );
    const years = {};
    trips.forEach(t => {
      const y = t.startDate.slice(0, 4);
      if (!years[y]) years[y] = [];
      years[y].push(t);
    });
    return years;
  }

  function getCalendarMarkers(uid) {
    const markers = {};
    getMine(uid).forEach(t => {
      const start = new Date(t.startDate);
      const end = new Date(t.endDate);
      let cur = new Date(start);
      while (cur <= end) {
        const key = cur.toISOString().slice(0, 10);
        const isFuture = cur >= new Date();
        markers[key] = {
          type: t.type,
          status: t.status,
          tripId: t.id,
          isFuture
        };
        cur.setDate(cur.getDate() + 1);
      }
    });
    return markers;
  }

  function getYearStats(year, uid) {
    const trips = getMine(uid).filter(t => {
      return t.startDate.startsWith(year) && t.status === 'done';
    });
    let fishCount = 0;
    const species = new Set();
    // trip.fish самой поездки давно не пишется (уловы — Firestore-
    // подколлекция с 2026-08-21) — реальные цифры берём из
    // CatchesState.speciesForTrip, наполненного CatchesFirebase.listenAll.
    trips.forEach(t => {
      if (typeof CatchesState === 'undefined') return;
      const { total, list } = CatchesState.speciesForTrip(t.id);
      fishCount += total;
      list.forEach(f => species.add(f.species));
    });
    return {
      trips: trips.length,
      fish: fishCount,
      species: species.size
    };
  }

  return { setTrips, getAll, getById, getMine, getUpcoming, getByYear, getCalendarMarkers, getYearStats };
})();

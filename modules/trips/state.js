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

  function getUpcoming() {
    const now = new Date();
    return getAll()
      .filter(t => t.status === 'upcoming' || t.status === 'active')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0] || null;
  }

  function getByYear() {
    const trips = getAll().slice().sort((a, b) =>
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

  function getCalendarMarkers() {
    const markers = {};
    getAll().forEach(t => {
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

  function getYearStats(year) {
    const trips = getAll().filter(t => {
      return t.startDate.startsWith(year) && t.status === 'done';
    });
    let fishCount = 0;
    const species = new Set();
    trips.forEach(t => {
      (t.fish || []).forEach(f => {
        fishCount += f.count || 0;
        if (f.species) species.add(f.species);
      });
    });
    return {
      trips: trips.length,
      fish: fishCount,
      species: species.size
    };
  }

  return { setTrips, getAll, getById, getUpcoming, getByYear, getCalendarMarkers, getYearStats };
})();

'use strict';

const TripsData = (() => {

  const KEY = 'ff_trips';

  // Дефолтные данные (Сахалин уже есть)
  const _defaults = {
    trips: [
      {
        id: 'sakhalin2026',
        type: 'expedition',
        name: 'Сахалин 2026',
        startDate: '2026-06-10',
        endDate: '2026-06-17',
        rivers: [
          { name: 'р. Лангери', region: 'Сахалинская обл.' },
          { name: 'р. Буюклинка', region: 'Сахалинская обл.' }
        ],
        participants: ['Дмитрий', 'Андрей', 'Сергей'],
        status: 'upcoming',
        rating: null,
        fish: [],
        comment: '',
        conditions: {},
        readiness: {
          gear: false,
          menu: false,
          shopping: false,
          medkit: false,
          tickets: false,
          route: false
        },
        createdAt: '2026-01-15'
      },
      {
        id: 'oka_march2026',
        type: 'fishing',
        name: 'Ока, 15 марта',
        startDate: '2026-03-15',
        endDate: '2026-03-15',
        rivers: [{ name: 'р. Ока', region: 'Московская обл.' }],
        participants: ['Дмитрий', 'Андрей'],
        status: 'done',
        rating: 7,
        fish: [
          { species: 'Судак', count: 3 },
          { species: 'Щука', count: 1 }
        ],
        comment: '',
        conditions: {},
        readiness: null,
        createdAt: '2026-03-15'
      },
      {
        id: 'senezh_feb2026',
        type: 'fishing',
        name: 'Оз. Сенеж, зимняя',
        startDate: '2026-02-08',
        endDate: '2026-02-08',
        rivers: [{ name: 'Оз. Сенеж', region: 'Московская обл.' }],
        participants: ['Дмитрий'],
        status: 'done',
        rating: 6,
        fish: [{ species: 'Окунь', count: 12 }],
        comment: '',
        conditions: {},
        readiness: null,
        createdAt: '2026-02-08'
      },
      {
        id: 'karelia2025',
        type: 'expedition',
        name: 'Карелия 2025',
        startDate: '2025-11-01',
        endDate: '2025-11-14',
        rivers: [{ name: 'р. Кемь', region: 'Карелия' }],
        participants: ['Дмитрий', 'Андрей'],
        status: 'done',
        rating: 8,
        fish: [
          { species: 'Щука', count: 8 },
          { species: 'Окунь', count: 14 }
        ],
        comment: 'Щука хорошо брала на джиг утром по первым заморозкам.',
        conditions: { temp: '+4°C', wind: 'СЗ 3 м/с', weather: 'дождь' },
        readiness: null,
        createdAt: '2025-10-01'
      },
      {
        id: 'ugra_aug2025',
        type: 'fishing',
        name: 'Угра, сплав',
        startDate: '2025-08-18',
        endDate: '2025-08-19',
        rivers: [{ name: 'р. Угра', region: 'Калужская обл.' }],
        participants: ['Дмитрий'],
        status: 'done',
        rating: 9,
        fish: [
          { species: 'Голавль', count: 6 },
          { species: 'Язь', count: 3 }
        ],
        comment: '',
        conditions: {},
        readiness: null,
        createdAt: '2025-08-18'
      }
    ]
  };

  let _state = null;

  // --- Load ---
  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _state = raw ? JSON.parse(raw) : JSON.parse(JSON.stringify(_defaults));
    } catch(e) {
      _state = JSON.parse(JSON.stringify(_defaults));
    }
    return _state;
  }

  // --- Save ---
  function save() {
    try {
      localStorage.setItem(KEY, JSON.stringify(_state));
    } catch(e) {}
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

  // --- Get all ---
  function getAll() {
    if (!_state) load();
    _state.trips.forEach(t => {
      // "done" поездки не трогаем — рейтинг/улов проставляются вручную
      // после возвращения, дата тут не должна ничего перезаписывать.
      if (t.status !== 'done') t.status = _liveStatus(t);
    });
    return _state.trips;
  }

  // --- Get by id ---
  function getById(id) {
    return getAll().find(t => t.id === id) || null;
  }

  // --- Get upcoming (nearest future trip) ---
  function getUpcoming() {
    const now = new Date();
    return getAll()
      .filter(t => t.status === 'upcoming' || t.status === 'active')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate))[0] || null;
  }

  // --- Get grouped by year ---
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

  // --- Get calendar markers ---
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

  // --- Stats for current year ---
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

  // --- Add trip ---
  function addTrip(trip) {
    if (!_state) load();
    trip.id = trip.id || 'trip_' + Date.now();
    trip.createdAt = new Date().toISOString().slice(0, 10);
    _state.trips.unshift(trip);
    save();
    return trip;
  }

  // --- Update trip ---
  function updateTrip(id, changes) {
    if (!_state) load();
    const idx = _state.trips.findIndex(t => t.id === id);
    if (idx < 0) return null;
    Object.assign(_state.trips[idx], changes);
    save();
    return _state.trips[idx];
  }

  // --- Update readiness ---
  function updateReadiness(tripId, key, val) {
    const trip = getById(tripId);
    if (!trip || !trip.readiness) return;
    trip.readiness[key] = val;
    save();
  }

  // --- Status label ---
  function statusLabel(status) {
    return { upcoming: '⏳ Скоро', active: '🟢 Идёт', done: '✓ Завершена' }[status] || '';
  }

  // --- Status badge class ---
  function statusClass(status) {
    return { upcoming: 'badge-soon', active: 'badge-active', done: 'badge-done' }[status] || 'badge-done';
  }

  return { load, getAll, getById, getUpcoming, getByYear, getCalendarMarkers, getYearStats, addTrip, updateTrip, updateReadiness, statusLabel, statusClass };
})();

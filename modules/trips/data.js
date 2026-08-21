'use strict';

// Фасад над TripsState (синхронный кэш) + TripsFirebase (запись в Firestore).
// Публичный API специально не поменялся относительно старой чисто-localStorage
// версии — все страницы продолжают звать TripsData.getAll()/getById()/... как
// раньше, синхронно; данные под капотом теперь настоящие и общие для всех
// устройств/участников, а не заперты в localStorage одного браузера.
const TripsData = (() => {

  const KEY = 'ff_trips';
  const MIGRATED_KEY = 'ff_trips_migrated_v1';

  // Дефолтные данные — используются только как источник для одноразовой
  // миграции, если в этом браузере ещё не было ни одного запуска с Firestore
  // и localStorage тоже пуст (самый первый запуск приложения когда-либо).
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

  // --- Одноразовая миграция localStorage → Firestore ---
  // Заливает в Firestore те локальные поездки, которых там ещё нет (по id).
  // Идемпотентна: повторный вызов при уже стоящем флаге ничего не делает.
  function migrateFromLocalStorage() {
    if (localStorage.getItem(MIGRATED_KEY)) return Promise.resolve();

    let local;
    try {
      const raw = localStorage.getItem(KEY);
      local = raw ? JSON.parse(raw).trips : _defaults.trips;
    } catch (e) {
      local = _defaults.trips;
    }
    if (!Array.isArray(local)) local = [];

    const existingIds = new Set(TripsState.getAll().map(t => t.id));
    const missing = local.filter(t => t && t.id && !existingIds.has(t.id));

    if (!missing.length) {
      localStorage.setItem(MIGRATED_KEY, '1');
      return Promise.resolve();
    }

    return Promise.all(missing.map(t => TripsFirebase.addTrip(t)))
      .then(() => { localStorage.setItem(MIGRATED_KEY, '1'); })
      .catch(e => { console.warn('trips migration:', e); });
  }

  // --- Одноразовый бэкафилл ownerId (роли на уровне поездки) ---
  // Поездки, созданные до появления этого поля (включая все мигрированные
  // из localStorage), становятся "твоими" — назначаем текущего пользователя
  // организатором. Идемпотентно само по себе: условие — отсутствие поля,
  // отдельный флаг не нужен.
  function backfillOwnerId() {
    const uid = window.APP?.user?.uid;
    if (!uid) return Promise.resolve();
    const missing = TripsState.getAll().filter(t => !t.ownerId);
    if (!missing.length) return Promise.resolve();
    return Promise.all(missing.map(t => TripsFirebase.updateTrip(t.id, { ownerId: uid })))
      .catch(e => { console.warn('trips backfillOwnerId:', e); });
  }

  // --- Чтение — синхронно, из кэша (TripsState) ---
  function getAll()             { return TripsState.getAll(); }
  function getById(id)          { return TripsState.getById(id); }
  function getUpcoming()        { return TripsState.getUpcoming(); }
  function getByYear()          { return TripsState.getByYear(); }
  function getCalendarMarkers() { return TripsState.getCalendarMarkers(); }
  function getYearStats(year)   { return TripsState.getYearStats(year); }

  // --- Запись — асинхронно, через Firestore ---
  function addTrip(trip) {
    trip.id = trip.id || 'trip_' + Date.now();
    trip.createdAt = trip.createdAt || new Date().toISOString().slice(0, 10);
    return TripsFirebase.addTrip(trip);
  }

  function updateTrip(id, changes) {
    return TripsFirebase.updateTrip(id, changes);
  }

  function updateReadiness(tripId, key, val) {
    const trip = getById(tripId);
    if (!trip || !trip.readiness) return Promise.resolve();
    trip.readiness[key] = val;
    return TripsFirebase.updateTrip(tripId, { readiness: trip.readiness });
  }

  // --- Добавить человека в участники поездки (инвайт-ссылка, пикер из
  // профиля и т.д. — общая точка входа, чтобы не дублировать логику
  // "заменить строку-имя на uid или дописать новое имя" в разных местах) ---
  function addParticipant(tripId, { uid, name } = {}) {
    const trip = getById(tripId);
    if (!trip) return Promise.reject(new Error('trip not found'));

    const participants = trip.participants || [];
    const memberIds = trip.memberIds || [];
    if (uid && memberIds.includes(uid)) return Promise.resolve(trip);

    const nameAlreadyListed = name && participants.some(p => p.toLowerCase() === name.toLowerCase());
    const newParticipants = (nameAlreadyListed || !name) ? participants : [...participants, name];
    const newMemberIds = uid ? [...new Set([...memberIds, uid])] : memberIds;

    return TripsFirebase.updateTrip(tripId, { participants: newParticipants, memberIds: newMemberIds });
  }

  // --- Status label ---
  function statusLabel(status) {
    return { upcoming: '⏳ Скоро', active: '🟢 Идёт', done: '✓ Завершена' }[status] || '';
  }

  // --- Status badge class ---
  function statusClass(status) {
    return { upcoming: 'badge-soon', active: 'badge-active', done: 'badge-done' }[status] || 'badge-done';
  }

  return {
    migrateFromLocalStorage, backfillOwnerId,
    getAll, getById, getUpcoming, getByYear, getCalendarMarkers, getYearStats,
    addTrip, updateTrip, updateReadiness, addParticipant,
    statusLabel, statusClass,
  };
})();

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
        participants: [{ name: 'Дмитрий', uid: null }, { name: 'Андрей', uid: null }, { name: 'Сергей', uid: null }],
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
        participants: [{ name: 'Дмитрий', uid: null }, { name: 'Андрей', uid: null }],
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
        participants: [{ name: 'Дмитрий', uid: null }],
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
        participants: [{ name: 'Дмитрий', uid: null }, { name: 'Андрей', uid: null }],
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
        participants: [{ name: 'Дмитрий', uid: null }],
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
  function getMine(uid)         { return TripsState.getMine(uid); }
  function getUpcoming(uid)        { return TripsState.getUpcoming(uid); }
  function getByYear(uid)          { return TripsState.getByYear(uid); }
  function getCalendarMarkers(uid) { return TripsState.getCalendarMarkers(uid); }
  function getYearStats(year, uid) { return TripsState.getYearStats(year, uid); }

  // Имена участников как плоский массив строк — participants сам по себе
  // {name, uid}[] (см. миграцию схемы), но многим местам (заголовки,
  // счётчики, пикеры "участвует в расходе/улове") нужны просто имена.
  // Общий аксессор рядом со схемой вместо .map(p=>p.name) в каждом месте.
  function participantNames(trip) {
    return (trip?.participants || []).map(p => p.name);
  }

  // --- Запись — асинхронно, через Firestore ---
  function addTrip(trip) {
    trip.id = trip.id || 'trip_' + Date.now();
    trip.createdAt = trip.createdAt || new Date().toISOString().slice(0, 10);
    return TripsFirebase.addTrip(trip);
  }

  function updateTrip(id, changes) {
    return TripsFirebase.updateTrip(id, changes);
  }

  // Готовность к поездке — свободный список пунктов под конкретную поездку
  // (id/label/done), не фиксированный набор из 6 ключей: у разных поездок
  // реально разные сборы (канистры для катера/бронь домика вместо билетов,
  // если добираешься сам). DEFAULT_READINESS_ITEMS — только стартовый
  // шаблон для НОВОЙ экспедиции, дальше список редактируется свободно
  // (см. modules/tripcover/index.js _readiness).
  const DEFAULT_READINESS_ITEMS = [
    { id: 'gear',     label: 'Список снаряжения' },
    { id: 'menu',     label: 'Меню составлено'   },
    { id: 'shopping', label: 'Список закупки'     },
    { id: 'medkit',   label: 'Аптечка'            },
    { id: 'tickets',  label: 'Билеты куплены'     },
    { id: 'route',    label: 'Маршрут согласован' },
  ];
  function getDefaultReadiness() {
    return DEFAULT_READINESS_ITEMS.map(it => ({ ...it, done: false }));
  }

  function updateReadiness(tripId, itemId, val) {
    const trip = getById(tripId);
    if (!trip || !Array.isArray(trip.readiness)) return Promise.resolve();
    const item = trip.readiness.find(it => it.id === itemId);
    if (!item) return Promise.resolve();
    item.done = val;
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

    const matchIdx = name ? participants.findIndex(p => p.name.toLowerCase() === name.toLowerCase()) : -1;
    let newParticipants;
    if (matchIdx >= 0) {
      // Уже в списке под этим именем — если только что выдали uid (был
      // гостем без аккаунта, теперь привязан к реальному), бэкфиллим его
      // и сюда, а не только в memberIds ниже. Иначе следующий Save в
      // редакторе поездки пересчитает memberIds из participants[].uid
      // (см. modules/trips/index.js:_save) и тихо выкинет этого человека
      // обратно в гости, хотя memberIds только что дали ему доступ.
      newParticipants = (uid && !participants[matchIdx].uid)
        ? participants.map((p, i) => i === matchIdx ? { ...p, uid } : p)
        : participants;
    } else if (name) {
      newParticipants = [...participants, { name, uid: uid || null }];
    } else {
      newParticipants = participants;
    }
    const newMemberIds = uid ? [...new Set([...memberIds, uid])] : memberIds;

    return TripsFirebase.updateTrip(tripId, { participants: newParticipants, memberIds: newMemberIds });
  }

  // --- Добавить сразу несколько гостей без аккаунта одним запросом (вставка
  // через запятую/перенос строки — см. modules/tripcover/index.js). Гости
  // никогда не несут uid, так что тут нет той гонки чтения-записи, которую
  // решает последовательность в addParticipant — считаем дедуп по всему
  // списку локально и пишем один раз. ---
  function addGuestNames(tripId, names) {
    const trip = getById(tripId);
    if (!trip) return Promise.reject(new Error('trip not found'));

    const participants = trip.participants || [];
    const seen = new Set(participants.map(p => p.name.toLowerCase()));
    const additions = [];
    names.forEach(name => {
      const trimmed = String(name || '').trim();
      const key = trimmed.toLowerCase();
      if (!key || seen.has(key)) return;
      seen.add(key);
      additions.push({ name: trimmed, uid: null });
    });
    if (!additions.length) return Promise.resolve(trip);

    return TripsFirebase.updateTrip(tripId, { participants: [...participants, ...additions] });
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
    getAll, getById, getMine, getUpcoming, getByYear, getCalendarMarkers, getYearStats, participantNames,
    addTrip, updateTrip, updateReadiness, getDefaultReadiness, addParticipant, addGuestNames,
    statusLabel, statusClass,
  };
})();

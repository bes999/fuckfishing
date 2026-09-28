'use strict';

// Фасад над TripsState (синхронный кэш) + TripsFirebase (запись в Firestore).
// Публичный API специально не поменялся относительно старой чисто-localStorage
// версии — все страницы продолжают звать TripsData.getAll()/getById()/... как
// раньше, синхронно; данные под капотом теперь настоящие и общие для всех
// устройств/участников, а не заперты в localStorage одного браузера.
const TripsData = (() => {

  const KEY = 'ff_trips';
  const MIGRATED_KEY = 'ff_trips_migrated_v1';

  // --- Одноразовая миграция localStorage → Firestore ---
  // Заливает в Firestore те локальные поездки, которых там ещё нет (по id).
  // Идемпотентна: повторный вызов при уже стоящем флаге ничего не делает.
  //
  // Раньше при пустом localStorage (новый браузер/устройство, приватное
  // окно, очищенные данные сайта — а не обязательно "самый первый запуск
  // вообще") сюда подставлялся встроенный набор ДЕМО-поездок (Сахалин 2026
  // и т.п.) как источник миграции — и любую из них, если её в этот момент
  // нет в Firestore, код создавал заново. Поездку, которую реально удалили
  // (см. TripsData.deleteTrip), новый браузер/устройство воскрешал молча —
  // Firestore уже давно единственный источник правды, а не запасной путь
  // на "первый запуск когда-либо", которым эта миграция была нужна только
  // в момент самого перехода с localStorage (см. project_trips_firestore_
  // foundation в памяти, 2026-08-21). Реальный баг, найден внешним ревью
  // 2026-09-27. Пустой localStorage теперь значит просто "мигрировать
  // нечего", а не "подставить демо-данные".
  function migrateFromLocalStorage() {
    if (localStorage.getItem(MIGRATED_KEY)) return Promise.resolve();

    let local;
    try {
      const raw = localStorage.getItem(KEY);
      local = raw ? JSON.parse(raw).trips : [];
    } catch (e) {
      local = [];
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

  // Какие приёмы пищи планируем в этой поездке — trip.mealsPlanned, массив
  // id из MenuData.getMeals() ('breakfast'/'snack'/'lunch'/'dinner'). Поля
  // нет — старое поведение, планируем все четыре (не мигрируем молча все
  // существующие поездки записью, просто трактуем отсутствие как "все").
  // [] — меню в поездке осознанно не планируется. Общий аксессор, чтобы
  // Меню/Главная/импорт плана не дублировали дефолт по отдельности.
  function plannedMeals(trip) {
    if (trip && Array.isArray(trip.mealsPlanned)) return trip.mealsPlanned.slice();
    return typeof MenuData !== 'undefined' ? MenuData.getMeals().map(m => m.id) : ['breakfast', 'snack', 'lunch', 'dinner'];
  }

  // Как participantNames, но без тех, кто отмечен dutyExempt (дети,
  // пожилые, гости-однодневки — участвуют в поездке, но не должны
  // попадать ни в дропдаун назначения дежурства, ни в авто-подбор). Для
  // всего остального (явка, расходы, улов) участник остаётся обычным —
  // используют participantNames как раньше, не этот аксессор.
  function dutyEligibleNames(trip) {
    return (trip?.participants || []).filter(p => !p.dutyExempt).map(p => p.name);
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

  // Насовсем — сама поездка и все её уловы/расходы/меню/закупка/etc (см.
  // TripsFirebase.deleteTrip). Локальный кэш (TripsState) ничего трогать
  // не нужно — тот же паттерн, что addTrip/updateTrip выше: приходит
  // само, следующим снапшотом от уже активной live-подписки trips.
  //
  // Остальных участников (кроме того, кто удалил) уведомляем через бота —
  // очередь в trip_deletions, тот же принцип, что у пинга "Готово" в Cook
  // Mode (см. modules/menu/firebase.js saveCookDone): клиенту нельзя
  // слать в Telegram напрямую, бот вычитывает отдельным поллингом (см.
  // bot/src/reminders.js checkTripDeletions). Пишем это ПОСЛЕ успешного
  // удаления, не до — иначе при сбое удаления улетело бы ложное "удалено".
  // Может управлять поездкой (править, удалять, чистить чужие записи):
  // её создатель (trip.ownerId) или суперадмин приложения
  // (members/{uid}.role === 'organizer' — см. firestore.rules isOrganizer).
  // Иконка поездки (trip.icon, выбирается в мастере). Цвет плитки всё
  // равно по типу — иконка только разнообразит список. Без выбора —
  // как раньше: гора у экспедиции, рыбка у рыбалки.
  const TRIP_ICONS = ['mountain', 'fishing', 'fish-hook', 'tent', 'speedboat', 'snowflake',
    'trees', 'flame', 'anchor', 'car', 'plane', 'compass', 'sun', 'ripple', 'flag', 'trophy'];
  function tripIcon(trip) {
    if (trip?.icon && TRIP_ICONS.includes(trip.icon)) return trip.icon;
    return trip?.type === 'expedition' ? 'mountain' : 'fishing';
  }

  // Сколько дней до даты 'YYYY-MM-DD' по местному календарю (0 — сегодня).
  // Раньше каждый экран считал сам через new Date('YYYY-MM-DD') — это
  // полночь UTC, т.е. 03:00 по Москве, и ночью/утром выходило на день
  // больше: обложка писала «через 4 дня», а шапка Гида «через 3».
  function daysUntil(dateStr) {
    if (!dateStr) return 0;
    const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
    const target = new Date(y, m - 1, d);
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  function canManage(trip) {
    const uid = window.APP?.user?.uid;
    if (!uid || !trip) return false;
    if (trip.ownerId === uid) return true;
    return typeof AuthActions !== 'undefined' && AuthActions.isOrganizer();
  }

  function deleteTrip(id) {
    const trip = getById(id);
    const uid = window.APP?.user?.uid || null;
    return TripsFirebase.deleteTrip(id, uid).then(() => {
      const memberIds = (trip?.memberIds || []).filter(m => m && m !== uid);
      if (!memberIds.length) return;
      const deletedByName = window.APP?.profile?.displayName || 'Участник';
      firebase.firestore().collection('trip_deletions').add({
        tripName: trip?.name || 'Поездка',
        deletedByName,
        memberIds,
        sent: false,
        createdAt: new Date().toISOString(),
      }).catch(() => {});
    });
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
  // Реальная запись — транзакция на свежих серверных данных, см.
  // TripsFirebase.addParticipant (защита от гонки при одновременном
  // вступлении двух человек по одной ссылке). Здесь просто делегируем и
  // ждём подписку (listen) на обновление локального кэша — тот же
  // оптимистичный паттерн, что и у остального data.js, просто без ручной
  // мутации локального объекта, раз источник правды теперь транзакция.
  function addParticipant(tripId, { uid, name } = {}) {
    if (!getById(tripId)) return Promise.reject(new Error('trip not found'));
    return TripsFirebase.addParticipant(tripId, { uid, name });
  }

  // --- Добавить сразу несколько гостей без аккаунта одним запросом (вставка
  // через запятую/перенос строки — см. modules/tripcover/index.js). Раньше
  // писало participants целиком по ЛОКАЛЬНОЙ (возможно устаревшей) копии —
  // недавно вступивший по ссылке человек, которого эта копия ещё не
  // видела, при этом пропадал из списка участников (доступ оставался,
  // uid в memberIds эта запись не трогает). Реальный баг, найден внешним
  // ревью 2026-09-27. Реальная запись — транзакция на свежих серверных
  // данных, см. TripsFirebase.addGuestNames (тот же приём, что и у
  // addParticipant). ---
  function addGuestNames(tripId, names) {
    if (!getById(tripId)) return Promise.reject(new Error('trip not found'));
    return TripsFirebase.addGuestNames(tripId, names);
  }

  // --- Ссылка-приглашение: случайный токен на самой поездке, а не просто
  // id (id не секрет и никогда не меняется — им мог воспользоваться кто
  // угодно, зная/подобрав его, и отозвать было нечем). ensureInviteToken —
  // ленивая генерация при первом запросе ссылки (см. MembersRender.showInvite
  // / TripcoverIndex._showInviteSheet); раньше это было простое get-then-set
  // по локальной копии — если два устройства ОДНОВРЕМЕННО впервые открывали
  // лист приглашения, оба генерировали РАЗНЫЕ токены, и уже показанная на
  // первом устройстве ссылка сразу становилась недействительной после
  // второй записи. Реальный баг, найден внешним ревью 2026-09-27. Реальная
  // запись — транзакция на свежих серверных данных, см.
  // TripsFirebase.ensureInviteToken (тот же приём, что и addParticipant).
  // regenerateInviteToken — явный отзыв (гонка тут не страшна, это
  // намеренная перезапись): все прежде разосланные ссылки сразу перестают
  // работать; вызывается автоматически при исключении участника (см.
  // modules/trips/index.js _save), чтобы вышедший не мог вернуться по
  // старой ссылке.
  function _genInviteToken() {
    return Math.random().toString(36).slice(2) + Date.now().toString(36);
  }
  function ensureInviteToken(tripId) {
    const trip = getById(tripId);
    if (!trip) return Promise.reject(new Error('trip not found'));
    if (trip.inviteToken) return Promise.resolve(trip.inviteToken);
    return TripsFirebase.ensureInviteToken(tripId);
  }
  function regenerateInviteToken(tripId) {
    const token = _genInviteToken();
    return TripsFirebase.updateTrip(tripId, { inviteToken: token }).then(() => token);
  }

  // --- Status label ---
  function statusLabel(status) {
    return { upcoming: '' + UIUtils.ico('hourglass') + ' Скоро', active: '' + UIUtils.ico('player-play') + ' Идёт', done: '' + UIUtils.ico('check') + ' Завершена' }[status] || '';
  }

  // --- Status badge class ---
  function statusClass(status) {
    return { upcoming: 'badge-soon', active: 'badge-active', done: 'badge-done' }[status] || 'badge-done';
  }

  return {
    migrateFromLocalStorage, backfillOwnerId,
    getAll, getById, getMine, getUpcoming, getByYear, getCalendarMarkers, getYearStats, participantNames, dutyEligibleNames, plannedMeals,
    addTrip, updateTrip, deleteTrip, canManage, daysUntil, tripIcon, TRIP_ICONS, updateReadiness, getDefaultReadiness, addParticipant, addGuestNames,
    ensureInviteToken, regenerateInviteToken,
    statusLabel, statusClass,
  };
})();

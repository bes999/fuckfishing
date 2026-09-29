'use strict';

const MenuRender = (() => {

  let _el      = null;
  let _tripId  = null;
  let _days    = [];
  // Выбранный в полосе дней день. Сбрасывается на "сегодня" (или первый
  // день поездки) только при открытии Меню для другой поездки — снапшоты
  // из Firestore не должны уводить пользователя с дня, который он смотрит.
  let _selDayId      = null;
  let _selForTrip    = null;
  let _attCollapsed  = false; // "свернуть" у карточки "Кто ест" — локально, на сессию

  // Названия блюд идут из свободного текста (своих рецептов, см.
  // modules/recipes/render.js #rec-add-name, и "своих блюд" из пикера) и
  // попадают сюда через innerHTML — без экранирования кавычка в названии
  // ломает атрибут (data-name и т.п.) и внедряет произвольный HTML.
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // Иконок поиска и замены нет в урезанном шрифте Tabler (shared/fonts) —
  // рисуем inline-SVG тем же штрихом, что и макет.
  const SVG_SEARCH = '<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>';
  const SVG_SWAP   = '<path d="M4 8h13l-3-3M20 16H7l3 3"/>';
  function _svgIco(paths) {
    return `<svg class="mn-svg-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
  }

  // ── Даты ────────────────────────────────────────────────────────────────
  const WD_SHORT = ['вс', 'пн', 'вт', 'ср', 'чт', 'пт', 'сб'];
  const WD_LONG  = ['воскресенье', 'понедельник', 'вторник', 'среда', 'четверг', 'пятница', 'суббота'];
  const MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня',
                      'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
  // Короткая дата для ленты активности («3 окт»), тот же набор сокращений,
  // что у ActivityLog.ago (shared/activity.js).
  const MONTHS_SHORT = ['янв', 'фев', 'мар', 'апр', 'мая', 'июн', 'июл', 'авг', 'сен', 'окт', 'ноя', 'дек'];
  function _shortDate(day) {
    if (!day?.date) return '';
    const d = _parseISO(day.date);
    return `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]}`;
  }

  // day.date — 'YYYY-MM-DD'. Парсим как локальную дату, а не через
  // new Date(iso) (тот читает строку как UTC-полночь и в западных поясах
  // съезжает на день назад).
  function _parseISO(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    return new Date(y, (m || 1) - 1, d || 1);
  }
  function _todayISO() {
    const n = new Date();
    return `${n.getFullYear()}-${String(n.getMonth() + 1).padStart(2, '0')}-${String(n.getDate()).padStart(2, '0')}`;
  }
  // "пятница, 18 сентября"
  function _dayLong(day) {
    if (!day?.date) return day?.label || '';
    const d = _parseISO(day.date);
    return `${WD_LONG[d.getDay()]}, ${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  }
  // "Пятница, 18 сентября"
  function _dayTitle(day) {
    const s = _dayLong(day);
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  // Свежие данные — после снапшота Firestore MenuState держит уже НОВЫЙ
  // массив days, а замкнутые в обработчиках ссылки на старые объекты дня/
  // приёма устаревают. Всё, что пишет, читает через эти хелперы.
  function _curDays() { return MenuState.getDays(_tripId) || _days; }
  function _findDay(dayId) { return _curDays().find(d => d.id === dayId) || null; }
  function _findMeal(dayId, mealId) { return _findDay(dayId)?.meals?.[mealId] || null; }
  function _trip() { return typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null; }

  // Кэш профилей участников (для аллергий в Cook Mode) — тот же паттерн
  // TTL-кэша поверх разового MembersFirebase.getAllMembers(), что уже
  // используется в modules/medkit/render.js, но свой: Меню и Аптечка —
  // разные модули, тянуть приватный кэш соседнего модуля не стоит.
  let _membersCache = null;
  let _membersFetchedAt = 0;
  let _membersLoading = false;
  const MEMBERS_CACHE_TTL_MS = 60000;
  // Если Cook Mode уже открыт в момент, когда холодный кэш только грузится
  // (самое первое открытие в сессии), аллергии молча не покажутся — сам
  // синхронный рендер overlay уже прошёл до того, как прогрузился fetch.
  // Держим id текущего открытого приёма и перерисовываем overlay заново,
  // когда кэш догружается — та же идея, что rMedkit() в medkit/render.js.
  let _cookModeOpenFor = null;
  // Отмеченные в Cook Mode продукты — локально, не синхронизируется (см.
  // _showCookMode). Вынесено из overlay, чтобы перерисовка (догрузились
  // аллергии, назначили уборку прямо из режима готовки) не сбрасывала
  // уже поставленные галочки.
  let _cmChecked = new Set();
  function _getMembersCached() {
    const stale = !_membersCache || (Date.now() - _membersFetchedAt) > MEMBERS_CACHE_TTL_MS;
    if (stale && !_membersLoading && typeof MembersFirebase !== 'undefined') {
      _membersLoading = true;
      MembersFirebase.getAllMembers().then(members => {
        _membersCache = members || [];
        _membersFetchedAt = Date.now();
        _membersLoading = false;
        if (_cookModeOpenFor) _showCookMode(_cookModeOpenFor.dayId, _cookModeOpenFor.mealId);
      }).catch(() => { _membersLoading = false; });
    }
    return _membersCache || [];
  }

  // Аллергии участников поездки — предупреждение в Cook Mode. Список,
  // не привязка к явке: лучше перестраховаться и показать аллергию
  // человека, который в итоге не пришёл на этот приём, чем один раз не
  // показать того, кто пришёл.
  function _allergyWarnings() {
    const trip = _trip();
    const byUid = new Map(_getMembersCached().map(m => [m.uid, m]));
    return (trip?.participants || [])
      .map(p => byUid.get(p.uid))
      .filter(m => m && m.allergies)
      .map(m => ({ name: m.displayName || 'Участник', allergies: m.allergies }));
  }

  // ── Каркас ──────────────────────────────────────────────────────────────
  // #mn-wrap — единственный узел, который перерисовывают _rerender()/*Body —
  // листы (см. _openSheet) вставляются как СОСЕДИ #mn-wrap внутри _el, а не
  // внутрь него, поэтому перерисовка тела не сносит открытый лист (важно
  // для листа "какие приёмы планируем" — он сам себя перерисовывает после
  // каждого тычка и дёргает _rerender() у фона).
  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    if (_selForTrip !== tripId) { _selDayId = null; _selForTrip = tripId; }
    _ensureSelectedDay();
    el.innerHTML = `<div class="mn-wrap" id="mn-wrap">${_renderBody()}</div>`;
    _bindEvents();
    _centerSelectedInStrip();
  }

  // Тело экрана — либо обычный вид (полоса дней + карточки приёмов), либо,
  // если в поездке осознанно выключены все приёмы (trip.mealsPlanned = []),
  // карточка-заглушка вместо дней целиком.
  function _renderBody() {
    const planned = TripsData.plannedMeals(_trip());
    if (!planned.length) {
      return `
        ${_topbar()}
        <div id="mn-meals-row">${_renderMealsPlannedRow()}</div>
        ${_renderNoPlanCard()}`;
    }
    return `
      ${_topbar()}
      <div id="mn-strip-wrap">${_renderStrip()}</div>
      <div id="mn-meals-row">${_renderMealsPlannedRow()}</div>
      <div class="mn-day" id="mn-day">${_renderDayView()}</div>`;
  }

  // Меню открывается на сегодняшнем дне, если сегодня внутри дат поездки
  // (отдельная карточка "Меню на сегодня" больше не нужна), иначе — на
  // первом дне. Если выбранного дня больше нет (даты поездки поменяли) —
  // та же логика заново.
  function _ensureSelectedDay() {
    if (_selDayId && _days.some(d => d.id === _selDayId)) return;
    const today = _days.find(d => d.date === _todayISO());
    _selDayId = (today || _days[0])?.id || null;
  }

  function _topbar() {
    const trip = _trip();
    const sub  = trip ? `${trip.name} · ${_days.length} дней` : '';
    return `
      <div class="mn-topbar">
        <button class="mn-back" id="mn-back" data-action="back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="mn-topbar__text">
          <div class="mn-topbar__title">Меню</div>
          ${sub ? `<div class="mn-topbar__sub">${_esc(sub)}</div>` : ''}
        </div>
      </div>`;
  }

  // ── Полоса дней ─────────────────────────────────────────────────────────
  // День недели + число + точка заполненности (зелёная — всё выбрано,
  // голубая — частично, без точки — пусто). Сегодня — акцентный день
  // недели, выбранный — залитый акцентом.
  function _renderStrip() {
    if (!_days.length) return '';
    const todayISO = _todayISO();
    const planned = TripsData.plannedMeals(_trip());
    const btns = _days.map(day => {
      const d = _parseISO(day.date);
      const on = day.id === _selDayId;
      const status = MenuState.getDayStatus(_tripId, day.id, planned);
      const cls = ['mn-strip-day', on ? 'on' : '', day.date === todayISO ? 'today' : ''].filter(Boolean).join(' ');
      return `
        <button type="button" class="${cls}" data-action="select-day" data-day="${day.id}"
          aria-pressed="${on ? 'true' : 'false'}" aria-label="${_esc(_dayLong(day))}">
          <span class="mn-strip-wd">${WD_SHORT[d.getDay()]}</span>
          <span class="mn-strip-num">${d.getDate()}</span>
          <span class="mn-strip-dot ${status}"></span>
        </button>`;
    }).join('');
    return `<div class="mn-strip" id="mn-strip">${btns}</div>`;
  }

  function _centerSelectedInStrip() {
    const strip = _el?.querySelector('#mn-strip');
    const btn = strip?.querySelector('.mn-strip-day.on');
    if (!strip || !btn) return;
    strip.scrollLeft = Math.max(0, btn.offsetLeft - strip.clientWidth / 2 + btn.offsetWidth / 2);
  }

  // ── Выбранный день ──────────────────────────────────────────────────────
  function _renderDayView() {
    if (!_days.length) return `
      <div class="mn-empty">
        <div class="mn-empty__icon">${UIUtils.ico('tools-kitchen-2')}</div>
        <div class="mn-empty__title">Дней пока нет</div>
        <div class="mn-empty__sub">Меню появится, когда у поездки будут известны даты</div>
      </div>`;

    const day = _days.find(d => d.id === _selDayId) || _days[0];
    const trip = _trip();
    const isToday = day.date === _todayISO();
    const plannedMeals = MenuData.getMeals().filter(m => TripsData.plannedMeals(trip).includes(m.id));
    const hasAny = plannedMeals.some(m => (day.meals[m.id]?.slots || []).some(s => s.item));

    const head = `
      <div class="mn-day-head">
        <div class="mn-day-head__text">
          <span class="mn-day-eyebrow ${isToday ? 'today' : ''}">${isToday ? 'Сегодня' : `День ${day.num} из ${_days.length}`}</span>
          <span class="mn-day-title">${_esc(_dayTitle(day))}</span>
        </div>
        ${hasAny ? `
        <button type="button" class="mn-day-cart" data-action="push-day" data-day="${day.id}"
          aria-label="Ингредиенты всего дня — в закупку" title="Ингредиенты всего дня — в закупку">
          ${UIUtils.ico('shopping-cart')}
        </button>` : ''}
      </div>`;

    const attendance = trip?.attendanceEnabled ? _renderAttendanceCard(day, trip) : '';
    const meals = plannedMeals.map(m => _renderMeal(day, m)).join('');

    return `
      ${head}
      ${attendance}
      ${meals}
      ${_attendanceToggleRow()}
      <div class="mn-hint">Нажми на блюдо — рецепт, в закупку, заменить или убрать</div>`;
  }

  // Явка — опциональная (trip.attendanceEnabled), по умолчанию выключена:
  // тот же паттерн, что trip.inviteRestricted — простой булев флаг прямо
  // на документе поездки. Пользователь явно попросил именно "включать по
  // надобности", а не всегда — маленькие компании обычно и так знают, кто
  // где, и не хотят полдня отмечаться в приложении.
  function _attendanceToggleRow() {
    const on = !!_trip()?.attendanceEnabled;
    return `
      <button type="button" class="mn-att-toggle" data-action="toggle-attendance-enabled"
        role="switch" aria-checked="${on ? 'true' : 'false'}">
        <span class="mn-att-toggle__text">
          <span class="mn-att-toggle__title">Явка на приёмы пищи</span>
          <span class="mn-att-toggle__sub">отмечать, кто ест, — чтобы знать, на сколько готовить</span>
        </span>
        <span class="mn-switch ${on ? 'on' : ''}" aria-hidden="true"><span></span></span>
      </button>`;
  }

  // ── Какие приёмы пищи планируем ────────────────────────────────────────
  // Компактная строка под полосой дней — перечисляет включённые приёмы
  // (или "ничего", если поездка сознательно без меню). Тап открывает лист
  // с независимыми чекбоксами (см. _showMealsPlannedSheet).
  function _renderMealsPlannedRow() {
    const trip = _trip();
    if (!trip) return '';
    const planned = TripsData.plannedMeals(trip);
    const label = planned.length
      ? MenuData.getMeals().filter(m => planned.includes(m.id)).map(m => m.label.toLowerCase()).join(', ')
      : 'ничего';
    return `
      <button type="button" class="mn-mealsplan-row" data-action="edit-meals-planned">
        <span class="mn-mealsplan-row__text">Планируем: ${_esc(label)}</span>
        ${UIUtils.ico('chevron-right', 'mn-mealsplan-row__chev')}
      </button>`;
  }

  // Заглушка вместо дней, когда в поездке ни один приём пищи не планируется
  // (trip.mealsPlanned = []) — дни меню всё равно существуют в данных
  // (ничего не удаляем), просто не показываем их, пока планирование снова
  // не включат.
  function _renderNoPlanCard() {
    return `
      <div class="mn-empty">
        <div class="mn-empty__icon">${UIUtils.ico('tools-kitchen-2')}</div>
        <div class="mn-empty__title">Меню в этой поездке не планируем</div>
        <button type="button" class="mn-btn-primary mn-noplan-btn" data-action="edit-meals-planned">Включить планирование</button>
      </div>`;
  }

  // Лист "какие приёмы пищи планируем" — 4 независимых круглых чекбокса
  // (не радио: любой набор допустим, вплоть до одного ужина) + ссылка
  // "Меню не планируем" снизу, которая снимает все разом. Пишет узкое поле
  // trip.mealsPlanned сразу на каждый тычок (тот же паттерн, что и
  // toggle-attendance-enabled ниже) — сохранять отдельной кнопкой незачем,
  // тут нечего "отменить" перед уходом.
  function _showMealsPlannedSheet() {
    const trip = _trip();
    if (!trip) return;
    const allMeals = MenuData.getMeals();
    let planned = new Set(TripsData.plannedMeals(trip));

    function _persist() {
      const arr = allMeals.filter(m => planned.has(m.id)).map(m => m.id);
      // Снапшот поездок подменяет объект trip после каждой записи — ставим
      // и в захваченный, и в текущий, иначе второй тык рисовал старое.
      trip.mealsPlanned = arr;
      const cur = _trip();
      if (cur) cur.mealsPlanned = arr;
      TripsData.updateTrip(_tripId, { mealsPlanned: arr });
      _rerender();
    }

    function _body() {
      const rows = allMeals.map(m => {
        const on = planned.has(m.id);
        return `
          <button type="button" class="mn-mealplan-row" data-sh="toggle" data-meal="${m.id}">
            <span class="mn-check ${on ? 'on' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}">${UIUtils.ico('check')}</span>
            <span class="mn-mealplan-row__label">${_esc(m.label)}</span>
          </button>`;
      }).join('');
      return `
        <div class="mn-mealplan-list">${rows}</div>
        <button type="button" class="mn-link-quiet" data-sh="none">Меню не планируем</button>
        <span class="mn-hint-sm">Выключенные приёмы скрываются из меню, явки и дежурств. Уже выбранные блюда не удаляются — вернутся, если включить обратно.</span>`;
    }

    const overlay = _openSheet('mn-mealplan-sheet', {
      title: 'Какие приёмы пищи планируем',
      body: `<div id="mn-mealplan-body">${_body()}</div>`,
    });
    const bodyEl = overlay.querySelector('#mn-mealplan-body');

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-sh]');
      if (!btn) return;
      const a = btn.dataset.sh;
      if (a === 'toggle') {
        const id = btn.dataset.meal;
        if (planned.has(id)) planned.delete(id); else planned.add(id);
        _persist();
        bodyEl.innerHTML = _body();
      } else if (a === 'none') {
        planned = new Set();
        _persist();
        bodyEl.innerHTML = _body();
      }
    });
  }

  // Матрица явки: участник × приём пищи, круглый чек-бокс на пересечении.
  // Компактнее, чем отдельный тоггл на весь день — видно, кто на месте к
  // какому конкретно приёму (кто-то уезжает на рыбалку с утра и пропускает
  // обед), а не только "тут/не тут" в целом.
  const _MEAL_SHORT = { breakfast: 'Зав', snack: 'Пер', lunch: 'Обед', dinner: 'Ужин' };

  function _renderAttendanceCard(day, trip) {
    const names = TripsData.participantNames(trip);
    if (!names.length) return '';
    const meals = MenuData.getMeals().filter(m => TripsData.plannedMeals(trip).includes(m.id));
    if (!meals.length) return '';

    const head = `<div class="mn-att-grid mn-att-grid--head"><span></span>${meals.map(m => `<span>${_MEAL_SHORT[m.id] || m.label}</span>`).join('')}</div>`;
    const rows = names.map(name => {
      const cells = meals.map(m => {
        const present = MenuState.getDayAttendance(_tripId, day.id, name, m.id);
        return `<button type="button" class="mn-check ${present ? 'on' : ''}" role="checkbox" aria-checked="${present ? 'true' : 'false'}"
          aria-label="${_esc(name)} — ${m.label}"
          data-action="toggle-attendance-cell" data-day="${day.id}" data-name="${_esc(name)}" data-meal="${m.id}">${UIUtils.ico('check')}</button>`;
      }).join('');
      return `<div class="mn-att-grid mn-att-row"><span class="mn-att-name">${_esc(name)}</span>${cells}</div>`;
    }).join('');
    const totals = `<div class="mn-att-grid mn-att-grid--total"><span class="mn-att-total-lbl">едят</span>${meals.map(m =>
      `<span class="mn-att-total">${MenuState.getMealHeadcount(_tripId, day.id, m.id, names).present}</span>`).join('')}</div>`;

    return `
      <section class="mn-card mn-att-card">
        <div class="mn-att-card__head">
          <h3 class="mn-card-title">Кто ест</h3>
          <button type="button" class="mn-link-quiet" data-action="toggle-att-collapse">${_attCollapsed ? 'развернуть' : 'свернуть'}</button>
        </div>
        ${_attCollapsed ? '' : `
        <div class="mn-att-table">${head}${rows}${totals}</div>
        <span class="mn-hint-sm">По умолчанию все на месте — снимай отметку, если кого-то не будет</span>`}
      </section>`;
  }

  function _renderMeal(day, meal) {
    const mealData = day.meals[meal.id] || { slots: [] };
    const filled = mealData.slots.filter(s => s.item);
    const hasFilled = filled.length > 0;

    const trip = _trip();
    let headcountHtml = '';
    if (trip?.attendanceEnabled) {
      const names = TripsData.participantNames(trip);
      const hc = MenuState.getMealHeadcount(_tripId, day.id, meal.id, names);
      headcountHtml = `<span class="mn-headcount" title="${hc.present} из ${hc.total}">${UIUtils.ico('users')}на ${hc.present}</span>`;
    }

    const cookBtn = hasFilled ? `
      <button type="button" class="mn-cook-btn" data-action="cook-mode" data-day="${day.id}" data-meal="${meal.id}">
        ${UIUtils.ico('chef-hat')}Готовить
      </button>` : '';

    const dishes = filled.map(slot => _renderDish(day.id, meal.id, slot)).join('');

    return `
      <section class="mn-card mn-meal" data-day="${day.id}" data-meal="${meal.id}">
        <div class="mn-meal-head">
          <h3 class="mn-card-title">${meal.label}</h3>
          <div class="mn-meal-head__right">${headcountHtml}${cookBtn}</div>
        </div>
        ${hasFilled ? `<div class="mn-dishes">${dishes}</div>` : '<span class="mn-meal-empty">Ничего не запланировано</span>'}
        ${_renderAddChips(day.id, meal.id, mealData)}
        ${hasFilled ? _renderDutyRow(day.id, meal.id, mealData) : ''}
      </section>`;
  }

  // Заполненная позиция — строка "тип / название"; нажатие открывает лист
  // действий (рецепт, в закупку, заменить, убрать). Режима правки с
  // карандашом и корзин у каждой строки больше нет.
  function _renderDish(dayId, mealId, slot) {
    const type = MenuData.getSlotType(slot.type);
    return `
      <button type="button" class="mn-dish" data-action="dish" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}">
        <span class="mn-dish__text">
          <span class="mn-dish__kind">${_esc(type?.label || slot.type)}${slot.item.leftover ? '<span class="mn-leftover-tag">Остатки</span>' : ''}</span>
          <span class="mn-dish__name">${_esc(slot.item.name)}</span>
        </span>
        <span class="mn-dish__more">${UIUtils.ico('dots')}</span>
      </button>`;
  }

  // Пустые позиции — пунктирные чипы "+ Гарнир", по одному на тип (если
  // пустых слотов одного типа несколько — показываем один, он берёт первый
  // пустой). "ещё…" — добавить позицию другого типа.
  function _renderAddChips(dayId, mealId, mealData) {
    const seen = new Set();
    const chips = [];
    mealData.slots.forEach(slot => {
      if (slot.item || seen.has(slot.type)) return;
      seen.add(slot.type);
      const type = MenuData.getSlotType(slot.type);
      chips.push(`<button type="button" class="mn-add-chip" data-action="edit-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}" data-type="${slot.type}">+ ${_esc(type?.label || slot.type)}</button>`);
    });
    chips.push(`<button type="button" class="mn-add-more" data-action="add-slot" data-day="${dayId}" data-meal="${mealId}" aria-label="Добавить позицию другого типа">ещё…</button>`);
    return `<div class="mn-add-chips">${chips.join('')}</div>`;
  }

  // Дежурство на весь приём пищи — одна строка под блюдами, показывается
  // только когда есть что готовить (хотя бы одна заполненная позиция).
  function _renderDutyRow(dayId, mealId, mealData) {
    const who = n => n ? `<b>${_esc(n)}</b>` : '<span class="mn-assign">назначить</span>';
    return `
      <button type="button" class="mn-duty-row" data-action="edit-duty" data-day="${dayId}" data-meal="${mealId}">
        ${UIUtils.ico('chef-hat', 'mn-duty-row__ico')}
        <span class="mn-duty-row__text">Готовит ${who(mealData.cook)} · Уборка ${who(mealData.cleanup)}</span>
        ${UIUtils.ico('chevron-right', 'mn-duty-row__chev')}
      </button>`;
  }

  // ── Листы (общий каркас) ────────────────────────────────────────────────
  // Все листы Меню — один каркас: ручка, заголовок + подзаголовок, круглый
  // крестик, прокручиваемое тело, необязательный подвал с кнопкой.
  // z-index выше Cook Mode — лист дежурства открывается и из него.
  function _openSheet(id, { title, sub, body, footer, tall }) {
    document.getElementById(id)?.remove();
    const overlay = document.createElement('div');
    overlay.id = id;
    overlay.className = 'mn-sheet-overlay';
    overlay.innerHTML = `
      <div class="mn-sheet ${tall ? 'mn-sheet--tall' : ''}" role="dialog" aria-label="${_esc(title)}">
        <div class="mn-sheet-grab"></div>
        <div class="mn-sheet-head">
          <div class="mn-sheet-titles">
            <h2 class="mn-sheet-title">${_esc(title)}</h2>
            ${sub ? `<div class="mn-sheet-sub">${_esc(sub)}</div>` : ''}
          </div>
          <button type="button" class="mn-sheet-close" data-sh="close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="mn-sheet-body">${body}</div>
        ${footer ? `<div class="mn-sheet-foot">${footer}</div>` : ''}
      </div>`;
    (_el || document.body).appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-sh="close"]')) overlay.remove();
    });
    return overlay;
  }

  // Короткое уведомление внизу экрана (добавлено в закупку и т.п.) —
  // вместо старой смены иконки у маленькой корзины в строке блюда.
  function _flash(msg) {
    document.getElementById('mn-flash')?.remove();
    const el = document.createElement('div');
    el.id = 'mn-flash';
    el.className = 'mn-flash';
    el.setAttribute('role', 'status');
    el.textContent = msg;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('show'));
    setTimeout(() => { el.classList.remove('show'); setTimeout(() => el.remove(), 250); }, 2000);
  }

  // Теги направлений открытые и растут сами вместе с рецептами (см.
  // RecipesData.getAllDestinations) — вместо фиксированного набора мест,
  // угаданного заранее, список фильтра берётся из того, что реально
  // проставлено на items данного слота. Пустой destinations у рецепта =
  // универсальный, подходит при любом выбранном направлении.
  function _allTags(sections) {
    const set = new Set();
    sections.forEach(s => s.items.forEach(i => (i.destinations || []).forEach(t => set.add(t))));
    return [...set].sort();
  }

  // ── Выбор блюда (с вкладками по категориям + "своё блюдо") ─────────────
  function _showPicker(dayId, mealId, slotId, slotType) {
    const sections     = MenuData.getItemsForSlot(slotType, _curDays(), dayId);
    const slotTypeMeta = MenuData.getSlotType(slotType);
    const mealMeta     = MenuData.getMeals().find(m => m.id === mealId);
    const day          = _findDay(dayId);
    const tags         = _allTags(sections);
    let activeSec      = 0;
    let activeTag      = 'all';
    let query          = '';

    function _matchesTag(i) {
      return activeTag === 'all' || !(i.destinations || []).length || i.destinations.includes(activeTag);
    }

    function _row(item) {
      return `
        <button type="button" class="mn-pick-row" data-sh="pick"
          data-item-id="${_esc(item.id)}" data-item-name="${_esc(item.name)}" data-item-source="${_esc(item.source)}"
          data-item-leftover="${item.leftover ? '1' : ''}">
          <span class="mn-pick-name">${_esc(item.name)}</span>
          ${item.hint ? `<span class="mn-pick-hint">${_esc(item.hint)}</span>` : ''}
        </button>`;
    }

    function _buildList() {
      const q = query.toLowerCase();
      if (!q) {
        const items = (sections[activeSec]?.items || []).filter(_matchesTag);
        return items.map(_row).join('') || '<div class="mn-pick-empty">Ничего в этом наборе</div>';
      }
      // Поиск — по всем секциям (в пределах выбранного направления)
      const found = sections.flatMap(s => s.items).filter(_matchesTag)
        .filter(item => item.name.toLowerCase().includes(q));
      const exact = found.some(item => item.name.trim().toLowerCase() === q);
      // "Своё блюдо" без рецепта — то, что вписали в поиск (source 'manual').
      // Ингредиентов у него нет, в Cook Mode так и пишем.
      const own = exact ? '' : `
        <button type="button" class="mn-pick-row mn-pick-own" data-sh="own">
          <span class="mn-pick-name">${UIUtils.ico('plus')}Добавить своё: «${_esc(query)}»</span>
          <span class="mn-pick-hint">без рецепта — просто название в меню</span>
        </button>`;
      return own + found.map(_row).join('');
    }

    function _buildTags() {
      if (!tags.length) return '';
      return `<div class="mn-pick-tags"><span class="mn-pick-tags__lbl">Для</span>${['all', ...tags].map(t => `
        <button type="button" class="mn-pill ${t === activeTag ? 'on' : ''}" data-sh="tag" data-tag="${_esc(t)}" aria-pressed="${t === activeTag ? 'true' : 'false'}">${t === 'all' ? 'всех мест' : _esc(t)}</button>`).join('')}</div>`;
    }

    function _buildTabs() {
      if (sections.length < 2) return '';
      return `<div class="mn-pick-tabs" role="tablist">${sections.map((s, i) => `
        <button type="button" role="tab" class="mn-pick-tab ${i === activeSec ? 'on' : ''}" aria-selected="${i === activeSec ? 'true' : 'false'}" data-sh="tab" data-sec="${i}">${_esc(s.section)}</button>`).join('')}</div>`;
    }

    const title = `${mealMeta?.label || ''} · ${(slotTypeMeta?.label || slotType).toLowerCase()}`;
    const overlay = _openSheet('mn-picker', {
      title, sub: day ? _dayLong(day) : '', tall: true,
      body: `
        <label class="mn-search">${_svgIco(SVG_SEARCH)}
          <input type="text" id="mn-pick-search" aria-label="Поиск блюда" placeholder="Найти блюдо или вписать своё" autocomplete="off">
        </label>
        <div id="mn-pick-filters">${_buildTags()}${_buildTabs()}</div>
        <div class="mn-pick-list" id="mn-pick-list">${_buildList()}</div>
        <span class="mn-hint-sm">Если блюда нет в рецептах — впиши название в поиск и нажми «Добавить своё». Если в режиме готовки отметили, что еда осталась, здесь первой вкладкой появятся «Остатки» (2 дня).</span>`,
    });

    const listEl = overlay.querySelector('#mn-pick-list');
    const filtersEl = overlay.querySelector('#mn-pick-filters');
    const searchEl = overlay.querySelector('#mn-pick-search');
    const _refreshList = () => { listEl.innerHTML = _buildList(); };

    searchEl.addEventListener('input', () => {
      query = searchEl.value.trim();
      _refreshList();
    });

    function _save(item, btn) {
      UIUtils.withBusyButton(btn, () => {
        // Выбор в пустую позицию — новая запись в ленте; замену уже
        // выбранного блюда ("Заменить блюдо") в ленту не пишем.
        const wasEmpty = !_findMeal(dayId, mealId)?.slots.find(s => s.id === slotId)?.item;
        // Точечная запись только этого слота, а не всего _syncFirebase() —
        // см. MenuFirebase.saveSlotItem про гонку при одновременном выборе.
        MenuState.updateSlot(_tripId, dayId, mealId, slotId, item);
        MenuFirebase.saveSlotItem(_tripId, slotId, item);
        if (wasEmpty && typeof ActivityLog !== 'undefined') {
          ActivityLog.add(_tripId, 'menu', `добавил в меню: ${item.name} (${(mealMeta?.label || '').toLowerCase()}, ${_shortDate(day)})`);
        }
        overlay.remove();
        _rerender();
      });
    }

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-sh]');
      if (!btn) return;
      const act = btn.dataset.sh;
      if (act === 'tab') {
        activeSec = parseInt(btn.dataset.sec, 10) || 0;
        query = ''; searchEl.value = '';
        filtersEl.innerHTML = _buildTags() + _buildTabs();
        _refreshList();
      } else if (act === 'tag') {
        activeTag = btn.dataset.tag;
        filtersEl.innerHTML = _buildTags() + _buildTabs();
        _refreshList();
      } else if (act === 'pick') {
        const { itemId, itemName, itemSource, itemLeftover } = btn.dataset;
        const item = { id: itemId, name: itemName, source: itemSource };
        // Выбрали блюдо из секции "Остатки" — переносим флаг на новый
        // слот, иначе завтрашние остатки исчезали бы из виду послезавтра
        // даже если реально ещё остались (см. MenuData.getLeftoverItemsForSlot).
        if (itemLeftover) item.leftover = true;
        _save(item, btn);
      } else if (act === 'own') {
        const name = searchEl.value.trim();
        if (!name) return;
        _save({ id: 'manual_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, source: 'manual' }, btn);
      }
    });
  }

  // ── Тип новой позиции ("ещё…") ──────────────────────────────────────────
  function _showTypePicker(dayId, mealId) {
    const mealMeta = MenuData.getMeals().find(m => m.id === mealId);
    const day = _findDay(dayId);
    const types = MenuData.getSlotTypes();
    const overlay = _openSheet('mn-type-picker', {
      title: 'Добавить позицию',
      sub: `${mealMeta?.label || ''}${day ? ' · ' + _dayLong(day) : ''}`,
      body: `<div class="mn-type-grid">${types.map(t => `
        <button type="button" class="mn-type-btn" data-sh="type" data-type="${t.id}">
          <i class="ti ${t.icon}" aria-hidden="true"></i><span>${t.label}</span>
        </button>`).join('')}</div>`,
    });

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-sh="type"]');
      if (!btn) return;
      const type = btn.dataset.type;
      overlay.remove();
      // Уже есть пустая позиция этого типа — выбираем в неё, а не плодим
      // вторую пустую.
      const existing = _findMeal(dayId, mealId)?.slots.find(s => s.type === type && !s.item);
      if (existing) { _showPicker(dayId, mealId, existing.id, type); return; }
      const slot = MenuState.addSlot(_tripId, dayId, mealId, type);
      if (slot) {
        // Новый слот существует только локально, пока не запушен days —
        // если сразу выбрать блюдо, оно уйдёт узкой записью в slotItems
        // (см. saveSlotItem), а сам слот в серверном days так и не
        // появится. Следующий же снапшот из Firestore (в т.ч. эхо этой
        // самой узкой записи) перетрёт локальный days старым — выбор
        // тихо исчезнет. Поэтому создание слота — полноценный saveDays,
        // а не только точечная правка.
        _syncFirebase();
        _rerender();
        _showPicker(dayId, mealId, slot.id, type);
      } else {
        _rerender();
      }
    });
  }

  // ── Лист действий с блюдом ──────────────────────────────────────────────
  function _recipeFor(item) {
    if (!item) return null;
    if (item.source === 'recipes' && typeof RecipesData !== 'undefined') return RecipesData.getRecipeById(item.id);
    if (item.source === 'recipes_custom' && typeof RecipesState !== 'undefined') return RecipesState.getCustomRecipeById(item.id);
    if (item.source === 'bar' && typeof BarData !== 'undefined') return BarData.getCocktailById(item.id);
    return null;
  }

  function _plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function _showDishSheet(dayId, mealId, slotId) {
    const day = _findDay(dayId);
    const slot = day?.meals[mealId]?.slots.find(s => s.id === slotId);
    if (!slot?.item) return;
    const mealMeta = MenuData.getMeals().find(m => m.id === mealId);
    const typeMeta = MenuData.getSlotType(slot.type);
    const recipe = _recipeFor(slot.item);
    const ingredients = _ingredientsForItem(slot.item.id, slot.item.source, slot.item.name);

    const act = (sh, icon, text, sub, cls) => `
      <button type="button" class="mn-act ${cls || ''}" data-sh="${sh}">
        <span class="mn-act__ico">${icon === 'swap' ? _svgIco(SVG_SWAP) : UIUtils.ico(icon)}</span>
        <span class="mn-act__text"><span class="mn-act__title">${text}</span>${sub ? `<span class="mn-act__sub">${_esc(sub)}</span>` : ''}</span>
      </button>`;

    const ingPreview = ingredients.map(i => String(i.name || '').toLowerCase()).filter(Boolean).join(', ');
    const rows = [
      recipe ? act('recipe', 'book', 'Открыть рецепт', ingPreview.length > 60 ? ingPreview.slice(0, 57) + '…' : ingPreview) : '',
      ingredients.length
        ? act('shop', 'shopping-cart', 'Ингредиенты — в закупку', `${ingredients.length} ${_plural(ingredients.length, 'позиция', 'позиции', 'позиций')}, встанут по категориям`)
        : '',
      act('swap', 'swap', 'Заменить блюдо'),
      act('remove', 'trash', 'Убрать из меню', '', 'danger'),
    ].join('');

    const overlay = _openSheet('mn-dish-sheet', {
      title: slot.item.name,
      sub: `${mealMeta?.label || ''} · ${(typeMeta?.label || slot.type).toLowerCase()} · ${_dayLong(day)}`,
      body: `<div class="mn-acts">${rows}</div>`,
    });

    overlay.addEventListener('click', async e => {
      const btn = e.target.closest('[data-sh]');
      if (!btn) return;
      const a = btn.dataset.sh;
      if (a === 'recipe') { _showRecipeSheet(slot.item, recipe); return; }
      if (a === 'swap')   { overlay.remove(); _showPicker(dayId, mealId, slotId, slot.type); return; }
      if (a === 'remove') { overlay.remove(); _removeItem(dayId, mealId, slotId); return; }
      if (a === 'shop') {
        await UIUtils.withBusyButton(btn, async () => {
          const res = await _pushIngredientsToShopping([{ slotId, ...slot.item }]);
          if (res) _flash(res.added ? `В закупку: +${res.added}` : 'Всё уже есть в закупке');
          if (res && res.added && typeof ActivityLog !== 'undefined') {
            ActivityLog.add(_tripId, 'shopping', `добавил ингредиенты блюда «${slot.item.name}» в закупку (${res.added})`);
          }
        });
        overlay.remove();
      }
    });
  }

  // Рецепт прямо из Меню — только чтение (продукты + как готовить). Модуль
  // Рецептов не умеет открываться сразу на конкретном рецепте, а уводить
  // человека из Меню ради того, чтобы глянуть состав, неудобно.
  function _showRecipeSheet(item, recipe) {
    const ings = (recipe?.ingredients || []).map(i => `
      <div class="mn-rec-ing"><span>${_esc(i.name)}</span><span class="mn-rec-qty">${_esc(i.qty || '')}</span></div>`).join('');
    _openSheet('mn-recipe-sheet', {
      title: item.name, sub: recipe?.sub || '', tall: true,
      body: `
        ${ings ? `<div class="mn-rec-list">${ings}</div>` : '<span class="mn-hint-sm">Ингредиенты не указаны в рецепте</span>'}
        ${recipe?.method ? `<div class="mn-rec-method"><div class="mn-caps">Как готовить</div><p>${_esc(recipe.method)}</p></div>` : ''}`,
    });
  }

  // "Убрать из меню": у базовой позиции приёма (Основное/Напиток/…) просто
  // очищаем блюдо узкой записью — позиция снова станет чипом "+ Тип".
  // Добавленную через "ещё…" позицию (или дубль, когда пустая того же
  // типа уже есть) удаляем целиком, как раньше делал крестик в режиме
  // правки — иначе копились бы одинаковые пустые чипы.
  function _removeItem(dayId, mealId, slotId) {
    const meal = _findMeal(dayId, mealId);
    const slot = meal?.slots.find(s => s.id === slotId);
    if (!slot) return;
    const isBase = MenuData.getMealBaseSlots(mealId).includes(slot.type);
    const hasEmptyTwin = meal.slots.some(s => s.id !== slotId && s.type === slot.type && !s.item);
    if (!isBase || hasEmptyTwin) {
      MenuState.removeSlot(_tripId, dayId, mealId, slotId);
      _syncFirebase();
    } else {
      MenuState.updateSlot(_tripId, dayId, mealId, slotId, null);
      MenuFirebase.saveSlotItem(_tripId, slotId, null);
    }
    _rerender();
  }

  // ── Дежурство: кто готовит / кто убирает за приём пищи ──────────────────
  function _showDutyPicker(dayId, mealId) {
    const trip    = _trip();
    const members = typeof TripsData !== 'undefined' ? TripsData.dutyEligibleNames(trip) : [];
    const day     = _findDay(dayId);
    const meal    = day?.meals[mealId];
    const mealMeta = MenuData.getMeals().find(m => m.id === mealId);
    if (!meal) return;

    const sel = { cook: meal.cook || null, cleanup: meal.cleanup || null };
    const counts = MenuState.getDutyCounts(_tripId, TripsData.plannedMeals(trip));

    // Уже назначенный человек, которого нет среди доступных (отметили
    // dutyExempt позже) — всё равно показываем чипом, чтобы было видно и
    // можно было снять.
    function _namesFor(role) {
      const list = members.slice();
      if (sel[role] && !list.includes(sel[role])) list.push(sel[role]);
      return list;
    }

    function _block(role, title) {
      const chips = _namesFor(role).map(n => {
        const on = sel[role] === n;
        return `<button type="button" class="mn-person ${on ? 'on' : ''}" aria-pressed="${on ? 'true' : 'false'}" data-sh="person" data-role="${role}" data-name="${_esc(n)}">
          ${_esc(n)}<span class="mn-person__n">${counts[role][n] || 0}×</span></button>`;
      }).join('');
      return `
        <div class="mn-role" data-role-block="${role}">
          <div class="mn-role__head">
            <span class="mn-role__title">${title}</span>
            <button type="button" class="mn-auto" data-sh="auto" data-role="${role}">${UIUtils.ico('bolt')}Кто реже всех</button>
          </div>
          <div class="mn-role__chips">${chips || '<span class="mn-hint-sm">В поездке нет участников для дежурства</span>'}</div>
        </div>`;
    }

    const _body = () => `${_block('cook', 'Готовит')}${_block('cleanup', 'Уборка')}
      <span class="mn-hint-sm">Цифра — сколько раз человек уже дежурил в этой роли за поездку. Нажми на выбранного ещё раз, чтобы снять.</span>`;

    const overlay = _openSheet('mn-duty-overlay', {
      title: 'Дежурство',
      sub: `${mealMeta?.label || ''} · ${_dayLong(day)}`,
      body: `<div id="mn-duty-body" class="mn-duty-body">${_body()}</div>`,
      footer: '<button type="button" class="mn-btn-primary" data-sh="save">Сохранить</button>',
    });
    const bodyEl = overlay.querySelector('#mn-duty-body');

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-sh]');
      if (!btn) return;
      const a = btn.dataset.sh;
      if (a === 'person') {
        const { role, name } = btn.dataset;
        sel[role] = sel[role] === name ? null : name;
        bodyEl.innerHTML = _body();
      } else if (a === 'auto') {
        // Авто-назначение — предлагает того из участников, кто реже всего
        // был в этой роли за всю поездку (см. MenuState.getDutyCounts); при
        // ничьей берёт первого по алфавиту, не по порядку в списке
        // участников — детерминированно, а не "кто первый в массиве".
        const role = btn.dataset.role;
        const c = counts[role] || {};
        const sorted = members.slice().sort((a, b) => {
          const diff = (c[a] || 0) - (c[b] || 0);
          return diff !== 0 ? diff : a.localeCompare(b, 'ru');
        });
        if (sorted.length) { sel[role] = sorted[0]; bodyEl.innerHTML = _body(); }
      } else if (a === 'save') {
        // Всегда целиком {cook, cleanup} — Firestore заменяет вложенный
        // объект по ключу мапы целиком (см. MenuFirebase.saveMealDuty).
        MenuState.setMealDuty(_tripId, dayId, mealId, 'cook', sel.cook);
        MenuState.setMealDuty(_tripId, dayId, mealId, 'cleanup', sel.cleanup);
        MenuFirebase.saveMealDuty(_tripId, dayId, mealId, { cook: sel.cook, cleanup: sel.cleanup });
        overlay.remove();
        _rerender();
        if (_cookModeOpenFor && _cookModeOpenFor.dayId === dayId && _cookModeOpenFor.mealId === mealId) {
          _showCookMode(dayId, mealId);
        }
      }
    });
  }

  // ── Cook Mode — полноэкранный режим готовки конкретного приёма пищи ─────
  function _showCookMode(dayId, mealId) {
    document.getElementById('mn-cookmode-overlay')?.remove();

    const day  = _findDay(dayId);
    const meal = MenuData.getMeals().find(m => m.id === mealId);
    const mealData = day?.meals[mealId];
    if (!day || !meal || !mealData) { _cookModeOpenFor = null; return; }

    // Новый приём — галочки с нуля; перерисовка того же — сохраняем.
    if (!_cookModeOpenFor || _cookModeOpenFor.dayId !== dayId || _cookModeOpenFor.mealId !== mealId) _cmChecked = new Set();
    _cookModeOpenFor = { dayId, mealId };
    const filledSlots = mealData.slots.filter(s => s.item);
    const allergyWarnings = _allergyWarnings();

    const dishesHtml = filledSlots.map(slot => {
      const typeMeta = MenuData.getSlotType(slot.type);
      const recipe = _recipeFor(slot.item);
      const ingredients = slot.item.source === 'proteins' ? [] : _ingredientsForItem(slot.item.id, slot.item.source, slot.item.name);

      const ingRows = ingredients.map((ing, i) => {
        const key = `${slot.id}_${i}`;
        const on = _cmChecked.has(key);
        return `
        <button type="button" class="cm-ing-row ${on ? 'done' : ''}" role="checkbox" aria-checked="${on ? 'true' : 'false'}" data-action="cm-toggle-ing" data-key="${key}">
          <span class="mn-check ${on ? 'on' : ''}" aria-hidden="true">${UIUtils.ico('check')}</span>
          <span class="cm-ing-name">${_esc(ing.name)}</span>
          <span class="cm-ing-qty">${_esc(ing.qty || '')}</span>
        </button>`;
      }).join('');

      let note = '';
      if (!ingRows) {
        if (slot.item.source === 'manual') note = 'Блюдо вписано вручную — рецепта и списка продуктов нет';
        else if (slot.item.source === 'proteins') note = `Без рецепта — продукт из списка «${typeMeta?.label || 'Мясо/рыба'}»`;
        else note = 'Ингредиенты не указаны в рецепте';
      }

      const currentLeftover = !!slot.item.leftover;

      return `
        <section class="mn-card cm-dish" data-slot="${slot.id}">
          <div class="cm-dish-head">
            <span class="cm-dish-kind">${_esc(typeMeta?.label || slot.type)}</span>
            <h3 class="cm-dish-title">${_esc(slot.item.name)}</h3>
          </div>
          ${ingRows ? `<div class="cm-ing-list">${ingRows}</div>` : `<span class="cm-no-ing">${note}</span>`}
          ${recipe?.method ? `
          <details class="cm-method" open>
            <summary>Как готовить</summary>
            <p>${_esc(recipe.method)}</p>
          </details>` : ''}
          <div class="cm-leftover-block">
            <span class="cm-leftover-q">Останется на потом?</span>
            <div class="cm-seg">
              <button type="button" class="cm-lo-btn ${!currentLeftover ? 'picked' : ''}" aria-pressed="${!currentLeftover}" data-action="cm-leftover" data-slot="${slot.id}" data-val="0">Нет</button>
              <button type="button" class="cm-lo-btn ${currentLeftover ? 'picked' : ''}" aria-pressed="${currentLeftover}" data-action="cm-leftover" data-slot="${slot.id}" data-val="1">Да, хватит ещё</button>
            </div>
          </div>
        </section>`;
    }).join('');

    // Роль: назначенный — просто имя (нажатие всё равно открывает лист
    // дежурства, чтобы поменять), не назначенный — пунктир "назначить".
    const role = (lbl, name) => `
      <button type="button" class="cm-role ${name ? '' : 'empty'}" data-action="cm-duty">
        <span class="cm-role-lbl">${lbl}</span>
        <span class="cm-role-name">${name ? _esc(name) : 'назначить'}</span>
      </button>`;

    const overlay = document.createElement('div');
    overlay.id = 'mn-cookmode-overlay';
    overlay.className = 'cm-overlay';
    overlay.innerHTML = `
      <div class="cm-sheet">
        <div class="cm-topbar">
          <button type="button" class="cm-close" id="cm-close" aria-label="Закрыть режим готовки">${UIUtils.ico('x')}</button>
          <div class="cm-topbar__text">
            <div class="cm-topbar__title">Готовим ${_esc(meal.label.toLowerCase())}</div>
            <div class="cm-topbar__sub">${_esc(_dayLong(day))}</div>
          </div>
        </div>
        <div class="cm-content">
          <div class="cm-roles">${role('Готовит', mealData.cook)}${role('Уборка', mealData.cleanup)}</div>
          ${allergyWarnings.length ? `
          <div class="cm-allergy-warn" role="note">
            <span class="cm-allergy-warn__ico">${UIUtils.ico('alert-triangle')}</span>
            <span class="cm-allergy-warn__text">
              <span class="cm-allergy-warn__title">Аллергии в группе</span>
              ${allergyWarnings.map(a => `<span class="cm-allergy-warn__row"><b>${_esc(a.name)}</b> — ${_esc(a.allergies)}</span>`).join('')}
            </span>
          </div>` : ''}
          ${dishesHtml || '<span class="cm-no-ing">Ничего не выбрано на этот приём</span>'}
        </div>
        <div class="cm-actions">
          <button type="button" class="cm-done-btn" id="cm-done">${_esc(meal.label)} готов</button>
          <div class="cm-done-note">${mealData.cleanup
            ? `${_esc(mealData.cleanup)} (уборка) получит сообщение в Telegram, если привязан бот`
            : 'Уборка не назначена — сообщить в Telegram некому'}</div>
        </div>
      </div>`;

    (_el || document.body).appendChild(overlay);

    overlay.querySelector('#cm-close').addEventListener('click', () => { _cookModeOpenFor = null; overlay.remove(); });

    overlay.addEventListener('click', e => {
      // Чек-лист продуктов — локальное состояние на время готовки, не
      // синхронизируется и не сохраняется: это "что я лично уже достал",
      // не общие данные поездки, синк никому не нужен.
      const row = e.target.closest('[data-action="cm-toggle-ing"]');
      if (row) {
        const key = row.dataset.key;
        const on = !_cmChecked.has(key);
        if (on) _cmChecked.add(key); else _cmChecked.delete(key);
        row.classList.toggle('done', on);
        row.setAttribute('aria-checked', on ? 'true' : 'false');
        row.querySelector('.mn-check')?.classList.toggle('on', on);
        return;
      }

      if (e.target.closest('[data-action="cm-duty"]')) { _showDutyPicker(dayId, mealId); return; }

      const btn = e.target.closest('[data-action="cm-leftover"]');
      if (!btn) return;
      const slotId = btn.dataset.slot;
      const val = btn.dataset.val === '1';
      MenuState.setSlotLeftover(_tripId, dayId, mealId, slotId, val);
      // Слот берём свежий из стейта — снапшот мог заменить days, пока
      // открыт режим готовки, и замкнутый mealData уже устарел.
      const fresh = _findMeal(dayId, mealId)?.slots.find(s => s.id === slotId);
      if (fresh?.item) MenuFirebase.saveSlotItem(_tripId, slotId, fresh.item);
      overlay.querySelectorAll(`.cm-lo-btn[data-slot="${slotId}"]`).forEach(b => {
        const picked = (b.dataset.val === '1') === val;
        b.classList.toggle('picked', picked);
        b.setAttribute('aria-pressed', picked ? 'true' : 'false');
      });
      _rerender();
    });

    // "Готово" — узкая запись в очередь для бота (см. MenuFirebase.saveCookDone),
    // бот пингует того, кто на уборке.
    overlay.querySelector('#cm-done').addEventListener('click', () => {
      const fresh = _findMeal(dayId, mealId) || mealData;
      if (typeof MenuFirebase !== 'undefined') {
        MenuFirebase.saveCookDone(_tripId, dayId, mealId, fresh.cook, fresh.cleanup);
      }
      if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'menu', `приготовил ${meal.label.toLowerCase()}`);
      _cookModeOpenFor = null;
      overlay.remove();
      _rerender();
    });
  }

  // ── Events ──────────────────────────────────────────────────────────────
  function _bindEvents() {
    if (!_el) return;
    if (_el._mnClickHandler) _el.removeEventListener('click', _el._mnClickHandler);

    _el._mnClickHandler = function(e) {
      // Листы и Cook Mode вставлены внутрь _el — их клики обрабатывают они
      // сами, сюда они не должны доходить.
      if (e.target.closest('.mn-sheet-overlay, .cm-overlay')) return;
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;
      const { day, meal } = target.dataset;

      if (action === 'back') {
        if (typeof MenuIndex !== 'undefined') MenuIndex.close();
        return;
      }

      if (action === 'edit-meals-planned') { _showMealsPlannedSheet(); return; }

      if (action === 'select-day') {
        _selDayId = day;
        _rerender();
        _centerSelectedInStrip();
        return;
      }

      if (action === 'dish')      { _showDishSheet(day, meal, target.dataset.slot); return; }
      if (action === 'edit-slot') { _showPicker(day, meal, target.dataset.slot, target.dataset.type); return; }
      if (action === 'add-slot')  { _showTypePicker(day, meal); return; }
      if (action === 'edit-duty') { _showDutyPicker(day, meal); return; }
      if (action === 'cook-mode') { _showCookMode(day, meal); return; }

      if (action === 'push-day') {
        const dayObj = _findDay(day);
        if (!dayObj) return;
        const planned = TripsData.plannedMeals(_trip());
        const items = [];
        planned.forEach(mealId => (dayObj.meals?.[mealId]?.slots || []).forEach(s => { if (s.item) items.push({ slotId: s.id, ...s.item }); }));
        UIUtils.withBusyButton(target, async () => {
          const res = await _pushIngredientsToShopping(items);
          if (res) _flash(res.added ? `В закупку: +${res.added}` : 'Всё уже есть в закупке');
          if (res && res.added && typeof ActivityLog !== 'undefined') {
            ActivityLog.add(_tripId, 'shopping', `добавил ингредиенты на ${_shortDate(dayObj)} в закупку (${res.added})`);
          }
        });
        return;
      }

      if (action === 'toggle-attendance-enabled') {
        const trip = _trip();
        if (!trip) return;
        const next = !trip.attendanceEnabled;
        trip.attendanceEnabled = next;
        if (typeof TripsData !== 'undefined') TripsData.updateTrip(_tripId, { attendanceEnabled: next });
        _rerender();
        return;
      }

      if (action === 'toggle-att-collapse') {
        _attCollapsed = !_attCollapsed;
        _rerender();
        return;
      }

      if (action === 'toggle-attendance-cell') {
        const name = target.dataset.name;
        const present = !MenuState.getDayAttendance(_tripId, day, name, meal);
        MenuState.setDayAttendance(_tripId, day, name, meal, present);
        const dayObj = _findDay(day);
        if (dayObj?.attendance) MenuFirebase.saveDayAttendance(_tripId, day, dayObj.attendance);
        _rerender();
        return;
      }
    };

    _el.addEventListener('click', _el._mnClickHandler);
  }

  // Перерисовать тело (без каркаса _el) — полосу дней, строку "Планируем…"
  // и выбранный день, либо карточку-заглушку, если приёмы выключены целиком
  // (структура тела могла смениться между вызовами — так что перерисовываем
  // #mn-wrap целиком, а не отдельные под-узлы, как раньше). Прокрутку
  // полосы сохраняем — иначе каждый снапшот дёргал бы её в начало. Листы
  // (см. _openSheet) — соседи #mn-wrap внутри _el, их это не касается.
  function _rerender() {
    if (!_el) return;
    _ensureSelectedDay();
    const wrap = _el.querySelector('#mn-wrap');
    if (!wrap) return;
    const prevScroll = wrap.querySelector('#mn-strip')?.scrollLeft || 0;
    wrap.innerHTML = _renderBody();
    const strip = wrap.querySelector('#mn-strip');
    if (strip) strip.scrollLeft = prevScroll;
  }

  // Ингредиенты блюда по его source/id — те же каталоги, откуда слот
  // вообще заполняется (см. MenuData.getItemsForSlot). Белок сам по себе
  // и есть один ингредиент — рецепта для него нет и не нужно. У "своего
  // блюда" (source 'manual') ингредиентов нет.
  function _ingredientsForItem(itemId, source, fallbackName) {
    if (source === 'proteins') return [{ name: fallbackName, qty: '' }];
    const recipe = _recipeFor({ id: itemId, source });
    return (recipe && recipe.ingredients && recipe.ingredients.length) ? recipe.ingredients : [];
  }

  // "4 шт" → {amount:4, unit:'шт'}; "150 г" → {amount:150, unit:'г'};
  // "по вкусу" / "2 ст.л. на литр воды" (не чистое "число + единица") →
  // null — не пытаемся угадывать состав сложной строки, просто не считаем
  // её числом.
  function _parseQty(qty) {
    const s = String(qty || '').trim();
    const m = s.match(/^(\d+(?:[.,]\d+)?)\s*([^\d]*)$/);
    if (!m) return null;
    const amount = parseFloat(m[1].replace(',', '.'));
    if (!isFinite(amount)) return null;
    return { amount, unit: m[2].trim() };
  }

  // Сложить два qty. Если оба — чистое число с одной и той же единицей
  // (без учёта регистра) — суммируем в одну цифру. Иначе (единицы разные,
  // либо один из них не число, например "по вкусу") — ничего не выдумываем
  // и не теряем: просто соединяем обе строки текстом.
  function _combineQty(a, b) {
    const existing = String(a || '').trim();
    const add = String(b || '').trim();
    if (!existing) return add;
    if (!add) return existing;
    const pa = _parseQty(existing), pb = _parseQty(add);
    if (pa && pb && pa.unit.toLowerCase() === pb.unit.toLowerCase()) {
      const sum = pa.amount + pb.amount;
      const sumStr = Number.isInteger(sum) ? String(sum) : String(Math.round(sum * 100) / 100);
      return (sumStr + (pa.unit ? ' ' + pa.unit : '')).trim();
    }
    if (existing === add) return existing;
    return existing + ' + ' + add;
  }

  // Закидывает ингредиенты блюд (одного — из листа блюда, или всех блюд
  // дня — кнопкой-корзиной у дня) в Закупку этой же поездки — категория
  // резолвится через RecipesData.resolveShoppingCategory (каталог
  // ингредиентов → authored category на самом ингредиенте → угадывание по
  // ключевым словам → "Разное"), тот же резолвер использует и вставка
  // списка текстом в самой Закупке (см. modules/shopping/render.js:
  // _showPasteList) — одна логика на оба входа в закупку.
  // slotItems: [{slotId, id, source, name}] — slotId обязателен для
  // идемпотентности (см. shoppingPushed ниже).
  //
  // Раньше при одинаковом имени (без учёта регистра) вторая и последующая
  // позиция ПРОСТО ОТБРАСЫВАЛАСЬ, а количество оставалось от первой — "Яйца
  // пашот" (4 шт) + "Омлет" (3 шт) в закупке давали 4 или 3 яйца в
  // зависимости от порядка добавления блюд, а не 7. Та же участь была у
  // позиции, уже существующей в закупке — её количество вообще не
  // увеличивалось. Реальный баг, найден внешним ревью 2026-09-27. Теперь
  // одинаковые ингредиенты (в том числе уже существующие в закупке)
  // суммируются через _combineQty.
  //
  // shoppingPushed[slotId] — не просто "отправлено когда-то" (было раньше,
  // булево навсегда), а КАКОЕ ИМЕННО блюдо было отправлено из этого слота
  // (id+source). Раньше замена блюда в слоте (позавтракали не яйцами, а
  // рисом) не давала отправить рис — флаг слота уже стоял, независимо от
  // блюда; удалённую руками из закупки позицию тоже нельзя было вернуть
  // повторной отправкой того же блюда. Оба — реальные баги, найдены внешним
  // ревью 2026-09-27. Теперь "уже отправлено, пропускаем" — только если И
  // блюдо в слоте ТО ЖЕ САМОЕ, что в прошлый раз, И позиция всё ещё
  // физически в закупке (не удалили). Другое блюдо или отсутствующая
  // позиция — повод добавить заново. Свежие данные (и Закупки, и Меню)
  // читаем в транзакции, а не из localStorage: Меню не подписано на
  // Закупку, и раньше код писал полный categories из пустого/устаревшего
  // кэша — стирал весь чужой список закупки (нашёл аудит 2026-09-27).
  // Возвращает { added, total } или null, если закупки нет/нечего добавлять.
  async function _pushIngredientsToShopping(slotItems) {
    if (typeof ShoppingState === 'undefined' || typeof ShoppingFirebase === 'undefined') return null;
    if (!slotItems || !slotItems.length) return null;

    const dishKey = si => `${si.id || ''}_${si.source || ''}`;

    const allIngredients = [];
    slotItems.forEach(si => allIngredients.push(..._ingredientsForItem(si.id, si.source, si.name)));
    if (!allIngredients.length) {
      _flash('У этих блюд нет списка ингредиентов — добавь их в Рецептах');
      return null;
    }

    ShoppingState.load();
    const menuRef = db.collection('menu').doc(_tripId);
    const shopRef = db.collection('shopping').doc(_tripId);
    let added = 0;
    try {
      await db.runTransaction(async tx => {
        added = 0;
        const [menuSnap, shopSnap] = await Promise.all([tx.get(menuRef), tx.get(shopRef)]);
        const pushed = (menuSnap.exists && menuSnap.data().shoppingPushed) || {};
        const cats = (shopSnap.exists && shopSnap.data().categories) || [];
        const existingItemByName = new Map();
        cats.forEach(c => (c.items || []).forEach(i => existingItemByName.set(String(i.name).trim().toLowerCase(), i)));

        const byName = new Map();
        slotItems.forEach(si => {
          const key = dishKey(si);
          // Старые записи shoppingPushed — просто true (до этого фикса, без
          // привязки к блюду). Трактуем как "было какое-то блюдо, но
          // неизвестно какое" и по-прежнему считаем совпадением (безопаснее
          // не задвоить, чем один раз не пропустить заведомо новое блюдо).
          const prev = si.slotId ? pushed[si.slotId] : undefined;
          const sameDish = prev === true || prev === key;
          _ingredientsForItem(si.id, si.source, si.name).forEach(ing => {
            const nameKey = String(ing.name || '').trim().toLowerCase();
            if (!nameKey) return;
            if (sameDish && existingItemByName.has(nameKey)) return; // то же блюдо, позиция всё ещё в закупке — не дублируем
            const existing = byName.get(nameKey);
            if (existing) existing.qty = _combineQty(existing.qty, ing.qty);
            else byName.set(nameKey, { name: ing.name, qty: ing.qty || '', category: ing.category, ingredientId: ing.ingredientId });
          });
        });

        byName.forEach((ing, key) => {
          const already = existingItemByName.get(key);
          if (already) {
            already.qty = _combineQty(already.qty, ing.qty);
            // Увеличили ТРЕБУЕМОЕ количество у уже отмеченной позиции —
            // старая отметка "куплено" была про старое (меньшее) количество,
            // а не про новый итог. Не переносим её молча на добавленное
            // количество, которое ещё никто не покупал. Реальный баг,
            // найден внешним ревью 2026-09-27.
            if (already.bought) already.bought = false;
          } else {
            const title = RecipesData.resolveShoppingCategory(ing.name, ing.category, ing.ingredientId);
            const cat = ShoppingState.findOrCreateCategory(cats, title);
            cat.items.push({
              id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
              name: ing.name, qty: ing.qty || '', bought: false,
            });
          }
          added++;
        });

        tx.set(shopRef, { categories: cats }, { merge: true });
        const newPushed = Object.assign({}, pushed);
        let pushedChanged = false;
        slotItems.forEach(si => {
          if (!si.slotId) return;
          const key = dishKey(si);
          if (newPushed[si.slotId] !== key) { newPushed[si.slotId] = key; pushedChanged = true; }
        });
        if (pushedChanged) tx.set(menuRef, { shoppingPushed: newPushed }, { merge: true });
      });
    } catch (e) {
      console.error('menu → shopping:', e);
      _flash('Не получилось добавить в закупку — проверь интернет');
      return null;
    }
    return { added, total: allIngredients.length };
  }

  function _syncFirebase() {
    const days = MenuState.getDays(_tripId);
    if (days) MenuFirebase.saveDays(_tripId, days);
  }

  function setDays(days) {
    _days = days;
  }

  function refresh() {
    const days = MenuState.getDays(_tripId);
    if (days) { _days = days; }
    _rerender();
  }

  return { render, setDays, refresh };
})();

'use strict';

/* globals TripsData, AppNav */

const TripCoverIndex = (() => {

  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const READINESS_ITEMS = [
    { key:'gear',     label:'Список снаряжения' },
    { key:'menu',     label:'Меню составлено'   },
    { key:'shopping', label:'Список закупки'     },
    { key:'medkit',   label:'Аптечка'            },
    { key:'tickets',  label:'Билеты куплены'     },
    { key:'route',    label:'Маршрут согласован' },
  ];

  let _tripId = null;
  let _guideHandler = null;

  function show(tripId) {
    _tripId = tripId;
    const trip = TripsData.getById(tripId);
    if (!trip) return;

    // Для завершённых поездок обложка показывает живую статистику улова
    // и расходов — подтягиваем её один раз (не через listen(), чтобы не
    // оборвать подписку уже открытых страниц Улов/Расходы) перед рендером.
    if (trip.status === 'done') {
      Promise.all([
        CatchesFirebase.getOnce(tripId),
        ExpensesFirebase.getOnce(tripId)
      ]).then(([catches, expenseData]) => {
        CatchesState.setCatches(tripId, catches);
        ExpensesState.setExpenses(tripId, expenseData.expenses);
        ExpensesState.setSettlements(tripId, expenseData.settlements);
        _renderCover(trip);
        _maybeRefreshWeather(trip);
      });
      return;
    }

    _renderCover(trip);
    _maybeRefreshWeather(trip);
  }

  // ── Погода по координатам поездки (см. shared/weather.js) — берём первую
  // реку с координатами: у AI-импорта они почти всегда есть, у вручную
  // заведённых "Рыбалок" — только если река выбрана живым поиском по OSM
  // (modules/trips/index.js), а не одним из старых статичных чипов без
  // координат. Результат кэшируем в trip.weather в Firestore, чтобы не
  // дёргать API на каждый показ обложки; прогноз (в отличие от факта)
  // считаем протухшим через 6 часов и обновляем заново.
  function _tripCoords(trip) {
    const impHit = (trip.importData?.rivers || []).find(r => r.lat != null && r.lon != null);
    if (impHit) return { lat: impHit.lat, lon: impHit.lon };
    const plainHit = (trip.rivers || []).find(r => r.lat != null && r.lon != null);
    if (plainHit) return { lat: plainHit.lat, lon: plainHit.lon };
    return null;
  }

  function _maybeRefreshWeather(trip) {
    if (typeof WeatherService === 'undefined') return;
    const coords = _tripCoords(trip);
    if (!coords) return;

    const w = trip.weather;
    const STALE_MS = 6 * 3600 * 1000;
    const isStale = !w || (w.source !== 'archive' && Date.now() - (w.fetchedAt || 0) > STALE_MS);
    if (!isStale) return;

    Promise.all([
      WeatherService.fetchForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate),
      WeatherService.fetchDailyForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate)
    ]).then(([weather, weatherDaily]) => {
        if (!weather) return;
        trip.weather = weather;
        trip.weatherDaily = weatherDaily || null;
        if (typeof TripsData !== 'undefined') {
          TripsData.updateTrip(trip.id, { weather, weatherDaily: weatherDaily || null });
        }
        const block = document.getElementById('cover-weather-block');
        if (block && _tripId === trip.id) block.outerHTML = _weatherSection(trip);
        _patchGuideWeather(trip);
      })
      .catch(() => {});
  }

  // Проставляет мини-бейджи погоды в уже отрисованный Гид (если он открыт
  // прямо сейчас) — плейсхолдеры для них рендерятся в _renderGuide сразу
  // (пустыми), а заполняются здесь, когда придут данные, без пересборки
  // всей страницы Гида.
  function _patchGuideWeather(trip) {
    if (!trip.weatherDaily || !trip.weatherDaily.length) return;
    const byDate = {};
    trip.weatherDaily.forEach(d => { byDate[d.date] = d; });
    document.querySelectorAll('[data-gwx-date]').forEach(el => {
      const entry = byDate[el.dataset.gwxDate];
      if (entry) el.innerHTML = _dayWeatherBadge(entry);
    });
  }

  function _dayWeatherBadge(entry) {
    if (!entry || entry.tMax == null || entry.tMin == null) return '';
    const precip = entry.precip ? ` · 🌧${Math.round(entry.precip * 10) / 10}мм` : '';
    return `🌡${Math.round(entry.tMin)}…${Math.round(entry.tMax)}°${precip}`;
  }

  function _addDaysStr(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _weatherSection(t) {
    const w = t.weather;
    if (!w) return '<div id="cover-weather-block"></div>';
    const title = w.source === 'forecast' ? 'Прогноз погоды' : 'Погода в поездке';
    return `
      <div class="cover-section" id="cover-weather-block">
        <div class="cover-section-head"><div class="cover-section-title">${title}</div></div>
        <div class="cover-conds">
          <div class="cover-cond">
            <div class="cover-cond-icon">🌡</div>
            <div class="cover-cond-val">${w.tMin}…${w.tMax}°</div>
            <div class="cover-cond-label">темп.</div>
          </div>
          <div class="cover-cond">
            <div class="cover-cond-icon">🌧</div>
            <div class="cover-cond-val">${w.precip} мм</div>
            <div class="cover-cond-label">осадки</div>
          </div>
          <div class="cover-cond">
            <div class="cover-cond-icon">🧭</div>
            <div class="cover-cond-val">${w.pressure}</div>
            <div class="cover-cond-label">гПа</div>
          </div>
          ${w.wind != null ? `
          <div class="cover-cond">
            <div class="cover-cond-icon">💨</div>
            <div class="cover-cond-val">${w.wind}</div>
            <div class="cover-cond-label">км/ч</div>
          </div>` : ''}
        </div>
      </div>`;
  }

  function _renderCover(trip) {
    document.getElementById('trip-cover')?.remove();

    const el = document.createElement('div');
    el.id = 'trip-cover';
    el.className = 'cover-page';
    el.innerHTML = _render(trip);
    document.body.appendChild(el);

    requestAnimationFrame(() => el.classList.add('visible'));
    _bind(el, trip);
  }

  function hide() {
    const el = document.getElementById('trip-cover');
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 350);
  }

  function _render(t) {
    const emoji  = t.type === 'expedition' ? (t.status === 'done' ? '🌲' : '🏔') : _seasonEmoji(t.startDate);
    const dates  = _dateRange(t.startDate, t.endDate);
    const location = (t.rivers || []).map(r => r.region).filter((v,i,a) => a.indexOf(v) === i).join(', ');

    return `
      <div class="cover-topbar">
        <button class="cover-back" id="coverBack">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="cover-top-info">
          <div class="cover-top-title">${_esc(t.name)}</div>
          <div class="cover-top-sub">${dates}</div>
        </div>
        <div style="display:flex;align-items:center;gap:8px">
          <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
          <button class="cover-icon-btn" id="coverInvite" title="Пригласить">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M16 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="17" y1="11" x2="23" y2="11"/></svg>
          </button>
          <button class="cover-icon-btn" id="coverGear" title="Снаряга">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M9 6V4a2 2 0 012-2h2a2 2 0 012 2v2"/><rect x="4" y="6" width="16" height="15" rx="2"/><path d="M4 11h16"/><path d="M9 16h.01M15 16h.01"/></svg>
          </button>
          ${window.APP?.user?.uid === t.ownerId ? `
          <button class="cover-icon-btn" id="coverEdit" title="Редактировать">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>` : ''}
        </div>
      </div>

      <div class="cover-scroll">
        ${_hero(t, emoji, dates, location)}
        ${t.status === 'upcoming' || t.status === 'active' ? _countdown(t) : ''}
        ${t.status === 'upcoming' && t.readiness ? _readiness(t) : ''}
        ${_weatherSection(t)}
        ${t.status === 'done' ? _doneContent(t) : ''}
        ${t.status === 'upcoming' ? _targetFish(t) : ''}
        <div style="height:16px"></div>
      </div>

      <div class="cover-footer">
        <button class="cover-btn-enter" id="coverEnter">
          ${t.status === 'done' ? 'Открыть поездку' : 'Войти в поездку'}
        </button>
      </div>`;
  }

  function _hero(t, emoji, dates, location) {
    const parts = (t.participants || []).map(p =>
      `<div class="cover-part-chip">${_esc(p)}</div>`).join('');

    return `
      <div class="cover-hero">
        <span class="cover-emoji">${emoji}</span>
        <div class="cover-name">${_esc(t.name)}</div>
        <div class="cover-meta">
          <div class="cover-meta-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <rect x="3" y="4" width="18" height="18" rx="2"/><line x1="16" y1="2" x2="16" y2="6"/>
              <line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/>
            </svg>
            ${dates}
          </div>
          ${location ? `
          <div class="cover-meta-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0118 0z"/><circle cx="12" cy="10" r="3"/>
            </svg>
            ${_esc(location)}
          </div>` : ''}
          ${t.rivers && t.rivers.length ? `
          <div class="cover-meta-row">
            <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0"/>
            </svg>
            ${_esc(t.rivers.map(r => r.name).join(', '))}
          </div>` : ''}
        </div>
        ${parts ? `<div class="cover-parts">${parts}</div>` : ''}
      </div>`;
  }

  function _countdown(t) {
    const days = Math.ceil((new Date(t.startDate) - new Date()) / 86400000);
    if (days <= 0) return '';
    return `
      <div class="cover-countdown">
        <div>
          <div class="cover-cd-num">${days}</div>
          <div class="cover-cd-days">дней</div>
        </div>
        <div class="cover-cd-info">
          <div class="cover-cd-name">До начала экспедиции</div>
          <div class="cover-cd-sub">${_esc((t.rivers||[]).map(r=>r.name).join(', '))}</div>
        </div>
      </div>`;
  }

  function _readiness(t) {
    const r = t.readiness || {};
    const done  = Object.values(r).filter(Boolean).length;
    const total = READINESS_ITEMS.length;
    const pct   = total ? Math.round(done / total * 100) : 0;

    return `
      <div class="cover-section">
        <div class="cover-section-head">
          <div class="cover-section-title">Готовность</div>
          <div style="font-size:15px;font-weight:800;color:var(--accent)" id="coverReadPct">${pct}%</div>
        </div>
        <div class="cover-readiness">
          <div class="cover-progress-track">
            <div class="cover-progress-fill" id="coverReadFill" style="width:${pct}%"></div>
          </div>
          <div class="cover-read-list">
            ${READINESS_ITEMS.map(item => `
              <div class="cover-read-row">
                <div class="cover-read-check ${r[item.key] ? 'done' : ''}"
                     data-cover-readiness="${item.key}" data-trip-id="${t.id}"
                     style="cursor:pointer">
                  ${r[item.key] ? '✓' : ''}
                </div>
                <span style="${r[item.key] ? 'color:var(--label3);text-decoration:line-through' : ''}">${item.label}</span>
              </div>`).join('')}
          </div>
        </div>
      </div>`;
  }

  function _doneContent(t) {
    let h = '';

    // Rating
    if (t.rating) {
      const pct = Math.round(t.rating / 10 * 100);
      h += `
        <div class="cover-section">
          <div class="cover-section-head">
            <div class="cover-section-title">Рейтинг поездки</div>
            <button class="cover-edit-btn" data-action="edit-rating">Изменить</button>
          </div>
          <div class="cover-rating-row">
            <div>
              <div class="cover-score-big">${t.rating}</div>
            </div>
            <div class="cover-score-den">/10</div>
            <div class="cover-score-track">
              <div class="cover-score-fill" style="width:${pct}%"></div>
            </div>
          </div>
        </div>`;
    }

    // Улов — живые данные (modules/catches/state.js), не старое статичное t.fish
    const stats = typeof CatchesState !== 'undefined' ? CatchesState.computeStats(t.id) : null;
    if (stats && stats.total) {
      h += `
        <div class="cover-section">
          <div class="cover-stats-grid">
            <div class="cover-stat">
              <div class="cover-stat-num">${stats.total}</div>
              <div class="cover-stat-label">рыб поймано</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-num">${stats.species}</div>
              <div class="cover-stat-label">${stats.species === 1 ? 'вид' : 'вида'}</div>
            </div>
          </div>
        </div>`;
      h += _barSection('Видовой состав', stats.topFish, '🐟', 'шт');
      h += _barSection('По участникам', stats.topMembers, '🎣', 'шт');
      h += _barSection('По рекам', stats.topRivers, '📍', 'шт');
    }

    // Расходы — живые данные (modules/expenses/state.js)
    const money = typeof ExpensesState !== 'undefined' ? ExpensesState.computeSummary(t.id) : null;
    if (money && money.total) {
      h += `
        <div class="cover-section">
          <div class="cover-section-head"><div class="cover-section-title">Расходы</div></div>
          <div class="cover-stats-grid">
            <div class="cover-stat">
              <div class="cover-stat-num">${_rub(money.total)}</div>
              <div class="cover-stat-label">всего</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-num">${_rub(money.avgShare)}</div>
              <div class="cover-stat-label">на человека</div>
            </div>
          </div>
          ${money.rows.map(r => {
            const sign = r.netDiff >= 0 ? '+' : '−';
            const cls  = r.netDiff >= 0 ? 'pos' : 'neg';
            return `
              <div class="cover-money-row">
                <div class="cover-money-name">${_esc(r.name)}</div>
                <div class="cover-money-meta">заплатил ${_rub(r.paid)}</div>
                <div class="cover-money-diff cover-money-diff--${cls}">${sign}${_rub(Math.abs(Math.round(r.netDiff)))}</div>
              </div>`;
          }).join('')}
          ${money.transfers.length ? `
            <div class="cover-money-transfers">
              ${money.transfers.map(tr => `
                <div class="cover-money-transfer">${_esc(tr.from)} → ${_esc(tr.to)} · ${_rub(tr.amount)}</div>`).join('')}
            </div>` : ''}
        </div>`;
    }

    // Comment
    if (t.comment) {
      h += `
        <div class="cover-section">
          <div class="cover-section-head">
            <div class="cover-section-title">Заметки</div>
            <button class="cover-edit-btn" data-action="edit-comment">Редактировать</button>
          </div>
          <div class="cover-comment">${_esc(t.comment)}</div>
        </div>`;
    }

    return h;
  }

  function _targetFish(t) {
    // Берём целевую рыбу из importData (поле targetFish из meta)
    const fish = t.importData?.meta?.targetFish || t.targetFish || null;
    if (!fish && (!t.rivers || !t.rivers.length)) return '';

    // Если есть реки из importData — показываем их краткий список
    const rivers = t.importData?.rivers || t.rivers || [];
    if (!rivers.length && !fish) return '';

    return `
      <div class="cover-section">
        <div class="cover-section-head">
          <div class="cover-section-title">Маршрут</div>
          ${t.importData ? '<div style="font-size:11px;color:var(--accent);font-weight:600">AI · импортировано</div>' : ''}
        </div>
        ${fish ? `
          <div class="cover-target-row">
            <div style="font-size:14px;font-weight:500">🎯 Целевая рыба</div>
            <div style="font-size:13px;color:var(--label2);font-weight:600">${_esc(fish)}</div>
          </div>` : ''}
        ${rivers.slice(0, 4).map(r => `
          <div class="cover-target-row">
            <div style="font-size:14px;font-weight:500">🎣 ${_esc(r.name)}</div>
            <div style="font-size:12px;color:var(--label3)">${_esc(r.day || r.type || '')}</div>
          </div>`).join('')}
        ${rivers.length > 4 ? `
          <div style="font-size:12px;color:var(--label4);padding:6px 0">
            + ещё ${rivers.length - 4} ${_pluralRiver(rivers.length - 4)}
          </div>` : ''}
      </div>`;
  }

  function _pluralRiver(n) {
    if (n % 10 === 1 && n % 100 !== 11) return 'река';
    if ([2,3,4].includes(n % 10) && ![12,13,14].includes(n % 100)) return 'реки';
    return 'рек';
  }

  function _bind(el, trip) {
    el.querySelector('#coverBack')?.addEventListener('click', hide);

    // Пригласить в эту поездку
    el.querySelector('#coverInvite')?.addEventListener('click', () => {
      if (typeof MembersRender !== 'undefined') MembersRender.showInvite(_tripId, trip.name);
    });

    // Редактировать поездку
    el.querySelector('#coverEdit')?.addEventListener('click', () => {
      hide();
      if (typeof TripsIndex !== 'undefined') TripsIndex.showEdit(_tripId);
    });

    // Снаряга — свой список под эту поездку
    el.querySelector('#coverGear')?.addEventListener('click', async () => {
      const uid = window.APP?.user?.uid;
      if (!uid || typeof GearData === 'undefined') return;
      await GearData.ensureLoaded(uid);
      if (GearData.hasTripSnapshot(_tripId)) {
        hide();
        _openGear(_tripId);
      } else {
        _showGearSourcePicker(trip);
      }
    });

    // Чекбоксы готовности
    el.addEventListener('click', e => {
      const check = e.target.closest('[data-cover-readiness]');
      if (!check) return;
      const key    = check.dataset.coverReadiness;
      const tripId = check.dataset.tripId;
      const t      = TripsData.getById(tripId);
      if (!t || !t.readiness) return;
      t.readiness[key] = !t.readiness[key];
      TripsData.updateTrip(tripId, { readiness: t.readiness });
      // обновляем UI
      const done = check.classList.toggle('done');
      check.textContent = done ? '✓' : '';
      const label = check.nextElementSibling;
      if (label) {
        label.style.color = done ? 'var(--label3)' : '';
        label.style.textDecoration = done ? 'line-through' : '';
      }
      // пересчитываем прогресс
      const total = READINESS_ITEMS.length;
      const doneCount = Object.values(t.readiness).filter(Boolean).length;
      const pct = Math.round(doneCount / total * 100);
      const pctEl  = document.getElementById('coverReadPct');
      const fillEl = document.getElementById('coverReadFill');
      if (pctEl)  pctEl.textContent  = pct + '%';
      if (fillEl) fillEl.style.width = pct + '%';
      // обновляем главную
      if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
    });

    el.querySelector('#coverEnter')?.addEventListener('click', () => {
      hide();
      enterTrip(_tripId);
    });
  }

  // Полный вход в поездку — переключает нижнюю вкладку/роутер на Гид,
  // проставляет window.APP.currentTripId/currentTripData (используется
  // Реки/Меню/Расходы и др.), рендерит сам Гид. Вынесено из обработчика
  // #coverEnter, чтобы им же мог пользоваться быстрый попап выбора поездки
  // (showQuickPicker) — минуя саму обложку.
  function enterTrip(tripId) {
    if (typeof AppNav !== 'undefined') AppNav.setActive('guide');
    if (typeof AppRouter !== 'undefined') AppRouter.show('guide');

    const trip = TripsData.getById(tripId);

    // ── Сохраняем текущую поездку глобально (используется Реки, Меню и др.) ──
    if (window.APP) {
      window.APP.currentTripId = tripId;
      // Если есть подробный AI-импорт — используем его (там больше данных
      // по каждой реке/точке). Иначе собираем минимальный объект из
      // самой поездки, чтобы список рек/участников не терялся у поездок,
      // заведённых вручную (см. rivers/index.js — читает tripData.rivers).
      window.APP.currentTripData = trip?.importData || (trip
        ? { name: trip.name, rivers: trip.rivers || [], participants: trip.participants || [] }
        : null);
    }
    if (typeof AppHeader !== 'undefined') AppHeader.render();

    const guideEl = document.getElementById('p-guide');
    if (!guideEl) return;

    // Если у экспедиции есть импортированные данные — рендерим маршрут
    if (trip?.importData?.route?.length) {
      guideEl.innerHTML = _renderGuide(trip);
      // Привязываем аккордеоны
      if (_guideHandler) guideEl.removeEventListener('click', _guideHandler);
      _guideHandler = e => {
        const hd = e.target.closest('[data-target]');
        if (!hd) return;
        const body = document.getElementById(hd.dataset.target);
        if (!body) return;
        const chev = hd.querySelector('.g-acc-chev');
        const open = body.classList.toggle('show');
        if (chev) chev.classList.toggle('open', open);
      };
      guideEl.addEventListener('click', _guideHandler);
      // Гид можно открыть и напрямую (быстрый выбор поездки), минуя
      // обложку — там же обычно и подтягивается/кэшируется погода,
      // так что дублируем вызов здесь, а не только в show().
      _maybeRefreshWeather(trip);
    } else {
      // Заглушка (рыбалки или экспедиции без импорта)
      guideEl.innerHTML = `
        <div style="padding:14px 16px 16px;background:var(--topbar-bg);color:#fff;font-size:18px;font-weight:700">
          ${trip ? _esc(trip.name) : 'Поездка'}
        </div>
        <div style="padding:24px 16px;color:var(--label3);font-size:15px;text-align:center;margin-top:40px">
          🚧 Маршрут не добавлен.<br><br>
          Загрузи JSON-файл от AI в настройках поездки.
        </div>`;
    }
  }

  // ── Быстрый выбор поездки — когда нажали нижнюю вкладку "Поездка", а
  // открытой поездки нет. Раньше сразу кидало в список ("Планы"); теперь,
  // если есть 2+ актуальных (не завершённых) поездки — короткий попап,
  // выбор сразу ведёт в Гид, без обложки/кнопки "Войти". Если актуальная
  // поездка ровно одна — заходим в неё сразу, без лишнего тапа. Если
  // актуальных нет вообще — как раньше, список поездок.
  function showQuickPicker() {
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getAll() : [])
      .filter(t => t.status !== 'done')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (!trips.length) {
      if (typeof onNavigate === 'function') onNavigate('trips');
      return;
    }
    if (trips.length === 1) {
      enterTrip(trips[0].id);
      return;
    }

    document.getElementById('trip-quickpick-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'trip-quickpick-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">В какую поездку?</div>
        <div class="tqp-list">
          ${trips.map(t => `
            <div class="tqp-row" data-trip-id="${t.id}">
              <div>
                <div class="tqp-name">${_esc(t.name)}</div>
                <div class="tqp-dates">${_dateRange(t.startDate, t.endDate)}</div>
              </div>
              <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
            </div>`).join('')}
        </div>
        <button class="tqp-all" data-action="tqp-all">Все поездки</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-trip-id]');
      if (row) { overlay.remove(); enterTrip(row.dataset.tripId); return; }
      if (e.target.closest('[data-action="tqp-all"]')) {
        overlay.remove();
        if (typeof onNavigate === 'function') onNavigate('trips');
      }
    });
  }

  // ── Снаряга: переход в модуль сразу на вкладке нужной поездки ──
  function _openGear(tripId) {
    if (window.APP) window.APP._gearOpenTrip = tripId;
    if (typeof onNavigate === 'function') onNavigate('gear');
  }

  // ── Снаряга: пикер источника при первом создании списка под поездку —
  // с нуля, из личного базового шаблона, или скопировать с любой другой
  // прошлой поездки пользователя (повторяющиеся направления типа Приобье). ──
  function _showGearSourcePicker(trip) {
    const uid = window.APP?.user?.uid;
    if (!uid || typeof GearData === 'undefined') return;
    const others = GearData.getTripList(uid).filter(t => t.id !== _tripId);

    document.getElementById('gear-source-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'gear-source-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Список снаряги — «${_esc(trip.name)}»</div>
        <div class="tqp-list">
          <div class="tqp-row" data-gear-source="template">
            <div class="tqp-name">Мой базовый шаблон</div>
          </div>
          <div class="tqp-row" data-gear-source="blank">
            <div class="tqp-name">Создать с нуля</div>
          </div>
          ${others.map(t => `
            <div class="tqp-row" data-gear-source="${t.id}">
              <div class="tqp-name">Как в «${_esc(t.name)}»</div>
            </div>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', async e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-gear-source]');
      if (!row) return;
      const source = row.dataset.gearSource;
      overlay.remove();
      try {
        if (typeof GearModule !== 'undefined') {
          await GearModule.createTripList(uid, _tripId, trip.name, source);
        }
      } catch (err) {
        console.error('GearModule.createTripList:', err);
        alert('Не удалось создать список снаряги. Проверь соединение и попробуй ещё раз.');
        return;
      }
      hide();
      _openGear(_tripId);
    });
  }

  // Helpers
  function _dateRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end);
    if (start === end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _seasonEmoji(dateStr) {
    const m = parseInt(dateStr.slice(5,7));
    if (m <= 2 || m === 12) return '❄️';
    if (m <= 4) return '🌱';
    if (m <= 8) return '☀️';
    return '🍂';
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _rub(val) {
    return Math.round(val || 0).toLocaleString('ru-RU') + ' ₽';
  }

  // Общая полоска "имя + бар + число" — переиспользуется для видового
  // состава, разбивки по участникам и по рекам (modules/catches/state.js
  // computeStats уже отдаёт эти три списка в одинаковой форме).
  function _barSection(title, items, icon, unit) {
    if (!items || !items.length) return '';
    const max = Math.max(...items.map(i => i.count));
    return `
      <div class="cover-section">
        <div class="cover-section-head"><div class="cover-section-title">${_esc(title)}</div></div>
        ${items.map(i => `
          <div class="cover-fish-row">
            <div class="cover-fish-name">${icon} ${_esc(i.name)}</div>
            <div class="cover-fish-bar-wrap">
              <div class="cover-fish-bar" style="width:${Math.round(i.count/max*100)}%"></div>
            </div>
            <div class="cover-fish-count">${i.count} ${unit}</div>
          </div>`).join('')}
      </div>`;
  }

  // ─── Рендер страницы Гид из importData ───────────────────────────────────

  function _renderGuide(trip) {
    const d    = trip.importData;
    const meta = d.meta || {};

    // Стрипаем эмодзи из строки (для рядов расписания)
    function _stripEmoji(s) {
      return String(s).replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
    }

    // Аккордеон-хелпер
    function _acc(title, bodyHtml, open) {
      const id = 'gacc_' + Math.random().toString(36).slice(2);
      return `
        <div class="g-acc">
          <div class="g-acc-hd" data-target="${id}">
            <span class="g-acc-title">${title}</span>
            <span class="g-acc-chev ${open ? 'open' : ''}">⌄</span>
          </div>
          <div class="g-acc-body ${open ? 'show' : ''}" id="${id}">${bodyHtml}</div>
        </div>`;
    }

    let h = `
      <style>
        .g-acc{background:var(--bg2);border-radius:var(--radius-md);margin:0 12px 10px;overflow:hidden}
        .g-acc-hd{display:flex;justify-content:space-between;align-items:center;padding:13px 15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
        .g-acc-hd:active{background:var(--bg3)}
        .g-acc-title{font-size:15px;font-weight:700;color:var(--label)}
        .g-acc-chev{font-size:18px;color:var(--label4);transition:transform 0.22s;line-height:1;flex-shrink:0}
        .g-acc-chev.open{transform:rotate(180deg)}
        .g-acc-body{display:none;border-top:0.5px solid var(--sep2)}
        .g-acc-body.show{display:block}
        .g-flight{display:flex;justify-content:space-between;align-items:center;padding:10px 15px;border-bottom:0.5px solid var(--sep2)}
        .g-flight:last-child{border-bottom:none}
        .g-flight-l{}
        .g-flight-route{font-size:14px;font-weight:600;color:var(--label)}
        .g-flight-num{font-size:12px;color:var(--label3);margin-top:2px}
        .g-flight-r{text-align:right}
        .g-flight-dep{font-size:13px;color:var(--accent);font-weight:500}
        .g-flight-arr{font-size:11px;color:var(--label3);margin-top:2px}
        .g-tide{display:grid;grid-template-columns:100px 1fr;gap:2px 10px;padding:9px 15px;border-bottom:0.5px solid var(--sep2);align-items:start}
        .g-tide:last-child{border-bottom:none}
        .g-tide-date{font-size:13px;font-weight:600;color:var(--label)}
        .g-tide-sun{font-size:11px;color:var(--label3);margin-top:1px}
        .g-tide-info{font-size:12px;color:var(--accent);line-height:1.5}
        .g-day-hd{display:flex;align-items:center;gap:10px;padding:11px 15px;cursor:pointer;border-top:0.5px solid var(--sep2);-webkit-tap-highlight-color:transparent}
        .g-day-hd:first-child{border-top:none}
        .g-day-hd:active{background:var(--bg3)}
        .g-day-title{font-size:13px;font-weight:700;color:var(--label);flex:1}
        .g-day-wx{font-size:11px;color:var(--label3);white-space:nowrap;flex-shrink:0}
        .g-day-body{display:none;border-top:0.5px solid var(--sep2)}
        .g-day-body.show{display:block}
        .g-row{display:flex;gap:12px;padding:8px 15px;border-bottom:0.5px solid var(--sep2)}
        .g-row:last-child{border-bottom:none}
        .g-row-time{font-size:11px;color:var(--label3);min-width:80px;flex-shrink:0;padding-top:2px;font-weight:500}
        .g-row-act{font-size:13px;color:var(--label);line-height:1.45}
      </style>
      <div style="background:var(--topbar-bg);color:#fff;padding:14px 16px 14px;position:sticky;top:0;z-index:10;margin-bottom:4px">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.4px">${_esc(trip.name)}</div>
        <div style="font-size:12px;opacity:0.72;margin-top:3px">${_esc(meta.subtitle || '')}</div>
      </div>`;

    // ── Авиабилеты ──────────────────────────────────────────────────────
    if (d.flights && d.flights.length) {
      let fb = '';
      d.flights.forEach(f => {
        fb += `<div class="g-flight">
          <div class="g-flight-l">
            <div class="g-flight-route">${_esc(f.route)}</div>
            <div class="g-flight-num">${_esc(f.flight || '')}</div>
          </div>
          <div class="g-flight-r">
            <div class="g-flight-dep">${_esc(f.dep)}</div>
            ${f.arr ? `<div class="g-flight-arr">прилёт ${_esc(f.arr)}</div>` : ''}
          </div>
        </div>`;
      });
      h += _acc('✈️ Авиабилеты', fb, true);
    }

    // ── Рассвет · Закат · Приливы ───────────────────────────────────────
    if (d.suntide && d.suntide.length) {
      let sb = '';
      d.suntide.forEach(s => {
        sb += `<div class="g-tide">
          <div>
            <div class="g-tide-date">${_esc(s.date)}</div>
            <div class="g-tide-sun">${_esc(s.sun)}</div>
          </div>
          <div class="g-tide-info">${_esc(s.tide)}</div>
        </div>`;
      });
      h += _acc('🌅 Рассвет · Закат · Приливы', sb, true);
    }

    // ── Маршрут по дням ─────────────────────────────────────────────────
    if (d.route && d.route.length) {
      // Даты у дней маршрута — не отдельное поле (это заголовок-текст типа
      // "День 1 — прилёт"), а последовательные дни от trip.startDate; на
      // этом допущении и матчим погоду по дате, ключ той же формы кладём в
      // data-gwx-date для _patchGuideWeather (данные почти всегда приходят
      // позже первого рендера — сетевой запрос).
      let rb = '';
      d.route.forEach((day, idx) => {
        const dayId = 'gday_' + idx;
        const isFirst = idx === 0;
        const wxDate = trip.startDate ? _addDaysStr(trip.startDate, idx) : '';
        const wxEntry = wxDate && trip.weatherDaily ? trip.weatherDaily.find(w => w.date === wxDate) : null;
        rb += `<div class="g-day-hd" data-target="${dayId}">
          <span class="g-day-title">${_esc(day.t)}</span>
          ${wxDate ? `<span class="g-day-wx" data-gwx-date="${wxDate}">${_dayWeatherBadge(wxEntry)}</span>` : ''}
          <span class="g-acc-chev ${isFirst ? 'open' : ''}">⌄</span>
        </div>
        <div class="g-day-body ${isFirst ? 'show' : ''}" id="${dayId}">`;
        (day.rows || []).forEach(row => {
          rb += `<div class="g-row">
            <span class="g-row-time">${_esc(row[0])}</span>
            <span class="g-row-act">${_esc(_stripEmoji(row[1]))}</span>
          </div>`;
        });
        rb += `</div>`;
      });
      h += _acc('Маршрут по дням', rb, true);
    }

    // ── Меню по дням (из AI-импорта — только чтение; живое планирование
    // с рецептами остаётся в отдельном разделе «Меню») ──────────────────
    if (d.menu && d.menu.length) {
      let mb = '';
      d.menu.forEach((day, idx) => {
        const dayId = 'gmenu_' + idx;
        mb += `<div class="g-day-hd" data-target="${dayId}">
          <span class="g-day-title">${_esc(day.day)}${day.date ? ' — ' + _esc(day.date) : ''}${day.special ? ' ★' : ''}</span>
          <span class="g-acc-chev">⌄</span>
        </div>
        <div class="g-day-body" id="${dayId}">`;
        (day.meals || []).forEach(meal => {
          mb += `<div class="g-row">
            <span class="g-row-time">${_esc(meal.type)}</span>
            <span class="g-row-act">${_esc(meal.text)}${meal.cocktail ? ' · 🍸 ' + _esc(meal.cocktail) : ''}</span>
          </div>`;
        });
        mb += `</div>`;
      });
      h += _acc('🍽️ Меню', mb, false);
    }

    h += `<div style="height:20px"></div>`;
    return h;
  }



  return { show, hide, enterTrip, showQuickPicker, getCurrentTripId: () => _tripId };
})();

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

  // Табы внутри Гида — Инфо (маршрут/погода/Windy, всегда первым, не
  // настраивается) плюс разделы поездки, которые раньше были достижимы
  // только через выезжающее меню. Каждый рендерит свой уже готовый
  // show()/init() прямо в #g-tab-panel — их модули не меняются, просто
  // зовём их с другим контейнером вместо отдельной полноэкранной страницы.
  // Набор/порядок настраиваемые (⚙ в полоске табов) и хранятся per-поездку
  // в trip.guideTabs — по умолчанию (поле не задано) видно всё.
  const _ALL_TAB_DEFS = {
    rivers:   { label: 'Реки' },
    menu:     { label: 'Меню' },
    bar:      { label: 'Бар' },
    catches:  { label: 'Улов' },
    expenses: { label: 'Расходы' },
    shopping: { label: 'Закупка' },
    safety:   { label: 'Безопасность' },
    recipes:  { label: 'Рецепты' },
  };
  const _DEFAULT_TAB_ORDER = ['rivers', 'menu', 'bar', 'catches', 'expenses', 'shopping', 'safety', 'recipes'];
  let _activeGuideTab = 'info';

  // Видимые табы этой поездки в нужном порядке, всегда с 'info' первым.
  // Фильтруем по _ALL_TAB_DEFS на случай устаревших/опечатанных id в старых
  // сохранённых trip.guideTabs.
  function _guideTabIds(trip) {
    const saved = (trip.guideTabs || []).filter(id => _ALL_TAB_DEFS[id]);
    return ['info', ...(saved.length ? saved : _DEFAULT_TAB_ORDER)];
  }

  // Публичная версия без 'info' — гамбургер-меню (shared/header.js)
  // фильтрует свои пункты Реки/Меню/Бар/Улов/Расходы/Закупка/Безопасность/
  // Рецепты по этому же списку, чтобы там не оставались табы, которые
  // выключили в настройках Гида (⚙).
  function visibleGuideTabs(trip) {
    return _guideTabIds(trip).filter(id => id !== 'info');
  }

  function show(tripId) {
    _tripId = tripId;
    const trip = TripsData.getById(tripId);
    if (!trip) return;

    // Для завершённых поездок обложка/Инфо показывает живую статистику
    // улова и расходов — подтягиваем один раз (не через listen(), чтобы не
    // оборвать подписку уже открытых страниц Улов/Расходы) перед рендером.
    const prefetchDone = trip.status === 'done'
      ? Promise.all([CatchesFirebase.getOnce(tripId), ExpensesFirebase.getOnce(tripId)])
          .then(([catches, expenseData]) => {
            CatchesState.setCatches(tripId, catches);
            ExpensesState.setExpenses(tripId, expenseData.expenses);
            ExpensesState.setSettlements(tripId, expenseData.settlements);
          })
      : Promise.resolve();

    // Простые "Рыбалки" (без AI-импорта) — без промежуточной обложки,
    // сразу в Гид; всё, что раньше показывала обложка, теперь живёт в
    // табе "Инфо" (см. _renderFishingInfo). Экспедиции — обложка как была.
    if (trip.type === 'fishing') {
      prefetchDone.then(() => enterTrip(tripId));
      return;
    }

    prefetchDone.then(() => {
      _renderCover(trip);
      _maybeRefreshWeather(trip);
    });
  }

  // ── Погода по координатам поездки (см. shared/weather.js) — берём первую
  // реку с координатами: у AI-импорта они почти всегда есть, у вручную
  // заведённых "Рыбалок" — только если река выбрана живым поиском по OSM
  // (modules/trips/index.js), а не одним из старых статичных чипов без
  // координат. Результат кэшируем в trip.weather в Firestore, чтобы не
  // дёргать API на каждый показ обложки; прогноз (в отличие от факта)
  // считаем протухшим через 6 часов и обновляем заново.
  function _tripCoords(trip) {
    // Точка, вручную поставленная кнопкой "Моё местоположение" — приоритет
    // выше импортированных рек: это явное действие человека прямо на месте,
    // надёжнее любой реки "по умолчанию" (тем более если их несколько).
    if (trip.weatherCoords && trip.weatherCoords.lat != null) return trip.weatherCoords;
    const impHit = (trip.importData?.rivers || []).find(r => r.lat != null && r.lon != null);
    if (impHit) return { lat: impHit.lat, lon: impHit.lon };
    const plainHit = (trip.rivers || []).find(r => r.lat != null && r.lon != null);
    if (plainHit) return { lat: plainHit.lat, lon: plainHit.lon };
    return null;
  }

  function _maybeRefreshWeather(trip, force) {
    if (typeof WeatherService === 'undefined') return;
    const coords = _tripCoords(trip);
    if (!coords) return;

    const w = trip.weather;
    const STALE_MS = 6 * 3600 * 1000;
    // Архивная погода прошедшего дня не протухает по времени — но если это
    // однодневная поездка и почасовых данных ещё нет (например, старая
    // поездка, кэшированная до появления часового графика), это отдельная
    // причина дёрнуть обновление, даже когда w уже "archive" и вечно свежий.
    const missingHourly = trip.startDate === trip.endDate && !trip.weatherHourly;
    const isStale = force || !w || missingHourly || (w.source !== 'archive' && Date.now() - (w.fetchedAt || 0) > STALE_MS);
    if (!isStale) return;

    // Однодневная рыбалка — суточный максимум/минимум почти бесполезен,
    // важнее как погода меняется в течение самого этого дня, поэтому
    // дополнительно тянем почасовые данные (см. _weatherChartsSection).
    const isSingleDay = trip.startDate === trip.endDate;
    const hourlyPromise = isSingleDay
      ? WeatherService.fetchHourlyForTrip(coords.lat, coords.lon, trip.startDate)
      : Promise.resolve(null);

    Promise.all([
      WeatherService.fetchForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate),
      WeatherService.fetchDailyForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate),
      hourlyPromise
    ]).then(([weather, weatherDaily, weatherHourly]) => {
        if (!weather) return;
        trip.weather = weather;
        trip.weatherDaily = weatherDaily || null;
        trip.weatherHourly = weatherHourly || null;
        if (typeof TripsData !== 'undefined') {
          TripsData.updateTrip(trip.id, { weather, weatherDaily: weatherDaily || null, weatherHourly: weatherHourly || null });
        }
        const block = document.getElementById('cover-weather-block');
        if (block && _tripId === trip.id) block.outerHTML = _weatherSection(trip);
        const chartsBlock = document.getElementById('g-weather-charts');
        if (chartsBlock && _tripId === trip.id) chartsBlock.outerHTML = _weatherChartsSection(trip);
        _patchGuideWeather(trip);
      })
      .catch(() => {});
  }

  // Кнопка "Моё местоположение" в блоках погоды — полезна, когда у поездки
  // вообще нет координат (обычная "Рыбалка" без импорта/OSM-поиска рек), или
  // когда человек уже реально на месте и хочет погоду именно отсюда, а не
  // от той точки, что подтянулась при заведении поездки. Once поставлена —
  // становится приоритетным источником координат для этой поездки
  // (см. _tripCoords) и остаётся, пока не переставят заново.
  function _useMyLocation(tripId, btn) {
    if (!navigator.geolocation) { alert('Геолокация не поддерживается этим браузером'); return; }
    if (btn) { btn.textContent = 'Определяю…'; btn.disabled = true; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const trip = TripsData.getById(tripId);
        if (!trip) return;
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        trip.weatherCoords = coords;
        trip.weather = null;
        trip.weatherDaily = null;
        await TripsData.updateTrip(tripId, { weatherCoords: coords, weather: null, weatherDaily: null });
        const block = document.getElementById('cover-weather-block');
        if (block && _tripId === tripId) block.outerHTML = _weatherSection(trip);
        const todayEl = document.getElementById('g-today-weather');
        if (todayEl) todayEl.innerHTML = _todayWeatherBlock(trip);
        _maybeRefreshWeather(trip, true);
      },
      err => {
        if (btn) { btn.textContent = '📍 Моё местоположение'; btn.disabled = false; }
        alert('Не удалось определить местоположение: ' + (err.message || 'проверь разрешение геолокации в браузере'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
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
    const todayEl = document.getElementById('g-today-weather');
    if (todayEl) todayEl.innerHTML = _todayWeatherBlock(trip);
  }

  function _dayWeatherBadge(entry) {
    if (!entry || entry.tMax == null || entry.tMin == null) return '';
    const precip = entry.precip ? ` · 🌧${Math.round(entry.precip * 10) / 10}мм` : '';
    return `🌡${Math.round(entry.tMin)}…${Math.round(entry.tMax)}°${precip}`;
  }

  // Подсказка по клёву на основе народных примет (не научный прогноз!):
  // стабильное давление — хорошо, резкий скачок в любую сторону — плохо,
  // сильный ветер — рыба уходит на глубину, лёгкий дождь — часто оживляет
  // клёв. prevEntry — сосед по тому же trip.weatherDaily (день перед),
  // берём бесплатно из уже загруженного массива, без отдельного запроса.
  function _fishingHint(entry, prevEntry) {
    if (entry.pressure == null) return null;
    let mood = 'ok';
    const parts = [];

    if (prevEntry && prevEntry.pressure != null) {
      const delta = entry.pressure - prevEntry.pressure;
      if (Math.abs(delta) < 1)      { parts.push('давление стабильно — неплохое время для рыбалки'); mood = 'good'; }
      else if (Math.abs(delta) >= 3) { parts.push('давление резко меняется — клёв, вероятно, слабее обычного'); mood = 'bad'; }
      else                            parts.push('давление немного ' + (delta > 0 ? 'растёт' : 'падает') + ' — клёв может быть неровным');
    }

    if (entry.wind != null && entry.wind >= 30) {
      parts.push('сильный ветер — рыба может уйти на глубину');
      mood = 'bad';
    }
    if (entry.precip != null && entry.precip > 0 && entry.precip <= 3 && mood !== 'bad') {
      parts.push('небольшой дождь часто оживляет клёв');
    }

    if (!parts.length) return null;
    return { mood, text: parts.join('; ') };
  }

  // Подробная карточка "Погода на сегодня" вверху Гида — та же дневная
  // выборка (trip.weatherDaily), что и мини-бейджи в "Маршрут по дням",
  // просто отфильтрованная на день с реальной сегодняшней датой и
  // развёрнутая в полный набор показателей вместо одной строки.
  function _todayWeatherBlock(trip) {
    if (!trip.weatherDaily || !trip.weatherDaily.length) return '';
    const todayISO = new Date().toISOString().slice(0, 10);
    const idx = trip.weatherDaily.findIndex(w => w.date === todayISO);
    const entry = idx >= 0 ? trip.weatherDaily[idx] : null;
    if (!entry || entry.tMax == null) return '';
    const prevEntry = idx > 0 ? trip.weatherDaily[idx - 1] : null;
    const hint = _fishingHint(entry, prevEntry);

    const d = new Date(todayISO);
    const dateLabel = d.toLocaleDateString('ru', { day: 'numeric', month: 'long' });

    return `
      <div class="g-wx-card">
        <div class="g-wx-hd">
          <span class="g-wx-badge">Погода сегодня</span>
          <span class="g-wx-date">${_esc(dateLabel)}</span>
          <button class="g-wx-geo" data-action="geo-weather" title="Обновить по моей геопозиции">📍</button>
        </div>
        <div class="g-wx-temp">${Math.round(entry.tMin)}…${Math.round(entry.tMax)}°</div>
        <div class="g-wx-grid">
          <div class="g-wx-item"><div class="g-wx-ic">🌧</div><div class="g-wx-val">${entry.precip ? (Math.round(entry.precip*10)/10 + ' мм') : '0 мм'}</div><div class="g-wx-lbl">осадки</div></div>
          <div class="g-wx-item"><div class="g-wx-ic">💨</div><div class="g-wx-val">${entry.wind != null ? Math.round(entry.wind) : '—'}</div><div class="g-wx-lbl">км/ч</div></div>
          <div class="g-wx-item"><div class="g-wx-ic">🧭</div><div class="g-wx-val">${entry.pressure != null ? Math.round(entry.pressure) : '—'}</div><div class="g-wx-lbl">гПа</div></div>
        </div>
        ${(entry.sunrise || entry.sunset) ? `
        <div class="g-wx-sun">
          <div class="g-wx-sun-item"><span class="g-wx-ic">🌅</span><span class="g-wx-val">${entry.sunrise || '—'}</span><span class="g-wx-lbl">восход</span></div>
          <div class="g-wx-sun-item"><span class="g-wx-ic">🌇</span><span class="g-wx-val">${entry.sunset || '—'}</span><span class="g-wx-lbl">закат</span></div>
        </div>` : ''}
        ${hint ? `<div class="g-wx-hint g-wx-hint-${hint.mood}">🎣 ${_esc(hint.text)}</div>` : ''}
      </div>`;
  }

  function _addDaysStr(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  function _weatherSection(t) {
    const w = t.weather;
    if (!w) {
      if (_tripCoords(t)) return '<div id="cover-weather-block"></div>';
      return `
        <div class="cover-section" id="cover-weather-block">
          <div class="cover-section-head"><div class="cover-section-title">Погода</div></div>
          <div style="padding:14px 16px 16px;text-align:center">
            <div style="font-size:13px;color:var(--label3);margin-bottom:10px">Координаты не определены</div>
            <button class="cover-edit-btn" data-action="geo-weather" style="background:rgba(10,132,255,.1);border-radius:10px;padding:8px 14px">📍 Моё местоположение</button>
          </div>
        </div>`;
    }
    const title = w.source === 'forecast' ? 'Прогноз погоды' : 'Погода в поездке';
    return `
      <div class="cover-section" id="cover-weather-block">
        <div class="cover-section-head">
          <div class="cover-section-title">${title}</div>
          <button class="cover-edit-btn" data-action="geo-weather" title="Обновить по моей геопозиции">📍</button>
        </div>
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

  // Катмул-Ром → кубический Безье — сглаживает ломаную из точек в мягкую
  // кривую без единой сторонней библиотеки (её на этот случай тащить не
  // за чем). Классика для таких мини-графиков.
  function _smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  // ── Мини-графики погоды по дням, без внешних библиотек — обычный inline
  // SVG. Плавная кривая (Катмул-Ром) с градиентной заливкой под ней — вид
  // как в погоде Apple. Один ряд — заливка от линии до нуля; два ряда
  // (макс/мин температуры) — заливка полосой между ними. Работает и на
  // одной точке (однодневная рыбалка) — рисует просто маркер со значением.
  function _areaChartSvg(series, opts) {
    opts = opts || {};
    const width = opts.width || 280, chartH = opts.height || 72, pad = 8, labelSpace = 18;
    const axisH = opts.axis ? 16 : 0;
    const arrowH = opts.directions ? 18 : 0;
    const height = chartH + axisH + arrowH;
    const allVals = series.flatMap(s => s.values).filter(v => v != null);
    if (!allVals.length) return '';
    const n = Math.max(...series.map(s => s.values.length));
    const min = opts.min != null ? Math.min(opts.min, ...allVals) : Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;
    const x = i => n > 1 ? (i / (n - 1)) * (width - pad * 2) + pad : width / 2;
    const y = v => chartH - pad - ((v - min) / range) * (chartH - pad * 2 - labelSpace);
    const baseY = chartH - pad;
    const fmt = opts.fmt || (v => Math.round(v));
    const labelEvery = opts.labelEvery || 1;
    const gid = 'gchart_' + Math.random().toString(36).slice(2);

    const pointsFor = s => s.values.map((v, i) => v != null ? [x(i), y(v)] : null).filter(Boolean);

    let defs, fill, lines = '', labels = '';

    if (series.length === 2) {
      // Полоса между макс и мин — как ленты температуры в аппловой погоде.
      const ptsTop = pointsFor(series[0]);
      const ptsBot = pointsFor(series[1]);
      const pathTop = _smoothPath(ptsTop);
      const pathBotRev = _smoothPath([...ptsBot].reverse()).replace('M', 'L');
      defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${series[0].color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${series[1].color}" stop-opacity="0.08"/>
      </linearGradient>`;
      fill = ptsTop.length > 1
        ? `<path d="${pathTop} ${pathBotRev} Z" fill="url(#${gid})" stroke="none"/>`
        : '';
      lines = `<path d="${pathTop}" fill="none" stroke="${series[0].color}" stroke-width="2" stroke-linecap="round"/>`
             + `<path d="${_smoothPath(ptsBot)}" fill="none" stroke="${series[1].color}" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      const s = series[0];
      const pts = pointsFor(s);
      const path = _smoothPath(pts);
      defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${s.color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
      </linearGradient>`;
      fill = pts.length > 1
        ? `<path d="${path} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z" fill="url(#${gid})" stroke="none"/>`
        : '';
      lines = `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round"/>`;
    }

    // Крайние подписи центрированным text-anchor вылезали бы за viewBox
    // и обрезались (первая цифра пропадала) — у краёв якорим к точке
    // изнутри графика, а не по центру. labelEvery прореживает подписи на
    // плотных графиках — сама кривая всё равно идёт через каждую точку,
    // подписаны только некоторые (раньше ещё насильно подписывалась самая
    // последняя точка независимо от labelEvery — из-за этого на часовых
    // графиках подписи у самого края слипались, теперь чисто по шагу).
    series.forEach(s => {
      s.values.forEach((v, i) => {
        if (v == null || i % labelEvery !== 0) return;
        const anchor = i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle');
        labels += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"/>`
                +  `<text x="${x(i)}" y="${y(v) - 8}" font-size="10" fill="${s.color}" text-anchor="${anchor}">${fmt(v)}</text>`;
      });
    });

    // Встроенная в тот же SVG шкала времени/дат снизу — только когда явно
    // просят (opts.axis), иначе ось рисуется отдельным HTML-блоком под
    // графиком (см. _weatherChartsSection) как и было для дневного вида.
    let axisSvg = '';
    if (opts.axis) {
      const ticks = opts.axis;
      axisSvg = ticks.map((lbl, i) => {
        if (lbl == null) return '';
        const anchor = i === 0 ? 'start' : (i === ticks.length - 1 ? 'end' : 'middle');
        return `<text x="${x(i)}" y="${chartH + 12}" font-size="9" fill="var(--label4)" text-anchor="${anchor}">${_esc(lbl)}</text>`;
      }).join('');
    }

    // Стрелки направления ветра — своя строка над самим графиком, не
    // привязана к шкале скорости (это два разных измерения). 0° = север,
    // стрелка смотрит туда, откуда дует ветер (как флюгер).
    let arrowsSvg = '';
    if (opts.directions) {
      arrowsSvg = opts.directions.map((deg, i) => {
        if (deg == null || i % labelEvery !== 0) return '';
        return `<path d="M0,-5 L3.5,3.5 L-3.5,3.5 Z" fill="var(--label3)" transform="translate(${x(i)},9) rotate(${deg})"/>`;
      }).join('');
    }

    return `<svg viewBox="0 0 ${width} ${height}" width="${opts.fixedWidth ? width : '100%'}" height="${height}" preserveAspectRatio="none">
      ${arrowsSvg}
      <g transform="translate(0,${arrowH})"><defs>${defs}</defs>${fill}${lines}${labels}${axisSvg}</g>
    </svg>`;
  }

  function _weatherChartsDaily(daily) {
    // Подпись по каждому дню, а не только по первому/последнему — месяц
    // указываем только там, где он меняется, чтобы не повторять его на
    // каждой отметке. Точки на самом графике идут вровень (x = i/(n-1)),
    // поэтому space-between даёт подписи ровно под своими точками.
    let _prevMonth = null;
    const axis = `<div class="g-chart-axis">${daily.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      const m = dt.getMonth();
      const showMonth = m !== _prevMonth;
      _prevMonth = m;
      const label = dt.getDate() + (showMonth ? ' ' + MONTHS_GEN[m].slice(0, 3) : '');
      return `<span>${_esc(label)}</span>`;
    }).join('')}</div>`;

    const tempChart = _areaChartSvg([
      { values: daily.map(d => d.tMax), color: 'var(--orange)' },
      { values: daily.map(d => d.tMin), color: 'var(--accent)' },
    ]);
    const precipChart = _areaChartSvg(
      [{ values: daily.map(d => d.precip || 0), color: 'var(--accent)' }],
      { min: 0, fmt: v => Math.round(v * 10) / 10 }
    );
    const hasWind = daily.some(d => d.wind != null);
    const hasPressure = daily.some(d => d.pressure != null);
    const windChart = hasWind ? _areaChartSvg([{ values: daily.map(d => d.wind), color: 'var(--label2)' }], { min: 0 }) : '';
    const pressureChart = hasPressure ? _areaChartSvg([{ values: daily.map(d => d.pressure), color: 'var(--label2)' }]) : '';

    return `
      <div class="g-chart-block"><div class="g-chart-label">🌡 Температура, °C (макс/мин)</div>${tempChart}${axis}</div>
      <div class="g-chart-block"><div class="g-chart-label">🌧 Осадки, мм</div>${precipChart}${axis}</div>
      ${windChart ? `<div class="g-chart-block"><div class="g-chart-label">💨 Ветер, км/ч</div>${windChart}${axis}</div>` : ''}
      ${pressureChart ? `<div class="g-chart-block"><div class="g-chart-label">🧭 Давление, гПа</div>${pressureChart}${axis}</div>` : ''}`;
  }

  // Однодневная поездка — сутки уже сегодня/завтра, макс/мин за весь день
  // почти ничего не говорит (день один, сравнивать не с чем), а вот как
  // погода поменяется в течение дня — как раз то, что нужно перед
  // выездом. 280px на 24 часа зажимало точки в ~11px друг от друга — не
  // влезала подпись даже раз в 3 часа. Вместо сжатия — честная ширина по
  // часу (44px на точку) и горизонтальный скролл, как часовая лента в
  // погоде Apple; подписан каждый час, ничего не прорежено.
  function _weatherChartsHourly(hourly) {
    const HOUR_W = 44;
    const chartWidth = hourly.length * HOUR_W;
    const ticks = hourly.map(h => String(parseInt(h.time, 10)));
    const chartOpts = { axis: ticks, width: chartWidth, fixedWidth: true };

    const tempChart = _areaChartSvg([{ values: hourly.map(h => h.temp), color: 'var(--orange)' }], chartOpts);
    const precipChart = _areaChartSvg(
      [{ values: hourly.map(h => h.precip || 0), color: 'var(--accent)' }],
      { ...chartOpts, min: 0, fmt: v => Math.round(v * 10) / 10 }
    );
    const hasWind = hourly.some(h => h.wind != null);
    const hasDir  = hourly.some(h => h.windDir != null);
    const hasPressure = hourly.some(h => h.pressure != null);
    const windChart = hasWind ? _areaChartSvg(
      [{ values: hourly.map(h => h.wind), color: 'var(--label2)' }],
      { ...chartOpts, min: 0, directions: hasDir ? hourly.map(h => h.windDir) : null }
    ) : '';
    const pressureChart = hasPressure ? _areaChartSvg([{ values: hourly.map(h => h.pressure), color: 'var(--label2)' }], chartOpts) : '';

    const wrap = svg => svg ? `<div class="g-chart-scroll">${svg}</div>` : '';

    return `
      <div class="g-chart-block"><div class="g-chart-label">🌡 Температура, °C</div>${wrap(tempChart)}</div>
      <div class="g-chart-block"><div class="g-chart-label">🌧 Осадки, мм</div>${wrap(precipChart)}</div>
      ${windChart ? `<div class="g-chart-block"><div class="g-chart-label">💨 Ветер, км/ч</div>${wrap(windChart)}</div>` : ''}
      ${pressureChart ? `<div class="g-chart-block"><div class="g-chart-label">🧭 Давление, гПа</div>${wrap(pressureChart)}</div>` : ''}`;
  }

  // Подробная погода поездки — отдельный график на параметр, вместо одних
  // только текущих бейджей. Однодневная поездка — по часам (см. выше),
  // многодневная — по дням. Данные уже загружены (см. _maybeRefreshWeather
  // / shared/weather.js), новый запрос отсюда не идёт.
  function _weatherChartsSection(trip) {
    const isSingleDay = trip.startDate === trip.endDate;
    const hourly = trip.weatherHourly;
    const daily = trip.weatherDaily;

    let title, body;
    if (isSingleDay && hourly && hourly.length) {
      title = 'Погода по часам';
      body = _weatherChartsHourly(hourly);
    } else if (daily && daily.length) {
      title = 'Погода по дням';
      body = _weatherChartsDaily(daily);
    } else {
      return '';
    }

    return `
      <div class="cover-section" id="g-weather-charts">
        <div class="cover-section-head"><div class="cover-section-title">${title}</div></div>
        ${body}
      </div>`;
  }

  // Таб "Инфо" для простой "Рыбалки" (без AI-импорта) — раньше это была
  // голая заглушка "Маршрут не добавлен", а всё, что реально относилось к
  // такой поездке (шапка/погода/готово-статистика/действия), жило на
  // отдельной обложке-странице перед входом в Гид. Теперь обложка для
  // рыбалок вообще не рендерится (см. show()) — всё это переехало сюда.
  function _renderFishingInfo(trip) {
    const emoji = _seasonEmoji(trip.startDate);
    const dates = _dateRange(trip.startDate, trip.endDate);
    const location = (trip.rivers || []).map(r => r.region).filter((v, i, a) => a.indexOf(v) === i).join(', ');
    const isOwner = window.APP?.user?.uid === trip.ownerId;

    // Рейтинг/статистика улова-расходов/комментарий — та же логика, что
    // была на обложке (_doneContent уже сама решает, что показывать,
    // по наличию данных); плюс "добавить" для того, чего ещё нет.
    const hasRating  = trip.rating != null;
    const hasComment = !!trip.comment;
    const windy = _windyAccordion(trip);

    return `
      ${_hero(trip, emoji, dates, location)}
      <div class="g-info-actions">
        <button class="g-info-act-btn" data-action="info-invite">➕ Пригласить</button>
        <button class="g-info-act-btn" data-action="info-gear">🎒 Снаряга</button>
        ${isOwner ? `<button class="g-info-act-btn" data-action="info-edit">✏️ Редактировать</button>` : ''}
      </div>
      ${_weatherChartsSection(trip)}
      ${windy ? `<div class="g-info-gap">${windy}</div>` : ''}
      ${_doneContent(trip)}
      ${trip.status === 'done' && !hasRating ? `
        <div class="cover-section"><button class="g-info-add-btn" data-action="info-add-rating">+ Оценить поездку</button></div>` : ''}
      ${!hasComment ? `
        <div class="cover-section"><button class="g-info-add-btn" data-action="info-add-comment">+ Добавить заметку</button></div>` : ''}
    `;
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

    // Моё местоположение — ставит координаты вручную и перетягивает погоду
    el.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="geo-weather"]');
      if (!btn) return;
      _useMyLocation(trip.id, btn);
    });

    el.querySelector('[data-action="edit-rating"]')?.addEventListener('click', () => _showEditRating(trip));
    el.querySelector('[data-action="edit-comment"]')?.addEventListener('click', () => _showEditComment(trip));
  }

  // Кнопки "Изменить"/"Редактировать" у рейтинга и заметок на обложке
  // завершённой поездки были просто без обработчика — чиню тут же, раз уж
  // рядом. Правки — прямо в объект trip (та же ссылка, что живёт в
  // TripsState) + запись в Firestore, как и остальные точечные апдейты
  // обложки (см. _useMyLocation), затем перерисовка всей обложки.
  // onRefresh — что перерисовать после сохранения: по умолчанию обложка
  // (вызов с завершённой обложки), но таб "Инфо" рыбалки зовёт с другим
  // колбэком (там своей обложки нет, перерисовывать нужно сам таб).
  function _showEditRating(trip, onRefresh) {
    document.getElementById('tc-edit-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'tc-edit-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Рейтинг поездки</div>
        <input type="number" id="tcEditRating" class="tc-edit-input" min="0" max="10" step="1" value="${trip.rating ?? ''}" placeholder="0–10">
        <button class="tqp-all" data-action="tc-edit-save">Сохранить</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', async e => {
      if (e.target === overlay) { overlay.remove(); return; }
      if (!e.target.closest('[data-action="tc-edit-save"]')) return;
      let val = parseInt(document.getElementById('tcEditRating')?.value, 10);
      if (!Number.isFinite(val)) val = null;
      else val = Math.max(0, Math.min(10, val));
      trip.rating = val;
      overlay.remove();
      await TripsData.updateTrip(trip.id, { rating: val });
      (onRefresh || (() => _renderCover(trip)))();
    });
  }

  function _showEditComment(trip, onRefresh) {
    document.getElementById('tc-edit-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'tc-edit-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Заметки</div>
        <textarea id="tcEditComment" class="tc-edit-textarea" placeholder="На что клевало, что взять в следующий раз...">${_esc(trip.comment || '')}</textarea>
        <button class="tqp-all" data-action="tc-edit-save">Сохранить</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', async e => {
      if (e.target === overlay) { overlay.remove(); return; }
      if (!e.target.closest('[data-action="tc-edit-save"]')) return;
      const val = document.getElementById('tcEditComment')?.value.trim() || '';
      trip.comment = val;
      overlay.remove();
      await TripsData.updateTrip(trip.id, { comment: val });
      (onRefresh || (() => _renderCover(trip)))();
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
    if (!trip) { guideEl.innerHTML = ''; return; }

    _activeGuideTab = 'info';
    guideEl.innerHTML = _renderGuideShell(trip);

    if (_guideHandler) guideEl.removeEventListener('click', _guideHandler);
    _guideHandler = e => {
      const tabBtn = e.target.closest('[data-gtab]');
      if (tabBtn) { _mountGuideTab(trip, tabBtn.dataset.gtab); return; }
      const settingsBtn = e.target.closest('[data-action="guide-tabs-settings"]');
      if (settingsBtn) { _showGuideTabsSettings(trip); return; }
      const geoBtn = e.target.closest('[data-action="geo-weather"]');
      if (geoBtn) { _useMyLocation(trip.id, geoBtn); return; }

      // Действия таба "Инфо" у простой рыбалки — те же обработчики, что
      // раньше были на кнопках обложки (#coverInvite/#coverGear/#coverEdit),
      // теперь просто как кнопки внутри самого таба.
      if (e.target.closest('[data-action="info-invite"]')) {
        if (typeof MembersRender !== 'undefined') MembersRender.showInvite(trip.id, trip.name);
        return;
      }
      if (e.target.closest('[data-action="info-edit"]')) {
        if (typeof TripsIndex !== 'undefined') TripsIndex.showEdit(trip.id);
        return;
      }
      if (e.target.closest('[data-action="info-gear"]')) {
        const uid = window.APP?.user?.uid;
        if (uid && typeof GearData !== 'undefined') {
          GearData.ensureLoaded(uid).then(() => {
            if (GearData.hasTripSnapshot(trip.id)) _openGear(trip.id);
            else _showGearSourcePicker(trip);
          });
        }
        return;
      }
      if (e.target.closest('[data-action="info-add-rating"]') || e.target.closest('[data-action="edit-rating"]')) {
        _showEditRating(trip, () => _mountGuideTab(trip, 'info'));
        return;
      }
      if (e.target.closest('[data-action="info-add-comment"]') || e.target.closest('[data-action="edit-comment"]')) {
        _showEditComment(trip, () => _mountGuideTab(trip, 'info'));
        return;
      }

      const hd = e.target.closest('[data-target]');
      if (!hd) return;
      const body = document.getElementById(hd.dataset.target);
      if (!body) return;
      const chev = hd.querySelector('.g-acc-chev');
      const open = body.classList.toggle('show');
      if (chev) chev.classList.toggle('open', open);
      if (open) {
        const frame = body.querySelector('iframe[data-src]');
        if (frame) { frame.src = frame.dataset.src; frame.removeAttribute('data-src'); }
      }
    };
    guideEl.addEventListener('click', _guideHandler);

    _mountGuideTab(trip, 'info');
  }

  function _renderTabStrip(trip) {
    const ids = _guideTabIds(trip);
    const pills = ids.map(id => {
      const label = id === 'info' ? 'Инфо' : _ALL_TAB_DEFS[id].label;
      return `<div class="g-tab ${id === _activeGuideTab ? 'active' : ''}" data-gtab="${id}">${_esc(label)}</div>`;
    }).join('');
    return `<div class="g-tabstrip" id="g-tabstrip">${pills}<button class="g-tab-settings" data-action="guide-tabs-settings" title="Настроить вкладки">⚙</button></div>`;
  }

  // Липкий заголовок + полоска табов рисуются один раз на весь вход в
  // поездку — переключение табов дальше меняет только #g-tab-panel, не
  // трогая это (иначе терялась бы прокрутка/состояние соседних вкладок).
  function _renderGuideShell(trip) {
    const meta = trip.importData?.meta || {};
    return `
      <style>
        .g-tabstrip{display:flex;gap:6px;padding:10px 12px;overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none;background:var(--topbar-bg);position:sticky;top:0;z-index:9}
        .g-tabstrip::-webkit-scrollbar{display:none}
        .g-tab{flex:0 0 auto;padding:7px 14px;border-radius:16px;font-size:13px;font-weight:600;color:rgba(255,255,255,.65);background:rgba(255,255,255,.08);cursor:pointer;white-space:nowrap;-webkit-tap-highlight-color:transparent;transition:transform 120ms var(--ease)}
        .g-tab.active{background:#fff;color:var(--topbar-bg)}
        .g-tab:active{transform:scale(0.96)}
        #g-tab-panel{transition:opacity 120ms var(--ease)}
        .g-tab-settings{flex:0 0 auto;margin-left:2px;width:30px;height:30px;border-radius:50%;border:none;background:rgba(255,255,255,.08);color:rgba(255,255,255,.65);font-size:14px;cursor:pointer;-webkit-tap-highlight-color:transparent}
        .g-tab-settings:active{background:rgba(255,255,255,.16)}
        #g-tab-panel .mn-topbar, #g-tab-panel .sh-topbar,
        #g-tab-panel .exp-topbar, #g-tab-panel .ct-topbar,
        #g-tab-panel .bar-topbar, #g-tab-panel .sf-topbar,
        #g-tab-panel .rec-topbar { display:none }
        /* .sh-stats/.bar-tabs/.rec-tabs залипают на top:80px, рассчитывая на
           высоту своего топбара — тот скрыт строкой выше. top:0 столкнул бы
           их с уже залипающей полоской табов (#g-tabstrip тоже sticky top:0),
           поэтому здесь им проще просто не залипать и скроллиться с контентом. */
        #g-tab-panel .sh-stats, #g-tab-panel .bar-tabs, #g-tab-panel .rec-tabs { position:static }
        .gts-row{display:flex;align-items:center;gap:10px;padding:10px 4px;border-bottom:0.5px solid var(--sep2)}
        .gts-row:last-child{border-bottom:none}
        .gts-check{width:20px;height:20px;flex-shrink:0;accent-color:var(--accent)}
        .gts-label{flex:1;font-size:15px;color:var(--label)}
        .gts-arrows{display:flex;gap:4px;flex-shrink:0}
        .gts-arrow{width:30px;height:30px;border-radius:8px;border:none;background:var(--bg3);color:var(--label2);font-size:14px;cursor:pointer}
        .gts-arrow:disabled{opacity:.3;cursor:default}
        .gts-save{width:100%;background:var(--accent);border:none;border-radius:var(--radius-md);padding:13px;font-size:15px;font-weight:700;color:#fff;cursor:pointer;margin-top:12px}
        .g-acc{background:var(--bg2);border-radius:var(--radius-md);margin:0 12px 10px;overflow:hidden}
        .g-acc-hd{display:flex;justify-content:space-between;align-items:center;padding:13px 15px;cursor:pointer;-webkit-tap-highlight-color:transparent}
        .g-acc-hd:active{background:var(--bg3)}
        .g-acc-title{font-size:15px;font-weight:700;color:var(--label)}
        .g-acc-chev{font-size:18px;color:var(--label4);transition:transform 0.22s;line-height:1;flex-shrink:0}
        .g-acc-chev.open{transform:rotate(180deg)}
        .g-acc-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows 250ms var(--ease)}
        .g-acc-body.show{grid-template-rows:1fr}
        .g-acc-body-inner{overflow:hidden;border-top:0.5px solid var(--sep2)}
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
        .g-day-body{display:grid;grid-template-rows:0fr;transition:grid-template-rows 250ms var(--ease)}
        .g-day-body.show{grid-template-rows:1fr}
        .g-row{display:flex;gap:12px;padding:8px 15px;border-bottom:0.5px solid var(--sep2)}
        .g-row:last-child{border-bottom:none}
        .g-row-time{font-size:11px;color:var(--label3);min-width:80px;flex-shrink:0;padding-top:2px;font-weight:500}
        .g-row-act{font-size:13px;color:var(--label);line-height:1.45}
        .g-wx-card{margin:0 12px 10px;padding:14px;background:linear-gradient(135deg,rgba(10,132,255,.10),rgba(10,132,255,.02));border:0.5px solid rgba(10,132,255,.25);border-radius:var(--radius-md);transition:opacity 200ms var(--ease)}
        @starting-style{ .g-wx-card{opacity:0} }
        .g-wx-hd{display:flex;align-items:baseline;gap:8px;margin-bottom:10px}
        .g-wx-badge{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:var(--accent)}
        .g-wx-date{font-size:12px;color:var(--label3)}
        .g-wx-temp{font-size:30px;font-weight:800;color:var(--label);letter-spacing:-.5px;margin-bottom:10px}
        .g-wx-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:8px}
        .g-wx-item{text-align:center}
        .g-wx-ic{font-size:16px;margin-bottom:2px}
        .g-wx-val{font-size:12px;font-weight:600;color:var(--label)}
        .g-wx-lbl{font-size:10px;color:var(--label3);margin-top:1px}
        .g-wx-geo{margin-left:auto;background:rgba(10,132,255,.12);border:none;border-radius:8px;width:26px;height:26px;font-size:13px;line-height:1;cursor:pointer;flex-shrink:0}
        .g-wx-geo:active{opacity:.7}
        .g-wx-geo:disabled{opacity:.5}
        .g-wx-sun{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px;padding-top:10px;border-top:.5px solid rgba(10,132,255,.15)}
        .g-wx-sun-item{display:flex;align-items:center;justify-content:center;gap:6px}
        .g-wx-sun-item .g-wx-ic{margin-bottom:0;font-size:14px}
        .g-wx-sun-item .g-wx-val{font-size:12px;font-weight:600;color:var(--label)}
        .g-wx-sun-item .g-wx-lbl{font-size:10px;color:var(--label3)}
        .g-wx-hint{margin-top:8px;font-size:11px;line-height:1.4;color:var(--label3)}
        .g-wx-hint-good{color:#34c759}
        .g-wx-hint-bad{color:#ff9f0a}
        .g-windy-wrap{height:320px}
        .g-windy-frame{width:100%;height:100%;border:none;display:block}
        .g-empty{text-align:center;padding:56px 24px}
        .g-empty__icon{font-size:48px;margin-bottom:14px}
        .g-empty__title{font-size:17px;font-weight:700;color:var(--label);margin-bottom:8px}
        .g-empty__sub{font-size:14px;color:var(--label3);line-height:1.5}
        .g-info-actions{display:flex;gap:8px;padding:0 12px 4px;flex-wrap:wrap}
        .g-info-act-btn{flex:1;min-width:100px;background:var(--bg2);border:0.5px solid var(--sep2);border-radius:var(--radius-md);padding:10px 8px;font-size:12.5px;font-weight:600;color:var(--label2);font-family:inherit;cursor:pointer;text-align:center;-webkit-tap-highlight-color:transparent;box-shadow:var(--card-shadow)}
        .g-info-act-btn:active{background:var(--bg3)}
        .g-info-add-btn{width:100%;background:none;border:1.5px dashed var(--sep);border-radius:var(--radius-md);padding:12px;font-size:14px;font-weight:600;color:var(--accent);font-family:inherit;cursor:pointer}
        .g-chart-block{padding:12px 15px;border-top:0.5px solid var(--sep2)}
        .g-chart-block:first-of-type{border-top:none}
        .g-chart-label{font-size:12px;color:var(--label3);margin-bottom:6px;font-weight:600}
        .g-chart-axis{display:flex;justify-content:space-between;font-size:10px;color:var(--label4);margin-top:2px}
        .g-chart-scroll{overflow-x:auto;-webkit-overflow-scrolling:touch;scrollbar-width:none}
        .g-chart-scroll::-webkit-scrollbar{display:none}
        .g-chart-scroll svg{display:block}
        .g-info-gap{margin-top:14px}
      </style>
      <div style="background:var(--topbar-bg);color:#fff;padding:14px 16px 10px;position:sticky;top:0;z-index:10">
        <div style="font-size:18px;font-weight:800;letter-spacing:-0.4px">${_esc(trip.name)}</div>
        <div style="font-size:12px;opacity:0.72;margin-top:3px">${_esc(meta.subtitle || '')}</div>
      </div>
      ${_renderTabStrip(trip)}
      <div id="g-tab-panel"></div>`;
  }

  // Переключение таба — меняет только #g-tab-panel, заголовок и полоска
  // табов остаются на месте (не теряем прокрутку/состояние соседних вкладок).
  function _mountGuideTab(trip, tabId) {
    _activeGuideTab = tabId;
    document.querySelectorAll('#g-tabstrip .g-tab').forEach(el => {
      el.classList.toggle('active', el.dataset.gtab === tabId);
    });

    const panel = document.getElementById('g-tab-panel');
    if (!panel) return;
    const guideEl = document.getElementById('p-guide');
    if (guideEl) guideEl.scrollTop = 0;
    window.scrollTo(0, 0);

    // Мгновенная подмена контента при смене таба читалась как рывок —
    // короткий кросс-фейд вместо направленного слайда, т.к. табы можно
    // переставлять местами (см. _showGuideTabsSettings), направление
    // слайда потеряло бы смысл.
    panel.style.opacity = '0';

    const tripId = trip.id;
    if (tabId === 'info') {
      if (trip?.importData?.route?.length) {
        panel.innerHTML = `<div id="g-today-weather">${_todayWeatherBlock(trip)}</div>` + _renderGuideInfo(trip);
        _maybeRefreshWeather(trip);
      } else if (trip.type === 'fishing') {
        panel.innerHTML = `<div id="g-today-weather">${_todayWeatherBlock(trip)}</div>` + _renderFishingInfo(trip);
        _maybeRefreshWeather(trip);
      } else {
        panel.innerHTML = `
          <div class="g-empty">
            <div class="g-empty__icon">🗺️</div>
            <div class="g-empty__title">Маршрут ещё не добавлен</div>
            <div class="g-empty__sub">Загрузи JSON-файл от AI в настройках поездки — появятся дни, рейсы и погода по маршруту</div>
          </div>`;
      }
    } else if (tabId === 'rivers') {
      if (typeof RiversIndex !== 'undefined') RiversIndex.init(panel, window.APP?.currentTripData, tripId);
    } else if (tabId === 'menu') {
      if (typeof MenuIndex !== 'undefined') MenuIndex.show(panel, tripId);
    } else if (tabId === 'bar') {
      // Бар не привязан к поездке — та же общая карта, что и в шторке;
      // вкладка здесь чисто навигационное удобство, данные не меняются.
      if (typeof BarIndex !== 'undefined') BarIndex.show(panel);
    } else if (tabId === 'catches') {
      if (typeof CatchesIndex !== 'undefined') CatchesIndex.show(panel, tripId);
    } else if (tabId === 'expenses') {
      if (typeof ExpensesIndex !== 'undefined') ExpensesIndex.show(panel, tripId);
    } else if (tabId === 'shopping') {
      if (typeof ShoppingIndex !== 'undefined') ShoppingIndex.show(panel, tripId);
    } else if (tabId === 'safety') {
      // Справочная страница, не привязана к конкретной поездке — как Бар.
      if (typeof SafetyIndex !== 'undefined') SafetyIndex.show(panel, () => {});
    } else if (tabId === 'recipes') {
      if (typeof RecipesIndex !== 'undefined') RecipesIndex.show(panel);
    }

    requestAnimationFrame(() => { panel.style.opacity = '1'; });
  }

  // Настройка набора/порядка табов для этой поездки (⚙ в полоске табов) —
  // чекбокс включает/выключает, стрелки переставляют. Инфо не показываем в
  // списке — он всегда первый и обязательный. Сохраняем даже частично
  // выключенный список ("Приобье" не нужен Бар) — не только галочки, но и
  // порядок, раз уж по нему всё равно двигаем стрелками.
  function _showGuideTabsSettings(trip) {
    document.getElementById('gts-overlay')?.remove();

    const visible = _guideTabIds(trip).filter(id => id !== 'info');
    const hiddenIds = _DEFAULT_TAB_ORDER.filter(id => !visible.includes(id));
    let order = [...visible, ...hiddenIds];
    const checked = new Set(visible);

    function renderRows() {
      return order.map((id, i) => `
        <div class="gts-row">
          <input type="checkbox" class="gts-check" data-gts-check="${id}" ${checked.has(id) ? 'checked' : ''}>
          <span class="gts-label">${_esc(_ALL_TAB_DEFS[id].label)}</span>
          <div class="gts-arrows">
            <button class="gts-arrow" data-gts-up="${id}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="gts-arrow" data-gts-down="${id}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </div>`).join('');
    }

    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'gts-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Вкладки Гида</div>
        <div class="tqp-list" id="gts-list">${renderRows()}</div>
        <button class="gts-save" data-action="gts-save">Сохранить</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const rerenderList = () => {
      const listEl = document.getElementById('gts-list');
      if (listEl) listEl.innerHTML = renderRows();
    };

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const upId = e.target.closest('[data-gts-up]')?.dataset.gtsUp;
      if (upId) {
        const i = order.indexOf(upId);
        if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; rerenderList(); }
        return;
      }
      const downId = e.target.closest('[data-gts-down]')?.dataset.gtsDown;
      if (downId) {
        const i = order.indexOf(downId);
        if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; rerenderList(); }
        return;
      }
      if (e.target.closest('[data-action="gts-save"]')) {
        const finalOrder = order.filter(id => checked.has(id));
        trip.guideTabs = finalOrder;
        TripsData.updateTrip(trip.id, { guideTabs: finalOrder });
        overlay.remove();
        const stripEl = document.getElementById('g-tabstrip');
        if (stripEl) stripEl.outerHTML = _renderTabStrip(trip);
        if (!_guideTabIds(trip).includes(_activeGuideTab)) _mountGuideTab(trip, 'info');
      }
    });

    overlay.addEventListener('change', e => {
      const id = e.target.dataset.gtsCheck;
      if (!id) return;
      if (e.target.checked) checked.add(id); else checked.delete(id);
    });
  }

  // ── Быстрый выбор поездки — когда нажали нижнюю вкладку "Поездка", а
  // открытой поездки нет. Раньше сразу кидало в список ("Планы"); теперь,
  // если есть 2+ актуальных (не завершённых) поездки — короткий попап,
  // выбор сразу ведёт в Гид, без обложки/кнопки "Войти". Если актуальная
  // поездка ровно одна — заходим в неё сразу, без лишнего тапа. Если
  // актуальных нет вообще — как раньше, список поездок.
  function showQuickPicker() {
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getMine(window.APP?.user?.uid) : [])
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

  // Содержимое таба "Инфо" — та же последовательность аккордеонов, что
  // раньше была всем Гидом целиком; вызывается только когда у поездки уже
  // есть импортированный маршрут (см. проверку в _mountGuideTab), поэтому
  // явно на это не перепроверяет.
  // Аккордеон-хелпер — общий для Инфо экспедиций и рыбалок.
  function _acc(title, bodyHtml, open) {
    const id = 'gacc_' + Math.random().toString(36).slice(2);
    return `
      <div class="g-acc">
        <div class="g-acc-hd" data-target="${id}">
          <span class="g-acc-title">${title}</span>
          <span class="g-acc-chev ${open ? 'open' : ''}">⌄</span>
        </div>
        <div class="g-acc-body ${open ? 'show' : ''}" id="${id}"><div class="g-acc-body-inner">${bodyHtml}</div></div>
      </div>`;
  }

  // Карта ветра (Windy) — свой анимированный ветровой рендер не наш
  // масштаб (у Windy на это WebGL-команда и лицензии на метеомодели).
  // Вместо велосипеда — их же бесплатный embed-виджет на координаты
  // поездки. Аккордеон закрыт по умолчанию и iframe без src, пока не
  // откроют (data-src → src ставит _guideHandler при разворачивании) —
  // тяжёлая штука, незачем грузить сразу всем, кто открыл Гид. Общий для
  // Инфо экспедиций и рыбалок.
  function _windyAccordion(trip) {
    const windyCoords = _tripCoords(trip);
    if (!windyCoords) return '';
    const windySrc = `https://embed.windy.com/embed2.html?lat=${windyCoords.lat}&lon=${windyCoords.lon}&detailLat=${windyCoords.lat}&detailLon=${windyCoords.lon}&width=650&height=450&zoom=8&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
    return _acc('🌬 Карта ветра (Windy)', `<div class="g-windy-wrap"><iframe class="g-windy-frame" data-src="${_esc(windySrc)}" loading="lazy" frameborder="0"></iframe></div>`, false);
  }

  function _renderGuideInfo(trip) {
    const d = trip.importData || {};

    // Стрипаем эмодзи из строки (для рядов расписания)
    function _stripEmoji(s) {
      return String(s).replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
    }

    let h = '';

    h += _windyAccordion(trip);

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
        <div class="g-day-body ${isFirst ? 'show' : ''}" id="${dayId}"><div class="g-acc-body-inner">`;
        (day.rows || []).forEach(row => {
          rb += `<div class="g-row">
            <span class="g-row-time">${_esc(row[0])}</span>
            <span class="g-row-act">${_esc(_stripEmoji(row[1]))}</span>
          </div>`;
        });
        rb += `</div></div>`;
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
        <div class="g-day-body" id="${dayId}"><div class="g-acc-body-inner">`;
        (day.meals || []).forEach(meal => {
          mb += `<div class="g-row">
            <span class="g-row-time">${_esc(meal.type)}</span>
            <span class="g-row-act">${_esc(meal.text)}${meal.cocktail ? ' · 🍸 ' + _esc(meal.cocktail) : ''}</span>
          </div>`;
        });
        mb += `</div></div>`;
      });
      h += _acc('🍽️ Меню', mb, false);
    }

    h += `<div style="height:20px"></div>`;
    return h;
  }



  return { show, hide, enterTrip, showQuickPicker, visibleGuideTabs, getCurrentTripId: () => _tripId };
})();

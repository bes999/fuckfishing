'use strict';

const HomeRender = (() => {

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const DOWS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  let _calYear, _calMonth;
  let _calView = 'month'; // 'month' | 'year' — год целиком, см. _renderCalYear
  // Компактный режим (по умолчанию): две недели — текущая и следующая.
  // «Весь месяц» разворачивает в обычную сетку со стрелками и годом.
  let _calCompact = true;
  let _calendarHandler = null;
  let _tripCardsHandler = null;

  // ── Полный рендер страницы ──
  function render(el, user) {
    const now = new Date();
    _calYear  = now.getFullYear();
    _calMonth = now.getMonth();
    _calView  = 'month';
    _calCompact = true;

    const uid = window.APP?.user?.uid;
    const upcoming = TripsData.getUpcoming(uid);
    const byYear   = TripsData.getByYear(uid);
    const stats    = TripsData.getYearStats(String(now.getFullYear()), uid);

    el.innerHTML = `
      <div class="page-scroll">
        <div class="home-top-grid">
          ${upcoming ? `<div class="home-col-upcoming">
            ${upcoming.status === 'active' ? _activeBanner(upcoming) : _upcomingBanner(upcoming)}
          </div>` : ''}
          <div class="home-col-cal">
            ${_sectionLabel('Календарь')}
            ${_calendar()}
          </div>
        </div>
        ${Object.keys(byYear).length ? _recentSection(uid) : _tripsFeed(byYear)}
      </div>`;

    _bindCalendar(el);
    _bindReadiness(el);
    _bindTripCards(el);
    if (upcoming && upcoming.status === 'active') _fillActive(el, upcoming);
  }

  // ── Calendar ──
  // Заголовок ("Сентябрь 2026" / просто "2026") кликабельный — переключает
  // месяц⇄год целиком (Дмитрий: раньше можно было долистать до другого
  // года только по месяцу за раз, 12 тапов ‹ до соседнего сентября).
  // В год-режиме ‹› листают годами, в месяц-режиме как раньше — месяцами.
  function _calendar() {
    return `
      <div class="cal-wrap ${_calCompact ? 'compact' : ''}" id="calWrap">
        <div class="cal-head">
          <div class="cal-month-name" id="calTitle" data-cal="toggle-view" title="Показать год целиком"></div>
          <div class="cal-nav">
            <button class="cal-nav-btn" data-cal="prev" aria-label="Назад">‹</button>
            <button class="cal-nav-btn" data-cal="next" aria-label="Вперёд">›</button>
          </div>
          <button type="button" class="cal-year-link" data-cal="year">Весь год</button>
        </div>
        <div id="calBody"></div>
        <button type="button" class="cal-expand" data-cal="expand" aria-expanded="${_calCompact ? 'false' : 'true'}"></button>
        <div class="cal-legend">
          <div class="cal-leg"><div class="cal-leg-band cal-leg-exp"></div>Экспедиция</div>
          <div class="cal-leg"><div class="cal-leg-band cal-leg-fish"></div>Рыбалка</div>
        </div>
      </div>`;
  }

  // Год целиком — 12 плиток-месяцев, подсвечена та, где есть хоть один
  // день поездки (без разбивки по дням внутри месяца — то, что нужно
  // "посмотреть весь год", не полноценный мини-календарь на 365 клеток).
  // Тап по плитке — нырнуть в обычный месяц-режим на этот месяц.
  function _renderCalYear(el) {
    const markers = TripsData.getCalendarMarkers(window.APP?.user?.uid);
    document.getElementById('calTitle').textContent = String(_calYear);

    const now = new Date();
    const isCurrentYear = _calYear === now.getFullYear();

    let h = '<div class="cal-year-grid">';
    for (let m = 0; m < 12; m++) {
      const prefix = `${_calYear}-${_pad(m + 1)}-`;
      const monthMarkers = Object.keys(markers).filter(k => k.startsWith(prefix)).map(k => markers[k]);
      let cls = '';
      if (monthMarkers.some(mk => mk.type === 'expedition')) cls = 'my-exp';
      else if (monthMarkers.length) cls = 'my-small';
      if (cls && monthMarkers.every(mk => !mk.isFuture)) cls += ' past';
      const isCurrent = isCurrentYear && m === now.getMonth();
      h += `<div class="cal-year-month ${cls} ${isCurrent ? 'current' : ''}" data-cal-month="${m}">${MONTHS[m].slice(0, 3)}</div>`;
    }
    h += '</div>';
    document.getElementById('calBody').innerHTML = h;
  }

  function _renderCalGrid(el) {
    const markers = TripsData.getCalendarMarkers(window.APP?.user?.uid);
    const now     = new Date();
    const todayStr = _isoDate(now);

    document.getElementById('calTitle').textContent = MONTHS[_calMonth] + ' ' + _calYear;

    const first = new Date(_calYear, _calMonth, 1);
    let dow = first.getDay(); dow = dow === 0 ? 6 : dow - 1;
    const dim  = new Date(_calYear, _calMonth + 1, 0).getDate();
    const dimp = new Date(_calYear, _calMonth, 0).getDate();

    // Дни соседних месяцев — с отметками поездок (поездка через границу
    // месяца больше не «обрывается»), но приглушены (other).
    const cells = [];
    const prev = new Date(_calYear, _calMonth - 1, 1);
    for (let i = dow - 1; i >= 0; i--) {
      const ds = `${prev.getFullYear()}-${_pad(prev.getMonth()+1)}-${_pad(dimp - i)}`;
      cells.push({ ds, num: dimp - i, m: markers[ds], today: false, other: true });
    }
    for (let d = 1; d <= dim; d++) {
      const ds = `${_calYear}-${_pad(_calMonth+1)}-${_pad(d)}`;
      cells.push({ ds, num: d, m: markers[ds], today: ds === todayStr, other: false });
    }
    const rem = (dow + dim) % 7 === 0 ? 0 : 7 - (dow + dim) % 7;
    const next = new Date(_calYear, _calMonth + 1, 1);
    for (let d = 1; d <= rem; d++) {
      const ds = `${next.getFullYear()}-${_pad(next.getMonth()+1)}-${_pad(d)}`;
      cells.push({ ds, num: d, m: markers[ds], today: false, other: true });
    }
    document.getElementById('calBody').innerHTML = _cellsGrid(cells);
  }

  // Две недели от понедельника текущей — дни соседнего месяца здесь
  // обычные (не приглушённые): это просто «ближайшие 14 дней».
  function _renderCalCompact(el) {
    const markers = TripsData.getCalendarMarkers(window.APP?.user?.uid);
    const now = new Date();
    const todayStr = _isoDate(now);
    let dow = now.getDay(); dow = dow === 0 ? 6 : dow - 1;
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dow);
    document.getElementById('calTitle').textContent = MONTHS[now.getMonth()] + ' ' + now.getFullYear();

    const cells = [];
    for (let i = 0; i < 14; i++) {
      const d  = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
      const ds = _isoDate(d);
      cells.push({ ds, num: d.getDate(), m: markers[ds], today: ds === todayStr, other: false });
    }
    document.getElementById('calBody').innerHTML = _cellsGrid(cells);
  }

  function _cellsGrid(cells) {
    const head = DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');
    const body = cells.map((c, i) => {
      const cls = ['cal-day'];
      if (c.other) cls.push('other');
      if (c.today) cls.push('today');
      if (c.m) {
        const key = c.m.tripId;
        const prevSame = i % 7 !== 0 && cells[i - 1]?.m?.tripId === key;
        const nextSame = i % 7 !== 6 && cells[i + 1]?.m?.tripId === key;
        // Цвет — тип поездки (экспедиция оранжевая, рыбалка голубая),
        // прошедшие дни — та же полоса, только приглушённая.
        cls.push('band', c.m.type === 'expedition' ? 'trip-exp' : 'trip-small');
        if (!c.m.isFuture) cls.push('past');
        if (!prevSame) cls.push('band-start');
        if (!nextSame) cls.push('band-end');
      }
      return `<div class="${cls.join(' ')}" data-date="${c.ds}" data-trip="${c.m ? c.m.tripId : ''}"><div class="cn">${c.num}</div></div>`;
    }).join('');
    return `<div class="cal-grid">${head}${body}</div>`;
  }

  // Диспетчер — что сейчас показывать в #calBody: две недели, месяц или год.
  function _renderCalBody(el) {
    const wrap = document.getElementById('calWrap');
    if (wrap) wrap.classList.toggle('compact', _calCompact);
    const btn = el.querySelector('[data-cal="expand"]');
    if (btn) {
      btn.setAttribute('aria-expanded', _calCompact ? 'false' : 'true');
      btn.innerHTML = _calCompact
        ? `Весь месяц ${UIUtils.ico('chevron-down')}`
        : `Свернуть до двух недель ${UIUtils.ico('chevron-up')}`;
    }
    if (_calCompact) _renderCalCompact(el);
    else if (_calView === 'year') _renderCalYear(el);
    else _renderCalGrid(el);
  }

  // ── Upcoming banner ──
  // Чек-лист готовности (снаряга/меню/аптечка/билеты/маршрут) — только у
  // экспедиций (trip.readiness ставится в null для рыбалок в modules/trips/
  // index.js:_save — рыбалке эта церемония не нужна, раньше карточка на
  // главной этого не учитывала и рисовала пустой чек-лист всем подряд).
  function _upcomingBanner(trip) {
    const days = Math.ceil((new Date(trip.startDate) - new Date()) / 86400000);
    const dates = _shortRange(trip.startDate, trip.endDate);
    const place = _tripPlace(trip);
    const nParts = (trip.participants || []).length;
    const meta = [dates, place, nParts ? nParts + ' ' + _plural(nParts, 'участник', 'участника', 'участников') : ''].filter(Boolean).join(' · ');

    // Свободный список пунктов под конкретную поездку (id/label/done),
    // не фиксированные 6 — см. TripsData.getDefaultReadiness. Редактируется
    // (добавить/удалить пункт) на карточке самой поездки (tripcover); здесь,
    // на компактном виджете Главной, только читаем и переключаем готовые.
    let readinessHtml = '';
    if (Array.isArray(trip.readiness) && trip.readiness.length) {
      const items = trip.readiness;
      const done  = items.filter(it => it.done).length;
      const total = items.length;
      const pct   = Math.round(done / total * 100);
      readinessHtml = `
        <div class="readiness-block">
          <div class="readiness-top">
            <div class="readiness-title">Осталось подготовить</div>
            <div class="readiness-pct" id="readinessPct">${done} из ${total} готово</div>
          </div>
          <div class="readiness-track">
            <div class="readiness-fill" id="readinessFill" style="width:${pct}%"></div>
          </div>
          <div class="readiness-list" id="readinessList">
            ${_readinessListHtml(items, trip.id)}
          </div>
        </div>`;
    }

    const isExp = trip.type === 'expedition';
    const eyebrow = isExp ? 'Ближайшая экспедиция' : 'Ближайшая рыбалка';
    const countChip = days > 0
      ? `<span class="up-count"><b>${days}</b> ${_plural(days, 'день', 'дня', 'дней')}</span>`
      : `<span class="up-count up-count--now">${days === 0 ? 'сегодня' : 'идёт'}</span>`;
    // Длинные названия («Плато Путорана», «Приобье 2026») — на ступень
    // мельче, чтобы не ломались на 3 строки (см. тест названий в макетах).
    const long = (trip.name || '').length > 10;

    return `
      <div class="upcoming-banner">
        <button type="button" class="up-head upcoming-arrow-btn" data-trip-id="${trip.id}" aria-label="Открыть поездку ${_esc(trip.name)}">
          <span class="up-eyebrow-row">
            <span class="up-eyebrow">${eyebrow}</span>
            ${countChip}
          </span>
          <span class="up-title ${long ? 'up-title--long' : ''}">${_esc(trip.name)}</span>
          <span class="up-meta">${_esc(meta)}</span>
        </button>
        ${readinessHtml}
      </div>`;
  }

  // Неотмеченные сверху, отмеченные — вниз (по просьбе Дмитрия: "прыгает
  // сразу при отметке", как в обычных списках покупок). Только для
  // отображения — порядок в trip.readiness (используется в редактировании
  // списка на обложке поездки) не трогаем.
  function _sortReadiness(items) {
    return items.slice().sort((a, b) => (a.done ? 1 : 0) - (b.done ? 1 : 0));
  }

  // Оставшиеся пункты — строками сверху; сделанные сворачиваются в одну
  // строку «Готово · N» (раскрывается тапом), чтобы единственный
  // оставшийся пункт не терялся среди зачёркнутых.
  function _readinessListHtml(items, tripId) {
    const todo = items.filter(it => !it.done);
    const done = items.filter(it => it.done);
    let h = todo.map(it => _readinessRow(it, tripId)).join('');
    if (done.length) {
      h += `<details class="readiness-done" ${todo.length ? '' : 'open'}>
              <summary>${UIUtils.ico('check')} Готово · ${done.length}</summary>
              ${done.map(it => _readinessRow(it, tripId)).join('')}
            </details>`;
    }
    return h;
  }

  function _readinessRow(item, tripId) {
    return `
      <div class="readiness-row">
        <div class="readiness-check ${item.done ? 'done' : ''}"
             data-readiness="${_esc(item.id)}" data-trip-id="${tripId}"
             onclick="event.stopPropagation();HomeRender.toggleReadiness(this)">
          ${item.done ? '' + UIUtils.ico('check') + '' : ''}
        </div>
        <span class="readiness-label ${item.done ? 'crossed' : ''}">${_esc(item.label)}</span>
      </div>`;
  }

  // Глобальный хэндлер для чекбоксов готовности
  function toggleReadiness(check) {
    const itemId = check.dataset.readiness;
    const tripId = check.dataset.tripId;
    const trip   = TripsData.getById(tripId);
    const item   = Array.isArray(trip?.readiness) ? trip.readiness.find(it => it.id === itemId) : null;
    if (!item) return;
    item.done = !item.done;
    TripsData.updateTrip(tripId, { readiness: trip.readiness });
    // Перерисовываем весь список отсортированным — отмеченный пункт сразу
    // уезжает вниз, а не просто меняет цвет на месте.
    const listEl = document.getElementById('readinessList');
    if (listEl) listEl.innerHTML = _readinessListHtml(trip.readiness, tripId);
    _recalcReadiness(tripId);
  }

  // ── Сейчас в поездке ──
  // Вместо «Ближайшей» — идущая поездка: какой день, быстрые кнопки
  // (улов / расход / заметка сразу в Гиде), меню на сегодня и улов.
  // Меню и улов подгружаются отдельно (_fillActive) — на Главной их
  // модули не открыты, читаем документ напрямую, только чтение.
  function _activeBanner(trip) {
    const start = new Date(trip.startDate + 'T00:00:00');
    const end   = new Date(trip.endDate + 'T00:00:00');
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const total = Math.round((end - start) / 86400000) + 1;
    const day   = Math.min(total, Math.max(1, Math.round((today - start) / 86400000) + 1));
    const pct   = Math.round(day / total * 100);
    const place = _tripPlace(trip);
    const dow = today.toLocaleDateString('ru-RU', { weekday: 'long' });
    const todayStr = dow.charAt(0).toUpperCase() + dow.slice(1) + ', ' + today.getDate() + ' ' + MONTHS_GEN[today.getMonth()];
    const long = (trip.name || '').length > 10;
    return `
      <div class="upcoming-banner upcoming-banner--active">
        <button type="button" class="up-head upcoming-arrow-btn" data-trip-id="${trip.id}" aria-label="Открыть поездку ${_esc(trip.name)}">
          <span class="up-eyebrow-row">
            <span class="up-eyebrow up-eyebrow--now">Сейчас в поездке</span>
            <span class="up-count up-count--now">день ${day} из ${total}</span>
          </span>
          <span class="up-title ${long ? 'up-title--long' : ''}">${_esc(trip.name)}</span>
          <span class="up-meta">${_esc(todayStr + (place ? ' · ' + place : ''))}</span>
        </button>
        <div class="readiness-block"><div class="readiness-track"><div class="readiness-fill" style="width:${pct}%"></div></div></div>
      </div>
      <div class="home-quick">
        <button type="button" class="home-quick-btn" data-quick="catches" data-trip-id="${trip.id}"><span class="hq-ico hq-river">${UIUtils.ico('fishing')}</span>+ Улов</button>
        <button type="button" class="home-quick-btn" data-quick="expenses" data-trip-id="${trip.id}"><span class="hq-ico hq-accent">${UIUtils.ico('credit-card')}</span>+ Расход</button>
        <button type="button" class="home-quick-btn" data-quick="note" data-trip-id="${trip.id}"><span class="hq-ico">${UIUtils.ico('notes')}</span>+ Заметка</button>
      </div>
      <div id="homeActiveMenu"></div>
      <div id="homeActiveCatch"></div>`;
  }

  async function _fillActive(el, trip) {
    if (typeof firebase === 'undefined') return;
    const db = firebase.firestore();
    const todayISO = _isoDate(new Date());
    try {
      const snap = await db.collection('menu').doc(trip.id).get();
      const days = (snap.exists && snap.data().days) || [];
      const day = days.find(d => d.date === todayISO);
      const box = el.querySelector('#homeActiveMenu');
      // Показываем только приёмы, включённые в планирование этой поездки
      // (trip.mealsPlanned) — если пусто, блок меню на сегодня не выводим
      // совсем (см. TripsData.plannedMeals).
      const planned = typeof TripsData !== 'undefined' ? TripsData.plannedMeals(trip) : null;
      if (day && box && (!planned || planned.length)) {
        const allMeals = (typeof MenuData !== 'undefined' ? MenuData.getMeals() : []);
        const meals = planned ? allMeals.filter(m => planned.includes(m.id)) : allMeals;
        const duty = (snap.data().mealDuty) || {};
        const rows = meals.map(m => {
          const slots = (day.meals && day.meals[m.id] && day.meals[m.id].slots) || [];
          const main = slots.find(s => s.item) ;
          const cook = (duty[day.id + '_' + m.id] || {}).cook;
          if (!main) return '';
          return `<button type="button" class="home-meal" data-quick="menu" data-trip-id="${trip.id}">
            <span class="home-meal-name">${m.label}</span>
            <span class="home-meal-body"><span class="home-meal-dish">${_esc(main.item.name)}</span>${cook ? `<span class="home-meal-cook">готовит ${_esc(cook)}</span>` : ''}</span>
            ${UIUtils.ico('chevron-right')}</button>`;
        }).join('');
        if (rows) box.innerHTML = _sectionLabel('Меню на сегодня') + `<div class="home-card-list">${rows}</div>`;
      }
    } catch (e) {}
    try {
      const cs = await db.collection('trips').doc(trip.id).collection('catches').get();
      const by = {};
      cs.docs.forEach(d => { const c = d.data(); if (c.fish) by[c.fish] = (by[c.fish] || 0) + (Number(c.count) || 1); });
      const box = el.querySelector('#homeActiveCatch');
      const keys = Object.keys(by).sort((a, b) => by[b] - by[a]);
      if (keys.length && box) {
        box.innerHTML = _sectionLabel('Улов поездки') + `<button type="button" class="home-catch" data-quick="catches-view" data-trip-id="${trip.id}">
          ${keys.map(k => `<span class="home-catch-chip">${_esc(k)} <b>${by[k]}</b></span>`).join('')}</button>`;
      }
    } catch (e) {}
  }

  // Открыть поездку сразу на нужной вкладке Гида и, где можно, сразу
  // на добавлении (форма расхода, форма улова, поле заметки).
  function _quickAction(tripId, kind) {
    if (typeof TripCoverIndex === 'undefined') return;
    TripCoverIndex.enterTrip(tripId);
    const tab = { catches: 'catches', 'catches-view': 'catches', expenses: 'expenses', note: 'info', menu: 'menu' }[kind];
    setTimeout(() => {
      const ok = tab && TripCoverIndex.switchGuideTab(tripId, tab);
      if (!ok) return;
      setTimeout(() => {
        if (kind === 'expenses') document.querySelector('[data-action="add-expense"]')?.click();
        else if (kind === 'catches') { if (typeof CatchesRender !== 'undefined' && CatchesRender.openAdd) CatchesRender.openAdd(); }
        else if (kind === 'note') document.getElementById('g-note-input')?.focus();
      }, 120);
    }, 60);
  }

  // ── Недавние: три последние прошедшие поездки; всё остальное — в «Планах» ──
  function _recentSection(uid) {
    const past = TripsData.getMine(uid)
      .filter(t => t.status === 'done')
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate))
      .slice(0, 3);
    if (!past.length) return '';
    const rows = past.map(t => {
      const isExp = t.type === 'expedition';
      const fishStr = (t.fish || []).map(f => `${f.species.toLowerCase()} ${f.count}`).join(' · ');
      const sub = [_shortRange(t.startDate, t.endDate), fishStr].filter(Boolean).join(' · ');
      return `<button type="button" class="home-recent" data-trip-id="${t.id}">
        <span class="home-recent-ico ${isExp ? 'hq-accent' : 'hq-river'}">${UIUtils.ico(TripsData.tripIcon(t))}</span>
        <span class="home-recent-body"><span class="home-recent-name">${_esc(t.name)}</span><span class="home-recent-sub">${_esc(sub)}</span></span>
        ${t.rating ? `<span class="home-recent-rate">${t.rating}<small>/10</small></span>` : ''}
      </button>`;
    }).join('');
    return `<div class="home-section-row">${_sectionLabel('Недавние')}<button type="button" class="home-section-link" data-action="all-trips">Все поездки</button></div>
      <div class="home-card-list">${rows}</div>`;
  }

  function _tripPlace(trip) {
    const names = (trip.rivers || []).map(r => r.name).filter(Boolean);
    const regions = (trip.rivers || []).map(r => r.region).filter(Boolean).filter((v, i, a) => a.indexOf(v) === i);
    return [names[0], regions[0]].filter(Boolean).join(', ');
  }

  function _shortRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end || start);
    const m = i => MONTHS_GEN[i].slice(0, 3);
    if (start === end || !end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]}`;
    if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${m(s.getMonth())}`;
    return `${s.getDate()} ${m(s.getMonth())} – ${e.getDate()} ${m(e.getMonth())}`;
  }

  // ── Trips feed ──
  function _tripsFeed(byYear) {
    const years = Object.keys(byYear).sort((a,b) => b - a);
    if (!years.length) return `
      <div style="text-align:center;padding:40px 24px">
        <div style="font-size:44px;margin-bottom:12px">${UIUtils.ico('fishing')}</div>
        <div style="font-size:16px;font-weight:700;color:var(--label);margin-bottom:6px">Поездок пока нет</div>
        <div style="font-size:14px;color:var(--label3);line-height:1.5;margin-bottom:18px">Заведи первую рыбалку или экспедицию — и здесь появится календарь и статистика</div>
        <button data-action="create-trip" style="background:var(--accent);border:none;border-radius:var(--radius-md);padding:11px 20px;font-size:14px;font-weight:600;color:var(--on-accent);cursor:pointer">+ Создать поездку</button>
      </div>`;

    const now = new Date().getFullYear();
    const inner = years.map((year, idx) => {
      const trips = byYear[year];
      const isOpen = idx === 0; // текущий/последний год открыт
      const expCount  = trips.filter(t => t.type === 'expedition').length;
      const fishCount = trips.filter(t => t.type === 'fishing').length;
      const countStr  = [
        expCount  ? expCount  + ' ' + _plural(expCount,  'экспедиция','экспедиции','экспедиций') : '',
        fishCount ? fishCount + ' ' + _plural(fishCount, 'рыбалка','рыбалки','рыбалок') : ''
      ].filter(Boolean).join(' · ');

      return `
        <div class="year-section">
          <div class="year-hd ${isOpen ? 'open' : ''}" data-year="${year}">
            <div class="year-hd-left">
              <span class="year-title">${year}</span>
              <span class="year-count">${countStr}</span>
            </div>
            <div class="year-chevron">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
          <div class="year-body ${isOpen ? '' : 'hidden'}">
            <div class="year-body-inner">${_yearBody(trips)}</div>
          </div>
        </div>`;
    }).join('');
    return `<div class="trips-feed">${inner}</div>`;
  }

  function _yearBody(trips) {
    // Группируем по месяцу
    const byMonth = {};
    trips.forEach(t => {
      const m = parseInt(t.startDate.slice(5, 7)) - 1;
      if (!byMonth[m]) byMonth[m] = [];
      byMonth[m].push(t);
    });

    const months = Object.keys(byMonth).map(Number).sort((a,b) => b - a);
    let h = '';

    months.forEach(m => {
      // Сначала экспедиции, потом рыбалки
      const sorted = byMonth[m].slice().sort((a,b) => {
        if (a.type === b.type) return new Date(b.startDate) - new Date(a.startDate);
        return a.type === 'expedition' ? -1 : 1;
      });
      h += `<div class="year-month-sep">${MONTHS[m]}</div>`;
      h += `<div class="year-month-cards">`;
      sorted.forEach(t => {
        h += t.type === 'expedition' ? _expCard(t) : _fishCard(t);
      });
      h += `</div>`;
    });

    return h;
  }

  function _expCard(t) {
    const statusCls = { upcoming:'status-soon', active:'status-active', done:'status-done' }[t.status] || 'status-done';
    const dates = _formatDateRange(t.startDate, t.endDate);
    const location = t.rivers && t.rivers.length ? t.rivers.map(r => r.region).filter((v,i,a) => a.indexOf(v) === i).join(', ') : '';
    const daysLeft = Math.ceil((new Date(t.startDate) - new Date()) / 86400000);

    let bottom = '';
    if (t.status === 'done' && t.rating) {
      const pct = Math.round(t.rating / 10 * 100);
      bottom = `
        <div class="exp-card-bot">
          <div class="score-block">
            <div class="score-num">${t.rating}</div>
            <div class="score-denom">/10</div>
          </div>
          <div class="score-track"><div class="score-fill" style="width:${pct}%"></div></div>
          <div class="card-goto">›</div>
        </div>`;
    } else {
      bottom = `
        <div class="exp-card-bot">
          <div style="font-size:13px;color:var(--label3)">${t.status === 'upcoming' ? 'Рейтинг после поездки' : ''}</div>
          <div class="card-goto">›</div>
        </div>`;
    }

    return `
      <div class="exp-card ${statusCls}" data-trip-id="${t.id}">
        <div class="exp-card-top">
          <div class="exp-row1">
            <div>
              <div class="exp-type">${UIUtils.ico('mountain')} Экспедиция</div>
              <div class="exp-name">${_esc(t.name)}</div>
            </div>
            <div style="display:flex;flex-direction:column;align-items:flex-end;gap:3px">
              <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
              ${t.status === 'upcoming' && daysLeft > 0 ? `<div class="exp-days-left">через ${daysLeft} дн.</div>` : ''}
            </div>
          </div>
          <div class="exp-meta">
            <span>${UIUtils.ico('calendar')} ${dates}</span>
            ${location ? `<span>${UIUtils.ico('map-pin')} ${_esc(location)}</span>` : ''}
          </div>
          ${t.participants && t.participants.length ? `
          <div class="exp-parts">
            ${t.participants.map(p => `<div class="part-tag">${_esc(p.name)}</div>`).join('')}
          </div>` : ''}
        </div>
        ${bottom}
      </div>`;
  }

  function _fishCard(t) {
    const icon = _fishIcon(t.startDate);
    const fishStr = (t.fish || []).map(f => `${f.species} ×${f.count}`).join(', ');
    const dates = t.startDate === t.endDate
      ? _shortDate(t.startDate)
      : _shortDate(t.startDate) + '–' + _shortDate(t.endDate);

    return `
      <div class="fish-card" data-trip-id="${t.id}">
        <div class="fish-icon">${icon}</div>
        <div class="fish-body">
          <div class="fish-title">${_esc(t.name)}</div>
          <div class="fish-sub">${dates}${fishStr ? ' · ' + fishStr : ''}</div>
        </div>
        ${t.rating ? `
        <div class="fish-score">
          <div class="fish-score-num">${t.rating}</div>
          <div class="fish-score-max">/10</div>
        </div>` : ''}
      </div>`;
  }

  // ── Bindings ──
  // prev/next и заголовок биндятся один раз здесь (сама оболочка _calendar()
  // рендерится один раз на весь заход на Главную) — дальше переключение
  // месяц⇄год и навигация просто меняют #calBody, кнопки/заголовок никуда
  // не деваются. Поэтому читают _calView/_calYear/_calMonth заново на
  // каждый клик из замыкания, а не один раз при биндинге.
  function _bindCalendar(el) {
    _renderCalBody(el);
    el.querySelector('[data-cal="prev"]')?.addEventListener('click', () => {
      if (_calView === 'year') { _calYear--; }
      else { _calMonth--; if (_calMonth < 0) { _calMonth = 11; _calYear--; } }
      _renderCalBody(el);
    });
    el.querySelector('[data-cal="next"]')?.addEventListener('click', () => {
      if (_calView === 'year') { _calYear++; }
      else { _calMonth++; if (_calMonth > 11) { _calMonth = 0; _calYear++; } }
      _renderCalBody(el);
    });
    el.querySelector('[data-cal="toggle-view"]')?.addEventListener('click', () => {
      // Из компактного режима тап по заголовку сразу открывает год —
      // как и раньше, заголовок = «показать год целиком».
      if (_calCompact) { _calCompact = false; _calView = 'year'; }
      else _calView = _calView === 'year' ? 'month' : 'year';
      _renderCalBody(el);
    });
    el.querySelector('[data-cal="year"]')?.addEventListener('click', () => {
      _calCompact = false; _calView = 'year'; _calYear = new Date().getFullYear();
      _renderCalBody(el);
    });
    el.querySelector('[data-cal="expand"]')?.addEventListener('click', () => {
      _calCompact = !_calCompact;
      if (!_calCompact) {
        const now = new Date();
        _calYear = now.getFullYear(); _calMonth = now.getMonth(); _calView = 'month';
      }
      _renderCalBody(el);
    });
    if (_calendarHandler) el.removeEventListener('click', _calendarHandler);
    _calendarHandler = e => {
      const monthTile = e.target.closest('.cal-year-month[data-cal-month]');
      if (monthTile) {
        _calMonth = parseInt(monthTile.dataset.calMonth, 10);
        _calView = 'month';
        _renderCalBody(el);
        return;
      }
      const day = e.target.closest('.cal-day[data-date]');
      if (!day || day.classList.contains('other')) return;
      const date = day.dataset.date;
      const tripId = day.dataset.trip;
      if (tripId) {
        // Есть поездка — открываем её
        HomeIndex.openTrip(tripId);
      } else if (date) {
        // Пустая дата — создаём поездку с предзаполненной датой
        if (typeof AppNav !== 'undefined') AppNav.setActive('trips');
        if (typeof AppRouter !== 'undefined') AppRouter.show('trips');
        if (typeof TripsIndex !== 'undefined') {
          TripsIndex.render();
          setTimeout(() => TripsIndex.showCreate(date), 50);
        }
      }
    };
    el.addEventListener('click', _calendarHandler);
  }

  function _bindReadiness(el) {
    // логика перенесена в toggleReadiness(), вызываемую напрямую из onclick
  }

  function _recalcReadiness(tripId) {
    const trip = TripsData.getById(tripId);
    if (!Array.isArray(trip?.readiness) || !trip.readiness.length) return;
    const done  = trip.readiness.filter(it => it.done).length;
    const total = trip.readiness.length;
    const pct   = Math.round(done / total * 100);
    const pctEl  = document.getElementById('readinessPct');
    const fillEl = document.getElementById('readinessFill');
    if (pctEl)  pctEl.textContent   = done + ' из ' + total + ' готово';
    if (fillEl) fillEl.style.width  = pct + '%';
  }

  function _bindTripCards(el) {
    if (_tripCardsHandler) el.removeEventListener('click', _tripCardsHandler);
    _tripCardsHandler = e => {
      const hd = e.target.closest('.year-hd');
      if (hd) {
        const section = hd.closest('.year-section');
        const body = section ? section.querySelector('.year-body') : hd.nextElementSibling;
        if (!body) return;
        const open = hd.classList.toggle('open');
        body.classList.toggle('hidden', !open);
        return;
      }
      const quick = e.target.closest('[data-quick]');
      if (quick) { _quickAction(quick.dataset.tripId, quick.dataset.quick); return; }
      if (e.target.closest('[data-action="all-trips"]')) {
        if (typeof AppNav !== 'undefined') AppNav.setActive('trips');
        if (typeof AppRouter !== 'undefined') AppRouter.show('trips');
        if (typeof TripsIndex !== 'undefined') TripsIndex.render();
        return;
      }
      // В баннере реагируем только на стрелку
      if (e.target.closest('.upcoming-banner')) {
        const arrow = e.target.closest('.upcoming-arrow-btn');
        if (arrow && arrow.dataset.tripId) {
          HomeIndex.openTrip(arrow.dataset.tripId);
        }
        return;
      }
      // Карточки поездок
      const card = e.target.closest('[data-trip-id]');
      if (card && card.dataset.tripId) {
        HomeIndex.openTrip(card.dataset.tripId);
        return;
      }
      // Пустое состояние — "Создать поездку"
      if (e.target.closest('[data-action="create-trip"]')) {
        if (typeof AppNav !== 'undefined') AppNav.setActive('trips');
        if (typeof AppRouter !== 'undefined') AppRouter.show('trips');
        if (typeof TripsIndex !== 'undefined') {
          TripsIndex.render();
          setTimeout(() => TripsIndex.showCreate(), 50);
        }
      }
    };
    el.addEventListener('click', _tripCardsHandler);
  }

  // ── Helpers ──
  function _sectionLabel(text) {
    return `<div class="home-section-label">${text}</div>`;
  }

  function _formatDateRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end);
    if (start === end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _shortDate(iso) {
    const d = new Date(iso);
    return `${d.getDate()} ${MONTHS_GEN[d.getMonth()]}`;
  }

  function _fishIcon(dateStr) {
    const m = parseInt(dateStr.slice(5,7));
    if (m <= 2 || m === 12) return UIUtils.ico('snowflake');
    if (m <= 4) return UIUtils.ico('plant');
    if (m <= 8) return UIUtils.ico('sun');
    return UIUtils.ico('leaf');
  }

  function _plural(n, f1, f2, f5) {
    const m = n % 100;
    if (m >= 11 && m <= 19) return f5;
    const d = n % 10;
    if (d === 1) return f1;
    if (d >= 2 && d <= 4) return f2;
    return f5;
  }

  function _isoDate(d) {
    return `${d.getFullYear()}-${_pad(d.getMonth()+1)}-${_pad(d.getDate())}`;
  }
  function _pad(n)   { return n < 10 ? '0'+n : ''+n; }
  function _esc(s)   { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;'); }

  return { render, toggleReadiness };
})();

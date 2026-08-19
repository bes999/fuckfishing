'use strict';

const HomeRender = (() => {

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  const DOWS = ['Пн','Вт','Ср','Чт','Пт','Сб','Вс'];

  const READINESS_ITEMS = [
    { key: 'gear',     label: 'Список снаряжения' },
    { key: 'menu',     label: 'Меню составлено'   },
    { key: 'shopping', label: 'Список закупки'     },
    { key: 'medkit',   label: 'Аптечка'            },
    { key: 'tickets',  label: 'Билеты куплены'     },
    { key: 'route',    label: 'Маршрут согласован' },
  ];

  let _calYear, _calMonth;
  let _calendarHandler = null;
  let _tripCardsHandler = null;

  // ── Полный рендер страницы ──
  function render(el, user) {
    const now = new Date();
    _calYear  = now.getFullYear();
    _calMonth = now.getMonth();

    const upcoming = TripsData.getUpcoming();
    const byYear   = TripsData.getByYear();
    const stats    = TripsData.getYearStats(String(now.getFullYear()));

    el.innerHTML = `
      <div class="page-scroll">
        ${_sectionLabel('Календарь')}
        ${_calendar()}
        ${upcoming ? _sectionLabel('Ближайшее') : ''}
        ${upcoming ? _upcomingBanner(upcoming) : ''}
        ${_sectionLabel('Поездки')}
        ${_tripsFeed(byYear)}
      </div>`;

    _bindCalendar(el);
    _bindReadiness(el);
    _bindTripCards(el);
  }

  // ── Calendar ──
  function _calendar() {
    return `
      <div class="cal-wrap">
        <div class="cal-head">
          <div class="cal-month-name" id="calTitle"></div>
          <div class="cal-nav">
            <button class="cal-nav-btn" data-cal="prev">‹</button>
            <button class="cal-nav-btn" data-cal="next">›</button>
          </div>
        </div>
        <div class="cal-grid" id="calGrid"></div>
        <div class="cal-legend">
          <div class="cal-leg">
            <div class="cal-leg-dot" style="background:var(--accent);box-shadow:0 0 0 2px var(--accent-bg)"></div>
            Экспедиция
          </div>
          <div class="cal-leg">
            <div class="cal-leg-dot" style="background:var(--accent-bg);border:1.5px solid var(--accent)"></div>
            Рыбалка
          </div>
          <div class="cal-leg">
            <div class="cal-leg-dot" style="background:rgba(255,159,10,.2);border:1.5px solid var(--orange)"></div>
            Предстоит
          </div>
        </div>
      </div>`;
  }

  function _renderCalGrid(el) {
    const markers = TripsData.getCalendarMarkers();
    const now     = new Date();
    const todayStr = _isoDate(now);

    document.getElementById('calTitle').textContent = MONTHS[_calMonth] + ' ' + _calYear;

    const first = new Date(_calYear, _calMonth, 1);
    let dow = first.getDay(); dow = dow === 0 ? 6 : dow - 1;
    const dim  = new Date(_calYear, _calMonth + 1, 0).getDate();
    const dimp = new Date(_calYear, _calMonth, 0).getDate();

    let h = DOWS.map(d => `<div class="cal-dow">${d}</div>`).join('');

    for (let i = dow - 1; i >= 0; i--)
      h += `<div class="cal-day other"><div class="cn">${dimp - i}</div></div>`;

    for (let d = 1; d <= dim; d++) {
      const ds = `${_calYear}-${_pad(_calMonth+1)}-${_pad(d)}`;
      const m  = markers[ds];
      let cls = '', dot = '';
      if (ds === todayStr) {
        cls = 'today';
      } else if (m) {
        if (m.isFuture) {
          cls = m.type === 'expedition' ? 'trip-soon' : 'trip-soon';
        } else {
          cls = m.type === 'expedition' ? 'trip-exp' : 'trip-small';
          if (m.type === 'fishing') dot = '<div class="cal-trip-dot"></div>';
        }
      }
      h += `<div class="cal-day ${cls}" data-date="${ds}" data-trip="${m ? m.tripId : ''}">
              <div class="cn">${d}</div>${dot}
            </div>`;
    }

    const rem = (dow + dim) % 7 === 0 ? 0 : 7 - (dow + dim) % 7;
    for (let d = 1; d <= rem; d++)
      h += `<div class="cal-day other"><div class="cn">${d}</div></div>`;

    document.getElementById('calGrid').innerHTML = h;
  }

  // ── Upcoming banner ──
  function _upcomingBanner(trip) {
    const days = Math.ceil((new Date(trip.startDate) - new Date()) / 86400000);
    const daysStr = days > 0 ? days : '🎣';
    const r = trip.readiness || {};
    const done  = Object.values(r).filter(Boolean).length;
    const total = READINESS_ITEMS.length;
    const pct   = total ? Math.round(done / total * 100) : 0;

    const dates = _formatDateRange(trip.startDate, trip.endDate);
    const parts = (trip.participants || []).join(' · ');

    return `
      <div class="upcoming-banner">
        <div class="upcoming-main">
          <div>
            <div class="upcoming-num">${daysStr}</div>
            <div class="upcoming-days-label">${days > 0 ? 'дней' : ''}</div>
          </div>
          <div class="upcoming-info">
            <div class="upcoming-name">${trip.type === 'expedition' ? '🏔 ' : '🎣 '}${_esc(trip.name)}</div>
            <div class="upcoming-sub">${dates}${parts ? ' · ' + parts : ''}</div>
          </div>
          <button class="upcoming-arrow-btn" data-trip-id="${trip.id}">›</button>
        </div>
        <div class="readiness-block">
          <div class="readiness-top">
            <div class="readiness-title">Готовность к поездке</div>
            <div class="readiness-pct" id="readinessPct">${pct}%</div>
          </div>
          <div class="readiness-track">
            <div class="readiness-fill" id="readinessFill" style="width:${pct}%"></div>
          </div>
          <div class="readiness-list" id="readinessList">
            ${READINESS_ITEMS.map(item => _readinessRow(item, r[item.key], trip.id)).join('')}
          </div>
        </div>
      </div>`;
  }

  function _readinessRow(item, done, tripId) {
    return `
      <div class="readiness-row">
        <div class="readiness-check ${done ? 'done' : ''}"
             data-readiness="${item.key}" data-trip-id="${tripId}"
             onclick="event.stopPropagation();HomeRender.toggleReadiness(this)">
          ${done ? '✓' : ''}
        </div>
        <span class="readiness-label ${done ? 'crossed' : ''}">${item.label}</span>
      </div>`;
  }

  // Глобальный хэндлер для чекбоксов готовности
  function toggleReadiness(check) {
    const key    = check.dataset.readiness;
    const tripId = check.dataset.tripId;
    const trip   = TripsData.getById(tripId);
    if (!trip || !trip.readiness) return;
    trip.readiness[key] = !trip.readiness[key];
    TripsData.updateTrip(tripId, { readiness: trip.readiness });
    const done = trip.readiness[key];
    check.classList.toggle('done', done);
    check.textContent = done ? '✓' : '';
    const label = check.nextElementSibling;
    if (label) {
      label.classList.toggle('crossed', done);
    }
    _recalcReadiness(tripId);
  }

  // ── Trips feed ──
  function _tripsFeed(byYear) {
    const years = Object.keys(byYear).sort((a,b) => b - a);
    if (!years.length) return '<div style="padding:20px 16px;color:var(--label3);text-align:center;font-size:14px">Поездок пока нет</div>';

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
            ${_yearBody(trips)}
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
      sorted.forEach(t => {
        h += t.type === 'expedition' ? _expCard(t) : _fishCard(t);
      });
    });

    return h;
  }

  function _expCard(t) {
    const statusCls = { upcoming:'status-soon', active:'status-active', done:'status-done' }[t.status] || 'status-done';
    const dates = _formatDateRange(t.startDate, t.endDate);
    const location = t.rivers && t.rivers.length ? t.rivers.map(r => r.region).filter((v,i,a) => a.indexOf(v) === i).join(', ') : '';

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
              <div class="exp-type">🎯 Экспедиция</div>
              <div class="exp-name">${_esc(t.name)}</div>
            </div>
            <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
          </div>
          <div class="exp-meta">
            <span>📅 ${dates}</span>
            ${location ? `<span>📍 ${_esc(location)}</span>` : ''}
          </div>
          ${t.participants && t.participants.length ? `
          <div class="exp-parts">
            ${t.participants.map(p => `<div class="part-tag">${_esc(p)}</div>`).join('')}
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
  function _bindCalendar(el) {
    _renderCalGrid(el);
    el.querySelector('[data-cal="prev"]')?.addEventListener('click', () => {
      _calMonth--;
      if (_calMonth < 0) { _calMonth = 11; _calYear--; }
      _renderCalGrid(el);
    });
    el.querySelector('[data-cal="next"]')?.addEventListener('click', () => {
      _calMonth++;
      if (_calMonth > 11) { _calMonth = 0; _calYear++; }
      _renderCalGrid(el);
    });
    if (_calendarHandler) el.removeEventListener('click', _calendarHandler);
    _calendarHandler = e => {
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
    if (!trip || !trip.readiness) return;
    const done  = Object.values(trip.readiness).filter(Boolean).length;
    const total = READINESS_ITEMS.length;
    const pct   = total ? Math.round(done / total * 100) : 0;
    const pctEl  = document.getElementById('readinessPct');
    const fillEl = document.getElementById('readinessFill');
    if (pctEl)  pctEl.textContent   = pct + '%';
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
    if (m <= 2 || m === 12) return '❄️';
    if (m <= 4) return '🌱';
    if (m <= 8) return '☀️';
    return '🍂';
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

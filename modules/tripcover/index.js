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

  function show(tripId) {
    _tripId = tripId;
    const trip = TripsData.getById(tripId);
    if (!trip) return;

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
          <button class="cover-icon-btn" id="coverEdit" title="Редактировать">
            <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
          </button>
        </div>
      </div>

      <div class="cover-scroll">
        ${_hero(t, emoji, dates, location)}
        ${t.status === 'upcoming' || t.status === 'active' ? _countdown(t) : ''}
        ${t.status === 'upcoming' && t.readiness ? _readiness(t) : ''}
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

    // Stats
    const totalFish = (t.fish||[]).reduce((s,f) => s + (f.count||0), 0);
    const species   = (t.fish||[]).length;
    if (totalFish) {
      h += `
        <div class="cover-section">
          <div class="cover-stats-grid">
            <div class="cover-stat">
              <div class="cover-stat-num">${totalFish}</div>
              <div class="cover-stat-label">рыб поймано</div>
            </div>
            <div class="cover-stat">
              <div class="cover-stat-num">${species}</div>
              <div class="cover-stat-label">${species === 1 ? 'вид' : 'вида'}</div>
            </div>
          </div>
        </div>`;
    }

    // Fish breakdown
    if (t.fish && t.fish.length) {
      const max = Math.max(...t.fish.map(f => f.count));
      h += `
        <div class="cover-section">
          <div class="cover-section-head"><div class="cover-section-title">Видовой состав</div></div>
          ${t.fish.map(f => `
            <div class="cover-fish-row">
              <div class="cover-fish-name">🐟 ${_esc(f.species)}</div>
              <div class="cover-fish-bar-wrap">
                <div class="cover-fish-bar" style="width:${Math.round(f.count/max*100)}%"></div>
              </div>
              <div class="cover-fish-count">${f.count} шт</div>
            </div>`).join('')}
        </div>`;
    }

    // Conditions
    const c = t.conditions || {};
    if (c.temp || c.wind || c.weather) {
      h += `
        <div class="cover-section">
          <div class="cover-conds">
            ${c.temp    ? `<div class="cover-cond"><div class="cover-cond-icon">🌡</div><div class="cover-cond-val">${_esc(c.temp)}</div><div class="cover-cond-label">воздух</div></div>` : ''}
            ${c.wind    ? `<div class="cover-cond"><div class="cover-cond-icon">💨</div><div class="cover-cond-val">${_esc(c.wind)}</div><div class="cover-cond-label">ветер</div></div>` : ''}
            ${c.weather ? `<div class="cover-cond"><div class="cover-cond-icon">🌤</div><div class="cover-cond-val">${_esc(c.weather)}</div><div class="cover-cond-label">погода</div></div>` : ''}
          </div>
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

    // Редактировать поездку
    el.querySelector('#coverEdit')?.addEventListener('click', () => {
      hide();
      if (typeof TripsIndex !== 'undefined') TripsIndex.showEdit(_tripId);
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
      AppNav.setMode('trip', 'guide');
      if (typeof AppRouter !== 'undefined') AppRouter.show('guide');

      const trip    = TripsData.getById(_tripId);

      // ── Сохраняем текущую поездку глобально (используется Реки, Меню и др.) ──
      if (window.APP) {
        window.APP.currentTripId   = _tripId;
        window.APP.currentTripData = trip?.importData || null;
      }

      const guideEl = document.getElementById('p-guide');
      if (!guideEl) return;

      // Если у экспедиции есть импортированные данные — рендерим маршрут
      if (trip?.importData?.route?.length) {
        guideEl.innerHTML = _renderGuide(trip);
        // Привязываем аккордеоны
        guideEl.addEventListener('click', e => {
          const hd = e.target.closest('[data-target]');
          if (!hd) return;
          const body = document.getElementById(hd.dataset.target);
          if (!body) return;
          const chev = hd.querySelector('.g-acc-chev');
          const open = body.classList.toggle('show');
          if (chev) chev.classList.toggle('open', open);
        });
      } else {
        // Заглушка (рыбалки или экспедиции без импорта)
        guideEl.innerHTML = `
          <div style="padding:52px 16px 16px;background:var(--topbar-bg);color:#fff;font-size:18px;font-weight:700">
            ${trip ? _esc(trip.name) : 'Поездка'}
          </div>
          <div style="padding:24px 16px;color:var(--label3);font-size:15px;text-align:center;margin-top:40px">
            🚧 Маршрут не добавлен.<br><br>
            Загрузи JSON-файл от AI в настройках поездки.
          </div>`;
      }
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
        .g-day-hd{display:flex;justify-content:space-between;align-items:center;padding:11px 15px;cursor:pointer;border-top:0.5px solid var(--sep2);-webkit-tap-highlight-color:transparent}
        .g-day-hd:first-child{border-top:none}
        .g-day-hd:active{background:var(--bg3)}
        .g-day-title{font-size:13px;font-weight:700;color:var(--label)}
        .g-day-body{display:none;border-top:0.5px solid var(--sep2)}
        .g-day-body.show{display:block}
        .g-row{display:flex;gap:12px;padding:8px 15px;border-bottom:0.5px solid var(--sep2)}
        .g-row:last-child{border-bottom:none}
        .g-row-time{font-size:11px;color:var(--label3);min-width:80px;flex-shrink:0;padding-top:2px;font-weight:500}
        .g-row-act{font-size:13px;color:var(--label);line-height:1.45}
      </style>
      <div style="background:var(--topbar-bg);color:#fff;padding:52px 16px 14px;position:sticky;top:0;z-index:10;margin-bottom:4px">
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
      let rb = '';
      d.route.forEach((day, idx) => {
        const dayId = 'gday_' + idx;
        const isFirst = idx === 0;
        rb += `<div class="g-day-hd" data-target="${dayId}">
          <span class="g-day-title">${_esc(day.t)}</span>
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

    h += `<div style="height:20px"></div>`;
    return h;
  }



  return { show, hide, getCurrentTripId: () => _tripId };
})();

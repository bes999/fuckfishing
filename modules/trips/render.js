'use strict';

const TripsRender = (() => {

  const MONTHS = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  let _filter = 'all'; // all | expedition | fishing
  let _clickHandler = null;

  function render(el) {
    const now   = new Date().getFullYear();
    const stats = TripsData.getYearStats(String(now));
    const byYear = TripsData.getByYear();

    el.innerHTML = `
      ${_topbar()}
      <div class="page-scroll">
        ${_statsBar(stats)}
        ${_filters()}
        ${_feed(byYear)}
      </div>`;

    _bind(el);
  }

  function _topbar() {
    return `
      <div class="trips-topbar">
        <div class="trips-topbar-title">Поездки</div>
        <button class="trips-btn-create" data-action="create">＋ Поездка</button>
      </div>`;
  }

  function _statsBar(stats) {
    return `
      <div class="trips-stats">
        <div class="trips-stat">
          <div class="trips-stat-num">${stats.trips}</div>
          <div class="trips-stat-label">поездки ${new Date().getFullYear()}</div>
        </div>
        <div class="trips-stat">
          <div class="trips-stat-num">${stats.fish}</div>
          <div class="trips-stat-label">рыб поймано</div>
        </div>
        <div class="trips-stat">
          <div class="trips-stat-num">${stats.species}</div>
          <div class="trips-stat-label">видов</div>
        </div>
      </div>`;
  }

  function _filters() {
    const f = [
      { id: 'all',        label: 'Все'          },
      { id: 'expedition', label: 'Экспедиции'   },
      { id: 'fishing',    label: 'Рыбалки'      },
    ];
    return `
      <div class="trips-filters">
        ${f.map(fi => `
          <button class="filter-chip ${fi.id === _filter ? 'active' : ''}" data-filter="${fi.id}">
            ${fi.label}
          </button>`).join('')}
      </div>`;
  }

  function _feed(byYear) {
    const years = Object.keys(byYear).sort((a,b) => b - a);
    if (!years.length)
      return '<div style="padding:32px 16px;color:var(--label3);text-align:center;font-size:14px">Поездок пока нет. Создайте первую!</div>';

    let h = '<div style="padding:16px 16px 0">';
    years.forEach((year, idx) => {
      let trips = byYear[year];
      if (_filter !== 'all') trips = trips.filter(t => t.type === _filter);
      if (!trips.length) return;

      const isOpen = idx === 0;
      const expCount  = trips.filter(t => t.type === 'expedition').length;
      const fishCount = trips.filter(t => t.type === 'fishing').length;
      const parts = [
        expCount  ? expCount  + ' экспед.' : '',
        fishCount ? fishCount + ' рыбалок' : ''
      ].filter(Boolean).join(' · ');

      h += `
        <div class="year-section">
          <div class="year-hd ${isOpen ? 'open' : ''}" data-year="${year}">
            <div class="year-hd-left">
              <span class="year-title">${year}</span>
              <span class="year-count">${parts}</span>
            </div>
            <div class="year-chevron">
              <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <polyline points="6 9 12 15 18 9"/>
              </svg>
            </div>
          </div>
          <div class="year-body ${isOpen ? '' : 'hidden'}">
            <div class="year-body-inner">
              ${trips.sort((a,b) => new Date(b.startDate) - new Date(a.startDate)).map(_tripCard).join('')}
            </div>
          </div>
        </div>`;
    });
    h += '</div>';
    return h;
  }

  function _tripCard(t) {
    const icon  = t.type === 'expedition' ? (t.status === 'done' ? '🌲' : '🏔') : _seasonIcon(t.startDate);
    const iconCls = t.type === 'expedition' ? 'exp' : 'fish';
    const dates = _dateRange(t.startDate, t.endDate);
    const parts = t.participants ? t.participants.join(' · ') : '';
    const fish  = (t.fish || []).map(f => `${f.species} ×${f.count}`).join(', ');
    const daysLeft = Math.ceil((new Date(t.startDate) - new Date()) / 86400000);

    return `
      <div class="trip-card type-${t.type} status-${t.status}" data-trip-id="${t.id}">
        <div class="tc-main">
          <div class="tc-icon ${iconCls}">${icon}</div>
          <div class="tc-body">
            <div class="tc-name">${_esc(t.name)}</div>
            <div class="tc-sub">📅 ${dates}${parts ? ' · 👥 ' + parts : ''}</div>
          </div>
          <div class="tc-right">
            <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
            ${t.status === 'upcoming' && daysLeft > 0 ? `<div class="exp-days-left">через ${daysLeft} дн.</div>` : ''}
          </div>
        </div>
        <div class="tc-footer">
          <div class="tc-tags">
            ${fish ? fish.split(', ').map(f => `<div class="tc-tag">${_esc(f)}</div>`).join('') : ''}
          </div>
          ${t.rating ? `<div class="tc-score"><div class="tc-score-num">${t.rating}</div><div class="tc-score-den">/10</div></div>` : ''}
          <div class="tc-goto">›</div>
        </div>
      </div>`;
  }

  function _bind(el) {
    if (_clickHandler) el.removeEventListener('click', _clickHandler);
    _clickHandler = e => {
      // Filter chips
      const chip = e.target.closest('[data-filter]');
      if (chip) {
        _filter = chip.dataset.filter;
        if (typeof TripsIndex !== 'undefined') TripsIndex.render();
        return;
      }

      // Create button
      const createBtn = e.target.closest('[data-action="create"]');
      if (createBtn) {
        if (typeof TripsIndex !== 'undefined') TripsIndex.showCreate();
        return;
      }

      // Year collapse
      const hd = e.target.closest('.year-hd');
      if (hd) {
        const section = hd.closest('.year-section');
        const body = section ? section.querySelector('.year-body') : null;
        if (!body) return;
        const open = hd.classList.toggle('open');
        body.classList.toggle('hidden', !open);
        return;
      }

      // Trip card
      const card = e.target.closest('[data-trip-id]');
      if (card && typeof TripsIndex !== 'undefined') TripsIndex.openTrip(card.dataset.tripId);
    };
    el.addEventListener('click', _clickHandler);
  }

  // Helpers
  function _dateRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end);
    if (start === end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _seasonIcon(dateStr) {
    const m = parseInt(dateStr.slice(5,7));
    if (m <= 2 || m === 12) return '❄️';
    if (m <= 4) return '🌱';
    if (m <= 8) return '☀️';
    return '🍂';
  }

  function _esc(s) {
    return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render };
})();

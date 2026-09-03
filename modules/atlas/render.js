'use strict';

const AtlasRender = (() => {

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _navUrl(lat, lon, name) {
    return 'https://yandex.ru/maps/?pt=' + lon + ',' + lat +
           '&z=13&l=map&text=' + encodeURIComponent(name || '');
  }

  // Поездки, у которых есть хоть одна река/точка с названием региона в
  // строке региона — простое текстовое совпадение, не жёсткая привязка;
  // этого достаточно для счётчика "N поездок туда", не для точной аналитики.
  function _tripsForRegion(regionName) {
    if (typeof TripsData === 'undefined') return [];
    const needle = regionName.toLowerCase().split(' ')[0]; // "Сахалин" из "Сахалин"
    return TripsData.getAll().filter(t => {
      const rivers = (t.importData?.rivers || t.rivers || []);
      const hay = (t.name + ' ' + rivers.map(r => (r.region || '') + ' ' + (r.name || '')).join(' ')).toLowerCase();
      return hay.includes(needle);
    });
  }

  /* ══════════════════ Список регионов ══════════════════ */

  function list() {
    const regions = AtlasData.getAll();
    const totalRivers = regions.reduce((s, r) => s + r.rivers.length, 0);
    const totalTrips = regions.reduce((s, r) => s + _tripsForRegion(r.name).length, 0);

    return `
      <div class="atl-topbar">
        <div class="atl-topbar-eyebrow">Личное · накопленный опыт</div>
        <div class="atl-topbar-title">Атлас</div>
      </div>
      <div class="atl-scroll">
        <div class="atl-stats">
          <div class="atl-stat"><div class="atl-stat-num">${regions.length}</div><div class="atl-stat-lbl">региона</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${totalRivers}</div><div class="atl-stat-lbl">точек задокументировано</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${totalTrips}</div><div class="atl-stat-lbl">поездок связано</div></div>
        </div>
        <div class="atl-grid">
          ${regions.map(_regionTile).join('')}
        </div>
      </div>`;
  }

  function _regionTile(r) {
    const empty = !r.rivers.length;
    return `
      <div class="atl-tile ${empty ? 'atl-tile--empty' : ''}" data-atl-region="${r.id}">
        <div class="atl-tile-emoji">${r.emoji}</div>
        <div class="atl-tile-name">${_esc(r.name)}</div>
        <div class="atl-tile-sub">${empty ? 'скоро' : r.rivers.length + ' точек'}</div>
      </div>`;
  }

  /* ══════════════════ Страница региона ══════════════════ */

  function region(r) {
    const trips = _tripsForRegion(r.name);
    const licensed = r.rivers.filter(riv => riv.license && riv.license !== 'Свободная').length;

    return `
      <div class="atl-topbar">
        <button class="atl-back" data-atl-back="list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="atl-topbar-eyebrow">${_esc(r.subtitle)}</div>
        <div class="atl-topbar-title">${r.emoji} ${_esc(r.name)}</div>
      </div>
      <div class="atl-scroll">
        ${r.rivers.length ? `
        <div class="atl-stats">
          <div class="atl-stat"><div class="atl-stat-num">${r.rivers.length}</div><div class="atl-stat-lbl">рек / точек</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${licensed}</div><div class="atl-stat-lbl">по путёвке</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${trips.length}</div><div class="atl-stat-lbl">наших поездок</div></div>
        </div>
        <div class="atl-sec-label">Реки и точки</div>
        <div class="atl-riverlist">
          ${r.rivers.map(riv => _riverRow(r.id, riv)).join('')}
        </div>` : `
        <div class="atl-empty">
          <div class="atl-empty-icon">📍</div>
          <div class="atl-empty-title">Пока пусто</div>
          <div class="atl-empty-sub">Как только определимся с поездкой сюда — начнём собирать реки, виды рыб и точки.</div>
        </div>`}
        ${trips.length ? `
        <div class="atl-sec-label">Наши поездки сюда</div>
        <div class="atl-triplist">
          ${trips.map(t => `<div class="atl-trip-row" data-atl-trip="${t.id}">
            <span class="atl-trip-name">${_esc(t.name)}</span>
            <span class="atl-trip-date">${_esc(t.startDate || '')}</span>
          </div>`).join('')}
        </div>` : ''}
      </div>`;
  }

  function _riverRow(regionId, riv) {
    const licenseBadge = riv.license && riv.license !== 'Свободная'
      ? `<span class="atl-badge atl-badge--warn">по путёвке</span>`
      : '';
    return `
      <div class="atl-river-row" data-atl-river="${riv.id}">
        <div class="atl-river-main">
          <div class="atl-river-name">${_esc(riv.name)}</div>
          <div class="atl-river-type">${_esc(riv.type)}</div>
        </div>
        ${licenseBadge}
        <div class="atl-river-goto">›</div>
      </div>`;
  }

  /* ══════════════════ Страница реки ══════════════════ */

  function river(r, riv) {
    const facts = [riv.type, riv.size].filter(Boolean).join(' · ');
    const sections = [
      { title: '🚗 Доступ', body: riv.access },
      { title: '🎣 Где и как ловить', body: riv.fishing },
      { title: '🧰 Снасть', body: riv.lures },
      { title: '⏰ Лучшее время', body: riv.best },
      { title: '👥 Люди / статус', body: [riv.crowd, riv.license].filter(Boolean).join('. ') },
    ].filter(s => s.body && s.body !== '—');

    return `
      <div class="atl-topbar">
        <button class="atl-back" data-atl-back="region" data-atl-region-id="${r.id}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="atl-topbar-eyebrow">${_esc(r.name)}</div>
        <div class="atl-topbar-title">${_esc(riv.name)}</div>
      </div>
      <div class="atl-scroll">
        <div class="atl-river-hero">
          <div class="atl-river-hero-facts">${_esc(facts)}</div>
          ${riv.warning ? `<div class="atl-warning">${_esc(riv.warning)}</div>` : ''}
          ${riv.lat != null ? `<div class="atl-nav-btn" data-atl-nav="${_navUrl(riv.lat, riv.lon, riv.name)}">📍 Открыть на карте</div>` : ''}
        </div>
        ${sections.map(_accSection).join('')}
      </div>`;
  }

  function _accSection(s) {
    const id = 'atlacc_' + Math.random().toString(36).slice(2);
    return `
      <div class="atl-acc">
        <div class="atl-acc-hd" data-atl-toggle="${id}">
          <span class="atl-acc-title">${s.title}</span>
          <span class="atl-acc-chev">⌄</span>
        </div>
        <div class="atl-acc-body" id="${id}"><div class="atl-acc-body-inner"><div class="atl-acc-content">${_esc(s.body)}</div></div></div>
      </div>`;
  }

  return { list, region, river };
})();

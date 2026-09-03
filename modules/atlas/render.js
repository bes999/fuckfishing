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
    const needle = regionName.toLowerCase().split(' ')[0];
    return TripsData.getAll().filter(t => {
      const rivers = (t.importData?.rivers || t.rivers || []);
      const hay = (t.name + ' ' + rivers.map(r => (r.region || '') + ' ' + (r.name || '')).join(' ')).toLowerCase();
      return hay.includes(needle);
    });
  }

  function _acc(title, bodyHtml) {
    const id = 'atlacc_' + Math.random().toString(36).slice(2);
    return `
      <div class="atl-acc">
        <div class="atl-acc-hd" data-atl-toggle="${id}">
          <span class="atl-acc-title">${title}</span>
          <span class="atl-acc-chev">⌄</span>
        </div>
        <div class="atl-acc-body" id="${id}"><div class="atl-acc-body-inner"><div class="atl-acc-content">${bodyHtml}</div></div></div>
      </div>`;
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
    const empty = !r.rivers.length;

    if (empty) {
      return `
        <div class="atl-topbar">
          <button class="atl-back" data-atl-back="list">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
          </button>
          <div class="atl-topbar-eyebrow">${_esc(r.subtitle)}</div>
          <div class="atl-topbar-title">${r.emoji} ${_esc(r.name)}</div>
        </div>
        <div class="atl-scroll">
          <div class="atl-empty">
            <div class="atl-empty-icon">📍</div>
            <div class="atl-empty-title">Пока пусто</div>
            <div class="atl-empty-sub">Как только определимся с поездкой сюда или ты расскажешь, что уже знаешь по прошлым разам — начнём собирать виды рыб, реки и точки.</div>
          </div>
        </div>`;
    }

    return `
      <div class="atl-topbar">
        <button class="atl-back" data-atl-back="list">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div class="atl-topbar-eyebrow">${_esc(r.subtitle)}</div>
        <div class="atl-topbar-title">${r.emoji} ${_esc(r.name)}</div>
      </div>
      <div class="atl-scroll">
        <div class="atl-stats">
          <div class="atl-stat"><div class="atl-stat-num">${r.species.length}</div><div class="atl-stat-lbl">видов рыбы</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${r.rivers.length}</div><div class="atl-stat-lbl">рек / точек</div></div>
          <div class="atl-stat"><div class="atl-stat-num">${trips.length}</div><div class="atl-stat-lbl">наших поездок</div></div>
        </div>

        ${r.species.length ? _acc('🐟 Виды рыбы и сроки хода', _speciesTable(r.species)) : ''}
        ${r.landmarks.length ? _acc('🏞 Природные особенности', _list(r.landmarks)) : ''}
        ${r.history ? _acc('📜 История', `<p>${_esc(r.history)}</p>`) : ''}
        ${r.tourism.length ? _acc('🧭 Туристическая справка', _list(r.tourism)) : ''}

        <div class="atl-sec-label">Реки и точки${licensed ? ` · ${licensed} по путёвке` : ''}</div>
        <div class="atl-riverlist">
          ${r.rivers.map(riv => _riverRow(riv)).join('')}
        </div>

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

  function _speciesTable(species) {
    return `
      <div class="atl-sptable">
        ${species.map(s => `
          <div class="atl-sprow">
            <div class="atl-sprow-hd">
              <span class="atl-sp-name">${_esc(s.name)}</span>
              <span class="atl-sp-months">${_esc(s.months)}</span>
            </div>
            ${s.note ? `<div class="atl-sp-note">${_esc(s.note)}</div>` : ''}
          </div>`).join('')}
      </div>`;
  }

  function _list(items) {
    return `
      <div class="atl-plainlist">
        ${items.map(i => `<div class="atl-plainrow"><b>${_esc(i.name)}</b> — ${_esc(i.desc)}</div>`).join('')}
      </div>`;
  }

  function _riverRow(riv) {
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
          <div class="atl-badge ${riv.license !== 'Свободная' ? 'atl-badge--warn' : 'atl-badge--ok'}" style="margin-top:8px;display:inline-block">${_esc(riv.license)}</div>
          ${riv.note ? `<div class="atl-river-hero-note">${_esc(riv.note)}</div>` : ''}
          ${riv.lat != null ? `<div class="atl-nav-btn" data-atl-nav="${_navUrl(riv.lat, riv.lon, riv.name)}">📍 Открыть на карте</div>` : ''}
        </div>
      </div>`;
  }

  return { list, region, river };
})();

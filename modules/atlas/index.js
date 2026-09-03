'use strict';

const AtlasIndex = (() => {

  let _el = null;
  let _clickHandler = null;
  let _currentRegionId = null; // нужен для открытия реки — клик по строке реки несёт только riverId

  function show(el) {
    _el = el;
    _renderList();
  }

  function _renderList() {
    if (!_el) return;
    _currentRegionId = null;
    _el.innerHTML = AtlasRender.list();
    _bind();
    _el.scrollTop = 0;
  }

  function _renderRegion(regionId) {
    if (!_el) return;
    const r = AtlasData.getById(regionId);
    if (!r) { _renderList(); return; }
    _currentRegionId = regionId;
    _el.innerHTML = AtlasRender.region(r);
    _bind();
    _el.scrollTop = 0;
  }

  function _renderRiver(regionId, riverId) {
    if (!_el) return;
    const r = AtlasData.getById(regionId);
    const riv = r ? AtlasData.getRiver(regionId, riverId) : null;
    if (!r || !riv) { _renderRegion(regionId); return; }
    _el.innerHTML = AtlasRender.river(r, riv);
    _bind();
    _el.scrollTop = 0;
  }

  function _bind() {
    if (_clickHandler) _el.removeEventListener('click', _clickHandler);
    _clickHandler = e => {
      const back = e.target.closest('[data-atl-back]');
      if (back) {
        if (back.dataset.atlBack === 'list') _renderList();
        else _renderRegion(back.dataset.atlRegionId);
        return;
      }
      const tile = e.target.closest('[data-atl-region]');
      if (tile) { _renderRegion(tile.dataset.atlRegion); return; }

      const riverRow = e.target.closest('[data-atl-river]');
      if (riverRow && _currentRegionId) { _renderRiver(_currentRegionId, riverRow.dataset.atlRiver); return; }

      const tripRow = e.target.closest('[data-atl-trip]');
      if (tripRow && typeof TripCoverIndex !== 'undefined') {
        TripCoverIndex.show(tripRow.dataset.atlTrip);
        return;
      }

      const navBtn = e.target.closest('[data-atl-nav]');
      if (navBtn) { window.open(navBtn.dataset.atlNav, '_blank'); return; }

      const acc = e.target.closest('[data-atl-toggle]');
      if (acc) {
        const body = document.getElementById(acc.dataset.atlToggle);
        const chev = acc.querySelector('.atl-acc-chev');
        if (body) body.classList.toggle('show');
        if (chev) chev.classList.toggle('open');
        return;
      }
    };
    _el.addEventListener('click', _clickHandler);
  }

  return { show };
})();

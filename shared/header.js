'use strict';
/* globals AppRouter */

/* =========================================================
   AppHeader — сквозная шапка (аватар+имя слева, тема/+поездка/
   гамбургер справа) и выезжающее меню с двумя разделами:
     "Личное"  — не привязано к конкретной поездке (снаряга,
                 аптечка — они про человека, а не про группу),
                 видно всегда.
     "Поездка" — всё, что относится к группе на конкретном
                 выезде; видно только когда есть открытая поездка
                 (window.APP.currentTripId), иначе — подсказка
                 открыть её на вкладке "Поездки".

   Публичный API:
     AppHeader.init(onNavigate)
     AppHeader.render()      — перерисовать (например после смены профиля)
     AppHeader.closeDrawer()
   ========================================================= */
const AppHeader = (() => {

  let _cb   = null;
  let _el   = null;
  let _open = false;

  const PERSONAL_ITEMS = [
    { id: 'gear',             label: 'Снаряга',   icon: 'ti-backpack' },
    { id: 'medkit',           label: 'Аптечка',   icon: 'ti-first-aid-kit' },
    { id: 'members',          label: 'Участники', icon: 'ti-users' },
    { id: 'medkit-reference', label: 'Справка',   icon: 'ti-list' },
  ];

  const TRIP_ITEMS = [
    { id: 'guide',    label: 'Гид',          icon: 'ti-map-2' },
    { id: 'rivers',   label: 'Реки',         icon: 'ti-droplet' },
    { id: 'menu',     label: 'Меню',         icon: 'ti-clipboard-list' },
    { id: 'catches',  label: 'Улов',         icon: 'ti-fish' },
    { id: 'expenses', label: 'Расходы',      icon: 'ti-credit-card' },
    { id: 'shopping', label: 'Закупка',      icon: 'ti-shopping-cart' },
    { id: 'safety',   label: 'Безопасность', icon: 'ti-shield' },
    { id: 'bar',      label: 'Бар',          icon: 'ti-glass-full' },
    { id: 'recipes',  label: 'Рецепты',      icon: 'ti-chef-hat' },
  ];

  /* ── Init ── */
  function init(onNavigate) {
    _cb = onNavigate;
    _el = document.getElementById('app-header');
    render();
  }

  const _moonSvg = `<path d="M21 12.79A9 9 0 1111.21 3 7 7 0 0021 12.79z"/>`;
  const _sunSvg  = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;

  /* ── Верхняя строка: аватар+имя слева, тема/+поездка/гамбургер справа ── */
  function render() {
    if (!_el) return;
    const { name, avatar, initials } = _identity();
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';

    _el.innerHTML = `
      <div class="ah-identity" data-action="ah-profile">
        <div class="ah-avatar">${UIUtils.avatarHtml(avatar, initials)}</div>
        <div class="ah-name">${_esc(name)}</div>
      </div>
      <div class="ah-actions">
        <button class="ah-icon-btn" data-action="ah-theme" aria-label="Тема">
          <svg id="ahThemeSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">${isDark ? _sunSvg : _moonSvg}</svg>
        </button>
        <button class="ah-icon-btn" data-action="ah-create-trip" aria-label="Новая поездка">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/>
          </svg>
        </button>
        <button class="ah-burger" data-action="ah-menu" aria-label="Меню">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
            <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
          </svg>
        </button>
      </div>`;

    _el.querySelector('[data-action="ah-profile"]')?.addEventListener('click', () => _cb && _cb('profile'));
    _el.querySelector('[data-action="ah-menu"]')?.addEventListener('click', openDrawer);
    _el.querySelector('[data-action="ah-theme"]')?.addEventListener('click', _toggleTheme);
    _el.querySelector('[data-action="ah-create-trip"]')?.addEventListener('click', () => {
      if (typeof AppNav !== 'undefined') AppNav.setActive('trips');
      if (typeof AppRouter !== 'undefined') AppRouter.show('trips');
      if (typeof TripsIndex !== 'undefined') {
        TripsIndex.render();
        setTimeout(() => TripsIndex.showCreate(), 50);
      }
    });
  }

  function _toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const next = isDark ? 'light' : 'dark';
    document.documentElement.setAttribute('data-theme', next);
    try { localStorage.setItem('theme_ff', next); } catch (e) {}
    const svg = document.getElementById('ahThemeSvg');
    if (svg) svg.innerHTML = next === 'dark' ? _sunSvg : _moonSvg;
  }

  function _identity() {
    const profile = window.APP?.profile;
    const name    = profile?.displayName || window.APP?.user?.email || 'Рыбак';
    const avatar  = profile?.avatar || '';
    const initials = (name[0] || '?').toUpperCase();
    return { name, avatar, initials };
  }

  function _statsSub() {
    if (typeof TripsData === 'undefined') return '';
    const trips = TripsData.getAll();
    const done  = trips.filter(t => t.status === 'done').length;
    let fish = 0;
    trips.forEach(t => (t.fish || []).forEach(f => fish += f.count || 0));
    return `${done} поездок · ${fish} рыб`;
  }

  /* ── Выезжающее меню ── */
  function openDrawer() {
    if (_open) return;
    _closeImmediate();
    _open = true;

    const { name, avatar, initials } = _identity();
    const tripId   = window.APP?.currentTripId;
    const tripName = window.APP?.currentTripData?.name;

    const overlay = document.createElement('div');
    overlay.className = 'ah-drawer-overlay';
    overlay.id = 'ah-drawer-overlay';

    const drawer = document.createElement('div');
    drawer.className = 'ah-drawer';
    drawer.id = 'ah-drawer';
    drawer.innerHTML = `
      <div class="ah-drawer-head" data-action="ah-drawer-profile">
        <div class="ah-drawer-avatar">${UIUtils.avatarHtml(avatar, initials)}</div>
        <div>
          <div class="ah-drawer-name">${_esc(name)}</div>
          <div class="ah-drawer-sub">${_esc(_statsSub())}</div>
        </div>
      </div>
      <div class="ah-drawer-body">
        <div class="ah-drawer-group-label">Личное</div>
        ${PERSONAL_ITEMS.map(_itemHtml).join('')}
        <div class="ah-drawer-group-label">Поездка${tripName ? ' — ' + _esc(tripName) : ''}</div>
        ${tripId
          ? TRIP_ITEMS.map(_itemHtml).join('')
          : `<div class="ah-drawer-hint">Открой поездку на вкладке «Поездки», чтобы увидеть Гид, Реки, Меню и другие разделы</div>`}
      </div>`;

    document.body.appendChild(overlay);
    document.body.appendChild(drawer);
    // rAF, чтобы transition сыграл, а не применился мгновенно
    requestAnimationFrame(() => {
      overlay.classList.add('open');
      drawer.classList.add('open');
    });

    overlay.addEventListener('click', closeDrawer);
    drawer.querySelector('[data-action="ah-drawer-profile"]')?.addEventListener('click', () => {
      closeDrawer();
      _cb && _cb('profile');
    });
    drawer.querySelectorAll('[data-nav-id]').forEach(item => {
      item.addEventListener('click', () => {
        const id = item.dataset.navId;
        closeDrawer();
        _cb && _cb(id);
      });
    });
  }

  function _itemHtml(it) {
    return `
      <div class="ah-drawer-item" data-nav-id="${it.id}">
        <div class="ah-drawer-item-icon"><i class="ti ${it.icon}"></i></div>
        <div class="ah-drawer-item-label">${it.label}</div>
      </div>`;
  }

  function closeDrawer() {
    const overlay = document.getElementById('ah-drawer-overlay');
    const drawer  = document.getElementById('ah-drawer');
    _open = false;
    if (!overlay && !drawer) return;
    overlay?.classList.remove('open');
    drawer?.classList.remove('open');
    setTimeout(_closeImmediate, 300);
  }

  function _closeImmediate() {
    document.getElementById('ah-drawer-overlay')?.remove();
    document.getElementById('ah-drawer')?.remove();
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  return { init, render, closeDrawer };
})();

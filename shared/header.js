'use strict';
/* globals AppRouter */

/* =========================================================
   AppHeader — сквозная шапка (аватар+имя слева, гамбургер справа)
   и выезжающее меню со всеми разделами поездки. Список целиком
   виден только когда открыта поездка (window.APP.currentTripId) —
   почти все разделы приложения так или иначе относятся к поездке,
   поэтому смысла показывать их вне её контекста нет; без открытой
   поездки в меню только подсказка открыть её на вкладке "Поездки".

   Публичный API:
     AppHeader.init(onNavigate)
     AppHeader.render()      — перерисовать (например после смены профиля)
     AppHeader.closeDrawer()
   ========================================================= */
const AppHeader = (() => {

  let _cb   = null;
  let _el   = null;
  let _open = false;

  const TRIP_ITEMS = [
    { id: 'guide',    label: 'Гид',          icon: 'ti-map-2' },
    { id: 'rivers',   label: 'Реки',         icon: 'ti-droplet' },
    { id: 'menu',     label: 'Меню',         icon: 'ti-clipboard-list' },
    { id: 'catches',  label: 'Улов',         icon: 'ti-fish' },
    { id: 'expenses', label: 'Расходы',      icon: 'ti-credit-card' },
    { id: 'shopping', label: 'Закупка',      icon: 'ti-shopping-cart' },
    { id: 'members',  label: 'Участники',    icon: 'ti-users' },
    { id: 'medkit',   label: 'Аптечка',      icon: 'ti-first-aid-kit' },
    { id: 'gear',     label: 'Снаряга',      icon: 'ti-backpack' },
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

  /* ── Верхняя строка: аватар+имя, гамбургер ── */
  function render() {
    if (!_el) return;
    const { name, avatar, initials } = _identity();

    _el.innerHTML = `
      <div class="ah-identity" data-action="ah-profile">
        <div class="ah-avatar">${avatar || initials}</div>
        <div class="ah-name">${_esc(name)}</div>
      </div>
      <button class="ah-burger" data-action="ah-menu" aria-label="Меню">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round">
          <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
        </svg>
      </button>`;

    _el.querySelector('[data-action="ah-profile"]')?.addEventListener('click', () => _cb && _cb('profile'));
    _el.querySelector('[data-action="ah-menu"]')?.addEventListener('click', openDrawer);
  }

  function _identity() {
    const profile = window.APP?.profile;
    const name    = profile?.displayName || window.APP?.user?.email || 'Рыбак';
    const avatar  = profile?.avatar || '';
    const initials = (name[0] || '?').toUpperCase();
    return { name, avatar, initials };
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
        <div class="ah-drawer-avatar">${avatar || initials}</div>
        <div>
          <div class="ah-drawer-name">${_esc(name)}</div>
          <div class="ah-drawer-sub">Открыть профиль</div>
        </div>
      </div>
      <div class="ah-drawer-body">
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

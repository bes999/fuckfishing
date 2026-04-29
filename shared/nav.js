'use strict';

/* =========================================================
   AppNav — нижний навбар
   Два режима:
     'main' — Главная · Поездки · Профиль
     'trip' — Главная · Гид · Реки · Меню · Ещё
   ========================================================= */
var AppNav = (function () {

  var _cb      = null;   // onNavigate callback
  var _mode    = 'main';
  var _active  = 'home';
  var _el      = null;

  var MODES = {
    main: [
      {
        id: 'home', label: 'Главная',
        svg: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>'
      },
      {
        id: 'trips', label: 'Поездки',
        svg: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>'
      },
      {
        id: 'profile', label: 'Профиль',
        svg: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'
      }
    ],
    trip: [
      {
        id: 'home', label: 'Главная',
        svg: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>'
      },
      {
        id: 'guide', label: 'Гид',
        svg: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'
      },
      {
        id: 'rivers', label: 'Реки',
        svg: '<path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0"/>'
      },
      {
        id: 'menu', label: 'Меню',
        svg: '<path d="M3 2v7c0 1.1.9 2 2 2h4a2 2 0 002-2V2"/><path d="M7 2v20"/><path d="M21 15V2a5 5 0 00-5 5v6c0 1.1.9 2 2 2h3zm0 0v7"/>'
      },
      {
        id: 'more', label: 'Ещё',
        svg: '<circle cx="5" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="1.5" fill="currentColor" stroke="none"/><circle cx="19" cy="12" r="1.5" fill="currentColor" stroke="none"/>'
      }
    ]
  };

  function init(onNavigate) {
    _cb = onNavigate;
    _el = document.getElementById('bottom-nav');
    _render();
  }

  function setMode(mode, activeId) {
    _mode   = mode || 'main';
    _active = activeId || MODES[_mode][0].id;
    _render();
  }

  function setActive(id) {
    _active = id;
    if (!_el) return;
    var btns = _el.querySelectorAll('.bnav');
    btns.forEach(function (btn) {
      var isActive = btn.getAttribute('data-nav-id') === id;
      btn.classList.toggle('active', isActive);
    });
  }

  function _render() {
    if (!_el) return;
    var tabs = MODES[_mode] || MODES.main;
    var h = '<nav class="bottomnav">';
    tabs.forEach(function (tab) {
      var isActive = tab.id === _active;
      h += '<div class="bnav' + (isActive ? ' active' : '') + '" data-nav-id="' + tab.id + '">';
      h += '  <div class="bnav-active-dot"></div>';
      h += '  <svg viewBox="0 0 24 24">' + tab.svg + '</svg>';
      h += '  ' + tab.label;
      h += '</div>';
    });
    h += '</nav>';
    _el.innerHTML = h;

    /* привязка кликов */
    _el.querySelectorAll('.bnav').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var id = btn.getAttribute('data-nav-id');
        if (_cb) _cb(id);
      });
    });
  }

  return { init: init, setMode: setMode, setActive: setActive };
})();

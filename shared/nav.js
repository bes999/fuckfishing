'use strict';

/* =========================================================
   AppNav — нижний навбар. Статичный набор из 4 вкладок —
   не переключается по режимам, поэтому из любой точки
   приложения всегда виден путь домой/к поездкам/в текущую
   поездку/в профиль. Всё остальное (Гид->Реки/Меню/Улов/...,
   Бар, Аптечка, Снаряга и т.д.) — в выезжающем меню AppHeader.
   ========================================================= */
var AppNav = (function () {

  var _cb     = null;   // onNavigate callback
  var _active = 'home';
  var _el     = null;

  var TABS = [
    {
      id: 'home', label: 'Главная',
      svg: '<path d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"/>'
    },
    {
      id: 'trips', label: 'Поездки',
      svg: '<path d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2"/>'
    },
    {
      id: 'guide', label: 'Поездка',
      svg: '<rect x="4" y="2" width="16" height="20" rx="2"/><path d="M8 7h8M8 11h8M8 15h5"/>'
    },
    {
      id: 'profile', label: 'Профиль',
      svg: '<path d="M20 21v-2a4 4 0 00-4-4H8a4 4 0 00-4 4v2"/><circle cx="12" cy="7" r="4"/>'
    }
  ];

  function init(onNavigate) {
    _cb = onNavigate;
    _el = document.getElementById('bottom-nav');
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
    var h = '<nav class="bottomnav">';
    TABS.forEach(function (tab) {
      var isActive = tab.id === _active;
      h += '<div class="bnav' + (isActive ? ' active' : '') + '" data-nav-id="' + tab.id + '">';
      h += '  <div class="bnav-dot"></div>';
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

  return { init: init, setActive: setActive };
})();

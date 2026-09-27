'use strict';

const SafetyIndex = (() => {

  let _el = null;
  let _onClose = null;

  function show(el, onClose, tripId) {
    _el = el;
    _onClose = onClose || null;
    SafetyRender.render(el, tripId);
  }

  function close() {
    if (typeof _onClose === 'function') {
      _onClose();
    } else {
      // fallback — вернуться на главную
      if (typeof onNavigate === 'function') onNavigate('home');
    }
  }

  return { show, close };
})();

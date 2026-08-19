'use strict';

const SafetyIndex = (() => {

  let _el = null;
  let _onClose = null;

  function show(el, onClose) {
    _el = el;
    _onClose = onClose || null;
    SafetyRender.render(el);
  }

  function close() {
    if (typeof _onClose === 'function') {
      _onClose();
    } else {
      // fallback — вернуться в "ещё"
      if (typeof onNavigate === 'function') onNavigate('more');
    }
  }

  return { show, close };
})();

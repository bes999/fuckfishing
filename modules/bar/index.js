'use strict';

const BarIndex = (() => {

  let _el  = null;
  let _initialized = false;

  function show(el) {
    _el = el;
    if (!_initialized) {
      BarState.load();
      _initialized = true;
    }
    BarRender.render(_el);
    BarFirebase.subscribe(function() {
      if (typeof BarRender !== 'undefined') BarRender.refresh();
    });
  }

  function close() {
    BarFirebase.unsubscribe();
    // Возврат назад — определяется снаружи через onNavigate
    if (typeof onNavigate === 'function') onNavigate('home');
  }

  return { show, close };
})();

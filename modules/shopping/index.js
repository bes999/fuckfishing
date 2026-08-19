'use strict';

const ShoppingIndex = (() => {

  let _el      = null;
  let _tripId  = null;
  let _initialized = false;

  function show(el, tripId) {
    _el     = el;
    _tripId = tripId || window.APP?.currentTripId || null;

    if (!_tripId) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--label3)">Поездка не выбрана</div>';
      return;
    }

    if (!_initialized) {
      ShoppingState.load();
      _initialized = true;
    }

    ShoppingRender.render(_el, _tripId);
    ShoppingFirebase.subscribe(_tripId, function() {
      if (typeof ShoppingRender !== 'undefined') ShoppingRender.refresh();
    });
  }

  function close() {
    ShoppingFirebase.unsubscribe();
    if (typeof onNavigate === 'function') onNavigate('guide');
  }

  return { show, close };
})();

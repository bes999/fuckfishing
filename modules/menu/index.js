'use strict';

const MenuIndex = (() => {

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
      MenuState.load();
      _initialized = true;
    }

    // Получаем или инициализируем дни
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const days = trip
      ? MenuState.initDays(_tripId, trip.startDate, trip.endDate)
      : MenuState.getDays(_tripId) || [];

    MenuRender.setDays(days);
    MenuRender.render(_el, _tripId);

    MenuFirebase.subscribe(_tripId, function() {
      if (typeof MenuRender !== 'undefined') MenuRender.refresh();
    });
  }

  function close() {
    MenuFirebase.unsubscribe();
    if (typeof onNavigate === 'function') onNavigate('more');
  }

  return { show, close };
})();

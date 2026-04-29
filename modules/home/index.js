'use strict';

const HomeIndex = (() => {

  let _el   = null;
  let _user = null;

  function init(el, user) {
    _el   = el;
    _user = user;
    TripsData.load();
    _render();
  }

  function _render() {
    HomeRender.render(_el, _user);
  }

  function refresh() {
    if (_el) _render();
  }

  function openTrip(tripId) {
    // Переход на обложку поездки
    const trip = TripsData.getById(tripId);
    if (!trip) return;
    TripCoverIndex.show(tripId);
  }

  return { init, refresh, openTrip };
})();

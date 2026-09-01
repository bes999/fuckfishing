'use strict';

const CatchesIndex = (() => {

  let _el     = null;
  let _tripId = null;

  function show(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;

    if (!tripId) {
      el.innerHTML = '<div style="padding:40px;text-align:center;color:var(--label3)">Поездка не выбрана</div>';
      return;
    }

    // Грузим участников из Firebase
    _loadMembers().then(() => {
      // Загружаем реки из данных поездки
      _loadRivers();

      // Миграция старых данных из localStorage (один раз)
      CatchesFirebase.migrateFromLocalStorage(tripId).then(() => {

        // Подписываемся на поимки
        CatchesFirebase.listen(tripId, arr => {
          CatchesState.setCatches(tripId, arr);
          if (typeof CatchesRender !== 'undefined') CatchesRender.refresh();
        });

        CatchesRender.render(el, tripId);
      });
    });
  }

  function _loadMembers() {
    // Только участники ЭТОЙ поездки — тот же баг, что был в Расходах
    // (modules/expenses/index.js): раньше тут подтягивался весь список
    // members приложения, а не участники конкретной поездки.
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    CatchesState.setMembers(_tripId, trip?.participants || []);
    return Promise.resolve();
  }

  function _loadRivers() {
    // Берём реки из importData поездки
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const rivers = (trip?.importData?.rivers || trip?.rivers || []).map(r => r.name).filter(Boolean);
    CatchesState.setRivers(_tripId, rivers);
  }

  function close() {
    CatchesFirebase.stopListening();
    if (typeof onNavigate === 'function') onNavigate('guide');
  }

  return { show, close };
})();

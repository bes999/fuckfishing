'use strict';

const ExpensesIndex = (() => {

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

    _loadMembers().then(() => {
      ExpensesFirebase.loadCategories(tripId).then(cats => {
        if (cats) ExpensesState.setCategories(tripId, cats);

        ExpensesFirebase.listen(
          tripId,
          arr => {
            ExpensesState.setExpenses(tripId, arr);
            if (typeof ExpensesRender !== 'undefined') ExpensesRender.refresh();
          },
          arr => {
            ExpensesState.setSettlements(tripId, arr);
            if (typeof ExpensesRender !== 'undefined') ExpensesRender.refresh();
          }
        );

        ExpensesRender.render(el, tripId);
      });
    });
  }

  function _loadMembers() {
    // Только участники ЭТОЙ поездки — раньше тут был весь список members
    // приложения (все зарегистрированные, а не те, кто реально в поездке),
    // из-за чего "Кто заплатил"/"Участвуют в расходе" были захламлены
    // посторонними людьми.
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    ExpensesState.setMembers(_tripId, trip?.participants || []);
    return Promise.resolve();
  }

  function close() {
    ExpensesFirebase.stopListening();
    if (typeof onNavigate === 'function') onNavigate('guide');
  }

  return { show, close };
})();

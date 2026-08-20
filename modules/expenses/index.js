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
    // Берём участников из Firebase (коллекция members)
    return firebase.firestore().collection('members').get()
      .then(snap => {
        const names = [];
        snap.forEach(doc => {
          const d = doc.data();
          if (d.displayName) names.push(d.displayName);
        });
        ExpensesState.setMembers(_tripId, names);
      })
      .catch(() => {
        // Fallback: берём из данных поездки
        const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
        const names = trip?.participants || [];
        ExpensesState.setMembers(_tripId, names);
      });
  }

  function close() {
    ExpensesFirebase.stopListening();
    if (typeof onNavigate === 'function') onNavigate('guide');
  }

  return { show, close };
})();

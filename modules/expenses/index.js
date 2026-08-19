'use strict';

const ExpensesIndex = (() => {

  let _el     = null;
  let _tripId = null;

  function show(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el || !tripId) return;

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
  }

  function close() {
    ExpensesFirebase.stopListening();
    if (typeof AppRouter !== 'undefined') {
      AppRouter.show('more');
    }
  }

  return { show, close };
})();

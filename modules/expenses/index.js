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

    // При быстром переключении поездок запоздавший ответ ДЛЯ ПРЕДЫДУЩЕЙ
    // поездки мог прилететь уже после того, как открыли следующую — и
    // тогда он тут перерисовывал экран и переподписывал ExpensesFirebase
    // обратно на старую поездку. Следующий добавленный расход рисковал
    // уйти не туда. Реальная гонка, найдена внешним ревью 2026-09-27—
    // проверяем на каждом шаге, что _tripId всё ещё та, с которой начали.
    _loadMembers().then(() => {
      if (_tripId !== tripId) return;
      ExpensesFirebase.loadCategories(tripId).then(cats => {
        if (_tripId !== tripId) return;
        if (cats) ExpensesState.setCategories(tripId, cats);

        ExpensesFirebase.listen(
          tripId,
          arr => {
            if (_tripId !== tripId) return;
            ExpensesState.setExpenses(tripId, arr);
            if (typeof ExpensesRender !== 'undefined') ExpensesRender.refresh();
          },
          arr => {
            if (_tripId !== tripId) return;
            ExpensesState.setSettlements(tripId, arr);
            if (typeof ExpensesRender !== 'undefined') ExpensesRender.refresh();
          }
        );

        // «Бюджет до поездки» — своя подписка, живёт пока открыт модуль
        // (отписывается там же, в close(), вместе с остальными).
        ExpensesFirebase.listenBudget(tripId, arr => {
          if (_tripId !== tripId) return;
          ExpensesState.setBudget(tripId, arr);
          if (typeof ExpensesRender !== 'undefined') ExpensesRender.refresh();
        });

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
    ExpensesState.setMembers(_tripId, TripsData.participantNames(trip));
    return Promise.resolve();
  }

  function close() {
    ExpensesFirebase.stopListening();
    if (typeof onNavigate === 'function') onNavigate('guide');
  }

  return { show, close };
})();

<!-- 1. В блок стилей (после shopping/styles.css) -->
<link rel="stylesheet" href="modules/expenses/styles.css">

<!-- 2. В #app (после #p-shopping) -->
<div id="p-expenses" class="page"></div>

<!-- 3. Скрипты (после shopping/index.js) -->
<script src="modules/expenses/data.js"></script>
<script src="modules/expenses/state.js"></script>
<script src="modules/expenses/firebase.js"></script>
<script src="modules/expenses/render.js"></script>
<script src="modules/expenses/index.js"></script>

<!-- 4. В onNavigate — в блок 'more', в список items поменять: -->
{ id:'expenses', label:'Расходы', icon:'ti-credit-card', ready:true },

<!-- И в обработчик кликов добавить: -->
else if (id === 'expenses') {
  AppRouter.show('expenses');
  ExpensesIndex.show(document.getElementById('p-expenses'), window.APP?.currentTripId);
}

<!-- 5. В app.css добавить (вместе с #p-guide и др.): -->
#p-expenses {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}

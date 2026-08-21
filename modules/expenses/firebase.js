'use strict';

const ExpensesFirebase = (() => {

  let _unsubExpenses    = null;
  let _unsubSettlements = null;

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  // ── Realtime listeners ───────────────────────────────────────

  function listen(tripId, onExpenses, onSettlements) {
    stopListening();

    _unsubExpenses = _ref(tripId).collection('expenses')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(ExpensesData.normalizeExpense(doc.data(), doc.id)));
        onExpenses(arr);
      }, err => console.warn('expenses listen:', err));

    _unsubSettlements = _ref(tripId).collection('settlements')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(ExpensesData.normalizeSettlement(doc.data(), doc.id)));
        onSettlements(arr);
      }, err => console.warn('settlements listen:', err));
  }

  function stopListening() {
    if (_unsubExpenses)    { _unsubExpenses();    _unsubExpenses    = null; }
    if (_unsubSettlements) { _unsubSettlements(); _unsubSettlements = null; }
  }

  // Разовое чтение без подписки — для обложки завершённой поездки, чтобы
  // не обрывать уже идущую (если есть) подписку страницы Расходы.
  function getOnce(tripId) {
    return Promise.all([
      _ref(tripId).collection('expenses').orderBy('createdAt', 'desc').get(),
      _ref(tripId).collection('settlements').orderBy('createdAt', 'desc').get()
    ]).then(([expSnap, settleSnap]) => {
      const expenses = [];
      expSnap.forEach(doc => expenses.push(ExpensesData.normalizeExpense(doc.data(), doc.id)));
      const settlements = [];
      settleSnap.forEach(doc => settlements.push(ExpensesData.normalizeSettlement(doc.data(), doc.id)));
      return { expenses, settlements };
    }).catch(e => { console.warn('expenses getOnce:', e); return { expenses: [], settlements: [] }; });
  }

  // ── Expenses ─────────────────────────────────────────────────

  function addExpense(tripId, entry) {
    const data = Object.assign({}, entry);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    data.createdBy = window.APP?.user?.uid || null;
    return _ref(tripId).collection('expenses').add(data)
      .then(ref => ref.id)
      .catch(e => console.warn('addExpense:', e));
  }

  function updateExpense(tripId, id, patch) {
    return _ref(tripId).collection('expenses').doc(id)
      .set(patch, { merge: true })
      .catch(e => console.warn('updateExpense:', e));
  }

  function deleteExpense(tripId, id) {
    return _ref(tripId).collection('expenses').doc(id)
      .delete()
      .catch(e => console.warn('deleteExpense:', e));
  }

  // ── Settlements ──────────────────────────────────────────────

  function addSettlement(tripId, entry) {
    const data = Object.assign({}, entry);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    return _ref(tripId).collection('settlements').add(data)
      .then(ref => ref.id)
      .catch(e => console.warn('addSettlement:', e));
  }

  function deleteSettlement(tripId, id) {
    return _ref(tripId).collection('settlements').doc(id)
      .delete()
      .catch(e => console.warn('deleteSettlement:', e));
  }

  // ── Categories (stored on trip doc) ─────────────────────────

  function saveCategories(tripId, categories) {
    return _ref(tripId).set({ expenseCategories: categories }, { merge: true })
      .catch(e => console.warn('saveCategories:', e));
  }

  function loadCategories(tripId) {
    return _ref(tripId).get()
      .then(doc => {
        const data = doc.data() || {};
        return Array.isArray(data.expenseCategories) ? data.expenseCategories : null;
      })
      .catch(e => { console.warn('loadCategories:', e); return null; });
  }

  return {
    listen, stopListening, getOnce,
    addExpense, updateExpense, deleteExpense,
    addSettlement, deleteSettlement,
    saveCategories, loadCategories,
  };
})();

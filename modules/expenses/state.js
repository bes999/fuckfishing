'use strict';

const ExpensesState = (() => {

  const _store = {};

  function _ensure(tripId) {
    if (!_store[tripId]) {
      _store[tripId] = {
        expenses:    [],
        settlements: [],
        categories:  ExpensesData.getDefaultCategories(),
        members:     [],
      };
    }
    return _store[tripId];
  }

  function setMembers(tripId, arr) {
    _ensure(tripId).members = arr;
  }

  function getMembers(tripId) {
    return _ensure(tripId).members;
  }

  function setExpenses(tripId, arr) {
    _ensure(tripId).expenses = arr.slice().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function setSettlements(tripId, arr) {
    _ensure(tripId).settlements = arr.slice().sort((a, b) =>
      (b.createdAt || '').localeCompare(a.createdAt || ''));
  }

  function setCategories(tripId, arr) {
    if (arr && arr.length) _ensure(tripId).categories = arr;
  }

  function getExpenses(tripId) {
    return _ensure(tripId).expenses;
  }

  function getSettlements(tripId) {
    return _ensure(tripId).settlements;
  }

  function getCategories(tripId) {
    return _ensure(tripId).categories;
  }

  function addExpense(tripId, entry) {
    _ensure(tripId).expenses.unshift(entry);
  }

  function updateExpense(tripId, id, patch) {
    const s = _ensure(tripId);
    const idx = s.expenses.findIndex(e => e._id === id);
    if (idx !== -1) s.expenses[idx] = Object.assign({}, s.expenses[idx], patch);
  }

  function removeExpense(tripId, id) {
    const s = _ensure(tripId);
    s.expenses = s.expenses.filter(e => e._id !== id);
  }

  function addSettlement(tripId, entry) {
    _ensure(tripId).settlements.unshift(entry);
  }

  function removeSettlement(tripId, id) {
    const s = _ensure(tripId);
    s.settlements = s.settlements.filter(e => e._id !== id);
  }

  function addCategory(tripId, title) {
    const s = _ensure(tripId);
    const id = 'cat_' + Date.now();
    s.categories.push({ id, title, icon: 'ti-tag', custom: true });
    return id;
  }

  function removeCategory(tripId, id) {
    const s = _ensure(tripId);
    s.categories = s.categories.filter(c => c.id !== id);
  }

  function computeSummary(tripId) {
    const s = _ensure(tripId);
    const expenses    = s.expenses;
    const settlements = s.settlements;

    let total = 0;
    const paidBy = {};
    const owedBy = {};

    const allNames = new Set();
    expenses.forEach(e => {
      if (e.paidBy) allNames.add(e.paidBy);
      (e.participants || []).forEach(n => allNames.add(n));
    });
    settlements.forEach(st => {
      if (st.fromName) allNames.add(st.fromName);
      if (st.toName)   allNames.add(st.toName);
    });

    allNames.forEach(n => { paidBy[n] = 0; owedBy[n] = 0; });

    expenses.forEach(e => {
      const amount = parseFloat(e.amount) || 0;
      total += amount;
      if (e.paidBy) paidBy[e.paidBy] = (paidBy[e.paidBy] || 0) + amount;
      const parts = e.participants && e.participants.length ? e.participants : [...allNames];
      const share = parts.length ? amount / parts.length : 0;
      parts.forEach(name => {
        owedBy[name] = (owedBy[name] || 0) + share;
      });
    });

    const settledOut = {};
    const settledIn  = {};
    settlements.forEach(st => {
      const a = parseFloat(st.amount) || 0;
      if (st.fromName) settledOut[st.fromName] = (settledOut[st.fromName] || 0) + a;
      if (st.toName)   settledIn[st.toName]    = (settledIn[st.toName]    || 0) + a;
    });

    const rows = [...allNames].sort((a, b) => a.localeCompare(b, 'ru')).map(name => {
      const diff    = (paidBy[name] || 0) - (owedBy[name] || 0);
      const netDiff = diff + (settledOut[name] || 0) - (settledIn[name] || 0);
      return { name, paid: paidBy[name] || 0, owed: owedBy[name] || 0, diff, netDiff };
    });

    const eps = 0.01;
    const creditors = rows.filter(r => r.netDiff >  eps).map(r => ({ name: r.name, amount: r.netDiff }));
    const debtors   = rows.filter(r => r.netDiff < -eps).map(r => ({ name: r.name, amount: Math.abs(r.netDiff) }));
    creditors.sort((a, b) => b.amount - a.amount);
    debtors.sort((a, b)   => b.amount - a.amount);

    const transfers = [];
    let ci = 0, di = 0;
    while (ci < creditors.length && di < debtors.length) {
      const c = creditors[ci], d = debtors[di];
      const pay = Math.min(c.amount, d.amount);
      if (pay > eps) {
        transfers.push({ from: d.name, to: c.name, amount: pay });
        c.amount -= pay;
        d.amount -= pay;
      }
      if (c.amount <= eps) ci++;
      if (d.amount <= eps) di++;
    }

    const byCat = {};
    expenses.forEach(e => {
      const cat = e.category || 'other';
      byCat[cat] = (byCat[cat] || 0) + (parseFloat(e.amount) || 0);
    });

    const avgShare = rows.length ? rows.reduce((sum, r) => sum + r.owed, 0) / rows.length : 0;

    return { total, avgShare, rows, transfers, byCat, count: expenses.length };
  }

  function exportCSV(tripId, tripName) {
    const s = _ensure(tripId);
    const cats = s.categories;
    const catTitle = id => (cats.find(c => c.id === id) || {}).title || id;

    const rows = [
      ['Тип', 'Дата', 'Описание', 'Сумма', 'Категория', 'Кто заплатил', 'Участники'],
    ];

    s.expenses.forEach(e => {
      rows.push([
        'Расход', e.date || '', e.desc || '',
        Math.round(e.amount), catTitle(e.category),
        e.paidBy || '', (e.participants || []).join(', '),
      ]);
    });

    s.settlements.forEach(e => {
      rows.push([
        'Погашение', e.date || '', e.note || '',
        Math.round(e.amount), '', e.fromName || '', e.toName || '',
      ]);
    });

    const csv = rows.map(r =>
      r.map(cell => '"' + String(cell).replace(/"/g, '""') + '"').join(',')
    ).join('\n');

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href     = url;
    a.download = 'expenses_' + (tripName || tripId).replace(/\s+/g, '_') + '.csv';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return {
    setExpenses, setSettlements, setCategories,
    getExpenses, getSettlements, getCategories,
    addExpense, updateExpense, removeExpense,
    addSettlement, removeSettlement,
    addCategory, removeCategory,
    computeSummary, exportCSV,
    setMembers, getMembers,
  };
})();

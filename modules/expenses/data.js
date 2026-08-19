'use strict';

const ExpensesData = (() => {

  const DEFAULT_CATEGORIES = [
    { id: 'fuel',      title: 'Топливо',    icon: 'ti-gas-station' },
    { id: 'food',      title: 'Еда',        icon: 'ti-basket' },
    { id: 'alcohol',   title: 'Алкоголь',   icon: 'ti-glass-full' },
    { id: 'transport', title: 'Транспорт',  icon: 'ti-car' },
    { id: 'housing',   title: 'Жильё',      icon: 'ti-home' },
    { id: 'gear',      title: 'Снаряга',    icon: 'ti-backpack' },
    { id: 'medicine',  title: 'Медицина',   icon: 'ti-first-aid-kit' },
    { id: 'licenses',  title: 'Лицензии',   icon: 'ti-id-badge' },
    { id: 'other',     title: 'Другое',     icon: 'ti-dots' },
  ];

  function getDefaultCategories() {
    return DEFAULT_CATEGORIES.map(function(c) { return Object.assign({}, c); });
  }

  function normalizeExpense(data, id) {
    return {
      _id: id,
      desc: data.desc || '',
      amount: parseFloat(data.amount) || 0,
      category: data.category || 'other',
      paidBy: data.paidBy || '',
      participants: Array.isArray(data.participants) ? data.participants : [],
      date: data.date || new Date().toISOString().split('T')[0],
      createdAt: data.createdAt || new Date().toISOString(),
    };
  }

  function normalizeSettlement(data, id) {
    return {
      _id: id,
      fromName: data.fromName || '',
      toName: data.toName || '',
      amount: parseFloat(data.amount) || 0,
      date: data.date || new Date().toISOString().split('T')[0],
      note: data.note || '',
      createdAt: data.createdAt || new Date().toISOString(),
    };
  }

  return { getDefaultCategories, normalizeExpense, normalizeSettlement };
})();

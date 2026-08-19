'use strict';

const MenuState = (() => {

  const KEY = 'ff_menu';
  let _data = {}; // { tripId: { days: [...] } }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _data = raw ? JSON.parse(raw) : {};
    } catch (_) { _data = {}; }
  }

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_data)); } catch (_) {}
  }

  // Получить дни для поездки
  function getDays(tripId) {
    return _data[tripId]?.days || null;
  }

  // Инициализировать дни из дат поездки
  function initDays(tripId, startDate, endDate) {
    if (_data[tripId]?.days?.length) return _data[tripId].days;
    const days = MenuData.generateDays(startDate, endDate);
    if (!_data[tripId]) _data[tripId] = {};
    _data[tripId].days = days;
    _save();
    return days;
  }

  // Обновить слот
  function updateSlot(tripId, dayId, mealId, slotId, item) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return;
    const slot = day.meals[mealId]?.slots?.find(s => s.id === slotId);
    if (!slot) return;
    slot.item = item;
    _save();
  }

  // Удалить слот
  function removeSlot(tripId, dayId, mealId, slotId) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return;
    const meal = day.meals[mealId];
    if (!meal) return;
    meal.slots = meal.slots.filter(s => s.id !== slotId);
    _save();
  }

  // Добавить слот
  function addSlot(tripId, dayId, mealId, slotType) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return null;
    const slot = {
      id:   `slot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: slotType,
      item: null
    };
    day.meals[mealId].slots.push(slot);
    _save();
    return slot;
  }

  // Заменить все данные из Firebase
  function setFromFirebase(tripId, days) {
    if (!_data[tripId]) _data[tripId] = {};
    _data[tripId].days = days;
    _save();
  }

  // Получить статус дня (пустой/частичный/заполненный)
  function getDayStatus(tripId, dayId) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return 'empty';
    let total = 0, filled = 0;
    Object.values(day.meals).forEach(meal => {
      meal.slots.forEach(slot => {
        total++;
        if (slot.item) filled++;
      });
    });
    if (filled === 0) return 'empty';
    if (filled === total) return 'done';
    return 'partial';
  }

  return { load, getDays, initDays, updateSlot, removeSlot, addSlot, setFromFirebase, getDayStatus };
})();

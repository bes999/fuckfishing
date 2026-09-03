'use strict';

const ShoppingState = (() => {

  const KEY = 'ff_shopping';
  let _data = {}; // { tripId: { categories: [...] } }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _data = raw ? JSON.parse(raw) : {};
    } catch (_) { _data = {}; }
  }

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_data)); } catch (_) {}
  }

  function getCategories(tripId) {
    if (!_data[tripId]) {
      _data[tripId] = { categories: ShoppingData.getDefaults() };
      _save();
    }
    return _data[tripId].categories;
  }

  // boughtMap — новое отдельное поле из Firestore (см. ShoppingFirebase.
  // saveBought), источник истины для "куплено"; накатываем поверх того,
  // что лежит в самих items (там bought могло устареть — раньше это было
  // единственное место, где хранился статус). Без boughtMap (старый
  // документ, ещё никто не отмечал после обновления) просто оставляем
  // то, что уже в categories.
  function setFromFirebase(tripId, categories, boughtMap) {
    if (!_data[tripId]) _data[tripId] = {};
    if (boughtMap) {
      categories.forEach(cat => {
        cat.items.forEach(item => {
          if (Object.prototype.hasOwnProperty.call(boughtMap, item.id)) {
            item.bought = !!boughtMap[item.id];
          }
        });
      });
    }
    _data[tripId].categories = categories;
    _save();
  }

  // Возвращает новое значение bought (или null, если позиция не найдена) —
  // вызывающий код (render.js) шлёт в Firestore ТОЛЬКО этот один флаг
  // через saveBought, а не весь список.
  function toggleBought(tripId, catId, itemId) {
    const cat = getCategories(tripId).find(c => c.id === catId);
    if (!cat) return null;
    const item = cat.items.find(i => i.id === itemId);
    if (!item) return null;
    item.bought = !item.bought;
    _save();
    return item.bought;
  }

  function updateQty(tripId, catId, itemId, qty) {
    const cat = getCategories(tripId).find(c => c.id === catId);
    if (!cat) return;
    const item = cat.items.find(i => i.id === itemId);
    if (!item) return;
    item.qty = qty;
    _save();
  }

  function addItem(tripId, catId, name, qty) {
    const cat = getCategories(tripId).find(c => c.id === catId);
    if (!cat) return null;
    const item = {
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name, qty: qty || '', bought: false
    };
    cat.items.push(item);
    _save();
    return item;
  }

  function removeItem(tripId, catId, itemId) {
    const cat = getCategories(tripId).find(c => c.id === catId);
    if (!cat) return;
    cat.items = cat.items.filter(i => i.id !== itemId);
    _save();
  }

  function addCategory(tripId, title) {
    const cats = getCategories(tripId);
    const cat = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title, icon: 'ti-list', items: []
    };
    cats.push(cat);
    _save();
    return cat;
  }

  function getStats(tripId) {
    const cats = getCategories(tripId);
    let total = 0, bought = 0;
    cats.forEach(c => c.items.forEach(i => { total++; if (i.bought) bought++; }));
    return { total, bought, pct: total ? Math.round(bought / total * 100) : 0 };
  }

  return { load, getCategories, setFromFirebase, toggleBought, updateQty, addItem, removeItem, addCategory, getStats };
})();

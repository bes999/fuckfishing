'use strict';

// Закупка — один документ на поездку (`shopping/{tripId}`).
// { categories: [{ id, title, icon, items: [{ id, name, qty, bought }] }] }

import { db } from './firestore.js';

// Скопировано 1-в-1 (id/title/icon) из modules/shopping/data.js веб-приложения.
export const DEFAULT_CATEGORIES = [
  { id: 'vegetables', title: 'Овощи и фрукты', icon: 'ti-leaf' },
  { id: 'meat', title: 'Мясо и консервы', icon: 'ti-meat' },
  { id: 'dairy', title: 'Молочное и яйца', icon: 'ti-egg' },
  { id: 'grains', title: 'Крупы и паста', icon: 'ti-grain' },
  { id: 'sauces', title: 'Соусы и специи', icon: 'ti-bottle' },
  { id: 'snacks', title: 'Перекусы и сладкое', icon: 'ti-cookie' },
  { id: 'drinks', title: 'Напитки', icon: 'ti-droplet' },
  { id: 'bar', title: 'Бар', icon: 'ti-glass-full' },
  { id: 'market', title: 'Маркетплейсы', icon: 'ti-package' },
];

function ref(tripId) {
  return db.collection('shopping').doc(tripId);
}

/** Категории закупки поездки; создаёт документ с дефолтными категориями (пустые items), если его ещё нет. */
export async function getCategories(tripId) {
  const doc = await ref(tripId).get();
  if (doc.exists && Array.isArray(doc.data().categories)) {
    return doc.data().categories;
  }
  const categories = DEFAULT_CATEGORIES.map((c) => ({ ...c, items: [] }));
  await ref(tripId).set({ categories }, { merge: true });
  return categories;
}

export async function saveCategories(tripId, categories) {
  await ref(tripId).set({ categories }, { merge: true });
}

export function genItemId() {
  return `item_${Date.now()}_${Math.random().toString(36).slice(2)}`;
}

/** Добавляет пункт в категорию, возвращает обновлённый список категорий. */
export async function addItem(tripId, catId, name, qty) {
  const res = await addItems(tripId, catId, [{ name, qty }]);
  return res ? res.categories : null;
}

/** Добавляет несколько пунктов в категорию за одну запись. items: [{name, qty}]. */
export async function addItems(tripId, catId, items) {
  const categories = await getCategories(tripId);
  const cat = categories.find((c) => c.id === catId);
  if (!cat) return null;
  if (!Array.isArray(cat.items)) cat.items = [];
  const added = items.map((it) => {
    const item = { id: genItemId(), name: it.name, qty: it.qty || '', bought: false };
    cat.items.push(item);
    return item;
  });
  await saveCategories(tripId, categories);
  return { categories, added };
}

/** Переключает bought по индексам категории/пункта, возвращает обновлённый список категорий. */
export async function toggleBoughtByIndex(tripId, catIdx, itemIdx) {
  const categories = await getCategories(tripId);
  const cat = categories[catIdx];
  if (!cat || !Array.isArray(cat.items)) return null;
  const item = cat.items[itemIdx];
  if (!item) return null;
  item.bought = !item.bought;
  await saveCategories(tripId, categories);
  return categories;
}

export function getStats(categories) {
  let total = 0;
  let bought = 0;
  (categories || []).forEach((c) => (c.items || []).forEach((i) => {
    total += 1;
    if (i.bought) bought += 1;
  }));
  return { total, bought };
}

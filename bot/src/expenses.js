'use strict';

// Расходы (`trips/{tripId}/expenses/{autoId}`).

import { db } from './firestore.js';
import { todayStr } from './dates.js';

export const DEFAULT_CATEGORIES = [
  { id: 'fuel', title: 'Топливо' },
  { id: 'food', title: 'Еда' },
  { id: 'alcohol', title: 'Алкоголь' },
  { id: 'transport', title: 'Транспорт' },
  { id: 'parking', title: 'Парковка' },
  { id: 'slip', title: 'Слип' },
  { id: 'housing', title: 'Жильё' },
  { id: 'gear', title: 'Снаряга' },
  { id: 'medicine', title: 'Медицина' },
  { id: 'licenses', title: 'Лицензии' },
  { id: 'other', title: 'Другое' },
];

/** Дефолтные категории расходов + кастомные из trip.expenseCategories (если есть, добавляются). */
export async function getCategories(tripId) {
  const doc = await db.collection('trips').doc(tripId).get();
  const data = doc.exists ? doc.data() : {};
  const custom = Array.isArray(data.expenseCategories) ? data.expenseCategories : [];
  const seen = new Set(DEFAULT_CATEGORIES.map((c) => c.id));
  const extra = custom.filter((c) => c && c.id && !seen.has(c.id));
  return [...DEFAULT_CATEGORIES, ...extra];
}

export function categoryLabel(categories, id) {
  const found = (categories || []).find((c) => c.id === id);
  return found ? found.title : id;
}

export async function addExpense(tripId, { desc, amount, category, paidBy, participants, uid }) {
  const data = {
    desc,
    amount,
    category,
    paidBy,
    participants: Array.isArray(participants) ? participants : [],
    date: todayStr(),
    createdAt: new Date().toISOString(),
    createdBy: uid,
  };
  const ref = await db.collection('trips').doc(tripId).collection('expenses').add(data);
  return { id: ref.id, ...data };
}

/** Меняет категорию существующего расхода; возвращает обновлённый документ либо null. */
export async function updateCategory(tripId, expenseId, category) {
  const ref = db.collection('trips').doc(tripId).collection('expenses').doc(expenseId);
  const doc = await ref.get();
  if (!doc.exists) return null;
  await ref.update({ category });
  return { id: doc.id, ...doc.data(), category };
}

export async function listRecent(tripId, limit = 5) {
  const snap = await db.collection('trips').doc(tripId).collection('expenses')
    .orderBy('createdAt', 'desc')
    .limit(limit)
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() }));
}

export async function totalSum(tripId) {
  const snap = await db.collection('trips').doc(tripId).collection('expenses').get();
  let sum = 0;
  snap.forEach((d) => { sum += Number(d.data().amount) || 0; });
  return sum;
}

/**
 * Разбирает строку вида "1500 бензин" на сумму и описание.
 * Возвращает { amount, desc } либо null, если число не найдено.
 */
export function parseAmountDesc(text) {
  const t = String(text || '').trim();
  const m = t.match(/^(\d+(?:[.,]\d+)?)\s*(.*)$/s);
  if (!m) return null;
  const amount = parseFloat(m[1].replace(',', '.'));
  if (!Number.isFinite(amount) || amount <= 0) return null;
  const desc = (m[2] || '').trim();
  return { amount, desc };
}

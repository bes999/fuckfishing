'use strict';

// Поездки (`trips/{tripId}`) и активная поездка чата (`tg_sessions/{chatId}`).

import { db } from './firestore.js';
import { todayStr, computeStatus, TZ } from './dates.js';

/** Сессия чата: { uid, activeTripId, updatedAt } либо null. */
export async function getSession(chatId) {
  const doc = await db.collection('tg_sessions').doc(String(chatId)).get();
  return doc.exists ? doc.data() : null;
}

export async function setActiveTrip(chatId, uid, tripId) {
  await db.collection('tg_sessions').doc(String(chatId)).set({
    uid,
    activeTripId: tripId,
    updatedAt: new Date().toISOString(),
  }, { merge: true });
}

/** Активная поездка чата (полный документ) либо null. */
export async function getActiveTrip(chatId) {
  const session = await getSession(chatId);
  if (!session || !session.activeTripId) return null;
  return getTrip(session.activeTripId);
}

export async function getTrip(tripId) {
  const doc = await db.collection('trips').doc(tripId).get();
  return doc.exists ? { id: doc.id, ...doc.data() } : null;
}

/** Поездки, где uid реально в участниках — не все подряд, новые сверху. */
export async function listTrips(uid) {
  const snap = await db.collection('trips').orderBy('startDate', 'desc').get();
  return snap.docs
    .map((d) => ({ id: d.id, ...d.data() }))
    .filter((t) => (t.memberIds || []).includes(uid));
}

export async function createTrip({ type, name, startDate, endDate, uid, displayName }) {
  const id = `trip_${Date.now()}`;
  const status = computeStatus(startDate, endDate);
  const data = {
    type,
    name,
    startDate,
    endDate,
    rivers: [],
    participants: [displayName],
    memberIds: [uid],
    comment: '',
    status,
    rating: null,
    fish: [],
    conditions: {},
    readiness: type === 'expedition'
      ? { gear: false, menu: false, shopping: false, medkit: false, tickets: false, route: false }
      : null,
    importDataJson: null,
    guideTabs: [],
    ownerId: uid,
    createdAt: todayStr(),
  };
  await db.collection('trips').doc(id).set(data, { merge: true });
  return { id, ...data };
}

export function statusLabel(status) {
  return { upcoming: '⏳ Скоро', active: '🟢 Идёт', done: '✓ Завершена' }[status] || status || '';
}

export function typeLabel(type) {
  return type === 'expedition' ? 'Экспедиция' : 'Рыбалка';
}

export { TZ };

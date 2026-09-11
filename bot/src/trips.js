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

// Подстраховка от старого формата participants (массив строк-имён, до
// перехода на {name, uid}) — см. тот же комментарий в modules/trips/
// firebase.js на веб-стороне. Продовые документы уже мигрированы вручную,
// но бот читает Firestore напрямую, в обход веб-кода, так что нормализацию
// нужно повторить и здесь.
function _normalizeTrip(trip) {
  if (trip && Array.isArray(trip.participants)) {
    trip.participants = trip.participants.map((p) =>
      (p && typeof p === 'object') ? p : { name: String(p), uid: null }
    );
  }
  return trip;
}

/** Имена участников как плоский массив строк — см. TripsData.participantNames
 *  на веб-стороне (modules/trips/data.js), тот же аксессор здесь. */
export function participantNames(trip) {
  return (trip?.participants || []).map((p) => p.name);
}

export async function getTrip(tripId) {
  const doc = await db.collection('trips').doc(tripId).get();
  return doc.exists ? _normalizeTrip({ id: doc.id, ...doc.data() }) : null;
}

/** Поездки, где uid реально в участниках — не все подряд, новые сверху. */
export async function listTrips(uid) {
  const snap = await db.collection('trips').orderBy('startDate', 'desc').get();
  return snap.docs
    .map((d) => _normalizeTrip({ id: d.id, ...d.data() }))
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
    participants: [{ name: displayName, uid }],
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

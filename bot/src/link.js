'use strict';

// Привязка Telegram-аккаунта к участнику (документ в коллекции `members`).

import { db } from './firestore.js';

const CACHE_TTL_MS = 5 * 60 * 1000;
const LINK_CODE_TTL_MS = 15 * 60 * 1000;

const cache = new Map(); // chatId(string) -> { uid, displayName, expiresAt }

function k(chatId) {
  return String(chatId);
}

/** Сбрасывает кэш привязки для чата (после link/unlink). */
export function invalidate(chatId) {
  cache.delete(k(chatId));
}

/** Ищет участника, привязанного к данному chatId. Кэширует на 5 минут. */
export async function findUserByChatId(chatId) {
  const key = k(chatId);
  const cached = cache.get(key);
  if (cached && cached.expiresAt > Date.now()) {
    return { uid: cached.uid, displayName: cached.displayName };
  }

  const snap = await db.collection('members').where('telegramId', '==', key).limit(1).get();
  if (snap.empty) {
    cache.delete(key);
    return null;
  }
  const doc = snap.docs[0];
  const data = doc.data() || {};
  const user = { uid: doc.id, displayName: data.displayName || 'Рыбак' };
  cache.set(key, { ...user, expiresAt: Date.now() + CACHE_TTL_MS });
  return user;
}

/**
 * Привязывает участника по 6-значному коду.
 * Возвращает { ok: true, uid, displayName } либо { ok: false, reason }.
 *
 * Код теперь id отдельного документа в telegram_link_codes (не поле в
 * members/{uid} — тот читают все участники приложения, см. разбор дыры в
 * firestore.rules), поэтому это прямой просмотр по id, а не query.
 */
export async function linkByCode(code, chatId, username) {
  const codeRef = db.collection('telegram_link_codes').doc(code);
  const codeSnap = await codeRef.get();
  if (!codeSnap.exists) {
    return { ok: false, reason: 'not_found' };
  }
  const codeData = codeSnap.data() || {};
  const atMs = codeData.createdAt ? new Date(codeData.createdAt).getTime() : NaN;
  if (!atMs || Date.now() - atMs > LINK_CODE_TTL_MS) {
    await codeRef.delete().catch(() => {});
    return { ok: false, reason: 'expired' };
  }
  if (!codeData.uid) {
    return { ok: false, reason: 'not_found' };
  }

  const memberRef = db.collection('members').doc(codeData.uid);
  const memberSnap = await memberRef.get();
  if (!memberSnap.exists) {
    await codeRef.delete().catch(() => {});
    return { ok: false, reason: 'not_found' };
  }
  const memberData = memberSnap.data() || {};

  await memberRef.set({
    telegramId: k(chatId),
    telegramUsername: username || null,
  }, { merge: true });
  await codeRef.delete();

  invalidate(chatId);
  return { ok: true, uid: memberRef.id, displayName: memberData.displayName || 'Рыбак' };
}

/** Отвязывает Telegram от участника, привязанного к этому chatId. */
export async function unlink(chatId) {
  const user = await findUserByChatId(chatId);
  if (!user) return false;

  await db.collection('members').doc(user.uid).set({
    telegramId: null,
    telegramUsername: null,
  }, { merge: true });

  invalidate(chatId);
  return true;
}

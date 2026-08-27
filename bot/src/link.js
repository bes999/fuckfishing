'use strict';

// Привязка Telegram-аккаунта к участнику (документ в коллекции `members`).

import { db, FieldValue } from './firestore.js';

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
 */
export async function linkByCode(code, chatId, username) {
  const snap = await db.collection('members').where('telegramLinkCode', '==', code).limit(1).get();
  if (snap.empty) {
    return { ok: false, reason: 'not_found' };
  }
  const doc = snap.docs[0];
  const data = doc.data() || {};
  const atMs = data.telegramLinkCodeAt ? new Date(data.telegramLinkCodeAt).getTime() : NaN;
  if (!atMs || Date.now() - atMs > LINK_CODE_TTL_MS) {
    return { ok: false, reason: 'expired' };
  }

  await doc.ref.set({
    telegramId: k(chatId),
    telegramUsername: username || null,
    telegramLinkCode: FieldValue.delete(),
    telegramLinkCodeAt: null,
  }, { merge: true });

  invalidate(chatId);
  return { ok: true, uid: doc.id, displayName: data.displayName || 'Рыбак' };
}

/** Отвязывает Telegram от участника, привязанного к этому chatId. */
export async function unlink(chatId) {
  const user = await findUserByChatId(chatId);
  if (!user) return false;

  await db.collection('members').doc(user.uid).set({
    telegramId: null,
    telegramUsername: null,
    telegramLinkCode: null,
    telegramLinkCodeAt: null,
  }, { merge: true });

  invalidate(chatId);
  return true;
}

'use strict';

// Инфраструктура пошаговых диалогов (визардов). Состояние — in-memory Map
// по chatId с TTL 15 минут (бот работает в одном инстансе, этого достаточно).

const TTL_MS = 15 * 60 * 1000;
const store = new Map(); // chatId(string) -> { type, step, data, expiresAt }

function key(chatId) {
  return String(chatId);
}

/** Начинает новый визард, затирая предыдущий (если был). */
export function start(chatId, type, step, data = {}) {
  const w = { type, step, data, expiresAt: Date.now() + TTL_MS };
  store.set(key(chatId), w);
  return w;
}

/** Возвращает активный визард или null, если его нет/истёк. */
export function get(chatId) {
  const k = key(chatId);
  const w = store.get(k);
  if (!w) return null;
  if (Date.now() > w.expiresAt) {
    store.delete(k);
    return null;
  }
  return w;
}

/** Обновляет step/data активного визарда и продлевает TTL. */
export function update(chatId, patch = {}) {
  const w = get(chatId);
  if (!w) return null;
  if (patch.step !== undefined) w.step = patch.step;
  if (patch.data !== undefined) Object.assign(w.data, patch.data);
  w.expiresAt = Date.now() + TTL_MS;
  store.set(key(chatId), w);
  return w;
}

export function cancel(chatId) {
  store.delete(key(chatId));
}

// Периодическая чистка протухших визардов.
const cleanupTimer = setInterval(() => {
  const now = Date.now();
  for (const [k, w] of store) {
    if (now > w.expiresAt) store.delete(k);
  }
}, 60 * 1000);
cleanupTimer.unref?.();

'use strict';

// Работа с датами в таймзоне TZ_DEFAULT (Europe/Moscow по умолчанию).
// Формат дат в схеме Firestore — строка 'YYYY-MM-DD'.

const TZ = process.env.TZ_DEFAULT || 'Europe/Moscow';

/** Сегодняшняя дата в заданной таймзоне, формат YYYY-MM-DD. */
export function todayStr(tz = TZ) {
  const fmt = new Intl.DateTimeFormat('en-CA', {
    timeZone: tz,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  });
  // en-CA формат уже даёт YYYY-MM-DD
  return fmt.format(new Date());
}

/**
 * Парсит дату из текста в формате 'ДД.ММ.ГГГГ' или 'YYYY-MM-DD'.
 * Возвращает 'YYYY-MM-DD' или null, если не удалось распознать/дата невалидна.
 */
export function parseDateFlexible(text) {
  const t = String(text || '').trim();
  let y, mo, d;

  let m = t.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (m) {
    y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]);
  } else {
    m = t.match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
    if (m) {
      d = Number(m[1]); mo = Number(m[2]); y = Number(m[3]);
    }
  }
  if (!y || !mo || !d) return null;

  const dt = new Date(Date.UTC(y, mo - 1, d));
  if (dt.getUTCFullYear() !== y || dt.getUTCMonth() !== mo - 1 || dt.getUTCDate() !== d) {
    return null; // невалидная дата, например 31.02.2026
  }
  return `${y}-${String(mo).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

/** Статус поездки относительно сегодняшней даты. */
export function computeStatus(startDate, endDate, tz = TZ) {
  const today = todayStr(tz);
  if (endDate && today > endDate) return 'done';
  if (startDate && today < startDate) return 'upcoming';
  return 'active';
}

export { TZ };

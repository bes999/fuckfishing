'use strict';

// Общие UI-хелперы: экранирование, форматирование, главное меню.

import { Keyboard } from 'grammy';

export function escapeHtml(str) {
  return String(str ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

export function formatMoney(n) {
  const num = Number(n) || 0;
  return num.toLocaleString('ru-RU', { maximumFractionDigits: 2 }) + ' ₽';
}

export function formatDateRu(isoDate) {
  const m = String(isoDate || '').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return isoDate || '';
  return `${m[3]}.${m[2]}.${m[1]}`;
}

export const MAIN_MENU = new Keyboard()
  .text('🎣 Поездки').text('➕ Расход').row()
  .text('🐟 Улов').text('🛒 Закупка')
  .resized();

export const MENU_LABELS = new Set(['🎣 Поездки', '➕ Расход', '🐟 Улов', '🛒 Закупка']);

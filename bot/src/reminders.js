'use strict';

// Напоминалки по расписанию — за N дней до поездки и в день старта.
// Работает через периодический опрос коллекции trips (см. index.js), а не
// через onSnapshot: напоминания не мгновенные по своей природе (раз в день
// достаточно), а поллинг проще пережить перезапуск бота без потери
// подписки. Идемпотентность — через флаги trip.remindersSent, чтобы
// перезапуск/повторный тик не заспамил тем же напоминанием дважды.

import { db } from './firestore.js';
import { formatDateRu } from './ui.js';

const DAYS_BEFORE = 3;

function daysUntil(dateStr) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const target = new Date(dateStr);
  target.setHours(0, 0, 0, 0);
  return Math.round((target - today) / 86400000);
}

async function getTelegramIds(memberIds) {
  if (!memberIds || !memberIds.length) return [];
  const docs = await Promise.all(memberIds.map((uid) => db.collection('members').doc(uid).get()));
  return docs.filter((d) => d.exists && d.data().telegramId).map((d) => d.data().telegramId);
}

async function sendToTrip(bot, trip, text) {
  const ids = await getTelegramIds(trip.memberIds);
  for (const chatId of ids) {
    try {
      await bot.api.sendMessage(chatId, text);
    } catch (err) {
      console.error(`reminders: не удалось отправить chatId=${chatId}:`, err.message);
    }
  }
}

export async function checkReminders(bot) {
  let snap;
  try {
    snap = await db.collection('trips').get();
  } catch (err) {
    console.error('reminders: не удалось прочитать trips:', err.message);
    return;
  }

  for (const doc of snap.docs) {
    const trip = doc.data();
    if (!trip.startDate) continue;

    const d = daysUntil(trip.startDate);
    const sent = trip.remindersSent || {};

    if (d === DAYS_BEFORE && !sent.beforeTrip) {
      await sendToTrip(
        bot,
        trip,
        `⏳ Через ${DAYS_BEFORE} дня старт поездки «${trip.name}» (${formatDateRu(trip.startDate)}).\nПроверь снарягу, меню и аптечку!`
      );
      await doc.ref.set({ remindersSent: { ...sent, beforeTrip: true } }, { merge: true });
    }

    if (d === 0 && !sent.dayOf) {
      await sendToTrip(bot, trip, `🚀 Сегодня старт — «${trip.name}»! Удачной поездки.`);
      await doc.ref.set({ remindersSent: { ...sent, dayOf: true } }, { merge: true });
    }
  }
}

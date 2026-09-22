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

// ── Дежурства по Меню (повар/уборка) ─────────────────────────────
// Отдельный от checkReminders поллинг (тот же часовой тик, см. index.js) —
// там "за N дней"/"в день старта" на весь остаток жизни поездки, тут "кто
// сегодня дежурит" каждый день заезда заново, поэтому свой флаг-мапа по
// датам (trip.dutyRemindersSent.<YYYY-MM-DD>), а не trip.remindersSent.
//
// Дежурство в modules/menu хранится именем участника (day.meals[mealId].cook
// /.cleanup — строка, как paidBy в Расходах), не uid — резолвим через
// trip.participants (см. project_participants_schema_migration). Участник
// без привязанного Telegram (гость без аккаунта, вручную вписанное имя,
// опечатка) просто тихо пропускается — слать некуда.

const MEAL_LABELS = { breakfast: 'Завтрак', snack: 'Перекус', lunch: 'Обед', dinner: 'Ужин' };

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().slice(0, 10);
}

async function getTelegramIdByUid(uid) {
  if (!uid) return null;
  try {
    const doc = await db.collection('members').doc(uid).get();
    return doc.exists ? doc.data().telegramId || null : null;
  } catch (err) {
    console.error(`dutyReminders: не удалось прочитать members/${uid}:`, err.message);
    return null;
  }
}

export async function checkDutyReminders(bot) {
  const today = todayStr();
  const dayId = `day_${today}`;

  let snap;
  try {
    snap = await db.collection('trips').get();
  } catch (err) {
    console.error('dutyReminders: не удалось прочитать trips:', err.message);
    return;
  }

  for (const doc of snap.docs) {
    const trip = doc.data();
    const endDate = trip.endDate || trip.startDate;
    if (!trip.startDate || !endDate) continue;
    if (today < trip.startDate || today > endDate) continue;

    const dutySent = trip.dutyRemindersSent || {};
    if (dutySent[today]) continue;

    let menuSnap;
    try {
      menuSnap = await db.collection('menu').doc(doc.id).get();
    } catch (err) {
      console.error(`dutyReminders: не удалось прочитать menu/${doc.id}:`, err.message);
      continue;
    }
    const mealDuty = menuSnap.exists ? (menuSnap.data().mealDuty || {}) : {};

    // Имя участника -> список строк "Приём пищи — роль" на сегодня.
    const byPerson = {};
    for (const mealId of Object.keys(MEAL_LABELS)) {
      const duty = mealDuty[`${dayId}_${mealId}`];
      if (!duty) continue;
      if (duty.cook) {
        (byPerson[duty.cook] = byPerson[duty.cook] || []).push(`${MEAL_LABELS[mealId]} — повар 🍳`);
      }
      if (duty.cleanup) {
        (byPerson[duty.cleanup] = byPerson[duty.cleanup] || []).push(`${MEAL_LABELS[mealId]} — уборка 🧽`);
      }
    }

    const names = Object.keys(byPerson);
    if (names.length) {
      const participants = trip.participants || [];
      for (const name of names) {
        const p = participants.find((pp) => pp.name.toLowerCase() === name.toLowerCase());
        const chatId = p ? await getTelegramIdByUid(p.uid) : null;
        if (!chatId) continue;
        const text = `📋 Сегодня твоё дежурство в «${trip.name}»:\n${byPerson[name].join('\n')}`;
        try {
          await bot.api.sendMessage(chatId, text);
        } catch (err) {
          console.error(`dutyReminders: не удалось отправить chatId=${chatId}:`, err.message);
        }
      }
    }

    // Флаг ставим и когда дежурств на сегодня нет — иначе на каждый следующий
    // часовой тик снова читаем menu/{tripId} впустую до конца дня.
    await doc.ref.set({ dutyRemindersSent: { ...dutySent, [today]: true } }, { merge: true });
  }
}

// ── Cook Mode "Готово" → мгновенный (в пределах опроса) пинг уборке ──────
// Отдельная, более частая проверка от checkDutyReminders выше (тот раз в
// час, тут DONE_PING_CHECK_MS в index.js) — "повар закончил готовить"
// человеку с ролью "уборка" нужно узнать сейчас, а не через час. Очередь —
// menu/{tripId}.cookDonePings.<dayId>_<mealId> (см. modules/menu/firebase.js
// saveCookDone), с флагом sent — идемпотентность тем же принципом, что и
// dutyRemindersSent выше: опрос может застать запись уже отправленной.
export async function checkCookDonePings(bot) {
  const today = todayStr();

  let tripsSnap;
  try {
    tripsSnap = await db.collection('trips').get();
  } catch (err) {
    console.error('cookDonePings: не удалось прочитать trips:', err.message);
    return;
  }

  for (const doc of tripsSnap.docs) {
    const trip = doc.data();
    const endDate = trip.endDate || trip.startDate;
    if (!trip.startDate || !endDate) continue;
    if (today < trip.startDate || today > endDate) continue; // только активные сейчас поездки — не гонять всю базу menu впустую

    let menuSnap;
    try {
      menuSnap = await db.collection('menu').doc(doc.id).get();
    } catch (err) {
      console.error(`cookDonePings: не удалось прочитать menu/${doc.id}:`, err.message);
      continue;
    }
    if (!menuSnap.exists) continue;

    const pings = menuSnap.data().cookDonePings || {};
    const pending = Object.entries(pings).filter(([, p]) => p && !p.sent);
    if (!pending.length) continue;

    const participants = trip.participants || [];
    const updates = {};
    for (const [key, ping] of pending) {
      updates[key] = { ...ping, sent: true };
      if (!ping.cleanup) continue; // уборка не назначена — слать некому

      const p = participants.find((pp) => pp.name.toLowerCase() === ping.cleanup.toLowerCase());
      const chatId = p ? await getTelegramIdByUid(p.uid) : null;
      if (!chatId) continue;

      const mealLabel = MEAL_LABELS[ping.mealId] || 'Приём пищи';
      const cookPart = ping.cook ? `${ping.cook} закончил(а) готовить` : 'Готовка закончена';
      const text = `🍽 ${cookPart} — ${mealLabel} в «${trip.name}».\nТвоя очередь: уборка 🧽`;
      try {
        await bot.api.sendMessage(chatId, text);
      } catch (err) {
        console.error(`cookDonePings: не удалось отправить chatId=${chatId}:`, err.message);
      }
    }

    try {
      await db.collection('menu').doc(doc.id).set({ cookDonePings: updates }, { merge: true });
    } catch (err) {
      console.error(`cookDonePings: не удалось обновить menu/${doc.id}:`, err.message);
    }
  }
}

// ── "Поездка удалена" → пуш остальным участникам ─────────────────────────
// Очередь в trip_deletions (см. modules/trips/data.js deleteTrip) — сама
// поездка к этому моменту уже удалена, так что писать флаг некуда, кроме
// отдельной коллекции; sent на самой записи очереди — та же идемпотентность,
// что у cookDonePings выше.
export async function checkTripDeletions(bot) {
  let snap;
  try {
    snap = await db.collection('trip_deletions').where('sent', '==', false).get();
  } catch (err) {
    console.error('tripDeletions: не удалось прочитать trip_deletions:', err.message);
    return;
  }

  for (const doc of snap.docs) {
    const { tripName, deletedByName, memberIds } = doc.data();
    const ids = await getTelegramIds(memberIds);
    const text = `🗑 ${deletedByName || 'Участник'} удалил(а) поездку «${tripName || 'без названия'}»`;
    for (const chatId of ids) {
      try {
        await bot.api.sendMessage(chatId, text);
      } catch (err) {
        console.error(`tripDeletions: не удалось отправить chatId=${chatId}:`, err.message);
      }
    }
    try {
      await doc.ref.update({ sent: true });
    } catch (err) {
      console.error(`tripDeletions: не удалось обновить ${doc.id}:`, err.message);
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

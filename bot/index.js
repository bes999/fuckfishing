'use strict';

// Точка входа Telegram-бота FuckFishing Planner.
// Long-polling (grammy), привязка аккаунта по 6-значному коду, главное меню
// и визарды для поездок/расходов/улова/закупки. Все side-effect-импорты
// локальных модулей (в т.ч. инициализация firebase-admin в src/firestore.js)
// намеренно отложены до проверки BOT_TOKEN — чтобы при пустом .env падать
// с понятной ошибкой, а не с шумом от Firebase/grammy.

import 'dotenv/config';

if (!process.env.BOT_TOKEN) {
  console.error('❌ BOT_TOKEN не задан. Скопируйте bot/.env.example в bot/.env и укажите токен от @BotFather.');
  process.exit(1);
}

const { Bot, InlineKeyboard } = await import('grammy');
const Link = await import('./src/link.js');
const Wizards = await import('./src/wizards.js');
const Trips = await import('./src/trips.js');
const Expenses = await import('./src/expenses.js');
const Catches = await import('./src/catches.js');
const Shopping = await import('./src/shopping.js');
const { parseDateFlexible } = await import('./src/dates.js');
const { escapeHtml, formatMoney, formatDateRu, MAIN_MENU, MENU_LABELS } = await import('./src/ui.js');
const AI = await import('./src/ai.js');

const WEB_URL = process.env.WEB_URL || 'https://plan.fuckfishing.ru';

const bot = new Bot(process.env.BOT_TOKEN);

// ── Общие хелперы ───────────────────────────────────────────────

function linkInstructions() {
  return (
    `Чтобы пользоваться ботом, привяжите аккаунт:\n\n` +
    `1. Откройте ${WEB_URL}\n` +
    `2. Профиль → «✈️ Telegram-бот»\n` +
    `3. Получите 6-значный код и пришлите его сюда.`
  );
}

async function requireUser(ctx) {
  const user = await Link.findUserByChatId(ctx.chat.id);
  if (!user) {
    await ctx.reply(linkInstructions());
    return null;
  }
  return user;
}

function formatTripCard(trip, { recentExpenses = [], total = 0 } = {}) {
  const dates =
    trip.startDate === trip.endDate
      ? formatDateRu(trip.startDate)
      : `${formatDateRu(trip.startDate)} – ${formatDateRu(trip.endDate)}`;
  const participants = (trip.participants || []).join(', ') || '—';

  let text =
    `<b>${escapeHtml(trip.name)}</b>\n` +
    `${Trips.typeLabel(trip.type)} · ${Trips.statusLabel(trip.status)}\n` +
    `📅 ${dates}\n` +
    `👥 ${escapeHtml(participants)}`;

  if (recentExpenses.length) {
    const lines = recentExpenses.map((e) => `• ${escapeHtml(e.desc || '—')} — ${Math.round(e.amount) || 0} ₽`);
    text += `\n\n💸 Последние расходы (итого ${Math.round(total)} ₽):\n${lines.join('\n')}`;
  } else {
    text += `\n\n💸 Расходов пока нет.`;
  }

  return text;
}

// ── Поездки ──────────────────────────────────────────────────────

async function showTrips(ctx) {
  const user = await requireUser(ctx);
  if (!user) return;

  const trips = await Trips.listTrips(user.uid);
  const kb = new InlineKeyboard();
  trips.forEach((t) => {
    kb.text(`${Trips.statusLabel(t.status)} ${t.name}`, `trip:select:${t.id}`).row();
  });
  kb.text('➕ Новая поездка', 'trip:newstart');

  const text = trips.length ? '🎣 Ваши поездки:' : 'Поездок пока нет. Создайте первую!';
  await ctx.reply(text, { reply_markup: kb });
}

async function showActiveTripCard(ctx) {
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) {
    await ctx.reply('Нет активной поездки. Откройте «🎣 Поездки» и выберите.', { reply_markup: MAIN_MENU });
    return;
  }

  const [recentExpenses, total] = await Promise.all([Expenses.listRecent(trip.id, 5), Expenses.totalSum(trip.id)]);
  await ctx.reply(formatTripCard(trip, { recentExpenses, total }), { parse_mode: 'HTML', reply_markup: MAIN_MENU });
}

async function handleTripNewText(ctx, w, text) {
  const chatId = ctx.chat.id;

  if (w.step === 'type') {
    return ctx.reply('Выберите тип кнопкой выше 👆');
  }

  if (w.step === 'name') {
    if (!text) return ctx.reply('Название не может быть пустым. Введите название поездки:');
    Wizards.update(chatId, { step: 'startDate', data: { name: text } });
    return ctx.reply('Дата начала? (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД)');
  }

  if (w.step === 'startDate') {
    const d = parseDateFlexible(text);
    if (!d) return ctx.reply('Не понял дату. Формат: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД. Попробуйте ещё раз:');
    Wizards.update(chatId, { step: 'endDate', data: { startDate: d } });
    return ctx.reply('Дата окончания? (ДД.ММ.ГГГГ или ГГГГ-ММ-ДД)');
  }

  if (w.step === 'endDate') {
    const d = parseDateFlexible(text);
    if (!d) return ctx.reply('Не понял дату. Формат: ДД.ММ.ГГГГ или ГГГГ-ММ-ДД. Попробуйте ещё раз:');
    if (d < w.data.startDate) return ctx.reply('Дата окончания раньше даты начала. Введите ещё раз:');

    try {
      const trip = await Trips.createTrip({
        type: w.data.type,
        name: w.data.name,
        startDate: w.data.startDate,
        endDate: d,
        uid: w.data.uid,
        displayName: w.data.displayName,
      });
      await Trips.setActiveTrip(chatId, w.data.uid, trip.id);
      Wizards.cancel(chatId);
      await ctx.reply(`✅ Поездка создана и стала активной:\n\n${formatTripCard(trip)}`, {
        parse_mode: 'HTML',
        reply_markup: MAIN_MENU,
      });
    } catch (e) {
      console.error(e);
      await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
    }
  }
}

// ── Расходы ──────────────────────────────────────────────────────

async function startExpenseFlow(ctx, user) {
  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) {
    await ctx.reply('Сначала выберите активную поездку.');
    return showTrips(ctx);
  }
  Wizards.start(ctx.chat.id, 'expense', 'amount_desc', { uid: user.uid, displayName: user.displayName, tripId: trip.id });
  await ctx.reply('Сумма и описание одним сообщением, например: «1500 бензин»');
}

// Клавиатура выбора "кто заплатил" — участники поездки по индексу (как
// реки в улове), плюс ручной ввод для гостя без аккаунта.
function payerKeyboard(participants) {
  const kb = new InlineKeyboard();
  participants.forEach((name, i) => {
    kb.text(name, `exp:payer:${i}`);
    if (i % 2 === 1) kb.row();
  });
  if (participants.length % 2 === 1) kb.row();
  kb.text('✏️ Другое имя', 'exp:payer:other');
  return kb;
}

async function _finishExpense(ctx, w, paidBy) {
  const chatId = ctx.chat.id;
  const trip = await Trips.getTrip(w.data.tripId);
  if (!trip) {
    Wizards.cancel(chatId);
    return ctx.reply('Поездка не найдена.');
  }
  const categories = await Expenses.getCategories(trip.id);
  await Expenses.addExpense(trip.id, {
    desc: w.data.desc,
    amount: w.data.amount,
    category: w.data.category,
    paidBy,
    participants: trip.participants || [],
    uid: w.data.uid,
  });
  Wizards.cancel(chatId);
  const catLabel = Expenses.categoryLabel(categories, w.data.category);
  await ctx.reply(
    `✅ Расход ${formatMoney(w.data.amount)} (${catLabel})${w.data.desc ? ': ' + w.data.desc : ''}\nЗаплатил: ${paidBy}`,
    { reply_markup: MAIN_MENU }
  );
}

async function handleExpenseText(ctx, w, text) {
  const chatId = ctx.chat.id;

  if (w.step === 'amount_desc') {
    const parsed = Expenses.parseAmountDesc(text);
    if (!parsed) {
      return ctx.reply('Не распознал сумму. Начните сообщение с числа, например: «1500 бензин». Попробуйте ещё раз:');
    }

    const categories = await Expenses.getCategories(w.data.tripId);
    const trip = await Trips.getTrip(w.data.tripId);
    const participants = trip?.participants || [];

    // Пробуем определить категорию ИИ по описанию — если уверенно, сразу
    // переходим к "кто заплатил"; не угадала/нет ключа — на кнопки категорий.
    let aiCat = null;
    if (parsed.desc) {
      try {
        aiCat = await AI.classifyCategory(parsed.desc, categories);
      } catch (e) {
        console.error('AI-категоризация не удалась, откат на кнопки:', e?.message || e);
      }
    }

    if (aiCat) {
      Wizards.update(chatId, { step: 'payer', data: { amount: parsed.amount, desc: parsed.desc, category: aiCat } });
      return ctx.reply(
        `Категория: ${Expenses.categoryLabel(categories, aiCat)}. Кто заплатил?`,
        { reply_markup: payerKeyboard(participants) }
      );
    }

    Wizards.update(chatId, { step: 'category', data: { amount: parsed.amount, desc: parsed.desc } });
    const kb = new InlineKeyboard();
    categories.forEach((c, i) => {
      kb.text(c.title, `exp:cat:${c.id}`);
      if (i % 2 === 1) kb.row();
    });
    return ctx.reply('Категория?', { reply_markup: kb });
  }

  if (w.step === 'payer_other') {
    if (!text) return ctx.reply('Введите имя того, кто заплатил:');
    return _finishExpense(ctx, w, text);
  }

  return ctx.reply('Выберите вариант кнопкой выше 👆');
}

// ── Улов ─────────────────────────────────────────────────────────

function fishKeyboard(trip) {
  const kb = new InlineKeyboard();
  Catches.pickFishGroups(trip).forEach((group, gi) => {
    let col = 0;
    group.items.forEach((name, ii) => {
      if (name === 'Другое') return; // отдельная кнопка в конце
      kb.text(name, `catch:fish:${gi}:${ii}`);
      col++;
      if (col % 2 === 0) kb.row();
    });
    if (col % 2 === 1) kb.row();
  });
  kb.text('✏️ Другое', 'catch:fish:other').row();
  return kb;
}

async function startCatchFlow(ctx, user) {
  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) {
    await ctx.reply('Сначала выберите активную поездку.');
    return showTrips(ctx);
  }
  Wizards.start(ctx.chat.id, 'catch', 'fish', { uid: user.uid, displayName: user.displayName, tripId: trip.id });
  await ctx.reply('Вид рыбы?', { reply_markup: fishKeyboard(trip) });
}

async function handleCatchText(ctx, w, text) {
  const chatId = ctx.chat.id;

  if (w.step === 'fish_other') {
    if (!text) return ctx.reply('Введите вид рыбы текстом:');
    Wizards.update(chatId, { step: 'count', data: { fish: text } });
    return ctx.reply('Сколько штук?');
  }

  if (w.step === 'count') {
    const n = parseInt(text, 10);
    if (!Number.isFinite(n) || n < 1) return ctx.reply('Введите положительное число. Попробуйте ещё раз:');
    Wizards.update(chatId, { step: 'kept', data: { count: n } });
    const kb = new InlineKeyboard().text('Взяли', 'catch:kept:yes').text('Отпустили', 'catch:kept:no');
    return ctx.reply('Взяли или отпустили?', { reply_markup: kb });
  }

  if (w.step === 'river_other') {
    if (!text) return ctx.reply('Введите название реки:');
    return finishCatch(ctx, w, text);
  }

  return ctx.reply('Выберите вариант кнопкой выше 👆');
}

async function finishCatch(ctx, w, river) {
  const chatId = ctx.chat.id;
  const data = w.data;
  try {
    await Catches.addCatch(data.tripId, {
      fish: data.fish,
      count: data.count,
      kept: data.kept,
      river,
      member: data.displayName,
      uid: data.uid,
    });
    Wizards.cancel(chatId);
    await ctx.reply(
      `✅ Записано: ${data.fish} × ${data.count}, ${data.kept ? 'взяли' : 'отпустили'}${river ? ', ' + river : ''}.`,
      { reply_markup: MAIN_MENU }
    );
  } catch (e) {
    console.error(e);
    await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
  }
}

// ── Закупка ──────────────────────────────────────────────────────

async function showShopping(ctx) {
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) {
    await ctx.reply('Сначала выберите активную поездку.');
    return showTrips(ctx);
  }
  await renderShoppingList(ctx, trip.id);
}

async function renderShoppingList(ctx, tripId, { edit = false } = {}) {
  const categories = await Shopping.getCategories(tripId);
  const lines = [];
  const kb = new InlineKeyboard();

  categories.forEach((cat, ci) => {
    const items = cat.items || [];
    if (!items.length) return;

    lines.push(`\n<b>${escapeHtml(cat.title)}</b>`);
    kb.text(`— ${cat.title} —`, 'shop:noop').row();

    items.forEach((item, ii) => {
      const mark = item.bought ? '✅' : '⬜';
      lines.push(`${mark} ${escapeHtml(item.name)}${item.qty ? ' — ' + escapeHtml(item.qty) : ''}`);
      const label = `${mark} ${item.name}${item.qty ? ' (' + item.qty + ')' : ''}`;
      kb.text(label.slice(0, 60), `shop:t:${ci}:${ii}`).row();
    });
  });

  kb.text('➕ Добавить', 'shop:add');

  const header = '🛒 Список закупки';
  const text = lines.length ? `${header}\n${lines.join('\n')}` : `${header}\n\nСписок пуст.`;
  const payload = { parse_mode: 'HTML', reply_markup: kb };

  if (edit) {
    try {
      await ctx.editMessageText(text, payload);
    } catch (_) {
      await ctx.reply(text, payload);
    }
  } else {
    await ctx.reply(text, payload);
  }
}

async function handleShoppingAddText(ctx, w, text) {
  const chatId = ctx.chat.id;
  if (w.step !== 'items') return ctx.reply('Выберите категорию кнопкой выше 👆');

  const lines = text
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  if (!lines.length) return ctx.reply('Не нашёл ни одного пункта. Попробуйте ещё раз.');

  const trip = await Trips.getTrip(w.data.tripId);
  if (!trip) {
    Wizards.cancel(chatId);
    return ctx.reply('Поездка не найдена.');
  }

  try {
    const categories = await Shopping.getCategories(trip.id);
    const cat = categories[w.data.catIndex];
    if (!cat) {
      Wizards.cancel(chatId);
      return ctx.reply('Категория не найдена, попробуйте заново.');
    }
    if (!Array.isArray(cat.items)) cat.items = [];

    for (const line of lines) {
      const [namePart, ...rest] = line.split(',');
      const name = namePart.trim();
      if (!name) continue;
      cat.items.push({ id: Shopping.genItemId(), name, qty: rest.join(',').trim(), bought: false });
    }

    await Shopping.saveCategories(trip.id, categories);
    Wizards.cancel(chatId);
    await ctx.reply(`✅ Добавлено пунктов: ${lines.length}.`);
    await renderShoppingList(ctx, trip.id);
  } catch (e) {
    console.error(e);
    await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
  }
}

// ── Команды ──────────────────────────────────────────────────────

bot.command('start', async (ctx) => {
  const user = await Link.findUserByChatId(ctx.chat.id);
  if (!user) return ctx.reply(linkInstructions());
  await ctx.reply(`Привет, ${escapeHtml(user.displayName)}! 🎣\n\nВыберите действие в меню.`, {
    parse_mode: 'HTML',
    reply_markup: MAIN_MENU,
  });
});

bot.command('cancel', async (ctx) => {
  Wizards.cancel(ctx.chat.id);
  await ctx.reply('Диалог отменён.', { reply_markup: MAIN_MENU });
});

bot.command('unlink', async (ctx) => {
  const ok = await Link.unlink(ctx.chat.id);
  Wizards.cancel(ctx.chat.id);
  await ctx.reply(ok ? 'Аккаунт отвязан.' : 'Вы не были привязаны.', { reply_markup: { remove_keyboard: true } });
});

bot.command('trips', showTrips);
bot.command('trip', showActiveTripCard);

// ── Callback-кнопки: поездки ────────────────────────────────────

bot.callbackQuery(/^trip:select:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  const tripId = ctx.match[1];
  const trip = await Trips.getTrip(tripId);
  if (!trip) return ctx.reply('Поездка не найдена.');

  await Trips.setActiveTrip(ctx.chat.id, user.uid, tripId);
  const [recentExpenses, total] = await Promise.all([Expenses.listRecent(trip.id, 5), Expenses.totalSum(trip.id)]);
  await ctx.reply(`✅ Активная поездка выбрана.\n\n${formatTripCard(trip, { recentExpenses, total })}`, {
    parse_mode: 'HTML',
    reply_markup: MAIN_MENU,
  });
});

bot.callbackQuery('trip:newstart', async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  Wizards.start(ctx.chat.id, 'trip_new', 'type', { uid: user.uid, displayName: user.displayName });
  const kb = new InlineKeyboard().text('Экспедиция', 'trip:new:type:expedition').text('Рыбалка', 'trip:new:type:fishing');
  await ctx.reply('Тип поездки?', { reply_markup: kb });
});

bot.callbackQuery(/^trip:new:type:(expedition|fishing)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const w = Wizards.get(ctx.chat.id);
  if (!w || w.type !== 'trip_new' || w.step !== 'type') {
    return ctx.reply('Диалог устарел. Начните заново: «🎣 Поездки» → «➕ Новая поездка».');
  }
  Wizards.update(ctx.chat.id, { step: 'name', data: { type: ctx.match[1] } });
  await ctx.reply('Название поездки?');
});

// ── Callback-кнопки: расходы ─────────────────────────────────────

bot.callbackQuery(/^exp:cat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'expense' || w.step !== 'category') {
    return ctx.reply('Диалог устарел. Начните заново: «➕ Расход».');
  }

  const categoryId = ctx.match[1];
  const trip = await Trips.getTrip(w.data.tripId);
  if (!trip) {
    Wizards.cancel(chatId);
    return ctx.reply('Поездка не найдена.');
  }

  Wizards.update(chatId, { step: 'payer', data: { category: categoryId } });
  await ctx.reply('Кто заплатил?', { reply_markup: payerKeyboard(trip.participants || []) });
});

bot.callbackQuery(/^exp:payer:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'expense' || w.step !== 'payer') {
    return ctx.reply('Диалог устарел. Начните заново: «➕ Расход».');
  }
  const trip = await Trips.getTrip(w.data.tripId);
  const name = trip?.participants?.[Number(ctx.match[1])];
  if (!name) return ctx.reply('Не понял выбор, попробуйте ещё раз.');
  try {
    await _finishExpense(ctx, w, name);
  } catch (e) {
    console.error(e);
    await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
  }
});

bot.callbackQuery('exp:payer:other', async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'expense' || w.step !== 'payer') {
    return ctx.reply('Диалог устарел. Начните заново: «➕ Расход».');
  }
  Wizards.update(chatId, { step: 'payer_other' });
  await ctx.reply('Введите имя того, кто заплатил:');
});

// Смена категории уже записанного расхода (после ИИ-категоризации).
bot.callbackQuery(/^exp:recat:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) return ctx.reply('Нет активной поездки.');

  const expenseId = ctx.match[1];
  const categories = await Expenses.getCategories(trip.id);
  const kb = new InlineKeyboard();
  categories.forEach((c, i) => {
    kb.text(c.title, `exp:setcat:${expenseId}:${c.id}`);
    if (i % 2 === 1) kb.row();
  });
  try {
    await ctx.editMessageReplyMarkup({ reply_markup: kb });
  } catch (_) {
    await ctx.reply('Новая категория?', { reply_markup: kb });
  }
});

bot.callbackQuery(/^exp:setcat:([^:]+):(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) return ctx.reply('Нет активной поездки.');

  const [, expenseId, categoryId] = ctx.match;
  try {
    const updated = await Expenses.updateCategory(trip.id, expenseId, categoryId);
    if (!updated) return ctx.reply('Расход не найден.');
    const categories = await Expenses.getCategories(trip.id);
    const catLabel = Expenses.categoryLabel(categories, categoryId);
    const text = `✅ Расход ${formatMoney(updated.amount)} (${catLabel})${updated.desc ? ': ' + updated.desc : ''}`;
    try {
      await ctx.editMessageText(text, {
        reply_markup: new InlineKeyboard().text('✏️ Изменить категорию', `exp:recat:${expenseId}`),
      });
    } catch (_) {
      await ctx.reply(text);
    }
  } catch (e) {
    console.error(e);
    await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
  }
});

// ── Callback-кнопки: улов ────────────────────────────────────────

bot.callbackQuery(/^catch:fish:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'catch' || w.step !== 'fish') return ctx.reply('Диалог устарел. Начните заново: «🐟 Улов».');

  const gi = Number(ctx.match[1]);
  const ii = Number(ctx.match[2]);
  const trip = await Trips.getTrip(w.data.tripId);
  const fish = Catches.pickFishGroups(trip)[gi]?.items?.[ii];
  if (!fish) return ctx.reply('Не понял выбор, попробуйте ещё раз.');

  Wizards.update(chatId, { step: 'count', data: { fish } });
  await ctx.reply('Сколько штук?');
});

bot.callbackQuery('catch:fish:other', async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'catch' || w.step !== 'fish') return ctx.reply('Диалог устарел. Начните заново: «🐟 Улов».');

  Wizards.update(chatId, { step: 'fish_other' });
  await ctx.reply('Введите вид рыбы текстом:');
});

bot.callbackQuery(/^catch:kept:(yes|no)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'catch' || w.step !== 'kept') return ctx.reply('Диалог устарел. Начните заново: «🐟 Улов».');

  const kept = ctx.match[1] === 'yes';
  Wizards.update(chatId, { step: 'river', data: { kept } });

  const trip = await Trips.getTrip(w.data.tripId);
  const rivers = trip?.rivers || [];
  if (rivers.length) {
    const kb = new InlineKeyboard();
    rivers.forEach((r, i) => kb.text((r && r.name) || String(r), `catch:river:${i}`).row());
    kb.text('✏️ Другая', 'catch:river:other');
    await ctx.reply('Река?', { reply_markup: kb });
  } else {
    Wizards.update(chatId, { step: 'river_other' });
    await ctx.reply('Введите название реки:');
  }
});

bot.callbackQuery(/^catch:river:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'catch' || w.step !== 'river') return ctx.reply('Диалог устарел. Начните заново: «🐟 Улов».');

  const trip = await Trips.getTrip(w.data.tripId);
  const idx = Number(ctx.match[1]);
  const riverObj = trip?.rivers?.[idx];
  const river = (riverObj && riverObj.name) || (typeof riverObj === 'string' ? riverObj : '');
  await finishCatch(ctx, w, river);
});

bot.callbackQuery('catch:river:other', async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'catch' || w.step !== 'river') return ctx.reply('Диалог устарел. Начните заново: «🐟 Улов».');

  Wizards.update(chatId, { step: 'river_other' });
  await ctx.reply('Введите название реки:');
});

// ── Callback-кнопки: закупка ─────────────────────────────────────

bot.callbackQuery('shop:noop', async (ctx) => {
  await ctx.answerCallbackQuery();
});

bot.callbackQuery(/^shop:t:(\d+):(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) return ctx.reply('Нет активной поездки.');

  const ci = Number(ctx.match[1]);
  const ii = Number(ctx.match[2]);
  try {
    await Shopping.toggleBoughtByIndex(trip.id, ci, ii);
    await renderShoppingList(ctx, trip.id, { edit: true });
  } catch (e) {
    console.error(e);
    await ctx.reply('⚠️ Ошибка, попробуйте ещё раз.');
  }
});

bot.callbackQuery('shop:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  const user = await requireUser(ctx);
  if (!user) return;

  const trip = await Trips.getActiveTrip(ctx.chat.id);
  if (!trip) return ctx.reply('Нет активной поездки.');

  const categories = await Shopping.getCategories(trip.id);
  Wizards.start(ctx.chat.id, 'shopping_add', 'category', { tripId: trip.id });

  const kb = new InlineKeyboard();
  categories.forEach((c, i) => {
    kb.text(c.title, `shop:addcat:${i}`);
    if (i % 2 === 1) kb.row();
  });
  await ctx.reply('В какую категорию добавить?', { reply_markup: kb });
});

bot.callbackQuery(/^shop:addcat:(\d+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const chatId = ctx.chat.id;
  const w = Wizards.get(chatId);
  if (!w || w.type !== 'shopping_add' || w.step !== 'category') {
    return ctx.reply('Диалог устарел. Начните заново: «🛒 Закупка».');
  }
  const ci = Number(ctx.match[1]);
  Wizards.update(chatId, { step: 'items', data: { catIndex: ci } });
  await ctx.reply('Пришлите пункты, каждый на новой строке: «Название, количество». Например:\nОгурцы, 1 кг\nЛук, 3 шт');
});

// ── Текстовые сообщения ──────────────────────────────────────────

async function handleWizardText(ctx, w, text) {
  switch (w.type) {
    case 'trip_new':
      return handleTripNewText(ctx, w, text);
    case 'expense':
      return handleExpenseText(ctx, w, text);
    case 'catch':
      return handleCatchText(ctx, w, text);
    case 'shopping_add':
      return handleShoppingAddText(ctx, w, text);
    default:
      Wizards.cancel(ctx.chat.id);
      return ctx.reply('Диалог сброшен.', { reply_markup: MAIN_MENU });
  }
}

bot.on('message:text', async (ctx) => {
  const chatId = ctx.chat.id;
  const text = ctx.message.text.trim();

  const user = await Link.findUserByChatId(chatId);

  if (!user) {
    if (/^\d{6}$/.test(text)) {
      const res = await Link.linkByCode(text, chatId, ctx.from.username);
      if (res.ok) {
        await ctx.reply(`✅ Готово! Привязан участник: ${escapeHtml(res.displayName)}.`, {
          parse_mode: 'HTML',
          reply_markup: MAIN_MENU,
        });
      } else {
        await ctx.reply('Код не найден или истёк. Получите новый в профиле и пришлите ещё раз.');
      }
      return;
    }
    await ctx.reply(linkInstructions());
    return;
  }

  if (MENU_LABELS.has(text)) {
    if (text === '🎣 Поездки') return showTrips(ctx);
    if (text === '➕ Расход') return startExpenseFlow(ctx, user);
    if (text === '🐟 Улов') return startCatchFlow(ctx, user);
    if (text === '🛒 Закупка') return showShopping(ctx);
  }

  const w = Wizards.get(chatId);
  if (w) return handleWizardText(ctx, w, text);

  await ctx.reply('Не понял 🤔 Используйте меню ниже или команды /trips, /trip, /cancel.', { reply_markup: MAIN_MENU });
});

// ── Ошибки и запуск ──────────────────────────────────────────────

bot.catch((err) => {
  console.error('Ошибка бота:', err);
});

process.once('SIGINT', () => bot.stop());
process.once('SIGTERM', () => bot.stop());

bot
  .start({
    onStart: (botInfo) => {
      console.log(`🤖 Бот @${botInfo.username} запущен (long polling)`);
    },
  })
  .catch((err) => {
    console.error('Не удалось запустить бота:', err);
    process.exit(1);
  });

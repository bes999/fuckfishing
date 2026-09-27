'use strict';

const MenuFirebase = (() => {

  const COLLECTION = 'menu';
  let _unsubscribe = null;

  function subscribe(tripId, onUpdate) {
    if (_unsubscribe) _unsubscribe();
    try {
      _unsubscribe = db.collection(COLLECTION).doc(tripId)
        .onSnapshot(snap => {
          if (snap.exists && snap.data().days) {
            MenuState.setFromFirebase(tripId, snap.data().days, snap.data().slotItems || {}, snap.data().mealDuty || {}, snap.data().attendance || {});
            onUpdate();
          }
        }, () => {});
    } catch (_) {}
  }

  function unsubscribe() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  async function saveDays(tripId, days) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ days }, { merge: true });
    } catch (_) {}
  }

  // Отдельное узкое поле для конкретной позиции — та же гонка, что была в
  // Закупке: несколько человек одновременно выбирают разные блюда в разные
  // слоты, а saveDays() выше перезаписывает ВЕСЬ days целиком, так что
  // второе почти одновременное сохранение тихо стирает выбор из первого.
  // slot.id уже глобально уникален в пределах поездки (см. MenuState.addSlot),
  // так что плоская мапа по нему безопасна — Firestore мёржит вложенные
  // map-поля при merge:true, запись одного ключа не задевает остальные.
  async function saveSlotItem(tripId, slotId, item) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ slotItems: { [slotId]: item } }, { merge: true });
    } catch (_) {}
  }

  // Дежурство на приём пищи — та же узкая map-запись, что slotItems выше,
  // ключ day_meal (уникален в пределах поездки, оба id детерминированы:
  // day.id = day_YYYY-MM-DD, meal.id — один из фиксированных 4).
  async function saveMealDuty(tripId, dayId, mealId, duty) {
    try {
      const key = dayId + '_' + mealId;
      await db.collection(COLLECTION).doc(tripId).set({ mealDuty: { [key]: duty } }, { merge: true });
    } catch (_) {}
  }

  // Явка на день — узкая запись всей attendance-карты дня целиком (не по
  // одному участнику/приёму за раз): дёшево, а UI и так шлёт её только по
  // явному тапу в чек-боксе одной ячейки, так что перезаписи гонкой не
  // страшны — два человека одновременно редактируют явку друг друга не
  // видя, что уже и так редкий сценарий для этого экрана.
  async function saveDayAttendance(tripId, dayId, dayAttendance) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ attendance: { [dayId]: dayAttendance } }, { merge: true });
    } catch (_) {}
  }

  // "Готово" в Cook Mode — узкая запись в очередь для бота (см.
  // bot/src/reminders.js checkCookDonePings), не мгновенная отправка из
  // клиента: у клиента нет и не должно быть доступа к Telegram-токену.
  // Бот поллит эту мапу отдельно от часового checkDutyReminders (чаще,
  // см. index.js DONE_PING_CHECK_MS), помечает sent:true и шлёт того, кто
  // назначен на уборку — тот же принцип идемпотентности через флаг, что и
  // у остальных напоминалок.
  async function saveCookDone(tripId, dayId, mealId, cook, cleanup) {
    try {
      const key = dayId + '_' + mealId;
      await db.collection(COLLECTION).doc(tripId).set({
        cookDonePings: {
          [key]: { dayId, mealId, cook: cook || null, cleanup: cleanup || null, sent: false, at: firebase.firestore.FieldValue.serverTimestamp() }
        }
      }, { merge: true });
    } catch (_) {}
  }

  // План меню из AI-импорта поездки (importData.menu: [{day:'День N',
  // meals:[{type:'Утро'|'Обед'|'Ужин'|…, text, cocktail, editable}]}]) —
  // раскладываем по дням Меню «своими блюдами» (source:'manual').
  // Только в ПУСТЫЕ позиции: уже выбранное не трогаем. Пункты с
  // editable:false («Самолёт», «Дома») — не еда, пропускаем.
  // Транзакция: читаем свежие days/slotItems, пишем узко в slotItems (и
  // days, только если меню ещё ни разу не создавалось). Возвращает число
  // заполненных позиций.
  const _IMPORT_MEAL = { 'утро': 'breakfast', 'завтрак': 'breakfast', 'перекус': 'snack',
    'обед': 'lunch', 'ужин': 'dinner' };
  async function importPlan(tripId, startDate, endDate, plan) {
    if (!tripId || !Array.isArray(plan) || !plan.length) return 0;
    const ref = db.collection(COLLECTION).doc(tripId);
    return db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const fresh = !(data.days && data.days.length);
      const days = fresh ? MenuData.generateDays(startDate, endDate || startDate) : data.days;
      const slotItems = data.slotItems || {};
      const updates = {};
      const isEmpty = slot => {
        const it = Object.prototype.hasOwnProperty.call(slotItems, slot.id) ? slotItems[slot.id] : slot.item;
        return !it;
      };
      const put = (meal, type, name) => {
        const slot = (meal.slots || []).find(sl => sl.type === type && isEmpty(sl) && !updates[sl.id]);
        if (!slot) return;
        updates[slot.id] = { id: 'manual_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6), name, source: 'manual' };
      };
      plan.forEach((pd, i) => {
        const n = parseInt(String(pd.day || '').replace(/\D+/g, ''), 10);
        const day = days[(n > 0 ? n : i + 1) - 1];
        if (!day) return;
        (pd.meals || []).forEach(m => {
          if (m.editable === false) return;
          const mealId = _IMPORT_MEAL[String(m.type || '').trim().toLowerCase()];
          const meal = mealId && day.meals && day.meals[mealId];
          if (!meal) return;
          const text = String(m.text || '').trim();
          if (text) put(meal, meal.slots.some(sl => sl.type === 'main') ? 'main' : meal.slots[0]?.type, text);
          const drink = String(m.cocktail || '').trim();
          if (drink) put(meal, 'drink', drink);
        });
      });
      const count = Object.keys(updates).length;
      if (count || fresh) {
        const payload = { slotItems: updates };
        if (fresh) payload.days = days;
        tx.set(ref, payload, { merge: true });
      }
      return count;
    });
  }

  return { subscribe, unsubscribe, saveDays, saveSlotItem, saveMealDuty, saveDayAttendance, saveCookDone, importPlan };
})();

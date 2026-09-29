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

  // Добавить/удалить один слот приёма пищи — транзакция читает СВЕЖИЕ days
  // с сервера и правит только конкретный meal.slots, а не пушит весь
  // локальный массив days поверх сервера (saveDays выше). Раньше добавление/
  // удаление позиции (не выбор блюда в уже существующий слот — то узкая
  // запись через saveSlotItem) шло именно через saveDays: два устройства,
  // добавляющие РАЗНЫЕ позиции почти одновременно, стирали слот друг друга
  // (у кого локальная копия days успела отстать — вторая запись). Реальный
  // баг, найден внешним ревью 2026-09-27. id слота уже сгенерирован на
  // клиенте (см. MenuState.addSlot) — коллизии практически нет, транзакция
  // только решает, КУДА его дописать, по актуальным данным.
  async function addSlotRemote(tripId, dayId, mealId, slot) {
    const ref = db.collection(COLLECTION).doc(tripId);
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const days = snap.data().days || [];
        const day = days.find(d => d.id === dayId);
        const meal = day?.meals?.[mealId];
        if (!meal) return;
        if (!meal.slots.some(s => s.id === slot.id)) meal.slots.push(slot);
        tx.update(ref, { days });
      });
    } catch (e) { console.warn('addSlotRemote:', e); }
  }

  async function removeSlotRemote(tripId, dayId, mealId, slotId) {
    const ref = db.collection(COLLECTION).doc(tripId);
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const days = snap.data().days || [];
        const day = days.find(d => d.id === dayId);
        const meal = day?.meals?.[mealId];
        if (!meal) return;
        meal.slots = meal.slots.filter(s => s.id !== slotId);
        tx.update(ref, { days });
      });
    } catch (e) { console.warn('removeSlotRemote:', e); }
  }

  // Первая генерация дней локально (см. MenuState.initDays) — раньше эта
  // ветка вообще не пушила days в Firestore (только saveDays на пересборку
  // после смены дат). Устройство, первым открывшее новую поездку, строило
  // days со случайными id слотов только у себя в localStorage — выбор блюд
  // уходил узкой записью в slotItems по ЭТИМ id, а другое устройство,
  // открыв то же меню, генерировало СВОИ случайные id и не находило
  // совпадений — видело пустое меню навсегда. Реальный баг, найден внешним
  // ревью 2026-09-27. Чинится пушем скелета и на первую генерацию тоже —
  // но НЕ вслепую: сперва проверяем, что в Firestore правда ещё пусто,
  // иначе можно затереть уже заполненный чужой days гонкой (два человека
  // одновременно первыми открывают меню новой поездки). Само чтение+запись
  // — тоже гонка (та же, что чинили): отдельные get() и set() не атомарны,
  // и если оба устройства успевают прочитать «пусто» до того, как первое
  // из них запишет, второе всё равно затирает первое своими (другими)
  // случайными id слотов. Транзакция делает проверку и запись одной
  // атомарной операцией — Firestore сам переигрывает при конфликте.
  // Реальный баг, найден внешним ревью 2026-09-27.
  async function ensureDaysSeeded(tripId, days) {
    try {
      const ref = db.collection(COLLECTION).doc(tripId);
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const existing = snap.exists ? snap.data().days : null;
        if (!existing || !existing.length) {
          tx.set(ref, { days }, { merge: true });
        }
      });
    } catch (_) {}
  }

  // Отдельное узкое поле для конкретной позиции — та же гонка, что была в
  // Закупке: несколько человек одновременно выбирают разные блюда в разные
  // слоты, а saveDays() выше перезаписывает ВЕСЬ days целиком, так что
  // второе почти одновременное сохранение тихо стирает выбор из первого.
  // slot.id уже глобально уникален в пределах поездки (см. MenuState.addSlot),
  // так что плоская мапа по нему безопасна — запись одного ключа не задевает
  // остальные. Но .set(…,{merge:true}) с вложенным объектом мёржит его
  // РЕКУРСИВНО, а не заменяет: если у старого блюда в этом слоте был
  // leftover:true, а новое блюдо (без этого поля) просто заменило его,
  // старое значение leftover молча переживало замену — новое блюдо
  // "наследовало" отметку "остатки" от прежнего. Реальный баг, найден
  // внешним ревью 2026-09-27. update() с путём через точку пишет ровно в
  // этот путь, заменяя значение целиком, а не мёржа его подполя.
  async function saveSlotItem(tripId, slotId, item) {
    try {
      await db.collection(COLLECTION).doc(tripId).update({ ['slotItems.' + slotId]: item });
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
    // Приёмы пищи, выключенные для этой поездки (см. trip.mealsPlanned /
    // TripsData.plannedMeals) — план из AI-импорта их пропускает, а не
    // молча создаёт заново то, что пользователь явно отключил.
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(tripId) : null;
    const planned = typeof TripsData !== 'undefined' ? TripsData.plannedMeals(trip) : null;
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
          if (mealId && planned && !planned.includes(mealId)) return;
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

  // Даты поездки поменялись — пересобираем дни меню сразу на сервере, а
  // не когда кто-нибудь откроет Меню (раньше Главная и напоминания бота до
  // этого видели старые дни). Поездку обычно ПЕРЕНОСЯТ, поэтому день N
  // остаётся днём N (как у Group Trip Planner): блюда, дежурства и явка
  // едут вместе с днём. Если поездка стала короче — блюда хвостовых дней
  // не выбрасываем молча: возвращаем их список, мастер предупреждает до
  // сохранения (countTail). Меню, которого ещё нет, не создаём.
  function _tailDishes(days, newLen, slotItems) {
    const out = [];
    days.slice(newLen).forEach(d => Object.values(d.meals || {}).forEach(m => (m.slots || []).forEach(sl => {
      const it = Object.prototype.hasOwnProperty.call(slotItems, sl.id) ? slotItems[sl.id] : sl.item;
      if (it && it.name) out.push(it.name);
    })));
    return out;
  }
  async function countTail(tripId, startDate, endDate) {
    const snap = await db.collection(COLLECTION).doc(tripId).get();
    if (!snap.exists) return [];
    const newLen = MenuData.generateDays(startDate, endDate || startDate).length;
    return _tailDishes(snap.data().days || [], newLen, snap.data().slotItems || {});
  }
  async function syncDays(tripId, startDate, endDate) {
    if (!tripId || !startDate) return;
    const ref = db.collection(COLLECTION).doc(tripId);
    await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const data = snap.exists ? snap.data() : {};
      const old = data.days || [];
      if (!old.length) return;
      const fresh = MenuData.generateDays(startDate, endDate || startDate);
      const idMap = {};
      fresh.forEach((d, i) => {
        const was = old[i];
        if (!was) return;
        d.meals = was.meals;
        if (was.attendance) d.attendance = was.attendance;
        idMap[was.id] = d.id;
      });
      const remap = (m) => {
        const out = {};
        Object.keys(m || {}).forEach(k => {
          const dayId = Object.keys(idMap).find(o => k === o || k.startsWith(o + '_'));
          if (dayId) out[idMap[dayId] + k.slice(dayId.length)] = m[k];
        });
        return out;
      };
      // mealDuty/attendance ключуются id дня — переносим ключи целиком
      // (set без merge по этим полям: старые ключи должны исчезнуть).
      tx.update(ref, {
        days: fresh,
        mealDuty: remap(data.mealDuty),
        attendance: remap(data.attendance),
      });
    });
  }

  // Переименование участника (_showRenameSheet в modules/trips/index.js,
  // «как показывать в этой поездке») — дежурства (mealDuty[key].cook/
  // .cleanup) и явка (attendance[dayId][name]) хранятся по имени-строке, не
  // по uid, так же как paidBy в Расходах (см. ExpensesFirebase.renameParticipant,
  // тот же вызов из trips/index.js _save()). Без переноса старое имя
  // остаётся дежурным (бот его не находит среди участников с новым именем и
  // молча пропускает напоминание — см. bot/src/reminders.js), а отметка
  // отсутствия «отваливается» от человека под новым именем (снова
  // считается присутствующим). Реальный баг, найден внешним ревью
  // 2026-09-27. Транзакция — та же атомарность, что у syncDays выше.
  // tx.set(...,{merge:true}) (было раньше) РЕКУРСИВНО мёржит вложенные
  // поля — ключ, которого нет в новых данных (мы его локально удалили из
  // объекта attendance[dayId]), сервер просто не трогает, а не удаляет.
  // Старое имя оставалось висеть в attendance навсегда — если потом в
  // поездку добавляли НОВОГО человека с тем же старым именем, он тут же
  // "наследовал" чужие прошлые отметки отсутствия. Реальный баг (тот же
  // класс, что уже чинили у saveSlotItem — merge не значит "заменить
  // целиком"), найден внешним ревью 2026-09-27. tx.update() с точечными
  // путями меняет/удаляет РОВНО указанный вложенный ключ, не трогая
  // соседние.
  async function renameParticipant(tripId, oldName, newName) {
    if (!tripId || !oldName || !newName || oldName === newName) return;
    const ref = db.collection(COLLECTION).doc(tripId);
    const FV = firebase.firestore.FieldValue;
    try {
      await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        if (!snap.exists) return;
        const data = snap.data();
        const updates = {};

        const mealDuty = data.mealDuty || {};
        Object.keys(mealDuty).forEach(key => {
          const duty = mealDuty[key] || {};
          if (duty.cook === oldName)    updates[`mealDuty.${key}.cook`] = newName;
          if (duty.cleanup === oldName) updates[`mealDuty.${key}.cleanup`] = newName;
        });

        const attendance = data.attendance || {};
        Object.keys(attendance).forEach(dayId => {
          const dayAtt = attendance[dayId] || {};
          if (Object.prototype.hasOwnProperty.call(dayAtt, oldName)) {
            updates[`attendance.${dayId}.${newName}`] = dayAtt[oldName];
            updates[`attendance.${dayId}.${oldName}`] = FV.delete();
          }
        });

        if (Object.keys(updates).length) tx.update(ref, updates);
      });
    } catch (e) { console.warn('MenuFirebase.renameParticipant:', e); }
  }

  return { subscribe, unsubscribe, saveDays, addSlotRemote, removeSlotRemote, ensureDaysSeeded, saveSlotItem, saveMealDuty, saveDayAttendance, saveCookDone, importPlan, syncDays, countTail, renameParticipant };
})();

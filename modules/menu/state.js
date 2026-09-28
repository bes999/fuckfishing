'use strict';

const MenuState = (() => {

  const KEY = 'ff_menu';
  let _data = {}; // { tripId: { days: [...] } }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _data = raw ? JSON.parse(raw) : {};
    } catch (_) { _data = {}; }
  }

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_data)); } catch (_) {}
  }

  // Получить дни для поездки
  function getDays(tripId) {
    return _data[tripId]?.days || null;
  }

  // Инициализировать дни из дат поездки — и пересобрать, если даты
  // поездки поменялись задним числом (раньше initDays один раз строил
  // список и больше никогда его не трогал, даже если даты правились в
  // настройках поездки — старые дни оставались висеть вечно). id дня —
  // это его дата (day_YYYY-MM-DD), так что при пересборке просто
  // переносим meals у дней, чья дата осталась в новом диапазоне, а не
  // теряем уже распланированное.
  function initDays(tripId, startDate, endDate) {
    const existing = _data[tripId];
    if (existing?.days?.length && existing.startDate === startDate && existing.endDate === endDate) {
      return existing.days;
    }
    const freshDays = MenuData.generateDays(startDate, endDate);
    if (existing?.days?.length) {
      // День N остаётся днём N (как MenuFirebase.syncDays) — поездку
      // обычно переносят целиком, и блюда должны ехать вместе с днями.
      // Это только для МГНОВЕННОГО локального рендера, пока не пришёл
      // настоящий снапшот — сюда НЕ пушим (раньше пушило, см. ниже). Этот
      // existing — локальный кэш конкретно этого устройства, а initDays
      // зовётся при КАЖДОМ открытии Меню, любым устройством, не только тем,
      // что реально поменяло даты. Если это устройство давно не открывало
      // Меню, а даты сменились на ДРУГОМ устройстве, existing.startDate/
      // endDate тут расходится с текущими не потому, что МЫ их меняли, а
      // потому что наш кэш просто устарел — пересобирать по нему и
      // ЗАПИСЫВАТЬ поверх сервера значит терять блюда, добавленные на
      // сервере после последней синхронизации этого устройства (реальный
      // баг, найден внешним ревью 2026-09-27). Настоящую атомарную миграцию
      // дней при смене дат делает MenuFirebase.syncDays — по свежим
      // серверным данным, в транзакции, вызывается из modules/trips/
      // index.js _save() тем устройством, которое реально меняет даты;
      // живой снапшот (см. MenuFirebase.subscribe) поправит рендер здесь,
      // если наша локальная догадка была неверна.
      freshDays.forEach((d, i) => {
        const was = existing.days[i];
        if (was) { d.meals = was.meals; if (was.attendance) d.attendance = was.attendance; }
      });
    } else if (typeof MenuFirebase !== 'undefined' && MenuFirebase.ensureDaysSeeded) {
      // Самая первая генерация дней локально — id слотов случайные (см.
      // MenuData._emptyMeals), у каждого устройства свои. Не запушить их
      // сейчас означает: следующее устройство, открывшее это же меню,
      // сгенерирует СВОИ id и не найдёт выбранные блюда в slotItems — увидит
      // пустое меню навсегда (реальный баг, внешнее ревью 2026-09-27).
      // ensureDaysSeeded сам проверяет, что в Firestore правда пусто, прежде
      // чем писать — не гонка с уже заполненным days с другого устройства.
      MenuFirebase.ensureDaysSeeded(tripId, freshDays);
    }
    _data[tripId] = { days: freshDays, startDate, endDate };
    _save();
    return freshDays;
  }

  // Обновить слот
  function updateSlot(tripId, dayId, mealId, slotId, item) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return;
    const slot = day.meals[mealId]?.slots?.find(s => s.id === slotId);
    if (!slot) return;
    slot.item = item;
    _save();
  }

  // Дежурство на приём пищи целиком (не на слот — см. MenuData._emptyMeals).
  // role — 'cook' | 'cleanup'.
  function setMealDuty(tripId, dayId, mealId, role, name) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day || !day.meals[mealId]) return;
    day.meals[mealId][role] = name || null;
    _save();
  }

  // Сколько раз каждый участник уже готовил/убирал за эту поездку — основа
  // для "авто-назначить" (см. MenuRender._showDutyPicker): предлагаем того,
  // кто реже всего был в этой роли, а не первого попавшегося. plannedMealIds
  // (опционально) — учитывать только включённые в поездке приёмы пищи (см.
  // trip.mealsPlanned / TripsData.plannedMeals), выключенные из счёта не
  // должны влиять на "кто реже всех".
  function getDutyCounts(tripId, plannedMealIds) {
    const cook = {}, cleanup = {};
    (_data[tripId]?.days || []).forEach(day => {
      Object.entries(day.meals || {}).forEach(([mealId, meal]) => {
        if (plannedMealIds && !plannedMealIds.includes(mealId)) return;
        if (meal.cook)    cook[meal.cook]       = (cook[meal.cook]       || 0) + 1;
        if (meal.cleanup) cleanup[meal.cleanup] = (cleanup[meal.cleanup] || 0) + 1;
      });
    });
    return { cook, cleanup };
  }

  // Пометить/снять "остатки" на выбранном блюде слота — Cook Mode дергает
  // это при сохранении переключателя "остались излишки".
  function setSlotLeftover(tripId, dayId, mealId, slotId, leftover) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    const slot = day?.meals[mealId]?.slots?.find(s => s.id === slotId);
    if (!slot || !slot.item) return;
    slot.item = Object.assign({}, slot.item, { leftover: !!leftover });
    _save();
  }

  // Явка на приёмы пищи — опциональная, включается за поездку целиком
  // (trip.attendanceEnabled, тот же паттерн, что trip.inviteRestricted:
  // простой булев флаг прямо на документе поездки — см. modules/menu/
  // render.js). По умолчанию (флаг выключен, или ячейка ещё не тронута)
  // участник считается присутствующим — отмечать нужно только отсутствие,
  // не каждое "да, буду".
  function getDayAttendance(tripId, dayId, name, mealId) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    const entry = day?.attendance?.[name]?.[mealId];
    return entry === undefined ? true : !!entry;
  }

  function setDayAttendance(tripId, dayId, name, mealId, present) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return;
    if (!day.attendance) day.attendance = {};
    if (!day.attendance[name]) day.attendance[name] = {};
    day.attendance[name][mealId] = !!present;
    _save();
  }

  // Сколько из переданных имён отмечены присутствующими на этот приём —
  // для подписи "Обед: 2 из 3" под шапкой приёма пищи.
  function getMealHeadcount(tripId, dayId, mealId, names) {
    const present = names.filter(n => getDayAttendance(tripId, dayId, n, mealId));
    return { present: present.length, total: names.length };
  }

  // Удалить слот
  function removeSlot(tripId, dayId, mealId, slotId) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return;
    const meal = day.meals[mealId];
    if (!meal) return;
    meal.slots = meal.slots.filter(s => s.id !== slotId);
    _save();
  }

  // Добавить слот
  function addSlot(tripId, dayId, mealId, slotType) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return null;
    const slot = {
      id:   `slot_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      type: slotType,
      item: null
    };
    day.meals[mealId].slots.push(slot);
    _save();
    return slot;
  }

  // Заменить все данные из Firebase — slotItemsMap (плоское поле slot.id →
  // item) накладывается поверх days ПОСЛЕ, так же как bought-мапа в
  // Закупке: узкие точечные записи всегда должны побеждать над тем, что
  // могло прийти в самом days (который мог отстать на один снапшот).
  // Накладывает slotItemsMap/mealDutyMap/attendanceMap на days (мутирует и
  // возвращает тот же массив) — сама по себе НЕ трогает общее состояние
  // Меню (_data/localStorage), это делает только setFromFirebase ниже.
  // Вынесено отдельно, чтобы разовая сборка (печать — см.
  // modules/print/index.js) могла получить те же резолвнутые days без
  // побочного эффекта на живой экран Меню.
  function _resolveDays(days, slotItemsMap, mealDutyMap, attendanceMap) {
    if (slotItemsMap) {
      days.forEach(day => {
        Object.values(day.meals).forEach(meal => {
          meal.slots.forEach(slot => {
            if (Object.prototype.hasOwnProperty.call(slotItemsMap, slot.id)) {
              slot.item = slotItemsMap[slot.id];
            }
          });
        });
      });
    }
    if (mealDutyMap) {
      days.forEach(day => {
        Object.keys(day.meals).forEach(mealId => {
          const key = day.id + '_' + mealId;
          if (Object.prototype.hasOwnProperty.call(mealDutyMap, key)) {
            const duty = mealDutyMap[key] || {};
            day.meals[mealId].cook    = duty.cook    || null;
            day.meals[mealId].cleanup = duty.cleanup || null;
          }
        });
      });
    }
    if (attendanceMap) {
      days.forEach(day => {
        if (Object.prototype.hasOwnProperty.call(attendanceMap, day.id)) {
          day.attendance = attendanceMap[day.id] || {};
        }
      });
    }
    return days;
  }

  function setFromFirebase(tripId, days, slotItemsMap, mealDutyMap, attendanceMap) {
    if (!_data[tripId]) _data[tripId] = {};
    _resolveDays(days, slotItemsMap, mealDutyMap, attendanceMap);
    _data[tripId].days = days;
    _save();
  }

  // Разовая сборка (печать и т.п.) — те же days, что вернул бы
  // setFromFirebase, но БЕЗ записи в общее состояние Меню/localStorage.
  // Печать раньше звала сам setFromFirebase, из-за чего открытие печати
  // молча перезатирало рабочее состояние живого экрана Меню пустой явкой
  // (третий аргумент туда всегда приходил {}) — реальный баг, найден
  // внешним ревью 2026-09-27.
  function resolveDays(days, slotItemsMap, mealDutyMap, attendanceMap) {
    return _resolveDays(days || [], slotItemsMap, mealDutyMap, attendanceMap);
  }

  // Получить статус дня (пустой/частичный/заполненный). plannedMealIds
  // (опционально) — считать только по приёмам пищи, включённым в
  // планирование этой поездки (trip.mealsPlanned) — выключенные приёмы не
  // должны красить точку в полосе дней, даже если в них что-то выбрано
  // раньше (данные не удаляются при выключении, см. TripsData.plannedMeals).
  function getDayStatus(tripId, dayId, plannedMealIds) {
    const day = _data[tripId]?.days?.find(d => d.id === dayId);
    if (!day) return 'empty';
    let total = 0, filled = 0;
    Object.entries(day.meals).forEach(([mealId, meal]) => {
      if (plannedMealIds && !plannedMealIds.includes(mealId)) return;
      meal.slots.forEach(slot => {
        total++;
        if (slot.item) filled++;
      });
    });
    if (filled === 0) return 'empty';
    if (filled === total) return 'done';
    return 'partial';
  }

  return {
    load, getDays, initDays, updateSlot, removeSlot, addSlot, setFromFirebase, resolveDays, getDayStatus,
    setMealDuty, getDutyCounts, setSlotLeftover,
    getDayAttendance, setDayAttendance, getMealHeadcount,
  };
})();

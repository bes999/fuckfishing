'use strict';

const MenuData = (() => {

  // Типы слотов
  const SLOT_TYPES = [
    { id: 'main',    label: 'Основное', icon: 'ti-flame',   color: 'green' },
    { id: 'side',    label: 'Гарнир',   icon: 'ti-bowl',    color: 'blue'  },
    { id: 'protein', label: 'Мясо/рыба', icon: 'ti-meat',   color: 'red'   },
    { id: 'snack',   label: 'Закуска',  icon: 'ti-salad',   color: 'blue'  },
    { id: 'drink',   label: 'Напиток',  icon: 'ti-droplet', color: 'orange'},
    { id: 'dessert', label: 'Десерт',   icon: 'ti-candy',   color: 'orange'},
  ];

  // Базовые слоты для каждого приёма пищи
  const MEAL_BASE_SLOTS = {
    breakfast: ['main', 'drink'],
    snack:     ['snack', 'drink'],
    lunch:     ['main', 'side', 'protein', 'drink'],
    dinner:    ['main', 'side', 'protein', 'snack', 'drink'],
  };

  // Приёмы пищи
  const MEALS = [
    { id: 'breakfast', label: 'Завтрак', icon: 'ti-coffee' },
    { id: 'snack',     label: 'Перекус', icon: 'ti-apple'  },
    { id: 'lunch',     label: 'Обед',    icon: 'ti-bowl'   },
    { id: 'dinner',    label: 'Ужин',    icon: 'ti-moon'   },
  ];

  // Белки (отдельный список для слота protein)
  const PROTEINS = [
    { id: 'pr_stew_beef',    name: 'Тушёнка говяжья',    hint: 'Классика' },
    { id: 'pr_stew_pork',    name: 'Тушёнка свиная',     hint: null },
    { id: 'pr_chicken',      name: 'Курица',              hint: 'Филе/окорочка' },
    { id: 'pr_eggs',         name: 'Яйца варёные',        hint: null },
    { id: 'pr_fish_fillet',  name: 'Филе рыбы',           hint: 'Свежая' },
    { id: 'pr_sausage',      name: 'Колбаса/сосиски',     hint: null },
    { id: 'pr_cheese',       name: 'Сыр',                 hint: null },
    { id: 'pr_crab',         name: 'Краб',                hint: 'Если повезёт' },
    { id: 'pr_sardines',     name: 'Сардины консервы',    hint: null },
  ];

  // Генерация дней из дат поездки
  function generateDays(startDate, endDate) {
    const days = [];
    const start = new Date(startDate);
    const end   = new Date(endDate);
    const DAYS_RU = ['вс','пн','вт','ср','чт','пт','сб'];
    const MONTHS  = ['января','февраля','марта','апреля','мая','июня',
                     'июля','августа','сентября','октября','ноября','декабря'];
    let cur = new Date(start);
    let idx = 1;
    while (cur <= end) {
      days.push({
        id:    `day_${cur.toISOString().slice(0,10)}`,
        num:   idx,
        date:  cur.toISOString().slice(0,10),
        label: `${cur.getDate()} ${MONTHS[cur.getMonth()]}, ${DAYS_RU[cur.getDay()]}`,
        meals: _emptyMeals()
      });
      cur.setDate(cur.getDate() + 1);
      idx++;
    }
    return days;
  }

  let _slotCounter = 0;

  function _emptyMeals() {
    const meals = {};
    MEALS.forEach(function(m) {
      meals[m.id] = {
        slots: MEAL_BASE_SLOTS[m.id].map(function(type) {
          _slotCounter++;
          return {
            id:   'slot_' + Date.now() + '_' + _slotCounter + '_' + Math.random().toString(36).slice(2),
            type: type,
            item: null  // { id, name, source, leftover? } — source: 'recipes'|'bar'|'proteins'
          };
        }),
        // Дежурство на весь приём пищи (не на слот — за обед в целом
        // отвечает один повар, а не отдельно по гарниру и отдельно по
        // мясу). Имена участников, как и everywhere else в этом модуле
        // (paidBy/participants в Расходах) — не uid.
        cook:    null,
        cleanup: null,
      };
    });
    return meals;
  }

  // Блюда встроенного каталога категории + свои рецепты пользователей
  // (recipes_custom, добавленные через "+" в Рецептах) — раньше сюда
  // попадал только встроенный каталог, свои рецепты в меню выбрать было
  // нельзя, хотя в самих Рецептах они прекрасно отображались.
  function _recipeItemsForCat(catId) {
    const items = [];
    const cat = RecipesData.getCategories().find(c => c.id === catId);
    if (cat) items.push(...cat.cocktails.map(r => ({ id: r.id, name: r.name, hint: r.sub, source: 'recipes', destinations: r.destinations || [] })));
    if (typeof RecipesState !== 'undefined') {
      RecipesState.getCustomRecipes(catId).forEach(r => {
        items.push({ id: r.id, name: r.name, hint: r.sub, source: 'recipes_custom', destinations: r.destinations || [] });
      });
    }
    return items;
  }

  // Получить блюда для типа слота (из RecipesData + BarData + Proteins),
  // плюс, если переданы days/dayId — остатки блюд того же типа слота за
  // последние LEFTOVER_WINDOW_DAYS дней первой секцией (см.
  // getLeftoverItemsForSlot выше). days/dayId необязательны — вызовы,
  // которым остатки не нужны (например резолв ингредиентов вне пикера),
  // просто не передают их.
  function getItemsForSlot(slotType, days, dayId) {
    const result = _baseItemsForSlot(slotType);
    if (days && dayId) {
      const leftovers = getLeftoverItemsForSlot(days, dayId, slotType);
      if (leftovers.length) result.unshift({ section: 'Остатки', items: leftovers });
    }
    return result;
  }

  function _baseItemsForSlot(slotType) {
    const result = [];

    if (slotType === 'drink') {
      // Из Бара
      if (typeof BarData !== 'undefined') {
        BarData.getCategories().forEach(cat => {
          result.push({
            section: `Бар · ${cat.label}`,
            items: cat.cocktails.map(c => ({
              id: c.id, name: c.name, hint: c.sub, source: 'bar', destinations: []
            }))
          });
        });
      }
      // Напитки из Рецептов
      if (typeof RecipesData !== 'undefined') {
        const items = _recipeItemsForCat('drinks');
        if (items.length) result.push({ section: 'Напитки', items });
      }
      return result;
    }

    if (slotType === 'protein') {
      result.push({
        section: 'Мясо/рыба',
        items: PROTEINS.map(p => ({ id: p.id, name: p.name, hint: p.hint, source: 'proteins', destinations: [] }))
      });
      return result;
    }

    if (slotType === 'side') {
      if (typeof RecipesData !== 'undefined') {
        const items = _recipeItemsForCat('sides');
        if (items.length) result.push({ section: 'Гарниры', items });
      }
      return result;
    }

    if (slotType === 'snack') {
      if (typeof RecipesData !== 'undefined') {
        const items = _recipeItemsForCat('snacks');
        if (items.length) result.push({ section: 'Закуски', items });
        const fishItems = _recipeItemsForCat('fish');
        if (fishItems.length) result.push({ section: 'Из рыбы', items: fishItems });
      }
      return result;
    }

    if (slotType === 'dessert') {
      if (typeof RecipesData !== 'undefined') {
        const items = _recipeItemsForCat('desserts');
        if (items.length) result.push({ section: 'Десерты', items });
      }
      return result;
    }

    // main — все блюда кроме гарниров, напитков, десертов
    if (typeof RecipesData !== 'undefined') {
      const mainCats = ['breakfast', 'soups', 'main', 'fish', 'delicacies'];
      mainCats.forEach(catId => {
        const cat = RecipesData.getCategories().find(c => c.id === catId);
        const items = _recipeItemsForCat(catId);
        if (items.length) result.push({ section: cat ? cat.label : catId, items });
      });
    }
    return result;
  }

  // Остатки — блюдо, отмеченное в Cook Mode как "хватит ещё на приём",
  // становится выбираемым вариантом для того же типа слота (Основное →
  // Основное и т.п.) на следующие LEFTOVER_WINDOW_DAYS дней, а не только
  // сегодня. Ищем по факту (days[i].item.leftover===true), а не по
  // отдельному хранилищу — источник правды один, дублировать нечего.
  const LEFTOVER_WINDOW_DAYS = 2;

  function getLeftoverItemsForSlot(days, dayId, slotType) {
    const idx = days.findIndex(d => d.id === dayId);
    if (idx < 0) return [];
    const from = Math.max(0, idx - LEFTOVER_WINDOW_DAYS);
    const seen = new Set();
    const result = [];
    for (let i = from; i < idx; i++) {
      const day = days[i];
      Object.values(day.meals || {}).forEach(meal => {
        (meal.slots || []).forEach(slot => {
          if (slot.type !== slotType || !slot.item || !slot.item.leftover) return;
          const key = slot.item.source + '_' + slot.item.id;
          if (seen.has(key)) return;
          seen.add(key);
          result.push({
            id: slot.item.id, name: slot.item.name, source: slot.item.source,
            hint: `Остатки · ${day.label}`, destinations: [], leftover: true,
          });
        });
      });
    }
    return result;
  }

  function getMeals()        { return MEALS; }
  function getSlotTypes()    { return SLOT_TYPES; }
  function getSlotType(id)   { return SLOT_TYPES.find(t => t.id === id) || null; }
  function getMealBaseSlots(mealId) { return MEAL_BASE_SLOTS[mealId] || []; }

  return { generateDays, getItemsForSlot, getLeftoverItemsForSlot, getMeals, getSlotTypes, getSlotType, getMealBaseSlots };
})();

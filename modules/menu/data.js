'use strict';

const MenuData = (() => {

  // Типы слотов
  const SLOT_TYPES = [
    { id: 'main',    label: 'Основное', icon: 'ti-flame',   color: 'green' },
    { id: 'side',    label: 'Гарнир',   icon: 'ti-bowl',    color: 'blue'  },
    { id: 'protein', label: 'Белок',    icon: 'ti-meat',    color: 'red'   },
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
    { id: 'pr_eggs',         name: 'Яйца варёные',        hint: null },
    { id: 'pr_fish_fillet',  name: 'Филе симы',           hint: 'Свежая' },
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
            item: null  // { id, name, source } — source: 'recipes'|'bar'|'proteins'
          };
        })
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
    if (cat) items.push(...cat.cocktails.map(r => ({ id: r.id, name: r.name, hint: r.sub, source: 'recipes' })));
    if (typeof RecipesState !== 'undefined') {
      RecipesState.getCustomRecipes(catId).forEach(r => {
        items.push({ id: r.id, name: r.name, hint: r.sub, source: 'recipes_custom' });
      });
    }
    return items;
  }

  // Получить блюда для типа слота (из RecipesData + BarData + Proteins)
  function getItemsForSlot(slotType) {
    const result = [];

    if (slotType === 'drink') {
      // Из Бара
      if (typeof BarData !== 'undefined') {
        BarData.getCategories().forEach(cat => {
          result.push({
            section: `Бар · ${cat.label}`,
            items: cat.cocktails.map(c => ({
              id: c.id, name: c.name, hint: c.sub, source: 'bar'
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
        section: 'Белок',
        items: PROTEINS.map(p => ({ id: p.id, name: p.name, hint: p.hint, source: 'proteins' }))
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
      const mainCats = ['fish', 'delicacies', 'breakfast', 'soups', 'main'];
      mainCats.forEach(catId => {
        const cat = RecipesData.getCategories().find(c => c.id === catId);
        const items = _recipeItemsForCat(catId);
        if (items.length) result.push({ section: cat ? cat.label : catId, items });
      });
    }
    return result;
  }

  function getMeals()        { return MEALS; }
  function getSlotTypes()    { return SLOT_TYPES; }
  function getSlotType(id)   { return SLOT_TYPES.find(t => t.id === id) || null; }
  function getMealBaseSlots(mealId) { return MEAL_BASE_SLOTS[mealId] || []; }

  return { generateDays, getItemsForSlot, getMeals, getSlotTypes, getSlotType, getMealBaseSlots };
})();

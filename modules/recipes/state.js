'use strict';

const RecipesState = (() => {

  const KEY = 'ff_recipes_reviews';
  let _reviews = {};

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      _reviews = raw ? JSON.parse(raw) : {};
    } catch (_) { _reviews = {}; }
  }

  function _save() {
    try { localStorage.setItem(KEY, JSON.stringify(_reviews)); } catch (_) {}
  }

  function setReviews(reviews) { _reviews = reviews; _save(); }

  // --- Свои рецепты (добавленные через интерфейс, помимо встроенного
  // каталога в data.js) — id нормализуем в `id`, чтобы карточки/рейтинги
  // работали одинаково что со встроенными, что со своими рецептами.
  let _custom = [];
  function setCustomRecipes(arr) {
    _custom = (arr || []).map(r => Object.assign({}, r, { id: r._id }));
  }
  function getCustomRecipes(catId) { return _custom.filter(r => r.category === catId); }
  function getCustomRecipeById(id) { return _custom.find(r => r.id === id) || null; }

  // --- Каталог рецептов (бывший встроенный data.js, теперь в Firestore —
  // см. RecipesFirebase.subscribeCatalog/migrateSeedData) — доки пишутся
  // со своим исходным id (fish_salted и т.д.), поэтому doc.id это и есть
  // recipe.id, ничего нормализовать не нужно, в отличие от _custom выше. ---
  let _catalog = [];
  function setCatalogRecipes(arr) { _catalog = arr || []; }
  function getCatalogRecipes(catId) { return _catalog.filter(r => r.category === catId); }
  function getCatalogRecipeById(id) { return _catalog.find(r => r.id === id) || null; }

  // --- Каталог ингредиентов — единый список "что вообще покупаем", на
  // который ссылаются форма редактирования рецепта (автодополнение) и пуш
  // ингредиентов в Закупку (резолв категории по имени вместо угадывания
  // по ключевым словам). Доки с авто-id, ключ поиска — имя. ---
  let _ingredients = [];
  function setIngredients(arr) { _ingredients = arr || []; }
  function getIngredients() { return _ingredients; }
  function getIngredientByName(name) {
    const key = String(name || '').trim().toLowerCase();
    return _ingredients.find(i => i.name.toLowerCase() === key) || null;
  }
  function getIngredientById(id) {
    return _ingredients.find(i => i.id === id) || null;
  }

  // --- Порядок/видимость вкладок-категорий — тот же паттерн, что
  // trip.guideTabs у вкладок Гида: пусто/не загружено = показываем все
  // категории в исходном порядке (см. RecipesData.getCategories). ---
  let _categoryOrder = null;
  function setCategoryOrder(order) { _categoryOrder = order || []; }
  function getCategoryOrder() { return _categoryOrder; }

  function get(id) { return _reviews[id] || { ratings: {}, comments: [] }; }

  function getAvgRating(id) {
    const vals = Object.values(get(id).ratings || {}).filter(v => typeof v === 'number');
    if (!vals.length) return null;
    return Math.round((vals.reduce((a, b) => a + b, 0) / vals.length) * 10) / 10;
  }

  function getUserRating(id, uid) { return (get(id).ratings || {})[uid] || 0; }

  function getComments(id) { return get(id).comments || []; }

  function setRating(id, uid, rating) {
    if (!_reviews[id]) _reviews[id] = { ratings: {}, comments: [] };
    if (!_reviews[id].ratings) _reviews[id].ratings = {};
    _reviews[id].ratings[uid] = rating;
    _save();
  }

  function pushComment(id, comment) {
    if (!_reviews[id]) _reviews[id] = { ratings: {}, comments: [] };
    if (!_reviews[id].comments) _reviews[id].comments = [];
    _reviews[id].comments.push(comment);
    _save();
  }

  return {
    load, setReviews, get, getAvgRating, getUserRating, getComments, setRating, pushComment,
    setCustomRecipes, getCustomRecipes, getCustomRecipeById,
    setCatalogRecipes, getCatalogRecipes, getCatalogRecipeById,
    setIngredients, getIngredients, getIngredientByName, getIngredientById,
    setCategoryOrder, getCategoryOrder,
  };
})();

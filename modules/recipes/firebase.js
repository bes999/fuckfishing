'use strict';

const RecipesFirebase = (() => {

  const COLLECTION = 'recipes_reviews';
  const CUSTOM_COLLECTION = 'recipes_custom';
  const CATALOG_COLLECTION = 'recipes_catalog';
  const INGREDIENTS_COLLECTION = 'ingredients';
  const META_COLLECTION = 'recipes_meta';
  let _unsubscribe = null;
  let _unsubCustom = null;
  let _unsubCatalog = null;
  let _unsubIngredients = null;
  let _unsubCategoryOrder = null;

  // Резолвится один раз, когда пришёл первый снапшот каталога рецептов —
  // Меню и Рецепты читают RecipesData.getCategories() синхронно, так что
  // startApp() (index.html) ждёт это же, что и готовность поездок, прежде
  // чем показывать страницы (см. TripsFirebase.ready() — тот же паттерн).
  let _catalogReadyResolve = null;
  const _catalogReady = new Promise(resolve => { _catalogReadyResolve = resolve; });
  function catalogReady() { return _catalogReady; }

  function subscribe(onUpdate) {
    if (_unsubscribe) _unsubscribe();
    try {
      _unsubscribe = db.collection(COLLECTION)
        .onSnapshot(snap => {
          const reviews = {};
          snap.forEach(doc => { reviews[doc.id] = doc.data(); });
          RecipesState.setReviews(reviews);
          onUpdate();
        }, () => {});
    } catch (_) {}
  }

  function unsubscribe() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  async function saveRating(id, uid, rating) {
    try {
      await db.collection(COLLECTION).doc(id).set(
        { ratings: { [uid]: rating } }, { merge: true }
      );
    } catch (_) {}
  }

  async function addComment(id, comment) {
    try {
      const ref = db.collection(COLLECTION).doc(id);
      await db.runTransaction(async tx => {
        const doc = await tx.get(ref);
        const existing = doc.exists ? (doc.data().comments || []) : [];
        tx.set(ref, { comments: [...existing, comment] }, { merge: true });
      });
    } catch (_) {}
  }

  // --- Свои рецепты — отдельная коллекция от рейтингов/комментариев ---
  function subscribeCustom(onUpdate) {
    if (_unsubCustom) _unsubCustom();
    try {
      _unsubCustom = db.collection(CUSTOM_COLLECTION)
        .onSnapshot(snap => {
          const arr = [];
          snap.forEach(doc => arr.push(Object.assign({ _id: doc.id }, doc.data())));
          RecipesState.setCustomRecipes(arr);
          onUpdate();
        }, () => {});
    } catch (_) {}
  }

  function unsubscribeCustom() {
    if (_unsubCustom) { _unsubCustom(); _unsubCustom = null; }
  }

  async function addRecipe(recipe) {
    const data = Object.assign({}, recipe);
    data.createdBy = window.APP?.user?.uid || null;
    data.createdAt = new Date().toISOString();
    const ref = await db.collection(CUSTOM_COLLECTION).add(data);
    return ref.id;
  }

  async function deleteRecipe(id) {
    await db.collection(CUSTOM_COLLECTION).doc(id).delete();
  }

  async function updateRecipe(id, changes) {
    await db.collection(CUSTOM_COLLECTION).doc(id).update(changes);
  }

  // --- Каталог (бывшие встроенные рецепты из data.js) — тот же жизненный
  // цикл подписки, что и у _custom выше, но отдельная коллекция и без
  // нормализации id (doc.id уже совпадает с исходным recipe.id — важно
  // сохранить, на него ссылаются существующие меню поездок). ---
  function subscribeCatalog(onUpdate) {
    if (_unsubCatalog) _unsubCatalog();
    try {
      _unsubCatalog = db.collection(CATALOG_COLLECTION)
        .onSnapshot(snap => {
          const arr = [];
          snap.forEach(doc => arr.push(Object.assign({ id: doc.id }, doc.data())));
          RecipesState.setCatalogRecipes(arr);
          onUpdate();
          if (_catalogReadyResolve) { _catalogReadyResolve(); _catalogReadyResolve = null; }
        }, () => {
          if (_catalogReadyResolve) { _catalogReadyResolve(); _catalogReadyResolve = null; }
        });
    } catch (_) {}
  }

  function unsubscribeCatalog() {
    if (_unsubCatalog) { _unsubCatalog(); _unsubCatalog = null; }
  }

  async function updateCatalogRecipe(id, changes) {
    await db.collection(CATALOG_COLLECTION).doc(id).update(changes);
  }

  // --- Каталог ингредиентов — единый список "что покупаем" для
  // автодополнения в форме рецепта и резолва категории при пуше в
  // Закупку (см. modules/menu/render.js). ---
  function subscribeIngredients(onUpdate) {
    if (_unsubIngredients) _unsubIngredients();
    try {
      _unsubIngredients = db.collection(INGREDIENTS_COLLECTION)
        .onSnapshot(snap => {
          const arr = [];
          snap.forEach(doc => arr.push(Object.assign({ id: doc.id }, doc.data())));
          RecipesState.setIngredients(arr);
          onUpdate();
        }, () => {});
    } catch (_) {}
  }

  function unsubscribeIngredients() {
    if (_unsubIngredients) { _unsubIngredients(); _unsubIngredients = null; }
  }

  // --- Порядок/видимость вкладок-категорий рецептов — один общий документ
  // (не коллекция), тот же паттерн, что и trip.guideTabs, только не per-trip,
  // а на всю книгу рецептов сразу (см. modules/recipes/data.js:getCategories).
  function subscribeCategoryOrder(onUpdate) {
    if (_unsubCategoryOrder) _unsubCategoryOrder();
    try {
      _unsubCategoryOrder = db.collection(META_COLLECTION).doc('categories')
        .onSnapshot(doc => {
          RecipesState.setCategoryOrder(doc.exists ? (doc.data().order || []) : []);
          onUpdate();
        }, () => {});
    } catch (_) {}
  }

  function unsubscribeCategoryOrder() {
    if (_unsubCategoryOrder) { _unsubCategoryOrder(); _unsubCategoryOrder = null; }
  }

  async function saveCategoryOrder(order) {
    await db.collection(META_COLLECTION).doc('categories').set({ order });
  }

  async function addIngredient({ name, category }) {
    const ref = await db.collection(INGREDIENTS_COLLECTION).add({ name, category: category || null });
    return ref.id;
  }

  // --- Одноразовая миграция посевных данных (modules/recipes/data.js:
  // _getSeedCategories) в Firestore — идемпотентна: если в recipes_catalog
  // уже что-то есть (хоть один документ), считаем миграцию выполненной и
  // ничего не делаем, иначе повторный запуск у другого человека/с другого
  // устройства затирал бы уже сделанные через приложение правки исходными
  // данными. Каталог ингредиентов сеется тем же проходом — по одному
  // уникальному имени на каждый использованный в посевных рецептах
  // ingredient.category. ---
  async function migrateSeedData() {
    const existing = await db.collection(CATALOG_COLLECTION).limit(1).get();
    if (!existing.empty) return { migrated: false };

    const seedCats = RecipesData._getSeedCategories();
    const ingredientMap = new Map(); // name(lower) -> {name, category}
    seedCats.forEach(cat => cat.cocktails.forEach(r => (r.ingredients || []).forEach(ing => {
      const key = ing.name.toLowerCase();
      if (!ingredientMap.has(key)) ingredientMap.set(key, { name: ing.name, category: ing.category || null });
    })));

    const ingredientIdByName = new Map();
    let batch = db.batch();
    let opCount = 0;
    const ingredientsCol = db.collection(INGREDIENTS_COLLECTION);
    for (const { name, category } of ingredientMap.values()) {
      const ref = ingredientsCol.doc();
      batch.set(ref, { name, category });
      ingredientIdByName.set(name.toLowerCase(), ref.id);
      opCount++;
      if (opCount >= 400) { await batch.commit(); batch = db.batch(); opCount = 0; }
    }
    if (opCount > 0) { await batch.commit(); batch = db.batch(); opCount = 0; }

    const catalogCol = db.collection(CATALOG_COLLECTION);
    for (const cat of seedCats) {
      for (const r of cat.cocktails) {
        const ref = catalogCol.doc(r.id);
        const { id, ...data } = r;
        batch.set(ref, Object.assign({}, data, { category: cat.id }));
        opCount++;
        if (opCount >= 400) { await batch.commit(); batch = db.batch(); opCount = 0; }
      }
    }
    if (opCount > 0) await batch.commit();

    return { migrated: true, ingredients: ingredientMap.size, recipes: seedCats.reduce((a, c) => a + c.cocktails.length, 0) };
  }

  // --- Одноразовый бэкфилл ingredientId на существующих ингредиентах
  // рецептов (посевных + своих) — сопоставление по имени (без учёта
  // регистра) против уже засеянного каталога ингредиентов. Новые рецепты
  // и правки существующих проставляют ingredientId сами при сохранении
  // (см. RecipesRender._showRecipeForm), так что это именно "закрыть дыру
  // для того, что уже лежит в Firestore без него" — не постоянный процесс.
  // Гейт через recipes_meta/ingredientIds — иначе каждый старт приложения
  // читал бы целиком обе коллекции рецептов только чтобы убедиться, что
  // делать нечего. Идемпотентно и по самому содержимому (трогает только
  // записи без ingredientId), так что параллельный запуск с двух устройств
  // при первом апдейте ничего не портит, даже если гейт почему-то не сработал. ---
  async function migrateIngredientIds() {
    const marker = db.collection(META_COLLECTION).doc('ingredientIds');
    const markerDoc = await marker.get();
    if (markerDoc.exists) return { migrated: false };

    const ingSnap = await db.collection(INGREDIENTS_COLLECTION).get();
    const byName = new Map();
    ingSnap.forEach(doc => {
      const key = String(doc.data().name || '').trim().toLowerCase();
      if (key && !byName.has(key)) byName.set(key, doc.id);
    });

    let batch = db.batch();
    let opCount = 0;
    let touched = 0;

    async function processCollection(collectionName) {
      const snap = await db.collection(collectionName).get();
      for (const doc of snap.docs) {
        const ings = doc.data().ingredients;
        if (!Array.isArray(ings) || !ings.length) continue;
        let changed = false;
        const next = ings.map(ing => {
          if (ing.ingredientId) return ing;
          const id = byName.get(String(ing.name || '').trim().toLowerCase());
          if (!id) return ing;
          changed = true;
          return Object.assign({}, ing, { ingredientId: id });
        });
        if (!changed) continue;
        batch.update(db.collection(collectionName).doc(doc.id), { ingredients: next });
        touched++;
        opCount++;
        if (opCount >= 400) { await batch.commit(); batch = db.batch(); opCount = 0; }
      }
    }

    await processCollection(CATALOG_COLLECTION);
    await processCollection(CUSTOM_COLLECTION);
    if (opCount > 0) await batch.commit();

    await marker.set({ done: true, touched, at: new Date().toISOString() });
    return { migrated: true, touched };
  }

  return {
    subscribe, unsubscribe, saveRating, addComment,
    subscribeCustom, unsubscribeCustom, addRecipe, deleteRecipe, updateRecipe,
    subscribeCatalog, unsubscribeCatalog, updateCatalogRecipe, catalogReady,
    subscribeIngredients, unsubscribeIngredients, addIngredient,
    subscribeCategoryOrder, unsubscribeCategoryOrder, saveCategoryOrder,
    migrateSeedData, migrateIngredientIds,
  };
})();

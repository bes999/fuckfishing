'use strict';

const RecipesFirebase = (() => {

  const COLLECTION = 'recipes_reviews';
  const CUSTOM_COLLECTION = 'recipes_custom';
  let _unsubscribe = null;
  let _unsubCustom = null;

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

  return {
    subscribe, unsubscribe, saveRating, addComment,
    subscribeCustom, unsubscribeCustom, addRecipe, deleteRecipe,
  };
})();

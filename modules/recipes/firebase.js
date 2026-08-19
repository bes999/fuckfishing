'use strict';

const RecipesFirebase = (() => {

  const COLLECTION = 'recipes_reviews';
  let _unsubscribe = null;

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

  return { subscribe, unsubscribe, saveRating, addComment };
})();

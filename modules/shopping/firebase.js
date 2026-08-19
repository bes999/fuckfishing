'use strict';

const ShoppingFirebase = (() => {

  const COLLECTION = 'shopping';
  let _unsubscribe = null;

  function subscribe(tripId, onUpdate) {
    if (_unsubscribe) _unsubscribe();
    try {
      _unsubscribe = db.collection(COLLECTION).doc(tripId)
        .onSnapshot(snap => {
          if (snap.exists && snap.data().categories) {
            ShoppingState.setFromFirebase(tripId, snap.data().categories);
            onUpdate();
          }
        }, () => {});
    } catch (_) {}
  }

  function unsubscribe() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  async function save(tripId, categories) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ categories }, { merge: true });
    } catch (_) {}
  }

  return { subscribe, unsubscribe, save };
})();

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
            MenuState.setFromFirebase(tripId, snap.data().days);
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

  return { subscribe, unsubscribe, saveDays };
})();

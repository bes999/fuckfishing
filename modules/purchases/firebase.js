'use strict';

// Личный список покупок на поездку — полностью приватный (см.
// firestore.rules: personal_purchases/{uid}/trips/{tripId}, доступ только
// владельцу). Один документ на пару (пользователь, поездка).
const PurchasesFirebase = (() => {

  let _unsub = null;

  function _ref(uid, tripId) {
    return firebase.firestore().collection('personal_purchases').doc(uid)
      .collection('trips').doc(tripId);
  }

  function subscribe(uid, tripId, onUpdate) {
    unsubscribe();
    try {
      _unsub = _ref(uid, tripId).onSnapshot(doc => {
        onUpdate(doc.exists ? (doc.data().items || []) : []);
      }, () => onUpdate([]));
    } catch (_) { onUpdate([]); }
  }

  function unsubscribe() {
    if (_unsub) { _unsub(); _unsub = null; }
  }

  async function save(uid, tripId, items) {
    await _ref(uid, tripId).set({ items });
  }

  return { subscribe, unsubscribe, save };
})();

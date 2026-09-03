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
            ShoppingState.setFromFirebase(tripId, snap.data().categories, snap.data().bought || {});
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

  // Отдельное узкое поле для "куплено" — в магазине несколько человек
  // отмечают разные позиции у себя на телефоне одновременно; save()
  // выше перезаписывает ВЕСЬ categories целиком, и если два таких сохранения
  // приходят почти одновременно, второе тихо стирает отметку из первого
  // (Firestore merge:true не мёржит содержимое массивов). Firestore САМ
  // мёржит вложенные map-поля при merge:true, так что запись одного ключа
  // никогда не задевает отметки остальных позиций.
  async function saveBought(tripId, itemId, value) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ bought: { [itemId]: value } }, { merge: true });
    } catch (_) {}
  }

  return { subscribe, unsubscribe, save, saveBought };
})();

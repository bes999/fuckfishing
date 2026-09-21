'use strict';

const ShoppingFirebase = (() => {

  const COLLECTION = 'shopping';
  let _unsubscribe = null;

  function subscribe(tripId, onUpdate) {
    if (_unsubscribe) _unsubscribe();
    try {
      _unsubscribe = db.collection(COLLECTION).doc(tripId)
        .onSnapshot(snap => {
          // exists-check без require на categories: раньше без него
          // "Первый день" не долетал бы до onUpdate, если в документе
          // ещё нет ни одной обычной категории (частый случай — список
          // на первый день начинают заполнять раньше, чем основной).
          if (snap.exists) {
            ShoppingState.setFromFirebase(tripId, snap.data().categories || [], snap.data().bought || {}, snap.data().dayOneItems || []);
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

  // "Первый день" — отдельный от categories массив, свой же полный
  // ресейв на структурные правки (add/remove/rename), как save() выше
  // для categories. Список из считанных позиций, заполняется разово
  // перед выездом, а не во время одновременного шопинга в магазине —
  // тот самый риск гонки, из-за которого bought вынесли в saveBought,
  // тут ощутимо ниже, отдельного узкого поля пока не заводим.
  async function saveDayOne(tripId, dayOneItems) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ dayOneItems }, { merge: true });
    } catch (_) {}
  }

  return { subscribe, unsubscribe, save, saveBought, saveDayOne };
})();

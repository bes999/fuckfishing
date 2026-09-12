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
            MenuState.setFromFirebase(tripId, snap.data().days, snap.data().slotItems || {}, snap.data().mealDuty || {});
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

  // Отдельное узкое поле для конкретной позиции — та же гонка, что была в
  // Закупке: несколько человек одновременно выбирают разные блюда в разные
  // слоты, а saveDays() выше перезаписывает ВЕСЬ days целиком, так что
  // второе почти одновременное сохранение тихо стирает выбор из первого.
  // slot.id уже глобально уникален в пределах поездки (см. MenuState.addSlot),
  // так что плоская мапа по нему безопасна — Firestore мёржит вложенные
  // map-поля при merge:true, запись одного ключа не задевает остальные.
  async function saveSlotItem(tripId, slotId, item) {
    try {
      await db.collection(COLLECTION).doc(tripId).set({ slotItems: { [slotId]: item } }, { merge: true });
    } catch (_) {}
  }

  // Дежурство на приём пищи — та же узкая map-запись, что slotItems выше,
  // ключ day_meal (уникален в пределах поездки, оба id детерминированы:
  // day.id = day_YYYY-MM-DD, meal.id — один из фиксированных 4).
  async function saveMealDuty(tripId, dayId, mealId, duty) {
    try {
      const key = dayId + '_' + mealId;
      await db.collection(COLLECTION).doc(tripId).set({ mealDuty: { [key]: duty } }, { merge: true });
    } catch (_) {}
  }

  return { subscribe, unsubscribe, saveDays, saveSlotItem, saveMealDuty };
})();

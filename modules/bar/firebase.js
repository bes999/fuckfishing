'use strict';

const BarFirebase = (() => {

  const COLLECTION = 'bar_reviews';
  let _unsubscribe = null;

  // Подписка на реалтайм-обновления
  function subscribe(onUpdate) {
    if (_unsubscribe) _unsubscribe();
    try {
      _unsubscribe = db.collection(COLLECTION)
        .onSnapshot(snap => {
          const reviews = {};
          snap.forEach(doc => { reviews[doc.id] = doc.data(); });
          BarState.setReviews(reviews);
          onUpdate();
        }, () => {
          // Офлайн — тихо падаем, работаем с кешем
        });
    } catch (_) {}
  }

  function unsubscribe() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  // Ошибку не глотаем (было раньше, .catch(_){}) — вызывающий код
  // (modules/bar/render.js) не мог понять, что запись не удалась, и
  // показывал заметку/оценку как сохранённую, даже когда она никуда не
  // попала. Реальный баг, найден внешним ревью 2026-09-27.

  // Сохранить оценку
  async function saveRating(cocktailId, uid, rating) {
    await db.collection(COLLECTION).doc(cocktailId).set({
      ratings: { [uid]: rating }
    }, { merge: true }).catch(e => { console.warn('saveRating:', e); throw e; });
  }

  // Добавить комментарий
  async function addComment(cocktailId, comment) {
    const ref = db.collection(COLLECTION).doc(cocktailId);
    await db.runTransaction(async tx => {
      const doc = await tx.get(ref);
      const existing = doc.exists ? (doc.data().comments || []) : [];
      tx.set(ref, { comments: [...existing, comment] }, { merge: true });
    }).catch(e => { console.warn('addComment:', e); throw e; });
  }

  return { subscribe, unsubscribe, saveRating, addComment };
})();

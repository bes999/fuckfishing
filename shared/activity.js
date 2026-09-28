'use strict';

/* =========================================================
   ActivityLog — лента «Что нового» в поездке
   =========================================================
   trips/{tripId}/activity/{autoId}: { at, uid, name, kind, text }
   Пишут модули в момент ДОБАВЛЕНИЯ чего-то заметного (позиция закупки,
   расход, улов, блюдо, заметка, место, общая снаряга, новый участник).
   Правки и удаления в ленту не пишем — шум. Запись «пожарная»: ошибка
   ленты никогда не ломает основное действие.

   ActivityLog.add(tripId, kind, text)   — kind: 'shopping'|'expense'|
     'catch'|'menu'|'note'|'place'|'gear'|'member'|'trip'
   ActivityLog.listen(tripId, cb, limit) → unsubscribe; cb(items[])
   ActivityLog.icon(kind) → имя иконки для UIUtils.ico
   ActivityLog.ago(ts)    → «5 мин назад / вчера / 12 сен»
   ========================================================= */
const ActivityLog = (() => {

  const ICONS = {
    shopping: 'shopping-cart', expense: 'cash', catch: 'fishing', menu: 'tools-kitchen-2',
    note: 'notes', place: 'map-pin', gear: 'backpack', member: 'users', trip: 'calendar',
  };

  function _col(tripId) {
    return firebase.firestore().collection('trips').doc(tripId).collection('activity');
  }

  // Имя в этой поездке (ник участника по uid), иначе имя профиля.
  function _myName(tripId) {
    const uid = window.APP?.user?.uid;
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(tripId) : null;
    const p = uid && (trip?.participants || []).find(x => x && x.uid === uid);
    return p?.name || window.APP?.profile?.displayName || 'Кто-то';
  }

  function add(tripId, kind, text, extra) {
    try {
      const uid = window.APP?.user?.uid;
      if (!tripId || !uid || !text) return;
      _col(tripId).add(Object.assign({
        at: firebase.firestore.FieldValue.serverTimestamp(),
        uid, name: _myName(tripId), kind: kind || 'trip', text: String(text).slice(0, 200),
      }, extra || {})).catch(() => {});
    } catch (_) {}
  }

  // Удалить записи ленты, привязанные к конкретной заметке (extra.noteId у
  // add() выше) — заметка стала приватной или удалена, её превью в общей
  // ленте не должно продолжать светиться остальным участникам в обход
  // приватности. Пишет и чистит только сам автор (rules: activity.delete
  // разрешает self-uid) — add() всегда пишет от своего uid, так что это и
  // есть автор заметки. Реальный баг, найден внешним ревью 2026-09-27.
  function removeByNote(tripId, noteId) {
    if (!tripId || !noteId) return;
    const uid = window.APP?.user?.uid;
    if (!uid) return;
    _col(tripId).where('noteId', '==', noteId).where('uid', '==', uid).get()
      .then(snap => Promise.all(snap.docs.map(d => d.ref.delete())))
      .catch(() => {});
  }

  function listen(tripId, cb, limit) {
    if (!tripId) return () => {};
    return _col(tripId).orderBy('at', 'desc').limit(limit || 15)
      .onSnapshot(snap => {
        cb(snap.docs.map(d => ({ id: d.id, ...d.data() })));
      }, () => cb([]));
  }

  function icon(kind) { return ICONS[kind] || 'bell'; }

  function ago(ts) {
    const d = ts?.toDate ? ts.toDate() : (ts ? new Date(ts) : new Date());
    const s = Math.max(0, (Date.now() - d.getTime()) / 1000);
    if (s < 60) return 'только что';
    if (s < 3600) return Math.floor(s / 60) + ' мин назад';
    if (s < 86400) return Math.floor(s / 3600) + ' ч назад';
    if (s < 172800) return 'вчера';
    return d.getDate() + ' ' + ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'][d.getMonth()];
  }

  return { add, listen, icon, ago, removeByNote };
})();

'use strict';
/* globals db, firebase */

const GearData = (() => {

  // Без fallback на локальный кэш: save() ниже перезаписывает все три поля
  // целиком, так что если сюда подставить устаревший/неполный кэш вместо
  // реального документа, следующее же сохранение молча затрёт настоящие
  // данные на сервере (так один раз стёрло 58 предметов после сетевого
  // сбоя). Лучше явно упасть и дать пользователю попробовать снова.
  async function load(uid) {
    const doc = await db.collection('members').doc(uid).get();
    const d = doc.exists ? doc.data() : {};
    return {
      locations:  d.gearLocations  || [],
      categories: d.gearCategories || [],
      items:      d.gearItems      || []
    };
  }

  async function save(uid, template) {
    await db.collection('members').doc(uid).update({
      gearLocations:  template.locations,
      gearCategories: template.categories,
      gearItems:      template.items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) {
      console.error('GearData.save: не удалось сохранить снаряжение', err);
      throw err;
    });
  }

  /* ── Списки снаряги по поездкам (Firestore, gear_trip_snapshots) ──
     Кэш в памяти на пользователя — читается синхронно всеми остальными
     функциями ниже, наполняется один раз через ensureLoaded(uid). Видно
     всем участникам (read: isMember()), редактирует только владелец. */
  let _snapshots  = {};   // { tripId: {uid, tripId, tripName, locations, categories, items, checked} }
  let _loadedForUid = null;
  let _loadPromise  = null;

  function _docId(uid, tripId) { return uid + '_' + tripId; }

  function ensureLoaded(uid) {
    if (_loadedForUid === uid) return _loadPromise;
    _loadedForUid = uid;
    _loadPromise = db.collection('gear_trip_snapshots').where('uid', '==', uid).get()
      .then(snap => {
        _snapshots = {};
        snap.forEach(doc => { _snapshots[doc.data().tripId] = doc.data(); });
      })
      .catch(err => {
        console.error('GearData.ensureLoaded: не удалось загрузить списки поездок', err);
        _snapshots = {};
      });
    return _loadPromise;
  }

  /* ── Чекбоксы поездки ── */
  function getChecked(uid, tripId) {
    return (_snapshots[tripId] && _snapshots[tripId].checked) || [];
  }

  async function setChecked(uid, tripId, ids) {
    if (_snapshots[tripId]) _snapshots[tripId].checked = ids;
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checked: ids }, { merge: true })
      .catch(err => console.error('GearData.setChecked:', err));
  }

  /* ── Снимок списка для поездки ── */
  function getTripSnapshot(uid, tripId) {
    return _snapshots[tripId] || null;
  }

  async function saveTripSnapshot(uid, tripId, tripName, template) {
    const snap = {
      uid, tripId, tripName,
      locations:  template.locations  || [],
      categories: template.categories || [],
      items:      template.items      || [],
      checked:    [],
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId)).set(snap);
    _snapshots[tripId] = snap;
    return snap;
  }

  function getTripList(uid) {
    return Object.values(_snapshots).map(s => ({ id: s.tripId, name: s.tripName }));
  }

  function hasTripSnapshot(tripId) {
    return !!_snapshots[tripId];
  }

  /* ── Обновить личный список поездки из актуального шаблона ──
     В отличие от saveTripSnapshot (полная замена + сброс checked), это
     ДОБАВЛЯЕТ новые категории/предметы из шаблона, не трогая то, что уже
     есть в списке поездки — ни пользовательские правки, ни отметки "взял".
     Места сюда не входят: они теперь отдельный каталог ("Мои места"), не
     привязанный к вещам шаблона — какие места едут в поездку решается
     явно при сборе списка, синк их не трогает. Безопасно жать сколько
     угодно раз. */
  async function syncTripFromTemplate(uid, tripId, template) {
    const snap = _snapshots[tripId];
    if (!snap) return null;

    const existingCatIds = new Set(snap.categories.map(c => c.id));
    const newCategories = (template.categories || []).filter(c => !existingCatIds.has(c.id));

    const existingItemIds = new Set(snap.items.map(i => i.id));
    const newItems = (template.items || []).filter(i => !existingItemIds.has(i.id));

    snap.categories = snap.categories.concat(newCategories);
    snap.items      = snap.items.concat(newItems);

    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId)).set({
      categories: snap.categories, items: snap.items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }, { merge: true });

    return { categories: newCategories.length, items: newItems.length };
  }

  /* ── Узкое обновление предметов личного списка поездки ──
     Не трогает locations/categories/checked — используется, например,
     когда меняешь место хранения у конкретной вещи прямо внутри поездки. */
  async function updateTripSnapshotItems(uid, tripId, items) {
    const snap = _snapshots[tripId];
    if (snap) snap.items = items;
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ items, updatedAt: firebase.firestore.FieldValue.serverTimestamp() }, { merge: true });
  }

  /* ── Общий (групповой) список снаряги на поездку ──
     Один документ на tripId (без uid) — в отличие от личных списков выше,
     это совместный список: правит любой участник поездки, как Меню или
     Закупки. Кэш в памяти на поездку. */
  let _shared = {}; // { tripId: {tripId, tripName, categories, items, checked, updatedAt} }

  async function loadShared(tripId) {
    const doc = await db.collection('gear_trip_shared').doc(tripId).get();
    _shared[tripId] = doc.exists ? doc.data() : { tripId, categories: [], items: [], checked: [] };
    _sharedBase[tripId] = _snapBase(_shared[tripId]);
    return _shared[tripId];
  }

  function getShared(tripId) {
    return _shared[tripId] || null;
  }

  // Общий список правят все участники, а подписки на документ нет — поэтому
  // пишем не свой массив целиком (затирало чужие правки, сделанные после
  // того, как у нас открылась вкладка), а трёхстороннее слияние по id в
  // транзакции: свежая серверная версия + только то, что поменяли мы
  // относительно последней загруженной/сохранённой копии (_sharedBase).
  const _sharedBase = {}; // { tripId: {categories:{id:json}, items:{id:json}} }
  function _snapBase(d) {
    const m = arr => Object.fromEntries((arr || []).map(x => [x.id, JSON.stringify(x)]));
    return { categories: m(d?.categories), items: m(d?.items) };
  }
  function _merge3(server, local, base) {
    const localById = new Map((local || []).map(x => [x.id, x]));
    const out = [];
    (server || []).forEach(x => {
      const mine = localById.get(x.id);
      if (mine) { out.push(JSON.stringify(mine) !== base[x.id] ? mine : x); localById.delete(x.id); }
      else if (!(x.id in base)) out.push(x);   // добавили другие — оставляем
      // было у нас в базе и мы удалили — не возвращаем
    });
    localById.forEach((x, id) => { if (!(id in base)) out.push(x); }); // добавили мы
    return out;
  }

  async function saveShared(tripId, tripName, categories, items) {
    const ref = db.collection('gear_trip_shared').doc(tripId);
    const base = _sharedBase[tripId] || { categories: {}, items: {} };
    const merged = await db.runTransaction(async tx => {
      const snap = await tx.get(ref);
      const server = snap.exists ? snap.data() : {};
      const res = {
        categories: _merge3(server.categories, categories, base.categories),
        items:      _merge3(server.items, items, base.items),
      };
      tx.set(ref, {
        tripId, tripName, categories: res.categories, items: res.items,
        updatedAt: firebase.firestore.FieldValue.serverTimestamp()
      }, { merge: true });
      return res;
    });
    if (!_shared[tripId]) _shared[tripId] = { tripId, checked: [] };
    _shared[tripId].categories = merged.categories;
    _shared[tripId].items = merged.items;
    _sharedBase[tripId] = _snapBase(_shared[tripId]);
  }

  async function setSharedChecked(tripId, ids) {
    if (_shared[tripId]) _shared[tripId].checked = ids;
    await db.collection('gear_trip_shared').doc(tripId)
      .set({ checked: ids }, { merge: true })
      .catch(err => console.error('GearData.setSharedChecked:', err));
  }

  // Точечные отметки общего списка — arrayUnion/arrayRemove, а не весь
  // массив: иначе одновременная галочка другого участника пропадала.
  async function markSharedChecked(tripId, ids, on) {
    if (!ids || !ids.length) return;
    const FV = firebase.firestore.FieldValue;
    await db.collection('gear_trip_shared').doc(tripId)
      .set({ checked: on ? FV.arrayUnion(...ids) : FV.arrayRemove(...ids) }, { merge: true })
      .catch(err => console.error('GearData.markSharedChecked:', err));
  }

  /* ── Генератор ID ── */
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    load, save,
    ensureLoaded, getChecked, setChecked, getTripSnapshot, saveTripSnapshot, getTripList, hasTripSnapshot,
    syncTripFromTemplate, updateTripSnapshotItems,
    loadShared, getShared, saveShared, setSharedChecked, markSharedChecked,
    uid,
  };
})();

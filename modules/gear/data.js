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
     Кэш в памяти НА ПОЛЬЗОВАТЕЛЯ (не общий!) — читается синхронно всеми
     остальными функциями ниже, наполняется через ensureLoaded(uid). Видно
     всем участникам (read: isMember()), редактирует только владелец — эта
     же страница может смотреть снаряжение РАЗНЫХ людей по очереди (своё,
     потом чей-то ещё, см. GearModule.init(uid, isMe, ...)). Раньше кэш был
     ОДИН на всех и ensureLoaded держал единственный _loadedForUid: если
     загрузка A задерживалась, а тем временем открывали список Б,
     запоздавший ответ A перезаписывал общий кэш поверх уже показанного Б —
     а повторный ensureLoaded(Б) ничего не чинил, потому что код уже считал
     Б "загруженным" (_loadedForUid стоял в 'Б', хотя данные там были от A).
     Реальный баг, найден внешним ревью 2026-09-27. Теперь кэш и трекер
     загрузки — по uid: у ответа A просто нет доступа к слоту Б, значения
     физически не могут перепутаться. */
  let _snapshots    = {};   // { uid: { tripId: {uid, tripId, tripName, locations, categories, items, checked} } }
  let _loadedForUid = {};   // { uid: true } — кэш для этого uid валиден
  let _loadPromises = {};   // { uid: Promise } — загрузка в процессе

  function _docId(uid, tripId) { return uid + '_' + tripId; }
  function _forUid(uid) { return _snapshots[uid] || (_snapshots[uid] = {}); }

  function ensureLoaded(uid) {
    if (_loadedForUid[uid]) return Promise.resolve();
    if (_loadPromises[uid]) return _loadPromises[uid];
    const promise = db.collection('gear_trip_snapshots').where('uid', '==', uid).get()
      .then(snap => {
        const forUid = {};
        snap.forEach(doc => { forUid[doc.data().tripId] = doc.data(); });
        _snapshots[uid] = forUid;
        _loadedForUid[uid] = true;
      })
      .catch(err => {
        console.error('GearData.ensureLoaded: не удалось загрузить списки поездок', err);
        // Не помечаем uid загруженным — следующий ensureLoaded(uid) честно
        // попробует снова, а не тихо вернёт пустоту навсегда.
      })
      .finally(() => { delete _loadPromises[uid]; });
    _loadPromises[uid] = promise;
    return promise;
  }

  /* ── Чекбоксы поездки ── */
  function getChecked(uid, tripId) {
    const s = _forUid(uid)[tripId];
    return (s && s.checked) || [];
  }

  async function setChecked(uid, tripId, ids) {
    const s = _forUid(uid)[tripId];
    if (s) s.checked = ids;
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checked: ids }, { merge: true })
      .catch(err => console.error('GearData.setChecked:', err));
  }

  // Точечная отметка (вкл/выкл конкретных id), а не вся отметка целиком.
  // Личный список поездки не подписан на живые обновления (загружается
  // один раз в ensureLoaded) — если поставить/снять отметку на телефоне, а
  // потом на ноутбуке с ещё не обновившимся кэшем (или наоборот), setChecked
  // выше перезаписывает checked ЦЕЛИКОМ по устаревшей локальной копии, и
  // отметка с другого устройства пропадает. arrayUnion/arrayRemove трогают
  // только конкретные id — тот же приём, что уже есть у общего списка
  // (markSharedChecked). Реальный баг, найден внешним ревью 2026-09-27.
  async function markChecked(uid, tripId, ids, on) {
    if (!ids || !ids.length) return;
    const FV = firebase.firestore.FieldValue;
    const s = _forUid(uid)[tripId];
    if (s) {
      const cur = new Set(s.checked || []);
      ids.forEach(id => on ? cur.add(id) : cur.delete(id));
      s.checked = Array.from(cur);
    }
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checked: on ? FV.arrayUnion(...ids) : FV.arrayRemove(...ids) }, { merge: true })
      .catch(err => console.error('GearData.markChecked:', err));
  }

  /* ── Чекбоксы обратного пути — отдельное узкое поле, не трогает checked.
     Нужны, чтобы перед отъездом с места проверить, что ничего не забыли,
     не сбрасывая отметки "взял с собой" по дороге туда. ── */
  function getCheckedBack(uid, tripId) {
    const s = _forUid(uid)[tripId];
    return (s && s.checkedBack) || [];
  }

  async function setCheckedBack(uid, tripId, ids) {
    const s = _forUid(uid)[tripId];
    if (s) s.checkedBack = ids;
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checkedBack: ids }, { merge: true })
      .catch(err => console.error('GearData.setCheckedBack:', err));
  }

  // Точечная отметка «Обратно» — та же причина и приём, что у markChecked.
  async function markCheckedBack(uid, tripId, ids, on) {
    if (!ids || !ids.length) return;
    const FV = firebase.firestore.FieldValue;
    const s = _forUid(uid)[tripId];
    if (s) {
      const cur = new Set(s.checkedBack || []);
      ids.forEach(id => on ? cur.add(id) : cur.delete(id));
      s.checkedBack = Array.from(cur);
    }
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checkedBack: on ? FV.arrayUnion(...ids) : FV.arrayRemove(...ids) }, { merge: true })
      .catch(err => console.error('GearData.markCheckedBack:', err));
  }

  /* ── Снимок списка для поездки ── */
  function getTripSnapshot(uid, tripId) {
    return _forUid(uid)[tripId] || null;
  }

  async function saveTripSnapshot(uid, tripId, tripName, template) {
    // JSON-клон — createTripList выше нередко строит template прямо из
    // закэшированного снимка ДРУГОЙ поездки (GearData.getTripSnapshot),
    // то есть locations/categories/items были бы ТЕМИ ЖЕ массивами и
    // объектами вещей, что и в снимке-источнике. Без клона правка вещи
    // (например, смена сумки) в одной поездке молча меняла тот же объект
    // и в другой — до следующего сохранения это видно только на экране, а
    // после могло утечь и в Firestore. Реальный баг, найден внешним ревью
    // 2026-09-27.
    const snap = {
      uid, tripId, tripName,
      locations:  JSON.parse(JSON.stringify(template.locations  || [])),
      categories: JSON.parse(JSON.stringify(template.categories || [])),
      items:      JSON.parse(JSON.stringify(template.items      || [])),
      checked:    [],
      checkedBack: [],
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId)).set(snap);
    _forUid(uid)[tripId] = snap;
    return snap;
  }

  function getTripList(uid) {
    return Object.values(_forUid(uid)).map(s => ({ id: s.tripId, name: s.tripName }));
  }

  function hasTripSnapshot(uid, tripId) {
    return !!_forUid(uid)[tripId];
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
    const snap = _forUid(uid)[tripId];
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
    const snap = _forUid(uid)[tripId];
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
    _shared[tripId] = doc.exists ? doc.data() : { tripId, categories: [], items: [], checked: [], ready: {} };
    _sharedBase[tripId] = _snapBase(_shared[tripId]);
    return _shared[tripId];
  }

  function getShared(tripId) {
    return _shared[tripId] || null;
  }

  /* ── «Я собран» — gear_trip_shared/{tripId}.ready = { [uid]: true|false }.
     Общая договорённость между модулями (см. BRIEF2) — узкая запись, не
     трогает categories/items/checked. Видно всем участникам, в т.ч. в
     чужой снаряге на просмотр. ── */
  function getReady(tripId) {
    return (_shared[tripId] && _shared[tripId].ready) || {};
  }

  async function setReady(tripId, uid, val) {
    if (!_shared[tripId]) _shared[tripId] = { tripId, categories: [], items: [], checked: [], ready: {} };
    if (!_shared[tripId].ready) _shared[tripId].ready = {};
    _shared[tripId].ready[uid] = val;
    await db.collection('gear_trip_shared').doc(tripId)
      .set({ ready: { [uid]: val } }, { merge: true })
      .catch(err => console.error('GearData.setReady:', err));
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
    ensureLoaded, getChecked, setChecked, markChecked, getCheckedBack, setCheckedBack, markCheckedBack,
    getTripSnapshot, saveTripSnapshot, getTripList, hasTripSnapshot,
    syncTripFromTemplate, updateTripSnapshotItems,
    loadShared, getShared, saveShared, setSharedChecked, markSharedChecked,
    getReady, setReady,
    uid,
  };
})();

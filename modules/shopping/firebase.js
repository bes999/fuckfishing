'use strict';

const ShoppingFirebase = (() => {

  const COLLECTION = 'shopping';
  let _unsubscribe = null;

  // save() ниже писал categories ЦЕЛИКОМ из того, что в этот момент лежит
  // в ShoppingState — а экран рисуется из ЛОКАЛЬНОГО кэша ДО того, как
  // подписка успевает доставить первый настоящий снапшот (см. ShoppingIndex.
  // show — рендер и subscribe идут одной строкой, без ожидания). На
  // медленной связи это окно — секунды: что-то добавить или нажать
  // "Стандартный список" именно в этот момент значит собрать и записать
  // ВЕСЬ categories по устаревшей (или вовсе пустой) локальной копии,
  // стерев то, что реально лежит на сервере (в т.ч. добавленное другими).
  // Реальный баг, найден внешним ревью 2026-09-30. Трёхстороннее слияние —
  // тот же приём, что у общего списка снаряги (GearData.saveShared) и
  // категорий расходов (ExpensesFirebase.saveCategories): пишем не свою
  // копию как есть, а разницу относительно последней ВИДЕННОЙ версии
  // (_catBase, обновляется и после своих сохранений, и на каждый живой
  // снапшот) поверх того, что реально сейчас на сервере — окно гонки
  // просто перестаёт быть опасным, не только более коротким.
  const _catBase = {}; // { tripId: { cats: {id:json}, items: {id:json} } }
  function _flattenItems(categories) {
    const out = [];
    (categories || []).forEach(c => (c.items || []).forEach(i => out.push(Object.assign({}, i, { catId: c.id }))));
    return out;
  }
  function _snapBase(categories) {
    const cats = {};
    (categories || []).forEach(c => { cats[c.id] = JSON.stringify({ id: c.id, title: c.title, icon: c.icon }); });
    const items = {};
    _flattenItems(categories).forEach(i => { items[i.id] = JSON.stringify(i); });
    return { cats, items };
  }
  // Общий 3-сторонний мёрж по id — сервер vs локальное vs то, что было в
  // базе на момент последнего "видели оба". Не изменилось у нас с базы —
  // берём серверную версию (её мог поменять кто-то другой); изменилось —
  // берём нашу; было в базе, а у нас (в local) больше нет — удалили,
  // не возвращаем; появилось у server, чего не было в базе — добавили
  // другие, оставляем; появилось у нас, чего нет в базе — наше новое.
  function _merge3(serverArr, localArr, baseMap) {
    const localById = new Map((localArr || []).map(x => [x.id, x]));
    const out = [];
    (serverArr || []).forEach(x => {
      const mine = localById.get(x.id);
      if (mine) { out.push(JSON.stringify(mine) !== baseMap[x.id] ? mine : x); localById.delete(x.id); }
      else if (!(x.id in baseMap)) out.push(x);
    });
    localById.forEach((x, id) => { if (!(id in baseMap)) out.push(x); });
    return out;
  }

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
            const cats = snap.data().categories || [];
            _catBase[tripId] = _snapBase(cats);
            ShoppingState.setFromFirebase(tripId, cats, snap.data().bought || {}, snap.data().dayOneItems || []);
            onUpdate();
          }
        }, () => {});
    } catch (_) {}
  }

  function unsubscribe() {
    if (_unsubscribe) { _unsubscribe(); _unsubscribe = null; }
  }

  async function save(tripId, categories) {
    const ref = db.collection(COLLECTION).doc(tripId);
    const base = _catBase[tripId] || { cats: {}, items: {} };
    const localCatsMeta = (categories || []).map(c => ({ id: c.id, title: c.title, icon: c.icon }));
    const localItemsFlat = _flattenItems(categories);
    try {
      const merged = await db.runTransaction(async tx => {
        const snap = await tx.get(ref);
        const serverCats = (snap.exists && Array.isArray(snap.data().categories)) ? snap.data().categories : [];
        const serverCatsMeta = serverCats.map(c => ({ id: c.id, title: c.title, icon: c.icon }));
        const serverItemsFlat = _flattenItems(serverCats);

        const mergedCatsMeta = _merge3(serverCatsMeta, localCatsMeta, base.cats);
        const mergedItemsFlat = _merge3(serverItemsFlat, localItemsFlat, base.items);

        const byCatId = new Map(mergedCatsMeta.map(c => [c.id, { id: c.id, title: c.title, icon: c.icon, items: [] }]));
        mergedItemsFlat.forEach(i => {
          const cat = byCatId.get(i.catId);
          if (!cat) return; // категорию, в которую он лежал, удалили этим же слиянием
          const item = Object.assign({}, i);
          delete item.catId;
          cat.items.push(item);
        });
        const result = [...byCatId.values()];
        tx.set(ref, { categories: result }, { merge: true });
        return result;
      });
      _catBase[tripId] = _snapBase(merged);
      if (typeof ShoppingState !== 'undefined') ShoppingState.setFromFirebase(tripId, merged, null, null);
    } catch (e) { console.warn('shopping save:', e); }
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

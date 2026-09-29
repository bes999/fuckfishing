'use strict';

const ExpensesFirebase = (() => {

  let _unsubExpenses    = null;
  let _unsubSettlements = null;
  let _unsubBudget      = null;

  function _ref(tripId) {
    return firebase.firestore().collection('trips').doc(tripId);
  }

  // ── Realtime listeners ───────────────────────────────────────

  function listen(tripId, onExpenses, onSettlements) {
    stopListening();

    _unsubExpenses = _ref(tripId).collection('expenses')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(ExpensesData.normalizeExpense(doc.data(), doc.id)));
        onExpenses(arr);
      }, err => console.warn('expenses listen:', err));

    _unsubSettlements = _ref(tripId).collection('settlements')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(ExpensesData.normalizeSettlement(doc.data(), doc.id)));
        onSettlements(arr);
      }, err => console.warn('settlements listen:', err));
  }

  // «Бюджет до поездки» — своя подписка (не завязана на listen() выше,
  // чтобы не трогать существующий поток расходов/погашений).
  function listenBudget(tripId, onBudget) {
    if (_unsubBudget) { _unsubBudget(); _unsubBudget = null; }
    _unsubBudget = _ref(tripId).collection('budget')
      .orderBy('createdAt', 'desc')
      .onSnapshot(snap => {
        const arr = [];
        snap.forEach(doc => arr.push(ExpensesData.normalizeBudgetLine(doc.data(), doc.id)));
        onBudget(arr);
      }, err => console.warn('budget listen:', err));
  }

  function stopListening() {
    if (_unsubExpenses)    { _unsubExpenses();    _unsubExpenses    = null; }
    if (_unsubSettlements) { _unsubSettlements(); _unsubSettlements = null; }
    if (_unsubBudget)      { _unsubBudget();      _unsubBudget      = null; }
  }

  // Разовое чтение без подписки — для обложки завершённой поездки, чтобы
  // не обрывать уже идущую (если есть) подписку страницы Расходы.
  function getOnce(tripId) {
    return Promise.all([
      _ref(tripId).collection('expenses').orderBy('createdAt', 'desc').get(),
      _ref(tripId).collection('settlements').orderBy('createdAt', 'desc').get()
    ]).then(([expSnap, settleSnap]) => {
      const expenses = [];
      expSnap.forEach(doc => expenses.push(ExpensesData.normalizeExpense(doc.data(), doc.id)));
      const settlements = [];
      settleSnap.forEach(doc => settlements.push(ExpensesData.normalizeSettlement(doc.data(), doc.id)));
      return { expenses, settlements };
    }).catch(e => { console.warn('expenses getOnce:', e); return { expenses: [], settlements: [] }; });
  }

  // ── Expenses ─────────────────────────────────────────────────

  // ВАЖНО: ошибку не глотаем здесь — .catch(console.warn) без re-throw
  // делает промис успешным даже при отказе записи, и вызывающий код (форма
  // расхода) не может понять, что сохранение не удалось. Логируем и
  // пробрасываем дальше, чтобы UI мог показать это пользователю. Реальный
  // баг (форма закрывалась как будто всё ок), найден внешним ревью 2026-09-27.
  function addExpense(tripId, entry) {
    const data = Object.assign({}, entry);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    data.createdBy = window.APP?.user?.uid || null;
    return _ref(tripId).collection('expenses').add(data)
      .then(ref => ref.id)
      .catch(e => { console.warn('addExpense:', e); throw e; });
  }

  // .set(patch,{merge:true}) (было раньше) МОЛЧА СОЗДАЁТ документ, если его
  // уже нет — а его может не быть, если кто-то удалил этот расход, пока мы
  // держали открытой форму редактирования: "Сохранить" тогда не обновлял
  // существующую запись, а воскрешал новую, неполную (только поля из patch,
  // без createdBy/createdAt и т.п.). .update() — наоборот, падает с
  // not-found, если документа нет, и это отличие используется ниже (см.
  // render.js), чтобы показать "запись уже удалена", а не общий "не
  // удалось сохранить". Реальный баг, найден внешним ревью 2026-09-27.
  function updateExpense(tripId, id, patch) {
    return _ref(tripId).collection('expenses').doc(id)
      .update(patch)
      .catch(e => { console.warn('updateExpense:', e); throw e; });
  }

  function deleteExpense(tripId, id) {
    return _ref(tripId).collection('expenses').doc(id)
      .delete()
      .catch(e => console.warn('deleteExpense:', e));
  }

  // ── Settlements ──────────────────────────────────────────────

  // Не глотаем ошибку (было раньше) — см. addExpense выше, тот же баг:
  // форма погашения закрывалась и считала долг погашенным локально, даже
  // если запись в Firestore не удалась. Реальный баг, найден внешним ревью
  // 2026-09-27.
  //
  // entry._id — стабильный id, сгенерированный ОДИН РАЗ при открытии формы
  // погашения (см. modules/expenses/render.js _showSettleForm), а не
  // случайный от .add() (было раньше). Пишем именно по нему: повторный
  // вызов с тем же id (двойной клик — защита на кнопке через withBusyButton
  // не единственная линия обороны) просто перезапишет ТОТ ЖЕ документ, а не
  // создаст второй платёж. Реальный баг (двойной клик по «Деньги дошли»
  // создавал два погашения), найден внешним ревью 2026-09-27. Сумма ≤ 0 не
  // пишется вовсе — проверяется и в форме, но дублируем здесь на случай
  // прямого вызова в обход UI.
  function addSettlement(tripId, entry) {
    if (!(parseFloat(entry?.amount) > 0)) return Promise.reject(new Error('settlement amount must be positive'));
    const data = Object.assign({}, entry);
    const id = data._id;
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    const ref = id ? _ref(tripId).collection('settlements').doc(id) : _ref(tripId).collection('settlements').doc();
    return ref.set(data)
      .then(() => ref.id)
      .catch(e => { console.warn('addSettlement:', e); throw e; });
  }

  function deleteSettlement(tripId, id) {
    return _ref(tripId).collection('settlements').doc(id)
      .delete()
      .catch(e => console.warn('deleteSettlement:', e));
  }

  // ── Budget («Бюджет до поездки») ─────────────────────────────

  function addBudgetLine(tripId, entry) {
    const data = Object.assign({}, entry);
    delete data._id;
    data.createdAt = data.createdAt || new Date().toISOString();
    data.createdBy = window.APP?.user?.uid || null;
    return _ref(tripId).collection('budget').add(data)
      .then(ref => ref.id)
      .catch(e => { console.warn('addBudgetLine:', e); throw e; });
  }

  // .set(patch,{merge:true}) (было раньше) молча СОЗДАЁТ документ, если
  // его уже нет — тот же баг, что уже чинили у updateExpense (см. там):
  // если строку бюджета удалили, пока у кого-то была открыта её форма
  // редактирования, "Сохранить" воскрешал бы её заново, неполной (без
  // createdBy/createdAt). Реальный баг, найден внешним ревью 2026-09-27.
  // .update() падает с not-found вместо этого.
  function updateBudgetLine(tripId, id, patch) {
    return _ref(tripId).collection('budget').doc(id)
      .update(patch)
      .catch(e => { console.warn('updateBudgetLine:', e); throw e; });
  }

  function deleteBudgetLine(tripId, id) {
    return _ref(tripId).collection('budget').doc(id)
      .delete()
      .catch(e => console.warn('deleteBudgetLine:', e));
  }

  // ── Categories (stored on trip doc) ─────────────────────────

  // Категории правят все участники, а живой подписки на них нет — поэтому
  // не перезаписываем массив своей копией (терялась чужая правка, сделанная
  // после того, как у нас открылись Расходы), а сливаем по id в транзакции:
  // свежая серверная версия + только то, что поменяли мы относительно
  // последней загруженной/сохранённой копии (_catBase). Тот же приём, что
  // у общего списка снаряги (modules/gear/data.js saveShared).
  const _catBase = {}; // { tripId: { id: json } }
  function _snapCats(arr) {
    return Object.fromEntries((arr || []).map(c => [c.id, JSON.stringify(c)]));
  }

  function saveCategories(tripId, categories) {
    const ref = _ref(tripId);
    const base = _catBase[tripId] || {};
    return firebase.firestore().runTransaction(async tx => {
      const snap = await tx.get(ref);
      const server = (snap.exists && Array.isArray(snap.data().expenseCategories)) ? snap.data().expenseCategories : [];
      const localById = new Map((categories || []).map(c => [c.id, c]));
      const out = [];
      server.forEach(c => {
        const mine = localById.get(c.id);
        if (mine) { out.push(JSON.stringify(mine) !== base[c.id] ? mine : c); localById.delete(c.id); }
        else if (!(c.id in base)) out.push(c);   // добавили другие — оставляем
        // была у нас и мы удалили — не возвращаем
      });
      localById.forEach((c, id) => { if (!(id in base) || !server.length) out.push(c); }); // наши новые
      tx.set(ref, { expenseCategories: out }, { merge: true });
      return out;
    }).then(merged => {
      _catBase[tripId] = _snapCats(merged);
      if (typeof ExpensesState !== 'undefined') ExpensesState.setCategories(tripId, merged);
      return merged;
    }).catch(e => console.warn('saveCategories:', e));
  }

  function loadCategories(tripId) {
    return _ref(tripId).get()
      .then(doc => {
        const data = doc.data() || {};
        const cats = Array.isArray(data.expenseCategories) ? data.expenseCategories : null;
        _catBase[tripId] = _snapCats(cats);
        return cats;
      })
      .catch(e => { console.warn('loadCategories:', e); return null; });
  }

  // ── Переименование участника ────────────────────────────────
  // Расходы/платежи ссылаются на участника по имени-строке (paidBy,
  // participants[], fromName/toName), а не по uid — так исторически устроен
  // весь модуль (см. ExpensesState.computeSummary, который тоже считает по
  // имени). Переименование в modules/trips/index.js (_showRenameSheet) меняет
  // только p.name в самой поездке — без переноса старое и новое имя
  // считаются РАЗНЫМИ людьми, и уже записанная история (кто кому должен)
  // распадается на двух "участников". Реальный баг, найден внешним ревью
  // 2026-09-27. Перезаписываем массив participants целиком (после чтения
  // документа), а не arrayRemove+arrayUnion — так это один атомарный write
  // на документ, а не два подряд запроса.
  function renameParticipant(tripId, oldName, newName) {
    if (!oldName || !newName || oldName === newName) return Promise.resolve();
    const col = _ref(tripId);
    const expCol = col.collection('expenses');
    const settleCol = col.collection('settlements');
    const budgetCol = col.collection('budget');

    const paidByFix = expCol.where('paidBy', '==', oldName).get()
      .then(snap => Promise.all(snap.docs.map(d => d.ref.update({ paidBy: newName }))));

    const participantsFix = expCol.where('participants', 'array-contains', oldName).get()
      .then(snap => Promise.all(snap.docs.map(d => {
        const arr = (d.data().participants || []).map(n => n === oldName ? newName : n);
        return d.ref.update({ participants: arr });
      })));

    const fromFix = settleCol.where('fromName', '==', oldName).get()
      .then(snap => Promise.all(snap.docs.map(d => d.ref.update({ fromName: newName }))));

    const toFix = settleCol.where('toName', '==', oldName).get()
      .then(snap => Promise.all(snap.docs.map(d => d.ref.update({ toName: newName }))));

    // «Бюджет до поездки» — та же схема участников (participants[]), что и
    // у расходов, но раньше в перенос не входила: суммы бюджета оставались
    // разбиты на старое имя. Реальный баг, найден внешним ревью 2026-09-27.
    const budgetFix = budgetCol.where('participants', 'array-contains', oldName).get()
      .then(snap => Promise.all(snap.docs.map(d => {
        const arr = (d.data().participants || []).map(n => n === oldName ? newName : n);
        return d.ref.update({ participants: arr });
      })));

    // «Делить только на этого человека» (категория.splitDefault) хранится
    // прямо на поездке (expenseCategories[].splitDefault), не в отдельной
    // коллекции — старое имя там тоже оставалось висеть: getCategorySplitDefault
    // отфильтровывает имена, которых нет среди текущих участников, и
    // настройка молча съезжала на "все", как только переименованный
    // переставал совпадать по старому имени. Реальный баг, найден внешним
    // ревью 2026-09-27. Транзакция — та же коллекция, что правит
    // saveCategories, читаем свежую версию, а не мимо неё.
    const categoriesFix = firebase.firestore().runTransaction(async tx => {
      const tripRef = firebase.firestore().collection('trips').doc(tripId);
      const snap = await tx.get(tripRef);
      if (!snap.exists) return;
      const cats = Array.isArray(snap.data().expenseCategories) ? snap.data().expenseCategories : [];
      let changed = false;
      const newCats = cats.map(c => {
        if (Array.isArray(c.splitDefault) && c.splitDefault.includes(oldName)) {
          changed = true;
          return { ...c, splitDefault: c.splitDefault.map(n => n === oldName ? newName : n) };
        }
        return c;
      });
      if (changed) tx.update(tripRef, { expenseCategories: newCats });
    });

    return Promise.all([paidByFix, participantsFix, fromFix, toFix, budgetFix, categoriesFix])
      .catch(e => console.warn('renameParticipant:', e));
  }

  return {
    listen, stopListening, getOnce,
    addExpense, updateExpense, deleteExpense,
    addSettlement, deleteSettlement,
    saveCategories, loadCategories,
    renameParticipant,
    listenBudget, addBudgetLine, updateBudgetLine, deleteBudgetLine,
  };
})();

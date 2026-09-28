'use strict';

const ShoppingRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _openCats = new Set();
  let _boughtOpenCats = new Set(); // раскрытые блоки «Куплено · N» внутри категорий
  let _bodyHandler = null;
  let _bodyKeydownHandler = null;
  let _hideBought = false; // переключатель «Скрыть купленное» — держится между перерисовками, сбрасывается только при полном заходе на экран

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    _openCats.clear();
    _boughtOpenCats.clear();
    _hideBought = false;
    el.innerHTML = `
      <div class="sh-wrap">
        ${_topbar()}
        <div class="sh-body" id="sh-body">${_body()}</div>
      </div>`;
    _bind();
  }

  function _topbar() {
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    return `
      <div class="sh-topbar">
        <button class="sh-back" id="sh-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="sh-topbar__text">
          <div class="sh-topbar__title">Закупка</div>
          <div class="sh-topbar__sub">${trip ? trip.name : ''}</div>
        </div>
      </div>`;
  }

  // Раскрыт ли блок «Ещё N пустых категорий» — живёт между перерисовками.
  let _emptyOpen = false;

  // Макет «Закупка»: прогресс «Куплено X из N», «Первый день», категории
  // с позициями; пустые категории (0/0) свёрнуты в одну строку, разовые
  // «вставить списком / стандартный список» — внизу, а не над списком.
  function _body() {
    const stats = ShoppingState.getStats(_tripId);
    const cats  = ShoppingState.getCategories(_tripId);
    const filled = cats.filter(c => c.items.length);
    const empty  = cats.filter(c => !c.items.length);

    return `
      <div class="sh-stats">
        <div class="sh-stats__row">
          <span class="sh-stats__group">
            <span class="sh-stats__label">Куплено</span>
            <span class="sh-stats__val ${stats.pct === 100 ? 'done' : ''}">${stats.bought} <span class="sh-stats__of">из ${stats.total}</span></span>
          </span>
          <button type="button" class="sh-hide-toggle ${_hideBought ? 'on' : ''}" role="switch"
            aria-checked="${_hideBought}" data-action="toggle-hide-bought">
            <span class="sh-hide-toggle__track"><span class="sh-hide-toggle__knob"></span></span>
            Скрыть купленное
          </button>
        </div>
        <div class="sh-progress-bar">
          <div class="sh-progress-fill" style="width:${stats.pct}%"></div>
        </div>
      </div>
      ${_quickAddBar()}
      <div id="sh-dayone-section">${_dayOneSection()}</div>
      <div class="sh-cats">
        ${filled.map(cat => _cat(cat)).join('')}
        ${empty.length ? `
        <details class="sh-empty-cats" ${_emptyOpen || !filled.length ? 'open' : ''}
                 ontoggle="ShoppingRender._setEmptyOpen(this.open)">
          <summary>Ещё ${empty.length} ${_plural(empty.length, 'пустая категория', 'пустые категории', 'пустых категорий')} ${UIUtils.ico('chevron-down')}</summary>
          ${empty.map(cat => _cat(cat)).join('')}
        </details>` : ''}
        <div class="sh-add-cat" data-action="add-cat">
          <i class="ti ti-plus" aria-hidden="true"></i> добавить категорию
        </div>
      </div>
      <div class="sh-tools">
        <button type="button" class="sh-tool" id="sh-paste" data-action="paste-list">
          <i class="ti ti-clipboard-list" aria-hidden="true"></i> Вставить списком
        </button>
        <button type="button" class="sh-tool" id="sh-load-defaults" data-action="load-defaults">
          <i class="ti ti-download" aria-hidden="true"></i> Стандартный список
        </button>
        ${stats.bought || ShoppingState.getDayOneItems(_tripId).some(i => i.ready) ? `
        <button type="button" class="sh-tool" id="sh-clear-bought" data-action="clear-bought">
          <i class="ti ti-circle-check" aria-hidden="true"></i> Очистить отметки
        </button>` : ''}
      </div>`;
  }

  function _plural(n, f1, f2, f5) {
    const m = n % 100;
    if (m >= 11 && m <= 19) return f5;
    const d = n % 10;
    if (d === 1) return f1;
    if (d >= 2 && d <= 4) return f2;
    return f5;
  }

  // Текст для ленты активности: до 5 названий, дальше «и ещё N» —
  // см. ActivityLog (shared/activity.js).
  function _activityItemsText(names) {
    if (names.length <= 5) return names.join(', ');
    return names.slice(0, 5).join(', ') + ` и ещё ${names.length - 5}`;
  }

  // ── Быстрое добавление прямо на экране (без листа) — категория
  //    подбирается сама по названию (тем же RecipesData.resolveShoppingCategory,
  //    что и «вставить списком»), количество разбирается из хвоста строки
  //    («кефир 2 шт»). Существующее добавление через лист (кнопка
  //    «добавить позицию» внутри категории, см. _showAddItem) остаётся —
  //    это просто более быстрый путь для одной позиции.
  function _quickAddBar() {
    return `
      <div class="sh-quickadd">
        <label class="sh-quickadd__field">
          <i class="ti ti-plus" aria-hidden="true"></i>
          <span class="sh-visually-hidden">Что купить</span>
          <input type="text" id="sh-quickadd-input" class="sh-quickadd__input"
            placeholder="Что купить — «кефир 2 шт»" autocomplete="off">
        </label>
        <span class="sh-quickadd__hint">Категорию подберём сами по названию — поправить можно потом</span>
      </div>`;
  }

  // Разбирает свободный текст на название и количество: сперва пробуем явный
  // разделитель тире/дефис (тот же формат, что и «вставить списком»:
  // «Лук — 2 кг»), иначе ищем число (+ единицу измерения) в хвосте строки —
  // «кефир 2 шт», «лук 1.5 кг», «яйца 20».
  function _parseQuickAdd(raw) {
    const text = String(raw || '').trim();
    const dashParts = text.split(/\s+—\s+|\s+-\s+/);
    if (dashParts.length > 1) {
      return { name: dashParts[0].trim(), qty: dashParts.slice(1).join(' ').trim() };
    }
    const units = ShoppingData.getUnits().join('|');
    const re = new RegExp(`\\s+(\\d+(?:[.,]\\d+)?\\s*(?:${units})?)\\s*$`, 'i');
    const m = text.match(re);
    if (m) return { name: text.slice(0, m.index).trim(), qty: m[1].trim() };
    return { name: text, qty: '' };
  }

  async function _quickAdd() {
    const input = _el?.querySelector('#sh-quickadd-input');
    const raw = input?.value.trim();
    if (!raw) return;
    const { name, qty } = _parseQuickAdd(raw);
    if (!name) return;

    const cats = ShoppingState.getCategories(_tripId);
    const title = RecipesData.resolveShoppingCategory(name);
    const cat = ShoppingState.findOrCreateCategory(cats, title);
    cat.items.push({
      id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      name, qty, bought: false,
    });
    ShoppingState.persist();
    if (input) input.value = '';
    _openCats.add(cat.id);
    await ShoppingFirebase.save(_tripId, cats);
    if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'shopping', `добавил в закупку: ${_activityItemsText([name])}`);
    _rebuildBody();
  }

  // ── "Первый день" — нужно сразу по приезду: либо уже везём, либо надо
  //    успеть купить в дороге. Отдельная секция над обычными категориями,
  //    свой узкий список в состоянии/Firestore (см. ShoppingState/
  //    ShoppingFirebase — dayOneItems), не подкатегория "обычной" закупки.
  function _dayOneSection() {
    const raw = ShoppingState.getDayOneItems(_tripId);
    const items = _sortByChecked(raw, 'ready');
    const rows = items.map(item => `
      <div class="sh-item" data-item="${item.id}">
        <div class="sh-checkbox ${item.ready ? 'checked' : ''}"
          data-action="dayone-toggle" data-item="${item.id}" aria-label="Отметить">
          ${item.ready ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
        </div>
        <span class="sh-item__name ${item.ready ? 'bought' : ''}">${_esc(item.name)}</span>
        <span class="sh-qty-tag">${_esc(item.qty || '—')}</span>
        <button class="sh-del" data-action="dayone-del" data-item="${item.id}" aria-label="Удалить">×</button>
      </div>`).join('');

    return `
      <div class="sh-dayone">
        <div class="sh-dayone__head">
          <div class="sh-dayone__icon"><i class="ti ti-backpack" aria-hidden="true"></i></div>
          <div class="sh-dayone__headtext">
            <span class="sh-dayone__title">Первый день</span>
            <span class="sh-dayone__hint">что нужно сразу по приезду — отметь «везём», когда собрано</span>
          </div>
        </div>
        ${raw.length ? rows : `<p class="sh-dayone__empty">Пока пусто. Добавь сюда, что понадобится в первый вечер.</p>`}
        <div class="sh-dayone__add">
          <input class="sh-dayone__input" id="sh-dayone-name" type="text" placeholder="Название...">
          <input class="sh-dayone__qty" id="sh-dayone-qty" type="text" placeholder="Кол-во">
          <button type="button" class="sh-dayone__addbtn" data-action="dayone-add">+</button>
        </div>
      </div>`;
  }

  function _cat(cat) {
    const isOpen  = _openCats.has(cat.id);
    const total   = cat.items.length;
    const bought  = cat.items.filter(i => i.bought).length;
    const allDone = total > 0 && bought === total;

    return `
      <div class="sh-cat" data-cat-id="${cat.id}">
        <div class="sh-cat__head" data-action="toggle-cat" data-cat="${cat.id}">
          <div class="sh-cat__icon"><i class="ti ${cat.icon || 'ti-list'}" aria-hidden="true"></i></div>
          <span class="sh-cat__title">${_esc(cat.title)}</span>
          <span class="sh-cat__count ${allDone ? 'done' : ''}">${allDone ? '' + UIUtils.ico('check') + '' : `${bought}/${total}`}</span>
          <i class="ti ti-chevron-${isOpen ? 'up' : 'down'} sh-cat__chev" aria-hidden="true"></i>
        </div>
        ${isOpen ? _catBody(cat) : ''}
      </div>`;
  }

  // Некупленные позиции показаны всегда; купленные сворачиваются в строку
  // «Куплено · N» (раскрывается по тапу, состояние — в _boughtOpenCats) —
  // чтобы длинный отмеченный хвост не занимал экран. При включённом
  // «Скрыть купленное» строка вообще не рисуется.
  function _catBody(cat) {
    const unbought = cat.items.filter(i => !i.bought);
    const bought   = cat.items.filter(i => i.bought);
    const boughtOpen = _boughtOpenCats.has(cat.id);
    const items = unbought.map(item => _item(cat.id, item)).join('');
    const boughtRows = boughtOpen ? bought.map(item => _item(cat.id, item)).join('') : '';
    return `
      <div class="sh-cat__body">
        ${items}
        ${(bought.length && !_hideBought) ? `
        <div class="sh-cat-bought-toggle" data-action="toggle-bought-list" data-cat="${cat.id}">
          ${UIUtils.ico('check')} Куплено · ${bought.length}
          <i class="ti ti-chevron-${boughtOpen ? 'up' : 'down'}" aria-hidden="true"></i>
        </div>
        ${boughtRows}` : ''}
        <div class="sh-cat__body-actions">
          <div class="sh-add-item" data-action="add-item" data-cat="${cat.id}">
            <i class="ti ti-plus" aria-hidden="true"></i> добавить позицию
          </div>
          ${bought.length ? `<div class="sh-cat-clear" data-action="clear-cat" data-cat="${cat.id}">Очистить отметки</div>` : ''}
        </div>
      </div>`;
  }

  function _item(catId, item) {
    return `
      <div class="sh-item" data-cat="${catId}" data-item="${item.id}">
        <div class="sh-checkbox ${item.bought ? 'checked' : ''}"
          data-action="toggle" data-cat="${catId}" data-item="${item.id}" aria-label="Отметить">
          ${item.bought ? '<i class="ti ti-check" aria-hidden="true"></i>' : ''}
        </div>
        <span class="sh-item__name ${item.bought ? 'bought' : ''}">${_esc(item.name)}</span>
        <span class="sh-qty-tag" data-action="edit-qty" data-cat="${catId}" data-item="${item.id}"
          contenteditable="false" spellcheck="false">
          ${_esc(item.qty || '—')}
        </span>
        <button class="sh-del" data-action="del-item" data-cat="${catId}" data-item="${item.id}" aria-label="Удалить">×</button>
      </div>`;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }

  // Неотмеченные сверху, отмеченные — вниз (прыгает сразу при отметке, как
  // в обычном списке покупок). Только для отображения — порядок в
  // ShoppingState не трогаем.
  function _sortByChecked(items, key) {
    return items.slice().sort((a, b) => (a[key] ? 1 : 0) - (b[key] ? 1 : 0));
  }

  function _sync() {
    ShoppingFirebase.save(_tripId, ShoppingState.getCategories(_tripId));
  }

  // Общие blur/keydown для редактируемого тега количества — вынесены из
  // edit-qty-обработчика, чтобы refresh() могла навесить их заново на
  // подменённый узел (см. ниже) без дублирования логики сохранения.
  function _bindQtyEditHandlers(tag, catId, itemId) {
    // Escape — отмена: вернуть старый текст и НЕ сохранять (раньше снятие
    // contentEditable само вызывало blur → _save с уже изменённым текстом).
    // keydown без {once}: иначе первая же набранная цифра снимала слушатель
    // и Enter/Escape дальше не работали.
    const orig = tag.textContent;
    let cancelled = false;
    const _onKey = e => {
      if (e.key === 'Enter') { e.preventDefault(); tag.blur(); }
      if (e.key === 'Escape') { cancelled = true; tag.textContent = orig; tag.blur(); }
    };
    const _save = () => {
      tag.removeEventListener('keydown', _onKey);
      tag.contentEditable = 'false';
      tag.classList.remove('editing');
      if (cancelled) return;
      const newQty = tag.textContent.trim();
      if (newQty === orig.trim()) return;
      ShoppingState.updateQty(_tripId, catId, itemId, newQty);
      _sync();
    };
    tag.addEventListener('blur', _save, { once: true });
    tag.addEventListener('keydown', _onKey);
  }

  function _rebuildBody() {
    const bodyEl = _el ? _el.querySelector('#sh-body') : null;
    if (!bodyEl) return;
    bodyEl.innerHTML = _body();
    _bindBody();
  }

  function _rebuildDayOne() {
    const el = _el?.querySelector('#sh-dayone-section');
    if (el) el.innerHTML = _dayOneSection();
  }

  function _rebuildCat(catId) {
    const catEl = _el?.querySelector(`.sh-cat[data-cat-id="${catId}"]`);
    if (!catEl) return;
    const cat = ShoppingState.getCategories(_tripId).find(c => c.id === catId);
    if (!cat) return;
    catEl.outerHTML = _cat(cat);
    // Обновить статистику
    const stats = ShoppingState.getStats(_tripId);
    const valEl = _el?.querySelector('.sh-stats__val');
    if (valEl) {
      valEl.innerHTML = `${stats.bought} <span class="sh-stats__of">из ${stats.total}</span>`;
      valEl.classList.toggle('done', stats.pct === 100);
    }
    const fillEl = _el?.querySelector('.sh-progress-fill');
    if (fillEl) fillEl.style.width = stats.pct + '%';
  }

  function _bind() {
    _el.querySelector('#sh-back')?.addEventListener('click', () => {
      if (typeof ShoppingIndex !== 'undefined') ShoppingIndex.close();
    });
    _bindBody();
  }

  function _bindBody() {
    const body = _el?.querySelector('#sh-body');
    if (!body) return;
    // Удаление позиции — свайпом влево (крестик спрятан под строкой).
    UIUtils.swipeToDelete(body, '.sh-item', '.sh-del');

    if (_bodyHandler) body.removeEventListener('click', _bodyHandler, true);
_bodyHandler = e => {
  const target = e.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action;
  const catId  = target.dataset.cat;
  const itemId = target.dataset.item;

  if (action === 'toggle-cat') {
    if (_openCats.has(catId)) _openCats.delete(catId);
    else _openCats.add(catId);
    _rebuildCat(catId);
    return;
  }
  if (action === 'toggle') {
    e.stopPropagation();
    const newVal = ShoppingState.toggleBought(_tripId, catId, itemId);
    if (newVal !== null) ShoppingFirebase.saveBought(_tripId, itemId, newVal);
    _rebuildCat(catId);
    return;
  }
  if (action === 'edit-qty') {
    e.stopPropagation();
    const tag = target;
    if (tag.contentEditable === 'true') return;
    tag.contentEditable = 'true';
    tag.classList.add('editing');
    tag.focus();
    const range = document.createRange();
    range.selectNodeContents(tag);
    const sel = window.getSelection();
    sel?.removeAllRanges();
    sel?.addRange(range);
    _bindQtyEditHandlers(tag, catId, itemId);
    return;
  }
  if (action === 'del-item') {
    e.stopPropagation();
    ShoppingState.removeItem(_tripId, catId, itemId);
    _sync();
    _rebuildCat(catId);
    return;
  }
  if (action === 'add-item') {
    e.stopPropagation();
    _showAddItem(catId);
    return;
  }
  if (action === 'add-cat') {
    _showAddCat();
    return;
  }
  if (action === 'toggle-hide-bought') {
    _hideBought = !_hideBought;
    _rebuildBody();
    return;
  }
  if (action === 'toggle-bought-list') {
    e.stopPropagation();
    if (_boughtOpenCats.has(catId)) _boughtOpenCats.delete(catId);
    else _boughtOpenCats.add(catId);
    _rebuildCat(catId);
    return;
  }
  if (action === 'paste-list') {
    _showPasteList();
    return;
  }
  if (action === 'load-defaults') {
    _loadDefaults(target);
    return;
  }
  if (action === 'clear-bought') {
    (async () => {
      const ok = await UIUtils.confirmSheet('Снять все отметки «куплено»/«везём»?', { okLabel: 'Сбросить', danger: false });
      if (!ok) return;
      ShoppingState.clearBought(_tripId);
      await ShoppingFirebase.save(_tripId, ShoppingState.getCategories(_tripId));
      await ShoppingFirebase.saveDayOne(_tripId, ShoppingState.getDayOneItems(_tripId));
      _rebuildBody();
    })();
    return;
  }
  if (action === 'clear-cat') {
    e.stopPropagation();
    (async () => {
      const ok = await UIUtils.confirmSheet('Снять отметки «куплено» в этой категории?', { okLabel: 'Сбросить', danger: false });
      if (!ok) return;
      ShoppingState.clearBoughtInCategory(_tripId, catId);
      await ShoppingFirebase.save(_tripId, ShoppingState.getCategories(_tripId));
      _rebuildCat(catId);
    })();
    return;
  }
  if (action === 'dayone-toggle') {
    const newVal = ShoppingState.toggleDayOneReady(_tripId, itemId);
    if (newVal !== null) ShoppingFirebase.saveDayOne(_tripId, ShoppingState.getDayOneItems(_tripId));
    _rebuildDayOne();
    return;
  }
  if (action === 'dayone-del') {
    ShoppingState.removeDayOneItem(_tripId, itemId);
    ShoppingFirebase.saveDayOne(_tripId, ShoppingState.getDayOneItems(_tripId));
    _rebuildDayOne();
    return;
  }
  if (action === 'dayone-add') {
    const nameEl = body.querySelector('#sh-dayone-name');
    const qtyEl  = body.querySelector('#sh-dayone-qty');
    const name = nameEl?.value.trim();
    if (!name) return;
    ShoppingState.addDayOneItem(_tripId, name, qtyEl?.value.trim() || '');
    ShoppingFirebase.saveDayOne(_tripId, ShoppingState.getDayOneItems(_tripId));
    if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'shopping', `добавил в закупку: ${_activityItemsText([name])}`);
    _rebuildDayOne();
    return;
  }
};
body.addEventListener('click', _bodyHandler, true);

    // Быстрое добавление — Enter в строке «Что купить» добавляет позицию
    // (без отдельной кнопки, как в макете). Пересобираем ссылку на
    // обработчик так же, как для клика — body переживает перерисовки.
    if (_bodyKeydownHandler) body.removeEventListener('keydown', _bodyKeydownHandler);
    _bodyKeydownHandler = e => {
      if (e.key === 'Enter' && e.target?.id === 'sh-quickadd-input') {
        e.preventDefault();
        _quickAdd();
      }
    };
    body.addEventListener('keydown', _bodyKeydownHandler);
  }

  function _showAddItem(catId) {
    document.getElementById('sh-add-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sh-add-overlay';
    overlay.className = 'sh-overlay';
    overlay.innerHTML = `
      <div class="sh-sheet">
        <div class="sh-sheet__handle"></div>
        <div class="sh-sheet__head">
          <span class="sh-sheet__title">Новая позиция</span>
          <button class="sh-sheet__close" id="sh-add-close" aria-label="Закрыть"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
        <div class="sh-sheet__body">
          <input class="sh-sheet__input" id="sh-new-name" type="text" placeholder="Название" autocomplete="off">
          <div class="sh-sheet__row">
            <input class="sh-sheet__input sh-sheet__num" id="sh-new-qty-num" type="text" placeholder="Кол-во">
            <select class="sh-sheet__input sh-sheet__unit" id="sh-new-qty-unit">
              ${ShoppingData.getUnits().map(u => `<option>${u}</option>`).join('')}
            </select>
          </div>
        </div>
        <div class="sh-sheet__actions">
          <button class="sh-sheet__btn-save" id="sh-add-save">Добавить</button>
        </div>
      </div>`;

    _el.appendChild(overlay);
    overlay.querySelector('#sh-new-name')?.focus();

    overlay.querySelector('#sh-add-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const shAddSaveBtn = overlay.querySelector('#sh-add-save');
    shAddSaveBtn?.addEventListener('click', () => {
      UIUtils.withBusyButton(shAddSaveBtn, () => {
        const name = overlay.querySelector('#sh-new-name')?.value.trim();
        if (!name) return;
        const num  = overlay.querySelector('#sh-new-qty-num')?.value.trim();
        const unit = overlay.querySelector('#sh-new-qty-unit')?.value;
        const qty  = num ? `${num} ${unit}` : '';
        ShoppingState.addItem(_tripId, catId, name, qty);
        _sync();
        if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'shopping', `добавил в закупку: ${_activityItemsText([name])}`);
        overlay.remove();
        _openCats.add(catId);
        _rebuildCat(catId);
      });
    });
  }

  // Вставка списка текстом — когда список продуктов уже накидан где-то в
  // заметках/переписке и его надо целиком перенести в Закупку, а не
  // разносить по категориям руками одну позицию за раз. Одна строка — одна
  // позиция, опционально "Название — количество" (тот же формат, что и
  // ингредиенты в форме рецепта — modules/recipes/render.js). Категория
  // резолвится тем же RecipesData.resolveShoppingCategory, что и пуш
  // ингредиентов рецепта из Меню — независимо от того, выбраны ли вообще
  // какие-то блюда в Меню этой поездки. Дедуп по имени против ВСЕХ
  // категорий, тот же паттерн, что у _pushIngredientsToShopping.
  // Стандартный набор категорий/позиций (ShoppingData.getDefaults —
  // тот же список, что раньше жил как дефолтный чек-лист новой поездки,
  // убран оттуда осознанно, см. ShoppingState). Тут — по клику, разово,
  // добавляет то, чего ещё нет по имени, той же дедуп-логикой, что и
  // вставка списка текстом ниже, не трогая уже отмеченное/отредактированное.
  async function _loadDefaults(btn) {
    await UIUtils.withBusyButton(btn, async () => {
      const cats = ShoppingState.getCategories(_tripId);
      const existingNames = new Set();
      cats.forEach(c => c.items.forEach(i => existingNames.add(String(i.name).trim().toLowerCase())));

      let added = 0;
      const addedNames = [];
      ShoppingData.getDefaults().forEach(defCat => {
        defCat.items.forEach(defItem => {
          const key = defItem.name.trim().toLowerCase();
          if (existingNames.has(key)) return;
          const cat = ShoppingState.findOrCreateCategory(cats, defCat.title);
          cat.items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name: defItem.name, qty: defItem.qty, bought: false,
          });
          existingNames.add(key);
          addedNames.push(defItem.name);
          added++;
        });
      });

      if (added) {
        ShoppingState.persist();
        await ShoppingFirebase.save(_tripId, cats);
        if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'shopping', `добавил в закупку: ${_activityItemsText(addedNames)}`);
        _rebuildBody();
        _showToast(`Добавлено ${added} ${_plural(added, 'позиция', 'позиции', 'позиций')}`);
      } else {
        _showToast('Всё это уже есть в списке');
      }
    });
  }

  // Короткое всплывающее сообщение внизу экрана — для разового фидбэка типа
  // «стандартный список добавил N позиций», без общего toast-хелпера в
  // shared (его в приложении пока нет, заводить ради одной надписи не
  // стали — своя маленькая реализация внутри модуля).
  let _toastTimer = null;
  function _showToast(text) {
    if (!_el) return;
    _el.querySelector('#sh-toast')?.remove();
    clearTimeout(_toastTimer);
    const el = document.createElement('div');
    el.id = 'sh-toast';
    el.className = 'sh-toast';
    el.textContent = text;
    _el.appendChild(el);
    _toastTimer = setTimeout(() => el.remove(), 2600);
  }

  function _showPasteList() {
    document.getElementById('sh-paste-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sh-paste-overlay';
    overlay.className = 'sh-overlay';
    overlay.innerHTML = `
      <div class="sh-sheet">
        <div class="sh-sheet__handle"></div>
        <div class="sh-sheet__head">
          <span class="sh-sheet__title">Вставить список</span>
          <button class="sh-sheet__close" id="sh-paste-close" aria-label="Закрыть"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
        <div class="sh-sheet__body">
          <p style="font-size:13px;color:var(--label3);margin:0 0 10px">По одной позиции на строке — категория подберётся сама. Через тире можно указать количество.</p>
          <textarea class="sh-sheet__input sh-paste-textarea" id="sh-paste-text" placeholder="Лук — 2 кг&#10;Хлеб&#10;Тушёнка говяжья — 4 банки" autocomplete="off"></textarea>
        </div>
        <div class="sh-sheet__actions">
          <button class="sh-sheet__btn-save" id="sh-paste-save">Добавить</button>
        </div>
      </div>`;

    _el.appendChild(overlay);
    overlay.querySelector('#sh-paste-text')?.focus();

    overlay.querySelector('#sh-paste-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    const saveBtn = overlay.querySelector('#sh-paste-save');
    saveBtn?.addEventListener('click', async () => {
      const lines = (overlay.querySelector('#sh-paste-text')?.value || '')
        .split('\n').map(l => l.trim()).filter(Boolean);
      if (!lines.length) return;

      await UIUtils.withBusyButton(saveBtn, async () => {
        const cats = ShoppingState.getCategories(_tripId);
        const existingNames = new Set();
        cats.forEach(c => c.items.forEach(i => existingNames.add(String(i.name).trim().toLowerCase())));

        let added = 0;
        const addedNames = [];
        lines.forEach(line => {
          const parts = line.split(/\s+—\s+|\s+-\s+/);
          const name = parts[0].trim();
          const qty  = parts.length > 1 ? parts.slice(1).join(' ').trim() : '';
          const key  = name.toLowerCase();
          if (!key || existingNames.has(key)) return;

          const title = RecipesData.resolveShoppingCategory(name);
          const cat = ShoppingState.findOrCreateCategory(cats, title);
          cat.items.push({
            id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
            name, qty, bought: false,
          });
          existingNames.add(key);
          addedNames.push(name);
          added++;
        });

        if (added) {
          ShoppingState.persist();
          await ShoppingFirebase.save(_tripId, cats);
          if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'shopping', `добавил в закупку: ${_activityItemsText(addedNames)}`);
          _rebuildBody();
          _showToast(`Добавлено ${added} ${_plural(added, 'позиция', 'позиции', 'позиций')}`);
        }
      });
      overlay.remove();
    });
  }

  function _showAddCat() {
    document.getElementById('sh-addcat-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'sh-addcat-overlay';
    overlay.className = 'sh-overlay';
    overlay.innerHTML = `
      <div class="sh-sheet">
        <div class="sh-sheet__handle"></div>
        <div class="sh-sheet__head">
          <span class="sh-sheet__title">Новая категория</span>
          <button class="sh-sheet__close" id="sh-addcat-close" aria-label="Закрыть"><i class="ti ti-x" aria-hidden="true"></i></button>
        </div>
        <div class="sh-sheet__body">
          <input class="sh-sheet__input" id="sh-new-cat-name" type="text" placeholder="Название категории" autocomplete="off">
        </div>
        <div class="sh-sheet__actions">
          <button class="sh-sheet__btn-save" id="sh-addcat-save">Создать</button>
        </div>
      </div>`;

    _el.appendChild(overlay);
    overlay.querySelector('#sh-new-cat-name')?.focus();

    overlay.querySelector('#sh-addcat-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelector('#sh-addcat-save')?.addEventListener('click', () => {
      const title = overlay.querySelector('#sh-new-cat-name')?.value.trim();
      if (!title) return;
      ShoppingState.addCategory(_tripId, title);
      _sync();
      overlay.remove();
      _rebuildBody();
    });
  }

  // Полная замена innerHTML на каждый снапшот (включая эхо своей же записи,
  // например когда кто-то отмечает другую позицию) убивала contenteditable-
  // узел количества, если человек как раз его редактировал — не только
  // терялся ввод, но и blur/keydown никогда не долетали до _save(), так что
  // даже уже введённое значение не сохранялось. Сохраняем и восстанавливаем
  // редактирование вокруг перерисовки, тем же паттерном, что и в Баре/
  // Рецептах (см. modules/bar/render.js, modules/recipes/render.js).
  function refresh() {
    const active = document.activeElement;
    let pending = null;
    if (active && active.classList && active.classList.contains('sh-qty-tag') && active.contentEditable === 'true') {
      pending = { cat: active.dataset.cat, item: active.dataset.item, text: active.textContent };
    }
    _rebuildBody();
    if (pending) {
      const tag = _el?.querySelector(`.sh-qty-tag[data-cat="${pending.cat}"][data-item="${pending.item}"]`);
      if (tag) {
        tag.contentEditable = 'true';
        tag.classList.add('editing');
        tag.textContent = pending.text;
        tag.focus();
        const range = document.createRange();
        range.selectNodeContents(tag);
        range.collapse(false);
        const sel = window.getSelection();
        sel?.removeAllRanges();
        sel?.addRange(range);
        _bindQtyEditHandlers(tag, pending.cat, pending.item);
      }
    }
  }

  function _setEmptyOpen(v) { _emptyOpen = !!v; }

  return { render, refresh, _setEmptyOpen };
})();

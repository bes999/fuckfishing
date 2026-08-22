'use strict';

const ShoppingRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _openCats = new Set();
  let _bodyHandler = null;

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    _openCats.clear();
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

  function _body() {
    const stats = ShoppingState.getStats(_tripId);
    const cats  = ShoppingState.getCategories(_tripId);

    const catsHtml = cats.map(cat => _cat(cat)).join('');

    return `
      <div class="sh-stats">
        <div class="sh-stats__row">
          <span class="sh-stats__label">Куплено</span>
          <span class="sh-stats__val" style="color:${stats.pct === 100 ? '#34c759' : 'var(--accent)'}">${stats.bought} / ${stats.total}</span>
        </div>
        <div class="sh-progress-bar">
          <div class="sh-progress-fill" style="width:${stats.pct}%"></div>
        </div>
      </div>
      <div class="sh-cats">
        ${catsHtml}
        <div class="sh-add-cat" data-action="add-cat">
          <i class="ti ti-plus" aria-hidden="true"></i> добавить категорию
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
          <span class="sh-cat__count ${allDone ? 'done' : ''}">${allDone ? '✓' : `${bought}/${total}`}</span>
          <i class="ti ti-chevron-${isOpen ? 'up' : 'down'} sh-cat__chev" aria-hidden="true"></i>
        </div>
        ${isOpen ? _catBody(cat) : ''}
      </div>`;
  }

  function _catBody(cat) {
    const items = cat.items.map(item => _item(cat.id, item)).join('');
    return `
      <div class="sh-cat__body">
        ${items}
        <div class="sh-add-item" data-action="add-item" data-cat="${cat.id}">
          <i class="ti ti-plus" aria-hidden="true"></i> добавить позицию
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

  function _sync() {
    ShoppingFirebase.save(_tripId, ShoppingState.getCategories(_tripId));
  }

  // Общие blur/keydown для редактируемого тега количества — вынесены из
  // edit-qty-обработчика, чтобы refresh() могла навесить их заново на
  // подменённый узел (см. ниже) без дублирования логики сохранения.
  function _bindQtyEditHandlers(tag, catId, itemId) {
    const _save = () => {
      tag.contentEditable = 'false';
      tag.classList.remove('editing');
      const newQty = tag.textContent.trim();
      ShoppingState.updateQty(_tripId, catId, itemId, newQty);
      _sync();
    };
    tag.addEventListener('blur', _save, { once: true });
    tag.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); tag.blur(); }
      if (e.key === 'Escape') { tag.contentEditable = 'false'; tag.classList.remove('editing'); }
    }, { once: true });
  }

  function _rebuildBody() {
    const bodyEl = _el ? _el.querySelector('#sh-body') : null;
    if (!bodyEl) return;
    bodyEl.innerHTML = _body();
    _bindBody();
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
      valEl.textContent = `${stats.bought} / ${stats.total}`;
      valEl.style.color = stats.pct === 100 ? '#34c759' : 'var(--accent)';
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
    ShoppingState.toggleBought(_tripId, catId, itemId);
    _sync();
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
};
body.addEventListener('click', _bodyHandler, true);
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
        overlay.remove();
        _openCats.add(catId);
        _rebuildCat(catId);
      });
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

  return { render, refresh };
})();

'use strict';

// Личный список покупок на поездку — вкладка "Покупки" в своём же профиле
// (modules/members/render.js:switchTab). Полностью приватный: никто, кроме
// владельца, этот список не видит и не может увидеть (см. firestore.rules) —
// это НЕ то же самое, что участник расхода с одним человеком в сплите,
// который остаётся видимым всем в общих Расходах поездки.
const PurchasesRender = (() => {

  let _el = null;
  let _uid = null;
  let _tripId = null;
  let _items = [];

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function init(uid, container) {
    _el = container;
    _uid = uid;
    if (!_el) return;

    const trips = (typeof TripsData !== 'undefined' ? TripsData.getMine(uid) : [])
      .slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    if (!trips.length) {
      _el.innerHTML = `<p style="color:var(--label3);font-size:14px;padding:12px 0">Нет поездок, к которым можно привязать покупки</p>`;
      return;
    }

    const upcoming = typeof TripsData !== 'undefined' ? TripsData.getUpcoming(uid) : null;
    _tripId = (trips.find(t => t.id === _tripId) ? _tripId : null) || upcoming?.id || trips[0].id;

    _el.innerHTML = _shell(trips);
    _bindShell();
    _subscribe();
  }

  function _shell(trips) {
    const options = trips.map(t => `<option value="${t.id}" ${t.id === _tripId ? 'selected' : ''}>${_esc(t.name)}</option>`).join('');
    return `
      <select class="invite-email-input" id="pur-trip-select">${options}</select>
      <div id="pur-list"></div>`;
  }

  function _bindShell() {
    _el.querySelector('#pur-trip-select')?.addEventListener('change', e => {
      _tripId = e.target.value;
      _items = [];
      document.getElementById('pur-list').innerHTML = '';
      _subscribe();
    });
  }

  function _subscribe() {
    if (typeof PurchasesFirebase === 'undefined' || !_tripId) return;
    PurchasesFirebase.subscribe(_uid, _tripId, items => {
      _items = items || [];
      _renderList();
    });
  }

  function destroy() {
    if (typeof PurchasesFirebase !== 'undefined') PurchasesFirebase.unsubscribe();
    _el = null;
  }

  function _renderList() {
    const listEl = document.getElementById('pur-list');
    if (!listEl) return;

    const bought = _items.filter(i => i.bought);
    const boughtTotal = bought.reduce((s, i) => s + (Number(i.amount) || 0), 0);

    const rows = _items.map(i => `
      <div class="p-gear-item">
        <div class="pur-check ${i.bought ? 'checked' : ''}" data-action="pur-toggle" data-id="${i.id}"></div>
        <span class="pur-name ${i.bought ? 'pur-name--bought' : ''}">${_esc(i.name)}</span>
        <span class="pur-amount">${i.amount ? _esc(String(i.amount)) + ' ₽' : ''}</span>
        <span class="p-emerg-del" data-action="pur-del" data-id="${i.id}">×</span>
      </div>`).join('');

    listEl.innerHTML = `
      ${rows || '<p style="color:var(--label3);font-size:14px;padding:12px 0">Список пуст</p>'}
      <div class="p-gear-add" id="pur-add-row">+ Добавить</div>
      ${bought.length ? `<div class="p-sec-title" style="margin-top:16px">Куплено: ${boughtTotal} ₽</div>` : ''}
    `;
    _bindListEvents(listEl);
  }

  function _bindListEvents(listEl) {
    listEl.querySelectorAll('[data-action="pur-toggle"]').forEach(el => {
      el.addEventListener('click', () => _toggle(el.dataset.id));
    });
    listEl.querySelectorAll('[data-action="pur-del"]').forEach(el => {
      el.addEventListener('click', () => _remove(el.dataset.id));
    });
    listEl.querySelector('#pur-add-row')?.addEventListener('click', _showAddForm);
  }

  function _toggle(id) {
    const item = _items.find(i => i.id === id);
    if (!item) return;
    item.bought = !item.bought;
    PurchasesFirebase.save(_uid, _tripId, _items);
    _renderList();
  }

  function _remove(id) {
    _items = _items.filter(i => i.id !== id);
    PurchasesFirebase.save(_uid, _tripId, _items);
    _renderList();
  }

  function _showAddForm() {
    document.getElementById('pur-add-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.id = 'pur-add-overlay';
    overlay.innerHTML = `
      <div class="profile-sheet">
        <div class="profile-grab"></div>
        <div class="profile-scroll">
          <div class="modal-title" style="margin-bottom:14px">Новая покупка</div>
          <input class="invite-email-input" id="pur-add-name" type="text" placeholder="Кепка, гели, ремкомплект..." autocomplete="off">
          <input class="invite-email-input" id="pur-add-amount" type="number" inputmode="decimal" placeholder="Сумма, ₽ (необязательно)">
          <div class="sheet-actions-row">
            <button class="picker-cancel" data-action="pur-add-close">Отмена</button>
            <button class="action-btn" id="pur-add-save">Добавить</button>
          </div>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.querySelector('#pur-add-name')?.focus();

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.dataset.action === 'pur-add-close') overlay.remove();
    });
    overlay.querySelector('#pur-add-save').addEventListener('click', async e => {
      const name = overlay.querySelector('#pur-add-name').value.trim();
      if (!name) { overlay.querySelector('#pur-add-name').focus(); return; }
      const amount = Number(overlay.querySelector('#pur-add-amount').value) || 0;
      _items.push({ id: 'pi_' + Date.now() + '_' + Math.random().toString(36).slice(2), name, amount, bought: false });
      await UIUtils.withBusyButton(e.currentTarget, async () => {
        await PurchasesFirebase.save(_uid, _tripId, _items);
      });
      _renderList();
      overlay.remove();
    });
  }

  return { init, destroy };
})();

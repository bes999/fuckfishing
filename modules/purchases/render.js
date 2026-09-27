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
      _el.innerHTML = `<p class="mb-empty">Нет поездок, к которым можно привязать покупки</p>`;
      return;
    }

    const upcoming = typeof TripsData !== 'undefined' ? TripsData.getUpcoming(uid) : null;
    _tripId = (trips.find(t => t.id === _tripId) ? _tripId : null) || upcoming?.id || trips[0].id;

    _el.innerHTML = _shell(trips);
    _bindShell();
    _subscribe();
  }

  // Выбор поездки — нативный <select> поверх «кнопки» с подписью (на
  // телефоне открывает системный список), строка добавления «название + ₽»
  // прямо над списком вместо отдельного шита.
  function _shell(trips) {
    const options = trips.map(t => `<option value="${_esc(t.id)}" ${t.id === _tripId ? 'selected' : ''}>${_esc(t.name)}</option>`).join('');
    const cur = trips.find(t => t.id === _tripId);
    return `
      <p class="pur-intro">Что купить лично себе к поездке. Видишь только ты.</p>
      <label class="pur-trip">
        <span class="pur-trip-txt"><span class="pur-trip-cap">Поездка</span><span class="pur-trip-name" id="pur-trip-name">${_esc(cur?.name || '')}</span></span>
        <i class="ti ti-chevron-down" aria-hidden="true"></i>
        <select id="pur-trip-select" aria-label="Поездка">${options}</select>
      </label>
      <form class="pur-add" id="pur-add-form" autocomplete="off">
        <input class="pur-add-name" id="pur-add-name" type="text" placeholder="Кепка, гели, ремкомплект…" aria-label="Что купить">
        <input class="pur-add-amount" id="pur-add-amount" type="number" inputmode="decimal" placeholder="₽" aria-label="Сумма, ₽">
        <button class="pur-add-btn" type="submit" aria-label="Добавить">${UIUtils.ico('plus')}</button>
      </form>
      <span class="pur-hint pur-hint--tight">Сумма — необязательно</span>
      <div id="pur-list"></div>`;
  }

  function _bindShell() {
    const sel = _el.querySelector('#pur-trip-select');
    sel?.addEventListener('change', e => {
      _tripId = e.target.value;
      const nm = _el.querySelector('#pur-trip-name');
      if (nm) nm.textContent = sel.options[sel.selectedIndex]?.text || '';
      _items = [];
      document.getElementById('pur-list').innerHTML = '';
      _subscribe();
    });
    _el.querySelector('#pur-add-form')?.addEventListener('submit', e => {
      e.preventDefault();
      _add(e.currentTarget.querySelector('.pur-add-btn'));
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
      <div class="pur-row" data-id="${_esc(i.id)}">
        <button type="button" class="pur-row-main" role="checkbox" aria-checked="${!!i.bought}" data-action="pur-toggle" data-id="${_esc(i.id)}">
          <span class="pur-check ${i.bought ? 'checked' : ''}"></span>
          <span class="pur-name ${i.bought ? 'pur-name--bought' : ''}">${_esc(i.name)}</span>
          <span class="pur-amount">${i.amount ? _fmtRub(i.amount) : ''}</span>
        </button>
        <button type="button" class="pur-del" data-action="pur-del" data-id="${_esc(i.id)}" aria-label="Удалить"></button>
      </div>`).join('');

    listEl.innerHTML = _items.length ? `
      <section class="mb-card mb-card--list pur-list">${rows}</section>
      <div class="pur-sum"><span>Куплено</span><b>${bought.length} из ${_items.length} · ${_fmtRub(boughtTotal)}</b></div>
      <span class="pur-hint">Кружок — куплено · смахни влево, чтобы удалить</span>`
      : `<p class="mb-empty">Список пуст — добавь, что купить</p>`;
    _bindListEvents(listEl);
  }

  function _bindListEvents(listEl) {
    const card = listEl.querySelector('.pur-list');
    if (!card) return;
    // Удаление — свайпом влево (кнопка спрятана под строкой).
    UIUtils.swipeToDelete(card, '.pur-row', '.pur-del');
    card.addEventListener('click', e => {
      const del = e.target.closest('[data-action="pur-del"]');
      if (del) { _remove(del.dataset.id); return; }
      const tg = e.target.closest('[data-action="pur-toggle"]');
      if (tg) _toggle(tg.dataset.id);
    });
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

  async function _add(btn) {
    const nameEl = _el?.querySelector('#pur-add-name');
    const amtEl  = _el?.querySelector('#pur-add-amount');
    const name = nameEl?.value.trim();
    if (!name) { nameEl?.focus(); return; }
    const amount = Number(amtEl?.value) || 0;
    _items.push({ id: 'pi_' + Date.now() + '_' + Math.random().toString(36).slice(2), name, amount, bought: false });
    await UIUtils.withBusyButton(btn, async () => {
      await PurchasesFirebase.save(_uid, _tripId, _items);
    });
    nameEl.value = ''; if (amtEl) amtEl.value = '';
    _renderList();
    nameEl.focus();
  }

  function _fmtRub(n) {
    return (Number(n) || 0).toLocaleString('ru-RU') + ' ₽';
  }

  return { init, destroy };
})();

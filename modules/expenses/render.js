'use strict';

const ExpensesRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _tab    = 'expenses'; // 'expenses' | 'balance' | 'summary'
  let _bodyHandler = null;

  // ── Entry point ──────────────────────────────────────────────

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    el.innerHTML = `
      <div class="exp-wrap">
        ${_topbar()}
        <div class="exp-tabs" id="exp-tabs">${_tabs()}</div>
        <div class="exp-body" id="exp-body">${_body()}</div>
      </div>`;
    _bind();
  }

  function refresh() {
    if (!_el) return;
    _el.querySelector('#exp-tabs').innerHTML = _tabs();
    _el.querySelector('#exp-body').innerHTML = _body();
    _bindBody();
  }

  // ── Topbar ───────────────────────────────────────────────────

  function _topbar() {
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    return `
      <div class="exp-topbar">
        <button class="exp-back" id="exp-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="exp-topbar__text">
          <div class="exp-topbar__title">Расходы</div>
          <div class="exp-topbar__sub">${trip ? _esc(trip.name) : ''}</div>
        </div>
        <button class="exp-cat-btn" id="exp-cat-btn" aria-label="Категории">
          <i class="ti ti-tag" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  // ── Tabs ─────────────────────────────────────────────────────

  function _tabs() {
    const tabs = [
      { id: 'expenses', label: 'Расходы' },
      { id: 'balance',  label: 'Баланс'  },
      { id: 'summary',  label: 'Итог'    },
    ];
    return tabs.map(t => `
      <div class="exp-tab ${_tab === t.id ? 'active' : ''}" data-tab="${t.id}">${t.label}</div>
    `).join('');
  }

  // ── Body dispatcher ──────────────────────────────────────────

  function _body() {
    if (_tab === 'expenses') return _tabExpenses();
    if (_tab === 'balance')  return _tabBalance();
    return _tabSummary();
  }

  // ── Tab: Expenses ────────────────────────────────────────────

  function _tabExpenses() {
    const summary   = ExpensesState.computeSummary(_tripId);
    const expenses  = ExpensesState.getExpenses(_tripId);
    const cats      = ExpensesState.getCategories(_tripId);
    const catMap    = Object.fromEntries(cats.map(c => [c.id, c]));
    const myUid      = window.APP?.user?.uid;
    const isOrganizer = typeof TripsData !== 'undefined' && TripsData.getById(_tripId)?.ownerId === myUid;

    return `
      <div class="exp-scroll">
        <div class="exp-stats-row">
          <div class="exp-stat-card">
            <div class="exp-stat-lbl">Всего</div>
            <div class="exp-stat-num">${_rub(summary.total)}</div>
            <div class="exp-stat-sub">${summary.count} ${_plural(summary.count, 'позиция','позиции','позиций')}</div>
          </div>
          <div class="exp-stat-card">
            <div class="exp-stat-lbl">На человека</div>
            <div class="exp-stat-num">${_rub(summary.avgShare)}</div>
            <div class="exp-stat-sub">${summary.rows.length} ${_plural(summary.rows.length,'участник','участника','участников')}</div>
          </div>
        </div>

        <button class="exp-add-btn" data-action="add-expense">
          <i class="ti ti-plus" aria-hidden="true"></i> Добавить расход
        </button>

        ${expenses.length === 0 ? `<div class="exp-empty">Расходов пока нет</div>` : ''}

        <div class="exp-list">
          ${expenses.map(e => _expenseRow(e, catMap, myUid === e.createdBy || isOrganizer)).join('')}
        </div>
      </div>`;
  }

  function _expenseRow(e, catMap, canDelete) {
    const cat = catMap[e.category] || { title: e.category, icon: 'ti-dots' };
    return `
      <div class="exp-entry" data-id="${e._id}">
        <div class="exp-entry__cat-icon"><i class="ti ${cat.icon}" aria-hidden="true"></i></div>
        <div class="exp-entry__info">
          <div class="exp-entry__desc">${_esc(e.desc)}</div>
          <div class="exp-entry__meta">${_esc(e.paidBy)} · ${_fmtDate(e.date)}</div>
          <div class="exp-entry__tag">${_esc(cat.title)}</div>
        </div>
        <div class="exp-entry__right">
          <div class="exp-entry__amt">${_rub(e.amount)}</div>
          <div class="exp-entry__actions">
            <button class="exp-entry__btn" data-action="edit-expense" data-id="${e._id}" aria-label="Редактировать">
              <i class="ti ti-pencil" aria-hidden="true"></i>
            </button>
            ${canDelete ? `
            <button class="exp-entry__btn exp-entry__btn--del" data-action="del-expense" data-id="${e._id}" aria-label="Удалить">
              <i class="ti ti-trash" aria-hidden="true"></i>
            </button>` : ''}
          </div>
        </div>
      </div>`;
  }

  // ── Tab: Balance ─────────────────────────────────────────────

  function _tabBalance() {
    const summary     = ExpensesState.computeSummary(_tripId);
    const settlements = ExpensesState.getSettlements(_tripId);

    const rowsHtml = summary.rows.map(r => {
      const sign  = r.netDiff >= 0 ? '+' : '−';
      const cls   = r.netDiff >= 0 ? 'pos' : 'neg';
      const val   = Math.abs(Math.round(r.netDiff));
      return `
        <div class="exp-person-row">
          <div class="exp-person__avatar">${_initials(r.name)}</div>
          <div class="exp-person__info">
            <div class="exp-person__name">${_esc(r.name)}</div>
            <div class="exp-person__meta">Заплатил ${_rub(r.paid)} · Доля ${_rub(r.owed)}</div>
          </div>
          <div class="exp-person__diff exp-person__diff--${cls}">${sign}${_rubVal(val)}</div>
        </div>`;
    }).join('');

    const transfersHtml = summary.transfers.length === 0
      ? `<div class="exp-empty">Все в расчёте</div>`
      : summary.transfers.map(t => `
          <div class="exp-transfer-row">
            <div class="exp-transfer__info">
              <div class="exp-transfer__names">
                <span class="exp-transfer__from">${_esc(t.from)}</span>
                <i class="ti ti-arrow-right" aria-hidden="true"></i>
                <span class="exp-transfer__to">${_esc(t.to)}</span>
              </div>
              <div class="exp-transfer__amt">${_rub(t.amount)}</div>
            </div>
            <button class="exp-pay-btn" data-action="settle"
              data-from="${_esc(t.from)}" data-to="${_esc(t.to)}" data-amt="${Math.round(t.amount)}">
              Погасить
            </button>
          </div>`).join('');

    const historyHtml = settlements.length === 0 ? '' : `
      <div class="exp-sec-label">История погашений</div>
      ${settlements.map(s => `
        <div class="exp-hist-row">
          <div class="exp-hist__info">
            <div class="exp-hist__names">${_esc(s.fromName)} → ${_esc(s.toName)}</div>
            <div class="exp-hist__meta">${_fmtDate(s.date)}${s.note ? ' · ' + _esc(s.note) : ''}</div>
          </div>
          <div style="display:flex;align-items:center;gap:8px">
            <div class="exp-hist__amt">${_rub(s.amount)}</div>
            <button class="exp-hist__del" data-action="del-settlement" data-id="${s._id}" aria-label="Удалить">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>
          </div>
        </div>`).join('')}`;

    return `
      <div class="exp-scroll">
        <div class="exp-sec-label">По участникам</div>
        ${summary.rows.length === 0 ? `<div class="exp-empty">Нет данных</div>` : rowsHtml}

        <div class="exp-sec-label" style="margin-top:18px">Кто кому должен</div>
        ${transfersHtml}
        ${historyHtml}
      </div>`;
  }

  // ── Tab: Summary ─────────────────────────────────────────────

  function _tabSummary() {
    const summary = ExpensesState.computeSummary(_tripId);
    const cats    = ExpensesState.getCategories(_tripId);
    const catMap  = Object.fromEntries(cats.map(c => [c.id, c]));

    const catEntries = Object.entries(summary.byCat)
      .sort((a, b) => b[1] - a[1]);
    const maxAmt = catEntries.length ? catEntries[0][1] : 1;

    const catColors = [
      '#0A84FF','#30D158','#FF9F0A','#FF453A','#BF5AF2','#64D2FF','#FF6961','#5AC8FA',
    ];

    const catsHtml = catEntries.map(([id, amt], i) => {
      const cat   = catMap[id] || { title: id, icon: 'ti-dots' };
      const pct   = Math.round((amt / (summary.total || 1)) * 100);
      const w     = Math.round((amt / maxAmt) * 100);
      const color = catColors[i % catColors.length];
      return `
        <div class="exp-cat-bar-row">
          <div class="exp-cat-bar__label">${_esc(cat.title)}</div>
          <div class="exp-cat-bar__track">
            <div class="exp-cat-bar__fill" style="width:${w}%;background:${color}"></div>
          </div>
          <div class="exp-cat-bar__val">${_rub(amt)} <span class="exp-cat-bar__pct">${pct}%</span></div>
        </div>`;
    }).join('');

    return `
      <div class="exp-scroll">
        <div class="exp-stats-row exp-stats-row--3">
          <div class="exp-stat-card">
            <div class="exp-stat-lbl">Итого</div>
            <div class="exp-stat-num exp-stat-num--sm">${_rub(summary.total)}</div>
          </div>
          <div class="exp-stat-card">
            <div class="exp-stat-lbl">На чел.</div>
            <div class="exp-stat-num exp-stat-num--sm">${_rub(summary.avgShare)}</div>
          </div>
          <div class="exp-stat-card">
            <div class="exp-stat-lbl">Позиций</div>
            <div class="exp-stat-num exp-stat-num--sm">${summary.count}</div>
          </div>
        </div>

        <div class="exp-sec-label">По категориям</div>
        <div class="exp-cat-bars">
          ${catEntries.length === 0 ? `<div class="exp-empty">Нет данных</div>` : catsHtml}
        </div>

        <button class="exp-csv-btn" data-action="export-csv">
          <i class="ti ti-download" aria-hidden="true"></i>
          <div>
            <div class="exp-csv-btn__title">Скачать CSV</div>
            <div class="exp-csv-btn__sub">Расходы, погашения, баланс</div>
          </div>
        </button>
      </div>`;
  }

  // ── Overlay: Add/Edit Expense ─────────────────────────────────

  function _showExpenseForm(expenseId) {
    document.getElementById('exp-overlay')?.remove();

    const cats    = ExpensesState.getCategories(_tripId);
    const members = _getMembers();
    const editing = expenseId ? ExpensesState.getExpenses(_tripId).find(e => e._id === expenseId) : null;
    const e       = editing || {};

    const membersChecks = members.map(name => `
      <div class="exp-check-row" data-name="${_esc(name)}">
        <div class="exp-checkbox ${!editing || (e.participants || []).includes(name) ? 'checked' : ''}"
          data-chk="1"></div>
        <span class="exp-check-name">${_esc(name)}</span>
      </div>`).join('');

    const catOptions = cats.map(c =>
      `<option value="${c.id}" ${e.category === c.id ? 'selected' : ''}>${_esc(c.title)}</option>`
    ).join('');

    const whoOptions = members.map(name =>
      `<option value="${name}" ${e.paidBy === name ? 'selected' : ''}>${_esc(name)}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.id        = 'exp-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">${editing ? 'Редактировать' : 'Новый расход'}</span>
          <button class="exp-sheet__close" id="exp-ov-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="exp-sheet__body">
          <div class="exp-form-label">Описание</div>
          <input class="exp-form-input" id="exp-desc" type="text" placeholder="Бензин, продукты..." value="${_esc(e.desc || '')}" autocomplete="off">

          <div class="exp-form-row-2">
            <div>
              <div class="exp-form-label">Сумма ₽</div>
              <input class="exp-form-input" id="exp-amt" type="number" placeholder="0" value="${e.amount || ''}">
            </div>
            <div>
              <div class="exp-form-label">Категория</div>
              <select class="exp-form-input" id="exp-cat">${catOptions}</select>
            </div>
          </div>

          <div class="exp-form-label">Кто заплатил</div>
          <select class="exp-form-input" id="exp-who">
            <option value="">Выберите участника</option>
            ${whoOptions}
            <option value="__manual__">+ Вписать вручную</option>
          </select>
          <input class="exp-form-input" id="exp-who-manual" type="text" placeholder="Имя"
            style="display:none;margin-top:8px" value="${!members.includes(e.paidBy) && e.paidBy ? _esc(e.paidBy) : ''}">

          <div class="exp-form-label" style="margin-top:4px">Участвуют в расходе</div>
          <div class="exp-checks" id="exp-checks">
            ${membersChecks}
          </div>
          <div class="exp-checks-actions">
            <button class="exp-checks-btn" id="exp-all">Все</button>
            <button class="exp-checks-btn" id="exp-none">Снять всех</button>
          </div>

          <div class="exp-form-label" style="margin-top:4px">Дата</div>
          <input class="exp-form-input" id="exp-date" type="date" value="${e.date || new Date().toISOString().split('T')[0]}">
        </div>
        <div class="exp-sheet__actions">
          <button class="exp-sheet__save" id="exp-ov-save">${editing ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </div>`;

    _el.appendChild(overlay);

    // Pre-select paidBy
    if (e.paidBy && members.includes(e.paidBy)) {
      overlay.querySelector('#exp-who').value = e.paidBy;
    } else if (e.paidBy && !members.includes(e.paidBy)) {
      overlay.querySelector('#exp-who').value = '__manual__';
      const manual = overlay.querySelector('#exp-who-manual');
      manual.style.display = '';
      manual.value = e.paidBy;
    }

    overlay.querySelector('#exp-desc').focus();

    // Who changed
    overlay.querySelector('#exp-who').addEventListener('change', ev => {
      const manual = overlay.querySelector('#exp-who-manual');
      manual.style.display = ev.target.value === '__manual__' ? '' : 'none';
    });

    // Check toggles
    overlay.querySelector('#exp-checks').addEventListener('click', ev => {
      const row = ev.target.closest('.exp-check-row');
      if (!row) return;
      const chk = row.querySelector('[data-chk]');
      chk.classList.toggle('checked');
    });

    overlay.querySelector('#exp-all').addEventListener('click', () => {
      overlay.querySelectorAll('[data-chk]').forEach(c => c.classList.add('checked'));
    });
    overlay.querySelector('#exp-none').addEventListener('click', () => {
      overlay.querySelectorAll('[data-chk]').forEach(c => c.classList.remove('checked'));
    });

    overlay.querySelector('#exp-ov-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    const expSaveBtn = overlay.querySelector('#exp-ov-save');
    expSaveBtn.addEventListener('click', () => {
      UIUtils.withBusyButton(expSaveBtn, () => {
        const desc = overlay.querySelector('#exp-desc').value.trim();
        const amt  = parseFloat(overlay.querySelector('#exp-amt').value) || 0;
        const cat  = overlay.querySelector('#exp-cat').value;
        const date = overlay.querySelector('#exp-date').value;

        let paidBy = overlay.querySelector('#exp-who').value;
        if (paidBy === '__manual__') paidBy = overlay.querySelector('#exp-who-manual').value.trim();

        const participants = [...overlay.querySelectorAll('.exp-check-row')]
          .filter(r => r.querySelector('[data-chk]').classList.contains('checked'))
          .map(r => r.dataset.name);

        if (!desc) { overlay.querySelector('#exp-desc').focus(); return; }
        if (!amt)  { overlay.querySelector('#exp-amt').focus();  return; }
        if (!paidBy) { overlay.querySelector('#exp-who').focus(); return; }
        // Без участников сумма при расчёте молча размажется на всех, кто
        // хоть раз упоминался в этой поездке (см. ExpensesState.computeSummary
        // fallback) — а не на тех, кого реально сняли/оставили сейчас.
        if (!participants.length) { alert('Отметь хотя бы одного участника расхода'); return; }

        // При редактировании обязательно сохраняем исходные createdAt/
        // createdBy — иначе normalizeExpense подставит новые (createdBy:
        // null), а от них зависит и право удаления своей записи (сравнение
        // с myUid), и порядок в списке (сортировка/orderBy по createdAt).
        const entry = ExpensesData.normalizeExpense(
          { desc, amount: amt, category: cat, paidBy, participants, date,
            createdAt: editing ? editing.createdAt : undefined,
            createdBy: editing ? editing.createdBy : undefined },
          expenseId || ('tmp_' + Date.now())
        );

        if (editing) {
          ExpensesState.updateExpense(_tripId, expenseId, entry);
          ExpensesFirebase.updateExpense(_tripId, expenseId, entry);
        } else {
          ExpensesState.addExpense(_tripId, entry);
          ExpensesFirebase.addExpense(_tripId, entry);
        }

        overlay.remove();
        refresh();
      });
    });
  }

  // ── Overlay: Settle ──────────────────────────────────────────

  function _showSettleForm(fromName, toName, amount) {
    document.getElementById('exp-settle-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'exp-settle-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">Погашение</span>
          <button class="exp-sheet__close" id="exp-sett-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="exp-sheet__body">
          <div class="exp-settle-info">
            <span class="exp-settle-name">${_esc(fromName)}</span>
            <i class="ti ti-arrow-right" aria-hidden="true"></i>
            <span class="exp-settle-name">${_esc(toName)}</span>
          </div>
          <div class="exp-form-label">Сумма ₽</div>
          <input class="exp-form-input" id="exp-sett-amt" type="number" value="${Math.round(amount || 0)}">
          <div class="exp-form-label" style="margin-top:8px">Дата</div>
          <input class="exp-form-input" id="exp-sett-date" type="date" value="${new Date().toISOString().split('T')[0]}">
          <div class="exp-form-label" style="margin-top:8px">Заметка</div>
          <input class="exp-form-input" id="exp-sett-note" type="text" placeholder="Необязательно">
        </div>
        <div class="exp-sheet__actions">
          <button class="exp-sheet__save" id="exp-sett-save">Сохранить</button>
        </div>
      </div>`;

    _el.appendChild(overlay);
    overlay.querySelector('#exp-sett-amt').focus();

    overlay.querySelector('#exp-sett-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    overlay.querySelector('#exp-sett-save').addEventListener('click', () => {
      const amt  = parseFloat(overlay.querySelector('#exp-sett-amt').value) || 0;
      const date = overlay.querySelector('#exp-sett-date').value;
      const note = overlay.querySelector('#exp-sett-note').value.trim();
      if (!amt) return;

      const entry = ExpensesData.normalizeSettlement(
        { fromName, toName, amount: amt, date, note },
        'tmp_' + Date.now()
      );
      ExpensesState.addSettlement(_tripId, entry);
      ExpensesFirebase.addSettlement(_tripId, entry);

      overlay.remove();
      refresh();
    });
  }

  // ── Overlay: Categories ──────────────────────────────────────

  function _showCatManager() {
    document.getElementById('exp-cat-overlay')?.remove();

    const cats    = ExpensesState.getCategories(_tripId);
    const overlay = document.createElement('div');
    overlay.id        = 'exp-cat-overlay';
    overlay.className = 'exp-overlay';

    const _renderCatList = () => {
      const current = ExpensesState.getCategories(_tripId);
      return current.map(c => `
        <div class="exp-cat-item" data-cat-id="${c.id}">
          <i class="ti ${c.icon}" style="font-size:18px;color:var(--accent)" aria-hidden="true"></i>
          <span class="exp-cat-item__title">${_esc(c.title)}</span>
          ${c.custom ? `
            <button class="exp-cat-item__del" data-action="del-cat" data-id="${c.id}" aria-label="Удалить">
              <i class="ti ti-x" aria-hidden="true"></i>
            </button>` : '<span style="width:24px"></span>'}
        </div>`).join('');
    };

    overlay.innerHTML = `
      <div class="exp-sheet">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">Категории</span>
          <button class="exp-sheet__close" id="exp-cat-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="exp-sheet__body">
          <div id="exp-cat-list">${_renderCatList()}</div>
          <div class="exp-cat-add-row">
            <input class="exp-form-input" id="exp-new-cat" type="text" placeholder="Название новой категории">
            <button class="exp-cat-add-btn" id="exp-add-cat-btn">
              <i class="ti ti-plus" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>`;

    _el.appendChild(overlay);

    overlay.querySelector('#exp-cat-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    overlay.addEventListener('click', ev => {
      const btn = ev.target.closest('[data-action="del-cat"]');
      if (!btn) return;
      const id = btn.dataset.id;
      ExpensesState.removeCategory(_tripId, id);
      ExpensesFirebase.saveCategories(_tripId, ExpensesState.getCategories(_tripId));
      overlay.querySelector('#exp-cat-list').innerHTML = _renderCatList();
    });

    const addCat = () => {
      const input = overlay.querySelector('#exp-new-cat');
      const title = input.value.trim();
      if (!title) return;
      ExpensesState.addCategory(_tripId, title);
      ExpensesFirebase.saveCategories(_tripId, ExpensesState.getCategories(_tripId));
      input.value = '';
      overlay.querySelector('#exp-cat-list').innerHTML = _renderCatList();
    };

    overlay.querySelector('#exp-add-cat-btn').addEventListener('click', addCat);
    overlay.querySelector('#exp-new-cat').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') addCat();
    });
  }

  // ── Event binding ────────────────────────────────────────────

  function _bind() {
    _el.querySelector('#exp-back').addEventListener('click', () => {
      ExpensesFirebase.stopListening();
      if (typeof ExpensesIndex !== 'undefined') ExpensesIndex.close();
    });

    _el.querySelector('#exp-cat-btn').addEventListener('click', () => _showCatManager());

    _bindTabs();
    _bindBody();
  }

  function _bindTabs() {
    _el.querySelector('#exp-tabs').addEventListener('click', ev => {
      const tab = ev.target.closest('[data-tab]');
      if (!tab) return;
      _tab = tab.dataset.tab;
      _el.querySelector('#exp-tabs').innerHTML = _tabs();
      _el.querySelector('#exp-body').innerHTML  = _body();
      _bindBody();
      // Note: no _bindTabs() here — listener stays on original element
    });
  }

  function _bindBody() {
    const body = _el?.querySelector('#exp-body');
    if (!body) return;

    if (_bodyHandler) body.removeEventListener('click', _bodyHandler);
    _bodyHandler = ev => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;

      const action = btn.dataset.action;

      if (action === 'add-expense') {
        _showExpenseForm(null);
        return;
      }
      if (action === 'edit-expense') {
        _showExpenseForm(btn.dataset.id);
        return;
      }
      if (action === 'del-expense') {
        const id = btn.dataset.id;
        ExpensesState.removeExpense(_tripId, id);
        ExpensesFirebase.deleteExpense(_tripId, id);
        refresh();
        return;
      }
      if (action === 'settle') {
        _showSettleForm(btn.dataset.from, btn.dataset.to, parseFloat(btn.dataset.amt));
        return;
      }
      if (action === 'del-settlement') {
        const id = btn.dataset.id;
        ExpensesState.removeSettlement(_tripId, id);
        ExpensesFirebase.deleteSettlement(_tripId, id);
        refresh();
        return;
      }
      if (action === 'export-csv') {
        const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
        ExpensesState.exportCSV(_tripId, trip ? trip.name : _tripId);
        return;
      }
    };
    body.addEventListener('click', _bodyHandler);
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _getMembers() {
  return ExpensesState.getMembers(_tripId);
  }

  function _rub(val) {
    return Math.round(val || 0).toLocaleString('ru-RU') + ' ₽';
  }

  function _rubVal(val) {
    return Math.round(val || 0).toLocaleString('ru-RU') + ' ₽';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function _fmtDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function _plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
    return many;
  }

  return { render, refresh };
})();

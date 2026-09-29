'use strict';

// Расходы поездки — редизайн v2 (макеты V2Expenses / V2ExpensesBalance /
// V2ExpenseCats / V2SheetExpense). Главная цель — «чтобы было прям всё
// понятно, кто заплатил и кто кому должен»: две вкладки вместо трёх
// (Записи / Кто кому), у каждой записи прямо написано, на кого делим,
// итог для тебя — простыми фразами. Расчёты (ExpensesState.computeSummary)
// не менялись — меняется только то, как они показаны.
const ExpensesRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _tab    = 'expenses'; // 'expenses' (Записи) | 'balance' (Кто кому) | 'budget' (Бюджет)
  let _bodyHandler = null;
  let _catsOpen = false;          // «По категориям» раскрыто — переживает refresh()
  const _openDays = new Set();    // дни, где нажали «Ещё N за этот день»

  const DAY_LIMIT = 4;            // сколько записей дня видно до «Ещё N»
  const EPS = 0.5;                // меньше полрубля — «в расчёте»

  // ── Entry point ──────────────────────────────────────────────

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    // Старая третья вкладка «Итог» влита в «Записи».
    if (_tab !== 'balance' && _tab !== 'budget') _tab = 'expenses';
    el.innerHTML = `
      <div class="exp-wrap">
        ${_topbar()}
        <div class="exp-segrow">
          <div class="exp-seg" id="exp-tabs" role="tablist">${_tabs()}</div>
          <button type="button" class="exp-more" id="exp-more" aria-label="Ещё: категории и участники по умолчанию, скачать CSV">
            ${UIUtils.ico('dots')}
          </button>
        </div>
        <div class="exp-body" id="exp-body">${_body()}</div>
        <button type="button" class="exp-fab" id="exp-fab" data-action="add-expense" ${_tab === 'budget' ? 'hidden' : ''}>
          ${UIUtils.ico('plus')} Расход
        </button>
      </div>`;
    _bind();
  }

  function refresh() {
    if (!_el || !_el.querySelector('#exp-body')) return;
    _el.querySelector('#exp-tabs').innerHTML = _tabs();
    _el.querySelector('#exp-body').innerHTML = _body();
    _bindBody();
  }

  // ── Topbar (только отдельная страница; в Гиде её прячет tripcover) ──

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
      </div>`;
  }

  // ── Tabs ─────────────────────────────────────────────────────

  function _tabs() {
    const tabs = [
      { id: 'expenses', label: 'Записи'   },
      { id: 'balance',  label: 'Кто кому' },
      { id: 'budget',   label: 'Бюджет'   },
    ];
    return tabs.map(t => `
      <button type="button" role="tab" class="exp-seg__btn ${_tab === t.id ? 'active' : ''}"
        aria-selected="${_tab === t.id}" data-tab="${t.id}">${t.label}</button>`).join('');
  }

  function _body() {
    if (_tab === 'balance') return _tabBalance();
    if (_tab === 'budget')  return _tabBudget();
    return _tabExpenses();
  }

  // ── Вкладка «Записи» ─────────────────────────────────────────

  function _tabExpenses() {
    const summary  = ExpensesState.computeSummary(_tripId);
    const expenses = ExpensesState.getExpenses(_tripId);
    const catMap   = _catMap();

    if (!expenses.length) {
      return `
        <div class="exp-scroll">
          <div class="exp-empty">
            <div class="exp-empty__title">Расходов пока нет</div>
            <div class="exp-empty__sub">Нажми «+ Расход» — укажи, кто платил и на кого делим. Долги посчитаются сами.</div>
          </div>
        </div>`;
    }

    return `
      <div class="exp-scroll">
        ${_summaryCard(summary, catMap)}
        <div class="exp-hint">У каждой записи — кто платил и на кого делим (поровну).</div>
        ${_dayGroups(expenses, catMap)}
      </div>`;
  }

  // Сводка: всего + моя часть, плашка «Тебе вернут / Ты должен» и
  // свёрнутые «По категориям» (бывшая вкладка «Итог»).
  function _summaryCard(summary, catMap) {
    const me  = _myRow(summary);
    const side = me
      ? `<div class="exp-sum-lbl">моя часть</div><div class="exp-sum-side__num">${_rub(me.owed)}</div>`
      : `<div class="exp-sum-lbl">на человека</div><div class="exp-sum-side__num">${_rub(summary.avgShare)}</div>`;

    let plate = '';
    if (me) {
      const net = me.netDiff;
      const cls = net > EPS ? 'pos' : net < -EPS ? 'neg' : 'zero';
      const text = net > EPS  ? `Тебе вернут <b>${_rub(net)}</b>`
                 : net < -EPS ? `Ты должен <b>${_rub(-net)}</b>`
                 : 'Ты в расчёте';
      plate = `
        <button type="button" class="exp-plate exp-plate--${cls}" data-action="go-balance">
          <span class="exp-plate__text">${text}</span>
          <span class="exp-plate__more">Подробнее ${UIUtils.ico('chevron-right')}</span>
        </button>`;
    }

    return `
      <div class="exp-card exp-sum">
        <div class="exp-sum-top">
          <div>
            <div class="exp-sum-lbl">Всего · ${summary.count} ${_plural(summary.count, 'запись', 'записи', 'записей')}</div>
            <div class="exp-sum-total">${_rub(summary.total)}</div>
          </div>
          <div class="exp-sum-side">${side}</div>
        </div>
        ${plate}
        ${_catsBlock(summary, catMap)}
      </div>`;
  }

  function _catsBlock(summary, catMap) {
    const total = summary.total || 0;
    const entries = Object.entries(summary.byCat || {}).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1]);
    if (!entries.length) return '';
    const top = (catMap[entries[0][0]] || { title: entries[0][0] }).title;
    const rows = entries.map(([id, amt]) => {
      const cat = catMap[id] || { title: id, icon: 'ti-dots' };
      const pct = total ? Math.round(amt / total * 100) : 0;
      return `
        <div class="exp-catrow">
          <span class="exp-catrow__ico"><i class="ti ${_catIco(cat.icon)}" aria-hidden="true"></i></span>
          <span class="exp-catrow__name">${_esc(cat.title)}</span>
          <span class="exp-catrow__pct">${pct < 1 && amt > 0 ? '<1' : pct}%</span>
          <span class="exp-catrow__amt">${_rub(amt)}</span>
        </div>`;
    }).join('');
    return `
      <details class="exp-cats" id="exp-cats" ${_catsOpen ? 'open' : ''}>
        <summary class="exp-cats__sum">
          <span>По категориям</span>
          <span class="exp-cats__top">больше всего — ${_esc(top)} ${UIUtils.ico('chevron-down', 'exp-cats__chev')}</span>
        </summary>
        ${rows}
      </details>`;
  }

  // Записи по дням (свежие сверху). Внутри дня — как было (по времени
  // добавления); после DAY_LIMIT — «Ещё N за этот день».
  function _dayGroups(expenses, catMap) {
    const byDay = {};
    expenses.forEach(e => {
      const d = e.date || '';
      (byDay[d] = byDay[d] || []).push(e);
    });
    const members = _getMembers();
    return Object.keys(byDay).sort((a, b) => b.localeCompare(a)).map(day => {
      const list = byDay[day];
      const sum  = list.reduce((s, e) => s + (parseFloat(e.amount) || 0), 0);
      const open = _openDays.has(day) || list.length <= DAY_LIMIT + 1;
      const shown = open ? list : list.slice(0, DAY_LIMIT);
      const rest  = list.length - shown.length;
      return `
        <div class="exp-day">
          <span class="exp-day__date">${_esc(_fmtDay(day))}</span>
          <span class="exp-day__sum">${_rub(sum)}</span>
        </div>
        <div class="exp-card exp-list">
          ${shown.map(e => _expenseRow(e, catMap, members)).join('')}
          ${rest > 0 ? `<button type="button" class="exp-list__more" data-action="more-day" data-day="${_esc(day)}">Ещё ${rest} за этот день</button>` : ''}
        </div>`;
    }).join('');
  }

  // Строка целиком — кнопка «открыть/редактировать». Удаление — внутри
  // листа (корзина на строке удаляла в одно касание, без подтверждения).
  function _expenseRow(e, catMap, members) {
    const cat = catMap[e.category] || { title: e.category, icon: 'ti-dots' };
    const split = _splitText(e, members);
    return `
      <button type="button" class="exp-entry" data-action="edit-expense" data-id="${e._id}">
        <span class="exp-entry__ico"><i class="ti ${_catIco(cat.icon)}" aria-hidden="true"></i></span>
        <span class="exp-entry__info">
          <span class="exp-entry__top">
            <span class="exp-entry__desc">${_esc(e.desc)}</span>
            <span class="exp-entry__amt">${_rub(e.amount)}</span>
          </span>
          <span class="exp-entry__meta">${_esc(cat.title)} · платил ${_esc(e.paidBy || '—')}</span>
          <span class="exp-entry__split ${split.muted ? 'muted' : ''}">${_esc(split.text)}</span>
        </span>
      </button>`;
  }

  // «на кого делим» одной фразой — главное, чего не хватало старому списку.
  function _splitText(e, members) {
    const parts = e.participants || [];
    // Пусто — computeSummary делит на всех, кто упоминался в поездке.
    if (!parts.length) return { text: 'делим на всех' };
    if (parts.length === 1 && parts[0] === e.paidBy) {
      return { text: `только ${parts[0]} — в долги не идёт`, muted: true };
    }
    if (parts.length === 1) return { text: `целиком на ${parts[0]}` };
    const all = members.length > 1 && members.every(m => parts.includes(m)) && parts.length === members.length;
    if (all) return { text: `делим на всех ${parts.length}: ${parts.join(', ')}` };
    return { text: `делим: ${parts.join(', ')}` };
  }

  // Удалить может автор записи или организатор поездки (как раньше корзина).
  function _canDeleteExpense(e) {
    const myUid = window.APP?.user?.uid;
    const isOrganizer = typeof TripsData !== 'undefined' && TripsData.canManage(TripsData.getById(_tripId));
    return myUid === e.createdBy || isOrganizer;
  }

  // ── Вкладка «Кто кому» ───────────────────────────────────────

  function _tabBalance() {
    const summary     = ExpensesState.computeSummary(_tripId);
    const settlements = ExpensesState.getSettlements(_tripId);
    const me          = _myRow(summary);
    const myName      = _myName();

    if (!summary.rows.length) {
      return `
        <div class="exp-scroll">
          <div class="exp-empty">
            <div class="exp-empty__title">Считать пока нечего</div>
            <div class="exp-empty__sub">Добавь первый расход — здесь появится, кто кому сколько переводит.</div>
          </div>
        </div>`;
    }

    const transfersHtml = summary.transfers.length === 0
      ? `<div class="exp-card exp-allclear">${UIUtils.ico('circle-check')} Все в расчёте — переводить никому не нужно.</div>`
      : `<div class="exp-card exp-list">${summary.transfers.map(t => {
          const mine = myName && (t.from === myName || t.to === myName);
          return `
            <div class="exp-tr">
              <div class="exp-tr__info">
                <span class="exp-tr__who"><b>${_esc(t.from)}</b> переводит <b>${_esc(t.to)}</b></span>
                <span class="exp-tr__amt">${_rub(t.amount)}</span>
              </div>
              <!-- До копейки, а не до рубля (Math.round тут раньше отбрасывал
                   дробную часть целиком — 33,33₽ округлялось до 33₽, а
                   недостающие 0,33₽ навсегда оседали недопогашенным долгом,
                   реальный баг, найден внешним ревью 2026-09-27) — но и не
                   сырой float (33.333333333333336), это поле потом видно и
                   редактируемо в форме погашения, туда нельзя тащить мусор
                   после запятой. -->
              <button type="button" class="exp-tr__btn ${mine ? 'mine' : ''}" data-action="settle"
                data-from="${_esc(t.from)}" data-to="${_esc(t.to)}" data-amt="${Math.round(t.amount * 100) / 100}">Погасить</button>
            </div>`;
        }).join('')}</div>`;

    const peopleHtml = summary.rows.map(r => {
      const net = r.netDiff;
      const cls = net > EPS ? 'pos' : net < -EPS ? 'neg' : 'zero';
      const val = net > EPS ? '+' + _rub(net) : net < -EPS ? '−' + _rub(-net) : '0 ₽';
      const cap = net > EPS ? 'ему вернут' : net < -EPS ? 'он должен' : 'в расчёте';
      const settled = Math.abs(r.diff - r.netDiff);
      return `
        <div class="exp-person">
          <span class="exp-person__av">${_esc(_initials(r.name))}</span>
          <span class="exp-person__info">
            <span class="exp-person__name">${_esc(r.name)}</span>
            <span class="exp-person__meta">потратил ${_rub(r.paid)}<br>его часть ${_rub(r.owed)}${settled > EPS ? `<br>уже погашено ${_rub(settled)}` : ''}</span>
          </span>
          <span class="exp-person__res">
            <span class="exp-person__diff exp-person__diff--${cls}">${val}</span>
            <span class="exp-person__cap">${cap}</span>
          </span>
        </div>`;
    }).join('');

    const historyHtml = settlements.length === 0
      ? `<div class="exp-hint exp-hint--body">Пока никто ничего не погасил. После «Погасить» перевод появится здесь — его можно отменить.</div>`
      : `<div class="exp-card exp-list">${settlements.map(s => `
          <div class="exp-hist">
            <div class="exp-hist__info">
              <span class="exp-hist__who"><b>${_esc(s.fromName)}</b> перевёл <b>${_esc(s.toName)}</b> · ${_rub(s.amount)}</span>
              <span class="exp-hist__meta">${_esc(_fmtDay(s.date))}${s.note ? ' · ' + _esc(s.note) : ''}</span>
            </div>
            <button type="button" class="exp-hist__undo" data-action="del-settlement" data-id="${s._id}">Отменить</button>
          </div>`).join('')}</div>`;

    return `
      <div class="exp-scroll">
        ${me ? _myResultCard(me, summary.transfers, myName) : ''}

        <div class="exp-sec">Переводы</div>
        <div class="exp-hint exp-hint--sec">Как рассчитаться меньшим числом переводов. Нажми «Погасить», когда деньги дошли.</div>
        ${transfersHtml}

        <div class="exp-sec">Как посчитано</div>
        <div class="exp-hint exp-hint--sec">Потратил — сколько человек заплатил сам. Его часть — сумма его долей во всех расходах, где он участвует.</div>
        <div class="exp-card exp-list">${peopleHtml}</div>

        <div class="exp-sec">История погашений</div>
        ${historyHtml}
      </div>`;
  }

  // «Итог для тебя» — простыми фразами, без знаков и терминов.
  function _myResultCard(me, transfers, myName) {
    const net = me.netDiff;
    const settled = Math.abs(me.diff - me.netDiff) > EPS;
    const base = `Ты потратил ${_rub(me.paid)}, из них на тебя пришлось ${_rub(me.owed)}.`;
    let head, cls, tail;
    if (net > EPS) {
      const from = transfers.filter(t => t.to === myName).map(t => t.from);
      head = `Тебе вернут ${_rub(net)}`; cls = 'pos';
      tail = from.length
        ? `${settled ? 'Часть уже погашена, остаток' : 'Разницу'} ${from.length > 1 ? 'переведут' : 'переведёт'} ${_joinNames(from)}.`
        : '';
    } else if (net < -EPS) {
      const to = transfers.filter(t => t.from === myName);
      head = `Ты должен ${_rub(-net)}`; cls = 'neg';
      tail = to.length
        ? (to.length === 1
            ? `${settled ? 'Часть уже погашена, остаток' : 'Разницу'} переведи ${_esc(to[0].to)}.`
            : 'Переведи: ' + to.map(t => `${_esc(t.to)} — ${_rub(t.amount)}`).join(', ') + '.')
        : '';
    } else {
      head = 'Ты в расчёте'; cls = 'zero';
      tail = Math.abs(me.diff) > EPS ? 'Все твои долги погашены.' : '';
    }
    return `
      <div class="exp-card exp-mine">
        <span class="exp-sum-lbl">Итог для тебя</span>
        <span class="exp-mine__head exp-mine__head--${cls}">${head}</span>
        <span class="exp-mine__text">${base}${tail ? ' ' + tail : ''}</span>
      </div>`;
  }

  // ── Вкладка «Бюджет» ─────────────────────────────────────────
  // «Бюджет до поездки» — заранее известные траты (билеты, аренда, трансфер).
  // Отдельно от расходов и их расчётов (ExpensesState.computeSummary), своя
  // подколлекция trips/{tripId}/budget — см. ExpensesState.computeBudgetSummary.

  function _tabBudget() {
    const summary = ExpensesState.computeBudgetSummary(_tripId);
    const lines   = ExpensesState.getBudget(_tripId);
    const members = _getMembers();
    const myName  = _myName();
    const myShare = myName ? (summary.shares[myName] || 0) : 0;

    const sumCard = `
      <div class="exp-card exp-sum">
        <div class="exp-sum-lbl">Твоя доля</div>
        <div class="exp-sum-total">≈ ${_rub(myShare)}</div>
        <div class="exp-budget-sub">из ${_rub(summary.total)} всего · ${summary.count} ${_plural(summary.count, 'строка', 'строки', 'строк')}</div>
      </div>`;

    const sharesHtml = summary.rows.length ? `
      <div class="exp-sec">Доли участников</div>
      <div class="exp-card exp-list">${summary.rows.map(r => `
        <div class="exp-budget-share">
          <span class="exp-budget-share__name">${_esc(r.name)}</span>
          <span class="exp-budget-share__amt">${_rub(r.amount)}</span>
        </div>`).join('')}</div>` : '';

    const linesHtml = lines.length
      ? `<div class="exp-card exp-list" id="exp-budget-list">${lines.map(l => _budgetRow(l, members)).join('')}</div>`
      : `<div class="exp-hint exp-hint--body">Пока нет ни одной строки бюджета.</div>`;

    return `
      <div class="exp-scroll">
        ${sumCard}
        ${sharesHtml}
        <div class="exp-sec">Строки бюджета</div>
        ${linesHtml}
        <button type="button" class="exp-cat-new" data-action="add-budget">${UIUtils.ico('plus')} Строка бюджета</button>
        <div class="exp-hint">Заранее известные траты — билеты, аренда катера или машины, трансфер. Это прикидка, а не расходы: в «Кто кому» не попадает.</div>
      </div>`;
  }

  // Строка бюджета — тап открывает лист правки, свайп влево — «Удалить»
  // (тот же приём, что у категорий — UIUtils.swipeToDelete).
  function _budgetRow(l, members) {
    const n = (l.participants || []).length;
    const all = members.length > 0 && n === members.length && members.every(m => l.participants.includes(m));
    const sub = all ? 'на всех' : `на ${n} чел.`;
    return `
      <div class="exp-cat-item exp-budget-item">
        <button type="button" class="exp-cat-item__main" data-action="edit-budget" data-id="${l._id}">
          <span class="exp-cat-item__ico">${UIUtils.ico('cash')}</span>
          <span class="exp-cat-item__body">
            <span class="exp-cat-item__title">${_esc(l.title)}</span>
            <span class="exp-cat-item__split">${sub}${l.note ? ' · ' + _esc(l.note) : ''}</span>
          </span>
          <span class="exp-budget-item__amt">${_rub(l.amount)}</span>
        </button>
        <button type="button" class="exp-cat-item__del" data-action="del-budget" data-id="${l._id}" aria-label="Удалить строку бюджета">Удалить</button>
      </div>`;
  }

  // ── Лист: добавить / изменить строку бюджета ─────────────────

  function _showBudgetForm(lineId) {
    document.getElementById('exp-budget-overlay')?.remove();

    const members = _getMembers();
    const editing = lineId ? ExpensesState.getBudget(_tripId).find(l => l._id === lineId) : null;
    const l = editing || {};
    // Новая строка — по умолчанию отмечены все участники (снять можно);
    // при редактировании — реальные участники строки.
    let checked = editing ? (l.participants || []).slice() : members.slice();

    const overlay = document.createElement('div');
    overlay.id        = 'exp-budget-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet" role="dialog" aria-label="Строка бюджета">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">${editing ? 'Строка бюджета' : 'Новая строка бюджета'}</span>
          <button type="button" class="exp-sheet__close" id="exp-bud-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="exp-sheet__body">
          <input class="exp-input" id="exp-bud-title" type="text" placeholder="Название — билеты, аренда катера…" value="${_esc(l.title || '')}" autocomplete="off">
          <label class="exp-amount">
            <span class="exp-sr">Сумма</span>
            <input id="exp-bud-amt" type="number" inputmode="decimal" placeholder="0" value="${l.amount || ''}">
            <span class="exp-amount__cur">₽</span>
          </label>
          <div class="exp-field">
            <span class="exp-field__lbl">Делим на</span>
            <div class="exp-chips" id="exp-bud-chips"></div>
          </div>
          <input class="exp-input" id="exp-bud-note" type="text" placeholder="Комментарий — необязательно" value="${_esc(l.note || '')}" autocomplete="off">
        </div>
        <div class="exp-sheet__actions">
          <button type="button" class="exp-sheet__save" id="exp-bud-save">${editing ? 'Сохранить' : 'Добавить строку'}</button>
          ${editing ? `<button type="button" class="exp-sheet__del" id="exp-bud-del">Удалить строку</button>` : ''}
        </div>
      </div>`;

    _el.appendChild(overlay);
    const $ = s => overlay.querySelector(s);

    const renderChips = () => {
      $('#exp-bud-chips').innerHTML = members.map(n => `
        <button type="button" class="exp-chip ${checked.includes(n) ? 'on' : ''}" aria-pressed="${checked.includes(n)}" data-name="${_esc(n)}">${_esc(n)}</button>`).join('');
    };
    renderChips();
    if (!editing) $('#exp-bud-title').focus();

    $('#exp-bud-chips').addEventListener('click', ev => {
      const chip = ev.target.closest('[data-name]');
      if (!chip) return;
      const n = chip.dataset.name;
      checked = checked.includes(n) ? checked.filter(x => x !== n) : checked.concat(n);
      renderChips();
    });

    $('#exp-bud-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    $('#exp-bud-del')?.addEventListener('click', async () => {
      const ok = await UIUtils.confirmSheet(`Удалить «${l.title || 'строку'}»?`, { okLabel: 'Удалить' });
      if (!ok) return;
      ExpensesState.removeBudgetLine(_tripId, l._id);
      ExpensesFirebase.deleteBudgetLine(_tripId, l._id);
      overlay.remove();
      refresh();
    });

    const saveBtn = $('#exp-bud-save');
    saveBtn.addEventListener('click', () => {
      UIUtils.withBusyButton(saveBtn, async () => {
        const title = $('#exp-bud-title').value.trim();
        const amt   = parseFloat($('#exp-bud-amt').value) || 0;
        const note  = $('#exp-bud-note').value.trim();

        if (!title) { $('#exp-bud-title').focus(); return; }
        if (!amt)   { $('#exp-bud-amt').focus();   return; }
        if (!checked.length) { alert('Отметь хотя бы одного участника'); return; }

        // Порядок участников — как в списке поездки, как в форме расхода.
        const participants = members.filter(m => checked.includes(m))
          .concat(checked.filter(n => !members.includes(n)));

        const entry = ExpensesData.normalizeBudgetLine(
          { title, amount: amt, participants, note,
            createdAt: editing ? editing.createdAt : undefined,
            createdBy: editing ? editing.createdBy : undefined },
          lineId || ('tmp_' + Date.now())
        );

        if (editing) {
          ExpensesState.updateBudgetLine(_tripId, lineId, entry);
          try {
            await ExpensesFirebase.updateBudgetLine(_tripId, lineId, entry);
          } catch (err) {
            // Откатываем оптимистичную правку — иначе список за этой формой
            // на следующем рендере показал бы будто сохранение прошло. Тот
            // же паттерн, что уже стоит у формы расхода/погашения.
            ExpensesState.updateBudgetLine(_tripId, lineId, editing);
            alert(err?.code === 'not-found'
              ? 'Эту строку бюджета уже удалили — сохранить правку некуда.'
              : 'Не удалось сохранить строку. Проверь соединение и попробуй ещё раз.');
            refresh();
            return;
          }
        } else {
          ExpensesState.addBudgetLine(_tripId, entry);
          try {
            await ExpensesFirebase.addBudgetLine(_tripId, entry);
            ActivityLog.add(_tripId, 'expense', `добавил в бюджет: ${title} — ${_rub(amt)}`);
          } catch (err) {
            ExpensesState.removeBudgetLine(_tripId, entry._id);
            alert('Не удалось сохранить строку. Проверь соединение и попробуй ещё раз.');
            refresh();
            return;
          }
        }

        overlay.remove();
        refresh();
      });
    });
  }

  // ── Лист: добавить / изменить расход ─────────────────────────

  function _showExpenseForm(expenseId) {
    document.getElementById('exp-overlay')?.remove();

    const cats    = ExpensesState.getCategories(_tripId);
    const members = _getMembers();
    const editing = expenseId ? ExpensesState.getExpenses(_tripId).find(e => e._id === expenseId) : null;
    const e       = editing || {};
    const myName  = _myName();

    // Новый расход — участники по умолчанию для категории (см.
    // ExpensesState.getCategorySplitDefault; без настройки — все). При
    // редактировании — реальные участники записи.
    let catId   = e.category || (cats[0] && cats[0].id) || 'other';
    let checked = editing
      ? (e.participants || []).slice()
      : ExpensesState.getCategorySplitDefault(_tripId, catId, members);
    // Кто платил: при редактировании — как записано; новый — пусто,
    // выбирают явно (подставлять добавившего путало, кто на самом деле платил).
    let paidBy  = editing ? (e.paidBy || '') : '';
    let manual  = !!(paidBy && !members.includes(paidBy));
    let catsAll = false;
    let openRow = '';  // 'payer' | 'split' — какая строка раскрыта

    const overlay = document.createElement('div');
    overlay.id        = 'exp-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet" role="dialog" aria-label="Расход">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">${editing ? 'Расход' : 'Новый расход'}</span>
          <button type="button" class="exp-sheet__close" id="exp-ov-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="exp-sheet__body">
          <label class="exp-amount">
            <span class="exp-sr">Сумма</span>
            <input id="exp-amt" type="number" inputmode="decimal" placeholder="0" value="${e.amount || ''}">
            <span class="exp-amount__cur">₽</span>
          </label>
          <input class="exp-input" id="exp-desc" type="text" placeholder="За что — бензин, продукты…" aria-label="Описание" value="${_esc(e.desc || '')}" autocomplete="off">
          <div class="exp-field">
            <span class="exp-field__lbl">Категория</span>
            <div class="exp-chips" id="exp-cat-chips"></div>
          </div>
          <div class="exp-group" id="exp-group"></div>
        </div>
        <div class="exp-sheet__actions">
          <button type="button" class="exp-sheet__save" id="exp-ov-save">${editing ? 'Сохранить' : 'Добавить расход'}</button>
          ${editing && _canDeleteExpense(e) ? `<button type="button" class="exp-sheet__del" id="exp-ov-del">Удалить расход</button>` : ''}
        </div>
      </div>`;

    _el.appendChild(overlay);
    const $ = s => overlay.querySelector(s);

    // Категории: первые 4 + выбранная, остальное — «Ещё N».
    const renderCats = () => {
      const idx = cats.findIndex(c => c.id === catId);
      let shown = catsAll ? cats : cats.slice(0, 4);
      if (!catsAll && idx >= 4) shown = shown.concat(cats[idx]);
      const rest = cats.length - shown.length;
      $('#exp-cat-chips').innerHTML = shown.map(c => `
        <button type="button" class="exp-chip ${c.id === catId ? 'on' : ''}" aria-pressed="${c.id === catId}" data-cat="${c.id}">${_esc(c.title)}</button>`).join('')
        + (rest > 0 ? `<button type="button" class="exp-chip exp-chip--more" data-cat-more="1">Ещё ${rest}</button>` : '');
    };

    const splitValue = () => {
      if (!checked.length) return 'никого';
      if (members.length && checked.length === members.length && members.every(m => checked.includes(m))) return `всех · ${checked.length}`;
      if (checked.length === 1) return checked[0] === paidBy ? `только ${checked[0]}` : checked[0];
      return checked.length <= 2 ? checked.join(', ') : `${checked.length} из ${members.length}`;
    };

    const dateValue = d => {
      const today = new Date().toISOString().split('T')[0];
      const yest  = new Date(Date.now() - 864e5).toISOString().split('T')[0];
      return d === today ? 'сегодня' : d === yest ? 'вчера' : _fmtDay(d);
    };

    // «Заплатил / Делим на / Дата» — строки-значения; первые две
    // раскрываются на месте (без вложенных листов).
    const dateVal = e.date || new Date().toISOString().split('T')[0];
    const renderGroup = () => {
      const dateIn = $('#exp-date');
      const curDate = dateIn ? dateIn.value : dateVal;
      const manualVal = $('#exp-who-manual') ? $('#exp-who-manual').value : (manual ? paidBy : '');
      $('#exp-group').innerHTML = `
        <button type="button" class="exp-vrow" data-row="payer" aria-expanded="${openRow === 'payer'}">
          <span class="exp-vrow__lbl">Заплатил</span>
          <span class="exp-vrow__val ${paidBy ? '' : 'empty'}">${_esc(paidBy || 'выбери')}${UIUtils.ico(openRow === 'payer' ? 'chevron-up' : 'chevron-down')}</span>
        </button>
        ${openRow === 'payer' ? `
          <div class="exp-vrow__panel">
            <div class="exp-chips">
              ${members.map(n => `<button type="button" class="exp-chip ${!manual && paidBy === n ? 'on' : ''}" data-payer="${_esc(n)}">${_esc(n)}</button>`).join('')}
              <button type="button" class="exp-chip exp-chip--more ${manual ? 'on' : ''}" data-payer-manual="1">Вписать вручную</button>
            </div>
            <input class="exp-input" id="exp-who-manual" type="text" placeholder="Имя" style="${manual ? '' : 'display:none'}" value="${_esc(manualVal)}">
          </div>` : ''}
        <button type="button" class="exp-vrow" data-row="split" aria-expanded="${openRow === 'split'}">
          <span class="exp-vrow__lbl">Делим на</span>
          <span class="exp-vrow__val ${checked.length ? '' : 'empty'}">${_esc(splitValue())}${UIUtils.ico(openRow === 'split' ? 'chevron-up' : 'chevron-down')}</span>
        </button>
        ${openRow === 'split' ? `
          <div class="exp-vrow__panel">
            ${members.map(n => `
              <div class="exp-check-row" data-name="${_esc(n)}">
                <div class="exp-checkbox ${checked.includes(n) ? 'checked' : ''}" data-chk="1"></div>
                <span class="exp-check-name">${_esc(n)}</span>
              </div>`).join('')}
            <div class="exp-checks-actions">
              <button type="button" class="exp-checks-btn" data-split-all="1">Все</button>
              <button type="button" class="exp-checks-btn" data-split-none="1">Снять всех</button>
            </div>
            <div class="exp-hint">Сумма делится поровну между отмеченными.</div>
          </div>` : ''}
        <label class="exp-vrow exp-vrow--date">
          <span class="exp-vrow__lbl">Дата</span>
          <span class="exp-vrow__val"><span id="exp-date-txt">${_esc(dateValue(curDate))}</span>${UIUtils.ico('calendar')}</span>
          <input id="exp-date" type="date" value="${curDate}" aria-label="Дата">
        </label>`;
    };

    renderCats();
    renderGroup();
    if (!editing) $('#exp-amt').focus();

    // Если введено вручную — запоминаем, чтобы не потерять при перерисовке.
    const syncManual = () => {
      const m = $('#exp-who-manual');
      if (manual && m) paidBy = m.value.trim();
    };

    $('#exp-cat-chips').addEventListener('click', ev => {
      if (ev.target.closest('[data-cat-more]')) { catsAll = true; renderCats(); return; }
      const chip = ev.target.closest('[data-cat]');
      if (!chip) return;
      catId = chip.dataset.cat;
      // Категория сменилась — переприменяем её умолчание по участникам
      // (и при редактировании: пользователь сам явно поменял категорию).
      checked = ExpensesState.getCategorySplitDefault(_tripId, catId, members);
      syncManual();
      renderCats();
      renderGroup();
    });

    $('#exp-group').addEventListener('click', ev => {
      const row = ev.target.closest('[data-row]');
      if (row) {
        syncManual();
        openRow = openRow === row.dataset.row ? '' : row.dataset.row;
        renderGroup();
        return;
      }
      const p = ev.target.closest('[data-payer]');
      if (p) { manual = false; paidBy = p.dataset.payer; openRow = ''; renderGroup(); return; }
      if (ev.target.closest('[data-payer-manual]')) {
        manual = true; paidBy = ''; renderGroup();
        $('#exp-who-manual').focus();
        return;
      }
      if (ev.target.closest('[data-split-all]'))  { checked = members.slice(); syncManual(); renderGroup(); return; }
      if (ev.target.closest('[data-split-none]')) { checked = []; syncManual(); renderGroup(); return; }
      const chk = ev.target.closest('.exp-check-row');
      if (chk) {
        const n = chk.dataset.name;
        checked = checked.includes(n) ? checked.filter(x => x !== n) : checked.concat(n);
        syncManual();
        renderGroup();
      }
    });
    $('#exp-group').addEventListener('input', ev => {
      if (ev.target.id === 'exp-who-manual') paidBy = ev.target.value.trim();
    });
    $('#exp-group').addEventListener('change', ev => {
      if (ev.target.id === 'exp-date') $('#exp-date-txt').textContent = dateValue(ev.target.value);
    });

    $('#exp-ov-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    $('#exp-ov-del')?.addEventListener('click', async () => {
      const ok = await UIUtils.confirmSheet(`Удалить «${e.desc || 'расход'}»?`, { okLabel: 'Удалить' });
      if (!ok) return;
      ExpensesState.removeExpense(_tripId, e._id);
      ExpensesFirebase.deleteExpense(_tripId, e._id);
      overlay.remove();
      refresh();
    });

    const saveBtn = $('#exp-ov-save');
    saveBtn.addEventListener('click', () => {
      UIUtils.withBusyButton(saveBtn, async () => {
        syncManual();
        const desc = $('#exp-desc').value.trim();
        const amt  = parseFloat($('#exp-amt').value) || 0;
        const date = $('#exp-date').value;

        let who = paidBy;
        if (manual && who) {
          // Вручную вписанное имя, совпадающее (без учёта регистра) с уже
          // существующим участником — подставляем его точное имя, а не
          // заводим строку-двойника (реальный кейс: «Дмитрий» вписали
          // руками вместо «Dmitry» — «кто кому» считал его отдельным
          // человеком). Настоящих гостей это не трогает.
          const match = members.find(m => m.toLowerCase() === who.toLowerCase());
          if (match) who = match;
        }

        if (!amt)  { $('#exp-amt').focus();  return; }
        if (!desc) { $('#exp-desc').focus(); return; }
        if (!who)  { openRow = 'payer'; renderGroup(); return; }
        // Без участников сумма при расчёте молча размажется на всех, кто
        // хоть раз упоминался в поездке (fallback в computeSummary).
        if (!checked.length) { openRow = 'split'; renderGroup(); alert('Отметь хотя бы одного участника расхода'); return; }

        // Порядок участников — как в списке поездки (как было с чек-листом).
        const participants = members.filter(m => checked.includes(m))
          .concat(checked.filter(n => !members.includes(n)));

        // При редактировании сохраняем исходные createdAt/createdBy — от
        // них зависят право удаления своей записи и порядок в списке.
        const entry = ExpensesData.normalizeExpense(
          { desc, amount: amt, category: catId, paidBy: who, participants, date,
            createdAt: editing ? editing.createdAt : undefined,
            createdBy: editing ? editing.createdBy : undefined },
          expenseId || ('tmp_' + Date.now())
        );

        // Раньше запись в Firestore не ожидалась — форма закрывалась сразу
        // по локальному (оптимистичному) состоянию, а отказ базы улетал
        // только в консоль, пользователь думал, что расход сохранён, хотя
        // он никуда не попал. Реальный баг, найден внешним ревью 2026-09-27.
        if (editing) {
          ExpensesState.updateExpense(_tripId, expenseId, entry);
          try {
            await ExpensesFirebase.updateExpense(_tripId, expenseId, entry);
          } catch (err) {
            // Откатываем оптимистичную правку — иначе список за этой
            // формой (сейчас скрыт под ней) на следующем рендере покажет
            // будто сохранение прошло, хотя запись в базу не попала.
            // .update() (см. ExpensesFirebase.updateExpense) падает с
            // not-found, если запись успели удалить с другого устройства,
            // пока форма была открыта — тогда "Сохранить" раньше тихо
            // создавал её заново неполной. Реальный баг, найден внешним
            // ревью 2026-09-27.
            ExpensesState.updateExpense(_tripId, expenseId, editing);
            alert(err?.code === 'not-found'
              ? 'Этот расход уже удалили — сохранить правку некуда.'
              : 'Не удалось сохранить расход. Проверь соединение и попробуй ещё раз.');
            refresh();
            return;
          }
        } else {
          ExpensesState.addExpense(_tripId, entry);
          try {
            await ExpensesFirebase.addExpense(_tripId, entry);
            ActivityLog.add(_tripId, 'expense', `добавил расход: ${desc} — ${_rub(amt)}`);
          } catch (err) {
            ExpensesState.removeExpense(_tripId, entry._id);
            alert('Не удалось сохранить расход. Проверь соединение и попробуй ещё раз.');
            refresh();
            return;
          }
        }

        overlay.remove();
        refresh();
      });
    });
  }

  // ── Лист: погашение ──────────────────────────────────────────

  function _showSettleForm(fromName, toName, amount) {
    document.getElementById('exp-settle-overlay')?.remove();
    // Один id на всё время жизни этой формы (не на каждый клик) — см.
    // ExpensesFirebase.addSettlement: пишет по нему напрямую, так что
    // повторная попытка (двойной клик) перезаписывает тот же документ,
    // а не создаёт второй платёж.
    const settleId = 'settle_' + Date.now() + '_' + Math.random().toString(36).slice(2);

    const overlay = document.createElement('div');
    overlay.id        = 'exp-settle-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet" role="dialog" aria-label="Погашение">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__title">Погасить</span>
          <button type="button" class="exp-sheet__close" id="exp-sett-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="exp-sheet__body">
          <div class="exp-settle-who"><b>${_esc(fromName)}</b> переводит <b>${_esc(toName)}</b></div>
          <label class="exp-amount">
            <span class="exp-sr">Сумма</span>
            <!-- До копейки (не до рубля — см. разбор у кнопки "Погасить"
                 выше), но округлено, а не сырой float — поле видно и
                 редактируется вручную. -->
            <input id="exp-sett-amt" type="number" inputmode="decimal" value="${Math.round((amount || 0) * 100) / 100}">
            <span class="exp-amount__cur">₽</span>
          </label>
          <div class="exp-field">
            <span class="exp-field__lbl">Дата</span>
            <input class="exp-input" id="exp-sett-date" type="date" value="${new Date().toISOString().split('T')[0]}">
          </div>
          <div class="exp-field">
            <span class="exp-field__lbl">Заметка</span>
            <input class="exp-input" id="exp-sett-note" type="text" placeholder="Необязательно — например, «на карту»">
          </div>
          <div class="exp-hint">Отметь, когда деньги дошли. Перевод попадёт в историю погашений — его можно отменить.</div>
        </div>
        <div class="exp-sheet__actions">
          <button type="button" class="exp-sheet__save" id="exp-sett-save">Деньги дошли</button>
        </div>
      </div>`;

    _el.appendChild(overlay);

    overlay.querySelector('#exp-sett-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });

    const settleSaveBtn = overlay.querySelector('#exp-sett-save');
    settleSaveBtn.addEventListener('click', () => {
      // withBusyButton отключает кнопку на время запроса — раньше кнопка
      // оставалась активной, пока первая запись ещё сохранялась, и двойной
      // клик/тап успевал уйти второй попыткой раньше, чем пришёл ответ на
      // первую: долг Б→А на 100 ₽ после двух нажатий превращался в долг
      // А→Б на 100 ₽ (два зачтённых платежа вместо одного). Реальный баг,
      // найден внешним ревью 2026-09-27. settleId — стабильный id этой
      // формы (см. выше), вторая линия защиты: даже если кнопка всё же
      // не спасла, ExpensesFirebase.addSettlement пишет по одному и тому
      // же id, а не создаёт новый документ на каждый вызов.
      UIUtils.withBusyButton(settleSaveBtn, async () => {
        const amt  = parseFloat(overlay.querySelector('#exp-sett-amt').value) || 0;
        const date = overlay.querySelector('#exp-sett-date').value;
        const note = overlay.querySelector('#exp-sett-note').value.trim();
        // amt <= 0 (было !amt) — !amt пропускал отрицательные суммы:
        // "-100" отклонялось бы только нулём, а отрицательное погашение в
        // расчёте не уменьшает долг, а увеличивает его. Реальный баг,
        // найден внешним ревью 2026-09-27.
        if (amt <= 0) { overlay.querySelector('#exp-sett-amt').focus(); return; }

        const entry = ExpensesData.normalizeSettlement(
          { fromName, toName, amount: amt, date, note },
          settleId
        );
        // Раньше запись в Firestore не ожидалась (и addSettlement глотал
        // ошибку без re-throw) — форма закрывалась сразу по локальному
        // (оптимистичному) состоянию, и локальный расчёт уже показывал долг
        // погашенным, даже если перевод никуда не попал — на другом
        // устройстве или после обновления страницы долг возвращался. Тот же
        // баг, что уже чинили для формы расхода выше. Реальный баг, найден
        // внешним ревью 2026-09-27.
        ExpensesState.addSettlement(_tripId, entry);
        try {
          await ExpensesFirebase.addSettlement(_tripId, entry);
        } catch (err) {
          ExpensesState.removeSettlement(_tripId, entry._id);
          alert('Не удалось сохранить погашение. Проверь соединение и попробуй ещё раз.');
          refresh();
          return;
        }

        overlay.remove();
        refresh();
      });
    });
  }

  // ── Лист «…»: категории, CSV ─────────────────────────────────

  function _showMoreMenu() {
    document.getElementById('exp-more-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id        = 'exp-more-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet" role="dialog" aria-label="Ещё">
        <div class="exp-sheet__handle"></div>
        <div class="exp-card exp-list exp-menu">
          <button type="button" class="exp-menu__row" data-menu="cats">
            <span class="exp-entry__ico">${UIUtils.ico('tag')}</span>
            <span class="exp-menu__text">
              <span class="exp-menu__title">Категории и участники по умолчанию</span>
              <span class="exp-menu__sub">на кого делить новые расходы каждой категории</span>
            </span>
          </button>
          <button type="button" class="exp-menu__row" data-menu="csv">
            <span class="exp-entry__ico">${UIUtils.ico('download')}</span>
            <span class="exp-menu__text">
              <span class="exp-menu__title">Скачать CSV</span>
              <span class="exp-menu__sub">расходы и погашения — для таблицы</span>
            </span>
          </button>
        </div>
        <button type="button" class="exp-menu__cancel" data-menu="close">Отмена</button>
      </div>`;
    _el.appendChild(overlay);
    overlay.addEventListener('click', ev => {
      if (ev.target === overlay) { overlay.remove(); return; }
      const b = ev.target.closest('[data-menu]');
      if (!b) return;
      overlay.remove();
      if (b.dataset.menu === 'cats') _showCatManager();
      if (b.dataset.menu === 'csv') {
        const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
        ExpensesState.exportCSV(_tripId, trip ? trip.name : _tripId);
      }
    });
  }

  // ── Лист: категории ──────────────────────────────────────────

  function _showCatManager() {
    document.getElementById('exp-cat-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id        = 'exp-cat-overlay';
    overlay.className = 'exp-overlay';

    const members = _getMembers();

    // Подпись — на кого по умолчанию делятся новые расходы категории
    // (см. ExpensesState.setCategorySplitDefault). Без настройки — все.
    const _split = c => {
      const names = Array.isArray(c.splitDefault) ? c.splitDefault.filter(n => members.includes(n)) : [];
      if (!names.length) return { text: 'все участники', custom: false };
      return { text: names.length <= 3 ? names.join(', ') : names.length + ' из ' + members.length, custom: true };
    };

    // Удалять можно только свои (custom) категории — как и раньше; у них
    // под строкой кнопка «Удалить», выезжает свайпом влево.
    const _renderCatList = () => ExpensesState.getCategories(_tripId).map(c => {
      const s = _split(c);
      return `
        <div class="exp-cat-item" data-cat-id="${c.id}">
          <button type="button" class="exp-cat-item__main" data-action="edit-split" data-id="${c.id}">
            <span class="exp-cat-item__ico"><i class="ti ${_catIco(c.icon)}" aria-hidden="true"></i></span>
            <span class="exp-cat-item__body">
              <span class="exp-cat-item__title">${_esc(c.title)}</span>
              <span class="exp-cat-item__split ${s.custom ? 'custom' : ''}">делить: ${_esc(s.text)}</span>
            </span>
            ${UIUtils.ico('chevron-right', 'exp-cat-item__chev')}
          </button>
          ${c.custom ? `<button type="button" class="exp-cat-item__del" data-action="del-cat" data-id="${c.id}" aria-label="Удалить категорию">Удалить</button>` : ''}
        </div>`;
    }).join('');

    overlay.innerHTML = `
      <div class="exp-sheet exp-sheet--tall" role="dialog" aria-label="Категории">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__titles">
            <span class="exp-sheet__title">Категории</span>
            <span class="exp-sheet__sub">и на кого делить по умолчанию</span>
          </span>
          <button type="button" class="exp-sheet__close" id="exp-cat-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="exp-sheet__body">
          <div id="exp-cat-list">${_renderCatList()}</div>
          <button type="button" class="exp-cat-new" id="exp-cat-new">${UIUtils.ico('plus')} Новая категория</button>
          <div class="exp-cat-add-row" id="exp-cat-add-row" hidden>
            <input class="exp-input" id="exp-new-cat" type="text" placeholder="Название категории">
            <button type="button" class="exp-cat-add-btn" id="exp-add-cat-btn">Добавить</button>
          </div>
          <div class="exp-hint">Выбери, на кого по умолчанию делится категория — при новом расходе участники отметятся сами. Свою категорию можно удалить, смахнув её влево.</div>
        </div>
      </div>`;

    _el.appendChild(overlay);
    const list = overlay.querySelector('#exp-cat-list');
    UIUtils.swipeToDelete(list, '.exp-cat-item', '.exp-cat-item__del');

    overlay.querySelector('#exp-cat-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => {
      if (ev.target === overlay) { overlay.remove(); return; }

      const del = ev.target.closest('[data-action="del-cat"]');
      if (del) {
        ExpensesState.removeCategory(_tripId, del.dataset.id);
        ExpensesFirebase.saveCategories(_tripId, ExpensesState.getCategories(_tripId));
        list.innerHTML = _renderCatList();
        refresh();
        return;
      }
      const edit = ev.target.closest('[data-action="edit-split"]');
      if (edit) {
        _showSplitPicker(edit.dataset.id, () => { list.innerHTML = _renderCatList(); });
      }
    });

    overlay.querySelector('#exp-cat-new').addEventListener('click', () => {
      overlay.querySelector('#exp-cat-new').hidden = true;
      overlay.querySelector('#exp-cat-add-row').hidden = false;
      overlay.querySelector('#exp-new-cat').focus();
    });

    const addCat = () => {
      const input = overlay.querySelector('#exp-new-cat');
      const title = input.value.trim();
      if (!title) { input.focus(); return; }
      ExpensesState.addCategory(_tripId, title);
      ExpensesFirebase.saveCategories(_tripId, ExpensesState.getCategories(_tripId));
      input.value = '';
      list.innerHTML = _renderCatList();
    };
    overlay.querySelector('#exp-add-cat-btn').addEventListener('click', addCat);
    overlay.querySelector('#exp-new-cat').addEventListener('keydown', ev => {
      if (ev.key === 'Enter') addCat();
    });
  }

  // Пикер «на кого по умолчанию делить расходы этой категории»: две
  // крупные опции — «Все участники» / «Выбранные» (+ чек-лист). Сохраняет
  // умолчание категории (ExpensesState.setCategorySplitDefault).
  function _showSplitPicker(catId, onSaved) {
    document.getElementById('exp-split-overlay')?.remove();

    const members = _getMembers();
    const cat     = ExpensesState.getCategories(_tripId).find(c => c.id === catId);
    if (!cat) return;
    let checked = ExpensesState.getCategorySplitDefault(_tripId, catId, members);
    let mode = (checked.length && checked.length < members.length) ? 'some' : 'all';

    const overlay = document.createElement('div');
    overlay.id        = 'exp-split-overlay';
    overlay.className = 'exp-overlay';
    overlay.innerHTML = `
      <div class="exp-sheet" role="dialog" aria-label="Участники по умолчанию">
        <div class="exp-sheet__handle"></div>
        <div class="exp-sheet__head">
          <span class="exp-sheet__titles">
            <span class="exp-sheet__title">${_esc(cat.title)}</span>
            <span class="exp-sheet__sub">на кого делить по умолчанию</span>
          </span>
          <button type="button" class="exp-sheet__close" id="exp-split-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="exp-sheet__body" id="exp-split-body"></div>
        <div class="exp-sheet__actions">
          <button type="button" class="exp-sheet__save" id="exp-split-save">Сохранить</button>
        </div>
      </div>`;
    _el.appendChild(overlay);
    const body = overlay.querySelector('#exp-split-body');

    const draw = () => {
      body.innerHTML = `
        <div class="exp-opt-group">
          <button type="button" class="exp-opt ${mode === 'all' ? 'on' : ''}" data-mode="all">
            <span class="exp-radio"></span>
            <span class="exp-opt__text"><span class="exp-opt__title">Все участники</span><span class="exp-opt__sub">и те, кто присоединится позже</span></span>
          </button>
          <button type="button" class="exp-opt ${mode === 'some' ? 'on' : ''}" data-mode="some">
            <span class="exp-radio"></span>
            <span class="exp-opt__text"><span class="exp-opt__title">Выбранные</span><span class="exp-opt__sub">например, топливо — только на тех, кто в лодке</span></span>
          </button>
        </div>
        ${mode === 'some' ? `<div class="exp-checks">${members.map(n => `
          <div class="exp-check-row" data-name="${_esc(n)}">
            <div class="exp-checkbox ${checked.includes(n) ? 'checked' : ''}" data-chk="1"></div>
            <span class="exp-check-name">${_esc(n)}</span>
          </div>`).join('')}</div>` : ''}`;
    };
    draw();

    overlay.querySelector('#exp-split-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', ev => { if (ev.target === overlay) overlay.remove(); });
    body.addEventListener('click', ev => {
      const m = ev.target.closest('[data-mode]');
      if (m) { mode = m.dataset.mode; draw(); return; }
      const row = ev.target.closest('.exp-check-row');
      if (row) {
        const n = row.dataset.name;
        checked = checked.includes(n) ? checked.filter(x => x !== n) : checked.concat(n);
        draw();
      }
    });

    overlay.querySelector('#exp-split-save').addEventListener('click', () => {
      const picked = members.filter(m => checked.includes(m));
      // «Все» (или отмечены все / никто) — это «нет настройки», а не
      // фиксированный сегодняшний список: новые участники тоже попадут.
      const value = (mode === 'some' && picked.length && picked.length < members.length) ? picked : null;
      ExpensesState.setCategorySplitDefault(_tripId, catId, value);
      ExpensesFirebase.saveCategories(_tripId, ExpensesState.getCategories(_tripId));
      overlay.remove();
      onSaved && onSaved();
    });
  }

  // ── Event binding ────────────────────────────────────────────

  function _bind() {
    _el.querySelector('#exp-back').addEventListener('click', () => {
      ExpensesFirebase.stopListening();
      if (typeof ExpensesIndex !== 'undefined') ExpensesIndex.close();
    });
    _el.querySelector('#exp-more').addEventListener('click', () => _showMoreMenu());
    // FAB вне #exp-body — одна на обе вкладки. data-action="add-expense"
    // на ней ищет и кликает modules/home (быстрое «+ Расход»).
    _el.querySelector('#exp-fab').addEventListener('click', () => _showExpenseForm(null));
    _el.querySelector('#exp-tabs').addEventListener('click', ev => {
      const tab = ev.target.closest('[data-tab]');
      if (!tab) return;
      _setTab(tab.dataset.tab);
    });
    _bindBody();
  }

  function _setTab(tab) {
    _tab = tab;
    // На «Бюджете» своя кнопка «+ Строка бюджета» — «+ Расход» там путает
    const fab = _el.querySelector('#exp-fab');
    if (fab) fab.hidden = tab === 'budget';
    refresh();
    _el.querySelector('#exp-body')?.scrollTo?.(0, 0);
  }

  function _bindBody() {
    const body = _el?.querySelector('#exp-body');
    if (!body) return;

    // Раскрытие «По категорий» запоминаем, чтобы refresh() (живые
    // обновления из Firestore) не схлопывал его.
    body.querySelector('#exp-cats')?.addEventListener('toggle', ev => { _catsOpen = ev.target.open; });

    // Строки бюджета — удаление свайпом влево (как категории).
    const budList = body.querySelector('#exp-budget-list');
    if (budList) UIUtils.swipeToDelete(budList, '.exp-budget-item', '.exp-cat-item__del');

    if (_bodyHandler) body.removeEventListener('click', _bodyHandler);
    _bodyHandler = async ev => {
      const btn = ev.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'go-balance') { _setTab('balance'); return; }
      if (action === 'edit-expense') { _showExpenseForm(btn.dataset.id); return; }
      if (action === 'more-day') { _openDays.add(btn.dataset.day); refresh(); return; }
      if (action === 'add-budget')  { _showBudgetForm(null); return; }
      if (action === 'edit-budget') { _showBudgetForm(btn.dataset.id); return; }
      if (action === 'del-budget') {
        const id = btn.dataset.id;
        const l  = ExpensesState.getBudget(_tripId).find(x => x._id === id);
        const ok = await UIUtils.confirmSheet(l ? `Удалить «${l.title}»?` : 'Удалить строку бюджета?', { okLabel: 'Удалить' });
        if (!ok) return;
        ExpensesState.removeBudgetLine(_tripId, id);
        ExpensesFirebase.deleteBudgetLine(_tripId, id);
        refresh();
        return;
      }
      if (action === 'settle') {
        _showSettleForm(btn.dataset.from, btn.dataset.to, parseFloat(btn.dataset.amt));
        return;
      }
      if (action === 'del-settlement') {
        const id = btn.dataset.id;
        const s  = ExpensesState.getSettlements(_tripId).find(x => x._id === id);
        const ok = await UIUtils.confirmSheet(
          s ? `Отменить погашение: ${s.fromName} → ${s.toName}, ${_rub(s.amount)}? Долг снова появится в переводах.` : 'Отменить погашение?',
          { okLabel: 'Отменить погашение' });
        if (!ok) return;
        ExpensesState.removeSettlement(_tripId, id);
        ExpensesFirebase.deleteSettlement(_tripId, id);
        refresh();
      }
    };
    body.addEventListener('click', _bodyHandler);
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _getMembers() {
    return ExpensesState.getMembers(_tripId);
  }

  // Иконка категории — класс Tabler из данных (может лежать в Firestore).
  // ti-parking в урезанном шрифте нет — показываем машину, данные не трогаем.
  function _catIco(icon) {
    if (!icon) return 'ti-tag';
    return icon === 'ti-parking' ? 'ti-car' : icon;
  }

  function _catMap() {
    return Object.fromEntries(ExpensesState.getCategories(_tripId).map(c => [c.id, c]));
  }

  // Моё имя в этой поездке: участник с моим uid, иначе имя профиля.
  function _myName() {
    const uid  = window.APP?.user?.uid;
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const p = uid && (trip?.participants || []).find(x => x && x.uid === uid);
    return (p && p.name) || window.APP?.profile?.displayName || '';
  }

  function _myRow(summary) {
    const n = _myName();
    return n ? summary.rows.find(r => r.name === n) || null : null;
  }

  function _joinNames(arr) {
    const a = arr.map(_esc);
    return a.length <= 1 ? (a[0] || '') : a.slice(0, -1).join(', ') + ' и ' + a[a.length - 1];
  }

  function _rub(val) {
    return Math.round(val || 0).toLocaleString('ru-RU') + '\u00A0₽'; // неразрывный: «₽» не уезжает на новую строку
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  // «21 сентября» (+ год, если не текущий).
  function _fmtDay(str) {
    if (!str) return 'без даты';
    const d = new Date(str + 'T00:00:00');
    if (isNaN(d)) return str;
    const opts = { day: 'numeric', month: 'long' };
    if (d.getFullYear() !== new Date().getFullYear()) opts.year = 'numeric';
    return d.toLocaleDateString('ru-RU', opts).replace(/\s?г\.$/, '');
  }

  function _plural(n, one, few, many) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return one;
    if (mod10 >= 2 && mod10 <= 4 && !(mod100 >= 12 && mod100 <= 14)) return few;
    return many;
  }

  return { render, refresh };
})();

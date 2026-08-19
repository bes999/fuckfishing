'use strict';

const CatchesRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _tab    = 'stats'; // 'stats' | 'add'
  let _bodyHandler = null;

  // ── Entry point ──────────────────────────────────────────────

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    el.innerHTML = `
      <div class="ct-wrap">
        ${_topbar()}
        <div class="ct-tabs" id="ct-tabs">${_tabs()}</div>
        <div class="ct-body" id="ct-body">${_body()}</div>
      </div>`;
    _bind();
  }

  function refresh() {
    if (!_el) return;
    const body = _el.querySelector('#ct-body');
    if (body) body.innerHTML = _body();
    _bindBody();
  }

  // ── Topbar ───────────────────────────────────────────────────

  function _topbar() {
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    return `
      <div class="ct-topbar">
        <button class="ct-back" id="ct-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="ct-topbar__text">
          <div class="ct-topbar__title">Поимки</div>
          <div class="ct-topbar__sub">${trip ? _esc(trip.name) : ''}</div>
        </div>
      </div>`;
  }

  // ── Tabs ─────────────────────────────────────────────────────

  function _tabs() {
    return `
      <div class="ct-tab ${_tab === 'stats' ? 'active' : ''}" data-tab="stats">Статистика</div>
      <div class="ct-tab ${_tab === 'add'   ? 'active' : ''}" data-tab="add">+ Добавить</div>`;
  }

  // ── Body dispatcher ──────────────────────────────────────────

  function _body() {
    return _tab === 'stats' ? _tabStats() : _tabAdd();
  }

  // ── Tab: Stats ───────────────────────────────────────────────

  function _tabStats() {
    const stats   = CatchesState.computeStats(_tripId);
    const catches = CatchesState.getCatches(_tripId);

    if (!catches.length) {
      return `
        <div class="ct-scroll">
          <div class="ct-empty">
            <div class="ct-empty__icon">🎣</div>
            <div class="ct-empty__title">Улов пока пустой</div>
            <div class="ct-empty__sub">Добавьте первую поимку во вкладке «+ Добавить»</div>
          </div>
        </div>`;
    }

    // Цвета для баров
    const COLORS = ['var(--accent)','var(--green)','var(--orange)','var(--red)',
                    '#BF5AF2','#64D2FF','#FF6961','#5AC8FA'];

    const maxFish   = stats.topFish[0]?.count   || 1;
    const maxMember = stats.topMembers[0]?.count || 1;
    const maxRiver  = stats.topRivers[0]?.count  || 1;

    return `
      <div class="ct-scroll">

        <!-- Главные цифры -->
        <div class="ct-stat-grid">
          <div class="ct-stat-card">
            <div class="ct-stat-lbl">Всего рыб</div>
            <div class="ct-stat-num">${stats.total}</div>
            <div class="ct-stat-sub">за поездку</div>
          </div>
          <div class="ct-stat-card">
            <div class="ct-stat-lbl">Видов</div>
            <div class="ct-stat-num">${stats.species}</div>
            <div class="ct-stat-sub">разных видов</div>
          </div>
          <div class="ct-stat-card">
            <div class="ct-stat-lbl">Взяли</div>
            <div class="ct-stat-num ct-stat-num--green">${stats.kept}</div>
            <div class="ct-stat-sub ct-stat-sub--green">${stats.total ? Math.round(stats.kept / stats.total * 100) : 0}%</div>
          </div>
          <div class="ct-stat-card">
            <div class="ct-stat-lbl">Отпустили</div>
            <div class="ct-stat-num ct-stat-num--muted">${stats.released}</div>
            <div class="ct-stat-sub ct-stat-sub--muted">${stats.total ? Math.round(stats.released / stats.total * 100) : 0}%</div>
          </div>
        </div>

        <!-- Топ рыболовов -->
        ${stats.topMembers.length ? `
        <div class="ct-sec-label">🏆 Топ рыболовов</div>
        <div class="ct-card">
          ${stats.topMembers.map((m, i) => `
            <div class="ct-member-row">
              <div class="ct-member-avatar ct-avatar-${i % 5}">${_initials(m.name)}</div>
              <div class="ct-member-info">
                <div class="ct-member-name">${_esc(m.name)}</div>
              </div>
              <div class="ct-member-bar-wrap">
                <div class="ct-member-bar" style="width:${Math.round(m.count / maxMember * 100)}%;background:${COLORS[i % COLORS.length]}"></div>
              </div>
              <div class="ct-member-count">${m.count} <span class="ct-member-unit">рыб</span></div>
            </div>`).join('')}
        </div>` : ''}

        <!-- По видам рыб -->
        <div class="ct-sec-label">🐟 По видам рыб</div>
        <div class="ct-card">
          ${stats.topFish.map((f, i) => `
            <div class="ct-bar-row">
              <div class="ct-bar-label">${_esc(f.name)}</div>
              <div class="ct-bar-track">
                <div class="ct-bar-fill" style="width:${Math.round(f.count / maxFish * 100)}%;background:${COLORS[i % COLORS.length]}"></div>
              </div>
              <div class="ct-bar-count">${f.count}</div>
            </div>`).join('')}
        </div>

        <!-- По рекам -->
        ${stats.topRivers.length ? `
        <div class="ct-sec-label">🏞 По рекам</div>
        <div class="ct-card">
          ${stats.topRivers.map(r => `
            <div class="ct-river-row" data-action="goto-river" data-river="${_esc(r.name)}">
              <div class="ct-river-info">
                <div class="ct-river-name">${_esc(r.name)}</div>
                <div class="ct-river-bar-wrap">
                  <div class="ct-river-bar" style="width:${Math.round(r.count / maxRiver * 100)}%"></div>
                </div>
              </div>
              <div class="ct-river-right">
                <span class="ct-river-count">${r.count} рыб</span>
                <span class="ct-river-arrow">›</span>
              </div>
            </div>`).join('')}
          <div class="ct-river-hint">Тап на реку → карточка реки</div>
        </div>` : ''}

        <!-- Лента последних поимок -->
        <div class="ct-sec-label">Все поимки</div>
        <div class="ct-card">
          ${catches.map(c => _catchRow(c, true)).join('')}
        </div>

      </div>`;
  }

  // ── Tab: Add ─────────────────────────────────────────────────

  function _tabAdd() {
    const members = CatchesState.getMembers(_tripId);
    const rivers  = CatchesState.getRivers(_tripId);
    const catches = CatchesState.getCatches(_tripId);

    const fishGroups = CatchesData.getFishGroups();
    const fishOptions = fishGroups.map(g =>
      `<optgroup label="${_esc(g.label)}">
        ${g.items.map(f => `<option value="${_esc(f)}">${_esc(f)}</option>`).join('')}
       </optgroup>`
    ).join('');

    const memberOptions = members.length
      ? members.map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('')
      : '<option value="">Участники не добавлены</option>';

    const riverOptions = rivers.length
      ? rivers.map(r => `<option value="${_esc(r)}">${_esc(r)}</option>`).join('')
      : '<option value="">Реки не добавлены</option>';

    return `
      <div class="ct-scroll">

        <div class="ct-sec-label" style="margin-top:0">Новая поимка</div>
        <div class="ct-card ct-form-card">

          <div class="ct-form-label">Вид рыбы</div>
          <select class="ct-form-select" id="ct-fish">
            ${fishOptions}
          </select>

          <div class="ct-form-row-2">
            <div>
              <div class="ct-form-label">Количество</div>
              <div class="ct-counter">
                <button class="ct-counter__btn" id="ct-cnt-minus">−</button>
                <span class="ct-counter__val" id="ct-cnt-val">1</span>
                <button class="ct-counter__btn ct-counter__btn--plus" id="ct-cnt-plus">+</button>
              </div>
            </div>
            <div>
              <div class="ct-form-label">Участник</div>
              <select class="ct-form-select" id="ct-member">
                <option value="">Выбрать...</option>
                ${memberOptions}
              </select>
            </div>
          </div>

          <div class="ct-form-label">Река</div>
          <select class="ct-form-select" id="ct-river">
            <option value="">Выбрать реку...</option>
            ${riverOptions}
          </select>

          <div class="ct-form-label">Статус</div>
          <div class="ct-tog-row">
            <button class="ct-tog active" id="ct-tog-kept">🎣 Взяли</button>
            <button class="ct-tog" id="ct-tog-rel">↩️ Отпустили</button>
          </div>

          <button class="ct-save-btn" id="ct-save-btn">Сохранить поимку</button>
        </div>

        ${catches.length ? `
        <div class="ct-sec-label">Последние поимки</div>
        <div class="ct-card">
          ${catches.slice(0, 10).map(c => _catchRow(c, true)).join('')}
        </div>` : ''}

      </div>`;
  }

  // ── Catch row ────────────────────────────────────────────────

  function _catchRow(c, showDelete) {
    return `
      <div class="ct-catch-row" data-id="${c._id}">
        <div class="ct-catch-icon">${_fishEmoji(c.fish)}</div>
        <div class="ct-catch-info">
          <div class="ct-catch-fish">${_esc(c.fish)} · ${c.count} шт</div>
          <div class="ct-catch-meta">
            ${c.member ? _esc(c.member) + ' · ' : ''}${c.river ? _esc(c.river) : ''}${c.date ? ' · ' + _fmtDate(c.date) : ''}
          </div>
        </div>
        <div class="ct-catch-right">
          <span class="ct-catch-badge ${c.kept ? 'ct-badge-kept' : 'ct-badge-rel'}">${c.kept ? 'взяли' : 'отпустили'}</span>
          ${showDelete ? `<button class="ct-catch-del" data-action="del-catch" data-id="${c._id}" aria-label="Удалить">×</button>` : ''}
        </div>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────────

  function _bind() {
    var backBtn = _el.querySelector('#ct-back');
    if (backBtn) backBtn.addEventListener('click', function() {
      CatchesFirebase.stopListening();
      if (typeof CatchesIndex !== 'undefined') CatchesIndex.close();
    });

    _el.querySelector('#ct-tabs').addEventListener('click', function(e) {
      var tab = e.target.closest('[data-tab]');
      if (!tab) return;
      _tab = tab.dataset.tab;
      _el.querySelector('#ct-tabs').innerHTML = _tabs();
      _el.querySelector('#ct-body').innerHTML  = _body();
      _bindBody();
    });

    _bindBody();
  }

  function _bindBody() {
    const body = _el?.querySelector('#ct-body');
    if (!body) return;

    // Удалить поимку
    if (_bodyHandler) body.removeEventListener('click', _bodyHandler);
    _bodyHandler = e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'del-catch') {
        const id = btn.dataset.id;
        CatchesState.removeCatch(_tripId, id);
        CatchesFirebase.deleteCatch(_tripId, id);
        refresh();
        return;
      }

      if (action === 'goto-river') {
        // Переходим в раздел Реки и открываем карточку конкретной реки
        const riverName = btn.dataset.river;
        CatchesFirebase.stopListening();
        if (typeof onNavigate === 'function') {
          onNavigate('rivers');
        }
        // Небольшая задержка чтобы rivers успел инициализироваться
        setTimeout(function() {
          if (typeof RiversIndex !== 'undefined' && typeof RiversIndex.openRiver === 'function') {
            RiversIndex.openRiver(riverName);
          }
        }, 150);
        return;
      }
    };
    body.addEventListener('click', _bodyHandler);

    // Форма добавления
    if (_tab !== 'add') return;

    let _kept  = true;
    let _count = 1;

    const keptBtn = body.querySelector('#ct-tog-kept');
    const relBtn  = body.querySelector('#ct-tog-rel');
    const cntVal  = body.querySelector('#ct-cnt-val');

    body.querySelector('#ct-cnt-minus')?.addEventListener('click', () => {
      if (_count > 1) { _count--; if (cntVal) cntVal.textContent = _count; }
    });
    body.querySelector('#ct-cnt-plus')?.addEventListener('click', () => {
      _count++;
      if (cntVal) cntVal.textContent = _count;
    });

    keptBtn?.addEventListener('click', () => {
      _kept = true;
      keptBtn.classList.add('active');
      relBtn?.classList.remove('active');
    });
    relBtn?.addEventListener('click', () => {
      _kept = false;
      relBtn.classList.add('active');
      keptBtn?.classList.remove('active');
    });

    const saveBtn = body.querySelector('#ct-save-btn');
    saveBtn?.addEventListener('click', () => {
      UIUtils.withBusyButton(saveBtn, () => {
        const fish   = body.querySelector('#ct-fish')?.value || '';
        const member = body.querySelector('#ct-member')?.value || '';
        const river  = body.querySelector('#ct-river')?.value || '';

        if (!fish) return;

        const entry = CatchesData.normalizeCatch({
          fish, count: _count, kept: _kept,
          member, river,
          date: new Date().toISOString().split('T')[0],
        }, 'tmp_' + Date.now());

        CatchesState.addCatch(_tripId, entry);
        CatchesFirebase.addCatch(_tripId, entry);

        // Сброс формы
        _count = 1;
        if (cntVal) cntVal.textContent = '1';
        _kept = true;
        keptBtn?.classList.add('active');
        relBtn?.classList.remove('active');

        refresh();
      });
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _fishEmoji(fish) {
    const map = {
      'Краб': '🦀', 'Морской ёж': '🦔', 'Трепанг': '🪸',
      'Гребешок': '🐚', 'Мидия': '🐚', 'Трубач': '🐚',
    };
    return map[fish] || '🐟';
  }

  function _initials(name) {
    return (name || '?').split(' ').map(w => w[0]).slice(0, 2).join('').toUpperCase();
  }

  function _fmtDate(str) {
    if (!str) return '';
    const d = new Date(str + 'T00:00:00');
    return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, refresh };
})();

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
          ${catches.map(c => _catchRow(c, _canDelete(c))).join('')}
        </div>

      </div>`;
  }

  // ── Tab: Add ─────────────────────────────────────────────────

  function _tabAdd() {
    const members = CatchesState.getMembers(_tripId);
    const catches = CatchesState.getCatches(_tripId);

    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const fishGroups = CatchesData.getFishGroups(trip);
    const fishOptions = fishGroups.map(g =>
      `<optgroup label="${_esc(g.label)}">
        ${g.items.map(f => `<option value="${_esc(f)}">${_esc(f)}</option>`).join('')}
       </optgroup>`
    ).join('');

    const memberOptions = members.map(m => `<option value="${_esc(m)}">${_esc(m)}</option>`).join('');

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
                <option value="__manual__">+ Вписать вручную</option>
              </select>
            </div>
          </div>
          <input class="ct-form-input" id="ct-member-manual" type="text" placeholder="Имя"
                 style="display:none;margin-top:8px" autocomplete="off">

          <div class="ct-form-label">Вес рыбы, кг <span style="font-weight:400;text-transform:none;letter-spacing:0">— необязательно</span></div>
          <input class="ct-form-input" id="ct-weight" type="number" placeholder="—" inputmode="decimal" step="0.05">

          <div class="ct-form-label">Время поимки</div>
          <input class="ct-form-input" id="ct-time" type="time" value="${new Date().toTimeString().slice(0, 5)}">

          <button type="button" class="ct-tackle-btn" id="ct-place-btn">📍 Место — необязательно</button>

          <div class="ct-form-label">Статус</div>
          <div class="ct-tog-row">
            <button class="ct-tog active" id="ct-tog-kept">🎣 Взяли</button>
            <button class="ct-tog" id="ct-tog-rel">↩️ Отпустили</button>
          </div>

          <div class="ct-form-row-2">
            <div>
              <div class="ct-form-label">Темп. воды, °C</div>
              <input class="ct-form-input" id="ct-watertemp" type="number" placeholder="—" inputmode="decimal" step="0.5">
            </div>
            <div>
              <div class="ct-form-label">Прозрачность</div>
              <select class="ct-form-select" id="ct-clarity">
                <option value="">—</option>
                <option value="clear">Чистая</option>
                <option value="medium">Слегка мутная</option>
                <option value="murky">Мутная</option>
              </select>
            </div>
          </div>

          <div class="ct-form-label">Комментарий <span style="font-weight:400;text-transform:none;letter-spacing:0">— необязательно</span></div>
          <input class="ct-form-input" id="ct-comment" type="text"
                 placeholder="Заметка о поимке..." autocomplete="off">

          <button type="button" class="ct-tackle-btn" id="ct-tackle-btn">🎣 Снасть — необязательно</button>

          <button class="ct-save-btn" id="ct-save-btn">Сохранить поимку</button>
        </div>

        ${catches.length ? `
        <div class="ct-sec-label">Последние поимки</div>
        <div class="ct-card">
          ${catches.slice(0, 10).map(c => _catchRow(c, _canDelete(c))).join('')}
        </div>` : ''}

      </div>`;
  }

  // ── Catch row ────────────────────────────────────────────────

  function _canDelete(c) {
    const myUid = window.APP?.user?.uid;
    if (myUid && c.createdBy === myUid) return true;
    return typeof TripsData !== 'undefined' && TripsData.getById(_tripId)?.ownerId === myUid;
  }

  const CLARITY_LABELS = { clear: 'чистая', medium: 'слегка мутная', murky: 'мутная' };

  function _tackleSummary(t) {
    if (!t) return '';
    const parts = [t.type, t.brand, t.size, t.color].filter(Boolean);
    if (t.weight != null) parts.push(`${t.weight}г`);
    if (t.weightType) parts.push(t.weightType);
    return parts.join(' · ');
  }

  function _catchRow(c, showDelete) {
    const condParts = [];
    if (c.waterTemp != null) condParts.push(`🌡 ${c.waterTemp}°C`);
    if (c.waterClarity) condParts.push(CLARITY_LABELS[c.waterClarity] || c.waterClarity);
    const condLine = condParts.length ? `<div class="ct-catch-comment">${_esc(condParts.join(' · '))}</div>` : '';
    const commentLine = c.comment ? `<div class="ct-catch-comment">${_esc(c.comment)}</div>` : '';
    const tackleText = _tackleSummary(c.tackle);
    const tackleLine = tackleText ? `<div class="ct-catch-comment">🎣 ${_esc(tackleText)}</div>` : '';
    const place = [c.river, c.lat != null ? '📍 точка' : ''].filter(Boolean).join(' ');

    return `
      <div class="ct-catch-row" data-id="${c._id}">
        <div class="ct-catch-icon">${_fishEmoji(c.fish)}</div>
        <div class="ct-catch-info">
          <div class="ct-catch-fish">${_esc(c.fish)} · ${c.count} шт${c.weight != null ? ' · ' + c.weight + ' кг' : ''}</div>
          <div class="ct-catch-meta">
            ${c.member ? _esc(c.member) + ' · ' : ''}${_esc(place)}${c.date ? ' · ' + _fmtDate(c.date) : ''}${c.time ? ', ' + _esc(c.time) : ''}
          </div>
          ${commentLine}
          ${tackleLine}
          ${condLine}
        </div>
        <div class="ct-catch-right">
          <span class="ct-catch-badge ${c.kept ? 'ct-badge-kept' : 'ct-badge-rel'}">${c.kept ? 'взяли' : 'отпустили'}</span>
          ${showDelete ? `<button class="ct-catch-del" data-action="del-catch" data-id="${c._id}" aria-label="Удалить">×</button>` : ''}
        </div>
      </div>`;
  }

  // ── Попапы: место (река/водоём + точка GPS) и снасть ───────────
  // Оба — необязательные доп. поля к поимке, вынесены в попап, чтобы не
  // раздувать основную форму (которую заполняют быстро, часто прямо с
  // лодки). Собранные значения живут в замыкании _bindBody до сохранения.

  const TACKLE_TYPE_GROUPS = [
    { label: 'Силиконовые приманки', items: ['Твистер', 'Виброхвост', 'Слаг', 'Креатура'] },
    { label: 'Поролоновые приманки', items: ['Поролонка (слаг)', 'Поролонка обычная'] },
    { label: 'Воблеры', items: ['Кренк', 'Минноу', 'Фэт'] },
    { label: 'Железо', items: ['Вертушка', 'Колебалка'] },
    { label: 'Другое', items: ['Мормышка', 'Балансир', 'Живец/наживка', 'Мандула', 'Другое'] },
  ];
  const WEIGHT_TYPES  = ['Джиг-головка', 'Чебурашка', 'Каролинская оснастка', 'Отводной поводок', 'Без огрузки', 'Другое'];

  function _showPlacePicker(rivers, current, onDone) {
    document.getElementById('ct-popup-overlay')?.remove();
    const cur = current || {};
    const isManual = !!cur.name && !rivers.includes(cur.name);

    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'ct-popup-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Место</div>
        <div class="ct-form-label">Река/водоём</div>
        <select class="ct-form-select" id="pp-river">
          <option value="">Не указано</option>
          ${rivers.map(r => `<option value="${_esc(r)}" ${!isManual && cur.name === r ? 'selected' : ''}>${_esc(r)}</option>`).join('')}
          <option value="__manual__" ${isManual ? 'selected' : ''}>+ Вписать вручную</option>
        </select>
        <input class="ct-form-input" id="pp-river-manual" type="text" placeholder="Название места"
               style="display:${isManual ? '' : 'none'};margin-top:8px" value="${isManual ? _esc(cur.name) : ''}" autocomplete="off">

        <div class="ct-form-label" style="margin-top:14px">Точка на воде</div>
        <button type="button" class="ct-geo-btn" id="pp-geo-btn">📍 ${cur.lat != null ? 'Точка привязана' : 'Привязать по GPS'}</button>
        <div class="ct-geo-status" id="pp-geo-status" ${cur.lat != null ? 'data-clear="1"' : ''}>${cur.lat != null ? `${cur.lat.toFixed(5)}, ${cur.lon.toFixed(5)} · сбросить` : ''}</div>

        <button class="tqp-all" data-action="pp-done">Готово</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    let geo = cur.lat != null ? { lat: cur.lat, lon: cur.lon } : null;

    overlay.querySelector('#pp-river')?.addEventListener('change', e => {
      const manual = overlay.querySelector('#pp-river-manual');
      if (manual) manual.style.display = e.target.value === '__manual__' ? '' : 'none';
    });

    const geoBtn    = overlay.querySelector('#pp-geo-btn');
    const geoStatus = overlay.querySelector('#pp-geo-status');
    geoBtn?.addEventListener('click', () => {
      if (!navigator.geolocation) { alert('Геолокация не поддерживается этим браузером'); return; }
      geoBtn.disabled = true;
      geoBtn.textContent = 'Определяю…';
      navigator.geolocation.getCurrentPosition(
        pos => {
          geo = { lat: pos.coords.latitude, lon: pos.coords.longitude };
          geoBtn.disabled = false;
          geoBtn.textContent = '📍 Точка привязана';
          if (geoStatus) {
            geoStatus.textContent = `${geo.lat.toFixed(5)}, ${geo.lon.toFixed(5)} · сбросить`;
            geoStatus.setAttribute('data-clear', '1');
          }
        },
        err => {
          geoBtn.disabled = false;
          geoBtn.textContent = '📍 Привязать по GPS';
          alert('Не удалось определить местоположение: ' + (err.message || 'проверь разрешение геолокации'));
        },
        { enableHighAccuracy: true, timeout: 10000 }
      );
    });
    geoStatus?.addEventListener('click', () => {
      if (!geoStatus.hasAttribute('data-clear')) return;
      geo = null;
      geoStatus.textContent = '';
      geoStatus.removeAttribute('data-clear');
      if (geoBtn) geoBtn.textContent = '📍 Привязать по GPS';
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="pp-done"]')) {
        let name = overlay.querySelector('#pp-river')?.value || '';
        if (name === '__manual__') name = overlay.querySelector('#pp-river-manual')?.value.trim() || '';
        overlay.remove();
        onDone({ name, lat: geo?.lat ?? null, lon: geo?.lon ?? null });
      }
    });
  }

  function _showTacklePicker(current, onDone) {
    document.getElementById('ct-popup-overlay')?.remove();
    const cur = current || {};

    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'ct-popup-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Снасть</div>

        <div class="ct-form-label">Тип приманки</div>
        <select class="ct-form-select" id="tk-type">
          <option value="">Не указано</option>
          ${TACKLE_TYPE_GROUPS.map(g => `
            <optgroup label="${_esc(g.label)}">
              ${g.items.map(t => `<option value="${_esc(t)}" ${cur.type === t ? 'selected' : ''}>${_esc(t)}</option>`).join('')}
            </optgroup>`).join('')}
        </select>

        <div class="ct-form-row-2" style="margin-top:10px">
          <div>
            <div class="ct-form-label">Бренд</div>
            <input class="ct-form-input" id="tk-brand" type="text" placeholder="—" value="${_esc(cur.brand || '')}" autocomplete="off">
          </div>
          <div>
            <div class="ct-form-label">Размер/модель</div>
            <input class="ct-form-input" id="tk-size" type="text" placeholder="7см" value="${_esc(cur.size || '')}" autocomplete="off">
          </div>
        </div>

        <div class="ct-form-row-2">
          <div>
            <div class="ct-form-label">Цвет</div>
            <input class="ct-form-input" id="tk-color" type="text" placeholder="—" value="${_esc(cur.color || '')}" autocomplete="off">
          </div>
          <div>
            <div class="ct-form-label">Вес, г</div>
            <input class="ct-form-input" id="tk-weight" type="number" placeholder="—" inputmode="decimal" step="0.5" value="${cur.weight ?? ''}">
          </div>
        </div>

        <div class="ct-form-label">Тип огрузки</div>
        <select class="ct-form-select" id="tk-weighttype">
          <option value="">Не указано</option>
          ${WEIGHT_TYPES.map(t => `<option value="${_esc(t)}" ${cur.weightType === t ? 'selected' : ''}>${_esc(t)}</option>`).join('')}
        </select>

        <button class="tqp-all" data-action="tk-done">Готово</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="tk-done"]')) {
        const weightVal = overlay.querySelector('#tk-weight')?.value;
        const result = {
          type:       overlay.querySelector('#tk-type')?.value || '',
          brand:      overlay.querySelector('#tk-brand')?.value.trim() || '',
          size:       overlay.querySelector('#tk-size')?.value.trim() || '',
          color:      overlay.querySelector('#tk-color')?.value.trim() || '',
          weight:     weightVal !== '' && weightVal != null ? parseFloat(weightVal) : null,
          weightType: overlay.querySelector('#tk-weighttype')?.value || '',
        };
        overlay.remove();
        onDone(result);
      }
    });
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
    let _place  = { name: '' };
    let _geo    = null; // { lat, lon } | null
    let _tackle = null; // { type, brand, size, color, weight, weightType } | null

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

    // "+ Вписать вручную" — участник без аккаунта/ещё не приглашённый в
    // поездку (то же решение, что для "Кто заплатил" в Расходах).
    body.querySelector('#ct-member')?.addEventListener('change', e => {
      const manual = body.querySelector('#ct-member-manual');
      if (manual) manual.style.display = e.target.value === '__manual__' ? '' : 'none';
    });

    // "Место" — попап с рекой/водоёмом (список из поездки + ручной ввод —
    // на лодке посреди водохранилища выбирать не из чего) и точкой GPS.
    body.querySelector('#ct-place-btn')?.addEventListener('click', () => {
      const rivers = CatchesState.getRivers(_tripId);
      _showPlacePicker(rivers, { name: _place.name, lat: _geo?.lat, lon: _geo?.lon }, next => {
        _place = { name: next.name };
        _geo = next.lat != null ? { lat: next.lat, lon: next.lon } : null;
        const btn = body.querySelector('#ct-place-btn');
        if (btn) {
          const parts = [];
          if (next.name) parts.push(next.name);
          if (next.lat != null) parts.push('📍 точка');
          btn.textContent = parts.length ? `📍 ${parts.join(' · ')}` : '📍 Место — необязательно';
          btn.classList.toggle('ct-tackle-btn--filled', parts.length > 0);
        }
      });
    });

    body.querySelector('#ct-tackle-btn')?.addEventListener('click', () => {
      _showTacklePicker(_tackle, next => {
        _tackle = next;
        const btn = body.querySelector('#ct-tackle-btn');
        if (btn) {
          const filled = next && Object.values(next).some(Boolean);
          btn.textContent = filled ? '🎣 Снасть указана ✓' : '🎣 Снасть — необязательно';
          btn.classList.toggle('ct-tackle-btn--filled', !!filled);
        }
      });
    });

    const saveBtn = body.querySelector('#ct-save-btn');
    saveBtn?.addEventListener('click', () => {
      UIUtils.withBusyButton(saveBtn, () => {
        const fish   = body.querySelector('#ct-fish')?.value || '';
        let   member = body.querySelector('#ct-member')?.value || '';
        if (member === '__manual__') member = body.querySelector('#ct-member-manual')?.value.trim() || '';
        const comment     = body.querySelector('#ct-comment')?.value.trim() || '';
        const weight      = body.querySelector('#ct-weight')?.value;
        const time        = body.querySelector('#ct-time')?.value || '';
        const waterTemp   = body.querySelector('#ct-watertemp')?.value;
        const waterClarity = body.querySelector('#ct-clarity')?.value || '';

        if (!fish) return;

        const entry = CatchesData.normalizeCatch({
          fish, count: _count, kept: _kept,
          member, river: _place.name, comment,
          weight: weight !== '' ? parseFloat(weight) : null,
          lat: _geo?.lat ?? null, lon: _geo?.lon ?? null,
          waterTemp: waterTemp !== '' ? parseFloat(waterTemp) : null,
          waterClarity,
          tackle: _tackle,
          date: new Date().toISOString().split('T')[0],
          time,
          createdBy: window.APP?.user?.uid || null,
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

'use strict';

const MenuRender = (() => {

  let _el      = null;
  let _tripId  = null;
  let _days    = [];
  let _openDays   = new Set();
  let _editMeals  = new Set(); // 'dayId_mealId'

  function render(el, tripId) {
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    el.innerHTML = `
      <div class="mn-wrap">
        ${_topbar()}
        <div id="mn-today">${_todayBlock()}</div>
        <div class="mn-days" id="mn-days">${_renderDays()}</div>
      </div>`;
    _bindEvents();
  }

  // Карточка "Меню на сегодня" — без неё, чтобы посмотреть, что готовить
  // сегодня, приходилось скроллить весь список дней поездки сверху вниз.
  // Только для чтения (глазами, а не пальцем) — редактирование остаётся в
  // самом списке дней ниже, там уже есть вся логика пикеров/слотов, дублировать
  // её здесь с теми же data-day/data-meal id было бы riskier (два DOM-узла на
  // один и тот же id путают _rerenderDay при точечном обновлении).
  function _todayBlock() {
    const todayISO = new Date().toISOString().slice(0, 10);
    const day = _days.find(d => d.date === todayISO);
    if (!day) return '';

    const rows = MenuData.getMeals().map(m => {
      const slots  = (day.meals[m.id] && day.meals[m.id].slots) || [];
      const filled = slots.filter(s => s.item);
      if (!filled.length) return '';
      const items = filled.map(s => s.item.name).join(', ');
      return `<div class="mn-today-row"><span class="mn-today-meal">${m.label}</span><span class="mn-today-items">${items}</span></div>`;
    }).join('');

    return `
      <div class="mn-today-card" data-action="jump-today" data-day="${day.id}">
        <div class="mn-today-hd">
          <span class="mn-today-badge">Сегодня</span>
          <span class="mn-today-date">${day.label}</span>
        </div>
        ${rows || '<div class="mn-today-empty">Меню на сегодня ещё не заполнено</div>'}
      </div>`;
  }

  function _topbar() {
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const sub  = trip ? `${trip.name} · ${_days.length} дней` : '';
    return `
      <div class="mn-topbar">
        <button class="mn-back" id="mn-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="mn-topbar__text">
          <div class="mn-topbar__title">Меню</div>
          ${sub ? `<div class="mn-topbar__sub">${sub}</div>` : ''}
        </div>
      </div>`;
  }

  function _renderDays() {
    if (!_days.length) return `
      <div class="mn-empty">
        <div class="mn-empty__icon">🍽️</div>
        <div class="mn-empty__title">Дней пока нет</div>
        <div class="mn-empty__sub">Меню появится, когда у поездки будут известны даты</div>
      </div>`;
    return _days.map(day => _renderDay(day)).join('');
  }

  function _renderDay(day) {
    const isOpen   = _openDays.has(day.id);
    const status   = MenuState.getDayStatus(_tripId, day.id);
    const numClass = status === 'done' ? 'done' : status === 'partial' ? 'partial' : 'empty';

    const dots = MenuData.getMeals().map(m => {
      const slots = day.meals[m.id]?.slots || [];
      const filled = slots.filter(s => s.item).length;
      const cls = filled === slots.length && slots.length ? 'filled' : filled > 0 ? 'partial' : '';
      return `<div class="mn-dot ${cls}"></div>`;
    }).join('');

    const preview = !isOpen ? _dayPreview(day) : '';

    return `
      <div class="mn-day-card ${isOpen ? 'open' : ''}" data-day-id="${day.id}">
        <div class="mn-day-row" data-action="toggle-day" data-day="${day.id}">
          <div class="mn-day-num ${numClass}">${day.num}</div>
          <div class="mn-day-info">
            <div class="mn-day-date">${day.label}</div>
            ${preview ? `<div class="mn-day-preview">${preview}</div>` : ''}
          </div>
          <div class="mn-day-right">
            <div class="mn-dots">${dots}</div>
            <i class="ti ti-chevron-${isOpen ? 'up' : 'down'} mn-chev" aria-hidden="true"></i>
          </div>
        </div>
        ${isOpen ? _renderDayBody(day) : ''}
      </div>`;
  }

  function _dayPreview(day) {
    const meals = MenuData.getMeals();
    const parts = [];
    meals.forEach(m => {
      const slots = day.meals[m.id]?.slots || [];
      const mainSlot = slots.find(s => s.type === 'main' && s.item);
      if (mainSlot) parts.push(`${m.label}: ${mainSlot.item.name}`);
    });
    if (!parts.length) return 'Не заполнено';
    return parts.slice(0, 2).join(' · ');
  }

  function _renderDayBody(day) {
    const meals = MenuData.getMeals().map(m => _renderMeal(day, m)).join('');
    return `<div class="mn-day-body">${meals}</div>`;
  }

  function _renderMeal(day, meal) {
    const editKey  = `${day.id}_${meal.id}`;
    const isEdit   = _editMeals.has(editKey);
    const mealData = day.meals[meal.id] || { slots: [] };

    const slots = mealData.slots.map(slot => _renderSlot(day.id, meal.id, slot, isEdit)).join('');

    return `
      <div class="mn-meal ${isEdit ? 'edit-mode' : ''}" data-day="${day.id}" data-meal="${meal.id}">
        <div class="mn-meal-head">
          <div class="mn-meal-icon"><i class="ti ${meal.icon}" aria-hidden="true"></i></div>
          <span class="mn-meal-name">${meal.label}</span>
          <button class="mn-edit-btn ${isEdit ? 'active' : ''}"
            data-action="toggle-edit" data-day="${day.id}" data-meal="${meal.id}"
            aria-label="Редактировать">
            <i class="ti ti-pencil" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mn-slots">${slots}</div>
        ${isEdit ? `
          <div class="mn-add-slot" data-action="add-slot" data-day="${day.id}" data-meal="${meal.id}">
            <i class="ti ti-plus" aria-hidden="true"></i> добавить позицию
          </div>` : ''}
      </div>`;
  }

  function _renderSlot(dayId, mealId, slot, isEdit) {
    const type  = MenuData.getSlotType(slot.type);
    const label = type?.label || slot.type;
    const color = type?.color || 'blue';

    if (slot.item) {
      return `
        <div class="mn-slot">
          <span class="mn-slot-label">${label}</span>
          <div class="mn-slot-tag filled-${color} ${isEdit ? 'editable' : ''}"
            ${isEdit ? `data-action="edit-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}" data-type="${slot.type}"` : ''}>
            <span class="mn-slot-txt">${slot.item.name}</span>
            ${isEdit ? `<span class="mn-slot-del" data-action="remove-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}">×</span>` : ''}
          </div>
        </div>`;
    }

    return `
      <div class="mn-slot">
        <span class="mn-slot-label">${label}</span>
        <div class="mn-slot-tag ${isEdit ? 'editing-empty' : 'view-empty'}"
          ${isEdit ? `data-action="edit-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}" data-type="${slot.type}"` : ''}>
          <span class="mn-slot-txt">${isEdit ? '+ выбрать' : 'не выбрано'}</span>
        </div>
      </div>`;
  }

  // ── Picker overlay (с табами по категориям) ────────────────────────────
  function _showPicker(dayId, mealId, slotId, slotType) {
    document.getElementById('mn-picker')?.remove();

    const sections     = MenuData.getItemsForSlot(slotType);
    const slotTypeMeta = MenuData.getSlotType(slotType);
    let activeSec      = 0;

    function _buildList(secIdx) {
      const sec = sections[secIdx];
      if (!sec) return '';
      return sec.items.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${item.id}" data-item-name="${item.name}" data-item-source="${item.source}">
          <div class="mn-picker-name">${item.name}</div>
          ${item.hint ? `<div class="mn-picker-hint">${item.hint}</div>` : ''}
        </div>`).join('');
    }

    function _buildTabs() {
      return sections.map((s, i) => `
        <button class="mn-picker-tab ${i === activeSec ? 'active' : ''}" data-sec="${i}">
          ${s.section}
        </button>`).join('');
    }

    const overlay = document.createElement('div');
    overlay.id = 'mn-picker';
    overlay.className = 'mn-picker-overlay';
    overlay.innerHTML = `
      <div class="mn-picker-sheet">
        <div class="mn-picker-head">
          <div class="mn-picker-title">Выбор: ${slotTypeMeta?.label || slotType}</div>
          <button class="mn-picker-close" id="mn-picker-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        ${sections.length > 1 ? `<div class="mn-picker-tabs" id="mn-picker-tabs">${_buildTabs()}</div>` : ''}
        <input class="mn-picker-search" id="mn-picker-search" type="text" placeholder="Поиск...">
        <div class="mn-picker-list" id="mn-picker-list">${_buildList(activeSec)}</div>
      </div>`;

    (_el || document.body).appendChild(overlay);

    // Закрыть
    overlay.querySelector('#mn-picker-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Табы
    overlay.querySelector('#mn-picker-tabs')?.addEventListener('click', e => {
      const btn = e.target.closest('.mn-picker-tab');
      if (!btn) return;
      activeSec = parseInt(btn.dataset.sec);
      overlay.querySelectorAll('.mn-picker-tab').forEach((b, i) => b.classList.toggle('active', i === activeSec));
      overlay.querySelector('#mn-picker-search').value = '';
      overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
      _bindPickItems();
    });

    // Поиск — ищет по всем секциям
    overlay.querySelector('#mn-picker-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
        _bindPickItems();
        return;
      }
      // Поиск по всем секциям
      const allItems = sections.flatMap(s => s.items);
      const filtered = allItems.filter(item => item.name.toLowerCase().includes(q));
      overlay.querySelector('#mn-picker-list').innerHTML = filtered.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${item.id}" data-item-name="${item.name}" data-item-source="${item.source}">
          <div class="mn-picker-name">${item.name}</div>
          ${item.hint ? `<div class="mn-picker-hint">${item.hint}</div>` : ''}
        </div>`).join('') || '<div style="padding:16px;text-align:center;color:var(--label3);font-size:13px">Ничего не найдено</div>';
      _bindPickItems();
    });

    function _bindPickItems() {
      overlay.querySelectorAll('[data-action="pick-item"]').forEach(el => {
        el.addEventListener('click', () => {
          UIUtils.withBusyButton(el, () => {
            const { day, meal, slot, itemId, itemName, itemSource } = el.dataset;
            MenuState.updateSlot(_tripId, day, meal, slot, {
              id: itemId, name: itemName, source: itemSource
            });
            _syncFirebase();
            overlay.remove();
            _rerenderDay(day);
          });
        });
      });
    }

    _bindPickItems();
  }

  // ── Type picker ─────────────────────────────────────────────────────────
  function _showTypePicker(dayId, mealId) {
    document.getElementById('mn-type-picker')?.remove();

    const types = MenuData.getSlotTypes();
    const overlay = document.createElement('div');
    overlay.id = 'mn-type-picker';
    overlay.className = 'mn-picker-overlay';
    overlay.innerHTML = `
      <div class="mn-picker-sheet">
        <div class="mn-picker-head">
          <div class="mn-picker-title">Тип позиции</div>
          <button class="mn-picker-close" id="mn-type-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mn-type-grid">
          ${types.map(t => `
            <button class="mn-type-btn" data-action="pick-type"
              data-day="${dayId}" data-meal="${mealId}" data-type="${t.id}">
              <i class="ti ${t.icon}" aria-hidden="true"></i>
              <span>${t.label}</span>
            </button>`).join('')}
        </div>
      </div>`;

    (_el || document.body).appendChild(overlay);

    overlay.querySelector('#mn-type-close')?.addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    overlay.querySelectorAll('[data-action="pick-type"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const { day, meal, type } = btn.dataset;
        const slot = MenuState.addSlot(_tripId, day, meal, type);
        overlay.remove();
        if (slot) _showPicker(day, meal, slot.id, type);
        else _rerenderDay(day);
      });
    });
  }

  // ── Events ──────────────────────────────────────────────────────────────
  function _bindEvents() {
    if (!_el) return;
    // Remove previous listener if any
    if (_el._mnClickHandler) _el.removeEventListener('click', _el._mnClickHandler);

    _el._mnClickHandler = function(e) {
      const target = e.target.closest('[data-action]');
      if (!target) return;
      const action = target.dataset.action;

      if (action === 'toggle-day') {
        const dayId = target.dataset.day;
        if (_openDays.has(dayId)) _openDays.delete(dayId);
        else _openDays.add(dayId);
        _rerenderDay(dayId);
        return;
      }

      // Клик по карточке "Сегодня" — открыть этот же день в списке ниже
      // (там и правится) и проскроллить к нему, не заставляя искать глазами.
      if (action === 'jump-today') {
        const dayId = target.dataset.day;
        _openDays.add(dayId);
        _rerenderDay(dayId);
        const card = _el.querySelector(`.mn-day-card[data-day-id="${dayId}"]`);
        if (card) card.scrollIntoView({ behavior: 'smooth', block: 'start' });
        return;
      }

      if (action === 'toggle-edit') {
        e.stopPropagation();
        const key = `${target.dataset.day}_${target.dataset.meal}`;
        if (_editMeals.has(key)) _editMeals.delete(key);
        else _editMeals.add(key);
        _rerenderDay(target.dataset.day);
        return;
      }

      if (action === 'edit-slot') {
        e.stopPropagation();
        _showPicker(target.dataset.day, target.dataset.meal, target.dataset.slot, target.dataset.type);
        return;
      }

      if (action === 'remove-slot') {
        e.stopPropagation();
        MenuState.removeSlot(_tripId, target.dataset.day, target.dataset.meal, target.dataset.slot);
        _syncFirebase();
        _rerenderDay(target.dataset.day);
        return;
      }

      if (action === 'add-slot') {
        e.stopPropagation();
        _showTypePicker(target.dataset.day, target.dataset.meal);
        return;
      }
    };

    _el.querySelector('#mn-back') && _el.querySelector('#mn-back').addEventListener('click', function() {
      if (typeof MenuIndex !== 'undefined') MenuIndex.close();
    });
    _el.addEventListener('click', _el._mnClickHandler);
  }

  function _rerenderDay(dayId) {
    const day = _days.find(function(d) { return d.id === dayId; });
    if (!day) return;
    const container = _el ? _el.querySelector('#mn-days') : null;
    if (container) container.innerHTML = _renderDays();
    const todayEl = _el ? _el.querySelector('#mn-today') : null;
    if (todayEl) todayEl.innerHTML = _todayBlock();
  }

  function _syncFirebase() {
    const days = MenuState.getDays(_tripId);
    if (days) MenuFirebase.saveDays(_tripId, days);
  }

  function setDays(days) {
    _days = days;
  }

  function refresh() {
    const days = MenuState.getDays(_tripId);
    if (days) { _days = days; }
    const container = _el?.querySelector('#mn-days');
    if (container) container.innerHTML = _renderDays();
    const todayEl = _el?.querySelector('#mn-today');
    if (todayEl) todayEl.innerHTML = _todayBlock();
  }

  return { render, setDays, refresh };
})();

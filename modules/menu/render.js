'use strict';

const MenuRender = (() => {

  let _el      = null;
  let _tripId  = null;
  let _days    = [];
  let _openDays   = new Set();
  let _editMeals  = new Set(); // 'dayId_mealId'

  // Названия блюд идут из свободного текста (своих рецептов, см.
  // modules/recipes/render.js #rec-add-name) и попадают сюда через
  // innerHTML — без экранирования кавычка в названии рецепта ломает
  // атрибут (data-name и т.п.) и внедряет произвольный HTML/обработчик.
  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

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
      const items = filled.map(s => _esc(s.item.name)).join(', ');
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
      if (mainSlot) parts.push(`${m.label}: ${_esc(mainSlot.item.name)}`);
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
    const hasFilled = mealData.slots.some(s => s.item);

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
        ${!isEdit && hasFilled ? _renderDutyRow(day.id, meal.id, mealData) : ''}
      </div>`;
  }

  // Дежурство на весь приём пищи — показывается под слотами, только когда
  // есть что готовить (хотя бы один заполненный слот) и не в режиме
  // редактирования состава (там место занято кнопкой "добавить позицию",
  // это разные действия над разными вещами).
  function _renderDutyRow(dayId, mealId, mealData) {
    const cookTxt    = mealData.cook    ? `Готовит <b>${_esc(mealData.cook)}</b>`    : 'Готовит — не назначено';
    const cleanupTxt = mealData.cleanup ? `Уборка <b>${_esc(mealData.cleanup)}</b>` : 'Уборка — не назначено';
    return `
      <div class="mn-duty-row">
        <div class="mn-duty-chip" data-action="edit-duty" data-day="${dayId}" data-meal="${mealId}">${cookTxt}</div>
        <div class="mn-duty-chip" data-action="edit-duty" data-day="${dayId}" data-meal="${mealId}">${cleanupTxt}</div>
        <button class="mn-cook-btn" data-action="cook-mode" data-day="${dayId}" data-meal="${mealId}">
          <i class="ti ti-chef-hat" aria-hidden="true"></i> Готовка
        </button>
      </div>`;
  }

  function _renderSlot(dayId, mealId, slot, isEdit) {
    const type  = MenuData.getSlotType(slot.type);
    const label = type?.label || slot.type;
    const color = type?.color || 'blue';

    if (slot.item) {
      // Корзина — закинуть ингредиенты этого блюда в Закупку — только вне
      // режима редактирования (там место занято крестиком удаления, и это
      // явно два разных действия — не путать местами).
      const cartBtn = !isEdit
        ? `<span class="mn-slot-cart" data-action="push-shopping" data-itemid="${_esc(slot.item.id)}" data-source="${_esc(slot.item.source||'')}" data-name="${_esc(slot.item.name)}" title="Добавить ингредиенты в закупку"><i class="ti ti-shopping-cart" aria-hidden="true"></i></span>`
        : '';
      const leftoverTag = slot.item.leftover ? '<span class="mn-slot-leftover">Остатки</span>' : '';
      return `
        <div class="mn-slot">
          <span class="mn-slot-label">${label}</span>
          <div class="mn-slot-tag filled-${color} ${isEdit ? 'editable' : ''}"
            ${isEdit ? `data-action="edit-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}" data-type="${slot.type}"` : ''}>
            <span class="mn-slot-txt">${_esc(slot.item.name)}</span>
            ${leftoverTag}
            ${isEdit ? `<span class="mn-slot-del" data-action="remove-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}">×</span>` : ''}
          </div>
          ${cartBtn}
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

  // Теги направлений открытые и растут сами вместе с рецептами (см.
  // RecipesData.getAllDestinations) — вместо фиксированного набора мест,
  // угаданного заранее, список фильтра берётся из того, что реально
  // проставлено на items данного слота. Пустой destinations у рецепта =
  // универсальный, подходит при любом выбранном направлении.
  function _allTags(sections) {
    const set = new Set();
    sections.forEach(s => s.items.forEach(i => (i.destinations || []).forEach(t => set.add(t))));
    return [...set].sort();
  }

  // ── Picker overlay (с табами по категориям) ────────────────────────────
  function _showPicker(dayId, mealId, slotId, slotType) {
    document.getElementById('mn-picker')?.remove();

    const sections     = MenuData.getItemsForSlot(slotType, _days, dayId);
    const slotTypeMeta = MenuData.getSlotType(slotType);
    const tags         = _allTags(sections);
    let activeSec      = 0;
    let activeTag      = 'all';

    function _matchesTag(i) {
      return activeTag === 'all' || !(i.destinations || []).length || i.destinations.includes(activeTag);
    }

    function _itemsOf(secIdx) {
      const sec = sections[secIdx];
      if (!sec) return [];
      return sec.items.filter(_matchesTag);
    }

    function _buildList(secIdx) {
      const items = _itemsOf(secIdx);
      if (!items.length) return '<div style="padding:16px;text-align:center;color:var(--label3);font-size:13px">Ничего в этом наборе</div>';
      return items.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${_esc(item.id)}" data-item-name="${_esc(item.name)}" data-item-source="${_esc(item.source)}"
          data-item-leftover="${item.leftover ? '1' : ''}">
          <div class="mn-picker-name">${_esc(item.name)}</div>
          ${item.hint ? `<div class="mn-picker-hint">${_esc(item.hint)}</div>` : ''}
        </div>`).join('');
    }

    function _buildTagFilter() {
      if (!tags.length) return '';
      const pills = ['Всё', ...tags];
      return pills.map(t => `
        <button class="mn-picker-tag ${(t === 'Всё' ? 'all' : t) === activeTag ? 'active' : ''}" data-tag="${_esc(t === 'Всё' ? 'all' : t)}">${_esc(t)}</button>`).join('');
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
        <div class="mn-picker-tags" id="mn-picker-tags">${_buildTagFilter()}</div>
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

    // Направление (Всё/Сахалин/Кольский/...)
    overlay.querySelector('#mn-picker-tags')?.addEventListener('click', e => {
      const btn = e.target.closest('.mn-picker-tag');
      if (!btn) return;
      activeTag = btn.dataset.tag;
      overlay.querySelectorAll('.mn-picker-tag').forEach(b => b.classList.toggle('active', b.dataset.tag === activeTag));
      overlay.querySelector('#mn-picker-search').value = '';
      overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
      _bindPickItems();
    });

    // Поиск — ищет по всем секциям (в пределах текущего направления)
    overlay.querySelector('#mn-picker-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
        _bindPickItems();
        return;
      }
      // Поиск по всем секциям
      const allItems = sections.flatMap(s => s.items).filter(_matchesTag);
      const filtered = allItems.filter(item => item.name.toLowerCase().includes(q));
      overlay.querySelector('#mn-picker-list').innerHTML = filtered.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${_esc(item.id)}" data-item-name="${_esc(item.name)}" data-item-source="${_esc(item.source)}"
          data-item-leftover="${item.leftover ? '1' : ''}">
          <div class="mn-picker-name">${_esc(item.name)}</div>
          ${item.hint ? `<div class="mn-picker-hint">${_esc(item.hint)}</div>` : ''}
        </div>`).join('') || '<div style="padding:16px;text-align:center;color:var(--label3);font-size:13px">Ничего не найдено</div>';
      _bindPickItems();
    });

    function _bindPickItems() {
      overlay.querySelectorAll('[data-action="pick-item"]').forEach(el => {
        el.addEventListener('click', () => {
          UIUtils.withBusyButton(el, () => {
            const { day, meal, slot, itemId, itemName, itemSource, itemLeftover } = el.dataset;
            const item = { id: itemId, name: itemName, source: itemSource };
            // Выбрали блюдо из секции "Остатки" — переносим флаг на новый
            // слот, иначе завтрашние остатки исчезали бы из виду послезавтра
            // даже если реально ещё остались (см. MenuData.getLeftoverItemsForSlot).
            if (itemLeftover) item.leftover = true;
            // Точечная запись только этого слота, а не всего _syncFirebase() —
            // см. MenuFirebase.saveSlotItem про гонку при одновременном выборе.
            MenuState.updateSlot(_tripId, day, meal, slot, item);
            MenuFirebase.saveSlotItem(_tripId, slot, item);
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
        if (slot) {
          // Новый слот существует только локально, пока не пуш нём days —
          // если сразу выбрать блюдо, оно уйдёт узкой записью в slotItems
          // (см. saveSlotItem), а сам слот в серверном days так и не
          // появится. Следующий же снапшот из Firestore (в т.ч. эхо этой
          // самой узкой записи) перетрёт локальный days старым — выбор
          // тихо исчезнет. Поэтому создание слота — полноценный saveDays,
          // прямо как remove-slot, а не только точечная правка.
          _syncFirebase();
          _showPicker(day, meal, slot.id, type);
        } else {
          _rerenderDay(day);
        }
      });
    });
  }

  // ── Дежурство: кто готовит / кто убирает за приём пищи ──────────────────
  function _showDutyPicker(dayId, mealId) {
    document.getElementById('mn-duty-overlay')?.remove();

    const trip    = typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
    const members = typeof TripsData !== 'undefined' ? TripsData.participantNames(trip) : [];
    const day     = _days.find(d => d.id === dayId);
    const meal    = day?.meals[mealId];
    if (!meal) return;

    const opts = extra => ['<option value="">— не назначено —</option>']
      .concat(members.map(n => `<option value="${_esc(n)}">${_esc(n)}</option>`)).join('');

    const overlay = document.createElement('div');
    overlay.id = 'mn-duty-overlay';
    overlay.className = 'mn-picker-overlay';
    overlay.innerHTML = `
      <div class="mn-picker-sheet">
        <div class="mn-picker-head">
          <div class="mn-picker-title">Дежурство — ${_esc(day.label)}</div>
          <button class="mn-picker-close" id="mn-duty-close" aria-label="Закрыть">
            <i class="ti ti-x" aria-hidden="true"></i>
          </button>
        </div>
        <div class="mn-duty-form">
          <div class="mn-duty-field">
            <div class="mn-duty-field-row">
              <span class="mn-duty-field-lbl">Готовит</span>
              <span class="mn-duty-auto" data-action="duty-auto" data-role="cook">авто</span>
            </div>
            <select class="mn-duty-select" id="mn-duty-cook">${opts()}</select>
          </div>
          <div class="mn-duty-field">
            <div class="mn-duty-field-row">
              <span class="mn-duty-field-lbl">Уборка</span>
              <span class="mn-duty-auto" data-action="duty-auto" data-role="cleanup">авто</span>
            </div>
            <select class="mn-duty-select" id="mn-duty-cleanup">${opts()}</select>
          </div>
        </div>
        <button class="mn-picker-save" id="mn-duty-save">Сохранить</button>
      </div>`;

    (_el || document.body).appendChild(overlay);

    const cookSel = overlay.querySelector('#mn-duty-cook');
    const cleanupSel = overlay.querySelector('#mn-duty-cleanup');
    cookSel.value = meal.cook || '';
    cleanupSel.value = meal.cleanup || '';

    overlay.querySelector('#mn-duty-close').addEventListener('click', () => overlay.remove());
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.remove(); });

    // Авто-назначение — предлагает того из участников, кто реже всего был
    // в этой роли за всю поездку (см. MenuState.getDutyCounts); при ничьей
    // берёт первого по алфавиту, не по порядку в списке участников —
    // детерминированно, а не "кто первый в массиве".
    overlay.querySelectorAll('[data-action="duty-auto"]').forEach(btn => {
      btn.addEventListener('click', () => {
        const role = btn.dataset.role;
        const counts = MenuState.getDutyCounts(_tripId)[role] || {};
        const sorted = members.slice().sort((a, b) => {
          const diff = (counts[a] || 0) - (counts[b] || 0);
          return diff !== 0 ? diff : a.localeCompare(b, 'ru');
        });
        if (sorted.length) (role === 'cook' ? cookSel : cleanupSel).value = sorted[0];
      });
    });

    overlay.querySelector('#mn-duty-save').addEventListener('click', () => {
      const cook = cookSel.value || null;
      const cleanup = cleanupSel.value || null;
      MenuState.setMealDuty(_tripId, dayId, mealId, 'cook', cook);
      MenuState.setMealDuty(_tripId, dayId, mealId, 'cleanup', cleanup);
      MenuFirebase.saveMealDuty(_tripId, dayId, mealId, { cook, cleanup });
      overlay.remove();
      _rerenderDay(dayId);
    });
  }

  // ── Cook Mode — полноэкранный режим готовки конкретного приёма пищи ─────
  function _showCookMode(dayId, mealId) {
    document.getElementById('mn-cookmode-overlay')?.remove();

    const day  = _days.find(d => d.id === dayId);
    const meal = MenuData.getMeals().find(m => m.id === mealId);
    const mealData = day?.meals[mealId];
    if (!day || !meal || !mealData) return;

    const filledSlots = mealData.slots.filter(s => s.item);

    const dishesHtml = filledSlots.map(slot => {
      const ingredients = _ingredientsForItem(slot.item.id, slot.item.source, slot.item.name);
      const recipe = slot.item.source === 'recipes' && typeof RecipesData !== 'undefined'
        ? RecipesData.getRecipeById(slot.item.id)
        : (slot.item.source === 'recipes_custom' && typeof RecipesState !== 'undefined'
          ? RecipesState.getCustomRecipeById(slot.item.id) : null);

      const ingRows = ingredients.map((ing, i) => `
        <div class="cm-ing-row" data-action="cm-toggle-ing" data-key="${slot.id}_${i}">
          <div class="cm-check" data-ing="${slot.id}_${i}"></div>
          <div class="cm-ing-name" data-ing-name="${slot.id}_${i}">${_esc(ing.name)}</div>
          <div class="cm-ing-qty">${_esc(ing.qty || '')}</div>
        </div>`).join('');

      const currentLeftover = !!slot.item.leftover;

      return `
        <div class="cm-dish" data-slot="${slot.id}">
          <div class="cm-dish-title">${_esc(slot.item.name)}</div>
          ${ingRows ? `<div class="cm-ing-list">${ingRows}</div>` : '<div class="cm-no-ing">Ингредиенты не указаны в рецепте</div>'}
          ${recipe?.method ? `<div class="cm-method">${_esc(recipe.method)}</div>` : ''}
          <div class="cm-leftover-block">
            <div class="cm-leftover-q">Остались излишки?</div>
            <div class="cm-leftover-choices">
              <div class="cm-lo-btn ${!currentLeftover ? 'picked' : ''}" data-action="cm-leftover" data-slot="${slot.id}" data-val="0">Нет</div>
              <div class="cm-lo-btn ${currentLeftover ? 'picked' : ''}" data-action="cm-leftover" data-slot="${slot.id}" data-val="1">Да, хватит ещё</div>
            </div>
          </div>
        </div>`;
    }).join('');

    const overlay = document.createElement('div');
    overlay.id = 'mn-cookmode-overlay';
    overlay.className = 'cm-overlay';
    overlay.innerHTML = `
      <div class="cm-sheet">
        <div class="cm-topbar">
          <button class="cm-close" id="cm-close" aria-label="Закрыть"><i class="ti ti-x" aria-hidden="true"></i></button>
          <div class="cm-topbar__text">
            <div class="cm-topbar__title">${_esc(meal.label)}</div>
            <div class="cm-topbar__sub">${_esc(day.label)}</div>
          </div>
        </div>
        <div class="cm-roles">
          <div class="cm-role">
            <div class="cm-role-lbl">Готовит</div>
            <div class="cm-role-name">${mealData.cook ? _esc(mealData.cook) : '—'}</div>
          </div>
          <div class="cm-role">
            <div class="cm-role-lbl">Уборка</div>
            <div class="cm-role-name">${mealData.cleanup ? _esc(mealData.cleanup) : '—'}</div>
          </div>
        </div>
        <div class="cm-dishes">${dishesHtml || '<div class="cm-no-ing" style="padding:14px">Ничего не выбрано на этот приём</div>'}</div>
        <div class="cm-actions">
          <button class="cm-done-btn" id="cm-done">Готово</button>
          <div class="cm-done-note">Пока просто отмечает готовку законченной — автоматического пинга уборке ещё нет.</div>
        </div>
      </div>`;

    (_el || document.body).appendChild(overlay);

    overlay.querySelector('#cm-close').addEventListener('click', () => overlay.remove());

    // Чек-лист ингредиентов — локальное состояние на время готовки, не
    // синхронизируется и не сохраняется: это "что я лично уже достал",
    // не общие данные поездки, синк никому не нужен.
    overlay.addEventListener('click', e => {
      const row = e.target.closest('[data-action="cm-toggle-ing"]');
      if (!row) return;
      const key = row.dataset.key;
      overlay.querySelector(`[data-ing="${key}"]`)?.classList.toggle('on');
      overlay.querySelector(`[data-ing-name="${key}"]`)?.classList.toggle('done');
    });

    overlay.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="cm-leftover"]');
      if (!btn) return;
      const slotId = btn.dataset.slot;
      const val = btn.dataset.val === '1';
      MenuState.setSlotLeftover(_tripId, dayId, mealId, slotId, val);
      const slot = mealData.slots.find(s => s.id === slotId);
      if (slot?.item) MenuFirebase.saveSlotItem(_tripId, slotId, slot.item);
      overlay.querySelectorAll(`.cm-lo-btn[data-slot="${slotId}"]`).forEach(b => {
        b.classList.toggle('picked', (b.dataset.val === '1') === val);
      });
    });

    overlay.querySelector('#cm-done').addEventListener('click', () => {
      overlay.remove();
      _rerenderDay(dayId);
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

      if (action === 'push-shopping') {
        e.stopPropagation();
        _pushIngredientsToShopping(target, target.dataset.itemid, target.dataset.source, target.dataset.name);
        return;
      }

      if (action === 'edit-duty') {
        e.stopPropagation();
        _showDutyPicker(target.dataset.day, target.dataset.meal);
        return;
      }

      if (action === 'cook-mode') {
        e.stopPropagation();
        _showCookMode(target.dataset.day, target.dataset.meal);
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

  // Ингредиенты блюда по его source/id — те же каталоги, откуда слот
  // вообще заполняется (см. MenuData.getItemsForSlot). Белок сам по себе
  // и есть один ингредиент — рецепта для него нет и не нужно.
  function _ingredientsForItem(itemId, source, fallbackName) {
    let recipe = null;
    if (source === 'recipes' && typeof RecipesData !== 'undefined') {
      recipe = RecipesData.getRecipeById(itemId);
    } else if (source === 'recipes_custom' && typeof RecipesState !== 'undefined') {
      recipe = RecipesState.getCustomRecipeById(itemId);
    } else if (source === 'bar' && typeof BarData !== 'undefined') {
      recipe = BarData.getCocktailById(itemId);
    } else if (source === 'proteins') {
      return [{ name: fallbackName, qty: '' }];
    }
    return (recipe && recipe.ingredients && recipe.ingredients.length) ? recipe.ingredients : [];
  }

  // Закидывает ингредиенты блюда в Закупку этой же поездки — категория
  // резолвится через RecipesData.resolveShoppingCategory (каталог
  // ингредиентов → authored category на самом ингредиенте → угадывание по
  // ключевым словам → "Разное"), тот же резолвер использует и вставка
  // списка текстом в самой Закупке (см. modules/shopping/render.js:
  // _showPasteList) — одна логика на оба входа в закупку.
  // Дедуп по имени (без учёта регистра) против ВСЕХ категорий, не только
  // целевой, чтобы не плодить то, что уже кто-то вписал руками. Полный
  // overwrite categories — тот же паттерн, что и у остальных мутаций в
  // самом модуле Закупки (см. shopping/render.js:_sync).
  async function _pushIngredientsToShopping(btn, itemId, source, name) {
    if (typeof ShoppingState === 'undefined' || typeof ShoppingFirebase === 'undefined') return;
    const ingredients = _ingredientsForItem(itemId, source, name);
    if (!ingredients.length) {
      alert('У этого блюда пока нет списка ингредиентов — добавь их в Рецептах, и в следующий раз подтянутся сюда.');
      return;
    }

    ShoppingState.load();
    const cats = ShoppingState.getCategories(_tripId);

    const existingNames = new Set();
    cats.forEach(c => c.items.forEach(i => existingNames.add(String(i.name).trim().toLowerCase())));

    let added = 0;
    ingredients.forEach(ing => {
      const key = String(ing.name || '').trim().toLowerCase();
      if (!key || existingNames.has(key)) return;

      const title = RecipesData.resolveShoppingCategory(ing.name, ing.category, ing.ingredientId);
      const cat = ShoppingState.findOrCreateCategory(cats, title);

      cat.items.push({
        id: `item_${Date.now()}_${Math.random().toString(36).slice(2)}`,
        name: ing.name, qty: ing.qty || '', bought: false,
      });
      existingNames.add(key);
      added++;
    });

    if (added) {
      ShoppingState.persist();
      await ShoppingFirebase.save(_tripId, cats);
    }

    if (btn) {
      const orig = btn.innerHTML;
      btn.innerHTML = added ? `<i class="ti ti-check" aria-hidden="true"></i> ${added}` : '✓ уже есть';
      btn.classList.add('done');
      setTimeout(() => { btn.innerHTML = orig; btn.classList.remove('done'); }, 1500);
    }
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

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
      // Корзина — закинуть ингредиенты этого блюда в Закупку — только вне
      // режима редактирования (там место занято крестиком удаления, и это
      // явно два разных действия — не путать местами).
      const cartBtn = !isEdit
        ? `<span class="mn-slot-cart" data-action="push-shopping" data-itemid="${_esc(slot.item.id)}" data-source="${_esc(slot.item.source||'')}" data-name="${_esc(slot.item.name)}" title="Добавить ингредиенты в закупку"><i class="ti ti-shopping-cart" aria-hidden="true"></i></span>`
        : '';
      return `
        <div class="mn-slot">
          <span class="mn-slot-label">${label}</span>
          <div class="mn-slot-tag filled-${color} ${isEdit ? 'editable' : ''}"
            ${isEdit ? `data-action="edit-slot" data-day="${dayId}" data-meal="${mealId}" data-slot="${slot.id}" data-type="${slot.type}"` : ''}>
            <span class="mn-slot-txt">${_esc(slot.item.name)}</span>
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

  // Наборы рецептов — не наука, а способ не смешивать в одной куче
  // универсальные техники, то, что имеет смысл только на морском
  // побережье (устрицы/краб/мидии — не поймать на Оби), и личные
  // привычки конкретного человека (см. RecipesData — поле pack у
  // рецепта, дефолт 'base' у всего, что его не проставляет явно).
  const _PACKS = [
    ['all',      'Всё'],
    ['base',     'База'],
    ['coastal',  'Побережье'],
    ['personal', 'Моё'],
  ];

  // ── Picker overlay (с табами по категориям) ────────────────────────────
  function _showPicker(dayId, mealId, slotId, slotType) {
    document.getElementById('mn-picker')?.remove();

    const sections     = MenuData.getItemsForSlot(slotType);
    const slotTypeMeta = MenuData.getSlotType(slotType);
    let activeSec      = 0;
    let activePack      = 'all';

    function _itemsOf(secIdx) {
      const sec = sections[secIdx];
      if (!sec) return [];
      return activePack === 'all' ? sec.items : sec.items.filter(i => (i.pack || 'base') === activePack);
    }

    function _buildList(secIdx) {
      const items = _itemsOf(secIdx);
      if (!items.length) return '<div style="padding:16px;text-align:center;color:var(--label3);font-size:13px">Ничего в этом наборе</div>';
      return items.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${_esc(item.id)}" data-item-name="${_esc(item.name)}" data-item-source="${_esc(item.source)}">
          <div class="mn-picker-name">${_esc(item.name)}</div>
          ${item.hint ? `<div class="mn-picker-hint">${_esc(item.hint)}</div>` : ''}
        </div>`).join('');
    }

    function _buildPackFilter() {
      return _PACKS.map(([id, label]) => `
        <button class="mn-picker-pack ${id === activePack ? 'active' : ''}" data-pack="${id}">${label}</button>`).join('');
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
        <div class="mn-picker-packs" id="mn-picker-packs">${_buildPackFilter()}</div>
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

    // Набор (Всё/База/Побережье/Моё)
    overlay.querySelector('#mn-picker-packs')?.addEventListener('click', e => {
      const btn = e.target.closest('.mn-picker-pack');
      if (!btn) return;
      activePack = btn.dataset.pack;
      overlay.querySelectorAll('.mn-picker-pack').forEach(b => b.classList.toggle('active', b.dataset.pack === activePack));
      overlay.querySelector('#mn-picker-search').value = '';
      overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
      _bindPickItems();
    });

    // Поиск — ищет по всем секциям (в пределах текущего набора)
    overlay.querySelector('#mn-picker-search')?.addEventListener('input', e => {
      const q = e.target.value.toLowerCase().trim();
      if (!q) {
        overlay.querySelector('#mn-picker-list').innerHTML = _buildList(activeSec);
        _bindPickItems();
        return;
      }
      // Поиск по всем секциям
      const allItems = sections.flatMap(s => s.items).filter(i => activePack === 'all' || (i.pack || 'base') === activePack);
      const filtered = allItems.filter(item => item.name.toLowerCase().includes(q));
      overlay.querySelector('#mn-picker-list').innerHTML = filtered.map(item => `
        <div class="mn-picker-item" data-action="pick-item"
          data-day="${dayId}" data-meal="${mealId}" data-slot="${slotId}"
          data-item-id="${_esc(item.id)}" data-item-name="${_esc(item.name)}" data-item-source="${_esc(item.source)}">
          <div class="mn-picker-name">${_esc(item.name)}</div>
          ${item.hint ? `<div class="mn-picker-hint">${_esc(item.hint)}</div>` : ''}
        </div>`).join('') || '<div style="padding:16px;text-align:center;color:var(--label3);font-size:13px">Ничего не найдено</div>';
      _bindPickItems();
    });

    function _bindPickItems() {
      overlay.querySelectorAll('[data-action="pick-item"]').forEach(el => {
        el.addEventListener('click', () => {
          UIUtils.withBusyButton(el, () => {
            const { day, meal, slot, itemId, itemName, itemSource } = el.dataset;
            const item = { id: itemId, name: itemName, source: itemSource };
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

  // Грубое сопоставление ингредиента с категорией Закупки по ключевым
  // словам в названии — ключ здесь ТИТУЛ категории (не id: у только что
  // созданной по требованию категории id случайный, а название — тот же
  // самый текст, что и в дефолтном шаблоне ShoppingData, так что по нему
  // и находим/создаём стабильно). Что не угадали — падает в уже
  // существующую "Маркетплейсы" (категория для всякой всячины), без
  // отдельного нового "запасного кармана".
  const _CATEGORY_KEYWORDS = [
    ['Овощи и фрукты',    ['банан', 'лимон', 'лайм', 'апельсин', 'яблок', 'картоф', 'лук', 'чеснок', 'огурц', 'помидор', 'капуст', 'свёкл', 'свекл', 'зелен', 'укроп', 'мят', 'имбир']],
    ['Мясо и консервы',   ['тушёнк', 'тушенк', 'буженин', 'колбас', 'сосиск', 'сало', 'краб', 'гребеш', 'мидии', 'морской еж', 'морской ёж', 'устриц', 'филе', 'рыба', 'стейк']],
    ['Молочное и яйца',   ['яйца', 'яйцо', 'желтк', 'сыр', 'масло сливочн', 'сливки', 'сгущ']],
    ['Крупы и паста',     ['гречк', 'рис', 'овсянк', 'спагетти', 'феттучини', 'паста', 'лапш', 'хлеб', 'сухари', 'сочн', 'тесто']],
    ['Соусы и специи',    ['соль', 'перец', 'масло раст', 'соевый соус', 'уксус', 'лавров', 'мёд', 'мед', 'сахар', 'паприка', 'тмин', 'каперс', 'васаби', 'томатная паста']],
    ['Перекусы и сладкое',['орех', 'сухофрукт', 'шоколад', 'печенье', 'зефир', 'халв']],
    ['Напитки',           ['кофе', 'чай', 'сок', 'вода', 'тоник', 'содов']],
    ['Бар',               ['джин', 'виски', 'бурбон', 'ром', 'водка', 'вермут', 'кампари', 'просекко', 'ликёр', 'ликер', 'апероль', 'биттер']],
  ];
  const _FALLBACK_CATEGORY = 'Маркетплейсы';

  function _categoryTitleFor(ingredientName) {
    const key = String(ingredientName || '').trim().toLowerCase();
    for (const [title, words] of _CATEGORY_KEYWORDS) {
      if (words.some(w => key.includes(w))) return title;
    }
    return null;
  }

  // Находит категорию по названию среди уже существующих в поездке, а
  // если такой ещё нет (например, новая поездка со свежей пустой
  // Закупкой — см. modules/shopping/state.js) — создаёт её, подцепив
  // иконку из дефолтного шаблона, если название совпадает с одной из
  // стандартных. Мутирует cats/cat.items напрямую (не через addCategory/
  // addItem) — те шлют свой localStorage-_save() на каждый вызов, а тут
  // может понадобиться добавить сразу несколько категорий и позиций за
  // один пуш; сохраняем локально одним ShoppingState.persist() в конце
  // (см. _pushIngredientsToShopping).
  function _findOrCreateCat(cats, title) {
    let cat = cats.find(c => c.title === title);
    if (cat) return cat;
    const def = (typeof ShoppingData !== 'undefined' ? ShoppingData.getDefaults() : []).find(d => d.title === title);
    cat = {
      id: `cat_${Date.now()}_${Math.random().toString(36).slice(2)}`,
      title,
      icon: (def && def.icon) || 'ti-list',
      items: [],
    };
    cats.push(cat);
    return cat;
  }

  // Закидывает ингредиенты блюда в Закупку этой же поездки — каждый
  // пытаемся определить в подходящую категорию по ключевым словам
  // (банан → "Овощи и фрукты" и т.д.), что не опознали — в "Маркетплейсы".
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

      // Авторская category на ингредиенте (проставлена в Рецептах) в
      // приоритете — угадывание по ключевым словам остаётся запасным
      // вариантом только для того, что её не несёт (свои рецепты,
      // добавленные без явной категории у каждого ингредиента).
      const title = ing.category || _categoryTitleFor(ing.name) || _FALLBACK_CATEGORY;
      const cat = _findOrCreateCat(cats, title);

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

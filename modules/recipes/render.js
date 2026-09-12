'use strict';

const RecipesRender = (() => {

  let _el = null;
  let _activeCat = RecipesData.getCategories()[0].id;
  let _openCards = new Set();
  let _activeTag = 'all';
  let _activeQuery = '';

  // Список тегов направлений открытый и растёт сам — берём то, что реально
  // проставлено на рецептах (встроенных + своих), а не гадаем заранее фиксированный
  // набор мест. Тот же список используется в пикере блюда для Меню
  // (modules/menu/render.js), чтобы книга рецептов и Меню фильтровали одинаково.
  function _allTags() {
    const set = new Set(RecipesData.getAllDestinations());
    if (typeof RecipesState !== 'undefined') {
      RecipesData.getCategories().forEach(c => RecipesState.getCustomRecipes(c.id).forEach(r => (r.destinations || []).forEach(t => set.add(t))));
    }
    return [...set].sort();
  }

  function render(el) {
    _el = el;
    if (!el) return;
    el.innerHTML = `
      <div class="rec-wrap">
        ${_topbar()}
        ${_searchBox()}
        ${_tagFilter()}
        ${_tabs()}
        <div class="rec-cards" id="rec-cards">${_cards()}</div>
      </div>`;
    _bindEvents();
  }

  function _searchBox() {
    // Обёртка на всю ширину, тот же bg2-паттерн, что у .rec-tags/.rec-tabs
    // ниже — без неё поле поиска смотрелось отдельной плавающей коробкой,
    // не совпадающей по краям с рядами под ней.
    return `<div class="rec-search-row">
      <input class="rec-search" id="rec-search" type="text" placeholder="Поиск по рецептам..." value="${_esc(_activeQuery)}">
    </div>`;
  }

  function _tagPillsHtml() {
    const tags = _allTags();
    if (!tags.length) return '';
    const pills = ['Всё', ...tags];
    return pills.map(t => `
      <button class="rec-tag ${(t === 'Всё' ? 'all' : t) === _activeTag ? 'active' : ''}" data-tag="${_esc(t === 'Всё' ? 'all' : t)}">${_esc(t)}</button>`).join('');
  }

  function _tagFilter() {
    const html = _tagPillsHtml();
    return html ? `<div class="rec-tags" id="rec-tags">${html}</div>` : '';
  }

  function _topbar() {
    return `
      <div class="rec-topbar">
        <button class="rec-back-btn" id="rec-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="rec-topbar__text">
          <div class="rec-topbar__title">Рецепты</div>
          <div class="rec-topbar__sub">Кулинарная книга экспедиции</div>
        </div>
        <button class="rec-add-btn" id="rec-add" aria-label="Добавить рецепт">
          <i class="ti ti-plus" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  function _tabs() {
    const cats = RecipesData.getCategories();
    const tabs = cats.map(c => `
      <button class="rec-tab ${c.id === _activeCat ? 'active' : ''}" data-cat="${c.id}">
        ${c.label}
      </button>`).join('');
    return `<div class="rec-tabs" role="tablist">${tabs}<button class="rec-tab-settings" id="rec-tab-settings" aria-label="Настроить вкладки"><i class="ti ti-dots" aria-hidden="true"></i></button></div>`;
  }

  // ── Настройка вкладок-категорий — какие показаны и в каком порядке.
  // Тот же паттерн (чекбокс + стрелки), что и у вкладок Гида поездки
  // (modules/tripcover/index.js:_showGuideTabsSettings), но общий на всю
  // книгу рецептов, а не per-trip — сохраняется в recipes_meta/categories.
  function _showCategorySettings() {
    document.getElementById('rcs-overlay')?.remove();

    const defs = RecipesData.getCategoryDefs();
    const saved = RecipesState.getCategoryOrder() || [];
    const validSaved = saved.filter(id => defs.some(d => d.id === id));
    const visible = validSaved.length ? validSaved : defs.map(d => d.id);
    const hiddenIds = defs.map(d => d.id).filter(id => !visible.includes(id));
    let order = [...visible, ...hiddenIds];
    const checked = new Set(visible);

    function renderRows() {
      return order.map((id, i) => {
        const def = defs.find(d => d.id === id);
        return `
        <div class="tqp-row rcs-row">
          <div class="rcs-check ${checked.has(id) ? 'checked' : ''}" data-rcs-check="${id}"></div>
          <span class="rcs-label">${_esc(def ? def.label : id)}</span>
          <div class="rcs-arrows">
            <button class="rcs-arrow" data-rcs-up="${id}" ${i === 0 ? 'disabled' : ''}>↑</button>
            <button class="rcs-arrow" data-rcs-down="${id}" ${i === order.length - 1 ? 'disabled' : ''}>↓</button>
          </div>
        </div>`;
      }).join('');
    }

    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'rcs-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Вкладки рецептов</div>
        <div class="tqp-list" id="rcs-list">${renderRows()}</div>
        <button class="rcs-save" data-action="rcs-save">Сохранить</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    const rerenderList = () => {
      const listEl = document.getElementById('rcs-list');
      if (listEl) listEl.innerHTML = renderRows();
    };

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const upId = e.target.closest('[data-rcs-up]')?.dataset.rcsUp;
      if (upId) {
        const i = order.indexOf(upId);
        if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; rerenderList(); }
        return;
      }
      const downId = e.target.closest('[data-rcs-down]')?.dataset.rcsDown;
      if (downId) {
        const i = order.indexOf(downId);
        if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; rerenderList(); }
        return;
      }
      const checkEl = e.target.closest('[data-rcs-check]');
      if (checkEl) {
        const id = checkEl.dataset.rcsCheck;
        const willCheck = !checkEl.classList.contains('checked');
        // Хотя бы одна категория должна остаться видимой — снять последнюю
        // отмеченную нельзя, иначе вкладки рецептов исчезли бы совсем.
        if (!willCheck && checked.size === 1 && checked.has(id)) return;
        if (willCheck) checked.add(id); else checked.delete(id);
        checkEl.classList.toggle('checked', willCheck);
        return;
      }
      if (e.target.closest('[data-action="rcs-save"]')) {
        // Сохраняем только видимые id по порядку — тот же паттерн, что и
        // trip.guideTabs: скрытая категория не запоминает свою позицию,
        // при повторном включении просто уходит в конец списка.
        RecipesFirebase.saveCategoryOrder(order.filter(id => checked.has(id)));
        overlay.remove();
        if (_el) {
          if (!RecipesData.getCategories().some(c => c.id === _activeCat)) {
            _activeCat = RecipesData.getCategories()[0]?.id;
          }
          render(_el);
        }
      }
    });
  }

  function _cards() {
    // Универсальный рецепт (пустой destinations) актуален при любом выбранном
    // направлении — фильтр сужает "что ещё, кроме базы", а не заменяет её.
    const matchesTag = r => _activeTag === 'all' || !(r.destinations || []).length || r.destinations.includes(_activeTag);

    // С поиском — ищем по названию/описанию сразу по всем категориям (а не
    // только в открытой вкладке), как и поиск в пикере блюда для Меню
    // (modules/menu/render.js) — иначе пришлось бы вручную перебирать
    // вкладки, чтобы найти рецепт, если не помнишь, в какой он категории.
    const query = _activeQuery.trim().toLowerCase();
    if (query) {
      const matchesQuery = r => r.name.toLowerCase().includes(query) || (r.sub || '').toLowerCase().includes(query);
      const cats = RecipesData.getCategories();
      const builtIn = cats.flatMap(c => c.cocktails).filter(matchesTag).filter(matchesQuery);
      const custom  = cats.flatMap(c => RecipesState.getCustomRecipes(c.id)).filter(matchesTag).filter(matchesQuery);
      if (!builtIn.length && !custom.length) {
        return '<div style="padding:32px 16px;text-align:center;color:var(--label3);font-size:13px">Ничего не найдено</div>';
      }
      return builtIn.map(r => _card(r, false)).join('') + custom.map(r => _card(r, true)).join('');
    }

    const cat = RecipesData.getCategories().find(c => c.id === _activeCat);
    const builtIn = (cat ? cat.cocktails : []).filter(matchesTag);
    const custom  = RecipesState.getCustomRecipes(_activeCat).filter(matchesTag);
    if (!builtIn.length && !custom.length) {
      return '<div style="padding:32px 16px;text-align:center;color:var(--label3);font-size:13px">Ничего в этом наборе</div>';
    }

    // Стрелки "переставить" показываем только на полном, нефильтрованном
    // по тегу списке категории — если сузить по направлению, часть позиций
    // между видимыми скрыта, и "вверх/вниз" перестало бы значить то же
    // самое, что настоящий порядок в категории.
    if (_activeTag !== 'all') {
      return builtIn.map(r => _card(r, false)).join('') + custom.map(r => _card(r, true)).join('');
    }
    const merged = _orderedRecipesForCat(_activeCat);
    return merged.map((entry, i) => _card(entry.r, entry.isCustom, {
      catId: _activeCat, isFirst: i === 0, isLast: i === merged.length - 1,
    })).join('');
  }

  // Built-in + свои рецепты категории вместе, отсортированные по полю
  // order (отсутствует = 0 — стабильная сортировка сохраняет исходный
  // порядок, пока никто ничего не переставлял). Общий helper для _cards()
  // (рисует стрелки) и _moveRecipe() (сама логика перестановки).
  function _orderedRecipesForCat(catId) {
    const cat = RecipesData.getCategories().find(c => c.id === catId);
    const builtIn = (cat ? cat.cocktails : []).map(r => ({ r, isCustom: false }));
    const custom  = RecipesState.getCustomRecipes(catId).map(r => ({ r, isCustom: true }));
    return [...builtIn, ...custom].sort((a, b) => (a.r.order ?? 0) - (b.r.order ?? 0));
  }

  // Переставляет рецепт на одну позицию вверх/вниз внутри категории.
  // Нормализует order ВСЕХ рецептов категории на 0..N-1 по текущему
  // отображаемому порядку перед свапом — без этого первая же перестановка
  // между двумя рецептами без order (оба 0 после ??0) была бы no-op.
  // Дальше меняются местами только order двух затронутых записей.
  async function _moveRecipe(catId, recipeId, isCustom, dir) {
    const list = _orderedRecipesForCat(catId);
    const i = list.findIndex(e => e.r.id === recipeId && e.isCustom === isCustom);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= list.length) return;

    const writes = [];
    list.forEach((entry, idx) => {
      if (entry.r.order !== idx) writes.push({ id: entry.r.id, isCustom: entry.isCustom, order: idx });
    });
    // Свап после нормализации — оба участника теперь гарантированно i/j.
    const a = writes.find(w => w.id === list[i].r.id && w.isCustom === list[i].isCustom) || { id: list[i].r.id, isCustom: list[i].isCustom, order: i };
    const b = writes.find(w => w.id === list[j].r.id && w.isCustom === list[j].isCustom) || { id: list[j].r.id, isCustom: list[j].isCustom, order: j };
    a.order = j; b.order = i;
    if (!writes.includes(a)) writes.push(a);
    if (!writes.includes(b)) writes.push(b);

    await Promise.all(writes.map(w =>
      w.isCustom ? RecipesFirebase.updateRecipe(w.id, { order: w.order }) : RecipesFirebase.updateCatalogRecipe(w.id, { order: w.order })
    ));
    if (_el) {
      const cardsEl = _el.querySelector('#rec-cards');
      if (cardsEl) { cardsEl.innerHTML = _cards(); _bindCardEvents(); }
    }
  }

  function _card(r, isCustom, reorder) {
    const avg = RecipesState.getAvgRating(r.id);
    const isOpen = _openCards.has(r.id);
    const moveBtns = reorder ? `
          <div class="rec-move">
            <button class="rec-move-btn" data-move-up="${r.id}" data-move-custom="${isCustom ? '1' : ''}" data-move-cat="${reorder.catId}" ${reorder.isFirst ? 'disabled' : ''} aria-label="Выше">↑</button>
            <button class="rec-move-btn" data-move-down="${r.id}" data-move-custom="${isCustom ? '1' : ''}" data-move-cat="${reorder.catId}" ${reorder.isLast ? 'disabled' : ''} aria-label="Ниже">↓</button>
          </div>` : '';
    return `
      <div class="rec-card ${isOpen ? 'open' : ''}" data-id="${r.id}">
        <div class="rec-card__head">
          ${moveBtns}
          <div class="rec-card__info">
            <div class="rec-card__name">${_esc(r.name)}</div>
            ${r.sub ? `<div class="rec-card__sub">${_esc(r.sub)}</div>` : ''}
          </div>
          <div class="rec-card__meta">
            ${r.time ? `<span class="rec-time-pill">${_esc(r.time)}</span>` : ''}
            ${avg !== null
              ? `<span class="rec-rating-pill"><i class="ti ti-star" aria-hidden="true"></i>${avg}</span>`
              : `<span class="rec-rating-pill rec-rating-pill--empty"><i class="ti ti-star" aria-hidden="true"></i>—</span>`}
          </div>
          <div class="rec-card__chevron" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>
        ${isOpen ? _cardBody(r, isCustom) : ''}
      </div>`;
  }

  function _cardBody(r, isCustom) {
    const uid      = window.APP?.profile?.uid || 'anon';
    const name     = window.APP?.profile?.displayName || 'Я';
    const initials = name.charAt(0).toUpperCase();
    const userRating = RecipesState.getUserRating(r.id, uid);
    const comments   = RecipesState.getComments(r.id);

    const ingredients = r.ingredients && r.ingredients.length
      ? `<div class="rec-ing-label">Ингредиенты</div>
         <div class="rec-ingredients">
           ${r.ingredients.map(i => `
             <div class="rec-ing-row">
               <span class="rec-ing-name">${_esc(i.name)}</span>
               <span class="rec-ing-qty">${_esc(i.qty)}</span>
             </div>`).join('')}
         </div>`
      : '';

    // FIX: r.method и r.serveWith теперь экранируются через _esc()
    const serveWith = r.serveWith
      ? `<div class="rec-serve-with"><i class="ti ti-glass-full" aria-hidden="true"></i> Подать с: ${_esc(r.serveWith)}</div>`
      : '';

    const stars = [1,2,3,4,5].map(n => `
      <button class="rec-star ${n <= userRating ? 'on' : ''}" data-star="${n}" data-id="${r.id}" aria-label="${n} звёзд">
        <i class="ti ti-star" aria-hidden="true"></i>
      </button>`).join('');

    const commentsHtml = comments.map(cm => `
      <div class="rec-comment">
        <div class="rec-av">${_esc((cm.author || '?').charAt(0).toUpperCase())}</div>
        <div class="rec-comment__body">
          <div class="rec-comment__text">${_esc(cm.text)}</div>
          <div class="rec-comment__author">${_esc(cm.author)} · ${_esc(cm.date || '')}</div>
        </div>
      </div>`).join('');

    const myUid = window.APP?.user?.uid;
    const deleteBtn = isCustom && r.createdBy && r.createdBy === myUid
      ? `<button class="rec-del-btn" data-action="del-recipe" data-id="${r.id}">
           <i class="ti ti-trash" aria-hidden="true"></i> Удалить рецепт
         </button>`
      : '';
    const editBtn = `
      <button class="rec-edit-btn" data-action="edit-recipe" data-id="${r.id}" data-custom="${isCustom ? '1' : ''}">
        <i class="ti ti-pencil" aria-hidden="true"></i> Редактировать
      </button>`;

    return `
      <div class="rec-card__body">
        ${ingredients}
        <div class="rec-method">${_esc(r.method)}</div>
        ${serveWith}
        <div class="rec-edit-row">${editBtn}${deleteBtn}</div>
        <div class="rec-rate-row">
          <span class="rec-rate-label">Оценить:</span>
          <div class="rec-stars" role="group" aria-label="Оценка рецепта">${stars}</div>
        </div>
        ${commentsHtml ? `<div class="rec-comments">${commentsHtml}</div>` : ''}
        <div class="rec-add-comment">
          <div class="rec-av">${_esc(initials)}</div>
          <input class="rec-comment-input" type="text" placeholder="Заметка о рецепте..." data-id="${r.id}" maxlength="200">
          <button class="rec-send-btn" data-id="${r.id}" aria-label="Отправить">
            <i class="ti ti-send" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _bindEvents() {
    if (!_el) return;
    _el.querySelectorAll('.rec-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        // FIX: сначала снимаем active со старой кнопки, потом ставим на новую
        _el.querySelector('.rec-tab.active')?.classList.remove('active');
        btn.classList.add('active');
        _activeCat = btn.dataset.cat;
        _openCards.clear();
        _el.querySelector('#rec-cards').innerHTML = _cards();
        _bindCardEvents();
      });
    });
    _el.querySelector('#rec-tags')?.addEventListener('click', e => {
      const btn = e.target.closest('.rec-tag');
      if (!btn) return;
      _el.querySelector('.rec-tag.active')?.classList.remove('active');
      btn.classList.add('active');
      _activeTag = btn.dataset.tag;
      _openCards.clear();
      _el.querySelector('#rec-cards').innerHTML = _cards();
      _bindCardEvents();
    });
    _el.querySelector('#rec-back')?.addEventListener('click', () => {
      if (typeof RecipesIndex !== 'undefined') RecipesIndex.close();
    });
    _el.querySelector('#rec-add')?.addEventListener('click', () => _showRecipeForm(null, true));
    _el.querySelector('#rec-tab-settings')?.addEventListener('click', _showCategorySettings);
    _el.querySelector('#rec-search')?.addEventListener('input', e => {
      _activeQuery = e.target.value;
      _openCards.clear();
      _el.querySelector('#rec-cards').innerHTML = _cards();
      _bindCardEvents();
    });
    _bindCardEvents();
  }

  // ── Добавить/отредактировать рецепт ─────────────────────────────────
  // Одна форма на оба случая: existing=null — новый свой рецепт (isCustom
  // всегда true для новых — в каталог напрямую не пишем, только через
  // миграцию); existing — редактирование, isCustom определяет, в какую
  // коллекцию сохранять (recipes_custom или recipes_catalog).
  function _ingRowHtml(ing) {
    return `
      <div class="rec-ing-row-edit">
        <input class="rec-add-input rec-ing-name-input" type="text" list="rec-ing-datalist"
          placeholder="Название" value="${_esc(ing?.name || '')}">
        <input class="rec-add-input rec-ing-qty-input" type="text"
          placeholder="Кол-во" value="${_esc(ing?.qty || '')}">
        <button class="rec-ing-row-remove" data-action="rm-ing" aria-label="Удалить ингредиент">
          <i class="ti ti-x" aria-hidden="true"></i>
        </button>
      </div>`;
  }

  function _ingDatalistHtml() {
    const names = [...new Set(RecipesState.getIngredients().map(i => i.name))].sort();
    return `<datalist id="rec-ing-datalist">${names.map(n => `<option value="${_esc(n)}">`).join('')}</datalist>`;
  }

  function _showRecipeForm(existing, isCustom) {
    document.getElementById('rec-add-overlay')?.remove();

    const cats = RecipesData.getCategories();
    const catOptions = cats.map(c =>
      `<option value="${c.id}" ${c.id === (existing?.category || _activeCat) ? 'selected' : ''}>${_esc(c.label)}</option>`
    ).join('');
    const ingredients = (existing?.ingredients?.length ? existing.ingredients : [null]);

    const overlay = document.createElement('div');
    overlay.className = 'rec-add-overlay';
    overlay.id = 'rec-add-overlay';
    overlay.innerHTML = `
      <div class="rec-add-sheet">
        <div class="rec-add-handle"></div>
        <div class="rec-add-scroll">
          <div class="rec-add-title">${existing ? 'Редактировать рецепт' : 'Новый рецепт'}</div>

          <div class="rec-add-row-2">
            <div>
              <div class="rec-add-label">Категория</div>
              <select class="rec-add-input" id="rec-add-cat">${catOptions}</select>
            </div>
            <div>
              <div class="rec-add-label">Направление (необязательно)</div>
              <input class="rec-add-input" id="rec-add-dest" type="text" placeholder="Сахалин, Кольский"
                value="${_esc((existing?.destinations || []).join(', '))}">
            </div>
          </div>

          <div class="rec-add-label">Название</div>
          <input class="rec-add-input" id="rec-add-name" type="text" placeholder="Малосольная рыба" value="${_esc(existing?.name || '')}">

          <div class="rec-add-row-2">
            <div>
              <div class="rec-add-label">Коротко (необязательно)</div>
              <input class="rec-add-input" id="rec-add-sub" type="text" placeholder="8-12 ч без огня" value="${_esc(existing?.sub || '')}">
            </div>
            <div>
              <div class="rec-add-label">Время</div>
              <input class="rec-add-input" id="rec-add-time" type="text" placeholder="15 мин актив." value="${_esc(existing?.time || '')}">
            </div>
          </div>

          <div class="rec-add-label">Ингредиенты — название начинает подсказывать уже существующие, чтобы не плодить дубли</div>
          <div id="rec-ing-rows">${ingredients.map(_ingRowHtml).join('')}</div>
          ${_ingDatalistHtml()}
          <button class="rec-ing-add-row" id="rec-ing-add" type="button">+ добавить ингредиент</button>

          <div class="rec-add-label">Способ приготовления</div>
          <textarea class="rec-add-textarea" id="rec-add-method" placeholder="Не мыть — обсушить. Натереть смесью...">${_esc(existing?.method || '')}</textarea>

          <div class="rec-add-label">Подать с (необязательно)</div>
          <input class="rec-add-input" id="rec-add-serve" type="text" placeholder="Джин-тоник" value="${_esc(existing?.serveWith || '')}">
        </div>
        <div class="rec-add-actions">
          <button class="rec-add-save" id="rec-add-save">${existing ? 'Сохранить' : 'Добавить'}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    const rowsEl = overlay.querySelector('#rec-ing-rows');
    rowsEl.addEventListener('click', e => {
      const btn = e.target.closest('[data-action="rm-ing"]');
      if (!btn) return;
      if (rowsEl.children.length > 1) btn.closest('.rec-ing-row-edit').remove();
      else btn.closest('.rec-ing-row-edit').querySelectorAll('input').forEach(i => i.value = '');
    });
    overlay.querySelector('#rec-ing-add').addEventListener('click', () => {
      rowsEl.insertAdjacentHTML('beforeend', _ingRowHtml(null));
    });

    overlay.querySelector('#rec-add-save').addEventListener('click', async e => {
      const name = overlay.querySelector('#rec-add-name').value.trim();
      if (!name) { overlay.querySelector('#rec-add-name').focus(); return; }

      const ingredients = [...rowsEl.querySelectorAll('.rec-ing-row-edit')]
        .map(row => ({
          name: row.querySelector('.rec-ing-name-input').value.trim(),
          qty: row.querySelector('.rec-ing-qty-input').value.trim(),
        }))
        .filter(ing => ing.name);

      // Ингредиенты, которых ещё нет в каталоге (автодополнение выше их не
      // предлагало, значит это новое имя) — заводим в общий каталог сразу
      // при сохранении рецепта, а не отдельным шагом: иначе "добавить
      // ингредиент в каталог" стало бы ещё одной формой, которую надо
      // помнить открыть отдельно.
      for (const ing of ingredients) {
        if (!RecipesState.getIngredientByName(ing.name)) {
          try {
            const newId = await RecipesFirebase.addIngredient({ name: ing.name, category: null });
            RecipesState.setIngredients([...RecipesState.getIngredients(), { id: newId, name: ing.name, category: null }]);
          } catch (_) {}
        }
      }
      // ingredientId — жёсткая ссылка на каталог (см. RecipesData.
      // resolveShoppingCategory) вместо сопоставления по имени при каждом
      // использовании; category остаётся тоже, как отображаемый fallback
      // на случай если сам каталог когда-нибудь не найдётся по id.
      const withCategory = ingredients.map(ing => {
        const catalogIng = RecipesState.getIngredientByName(ing.name);
        return Object.assign({}, ing, {
          ingredientId: (catalogIng && catalogIng.id) || null,
          category: (catalogIng && catalogIng.category) || null,
        });
      });

      const recipe = {
        category: overlay.querySelector('#rec-add-cat').value,
        // Нормализуем регистр целиком (не только первую букву) — иначе
        // "сахалин" и "САХАЛИН" из разных рецептов становятся двумя разными
        // тегами вместо одного (см. _allTags/_matchesTag — сравнение точное).
        destinations: UIUtils.splitNames(overlay.querySelector('#rec-add-dest').value).map(t =>
          t.charAt(0).toUpperCase() + t.slice(1).toLowerCase()),
        name,
        sub: overlay.querySelector('#rec-add-sub').value.trim(),
        time: overlay.querySelector('#rec-add-time').value.trim(),
        ingredients: withCategory,
        method: overlay.querySelector('#rec-add-method').value.trim(),
        serveWith: overlay.querySelector('#rec-add-serve').value.trim() || null,
      };

      await UIUtils.withBusyButton(e.currentTarget, async () => {
        if (!existing) {
          await RecipesFirebase.addRecipe(recipe);
        } else if (isCustom) {
          await RecipesFirebase.updateRecipe(existing.id, recipe);
        } else {
          await RecipesFirebase.updateCatalogRecipe(existing.id, recipe);
        }
      });
      overlay.remove();
    });
  }

  function _bindCardEvents() {
    if (!_el) return;
    _el.querySelectorAll('.rec-move-btn').forEach(btn => {
      btn.addEventListener('click', e => {
        e.stopPropagation();
        if (btn.disabled) return;
        const catId = btn.dataset.moveCat;
        const isCustom = btn.dataset.moveCustom === '1';
        const id = btn.dataset.moveUp || btn.dataset.moveDown;
        const dir = btn.dataset.moveUp ? -1 : 1;
        _moveRecipe(catId, id, isCustom, dir);
      });
    });
    _el.querySelectorAll('.rec-card__head').forEach(head => {
      head.addEventListener('click', e => {
        if (e.target.closest('.rec-move')) return;
        const card = head.closest('.rec-card');
        const id = card.dataset.id;
        if (_openCards.has(id)) {
          _openCards.delete(id);
          card.classList.remove('open');
          card.querySelector('.rec-card__body')?.remove();
        } else {
          _openCards.add(id);
          card.classList.add('open');
          const catalogR = RecipesData.getRecipeById(id);
          const r = catalogR || RecipesState.getCustomRecipeById(id);
          if (r) card.insertAdjacentHTML('beforeend', _cardBody(r, !catalogR));
          _bindBodyEvents(card);
        }
      });
    });
    // Уже открытые карточки после ре-рендера (refresh() — срабатывает от
    // каждого снапшота Firestore) отрисовываются сразу с телом внутри
    // _card(), но их кнопки (рейтинг/комментарий/удаление) без этого
    // остаются без обработчиков — перепривязываем отдельно.
    _el.querySelectorAll('.rec-card.open').forEach(card => _bindBodyEvents(card));
  }

  function _bindBodyEvents(card) {
    const id = card.dataset.id;
    card.querySelectorAll('.rec-star').forEach(star => {
      star.addEventListener('click', e => {
        e.stopPropagation();
        const rating = parseInt(star.dataset.star);
        const uid = window.APP?.profile?.uid || 'anon';
        RecipesState.setRating(id, uid, rating);
        RecipesFirebase.saveRating(id, uid, rating);
        card.querySelectorAll('.rec-star').forEach(s => {
          s.classList.toggle('on', parseInt(s.dataset.star) <= rating);
        });
        _updateRatingPill(card, id);
      });
    });

    const input = card.querySelector('.rec-comment-input');
    const sendBtn = card.querySelector('.rec-send-btn');
    const _doSend = () => {
      const text = input?.value.trim();
      if (!text) return;
      const profile = window.APP?.profile;
      const comment = {
        text,
        author: profile?.displayName || 'Участник',
        uid: profile?.uid || 'anon',
        date: new Date().toLocaleDateString('ru', { day: 'numeric', month: 'short' })
      };
      UIUtils.withBusyButton(sendBtn, async () => {
        RecipesState.pushComment(id, comment);
        RecipesFirebase.addComment(id, comment);
        input.value = '';
        _appendComment(card, comment);
      });
    };
    sendBtn?.addEventListener('click', e => { e.stopPropagation(); _doSend(); });
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
    input?.addEventListener('click', e => e.stopPropagation());

    const delBtn = card.querySelector('[data-action="del-recipe"]');
    delBtn?.addEventListener('click', async e => {
      e.stopPropagation();
      const ok = await UIUtils.confirmSheet('Удалить этот рецепт?', { okLabel: 'Удалить' });
      if (!ok) return;
      await RecipesFirebase.deleteRecipe(id);
      _openCards.delete(id);
    });

    const editBtn = card.querySelector('[data-action="edit-recipe"]');
    editBtn?.addEventListener('click', e => {
      e.stopPropagation();
      const isCustom = editBtn.dataset.custom === '1';
      const r = isCustom ? RecipesState.getCustomRecipeById(id) : RecipesData.getRecipeById(id);
      if (r) _showRecipeForm(r, isCustom);
    });
  }

  function _appendComment(card, comment) {
    let commentsEl = card.querySelector('.rec-comments');
    if (!commentsEl) {
      commentsEl = document.createElement('div');
      commentsEl.className = 'rec-comments';
      card.querySelector('.rec-rate-row')?.insertAdjacentElement('afterend', commentsEl);
    }
    const div = document.createElement('div');
    div.className = 'rec-comment';
    div.innerHTML = `
      <div class="rec-av">${_esc(comment.author.charAt(0).toUpperCase())}</div>
      <div class="rec-comment__body">
        <div class="rec-comment__text">${_esc(comment.text)}</div>
        <div class="rec-comment__author">${_esc(comment.author)} · ${_esc(comment.date)}</div>
      </div>`;
    commentsEl.appendChild(div);
  }

  function _updateRatingPill(card, id) {
    const avg = RecipesState.getAvgRating(id);
    const pill = card.querySelector('.rec-rating-pill');
    if (pill) {
      pill.className = 'rec-rating-pill';
      pill.innerHTML = `<i class="ti ti-star" aria-hidden="true"></i>${avg !== null ? avg : '—'}`;
    }
  }

  // Полная замена innerHTML на каждый снапшот (включая эхо своей же записи)
  // убивала DOM-узел незасейвленного комментария, если человек как раз его
  // печатал — сохраняем и восстанавливаем значение/фокус/курсор вокруг
  // перерисовки, как и в modules/bar/render.js (тот же паттерн).
  function refresh() {
    if (!_el) return;
    const active = document.activeElement;
    let pending = null;
    if (active && active.classList && active.classList.contains('rec-comment-input')) {
      const card = active.closest('.rec-card');
      if (card) pending = { id: card.dataset.id, value: active.value, start: active.selectionStart, end: active.selectionEnd };
    }
    // Список тегов направлений тоже может измениться удалённо (кто-то
    // добавил/отредактировал рецепт с новым тегом, пока этот экран открыт
    // у другого участника) — контейнер #rec-tags уже висит на делегированном
    // обработчике клика (см. _bindEvents), поэтому достаточно перерисовать
    // только содержимое, разметку и обработчик трогать не нужно.
    const tagsEl = _el.querySelector('#rec-tags');
    if (tagsEl) tagsEl.innerHTML = _tagPillsHtml();

    _el.querySelector('#rec-cards').innerHTML = _cards();
    _bindCardEvents();
    if (pending) {
      const card  = _el.querySelector(`.rec-card[data-id="${pending.id}"]`);
      const input = card && card.querySelector('.rec-comment-input');
      if (input) {
        input.value = pending.value;
        input.focus();
        try { input.setSelectionRange(pending.start, pending.end); } catch (e) {}
      }
    }
  }

  return { render, refresh };
})();

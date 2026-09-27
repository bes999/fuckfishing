'use strict';

const RecipesRender = (() => {

  let _el = null;
  let _activeCat = RecipesData.getCategories()[0].id;
  let _activeTag = 'all'; // 'all' | 'mine' | <направление>
  let _activeQuery = '';
  let _reorderMode = false;

  // Экран рецепта — отдельный (не раскрытие карточки в списке), поэтому
  // список хранит только "куда вернуться", а не открытые id.
  let _screen = 'list'; // 'list' | 'detail'
  let _detailId = null;
  let _detailCustom = false;

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
    el.innerHTML = _screen === 'detail' ? _renderDetailScreen() : _renderListScreen();
    _bindEvents();
  }

  function _renderListScreen() {
    const filters = _reorderMode ? '' : `${_searchBox()}${_tagFilter()}`;
    return `
      <div class="rec-wrap">
        ${_topbar()}
        ${filters}
        ${_tabs()}
        <div class="rec-rows" id="rec-rows">${_rows()}</div>
      </div>`;
  }

  function _searchBox() {
    // Обёртка на всю ширину, тот же bg2-паттерн, что у .rec-tags-row/.rec-tabs
    // ниже — без неё поле поиска смотрелось отдельной плавающей коробкой,
    // не совпадающей по краям с рядами под ней.
    return `<div class="rec-search-row">
      <input class="rec-search" id="rec-search" type="text" placeholder="Поиск по всем рецептам" value="${_esc(_activeQuery)}">
    </div>`;
  }

  function _tagPillsHtml() {
    const tags = _allTags();
    // "Все места" — всегда, дальше направления, реально проставленные на
    // рецептах. «Моё» уже есть среди них как метка (data.js) — отдельный
    // фильтр «созданные мной» с тем же названием дублировал бы её.
    const pills = [{ v: 'all', t: 'Все места' }, ...tags.map(t => ({ v: t, t }))];
    return pills.map(p => `
      <button class="rec-tag ${p.v === _activeTag ? 'active' : ''}" data-tag="${_esc(p.v)}">${_esc(p.t)}</button>`).join('');
  }

  function _tagFilter() {
    return `<div class="rec-tags-row"><span class="rec-tags-label">Для</span><div class="rec-tags" id="rec-tags">${_tagPillsHtml()}</div></div>`;
  }

  function _topbar() {
    const right = _reorderMode
      ? `<button class="rec-done-btn" id="rec-reorder-done">Готово</button>`
      : `<button class="rec-add-btn" id="rec-add" aria-label="Новый рецепт">${UIUtils.ico('plus')}</button>
         <button class="rec-menu-btn" id="rec-menu" aria-label="Ещё: настроить вкладки, изменить порядок">${UIUtils.ico('dots')}</button>`;
    return `
      <div class="rec-topbar">
        <button class="rec-back-btn" id="rec-back" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
        <div class="rec-topbar__text">
          <div class="rec-topbar__title">Рецепты</div>
          <div class="rec-topbar__sub">Кулинарная книга экспедиции</div>
        </div>
        ${right}
      </div>`;
  }

  function _tabs() {
    const cats = RecipesData.getCategories();
    const tabs = cats.map(c => `
      <button class="rec-tab ${c.id === _activeCat ? 'active' : ''}" data-cat="${c.id}">
        ${_esc(c.label)}
      </button>`).join('');
    return `<div class="rec-tabs" role="tablist">${tabs}</div>`;
  }

  // ── "…" в шапке — настройка вкладок и вход в режим перестановки ──
  function _showHeaderMenu() {
    document.getElementById('rec-menu-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'rec-menu-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="rec-menu-list">
          <button class="rec-menu-item" data-action="rec-menu-tabs">Настроить вкладки</button>
          <button class="rec-menu-item" data-action="rec-menu-reorder">Изменить порядок</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      if (e.target.closest('[data-action="rec-menu-tabs"]')) {
        overlay.remove();
        _showCategorySettings();
        return;
      }
      if (e.target.closest('[data-action="rec-menu-reorder"]')) {
        overlay.remove();
        // Перестановка имеет смысл только на полном, нефильтрованном списке
        // категории (см. _rows/_moveRecipe) — сбрасываем поиск и тег.
        _reorderMode = true;
        _activeTag = 'all';
        _activeQuery = '';
        if (_el) render(_el);
      }
    });
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

  // ── Список: строки внутри одной карточки (не раскрывающиеся) ──
  function _rows() {
    if (_reorderMode) {
      const merged = _orderedRecipesForCat(_activeCat);
      if (!merged.length) return '<div class="rec-empty">Ничего в этом наборе</div>';
      const html = merged.map((entry, i) => _row(entry.r, entry.isCustom, {
        catId: _activeCat, isFirst: i === 0, isLast: i === merged.length - 1,
      })).join('');
      return `<div class="rec-list-card">${html}</div>`;
    }

    // Универсальный рецепт (пустой destinations) актуален при любом выбранном
    // направлении — фильтр сужает "что ещё, кроме базы", а не заменяет её.
    const matchesTag = r => {
      if (_activeTag === 'all') return true;
      if (_activeTag === 'mine') {
        const uid = window.APP?.user?.uid;
        return !!(uid && r.createdBy === uid);
      }
      return !(r.destinations || []).length || r.destinations.includes(_activeTag);
    };

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
        return '<div class="rec-empty">Ничего не найдено</div>';
      }
      const html = builtIn.map(r => _row(r, false)).join('') + custom.map(r => _row(r, true)).join('');
      return `<div class="rec-list-card">${html}</div>`;
    }

    const cat = RecipesData.getCategories().find(c => c.id === _activeCat);
    const builtIn = (cat ? cat.cocktails : []).filter(matchesTag);
    const custom  = RecipesState.getCustomRecipes(_activeCat).filter(matchesTag);
    if (!builtIn.length && !custom.length) {
      return '<div class="rec-empty">Ничего в этом наборе</div>';
    }
    const html = builtIn.map(r => _row(r, false)).join('') + custom.map(r => _row(r, true)).join('');
    return `<div class="rec-list-card">${html}</div>`;
  }

  // Built-in + свои рецепты категории вместе, отсортированные по полю
  // order (отсутствует = 0 — стабильная сортировка сохраняет исходный
  // порядок, пока никто ничего не переставлял). Общий helper для _rows()
  // (рисует стрелки в режиме перестановки) и _moveRecipe() (сама логика).
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
    if (_el && _screen === 'list') {
      const rowsEl = _el.querySelector('#rec-rows');
      if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
    }
  }

  function _row(r, isCustom, reorder) {
    if (reorder) {
      return `
        <div class="rec-row rec-row--reorder" data-id="${r.id}" data-custom="${isCustom ? '1' : ''}">
          <div class="rec-row__arrows">
            <button class="rec-move-btn" data-move-up="${r.id}" data-move-custom="${isCustom ? '1' : ''}" data-move-cat="${reorder.catId}" ${reorder.isFirst ? 'disabled' : ''} aria-label="Выше">↑</button>
            <button class="rec-move-btn" data-move-down="${r.id}" data-move-custom="${isCustom ? '1' : ''}" data-move-cat="${reorder.catId}" ${reorder.isLast ? 'disabled' : ''} aria-label="Ниже">↓</button>
          </div>
          <div class="rec-row__info">
            <div class="rec-row__name">${_esc(r.name)}</div>
            ${r.sub ? `<div class="rec-row__sub">${_esc(r.sub)}</div>` : ''}
          </div>
        </div>`;
    }
    const avg = RecipesState.getAvgRating(r.id);
    return `
      <div class="rec-row" data-id="${r.id}" data-custom="${isCustom ? '1' : ''}">
        <div class="rec-row__info">
          <div class="rec-row__name">${_esc(r.name)}</div>
          ${r.sub ? `<div class="rec-row__sub">${_esc(r.sub)}</div>` : ''}
        </div>
        <div class="rec-row__meta">
          ${r.time ? `<span class="rec-row__time">${UIUtils.ico('hourglass')}${_esc(r.time)}</span>` : ''}
          ${avg !== null ? `<span class="rec-row__rating">${UIUtils.ico('star')}${avg}</span>` : ''}
        </div>
        <span class="rec-row__chevron" aria-hidden="true">${UIUtils.ico('chevron-right')}</span>
      </div>`;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Только для отображения — режет метод на "предложения" по границам
  // .!? — данные (r.method) не трогаем, это чисто разметка шагов.
  function _splitSentences(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    // Шаг — предложение: режем только на «. / ! / ?» + пробел + заглавная
    // буква, иначе «2 ст. л.» и «3-3.5 мин» разваливались на обрывки.
    return s.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"(])/).map(p => p.trim()).filter(Boolean);
  }

  function _bindEvents() {
    if (!_el) return;
    if (_screen === 'detail') { _bindDetailEvents(); return; }

    _el.querySelectorAll('.rec-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _el.querySelector('.rec-tab.active')?.classList.remove('active');
        btn.classList.add('active');
        _activeCat = btn.dataset.cat;
        const rowsEl = _el.querySelector('#rec-rows');
        if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
      });
    });
    _el.querySelector('#rec-tags')?.addEventListener('click', e => {
      const btn = e.target.closest('.rec-tag');
      if (!btn) return;
      _el.querySelector('.rec-tag.active')?.classList.remove('active');
      btn.classList.add('active');
      _activeTag = btn.dataset.tag;
      const rowsEl = _el.querySelector('#rec-rows');
      if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
    });
    _el.querySelector('#rec-back')?.addEventListener('click', () => {
      if (typeof RecipesIndex !== 'undefined') RecipesIndex.close();
    });
    _el.querySelector('#rec-add')?.addEventListener('click', () => _showRecipeForm(null, true));
    _el.querySelector('#rec-menu')?.addEventListener('click', _showHeaderMenu);
    _el.querySelector('#rec-reorder-done')?.addEventListener('click', () => {
      _reorderMode = false;
      if (_el) render(_el);
    });
    _el.querySelector('#rec-search')?.addEventListener('input', e => {
      _activeQuery = e.target.value;
      const rowsEl = _el.querySelector('#rec-rows');
      if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
    });
    _bindRowEvents();
  }

  function _bindRowEvents() {
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
    _el.querySelectorAll('.rec-row').forEach(row => {
      row.addEventListener('click', e => {
        if (_reorderMode || e.target.closest('.rec-row__arrows')) return;
        _detailId = row.dataset.id;
        _detailCustom = row.dataset.custom === '1';
        _screen = 'detail';
        render(_el);
      });
    });
  }

  /* ══════════════════════════════════════════════
     ЭКРАН РЕЦЕПТА — отдельный, не раскрытие карточки
  ══════════════════════════════════════════════ */
  function _renderDetailScreen() {
    const catalogR = !_detailCustom ? RecipesData.getRecipeById(_detailId) : null;
    const r = catalogR || RecipesState.getCustomRecipeById(_detailId);
    if (!r) { _screen = 'list'; return _renderListScreen(); }
    const catDef = RecipesData.getCategoryDefs().find(d => d.id === r.category);

    return `
      <div class="rec-wrap rec-detail">
        <div class="rec-det-topbar">
          <button class="rec-back-btn" id="rec-det-back" aria-label="К рецептам">${UIUtils.ico('chevron-left')}</button>
          <span class="rec-det-crumb">${_esc(catDef ? catDef.label : '')}</span>
          <button class="rec-det-edit" id="rec-det-edit" aria-label="Редактировать рецепт">${UIUtils.ico('pencil')}</button>
        </div>
        <div class="rec-det-body">
          <div class="rec-det-head">
            <h1 class="rec-det-title">${_esc(r.name)}</h1>
            <div class="rec-det-meta">
              ${r.time ? `<span class="rec-det-time">${UIUtils.ico('hourglass')}${_esc(r.time)}</span>` : ''}
              ${r.time && r.sub ? '<span>·</span>' : ''}
              ${r.sub ? `<span>${_esc(r.sub)}</span>` : ''}
            </div>
          </div>
          ${_detailIngredientsCard(r)}
          ${_detailMethodCard(r)}
          ${_detailRatingCard(r)}
          ${_detailNotesCard(r)}
        </div>
      </div>`;
  }

  function _detailIngredientsCard(r) {
    if (!r.ingredients || !r.ingredients.length) return '';
    return `
      <section class="rec-det-card">
        <h2 class="rec-det-card__title">Ингредиенты</h2>
        <div class="rec-det-ing">
          ${r.ingredients.map(i => `
            <div class="rec-det-ing__row">
              <span class="rec-det-ing__name">${_esc(i.name)}</span>
              <span class="rec-det-ing__qty">${_esc(i.qty)}</span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function _detailMethodCard(r) {
    const steps = _splitSentences(r.method);
    const serveWith = r.serveWith
      ? `<div class="rec-det-serve">${UIUtils.ico('glass-full')} Подать с: ${_esc(r.serveWith)}</div>`
      : '';
    if (!steps.length && !serveWith) return '';
    return `
      <section class="rec-det-card">
        <h2 class="rec-det-card__title">Как готовить</h2>
        <div class="rec-det-steps">
          ${steps.map((t, i) => `
            <div class="rec-det-step">
              <span class="rec-det-step__n">${i + 1}</span>
              <span class="rec-det-step__txt">${_esc(t)}</span>
            </div>`).join('')}
        </div>
        ${serveWith}
      </section>`;
  }

  function _detailRatingCard(r) {
    const uid = window.APP?.profile?.uid || 'anon';
    const userRating = RecipesState.getUserRating(r.id, uid);
    const avg = RecipesState.getAvgRating(r.id);
    const stars = [1,2,3,4,5].map(n => `
      <button class="rec-star ${n <= userRating ? 'on' : ''}" data-star="${n}" data-id="${r.id}" aria-label="${n} звёзд">${UIUtils.ico('star')}</button>`).join('');
    return `
      <section class="rec-det-card">
        <h2 class="rec-det-card__title">Твоя оценка</h2>
        <div class="rec-det-stars">${stars}</div>
        <span class="rec-det-hint" id="rec-det-rating-hint">${avg !== null ? `Средняя оценка: ${avg}` : 'Пока никто не оценил'}</span>
      </section>`;
  }

  function _detailNotesCard(r) {
    const name     = window.APP?.profile?.displayName || 'Я';
    const initials = name.charAt(0).toUpperCase();
    const comments = RecipesState.getComments(r.id);
    const commentsHtml = comments.map(cm => `
      <div class="rec-comment">
        <div class="rec-av">${_esc((cm.author || '?').charAt(0).toUpperCase())}</div>
        <div class="rec-comment__body">
          <div class="rec-comment__text">${_esc(cm.text)}</div>
          <div class="rec-comment__author">${_esc(cm.author)} · ${_esc(cm.date || '')}</div>
        </div>
      </div>`).join('');
    return `
      <section class="rec-det-card">
        <h2 class="rec-det-card__title">Заметки</h2>
        <span class="rec-det-hint">Что поменять в следующий раз, чем заменить — видят все</span>
        <div class="rec-comments" id="rec-det-comments">${commentsHtml}</div>
        <div class="rec-add-comment">
          <div class="rec-av">${_esc(initials)}</div>
          <input class="rec-comment-input" type="text" placeholder="Заметка о рецепте…" data-id="${r.id}" maxlength="200">
          <button class="rec-send-btn" data-id="${r.id}" aria-label="Отправить">${UIUtils.ico('send')}</button>
        </div>
      </section>`;
  }

  function _bindDetailEvents() {
    if (!_el) return;
    const catalogR = !_detailCustom ? RecipesData.getRecipeById(_detailId) : null;
    const r = catalogR || RecipesState.getCustomRecipeById(_detailId);
    if (!r) return;
    const id = r.id;

    _el.querySelector('#rec-det-back')?.addEventListener('click', () => {
      _screen = 'list';
      render(_el);
    });
    _el.querySelector('#rec-det-edit')?.addEventListener('click', () => _showRecipeForm(r, _detailCustom));

    _el.querySelectorAll('.rec-star').forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.star);
        const uid = window.APP?.profile?.uid || 'anon';
        RecipesState.setRating(id, uid, rating);
        RecipesFirebase.saveRating(id, uid, rating);
        _el.querySelectorAll('.rec-star').forEach(s => {
          s.classList.toggle('on', parseInt(s.dataset.star) <= rating);
        });
        const avg = RecipesState.getAvgRating(id);
        const hint = _el.querySelector('#rec-det-rating-hint');
        if (hint) hint.textContent = avg !== null ? `Средняя оценка: ${avg}` : 'Пока никто не оценил';
      });
    });

    const input = _el.querySelector('.rec-comment-input');
    const sendBtn = _el.querySelector('.rec-send-btn');
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
        _appendComment(comment);
      });
    };
    sendBtn?.addEventListener('click', _doSend);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
  }

  function _appendComment(comment) {
    let commentsEl = _el.querySelector('#rec-det-comments');
    if (!commentsEl) return;
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
          ${UIUtils.ico('x')}
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
    const activeCatId = existing?.category || _activeCat;
    const catChips = cats.map(c =>
      `<button type="button" class="rec-cat-chip ${c.id === activeCatId ? 'active' : ''}" data-cat-chip="${c.id}">${_esc(c.label)}</button>`
    ).join('');
    const ingredients = (existing?.ingredients?.length ? existing.ingredients : [null]);

    const myUid = window.APP?.user?.uid;
    const canDelete = !!(existing && isCustom && existing.createdBy && existing.createdBy === myUid);

    const overlay = document.createElement('div');
    overlay.className = 'rec-add-overlay';
    overlay.id = 'rec-add-overlay';
    overlay.innerHTML = `
      <div class="rec-add-sheet">
        <div class="rec-add-handle"></div>
        <div class="rec-add-scroll">
          <div class="rec-add-title">${existing ? 'Редактировать рецепт' : 'Новый рецепт'}</div>

          <div class="rec-add-label">Название</div>
          <input class="rec-add-input" id="rec-add-name" type="text" placeholder="Малосольная рыба" value="${_esc(existing?.name || '')}">

          <div class="rec-add-row-2">
            <div>
              <div class="rec-add-label">Подпись (необязательно)</div>
              <input class="rec-add-input" id="rec-add-sub" type="text" placeholder="8-12 ч без огня" value="${_esc(existing?.sub || '')}">
            </div>
            <div>
              <div class="rec-add-label">Время</div>
              <input class="rec-add-input" id="rec-add-time" type="text" placeholder="15 мин актив." value="${_esc(existing?.time || '')}">
            </div>
          </div>

          <div class="rec-add-label">Категория</div>
          <div class="rec-chip-row" id="rec-add-cat-chips" data-value="${_esc(activeCatId)}">${catChips}</div>

          <div class="rec-add-label" style="margin-top:14px">Ингредиенты</div>
          <span class="rec-add-hint">начни вводить — подскажем из каталога продуктов</span>
          <div id="rec-ing-rows">${ingredients.map(_ingRowHtml).join('')}</div>
          ${_ingDatalistHtml()}
          <button class="rec-ing-add-row" id="rec-ing-add" type="button">+ добавить ингредиент</button>

          <div class="rec-add-label">Как готовить</div>
          <textarea class="rec-add-textarea" id="rec-add-method" placeholder="Не мыть — обсушить. Натереть смесью...">${_esc(existing?.method || '')}</textarea>

          <div class="rec-add-label">Подать с (необязательно)</div>
          <input class="rec-add-input" id="rec-add-serve" type="text" placeholder="Джин-тоник" value="${_esc(existing?.serveWith || '')}">

          <div class="rec-add-label">Для мест</div>
          <input class="rec-add-input" id="rec-add-dest" type="text" placeholder="Сахалин, Кольский"
            value="${_esc((existing?.destinations || []).join(', '))}">
          <span class="rec-add-hint">пусто — рецепт для всех мест</span>

          ${canDelete ? `
          <button type="button" class="rec-add-delete" id="rec-add-delete">Удалить рецепт</button>
          <span class="rec-add-hint">Удалить можно только свой рецепт.</span>` : ''}
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

    const catChipsEl = overlay.querySelector('#rec-add-cat-chips');
    catChipsEl.addEventListener('click', e => {
      const btn = e.target.closest('.rec-cat-chip');
      if (!btn) return;
      catChipsEl.querySelectorAll('.rec-cat-chip').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      catChipsEl.dataset.value = btn.dataset.catChip;
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

    overlay.querySelector('#rec-add-delete')?.addEventListener('click', async () => {
      const ok = await UIUtils.confirmSheet('Удалить этот рецепт?', { okLabel: 'Удалить' });
      if (!ok) return;
      await RecipesFirebase.deleteRecipe(existing.id);
      overlay.remove();
      if (_screen === 'detail' && _detailId === existing.id) {
        _screen = 'list';
        if (_el) render(_el);
      }
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
        category: catChipsEl.dataset.value,
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

  // Вызывается из RecipesFirebase при каждом снапшоте (каталог/свои
  // рецепты/рейтинги/комментарии — включая эхо своей же записи). Список и
  // экран рецепта перерисовываются по-разному: на экране рецепта важно не
  // потерять фокус/значение поля заметки, если человек как раз её печатает.
  function refresh() {
    if (!_el) return;

    if (_screen === 'detail') {
      const active = document.activeElement;
      let pending = null;
      if (active && active.classList && active.classList.contains('rec-comment-input')) {
        pending = { value: active.value, start: active.selectionStart, end: active.selectionEnd };
      }
      _el.innerHTML = _renderDetailScreen();
      _bindEvents();
      if (pending) {
        const input = _el.querySelector('.rec-comment-input');
        if (input) {
          input.value = pending.value;
          input.focus();
          try { input.setSelectionRange(pending.start, pending.end); } catch (e) {}
        }
      }
      return;
    }

    // Список тегов направлений тоже может измениться удалённо (кто-то
    // добавил/отредактировал рецепт с новым тегом, пока этот экран открыт
    // у другого участника) — контейнер #rec-tags уже висит на делегированном
    // обработчике клика (см. _bindEvents), поэтому достаточно перерисовать
    // только содержимое, разметку и обработчик трогать не нужно.
    const tagsEl = _el.querySelector('#rec-tags');
    if (tagsEl) tagsEl.innerHTML = _tagPillsHtml();

    const rowsEl = _el.querySelector('#rec-rows');
    if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
  }

  return { render, refresh };
})();

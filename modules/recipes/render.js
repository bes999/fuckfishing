'use strict';

const RecipesRender = (() => {

  let _el = null;
  let _activeCat = 'fish';
  let _openCards = new Set();

  function render(el) {
    _el = el;
    if (!el) return;
    el.innerHTML = `
      <div class="rec-wrap">
        ${_topbar()}
        ${_tabs()}
        <div class="rec-cards" id="rec-cards">${_cards()}</div>
      </div>`;
    _bindEvents();
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
    return `<div class="rec-tabs" role="tablist">${tabs}</div>`;
  }

  function _cards() {
    const cat = RecipesData.getCategories().find(c => c.id === _activeCat);
    const builtIn = cat ? cat.cocktails : [];
    const custom  = RecipesState.getCustomRecipes(_activeCat);
    return builtIn.map(r => _card(r)).join('') + custom.map(r => _card(r)).join('');
  }

  function _card(r) {
    const avg = RecipesState.getAvgRating(r.id);
    const isOpen = _openCards.has(r.id);
    return `
      <div class="rec-card ${isOpen ? 'open' : ''}" data-id="${r.id}">
        <div class="rec-card__head">
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
        ${isOpen ? _cardBody(r) : ''}
      </div>`;
  }

  function _cardBody(r) {
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
    const deleteBtn = r.createdBy && r.createdBy === myUid
      ? `<button class="rec-del-btn" data-action="del-recipe" data-id="${r.id}">
           <i class="ti ti-trash" aria-hidden="true"></i> Удалить рецепт
         </button>`
      : '';

    return `
      <div class="rec-card__body">
        ${ingredients}
        <div class="rec-method">${_esc(r.method)}</div>
        ${serveWith}
        ${deleteBtn}
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
    _el.querySelector('#rec-back')?.addEventListener('click', () => {
      if (typeof RecipesIndex !== 'undefined') RecipesIndex.close();
    });
    _el.querySelector('#rec-add')?.addEventListener('click', showAddForm);
    _bindCardEvents();
  }

  // ── Добавить свой рецепт ────────────────────────────────────────────
  function showAddForm() {
    document.getElementById('rec-add-overlay')?.remove();

    const cats = RecipesData.getCategories();
    const catOptions = cats.map(c =>
      `<option value="${c.id}" ${c.id === _activeCat ? 'selected' : ''}>${_esc(c.label)}</option>`
    ).join('');

    const overlay = document.createElement('div');
    overlay.className = 'rec-add-overlay';
    overlay.id = 'rec-add-overlay';
    overlay.innerHTML = `
      <div class="rec-add-sheet">
        <div class="rec-add-handle"></div>
        <div class="rec-add-scroll">
          <div class="rec-add-title">Новый рецепт</div>

          <div class="rec-add-label">Категория</div>
          <select class="rec-add-input" id="rec-add-cat">${catOptions}</select>

          <div class="rec-add-label">Название</div>
          <input class="rec-add-input" id="rec-add-name" type="text" placeholder="Малосольная сима">

          <div class="rec-add-row-2">
            <div>
              <div class="rec-add-label">Коротко (необязательно)</div>
              <input class="rec-add-input" id="rec-add-sub" type="text" placeholder="8-12 ч без огня">
            </div>
            <div>
              <div class="rec-add-label">Время</div>
              <input class="rec-add-input" id="rec-add-time" type="text" placeholder="15 мин актив.">
            </div>
          </div>

          <div class="rec-add-label">Ингредиенты — по одному на строке, через тире количество (необязательно)</div>
          <textarea class="rec-add-textarea" id="rec-add-ing" placeholder="Филе — 800 г&#10;Соль крупная — 2 ст.л.&#10;Перец + укроп"></textarea>

          <div class="rec-add-label">Способ приготовления</div>
          <textarea class="rec-add-textarea" id="rec-add-method" placeholder="Не мыть — обсушить. Натереть смесью..."></textarea>

          <div class="rec-add-label">Подать с (необязательно)</div>
          <input class="rec-add-input" id="rec-add-serve" type="text" placeholder="Джин-тоник">
        </div>
        <div class="rec-add-actions">
          <button class="rec-add-save" id="rec-add-save">Добавить</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
    });

    overlay.querySelector('#rec-add-save').addEventListener('click', async e => {
      const name = overlay.querySelector('#rec-add-name').value.trim();
      if (!name) { overlay.querySelector('#rec-add-name').focus(); return; }

      const ingLines = overlay.querySelector('#rec-add-ing').value.split('\n').map(l => l.trim()).filter(Boolean);
      const ingredients = ingLines.map(line => {
        const parts = line.split(/\s+—\s+|\s+-\s+/);
        return parts.length > 1
          ? { name: parts[0].trim(), qty: parts.slice(1).join(' ').trim() }
          : { name: line, qty: '' };
      });

      const recipe = {
        category: overlay.querySelector('#rec-add-cat').value,
        name,
        sub: overlay.querySelector('#rec-add-sub').value.trim(),
        time: overlay.querySelector('#rec-add-time').value.trim(),
        ingredients,
        method: overlay.querySelector('#rec-add-method').value.trim(),
        serveWith: overlay.querySelector('#rec-add-serve').value.trim() || null,
      };

      await UIUtils.withBusyButton(e.currentTarget, async () => {
        await RecipesFirebase.addRecipe(recipe);
      });
      overlay.remove();
    });
  }

  function _bindCardEvents() {
    if (!_el) return;
    _el.querySelectorAll('.rec-card__head').forEach(head => {
      head.addEventListener('click', () => {
        const card = head.closest('.rec-card');
        const id = card.dataset.id;
        if (_openCards.has(id)) {
          _openCards.delete(id);
          card.classList.remove('open');
          card.querySelector('.rec-card__body')?.remove();
        } else {
          _openCards.add(id);
          card.classList.add('open');
          const r = RecipesData.getRecipeById(id) || RecipesState.getCustomRecipeById(id);
          if (r) card.insertAdjacentHTML('beforeend', _cardBody(r));
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

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
    if (!cat) return '';
    return cat.cocktails.map(r => _card(r)).join('');
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

    return `
      <div class="rec-card__body">
        ${ingredients}
        <div class="rec-method">${_esc(r.method)}</div>
        ${serveWith}
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
    _bindCardEvents();
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
          const r = RecipesData.getRecipeById(id);
          if (r) card.insertAdjacentHTML('beforeend', _cardBody(r));
          _bindBodyEvents(card);
        }
      });
    });
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
      RecipesState.pushComment(id, comment);
      RecipesFirebase.addComment(id, comment);
      input.value = '';
      _appendComment(card, comment);
    };
    sendBtn?.addEventListener('click', e => { e.stopPropagation(); _doSend(); });
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
    input?.addEventListener('click', e => e.stopPropagation());
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

  function refresh() {
    if (!_el) return;
    _el.querySelector('#rec-cards').innerHTML = _cards();
    _bindCardEvents();
  }

  return { render, refresh };
})();

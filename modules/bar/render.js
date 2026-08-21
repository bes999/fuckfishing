'use strict';

const BarRender = (() => {

  let _el = null;
  let _activeCat = 'gin';
  let _openCards = new Set();

  function render(el) {
    _el = el;
    if (!el) return;
    el.innerHTML = `
      <div class="bar-wrap">
        ${_topbar()}
        <div class="bar-tabs-label">Напитки на основе</div>
        ${_tabs()}
        <div class="bar-cards" id="bar-cards">
          ${_cards()}
        </div>
      </div>
    `;
    _bindEvents();
  }

  function _topbar() {
    return `
      <div class="bar-topbar">
        <button class="bar-back-btn" id="bar-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="bar-topbar__text">
          <div class="bar-topbar__title">Бар</div>
          <div class="bar-topbar__sub">Барная карта экспедиции</div>
        </div>
      </div>`;
  }

  function _tabs() {
    const cats = BarData.getCategories();
    const tabs = cats.map(c => `
      <button class="bar-tab ${c.id === _activeCat ? 'active' : ''}" data-cat="${c.id}">
        ${c.label}
      </button>`).join('');
    return `<div class="bar-tabs" role="tablist">${tabs}</div>`;
  }

  function _cards() {
    const cat = BarData.getCategories().find(c => c.id === _activeCat);
    if (!cat) return '';
    return cat.cocktails.map(c => _card(c)).join('');
  }

  function _card(c) {
    const avg = BarState.getAvgRating(c.id);
    const isOpen = _openCards.has(c.id);
    const diffLabel = BarData.getDiffLabel(c.diff);
    const diffCls   = BarData.getDiffClass(c.diff);

    return `
      <div class="bar-card ${isOpen ? 'open' : ''}" data-id="${c.id}">
        <div class="bar-card__head">
          <div class="bar-card__info">
            <div class="bar-card__name">${c.name}</div>
            <div class="bar-card__sub">${c.sub}</div>
          </div>
          <div class="bar-card__meta">
            <span class="bar-diff ${diffCls}">${diffLabel}</span>
            ${avg !== null
              ? `<span class="bar-rating-pill"><i class="ti ti-star" aria-hidden="true"></i>${avg}</span>`
              : `<span class="bar-rating-pill bar-rating-pill--empty"><i class="ti ti-star" aria-hidden="true"></i>—</span>`
            }
          </div>
          <div class="bar-card__chevron" aria-hidden="true">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </div>
        </div>

        ${isOpen ? _cardBody(c) : ''}
      </div>`;
  }

  function _cardBody(c) {
    const uid      = window.APP?.profile?.uid || 'anon';
    const name     = window.APP?.profile?.displayName || 'Я';
    const initials = name.charAt(0).toUpperCase();
    const userRating = BarState.getUserRating(c.id, uid);
    const comments   = BarState.getComments(c.id);

    const ingredients = c.ingredients.map(i => `
      <div class="bar-ing-row">
        <span class="bar-ing-name">${i.name}</span>
        <span class="bar-ing-qty">${i.qty}</span>
      </div>`).join('');

    const stars = [1,2,3,4,5].map(n => `
      <button class="bar-star ${n <= userRating ? 'on' : ''}" data-star="${n}" data-id="${c.id}" aria-label="${n} звёзд">
        <i class="ti ti-star" aria-hidden="true"></i>
      </button>`).join('');

    const commentsHtml = comments.length
      ? comments.map(cm => `
          <div class="bar-comment">
            <div class="bar-av">${(cm.author || '?').charAt(0).toUpperCase()}</div>
            <div class="bar-comment__body">
              <div class="bar-comment__text">${_escHtml(cm.text)}</div>
              <div class="bar-comment__author">${_escHtml(cm.author)} · ${cm.date || ''}</div>
            </div>
          </div>`).join('')
      : '';

    return `
      <div class="bar-card__body">
        <div class="bar-ing-label">Ингредиенты</div>
        <div class="bar-ingredients">${ingredients}</div>

        <div class="bar-method">${c.method}</div>

        <div class="bar-rate-row">
          <span class="bar-rate-label">Оценить:</span>
          <div class="bar-stars" role="group" aria-label="Оценка коктейля">${stars}</div>
        </div>

        ${commentsHtml ? `<div class="bar-comments">${commentsHtml}</div>` : ''}

        <div class="bar-add-comment">
          <div class="bar-av">${initials}</div>
          <input
            class="bar-comment-input"
            type="text"
            placeholder="Заметка о коктейле..."
            data-id="${c.id}"
            maxlength="200"
          >
          <button class="bar-send-btn" data-id="${c.id}" aria-label="Отправить">
            <i class="ti ti-send" aria-hidden="true"></i>
          </button>
        </div>
      </div>`;
  }

  function _escHtml(str) {
    return String(str)
      .replace(/&/g,'&amp;')
      .replace(/</g,'&lt;')
      .replace(/>/g,'&gt;')
      .replace(/"/g,'&quot;');
  }

  function _bindEvents() {
    if (!_el) return;

    // Табы
    _el.querySelectorAll('.bar-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCat = btn.dataset.cat;
        _openCards.clear();
        _el.querySelector('.bar-tabs .active')?.classList.remove('active');
        btn.classList.add('active');
        _el.querySelector('#bar-cards').innerHTML = _cards();
      });
    });

    // Назад
    _el.querySelector('#bar-back') && _el.querySelector('#bar-back').addEventListener('click', function() {
      if (typeof BarIndex !== 'undefined') BarIndex.close();
    });

    // Card toggle — event delegation on #bar-cards
    var cardsEl = _el.querySelector('#bar-cards');
    if (cardsEl) {
      cardsEl.addEventListener('click', function(e) {
        var head = e.target.closest('.bar-card__head');
        if (!head) return;
        var card = head.closest('.bar-card');
        if (!card) return;
        var id = card.dataset.id;
        if (_openCards.has(id)) {
          _openCards.delete(id);
          card.classList.remove('open');
          var body = card.querySelector('.bar-card__body');
          if (body) body.remove();
        } else {
          _openCards.add(id);
          card.classList.add('open');
          var c = BarData.getCocktailById(id);
          if (c) card.insertAdjacentHTML('beforeend', _cardBody(c));
          _bindBodyEvents(card);
        }
      });
    }
  }

  function _bindCardEvents() {
    // No-op — card toggling handled via event delegation in _bindEvents
  }

  function _bindBodyEvents(card) {
    const id = card.dataset.id;

    // Звёзды — оценка
    card.querySelectorAll('.bar-star').forEach(star => {
      star.addEventListener('click', e => {
        e.stopPropagation();
        const rating = parseInt(star.dataset.star);
        const uid    = window.APP?.profile?.uid || 'anon';
        BarState.setRating(id, uid, rating);
        BarFirebase.saveRating(id, uid, rating);
        // Перерисовать звёзды
        card.querySelectorAll('.bar-star').forEach(s => {
          s.classList.toggle('on', parseInt(s.dataset.star) <= rating);
        });
        // Обновить пилюлю с рейтингом
        _updateRatingPill(card, id);
      });
    });

    // Отправить комментарий
    const input  = card.querySelector('.bar-comment-input');
    const sendBtn = card.querySelector('.bar-send-btn');

    const _doSend = () => {
      const text = input?.value.trim();
      if (!text) return;
      const profile = window.APP?.profile;
      const comment = {
        text,
        author: profile?.displayName || 'Участник',
        uid:    profile?.uid || 'anon',
        date:   new Date().toLocaleDateString('ru', { day: 'numeric', month: 'short' })
      };
      UIUtils.withBusyButton(sendBtn, async () => {
        BarState.pushComment(id, comment);
        BarFirebase.addComment(id, comment);
        input.value = '';
        // Добавить комментарий в DOM без перерисовки
        _appendComment(card, comment);
      });
    };

    sendBtn?.addEventListener('click', e => { e.stopPropagation(); _doSend(); });
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
    input?.addEventListener('click', e => e.stopPropagation());
  }

  function _appendComment(card, comment) {
    let commentsEl = card.querySelector('.bar-comments');
    if (!commentsEl) {
      commentsEl = document.createElement('div');
      commentsEl.className = 'bar-comments';
      card.querySelector('.bar-rate-row')?.insertAdjacentElement('afterend', commentsEl);
    }
    const div = document.createElement('div');
    div.className = 'bar-comment';
    div.innerHTML = `
      <div class="bar-av">${comment.author.charAt(0).toUpperCase()}</div>
      <div class="bar-comment__body">
        <div class="bar-comment__text">${_escHtml(comment.text)}</div>
        <div class="bar-comment__author">${_escHtml(comment.author)} · ${comment.date}</div>
      </div>`;
    commentsEl.appendChild(div);
  }

  function _updateRatingPill(card, id) {
    const avg = BarState.getAvgRating(id);
    const pill = card.querySelector('.bar-rating-pill');
    if (pill) {
      pill.className = 'bar-rating-pill';
      pill.innerHTML = `<i class="ti ti-star" aria-hidden="true"></i>${avg !== null ? avg : '—'}`;
    }
  }

  // Вызывается из BarFirebase при обновлении данных
  function refresh() {
    if (!_el) return;
    _el.querySelector('#bar-cards').innerHTML = _cards();
    // Карточки, которые были раскрыты, регенерируются с новой разметкой
    // тела (рейтинг/комментарии), но без обработчиков — перепривязываем их.
    _openCards.forEach(id => {
      const card = _el.querySelector(`.bar-card[data-id="${id}"]`);
      if (card) _bindBodyEvents(card);
    });
  }

  return { render, refresh };
})();

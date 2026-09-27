'use strict';

const BarRender = (() => {

  let _el = null;
  let _activeCat = 'gin';

  // Коктейль открывается отдельным экраном (не раскрытием строки в
  // списке) — тот же паттерн, что и в Рецептах (modules/recipes/render.js).
  let _screen = 'list'; // 'list' | 'detail'
  let _detailId = null;

  function render(el) {
    _el = el;
    if (!el) return;
    el.innerHTML = _screen === 'detail' ? _renderDetailScreen() : _renderListScreen();
    _bindEvents();
  }

  function _renderListScreen() {
    return `
      <div class="bar-wrap">
        ${_topbar()}
        <div class="bar-tabs-label">Напитки на основе</div>
        ${_tabs()}
        <div class="bar-rows" id="bar-rows">${_rows()}</div>
      </div>`;
  }

  function _topbar() {
    return `
      <div class="bar-topbar">
        <button class="bar-back-btn" id="bar-back" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
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

  function _rows() {
    const cat = BarData.getCategories().find(c => c.id === _activeCat);
    if (!cat || !cat.cocktails.length) {
      return '<div class="bar-empty">Ничего в этом наборе</div>';
    }
    return `<div class="bar-list-card">${cat.cocktails.map(c => _row(c)).join('')}</div>`;
  }

  function _row(c) {
    const avg = BarState.getAvgRating(c.id);
    const diffLabel = BarData.getDiffLabel(c.diff);
    const diffCls   = BarData.getDiffClass(c.diff);
    return `
      <div class="bar-row" data-id="${c.id}">
        <div class="bar-row__info">
          <div class="bar-row__name">${c.name}</div>
          <div class="bar-row__sub">${c.sub}</div>
        </div>
        <div class="bar-row__meta">
          <span class="bar-diff ${diffCls}">${diffLabel}</span>
          ${avg !== null ? `<span class="bar-row__rating"><i class="ti ti-star" aria-hidden="true"></i>${avg}</span>` : ''}
        </div>
        <span class="bar-row__chevron" aria-hidden="true">${UIUtils.ico('chevron-right')}</span>
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
    if (_screen === 'detail') { _bindDetailEvents(); return; }

    _el.querySelectorAll('.bar-tab').forEach(btn => {
      btn.addEventListener('click', () => {
        _activeCat = btn.dataset.cat;
        _el.querySelector('.bar-tabs .active')?.classList.remove('active');
        btn.classList.add('active');
        const rowsEl = _el.querySelector('#bar-rows');
        if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
      });
    });

    _el.querySelector('#bar-back')?.addEventListener('click', () => {
      if (typeof BarIndex !== 'undefined') BarIndex.close();
    });

    _bindRowEvents();
  }

  function _bindRowEvents() {
    if (!_el) return;
    const rowsEl = _el.querySelector('#bar-rows');
    if (!rowsEl) return;
    rowsEl.querySelectorAll('.bar-row').forEach(row => {
      row.addEventListener('click', () => {
        _detailId = row.dataset.id;
        _screen = 'detail';
        render(_el);
      });
    });
  }

  /* ══════════════════════════════════════════════
     ЭКРАН КОКТЕЙЛЯ — отдельный, не раскрытие строки
  ══════════════════════════════════════════════ */
  function _renderDetailScreen() {
    const c = BarData.getCocktailById(_detailId);
    if (!c) { _screen = 'list'; return _renderListScreen(); }
    const diffLabel = BarData.getDiffLabel(c.diff);
    return `
      <div class="bar-wrap bar-detail">
        <div class="bar-det-topbar">
          <button class="bar-back-btn" id="bar-det-back" aria-label="К бару">${UIUtils.ico('chevron-left')}</button>
          <span class="bar-det-crumb">Бар</span>
        </div>
        <div class="bar-det-body">
          <div class="bar-det-head">
            <h1 class="bar-det-title">${c.name}</h1>
            <div class="bar-det-meta"><span>${c.sub}</span><span>·</span><span>${diffLabel}</span></div>
          </div>
          ${_detailIngredientsCard(c)}
          ${_detailMethodCard(c)}
          ${_detailRatingCard(c)}
          ${_detailNotesCard(c)}
        </div>
      </div>`;
  }

  function _detailIngredientsCard(c) {
    return `
      <section class="bar-det-card">
        <h2 class="bar-det-card__title">Ингредиенты</h2>
        <div class="bar-det-ing">
          ${c.ingredients.map(i => `
            <div class="bar-det-ing__row">
              <span class="bar-det-ing__name">${i.name}</span>
              <span class="bar-det-ing__qty">${i.qty}</span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  // Только для отображения — режет метод на "предложения" по .!? — данные
  // (c.method) не трогаем, это чисто разметка шагов (тот же приём, что и
  // в Рецептах — modules/recipes/render.js:_splitSentences).
  function _splitSentences(text) {
    const s = String(text || '').trim();
    if (!s) return [];
    // Шаг — предложение: режем только на «. / ! / ?» + пробел + заглавная
    // буква, иначе «2 ст. л.» и «3-3.5 мин» разваливались на обрывки.
    return s.split(/(?<=[.!?])\s+(?=[А-ЯЁA-Z«"(])/).map(p => p.trim()).filter(Boolean);
  }

  function _detailMethodCard(c) {
    const steps = _splitSentences(c.method);
    if (!steps.length) return '';
    return `
      <section class="bar-det-card">
        <h2 class="bar-det-card__title">Как делать</h2>
        <div class="bar-det-steps">
          ${steps.map((t, i) => `
            <div class="bar-det-step">
              <span class="bar-det-step__n">${i + 1}</span>
              <span class="bar-det-step__txt">${t}</span>
            </div>`).join('')}
        </div>
      </section>`;
  }

  function _detailRatingCard(c) {
    const uid = window.APP?.profile?.uid || 'anon';
    const userRating = BarState.getUserRating(c.id, uid);
    const avg = BarState.getAvgRating(c.id);
    const stars = [1,2,3,4,5].map(n => `
      <button class="bar-star ${n <= userRating ? 'on' : ''}" data-star="${n}" data-id="${c.id}" aria-label="${n} звёзд">
        <i class="ti ti-star" aria-hidden="true"></i>
      </button>`).join('');
    return `
      <section class="bar-det-card">
        <h2 class="bar-det-card__title">Твоя оценка</h2>
        <div class="bar-det-stars">${stars}</div>
        <span class="bar-det-hint" id="bar-det-rating-hint">${avg !== null ? `Средняя оценка: ${avg}` : 'Пока никто не оценил'}</span>
      </section>`;
  }

  function _detailNotesCard(c) {
    const name     = window.APP?.profile?.displayName || 'Я';
    const initials = name.charAt(0).toUpperCase();
    const comments = BarState.getComments(c.id);
    const commentsHtml = comments.map(cm => `
      <div class="bar-comment">
        <div class="bar-av">${(cm.author || '?').charAt(0).toUpperCase()}</div>
        <div class="bar-comment__body">
          <div class="bar-comment__text">${_escHtml(cm.text)}</div>
          <div class="bar-comment__author">${_escHtml(cm.author)} · ${cm.date || ''}</div>
        </div>
      </div>`).join('');
    return `
      <section class="bar-det-card">
        <h2 class="bar-det-card__title">Заметки</h2>
        <div class="bar-comments" id="bar-det-comments">${commentsHtml}</div>
        <div class="bar-add-comment">
          <div class="bar-av">${initials}</div>
          <input class="bar-comment-input" type="text" placeholder="Заметка о коктейле…" data-id="${c.id}" maxlength="200">
          <button class="bar-send-btn" data-id="${c.id}" aria-label="Отправить">
            <i class="ti ti-send" aria-hidden="true"></i>
          </button>
        </div>
      </section>`;
  }

  function _bindDetailEvents() {
    if (!_el) return;
    const c = BarData.getCocktailById(_detailId);
    if (!c) return;
    const id = c.id;

    _el.querySelector('#bar-det-back')?.addEventListener('click', () => {
      _screen = 'list';
      render(_el);
    });

    _el.querySelectorAll('.bar-star').forEach(star => {
      star.addEventListener('click', () => {
        const rating = parseInt(star.dataset.star);
        const uid    = window.APP?.profile?.uid || 'anon';
        BarState.setRating(id, uid, rating);
        BarFirebase.saveRating(id, uid, rating);
        _el.querySelectorAll('.bar-star').forEach(s => {
          s.classList.toggle('on', parseInt(s.dataset.star) <= rating);
        });
        const avg = BarState.getAvgRating(id);
        const hint = _el.querySelector('#bar-det-rating-hint');
        if (hint) hint.textContent = avg !== null ? `Средняя оценка: ${avg}` : 'Пока никто не оценил';
      });
    });

    const input   = _el.querySelector('.bar-comment-input');
    const sendBtn = _el.querySelector('.bar-send-btn');
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
        _appendComment(comment);
      });
    };
    sendBtn?.addEventListener('click', _doSend);
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') _doSend(); });
  }

  function _appendComment(comment) {
    const commentsEl = _el.querySelector('#bar-det-comments');
    if (!commentsEl) return;
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

  // Вызывается из BarFirebase при обновлении данных — включая эхо СВОЕЙ же
  // записи (рейтинг/комментарий), не только чужой правки. На экране
  // коктейля сохраняем фокус/значение/позицию курсора поля заметки вокруг
  // перерисовки, если человек как раз печатает её в этот момент.
  function refresh() {
    if (!_el) return;

    if (_screen === 'detail') {
      const active = document.activeElement;
      let pending = null;
      if (active && active.classList && active.classList.contains('bar-comment-input')) {
        pending = { value: active.value, start: active.selectionStart, end: active.selectionEnd };
      }
      _el.innerHTML = _renderDetailScreen();
      _bindEvents();
      if (pending) {
        const input = _el.querySelector('.bar-comment-input');
        if (input) {
          input.value = pending.value;
          input.focus();
          try { input.setSelectionRange(pending.start, pending.end); } catch (e) {}
        }
      }
      return;
    }

    const rowsEl = _el.querySelector('#bar-rows');
    if (rowsEl) { rowsEl.innerHTML = _rows(); _bindRowEvents(); }
  }

  return { render, refresh };
})();

'use strict';

/* =========================================================
   UIUtils — маленькие переиспользуемые UI-хелперы.

   withBusyButton(btn, fn) — блокирует кнопку на время async-операции
   (запись в Firestore и т.п.), чтобы повторный/двойной тап не отправил
   действие ещё раз. Возвращает то же, что вернул fn(). Ошибка из fn()
   пробрасывается дальше — кнопка в любом случае разблокируется.

     btn.addEventListener('click', () => {
       UIUtils.withBusyButton(btn, async () => {
         await Firebase.save(...);
       });
     });

   confirmSheet(message, opts) — замена нативному confirm(): всплывающий
   лист в стиле приложения вместо системного диалога браузера.
   Возвращает Promise<boolean>.

     const ok = await UIUtils.confirmSheet('Удалить участника?');
     if (!ok) return;
   ========================================================= */
const UIUtils = (() => {

  async function withBusyButton(btn, fn) {
    if (!btn || btn.disabled) return;
    const prevDisabled = btn.disabled;
    btn.disabled = true;
    btn.classList.add('is-busy');
    try {
      return await fn();
    } finally {
      btn.disabled = prevDisabled;
      btn.classList.remove('is-busy');
    }
  }

  function confirmSheet(message, opts = {}) {
    const title    = opts.title    || 'Подтверди действие';
    const okLabel   = opts.okLabel   || 'Удалить';
    const cancelLabel = opts.cancelLabel || 'Отмена';
    const danger   = opts.danger !== false; // по умолчанию — красная (деструктивное действие)

    return new Promise(resolve => {
      document.getElementById('confirm-sheet-overlay')?.remove();

      const overlay = document.createElement('div');
      overlay.className = 'cs-overlay';
      overlay.id = 'confirm-sheet-overlay';
      overlay.innerHTML = `
        <div class="cs-card">
          <div class="cs-title">${_esc(title)}</div>
          <div class="cs-msg">${_esc(message)}</div>
          <div class="cs-actions">
            <button class="cs-btn cs-btn-cancel" data-cs="cancel">${_esc(cancelLabel)}</button>
            <button class="cs-btn ${danger ? 'cs-btn-danger' : 'cs-btn-primary'}" data-cs="ok">${_esc(okLabel)}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));

      function close(result) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }

      overlay.addEventListener('click', e => {
        if (e.target === overlay) { close(false); return; }
        const action = e.target.closest('[data-cs]')?.dataset.cs;
        if (action === 'ok') close(true);
        else if (action === 'cancel') close(false);
      });
    });
  }

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;');
  }

  // avatarHtml(avatar, fallback) — аватар бывает либо emoji-строкой (как
  // раньше), либо ссылкой на загруженное фото (Firebase Storage download
  // URL, начинается с http). Разница видна только тут — во всех местах,
  // где рисуется аватар (шапка, карточка участника, профиль, форма
  // редактирования), контейнер уже circle + overflow:hidden в CSS, просто
  // подставляем <img> вместо текста-эмодзи.
  // Аватар: загруженное фото — картинкой; иначе инициалы (эмодзи-аватары
  // решили не показывать — эмодзи остаются только у видов улова). Если
  // вызывающий передал не буквы, а старый эмодзи-фолбэк — как раньше.
  function avatarHtml(avatar, fallback) {
    if (avatar && /^https?:\/\//.test(avatar)) {
      return `<img src="${_esc(avatar)}" alt="">`;
    }
    if (fallback && /^[\p{L}]{1,3}$/u.test(fallback)) {
      return `<span class="av-initials">${_esc(fallback)}</span>`;
    }
    return emojiIcon(avatar || fallback || '');
  }

  // «Dmitry» + ник «Bes» → «DB»; «Viktor Bubnov» → «VB»; «V» → «V».
  function initials(name, nickname) {
    const words = String(name || '').trim().split(/\s+/).filter(Boolean);
    let s = words.slice(0, 2).map(w => w[0]).join('');
    if (s.length < 2 && nickname) s += String(nickname).trim()[0] || '';
    return (s || '?').toUpperCase();
  }

  // ── Иконки вместо эмодзи ────────────────────────────────────────────
  // ico(name) — иконка Tabler (шрифт shared/fonts, классы .ti-* в
  // shared/tabler-icons.css). 'fishing' — своя рыбка (в Tabler нет той,
  // что выбрали для рыбалок), рисуется inline-SVG тем же штрихом.
  const _FISH_SVG = '<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true">'
    + '<path d="M1.5 12c3.2 4.6 7 6.3 10.8 5.8 3.8-.5 7-4.2 9.7-11.3"/>'
    + '<path d="M1.5 12c3.2-4.6 7-6.3 10.8-5.8 2.9.4 5.2 2.3 7.1 5.1"/>'
    + '<path d="M20.4 14l1.6 3.5"/></svg>';

  // Иконки, которых нет в урезанном шрифте Tabler (shared/fonts) — тем же
  // штрихом inline-SVG, пути из Tabler Icons (MIT). Без этого <i> рисовался
  // пустым (так пропала кнопка печати в шапке Гида).
  const _SVG = d => '<svg class="ico-svg" viewBox="0 0 24 24" aria-hidden="true">' + d + '</svg>';
  const _EXTRA = {
    'printer': _SVG('<path d="M17 17h2a2 2 0 0 0 2-2v-4a2 2 0 0 0-2-2H5a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h2"/><path d="M17 9V5a2 2 0 0 0-2-2H9a2 2 0 0 0-2 2v4"/><path d="M7 15a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2H9a2 2 0 0 1-2-2z"/>'),
    'search': _SVG('<path d="M3 10a7 7 0 1 0 14 0 7 7 0 1 0-14 0"/><path d="M21 21l-6-6"/>'),
    'external-link': _SVG('<path d="M12 6H6a2 2 0 0 0-2 2v10a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6"/><path d="M11 13l9-9"/><path d="M15 4h5v5"/>'),
    'help-circle': _SVG('<path d="M3 12a9 9 0 1 0 18 0 9 9 0 1 0-18 0"/><path d="M12 16v.01"/><path d="M12 13a2 2 0 0 0 .914-3.782 1.98 1.98 0 0 0-2.414.483"/>'),
    'adjustments-horizontal': _SVG('<path d="M12 6a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M4 6h8"/><path d="M16 6h4"/><path d="M6 12a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M4 12h2"/><path d="M10 12h10"/><path d="M15 18a2 2 0 1 0 4 0 2 2 0 1 0-4 0"/><path d="M4 18h11"/><path d="M19 18h1"/>'),
  };

  function ico(name, cls) {
    const c = cls ? ' ' + cls : '';
    if (name === 'fishing') return `<span class="ico${c}" aria-hidden="true">${_FISH_SVG}</span>`;
    if (_EXTRA[name]) return `<span class="ico${c}" aria-hidden="true">${_EXTRA[name]}</span>`;
    return `<i class="ti ti-${name}${c}" aria-hidden="true"></i>`;
  }

  // Эмодзи, которые хранятся в ДАННЫХ (аватары профиля, иконки категорий
  // и мест хранения аптечки, регионы Атласа) — сами данные не трогаем,
  // подменяем только при показе. Ключи без U+FE0F (см. emojiIcon).
  // Виды улова (modules/catches) сюда намеренно не входят — их решили
  // оставить эмодзи: в Tabler нет щуки/гребешка, всё стало бы одной рыбкой.
  const EMOJI_ICON = {
    // тип поездки / рыбалка / места
    '🎣': 'fishing', '🐟': 'fishing', '🏔': 'mountain', '🎯': 'target', '🌲': 'trees',
    '🌊': 'ripple', '🏕': 'tent', '⛺': 'tent', '📍': 'map-pin',
    // аватары
    '🤙': 'hand-rock', '🦈': 'fish-bone', '😎': 'sunglasses', '🧔': 'user', '🦅': 'feather',
    '🐻': 'paw', '🍺': 'beer', '🥃': 'glass-full', '👾': 'alien', '🐠': 'fish-hook',
    '🦑': 'scuba-mask', '🐙': 'anchor', '🎿': 'snowboarding', '🚤': 'speedboat',
    // аптечка: категории и места хранения
    '💊': 'pill', '🤧': 'virus', '🫃': 'soup', '🌿': 'leaf', '🩹': 'bandage', '👁': 'eye',
    '😴': 'zzz', '💉': 'vaccine', '📦': 'package', '🔴': 'first-aid-kit', '🚗': 'car',
    '🎒': 'backpack', '💧': 'droplet', '🧥': 'shirt',
    // аптечка: экстренные ситуации
    '🩸': 'droplet', '⚠': 'alert-triangle', '🦴': 'bone', '🚨': 'urgent', '🔩': 'bone',
    '🦵': 'walk', '🤕': 'helmet', '🏥': 'building-hospital', '🔥': 'flame', '☣': 'biohazard',
    '🫐': 'circle-dot', '🥶': 'temperature-minus', '🧊': 'snowflake', '🌡': 'temperature-plus',
    '☀': 'sun', '⚡': 'bolt', '🐍': 'bug', '🕷': 'spider', '🐝': 'bug', '🦊': 'paw', '🐭': 'paw',
    '🐕': 'dog', '🤢': 'mood-sick', '🍄': 'mushroom', '🍶': 'bottle', '💨': 'wind',
    '🫗': 'droplets', '😵': 'mood-empty', '❤': 'heart', '🧠': 'brain', '🫀': 'heartbeat',
    '👃': 'droplet', '🫁': 'lungs', '🧭': 'compass', '😰': 'mood-nervous', '🍬': 'candy',
  };

  function emojiIcon(emoji, cls) {
    const key = String(emoji || '').trim().replace(/️/g, '');
    const name = EMOJI_ICON[key];
    return name ? ico(name, cls) : _esc(emoji || '');
  }

  // splitNames(raw) — разбирает вставленный/вписанный текст со списком
  // имён (гости без аккаунта, участники поездки) на отдельные имена: по
  // запятой и по переносу строки, обрезая пробелы и выкидывая пустые.
  // Один разбор вместо copy-paste по modules/tripcover и modules/trips.
  function splitNames(raw) {
    return String(raw || '').split(/[,\n]/).map(s => s.trim()).filter(Boolean);
  }

  // ── Свайп влево — «Удалить» (как в iOS) ─────────────────────────────
  // Раньше у строк списков (закупка, готовность) был крестик прямо рядом
  // с чекбоксом — удалить можно было случайным касанием. Теперь кнопка
  // удаления спрятана под строкой и выезжает свайпом влево; сама кнопка —
  // тот же элемент, что был крестиком (с его data-action), поэтому
  // удаление идёт через уже существующие обработчики модулей.
  // container — постоянный родитель (строки внутри перерисовываются);
  // rowSel — селектор строки; delSel — селектор кнопки удаления в ней.
  function swipeToDelete(container, rowSel, delSel) {
    if (!container || container.dataset.swipeBound) return;
    container.dataset.swipeBound = '1';
    let row = null, x0 = 0, y0 = 0, moved = false;
    const closeAll = except => container.querySelectorAll(rowSel + '.swiped')
      .forEach(r => { if (r !== except) r.classList.remove('swiped'); });

    container.addEventListener('pointerdown', e => {
      const r = e.target.closest(rowSel);
      if (!r || !r.querySelector(delSel)) { row = null; closeAll(null); return; }
      row = r; x0 = e.clientX; y0 = e.clientY; moved = false;
    });
    container.addEventListener('pointermove', e => {
      if (!row) return;
      const dx = e.clientX - x0, dy = e.clientY - y0;
      if (Math.abs(dx) < 12 || Math.abs(dx) < Math.abs(dy)) return;
      moved = true;
      if (dx < -40) { closeAll(row); row.classList.add('swiped'); }
      else if (dx > 30) row.classList.remove('swiped');
    });
    container.addEventListener('pointerup', () => { row = null; });
    container.addEventListener('pointercancel', () => { row = null; });
    // Свайп не должен засчитываться как тап по чекбоксу; тап по открытой
    // строке (мимо «Удалить») — просто закрывает её.
    container.addEventListener('click', e => {
      if (moved) { moved = false; e.stopPropagation(); e.preventDefault(); return; }
      const open = e.target.closest(rowSel + '.swiped');
      if (open && !e.target.closest(delSel)) {
        open.classList.remove('swiped'); e.stopPropagation(); e.preventDefault();
      }
    }, true);
  }

  // ── Места поездки: лист «название + регион» и проверка на дубли ──────
  // Общие для мастера поездки (modules/trips) и вкладки «Места»
  // (modules/rivers). placeSheet → Promise<{name, region} | null>.
  function _placeNorm(s) {
    return String(s || '').trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
  }
  // Дубль — то же название и тот же регион (или регион не указан у одного
  // из двух): «Обь / ХМАО» и «Обь» — одно место, «Обь / ХМАО» и
  // «Обь / Новосибирская» — разные. exceptId — само редактируемое место.
  function findDuplicatePlace(list, name, region, exceptId) {
    const n = _placeNorm(name), r = _placeNorm(region);
    return (list || []).find(p => {
      if (exceptId && p.id === exceptId) return false;
      if (_placeNorm(p.name) !== n) return false;
      const pr = _placeNorm(p.region || p.type);
      return !r || !pr || pr === r;
    }) || null;
  }
  function placeSheet(opts = {}) {
    return new Promise(resolve => {
      document.getElementById('place-sheet-overlay')?.remove();
      const overlay = document.createElement('div');
      overlay.className = 'cs-overlay';
      overlay.id = 'place-sheet-overlay';
      overlay.innerHTML = `
        <div class="cs-card place-card">
          <div class="cs-title">${_esc(opts.title || 'Место')}</div>
          <input class="place-input" data-f="name" type="text" placeholder="Река или место — «Обь»" autocomplete="off" value="${_esc(opts.name || '')}">
          <input class="place-input" data-f="region" type="text" placeholder="Регион — необязательно" autocomplete="off" value="${_esc(opts.region || '')}">
          <div class="place-err" hidden></div>
          <div class="cs-actions">
            <button class="cs-btn cs-btn-cancel" data-cs="cancel">Отмена</button>
            <button class="cs-btn cs-btn-primary" data-cs="ok">${_esc(opts.okLabel || 'Сохранить')}</button>
          </div>
        </div>`;
      document.body.appendChild(overlay);
      requestAnimationFrame(() => overlay.classList.add('open'));
      const nameInp = overlay.querySelector('[data-f="name"]');
      const regInp = overlay.querySelector('[data-f="region"]');
      const err = overlay.querySelector('.place-err');
      setTimeout(() => nameInp.focus(), 50);
      function close(result) {
        overlay.classList.remove('open');
        setTimeout(() => overlay.remove(), 200);
        resolve(result);
      }
      function submit() {
        const name = nameInp.value.trim(), region = regInp.value.trim();
        if (!name) { nameInp.focus(); return; }
        const dup = opts.list ? findDuplicatePlace(opts.list, name, region, opts.exceptId) : null;
        if (dup) {
          err.textContent = `«${dup.name}${(dup.region || dup.type) ? ', ' + (dup.region || dup.type) : ''}» уже есть в поездке`;
          err.hidden = false; nameInp.focus(); return;
        }
        close({ name, region });
      }
      overlay.addEventListener('click', e => {
        if (e.target === overlay) { close(null); return; }
        const a = e.target.closest('[data-cs]')?.dataset.cs;
        if (a === 'ok') submit(); else if (a === 'cancel') close(null);
      });
      overlay.addEventListener('keydown', e => { if (e.key === 'Enter') submit(); });
      overlay.addEventListener('input', () => { err.hidden = true; });
    });
  }

  return {
    initials, withBusyButton, confirmSheet, placeSheet, findDuplicatePlace, avatarHtml, splitNames, ico, emojiIcon, swipeToDelete };
})();

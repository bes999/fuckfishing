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
  function avatarHtml(avatar, fallback) {
    if (avatar && /^https?:\/\//.test(avatar)) {
      return `<img src="${_esc(avatar)}" alt="">`;
    }
    return _esc(avatar || fallback || '');
  }

  return { withBusyButton, confirmSheet, avatarHtml };
})();

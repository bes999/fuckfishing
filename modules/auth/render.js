'use strict';
/* globals AuthActions */

const AuthRender = (() => {

  /* ══════════════════════════════════════════════
     LOGIN SCREEN
  ══════════════════════════════════════════════ */
  function showLoginScreen() {
    document.getElementById('auth-screen')?.remove();
    const el = document.createElement('div');
    el.className = 'auth-screen';
    el.id = 'auth-screen';
    el.innerHTML = `
        <div class="auth-card">
          <div class="auth-logo">🎣</div>
          <h1 class="auth-title">FuckFishing</h1>
          <p class="auth-sub">Войди, чтобы начать</p>

          <button class="btn-google" data-action="auth-google">
            ${_googleSvg()}
            Войти через Google
          </button>

          <div class="auth-divider"><span>или по email</span></div>

          <input class="auth-input" id="auth-email" type="email"
                 placeholder="Email" autocomplete="email" inputmode="email">
          <input class="auth-input" id="auth-password" type="password"
                 placeholder="Пароль (мин. 6 символов)" autocomplete="current-password">
          <button class="btn-auth-primary" data-action="auth-email">
            Войти
          </button>
          <button class="btn-auth-link" data-action="auth-register">
            Нет аккаунта? Зарегистрироваться
          </button>

          <div class="auth-error hidden" id="auth-error"></div>
        </div>`;
    // Оверлей поверх #app — не трогаем содержимое страниц под ним,
    // иначе после логина контейнеры p-home/p-trips/... пропадают навсегда.
    document.body.appendChild(el);
  }

  function hideLoginScreen() {
    document.getElementById('auth-screen')?.remove();
  }

  function showError(msg) {
    const el = document.getElementById('auth-error');
    if (!el) return;
    el.textContent = _humanizeError(msg);
    el.classList.remove('hidden');
  }

  function clearError() {
    document.getElementById('auth-error')?.classList.add('hidden');
  }

  /* ══════════════════════════════════════════════
     ONBOARDING
  ══════════════════════════════════════════════ */
  const AVATARS = ['🎣','🤙','🐟','🦈','😎','🧔','🏕️','🌊','🦅','🐻','🍺','🥃','👾','🎯','🐠','🦑','🐙','🏔️','🎿','🚤'];
  const BLOOD_TYPES = [
    {id:'A+', ru:'II +' }, {id:'A−', ru:'II −' },
    {id:'B+', ru:'III +'}, {id:'B−', ru:'III −'},
    {id:'AB+',ru:'IV +'}, {id:'AB−',ru:'IV −'},
    {id:'O+', ru:'I +' }, {id:'O−', ru:'I −' },
  ];

  let _step = 0;
  let _draft = {};

  function showOnboarding(user) {
    _step = 0;
    _draft = {
      displayName: user.displayName || '',
      avatar:      '🎣',
      birthday:    '',
      phone:       '',
      bloodType:   '',
      height:      '',
      weight:      '',
      allergies:   '',
      conditions:  ''
    };
    // Скрываем login-screen если ещё виден
    document.getElementById('auth-screen')?.remove();
    _render();
  }

  function _render() {
    document.getElementById('ob-overlay')?.remove();
    const el = document.createElement('div');
    el.id = 'ob-overlay';
    el.className = 'ob-overlay';
    el.innerHTML = `
      <div class="ob-sheet">
        <div class="ob-grab"></div>
        <div class="ob-scroll">
          ${_step === 0 ? _step0() : _step1()}
        </div>
      </div>`;
    document.body.appendChild(el);
    if (_step === 0) _bindPhoneMask();
  }

  /* ── Шаг 1: Личные данные ── */
  // "← Выйти" — на случай, если сюда попали по ошибке (опечатка в email на
  // экране входа тихо заводит новый аккаунт вместо ошибки "нет такого
  // пользователя", см. signInEmail в modules/auth/index.js) — без него
  // единственный путь наружу был через devtools (auth.signOut() вручную).
  function _step0() {
    const avBtns = AVATARS.map(a =>
      `<button class="ob-av-btn${_draft.avatar===a?' sel':''}" data-ob-av="${a}">${a}</button>`
    ).join('');
    return `
      <button class="ob-exit" data-action="auth-signout">← Выйти</button>
      <p class="ob-title">Как тебя зовут?</p>
      <p class="ob-sub">Шаг 1 из 2 — личные данные</p>

      <input class="auth-input" id="ob-name" type="text"
             placeholder="Имя или никнейм"
             value="${_esc(_draft.displayName)}" autocomplete="name">

      <p class="ob-lbl">Аватар</p>
      <div class="ob-avatar-grid">${avBtns}</div>

      <div class="ob-row2">
        <input class="auth-input" id="ob-birthday" type="text"
               placeholder="ДД.ММ.ГГГГ" inputmode="numeric"
               value="${_esc(_draft.birthday)}" style="margin-bottom:0">
        <input class="auth-input" id="ob-phone" type="tel"
               placeholder="+7 (___) ___-__-__"
               value="${_esc(_draft.phone)}" style="margin-bottom:0">
      </div>

      <div class="ob-nav">
        <button class="ob-btn-next" data-action="ob-next">Далее →</button>
      </div>`;
  }

  /* ── Шаг 2: Медданные ── */
  function _step1() {
    const bloodBtns = BLOOD_TYPES.map(b =>
      `<button class="ob-blood-btn${_draft.bloodType===b.id?' sel':''}" data-ob-blood="${b.id}">
        <span class="ob-blood-intl">${b.id}</span>
        <span class="ob-blood-ru">${b.ru}</span>
       </button>`
    ).join('');
    return `
      <p class="ob-title">Медданные</p>
      <p class="ob-sub">Шаг 2 из 2 — важно для безопасности</p>

      <p class="ob-lbl">Группа крови</p>
      <div class="ob-blood-grid">${bloodBtns}</div>

      <p class="ob-lbl">Рост и вес</p>
      <div class="ob-row2">
        <input class="auth-input" id="ob-height" type="text"
               placeholder="Рост, см" inputmode="numeric"
               value="${_esc(_draft.height)}" style="margin-bottom:0">
        <input class="auth-input" id="ob-weight" type="text"
               placeholder="Вес, кг" inputmode="numeric"
               value="${_esc(_draft.weight)}" style="margin-bottom:0">
      </div>

      <p class="ob-lbl" style="margin-top:14px">Аллергии</p>
      <input class="auth-input" id="ob-allergies" type="text"
             placeholder="Пенициллин, йод... или оставь пустым"
             value="${_esc(_draft.allergies)}">

      <p class="ob-lbl">Хронические заболевания</p>
      <input class="auth-input" id="ob-conditions" type="text"
             placeholder="Необязательно"
             value="${_esc(_draft.conditions)}">

      <div class="ob-nav">
        <button class="ob-btn-back" data-action="ob-back">←</button>
        <button class="ob-btn-next" data-action="ob-finish">Готово ✓</button>
      </div>`;
  }

  /* ── Phone + Birthday masks ── */
  function _bindPhoneMask() {
    // Телефон
    const phone = document.getElementById('ob-phone');
    if (phone) {
      if (!phone.value) phone.value = '+7 (';
      phone.addEventListener('focus', () => {
        if (!phone.value || phone.value === '+7') phone.value = '+7 (';
        setTimeout(() => phone.setSelectionRange(phone.value.length, phone.value.length), 0);
      });
      phone.addEventListener('input', () => {
        let d = phone.value.replace(/\D/g,'');
        if (d.startsWith('7') || d.startsWith('8')) d = d.slice(1);
        d = d.slice(0,10);
        let out = '+7';
        if (d.length > 0) out += ' (' + d.slice(0,3);
        if (d.length >= 3) out += ') ';
        if (d.length > 3)  out += d.slice(3,6);
        if (d.length >= 6) out += '-' + d.slice(6,8);
        if (d.length >= 8) out += '-' + d.slice(8,10);
        phone.value = out;
      });
      phone.addEventListener('keydown', e => {
        if (e.key === 'Backspace' && phone.value.length <= 4) e.preventDefault();
      });
    }

    // Дата рождения ДД.ММ.ГГГГ
    const bday = document.getElementById('ob-birthday');
    if (bday) {
      bday.addEventListener('input', () => {
        let d = bday.value.replace(/\D/g,'').slice(0,8);
        let out = d;
        if (d.length > 4) out = d.slice(0,2) + '.' + d.slice(2,4) + '.' + d.slice(4);
        else if (d.length > 2) out = d.slice(0,2) + '.' + d.slice(2);
        bday.value = out;
      });
    }
  }

  /* ── Event handler ── */
  function handleObEvent(target) {
    // Аватар
    if (target.dataset.obAv) {
      _draft.avatar = target.dataset.obAv;
      document.querySelectorAll('.ob-av-btn').forEach(b => b.classList.remove('sel'));
      target.classList.add('sel');
      return;
    }
    // Группа крови
    if (target.dataset.obBlood) {
      _draft.bloodType = target.dataset.obBlood;
      document.querySelectorAll('.ob-blood-btn').forEach(b => b.classList.remove('sel'));
      target.classList.add('sel');
      return;
    }

    const action = target.dataset.action;

    if (action === 'ob-next') {
      const nameEl = document.getElementById('ob-name');
      _draft.displayName = (nameEl?.value || '').trim();
      _draft.birthday = (document.getElementById('ob-birthday')?.value || '').trim();
      const ph = (document.getElementById('ob-phone')?.value || '').trim();
      _draft.phone = (ph === '+7 (' || ph === '+7') ? '' : ph;

      if (!_draft.displayName) {
        nameEl?.classList.add('field-error');
        nameEl?.addEventListener('input', () => nameEl.classList.remove('field-error'), {once:true});
        return;
      }
      _step = 1;
      _render();
    }

    if (action === 'ob-back') { _step = 0; _render(); }

    if (action === 'ob-finish') {
      _draft.height     = (document.getElementById('ob-height')?.value || '').trim();
      _draft.weight     = (document.getElementById('ob-weight')?.value || '').trim();
      _draft.allergies  = (document.getElementById('ob-allergies')?.value || '').trim();
      _draft.conditions = (document.getElementById('ob-conditions')?.value || '').trim();
      document.getElementById('ob-overlay')?.remove();
      AuthActions.completeOnboarding(_draft);
    }
  }

  /* ── Helpers ── */
  function _googleSvg() {
    return `<svg width="16" height="16" viewBox="0 0 18 18" xmlns="http://www.w3.org/2000/svg">
      <path fill="#4285F4" d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.87 2.68-6.62z"/>
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26C11.16 14.23 10.14 14.5 9 14.5c-2.38 0-4.4-1.61-5.12-3.77H.96v2.33A9 9 0 0 0 9 18z"/>
      <path fill="#FBBC05" d="M3.88 10.73A5.41 5.41 0 0 1 3.6 9c0-.6.1-1.18.28-1.73V4.94H.96A9.01 9.01 0 0 0 0 9c0 1.45.35 2.82.96 4.06l2.92-2.33z"/>
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.51.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.94l2.92 2.33C4.6 5.19 6.62 3.58 9 3.58z"/>
    </svg>`;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function _humanizeError(msg) {
    if (!msg) return 'Ошибка входа';
    if (msg.includes('wrong-password')||msg.includes('invalid-credential')) return '❌ Неверный email или пароль';
    if (msg.includes('user-not-found'))  return '❌ Пользователь не найден';
    if (msg.includes('email-already'))   return '❌ Email уже используется';
    if (msg.includes('weak-password'))   return '❌ Пароль слишком слабый (мин. 6 символов)';
    if (msg.includes('popup-closed'))    return '❌ Окно входа закрыто';
    if (msg.includes('network-request')) return '❌ Нет интернета';
    return '❌ ' + msg.split('/').pop().replace(/-/g,' ');
  }

  return { showLoginScreen, hideLoginScreen, showError, clearError, showOnboarding, handleObEvent };
})();

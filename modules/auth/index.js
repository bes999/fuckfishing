'use strict';
/* globals firebase, auth, db, AuthRender, MembersModule */

const AuthActions = (() => {
  let _user    = null;
  let _profile = null;

  /* ── Init ── */
  function init() {
    _bindEvents();
    auth.onAuthStateChanged(_onAuthChange);
  }

  async function _onAuthChange(user) {
    if (!user) {
      _user = null; _profile = null;
      AuthRender.showLoginScreen();
      return;
    }
    _user = user;
    try {
      const snap = await db.collection('members').doc(user.uid).get();
      if (!snap.exists) {
        document.getElementById('auth-screen')?.style.setProperty('display','none');
        AuthRender.showOnboarding(user);
      } else {
        _profile = snap.data();
        _boot();
      }
    } catch (_) {
      // Оффлайн — пробуем кеш
      try {
        const snap = await db.collection('members').doc(user.uid).get({source:'cache'});
        if (snap.exists) { _profile = snap.data(); _boot(); }
        else AuthRender.showOnboarding(user);
      } catch (__) {
        AuthRender.showOnboarding(user);
      }
    }
  }

  /* ── Завершение онбординга ── */
  async function completeOnboarding(draft) {
    if (!_user) return;

    // "Я первый?" — не через members.limit(1) (её read и так требует
    // isMember()/isInvited(), которых у самого первого человека в пустой
    // базе быть не может), а через отдельный публично читаемый маркер
    // system/bootstrap (см. firestore.rules). Первый онбординг — сразу
    // организатор и ставит этот маркер, все следующие требуют приглашения.
    let isFirstEver = false;
    try {
      const bootDoc = await db.collection('system').doc('bootstrap').get();
      isFirstEver = !bootDoc.exists;
    } catch (_) {}
    const role = isFirstEver ? 'organizer' : 'member';

    _profile = {
      uid:         _user.uid,
      email:       _user.email || '',
      displayName: draft.displayName,
      avatar:      draft.avatar,
      birthday:    draft.birthday  || '',
      phone:       draft.phone     || '',
      role,
      bloodType:   draft.bloodType  || '',
      height:      draft.height     || '',
      weight:      draft.weight     || '',
      allergies:   draft.allergies  || '',
      conditions:  draft.conditions || '',
      emergency:   [],
      gear:        [],
      createdAt:   firebase.firestore.FieldValue.serverTimestamp()
    };

    try {
      await db.collection('members').doc(_user.uid).set(_profile);
      if (isFirstEver) {
        // Ставим маркер сразу после успешного создания профиля — если бы
        // раньше (до) и set() профиля вдруг не прошёл, false-первый не
        // должен был бы блокировать реального первого от повторной попытки.
        await db.collection('system').doc('bootstrap').set({
          firstUid: _user.uid,
          createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).catch(() => {});
      }
    } catch (e) {
      alert('Этот email пока не приглашён. Попроси того, кто уже пользуется приложением, сначала отправить тебе приглашение.');
      return;
    }
    _boot();
  }

  /* ── Sign-in ── */
  async function signInGoogle() {
    AuthRender.clearError();
    try {
      await auth.signInWithPopup(new firebase.auth.GoogleAuthProvider());
    } catch (e) { AuthRender.showError(e.message); }
  }

  async function signInEmail() {
    AuthRender.clearError();
    const email = (document.getElementById('auth-email')?.value || '').trim();
    const pass  = (document.getElementById('auth-password')?.value || '').trim();
    if (!email || !pass) { AuthRender.showError('Введи email и пароль'); return; }
    try {
      await auth.signInWithEmailAndPassword(email, pass);
    } catch (e) {
      AuthRender.showError(e.message);
    }
  }

  // Раньше "Войти" при неудаче сам пробовал зарегистрировать новый
  // аккаунт — Firebase не различает "такого юзера нет" и "пароль неверный"
  // (invalid-credential — защита от перебора почт), так что опечатка в
  // email тихо заводила новый пустой аккаунт вместо понятной ошибки
  // (человек долетал до "Как тебя зовут?" со свежим аккаунтом-призраком,
  // без профиля и без приглашения). Теперь регистрация — отдельное явное
  // действие: обычная опечатка при входе просто покажет ошибку.
  async function registerEmail() {
    AuthRender.clearError();
    const email = (document.getElementById('auth-email')?.value || '').trim();
    const pass  = (document.getElementById('auth-password')?.value || '').trim();
    if (!email || !pass) { AuthRender.showError('Введи email и пароль'); return; }
    try {
      await auth.createUserWithEmailAndPassword(email, pass);
    } catch (e) {
      if (e.code === 'auth/email-already-in-use') {
        AuthRender.showError('Аккаунт с таким email уже есть — просто войди');
      } else {
        AuthRender.showError(e.message);
      }
    }
  }

  async function signOut() {
    // Онбординг рисует свой оверлей поверх всего (см. ob-overlay) и не
    // убирает себя сам — если выйти прямо из него ("← Выйти"), оверлей
    // остался бы висеть поверх появившегося экрана входа.
    document.getElementById('ob-overlay')?.remove();
    await auth.signOut();
  }

  /* ── Boot ── */
  function _boot() {
    window.APP = {
      user:        _user,
      profile:     _profile,
      isOrganizer: _profile?.role === 'organizer',
      signOut
    };
    AuthRender.hideLoginScreen();
 
    // Если определена startApp в index.html — используем её
    if (typeof startApp === 'function') {
      startApp(_user);
      return;
    }
 
    // Fallback: старое поведение (показываем участников)
    document.querySelectorAll('.page').forEach(p => p.style.display = 'none');
    const pg = document.getElementById('p-members');
    if (pg) pg.style.display = 'flex';
    setTimeout(() => {
      if (typeof MembersModule !== 'undefined') MembersModule.init();
    }, 50);
  }

  /* ── Events ── */
  function _bindEvents() {
    document.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (btn) {
        const a = btn.dataset.action;
        if (a === 'auth-google')   { signInGoogle();  return; }
        if (a === 'auth-email')    { signInEmail();   return; }
        if (a === 'auth-register') { registerEmail();  return; }
        if (a === 'auth-signout')  { signOut();        return; }
        if (['ob-next','ob-back','ob-finish'].includes(a)) {
          AuthRender.handleObEvent(btn); return;
        }
      }
      const ob = e.target.closest('[data-ob-av],[data-ob-blood]');
      if (ob) AuthRender.handleObEvent(ob);
    });
  }

  /* ── Getters ── */
  return {
    init, completeOnboarding,
    signInGoogle, signInEmail, signOut,
    currentUser:    () => _user,
    currentProfile: () => _profile,
    isOrganizer:    () => _profile?.role === 'organizer'
  };
})();

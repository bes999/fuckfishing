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

    // Первый в коллекции → организатор
    let role = 'member';
    try {
      const snap = await db.collection('members').limit(1).get();
      if (snap.empty) role = 'organizer';
    } catch (_) {}

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

    await db.collection('members').doc(_user.uid).set(_profile);
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
      if (['auth/user-not-found','auth/invalid-credential'].includes(e.code)) {
        try { await auth.createUserWithEmailAndPassword(email, pass); }
        catch (e2) { AuthRender.showError(e2.message); }
      } else { AuthRender.showError(e.message); }
    }
  }

  async function signOut() { await auth.signOut(); }

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
    if (pg) pg.style.display = 'block';
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
        if (a === 'auth-google')  { signInGoogle(); return; }
        if (a === 'auth-email')   { signInEmail();  return; }
        if (a === 'auth-signout') { signOut();       return; }
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

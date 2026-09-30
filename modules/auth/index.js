'use strict';
/* globals firebase, auth, db, AuthRender, MembersModule, UIUtils */

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
    // Быстрая смена аккаунта (вышел из А, вошёл в Б) может застать запрос
    // профиля А ещё в полёте — он резолвится ПОЗЖЕ, чем уже вошедший Б, и
    // без проверки его ответ применился бы поверх уже актуального Б
    // (APP.profile от А, включая признак админа в интерфейсе, хотя
    // авторизован Б). Server-side права это не обходит, но экран и
    // локальное состояние показывают не того человека. Реальный баг,
    // найден внешним ревью 2026-09-27. uid — не сам объект user: и то, и
    // другое сравнение допустимо, но uid надёжнее пережидает возможные
    // пересоздания объекта SDK.
    try {
      const snap = await db.collection('members').doc(user.uid).get();
      if (_user?.uid !== user.uid) return;
      if (!snap.exists) {
        // Email/пароль без подтверждения — не показываем онбординг вообще:
        // members.create всё равно упрётся в isInvited()'s email_verified
        // и покажет обманчивое "email не приглашён", хотя причина —
        // неподтверждённая почта. НЕ трогает уже онбордившихся — сюда
        // попадают только те, у кого ещё нет профиля (см. ветку else
        // ниже): isMember() в правилах на email_verified не смотрит
        // вообще, их доступ остаётся как был. Google сюда не попадает — у
        // него emailVerified всегда true (OAuth уже подтверждает
        // владение). Заодно это и есть "отправить письмо ещё раз" для тех,
        // у кого отправка сорвалась при регистрации (см. registerEmail) —
        // просто попробовать войти теперь само повторяет попытку отправки.
        // Реальный баг, найден внешним ревью 2026-09-27.
        if (user.providerData?.some(p => p.providerId === 'password') && !user.emailVerified) {
          await user.sendEmailVerification().catch(() => {});
          await auth.signOut();
          AuthRender.showError('Подтверди почту по ссылке из письма (отправили на ' + (user.email || '') + '), потом войди снова.');
          return;
        }
        document.getElementById('auth-screen')?.style.setProperty('display','none');
        AuthRender.showOnboarding(user);
      } else {
        _profile = snap.data();
        _boot();
      }
    } catch (_) {
      if (_user?.uid !== user.uid) return;
      // Оффлайн — пробуем кеш
      try {
        const snap = await db.collection('members').doc(user.uid).get({source:'cache'});
        if (_user?.uid !== user.uid) return;
        if (snap.exists) { _profile = snap.data(); _boot(); }
        else AuthRender.showOnboarding(user);
      } catch (__) {
        if (_user?.uid !== user.uid) return;
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
  // Firebase НЕ проверяет владение почтой при регистрации по паролю — можно
  // создать аккаунт с ЛЮБЫМ email, включая чужой из /invites, на который у
  // тебя нет доступа (token.email при этом стоит, но email_verified — нет).
  // isInvited() в firestore.rules раньше проверял только сам факт
  // приглашения, без email_verified — посторонний, узнавший приглашённый
  // адрес (email вообще не секрет), мог зарегистрироваться им и пройти
  // онбординг, даже не имея доступа к почте. Реальная дыра, найдена внешним
  // ревью 2026-09-27. Теперь после регистрации сразу шлём письмо-
  // подтверждение и разлогиниваем — оба входа (Google и email/pass) дают
  // members.create только при email_verified == true (см. firestore.rules
  // isInvited()); у Google это true само по себе (OAuth уже подтверждает
  // владение), у email/pass — только после перехода по ссылке из письма.
  async function registerEmail() {
    AuthRender.clearError();
    const email = (document.getElementById('auth-email')?.value || '').trim();
    const pass  = (document.getElementById('auth-password')?.value || '').trim();
    if (!email || !pass) { AuthRender.showError('Введи email и пароль'); return; }
    try {
      const cred = await auth.createUserWithEmailAndPassword(email, pass);
      try {
        await cred.user.sendEmailVerification();
        await auth.signOut();
        AuthRender.showError('Мы отправили письмо со ссылкой для подтверждения на ' + email + ' — перейди по ней, потом войди.');
      } catch (sendErr) {
        // Аккаунт уже создан (createUserWithEmailAndPassword не откатить) —
        // раньше эту ошибку глотали и ВСЁ РАВНО показывали "письмо
        // отправлено", хотя оно не ушло: повторная регистрация тем же
        // email потом сообщала бы "уже есть — войди", а способа повторить
        // отправку не было нигде. Реальный баг (в моём же более раннем
        // фиксе), найден внешним ревью 2026-09-27. Не выдумываем успех —
        // следующая попытка ВОЙТИ этим же email/паролем сама повторит
        // отправку и разлогинит (см. _onAuthChange), так это и есть
        // "отправить письмо ещё раз", отдельной кнопки не нужно.
        await auth.signOut().catch(() => {});
        AuthRender.showError('Аккаунт создан, но письмо не отправилось — попробуй войти этим же паролем, мы пришлём его ещё раз.');
      }
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

    // localStorage (ff_shopping/ff_menu/ff_trips/...) и IndexedDB-кэш
    // Firestore (db.enablePersistence, см. shared/config.js) не привязаны
    // к аккаунту и раньше переживали signOut как есть — на общем
    // устройстве/телефоне следующий вошедший видел чужие данные, пока сам
    // не наберёт что-то новое поверх них. Реальная находка внешнего
    // ревью 2026-09-30. db.terminate() рвёт все активные подписки, после
    // него можно звать clearPersistence() (единственное, что ей после
    // terminate можно) — перезагрузка страницы обязательна в любом
    // случае, т.к. модульный `const db` после terminate() больше не годен.
    try {
      Object.keys(localStorage).filter(k => k.startsWith('ff_')).forEach(k => localStorage.removeItem(k));
    } catch (_) {}
    try {
      await db.terminate();
      await db.clearPersistence();
    } catch (_) {}

    location.reload();
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
        if (a === 'auth-signout')  {
          UIUtils.confirmSheet('Выйти из аккаунта?', { okLabel: 'Выйти' }).then(ok => { if (ok) signOut(); });
          return;
        }
        if (['ob-next','ob-back','ob-finish','ob-photo-pick'].includes(a)) {
          AuthRender.handleObEvent(btn); return;
        }
      }
      const ob = e.target.closest('[data-ob-blood]');
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

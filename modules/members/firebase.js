'use strict';
/* globals firebase, db */

const MembersFirebase = (() => {

  // Раньше при ошибке основного .get() падали на явный {source:'cache'} —
  // тот же класс бага, что уронил список снаряги (см. modules/gear/data.js
  // и memory project_known_bugs_backlog): getProfile() кормит форму
  // редактирования профиля (_showEditSheet → _draftProfile), а сохранение
  // там пишет ВСЕ редактируемые поля разом (displayName/phone/bloodType/
  // allergies/...), не только реально изменённые — если бы кэш вернул
  // устаревший снимок (например поле поменяли с другого устройства, а на
  // этом основной .get() споткнулся о что-то помимо офлайна), сохранение
  // тихо откатило бы это поле обратно на старое значение. Обычный офлайн
  // и так штатно обслуживается кэшем самим SDK на основном .get() —
  // отдельный fallback был нужен только для настоящих ошибок чтения, и
  // именно в этом случае угадывать по устаревшим данным небезопасно.
  // Теперь просто возвращаем null/пусто, вызывающий код уже везде на это
  // рассчитан.
  async function getProfile(uid) {
    try {
      const s = await db.collection('members').doc(uid).get();
      return s.exists ? s.data() : null;
    } catch (_) {
      return null;
    }
  }

  async function getAllMembers() {
    try {
      const s = await db.collection('members').orderBy('createdAt').get();
      return s.docs.map(d => d.data());
    } catch (_) {
      return [];
    }
  }

  async function updateProfile(uid, changes) {
    const payload = Object.assign({}, changes, {
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    });
    await db.collection('members').doc(uid).update(payload);
  }

  // Код привязки Telegram больше не пишется в members/{uid} (тот читают ВСЕ
  // участники — см. firestore.rules). Код — id отдельного документа, который
  // клиент только создаёт/удаляет (отмена), но не читает обратно: код и так
  // известен вызывающему коду, сам его сгенерировал (см. modules/members/
  // index.js: tg-link). Бот проверяет привязку прямым просмотром по id.
  async function createTelegramLinkCode(uid, code) {
    await db.collection('telegram_link_codes').doc(code).set({
      uid, createdAt: new Date().toISOString(),
    });
  }

  async function cancelTelegramLinkCode(code) {
    if (!code) return;
    await db.collection('telegram_link_codes').doc(code).delete().catch(() => {});
  }

  async function deleteProfile(uid) {
    await db.collection('members').doc(uid).delete();
  }

  // Разрешить регистрацию конкретному email — аллоулист, проверяется
  // Firestore rules при онбординге (см. firestore.rules, isInvited()).
  // Правила запрещают update приглашений (см. firestore.rules invites) —
  // .set() на УЖЕ существующий документ Firestore трактует как update, и
  // повторное приглашение того же email (уже разрешённого) падало с
  // permission-denied, хотя регистрация ему и так уже разрешена. Реальный
  // баг, найден внешним ревью 2026-09-27. Если приглашение уже есть — это
  // не ошибка, ничего менять и не нужно.
  async function addInvite(email) {
    const id = String(email || '').trim().toLowerCase();
    if (!id) return;
    const ref = db.collection('invites').doc(id);
    const existing = await ref.get();
    if (existing.exists) return;
    await ref.set({
      invitedBy: window.APP?.user?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function subscribeMembers(cb) {
    return db.collection('members')
      .orderBy('createdAt')
      .onSnapshot(s => cb(s.docs.map(d => d.data())), () => {});
  }

  return { getProfile, getAllMembers, updateProfile, deleteProfile, addInvite, subscribeMembers, createTelegramLinkCode, cancelTelegramLinkCode };
})();

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

  async function deleteProfile(uid) {
    await db.collection('members').doc(uid).delete();
  }

  // Разрешить регистрацию конкретному email — аллоулист, проверяется
  // Firestore rules при онбординге (см. firestore.rules, isInvited()).
  async function addInvite(email) {
    const id = String(email || '').trim().toLowerCase();
    if (!id) return;
    await db.collection('invites').doc(id).set({
      invitedBy: window.APP?.user?.uid || null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp()
    });
  }

  function subscribeMembers(cb) {
    return db.collection('members')
      .orderBy('createdAt')
      .onSnapshot(s => cb(s.docs.map(d => d.data())), () => {});
  }

  return { getProfile, getAllMembers, updateProfile, deleteProfile, addInvite, subscribeMembers };
})();

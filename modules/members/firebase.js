'use strict';
/* globals firebase, db */

const MembersFirebase = (() => {

  async function getProfile(uid) {
    try {
      const s = await db.collection('members').doc(uid).get();
      return s.exists ? s.data() : null;
    } catch (_) {
      const s = await db.collection('members').doc(uid).get({source:'cache'}).catch(()=>null);
      return s?.exists ? s.data() : null;
    }
  }

  async function getAllMembers() {
    try {
      const s = await db.collection('members').orderBy('createdAt').get();
      return s.docs.map(d => d.data());
    } catch (_) {
      const s = await db.collection('members').get({source:'cache'}).catch(()=>({docs:[]}));
      return s.docs.map(d => d.data());
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

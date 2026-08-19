'use strict';
/* globals firebase, db, TRIP_ID */

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

  function subscribeMembers(cb) {
    return db.collection('members')
      .orderBy('createdAt')
      .onSnapshot(s => cb(s.docs.map(d => d.data())), () => {});
  }

  async function getCatchStats(uid) {
    try {
      const s = await db.collection('trips').doc(TRIP_ID)
        .collection('catches').where('userId','==',uid).get();
      const catches = s.docs.map(d => d.data());
      const total  = catches.length;
      const weight = catches.reduce((a,c) => a + (Number(c.weight)||0), 0);
      const record = catches.reduce((m,c) => Math.max(m, Number(c.weight)||0), 0);
      return { total, weight: +weight.toFixed(2), record: +record.toFixed(2) };
    } catch (_) { return { total:0, weight:0, record:0 }; }
  }

  async function getExpenseBalance(uid) {
    try {
      const [expSnap, membSnap] = await Promise.all([
        db.collection('trips').doc(TRIP_ID).collection('expenses').get(),
        db.collection('members').get()
      ]);
      const count = membSnap.size || 1;
      let paid = 0, share = 0;
      expSnap.docs.forEach(d => {
        const e = d.data();
        if (e.paidBy === uid) paid += Number(e.amount)||0;
        share += (Number(e.amount)||0) / count;
      });
      return { paid:+paid.toFixed(2), share:+share.toFixed(2), balance:+(paid-share).toFixed(2) };
    } catch (_) { return { paid:0, share:0, balance:0 }; }
  }

  return { getProfile, getAllMembers, updateProfile, deleteProfile, subscribeMembers, getCatchStats, getExpenseBalance };
})();

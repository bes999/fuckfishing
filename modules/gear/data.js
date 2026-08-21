'use strict';
/* globals db, firebase */

const GearData = (() => {

  async function load(uid) {
    try {
      const doc = await db.collection('members').doc(uid).get();
      const d = doc.exists ? doc.data() : {};
      return {
        locations:  d.gearLocations  || [],
        categories: d.gearCategories || [],
        items:      d.gearItems      || []
      };
    } catch (_) {
      try {
        const doc = await db.collection('members').doc(uid).get({source: 'cache'});
        const d = doc != null && doc.exists ? doc.data() : {};
        return {
          locations:  d.gearLocations  || [],
          categories: d.gearCategories || [],
          items:      d.gearItems      || []
        };
      } catch (__) {
        return { locations: [], categories: [], items: [] };
      }
    }
  }

  async function save(uid, template) {
    await db.collection('members').doc(uid).update({
      gearLocations:  template.locations,
      gearCategories: template.categories,
      gearItems:      template.items,
      updatedAt: firebase.firestore.FieldValue.serverTimestamp()
    }).catch(function(err) {
      console.error('GearData.save: не удалось сохранить снаряжение', err);
      throw err;
    });
  }

  /* ── Списки снаряги по поездкам (Firestore, gear_trip_snapshots) ──
     Кэш в памяти на пользователя — читается синхронно всеми остальными
     функциями ниже, наполняется один раз через ensureLoaded(uid). Видно
     всем участникам (read: isMember()), редактирует только владелец. */
  let _snapshots  = {};   // { tripId: {uid, tripId, tripName, locations, categories, items, checked} }
  let _loadedForUid = null;
  let _loadPromise  = null;

  function _docId(uid, tripId) { return uid + '_' + tripId; }

  function ensureLoaded(uid) {
    if (_loadedForUid === uid) return _loadPromise;
    _loadedForUid = uid;
    _loadPromise = db.collection('gear_trip_snapshots').where('uid', '==', uid).get()
      .then(snap => {
        _snapshots = {};
        snap.forEach(doc => { _snapshots[doc.data().tripId] = doc.data(); });
      })
      .catch(err => {
        console.error('GearData.ensureLoaded: не удалось загрузить списки поездок', err);
        _snapshots = {};
      });
    return _loadPromise;
  }

  /* ── Чекбоксы поездки ── */
  function getChecked(uid, tripId) {
    return (_snapshots[tripId] && _snapshots[tripId].checked) || [];
  }

  async function setChecked(uid, tripId, ids) {
    if (_snapshots[tripId]) _snapshots[tripId].checked = ids;
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId))
      .set({ checked: ids }, { merge: true })
      .catch(err => console.error('GearData.setChecked:', err));
  }

  /* ── Снимок списка для поездки ── */
  function getTripSnapshot(uid, tripId) {
    return _snapshots[tripId] || null;
  }

  async function saveTripSnapshot(uid, tripId, tripName, template) {
    const snap = {
      uid, tripId, tripName,
      locations:  template.locations  || [],
      categories: template.categories || [],
      items:      template.items      || [],
      checked:    [],
      updatedAt:  firebase.firestore.FieldValue.serverTimestamp()
    };
    await db.collection('gear_trip_snapshots').doc(_docId(uid, tripId)).set(snap);
    _snapshots[tripId] = snap;
    return snap;
  }

  function getTripList(uid) {
    return Object.values(_snapshots).map(s => ({ id: s.tripId, name: s.tripName }));
  }

  function hasTripSnapshot(tripId) {
    return !!_snapshots[tripId];
  }

  /* ── Генератор ID ── */
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return {
    load, save,
    ensureLoaded, getChecked, setChecked, getTripSnapshot, saveTripSnapshot, getTripList, hasTripSnapshot,
    uid,
  };
})();

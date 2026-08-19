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

  /* ── Чекбоксы поездки (localStorage) ── */
  function getChecked(uid, tripId) {
    try {
      return JSON.parse(localStorage.getItem('gear_checked_' + uid + '_' + tripId) || '[]');
    } catch (_) { return []; }
  }

  function setChecked(uid, tripId, ids) {
    localStorage.setItem('gear_checked_' + uid + '_' + tripId, JSON.stringify(ids));
  }

  /* ── Снимок шаблона для поездки (localStorage) ── */
  function getTripSnapshot(uid, tripId) {
    try {
      return JSON.parse(localStorage.getItem('gear_snap_' + uid + '_' + tripId) || 'null');
    } catch (_) { return null; }
  }

  function saveTripSnapshot(uid, tripId, tripName, template) {
    const snap = {
      tripId, tripName,
      savedAt: Date.now(),
      locations:  template.locations,
      categories: template.categories,
      items:      template.items
    };
    localStorage.setItem('gear_snap_' + uid + '_' + tripId, JSON.stringify(snap));

    // Обновляем список поездок
    const trips = getTripList(uid);
    if (!trips.find(function(t) { return t.id === tripId; })) {
      trips.push({ id: tripId, name: tripName });
      localStorage.setItem('gear_trips_' + uid, JSON.stringify(trips));
    }
    return snap;
  }

  function getTripList(uid) {
    try {
      return JSON.parse(localStorage.getItem('gear_trips_' + uid) || '[]');
    } catch (_) { return []; }
  }

  /* ── Генератор ID ── */
  function uid() {
    return Math.random().toString(36).slice(2, 10) + Date.now().toString(36);
  }

  return { load, save, getChecked, setChecked, getTripSnapshot, saveTripSnapshot, getTripList, uid };
})();

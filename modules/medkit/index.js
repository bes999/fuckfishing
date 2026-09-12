/* ===== MEDKIT INDEX ===== */

var medkitTripId = null;

// Поездка по умолчанию при первом открытии Аптечки — та же логика, что у
// modules/purchases/render.js: ближайшая предстоящая, иначе самая свежая по
// дате начала. TripsData ещё не обязательно наполнен на DOMContentLoaded
// (подписка на Firestore стартует позже, внутри startApp() после логина) —
// поэтому реальный выбор поездки откладывается до TripsFirebase.ready().
function _defaultMedkitTripId() {
  if (typeof TripsData === 'undefined' || typeof window === 'undefined') return null;
  var uid = window.APP && window.APP.user && window.APP.user.uid;
  var trips = TripsData.getMine ? TripsData.getMine(uid) : [];
  if (!trips || !trips.length) return null;
  var upcoming = TripsData.getUpcoming ? TripsData.getUpcoming(uid) : null;
  return (upcoming && upcoming.id) || trips[0].id;
}

document.addEventListener('DOMContentLoaded', function() {
  medkitMode = 'common';
  medkitMemberId = '';
  medkitViewMode = 'drugs';

  var readyPromise = (typeof TripsFirebase !== 'undefined') ? TripsFirebase.ready() : Promise.resolve();
  readyPromise.then(function() {
    medkitTripId = _defaultMedkitTripId();
    rMedkit();
    initFirebase();
  });
});
/* ===== MEDKIT INDEX ===== */

document.addEventListener('DOMContentLoaded', function() {
  loadLocal();

  medkitMode = 'common';
  medkitMemberId = '';
  medkitViewMode = 'drugs';

  rMedkit();
  initFirebase();
});
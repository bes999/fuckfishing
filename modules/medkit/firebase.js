/* ===== FIREBASE ===== */


var tripRef = db.collection('trips').doc(TRIP_ID);
var medkitRef = tripRef.collection('modules').doc('medkit');

// --- Сохранить аптечку ---
function saveMedkit() {
  saveLocal();
  saveMedkitToFirebase();
}

// --- Локальное хранилище ---
function saveLocal() {
  try {
    localStorage.setItem('medkit_next', JSON.stringify(buildMedkitPayload()));
  } catch(e) {
    console.log('localStorage error:', e);
  }
}

function loadLocal() {
  try {
    var raw = localStorage.getItem('medkit_next');
    if (raw) applyMedkitPayload(JSON.parse(raw));
  } catch(e) {
    console.log('localStorage load error:', e);
  }
}

// --- Firebase сохранение ---
function saveMedkitToFirebase() {
  if (typeof medkitRef === 'undefined') return;
  medkitRef.set(buildMedkitPayload(), { merge: true })
    .catch(function(e) { console.log('medkit save error:', e); });
}

// --- Firebase загрузка ---
function loadMedkitFromFirebase() {
  if (typeof medkitRef === 'undefined') return Promise.resolve();
  return medkitRef.get()
    .then(function(doc) {
      if (doc.exists) {
        applyMedkitPayload(doc.data());
      }
      rMedkit();
    })
    .catch(function(e) {
      console.log('medkit load error:', e);
      rMedkit();
    });
}

// --- Подписка на изменения ---
function subscribeMedkit() {
  if (typeof medkitRef === 'undefined') return;
  var skipNext = false;
  medkitRef.onSnapshot(function(doc) {
    if (skipNext) { skipNext = false; return; }
    if (doc.exists && !doc.metadata.hasPendingWrites) {
      applyMedkitPayload(doc.data());
      rMedkit();
    }
  }, function(e) {
    console.log('medkit subscribe error:', e);
  });
}

// --- Инициализация ---
function initFirebase() {
  loadLocal();
  loadMedkitFromFirebase().then(function() {
    subscribeMedkit();
  });
}
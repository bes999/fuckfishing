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
// _lastSavedUpdatedAt — метка последней записи, сделанной ЭТОЙ вкладкой.
// Раньше здесь была защита skipNext, которая выставлялась и проверялась в
// РАЗНЫХ функциях (переменная объявлена внутри subscribeMedkit, а писать в
// неё должен был saveMedkitToFirebase — до неё оттуда просто не дотянуться,
// это две разные замыкающие области). В итоге эхо собственной подтверждённой
// записи всегда проходило как настоящее обновление с сервера и вызывало
// полный rMedkit() — если в этот момент кто-то печатал в другое поле (своё
// или на другом устройстве), ввод стирался без предупреждения. Метка
// updatedAt в самом payload даёт способ узнать "это подтверждение МОЕЙ
// записи" надёжнее, чем булев флаг, — работает независимо от того, сколько
// промежуточных снапшотов (локальный pending, потом подтверждённый) успеет
// прилететь между записью и подпиской.
var _lastSavedUpdatedAt = null;

function saveMedkitToFirebase() {
  if (typeof medkitRef === 'undefined') return;
  var payload = buildMedkitPayload();
  _lastSavedUpdatedAt = payload.updatedAt;
  medkitRef.set(payload, { merge: true })
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
  medkitRef.onSnapshot(function(doc) {
    if (!doc.exists || doc.metadata.hasPendingWrites) return;
    var data = doc.data();
    if (_lastSavedUpdatedAt && data.updatedAt === _lastSavedUpdatedAt) return; // эхо своей же записи
    applyMedkitPayload(data);
    rMedkit();
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
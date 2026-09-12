/* ===== FIREBASE ===== */

// Раньше tripRef/medkitRef строились один раз при загрузке скрипта, от
// захардкоженного TRIP_ID ('sakhalin2026') — Аптечка открывается из личного
// гамбургера, а не как вкладка поездки, поэтому "какая поездка активна"
// никогда и не пересчитывалось: все поездки читали и писали в один и тот же
// документ Сахалина. medkitTripId (см. modules/medkit/index.js) теперь
// выбирается пользователем (тот же паттерн, что и modules/purchases/
// render.js), а medkitRef() всегда строит путь заново от него.
function medkitRef() {
  if (!medkitTripId) return null;
  return db.collection('trips').doc(medkitTripId).collection('modules').doc('medkit');
}

// --- Сохранить аптечку ---
function saveMedkit() {
  saveLocal();
  saveMedkitToFirebase();
}

// --- Локальное хранилище ---
// Ключ включает tripId — иначе при переключении поездки успевал бы на
// мгновение отрисоваться кэш ДРУГОЙ поездки, пока не пришёл настоящий
// ответ Firestore для новой.
function _medkitLocalKey() {
  return medkitTripId ? 'medkit_next_' + medkitTripId : null;
}

function saveLocal() {
  var key = _medkitLocalKey();
  if (!key) return;
  try {
    localStorage.setItem(key, JSON.stringify(buildMedkitPayload()));
  } catch(e) {
    console.log('localStorage error:', e);
  }
}

function loadLocal() {
  var key = _medkitLocalKey();
  if (!key) return;
  try {
    var raw = localStorage.getItem(key);
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
  var ref = medkitRef();
  if (!ref) return;
  var payload = buildMedkitPayload();
  _lastSavedUpdatedAt = payload.updatedAt;
  ref.set(payload, { merge: true })
    .catch(function(e) { console.log('medkit save error:', e); });
}

// --- Firebase загрузка ---
function loadMedkitFromFirebase() {
  var ref = medkitRef();
  if (!ref) return Promise.resolve();
  return ref.get()
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
// _unsubscribeMedkit — обязателен теперь, когда поездка может смениться:
// без отписки от старого слушателя переключение на другую поездку оставляло
// бы висеть слушатель предыдущей, и оба документа гонялись бы друг с другом
// за тем, кто последний перерисует экран.
var _unsubscribeMedkit = null;

function subscribeMedkit() {
  var ref = medkitRef();
  if (!ref) return;
  _unsubscribeMedkit = ref.onSnapshot(function(doc) {
    if (!doc.exists || doc.metadata.hasPendingWrites) return;
    var data = doc.data();
    if (_lastSavedUpdatedAt && data.updatedAt === _lastSavedUpdatedAt) return; // эхо своей же записи
    applyMedkitPayload(data);
    rMedkit();
  }, function(e) {
    console.log('medkit subscribe error:', e);
  });
}

function unsubscribeMedkit() {
  if (_unsubscribeMedkit) { _unsubscribeMedkit(); _unsubscribeMedkit = null; }
}

// --- Инициализация / переключение поездки ---
// Общая точка входа что для первого открытия Аптечки, что для выбора другой
// поездки в свитчере (modules/medkit/render.js) — оба случая одинаково
// требуют: отписаться от прежнего документа, сбросить локальный кэш
// применённых данных на "пусто", загрузить/подписаться заново.
function initFirebase() {
  unsubscribeMedkit();
  _lastSavedUpdatedAt = null;
  resetMedkitPayload();
  loadLocal();
  loadMedkitFromFirebase().then(function() {
    subscribeMedkit();
  });
}

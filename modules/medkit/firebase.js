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

// Личная аптечка — отдельный документ на человека:
// trips/{tripId}/medkit_personal/{uid}. Раньше все личные аптечки жили
// в одном общем документе, и любое сохранение (даже одна галочка) писало
// ВЕСЬ документ — общую и личные ВСЕХ участников — из локальной копии
// этого телефона: устаревшая копия затирала чужие данные, а правила
// Firestore не могли запретить править чужую. Теперь пишет только
// владелец (или админ) — см. firestore.rules. Старое поле personal в
// общем документе читается как запасной вариант, пока не перенесено.
function medkitPersonalCol() {
  if (!medkitTripId) return null;
  return db.collection('trips').doc(medkitTripId).collection('medkit_personal');
}
var _medkitLegacyPersonal = {};   // data.personal из общего документа (старый формат)
var _medkitPersonalDocs = {};     // uid → состояние из medkit_personal
function _rebuildMedkitPersonal() {
  var out = {};
  Object.keys(_medkitLegacyPersonal).forEach(function(k) { if (k && k !== 'default') out[k] = _medkitLegacyPersonal[k]; });
  Object.keys(_medkitPersonalDocs).forEach(function(k) { out[k] = _medkitPersonalDocs[k]; });
  medkitState.personal = out;
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

var _lastSavedPersonalAt = null;

function saveMedkitToFirebase() {
  var ref = medkitRef();
  if (!ref) return;
  var payload = buildMedkitPayload();
  // Общие для всех списки (свои категории и места хранения) — в общем
  // документе при любой правке; сами данные — только того режима, в
  // котором правили.
  var shared = { customGroups: payload.customGroups, customSlots: payload.customSlots, updatedAt: payload.updatedAt };
  if (medkitMode === 'personal') {
    var uid = medkitMemberId;
    var me = window.APP && window.APP.user && window.APP.user.uid;
    var isAdmin = typeof AuthActions !== 'undefined' && AuthActions.isOrganizer();
    var col = medkitPersonalCol();
    if (col && uid && uid !== 'default' && (uid === me || isAdmin)) {
      var st = Object.assign({}, medkitState.personal[uid] || {}, { updatedAt: payload.updatedAt });
      _medkitPersonalDocs[uid] = medkitState.personal[uid];
      _lastSavedPersonalAt = payload.updatedAt;
      col.doc(uid).set(st).catch(function(e) { console.log('medkit personal save error:', e); });
    }
  } else {
    shared.common = payload.common;
  }
  _lastSavedUpdatedAt = payload.updatedAt;
  ref.set(shared, { merge: true })
    .catch(function(e) { console.log('medkit save error:', e); });
}

// --- Firebase загрузка ---
// При быстром переключении поездок запоздавший ответ ДЛЯ ПРЕДЫДУЩЕЙ
// поездки мог прилететь уже после того, как открыли следующую — и тогда
// applyMedkitPayload() применял содержимое старой поездки поверх выбранной
// новой; следующее сохранение рисковало перенести эти данные не туда.
// Реальная гонка, найдена внешним ревью 2026-09-27 — запоминаем, для какой
// именно поездки запущена ЭТА загрузка, и не применяем результат, если
// medkitTripId успел смениться к моменту ответа.
function loadMedkitFromFirebase() {
  var ref = medkitRef();
  if (!ref) return Promise.resolve();
  var forTripId = medkitTripId;
  var col = medkitPersonalCol();
  return Promise.all([ref.get(), col ? col.get() : Promise.resolve(null)])
    .then(function(res) {
      if (medkitTripId !== forTripId) return;
      var doc = res[0], psnap = res[1];
      if (psnap) psnap.forEach(function(d) { _medkitPersonalDocs[d.id] = d.data(); });
      if (doc.exists) applyMedkitPayload(doc.data());
      else _rebuildMedkitPersonal();
      rMedkit();
    })
    .catch(function(e) {
      console.log('medkit load error:', e);
      if (medkitTripId === forTripId) rMedkit();
    });
}

// --- Подписка на изменения ---
// _unsubscribeMedkit — обязателен теперь, когда поездка может смениться:
// без отписки от старого слушателя переключение на другую поездку оставляло
// бы висеть слушатель предыдущей, и оба документа гонялись бы друг с другом
// за тем, кто последний перерисует экран.
var _unsubscribeMedkit = null;
var _unsubscribeMedkitPersonal = null;

function subscribeMedkit() {
  // На случай, если сюда всё же попадут дважды подряд без промежуточного
  // unsubscribeMedkit() (см. защиту в initFirebase() ниже) — не даём
  // предыдущей подписке потеряться (переменная держит только ПОСЛЕДНЮЮ,
  // более ранняя иначе утекает и продолжает слать обновления вечно).
  unsubscribeMedkit();
  var ref = medkitRef();
  if (!ref) return;
  var col = medkitPersonalCol();
  if (col) _unsubscribeMedkitPersonal = col.onSnapshot(function(snap) {
    if (snap.metadata.hasPendingWrites) return;
    var mine = false;
    snap.docChanges().forEach(function(ch) {
      var d = ch.doc.data();
      if (ch.type === 'removed') { delete _medkitPersonalDocs[ch.doc.id]; return; }
      if (_lastSavedPersonalAt && d.updatedAt === _lastSavedPersonalAt) { mine = true; return; } // эхо своей записи
      _medkitPersonalDocs[ch.doc.id] = d;
    });
    _rebuildMedkitPersonal();
    if (!mine || snap.docChanges().length > 1) rMedkit();
  }, function(e) { console.log('medkit personal subscribe error:', e); });
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
  if (_unsubscribeMedkitPersonal) { _unsubscribeMedkitPersonal(); _unsubscribeMedkitPersonal = null; }
}

// --- Инициализация / переключение поездки ---
// Общая точка входа что для первого открытия Аптечки, что для выбора другой
// поездки в свитчере (modules/medkit/render.js) — оба случая одинаково
// требуют: отписаться от прежнего документа, сбросить локальный кэш
// применённых данных на "пусто", загрузить/подписаться заново.
function initFirebase() {
  unsubscribeMedkit();
  _lastSavedUpdatedAt = null;
  _lastSavedPersonalAt = null;
  _medkitLegacyPersonal = {};
  _medkitPersonalDocs = {};
  resetMedkitPayload();
  loadLocal();
  // При быстром А→Б→В loadMedkitFromFirebase() для А уже не применяет
  // устаревший ОТВЕТ (см. её же комментарий) — но раньше ПОДПИСКА всё
  // равно создавалась после её резолва, уже на ТЕКУЩУЮ (Б или В) поездку,
  // поверх подписки, которую для неё же создал её собственный initFirebase().
  // Вторую подписку никто не отписывал (_unsubscribeMedkit хранит только
  // последнюю) — она утекала и продолжала применять обновления к уже
  // смененному экрану. Реальный баг, найден внешним ревью 2026-09-27.
  var forTripId = medkitTripId;
  loadMedkitFromFirebase().then(function() {
    if (medkitTripId !== forTripId) return;
    subscribeMedkit();
  });
}

/* ===== MEDKIT STATE ===== */

var medkitState = {
  common: createEmptyMedkitState(),
  personal: {}
};

var medkitMode = 'common';
var medkitMemberId = '';
var medkitViewMode = 'drugs';
var medkitOpenGroups = (function() {
try { return JSON.parse(localStorage.getItem('medkit_open_groups') || '{}'); } catch(e) { return {}; }
})();
var medkitStackCollapsed = (function() {
  try { return localStorage.getItem('medkit_stack_collapsed') === 'true'; } catch(e) { return false; }
})();
function createEmptyMedkitState() {
  return {
    items: {},
    customItems: [],
    hiddenItems: {},
    hiddenGroups: {},
    enabledGroups: {},
    slots: []
  };
}

function getMedkitState(mode, memberId) {
  var st;
  if (mode === 'common') st = medkitState.common;
  else {
    if (!medkitState.personal[memberId]) medkitState.personal[memberId] = createEmptyMedkitState();
    st = medkitState.personal[memberId];
  }
  // Документ из Firestore мог прийти без части полей (старые версии
  // payload) — добиваем пустыми, чтобы рендер не падал на .customItems.
  if (st && !st.items) st.items = {};
  if (st && !st.customItems) st.customItems = [];
  if (st && !st.hiddenItems) st.hiddenItems = {};
  if (st && !st.hiddenGroups) st.hiddenGroups = {};
  if (st && !st.enabledGroups) st.enabledGroups = {};
  return st;
}

function getMedkitItem(mode, memberId, itemId) {
  var state = getMedkitState(mode, memberId);
  if (!state.items[itemId]) {
    state.items[itemId] = {
      checked: false,
      slot: '',
      total: '',
      left: '',
      unit: '',
      dose: '',
      expiry: '',
      note: '',
      taken: {}
    };
  }
  return state.items[itemId];
}

// Группа считается фактически заполненной, если у любого её препарата
// (из каталога или добавленного вручную) есть реальные данные — отмечен
// как есть, указан слот/остаток/срок/заметка и т.п. Нужно для миграции:
// когда стандартные категории стали personalOptional (раньше были
// обязательными для всех), у людей, кто уже вёл свою личную аптечку, флаг
// enabledGroups для них никогда не выставлялся — без этой проверки их уже
// заполненные категории тихо спрятались бы за "не подключено".
function _groupHasData(state, group) {
  var ids = group.items.map(function(it) { return it.id; });
  state.customItems.forEach(function(ci) {
    if (ci.groupId === group.id) ids.push(ci.id);
  });
  for (var i = 0; i < ids.length; i++) {
    var it = state.items[ids[i]];
    if (!it) continue;
    if (it.checked || it.slot || it.total || it.left || it.dose || it.expiry || it.note) return true;
    if (it.taken && Object.keys(it.taken).length) return true;
  }
  return false;
}

function isGroupEnabled(mode, memberId, groupId) {
  var group = null;
  for (var i = 0; i < MEDKIT_BASE.length; i++) {
    if (MEDKIT_BASE[i].id === groupId) { group = MEDKIT_BASE[i]; break; }
  }
  if (!group) return false;
  if (group.availableIn.indexOf(mode) < 0) return false;
  if (mode === 'common') {
    if (!group.commonOptional) return true;
    return !!getMedkitState(mode, memberId).enabledGroups[groupId];
  }
  if (mode === 'personal') {
    if (!group.personalOptional) return true;
    var state = getMedkitState(mode, memberId);
    // Явное «выключено» (false) сильнее, чем «есть данные»: раньше
    // «Отключить» удалял ключ, и категория с отметками тут же включалась
    // обратно через _groupHasData — выключить её было нельзя. К тому же
    // удалённый ключ не доходил до Firestore (set с merge не удаляет ключи
    // вложенных карт), а false — доходит.
    if (state.enabledGroups[groupId] === false) return false;
    return !!state.enabledGroups[groupId] || _groupHasData(state, group);
  }
  return true;
}

function isGroupHidden(mode, memberId, groupId) {
  return !!getMedkitState(mode, memberId).hiddenGroups[groupId];
}

function isItemHidden(mode, memberId, itemId) {
  return !!getMedkitState(mode, memberId).hiddenItems[itemId];
}

// Что реально видно в списке: включённые и не скрытые категории со своими
// не скрытыми препаратами (каталог + добавленные вручную). Добавленные в
// категорию, которой в этом режиме нет (импорт текстом в «Другое» —
// groupId 'custom'), раньше не показывались нигде, хотя считались в
// прогрессе — теперь собираются в отдельную псевдо-категорию «Другое».
function getMedkitSections(mode, memberId) {
  var state = getMedkitState(mode, memberId);
  var sections = [];
  var known = {};
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];
    if (group.availableIn.indexOf(mode) < 0) continue;
    known[group.id] = true;
    if (!isGroupEnabled(mode, memberId, group.id)) continue;
    if (isGroupHidden(mode, memberId, group.id)) continue;
    var items = [];
    for (var i = 0; i < group.items.length; i++) {
      if (!isItemHidden(mode, memberId, group.items[i].id)) items.push(group.items[i]);
    }
    for (var c = 0; c < state.customItems.length; c++) {
      var ci = state.customItems[c];
      if (ci.groupId === group.id && !isItemHidden(mode, memberId, ci.id)) items.push(ci);
    }
    sections.push({ group: group, items: items });
  }
  var orphans = state.customItems.filter(function(ci) {
    return !known[ci.groupId] && !isItemHidden(mode, memberId, ci.id);
  });
  if (orphans.length) {
    sections.push({ group: { id: '__other', label: 'Другое', items: [], availableIn: [mode], pseudo: true }, items: orphans });
  }
  return sections;
}

function getMedkitProgress(mode, memberId) {
  var total = 0;
  var done = 0;
  var sections = getMedkitSections(mode, memberId);
  for (var s = 0; s < sections.length; s++) {
    for (var i = 0; i < sections[s].items.length; i++) {
      total++;
      if (getMedkitItem(mode, memberId, sections[s].items[i].id).checked) done++;
    }
  }
  return {
    total: total,
    done: done,
    pct: total ? Math.round(done / total * 100) : 0
  };
}

// Сбрасывает всё в памяти к пустому состоянию — вызывается перед загрузкой
// данных ДРУГОЙ поездки (см. modules/medkit/firebase.js:initFirebase), иначе
// для поездки без ещё ни разу сохранённого документа applyMedkitPayload
// просто не вызовется (doc.exists === false) и на экране на мгновение
// останется аптечка предыдущей поездки, а не пустая.
function resetMedkitPayload() {
  medkitState.common = createEmptyMedkitState();
  medkitState.personal = {};
  MEDKIT_BASE = MEDKIT_BASE.filter(function(g) { return !g.custom; });
  ['common', 'personal'].forEach(function(mode) {
    MEDKIT_SLOTS[mode] = MEDKIT_SLOTS[mode].filter(function(s) { return !s.custom; });
  });
}

function applyMedkitPayload(data) {
  data = data || {};

  // Кастомные категории/места хранения (добавленные через "+ Добавить
  // категорию"/"+ Добавить место") раньше жили только в памяти вкладки —
  // при перезагрузке страницы исчезали. Убираем те, что применили в
  // прошлый раз (чтобы повторный applyMedkitPayload — например от эха
  // снапшота — не задублировал их), и накатываем актуальный список.
  MEDKIT_BASE = MEDKIT_BASE.filter(function(g) { return !g.custom; });
  (data.customGroups || []).forEach(function(g) { MEDKIT_BASE.push(g); });
  ['common', 'personal'].forEach(function(mode) {
    MEDKIT_SLOTS[mode] = MEDKIT_SLOTS[mode].filter(function(s) { return !s.custom; });
    ((data.customSlots || {})[mode] || []).forEach(function(s) { MEDKIT_SLOTS[mode].push(s); });
  });

  medkitState.common = data.common || createEmptyMedkitState();

  var personalFromServer = data.personal || {};
  var localRaw = null;
  var localKey = (typeof _medkitLocalKey === 'function') ? _medkitLocalKey() : null;
  try { if (localKey) localRaw = JSON.parse(localStorage.getItem(localKey) || 'null'); } catch(e) {}

  medkitState.personal = personalFromServer;

  if (localRaw && localRaw.personal) {
    var keys = Object.keys(localRaw.personal);
    for (var i = 0; i < keys.length; i++) {
      var k = keys[i];
      if (!medkitState.personal[k]) medkitState.personal[k] = createEmptyMedkitState();
      if (localRaw.personal[k]) {
        medkitState.personal[k].hiddenGroups = localRaw.personal[k].hiddenGroups || {};
        medkitState.personal[k].hiddenItems = localRaw.personal[k].hiddenItems || {};
        medkitState.personal[k].enabledGroups = localRaw.personal[k].enabledGroups || {};
      }
    }
  }
}

function buildMedkitPayload() {
  var personal = {};
  var keys = Object.keys(medkitState.personal);
  for (var i = 0; i < keys.length; i++) {
    if (keys[i] && keys[i].trim()) { // только непустые ключи
      personal[keys[i]] = medkitState.personal[keys[i]];
    }
  }
  return {
    common: medkitState.common,
    personal: personal,
    customGroups: MEDKIT_BASE.filter(function(g) { return g.custom; }),
    customSlots: {
      common:   MEDKIT_SLOTS.common.filter(function(s) { return s.custom; }),
      personal: MEDKIT_SLOTS.personal.filter(function(s) { return s.custom; })
    },
    updatedAt: new Date().toISOString()
  };
}
function toggleGroupOpen(groupId) {
  medkitOpenGroups[groupId] = !medkitOpenGroups[groupId];
  try { localStorage.setItem('medkit_open_groups', JSON.stringify(medkitOpenGroups)); } catch(e) {}
}

function isGroupOpen(groupId) {
  return !!medkitOpenGroups[groupId];
}

// Карточка препарата теперь отдельный лист поверх списка (openMedkitDrug в
// render.js), а не разворот в строке — состояние «какая карточка раскрыта»
// больше не нужно. Справка внутри листа всегда раскрыта сразу.

// ===== Перенос старых id препаратов (НЕ вызывается автоматически) =====
// В общей аптечке sakhalin2026 отметки лежат под id из ранней версии
// каталога, которых в MEDKIT_BASE уже нет, — на экране они не видны.
// Соответствие восстановлено по названиям (истории правок id в проекте
// нет; MEDKIT_INFO хранит справку только для cold_ingavirin/cold_furacilin).
// Для двух препаратов, которых в каталоге нет вовсе, заводим добавленный
// вручную препарат с тем же названием, чтобы отметки не потерялись.
var MEDKIT_LEGACY_IDS = {
  pain_paracetamol: 'cold_paracetamol',   // Парацетамол переехал в «Простуда / температура»
  cold_suprastin:   'allergy_suprastin',  // Супрастин — в «Аллергия»
  nose_naftizin:    'cold_nazivin',       // «Називин / Нафтизин»
  eye_visine:       'eye_vizin',          // Визин (другое написание)
  wound_patch:      'wound_plaster',      // Пластырь
  cold_ingavirin:   { custom: true, name: 'Ингавирин', groupId: 'cold' },
  cold_furacilin:   { custom: true, name: 'Фурацилин', groupId: 'wounds' }  // антисептик — по решению Дмитрия
};

function _mkItemHasData(it) {
  if (!it) return false;
  if (it.checked || it.slot || it.total || it.left || it.unit || it.dose || it.expiry || it.note || it.slot_time || it.how) return true;
  return !!(it.taken && Object.keys(it.taken).length);
}

// Чистая функция над одним состоянием (common или personal[uid]). Ничего
// не сохраняет. Возвращает отчёт: что куда перенесено и какие старые
// ключи нужно удалить из Firestore отдельно (set с merge их не удалит).
function migrateMedkitLegacyIds(state) {
  var report = { moved: [], created: [], removedKeys: [] };
  if (!state || !state.items) return report;
  Object.keys(MEDKIT_LEGACY_IDS).forEach(function(oldId) {
    var old = state.items[oldId];
    var wasHidden = state.hiddenItems && state.hiddenItems[oldId];
    if (!old && !wasHidden) return;
    var target = MEDKIT_LEGACY_IDS[oldId];
    var newId = target;
    if (typeof target === 'object') {
      if (!_mkItemHasData(old)) { report.removedKeys.push(oldId); delete state.items[oldId]; return; }
      newId = 'custom_legacy_' + oldId;
      if (!state.customItems.some(function(ci) { return ci.id === newId; })) {
        state.customItems.push({ id: newId, name: target.name, groupId: target.groupId, custom: true });
        report.created.push(oldId + ' → ' + newId + ' («' + target.name + '»)');
      }
    }
    if (old) {
      var cur = state.items[newId];
      if (!_mkItemHasData(cur)) {
        state.items[newId] = old;
      } else {
        // У нового id уже есть свои данные — ничего не затираем, только
        // добиваем пустые поля из старого и объединяем отметки.
        ['slot', 'total', 'left', 'unit', 'dose', 'expiry', 'note', 'slot_time', 'how'].forEach(function(k) {
          if (!cur[k] && old[k]) cur[k] = old[k];
        });
        cur.checked = !!(cur.checked || old.checked);
        cur.taken = Object.assign({}, old.taken || {}, cur.taken || {});
      }
      delete state.items[oldId];
    }
    if (wasHidden && state.hiddenItems[newId] === undefined) state.hiddenItems[newId] = true;
    if (state.hiddenItems) delete state.hiddenItems[oldId];
    report.moved.push(oldId + ' → ' + newId);
    report.removedKeys.push(oldId);
  });
  return report;
}

// Запуск по всей текущей поездке — вручную из консоли, когда открыта нужная
// поездка (medkitTripId === 'sakhalin2026'). Сохраняет и удаляет старые
// ключи из документа через update(FieldValue.delete()). Сам модуль это
// никогда не вызывает.
function runMedkitLegacyMigration() {
  var reports = { common: migrateMedkitLegacyIds(medkitState.common), personal: {} };
  Object.keys(medkitState.personal).forEach(function(uid) {
    reports.personal[uid] = migrateMedkitLegacyIds(medkitState.personal[uid]);
  });
  saveMedkit();
  var ref = medkitRef();
  if (ref && typeof firebase !== 'undefined' && firebase.firestore && firebase.firestore.FieldValue) {
    var del = {};
    reports.common.removedKeys.forEach(function(k) {
      del['common.items.' + k] = firebase.firestore.FieldValue.delete();
      del['common.hiddenItems.' + k] = firebase.firestore.FieldValue.delete();
    });
    Object.keys(reports.personal).forEach(function(uid) {
      reports.personal[uid].removedKeys.forEach(function(k) {
        del['personal.' + uid + '.items.' + k] = firebase.firestore.FieldValue.delete();
        del['personal.' + uid + '.hiddenItems.' + k] = firebase.firestore.FieldValue.delete();
      });
    });
    if (Object.keys(del).length) ref.update(del).catch(function(e) { console.log('medkit legacy cleanup error:', e); });
  }
  rMedkit();
  return reports;
}

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
  if (mode === 'common') return medkitState.common;
  if (!medkitState.personal[memberId]) {
    medkitState.personal[memberId] = createEmptyMedkitState();
  }
  return medkitState.personal[memberId];
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

function getMedkitProgress(mode, memberId) {
  var total = 0;
  var done = 0;
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];
    if (!isGroupEnabled(mode, memberId, group.id)) continue;
    if (isGroupHidden(mode, memberId, group.id)) continue;
    for (var i = 0; i < group.items.length; i++) {
      var item = group.items[i];
      if (isItemHidden(mode, memberId, item.id)) continue;
      total++;
      if (getMedkitItem(mode, memberId, item.id).checked) done++;
    }
  }
  var state = getMedkitState(mode, memberId);
  for (var c = 0; c < state.customItems.length; c++) {
    var ci = state.customItems[c];
    if (isItemHidden(mode, memberId, ci.id)) continue;
    total++;
    if (getMedkitItem(mode, memberId, ci.id).checked) done++;
  }
  return {
    total: total,
    done: done,
    pct: total ? Math.round(done / total * 100) : 0
  };
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
  try { localRaw = JSON.parse(localStorage.getItem('medkit_next') || 'null'); } catch(e) {}

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
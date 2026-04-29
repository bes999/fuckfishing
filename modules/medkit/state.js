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
    return !!getMedkitState(mode, memberId).enabledGroups[groupId];
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
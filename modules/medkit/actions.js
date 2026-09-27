/* ===== MEDKIT ACTIONS ===== */

// --- Личную аптечку может менять только её владелец ---
// Раньше любой участник, переключившись на чужого человека в свитчере
// "Личная", мог отмечать ему препараты как принятые, включать/выключать
// категории и т.п. — свитчер задуман для ПРОСМОТРА (что у товарища есть на
// экстренный случай), а не для правки чужого мед. списка. "Общая" (mode
// !== 'personal') — по-прежнему общая для всех, тут ничего не меняется.
function _canEditMedkit(mode, memberId) {
  if (mode !== 'personal') return true;
  return !!window.APP && !!window.APP.user && window.APP.user.uid === memberId;
}

// --- После правки поля в листе препарата ---
// Строка в списке, счётчики и фильтр «Требуют внимания» зависят от
// остатка/срока — проще перерисовать страницу (лист живёт отдельно в
// body и не затрагивается), а в самом листе обновить только плашку
// статуса, галочку и единицы, не трогая поле, в котором печатают.
function updateMedkitMeta(mode, memberId, itemId) {
  rMedkit();
  _mkSyncSheet(false);
}

// --- Чекбокс ---
function toggleMedkitItem(mode, memberId, itemId, event) {
  if (event) event.stopPropagation();
  if (mode === 'personal' && !memberId) return;
  if (!_canEditMedkit(mode, memberId)) return;
  var item = getMedkitItem(mode, memberId, itemId);
  item.checked = !item.checked;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

// --- Поля карточки ---
function updateMedkitTotal(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).total = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitLeft(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).left = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitUnit(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).unit = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitDose(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).dose = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitExpiry(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).expiry = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitSlot(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  if (val && !validateSlot(mode, val)) return;
  getMedkitItem(mode, memberId, itemId).slot = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitNote(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).note = val;
  saveMedkit();
}

function updateMedkitSlotTime(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).slot_time = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitHow(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).how = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

// --- Трекер приёма БАДов ---
function toggleMedkitTakenDay(mode, memberId, itemId, dayKey, event) {
  if (event) event.stopPropagation();
  if (!_canEditMedkit(mode, memberId)) return;
  var item = getMedkitItem(mode, memberId, itemId);
  if (!item.taken) item.taken = {};
  item.taken[dayKey] = !item.taken[dayKey];
  saveMedkit();
  rMedkit();
}

// --- Скрыть / показать препарат ---
function hideMedkitItem(mode, memberId, itemId, event) {
  if (event) event.stopPropagation();
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitState(mode, memberId).hiddenItems[itemId] = true;
  saveMedkit();
  rMedkit();
}

function restoreMedkitItem(mode, memberId, itemId) {
  if (!_canEditMedkit(mode, memberId)) return;
  // false, а не delete: set({merge:true}) не удаляет ключи вложенных карт,
  // и удалённый ключ после перезагрузки «воскресал» из Firestore.
  getMedkitState(mode, memberId).hiddenItems[itemId] = false;
  saveMedkit();
  rMedkit();
}

// --- Скрыть / показать группу ---
function hideMedkitGroup(mode, memberId, groupId, event) {
  if (event) event.stopPropagation();
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitState(mode, memberId).hiddenGroups[groupId] = true;
  saveMedkit();
  rMedkit();
}

function restoreMedkitGroup(mode, memberId, groupId) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitState(mode, memberId).hiddenGroups[groupId] = false; // см. restoreMedkitItem
  saveMedkit();
  rMedkit();
}

// --- Включить опциональную группу ---
function enableMedkitGroup(mode, memberId, groupId) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitState(mode, memberId).enabledGroups[groupId] = true;
  saveMedkit();
  rMedkit();
}

function disableMedkitGroup(mode, memberId, groupId) {
  if (!_canEditMedkit(mode, memberId)) return;
  // false — явное «выключено» (см. isGroupEnabled в state.js).
  getMedkitState(mode, memberId).enabledGroups[groupId] = false;
  saveMedkit();
  rMedkit();
}

// --- Добавить препарат вручную ---
function addMedkitCustomItem(mode, memberId, groupId, name) {
  if (!name || !name.trim()) return;
  if (!_canEditMedkit(mode, memberId)) return;
  var state = getMedkitState(mode, memberId);
  var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  state.customItems.push({
    id: id,
    name: name.trim(),
    groupId: groupId,
    custom: true
  });
  saveMedkit();
  rMedkit();
}

// --- Удалить кастомный препарат ---
function deleteMedkitCustomItem(mode, memberId, itemId, event) {
  if (event) event.stopPropagation();
  if (!_canEditMedkit(mode, memberId)) return;
  var state = getMedkitState(mode, memberId);
  state.customItems = state.customItems.filter(function(i) {
    return i.id !== itemId;
  });
  delete state.hiddenItems[itemId];
  delete state.items[itemId];
  saveMedkit();
  rMedkit();
}

// --- Места хранения ---
function addMedkitSlot(mode, label) {
  var slot = addCustomSlot(mode, label);
  if (!slot) return;
  saveMedkit();
  rMedkit();
}

function removeMedkitSlot(mode, slotId) {
  deleteCustomSlot(mode, slotId);
  saveMedkit();
  rMedkit();
}

// --- Переключение режима ---
function setMedkitMode(mode) {
  medkitMode = mode;
  medkitFilters.search = '';
  medkitFilters.status = '';
  // Личная по умолчанию — своя (раньше подставлялся 'default', и своя
  // аптечка открывалась как чужая, только для просмотра).
  if (mode === 'personal' && (!medkitMemberId || medkitMemberId === 'default')) {
    medkitMemberId = (window.APP && window.APP.user && window.APP.user.uid) || 'default';
  }
  rMedkit();
}

function setMedkitMember(memberId) {
  medkitMemberId = memberId;
  rMedkit();
}

function setMedkitViewMode(viewMode) {
  medkitViewMode = viewMode;
  rMedkit();
}

// --- Тогл группы ---
function toggleMedkitGroupCollapse(groupId) {
  toggleGroupOpen(groupId);
  var group = document.querySelector('#p-medkit [data-group="' + groupId + '"]');
  if (!group) return;
  var open = group.classList.toggle('open');
  var hd = group.querySelector('.mk-group-hd');
  if (hd) hd.setAttribute('aria-expanded', open);
  var chev = group.querySelector('.mk-group-chev');
  if (chev) { chev.classList.toggle('ti-chevron-up', open); chev.classList.toggle('ti-chevron-down', !open); }
}

function toggleMedkitAddRow(groupId) {
  var form = document.getElementById('addDrugForm_' + groupId);
  var input = document.getElementById('addDrugInput_' + groupId);
  if (!form) return;
  if (form.classList.toggle('show') && input) input.focus();
}

// Поиск: фильтр + перерисовка с сохранением фокуса. Раскрытие категорий
// с совпадениями делает сам рендер (не трогая сохранённое medkitOpenGroups).
var medkitSearchTimer = null;

function medkitSearchInput(val) {
  medkitFilters.search = val;
  clearTimeout(medkitSearchTimer);
  medkitSearchTimer = setTimeout(function() {
    var pos = document.getElementById('medkitSearchInput');
    var cursorPos = pos ? pos.selectionStart : 0;
    rMedkit();
    var inp = document.getElementById('medkitSearchInput');
    if (inp) {
      inp.focus();
      inp.setSelectionRange(cursorPos, cursorPos);
    }
  }, 200);
}

function toggleMedkitStack() {
  medkitStackCollapsed = !medkitStackCollapsed;
  try { localStorage.setItem('medkit_stack_collapsed', medkitStackCollapsed); } catch(e) {}
  var el = document.querySelector('#p-medkit .mk-stack');
  if (!el) return;
  el.classList.toggle('open', !medkitStackCollapsed);
  var hd = el.querySelector('.mk-stack-hd');
  if (hd) hd.setAttribute('aria-expanded', !medkitStackCollapsed);
}

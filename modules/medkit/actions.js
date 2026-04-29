/* ===== MEDKIT ACTIONS ===== */

// --- Обновление мета-строки препарата без перерисовки ---
function updateMedkitMeta(mode, memberId, itemId) {
  var itemState = getMedkitItem(mode, memberId, itemId);
  var status = getMedkitItemStatus(itemState);
  var color = getMedkitItemColor(status);
  var statusLabel = getMedkitStatusLabel(status);
  var slot = itemState.slot ? getSlotById(mode, itemState.slot) : null;

  var leftInfo = '';
  if (itemState.left && itemState.unit) {
    leftInfo = itemState.left + ' ' + itemState.unit;
    if (itemState.dose) {
      var servings = Math.floor(parseFloat(itemState.left) / parseFloat(itemState.dose));
      if (!isNaN(servings)) leftInfo += ' · ~' + servings + ' приём';
    }
  }

  var drugs = document.querySelectorAll('.drug');
  for (var i = 0; i < drugs.length; i++) {
    var cc = drugs[i].querySelector('.cc');
    if (!cc) continue;
    var onclickAttr = cc.getAttribute('onclick') || '';
    if (onclickAttr.indexOf(itemId) < 0) continue;

    var meta = drugs[i].querySelector('.drug-meta');
    if (meta) {
      var h = '<span class="mt">' + (slot ? slot.label : 'Не указано') + '</span>';
      if (leftInfo) {
        var mtClass = color === 'warn' ? ' warn' : color === 'danger' ? ' danger' : '';
        h += '<span class="mt' + mtClass + '">' + leftInfo + '</span>';
      }
      if (itemState.expiry) {
        var expiryClass = (status.expiry === 'expired' || status.expiry === 'critical') ? ' danger' : '';
        h += '<span class="mt' + expiryClass + '">срок ' + itemState.expiry + '</span>';
      }
      meta.innerHTML = h;
    }

    var right = drugs[i].querySelector('.drug-right');
    if (right) {
      var hideBtn = right.querySelector('.hide-btn');
      var hideBtnHtml = hideBtn ? hideBtn.outerHTML : '';
      right.innerHTML = (statusLabel ? '<span class="sp sp-' + color + '">' + statusLabel + '</span>' : '') + hideBtnHtml;
    }

    drugs[i].className = 'drug' + (color === 'danger' ? ' d' : color === 'warn' ? ' w' : '');
    break;
  }
}

// --- Обновление прогресс-бара ---
function updateMedkitProgressBar(mode, memberId) {
  var progress = getMedkitProgress(mode, memberId);
  var pctEl = document.querySelector('.prog-pct');
  if (pctEl) pctEl.textContent = progress.done + ' / ' + progress.total;
  var barEl = document.querySelector('.bar-fill');
  if (barEl) barEl.style.width = progress.pct + '%';
  var tb2El = document.querySelector('.tb2');
  if (tb2El) tb2El.textContent = (mode === 'common' ? 'Общая' : 'Личная — ' + getMemberName(memberId)) + ' · ' + progress.done + ' / ' + progress.total;
}

// --- Чекбокс ---
function toggleMedkitItem(mode, memberId, itemId, event) {
  if (event) event.stopPropagation();
  if (mode === 'personal' && !memberId) return;
  var item = getMedkitItem(mode, memberId, itemId);
  item.checked = !item.checked;
  saveMedkit();

  // если вид по местам — перерисовываем
  if (medkitViewMode === 'slots') {
    rMedkit();
    return;
  }

  updateMedkitProgressBar(mode, memberId);

  var drugs = document.querySelectorAll('.drug');
  for (var i = 0; i < drugs.length; i++) {
    var cc = drugs[i].querySelector('.cc');
    if (!cc) continue;
    var onclickAttr = cc.getAttribute('onclick') || '';
    if (onclickAttr.indexOf(itemId) < 0) continue;
    if (item.checked) {
      cc.classList.add('done');
      cc.innerHTML = '<svg viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>';
    } else {
      cc.classList.remove('done');
      cc.innerHTML = '';
    }
    break;
  }
}

// --- Поля карточки ---
function updateMedkitTotal(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).total = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitLeft(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).left = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitUnit(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).unit = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitDose(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).dose = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitExpiry(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).expiry = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitSlot(mode, memberId, itemId, val) {
  if (val && !validateSlot(mode, val)) return;
  getMedkitItem(mode, memberId, itemId).slot = val;
  saveMedkit();
  updateMedkitMeta(mode, memberId, itemId);
}

function updateMedkitNote(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).note = val;
  saveMedkit();
}

function updateMedkitSlotTime(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).slot_time = val;
  saveMedkit();
}

function updateMedkitHow(mode, memberId, itemId, val) {
  getMedkitItem(mode, memberId, itemId).how = val;
  saveMedkit();
}

// --- Трекер приёма БАДов ---
function toggleMedkitTakenDay(mode, memberId, itemId, dayKey, event) {
  if (event) event.stopPropagation();
  var item = getMedkitItem(mode, memberId, itemId);
  if (!item.taken) item.taken = {};
  item.taken[dayKey] = !item.taken[dayKey];
  saveMedkit();
  rMedkit();
}

// --- Скрыть / показать препарат ---
function hideMedkitItem(mode, memberId, itemId, event) {
  if (event) event.stopPropagation();
  getMedkitState(mode, memberId).hiddenItems[itemId] = true;
  saveMedkit();
  rMedkit();
}

function restoreMedkitItem(mode, memberId, itemId) {
  delete getMedkitState(mode, memberId).hiddenItems[itemId];
  saveMedkit();
  rMedkit();
}

// --- Скрыть / показать группу ---
function hideMedkitGroup(mode, memberId, groupId, event) {
  if (event) event.stopPropagation();
  getMedkitState(mode, memberId).hiddenGroups[groupId] = true;
  saveMedkit();
  rMedkit();
}

function restoreMedkitGroup(mode, memberId, groupId) {
  delete getMedkitState(mode, memberId).hiddenGroups[groupId];
  saveMedkit();
  rMedkit();
}

// --- Включить опциональную группу ---
function enableMedkitGroup(mode, memberId, groupId) {
  getMedkitState(mode, memberId).enabledGroups[groupId] = true;
  saveMedkit();
  rMedkit();
}

function disableMedkitGroup(mode, memberId, groupId) {
  delete getMedkitState(mode, memberId).enabledGroups[groupId];
  saveMedkit();
  rMedkit();
}

// --- Добавить препарат вручную ---
function addMedkitCustomItem(mode, memberId, groupId, name) {
  if (!name || !name.trim()) return;
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
  medkitPreSearchOpenGroups = null;
  if (mode === 'personal') {
    if (!medkitMemberId) medkitMemberId = 'default';
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
  var group = document.querySelector('[data-group="' + groupId + '"]');
  if (!group) return;
  if (isGroupOpen(groupId)) {
    group.classList.remove('collapsed');
  } else {
    group.classList.add('collapsed');
  }
}

function toggleMedkitAddRow(groupId) {
  // если группа свёрнута — раскрываем её
  if (!isGroupOpen(groupId)) {
    toggleMedkitGroupCollapse(groupId);
  }

  var form = document.getElementById('addDrugForm_' + groupId);
  var input = document.getElementById('addDrugInput_' + groupId);
  if (!form) return;
  if (form.classList.contains('show')) {
    form.classList.remove('show');
  } else {
    form.classList.add('show');
    if (input) input.focus();
  }
}
var medkitSearchTimer = null;
var medkitPreSearchOpenGroups = null;

function medkitSearchInput(val) {
  medkitFilters.search = val;
  clearTimeout(medkitSearchTimer);
  medkitSearchTimer = setTimeout(function() {

    if (val) {
      // сохраняем состояние групп до поиска
      if (!medkitPreSearchOpenGroups) {
        medkitPreSearchOpenGroups = JSON.parse(JSON.stringify(medkitOpenGroups));
      }
      // раскрываем только группы где есть результат
      for (var g = 0; g < MEDKIT_BASE.length; g++) {
        var group = MEDKIT_BASE[g];
        var found = false;
        for (var i = 0; i < group.items.length; i++) {
          if (group.items[i].name.toLowerCase().indexOf(val.toLowerCase()) >= 0) {
            found = true;
            break;
          }
        }
        // проверяем кастомные
        var state = getMedkitState(medkitMode, medkitMemberId);
        for (var c = 0; c < state.customItems.length; c++) {
          if (state.customItems[c].groupId === group.id &&
              state.customItems[c].name.toLowerCase().indexOf(val.toLowerCase()) >= 0) {
            found = true;
            break;
          }
        }
        medkitOpenGroups[group.id] = found;
      }
    } else {
      // поиск очищен — восстанавливаем состояние до поиска
      if (medkitPreSearchOpenGroups !== null) {
        medkitOpenGroups = medkitPreSearchOpenGroups;
        medkitPreSearchOpenGroups = null;
      }
    }

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
  var body = document.querySelector('.stack-body');
  var arrow = document.querySelector('.stack-hd .stack-arrow');
  if (body) body.style.display = medkitStackCollapsed ? 'none' : 'block';
  if (arrow) arrow.style.transform = medkitStackCollapsed ? '' : 'rotate(90deg)';
}
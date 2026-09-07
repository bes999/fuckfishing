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

// --- Обновление мета-строки препарата без перерисовки ---
// Строка (.dl) и статус-угол (.drug-right) собираются тем же способом, что
// и в rMedkitDrugItem — держать в двух местах identично важно, иначе после
// правки поля в открытой карточке шеврон/статус в шапке разъедутся с тем,
// что реально в состоянии.
function updateMedkitMeta(mode, memberId, itemId) {
  var itemState = getMedkitItem(mode, memberId, itemId);
  var status = getMedkitItemStatus(itemState);
  var color = getMedkitItemColor(status);
  var statusLabel = getMedkitStatusLabel(status);
  var slot = itemState.slot ? getSlotById(mode, itemState.slot) : null;
  var info = MEDKIT_INFO[itemId] || null;

  var leftInfo = '';
  if (itemState.left && itemState.unit) {
    leftInfo = itemState.left + ' ' + itemState.unit;
    var doseNum = parseFloat(itemState.dose);
    if (itemState.dose && !isNaN(doseNum) && doseNum > 0) {
      var servings = Math.floor(parseFloat(itemState.left) / doseNum);
      if (!isNaN(servings) && isFinite(servings)) leftInfo += ' · ~' + servings + ' приём';
    }
  }

  var drugs = document.querySelectorAll('.drug');
  for (var i = 0; i < drugs.length; i++) {
    var cc = drugs[i].querySelector('.cc');
    if (!cc) continue;
    var onclickAttr = cc.getAttribute('onclick') || '';
    if (onclickAttr.indexOf(itemId) < 0) continue;

    var dl = drugs[i].querySelector('.dl');
    if (dl) {
      var bits = [];
      if (info && info.label) bits.push('<span>' + info.label + '</span>');
      bits.push('<span' + (slot ? '' : ' class="muted"') + '>' + (slot ? slot.label : 'не указано') + '</span>');
      if (leftInfo) {
        var mtClass = color === 'warn' ? ' class="warn"' : color === 'danger' ? ' class="danger"' : '';
        bits.push('<span' + mtClass + '>' + leftInfo + '</span>');
      }
      if (itemState.expiry) {
        var expiryClass = (status.expiry === 'expired' || status.expiry === 'critical') ? ' class="danger"' : '';
        bits.push('<span' + expiryClass + '>срок ' + itemState.expiry + '</span>');
      }
      dl.innerHTML = bits.join('<span class="dl-sep">·</span>');
    }

    var wasOpen = isDrugCardOpen(itemId);
    var right = drugs[i].querySelector('.drug-right');
    if (right) {
      var hideBtn = right.querySelector('.hide-btn');
      var hideBtnHtml = hideBtn ? hideBtn.outerHTML : '';
      var chevHtml = '<i class="ti ti-chevron-' + (wasOpen ? 'down' : 'right') + ' chev" aria-hidden="true" onclick="toggleMedkitDrugCard(\'' + itemId + '\')"></i>';
      right.innerHTML = (statusLabel ? '<span class="sp sp-' + color + '">' + statusLabel + '</span>' : '') + hideBtnHtml + chevHtml;
    }

    drugs[i].className = 'drug' + (color === 'danger' ? ' d' : color === 'warn' ? ' w' : '') + (wasOpen ? ' card-open' : '');
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
  if (!_canEditMedkit(mode, memberId)) return;
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
}

function updateMedkitHow(mode, memberId, itemId, val) {
  if (!_canEditMedkit(mode, memberId)) return;
  getMedkitItem(mode, memberId, itemId).how = val;
  saveMedkit();
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
  delete getMedkitState(mode, memberId).hiddenItems[itemId];
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
  delete getMedkitState(mode, memberId).hiddenGroups[groupId];
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
  delete getMedkitState(mode, memberId).enabledGroups[groupId];
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

function toggleMedkitDrugCard(itemId) {
  var key = _drugStateKey(itemId);
  medkitOpenDrugCards[key] = !medkitOpenDrugCards[key];
  var el = document.querySelector('[data-drug="' + itemId + '"]');
  if (!el) return;
  var open = isDrugCardOpen(itemId);
  el.classList.toggle('card-open', open);
  var chev = el.querySelector('.drug-right .chev');
  if (chev) { chev.classList.toggle('ti-chevron-down', open); chev.classList.toggle('ti-chevron-right', !open); }
}

function toggleMedkitDrugInfo(itemId, event) {
  if (event) event.stopPropagation();
  var key = _drugStateKey(itemId);
  medkitOpenDrugInfo[key] = !medkitOpenDrugInfo[key];
  var card = document.querySelector('[data-drug="' + itemId + '"] .drug-card');
  if (!card) return;
  var open = isDrugInfoOpen(itemId);
  card.classList.toggle('info-open', open);
  var chev = card.querySelector('.info-toggle .ti');
  if (chev) { chev.classList.toggle('ti-chevron-down', open); chev.classList.toggle('ti-chevron-right', !open); }
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
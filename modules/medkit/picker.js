/* ===== MEDKIT CATEGORY PICKER ===== */
// Шит с чекбоксами "какие категории вести у себя" — раньше подключить
// категорию можно было только по одной, кнопкой "подключить" в каждой
// строке отдельно. Этим удобнее сразу настроить свою личную аптечку с
// нуля. Только для своей аптечки (см. _canEditMedkit в actions.js) — на
// чужую не открывается вообще.

function showMedkitCategoryPicker() {
  if (medkitMode !== 'personal') return;
  if (!_canEditMedkit(medkitMode, medkitMemberId)) return;
  document.getElementById('mkPickerOverlay')?.remove();

  var overlay = document.createElement('div');
  overlay.className = 'mk-import-overlay';
  overlay.id = 'mkPickerOverlay';
  overlay.innerHTML = _mkPickerSheetHtml();
  document.body.appendChild(overlay);

  requestAnimationFrame(function() { overlay.classList.add('open'); });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeMedkitCategoryPicker();
  });
}

function closeMedkitCategoryPicker() {
  var overlay = document.getElementById('mkPickerOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function() { overlay.remove(); }, 250);
}

function _mkPickerSheetHtml() {
  var memberId = medkitMemberId;
  var rows = '';
  for (var i = 0; i < MEDKIT_BASE.length; i++) {
    var group = MEDKIT_BASE[i];
    if (group.availableIn.indexOf('personal') < 0) continue;
    var checked = isGroupEnabled('personal', memberId, group.id);
    rows += '<label class="mk-pick-row">' +
      '<input type="checkbox" class="mk-pick-check" data-group="' + group.id + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="mk-pick-icon">' + escHtml(group.icon) + '</span>' +
      '<span class="mk-pick-label">' + escHtml(group.label) + '</span>' +
      '</label>';
  }
  return '' +
    '<div class="mk-import-sheet">' +
      '<div class="mk-import-sheet__handle"></div>' +
      '<div class="mk-import-sheet__head">' +
        '<span class="mk-import-sheet__title">Какие категории вести?</span>' +
        '<button class="mk-import-sheet__close" onclick="closeMedkitCategoryPicker()">✕</button>' +
      '</div>' +
      '<div class="mk-pick-hint">Отметь, что у тебя реально есть — остальное не будет мозолить глаза. Подключить ещё что-то потом можно через 👁 в списке.</div>' +
      '<div class="mk-pick-list">' + rows + '</div>' +
      '<button class="mk-pick-save" onclick="saveMedkitCategoryPicker()">Готово</button>' +
    '</div>';
}

function saveMedkitCategoryPicker() {
  var memberId = medkitMemberId;
  if (!_canEditMedkit('personal', memberId)) { closeMedkitCategoryPicker(); return; }
  var checks = document.querySelectorAll('.mk-pick-check');
  var state = getMedkitState('personal', memberId);
  for (var i = 0; i < checks.length; i++) {
    var groupId = checks[i].dataset.group;
    if (checks[i].checked) state.enabledGroups[groupId] = true;
    else delete state.enabledGroups[groupId];
  }
  saveMedkit();
  closeMedkitCategoryPicker();
  rMedkit();
}

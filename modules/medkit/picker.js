/* ===== MEDKIT CATEGORY PICKER ===== */
// Лист «Мои категории» (личная) / «Категории» (общая) из «…» — макет
// V2MedkitCats. Переключатель = «показывать категорию»: у опциональных
// категорий он включает/выключает (enabledGroups), у обязательных —
// скрывает/возвращает (hiddenGroups). Отметки при выключении не теряются.
// Правка применяется сразу, без кнопки «Готово». Чужую аптечку не
// открывает (_canEditMedkit).

function showMedkitCategoryPicker() {
  if (medkitMode === 'reference') return;
  if (!_canEditMedkit(medkitMode, medkitMemberId)) return;
  document.getElementById('mkPickerOverlay')?.remove();

  var overlay = document.createElement('div');
  overlay.className = 'mk-import-overlay';
  overlay.id = 'mkPickerOverlay';
  overlay.innerHTML = '<div class="mk-import-sheet" id="mkPickerSheet"></div>';
  document.body.appendChild(overlay);
  _mkRefreshPicker();
  UIUtils.swipeToDelete(overlay, '.mk-swipe', '.mk-del');

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

function _mkCategoryOn(mode, memberId, group) {
  return isGroupEnabled(mode, memberId, group.id) && !isGroupHidden(mode, memberId, group.id);
}

function toggleMedkitCategory(groupId) {
  var mode = medkitMode, memberId = medkitMemberId;
  if (!_canEditMedkit(mode, memberId)) return;
  var group = MEDKIT_BASE.filter(function(g) { return g.id === groupId; })[0];
  if (!group) return;
  var state = getMedkitState(mode, memberId);
  var optional = (mode === 'personal' && group.personalOptional) || (mode === 'common' && group.commonOptional);
  if (_mkCategoryOn(mode, memberId, group)) {
    if (optional) state.enabledGroups[groupId] = false;
    else state.hiddenGroups[groupId] = true;
  } else {
    if (optional) state.enabledGroups[groupId] = true;
    state.hiddenGroups[groupId] = false;
  }
  saveMedkit();
  rMedkit();
  _mkRefreshPicker();
}

function _mkRefreshPicker() {
  var sheet = document.getElementById('mkPickerSheet');
  if (!sheet) return;
  var mode = medkitMode, memberId = medkitMemberId;
  var state = getMedkitState(mode, memberId);
  var total = 0, on = 0;
  var rows = '';
  MEDKIT_BASE.forEach(function(g) {
    if (g.availableIn.indexOf(mode) < 0) return;
    total++;
    var isOn = _mkCategoryOn(mode, memberId, g);
    if (isOn) on++;
    var n = g.items.length + state.customItems.filter(function(ci) { return ci.groupId === g.id; }).length;
    var sub = n + ' ' + _mkPlural(n, 'препарат', 'препарата', 'препаратов') + (g.id === 'supplements' ? ' · со стеком приёма' : '') + (g.custom ? ' · своя' : '');
    rows += '<button type="button" class="mk-sw-row" role="switch" aria-checked="' + isOn + '" onclick="toggleMedkitCategory(\'' + g.id + '\')">'
      + '<span class="mk-line-t">' + escHtml(g.label) + '<small>' + sub + '</small></span><span class="mk-sw' + (isOn ? ' on' : '') + '"><span></span></span></button>';
  });
  var hid = _mkHiddenLists(mode, memberId);
  sheet.innerHTML = '<div class="mk-import-sheet__handle"></div>'
    + '<div class="mk-sheet-head"><div class="mk-sheet-head-l"><h2 class="mk-sheet-title">' + (mode === 'personal' ? 'Мои категории' : 'Категории') + '</h2>'
    + '<span class="mk-sheet-sub">' + (mode === 'personal' ? 'что показывать в личной аптечке' : 'что показывать в общей аптечке') + '</span></div>'
    + '<button type="button" class="mk-sheet-x" aria-label="Закрыть" onclick="closeMedkitCategoryPicker()">' + UIUtils.ico('x') + '</button></div>'
    + '<div class="mk-sheet-body"><div class="mk-list">' + rows + '</div>'
    + '<p class="mk-hint">' + (on === total ? 'Включены все ' + total + '.' : 'Включено ' + on + ' из ' + total + '.') + ' Выключенная категория не удаляется — отметки сохранятся.</p>'
    + '<div class="mk-caps">Скрытые препараты</div>'
    + (hid.items.length ? '<div class="mk-list">' + _mkHiddenItemsHtml(mode, memberId, hid.items) + '</div>' : '<p class="mk-hint">нет</p>')
    + '<button type="button" class="mk-text-btn accent" onclick="showAddMedkitGroup()">+ Своя категория</button></div>';
}

// Совместимость: раньше лист сохранялся кнопкой «Готово».
function saveMedkitCategoryPicker() {
  closeMedkitCategoryPicker();
}

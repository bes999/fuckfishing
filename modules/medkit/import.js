/* ===== MEDKIT IMPORT ===== */

// --- UI: модалка импорта с тремя сценариями ---
var _mkImportTab = 'base';

function showMedkitImport() {
  if (medkitMode === 'reference') return;
  _mkImportTab = 'base';
  document.getElementById('mkImportOverlay')?.remove();

  var overlay = document.createElement('div');
  overlay.className = 'mk-import-overlay';
  overlay.id = 'mkImportOverlay';
  overlay.innerHTML = _mkImportSheetHtml();
  document.body.appendChild(overlay);

  requestAnimationFrame(function() { overlay.classList.add('open'); });
  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeMedkitImport();
  });
}

function closeMedkitImport() {
  var overlay = document.getElementById('mkImportOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function() { overlay.remove(); }, 250);
}

function setMkImportTab(tab) {
  _mkImportTab = tab;
  var overlay = document.getElementById('mkImportOverlay');
  if (overlay) overlay.innerHTML = _mkImportSheetHtml();
}

function _mkImportSheetHtml() {
  var tabs = [
    { id: 'base',   label: 'Шаблон' },
    { id: 'member', label: 'Участник' },
    { id: 'text',   label: 'Текст' }
  ];
  var tabsHtml = tabs.map(function(t) {
    return '<div class="mk-import-tab' + (t.id === _mkImportTab ? ' active' : '') + '" onclick="setMkImportTab(\'' + t.id + '\')">' + t.label + '</div>';
  }).join('');

  return '' +
    '<div class="mk-import-sheet">' +
      '<div class="mk-import-sheet__handle"></div>' +
      '<div class="mk-import-sheet__head">' +
        '<span class="mk-import-sheet__title">Импорт</span>' +
        '<button class="mk-import-sheet__close" onclick="closeMedkitImport()">✕</button>' +
      '</div>' +
      '<div class="mk-import-tabs">' + tabsHtml + '</div>' +
      '<div class="mk-import-body" id="mkImportBody">' + _renderMkImportBody() + '</div>' +
    '</div>';
}

function _renderMkImportBody() {
  if (_mkImportTab === 'member') return _renderMkImportMember();
  if (_mkImportTab === 'text')   return _renderMkImportText();
  return _renderMkImportBase();
}

function _renderMkImportBase() {
  var targetLabel = medkitMode === 'personal'
    ? 'личную аптечку — ' + escHtml(getMemberName(medkitMemberId))
    : 'общую аптечку';
  return '' +
    '<div class="mk-import-hint">Заполнит ' + targetLabel + ' стандартным набором препаратов. Уже добавленные позиции не изменятся.</div>' +
    '<button class="mk-import-btn" onclick="runMkImportFromBase()">Заполнить из шаблона</button>';
}

function _renderMkImportMember() {
  if (medkitMode !== 'personal') {
    return '<div class="mk-import-hint">Доступно только в разделе «Личная» — сначала выбери участника наверху.</div>';
  }
  var members = _getMedkitMembers().filter(function(m) {
    return m.isActive !== false && m.uid !== medkitMemberId;
  });
  if (!members.length) {
    return '<div class="mk-import-hint">Нет других участников, с чьей аптечки можно скопировать.</div>';
  }
  var opts = members.map(function(m) {
    return '<option value="' + m.uid + '">' + escHtml(m.displayName || 'Участник') + '</option>';
  }).join('');
  return '' +
    '<div class="mk-import-hint">Скопирует весь личный список препаратов выбранного участника в личную аптечку — ' + escHtml(getMemberName(medkitMemberId)) + '. Текущий список будет заменён.</div>' +
    '<select class="mk-import-select" id="mkImportFromMember">' + opts + '</select>' +
    '<button class="mk-import-btn" onclick="runMkImportFromMember()">Скопировать</button>';
}

function _renderMkImportText() {
  var groups = MEDKIT_BASE.filter(function(g) { return g.availableIn.indexOf(medkitMode) >= 0; });
  var opts = groups.map(function(g) {
    return '<option value="' + g.id + '">' + escHtml(g.label) + '</option>';
  }).join('') + '<option value="custom">Другое</option>';
  return '' +
    '<div class="mk-import-hint">Вставь список — по одному препарату на строке. Уже существующие по названию пропустятся.</div>' +
    '<select class="mk-import-select" id="mkImportTextGroup">' + opts + '</select>' +
    '<textarea class="mk-import-textarea" id="mkImportTextArea" placeholder="Ибупрофен&#10;Активированный уголь&#10;..." oninput="_mkImportTextPreview()"></textarea>' +
    '<div class="mk-import-preview" id="mkImportPreview"></div>' +
    '<button class="mk-import-btn" onclick="runMkImportFromText()">Добавить</button>';
}

function _mkImportTextPreview() {
  var ta = document.getElementById('mkImportTextArea');
  var preview = document.getElementById('mkImportPreview');
  if (!ta || !preview) return;
  if (!ta.value.trim()) { preview.textContent = ''; return; }
  var result = previewImportFromText(ta.value, medkitMode, medkitMemberId);
  preview.textContent = '+' + result.added + ' новых' + (result.skipped ? ', ' + result.skipped + ' уже есть' : '');
}

function runMkImportFromBase() {
  importFromBase(medkitMode, medkitMemberId);
  closeMedkitImport();
}

function runMkImportFromMember() {
  var sel = document.getElementById('mkImportFromMember');
  var fromId = sel && sel.value;
  if (!fromId) return;
  var fromName = getMemberName(fromId);
  var toName   = getMemberName(medkitMemberId);
  UIUtils.confirmSheet(
    'Личный список «' + toName + '» будет заменён списком «' + fromName + '». Отменить это будет нельзя.',
    { title: 'Скопировать аптечку?', okLabel: 'Скопировать', danger: true }
  ).then(function(ok) {
    if (!ok) return;
    importFromMember(fromId, medkitMemberId);
    closeMedkitImport();
  });
}

function runMkImportFromText() {
  var ta = document.getElementById('mkImportTextArea');
  var groupSel = document.getElementById('mkImportTextGroup');
  var text = ta ? ta.value : '';
  var groupId = groupSel ? groupSel.value : 'custom';
  var result = importFromText(text, medkitMode, medkitMemberId, groupId);
  closeMedkitImport();
  if (result.added || result.skipped) {
    alert('Добавлено: ' + result.added + (result.skipped ? ', пропущено (уже есть): ' + result.skipped : ''));
  }
}

// --- Сценарий 1: из базового шаблона ---
function importFromBase(mode, memberId) {
  var state = getMedkitState(mode, memberId);

  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];

    // пропускаем если группа не доступна в этом режиме
    if (group.availableIn.indexOf(mode) < 0) continue;

    // пропускаем опциональные — пусть пользователь включает сам
    // FIX: проверяем optional-флаг соответствующий текущему режиму
    if (mode === 'personal' && group.personalOptional) continue;
    if (mode === 'common' && group.commonOptional) continue;

    for (var i = 0; i < group.items.length; i++) {
      var item = group.items[i];
      // не трогаем уже существующие
      if (!state.items[item.id]) {
        state.items[item.id] = {
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
    }
  }

  saveMedkit();
  rMedkit();
}

// --- Сценарий 2: от другого участника ---
function importFromMember(fromMemberId, toMemberId) {
  if (!fromMemberId || !toMemberId) return;
  if (fromMemberId === toMemberId) return;

  var source = getMedkitState('personal', fromMemberId);
  var target = getMedkitState('personal', toMemberId);

  // копируем items глубоко
  target.items = JSON.parse(JSON.stringify(source.items));

  // кастомные препараты тоже копируем
  target.customItems = JSON.parse(JSON.stringify(source.customItems));

  // hiddenItems и hiddenGroups не копируем — личные настройки
  // enabledGroups копируем — чтобы те же разделы были включены
  target.enabledGroups = JSON.parse(JSON.stringify(source.enabledGroups));

  saveMedkit();
  rMedkit();
}

// --- Сценарий 3: из текста ---
function importFromText(text, mode, memberId, groupId) {
  if (!text || !text.trim()) return { added: 0, skipped: 0, items: [] };

  var lines = text.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(Boolean);

  var state = getMedkitState(mode, memberId);
  var existingNames = [];

  // собираем уже существующие названия
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    for (var i = 0; i < MEDKIT_BASE[g].items.length; i++) {
      existingNames.push(MEDKIT_BASE[g].items[i].name.toLowerCase());
    }
  }
  for (var c = 0; c < state.customItems.length; c++) {
    existingNames.push(state.customItems[c].name.toLowerCase());
  }

  var result = { added: 0, skipped: 0, items: [] };

  for (var l = 0; l < lines.length; l++) {
    var name = lines[l];
    var isExisting = existingNames.indexOf(name.toLowerCase()) >= 0;

    if (isExisting) {
      result.skipped++;
      result.items.push({ name: name, skip: true });
    } else {
      var id = 'custom_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
      state.customItems.push({
        id: id,
        name: name,
        groupId: groupId || 'custom',
        custom: true
      });
      result.added++;
      result.items.push({ name: name, skip: false });
      existingNames.push(name.toLowerCase());
    }
  }

  if (result.added > 0) {
    saveMedkit();
    rMedkit();
  }

  return result;
}

// --- Предпросмотр текстового импорта ---
function previewImportFromText(text, mode, memberId) {
  if (!text || !text.trim()) return { added: 0, skipped: 0, items: [] };

  var lines = text.split('\n')
    .map(function(l) { return l.trim(); })
    .filter(Boolean);

  var state = getMedkitState(mode, memberId);
  var existingNames = [];

  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    for (var i = 0; i < MEDKIT_BASE[g].items.length; i++) {
      existingNames.push(MEDKIT_BASE[g].items[i].name.toLowerCase());
    }
  }
  for (var c = 0; c < state.customItems.length; c++) {
    existingNames.push(state.customItems[c].name.toLowerCase());
  }

  var result = { added: 0, skipped: 0, items: [] };

  for (var l = 0; l < lines.length; l++) {
    var name = lines[l];
    var isExisting = existingNames.indexOf(name.toLowerCase()) >= 0;
    if (isExisting) {
      result.skipped++;
      result.items.push({ name: name, skip: true });
    } else {
      result.added++;
      result.items.push({ name: name, skip: false });
    }
  }

  return result;
}
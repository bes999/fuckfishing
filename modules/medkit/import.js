/* ===== MEDKIT IMPORT ===== */

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
/* ===== MEDKIT RENDER ===== */

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function rMedkit() {
  var el = document.getElementById('p-medkit');
  if (!el) return;

  var mode = medkitMode;
  var memberId = medkitMemberId;
  var progress = getMedkitProgress(mode, memberId);
  var h = '';

  h += '<div class="topbar">';
  h += '<div class="tb-left"><div class="tb1">Аптечка</div>';
  h += '<div class="tb2">' + (mode === 'common' ? 'Общая' : 'Личная — ' + escHtml(getMemberName(memberId))) + ' · ' + progress.done + ' / ' + progress.total + '</div></div>';
  h += '<div class="tb-right">';
  h += '<span class="tb-sync" id="syncStatus"></span>';
  if (mode !== 'reference') h += '<button class="tb-btn" onclick="showMedkitImport()">⬇ Импорт</button>';
  h += '<button class="tb-btn" onclick="showMedkitSettings()">···</button>';
  h += '</div></div>';

  h += '<div class="tabs">';
  h += '<div class="tab' + (mode === 'common' ? ' active' : '') + '" onclick="setMedkitMode(\'common\')">Общая</div>';
  h += '<div class="tab' + (mode === 'personal' ? ' active' : '') + '" onclick="setMedkitMode(\'personal\')">Личная</div>';
  h += '<div class="tab' + (mode === 'reference' ? ' active' : '') + '" onclick="setMedkitMode(\'reference\')">Справка</div>';
  h += '</div>';

  if (mode === 'personal') h += rMedkitMemberSwitcher(memberId);

  if (mode === 'reference') {
    h += rMedkitReference();
  } else {
    h += rMedkitFilters(mode);
    h += '<div class="view-toggle">';
    h += '<div class="vt' + (medkitViewMode === 'drugs' ? ' active' : '') + '" onclick="setMedkitViewMode(\'drugs\')">По препаратам</div>';
    h += '<div class="vt' + (medkitViewMode === 'slots' ? ' active' : '') + '" onclick="setMedkitViewMode(\'slots\')">По местам хранения</div>';
    h += '</div>';

    if (medkitViewMode === 'slots') {
      h += rMedkitBySlots(mode, memberId);
    } else {
      h += '<div class="prog">';
      h += '<div class="prog-row"><span>Собрано</span><span><span class="prog-pct">' + progress.done + ' / ' + progress.total + '</span> · ' + progress.pct + '%</span></div>';
      h += '<div class="bar-bg"><div class="bar-fill" style="width:' + progress.pct + '%"></div></div>';
      h += '</div>';
      if (mode === 'personal') h += rMedkitStack(memberId);
      h += rMedkitGroups(mode, memberId);
    }
  }

  el.innerHTML = h;
}

var medkitFilters = { search: '', slot: '', status: '' };

function rMedkitFilters(mode) {
  var h = '<div class="filter-row">';
  h += '<div class="sb" style="flex:1"><svg class="si" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';
  h += '<input class="si-i" id="medkitSearchInput" style="width:100%" placeholder="Поиск препарата..." value="' + escHtml(medkitFilters.search) + '" oninput="medkitSearchInput(this.value)">';
  h += '</div>';
  h += '<div class="vd"></div>';
  h += '<div class="fi"><span class="fl">Статус</span><select class="fs" onchange="medkitFilters.status=this.value;rMedkit()">';
  h += '<option value="">Все</option>';
  h += '<option value="warn"' + (medkitFilters.status === 'warn' ? ' selected' : '') + '>Мало</option>';
  h += '<option value="danger"' + (medkitFilters.status === 'danger' ? ' selected' : '') + '>Истёк</option>';
  h += '</select></div>';
  h += '</div>';
  return h;
}

// Кэш реального списка участников поездки (источник — MembersFirebase,
// см. modules/members/firebase.js). window.ST — не существует нигде в
// проекте, это остаток от старой версии; тянем актуальные данные отсюда.
var _medkitMembersCache = null;
var _medkitMembersLoading = false;

function _getMedkitMembers() {
  if (_medkitMembersCache) return _medkitMembersCache;
  if (!_medkitMembersLoading && typeof MembersFirebase !== 'undefined' && MembersFirebase.getAllMembers) {
    _medkitMembersLoading = true;
    MembersFirebase.getAllMembers().then(function(members) {
      _medkitMembersCache = members || [];
      _medkitMembersLoading = false;
      // Перерисовываем, если пользователь всё ещё на личной аптечке
      if (medkitMode === 'personal' && typeof rMedkit === 'function') rMedkit();
    }).catch(function() { _medkitMembersLoading = false; });
  }
  return [];
}

function rMedkitMemberSwitcher(currentMemberId) {
  var members = _getMedkitMembers().filter(function(m) { return m.isActive !== false; });
  if (!members.length) return '';
  var h = '<div class="member-switcher"><div class="member-scroll">';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var initials = (m.displayName || 'NN').slice(0, 2).toUpperCase();
    var prog = getMedkitProgress('personal', m.uid);
    h += '<div class="member-tab' + (m.uid === currentMemberId ? ' active' : '') + '" onclick="setMedkitMember(\'' + m.uid + '\')">';
    h += '<div class="member-avatar">' + initials + '</div>';
    h += '<span class="member-name">' + escHtml(m.displayName || 'Участник') + '</span>';
    h += '<span class="member-prog">' + prog.done + ' / ' + prog.total + '</span>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function getMemberName(memberId) {
  if (!memberId) return 'Участник';
  var members = _getMedkitMembers();
  for (var i = 0; i < members.length; i++) {
    if (members[i].uid === memberId) return members[i].displayName || 'Участник';
  }
  return 'Участник';
}

function applyMedkitItemFilters(item, itemState) {
  if (medkitFilters.search) {
    if (item.name.toLowerCase().indexOf(medkitFilters.search.toLowerCase()) < 0) return false;
  }
  if (medkitFilters.slot) {
    if ((itemState.slot || '') !== medkitFilters.slot) return false;
  }
  if (medkitFilters.status) {
    var status = getMedkitItemStatus(itemState);
    var color = getMedkitItemColor(status);
    // FIX: 'warn' фильтр показывает и warn и yellow (оба — предупреждения об остатке)
    if (medkitFilters.status === 'warn' && color !== 'warn' && color !== 'yellow') return false;
    if (medkitFilters.status === 'danger' && color !== 'danger') return false;
  }
  return true;
}
function rMedkitGroups(mode, memberId) {
  var h = '';
  var optionalNotEnabled = [];

  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];
    if (group.availableIn.indexOf(mode) < 0) continue;

    var isOptional = (mode === 'personal' && group.personalOptional) ||
                 (mode === 'common' && group.commonOptional);
if (isOptional && !isGroupEnabled(mode, memberId, group.id)) {
  optionalNotEnabled.push(group);
  continue;
}

    if (isGroupHidden(mode, memberId, group.id)) continue;

    var visibleItems = [];
    for (var i = 0; i < group.items.length; i++) {
      var item = group.items[i];
      if (isItemHidden(mode, memberId, item.id)) continue;
      var itemState = getMedkitItem(mode, memberId, item.id);
      if (!applyMedkitItemFilters(item, itemState)) continue;
      visibleItems.push(item);
    }

    var state = getMedkitState(mode, memberId);
    var customItems = state.customItems.filter(function(ci) {
      return ci.groupId === group.id && !isItemHidden(mode, memberId, ci.id);
    });

    var open = isGroupOpen(group.id);
    h += '<div class="group' + (open ? '' : ' collapsed') + '" data-group="' + group.id + '">';
    h += '<div class="group-hd">';
    h += '<div class="gh-left" onclick="toggleMedkitGroupCollapse(\'' + group.id + '\')">';
    h += '<span class="gh-arrow">▶</span>';
    h += '<span class="gh-title">' + escHtml(group.label) + '</span>';
    h += '<span class="gh-count">' + (visibleItems.length + customItems.length) + '</span>';
    h += '</div>';
    h += '<div class="gh-right">';
    if (isOptional && group.id !== 'supplements') {
    h += '<span class="hide-btn" style="color:var(--red);border-color:#F7C1C1" onclick="disableMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\')">отключить</span>';
   }
    h += '<div class="gh-btn" onclick="toggleMedkitAddRow(\'' + group.id + '\')">';
    h += '<svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>';
    h += '<div class="gh-btn" onclick="hideMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\',event)">';
    h += '<svg viewBox="0 0 24 24"><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12z"/><circle cx="12" cy="12" r="3"/></svg></div>';
    h += '</div></div>';

    h += '<div class="group-body">';
    for (var vi = 0; vi < visibleItems.length; vi++) {
      h += rMedkitDrugItem(mode, memberId, visibleItems[vi], false);
    }
    for (var ci2 = 0; ci2 < customItems.length; ci2++) {
      h += rMedkitDrugItem(mode, memberId, customItems[ci2], true);
    }
    h += '<div class="add-drug-row" onclick="toggleMedkitAddRow(\'' + group.id + '\')">';
    h += '<div class="add-plus">+</div>Добавить препарат</div>';
    h += '<div class="add-item-input" id="addDrugForm_' + group.id + '">';
    h += '<input type="text" id="addDrugInput_' + group.id + '" placeholder="Название препарата">';
    h += '<button onclick="addMedkitCustomItem(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\',document.getElementById(\'addDrugInput_' + group.id + '\').value)">Добавить</button>';
    h += '</div>';
    h += '</div>';
    h += '</div>';
  }

  h += rMedkitHidden(mode, memberId);
  h += rMedkitHiddenGroups(mode, memberId);
  for (var oi = 0; oi < optionalNotEnabled.length; oi++) {
  var og = optionalNotEnabled[oi];
  h += '<div class="optional-group"><div class="optional-hd">';
  h += '<span class="opt-title">' + escHtml(og.icon) + ' ' + escHtml(og.label) + ' — не подключено</span>';
  h += '<span class="enable-btn" onclick="enableMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + og.id + '\')">подключить</span>';
  h += '</div></div>';
}
  h += '<div class="add-cat" onclick="showAddMedkitGroup()">';
  h += '<div class="add-cat-icon">+</div>';
  h += '<span class="add-cat-label">Добавить категорию</span>';
  h += '</div>';
  return h;
}

function rMedkitDrugItem(mode, memberId, item, isCustom) {
  var itemState = getMedkitItem(mode, memberId, item.id);
  var status = getMedkitItemStatus(itemState);
  var color = getMedkitItemColor(status);
  var statusLabel = getMedkitStatusLabel(status);
  var info = MEDKIT_INFO[item.id] || null;

  var cls = 'drug' + (color === 'danger' ? ' d' : color === 'warn' ? ' w' : '');
  var h = '<div class="' + cls + '">';
  h += '<div class="drug-top">';
  h += '<div class="cc' + (itemState.checked ? ' done' : '') + '" onclick="toggleMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',event)">';
  if (itemState.checked) h += '<svg viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>';
  h += '</div>';
  h += '<div class="drug-info"><div class="dn">' + escHtml(item.name) + '</div>';
  if (info && info.label) h += '<div class="dl">' + escHtml(info.label) + '</div>';
  h += '</div>';
  h += '<div class="drug-right">';
  if (statusLabel) h += '<span class="sp sp-' + color + '">' + statusLabel + '</span>';
  h += '<span class="hide-btn" onclick="hideMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',event)">скрыть</span>';
  h += '</div></div>';

  var slot = itemState.slot ? getSlotById(mode, itemState.slot) : null;
  var leftInfo = '';
  if (itemState.left && itemState.unit) {
    leftInfo = itemState.left + ' ' + itemState.unit;
    var doseNum = parseFloat(itemState.dose);
    if (itemState.dose && !isNaN(doseNum) && doseNum > 0) {
      var servings = Math.floor(parseFloat(itemState.left) / doseNum);
      if (!isNaN(servings) && isFinite(servings)) leftInfo += ' · ~' + servings + ' приём';
    }
  }

  h += '<div class="drug-meta">';
  h += '<span class="mt">' + (slot ? escHtml(slot.label) : 'Не указано') + '</span>';
  if (leftInfo) {
    var mtClass = color === 'warn' ? ' warn' : color === 'danger' ? ' danger' : '';
    h += '<span class="mt' + mtClass + '">' + escHtml(leftInfo) + '</span>';
  }
  if (itemState.expiry) {
    var expiryClass = (status.expiry === 'expired' || status.expiry === 'critical') ? ' danger' : '';
    h += '<span class="mt' + expiryClass + '">срок ' + escHtml(itemState.expiry) + '</span>';
  }
  h += '</div>';
  h += rMedkitDrugCard(mode, memberId, item, itemState, info, status);
  h += '</div>';
  return h;
}

function rMedkitDrugCard(mode, memberId, item, itemState, info, status) {
  var legend = getMedkitStatusLegend(status);
  var slots = getSlotsFor(mode);
  var units = ['', 'таб', 'капс', 'амп', 'мл', 'мг', 'г', 'шт', 'фл', 'тюб', 'саше', 'пак'];

  var h = '<details class="drug-card"><summary style="cursor:pointer;font-size:12px;font-weight:500;color:var(--accent);padding:6px 0 4px">Карточка препарата</summary>';

  h += '<div class="row4">';
  h += '<div class="cell"><span class="cl">Было</span><input class="ci" value="' + escHtml(itemState.total || '') + '" placeholder="—" onchange="updateMedkitTotal(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)"></div>';
  h += '<div class="cell"><span class="cl">Осталось</span><input class="ci" value="' + escHtml(itemState.left || '') + '" placeholder="—" onchange="updateMedkitLeft(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)"></div>';
  h += '<div class="cell"><span class="cl">Единица</span><select class="cs" onchange="updateMedkitUnit(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)">';
  for (var u = 0; u < units.length; u++) {
    h += '<option value="' + units[u] + '"' + ((itemState.unit || '') === units[u] ? ' selected' : '') + '>' + (units[u] || 'ед.') + '</option>';
  }
  h += '</select></div>';
  h += '<div class="cell"><span class="cl">Срок</span><input type="month" class="ci" value="' + escHtml(itemState.expiry || '') + '" onchange="updateMedkitExpiry(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)"></div>';
  h += '</div>';

  h += '<div class="row2">';
  h += '<div class="cell"><span class="cl">Место хранения</span><select class="cs" onchange="updateMedkitSlot(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)">';
  h += '<option value="">Не указано</option>';
  for (var s = 0; s < slots.length; s++) {
    h += '<option value="' + slots[s].id + '"' + ((itemState.slot || '') === slots[s].id ? ' selected' : '') + '>' + escHtml(slots[s].label) + '</option>';
  }
  h += '</select></div>';
  h += '<div class="cell"><span class="cl">Доза / 1 приём</span><input class="ci" value="' + escHtml(itemState.dose || '') + '" placeholder="—" onchange="updateMedkitDose(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)"></div>';
  h += '</div>';

  h += '<div class="comment-block"><div class="comment-label">Комментарий</div>';
  h += '<input class="comment-input" value="' + escHtml(itemState.note || '') + '" placeholder="необязательно" onchange="updateMedkitNote(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)"></div>';

  if (legend.length) {
    h += '<div class="status-legend">';
    for (var l = 0; l < legend.length; l++) {
      h += '<div class="sl-row"><span class="dot dot-' + legend[l].color + '"></span>' + escHtml(legend[l].text) + '</div>';
    }
    h += '</div>';
  }

  if (info) {
    h += '<div class="info-section">';
    if (info.purpose)  h += '<div class="info-row"><span class="ir-lbl">Для чего</span><span class="ir-val">' + escHtml(info.purpose) + '</span></div>';
    if (info.symptoms) h += '<div class="info-row"><span class="ir-lbl">При симптомах</span><span class="ir-val">' + escHtml(info.symptoms) + '</span></div>';
    if (info.how)      h += '<div class="info-row"><span class="ir-lbl">Как принимать</span><span class="ir-val">' + escHtml(info.how) + '</span></div>';
    if (info.where)    h += '<div class="info-row"><span class="ir-lbl">Куда колоть</span><span class="ir-val">' + escHtml(info.where) + '</span></div>';
    if (info.replace)  h += '<div class="info-row"><span class="ir-lbl">Чем заменить</span><span class="ir-val">' + escHtml(info.replace) + '</span></div>';
    if (info.warn)     h += '<div class="info-row"><span class="ir-lbl">Важно</span><span class="ir-val">' + escHtml(info.warn) + '</span></div>';
    h += '</div>';
  }

  // --- Поля для БАДов ---
  if (mode === 'personal') {
    var isSupp = false;
    for (var sg = 0; sg < MEDKIT_BASE.length; sg++) {
      if (MEDKIT_BASE[sg].id === 'supplements') {
        for (var si2 = 0; si2 < MEDKIT_BASE[sg].items.length; si2++) {
          if (MEDKIT_BASE[sg].items[si2].id === item.id) { isSupp = true; break; }
        }
      }
    }
    if (item.custom && item.groupId === 'supplements') isSupp = true;

    if (isSupp) {
      h += '<div class="row2" style="margin-top:6px">';
      h += '<div class="cell"><span class="cl">Когда пить</span>';
      h += '<select class="cs" onchange="updateMedkitSlotTime(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)">';
      h += '<option value="Утро"' + ((itemState.slot_time || 'Утро') === 'Утро' ? ' selected' : '') + '>Утро</option>';
      h += '<option value="День"' + ((itemState.slot_time || '') === 'День' ? ' selected' : '') + '>День</option>';
      h += '<option value="Вечер"' + ((itemState.slot_time || '') === 'Вечер' ? ' selected' : '') + '>Вечер</option>';
      h += '</select></div>';
      h += '<div class="cell"><span class="cl">Как принимать</span>';
      h += '<select class="cs" onchange="updateMedkitHow(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',this.value)">';
      h += '<option value=""' + (!(itemState.how || '') ? ' selected' : '') + '>не указано</option>';
      h += '<option value="натощак"' + ((itemState.how || '') === 'натощак' ? ' selected' : '') + '>натощак</option>';
      h += '<option value="до еды"' + ((itemState.how || '') === 'до еды' ? ' selected' : '') + '>до еды</option>';
      h += '<option value="во время еды"' + ((itemState.how || '') === 'во время еды' ? ' selected' : '') + '>во время еды</option>';
      h += '<option value="после еды"' + ((itemState.how || '') === 'после еды' ? ' selected' : '') + '>после еды</option>';
      h += '<option value="перед сном"' + ((itemState.how || '') === 'перед сном' ? ' selected' : '') + '>перед сном</option>';
      h += '</select></div>';
      h += '</div>';
    }
  }

  h += '</details>';
  return h;
}
function rMedkitHidden(mode, memberId) {
  var state = getMedkitState(mode, memberId);
  var hidden = [];

  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];
    if (group.availableIn.indexOf(mode) < 0) continue;
    for (var i = 0; i < group.items.length; i++) {
      var item = group.items[i];
      if (isItemHidden(mode, memberId, item.id)) {
        hidden.push({ id: item.id, name: item.name, group: group.label, custom: false });
      }
    }
  }
  for (var c = 0; c < state.customItems.length; c++) {
    var ci = state.customItems[c];
    if (isItemHidden(mode, memberId, ci.id)) {
      hidden.push({ id: ci.id, name: ci.name, group: 'Добавленные', custom: true });
    }
  }
  if (!hidden.length) return '';

  var h = '<div class="hidden-section">';
  h += '<div class="hidden-hd"><span class="hidden-title"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Скрытые препараты</span>';
  h += '<span class="hidden-count">' + hidden.length + '</span></div>';
  h += '<div class="hidden-body">';
  for (var hi = 0; hi < hidden.length; hi++) {
    var hitem = hidden[hi];
    h += '<div class="hidden-item">';
    h += '<div><div class="hi-name">' + escHtml(hitem.name) + '</div><div class="hi-group">' + escHtml(hitem.group) + '</div></div>';
    h += '<div style="display:flex;gap:5px">';
    h += '<span class="restore-btn" onclick="restoreMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + hitem.id + '\')">показать</span>';
    if (hitem.custom) {
      h += '<span class="restore-btn" style="color:#A32D2D;border-color:#F7C1C1;background:#FCEBEB" onclick="deleteMedkitCustomItem(\'' + mode + '\',\'' + memberId + '\',\'' + hitem.id + '\',event)">удалить</span>';
    }
    h += '</div></div>';
  }
  h += '</div></div>';
  return h;
}

function rMedkitHiddenGroups(mode, memberId) {
  var hidden = [];
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    var group = MEDKIT_BASE[g];
    if (group.availableIn.indexOf(mode) < 0) continue;
    if (isGroupHidden(mode, memberId, group.id)) hidden.push(group);
  }
  if (!hidden.length) return '';

  var h = '<div class="hidden-section">';
  h += '<div class="hidden-hd"><span class="hidden-title"><svg viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" fill="none" stroke-width="1.8" stroke-linecap="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/></svg> Скрытые разделы</span>';
  h += '<span class="hidden-count">' + hidden.length + '</span></div>';
  h += '<div class="hidden-body">';
  for (var hi = 0; hi < hidden.length; hi++) {
    var hg = hidden[hi];
    h += '<div class="hidden-item">';
    h += '<div><div class="hi-name">' + escHtml(hg.label) + '</div><div class="hi-group">' + hg.items.length + ' препаратов</div></div>';
    h += '<span class="restore-btn" onclick="restoreMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + hg.id + '\')">показать</span>';
    h += '</div>';
  }
  h += '</div></div>';
  return h;
}

function rMedkitStack(memberId) {
  var state = getMedkitState('personal', memberId);
  if (state.hiddenGroups && state.hiddenGroups['stack']) return '';

  var suppGroup = null;
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    if (MEDKIT_BASE[g].id === 'supplements') { suppGroup = MEDKIT_BASE[g]; break; }
  }
  if (!suppGroup || !isGroupEnabled('personal', memberId, 'supplements')) return '';

  var slots = { 'Утро': [], 'День': [], 'Вечер': [] };
  var allItems = suppGroup.items.concat(state.customItems.filter(function(ci) {
    return ci.groupId === 'supplements';
  }));
  for (var i = 0; i < allItems.length; i++) {
    var item = allItems[i];
    var itemState = getMedkitItem('personal', memberId, item.id);
    var slotName = itemState.slot_time || 'Утро';
    if (!slots[slotName]) slots[slotName] = [];
    slots[slotName].push({ item: item, state: itemState });
  }
  var hasAny = slots['Утро'].length || slots['День'].length || slots['Вечер'].length;
  if (!hasAny) return '';

  var dayLabels = [['Пн','mon'],['Вт','tue'],['Ср','wed'],['Чт','thu'],['Пт','fri'],['Сб','sat'],['Вс','sun']];
  var h = '<div class="stack-card">';
  h += '<div class="stack-hd" onclick="toggleMedkitStack()" style="cursor:pointer">';
  h += '<div class="stack-hd-l"><svg class="stack-hd-svg" viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 12h6M12 9v6"/></svg>';
  h += '<span class="stack-hd-title">Стек БАДов</span></div>';
  h += '<div class="stack-hd-r">';
  h += '<span class="hide-link" style="color:var(--red);border-color:var(--red)" onclick="disableMedkitGroup(\'personal\',\'' + memberId + '\',\'supplements\');event.stopPropagation()">отключить</span>';
  h += '<span class="stack-arrow" style="' + (medkitStackCollapsed ? '' : 'transform:rotate(90deg)') + '">▶</span>';
  h += '</div></div>';
  h += '<div class="stack-body"' + (medkitStackCollapsed ? ' style="display:none"' : '') + '>';
  var slotOrder = ['Утро', 'День', 'Вечер'];
  for (var si = 0; si < slotOrder.length; si++) {
    var sn = slotOrder[si];
    if (!slots[sn] || !slots[sn].length) continue;
    h += '<div class="slot-label">' + sn + '</div>';
    for (var ii = 0; ii < slots[sn].length; ii++) {
      var entry = slots[sn][ii];
      h += '<div class="stack-item"><div><div class="si-name">' + escHtml(entry.item.name) + '</div>';
      if (entry.state.how) h += '<div class="si-how">' + escHtml(entry.state.how) + '</div>';
      h += '</div><div class="days">';
      for (var di = 0; di < dayLabels.length; di++) {
        var dayKey = dayLabels[di][1];
        var taken = entry.state.taken && entry.state.taken[dayKey];
        h += '<div class="day' + (taken ? ' done' : '') + '" onclick="toggleMedkitTakenDay(\'personal\',\'' + memberId + '\',\'' + entry.item.id + '\',\'' + dayKey + '\',event)">' + dayLabels[di][0] + '</div>';
      }
      h += '</div></div>';
    }
  }
  h += '</div></div>';
  return h;
}

function rMedkitBySlots(mode, memberId) {
  var slots = getSlotsFor(mode);
  var h = '<div class="sep-ref">Места хранения</div>';
  for (var s = 0; s < slots.length; s++) {
    var slot = slots[s];
    var items = [];
    for (var g = 0; g < MEDKIT_BASE.length; g++) {
      var group = MEDKIT_BASE[g];
      if (group.availableIn.indexOf(mode) < 0) continue;
      for (var i = 0; i < group.items.length; i++) {
        var item = group.items[i];
        var itemState = getMedkitItem(mode, memberId, item.id);
        if (itemState.slot === slot.id) items.push({ item: item, state: itemState, group: group.label });
      }
    }
    var state = getMedkitState(mode, memberId);
    for (var c = 0; c < state.customItems.length; c++) {
      var ci = state.customItems[c];
      var ciState = getMedkitItem(mode, memberId, ci.id);
      if (ciState.slot === slot.id) items.push({ item: ci, state: ciState, group: 'Добавленные' });
    }
    var done = items.filter(function(it) { return it.state.checked; }).length;
    var pct = items.length ? Math.round(done / items.length * 100) : 0;

    h += '<div class="slot-block"><div class="slot-hd"><div class="slot-hd-left">';
    h += '<div class="slot-icon">' + slot.icon + '</div>';
    h += '<div><div class="slot-name">' + escHtml(slot.label) + '</div>';
    h += '<div class="slot-count">' + (items.length ? items.length + ' препаратов · ' + done + ' собрано' : 'Пусто') + '</div></div>';
    h += '</div><div class="slot-hd-right">';
    if (items.length) h += '<span class="slot-prog">' + pct + '%</span>';
    h += '<span class="slot-arrow">▾</span></div></div>';

    if (!items.length) {
      h += '<div class="empty-slot">Ни одного препарата не привязано</div>';
    } else {
      for (var it = 0; it < items.length; it++) {
        var entry = items[it];
        var st = getMedkitItemStatus(entry.state);
        var col = getMedkitItemColor(st);
        var stLabel = getMedkitStatusLabel(st);
        var slotCls = 'slot-item' + (col === 'danger' ? ' d' : col === 'warn' ? ' w' : '');
        h += '<div class="' + slotCls + '"><div class="si-left">';
        h += '<div class="cc' + (entry.state.checked ? ' done' : '') + '" onclick="toggleMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + entry.item.id + '\',event)">';
        if (entry.state.checked) h += '<svg viewBox="0 0 12 12"><polyline points="2,6 5,9 10,3"/></svg>';
        h += '</div>';
        h += '<div class="si-info"><div class="si-name">' + escHtml(entry.item.name) + '</div>';
        h += '<div class="si-cat">' + escHtml(entry.group) + '</div></div>';
        h += '</div><div class="si-right">';
        if (entry.state.left && entry.state.unit) h += '<span class="si-qty">' + escHtml(entry.state.left) + ' ' + escHtml(entry.state.unit) + '</span>';
        if (stLabel) h += '<span class="sp sp-' + col + '">' + stLabel + '</span>';
        h += '</div></div>';
      }
    }
    h += '</div>';
  }
  h += '<div class="add-slot" onclick="showAddMedkitSlot(\'' + mode + '\')">';
  h += '<div class="add-slot-icon">+</div>';
  h += '<span class="add-slot-label">Добавить место хранения</span></div>';
  return h;
}

function rMedkitReference() {
  var h = '<div class="filter-row">';
  h += '<div class="sb" style="flex:1"><svg class="si" viewBox="0 0 24 24"><circle cx="11" cy="11" r="7"/><line x1="16.5" y1="16.5" x2="21" y2="21"/></svg>';
  h += '<input class="si-i" placeholder="Поиск ситуации..." oninput="filterEmergency(this.value)"></div>';
  h += '<div class="vd"></div>';
  h += '<div class="fi"><span class="fl">Тип</span><select class="fs" onchange="filterEmergencyType(this.value)">';
  h += '<option value="">Все</option><option value="danger">Критично</option><option value="warning">Внимание</option><option value="info">Обычное</option>';
  h += '</select></div></div>';
  h += '<div class="sep-ref">Экстренные телефоны</div>';
  h += '<div class="contacts">';
  h += '<div class="contact-item"><div><div class="contact-name">Единый экстренный</div></div><a href="tel:112" class="contact-phone">112</a></div>';
  h += '<div class="contact-item"><div><div class="contact-name">Скорая</div></div><a href="tel:103" class="contact-phone">103</a></div>';
  h += '<div class="contact-item"><div><div class="contact-name">Обл. больница Южный</div><div class="contact-sub">ул. Мира, 430</div></div><a href="tel:+74242460051" class="contact-phone">46-00-51</a></div>';
  h += '<div class="contact-item"><div><div class="contact-name">ЦРБ Долинск</div></div><a href="tel:+74244323344" class="contact-phone">3-23-44</a></div>';
  h += '</div>';
  h += '<div class="sep-ref">Ситуации</div>';
  h += '<div id="emergencyList">' + rEmergencyList(EMERGENCY) + '</div>';
  return h;
}

function rEmergencyList(list) {
  var h = '';
  var currentGroup = '';

  for (var i = 0; i < list.length; i++) {
    var em = list[i];

    // заголовок группы
    if (em.group !== currentGroup) {
      currentGroup = em.group;
      h += '<div class="em-group-header">';
      h += '<span class="em-group-title">' + escHtml(currentGroup) + '</span>';
      h += '<div class="em-group-line"></div>';
      h += '</div>';
    }

    var bc = em.priority === 'danger' ? 'danger' : em.priority === 'warning' ? 'warn' : 'info';
    var bl = em.priority === 'danger' ? 'критично' : em.priority === 'warning' ? 'внимание' : 'обычное';

    h += '<div class="em-card"><div class="em-hd" onclick="this.parentNode.classList.toggle(\'open\')">';
    h += '<div class="em-icon ' + bc + '">' + em.icon + '</div>';
    h += '<div class="em-info"><div class="em-title">' + escHtml(em.title) + '</div>';
    h += '<div class="em-sub">' + escHtml(em.sub) + '</div></div>';
    h += '<div class="em-right"><span class="em-badge ' + bc + '">' + bl + '</span>';
    h += '<span class="em-arrow">▶</span></div></div>';
    h += '<div class="em-body"><div class="em-steps">';
    for (var s = 0; s < em.steps.length; s++) {
      var step = em.steps[s];
      h += '<div class="em-step"><span class="em-num' + (step.critical ? ' danger' : '') + '">' + (s + 1) + '</span>';
      h += '<span class="em-step-text">' + (step.critical ? '<b>' + escHtml(step.text) + '</b>' : escHtml(step.text)) + '</span></div>';
    }
    h += '</div>';
    if (em.drugs.length || em.call112) {
      h += '<div class="em-footer"><div class="em-drugs">';
      for (var d = 0; d < em.drugs.length; d++) {
        var dn = em.drugs[d];
        for (var gg = 0; gg < MEDKIT_BASE.length; gg++) {
          for (var ii = 0; ii < MEDKIT_BASE[gg].items.length; ii++) {
            if (MEDKIT_BASE[gg].items[ii].id === em.drugs[d]) dn = MEDKIT_BASE[gg].items[ii].name;
          }
        }
        h += '<span class="em-drug-tag">' + escHtml(dn) + '</span>';
      }
      h += '</div>';
      if (em.call112) h += '<a href="tel:112" class="call112">112</a>';
      h += '</div>';
    }
    h += '</div></div>';
  }
  return h;
}

var emergencySearch = '';
var emergencyType = '';

function filterEmergency(q) {
  emergencySearch = q.toLowerCase();
  updateEmergencyList();
}

function filterEmergencyType(type) {
  emergencyType = type;
  updateEmergencyList();
}

function updateEmergencyList() {
  var filtered = EMERGENCY.filter(function(em) {
    if (emergencySearch && em.title.toLowerCase().indexOf(emergencySearch) < 0) return false;
    if (emergencyType && em.priority !== emergencyType) return false;
    return true;
  });
  var el = document.getElementById('emergencyList');
  if (el) el.innerHTML = rEmergencyList(filtered);
}

function showMedkitSettings() { alert('Настройки — будет реализован'); }
function showAddMedkitGroup() { alert('Добавить категорию — будет реализован'); }
function showAddMedkitSlot(mode) { alert('Добавить место — будет реализован'); }
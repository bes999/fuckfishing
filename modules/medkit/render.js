/* ===== MEDKIT RENDER ===== */
// Макеты v2: «Аптечка — общая / личная / что делать», карточка препарата
// отдельным листом, «по местам», стек БАДов внутри категории БАДов.

function escHtml(s) {
  if (!s) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function _mkPlural(n, one, few, many) {
  var a = Math.abs(n) % 100, b = a % 10;
  if (a > 10 && a < 20) return many;
  if (b > 1 && b < 5) return few;
  if (b === 1) return one;
  return many;
}

// Список поездок для свитчера — тот же источник и сортировка, что у
// modules/purchases/render.js (свежие сверху по дате начала).
function _medkitTrips() {
  if (typeof TripsData === 'undefined') return [];
  var uid = window.APP && window.APP.user && window.APP.user.uid;
  return (TripsData.getMine ? TripsData.getMine(uid) : [])
    .slice().sort(function(a, b) { return new Date(b.startDate) - new Date(a.startDate); });
}

function rMedkitTripSelect(trips) {
  var options = trips.map(function(t) {
    return '<option value="' + escHtml(t.id) + '"' + (t.id === medkitTripId ? ' selected' : '') + '>' + escHtml(t.name) + '</option>';
  }).join('');
  return '<select class="mk-trip-select" aria-label="Сменить поездку" onchange="switchMedkitTrip(this.value)">' + options + '</select>';
}

function switchMedkitTrip(tripId) {
  if (tripId === medkitTripId) return;
  medkitTripId = tripId;
  medkitMode = 'common';
  medkitMemberId = '';
  closeMedkitDrug();
  rMedkit();
  initFirebase();
}

var medkitFilters = { search: '', slot: '', status: '' };

function rMedkit() {
  var el = document.getElementById('p-medkit');
  if (!el) return;

  var trips = _medkitTrips();
  if (!trips.length) {
    el.innerHTML = '<div class="mk-no-trip">Нет поездок, к которым можно привязать аптечку — сначала создай поездку на вкладке «Планы».</div>';
    return;
  }
  if (!medkitTripId || !trips.some(function(t) { return t.id === medkitTripId; })) {
    medkitTripId = trips[0].id;
  }

  var mode = medkitMode;
  var memberId = medkitMemberId;
  // Чужую личную аптечку можно только просматривать (_canEditMedkit
  // блокирует запись, тут — не рисуем кнопки правки вовсе).
  var readOnly = mode === 'personal' && !_canEditMedkit(mode, memberId);
  el.classList.toggle('mk-readonly', readOnly);

  // Верх: «Аптечка», под ним — поездка (нативный выбор спрятан под
  // подписью), справа «…» с импортом, категориями и местами хранения.
  var curTrip = trips.filter(function(t) { return t.id === medkitTripId; })[0];
  var sub;
  if (mode === 'reference') {
    sub = '<span class="mk-sub">что делать, если…</span>';
  } else {
    sub = '<label class="mk-trip">' + escHtml(curTrip ? curTrip.name : '') + ' ' + UIUtils.ico('chevron-down')
      + (trips.length > 1 ? rMedkitTripSelect(trips) : '') + '</label>';
  }
  var menu = '';
  if (mode !== 'reference' && !readOnly) {
    var close = 'this.closest(\'details\').open=false;';
    menu = '<details class="mk-menu"><summary aria-label="Ещё: импорт списка, категории, места хранения">' + UIUtils.ico('dots') + '</summary><div class="mk-menu-pop">'
      + '<button type="button" onclick="' + close + 'showMedkitImport()">' + UIUtils.ico('download') + ' Импорт списка</button>'
      + '<button type="button" onclick="' + close + 'showMedkitCategoryPicker()">' + UIUtils.ico('list-check') + (mode === 'personal' ? ' Мои категории' : ' Категории') + '</button>'
      + '<button type="button" onclick="' + close + 'showMedkitSlotsSheet()">' + UIUtils.ico('package') + ' Места хранения</button>'
      + '</div></details>';
  }
  var h = '<header class="mk-head"><div class="mk-head-l"><h1 class="mk-title">Аптечка</h1>' + sub + '</div>'
    + '<div class="mk-head-r"><span class="tb-sync" id="syncStatus"></span>' + menu + '</div></header>';

  h += '<div class="mk-seg" role="tablist">';
  [['common', 'Общая'], ['personal', 'Личная'], ['reference', 'Что делать']].forEach(function(t) {
    var on = mode === t[0];
    h += '<button type="button" role="tab" aria-selected="' + on + '" class="mk-seg-b' + (on ? ' on' : '') + '" onclick="setMedkitMode(\'' + t[0] + '\')">' + t[1] + '</button>';
  });
  h += '</div>';

  if (mode === 'reference') {
    h += rMedkitReference();
  } else {
    if (mode === 'personal') h += rMedkitMemberSwitcher(memberId);
    else h += '<p class="mk-hint mk-hint--top">Одна на всю группу — отмечает любой участник</p>';
    var sections = getMedkitSections(mode, memberId);
    h += rMedkitProgressCard(mode, memberId, getMedkitProgress(mode, memberId));
    h += rMedkitFilters(mode);
    h += rMedkitToolbar(mode, memberId, sections);
    if (medkitViewMode === 'slots') h += rMedkitBySlots(mode, memberId, sections, readOnly);
    else h += rMedkitGroups(mode, memberId, sections, readOnly);
  }

  var scroll = el.scrollTop;
  el.innerHTML = h;
  el.scrollTop = scroll;
  UIUtils.swipeToDelete(el, '.mk-swipe', '.mk-del');
  _mkSyncSheet(false);
  if (document.getElementById('mkPickerOverlay')) _mkRefreshPicker();
  if (document.getElementById('mkSlotsOverlay')) _mkRefreshSlotsSheet();
}

function rMedkitFilters(mode) {
  return '<label class="mk-search">' + UIUtils.ico('search')
    + '<input class="si-i" id="medkitSearchInput" placeholder="Найти препарат" aria-label="Найти препарат" value="' + escHtml(medkitFilters.search) + '" oninput="medkitSearchInput(this.value)"></label>';
}

// «Собрано X из N» + шкала.
function rMedkitProgressCard(mode, memberId, progress) {
  return '<div class="mk-prog"><span class="mk-prog-t">Собрано <b>' + progress.done + '</b> из ' + progress.total + '</span>'
    + '<div class="mk-prog-track"><div class="mk-prog-fill" style="width:' + progress.pct + '%"></div></div></div>';
}

// «Требуют внимания · N» (бывшие «Истёк срок» и «Мало» одним фильтром —
// всё, у чего есть статус по сроку или остатку) + Список / По местам.
function rMedkitToolbar(mode, memberId, sections) {
  var n = 0;
  sections.forEach(function(s) {
    s.items.forEach(function(it) {
      if (getMedkitItemColor(getMedkitItemStatus(getMedkitItem(mode, memberId, it.id)))) n++;
    });
  });
  var h = '<div class="mk-toolbar">';
  if (n || medkitFilters.status) {
    var on = medkitFilters.status === 'attention';
    h += '<button type="button" class="mk-pill mk-pill--warn' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="toggleMedkitAttention()">Требуют внимания · ' + n + '</button>';
  }
  h += '<span class="mk-grow"></span><div class="mk-seg mk-seg--sm">';
  h += '<button type="button" aria-pressed="' + (medkitViewMode !== 'slots') + '" class="mk-seg-b' + (medkitViewMode !== 'slots' ? ' on' : '') + '" onclick="setMedkitViewMode(\'drugs\')">Список</button>';
  h += '<button type="button" aria-pressed="' + (medkitViewMode === 'slots') + '" class="mk-seg-b' + (medkitViewMode === 'slots' ? ' on' : '') + '" onclick="setMedkitViewMode(\'slots\')">По местам</button>';
  return h + '</div></div>';
}

function toggleMedkitAttention() {
  medkitFilters.status = medkitFilters.status === 'attention' ? '' : 'attention';
  rMedkit();
}

// Кэш реального списка участников поездки (источник — MembersFirebase,
// см. modules/members/firebase.js). getAllMembers() — сетевой запрос, не
// подписка, поэтому кэш живёт ограниченное время (новый участник
// появится в свитчере без перезагрузки).
var _medkitMembersCache = null;
var _medkitMembersLoading = false;
var _medkitMembersFetchedAt = 0;
var MEDKIT_MEMBERS_TTL_MS = 60000;

function _getMedkitMembers() {
  var stale = !_medkitMembersCache || (Date.now() - _medkitMembersFetchedAt) > MEDKIT_MEMBERS_TTL_MS;
  if (!stale) return _medkitMembersCache;
  if (!_medkitMembersLoading && typeof MembersFirebase !== 'undefined' && MembersFirebase.getAllMembers) {
    _medkitMembersLoading = true;
    MembersFirebase.getAllMembers().then(function(members) {
      _medkitMembersCache = members || [];
      _medkitMembersFetchedAt = Date.now();
      _medkitMembersLoading = false;
      if (medkitMode === 'personal' && typeof rMedkit === 'function') rMedkit();
    }).catch(function() { _medkitMembersLoading = false; });
  }
  return _medkitMembersCache || [];
}

// Ряд участников-чипов с прогрессом; себя — первым.
function rMedkitMemberSwitcher(currentMemberId) {
  var me = window.APP && window.APP.user && window.APP.user.uid;
  var members = _getMedkitMembers().filter(function(m) { return m.isActive !== false; })
    .slice().sort(function(a, b) { return (b.uid === me) - (a.uid === me); });
  if (!members.length) return '';
  var h = '<div class="mk-people">';
  for (var i = 0; i < members.length; i++) {
    var m = members[i];
    var name = m.displayName || 'Участник';
    var on = m.uid === currentMemberId;
    var prog = getMedkitProgress('personal', m.uid);
    var av = (m.avatar && /^https?:\/\//.test(m.avatar)) ? '<img src="' + escHtml(m.avatar) + '" alt="">' : escHtml(UIUtils.initials(name, m.nickname));
    h += '<button type="button" class="mk-person' + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="setMedkitMember(\'' + m.uid + '\')">'
      + '<span class="mk-person-av">' + av + '</span>' + escHtml(name)
      + (prog.total ? '<span class="mk-person-p">' + prog.done + '/' + prog.total + '</span>' : '') + '</button>';
  }
  h += '</div>';
  if (members.length > 1) h += '<p class="mk-hint mk-hint--top">Чужую аптечку можно только посмотреть</p>';
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
  if (medkitFilters.status === 'attention') {
    if (!getMedkitItemColor(getMedkitItemStatus(itemState))) return false;
  }
  return true;
}

function _mkFilterActive() {
  return !!(medkitFilters.search || medkitFilters.status);
}

function _mkIsOptional(mode, group) {
  return (mode === 'personal' && group.personalOptional) || (mode === 'common' && group.commonOptional);
}

// --- Строка препарата ---

var MK_MONTHS_GEN = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];

function _mkParseExpiry(v) {
  if (!v) return null;
  var m = /^(\d{4})-(\d{2})/.exec(v);
  if (m) return { y: +m[1], m: +m[2] };
  var p = v.split('.');
  if (p.length === 3) return { y: 2000 + parseInt(p[2], 10), m: parseInt(p[1], 10) };
  return null;
}

function _mkFmtExpiry(v) {
  var e = _mkParseExpiry(v);
  return e ? (e.m < 10 ? '0' : '') + e.m + '.' + e.y : v;
}

function _mkServings(itemState) {
  var left = parseFloat(itemState.left), dose = parseFloat(itemState.dose);
  if (isNaN(left) || isNaN(dose) || dose <= 0) return null;
  return Math.floor(left / dose);
}

function _mkDrugMeta(mode, item, itemState, status, color, extraLabel) {
  var info = MEDKIT_INFO[item.id] || null;
  var bits = [];
  if (extraLabel) bits.push(escHtml(extraLabel));
  else if (info && info.label) bits.push(escHtml(info.label));
  var slot = itemState.slot ? getSlotById(mode, itemState.slot) : null;
  if (slot && !extraLabel) bits.push(escHtml(slot.label));
  if (itemState.left) {
    var q = itemState.left + (itemState.unit ? ' ' + itemState.unit : '');
    var sv = _mkServings(itemState);
    if (sv !== null) q += ' · ~' + sv + ' ' + _mkPlural(sv, 'приём', 'приёма', 'приёмов');
    bits.push('<span class="' + (status.stock ? 'mk-tone-' + (status.stock === 'empty' ? 'danger' : 'warn') : '') + '">' + escHtml(q) + '</span>');
  }
  if (itemState.expiry) {
    bits.push('<span class="' + (status.expiry ? 'mk-tone-' + (status.expiry === 'expired' ? 'danger' : 'warn') : '') + '">срок ' + escHtml(_mkFmtExpiry(itemState.expiry)) + '</span>');
  }
  return bits.join(' · ');
}

function rMedkitDrugRow(mode, memberId, item, readOnly, extraLabel) {
  var itemState = getMedkitItem(mode, memberId, item.id);
  var status = getMedkitItemStatus(itemState);
  var color = getMedkitItemColor(status);
  var label = getMedkitStatusLabel(status);
  var meta = _mkDrugMeta(mode, item, itemState, status, color, extraLabel);
  var canDel = item.custom && !readOnly;
  var h = '<div class="mk-drug' + (canDel ? ' mk-swipe' : '') + '" data-item="' + item.id + '">';
  h += '<button type="button" class="mk-check' + (itemState.checked ? ' on' : '') + '" role="checkbox" aria-checked="' + !!itemState.checked + '" aria-label="Собрано"'
    + (readOnly ? ' disabled' : ' onclick="toggleMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',event)"') + '>' + UIUtils.ico('check') + '</button>';
  h += '<button type="button" class="mk-drug-main" onclick="openMedkitDrug(\'' + item.id + '\')">'
    + '<span class="mk-drug-txt"><span class="mk-drug-name">' + escHtml(item.name) + '</span>'
    + (meta ? '<span class="mk-drug-meta">' + meta + '</span>' : '') + '</span>'
    + (label ? '<span class="mk-badge mk-badge--' + (color === 'danger' ? 'danger' : 'warn') + '">' + label + '</span>' : '')
    + UIUtils.ico('chevron-right', 'mk-chev') + '</button>';
  if (canDel) h += '<button type="button" class="mk-del" aria-label="Удалить препарат" onclick="deleteMedkitCustomItem(\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\',event)"></button>';
  return h + '</div>';
}

// --- Список по категориям ---

function rMedkitGroups(mode, memberId, sections, readOnly) {
  var h = '';
  var filtering = _mkFilterActive();
  var shown = 0;

  for (var s = 0; s < sections.length; s++) {
    var group = sections[s].group;
    var entries = sections[s].items;
    var matches = entries.filter(function(it) { return applyMedkitItemFilters(it, getMedkitItem(mode, memberId, it.id)); });
    // При поиске/фильтре — только категории с совпадениями, и сразу раскрытые.
    if (filtering && !matches.length) continue;
    shown++;
    var open = filtering || isGroupOpen(group.id);
    var done = entries.filter(function(it) { return getMedkitItem(mode, memberId, it.id).checked; }).length;
    var full = entries.length && done === entries.length;

    h += '<section class="mk-card mk-group' + (open ? ' open' : '') + '" data-group="' + group.id + '">';
    h += '<button type="button" class="mk-group-hd" aria-expanded="' + open + '" onclick="toggleMedkitGroupCollapse(\'' + group.id + '\')">'
      + '<span class="mk-group-t">' + escHtml(group.label) + '</span>'
      + '<span class="mk-group-n' + (full ? ' full' : '') + '">' + done + '/' + entries.length + '</span>'
      + UIUtils.ico(open ? 'chevron-up' : 'chevron-down', 'mk-group-chev') + '</button>';
    h += '<div class="mk-group-body">';
    if (group.id === 'supplements' && mode === 'personal') h += rMedkitStack(memberId, entries, readOnly);
    for (var i = 0; i < matches.length; i++) h += rMedkitDrugRow(mode, memberId, matches[i], readOnly);
    if (!entries.length) h += '<p class="mk-empty">В категории пока пусто</p>';

    if (!readOnly) {
      if (!group.pseudo) {
        h += '<button type="button" class="mk-add-btn" onclick="toggleMedkitAddRow(\'' + group.id + '\')">' + UIUtils.ico('plus') + ' Добавить препарат</button>';
        h += '<div class="mk-add-form" id="addDrugForm_' + group.id + '">'
          + '<input type="text" id="addDrugInput_' + group.id + '" placeholder="Название препарата" aria-label="Название препарата"'
          + ' onkeydown="if(event.key===\'Enter\'){this.nextElementSibling.click()}">'
          + '<button type="button" onclick="addMedkitCustomItem(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\',document.getElementById(\'addDrugInput_' + group.id + '\').value)">Добавить</button></div>';
        h += '<div class="mk-group-actions">';
        h += '<button type="button" onclick="hideMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\',event)">Скрыть категорию</button>';
        if (_mkIsOptional(mode, group)) {
          h += '<button type="button" class="danger" onclick="disableMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + group.id + '\')">Отключить' + (group.id === 'supplements' ? ' вместе со стеком' : '') + '</button>';
        }
        h += '</div>';
      }
    }
    h += '</div></section>';
  }
  if (filtering && !shown) h += '<p class="mk-empty mk-empty--page">Ничего не нашлось</p>';

  if (!filtering) {
    h += rMedkitOptional(mode, memberId, readOnly);
    h += rMedkitHiddenRow(mode, memberId, readOnly);
    if (!readOnly) {
      h += '<button type="button" class="mk-dashed mk-dashed--center" onclick="showAddMedkitGroup()">' + UIUtils.ico('plus') + ' Своя категория</button>';
      h += '<p class="mk-hint">Нажми на препарат — остаток, срок, место и справка.' + (mode === 'personal' ? ' У «БАДов» внутри — расписание приёма по дням.' : '') + '</p>';
    }
  }
  return h;
}

// «Можно подключить: …» — опциональные категории, которые не включены.
function rMedkitOptional(mode, memberId, readOnly) {
  if (readOnly) return '';
  var list = MEDKIT_BASE.filter(function(g) {
    return g.availableIn.indexOf(mode) >= 0 && _mkIsOptional(mode, g) && !isGroupEnabled(mode, memberId, g.id);
  });
  if (!list.length) return '';
  var h = '<details class="mk-more"><summary class="mk-dashed">Можно подключить: ' + escHtml(list.map(function(g) { return g.label; }).join(', ')) + UIUtils.ico('chevron-down', 'mk-chev') + '</summary>';
  h += '<div class="mk-card mk-more-body">';
  list.forEach(function(g) {
    h += '<div class="mk-line"><span class="mk-line-t">' + escHtml(g.label) + '<small>' + g.items.length + ' ' + _mkPlural(g.items.length, 'препарат', 'препарата', 'препаратов') + '</small></span>'
      + '<button type="button" class="mk-line-b" onclick="enableMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + g.id + '\')">Подключить</button></div>';
  });
  return h + '</div></details>';
}

// Скрытые категории и препараты текущей аптечки — для строки внизу списка
// и для листа «Категории».
function _mkHiddenLists(mode, memberId) {
  var state = getMedkitState(mode, memberId);
  var groups = [], items = [];
  MEDKIT_BASE.forEach(function(g) {
    if (g.availableIn.indexOf(mode) < 0) return;
    if (isGroupHidden(mode, memberId, g.id) && isGroupEnabled(mode, memberId, g.id)) groups.push(g);
    g.items.forEach(function(it) {
      if (isItemHidden(mode, memberId, it.id)) items.push({ id: it.id, name: it.name, group: g.label, custom: false });
    });
  });
  state.customItems.forEach(function(ci) {
    if (isItemHidden(mode, memberId, ci.id)) items.push({ id: ci.id, name: ci.name, group: 'Добавленные', custom: true });
  });
  return { groups: groups, items: items };
}

function _mkHiddenItemsHtml(mode, memberId, items) {
  return items.map(function(it) {
    return '<div class="mk-line' + (it.custom ? ' mk-swipe' : '') + '"><span class="mk-line-t">' + escHtml(it.name) + '<small>' + escHtml(it.group) + '</small></span>'
      + '<button type="button" class="mk-line-b" onclick="restoreMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + it.id + '\')">Вернуть</button>'
      + (it.custom ? '<button type="button" class="mk-del" aria-label="Удалить препарат" onclick="deleteMedkitCustomItem(\'' + mode + '\',\'' + memberId + '\',\'' + it.id + '\',event)"></button>' : '')
      + '</div>';
  }).join('');
}

// «Скрыто: Обезбол, Сон и 2 препарата — показать».
function rMedkitHiddenRow(mode, memberId, readOnly) {
  if (readOnly) return '';
  var hid = _mkHiddenLists(mode, memberId);
  if (!hid.groups.length && !hid.items.length) return '';
  var parts = hid.groups.map(function(g) { return g.label; });
  var n = hid.items.length;
  var itemsTxt = n ? n + ' ' + _mkPlural(n, 'препарат', 'препарата', 'препаратов') : '';
  var txt = parts.length ? 'Скрыто: ' + parts.join(', ') + (itemsTxt ? ' и ' + itemsTxt : '') : 'Скрыто ' + itemsTxt;
  var h = '<details class="mk-more"><summary class="mk-dashed mk-dashed--quiet">' + escHtml(txt) + ' — показать' + UIUtils.ico('chevron-down', 'mk-chev') + '</summary>';
  h += '<div class="mk-card mk-more-body">';
  hid.groups.forEach(function(g) {
    h += '<div class="mk-line"><span class="mk-line-t">' + escHtml(g.label) + '<small>категория</small></span>'
      + '<button type="button" class="mk-line-b" onclick="restoreMedkitGroup(\'' + mode + '\',\'' + memberId + '\',\'' + g.id + '\')">Вернуть</button></div>';
  });
  h += _mkHiddenItemsHtml(mode, memberId, hid.items);
  return h + '</div></details>';
}

// --- Стек БАДов: внутри категории «БАДы / витамины» (макет V2MedkitStack) ---
function rMedkitStack(memberId, entries, readOnly) {
  var state = getMedkitState('personal', memberId);
  if (state.hiddenGroups && state.hiddenGroups['stack']) return '';
  if (!entries.length) return '';

  var byTime = { 'Утро': [], 'День': [], 'Вечер': [] };
  entries.forEach(function(item) {
    var st = getMedkitItem('personal', memberId, item.id);
    var t = st.slot_time || 'Утро';
    if (!byTime[t]) byTime[t] = [];
    byTime[t].push({ item: item, state: st });
  });

  var dayLabels = [['Пн','mon'],['Вт','tue'],['Ср','wed'],['Чт','thu'],['Пт','fri'],['Сб','sat'],['Вс','sun']];
  var h = '<div class="mk-stack' + (medkitStackCollapsed ? '' : ' open') + '">';
  h += '<button type="button" class="mk-stack-hd" aria-expanded="' + !medkitStackCollapsed + '" onclick="toggleMedkitStack()"><span class="mk-stack-t">Расписание приёма</span>'
    + '<span class="mk-stack-s">по дням недели</span>' + UIUtils.ico('chevron-down', 'mk-chev') + '</button>';
  h += '<div class="mk-stack-body">';
  ['Утро', 'День', 'Вечер'].forEach(function(t) {
    if (!byTime[t].length) return;
    h += '<div class="mk-caps">' + t + '</div>';
    byTime[t].forEach(function(e) {
      h += '<div class="mk-supp"><div class="mk-supp-top"><span class="mk-supp-n">' + escHtml(e.item.name) + '</span>'
        + (e.state.how ? '<span class="mk-supp-h">' + escHtml(e.state.how) + '</span>' : '') + '</div><div class="mk-days">';
      dayLabels.forEach(function(d) {
        var on = !!(e.state.taken && e.state.taken[d[1]]);
        h += '<button type="button" class="mk-day' + (on ? ' on' : '') + '" aria-pressed="' + on + '"'
          + (readOnly ? ' disabled' : ' onclick="toggleMedkitTakenDay(\'personal\',\'' + memberId + '\',\'' + e.item.id + '\',\'' + d[1] + '\',event)"') + '>' + d[0] + '</button>';
      });
      h += '</div></div>';
    });
  });
  return h + '</div></div>';
}

// --- По местам хранения ---
var medkitClosedSlots = {};

function toggleMedkitSlotBlock(slotId) {
  medkitClosedSlots[slotId] = !medkitClosedSlots[slotId];
  rMedkit();
}

function rMedkitBySlots(mode, memberId, sections, readOnly) {
  var entries = [];
  sections.forEach(function(s) {
    s.items.forEach(function(it) {
      var st = getMedkitItem(mode, memberId, it.id);
      if (applyMedkitItemFilters(it, st)) entries.push({ item: it, state: st, group: s.group.label });
    });
  });
  var slots = getSlotsFor(mode);
  var known = {};
  var h = '';
  var block = function(key, icon, name, list, defaultClosed) {
    var closed = medkitClosedSlots[key] === undefined ? !!defaultClosed : medkitClosedSlots[key];
    var done = list.filter(function(e) { return e.state.checked; }).length;
    var meta = list.length ? list.length + ' ' + _mkPlural(list.length, 'препарат', 'препарата', 'препаратов') + ' · ' + done + ' собрано' : 'пусто';
    var b = '<section class="mk-card mk-group mk-slot' + (closed ? '' : ' open') + '">';
    b += '<button type="button" class="mk-group-hd" aria-expanded="' + !closed + '" onclick="medkitClosedSlots[\'' + key + '\']=' + !closed + ';rMedkit()">'
      + '<span class="mk-slot-ico">' + icon + '</span><span class="mk-group-t">' + escHtml(name) + '<small>' + meta + '</small></span>'
      + UIUtils.ico(closed ? 'chevron-down' : 'chevron-up', 'mk-group-chev') + '</button><div class="mk-group-body">';
    if (!list.length) b += '<p class="mk-empty">Сюда пока ничего не положили</p>';
    list.forEach(function(e) { b += rMedkitDrugRow(mode, memberId, e.item, readOnly, e.group); });
    return b + '</div></section>';
  };
  slots.forEach(function(slot) {
    known[slot.id] = true;
    h += block(slot.id, UIUtils.emojiIcon(slot.icon), slot.label, entries.filter(function(e) { return e.state.slot === slot.id; }));
  });
  var loose = entries.filter(function(e) { return !e.state.slot || !known[e.state.slot]; });
  if (loose.length) h += block('__none', UIUtils.ico('help-circle'), 'Место не указано', loose, true);
  if (!readOnly) {
    h += '<button type="button" class="mk-dashed mk-dashed--center" onclick="showAddMedkitSlot(\'' + mode + '\')">' + UIUtils.ico('plus') + ' Место хранения</button>';
  }
  return h;
}

// ===== Карточка препарата — лист поверх списка (макет V2MedkitDrug) =====
var _mkSheet = null; // { mode, memberId, itemId }

function _mkFindItem(mode, memberId, itemId) {
  for (var g = 0; g < MEDKIT_BASE.length; g++) {
    for (var i = 0; i < MEDKIT_BASE[g].items.length; i++) {
      if (MEDKIT_BASE[g].items[i].id === itemId) return { item: MEDKIT_BASE[g].items[i], group: MEDKIT_BASE[g] };
    }
  }
  var state = getMedkitState(mode, memberId);
  for (var c = 0; c < state.customItems.length; c++) {
    var ci = state.customItems[c];
    if (ci.id === itemId) {
      var grp = null;
      for (var k = 0; k < MEDKIT_BASE.length; k++) if (MEDKIT_BASE[k].id === ci.groupId) grp = MEDKIT_BASE[k];
      return { item: ci, group: grp || { id: '__other', label: 'Другое', items: [] } };
    }
  }
  return null;
}

function openMedkitDrug(itemId) {
  _mkSheet = { mode: medkitMode, memberId: medkitMemberId, itemId: itemId };
  document.getElementById('mkDrugOverlay')?.remove();
  var overlay = document.createElement('div');
  overlay.className = 'mk-import-overlay';
  overlay.id = 'mkDrugOverlay';
  overlay.innerHTML = '<section class="mk-import-sheet mk-drug-sheet" role="dialog" id="mkDrugSheet"></section>';
  document.body.appendChild(overlay);
  _mkSyncSheet(true);
  requestAnimationFrame(function() { overlay.classList.add('open'); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMedkitDrug(); });
}

function closeMedkitDrug() {
  _mkSheet = null;
  var overlay = document.getElementById('mkDrugOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function() { overlay.remove(); }, 250);
}

// full=true — перерисовать лист целиком; false — только если в нём никто
// не печатает (обновление с сервера), иначе — лишь «живые» части
// (галочка, плашка статуса, единицы), чтобы не сбить ввод.
function _mkSyncSheet(full) {
  if (!_mkSheet) return;
  var sheet = document.getElementById('mkDrugSheet');
  if (!sheet) return;
  var found = _mkFindItem(_mkSheet.mode, _mkSheet.memberId, _mkSheet.itemId);
  if (!found) { closeMedkitDrug(); return; }
  var typing = sheet.contains(document.activeElement) && /INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName);
  if (full || !typing) {
    sheet.innerHTML = _mkDrugSheetHtml(_mkSheet.mode, _mkSheet.memberId, found.item, found.group);
    return;
  }
  var st = getMedkitItem(_mkSheet.mode, _mkSheet.memberId, _mkSheet.itemId);
  var chk = sheet.querySelector('.mk-sheet-check');
  if (chk) chk.outerHTML = _mkSheetCheckHtml(_mkSheet.mode, _mkSheet.memberId, _mkSheet.itemId, st);
  var stEl = document.getElementById('mkDrugStatus');
  if (stEl) stEl.outerHTML = _mkStatusHtml(st);
  sheet.querySelectorAll('.mk-unit-txt').forEach(function(u) { u.textContent = st.unit || ''; });
}

function _mkSheetCheckHtml(mode, memberId, itemId, st) {
  var ro = !_canEditMedkit(mode, memberId);
  return '<button type="button" class="mk-sheet-check" role="checkbox" aria-checked="' + !!st.checked + '"'
    + (ro ? ' disabled' : ' onclick="toggleMedkitItem(\'' + mode + '\',\'' + memberId + '\',\'' + itemId + '\',event)"') + '>'
    + '<span class="mk-check' + (st.checked ? ' on' : '') + '">' + UIUtils.ico('check') + '</span>Собрано в аптечку</button>';
}

// Плашка статуса понятными словами: «Мало — осталось на ~4 приёма».
function _mkStatusHtml(st) {
  var status = getMedkitItemStatus(st);
  var lines = [];
  var sv = _mkServings(st);
  var svTxt = sv !== null ? 'осталось на ~' + sv + ' ' + _mkPlural(sv, 'приём', 'приёма', 'приёмов') : '';
  if (status.stock === 'empty') lines.push(['danger', 'Закончился', 'пора пополнить']);
  else if (status.stock === 'critical') lines.push(['warn', 'Почти закончился', svTxt + ' (меньше 2)']);
  else if (status.stock === 'warning') lines.push(['warn', 'Мало', svTxt + ' (меньше 5)']);
  var e = _mkParseExpiry(st.expiry);
  if (e && status.expiry) {
    var when = MK_MONTHS_GEN[e.m - 1] + (e.y !== new Date().getFullYear() ? ' ' + e.y : '');
    if (status.expiry === 'expired') lines.push(['danger', 'Срок истёк', 'годен был до ' + when]);
    else if (status.expiry === 'critical') lines.push(['warn', 'Скоро истечёт', 'срок до ' + when + ', меньше месяца']);
    else lines.push(['warn', 'Скоро истечёт', 'срок до ' + when + ', меньше 3 месяцев']);
  }
  if (!lines.length) return '<div id="mkDrugStatus" hidden></div>';
  var danger = lines.some(function(l) { return l[0] === 'danger'; });
  return '<div id="mkDrugStatus" class="mk-status' + (danger ? ' danger' : '') + '" role="status">'
    + lines.map(function(l) { return '<span><b class="mk-tone-' + l[0] + '">' + l[1] + '</b> — ' + escHtml(l[2]) + '</span>'; }).join('') + '</div>';
}

function _mkDrugSheetHtml(mode, memberId, item, group) {
  var st = getMedkitItem(mode, memberId, item.id);
  var ro = !_canEditMedkit(mode, memberId);
  var dis = ro ? ' disabled' : '';
  var info = MEDKIT_INFO[item.id] || null;
  var args = '\'' + mode + '\',\'' + memberId + '\',\'' + item.id + '\'';
  var units = ['', 'таб', 'капс', 'амп', 'мл', 'мг', 'г', 'шт', 'фл', 'тюб', 'саше', 'пак'];
  var sub = escHtml(group.label) + (info && info.label ? ' · ' + escHtml(info.label) : '');

  var h = '<div class="mk-import-sheet__handle"></div>';
  h += '<div class="mk-sheet-head"><div class="mk-sheet-head-l"><h2 class="mk-sheet-title">' + escHtml(item.name) + '</h2><span class="mk-sheet-sub">' + sub + '</span></div>'
    + '<button type="button" class="mk-sheet-x" aria-label="Закрыть" onclick="closeMedkitDrug()">' + UIUtils.ico('x') + '</button></div>';
  h += '<div class="mk-sheet-body">';
  if (ro) h += '<p class="mk-hint">Аптечка ' + escHtml(getMemberName(memberId)) + ' — только просмотр</p>';
  h += _mkSheetCheckHtml(mode, memberId, item.id, st);
  h += _mkStatusHtml(st);

  var field = function(label, fn, val, suffix, extra) {
    return '<label class="mk-field"><span class="mk-field-l">' + label + '</span><span class="mk-field-v">'
      + '<input value="' + escHtml(val || '') + '" placeholder="—" aria-label="' + label + '"' + (extra || '') + dis
      + ' onchange="' + fn + '(' + args + ',this.value)">' + (suffix || '') + '</span></label>';
  };
  var unitSel = '<select class="mk-unit" aria-label="Единица"' + dis + ' onchange="updateMedkitUnit(' + args + ',this.value)">'
    + units.map(function(u) { return '<option value="' + u + '"' + ((st.unit || '') === u ? ' selected' : '') + '>' + (u || 'ед.') + '</option>'; }).join('') + '</select>';
  var unitTxt = '<span class="mk-unit-txt">' + escHtml(st.unit || '') + '</span>';
  h += '<div class="mk-fields">';
  h += field('Было', 'updateMedkitTotal', st.total, unitSel, ' inputmode="decimal"');
  h += field('Осталось', 'updateMedkitLeft', st.left, unitTxt, ' inputmode="decimal"');
  h += field('На один приём', 'updateMedkitDose', st.dose, unitTxt, ' inputmode="decimal"');
  h += '<label class="mk-field"><span class="mk-field-l">Годен до</span><span class="mk-field-v"><input type="month" aria-label="Годен до" value="' + escHtml(/^\d{4}-\d{2}$/.test(st.expiry || '') ? st.expiry : '') + '"' + dis
    + ' onchange="updateMedkitExpiry(' + args + ',this.value)"></span></label>';
  h += '</div>';

  var slots = getSlotsFor(mode);
  h += '<label class="mk-field mk-field--sel"><span class="mk-field-l">Где лежит</span><span class="mk-field-v"><select aria-label="Где лежит"' + dis + ' onchange="updateMedkitSlot(' + args + ',this.value)">'
    + '<option value="">Не указано</option>'
    + slots.map(function(s) { return '<option value="' + s.id + '"' + ((st.slot || '') === s.id ? ' selected' : '') + '>' + escHtml(s.label) + '</option>'; }).join('')
    + '</select>' + UIUtils.ico('chevron-down', 'mk-chev') + '</span></label>';

  // Поля БАДов: когда пить и как — отсюда строится расписание приёма.
  if (mode === 'personal' && group.id === 'supplements') {
    var sel = function(label, fn, cur, opts) {
      return '<label class="mk-field mk-field--sel"><span class="mk-field-l">' + label + '</span><span class="mk-field-v"><select aria-label="' + label + '"' + dis + ' onchange="' + fn + '(' + args + ',this.value)">'
        + opts.map(function(o) { return '<option value="' + o[0] + '"' + (cur === o[0] ? ' selected' : '') + '>' + o[1] + '</option>'; }).join('')
        + '</select>' + UIUtils.ico('chevron-down', 'mk-chev') + '</span></label>';
    };
    h += '<div class="mk-fields">';
    h += sel('Когда пить', 'updateMedkitSlotTime', st.slot_time || 'Утро', [['Утро', 'Утро'], ['День', 'День'], ['Вечер', 'Вечер']]);
    h += sel('Как принимать', 'updateMedkitHow', st.how || '', [['', 'не указано'], ['натощак', 'натощак'], ['до еды', 'до еды'], ['во время еды', 'во время еды'], ['после еды', 'после еды'], ['перед сном', 'перед сном']]);
    h += '</div>';
  }

  h += field('Комментарий', 'updateMedkitNote', st.note, '', ' placeholder="необязательно"').replace(' placeholder="—"', '');

  if (info) {
    var row = function(l, v, cls) { return v ? '<div class="mk-ref-row"><span class="mk-ref-l' + (cls || '') + '">' + l + '</span><span>' + escHtml(v) + '</span></div>' : ''; };
    h += '<details class="mk-ref" open><summary>Справка о препарате' + UIUtils.ico('chevron-down', 'mk-chev') + '</summary><div class="mk-ref-body">'
      + row('Для чего', info.purpose) + row('При симптомах', info.symptoms) + row('Как принимать', info.how)
      + row('Куда колоть', info.where) + row('Чем заменить', info.replace) + row('Важно', info.warn, ' danger')
      + '</div></details>';
  }

  if (!ro) {
    h += '<div class="mk-sheet-actions"><button type="button" class="mk-text-btn" onclick="hideMedkitItem(' + args + ',event);closeMedkitDrug()">Скрыть из списка</button>';
    if (item.custom) h += '<button type="button" class="mk-text-btn danger" onclick="confirmDeleteMedkitCustomItem(' + args + ')">Удалить препарат</button>';
    h += '</div>';
  }
  return h + '</div>';
}

function confirmDeleteMedkitCustomItem(mode, memberId, itemId) {
  UIUtils.confirmSheet('Препарат и все его данные (остаток, срок, место) будут удалены.', { title: 'Удалить препарат?' }).then(function(ok) {
    if (!ok) return;
    closeMedkitDrug();
    deleteMedkitCustomItem(mode, memberId, itemId);
  });
}

// ===== «Что делать» (макет V2MedkitSOS) =====
var emergencySearch = '';
var emergencyType = '';

function rMedkitReference() {
  // 112 — первым и крупно: в экстренной ситуации он нужен сразу.
  var h = '<a href="tel:112" class="mk-sos">' + UIUtils.ico('phone') + '<span><b>Позвонить 112</b><small>единый номер экстренных служб</small></span></a>';
  h += '<div class="mk-phones">';
  h += '<a href="tel:103"><b>103</b><small>Скорая</small></a>';
  h += '<a href="tel:101"><b>101</b><small>МЧС</small></a>';
  h += '<a href="tel:102"><b>102</b><small>Полиция</small></a>';
  h += '</div>';
  h += '<label class="mk-search">' + UIUtils.ico('search') + '<input class="si-i" placeholder="Кровотечение, укус, ожог…" aria-label="Поиск ситуации" value="' + escHtml(emergencySearch) + '" oninput="filterEmergency(this.value)"></label>';
  h += '<div class="mk-pills" id="mkEmPills">' + _mkEmPills() + '</div>';
  h += '<div id="emergencyList">' + rEmergencyList(_mkEmFiltered()) + '</div>';
  return h;
}

function _mkEmPills() {
  return [['', 'Все', ''], ['danger', 'Критично', ' mk-pill--danger'], ['warning', 'Внимание', ' mk-pill--warn']].map(function(p) {
    var on = emergencyType === p[0];
    return '<button type="button" class="mk-pill' + p[2] + (on ? ' on' : '') + '" aria-pressed="' + on + '" onclick="filterEmergencyType(\'' + p[0] + '\')">' + p[1] + '</button>';
  }).join('');
}

function rEmergencyList(list) {
  if (!list.length) return '<p class="mk-empty mk-empty--page">Ничего не нашлось</p>';
  var counts = {};
  list.forEach(function(em) { counts[em.group] = (counts[em.group] || 0) + 1; });
  var h = '';
  var currentGroup = null;
  for (var i = 0; i < list.length; i++) {
    var em = list[i];
    if (em.group !== currentGroup) {
      if (currentGroup !== null) h += '</div>';
      currentGroup = em.group;
      h += '<div class="mk-caps mk-caps--sec">' + escHtml(currentGroup) + ' · ' + counts[currentGroup] + '</div><div class="mk-card">';
    }
    var tone = em.priority === 'danger' ? 'danger' : em.priority === 'warning' ? 'warn' : 'info';
    h += '<div class="mk-em">';
    h += '<button type="button" class="mk-em-hd" aria-expanded="false" onclick="toggleMedkitEm(this)"><span class="mk-em-bar ' + tone + '"></span>'
      + '<span class="mk-em-txt"><span class="mk-em-t">' + escHtml(em.title) + '</span><span class="mk-em-s">' + escHtml(em.sub) + '</span></span>'
      + (tone === 'danger' ? '<span class="mk-badge mk-badge--danger">критично</span>' : '')
      + UIUtils.ico('chevron-down', 'mk-chev') + '</button>';
    h += '<div class="mk-em-body">';
    for (var s = 0; s < em.steps.length; s++) {
      var step = em.steps[s];
      h += '<div class="mk-step' + (step.critical ? ' crit' : '') + '"><span class="mk-step-n">' + (s + 1) + '</span><span class="mk-step-t">' + escHtml(step.text) + '</span></div>';
    }
    if (em.drugs.length || em.call112) {
      h += '<div class="mk-em-foot">';
      if (em.drugs.length) {
        h += '<span class="mk-em-from">Из аптечки:</span>';
        for (var d = 0; d < em.drugs.length; d++) {
          var found = _mkFindItem('common', '', em.drugs[d]);
          h += '<span class="mk-tag">' + escHtml(found ? found.item.name : em.drugs[d]) + '</span>';
        }
      }
      if (em.call112) h += '<a href="tel:112" class="mk-call112">' + UIUtils.ico('phone') + '112</a>';
      h += '</div>';
    }
    h += '</div></div>';
  }
  if (currentGroup !== null) h += '</div>';
  return h;
}

function toggleMedkitEm(btn) {
  var card = btn.parentNode;
  var open = card.classList.toggle('open');
  btn.setAttribute('aria-expanded', open);
}

function filterEmergency(q) {
  emergencySearch = q.toLowerCase();
  updateEmergencyList();
}

function filterEmergencyType(type) {
  emergencyType = type;
  var pills = document.getElementById('mkEmPills');
  if (pills) pills.innerHTML = _mkEmPills();
  updateEmergencyList();
}

function _mkEmFiltered() {
  return EMERGENCY.filter(function(em) {
    if (emergencySearch && (em.title + ' ' + em.sub).toLowerCase().indexOf(emergencySearch) < 0) return false;
    if (emergencyType && em.priority !== emergencyType) return false;
    return true;
  });
}

function updateEmergencyList() {
  var el = document.getElementById('emergencyList');
  if (el) el.innerHTML = rEmergencyList(_mkEmFiltered());
}

// ===== Маленький лист «введи название» вместо нативного prompt() =====
function _mkAsk(title, placeholder, okLabel) {
  return new Promise(function(resolve) {
    document.getElementById('mkAskOverlay')?.remove();
    var overlay = document.createElement('div');
    overlay.className = 'mk-import-overlay';
    overlay.id = 'mkAskOverlay';
    overlay.innerHTML = '<div class="mk-import-sheet"><div class="mk-import-sheet__handle"></div>'
      + '<div class="mk-sheet-head"><h2 class="mk-sheet-title">' + escHtml(title) + '</h2>'
      + '<button type="button" class="mk-sheet-x" aria-label="Закрыть" data-ask="cancel">' + UIUtils.ico('x') + '</button></div>'
      + '<div class="mk-sheet-body"><input class="mk-input" id="mkAskInput" placeholder="' + escHtml(placeholder) + '" aria-label="' + escHtml(title) + '">'
      + '<button type="button" class="mk-import-btn" data-ask="ok">' + escHtml(okLabel || 'Добавить') + '</button></div></div>';
    document.body.appendChild(overlay);
    requestAnimationFrame(function() { overlay.classList.add('open'); });
    var input = overlay.querySelector('#mkAskInput');
    setTimeout(function() { input.focus(); }, 50);
    var done = function(val) {
      overlay.classList.remove('open');
      setTimeout(function() { overlay.remove(); }, 250);
      resolve(val);
    };
    input.addEventListener('keydown', function(e) { if (e.key === 'Enter') done(input.value); });
    overlay.addEventListener('click', function(e) {
      if (e.target === overlay) return done(null);
      var a = e.target.closest('[data-ask]');
      if (a) done(a.dataset.ask === 'ok' ? input.value : null);
    });
  });
}

function showAddMedkitGroup() {
  _mkAsk('Своя категория', 'Например, «Горы / высота»', 'Добавить').then(function(label) {
    if (!addCustomGroup(label)) return;
    saveMedkit();
    rMedkit();
    if (document.getElementById('mkPickerOverlay')) _mkRefreshPicker();
  });
}

function showAddMedkitSlot(mode) {
  _mkAsk('Место хранения', 'Например, «Гермомешок №2»', 'Добавить').then(function(label) {
    if (!addCustomSlot(mode || medkitMode, label)) return;
    saveMedkit();
    rMedkit();
    if (document.getElementById('mkSlotsOverlay')) _mkRefreshSlotsSheet();
  });
}

// ===== Лист «Места хранения» (из «…») =====
function showMedkitSlotsSheet() {
  if (medkitMode === 'reference') return;
  document.getElementById('mkSlotsOverlay')?.remove();
  var overlay = document.createElement('div');
  overlay.className = 'mk-import-overlay';
  overlay.id = 'mkSlotsOverlay';
  overlay.innerHTML = '<div class="mk-import-sheet" id="mkSlotsSheet"></div>';
  document.body.appendChild(overlay);
  _mkRefreshSlotsSheet();
  UIUtils.swipeToDelete(overlay, '.mk-swipe', '.mk-del');
  requestAnimationFrame(function() { overlay.classList.add('open'); });
  overlay.addEventListener('click', function(e) { if (e.target === overlay) closeMedkitSlotsSheet(); });
}

function closeMedkitSlotsSheet() {
  var overlay = document.getElementById('mkSlotsOverlay');
  if (!overlay) return;
  overlay.classList.remove('open');
  setTimeout(function() { overlay.remove(); }, 250);
}

function _mkRefreshSlotsSheet() {
  var sheet = document.getElementById('mkSlotsSheet');
  if (!sheet) return;
  var mode = medkitMode, memberId = medkitMemberId;
  var state = getMedkitState(mode, memberId);
  var rows = getSlotsFor(mode).map(function(s) {
    var n = Object.keys(state.items).filter(function(k) { return state.items[k] && state.items[k].slot === s.id; }).length;
    return '<div class="mk-line' + (s.custom ? ' mk-swipe' : '') + '"><span class="mk-slot-ico">' + UIUtils.emojiIcon(s.icon) + '</span>'
      + '<span class="mk-line-t">' + escHtml(s.label) + '<small>' + (n ? n + ' ' + _mkPlural(n, 'препарат', 'препарата', 'препаратов') : 'пусто') + (s.custom ? ' · своё' : '') + '</small></span>'
      + (s.custom ? '<button type="button" class="mk-del" aria-label="Удалить место" onclick="removeMedkitSlot(\'' + mode + '\',\'' + s.id + '\');_mkRefreshSlotsSheet()"></button>' : '')
      + '</div>';
  }).join('');
  sheet.innerHTML = '<div class="mk-import-sheet__handle"></div>'
    + '<div class="mk-sheet-head"><div class="mk-sheet-head-l"><h2 class="mk-sheet-title">Места хранения</h2><span class="mk-sheet-sub">' + (mode === 'personal' ? 'личной аптечки' : 'общей аптечки') + '</span></div>'
    + '<button type="button" class="mk-sheet-x" aria-label="Закрыть" onclick="closeMedkitSlotsSheet()">' + UIUtils.ico('x') + '</button></div>'
    + '<div class="mk-sheet-body"><div class="mk-list">' + rows + '</div>'
    + '<p class="mk-hint">Свои места удаляются свайпом влево. Препараты из удалённого места попадут в «Место не указано».</p>'
    + '<button type="button" class="mk-text-btn accent" onclick="showAddMedkitSlot(\'' + mode + '\')">+ Место хранения</button></div>';
}

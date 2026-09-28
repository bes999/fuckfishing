'use strict';
/* globals GearData, GearRender, TripsData, UIUtils, ActivityLog */

const GearModule = (() => {
  var _uid        = null;
  var _isMe       = false;
  var _container  = null;
  var _template   = null;
  var _activeTrip = 'template'; // 'template' (Вещи) | 'catalog' (Сумки) | tripId
  var _tripList   = [];
  var _scope      = 'personal'; // 'personal' | 'shared' — только внутри поездки
  var _tripMode   = 'cats';     // 'cats' | 'bags' — «По категориям / По сумкам»
  var _packMode   = 'there';    // 'there' | 'back' — сборы туда/обратно, только для своего списка
  var _sharedData = null;       // загруженный общий список текущей поездки
  var _sharedAddCatId = null;   // категория, в которую добавляем вещь (лист)
  var _pickMode     = false;    // мастер «Собрать список на поездку»
  var _pickStep     = 'items';  // 'items' | 'locations'
  var _pickTrip     = null;     // {id, name} — для какой поездки собираем
  var _pickSelected = [];       // id отмеченных вещей
  var _pickSelectedLocations = []; // id отмеченных сумок (из каталога)
  var _tripLocPickItemId = null; // какой вещи поездки назначаем сумку (пикер)
  var _open = {};               // раскрытые карточки: 'c:'/'t:'/'d:'/'s:'/'w:'/'b:' + id

  /* ── Инициализация ──
     openTrip — необязательный id поездки, на список которой сразу открыться
     (кнопка снаряги на обложке поездки, если список уже есть). */
  async function init(uid, isMe, container, openTrip) {
    _uid        = uid;
    _isMe       = isMe;
    _container  = container;
    _scope      = 'personal';
    _packMode   = 'there';
    _sharedData = null;
    _pickMode   = false;
    _pickStep   = 'items';
    _open       = {};
    await GearData.ensureLoaded(uid);
    _tripList   = GearData.getTripList(uid);
    _activeTrip = (openTrip && GearData.hasTripSnapshot(uid, openTrip)) ? openTrip : 'template';
    try {
      _template = await GearData.load(uid);
    } catch (err) {
      console.error('GearModule.init: не удалось загрузить снаряжение', err);
      if (_container) {
        _container.innerHTML = '<div class="gear-hint gear-hint-c">Не удалось загрузить снаряжение. Проверь соединение и открой вкладку заново.</div>';
      }
      return;
    }
    _render();
    // «Готовы N из M» нужна сразу при открытии списка поездки, не только
    // при переключении на вкладку «Общее» — подгружаем общий документ.
    if (_activeTrip !== 'template' && _activeTrip !== 'catalog') {
      try {
        _sharedData = await GearData.loadShared(_activeTrip);
      } catch (err) {
        console.error('GearData.loadShared:', err);
        _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [], ready: {} };
      }
      _render();
    }
  }

  // Собирает урезанный шаблон только из отмеченных вещей — плюс их
  // категории и цепочку сумок (включая родителей, иначе вложенный
  // «Несессер» останется без «Баула», в котором он лежит).
  function _buildPickedTemplate(template, selectedIds, selectedLocationIds) {
    var selSet = {};
    selectedIds.forEach(function(id) { selSet[id] = true; });
    var items = template.items.filter(function(i) { return selSet[i.id]; });
    var catSet = {};
    items.forEach(function(i) { if (i.categoryId) catSet[i.categoryId] = true; });
    var categories = template.categories.filter(function(c) { return catSet[c.id]; });
    var locSet = {};
    (selectedLocationIds || []).forEach(function(id) { locSet[id] = true; });
    var changed = true;
    while (changed) {
      changed = false;
      (template.locations || []).forEach(function(l) {
        if (locSet[l.id] && l.parentId && !locSet[l.parentId]) { locSet[l.parentId] = true; changed = true; }
      });
    }
    var locations = (template.locations || []).filter(function(l) { return locSet[l.id]; });
    return { locations: locations, categories: categories, items: items };
  }

  function _trip(id) {
    return (typeof TripsData !== 'undefined' && TripsData.getById) ? TripsData.getById(id) : null;
  }

  // Имя поездки — актуальное из TripsData (снимок хранит имя на момент сбора)
  function _tripName(id) {
    var t = _trip(id);
    if (t && t.name) return t.name;
    return (_tripList.find(function(x) { return x.id === id; }) || {}).name || 'Поездка';
  }

  // Строки блока «Списки на поездки»: свежие поездки сверху
  function _tripRows() {
    return _tripList.map(function(t) {
      var snap = GearData.getTripSnapshot(_uid, t.id) || { items: [] };
      var ids = {};
      (snap.items || []).forEach(function(i) { ids[i.id] = true; });
      var done = GearData.getChecked(_uid, t.id).filter(function(id) { return ids[id]; }).length;
      var trip = _trip(t.id);
      return { id: t.id, name: _tripName(t.id), done: done, total: (snap.items || []).length, start: (trip && trip.startDate) || '' };
    }).sort(function(a, b) { return a.start < b.start ? 1 : (a.start > b.start ? -1 : 0); });
  }

  function _render() {
    if (!_container) return;
    if (_pickMode) {
      _container.innerHTML = _pickStep === 'locations'
        ? GearRender.pickLocationsView(_template.locations || [], _pickSelectedLocations, _pickTrip.name, _pickSelected.length)
        : GearRender.pickView(_template, _pickSelected, _pickTrip.name, _open);
    } else if (_activeTrip === 'template' || _activeTrip === 'catalog') {
      _container.innerHTML = GearRender.rootView(_template, _tripRows(), _isMe, _activeTrip, _open);
    } else {
      var readyMap = GearData.getReady(_activeTrip) || {};
      var tripForReady = _trip(_activeTrip);
      var readyParticipants = ((tripForReady && tripForReady.participants) || []).filter(function(p) { return p && p.uid; });
      var readyNames = readyParticipants.filter(function(p) { return readyMap[p.uid]; }).map(function(p) { return p.name; });
      _container.innerHTML = GearRender.tripView({
        snap: GearData.getTripSnapshot(_uid, _activeTrip),
        checked: _packMode === 'back' ? GearData.getCheckedBack(_uid, _activeTrip) : GearData.getChecked(_uid, _activeTrip),
        tripName: _tripName(_activeTrip),
        scope: _isMe ? _scope : 'personal',
        shared: _sharedData,
        sharedChecked: (_sharedData && _sharedData.checked) || [],
        mode: _tripMode, isMe: _isMe, open: _open,
        packMode: _packMode,
        ready: { n: readyNames.length, m: readyParticipants.length, names: readyNames },
        readySelf: !!readyMap[_uid]
      });
    }
    // Удаление свайпом (привязывается к контейнеру один раз)
    if (typeof UIUtils !== 'undefined' && UIUtils.swipeToDelete) {
      UIUtils.swipeToDelete(_container, '.gear-swipe', '.gear-swipe-del');
    }
  }

  // При смене экрана — к началу, если шапка модуля уехала за верх
  function _scrollTop() {
    if (_container && _container.getBoundingClientRect().top < 0) _container.scrollIntoView();
  }

  async function _saveShared() {
    if (!_sharedData) return false;
    try {
      await GearData.saveShared(_activeTrip, _tripName(_activeTrip), _sharedData.categories, _sharedData.items);
      return true;
    } catch (err) {
      console.error('GearModule._saveShared: не удалось сохранить общий список', err);
      alert('Не удалось сохранить общий список. Проверь соединение и попробуй ещё раз.');
      return false;
    }
  }

  async function _save() {
    if (!_uid || !_template) return;
    try {
      await GearData.save(_uid, _template);
    } catch (err) {
      console.error('GearModule._save: сохранение снаряжения не удалось', err);
      alert('Не удалось сохранить снаряжение. Проверь соединение и попробуй ещё раз.');
      return;
    }
    if (window.APP && window.APP.profile && window.APP.profile.uid === _uid) {
      window.APP.profile.gearLocations  = _template.locations;
      window.APP.profile.gearCategories = _template.categories;
      window.APP.profile.gearItems      = _template.items;
    }
  }

  var _SHEET_IDS = ['gear-loc-sheet','gear-cat-sheet','gear-item-sheet','gear-pick-sheet','gear-ctx-sheet','gear-import-sheet','gear-triptarget-sheet'];

  function _closeAllSheets() {
    _SHEET_IDS.forEach(function(id) { var el = document.getElementById(id); if (el) el.remove(); });
  }

  function _closeSheet(id) {
    var el = document.getElementById(id);
    if (el) el.remove();
  }

  function _openSheet(html) {
    _closeAllSheets();
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  // Вложенный лист (пикер) поверх существующего, не закрывая его
  function _openSubSheet(html) {
    _closeSheet('gear-pick-sheet');
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  function _esc(s) { return GearRender._esc(s); }

  // Вещи категории в шаблоне (включая псевдо-категорию «Без категории»)
  function _catItems(catId) {
    var g = GearRender.groups(_template.categories, _template.items).find(function(x) { return x.cat.id === catId; });
    return g ? g.items : [];
  }

  // Разбирает вставленный текст на категории/вещи: строка, оканчивающаяся
  // двоеточием, открывает новую категорию, остальные непустые строки —
  // вещи в неё (bullets вроде "-"/"•"/"1." отбрасываются). Без заголовков
  // всё уходит в одну категорию "Импорт".
  function _parseImportText(text) {
    var lines = String(text || '').split('\n').map(function(l) { return l.trim(); }).filter(Boolean);
    var groups = [];
    var current = null;
    lines.forEach(function(line) {
      if (/:$/.test(line) && line.length < 60) {
        current = { name: line.replace(/:$/, '').trim(), items: [] };
        groups.push(current);
        return;
      }
      var item = line.replace(/^[-–—*•]\s*/, '').replace(/^\d+[.)]\s*/, '').trim();
      if (!item) return;
      if (!current) { current = { name: 'Импорт', items: [] }; groups.push(current); }
      current.items.push(item);
    });
    return groups;
  }

  // Чужая снаряга — только просмотр: пропускаем лишь навигацию.
  var _RO_OK = { 'gear-sheet-close': 1, 'gear-trip-switch': 1, 'gear-toggle': 1, 'gear-trip-mode': 1 };

  /* ══════════════════════════════════════════════
     СОБЫТИЯ — один глобальный обработчик
  ══════════════════════════════════════════════ */
  document.addEventListener('click', async function(e) {
    if (e.target.classList && e.target.classList.contains('gear-sheet-overlay')) {
      _closeAllSheets();
      return;
    }

    var t = e.target.closest('[data-action]');
    if (!t) return;
    var action = t.dataset.action;
    if (action.slice(0,5) !== 'gear-') return;
    if (!_uid) return;
    if (!_isMe && !_RO_OK[action]) return;

    if (action === 'gear-sheet-close') { _closeAllSheets(); return; }

    /* ── Навигация: Вещи / Сумки / список поездки / «Назад» ── */
    if (action === 'gear-trip-switch') {
      _activeTrip = t.dataset.trip;
      _scope = 'personal';
      _packMode = 'there';
      _sharedData = null;
      _render();
      _scrollTop();
      // Подгружаем общий документ (там же «Готовы N из M») сразу, не
      // только при переключении на вкладку «Общее».
      if (_activeTrip !== 'template' && _activeTrip !== 'catalog') {
        try {
          _sharedData = await GearData.loadShared(_activeTrip);
        } catch (err) {
          console.error('GearData.loadShared:', err);
          _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [], ready: {} };
        }
        _render();
      }
      return;
    }

    /* ── «Туда / Обратно» — раздельные отметки сборов, только свой список ── */
    if (action === 'gear-pack-mode') {
      var newPackMode = t.dataset.mode === 'back' ? 'back' : 'there';
      if (newPackMode === _packMode) return;
      _packMode = newPackMode;
      _render();
      return;
    }

    /* ── Раскрыть/свернуть карточку (категория, сумка, «Собрано») ── */
    if (action === 'gear-toggle') {
      _open[t.dataset.key] = t.dataset.open !== '1';
      _render();
      return;
    }

    /* ── «По категориям / По сумкам» ── */
    if (action === 'gear-trip-mode') {
      _tripMode = t.dataset.mode === 'bags' ? 'bags' : 'cats';
      _render();
      return;
    }

    /* ── «Моё / Общее» внутри поездки ── */
    if (action === 'gear-scope-switch') {
      var newScope = t.dataset.scope;
      if (newScope === _scope) return;
      _scope = newScope;
      if (_scope === 'shared' && (!_sharedData || _sharedData.tripId !== _activeTrip)) {
        try {
          _sharedData = await GearData.loadShared(_activeTrip);
        } catch (err) {
          console.error('GearData.loadShared:', err);
          _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
        }
      }
      _render();
      return;
    }

    /* ── «+» и «…» в шапке ── */
    if (action === 'gear-head-add') {
      if (_activeTrip === 'catalog') { _openSheet(GearRender.sheetAddLocation(_template, null)); return; }
      var firstCat = _template.categories[0];
      _openSheet(GearRender.sheetAddItem(_template, null, firstCat ? firstCat.id : ''));
      return;
    }

    if (action === 'gear-head-more') {
      _openSheet(GearRender.sheetActions('', [
        { action: 'gear-cat-add',     icon: 'layout-list', label: 'Новая категория' },
        { action: 'gear-import-open', icon: 'notes',       label: 'Импорт текстом' },
        { action: 'gear-loc-add',     icon: 'backpack',    label: 'Новая сумка' }
      ]));
      return;
    }

    if (action === 'gear-trip-more') {
      var moreActions;
      if (_scope === 'shared') {
        moreActions = [ { action: 'gear-shared-cat-add',       icon: 'layout-list',  label: 'Новая категория' },
                        { action: 'gear-shared-clear-checked', icon: 'circle-check', label: 'Снять все отметки' } ];
      } else if (_packMode === 'back') {
        // В режиме «Обратно» своя, отдельная от «Туда» отметка собранности —
        // синк из шаблона тут не при чём (он пополняет только личный список).
        moreActions = [ { action: 'gear-clear-checked-back', icon: 'circle-check', label: 'Снять все отметки' } ];
      } else {
        moreActions = [ { action: 'gear-trip-sync',     icon: 'download',     label: 'Обновить из шаблона' },
                        { action: 'gear-clear-checked', icon: 'circle-check', label: 'Снять все отметки' } ];
      }
      _openSheet(GearRender.sheetActions('', moreActions));
      return;
    }

    /* ── Обновить личный список поездки из шаблона ── */
    if (action === 'gear-trip-sync') {
      _closeAllSheets();
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      try {
        var result = await GearData.syncTripFromTemplate(_uid, _activeTrip, _template);
        if (result) {
          var parts = [];
          if (result.categories) parts.push(result.categories + ' кат.');
          if (result.items)      parts.push(result.items + ' вещ.');
          alert(parts.length ? 'Добавлено из шаблона: ' + parts.join(', ') : 'Список поездки уже совпадает с шаблоном.');
        }
      } catch (err) {
        console.error('GearData.syncTripFromTemplate:', err);
        alert('Не удалось обновить из шаблона. Проверь соединение и попробуй ещё раз.');
        return;
      }
      _render();
      return;
    }

    // Снять разом все отметки в списке поездки.
    if (action === 'gear-clear-checked') {
      _closeAllSheets();
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      var gcOk = await UIUtils.confirmSheet('Снять все отметки собранности?', { okLabel: 'Сбросить', danger: false });
      if (!gcOk) return;
      await GearData.setChecked(_uid, _activeTrip, []);
      _render();
      return;
    }

    // То же самое, но для отдельных отметок «Обратно».
    if (action === 'gear-clear-checked-back') {
      _closeAllSheets();
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      var gcbOk = await UIUtils.confirmSheet('Снять все обратные отметки?', { okLabel: 'Сбросить', danger: false });
      if (!gcbOk) return;
      await GearData.setCheckedBack(_uid, _activeTrip, []);
      _render();
      return;
    }

    if (action === 'gear-shared-clear-checked') {
      _closeAllSheets();
      if (!_sharedData) return;
      var scClearOk = await UIUtils.confirmSheet('Снять все отметки в общем списке?', { okLabel: 'Сбросить', danger: false });
      if (!scClearOk) return;
      _sharedData.checked = [];
      await GearData.setSharedChecked(_activeTrip, []);
      _render();
      return;
    }

    // То же самое, но только для одной категории.
    if (action === 'gear-cat-clear-checked') {
      var ccCatId = t.dataset.catid;
      var ccOk = await UIUtils.confirmSheet('Снять отметки в этой категории?', { okLabel: 'Сбросить', danger: false });
      if (!ccOk) return;
      var ccSnap = GearData.getTripSnapshot(_uid, _activeTrip);
      if (!ccSnap) return;
      var ccIds = GearRender.groups(ccSnap.categories || [], ccSnap.items || [])
        .filter(function(g) { return g.cat.id === ccCatId; })
        .reduce(function(a, g) { return a.concat(g.items.map(function(i) { return i.id; })); }, []);
      await GearData.markChecked(_uid, _activeTrip, ccIds, false);
      _render();
      return;
    }

    // То же самое для категории, но в отметках «Обратно».
    if (action === 'gear-cat-clear-checked-back') {
      var ccbCatId = t.dataset.catid;
      var ccbOk = await UIUtils.confirmSheet('Снять отметки в этой категории?', { okLabel: 'Сбросить', danger: false });
      if (!ccbOk) return;
      var ccbSnap = GearData.getTripSnapshot(_uid, _activeTrip);
      if (!ccbSnap) return;
      var ccbIds = GearRender.groups(ccbSnap.categories || [], ccbSnap.items || [])
        .filter(function(g) { return g.cat.id === ccbCatId; })
        .reduce(function(a, g) { return a.concat(g.items.map(function(i) { return i.id; })); }, []);
      await GearData.markCheckedBack(_uid, _activeTrip, ccbIds, false);
      _render();
      return;
    }

    if (action === 'gear-shared-cat-clear-checked') {
      if (!_sharedData) return;
      var sccCatId = t.dataset.catid;
      var sccOk = await UIUtils.confirmSheet('Снять отметки в этой категории?', { okLabel: 'Сбросить', danger: false });
      if (!sccOk) return;
      var sccIds = _sharedData.items.filter(function(i) { return i.categoryId === sccCatId; }).map(function(i) { return i.id; });
      _sharedData.checked = (_sharedData.checked || []).filter(function(id) { return sccIds.indexOf(id) < 0; });
      await GearData.markSharedChecked(_activeTrip, sccIds, false);
      _render();
      return;
    }

    /* ═════════════ СУМКИ (каталог) ═════════════ */

    if (action === 'gear-loc-add') {
      _openSheet(GearRender.sheetAddLocation(_template, null));
      return;
    }

    if (action === 'gear-loc-add-child') {
      _openSheet(GearRender.sheetAddLocation(_template, null, t.dataset.parentid));
      return;
    }

    if (action === 'gear-loc-edit') {
      _openSheet(GearRender.sheetAddLocation(_template, t.dataset.locid));
      return;
    }

    if (action === 'gear-loc-parent-pick') {
      var curId = (document.getElementById('gear-loc-parent-id') || {}).value || '';
      var locSheet = document.getElementById('gear-loc-sheet');
      var editId = locSheet ? ((locSheet.querySelector('.gear-btn-primary[data-action="gear-loc-save"]') || {}).dataset || {}).editid : '';
      // Исключаем саму сумку и всё, что лежит внутри неё (иначе цикл)
      var banned = {};
      if (editId) {
        banned[editId] = true;
        var grew = true;
        while (grew) {
          grew = false;
          _template.locations.forEach(function(l) { if (l.parentId && banned[l.parentId] && !banned[l.id]) { banned[l.id] = true; grew = true; } });
        }
      }
      var locs = _template.locations.filter(function(l) { return !banned[l.id]; });
      _openSubSheet(GearRender.sheetPickLocation(locs, curId, 'parent'));
      return;
    }

    /* ── Назначить сумку вещи прямо внутри поездки («куда») ── */
    if (action === 'gear-trip-item-loc-pick') {
      if (_activeTrip === 'template' || _activeTrip === 'catalog' || _scope === 'shared') return;
      var snapForPick = GearData.getTripSnapshot(_uid, _activeTrip);
      if (!snapForPick) return;
      var itemForPick = snapForPick.items.find(function(i) { return i.id === t.dataset.itemid; });
      _tripLocPickItemId = t.dataset.itemid;
      _openSheet(GearRender.sheetPickLocation(snapForPick.locations || [], itemForPick ? (itemForPick.locationId || '') : '', 'trip-item-loc'));
      return;
    }

    if (action === 'gear-loc-picked') {
      var locId   = t.dataset.locid;
      var trigger = t.dataset.trigger;

      if (trigger === 'trip-item-loc') {
        _closeAllSheets();
        var snapForSave = GearData.getTripSnapshot(_uid, _activeTrip);
        if (snapForSave && _tripLocPickItemId) {
          var itemToUpdate = snapForSave.items.find(function(i) { return i.id === _tripLocPickItemId; });
          if (itemToUpdate) itemToUpdate.locationId = locId;
          // Узкая запись — только items (checked/categories/locations не трогаем)
          GearData.updateTripSnapshotItems(_uid, _activeTrip, snapForSave.items).catch(function(err) {
            console.error('GearData.updateTripSnapshotItems:', err);
            alert('Не удалось сохранить сумку. Проверь соединение.');
          });
        }
        _tripLocPickItemId = null;
        _render();
        return;
      }

      _closeSheet('gear-pick-sheet');  // закрываем ТОЛЬКО пикер, не весь лист сумки
      if (trigger === 'parent') {
        var loc = _template.locations.find(function(l) { return l.id === locId; });
        var inp  = document.getElementById('gear-loc-parent-id');
        var disp = document.getElementById('gear-loc-parent-display');
        if (inp)  inp.value = locId;
        if (disp) disp.innerHTML = loc ? _esc(loc.name) : '<span class="gear-field-ph">Не внутри другой сумки</span>';
      }
      return;
    }

    if (action === 'gear-loc-save') {
      var eid  = t.dataset.editid;
      var name = (document.getElementById('gear-loc-name') || {value:''}).value.trim();
      if (!name) { var n = document.getElementById('gear-loc-name'); if (n) n.focus(); return; }
      var onIpic  = document.querySelector('#gear-loc-sheet .gear-ipic.on');
      var iconIdx = onIpic ? Number(onIpic.dataset.idx) : 1;
      var volume  = (document.getElementById('gear-loc-volume') || {value:''}).value.trim();
      var tare    = (document.getElementById('gear-loc-tare')   || {value:''}).value.trim();
      var pid     = (document.getElementById('gear-loc-parent-id') || {value:''}).value;
      if (eid) {
        var existing = _template.locations.find(function(l) { return l.id === eid; });
        if (existing) { existing.name = name; existing.iconIdx = iconIdx; existing.volume = volume; existing.tare = tare; existing.parentId = pid; }
      } else {
        _template.locations.push({ id: GearData.uid(), name: name, iconIdx: iconIdx, volume: volume, tare: tare, parentId: pid });
      }
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-loc-del') {
      var delLocId = t.dataset.locid;
      var delLoc = _template.locations.find(function(l) { return l.id === delLocId; });
      var dlOk = await UIUtils.confirmSheet('Удалить сумку «' + (delLoc ? delLoc.name : '') + '»? В уже собранных списках поездок она останется.');
      if (!dlOk) return;
      _template.locations = _template.locations.filter(function(l) { return l.id !== delLocId; });
      _template.items.forEach(function(i) { if (i.locationId === delLocId) i.locationId = ''; });
      _template.locations.forEach(function(l) { if (l.parentId === delLocId) l.parentId = ''; });
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    /* ═════════════ КАТЕГОРИИ ═════════════ */

    if (action === 'gear-cat-add') {
      _openSheet(GearRender.sheetAddCategory(_template, null));
      return;
    }

    if (action === 'gear-cat-menu') {
      var menuCat = _template.categories.find(function(c) { return c.id === t.dataset.catid; });
      if (!menuCat) return;
      _openSheet(GearRender.sheetCategoryMenu(menuCat));
      return;
    }

    if (action === 'gear-cat-edit') {
      _openSheet(GearRender.sheetAddCategory(_template, t.dataset.catid));
      return;
    }

    if (action === 'gear-cat-toggle-hidden') {
      var hidCat = _template.categories.find(function(c) { return c.id === t.dataset.catid; });
      if (hidCat) hidCat.hidden = !hidCat.hidden;
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-cat-del-items') {
      var dciCatId = t.dataset.catid;
      _template.categories = _template.categories.filter(function(c) { return c.id !== dciCatId; });
      _template.items.forEach(function(i) { if (i.categoryId === dciCatId) i.categoryId = ''; });
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-cat-del-all') {
      var dcaCatId = t.dataset.catid;
      var dcaCat = _template.categories.find(function(c) { return c.id === dcaCatId; });
      var dcaN = _template.items.filter(function(i) { return i.categoryId === dcaCatId; }).length;
      _closeAllSheets();
      var dcaOk = await UIUtils.confirmSheet('Удалить категорию «' + (dcaCat ? dcaCat.name : '') + '»' + (dcaN ? ' и ' + dcaN + ' вещ. в ней' : '') + '?');
      if (!dcaOk) return;
      _template.categories = _template.categories.filter(function(c) { return c.id !== dcaCatId; });
      _template.items      = _template.items.filter(function(i) { return i.categoryId !== dcaCatId; });
      await _save();
      _render();
      return;
    }

    if (action === 'gear-cat-save') {
      var saveCatEid = t.dataset.editid;
      var catName    = (document.getElementById('gear-cat-name') || {value:''}).value.trim();
      if (!catName) { var cn = document.getElementById('gear-cat-name'); if (cn) cn.focus(); return; }
      if (saveCatEid) {
        // iconIdx не трогаем — пикера иконки категории в новом дизайне нет
        var editCat = _template.categories.find(function(c) { return c.id === saveCatEid; });
        if (editCat) editCat.name = catName;
      } else {
        var presetIdx = GearRender.PRESET_ICONS[catName];
        _template.categories.push({ id: GearData.uid(), name: catName, iconIdx: presetIdx != null ? presetIdx : 0 });
      }
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-import-open') {
      _openSheet(GearRender.sheetImportText());
      return;
    }

    if (action === 'gear-import-save') {
      var importText = (document.getElementById('gear-import-text') || {value:''}).value;
      var groups = _parseImportText(importText);
      if (!groups.length) { _closeAllSheets(); return; }
      groups.forEach(function(g) {
        var existingCat = _template.categories.find(function(c) { return c.name === g.name; });
        var gCatId;
        if (existingCat) { gCatId = existingCat.id; }
        else {
          gCatId = GearData.uid();
          _template.categories.push({ id: gCatId, name: g.name, iconIdx: 0 });
        }
        g.items.forEach(function(nm) {
          _template.items.push({ id: GearData.uid(), name: nm, categoryId: gCatId, weight: '', locationId: '', note: '' });
        });
      });
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-preset-pick') {
      var preset    = t.dataset.preset;
      var nameInput = document.getElementById('gear-cat-name');
      if (nameInput) nameInput.value = preset;
      var catSheet  = document.getElementById('gear-cat-sheet');
      if (catSheet) catSheet.querySelectorAll('.gear-chip').forEach(function(el) {
        el.classList.toggle('on', el.dataset.preset === preset);
      });
      return;
    }

    /* ═════════════ ВЕЩИ ═════════════ */

    if (action === 'gear-item-add') {
      _openSheet(GearRender.sheetAddItem(_template, null, t.dataset.catid));
      return;
    }

    if (action === 'gear-item-edit') {
      _openSheet(GearRender.sheetAddItem(_template, t.dataset.itemid, null));
      return;
    }

    if (action === 'gear-chip-cat') {
      var chipCatId  = t.dataset.catid;
      var hiddenCat  = document.getElementById('gear-item-catid');
      if (hiddenCat) hiddenCat.value = chipCatId;
      var chipsWrap  = document.getElementById('gear-item-cat-chips');
      if (chipsWrap) chipsWrap.querySelectorAll('.gear-chip').forEach(function(el) {
        el.classList.toggle('on', el.dataset.catid === chipCatId);
      });
      var saveBtn = document.getElementById('gear-item-save-btn');
      var chipCat = _template.categories.find(function(c) { return c.id === chipCatId; });
      if (saveBtn && chipCat && !saveBtn.dataset.editid) saveBtn.textContent = 'Добавить в ' + chipCat.name;
      return;
    }

    if (action === 'gear-item-save') {
      var saveItemEid = t.dataset.editid;
      var itemName    = (document.getElementById('gear-item-name') || {value:''}).value.trim();
      if (!itemName) { var in2 = document.getElementById('gear-item-name'); if (in2) in2.focus(); return; }
      var iCatId  = (document.getElementById('gear-item-catid')  || {value:''}).value;
      var iWeight = (document.getElementById('gear-item-weight') || {value:''}).value.trim();
      var iNote   = (document.getElementById('gear-item-note')   || {value:''}).value.trim();
      if (saveItemEid) {
        var editItem = _template.items.find(function(i) { return i.id === saveItemEid; });
        if (editItem) { editItem.name = itemName; editItem.categoryId = iCatId; editItem.weight = iWeight; editItem.note = iNote; }
      } else {
        _template.items.push({ id: GearData.uid(), name: itemName, categoryId: iCatId, weight: iWeight, note: iNote });
        if (iCatId) _open['c:' + iCatId] = true;
      }
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    if (action === 'gear-item-del') {
      var delItemId = t.dataset.itemid;
      _template.items = _template.items.filter(function(i) { return i.id !== delItemId; });
      _closeAllSheets();
      await _save();
      _render();
      return;
    }

    /* ═════════════ МАСТЕР «СОБРАТЬ СПИСОК НА ПОЕЗДКУ» ═════════════
       Сначала — для какой поездки (заголовок мастера «Список на …»),
       шаг 1 — какие вещи, шаг 2 — какие сумки, затем создание. */

    if (action === 'gear-pick-mode-enter') {
      var myTrips = (typeof TripsData !== 'undefined') ? TripsData.getMine(_uid).slice() : [];
      myTrips.sort(function(a, b) { var x = a.startDate || '', y = b.startDate || ''; return x < y ? 1 : (x > y ? -1 : 0); });
      _openSheet(GearRender.sheetPickTrip(myTrips, _tripList.map(function(x) { return x.id; })));
      return;
    }

    if (action === 'gear-pick-trip-selected') {
      _closeAllSheets();
      _pickTrip = { id: t.dataset.tripid, name: t.dataset.tripname };
      // Мастер открывается пустым — отмечаешь то, что берёшь в эту поездку
      _pickSelected = [];
      _pickSelectedLocations = [];
      _pickMode = true;
      _pickStep = 'items';
      _render();
      _scrollTop();
      return;
    }

    if (action === 'gear-pick-mode-cancel') {
      _pickMode = false;
      _pickStep = 'items';
      _pickTrip = null;
      _pickSelected = [];
      _pickSelectedLocations = [];
      _render();
      return;
    }

    if (action === 'gear-pick-back-to-items') {
      _pickStep = 'items';
      _render();
      return;
    }

    if (action === 'gear-pick-toggle-item') {
      var pItemId = t.dataset.itemid;
      var pIdx = _pickSelected.indexOf(pItemId);
      if (pIdx >= 0) _pickSelected.splice(pIdx, 1); else _pickSelected.push(pItemId);
      _render();
      return;
    }

    // Отметить/снять всю категорию разом
    if (action === 'gear-pick-toggle-cat') {
      var ptIds = _catItems(t.dataset.catid).map(function(i) { return i.id; });
      var allOn = ptIds.every(function(id) { return _pickSelected.indexOf(id) >= 0; });
      _pickSelected = _pickSelected.filter(function(id) { return ptIds.indexOf(id) < 0; });
      if (!allOn) _pickSelected = _pickSelected.concat(ptIds);
      _render();
      return;
    }

    if (action === 'gear-pick-all') {
      _pickSelected = t.dataset.on === '1' ? _template.items.map(function(i) { return i.id; }) : [];
      _render();
      return;
    }

    if (action === 'gear-pick-done') {
      if (!_pickSelected.length) { alert('Отметь хотя бы одну вещь.'); return; }
      _pickStep = 'locations';
      _render();
      _scrollTop();
      return;
    }

    if (action === 'gear-pick-toggle-location') {
      var plId = t.dataset.locid;
      var plIdx = _pickSelectedLocations.indexOf(plId);
      if (plIdx >= 0) _pickSelectedLocations.splice(plIdx, 1); else _pickSelectedLocations.push(plId);
      _render();
      return;
    }

    if (action === 'gear-pick-create') {
      if (!_pickTrip) return;
      if (GearData.hasTripSnapshot(_uid, _pickTrip.id)) {
        var repOk = await UIUtils.confirmSheet('У «' + _pickTrip.name + '» уже есть список — заменить? Отметки и раскладка по сумкам сбросятся.', { okLabel: 'Заменить' });
        if (!repOk) return;
      }
      var payload = _buildPickedTemplate(_template, _pickSelected, _pickSelectedLocations);
      try {
        await GearData.saveTripSnapshot(_uid, _pickTrip.id, _pickTrip.name, payload);
      } catch (err) {
        console.error('GearData.saveTripSnapshot:', err);
        alert('Не удалось сохранить список поездки. Проверь соединение и попробуй ещё раз.');
        return;
      }
      _activeTrip = _pickTrip.id;
      _pickMode = false;
      _pickStep = 'items';
      _pickTrip = null;
      _pickSelected = [];
      _pickSelectedLocations = [];
      _tripList = GearData.getTripList(_uid);
      _scope    = 'personal';
      _render();
      _scrollTop();
      return;
    }

    /* ═════════════ ОБЩЕЕ СНАРЯЖЕНИЕ (на поездку, видно всем) ═════════════ */

    if (action === 'gear-shared-cat-add') {
      if (!_sharedData) _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
      _openSheet(GearRender.sheetAddSharedCategory(_sharedData, null));
      return;
    }

    if (action === 'gear-shared-cat-edit') {
      if (!_sharedData) return;
      _openSheet(GearRender.sheetAddSharedCategory(_sharedData, t.dataset.catid));
      return;
    }

    if (action === 'gear-shared-cat-save') {
      var scEditId = t.dataset.editid;
      var scName = (document.getElementById('gear-shared-cat-name') || {value:''}).value.trim();
      if (!scName) { var scn = document.getElementById('gear-shared-cat-name'); if (scn) scn.focus(); return; }
      if (!_sharedData) _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
      if (scEditId) {
        var scEditCat = _sharedData.categories.find(function(c) { return c.id === scEditId; });
        if (scEditCat) scEditCat.name = scName;
      } else {
        var scNewId = GearData.uid();
        _sharedData.categories.push({ id: scNewId, name: scName, iconIdx: 0 });
        _open['s:' + scNewId] = true;
      }
      _closeAllSheets();
      await _saveShared();
      _render();
      return;
    }

    if (action === 'gear-shared-cat-del') {
      if (!_sharedData) return;
      var scDelId = t.dataset.catid;
      var scDelCat = _sharedData.categories.find(function(c) { return c.id === scDelId; });
      if (!scDelCat) return;
      var scDelCount = _sharedData.items.filter(function(i) { return i.categoryId === scDelId; }).length;
      var scOk = await UIUtils.confirmSheet(scDelCount
        ? 'Удалить категорию «' + scDelCat.name + '» и ' + scDelCount + ' вещ. в ней?'
        : 'Удалить категорию «' + scDelCat.name + '»?');
      if (!scOk) return;
      _sharedData.categories = _sharedData.categories.filter(function(c) { return c.id !== scDelId; });
      _sharedData.items      = _sharedData.items.filter(function(i)      { return i.categoryId !== scDelId; });
      _closeAllSheets();
      await _saveShared();
      _render();
      return;
    }

    if (action === 'gear-shared-item-add') {
      _sharedAddCatId = t.dataset.catid;
      _openSheet(GearRender.sheetAddSharedItem());
      return;
    }

    if (action === 'gear-shared-item-save') {
      var siName  = (document.getElementById('gear-shared-item-name')  || {value:''}).value.trim();
      var siOwner = (document.getElementById('gear-shared-item-owner') || {value:''}).value.trim();
      if (!siName) { var sin = document.getElementById('gear-shared-item-name'); if (sin) sin.focus(); return; }
      if (!_sharedData) _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
      _sharedData.items.push({ id: GearData.uid(), name: siName, owner: siOwner, categoryId: _sharedAddCatId });
      _closeAllSheets();
      var siSaved = await _saveShared();
      if (siSaved) ActivityLog.add(_activeTrip, 'gear', 'добавил в общую снарягу: ' + siName);
      _render();
      return;
    }

    if (action === 'gear-shared-item-del') {
      if (!_sharedData) return;
      var sDelId = t.dataset.itemid;
      _sharedData.items = _sharedData.items.filter(function(i) { return i.id !== sDelId; });
      await _saveShared();
      _render();
      return;
    }

    if (action === 'gear-shared-item-check') {
      if (!_sharedData) return;
      var sciId    = t.dataset.itemid;
      var sChecked = _sharedData.checked || [];
      var sIdx     = sChecked.indexOf(sciId);
      var sOn = sIdx < 0;
      if (sIdx >= 0) sChecked.splice(sIdx, 1); else sChecked.push(sciId);
      _sharedData.checked = sChecked;
      GearData.markSharedChecked(_activeTrip, [sciId], sOn);
      _render();
      return;
    }

    /* ═════════════ ОТМЕТКИ В СПИСКЕ ПОЕЗДКИ ═════════════ */

    if (action === 'gear-item-check') {
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      var checkItemId = t.dataset.itemid;
      var willCheck   = GearData.getChecked(_uid, _activeTrip).indexOf(checkItemId) < 0;
      GearData.markChecked(_uid, _activeTrip, [checkItemId], willCheck); // arrayUnion/arrayRemove — не весь массив
      _render();
      return;
    }

    // Отдельные отметки обратного пути — не трогают checked («туда»).
    if (action === 'gear-item-check-back') {
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      var checkBackId    = t.dataset.itemid;
      var willCheckBack  = GearData.getCheckedBack(_uid, _activeTrip).indexOf(checkBackId) < 0;
      GearData.markCheckedBack(_uid, _activeTrip, [checkBackId], willCheckBack); // arrayUnion/arrayRemove
      _render();
      return;
    }

    /* ═════════════ «Я СОБРАН» ═════════════ */

    if (action === 'gear-ready-toggle') {
      if (_activeTrip === 'template' || _activeTrip === 'catalog') return;
      var wasReady = !!(GearData.getReady(_activeTrip) || {})[_uid];
      var willBeReady = !wasReady;
      GearData.setReady(_activeTrip, _uid, willBeReady); // узкая merge-запись ready.{uid}
      if (willBeReady) ActivityLog.add(_activeTrip, 'gear', 'собрался в поездку');
      _render();
      return;
    }

    /* ═════════════ ПИКЕР ИКОНОК (сумки) ═════════════ */

    if (action === 'gear-icon-pick') {
      var sheetId2 = t.dataset.sheet;
      var sheet2   = sheetId2 ? document.getElementById(sheetId2) : t.closest('.gear-sheet-overlay');
      if (sheet2) {
        sheet2.querySelectorAll('.gear-ipic').forEach(function(el) { el.classList.remove('on'); });
        t.classList.add('on');
      }
      return;
    }
  });

  /* ── Публичный API ── */

  /**
   * Создаёт список снаряги под поездку из выбранного источника.
   * source: 'blank' | 'template' | tripId прошлой поездки.
   */
  async function createTripList(uid, tripId, tripName, source) {
    await GearData.ensureLoaded(uid);
    var tmpl;
    if (source === 'blank') {
      tmpl = { locations: [], categories: [], items: [] };
    } else if (source === 'template') {
      var loaded = await GearData.load(uid);
      // Сумки — отдельный каталог, целиком не копируются: какие едут в
      // поездку, решается явно в мастере «Собрать список на поездку».
      tmpl = { locations: [], categories: loaded.categories, items: loaded.items };
    } else {
      var srcSnap = GearData.getTripSnapshot(uid, source);
      tmpl = srcSnap
        ? { locations: srcSnap.locations, categories: srcSnap.categories, items: srcSnap.items }
        : { locations: [], categories: [], items: [] };
    }
    await GearData.saveTripSnapshot(uid, tripId, tripName, tmpl);
    if (_uid === uid) {
      _tripList = GearData.getTripList(uid);
      if (_template) _render();
    }
  }

  return { init, createTripList };
})();

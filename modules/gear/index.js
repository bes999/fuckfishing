'use strict';
/* globals GearData, GearRender, TripsData */

const GearModule = (() => {
  var _uid        = null;
  var _isMe       = false;
  var _container  = null;
  var _template   = null;
  var _activeTrip = 'template';
  var _tripList   = [];
  var _scope      = 'personal'; // 'personal' | 'shared' — только для вкладок поездки
  var _sharedData = null;       // загруженный общий список текущей поездки
  var _sharedAddCatId = null;   // категория, в которую добавляем предмет (шит)
  var _pickMode     = false;    // режим "собрать список для поездки" (внутри Шаблона)
  var _pickSelected = [];       // id отмеченных предметов в этом режиме
  var _tripLocPickItemId = null; // какому предмету поездки назначаем место (пикер)

  /* ── Инициализация ──
     openTrip — необязательный id поездки, на вкладку которой сразу открыться
     (используется кнопкой снаряги на обложке поездки, если снимок уже есть). */
  async function init(uid, isMe, container, openTrip) {
    _uid        = uid;
    _isMe       = isMe;
    _container  = container;
    await GearData.ensureLoaded(uid);
    _tripList   = GearData.getTripList(uid);
    _activeTrip = (openTrip && GearData.hasTripSnapshot(openTrip)) ? openTrip : 'template';
    try {
      _template = await GearData.load(uid);
    } catch (err) {
      console.error('GearModule.init: не удалось загрузить снаряжение', err);
      if (_container) {
        _container.innerHTML = '<div style="padding:40px 20px;text-align:center;color:var(--label3)">Не удалось загрузить снаряжение. Проверь соединение и открой вкладку заново.</div>';
      }
      return;
    }
    _render();
  }

  // Собирает урезанный шаблон только из отмеченных предметов — плюс их
  // категории и цепочку мест хранения (включая родителей, иначе вложенный
  // "Несессер" останется без "Баула", в котором он лежит).
  function _buildPickedTemplate(template, selectedIds) {
    var selSet = {};
    selectedIds.forEach(function(id) { selSet[id] = true; });

    var items = template.items.filter(function(i) { return selSet[i.id]; });

    var catSet = {};
    items.forEach(function(i) { if (i.categoryId) catSet[i.categoryId] = true; });
    var categories = template.categories.filter(function(c) { return catSet[c.id]; });

    var locSet = {};
    items.forEach(function(i) { if (i.locationId) locSet[i.locationId] = true; });
    var changed = true;
    while (changed) {
      changed = false;
      template.locations.forEach(function(l) {
        if (locSet[l.id] && l.parentId && !locSet[l.parentId]) { locSet[l.parentId] = true; changed = true; }
      });
    }
    var locations = template.locations.filter(function(l) { return locSet[l.id]; });

    return { locations: locations, categories: categories, items: items };
  }

  function _render() {
    if (!_container) return;
    if (_pickMode) {
      _container.innerHTML = GearRender.pickView(_template, _pickSelected);
    } else if (_activeTrip === 'template') {
      _container.innerHTML = GearRender.tabMain(_template, _tripList, _isMe);
    } else if (_scope === 'shared') {
      var sharedChecked = (_sharedData && _sharedData.checked) || [];
      _container.innerHTML = GearRender.tabTrip(null, [], _tripList, _activeTrip, 'shared', _sharedData, sharedChecked);
    } else {
      var snap    = GearData.getTripSnapshot(_uid, _activeTrip);
      var checked = GearData.getChecked(_uid, _activeTrip);
      _container.innerHTML = GearRender.tabTrip(snap, checked, _tripList, _activeTrip, 'personal');
    }
  }

  async function _saveShared() {
    if (!_sharedData) return;
    var tripName = (_tripList.find(function(t) { return t.id === _activeTrip; }) || {}).name || '';
    try {
      await GearData.saveShared(_activeTrip, tripName, _sharedData.categories, _sharedData.items);
    } catch (err) {
      console.error('GearModule._saveShared: не удалось сохранить общий список', err);
      alert('Не удалось сохранить общий список. Проверь соединение и попробуй ещё раз.');
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

  // Запоминаем открытые аккордеоны перед ре-рендером
  function _getOpenCats() {
    if (!_container) return [];
    var open = [];
    _container.querySelectorAll('.gear-cat-body').forEach(function(el) {
      if (el.style.display !== 'none') open.push(el.id.replace('gear-cat-body-', ''));
    });
    return open;
  }

  // Восстанавливаем открытые аккордеоны после ре-рендера
  function _restoreOpenCats(openIds) {
    if (!openIds.length || !_container) return;
    openIds.forEach(function(catId) {
      var body = document.getElementById('gear-cat-body-' + catId);
      if (body) {
        body.style.display = 'block';
        var hd = _container.querySelector('[data-action="gear-cat-toggle"][data-catid="' + catId + '"]');
        var chev = hd ? hd.querySelector('.gear-chev') : null;
        if (chev) chev.textContent = '∨';
      }
    });
  }

  function _renderAndRestore() {
    var openCats = _getOpenCats();
    _render();
    _restoreOpenCats(openCats);
  }

  function _openSheet(html) {
    _closeAllSheets();
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  // Открыть вложенный шит (пикер) поверх существующего, не закрывая его
  function _openSubSheet(html) {
    _closeSheet('gear-pick-sheet');
    var div = document.createElement('div');
    div.innerHTML = html;
    document.body.appendChild(div.firstElementChild);
  }

  function _esc(s) { return GearRender._esc(s); }

  // Разбирает вставленный текст на категории/предметы: строка, оканчивающаяся
  // двоеточием, открывает новую категорию, остальные непустые строки —
  // предметы в неё (bullets вроде "-"/"•"/"1." отбрасываются). Без заголовков
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

  /* ══════════════════════════════════════════════
     СОБЫТИЯ — один глобальный обработчик
  ══════════════════════════════════════════════ */
  document.addEventListener('click', async function(e) {
    // Клик по оверлею — закрыть шит
    if (e.target.classList && e.target.classList.contains('gear-sheet-overlay')) {
      _closeAllSheets();
      return;
    }

    var t = e.target.closest('[data-action]');
    if (!t) return;
    var action = t.dataset.action;

    // Только gear-* экшены
    if (action.slice(0,5) !== 'gear-') return;
    if (!_uid) return;

    /* ── Закрыть шит ── */
    if (action === 'gear-sheet-close') { _closeAllSheets(); return; }

    /* ── Переключатель поездок ── */
    if (action === 'gear-trip-switch') {
      _activeTrip = t.dataset.trip;
      _scope = 'personal';
      _sharedData = null;
      _renderAndRestore();
      return;
    }

    /* ── Переключатель "Моё / Общее" внутри поездки ── */
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
      _renderAndRestore();
      return;
    }

    /* ── Обновить личный список поездки из шаблона ── */
    if (action === 'gear-trip-sync') {
      if (_activeTrip === 'template') return;
      try {
        var result = await GearData.syncTripFromTemplate(_uid, _activeTrip, _template);
        if (result) {
          var addedTotal = result.locations + result.categories + result.items;
          if (addedTotal) {
            var parts = [];
            if (result.categories) parts.push(result.categories + ' кат.');
            if (result.items)      parts.push(result.items + ' предм.');
            if (result.locations)  parts.push(result.locations + ' мест');
            alert('Добавлено из шаблона: ' + parts.join(', '));
          } else {
            alert('Список поездки уже совпадает с шаблоном.');
          }
        }
      } catch (err) {
        console.error('GearData.syncTripFromTemplate:', err);
        alert('Не удалось обновить из шаблона. Проверь соединение и попробуй ещё раз.');
        return;
      }
      _renderAndRestore();
      return;
    }

    /* ── Раскрыть/свернуть категорию ── */
    if (action === 'gear-cat-toggle') {
      e.stopPropagation();
      var catId = t.dataset.catid;
      var body  = document.getElementById('gear-cat-body-' + catId);
      if (!body) return;
      var isOpen = body.style.display !== 'none';
      body.style.display = isOpen ? 'none' : 'block';
      var chev = t.querySelector('.gear-chev');
      if (chev) chev.textContent = isOpen ? '›' : '∨';
      return;
    }

    /* ═════════════ МЕСТА ХРАНЕНИЯ ═════════════ */

    if (action === 'gear-loc-expand') {
      e.stopPropagation();
      var locId = t.dataset.locid;
      var isTripView   = _activeTrip !== 'template';
      var activeLocs, activeItems;
      if (isTripView) {
        var snapForLoc = GearData.getTripSnapshot(_uid, _activeTrip);
        if (!snapForLoc) return;
        activeLocs = snapForLoc.locations; activeItems = snapForLoc.items;
      } else {
        activeLocs = _template.locations; activeItems = _template.items;
      }
      var loc = activeLocs.find(function(l) { return l.id === locId; });
      if (!loc) return;
      var panel  = document.getElementById('gear-nested-panel');
      var isOpen = panel && panel.dataset.openId === locId;
      // Убираем активный класс со всех карточек
      if (_container) _container.querySelectorAll('.gear-loc-card').forEach(function(el) {
        el.classList.remove('gear-loc-card-active');
      });
      if (isOpen) {
        if (panel) { panel.innerHTML = ''; panel.dataset.openId = ''; }
        return;
      }
      t.classList.add('gear-loc-card-active');
      if (panel) {
        panel.innerHTML = GearRender.nestedPanel(loc, activeLocs, activeItems, isTripView);
        panel.dataset.openId = locId;
      }
      return;
    }

    if (action === 'gear-loc-collapse') {
      var panel2 = document.getElementById('gear-nested-panel');
      if (panel2) { panel2.innerHTML = ''; panel2.dataset.openId = ''; }
      if (_container) _container.querySelectorAll('.gear-loc-card').forEach(function(el) {
        el.classList.remove('gear-loc-card-active');
      });
      return;
    }

    if (action === 'gear-loc-add-child') {
      if (!_isMe) return;
      var parentId = t.dataset.parentid;
      var sheet = GearRender.sheetAddLocation(_template, null);
      _openSheet(sheet);
      // Устанавливаем parentId после открытия шита
      setTimeout(function() {
        var hidInp  = document.getElementById('gear-loc-parent-id');
        var dispEl  = document.getElementById('gear-loc-parent-display');
        var parent  = _template.locations.find(function(l) { return l.id === parentId; });
        if (hidInp) hidInp.value = parentId;
        if (dispEl && parent) dispEl.innerHTML = GearRender._esc(parent.name);
      }, 0);
      return;
    }

    if (action === 'gear-loc-add') {
      if (!_isMe) return;
      _openSheet(GearRender.sheetAddLocation(_template, null));
      return;
    }

    if (action === 'gear-loc-edit') {
      if (!_isMe) return;
      _openSheet(GearRender.sheetAddLocation(_template, t.dataset.locid));
      return;
    }

    if (action === 'gear-loc-parent-pick') {
      var curId = (document.getElementById('gear-loc-parent-id') || {}).value || '';
      // Исключаем текущее редактируемое место из пикера
      var sheet = document.getElementById('gear-loc-sheet');
      var editId = sheet ? (sheet.querySelector('[data-action="gear-loc-save"]') || {}).dataset.editid : '';
      var locs = _template.locations.filter(function(l) { return l.id !== editId; });
      _openSubSheet(GearRender.sheetPickLocation(locs, curId, 'parent'));
      return;
    }

    if (action === 'gear-item-loc-pick') {
      var curLocId = (document.getElementById('gear-item-locid') || {}).value || '';
      _openSubSheet(GearRender.sheetPickLocation(_template.locations, curLocId, 'item-loc'));
      return;
    }

    /* ── Назначить место хранения вещи прямо внутри поездки ── */
    if (action === 'gear-trip-item-loc-pick') {
      if (_activeTrip === 'template' || _scope === 'shared') return;
      var snapForPick = GearData.getTripSnapshot(_uid, _activeTrip);
      if (!snapForPick) return;
      var itemForPick = snapForPick.items.find(function(i) { return i.id === t.dataset.itemid; });
      _tripLocPickItemId = t.dataset.itemid;
      _openSheet(GearRender.sheetPickLocation(snapForPick.locations, itemForPick ? (itemForPick.locationId || '') : '', 'trip-item-loc'));
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
          GearData.updateTripSnapshotItems(_uid, _activeTrip, snapForSave.items).catch(function(err) {
            console.error('GearData.updateTripSnapshotItems:', err);
            alert('Не удалось сохранить место хранения. Проверь соединение.');
          });
        }
        _tripLocPickItemId = null;
        _renderAndRestore();
        return;
      }

      _closeSheet('gear-pick-sheet');  // закрываем ТОЛЬКО пикер, не всё
      var loc = _template.locations.find(function(l) { return l.id === locId; });
      var locName = loc ? _esc(loc.name) : '';

      if (trigger === 'parent') {
        var inp  = document.getElementById('gear-loc-parent-id');
        var disp = document.getElementById('gear-loc-parent-display');
        if (inp)  inp.value = locId;
        if (disp) disp.innerHTML = locName ? locName : '<span class="gear-field-ph">Не указано</span>';
      } else if (trigger === 'item-loc') {
        var inp2  = document.getElementById('gear-item-locid');
        var disp2 = document.getElementById('gear-item-loc-display');
        if (inp2)  inp2.value = locId;
        if (disp2) disp2.innerHTML = locName ? locName : '<span class="gear-field-ph">Не указано</span>';
      }
      return;
    }

    if (action === 'gear-loc-save') {
      var eid  = t.dataset.editid;
      var name = (document.getElementById('gear-loc-name') || {value:''}).value.trim();
      if (!name) { var n = document.getElementById('gear-loc-name'); if(n) n.focus(); return; }

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
      _renderAndRestore();
      return;
    }

    if (action === 'gear-loc-del') {
      var delLocId = t.dataset.locid;
      _template.locations = _template.locations.filter(function(l) { return l.id !== delLocId; });
      _template.items.forEach(function(i) { if (i.locationId === delLocId) i.locationId = ''; });
      _template.locations.forEach(function(l) { if (l.parentId === delLocId) l.parentId = ''; });
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    /* ═════════════ КАТЕГОРИИ ═════════════ */

    if (action === 'gear-cat-add') {
      if (!_isMe) return;
      _openSheet(GearRender.sheetAddCategory(_template, null));
      return;
    }

    if (action === 'gear-cat-menu') {
      e.stopPropagation();
      var menuCatId = t.dataset.catid;
      var menuCat   = _template.categories.find(function(c) { return c.id === menuCatId; });
      if (!menuCat) return;
      _openSheet(GearRender.sheetCategoryMenu(menuCat));
      return;
    }

    if (action === 'gear-cat-edit') {
      var editCatId = t.dataset.catid;
      _closeAllSheets();
      _openSheet(GearRender.sheetAddCategory(_template, editCatId));
      return;
    }

    if (action === 'gear-cat-toggle-hidden') {
      var hidCatId = t.dataset.catid;
      var hidCat   = _template.categories.find(function(c) { return c.id === hidCatId; });
      if (hidCat) hidCat.hidden = !hidCat.hidden;
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-cat-del-items') {
      var dciCatId = t.dataset.catid;
      _template.categories = _template.categories.filter(function(c) { return c.id !== dciCatId; });
      _template.items.forEach(function(i) { if (i.categoryId === dciCatId) i.categoryId = ''; });
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-cat-del-all') {
      var dcaCatId = t.dataset.catid;
      _template.categories = _template.categories.filter(function(c) { return c.id !== dcaCatId; });
      _template.items      = _template.items.filter(function(i)      { return i.categoryId !== dcaCatId; });
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-cat-save') {
      var saveCatEid = t.dataset.editid;
      var catName    = (document.getElementById('gear-cat-name') || {value:''}).value.trim();
      if (!catName) { var cn = document.getElementById('gear-cat-name'); if(cn) cn.focus(); return; }
      var catIpic  = document.querySelector('#gear-cat-sheet .gear-ipic.on');
      var catIcon  = catIpic ? Number(catIpic.dataset.idx) : 0;

      if (saveCatEid) {
        var editCat = _template.categories.find(function(c) { return c.id === saveCatEid; });
        if (editCat) { editCat.name = catName; editCat.iconIdx = catIcon; }
      } else {
        _template.categories.push({ id: GearData.uid(), name: catName, iconIdx: catIcon });
      }
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-import-open') {
      if (!_isMe) return;
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
        g.items.forEach(function(name) {
          _template.items.push({ id: GearData.uid(), name: name, categoryId: gCatId, weight: '', locationId: '', note: '' });
        });
      });
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-preset-pick') {
      var preset    = t.dataset.preset;
      var nameInput = document.getElementById('gear-cat-name');
      if (nameInput) nameInput.value = preset;

      var presetIdx = GearRender.PRESET_ICONS[preset] != null ? GearRender.PRESET_ICONS[preset] : 0;
      var catSheet  = document.getElementById('gear-cat-sheet');
      if (catSheet) {
        catSheet.querySelectorAll('.gear-ipic').forEach(function(el, i) {
          el.classList.toggle('on', i === presetIdx);
        });
        catSheet.querySelectorAll('.gear-chip').forEach(function(el) {
          el.classList.toggle('on', el.dataset.preset === preset);
        });
      }
      return;
    }

    /* ═════════════ ПРЕДМЕТЫ ═════════════ */

    if (action === 'gear-item-add') {
      if (!_isMe) return;
      _openSheet(GearRender.sheetAddItem(_template, null, t.dataset.catid));
      return;
    }

    if (action === 'gear-item-edit') {
      if (!_isMe) return;
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
      // Обновляем надпись кнопки
      var saveBtn = document.getElementById('gear-item-save-btn');
      var chipCat = _template.categories.find(function(c) { return c.id === chipCatId; });
      if (saveBtn && chipCat && !saveBtn.dataset.editid) {
        saveBtn.textContent = 'Добавить в ' + chipCat.name;
      }
      return;
    }

    if (action === 'gear-item-save') {
      var saveItemEid = t.dataset.editid;
      var itemName    = (document.getElementById('gear-item-name') || {value:''}).value.trim();
      if (!itemName) { var in2 = document.getElementById('gear-item-name'); if(in2) in2.focus(); return; }

      var iCatId  = (document.getElementById('gear-item-catid')  || {value:''}).value;
      var iWeight = (document.getElementById('gear-item-weight') || {value:''}).value.trim();
      var iLocId  = (document.getElementById('gear-item-locid')  || {value:''}).value;
      var iNote   = (document.getElementById('gear-item-note')   || {value:''}).value.trim();

      if (saveItemEid) {
        var editItem = _template.items.find(function(i) { return i.id === saveItemEid; });
        if (editItem) {
          editItem.name = itemName; editItem.categoryId = iCatId;
          editItem.weight = iWeight; editItem.locationId = iLocId; editItem.note = iNote;
        }
      } else {
        _template.items.push({ id: GearData.uid(), name: itemName, categoryId: iCatId, weight: iWeight, locationId: iLocId, note: iNote });
      }
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-item-del') {
      var delItemId = t.dataset.itemid;
      _template.items = _template.items.filter(function(i) { return i.id !== delItemId; });
      _closeAllSheets();
      await _save();
      _renderAndRestore();
      return;
    }

    /* ═════════════ ВЫБОР ВЕЩЕЙ ДЛЯ ПОЕЗДКИ (из Шаблона) ═════════════ */

    if (action === 'gear-pick-mode-enter') {
      if (!_isMe) return;
      _pickMode = true;
      _pickSelected = [];
      _renderAndRestore();
      return;
    }

    if (action === 'gear-pick-mode-cancel') {
      _pickMode = false;
      _pickSelected = [];
      _renderAndRestore();
      return;
    }

    if (action === 'gear-pick-toggle-item') {
      var pItemId = t.dataset.itemid;
      var pIdx = _pickSelected.indexOf(pItemId);
      if (pIdx >= 0) _pickSelected.splice(pIdx, 1); else _pickSelected.push(pItemId);
      var pNowOn = _pickSelected.indexOf(pItemId) >= 0;

      var pcb = t.querySelector('.gear-cb');
      var pcn = t.querySelector('.gear-cname');
      if (pcb) pcb.classList.toggle('on', pNowOn);
      if (pcn) pcn.classList.toggle('done', pNowOn);

      var pCatEl = t.closest('.gear-cat');
      if (pCatEl) {
        var pCatId    = pCatEl.dataset.catid;
        var pCatItems = _template.items.filter(function(i) { return i.categoryId === pCatId; });
        var pCatDone  = pCatItems.filter(function(i) { return _pickSelected.indexOf(i.id) >= 0; }).length;
        var pBadge = pCatEl.querySelector('[data-cat-badge]');
        if (pBadge) {
          pBadge.textContent = pCatDone + '/' + pCatItems.length;
          pBadge.className   = (pCatItems.length && pCatDone === pCatItems.length) ? 'gear-badge-ok' : 'gear-badge-part';
        }
      }

      var pDoneBar = _container ? _container.querySelector('.gear-pick-donebar') : null;
      if (pDoneBar) {
        pDoneBar.innerHTML = 'Готово' + (_pickSelected.length ? ' <span class="gear-pick-donecount">(' + _pickSelected.length + ')</span>' : '');
      }
      return;
    }

    if (action === 'gear-pick-done') {
      if (!_pickSelected.length) { alert('Отметь хотя бы одну вещь.'); return; }
      var myTrips = (typeof TripsData !== 'undefined') ? TripsData.getMine(_uid) : [];
      var existingIds = _tripList.map(function(t2) { return t2.id; });
      _openSheet(GearRender.sheetPickTrip(myTrips, existingIds));
      return;
    }

    if (action === 'gear-pick-trip-selected') {
      var targetTripId   = t.dataset.tripid;
      var targetTripName = t.dataset.tripname;
      _closeAllSheets();
      var payload = _buildPickedTemplate(_template, _pickSelected);
      try {
        await GearData.saveTripSnapshot(_uid, targetTripId, targetTripName, payload);
      } catch (err) {
        console.error('GearData.saveTripSnapshot:', err);
        alert('Не удалось сохранить список поездки. Проверь соединение и попробуй ещё раз.');
        return;
      }
      _pickMode = false;
      _pickSelected = [];
      _tripList   = GearData.getTripList(_uid);
      _activeTrip = targetTripId;
      _scope      = 'personal';
      _renderAndRestore();
      return;
    }

    /* ═════════════ ОБЩЕЕ СНАРЯЖЕНИЕ (на поездку, видно всем) ═════════════ */

    if (action === 'gear-shared-cat-add') {
      if (!_sharedData) _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
      _openSheet(GearRender.sheetAddSharedCategory());
      return;
    }

    if (action === 'gear-shared-cat-save') {
      var scName = (document.getElementById('gear-shared-cat-name') || {value:''}).value.trim();
      if (!scName) { var scn = document.getElementById('gear-shared-cat-name'); if (scn) scn.focus(); return; }
      if (!_sharedData) _sharedData = { tripId: _activeTrip, categories: [], items: [], checked: [] };
      _sharedData.categories.push({ id: GearData.uid(), name: scName, iconIdx: 0 });
      _closeAllSheets();
      await _saveShared();
      _renderAndRestore();
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
      await _saveShared();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-shared-item-del') {
      if (!_sharedData) return;
      var sDelId = t.dataset.itemid;
      _sharedData.items = _sharedData.items.filter(function(i) { return i.id !== sDelId; });
      await _saveShared();
      _renderAndRestore();
      return;
    }

    if (action === 'gear-shared-item-check') {
      if (!_sharedData) return;
      var sciId     = t.dataset.itemid;
      var sChecked  = _sharedData.checked || [];
      var sIdx      = sChecked.indexOf(sciId);
      if (sIdx >= 0) sChecked.splice(sIdx, 1); else sChecked.push(sciId);
      _sharedData.checked = sChecked;
      GearData.setSharedChecked(_activeTrip, sChecked);

      var nowOn = sChecked.indexOf(sciId) >= 0;
      var scb  = t.querySelector('.gear-cb');
      var scn2 = t.querySelector('.gear-cname');
      if (scb)  scb.classList.toggle('on', nowOn);
      if (scn2) scn2.classList.toggle('done', nowOn);

      var catEl2 = t.closest('.gear-cat');
      if (catEl2 && _sharedData) {
        var sCatId    = catEl2.dataset.catid;
        var sCatItems = _sharedData.items.filter(function(i) { return i.categoryId === sCatId; });
        var sCatDone  = sCatItems.filter(function(i) { return sChecked.indexOf(i.id) >= 0; }).length;
        var sBadge = catEl2.querySelector('[data-cat-badge]');
        if (sBadge) {
          sBadge.textContent = sCatDone + '/' + sCatItems.length;
          sBadge.className   = (sCatItems.length && sCatDone === sCatItems.length) ? 'gear-badge-ok' : 'gear-badge-part';
        }
      }
      return;
    }

    /* ═════════════ ЧЕКБОКСЫ ПОЕЗДКИ ═════════════ */

    if (action === 'gear-item-check') {
      if (_activeTrip === 'template') return;
      var checkItemId = t.dataset.itemid;
      var checked     = GearData.getChecked(_uid, _activeTrip);
      var idx         = checked.indexOf(checkItemId);
      var nowChecked;
      if (idx >= 0) { checked.splice(idx, 1); nowChecked = false; }
      else          { checked.push(checkItemId); nowChecked = true; }
      GearData.setChecked(_uid, _activeTrip, checked);

      // Обновляем UI без полного ре-рендера
      var cb   = t.querySelector('.gear-cb');
      var name = t.querySelector('.gear-cname');
      if (cb)   cb.classList.toggle('on', nowChecked);
      if (name) name.classList.toggle('done', nowChecked);

      // Прогресс-бар
      var snap2   = GearData.getTripSnapshot(_uid, _activeTrip);
      var checked2 = GearData.getChecked(_uid, _activeTrip);
      if (snap2) {
        var total2    = snap2.items.length;
        var done2     = checked2.length;
        var pct2      = total2 ? Math.round(done2/total2*100) : 0;
        var wDone2    = snap2.items.filter(function(i) { return checked2.indexOf(i.id) >= 0; }).reduce(function(s,i) { return s+(Number(i.weight)||0); }, 0);
        var fill = _container ? _container.querySelector('.gear-prog-fill') : null;
        var lbl  = _container ? _container.querySelector('.gear-prog-lbl')  : null;
        if (fill) fill.style.width = pct2+'%';
        if (lbl) {
          var wl = wDone2 >= 1000 ? (wDone2/1000).toFixed(1)+' кг' : (wDone2 ? wDone2+' г' : '');
          lbl.textContent = done2+' / '+total2+(wl?' · '+wl:'');
        }
        // Бейдж категории
        var catEl = t.closest('.gear-cat');
        if (catEl) {
          var catBadgeId = catEl.dataset.catid;
          var catItems2  = snap2.items.filter(function(i) { return i.categoryId === catBadgeId; });
          var catDone2   = catItems2.filter(function(i) { return checked2.indexOf(i.id) >= 0; }).length;
          var badge = catEl.querySelector('[data-cat-badge]');
          if (badge) {
            badge.textContent = catDone2+'/'+catItems2.length;
            badge.className   = catDone2 === catItems2.length ? 'gear-badge-ok' : 'gear-badge-part';
          }
        }
      }
      return;
    }

    /* ═════════════ ПИКЕР ИКОНОК ═════════════ */

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
      tmpl = await GearData.load(uid);
    } else {
      var srcSnap = GearData.getTripSnapshot(uid, source);
      tmpl = srcSnap
        ? { locations: srcSnap.locations, categories: srcSnap.categories, items: srcSnap.items }
        : { locations: [], categories: [], items: [] };
    }
    await GearData.saveTripSnapshot(uid, tripId, tripName, tmpl);
    if (_uid === uid) {
      _tripList = GearData.getTripList(uid);
      _renderAndRestore();
    }
  }

  return { init, createTripList };
})();

'use strict';
/* globals GearData, GearRender */

const GearModule = (() => {
  var _uid        = null;
  var _isMe       = false;
  var _container  = null;
  var _template   = null;
  var _activeTrip = 'template';
  var _tripList   = [];

  /* ── Инициализация ── */
  async function init(uid, isMe, container) {
    _uid        = uid;
    _isMe       = isMe;
    _container  = container;
    _activeTrip = 'template';
    _tripList   = GearData.getTripList(uid);
    _template   = await GearData.load(uid);
    _render();
  }

  function _render() {
    if (!_container) return;
    if (_activeTrip === 'template') {
      _container.innerHTML = GearRender.tabMain(_template, _tripList, _isMe);
    } else {
      var snap    = GearData.getTripSnapshot(_uid, _activeTrip);
      var checked = GearData.getChecked(_uid, _activeTrip);
      _container.innerHTML = GearRender.tabTrip(snap, checked, _tripList, _activeTrip);
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

  var _SHEET_IDS = ['gear-loc-sheet','gear-cat-sheet','gear-item-sheet','gear-pick-sheet','gear-ctx-sheet'];

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
      var loc   = _template.locations.find(function(l) { return l.id === locId; });
      if (!loc) return;
      var children = _template.locations.filter(function(l) { return l.parentId === locId; });
      if (!children.length) {
        // Нет вложенных — открываем редактирование
        if (_isMe) _openSheet(GearRender.sheetAddLocation(_template, locId));
        return;
      }
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
        panel.innerHTML = GearRender.nestedPanel(loc, _template.locations, _template.items);
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

    if (action === 'gear-loc-picked') {
      var locId   = t.dataset.locid;
      var trigger = t.dataset.trigger;
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
   * Вызывается из поездки при нажатии «Взять мой шаблон».
   * tripId — ID поездки (Firestore doc id), tripName — название.
   */
  async function takeTemplateToTrip(uid, tripId, tripName) {
    var tmpl = await GearData.load(uid);
    GearData.saveTripSnapshot(uid, tripId, tripName, tmpl);
    // Обновляем список если модуль активен для этого пользователя
    if (_uid === uid) {
      _tripList = GearData.getTripList(uid);
      _renderAndRestore();
    }
  }

  return { init, takeTemplateToTrip };
})();

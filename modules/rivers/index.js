'use strict';

/* =========================================================
   RiversIndex — контроллер вкладки Реки
   =========================================================
   Публичный API:
     RiversIndex.init(el, tripData, tripId)
     RiversIndex.render()
     RiversIndex.openRiver(idOrName)
   ========================================================= */
var RiversIndex = (function () {

  var _el     = null;   // div#p-rivers
  var _trip   = null;   // объект экспедиции из JSON
  var _tripId = '';     // id экспедиции (для ключей localStorage)
  var _kept   = true;   // улов: взяли / отпустили
  var _currentRiverId = null; // открытая карточка
  var _catchesUnsub = null; // отписка от CatchesFirebase.listen (карточка реки)
  var _navHandler = null;      // хэндлер клика по навигатору (карточка реки)
  var _catchDelHandler = null; // хэндлер удаления записи улова (карточка реки)
  var _ptHandler = null;       // хэндлер редактирования/удаления точки (карточка реки)

  /* ──────────────────────────────────────────────────────
     localStorage helpers
  ────────────────────────────────────────────────────── */
  function _lsKey(suffix) {
    return 'rv_' + _tripId + '_' + suffix;
  }
  function _lsGet(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch (e) { return null; }
  }
  function _lsSet(key, val) {
    try { localStorage.setItem(key, JSON.stringify(val)); } catch (e) {}
  }

  function _getNotes()  { return _lsGet(_lsKey('notes'))  || {}; }
  function _getPoints() { return _lsGet(_lsKey('points')) || {}; }

  function _saveNotes(obj)  { _lsSet(_lsKey('notes'),  obj); }
  function _savePoints(obj) { _lsSet(_lsKey('points'), obj); }

  /* Уловы — localStorage под ключом ff_catches (shared with «Ещё → Улов») */
  var _LS_CATCHES = 'ff_catches';

  function _getCatches() {
    // Сначала пробуем общий ST (старый монолит)
    if (window.ST && Array.isArray(window.ST.catches)) return window.ST.catches;
    // Иначе localStorage
    try { return JSON.parse(localStorage.getItem(_LS_CATCHES)) || []; } catch(e) { return []; }
  }

  function _saveCatches(arr) {
    try { localStorage.setItem(_LS_CATCHES, JSON.stringify(arr)); } catch(e) {}
    // Синхронизируем с ST если есть
    if (window.ST) {
      window.ST.catches = arr;
      if (typeof save === 'function') save();
    }
    // Firebase если подключён
    // addCatchToFirebase вызывается отдельно при добавлении
  }

  function _addCatch(entry) {
    var all = _getCatches();
    all.push(entry);
    _saveCatches(all);
    if (typeof addCatchToFirebase === 'function') {
      addCatchToFirebase(entry);
    }
  }

  function _delCatch(idx) {
    // [PATCH] Удаляем через Firebase если доступен
    var tripId = window.APP && window.APP.currentTripId;
    var allCatches = (tripId && typeof CatchesState !== 'undefined')
      ? CatchesState.getCatches(tripId)
      : _getCatches();
 
    var catchEntry = allCatches[idx];
    if (!catchEntry) return;
 
    if (tripId && typeof CatchesFirebase !== 'undefined' && catchEntry._id && !catchEntry._id.startsWith('tmp_')) {
      CatchesFirebase.deleteCatch(tripId, catchEntry._id);
      if (typeof CatchesState !== 'undefined') {
        CatchesState.removeCatch(tripId, catchEntry._id);
      }
    } else {
      // Fallback localStorage
      var all = _getCatches();
      all.splice(idx, 1);
      _saveCatches(all);
    }
  }

  /* ──────────────────────────────────────────────────────
     RENDER LIST
  ────────────────────────────────────────────────────── */
  function _renderList() {
  _currentRiverId = null;
  var rivers = (_trip && _trip.rivers) ? _trip.rivers : [];
  _el.innerHTML = RiversRender.list(rivers);
  _el.style.overflowY = 'auto';
  _el.style.flexDirection = 'column';
  _el.scrollTop = 0;
  window.scrollTo(0, 0);
  _bindList();
}

  function _bindList() {
    _el.addEventListener('click', _onListClick);
  }

  function _onListClick(e) {
    /* открыть карточку */
    var opener = e.target.closest('[data-rv-open]');
    if (opener) {
      _el.removeEventListener('click', _onListClick);
      _openDetail(opener.getAttribute('data-rv-open'));
      return;
    }
    /* навигатор */
    var navBtn = e.target.closest('[data-rv-nav]');
    if (navBtn) {
      window.open(navBtn.getAttribute('data-rv-nav'), '_blank');
    }
  }

  /* ──────────────────────────────────────────────────────
     RENDER DETAIL
  ────────────────────────────────────────────────────── */
  function _openDetail(id) {
    _currentRiverId = id;
    var rivers = (_trip && _trip.rivers) ? _trip.rivers : [];
    var r = null;
    for (var i = 0; i < rivers.length; i++) {
      if (rivers[i].id === id) { r = rivers[i]; break; }
    }
    if (!r) { _renderList(); return; }

    var state = {
      notes:   _getNotes(),
      points:  _getPoints(),
      catches: _getCatches()
    };

    /* помечаем уловы индексом для удаления */
    var allCatches = _getCatches();
    state.catches = allCatches
      .map(function (c, i) { return Object.assign({}, c, { _idx: i }); })
      .filter(function (c) { return c.river === r.name; });

    _el.style.overflowY = 'hidden';
    _el.style.flexDirection = 'column';
    _el.innerHTML = RiversRender.detail(r, state);
    var scroll = document.getElementById('rv-det-scroll');
    if (scroll) scroll.scrollTop = 0;
    _el.scrollTop = 0;
    _bindDetail(r);
  }

  function _bindDetail(r) {
    /* назад */
    var backBtn = document.getElementById('rv-back-btn');
    if (backBtn) backBtn.addEventListener('click', _renderList);

    /* навигатор (парковка, точки) */
    if (_navHandler) _el.removeEventListener('click', _navHandler);
    _navHandler = function (e) {
      var btn = e.target.closest('[data-rv-nav]');
      if (btn) window.open(btn.getAttribute('data-rv-nav'), '_blank');
    };
    _el.addEventListener('click', _navHandler);

    /* взяли / отпустили */
    var togKept = document.getElementById('rv-tog-kept');
    var togRel  = document.getElementById('rv-tog-rel');
    if (togKept) togKept.addEventListener('click', function () { _kept = true;  _updateTogs(); });
    if (togRel)  togRel.addEventListener('click',  function () { _kept = false; _updateTogs(); });
    _kept = true;

    /* сохранить улов */
    var saveBtn = document.getElementById('rv-catch-save-btn');
    if (saveBtn) saveBtn.addEventListener('click', function () { _saveCatch(r); });

    /* удалить запись улова */
    if (_catchDelHandler) _el.removeEventListener('click', _catchDelHandler);
    _catchDelHandler = function (e) {
      var del = e.target.closest('[data-catch-del]');
      if (!del) return;
      var idx = parseInt(del.getAttribute('data-catch-del'), 10);
      _delCatch(idx);
      _refreshCatchLog(r);
    };
    _el.addEventListener('click', _catchDelHandler);

    /* точки — добавить */
    var addPtBtn = document.getElementById('rv-add-pt-btn');
    if (addPtBtn) addPtBtn.addEventListener('click', _showPtForm);

    /* точки — отмена */
    var cancelPt = document.getElementById('rv-pt-cancel');
    if (cancelPt) cancelPt.addEventListener('click', _hidePtForm);

    /* точки — сохранить */
    var savePt = document.getElementById('rv-pt-save-btn');
    if (savePt) savePt.addEventListener('click', function () { _savePoint(r.id); });

    /* точки — редактировать / удалить */
    if (_ptHandler) _el.removeEventListener('click', _ptHandler);
    _ptHandler = function (e) {
      var editBtn = e.target.closest('[data-pt-edit]');
      if (editBtn) { _editPoint(r.id, parseInt(editBtn.getAttribute('data-pt-edit'), 10)); return; }
      var delBtn = e.target.closest('[data-pt-del]');
      if (delBtn)  { _deletePoint(r.id, parseInt(delBtn.getAttribute('data-pt-del'), 10)); }
    };
    _el.addEventListener('click', _ptHandler);

    /* заметки */
    var notesEdit  = document.getElementById('rv-notes-edit');
    var notesDel   = document.getElementById('rv-notes-del');
    var notesSave  = document.getElementById('rv-notes-save-btn');
    if (notesEdit) notesEdit.addEventListener('click', _editNote);
    if (notesDel)  notesDel.addEventListener('click',  function () { _deleteNote(r.id); });
    if (notesSave) notesSave.addEventListener('click',  function () { _saveNote(r.id); });
    // [PATCH] Подписываемся на real-time обновления улова из Firebase
    // Отписываемся от предыдущей подписки (если карточка реки открывалась
    // ранее), иначе при каждом открытии карточки накапливался бы новый
    // подписчик и они никогда не освобождались.
    if (_catchesUnsub) { _catchesUnsub(); _catchesUnsub = null; }
    var tripId = window.APP && window.APP.currentTripId;
    if (tripId && typeof CatchesFirebase !== 'undefined') {
      _catchesUnsub = CatchesFirebase.listen(tripId, function(arr) {
        if (typeof CatchesState !== 'undefined') {
          CatchesState.setCatches(tripId, arr);
        }
        // Обновляем лог текущей реки
        var riverCatches = arr
          .map(function(c, i) { return Object.assign({}, c, { _idx: i }); })
          .filter(function(c) { return c.river === r.name; });
        var logEl = document.getElementById('rv-catch-log');
        if (logEl) {
          logEl.outerHTML = RiversRender.catchLog(riverCatches);
        }
      });
    }
  }

  /* ──────────────────────────────────────────────────────
     CATCH
  ────────────────────────────────────────────────────── */
  function _updateTogs() {
    var k = document.getElementById('rv-tog-kept');
    var rel = document.getElementById('rv-tog-rel');
    if (k)   k.className   = 'rv-tog' + (_kept ? ' active' : '');
    if (rel) rel.className = 'rv-tog' + (!_kept ? ' active' : '');
  }

  function _saveCatch(r) {
    var fishEl   = document.getElementById('rv-c-fish');
    var cntEl    = document.getElementById('rv-c-cnt');
    var memberEl = document.getElementById('rv-c-member'); // [PATCH]
    if (!fishEl || !cntEl) return;
 
    var entry = {
      date:   new Date().toISOString().split('T')[0],
      river:  r.name,
      fish:   fishEl.value,
      count:  parseInt(cntEl.value) || 1,
      kept:   _kept,
      member: memberEl ? (memberEl.value || '') : '', // [PATCH]
      createdAt: new Date().toISOString()
    };
 
    // [PATCH] Сохраняем в Firebase через CatchesFirebase
    var tripId = window.APP && window.APP.currentTripId;
    if (tripId && typeof CatchesFirebase !== 'undefined') {
      // Оптимистично добавляем в state
      var tmpEntry = Object.assign({}, entry, { _id: 'tmp_' + Date.now() });
      if (typeof CatchesState !== 'undefined') {
        CatchesState.addCatch(tripId, tmpEntry);
      }
      CatchesFirebase.addCatch(tripId, entry);
    } else {
      // Fallback: старый localStorage
      _addCatch(entry);
    }
 
    _refreshCatchLog(r);
  }

  function _refreshCatchLog(r) {
    var allCatches;
 
    // [PATCH] Если CatchesState доступен — читаем оттуда
    var tripId = window.APP && window.APP.currentTripId;
    if (tripId && typeof CatchesState !== 'undefined') {
      allCatches = CatchesState.getCatches(tripId);
    } else {
      allCatches = _getCatches();
    }
 
    var riverCatches = allCatches
      .map(function (c, i) { return Object.assign({}, c, { _idx: i }); })
      .filter(function (c) { return c.river === r.name; });
 
    var logEl = document.getElementById('rv-catch-log');
    if (!logEl) return;
    if (riverCatches.length === 0) {
      logEl.innerHTML = '';
      logEl.className = '';
      return;
    }
    logEl.outerHTML = RiversRender.catchLog(riverCatches);
  }

  /* ──────────────────────────────────────────────────────
     POINTS
  ────────────────────────────────────────────────────── */
  function _showPtForm() {
    var form = document.getElementById('rv-pt-form');
    var btn  = document.getElementById('rv-add-pt-btn');
    if (form) form.className = 'rv-pt-form show';
    if (btn)  btn.style.display = 'none';
    var inp = document.getElementById('rv-pt-name');
    if (inp) inp.focus();
  }
  function _hidePtForm() {
    var form = document.getElementById('rv-pt-form');
    var btn  = document.getElementById('rv-add-pt-btn');
    if (form) form.className = 'rv-pt-form';
    if (btn)  btn.style.display = 'inline-block';
    _clearPtForm();
  }
  function _clearPtForm() {
    ['rv-pt-name','rv-pt-coord','rv-pt-note'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.value = '';
    });
  }

  function _savePoint(rid) {
    var name  = (document.getElementById('rv-pt-name')  || {}).value || '';
    var coord = (document.getElementById('rv-pt-coord') || {}).value || '';
    var note  = (document.getElementById('rv-pt-note')  || {}).value || '';
    if (!name.trim()) return;

    /* parse coordinates */
    var lat = null, lon = null;
    var m = coord.match(/([\d.]+)[,\s]+([\d.]+)/);
    if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]); }

    var pt = {
      name: name.trim(),
      note: note.trim(),
      coordStr: coord.trim(),
      lat: lat,
      lon: lon
    };

    var pts = _getPoints();
    if (!pts[rid]) pts[rid] = [];
    pts[rid].push(pt);
    _savePoints(pts);

    var listEl = document.getElementById('rv-pts-list');
    if (listEl) listEl.innerHTML = RiversRender.pointsList(pts[rid], rid);
    _hidePtForm();
  }

  function _editPoint(rid, idx) {
    var pts = _getPoints();
    var pt = (pts[rid] || [])[idx];
    if (!pt) return;

    /* fill form */
    var nameEl  = document.getElementById('rv-pt-name');
    var coordEl = document.getElementById('rv-pt-coord');
    var noteEl  = document.getElementById('rv-pt-note');
    if (nameEl)  nameEl.value  = pt.name  || '';
    if (coordEl) coordEl.value = pt.coordStr || '';
    if (noteEl)  noteEl.value  = pt.note  || '';

    /* remove old */
    pts[rid].splice(idx, 1);
    _savePoints(pts);
    var listEl = document.getElementById('rv-pts-list');
    if (listEl) listEl.innerHTML = RiversRender.pointsList(pts[rid], rid);

    _showPtForm();
  }

  function _deletePoint(rid, idx) {
    var pts = _getPoints();
    if (!pts[rid]) return;
    pts[rid].splice(idx, 1);
    _savePoints(pts);
    var listEl = document.getElementById('rv-pts-list');
    if (listEl) listEl.innerHTML = RiversRender.pointsList(pts[rid], rid);
  }

  /* ──────────────────────────────────────────────────────
     NOTES
  ────────────────────────────────────────────────────── */
  function _editNote() {
    var saved = document.getElementById('rv-notes-saved');
    var acts  = document.getElementById('rv-notes-acts');
    var ta    = document.getElementById('rv-notes-ta');
    var btn   = document.getElementById('rv-notes-save-btn');
    if (saved) saved.className = 'rv-notes-saved';
    if (acts)  acts.className  = 'rv-notes-acts';
    if (ta)    ta.className    = 'rv-notes-ta';
    if (btn)   btn.className   = 'rv-notes-save';
    if (ta) ta.focus();
  }

  function _saveNote(rid) {
    var ta  = document.getElementById('rv-notes-ta');
    var val = ta ? ta.value.trim() : '';

    var notes = _getNotes();
    if (val) {
      notes[rid] = val;
    } else {
      delete notes[rid];
    }
    _saveNotes(notes);

    var saved = document.getElementById('rv-notes-saved');
    var acts  = document.getElementById('rv-notes-acts');
    var btn   = document.getElementById('rv-notes-save-btn');

    if (val) {
      if (saved) { saved.textContent = val; saved.className = 'rv-notes-saved show'; }
      if (acts)  acts.className = 'rv-notes-acts show';
      if (ta)    ta.className   = 'rv-notes-ta hide';
      if (btn)   btn.className  = 'rv-notes-save hide';
    } else {
      if (saved) saved.className = 'rv-notes-saved';
      if (acts)  acts.className  = 'rv-notes-acts';
      if (ta)    ta.className    = 'rv-notes-ta';
      if (btn)   btn.className   = 'rv-notes-save';
    }
  }

  function _deleteNote(rid) {
    var notes = _getNotes();
    delete notes[rid];
    _saveNotes(notes);

    var saved = document.getElementById('rv-notes-saved');
    var acts  = document.getElementById('rv-notes-acts');
    var ta    = document.getElementById('rv-notes-ta');
    var btn   = document.getElementById('rv-notes-save-btn');

    if (saved) { saved.textContent = ''; saved.className = 'rv-notes-saved'; }
    if (acts)  acts.className  = 'rv-notes-acts';
    if (ta)    { ta.value = ''; ta.className = 'rv-notes-ta'; }
    if (btn)   btn.className   = 'rv-notes-save';
  }

  /* ──────────────────────────────────────────────────────
     PUBLIC API
  ────────────────────────────────────────────────────── */
  function init(el, tripData, tripId) {
    _el     = el;
    _trip   = tripData;
    _tripId = tripId || 'default';
    _renderList();
  }

  function render() {
    if (!_el) return;
    if (_currentRiverId) {
      _openDetail(_currentRiverId);
    } else {
      _renderList();
    }
  }

  /* Открыть карточку конкретной реки по id или названию.
     Требует, чтобы init() уже был вызван (задаёт _el/_trip). */
  function openRiver(idOrName) {
    if (!_el) return;
    var rivers = (_trip && _trip.rivers) ? _trip.rivers : [];
    var r = null;
    for (var i = 0; i < rivers.length; i++) {
      if (rivers[i].id === idOrName || rivers[i].name === idOrName) { r = rivers[i]; break; }
    }
    if (!r) { _renderList(); return; }
    _openDetail(r.id);
  }

  return { init: init, render: render, openRiver: openRiver };
})();

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
  var _tripId = '';     // id экспедиции
  var _kept   = true;   // улов: взяли / отпустили
  var _currentRiverId = null; // открытая карточка
  var _catchesUnsub = null; // отписка от CatchesFirebase.listen (карточка реки)
  var _navHandler = null;      // хэндлер клика по навигатору (карточка реки)
  var _catchDelHandler = null; // хэндлер удаления записи улова (карточка реки)
  var _ptHandler = null;       // хэндлер редактирования/удаления точки (карточка реки)

  /* ──────────────────────────────────────────────────────
     Точки и заметки — теперь в Firestore (RiversFirebase), а не в
     localStorage: раньше точка, добавленная с телефона, была не
     видна на компьютере и другим участникам. _pointsCache/_notesCache
     держим синхронными с realtime-подпиской, включённой в init().
  ────────────────────────────────────────────────────── */
  var _pointsCache = {}; // { riverId: [ {_id, name, note, coordStr, lat, lon}, ... ] }
  var _notesCache  = {}; // { riverId: text }

  function _getNotes()  { return _notesCache; }
  function _getPoints() { return _pointsCache; }

  /* Уловы — источник истины CatchesFirebase/CatchesState (Firestore).
     localStorage тут — только запасной путь на случай, если сама
     Firestore-интеграция не подключилась (например скрипт не успел
     загрузиться в плохой сети) — не выдумывать данные заново, а хотя
     бы не терять то, что человек внёс. */
  var _LS_CATCHES = 'ff_catches';

  function _getCatches() {
    try { return JSON.parse(localStorage.getItem(_LS_CATCHES)) || []; } catch(e) { return []; }
  }

  // CatchesState — тот же кэш, что и реалтайм-подписка ниже уже держит
  // актуальным; читаем оттуда всегда, когда он доступен, вместо
  // localStorage (тот больше никем не пишется после переезда на Firestore,
  // так что первым открытием карточки реки всегда показывал пустой лог на
  // долю секунды, пока не придёт снапшот — теперь смотрим в уже тёплый кэш).
  function _riverCatchesFor(riverName) {
    var tripId = window.APP && window.APP.currentTripId;
    var all = (tripId && typeof CatchesState !== 'undefined') ? CatchesState.getCatches(tripId) : _getCatches();
    return (all || [])
      .map(function (c, i) { return Object.assign({}, c, { _idx: i }); })
      .filter(function (c) { return c.river === riverName; });
  }

  function _saveCatches(arr) {
    try { localStorage.setItem(_LS_CATCHES, JSON.stringify(arr)); } catch(e) {}
  }

  function _addCatch(entry) {
    var all = _getCatches();
    all.push(entry);
    _saveCatches(all);
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
    var addBtn = document.getElementById('rv-add-place-btn');
    if (addBtn) addBtn.addEventListener('click', _showAddPlace);
    var listCard = _el.querySelector('.rv-list-card');
    if (listCard && typeof UIUtils !== 'undefined') UIUtils.swipeToDelete(listCard, '.rv-row', '.rv-row-del');
  }

  /* «+ Добавить место» — общий лист «название + регион» с проверкой на
     дубли (UIUtils.placeSheet). Пишем в trip.rivers и, если у поездки
     есть AI-импорт, в importData.rivers (Места читают его в первую
     очередь) — тот же формат, что у мастера поездки. */
  function _showAddPlace() {
    var list = (_trip && _trip.rivers) || [];
    UIUtils.placeSheet({ title: 'Новое место', okLabel: 'Добавить', list: list }).then(function (res) {
      if (res) _addPlace(res.name, res.region);
    });
  }

  /* Правка места: название и регион. Уловы ссылаются на место по
     названию (catch.river), поэтому при переименовании переносим и их —
     иначе улов «пропадал» из карточки места. Точки и заметки — по id. */
  function _editPlace(id) {
    var list = (_trip && _trip.rivers) || [];
    var place = null;
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { place = list[i]; break; }
    if (!place) return;
    UIUtils.placeSheet({ title: 'Изменить место', name: place.name, region: place.region || place.type || '', list: list, exceptId: id })
      .then(function (res) {
        if (!res) return;
        var trip = TripsData.getById(_tripId);
        if (!trip) return;
        var oldName = place.name;
        var patch = function (r) { return r.id === id ? Object.assign({}, r, { name: res.name, region: res.region }) : r; };
        var patchImp = function (r) { return r.id === id ? Object.assign({}, r, { name: res.name, type: res.region }) : r; };
        var rivers = (trip.rivers || []).map(patch);
        var changes = { rivers: rivers };
        if (trip.importData) changes.importData = Object.assign({}, trip.importData, { rivers: (trip.importData.rivers || []).map(patchImp) });
        TripsData.updateTrip(_tripId, changes).then(function () {
          if (oldName !== res.name) {
            var col = firebase.firestore().collection('trips').doc(_tripId).collection('catches');
            col.where('river', '==', oldName).get().then(function (snap) {
              snap.forEach(function (d) { d.ref.update({ river: res.name }); });
            });
          }
          var data = changes.importData || { name: trip.name, rivers: rivers, participants: trip.participants || [] };
          if (window.APP && window.APP.currentTripId === _tripId) window.APP.currentTripData = data;
          _trip = data;
          _openDetail(id);
        });
      });
  }

  // Убрать место из поездки (trip.rivers и importData.rivers). Уловы,
  // точки и заметки не трогаем — они привязаны к названию/id и просто
  // перестанут показываться в Местах; вернуть место — добавить заново.
  function _removePlace(id) {
    var trip = (typeof TripsData !== 'undefined') ? TripsData.getById(_tripId) : null;
    if (!trip) return;
    var all = (_trip && _trip.rivers) || [];
    var place = null;
    for (var i = 0; i < all.length; i++) if (all[i].id === id) { place = all[i]; break; }
    var name = place ? place.name : 'место';
    UIUtils.confirmSheet('Улов, точки и заметки этого места не удалятся.', { title: 'Убрать «' + name + '» из поездки?', okLabel: 'Убрать' }).then(function (ok) {
      if (!ok) return;
      var rivers = (trip.rivers || []).filter(function (r) { return r.id !== id; });
      var changes = { rivers: rivers };
      if (trip.importData) {
        changes.importData = Object.assign({}, trip.importData, {
          rivers: (trip.importData.rivers || []).filter(function (r) { return r.id !== id; })
        });
      }
      TripsData.updateTrip(_tripId, changes).then(function () {
        var data = changes.importData || { name: trip.name, rivers: rivers, participants: trip.participants || [] };
        if (window.APP && window.APP.currentTripId === _tripId) window.APP.currentTripData = data;
        _trip = data;
        _renderList();
      }).catch(function () {
        UIUtils.confirmSheet('Не получилось убрать место — проверь интернет и попробуй ещё раз.', { title: 'Не сохранилось', okLabel: 'Понятно', danger: false });
      });
    });
  }

  function _addPlace(name, region) {
    var trip = (typeof TripsData !== 'undefined') ? TripsData.getById(_tripId) : null;
    if (!trip) return;
    var id = 'river_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
    var rivers = (trip.rivers || []).concat([{ id: id, name: name, region: region }]);
    var changes = { rivers: rivers };
    if (trip.importData) {
      changes.importData = Object.assign({}, trip.importData, {
        rivers: (trip.importData.rivers || []).concat([{ id: id, name: name, type: region }])
      });
    }
    TripsData.updateTrip(_tripId, changes).then(function () {
      // Места читают APP.currentTripData (см. tripcover enterTrip) —
      // обновляем сразу, не дожидаясь снапшота поездки.
      var data = changes.importData || { name: trip.name, rivers: rivers, participants: trip.participants || [] };
      if (window.APP && window.APP.currentTripId === _tripId) window.APP.currentTripData = data;
      _trip = data;
      if (typeof ActivityLog !== 'undefined') ActivityLog.add(_tripId, 'place', 'добавил место: ' + name + (region ? ', ' + region : ''));
      _renderList();
    }).catch(function () {
      if (typeof UIUtils !== 'undefined') UIUtils.confirmSheet('Не получилось сохранить место — проверь интернет и попробуй ещё раз.', { title: 'Место не добавлено', okLabel: 'Понятно', danger: false });
    });
  }

  function _notImplemented(msg) {
    if (typeof UIUtils !== 'undefined' && UIUtils.confirmSheet) {
      UIUtils.confirmSheet(msg, { title: 'Пока недоступно', okLabel: 'Понятно', cancelLabel: 'Закрыть', danger: false });
    }
  }

  function _onListClick(e) {
    /* удалить место — кнопка под строкой, выезжает свайпом влево */
    var delBtn = e.target.closest('[data-rv-del]');
    if (delBtn) {
      e.stopPropagation();
      _removePlace(delBtn.getAttribute('data-rv-del'));
      return;
    }
    /* навигатор — проверяем ПЕРВЫМ: кнопка вложена в строку с data-rv-open,
       иначе клик по «Навигатор» открывал бы ещё и карточку места. */
    var navBtn = e.target.closest('[data-rv-nav]');
    if (navBtn) {
      e.stopPropagation();
      window.open(navBtn.getAttribute('data-rv-nav'), '_blank');
      return;
    }
    /* открыть карточку */
    var opener = e.target.closest('[data-rv-open]');
    if (opener) {
      _el.removeEventListener('click', _onListClick);
      _openDetail(opener.getAttribute('data-rv-open'));
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
      catches: _riverCatchesFor(r.name)
    };

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
    var editBtn = document.getElementById('rv-edit-place');
    if (editBtn) editBtn.addEventListener('click', function () { _editPlace(r.id); });

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
    if (saveBtn) saveBtn.addEventListener('click', function () { UIUtils.withBusyButton(saveBtn, function () { return _saveCatch(r); }); });

    /* удалить запись улова — свайп влево, крестик убран (см. UIUtils.swipeToDelete) */
    var catchLogEl = document.getElementById('rv-catch-log');
    if (catchLogEl) UIUtils.swipeToDelete(catchLogEl, '.rv-catch-entry', '.rv-catch-del');
    if (_catchDelHandler) _el.removeEventListener('click', _catchDelHandler);
    _catchDelHandler = function (e) {
      var del = e.target.closest('[data-catch-del]');
      if (!del) return;
      var idx = parseInt(del.getAttribute('data-catch-del'), 10);
      _delCatch(idx);
      _refreshCatchLog(r);
    };
    _el.addEventListener('click', _catchDelHandler);

    /* FAB «+ Улов здесь» — раскрывает форму записи (была всегда видна) */
    var fab = document.getElementById('rv-fab-catch');
    var catchForm = document.getElementById('rv-catch-form');
    if (fab && catchForm) {
      fab.addEventListener('click', function () {
        catchForm.classList.toggle('show');
        if (catchForm.classList.contains('show')) catchForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    }

    /* «Все поимки» — переход на вкладку Улов (модуль Улов сам покажет
       полный список; фильтра по конкретному месту там сегодня нет) */
    var allLink = document.getElementById('rv-catch-all-link');
    if (allLink) allLink.addEventListener('click', function (e) {
      e.preventDefault();
      if (typeof onNavigate === 'function') onNavigate('catches');
    });

    /* «Заполнить» справку о месте — правки полей места (тип/дно/рыба/...)
       в UI пока нет (эти поля приходят из JSON-импорта поездки) */
    var fillBtn = document.getElementById('rv-fill-ref-btn');
    if (fillBtn) fillBtn.addEventListener('click', function () {
      _notImplemented('Редактирование справки о месте из интерфейса скоро появится. Пока эти поля приходят при импорте поездки.');
    });

    /* точки — добавить */
    var addPtBtn = document.getElementById('rv-add-pt-btn');
    if (addPtBtn) addPtBtn.addEventListener('click', _showPtForm);

    /* точки — отмена */
    var cancelPt = document.getElementById('rv-pt-cancel');
    if (cancelPt) cancelPt.addEventListener('click', _hidePtForm);

    /* точки — сохранить */
    var savePt = document.getElementById('rv-pt-save-btn');
    if (savePt) savePt.addEventListener('click', function () { _savePoint(r.id); });

    /* точки — правка по нажатию на строку, удаление свайпом влево
       (см. UIUtils.swipeToDelete) вместо «Ред.»/«×» */
    var ptsList = document.getElementById('rv-pts-list');
    if (ptsList) UIUtils.swipeToDelete(ptsList, '.rv-pt-item', '.rv-pt-del');
    if (_ptHandler) _el.removeEventListener('click', _ptHandler);
    _ptHandler = function (e) {
      var delBtn = e.target.closest('[data-pt-del]');
      if (delBtn) { _deletePoint(r.id, delBtn.getAttribute('data-pt-del')); return; }
      var navEl = e.target.closest('[data-rv-nav]');
      if (navEl) return; // сама навигация уже обработана _navHandler
      var editRow = e.target.closest('[data-pt-edit]');
      if (editRow) { _editPoint(r.id, editRow.getAttribute('data-pt-edit')); }
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
          _rebindCatchLogSwipe();
        }
        var sumEl = document.getElementById('rv-catch-summary');
        if (sumEl) sumEl.innerHTML = RiversRender.catchSummary(riverCatches);
      });
    }
  }

  function _rebindCatchLogSwipe() {
    var logEl = document.getElementById('rv-catch-log');
    if (logEl) UIUtils.swipeToDelete(logEl, '.rv-catch-entry', '.rv-catch-del');
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

    if (tripId && typeof ActivityLog !== 'undefined') {
      var t = entry.fish || 'рыба';
      if (entry.count > 1) t += ' × ' + entry.count;
      if (!entry.kept) t += ', отпустил';
      ActivityLog.add(tripId, 'catch', 'записал улов: ' + t);
    }

    _refreshCatchLog(r);
  }

  function _refreshCatchLog(r) {
    var riverCatches = _riverCatchesFor(r.name);

    var sumEl = document.getElementById('rv-catch-summary');
    if (sumEl) sumEl.innerHTML = RiversRender.catchSummary(riverCatches);

    var logEl = document.getElementById('rv-catch-log');
    if (!logEl) return;
    if (riverCatches.length === 0) {
      logEl.innerHTML = '';
      logEl.className = '';
      return;
    }
    logEl.outerHTML = RiversRender.catchLog(riverCatches);
    _rebindCatchLogSwipe();
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
    _editingPt = null;
  }

  // Индекс редактируемой точки (и река, к которой она относится) — точка
  // больше НЕ удаляется из списка сразу по клику "Ред." (см. _editPoint):
  // раньше она спличивалась и сохранялась немедленно, до того как человек
  // решил "Сохранить" или "Отмена" — нажатие "Отмена" тогда навсегда
  // теряло точку, никакого отката не было.
  var _editingPt = null;
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

    /* parse coordinates — знак минуса не входил в [\d.], поэтому «-33.86,
       151.21» терял минус у широты (сохранялось другое полушарие), а
       отрицательная долгота («51.5, -0.13») вообще не распознавалась —
       вторая группа не могла зацепить «-» ни при каком бэктрекинге,
       весь regex просто не матчился. Реальный баг, найден внешним
       ревью 2026-09-27. */
    var lat = null, lon = null;
    var m = coord.match(/(-?[\d.]+)[,\s]+(-?[\d.]+)/);
    if (m) { lat = parseFloat(m[1]); lon = parseFloat(m[2]); }

    var pt = {
      riverId: rid,
      name: name.trim(),
      note: note.trim(),
      coordStr: coord.trim(),
      lat: lat,
      lon: lon
    };

    var onSaveFail = function (e) {
      console.warn('river point save:', e);
      alert('Не удалось сохранить точку. Проверь соединение и попробуй ещё раз.');
    };
    if (_editingPt && _editingPt.rid === rid) {
      RiversFirebase.updatePoint(_tripId, _editingPt.id, pt).catch(onSaveFail);
    } else {
      RiversFirebase.addPoint(_tripId, pt).catch(onSaveFail);
    }
    // Список обновится сам через realtime-подписку (_onPointsUpdate) —
    // не патчим локально, чтобы не разойтись с тем, что реально сохранилось.
    _hidePtForm();
  }

  function _editPoint(rid, id) {
    var pts = _getPoints();
    var pt = (pts[rid] || []).filter(function (p) { return p._id === id; })[0];
    if (!pt) return;

    /* fill form */
    var nameEl  = document.getElementById('rv-pt-name');
    var coordEl = document.getElementById('rv-pt-coord');
    var noteEl  = document.getElementById('rv-pt-note');
    if (nameEl)  nameEl.value  = pt.name  || '';
    if (coordEl) coordEl.value = pt.coordStr || '';
    if (noteEl)  noteEl.value  = pt.note  || '';

    // Точку не трогаем в хранилище, пока не нажмут "Сохранить" — просто
    // запоминаем, какой документ перезаписать при сохранении.
    _editingPt = { rid: rid, id: id };
    _showPtForm();
  }

  function _deletePoint(rid, id) {
    RiversFirebase.deletePoint(_tripId, id).catch(function (e) { console.warn('river point delete:', e); });
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

    if (val) {
      _notesCache[rid] = val;
      RiversFirebase.saveNote(_tripId, rid, val).catch(function (e) { console.warn('river note save:', e); });
    } else {
      delete _notesCache[rid];
      RiversFirebase.deleteNote(_tripId, rid).catch(function (e) { console.warn('river note delete:', e); });
    }

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
    delete _notesCache[rid];
    RiversFirebase.deleteNote(_tripId, rid).catch(function (e) { console.warn('river note delete:', e); });

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
  function _onPointsUpdate(arr) {
    var byRiver = {};
    arr.forEach(function (pt) {
      if (!byRiver[pt.riverId]) byRiver[pt.riverId] = [];
      byRiver[pt.riverId].push(pt);
    });
    _pointsCache = byRiver;
    if (_currentRiverId) {
      var listEl = document.getElementById('rv-pts-list');
      if (listEl) listEl.innerHTML = RiversRender.pointsList(_pointsCache[_currentRiverId] || [], _currentRiverId);
    }
  }

  // Заметку не патчим прямо в открытой карточке (пользователь может сейчас
  // печатать) — только держим кэш тёплым для следующего открытия детали.
  function _onNotesUpdate(notes) {
    _notesCache = notes || {};
  }

  function init(el, tripData, tripId) {
    _el     = el;
    _trip   = tripData;
    _tripId = tripId || 'default';

    if (typeof RiversFirebase !== 'undefined' && _tripId && _tripId !== 'default') {
      // migrateFromLocalStorage теперь честно отклоняет промис, если запись
      // в Firestore не прошла (см. разбор в RiversFirebase — раньше молча
      // "успевала" и стирала единственную копию из localStorage). Слушать
      // realtime всё равно надо запускать в любом случае — отказ миграции
      // просто значит, что попробуем перенести снова при следующем входе
      // (localStorage не тронут), а не что экран рек должен остаться пустым.
      var startListening = function () {
        RiversFirebase.listenPoints(_tripId, _onPointsUpdate);
        RiversFirebase.listenNotes(_tripId, _onNotesUpdate);
      };
      RiversFirebase.migrateFromLocalStorage(_tripId).then(startListening, function (e) {
        console.warn('river points/notes migration:', e);
        startListening();
      });
    }

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

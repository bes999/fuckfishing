'use strict';

/* =========================================================
   RiversRender — вся разметка вкладки Реки
   ========================================================= */
var RiversRender = (function () {

  var FISH_GROUPS = [
    {
      label: 'Рыба',
      items: ['Сима','Горбуша','Кета','Кижуч','Кунджа','Голец','Хариус',
              'Таймень','Треска','Навага','Камбала','Терпуг']
    },
    {
      label: 'Моллюски и гады',
      items: ['Краб','Морской ёж','Трепанг','Гребешок','Мидия','Трубач']
    },
    {
      label: 'Другое',
      items: ['Другое']
    }
  ];

  /* ── nav button to Yandex Navigator ── */
  function _navUrl(lat, lon, name) {
    return 'https://yandex.ru/maps/?pt=' + lon + ',' + lat +
           '&z=14&l=map&text=' + encodeURIComponent(name || '');
  }

  /* ── fish select HTML ── */
  function _fishSelect(id) {
    var h = '<select class="rv-catch-sel" id="' + id + '">';
    FISH_GROUPS.forEach(function (g) {
      h += '<optgroup label="' + g.label + '">';
      g.items.forEach(function (f) { h += '<option>' + f + '</option>'; });
      h += '</optgroup>';
    });
    h += '</select>';
    return h;
  }

  /* ──────────────────────────────────────────────────────
     LIST VIEW
  ────────────────────────────────────────────────────── */
  function list(rivers) {
    if (!rivers || !rivers.length) {
      return '<div class="rv-empty">' +
        '<div class="rv-empty__icon">🌊</div>' +
        '<div class="rv-empty__title">Рек пока нет</div>' +
        '<div class="rv-empty__sub">Добавь их при создании поездки или загрузи JSON от AI в настройках</div>' +
      '</div>';
    }

    var h = '<div class="rv-hint">Нажмите на реку — откроется карточка</div>';
    rivers.forEach(function (r) {
      var dayClass = (r.day && r.day.toLowerCase().indexOf('опцион') !== -1) ? 'rv-day opt' : 'rv-day';
      var navUrl = _navUrl(r.lat, r.lon, r.name);

      h += '<div class="rv-card">';
      h += '  <div class="rv-hd" data-rv-open="' + r.id + '">';
      h += '    <div>';
      h += '      <div class="rv-name">' + r.name + '</div>';
      h += '      <div class="rv-meta">' + (r.dist || '') + (r.time ? ' · ' + r.time : '') + '</div>';
      h += '    </div>';
      h += '    <div style="display:flex;align-items:center;gap:6px">';
      h += '      <span class="' + dayClass + '">' + (r.day || '') + '</span>';
      h += '      <span class="rv-chevron">›</span>';
      h += '    </div>';
      h += '  </div>';

      if (r.lat && r.lon) {
        h += '  <div class="rv-nav-row" data-rv-nav="' + navUrl + '">';
        h += '    <div class="rv-nav-pin"></div>';
        h += '    <div class="rv-nav-txt">' + r.coords + ' → Навигатор</div>';
        h += '  </div>';
      }

      h += '</div>';
    });

    return h;
  }

  /* ──────────────────────────────────────────────────────
     DETAIL VIEW
  ────────────────────────────────────────────────────── */
  function detail(r, state) {
    var notes   = (state.notes   || {});
    var points  = (state.points  || {});
    var catches = (state.catches || []).filter(function (c) {
      return c.river === r.name;
    });

    var rNotes  = notes[r.id]  || '';
    var rPoints = points[r.id] || [];

    var h = '';

    /* back */
    h += '<div class="rv-back" id="rv-back-btn">';
    h += '  <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"><polyline points="15 18 9 12 15 6"/></svg>';
    h += '  Все реки';
    h += '</div>';

    /* scroll wrapper */
    h += '<div id="rv-det-scroll" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch">';

    /* hero */
    h += '<div class="rv-hero">';
    h += '  <h2>' + r.name + '</h2>';
    h += '  <div class="rv-hero-meta">' + (r.day || '') + ' · ' + (r.dist || '') + ' · ' + (r.time || '') + '</div>';
    h += '</div>';

    h += '<div class="rv-body">';

    /* ── stat grid: тип, размер, дно, лучшее время ── */
    h += '<div class="rv-stat-grid">';
    h += '  <div class="rv-stat"><div class="rv-stat-label">Тип</div><div class="rv-stat-val">' + (r.type || '—') + '</div></div>';
    h += '  <div class="rv-stat"><div class="rv-stat-label">Размер</div><div class="rv-stat-val">' + (r.size || '—') + '</div></div>';
    h += '  <div class="rv-stat"><div class="rv-stat-label">Дно</div><div class="rv-stat-val">' + (r.bottom || '—') + '</div></div>';
    h += '  <div class="rv-stat"><div class="rv-stat-label">Лучшее время</div><div class="rv-stat-val accent">' + (r.best || '—') + '</div></div>';
    h += '</div>';

    /* ── парковка ── */
    if (r.parkNote || r.parkLat) {
      // Кнопка-ссылка на навигатор — только если реально есть куда вести
      // (парковочные координаты либо координаты самой реки как запасной
      // вариант). Без них раньше собиралась ссылка на "undefined,undefined".
      var parkLat = r.parkLat || r.lat, parkLon = r.parkLon || r.lon;
      var hasCoords = parkLat != null && parkLon != null;
      h += '<div class="rv-sec">';
      h += '  <div class="rv-sec-title">Парковка и подъезд</div>';
      h += '  <div class="rv-sec-text">' + (r.parkNote || r.access || '') + '</div>';
      if (hasCoords) {
        var parkUrl = _navUrl(parkLat, parkLon, 'Парковка ' + r.name);
        h += '  <div class="rv-park-btn" data-rv-nav="' + parkUrl + '">';
        h += '    <div class="rv-park-pin"></div>';
        h += '    <div class="rv-park-txt">';
        h += r.parkLat ? (r.parkLat + ', ' + r.parkLon) : 'Открыть навигатор';
        h += ' → Навигатор</div>';
        h += '  </div>';
      }
      h += '</div>';
    }

    /* ── рыба ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Рыба</div>';
    // fish chips — из поля fish[] или парсим из fishing
    if (r.fish && r.fish.length) {
      h += '<div class="rv-chips">';
      r.fish.forEach(function (f) { h += '<span class="rv-chip-fish">' + f + '</span>'; });
      h += '</div>';
    }
    if (r.fishing) {
      h += '<div class="rv-sec-text">' + r.fishing + '</div>';
    }
    // factory note
    if (r.factory) {
      h += '<div style="font-size:13px;color:var(--label3);margin-top:6px;line-height:1.4">' + r.factory + '</div>';
    }
    h += '</div>';

    /* ── предупреждение ── */
    if (r.warning) {
      h += '<div class="rv-warn">';
      h += '  <div class="rv-warn-title">Внимание</div>';
      h += '  <div class="rv-warn-text">' + r.warning + '</div>';
      h += '</div>';
    }

    /* ── записать улов ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Записать улов</div>';
    h += '  <div class="rv-catch-row">';
    h += _fishSelect('rv-c-fish');
    h += '    <input class="rv-catch-num" id="rv-c-cnt" type="number" value="1" min="1">';
    h += '  </div>';
    // [PATCH] добавляем выбор участника
    h += '  ' + _memberSelect('rv-c-member');
    h += '  <div class="rv-tog-row">';
    h += '    <button class="rv-tog active" id="rv-tog-kept" data-kept="1">Взяли</button>';
    h += '    <button class="rv-tog" id="rv-tog-rel" data-kept="0">Отпустили</button>';
    h += '  </div>';
    h += '  <button class="rv-catch-save" id="rv-catch-save-btn">Сохранить улов</button>';

    /* catch log */
    if (catches.length) {
      h += _catchLog(catches);
    } else {
      h += '<div id="rv-catch-log"></div>';
    }
    h += '</div>';

    /* ── точки на реке ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Точки на реке</div>';
    h += '  <div id="rv-pts-list">';
    h += _pointsList(rPoints, r.id);
    h += '  </div>';
    h += '  <div class="rv-add-pt-btn" id="rv-add-pt-btn">+ Добавить точку</div>';
    h += '  <div class="rv-pt-form" id="rv-pt-form">';
    h += '    <div class="rv-pt-hint">Координаты: скопируйте из Яндекс.Навигатора в формате 47.123, 142.456</div>';
    h += '    <input class="rv-pt-inp" id="rv-pt-name" placeholder="Название (яма, перекат, стоянка...)">';
    h += '    <input class="rv-pt-inp" id="rv-pt-coord" placeholder="47.123, 142.456">';
    h += '    <input class="rv-pt-inp" id="rv-pt-note" placeholder="Заметка — необязательно">';
    h += '    <div class="rv-pt-form-btns">';
    h += '      <button class="rv-pt-cancel" id="rv-pt-cancel">Отмена</button>';
    h += '      <button class="rv-pt-save" id="rv-pt-save-btn">Сохранить</button>';
    h += '    </div>';
    h += '  </div>';
    h += '</div>';

    /* ── заметки ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Заметки</div>';
    if (rNotes) {
      h += '<div class="rv-notes-saved show" id="rv-notes-saved">' + _esc(rNotes) + '</div>';
      h += '<div class="rv-notes-acts show" id="rv-notes-acts">';
      h += '  <span class="rv-notes-edit" id="rv-notes-edit">Редактировать</span>';
      h += '  <span class="rv-notes-del"  id="rv-notes-del">Удалить</span>';
      h += '</div>';
      h += '<textarea class="rv-notes-ta hide" id="rv-notes-ta" placeholder="Что работало, где клевало...">' + _esc(rNotes) + '</textarea>';
      h += '<button class="rv-notes-save hide" id="rv-notes-save-btn">Сохранить</button>';
    } else {
      h += '<div class="rv-notes-saved" id="rv-notes-saved"></div>';
      h += '<div class="rv-notes-acts" id="rv-notes-acts">';
      h += '  <span class="rv-notes-edit" id="rv-notes-edit">Редактировать</span>';
      h += '  <span class="rv-notes-del"  id="rv-notes-del">Удалить</span>';
      h += '</div>';
      h += '<textarea class="rv-notes-ta" id="rv-notes-ta" placeholder="Что работало, где клевало..."></textarea>';
      h += '<button class="rv-notes-save" id="rv-notes-save-btn">Сохранить</button>';
    }
    h += '</div>';

    h += '</div>'; /* rv-body */
    h += '</div>'; /* rv-det-scroll */

    return h;
  }

  /* ── helpers ── */
  function _pointsList(pts, rid) {
    if (!pts || !pts.length) return '<div style="font-size:13px;color:var(--label3);padding:4px 0">Нет сохранённых точек</div>';
    var h = '';
    pts.forEach(function (pt) {
      var navUrl = pt.lat ? _navUrl(pt.lat, pt.lon, pt.name) : null;
      h += '<div class="rv-pt-item" data-pt-idx="' + pt._id + '">';
      h += '  <div>';
      h += '    <div class="rv-pt-name">' + _esc(pt.name) + '</div>';
      if (pt.note)  h += '<div class="rv-pt-note">' + _esc(pt.note) + '</div>';
      if (navUrl)   h += '<div class="rv-pt-coord" data-rv-nav="' + navUrl + '">' + pt.coordStr + ' → Навигатор</div>';
      h += '  </div>';
      h += '  <div class="rv-pt-acts">';
      h += '    <span class="rv-pt-edit" data-pt-edit="' + pt._id + '">Ред.</span>';
      h += '    <span class="rv-pt-del"  data-pt-del="'  + pt._id + '">×</span>';
      h += '  </div>';
      h += '</div>';
    });
    return h;
  }

  function _catchLog(catches) {
    var h = '<div id="rv-catch-log" class="rv-catch-log">';
    h += '  <div class="rv-catch-log-title">Улов на этой реке</div>';
    catches.forEach(function (c, i) {
      h += '<div class="rv-catch-entry" data-catch-idx="' + (c._idx !== undefined ? c._idx : i) + '">';
      h += '  <span class="rv-catch-entry-l">' + c.fish + ' · ' + c.count + ' шт' + (c.member ? ' <span style="color:var(--label3);font-size:12px">· ' + _esc(c.member) + '</span>' : '') + '</span>';
      h += '  <span style="display:flex;align-items:center">';
      h += '  <span class="rv-catch-entry-r">' + (c.kept ? 'взяли' : 'отпустили') + '</span>';
      h += '  <span class="rv-catch-del" data-catch-del="' + (c._idx !== undefined ? c._idx : i) + '">×</span>';
      h += '  </span>';
      h += '</div>';
    });
    h += '</div>';
    return h;
  }

  function _esc(s) {
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function _memberSelect(id) {
    // Берём участников из CatchesState если модуль загружен
    var members = [];
    var tripId  = window.APP && window.APP.currentTripId;
    if (tripId && typeof CatchesState !== 'undefined') {
      members = CatchesState.getMembers(tripId);
    }
    // Fallback: из participants поездки
    if (!members.length && window.APP && window.APP.currentTripData) {
      members = window.APP.currentTripData.participants || [];
    }
 
    var h = '<select class="rv-catch-sel rv-catch-member" id="' + id + '" style="margin-bottom:8px">';
    h += '<option value="">Участник...</option>';
    members.forEach(function(m) {
      h += '<option value="' + m + '">' + m + '</option>';
    });
    h += '</select>';
    return h;
  }

  /* public */
  return { list: list, detail: detail, catchLog: _catchLog, pointsList: _pointsList, navUrl: _navUrl, memberSelect: _memberSelect };
})();

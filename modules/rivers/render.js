'use strict';

/* =========================================================
   RiversRender — вся разметка вкладки «Места» (бывшая «Реки»;
   переименование только в UI-текстах — id/ключи данных те же).
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
     LIST VIEW — «Места поездки». Одна карточка со строками-местами
     (было: отдельная карточка на каждую реку) — по макету V2Rivers.
  ────────────────────────────────────────────────────── */
  function list(rivers) {
    if (!rivers || !rivers.length) {
      return '<div class="rv-empty">' +
        '<div class="rv-empty__icon">' + UIUtils.ico('ripple') + '</div>' +
        '<div class="rv-empty__title">Мест пока нет</div>' +
        '<div class="rv-empty__sub">Добавь реку или место — появится карточка для точек, заметок и улова</div>' +
        '<button type="button" class="rv-add-place-btn" id="rv-add-place-btn">' + UIUtils.ico('plus') + ' Добавить место</button>' +
      '</div>';
    }

    // Заголовок страницы (в Гиде скрыт — там уже шапка поездки).
    var h = '<div class="rv-page-title"><span>Места поездки</span><span class="rv-count">' + rivers.length + '</span></div>';
    h += '<div class="rv-list-wrap">';
    h += '<div class="rv-card rv-list-card">';
    rivers.forEach(function (r, i) {
      h += _placeRow(r, i === rivers.length - 1);
    });
    h += '</div>';
    h += '<button type="button" class="rv-add-place-btn" id="rv-add-place-btn">' + UIUtils.ico('plus') + ' Добавить место</button>';
    h += '<div class="rv-add-hint">Когда у места есть координаты, вместо «координат нет» будет кнопка «Навигатор» прямо в строке</div>';
    h += '</div>';

    return h;
  }

  function _placeRow(r, last) {
    var hasCoords = r.lat != null && r.lon != null;
    var navUrl = hasCoords ? _navUrl(r.lat, r.lon, r.name) : '';
    var isOpt = r.day && r.day.toLowerCase().indexOf('опцион') !== -1;
    var metaBits = [];
    if (r.day)  metaBits.push('<span class="' + (isOpt ? 'rv-row-day opt' : 'rv-row-day') + '">' + _esc(r.day) + '</span>');
    if (r.dist) metaBits.push(_esc(r.dist));
    if (r.time) metaBits.push(_esc(r.time));

    var h = '<div class="rv-row' + (last ? ' last' : '') + '" data-rv-open="' + r.id + '">';
    h += '  <span class="rv-row-ic">' + UIUtils.ico('ripple') + '</span>';
    h += '  <span class="rv-row-body">';
    h += '    <span class="rv-row-name">' + _esc(r.name) + '</span>';
    if (metaBits.length) h += '    <span class="rv-row-meta">' + metaBits.join(' <span class="rv-row-meta-sep">·</span> ') + '</span>';
    h += '  </span>';
    if (hasCoords) {
      h += '  <button type="button" class="rv-nav-btn" data-rv-nav="' + navUrl + '">' + UIUtils.ico('compass') + 'Навигатор</button>';
    } else {
      h += '  <span class="rv-nocoord">координат нет</span>';
    }
    h += '  <span class="rv-chevron">' + UIUtils.ico('chevron-right') + '</span>';
    h += '  <button type="button" class="rv-row-del" data-rv-del="' + r.id + '">Удалить</button>';
    h += '</div>';
    return h;
  }

  /* ──────────────────────────────────────────────────────
     DETAIL VIEW — карточка места
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
    h += '  Все места';
    h += '</div>';

    /* scroll wrapper */
    h += '<div id="rv-det-scroll" style="flex:1;overflow-y:auto;-webkit-overflow-scrolling:touch">';

    /* hero: название крупно */
    h += '<div class="rv-hero">';
    h += '  <h2>' + _esc(r.name) + '</h2>';
    var heroMeta = [r.day, r.dist, r.time].filter(Boolean).join(' · ');
    if (heroMeta) h += '  <div class="rv-hero-meta">' + _esc(heroMeta) + '</div>';
    h += '</div>';

    h += '<div class="rv-body">';

    /* ── координаты места: «Указать координаты» / «Навигатор» ── */
    var hasCoords = r.lat != null && r.lon != null;
    if (hasCoords) {
      var placeNavUrl = _navUrl(r.lat, r.lon, r.name);
      h += '<a href="' + placeNavUrl + '" target="_blank" rel="noopener" class="rv-coord-btn has-coords">' + UIUtils.ico('compass') + 'Навигатор</a>';
    }

    /* ── наш улов здесь ── */
    h += _catchSection(catches);

    /* ── точки ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Точки</div>';
    h += '  <div class="rv-sec-text">Ямы, перекаты, стоянки — с координатами, чтобы открыть в навигаторе.</div>';
    h += '  <div id="rv-pts-list">';
    h += _pointsList(rPoints, r.id);
    h += '  </div>';
    h += '  <button type="button" class="rv-add-pt-btn" id="rv-add-pt-btn">' + UIUtils.ico('plus') + ' Добавить точку</button>';
    h += '  <div class="rv-pt-form" id="rv-pt-form">';
    h += '    <div class="rv-pt-hint">Координаты можно скопировать из Яндекс Навигатора: «61.123, 65.456»</div>';
    h += '    <input class="rv-pt-inp" id="rv-pt-name" placeholder="Название (яма, перекат, стоянка...)">';
    h += '    <input class="rv-pt-inp" id="rv-pt-coord" placeholder="47.123, 142.456">';
    h += '    <input class="rv-pt-inp" id="rv-pt-note" placeholder="Заметка — необязательно">';
    h += '    <div class="rv-pt-form-btns">';
    h += '      <button class="rv-pt-cancel" id="rv-pt-cancel">Отмена</button>';
    h += '      <button class="rv-pt-save" id="rv-pt-save-btn">Сохранить</button>';
    h += '    </div>';
    h += '  </div>';
    h += '</div>';

    /* ── заметки о месте ── */
    h += '<div class="rv-sec">';
    h += '  <div class="rv-sec-title">Заметки о месте</div>';
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

    /* ── справка о месте: тип и размер, дно, лучшее время, рыба,
          подъезд и парковка, внимание — пустые поля прочерком ── */
    h += _referenceSection(r);

    h += '</div>'; /* rv-body */
    h += '</div>'; /* rv-det-scroll */

    /* ── FAB «+ Улов здесь» — вместо всегда открытой формы записи улова ── */
    h += '<button type="button" class="rv-fab" id="rv-fab-catch">' + UIUtils.ico('fishing') + ' Улов здесь</button>';

    return h;
  }

  /* ── «Наш улов здесь»: сумма + разбивка по видам + ссылка «Все поимки»,
        ниже — форма записи (по кнопке «+ Улов здесь») и сам лог поимок ── */
  function _catchSection(catches) {
    var h = '<div class="rv-sec" id="rv-catch-sec">';
    h += '  <div class="rv-sec-head"><div class="rv-sec-title">Наш улов здесь</div>';
    h += '  <a href="#" class="rv-catch-all-link" id="rv-catch-all-link">Все поимки</a></div>';
    h += '  <div id="rv-catch-summary">' + _catchSummary(catches) + '</div>';

    /* форма записи улова — скрыта, раскрывается кнопкой FAB «+ Улов здесь» */
    h += '  <div class="rv-catch-form" id="rv-catch-form">';
    h += '    <div class="rv-catch-row">';
    h += _fishSelect('rv-c-fish');
    h += '      <input class="rv-catch-num" id="rv-c-cnt" type="number" value="1" min="1">';
    h += '    </div>';
    h += '    ' + _memberSelect('rv-c-member');
    h += '    <div class="rv-tog-row">';
    h += '      <button class="rv-tog active" id="rv-tog-kept" data-kept="1">Взяли</button>';
    h += '      <button class="rv-tog" id="rv-tog-rel" data-kept="0">Отпустили</button>';
    h += '    </div>';
    h += '    <button class="rv-catch-save" id="rv-catch-save-btn">Сохранить улов</button>';
    h += '  </div>';

    /* лог отдельных поимок с этого места — свайп влево, чтобы удалить */
    if (catches.length) {
      h += _catchLog(catches);
    } else {
      h += '<div id="rv-catch-log"></div>';
    }
    h += '</div>';
    return h;
  }

  // Отдельно от _catchSection: index.js перерисовывает только этот кусок
  // (id="rv-catch-summary") после сохранения/удаления/realtime-обновления
  // улова — без пересборки всей секции (форма записи внутри неё не должна
  // схлопываться, пока человек вносит несколько поимок подряд).
  function _catchSummary(catches) {
    var total = 0, kept = 0, released = 0;
    var byFish = {};
    catches.forEach(function (c) {
      var n = c.count || 1;
      total += n;
      byFish[c.fish] = (byFish[c.fish] || 0) + n;
      if (c.kept) kept += n; else released += n;
    });
    if (total === 0) return '<div class="rv-sec-text">Пока нет записанных поимок на этом месте</div>';
    var fishList = Object.keys(byFish).sort(function (a, b) { return byFish[b] - byFish[a]; });
    var subtitle = released === total ? 'рыб · все отпущены' : (kept === total ? 'рыб · все взяли' : 'рыб · часть взяли, часть отпустили');
    var h = '<div class="rv-catch-total"><span class="rv-catch-total-num">' + total + '</span><span class="rv-catch-total-sub">' + subtitle + '</span></div>';
    h += '<div class="rv-catch-breakdown">';
    fishList.forEach(function (f, i) {
      h += '<div class="rv-catch-num-row' + (i === fishList.length - 1 ? ' last' : '') + '"><span>' + _esc(f) + '</span><span class="rv-catch-num-val">' + byFish[f] + '</span></div>';
    });
    h += '</div>';
    return h;
  }

  /* ── справка о месте ── */
  function _referenceSection(r) {
    var typeSize = [r.type, r.size].filter(Boolean).join(', ');
    // «Рыба»: список видов (или свободный текст fishing) + заводская
    // заметка (r.factory, была отдельным абзацем под «Рыбой» до редизайна) —
    // всё в одно значение строки, чтобы не терять поле.
    var fish = [(r.fish && r.fish.length) ? r.fish.join(', ') : (r.fishing || ''), r.factory].filter(Boolean).join(' — ');
    var access = r.parkNote || r.access || '';

    var rows = [
      ['Тип и размер', typeSize],
      ['Дно', r.bottom],
      ['Лучшее время', r.best],
      ['Рыба', fish],
      ['Подъезд и парковка', access],
      ['Внимание', r.warning]
    ];

    var h = '<div class="rv-sec">';
    h += '  <div class="rv-sec-head"><div class="rv-sec-title">Справка о месте</div>';
    var filled = rows.some(function (row) { return row[1]; });
    if (!filled) h += '<span class="rv-ref-empty-tag">не заполнено</span>';
    h += '</div>';
    rows.forEach(function (row, i) {
      var last = i === rows.length - 1;
      h += '<div class="rv-ref-row' + (last ? ' last' : '') + '">';
      h += '<span class="rv-ref-label">' + row[0] + '</span>';
      h += '<span class="rv-ref-val' + (row[1] ? '' : ' empty') + '">' + (row[1] ? _esc(row[1]) : '—') + '</span>';
      h += '</div>';
    });
    // Координаты парковки, если отличаются от координат самого места и
    // реально известны — раньше это была отдельная секция «Парковка».
    if (r.parkLat != null && r.parkLon != null) {
      var parkUrl = _navUrl(r.parkLat, r.parkLon, 'Парковка ' + r.name);
      h += '<div class="rv-park-btn" data-rv-nav="' + parkUrl + '">' + UIUtils.ico('compass') + '<span>' + r.parkLat + ', ' + r.parkLon + ' → Навигатор</span></div>';
    }
    h += '</div>';
    return h;
  }

  /* ── helpers ── */
  function _pointsList(pts, rid) {
    if (!pts || !pts.length) return '<div class="rv-pts-empty">Нет сохранённых точек</div>';
    var h = '';
    pts.forEach(function (pt) {
      var navUrl = pt.lat ? _navUrl(pt.lat, pt.lon, pt.name) : null;
      // Правка — по нажатию на строку; удаление — свайпом влево (см.
      // UIUtils.swipeToDelete), крестик и «Ред.» убраны.
      h += '<div class="rv-pt-item" data-pt-edit="' + pt._id + '">';
      h += '  <div class="rv-pt-info">';
      h += '    <div class="rv-pt-name">' + _esc(pt.name) + '</div>';
      if (pt.note)  h += '<div class="rv-pt-note">' + _esc(pt.note) + '</div>';
      if (navUrl)   h += '<div class="rv-pt-coord" data-rv-nav="' + navUrl + '">' + pt.coordStr + ' → Навигатор</div>';
      h += '  </div>';
      h += '  <button type="button" class="rv-pt-del" data-pt-del="' + pt._id + '">Удалить</button>';
      h += '</div>';
    });
    return h;
  }

  function _catchLog(catches) {
    var h = '<div id="rv-catch-log" class="rv-catch-log">';
    h += '  <div class="rv-catch-log-title">Записи поимок здесь</div>';
    catches.forEach(function (c, i) {
      var idx = (c._idx !== undefined ? c._idx : i);
      h += '<div class="rv-catch-entry" data-catch-idx="' + idx + '">';
      h += '  <span class="rv-catch-entry-l">' + _esc(c.fish) + ' · ' + c.count + ' шт' + (c.member ? ' <span style="color:var(--label3);font-size:12px">· ' + _esc(c.member) + '</span>' : '') + '</span>';
      h += '  <span class="rv-catch-entry-r">' + (c.kept ? 'взяли' : 'отпустили') + '</span>';
      h += '  <button type="button" class="rv-catch-del" data-catch-del="' + idx + '">Удалить</button>';
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
    // Fallback: участники самой поездки. Не currentTripData — у экспедиций
    // это importData (маршрут), в нём поля participants нет, и список был пуст.
    if (!members.length && tripId) {
      members = TripsData.participantNames(TripsData.getById(tripId));
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
  return { list: list, detail: detail, catchLog: _catchLog, catchSummary: _catchSummary, pointsList: _pointsList, navUrl: _navUrl, memberSelect: _memberSelect };
})();

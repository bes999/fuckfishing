'use strict';

const GearRender = (() => {

  /* ── Иконки (SVG paths) ── */
  const ICONS = [
    /* 0 рюкзак    */ '<path d="M9 4a3 3 0 006 0"/><path d="M5 8h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/>',
    /* 1 чемодан   */ '<rect x="2" y="7" width="20" height="14" rx="3"/><path d="M16 7V5a2 2 0 00-2-2h-4a2 2 0 00-2 2v2"/>',
    /* 2 коробка   */ '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18M9 21V9"/>',
    /* 3 мусор/сак */ '<path d="M4 7h16M4 7a2 2 0 01-2-2V4h20v1a2 2 0 01-2 2M4 7l1 12a2 2 0 002 2h10a2 2 0 002-2L20 7"/>',
    /* 4 пакет     */ '<path d="M21 16V8a2 2 0 00-1-1.73l-7-4a2 2 0 00-2 0l-7 4A2 2 0 003 8v8a2 2 0 001 1.73l7 4a2 2 0 002 0l7-4A2 2 0 0021 16z"/>',
    /* 5 шоппинг   */ '<path d="M22 8l-4-4H6L2 8"/><rect x="2" y="8" width="20" height="13" rx="2"/><path d="M9 8v1a3 3 0 006 0V8"/>',
    /* 6 щит       */ '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/>',
    /* 7 волны     */ '<path d="M3 7c3-2 6-2 9 0s6 2 9 0M3 12c3-2 6-2 9 0s6 2 9 0M3 17c3-2 6-2 9 0s6 2 9 0"/>',
    /* 8 рыба      */ '<path d="M2 12s2-4 7-4c3 0 5 2 7 2s4-1 6-4c0 3-1 5-2 6 1 1 2 3 2 6-2-3-4-4-6-4s-4 2-7 2c-5 0-7-4-7-4z"/><circle cx="17" cy="11" r="1" fill="currentColor" stroke="none"/>',
    /* 9 футболка  */ '<path d="M20.38 3.46L16 2a4 4 0 01-8 0L3.62 3.46a2 2 0 00-1.34 2.23l.58 3.57a1 1 0 00.99.84H6v10c0 1.1.9 2 2 2h8a2 2 0 002-2V10h2.15a1 1 0 00.99-.84l.58-3.57a2 2 0 00-1.34-2.23z"/>',
    /* 10 крест    */ '<path d="M19 8H5a2 2 0 00-2 2v8a2 2 0 002 2h14a2 2 0 002-2v-8a2 2 0 00-2-2z"/><path d="M9 8V6a1 1 0 011-1h4a1 1 0 011 1v2M12 11v6M9 14h6"/>',
    /* 11 человек  */ '<circle cx="12" cy="8" r="4"/><path d="M4 20c0-4 3.6-7 8-7s8 3 8 7"/>'
  ];

  const CAT_COLORS = ['bl','gr','te','am','pu','rd'];

  const CAT_PRESETS = [
    'Снасти','Одежда','Экипировка','Электроника',
    'Лагерь','Медицина','Документы','Инструменты','Продукты','Личное'
  ];

  const PRESET_ICONS = {
    'Снасти':8,'Одежда':9,'Экипировка':7,'Электроника':4,
    'Лагерь':6,'Медицина':10,'Документы':5,'Инструменты':3,'Продукты':2,'Личное':11
  };

  function _svg(idx, size) {
    var s = size != null ? size : 15;
    var path = ICONS[idx] != null ? ICONS[idx] : ICONS[0];
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
  }

  function _esc(s) {
    return String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function _catColor(idx) {
    return CAT_COLORS[idx % CAT_COLORS.length];
  }

  function _wStr(g) {
    var n = Number(g) || 0;
    if (!n) return '';
    return n >= 1000 ? (n/1000).toFixed(1)+' кг' : n+' г';
  }

  /* ══════════════════════════════════════════════
     ОСНОВНЫЕ ВЬЮХИ
  ══════════════════════════════════════════════ */

  function tabMain(template, tripList, isMe) {
    var isEmpty = !template.categories.length && !template.items.length;
    if (isEmpty && isMe) return _emptyState();

    return _tripSwitcher('template', tripList)
      + _statsBar(template.items, template.categories)
      + (isMe ? _locationsSection(template.locations, template.items) : '')
      + _categoriesSection(template, isMe, false, []);
  }

  function tabTrip(snap, checkedIds, tripList, activeTripId) {
    if (!snap) {
      return _tripSwitcher(activeTripId, tripList) + '<div class="gear-trip-empty">'
        + '<div class="gear-trip-empty-icon">'+ _svg(0, 26) +'</div>'
        + '<div class="gear-trip-empty-t">Снаряга не взята в поездку</div>'
        + '<div class="gear-trip-empty-s">Открой обложку поездки и нажми на иконку снаряги</div>'
        + '</div>';
    }
    return _tripSwitcher(activeTripId, tripList)
      + _tripCard(snap)
      + _progressBar(checkedIds, snap.items)
      + _categoriesSection(snap, false, true, checkedIds);
  }

  function _emptyState() {
    return '<div class="gear-empty">'
      + '<div class="gear-empty-ic">'+ _svg(0, 28) +'</div>'
      + '<div class="gear-empty-t">Снаряга не добавлена</div>'
      + '<div class="gear-empty-s">Создай места хранения и категории, добавь снаряжение. Вес поможет не перегрузиться.</div>'
      + '<button class="gear-empty-btn" data-action="gear-cat-add">Создать первую категорию</button>'
      + '</div>';
  }

  function _tripSwitcher(activeId, tripList) {
    if (!tripList.length) return '';
    var tabs = [{id:'template', name:'Шаблон'}].concat(tripList);
    return '<div class="gear-tsw">'
      + tabs.map(function(t) {
          return '<div class="gear-tsw-i'+(activeId===t.id?' on':'')+'" data-action="gear-trip-switch" data-trip="'+_esc(t.id)+'">'+_esc(t.name)+'</div>';
        }).join('')
      + '</div>';
  }

  function _statsBar(items, categories) {
    var totalG = items.reduce(function(s,i) { return s + (Number(i.weight)||0); }, 0);
    var kg = totalG >= 1000 ? (totalG/1000).toFixed(1) : (totalG != null && totalG !== 0 ? totalG : '—');
    var kgLabel = totalG >= 1000 ? 'кг итого' : (totalG ? 'г итого' : 'вес');
    return '<div class="gear-stats">'
      + '<div class="gear-stat"><div class="gear-sv">'+items.length+'</div><div class="gear-sl">предметов</div></div>'
      + '<div class="gear-stat"><div class="gear-sv">'+categories.length+'</div><div class="gear-sl">категории</div></div>'
      + '<div class="gear-stat"><div class="gear-sv">'+kg+'</div><div class="gear-sl">'+kgLabel+'</div></div>'
      + '</div>';
  }

  function _locationsSection(locations, items) {
    function _wFmt(g) {
      var n = Number(g) || 0;
      if (!n) return '';
      return n >= 1000 ? (n/1000).toFixed(1)+' кг' : n+' г';
    }

    // Только корневые места (без родителя)
    var roots = locations.filter(function(l) { return !l.parentId; });

    // Рекурсивно считает вес предметов места и всех вложенных мест
    function _subtreeWeight(locId) {
      var sum = items.filter(function(i) { return i.locationId === locId; })
        .reduce(function(s,i) { return s+(Number(i.weight)||0); }, 0);
      locations.filter(function(l) { return l.parentId === locId; }).forEach(function(child) {
        sum += _subtreeWeight(child.id);
      });
      return sum;
    }

    var cards = roots.map(function(loc) {
      var locItems  = items.filter(function(i) { return i.locationId === loc.id; });
      var contentG  = _subtreeWeight(loc.id);
      var tareG     = Number(loc.tare) || 0;
      var totalG    = contentG + tareG;
      var children  = locations.filter(function(l) { return l.parentId === loc.id; });
      var metaParts = [];
      if (loc.volume) metaParts.push(_esc(loc.volume)+' л');
      var directCount = locItems.length;
      if (directCount) metaParts.push(directCount+' пред.');
      if (children.length) metaParts.push(children.length+' внутри');
      var metaStr = metaParts.join(' · ');

      var wSumka = _wFmt(tareG)   || '—';
      var wGruz  = _wFmt(contentG)|| '—';
      var wTotal = _wFmt(totalG)  || '—';

      return '<div class="gear-loc-card" data-action="gear-loc-expand" data-locid="'+_esc(loc.id)+'">'
        + '<div class="gear-loc-pencil" data-action="gear-loc-edit" data-locid="'+_esc(loc.id)+'">'
        +   '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + '</div>'
        + '<div class="gear-loc-ic">'+_svg(loc.iconIdx != null ? loc.iconIdx : 1)+'</div>'
        + '<div class="gear-loc-name">'+_esc(loc.name)+'</div>'
        + (metaStr ? '<div class="gear-loc-meta">'+metaStr+'</div>' : '<div class="gear-loc-meta"> </div>')
        + '<div class="gear-loc-sep"></div>'
        + '<div class="gear-loc-wgrid">'
        +   '<div class="gear-loc-wlbl">сумка</div><div class="gear-loc-wval'+(tareG?'':' gear-loc-wdash')+'">'+wSumka+'</div>'
        +   '<div class="gear-loc-wlbl">груз</div><div class="gear-loc-wval'+(contentG?'':' gear-loc-wdash')+'">'+wGruz+'</div>'
        +   '<div class="gear-loc-wlbl gear-loc-wtotal-lbl">итого</div><div class="gear-loc-wval gear-loc-wtotal">'+wTotal+'</div>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="gear-sec-hd">'
      + '<div class="gear-sec-t">Места хранения</div>'
      + '<div class="gear-sec-a" data-action="gear-loc-add"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Место</div>'
      + '</div>'
      + '<div class="gear-loc-row">'
      + cards
      + '<div class="gear-loc-add" data-action="gear-loc-add">'
      + '<div class="gear-loc-add-ic"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>'
      + '<div class="gear-loc-add-lbl">Новое место</div>'
      + '</div></div>'
      + '<div id="gear-nested-panel"></div>';
  }

  function nestedPanel(parentLoc, locations, items) {
    function _wFmt(g) {
      var n = Number(g) || 0;
      if (!n) return '';
      return n >= 1000 ? (n/1000).toFixed(1)+' кг' : n+' г';
    }
    var children = locations.filter(function(l) { return l.parentId === parentLoc.id; });
    var rows = children.map(function(loc) {
      var locItems = items.filter(function(i) { return i.locationId === loc.id; });
      var contentG = locItems.reduce(function(s,i) { return s+(Number(i.weight)||0); }, 0);
      var tareG    = Number(loc.tare) || 0;
      var totalG   = contentG + tareG;
      var wTotal   = _wFmt(totalG) || '—';
      var meta     = locItems.length ? locItems.length+' пред.' : '0 пред.';
      return '<div class="gear-nested-item">'
        + '<div class="gear-nested-ic">'+_svg(loc.iconIdx != null ? loc.iconIdx : 1, 11)+'</div>'
        + '<div class="gear-nested-info">'
        +   '<div class="gear-nested-name">'+_esc(loc.name)+'</div>'
        +   '<div class="gear-nested-meta">'+meta+'</div>'
        + '</div>'
        + '<div class="gear-nested-w">'+wTotal+'</div>'
        + '<div class="gear-nested-pencil" data-action="gear-loc-edit" data-locid="'+_esc(loc.id)+'">'
        +   '<svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
        + '</div>'
        + '</div>';
    }).join('');

    return '<div class="gear-nested-list">'
      + '<div class="gear-nested-hd">'
      +   '<div class="gear-nested-title">Внутри '+_esc(parentLoc.name)+'</div>'
      +   '<div class="gear-nested-close" data-action="gear-loc-collapse">×</div>'
      + '</div>'
      + rows
      + '<div class="gear-nested-add" data-action="gear-loc-add-child" data-parentid="'+_esc(parentLoc.id)+'">'
      +   '<div class="gear-nested-add-ic"><svg viewBox="0 0 24 24" width="10" height="10" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>'
      +   '<div class="gear-nested-add-lbl">Добавить место внутри</div>'
      + '</div>'
      + '</div>';
  }

  function _categoriesSection(template, isMe, tripMode, checkedIds) {
    var header = isMe
      ? '<div class="gear-sec-hd"><div class="gear-sec-t">Категории</div><div class="gear-sec-a" data-action="gear-cat-add"><svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg> Категория</div></div>'
      : '<div class="gear-sec-hd"><div class="gear-sec-t">Категории</div></div>';

    var catsHtml = template.categories.map(function(cat, idx) {
      var catItems = template.items.filter(function(i) { return i.categoryId === cat.id; });
      var colorClass = _catColor(idx);
      if (tripMode) return _catCardTrip(cat, catItems, colorClass, checkedIds);
      return _catCardTemplate(cat, catItems, template.locations || [], colorClass, isMe);
    }).join('');

    return header + catsHtml;
  }

  function _catCardTemplate(cat, items, locations, colorClass, isMe) {
    var totalG = items.reduce(function(s,i) { return s + (Number(i.weight)||0); }, 0);
    var metaParts = [items.length + ' пред.'];
    if (totalG) metaParts.push(_wStr(totalG));
    var meta = metaParts.join(' · ');

    var itemsHtml = items.map(function(item) {
      var loc = item.locationId ? locations.find(function(l) { return l.id === item.locationId; }) : null;
      var tags = '';
      if (item.weight) tags += '<div class="gear-tag"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="7"/><path d="M12 6v6l4 2"/></svg>'+_esc(item.weight)+' г</div>';
      if (loc) tags += '<div class="gear-tag"><svg viewBox="0 0 24 24" width="8" height="8" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><path d="M9 4a3 3 0 006 0"/><path d="M5 8h14a2 2 0 012 2v9a2 2 0 01-2 2H5a2 2 0 01-2-2v-9a2 2 0 012-2z"/></svg>'+_esc(loc.name)+'</div>';
      return '<div class="gear-gi" data-action="gear-item-edit" data-itemid="'+_esc(item.id)+'">'
        + '<div class="gear-gd"></div>'
        + '<div class="gear-gi-info"><div class="gear-gname">'+_esc(item.name)+'</div>'
        + (tags ? '<div class="gear-tags">'+tags+'</div>' : '')
        + '</div>'
        + (isMe ? '<div class="gear-gdel" data-action="gear-item-del" data-itemid="'+_esc(item.id)+'">×</div>' : '')
        + '</div>';
    }).join('');

    var addItem = isMe
      ? '<div class="gear-gi-add" data-action="gear-item-add" data-catid="'+_esc(cat.id)+'">'
        + '<div class="gear-gai"><svg viewBox="0 0 24 24" width="12" height="12" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg></div>'
        + '<div class="gear-gal">Добавить предмет</div></div>'
      : '';

    var ctxBtn = isMe
      ? '<div class="gear-ctx" data-action="gear-cat-menu" data-catid="'+_esc(cat.id)+'" data-catname="'+_esc(cat.name)+'">'
        + '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="5" cy="12" r="1.2" fill="currentColor"/><circle cx="12" cy="12" r="1.2" fill="currentColor"/><circle cx="19" cy="12" r="1.2" fill="currentColor"/></svg>'
        + '</div>'
      : '';

    var hiddenBadge = cat.hidden ? '<div class="gear-badge-hid">скрыта</div>' : '';

    return '<div class="gear-cat'+(cat.hidden?' gear-cat-hidden':'')+'" data-catid="'+_esc(cat.id)+'">'
      + '<div class="gear-ch" data-action="gear-cat-toggle" data-catid="'+_esc(cat.id)+'">'
      + '<div class="gear-ci '+colorClass+'">'+_svg(cat.iconIdx != null ? cat.iconIdx : 0)+'</div>'
      + '<div class="gear-cn2"><div class="gear-cn">'+_esc(cat.name)+'</div><div class="gear-cm">'+meta+'</div></div>'
      + ctxBtn + hiddenBadge
      + '<div class="gear-chev">›</div>'
      + '</div>'
      + '<div class="gear-cat-body" id="gear-cat-body-'+_esc(cat.id)+'" style="display:none">'
      + itemsHtml + addItem
      + '</div></div>';
  }

  function _catCardTrip(cat, items, colorClass, checkedIds) {
    var done  = items.filter(function(i) { return checkedIds.indexOf(i.id) >= 0; }).length;
    var total = items.length;
    var badgeClass = done === total ? 'gear-badge-ok' : 'gear-badge-part';

    var itemsHtml = items.map(function(item) {
      var isChecked = checkedIds.indexOf(item.id) >= 0;
      return '<div class="gear-check-item" data-action="gear-item-check" data-itemid="'+_esc(item.id)+'">'
        + '<div class="gear-cb'+(isChecked?' on':'')+'"></div>'
        + '<div class="gear-ci-info">'
        + '<div class="gear-cname'+(isChecked?' done':'')+'">'+_esc(item.name)+'</div>'
        + (item.weight ? '<div class="gear-csub">'+_esc(item.weight)+' г</div>' : '')
        + '</div></div>';
    }).join('');

    return '<div class="gear-cat" data-catid="'+_esc(cat.id)+'">'
      + '<div class="gear-ch" data-action="gear-cat-toggle" data-catid="'+_esc(cat.id)+'">'
      + '<div class="gear-ci '+colorClass+'">'+_svg(cat.iconIdx != null ? cat.iconIdx : 0)+'</div>'
      + '<div class="gear-cn2"><div class="gear-cn">'+_esc(cat.name)+'</div></div>'
      + '<div class="'+badgeClass+'" data-cat-badge="'+_esc(cat.id)+'">'+done+'/'+total+'</div>'
      + '<div class="gear-chev">›</div>'
      + '</div>'
      + '<div class="gear-cat-body" id="gear-cat-body-'+_esc(cat.id)+'" style="display:none">'
      + itemsHtml + '</div></div>';
  }

  function _tripCard(snap) {
    var date = (snap.updatedAt && typeof snap.updatedAt.toDate === 'function')
      ? snap.updatedAt.toDate().toLocaleDateString('ru') : '';
    return '<div class="gear-trip-card">'
      + '<div class="gear-trip-name">'+_esc(snap.tripName != null ? snap.tripName : 'Поездка')+'</div>'
      + (date ? '<div class="gear-trip-sub">Снимок от '+date+'</div>' : '')
      + '<div class="gear-trip-meta">'+snap.items.length+' предметов в шаблоне</div>'
      + '</div>';
  }

  function _progressBar(checkedIds, items) {
    var done  = checkedIds.length;
    var total = items.length;
    var pct   = total ? Math.round(done/total*100) : 0;
    var weightDone = items
      .filter(function(i) { return checkedIds.indexOf(i.id) >= 0; })
      .reduce(function(s,i) { return s + (Number(i.weight)||0); }, 0);
    var wLabel = _wStr(weightDone);
    return '<div class="gear-prog-wrap">'
      + '<div class="gear-prog-bar"><div class="gear-prog-fill" style="width:'+pct+'%"></div></div>'
      + '<div class="gear-prog-lbl">'+done+' / '+total+(wLabel ? ' · '+wLabel : '')+'</div>'
      + '</div>';
  }

  /* ══════════════════════════════════════════════
     ШИТЫ
  ══════════════════════════════════════════════ */

  function sheetAddLocation(template, editId) {
    var loc    = editId ? template.locations.find(function(l) { return l.id === editId; }) : null;
    var isEdit = !!loc;
    var title  = isEdit ? 'Редактировать место' : 'Новое место хранения';

    var parentDisplay = '';
    var parentId      = '';
    if (loc && loc.parentId) {
      var p = template.locations.find(function(l) { return l.id === loc.parentId; });
      parentDisplay = p ? _esc(p.name) : '';
      parentId = loc.parentId;
    }

    var iconsHtml = _iconPicker(loc ? (loc.iconIdx != null ? loc.iconIdx : 1) : 1, 'gear-loc-sheet');

    return '<div class="gear-sheet-overlay" id="gear-loc-sheet">'
      + '<div class="gear-sheet">'
      + '<div class="gear-sheet-grab"></div>'
      + '<div class="gear-sheet-header">'
      + '<div class="gear-sheet-cancel" data-action="gear-sheet-close">Отмена</div>'
      + '<div class="gear-sheet-title">'+title+'</div>'
      + '<div class="gear-sheet-done" data-action="gear-loc-save" data-editid="'+_esc(editId != null ? editId : '')+'">Готово</div>'
      + '</div>'
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group">'
      + '<div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row" style="border-top:none">'
      + '<input class="gear-fi gear-fi full" id="gear-loc-name" type="text" placeholder="Рюкзак, баул, несессер..." value="'+_esc(loc ? loc.name : '')+'">'
      + '</div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Иконка</div>'+iconsHtml+'</div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Параметры</div>'
      + '<div class="gear-field-row" style="border-top:none"><div class="gear-field-label">Объём</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-loc-volume" type="number" inputmode="numeric" placeholder="—" value="'+_esc(loc && loc.volume ? loc.volume : '')+'">'
      + '<div class="gear-field-unit">л</div></div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Вес</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-loc-tare" type="number" inputmode="numeric" placeholder="—" value="'+_esc(loc && loc.tare ? loc.tare : '')+'">'
      + '<div class="gear-field-unit">г</div></div>'
      + '<div class="gear-field-row gear-pick-trigger" data-action="gear-loc-parent-pick">'
      + '<div class="gear-field-label">Где лежит</div>'
      + '<div class="gear-field-val" id="gear-loc-parent-display">'
      + (parentDisplay ? parentDisplay : '<span class="gear-field-ph">Не указано</span>')
      + '</div>'
      + '<input type="hidden" id="gear-loc-parent-id" value="'+_esc(parentId)+'">'
      + '<div class="gear-field-chev">›</div>'
      + '</div></div>'
      + '<div style="padding:6px 16px 8px;font-size:11px;color:var(--label4);line-height:1.4;">Укажи, в каком контейнере лежит это место хранения, если нужна вложенность.</div>'
      + (isEdit ? '<button class="gear-btn-danger" data-action="gear-loc-del" data-locid="'+_esc(editId)+'">Удалить место хранения</button>' : '')
      + '<button class="gear-btn-primary" data-action="gear-loc-save" data-editid="'+_esc(editId != null ? editId : '')+'">'
      + (isEdit ? 'Сохранить' : 'Создать место хранения')+'</button>'
      + '</div></div></div>';
  }

  function sheetAddCategory(template, editId) {
    var cat    = editId ? template.categories.find(function(c) { return c.id === editId; }) : null;
    var isEdit = !!cat;
    var title  = isEdit ? 'Редактировать категорию' : 'Новая категория';

    var presetsHtml = CAT_PRESETS.map(function(p) {
      return '<div class="gear-chip'+(cat && cat.name === p ? ' on':'')+'" data-action="gear-preset-pick" data-preset="'+_esc(p)+'">'+_esc(p)+'</div>';
    }).join('');

    var iconsHtml = _iconPicker(cat ? (cat.iconIdx != null ? cat.iconIdx : 0) : 0, 'gear-cat-sheet');

    return '<div class="gear-sheet-overlay" id="gear-cat-sheet">'
      + '<div class="gear-sheet">'
      + '<div class="gear-sheet-grab"></div>'
      + '<div class="gear-sheet-header">'
      + '<div class="gear-sheet-cancel" data-action="gear-sheet-close">Отмена</div>'
      + '<div class="gear-sheet-title">'+title+'</div>'
      + '<div class="gear-sheet-done" data-action="gear-cat-save" data-editid="'+_esc(editId != null ? editId : '')+'">Готово</div>'
      + '</div>'
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row" style="border-top:none">'
      + '<input class="gear-fi" id="gear-cat-name" type="text" placeholder="Название категории" value="'+_esc(cat ? cat.name : '')+'">'
      + '</div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Быстрый выбор</div>'
      + '<div class="gear-chips">'+presetsHtml+'</div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Иконка</div>'+iconsHtml+'</div>'
      + (isEdit ? '<button class="gear-btn-danger" data-action="gear-cat-menu" data-catid="'+_esc(editId)+'" data-catname="'+_esc(cat ? cat.name : '')+'">Удалить / скрыть категорию</button>' : '')
      + '<button class="gear-btn-primary" data-action="gear-cat-save" data-editid="'+_esc(editId != null ? editId : '')+'">'
      + (isEdit ? 'Сохранить' : 'Создать категорию')+'</button>'
      + '</div></div></div>';
  }

  function sheetAddItem(template, editId, defaultCatId) {
    var item   = editId ? template.items.find(function(i) { return i.id === editId; }) : null;
    var isEdit = !!item;
    var catId  = item ? item.categoryId : (defaultCatId != null ? defaultCatId : '');
    var title  = isEdit ? 'Редактировать предмет' : 'Новый предмет';

    var catChips = template.categories.map(function(c) {
      return '<div class="gear-chip'+(c.id === catId ? ' on':'')+'" data-action="gear-chip-cat" data-catid="'+_esc(c.id)+'">'+_esc(c.name)+'</div>';
    }).join('');

    var locDisplay = '';
    var locId      = '';
    if (item && item.locationId) {
      var loc = template.locations.find(function(l) { return l.id === item.locationId; });
      locDisplay = loc ? _esc(loc.name) : '';
      locId = item.locationId;
    }

    var catName = (template.categories.find(function(c) { return c.id === catId; }) || {}).name || 'категорию';

    return '<div class="gear-sheet-overlay" id="gear-item-sheet">'
      + '<div class="gear-sheet">'
      + '<div class="gear-sheet-grab"></div>'
      + '<div class="gear-sheet-header">'
      + '<div class="gear-sheet-cancel" data-action="gear-sheet-close">Отмена</div>'
      + '<div class="gear-sheet-title">'+title+'</div>'
      + '<div class="gear-sheet-done" data-action="gear-item-save" data-editid="'+_esc(editId != null ? editId : '')+'">Готово</div>'
      + '</div>'
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row" style="border-top:none">'
      + '<input class="gear-fi" id="gear-item-name" type="text" placeholder="Что берёшь с собой?" value="'+_esc(item ? item.name : '')+'">'
      + '</div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Категория</div>'
      + '<div class="gear-chips" id="gear-item-cat-chips">'+catChips+'</div>'
      + '<input type="hidden" id="gear-item-catid" value="'+_esc(catId)+'">'
      + '</div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Детали</div>'
      + '<div class="gear-field-row" style="border-top:none"><div class="gear-field-label">Вес</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-item-weight" type="number" inputmode="numeric" placeholder="—" value="'+_esc(item && item.weight ? item.weight : '')+'">'
      + '<div class="gear-field-unit">г</div></div>'
      + '<div class="gear-field-row gear-pick-trigger" data-action="gear-item-loc-pick">'
      + '<div class="gear-field-label">Хранение</div>'
      + '<div class="gear-field-val" id="gear-item-loc-display">'
      + (locDisplay ? locDisplay : '<span class="gear-field-ph">Не указано</span>')
      + '</div>'
      + '<input type="hidden" id="gear-item-locid" value="'+_esc(locId)+'">'
      + '<div class="gear-field-chev">›</div>'
      + '</div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Заметка</div>'
      + '<input class="gear-fi" id="gear-item-note" type="text" placeholder="необязательно" value="'+_esc(item && item.note ? item.note : '')+'">'
      + '</div></div>'
      + (isEdit ? '<button class="gear-btn-danger" data-action="gear-item-del" data-itemid="'+_esc(editId)+'">Удалить предмет</button>' : '')
      + '<button class="gear-btn-primary" id="gear-item-save-btn" data-action="gear-item-save" data-editid="'+_esc(editId != null ? editId : '')+'">'
      + (isEdit ? 'Сохранить' : 'Добавить в '+_esc(catName))+'</button>'
      + '</div></div></div>';
  }

  function sheetPickLocation(locations, selectedId, trigger) {
    var items = locations.map(function(loc) {
      var isOn = loc.id === selectedId;
      return '<div class="gear-pick-item'+(isOn?' on':'')+'" data-action="gear-loc-picked" data-locid="'+_esc(loc.id)+'" data-trigger="'+_esc(trigger)+'">'
        + '<div class="gear-pick-ic">'+_svg(loc.iconIdx != null ? loc.iconIdx : 1)+'</div>'
        + '<div class="gear-pick-info"><div class="gear-pick-name">'+_esc(loc.name)+'</div>'
        + (loc.volume ? '<div class="gear-pick-meta">'+_esc(loc.volume)+' л</div>' : '')
        + '</div>'
        + (isOn ? '<div class="gear-pick-check">✓</div>' : '')
        + '</div>';
    }).join('');

    return '<div class="gear-sheet-overlay" id="gear-pick-sheet">'
      + '<div class="gear-sheet gear-sheet-sm">'
      + '<div class="gear-sheet-grab"></div>'
      + '<div class="gear-sheet-header">'
      + '<div class="gear-sheet-cancel" data-action="gear-sheet-close">Отмена</div>'
      + '<div class="gear-sheet-title">Где лежит?</div>'
      + '<div style="width:52px"></div>'
      + '</div>'
      + '<div class="gear-pick-section">Без вложенности</div>'
      + '<div class="gear-pick-item'+(selectedId===''?' on':'')+'" data-action="gear-loc-picked" data-locid="" data-trigger="'+_esc(trigger)+'">'
      + '<div class="gear-pick-ic"><svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="9" y1="9" x2="15" y2="15"/><line x1="15" y1="9" x2="9" y2="15"/></svg></div>'
      + '<div class="gear-pick-info"><div class="gear-pick-name gear-pick-muted">Не указывать</div><div class="gear-pick-meta">Самостоятельное место</div></div>'
      + '</div>'
      + '<div class="gear-pick-section">Мои места хранения</div>'
      + items
      + '<div class="gear-pick-hint">Нет нужного места — закрой, создай его, вернись.</div>'
      + '</div></div>';
  }

  function sheetCategoryMenu(cat) {
    return '<div class="gear-sheet-overlay" id="gear-ctx-sheet">'
      + '<div class="gear-sheet gear-sheet-sm">'
      + '<div class="gear-sheet-grab"></div>'
      + '<div class="gear-ctx-title">'+_esc(cat.name)+'</div>'
      + '<div class="gear-ctx-item" data-action="gear-cat-edit" data-catid="'+_esc(cat.id)+'">'
      + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>'
      + '<span>Переименовать</span></div>'
      + '<div class="gear-ctx-item" data-action="gear-cat-toggle-hidden" data-catid="'+_esc(cat.id)+'">'
      + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19M1 1l22 22"/></svg>'
      + '<span>'+(cat.hidden ? 'Показать' : 'Скрыть')+' категорию</span></div>'
      + '<div class="gear-ctx-item" data-action="gear-cat-del-items" data-catid="'+_esc(cat.id)+'">'
      + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M8 7V5a1 1 0 011-1h6a1 1 0 011 1v2M19 7l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7"/></svg>'
      + '<span>Удалить, предметы сохранить</span></div>'
      + '<div class="gear-ctx-item gear-ctx-danger" data-action="gear-cat-del-all" data-catid="'+_esc(cat.id)+'">'
      + '<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7h18M8 7V5a1 1 0 011-1h6a1 1 0 011 1v2M19 7l-1 12a2 2 0 01-2 2H8a2 2 0 01-2-2L5 7"/></svg>'
      + '<span>Удалить вместе с предметами</span></div>'
      + '</div></div>';
  }

  /* ── Пикер иконок ── */
  function _iconPicker(selectedIdx, sheetId) {
    var html = '<div class="gear-icon-grid">';
    for (var i = 0; i < ICONS.length; i++) {
      var path = ICONS[i];
      html += '<div class="gear-ipic'+(i===selectedIdx?' on':'')+'" data-action="gear-icon-pick" data-idx="'+i+'" data-sheet="'+_esc(sheetId)+'">'
        + '<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>'
        + '</div>';
    }
    return html + '</div>';
  }

  return {
    tabMain, tabTrip,
    sheetAddLocation, sheetAddCategory, sheetAddItem,
    sheetPickLocation, sheetCategoryMenu,
    nestedPanel,
    PRESET_ICONS,
    _esc
  };
})();

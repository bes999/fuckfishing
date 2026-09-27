'use strict';
/* globals UIUtils */

const GearRender = (() => {

  /* ── Иконки сумок (SVG paths) — выбираются в листе сумки ── */
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

  const CAT_PRESETS = [
    'Снасти','Одежда','Экипировка','Электроника',
    'Лагерь','Медицина','Документы','Инструменты','Продукты','Личное'
  ];

  const PRESET_ICONS = {
    'Снасти':8,'Одежда':9,'Экипировка':7,'Электроника':4,
    'Лагерь':6,'Медицина':10,'Документы':5,'Инструменты':3,'Продукты':2,'Личное':11
  };

  // Псевдо-категория для вещей без категории (после «Удалить, предметы
  // сохранить» они раньше просто пропадали из виду).
  const NO_CAT = '__none';

  function _svg(idx, size) {
    var s = size != null ? size : 15;
    var path = ICONS[idx] != null ? ICONS[idx] : ICONS[0];
    return '<svg viewBox="0 0 24 24" width="'+s+'" height="'+s+'" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">'+path+'</svg>';
  }

  function _esc(s) {
    return String(s != null ? s : '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  function _ico(n) { return UIUtils.ico(n); }

  function _plural(n, one, few, many) {
    var m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  function _wStr(g) {
    var n = Number(g) || 0;
    if (!n) return '';
    return n >= 1000 ? (n/1000).toFixed(1).replace(/\.0$/, '').replace('.', ',')+' кг' : n+' г';
  }

  function _sumW(items) {
    return items.reduce(function(s,i) { return s + (Number(i.weight)||0); }, 0);
  }

  function _isOn(ids, id) { return ids.indexOf(id) >= 0; }

  // Неотмеченные сверху, отмеченные — вниз. Только для отображения.
  function _sortByChecked(items, checkedIds) {
    return items.slice().sort(function(a, b) {
      return (_isOn(checkedIds, a.id) ? 1 : 0) - (_isOn(checkedIds, b.id) ? 1 : 0);
    });
  }

  // Группы «категория → вещи» + «Без категории» для вещей-сирот.
  function groups(cats, items) {
    var known = {};
    cats.forEach(function(c) { known[c.id] = true; });
    var out = cats.map(function(c) {
      return { cat: c, items: items.filter(function(i) { return i.categoryId === c.id; }) };
    });
    var orphans = items.filter(function(i) { return !i.categoryId || !known[i.categoryId]; });
    if (orphans.length) out.push({ cat: { id: NO_CAT, name: 'Без категории', orphan: true }, items: orphans });
    return out;
  }

  // Дерево сумок в порядке обхода: [{loc, depth, parent}] — корни, потом
  // вложенные. Защита от циклов: всё, что не попало в обход, — корнем.
  function _bagOrder(locs) {
    var byId = {}, seen = {}, out = [];
    locs.forEach(function(l) { byId[l.id] = l; });
    function walk(l, depth, parent) {
      if (seen[l.id]) return;
      seen[l.id] = true;
      out.push({ loc: l, depth: depth, parent: parent });
      locs.filter(function(c) { return c.parentId === l.id; }).forEach(function(c) { walk(c, depth + 1, l); });
    }
    locs.filter(function(l) { return !l.parentId || !byId[l.parentId]; }).forEach(function(l) { walk(l, 0, null); });
    locs.forEach(function(l) { walk(l, 0, null); });
    return out;
  }

  /* ══════════════ Общие куски ══════════════ */

  function _head(o) {
    var back = o.backAction
      ? '<button type="button" class="gear-head-btn" data-action="'+o.backAction+'"'+(o.backTrip ? ' data-trip="'+_esc(o.backTrip)+'"' : '')+' aria-label="'+_esc(o.backLabel || 'Назад')+'">'+_ico(o.backIcon || 'chevron-left')+'</button>'
      : '';
    return '<header class="gear-head'+(back ? '' : ' gear-head-nob')+'">' + back
      + '<div class="gear-head-txt"><div class="gear-head-title">'+_esc(o.title)+'</div>'
      + (o.sub ? '<div class="gear-head-sub">'+_esc(o.sub)+'</div>' : '') + '</div>'
      + (o.right || '') + '</header>';
  }

  function _headBtn(action, icon, label) {
    return '<button type="button" class="gear-head-btn" data-action="'+action+'" aria-label="'+_esc(label)+'">'+_ico(icon)+'</button>';
  }

  function _seg(items) {
    return '<div class="gear-seg" role="tablist">' + items.map(function(it) {
      return '<button type="button" role="tab" aria-selected="'+(it.on?'true':'false')+'" class="gear-seg-i'+(it.on?' on':'')+'" data-action="'+it.action+'" '+it.attr+'>'+_esc(it.label)+'</button>';
    }).join('') + '</div>';
  }

  function _bar(pct, sm) {
    return '<div class="gear-bar'+(sm?' sm':'')+'"><div class="gear-bar-fill" style="width:'+Math.max(0, Math.min(100, pct))+'%"></div></div>';
  }

  function _check(on) {
    return '<span class="gear-check'+(on?' on':'')+'">'+(on ? _ico('check') : '')+'</span>';
  }

  // Трёхпозиционный чекбокс категории в мастере (все / часть / ничего)
  function _check3(n, tot) {
    if (tot && n === tot) return _check(true);
    if (n) return '<span class="gear-check on mixed"><span class="gear-check-dash"></span></span>';
    return _check(false);
  }

  function _secLabel(t) { return '<h2 class="gear-sec">'+_esc(t)+'</h2>'; }

  function _hint(t, cls) { return '<div class="gear-hint'+(cls?' '+cls:'')+'">'+t+'</div>'; }

  function _chev(open) { return '<span class="gear-chev">'+_ico(open ? 'chevron-up' : 'chevron-down')+'</span>'; }

  function _toggleAttrs(key, open) {
    return 'data-action="gear-toggle" data-key="'+_esc(key)+'" data-open="'+(open?'1':'0')+'" aria-expanded="'+(open?'true':'false')+'"';
  }

  function _catHead(key, open, name, right, rightCls, extra) {
    return '<button type="button" class="gear-cat-head'+(open?' open':'')+'" '+_toggleAttrs(key, open)+'>'
      + '<span class="gear-cat-name">'+_esc(name)+'</span>' + (extra || '')
      + '<span class="gear-cat-cnt'+(rightCls?' '+rightCls:'')+'">'+right+'</span>' + _chev(open) + '</button>';
  }

  function _sticky(inner, cls) {
    return '<div class="gear-sticky'+(cls?' '+cls:'')+'">'+inner+'</div>';
  }

  /* ══════════════ Корень: Вещи / Сумки ══════════════ */

  // tripRows: [{id, name, done, total}]
  function rootView(tpl, tripRows, isMe, view, open, ownerName) {
    var locs = tpl.locations || [];
    var right = isMe
      ? _headBtn('gear-head-add', 'plus', view === 'catalog' ? 'Новая сумка' : 'Добавить вещь')
        + _headBtn('gear-head-more', 'dots', 'Ещё: новая категория, импорт текстом')
      : '';
    var html = _head({
      title: isMe ? 'Снаряга' : 'Снаряга' + (ownerName ? ' ' + ownerName : ''),
      sub: isMe ? 'всё, что у меня есть' : 'только просмотр', right: right
    });
    if (!isMe) html += '<div class="gear-ro-note">'+_ico('users')+'<span>Смотришь чужую снарягу — менять её может только владелец</span></div>';
    html += _seg([
      { label: 'Вещи · '+tpl.items.length, on: view !== 'catalog', action: 'gear-trip-switch', attr: 'data-trip="template"' },
      { label: 'Сумки · '+locs.length,     on: view === 'catalog', action: 'gear-trip-switch', attr: 'data-trip="catalog"' }
    ]);
    html += view === 'catalog' ? _bagsBody(locs, isMe) : _itemsBody(tpl, tripRows, isMe, open);
    return '<div class="gear-page">'+html+'</div>';
  }

  function _tripRow(r) {
    var pct = r.total ? Math.round(r.done / r.total * 100) : 0;
    return '<button type="button" class="gear-trip-row" data-action="gear-trip-switch" data-trip="'+_esc(r.id)+'">'
      + '<span class="gear-trip-row-main"><span class="gear-trip-row-top">'
      + '<span class="gear-trip-row-name">'+_esc(r.name)+'</span>'
      + '<span class="gear-trip-row-cnt">'+r.done+' из '+r.total+'</span></span>'
      + _bar(pct, true) + '</span>' + _ico('chevron-right') + '</button>';
  }

  function _itemsBody(tpl, tripRows, isMe, open) {
    var out = '';
    if (tripRows.length) {
      out += _secLabel('Списки на поездки') + '<section class="gear-card">' + tripRows.map(_tripRow).join('') + '</section>';
    }
    if (!tpl.categories.length && !tpl.items.length) {
      return out + (isMe ? _emptyState() : _hint('Здесь пока пусто', 'gear-hint-c'));
    }
    var totalW = _sumW(tpl.items);
    var withW  = tpl.items.filter(function(i) { return Number(i.weight); }).length;
    var n = tpl.categories.length;
    var meta = n + ' ' + _plural(n, 'категория', 'категории', 'категорий');
    if (totalW) meta += withW < tpl.items.length ? ' · вес указан у части вещей: ' + _wStr(totalW) : ' · общий вес ' + _wStr(totalW);
    out += _secLabel('Вещи') + _hint(meta, 'gear-sec-meta');
    out += groups(tpl.categories, tpl.items).map(function(g) { return _invCat(g, isMe, open); }).join('');
    if (isMe && tpl.items.length) {
      out += _sticky('<button type="button" class="gear-btn-main" data-action="gear-pick-mode-enter">Собрать список на поездку</button>');
    }
    return out;
  }

  function _invCat(g, isMe, open) {
    var cat = g.cat, key = 'c:' + cat.id, isOpen = !!open[key];
    var hid = cat.hidden ? '<span class="gear-badge-hid">скрыта</span>' : '';
    var body = '';
    if (isOpen) {
      body = g.items.map(function(item) {
        var w = _wStr(item.weight);
        var inner = '<span class="gear-row-txt"><span class="gear-row-name">'+_esc(item.name)+'</span>'
          + (item.note ? '<span class="gear-row-sub">'+_esc(item.note)+'</span>' : '') + '</span>'
          + (w ? '<span class="gear-row-w">'+w+'</span>' : '');
        return isMe
          ? '<div class="gear-row gear-swipe"><button type="button" class="gear-row-main" data-action="gear-item-edit" data-itemid="'+_esc(item.id)+'">'+inner+'</button>'
            + '<button type="button" class="gear-swipe-del" data-action="gear-item-del" data-itemid="'+_esc(item.id)+'">Удалить</button></div>'
          : '<div class="gear-row"><div class="gear-row-main">'+inner+'</div></div>';
      }).join('');
      if (!g.items.length) body += _hint('В категории пока нет вещей', 'gear-hint-in');
      if (isMe && !cat.orphan) {
        body += '<div class="gear-cat-foot">'
          + '<button type="button" class="gear-foot-add" data-action="gear-item-add" data-catid="'+_esc(cat.id)+'">'+_ico('plus')+' Добавить вещь</button>'
          + '<button type="button" class="gear-foot-more" data-action="gear-cat-menu" data-catid="'+_esc(cat.id)+'" aria-label="Категория: переименовать, скрыть, удалить">'+_ico('dots')+'</button>'
          + '</div>';
      }
    }
    return '<section class="gear-card'+(cat.hidden?' gear-cat-hidden':'')+'">'
      + _catHead(key, isOpen, cat.name, g.items.length, '', hid) + body + '</section>';
  }

  function _bagsBody(locs, isMe) {
    var out = _hint('Сумки, баулы и несессеры. Для каждой поездки выбираешь, какие берёшь, и раскладываешь по ним вещи.', 'gear-lead');
    if (!locs.length && !isMe) return out + _hint('Сумок пока нет', 'gear-hint-c');
    var order = _bagOrder(locs), cards = [], cur = null;
    order.forEach(function(o) {
      if (o.depth === 0) { cur = []; cards.push(cur); }
      cur.push(o);
    });
    out += cards.map(function(list) {
      return '<section class="gear-card">' + list.map(function(o) { return _bagRow(o, isMe); }).join('') + '</section>';
    }).join('');
    if (isMe) out += '<button type="button" class="gear-dashed" data-action="gear-loc-add">'+_ico('plus')+' Новая сумка</button>';
    return out;
  }

  function _bagMeta(loc, parent) {
    var parts = [];
    if (loc.volume) parts.push(_esc(loc.volume)+' л');
    var t = _wStr(loc.tare);
    if (t) parts.push(parent ? t : 'сама весит ' + t);
    if (parent) parts.push('внутри: ' + _esc(parent.name));
    return parts.join(' · ');
  }

  function _bagRow(o, isMe) {
    var loc = o.loc, meta = _bagMeta(loc, o.parent);
    var inner = '<span class="gear-bag-ic'+(o.depth?' sub':'')+'">'+_svg(loc.iconIdx != null ? loc.iconIdx : 1, o.depth ? 18 : 20)+'</span>'
      + '<span class="gear-bag-txt"><span class="gear-bag-name">'+_esc(loc.name)+'</span>'
      + (meta ? '<span class="gear-bag-meta">'+meta+'</span>' : '') + '</span>'
      + (isMe ? '<span class="gear-bag-edit">'+_ico('pencil')+'</span>' : '');
    var pad = ' style="padding-left:'+(16 + o.depth * 28)+'px"';
    return isMe
      ? '<button type="button" class="gear-bag-row'+(o.depth?' sub':'')+'"'+pad+' data-action="gear-loc-edit" data-locid="'+_esc(loc.id)+'">'+inner+'</button>'
      : '<div class="gear-bag-row'+(o.depth?' sub':'')+'"'+pad+'>'+inner+'</div>';
  }

  function _emptyState() {
    return '<div class="gear-empty">'
      + '<div class="gear-empty-ic">'+ _ico('backpack') +'</div>'
      + '<div class="gear-empty-t">Снаряга не добавлена</div>'
      + '<div class="gear-empty-s">Заведи категории и вещи — потом из них собираются списки на поездки. Вес поможет не перегрузиться.</div>'
      + '<button type="button" class="gear-btn-main" data-action="gear-cat-add">Создать первую категорию</button>'
      + '<button type="button" class="gear-link" data-action="gear-import-open">Или импортировать список текстом</button>'
      + '</div>';
  }

  /* ══════════════ Список на поездку ══════════════ */

  // o: {snap, checked, tripName, scope, shared, sharedChecked, mode, isMe, open}
  function tripView(o) {
    var isShared = o.scope === 'shared';
    var html = _head({
      backAction: 'gear-trip-switch', backTrip: 'template',
      title: 'Снаряга',
      sub: o.tripName + ' · ' + (isShared ? 'общее' : (o.isMe ? 'мой список' : 'список')),
      right: o.isMe ? _headBtn('gear-trip-more', 'dots', isShared ? 'Ещё: новая категория, снять отметки' : 'Ещё: обновить из шаблона, снять отметки') : ''
    });
    if (o.isMe) {
      html += _seg([
        { label: 'Моё',    on: !isShared, action: 'gear-scope-switch', attr: 'data-scope="personal"' },
        { label: 'Общее',  on: isShared,  action: 'gear-scope-switch', attr: 'data-scope="shared"' }
      ]);
    } else {
      html += '<div class="gear-ro-note">'+_ico('users')+'<span>Смотришь чужую снарягу — менять её может только владелец</span></div>';
    }
    html += isShared ? _sharedView(o.shared, o.sharedChecked || [], o.open) : _personalView(o);
    return '<div class="gear-page">'+html+'</div>';
  }

  function _personalView(o) {
    var snap = o.snap;
    if (!snap) {
      return '<div class="gear-empty"><div class="gear-empty-ic">'+_ico('backpack')+'</div>'
        + '<div class="gear-empty-t">Снаряга не взята в поездку</div>'
        + '<div class="gear-empty-s">Открой обложку поездки и нажми на иконку снаряги</div></div>';
    }
    var items = snap.items || [], locs = snap.locations || [];
    var ids = {};
    items.forEach(function(i) { ids[i.id] = true; });
    var checked = (o.checked || []).filter(function(id) { return ids[id]; });
    var done = checked.length, total = items.length;
    var wDone = _sumW(items.filter(function(i) { return _isOn(checked, i.id); }));
    var pct = total ? Math.round(done / total * 100) : 0;

    var html = '<div class="gear-prog"><div class="gear-prog-top">'
      + '<span class="gear-prog-lbl">Собрано <b>'+done+'</b> из '+total+(wDone ? ' · '+_wStr(wDone) : '')+'</span>'
      + (locs.length ? '<span class="gear-prog-side">'+locs.length+' '+_plural(locs.length, 'сумка', 'сумки', 'сумок')+' в поездке</span>' : '')
      + '</div>' + _bar(pct) + '</div>';

    var byBags = o.mode === 'bags';
    html += '<div class="gear-pills">'
      + '<button type="button" class="gear-pill'+(byBags?'':' on')+'" aria-pressed="'+(byBags?'false':'true')+'" data-action="gear-trip-mode" data-mode="cats">По категориям</button>'
      + '<button type="button" class="gear-pill'+(byBags?' on':'')+'" aria-pressed="'+(byBags?'true':'false')+'" data-action="gear-trip-mode" data-mode="bags">По сумкам</button>'
      + '</div>';

    if (byBags) {
      html += _byBags(items, locs, checked, o.isMe, o.open);
    } else {
      html += groups(snap.categories || [], items).map(function(g) {
        return _tripCat(g, locs, checked, o.isMe, o.open);
      }).join('');
      if (o.isMe) {
        html += locs.length
          ? _hint('Нажми «куда» — выбрать сумку из тех, что взял в эту поездку')
          : _hint('Сумки для этой поездки не выбраны — их выбирают при сборе списка');
      }
    }
    return html;
  }

  function _packRow(item, on, locs, isMe, withTag, swipeDel) {
    var w = _wStr(item.weight);
    var sub = swipeDel ? (item.owner ? 'Берёт: '+_esc(item.owner) : '') : w;
    var main = _check(on) + '<span class="gear-pack-txt"><span class="gear-pack-name'+(on?' done':'')+'">'+_esc(item.name)+'</span>'
      + (sub ? '<span class="gear-pack-sub">'+sub+'</span>' : '') + '</span>';
    var act = swipeDel ? 'gear-shared-item-check' : 'gear-item-check';
    var row = isMe
      ? '<button type="button" class="gear-pack-main" role="checkbox" aria-checked="'+(on?'true':'false')+'" data-action="'+act+'" data-itemid="'+_esc(item.id)+'">'+main+'</button>'
      : '<div class="gear-pack-main">'+main+'</div>';
    var tag = '';
    if (withTag && locs.length) {
      var loc = item.locationId ? locs.find(function(l) { return l.id === item.locationId; }) : null;
      if (isMe) {
        tag = '<button type="button" class="gear-bagtag'+(loc?'':' empty')+'" data-action="gear-trip-item-loc-pick" data-itemid="'+_esc(item.id)+'" aria-label="Положить в сумку">'
          + (loc ? _esc(loc.name) : _ico('backpack') + 'куда') + '</button>';
      } else if (loc) {
        tag = '<span class="gear-bagtag">'+_esc(loc.name)+'</span>';
      }
    }
    var del = swipeDel ? '<button type="button" class="gear-swipe-del" data-action="gear-shared-item-del" data-itemid="'+_esc(item.id)+'">Удалить</button>' : '';
    return '<div class="gear-pack-row'+(swipeDel?' gear-swipe':'')+'">' + row + tag + del + '</div>';
  }

  function _tripCat(g, locs, checked, isMe, open) {
    var cat = g.cat, key = 't:' + cat.id, isOpen = !!open[key];
    var onItems  = g.items.filter(function(i) { return _isOn(checked, i.id); });
    var offItems = g.items.filter(function(i) { return !_isOn(checked, i.id); });
    var full = g.items.length && onItems.length === g.items.length;
    var body = '';
    if (isOpen) {
      body = offItems.map(function(i) { return _packRow(i, false, locs, isMe, true); }).join('');
      if (onItems.length) {
        var dKey = 'd:' + cat.id, dOpen = !!open[dKey];
        body += '<button type="button" class="gear-done-toggle" '+_toggleAttrs(dKey, dOpen)+'>'
          + '<span class="gear-done-ic">'+_ico('check')+'</span>Собрано · '+onItems.length + _chev(dOpen) + '</button>';
        if (dOpen) {
          body += onItems.map(function(i) { return _packRow(i, true, locs, isMe, true); }).join('');
          if (isMe) body += '<button type="button" class="gear-foot-link" data-action="gear-cat-clear-checked" data-catid="'+_esc(cat.id)+'">Снять отметки в категории</button>';
        }
      }
    }
    return '<section class="gear-card">' + _catHead(key, isOpen, cat.name, onItems.length+'/'+g.items.length, full ? 'ok' : '') + body + '</section>';
  }

  function _byBags(items, locs, checked, isMe, open) {
    var byId = {};
    locs.forEach(function(l) { byId[l.id] = l; });
    function subtreeW(locId, seen) {
      seen = seen || {};
      if (seen[locId]) return 0;
      seen[locId] = true;
      var sum = _sumW(items.filter(function(i) { return i.locationId === locId; }));
      locs.filter(function(l) { return l.parentId === locId; }).forEach(function(c) {
        sum += (Number(c.tare) || 0) + subtreeW(c.id, seen);
      });
      return sum;
    }
    function card(key, defOpen, icon, name, meta, list) {
      var isOpen = open[key] != null ? !!open[key] : defOpen;
      var body = isOpen
        ? (list.length ? _sortByChecked(list, checked).map(function(i) { return _packRow(i, _isOn(checked, i.id), locs, isMe, false); }).join('')
          : _hint('Пусто — назначь вещам эту сумку в виде «По категориям»', 'gear-hint-in'))
        : '';
      return '<section class="gear-card"><button type="button" class="gear-bag-head'+(isOpen?' open':'')+'" '+_toggleAttrs(key, isOpen)+'>'
        + '<span class="gear-bag-ic">'+icon+'</span>'
        + '<span class="gear-bag-txt"><span class="gear-bag-name">'+_esc(name)+'</span><span class="gear-bag-meta">'+meta+'</span></span>'
        + _chev(isOpen) + '</button>' + body + '</section>';
    }
    function countMeta(list) {
      var n = list.length, d = list.filter(function(i) { return _isOn(checked, i.id); }).length;
      return n + ' ' + _plural(n, 'вещь', 'вещи', 'вещей') + (d ? ' · ' + d + ' собрано' : '');
    }
    var out = _bagOrder(locs).map(function(o) {
      var loc = o.loc;
      var list = items.filter(function(i) { return i.locationId === loc.id; });
      var tare = Number(loc.tare) || 0;
      var totalW = tare + subtreeW(loc.id);
      var meta = countMeta(list);
      if (totalW) meta += ' · ' + _wStr(totalW) + (tare ? ' с сумкой' : '');
      if (o.parent) meta += ' · внутри: ' + _esc(o.parent.name);
      return card('b:' + loc.id, true, _svg(loc.iconIdx != null ? loc.iconIdx : 1, 18), loc.name, meta, list);
    }).join('');
    var loose = items.filter(function(i) { return !i.locationId || !byId[i.locationId]; });
    out += card('b:' + NO_CAT, false, _ico('package'), 'Не разложено', countMeta(loose), loose);
    return out;
  }

  /* ── Общее (групповое) ── */

  function _sharedView(shared, checked, open) {
    var items = (shared && shared.items) || [];
    var cats  = (shared && shared.categories) || [];
    if (!cats.length && !items.length) {
      return '<section class="gear-card gear-card-pad">'
        + '<span class="gear-tile-river">'+_ico('users')+'</span>'
        + '<h2 class="gear-card-h">Общая снаряга группы</h2>'
        + '<p class="gear-card-p">То, что везёт кто-то один на всех: лодки, мотор, тент, котлы. У каждой вещи — кто берёт. Видят и отмечают все участники.</p>'
        + _hint('Это отдельный список — с твоим личным он не связан.')
        + '<button type="button" class="gear-btn-main" data-action="gear-shared-cat-add">Добавить категорию</button>'
        + '</section>';
    }
    return groups(cats, items).map(function(g) {
      var cat = g.cat, key = 's:' + cat.id, isOpen = !!open[key];
      var done = g.items.filter(function(i) { return _isOn(checked, i.id); }).length;
      var body = '';
      if (isOpen) {
        body = _sortByChecked(g.items, checked).map(function(i) { return _packRow(i, _isOn(checked, i.id), [], true, false, true); }).join('');
        if (!g.items.length) body += _hint('В категории пока нет вещей', 'gear-hint-in');
        if (!cat.orphan) {
          body += '<div class="gear-cat-foot">'
            + '<button type="button" class="gear-foot-add" data-action="gear-shared-item-add" data-catid="'+_esc(cat.id)+'">'+_ico('plus')+' Добавить вещь</button>'
            + (done ? '<button type="button" class="gear-foot-link sm" data-action="gear-shared-cat-clear-checked" data-catid="'+_esc(cat.id)+'">Снять отметки</button>' : '')
            + '<button type="button" class="gear-foot-more" data-action="gear-shared-cat-edit" data-catid="'+_esc(cat.id)+'" aria-label="Категория: переименовать, удалить">'+_ico('dots')+'</button>'
            + '</div>';
        }
      }
      return '<section class="gear-card">' + _catHead(key, isOpen, cat.name, done+'/'+g.items.length, g.items.length && done === g.items.length ? 'ok' : '') + body + '</section>';
    }).join('')
      + '<button type="button" class="gear-dashed" data-action="gear-shared-cat-add">'+_ico('plus')+' Новая категория</button>';
  }

  /* ══════════════ Мастер «Собрать список на поездку» ══════════════ */

  function _steps(n) {
    return '<div class="gear-steps"><span class="on"></span><span'+(n >= 1 ? ' class="on"' : '')+'></span></div>';
  }

  function _wizHead(tripName, sub) {
    return _head({ backAction: 'gear-pick-mode-cancel', backIcon: 'x', backLabel: 'Отмена', title: 'Список на ' + tripName, sub: sub });
  }

  function pickView(tpl, selected, tripName, open) {
    var total = tpl.items.length, n = selected.length;
    var html = _wizHead(tripName, 'шаг 1 из 2 · что берёшь') + _steps(0)
      + '<div class="gear-wiz-line"><span>Выбрано <b>'+n+'</b> из '+total+'</span>'
      + '<button type="button" class="gear-link-acc" data-action="gear-pick-all" data-on="'+(n ? '0' : '1')+'">'+(n ? 'Снять все' : 'Выбрать все')+'</button></div>';
    html += groups(tpl.categories, tpl.items).filter(function(g) { return g.items.length; }).map(function(g) {
      var cat = g.cat, key = 'w:' + cat.id, isOpen = !!open[key];
      var k = g.items.filter(function(i) { return _isOn(selected, i.id); }).length;
      var head = '<div class="gear-pick-head'+(isOpen?' open':'')+'">'
        + '<button type="button" class="gear-pick-all-btn" role="checkbox" aria-checked="'+(k === g.items.length ? 'true' : (k ? 'mixed' : 'false'))+'" aria-label="Выбрать всю категорию" data-action="gear-pick-toggle-cat" data-catid="'+_esc(cat.id)+'">'+_check3(k, g.items.length)+'</button>'
        + '<button type="button" class="gear-pick-head-t" '+_toggleAttrs(key, isOpen)+'><span class="gear-cat-name">'+_esc(cat.name)+'</span>'
        + '<span class="gear-cat-cnt">'+k+' из '+g.items.length+'</span>'+_chev(isOpen)+'</button></div>';
      var body = isOpen ? g.items.map(function(i) {
        var on = _isOn(selected, i.id), w = _wStr(i.weight);
        return '<button type="button" class="gear-pick-row" role="checkbox" aria-checked="'+(on?'true':'false')+'" data-action="gear-pick-toggle-item" data-itemid="'+_esc(i.id)+'">'
          + _check(on) + '<span class="gear-pick-name">'+_esc(i.name)+'</span>' + (w ? '<span class="gear-row-w">'+w+'</span>' : '') + '</button>';
      }).join('') : '';
      return '<section class="gear-card">' + head + body + '</section>';
    }).join('');
    html += _hint('Потом в списке можно будет подтянуть новые вещи из «Вещей» — ничего не потеряется');
    html += _sticky('<button type="button" class="gear-btn-main" data-action="gear-pick-done">Дальше — какие сумки берёшь</button>');
    return '<div class="gear-page">'+html+'</div>';
  }

  function pickLocationsView(locs, selected, tripName, nItems) {
    var html = _wizHead(tripName, 'шаг 2 из 2 · какие сумки берёшь') + _steps(1);
    if (!locs.length) {
      html += _hint('Сумок пока нет — их заводят во вкладке «Сумки». Этот шаг можно пропустить: вещи просто останутся «не разложены».', 'gear-lead');
    } else {
      html += _hint('По этим сумкам потом разложишь вещи. Можно пропустить — вещи останутся «не разложены».', 'gear-lead');
      var cards = [], cur = null, nested = false;
      _bagOrder(locs).forEach(function(o) {
        if (o.depth === 0) { cur = []; cards.push(cur); } else nested = true;
        cur.push(o);
      });
      html += cards.map(function(list) {
        return '<section class="gear-card">' + list.map(function(o) {
          var on = _isOn(selected, o.loc.id), meta = _bagMeta(o.loc, o.parent);
          return '<button type="button" class="gear-pick-row bag" style="padding-left:'+(16 + o.depth * 32)+'px" role="checkbox" aria-checked="'+(on?'true':'false')+'" data-action="gear-pick-toggle-location" data-locid="'+_esc(o.loc.id)+'">'
            + _check(on) + '<span class="gear-bag-txt"><span class="gear-bag-name">'+_esc(o.loc.name)+'</span>'
            + (meta ? '<span class="gear-bag-meta">'+meta+'</span>' : '') + '</span></button>';
        }).join('') + '</section>';
      }).join('');
      if (nested) html += _hint('Выбранная вложенная сумка берёт с собой и ту, в которой лежит');
    }
    html += _sticky('<button type="button" class="gear-btn-sec" data-action="gear-pick-back-to-items">Назад</button>'
      + '<button type="button" class="gear-btn-main" data-action="gear-pick-create">Создать список · '+nItems+' '+_plural(nItems, 'вещь', 'вещи', 'вещей')+'</button>', 'row');
    return '<div class="gear-page">'+html+'</div>';
  }

  /* ══════════════ ЛИСТЫ ══════════════ */

  function _sheetHead(title, doneAction, editId) {
    return '<div class="gear-sheet-grab"></div><div class="gear-sheet-header">'
      + '<button type="button" class="gear-sheet-cancel" data-action="gear-sheet-close">Отмена</button>'
      + '<div class="gear-sheet-title">'+title+'</div>'
      + (doneAction ? '<button type="button" class="gear-sheet-done" data-action="'+doneAction+'"'+(editId != null ? ' data-editid="'+_esc(editId)+'"' : '')+'>Готово</button>' : '<div style="width:52px"></div>')
      + '</div>';
  }

  // Универсальный лист действий для «…»: [{action, icon, label, danger, attrs}]
  function sheetActions(title, actions) {
    return '<div class="gear-sheet-overlay" id="gear-ctx-sheet"><div class="gear-sheet gear-sheet-sm">'
      + '<div class="gear-sheet-grab"></div>'
      + (title ? '<div class="gear-ctx-title">'+_esc(title)+'</div>' : '')
      + actions.map(function(a) {
          return '<button type="button" class="gear-ctx-item'+(a.danger?' gear-ctx-danger':'')+'" data-action="'+a.action+'" '+(a.attrs||'')+'>'+_ico(a.icon)+'<span>'+_esc(a.label)+'</span></button>';
        }).join('')
      + '<button type="button" class="gear-ctx-item gear-ctx-cancel" data-action="gear-sheet-close"><span>Отмена</span></button>'
      + '</div></div>';
  }

  function sheetCategoryMenu(cat) {
    var a = ' data-catid="'+_esc(cat.id)+'"';
    return sheetActions(cat.name, [
      { action: 'gear-cat-edit', icon: 'pencil', label: 'Переименовать', attrs: a },
      { action: 'gear-cat-toggle-hidden', icon: 'eye', label: (cat.hidden ? 'Показать' : 'Скрыть') + ' категорию', attrs: a },
      { action: 'gear-cat-del-items', icon: 'trash', label: 'Удалить, вещи сохранить', attrs: a },
      { action: 'gear-cat-del-all', icon: 'trash', label: 'Удалить вместе с вещами', danger: true, attrs: a }
    ]);
  }

  function sheetPickTrip(trips, existingIds) {
    var rows = trips.map(function(t) {
      var already = existingIds.indexOf(t.id) >= 0;
      return '<button type="button" class="gear-pick-item" data-action="gear-pick-trip-selected" data-tripid="'+_esc(t.id)+'" data-tripname="'+_esc(t.name)+'">'
        + '<span class="gear-pick-info"><span class="gear-pick-name">'+_esc(t.name)+'</span>'
        + (already ? '<span class="gear-pick-meta">Уже есть список — будет заменён</span>' : '')
        + '</span>'+_ico('chevron-right')+'</button>';
    }).join('');
    return '<div class="gear-sheet-overlay" id="gear-triptarget-sheet"><div class="gear-sheet gear-sheet-sm">'
      + _sheetHead('Для какой поездки?')
      + '<div class="gear-sheet-scroll">' + (trips.length ? rows : '<div class="gear-pick-hint">Нет доступных поездок.</div>') + '</div>'
      + '</div></div>';
  }

  function sheetAddLocation(template, editId, parentPreset) {
    var loc    = editId ? template.locations.find(function(l) { return l.id === editId; }) : null;
    var isEdit = !!loc;
    var parentId = loc ? (loc.parentId || '') : (parentPreset || '');
    var p = parentId ? template.locations.find(function(l) { return l.id === parentId; }) : null;
    var iconsHtml = _iconPicker(loc ? (loc.iconIdx != null ? loc.iconIdx : 1) : 1, 'gear-loc-sheet');
    var eid = editId != null ? editId : '';

    return '<div class="gear-sheet-overlay" id="gear-loc-sheet"><div class="gear-sheet">'
      + _sheetHead(isEdit ? 'Сумка' : 'Новая сумка', 'gear-loc-save', eid)
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-loc-name" type="text" placeholder="Рюкзак, баул, несессер..." value="'+_esc(loc ? loc.name : '')+'"></div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Иконка</div>'+iconsHtml+'</div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Параметры</div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Объём</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-loc-volume" type="number" inputmode="numeric" placeholder="—" value="'+_esc(loc && loc.volume ? loc.volume : '')+'">'
      + '<div class="gear-field-unit">л</div></div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Сама весит</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-loc-tare" type="number" inputmode="numeric" placeholder="—" value="'+_esc(loc && loc.tare ? loc.tare : '')+'">'
      + '<div class="gear-field-unit">г</div></div>'
      + '<button type="button" class="gear-field-row gear-pick-trigger" data-action="gear-loc-parent-pick">'
      + '<div class="gear-field-label">Внутри</div>'
      + '<div class="gear-field-val" id="gear-loc-parent-display">'+(p ? _esc(p.name) : '<span class="gear-field-ph">Не внутри другой сумки</span>')+'</div>'
      + _ico('chevron-right') + '</button>'
      + '<input type="hidden" id="gear-loc-parent-id" value="'+_esc(parentId)+'">'
      + '</div>'
      + '<div class="gear-sheet-hint">Укажи, если эта сумка лежит в другой — например, несессер в бауле.</div>'
      + (isEdit ? '<button type="button" class="gear-btn-sec gear-btn-block" data-action="gear-loc-add-child" data-parentid="'+_esc(editId)+'">Добавить сумку внутрь</button>'
        + '<button type="button" class="gear-btn-danger" data-action="gear-loc-del" data-locid="'+_esc(editId)+'">Удалить сумку</button>' : '')
      + '<button type="button" class="gear-btn-primary" data-action="gear-loc-save" data-editid="'+_esc(eid)+'">'+(isEdit ? 'Сохранить' : 'Создать сумку')+'</button>'
      + '</div></div></div>';
  }

  // Иконку категории в новом дизайне не показываем — пикер убран, но
  // сохранённый iconIdx не трогаем (см. gear-cat-save в index.js).
  function sheetAddCategory(template, editId) {
    var cat    = editId ? template.categories.find(function(c) { return c.id === editId; }) : null;
    var isEdit = !!cat;
    var eid = editId != null ? editId : '';
    var presetsHtml = CAT_PRESETS.map(function(p) {
      return '<button type="button" class="gear-chip'+(cat && cat.name === p ? ' on':'')+'" data-action="gear-preset-pick" data-preset="'+_esc(p)+'">'+_esc(p)+'</button>';
    }).join('');

    return '<div class="gear-sheet-overlay" id="gear-cat-sheet"><div class="gear-sheet">'
      + _sheetHead(isEdit ? 'Категория' : 'Новая категория', 'gear-cat-save', eid)
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-cat-name" type="text" placeholder="Название категории" value="'+_esc(cat ? cat.name : '')+'"></div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Быстрый выбор</div><div class="gear-chips">'+presetsHtml+'</div></div>'
      + (isEdit ? '<button type="button" class="gear-btn-danger" data-action="gear-cat-menu" data-catid="'+_esc(editId)+'">Удалить / скрыть категорию</button>' : '')
      + '<button type="button" class="gear-btn-primary" data-action="gear-cat-save" data-editid="'+_esc(eid)+'">'+(isEdit ? 'Сохранить' : 'Создать категорию')+'</button>'
      + '</div></div></div>';
  }

  function sheetAddItem(template, editId, defaultCatId) {
    var item   = editId ? template.items.find(function(i) { return i.id === editId; }) : null;
    var isEdit = !!item;
    var catId  = item ? (item.categoryId || '') : (defaultCatId != null ? defaultCatId : '');
    var eid = editId != null ? editId : '';
    var catChips = template.categories.map(function(c) {
      return '<button type="button" class="gear-chip'+(c.id === catId ? ' on':'')+'" data-action="gear-chip-cat" data-catid="'+_esc(c.id)+'">'+_esc(c.name)+'</button>';
    }).join('');
    var catName = (template.categories.find(function(c) { return c.id === catId; }) || {}).name || 'категорию';

    return '<div class="gear-sheet-overlay" id="gear-item-sheet"><div class="gear-sheet">'
      + _sheetHead(isEdit ? 'Вещь' : 'Новая вещь', 'gear-item-save', eid)
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-item-name" type="text" placeholder="Что берёшь с собой?" value="'+_esc(item ? item.name : '')+'"></div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Категория</div>'
      + '<div class="gear-chips" id="gear-item-cat-chips">'+catChips+'</div>'
      + '<input type="hidden" id="gear-item-catid" value="'+_esc(catId)+'"></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Детали</div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Вес</div>'
      + '<input class="gear-fi gear-fi-sm" id="gear-item-weight" type="number" inputmode="numeric" placeholder="—" value="'+_esc(item && item.weight ? item.weight : '')+'">'
      + '<div class="gear-field-unit">г</div></div>'
      + '<div class="gear-field-row"><div class="gear-field-label">Заметка</div>'
      + '<input class="gear-fi" id="gear-item-note" type="text" placeholder="необязательно" value="'+_esc(item && item.note ? item.note : '')+'"></div></div>'
      + (isEdit ? '<button type="button" class="gear-btn-danger" data-action="gear-item-del" data-itemid="'+_esc(editId)+'">Удалить вещь</button>' : '')
      + '<button type="button" class="gear-btn-primary" id="gear-item-save-btn" data-action="gear-item-save" data-editid="'+_esc(eid)+'">'
      + (isEdit ? 'Сохранить' : 'Добавить в '+_esc(catName))+'</button>'
      + '</div></div></div>';
  }

  // trigger: 'parent' (в листе сумки) | 'trip-item-loc' (сумка вещи в поездке)
  function sheetPickLocation(locations, selectedId, trigger) {
    var isTrip = trigger === 'trip-item-loc';
    var row = function(id, on, icon, name, meta, muted) {
      return '<button type="button" class="gear-pick-item'+(on?' on':'')+'" data-action="gear-loc-picked" data-locid="'+_esc(id)+'" data-trigger="'+_esc(trigger)+'">'
        + '<span class="gear-pick-ic">'+icon+'</span>'
        + '<span class="gear-pick-info"><span class="gear-pick-name'+(muted?' gear-pick-muted':'')+'">'+name+'</span>'
        + (meta ? '<span class="gear-pick-meta">'+meta+'</span>' : '') + '</span>'
        + (on ? '<span class="gear-pick-check">'+_ico('check')+'</span>' : '') + '</button>';
    };
    var items = _bagOrder(locations).map(function(o) {
      var l = o.loc;
      return row(l.id, l.id === selectedId, _svg(l.iconIdx != null ? l.iconIdx : 1), _esc(l.name),
        [l.volume ? _esc(l.volume)+' л' : '', o.parent ? 'внутри: '+_esc(o.parent.name) : ''].filter(Boolean).join(' · '));
    }).join('');

    return '<div class="gear-sheet-overlay" id="gear-pick-sheet"><div class="gear-sheet gear-sheet-sm">'
      + _sheetHead(isTrip ? 'В какую сумку?' : 'Внутри какой сумки?')
      + '<div class="gear-sheet-scroll">'
      + row('', selectedId === '', _ico('x'), isTrip ? 'Не разложено' : 'Не внутри другой сумки', isTrip ? 'Убрать из сумки' : 'Самостоятельная сумка', true)
      + '<div class="gear-pick-section">'+(isTrip ? 'Сумки этой поездки' : 'Мои сумки')+'</div>'
      + items
      + (isTrip ? '' : '<div class="gear-pick-hint">Нет нужной сумки — закрой, создай её, вернись.</div>')
      + '</div></div></div>';
  }

  function sheetImportText() {
    return '<div class="gear-sheet-overlay" id="gear-import-sheet"><div class="gear-sheet">'
      + _sheetHead('Импорт списком', 'gear-import-save')
      + '<div class="gear-sheet-body">'
      + '<div class="gear-sheet-hint">Вставь список из заметок — по одной вещи на строке. Строка, заканчивающаяся двоеточием, начинает новую категорию («Одежда:»). Без заголовков всё попадёт в одну категорию «Импорт».</div>'
      + '<textarea class="gear-import-ta" id="gear-import-text" rows="12" placeholder="Одежда:\nКуртка\nШтаны\n\nСнасти:\nСпиннинг\nКатушка"></textarea>'
      + '<button type="button" class="gear-btn-primary" data-action="gear-import-save">Импортировать</button>'
      + '</div></div></div>';
  }

  function sheetAddSharedCategory(shared, editId) {
    var cat    = editId && shared ? shared.categories.find(function(c) { return c.id === editId; }) : null;
    var isEdit = !!cat;
    var eid = editId != null ? editId : '';
    return '<div class="gear-sheet-overlay" id="gear-cat-sheet"><div class="gear-sheet">'
      + _sheetHead(isEdit ? 'Категория' : 'Новая категория', 'gear-shared-cat-save', eid)
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-shared-cat-name" type="text" placeholder="Например, Лагерь" value="'+_esc(cat ? cat.name : '')+'"></div></div>'
      + (isEdit ? '<button type="button" class="gear-btn-danger" data-action="gear-shared-cat-del" data-catid="'+_esc(editId)+'">Удалить категорию</button>' : '')
      + '<button type="button" class="gear-btn-primary" data-action="gear-shared-cat-save" data-editid="'+_esc(eid)+'">'+(isEdit ? 'Сохранить' : 'Создать категорию')+'</button>'
      + '</div></div></div>';
  }

  function sheetAddSharedItem() {
    return '<div class="gear-sheet-overlay" id="gear-item-sheet"><div class="gear-sheet">'
      + _sheetHead('Новая вещь', 'gear-shared-item-save')
      + '<div class="gear-sheet-body">'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Название</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-shared-item-name" type="text" placeholder="Что нужно на группу?"></div></div>'
      + '<div class="gear-field-group"><div class="gear-field-lbl">Кто берёт</div>'
      + '<div class="gear-field-row"><input class="gear-fi" id="gear-shared-item-owner" type="text" placeholder="необязательно"></div></div>'
      + '<button type="button" class="gear-btn-primary" data-action="gear-shared-item-save">Добавить</button>'
      + '</div></div></div>';
  }

  function _iconPicker(selectedIdx, sheetId) {
    var html = '<div class="gear-icon-grid">';
    for (var i = 0; i < ICONS.length; i++) {
      html += '<button type="button" class="gear-ipic'+(i===selectedIdx?' on':'')+'" data-action="gear-icon-pick" data-idx="'+i+'" data-sheet="'+_esc(sheetId)+'">'+_svg(i, 18)+'</button>';
    }
    return html + '</div>';
  }

  return {
    rootView, tripView, pickView, pickLocationsView,
    sheetAddLocation, sheetAddCategory, sheetAddItem,
    sheetPickLocation, sheetCategoryMenu, sheetImportText, sheetActions,
    sheetAddSharedCategory, sheetAddSharedItem, sheetPickTrip,
    groups, NO_CAT, PRESET_ICONS,
    _esc
  };
})();

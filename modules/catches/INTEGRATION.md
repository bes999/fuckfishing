# Catches — инструкция по интеграции

## 1. Создать папку модуля
```
modules/catches/
  data.js
  firebase.js
  index.js
  render.js
  state.js
  styles.css
```

## 2. В index.html — подключить стили (после shopping/styles.css)
```html
<link rel="stylesheet" href="modules/catches/styles.css">
```

## 3. В index.html — добавить страницу в #app (после #p-shopping)
```html
<div id="p-catches" class="page"></div>
```

## 4. В index.html — подключить скрипты (после shopping/index.js)
```html
<!-- ── Catches module ── -->
<script src="modules/catches/data.js"></script>
<script src="modules/catches/state.js"></script>
<script src="modules/catches/firebase.js"></script>
<script src="modules/catches/render.js"></script>
<script src="modules/catches/index.js"></script>
```

## 5. В onNavigate — в блок 'more', в список items поменять:
```js
{ id:'catch', label:'Поимки', icon:'ti-fish', ready:true },
```

## 6. В onNavigate — в обработчик кликов добавить:
```js
else if (id === 'catch') {
  AppRouter.show('catches');
  CatchesIndex.show(document.getElementById('p-catches'), window.APP?.currentTripId);
}
```

## 7. В rivers/render.js — добавить select участника в форму улова

В функции `detail()` найти блок "записать улов" и заменить:
```js
// БЫЛО:
h += '  <div class="rv-catch-row">';
h += _fishSelect('rv-c-fish');
h += '    <input class="rv-catch-num" id="rv-c-cnt" type="number" value="1" min="1">';
h += '  </div>';

// СТАЛО:
h += '  <div class="rv-catch-row">';
h += _fishSelect('rv-c-fish');
h += '    <input class="rv-catch-num" id="rv-c-cnt" type="number" value="1" min="1">';
h += '  </div>';
h += '  <select class="rv-catch-sel" id="rv-c-member" style="width:100%;margin-bottom:8px">';
h += '    <option value="">Участник (необязательно)</option>';
h += _memberOptions();
h += '  </select>';
```

## 8. В rivers/render.js — добавить функцию _memberOptions()

Добавить в конец модуля RiversRender (перед return):
```js
function _memberOptions() {
  // Берём участников из поездки
  const trip = window.APP?.currentTripData || null;
  const members = typeof CatchesState !== 'undefined'
    ? CatchesState.getMembers(window.APP?.currentTripId || '')
    : [];
  return members.map(m => `<option value="${m}">${m}</option>`).join('');
}
```

И добавить в public return:
```js
return { list, detail, catchLog: _catchLog, pointsList: _pointsList, navUrl: _navUrl, memberOptions: _memberOptions };
```

## 9. В rivers/index.js — добавить member в объект entry

Найти функцию `_saveCatch(r)` и заменить:
```js
// БЫЛО:
var entry = {
  date: new Date().toISOString().split('T')[0],
  river: r.name,
  fish:  fishEl.value,
  count: parseInt(cntEl.value) || 1,
  weight: 0,
  kept:  _kept,
  createdAt: new Date().toISOString()
};
_addCatch(entry);

// СТАЛО:
var memberEl = document.getElementById('rv-c-member');
var entry = {
  date:   new Date().toISOString().split('T')[0],
  river:  r.name,
  fish:   fishEl.value,
  count:  parseInt(cntEl.value) || 1,
  kept:   _kept,
  member: memberEl ? memberEl.value : '',
  createdAt: new Date().toISOString()
};
// Сохраняем в Firebase через CatchesFirebase
var tripId = window.APP?.currentTripId;
if (tripId && typeof CatchesFirebase !== 'undefined') {
  CatchesFirebase.addCatch(tripId, entry).then(id => {
    if (id) entry._id = id;
  });
} else {
  _addCatch(entry); // fallback localStorage
}

// ВАЖНО: убрать старый вызов _addCatch(entry) — теперь всё идёт в Firebase
```

## 10. В rivers/render.js — показывать member в логе улова

Найти функцию `_catchLog` и заменить строку с записью:
```js
// БЫЛО:
h += '  <span class="rv-catch-entry-l">' + c.fish + ' · ' + c.count + ' шт</span>';

// СТАЛО:
h += '  <span class="rv-catch-entry-l">' + c.fish + ' · ' + c.count + ' шт'
  + (c.member ? ' · ' + c.member : '') + '</span>';
```

## 11. В rivers/index.js — слушать Firebase вместо localStorage

В функции `_getCatches()` данные теперь приходят из Firebase.
Подписка на changes уже есть в CatchesFirebase.listen().
Чтобы список улова в карточке реки обновлялся — добавить:

```js
// В _bindDetail(r) после привязки событий:
if (typeof CatchesFirebase !== 'undefined' && window.APP?.currentTripId) {
  CatchesFirebase.listen(window.APP.currentTripId, function(arr) {
    // Обновляем локальный state
    if (typeof CatchesState !== 'undefined') {
      CatchesState.setCatches(window.APP.currentTripId, arr);
    }
    // Перерисовываем лог улова текущей реки
    var riverCatches = arr
      .map(function(c, i) { return Object.assign({}, c, { _idx: i }); })
      .filter(function(c) { return c.river === r.name; });
    var logEl = document.getElementById('rv-catch-log');
    if (logEl) {
      logEl.outerHTML = RiversRender.catchLog(riverCatches);
    }
  });
}
```

## 12. В app.css добавить
```css
#p-catches {
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
}
```

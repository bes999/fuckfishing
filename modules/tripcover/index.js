'use strict';

/* globals TripsData, AppNav */

const TripCoverIndex = (() => {

  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];

  let _tripId = null;
  let _guideHandler = null;
  let _guideKeyHandler = null;
  let _notesUnsub = null;
  let _activityUnsub = null;
  let _activityItems = [];
  let _activityLimit = 10;

  // ── «Мои дела по поездке» (см. BRIEF2.md) — личный чек-лист вкладки
  // «Инфо», виден только автору. Свои пункты — trips/{tripId}/todo_personal/
  // {uid}.items[]; авто-пункты (даты, снаряга, медданные) не хранятся,
  // считаются на лету при каждом показе карточки.
  let _todoItems = [];
  let _todoGearReady = false;
  let _todoCollapsed = false;

  // Лист в стиле v2 (макеты V2Invite/V2GuideTabs/V2TravelSheet): ручка,
  // заголовок Unbounded + подпись, круглая «×» справа, необязательный
  // футер с главной кнопкой. Анимация выезда — старые .tqp-overlay/.tqp-sheet.
  // Закрытие по фону и по «×» вешается здесь же; своё поведение листа
  // вызывающий вешает вторым обработчиком на возвращённый overlay.
  function _openSheet(id, title, sub, bodyHtml, opts) {
    opts = opts || {};
    document.getElementById(id)?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay tc-sheet-overlay';
    overlay.id = id;
    overlay.innerHTML = `
      <div class="tqp-sheet tc-sheet" role="dialog" aria-label="${_esc(title)}">
        <div class="tqp-handle"></div>
        <div class="tc-sheet-head">
          <div class="tc-sheet-titles">
            <div class="tc-sheet-title">${_esc(title)}</div>
            ${sub ? `<div class="tc-sheet-sub">${_esc(sub)}</div>` : ''}
          </div>
          <button type="button" class="tc-sheet-close" data-action="tc-sheet-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="tc-sheet-body">${bodyHtml}</div>
        ${opts.footer ? `<div class="tc-sheet-foot">${opts.footer}</div>` : ''}
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="tc-sheet-close"]')) overlay.remove();
    });
    return overlay;
  }

  function _plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if ([2, 3, 4].includes(m10) && ![12, 13, 14].includes(m100)) return few;
    return many;
  }

  // Звать людей может организатор, остальные — если он не закрыл это
  // флагом trip.inviteRestricted (тот же гейт, что был у кнопки в шапке).
  function _canInvite(trip) {
    return !trip.inviteRestricted || TripsData.canManage(trip);
  }

  // Один лист «Пригласить в «…»» (макет V2Invite) вместо прежних двух
  // шагов «Добавить участника → по ссылке / гость». Функции те же:
  // ссылка ?joinTrip= (как MembersRender.showInvite) + QR, аллоулист email
  // (MembersFirebase.addInvite), гости без аккаунта — { name, uid: null }
  // в participants через TripsData.addGuestNames (не в memberIds, войти не
  // могут). onGuestsAdded — чем перерисовать экран после добавления гостей.
  async function _showInviteSheet(trip, onGuestsAdded) {
    const base = window.location.href.split('?')[0].split('#')[0];
    let url = `${base}?joinTrip=${encodeURIComponent(trip.id)}`;
    // Токен — случайная часть ссылки на самой поездке (см.
    // TripsData.ensureInviteToken/index.html _processJoinInvite). Раньше
    // ссылка несла только id поездки — не секрет и никогда не меняется,
    // так что её мог собрать кто угодно сам, а отозвать было нечем.
    // Реальная дыра, найдена внешним ревью 2026-09-27.
    if (typeof TripsData !== 'undefined') {
      try {
        const token = await TripsData.ensureInviteToken(trip.id);
        if (token) url += `&t=${encodeURIComponent(token)}`;
      } catch (_) {}
    }
    const body = `
      <p class="tc-sheet-lead">Отправь ссылку — человек войдёт через Google или email и сразу попадёт в эту поездку.</p>
      <div class="tc-inv-link">
        <span class="tc-inv-url">${_esc(url)}</span>
        <button type="button" class="tc-inv-copy" data-action="tc-inv-copy">Скопировать</button>
      </div>
      <details class="tc-inv-qr">
        <summary>Показать QR-код</summary>
        <img src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR-код приглашения" width="160" height="160" loading="lazy">
      </details>
      <div class="tc-field-title">Email человека</div>
      <div class="tc-field-hint">чтобы разрешить ему регистрацию</div>
      <input type="email" class="tc-input" id="tc-inv-email" placeholder="friend@example.com" autocomplete="off">
      <button type="button" class="tc-btn-secondary" data-action="tc-inv-allow">Разрешить регистрацию</button>
      <div class="tc-inv-status" id="tc-inv-status"></div>
      <div class="tc-inv-guest">
        <div class="tc-field-title">Или гость без приложения</div>
        <div class="tc-field-hint">Просто имя, без регистрации — попадёт в участников и счётчики. Несколько — через запятую.</div>
        <div class="tc-inline-add">
          <input type="text" class="tc-input" id="tc-inv-guest" placeholder="Имя гостя" autocomplete="off">
          <button type="button" class="tc-btn-add" data-action="tc-inv-guest-add">Добавить</button>
        </div>
      </div>`;
    const overlay = _openSheet('tc-invite-overlay', `Пригласить в «${trip.name || 'поездку'}»`, '', body);

    overlay.addEventListener('click', async e => {
      const a = e.target.closest('[data-action]')?.dataset.action;
      if (a === 'tc-inv-copy') {
        navigator.clipboard?.writeText(url).catch(() => {});
        const btn = overlay.querySelector('[data-action="tc-inv-copy"]');
        if (btn) { btn.textContent = 'Скопировано'; btn.classList.add('copied'); }
        return;
      }
      if (a === 'tc-inv-allow') {
        const input  = overlay.querySelector('#tc-inv-email');
        const status = overlay.querySelector('#tc-inv-status');
        const email  = input?.value.trim();
        if (!email) { input?.focus(); return; }
        if (typeof MembersFirebase === 'undefined') return;
        MembersFirebase.addInvite(email).then(() => {
          if (status) status.innerHTML = `${UIUtils.ico('check')} ${_esc(email)} теперь может зарегистрироваться`;
          if (input) input.value = '';
        }).catch(() => {
          if (status) status.textContent = 'Не получилось — попробуй ещё раз';
        });
        return;
      }
      if (a === 'tc-inv-guest-add') {
        const input = overlay.querySelector('#tc-inv-guest');
        const names = UIUtils.splitNames(input?.value);
        if (!names.length) { input?.focus(); return; }
        try {
          await TripsData.addGuestNames(trip.id, names);
        } catch (err) {
          console.error('addParticipant:', err);
          alert('Не удалось добавить гостя. Проверь соединение и попробуй ещё раз.');
          return;
        }
        overlay.remove();
        if (onGuestsAdded) onGuestsAdded();
      }
    });
  }

  // Табы внутри Гида — Инфо (маршрут/погода/Windy, всегда первым, не
  // настраивается) плюс разделы поездки, которые раньше были достижимы
  // только через выезжающее меню. Каждый рендерит свой уже готовый
  // show()/init() прямо в #g-tab-panel — их модули не меняются, просто
  // зовём их с другим контейнером вместо отдельной полноэкранной страницы.
  // Набор/порядок настраиваемые (⚙ в полоске табов) и хранятся per-поездку
  // в trip.guideTabs — по умолчанию (поле не задано) видно всё.
  const _ALL_TAB_DEFS = {
    rivers:   { label: 'Места' }, // id прежний, в UI — «Места»
    menu:     { label: 'Меню' },
    bar:      { label: 'Бар' },
    catches:  { label: 'Улов' },
    expenses: { label: 'Расходы' },
    shopping: { label: 'Закупка' },
    safety:   { label: 'Безопасность' },
    recipes:  { label: 'Рецепты' },
  };
  const _DEFAULT_TAB_ORDER = ['rivers', 'menu', 'bar', 'catches', 'expenses', 'shopping', 'safety', 'recipes'];
  let _activeGuideTab = 'info';

  // Видимые табы этой поездки в нужном порядке, всегда с 'info' первым.
  // Фильтруем по _ALL_TAB_DEFS на случай устаревших/опечатанных id в старых
  // сохранённых trip.guideTabs. Это ОБЩИЙ набор поездки (видят все её
  // участники одинаково) — не путать с персональным фильтром ниже.
  function _guideTabIds(trip) {
    const saved = (trip.guideTabs || []).filter(id => _ALL_TAB_DEFS[id]);
    return ['info', ...(saved.length ? saved : _DEFAULT_TAB_ORDER)];
  }

  // Персональный фильтр поверх общего набора поездки — "какие из
  // включённых для поездки вкладок лично я хочу видеть", хранится на
  // профиле участника (members/{uid}.hiddenGuideTabs), не на самой
  // поездке. В отличие от trip.guideTabs (общая настройка, меняет её
  // организатор для всех), это чисто личное — Дмитрию не интересен Бар ни
  // на одной поездке, а Илье наоборот. 'info' никогда не фильтруется —
  // всегда должна остаться хотя бы одна видимая вкладка. Настройки
  // (_showGuideTabsSettings ниже) сознательно работают с _guideTabIds
  // напрямую, не с этой функцией — организатор должен видеть и уметь
  // включить/выключить ВСЕ вкладки поездки для всех, даже те, что лично
  // сам скрыл у себя.
  function _personallyHiddenTabIds() {
    return (window.APP?.profile?.hiddenGuideTabs) || [];
  }

  function _personalGuideTabIds(trip) {
    const hidden = _personallyHiddenTabIds();
    if (!hidden.length) return _guideTabIds(trip);
    return _guideTabIds(trip).filter(id => id === 'info' || !hidden.includes(id));
  }

  // Публичная версия без 'info' — гамбургер-меню (shared/header.js)
  // фильтрует свои пункты Реки/Меню/Бар/Улов/Расходы/Закупка/Безопасность/
  // Рецепты по этому же списку, чтобы там не оставались табы, которые
  // выключили в настройках Гида (⚙) ИЛИ лично скрыл у себя пользователь.
  function visibleGuideTabs(trip) {
    return _personalGuideTabIds(trip).filter(id => id !== 'info');
  }

  // История браузера для обложка⇄Гид — свайп-назад/кнопка "назад" на
  // телефоне (см. index.html onNavigate для того же самого на уровне
  // страниц верхнего уровня, сделано раньше). opts.silent — реплей из
  // popstate (см. index.html), тогда НЕ пушим ещё раз поверх того, что
  // уже и так стало текущим состоянием истории.
  //
  // Тот же tripId, что уже в history.state — ЗАМЕНЯЕМ запись, а не
  // добавляем новую, даже если ffCover при этом меняется. Обложка и Гид
  // внутри одной поездки — это переключение вида, не новый уровень стека:
  // раньше "← к обложке" (форс-пуш поверх Гида) + собственная кнопка "←"
  // обложки (history.back()) вместе давали Дом→Обложка→Гид→Обложка(пуш) —
  // и назад с этой второй обложки уводило обратно в Гид, а не домой,
  // ощущалось как баг. С заменой вместо пуша переключение
  // обложка⇄Гид сколько угодно раз всегда остаётся на одном уровне стека —
  // "назад" с любого из них уходит туда, откуда зашли в саму поездку.
  function _pushTripHistory(tripId, isCover) {
    const newState = { ffPageId: 'guide', ffTripId: tripId, ffCover: !!isCover };
    const cur = history.state;
    if (cur && cur.ffTripId === tripId) history.replaceState(newState, '');
    else history.pushState(newState, '');
  }

  function show(tripId, opts) {
    opts = opts || {};
    _tripId = tripId;
    const trip = TripsData.getById(tripId);
    if (!trip) return;

    // Для завершённых поездок обложка/Инфо показывает живую статистику
    // улова и расходов — подтягиваем один раз (не через listen(), чтобы не
    // оборвать подписку уже открытых страниц Улов/Расходы) перед рендером.
    const prefetchDone = trip.status === 'done'
      ? Promise.all([CatchesFirebase.getOnce(tripId), ExpensesFirebase.getOnce(tripId)])
          .then(([catches, expenseData]) => {
            CatchesState.setCatches(tripId, catches);
            ExpensesState.setExpenses(tripId, expenseData.expenses);
            ExpensesState.setSettlements(tripId, expenseData.settlements);
          })
      : Promise.resolve();

    // Простые "Рыбалки" (без AI-импорта) — без промежуточной обложки,
    // сразу в Гид; всё, что раньше показывала обложка, теперь живёт в
    // табе "Инфо" (см. _renderFishingInfo). Экспедиции — обложка как была.
    if (trip.type === 'fishing') {
      prefetchDone.then(() => enterTrip(tripId, opts));
      return;
    }

    prefetchDone.then(() => {
      _renderCover(trip);
      _maybeRefreshWeather(trip);
      if (!opts.silent) _pushTripHistory(tripId, true);
    });
  }

  // ── Погода по координатам поездки (см. shared/weather.js) — берём первую
  // реку с координатами: у AI-импорта они почти всегда есть, у вручную
  // заведённых "Рыбалок" — только если река выбрана живым поиском по OSM
  // (modules/trips/index.js), а не одним из старых статичных чипов без
  // координат. Результат кэшируем в trip.weather в Firestore, чтобы не
  // дёргать API на каждый показ обложки; прогноз (в отличие от факта)
  // считаем протухшим через 6 часов и обновляем заново.
  // source: 'manual' (кнопка "Моё местоположение") | 'river' | null (нет
  // координат вообще). riverName — только при source:'river', для подписи
  // "Прогноз для: <река>". Раньше это решалось молча (_tripCoords ниже,
  // просто координаты без объяснения) — метка "Моё местоположение"
  // залипает НАВСЕГДА, пока её не переставят заново, и без подписи в
  // интерфейсе выглядело как баг: у поездки "Ханты" кто-то один раз нажал
  // булавку (возможно, ещё в Екатеринбурге, до выезда), и погода
  // подменилась на Екб без единого следа в интерфейсе, что именно
  // произошло. Реальный баг, найден внешним ревью 2026-09-30.
  function _tripCoordsInfo(trip) {
    if (trip.weatherCoords && trip.weatherCoords.lat != null) {
      return { coords: trip.weatherCoords, source: 'manual' };
    }
    const impHit = (trip.importData?.rivers || []).find(r => r.lat != null && r.lon != null);
    if (impHit) return { coords: { lat: impHit.lat, lon: impHit.lon }, source: 'river', riverName: impHit.name };
    const plainHit = (trip.rivers || []).find(r => r.lat != null && r.lon != null);
    if (plainHit) return { coords: { lat: plainHit.lat, lon: plainHit.lon }, source: 'river', riverName: plainHit.name };
    return { coords: null, source: null };
  }

  function _tripCoords(trip) {
    return _tripCoordsInfo(trip).coords;
  }

  function _maybeRefreshWeather(trip, force) {
    if (typeof WeatherService === 'undefined') return;
    const coords = _tripCoords(trip);
    if (!coords) return;

    const w = trip.weather;
    const STALE_MS = 6 * 3600 * 1000;
    // Архивная погода прошедшего дня не протухает по времени — но если это
    // однодневная поездка и почасовых данных ещё нет (например, старая
    // поездка, кэшированная до появления часового графика), это отдельная
    // причина дёрнуть обновление, даже когда w уже "archive" и вечно свежий.
    const missingHourly = trip.startDate === trip.endDate && !trip.weatherHourly;
    // Ветер закэширован ещё в км/ч (до перехода на wind_speed_unit=ms в
    // запросе) — у старых записей windUnit просто нет, добираем один раз.
    const staleWindUnit = !!w && w.windUnit !== 'ms';
    // Погода запрошена под другие даты (поездку перенесли) — раньше кэш
    // жил дальше, и прогноз оставался по старым датам. У записей без
    // forDates (до этой правки) — тоже один раз перезапрашиваем.
    const datesKey = (trip.startDate || '') + '_' + (trip.endDate || trip.startDate || '');
    const staleDates = !!w && w.forDates !== datesKey;
    const isStale = force || !w || missingHourly || staleWindUnit || staleDates || (w.source !== 'archive' && Date.now() - (w.fetchedAt || 0) > STALE_MS);
    if (!isStale) return;

    // Однодневная рыбалка — суточный максимум/минимум почти бесполезен,
    // важнее как погода меняется в течение самого этого дня, поэтому
    // дополнительно тянем почасовые данные (см. _weatherChartsSection).
    const isSingleDay = trip.startDate === trip.endDate;
    // .catch тут же, не в общем Promise.all ниже: часовой запрос — это
    // третий независимый эндпоинт, и его отдельный сбой (например, только
    // у него легло HTTP) не должен откатывать уже успешно пришедшие
    // summary/daily-данные погоды из-за общего .catch(() => {}).
    const hourlyPromise = isSingleDay
      ? WeatherService.fetchHourlyForTrip(coords.lat, coords.lon, trip.startDate).catch(() => null)
      : Promise.resolve(null);

    Promise.all([
      WeatherService.fetchForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate),
      WeatherService.fetchDailyForTrip(coords.lat, coords.lon, trip.startDate, trip.endDate),
      hourlyPromise
    ]).then(([weather, weatherDaily, weatherHourly]) => {
        if (!weather) {
          // Новые даты вне окна прогноза (дальше ~16 дней) — старый прогноз
          // под прежние даты показывать нельзя, убираем его.
          if (staleDates) {
            trip.weather = null; trip.weatherDaily = null; trip.weatherHourly = null;
            if (typeof TripsData !== 'undefined') TripsData.updateTrip(trip.id, { weather: null, weatherDaily: null, weatherHourly: null });
            const blk = document.getElementById('cover-weather-block');
            if (blk && _tripId === trip.id) blk.outerHTML = _weatherSection(trip);
          }
          return;
        }
        weather.forDates = datesKey;
        trip.weather = weather;
        trip.weatherDaily = weatherDaily || null;
        trip.weatherHourly = weatherHourly || null;
        if (typeof TripsData !== 'undefined') {
          TripsData.updateTrip(trip.id, { weather, weatherDaily: weatherDaily || null, weatherHourly: weatherHourly || null });
        }
        const block = document.getElementById('cover-weather-block');
        if (block && _tripId === trip.id) block.outerHTML = _weatherSection(trip);
        const chartsBlock = document.getElementById('g-weather-charts');
        if (chartsBlock && _tripId === trip.id) chartsBlock.outerHTML = _weatherChartsSection(trip);
        _patchGuideWeather(trip);
      })
      .catch(() => {});
  }

  // Кнопка "Моё местоположение" в блоках погоды — полезна, когда у поездки
  // вообще нет координат (обычная "Рыбалка" без импорта/OSM-поиска рек), или
  // когда человек уже реально на месте и хочет погоду именно отсюда, а не
  // от той точки, что подтянулась при заведении поездки. Once поставлена —
  // становится приоритетным источником координат для этой поездки
  // (см. _tripCoordsInfo) и остаётся, пока не переставят заново или не
  // сбросят кнопкой "Сбросить метку" (_resetWeatherLocation ниже).
  //
  // Раньше это срабатывало сразу по одному нажатию маленькой иконки-булавки,
  // без единого вопроса и без следа в интерфейсе, что именно произошло —
  // у поездки "Ханты" кто-то так один раз подменил погоду на Екатеринбург
  // (видимо, ещё до выезда), и это выглядело как необъяснимый баг. Реальный
  // баг, найден внешним ревью 2026-09-30. Теперь сначала подтверждение,
  // объясняющее, что произойдёт и что это не разово, а до явного сброса.
  function _useMyLocation(tripId, btn) {
    if (!navigator.geolocation) { alert('Геолокация не поддерживается этим браузером'); return; }
    UIUtils.confirmSheet(
      'Погода поездки будет показываться по твоему текущему месту, а не по реке из маршрута — и останется так, пока не нажмёшь «Сбросить метку».',
      { title: 'Погода по моей геопозиции', okLabel: 'Определить место', danger: false }
    ).then(ok => {
      if (ok) _reallyUseMyLocation(tripId, btn);
    });
  }

  function _reallyUseMyLocation(tripId, btn) {
    const origHtml = btn ? btn.innerHTML : '';
    if (btn) { btn.textContent = 'Определяю…'; btn.disabled = true; }
    navigator.geolocation.getCurrentPosition(
      async pos => {
        const trip = TripsData.getById(tripId);
        if (!trip) return;
        const coords = { lat: pos.coords.latitude, lon: pos.coords.longitude };
        trip.weatherCoords = coords;
        trip.weather = null;
        trip.weatherDaily = null;
        await TripsData.updateTrip(tripId, { weatherCoords: coords, weather: null, weatherDaily: null });
        const block = document.getElementById('cover-weather-block');
        if (block && _tripId === tripId) block.outerHTML = _weatherSection(trip);
        const todayEl = document.getElementById('g-today-weather');
        if (todayEl) todayEl.innerHTML = _todayWeatherBlock(trip);
        _maybeRefreshWeather(trip, true);
      },
      err => {
        if (btn) { btn.innerHTML = origHtml; btn.disabled = false; }
        alert('Не удалось определить местоположение: ' + (err.message || 'проверь разрешение геолокации в браузере'));
      },
      { enableHighAccuracy: true, timeout: 10000 }
    );
  }

  // Отменяет метку "Моё местоположение" — возвращает погоду к реке из
  // маршрута (или к "координаты не определены", если рек с координатами
  // нет вовсе). Без этой кнопки залипшую метку было нечем снять, кроме как
  // физически прийти в правильное место и нажать "Моё местоположение" ещё
  // раз оттуда.
  async function _resetWeatherLocation(tripId) {
    const trip = TripsData.getById(tripId);
    if (!trip) return;
    const ok = await UIUtils.confirmSheet('Вернуть прогноз к месту поездки (реке из маршрута)?', { title: 'Сбросить метку', okLabel: 'Сбросить', danger: false });
    if (!ok) return;
    trip.weatherCoords = null;
    trip.weather = null;
    trip.weatherDaily = null;
    trip.weatherHourly = null;
    await TripsData.updateTrip(tripId, { weatherCoords: null, weather: null, weatherDaily: null, weatherHourly: null });
    const block = document.getElementById('cover-weather-block');
    if (block && _tripId === tripId) block.outerHTML = _weatherSection(trip);
    const todayEl = document.getElementById('g-today-weather');
    if (todayEl) todayEl.innerHTML = _todayWeatherBlock(trip);
    _maybeRefreshWeather(trip, true);
  }

  // Проставляет мини-бейджи погоды в уже отрисованный Гид (если он открыт
  // прямо сейчас) — плейсхолдеры для них рендерятся в _renderGuide сразу
  // (пустыми), а заполняются здесь, когда придут данные, без пересборки
  // всей страницы Гида.
  function _patchGuideWeather(trip) {
    if (!trip.weatherDaily || !trip.weatherDaily.length) return;
    const byDate = {};
    trip.weatherDaily.forEach(d => { byDate[d.date] = d; });
    document.querySelectorAll('[data-gwx-date]').forEach(el => {
      const entry = byDate[el.dataset.gwxDate];
      if (entry) el.innerHTML = _dayWeatherBadge(entry);
    });
    const todayEl = document.getElementById('g-today-weather');
    if (todayEl) todayEl.innerHTML = _todayWeatherBlock(trip);
  }

  function _dayWeatherBadge(entry) {
    if (!entry || entry.tMax == null || entry.tMin == null) return '';
    const precip = entry.precip ? ` · ${UIUtils.ico('cloud-rain')}${Math.round(entry.precip * 10) / 10}мм` : '';
    return `${UIUtils.ico('temperature')}${Math.round(entry.tMin)}…${Math.round(entry.tMax)}°${precip}`;
  }

  // Подсказка по клёву на основе народных примет (не научный прогноз!):
  // стабильное давление — хорошо, резкий скачок в любую сторону — плохо,
  // сильный ветер — рыба уходит на глубину, лёгкий дождь — часто оживляет
  // клёв. prevEntry — сосед по тому же trip.weatherDaily (день перед),
  // берём бесплатно из уже загруженного массива, без отдельного запроса.
  function _fishingHint(entry, prevEntry) {
    if (entry.pressure == null) return null;
    let mood = 'ok';
    const parts = [];

    if (prevEntry && prevEntry.pressure != null) {
      const delta = entry.pressure - prevEntry.pressure;
      if (Math.abs(delta) < 1)      { parts.push('давление стабильно — неплохое время для рыбалки'); mood = 'good'; }
      else if (Math.abs(delta) >= 3) { parts.push('давление резко меняется — клёв, вероятно, слабее обычного'); mood = 'bad'; }
      else                            parts.push('давление немного ' + (delta > 0 ? 'растёт' : 'падает') + ' — клёв может быть неровным');
    }

    if (entry.wind != null && entry.wind >= 8) { // 8 м/с — сильный ветер (запрос к Open-Meteo просит wind_speed_unit=ms)
      parts.push('сильный ветер — рыба может уйти на глубину');
      mood = 'bad';
    }
    if (entry.precip != null && entry.precip > 0 && entry.precip <= 3 && mood !== 'bad') {
      parts.push('небольшой дождь часто оживляет клёв');
    }

    if (!parts.length) return null;
    return { mood, text: parts.join('; ') };
  }

  // Стрипаем эмодзи из строки (ряды расписания/заголовки дней AI-импорта).
  function _stripEmoji(s) {
    return String(s).replace(/[\u{1F300}-\u{1FFFF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}\u{FE00}-\u{FE0F}\u{1F900}-\u{1F9FF}\u{231A}-\u{231B}\u{23E9}-\u{23F3}\u{23F8}-\u{23FA}\u{25AA}-\u{25AB}\u{25B6}\u{25C0}\u{25FB}-\u{25FE}\u{2614}-\u{2615}\u{2648}-\u{2653}\u{267F}\u{2693}\u{26A1}\u{26AA}-\u{26AB}\u{26BD}-\u{26BE}\u{26C4}-\u{26C5}\u{26CE}\u{26D4}\u{26EA}\u{26F2}-\u{26F3}\u{26F5}\u{26FA}\u{26FD}\u{2702}\u{2705}\u{2708}-\u{270D}\u{270F}\u{2712}\u{2714}\u{2716}\u{271D}\u{2721}\u{2728}\u{2733}-\u{2734}\u{2744}\u{2747}\u{274C}\u{274E}\u{2753}-\u{2755}\u{2757}\u{2763}-\u{2764}\u{2795}-\u{2797}\u{27A1}\u{27B0}\u{27BF}]/gu, '').replace(/\s+/g, ' ').trim();
  }

  // Строка расписания про саму рыбалку — голубым с рыбкой (макет «Гид — Инфо»).
  const _FISH_SLOT_RE = /рыбал|ловл|зор[яиьею]|клёв|клев|спиннинг|заброс|выход на воду/i;

  function _slotRow(time, text) {
    const clean = _stripEmoji(text);
    const fish = _FISH_SLOT_RE.test(clean);
    return `<div class="tc-slot ${fish ? 'tc-slot--fish' : ''}">
      <span class="tc-slot-time">${_esc(time)}</span>
      <span class="tc-slot-text">${_esc(clean)}</span>
      ${fish ? UIUtils.ico('fishing') : ''}
    </div>`;
  }

  // Индекс дня маршрута на сегодня (дни маршрута — последовательно от
  // trip.startDate, как и матчинг погоды ниже), -1 если сегодня вне маршрута.
  function _todayRouteIdx(trip) {
    const route = trip.importData?.route || [];
    if (!route.length || !trip.startDate) return -1;
    const todayISO = new Date().toISOString().slice(0, 10);
    const idx = Math.round((new Date(todayISO + 'T00:00:00') - new Date(trip.startDate + 'T00:00:00')) / 86400000);
    return idx >= 0 && idx < route.length ? idx : -1;
  }

  // Карточка «Сегодня» вверху Инфо (макет «Гид — Инфо»): погода на
  // сегодняшнюю дату из trip.weatherDaily (та же выборка, что мини-бейджи
  // в «Маршруте») + расписание сегодняшнего дня маршрута, если он есть.
  // Патчится целиком в #g-today-weather (_patchGuideWeather/_useMyLocation).
  function _todayWeatherBlock(trip) {
    const todayISO = new Date().toISOString().slice(0, 10);
    const daily = trip.weatherDaily || [];
    const idx = daily.findIndex(w => w.date === todayISO);
    const entry = idx >= 0 ? daily[idx] : null;
    const hasWx = !!(entry && entry.tMax != null);
    const dayIdx = _todayRouteIdx(trip);
    const routeDay = dayIdx >= 0 ? trip.importData.route[dayIdx] : null;
    if (!hasWx && !routeDay) return '';

    const prevEntry = idx > 0 ? daily[idx - 1] : null;
    const hint = hasWx ? _fishingHint(entry, prevEntry) : null;
    const dateLabel = new Date(todayISO).toLocaleDateString('ru', { day: 'numeric', month: 'long' });
    const title = dateLabel + (routeDay ? ' · ' + _stripEmoji(routeDay.t || '') : '');

    return `
      <section class="tc-card tc-today">
        <div class="tc-today-hd">
          <span class="tc-eyebrow tc-eyebrow--accent">${routeDay ? `Сегодня · день ${dayIdx + 1}` : 'Погода сегодня'}</span>
          ${hasWx ? `<span class="tc-today-temp">${UIUtils.ico('temperature')} ${Math.round(entry.tMin)}…${Math.round(entry.tMax)}°</span>` : ''}
          <button type="button" class="tc-icon-btn" data-action="geo-weather" aria-label="Обновить по моей геопозиции">${UIUtils.ico('map-pin')}</button>
        </div>
        <h2 class="tc-today-title">${_esc(title)}</h2>
        ${hasWx ? `
        <div class="tc-tiles">
          <div class="tc-mini"><span class="tc-mini-lbl">осадки</span><span class="tc-mini-val">${entry.precip ? (Math.round(entry.precip * 10) / 10 + ' мм') : '0 мм'}</span></div>
          <div class="tc-mini"><span class="tc-mini-lbl">ветер</span><span class="tc-mini-val">${entry.wind != null ? Math.round(entry.wind) + ' м/с' : '—'}</span></div>
          <div class="tc-mini"><span class="tc-mini-lbl">давление</span><span class="tc-mini-val">${entry.pressure != null ? Math.round(entry.pressure) + ' гПа' : '—'}</span></div>
          ${(entry.sunrise || entry.sunset) ? `<div class="tc-mini tc-mini--wide"><span class="tc-mini-lbl">Солнце</span><span class="tc-mini-val">${_esc(entry.sunrise || '—')} → ${_esc(entry.sunset || '—')}</span></div>` : ''}
        </div>` : ''}
        ${hint ? `<div class="tc-wx-hint tc-wx-hint--${hint.mood}">${UIUtils.ico('fishing')} ${_esc(hint.text)}</div>` : ''}
        ${routeDay && (routeDay.rows || []).length ? `<div class="tc-slots">${routeDay.rows.map(r => _slotRow(r[0], r[1])).join('')}</div>` : ''}
      </section>`;
  }

  function _addDaysStr(dateStr, n) {
    const d = new Date(dateStr + 'T00:00:00');
    d.setDate(d.getDate() + n);
    return d.toISOString().slice(0, 10);
  }

  // Карточка погоды на обложке (макет V2CoverBefore): 4 показателя + ссылка
  // «По дням» на экран погоды (_showWeatherScreen) + 📍 «моё местоположение».
  function _weatherSection(t) {
    const w = t.weather;
    const info = _tripCoordsInfo(t);
    // Откуда взято место прогноза — раньше это нигде не показывалось,
    // и залипшая метка "Моё местоположение" выглядела так же, как обычная
    // погода по реке, никак не отличить. Реальный баг, найден внешним
    // ревью 2026-09-30.
    const locLabel = info.source === 'manual'
      ? 'Прогноз по метке «Моё местоположение»'
      : (info.source === 'river' && info.riverName ? `Прогноз для: ${info.riverName}` : '');
    const resetBtn = info.source === 'manual'
      ? ` · <button type="button" class="tc-link" data-action="geo-weather-reset">Сбросить</button>` : '';
    if (!w) {
      if (info.coords) return '<div id="cover-weather-block"></div>';
      return `
        <section class="tc-card" id="cover-weather-block">
          <div class="tc-card-head"><h2 class="tc-card-title">Погода</h2></div>
          <div class="tc-hint">Координаты не определены</div>
          <button type="button" class="tc-btn-secondary" data-action="geo-weather">${UIUtils.ico('map-pin')} Моё местоположение</button>
        </section>`;
    }
    const title = w.source === 'forecast' ? 'Прогноз погоды' : 'Погода в поездке';
    const single = t.startDate === t.endDate;
    const hasDetail = (t.weatherDaily && t.weatherDaily.length) || (t.weatherHourly && t.weatherHourly.length);
    const cell = (icon, cls, val, lbl) => `
      <div class="tc-wx-cell"><span class="tc-wx-ic ${cls}">${UIUtils.ico(icon)}</span><span class="tc-wx-val">${val}</span><span class="tc-wx-lbl">${lbl}</span></div>`;
    return `
      <section class="tc-card" id="cover-weather-block">
        <div class="tc-card-head">
          <h2 class="tc-card-title">${title}</h2>
          <div class="tc-head-actions">
            ${hasDetail ? `<button type="button" class="tc-link" data-action="tc-weather-open">${single && t.weatherHourly?.length ? 'По часам' : 'По дням'}</button>` : ''}
            <button type="button" class="tc-icon-btn" data-action="geo-weather" aria-label="Обновить по моей геопозиции">${UIUtils.ico('map-pin')}</button>
          </div>
        </div>
        ${locLabel ? `<div class="tc-hint">${_esc(locLabel)}${resetBtn}</div>` : ''}
        <div class="tc-wx-grid ${w.wind != null ? '' : 'tc-wx-grid--3'}">
          ${cell('temperature', 'tc-c-accent', `${w.tMin}…${w.tMax}°`, 'темп.')}
          ${cell('cloud-rain', 'tc-c-river', `${w.precip} мм`, 'осадки')}
          ${cell('gauge', '', `${w.pressure}`, 'гПа')}
          ${w.wind != null ? cell('wind', '', `${w.wind} м/с`, 'ветер') : ''}
        </div>
      </section>`;
  }

  function _renderCover(trip) {
    document.getElementById('trip-cover')?.remove();

    const el = document.createElement('div');
    el.id = 'trip-cover';
    el.className = 'cover-page';
    el.innerHTML = _render(trip);
    document.body.appendChild(el);

    requestAnimationFrame(() => el.classList.add('visible'));
    _bind(el, trip);
    _patchGearSub(trip);
    _patchGearReady(trip);
  }

  function hide() {
    const el = document.getElementById('trip-cover');
    if (!el) return;
    el.classList.remove('visible');
    setTimeout(() => el.remove(), 350);
  }

  // Обложка (макеты V2CoverBefore / V2CoverAfter): в шапке только «назад» и
  // «изменить» (организатору); статус — плашкой в герое; «позвать» — в ряду
  // участников; снаряга — строкой-карточкой; внизу «Открыть поездку».
  function _render(t) {
    const isOwner = TripsData.canManage(t);
    return `
      <div class="tc-top">
        <button type="button" class="tc-top-btn" id="coverBack" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
        ${isOwner ? `<button type="button" class="tc-top-btn" id="coverEdit" aria-label="Изменить поездку">${UIUtils.ico('pencil')}</button>` : ''}
      </div>

      <div class="cover-scroll">
        ${_hero(t)}
        <div class="tc-stack">
          ${t.status === 'upcoming' && t.readiness ? _readiness(t) : ''}
          ${t.status !== 'done' ? _gearCard(t) : ''}
          <div id="cover-lodging-block">${_lodgingCard(t, 'cover')}</div>
          ${t.status === 'done' ? _doneContent(t) : ''}
          ${_weatherSection(t)}
          ${t.status === 'upcoming' ? _targetFish(t) : ''}
        </div>
      </div>

      <div class="cover-footer">
        <button class="cover-btn-enter" id="coverEnter">Открыть поездку</button>
      </div>`;
  }

  function _hero(t) {
    const dates = _dateRange(t.startDate, t.endDate);
    const location = (t.rivers || []).map(r => r.region).filter((v, i, a) => v && a.indexOf(v) === i).join(', ');
    // Организатор = создатель поездки (trip.ownerId), помечаем рядом с именем.
    const parts = (t.participants || []).map(p => {
      const guest = !p.uid;
      const org = !!p.uid && p.uid === t.ownerId;
      return `<span class="tc-person ${guest ? 'tc-person--guest' : ''}">${_esc(p.name)}${org ? '<span class="tc-person-tag tc-person-tag--org">организатор</span>' : ''}${guest ? '<span class="tc-person-tag">гость</span>' : ''}</span>`;
    }).join('');
    const invite = _canInvite(t)
      ? `<button type="button" class="tc-person tc-person--add" data-action="tc-invite">+ позвать</button>` : '';
    const meta = (icon, text) => `<div class="cover-meta-row">${UIUtils.ico(icon)}<span>${text}</span></div>`;

    return `
      <div class="cover-hero">
        <div class="cover-eyebrow-row">
          <span class="cover-eyebrow">${t.type === 'expedition' ? 'Экспедиция' : 'Рыбалка'}</span>
          ${_countdownChip(t)}
        </div>
        <div class="cover-name ${_nameSizeClass(t.name)}">${_esc(t.name)}</div>
        <div class="cover-meta">
          ${meta('calendar', dates)}
          ${location ? meta('map-pin', _esc(location)) : ''}
          ${t.rivers && t.rivers.length ? meta('ripple', _esc(t.rivers.map(r => r.name).join(', '))) : ''}
        </div>
        ${parts || invite ? `<div class="cover-parts">${parts}${invite}</div>` : ''}
      </div>`;
  }

  // Статус плашкой в строке с типом поездки: «через N дней» / «идёт» /
  // «завершена» (отдельного бейджа в шапке больше нет).
  function _countdownChip(t) {
    if (t.status === 'active') return '<span class="cover-cd-chip cover-cd-chip--now">идёт</span>';
    if (t.status === 'done') return `<span class="cover-cd-chip cover-cd-chip--done">${UIUtils.ico('check')} завершена</span>`;
    if (t.status !== 'upcoming') return '';
    const days = TripsData.daysUntil(t.startDate);
    if (days <= 0) return '';
    return `<span class="cover-cd-chip">через ${days} ${_plural(days, 'день', 'дня', 'дней')}</span>`;
  }

  // Размер заголовка по длине названия (см. «Тест названий» в макетах):
  // до 10 символов — крупно, до 16 — на ступень меньше, дальше — ещё.
  function _nameSizeClass(name) {
    const n = (name || '').length;
    return n <= 10 ? '' : n <= 16 ? 'cover-name--m' : 'cover-name--s';
  }

  function _readiness(t) {
    // Свободный список под конкретную поездку, не фиксированные 6 пунктов —
    // см. TripsData.getDefaultReadiness/DEFAULT_READINESS_ITEMS. Старые
    // документы (объект с фиксированными ключами) нормализует единая точка
    // чтения (modules/trips/firebase.js:_fromDoc), сюда всегда приходит
    // уже массив.
    const items = Array.isArray(t.readiness) ? t.readiness : [];
    const done  = items.filter(it => it.done).length;
    const total = items.length;
    const pct   = total ? Math.round(done / total * 100) : 0;

    return `
      <section class="tc-card" id="coverReadinessSection">
        <div class="tc-card-head">
          <h2 class="tc-card-title">Готовность</h2>
          <span class="cover-read-count" id="coverReadPct">${done} из ${total}</span>
        </div>
        <div class="tc-bar"><div class="tc-bar-fill" id="coverReadFill" style="width:${pct}%"></div></div>
        <div class="cover-read-list" id="coverReadList">
          ${items.filter(it => !it.done).map(it => _coverReadRow(it, t.id)).join('')}
          ${done ? `<details class="cover-read-done" ${done === total ? 'open' : ''}>
            <summary>${UIUtils.ico('check')} Готово · ${done} ${UIUtils.ico('chevron-down', 'tc-sum-chev')}</summary>
            <div class="cover-read-list">${items.filter(it => it.done).map(it => _coverReadRow(it, t.id)).join('')}</div>
          </details>` : ''}
        </div>
        <div class="tc-read-foot">
          <button type="button" class="tc-text-btn tc-text-btn--accent" data-cover-readiness-add="${t.id}">+ Добавить пункт</button>
          ${done ? `<button type="button" class="tc-text-btn" data-cover-readiness-reset="${t.id}">Сбросить отметки</button>` : ''}
        </div>
        ${total ? '<div class="tc-hint">Смахни пункт влево, чтобы удалить</div>' : ''}
      </section>`;
  }

  function _coverReadRow(item, tripId) {
    return `
      <div class="cover-read-row" data-item-id="${_esc(item.id)}">
        <button type="button" class="tc-read-btn" role="checkbox" aria-checked="${item.done ? 'true' : 'false'}"
                data-cover-readiness="${_esc(item.id)}" data-trip-id="${tripId}">
          <span class="tc-check ${item.done ? 'done' : ''}">${item.done ? UIUtils.ico('check') : ''}</span>
          <span class="cover-read-label ${item.done ? 'crossed' : ''}">${_esc(item.label)}</span>
        </button>
        <span class="cover-read-del" role="button" data-cover-readiness-del="${_esc(item.id)}" data-trip-id="${tripId}" aria-label="Удалить пункт">×</span>
      </div>`;
  }

  // Перерисовывает секцию готовности целиком (после add/del — меняется
  // количество строк, точечный патч DOM не годится, в отличие от простого
  // toggle) — находит свежую поездку из кэша и заново вызывает _readiness.
  function _rerenderReadiness(tripId) {
    const section = document.getElementById('coverReadinessSection');
    if (!section) return;
    const t = TripsData.getById(tripId);
    if (!t) return;
    section.outerHTML = _readiness(t);
  }

  // Новый пункт готовности — маленький лист вместо prompt().
  function _showAddReadinessSheet(tripId) {
    const trip = TripsData.getById(tripId);
    const overlay = _openSheet('add-readiness-overlay', 'Новый пункт', trip?.name || '',
      `<input type="text" class="tc-input" id="add-readiness-input" placeholder="Заправка канистр, бронь домика…" autocomplete="off">`,
      { footer: '<button type="button" class="tc-btn-primary" data-action="add-readiness-save">Добавить</button>' });
    const input = overlay.querySelector('#add-readiness-input');
    input?.focus();

    const save = () => {
      const label = input?.value.trim();
      if (!label) { input?.focus(); return; }
      const t = TripsData.getById(tripId);
      if (!Array.isArray(t?.readiness)) { overlay.remove(); return; }
      t.readiness = [...t.readiness, { id: 'r_' + Date.now() + '_' + Math.random().toString(36).slice(2), label, done: false }];
      TripsData.updateTrip(tripId, { readiness: t.readiness });
      overlay.remove();
      _rerenderReadiness(tripId);
      if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
    };
    input?.addEventListener('keydown', e => { if (e.key === 'Enter') save(); });
    overlay.addEventListener('click', e => {
      if (e.target.closest('[data-action="add-readiness-save"]')) save();
    });
  }

  // ── Строки-ссылки (иконка-плитка, заголовок, подпись, шеврон) ──
  function _linkRow(o) {
    const tag = o.action ? 'button' : 'div';
    return `<${tag} ${o.action ? 'type="button"' : ''} class="tc-link-row" ${o.action ? `data-action="${o.action}"` : ''} ${o.attrs || ''}>
      <span class="tc-tile ${o.tone ? 'tc-tile--' + o.tone : ''}">${o.icon === 'fishing' ? UIUtils.ico('fishing') : UIUtils.ico(o.icon)}</span>
      <span class="tc-link-main"><span class="tc-link-title">${o.title}</span>${o.sub ? `<span class="tc-link-sub" ${o.subAttrs || ''}>${o.sub}</span>` : ''}</span>
      <span class="tc-link-right">${o.right || ''}${o.action ? UIUtils.ico(o.chev || 'chevron-right') : ''}</span>
    </${tag}>`;
  }

  // Снаряга — свой список под эту поездку (раньше иконка в шапке обложки /
  // слово «Снаряга» в полоске табов у Рыбалки). Подпись «собрано X из Y»
  // дотягивается асинхронно — см. _patchGearSub.
  function _gearRow(t) {
    return _linkRow({
      action: 'info-gear', icon: 'backpack', tone: t.status === 'done' ? '' : 'accent',
      title: t.status === 'done' ? 'Снаряга' : 'Снаряга на поездку',
      // «собрано X из Y» и «· готовы N из M» — внутри той же строки карточки
      // (раньше готовность висела отдельной строкой под карточкой).
      sub: `<span data-gear-sub="${_esc(t.id)}">${t.status === 'done' ? 'что брали в поездку' : 'свой список на эту поездку'}</span><span id="g-gear-ready-sub"></span>`,
    });
  }

  // «Собраны N из M» — под карточкой снаряги, id общий (карточка либо на
  // обложке экспедиции, либо в Инфо рыбалки — никогда не обе разом).
  function _gearCard(t) {
    return `<section class="tc-card tc-card--list">${_gearRow(t)}</section>`;
  }

  function _patchGearSub(t) {
    const uid = window.APP?.user?.uid;
    if (!uid || typeof GearData === 'undefined' || t.status === 'done') return;
    GearData.ensureLoaded(uid).then(() => {
      const snap = GearData.getTripSnapshot(uid, t.id);
      const text = snap
        ? `собрано ${Math.min((snap.checked || []).length, (snap.items || []).length)} из ${(snap.items || []).length}`
        : 'список ещё не создан';
      document.querySelectorAll(`[data-gear-sub="${t.id}"]`).forEach(el => { el.textContent = text; });
    }).catch(() => {});
  }

  // «Собраны N из M» (участники поездки, отметившие себя готовыми в общем
  // списке снаряги) — gear_trip_shared/{tripId}.ready, {uid: bool}, договорённость
  // с модулем gear (см. BRIEF2.md). Читаем один раз при показе обложки/Инфо,
  // не живая подписка — не так критично, как сам список снаряги.
  function _patchGearReady(t) {
    const participants = (t.participants || []).filter(p => p.uid);
    if (!participants.length) return;
    firebase.firestore().collection('gear_trip_shared').doc(t.id).get().then(doc => {
      const ready = (doc.exists && doc.data().ready) || {};
      const n = participants.filter(p => ready[p.uid]).length;
      const el = document.getElementById('g-gear-ready-sub');
      if (el) el.textContent = ` · готовы ${n} из ${participants.length}`;
    }).catch(() => {});
  }

  // «Как съездили?» — 10 кнопок вместо листа с числом (макет V2CoverAfter).
  // Повторный тап по выбранной оценке — снять оценку (как пустое поле раньше).
  function _ratingCard(t) {
    const btns = Array.from({ length: 10 }, (_, i) => i + 1).map(v =>
      `<button type="button" class="tc-rate-btn ${t.rating === v ? 'on' : ''}" data-action="tc-rate" data-val="${v}" aria-pressed="${t.rating === v}" aria-label="Оценка ${v}">${v}</button>`).join('');
    return `
      <section class="tc-card tc-rate-card">
        <div class="tc-card-head">
          <h2 class="tc-card-title">Как съездили?</h2>
          ${t.rating != null ? `<span class="tc-rate-val">${t.rating}<span>/10</span></span>` : ''}
        </div>
        <div class="tc-card-sub">Оценка поездки по 10-балльной шкале</div>
        <div class="tc-rate-grid">${btns}</div>
      </section>`;
  }

  function _setRating(trip, v) {
    const val = trip.rating === v ? null : v;
    trip.rating = val;
    TripsData.updateTrip(trip.id, { rating: val });
    document.querySelectorAll('.tc-rate-card').forEach(el => { el.outerHTML = _ratingCard(trip); });
  }

  function _numRows(title, items) {
    if (!items || !items.length) return '';
    return `<div class="tc-caps">${_esc(title)}</div>
      ${items.map(i => `<div class="tc-num-row"><span>${_esc(i.name)}</span><span class="tc-num">${i.count}</span></div>`).join('')}`;
  }

  function _doneContent(t) {
    let h = '';
    const isDone = t.status === 'done';

    if (isDone) h += _ratingCard(t);

    // Улов — живые данные (modules/catches/state.js), не старое статичное t.fish
    const stats = typeof CatchesState !== 'undefined' ? CatchesState.computeStats(t.id) : null;
    if (stats && stats.total) {
      const rel = stats.released === stats.total ? ' · все отпущены'
        : stats.kept === stats.total ? ' · все забрали'
        : stats.released ? ` · отпущено ${stats.released}` : '';
      h += `
        <section class="tc-card">
          <div class="tc-card-head">
            <h2 class="tc-card-title">Улов</h2>
            <button type="button" class="tc-link" data-action="tc-open-tab" data-tab="catches">Весь улов</button>
          </div>
          <div class="tc-big-row">
            <span class="tc-big">${stats.total}</span>
            <span class="tc-big-sub">${_plural(stats.total, 'рыба', 'рыбы', 'рыб')} · ${stats.species} ${_plural(stats.species, 'вид', 'вида', 'видов')}${rel}</span>
          </div>
          <div class="tc-num-list">
            ${_numRows('По видам', stats.topFish)}
            ${_numRows('Кто поймал', stats.topMembers)}
            ${_numRows('Где', stats.topRivers)}
          </div>
        </section>`;
    }

    // Расходы — живые данные (modules/expenses/state.js): строка-ссылка во
    // вкладку «Расходы» + раскрывашка с разбивкой по людям и переводами
    // (та же сводка, что была отдельной карточкой).
    const money = typeof ExpensesState !== 'undefined' ? ExpensesState.computeSummary(t.id) : null;
    let rows = '';
    if (money && money.total) {
      rows += _linkRow({
        action: 'tc-open-tab', attrs: 'data-tab="expenses"', icon: 'wallet', tone: 'accent', title: 'Расходы',
        sub: `${money.count} ${_plural(money.count, 'запись', 'записи', 'записей')} · на человека ${_rub(money.avgShare)}`,
        right: `<span class="tc-link-sum">${_rub(money.total)}</span>`,
      });
      rows += `
        <details class="tc-money">
          <summary>Кто сколько заплатил${money.transfers.length ? ' · переводы' : ''} ${UIUtils.ico('chevron-down', 'tc-sum-chev')}</summary>
          ${money.rows.map(r => {
            const sign = r.netDiff >= 0 ? '+' : '−';
            const cls  = r.netDiff >= 0 ? 'pos' : 'neg';
            return `
              <div class="cover-money-row">
                <div class="cover-money-name">${_esc(r.name)}</div>
                <div class="cover-money-meta">заплатил ${_rub(r.paid)}</div>
                <div class="cover-money-diff cover-money-diff--${cls}">${sign}${_rub(Math.abs(Math.round(r.netDiff)))}</div>
              </div>`;
          }).join('')}
          ${money.transfers.length ? `
            <div class="cover-money-transfers">
              ${money.transfers.map(tr => `
                <div class="cover-money-transfer">${_esc(tr.from)} → ${_esc(tr.to)} · ${_rub(tr.amount)}</div>`).join('')}
            </div>` : ''}
        </details>`;
    }
    if (isDone) {
      rows += _linkRow({ action: 'tc-open-notes', icon: 'notes', title: 'Заметки', sub: 'заметки группы' });
      rows += _gearRow(t);
    }
    if (rows) h += `<section class="tc-card tc-card--list">${rows}</section>`;

    // Итоговый комментарий к поездке (trip.comment)
    if (t.comment) {
      h += `
        <section class="tc-card">
          <div class="tc-card-head">
            <h2 class="tc-card-title">Итоги поездки</h2>
            <button type="button" class="tc-link" data-action="edit-comment">Изменить</button>
          </div>
          <div class="tc-comment">${_esc(t.comment)}</div>
        </section>`;
    }

    return h;
  }

  // Катмул-Ром → кубический Безье — сглаживает ломаную из точек в мягкую
  // кривую без единой сторонней библиотеки (её на этот случай тащить не
  // за чем). Классика для таких мини-графиков.
  function _smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return `M${pts[0][0]},${pts[0][1]}`;
    let d = `M${pts[0][0]},${pts[0][1]}`;
    for (let i = 0; i < pts.length - 1; i++) {
      const p0 = pts[i - 1] || pts[i];
      const p1 = pts[i];
      const p2 = pts[i + 1];
      const p3 = pts[i + 2] || p2;
      const c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      const c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ` C${c1x},${c1y} ${c2x},${c2y} ${p2[0]},${p2[1]}`;
    }
    return d;
  }

  // ── Мини-графики погоды по дням, без внешних библиотек — обычный inline
  // SVG. Плавная кривая (Катмул-Ром) с градиентной заливкой под ней — вид
  // как в погоде Apple. Один ряд — заливка от линии до нуля; два ряда
  // (макс/мин температуры) — заливка полосой между ними. Работает и на
  // одной точке (однодневная рыбалка) — рисует просто маркер со значением.
  function _areaChartSvg(series, opts) {
    opts = opts || {};
    const width = opts.width || 280, chartH = opts.height || 72, pad = 8, labelSpace = 18;
    const axisH = opts.axis ? 16 : 0;
    const arrowH = opts.directions ? 18 : 0;
    const height = chartH + axisH + arrowH;
    const allVals = series.flatMap(s => s.values).filter(v => v != null);
    if (!allVals.length) return '';
    const n = Math.max(...series.map(s => s.values.length));
    const min = opts.min != null ? Math.min(opts.min, ...allVals) : Math.min(...allVals);
    const max = Math.max(...allVals);
    const range = max - min || 1;
    const x = i => n > 1 ? (i / (n - 1)) * (width - pad * 2) + pad : width / 2;
    const y = v => chartH - pad - ((v - min) / range) * (chartH - pad * 2 - labelSpace);
    const baseY = chartH - pad;
    const fmt = opts.fmt || (v => Math.round(v));
    const labelEvery = opts.labelEvery || 1;
    const gid = 'gchart_' + Math.random().toString(36).slice(2);

    const pointsFor = s => s.values.map((v, i) => v != null ? [x(i), y(v)] : null).filter(Boolean);

    let defs, fill, lines = '', labels = '';

    if (series.length === 2) {
      // Полоса между макс и мин — как ленты температуры в аппловой погоде.
      const ptsTop = pointsFor(series[0]);
      const ptsBot = pointsFor(series[1]);
      const pathTop = _smoothPath(ptsTop);
      const pathBotRev = _smoothPath([...ptsBot].reverse()).replace('M', 'L');
      defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${series[0].color}" stop-opacity="0.3"/>
        <stop offset="100%" stop-color="${series[1].color}" stop-opacity="0.08"/>
      </linearGradient>`;
      fill = ptsTop.length > 1
        ? `<path d="${pathTop} ${pathBotRev} Z" fill="url(#${gid})" stroke="none"/>`
        : '';
      lines = `<path d="${pathTop}" fill="none" stroke="${series[0].color}" stroke-width="2" stroke-linecap="round"/>`
             + `<path d="${_smoothPath(ptsBot)}" fill="none" stroke="${series[1].color}" stroke-width="2" stroke-linecap="round"/>`;
    } else {
      const s = series[0];
      const pts = pointsFor(s);
      const path = _smoothPath(pts);
      defs = `<linearGradient id="${gid}" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="${s.color}" stop-opacity="0.35"/>
        <stop offset="100%" stop-color="${s.color}" stop-opacity="0"/>
      </linearGradient>`;
      fill = pts.length > 1
        ? `<path d="${path} L${pts[pts.length - 1][0]},${baseY} L${pts[0][0]},${baseY} Z" fill="url(#${gid})" stroke="none"/>`
        : '';
      lines = `<path d="${path}" fill="none" stroke="${s.color}" stroke-width="2" stroke-linecap="round"/>`;
    }

    // Крайние подписи центрированным text-anchor вылезали бы за viewBox
    // и обрезались (первая цифра пропадала) — у краёв якорим к точке
    // изнутри графика, а не по центру. labelEvery прореживает подписи на
    // плотных графиках — сама кривая всё равно идёт через каждую точку,
    // подписаны только некоторые (раньше ещё насильно подписывалась самая
    // последняя точка независимо от labelEvery — из-за этого на часовых
    // графиках подписи у самого края слипались, теперь чисто по шагу).
    series.forEach(s => {
      s.values.forEach((v, i) => {
        if (v == null || i % labelEvery !== 0) return;
        const anchor = i === 0 && n > 1 ? 'start' : (i === n - 1 && n > 1 ? 'end' : 'middle');
        labels += `<circle cx="${x(i)}" cy="${y(v)}" r="2.5" fill="${s.color}"/>`
                +  `<text x="${x(i)}" y="${y(v) - 8}" font-size="10" fill="${s.color}" text-anchor="${anchor}">${fmt(v)}</text>`;
      });
    });

    // Встроенная в тот же SVG шкала времени/дат снизу — только когда явно
    // просят (opts.axis), иначе ось рисуется отдельным HTML-блоком под
    // графиком (см. _weatherChartsSection) как и было для дневного вида.
    let axisSvg = '';
    if (opts.axis) {
      const ticks = opts.axis;
      axisSvg = ticks.map((lbl, i) => {
        if (lbl == null) return '';
        const anchor = i === 0 ? 'start' : (i === ticks.length - 1 ? 'end' : 'middle');
        return `<text x="${x(i)}" y="${chartH + 12}" font-size="9" fill="var(--label4)" text-anchor="${anchor}">${_esc(lbl)}</text>`;
      }).join('');
    }

    // Стрелки направления ветра — своя строка над самим графиком, не
    // привязана к шкале скорости (это два разных измерения). 0° = север,
    // стрелка смотрит туда, откуда дует ветер (как флюгер).
    let arrowsSvg = '';
    if (opts.directions) {
      // Вогнутое основание вместо ровного треугольника — читается как
      // стрелка/флюгер, а не как одинаковая со всех сторон фигура.
      arrowsSvg = opts.directions.map((deg, i) => {
        if (deg == null || i % labelEvery !== 0) return '';
        return `<path d="M0,-7 L2.2,2 L0,0.3 L-2.2,2 Z" fill="var(--label3)" transform="translate(${x(i)},9) rotate(${deg})"/>`;
      }).join('');
    }

    return `<svg viewBox="0 0 ${width} ${height}" width="${opts.fixedWidth ? width : '100%'}" height="${height}" preserveAspectRatio="none">
      ${arrowsSvg}
      <g transform="translate(0,${arrowH})"><defs>${defs}</defs>${fill}${lines}${labels}${axisSvg}</g>
    </svg>`;
  }

  function _weatherChartsDaily(daily) {
    // Подпись по каждому дню, а не только по первому/последнему — месяц
    // указываем только там, где он меняется, чтобы не повторять его на
    // каждой отметке. Точки на самом графике идут вровень (x = i/(n-1)),
    // поэтому space-between даёт подписи ровно под своими точками.
    let _prevMonth = null;
    const axis = `<div class="g-chart-axis">${daily.map(d => {
      const dt = new Date(d.date + 'T00:00:00');
      const m = dt.getMonth();
      const showMonth = m !== _prevMonth;
      _prevMonth = m;
      const label = dt.getDate() + (showMonth ? ' ' + MONTHS_GEN[m].slice(0, 3) : '');
      return `<span>${_esc(label)}</span>`;
    }).join('')}</div>`;

    const tempChart = _areaChartSvg([
      { values: daily.map(d => d.tMax), color: 'var(--orange)' },
      { values: daily.map(d => d.tMin), color: 'var(--accent)' },
    ]);
    const precipChart = _areaChartSvg(
      [{ values: daily.map(d => d.precip || 0), color: 'var(--accent)' }],
      { min: 0, fmt: v => Math.round(v * 10) / 10 }
    );
    const hasWind = daily.some(d => d.wind != null);
    const hasPressure = daily.some(d => d.pressure != null);
    const windChart = hasWind ? _areaChartSvg([{ values: daily.map(d => d.wind), color: 'var(--label2)' }], { min: 0 }) : '';
    const pressureChart = hasPressure ? _areaChartSvg([{ values: daily.map(d => d.pressure), color: 'var(--label2)' }]) : '';

    return `
      <div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('temperature')} Температура, °C (макс/мин)</div>${tempChart}${axis}</div>
      <div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('cloud-rain')} Осадки, мм</div>${precipChart}${axis}</div>
      ${windChart ? `<div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('wind')} Ветер, м/с</div>${windChart}${axis}</div>` : ''}
      ${pressureChart ? `<div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('gauge')} Давление, гПа</div>${pressureChart}${axis}</div>` : ''}`;
  }

  // Однодневная поездка — сутки уже сегодня/завтра, макс/мин за весь день
  // почти ничего не говорит (день один, сравнивать не с чем), а вот как
  // погода поменяется в течение дня — как раз то, что нужно перед
  // выездом. 280px на 24 часа зажимало точки в ~11px друг от друга — не
  // влезала подпись даже раз в 3 часа. Вместо сжатия — честная ширина по
  // часу (44px на точку) и горизонтальный скролл, как часовая лента в
  // погоде Apple; подписан каждый час, ничего не прорежено.
  function _weatherChartsHourly(hourly) {
    const HOUR_W = 44;
    const chartWidth = hourly.length * HOUR_W;
    const ticks = hourly.map(h => String(parseInt(h.time, 10)));
    const chartOpts = { axis: ticks, width: chartWidth, fixedWidth: true };

    const tempChart = _areaChartSvg([{ values: hourly.map(h => h.temp), color: 'var(--orange)' }], chartOpts);
    const precipChart = _areaChartSvg(
      [{ values: hourly.map(h => h.precip || 0), color: 'var(--accent)' }],
      { ...chartOpts, min: 0, fmt: v => Math.round(v * 10) / 10 }
    );
    const hasWind = hourly.some(h => h.wind != null);
    const hasDir  = hourly.some(h => h.windDir != null);
    const hasPressure = hourly.some(h => h.pressure != null);
    const windChart = hasWind ? _areaChartSvg(
      [{ values: hourly.map(h => h.wind), color: 'var(--label2)' }],
      { ...chartOpts, min: 0, directions: hasDir ? hourly.map(h => h.windDir) : null }
    ) : '';
    const pressureChart = hasPressure ? _areaChartSvg([{ values: hourly.map(h => h.pressure), color: 'var(--label2)' }], chartOpts) : '';

    const wrap = svg => svg ? `<div class="g-chart-scroll">${svg}</div>` : '';

    return `
      <div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('temperature')} Температура, °C</div>${wrap(tempChart)}</div>
      <div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('cloud-rain')} Осадки, мм</div>${wrap(precipChart)}</div>
      ${windChart ? `<div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('wind')} Ветер, м/с</div>${wrap(windChart)}</div>` : ''}
      ${pressureChart ? `<div class="g-chart-block"><div class="g-chart-label">${UIUtils.ico('gauge')} Давление, гПа</div>${wrap(pressureChart)}</div>` : ''}`;
  }

  // Примета по клёву для таба "Инфо" — переиспользует _fishingHint (та же
  // логика, что и в "Погода сегодня" для маршрута экспедиций), только
  // пересчитанную на диапазон дат самой поездки, а не обязательно
  // "сегодня" — рыбалка чаще всего уже прошла или ещё впереди, не идёт
  // прямо в момент просмотра. Для однодневной поездки с почасовыми данными
  // сравниваем среднее давление первой и второй половины дня; для
  // многодневной — последний день поездки с первым.
  function _pressureHintForTrip(trip) {
    const isSingleDay = trip.startDate === trip.endDate;
    const avg = arr => {
      const v = arr.filter(x => x != null);
      return v.length ? v.reduce((a, b) => a + b, 0) / v.length : null;
    };
    if (isSingleDay && trip.weatherHourly && trip.weatherHourly.length >= 4) {
      const h = trip.weatherHourly;
      const mid = Math.floor(h.length / 2);
      const prevEntry = { pressure: avg(h.slice(0, mid).map(x => x.pressure)) };
      const entry = {
        pressure: avg(h.slice(mid).map(x => x.pressure)),
        wind:     Math.max(...h.map(x => x.wind || 0)),
        precip:   h.reduce((s, x) => s + (x.precip || 0), 0),
      };
      return _fishingHint(entry, prevEntry);
    }
    if (trip.weatherDaily && trip.weatherDaily.length >= 2) {
      const d = trip.weatherDaily;
      return _fishingHint(d[d.length - 1], d[0]);
    }
    return null;
  }

  // Строка «Погода по дням и часам» в карточке «Справочное» Инфо — открывает
  // полноэкранный экран погоды (_showWeatherScreen, макет V2Weather) вместо
  // прежнего аккордеона с 4 графиками. Примета по клёву — подписью строки,
  // всегда на виду. Данные уже загружены (_maybeRefreshWeather), отсюда
  // запросов нет. Без данных — пустой плейсхолдер с тем же id, чтобы
  // _maybeRefreshWeather мог подменить его, когда данные придут.
  function _weatherChartsSection(trip) {
    const isSingleDay = trip.startDate === trip.endDate;
    const hourly = trip.weatherHourly;
    const daily = trip.weatherDaily;

    let title;
    if (isSingleDay && hourly && hourly.length) title = 'Погода по часам';
    else if (daily && daily.length) title = 'Погода по дням и часам';
    else return '<div id="g-weather-charts"></div>';

    const hint = _pressureHintForTrip(trip);
    return `<div id="g-weather-charts">${_linkRow({
      action: 'tc-weather-open', icon: 'gauge', tone: 'river', title,
      sub: hint ? `<span class="tc-wx-hint--${hint.mood}">${_esc(hint.text)}</span>` : 'графики температуры, осадков, ветра, давления',
    })}</div>`;
  }

  // ── Экран «Погода» (макет V2Weather): выбранный день крупно, список дней
  // (тап — выбрать), ниже прежние графики по дням. Однодневная рыбалка —
  // почасовые графики (почасовых данных у многодневных поездок нет, их не
  // придумываем). Полноэкранный слой поверх обложки/Гида.
  let _wxSel = 0;

  function _wxDayLabel(dateStr, long) {
    const d = new Date(dateStr + 'T00:00:00');
    return long
      ? d.toLocaleDateString('ru', { weekday: 'short', day: 'numeric', month: 'long' })
      : d.toLocaleDateString('ru', { weekday: 'short' }) + ' ' + d.getDate();
  }

  function _weatherScreenBody(trip) {
    const single = trip.startDate === trip.endDate;
    const hourly = trip.weatherHourly || [];
    const daily = trip.weatherDaily || [];
    const mm = v => (v ? Math.round(v * 10) / 10 : 0) + ' мм';
    let h = '';

    if (single && hourly.length) {
      const hint = _pressureHintForTrip(trip);
      h += `
        <section class="tc-card">
          <div class="tc-card-head"><h2 class="tc-card-title">${_esc(_wxDayLabel(trip.startDate, true))}</h2><span class="tc-muted">по часам</span></div>
          <div class="tc-charts">${_weatherChartsHourly(hourly)}</div>
          ${hint ? `<div class="tc-wx-hint tc-wx-hint--${hint.mood}">${UIUtils.ico('fishing')} ${_esc(hint.text)}</div>` : ''}
        </section>`;
    }

    if (daily.length) {
      const i = Math.min(Math.max(_wxSel, 0), daily.length - 1);
      const e = daily[i];
      if (!(single && hourly.length)) {
        const hint = _fishingHint(e, i > 0 ? daily[i - 1] : null);
        h += `
          <section class="tc-card">
            <div class="tc-card-head"><h2 class="tc-card-title">${_esc(_wxDayLabel(e.date, true))}</h2><span class="tc-muted">за день</span></div>
            <div class="tc-big-row"><span class="tc-big">${e.tMin != null ? Math.round(e.tMin) + '…' + Math.round(e.tMax) + '°' : '—'}</span></div>
            <div class="tc-tiles">
              <div class="tc-mini"><span class="tc-mini-lbl">давление</span><span class="tc-mini-val">${e.pressure != null ? Math.round(e.pressure) + ' гПа' : '—'}</span></div>
              <div class="tc-mini"><span class="tc-mini-lbl">ветер</span><span class="tc-mini-val">${e.wind != null ? Math.round(e.wind) + ' м/с' : '—'}</span></div>
              <div class="tc-mini"><span class="tc-mini-lbl">осадки</span><span class="tc-mini-val">${mm(e.precip)}</span></div>
              ${(e.sunrise || e.sunset) ? `<div class="tc-mini tc-mini--wide"><span class="tc-mini-lbl">Солнце</span><span class="tc-mini-val">${_esc(e.sunrise || '—')} → ${_esc(e.sunset || '—')}</span></div>` : ''}
            </div>
            ${hint ? `<div class="tc-wx-hint tc-wx-hint--${hint.mood}">${UIUtils.ico('fishing')} ${_esc(hint.text)}</div>` : ''}
          </section>`;
      }
      h += `
        <section class="tc-card tc-card--list">
          <div class="tc-wday tc-wday--head"><span>день</span><span>темп.</span><span>осадки</span><span>ветер</span></div>
          ${daily.map((d, k) => `
            <button type="button" class="tc-wday ${k === i ? 'on' : ''}" data-action="tc-wx-day" data-idx="${k}" aria-pressed="${k === i}">
              <span class="tc-wday-d">${_esc(_wxDayLabel(d.date))}</span>
              <span class="tc-wday-t">${d.tMin != null ? Math.round(d.tMin) + '…' + Math.round(d.tMax) + '°' : '—'}</span>
              <span class="tc-c-river">${mm(d.precip)}</span>
              <span class="tc-muted">${d.wind != null ? Math.round(d.wind) + ' м/с' : '—'}</span>
            </button>`).join('')}
        </section>`;
      if (daily.length > 1) {
        h += `
          <section class="tc-card">
            <div class="tc-card-head"><h2 class="tc-card-title">Графики по дням</h2></div>
            <div class="tc-charts">${_weatherChartsDaily(daily)}</div>
          </section>`;
      }
    }
    return h || '<div class="tc-hint">Данных о погоде пока нет</div>';
  }

  function _showWeatherScreen(trip) {
    document.getElementById('tc-wx-screen')?.remove();
    const todayISO = new Date().toISOString().slice(0, 10);
    _wxSel = Math.max(0, (trip.weatherDaily || []).findIndex(d => d.date === todayISO));
    const place = (trip.rivers || [])[0]?.name || '';

    const el = document.createElement('div');
    el.id = 'tc-wx-screen';
    el.className = 'tc-wx-screen';
    el.innerHTML = `
      <div class="tc-top tc-top--title">
        <button type="button" class="tc-top-btn" data-action="tc-wx-close" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
        <div class="tc-ghead-titles">
          <div class="tc-ghead-title">Погода</div>
          <div class="tc-ghead-sub">${_esc([trip.name, place].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
      <div class="tc-wx-body tc-stack">${_weatherScreenBody(trip)}</div>`;
    document.body.appendChild(el);
    requestAnimationFrame(() => el.classList.add('visible'));

    el.addEventListener('click', e => {
      if (e.target.closest('[data-action="tc-wx-close"]')) {
        el.classList.remove('visible');
        setTimeout(() => el.remove(), 350);
        return;
      }
      const day = e.target.closest('[data-action="tc-wx-day"]');
      if (day) {
        _wxSel = parseInt(day.dataset.idx, 10) || 0;
        el.querySelector('.tc-wx-body').innerHTML = _weatherScreenBody(trip);
      }
    });
  }

  // Таб "Инфо" для простой "Рыбалки" (без AI-импорта) — обложки у рыбалок
  // нет (см. show()), всё, что было на ней, живёт здесь: герой с участниками
  // и «+ позвать», снаряга, погода/Windy, итоги (оценка/улов/расходы/заметка).
  function _renderFishingInfo(trip) {
    const hasComment = !!trip.comment;
    const windy = _windyAccordion(trip);
    const wx = _weatherChartsSection(trip);

    return `
      ${_hero(trip)}
      <div class="tc-stack">
        <div id="g-today-weather">${_todayWeatherBlock(trip)}</div>
        ${trip.status !== 'done' ? _gearCard(trip) : ''}
        ${_doneContent(trip)}
        ${(windy || _tripCoords(trip) || trip.weatherDaily) ? `<section class="tc-card tc-card--list">${wx}${windy}</section>` : ''}
        ${!hasComment ? `<button type="button" class="tc-add-dashed" data-action="info-add-comment">+ Итоги поездки</button>` : ''}
      </div>
    `;
  }

  function _targetFish(t) {
    // Берём целевую рыбу из importData (поле targetFish из meta)
    const fish = t.importData?.meta?.targetFish || t.targetFish || null;
    // Если есть реки из importData — показываем их краткий список
    const rivers = t.importData?.rivers || t.rivers || [];
    if (!rivers.length && !fish) return '';

    return `
      <section class="tc-card">
        <div class="tc-card-head">
          <h2 class="tc-card-title">Маршрут</h2>
          ${_isAiImport(t.importData) ? '<span class="tc-muted">импортирован ИИ</span>' : ''}
        </div>
        ${rivers.slice(0, 4).map(r => `
          <div class="tc-river">
            <span class="tc-tile tc-tile--river">${UIUtils.ico('ripple')}</span>
            <span class="tc-link-main"><span class="tc-link-title">${_esc(r.name)}</span>${(r.day || r.type || r.region) ? `<span class="tc-link-sub">${_esc(r.day || r.type || r.region)}</span>` : ''}</span>
          </div>`).join('')}
        ${rivers.length > 4 ? `<div class="tc-hint">+ ещё ${rivers.length - 4} ${_pluralRiver(rivers.length - 4)}</div>` : ''}
        ${fish ? `
          <div class="tc-kv"><span class="tc-muted">Целевая рыба</span><span class="tc-kv-val">${_esc(fish)}</span></div>` : ''}
      </section>`;
  }

  function _pluralRiver(n) {
    return _plural(n, 'река', 'реки', 'рек');
  }

  // Снаряга — свой список под эту поездку (общий для обложки и Инфо рыбалки).
  async function _onGearClick(trip, fromCover) {
    const uid = window.APP?.user?.uid;
    if (!uid || typeof GearData === 'undefined') return;
    await GearData.ensureLoaded(uid);
    if (GearData.hasTripSnapshot(uid, trip.id)) {
      if (fromCover) hide();
      _openGear(trip.id);
    } else {
      _showGearSourcePicker(trip);
    }
  }

  // Перейти на вкладку Гида (ссылки «Весь улов», «Расходы», «Заметки» с
  // обложки и из Инфо). С обложки — сначала войти в поездку.
  function _openTripTab(tripId, tab, scrollToId) {
    const trip = TripsData.getById(tripId);
    if (!trip) return;
    const inGuide = _tripId === tripId && document.getElementById('g-tabstrip') && !document.getElementById('trip-cover');
    if (!inGuide) { hide(); enterTrip(tripId); }
    if (tab !== 'info' || _activeGuideTab !== 'info') _mountGuideTab(trip, tab);
    if (scrollToId) {
      requestAnimationFrame(() => document.getElementById(scrollToId)?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
    }
  }

  function _bind(el, trip) {
    // Реальный "назад" (не просто закрыть оверлей) — раз обложка теперь
    // сама пушит запись в историю (см. _pushTripHistory), кнопка должна
    // её же и попнуть, а не звать hide() напрямую в обход history.state
    // (иначе history.state продолжит врать, что обложка ещё открыта).
    el.querySelector('#coverBack')?.addEventListener('click', () => history.back());

    // Редактировать поездку
    el.querySelector('#coverEdit')?.addEventListener('click', () => {
      hide();
      if (typeof TripsIndex !== 'undefined') TripsIndex.showEdit(_tripId);
    });

    // Удаление пункта готовности — свайпом влево, не крестиком у чекбокса.
    UIUtils.swipeToDelete(el, '.cover-read-row', '.cover-read-del');
    // Готовность: чекбокс (переключить), свайп-«Удалить», + добавить, сброс
    el.addEventListener('click', e => {
      const check = e.target.closest('[data-cover-readiness]');
      if (check) {
        const itemId = check.dataset.coverReadiness;
        const tripId = check.dataset.tripId;
        const t      = TripsData.getById(tripId);
        const item   = Array.isArray(t?.readiness) ? t.readiness.find(it => it.id === itemId) : null;
        if (!item) return;
        item.done = !item.done;
        TripsData.updateTrip(tripId, { readiness: t.readiness });
        // Пункт переезжает между «осталось» и свёрнутым «готово» — перерисовка секции.
        _rerenderReadiness(tripId);
        if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
        return;
      }

      const delBtn = e.target.closest('[data-cover-readiness-del]');
      if (delBtn) {
        const itemId = delBtn.dataset.coverReadinessDel;
        const tripId = delBtn.dataset.tripId;
        const t = TripsData.getById(tripId);
        if (!Array.isArray(t?.readiness)) return;
        t.readiness = t.readiness.filter(it => it.id !== itemId);
        TripsData.updateTrip(tripId, { readiness: t.readiness });
        _rerenderReadiness(tripId);
        if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
        return;
      }

      const addBtn = e.target.closest('[data-cover-readiness-add]');
      if (addBtn) {
        _showAddReadinessSheet(addBtn.dataset.coverReadinessAdd);
        return;
      }

      const resetBtn = e.target.closest('[data-cover-readiness-reset]');
      if (resetBtn) {
        const tripId = resetBtn.dataset.coverReadinessReset;
        (async () => {
          const ok = await UIUtils.confirmSheet('Снять все отметки готовности?', { okLabel: 'Сбросить', danger: false });
          if (!ok) return;
          const t = TripsData.getById(tripId);
          if (!Array.isArray(t?.readiness)) return;
          t.readiness = t.readiness.map(it => ({ ...it, done: false }));
          TripsData.updateTrip(tripId, { readiness: t.readiness });
          _rerenderReadiness(tripId);
          if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
        })();
        return;
      }

      const a = e.target.closest('[data-action]');
      if (!a) return;
      const act = a.dataset.action;
      // Моё местоположение — ставит координаты вручную и перетягивает погоду
      if (act === 'geo-weather') { _useMyLocation(trip.id, a); return; }
      if (act === 'geo-weather-reset') { _resetWeatherLocation(trip.id); return; }
      if (act === 'tc-invite') { _showInviteSheet(trip, () => show(_tripId, { silent: true })); return; }
      if (act === 'info-gear') { _onGearClick(trip, true); return; }
      if (act === 'tc-rate') { _setRating(trip, parseInt(a.dataset.val, 10)); return; }
      if (act === 'tc-weather-open') { _showWeatherScreen(trip); return; }
      if (act === 'tc-open-tab') { _openTripTab(trip.id, a.dataset.tab); return; }
      if (act === 'tc-open-notes') { _openTripTab(trip.id, 'info', 'g-notes-block'); return; }
      if (act === 'edit-rating') { _showEditRating(trip); return; }
      if (act === 'edit-comment') { _showEditComment(trip); return; }
      if (act === 'lodging-edit') { _showLodgingEdit(trip); return; }
    });

    el.querySelector('#coverEnter')?.addEventListener('click', () => {
      hide();
      enterTrip(_tripId);
    });
  }

  // Правка рейтинга/итогового комментария поездки. Правки — прямо в объект
  // trip (та же ссылка, что живёт в TripsState) + запись в Firestore, затем
  // перерисовка. onRefresh — что перерисовать после сохранения: по
  // умолчанию обложка, таб "Инфо" рыбалки зовёт со своим колбэком.
  function _showEditRating(trip, onRefresh) {
    const overlay = _openSheet('tc-edit-overlay', 'Оценка поездки', trip.name || '',
      `<input type="number" id="tcEditRating" class="tc-input" min="0" max="10" step="1" value="${trip.rating ?? ''}" placeholder="0–10">`,
      { footer: '<button type="button" class="tc-btn-primary" data-action="tc-edit-save">Сохранить</button>' });

    overlay.addEventListener('click', async e => {
      if (!e.target.closest('[data-action="tc-edit-save"]')) return;
      let val = parseInt(document.getElementById('tcEditRating')?.value, 10);
      if (!Number.isFinite(val)) val = null;
      else val = Math.max(0, Math.min(10, val));
      trip.rating = val;
      overlay.remove();
      await TripsData.updateTrip(trip.id, { rating: val });
      (onRefresh || (() => _renderCover(trip)))();
    });
  }

  function _showEditComment(trip, onRefresh) {
    const overlay = _openSheet('tc-edit-overlay', 'Итоги поездки', trip.name || '',
      `<textarea id="tcEditComment" class="tc-input tc-textarea" placeholder="На что клевало, что взять в следующий раз…">${_esc(trip.comment || '')}</textarea>`,
      { footer: '<button type="button" class="tc-btn-primary" data-action="tc-edit-save">Сохранить</button>' });

    overlay.addEventListener('click', async e => {
      if (!e.target.closest('[data-action="tc-edit-save"]')) return;
      const val = document.getElementById('tcEditComment')?.value.trim() || '';
      trip.comment = val;
      overlay.remove();
      await TripsData.updateTrip(trip.id, { comment: val });
      (onRefresh || (() => _renderCover(trip)))();
    });
  }

  // Полный вход в поездку — переключает нижнюю вкладку/роутер на Гид,
  // проставляет window.APP.currentTripId/currentTripData (используется
  // Реки/Меню/Расходы и др.), рендерит сам Гид. Вынесено из обработчика
  // #coverEnter, чтобы им же мог пользоваться быстрый попап выбора поездки
  // (showQuickPicker) — минуя саму обложку.
  function enterTrip(tripId, opts) {
    opts = opts || {};
    // Обычно обложку убирает сам клик по #coverEnter (hide() до этого
    // вызова) — но popstate-реплей (свайп вперёд с ffCover:false, см.
    // index.html) зовёт enterTrip() напрямую, в обход того клика, и без
    // этого обложка так и осталась бы висеть поверх уже смонтированного Гида.
    document.getElementById('trip-cover')?.remove();
    if (typeof AppNav !== 'undefined') AppNav.setActive('guide');
    if (typeof AppRouter !== 'undefined') AppRouter.show('guide');

    const trip = TripsData.getById(tripId);
    // Гид может открыться в обход обложки (быстрые действия Главной,
    // popstate) — запоминаем поездку и здесь, иначе switchGuideTab молчит.
    _tripId = tripId;

    // ── Сохраняем текущую поездку глобально (используется Реки, Меню и др.) ──
    if (window.APP) {
      window.APP.currentTripId = tripId;
      // Если есть подробный AI-импорт — используем его (там больше данных
      // по каждой реке/точке). Иначе собираем минимальный объект из
      // самой поездки, чтобы список рек/участников не терялся у поездок,
      // заведённых вручную (см. rivers/index.js — читает tripData.rivers).
      window.APP.currentTripData = trip?.importData || (trip
        ? { name: trip.name, rivers: trip.rivers || [], participants: trip.participants || [] }
        : null);
    }
    if (typeof AppHeader !== 'undefined') AppHeader.render();

    const guideEl = document.getElementById('p-guide');
    if (!guideEl) return;
    if (!trip) { guideEl.innerHTML = ''; return; }

    _activeGuideTab = 'info';
    guideEl.innerHTML = _renderGuideShell(trip);
    if (!opts.silent) _pushTripHistory(tripId, false);

    if (_guideHandler) guideEl.removeEventListener('click', _guideHandler);
    _guideHandler = e => {
      const tabBtn = e.target.closest('[data-gtab]');
      if (tabBtn) { _mountGuideTab(trip, tabBtn.dataset.gtab); return; }
      const settingsBtn = e.target.closest('[data-action="guide-tabs-settings"]');
      if (settingsBtn) { _showGuideTabsSettings(trip); return; }
      const printBtn = e.target.closest('[data-action="open-print"]');
      if (printBtn) { if (typeof PrintIndex !== 'undefined') PrintIndex.showPicker(trip); return; }
      // Назад к обложке — раньше единственный путь назад из Гида был
      // полностью выйти через гамбургер/нижнее меню и кликнуть по поездке
      // заново (Дмитрий сам наткнулся). Только для экспедиций — у "Рыбалки"
      // отдельной обложки нет, show() для неё сразу же снова зайдёт в Гид.
      const backBtn = e.target.closest('[data-action="guide-back-to-cover"]');
      if (backBtn) { show(trip.id); return; }
      const geoBtn = e.target.closest('[data-action="geo-weather"]');
      if (geoBtn) { _useMyLocation(trip.id, geoBtn); return; }
      const geoResetBtn = e.target.closest('[data-action="geo-weather-reset"]');
      if (geoResetBtn) { _resetWeatherLocation(trip.id); return; }
      const menuImpBtn = e.target.closest('[data-action="tc-menu-import"]');
      if (menuImpBtn) { _importMenuPlan(trip, menuImpBtn); return; }

      // Действия таба "Инфо" у простой рыбалки — те же обработчики, что
      // раньше были на кнопках обложки (#coverInvite/#coverGear/#coverEdit),
      // теперь просто как кнопки внутри самого таба.
      // «+ позвать» (в герое Инфо рыбалки) — общий лист приглашения/гостей.
      if (e.target.closest('[data-action="info-invite"]') || e.target.closest('[data-action="tc-invite"]')) {
        if (_canInvite(trip)) _showInviteSheet(trip, () => _mountGuideTab(trip, 'info'));
        return;
      }

      // Приветствие новому участнику (верх таба "Инфо")
      if (e.target.closest('[data-action="welcome-dismiss"]')) {
        _dismissWelcome(trip.id);
        // Раньше удаляли весь враппер .tc-stack — теперь в нём же лежит
        // карточка «Мои дела» (см. _mountGuideTab), трогаем только себя.
        document.getElementById('g-welcome-card')?.remove();
        return;
      }
      if (e.target.closest('[data-action="welcome-travel"]')) {
        const myUid = window.APP?.user?.uid;
        const mine = (trip.participants || []).find(p => p.uid === myUid);
        _showTravelEdit(trip.id, mine?.name || window.APP?.profile?.displayName || '');
        return;
      }
      if (e.target.closest('[data-action="welcome-medical"]')) {
        if (typeof onNavigate === 'function') onNavigate('profile');
        return;
      }
      if (e.target.closest('[data-action="welcome-gear"]')) { _onGearClick(trip, false); return; }

      // Лента "Что нового" — "Показать ещё" расширяет лимит и переподписывается.
      if (e.target.closest('[data-action="activity-more"]')) {
        _activityLimit = 30;
        _listenActivity(trip.id);
        return;
      }
      const rateBtn = e.target.closest('[data-action="tc-rate"]');
      if (rateBtn) { _setRating(trip, parseInt(rateBtn.dataset.val, 10)); return; }
      if (e.target.closest('[data-action="tc-weather-open"]')) { _showWeatherScreen(trip); return; }
      const tabLink = e.target.closest('[data-action="tc-open-tab"]');
      if (tabLink) { _openTripTab(trip.id, tabLink.dataset.tab); return; }
      if (e.target.closest('[data-action="tc-open-notes"]')) { _openTripTab(trip.id, 'info', 'g-notes-block'); return; }
      if (e.target.closest('[data-action="info-edit"]')) {
        if (typeof TripsIndex !== 'undefined') TripsIndex.showEdit(trip.id);
        return;
      }
      if (e.target.closest('[data-action="info-gear"]')) { _onGearClick(trip, false); return; }
      if (e.target.closest('[data-action="info-add-rating"]') || e.target.closest('[data-action="edit-rating"]')) {
        _showEditRating(trip, () => _mountGuideTab(trip, 'info'));
        return;
      }
      if (e.target.closest('[data-action="info-add-comment"]') || e.target.closest('[data-action="edit-comment"]')) {
        _showEditComment(trip, () => _mountGuideTab(trip, 'info'));
        return;
      }

      // Прибытие/отъезд (таб "Инфо") — открыть форму на конкретного участника.
      const travelRow = e.target.closest('[data-action="travel-edit"]');
      if (travelRow) {
        _showTravelEdit(trip.id, travelRow.dataset.name);
        return;
      }

      // Жильё (таб "Инфо") — карандаш на заполненной карточке или
      // пунктирная «+ Добавить жильё» на пустой, один и тот же лист.
      if (e.target.closest('[data-action="lodging-edit"]')) { _showLodgingEdit(trip); return; }

      // «Мои дела» — авто-пункты ведут к своему делу, свои пункты —
      // чекбокс/свайп-удаление/добавление (см. _todoCard).
      if (e.target.closest('[data-action="todo-toggle-collapse"]')) {
        _todoCollapsed = !_todoCollapsed;
        _saveTodoCollapsed(_todoCollapsed);
        _refreshTodoCard(trip);
        return;
      }
      if (e.target.closest('[data-action="todo-auto-travel"]')) {
        const myUid = window.APP?.user?.uid;
        const mine = (trip.participants || []).find(p => p.uid === myUid);
        _showTravelEdit(trip.id, mine?.name || window.APP?.profile?.displayName || '');
        return;
      }
      if (e.target.closest('[data-action="todo-auto-gear"]')) { _onGearClick(trip, false); return; }
      if (e.target.closest('[data-action="todo-auto-med"]')) {
        if (typeof onNavigate === 'function') onNavigate('profile');
        return;
      }
      const todoToggle = e.target.closest('[data-action="todo-toggle"]');
      if (todoToggle) {
        const it = _todoItems.find(x => x.id === todoToggle.dataset.id);
        if (it) { it.done = !it.done; _saveTodoItems(trip.id); _refreshTodoCard(trip); }
        return;
      }
      const todoDel = e.target.closest('[data-action="todo-del"]');
      if (todoDel) {
        _todoItems = _todoItems.filter(x => x.id !== todoDel.dataset.id);
        _saveTodoItems(trip.id);
        _refreshTodoCard(trip);
        return;
      }

      // Заметки поездки (таб "Инфо") — реалтайм-список, обновление DOM
      // приходит через _listenNotes()/onSnapshot, тут только пишем в
      // Firestore. См. modules/notes/*.
      const chip = e.target.closest('[data-action="note-safety-toggle"], [data-action="note-task-add-toggle"], [data-action="note-private-add-toggle"]');
      if (chip) {
        chip.setAttribute('aria-pressed', chip.classList.toggle('active'));
        return;
      }
      if (e.target.closest('[data-action="note-add"]')) {
        const input = document.getElementById('g-note-input');
        const text = input?.value.trim();
        if (!text) { input?.focus(); return; }
        const safety = !!document.querySelector('[data-action="note-safety-toggle"]')?.classList.contains('active');
        const isTask = !!document.querySelector('[data-action="note-task-add-toggle"]')?.classList.contains('active');
        const isPrivate = !!document.querySelector('[data-action="note-private-add-toggle"]')?.classList.contains('active');
        if (typeof NotesFirebase !== 'undefined') NotesFirebase.addNote(trip.id, { text, safety, isTask, private: isPrivate });
        if (input) input.value = '';
        document.querySelectorAll('.tc-notes-compose .tc-chip.active').forEach(c => { c.classList.remove('active'); c.setAttribute('aria-pressed', 'false'); });
        return;
      }
      // «…» у заметки — лист действий (закрепить/задача/безопасность/личная/удалить).
      const moreBtn = e.target.closest('[data-action="tc-note-more"]');
      if (moreBtn) { _showNoteActions(trip.id, moreBtn.dataset.id); return; }
      const expand = e.target.closest('[data-action="tc-note-expand"]');
      if (expand) { expand.classList.toggle('expanded'); return; }
      const noteBtn = e.target.closest('[data-action="note-done-toggle"], [data-action="note-pin"], [data-action="note-task-toggle"], [data-action="note-private-toggle"], [data-action="note-del"]');
      if (noteBtn) { _noteAction(trip.id, noteBtn.dataset.action, noteBtn.dataset.id); return; }

      const hd = e.target.closest('[data-target]');
      if (!hd) return;
      const body = document.getElementById(hd.dataset.target);
      if (!body) return;
      const chev = hd.querySelector('.g-acc-chev');
      const open = body.classList.toggle('show');
      if (chev) chev.classList.toggle('open', open);
      if (open) {
        const frame = body.querySelector('iframe[data-src]');
        if (frame) { frame.src = frame.dataset.src; frame.removeAttribute('data-src'); }
      }
    };
    guideEl.addEventListener('click', _guideHandler);

    // «+ Своё дело» — Enter добавляет пункт (делегировано на весь Гид,
    // переживает перерисовку самой карточки, см. _refreshTodoCard).
    if (_guideKeyHandler) guideEl.removeEventListener('keydown', _guideKeyHandler);
    _guideKeyHandler = e => {
      if (e.key === 'Enter' && e.target?.id === 'g-todo-input') { e.preventDefault(); _addTodoItem(trip); }
    };
    guideEl.addEventListener('keydown', _guideKeyHandler);

    _mountGuideTab(trip, 'info');
  }

  // Полоска вкладок (макет «Гид — Инфо»): текст с подчёркиванием активной,
  // горизонтальный скролл. ⚙ «Вкладки Гида» — последним элементом полоски.
  // Действия рыбалки, что раньше жили тут кружками (Снаряга / Пригласить /
  // Редактировать), переехали: снаряга — строкой в Инфо, «+ позвать» — в
  // ряд участников героя Инфо, карандаш — в шапку Гида.
  function _renderTabStrip(trip) {
    const ids = _personalGuideTabIds(trip);
    const pills = ids.map(id => {
      const label = id === 'info' ? 'Инфо' : _ALL_TAB_DEFS[id].label;
      const on = id === _activeGuideTab;
      return `<button type="button" role="tab" aria-selected="${on}" class="g-tab ${on ? 'active' : ''}" data-gtab="${id}">${_esc(label)}</button>`;
    }).join('');
    const settings = `<button type="button" class="g-tab-settings" data-action="guide-tabs-settings" aria-label="Настроить вкладки">${UIUtils.ico('adjustments-horizontal')}</button>`;
    return `<div class="g-tabstrip" id="g-tabstrip" role="tablist">${pills}${settings}</div>`;
  }

  // Подпись под названием в шапке Гида: даты · статус · подзаголовок импорта.
  function _guideSub(trip) {
    const s = trip.startDate ? new Date(trip.startDate + 'T00:00:00') : null;
    const e = trip.endDate ? new Date(trip.endDate + 'T00:00:00') : null;
    let dates = '';
    if (s && e) {
      const mon = d => MONTHS_GEN[d.getMonth()].slice(0, 3);
      dates = trip.startDate === trip.endDate ? `${s.getDate()} ${MONTHS_GEN[s.getMonth()]}`
        : s.getMonth() === e.getMonth() ? `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]}`
        : `${s.getDate()} ${mon(s)} – ${e.getDate()} ${mon(e)}`;
    }
    let status = '';
    if (trip.status === 'done') status = 'завершена';
    else if (trip.status === 'active') status = 'идёт';
    else if (trip.status === 'upcoming' && s) {
      const days = TripsData.daysUntil(trip.startDate);
      if (days > 0) status = `через ${days} ${_plural(days, 'день', 'дня', 'дней')}`;
    }
    // Подзаголовок из AI-импорта часто сам начинается с дат («12–19 сентября ·
    // Трофейная щука…») — отрезаем их, иначе в шапке даты шли дважды.
    let sub = String(trip.importData?.meta?.subtitle || '').replace(/^[^·]*\d[^·]*·\s*/, '').trim();
    if (!sub.includes('·') && /\d/.test(sub)) sub = ''; // весь подзаголовок — это и есть даты
    return [dates, status, sub].filter(Boolean).join(' · ');
  }

  // Шапка Гида (gheader в макетах) + полоска табов рисуются один раз на
  // весь вход в поездку — переключение табов меняет только #g-tab-panel
  // (иначе терялась бы прокрутка/состояние соседних вкладок). Стили — в
  // modules/tripcover/styles.css (раньше были инлайном здесь).
  function _renderGuideShell(trip) {
    const isOwner = TripsData.canManage(trip);
    return `
      <div class="tc-ghead">
        ${trip.type === 'expedition' ? `
        <button type="button" class="g-head-btn" data-action="guide-back-to-cover" aria-label="К обложке поездки">${UIUtils.ico('chevron-left')}</button>` : ''}
        <div class="tc-ghead-titles">
          <div class="tc-ghead-title">${_esc(trip.name)}</div>
          <div class="tc-ghead-sub">${_esc(_guideSub(trip))}</div>
        </div>
        ${trip.type === 'fishing' && isOwner ? `
        <button type="button" class="g-head-btn" data-action="info-edit" aria-label="Изменить поездку">${UIUtils.ico('pencil')}</button>` : ''}
        <button type="button" class="g-head-btn g-theme" aria-label="Переключить тему"
                onclick="AppHeader.toggleTheme()">${UIUtils.ico('sun', 'g-theme-sun')}${UIUtils.ico('moon', 'g-theme-moon')}</button>
        <button type="button" class="g-head-btn" data-action="open-print" aria-label="Печать">${UIUtils.ico('printer')}</button>
      </div>
      ${_renderTabStrip(trip)}
      <div id="g-tab-panel"></div>`;
  }

  // ── Как добираются (секция внутри таба "Инфо") ───────────────────────────
  // Даты самой поездки — общие на всех, но реальные перемещения людей до
  // точки сбора часто разные и не всегда в один заход: пример Дмитрия —
  // Кольский, где сам маршрут многосоставной (Москва → все вместе в
  // Архангельск → машиной в Северодвинск → яхтой через море), плюс более
  // простой случай (Сахалин) — он и Лёха прилетели в Москву заранее и
  // поехали в аэропорт вместе, Илья отдельно, с пересадкой через
  // Шереметьево. Ни один общий диапазон дат поездки, ни фиксированная пара
  // "прилёт/отъезд" это не покрывают — поэтому список произвольных ЭТАПОВ
  // на человека (дата/время/место/заметка), а не жёсткая структура.
  // Не всегда это перелёт (Ханты — машиной) — нейтральные названия и
  // стрелки вместо самолётных эмодзи.
  // Хранится на trip.travel.<имя>.legs — узкая запись по ключу-имени (см.
  // _saveTravelLegs), тот же паттерн mealDuty/slotItems: Firestore мёржит
  // вложенные map-поля при merge:true, правка одного человека не задевает
  // остальных. Редактировать может любой участник за любого — данные не
  // приватные и не требуют владения (как и заметки рядом).

  function _travelLegLine(l) {
    return `${l.date ? _esc(l.date) : ''}${l.time ? ', ' + _esc(l.time) : ''}${l.location ? ' · ' + _esc(l.location) : ''}${l.note ? ' — ' + _esc(l.note) : ''}`;
  }

  function _travelSplitLegs(legs) {
    const today = new Date().toISOString().slice(0, 10);
    const sorted = (legs || []).slice().sort((a, b) => (a.date || '').localeCompare(b.date || ''));
    return {
      upcoming: sorted.filter(l => !l.date || l.date >= today),
      past: sorted.filter(l => l.date && l.date < today),
    };
  }

  // Заголовок секции Инфо (20px) + необязательная мелкая подсказка под ним.
  function _secTitle(title, right, hint) {
    return `<div class="tc-sec"><h2 class="tc-sec-title">${title}</h2>${right || ''}</div>${hint ? `<div class="tc-sec-hint">${hint}</div>` : ''}`;
  }

  // ── Приветствие новому участнику (самый верх вкладки «Инфо») ────────────
  // Показывается любому, кто НЕ создатель поездки (trip.ownerId), пока сам
  // не скроет — members/{uid}.welcomedTrips.{tripId}=true, узкая запись
  // (тот же паттерн, что hiddenGuideTabs). Организатору не нужен — это его
  // же поездка, он и так знает, что в ней есть.
  function _isWelcomed(tripId) {
    return !!(window.APP?.profile?.welcomedTrips || {})[tripId];
  }

  function _dismissWelcome(tripId) {
    const uid = window.APP?.user?.uid;
    if (!uid) return;
    if (window.APP.profile) {
      window.APP.profile.welcomedTrips = { ...(window.APP.profile.welcomedTrips || {}), [tripId]: true };
    }
    firebase.firestore().collection('members').doc(uid)
      .set({ welcomedTrips: { [tripId]: true } }, { merge: true })
      .catch(() => {});
  }

  function _welcomeCard(trip) {
    const uid = window.APP?.user?.uid;
    if (!uid || trip.ownerId === uid || _isWelcomed(trip.id)) return '';
    return `
      <section class="tc-card tc-welcome" id="g-welcome-card">
        <h2 class="tc-welcome-title">Ты в поездке «${_esc(trip.name)}»</h2>
        <div class="tc-welcome-rows">
          ${(trip.participants || []).some(p => p.uid === window.APP?.user?.uid && p.travelSeparate)
              ? _linkRow({ action: 'welcome-travel', icon: 'plane', title: 'Мои даты приезда и отъезда' }) : ''}
          ${_linkRow({ action: 'welcome-medical', icon: 'first-aid-kit', title: 'Аллергии и медданные' })}
          ${_linkRow({ action: 'welcome-gear', icon: 'backpack', title: 'Что я везу' })}
        </div>
        <button type="button" class="tc-btn-secondary" data-action="welcome-dismiss">Всё ок, скрыть</button>
      </section>`;
  }

  // ── Жильё (trip.lodging, см. BRIEF2.md) — адрес/бронь/заселение-выезд,
  // необязательные строки, правит любой участник. Карточка одна и та же
  // функция для обложки экспедиции и вкладки «Инфо» — оба места просто
  // подменяют #cover-lodging-block / #g-lodging-section целиком.
  function _lodgingCard(t, where) {
    const l = t.lodging || {};
    const hasAny = l.address || l.link || l.checkin || l.checkout || l.note;
    // Пустое жильё у прошедшей поездки не нужно вовсе.
    if (!hasAny && t.status === 'done') return '';
    // На обложке все блоки — карточки с заголовком внутри: пустое жильё —
    // такая же строка-карточка, как «Снаряга на поездку».
    if (!hasAny && where === 'cover') {
      return `<section class="tc-card tc-card--list">${_linkRow({ action: 'lodging-edit', icon: 'home', title: 'Жильё', sub: 'адрес, бронь, заселение — добавить' })}</section>`;
    }
    if (!hasAny) {
      // С заголовком, как у соседних блоков — раньше пунктир висел «сам по себе».
      return _secTitle('Жильё') + `<button type="button" class="tc-add-dashed" data-action="lodging-edit">+ Добавить жильё</button>`;
    }
    const schedule = [l.checkin ? `Заселение ${l.checkin}` : '', l.checkout ? `выезд ${l.checkout}` : '']
      .filter(Boolean).join(' · ');
    const mapsUrl = l.address ? `https://yandex.ru/maps/?text=${encodeURIComponent(l.address)}` : '';
    return `
      <section class="tc-card">
        <div class="tc-card-head">
          <h2 class="tc-card-title">Жильё</h2>
          <button type="button" class="tc-icon-btn" data-action="lodging-edit" aria-label="Изменить жильё">${UIUtils.ico('pencil')}</button>
        </div>
        <div class="tc-lodging-row">
          <span class="tc-tile">${UIUtils.ico('home')}</span>
          <span class="tc-link-main">
            ${l.address
              ? `<a class="tc-lodging-addr" href="${_esc(mapsUrl)}" target="_blank" rel="noopener">${_esc(l.address)}</a>`
              : `<span class="tc-muted">Адрес не указан</span>`}
            ${schedule ? `<span class="tc-link-sub">${_esc(schedule)}</span>` : ''}
          </span>
        </div>
        ${l.link ? `<a class="tc-btn-secondary" href="${_esc(l.link)}" target="_blank" rel="noopener">${UIUtils.ico('external-link')} Бронь</a>` : ''}
        ${l.note ? `<div class="tc-hint">${_esc(l.note)}</div>` : ''}
      </section>`;
  }

  function _refreshLodging(trip) {
    const cover = document.getElementById('cover-lodging-block');
    if (cover) cover.innerHTML = _lodgingCard(trip, 'cover');
    const guide = document.getElementById('g-lodging-section');
    if (guide) guide.innerHTML = _lodgingCard(trip);
  }

  // Правка — лист с обычными текстовыми полями (не date/time-пикеры —
  // формулировки вроде «3 окт, 14:00» вводятся текстом, см. BRIEF2.md).
  function _showLodgingEdit(trip) {
    const l = trip.lodging || {};
    const body = `
      <div class="tc-field-title">Адрес</div>
      <input type="text" class="tc-input" id="ld-address" placeholder="ул. Ленина, 5" value="${_esc(l.address || '')}">
      <div class="tc-field-title">Ссылка на бронь</div>
      <input type="text" class="tc-input" id="ld-link" placeholder="https://…" value="${_esc(l.link || '')}">
      <div class="tc-grid2">
        <div>
          <div class="tc-field-title">Заселение</div>
          <input type="text" class="tc-input" id="ld-checkin" placeholder="3 окт, 14:00" value="${_esc(l.checkin || '')}">
        </div>
        <div>
          <div class="tc-field-title">Выезд</div>
          <input type="text" class="tc-input" id="ld-checkout" placeholder="7 окт, 12:00" value="${_esc(l.checkout || '')}">
        </div>
      </div>
      <div class="tc-field-title">Заметка</div>
      <textarea class="tc-input tc-textarea" id="ld-note" placeholder="Код от домофона, контакт хозяина…">${_esc(l.note || '')}</textarea>`;
    const overlay = _openSheet('tc-lodging-overlay', 'Жильё', trip.name || '', body,
      { footer: '<button type="button" class="tc-btn-primary" data-action="lodging-save">Сохранить</button>' });

    overlay.addEventListener('click', async e => {
      if (!e.target.closest('[data-action="lodging-save"]')) return;
      const lodging = {
        address: document.getElementById('ld-address')?.value.trim() || '',
        link: document.getElementById('ld-link')?.value.trim() || '',
        checkin: document.getElementById('ld-checkin')?.value.trim() || '',
        checkout: document.getElementById('ld-checkout')?.value.trim() || '',
        note: document.getElementById('ld-note')?.value.trim() || '',
      };
      trip.lodging = lodging;
      overlay.remove();
      await TripsData.updateTrip(trip.id, { lodging });
      _refreshLodging(trip);
    });
  }

  // ── «Мои дела по поездке» (вкладка «Инфо», самый верх) ──────────────────
  function _todoCollapsedKey() { return 'ff_todo_collapsed'; }
  function _loadTodoCollapsed() {
    try { return localStorage.getItem(_todoCollapsedKey()) === '1'; } catch (e) { return false; }
  }
  function _saveTodoCollapsed(v) {
    try {
      if (v) localStorage.setItem(_todoCollapsedKey(), '1');
      else localStorage.removeItem(_todoCollapsedKey());
    } catch (e) { /* приватный режим — переживём без запоминания */ }
  }

  // Три авто-пункта не хранятся — считаются на лету по уже загруженным
  // данным поездки/профиля (плюс _todoGearReady, подтягивается отдельно).
  function _todoAutoItems(trip) {
    const uid = window.APP?.user?.uid;
    const myName = (trip.participants || []).find(p => p.uid === uid)?.name
      || window.APP?.profile?.displayName || '';
    const travelDone = !!((trip.travel?.[myName]?.legs) || []).length;
    const profile = window.APP?.profile || {};
    const medDone = !!(profile.bloodType || profile.allergies);
    // «Даты приезда» — только тем, кто едет по своему расписанию (раздел
    // «Как добираются» показывается только им же).
    const me = (trip.participants || []).find(p => p.uid === uid);
    return [
      ...(me?.travelSeparate ? [{ id: '_auto_travel', text: 'Указать даты приезда и отъезда', done: travelDone, auto: 'travel' }] : []),
      { id: '_auto_gear', text: 'Собрать снарягу и нажать «Я собран»', done: !!_todoGearReady, auto: 'gear' },
      { id: '_auto_med', text: 'Заполнить медданные', done: medDone, auto: 'med' },
    ];
  }

  function _todoCard(trip) {
    const auto = _todoAutoItems(trip);
    const all = [...auto, ..._todoItems];
    const done = all.filter(it => it.done).length;
    const total = all.length;
    const row = it => `
      <div class="tc-swipe-row g-todo-row">
        <button type="button" class="g-todo-item" data-action="${it.auto ? 'todo-auto-' + it.auto : 'todo-toggle'}" data-id="${_esc(it.id)}">
          <span class="tc-check ${it.done ? 'done' : ''}">${it.done ? UIUtils.ico('check') : ''}</span>
          <span class="g-todo-text ${it.done ? 'done' : ''}">${_esc(it.text)}</span>
        </button>
        ${it.auto ? '' : `<button type="button" class="tc-swipe-del" data-action="todo-del" data-id="${_esc(it.id)}" aria-label="Удалить">Удалить</button>`}
      </div>`;
    return `
      <section class="tc-card" id="g-todo-card">
        <button type="button" class="tc-card-head g-todo-head" data-action="todo-toggle-collapse" aria-expanded="${!_todoCollapsed}">
          <h2 class="tc-card-title">Мои дела · ${done} из ${total}</h2>
          <span class="tc-icon-btn">${UIUtils.ico(_todoCollapsed ? 'chevron-down' : 'chevron-up')}</span>
        </button>
        ${_todoCollapsed ? '' : `
          <div class="tc-legs" id="g-todo-rows">${all.map(row).join('')}</div>
          <input type="text" class="tc-input" id="g-todo-input" placeholder="+ Своё дело">
        `}
      </section>`;
  }

  function _bindTodoSwipe() {
    const rows = document.getElementById('g-todo-rows');
    if (rows) UIUtils.swipeToDelete(rows, '.tc-swipe-row', '.tc-swipe-del');
  }

  function _refreshTodoCard(trip) {
    const el = document.getElementById('g-todo-card');
    if (!el) return;
    el.outerHTML = _todoCard(trip);
    _bindTodoSwipe();
  }

  async function _ensureTodoLoaded(tripId) {
    const uid = window.APP?.user?.uid;
    if (!uid) { _todoItems = []; return; }
    try {
      const doc = await firebase.firestore().collection('trips').doc(tripId)
        .collection('todo_personal').doc(uid).get();
      _todoItems = (doc.exists && Array.isArray(doc.data().items)) ? doc.data().items : [];
    } catch (e) { _todoItems = []; }
  }

  async function _ensureTodoGearReady(tripId) {
    const uid = window.APP?.user?.uid;
    if (!uid) { _todoGearReady = false; return; }
    try {
      const doc = await firebase.firestore().collection('gear_trip_shared').doc(tripId).get();
      _todoGearReady = !!(doc.exists && doc.data().ready && doc.data().ready[uid]);
    } catch (e) { _todoGearReady = false; }
  }

  // Пишет весь документ разом — правило брифа: документ пишет только сам
  // владелец (см. firestore.rules todo_personal), гонки с другими людьми
  // тут не бывает, транзакция не нужна.
  function _saveTodoItems(tripId) {
    const uid = window.APP?.user?.uid;
    if (!uid) return;
    firebase.firestore().collection('trips').doc(tripId)
      .collection('todo_personal').doc(uid).set({ items: _todoItems }).catch(() => {});
  }

  function _addTodoItem(trip) {
    const input = document.getElementById('g-todo-input');
    const text = input?.value.trim();
    if (!text) { input?.focus(); return; }
    _todoItems.push({ id: 'td_' + Date.now() + '_' + Math.random().toString(36).slice(2), text, done: false });
    _saveTodoItems(trip.id);
    _refreshTodoCard(trip);
  }

  // Читает todo_personal + gear_trip_shared один раз при показе таба и
  // перерисовывает карточку поверх уже показанной синхронной версии —
  // тот же приём, что _patchGearSub/_patchGearReady.
  function _loadTodoAsync(trip) {
    if (!window.APP?.user?.uid) return;
    Promise.all([_ensureTodoLoaded(trip.id), _ensureTodoGearReady(trip.id)]).then(() => {
      _refreshTodoCard(trip);
    });
  }

  // ── Лента «Что нового» (вкладка «Инфо», над заметками группы) ───────────
  // ActivityLog.listen — та же подписка-по-требованию, что у заметок
  // (_listenNotes ниже): переподписываемся при каждом входе на вкладку
  // «Инфо», старая подписка снимается сама внутри функции.
  function _listenActivity(tripId) {
    if (_activityUnsub) { _activityUnsub(); _activityUnsub = null; }
    if (typeof ActivityLog === 'undefined') return;
    _activityUnsub = ActivityLog.listen(tripId, items => {
      _activityItems = items;
      const section = document.getElementById('g-activity-section');
      if (section) section.innerHTML = _activitySection();
    }, _activityLimit);
  }

  function _activityHead() {
    return _secTitle('Что нового', '');
  }

  function _activityRow(it) {
    return _linkRow({
      icon: ActivityLog.icon(it.kind),
      title: `<b>${_esc(it.name)}</b> ${_esc(it.text)}`,
      sub: _esc(ActivityLog.ago(it.at)),
    });
  }

  function _activitySection() {
    if (!_activityItems.length) return '<div class="tc-sec-hint">Пока тихо — здесь появится, кто что добавил</div>';
    const rows = _activityItems.map(_activityRow).join('');
    const more = _activityLimit === 10
      ? `<button type="button" class="tc-text-btn" data-action="activity-more">Показать ещё</button>` : '';
    return `<section class="tc-card tc-card--list">${rows}</section>${more}`;
  }

  function _travelSection(trip) {
    const travel = trip.travel || {};
    // Только те, кого отметили "свои даты" при создании поездки (см.
    // modules/trips/index.js:_participantsField) — если едут все вместе
    // (обычный случай), карточка вообще не показывается, не мозолит глаза.
    const participants = (trip.participants || []).filter(p => p.travelSeparate);
    if (!participants.length) return '';

    const rows = participants.map(p => {
      const legs = (travel[p.name]?.legs) || [];
      const { upcoming, past } = _travelSplitLegs(legs);
      return `
        <button type="button" class="tc-link-row g-travel-row" data-action="travel-edit" data-name="${_esc(p.name)}">
          <span class="tc-link-main">
            <span class="tc-link-title">${_esc(p.name)}</span>
            ${upcoming.length
              ? upcoming.map(l => `<span class="tc-link-sub">${_travelLegLine(l)}</span>`).join('')
              : `<span class="tc-link-sub tc-muted">${past.length ? 'все этапы прошли' : 'не указано'} — нажми, чтобы заполнить</span>`}
            ${past.length ? `<span class="tc-link-sub tc-muted">+ ${past.length} ${_plural(past.length, 'прошедший', 'прошедших', 'прошедших')}</span>` : ''}
          </span>
          <span class="tc-link-right">${UIUtils.ico('chevron-right')}</span>
        </button>`;
    }).join('');

    return _secTitle('Как добираются', '', 'Рейсы, поезда, пересадки — у каждого свои. Заполнить может любой участник.')
      + `<section class="tc-card tc-card--list">${rows}</section>`;
  }

  function _saveTravelLegs(tripId, name, legs) {
    TripsData.updateTrip(tripId, { travel: { [name]: { legs } } });
    // Локально патчим кэш и перерисовываем секцию сразу — не ждём эхо
    // реального снапшота (та же оптимистичная логика, что в остальном
    // приложении: узкая запись + мгновенный локальный ререндер).
    const trip = TripsData.getById(tripId);
    if (trip) {
      trip.travel = trip.travel || {};
      trip.travel[name] = { legs };
      const section = document.getElementById('g-travel-section');
      if (section) section.innerHTML = _travelSection(trip);
    }
  }

  let _travelPastOpen = false;

  function _travelEditBody(tripId, name) {
    const trip = TripsData.getById(tripId);
    const legs = (trip?.travel?.[name]?.legs) || [];
    const { upcoming, past } = _travelSplitLegs(legs);

    // Удаление этапа — свайпом влево (UIUtils.swipeToDelete), не крестиком.
    const legRow = l => `
      <div class="tc-swipe-row tc-leg">
        <div class="tc-leg-text">${_travelLegLine(l) || '<span class="tc-muted">Без даты</span>'}</div>
        <button type="button" class="tc-swipe-del" data-action="travel-leg-del" data-id="${_esc(l.id)}" aria-label="Удалить этап">Удалить</button>
      </div>`;

    return `
      <div class="g-travel-legs" id="g-travel-legs">
        ${upcoming.length ? `<div class="tc-legs">${upcoming.map(legRow).join('')}</div>` : '<div class="tc-hint">Этапов пока нет</div>'}
        ${past.length ? `
          <button type="button" class="tc-text-btn" data-action="travel-past-toggle">
            Прошедшие (${past.length}) ${UIUtils.ico(_travelPastOpen ? 'chevron-up' : 'chevron-down')}
          </button>
          ${_travelPastOpen ? `<div class="tc-legs">${past.map(legRow).join('')}</div>` : ''}
        ` : ''}
      </div>
      <div class="tc-field-title">Добавить этап</div>
      <div class="tc-grid2">
        <input type="date" class="tc-input" id="gt-leg-date" aria-label="Дата">
        <input type="time" class="tc-input" id="gt-leg-time" aria-label="Время">
      </div>
      <input type="text" class="tc-input" id="gt-leg-loc" placeholder="Место — аэропорт, город…">
      <input type="text" class="tc-input" id="gt-leg-note" placeholder="Заметка — «прилёт», «дальше на яхте»…">
      <button type="button" class="tc-add-dashed" data-action="travel-leg-add" data-name="${_esc(name)}">+ Добавить этап</button>
      <div class="tc-hint">Прошедшие этапы свернутся сами. Удалить этап — смахнуть влево.</div>`;
  }

  function _showTravelEdit(tripId, name) {
    _travelPastOpen = false;
    const trip = TripsData.getById(tripId);
    const overlay = _openSheet('g-travel-overlay', 'Как добирается', [name, trip?.name].filter(Boolean).join(' · '),
      `<div id="g-travel-edit-body">${_travelEditBody(tripId, name)}</div>`);
    UIUtils.swipeToDelete(overlay, '.tc-swipe-row', '.tc-swipe-del');

    const rerenderBody = () => {
      const body = overlay.querySelector('#g-travel-edit-body');
      if (body) body.innerHTML = _travelEditBody(tripId, name);
    };

    overlay.addEventListener('click', e => {
      if (e.target.closest('[data-action="travel-past-toggle"]')) {
        _travelPastOpen = !_travelPastOpen;
        rerenderBody();
        return;
      }

      const delBtn = e.target.closest('[data-action="travel-leg-del"]');
      if (delBtn) {
        const trip = TripsData.getById(tripId);
        const legs = ((trip?.travel?.[name]?.legs) || []).filter(l => l.id !== delBtn.dataset.id);
        _saveTravelLegs(tripId, name, legs);
        rerenderBody();
        return;
      }

      const addBtn = e.target.closest('[data-action="travel-leg-add"]');
      if (addBtn) {
        const date = overlay.querySelector('#gt-leg-date').value || null;
        const time = overlay.querySelector('#gt-leg-time').value || null;
        const location = overlay.querySelector('#gt-leg-loc').value.trim() || null;
        const note = overlay.querySelector('#gt-leg-note').value.trim() || null;
        if (!date && !time && !location && !note) return;
        const leg = { id: `leg_${Date.now()}_${Math.random().toString(36).slice(2)}`, date, time, location, note };
        const trip = TripsData.getById(tripId);
        const legs = [...((trip?.travel?.[name]?.legs) || []), leg];
        _saveTravelLegs(tripId, addBtn.dataset.name, legs);
        rerenderBody();
        return;
      }
    });
  }

  // ── Паспорта (секция Инфо у экспедиций, макет V2GuideTravel) ──────────────
  // Только чтение: сроки паспорта РФ/загран берутся из профиля участника
  // (members/{uid}.passportRf/passportIntl, правятся в своём профиле) —
  // чтобы не узнать о просрочке в аэропорту. Гости без аккаунта не
  // показываются (профиля нет). Подсветка — как в профиле
  // (modules/members/render.js _passportDateCls): просрочен — красным,
  // меньше 90 дней — оранжевым. Профили дотягиваются асинхронно.
  const _passportCache = {};
  const _PASSPORT_WARN_DAYS = 90;

  function _passportPart(label, date) {
    if (!date) return '';
    const today = new Date().toISOString().slice(0, 10);
    const warnBy = new Date(today);
    warnBy.setDate(warnBy.getDate() + _PASSPORT_WARN_DAYS);
    const cls = date < today ? 'tc-c-red' : date <= warnBy.toISOString().slice(0, 10) ? 'tc-c-orange' : '';
    const d = new Date(date + 'T00:00:00');
    const txt = isNaN(d) ? _esc(date) : d.toLocaleDateString('ru');
    return `<span class="${cls}">${label} до ${txt}${cls === 'tc-c-red' ? ' — просрочен' : ''}</span>`;
  }

  function _passportsSection(trip) {
    if (trip.type !== 'expedition' || trip.status === 'done') return '';
    const people = (trip.participants || []).filter(p => p.uid);
    if (!people.length) return '';
    const rows = people.map(p => {
      const prof = _passportCache[p.uid];
      let val;
      if (prof === undefined) val = '<span class="tc-muted">…</span>';
      else {
        const parts = [_passportPart('РФ', prof.passportRf), _passportPart('загран', prof.passportIntl)].filter(Boolean);
        val = parts.length ? parts.join(' · ') : '<span class="tc-muted">не указано</span>';
      }
      return `<div class="tc-link-row tc-link-row--static"><span class="tc-link-main"><span class="tc-link-title">${_esc(p.name)}</span><span class="tc-link-sub">${val}</span></span></div>`;
    }).join('');
    return _secTitle('Паспорта', '', 'Срок действия — чтобы не узнать о просрочке в аэропорту. Указывается в своём профиле.')
      + `<section class="tc-card tc-card--list">${rows}</section>`;
  }

  function _loadPassports(trip) {
    if (trip.type !== 'expedition' || trip.status === 'done' || typeof MembersFirebase === 'undefined') return;
    const missing = (trip.participants || []).filter(p => p.uid && _passportCache[p.uid] === undefined).map(p => p.uid);
    if (!missing.length) return;
    Promise.all(missing.map(uid => MembersFirebase.getProfile(uid).then(pr => {
      _passportCache[uid] = pr ? { passportRf: pr.passportRf || '', passportIntl: pr.passportIntl || '' } : {};
    }).catch(() => { _passportCache[uid] = {}; }))).then(() => {
      const el = document.getElementById('g-passports-section');
      if (el && _tripId === trip.id) el.innerHTML = _passportsSection(trip);
    });
  }

  // ── Заметки поездки (секция внутри таба "Инфо") ──────────────────────────
  // Не отдельная вкладка Гида — Дмитрий прав, что для простой доски заметок
  // это перебор (плюс пришлось бы добавлять в настройки видимости вкладок).
  // Живёт в NotesState/NotesFirebase (modules/notes/*), тот же паттерн
  // realtime-подписки с несколькими подписчиками, что у CatchesFirebase.
  // Поле ввода рисуется один раз (_notesComposer) — снапшот перерисовывает
  // только заголовок со счётчиком и список, набранный текст не теряется.

  function _listenNotes(tripId) {
    if (_notesUnsub) { _notesUnsub(); _notesUnsub = null; }
    if (typeof NotesFirebase === 'undefined') return;
    _notesUnsub = NotesFirebase.listen(tripId, arr => {
      NotesState.setNotes(tripId, arr);
      const head = document.getElementById('g-notes-head');
      if (head) head.innerHTML = _notesHead(tripId);
      const section = document.getElementById('g-notes-section');
      if (section) section.innerHTML = _notesSection(tripId);
    });
  }

  function _canDeleteNote(tripId, note) {
    const myUid = window.APP?.user?.uid;
    if (myUid && note.createdBy === myUid) return true;
    return TripsData.canManage(TripsData.getById(tripId));
  }

  // Приватность может переключать только автор — в отличие от удаления,
  // тут организатору поездки исключение не делаем: это не модерация,
  // а личный переключатель автора. См. firestore.rules (тот же принцип
  // закреплён и на сервере, не только тут).
  function _isNoteAuthor(note) {
    const myUid = window.APP?.user?.uid;
    return !!myUid && note.createdBy === myUid;
  }

  function _noteDate(iso, long) {
    const d = new Date(iso);
    if (isNaN(d)) return '';
    return `${d.getDate()} ${long ? MONTHS_GEN[d.getMonth()] : MONTHS_GEN[d.getMonth()].slice(0, 3)}`;
  }

  // Все действия с заметкой — одна точка (кнопки в списке и лист «…»).
  function _noteAction(tripId, action, noteId) {
    const note = (typeof NotesState !== 'undefined' ? NotesState.getNotes(tripId) : []).find(n => n._id === noteId);
    if (!note || typeof NotesFirebase === 'undefined') return;
    if (action === 'note-pin') NotesFirebase.setPinned(tripId, noteId, !note.pinned);
    else if (action === 'note-task-toggle') NotesFirebase.setTask(tripId, noteId, !note.isTask);
    else if (action === 'note-done-toggle') NotesFirebase.setDone(tripId, noteId, !note.done);
    else if (action === 'note-private-toggle') NotesFirebase.setPrivate(tripId, noteId, !note.private);
    else if (action === 'note-safety-set') NotesFirebase.setSafety(tripId, noteId, !note.safety);
    else if (action === 'note-del') NotesFirebase.deleteNote(tripId, noteId);
  }

  // Лист действий заметки (макет V2NoteActions).
  function _showNoteActions(tripId, noteId) {
    const note = (typeof NotesState !== 'undefined' ? NotesState.getNotes(tripId) : []).find(n => n._id === noteId);
    if (!note) return;
    // Строки с иконкой в плитке — как в листе блюда в Меню.
    const act = (action, icon, label, sub, cls) => `
      <button type="button" class="tc-act tc-act--ico ${cls || ''}" data-note-act="${action}">
        <span class="tc-act-tile">${UIUtils.ico(icon)}</span>
        <span class="tc-act-text"><span>${label}</span>${sub ? `<span class="tc-act-sub">${sub}</span>` : ''}</span>
      </button>`;
    const body = `<div class="tc-acts">
      ${act('note-pin', 'pin', note.pinned ? 'Открепить' : 'Закрепить наверху')}
      ${act('note-task-toggle', 'circle-check', note.isTask ? 'Убрать из задач' : 'Сделать задачей', note.isTask ? '' : 'появится кружок «сделано»')}
      ${act('note-safety-set', 'shield', note.safety ? 'Снять пометку «Безопасность»' : 'Пометить «Безопасность»')}
      ${_isNoteAuthor(note) ? act('note-private-toggle', 'lock', note.private ? 'Сделать видной всем' : 'Видна только мне') : ''}
      ${_canDeleteNote(tripId, note) ? act('note-del', 'trash', 'Удалить', '', 'tc-act--danger') : ''}
    </div>`;
    const overlay = _openSheet('tc-note-actions', 'Заметка', [note.authorName, _noteDate(note.createdAt, true)].filter(Boolean).join(' · '), body);
    overlay.addEventListener('click', async e => {
      const a = e.target.closest('[data-note-act]')?.dataset.noteAct;
      if (!a) return;
      overlay.remove();
      if (a === 'note-del') {
        const ok = await UIUtils.confirmSheet('Удалить заметку? Вернуть её будет нельзя.', { okLabel: 'Удалить' });
        if (!ok) return;
      }
      _noteAction(tripId, a, noteId);
    });
  }

  function _notesHead(tripId) {
    const n = (typeof NotesState !== 'undefined' ? NotesState.getNotes(tripId) : []).length;
    return _secTitle('Заметки группы', n ? `<span class="tc-muted">${n}</span>` : '');
  }

  function _notesComposer() {
    return `
      <section class="tc-card tc-notes-compose">
        <textarea class="tc-input tc-textarea" id="g-note-input" aria-label="Новая заметка" placeholder="Новая заметка…"></textarea>
        <div class="tc-chips">
          <button type="button" class="tc-chip" data-action="note-safety-toggle" aria-pressed="false">Безопасность</button>
          <button type="button" class="tc-chip" data-action="note-task-add-toggle" aria-pressed="false">Задача</button>
          <button type="button" class="tc-chip" data-action="note-private-add-toggle" aria-pressed="false">Только мне</button>
          <span class="tc-grow"></span>
          <button type="button" class="tc-btn-pill" data-action="note-add">Добавить</button>
        </div>
      </section>`;
  }

  function _notesSection(tripId) {
    const notes = typeof NotesState !== 'undefined' ? NotesState.getNotes(tripId) : [];
    if (!notes.length) return '<div class="tc-sec-hint">Заметок пока нет — напиши первую, её увидят все участники</div>';
    // _esc() на n._id — это id документа Firestore, не только n.text: их
    // обычно генерирует .add() на клиенте, но правила это никак не
    // навязывают, и заметку с произвольным id можно создать напрямую через
    // API, минуя приложение. Без экранирования такой id ломает атрибут и
    // добавляет свой HTML/обработчик события на страницу ДРУГИХ участников
    // — воспроизвели вживую. Реальная дыра, найдена внешним ревью
    // 2026-09-27.
    const rows = notes.map(n => `
      <div class="tc-note ${n.pinned ? 'pinned' : ''}">
        ${n.isTask ? `
          <button type="button" class="tc-note-check" role="checkbox" aria-checked="${n.done}" aria-label="Сделано"
                  data-action="note-done-toggle" data-id="${_esc(n._id)}">
            <span class="tc-check ${n.done ? 'done' : ''}">${n.done ? UIUtils.ico('check') : ''}</span>
          </button>` : ''}
        <div class="tc-note-body">
          <div class="tc-note-meta">
            <span>${_esc(n.authorName)}${_noteDate(n.createdAt) ? ' · ' + _noteDate(n.createdAt) : ''}</span>
            ${n.pinned ? `<span class="tc-c-accent" title="Закреплено">${UIUtils.ico('pin')}</span>` : ''}
            ${n.private ? `<span title="Только мне">${UIUtils.ico('lock')}</span>` : ''}
            ${n.safety ? '<span class="tc-note-tag">Безопасность</span>' : ''}
          </div>
          <div class="tc-note-text ${n.isTask && n.done ? 'crossed' : ''}" data-action="tc-note-expand">${_esc(n.text)}</div>
        </div>
        <button type="button" class="tc-note-more" data-action="tc-note-more" data-id="${_esc(n._id)}" aria-label="Действия с заметкой">${UIUtils.ico('dots')}</button>
      </div>`).join('');
    return `<section class="tc-card tc-card--list">${rows}</section>`;
  }

  // Переключение таба — меняет только #g-tab-panel, заголовок и полоска
  // табов остаются на месте (не теряем прокрутку/состояние соседних вкладок).
  function _mountGuideTab(trip, tabId) {
    _activeGuideTab = tabId;
    document.querySelectorAll('#g-tabstrip .g-tab').forEach(el => {
      const on = el.dataset.gtab === tabId;
      el.classList.toggle('active', on);
      el.setAttribute('aria-selected', on);
      if (on) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    });

    const panel = document.getElementById('g-tab-panel');
    if (!panel) return;
    const guideEl = document.getElementById('p-guide');
    if (guideEl) guideEl.scrollTop = 0;
    window.scrollTo(0, 0);

    // Мгновенная подмена контента при смене таба читалась как рывок —
    // короткий кросс-фейд вместо направленного слайда, т.к. табы можно
    // переставлять местами (см. _showGuideTabsSettings), направление
    // слайда потеряло бы смысл.
    panel.style.opacity = '0';

    const tripId = trip.id;
    if (tabId === 'info') {
      let bodyHtml;
      if (trip?.importData?.route?.length) {
        bodyHtml = `<div class="tc-stack"><div id="g-today-weather">${_todayWeatherBlock(trip)}</div>${_renderGuideInfo(trip)}</div>`;
        _maybeRefreshWeather(trip);
      } else if (trip.type === 'fishing') {
        bodyHtml = _renderFishingInfo(trip);
        _maybeRefreshWeather(trip);
      } else {
        // Экспедиция без маршрута по дням: вместо большой пустой заглушки —
        // то, что уже есть (погода), и короткая подсказка, где добавить маршрут.
        bodyHtml = `
          <div class="tc-stack">
            <div id="cover-weather-block">${_weatherSection(trip)}</div>
            <p class="tc-sec-hint g-route-hint">Маршрут по дням пока не добавлен — его можно вписать вручную или загрузить файлом от ИИ: карандаш на обложке поездки → шаг 2.</p>
          </div>`;
        _maybeRefreshWeather(trip);
      }
      const welcomeHtml = _welcomeCard(trip);
      // «Мои дела» — под приветствием, если оно есть, иначе первой картой.
      // В прошедшей поездке «Мои дела» уже не нужны.
      const todoHtml = (window.APP?.user?.uid && trip.status !== 'done') ? _todoCard(trip) : '';
      _activityLimit = 10;
      _todoCollapsed = _loadTodoCollapsed();
      panel.innerHTML = ((welcomeHtml || todoHtml) ? `<div class="tc-stack">${welcomeHtml}${todoHtml}</div>` : '')
        + bodyHtml
        + `<div class="tc-stack">`
        // Порядок по смыслу: где живём → как добираемся → документы.
        + `<div id="g-lodging-section" class="tc-group">${_lodgingCard(trip)}</div>`
        + `<div id="g-travel-section" class="tc-group">${_travelSection(trip)}</div>`
        + `<div id="g-passports-section" class="tc-group">${_passportsSection(trip)}</div>`
        + `<div id="g-activity-block" class="tc-group"><div id="g-activity-head">${_activityHead()}</div><div id="g-activity-section">${_activitySection()}</div></div>`
        + `<div id="g-notes-block" class="tc-group"><div id="g-notes-head">${_notesHead(tripId)}</div>${_notesComposer()}<div id="g-notes-section">${_notesSection(tripId)}</div></div>`
        + `</div><div class="g-info-bottom-pad"></div>`;
      _loadPassports(trip);
      if (trip.type === 'fishing' && trip.status !== 'done') { _patchGearSub(trip); _patchGearReady(trip); }
      _listenNotes(tripId);
      _listenActivity(tripId);
      _bindTodoSwipe();
      _loadTodoAsync(trip);
    } else if (tabId === 'rivers') {
      if (typeof RiversIndex !== 'undefined') RiversIndex.init(panel, window.APP?.currentTripData, tripId);
    } else if (tabId === 'menu') {
      if (typeof MenuIndex !== 'undefined') MenuIndex.show(panel, tripId);
    } else if (tabId === 'bar') {
      // Бар не привязан к поездке — та же общая карта, что и в шторке;
      // вкладка здесь чисто навигационное удобство, данные не меняются.
      if (typeof BarIndex !== 'undefined') BarIndex.show(panel);
    } else if (tabId === 'catches') {
      if (typeof CatchesIndex !== 'undefined') CatchesIndex.show(panel, tripId);
    } else if (tabId === 'expenses') {
      if (typeof ExpensesIndex !== 'undefined') ExpensesIndex.show(panel, tripId);
    } else if (tabId === 'shopping') {
      if (typeof ShoppingIndex !== 'undefined') ShoppingIndex.show(panel, tripId);
    } else if (tabId === 'safety') {
      // Общая справка (правила по медведям, федеральные номера) — как Бар,
      // но локальные контакты/лицензии — per-trip, см. modules/safety/render.js.
      if (typeof SafetyIndex !== 'undefined') SafetyIndex.show(panel, () => {}, tripId);
    } else if (tabId === 'recipes') {
      if (typeof RecipesIndex !== 'undefined') RecipesIndex.show(panel);
    }

    requestAnimationFrame(() => { panel.style.opacity = '1'; });
  }

  // Лист «Вкладки Гида» (макет V2GuideTabs) — переключатель «Для всех /
  // Только у меня» в одном листе:
  // • «Для всех» — общий набор/порядок вкладок поездки (trip.guideTabs,
  //   видят все участники): кружок включает/выключает, стрелки переставляют.
  //   Сохраняем даже частично выключенный список ("Приобье" не нужен Бар).
  // • «Только у меня» — личное скрытие поверх общего набора
  //   (members/{uid}.hiddenGuideTabs, действует на всех поездках) — та же
  //   настройка, что «Мои вкладки Гида» в профиле (modules/members), здесь
  //   просто ещё один вход в неё.
  // Инфо всегда первой и обязательной — показана строкой «всегда».
  function _showGuideTabsSettings(trip) {
    const visible = _guideTabIds(trip).filter(id => id !== 'info');
    const hiddenIds = _DEFAULT_TAB_ORDER.filter(id => !visible.includes(id));
    const order = [...visible, ...hiddenIds];
    const checked = new Set(visible);
    const initialHidden = _personallyHiddenTabIds().filter(id => _ALL_TAB_DEFS[id]);
    const personalHidden = new Set(initialHidden);
    const canPersonal = !!window.APP?.profile?.uid;
    let mode = 'all';

    const HINTS = {
      all: 'Какие разделы есть в этой поездке — видят все участники. Порядок — стрелками.',
      mine: 'Скрытые здесь вкладки не покажутся лично у тебя — ни в Гиде, ни в меню — на всех поездках. Остальные участники их видят.',
    };
    const check = on => `<span class="tc-check ${on ? 'done' : ''}">${on ? UIUtils.ico('check') : ''}</span>`;
    const infoRow = `<div class="tc-tabrow"><span class="tc-tabrow-toggle">${check(true)}<span class="tc-tabrow-label">Инфо</span></span><span class="tc-muted">всегда</span></div>`;

    function renderRows() {
      if (mode === 'all') {
        return infoRow + order.map((id, i) => `
          <div class="tc-tabrow">
            <button type="button" class="tc-tabrow-toggle" role="checkbox" aria-checked="${checked.has(id)}" data-gts-check="${id}">
              ${check(checked.has(id))}<span class="tc-tabrow-label">${_esc(_ALL_TAB_DEFS[id].label)}</span>
            </button>
            <button type="button" class="gts-arrow" data-gts-up="${id}" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>${UIUtils.ico('chevron-up')}</button>
            <button type="button" class="gts-arrow" data-gts-down="${id}" aria-label="Ниже" ${i === order.length - 1 ? 'disabled' : ''}>${UIUtils.ico('chevron-down')}</button>
          </div>`).join('');
      }
      return infoRow + order.map(id => `
        <div class="tc-tabrow">
          <button type="button" class="tc-tabrow-toggle" role="checkbox" aria-checked="${!personalHidden.has(id)}" data-pgt-check="${id}" ${canPersonal ? '' : 'disabled'}>
            ${check(!personalHidden.has(id))}<span class="tc-tabrow-label">${_esc(_ALL_TAB_DEFS[id].label)}</span>
          </button>
          ${checked.has(id) ? '' : '<span class="tc-muted">выключена в поездке</span>'}
        </div>`).join('');
    }

    function renderBody() {
      return `
        <div class="tc-seg" role="tablist">
          <button type="button" role="tab" class="tc-seg-btn ${mode === 'all' ? 'on' : ''}" aria-selected="${mode === 'all'}" data-gts-mode="all">Для всех</button>
          <button type="button" role="tab" class="tc-seg-btn ${mode === 'mine' ? 'on' : ''}" aria-selected="${mode === 'mine'}" data-gts-mode="mine">Только у меня</button>
        </div>
        <div class="tc-hint">${HINTS[mode]}</div>
        <div class="tc-tablist" id="gts-list">${renderRows()}</div>`;
    }

    const overlay = _openSheet('gts-overlay', 'Вкладки Гида', trip.name || '',
      `<div id="gts-body">${renderBody()}</div>`,
      { footer: '<button type="button" class="tc-btn-primary gts-save" data-action="gts-save">Сохранить</button>' });

    const rerender = () => {
      const b = overlay.querySelector('#gts-body');
      if (b) b.innerHTML = renderBody();
    };

    overlay.addEventListener('click', e => {
      const modeBtn = e.target.closest('[data-gts-mode]');
      if (modeBtn) { mode = modeBtn.dataset.gtsMode; rerender(); return; }
      const upId = e.target.closest('[data-gts-up]')?.dataset.gtsUp;
      if (upId) {
        const i = order.indexOf(upId);
        if (i > 0) { [order[i - 1], order[i]] = [order[i], order[i - 1]]; rerender(); }
        return;
      }
      const downId = e.target.closest('[data-gts-down]')?.dataset.gtsDown;
      if (downId) {
        const i = order.indexOf(downId);
        if (i < order.length - 1) { [order[i + 1], order[i]] = [order[i], order[i + 1]]; rerender(); }
        return;
      }
      const checkEl = e.target.closest('[data-gts-check]');
      if (checkEl) {
        const id = checkEl.dataset.gtsCheck;
        const willCheck = !checked.has(id);
        // Не даём снять последний чекбокс: пустой guideTabs:[] в Firestore
        // неотличим от "поле вообще не задано" (см. _guideTabIds выше) — то
        // есть при перерисовке всё равно показались бы ВСЕ табы, и настройка
        // "спрятать всё" молча откатилась бы сама собой.
        if (!willCheck && checked.size === 1) return;
        if (willCheck) checked.add(id); else checked.delete(id);
        rerender();
        return;
      }
      const pgtEl = e.target.closest('[data-pgt-check]');
      if (pgtEl) {
        const id = pgtEl.dataset.pgtCheck;
        if (personalHidden.has(id)) personalHidden.delete(id); else personalHidden.add(id);
        rerender();
        return;
      }
      if (e.target.closest('[data-action="gts-save"]')) {
        // Общий набор — пишем, только если реально поменяли: иначе у
        // поездки без guideTabs (= "все по умолчанию") зафиксировался бы
        // текущий дефолт, и новые вкладки потом сами не появлялись бы.
        const finalOrder = order.filter(id => checked.has(id));
        if (finalOrder.join(',') !== visible.join(',')) {
          trip.guideTabs = finalOrder;
          TripsData.updateTrip(trip.id, { guideTabs: finalOrder });
        }
        // Личное скрытие — members/{uid}.hiddenGuideTabs (как в профиле).
        const hiddenArr = _DEFAULT_TAB_ORDER.filter(id => personalHidden.has(id));
        const profile = window.APP?.profile;
        if (canPersonal && hiddenArr.join(',') !== _DEFAULT_TAB_ORDER.filter(id => initialHidden.includes(id)).join(',')
            && typeof MembersFirebase !== 'undefined') {
          MembersFirebase.updateProfile(profile.uid, { hiddenGuideTabs: hiddenArr });
          profile.hiddenGuideTabs = hiddenArr;
        }
        overlay.remove();
        const stripEl = document.getElementById('g-tabstrip');
        if (stripEl) stripEl.outerHTML = _renderTabStrip(trip);
        if (!_personalGuideTabIds(trip).includes(_activeGuideTab)) _mountGuideTab(trip, 'info');
      }
    });
  }

  // ── Быстрый выбор поездки — когда нажали нижнюю вкладку "Поездка", а
  // открытой поездки нет. Раньше сразу кидало в список ("Планы"); теперь,
  // если есть 2+ актуальных (не завершённых) поездки — короткий попап,
  // выбор сразу ведёт в Гид, без обложки/кнопки "Войти". Если актуальная
  // поездка ровно одна — заходим в неё сразу, без лишнего тапа. Если
  // актуальных нет вообще — как раньше, список поездок.
  function showQuickPicker() {
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getMine(window.APP?.user?.uid) : [])
      .filter(t => t.status !== 'done')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    if (!trips.length) {
      if (typeof onNavigate === 'function') onNavigate('trips');
      return;
    }
    if (trips.length === 1) {
      enterTrip(trips[0].id);
      return;
    }

    document.getElementById('trip-quickpick-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'trip-quickpick-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">В какую поездку?</div>
        <div class="tqp-list">
          ${trips.map(t => `
            <div class="tqp-row" data-trip-id="${t.id}">
              <div>
                <div class="tqp-name">${_esc(t.name)}</div>
                <div class="tqp-dates">${_dateRange(t.startDate, t.endDate)}</div>
              </div>
              <div class="badge ${TripsData.statusClass(t.status)}">${TripsData.statusLabel(t.status)}</div>
            </div>`).join('')}
        </div>
        <button class="tqp-all" data-action="tqp-all">Все поездки</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-trip-id]');
      if (row) { overlay.remove(); enterTrip(row.dataset.tripId); return; }
      if (e.target.closest('[data-action="tqp-all"]')) {
        overlay.remove();
        if (typeof onNavigate === 'function') onNavigate('trips');
      }
    });
  }

  // ── Снаряга: переход в модуль сразу на вкладке нужной поездки ──
  function _openGear(tripId) {
    if (window.APP) window.APP._gearOpenTrip = tripId;
    if (typeof onNavigate === 'function') onNavigate('gear');
  }

  // ── Снаряга: пикер источника при первом создании списка под поездку —
  // с нуля, из личного базового шаблона, или скопировать с любой другой
  // прошлой поездки пользователя (повторяющиеся направления типа Приобье). ──
  function _showGearSourcePicker(trip) {
    const uid = window.APP?.user?.uid;
    if (!uid || typeof GearData === 'undefined') return;
    const others = GearData.getTripList(uid).filter(t => t.id !== _tripId);

    document.getElementById('gear-source-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'tqp-overlay';
    overlay.id = 'gear-source-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Список снаряги — «${_esc(trip.name)}»</div>
        <div class="tqp-list">
          <div class="tqp-row" data-gear-source="template">
            <div class="tqp-name">Мой базовый шаблон</div>
          </div>
          <div class="tqp-row" data-gear-source="blank">
            <div class="tqp-name">Создать с нуля</div>
          </div>
          ${others.map(t => `
            <div class="tqp-row" data-gear-source="${t.id}">
              <div class="tqp-name">Как в «${_esc(t.name)}»</div>
            </div>`).join('')}
        </div>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', async e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-gear-source]');
      if (!row) return;
      const source = row.dataset.gearSource;
      overlay.remove();
      try {
        if (typeof GearModule !== 'undefined') {
          await GearModule.createTripList(uid, _tripId, trip.name, source);
        }
      } catch (err) {
        console.error('GearModule.createTripList:', err);
        alert('Не удалось создать список снаряги. Проверь соединение и попробуй ещё раз.');
        return;
      }
      hide();
      _openGear(_tripId);
    });
  }

  // Helpers
  function _dateRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end);
    if (start === end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  function _rub(val) {
    return Math.round(val || 0).toLocaleString('ru-RU') + '\u00A0₽'; // неразрывный: «₽» не уезжает на новую строку
  }


  // Раскрывашка-строка (карточка «Справочное», макет «Гид — Инфо»): плитка
  // с иконкой, заголовок, подпись, шеврон вниз. Раскрытие — общий
  // обработчик [data-target] в _guideHandler (он же подгружает iframe Windy).
  function _acc(title, bodyHtml, open, opts) {
    opts = opts || {};
    const id = 'gacc_' + Math.random().toString(36).slice(2);
    return `
      <div class="g-acc">
        <button type="button" class="tc-link-row g-acc-hd" data-target="${id}" aria-expanded="${!!open}">
          <span class="tc-tile ${opts.tone ? 'tc-tile--' + opts.tone : ''}">${UIUtils.ico(opts.icon || 'info-circle')}</span>
          <span class="tc-link-main"><span class="tc-link-title">${title}</span>${opts.sub ? `<span class="tc-link-sub">${opts.sub}</span>` : ''}</span>
          <span class="tc-link-right"><span class="g-acc-chev ${open ? 'open' : ''}">${UIUtils.ico('chevron-down')}</span></span>
        </button>
        <div class="g-acc-body ${open ? 'show' : ''}" id="${id}"><div class="g-acc-body-inner">${bodyHtml}</div></div>
      </div>`;
  }

  // Карта ветра (Windy) — свой анимированный ветровой рендер не наш
  // масштаб (у Windy на это WebGL-команда и лицензии на метеомодели).
  // Вместо велосипеда — их же бесплатный embed-виджет на координаты
  // поездки. Строка закрыта по умолчанию и iframe без src, пока не
  // откроют (data-src → src ставит _guideHandler при разворачивании) —
  // тяжёлая штука, незачем грузить сразу всем, кто открыл Гид. Общий для
  // Инфо экспедиций и рыбалок.
  function _windyAccordion(trip) {
    const windyCoords = _tripCoords(trip);
    if (!windyCoords) return '';
    const windySrc = `https://embed.windy.com/embed2.html?lat=${windyCoords.lat}&lon=${windyCoords.lon}&detailLat=${windyCoords.lat}&detailLon=${windyCoords.lon}&width=650&height=450&zoom=8&level=surface&overlay=wind&product=ecmwf&menu=&message=true&marker=true&calendar=now&pressure=&type=map&location=coordinates&detail=&metricWind=default&metricTemp=default&radarRange=-1`;
    return _acc('Карта ветра', `<div class="g-windy-wrap"><iframe class="g-windy-frame" data-src="${_esc(windySrc)}" loading="lazy" frameborder="0"></iframe></div>`, false,
      { icon: 'wind', tone: 'river', sub: 'Windy' });
  }

  // Содержимое таба "Инфо" у поездки с AI-импортом (макет «Гид — Инфо»):
  // Маршрут (дни, раскрываются), Рейсы, Справочное (погода, Windy, солнце
  // и приливы, план меню из импорта). Карточка «Сегодня» рисуется перед
  // этим в _mountGuideTab (#g-today-weather).
  function _renderGuideInfo(trip) {
    const d = trip.importData || {};
    let h = '';

    // ── Маршрут по дням ─────────────────────────────────────────────────
    // Array.isArray (не просто d.route truthy) — некорректный импорт мог
    // сохранить route СТРОКОЙ вместо массива дней ("День 1: аэропорт"
    // вместо [{t,rows}]); у строки тоже есть .length (проходил старый
    // guard) и .slice() (строки его тоже умеют), а вот .map() на
    // результате .slice() уже нет — весь раздел «Инфо» падал с "map is
    // not a function". Реальный баг, найден внешним ревью 2026-09-27.
    // Помогает и для уже сохранённых бракованных данных (см. валидацию
    // при самом чтении файла — modules/trips/index.js _readImportFile),
    // не только для новых импортов.
    if (Array.isArray(d.route) && d.route.length) {
      // Даты у дней маршрута — не отдельное поле (это заголовок-текст типа
      // "День 1 — прилёт"), а последовательные дни от trip.startDate; на
      // этом допущении и матчим погоду по дате, ключ той же формы кладём в
      // data-gwx-date для _patchGuideWeather (данные почти всегда приходят
      // позже первого рендера — сетевой запрос).
      const todayIdx = _todayRouteIdx(trip);
      const dayRow = (day, idx) => {
        const dayId = 'gday_' + idx;
        const wxDate = trip.startDate ? _addDaysStr(trip.startDate, idx) : '';
        const wxEntry = wxDate && trip.weatherDaily ? trip.weatherDaily.find(w => w.date === wxDate) : null;
        const n = (day.rows || []).length;
        return `
          <div class="tc-day">
            <button type="button" class="tc-link-row g-day-hd" data-target="${dayId}">
              <span class="tc-day-num ${idx === todayIdx ? 'on' : ''}">${idx + 1}</span>
              <span class="tc-link-main">
                <span class="tc-link-title">${_esc(_stripEmoji(day.t || ''))}</span>
                <span class="tc-link-sub">${idx === todayIdx ? 'сегодня · ' : ''}${n} ${_plural(n, 'пункт', 'пункта', 'пунктов')}${wxDate ? `<span class="tc-day-wx" data-gwx-date="${wxDate}">${_dayWeatherBadge(wxEntry)}</span>` : ''}</span>
              </span>
              <span class="tc-link-right"><span class="g-acc-chev">${UIUtils.ico('chevron-down')}</span></span>
            </button>
            <div class="g-day-body" id="${dayId}"><div class="g-acc-body-inner"><div class="tc-slots">${(day.rows || []).map(r => _slotRow(r[0], r[1])).join('')}</div></div></div>
          </div>`;
      };
      const SHOW = 3;
      const head = d.route.slice(0, SHOW).map((day, i) => dayRow(day, i)).join('');
      const rest = d.route.slice(SHOW);
      const restId = 'gdays_more';
      h += _secTitle('Маршрут', `<span class="tc-muted">${d.route.length} ${_plural(d.route.length, 'день', 'дня', 'дней')}</span>`)
        + `<section class="tc-card tc-card--list">${head}${rest.length ? `
            <button type="button" class="tc-more" data-target="${restId}">Ещё ${rest.length} ${_plural(rest.length, 'день', 'дня', 'дней')}</button>
            <div class="g-day-body" id="${restId}"><div class="g-acc-body-inner">${rest.map((day, i) => dayRow(day, i + SHOW)).join('')}</div></div>` : ''}
          </section>`;
    }

    // ── Рейсы ────────────────────────────────────────────────────────────
    // Array.isArray — та же защита, что у маршрута выше.
    if (Array.isArray(d.flights) && d.flights.length) {
      h += _secTitle('Рейсы') + `<section class="tc-card tc-card--list">${d.flights.map(f => `
        <div class="tc-flight">
          <span class="tc-flight-code">${_esc(f.flight || '')}</span>
          <span class="tc-link-main">
            <span class="tc-link-title">${_esc(f.route)}</span>
            <span class="tc-link-sub">${_esc(f.dep || '')}${f.arr ? ' → прилёт ' + _esc(f.arr) : ''}</span>
          </span>
        </div>`).join('')}</section>`;
    }

    // ── Справочное ───────────────────────────────────────────────────────
    let ref = _weatherChartsSection(trip) + _windyAccordion(trip);

    if (d.suntide && d.suntide.length) {
      // Приливы есть только у моря. На реках/озёрах (Обь, Иртыш) ИИ пишет
      // «Без приливов (река)» — тогда блок только про солнце, без строки
      // приливов и без слова «приливы» в заголовке.
      const realTide = t => !!t && /прилив|отлив/i.test(t) && !/без\s+прилив/i.test(t);
      const hasTides = d.suntide.some(s => realTide(s.tide));
      const sb = d.suntide.map(s => `
        <div class="tc-tide">
          <div><div class="tc-tide-date">${_esc(s.date)}</div><div class="tc-tide-sun">${_esc(s.sun)}</div></div>
          ${hasTides && realTide(s.tide) ? `<div class="tc-tide-info">${_esc(s.tide)}</div>` : ''}
        </div>`).join('');
      ref += _acc(hasTides ? 'Солнце и приливы' : 'Восход и закат', sb, false,
        { icon: 'sunrise', tone: 'accent', sub: `на все ${d.suntide.length} ${_plural(d.suntide.length, 'день', 'дня', 'дней')}` });
    }

    // План меню из AI-импорта — только чтение (данные: trip.importData.menu,
    // приходят с JSON-импортом маршрута). Живое планирование с рецептами —
    // во вкладке «Меню».
    // Array.isArray — та же защита, что у маршрута выше.
    if (Array.isArray(d.menu) && d.menu.length) {
      const mb = d.menu.map((day, idx) => {
        const dayId = 'gmenu_' + idx;
        return `
          <button type="button" class="tc-link-row tc-link-row--sub g-day-hd" data-target="${dayId}">
            <span class="tc-link-main"><span class="tc-link-title">${_esc(day.day)}${day.date ? ' — ' + _esc(day.date) : ''}${day.special ? ' ' + UIUtils.ico('star') : ''}</span></span>
            <span class="tc-link-right"><span class="g-acc-chev">${UIUtils.ico('chevron-down')}</span></span>
          </button>
          <div class="g-day-body" id="${dayId}"><div class="g-acc-body-inner"><div class="tc-slots">
            ${(day.meals || []).map(meal => `
              <div class="tc-slot"><span class="tc-slot-time">${_esc(meal.type)}</span>
              <span class="tc-slot-text">${_esc(meal.text)}${meal.cocktail ? ' · ' + UIUtils.ico('glass-cocktail') + ' ' + _esc(meal.cocktail) : ''}</span></div>`).join('')}
          </div></div></div>`;
      }).join('');
      const impBtn = `<div class="tc-menu-imp"><button type="button" class="tc-btn-secondary" data-action="tc-menu-import">${UIUtils.ico('tools-kitchen-2')} Перенести в Меню</button>
        <span class="tc-field-hint">займёт только пустые позиции — уже выбранные блюда не тронет</span></div>`;
      ref += _acc('План меню из импорта', mb + impBtn, false,
        { icon: 'tools-kitchen-2', sub: `${d.menu.length} ${_plural(d.menu.length, 'день', 'дня', 'дней')} · можно перенести во вкладку «Меню»` });
    }

    if (ref.replace('<div id="g-weather-charts"></div>', '').trim()) {
      h += _secTitle('Справочное') + `<section class="tc-card tc-card--list">${ref}</section>`;
    } else {
      h += ref; // пустой плейсхолдер погоды — чтобы данные могли подставиться позже
    }
    return h;
  }


  // Полный список настраиваемых вкладок (id+label) — источник правды один
  // (тут же, рядом с _ALL_TAB_DEFS), нужен профилю (modules/members/*)
  // для сборки шита персональных настроек, у себя дублировать нечего.
  function allGuideTabDefs() {
    return _DEFAULT_TAB_ORDER.map(id => ({ id, label: _ALL_TAB_DEFS[id].label }));
  }

  // Пересобрать полоску вкладок в уже открытом Гиде — нужно сразу после
  // сохранения персональных настроек (modules/members/render.js), пока
  // пользователь ещё может стоять на самой поездке; если Гид сейчас не
  // смонтирован (trip !== _tripId или #g-tabstrip не в DOM), no-op —
  // подтянется само при следующем enterTrip().
  function refreshTabStripIfMounted(tripId) {
    if (tripId !== _tripId) return;
    const stripEl = document.getElementById('g-tabstrip');
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(tripId) : null;
    if (!stripEl || !trip) return;
    stripEl.outerHTML = _renderTabStrip(trip);
    if (!_personalGuideTabIds(trip).includes(_activeGuideTab)) _mountGuideTab(trip, 'info');
  }

  // Переключить вкладку Гида изнутри вложенного модуля (например "Улов" →
  // "Реки" по клику на реку в статистике) без выхода из самого Гида —
  // модуль сам не знает, встроен ли он сейчас в Гид или открыт отдельным
  // полноэкранным заходом через гамбургер, поэтому решение и переключение
  // тут, а не в вызывающем коде. Возвращает false, если Гид сейчас не
  // смонтирован на этой же поездке (значит вызывающий модуль открыт не
  // внутри Гида) — тогда вызывающая сторона сама решает, как перейти
  // (обычно старым способом — onNavigate + отдельная страница).
  // «Перенести в Меню» — для поездок, импортированных до того, как план
  // стал уходить в Меню автоматически (см. MenuFirebase.importPlan).
  async function _importMenuPlan(trip, btn) {
    const plan = trip.importData?.menu;
    if (!plan?.length || typeof MenuFirebase === 'undefined' || !MenuFirebase.importPlan) return;
    const ok = await UIUtils.confirmSheet('Блюда из плана лягут в пустые позиции Меню по дням. Уже выбранное останется как есть.',
      { title: 'Перенести план в Меню?', okLabel: 'Перенести', danger: false });
    if (!ok) return;
    btn.disabled = true;
    try {
      const n = await MenuFirebase.importPlan(trip.id, trip.startDate, trip.endDate, plan);
      await UIUtils.confirmSheet(n ? `Добавлено позиций: ${n}. Смотри во вкладке «Меню».` : 'Свободных позиций под план не нашлось — Меню уже заполнено.',
        { title: n ? 'Готово' : 'Нечего переносить', okLabel: 'Понятно', cancelLabel: 'Закрыть', danger: false });
    } catch (e) {
      console.error('menu importPlan:', e);
      UIUtils.confirmSheet('Не получилось — проверь интернет и попробуй ещё раз.', { title: 'Не перенеслось', okLabel: 'Понятно', danger: false });
    } finally { btn.disabled = false; }
  }

  // importData пишет и файл от ИИ, и ручной ввод в мастере («Вручную»
  // собирает ту же форму). От ИИ — если есть что-то сверх ручного
  // (рейсы, меню, приливы, подробная meta); ручной помечен source:'manual'.
  function _isAiImport(d) {
    if (!d || d.source === 'manual') return false;
    return !!(d.flights?.length || d.menu?.length || d.suntide || Object.keys(d.meta || {}).length > 1);
  }

  function switchGuideTab(tripId, tabId) {
    if (tripId !== _tripId) return false;
    const trip = typeof TripsData !== 'undefined' ? TripsData.getById(tripId) : null;
    if (!trip || !document.getElementById('g-tabstrip')) return false;
    _mountGuideTab(trip, tabId);
    return true;
  }

  return {
    show, hide, enterTrip, showQuickPicker, visibleGuideTabs, getCurrentTripId: () => _tripId,
    allGuideTabDefs, refreshTabStripIfMounted, switchGuideTab,
  };
})();

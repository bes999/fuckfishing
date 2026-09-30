'use strict';

const TripsIndex = (() => {

  let _el = null;
  let _createStep = 0;
  let _draft = {};
  let _rivers = [];
  let _importedData = null;   // JSON от AI для экспедиций (или собранный из квиза — та же форма)
  let _importFileLoaded = false; // в этом сеансе мастера загрузили файл — план меню уйдёт в «Меню»
  let _expMode = 'quiz';      // 'quiz' | 'file' — способ заполнения данных маршрута экспедиции
  let _quizRivers = [];       // реки, добавленные вручную в квизе (name+region, без карты)
  let _quizRouteText = '';    // сырой текст маршрута по дням из квиза, парсится в route[]
  let _dateTouched = false;   // true, если пользователь сам менял поля дат (не просто дефолт "сегодня")
  let _editMode   = false;    // true = редактирование существующей поездки
  let _editTripId = null;     // id редактируемой поездки
  // Счётчик сеансов мастера (создание/правка) — растёт на КАЖДОЕ открытие
  // формы (showCreate/showEdit). FileReader.onload асинхронный: начали
  // читать файл для поездки А → закрыли форму → открыли создание Б → чтение
  // А закончилось ПОЗЖЕ — без этой проверки его результат (_importedData)
  // записывался бы в уже другой, текущий черновик Б. Реальный баг, найден
  // внешним ревью 2026-09-27. _readImportFile запоминает номер СВОЕГО
  // сеанса при вызове и сверяет его в onload — если сеанс сменился, просто
  // не применяет устаревший результат.
  let _createSeq  = 0;
  let _travelOn   = false;    // переключатель «кто-то едет по своему расписанию» (шаг 2)

  // «Взять за основу прошлую поездку» (шаг 0, только при СОЗДАНИИ новой —
  // см. _showCopyFromSheet/_applyCopyFrom). _copyFromLabel — название
  // поездки-источника, подставляется плейсхолдером в поле «Название» (само
  // название не копируем — см. бриф); _copiedReadiness — пункты готовности
  // источника со снятыми отметками, подставляются в _save() вместо
  // TripsData.getDefaultReadiness() для новой экспедиции.
  let _copyFromLabel   = '';
  let _copiedReadiness = null;

  // Табы Гида для этой поездки — какие видны и в каком порядке. Дублирует
  // список из modules/tripcover/index.js (там он приватный, скрипт грузится
  // позже, а этот файл ничего не рендерит по загрузке — только по клику
  // пользователя, так что порядок скриптов тут не важен, дублировать проще,
  // чем городить публичный геттер ради восьми строк). null = "показать всё"
  // (тот же дефолт, что и когда trip.guideTabs вообще не задан).
  const _GUIDE_TAB_DEFS = {
    rivers:   'Места',   // вкладка «Реки» в интерфейсе теперь «Места» (id прежний)
    menu:     'Меню',
    bar:      'Бар',
    catches:  'Улов',
    expenses: 'Расходы',
    shopping: 'Закупка',
    safety:   'Безопасность',
    recipes:  'Рецепты',
  };
  const _GUIDE_TAB_DEFAULT_ORDER = ['rivers', 'menu', 'bar', 'catches', 'expenses', 'shopping', 'safety', 'recipes'];
  let _draftGuideTabOrder = [..._GUIDE_TAB_DEFAULT_ORDER]; // порядок всех 8 (видимых и скрытых)
  let _draftGuideTabsChecked = new Set(_GUIDE_TAB_DEFAULT_ORDER); // какие видны

  function init(el) {
    _el = el;
    render();
  }

  function render() {
    TripsRender.render(_el);
  }

  function openTrip(tripId) {
    TripCoverIndex.show(tripId);
  }

  // ═══════════════════════════════
  // CREATE FLOW
  // ═══════════════════════════════

  function showCreate(prefillDate) {
    // Слой мог быть снят навигацией (index.html) без _closeCreate — тогда
    // флаг правки остался бы висеть и «новая» поездка сохранилась бы поверх старой.
    _createSeq++;
    _editMode   = false;
    _editTripId = null;
    _createStep = 0;
    _importFileLoaded = false;
    _importedData = null;
    _expMode = 'quiz';
    _quizRivers = [];
    _quizRouteText = '';
    _draftGuideTabOrder = [..._GUIDE_TAB_DEFAULT_ORDER];
    _draftGuideTabsChecked = new Set(_GUIDE_TAB_DEFAULT_ORDER);
    _dateTouched = !!prefillDate;
    _copyFromLabel = '';
    _copiedReadiness = null;
    // Создатель поездки — сразу в участниках, чтобы не вписывать себя
    // вручную каждый раз; можно убрать кликом по чипу, как любого другого.
    const myName = window.APP?.profile?.displayName || '';
    const myUid  = window.APP?.user?.uid || null;
    _draft = {
      type: 'fishing',
      name: '',
      startDate: prefillDate || _today(),
      endDate:   prefillDate || _today(),
      rivers: [],
      participants: myName ? [{ name: myName, uid: myUid }] : [],
      icon: '',
      comment: '',
      private: false,
      inviteRestricted: false,
    };
    _travelOn = false;
    _rivers = [];
    _renderCreate();
  }

  // step — необязательно, открыть мастер сразу на конкретном шаге (0-based,
  // как _createStep) вместо шага 0. Нужно подсказке «маршрут не добавлен» в
  // Инфо (см. modules/tripcover/index.js:_mountGuideTab) — раньше она текстом
  // отправляла на «карандаш на обложке → шаг 2», а кнопки не было вовсе,
  // и человеку приходилось искать этот карандаш и сам жать «Далее» до шага 2.
  function showEdit(tripId, step) {
    const trip = TripsData.getById(tripId);
    if (!trip) return;

    _createSeq++;
    _editMode   = true;
    _editTripId = tripId;
    _importFileLoaded = false;
    _createStep = (typeof step === 'number' && step >= 0 && step <= 2) ? step : 0;
    _importedData = trip.importData || null;
    _expMode = _importedData ? 'file' : 'quiz';
    // Без этого квиз при редактировании стартовал с пустого списка рек,
    // хотя в поездке они уже были — первое же добавление новой реки через
    // квиз при сохранении тихо ЗАМЕНЯЛО весь trip.rivers (см. _save), а не
    // дополняло его, и уже сохранённые реки пропадали.
    _quizRivers = trip.type === 'expedition'
      ? (trip.rivers || []).map(r => ({ id: r.id || _genRiverId(), name: r.name, region: r.region || '' }))
      : [];
    _quizRouteText = '';
    const savedTabs = (trip.guideTabs || []).filter(id => _GUIDE_TAB_DEFS[id]);
    const hiddenTabs = _GUIDE_TAB_DEFAULT_ORDER.filter(id => !savedTabs.includes(id));
    _draftGuideTabOrder = savedTabs.length ? [...savedTabs, ...hiddenTabs] : [..._GUIDE_TAB_DEFAULT_ORDER];
    _draftGuideTabsChecked = new Set(savedTabs.length ? savedTabs : _GUIDE_TAB_DEFAULT_ORDER);
    _dateTouched = true;

    _draft = {
      type:         trip.type,
      name:         trip.name,
      startDate:    trip.startDate,
      endDate:      trip.endDate,
      rivers:       trip.rivers || [],
      participants: trip.participants ? trip.participants.map(p => ({ ...p })) : [],
      icon:         trip.icon || '',
      comment:      trip.comment || '',
      private:      !!trip.private,
      inviteRestricted: !!trip.inviteRestricted,
    };
    _rivers = trip.type === 'fishing' ? [...(trip.rivers || [])] : [];
    _travelOn = _draft.participants.some(p => p.travelSeparate);

    _renderCreate();
  }

  // ─── Мастер создания/правки (макеты v2: V2Create1/2/3, V2CreateFish2) ───
  // Полноэкранный слой: шапка с ×, полоска из трёх шагов, тело, снизу —
  // «Назад» + главная кнопка. id create-overlay оставлен прежним: его
  // снимает навигация в index.html (_doNavigate).

  const _SEARCH_SVG = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>';
  const _FILE_SVG = '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3h8l4 4v14H6z"/><path d="M14 3v4h4"/></svg>';
  const _MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

  function _renderCreate() {
    document.getElementById('create-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'create-overlay';
    overlay.className = 'cw-overlay';
    overlay.innerHTML = `
      <div class="cw-sheet">
        <div class="cw-head" id="create-topbar-el">${_createTopbar()}</div>
        <div class="cw-body" id="create-body">${_createStepContent()}</div>
        <div class="cw-footer" id="create-footer-el">${_createFooter()}</div>
      </div>`;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    // Удаление мест — свайпом влево (тело мастера живёт всё время, строки
    // внутри перерисовываются — как и требует UIUtils.swipeToDelete).
    UIUtils.swipeToDelete(document.getElementById('create-body'), '.cw-place-row', '.cw-place-del');

    _bindCreate(overlay);
  }

  function _createTopbar() {
    const isExp = _draft.type === 'expedition';
    const what = ['что и когда', isExp ? 'кто и куда' : 'где и с кем', 'проверь'][_createStep];
    const title = _editMode
      ? 'Изменить поездку'
      : (_createStep === 1 && !isExp ? 'Новая рыбалка' : 'Новая поездка');
    const sub = _editMode
      ? `${_esc(_draft.name || _autoName())} · шаг ${_createStep + 1} из 3`
      : `шаг ${_createStep + 1} из 3 · ${what}`;
    return `
      <button type="button" class="cw-close" id="createClose" aria-label="Закрыть">${UIUtils.ico('x')}</button>
      <div class="cw-head-text">
        <span class="cw-title">${title}</span>
        <span class="cw-sub">${sub}</span>
      </div>`;
  }

  function _steps() {
    return `<div class="cw-steps">${[0, 1, 2].map(i =>
      `<span class="cw-step ${i <= _createStep ? 'on' : ''}"></span>`).join('')}</div>`;
  }

  function _label(text, hint) {
    return `<div class="cw-label"><span class="cw-label-t">${text}</span>${hint ? `<span class="cw-label-h">${hint}</span>` : ''}</div>`;
  }

  // Переключатель-строка (role=switch). Состояние меняется на месте, без
  // перерисовки шага — см. _bindCreate.
  function _switch(id, text, on) {
    return `
      <button type="button" role="switch" class="cw-switch-row" id="${id}" aria-checked="${on ? 'true' : 'false'}">
        <span class="cw-switch-text">${text}</span>
        <span class="cw-switch"><span></span></span>
      </button>`;
  }

  function _check(on) {
    return `<span class="cw-check ${on ? 'on' : ''}">${UIUtils.ico('check')}</span>`;
  }

  function _createStepContent() {
    let h;
    if (_createStep === 0) h = _step0();
    else if (_createStep === 1) {
      // КЛЮЧЕВОЕ ВЕТВЛЕНИЕ: экспедиция — маршрут вручную/файлом, рыбалка — места по OSM
      h = _draft.type === 'expedition' ? _step1Expedition() : _step1Fishing();
    } else h = _step2();
    return h + _deleteButton();
  }

  // «Удалить поездку» — на любом шаге правки, не только на последнем
  // (раньше висела только на «Проверьте данные», и чтобы удалить,
  // приходилось пройти весь мастер — Дмитрий справедливо назвал это
  // бредом). Только у того, кто создал поездку (trip.ownerId).
  function _deleteButton() {
    const editingTrip = _editMode && _editTripId ? TripsData.getById(_editTripId) : null;
    const isTripOwner = TripsData.canManage(editingTrip);
    return isTripOwner ? `<button type="button" class="cw-delete" id="createDelete">Удалить поездку</button>` : '';
  }

  // ─── Шаг 0: тип, название, даты ─────────────────────────────────────────

  function _fmtDay(iso) {
    if (!iso) return '';
    const d = new Date(iso);
    if (isNaN(d)) return iso;
    return `${d.getDate()} ${_MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`;
  }

  function _step0() {
    const t = _draft.type;
    return `
      ${_steps()}
      <div class="cw-types">
        <button type="button" class="cw-type exp ${t === 'expedition' ? 'on' : ''}" data-type="expedition" aria-pressed="${t === 'expedition'}">
          <span class="cw-type-ico">${UIUtils.ico('mountain')}</span>
          <span class="cw-type-name">Экспедиция</span>
          <span class="cw-type-sub">несколько дней, несколько участников</span>
        </button>
        <button type="button" class="cw-type fish ${t === 'fishing' ? 'on' : ''}" data-type="fishing" aria-pressed="${t === 'fishing'}">
          <span class="cw-type-ico">${UIUtils.ico('fishing')}</span>
          <span class="cw-type-name">Рыбалка</span>
          <span class="cw-type-sub">1–2 дня, завести быстро</span>
        </button>
      </div>
      ${!_editMode ? `<button type="button" class="cw-link" id="copyFromBtn">Взять за основу прошлую поездку</button>` : ''}

      ${_label('Название', 'можно пустым — придумаем по месту и датам')}
      <input class="cw-input" id="f-name" type="text"
             placeholder="${_copyFromLabel ? `Как «${_esc(_copyFromLabel)}»` : (t === 'expedition' ? 'Например, Сахалин 2027' : 'Например, Ока, 15 марта')}"
             value="${_esc(_draft.name)}">

      ${_label('Иконка', 'для списка поездок — цвет всё равно по типу')}
      <div class="cw-icons ${t === 'expedition' ? 'exp' : 'fish'}" id="f-icons">
        ${TripsData.TRIP_ICONS.map(ic => {
          const on = (_draft.icon || '') === ic || (!_draft.icon && ic === (t === 'expedition' ? 'mountain' : 'fishing'));
          return `<button type="button" class="cw-icon ${on ? 'on' : ''}" data-icon="${ic}" aria-pressed="${on}" aria-label="Иконка ${ic}">${UIUtils.ico(ic)}</button>`;
        }).join('')}
      </div>

      ${_label('Даты')}
      <div class="cw-dates">
        <label class="cw-date">
          <span class="cw-date-k">с</span>
          <span class="cw-date-v" id="f-start-v">${_fmtDay(_draft.startDate) || 'выбрать'}</span>
          <input type="date" id="f-start" value="${_esc(_draft.startDate)}" aria-label="Дата начала">
        </label>
        <label class="cw-date">
          <span class="cw-date-k">по</span>
          <span class="cw-date-v" id="f-end-v">${_fmtDay(_draft.endDate) || '—'}</span>
          <input type="date" id="f-end" value="${_esc(_draft.endDate)}" aria-label="Дата окончания">
        </label>
      </div>
      <span class="cw-hint cw-hint--tight">Нажми «с» или «по» — откроется календарь. Рыбалка на один день — одна и та же дата.</span>`;
  }

  // ─── Шаг 1 ЭКСПЕДИЦИЯ: участники + маршрут вручную или файлом от ИИ ────

  function _step1Expedition() {
    const imported = _importedData;
    const hasData  = !!imported;

    // Превью, если данные уже загружены (файл от ИИ)
    const previewHtml = hasData ? `
      <div class="cw-import-ok">
        <div class="cw-import-ok-title">${UIUtils.ico('circle-check')} Данные загружены</div>
        <div class="cw-import-chips">
          ${imported.route  ?.length ? `<span class="cw-import-chip">${UIUtils.ico('calendar')} ${imported.route.length} дн.</span>`  : ''}
          ${imported.rivers ?.length ? `<span class="cw-import-chip">${UIUtils.ico('map-pin')} ${imported.rivers.length} мест</span>` : ''}
          ${imported.menu   ?.length ? `<span class="cw-import-chip">${UIUtils.ico('tools-kitchen-2')} Меню</span>`   : ''}
          ${imported.flights?.length ? `<span class="cw-import-chip">${UIUtils.ico('plane')} Рейсы</span>` : ''}
        </div>
        <button type="button" class="cw-link" id="importReset">Заменить файл</button>
      </div>` : '';

    const uploadHtml = !hasData ? `
      <div class="cw-dropzone" id="importDropzone">
        <span class="cw-dz-ico">${UIUtils.ico('robot')}</span>
        <span class="cw-dz-title">Загрузить данные маршрута</span>
        <span class="cw-dz-sub">JSON-файл, подготовленный ИИ — маршрут, места, меню</span>
        <label class="cw-dz-btn" for="importFile">Выбрать файл</label>
        <input type="file" id="importFile" accept=".json" hidden>
        <span class="cw-dz-hint">или перетащи файл сюда · можно пропустить — просто «Дальше»</span>
      </div>` : '';

    const placesHtml = _quizRivers.length ? `
      <section class="cw-card cw-card--list">
        ${_quizRivers.map((r, i) => _placeRow(r.name, r.region, `data-quiz-river-idx="${i}"`, '', `data-quiz-river-edit="${i}"`)).join('')}
      </section>` : '';

    const quizHtml = `
      ${placesHtml}
      <input class="cw-input" id="f-quiz-place" type="text" placeholder="Река или место — «Обь»" autocomplete="off">
      <div class="cw-add-row">
        <input class="cw-input" id="f-quiz-region" type="text" placeholder="Регион — необязательно" autocomplete="off">
        <button type="button" class="cw-add-btn" id="quizRiverAdd" aria-label="Добавить место">${UIUtils.ico('plus')}</button>
      </div>
      <span class="cw-hint cw-hint--err" id="f-quiz-place-err" hidden></span>
      <section class="cw-card cw-route">
        <span class="cw-route-t">Маршрут по дням — необязательно</span>
        <textarea class="cw-textarea cw-route-ta" id="f-quiz-route" rows="6"
                  placeholder="День 1 — прилёт:&#10;09:15 Прилёт, багаж&#10;13:00 Выезд на реку&#10;&#10;День 2 — рыбалка:&#10;Целый день на воде">${_esc(_quizRouteText)}</textarea>
        <span class="cw-hint">Строка с двоеточием на конце — новый день. Время можно указать в начале строки.</span>
      </section>`;

    return `
      ${_steps()}
      ${_participantsField()}

      ${_label('Маршрут и места', 'выбери, как удобнее')}
      <div class="cw-seg cw-seg--tight" role="tablist">
        <button type="button" role="tab" class="cw-seg-btn ${_expMode === 'quiz' ? 'on' : ''}" aria-selected="${_expMode === 'quiz'}" data-exp-mode="quiz">${UIUtils.ico('pencil')}Вручную</button>
        <button type="button" role="tab" class="cw-seg-btn ${_expMode === 'file' ? 'on' : ''}" aria-selected="${_expMode === 'file'}" data-exp-mode="file">${_FILE_SVG}Файл от ИИ</button>
      </div>

      ${_expMode === 'quiz' ? quizHtml : `${previewHtml}${uploadHtml}`}

      ${_accessField()}`;
  }

  // Строка места: удаляется свайпом влево (кнопка «Удалить» под строкой —
  // см. UIUtils.swipeToDelete и .cw-place-del в styles.css).
  function _placeRow(name, region, delAttr, type, editAttr) {
    return `
      <div class="cw-place-row" ${editAttr || ''}>
        <span class="cw-place-ico">${UIUtils.ico('map-pin')}</span>
        <span class="cw-place-body">
          <span class="cw-place-name">${_esc(name)}</span>
          ${region || type ? `<span class="cw-place-sub">${_esc([type, region].filter(Boolean).join(' · '))}</span>` : ''}
        </span>
        <button type="button" class="cw-place-del" ${delAttr} aria-label="Удалить место"></button>
      </div>`;
  }

  // ─── Шаг 1 РЫБАЛКА: где (OSM) + с кем + комментарий + доступ ────────────

  function _step1Fishing() {
    const placesHtml = _rivers.length ? `
      <section class="cw-card cw-card--list">
        ${_rivers.map((r, i) => _placeRow(r.name, r.region, `data-river-idx="${i}"`, r.type)).join('')}
      </section>` : '';

    return `
      ${_steps()}
      ${_label('Где', 'река или водоём — координаты подтянутся сами (OpenStreetMap)')}
      ${placesHtml}
      <label class="cw-search">
        ${_SEARCH_SVG}
        <input id="f-river" type="text" placeholder="${_rivers.length ? 'Добавить ещё место…' : 'Поиск реки или водоёма…'}" autocomplete="off" aria-label="Поиск реки или водоёма">
      </label>
      <div class="cw-suggest" id="riverSuggestions">${_defaultRiverChips()}</div>

      ${_participantsField()}

      ${_label('Комментарий', 'необязательно')}
      <textarea class="cw-textarea" id="f-comment"
                placeholder="На что планируем ловить, заметки…">${_esc(_draft.comment)}</textarea>

      ${_accessField()}`;
  }

  // ─── Шаг 2: сводка + вкладки Гида ───────────────────────────────────────

  function _step2() {
    const isExp = _draft.type === 'expedition';
    const dates = typeof TripsRender !== 'undefined' && TripsRender.dateRangeLong
      ? TripsRender.dateRangeLong(_draft.startDate, _draft.endDate)
      : `${_draft.startDate} – ${_draft.endDate}`;

    // Места: для экспедиции — из importedData.rivers, если есть
    let places = '';
    if (isExp && _importedData?.rivers?.length) {
      places = _importedData.rivers.map(r => r.name).join(', ');
    } else if (_rivers.length) {
      places = _rivers.map(r => r.name).join(', ');
    }

    const parts = TripsData.participantNames(_draft).join(', ');

    // Строка маршрута для экспедиции (что пришло из файла/ручного ввода)
    const routeBits = isExp && _importedData ? [
      _importedData.route  ?.length ? `${_importedData.route.length} дн.` : '',
      _importedData.menu   ?.length ? 'меню' : '',
      _importedData.flights?.length ? 'рейсы' : '',
    ].filter(Boolean).join(' · ') : '';

    const access = [
      _draft.private ? 'приватная' : 'открытая',
      _draft.inviteRestricted ? 'добавляет только организатор' : '',
    ].filter(Boolean).join(' · ');

    const row = (k, v) => `<div class="cw-sum-row"><span class="cw-sum-k">${k}</span><span class="cw-sum-v">${v}</span></div>`;

    return `
      ${_steps()}
      <section class="cw-card cw-summary">
        <span class="cw-sum-type ${isExp ? 'exp' : 'fish'}">${UIUtils.ico(TripsData.tripIcon({ type: _draft.type, icon: _draft.icon }))}${isExp ? 'Экспедиция' : 'Рыбалка'}</span>
        <span class="cw-sum-name">${_esc(_draft.name || _autoName())}</span>
        <div class="cw-sum-rows">
          ${row('Даты', _esc(dates))}
          ${places ? row('Места', _esc(places)) : ''}
          ${parts ? row('Участники', _esc(parts)) : ''}
          ${routeBits ? row('Маршрут', _esc(routeBits)) : ''}
          ${_draft.comment ? row('Комментарий', `<span class="cw-sum-note">${_esc(_draft.comment)}</span>`) : ''}
          ${row('Доступ', _esc(access))}
        </div>
      </section>
      ${_guideTabsSection()}
      <span class="cw-hint">Всё можно поменять потом — в поездке через карандаш. ${isExp
        ? 'Маршрут, места и меню откроются внутри поездки.'
        : 'После рыбалки сможешь заполнить отчёт — улов, приманки, погода.'}</span>`;
  }

  // Какие вкладки Гида нужны этой поездке — круглые галочки видимости +
  // стрелки порядка, сохраняется в trip.guideTabs. Прямо тут, а не только
  // потом через ⚙ в самом Гиде — на Приобье, например, Бар не нужен с
  // самого начала. «Инфо» есть всегда (её рисует tripcover сам, в
  // guideTabs она не хранится) — показана первой строкой без галочки.
  function _guideTabsSection() {
    const last = _draftGuideTabOrder.length - 1;
    const rows = _draftGuideTabOrder.map((id, i) => {
      const on = _draftGuideTabsChecked.has(id);
      return `
        <div class="cw-tab-row">
          <button type="button" class="cw-tab-check" role="checkbox" aria-checked="${on}" data-qtb-check="${id}">
            ${_check(on)}<span>${_esc(_GUIDE_TAB_DEFS[id])}</span>
          </button>
          <button type="button" class="cw-arrow" data-qtb-up="${id}" aria-label="Выше" ${i === 0 ? 'disabled' : ''}>${UIUtils.ico('chevron-up')}</button>
          <button type="button" class="cw-arrow" data-qtb-down="${id}" aria-label="Ниже" ${i === last ? 'disabled' : ''}>${UIUtils.ico('chevron-down')}</button>
        </div>`;
    }).join('');
    return `
      ${_label('Вкладки в Гиде', 'какие разделы нужны в этой поездке — порядок стрелками')}
      <section class="cw-card cw-card--list">
        <div class="cw-tab-row cw-tab-row--fixed">
          <span class="cw-tab-check">${_check(true)}<span>Инфо</span></span>
          <span class="cw-tab-always">всегда</span>
        </div>
        ${rows}
      </section>`;
  }

  function _createFooter() {
    const isLast = _createStep === 2;
    const back = _createStep > 0
      ? `<button type="button" class="cw-btn-sec" id="createPrev">Назад</button>` : '';
    if (!isLast) {
      return `${back}<button type="button" class="cw-btn-primary" id="createNext">Дальше</button>`;
    }
    return `${back}<button type="button" class="cw-btn-primary" id="createSave">${_editMode ? 'Сохранить' : 'Создать поездку'}</button>`;
  }

  // Поле «Участники» / «С кем» — чипы выбранных (тап по имени —
  // переименовать на эту поездку, × — убрать) + «+ из списка или гость»
  // (лист: зарегистрированные участники и поле для гостей без аккаунта —
  // гости { name, uid: null }, не попадают в memberIds).
  function _participantsField() {
    const participants = _draft.participants || [];
    const isExp = _draft.type === 'expedition';
    // «У кого свои даты» — прямо тут, а не отдельным шагом: создающий
    // поездку почти всегда уже знает состав (Дмитрий: "я когда создаю
    // поездку, уже точно знаю кто участвует на 90%"). Сначала один
    // переключатель; включил — список людей с галочками. Детали
    // (дата/время/место) заполняются потом, в Гиде → Инфо.
    const travelRows = _travelOn ? participants.map((p, i) => `
      <button type="button" class="cw-check-row" role="checkbox" aria-checked="${!!p.travelSeparate}" data-action="toggle-travel-separate" data-idx="${i}">
        ${_check(p.travelSeparate)}<span>${_esc(p.name)}</span>
      </button>`).join('') : '';

    return `
      ${_label(isExp ? 'Участники' : 'С кем')}
      <div class="cw-chips cw-chips--tight" id="partsList">
        ${participants.map((p, i) => `
          <span class="cw-chip">
            <button type="button" class="cw-chip-name" data-part-rename-idx="${i}">${_esc(p.name)}</button>
            <button type="button" class="cw-chip-x" data-part-idx="${i}" aria-label="Убрать ${_esc(p.name)}">×</button>
          </span>`).join('')}
        <button type="button" class="cw-chip-add" id="partPickBtn">+ из списка или гость</button>
      </div>
      ${participants.length ? `
      <section class="cw-card cw-card--list">
        ${_switch('travelSwitch', 'Кто-то едет по своему расписанию — отметить потом в Гиде', _travelOn)}
        ${_travelOn ? `<div class="cw-travel-list">${travelRows}
          <span class="cw-hint cw-travel-hint">Отметь, у кого расписание отличается. Даты, время и место — потом, в Гиде → Инфо.</span></div>` : ''}
      </section>` : ''}`;
  }

  // Менять "Добавлять людей могу только я" может только владелец/организатор
  // поездки — firestore.rules это теперь требует (иначе любой участник мог
  // сначала снять ограничение отдельной записью, а вторым шагом спокойно
  // присоединить себя в обход него — реальная дыра, найдена внешним ревью
  // 2026-09-27). Не показываем интерактивный переключатель тем, чьё
  // сохранение эта проверка всё равно отклонит — иначе их правка ЛЮБОГО
  // другого поля формы падала бы целиком с непонятной ошибкой прав, стоило
  // им один раз тронуть этот тумблер.
  function _accessField() {
    const editingTrip = _editMode && _editTripId ? TripsData.getById(_editTripId) : null;
    const canManageAccess = !editingTrip || TripsData.canManage(editingTrip);
    return `
      ${_label('Доступ')}
      <section class="cw-card cw-card--list">
        ${_switch('f-private', 'Приватная — не показывать в профиле другим', _draft.private)}
        ${canManageAccess
          ? _switch('f-invite-restricted', 'Добавлять людей могу только я', _draft.inviteRestricted)
          : `<div class="cw-switch-row" role="switch" aria-checked="${_draft.inviteRestricted ? 'true' : 'false'}" aria-disabled="true" style="opacity:.55">
               <span class="cw-switch-text">Добавлять людей могу только я</span>
               <span class="cw-switch"><span></span></span>
             </div>`}
      </section>
      ${!canManageAccess ? `<span class="cw-hint">Менять может только организатор поездки</span>` : ''}`;
  }

  // Общий лист снизу (участники, переименование, удаление) — поверх мастера.
  function _openSheet(id, title, sub, inner, footer) {
    document.getElementById(id)?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'cw-sheet-ov';
    overlay.id = id;
    overlay.innerHTML = `
      <section class="cw-bs" role="dialog" aria-label="${_esc(title)}">
        <div class="cw-bs-grab"></div>
        <div class="cw-bs-head">
          <div class="cw-bs-head-text">
            <h2 class="cw-bs-title">${_esc(title)}</h2>
            ${sub ? `<span class="cw-bs-sub">${_esc(sub)}</span>` : ''}
          </div>
          <button type="button" class="cw-bs-close" data-action="sheet-close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
        </div>
        <div class="cw-bs-body">${inner}</div>
        ${footer ? `<div class="cw-bs-foot">${footer}</div>` : ''}
      </section>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    return overlay;
  }

  // Пикер участников: зарегистрированные (тап переключает присутствие в
  // _draft.participants по uid — надёжно, без сопоставления по имени) +
  // гости без аккаунта (имя, можно несколько через запятую/с новой строки).
  async function _showMemberPicker() {
    let members = [];
    if (typeof MembersFirebase !== 'undefined') {
      try { members = await MembersFirebase.getAllMembers(); } catch (e) { members = []; }
    }
    if (!_draft.participants) _draft.participants = [];

    const listHtml = () => {
      const selected = new Set(_draft.participants.filter(p => p.uid).map(p => p.uid));
      const guests = _draft.participants.map((p, i) => ({ p, i })).filter(x => !x.p.uid);
      return `
        ${members.length ? `<section class="cw-card cw-card--list">
          ${members.map(m => `
            <button type="button" class="cw-check-row" role="checkbox" aria-checked="${selected.has(m.uid)}" data-member-uid="${_esc(m.uid)}" data-member-name="${_esc(m.displayName || '')}">
              ${_check(selected.has(m.uid))}<span>${_esc(m.displayName || 'Без имени')}</span>
            </button>`).join('')}
        </section>` : '<span class="cw-hint">Список участников сейчас не загрузился — можно вписать гостей ниже.</span>'}
        ${guests.length ? `<span class="cw-caps">Гости</span>
        <section class="cw-card cw-card--list">
          ${guests.map(({ p, i }) => `
            <button type="button" class="cw-check-row" role="checkbox" aria-checked="true" data-guest-idx="${i}">
              ${_check(true)}<span>${_esc(p.name)}</span>
            </button>`).join('')}
        </section>` : ''}`;
    };

    const overlay = _openSheet('member-pick-overlay', 'Участники', 'из списка или гость без аккаунта', `
      <div id="mp-list" class="cw-bs-stack">${listHtml()}</div>
      <span class="cw-caps">Гость без аккаунта</span>
      <div class="cw-add-row">
        <input class="cw-input" id="f-participant" type="text" placeholder="Имя — можно несколько через запятую" autocomplete="off">
        <button type="button" class="cw-add-btn" data-action="mp-add-guest" aria-label="Добавить гостя">${UIUtils.ico('plus')}</button>
      </div>`,
      `<button type="button" class="cw-btn-primary" data-action="mp-done">Готово</button>`);

    const input = overlay.querySelector('#f-participant');
    const refreshList = () => { overlay.querySelector('#mp-list').innerHTML = listHtml(); };

    // Разбиваем по запятым/переносам строк — и вставка нескольких имён
    // скопом (из чата, списка), и посимвольный ввод работают одинаково.
    const addGuests = () => {
      const names = UIUtils.splitNames(input?.value);
      if (!names.length) return false;
      names.forEach(name => {
        if (!_draft.participants.some(p => p.name === name)) _draft.participants.push({ name, uid: null, gid: _genGuestId() });
      });
      input.value = '';
      refreshList();
      return true;
    };

    const close = () => {
      addGuests(); // что вписали, но не подтвердили — не теряем
      overlay.remove();
      _refreshCreate();
    };

    input?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); addGuests(); }
    });

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="mp-done"], [data-action="sheet-close"]')) { close(); return; }
      if (e.target.closest('[data-action="mp-add-guest"]')) { addGuests(); input?.focus(); return; }
      const guest = e.target.closest('[data-guest-idx]');
      if (guest) {
        _draft.participants.splice(parseInt(guest.dataset.guestIdx), 1);
        refreshList();
        return;
      }
      const row = e.target.closest('[data-member-uid]');
      if (!row) return;
      const uid = row.dataset.memberUid;
      const name = row.dataset.memberName;
      if (!uid) return;
      const idx = _draft.participants.findIndex(p => p.uid === uid);
      if (idx >= 0) _draft.participants.splice(idx, 1);
      else _draft.participants.push({ name, uid });
      refreshList();
    });
  }

  // ── «Взять за основу прошлую поездку» (шаг 0, только при создании) ──────
  // Лист со списком поездок (свежие сверху — по дате начала), тап по строке
  // копирует часть черновика и закрывает лист. Не самостоятельная запись —
  // просто предзаполнение _draft/_rivers/_quizRivers перед обычным сохранением.
  function _showCopyFromSheet() {
    const all = TripsData.getAll().slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    if (!all.length) { alert('Поездок пока нет — не с чего скопировать.'); return; }
    const rows = all.map(t => `
      <button type="button" class="cw-copy-row" data-copy-trip="${_esc(t.id)}">
        <span class="cw-place-ico">${UIUtils.ico(TripsData.tripIcon(t))}</span>
        <span class="cw-place-body">
          <span class="cw-place-name">${_esc(t.name)}</span>
          <span class="cw-place-sub">${_esc(TripsRender.shortRange(t.startDate, t.endDate))}</span>
        </span>
      </button>`).join('');

    const overlay = _openSheet('copy-trip-overlay', 'Взять за основу', '', `
      <span class="cw-hint cw-hint--tight">Скопируем участников, места, вкладки Гида и список подготовки. Даты, меню и расходы — нет.</span>
      <section class="cw-card cw-card--list">${rows}</section>`);

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="sheet-close"]')) { overlay.remove(); return; }
      const row = e.target.closest('[data-copy-trip]');
      if (!row) return;
      const t = TripsData.getById(row.dataset.copyTrip);
      overlay.remove();
      if (t) { _applyCopyFrom(t); _refreshCreate(); }
    });
  }

  // Копирует в черновик: тип, иконку, участников (без travelSeparate),
  // места (по типу поездки-источника — в _rivers или _quizRivers, с НОВЫМИ
  // id), вкладки Гида (порядок+отметки), приватность/ограничение
  // приглашений. НЕ копирует: даты, название (только плейсхолдер),
  // комментарий, importData, улов/расходы/меню. Готовность — пункты
  // источника со снятыми отметками, в _copiedReadiness (см. _save).
  function _applyCopyFrom(t) {
    _draft.type = t.type;
    _draft.icon = t.icon || '';
    _draft.participants = (t.participants || []).map(p => {
      const { travelSeparate, ...rest } = p;
      return { ...rest };
    });
    _draft.private = !!t.private;
    _draft.inviteRestricted = !!t.inviteRestricted;
    _travelOn = false;

    if (t.type === 'expedition') {
      _quizRivers = (t.rivers || []).map(r => ({ id: _genRiverId(), name: r.name, region: r.region || r.type || '' }));
      _rivers = [];
      _expMode = 'quiz';
    } else {
      _rivers = (t.rivers || []).map(r => ({
        id: _genRiverId(), name: r.name, region: r.region || '',
        lat: r.lat != null ? r.lat : null, lon: r.lon != null ? r.lon : null, type: r.type || '',
      }));
      _quizRivers = [];
    }

    const savedTabs = (t.guideTabs || []).filter(id => _GUIDE_TAB_DEFS[id]);
    const hiddenTabs = _GUIDE_TAB_DEFAULT_ORDER.filter(id => !savedTabs.includes(id));
    _draftGuideTabOrder = savedTabs.length ? [...savedTabs, ...hiddenTabs] : [..._GUIDE_TAB_DEFAULT_ORDER];
    _draftGuideTabsChecked = new Set(savedTabs.length ? savedTabs : _GUIDE_TAB_DEFAULT_ORDER);

    _copiedReadiness = Array.isArray(t.readiness) && t.readiness.length
      ? t.readiness.map(it => ({ id: it.id, label: it.label, done: false }))
      : TripsData.getDefaultReadiness();

    _copyFromLabel = t.name || '';
  }

  // Подтверждение удаления поездки (макет V2TripDelete). Сама логика —
  // прежняя: TripsData.deleteTrip (каскад по всем коллекциям + очередь
  // уведомления участникам в Telegram), права — организатор.
  function _showDeleteSheet() {
    const tripId = _editTripId;
    if (!tripId) return;
    const tripName = _draft.name || 'эту поездку';
    const range = typeof TripsRender !== 'undefined' ? TripsRender.shortRange(_draft.startDate, _draft.endDate) : '';
    const overlay = _openSheet('trip-delete-overlay', 'Удалить поездку?', [_draft.name, range].filter(Boolean).join(' · '), `
      <p class="cw-del-text">Удалится всё: меню, закупка, расходы, улов, заметки, снаряга на поездку. Вернуть будет нельзя.</p>
      <p class="cw-del-note">Удалить может только организатор. Участникам придёт сообщение в Telegram.</p>
      <button type="button" class="cw-btn-danger" data-action="del-confirm">Удалить «${_esc(tripName)}»</button>
      <button type="button" class="cw-btn-ghost" data-action="sheet-close">Отмена</button>`);

    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="sheet-close"]')) { overlay.remove(); return; }
      // Кнопку ловим синхронно, до любого await: e.currentTarget после
      // него уже потерян — из-за этого удаление раньше молча не делало
      // ничего (withBusyButton(null, ...) сразу выходил).
      const btn = e.target.closest('[data-action="del-confirm"]');
      if (!btn) return;
      UIUtils.withBusyButton(btn, async () => {
        try {
          await TripsData.deleteTrip(tripId);
        } catch (err) {
          console.error('deleteTrip:', err);
          alert('Не удалось удалить поездку. Проверь соединение и попробуй ещё раз.');
          return;
        }
        overlay.remove();
        _closeCreate();
        if (typeof onNavigate === 'function') onNavigate('trips');
        else if (typeof TripsIndex !== 'undefined') TripsIndex.render();
      });
    });
  }

  function _bindCreate(overlay) {
    // Даты — плитки «с / по» с нативным календарём внутри. Если человек сам
    // меняет даты, импорт файла их больше не перезаписывает.
    const startInp = document.getElementById('f-start');
    const endInp   = document.getElementById('f-end');
    const syncDates = changed => {
      _dateTouched = true;
      let s = startInp.value, en = endInp.value;
      // Конец не раньше начала: сдвигаем вторую дату вслед за изменённой
      if (s && en && en < s) {
        if (changed === 'start') { en = s; endInp.value = s; }
        else { s = en; startInp.value = en; }
      }
      _draft.startDate = s || _draft.startDate;
      _draft.endDate   = en || _draft.endDate;
      document.getElementById('f-start-v').textContent = _fmtDay(s) || 'выбрать';
      document.getElementById('f-end-v').textContent   = _fmtDay(en) || '—';
    };
    [[startInp, 'start'], [endInp, 'end']].forEach(([inp, which]) => {
      if (!inp) return;
      inp.addEventListener('input',  () => syncDates(which));
      inp.addEventListener('change', () => syncDates(which));
      // Десктопный Chrome открывает календарь только по своему значку —
      // тут поле невидимое поверх плитки, открываем явно.
      inp.addEventListener('click', () => { try { inp.showPicker?.(); } catch (e) {} });
    });

    // Тип
    overlay.querySelectorAll('[data-type]').forEach(opt => {
      opt.addEventListener('click', () => {
        _draft.type = opt.dataset.type;
        overlay.querySelectorAll('[data-type]').forEach(o => {
          o.classList.toggle('on', o === opt);
          o.setAttribute('aria-pressed', o === opt ? 'true' : 'false');
        });
        // Цвет иконок — по типу; иконка по умолчанию следует за типом
        const icons = document.getElementById('f-icons');
        if (icons) {
          icons.className = 'cw-icons ' + (_draft.type === 'expedition' ? 'exp' : 'fish');
          if (!_draft.icon) {
            const def = _draft.type === 'expedition' ? 'mountain' : 'fishing';
            icons.querySelectorAll('[data-icon]').forEach(b => {
              b.classList.toggle('on', b.dataset.icon === def);
              b.setAttribute('aria-pressed', b.dataset.icon === def ? 'true' : 'false');
            });
          }
        }
        // Обновляем плейсхолдер имени
        const nameInput = document.getElementById('f-name');
        if (nameInput && !nameInput.value) {
          nameInput.placeholder = _copyFromLabel ? `Как «${_copyFromLabel}»`
            : (_draft.type === 'expedition' ? 'Например, Сахалин 2027' : 'Например, Ока, 15 марта');
        }
      });
    });

    // «Взять за основу прошлую поездку»
    document.getElementById('copyFromBtn')?.addEventListener('click', _showCopyFromSheet);

    // Иконка
    overlay.querySelectorAll('[data-icon]').forEach(btn => {
      btn.addEventListener('click', () => {
        _draft.icon = btn.dataset.icon;
        overlay.querySelectorAll('[data-icon]').forEach(b => {
          b.classList.toggle('on', b === btn);
          b.setAttribute('aria-pressed', b === btn ? 'true' : 'false');
        });
      });
    });

    // × — закрыть мастер на любом шаге
    document.getElementById('createClose')?.addEventListener('click', _closeCreate);

    // Назад
    document.getElementById('createPrev')?.addEventListener('click', () => {
      _saveCurrentFields();
      _createStep--;
      _refreshCreate();
    });

    // Дальше (на шаге «Файл от ИИ» без файла — то же, что прежний «Пропустить»)
    document.getElementById('createNext')?.addEventListener('click', () => {
      _saveCurrentFields();
      _createStep++;
      _refreshCreate();
    });

    // Сохранить
    document.getElementById('createSave')?.addEventListener('click', e => {
      UIUtils.withBusyButton(e.currentTarget, () => {
        _saveCurrentFields();
        return _save();
      });
    });

    // Удалить поездку — лист подтверждения
    document.getElementById('createDelete')?.addEventListener('click', _showDeleteSheet);

    // Вкладки Гида — галочки видимости + стрелки порядка (шаг сводки)
    overlay.querySelectorAll('[data-qtb-check]').forEach(cb => {
      cb.addEventListener('click', () => {
        const id = cb.dataset.qtbCheck;
        const willCheck = !_draftGuideTabsChecked.has(id);
        // Та же защита от пустого guideTabs, что и в настройках Гида
        // (modules/tripcover/index.js) — пустой массив неотличим от "не
        // задано" и молча покажет все табы при следующей отрисовке.
        if (!willCheck && _draftGuideTabsChecked.size === 1) return;
        if (willCheck) _draftGuideTabsChecked.add(id);
        else _draftGuideTabsChecked.delete(id);
        cb.setAttribute('aria-checked', willCheck ? 'true' : 'false');
        cb.querySelector('.cw-check')?.classList.toggle('on', willCheck);
      });
    });
    overlay.querySelectorAll('[data-qtb-up]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = _draftGuideTabOrder.indexOf(btn.dataset.qtbUp);
        if (i > 0) {
          [_draftGuideTabOrder[i - 1], _draftGuideTabOrder[i]] = [_draftGuideTabOrder[i], _draftGuideTabOrder[i - 1]];
          _refreshCreate();
        }
      });
    });
    overlay.querySelectorAll('[data-qtb-down]').forEach(btn => {
      btn.addEventListener('click', () => {
        const i = _draftGuideTabOrder.indexOf(btn.dataset.qtbDown);
        if (i < _draftGuideTabOrder.length - 1) {
          [_draftGuideTabOrder[i + 1], _draftGuideTabOrder[i]] = [_draftGuideTabOrder[i], _draftGuideTabOrder[i + 1]];
          _refreshCreate();
        }
      });
    });

    // ── Экспедиция: способ заполнения (вручную / файл от ИИ) ────────────

    overlay.querySelectorAll('[data-exp-mode]').forEach(tab => {
      tab.addEventListener('click', () => {
        _saveCurrentFields();
        _expMode = tab.dataset.expMode;
        _refreshCreate();
      });
    });

    // Вручную: добавить место («Обь, ХМАО» — до запятой название, после — регион)
    const placeInp = document.getElementById('f-quiz-place');
    const regionInp = document.getElementById('f-quiz-region');
    const placeErr = document.getElementById('f-quiz-place-err');
    const addPlace = () => {
      const r = _addQuizPlace(placeInp?.value, regionInp?.value);
      if (r === 'dup') {
        if (placeErr) { placeErr.textContent = 'Такое место уже есть в поездке'; placeErr.hidden = false; }
        placeInp?.focus(); return;
      }
      if (!r) { placeInp?.focus(); return; }
      if (placeInp) placeInp.value = '';
      if (regionInp) regionInp.value = '';
      _refreshCreate();
      document.getElementById('f-quiz-place')?.focus();
    };
    document.getElementById('quizRiverAdd')?.addEventListener('click', addPlace);
    [placeInp, regionInp].forEach(inp => inp?.addEventListener('keydown', e => {
      if (e.key === 'Enter') { e.preventDefault(); addPlace(); }
    }));
    [placeInp, regionInp].forEach(inp => inp?.addEventListener('input', () => { if (placeErr) placeErr.hidden = true; }));
    // Тап по месту — правка названия и региона
    overlay.querySelectorAll('[data-quiz-river-edit]').forEach(row => {
      row.addEventListener('click', e => {
        if (e.target.closest('[data-quiz-river-idx]')) return;
        const i = parseInt(row.dataset.quizRiverEdit, 10);
        const pl = _quizRivers[i];
        if (!pl) return;
        UIUtils.placeSheet({ title: 'Изменить место', name: pl.name, region: pl.region, list: _quizRivers, exceptId: pl.id })
          .then(res => { if (!res) return; _quizRivers[i] = { ...pl, name: res.name, region: res.region }; _refreshCreate(); });
      });
    });

    overlay.querySelectorAll('[data-quiz-river-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        _quizRivers.splice(parseInt(btn.dataset.quizRiverIdx), 1);
        _refreshCreate();
      });
    });

    // Сброс импорта
    document.getElementById('importReset')?.addEventListener('click', () => {
      _importedData = null;
      _refreshCreate();
    });

    // Выбор файла через input
    document.getElementById('importFile')?.addEventListener('change', (e) => {
      _readImportFile(e.target.files[0]);
    });

    // Drag & drop
    const dz = document.getElementById('importDropzone');
    if (dz) {
      dz.addEventListener('dragover', (e) => {
        e.preventDefault();
        dz.classList.add('dz-drag');
      });
      dz.addEventListener('dragleave', () => dz.classList.remove('dz-drag'));
      dz.addEventListener('drop', (e) => {
        e.preventDefault();
        dz.classList.remove('dz-drag');
        _readImportFile(e.dataTransfer.files[0]);
      });
    }

    // ── Рыбалка: места ──────────────────────────────────────────────────

    _bindStaticRiverChips();
    document.getElementById('f-river')?.addEventListener('input', _onRiverSearchInput);

    overlay.querySelectorAll('[data-river-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        _rivers.splice(parseInt(btn.dataset.riverIdx), 1);
        _refreshCreate();
      });
    });

    // ── Участники ────────────────────────────────────────────────────────

    overlay.querySelectorAll('[data-part-idx]').forEach(chip => {
      chip.addEventListener('click', () => {
        _draft.participants.splice(parseInt(chip.dataset.partIdx), 1);
        if (!_draft.participants.some(p => p.travelSeparate)) _travelOn = _travelOn && _draft.participants.length > 0;
        _refreshCreate();
      });
    });

    // Переименовать — ник на эту конкретную поездку, не трогает displayName
    // аккаунта (если это зарегистрированный участник, а не гость).
    overlay.querySelectorAll('[data-part-rename-idx]').forEach(nameEl => {
      nameEl.addEventListener('click', () => {
        _showRenameSheet(parseInt(nameEl.dataset.partRenameIdx));
      });
    });

    // «Кто-то едет по своему расписанию»: выключили — ни у кого своих дат
    // нет (флаги снимаются, иначе они жили бы невидимо); включили —
    // появляется список людей с галочками.
    document.getElementById('travelSwitch')?.addEventListener('click', () => {
      _travelOn = !_travelOn;
      if (!_travelOn) (_draft.participants || []).forEach(p => { p.travelSeparate = false; });
      _refreshCreate();
    });

    // Галочка «свои даты» у конкретного человека — без полного ререндера
    overlay.querySelectorAll('[data-action="toggle-travel-separate"]').forEach(row => {
      row.addEventListener('click', () => {
        const p = _draft.participants[parseInt(row.dataset.idx)];
        if (!p) return;
        p.travelSeparate = !p.travelSeparate;
        row.setAttribute('aria-checked', p.travelSeparate ? 'true' : 'false');
        row.querySelector('.cw-check')?.classList.toggle('on', !!p.travelSeparate);
      });
    });

    document.getElementById('partPickBtn')?.addEventListener('click', _showMemberPicker);

    // ── Доступ: переключатели ───────────────────────────────────────────

    [['f-private', 'private'], ['f-invite-restricted', 'inviteRestricted']].forEach(([id, key]) => {
      document.getElementById(id)?.addEventListener('click', e => {
        _draft[key] = !_draft[key];
        e.currentTarget.setAttribute('aria-checked', _draft[key] ? 'true' : 'false');
      });
    });
  }

  // Место из поля «Вручную»: «Обь, ХМАО» → {name: 'Обь', region: 'ХМАО'}.
  // Возвращает true, если что-то добавилось.
  // Название и регион — отдельными полями (раньше одно поле, регион
  // отделялся запятой: «Обь Хмао» без запятой целиком уходило в название).
  // Запятая в названии по-прежнему понимается, если регион не вписан.
  // Возвращает true | false (пусто) | 'dup' (такое место уже есть).
  function _addQuizPlace(rawName, rawRegion) {
    let name = String(rawName || '').trim();
    let region = String(rawRegion || '').trim();
    if (!name) return false;
    if (!region && name.includes(',')) {
      const comma = name.indexOf(',');
      region = name.slice(comma + 1).trim();
      name = name.slice(0, comma).trim();
      if (!name) return false;
    }
    if (UIUtils.findDuplicatePlace(_quizRivers, name, region)) return 'dup';
    _quizRivers.push({ id: _genRiverId(), name, region });
    return true;
  }

  // ─── Чтение JSON-файла ───────────────────────────────────────────────────

  function _readImportFile(file) {
    if (!file) return;
    // Сеанс мастера, для которого начали читать этот файл — форму могли
    // закрыть и открыть заново (уже для другой поездки) до того, как
    // асинхронное чтение вообще завершится; см. _createSeq выше.
    const forSeq = _createSeq;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Базовая валидация — тип объекта, плюс структура полей, которые
        // дальше читаются как МАССИВЫ (route/rivers/menu/flights): раньше
        // проверялось только "это объект", и, например, route строкой
        // ("День 1: аэропорт" вместо [{t,rows}]) сохранялся как есть —
        // раздел «Инфо» падал с "map is not a function" при первом же
        // открытии, и обычная перезагрузка это не чинила (данные уже в
        // базе). Реальный баг, найден внешним ревью 2026-09-27.
        if (typeof data !== 'object' || data === null || Array.isArray(data)) {
          throw new Error('Неверный формат');
        }
        for (const key of ['route', 'rivers', 'menu', 'flights']) {
          if (data[key] !== undefined && !Array.isArray(data[key])) {
            throw new Error(`Поле "${key}" должно быть списком`);
          }
        }

        if (_createSeq !== forSeq) return; // форму успели закрыть/переоткрыть для другой поездки — этот результат уже не про неё

        _importedData = data;
        _importFileLoaded = true;

        // Автозаполнение полей из meta если пустые
        if (data.meta) {
          if (data.meta.title       && !_draft.name)   _draft.name      = data.meta.title;
          if (data.meta.dateFrom    && !_dateTouched)  _draft.startDate = data.meta.dateFrom;
          if (data.meta.dateTo      && !_dateTouched)  _draft.endDate   = data.meta.dateTo;
          if (data.meta.people      && !_draft.participants?.length) {
            // Оставляем пустым — пользователь заполнит имена, но people используется при сохранении
            _draft._people = data.meta.people;
          }
        }

        _refreshCreate();
      } catch (err) {
        if (_createSeq !== forSeq) return; // форму уже закрыли/переоткрыли — не трогаем чужой сеанс ошибкой этого файла
        alert(err?.message === 'Неверный формат' || err?.message?.startsWith('Поле "')
          ? `Не тот формат файла.\n${err.message}.`
          : 'Ошибка чтения файла.\nПроверь что это валидный JSON от AI.');
        _importedData = null;
      }
    };
    reader.readAsText(file);
  }

  // ─── Вспомогательные ─────────────────────────────────────────────────────

  function _genRiverId() {
    return 'river_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // Стабильный id гостя (участника без аккаунта/uid) — не совпадение имени
  // или позиции в массиве, см. комментарий у gid-сопоставления в _save().
  function _genGuestId() {
    return 'guest_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6);
  }

  // id обязателен — Реки открывают карточку по data-rv-open="r.id"
  // (modules/rivers/render.js:56 / index.js:_openDetail). Без него тап по
  // реке молча ничего не делал для КАЖДОЙ вручную заведённой поездки —
  // и статичные чипы, и живой OSM-поиск шли через эту же функцию.
  function _addRiver(name, region, lat, lon, type) {
    if (!_rivers.find(r => r.name === name)) {
      _rivers.push({
        id: _genRiverId(),
        name, region,
        lat: lat != null ? lat : null,
        lon: lon != null ? lon : null,
        type: type || ''
      });
    }
  }

  // OSM (Nominatim) отдаёт свой класс объекта (waterway=river/stream,
  // natural=water и т.д.) — переводим в понятный русский ярлык. Показываем
  // его прямо в чипе результата поиска (см. _searchRivers), чтобы было
  // видно, что нашлась именно река, а не одноимённый посёлок/озеро — и
  // сохраняем в карточку реки как поле "Тип" (modules/rivers/render.js),
  // которое для вручную заведённых рек раньше всегда было пустым.
  const _OSM_TYPE_LABELS = {
    river: 'река', stream: 'ручей', riverbank: 'река', canal: 'канал',
    water: 'озеро', lake: 'озеро', reservoir: 'водохранилище',
    village: 'посёлок', town: 'город', city: 'город', hamlet: 'деревня'
  };
  function _osmTypeLabel(result) {
    return _OSM_TYPE_LABELS[result.type] || (result.class === 'waterway' ? 'водоём' : '');
  }

  function _defaultRiverChips() {
    return `
      <span class="cw-suggest-k">Быстрый выбор:</span>
      <button type="button" class="cw-sug" data-suggest="р. Ока|Московская обл.">р. Ока</button>
      <button type="button" class="cw-sug" data-suggest="р. Нара|Московская обл.">р. Нара</button>
      <button type="button" class="cw-sug" data-suggest="р. Угра|Калужская обл.">р. Угра</button>`;
  }

  // ─── Живой поиск реки/водоёма по OpenStreetMap (Nominatim) ────────────────
  // Даёт реальные координаты — без них не построить погоду по месту поездки
  // (см. shared/weather.js). Раньше это поле было декоративным: работали
  // только 3 захардкоженных чипа без координат, свой текст никуда не уходил.
  let _riverSearchTimer = null;
  let _riverSearchSeq = 0;

  function _onRiverSearchInput(e) {
    const q = e.target.value.trim();
    clearTimeout(_riverSearchTimer);
    if (q.length < 3) {
      const wrap = document.getElementById('riverSuggestions');
      if (wrap) { wrap.innerHTML = _defaultRiverChips(); _bindStaticRiverChips(); }
      return;
    }
    _riverSearchTimer = setTimeout(() => _searchRivers(q), 400);
  }

  async function _searchRivers(q) {
    const seq = ++_riverSearchSeq;
    const wrap = document.getElementById('riverSuggestions');
    if (wrap) wrap.innerHTML = '<div class="cw-sug-status">Ищу…</div>';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru&q=' + encodeURIComponent(q);
      const res = await fetch(url);
      const results = await res.json();
      if (seq !== _riverSearchSeq || !wrap) return; // пришёл устаревший ответ — новый поиск уже в процессе
      if (!results.length) { wrap.innerHTML = '<div class="cw-sug-status">Ничего не нашлось</div>'; return; }
      wrap.innerHTML = results.map(r => {
        const parts  = r.display_name.split(',').map(s => s.trim());
        const name   = parts[0];
        const region = parts.slice(1, 3).join(', ');
        const type   = _osmTypeLabel(r);
        return `<button type="button" class="cw-sug" data-river-name="${_esc(name)}" data-river-region="${_esc(region)}" data-river-lat="${r.lat}" data-river-lon="${r.lon}" data-river-type="${_esc(type)}">${_esc(name)}${type ? ` <span class="cw-sug-type">· ${_esc(type)}</span>` : ''}</button>`;
      }).join('');
      _bindLiveRiverChips();
    } catch (err) {
      if (seq === _riverSearchSeq && wrap) wrap.innerHTML = '<div class="cw-sug-status">Не нашёл — проверь соединение</div>';
    }
  }

  function _bindStaticRiverChips() {
    document.querySelectorAll('#riverSuggestions [data-suggest]').forEach(chip => {
      chip.addEventListener('click', () => {
        const [name, region] = chip.dataset.suggest.split('|');
        _addRiver(name.trim(), region.trim());
        _refreshCreate();
      });
    });
  }

  function _bindLiveRiverChips() {
    document.querySelectorAll('#riverSuggestions [data-river-name]').forEach(chip => {
      chip.addEventListener('click', () => {
        _addRiver(chip.dataset.riverName, chip.dataset.riverRegion,
          parseFloat(chip.dataset.riverLat), parseFloat(chip.dataset.riverLon), chip.dataset.riverType);
        _refreshCreate();
      });
    });
  }

  // Разбирает текст маршрута квиза на дни: строка с двоеточием на конце —
  // новый день, остальные строки — пункты расписания. Время в начале строки
  // ("09:15 текст") распознаётся и уходит в отдельную колонку, как в
  // AI-импорте — те же поля {t, rows:[[time,text],...]}, чтобы Гид рендерил
  // квиз-маршрут точно так же, как импортированный.
  function _parseRouteText(text) {
    const lines = String(text || '').split('\n').map(l => l.trim()).filter(Boolean);
    const days = [];
    let current = null;
    lines.forEach(line => {
      if (/:$/.test(line) && line.length < 80) {
        current = { t: line.replace(/:$/, '').trim(), rows: [] };
        days.push(current);
        return;
      }
      const m = line.match(/^(\d{1,2}[:.]\d{2}(?:\s*[-–]\s*\d{1,2}[:.]\d{2})?)\s*[—\-–]?\s*(.*)$/);
      const time = m ? m[1] : '';
      const rest = m ? (m[2] || '') : line;
      if (!current) { current = { t: 'День 1', rows: [] }; days.push(current); }
      current.rows.push([time, rest]);
    });
    return days;
  }

  // Собирает importData из полей квиза (та же форма, что у AI JSON) — так
  // весь остальной код (Гид, Реки, сводка на шаге 3, сохранение) работает
  // одинаково независимо от источника данных. Возвращает null, если в
  // квизе реально ничего не введено — ВАЖНО не путать это с "стереть то,
  // что уже было": раньше null отсюда напрямую летел в _importedData и
  // затирал в Firestore весь уже импортированный маршрут/меню/рейсы,
  // стоило только заглянуть на вкладку «Квиз» и нажать «Далее», ничего
  // не заполняя — см. _saveCurrentFields ниже, где это и остановлено.
  // Меню/рейсы/приливы квиз не собирает (это его осознанное ограничение),
  // поэтому при редактировании уже импортированной поездки они бережно
  // переносятся из старых данных, а не пропадают.
  function _buildQuizImportData() {
    const days = _parseRouteText(_quizRouteText);
    if (!_quizRivers.length && !days.length) return null;
    const prior = _editMode ? (TripsData.getById(_editTripId)?.importData || null) : null;
    const priorRivers = prior?.rivers || [];
    return {
      // Всё, чего квиз не касается (меню, рейсы, приливы, погода…), — как было
      ...(prior || {}),
      // Собрано вручную — не показывать «импортирован ИИ» (у поездки из файла
      // source уже нет и остаётся как было)
      ...(prior ? {} : { source: 'manual' }),
      meta:   { ...(prior?.meta || {}), title: _draft.name || '' },
      // id обязателен — Реки открывают карточку по data-rv-open="r.id".
      // Уже импортированная река сохраняет свои подробности (координаты,
      // точки, справку) — раньше квиз переписывал её до {id,name,type}.
      rivers: _quizRivers.map(r => {
        const old = priorRivers.find(x => (r.id && x.id === r.id) || x.name === r.name);
        return old
          ? { ...old, id: old.id || r.id || _genRiverId(), name: r.name, type: r.region || old.type }
          : { id: r.id || _genRiverId(), name: r.name, type: r.region };
      }),
      // Поле маршрута при правке пустое — пустота не должна стирать
      // импортированный маршрут по дням.
      route:  days.length ? days : (prior?.route || []),
    };
  }

  function _saveCurrentFields() {
    if (_createStep === 0) {
      _draft.name      = document.getElementById('f-name')?.value.trim() || '';
      _draft.startDate = document.getElementById('f-start')?.value || _today();
      _draft.endDate   = document.getElementById('f-end')?.value   || _today();
    }
    if (_createStep === 1) {
      if (_draft.type === 'fishing') {
        _draft.comment = document.getElementById('f-comment')?.value.trim() || '';
        _draft.rivers  = _rivers;
      } else if (_expMode === 'quiz') {
        // Вписанное в поле места, но не добавленное «+» — не теряем
        _addQuizPlace(document.getElementById('f-quiz-place')?.value, document.getElementById('f-quiz-region')?.value);
        _quizRouteText = document.getElementById('f-quiz-route')?.value || '';
        // Только если квиз реально что-то собрал — не даём пустому
        // просмотру вкладки затереть уже существующий импорт (файл или
        // более ранний квиз) значением null.
        const built = _buildQuizImportData();
        if (built) _importedData = built;
      }
      // Гостей без подтверждения теперь подбирает сам лист участников
      // при закрытии (см. _showMemberPicker) — поле гостя живёт там.
    }
  }

  // Сырые значения полей текущего шага — перед любой перерисовкой, чтобы
  // смена режима/удаление чипа/лист участников не стирали то, что уже
  // вписано (комментарий, маршрут, название). Без побочных эффектов.
  function _captureInputs() {
    const v = id => document.getElementById(id)?.value;
    if (v('f-name') !== undefined) _draft.name = v('f-name').trim();
    if (v('f-start')) _draft.startDate = v('f-start');
    if (v('f-end'))   _draft.endDate   = v('f-end');
    if (v('f-comment') !== undefined) _draft.comment = v('f-comment').trim();
    if (v('f-quiz-route') !== undefined) _quizRouteText = v('f-quiz-route');
  }

  function _refreshCreate() {
    if (!document.getElementById('create-body')) return;
    _captureInputs();
    document.getElementById('create-body').innerHTML = _createStepContent();
    document.getElementById('create-footer-el').innerHTML = _createFooter();
    document.getElementById('create-topbar-el').innerHTML = _createTopbar();
    const overlay = document.getElementById('create-overlay');
    _bindCreate(overlay);
  }

  // Идёт ли поездка прямо сейчас (между startDate и endDate включительно)
  function _tripStatus(startDate, endDate) {
    const now = new Date();
    const start = new Date(startDate);
    const end = new Date(endDate);
    end.setHours(23, 59, 59, 999);
    if (end < now) return 'done';
    if (start <= now) return 'active';
    return 'upcoming';
  }

  async function _save() {
    const isExp = _draft.type === 'expedition';
    const existing = _editMode && _editTripId ? TripsData.getById(_editTripId) : null;

    // Реки для экспедиции — из importedData, если его загружали/меняли в
    // этом сеансе редактирования; если нет — оставляем то, что уже было
    // сохранено (существующие from JSON-импорта реки — НЕ строка
    // "поменял название поездки и разом стёр весь список рек", которой
    // был этот код раньше: importedData тут почти всегда null при
    // редактировании чего-то помимо самого импорта, и пустой fallback
    // тихо обнулял rivers на КАЖДОЕ сохранение формы).
    // id сохраняем как есть — иначе Реки открывают карточку по
    // data-rv-open="r.id" и молча ничего не делают (см. _addRiver выше).
    const rivers = isExp
      ? (_importedData?.rivers?.map(r => ({ id: r.id || _genRiverId(), name: r.name, region: r.type || '' })) || existing?.rivers || [])
      : _rivers;
    // Тот же сгенерированный id — обратно в _importedData.rivers, иначе он
    // расходится с rivers выше: место без id в исходном JSON получает id
    // только в trip.rivers, а trip.importData.rivers (куда _importedData
    // уходит без изменений чуть ниже) остаётся без него. Карточки мест
    // (tripcover/catches/atlas) читают именно importData.rivers первым
    // делом (`trip.importData?.rivers || trip.rivers`) — то есть показывают
    // версию БЕЗ id, и клик (data-rv-open="r.id") не находит совпадения.
    // Реальный баг, найден внешним ревью 2026-09-27.
    if (isExp && _importedData?.rivers?.length) {
      _importedData.rivers = _importedData.rivers.map((r, i) => (r.id ? r : { ...r, id: rivers[i]?.id }));
    }

    const ownerUid = _editMode ? (existing?.ownerId || null) : (window.APP?.user?.uid || null);

    // Каждый участник уже несёт свой uid (проставленный при выборе из
    // списка) или null (гость без аккаунта) — memberIds считается прямо
    // отсюда, без сопоставления по имени.
    const participants = _draft.participants || [];
    // Гостям (без uid) из поездок, сохранённых до появления gid, — ставим
    // его сейчас, задним числом (не пытаясь угадать, кто есть кто на этом
    // самом сохранении — см. gid-сопоставление ниже). Дальше их можно будет
    // надёжно отличить от «удалили одного гостя, добавили другого».
    participants.forEach(p => { if (!p.uid && !p.gid) p.gid = _genGuestId(); });
    const fromParticipants = participants.filter(p => p.uid).map(p => p.uid);
    const memberIds = ownerUid ? [...new Set([...fromParticipants, ownerUid])] : fromParticipants;

    const guideTabs = _draftGuideTabOrder.filter(id => _draftGuideTabsChecked.has(id));

    const trip = {
      type:      _draft.type,
      icon:      _draft.icon || '',
      name:      _draft.name || _autoName(),
      startDate: _draft.startDate,
      endDate:   _draft.endDate || _draft.startDate,
      rivers,
      participants,
      comment:   _draft.comment || '',
      private:   !!_draft.private,
      inviteRestricted: !!_draft.inviteRestricted,
      status:    _tripStatus(_draft.startDate, _draft.endDate || _draft.startDate),
      // rating/conditions — заполняются ПОСЛЕ поездки (звёзды, погода),
      // никак не через эту форму — при редактировании (name/даты/
      // участники и т.п.) сохраняем то, что уже было, а не обнуляем
      // задним числом уже отмеченный улов/впечатления. Свежие только у
      // новой поездки, которой ещё нечего сохранять.
      rating:    _editMode ? (existing?.rating ?? null) : null,
      fish:      [],
      conditions: _editMode ? (existing?.conditions || {}) : {},
      // Чек-лист готовности — та же логика: обнулять его на каждое
      // сохранение формы (было раньше) значит терять реально отмеченные
      // "Снаряга/Меню/Закупка/Аптечка" при любой правке названия или
      // участников. Свежий all-false только когда экспедиция создаётся
      // впервые; существующий — сохраняется как есть.
      readiness: isExp
        ? (existing?.readiness || _copiedReadiness || TripsData.getDefaultReadiness())
        : null,
      // Данные маршрута от AI (только для экспедиций)
      importData: isExp && _importedData ? _importedData : null,
      guideTabs,
      memberIds,
    };

    if (_editMode && _editTripId) {
      // Состав/имена участников сравниваем с тем, что было загружено ПРИ
      // ОТКРЫТИИ формы (existing.participants) — чтобы отличить "я тут явно
      // кого-то добавил/убрал/переименовал в этом сеансе" от "пока форма
      // была открыта, кто-то ещё вступил по ссылке". Раньше participants/
      // memberIds писались как есть в драфте ПРИ ЛЮБОМ сохранении формы
      // (даже правке одного только названия) — если за время редактирования
      // кто-то вступил по ссылке, обычное сохранение стирало его из
      // participants, а заодно ложно срабатывало определение "кого-то
      // исключили" ниже и отзывало ссылку-приглашение. Реальный баг,
      // найден внешним ревью 2026-09-27. participants/memberIds в общий
      // update НЕ попадают вовсе — правки состава применяются отдельно,
      // транзакцией по свежим серверным данным (см.
      // TripsFirebase.applyParticipantsDiff ниже), а если состав и имена
      // вообще не менялись в этом сеансе — сервер не трогается.
      const oldParticipants = existing?.participants || [];
      // Гости старых поездок, у которых ещё нет gid (проставляется задним
      // числом чуть выше, в этом же сохранении — см. участников.forEach с
      // _genGuestId): в oldParticipants (снимок ДО этого сохранения) они
      // ещё БЕЗ gid, так что найти их по СВЕЖЕМУ gid из драфта в принципе
      // невозможно. Без фолбэка такой гость считался бы НОВЫМ (в pToAdd —
      // задваивался), а старая (безgid'ная) запись — "исключённой" (в
      // pToRemove, но без uid/gid убрать её нечем — так и оставалась висеть
      // мёртвым грузом). Реальный баг, найден внешним ревью 2026-09-27.
      // Фолбэк — по имени, СТРОГО среди старых гостей, у которых тоже нет
      // ни uid, ни gid (это и есть признак "ещё не мигрировал"), и каждая
      // такая старая запись используется для сопоставления не больше раза.
      const legacyGuests = oldParticipants.filter(o => !o.uid && !o.gid);
      const usedLegacyMatches = new Set();
      const pToAdd = [], pToRemove = [], pRenames = [], pFieldChanges = [];
      const matchedOld = new Set();
      (trip.participants || []).forEach(p => {
        let was = p.uid
          ? oldParticipants.find(o => o.uid === p.uid)
          : (p.gid ? oldParticipants.find(o => o.gid === p.gid) : null);
        if (!was && !p.uid) {
          was = legacyGuests.find(o => !usedLegacyMatches.has(o) && o.name.toLowerCase() === p.name.toLowerCase());
          if (was) usedLegacyMatches.add(was);
        }
        if (was) {
          matchedOld.add(was);
          // matchName — имя, по которому этого участника опознали ЗДЕСЬ
          // (в oldParticipants). Для гостя, сопоставленного через легаси-
          // фолбэк выше, gid в этой записи — только что сгенерированный,
          // которого на СЕРВЕРЕ (внутри транзакции applyParticipantsDiff)
          // тоже ещё нет — сопоставление по нему там повторило бы ту же
          // проблему. matchName даёт транзакции тот же фолбэк (по старому
          // имени среди гостей без uid/gid), и заодно она же сохранит туда
          // и сам gid, завершив миграцию этого гостя.
          const identity = { uid: p.uid || null, gid: p.gid || null, matchName: was.name };
          if (was.name && was.name !== p.name) pRenames.push({ ...identity, newName: p.name });
          // "Едет по своему расписанию" / "не участвует в дежурстве" —
          // тоже поля конкретного участника, не только имя. Раньше их
          // изменение никак не обнаруживалось этим диффом (сравнивалось
          // только имя) — раз participants/memberIds больше не пишутся
          // общим update() целиком, отметка молча переставала сохраняться
          // вообще. Реальный баг, найден внешним ревью 2026-09-27.
          const fieldPatch = {};
          if (!!was.travelSeparate !== !!p.travelSeparate) fieldPatch.travelSeparate = !!p.travelSeparate;
          if (!!was.dutyExempt !== !!p.dutyExempt) fieldPatch.dutyExempt = !!p.dutyExempt;
          if (Object.keys(fieldPatch).length) pFieldChanges.push({ ...identity, patch: fieldPatch });
        } else {
          pToAdd.push(p);
        }
      });
      // name — тот же легаси-фолбэк, что и у pRenames/pFieldChanges выше:
      // гостя без uid/gid, которого реально убрали из состава, иначе
      // нечем опознать в транзакции (там тоже нет ни uid, ни gid).
      oldParticipants.forEach(o => { if (!matchedOld.has(o)) pToRemove.push({ uid: o.uid || null, gid: o.gid || null, name: o.name }); });

      // В режиме редактирования сохраняем существующие данные рейтинга, улова и т.д.
      const update = {
        // Тип можно сменить в мастере — раньше он молча не сохранялся.
        type:        trip.type,
        icon:        trip.icon,
        name:        trip.name,
        startDate:   trip.startDate,
        endDate:     trip.endDate,
        rivers:      trip.rivers,
        comment:     trip.comment,
        private:     trip.private,
        inviteRestricted: trip.inviteRestricted,
        status:      trip.status,
        importData:  trip.importData !== undefined ? trip.importData : (existing?.importData || null),
        guideTabs:   trip.guideTabs,
      };
      // Рыбалка → экспедиция: чек-листу готовности нужен стартовый набор.
      // Обратно — ничего не стираем, readiness просто не показывается.
      if (isExp && !existing?.readiness) update.readiness = TripsData.getDefaultReadiness();
      // Даты сменились — всё, что считалось под старые даты, сбрасываем
      // здесь же, одним местом, а не лечим каждый экран по отдельности:
      // погода (Главная/обложка/Гид перезапросят её под новые даты) и дни
      // меню (пересобираются на сервере с сохранением блюд по датам).
      const datesChanged = existing && (existing.startDate !== trip.startDate || (existing.endDate || existing.startDate) !== trip.endDate);
      // Поездка стала короче, а на выпадающих днях уже стоят блюда —
      // предупреждаем до сохранения, а не теряем молча.
      if (datesChanged && typeof MenuFirebase !== 'undefined' && MenuFirebase.countTail) {
        const tail = await MenuFirebase.countTail(_editTripId, trip.startDate, trip.endDate).catch(() => []);
        if (tail.length) {
          const list = tail.slice(0, 5).join(', ') + (tail.length > 5 ? ` и ещё ${tail.length - 5}` : '');
          const ok = await UIUtils.confirmSheet(`Меню переедет по дням: день 1 останется днём 1. Но поездка стала короче — из меню уйдут блюда последних дней: ${list}.`,
            { title: 'Сократить поездку?', okLabel: 'Сохранить всё равно', cancelLabel: 'Вернуться' });
          if (!ok) return;
        }
      }
      if (datesChanged) {
        update.weather = null; update.weatherDaily = null; update.weatherHourly = null;
      }
      await TripsData.updateTrip(_editTripId, update);
      if (datesChanged && typeof MenuFirebase !== 'undefined' && MenuFirebase.syncDays) {
        MenuFirebase.syncDays(_editTripId, trip.startDate, trip.endDate).catch(e => console.error('menu syncDays:', e));
      }
      // Переименовали место — улов ссылается на него по названию
      // (catch.river), переносим, иначе он «пропадает» из карточки места.
      const oldRivers = existing?.rivers || [];
      (trip.rivers || []).forEach(r => {
        const was = oldRivers.find(o => o.id && o.id === r.id);
        if (was && was.name !== r.name) {
          firebase.firestore().collection('trips').doc(_editTripId).collection('catches')
            .where('river', '==', was.name).get()
            .then(snap => snap.forEach(d => d.ref.update({ river: r.name })))
            .catch(e => console.error('rename river catches:', e));
        }
      });
      // Переименовали участника (_showRenameSheet — «как показывать в этой
      // поездке») — расходы/платежи ссылаются на него по имени-строке, не по
      // uid, иначе старое и новое имя распадаются на двух разных людей в
      // финансовой истории. Реальный баг, найден внешним ревью 2026-09-27.
      // pRenames уже посчитан выше (сравнение с тем, что было при открытии
      // формы, по uid/gid).
      pRenames.forEach(({ uid, gid, newName }) => {
        const was = uid
          ? oldParticipants.find(o => o.uid === uid)
          : oldParticipants.find(o => o.gid === gid);
        if (!was) return;
        if (typeof ExpensesFirebase !== 'undefined') {
          ExpensesFirebase.renameParticipant(_editTripId, was.name, newName)
            .catch(e => console.error('rename participant finances:', e));
        }
        // Дежурства/явка в Меню — та же проблема, что и у Расходов выше
        // (хранятся по имени, не по uid). См. комментарий у
        // MenuFirebase.renameParticipant. Реальный баг, найден внешним
        // ревью 2026-09-27.
        if (typeof MenuFirebase !== 'undefined' && MenuFirebase.renameParticipant) {
          MenuFirebase.renameParticipant(_editTripId, was.name, newName)
            .catch(e => console.error('rename participant menu:', e));
        }
        // Расписание дороги (trip.travel.<имя>.legs, см. tripcover/
        // index.js _saveTravelLegs) — тоже лежит по имени, не по uid/gid.
        // Без переноса оно "прячется" под старым именем — экран ищет по
        // новому и показывает "не указано", хотя рейсы уже заполнены.
        // Реальный баг, найден внешним ревью 2026-09-27. FieldValue.delete()
        // работает и внутри set(...,{merge:true}) (которым пишет
        // TripsData.updateTrip) — старый ключ реально удаляется, а не
        // просто перестаёт учитываться.
        if (existing?.travel && existing.travel[was.name]) {
          TripsData.updateTrip(_editTripId, {
            travel: {
              [was.name]: firebase.firestore.FieldValue.delete(),
              [newName]: existing.travel[was.name],
            },
          }).catch(e => console.error('rename participant travel:', e));
        }
      });
      // Применяем добавления/удаления/переименования состава к СВЕЖИМ
      // серверным participants/memberIds одной транзакцией — не тем, что
      // было в драфте формы (см. комментарий у pToAdd/pToRemove выше).
      // Кого-то исключили — TripsFirebase.applyParticipantsDiff В ТОЙ ЖЕ
      // транзакции отзывает и ссылку-приглашение (раньше это был отдельный
      // .then() ПОСЛЕ, который к моменту выполнения читал _editTripId уже
      // сброшенным в null — форма закрывалась раньше, чем эта асинхронная
      // цепочка успевала дойти до отзыва, и он улетал с null и не
      // срабатывал вообще — исключённый мог вернуться по старой ссылке).
      // Реальная дыра, найдена внешним ревью 2026-09-27.
      if (pToAdd.length || pToRemove.length || pRenames.length || pFieldChanges.length) {
        TripsFirebase.applyParticipantsDiff(_editTripId, { toAdd: pToAdd, toRemove: pToRemove, renames: pRenames, fieldChanges: pFieldChanges, ownerUid })
          .catch(e => console.error('applyParticipantsDiff:', e));
      }
    } else {
      trip.ownerId = ownerUid;
      await TripsData.addTrip(trip);
    }
    // Решение 2026-09-25: план меню из файла ИИ сразу раскладывается в
    // «Меню» (в пустые позиции), а не висит только для просмотра в Инфо.
    const savedId = _editMode && _editTripId ? _editTripId : trip.id;
    if (isExp && _importFileLoaded && _importedData?.menu?.length && typeof MenuFirebase !== 'undefined' && MenuFirebase.importPlan) {
      MenuFirebase.importPlan(savedId, trip.startDate, trip.endDate, _importedData.menu)
        .catch(e => console.error('menu importPlan:', e));
    }
    // _closeCreate() ниже сбрасывает _editMode/_editTripId — если читать
    // _editMode ПОСЛЕ неё (было раньше), проверка "не спрашиваем при
    // редактировании" всегда видела false, даже когда мы только что
    // РЕДАКТИРОВАЛИ поездку. У отредактированной поездки с одним
    // участником это открывало ОБЩЕЕ приглашение в приложение (trip.id у
    // объекта trip в режиме правки не проставлен — MembersRender.showInvite
    // получала undefined) вместо ссылки в саму поездку. Реальный баг,
    // найден внешним ревью 2026-09-27.
    const wasEditMode = _editMode;
    _closeCreate();
    render();
    if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();

    // Новую поездку почти никогда не создают в одиночку, но пригласить
    // приходится отдельным заходом потом, если не вписал реальных
    // участников на шаге 2 — так поездка тихо остаётся без единого
    // реально приглашённого человека. Не спрашиваем при редактировании
    // (там это уже не "новая" поездка) и не лезем, если реальных
    // участников (с uid) и так уже минимум двое.
    if (!wasEditMode && memberIds.length < 2 && typeof MembersRender !== 'undefined') {
      MembersRender.showInvite(trip.id, trip.name);
    }
  }

  function _closeCreate() {
    // Тоже сбрасывает сеанс — чтение файла, начатое до закрытия, не должно
    // применить свой результат, даже если после закрытия форму больше не
    // открывали вообще (см. _createSeq выше).
    _createSeq++;
    const overlay = document.getElementById('create-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 350);
    }
    _importedData = null;
    _importFileLoaded = false;
    _editMode   = false;
    _editTripId = null;
    _copyFromLabel = '';
    _copiedReadiness = null;
  }

  function _autoName() {
    const d = new Date(_draft.startDate);
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
    if (_draft.type === 'expedition') {
      if (_importedData?.meta?.title) return _importedData.meta.title;
      const er = _quizRivers.length ? _quizRivers[0].name : '';
      return er
        ? `${er}, ${d.getDate()} ${months[d.getMonth()]}`
        : `Экспедиция ${d.getDate()} ${months[d.getMonth()]}`;
    }
    const river = _rivers.length ? _rivers[0].name : '';
    return river
      ? `${river}, ${d.getDate()} ${months[d.getMonth()]}`
      : `Рыбалка ${d.getDate()} ${months[d.getMonth()]}`;
  }

  function _today() {
    return new Date().toISOString().slice(0,10);
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  // Переименовать участника на эту поездку — маленький шит вместо голого
  // prompt() (в этом приложении уже есть прецедент отказа от prompt() в
  // пользу шита — см. modules/members/index.js "раньше было три подряд
  // идущих prompt()").
  function _showRenameSheet(idx) {
    const p = _draft.participants[idx];
    if (!p) return;
    let exempt = !!p.dutyExempt;
    let travelSeparate = !!p.travelSeparate;
    const overlay = _openSheet('rename-part-overlay', 'Переименовать', 'как показывать в этой поездке — не меняет имя аккаунта', `
      <input type="text" class="cw-input" id="rename-part-input" value="${_esc(p.name)}">
      <section class="cw-card cw-card--list">
        <button type="button" class="cw-check-row" role="checkbox" aria-checked="${exempt}" data-action="rename-part-exempt-toggle">
          ${_check(exempt)}<span>Не дежурит (дети, пожилые, гости на день)</span>
        </button>
        <button type="button" class="cw-check-row" role="checkbox" aria-checked="${travelSeparate}" data-action="rename-part-travel-toggle">
          ${_check(travelSeparate)}<span>Свои даты приезда/отъезда</span>
        </button>
      </section>`,
      `<button type="button" class="cw-btn-sec" data-action="sheet-close">Отмена</button>
       <button type="button" class="cw-btn-primary" data-action="rename-part-save">Сохранить</button>`);
    const input = overlay.querySelector('#rename-part-input');
    input?.focus();
    input?.select();
    const setRow = (sel, on) => {
      const row = overlay.querySelector(sel);
      row?.setAttribute('aria-checked', on ? 'true' : 'false');
      row?.querySelector('.cw-check')?.classList.toggle('on', on);
    };
    overlay.addEventListener('click', e => {
      if (e.target === overlay || e.target.closest('[data-action="sheet-close"]')) { overlay.remove(); return; }
      if (e.target.closest('[data-action="rename-part-exempt-toggle"]')) {
        exempt = !exempt;
        setRow('[data-action="rename-part-exempt-toggle"]', exempt);
        return;
      }
      if (e.target.closest('[data-action="rename-part-travel-toggle"]')) {
        travelSeparate = !travelSeparate;
        setRow('[data-action="rename-part-travel-toggle"]', travelSeparate);
        return;
      }
      if (e.target.closest('[data-action="rename-part-save"]')) {
        const trimmed = input?.value.trim();
        if (!trimmed) { input?.focus(); return; }
        p.name = trimmed;
        p.dutyExempt = exempt;
        p.travelSeparate = travelSeparate;
        if (travelSeparate) _travelOn = true;
        overlay.remove();
        _refreshCreate();
      }
    });
  }

  return { init, render, showCreate, showEdit, openTrip };
})();

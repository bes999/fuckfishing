'use strict';

const TripsIndex = (() => {

  let _el = null;
  let _createStep = 0;
  let _draft = {};
  let _rivers = [];
  let _importedData = null;   // JSON от AI для экспедиций (или собранный из квиза — та же форма)
  let _expMode = 'quiz';      // 'quiz' | 'file' — способ заполнения данных маршрута экспедиции
  let _quizRivers = [];       // реки, добавленные вручную в квизе (name+region, без карты)
  let _quizRouteText = '';    // сырой текст маршрута по дням из квиза, парсится в route[]
  let _dateTouched = false;   // true, если пользователь сам менял поля дат (не просто дефолт "сегодня")
  let _editMode   = false;    // true = редактирование существующей поездки
  let _editTripId = null;     // id редактируемой поездки

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
    _createStep = 0;
    _importedData = null;
    _expMode = 'quiz';
    _quizRivers = [];
    _quizRouteText = '';
    _dateTouched = !!prefillDate;
    // Создатель поездки — сразу в участниках, чтобы не вписывать себя
    // вручную каждый раз; можно убрать кликом по чипу, как любого другого.
    const myName = window.APP?.profile?.displayName || '';
    _draft = {
      type: 'fishing',
      name: '',
      startDate: prefillDate || _today(),
      endDate:   prefillDate || _today(),
      rivers: [],
      participants: myName ? [myName] : [],
      comment: ''
    };
    _rivers = [];
    _renderCreate();
  }

  function showEdit(tripId) {
    const trip = TripsData.getById(tripId);
    if (!trip) return;

    _editMode   = true;
    _editTripId = tripId;
    _createStep = 0;
    _importedData = trip.importData || null;
    _expMode = _importedData ? 'file' : 'quiz';
    _quizRivers = [];
    _quizRouteText = '';
    _dateTouched = true;

    _draft = {
      type:         trip.type,
      name:         trip.name,
      startDate:    trip.startDate,
      endDate:      trip.endDate,
      rivers:       trip.rivers || [],
      participants: trip.participants ? [...trip.participants] : [],
      comment:      trip.comment || '',
    };
    _rivers = trip.type === 'fishing' ? [...(trip.rivers || [])] : [];

    _renderCreate();
  }

  function _renderCreate() {
    document.getElementById('create-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'create-overlay';
    overlay.className = 'create-overlay';
    overlay.innerHTML = `
      <div class="create-sheet" id="create-sheet">
        <div class="create-topbar" id="create-topbar-el">
          ${_createTopbar()}
        </div>
        <div class="create-body" id="create-body">
          ${_createStepContent()}
        </div>
        <div class="create-footer" id="create-footer-el">
          ${_createFooter()}
        </div>
      </div>`;
    document.body.appendChild(overlay);

    requestAnimationFrame(() => {
      overlay.classList.add('visible');
    });

    _bindCreate(overlay);
  }

  function _createTopbar() {
    const isExp = _draft.type === 'expedition';

    // Заголовки и подзаголовки зависят от типа и шага
    const titles = _editMode
      ? { fishing:    ['Редактировать', 'Места и детали',  'Проверьте данные'],
          expedition: ['Редактировать', 'Данные маршрута', 'Проверьте данные'] }
      : { fishing:    ['Новая поездка', 'Новая рыбалка',   'Проверьте данные'],
          expedition: ['Новая поездка', 'Данные маршрута', 'Проверьте данные'] };
    const subs = {
      fishing:    ['Шаг 1 из 2', 'Шаг 2 из 2', 'Шаг 3 из 3'],
      expedition: ['Шаг 1 из 2', 'Шаг 2 из 2', 'Шаг 3 из 3'],
    };

    const type = isExp ? 'expedition' : 'fishing';
    return `
      <div class="create-topbar">
        <button class="create-back" id="createBack">
          <svg viewBox="0 0 24 24"><polyline points="15 18 9 12 15 6"/></svg>
        </button>
        <div>
          <div class="create-top-title">${titles[type][_createStep]}</div>
          <div class="create-top-sub">${subs[type][_createStep]}</div>
        </div>
      </div>`;
  }

  function _steps() {
    return `
      <div class="create-steps">
        <div class="create-step ${_createStep === 0 ? 'active' : 'done'}"></div>
        <div class="create-step ${_createStep === 1 ? 'active' : _createStep > 1 ? 'done' : ''}"></div>
        <div class="create-step ${_createStep === 2 ? 'active' : ''}"></div>
      </div>`;
  }

  function _createStepContent() {
    if (_createStep === 0) return _step0();
    if (_createStep === 1) {
      // КЛЮЧЕВОЕ ВЕТВЛЕНИЕ: экспедиция идёт на импорт, рыбалка — на поля
      return _draft.type === 'expedition' ? _step1Expedition() : _step1Fishing();
    }
    return _step2();
  }

  // ─── Шаг 0: тип + базовые поля (не меняется) ───────────────────────────

  function _step0() {
    return `
      ${_steps()}
      <div class="type-grid">
        <div class="type-opt ${_draft.type === 'expedition' ? 'selected' : ''}" data-type="expedition">
          <div class="type-opt-icon">🏔</div>
          <div class="type-opt-name">Экспедиция</div>
          <div class="type-opt-sub">Несколько дней,<br>несколько участников</div>
        </div>
        <div class="type-opt ${_draft.type === 'fishing' ? 'selected' : ''}" data-type="fishing">
          <div class="type-opt-icon">🎣</div>
          <div class="type-opt-name">Рыбалка</div>
          <div class="type-opt-sub">1–2 дня,<br>быстро завести</div>
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">Название</div>
        <input class="field-input" id="f-name" type="text"
               placeholder="${_draft.type === 'expedition' ? 'Сахалин 2026' : 'Ока, 15 марта'}"
               value="${_esc(_draft.name)}">
        <div class="field-hint">Оставьте пустым — сгенерируется автоматически</div>
      </div>

      <div class="field-row">
        <div class="field-group">
          <div class="field-label">Дата начала</div>
          <input class="field-input" id="f-start" type="date" value="${_draft.startDate}">
        </div>
        <div class="field-group">
          <div class="field-label">Дата конца</div>
          <input class="field-input" id="f-end" type="date" value="${_draft.endDate}">
        </div>
      </div>`;
  }

  // ─── Шаг 1 ЭКСПЕДИЦИЯ: импорт JSON от AI ────────────────────────────────

  function _step1Expedition() {
    const imported = _importedData;
    const hasData  = !!imported;

    // Превью если данные уже загружены (файл от AI)
    const previewHtml = hasData ? `
      <div class="import-preview">
        <div class="import-preview-title">✅ Данные загружены</div>
        <div class="import-preview-chips">
          ${imported.route  ?.length ? `<div class="import-chip">📅 ${imported.route.length} дн.</div>`  : ''}
          ${imported.rivers ?.length ? `<div class="import-chip">🎣 ${imported.rivers.length} рек</div>` : ''}
          ${imported.menu   ?.length ? `<div class="import-chip">🍽 Меню</div>`   : ''}
          ${imported.flights?.length ? `<div class="import-chip">✈️ Рейсы</div>` : ''}
        </div>
        <button class="import-reset-btn" id="importReset">Заменить файл</button>
      </div>` : '';

    const uploadHtml = !hasData ? `
      <div class="import-dropzone" id="importDropzone">
        <div class="import-dz-icon">🤖</div>
        <div class="import-dz-title">Загрузить данные маршрута</div>
        <div class="import-dz-sub">JSON-файл, подготовленный AI — маршрут, реки, меню</div>
        <label class="import-dz-btn" for="importFile">Выбрать файл</label>
        <input type="file" id="importFile" accept=".json" style="display:none">
        <div class="import-dz-hint">или перетащите файл сюда</div>
      </div>` : '';

    const quizHtml = `
      <div class="field-group">
        <div class="field-label">Реки / места</div>
        <div class="rivers-list" id="quizRiversList">
          ${_quizRivers.map((r,i) => `
            <div class="river-item">
              <div class="river-item-body">
                <div class="river-item-name">${_esc(r.name)}</div>
                ${r.region ? `<div class="river-item-sub">📍 ${_esc(r.region)}</div>` : ''}
              </div>
              <button class="river-remove" data-quiz-river-idx="${i}">×</button>
            </div>`).join('')}
        </div>
        <div class="quiz-river-add">
          <input class="field-input" id="f-quiz-river-name" type="text" placeholder="Название реки">
          <input class="field-input" id="f-quiz-river-region" type="text" placeholder="Регион (необязательно)">
          <button class="btn-secondary quiz-river-add-btn" id="quizRiverAdd">+ Добавить место</button>
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">
          Маршрут по дням
          <span class="field-hint-inline">— необязательно</span>
        </div>
        <div class="quiz-route-hint">Строка с двоеточием на конце — новый день («День 1 — прилёт:»). Дальше — пункты расписания, время можно указать в начале строки.</div>
        <textarea class="field-textarea quiz-route-ta" id="f-quiz-route" rows="7"
                  placeholder="День 1 — прилёт:&#10;09:15 Прилёт, багаж&#10;13:00 Выезд на реку&#10;&#10;День 2 — рыбалка:&#10;Целый день на воде">${_esc(_quizRouteText)}</textarea>
      </div>`;

    return `
      ${_steps()}

      <div class="field-group" style="margin-bottom:8px">
        <div class="field-label">Участники</div>
        <div class="parts-wrap" id="partsList">
          ${(_draft.participants || []).map((p,i) => `
            <div class="part-chip-sel" data-part-idx="${i}">${_esc(p)} ×</div>`).join('')}
          <input class="field-input" id="f-participant" type="text"
                 placeholder="Имя участника..." style="width:auto;flex:1;min-width:120px">
        </div>
      </div>

      <div class="exp-mode-tabs">
        <div class="exp-mode-tab ${_expMode === 'quiz' ? 'on' : ''}" data-exp-mode="quiz">📝 Квиз</div>
        <div class="exp-mode-tab ${_expMode === 'file' ? 'on' : ''}" data-exp-mode="file">🤖 Файл от AI</div>
      </div>

      ${_expMode === 'quiz' ? quizHtml : `
      <div class="import-section">
        ${previewHtml}
        ${uploadHtml}
      </div>`}`;
  }

  // ─── Шаг 1 РЫБАЛКА: поля без изменений ─────────────────────────────────

  function _step1Fishing() {
    const riversHtml = _rivers.map((r, i) => `
      <div class="river-item">
        <div class="river-item-body">
          <div class="river-item-name">${_esc(r.name)}</div>
          <div class="river-item-sub">📍 ${_esc(r.region)}</div>
        </div>
        <button class="river-remove" data-river-idx="${i}">×</button>
      </div>`).join('');

    return `
      ${_steps()}

      <div class="field-group">
        <div class="field-label">Места</div>
        <div class="rivers-list" id="riversList">
          ${riversHtml}
          <div id="riverSearch">
            <input class="field-input" id="f-river" type="text" placeholder="Поиск реки или водоёма..." autocomplete="off">
            <div class="osm-hint">🗺 OpenStreetMap — координаты подтянутся автоматически</div>
            <div class="suggest-wrap" id="riverSuggestions">
              ${_defaultRiverChips()}
            </div>
          </div>
          <div class="river-add-row" id="addRiverBtn" style="${_rivers.length ? '' : 'display:none'}">
            <div class="river-add-icon">
              <svg viewBox="0 0 24 24"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            </div>
            <div class="river-add-label">Добавить ещё место</div>
          </div>
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">Участники</div>
        <div class="parts-wrap" id="partsList">
          ${(_draft.participants || []).map((p,i) => `
            <div class="part-chip-sel" data-part-idx="${i}">${_esc(p)} ×</div>`).join('')}
          <input class="field-input" id="f-participant" type="text"
                 placeholder="Имя участника..." style="width:auto;flex:1;min-width:120px">
        </div>
      </div>

      <div class="field-group">
        <div class="field-label">Комментарий</div>
        <textarea class="field-textarea" id="f-comment"
                  placeholder="На что планируем ловить, заметки...">${_esc(_draft.comment)}</textarea>
      </div>`;
  }

  // ─── Шаг 2: сводка ──────────────────────────────────────────────────────

  function _step2() {
    const isExp = _draft.type === 'expedition';
    const dates = _draft.startDate === _draft.endDate
      ? _draft.startDate
      : `${_draft.startDate} – ${_draft.endDate}`;

    // Места: для экспедиции берём из importedData.rivers если есть
    let places = '';
    let riverChips = '';
    if (isExp && _importedData?.rivers?.length) {
      riverChips = _importedData.rivers
        .map(r => `<div class="summary-chip">${_esc(r.name)}</div>`).join('');
      places = _importedData.rivers.map(r => r.name).join(', ');
    } else if (_rivers.length) {
      riverChips = _rivers.map(r => `<div class="summary-chip">${_esc(r.name)}</div>`).join('');
      places = _rivers.map(r => `${r.name}, ${r.region}`).join('; ');
    }

    const parts = (_draft.participants || []).join(', ');

    // Строки импорта для экспедиции
    const importRows = isExp && _importedData ? `
      <div class="summary-row">
        <div class="summary-key">Маршрут</div>
        <div class="summary-chips">
          ${_importedData.route  ?.length ? `<div class="summary-chip">📅 ${_importedData.route.length} дн.</div>` : ''}
          ${_importedData.menu   ?.length ? `<div class="summary-chip">🍽 Меню</div>`  : ''}
          ${_importedData.flights?.length ? `<div class="summary-chip">✈️ Рейсы</div>` : ''}
        </div>
      </div>` : '';

    return `
      ${_steps()}
      <div class="summary-card">
        <div class="summary-head">
          <div class="summary-type">${isExp ? '🏔 Экспедиция' : '🎣 Рыбалка'}</div>
          <div class="summary-name">${_esc(_draft.name || _autoName())}</div>
          ${places ? `<div class="summary-place">${_esc(places)}</div>` : ''}
        </div>
        <div class="summary-rows">
          <div class="summary-row">
            <div class="summary-key">Даты</div>
            <div class="summary-val">${dates}</div>
          </div>
          ${riverChips ? `
          <div class="summary-row">
            <div class="summary-key">Места</div>
            <div class="summary-chips">${riverChips}</div>
          </div>` : ''}
          ${parts ? `
          <div class="summary-row">
            <div class="summary-key">Участники</div>
            <div class="summary-chips">
              ${(_draft.participants || []).map(p => `<div class="summary-chip">${_esc(p)}</div>`).join('')}
            </div>
          </div>` : ''}
          ${importRows}
          ${_draft.comment ? `
          <div class="summary-row">
            <div class="summary-key">Комментарий</div>
            <div class="summary-val" style="font-weight:400;font-size:13px;color:var(--label3)">${_esc(_draft.comment)}</div>
          </div>` : ''}
        </div>
      </div>
      <div class="success-hint">
        ${isExp
          ? '✓ Маршрут, реки и меню откроются внутри поездки'
          : '✓ После создания сможешь заполнить отчёт — улов, приманки, погода'}
      </div>`;
  }

  function _createFooter() {
    const isLast = _createStep === 2;
    const isExp  = _draft.type === 'expedition';

    if (!isLast) {
      // На шаге импорта файлом для экспедиции — можно пропустить (в квизе
      // поля и так помечены необязательными, отдельная кнопка не нужна)
      const skipHtml = (_createStep === 1 && isExp && _expMode === 'file' && !_importedData)
        ? `<button class="btn-secondary" id="createSkip">Пропустить →</button>`
        : '';
      return `<button class="btn-primary" id="createNext">Далее →</button>${skipHtml}`;
    }
    return `
      <button class="btn-primary" id="createSave">${isExp ? 'Создать экспедицию' : 'Создать рыбалку'}</button>
      <button class="btn-secondary" id="createPrev">← Назад</button>`;
  }

  function _bindCreate(overlay) {
    // Даты — если пользователь сам меняет поля, больше не даём импорту их перезаписать
    document.getElementById('f-start')?.addEventListener('input', () => { _dateTouched = true; });
    document.getElementById('f-end')?.addEventListener('input', () => { _dateTouched = true; });

    // Тип
    overlay.querySelectorAll('[data-type]').forEach(opt => {
      opt.addEventListener('click', () => {
        _draft.type = opt.dataset.type;
        overlay.querySelectorAll('[data-type]').forEach(o => o.classList.remove('selected'));
        opt.classList.add('selected');
        // Обновляем плейсхолдер имени
        const nameInput = document.getElementById('f-name');
        if (nameInput && !nameInput.value) {
          nameInput.placeholder = _draft.type === 'expedition' ? 'Сахалин 2026' : 'Ока, 15 марта';
        }
      });
    });

    // Кнопка назад
    document.getElementById('createBack')?.addEventListener('click', () => {
      if (_createStep === 0) { _closeCreate(); return; }
      _saveCurrentFields();
      _createStep--;
      _refreshCreate();
    });

    // Далее
    document.getElementById('createNext')?.addEventListener('click', () => {
      _saveCurrentFields();
      _createStep++;
      _refreshCreate();
    });

    // Пропустить (экспедиция без импорта)
    document.getElementById('createSkip')?.addEventListener('click', () => {
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

    // Назад со сводки
    document.getElementById('createPrev')?.addEventListener('click', () => {
      _createStep--;
      _refreshCreate();
    });

    // ── Импорт JSON (только для экспедиции, шаг 1) ──────────────────────

    // Переключатель способа заполнения данных маршрута (квиз / файл от AI)
    overlay.querySelectorAll('[data-exp-mode]').forEach(tab => {
      tab.addEventListener('click', () => {
        _saveCurrentFields();
        _expMode = tab.dataset.expMode;
        _refreshCreate();
      });
    });

    // Квиз: добавить реку/место
    document.getElementById('quizRiverAdd')?.addEventListener('click', () => {
      const nameInp   = document.getElementById('f-quiz-river-name');
      const regionInp = document.getElementById('f-quiz-river-region');
      const name = nameInp?.value.trim();
      if (!name) { nameInp?.focus(); return; }
      _quizRivers.push({ name, region: regionInp?.value.trim() || '' });
      _refreshCreate();
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

    // ── Рыбалка: реки ───────────────────────────────────────────────────

    _bindStaticRiverChips();
    document.getElementById('f-river')?.addEventListener('input', _onRiverSearchInput);

    overlay.querySelectorAll('[data-river-idx]').forEach(btn => {
      btn.addEventListener('click', () => {
        _rivers.splice(parseInt(btn.dataset.riverIdx), 1);
        _refreshCreate();
      });
    });

    document.getElementById('addRiverBtn')?.addEventListener('click', () => {
      document.getElementById('riverSearch').style.display = '';
      document.getElementById('addRiverBtn').style.display = 'none';
      document.getElementById('f-river')?.focus();
    });

    // ── Участники ────────────────────────────────────────────────────────

    const partInput = document.getElementById('f-participant');
    partInput?.addEventListener('keydown', e => {
      if (e.key === 'Enter' || e.key === ',') {
        e.preventDefault();
        const val = partInput.value.trim();
        if (val) {
          if (!_draft.participants) _draft.participants = [];
          _draft.participants.push(val);
          partInput.value = '';
          _refreshCreate();
        }
      }
    });

    overlay.querySelectorAll('[data-part-idx]').forEach(chip => {
      chip.addEventListener('click', () => {
        _draft.participants.splice(parseInt(chip.dataset.partIdx), 1);
        _refreshCreate();
      });
    });
  }

  // ─── Чтение JSON-файла ───────────────────────────────────────────────────

  function _readImportFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const data = JSON.parse(e.target.result);

        // Базовая валидация
        if (typeof data !== 'object' || Array.isArray(data)) {
          throw new Error('Неверный формат');
        }

        _importedData = data;

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
        alert('Ошибка чтения файла.\nПроверь что это валидный JSON от AI.');
        _importedData = null;
      }
    };
    reader.readAsText(file);
  }

  // ─── Вспомогательные ─────────────────────────────────────────────────────

  // id обязателен — Реки открывают карточку по data-rv-open="r.id"
  // (modules/rivers/render.js:56 / index.js:_openDetail). Без него тап по
  // реке молча ничего не делал для КАЖДОЙ вручную заведённой поездки —
  // и статичные чипы, и живой OSM-поиск шли через эту же функцию.
  function _addRiver(name, region, lat, lon, type) {
    if (!_rivers.find(r => r.name === name)) {
      _rivers.push({
        id: 'river_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 6),
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
      <div class="suggest-chip" data-suggest="р. Ока|Московская обл.">р. Ока</div>
      <div class="suggest-chip" data-suggest="р. Нара|Московская обл.">р. Нара</div>
      <div class="suggest-chip" data-suggest="р. Угра|Калужская обл.">р. Угра</div>`;
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
    if (wrap) wrap.innerHTML = '<div class="suggest-status">Ищу…</div>';
    try {
      const url = 'https://nominatim.openstreetmap.org/search?format=json&limit=5&accept-language=ru&q=' + encodeURIComponent(q);
      const res = await fetch(url);
      const results = await res.json();
      if (seq !== _riverSearchSeq || !wrap) return; // пришёл устаревший ответ — новый поиск уже в процессе
      if (!results.length) { wrap.innerHTML = '<div class="suggest-status">Ничего не нашлось</div>'; return; }
      wrap.innerHTML = results.map(r => {
        const parts  = r.display_name.split(',').map(s => s.trim());
        const name   = parts[0];
        const region = parts.slice(1, 3).join(', ');
        const type   = _osmTypeLabel(r);
        return `<div class="suggest-chip" data-river-name="${_esc(name)}" data-river-region="${_esc(region)}" data-river-lat="${r.lat}" data-river-lon="${r.lon}" data-river-type="${_esc(type)}">${_esc(name)}${type ? ` <span class="suggest-chip-type">· ${_esc(type)}</span>` : ''}</div>`;
      }).join('');
      _bindLiveRiverChips();
    } catch (err) {
      if (seq === _riverSearchSeq && wrap) wrap.innerHTML = '<div class="suggest-status">Не нашёл — проверь соединение</div>';
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
    return {
      meta:   { title: _draft.name || '' },
      // id обязателен — Реки открывают карточку по data-rv-open="r.id"
      rivers: _quizRivers.map((r, i) => ({ id: 'quiz_river_' + i, name: r.name, type: r.region })),
      route:  days,
      menu:    prior?.menu,
      flights: prior?.flights,
      suntide: prior?.suntide
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
        _quizRouteText = document.getElementById('f-quiz-route')?.value || '';
        // Только если квиз реально что-то собрал — не даём пустому
        // просмотру вкладки затереть уже существующий импорт (файл или
        // более ранний квиз) значением null.
        const built = _buildQuizImportData();
        if (built) _importedData = built;
      }
      // Участники — общие для обоих типов
      const partVal = document.getElementById('f-participant')?.value.trim();
      if (partVal && !_draft.participants.includes(partVal)) {
        if (!_draft.participants) _draft.participants = [];
        _draft.participants.push(partVal);
      }
    }
  }

  function _refreshCreate() {
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

    // Реки для экспедиции — из importedData или пустые
    const rivers = isExp
      ? (_importedData?.rivers?.map(r => ({ name: r.name, region: r.type || '' })) || [])
      : _rivers;

    const participants = _draft.participants || [];
    const memberIds = await _matchMemberIds(participants);

    const trip = {
      type:      _draft.type,
      name:      _draft.name || _autoName(),
      startDate: _draft.startDate,
      endDate:   _draft.endDate || _draft.startDate,
      rivers,
      participants,
      memberIds,
      comment:   _draft.comment || '',
      status:    _tripStatus(_draft.startDate, _draft.endDate || _draft.startDate),
      rating:    null,
      fish:      [],
      conditions: {},
      readiness: isExp
        ? { gear:false, menu:false, shopping:false, medkit:false, tickets:false, route:false }
        : null,
      // Данные маршрута от AI (только для экспедиций)
      importData: isExp && _importedData ? _importedData : null,
    };

    if (_editMode && _editTripId) {
      // В режиме редактирования сохраняем существующие данные рейтинга, улова и т.д.
      const existing = TripsData.getById(_editTripId);
      await TripsData.updateTrip(_editTripId, {
        name:        trip.name,
        startDate:   trip.startDate,
        endDate:     trip.endDate,
        rivers:      trip.rivers,
        participants: trip.participants,
        memberIds:   trip.memberIds,
        comment:     trip.comment,
        status:      trip.status,
        importData:  trip.importData !== undefined ? trip.importData : (existing?.importData || null),
      });
    } else {
      trip.ownerId = window.APP?.user?.uid || null;
      await TripsData.addTrip(trip);
    }
    _closeCreate();
    render();
    if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
  }

  // Сопоставляет вписанные вручную имена участников с реальными профилями
  // (по displayName, без учёта регистра) — задел на будущее приглашение
  // в поездку и роли. Само поле participants (строки) не меняется — от
  // него по-прежнему зависят Расходы/Улов/Реки/Безопасность/CSV-экспорт.
  async function _matchMemberIds(participants) {
    if (!participants.length || typeof MembersFirebase === 'undefined') return [];
    try {
      const members = await MembersFirebase.getAllMembers();
      const byName = new Map(members.map(m => [(m.displayName || '').trim().toLowerCase(), m.uid]));
      return participants
        .map(name => byName.get(String(name).trim().toLowerCase()))
        .filter(Boolean);
    } catch (e) {
      return [];
    }
  }

  function _closeCreate() {
    const overlay = document.getElementById('create-overlay');
    if (overlay) {
      overlay.classList.remove('visible');
      setTimeout(() => overlay.remove(), 350);
    }
    _importedData = null;
    _editMode   = false;
    _editTripId = null;
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

  return { init, render, showCreate, showEdit, openTrip };
})();

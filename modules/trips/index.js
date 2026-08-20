'use strict';

const TripsIndex = (() => {

  let _el = null;
  let _createStep = 0;
  let _draft = {};
  let _rivers = [];
  let _importedData = null;   // JSON от AI для экспедиций
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
    _dateTouched = !!prefillDate;
    _draft = {
      type: 'fishing',
      name: '',
      startDate: prefillDate || _today(),
      endDate:   prefillDate || _today(),
      rivers: [],
      participants: [],
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

    // Превью если данные уже загружены
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

      <div class="import-section">
        <div class="field-label" style="margin-bottom:10px">
          Данные маршрута
          <span class="field-hint-inline">— необязательно, можно добавить позже</span>
        </div>
        ${previewHtml}
        ${uploadHtml}
      </div>`;
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
            <input class="field-input" id="f-river" type="text" placeholder="Поиск реки или водоёма...">
            <div class="osm-hint">🗺 OpenStreetMap — регион подтянется автоматически</div>
            <div class="suggest-wrap" id="riverSuggestions">
              <div class="suggest-chip" data-suggest="р. Ока|Московская обл.">р. Ока</div>
              <div class="suggest-chip" data-suggest="р. Нара|Московская обл.">р. Нара</div>
              <div class="suggest-chip" data-suggest="р. Угра|Калужская обл.">р. Угра</div>
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
      // На шаге импорта для экспедиции — можно пропустить
      const skipHtml = (_createStep === 1 && isExp && !_importedData)
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
        _save();
      });
    });

    // Назад со сводки
    document.getElementById('createPrev')?.addEventListener('click', () => {
      _createStep--;
      _refreshCreate();
    });

    // ── Импорт JSON (только для экспедиции, шаг 1) ──────────────────────

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

    overlay.querySelectorAll('[data-suggest]').forEach(chip => {
      chip.addEventListener('click', () => {
        const [name, region] = chip.dataset.suggest.split('|');
        _addRiver(name.trim(), region.trim());
        _refreshCreate();
      });
    });

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

  function _addRiver(name, region) {
    if (!_rivers.find(r => r.name === name)) {
      _rivers.push({ name, region });
    }
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

  function _save() {
    const isExp = _draft.type === 'expedition';

    // Реки для экспедиции — из importedData или пустые
    const rivers = isExp
      ? (_importedData?.rivers?.map(r => ({ name: r.name, region: r.type || '' })) || [])
      : _rivers;

    const trip = {
      type:      _draft.type,
      name:      _draft.name || _autoName(),
      startDate: _draft.startDate,
      endDate:   _draft.endDate || _draft.startDate,
      rivers,
      participants: _draft.participants || [],
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
      TripsData.updateTrip(_editTripId, {
        name:        trip.name,
        startDate:   trip.startDate,
        endDate:     trip.endDate,
        rivers:      trip.rivers,
        participants: trip.participants,
        comment:     trip.comment,
        status:      trip.status,
        importData:  trip.importData !== undefined ? trip.importData : (existing?.importData || null),
      });
    } else {
      TripsData.addTrip(trip);
    }
    _closeCreate();
    render();
    if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
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
    if (_draft.type === 'expedition' && _importedData?.meta?.title) {
      return _importedData.meta.title;
    }
    const river = _rivers.length ? _rivers[0].name : '';
    const d = new Date(_draft.startDate);
    const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
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

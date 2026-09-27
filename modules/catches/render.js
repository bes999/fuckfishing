'use strict';

// Улов поездки (редизайн v2, макеты V2Catches / V2CatchesList / V2SheetCatch).
// Два экрана внутри модуля: сводка ('summary') и «Все поимки» ('list').
// Добавление и правка — один лист (bottom sheet) поверх страницы, открывается
// плавающей кнопкой «+ Улов» или нажатием на поимку в списке.
// Снаружи лист добавления открывается через CatchesRender.openAdd()
// (или клик по [data-action="add-catch"]).
const CatchesRender = (() => {

  let _el     = null;
  let _tripId = null;
  let _view   = 'summary'; // 'summary' | 'list'

  // Фильтры «Всех поимок» — живут, пока открыт модуль.
  let _fPeople  = new Set();
  let _fSpecies = new Set();
  let _search   = '';
  let _searchOpen = false;

  // ── Entry point ──────────────────────────────────────────────

  function render(el, tripId) {
    // Каждый заход в модуль — со сводки, фильтры «Всех поимок» сбрасываются.
    _view = 'summary'; _resetFilters();
    _el     = el;
    _tripId = tripId;
    if (!el) return;
    // Внутри Гида шапку рисует tripcover; своя шапка с «Назад» — только
    // на отдельной странице #p-catches (заход через гамбургер).
    const standalone = el.id === 'p-catches';
    el.innerHTML = `
      <div class="ct-wrap">
        ${standalone ? _topbar() : ''}
        <div class="ct-body" id="ct-body">${_body()}</div>
        <button type="button" class="ct-fab" data-action="add-catch">${UIUtils.ico('plus')}Улов</button>
        <!-- Совместимость: Главная (modules/home/render.js _quickAction) пока
             кликает по старой вкладке .ct-tab[data-tab="add"]. Убрать, когда
             Главная перейдёт на CatchesRender.openAdd(). -->
        <button type="button" class="ct-tab" data-tab="add" data-action="add-catch" style="display:none" tabindex="-1" aria-hidden="true"></button>
      </div>`;
    _bind();
  }

  function refresh() {
    if (!_el) return;
    const body = _el.querySelector('#ct-body');
    if (!body) return;
    // В списке перерисовываем только чипы и результаты — чтобы реалтайм-
    // обновление не сбивало фокус с поля поиска.
    if (_view === 'list' && body.querySelector('#ct-list-results')) {
      _refreshList();
      return;
    }
    body.innerHTML = _body();
  }

  function openAdd() {
    if (!_tripId) return;
    _showCatchSheet(null);
  }

  function _resetFilters() {
    _fPeople = new Set(); _fSpecies = new Set(); _search = ''; _searchOpen = false;
  }

  // ── Topbar (только отдельная страница) ───────────────────────

  function _topbar() {
    const trip = _trip();
    return `
      <div class="ct-topbar">
        <button class="ct-back" id="ct-back" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
        <div class="ct-topbar__text">
          <div class="ct-topbar__title">Улов</div>
          <div class="ct-topbar__sub">${trip ? _esc(trip.name) : ''}</div>
        </div>
      </div>`;
  }

  function _body() {
    return _view === 'list' ? _viewList() : _viewSummary();
  }

  // ── Экран: сводка улова ──────────────────────────────────────

  function _viewSummary() {
    const catches = CatchesState.getCatches(_tripId);

    if (!catches.length) {
      return `
        <div class="ct-scroll">
          <div class="ct-empty">
            <div class="ct-empty__icon">${UIUtils.ico('fishing')}</div>
            <div class="ct-empty__title">Улов пока пустой</div>
            <div class="ct-empty__sub">Нажми «+ Улов», чтобы записать первую поимку</div>
          </div>
        </div>`;
    }

    const stats = CatchesState.computeStats(_tripId);
    const days  = _byDay(catches);

    // «все отпущены / взяли X · отпустили Y» + сколько записей за сколько дней
    let keptLine;
    if (!stats.kept)          keptLine = 'все отпущены';
    else if (!stats.released) keptLine = 'все взяли';
    else                      keptLine = `взяли ${stats.kept} · отпустили ${stats.released}`;
    keptLine += ` · ${stats.count} ${_plural(stats.count, ['запись', 'записи', 'записей'])}`
      + ` за ${days.length} ${_plural(days.length, ['день', 'дня', 'дней'])}`;

    return `
      <div class="ct-scroll">
        <section class="ct-hero">
          <div class="ct-hero__line">
            <span class="ct-hero__num">${stats.total}</span>
            <span class="ct-hero__unit">${_plural(stats.total, ['рыба', 'рыбы', 'рыб'])} · ${stats.species} ${_plural(stats.species, ['вид', 'вида', 'видов'])}</span>
          </div>
          <span class="ct-hero__sub">${keptLine}</span>
        </section>

        ${_trophyCard(catches)}
        ${_whoCard(catches)}
        ${_speciesCard(catches, stats)}
        ${_daysCard(days)}
        ${_whereCard(stats)}

        <button type="button" class="ct-all-btn" data-action="open-list">
          Все поимки
          <span class="ct-all-btn__right">${stats.count} ${UIUtils.ico('chevron-right')}</span>
        </button>
      </div>`;
  }

  // Трофей — самая тяжёлая рыба поездки (только записи с весом).
  function _trophyCard(catches) {
    const weighed = catches.filter(c => c.weight != null);
    if (!weighed.length) return '';
    const t = weighed.reduce((a, b) => (b.weight > a.weight ? b : a));
    const sub = [
      t.member,
      [_fmtDateLong(t.date), t.time].filter(Boolean).join(', '),
      _tackleSummary(t.tackle),
    ].filter(Boolean).map(_esc).join(' · ');
    return `
      <div class="ct-card ct-trophy">
        <div class="ct-trophy__head">
          <span class="ct-trophy__ico">${UIUtils.ico('trophy')}</span>
          <span class="ct-trophy__lbl">Трофей поездки</span>
        </div>
        <div class="ct-trophy__title">${_esc(t.fish)} ${_fmtKg(t.weight)} кг</div>
        ${sub ? `<div class="ct-trophy__sub">${sub}</div>` : ''}
        ${t.comment ? `<div class="ct-trophy__note">${_esc(t.comment)}</div>` : ''}
      </div>`;
  }

  function _whoCard(catches) {
    const by = {};
    catches.forEach(c => {
      if (!c.member) return;
      const m = by[c.member] || (by[c.member] = { count: 0, max: null });
      m.count += c.count;
      if (c.weight != null && (m.max == null || c.weight > m.max)) m.max = c.weight;
    });
    const rows = Object.entries(by).sort((a, b) => b[1].count - a[1].count);
    if (!rows.length) return '';
    return `
      <div class="ct-card">
        <h2 class="ct-card__title">Кто поймал</h2>
        <div class="ct-rows">
          ${rows.map(([name, m]) => _numRow(_esc(name), m.count,
            m.max != null ? `крупнейшая — ${_fmtKg(m.max)} кг` : '')).join('')}
        </div>
      </div>`;
  }

  function _speciesCard(catches, stats) {
    return `
      <div class="ct-card">
        <h2 class="ct-card__title">По видам</h2>
        <div class="ct-rows">
          ${stats.topFish.map(f => {
            const w = catches.filter(c => c.fish === f.name && c.weight != null).map(c => c.weight);
            let sub = '';
            if (w.length === 1) sub = `${_fmtKg(w[0])} кг`;
            else if (w.length > 1) sub = `средний вес ${_fmtKg(w.reduce((a, b) => a + b, 0) / w.length)} кг`;
            return _numRow(`${_fishEmoji(f.name)} ${_esc(f.name)}`, f.count, sub);
          }).join('')}
        </div>
      </div>`;
  }

  function _daysCard(days) {
    if (!days.length) return '';
    const asc  = days.slice().reverse();
    const best = Math.max(...asc.map(d => d.total));
    return `
      <div class="ct-card">
        <h2 class="ct-card__title">По дням</h2>
        <div class="ct-days">
          ${asc.map(d => `
            <div class="ct-day ${d.total === best ? 'ct-day--best' : ''}" aria-label="${_esc(_fmtDateLong(d.date))}: ${d.total}">
              <span class="ct-day__num">${d.total}</span>
              <span class="ct-day__date">${_dayOfMonth(d.date)}</span>
            </div>`).join('')}
        </div>
      </div>`;
  }

  // «Где» — строка реки открывает её карточку (как раньше goto-river).
  function _whereCard(stats) {
    if (!stats.topRivers.length) return '';
    return `
      <div class="ct-card">
        <h2 class="ct-card__title">Где</h2>
        <div class="ct-rows">
          ${stats.topRivers.map(r => `
            <button type="button" class="ct-num-row ct-num-row--link" data-action="goto-river" data-river="${_esc(r.name)}">
              <span class="ct-num-row__text"><span class="ct-num-row__lbl">${_esc(r.name)}</span><span class="ct-num-row__sub">открыть карточку реки</span></span>
              <span class="ct-num-row__num">${r.count}${UIUtils.ico('chevron-right')}</span>
            </button>`).join('')}
        </div>
      </div>`;
  }

  function _numRow(labelHtml, n, sub) {
    return `
      <div class="ct-num-row">
        <span class="ct-num-row__text"><span class="ct-num-row__lbl">${labelHtml}</span>${sub ? `<span class="ct-num-row__sub">${_esc(sub)}</span>` : ''}</span>
        <span class="ct-num-row__num">${n}</span>
      </div>`;
  }

  // ── Экран: все поимки ────────────────────────────────────────

  function _viewList() {
    const catches = CatchesState.getCatches(_tripId);
    return `
      <div class="ct-list-head">
        <button type="button" class="ct-icon-btn" data-action="close-list" aria-label="Назад к улову">${UIUtils.ico('chevron-left')}</button>
        <div class="ct-list-head__text">
          <span class="ct-list-head__title">Все поимки</span>
          <span class="ct-list-head__sub">${catches.length} ${_plural(catches.length, ['запись', 'записи', 'записей'])}</span>
        </div>
        <button type="button" class="ct-icon-btn ${_searchOpen ? 'is-on' : ''}" data-action="toggle-search" aria-label="Искать по комментарию">${UIUtils.ico('search')}</button>
      </div>
      <div class="ct-scroll ct-scroll--list">
        <input class="ct-input ct-search" id="ct-search" type="search" placeholder="Искать по комментарию…"
               value="${_esc(_search)}" autocomplete="off" ${_searchOpen ? '' : 'hidden'}>
        <div class="ct-pills" id="ct-list-chips">${_listChips()}</div>
        <div id="ct-list-results">${_listResults()}</div>
        <p class="ct-hint">Нажми на поимку, чтобы изменить · смахни влево, чтобы удалить (свои или если ты организатор)</p>
      </div>`;
  }

  function _refreshList() {
    const chips = _el.querySelector('#ct-list-chips');
    const res   = _el.querySelector('#ct-list-results');
    const sub   = _el.querySelector('.ct-list-head__sub');
    const n = CatchesState.getCatches(_tripId).length;
    if (chips) chips.innerHTML = _listChips();
    if (res)   res.innerHTML   = _listResults();
    if (sub)   sub.textContent = `${n} ${_plural(n, ['запись', 'записи', 'записей'])}`;
  }

  function _listChips() {
    const catches = CatchesState.getCatches(_tripId);
    const people  = _uniqByCount(catches, c => c.member);
    const species = _uniqByCount(catches, c => c.fish);
    const none = !_fPeople.size && !_fSpecies.size;
    const pill = (label, on, attrs) =>
      `<button type="button" class="ct-pill ${on ? 'is-on' : ''}" aria-pressed="${on}" ${attrs}>${label}</button>`;
    return pill('Все', none, 'data-action="filter-all"')
      + people.map(p => pill(_esc(p), _fPeople.has(p), `data-action="filter-person" data-v="${_esc(p)}"`)).join('')
      + species.map(s => pill(_esc(s), _fSpecies.has(s), `data-action="filter-species" data-v="${_esc(s)}"`)).join('');
  }

  function _listResults() {
    const q = _search.trim().toLowerCase();
    const list = CatchesState.getCatches(_tripId).filter(c =>
      (!_fPeople.size  || _fPeople.has(c.member)) &&
      (!_fSpecies.size || _fSpecies.has(c.fish)) &&
      (!q || (c.comment || '').toLowerCase().includes(q)));
    if (!list.length) return '<div class="ct-list-empty">Ничего не нашлось</div>';
    return _byDay(list).map(d => `
      <div class="ct-day-head">
        <span class="ct-day-head__date">${_esc(_fmtDayHead(d.date))}</span>
        <span class="ct-day-head__n">${d.total} ${_plural(d.total, ['рыба', 'рыбы', 'рыб'])}</span>
      </div>
      <div class="ct-card ct-card--list">
        ${d.items.map(_catchRow).join('')}
      </div>`).join('');
  }

  function _catchRow(c) {
    const title = `${_esc(c.fish)}${c.count > 1 ? ' × ' + c.count : ''}${c.weight != null ? ' · ' + _fmtKg(c.weight) + ' кг' : ''}`;
    const meta = [c.member, c.time, c.kept ? '' : 'отпустили'].filter(Boolean).map(_esc).join(' · ');
    const firstLine = (c.comment || '').split('\n')[0];
    return `
      <div class="ct-row" data-id="${_esc(c._id)}">
        <button type="button" class="ct-row__main" data-action="edit-catch" data-id="${_esc(c._id)}">
          <span class="ct-row__emoji">${_fishEmoji(c.fish)}</span>
          <span class="ct-row__text">
            <span class="ct-row__title">${title}</span>
            ${meta ? `<span class="ct-row__meta">${meta}</span>` : ''}
            ${firstLine ? `<span class="ct-row__note">${_esc(firstLine)}</span>` : ''}
          </span>
          <span class="ct-row__chev">${UIUtils.ico('chevron-right')}</span>
        </button>
        ${_canDelete(c) ? `<button type="button" class="ct-row-del" data-action="del-catch" data-id="${_esc(c._id)}" aria-label="Удалить"></button>` : ''}
      </div>`;
  }

  // ── Права ────────────────────────────────────────────────────

  // Удалить — автор записи или организатор поездки (как в firestore.rules).
  // Править может любой участник (там же: update — isMember()).
  function _canDelete(c) {
    const myUid = window.APP?.user?.uid;
    if (myUid && c.createdBy === myUid) return true;
    return !!myUid && TripsData.canManage(_trip());
  }

  // ── Лист «Улов»: добавление и правка ─────────────────────────
  // Одно окно с тремя панелями: основная, «Место», «Снасть» (вложенные
  // экраны листа со стрелкой назад, V2SheetTackle). Панели переключаются
  // через hidden, поэтому введённое в основной не теряется.

  const CLARITY = [
    { id: 'clear',  label: 'Чистая' },
    { id: 'medium', label: 'Слегка мутная' },
    { id: 'murky',  label: 'Мутная' },
  ];
  const CLARITY_LABELS = { clear: 'чистая', medium: 'слегка мутная', murky: 'мутная' };

  // Тип приманки двухуровневый: группа → тип.
  const TACKLE_TYPE_GROUPS = [
    { label: 'Силикон', items: ['Твистер', 'Виброхвост', 'Слаг', 'Креатура'] },
    { label: 'Поролон', items: ['Поролонка (слаг)', 'Поролонка обычная'] },
    { label: 'Воблеры', items: ['Кренк', 'Минноу', 'Фэт'] },
    { label: 'Железо',  items: ['Вертушка', 'Колебалка'] },
    { label: 'Другое',  items: ['Мормышка', 'Балансир', 'Живец/наживка', 'Мандула', 'Другое'] },
  ];
  const WEIGHT_TYPES = ['Джиг-головка', 'Чебурашка', 'Каролинская оснастка', 'Отводной поводок', 'Без огрузки', 'Другое'];

  const QUICK_FISH = 6; // сколько видов показывать чипами до «Другой вид…»

  function _showCatchSheet(catchId) {
    document.getElementById('ct-sheet-ov')?.remove();
    const editing = catchId ? CatchesState.getCatches(_tripId).find(c => c._id === catchId) : null;
    if (catchId && !editing) return;

    const trip    = _trip();
    const members = CatchesState.getMembers(_tripId);
    const catches = CatchesState.getCatches(_tripId);
    const catalog = CatchesData.getFishGroups(trip);
    const allFish = catalog.flatMap(g => g.items);
    // Быстрые чипы: сначала то, что уже ловили в этой поездке, потом каталог.
    const quick = _uniqByCount(catches, c => c.fish).concat(allFish.filter(f => f !== 'Другое'))
      .filter((f, i, a) => a.indexOf(f) === i).slice(0, QUICK_FISH);

    const myName = (trip?.participants || []).find(p => p.uid && p.uid === window.APP?.user?.uid)?.name || '';

    // Черновик формы: всё, что выбирается чипами/панелями. Текстовые поля
    // читаются из DOM при сохранении.
    const f = editing ? {
      fish: editing.fish, count: editing.count, kept: editing.kept, member: editing.member,
      river: editing.river, lat: editing.lat, lon: editing.lon,
      tackle: editing.tackle ? Object.assign({}, editing.tackle) : null,
      waterClarity: editing.waterClarity,
    } : {
      fish: quick[0] || allFish[0] || 'Другое', count: 1, kept: true,
      member: members.includes(myName) ? myName : '',
      river: '', lat: null, lon: null, tackle: null, waterClarity: '',
    };
    if (!quick.includes(f.fish)) quick.push(f.fish);
    let fishMore   = false;
    let memberManual = !!f.member && !members.includes(f.member);
    let tackleGroup = TACKLE_TYPE_GROUPS.find(g => g.items.includes(f.tackle?.type))?.label || TACKLE_TYPE_GROUPS[0].label;

    const e0 = editing || {};
    const hasDetails = editing && (e0.weight != null || e0.time || e0.river || e0.lat != null
      || e0.tackle || e0.waterTemp != null || e0.waterClarity || e0.comment);
    let detailsOpen = !!hasDetails;
    const canDel = editing && _canDelete(editing);

    const ov = document.createElement('div');
    ov.className = 'ct-sheet-ov';
    ov.id = 'ct-sheet-ov';
    ov.innerHTML = `
      <section class="ct-sheet" role="dialog" aria-label="Улов">
        <div class="ct-sheet__handle"></div>

        <div class="ct-sheet__pane" data-pane="main">
          <div class="ct-sheet__head">
            <h2 class="ct-sheet__title">${editing ? 'Поимка' : 'Улов'}</h2>
            <button type="button" class="ct-sheet__close" data-act="close" aria-label="Закрыть">${UIUtils.ico('x')}</button>
          </div>
          <div class="ct-sheet__body">
            <div class="ct-field"><span class="ct-field__lbl">Что поймали</span><div id="cs-fish"></div></div>
            <div class="ct-field"><span class="ct-field__lbl">Сколько</span>
              <div class="ct-counter">
                <button type="button" class="ct-counter__btn" data-act="cnt-minus" aria-label="Меньше">−</button>
                <span class="ct-counter__val" id="cs-cnt">${f.count}</span>
                <button type="button" class="ct-counter__btn" data-act="cnt-plus" aria-label="Больше">+</button>
              </div>
            </div>
            <div class="ct-field"><span class="ct-field__lbl">Статус</span><div class="ct-seg ct-seg--2" id="cs-kept"></div></div>
            <div class="ct-field"><span class="ct-field__lbl">Кто поймал</span>
              <div id="cs-member"></div>
              <input class="ct-input" id="cs-member-manual" type="text" placeholder="Имя" autocomplete="off"
                     value="${memberManual ? _esc(f.member) : ''}" ${memberManual ? '' : 'hidden'}>
            </div>

            <button type="button" class="ct-more" data-act="toggle-more" aria-expanded="${detailsOpen}">
              <span class="ct-more__text"><span class="ct-more__lbl">Подробнее</span><span class="ct-more__hint">вес · время · место · снасть · вода · комментарий</span></span>
              <span class="ct-more__chev">${UIUtils.ico('chevron-down')}</span>
            </button>
            <div class="ct-details" id="cs-details" ${detailsOpen ? '' : 'hidden'}>
              <div class="ct-two">
                <div class="ct-field"><span class="ct-field__lbl">Вес, кг</span>
                  <input class="ct-input" id="cs-weight" type="text" inputmode="decimal" placeholder="—" value="${e0.weight != null ? _fmtKg(e0.weight) : ''}"></div>
                <div class="ct-field"><span class="ct-field__lbl">Время</span>
                  <input class="ct-input" id="cs-time" type="time" value="${_esc(editing ? e0.time : new Date().toTimeString().slice(0, 5))}"></div>
              </div>
              ${editing ? `<div class="ct-field"><span class="ct-field__lbl">Дата</span>
                  <input class="ct-input" id="cs-date" type="date" value="${_esc(e0.date || '')}"></div>` : ''}
              <div class="ct-group">
                <button type="button" class="ct-vrow" data-act="open-place"><span class="ct-vrow__lbl">Место</span><span class="ct-vrow__val"><span id="cs-place-val"></span>${UIUtils.ico('chevron-right')}</span></button>
                <button type="button" class="ct-vrow" data-act="open-tackle"><span class="ct-vrow__lbl">Снасть</span><span class="ct-vrow__val"><span id="cs-tackle-val"></span>${UIUtils.ico('chevron-right')}</span></button>
                <label class="ct-vrow"><span class="ct-vrow__lbl">Вода, °C</span>
                  <input class="ct-vrow__input" id="cs-watertemp" type="text" inputmode="decimal" placeholder="—" value="${e0.waterTemp != null ? _esc(String(e0.waterTemp).replace('.', ',')) : ''}"></label>
              </div>
              <div class="ct-field"><span class="ct-field__lbl">Прозрачность</span><div class="ct-seg ct-seg--3" id="cs-clarity"></div></div>
              <div class="ct-field"><span class="ct-field__lbl">Комментарий</span>
                <textarea class="ct-input ct-textarea" id="cs-comment" placeholder="Заметка о поимке…">${_esc(e0.comment || '')}</textarea></div>
            </div>
          </div>
          <div class="ct-sheet__foot">
            <button type="button" class="ct-primary" data-act="save">${editing ? 'Сохранить' : 'Записать улов'}</button>
            ${canDel ? `<button type="button" class="ct-danger-link" data-act="delete">Удалить поимку</button>` : ''}
          </div>
        </div>

        <div class="ct-sheet__pane" data-pane="place" hidden>
          <div class="ct-sheet__head ct-sheet__head--sub">
            <button type="button" class="ct-icon-btn" data-act="back" aria-label="Назад к улову">${UIUtils.ico('chevron-left')}</button>
            <h2 class="ct-sheet__title">Место</h2>
          </div>
          <div class="ct-sheet__body">
            <div class="ct-field"><span class="ct-field__lbl">Река/водоём</span>
              <div id="cs-rivers"></div>
              <input class="ct-input" id="cs-river-manual" type="text" placeholder="Название места" autocomplete="off" hidden>
            </div>
            <div class="ct-field"><span class="ct-field__lbl">Точка на воде</span>
              <button type="button" class="ct-secondary" id="cs-geo-btn" data-act="geo"></button>
              <button type="button" class="ct-geo-status" id="cs-geo-status" data-act="geo-clear" hidden></button>
            </div>
          </div>
          <div class="ct-sheet__foot"><button type="button" class="ct-primary" data-act="back">Готово</button></div>
        </div>

        <div class="ct-sheet__pane" data-pane="tackle" hidden>
          <div class="ct-sheet__head ct-sheet__head--sub">
            <button type="button" class="ct-icon-btn" data-act="back" aria-label="Назад к улову">${UIUtils.ico('chevron-left')}</button>
            <h2 class="ct-sheet__title">Снасть</h2>
          </div>
          <div class="ct-sheet__body">
            <div class="ct-field"><span class="ct-field__lbl">Тип приманки</span>
              <div class="ct-subpills" id="cs-tk-groups"></div>
              <div id="cs-tk-type"></div>
            </div>
            <div class="ct-field"><span class="ct-field__lbl">Тип огрузки</span><div id="cs-tk-wtype"></div></div>
            <div class="ct-two">
              <div class="ct-field"><span class="ct-field__lbl">Бренд</span><input class="ct-input" id="cs-tk-brand" type="text" placeholder="—" autocomplete="off" value="${_esc(f.tackle?.brand || '')}"></div>
              <div class="ct-field"><span class="ct-field__lbl">Размер / модель</span><input class="ct-input" id="cs-tk-size" type="text" placeholder="7 см" autocomplete="off" value="${_esc(f.tackle?.size || '')}"></div>
            </div>
            <div class="ct-two">
              <div class="ct-field"><span class="ct-field__lbl">Цвет</span><input class="ct-input" id="cs-tk-color" type="text" placeholder="—" autocomplete="off" value="${_esc(f.tackle?.color || '')}"></div>
              <div class="ct-field"><span class="ct-field__lbl">Вес, г</span><input class="ct-input" id="cs-tk-weight" type="text" inputmode="decimal" placeholder="—" value="${f.tackle?.weight != null ? _esc(String(f.tackle.weight).replace('.', ',')) : ''}"></div>
            </div>
          </div>
          <div class="ct-sheet__foot"><button type="button" class="ct-primary" data-act="back">Готово</button></div>
        </div>
      </section>`;
    document.body.appendChild(ov);
    requestAnimationFrame(() => ov.classList.add('open'));

    const $ = sel => ov.querySelector(sel);
    const chip = (label, on, attrs, extra) =>
      `<button type="button" class="ct-chip ${on ? 'is-on' : ''} ${extra || ''}" aria-pressed="${!!on}" ${attrs}>${label}</button>`;

    // ── перерисовка кусочков листа ──
    function drawFish() {
      let html;
      if (!fishMore) {
        html = quick.map(x => chip(_esc(x), f.fish === x, `data-act="fish" data-v="${_esc(x)}"`)).join('')
          + chip('Другой вид…', false, 'data-act="fish-more"', 'ct-chip--dashed');
        html = `<div class="ct-chips">${html}</div>`;
      } else {
        html = catalog.map(g => `
          <div class="ct-chips-group"><span class="ct-chips-group__lbl">${_esc(g.label)}</span>
            <div class="ct-chips">${g.items.map(x => chip(_esc(x), f.fish === x, `data-act="fish" data-v="${_esc(x)}"`)).join('')}</div>
          </div>`).join('');
        // Вид не из каталога (например, записан ботом) — всё равно показываем.
        if (!allFish.includes(f.fish)) html = `<div class="ct-chips">${chip(_esc(f.fish), true, `data-act="fish" data-v="${_esc(f.fish)}"`)}</div>` + html;
      }
      $('#cs-fish').innerHTML = html;
    }
    function drawKept() {
      $('#cs-kept').innerHTML = [['1', 'Взяли'], ['0', 'Отпустили']].map(([v, l]) => {
        const on = (v === '1') === f.kept;
        return `<button type="button" class="ct-seg__btn ${on ? 'is-on' : ''}" aria-pressed="${on}" data-act="kept" data-v="${v}">${l}</button>`;
      }).join('');
    }
    function drawMember() {
      $('#cs-member').innerHTML = `<div class="ct-chips">`
        + members.map(m => chip(_esc(m), !memberManual && f.member === m, `data-act="member" data-v="${_esc(m)}"`)).join('')
        + chip('Вписать…', memberManual, 'data-act="member-manual"', 'ct-chip--dashed')
        + `</div>`;
      $('#cs-member-manual').hidden = !memberManual;
    }
    function drawClarity() {
      $('#cs-clarity').innerHTML = CLARITY.map(c => {
        const on = f.waterClarity === c.id;
        return `<button type="button" class="ct-seg__btn ${on ? 'is-on' : ''}" aria-pressed="${on}" data-act="clarity" data-v="${c.id}">${c.label}</button>`;
      }).join('');
    }
    function drawSummaries() {
      const place = [f.river, f.lat != null ? 'точка' : ''].filter(Boolean).join(' · ');
      $('#cs-place-val').textContent  = place || 'не указано';
      $('#cs-tackle-val').textContent = _tackleSummary(_tackleClean(f.tackle)) || 'не указана';
    }
    function drawRivers() {
      const rivers = CatchesState.getRivers(_tripId);
      const manual = !!f.river && !rivers.includes(f.river);
      $('#cs-rivers').innerHTML = `<div class="ct-chips">`
        + chip('Не указано', !f.river && !$('#cs-river-manual').dataset.on, 'data-act="river" data-v=""')
        + rivers.map(r => chip(_esc(r), f.river === r, `data-act="river" data-v="${_esc(r)}"`)).join('')
        + chip('Вписать…', manual || !!$('#cs-river-manual').dataset.on, 'data-act="river-manual"', 'ct-chip--dashed')
        + `</div>`;
      const inp = $('#cs-river-manual');
      if (manual) { inp.value = f.river; inp.dataset.on = '1'; }
      inp.hidden = !inp.dataset.on;
    }
    function drawGeo() {
      $('#cs-geo-btn').innerHTML = UIUtils.ico('map-pin') + (f.lat != null ? ' Точка привязана' : ' Привязать по GPS');
      const st = $('#cs-geo-status');
      st.hidden = f.lat == null;
      st.textContent = f.lat != null ? `${f.lat.toFixed(5)}, ${f.lon.toFixed(5)} · сбросить` : '';
    }
    function drawTackle() {
      const t = f.tackle || {};
      $('#cs-tk-groups').innerHTML = TACKLE_TYPE_GROUPS.map(g =>
        `<button type="button" class="ct-subpill ${g.label === tackleGroup ? 'is-on' : ''}" aria-pressed="${g.label === tackleGroup}" data-act="tk-group" data-v="${_esc(g.label)}">${_esc(g.label)}</button>`).join('');
      const items = TACKLE_TYPE_GROUPS.find(g => g.label === tackleGroup)?.items || [];
      $('#cs-tk-type').innerHTML = `<div class="ct-chips">${items.map(x => chip(_esc(x), t.type === x, `data-act="tk-type" data-v="${_esc(x)}"`)).join('')}</div>`;
      $('#cs-tk-wtype').innerHTML = `<div class="ct-chips">${WEIGHT_TYPES.map(x => chip(_esc(x), t.weightType === x, `data-act="tk-wtype" data-v="${_esc(x)}"`)).join('')}</div>`;
    }
    // Текстовые поля снасти → черновик (при уходе с панели «Снасть»).
    function readTackleInputs() {
      const t = Object.assign({}, f.tackle || {});
      t.brand  = $('#cs-tk-brand').value.trim();
      t.size   = $('#cs-tk-size').value.trim();
      t.color  = $('#cs-tk-color').value.trim();
      t.weight = _num($('#cs-tk-weight').value);
      f.tackle = t;
    }
    function readRiverManual() {
      const inp = $('#cs-river-manual');
      if (inp.dataset.on) f.river = inp.value.trim();
    }
    function showPane(name) {
      ov.querySelectorAll('.ct-sheet__pane').forEach(p => {
        p.hidden = p.dataset.pane !== name;
        if (!p.hidden) p.querySelector('.ct-sheet__body').scrollTop = 0;
      });
    }
    function close() {
      ov.classList.remove('open');
      setTimeout(() => ov.remove(), 200);
    }

    drawFish(); drawKept(); drawMember(); drawClarity(); drawSummaries(); drawRivers(); drawGeo(); drawTackle();

    ov.addEventListener('click', e => {
      if (e.target === ov) { close(); return; }
      const b = e.target.closest('[data-act]');
      if (!b) return;
      const act = b.dataset.act, v = b.dataset.v;

      if (act === 'close') { close(); return; }
      if (act === 'fish')      { f.fish = v; drawFish(); return; }
      if (act === 'fish-more') { fishMore = true; drawFish(); return; }
      if (act === 'cnt-minus') { if (f.count > 1) f.count--; $('#cs-cnt').textContent = f.count; return; }
      if (act === 'cnt-plus')  { f.count++; $('#cs-cnt').textContent = f.count; return; }
      if (act === 'kept')      { f.kept = v === '1'; drawKept(); return; }
      // Участник необязателен — повторный тап снимает выбор.
      if (act === 'member') { memberManual = false; f.member = f.member === v ? '' : v; drawMember(); return; }
      if (act === 'member-manual') {
        memberManual = true; drawMember(); $('#cs-member-manual').focus(); return;
      }
      if (act === 'toggle-more') {
        detailsOpen = !detailsOpen;
        $('#cs-details').hidden = !detailsOpen;
        b.setAttribute('aria-expanded', detailsOpen);
        return;
      }
      if (act === 'clarity') { f.waterClarity = f.waterClarity === v ? '' : v; drawClarity(); return; }
      if (act === 'open-place')  { showPane('place'); return; }
      if (act === 'open-tackle') { showPane('tackle'); return; }
      if (act === 'back') {
        readRiverManual(); readTackleInputs(); drawSummaries(); showPane('main'); return;
      }

      // ── панель «Место» ──
      if (act === 'river') {
        const inp = $('#cs-river-manual'); delete inp.dataset.on; inp.value = '';
        f.river = v; drawRivers(); return;
      }
      if (act === 'river-manual') {
        const inp = $('#cs-river-manual'); inp.dataset.on = '1';
        if (CatchesState.getRivers(_tripId).includes(f.river)) f.river = '';
        drawRivers(); inp.focus(); return;
      }
      if (act === 'geo') {
        if (!navigator.geolocation) { alert('Геолокация не поддерживается этим браузером'); return; }
        b.disabled = true;
        b.textContent = 'Определяю…';
        navigator.geolocation.getCurrentPosition(
          pos => { f.lat = pos.coords.latitude; f.lon = pos.coords.longitude; b.disabled = false; drawGeo(); },
          err => {
            b.disabled = false; drawGeo();
            alert('Не удалось определить местоположение: ' + (err.message || 'проверь разрешение геолокации'));
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
        return;
      }
      if (act === 'geo-clear') { f.lat = null; f.lon = null; drawGeo(); return; }

      // ── панель «Снасть» ── (повторный тап снимает выбор)
      if (act === 'tk-group') { tackleGroup = v; drawTackle(); return; }
      if (act === 'tk-type')  { f.tackle = Object.assign({}, f.tackle, { type: f.tackle?.type === v ? '' : v }); drawTackle(); return; }
      if (act === 'tk-wtype') { f.tackle = Object.assign({}, f.tackle, { weightType: f.tackle?.weightType === v ? '' : v }); drawTackle(); return; }

      if (act === 'delete') {
        UIUtils.confirmSheet('Удалить эту поимку?').then(ok => {
          if (!ok) return;
          CatchesState.removeCatch(_tripId, editing._id);
          CatchesFirebase.deleteCatch(_tripId, editing._id);
          close();
          refresh();
        });
        return;
      }

      if (act === 'save') {
        UIUtils.withBusyButton(b, () => {
          readRiverManual(); readTackleInputs();
          let member = f.member;
          if (memberManual) member = $('#cs-member-manual').value.trim();
          if (!f.fish) return;

          const fields = {
            fish: f.fish, count: f.count, kept: f.kept,
            member, river: f.river, comment: $('#cs-comment').value.trim(),
            weight: _num($('#cs-weight').value),
            lat: f.lat ?? null, lon: f.lon ?? null,
            waterTemp: _num($('#cs-watertemp').value),
            waterClarity: f.waterClarity || '',
            tackle: _tackleClean(f.tackle),
            time: $('#cs-time').value || '',
          };

          if (editing) {
            fields.date = $('#cs-date')?.value || editing.date;
            CatchesState.updateCatch(_tripId, editing._id, fields);
            CatchesFirebase.updateCatch(_tripId, editing._id, fields);
          } else {
            const entry = CatchesData.normalizeCatch(Object.assign(fields, {
              date: new Date().toISOString().split('T')[0],
              createdBy: window.APP?.user?.uid || null,
            }), 'tmp_' + Date.now());
            CatchesState.addCatch(_tripId, entry);
            CatchesFirebase.addCatch(_tripId, entry);
          }
          close();
          refresh();
        });
      }
    });
  }

  // ── Events ───────────────────────────────────────────────────

  function _bind() {
    const wrap = _el.querySelector('.ct-wrap');
    const body = _el.querySelector('#ct-body');

    _el.querySelector('#ct-back')?.addEventListener('click', () => {
      CatchesFirebase.stopListening();
      if (typeof CatchesIndex !== 'undefined') CatchesIndex.close();
    });

    // Свайп влево по строке «Всех поимок» → «Удалить». Контейнер #ct-body
    // живёт весь рендер, строки внутри перерисовываются — это нормально.
    UIUtils.swipeToDelete(body, '.ct-row', '.ct-row-del');

    wrap.addEventListener('click', e => {
      const btn = e.target.closest('[data-action]');
      if (!btn) return;
      const action = btn.dataset.action;

      if (action === 'add-catch') { openAdd(); return; }
      if (action === 'open-list') { _view = 'list'; body.innerHTML = _body(); return; }
      if (action === 'close-list') { _view = 'summary'; _resetFilters(); body.innerHTML = _body(); return; }
      if (action === 'edit-catch') { _showCatchSheet(btn.dataset.id); return; }

      if (action === 'toggle-search') {
        _searchOpen = !_searchOpen;
        btn.classList.toggle('is-on', _searchOpen);
        const inp = body.querySelector('#ct-search');
        if (inp) {
          inp.hidden = !_searchOpen;
          if (_searchOpen) inp.focus();
          else if (_search) { _search = ''; inp.value = ''; _refreshList(); }
        }
        return;
      }
      if (action === 'filter-all')     { _fPeople.clear(); _fSpecies.clear(); _refreshList(); return; }
      if (action === 'filter-person')  { _toggle(_fPeople, btn.dataset.v);  _refreshList(); return; }
      if (action === 'filter-species') { _toggle(_fSpecies, btn.dataset.v); _refreshList(); return; }

      if (action === 'del-catch') {
        const id = btn.dataset.id;
        CatchesState.removeCatch(_tripId, id);
        CatchesFirebase.deleteCatch(_tripId, id);
        refresh();
        return;
      }

      if (action === 'goto-river') {
        // Переходим в раздел Места и открываем карточку конкретной реки.
        // Если Улов сейчас встроен в таб-стрип Гида (см. modules/tripcover/
        // index.js:_mountGuideTab), переключаем таб на месте; отдельный
        // заход в Улов через гамбургер (вне Гида) — старым способом:
        // switchGuideTab вернёт false, раз таб-стрип не смонтирован.
        const riverName = btn.dataset.river;
        CatchesFirebase.stopListening();
        const switchedInPlace = typeof TripCoverIndex !== 'undefined' && TripCoverIndex.switchGuideTab(_tripId, 'rivers');
        if (!switchedInPlace && typeof onNavigate === 'function') {
          onNavigate('rivers');
        }
        // Небольшая задержка чтобы rivers успел инициализироваться
        setTimeout(function() {
          if (typeof RiversIndex !== 'undefined' && typeof RiversIndex.openRiver === 'function') {
            RiversIndex.openRiver(riverName);
          }
        }, 150);
        return;
      }
    });

    body.addEventListener('input', e => {
      if (e.target.id !== 'ct-search') return;
      _search = e.target.value;
      const res = body.querySelector('#ct-list-results');
      if (res) res.innerHTML = _listResults();
    });
  }

  // ── Helpers ──────────────────────────────────────────────────

  function _trip() {
    return typeof TripsData !== 'undefined' ? TripsData.getById(_tripId) : null;
  }

  function _toggle(set, v) {
    if (set.has(v)) set.delete(v); else set.add(v);
  }

  // Уникальные значения поля, отсортированные по числу рыб (пустые — мимо).
  function _uniqByCount(catches, get) {
    const by = {};
    catches.forEach(c => { const k = get(c); if (k) by[k] = (by[k] || 0) + c.count; });
    return Object.keys(by).sort((a, b) => by[b] - by[a]);
  }

  // Группировка по дате, новые дни сверху; внутри дня — по времени
  // (без времени — в конце дня), затем по createdAt.
  function _byDay(catches) {
    const map = {};
    catches.forEach(c => {
      const d = map[c.date] || (map[c.date] = { date: c.date, total: 0, items: [] });
      d.total += c.count;
      d.items.push(c);
    });
    const days = Object.values(map).sort((a, b) => (b.date || '').localeCompare(a.date || ''));
    days.forEach(d => d.items.sort((a, b) => {
      if (!!a.time !== !!b.time) return a.time ? -1 : 1;
      return (b.time || '').localeCompare(a.time || '') || (b.createdAt || '').localeCompare(a.createdAt || '');
    }));
    return days;
  }

  function _tackleClean(t) {
    if (!t) return null;
    const out = {
      type: t.type || '', brand: t.brand || '', size: t.size || '', color: t.color || '',
      weight: t.weight != null && !Number.isNaN(t.weight) ? t.weight : null,
      weightType: t.weightType || '',
    };
    return Object.values(out).some(v => v !== '' && v != null) ? out : null;
  }

  function _tackleSummary(t) {
    if (!t) return '';
    const parts = [t.type, t.brand, t.size, t.color].filter(Boolean);
    if (t.weight != null) parts.push(`${t.weight}г`);
    if (t.weightType) parts.push(t.weightType);
    return parts.join(' · ');
  }

  // «5,5» и «5.5» — оба числа; пусто/мусор → null.
  function _num(v) {
    const s = String(v ?? '').trim().replace(',', '.');
    if (!s) return null;
    const n = parseFloat(s);
    return Number.isNaN(n) ? null : n;
  }

  function _fmtKg(w) {
    return String(Math.round(w * 100) / 100).replace('.', ',');
  }

  function _plural(n, forms) {
    const a = Math.abs(n) % 100, b = a % 10;
    if (a > 10 && a < 20) return forms[2];
    if (b === 1) return forms[0];
    if (b >= 2 && b <= 4) return forms[1];
    return forms[2];
  }

  function _fishEmoji(fish) {
    const map = {
      'Краб': '🦀', 'Морской ёж': '🦔', 'Трепанг': '🪸',
      'Гребешок': '🐚', 'Мидия': '🐚', 'Трубач': '🐚',
    };
    return map[fish] || '🐟';
  }

  function _date(str) {
    return str ? new Date(str + 'T00:00:00') : null;
  }

  // «16 сентября»
  function _fmtDateLong(str) {
    const d = _date(str);
    return d ? d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' }) : '';
  }

  // «18 сентября, пт»
  function _fmtDayHead(str) {
    const d = _date(str);
    if (!d) return 'Без даты';
    return _fmtDateLong(str) + ', ' + d.toLocaleDateString('ru-RU', { weekday: 'short' });
  }

  function _dayOfMonth(str) {
    const d = _date(str);
    return d ? d.getDate() : '—';
  }

  function _esc(s) {
    return String(s || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, refresh, openAdd };
})();

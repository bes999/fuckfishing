'use strict';

// Страница «Поездки» (вкладка нижнего меню «Планы») — макет v2 «V2Trips»:
// заголовок + «Новая», карточка «Сезон», сегмент-фильтр по типу, блок
// «Скоро» (предстоящие и идущие), дальше — по годам. Текущий (самый
// свежий) год раскрыт, прошлые — свёрнутыми карточками-строками, которые
// раскрываются тапом. Экспедиции — подробными карточками (оранжевые),
// рыбалки — строками в одной карточке (голубые). Прошедшее приглушено.
const TripsRender = (() => {

  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  // Короткие — для строки карточки: год и так в заголовке группы.
  const MONTHS_SHORT = ['янв','фев','мар','апр','мая','июн','июл','авг','сен','окт','ноя','дек'];

  let _filter = 'all'; // all | expedition | fishing
  // Раскрыт ли год: {год: true|false}. Нет ключа — по умолчанию раскрыт
  // только самый свежий год. Живёт между перерисовками (смена фильтра не
  // схлопывает то, что человек сам раскрыл).
  const _yearOpen = {};
  let _clickHandler = null;

  function render(el) {
    const now   = new Date().getFullYear();
    const uid   = window.APP?.user?.uid;
    const stats = TripsData.getYearStats(String(now), uid);
    const byYear = TripsData.getByYear(uid);

    el.innerHTML = `
      <div class="page-scroll">
        ${_topbar()}
        <div class="tp-wrap">
          ${_season(now, stats)}
          ${_filters()}
          ${_feed(byYear)}
        </div>
      </div>`;

    _bind(el);
  }

  function _topbar() {
    return `
      <div class="tp-top">
        <h1 class="tp-title">Планы</h1>
        <button type="button" class="tp-new" data-action="create">${UIUtils.ico('plus')}Новая</button>
      </div>`;
  }

  // Сезон: только завершённые поездки текущего года (как и раньше —
  // getYearStats считает status === 'done').
  function _season(year, s) {
    return `
      <section class="tp-season">
        <span class="tp-caps">Сезон ${year}</span>
        <div class="tp-season-grid">
          ${_stat(s.trips,   _plural(s.trips, 'поездка', 'поездки', 'поездок') + ' позади')}
          ${_stat(s.fish,    _plural(s.fish, 'рыба', 'рыбы', 'рыб'))}
          ${_stat(s.species, _plural(s.species, 'вид', 'вида', 'видов') + ' рыбы')}
        </div>
      </section>`;
  }

  function _stat(v, l) {
    return `<div class="tp-stat"><span class="tp-stat-num">${v}</span><span class="tp-stat-label">${l}</span></div>`;
  }

  function _filters() {
    const f = [
      { id: 'all',        label: 'Все'        },
      { id: 'expedition', label: 'Экспедиции' },
      { id: 'fishing',    label: 'Рыбалки'    },
    ];
    return `
      <div class="tp-seg" role="tablist">
        ${f.map(fi => `<button type="button" role="tab" aria-selected="${fi.id === _filter}"
          class="tp-seg-btn ${fi.id === _filter ? 'on' : ''}" data-filter="${fi.id}">${fi.label}</button>`).join('')}
      </div>`;
  }

  function _feed(byYear) {
    const all = Object.values(byYear).flat()
      .filter(t => _filter === 'all' || t.type === _filter);
    if (!all.length) {
      return `<div class="tp-empty">${_filter === 'all'
        ? 'Поездок пока нет. Создай первую — кнопка «Новая» наверху.'
        : 'Таких поездок пока нет.'}</div>`;
    }

    // «Скоро» — предстоящие и идущие, ближайшая первой. В годах ниже их
    // уже нет, чтобы одна поездка не показывалась дважды.
    const soon = all.filter(t => t.status === 'upcoming' || t.status === 'active')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const rest = all.filter(t => !soon.includes(t));

    const groups = {};
    rest.forEach(t => {
      const y = (t.startDate || '').slice(0, 4) || '—';
      (groups[y] = groups[y] || []).push(t);
    });
    const years = Object.keys(groups).sort((a, b) => b - a);

    let h = '';
    if (soon.length) {
      h += `<div class="tp-sub">Скоро</div>${soon.map(_tripCard).join('')}`;
    }
    years.forEach((year, idx) => {
      const open = year in _yearOpen ? _yearOpen[year] : idx === 0;
      h += open ? _yearOpenHtml(year, groups[year]) : _yearClosedHtml(year, groups[year]);
    });
    return h;
  }

  function _sortDesc(trips) {
    return trips.slice().sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
  }

  function _countLabel(n) {
    return `${n} ${_plural(n, 'поездка', 'поездки', 'поездок')}`;
  }

  // Раскрытый год: строка-заголовок (тап — свернуть), потом экспедиции
  // карточками и рыбалки строками в общей карточке.
  function _yearOpenHtml(year, trips) {
    const sorted    = _sortDesc(trips);
    const expTrips  = sorted.filter(t => t.type === 'expedition');
    const fishTrips = sorted.filter(t => t.type !== 'expedition');
    return `
      <div class="tp-year">
        <button type="button" class="tp-year-hd" data-year="${_esc(year)}" aria-expanded="true">
          <span class="tp-year-num">${_esc(year)}</span>
          <span class="tp-year-count">${_countLabel(trips.length)}${UIUtils.ico('chevron-up')}</span>
        </button>
        ${expTrips.length ? `
          <div class="tp-sub">Экспедиции ${_esc(year)}</div>
          <div class="tp-exp-list">${expTrips.map(_tripCard).join('')}</div>` : ''}
        ${fishTrips.length ? `
          <div class="tp-sub">Рыбалки ${_esc(year)}</div>
          <div class="tp-fish-list">${fishTrips.map(_fishRow).join('')}</div>` : ''}
      </div>`;
  }

  // Свёрнутый год — карточка-строка: год, несколько названий, счётчик.
  function _yearClosedHtml(year, trips) {
    const names = _sortDesc(trips).slice(0, 3).map(t => t.name).join(' · ');
    return `
      <button type="button" class="tp-year-card" data-year="${_esc(year)}" aria-expanded="false">
        <span class="tp-year-card-body">
          <span class="tp-year-num">${_esc(year)}</span>
          <span class="tp-year-names">${_esc(names)}</span>
        </span>
        <span class="tp-year-count">${_countLabel(trips.length)}${UIUtils.ico('chevron-down')}</span>
      </button>`;
  }

  // Карточка поездки (экспедиции везде + любая поездка в «Скоро»):
  // плитка-иконка цвета типа, название, «даты · N участников», справа
  // статус. Улов по видам и оценка — нижней строкой, только если есть.
  function _tripCard(t) {
    const isExp = t.type === 'expedition';
    const dates = _shortRange(t.startDate, t.endDate);
    const n = t.participants ? TripsData.participantNames(t).length : 0;
    const meta = n ? `${dates} · ${n} ${_plural(n, 'участник', 'участника', 'участников')}` : dates;
    // trip.fish не пишется с переезда уловов в Firestore-подколлекцию —
    // реальная разбивка по видам берётся из глобального кэша уловов.
    const fishList = typeof CatchesState !== 'undefined' ? CatchesState.speciesForTrip(t.id).list : [];
    const hasExtra = fishList.length || t.rating;

    return `
      <div class="tp-card type-${isExp ? 'expedition' : 'fishing'} status-${t.status}" data-trip-id="${_esc(t.id)}" role="button" tabindex="0">
        <div class="tp-card-main">
          <span class="tp-tile ${isExp ? 'exp' : 'fish'}">${UIUtils.ico(TripsData.tripIcon(t))}</span>
          <span class="tp-card-body">
            <span class="tp-card-name">${_esc(t.name)}</span>
            <span class="tp-card-meta">${meta}</span>
          </span>
          ${_statusMark(t)}
        </div>
        ${hasExtra ? `<div class="tp-card-foot">
          <div class="tp-tags">
            ${fishList.map(f => `<span class="tp-tag">${_esc(f.species)} <b>${f.count}</b></span>`).join('')}
          </div>
          ${t.rating ? _rating(t.rating) : ''}
        </div>` : ''}
      </div>`;
  }

  // Справа в строке: «через N дн.» / «идёт» / галочка «завершена».
  function _statusMark(t) {
    if (t.status === 'done') {
      return `<span class="tp-done" role="img" aria-label="Завершена">${UIUtils.ico('check')}</span>`;
    }
    if (t.status === 'active') return '<span class="tp-soon tp-soon--now">идёт</span>';
    const daysLeft = Math.ceil((new Date(t.startDate) - new Date()) / 86400000);
    return daysLeft > 0 ? `<span class="tp-soon">через ${daysLeft} дн.</span>` : '';
  }

  function _rating(r) {
    return `<span class="tp-rating">${_esc(r)}<span>/10</span></span>`;
  }

  // Рыбалка — строка в общей карточке: дата и улов по видам одной строкой.
  function _fishRow(t) {
    const fishList = typeof CatchesState !== 'undefined' ? CatchesState.speciesForTrip(t.id).list : [];
    const sub = [_shortRange(t.startDate, t.endDate), ...fishList.map(f => `${f.species.toLowerCase()} ${f.count}`)]
      .filter(Boolean).join(' · ');
    return `
      <div class="tp-fish-row status-${t.status}" data-trip-id="${_esc(t.id)}" role="button" tabindex="0">
        <span class="tp-tile fish">${UIUtils.ico(TripsData.tripIcon(t))}</span>
        <span class="tp-card-body">
          <span class="tp-fish-name">${_esc(t.name)}</span>
          <span class="tp-fish-sub">${_esc(sub)}</span>
        </span>
        ${t.rating ? _rating(t.rating) : (t.status === 'upcoming' ? _statusMark(t) : '')}
      </div>`;
  }

  function _shortRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end || start);
    if (!end || start === end) return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]}`;
    if (s.getMonth() === e.getMonth()) return `${s.getDate()}–${e.getDate()} ${MONTHS_SHORT[s.getMonth()]}`;
    return `${s.getDate()} ${MONTHS_SHORT[s.getMonth()]} – ${e.getDate()} ${MONTHS_SHORT[e.getMonth()]}`;
  }

  function _plural(n, f1, f2, f5) {
    const m = n % 100;
    if (m >= 11 && m <= 19) return f5;
    const d = n % 10;
    if (d === 1) return f1;
    if (d >= 2 && d <= 4) return f2;
    return f5;
  }

  function _bind(el) {
    if (_clickHandler) el.removeEventListener('click', _clickHandler);
    _clickHandler = e => {
      // Фильтр по типу
      const chip = e.target.closest('[data-filter]');
      if (chip) {
        _filter = chip.dataset.filter;
        if (typeof TripsIndex !== 'undefined') TripsIndex.render();
        return;
      }

      // Новая поездка
      if (e.target.closest('[data-action="create"]')) {
        if (typeof TripsIndex !== 'undefined') TripsIndex.showCreate();
        return;
      }

      // Свернуть/раскрыть год
      const yr = e.target.closest('[data-year]');
      if (yr) {
        _yearOpen[yr.dataset.year] = yr.getAttribute('aria-expanded') !== 'true';
        if (typeof TripsIndex !== 'undefined') TripsIndex.render();
        return;
      }

      // Карточка поездки
      const card = e.target.closest('[data-trip-id]');
      if (card && typeof TripsIndex !== 'undefined') TripsIndex.openTrip(card.dataset.tripId);
    };
    el.addEventListener('click', _clickHandler);
  }

  // Полная дата словами — «12–19 сентября 2026» (для сводки мастера).
  function dateRangeLong(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end || start);
    if (!end || start === end) return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS_GEN[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS_GEN[s.getMonth()]} – ${e.getDate()} ${MONTHS_GEN[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _esc(s) {
    return String(s ?? '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
  }

  return { render, shortRange: _shortRange, dateRangeLong };
})();

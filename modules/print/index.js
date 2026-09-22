'use strict';
/* globals db, TripsData, MenuData, MenuState, MembersFirebase */

// Офлайн-печать поездки — для случаев, когда в поле нет связи, но нужно
// иметь под рукой маршрут, меню/дежурства и медданные участников на бумаге.
// Пользователь сам выбирает, что печатать (см. _showPicker) — не всегда
// нужно всё сразу, а собирать медданные всех участников (сетевые запросы)
// не хочется делать вхолостую, если человек хочет распечатать только меню.
const PrintIndex = (() => {

  const SECTIONS = [
    { id: 'route',   label: 'Маршрут / Инфо поездки' },
    { id: 'menu',    label: 'Меню и дежурства' },
    { id: 'medical', label: 'Контакты и аллергии участников' },
    { id: 'people',  label: 'Список участников' },
  ];

  const MONTHS = ['января','февраля','марта','апреля','мая','июня',
                   'июля','августа','сентября','октября','ноября','декабря'];

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _dateRange(start, end) {
    if (!start) return '';
    const s = new Date(start), e = new Date(end || start);
    if (start === end || !end) return `${s.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    if (s.getMonth() === e.getMonth() && s.getFullYear() === e.getFullYear())
      return `${s.getDate()}–${e.getDate()} ${MONTHS[s.getMonth()]} ${s.getFullYear()}`;
    return `${s.getDate()} ${MONTHS[s.getMonth()]} – ${e.getDate()} ${MONTHS[e.getMonth()]} ${e.getFullYear()}`;
  }

  function _age(birthday) {
    if (!birthday) return null;
    const parts = birthday.split('.');
    if (parts.length !== 3) return null;
    const bd = new Date(+parts[2], +parts[1] - 1, +parts[0]);
    const now = new Date();
    let a = now.getFullYear() - bd.getFullYear();
    if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) a--;
    return (a > 0 && a < 120) ? a : null;
  }

  // ─── Пикер: что печатать ────────────────────────────────────────────────

  function showPicker(trip) {
    document.getElementById('print-picker-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'print-picker-overlay';
    overlay.className = 'tqp-overlay';
    overlay.innerHTML = `
      <div class="tqp-sheet">
        <div class="tqp-handle"></div>
        <div class="tqp-title">Печать</div>
        <div class="pv-hint">Пригодится офлайн в поле, если пропадёт связь. Выбери, что распечатать.</div>
        <div class="pv-list">
          ${SECTIONS.map(s => `
            <div class="pv-row" data-pv-toggle="${s.id}">
              <div class="pv-check checked" data-pv-check="${s.id}"></div>
              <span class="pv-label">${_esc(s.label)}</span>
            </div>`).join('')}
        </div>
        <button class="pv-go-btn" data-action="print-go">Печать</button>
      </div>`;
    document.body.appendChild(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-pv-toggle]');
      if (row) {
        row.querySelector('[data-pv-check]').classList.toggle('checked');
        return;
      }
      if (e.target.closest('[data-action="print-go"]')) {
        const picked = SECTIONS
          .filter(s => overlay.querySelector(`[data-pv-check="${s.id}"]`)?.classList.contains('checked'))
          .map(s => s.id);
        overlay.remove();
        if (picked.length) _buildAndPrint(trip, picked);
      }
    });
  }

  // ─── Сборка печатной страницы ───────────────────────────────────────────

  async function _buildAndPrint(trip, sections) {
    const parts = [];
    const places = (trip.rivers || []).map(r => r.name).join(', ');
    parts.push(`
      <div class="pp-header">
        <h1>${_esc(trip.name)}</h1>
        <div class="pp-dates">${_esc(_dateRange(trip.startDate, trip.endDate))}${places ? ' · ' + _esc(places) : ''}</div>
      </div>`);

    if (sections.includes('people')) parts.push(_sectionPeople(trip));
    if (sections.includes('route'))  parts.push(_sectionRoute(trip));
    if (sections.includes('menu'))   parts.push(await _sectionMenu(trip));
    if (sections.includes('medical')) parts.push(await _sectionMedical(trip));

    document.getElementById('print-root')?.remove();
    const root = document.createElement('div');
    root.id = 'print-root';
    root.innerHTML = parts.join('');
    document.body.appendChild(root);

    // Печатаем следующим тиком — иначе на части устройств диалог печати
    // успевает открыться раньше, чем браузер отрисует свежедобавленный узел.
    setTimeout(() => window.print(), 60);
  }

  function _sectionPeople(trip) {
    const rows = (trip.participants || []).map(p =>
      `<div>${_esc(p.name)}${!p.uid ? ' — гость' : ''}</div>`
    ).join('');
    return `
      <div class="pp-section">
        <div class="pp-section-title">Участники</div>
        <div class="pp-people-list">${rows || '<div class="pp-empty">Список пуст</div>'}</div>
      </div>`;
  }

  function _sectionRoute(trip) {
    const route = trip.importData?.route || [];
    if (!route.length) {
      return `
        <div class="pp-section">
          <div class="pp-section-title">Маршрут</div>
          <div class="pp-empty">Маршрут по дням не добавлен</div>
        </div>`;
    }
    const days = route.map(day => `
      <div class="pp-day">
        <div class="pp-day-title">${_esc(day.t)}</div>
        ${(day.rows || []).map(row => `
          <div class="pp-row">
            <span class="pp-row-time">${_esc(row[0] || '')}</span>
            <span>${_esc(row[1] || '')}</span>
          </div>`).join('')}
      </div>`).join('');
    return `
      <div class="pp-section">
        <div class="pp-section-title">Маршрут по дням</div>
        ${days}
      </div>`;
  }

  async function _sectionMenu(trip) {
    let days = [];
    try {
      const snap = await db.collection('menu').doc(trip.id).get();
      const data = snap.exists ? snap.data() : {};
      if (data.days) {
        MenuState.setFromFirebase(trip.id, data.days, data.slotItems || {}, data.mealDuty || {}, {});
        days = MenuState.getDays(trip.id) || [];
      }
    } catch (_) { /* печатаем то, что есть — без меню, а не роняем всю печать */ }

    if (!days.length) {
      return `
        <div class="pp-section">
          <div class="pp-section-title">Меню и дежурства</div>
          <div class="pp-empty">Меню не составлено</div>
        </div>`;
    }
    const meals = MenuData.getMeals();
    const dayBlocks = days.map(day => {
      const mealBlocks = meals.map(m => {
        const meal = day.meals?.[m.id];
        if (!meal) return '';
        const items = (meal.slots || []).filter(s => s.item).map(s => _esc(s.item.name)).join(', ');
        const duty = [meal.cook ? 'повар: ' + _esc(meal.cook) : '', meal.cleanup ? 'уборка: ' + _esc(meal.cleanup) : '']
          .filter(Boolean).join(' · ');
        if (!items && !duty) return '';
        return `
          <div class="pp-meal">
            <span class="pp-meal-label">${_esc(m.label)}</span>
            ${items ? `<div class="pp-meal-items">${items}</div>` : ''}
            ${duty ? `<div class="pp-meal-duty">${duty}</div>` : ''}
          </div>`;
      }).join('');
      if (!mealBlocks.trim()) return '';
      return `<div class="pp-day"><div class="pp-day-title">${_esc(day.label)}</div>${mealBlocks}</div>`;
    }).join('');
    return `
      <div class="pp-section">
        <div class="pp-section-title">Меню и дежурства</div>
        ${dayBlocks || '<div class="pp-empty">Меню не составлено</div>'}
      </div>`;
  }

  async function _sectionMedical(trip) {
    const withUid = (trip.participants || []).filter(p => p.uid);
    const profiles = await Promise.all(
      withUid.map(p => MembersFirebase.getProfile(p.uid).then(profile => ({ name: p.name, profile })))
    );
    const cards = profiles.map(({ name, profile }) => {
      if (!profile) return '';
      const age = _age(profile.birthday);
      const fields = [
        profile.bloodType ? `<div class="pp-field"><b>Группа крови:</b> ${_esc(profile.bloodType)}</div>` : '',
        age ? `<div class="pp-field"><b>Возраст:</b> ${age}</div>` : '',
        profile.allergies ? `<div class="pp-field"><b>Аллергии:</b> ${_esc(profile.allergies)}</div>` : '',
        profile.conditions ? `<div class="pp-field"><b>Хронические:</b> ${_esc(profile.conditions)}</div>` : '',
        profile.meds ? `<div class="pp-field"><b>Постоянные лекарства:</b> ${_esc(profile.meds)}</div>` : '',
        profile.insurance ? `<div class="pp-field"><b>Полис:</b> ${_esc(profile.insurance)}</div>` : '',
      ].filter(Boolean).join('');
      const contacts = (profile.emergency || []).map(c =>
        `<div class="pp-field">${_esc(c.name)} — ${_esc(c.phone)}</div>`
      ).join('');
      if (!fields && !contacts) return '';
      return `
        <div class="pp-person">
          <div class="pp-person-name">${_esc(name)}</div>
          ${fields}
          ${contacts}
        </div>`;
    }).join('');
    return `
      <div class="pp-section">
        <div class="pp-section-title">Контакты и аллергии</div>
        ${cards.trim() ? cards : '<div class="pp-empty">Ни у кого не заполнены медданные</div>'}
      </div>`;
  }

  return { showPicker };
})();

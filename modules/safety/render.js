'use strict';

const SafetyRender = (() => {

  function render(el) {
    if (!el) return;
    el.innerHTML = _build();
    _bind(el);
  }

  function _build() {
    return `
      <div class="sf-wrap">
        ${_topbar()}
        <div class="sf-scroll">
          ${_bears()}
          ${_contacts()}
          ${_hospitals()}
          ${_fishing()}
          ${_tripContacts()}
          ${_license()}
        </div>
      </div>`;
  }

  // ── Топбар ──────────────────────────────────────────────────

  function _topbar() {
    return `
      <div class="sf-topbar">
        <button class="sf-back" id="sf-back" aria-label="Назад">
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor"
               stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div class="sf-topbar__text">
          <div class="sf-topbar__title">Безопасность</div>
          <div class="sf-topbar__sub">Сахалин 2026</div>
        </div>
      </div>`;
  }

  // ── Медведи ──────────────────────────────────────────────────

  function _bears() {
    return `
      <div class="sf-warn-banner">
        <div class="sf-warn-icon">🐻</div>
        <div>
          <div class="sf-warn-title">Медведи — встреча вероятна</div>
          <div class="sf-warn-text">На Сахалине в июне медведь голодный. У рек с рыбой особенно активен.</div>
        </div>
      </div>

      <div class="sf-sec-label">Снаряжение</div>
      <div class="sf-card">
        <div class="sf-row">
          <div class="sf-row-icon">🔴</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Фальшфейер — минимум 2-3 шт</div>
            <div class="sf-row-sub">Лучший отпугиватель. Всегда при себе у воды</div>
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-row-icon">🧴</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Медвежий спрей на пояс</div>
            <div class="sf-row-sub">Каждому участнику при выходе из лагеря</div>
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-row-icon">🔔</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Колокольчик на рюкзаке</div>
            <div class="sf-row-sub">При ходьбе по берегу — обязательно</div>
          </div>
        </div>
      </div>

      <div class="sf-sec-label">Правила лагеря</div>
      <div class="sf-card">
        <div class="sf-row">
          <div class="sf-row-icon">⛺</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Не ставить у воды</div>
            <div class="sf-row-sub">Отступить 50-100 м от берега</div>
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-row-icon">🌊</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Тамбовка — выше линии плавника!</div>
            <div class="sf-row-sub">Прилив 0.8-1.5 м. Палатка должна быть выше</div>
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-row-icon">🚗</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Еда и рыба — не в палатке</div>
            <div class="sf-row-sub">Хранить в машине с закрытыми окнами</div>
          </div>
        </div>
        <div class="sf-row">
          <div class="sf-row-icon">🐟</div>
          <div class="sf-row-body">
            <div class="sf-row-title">Не оставлять рыбу у берега</div>
            <div class="sf-row-sub">Потроха и остатки — далеко от лагеря</div>
          </div>
        </div>
      </div>

      <div class="sf-sec-label">При встрече с медведем</div>
      <div class="sf-card">
        <div class="sf-step-row">
          <div class="sf-step-num danger">1</div>
          <div class="sf-step-text"><b>Не бежать</b> — инстинкт преследования включается сразу</div>
        </div>
        <div class="sf-step-row">
          <div class="sf-step-num">2</div>
          <div class="sf-step-text">Говорить громко, медленно отступать не поворачиваясь спиной</div>
        </div>
        <div class="sf-step-row">
          <div class="sf-step-num">3</div>
          <div class="sf-step-text">Фальшфейер если медведь не уходит — поджечь и бросить перед ним</div>
        </div>
        <div class="sf-step-row">
          <div class="sf-step-num danger">4</div>
          <div class="sf-step-text"><b>Медвежий спрей</b> — последний аргумент при нападении. Расстояние 3-6 м</div>
        </div>
      </div>`;
  }

  // ── Экстренные телефоны ──────────────────────────────────────

  function _contacts() {
    return `
      <div class="sf-sec-label">📞 Экстренные телефоны</div>
      <div class="sf-contacts-card">
        ${_contactRow('Единый экстренный', '', 'tel:112', '112', true)}
        ${_contactRow('Скорая', '', 'tel:103', '103')}
        ${_contactRow('Полиция', '', 'tel:102', '102')}
        ${_contactRow('Пожарные', '', 'tel:101', '101')}
      </div>`;
  }

  // ── Больницы ──────────────────────────────────────────────────

  function _hospitals() {
    return `
      <div class="sf-sec-label">🏥 Больницы по маршруту</div>
      <div class="sf-contacts-card">
        ${_contactRow('Областная больница', 'Южно-Сахалинск, ул. Мира 430', 'tel:+74242460051', '+7 4242 46-00-51')}
        ${_contactRow('ЦРБ Долинск', '', 'tel:+74244323344', '+7 4244 3-23-44')}
        ${_contactRow('ЦРБ Макаров', '', 'tel:+74245521650', '+7 4245 5-21-65')}
      </div>`;
  }

  // ── Рыболовные службы ────────────────────────────────────────

  function _fishing() {
    return `
      <div class="sf-sec-label">🎣 Рыболовные службы</div>
      <div class="sf-contacts-card">
        ${_contactRow('Сахалинрыбвод', 'Лицензии на симу', 'tel:+74242720620', '+7 4242 72-06-20')}
        ${_contactRow('Эмико Фиш (путёвки)', 'ул. Ленина, 551', 'tel:+74242454545', '+7 4242 45-45-45')}
      </div>`;
  }

  // ── Контакты по маршруту ─────────────────────────────────────

  function _tripContacts() {
    return `
      <div class="sf-sec-label">📍 Контакты по маршруту</div>
      <div class="sf-contacts-card">
        ${_contactRow('Гостиница Анива', 'ул. Пудова, 28', 'tel:+79841390636', '+7 984 139-06-36')}
        ${_contactRow('Аэропорт Южный', '', 'tel:+74242788390', '+7 4242 78-83-90')}
        ${_contactRow('Погода Gismeteo', 'Южно-Сахалинск', 'https://www.gismeteo.ru/weather-yuzhno-sakhalinsk-4820/', 'Открыть →', false, true)}
      </div>`;
  }

  // ── Лицензия ──────────────────────────────────────────────────

  function _license() {
    return `
      <div class="sf-sec-label">📋 Лицензия на симу</div>
      <div class="sf-license-card">
        <div class="sf-license-badge">⚠️ Оформить в день прилёта — не тянуть!</div>
        <div class="sf-card" style="margin-top:0">
          <div class="sf-row">
            <div class="sf-row-icon">📍</div>
            <div class="sf-row-body">
              <div class="sf-row-title">Эмико Фиш</div>
              <div class="sf-row-sub">Южный, ул. Ленина 551</div>
            </div>
          </div>
          <div class="sf-row">
            <div class="sf-row-icon">💰</div>
            <div class="sf-row-body">
              <div class="sf-row-title">~1300 ₽ за 5 экземпляров</div>
              <div class="sf-row-sub">На человека, на весь период</div>
            </div>
          </div>
          <div class="sf-row">
            <div class="sf-row-icon">🐟</div>
            <div class="sf-row-body">
              <div class="sf-row-title">Лимит: 5 симы / человек</div>
              <div class="sf-row-sub" id="sf-lic-limit">Считается по участникам из поездки</div>
            </div>
          </div>
          <div class="sf-row">
            <div class="sf-row-icon">🚫</div>
            <div class="sf-row-body">
              <div class="sf-row-title">Сахалинский таймень — поймал-отпустил!</div>
              <div class="sf-row-sub">Любой вылов тайменя запрещён</div>
            </div>
          </div>
        </div>
      </div>
      <div style="height: 16px"></div>`;
  }

  // ── Хелпер строки контакта ───────────────────────────────────

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _contactRow(name, sub, href, label, isEmergency = false, isExternal = false) {
    const cls = isEmergency ? 'sf-contact-btn emergency' : 'sf-contact-btn';
    const target = isExternal ? ' target="_blank" rel="noopener"' : '';
    return `
      <div class="sf-contact-item">
        <div class="sf-contact-info">
          <div class="sf-contact-name">${_esc(name)}</div>
          ${sub ? `<div class="sf-contact-sub">${_esc(sub)}</div>` : ''}
        </div>
        <a href="${_esc(href)}" class="${cls}"${target}>${_esc(label)}</a>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────────

  function _bind(el) {
    el.querySelector('#sf-back')?.addEventListener('click', () => {
      if (typeof SafetyIndex !== 'undefined') SafetyIndex.close();
    });

    // FIX: добавлена проверка наличия метода getById перед вызовом
    _updateLicenseLimit();
  }

  function _updateLicenseLimit() {
    const el = document.getElementById('sf-lic-limit');
    if (!el) return;
    const tripId = window.APP?.currentTripId;
    const trip = tripId && typeof TripsData !== 'undefined' && typeof TripsData.getById === 'function'
      ? TripsData.getById(tripId)
      : null;
    const count = trip?.participants?.length || 3;
    el.textContent = `На ${count} чел = ${count * 5} симы суммарно`;
  }

  return { render };
})();

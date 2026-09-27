'use strict';

const SafetyRender = (() => {

  // ── Контент по поездкам ─────────────────────────────────────────
  // До появления самостоятельного редактора (см. заметку в памяти проекта)
  // содержимое для каждой поездки пишет Клод прямо в коде — ключ здесь это
  // trip.id. У поездки без своей записи показывается _DEFAULT_PROFILE:
  // только федеральные номера и общие правила по медведям, БЕЗ локальных
  // контактов/больниц конкретного региона — раньше при отсутствии записи
  // для новой поездки тут молча показывались номера и больницы Сахалина,
  // что для страницы экстренных контактов реально опасно (см. разбор с
  // Дмитрием: поездка «Ханты» в ХМАО показывала телефоны Южно-Сахалинска).
  // Лучше честно показать "ещё не добавлено", чем показать чужие контакты.

  // Общие правила поведения при встрече с медведем и снаряжение — не
  // привязаны к региону/сезону, безопасно переиспользовать в любом профиле
  // без своих специфичных фактов (см. _DEFAULT_PROFILE ниже).
  const _GENERIC_BEAR = {
    bearGear: [
      { icon: 'flame', title: 'Фальшфейер — минимум 2-3 шт', sub: 'Лучший отпугиватель. Всегда при себе у воды' },
      { icon: 'spray', title: 'Медвежий спрей на пояс', sub: 'Каждому участнику при выходе из лагеря' },
      { icon: 'bell', title: 'Колокольчик на рюкзаке', sub: 'При ходьбе по берегу — обязательно' },
    ],
    campRules: [
      { icon: 'tent', title: 'Не ставить у воды', sub: 'Отступить от берега' },
      { icon: 'car', title: 'Еда и рыба — не в палатке', sub: 'Хранить отдельно, желательно в машине' },
      { icon: 'fishing', title: 'Не оставлять рыбу у берега', sub: 'Потроха и остатки — далеко от лагеря' },
    ],
    bearSteps: [
      { danger: true, text: '<b>Не бежать</b> — инстинкт преследования включается сразу' },
      { text: 'Говорить громко, медленно отступать не поворачиваясь спиной' },
      { text: 'Фальшфейер если медведь не уходит — поджечь и бросить перед ним' },
      { danger: true, text: '<b>Медвежий спрей</b> — последний аргумент при нападении. Расстояние 3-6 м' },
    ],
  };

  const _PROFILES = {
    // Ханты-Мансийск — куда фактически идёт поездка «Ханты» (уточнено у
    // Дмитрия 2026-09-23). Больница — Окружная клиническая больница,
    // экстренный пост, с её собственного официального сайта okbhmao.ru
    // (страница /kontakty/, проверено при добавлении). Рыболовных служб и
    // лицензии здесь нет — в отличие от Сахалина, для ХМАО это не заведено.
    trip_1789204114768: {
      subtitle: 'Ханты',
      bearWarning: {
        title: 'Медведи — оцени риск на месте',
        text: 'ХМАО — таёжный регион, встреча у воды возможна. Общие правила — ниже.',
      },
      ..._GENERIC_BEAR,
      hospitals: [
        { name: 'Окружная клиническая больница — экстренный пост', sub: 'Ханты-Мансийск, ул. Калинина, 40', tel: '+73467390196', label: '+7 3467 390-196' },
      ],
      fishingServices: null,
      tripContacts: null,
      license: null,
    },
    sakhalin2026: {
      subtitle: 'Сахалин 2026',
      bearWarning: {
        title: 'Медведи — встреча вероятна',
        text: 'На Сахалине в июне медведь голодный. У рек с рыбой особенно активен.',
      },
      bearGear: [
        { icon: 'flame', title: 'Фальшфейер — минимум 2-3 шт', sub: 'Лучший отпугиватель. Всегда при себе у воды' },
        { icon: 'spray', title: 'Медвежий спрей на пояс', sub: 'Каждому участнику при выходе из лагеря' },
        { icon: 'bell', title: 'Колокольчик на рюкзаке', sub: 'При ходьбе по берегу — обязательно' },
      ],
      campRules: [
        { icon: 'tent', title: 'Не ставить у воды', sub: 'Отступить 50-100 м от берега' },
        { icon: 'ripple', title: 'Тамбовка — выше линии плавника!', sub: 'Прилив 0.8-1.5 м. Палатка должна быть выше' },
        { icon: 'car', title: 'Еда и рыба — не в палатке', sub: 'Хранить в машине с закрытыми окнами' },
        { icon: 'fishing', title: 'Не оставлять рыбу у берега', sub: 'Потроха и остатки — далеко от лагеря' },
      ],
      bearSteps: [
        { danger: true, text: '<b>Не бежать</b> — инстинкт преследования включается сразу' },
        { text: 'Говорить громко, медленно отступать не поворачиваясь спиной' },
        { text: 'Фальшфейер если медведь не уходит — поджечь и бросить перед ним' },
        { danger: true, text: '<b>Медвежий спрей</b> — последний аргумент при нападении. Расстояние 3-6 м' },
      ],
      hospitals: [
        { name: 'Областная больница', sub: 'Южно-Сахалинск, ул. Мира 430', tel: '+74242460051', label: '+7 4242 46-00-51' },
        { name: 'ЦРБ Долинск', tel: '+74244323344', label: '+7 4244 3-23-44' },
        { name: 'ЦРБ Макаров', tel: '+74245521650', label: '+7 4245 5-21-65' },
      ],
      fishingServices: [
        { name: 'Сахалинрыбвод', sub: 'Лицензии на симу', tel: '+74242720620', label: '+7 4242 72-06-20' },
        { name: 'Эмико Фиш (путёвки)', sub: 'ул. Ленина, 551', tel: '+74242454545', label: '+7 4242 45-45-45' },
      ],
      tripContacts: [
        { name: 'Гостиница Анива', sub: 'ул. Пудова, 28', tel: '+79841390636', label: '+7 984 139-06-36' },
        { name: 'Аэропорт Южный', tel: '+74242788390', label: '+7 4242 78-83-90' },
        { name: 'Погода Gismeteo', sub: 'Южно-Сахалинск', href: 'https://www.gismeteo.ru/weather-yuzhno-sakhalinsk-4820/', label: 'Открыть →', external: true },
      ],
      license: {
        badge: 'Оформить в день прилёта — не тянуть!',
        rows: [
          { icon: 'map-pin', title: 'Эмико Фиш', sub: 'Южный, ул. Ленина 551' },
          { icon: 'cash', title: '~1300 ₽ за 5 экземпляров', sub: 'На человека, на весь период' },
          { icon: 'fishing', title: 'Лимит: 5 симы / человек', sub: 'Считается по участникам из поездки', id: 'sf-lic-limit', dynamicLimit: 5 },
          { icon: 'ban', title: 'Сахалинский таймень — поймал-отпустил!', sub: 'Любой вылов тайменя запрещён' },
        ],
      },
    },
  };

  // Общие правила поведения при встрече с медведем — не привязаны к региону
  // или сезону, поэтому безопасно показывать их всегда, даже без своей
  // записи под конкретную поездку. Локальные факты (номера, больницы) сюда
  // не входят — их без реальных данных придумывать нельзя.
  const _DEFAULT_PROFILE = {
    subtitle: null,
    bearWarning: {
      title: 'Проверь риск встречи с медведем на месте',
      text: 'Локальные особенности региона для этой поездки ещё не добавлены — полагайся на местных и общие правила ниже.',
    },
    ..._GENERIC_BEAR,
    hospitals: null,
    fishingServices: null,
    tripContacts: null,
    license: null,
  };

  function _profileFor(tripId) {
    return (tripId && _PROFILES[tripId]) || _DEFAULT_PROFILE;
  }

  function _tripName(tripId) {
    const trip = tripId && typeof TripsData !== 'undefined' && typeof TripsData.getById === 'function'
      ? TripsData.getById(tripId)
      : null;
    return trip?.name || '';
  }

  function render(el, tripId) {
    if (!el) return;
    el.innerHTML = _build(tripId);
    _bind(el, tripId);
  }

  function _build(tripId) {
    const profile = _profileFor(tripId);
    // «Контакты по поездке» — рыболовные службы и остальные контакты
    // маршрута теперь один список (по макету V2Safety), не две карточки.
    const tripContacts = [...(profile.fishingServices || []), ...(profile.tripContacts || [])];
    return `
      <div class="sf-wrap">
        ${_topbar(profile, tripId)}
        <div class="sf-scroll">
          ${_emergency()}
          ${profile.hospitals ? _hospitals(profile.hospitals) : ''}
          ${_bearWarning(profile)}
          ${_bearSteps(profile)}
          ${_bearGear(profile)}
          ${_campRules(profile)}
          ${profile.license ? _license(profile.license) : ''}
          ${tripContacts.length ? _contactsCard('Контакты по поездке', tripContacts) : ''}
          ${!profile.hospitals && !profile.license && !tripContacts.length ? _noLocalDataNotice() : ''}
        </div>
      </div>`;
  }

  // ── Топбар ──────────────────────────────────────────────────

  function _topbar(profile, tripId) {
    const sub = profile.subtitle || _tripName(tripId) || 'Справочник';
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
          <div class="sf-topbar__sub">${_esc(sub)}</div>
        </div>
      </div>`;
  }

  // ── Экстренные телефоны — первым делом, крупно (макет V2Safety):
  //    большая красная «Позвонить 112» + плитки 103/102/101 ниже ──

  function _emergency() {
    return `
      <a href="tel:112" class="sf-sos">
        <div class="sf-sos-icon">${UIUtils.ico('phone')}</div>
        <div class="sf-sos-text">
          <div class="sf-sos-title">Позвонить 112</div>
          <div class="sf-sos-sub">единый номер экстренных служб</div>
        </div>
      </a>
      <div class="sf-sos-grid">
        <a href="tel:103" class="sf-sos-tile"><span class="sf-sos-tile-num">103</span><span class="sf-sos-tile-lbl">Скорая</span></a>
        <a href="tel:102" class="sf-sos-tile"><span class="sf-sos-tile-num">102</span><span class="sf-sos-tile-lbl">Полиция</span></a>
        <a href="tel:101" class="sf-sos-tile"><span class="sf-sos-tile-num">101</span><span class="sf-sos-tile-lbl">Пожарные</span></a>
      </div>`;
  }

  // ── Больницы рядом — кнопка звонка справа, номер текстом под названием ──

  function _hospitals(list) {
    return `
      <div class="sf-sec-label">Больницы рядом</div>
      <div class="sf-contacts-card">
        ${list.map(c => _callRow(c)).join('')}
      </div>`;
  }

  // ── Медведи: плашка-предупреждение ──────────────────────────────

  function _bearWarning(profile) {
    return `
      <div class="sf-warn-banner">
        <div class="sf-warn-icon">${UIUtils.ico('paw')}</div>
        <div>
          <div class="sf-warn-title">${_esc(profile.bearWarning.title)}</div>
          <div class="sf-warn-text">${_esc(profile.bearWarning.text)}</div>
        </div>
      </div>`;
  }

  // ── Если встретил медведя — шаги, критичные красным кружком ──────

  function _bearSteps(profile) {
    const stepRows = profile.bearSteps.map((s, i) => `
        <div class="sf-step-row">
          <div class="sf-step-num ${s.danger ? 'danger' : ''}">${i + 1}</div>
          <div class="sf-step-text">${s.text}</div>
        </div>`).join('');
    return `
      <div class="sf-sec-label">Если встретил медведя</div>
      <div class="sf-card">${stepRows}</div>`;
  }

  // ── Что всегда при себе ───────────────────────────────────────────

  function _bearGear(profile) {
    const gearRows = profile.bearGear.map(r => `
        <div class="sf-row">
          <div class="sf-row-icon">${UIUtils.ico(r.icon)}</div>
          <div class="sf-row-body">
            <div class="sf-row-title">${_esc(r.title)}</div>
            <div class="sf-row-sub">${_esc(r.sub)}</div>
          </div>
        </div>`).join('');
    return `
      <div class="sf-sec-label">Что всегда при себе</div>
      <div class="sf-card">${gearRows}</div>`;
  }

  // ── Лагерь ─────────────────────────────────────────────────────────

  function _campRules(profile) {
    const campRows = profile.campRules.map(r => `
        <div class="sf-row">
          <div class="sf-row-icon">${UIUtils.ico(r.icon)}</div>
          <div class="sf-row-body">
            <div class="sf-row-title">${_esc(r.title)}</div>
            <div class="sf-row-sub">${_esc(r.sub)}</div>
          </div>
        </div>`).join('');
    return `
      <div class="sf-sec-label">Лагерь</div>
      <div class="sf-card">${campRows}</div>`;
  }

  function _contactsCard(label, items) {
    return `
      <div class="sf-sec-label">${_esc(label)}</div>
      <div class="sf-contacts-card">
        ${items.map(c => _callRow(c)).join('')}
      </div>`;
  }

  function _noLocalDataNotice() {
    return `
      <div class="sf-sec-label">Локальные контакты</div>
      <div class="sf-contacts-card">
        <div class="sf-contact-item">
          <div class="sf-contact-info">
            <div class="sf-contact-name">Локальные контакты ещё не добавлены</div>
            <div class="sf-contact-sub">Больницы, служба рыбоохраны и контакты по маршруту — сообщите организатору, чтобы их внесли сюда до выезда</div>
          </div>
        </div>
      </div>`;
  }

  // ── Лицензия ──────────────────────────────────────────────────

  function _license(license) {
    const rows = license.rows.map(r => `
          <div class="sf-row">
            <div class="sf-row-icon">${UIUtils.ico(r.icon)}</div>
            <div class="sf-row-body">
              <div class="sf-row-title">${_esc(r.title)}</div>
              <div class="sf-row-sub" ${r.id ? `id="${r.id}"` : ''}>${_esc(r.sub || '')}</div>
            </div>
          </div>`).join('');

    return `
      <div class="sf-sec-label">Лицензия</div>
      <div class="sf-license-card">
        <div class="sf-license-badge">${UIUtils.ico('alert-triangle')} ${_esc(license.badge)}</div>
        <div class="sf-card" style="margin-top:0">${rows}</div>
      </div>
      <div style="height: 16px"></div>`;
  }

  // ── Хелпер строки контакта — кнопка звонка (или «открыть» для внешней
  //    ссылки) справа, номер/подпись текстом под названием ─────────────

  function _esc(s) {
    return String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function _callRow(c) {
    if (c.external) {
      return `
        <div class="sf-contact-item">
          <div class="sf-contact-info">
            <div class="sf-contact-name">${_esc(c.name)}</div>
            ${c.sub ? `<div class="sf-contact-sub">${_esc(c.sub)}</div>` : ''}
          </div>
          <a href="${_esc(c.href)}" class="sf-ext-btn" target="_blank" rel="noopener" aria-label="Открыть">${UIUtils.ico('external-link')}</a>
        </div>`;
    }
    return `
      <div class="sf-contact-item">
        <div class="sf-contact-info">
          <div class="sf-contact-name">${_esc(c.name)}</div>
          ${c.sub ? `<div class="sf-contact-sub">${_esc(c.sub)}</div>` : ''}
          <div class="sf-contact-tel">${_esc(c.label)}</div>
        </div>
        <a href="tel:${_esc(c.tel)}" class="sf-call-btn" aria-label="Позвонить">${UIUtils.ico('phone')}</a>
      </div>`;
  }

  // ── Events ───────────────────────────────────────────────────

  function _bind(el, tripId) {
    el.querySelector('#sf-back')?.addEventListener('click', () => {
      if (typeof SafetyIndex !== 'undefined') SafetyIndex.close();
    });

    _updateLicenseLimit(tripId);
  }

  function _updateLicenseLimit(tripId) {
    const el = document.getElementById('sf-lic-limit');
    if (!el) return;
    const profile = _profileFor(tripId);
    const perPerson = profile.license?.rows?.find(r => r.dynamicLimit)?.dynamicLimit;
    if (!perPerson) return;
    const trip = tripId && typeof TripsData !== 'undefined' && typeof TripsData.getById === 'function'
      ? TripsData.getById(tripId)
      : null;
    const count = trip?.participants?.length || 3;
    el.textContent = `На ${count} чел = ${count * perPerson} симы суммарно`;
  }

  return { render };
})();

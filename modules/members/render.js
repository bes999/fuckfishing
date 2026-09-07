'use strict';
/* globals MembersFirebase, AuthActions, TG_BOT_USERNAME */

const MembersRender = (() => {

  const BLOOD_TYPES = [
    {id:'A+',ru:'II +'},{id:'A−',ru:'II −'},
    {id:'B+',ru:'III +'},{id:'B−',ru:'III −'},
    {id:'AB+',ru:'IV +'},{id:'AB−',ru:'IV −'},
    {id:'O+',ru:'I +'},{id:'O−',ru:'I −'},
  ];
  const AVATARS = ['🎣','🤙','🐟','🦈','😎','🧔','🏕️','🌊','🦅','🐻','🍺','🥃','👾','🎯','🐠','🦑','🐙','🏔️','🎿','🚤'];
  const SWIM_LABELS = { none: 'Не умею', weak: 'Слабо', confident: 'Уверенно', pro: 'Профи' };
  const TICK_LABELS = { yes: 'Да', no: 'Нет', unknown: 'Не знаю' };

  // Официальные монохромные SVG-пути брендов (source: simple-icons /
  // Wikipedia MAX-логотип, MIT/CC0). Рендерятся одним нейтральным цветом
  // (currentColor) без цветной подложки — по одному стилю с остальными
  // ti-иконками в приложении, а не отдельным ярким пятном.
  const MSGR_ICON_WA  = 'M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z';
  const MSGR_ICON_TG  = 'M11.944 0A12 12 0 0 0 0 12a12 12 0 0 0 12 12 12 12 0 0 0 12-12A12 12 0 0 0 12 0a12 12 0 0 0-.056 0zm4.962 7.224c.1-.002.321.023.465.14a.506.506 0 0 1 .171.325c.016.093.036.306.02.472-.18 1.898-.962 6.502-1.36 8.627-.168.9-.499 1.201-.82 1.23-.696.065-1.225-.46-1.9-.902-1.056-.693-1.653-1.124-2.678-1.8-1.185-.78-.417-1.21.258-1.91.177-.184 3.247-2.977 3.307-3.23.007-.032.014-.15-.056-.212s-.174-.041-.249-.024c-.106.024-1.793 1.14-5.061 3.345-.48.33-.913.49-1.302.48-.428-.008-1.252-.241-1.865-.44-.752-.245-1.349-.374-1.297-.789.027-.216.325-.437.893-.663 3.498-1.524 5.83-2.529 6.998-3.014 3.332-1.386 4.025-1.627 4.476-1.635z';
  const MSGR_ICON_MAX = 'M508.211 878.328c-75.007 0-109.864-10.95-170.453-54.75-38.325 49.275-159.686 87.783-164.979 21.9 0-49.456-10.95-91.248-23.36-136.873-14.782-56.21-31.572-118.807-31.572-209.508 0-216.626 177.754-379.597 388.357-379.597 210.785 0 375.947 171.001 375.947 381.604.707 207.346-166.595 376.118-373.94 377.224m3.103-571.585c-102.564-5.292-182.499 65.7-200.201 177.024-14.6 92.162 11.315 204.398 33.397 210.238 10.585 2.555 37.23-18.98 53.837-35.587a189.8 189.8 0 0 0 92.71 33.032c106.273 5.112 197.08-75.794 204.215-181.95 4.154-106.382-77.67-196.486-183.958-202.574Z';

  function _msgrIcon(type) {
    if (type === 'wa')  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${MSGR_ICON_WA}"/></svg>`;
    if (type === 'tg')  return `<svg viewBox="0 0 24 24" fill="currentColor"><path d="${MSGR_ICON_TG}"/></svg>`;
    if (type === 'max') return `<svg viewBox="0 0 1000 1000" fill="currentColor"><path d="${MSGR_ICON_MAX}"/></svg>`;
    return '';
  }

  // Значки мессенджеров — переиспользуется и для экстренных контактов, и
  // для мессенджеров самого владельца профиля (те же три поля wa/tg/max).
  //
  // MAX не даёт открыть чат по номеру телефона — только по ссылке вида
  // max.ru/u/<хеш>, которую сам человек берёт через "Поделиться" в
  // приложении и вставляет целиком. _maxHref принимает то, что реально
  // вставили: полный URL как есть, "max.ru/u/xxx" без протокола, либо
  // голый хеш/ник — во всех случаях достраивает рабочую ссылку.
  function _maxHref(v) {
    const s = String(v || '').trim();
    if (/^https?:\/\//i.test(s)) return s;
    if (/^max\.ru\//i.test(s)) return 'https://' + s;
    return 'https://max.ru/u/' + s.replace(/^\/?u\//i, '').replace(/^@/, '');
  }

  function _msgrBadges(obj, extraAttrs) {
    if (!obj) return '';
    const badges = [];
    if (obj.wa)  badges.push(`<a class="msgr-badge msgr-wa" href="https://wa.me/${encodeURIComponent(obj.wa.replace(/\D/g,''))}" target="_blank" rel="noopener" aria-label="WhatsApp">${_msgrIcon('wa')}</a>`);
    if (obj.tg)  badges.push(`<a class="msgr-badge msgr-tg" href="https://t.me/${encodeURIComponent(obj.tg)}" target="_blank" rel="noopener" aria-label="Telegram">${_msgrIcon('tg')}</a>`);
    if (obj.max) badges.push(`<a class="msgr-badge msgr-max" href="${_esc(_maxHref(obj.max))}" target="_blank" rel="noopener" aria-label="MAX">${_msgrIcon('max')}</a>`);
    if (!badges.length) return '';
    return `<div class="p-msgrs"${extraAttrs || ''}>${badges.join('')}</div>`;
  }

  /* ══════════════════════════════════════════════
     СПИСОК УЧАСТНИКОВ
  ══════════════════════════════════════════════ */
  function renderList(members, currentUid, isOrg) {
    const el = document.getElementById('members-list');
    if (!el) return;

    const cards = members.map(m => {
      const isMe = m.uid === currentUid;
      return `
        <div class="m-card" data-action="member-open" data-uid="${m.uid}">
          ${isMe ? '<span class="m-me-badge">Я</span>' : ''}
          <div class="m-ava">${UIUtils.avatarHtml(m.avatar, '🎣')}</div>
          <div class="m-name">${_esc(m.displayName)}${m.nickname ? ` <span class="p-nickname">«${_esc(m.nickname)}»</span>` : ''}</div>
          <div class="m-role${m.role==='organizer'?' org':''}">
            ${m.role==='organizer'?'⭐ Организатор':'👤 Участник'}
          </div>
        </div>`;
    }).join('');

    const addBtn = isOrg ? `
      <div class="m-add-card" data-action="member-invite">
        <div class="m-add-icon">＋</div>
        <div class="m-add-label">Пригласить</div>
      </div>` : '';

    el.innerHTML = `<div class="members-grid">${cards}${addBtn}</div>`;
  }

  /* ══════════════════════════════════════════════
     ПРОФИЛЬ
  ══════════════════════════════════════════════ */
  let _activeTab = 'profile';

  async function showProfile(uid, currentUid) {
    _activeTab = 'profile';
    const profile = await MembersFirebase.getProfile(uid);
    if (!profile) return;

    const isMe  = uid === currentUid;
    const isOrg = AuthActions.isOrganizer();
    _renderProfilePage(profile, isMe, isOrg);
  }

  function _renderProfilePage(profile, isMe, isOrg) {
    const pg = document.getElementById('p-members');
    if (!pg) return;

    pg.innerHTML = `
      <div class="topbar" style="display:flex;align-items:center;gap:12px;padding-top:14px">
        <button data-action="profile-back"
          style="width:32px;height:32px;border-radius:50%;background:rgba(255,255,255,0.15);border:none;
                 cursor:pointer;color:#fff;display:flex;align-items:center;justify-content:center;flex-shrink:0">
          <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor"
               stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <polyline points="15 18 9 12 15 6"/>
          </svg>
        </button>
        <div style="flex:1">
          <h1 style="font-size:18px">${isMe ? 'Мой профиль' : _esc(profile.displayName)}</h1>
        </div>
      </div>
      <div class="profile-scroll" style="overflow-y:auto;flex:1;padding-bottom:calc(83px + env(safe-area-inset-bottom))">
        ${_profileHeader(profile, isMe, isOrg)}
        ${_subtabs()}
        <div id="profile-tab-content">
          ${_tabProfile(profile, isMe)}
        </div>
        ${!isMe ? _profileActions(profile.uid, isOrg, profile.displayName) : ''}
      </div>`;

    // Кнопка назад — на главную
    // TODO: hardcoded 'home' — revisit once nav redesign (hamburger) лендет, back-navigation should return to entry point
    pg.querySelector('[data-action="profile-back"]')?.addEventListener('click', () => {
      if (typeof AppNav !== 'undefined') AppNav.setActive('home');
      if (typeof AppRouter !== 'undefined') AppRouter.show('home');
      if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
    });

    // Сохраняем данные для переключения вкладок
    pg._profileData = { profile, isMe, isOrg };
  }

  function _profileHeader(p, isMe, isOrg) {
    const roleLabel = p.role === 'organizer' ? 'Организатор' : 'Участник';
    const nickHtml = p.nickname
      ? ` <span class="p-nickname">«${_esc(p.nickname)}»</span>`
      : (isMe ? ` <span class="p-nick-add" data-action="profile-edit" data-uid="${p.uid}">+ ник</span>` : '');
    const canEdit = isMe || isOrg;
    return `
      <div class="p-header">
        <div class="p-ava-circle">${UIUtils.avatarHtml(p.avatar, '🎣')}</div>
        <div style="flex:1;min-width:0">
          <div class="p-name">${_esc(p.displayName)}${nickHtml}</div>
          ${p.email ? `<div class="p-meta">${_esc(p.email)}</div>` : ''}
          ${p.phone ? `<div class="p-meta">${_esc(p.phone)}</div>` : ''}
          ${_msgrBadges(p, ' style="margin-top:5px"')}
          <span class="p-badge ${p.role}">${roleLabel}</span>
        </div>
        ${canEdit ? `<button class="p-header-edit" data-action="profile-edit" data-uid="${p.uid}"><i class="ti ti-pencil"></i></button>` : ''}
      </div>`;
  }

  /* ── Статистика (поездки + самый активный месяц по личным уловам) ── */

  const MONTHS_RU = ['Январь','Февраль','Март','Апрель','Май','Июнь','Июль','Август','Сентябрь','Октябрь','Ноябрь','Декабрь'];

  // Поездки, где человек участник — те же правила видимости, что и в
  // "Наши поездки" на вкладке "Поездки" ниже (private-поездки видны только
  // тем, кто сам в их memberIds).
  function _tripsForProfile(profileUid) {
    const viewerUid = window.APP?.user?.uid;
    return (typeof TripsData !== 'undefined' ? TripsData.getAll() : [])
      .filter(t => (t.memberIds || []).includes(profileUid))
      .filter(t => !t.private || (t.memberIds || []).includes(viewerUid));
  }

  // _topFishingMonth/_statsRow — временно не вызываются (пользователь
  // попросил убрать stat-каллауты "N поездок"/"активный месяц" с карточки
  // профиля), оставлены как есть на случай, если решим вернуть в другом виде.
  //
  // Уловы матчатся по полю member (свободный текст, выбирается в форме
  // Улова из списка участников поездки) против имени/ника профиля — прямой
  // uid-связи там нет, это ближайшее доступное сопоставление.
  function _topFishingMonth(p) {
    if (typeof CatchesState === 'undefined' || typeof CatchesState.getAllCatches !== 'function') return '';
    const names = [p.displayName, p.nickname].filter(Boolean).map(s => s.trim().toLowerCase());
    if (!names.length) return '';

    const byMonth = {};
    CatchesState.getAllCatches().forEach(c => {
      if (!c.member || !c.date) return;
      if (!names.includes(c.member.trim().toLowerCase())) return;
      const month = parseInt((c.date.split('-')[1] || ''), 10) - 1;
      if (month < 0 || month > 11) return;
      byMonth[month] = (byMonth[month] || 0) + 1;
    });

    const entries = Object.entries(byMonth);
    if (!entries.length) return '';
    entries.sort((a, b) => b[1] - a[1]);
    return MONTHS_RU[+entries[0][0]];
  }

  function _statsRow(tripsCount, topMonth) {
    return `
      <div class="p-stats">
        <div class="p-stat">
          <div class="p-stat-num">${tripsCount}</div>
          <div class="p-stat-lbl">поездок</div>
        </div>
        <div class="p-stat">
          <div class="p-stat-num p-stat-num--text">${topMonth || '—'}</div>
          <div class="p-stat-lbl">активный месяц</div>
        </div>
      </div>`;
  }

  function _subtabs() {
    const tabs = [{id:'profile',lbl:'Профиль'},{id:'gear',lbl:'Снаряга'},{id:'medkit',lbl:'Аптечка'},{id:'trips',lbl:'Поездки'}];
    return `<div class="p-subtabs">
      ${tabs.map(t => `<button class="p-stab${_activeTab===t.id?' active':''}" data-action="profile-tab" data-tab="${t.id}">${t.lbl}</button>`).join('')}
    </div>`;
  }

  function _tabProfile(p, isMe) {
    const bloodRu = p.bloodType ? (BLOOD_TYPES.find(b => b.id === p.bloodType) || {}).ru : '';
    const bloodHtml = p.bloodType
      ? `<span class="p-row-val" style="margin-right:8px">${_esc(bloodRu || '')}</span><div class="blood-circle">${_esc(p.bloodType)}</div>`
      : `<span class="p-row-val muted">Не указана</span>`;

    // Возраст из ДР
    let age = '';
    if (p.birthday) {
      const parts = p.birthday.split('.');
      if (parts.length === 3) {
        const bd = new Date(+parts[2], +parts[1]-1, +parts[0]);
        const now = new Date();
        let a = now.getFullYear() - bd.getFullYear();
        if (now < new Date(now.getFullYear(), bd.getMonth(), bd.getDate())) a--;
        if (a > 0 && a < 120) age = a + ' ' + _ageWord(a);
      }
    }

    const hw = [p.height ? p.height+' см' : '', p.weight ? p.weight+' кг' : ''].filter(Boolean).join(' / ');

    const emergency = (p.emergency || []);
    const emergHtml = emergency.map((c,i) => `
      <div class="p-emerg-card">
        <div class="p-emerg-info">
          <div class="p-emerg-name">${_esc(c.name)}</div>
          <div class="p-emerg-phone-row">
            <span class="p-emerg-phone">${_esc(c.phone)}</span>
            ${_msgrBadges(c)}
          </div>
        </div>
        ${isMe ? `
        <div class="p-emerg-actions">
          <div class="p-emerg-edit" data-action="emerg-edit" data-idx="${i}"><i class="ti ti-pencil"></i></div>
          <div class="p-emerg-del" data-action="emerg-del" data-idx="${i}">×</div>
        </div>` : ''}
      </div>`).join('');

    // Порядок по важности: сначала медданные (нужны всегда, в первую
    // очередь в экстренной ситуации), сразу за ними — экстренные контакты
    // (тоже про безопасность). Telegram-бот — это про аккаунт, а не про
    // здоровье, поэтому не смешиваем его со врачебными полями — но и не
    // поднимаем выше контактов: разовая настройка, самая нижняя секция.
    return `
      <div class="p-card">
        <div class="p-row"><span class="p-row-lbl">Группа крови</span>${bloodHtml}</div>
        ${hw ? `<div class="p-row"><span class="p-row-lbl">Рост / Вес</span><span class="p-row-val">${hw}</span></div>` : ''}
        ${age ? `<div class="p-row"><span class="p-row-lbl">Возраст</span><span class="p-row-val">${age}</span></div>` : ''}
        ${p.allergies ? `<div class="p-row"><span class="p-row-lbl">Аллергии</span><span class="p-row-val muted">${_esc(p.allergies)}</span></div>` : ''}
        ${p.conditions ? `<div class="p-row"><span class="p-row-lbl">Хронические</span><span class="p-row-val muted">${_esc(p.conditions)}</span></div>` : ''}
        ${p.meds ? `<div class="p-row"><span class="p-row-lbl">Постоянные лекарства</span><span class="p-row-val muted">${_esc(p.meds)}</span></div>` : ''}
        ${p.tickVaccine ? `<div class="p-row"><span class="p-row-lbl">Прививка от клеща</span><span class="p-row-val ${p.tickVaccine==='yes'?'green':p.tickVaccine==='no'?'red':'muted'}">${_esc(TICK_LABELS[p.tickVaccine] || '')}</span></div>` : ''}
        ${p.swim ? `<div class="p-row"><span class="p-row-lbl">Плавание</span><span class="p-row-val">${_esc(SWIM_LABELS[p.swim] || '')}</span></div>` : ''}
        ${p.insurance ? `<div class="p-row"><span class="p-row-lbl">Полис ОМС/ДМС</span><span class="p-row-val muted">${_esc(p.insurance)}</span></div>` : ''}
      </div>

      <div class="p-sec-title">Экстренные контакты</div>
      ${emergHtml}
      ${isMe ? `<div class="p-emerg-add" data-action="emerg-add">+ Добавить контакт</div>` : ''}

      ${isMe ? `
      <div class="p-sec-title">Аккаунт</div>
      <div class="p-card" style="padding:2px 14px">${_tabTelegram(p)}</div>

      <div class="p-card p-card--signout" style="padding:2px 14px" data-action="auth-signout">
        <div class="p-row p-row-danger">
          <span class="p-row-lbl" style="color:var(--red)">Выйти из аккаунта</span>
        </div>
      </div>` : ''}`;
  }


  const TG_LINK_CODE_TTL_MS = 15 * 60 * 1000;

  /* ══════════════════════════════════════════════
     TELEGRAM-БОТ (привязка аккаунта) — компактная строка внутри карточки
     данных, не отдельная кнопка: привязывается один раз и почти не
     трогается дальше, не должна конкурировать по весу с экстренными
     контактами.
  ══════════════════════════════════════════════ */
  function _tabTelegram(p) {
    // Привязан
    if (p.telegramId) {
      return `
      <div class="p-row">
        <span class="p-row-lbl">✈️ Telegram-бот</span>
        <span class="p-row-val">${p.telegramUsername ? `@${_esc(p.telegramUsername)}` : 'Привязан'} <span class="p-row-action danger" data-action="tg-unlink">Отвязать</span></span>
      </div>`;
    }

    // Код сгенерирован и ещё не протух
    const codeFresh = p.telegramLinkCode && p.telegramLinkCodeAt
      && (Date.now() - new Date(p.telegramLinkCodeAt).getTime() < TG_LINK_CODE_TTL_MS);
    if (codeFresh) {
      return `
      <div class="p-tg-code-card">
        <div class="p-tg-code">${_esc(p.telegramLinkCode)}</div>
        <div class="p-tg-code-hint">
          Отправьте этот код боту
          <a class="p-tg-code-link" href="https://t.me/${TG_BOT_USERNAME}" target="_blank" rel="noopener">@${TG_BOT_USERNAME}</a>
          в течение 15 минут
        </div>
        <div class="p-tg-cancel" data-action="tg-cancel">Отменить</div>
      </div>`;
    }

    // Не привязан, кода нет (или протух)
    return `
      <div class="p-row" data-action="tg-link" style="cursor:pointer">
        <span class="p-row-lbl">✈️ Telegram-бот</span>
        <span class="p-row-val muted">Привязать ›</span>
      </div>`;
  }

  // Полная история поездок владельца профиля — предстоящие/идущие/
  // завершённые, независимо от того, участвует ли в них сам смотрящий
  // (это осознанно: "Мои поездки"/Главная у КАЖДОГО фильтруются по своим
  // memberIds, чтобы не захламляться чужими компаниями, а тут наоборот —
  // это же профиль конкретного человека, и видно всё, чем он занимался).
  // Единственное исключение — поездки с trip.private: они скрыты от всех,
  // кроме тех, кто сам в их memberIds (см. чекбокс в modules/trips/index.js).
  function _tabTrips(profileUid) {
    const trips = _tripsForProfile(profileUid)
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));

    if (!trips.length) {
      return `<p style="color:var(--label3);font-size:14px;padding:12px 0">Поездок пока нет</p>`;
    }

    return trips.map(t => `
      <div class="p-trip-card" data-action="profile-trip-open" data-trip-id="${t.id}">
        <div class="p-trip-header">
          <div>
            <div class="p-trip-name">${t.type === 'expedition' ? '🏔' : '🎣'} ${_esc(t.name)}</div>
            <div class="p-trip-dates">${_fmtDate(t.startDate)}${t.endDate && t.endDate !== t.startDate ? ' – ' + _fmtDate(t.endDate) : ''}</div>
          </div>
          <div class="p-trip-badge">${typeof TripsData !== 'undefined' ? TripsData.statusLabel(t.status) : ''}</div>
        </div>
      </div>`).join('');
  }

  function _tabGear(p, isMe) {
    const gear = p.gear || [];
    if (!gear.length) {
      return `<p style="color:var(--label3);font-size:14px;padding:12px 0">Список снаряги не заполнен</p>
        ${isMe ? `<div class="p-gear-add" data-action="gear-add">+ Добавить</div>` : ''}`;
    }
    return gear.map((g,i) => `
      <div class="p-gear-item">
        <span>${_esc(g)}</span>
        ${isMe ? `<span class="p-emerg-del" data-action="gear-del" data-idx="${i}">×</span>` : ''}
      </div>`).join('') +
      (isMe ? `<div class="p-gear-add" data-action="gear-add">+ Добавить</div>` : '');
  }

  // "Редактировать" — иконка в _profileHeader, "Выйти" — строка в карточке
  // "Аккаунт" (см. _tabProfile). Тут остаются только действия организатора
  // над чужим профилем — для isMe этот блок вообще не рендерится.
  function _profileActions(uid, isOrg, name) {
    return `<div class="p-actions">
      <button class="p-btn-edit" data-action="member-add-trip" data-uid="${uid}" data-name="${_esc(name)}">➕ В поездку</button>
      ${isOrg ? `<button class="p-btn-del" data-action="member-delete" data-uid="${uid}" data-name="${_esc(uid)}">🗑️ Удалить</button>` : ''}
    </div>`;
  }

  function switchTab(tab) {
    _activeTab = tab;
    const pg = document.getElementById('p-members');
    if (!pg) return;
    const d = pg._profileData;
    if (!d) return;

    // При уходе с вкладки аптечки — восстанавливаем оригинальный #p-medkit
    const hidden = document.getElementById('p-medkit-hidden');
    if (hidden) hidden.id = 'p-medkit';

    pg.querySelectorAll('.p-stab').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
    });

    const content = document.getElementById('profile-tab-content');
    if (!content) return;

    if (tab === 'profile') {
      content.innerHTML = _tabProfile(d.profile, d.isMe);
    } else if (tab === 'trips') {
      content.innerHTML = _tabTrips(d.profile.uid);
    } else if (tab === 'gear') {
      content.innerHTML = '<div id="gear-tab-container"></div>';
      if (typeof GearModule !== 'undefined') {
        GearModule.init(d.profile.uid, d.isMe, document.getElementById('gear-tab-container'));
      }
    } else if (tab === 'medkit') {
      // Рендерим inline — шапка профиля остаётся, меняется только контент
      content.innerHTML = '<div id="p-medkit-inline"></div>';

      // Скрываем оригинальный #p-medkit и даём наш inline-контейнер то же имя
      const orig = document.getElementById('p-medkit');
      if (orig) orig.id = 'p-medkit-hidden';
      document.getElementById('p-medkit-inline').id = 'p-medkit';

      // Рендерим через реальную точку входа аптечки: rMedkit() рендерит
      // в #p-medkit по глобальному состоянию medkitMode/medkitMemberId
      // (MedkitIndex нигде в проекте не существует)
      if (typeof setMedkitMode === 'function') setMedkitMode('personal');
      if (typeof setMedkitMember === 'function') setMedkitMember(d.profile.uid);
      else if (typeof rMedkit === 'function') rMedkit();

      // Убираем собственный топбар аптечки — он дублирует шапку профиля
      document.getElementById('p-medkit')?.querySelector('.topbar')?.remove();

      // НЕ восстанавливаем id — пусть #p-medkit остаётся на inline-контейнере
      // пока активна эта вкладка. Восстановление происходит при следующем switchTab
    }
  }

  function _closeProfile() { MembersModule.init(); }

  /* ══════════════════════════════════════════════
     INVITE
  ══════════════════════════════════════════════ */
  function showInvite(tripId, tripName) {
    const base = window.location.href.split('?')[0].split('#')[0];
    const url = tripId ? `${base}?joinTrip=${encodeURIComponent(tripId)}` : base;
    const title = tripId ? `Пригласить в «${tripName || 'поездку'}»` : 'Пригласить участника';
    const desc = tripId
      ? 'Отправь ссылку — человек войдёт через Google или email и сразу попадёт в эту поездку.'
      : 'Отправь ссылку — участник войдёт через Google или email и появится в списке.';
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.id = 'invite-overlay';
    overlay.innerHTML = `
      <div class="profile-sheet">
        <div class="profile-grab"></div>
        <div class="profile-scroll">
          <div class="modal-title" style="margin-bottom:8px">${_esc(title)}</div>
          <p style="font-size:14px;color:var(--label3);margin-bottom:14px">
            ${_esc(desc)}
          </p>

          <div class="invite-email-label">Email человека — чтобы разрешить ему регистрацию</div>
          <input type="email" class="invite-email-input" id="invite-email-input" placeholder="friend@example.com" autocomplete="off">
          <button class="action-btn" data-action="invite-allow-email">Разрешить регистрацию</button>
          <div class="invite-email-status" id="invite-email-status"></div>

          <div class="invite-url">${_esc(url)}</div>
          <button class="action-btn" data-action="invite-copy">📋 Скопировать ссылку</button>
          <button class="picker-cancel" data-action="invite-close">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    overlay.addEventListener('click', e => {
      if (e.target === overlay) overlay.remove();
      const a = e.target.closest('[data-action]')?.dataset.action;
      if (a === 'invite-close') overlay.remove();
      if (a === 'invite-copy') {
        navigator.clipboard?.writeText(url).catch(()=>{});
        const btn = overlay.querySelector('[data-action="invite-copy"]');
        if (btn) { btn.textContent = '✓ Скопировано'; setTimeout(() => overlay.remove(), 1000); }
      }
      if (a === 'invite-allow-email') {
        const input  = overlay.querySelector('#invite-email-input');
        const status = overlay.querySelector('#invite-email-status');
        const email  = input?.value.trim();
        if (!email) return;
        MembersFirebase.addInvite(email).then(() => {
          if (status) status.textContent = `✓ ${email} теперь может зарегистрироваться`;
          if (input) input.value = '';
        }).catch(() => {
          if (status) status.textContent = 'Не получилось — попробуй ещё раз';
        });
      }
    });
  }

  /* ══════════════════════════════════════════════
     ДОБАВИТЬ УЖЕ ЗАРЕГИСТРИРОВАННОГО ЧЕЛОВЕКА В ПОЕЗДКУ
     (пикер прямо с его профиля — без ссылки, uid уже известен)
  ══════════════════════════════════════════════ */
  function showTripPicker(uid, name) {
    // Список — только поездки, где сам смотрящий (организатор, который
    // добавляет человека) уже участник: добавить куда-то ещё нельзя, там
    // просто негде взять на это право.
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getMine(window.APP?.user?.uid) : [])
      .filter(t => t.status !== 'done')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const rows = trips.length ? trips.map(t => {
      const already = (t.memberIds || []).includes(uid);
      return `
        <div class="trip-pick-row" data-action="${already ? '' : 'trip-pick-select'}" data-trip-id="${t.id}">
          <div>
            <div class="trip-pick-name">${_esc(t.name)}</div>
            <div class="trip-pick-dates">${_fmtDate(t.startDate)} – ${_fmtDate(t.endDate)}</div>
          </div>
          <div class="trip-pick-status">${already ? '✓ уже там' : ''}</div>
        </div>`;
    }).join('') : `<div style="padding:16px 0;color:var(--label3);font-size:14px;text-align:center">Нет открытых поездок</div>`;

    document.getElementById('trip-pick-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.id = 'trip-pick-overlay';
    overlay.innerHTML = `
      <div class="profile-sheet">
        <div class="profile-grab"></div>
        <div class="profile-scroll">
          <div class="modal-title" style="margin-bottom:8px">Добавить ${_esc(name || 'участника')} в поездку</div>
          <div class="trip-pick-list">${rows}</div>
          <button class="picker-cancel" data-action="trip-pick-close">Закрыть</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);

    overlay.addEventListener('click', e => {
      if (e.target === overlay) { overlay.remove(); return; }
      const row = e.target.closest('[data-action="trip-pick-select"]');
      if (row) {
        TripsData.addParticipant(row.dataset.tripId, { uid, name }).then(() => overlay.remove());
        return;
      }
      if (e.target.closest('[data-action="trip-pick-close"]')) overlay.remove();
    });
  }

  /* ── Helpers ── */
  function _fmtDate(d) {
    try { return new Date(d).toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' }); }
    catch (e) { return d; }
  }
  function _ageWord(n) {
    const mod10 = n % 10, mod100 = n % 100;
    if (mod10 === 1 && mod100 !== 11) return 'год';
    if ([2,3,4].includes(mod10) && ![12,13,14].includes(mod100)) return 'года';
    return 'лет';
  }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  return { renderList, showProfile, switchTab, showInvite, showTripPicker };
})();

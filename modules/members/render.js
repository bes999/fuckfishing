'use strict';
/* globals MembersFirebase, AuthActions, TG_BOT_USERNAME */

const MembersRender = (() => {

  const SWIM_LABELS = { none: 'Не умею', weak: 'Слабо', confident: 'Уверенно', pro: 'Профи' };
  const TICK_LABELS = { yes: 'Да', no: 'Нет', unknown: 'Не знаю' };

  // Группа крови по-русски: хранение не меняем (id 'AB−', 'O+' и т.п.),
  // только показ — «IV Rh−», «четвёртая отрицательная», мелко «AB−».
  const BLOOD_ROMAN = { O: 'I', A: 'II', B: 'III', AB: 'IV' };
  const BLOOD_ORD   = { I: 'первая', II: 'вторая', III: 'третья', IV: 'четвёртая' };
  function _bloodParts(id) {
    const m = /^(AB|A|B|O)\s*([+−-])$/.exec(String(id || '').trim());
    if (!m) return null;
    const roman = BLOOD_ROMAN[m[1]];
    const pos = m[2] === '+';
    return {
      short: `${roman} Rh${pos ? '+' : '−'}`,
      words: `${BLOOD_ORD[roman]} ${pos ? 'положительная' : 'отрицательная'}`,
      intl: id,
    };
  }

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

  // Значки мессенджеров — и для экстренных контактов, и для самого
  // владельца профиля (те же три поля wa/tg/max). skip — какие не рисовать
  // (в шапке профиля Telegram уже показан отдельной строкой «@ник»).
  function _msgrBadges(obj, skip) {
    if (!obj) return '';
    const s = skip || [];
    const badges = [];
    if (obj.wa && !s.includes('wa'))   badges.push(`<a class="msgr-badge msgr-wa" href="https://wa.me/${encodeURIComponent(obj.wa.replace(/\D/g,''))}" target="_blank" rel="noopener" aria-label="WhatsApp">${_msgrIcon('wa')}</a>`);
    if (obj.tg && !s.includes('tg'))   badges.push(`<a class="msgr-badge msgr-tg" href="https://t.me/${encodeURIComponent(obj.tg)}" target="_blank" rel="noopener" aria-label="Telegram">${_msgrIcon('tg')}</a>`);
    if (obj.max && !s.includes('max')) badges.push(`<a class="msgr-badge msgr-max" href="${_esc(_maxHref(obj.max))}" target="_blank" rel="noopener" aria-label="MAX">${_msgrIcon('max')}</a>`);
    if (!badges.length) return '';
    return `<div class="p-msgrs">${badges.join('')}</div>`;
  }

  /* ── Аватар: фото, если загружено, иначе инициалы. Старые эмодзи-аватары
     в данных не трогаем — просто больше не показываем их. ── */
  function initials(p) {
    const name = String(p?.displayName || '').trim();
    const words = name.split(/\s+/).filter(Boolean);
    let s = '';
    if (words.length >= 2) s = words[0][0] + words[1][0];
    else if (words.length === 1) s = words[0][0] + (p?.nickname ? String(p.nickname).trim()[0] || '' : '');
    return (s || '?').toUpperCase();
  }
  function avatarInner(p) {
    const a = p?.avatar;
    if (a && /^https?:\/\//.test(a)) return `<img src="${_esc(a)}" alt="">`;
    return _esc(initials(p));
  }
  function _ava(p, cls) {
    return `<span class="mb-ava ${cls || ''}">${avatarInner(p)}</span>`;
  }

  // «Пригласить» — в наборе Tabler (shared/tabler-icons.css) нет ti-user-plus,
  // рисуем тем же штрихом inline.
  const _USER_PLUS_SVG = '<svg class="mb-svg" viewBox="0 0 24 24" aria-hidden="true"><circle cx="10" cy="8" r="3.5"/><path d="M3.5 20a6.5 6.5 0 0 1 13 0M19 8v6M16 11h6"/></svg>';

  // Может ли текущий пользователь приглашать людей: организатор теперь
  // определяется по поездке (trip.ownerId) — достаточно создать хоть одну.
  function canInvite(uid) {
    if (!uid || typeof TripsData === 'undefined') return false;
    return AuthActions.isOrganizer() || TripsData.getAll().some(t => t.ownerId === uid);
  }

  /* ══════════════════════════════════════════════
     СПИСОК УЧАСТНИКОВ
  ══════════════════════════════════════════════ */
  function renderList(members, currentUid, canInv) {
    const el = document.getElementById('members-list');
    if (!el) return;

    // «Это ты» — первым, остальные в прежнем порядке (по createdAt).
    const sorted = [...members].sort((a, b) => (b.uid === currentUid) - (a.uid === currentUid));
    const rows = sorted.map(m => {
      const isMe = m.uid === currentUid;
      const sub = (m.role === 'organizer' ? 'админ' : 'участник') + (m.telegramId ? ' · Telegram привязан' : '');
      return `
        <button type="button" class="mb-person" data-action="member-open" data-uid="${_esc(m.uid)}">
          ${_ava(m, isMe ? 'mb-ava--me' : '')}
          <span class="mb-person-txt">
            <span class="mb-person-name">${_esc(m.displayName)}${m.nickname ? ` «${_esc(m.nickname)}»` : ''}${isMe ? '<span class="mb-me">это ты</span>' : ''}</span>
            <span class="mb-person-sub">${sub}</span>
          </span>
          <i class="ti ti-chevron-right mb-chev" aria-hidden="true"></i>
        </button>`;
    }).join('');

    el.innerHTML = `
      <header class="mb-list-head">
        <div class="mb-list-titles">
          <h1>Участники</h1>
          <p>${members.length} ${_plural(members.length, 'человек', 'человека', 'человек')} в приложении</p>
        </div>
        ${canInv ? `<button type="button" class="mb-icon-btn" data-action="member-invite" aria-label="Пригласить">${_USER_PLUS_SVG}</button>` : ''}
      </header>
      <div class="mb-body">
        <section class="mb-card mb-card--list">${rows}</section>
        <p class="mb-hint">Нажми на человека — медданные, экстренные контакты, поездки. Пригласить может организатор поездки.</p>
      </div>`;
  }

  /* ══════════════════════════════════════════════
     ПРОФИЛЬ
  ══════════════════════════════════════════════ */
  let _activeTab = 'profile';
  let _fromList = false;

  // opts.fromList — открыт из списка участников (назад → список);
  // opts.keepNav — перерисовка после правки, куда «назад» не меняется.
  async function showProfile(uid, currentUid, opts) {
    if (!opts?.keepNav) _fromList = !!opts?.fromList;
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
    // Прошлая вкладка «Покупки» могла держать подписку Firestore.
    if (typeof PurchasesRender !== 'undefined') PurchasesRender.destroy();

    // Правка чужого профиля — только у app-организатора (так разрешают
    // firestore.rules: members/{uid} update — сам или isOrganizer()).
    const canEdit = isMe || isOrg;
    pg.innerHTML = `
      <header class="mb-bar">
        <button type="button" class="mb-icon-btn" data-action="profile-back" aria-label="Назад">${UIUtils.ico('chevron-left')}</button>
        ${canEdit ? `<button type="button" class="mb-icon-btn" data-action="profile-edit" data-uid="${_esc(profile.uid)}" aria-label="Изменить профиль">${UIUtils.ico('pencil')}</button>` : ''}
      </header>
      <div class="mb-body mb-body--prof">
        ${_profileHeader(profile, isMe)}
        ${!isMe ? _profileActions(profile, isOrg) : ''}
        ${_subtabs(isMe)}
        <div id="profile-tab-content" class="mb-tab-content">
          ${_tabProfile(profile, isMe)}
        </div>
      </div>`;

    pg.querySelector('[data-action="profile-back"]')?.addEventListener('click', () => {
      if (typeof PurchasesRender !== 'undefined') PurchasesRender.destroy();
      if (_fromList && typeof MembersModule !== 'undefined') {
        MembersModule.showList(pg);
        return;
      }
      if (typeof AppNav !== 'undefined') AppNav.setActive('home');
      if (typeof AppRouter !== 'undefined') AppRouter.show('home');
      if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
    });

    pg._profileData = { profile, isMe, isOrg };
    _bindTab();
  }

  function _profileHeader(p, isMe) {
    const nick = p.nickname
      ? `«${_esc(p.nickname)}»`
      : (isMe ? `<span class="mb-nick-add" data-action="profile-edit" data-uid="${_esc(p.uid)}">+ ник</span>` : '');
    const tgName = p.tg || p.telegramUsername || '';
    const tgLine = tgName
      ? `<a class="mb-hero-tg" href="https://t.me/${encodeURIComponent(tgName)}" target="_blank" rel="noopener">${UIUtils.ico('brand-telegram')}@${_esc(tgName)}</a>`
      : '';
    const otherMsgrs = _msgrBadges(p, ['tg']);
    return `
      <section class="mb-hero">
        ${_ava(p, 'mb-ava--xl' + (isMe ? ' mb-ava--me' : ''))}
        <div class="mb-hero-txt">
          <span class="mb-hero-name">${_esc(p.displayName)}</span>
          <span class="mb-hero-sub">${[nick, p.role === 'organizer' ? 'админ' : 'участник'].filter(Boolean).join(' · ')}</span>
          ${p.phone ? `<a class="mb-hero-phone" href="tel:${_esc(p.phone.replace(/[^\d+]/g, ''))}">${_esc(p.phone)}</a>` : ''}
          ${tgLine || otherMsgrs ? `<span class="mb-hero-msgr">${tgLine}${otherMsgrs}</span>` : ''}
          ${p.email ? `<span class="mb-hero-mail">${_esc(p.email)}</span>` : ''}
        </div>
      </section>`;
  }

  function _subtabs(isMe) {
    const tabs = [{ id: 'profile', lbl: 'Здоровье' }, { id: 'trips', lbl: 'Поездки' }];
    // «Покупки» — только у себя: список полностью приватный (см.
    // firestore.rules personal_purchases).
    if (isMe) tabs.push({ id: 'purchases', lbl: 'Покупки' });
    return `<div class="mb-seg" role="tablist">
      ${tabs.map(t => `<button type="button" role="tab" class="mb-seg-btn${_activeTab === t.id ? ' active' : ''}" aria-selected="${_activeTab === t.id}" data-action="profile-tab" data-tab="${t.id}">${t.lbl}</button>`).join('')}
    </div>`;
  }

  /* ── Вкладка «Здоровье» (id 'profile' — на него ссылается index.html) ── */
  function _row(label, val, cls) {
    return `<div class="mb-row"><span class="mb-row-lbl">${label}</span><span class="mb-row-val ${cls || ''}">${val}</span></div>`;
  }

  function _tabProfile(p, isMe) {
    const b = _bloodParts(p.bloodType);
    const bloodHtml = `
      <div class="mb-blood">
        <span class="mb-blood-big">${b ? b.short : '—'}</span>
        <span class="mb-blood-txt">
          <span class="mb-blood-cap">Группа крови</span>
          <span class="mb-blood-words">${b ? b.words : 'не указана'}</span>
          ${b ? `<span class="mb-blood-cap">${_esc(b.intl)}</span>` : ''}
        </span>
      </div>`;

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

    const hw = [p.height ? p.height + ' см' : '', p.weight ? p.weight + ' кг' : ''].filter(Boolean).join(' / ');
    const DASH = ['—', 'muted'];
    const txt = v => v ? [_esc(v), ''] : DASH;
    const tickCls = p.tickVaccine === 'yes' ? 'green' : p.tickVaccine === 'no' ? 'red' : 'muted';

    const rows = [
      ['Рост / вес', ...(hw ? [hw, ''] : DASH)],
      age ? ['Возраст', age, ''] : null,
      ['Аллергии', ...(p.allergies ? [_esc(p.allergies), 'accent'] : DASH)],
      ['Хронические', ...txt(p.conditions)],
      ['Постоянные лекарства', ...txt(p.meds)],
      ['Прививка от клеща', ...(p.tickVaccine ? [_esc(TICK_LABELS[p.tickVaccine] || ''), tickCls] : ['не указано', 'muted'])],
      ['Плавание', ...(p.swim ? [_esc(SWIM_LABELS[p.swim] || ''), ''] : ['не указано', 'muted'])],
      ['Полис ОМС/ДМС', ...txt(p.insurance)],
      p.passportRf   ? ['Паспорт РФ до', _passportDateRu(p.passportRf),   _passportDateCls(p.passportRf)]   : null,
      p.passportIntl ? ['Загран до',     _passportDateRu(p.passportIntl), _passportDateCls(p.passportIntl)] : null,
    ].filter(Boolean).map(r => _row(r[0], r[1], r[2])).join('');

    const emergency = p.emergency || [];
    const emergHtml = emergency.length ? `
      <section class="mb-card mb-card--list" id="mb-emerg-list">
        ${emergency.map((c, i) => `
          <div class="mb-emerg"${isMe ? ` data-action="emerg-edit" data-idx="${i}"` : ''}>
            <div class="mb-emerg-info">
              <span class="mb-emerg-name">${_esc(c.name)}</span>
              <span class="mb-emerg-phone">${_esc(c.phone)}</span>
              ${_msgrBadges(c) || '<span class="mb-muted">мессенджеры не указаны</span>'}
            </div>
            <a class="mb-call" href="tel:${_esc(String(c.phone || '').replace(/[^\d+]/g, ''))}" aria-label="Позвонить">${UIUtils.ico('phone')}</a>
            ${isMe ? `<button type="button" class="mb-emerg-del" data-action="emerg-del" data-idx="${i}" aria-label="Удалить"></button>` : ''}
          </div>`).join('')}
      </section>`
      : `<p class="mb-empty">Не указаны</p>`;

    // Порядок по важности: медданные → экстренные контакты → ссылки на
    // личные разделы → аккаунт (разовая настройка, самая нижняя секция).
    return `
      <section class="mb-card mb-card--pad">
        ${bloodHtml}
        <div class="mb-rows">${rows}</div>
        <span class="mb-note">Видят все участники поездки — на случай, если что-то случится</span>
      </section>

      <h2 class="mb-sec">Экстренные контакты</h2>
      ${emergHtml}
      ${isMe ? `<button type="button" class="mb-text-btn" data-action="emerg-add">+ Добавить контакт</button>` : ''}
      ${isMe && emergency.length ? `<p class="mb-hint">Нажми на контакт — изменить · смахни влево — удалить</p>` : ''}

      ${isMe ? `
      <h2 class="mb-sec">Моё в приложении</h2>
      <section class="mb-card mb-card--links">
        ${_linkRow('Моя снаряга', 'шаблон и сумки', 'data-action="open-my-gear"')}
        ${_linkRow('Моя аптечка', 'в поездках', `data-action="open-medkit" data-uid="${_esc(p.uid)}"`)}
        ${_linkRow('Мои вкладки Гида', 'настроить', 'data-action="guide-tabs-personal"')}
      </section>

      <h2 class="mb-sec">Аккаунт</h2>
      <section class="mb-card mb-card--links">
        ${_tabTelegram(p)}
        <button type="button" class="mb-link mb-link--danger" data-action="auth-signout">Выйти из аккаунта</button>
      </section>` : `
      <h2 class="mb-sec">В приложении</h2>
      <section class="mb-card mb-card--links">
        ${_linkRow('Снаряга', 'посмотреть', 'data-action="profile-gear-view"')}
        ${_linkRow('Аптечка', 'посмотреть', `data-action="open-medkit" data-uid="${_esc(p.uid)}"`)}
      </section>`}`;
  }

  function _linkRow(label, val, attrs, valCls) {
    return `<button type="button" class="mb-link" ${attrs}>
      <span class="mb-link-lbl">${label}</span>
      <span class="mb-link-val ${valCls || ''}">${val}${UIUtils.ico('chevron-right')}</span>
    </button>`;
  }

  const TG_LINK_CODE_TTL_MS = 15 * 60 * 1000;

  // Код привязки больше не хранится в Firestore-профиле (см. modules/members/
  // firebase.js — createTelegramLinkCode/cancelTelegramLinkCode и разбор
  // причины в firestore.rules). Клиент и так знает код — сам его сгенерировал
  // — поэтому для отображения достаточно памяти вкладки, без чтения назад.
  // Сбрасывается при уходе со страницы профиля (setPendingTgCode(null) в
  // showProfile) — код всё равно живёт максимум 15 минут на сервере.
  let _pendingTgCode   = null;
  let _pendingTgCodeAt = null;
  function setPendingTgCode(code, at) {
    _pendingTgCode   = code || null;
    _pendingTgCodeAt = at   || null;
  }

  /* ══════════════════════════════════════════════
     TELEGRAM-БОТ (привязка аккаунта) — строка в карточке «Аккаунт»
  ══════════════════════════════════════════════ */
  function _tabTelegram(p) {
    // Привязан
    if (p.telegramId) {
      return `
      <div class="mb-link mb-link--static">
        <span class="mb-link-lbl">Telegram-бот</span>
        <span class="mb-link-val green">${p.telegramUsername ? `@${_esc(p.telegramUsername)} · ` : ''}привязан
          <button type="button" class="mb-tg-unlink" data-action="tg-unlink">Отвязать</button></span>
      </div>`;
    }

    // Код сгенерирован в этой же вкладке и ещё не протух
    const codeFresh = _pendingTgCode && _pendingTgCodeAt
      && (Date.now() - new Date(_pendingTgCodeAt).getTime() < TG_LINK_CODE_TTL_MS);
    if (codeFresh) {
      return `
      <div class="p-tg-code-card">
        <div class="p-tg-code">${_esc(_pendingTgCode)}</div>
        <div class="p-tg-code-hint">
          Отправь этот код боту
          <a class="p-tg-code-link" href="https://t.me/${TG_BOT_USERNAME}" target="_blank" rel="noopener">@${TG_BOT_USERNAME}</a>
          в течение 15 минут
        </div>
        <button type="button" class="p-tg-cancel" data-action="tg-cancel">Отменить</button>
      </div>`;
    }

    // Не привязан, кода нет (или протух)
    return _linkRow('Telegram-бот', 'привязать', 'data-action="tg-link"', 'accent');
  }

  /* ── Вкладка «Поездки» ──
     Полная история поездок владельца профиля, независимо от того, участвует
     ли в них сам смотрящий. Исключение — trip.private: скрыты от всех,
     кроме тех, кто сам в их memberIds. */
  function _tripsForProfile(profileUid) {
    const viewerUid = window.APP?.user?.uid;
    return (typeof TripsData !== 'undefined' ? TripsData.getAll() : [])
      .filter(t => (t.memberIds || []).includes(profileUid))
      .filter(t => !t.private || (t.memberIds || []).includes(viewerUid));
  }

  function _tripRow(t, past) {
    const exp = t.type === 'expedition';
    let status = 'прошла';
    if (!past) {
      if (t.status === 'active') status = 'идёт';
      else {
        const days = TripsData.daysUntil(t.startDate);
        status = days <= 0 ? 'сегодня' : days === 1 ? 'завтра' : `через ${days} ${_plural(days, 'день', 'дня', 'дней')}`;
      }
    }
    return `
      <button type="button" class="mb-trip${past ? ' past' : ''}" data-action="profile-trip-open" data-trip-id="${_esc(t.id)}">
        <span class="mb-trip-ico ${exp ? 'exp' : 'fish'}">${UIUtils.ico(TripsData.tripIcon(t))}</span>
        <span class="mb-trip-txt">
          <span class="mb-trip-name">${_esc(t.name)}</span>
          <span class="mb-trip-dates">${_fmtRange(t.startDate, t.endDate)}</span>
        </span>
        <span class="mb-trip-status">${status}</span>
      </button>`;
  }

  function _tabTrips(profileUid, isMe) {
    const trips = _tripsForProfile(profileUid);
    if (!trips.length) return `<p class="mb-empty">Поездок пока нет</p>`;

    const nExp = trips.filter(t => t.type === 'expedition').length;
    const nFish = trips.length - nExp;
    const ahead = trips.filter(t => t.status !== 'done')
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));
    const past = trips.filter(t => t.status === 'done')
      .sort((a, b) => new Date(b.startDate) - new Date(a.startDate));
    const byYear = {};
    past.forEach(t => { const y = String(t.startDate || '').slice(0, 4) || '—'; (byYear[y] = byYear[y] || []).push(t); });

    const parts = [];
    if (nExp) parts.push(`${nExp} ${_plural(nExp, 'экспедиция', 'экспедиции', 'экспедиций')}`);
    if (nFish) parts.push(`${nFish} ${_plural(nFish, 'рыбалка', 'рыбалки', 'рыбалок')}`);

    return `
      <p class="mb-trips-sum">${trips.length} ${_plural(trips.length, 'поездка', 'поездки', 'поездок')} · ${parts.join(', ')}</p>
      ${ahead.length ? `<span class="mb-cap">Впереди</span><section class="mb-card mb-card--list">${ahead.map(t => _tripRow(t, false)).join('')}</section>` : ''}
      ${Object.keys(byYear).sort((a, b) => b.localeCompare(a)).map(y => `
        <span class="mb-cap">${_esc(y)}</span>
        <section class="mb-card mb-card--list">${byYear[y].map(t => _tripRow(t, true)).join('')}</section>`).join('')}
      ${!isMe ? `<p class="mb-hint">Видны все поездки, кроме приватных</p>` : ''}`;
  }

  // Действия над чужим профилем. «+ В поездку» — тем, кто организует хоть
  // одну поездку (trip.ownerId). «Удалить» из приложения — только
  // app-организатору: members/{uid} delete в firestore.rules пока
  // разрешён только isOrganizer() (глобальная роль), иначе кнопка упадёт.
  function _profileActions(p, isOrg) {
    const me = window.APP?.user?.uid;
    const canAdd = canInvite(me);
    if (!canAdd && !isOrg) return '';
    return `<div class="mb-actions${canAdd && isOrg ? '' : ' single'}">
      ${canAdd ? `<button type="button" class="mb-btn mb-btn--accent" data-action="member-add-trip" data-uid="${_esc(p.uid)}" data-name="${_esc(p.displayName)}">+ В поездку</button>` : ''}
      ${isOrg ? `<button type="button" class="mb-btn mb-btn--danger" data-action="member-delete" data-uid="${_esc(p.uid)}">Удалить</button>` : ''}
    </div>`;
  }

  function _bindTab() {
    // Экстренные контакты: удаление — свайпом влево (кнопка под строкой).
    const list = document.getElementById('mb-emerg-list');
    if (list) UIUtils.swipeToDelete(list, '.mb-emerg', '.mb-emerg-del');
  }

  function switchTab(tab) {
    const prevTab = _activeTab;
    _activeTab = tab;
    const pg = document.getElementById('p-members');
    if (!pg) return;
    const d = pg._profileData;
    if (!d) return;

    // При уходе с "Покупки" — снимаем подписку на Firestore.
    if (prevTab === 'purchases' && typeof PurchasesRender !== 'undefined') PurchasesRender.destroy();

    pg.querySelectorAll('.mb-seg-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.tab === tab);
      b.setAttribute('aria-selected', b.dataset.tab === tab);
    });

    const content = document.getElementById('profile-tab-content');
    if (!content) return;

    if (tab === 'profile') {
      content.innerHTML = _tabProfile(d.profile, d.isMe);
      _bindTab();
    } else if (tab === 'trips') {
      content.innerHTML = _tabTrips(d.profile.uid, d.isMe);
    } else if (tab === 'gear') {
      // Снаряга чужого человека — на просмотр, прямо в профиле (своя
      // открывается полноценным разделом «Снаряга», см. open-my-gear).
      content.innerHTML = `<button type="button" class="mb-text-btn" data-action="profile-tab" data-tab="profile">${UIUtils.ico('chevron-left')} Здоровье</button><div id="gear-tab-container"></div>`;
      if (typeof GearModule !== 'undefined') {
        GearModule.init(d.profile.uid, d.isMe, document.getElementById('gear-tab-container'));
      }
    } else if (tab === 'purchases') {
      content.innerHTML = '<div id="pur-tab-container"></div>';
      if (typeof PurchasesRender !== 'undefined') {
        PurchasesRender.init(d.profile.uid, document.getElementById('pur-tab-container'));
      }
    }
  }

  // Аптечка человека — настоящий раздел «Аптечка» в личном режиме на его
  // uid (чужая — только просмотр, это решает сама аптечка: _canEditMedkit).
  function openMedkit(uid) {
    if (typeof onNavigate === 'function') onNavigate('medkit');
    else if (typeof AppRouter !== 'undefined') AppRouter.show('medkit');
    if (typeof setMedkitMember === 'function') setMedkitMember(uid);
    if (typeof setMedkitMode === 'function') setMedkitMode('personal');
  }

  /* ══════════════════════════════════════════════
     INVITE
  ══════════════════════════════════════════════ */
  async function showInvite(tripId, tripName) {
    const base = window.location.href.split('?')[0].split('#')[0];
    let url = tripId ? `${base}?joinTrip=${encodeURIComponent(tripId)}` : base;
    // Токен — случайная часть ссылки, хранится на самой поездке (см.
    // TripsData.ensureInviteToken/index.html _processJoinInvite). Раньше
    // ссылка несла только id поездки — не секрет и никогда не меняется,
    // так что её мог собрать кто угодно сам, а отозвать было нечем.
    // Реальная дыра, найдена внешним ревью 2026-09-27.
    if (tripId && typeof TripsData !== 'undefined') {
      try {
        const token = await TripsData.ensureInviteToken(tripId);
        if (token) url += `&t=${encodeURIComponent(token)}`;
      } catch (_) {}
    }
    const title = tripId ? `Пригласить в «${tripName || 'поездку'}»` : 'Пригласить участника';
    const desc = tripId
      ? 'Отправь ссылку — человек войдёт через Google или email и сразу попадёт в эту поездку.'
      : 'Отправь ссылку — участник войдёт через Google или email и появится в списке.';
    document.getElementById('invite-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.id = 'invite-overlay';
    overlay.innerHTML = `
      <div class="profile-sheet">
        <div class="profile-grab"></div>
        <div class="profile-scroll mb-sheet">
          <div class="mb-sheet-title">${_esc(title)}</div>
          <p class="mb-sheet-desc">${_esc(desc)}</p>

          <div class="mb-inv-link">
            <span class="mb-inv-url">${_esc(url)}</span>
            <button type="button" class="mb-inv-copy" data-action="invite-copy">Скопировать</button>
          </div>
          <button type="button" class="mb-text-btn" data-action="invite-qr">Показать QR-код</button>
          <div class="invite-qr-wrap" id="invite-qr-wrap" hidden></div>

          <div class="mb-inv-h">Email человека</div>
          <div class="mb-inv-sub">чтобы разрешить ему регистрацию</div>
          <input type="email" class="mb-input" id="invite-email-input" placeholder="friend@example.com" autocomplete="off">
          <button type="button" class="mb-btn mb-btn--outline" data-action="invite-allow-email">Разрешить регистрацию</button>
          <div class="invite-email-status" id="invite-email-status"></div>

          ${tripId && typeof TripsData !== 'undefined' ? `
          <div class="mb-inv-guest">
            <div class="mb-inv-h">Или гость без приложения</div>
            <input type="text" class="mb-input" id="invite-guest-input" placeholder="Имя гостя или несколько через запятую" autocomplete="off">
            <button type="button" class="mb-btn mb-btn--outline" data-action="invite-add-guest">Добавить гостя</button>
            <div class="invite-email-status" id="invite-guest-status"></div>
          </div>` : ''}

          <button type="button" class="picker-cancel" data-action="invite-close">Закрыть</button>
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
        if (btn) { btn.textContent = 'Скопировано'; btn.classList.add('copied'); }
      }
      if (a === 'invite-qr') {
        // QR грузится со стороннего сервиса — только по запросу, не сразу.
        const wrap = overlay.querySelector('#invite-qr-wrap');
        if (wrap) {
          if (!wrap.innerHTML) wrap.innerHTML = `<img class="invite-qr" src="https://api.qrserver.com/v1/create-qr-code/?size=220x220&data=${encodeURIComponent(url)}" alt="QR-код приглашения" width="150" height="150">`;
          wrap.hidden = !wrap.hidden;
        }
      }
      if (a === 'invite-allow-email') {
        const input  = overlay.querySelector('#invite-email-input');
        const status = overlay.querySelector('#invite-email-status');
        const email  = input?.value.trim();
        if (!email) return;
        MembersFirebase.addInvite(email).then(() => {
          if (status) status.innerHTML = `${UIUtils.ico('check')} ${_esc(email)} теперь может зарегистрироваться`;
          if (input) input.value = '';
        }).catch(() => {
          if (status) status.textContent = 'Не получилось — попробуй ещё раз';
        });
      }
      if (a === 'invite-add-guest') {
        const input  = overlay.querySelector('#invite-guest-input');
        const status = overlay.querySelector('#invite-guest-status');
        const names  = UIUtils.splitNames(input?.value);
        if (!names.length) return;
        TripsData.addGuestNames(tripId, names).then(() => {
          if (status) status.innerHTML = `${UIUtils.ico('check')} Добавлено: ${_esc(names.join(', '))}`;
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
    // Только незавершённые поездки, где смотрящий участник и может
    // приглашать: организатор (ownerId) или приглашения не ограничены.
    const me = window.APP?.user?.uid;
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getMine(me) : [])
      .filter(t => t.status !== 'done')
      .filter(t => TripsData.canManage(t) || !t.inviteRestricted)
      .sort((a, b) => new Date(a.startDate) - new Date(b.startDate));

    const rows = trips.length ? trips.map(t => {
      const already = (t.memberIds || []).includes(uid);
      const exp = t.type === 'expedition';
      return `
        <div class="mb-trip trip-pick-row"${already ? '' : ' data-action="trip-pick-select"'} data-trip-id="${_esc(t.id)}">
          <span class="mb-trip-ico ${exp ? 'exp' : 'fish'}">${UIUtils.ico(TripsData.tripIcon(t))}</span>
          <span class="mb-trip-txt">
            <span class="mb-trip-name">${_esc(t.name)}</span>
            <span class="mb-trip-dates">${_fmtRange(t.startDate, t.endDate)}</span>
          </span>
          <span class="mb-trip-status">${already ? UIUtils.ico('check') + ' уже там' : ''}</span>
        </div>`;
    }).join('') : `<p class="mb-empty">Нет открытых поездок, куда ты можешь добавлять людей</p>`;

    document.getElementById('trip-pick-overlay')?.remove();
    const overlay = document.createElement('div');
    overlay.className = 'profile-overlay';
    overlay.id = 'trip-pick-overlay';
    overlay.innerHTML = `
      <div class="profile-sheet">
        <div class="profile-grab"></div>
        <div class="profile-scroll mb-sheet">
          <div class="mb-sheet-title">Добавить ${_esc(name || 'участника')} в поездку</div>
          <section class="mb-card mb-card--list trip-pick-list">${rows}</section>
          <button type="button" class="picker-cancel" data-action="trip-pick-close">Закрыть</button>
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
  const MONTHS_GEN = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
  // «12–19 сентября», «28 сентября – 4 октября», «29 августа»
  function _fmtRange(s, e) {
    const a = new Date(String(s) + 'T00:00:00');
    if (isNaN(a)) return _esc(s || '');
    const b = e ? new Date(String(e) + 'T00:00:00') : a;
    if (isNaN(b) || +b === +a) return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
    if (a.getMonth() === b.getMonth() && a.getFullYear() === b.getFullYear()) {
      return `${a.getDate()}–${b.getDate()} ${MONTHS_GEN[a.getMonth()]}`;
    }
    return `${a.getDate()} ${MONTHS_GEN[a.getMonth()]} – ${b.getDate()} ${MONTHS_GEN[b.getMonth()]}`;
  }

  function _plural(n, one, few, many) {
    const m10 = n % 10, m100 = n % 100;
    if (m10 === 1 && m100 !== 11) return one;
    if (m10 >= 2 && m10 <= 4 && (m100 < 12 || m100 > 14)) return few;
    return many;
  }

  // Полная дата (с годом) для сроков действия документов. Тот же принцип
  // подсветки "скоро истекает", что и у дат в Инфо поездки
  // (modules/tripcover/index.js:_passportStatus).
  const _PASSPORT_WARN_DAYS = 90;
  function _passportDateRu(date) {
    if (!date) return '';
    const d = new Date(date + 'T00:00:00');
    return isNaN(d) ? _esc(date) : d.toLocaleDateString('ru');
  }
  function _passportDateCls(date) {
    if (!date) return '';
    const today = new Date().toISOString().slice(0, 10);
    if (date < today) return 'red';
    const warnBy = new Date(today);
    warnBy.setDate(warnBy.getDate() + _PASSPORT_WARN_DAYS);
    return date <= warnBy.toISOString().slice(0, 10) ? 'warn' : '';
  }
  function _ageWord(n) { return _plural(n, 'год', 'года', 'лет'); }

  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  return { renderList, showProfile, switchTab, showInvite, showTripPicker, openMedkit, canInvite, initials, avatarInner, setPendingTgCode };
})();

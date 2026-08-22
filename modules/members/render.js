'use strict';
/* globals MembersFirebase, AuthActions */

const MembersRender = (() => {

  const BLOOD_TYPES = [
    {id:'A+',ru:'II +'},{id:'A−',ru:'II −'},
    {id:'B+',ru:'III +'},{id:'B−',ru:'III −'},
    {id:'AB+',ru:'IV +'},{id:'AB−',ru:'IV −'},
    {id:'O+',ru:'I +'},{id:'O−',ru:'I −'},
  ];
  const AVATARS = ['🎣','🤙','🐟','🦈','😎','🧔','🏕️','🌊','🦅','🐻','🍺','🥃','👾','🎯','🐠','🦑','🐙','🏔️','🎿','🚤'];

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
          <div class="m-ava">${_esc(m.avatar||'🎣')}</div>
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
    const tripId = window.APP?.currentTripId;
    const [profile, catchStat, balance] = await Promise.all([
      MembersFirebase.getProfile(uid),
      MembersFirebase.getCatchStats(uid, tripId),
      MembersFirebase.getExpenseBalance(uid, tripId)
    ]);
    if (!profile) return;

    const isMe  = uid === currentUid;
    const isOrg = AuthActions.isOrganizer();
    _renderProfilePage(profile, catchStat, balance, isMe, isOrg);
  }

  function _renderProfilePage(profile, catchStat, balance, isMe, isOrg) {
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
        ${_profileHeader(profile)}
        ${_subtabs()}
        <div id="profile-tab-content">
          ${_tabProfile(profile, isMe)}
        </div>
        ${_profileActions(profile.uid, isMe, isOrg, profile.displayName)}
      </div>`;

    // Кнопка назад — на главную
    // TODO: hardcoded 'home' — revisit once nav redesign (hamburger) lands, see back-navigation should return to entry point
    pg.querySelector('[data-action="profile-back"]')?.addEventListener('click', () => {
      if (typeof AppNav !== 'undefined') AppNav.setActive('home');
      if (typeof AppRouter !== 'undefined') AppRouter.show('home');
      if (typeof HomeIndex !== 'undefined') HomeIndex.refresh();
    });

    // Сохраняем данные для переключения вкладок
    pg._profileData = { profile, catchStat, balance, isMe, isOrg };
  }

  function _profileHeader(p) {
    const roleLabel = p.role === 'organizer' ? 'Организатор' : 'Участник';
    return `
      <div class="p-header">
        <div class="p-ava-circle">${_esc(p.avatar||'🎣')}</div>
        <div>
          <div class="p-name">${_esc(p.displayName)}${p.nickname ? ` <span class="p-nickname">«${_esc(p.nickname)}»</span>` : ''}</div>
          ${p.email ? `<div class="p-meta">${_esc(p.email)}</div>` : ''}
          ${p.phone ? `<div class="p-meta">${_esc(p.phone)}</div>` : ''}
          <span class="p-badge ${p.role}">${roleLabel}</span>
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
          <div class="p-emerg-phone">${_esc(c.phone)}</div>
        </div>
        ${isMe ? `<div class="p-emerg-del" data-action="emerg-del" data-idx="${i}">×</div>` : ''}
      </div>`).join('');

    return `
      <div class="p-row"><span class="p-row-lbl">Группа крови</span>${bloodHtml}</div>
      ${hw ? `<div class="p-row"><span class="p-row-lbl">Рост / Вес</span><span class="p-row-val">${hw}</span></div>` : ''}
      ${age ? `<div class="p-row"><span class="p-row-lbl">Возраст</span><span class="p-row-val">${age}</span></div>` : ''}
      ${p.allergies ? `<div class="p-row"><span class="p-row-lbl">Аллергии</span><span class="p-row-val muted">${_esc(p.allergies)}</span></div>` : ''}
      ${p.conditions ? `<div class="p-row"><span class="p-row-lbl">Хронические</span><span class="p-row-val muted">${_esc(p.conditions)}</span></div>` : ''}

      ${isMe ? `
      <div class="p-medkit-btn" data-action="profile-medkit">
        <div>
          <div class="p-medkit-btn-title">💊 Личная аптечка</div>
          <div class="p-medkit-btn-sub">Мои лекарства</div>
        </div>
        <div class="p-medkit-chevron">›</div>
      </div>` : ''}

      <div class="p-emerg-title">Экстренные контакты</div>
      ${emergHtml}
      ${isMe ? `<div class="p-emerg-add" data-action="emerg-add">+ Добавить контакт</div>` : ''}`;
  }

  function _tabTrips(catchStat, balance) {
    return `
      <div class="p-trip-card">
        <div class="p-trip-header">
          <div>
            <div class="p-trip-name">🎣 Сахалин 2026</div>
            <div class="p-trip-dates">10–17 июня 2026</div>
          </div>
          <div class="p-trip-badge">Активная</div>
        </div>
        <div class="p-trip-stats">
          <div class="p-trip-stat">🐟 <span>${catchStat.total}</span> рыб</div>
          <div class="p-trip-stat">⚖️ <span>${catchStat.weight} кг</span></div>
          <div class="p-trip-stat">💰 <span>${balance.balance >= 0 ? '+' : ''}${balance.balance} ₽</span></div>
        </div>
      </div>
      <div class="p-trip-add" data-action="trip-new">+ Создать новую поездку</div>`;
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

  function _profileActions(uid, isMe, isOrg, name) {
    return `<div class="p-actions">
      ${isMe ? `<button class="p-btn-edit" data-action="profile-edit" data-uid="${uid}">✏️ Редактировать</button>` : ''}
      ${isMe ? `<button class="p-btn-out" data-action="auth-signout">Выйти</button>` : ''}
      ${!isMe ? `<button class="p-btn-edit" data-action="member-add-trip" data-uid="${uid}" data-name="${_esc(name)}">➕ В поездку</button>` : ''}
      ${!isMe && isOrg ? `<button class="p-btn-edit" data-action="profile-edit" data-uid="${uid}">✏️ Редактировать</button>` : ''}
      ${!isMe && isOrg ? `<button class="p-btn-del" data-action="member-delete" data-uid="${uid}" data-name="${_esc(uid)}">🗑️ Удалить</button>` : ''}
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
      content.innerHTML = _tabTrips(d.catchStat, d.balance);
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
    const trips = (typeof TripsData !== 'undefined' ? TripsData.getAll() : [])
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

'use strict';
/* globals db, storage, MembersFirebase, MembersRender, AuthActions, UIUtils */

// FIX: var вместо const — иначе TDZ при обращении к MembersModule внутри IIFE
var MembersModule = (() => {
  // FIX: closure-переменная вместо MembersModule._listenerBound —
  // внутри IIFE MembersModule ещё undefined, обращение к его свойствам падает
  let _listenerBound = false;
  let _unsub = null;

  const AVATARS = ['🎣','🤙','🐟','🦈','😎','🧔','🏕️','🌊','🦅','🐻','🍺','🥃','👾','🎯','🐠','🦑','🐙','🏔️','🎿','🚤'];
  const BLOOD_TYPES = [
    {id:'A+',ru:'II +'},{id:'A−',ru:'II −'},
    {id:'B+',ru:'III +'},{id:'B−',ru:'III −'},
    {id:'AB+',ru:'IV +'},{id:'AB−',ru:'IV −'},
    {id:'O+',ru:'I +'},{id:'O−',ru:'I −'},
  ];

  // FIX: _esc перенесён наверх — использовался в _editTabPersonal/_editTabMedical,
  // но был объявлен внутри if-блока, где в strict mode он недоступен снаружи
  function _esc(s) {
    return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/"/g,'&quot;');
  }

  // FIX: destroy перенесён наверх — был внутри if-блока, а возвращался снаружи
  function destroy() {
    if (_unsub) { _unsub(); _unsub = null; }
  }

  /* ── Init ──
     Реальный рендер ростера участников (карточки + кнопка "Пригласить").
     Это ТА функция, которую должна вызывать навигация для пункта
     "Участники" — в отличие от MembersRender.showProfile(uid, uid),
     который всегда открывает профиль (isMe всегда true при uid===uid).
     Экспонирована также как showList(el) — см. return ниже. */
  function init(el) {
    const pg = el || document.getElementById('p-members');
    if (!pg) return;

    pg.innerHTML = `
      <div class="topbar">
        <div class="topbar-left">
          <h1>Участники поездки</h1>
          <p>Сахалин 2026</p>
        </div>
      </div>
      <div id="members-list" style="padding-top:4px">
        <p style="padding:20px;color:var(--label3);font-size:14px">Загрузка…</p>
      </div>`;

    if (_unsub) _unsub();
    _unsub = MembersFirebase.subscribeMembers(members => {
      const profile = window.APP?.profile;
      if (!profile) return;
      MembersRender.renderList(members, profile.uid, profile.role === 'organizer');
    });
  }

  /* ══════════════════════════════════════════════
     EDIT SHEET
  ══════════════════════════════════════════════ */
  let _editUid = null;
  let _editTab = 'personal';
  // Черновик редактируемого профиля — живёт в памяти всё время, пока шит
  // открыт. Раньше его не было: каждое переключение вкладки заново дёргало
  // MembersFirebase.getProfile(), что отбрасывало все ещё не сохранённые
  // правки с других вкладок (не только с той, что открывали последней —
  // вообще все, накопленные за сессию редактирования).
  let _draftProfile = null;

  function _showEditSheet(uid, profile) {
    _editUid = uid;
    _editTab = 'personal';
    _draftProfile = Object.assign({}, profile);
    document.getElementById('edit-overlay')?.remove();

    const overlay = document.createElement('div');
    overlay.id = 'edit-overlay';
    overlay.className = 'ob-overlay';
    overlay.innerHTML = `
      <div class="ob-sheet">
        <div class="ob-grab"></div>
        <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 12px;flex-shrink:0;border-bottom:0.5px solid var(--sep2)">
          <button class="modal-close" data-action="edit-cancel" style="font-size:18px">×</button>
          <span style="font-size:17px;font-weight:700;color:var(--label)">Редактировать</span>
          <button class="save-btn" data-action="edit-save" data-uid="${uid}"
                  style="width:auto;padding:8px 16px;font-size:14px;margin:0">Сохранить</button>
        </div>
        <div style="display:flex;gap:5px;padding:10px 16px 0;flex-shrink:0">
          <button class="p-stab active" data-action="edit-tab" data-tab="personal">Личные</button>
          <button class="p-stab" data-action="edit-tab" data-tab="medical">Медданные</button>
        </div>
        <div class="ob-scroll" id="edit-body" style="padding-top:14px">
          ${_editTabPersonal(_draftProfile)}
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _bindEditMasks();
  }

  function _editTabPersonal(p) {
    return `
      <p class="ob-lbl" style="margin-top:0">Аватар</p>
      <div class="ob-avatar-preview" data-action="edit-avatar-open">
        <div class="ob-avatar-circle" id="edit-avatar-circle">${UIUtils.avatarHtml(p.avatar, '🎣')}</div>
        <div class="ob-avatar-change">Изменить ›</div>
      </div>
      <p class="ob-lbl">Имя</p>
      <input class="auth-input" id="edit-name" type="text"
             placeholder="Имя" value="${_esc(p.displayName||'')}">
      <p class="ob-lbl">Никнейм</p>
      <input class="auth-input" id="edit-nickname" type="text"
             placeholder="Необязательно" value="${_esc(p.nickname||'')}">
      <p class="ob-lbl">Дата рождения</p>
      <input class="auth-input" id="edit-birthday" type="text"
             placeholder="ДД.ММ.ГГГГ" inputmode="numeric" value="${_esc(p.birthday||'')}">
      <p class="ob-lbl">Телефон</p>
      <input class="auth-input" id="edit-phone" type="tel"
             placeholder="+7 (___) ___-__-__" value="${_esc(p.phone||'')}">`;
  }

  function _editTabMedical(p) {
    const bloodBtns = BLOOD_TYPES.map(b =>
      `<button class="ob-blood-btn${p.bloodType===b.id?' sel':''}" data-action="edit-blood" data-blood="${b.id}">
        <span class="ob-blood-intl">${b.id}</span>
        <span class="ob-blood-ru">${b.ru}</span>
       </button>`
    ).join('');
    return `
      <p class="ob-lbl" style="margin-top:0">Группа крови</p>
      <div class="ob-blood-grid">${bloodBtns}</div>
      <p class="ob-lbl">Рост и вес</p>
      <div class="ob-row2">
        <input class="auth-input" id="edit-height" type="text"
               placeholder="Рост, см" inputmode="numeric"
               value="${_esc(p.height||'')}" style="margin-bottom:0">
        <input class="auth-input" id="edit-weight" type="text"
               placeholder="Вес, кг" inputmode="numeric"
               value="${_esc(p.weight||'')}" style="margin-bottom:0">
      </div>
      <p class="ob-lbl" style="margin-top:14px">Аллергии</p>
      <input class="auth-input" id="edit-allergies" type="text"
             placeholder="Пенициллин, йод..." value="${_esc(p.allergies||'')}">
      <p class="ob-lbl">Хронические заболевания</p>
      <input class="auth-input" id="edit-conditions" type="text"
             placeholder="Необязательно" value="${_esc(p.conditions||'')}">`;
  }

  // Пикер аватара — раньше вся сетка эмодзи всегда торчала на весь экран
  // внутри самой формы; теперь как в современных профилях (Telegram/iOS):
  // большой кружок с текущим выбором + отдельный шит поверх, открывается
  // по тапу.
  function _sheetPickAvatar(current) {
    const avBtns = AVATARS.map(a =>
      `<button class="ob-av-btn${current===a?' sel':''}" data-action="edit-av-pick" data-av="${a}">${a}</button>`
    ).join('');
    return `
      <div class="ob-overlay" id="avatar-pick-overlay">
        <div class="ob-sheet" style="max-height:70vh">
          <div class="ob-grab"></div>
          <div style="display:flex;align-items:center;justify-content:space-between;padding:0 16px 12px;flex-shrink:0">
            <span style="font-size:17px;font-weight:700;color:var(--label)">Выбери аватар</span>
            <button class="modal-close" data-action="edit-avatar-close" style="font-size:18px">×</button>
          </div>
          <div class="ob-scroll">
            <button class="ob-avatar-upload-btn" data-action="edit-avatar-upload">
              <svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M23 19a2 2 0 01-2 2H3a2 2 0 01-2-2V8a2 2 0 012-2h4l2-3h6l2 3h4a2 2 0 012 2z"/><circle cx="12" cy="13" r="4"/></svg>
              Загрузить своё фото
            </button>
            <input type="file" id="avatar-file-input" accept="image/*" style="display:none">
            <div class="ob-avatar-upload-status" id="avatar-upload-status"></div>
            <div class="ob-avatar-grid">${avBtns}</div>
          </div>
        </div>
      </div>`;
  }

  // Сжимает фото в браузере до разумного размера перед загрузкой (профильная
  // картинка не нуждается в оригинальном разрешении телефонной камеры —
  // без сжатия это были бы мегабайты на ровном месте).
  function _compressImage(file, maxSize, quality) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        URL.revokeObjectURL(url);
        let { width, height } = img;
        if (width > height) { if (width > maxSize) { height = Math.round(height * maxSize / width); width = maxSize; } }
        else { if (height > maxSize) { width = Math.round(width * maxSize / height); height = maxSize; } }
        const canvas = document.createElement('canvas');
        canvas.width = width; canvas.height = height;
        canvas.getContext('2d').drawImage(img, 0, 0, width, height);
        canvas.toBlob(blob => blob ? resolve(blob) : reject(new Error('toBlob failed')), 'image/jpeg', quality);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('image load failed')); };
      img.src = url;
    });
  }

  async function _uploadAvatarPhoto(file) {
    // Снимаем "билет" на текущую сессию редактирования (сам объект-черновик,
    // не uid — тот же человек, открытый заново, тоже получает новый объект
    // в _showEditSheet). Если к моменту завершения загрузки открыта уже
    // другая сессия (эту отменили и открыли другой профиль / этот же
    // профиль заново), результат применять нельзя — иначе чужая или
    // просроченная фотка молча прилипает не в тот черновик.
    const sessionUid   = _editUid;
    const sessionDraft = _draftProfile;
    const status = document.getElementById('avatar-upload-status');
    if (status) status.textContent = 'Загружаю…';
    try {
      const blob = await _compressImage(file, 480, 0.82);
      const ref = storage.ref('avatars/' + sessionUid);
      await ref.put(blob, { contentType: 'image/jpeg' });
      const url = await ref.getDownloadURL();
      if (_draftProfile !== sessionDraft) return; // сессия сменилась, пока грузили — молча выходим
      _draftProfile.avatar = url;
      const circle = document.getElementById('edit-avatar-circle');
      if (circle) circle.innerHTML = UIUtils.avatarHtml(url);
      document.getElementById('avatar-pick-overlay')?.remove();
    } catch (err) {
      console.error('MembersModule._uploadAvatarPhoto:', err);
      if (_draftProfile === sessionDraft && status) {
        status.textContent = 'Не удалось загрузить — проверь соединение и попробуй ещё раз';
      }
    }
  }

  function _switchEditTab(tab) {
    if (!_draftProfile) return;
    // Собрать данные нужно с ВКЛАДКИ, КОТОРАЯ ЕЩЁ НА ЭКРАНЕ (prevTab) — не
    // с той, куда переключаемся, и обязательно в _draftProfile, а не в
    // заново запрошенный из Firestore объект: раньше здесь дёргался
    // MembersFirebase.getProfile() при каждом переключении, из-за чего
    // терялись все несохранённые правки, накопленные за сессию
    // редактирования (не только с последней открытой вкладки).
    const prevTab = _editTab;
    _editTab = tab;
    document.querySelectorAll('#edit-overlay .p-stab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    _collectCurrentEditData(_draftProfile, prevTab);
    const body = document.getElementById('edit-body');
    if (!body) return;
    body.innerHTML = tab === 'personal' ? _editTabPersonal(_draftProfile) : _editTabMedical(_draftProfile);
    if (tab === 'personal') _bindEditMasks();
  }

  function _collectCurrentEditData(profile, tab) {
    if ((tab || _editTab) === 'personal') {
      // Аватар в _draftProfile.avatar уже актуален — пишется сразу при
      // выборе в _sheetPickAvatar (см. action "edit-av-pick"), т.к. сама
      // сетка теперь живёт в отдельном шите и закрывается сразу после
      // клика, читать её из DOM здесь уже нечего.
      const name = document.getElementById('edit-name')?.value.trim();
      if (name) profile.displayName = name;
      profile.nickname = document.getElementById('edit-nickname')?.value.trim() ?? profile.nickname;
      profile.birthday = document.getElementById('edit-birthday')?.value.trim() || profile.birthday;
      const ph = document.getElementById('edit-phone')?.value.trim();
      profile.phone = (ph === '+7 (' || ph === '+7') ? '' : (ph || profile.phone);
    } else {
      const selBlood = document.querySelector('#edit-overlay .ob-blood-btn.sel');
      if (selBlood) profile.bloodType = selBlood.dataset.blood;
      profile.height     = document.getElementById('edit-height')?.value.trim()     || profile.height;
      profile.weight     = document.getElementById('edit-weight')?.value.trim()     || profile.weight;
      profile.allergies  = document.getElementById('edit-allergies')?.value.trim()  || profile.allergies;
      profile.conditions = document.getElementById('edit-conditions')?.value.trim() || profile.conditions;
    }
  }

  async function _saveEdit(uid) {
    const profile = _draftProfile;
    if (!profile) return;

    _collectCurrentEditData(profile);

    if (!profile.displayName?.trim()) {
      document.getElementById('edit-name')?.classList.add('field-error');
      return;
    }

    const changes = {
      displayName: profile.displayName,
      nickname:    profile.nickname  || '',
      avatar:      profile.avatar,
      birthday:    profile.birthday  || '',
      phone:       profile.phone     || '',
      bloodType:   profile.bloodType || '',
      height:      profile.height    || '',
      weight:      profile.weight    || '',
      allergies:   profile.allergies || '',
      conditions:  profile.conditions|| '',
    };

    await MembersFirebase.updateProfile(uid, changes);

    if (uid === window.APP?.profile?.uid) {
      Object.assign(window.APP.profile, changes);
      // Шапка показывает имя/аватар из window.APP.profile и не подписана
      // на изменения — без явного вызова она осталась бы со старыми
      // данными до перезагрузки или следующего входа в поездку.
      if (typeof AppHeader !== 'undefined') AppHeader.render();
    }

    _draftProfile = null;
    document.getElementById('edit-overlay')?.remove();
    document.getElementById('profile-overlay')?.remove();
    MembersRender.showProfile(uid, window.APP?.profile?.uid);
  }

  function _bindEditMasks() {
    const phone = document.getElementById('edit-phone');
    if (phone) {
      if (!phone.value) phone.value = '+7 (';
      phone.addEventListener('focus', () => {
        if (!phone.value || phone.value === '+7') phone.value = '+7 (';
        setTimeout(() => phone.setSelectionRange(phone.value.length, phone.value.length), 0);
      });
      phone.addEventListener('input', () => {
        let d = phone.value.replace(/\D/g,'');
        if (d.startsWith('7')||d.startsWith('8')) d = d.slice(1);
        d = d.slice(0,10);
        let out = '+7';
        if (d.length>0) out += ' (' + d.slice(0,3);
        if (d.length>=3) out += ') ';
        if (d.length>3)  out += d.slice(3,6);
        if (d.length>=6) out += '-'+d.slice(6,8);
        if (d.length>=8) out += '-'+d.slice(8,10);
        phone.value = out;
      });
      phone.addEventListener('keydown', e => {
        if (e.key==='Backspace' && phone.value.length<=4) e.preventDefault();
      });
    }

    const bday = document.getElementById('edit-birthday');
    if (bday) {
      bday.addEventListener('input', () => {
        let d = bday.value.replace(/\D/g,'').slice(0,8);
        let out = d;
        if (d.length>4) out = d.slice(0,2)+'.'+d.slice(2,4)+'.'+d.slice(4);
        else if (d.length>2) out = d.slice(0,2)+'.'+d.slice(2);
        bday.value = out;
      });
    }
  }

  /* ══════════════════════════════════════════════
     EVENTS
  ══════════════════════════════════════════════ */
  if (!_listenerBound) {
    _listenerBound = true;
    document.addEventListener('click', async e => {
      const t = e.target.closest('[data-action]');
      if (!t) return;
      const action = t.dataset.action;

      if (action === 'member-open') {
        const uid = t.dataset.uid;
        if (uid) MembersRender.showProfile(uid, window.APP?.profile?.uid);
      }

      if (action === 'profile-tab') {
        MembersRender.switchTab(t.dataset.tab);
      }

      if (action === 'member-invite') {
        MembersRender.showInvite();
      }

      if (action === 'member-add-trip') {
        const uid  = t.dataset.uid;
        const name = t.dataset.name;
        if (uid) MembersRender.showTripPicker(uid, name);
      }

      if (action === 'member-delete') {
        const uid  = t.dataset.uid;
        if (!uid) return;
        const profile = await MembersFirebase.getProfile(uid);
        const name = profile?.displayName || 'участника';
        const ok = await UIUtils.confirmSheet(`Удалить ${name} из списка участников?`, { okLabel: 'Удалить' });
        if (!ok) return;
        await UIUtils.withBusyButton(t, async () => {
          await MembersFirebase.deleteProfile(uid);
          document.getElementById('profile-overlay')?.remove();
        });
      }

      if (action === 'profile-medkit') {
        document.getElementById('profile-overlay')?.remove();
        const uid = window.APP?.profile?.uid || '';
        if (typeof AppRouter !== 'undefined') AppRouter.show('medkit');
        // Реальная точка входа аптечки — глобальная функция rMedkit(),
        // рендерящая в #p-medkit по состоянию medkitMode/medkitMemberId.
        // MedkitIndex нигде в проекте не определён.
        if (typeof setMedkitMode === 'function') setMedkitMode('personal');
        if (typeof setMedkitMember === 'function') setMedkitMember(uid);
        else if (typeof rMedkit === 'function') rMedkit();
      }

      if (action === 'profile-edit') {
        const uid = t.dataset.uid;
        const profile = await MembersFirebase.getProfile(uid);
        if (!profile) return;
        _showEditSheet(uid, profile);
      }

      if (action === 'edit-save') {
        await UIUtils.withBusyButton(t, () => _saveEdit(t.dataset.uid || _editUid));
      }

      if (action === 'edit-cancel') {
        _draftProfile = null;
        document.getElementById('edit-overlay')?.remove();
      }

      if (action === 'edit-tab') {
        _switchEditTab(t.dataset.tab);
      }

      if (action === 'edit-avatar-open') {
        document.getElementById('avatar-pick-overlay')?.remove();
        const div = document.createElement('div');
        div.innerHTML = _sheetPickAvatar(_draftProfile?.avatar);
        document.body.appendChild(div.firstElementChild);
        document.getElementById('avatar-file-input')?.addEventListener('change', e => {
          const file = e.target.files[0];
          if (file) _uploadAvatarPhoto(file);
        });
      }

      if (action === 'edit-avatar-upload') {
        document.getElementById('avatar-file-input')?.click();
      }

      if (action === 'edit-avatar-close') {
        document.getElementById('avatar-pick-overlay')?.remove();
      }

      if (action === 'edit-av-pick') {
        if (_draftProfile) _draftProfile.avatar = t.dataset.av;
        const circle = document.getElementById('edit-avatar-circle');
        if (circle) circle.innerHTML = UIUtils.avatarHtml(t.dataset.av);
        document.getElementById('avatar-pick-overlay')?.remove();
      }

      if (action === 'edit-blood') {
        document.querySelectorAll('#edit-overlay .ob-blood-btn').forEach(b => b.classList.remove('sel'));
        t.classList.add('sel');
      }

      if (action === 'emerg-add') {
        const name  = prompt('Имя и кем приходится (напр. Анна, жена)');
        if (!name?.trim()) return;
        const phone = prompt('Телефон');
        if (!phone?.trim()) return;
        const profile = window.APP?.profile;
        if (!profile) return;
        const emerg = [...(profile.emergency||[]), {name:name.trim(), phone:phone.trim()}];
        await MembersFirebase.updateProfile(profile.uid, {emergency:emerg});
        profile.emergency = emerg;
        const ov = document.getElementById('profile-overlay');
        if (ov?._profileData) { ov._profileData.profile.emergency = emerg; MembersRender.switchTab('profile'); }
      }

      if (action === 'emerg-del') {
        const idx = Number(t.dataset.idx);
        const profile = window.APP?.profile;
        if (!profile) return;
        const emerg = (profile.emergency||[]).filter((_,i) => i!==idx);
        await MembersFirebase.updateProfile(profile.uid, {emergency:emerg});
        profile.emergency = emerg;
        const ov = document.getElementById('profile-overlay');
        if (ov?._profileData) { ov._profileData.profile.emergency = emerg; MembersRender.switchTab('profile'); }
      }

      if (action === 'gear-add' || action === 'gear-del') {
        return;
      }

      if (action === 'tg-link') {
        const profile = window.APP?.profile;
        if (!profile) return;
        const buf = new Uint32Array(1);
        crypto.getRandomValues(buf);
        const code = String(buf[0] % 1000000).padStart(6, '0');
        try {
          await MembersFirebase.updateProfile(profile.uid, {
            telegramLinkCode: code,
            telegramLinkCodeAt: new Date().toISOString(),
          });
          MembersRender.showProfile(profile.uid, profile.uid);
        } catch (err) {
          alert('Не получилось сгенерировать код. Попробуй ещё раз.');
        }
      }

      if (action === 'tg-cancel') {
        const profile = window.APP?.profile;
        if (!profile) return;
        try {
          await MembersFirebase.updateProfile(profile.uid, {
            telegramLinkCode: null,
            telegramLinkCodeAt: null,
          });
          MembersRender.showProfile(profile.uid, profile.uid);
        } catch (err) {
          alert('Не получилось отменить привязку. Попробуй ещё раз.');
        }
      }

      if (action === 'tg-unlink') {
        const profile = window.APP?.profile;
        if (!profile) return;
        if (!confirm('Отвязать Telegram?')) return;
        try {
          await MembersFirebase.updateProfile(profile.uid, {
            telegramId: null,
            telegramUsername: null,
            telegramLinkCode: null,
            telegramLinkCodeAt: null,
          });
          MembersRender.showProfile(profile.uid, profile.uid);
        } catch (err) {
          alert('Не получилось отвязать Telegram. Попробуй ещё раз.');
        }
      }
    });
  }

  // showList — понятное публичное имя для рендера ростера (в стиле
  // XyzIndex.show(el) остальных модулей), алиас на init(). Добавлено для
  // будущей навигационной перепроводки "Участники" -> ростер, а не профиль.
  return { init, showList: init, destroy };
})();

'use strict';
/* globals db, MembersFirebase, MembersRender, AuthActions */

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

  /* ── Init ── */
  function init() {
    const pg = document.getElementById('p-members');
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

  function _showEditSheet(uid, profile) {
    _editUid = uid;
    _editTab = 'personal';
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
          ${_editTabPersonal(profile)}
        </div>
      </div>`;

    document.body.appendChild(overlay);
    _bindEditMasks();
  }

  function _editTabPersonal(p) {
    const avBtns = AVATARS.map(a =>
      `<button class="ob-av-btn${p.avatar===a?' sel':''}" data-action="edit-av" data-av="${a}">${a}</button>`
    ).join('');
    return `
      <p class="ob-lbl" style="margin-top:0">Аватар</p>
      <div class="ob-avatar-grid">${avBtns}</div>
      <p class="ob-lbl">Имя</p>
      <input class="auth-input" id="edit-name" type="text"
             placeholder="Имя или никнейм" value="${_esc(p.displayName||'')}">
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

  function _switchEditTab(tab) {
    _editTab = tab;
    document.querySelectorAll('#edit-overlay .p-stab').forEach(b =>
      b.classList.toggle('active', b.dataset.tab === tab));
    MembersFirebase.getProfile(_editUid).then(profile => {
      if (!profile) return;
      const body = document.getElementById('edit-body');
      if (!body) return;
      _collectCurrentEditData(profile);
      body.innerHTML = tab === 'personal' ? _editTabPersonal(profile) : _editTabMedical(profile);
      if (tab === 'personal') _bindEditMasks();
    });
  }

  function _collectCurrentEditData(profile) {
    if (_editTab === 'personal') {
      const selAv = document.querySelector('#edit-overlay .ob-av-btn.sel');
      if (selAv) profile.avatar = selAv.dataset.av;
      const name = document.getElementById('edit-name')?.value.trim();
      if (name) profile.displayName = name;
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
    const profile = await MembersFirebase.getProfile(uid);
    if (!profile) return;

    _collectCurrentEditData(profile);

    if (!profile.displayName?.trim()) {
      document.getElementById('edit-name')?.classList.add('field-error');
      return;
    }

    const changes = {
      displayName: profile.displayName,
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
    }

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

      if (action === 'member-delete') {
        const uid  = t.dataset.uid;
        if (!uid) return;
        const profile = await MembersFirebase.getProfile(uid);
        const name = profile?.displayName || 'участника';
        if (!confirm(`Удалить ${name} из списка участников?`)) return;
        await MembersFirebase.deleteProfile(uid);
        document.getElementById('profile-overlay')?.remove();
      }

      if (action === 'profile-medkit') {
        document.getElementById('profile-overlay')?.remove();
        const uid = window.APP?.profile?.uid || '';
        if (typeof AppRouter !== 'undefined') AppRouter.show('medkit');
        if (typeof AppNav !== 'undefined') AppNav.setActive('more');
        if (typeof MedkitIndex !== 'undefined') {
          if (typeof AppRouter !== 'undefined') AppRouter.show('medkit');
          MedkitIndex.show(document.getElementById('p-medkit'), uid);
        }
      }

      if (action === 'profile-edit') {
        const uid = t.dataset.uid;
        const profile = await MembersFirebase.getProfile(uid);
        if (!profile) return;
        _showEditSheet(uid, profile);
      }

      if (action === 'edit-save') {
        await _saveEdit(t.dataset.uid || _editUid);
      }

      if (action === 'edit-cancel') {
        document.getElementById('edit-overlay')?.remove();
      }

      if (action === 'edit-tab') {
        _switchEditTab(t.dataset.tab);
      }

      if (action === 'edit-av') {
        document.querySelectorAll('#edit-overlay .ob-av-btn').forEach(b => b.classList.remove('sel'));
        t.classList.add('sel');
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
    });
  }

  return { init, destroy };
})();

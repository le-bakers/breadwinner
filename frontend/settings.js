/* ============================================
   BreadWinner â€” Settings page JS
   ============================================ */
(function () {
  'use strict';

  const BW = window.BreadWinner || {};
  const Settings = BW.Settings; // getSettings, saveSettings, updateSetting, resetSettings, applySettings
  if (!Settings) return;

  // Alias inner function so we can reference it before the object literal is assigned.
  const api = {
    get: Settings.getSettings,
    update: Settings.updateSetting,
    reset: Settings.resetSettings
  };

  /* ---------- Render all controls from current settings ---------- */
  function renderFromSettings() {
    const s = api.get();

    document.querySelectorAll('#themeSegmented button').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.themeValue === s.theme);
    });
    document.querySelectorAll('#accentSwatches .avatar-swatch').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.accent === s.accentColor);
    });

    document.getElementById('reduceMotionToggle').checked = s.reduceMotion;
  }

  /* ---------- Appearance: emanating wave ripple ---------- */
  function emitWave(btn, colorOverride) {
    if (api.get().reduceMotion) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const rect = btn.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const radius = Math.hypot(Math.max(cx, window.innerWidth - cx), Math.max(cy, window.innerHeight - cy)) * 1.05;
    const color = colorOverride || getComputedStyle(document.documentElement).getPropertyValue('--primary').trim() || '#22C55E';
    for (let i = 0; i < 2; i++) {
      const ring = document.createElement('span');
      ring.className = 'settings-wave' + (i ? ' second' : '');
      ring.style.left = cx + 'px';
      ring.style.top = cy + 'px';
      ring.style.width = radius * 2 + 'px';
      ring.style.height = radius * 2 + 'px';
      ring.style.borderColor = color;
      document.body.appendChild(ring);
      ring.addEventListener('animationend', () => ring.remove());
    }
  }

  /* ---------- Appearance: theme ---------- */
  document.querySelectorAll('#themeSegmented button').forEach((btn) => {
    btn.addEventListener('click', () => {
      emitWave(btn);
      api.update('theme', btn.dataset.themeValue);
      renderFromSettings();
      if (BW.toast) BW.toast('Theme set to ' + btn.dataset.themeValue);
    });
  });

  /* ---------- Appearance: accent color ---------- */
  document.querySelectorAll('#accentSwatches .avatar-swatch').forEach((btn) => {
    btn.addEventListener('click', () => {
      api.update('accentColor', btn.dataset.accent);
      renderFromSettings();
      if (BW.toast) BW.toast('Accent color updated');
    });
  });

  /* ---------- Accessibility ---------- */
  document.getElementById('reduceMotionToggle').addEventListener('change', (e) => {
    api.update('reduceMotion', e.target.checked);
  });
  /* ---------- Export data ---------- */
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = {};
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('breadwinner_'))
          .forEach((k) => {
            const raw = localStorage.getItem(k);
            try { data[k] = JSON.parse(raw); } catch (e) { data[k] = raw; }
          });
      } catch (e) { /* storage unavailable */ }

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'breadwinner-data.json';
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      if (BW.toast) BW.toast('Data exported');
    });
  }

  /* ---------- Reset settings (keeps identity data) ---------- */
  const resetModal = BW.confirmModal(document.getElementById('resetSettingsModal'));
  document.getElementById('resetSettingsBtn').addEventListener('click', () => resetModal.open());
  document.getElementById('resetSettingsCancel').addEventListener('click', () => resetModal.close());
  document.getElementById('resetSettingsModal').addEventListener('click', (e) => {
    if (e.target.id === 'resetSettingsModal') resetModal.close();
  });
  document.getElementById('resetSettingsConfirm').addEventListener('click', () => {
    api.reset();
    renderFromSettings();
    resetModal.close();
    if (BW.toast) BW.toast('Settings reset to defaults');
  });

  /* ---------- Clear all local data (danger zone) ---------- */
  const clearModal = BW.confirmModal(document.getElementById('clearDataModal'));
  document.getElementById('clearDataBtn').addEventListener('click', () => clearModal.open());
  document.getElementById('clearDataCancel').addEventListener('click', () => clearModal.close());
  document.getElementById('clearDataModal').addEventListener('click', (e) => {
    if (e.target.id === 'clearDataModal') clearModal.close();
  });
  document.getElementById('clearDataConfirm').addEventListener('click', () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith('breadwinner_'))
        .forEach((k) => localStorage.removeItem(k));
    } catch (e) { /* storage unavailable */ }
    clearModal.close();
    window.location.href = 'signin.html';
  });

  /* ---------- Sign out ---------- */
  document.getElementById('signOutBtn').addEventListener('click', () => {
    if (BW.signOut) BW.signOut();
    window.location.href = 'signin.html';
  });

  renderFromSettings();
})();

/* ============================================
   Profile page JS (merged from profile.js)
   Only activates if the profile markup is present.
   ============================================ */
(function () {
  'use strict';

  const BW = window.BreadWinner || {};
  const STORAGE = BW.STORAGE || {
    name: 'breadwinner_user_name',
    email: 'breadwinner_user_email',
    avatarColor: 'breadwinner_avatar_color',
    memberSince: 'breadwinner_member_since'
  };
  const get = BW.safeGet || ((k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } });
  const set = BW.safeSet || ((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} });
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Helpers: initials + avatar color ---------- */
  const AVATAR_BG = {
    green: 'linear-gradient(135deg,#22C55E,#16A34A)',
    blue: 'linear-gradient(135deg,#3B82F6,#2563EB)',
    purple: 'linear-gradient(135deg,#A855F7,#9333EA)',
    orange: 'linear-gradient(135deg,#F97316,#EA580C)',
    pink: 'linear-gradient(135deg,#EC4899,#DB2777)'
  };

  function getInitials(name) {
    const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'JM';
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
    return first + last;
  }

  /* ---------- Elements ---------- */
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const fullNameError = document.getElementById('fullName-error');
  const emailError = document.getElementById('email-error');
  const profileForm = document.getElementById('profileForm');
  const editBtn = document.getElementById('editProfileBtn');
  const cancelBtn = document.getElementById('cancelProfileBtn');
  const formActions = document.getElementById('formActions');
  const saveBtn = document.getElementById('saveProfileBtn');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const avatarPreview = document.getElementById('avatarPreview');
  const memberSinceEl = document.getElementById('memberSince');
  const themeStatusEl = document.getElementById('themeStatus');
  const editableFields = [fullNameInput, emailInput];

  let snapshot = null; // values captured when Edit is clicked, restored on Cancel

  /* ---------- Render read-only summary + overview from real stored data only ---------- */
  function renderSummary() {
    const name = get(STORAGE.name, '');
    const email = get(STORAGE.email, '');
    summaryName.textContent = name || 'Your Name';
    summaryEmail.textContent = email || 'No email on file';

    if (avatarPreview && !get(STORAGE.photo, "")) avatarPreview.textContent = getInitials(name);

    if (BW.Settings && themeStatusEl) {
      const s = BW.Settings.getSettings();
      themeStatusEl.textContent = s.theme.charAt(0).toUpperCase() + s.theme.slice(1);
    }
  }
  function loadFieldsFromStorage() {
    fullNameInput.value = get(STORAGE.name, '');
    emailInput.value = get(STORAGE.email, '');
  }

  /* ---------- Avatar color swatches (always live, not gated by Edit mode) ---------- */
  const swatches = document.querySelectorAll('#avatarSwatches .avatar-swatch');
  swatches.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === get(STORAGE.avatarColor, 'green')));
  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      set(STORAGE.avatarColor, btn.dataset.color);
      swatches.forEach((b) => b.classList.toggle('active', b === btn));
      const bg = btn.dataset.bg || AVATAR_BG[btn.dataset.color] || AVATAR_BG.green;
      if (avatarPreview && !get(STORAGE.photo, "")) avatarPreview.style.background = bg;
      const navAvatarEl = document.querySelector('.avatar-circle');
      if (navAvatarEl && !get(STORAGE.photo, "")) navAvatarEl.style.background = bg;
      if (BW.Settings) BW.Settings.applySettings();
      if (BW.toast) BW.toast('Avatar color updated');
    });
  });

  /* ---------- Profile picture upload ---------- */
  const avatarUploadBtn = document.getElementById('avatarUploadBtn');
  const avatarUploadInput = document.getElementById('avatarUploadInput');
  const removePhotoBtn = document.getElementById('removePhotoBtn');

  // Center-crop to a square and downscale to a small JPEG so the data URL
  // fits comfortably in localStorage.
  function resizeImage(file, size) {
    return new Promise((resolve, reject) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => {
        const min = Math.min(img.width, img.height);
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
        URL.revokeObjectURL(url);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Could not read that image.'));
      };
      img.src = url;
    });
  }

  function applyPhotoToAvatar(el, photo) {
    if (!el) return;
    el.classList.toggle('avatar-photo', !!photo);
    if (photo) {
      el.style.background = 'url("' + photo + '") center / cover no-repeat';
      el.textContent = '';
    } else {
      el.style.background = AVATAR_BG[get(STORAGE.avatarColor, 'green')] || AVATAR_BG.green;
      el.textContent = getInitials(get(STORAGE.name, ''));
    }
  }

  function refreshAvatarPhoto() {
    const photo = get(STORAGE.photo, '');
    applyPhotoToAvatar(avatarPreview, photo);
    applyPhotoToAvatar(document.querySelector('.avatar-circle'), photo);
    const colorSection = document.getElementById('avatarColorSection');
    if (colorSection) colorSection.hidden = !!photo;
    if (removePhotoBtn) removePhotoBtn.hidden = !photo;
  }

  async function handleAvatarFile(file) {
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      if (BW.toast) BW.toast('Please choose an image file');
      return;
    }
    try {
      const dataUrl = await resizeImage(file, 256);
      if (!BW.safeSet(STORAGE.photo, dataUrl)) {
        if (BW.toast) BW.toast('Photo could not be stored');
        return;
      }
      refreshAvatarPhoto();
      if (BW.toast) BW.toast('Profile picture updated');
    } catch (err) {
      if (BW.toast) BW.toast('Could not read that image');
    }
  }

  if (avatarUploadBtn && avatarUploadInput) {
    avatarUploadBtn.addEventListener('click', () => avatarUploadInput.click());
    avatarUploadInput.addEventListener('change', () => {
      const file = avatarUploadInput.files && avatarUploadInput.files[0];
      avatarUploadInput.value = '';
      handleAvatarFile(file);
    });
  }
  if (removePhotoBtn) {
    removePhotoBtn.addEventListener('click', () => {
      BW.safeRemove(STORAGE.photo);
      refreshAvatarPhoto();
      if (BW.toast) BW.toast('Profile picture removed');
    });
  }
  refreshAvatarPhoto();
  /* ---------- Edit / Save / Cancel ---------- */
  function enterEditMode() {
    snapshot = {
      name: fullNameInput.value,
      email: emailInput.value,
    };
    editableFields.forEach((el) => { el.disabled = false; });
    formActions.hidden = false;
    updateSaveState();
    editBtn.hidden = true;
    fullNameInput.focus();
  }

  function exitEditMode() {
    editableFields.forEach((el) => { el.disabled = true; });
    formActions.hidden = true;
    editBtn.hidden = false;
    fullNameError.textContent = '';
    fullNameError.classList.remove('show');
    emailError.textContent = '';
    emailError.classList.remove('show');
    fullNameInput.classList.remove('invalid');
    emailInput.classList.remove('invalid');
  }

  function isDirty() {
    if (!snapshot) return false;
    return fullNameInput.value !== snapshot.name || emailInput.value !== snapshot.email;
  }

  function updateSaveState() {
    if (saveBtn) saveBtn.disabled = !isDirty();
  }

  function validate() {
    let valid = true;
    const name = fullNameInput.value.trim();
    const email = emailInput.value.trim();

    if (!name) {
      fullNameInput.classList.add('invalid');
      fullNameError.textContent = 'Full name is required.';
      fullNameError.classList.add('show');
      valid = false;
    } else {
      fullNameInput.classList.remove('invalid');
      fullNameError.textContent = '';
      fullNameError.classList.remove('show');
    }

    if (!EMAIL_PATTERN.test(email)) {
      emailInput.classList.add('invalid');
      emailError.textContent = 'Enter a valid email address.';
      emailError.classList.add('show');
      valid = false;
    } else {
      emailInput.classList.remove('invalid');
      emailError.textContent = '';
      emailError.classList.remove('show');
    }

    return valid;
  }

  /* ---------- Membership stamp: recorded on first visit, never re-fabricated ---------- */
  if (memberSinceEl) {
    let stamp = get(STORAGE.memberSince, '');
    if (!stamp) {
      stamp = new Date().toISOString();
      set(STORAGE.memberSince, stamp);
    }
    memberSinceEl.textContent = BW.formatDate
      ? BW.formatDate(stamp)
      : new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(stamp));
  }

  /* ---------- Wire up events ---------- */
  editableFields.forEach((el) => el.addEventListener('input', updateSaveState));
  if (editBtn) editBtn.addEventListener('click', enterEditMode);

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (snapshot) {
        fullNameInput.value = snapshot.name;
        emailInput.value = snapshot.email;
      }
      exitEditMode();
    });
  }

  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;

      set(STORAGE.name, fullNameInput.value.trim());
      set(STORAGE.email, emailInput.value.trim());

      renderSummary();
      exitEditMode();
      if (BW.toast) BW.toast('Profile saved');
    });
  }

  /* ---------- Keep the top-nav avatar in sync with the stored name ---------- */
  const navAvatar = document.querySelector('.avatar-circle');
  if (navAvatar) navAvatar.textContent = getInitials(get(STORAGE.name, ''));

  if (profileForm) {
    loadFieldsFromStorage();
    renderSummary();
    if (avatarPreview) avatarPreview.style.background = AVATAR_BG[get(STORAGE.avatarColor, 'green')] || AVATAR_BG.green;
    refreshAvatarPhoto();
  }
})();

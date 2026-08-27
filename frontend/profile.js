/* ============================================
   BreadWinner — Profile page JS
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

    if (avatarPreview) avatarPreview.textContent = getInitials(name);


    if (BW.Settings) {
      const s = BW.Settings.getSettings();
      themeStatusEl.textContent = s.theme.charAt(0).toUpperCase() + s.theme.slice(1);
    }
  }
  function loadFieldsFromStorage() {
    fullNameInput.value = get(STORAGE.name, '');
    emailInput.value = get(STORAGE.email, '');
  }


  /* ---------- Avatar color swatches (always live, not gated by Edit mode) ---------- */
  const swatches = document.querySelectorAll('.avatar-swatch');
  swatches.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === get(STORAGE.avatarColor, 'green')));
  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      set(STORAGE.avatarColor, btn.dataset.color);
      swatches.forEach((b) => b.classList.toggle('active', b === btn));
      const bg = AVATAR_BG[btn.dataset.color] || AVATAR_BG.green;
      if (avatarPreview) avatarPreview.style.background = bg;
      // Keep the navbar profile pill in sync immediately (shared.js covers other pages).
      const navAvatarEl = document.querySelector('.avatar-circle');
      if (navAvatarEl) navAvatarEl.style.background = bg;
      if (BW.Settings) BW.Settings.applySettings();
      if (BW.toast) BW.toast('Avatar color updated');
    });
  });

  /* ---------- Edit / Save / Cancel ---------- */
  function enterEditMode() {
    snapshot = {
      name: fullNameInput.value,
      email: emailInput.value,
    };
    editableFields.forEach((el) => { el.disabled = false; });
    formActions.hidden = false;
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

  loadFieldsFromStorage();
  renderSummary();
  if (avatarPreview) avatarPreview.style.background = AVATAR_BG[get(STORAGE.avatarColor, 'green')] || AVATAR_BG.green;
})();
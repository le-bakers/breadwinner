/* ============================================
   BreadWinner — Profile Page JS
   ============================================ */

(function () {
  'use strict';

  const BW = window.BreadWinner || {};
  const STORAGE = BW.STORAGE || {
    name: 'breadwinner_user_name',
    email: 'breadwinner_user_email',
    avatarColor: 'breadwinner_avatar_color',
    diagnosisConfirmed: 'breadwinner_diagnosis_confirmed',
    diagnosisDate: 'breadwinner_diagnosis_date',
    memberSince: 'breadwinner_member_since'
  };
  const get = BW.safeGet || ((k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } });
  const set = BW.safeSet || ((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} });
  const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  /* ---------- Elements ---------- */
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  const fullNameError = document.getElementById('fullName-error');
  const emailError = document.getElementById('email-error');
  const diagnosisToggle = document.getElementById('diagnosisToggle');
  const diagnosisDateGroup = document.getElementById('diagnosisDateGroup');
  const diagnosisDateInput = document.getElementById('diagnosisDate');
  const profileForm = document.getElementById('profileForm');
  const editBtn = document.getElementById('editProfileBtn');
  const cancelBtn = document.getElementById('cancelProfileBtn');
  const formActions = document.getElementById('formActions');
  const summaryName = document.getElementById('summaryName');
  const summaryEmail = document.getElementById('summaryEmail');
  const avatarPreview = document.getElementById('avatarPreview');
  const memberSinceEl = document.getElementById('memberSince');
  const diagnosisStatusEl = document.getElementById('diagnosisStatus');
  const themeStatusEl = document.getElementById('themeStatus');
  const editableFields = [fullNameInput, emailInput, diagnosisToggle, diagnosisDateInput];

  let snapshot = null; // values captured when Edit is clicked, restored on Cancel

  /* ---------- Render read-only summary + stats from real stored data only ---------- */
  function renderSummary() {
    const name = get(STORAGE.name, '');
    const email = get(STORAGE.email, '');
    summaryName.textContent = name || 'Your Name';
    summaryEmail.textContent = email || 'No email on file';

    const confirmed = get(STORAGE.diagnosisConfirmed, 'false') === 'true';
    diagnosisStatusEl.textContent = confirmed ? 'Physician-confirmed' : 'Not set';

    if (BW.Settings) {
      const s = BW.Settings.getSettings();
      themeStatusEl.textContent = s.theme.charAt(0).toUpperCase() + s.theme.slice(1);
    }
  }

  function loadFieldsFromStorage() {
    fullNameInput.value = get(STORAGE.name, '');
    emailInput.value = get(STORAGE.email, '');
    diagnosisToggle.checked = get(STORAGE.diagnosisConfirmed, 'false') === 'true';
    diagnosisDateInput.value = get(STORAGE.diagnosisDate, '');
    syncDiagnosisDateVisibility();
  }

  function syncDiagnosisDateVisibility() {
    diagnosisDateGroup.classList.toggle('collapsed', !diagnosisToggle.checked);
  }

  /* ---------- Avatar color swatches (always live — not gated by Edit mode) ---------- */
  const swatches = document.querySelectorAll('.avatar-swatch');
  swatches.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === get(STORAGE.avatarColor, 'green')));
  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      swatches.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      set(STORAGE.avatarColor, btn.dataset.color);
      if (BW.Settings) BW.Settings.applySettings();
      if (BW.toast) BW.toast('Avatar color updated');
    });
  });

  /* ---------- Edit / Save / Cancel ---------- */
  function enterEditMode() {
    snapshot = {
      name: fullNameInput.value,
      email: emailInput.value,
      diagnosis: diagnosisToggle.checked,
      diagnosisDate: diagnosisDateInput.value
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

  if (editBtn) editBtn.addEventListener('click', enterEditMode);

  if (cancelBtn) {
    cancelBtn.addEventListener('click', () => {
      if (snapshot) {
        fullNameInput.value = snapshot.name;
        emailInput.value = snapshot.email;
        diagnosisToggle.checked = snapshot.diagnosis;
        diagnosisDateInput.value = snapshot.diagnosisDate;
        syncDiagnosisDateVisibility();
      }
      exitEditMode();
    });
  }

  if (diagnosisToggle) diagnosisToggle.addEventListener('change', syncDiagnosisDateVisibility);

  if (profileForm) {
    profileForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (!validate()) return;

      set(STORAGE.name, fullNameInput.value.trim());
      set(STORAGE.email, emailInput.value.trim());
      set(STORAGE.diagnosisConfirmed, String(diagnosisToggle.checked));
      set(STORAGE.diagnosisDate, diagnosisDateInput.value);

      if (BW.Settings) BW.Settings.applySettings();
      renderSummary();
      exitEditMode();
      if (BW.toast) BW.toast('Profile saved');
    });
  }

  /* ---------- Member since (stamped on first visit, never re-fabricated) ---------- */
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

  loadFieldsFromStorage();
  renderSummary();
})();

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

  /* ---------- Prefill form fields from localStorage ---------- */
  const fullNameInput = document.getElementById('fullName');
  const emailInput = document.getElementById('email');
  if (fullNameInput) fullNameInput.value = get(STORAGE.name, '');
  if (emailInput) emailInput.value = get(STORAGE.email, '');

  /* ---------- Avatar color swatches ---------- */
  const swatches = document.querySelectorAll('.avatar-swatch');
  const avatarPreview = document.getElementById('avatarPreview');
  const activeColor = get(STORAGE.avatarColor, 'green');
  swatches.forEach((btn) => btn.classList.toggle('active', btn.dataset.color === activeColor));

  swatches.forEach((btn) => {
    btn.addEventListener('click', () => {
      swatches.forEach((b) => b.classList.remove('active'));
      btn.classList.add('active');
      set(STORAGE.avatarColor, btn.dataset.color);
      if (avatarPreview) avatarPreview.style.background = getComputedStyle(btn).background;
      if (BW.applySitewideSettings) BW.applySitewideSettings();
    });
  });

  /* ---------- Identity form ---------- */
  const identityForm = document.getElementById('identityForm');
  if (identityForm) {
    identityForm.addEventListener('submit', (e) => {
      e.preventDefault();
      set(STORAGE.name, fullNameInput.value.trim());
      set(STORAGE.email, emailInput.value.trim());
      if (BW.applySitewideSettings) BW.applySitewideSettings();
      if (BW.toast) BW.toast('Profile saved');
    });
  }

  /* ---------- Diagnosis form ---------- */
  const diagnosisToggle = document.getElementById('diagnosisToggle');
  const diagnosisDateGroup = document.getElementById('diagnosisDateGroup');
  const diagnosisDateInput = document.getElementById('diagnosisDate');
  const diagnosisForm = document.getElementById('diagnosisForm');

  function syncDiagnosisUI() {
    if (!diagnosisDateGroup) return;
    diagnosisDateGroup.classList.toggle('collapsed', !diagnosisToggle.checked);
  }

  if (diagnosisToggle) {
    diagnosisToggle.checked = get(STORAGE.diagnosisConfirmed, 'false') === 'true';
    syncDiagnosisUI();
    diagnosisToggle.addEventListener('change', syncDiagnosisUI);
  }
  if (diagnosisDateInput) {
    diagnosisDateInput.value = get(STORAGE.diagnosisDate, '');
  }
  if (diagnosisForm) {
    diagnosisForm.addEventListener('submit', (e) => {
      e.preventDefault();
      set(STORAGE.diagnosisConfirmed, String(diagnosisToggle.checked));
      set(STORAGE.diagnosisDate, diagnosisDateInput.value);
      if (BW.toast) BW.toast('Diagnosis info saved');
    });
  }

  /* ---------- Member since (first visit gets stamped once) ---------- */
  const memberSinceEl = document.getElementById('memberSince');
  if (memberSinceEl) {
    let stamp = get(STORAGE.memberSince, '');
    if (!stamp) {
      stamp = new Date().toISOString();
      set(STORAGE.memberSince, stamp);
    }
    memberSinceEl.textContent = new Intl.DateTimeFormat('en-US', { month: 'long', year: 'numeric' }).format(new Date(stamp));
  }
})();

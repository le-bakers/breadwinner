/* ============================================
   BreadWinner — Settings page JS
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

    document.getElementById('notifToggle').checked = s.notifications.reminders;
    document.getElementById('matchToggle').checked = s.notifications.matchConfirmations;
    document.getElementById('reduceMotionToggle').checked = s.reduceMotion;
    document.getElementById('currencySelect').value = s.currency;
    document.getElementById('dateFormatSelect').value = s.dateFormat;
  }

  /* ---------- Appearance: theme ---------- */
  document.querySelectorAll('#themeSegmented button').forEach((btn) => {
    btn.addEventListener('click', () => {
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

  /* ---------- Notifications ---------- */
  document.getElementById('notifToggle').addEventListener('change', (e) => {
    api.update('notifications.reminders', e.target.checked);
  });
  document.getElementById('matchToggle').addEventListener('change', (e) => {
    api.update('notifications.matchConfirmations', e.target.checked);
  });

  /* ---------- Preferences ---------- */
  document.getElementById('currencySelect').addEventListener('change', (e) => {
    api.update('currency', e.target.value);
    if (BW.toast) BW.toast('Currency set to ' + e.target.value);
  });
  document.getElementById('dateFormatSelect').addEventListener('change', (e) => {
    api.update('dateFormat', e.target.value);
    if (BW.toast) BW.toast('Date format updated');
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
    window.location.href = 'signin.html';
  });

  renderFromSettings();
})();
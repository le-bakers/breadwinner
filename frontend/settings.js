/* ============================================
   BreadWinner — Settings Page JS
   ============================================ */

(function () {
  'use strict';

  const BW = window.BreadWinner || {};
  const STORAGE = BW.STORAGE || { theme: 'breadwinner_theme', notifications: 'breadwinner_notifications' };
  const get = BW.safeGet || ((k, f) => { try { const v = localStorage.getItem(k); return v === null ? f : v; } catch (e) { return f; } });
  const set = BW.safeSet || ((k, v) => { try { localStorage.setItem(k, v); } catch (e) {} });

  /* ---------- Theme segmented control ---------- */
  const themeButtons = document.querySelectorAll('#themeSegmented button');
  function syncThemeButtons() {
    const current = get(STORAGE.theme, 'system');
    themeButtons.forEach((btn) => btn.classList.toggle('active', btn.dataset.themeValue === current));
  }
  syncThemeButtons();
  themeButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      const value = btn.dataset.themeValue;
      if (BW.setTheme) BW.setTheme(value);
      else set(STORAGE.theme, value);
      syncThemeButtons();
      if (BW.toast) BW.toast('Theme set to ' + value);
    });
  });

  /* ---------- Notification toggles ---------- */
  const notifToggle = document.getElementById('notifToggle');
  const matchToggle = document.getElementById('matchToggle');
  const MATCH_KEY = 'breadwinner_match_confirmations';

  if (notifToggle) {
    notifToggle.checked = get(STORAGE.notifications, 'on') !== 'off';
    notifToggle.addEventListener('change', () => {
      set(STORAGE.notifications, notifToggle.checked ? 'on' : 'off');
      if (BW.applySitewideSettings) BW.applySitewideSettings();
    });
  }
  if (matchToggle) {
    matchToggle.checked = get(MATCH_KEY, 'on') !== 'off';
    matchToggle.addEventListener('change', () => {
      set(MATCH_KEY, matchToggle.checked ? 'on' : 'off');
    });
  }

  /* ---------- Export data ---------- */
  const exportBtn = document.getElementById('exportDataBtn');
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      const data = {};
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('breadwinner_'))
          .forEach((k) => { data[k] = localStorage.getItem(k); });
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

  /* ---------- Clear local data (danger zone) ---------- */
  const clearModal = document.getElementById('clearDataModal');
  const clearBtn = document.getElementById('clearDataBtn');
  const clearCancel = document.getElementById('clearDataCancel');
  const clearConfirm = document.getElementById('clearDataConfirm');
  const modal = BW.confirmModal ? BW.confirmModal(clearModal) : {
    open() { clearModal.hidden = false; },
    close() { clearModal.hidden = true; }
  };

  if (clearBtn) clearBtn.addEventListener('click', () => modal.open());
  if (clearCancel) clearCancel.addEventListener('click', () => modal.close());
  if (clearModal) {
    clearModal.addEventListener('click', (e) => { if (e.target === clearModal) modal.close(); });
  }
  if (clearConfirm) {
    clearConfirm.addEventListener('click', () => {
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('breadwinner_'))
          .forEach((k) => localStorage.removeItem(k));
      } catch (e) { /* storage unavailable */ }
      modal.close();
      window.location.href = 'signin.html';
    });
  }

  /* ---------- Sign out ---------- */
  const signOutBtn = document.getElementById('signOutBtn');
  if (signOutBtn) {
    signOutBtn.addEventListener('click', () => {
      window.location.href = 'signin.html';
    });
  }
})();

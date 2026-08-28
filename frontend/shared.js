/* ============================================
   BreadWinner — Shared JS
   Nav toggle, scroll shadow, ripple, reveal-on-scroll
   ============================================ */

(function () {
  'use strict';

  // Navbar shadow on scroll
  const navbar = document.querySelector('.navbar');
  if (navbar) {
    const onScroll = () => {
      navbar.classList.toggle('scrolled', window.scrollY > 8);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
  }

  // Mobile menu toggle
  const navToggle = document.querySelector('.nav-toggle');
  const mobileMenu = document.querySelector('.mobile-menu');
  if (navToggle && mobileMenu) {
    navToggle.addEventListener('click', () => {
      const open = navToggle.classList.toggle('open');
      mobileMenu.classList.toggle('open', open);
      navToggle.setAttribute('aria-expanded', String(open));
      document.body.style.overflow = open ? 'hidden' : '';
    });
    mobileMenu.querySelectorAll('a').forEach((link) => {
      link.addEventListener('click', () => {
        navToggle.classList.remove('open');
        mobileMenu.classList.remove('open');
        navToggle.setAttribute('aria-expanded', 'false');
        document.body.style.overflow = '';
      });
    });
  }

  // Button ripple effect
  document.querySelectorAll('.btn').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      const size = Math.max(rect.width, rect.height);
      ripple.className = 'ripple';
      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = (e.clientX - rect.left - size / 2) + 'px';
      ripple.style.top = (e.clientY - rect.top - size / 2) + 'px';
      btn.appendChild(ripple);
      setTimeout(() => ripple.remove(), 620);
    });
  });

  // Scroll reveal via IntersectionObserver
  const revealEls = document.querySelectorAll('.reveal, .reveal-scale');
  if (revealEls.length) {
    if ('IntersectionObserver' in window) {
      const io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('in-view');
              io.unobserve(entry.target);
            }
          });
        },
        { threshold: 0.15, rootMargin: '0px 0px -60px 0px' }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('in-view'));
    }
  }

  // Expose a small helper for staggering children reveal
  window.BreadWinner = window.BreadWinner || {};
  window.BreadWinner.staggerReveal = function (selector, baseDelay = 90) {
    document.querySelectorAll(selector).forEach((el, i) => {
      el.style.transitionDelay = (i * baseDelay) + 'ms';
    });
  };
})();

/* ============================================
   Identity + Sitewide Settings + UI helpers
   (used by home.html and settings.html)
   ============================================ */
window.BreadWinner = window.BreadWinner || {};
(function (BW) {
  'use strict';

  /* ---------- Safe localStorage wrappers ---------- */
  BW.safeGet = function (key, fallback) {
    try { const v = localStorage.getItem(key); return v === null ? fallback : v; }
    catch (e) { return fallback; }
  };
  BW.safeSet = function (key, value) {
    try { localStorage.setItem(key, value); return true; }
    catch (e) { return false; }
  };
  BW.safeRemove = function (key) {
    try { localStorage.removeItem(key); return true; } catch (e) { return false; }
  };

  /* ---------- Identity ("who you are") ---------- */
  BW.STORAGE = {
    name: 'breadwinner_user_name',
    email: 'breadwinner_user_email',
    avatarColor: 'breadwinner_avatar_color',
    memberSince: 'breadwinner_member_since',
    session: 'breadwinner_session'
  };

  /* ---------- Session ("are you signed in?") ---------- */
  BW.isSignedIn = function () {
    return !!BW.safeGet(BW.STORAGE.session, '');
  };
  BW.signIn = function (details) {
    return BW.safeSet(BW.STORAGE.session, JSON.stringify(Object.assign({ at: Date.now() }, details || {})));
  };
  BW.signOut = function () {
    return BW.safeRemove(BW.STORAGE.session);
  };
  // When signed in, every "Sign In" / "Start Free" link points to the dashboard
  // instead of the sign-in page (navbars, mobile menus, footers on all pages).
  if (BW.isSignedIn()) {
    document.querySelectorAll('a[href="signin.html"]').forEach((a) => { a.setAttribute('href', 'home.html'); });
  }
  /* ---------- Sitewide Settings (persisted under breadwinner_settings) ---------- */
  const SETTINGS_KEY = 'breadwinner_settings';
  const SETTINGS_DEFAULTS = {
    theme: 'light',              // light | dark | system
    accentColor: 'green',        // key into ACCENT_COLORS
    notifications: {
      reminders: true,
      matchConfirmations: false
    },
    currency: 'USD',             // USD | EUR | GBP | CAD | AUD
    dateFormat: 'MDY',           // MDY | DMY | ISO
    reduceMotion: false
  };
  const ACCENT_COLORS = {
    green: ['#22C55E', '#16A34A'],
    blue: ['#3B82F6', '#2563EB'],
    purple: ['#A855F7', '#9333EA'],
    orange: ['#F97316', '#EA580C'],
    pink: ['#EC4899', '#DB2777']
  };
// Full accent "scheme" so switching a swatch recolors the whole UI,
  // not just --primary. RGB is used for translucent glows/shadows.
  const ACCENT_LIGHT = {
    green: '#DCFCE7',
    blue: '#DBEAFE',
    purple: '#F3E8FF',
    orange: '#FFEDD5',
    pink: '#FCE7F3'
  };
  const ACCENT_RGB = {
    green: '34, 197, 94',
    blue: '59, 130, 246',
    purple: '168, 85, 247',
    orange: '249, 115, 22',
    pink: '236, 72, 153'
  };
  // Deepest end of each accent used in large hero banners/gradients.
  const ACCENT_DEEP = {
    green: '#14532D',
    blue: '#1E3A8A',
    purple: '#4C1D95',
    orange: '#7C2D12',
    pink: '#831843'
  };
  // Avatar gradient mirrors the accent pair (keeps the two swatch sets in sync).
  const avatarGradient = (color) => {
    const pair = ACCENT_COLORS[color] || ACCENT_COLORS.green;
    return 'linear-gradient(135deg,' + pair[0] + ',' + pair[1] + ')';
  };
  const CURRENCY_SYMBOLS = { USD: '$', EUR: '\u20AC', GBP: '\u00A3', CAD: 'CA$', AUD: 'AU$' };

  function deepMerge(base, patch) {
    const out = Array.isArray(base) ? base.slice() : Object.assign({}, base);
    if (!patch || typeof patch !== 'object') return out;
    Object.keys(patch).forEach((k) => {
      const v = patch[k];
      if (v && typeof v === 'object' && !Array.isArray(v) && base && typeof base[k] === 'object' && !Array.isArray(base[k])) {
        out[k] = deepMerge(base[k], v);
      } else if (v !== undefined) {
        out[k] = typeof v === typeof base[k] || base[k] === undefined ? v : base[k];
      }
    });
    return out;
  }

  function getSettings() {
    let parsed = {};
    try { parsed = JSON.parse(BW.safeGet(SETTINGS_KEY, '{}')) || {}; } catch (e) { parsed = {}; }
    return deepMerge(SETTINGS_DEFAULTS, parsed);
  }

  function saveSettings(next) {
    BW.safeSet(SETTINGS_KEY, JSON.stringify(next));
  }

  function updateSetting(keyPath, value) {
    const s = getSettings();
    const parts = String(keyPath).split('.');
    let node = s;
    for (let i = 0; i < parts.length - 1; i++) node = node[parts[i]];
    node[parts[parts.length - 1]] = value;
    saveSettings(s);
    applySettings();
    window.dispatchEvent(new CustomEvent('breadwinner:settings-changed', { detail: { key: keyPath, value: value } }));
  }

  function resetSettings() {
    saveSettings(JSON.parse(JSON.stringify(SETTINGS_DEFAULTS)));
    applySettings();
  }

  function applySettings() {
    const s = getSettings();
    const root = document.documentElement;

    // Theme — respects prefers-color-scheme when set to "system"
    const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
    const isDark = s.theme === 'dark' || (s.theme === 'system' && prefersDark);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Swap every logo image for the active theme (navbar, footer, onboarding, sign-in).
    const navLogo = isDark ? 'images/breadwinner_logo_white.png' : 'images/breadwinner_logo_black.png';
    document.querySelectorAll('.logo img').forEach((img) => { img.setAttribute('src', navLogo); });

    // Accent color — overrides brand green and the whole derived scheme
    // (primary, hover, soft-light, translucent glows, hero deep shade).
    const fullRecolor = s.accentColor && s.accentColor !== 'green' && ACCENT_COLORS[s.accentColor];
    if (fullRecolor) {
      const a = ACCENT_COLORS[s.accentColor];
      root.style.setProperty('--primary', a[0]);
      root.style.setProperty('--primary-hover', a[1]);
      if (ACCENT_LIGHT[s.accentColor]) root.style.setProperty('--accent-light', ACCENT_LIGHT[s.accentColor]);
      if (ACCENT_RGB[s.accentColor]) root.style.setProperty('--accent-rgb', ACCENT_RGB[s.accentColor]);
      if (ACCENT_DEEP[s.accentColor]) root.style.setProperty('--accent-deep', ACCENT_DEEP[s.accentColor]);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
      root.style.removeProperty('--accent-light');
      root.style.removeProperty('--accent-rgb');
      root.style.removeProperty('--accent-deep');
    }

    root.setAttribute('data-reduce-motion', s.reduceMotion ? 'true' : 'false');
  }
  /* ---------- Formatting helpers (respect current Settings) ---------- */
  function formatDate(dateInput) {
    const d = dateInput instanceof Date ? dateInput : new Date(dateInput);
    const { dateFormat } = getSettings();
    if (dateFormat === 'ISO') return d.toISOString().split('T')[0];
    if (dateFormat === 'DMY') return new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }).format(d);
    return new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', year: 'numeric' }).format(d); // MDY default
  }

  function formatMoney(n) {
    const { currency } = getSettings();
    const symbol = CURRENCY_SYMBOLS[currency] || '$';
    return symbol + Number(n).toFixed(2);
  }

  BW.formatDate = formatDate;
  BW.formatMoney = formatMoney;
  BW.currencySymbol = function () { return CURRENCY_SYMBOLS[getSettings().currency] || '$'; };

  /* ---------- Apply on load + live sync across tabs + system theme changes ---------- */
  applySettings();
  window.addEventListener('storage', applySettings); // cross-tab sync
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSettings().theme === 'system') applySettings();
  });

  /* ---------- Expose the manager ---------- */
  BW.Settings = {
    DEFAULTS: SETTINGS_DEFAULTS,
    ACCENT_COLORS: ACCENT_COLORS,
    getSettings: getSettings,
    saveSettings: saveSettings,
    updateSetting: updateSetting,
    resetSettings: resetSettings,
    applySettings: applySettings
  };
  BW.applySitewideSettings = applySettings; // back-compat alias

  /* ---------- Toast ---------- */
  BW.toast = function (message) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.innerHTML = '<div class="toast-wrap"><svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="toast-text"></span></div>';
      wrap = wrap.firstElementChild;
      document.body.appendChild(wrap);
    }
    wrap.querySelector('.toast-text').textContent = message;
    wrap.classList.add('show');
    clearTimeout(wrap._hideTimer);
    wrap._hideTimer = setTimeout(() => wrap.classList.remove('show'), 2600);
  };

  /* ---------- Confirm dialog helper ---------- */
  BW.confirmModal = function (overlayEl) {
    return {
      open() { overlayEl.hidden = false; document.body.style.overflow = 'hidden'; },
      close() { overlayEl.hidden = true; document.body.style.overflow = ''; }
    };
  };

  /* ---------- Mobile bottom-nav pill (simple pages) ---------- */
  const simpleBottomNav = document.getElementById('mobileBottomNav');
  if (simpleBottomNav && !document.getElementById('dashboardView')) {
    const pill = document.getElementById('bottomNavPill');
    const position = (item) => {
      if (!pill || !item) return;
      const navRect = simpleBottomNav.getBoundingClientRect();
      const itemRect = item.getBoundingClientRect();
      const offset = itemRect.left + itemRect.width / 2 - navRect.left - pill.offsetWidth / 2;
      pill.style.transform = 'translateX(' + offset + 'px)';
    };
    const init = () => {
      const active = simpleBottomNav.querySelector('.bottom-nav-item.active') || simpleBottomNav.querySelector('.bottom-nav-item');
      position(active);
      if (pill) pill.classList.add('visible');
    };
    requestAnimationFrame(init);
    setTimeout(init, 100);
    window.addEventListener('resize', init);
  }
/* ---------- Avatar color + swatch backgrounds (shared across pages) ---------- */
  // Apply the user's saved avatar color to every avatar element — the navbar
  // profile pill on home/profile/settings and the large profile preview.
  (function applyAvatarIdentity() {
    const color = BW.safeGet(BW.STORAGE.avatarColor, 'green');
    const bg = avatarGradient(color);
    document.querySelectorAll('.avatar-circle, .avatar-xl').forEach((el) => {
      el.style.background = bg;
    });

    // Initials from the saved name, so the pill letters match the profile
    // across every page (home, profile, settings).
    const getInitials = (name) => {
      const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
      if (!parts.length) return 'JM';
      if (parts.length === 1) return parts[0].charAt(0).toUpperCase();
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    };
    const initials = getInitials(BW.safeGet(BW.STORAGE.name, ''));
    document.querySelectorAll('.avatar-circle, .avatar-xl').forEach((el) => {
      el.textContent = initials;
    });
  })();

  // Paint the avatar/accent swatch buttons using their data-bg gradient, so
  // they show the vivid color instead of looking washed-out/transparent.
  document.querySelectorAll('.avatar-swatch').forEach((sw) => {
    if (sw.dataset.bg) sw.style.background = sw.dataset.bg;
  });
})(window.BreadWinner);
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

  /* ============================================
     Identity (name, email, avatar color, diagnosis info)
     Distinct from Settings below: this is "who you are", not "how the app behaves".
     ============================================ */
  const STORAGE = {
    name: 'breadwinner_user_name',
    email: 'breadwinner_user_email',
    avatarColor: 'breadwinner_avatar_color',
    diagnosisConfirmed: 'breadwinner_diagnosis_confirmed',
    diagnosisDate: 'breadwinner_diagnosis_date',
    memberSince: 'breadwinner_member_since'
  };

  function safeGet(key, fallback) {
    try {
      const v = localStorage.getItem(key);
      return v === null ? fallback : v;
    } catch (e) { return fallback; }
  }
  function safeSet(key, value) {
    try { localStorage.setItem(key, value); } catch (e) { /* storage unavailable — ignore */ }
  }

  const AVATAR_COLORS = {
    green: ['#22C55E', '#16A34A'],
    blue: ['#3B82F6', '#2563EB'],
    purple: ['#A855F7', '#9333EA'],
    orange: ['#F97316', '#EA580C'],
    pink: ['#EC4899', '#DB2777']
  };

  function getInitials(name) {
    const parts = (name || '').trim().split(/\s+/).filter(Boolean);
    if (!parts.length) return 'JM';
    const first = parts[0].charAt(0).toUpperCase();
    const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
    return first + last;
  }

  window.BreadWinner.STORAGE = STORAGE;
  window.BreadWinner.safeGet = safeGet;
  window.BreadWinner.safeSet = safeSet;
  window.BreadWinner.getInitials = getInitials;

  /* ============================================
     Settings — the ONE sitewide settings system.
     Single JSON blob in localStorage under SETTINGS_KEY. Every page loads
     shared.js, so getSettings()/applySettings() are always available, and a
     change saved on settings.html shows up immediately everywhere else.
     ============================================ */
  const SETTINGS_KEY = 'breadwinner_settings';
  const SETTINGS_DEFAULTS = {
    theme: 'light',                // 'light' | 'dark' | 'system' — defaults to light until the user picks otherwise
    accentColor: 'green',         // key into ACCENT_COLORS
    notifications: {
      reminders: true,            // receipt / price-check nudges -> drives the navbar notif dot
      matchConfirmations: true    // "this GF match needs a second look" nudges
    },
    reduceMotion: false,          // mirrors prefers-reduced-motion, but user-controlled
    currency: 'USD',              // display symbol only — no conversion, single-currency prototype
    dateFormat: 'MDY'             // 'MDY' | 'DMY' | 'ISO'
  };
  const ACCENT_COLORS = {
    green: ['#22C55E', '#16A34A'],   // brand default
    blue: ['#3B82F6', '#2563EB'],
    purple: ['#A855F7', '#9333EA'],
    orange: ['#F97316', '#EA580C'],
    pink: ['#EC4899', '#DB2777']
  };
  const CURRENCY_SYMBOLS = { USD: '$', EUR: '€', GBP: '£' };

  function deepMerge(base, patch) {
    const out = Object.assign({}, base);
    Object.keys(patch || {}).forEach((k) => {
      if (patch[k] && typeof patch[k] === 'object' && !Array.isArray(patch[k]) && base[k]) {
        out[k] = deepMerge(base[k], patch[k]);
      } else {
        out[k] = patch[k];
      }
    });
    return out;
  }

  function getSettings() {
    let stored = {};
    try {
      stored = JSON.parse(localStorage.getItem(SETTINGS_KEY) || '{}');
    } catch (e) { stored = {}; }
    return deepMerge(SETTINGS_DEFAULTS, stored);
  }

  function saveSettings(next) {
    try { localStorage.setItem(SETTINGS_KEY, JSON.stringify(next)); } catch (e) { /* storage unavailable */ }
    applySettings();
    return next;
  }

  // updateSetting('theme', 'dark') or updateSetting('notifications.reminders', false)
  function updateSetting(path, value) {
    const current = getSettings();
    const keys = path.split('.');
    let cursor = current;
    for (let i = 0; i < keys.length - 1; i++) cursor = cursor[keys[i]];
    cursor[keys[keys.length - 1]] = value;
    return saveSettings(current);
  }

  function resetSettings() {
    try { localStorage.removeItem(SETTINGS_KEY); } catch (e) { /* storage unavailable */ }
    applySettings();
    return getSettings();
  }

  function applySettings() {
    const s = getSettings();
    const root = document.documentElement;

    // Theme
    const isDark = s.theme === 'dark' || (s.theme === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    root.setAttribute('data-theme', isDark ? 'dark' : 'light');

    // Accent color — override the brand green everywhere it's used via var(--primary*);
    // leave the two vars alone for the default so dark-theme's own accent tuning still applies.
    if (s.accentColor && s.accentColor !== 'green' && ACCENT_COLORS[s.accentColor]) {
      const [primary, hover] = ACCENT_COLORS[s.accentColor];
      root.style.setProperty('--primary', primary);
      root.style.setProperty('--primary-hover', hover);
    } else {
      root.style.removeProperty('--primary');
      root.style.removeProperty('--primary-hover');
    }

    // Reduce motion (in addition to the OS-level prefers-reduced-motion media query)
    root.setAttribute('data-reduce-motion', s.reduceMotion ? 'true' : 'false');

    // Notification dot in the top navbar
    document.querySelectorAll('.notif-dot').forEach((el) => {
      el.style.display = s.notifications.reminders ? '' : 'none';
    });

    // Avatar initials + gradient (personal identity, not a "setting", but rendered alongside it)
    const name = safeGet(STORAGE.name, '');
    const colorKey = safeGet(STORAGE.avatarColor, 'green');
    const colors = AVATAR_COLORS[colorKey] || AVATAR_COLORS.green;
    document.querySelectorAll('.avatar-circle, .avatar-xl').forEach((el) => {
      el.textContent = getInitials(name);
      el.style.background = 'linear-gradient(135deg,' + colors[0] + ',' + colors[1] + ')';
    });

    // Greeting on the dashboard header, if present
    const welcomeHeading = document.querySelector('.dash-header h1');
    if (welcomeHeading && name) {
      const firstName = name.trim().split(/\s+/)[0];
      welcomeHeading.textContent = 'Welcome back, ' + firstName + '!';
    }

    return s;
  }

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

  applySettings();
  window.addEventListener('storage', applySettings); // sync across open tabs
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getSettings().theme === 'system') applySettings();
  });

  window.BreadWinner.Settings = {
    DEFAULTS: SETTINGS_DEFAULTS,
    ACCENT_COLORS: ACCENT_COLORS,
    getSettings,
    saveSettings,
    updateSetting,
    resetSettings,
    applySettings
  };
  window.BreadWinner.formatDate = formatDate;
  window.BreadWinner.formatMoney = formatMoney;
  window.BreadWinner.currencySymbol = function () {
    return CURRENCY_SYMBOLS[getSettings().currency] || '$';
  };
  // Back-compat alias used by older page scripts
  window.BreadWinner.applySitewideSettings = applySettings;

  /* ---------- Toast helper (used by settings.js / profile.js) ---------- */
  window.BreadWinner.toast = function (message) {
    let wrap = document.querySelector('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      wrap.innerHTML = '<svg viewBox="0 0 24 24" fill="none"><path d="M5 13l4 4L19 7" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/></svg><span class="toast-text"></span>';
      document.body.appendChild(wrap);
    }
    wrap.querySelector('.toast-text').textContent = message;
    wrap.classList.add('show');
    clearTimeout(wrap._hideTimer);
    wrap._hideTimer = setTimeout(() => wrap.classList.remove('show'), 2600);
  };

  /* ---------- Modal helper (confirm dialogs) ---------- */
  window.BreadWinner.confirmModal = function (overlayEl) {
    return {
      open() { overlayEl.hidden = false; document.body.style.overflow = 'hidden'; },
      close() { overlayEl.hidden = true; document.body.style.overflow = ''; }
    };
  };

  /* ---------- Mobile bottom-nav pill (simple pages: profile, settings — home.js has its own richer version for view-switching) ---------- */
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
})();

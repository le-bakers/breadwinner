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
     Sitewide settings (theme, name, avatar color, notifications)
     Read from localStorage on every page via this file, so a change
     made once on settings.html/profile.html shows up everywhere.
     ============================================ */
  const STORAGE = {
    theme: 'breadwinner_theme',            // 'light' | 'dark' | 'system'
    notifications: 'breadwinner_notifications', // 'on' | 'off'
    name: 'breadwinner_user_name',
    email: 'breadwinner_user_email',
    avatarColor: 'breadwinner_avatar_color',
    diagnosisConfirmed: 'breadwinner_diagnosis_confirmed',
    diagnosisDate: 'breadwinner_diagnosis_date'
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

  function applyTheme(pref) {
    const value = pref || safeGet(STORAGE.theme, 'system');
    const isDark = value === 'dark' || (value === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    document.documentElement.setAttribute('data-theme', isDark ? 'dark' : 'light');
  }

  function setTheme(value) {
    safeSet(STORAGE.theme, value);
    applyTheme(value);
  }

  function applySitewideSettings() {
    // Theme (in case this page has no anti-flash inline script, or the OS preference changed)
    applyTheme();

    // Avatar initials + gradient color, wherever an avatar-circle/avatar-xl exists on this page
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

    // Notification dot — hidden sitewide when the user turns notifications off in Settings
    const notifOn = safeGet(STORAGE.notifications, 'on') !== 'off';
    document.querySelectorAll('.notif-dot').forEach((el) => {
      el.style.display = notifOn ? '' : 'none';
    });
  }

  applySitewideSettings();
  window.addEventListener('storage', applySitewideSettings); // sync across open tabs

  window.BreadWinner.STORAGE = STORAGE;
  window.BreadWinner.safeGet = safeGet;
  window.BreadWinner.safeSet = safeSet;
  window.BreadWinner.getInitials = getInitials;
  window.BreadWinner.setTheme = setTheme;
  window.BreadWinner.applySitewideSettings = applySitewideSettings;

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

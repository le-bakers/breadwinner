(function () {
  'use strict';

  const logo = '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">';
  const landingLinks =
    '<div class="msn-links">' +
      '<a href="/index/index.html#how-it-works">How it works</a>' +
      '<a href="/index/index.html#features">Features</a>' +
      '<a href="/about/about.html">About us</a>' +
    '</div>';

  const landingActions =
    '<div class="msn-actions">' +
      '<a class="msn-button msn-button-ghost" href="/signin/signin.html">Sign In</a>' +
      '<a class="msn-button msn-button-primary" href="/signin/signin.html">Start Free</a>' +
      '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
    '</div>';

  const landing =
    '<nav class="msn-nav msn-over-media" data-morph-nav aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="/index/index.html#top" aria-label="BreadWinner, back to top">' + logo + '</a>' +
        landingLinks +
        landingActions +
      '</div>' +
    '</nav>' +
    '<div class="mobile-menu" id="mobileMenu">' +
      '<a href="/index/index.html#how-it-works">How it works</a>' +
      '<a href="/index/index.html#features">Features</a>' +
      '<a href="/about/about.html">About us</a>' +
      '<div class="nav-actions">' +
        '<a href="/signin/signin.html" class="btn btn-secondary">Sign In</a>' +
        '<a href="/signin/signin.html" class="btn btn-primary">Start Free</a>' +
      '</div>' +
    '</div>';

  const appLinks =
    '<div class="msn-links">' +
      '<a href="/home/home.html">Dashboard</a>' +
      '<a href="/home/home.html#receipts">Receipts</a>' +
      '<a href="/settings/settings.html">Settings</a>' +
    '</div>';

  const app =
    '<nav class="msn-nav" data-morph-nav aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="/index/index.html" aria-label="BreadWinner home">' + logo + '</a>' +
        appLinks +
        '<div class="msn-actions dash-actions">' +
          '<a class="profile-pill msn-avatar" href="/settings/settings.html" aria-label="Go to your profile and settings">' +
            '<span class="avatar-circle">JM</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';

  const variants = {
    landing: landing,
    home: app,
    dashboard: app
  };

  document.querySelectorAll('[data-navbar]').forEach(function (placeholder) {
    const variant = variants[placeholder.dataset.navbar] || landing;
    const template = document.createElement('template');
    template.innerHTML = variant.trim();
    placeholder.replaceWith(template.content);
  });

  function initNewNavs() {
    if (!window.BreadWinner || !window.BreadWinner.initMorphNav) return;
    document.querySelectorAll('[data-morph-nav]').forEach(function (nav) {
      window.BreadWinner.initMorphNav(nav);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewNavs);
  } else {
    initNewNavs();
  }
})();


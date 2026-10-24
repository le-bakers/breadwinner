// @ts-nocheck
(function () {
  'use strict';

  const logo = '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">';

  const landingLinks =
    '<div class="msn-links">' +
      '<a href="/#how-it-works">How it works</a>' +
      '<a href="/#features">Features</a>' +
      '<a href="/about">About us</a>' +
    '</div>';

  function getSignedInState() {
    try {
      return !!localStorage.getItem('breadwinner_session');
    } catch (e) {
      return false;
    }
  }

  function getLandingActions() {
    const actions = getSignedInState()
      ? '<a class="msn-button msn-button-primary" href="/home">Continue to Dashboard</a>'
      : '<a class="msn-button msn-button-ghost" href="/signin">Sign In</a><a class="msn-button msn-button-primary" href="/signup">Start Free</a>';
    return '<div class="msn-actions">' + actions
      + '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div>';
  }

  function getLandingMobileActions() {
    return getSignedInState()
      ? '<div class="nav-actions"><a href="/home" class="btn btn-primary">Continue to Dashboard</a></div>'
      : '<div class="nav-actions"><a href="/signin" class="btn btn-secondary">Sign In</a><a href="/signup" class="btn btn-primary">Start Free</a></div>';
  }

  function buildLandingNavbar() {
    return '<nav class="msn-nav" aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="/#top" aria-label="BreadWinner, back to top">' + logo + '</a>' +
        landingLinks +
        getLandingActions() +
      '</div>' +
    '</nav>' +
    '<div class="mobile-menu" id="mobileMenu">' +
      '<a href="/#how-it-works">How it works</a>' +
      '<a href="/#features">Features</a>' +
      '<a href="/about">About us</a>' +
      getLandingMobileActions() +
    '</div>';
  }

  const appLinks =
    '<div class="msn-links">' +
      '<a href="/home">Dashboard</a>' +
      '<a href="/history">Receipt History</a>' +
      '<a href="/settings">Settings</a>' +
    '</div>';

  const app =
    '<nav class="msn-nav" aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="/" aria-label="BreadWinner home">' + logo + '</a>' +
        appLinks +
        '<div class="msn-actions dash-actions">' +
          '<a class="profile-pill msn-avatar" href="/settings" aria-label="Go to your profile and settings">' +
            '<span class="avatar-circle">JM</span>' +
          '</a>' +
        '</div>' +
      '</div>' +
    '</nav>';

  const variants = {
    landing: buildLandingNavbar,
    home: app,
    dashboard: app,
    other: buildLandingNavbar
  };

  document.querySelectorAll('[data-navbar]').forEach(function (placeholder) {
    const variant = variants[placeholder.dataset.navbar] || buildLandingNavbar;
    const markup = typeof variant === 'function' ? variant() : variant;
    const template = document.createElement('template');
    template.innerHTML = markup.trim();
    placeholder.replaceWith(template.content);
  });

})();

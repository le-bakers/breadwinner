// @ts-nocheck
import { pageUrl, assetUrl } from '../routes.js';
(function () {
  'use strict';

  const logo = '<img src="' + assetUrl('images/breadwinner_logo_black.png') + '" alt="BreadWinner" height="36">';

  const landingLinks =
    '<div class="msn-links">' +
      '<a href="' + pageUrl('/#how-it-works') + '">How it works</a>' +
      '<a href="' + pageUrl('/#features') + '">Features</a>' +
      '<a href="' + pageUrl('/about') + '">About us</a>' +
    '</div>';

  let signedIn = null;
  let checking = true;
  async function getSignedInState() {
    // Render the shell first so shared.js can bind the existing menu toggle.
    await import('../shared.js');
    await import('../cloud.js');
    return window.BreadWinner.cloud.getSignedInState();
  }

  function actionMarkup(mobile = false) {
    if (signedIn === null) return checking
      ? '<span role="status">Checking sign-in…</span>'
      : '<button type="button" class="btn btn-secondary" data-auth-retry>Retry sign-in check</button>';
    if (signedIn) return mobile
      ? '<a href="' + pageUrl('/home') + '" class="btn btn-primary">Continue to Dashboard</a>'
      : '<a class="msn-button msn-button-primary" href="' + pageUrl('/home') + '">Continue to Dashboard</a>';
    return mobile
      ? '<a href="' + pageUrl('/signin') + '" class="btn btn-secondary">Sign In</a><a href="' + pageUrl('/signup') + '" class="btn btn-primary">Start Free</a>'
      : '<a class="msn-button msn-button-ghost" href="' + pageUrl('/signin') + '">Sign In</a><a class="msn-button msn-button-primary" href="' + pageUrl('/signup') + '">Start Free</a>';
  }

  function updateActions() {
    document.querySelectorAll('[data-auth-actions]').forEach((el) => {
      el.innerHTML = actionMarkup(el.dataset.authActions === 'mobile');
      const retry = el.querySelector('[data-auth-retry]');
      if (retry) retry.addEventListener('click', refreshAuth);
    });
  }

  async function refreshAuth() {
    checking = true;
    signedIn = null;
    updateActions();
    try { signedIn = await getSignedInState(); }
    catch (e) { signedIn = null; }
    checking = false;
    updateActions();
  }

  function getLandingActions() {
    const actions = '<span data-auth-actions="desktop" style="display:contents">' + actionMarkup() + '</span>';
    return '<div class="msn-actions">' + actions
      + '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div>';
  }

  function getLandingMobileActions() {
    return '<div class="nav-actions" data-auth-actions="mobile">' + actionMarkup(true) + '</div>';
  }

  function buildLandingNavbar() {
    return '<nav class="msn-nav" aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="' + pageUrl('/#top') + '" aria-label="BreadWinner, back to top">' + logo + '</a>' +
        landingLinks +
        getLandingActions() +
      '</div>' +
    '</nav>' +
    '<div class="mobile-menu" id="mobileMenu">' +
      '<a href="' + pageUrl('/#how-it-works') + '">How it works</a>' +
      '<a href="' + pageUrl('/#features') + '">Features</a>' +
      '<a href="' + pageUrl('/about') + '">About us</a>' +
      getLandingMobileActions() +
    '</div>';
  }

  // Marks the link for the page you're on, so it shows as selected.
  function appLink(route, label) {
    const path = globalThis.location ? globalThis.location.pathname : '';
    const here = path === route || path === new URL(pageUrl(route)).pathname;
    return '<a href="' + pageUrl(route) + '"' + (here ? ' aria-current="page"' : '') + '>' + label + '</a>';
  }

  const appLinks =
    '<div class="msn-links">' +
      appLink('/home', 'Dashboard') +
      appLink('/history', 'Receipt History') +
      appLink('/settings', 'Settings') +
    '</div>';

  const app =
    '<nav class="msn-nav" aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="' + pageUrl('/') + '" aria-label="BreadWinner home">' + logo + '</a>' +
        appLinks +
        '<div class="msn-actions dash-actions">' +
          '<a class="profile-pill msn-avatar" href="' + pageUrl('/settings') + '" aria-label="Go to your profile and settings">' +
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

  if (document.querySelector('[data-auth-actions]')) {
    window.addEventListener('breadwinner:auth-changed', (event) => {
      signedIn = event.detail.signedIn;
      updateActions();
    });
    window.addEventListener('pageshow', refreshAuth);
    window.addEventListener('online', refreshAuth);
    window.addEventListener('storage', (event) => {
      if (event.key === null || event.key.startsWith('breadwinner_auth')) refreshAuth();
    });
    refreshAuth();
  }

})();

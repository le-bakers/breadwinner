(function () {
  'use strict';

  const logo = '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">';

  const landingLinks =
    '<div class="msn-links">' +
      '<a href="/index/index.html#how-it-works">How it works</a>' +
      '<a href="/index/index.html#features">Features</a>' +
      '<a href="/about/about.html">About us</a>' +
    '</div>';

  let isSignedIn = false;
  try {
    isSignedIn = !!localStorage.getItem('breadwinner_session');
  } catch (e) {}

  const landingActions = isSignedIn
    ? '<div class="msn-actions"><a class="msn-button msn-button-primary" href="/home/home.html">Continue to Dashboard</a><button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div>'
    : '<div class="msn-actions"><a class="msn-button msn-button-ghost" href="/signin/signin.html">Sign In</a><a class="msn-button msn-button-primary" href="/signin/signin.html">Start Free</a><button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div>';

  const landingMobileActions = isSignedIn
    ? '<div class="nav-actions"><a href="/home/home.html" class="btn btn-primary">Continue to Dashboard</a></div>'
    : '<div class="nav-actions"><a href="/signin/signin.html" class="btn btn-secondary">Sign In</a><a href="/onboarding/onboarding.html" class="btn btn-primary">Start Free</a></div>';

  // Scrintal.com-style landing navbar (used on the index/hero page only).
  // A dark, dismissible announcement bar sits above a floating glass pill
  // nav. Scrintal's "Pricing" item is replaced with our "How it works",
  // "Features" and "About us" links.
  const scrintalAnnounce =
      '<div class="scn-announce" role="region" aria-label="Announcement">' +
        '<span class="scn-announce-text">Snap any grocery receipt — BreadWinner flags gluten-free finds, staples &amp; tax-deductible specialty items.</span>' +
        '<a class="scn-announce-link" href="/signin/signin.html">Start Free&nbsp;&rarr;</a>' +
        '<button type="button" class="scn-announce-close" aria-label="Dismiss announcement">&times;</button>' +
      '</div>';

  const scrintalNav =
      '<nav class="scn-nav" data-scrintal-nav aria-label="Primary navigation">' +
        '<div class="scn-shell">' +
          '<a class="scn-brand" href="/index/index.html#top" aria-label="BreadWinner, back to top">' + logo + '</a>' +
          '<div class="scn-links">' +
            '<a href="/index/index.html#how-it-works">How it works</a>' +
            '<a href="/index/index.html#features">Features</a>' +
            '<a href="/about/about.html">About us</a>' +
          '</div>' +
          '<div class="scn-actions">' +
            (isSignedIn
              ? '<a class="scn-button scn-button-primary" href="/home/home.html">Continue to Dashboard</a>'
              : '<a class="scn-button scn-button-ghost" href="/signin/signin.html">Sign In</a>' +
                '<a class="scn-button scn-button-primary" href="/signin/signin.html">Start Free</a>') +
            '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
          '</div>' +
        '</div>' +
      '</nav>' +
      '<div class="mobile-menu" id="mobileMenu">' +
        '<a href="/index/index.html#how-it-works">How it works</a>' +
        '<a href="/index/index.html#features">Features</a>' +
        '<a href="/about/about.html">About us</a>' +
        landingMobileActions +
      '</div>';

  // The classic morphing nav stays in use on the legal pages, which reuse the
  // "landing" placeholder. Only the index/hero page opts into the
  // Scrintal-style layout via body.has-scrintal-landing.
  const landing = document.body.classList.contains('has-scrintal-landing')
    ? scrintalAnnounce + scrintalNav
    : '<nav class="msn-nav msn-over-media-landing" data-morph-nav aria-label="Primary navigation">' +
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
        landingMobileActions +
      '</div>';




    const other =
    '<nav class="msn-nav" data-morph-nav aria-label="Primary navigation">' +
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
      landingMobileActions +
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
    dashboard: app,
    other: other
  };

  document.querySelectorAll('[data-navbar]').forEach(function (placeholder) {
    const variant = variants[placeholder.dataset.navbar] || landing;
    const template = document.createElement('template');
    template.innerHTML = variant.trim();
    placeholder.replaceWith(template.content);
  });

  function initNewNavs() {
    if (!window.BreadWinner) return;
    document.querySelectorAll('[data-morph-nav]').forEach(function (nav) {
      if (window.BreadWinner.initMorphNav) window.BreadWinner.initMorphNav(nav);
    });
    document.querySelectorAll('[data-scrintal-nav]').forEach(function (nav) {
      if (window.BreadWinner.initScrintalNav) window.BreadWinner.initScrintalNav(nav);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNewNavs);
  } else {
    initNewNavs();
  }
})();


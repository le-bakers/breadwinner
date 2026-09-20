(function () {
  'use strict';

  const logo = '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">';
  const authActions = '<div class="nav-actions"><a href="/signin/signin.html" class="btn btn-ghost">Sign In</a><a href="/signin/signin.html" class="btn btn-primary">Start Free</a></div>';
  const mobileAuthActions = '<div class="nav-actions"><a href="/signin/signin.html" class="btn btn-secondary">Sign In</a><a href="/signin/signin.html" class="btn btn-primary">Start Free</a></div>';

  const variants = {
    marketing: '<header class="navbar"><div class="nav-inner"><a class="logo" href="/index/index.html">' + logo + '</a>' + authActions + '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div><div class="mobile-menu" id="mobileMenu">' + mobileAuthActions + '</div></header>',
    dashboard: '<header class="navbar dash-navbar"><div class="nav-inner"><a class="logo" href="/index/index.html">' + logo + '</a><nav class="nav-links" aria-label="Dashboard"><a href="/home/home.html">Dashboard</a><a href="/home/home.html#receipts">Receipts</a><a href="/settings/settings.html" class="active">Settings</a></nav><div class="nav-actions dash-actions"><a class="profile-pill" href="/settings/settings.html" aria-label="Go to your profile and settings"><span class="avatar-circle">JM</span></a></div></div></header>',
    landing: '<div class="msn-progress" aria-hidden="true"></div><nav class="msn-nav msn-over-media" data-morph-nav aria-label="Primary navigation"><div class="msn-shell"><a class="msn-brand logo" href="#top" aria-label="BreadWinner, back to top">' + logo + '</a><div class="msn-links"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="/about/about.html">About us</a></div><div class="msn-actions"><a class="msn-button msn-button-ghost" href="/signin/signin.html">Sign In</a><a class="msn-button msn-button-primary" href="/signin/signin.html">Start Free</a><button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button></div></div></nav><div class="mobile-menu" id="mobileMenu"><a href="#how-it-works">How it works</a><a href="#features">Features</a><a href="/about/about.html">About us</a><div class="nav-actions"><a href="/signin/signin.html" class="btn btn-secondary">Sign In</a><a href="/signin/signin.html" class="btn btn-primary">Start Free</a></div></div>',
    home: '<div class="msn-progress" aria-hidden="true"></div><nav class="msn-nav" data-morph-nav aria-label="Primary navigation"><div class="msn-shell"><a class="msn-brand logo" href="/index/index.html" aria-label="BreadWinner home">' + logo + '</a><div class="msn-links"><a href="#dashboardView">Dashboard</a><a href="#receipts">Receipts</a><a href="/settings/settings.html">Settings</a></div><div class="msn-actions dash-actions"><a class="profile-pill msn-avatar" href="/settings/settings.html" aria-label="Go to your profile and settings"><span class="avatar-circle">JM</span></a></div></div></nav>'
  };

  document.querySelectorAll('[data-navbar]').forEach(function (placeholder) {
    const variant = variants[placeholder.dataset.navbar] || variants.marketing;
    placeholder.outerHTML = variant;
  });
})();

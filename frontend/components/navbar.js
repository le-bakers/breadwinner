(function () {
  'use strict';

  const logo = '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">';

  const landing =
    '<div class="msn-progress" aria-hidden="true"></div>' +
    '<nav class="msn-nav msn-over-media" data-morph-nav aria-label="Primary navigation">' +
      '<div class="msn-shell">' +
        '<a class="msn-brand logo" href="#top" aria-label="BreadWinner, back to top">' + logo + '</a>' +
        '<div class="msn-links">' +
          '<a href="#how-it-works">How it works</a>' +
          '<a href="#features">Features</a>' +
          '<a href="/about/about.html">About us</a>' +
        '</div>' +
        '<div class="msn-actions">' +
          '<a class="msn-button msn-button-ghost" href="/signin/signin.html">Sign In</a>' +
          '<a class="msn-button msn-button-primary" href="/signin/signin.html">Start Free</a>' +
          '<button class="nav-toggle" aria-label="Toggle menu" aria-expanded="false"><span></span><span></span><span></span></button>' +
        '</div>' +
      '</div>' +
    '</nav>' +
    '<div class="mobile-menu" id="mobileMenu">' +
      '<a href="#how-it-works">How it works</a>' +
      '<a href="#features">Features</a>' +
      '<a href="/about/about.html">About us</a>' +
      '<div class="nav-actions">' +
        '<a href="/signin/signin.html" class="btn btn-secondary">Sign In</a>' +
        '<a href="/signin/signin.html" class="btn btn-primary">Start Free</a>' +
      '</div>' +
    '</div>';

  document.querySelectorAll('[data-navbar]').forEach(function (placeholder) {
    placeholder.outerHTML = landing;
  });
})();


"use strict";
// @ts-nocheck
(function () {
    'use strict';
    const footer = '<footer class="footer">' +
        '<div class="container">' +
        '<div class="footer-inner">' +
        '<div>' +
        '<a class="logo" href="/">' +
        '<img src="/images/breadwinner_logo_black.png" alt="BreadWinner" height="36">' +
        '</a>' +
        '<p class="footer-tagline">Gluten-free grocery tracking, simplified.</p>' +
        '</div>' +
        '<div class="footer-links">' +
        '<div class="footer-col">' +
        '<h4>Product</h4>' +
        '<a href="/#how-it-works">How it Works</a>' +
        '<a href="/signin">Sign In</a>' +
        '<a href="/signin">Start Free</a>' +
        '</div>' +
        '<div class="footer-col">' +
        '<h4>Company</h4>' +
        '<a href="/about">About Us</a>' +
        '<a href="/contact">Contact</a>' +
        '</div>' +
        '<div class="footer-col">' +
        '<h4>Legal</h4>' +
        '<a href="/privacy">Privacy</a>' +
        '<a href="/terms">Terms</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '<div class="footer-bottom">' +
        '<p>&copy; 2026 BreadWinner. All rights reserved.</p>' +
        '<div class="footer-social" aria-label="Social links">' +
        '<a href="https://www.instagram.com/breadwinner_app" aria-label="Instagram">' +
        '<svg width="16" height="16" viewBox="0 0 24 24" fill="none">' +
        '<rect x="3" y="3" width="18" height="18" rx="5" stroke="#6B7280" stroke-width="1.8"/>' +
        '<circle cx="12" cy="12" r="4" stroke="#6B7280" stroke-width="1.8"/>' +
        '<circle cx="17.5" cy="6.5" r="1" fill="#6B7280"/>' +
        '</svg>' +
        '</a>' +
        '</div>' +
        '</div>' +
        '</div>' +
        '</footer>';
    document.querySelectorAll('[data-footer]').forEach(function (placeholder) {
        placeholder.outerHTML = footer;
    });
})();

/* ============================================
   BreadWinner - About Page JS
   ============================================ */

(function () {
  'use strict';

  const animatedItems = document.querySelectorAll('.principle-card, .workflow-step');
  if (!animatedItems.length) return;

  animatedItems.forEach((item, index) => {
    item.style.setProperty('--about-delay', (index % 4) * 70 + 'ms');
    item.classList.add('about-reveal');
  });

  if (!('IntersectionObserver' in window)) {
    animatedItems.forEach((item) => item.classList.add('about-visible'));
    return;
  }

  const observer = new IntersectionObserver((entries, currentObserver) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      entry.target.classList.add('about-visible');
      currentObserver.unobserve(entry.target);
    });
  }, { threshold: 0.15, rootMargin: '0px 0px -40px 0px' });

  animatedItems.forEach((item) => observer.observe(item));
})();

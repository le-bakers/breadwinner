/* ============================================
   BreadWinner — Landing Page JS
   ============================================ */

(function () {
  'use strict';

  // Stagger feature card + timeline entrance delays
  if (window.BreadWinner && window.BreadWinner.staggerReveal) {
    window.BreadWinner.staggerReveal('.feature-card', 90);
  }

  // Animated counter for the "overcharge caught" chip
  const counterEl = document.querySelector('[data-counter]');
  if (counterEl && 'IntersectionObserver' in window) {
    const target = parseFloat(counterEl.dataset.target || '0');
    let animated = false;

    const animateCounter = () => {
      if (animated) return;
      animated = true;
      const duration = 1400;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = target * eased;
        counterEl.textContent = '$' + value.toFixed(2);
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    };

    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          animateCounter();
          io.disconnect();
        }
      });
    }, { threshold: 0.4 });

    io.observe(counterEl);
  } else if (counterEl) {
    counterEl.textContent = '$' + parseFloat(counterEl.dataset.target || '0').toFixed(2);
  }
})();

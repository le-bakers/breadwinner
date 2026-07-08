// ============================================================
// BREADWINNER — index.js
// Scroll-reveal for how-it-works / feature cards, and a synced
// "light-up" pass on the hero receipt lines as the gold beam
// scans over them.
// ============================================================

(function () {
  const revealTargets = document.querySelectorAll('.how__step, .feature-card');

  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver((entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add('in-view');
          io.unobserve(entry.target);
        }
      });
    }, { threshold: 0.2 });

    revealTargets.forEach((el) => io.observe(el));
  } else {
    revealTargets.forEach((el) => el.classList.add('in-view'));
  }

  // Sync the receipt line "light up" with the scan beam animation.
  // Beam cycle is 3.6s; lines light up in sequence as it passes.
  const lines = document.querySelectorAll('.r-line');
  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (lines.length && !prefersReducedMotion) {
    const cycleMs = 3600;
    const step = 3200 / lines.length; // spread across the beam's travel

    function runPass() {
      lines.forEach((line, i) => {
        setTimeout(() => line.classList.add('is-scanned'), i * step);
        setTimeout(() => line.classList.remove('is-scanned'), cycleMs + i * 40);
      });
    }

    runPass();
    setInterval(runPass, cycleMs);
  } else {
    lines.forEach((line) => line.classList.add('is-scanned'));
  }

  // ---------- SPLASH TRANSITION on "Start free" clicks ----------
  const splash = document.getElementById('splash');
  const startButtons = document.querySelectorAll('a.btn--gold');

  startButtons.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const href = btn.getAttribute('href');

      // Get button center position relative to viewport
      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2 + window.scrollX;
      const cy = rect.top + rect.height / 2 + window.scrollY;

      // Calculate a scale that covers the full viewport diagonal
      const maxDim = Math.max(window.innerWidth, window.innerHeight);
      const scale = (maxDim * 1.5) / Math.max(rect.width, rect.height);

      // Set initial small size at the button center
      splash.style.left = cx + 'px';
      splash.style.top = cy + 'px';
      splash.style.width = Math.max(rect.width, rect.height) + 'px';
      splash.style.height = Math.max(rect.width, rect.height) + 'px';

      // Force reflow before adding the active class
      splash.offsetWidth;

      // Expand to cover the screen
      splash.style.transform = `translate(-50%, -50%) scale(${scale})`;
      splash.classList.add('is-active');

      // Navigate after the animation completes
      setTimeout(() => {
        window.location.href = href;
      }, 620);
    });
  });
})();
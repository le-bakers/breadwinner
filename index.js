// ============================================================
// BREADWINNER — index.js
// Scroll-reveal for how-it-works / feature cards, and a synced
// "light-up" pass on the hero receipt lines as the gold beam
// scans over them.
// ============================================================

(function () {
  // ---------- Splash transition on "Start free" clicks ----------
  const splash = document.getElementById('splash');

  document.querySelectorAll('.btn--gold').forEach((btn) => {
    btn.addEventListener('click', function (e) {
      // Only animate if the button links to signin.html
      const href = this.getAttribute('href');
      if (href && href === 'signin.html') {
        e.preventDefault();

        const rect = this.getBoundingClientRect();
        const cx = rect.left + rect.width / 2;
        const cy = rect.top + rect.height / 2;

        // Position splash at the button center
        splash.style.left = cx + 'px';
        splash.style.top = cy + 'px';

        // Force a layout tick so the 0-state is painted before adding classes
        void splash.offsetWidth;

        // Grow the pill to cover the screen
        splash.classList.add('is-active');

        // After the growth completes, flatten the border-radius
        requestAnimationFrame(() => {
          splash.classList.add('is-cover');
        });

        // Fade out, then navigate
        setTimeout(() => {
          splash.classList.add('is-fading');
        }, 600);

        setTimeout(() => {
          window.location.href = 'signin.html';
        }, 800);
      }
    });
  });

  // ---------- Scroll reveal ----------
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
})();
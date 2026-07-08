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

  // ---------- Splash overlay on "Start free" clicks ----------
  const splash = document.getElementById('splash');
  const startFreeBtns = document.querySelectorAll('.btn--gold');

  startFreeBtns.forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();

      const rect = btn.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const xPct = (cx / window.innerWidth) * 100;
      const yPct = (cy / window.innerHeight) * 100;

      splash.style.setProperty('--splash-x', xPct + '%');
      splash.style.setProperty('--splash-y', yPct + '%');
      splash.classList.add('is-expanded');

      // Navigate after expand animation finishes (transition is 600ms)
      setTimeout(() => {
        window.location.href = btn.getAttribute('href') + '?fromSplash=true';
      }, 650);
    });
  });
})();
/* ============================================
   BreadWinner — Legal Pages JS
   Scroll-spy TOC + back-to-top
   ============================================ */

(function () {
  'use strict';

  const sections = Array.from(document.querySelectorAll('.legal-doc section[id]'));
  const tocLinks = Array.from(document.querySelectorAll('.legal-toc a'));

  if (sections.length && tocLinks.length && 'IntersectionObserver' in window) {
    const linkFor = (id) => tocLinks.find((a) => a.getAttribute('href') === '#' + id);

    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          const link = linkFor(entry.target.id);
          if (!link) return;
          if (entry.isIntersecting) {
            tocLinks.forEach((a) => a.classList.remove('active'));
            link.classList.add('active');
          }
        });
      },
      { rootMargin: '-15% 0px -70% 0px', threshold: 0 }
    );

    sections.forEach((s) => io.observe(s));
  }

  // Back to top button
  const backToTop = document.getElementById('backToTop');
  if (backToTop) {
    const toggle = () => backToTop.classList.toggle('visible', window.scrollY > 480);
    toggle();
    window.addEventListener('scroll', toggle, { passive: true });
    backToTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    });
  }
})();

// @ts-nocheck
/* ============================================
   BreadWinner — Landing Page JS
   ============================================ */

(function () {
  'use strict';

  // Stagger feature card + timeline entrance delays
  if (window.BreadWinner && window.BreadWinner.staggerReveal) {
    window.BreadWinner.staggerReveal('.feature-card', 90);
  }

  // A native sticky stage: the scrollbar is the single source of step state.
  const track = document.querySelector('.how-track');
  if (track) {
    const stage = track.querySelector('.how-stage');
    const composition = track.querySelector('.how-composition');
    const list = track.querySelector('.how-steps');
    const demo = track.querySelector('.how-demo');
    const steps = Array.from(track.querySelectorAll('.how-step'));
    const controls = steps.map(step => step.querySelector('.how-step-control'));
    const details = steps.map(step => step.querySelector('.how-detail'));
    const images = steps.map(step => step.querySelector('.how-it-works-image'));
    const nav = document.querySelector('.msn-nav');
    const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
    let active = -1;
    let pinned = false;
    let start = 0;
    let stageHeight = 0;
    let frame = 0;
    let needsMeasure = true;
    let signature = '';

    const reduceMotion = () => motion.matches || document.documentElement.dataset.reduceMotion === 'true';
    const geometrySignature = () => [window.innerWidth, window.innerHeight,
      nav ? nav.getBoundingClientRect().height : 0,
      ...controls.map(button => button.offsetWidth + ':' + button.offsetHeight)].join('|');

    function setActive(index, force = false) {
      if (index === active && !force) return;
      const previous = active;
      // A quick reversal can target the still-visible backing image. Reset it
      // before raising it so the reverse transition fades just like forward.
      if (index !== active && images[index].classList.contains('is-previous')) {
        images[index].classList.remove('is-previous');
        images[index].style.transition = 'none';
        void images[index].offsetWidth;
        images[index].style.removeProperty('transition');
      }
      active = index;
      steps.forEach((step, i) => {
        const current = i === index;
        step.classList.toggle('is-active', current);
        controls[i].setAttribute('aria-expanded', String(current));
        if (current) controls[i].setAttribute('aria-current', 'step');
        else controls[i].removeAttribute('aria-current');
        details[i].setAttribute('aria-hidden', String(!current));
        images[i].classList.toggle('is-previous', i === previous && !current);
        images[i].classList.toggle('is-active', current);
        images[i].setAttribute('aria-hidden', String(!current));
        if (images[i].tagName === 'VIDEO') {
          if (current) images[i].play().catch(() => {});
          else images[i].pause();
        }
      });
    }

    function render(force = false) {
      if (!pinned) return;
      const position = Math.max(0, (window.scrollY - start) / (stageHeight * 0.8));
      setActive(Math.min(steps.length - 1, Math.floor(position)), force);
      steps.forEach((step, i) => {
        step.style.setProperty('--how-progress', String(Math.max(0, Math.min(1, position - i))));
      });
    }

    function measure() {
      // Measure synchronously without transitions; reserve the tallest active copy.
      track.classList.remove('is-ready');
      const navHeight = nav ? Math.ceil(nav.getBoundingClientRect().height) : 0;
      stageHeight = Math.max(1, window.innerHeight - navHeight);
      track.style.setProperty('--how-nav-height', navHeight + 'px');
      track.style.setProperty('--how-stage-height', stageHeight + 'px');
      images.forEach(image => demo.appendChild(image));
      track.classList.add('is-enhanced');
      const gap = parseFloat(getComputedStyle(track).getPropertyValue('--how-gap'));
      const headers = controls.reduce((total, button) => total + button.getBoundingClientRect().height, 0);
      const tallestDetail = Math.max(...details.map(detail => detail.firstElementChild.scrollHeight));
      list.style.setProperty('--how-list-height', Math.ceil(headers + gap * (steps.length - 1) + tallestDetail) + 'px');
      const stageStyle = getComputedStyle(stage);
      const padding = parseFloat(stageStyle.paddingTop) + parseFloat(stageStyle.paddingBottom);
      pinned = composition.getBoundingClientRect().height + padding <= stageHeight;
      if (pinned) {
        controls.forEach(button => { button.disabled = false; });
        start = track.getBoundingClientRect().top + window.scrollY - navHeight;
        render(true);
        // Flush the measured state before enabling transitions.
        void stage.offsetHeight;
        track.classList.add('is-ready');
      } else {
        track.classList.remove('is-enhanced');
        images.forEach((image, i) => {
          steps[i].appendChild(image);
          if (image.tagName === 'VIDEO') image.play().catch(() => {});
          image.classList.remove('is-active', 'is-previous');
          image.removeAttribute('aria-hidden');
          steps[i].classList.remove('is-active');
          controls[i].disabled = true;
          controls[i].removeAttribute('aria-current');
          controls[i].removeAttribute('aria-expanded');
          details[i].removeAttribute('aria-hidden');
        });
        active = -1;
      }
      signature = geometrySignature();
    }

    function schedule(measureFirst = false) {
      needsMeasure = needsMeasure || measureFirst;
      if (frame) return;
      frame = requestAnimationFrame(() => {
        frame = 0;
        if (needsMeasure) {
          needsMeasure = false;
          measure();
        } else render();
      });
    }

    controls.forEach((button, index) => {
      button.addEventListener('click', () => {
        if (!pinned) return;
        window.scrollTo({ top: start + index * stageHeight * 0.8 + 1,
          behavior: reduceMotion() ? 'instant' : 'smooth' });
      });
    });
    images.forEach(image => image.addEventListener('transitionend', event => {
      if (event.propertyName === 'opacity' && image === images[active]) {
        images.forEach(other => other.classList.remove('is-previous'));
      }
    }));
    window.addEventListener('scroll', () => schedule(), { passive: true });
    window.addEventListener('resize', () => schedule(true), { passive: true });
    window.addEventListener('orientationchange', () => schedule(true));
    window.addEventListener('pageshow', () => schedule(true));
    window.addEventListener('load', () => schedule(true), { once: true });
    if (document.fonts) document.fonts.ready.then(() => schedule(true));
    if ('ResizeObserver' in window) {
      const observer = new ResizeObserver(() => {
        if (signature !== geometrySignature()) schedule(true);
      });
      controls.forEach(button => observer.observe(button));
      if (nav) observer.observe(nav);
      observer.observe(track);
    }
    // Settings can change live, including text sizing applied by the browser/user.
    new MutationObserver(() => schedule(true)).observe(document.documentElement,
      { attributes: true, attributeFilter: ['data-reduce-motion', 'style', 'class'] });
    measure();
    needsMeasure = false;
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

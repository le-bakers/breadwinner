/* ============================================
   BreadWinner — Sign In Page JS
   ============================================ */

(function () {
  'use strict';

  /* ---------- Fact carousel ---------- */
  const slides = Array.from(document.querySelectorAll('.carousel-slide'));
  const dotsWrap = document.getElementById('carouselDots');
  let current = 0;
  let timer = null;

  if (slides.length) {
    slides.forEach((slide, i) => {
      const dot = document.createElement('button');
      dot.setAttribute('role', 'tab');
      dot.setAttribute('aria-label', 'Go to slide ' + (i + 1));
      if (i === 0) { dot.classList.add('active'); slide.classList.add('active'); }
      dot.addEventListener('click', () => goTo(i));
      dotsWrap.appendChild(dot);
    });

    function goTo(index) {
      slides[current].classList.remove('active');
      slides[current].classList.add('exit-left');
      slides[current].setAttribute('aria-hidden', 'true');
      dotsWrap.children[current].classList.remove('active');

      current = index;

      slides.forEach((s, i) => { if (i !== current) s.classList.remove('exit-left'); });
      slides[current].classList.add('active');
      slides[current].setAttribute('aria-hidden', 'false');
      dotsWrap.children[current].classList.add('active');

      setTimeout(() => {
        slides.forEach((s, i) => { if (i !== current) s.classList.remove('exit-left'); });
      }, 650);
    }

    function next() {
      goTo((current + 1) % slides.length);
    }

    function startTimer() {
      timer = setInterval(next, 5000);
    }
    function stopTimer() {
      clearInterval(timer);
    }

    startTimer();
    const panel = document.querySelector('.carousel-panel');
    panel.addEventListener('mouseenter', stopTimer);
    panel.addEventListener('mouseleave', startTimer);
  }

  /* ---------- Password visibility toggle ---------- */
  const toggleBtn = document.querySelector('.toggle-password');
  const passwordInput = document.getElementById('password');
  if (toggleBtn && passwordInput) {
    toggleBtn.addEventListener('click', () => {
      const isText = passwordInput.type === 'text';
      passwordInput.type = isText ? 'password' : 'text';
      toggleBtn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
      toggleBtn.classList.toggle('is-visible', !isText);
    });
  }

  /* ---------- Form validation UI only (no backend) ---------- */
  const form = document.getElementById('signin-form');
  if (form) {
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const emailError = document.getElementById('email-error');
    const passwordError = document.getElementById('password-error');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function validateEmail() {
      const valid = emailPattern.test(email.value.trim());
      email.classList.toggle('invalid', !valid);
      emailError.textContent = valid ? '' : 'Enter a valid email address.';
      emailError.classList.toggle('show', !valid);
      return valid;
    }

    function validatePassword() {
      const valid = password.value.length >= 8;
      password.classList.toggle('invalid', !valid);
      passwordError.textContent = valid ? '' : 'Password must be at least 8 characters.';
      passwordError.classList.toggle('show', !valid);
      return valid;
    }

    email.addEventListener('blur', validateEmail);
    password.addEventListener('blur', validatePassword);

    form.addEventListener('submit', (e) => {
      e.preventDefault();
      const emailValid = validateEmail();
      const passwordValid = validatePassword();
      if (emailValid && passwordValid) {
        // No backend — simulate a friendly redirect state.
        const submitBtn = form.querySelector('button[type="submit"] .btn-text');
        if (submitBtn) submitBtn.textContent = 'Signing in…';
        setTimeout(() => {
          window.location.href = 'home.html';
        }, 500);
      }
    });
  }
})();

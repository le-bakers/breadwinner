/* ============================================
   BreadWinner — Onboarding JS
   ============================================ */

(function () {
  'use strict';

  const steps = Array.from(document.querySelectorAll('.step-panel'));
  const progressFill = document.getElementById('progressFill');
  const progressBar = document.getElementById('progressBar');
  const progressLabel = document.getElementById('progressLabel');
  const backBtn = document.getElementById('backBtn');
  const nextBtn = document.getElementById('nextBtn');
  const stepDots = document.getElementById('stepDots');
  const accountForm = document.getElementById('accountForm');

  let current = 0; // index into steps[]
  const total = steps.length; // includes account form + tutorial slides + done

  // Build progress dots (excluding the account-form step, which uses the form's own submit button)
  const tourStartIndex = 1;
  const tourStepCount = steps.length - 2; // exclude account form (0) and done (last)
  for (let i = 0; i < tourStepCount; i++) {
    const dot = document.createElement('span');
    stepDots.appendChild(dot);
  }

  function updateProgress() {
    const pct = Math.round(((current + 1) / total) * 100);
    progressFill.style.width = pct + '%';
    progressBar.setAttribute('aria-valuenow', String(pct));

    if (current === 0) {
      progressLabel.textContent = 'Step 1 of 2 · Create your account';
    } else if (current === steps.length - 1) {
      progressLabel.textContent = "You're all set!";
    } else {
      progressLabel.textContent = 'Step 2 of 2 · Quick tour';
    }

    // Update dots
    const dots = Array.from(stepDots.children);
    dots.forEach((d, i) => {
      d.classList.toggle('active', i === current - tourStartIndex);
    });
    stepDots.style.visibility = (current >= tourStartIndex && current < steps.length - 1) ? 'visible' : 'hidden';
  }

  function goToStep(index) {
    if (index < 0 || index >= steps.length) return;

    steps[current].classList.remove('active');
    steps[current].setAttribute('hidden', '');

    current = index;

    steps[current].removeAttribute('hidden');
    // Force reflow so the transition replays
    void steps[current].offsetWidth;
    steps[current].classList.add('active');

    // Nav button visibility
    const isAccountStep = current === 0;
    const isDoneStep = current === steps.length - 1;

    backBtn.hidden = isAccountStep || isDoneStep;
    nextBtn.hidden = isAccountStep || isDoneStep;

    if (!isAccountStep && !isDoneStep) {
      nextBtn.querySelector('svg') && (nextBtn.textContent = ''); // no-op guard
    }

    updateProgress();

    // Move focus to the new step heading for accessibility
    const heading = steps[current].querySelector('h1, h2');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      heading.focus({ preventScroll: true });
    }

    // Trigger tutorial mock counters if entering a tour step
    animateTourCounters(steps[current]);

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  backBtn.addEventListener('click', () => goToStep(current - 1));
  nextBtn.addEventListener('click', () => goToStep(current + 1));

  /* ---------- Mini counter animation inside tutorial mockups ---------- */
  function animateTourCounters(panel) {
    const els = panel.querySelectorAll('[data-tour-counter]');
    els.forEach((el) => {
      if (el.dataset.animated === 'true') return;
      el.dataset.animated = 'true';
      const target = parseFloat(el.dataset.target || '0');
      const prefix = el.dataset.prefix || '';
      const duration = 900;
      const start = performance.now();

      function tick(now) {
        const progress = Math.min((now - start) / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);
        const value = Math.round(target * eased);
        el.textContent = prefix + value;
        if (progress < 1) requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    });
  }

  /* ---------- Password show/hide toggles ---------- */
  document.querySelectorAll('.toggle-password').forEach((btn) => {
    btn.addEventListener('click', () => {
      const targetId = btn.dataset.target;
      const input = document.getElementById(targetId);
      if (!input) return;
      const isText = input.type === 'text';
      input.type = isText ? 'password' : 'text';
      btn.setAttribute('aria-label', isText ? 'Show password' : 'Hide password');
    });
  });

  /* ---------- Password strength meter ---------- */
  const passwordInput = document.getElementById('password');
  const strengthBars = Array.from(document.querySelectorAll('.strength-bar'));
  const strengthLabel = document.getElementById('strengthLabel');

  function scorePassword(value) {
    let score = 0;
    if (value.length >= 8) score++;
    if (value.length >= 12) score++;
    if (/[A-Z]/.test(value) && /[a-z]/.test(value)) score++;
    if (/[0-9]/.test(value) && /[^A-Za-z0-9]/.test(value)) score++;
    return Math.min(score, 4);
  }

  const strengthNames = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthClasses = ['', 'weak', 'fair', 'good', 'strong'];

  if (passwordInput) {
    passwordInput.addEventListener('input', () => {
      const value = passwordInput.value;
      const score = value.length ? scorePassword(value) : 0;

      strengthBars.forEach((bar, i) => {
        bar.className = 'strength-bar';
        if (score > 0 && i < score) {
          bar.classList.add(strengthClasses[score]);
        }
      });
      strengthLabel.textContent = value.length ? strengthNames[score] : '';
    });
  }

  /* ---------- Account form validation ---------- */
  if (accountForm) {
    const fullName = document.getElementById('fullName');
    const dob = document.getElementById('dob');
    const email = document.getElementById('email');
    const password = document.getElementById('password');
    const confirmPassword = document.getElementById('confirmPassword');
    const agreeTerms = document.getElementById('agreeTerms');

    const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

    function showError(input, errorEl, message) {
      const invalid = !!message;
      input.classList.toggle('invalid', invalid);
      errorEl.textContent = message || '';
      errorEl.classList.toggle('show', invalid);
      return !invalid;
    }

    function validateFullName() {
      const value = fullName.value.trim();
      const errorEl = document.getElementById('fullName-error');
      if (!value) return showError(fullName, errorEl, 'Enter your full name.');
      if (value.length < 2) return showError(fullName, errorEl, 'Name looks too short.');
      return showError(fullName, errorEl, '');
    }

    function validateDob() {
      const errorEl = document.getElementById('dob-error');
      if (!dob.value) return showError(dob, errorEl, 'Enter your date of birth.');
      const dobDate = new Date(dob.value);
      const today = new Date();
      let age = today.getFullYear() - dobDate.getFullYear();
      const monthDiff = today.getMonth() - dobDate.getMonth();
      if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dobDate.getDate())) age--;
      if (age < 13) return showError(dob, errorEl, 'You must be at least 13 years old.');
      if (dobDate > today) return showError(dob, errorEl, 'Date of birth cannot be in the future.');
      return showError(dob, errorEl, '');
    }

    function validateEmail() {
      const errorEl = document.getElementById('email-error');
      const valid = emailPattern.test(email.value.trim());
      return showError(email, errorEl, valid ? '' : 'Enter a valid email address.');
    }

    function validatePassword() {
      const errorEl = document.getElementById('password-error');
      if (password.value.length < 8) return showError(password, errorEl, 'Password must be at least 8 characters.');
      return showError(password, errorEl, '');
    }

    function validateConfirmPassword() {
      const errorEl = document.getElementById('confirmPassword-error');
      if (confirmPassword.value !== password.value || !confirmPassword.value) {
        return showError(confirmPassword, errorEl, 'Passwords do not match.');
      }
      return showError(confirmPassword, errorEl, '');
    }

    function validateTerms() {
      const errorEl = document.getElementById('agreeTerms-error');
      const valid = agreeTerms.checked;
      errorEl.textContent = valid ? '' : 'Please accept the Terms and Privacy Policy to continue.';
      errorEl.classList.toggle('show', !valid);
      return valid;
    }

    fullName.addEventListener('blur', validateFullName);
    dob.addEventListener('blur', validateDob);
    email.addEventListener('blur', validateEmail);
    password.addEventListener('blur', validatePassword);
    confirmPassword.addEventListener('blur', validateConfirmPassword);
    agreeTerms.addEventListener('change', validateTerms);

    accountForm.addEventListener('submit', (e) => {
      e.preventDefault();
      const validations = [
        validateFullName(),
        validateDob(),
        validateEmail(),
        validatePassword(),
        validateConfirmPassword(),
        validateTerms(),
      ];

      if (validations.every(Boolean)) {
        // No backend — store the first name locally for the "done" screen greeting
        const firstName = fullName.value.trim().split(' ')[0];
        const doneNameEl = document.getElementById('doneNamePlaceholder');
        if (doneNameEl && firstName) doneNameEl.textContent = firstName;

        const submitBtn = accountForm.querySelector('button[type="submit"] .btn-text');
        if (submitBtn) submitBtn.textContent = 'Creating account…';

        setTimeout(() => {
          if (submitBtn) submitBtn.textContent = 'Create Account';
          goToStep(1);
        }, 500);
      } else {
        // Focus the first invalid field
        const firstInvalid = accountForm.querySelector('.invalid');
        if (firstInvalid) firstInvalid.focus();
      }
    });
  }

  // Initialize
  updateProgress();
})();

/* ============================================
   BreadWinner — Sign In Page JS
   ============================================ */

(function () {
  'use strict';

  const BW = window.BreadWinner || {};

  /* ---------- Google OAuth Handler ---------- */
  const GOOGLE_CLIENT_ID = "1097872808556-r9f8e34uq40s10v3hu3aaomdqi0vq6ft.apps.googleusercontent.com";
  let tokenClient = null;

  function initGoogleOAuth() {
    if (typeof google === 'undefined' || !google.accounts || !google.accounts.oauth2) {
      // Retry if script loading is delayed
      setTimeout(initGoogleOAuth, 100);
      return;
    }

    tokenClient = google.accounts.oauth2.initTokenClient({
      client_id: GOOGLE_CLIENT_ID,
      scope: 'https://www.googleapis.com/auth/userinfo.profile https://www.googleapis.com/auth/userinfo.email',
      callback: handleGoogleTokenResponse
    });

    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
      googleBtn.addEventListener('click', () => {
        if (tokenClient) {
          tokenClient.requestAccessToken();
        }
      });
    }
  }

  function handleGoogleTokenResponse(response) {
    if (response.error) {
      console.error('Google OAuth Error:', response.error);
      return;
    }

    if (response.access_token) {
      // Fetch user details from Google OAuth endpoint
      fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
        headers: { Authorization: `Bearer ${response.access_token}` }
      })
      .then((res) => res.json())
      .then((userData) => {
        console.log('Google User Data:', userData);
        
        // Auto-fill email field if present
        const emailInput = document.getElementById('email');
        if (emailInput && userData.email) {
          emailInput.value = userData.email;
        }

        // Persist the session, then redirect to the dashboard
        BW.signIn({
          method: 'google',
          email: userData.email || '',
          name: userData.name || ''
        });
        if (userData.name) BW.safeSet(BW.STORAGE.name, userData.name);
        if (userData.email) BW.safeSet(BW.STORAGE.email, userData.email);

        // Redirect to main page after successful authentication
        window.location.href = 'home.html';
      })
      .catch((err) => {
        console.error('Failed to fetch Google profile info:', err);
      });
    }
  }

  // Initialize OAuth when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initGoogleOAuth);
  } else {
    initGoogleOAuth();
  }

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
    if (panel) {
      panel.addEventListener('mouseenter', stopTimer);
      panel.addEventListener('mouseleave', startTimer);
    }
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

  /* ---------- Form validation UI only ---------- */
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
        const submitBtn = form.querySelector('button[type="submit"] .btn-text');
        if (submitBtn) submitBtn.textContent = 'Signing in…';
        setTimeout(() => {
          BW.signIn({ method: 'email', email: email.value.trim() });
          window.location.href = 'home.html';
        }, 500);
      }
    });
  }
})();

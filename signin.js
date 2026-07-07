// ============================================================
// BREADWINNER — signin.js
// Tab switch (sign in / create account), auto-advancing facts
// carousel, and a fake auth submit that hands off to home.html.
// No backend: we just stash a flag + fake profile in localStorage.
// ============================================================

(function () {
  // ---------- Tabs: sign in vs create account ----------
  const tabSignin = document.getElementById('tab-signin');
  const tabSignup = document.getElementById('tab-signup');
  const heading = document.getElementById('auth-heading');
  const subtext = document.getElementById('auth-subtext');
  const nameField = document.getElementById('field-name');
  const submitBtn = document.getElementById('submit-btn');

  const copy = {
    signin: {
      heading: 'Welcome back',
      sub: 'Sign in to see your gluten-free ledger.',
      submit: 'Sign in',
    },
    signup: {
      heading: 'Create your account',
      sub: 'Start a ledger for every receipt you scan.',
      submit: 'Create account',
    },
  };

  function setMode(mode) {
    const isSignup = mode === 'signup';
    tabSignin.classList.toggle('is-active', !isSignup);
    tabSignup.classList.toggle('is-active', isSignup);
    tabSignin.setAttribute('aria-selected', String(!isSignup));
    tabSignup.setAttribute('aria-selected', String(isSignup));
    nameField.hidden = !isSignup;

    const c = isSignup ? copy.signup : copy.signin;
    [heading, subtext, submitBtn].forEach((el) => el.classList.add('is-fading'));
    setTimeout(() => {
      heading.textContent = c.heading;
      subtext.textContent = c.sub;
      submitBtn.textContent = c.submit;
      [heading, subtext, submitBtn].forEach((el) => el.classList.remove('is-fading'));
    }, 160);
  }

  tabSignin.addEventListener('click', () => setMode('signin'));
  tabSignup.addEventListener('click', () => setMode('signup'));

  // ---------- Fake auth submit ----------
  const form = document.getElementById('auth-form');
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const email = form.email.value || 'you@example.com';
    const name = (form.name && form.name.value) || email.split('@')[0];

    localStorage.setItem('breadwinner_user', JSON.stringify({
      name,
      email,
      loggedInAt: new Date().toISOString(),
    }));

    submitBtn.textContent = 'Opening your ledger…';
    submitBtn.disabled = true;
    setTimeout(() => { window.location.href = 'home.html'; }, 500);
  });

  document.querySelector('.btn--google').addEventListener('click', () => {
    localStorage.setItem('breadwinner_user', JSON.stringify({
      name: 'Jamie Rivera',
      email: 'jamie.rivera@gmail.com',
      loggedInAt: new Date().toISOString(),
    }));
    window.location.href = 'home.html';
  });

  // ---------- Facts carousel ----------
  const facts = Array.from(document.querySelectorAll('.fact'));
  const dotsWrap = document.getElementById('facts-dots');
  let active = 0;

  facts.forEach((_, i) => {
    const dot = document.createElement('button');
    dot.className = 'facts__dot';
    dot.setAttribute('aria-label', `Show fact ${i + 1} of ${facts.length}`);
    dot.addEventListener('click', () => show(i));
    dotsWrap.appendChild(dot);
  });
  const dots = Array.from(dotsWrap.children);

  function show(i) {
    facts[active].classList.remove('is-active');
    dots[active].classList.remove('is-active');
    active = i;
    facts[active].classList.add('is-active');
    dots[active].classList.add('is-active');
  }

  show(0);

  const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  if (!prefersReducedMotion) {
    setInterval(() => show((active + 1) % facts.length), 5200);
  }
})();
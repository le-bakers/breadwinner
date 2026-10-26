// @ts-nocheck
import { pageUrl } from '../routes.js';
/* ============================================
   BreadWinner — Sign In Page JS
   ============================================ */
(function () {
    'use strict';
    const BW = window.BreadWinner || {};
    const cloud = BW.cloud; // cloud.js: real accounts when Supabase keys are set, otherwise demo mode
    const HOME = pageUrl('/home');
    // Wait for session restoration before deciding whether sign-in is needed.
    async function redirectIfSignedIn() {
        try {
            if (await cloud.getSignedInState())
                window.location.replace(HOME);
        }
        catch (error) {
            // An unavailable auth service leaves the sign-in form accessible.
        }
    }
    redirectIfSignedIn();
    window.addEventListener('pageshow', (event) => {
        if (event.persisted)
            redirectIfSignedIn();
    });
    // One line above the Sign In button for "wrong password" and so on
    const formMessage = document.getElementById('form-message');
    function showMessage(text, isError) {
        formMessage.textContent = text;
        formMessage.classList.toggle('error', Boolean(isError));
        formMessage.hidden = !text;
    }
    // Sent back here after Google login made a brand-new account (cloud.ts deletes it)
    try {
        const notice = sessionStorage.getItem('breadwinner_signin_notice');
        if (notice) {
            sessionStorage.removeItem('breadwinner_signin_notice');
            showMessage(notice, true);
        }
    }
    catch (error) { /* storage unavailable */ }
    // Demo mode (no database connected yet): any sign-in goes straight to the dashboard
    function demoSignIn(method, email) {
        BW.signIn({ method, email: email || '' });
        window.location.href = HOME;
    }
    /* ---------- Sign in with Google ---------- */
    const rememberBox = document.getElementById('remember');
    const googleBtn = document.getElementById('googleSignInBtn');
    if (googleBtn) {
        googleBtn.addEventListener('click', async () => {
            if (!cloud.enabled)
                return demoSignIn('demo');
            try {
                await cloud.signInWithGoogle(rememberBox.checked); // leaves for Google, comes back to the dashboard
            }
            catch (error) {
                showMessage(error.message, true);
            }
        });
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
            if (i === 0) {
                dot.classList.add('active');
                slide.classList.add('active');
            }
            dot.addEventListener('click', () => goTo(i));
            dotsWrap.appendChild(dot);
        });
        function goTo(index) {
            slides[current].classList.remove('active');
            slides[current].classList.add('exit-left');
            slides[current].setAttribute('aria-hidden', 'true');
            dotsWrap.children[current].classList.remove('active');
            current = index;
            slides.forEach((s, i) => { if (i !== current)
                s.classList.remove('exit-left'); });
            slides[current].classList.add('active');
            slides[current].setAttribute('aria-hidden', 'false');
            dotsWrap.children[current].classList.add('active');
            setTimeout(() => {
                slides.forEach((s, i) => { if (i !== current)
                    s.classList.remove('exit-left'); });
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
    /* ---------- Email + password form ---------- */
    const form = document.getElementById('signin-form');
    if (form) {
        const email = document.getElementById('email');
        const password = document.getElementById('password');
        const emailError = document.getElementById('email-error');
        const passwordError = document.getElementById('password-error');
        const submitText = form.querySelector('button[type="submit"] .btn-text');
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
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const emailValid = validateEmail();
            const passwordValid = validatePassword();
            if (!emailValid || !passwordValid)
                return;
            if (!cloud.enabled)
                return demoSignIn('email', email.value.trim());
            const buttonLabel = submitText.textContent;
            submitText.textContent = 'Signing in…';
            showMessage('');
            try {
                await cloud.signIn(email.value.trim(), password.value, rememberBox.checked);
                window.location.href = HOME;
            }
            catch (error) {
                showMessage(error.message, true);
                submitText.textContent = buttonLabel;
            }
        });
    }
})();

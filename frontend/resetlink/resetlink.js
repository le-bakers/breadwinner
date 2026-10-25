// @ts-nocheck
import '../shared.js';
import '../cloud.js';
const cloud = window.BreadWinner.cloud;
const form = document.getElementById('resetForm');
const fields = document.getElementById('resetFields');
const password = document.getElementById('newPassword');
const confirm = document.getElementById('confirmPassword');
const show = document.getElementById('showPassword');
const button = document.getElementById('savePassword');
const title = document.getElementById('resetTitle');
const description = document.getElementById('resetDescription');
const status = document.getElementById('resetStatus');
let saving = false;
let ready = false;
function message(text, error = false) {
    status.textContent = text;
    status.classList.toggle('error', error);
}
show.addEventListener('change', () => {
    password.type = confirm.type = show.checked ? 'text' : 'password';
});
confirm.addEventListener('input', () => {
    confirm.setCustomValidity('');
    confirm.removeAttribute('aria-invalid');
});
password.addEventListener('input', () => {
    confirm.setCustomValidity('');
    confirm.removeAttribute('aria-invalid');
});
form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (!ready || saving)
        return;
    confirm.setCustomValidity(password.value === confirm.value ? '' : 'Your passwords do not match.');
    confirm.setAttribute('aria-invalid', String(password.value !== confirm.value));
    if (!form.reportValidity())
        return;
    saving = true;
    fields.disabled = true;
    form.setAttribute('aria-busy', 'true');
    button.textContent = 'Saving…';
    message('');
    try {
        await cloud.setNewPassword(password.value);
        ready = false;
        form.reset();
        form.hidden = true;
        title.textContent = 'Password updated';
        description.textContent = 'Your new password is saved. Sign in to continue.';
        title.focus();
    }
    catch (error) {
        // Do not echo provider responses or callback parameters into the page.
        message('Could not save your password. Try again, or request a new reset link from sign in.', true);
    }
    finally {
        password.value = confirm.value = '';
        show.checked = false;
        password.type = confirm.type = 'password';
        saving = false;
        fields.disabled = !ready;
        form.removeAttribute('aria-busy');
        button.textContent = 'Save new password';
    }
});
async function initialize() {
    const params = new URLSearchParams(window.location.search);
    const hasCallback = Boolean(window.location.hash);
    try {
        if (!cloud.enabled)
            throw new Error('Unavailable');
        if (params.get('sent') === '1' && !hasCallback) {
            title.textContent = 'Check your email';
            description.textContent = 'A reset link has been requested for your account. Open the email to choose a new password.';
            message('Check your spam folder too. You can close this page while you wait.');
            document.getElementById('settingsLink').hidden = false;
            return;
        }
        await cloud.verifyPasswordRecovery();
        ready = true;
        title.textContent = 'Choose a new password';
        description.textContent = 'Enter and confirm your new password below.';
        form.hidden = false;
        fields.disabled = false;
        password.focus();
    }
    catch (error) {
        title.textContent = 'Open a new reset link';
        description.textContent = 'This link is missing, expired, or could not be verified.';
        message('Go to sign in, enter your email, and select “Forgot password?” to request another link.', true);
    }
    finally {
        // Remove credentials and callback errors from browser history after the SDK
        // has consumed them. The page also suppresses referrers and third-party assets.
        window.history.replaceState(null, '', window.location.pathname);
    }
}
initialize();

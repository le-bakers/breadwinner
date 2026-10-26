// @ts-nocheck
import { pageUrl } from '../routes.js';
/* ============================================
   BreadWinner â€” Settings page JS
   ============================================ */
(function () {
    'use strict';
    const BW = window.BreadWinner || {};
    const Settings = BW.Settings; // getSettings, saveSettings, updateSetting, applySettings
    if (!Settings)
        return;
    // Alias inner function so we can reference it before the object literal is assigned.
    const api = {
        get: Settings.getSettings,
        update: Settings.updateSetting
    };
    /* ---------- Render all controls from current settings ---------- */
    function renderFromSettings() {
        const s = api.get();
        document.querySelectorAll('#themeSegmented button').forEach((btn) => {
            btn.classList.toggle('active', btn.dataset.themeValue === s.theme);
            btn.setAttribute('aria-pressed', String(btn.dataset.themeValue === s.theme));
        });
        document.getElementById('dateFormatSelect').value = s.dateFormat;
    }
    /* ---------- Appearance: theme ---------- */
    document.querySelectorAll('#themeSegmented button').forEach((btn) => {
        btn.addEventListener('click', () => {
            api.update('theme', btn.dataset.themeValue);
            renderFromSettings();
            if (BW.toast)
                BW.toast('Theme set to ' + btn.dataset.themeValue);
        });
    });
    /* ---------- Date format ---------- */
    document.getElementById('dateFormatSelect').addEventListener('change', (e) => {
        api.update('dateFormat', e.target.value);
        if (BW.toast)
            BW.toast('Date format saved');
    });
    window.addEventListener('storage', renderFromSettings);
    function clearBrowserData() {
        [localStorage, sessionStorage].forEach((store) => {
            Object.keys(store).filter((key) => key.startsWith('breadwinner_')).forEach((key) => store.removeItem(key));
        });
    }
    /* ---------- Export data ---------- */
    const exportBtn = document.getElementById('exportDataBtn');
    if (exportBtn) {
        exportBtn.addEventListener('click', async () => {
            if (exportBtn.disabled)
                return;
            exportBtn.disabled = true;
            const status = document.getElementById('exportStatus');
            status.textContent = 'Preparing your download…';
            try {
                const data = {};
                const exportKeys = ['breadwinner_user_name', 'breadwinner_user_email', 'breadwinner_member_since', 'breadwinner_settings', 'breadwinner_receipts'];
                Object.keys(localStorage)
                    .filter((k) => exportKeys.includes(k))
                    .forEach((k) => {
                    const raw = localStorage.getItem(k);
                    try {
                        data[k] = JSON.parse(raw);
                    }
                    catch (e) {
                        data[k] = raw;
                    }
                });
                // Signed in with an account: the receipts are in the database, not on this device
                if (BW.cloud?.enabled) {
                    data.receipts = await BW.cloud.loadReceipts();
                    data.profilePhoto = await BW.cloud.loadProfilePhoto();
                }
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a');
                a.href = url;
                a.download = 'breadwinner-data.json';
                document.body.appendChild(a);
                a.click();
                a.remove();
                URL.revokeObjectURL(url);
                if (BW.toast)
                    BW.toast('Data exported');
                status.textContent = 'Download prepared. Store the file securely.';
            }
            catch (error) {
                status.textContent = 'Could not export your data. ' + (error.message || 'Try again.');
            }
            finally {
                exportBtn.disabled = false;
            }
        });
    }
    /* ---------- Clear all local data (danger zone) ---------- */
    const clearModal = BW.confirmModal(document.getElementById('clearDataModal'));
    document.getElementById('clearDataBtn').addEventListener('click', () => clearModal.open());
    document.getElementById('clearDataCancel').addEventListener('click', () => clearModal.close());
    document.getElementById('clearDataModal').addEventListener('click', (e) => {
        if (e.target.id === 'clearDataModal')
            clearModal.close();
    });
    document.getElementById('clearDataConfirm').addEventListener('click', async (e) => {
        e.target.disabled = true;
        try {
            if (BW.cloud?.enabled)
                await BW.cloud.signOut();
            clearBrowserData();
        }
        catch (error) {
            if (BW.toast)
                BW.toast('Could not clear all device data. Try again.');
            e.target.disabled = false;
            return;
        }
        clearModal.close();
        window.location.href = pageUrl('/signin');
    });
    /* ---------- Delete account (danger zone: wipe + sign out + redirect) ---------- */
    const deleteAccountModal = BW.confirmModal(document.getElementById('deleteAccountModal'));
    document.getElementById('deleteAccountBtn').addEventListener('click', () => deleteAccountModal.open());
    document.getElementById('deleteAccountCancel').addEventListener('click', () => deleteAccountModal.close());
    document.getElementById('deleteAccountModal').addEventListener('click', (e) => {
        if (e.target.id === 'deleteAccountModal')
            deleteAccountModal.close();
    });
    document.getElementById('deleteAccountConfirm').addEventListener('click', async (e) => {
        if (e.target.disabled)
            return;
        e.target.disabled = true;
        // Signed in with an account: delete it and every saved receipt from the database first
        if (BW.cloud.enabled) {
            try {
                await BW.cloud.deleteAccount();
            }
            catch (error) {
                deleteAccountModal.close();
                if (BW.toast)
                    BW.toast('Account not deleted: ' + error.message);
                e.target.disabled = false;
                return;
            }
        }
        try {
            clearBrowserData();
        }
        catch (e) { /* storage unavailable */ }
        if (BW.signOut)
            BW.signOut();
        window.location.href = pageUrl('/signin');
    });
    /* ---------- Sign out ---------- */
    document.getElementById('signOutBtn').addEventListener('click', async () => {
        if (BW.cloud.enabled) {
            try {
                await BW.cloud.signOut();
            }
            catch (e) { /* offline: still forget the login on this device below */ }
        }
        if (BW.signOut)
            BW.signOut();
        window.location.href = pageUrl('/signin');
    });
    // Say truthfully where the data lives
    if (BW.cloud?.enabled) {
        document.getElementById('storageNote').textContent = 'Receipts and your profile photo are saved to your cloud account. Profile details and display preferences are also stored in this browser. Clearing this device does not delete your cloud data.';
    }
    else {
        document.querySelector('#clearDataBtn').closest('.form-row').querySelector('.form-row-text span').textContent = 'Remove profile details, preferences, and local receipts from this browser. Export a copy first; this cannot be undone.';
        document.getElementById('deleteAccountBtn').closest('.form-row').hidden = true;
    }
    renderFromSettings();
})();
/* ============================================
   Profile page JS (merged from profile.js)
   Only activates if the profile markup is present.
   ============================================ */
(function () {
    'use strict';
    const BW = window.BreadWinner || {};
    const STORAGE = BW.STORAGE || {
        name: 'breadwinner_user_name',
        email: 'breadwinner_user_email',
        memberSince: 'breadwinner_member_since'
    };
    const get = BW.safeGet || ((k, f) => { try {
        const v = localStorage.getItem(k);
        return v === null ? f : v;
    }
    catch (e) {
        return f;
    } });
    const set = BW.safeSet || ((k, v) => { try {
        localStorage.setItem(k, v);
    }
    catch (e) { } });
    const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    /* ---------- Helpers: initials + default avatar background ---------- */
    const AVATAR_BG = 'linear-gradient(135deg,#22C55E,#16A34A)';
    function getInitials(name) {
        const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length)
            return 'JM';
        const first = parts[0].charAt(0).toUpperCase();
        const last = parts.length > 1 ? parts[parts.length - 1].charAt(0).toUpperCase() : '';
        return first + last;
    }
    /* ---------- Elements ---------- */
    const fullNameInput = document.getElementById('fullName');
    const emailInput = document.getElementById('email');
    const fullNameError = document.getElementById('fullName-error');
    const emailError = document.getElementById('email-error');
    const profileForm = document.getElementById('profileForm');
    const editBtn = document.getElementById('editProfileBtn');
    const cancelBtn = document.getElementById('cancelProfileBtn');
    const saveBtn = document.getElementById('saveProfileBtn');
    const summaryName = document.getElementById('summaryName');
    const summaryEmail = document.getElementById('summaryEmail');
    const avatarPreview = document.getElementById('avatarPreview');
    const editableFields = [fullNameInput];
    emailInput.readOnly = true;
    let snapshot = null; // values captured when Edit is clicked, restored on Cancel
    /* ---------- Render read-only summary + overview from real stored data only ---------- */
    function renderSummary() {
        const name = get(STORAGE.name, '');
        const email = get(STORAGE.email, '');
        summaryName.textContent = name || 'Your Name';
        summaryEmail.textContent = email || 'No email on file';
        if (avatarPreview && !BW.profilePhoto)
            avatarPreview.textContent = getInitials(name);
    }
    function loadFieldsFromStorage() {
        fullNameInput.value = get(STORAGE.name, '');
        emailInput.value = get(STORAGE.email, '');
    }
    /* ---------- Profile picture upload ---------- */
    const avatarUploadBtn = document.getElementById('avatarUploadBtn');
    const avatarUploadInput = document.getElementById('avatarUploadInput');
    const removePhotoBtn = document.getElementById('removePhotoBtn');
    // Center-crop and downscale before uploading to the private cloud profile.
    function resizeImage(file, size) {
        return new Promise((resolve, reject) => {
            const url = URL.createObjectURL(file);
            const img = new Image();
            img.onload = () => {
                const min = Math.min(img.width, img.height);
                const canvas = document.createElement('canvas');
                canvas.width = size;
                canvas.height = size;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, (img.width - min) / 2, (img.height - min) / 2, min, min, 0, 0, size, size);
                URL.revokeObjectURL(url);
                resolve(canvas.toDataURL('image/jpeg', 0.85));
            };
            img.onerror = () => {
                URL.revokeObjectURL(url);
                reject(new Error('Could not read that image.'));
            };
            img.src = url;
        });
    }
    function applyPhotoToAvatar(el, photo) {
        if (!el)
            return;
        el.classList.toggle('avatar-photo', !!photo);
        if (photo) {
            el.style.background = 'url("' + photo + '") center / cover no-repeat';
            el.textContent = '';
        }
        else {
            el.style.background = AVATAR_BG;
            el.textContent = getInitials(get(STORAGE.name, ''));
        }
    }
    function refreshAvatarPhoto() {
        const photo = BW.profilePhoto || '';
        applyPhotoToAvatar(avatarPreview, photo);
        applyPhotoToAvatar(document.querySelector('.avatar-circle'), photo);
        if (removePhotoBtn)
            removePhotoBtn.hidden = !photo;
    }
    async function handleAvatarFile(file) {
        if (!file)
            return;
        if (!file.type.startsWith('image/')) {
            if (BW.toast)
                BW.toast('Please choose an image file');
            return;
        }
        if (avatarUploadBtn.disabled)
            return;
        avatarUploadBtn.disabled = true;
        removePhotoBtn.disabled = true;
        const status = document.getElementById('profileSaveStatus');
        status.textContent = 'Uploading profile photo…';
        try {
            const dataUrl = await resizeImage(file, 256);
            if (!BW.cloud?.enabled)
                throw new Error('Sign in to a cloud account to save a profile photo.');
            await BW.cloud.saveProfilePhoto(dataUrl);
            refreshAvatarPhoto();
            status.textContent = 'Profile photo saved.';
            if (BW.toast)
                BW.toast('Profile picture updated');
        }
        catch (err) {
            status.textContent = 'Photo not saved. ' + (err.message || 'Try again.');
        }
        finally {
            avatarUploadBtn.disabled = false;
            removePhotoBtn.disabled = false;
        }
    }
    if (avatarUploadBtn && avatarUploadInput) {
        avatarUploadBtn.addEventListener('click', () => avatarUploadInput.click());
        avatarUploadInput.addEventListener('change', () => {
            const file = avatarUploadInput.files && avatarUploadInput.files[0];
            avatarUploadInput.value = '';
            handleAvatarFile(file);
        });
    }
    if (removePhotoBtn) {
        removePhotoBtn.addEventListener('click', async () => {
            if (removePhotoBtn.disabled)
                return;
            removePhotoBtn.disabled = true;
            avatarUploadBtn.disabled = true;
            const status = document.getElementById('profileSaveStatus');
            status.textContent = 'Removing profile photo…';
            try {
                await BW.cloud.saveProfilePhoto(null);
                refreshAvatarPhoto();
                status.textContent = 'Profile photo removed.';
                avatarUploadBtn.focus();
            }
            catch (error) {
                status.textContent = 'Photo not removed. ' + (error.message || 'Try again.');
            }
            finally {
                removePhotoBtn.disabled = false;
                avatarUploadBtn.disabled = false;
            }
        });
    }
    refreshAvatarPhoto();
    window.addEventListener('breadwinner:photo-changed', refreshAvatarPhoto);
    /* ---------- Edit / Save / Cancel ---------- */
    function enterEditMode() {
        snapshot = {
            name: fullNameInput.value,
            email: emailInput.value,
        };
        editableFields.forEach((el) => { el.disabled = false; });
        profileForm.classList.add('editing');
        profileForm.hidden = false;
        emailInput.disabled = false;
        updateSaveState();
        editBtn.hidden = true;
        fullNameInput.focus();
    }
    function exitEditMode() {
        editableFields.forEach((el) => { el.disabled = true; });
        profileForm.classList.remove('editing');
        profileForm.hidden = true;
        emailInput.disabled = true;
        editBtn.hidden = false;
        fullNameError.textContent = '';
        fullNameError.classList.remove('show');
        emailError.textContent = '';
        emailError.classList.remove('show');
        fullNameInput.classList.remove('invalid');
        emailInput.classList.remove('invalid');
        editBtn.focus();
    }
    function isDirty() {
        if (!snapshot)
            return false;
        return fullNameInput.value !== snapshot.name || emailInput.value !== snapshot.email;
    }
    function updateSaveState() {
        if (saveBtn)
            saveBtn.disabled = !isDirty();
    }
    function validate() {
        let valid = true;
        const name = fullNameInput.value.trim();
        const email = emailInput.value.trim();
        if (!name) {
            fullNameInput.classList.add('invalid');
            fullNameError.textContent = 'Full name is required.';
            fullNameError.classList.add('show');
            valid = false;
        }
        else {
            fullNameInput.classList.remove('invalid');
            fullNameError.textContent = '';
            fullNameError.classList.remove('show');
        }
        if (!EMAIL_PATTERN.test(email)) {
            emailInput.classList.add('invalid');
            emailError.textContent = 'Enter a valid email address.';
            emailError.classList.add('show');
            valid = false;
        }
        else {
            emailInput.classList.remove('invalid');
            emailError.textContent = '';
            emailError.classList.remove('show');
        }
        return valid;
    }
    /* ---------- Wire up events ---------- */
    window.addEventListener('breadwinner:auth-changed', () => {
        renderSummary();
        if (!profileForm.classList.contains('editing'))
            loadFieldsFromStorage();
    });
    editableFields.forEach((el) => el.addEventListener('input', updateSaveState));
    if (editBtn)
        editBtn.addEventListener('click', enterEditMode);
    if (cancelBtn) {
        cancelBtn.addEventListener('click', () => {
            if (snapshot) {
                fullNameInput.value = snapshot.name;
                emailInput.value = snapshot.email;
            }
            exitEditMode();
        });
    }
    if (profileForm) {
        profileForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (saveBtn.disabled)
                return;
            if (!validate())
                return;
            saveBtn.disabled = true;
            cancelBtn.disabled = true;
            const status = document.getElementById('profileSaveStatus');
            status.textContent = 'Saving profile…';
            try {
                const name = fullNameInput.value.trim();
                if (BW.cloud?.enabled)
                    await BW.cloud.updateProfile(name);
                set(STORAGE.name, name);
                renderSummary();
                exitEditMode();
                if (BW.toast)
                    BW.toast('Profile saved');
                status.textContent = 'Profile saved.';
            }
            catch (error) {
                status.textContent = 'Could not save your profile. ' + (error.message || 'Try again.');
                updateSaveState();
            }
            finally {
                cancelBtn.disabled = false;
            }
        });
    }
    /* ---------- Keep the top-nav avatar in sync with the stored name ---------- */
    const navAvatar = document.querySelector('.avatar-circle');
    if (navAvatar)
        navAvatar.textContent = getInitials(get(STORAGE.name, ''));
    if (profileForm) {
        loadFieldsFromStorage();
        renderSummary();
        if (avatarPreview)
            avatarPreview.style.background = AVATAR_BG;
        refreshAvatarPhoto();
    }
})();

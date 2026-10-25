// @ts-nocheck
import { pageUrl } from './routes.js';
/* ============================================
   BreadWinner — Accounts + saved receipts (Supabase)
   ============================================
   Paste your Supabase project's URL and public key below to turn real accounts on.
   Where: Supabase dashboard -> Project Settings -> API (or "Connect").
   Both are safe to put in website code: the database's privacy rules
   (backend/database.sql) decide who sees what, not these keys.

   Left empty = demo mode: no real accounts, receipts stay in this browser only. */
(function () {
    'use strict';
    const SUPABASE_URL = 'https://ddnncfschrbihtftzhve.supabase.co'; // looks like https://abcdefgh.supabase.co
    const SUPABASE_KEY = 'sb_publishable_vmFNYBY-trR9UfCpCoL7oQ_4B_MHzcm'; // the "anon public" / "publishable" key. NEVER the "service_role" / secret key
    const LIBRARY = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';
    const BW = window.BreadWinner = window.BreadWinner || {};
    const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
    // Capture the recovery hint before Supabase consumes the callback URL.
    // Read it now, before Supabase reads the address and tidies it away.
    const cameFromResetEmail = window.location.hash.includes('type=recovery');
    let recoveryUserId = null;
    let recoveryDeadline = 0;
    let passwordUpdatePending = false;
    /* ---------- "Remember me" ----------
       Ticked: stay signed in after the browser closes (localStorage).
       Not ticked: signed out when this tab closes (sessionStorage). */
    const REMEMBER_KEY = 'breadwinner_remember';
    const AUTH_KEY = 'breadwinner_auth';
    const DEADLINE_KEY = 'breadwinner_auth_expires_at';
    const REMEMBER_MS = 30 * 24 * 60 * 60 * 1000;
    let authState = null; // null = still checking / temporarily unavailable
    let resolving = null;
    let revision = 0;
    let callbackAuthentication = window.location.hash.includes('access_token=');
    let authenticating = false;
    let expiryTimer;
    const legacyPhoto = BW.safeGet(BW.STORAGE.photo, '');
    const legacyPhotoEmail = BW.safeGet(BW.STORAGE.email, '');
    let photoOwner = null;
    let photoRevision = 0;
    function setProfilePhoto(photo) {
        BW.profilePhoto = photo || '';
        window.dispatchEvent(new CustomEvent('breadwinner:photo-changed', { detail: {} }));
    }
    async function readProfilePhoto(userId, email) {
        const revision = ++photoRevision;
        const { data, error } = await (await supabase()).from('profile_photos').select('photo').eq('user_id', userId).maybeSingle();
        if (error)
            fail(error);
        let photo = data?.photo || '';
        // Preserve an existing local photo when it belongs to this account.
        // Leave the legacy copy intact if the migration/upload fails so it can retry.
        if (!data && legacyPhoto && email && email === legacyPhotoEmail && BW.safeGet(BW.STORAGE.photo, '') === legacyPhoto) {
            if (photoOwner !== userId || revision !== photoRevision)
                return photo;
            const { error: migrationError } = await (await supabase()).from('profile_photos').upsert({ user_id: userId, photo: legacyPhoto });
            if (migrationError)
                fail(migrationError);
            photo = legacyPhoto;
        }
        if (photoOwner === userId && revision === photoRevision) {
            BW.safeRemove(BW.STORAGE.photo);
            setProfilePhoto(photo);
        }
        return photo;
    }
    function publish(user, known = true) {
        authState = known ? Boolean(user) : null;
        if (known) {
            if (user)
                rememberPerson(user);
            else
                BW.signOut();
            const userId = user?.id || null;
            if (photoOwner !== userId) {
                photoOwner = userId;
                photoRevision++;
                setProfilePhoto('');
                if (userId)
                    readProfilePhoto(userId, user.email).catch(() => { });
            }
        }
        window.dispatchEvent(new CustomEvent('breadwinner:auth-changed', { detail: { signedIn: authState } }));
        clearTimeout(expiryTimer);
        if (user && known) {
            const remaining = Number(loginStore.getItem(DEADLINE_KEY)) - Date.now();
            if (remaining > 0)
                expiryTimer = setTimeout(() => {
                    BW.cloud.getUser().catch(() => { });
                }, Math.min(remaining, 2147483647));
        }
    }
    function expired() {
        if (sessionStorage.getItem(AUTH_KEY))
            return false;
        const deadline = Number(loginStore.getItem(DEADLINE_KEY));
        return deadline > 0 && Date.now() >= deadline;
    }
    function startWindow() {
        loginStore.setItem(DEADLINE_KEY, String(Date.now() + REMEMBER_MS));
    }
    function setRemember(keep) {
        try {
            localStorage.setItem(REMEMBER_KEY, keep ? 'yes' : 'no');
        }
        catch (e) { /* storage unavailable */ }
    }
    const loginStore = {
        getItem(key) {
            try {
                return sessionStorage.getItem(key) || localStorage.getItem(key);
            }
            catch (e) {
                return null;
            }
        },
        setItem(key, value) {
            try {
                // Refreshes keep the session in its original store, even if another tab
                // has since changed the Remember me preference.
                const keep = key === AUTH_KEY && !authenticating && !callbackAuthentication && sessionStorage.getItem(AUTH_KEY) ? false
                    : key === AUTH_KEY && !authenticating && !callbackAuthentication && localStorage.getItem(AUTH_KEY) ? true
                        : localStorage.getItem(REMEMBER_KEY) !== 'no';
                (keep ? localStorage : sessionStorage).setItem(key, value);
                (keep ? sessionStorage : localStorage).removeItem(key);
                if (key === AUTH_KEY && keep && (authenticating || callbackAuthentication || !localStorage.getItem(DEADLINE_KEY))) {
                    localStorage.setItem(DEADLINE_KEY, String(Date.now() + REMEMBER_MS));
                }
                if (key === AUTH_KEY && !keep)
                    localStorage.removeItem(DEADLINE_KEY);
            }
            catch (e) { /* storage unavailable */ }
        },
        removeItem(key) {
            try {
                localStorage.removeItem(key);
                sessionStorage.removeItem(key);
            }
            catch (e) { /* storage unavailable */ }
        }
    };
    /* ---------- Connecting ----------
       The Supabase library is only downloaded when keys are set, so demo mode stays light. */
    let connection = null;
    function supabase() {
        if (!connection) {
            connection = import(LIBRARY).then((library) => {
                const client = library.createClient(SUPABASE_URL, SUPABASE_KEY, {
                    auth: {
                        storage: loginStore,
                        storageKey: AUTH_KEY,
                        persistSession: true,
                        autoRefreshToken: true,
                        flowType: 'implicit',
                        detectSessionInUrl: true // finishes Google sign-in and reset links when the page opens
                    }
                });
                client.auth.onAuthStateChange((event, session) => {
                    // Do not call async auth methods inside this callback: Supabase holds
                    // its session lock until the callback returns.
                    revision++;
                    // A URL hint alone never authorizes a password change. Only the SDK's
                    // verified recovery event opens this short, in-memory reset window.
                    if (event === 'PASSWORD_RECOVERY' && session?.user) {
                        recoveryUserId = session.user.id;
                        recoveryDeadline = Date.now() + 15 * 60 * 1000;
                    }
                    else if (event === 'SIGNED_OUT' || (session?.user && session.user.id !== recoveryUserId)) {
                        recoveryUserId = null;
                        recoveryDeadline = 0;
                    }
                    if (event === 'SIGNED_OUT') {
                        loginStore.removeItem(DEADLINE_KEY);
                        publish(null);
                    }
                    else if (session && !expired() && session.expires_at * 1000 > Date.now()) {
                        publish(session.user);
                    }
                    else {
                        publish(null, false);
                    }
                    if (event === 'INITIAL_SESSION')
                        callbackAuthentication = false;
                });
                return client;
            }).catch((error) => { connection = null; throw error; });
        }
        return connection;
    }
    if (enabled)
        supabase().catch(() => publish(null, false));
    // Turns Supabase's error into a sentence for the user, and stops the action
    function fail(error) {
        const text = (error && error.message) || '';
        if (/invalid login credentials/i.test(text))
            throw new Error('That email and password don’t match an account.');
        if (/email not confirmed/i.test(text))
            throw new Error('Confirm your email first: open the link we sent you, then sign in.');
        if (/already registered|already been registered/i.test(text))
            throw new Error('An account with that email already exists. Sign in instead.');
        if (/failed to fetch|network|load failed/i.test(text))
            throw new Error('Can’t reach the server. Check your internet and try again.');
        throw new Error(text || 'Something went wrong. Please try again.');
    }
    // Full address of another page, worked out from where this file lives (works on localhost and Vercel)
    function pageAddress(path) {
        return new URL(path, import.meta.url).href;
    }
    // Keep the name and email the rest of the site already shows (greeting, avatar, navbar)
    function rememberPerson(user) {
        const details = user.user_metadata || {};
        const name = details.full_name || details.name || '';
        BW.signIn({ method: (user.app_metadata && user.app_metadata.provider) || 'email', email: user.email });
        if (name)
            BW.safeSet(BW.STORAGE.name, name);
        if (user.email)
            BW.safeSet(BW.STORAGE.email, user.email);
    }
    function terminalAuthError(error) {
        return ['refresh_token_not_found', 'refresh_token_already_used', 'session_not_found',
            'session_expired', 'user_not_found', 'user_banned', 'bad_jwt', 'invalid_credentials']
            .includes(error && error.code) || /invalid refresh token|refresh token.*(not found|expired|already used)/i.test(error && error.message || '');
    }
    async function forgetSession(client) {
        // Remove credentials immediately, including offline and expired sessions.
        loginStore.removeItem(AUTH_KEY);
        loginStore.removeItem(DEADLINE_KEY);
        revision++;
        publish(null);
        try {
            await client.auth.signOut({ scope: 'local' });
        }
        catch (e) { /* already forgotten locally */ }
    }
    // Google creates an account for anyone who signs in. The sign-in page only allows existing ones:
    // if this login just made a brand-new account, delete it and send them back with "account not found".
    const GOOGLE_INTENT_KEY = 'breadwinner_google_signin';
    const NOTICE_KEY = 'breadwinner_signin_notice';
    async function rejectNewGoogleAccount(client, user) {
        let intent;
        try {
            intent = localStorage.getItem(GOOGLE_INTENT_KEY);
        }
        catch (e) {
            return false;
        }
        if (!intent)
            return false;
        try {
            localStorage.removeItem(GOOGLE_INTENT_KEY);
        }
        catch (e) { /* storage unavailable */ }
        const justCreated = Math.abs(new Date(user.last_sign_in_at) - new Date(user.created_at)) < 60 * 1000;
        if (!justCreated)
            return false;
        await client.rpc('delete_my_account');
        try {
            sessionStorage.setItem(NOTICE_KEY, 'Account not found. Create an account first.');
        }
        catch (e) { /* storage unavailable */ }
        await forgetSession(client);
        return true;
    }
    async function resolveUser() {
        const client = await supabase();
        const before = revision;
        const { data, error } = await client.auth.getSession(); // waits for restoration and refresh
        if (before !== revision)
            return resolveUser(); // a sign-out/sign-in raced this check
        // OAuth callbacks must finish replacing an older session before applying
        // its retention deadline; getSession waits for that initialization.
        if (expired()) {
            await forgetSession(client);
            return null;
        }
        if (error) {
            if (terminalAuthError(error)) {
                await forgetSession(client);
                return null;
            }
            throw error;
        }
        const session = data && data.session;
        if (session && !(session.expires_at * 1000 > Date.now())) {
            throw new Error('Your session could not be refreshed. Check your connection and try again.');
        }
        if (session && await rejectNewGoogleAccount(client, session.user))
            return null;
        if (session) {
            // Migrate existing remembered sessions without extending on future refreshes.
            if (localStorage.getItem(AUTH_KEY) && !loginStore.getItem(DEADLINE_KEY))
                startWindow();
            publish(session.user);
            return session.user;
        }
        loginStore.removeItem(DEADLINE_KEY);
        publish(null);
        return null;
    }
    /* ---------- Receipts: website shape <-> database row ---------- */
    function toRow(receipt) {
        return {
            id: receipt.id,
            store_name: receipt.name,
            receipt_date: receipt.date, // "2026-10-18"
            subtotal: receipt.subtotal, // number or null
            extra_cost: receipt.overcharge || 0, // the gluten-free extra cost on this receipt
            photo: receipt.imageUrl || null, // small JPEG as a data: address
            lines: receipt.lines
        };
    }
    function fromRow(row) {
        return {
            id: row.id,
            name: row.store_name,
            date: row.receipt_date,
            subtotal: row.subtotal === null ? null : Number(row.subtotal),
            imageUrl: row.photo,
            lines: row.lines
        };
    }
    // Saves go out one at a time, so a slow older save can never overwrite a newer one
    let saveLine = Promise.resolve();
    function oneAtATime(job) {
        const run = saveLine.then(job);
        saveLine = run.catch(() => { });
        return run;
    }
    BW.cloud = {
        enabled,
        cameFromResetEmail,
        get signedIn() { return authState; },
        async getSignedInState() {
            if (!enabled)
                return BW.isSignedIn();
            return Boolean(await this.getUser());
        },
        // Who is signed in on this browser (null = nobody)
        async getUser() {
            if (!resolving) {
                resolving = resolveUser().catch((error) => {
                    publish(null, false);
                    throw error;
                }).finally(() => { resolving = null; });
            }
            return resolving;
        },
        async signIn(email, password, keep) {
            setRemember(keep);
            const client = await supabase();
            authenticating = true;
            let result;
            try {
                result = await client.auth.signInWithPassword({ email, password });
            }
            finally {
                authenticating = false;
            }
            const { data, error } = result;
            if (error)
                fail(error);
            if (keep)
                startWindow();
            else
                loginStore.removeItem(DEADLINE_KEY);
            publish(data.user);
        },
        // Returns true when the person is signed in right away,
        // false when Supabase first wants them to click the link in a confirmation email
        async signUp(fullName, email, password) {
            setRemember(true);
            const client = await supabase();
            authenticating = true;
            let result;
            try {
                result = await client.auth.signUp({
                    email,
                    password,
                    options: { data: { full_name: fullName }, emailRedirectTo: pageAddress('home/home.html') }
                });
            }
            finally {
                authenticating = false;
            }
            const { data, error } = result;
            if (error)
                fail(error);
            // Supabase answers an already-used email with a user that has no identities (so strangers can't test emails)
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                fail({ message: 'already registered' });
            }
            if (data.session) {
                startWindow();
                publish(data.user);
            }
            return Boolean(data.session);
        },
        // Leaves for Google's page, then comes back signed in on the dashboard
        async signInWithGoogle(keep) {
            setRemember(keep);
            try {
                localStorage.setItem(GOOGLE_INTENT_KEY, 'yes');
            }
            catch (e) { /* storage unavailable */ }
            const { error } = await (await supabase()).auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: pageAddress('home/home.html') }
            });
            if (error)
                fail(error);
        },
        async sendPasswordReset(email) {
            const { error } = await (await supabase()).auth.resetPasswordForEmail(email, {
                redirectTo: pageAddress('resetlink/resetlink.html')
            });
            if (error)
                fail(error);
        },
        async updateProfile(fullName) {
            const { data, error } = await (await supabase()).auth.updateUser({ data: { full_name: fullName } });
            if (error)
                fail(error);
            rememberPerson(data.user);
        },
        async loadProfilePhoto() {
            const user = await this.getUser();
            if (!user)
                throw new Error('Sign in to load your profile photo.');
            return readProfilePhoto(user.id, user.email);
        },
        async saveProfilePhoto(photo) {
            const user = await this.getUser();
            if (!user)
                throw new Error('Sign in to change your profile photo.');
            if (photo && (!/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(photo) || photo.length > 150000)) {
                throw new Error('Choose a smaller profile photo.');
            }
            // Invalidate any older read before it can replace a newly uploaded photo.
            photoRevision++;
            const table = (await supabase()).from('profile_photos');
            const { error } = photo
                ? await table.upsert({ user_id: user.id, photo })
                : await table.delete().eq('user_id', user.id);
            if (error)
                fail(error);
            photoRevision++;
            if (photoOwner === user.id) {
                BW.safeRemove(BW.STORAGE.photo);
                setProfilePhoto(photo);
            }
        },
        async verifyPasswordRecovery() {
            const client = await supabase();
            // Wait for callback processing, including PASSWORD_RECOVERY, to finish.
            const { data: sessionData, error: sessionError } = await client.auth.getSession();
            if (sessionError || !recoveryUserId || Date.now() >= recoveryDeadline || sessionData?.session?.user?.id !== recoveryUserId) {
                throw new Error('This reset link is invalid or expired. Request a new link from sign in.');
            }
            const { data, error } = await client.auth.getUser();
            if (error || data?.user?.id !== recoveryUserId) {
                throw new Error('Could not verify this reset link. Open a new link from your email.');
            }
            return true;
        },
        async setNewPassword(password) {
            if (passwordUpdatePending)
                throw new Error('A password update is already in progress.');
            if (typeof password !== 'string' || password.length < 12 || password.length > 128) {
                throw new Error('Use between 12 and 128 characters for your password.');
            }
            passwordUpdatePending = true;
            try {
                await this.verifyPasswordRecovery();
                const { error } = await (await supabase()).auth.updateUser({ password });
                if (error)
                    fail(error);
                recoveryUserId = null;
                recoveryDeadline = 0;
                // Password saved: forget recovery credentials even if sign-out is offline.
                try {
                    await this.signOut();
                }
                catch (e) { /* local credentials cleared in finally */ }
            }
            finally {
                passwordUpdatePending = false;
            }
        },
        async signOut() {
            try {
                await (await supabase()).auth.signOut();
            }
            finally {
                // Even if the internet is down, forget the login on this device
                loginStore.removeItem(AUTH_KEY);
                loginStore.removeItem(DEADLINE_KEY);
                revision++;
                publish(null);
            }
        },
        // The signed-in person's receipts, newest first. The privacy rules return only theirs.
        async loadReceipts() {
            const { data, error } = await (await supabase())
                .from('receipts')
                .select('id, store_name, receipt_date, subtotal, photo, lines')
                .order('receipt_date', { ascending: false })
                .order('created_at', { ascending: false });
            if (error)
                fail(error);
            return data.map(fromRow);
        },
        // Adds the receipt, or updates it if it was saved before (same id)
        saveReceipt(receipt) {
            if (!receipt.id)
                receipt.id = crypto.randomUUID();
            return oneAtATime(async () => {
                const { error } = await (await supabase()).from('receipts').upsert(toRow(receipt));
                if (error)
                    fail(error);
            });
        },
        deleteReceipt(receipt) {
            return oneAtATime(async () => {
                const { error } = await (await supabase()).from('receipts').delete().eq('id', receipt.id);
                if (error)
                    fail(error);
            });
        },
        // Deletes the account and every receipt in it (see delete_my_account in backend/database.sql)
        async deleteAccount() {
            const { error } = await (await supabase()).rpc('delete_my_account');
            if (error)
                fail(error);
            await this.signOut();
        }
    };
    if (enabled) {
        const recheck = () => BW.cloud.getUser().catch(() => { });
        window.addEventListener('pageshow', recheck);
        window.addEventListener('online', recheck);
        window.addEventListener('storage', (event) => {
            if (event.key === null || event.key.startsWith(AUTH_KEY))
                recheck();
        });
        recheck();
    }
    /* ---------- Private pages ----------
       A page marked <html data-protected> stays hidden (see shared.css) until we know
       the visitor is signed in. Otherwise they are sent to the sign-in page. */
    if (document.documentElement.hasAttribute('data-protected')) {
        let notice;
        function showRetry() {
            document.documentElement.classList.remove('auth-ok');
            if (notice)
                return;
            notice = document.createElement('p');
            notice.setAttribute('role', 'status');
            notice.style.visibility = 'visible';
            notice.textContent = 'Could not check your sign-in. Check your connection and try again. ';
            const retry = document.createElement('button');
            retry.type = 'button';
            retry.className = 'btn btn-secondary';
            retry.textContent = 'Retry';
            retry.addEventListener('click', () => window.location.reload());
            notice.appendChild(retry);
            document.body.prepend(notice);
        }
        function applyAccess(signedIn) {
            if (signedIn === null)
                return;
            if (notice) {
                notice.remove();
                notice = null;
            }
            document.documentElement.classList.toggle('auth-ok', signedIn);
            if (!signedIn)
                window.location.replace(pageUrl('/signin'));
        }
        const checkLogin = async () => {
            try {
                applyAccess(await BW.cloud.getSignedInState());
            }
            catch (error) {
                showRetry();
            }
        };
        window.addEventListener('breadwinner:auth-changed', (event) => applyAccess(event.detail.signedIn));
        checkLogin();
        // Back button after signing out can show the old page from memory: check again
        window.addEventListener('pageshow', (event) => { if (event.persisted)
            checkLogin(); });
    }
})();

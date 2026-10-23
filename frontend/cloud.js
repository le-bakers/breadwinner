// @ts-nocheck
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
    const LIBRARY = new URL('vendor/supabase.js', import.meta.url).href;
    const BW = window.BreadWinner = window.BreadWinner || {};
    const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);
    // A password-reset email links back to the sign-in page with "type=recovery" in the address.
    // Read it now, before Supabase reads the address and tidies it away.
    const cameFromResetEmail = window.location.hash.includes('type=recovery') || new URLSearchParams(location.search).get('flow') === 'recovery';
    /* ---------- "Remember me" ----------
       Ticked: stay signed in after the browser closes (localStorage).
       Not ticked: signed out when this tab closes (sessionStorage). */
    const REMEMBER_KEY = 'breadwinner_remember';
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
                const keep = localStorage.getItem(REMEMBER_KEY) === 'yes';
                (keep ? localStorage : sessionStorage).setItem(key, value);
                (keep ? sessionStorage : localStorage).removeItem(key);
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
            connection = import(LIBRARY).then((library) => library.createClient(SUPABASE_URL, SUPABASE_KEY, {
                auth: {
                    storage: loginStore,
                    storageKey: 'breadwinner_auth', // starts with breadwinner_ so Settings -> Clear Data removes it too
                    flowType: 'pkce',
                    detectSessionInUrl: true // finishes Google sign-in and reset links when the page opens
                }
            }));
        }
        return connection;
    }
    if (enabled)
        supabase().catch(() => { });
    // Turns Supabase's error into a sentence for the user, and stops the action
    function fail(error) {
        const text = (error && error.message) || '';
        if (/invalid login credentials/i.test(text))
            throw new Error('That email and password don’t match an account.');
        if (/email not confirmed/i.test(text))
            throw new Error('Confirm your email first: open the link we sent you, then sign in.');
        if (/already registered|already been registered/i.test(text))
            throw new Error('Check your email for the next step, or try signing in.');
        if (/failed to fetch|network|load failed/i.test(text))
            throw new Error('Can’t reach the server. Check your internet and try again.');
        throw new Error('The action could not be completed. Please try again.');
    }
    // Full address of another page, worked out from where this file lives (works on localhost and Vercel)
    function pageAddress(path) {
        return new URL(path, import.meta.url).href;
    }
    // Keep the name and email the rest of the site already shows (greeting, avatar, navbar)
    function rememberPerson(user) {
        const previous = BW.safeGet('breadwinner_user_id', '');
        if (previous !== user.id)
            BW.clearPrivateLocalData();
        BW.safeSet('breadwinner_user_id', user.id);
        const details = user.user_metadata || {};
        const name = details.full_name || details.name || '';
        if (!BW.isSignedIn())
            BW.signIn({ method: (user.app_metadata && user.app_metadata.provider) || 'email', email: user.email });
        if (name)
            BW.safeSet(BW.STORAGE.name, name);
        if (user.email)
            BW.safeSet(BW.STORAGE.email, user.email);
        window.dispatchEvent(new CustomEvent('breadwinner:identity-changed'));
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
        // Who is signed in on this browser (null = nobody)
        async getUser() {
            const { data, error } = await (await supabase()).auth.getUser();
            const user = error ? null : data.user;
            if (user)
                rememberPerson(user);
            return user;
        },
        async signIn(email, password, keep) {
            setRemember(keep);
            const { data, error } = await (await supabase()).auth.signInWithPassword({ email, password });
            if (error)
                fail(error);
            rememberPerson(data.user);
        },
        // Returns true when the person is signed in right away,
        // false when Supabase first wants them to click the link in a confirmation email
        async signUp(fullName, email, password) {
            if (password.length < 12 || password.length > 128)
                throw new Error('Use a password of 12 to 128 characters.');
            setRemember(false);
            const { data, error } = await (await supabase()).auth.signUp({
                email,
                password,
                options: { data: { full_name: fullName, terms_version: '2026-10-22' }, emailRedirectTo: pageAddress('home/home.html') }
            });
            if (error)
                fail(error);
            // Supabase answers an already-used email with a user that has no identities (so strangers can't test emails)
            if (data.user && data.user.identities && data.user.identities.length === 0) {
                return false;
            }
            if (data.session)
                rememberPerson(data.user);
            return Boolean(data.session);
        },
        // Leaves for Google's page, then comes back signed in on the dashboard
        async signInWithGoogle(keep) {
            setRemember(keep);
            const { error } = await (await supabase()).auth.signInWithOAuth({
                provider: 'google',
                options: { redirectTo: pageAddress('home/home.html') }
            });
            if (error)
                fail(error);
        },
        async sendPasswordReset(email) {
            const { error } = await (await supabase()).auth.resetPasswordForEmail(email, {
                redirectTo: pageAddress('signin/signin.html?flow=recovery')
            });
            if (error)
                fail(error);
        },
        async setNewPassword(password) {
            if (password.length < 12 || password.length > 128)
                throw new Error('Use a password of 12 to 128 characters.');
            const { error } = await (await supabase()).auth.updateUser({ password });
            if (error)
                fail(error);
        },
        async updateProfile(fullName, email) {
            const client = await supabase();
            const { data: current, error: lookupError } = await client.auth.getUser();
            if (lookupError || !current.user)
                throw new Error('Sign in again to update your profile.');
            const changedEmail = email !== current.user.email;
            const patch = { data: { full_name: fullName } };
            if (changedEmail)
                patch.email = email;
            const { data, error } = await client.auth.updateUser(patch);
            if (error)
                fail(error);
            rememberPerson(data.user);
            return changedEmail;
        },
        async signOut() {
            try {
                await (await supabase()).auth.signOut();
            }
            finally {
                // Even if the internet is down, forget the login on this device
                loginStore.removeItem('breadwinner_auth');
                loginStore.removeItem('breadwinner_auth-code-verifier');
                BW.signOut();
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
        async exportAccountData() {
            const client = await supabase();
            const { data: account, error: accountError } = await client.auth.getUser();
            if (accountError || !account.user)
                throw new Error('Sign in again to export your account.');
            const { data: consent, error } = await client.from('account_consents')
                .select('terms_version, health_version, adult_confirmed, health_processing, accepted_at');
            if (error)
                fail(error);
            if (!consent.length)
                throw new Error('For access without renewed receipt consent, email support.breadwinner@gmail.com.');
            return {
                account: { id: account.user.id, email: account.user.email, name: account.user.user_metadata?.full_name || '', created_at: account.user.created_at },
                consent,
                receipts: await this.loadReceipts()
            };
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
        },
        async accessToken() {
            const { data, error } = await (await supabase()).auth.getSession();
            if (error || !data.session)
                throw new Error('Sign in to continue.');
            return data.session.access_token;
        },
        async ensureConsent() {
            if (!enabled)
                return;
            const client = await supabase();
            const { data, error } = await client.from('account_consents').select('terms_version')
                .eq('terms_version', '2026-10-22').eq('health_version', '2026-10-22').limit(1);
            if (error)
                throw new Error('Privacy preferences could not be loaded. Try again shortly.');
            if (data.length)
                return;
            await new Promise((resolve, reject) => {
                const dialog = document.createElement('dialog');
                dialog.className = 'privacy-dialog';
                dialog.setAttribute('aria-labelledby', 'consentTitle');
                dialog.innerHTML = '<form><h2 id="consentTitle">Before you track receipts</h2>' +
                    '<p>Receipts and gluten-free classifications can reveal health information. Read our <a href="../legal/health-data.html" target="_blank" rel="noopener noreferrer">Consumer Health Data notice</a> and <a href="../legal/privacy.html" target="_blank" rel="noopener noreferrer">Privacy Policy</a>.</p>' +
                    '<label><input type="checkbox" name="terms" required> I am at least 18 and the age of majority where I live, and agree to the <a href="../legal/terms.html" target="_blank" rel="noopener noreferrer">Terms of Service</a>.</label>' +
                    '<label><input type="checkbox" name="health" required> I consent to BreadWinner collecting and processing my receipt images, purchases, and gluten-free classifications to provide the tracking and comparison features I request, using its hosting and database processors.</label>' +
                    '<p>Receipt OCR runs on the BreadWinner server. Photos are not sent to a cloud AI provider in this release. You can withdraw in Settings, export data, or delete your account.</p>' +
                    '<p role="alert" class="consent-error"></p><div class="privacy-actions"><button class="btn btn-secondary" type="button">Leave without accepting</button><button class="btn btn-primary" type="submit">Save my choices</button></div></form>';
                document.body.appendChild(dialog);
                const leave = async () => {
                    dialog.close();
                    dialog.remove();
                    await BW.cloud.signOut();
                    location.href = '../index/index.html';
                    reject(new Error('Privacy consent was not given.'));
                };
                dialog.querySelector('button[type="button"]').addEventListener('click', leave);
                dialog.addEventListener('cancel', (event) => { event.preventDefault(); leave(); });
                dialog.querySelector('form').addEventListener('submit', async (event) => {
                    event.preventDefault();
                    const submit = dialog.querySelector('button[type="submit"]');
                    submit.disabled = true;
                    const { error: saveError } = await client.from('account_consents').insert({
                        terms_version: '2026-10-22', health_version: '2026-10-22',
                        adult_confirmed: true, health_processing: true
                    });
                    if (saveError && saveError.code !== '23505') {
                        dialog.querySelector('.consent-error').textContent = 'Choices could not be saved. Please try again.';
                        submit.disabled = false;
                        return;
                    }
                    dialog.close();
                    dialog.remove();
                    resolve();
                });
                dialog.showModal();
            });
        },
        async withdrawConsent() {
            const { data: { user } } = await (await supabase()).auth.getUser();
            if (!user)
                throw new Error('Sign in to continue.');
            const { error } = await (await supabase()).from('account_consents').delete().eq('user_id', user.id);
            if (error)
                fail(error);
            await this.signOut();
        }
    };
})();
export {};

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

  const SUPABASE_URL = 'https://ddnncfschrbihtftzhve.supabase.co';  // looks like https://abcdefgh.supabase.co
  const SUPABASE_KEY = 'sb_publishable_vmFNYBY-trR9UfCpCoL7oQ_4B_MHzcm';  // the "anon public" / "publishable" key. NEVER the "service_role" / secret key
  const LIBRARY = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/+esm';

  const BW = window.BreadWinner = window.BreadWinner || {};
  const enabled = Boolean(SUPABASE_URL && SUPABASE_KEY);

  // A password-reset email links back to the sign-in page with "type=recovery" in the address.
  // Read it now, before Supabase reads the address and tidies it away.
  const cameFromResetEmail = window.location.hash.includes('type=recovery');

  /* ---------- "Remember me" ----------
     Ticked: stay signed in after the browser closes (localStorage).
     Not ticked: signed out when this tab closes (sessionStorage). */
  const REMEMBER_KEY = 'breadwinner_remember';
  function setRemember(keep) {
    try { localStorage.setItem(REMEMBER_KEY, keep ? 'yes' : 'no'); } catch (e) { /* storage unavailable */ }
  }
  const loginStore = {
    getItem(key) {
      try { return sessionStorage.getItem(key) || localStorage.getItem(key); } catch (e) { return null; }
    },
    setItem(key, value) {
      try {
        const keep = localStorage.getItem(REMEMBER_KEY) !== 'no';
        (keep ? localStorage : sessionStorage).setItem(key, value);
        (keep ? sessionStorage : localStorage).removeItem(key);
      } catch (e) { /* storage unavailable */ }
    },
    removeItem(key) {
      try { localStorage.removeItem(key); sessionStorage.removeItem(key); } catch (e) { /* storage unavailable */ }
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
          storageKey: 'breadwinner_auth',  // starts with breadwinner_ so Settings -> Clear Data removes it too
          flowType: 'implicit',
          detectSessionInUrl: true         // finishes Google sign-in and reset links when the page opens
        }
      }));
    }
    return connection;
  }
  if (enabled) supabase();  // start now, so the sign-in link in the address bar is read right away

  // Turns Supabase's error into a sentence for the user, and stops the action
  function fail(error) {
    const text = (error && error.message) || '';
    if (/invalid login credentials/i.test(text)) throw new Error('That email and password don’t match an account.');
    if (/email not confirmed/i.test(text)) throw new Error('Confirm your email first: open the link we sent you, then sign in.');
    if (/already registered|already been registered/i.test(text)) throw new Error('An account with that email already exists. Sign in instead.');
    if (/failed to fetch|network|load failed/i.test(text)) throw new Error('Can’t reach the server. Check your internet and try again.');
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
    if (!BW.isSignedIn()) BW.signIn({ method: (user.app_metadata && user.app_metadata.provider) || 'email', email: user.email });
    if (name) BW.safeSet(BW.STORAGE.name, name);
    if (user.email) BW.safeSet(BW.STORAGE.email, user.email);
  }

  /* ---------- Receipts: website shape <-> database row ---------- */
  function toRow(receipt) {
    return {
      id: receipt.id,
      store_name: receipt.name,
      receipt_date: receipt.date,           // "2026-10-18"
      subtotal: receipt.subtotal,           // number or null
      extra_cost: receipt.overcharge || 0,  // the gluten-free extra cost on this receipt
      photo: receipt.imageUrl || null,      // small JPEG as a data: address
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
    saveLine = run.catch(() => {});
    return run;
  }

  BW.cloud = {
    enabled,
    cameFromResetEmail,

    // Who is signed in on this browser (null = nobody)
    async getUser() {
      const { data } = await (await supabase()).auth.getSession();
      const user = data.session ? data.session.user : null;
      if (user) rememberPerson(user);
      return user;
    },

    async signIn(email, password, keep) {
      setRemember(keep);
      const { data, error } = await (await supabase()).auth.signInWithPassword({ email, password });
      if (error) fail(error);
      rememberPerson(data.user);
    },

    // Returns true when the person is signed in right away,
    // false when Supabase first wants them to click the link in a confirmation email
    async signUp(fullName, email, password) {
      setRemember(true);
      const { data, error } = await (await supabase()).auth.signUp({
        email,
        password,
        options: { data: { full_name: fullName }, emailRedirectTo: pageAddress('home/home.html') }
      });
      if (error) fail(error);
      // Supabase answers an already-used email with a user that has no identities (so strangers can't test emails)
      if (data.user && data.user.identities && data.user.identities.length === 0) {
        fail({ message: 'already registered' });
      }
      if (data.session) rememberPerson(data.user);
      return Boolean(data.session);
    },

    // Leaves for Google's page, then comes back signed in on the dashboard
    async signInWithGoogle(keep) {
      setRemember(keep);
      const { error } = await (await supabase()).auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: pageAddress('home/home.html') }
      });
      if (error) fail(error);
    },

    async sendPasswordReset(email) {
      const { error } = await (await supabase()).auth.resetPasswordForEmail(email, {
        redirectTo: pageAddress('signin/signin.html')
      });
      if (error) fail(error);
    },

    async setNewPassword(password) {
      const { error } = await (await supabase()).auth.updateUser({ password });
      if (error) fail(error);
    },

    async signOut() {
      try { await (await supabase()).auth.signOut(); }
      finally {
        // Even if the internet is down, forget the login on this device
        loginStore.removeItem('breadwinner_auth');
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
      if (error) fail(error);
      return data.map(fromRow);
    },

    // Adds the receipt, or updates it if it was saved before (same id)
    saveReceipt(receipt) {
      if (!receipt.id) receipt.id = crypto.randomUUID();
      return oneAtATime(async () => {
        const { error } = await (await supabase()).from('receipts').upsert(toRow(receipt));
        if (error) fail(error);
      });
    },

    deleteReceipt(receipt) {
      return oneAtATime(async () => {
        const { error } = await (await supabase()).from('receipts').delete().eq('id', receipt.id);
        if (error) fail(error);
      });
    },

    // Deletes the account and every receipt in it (see delete_my_account in backend/database.sql)
    async deleteAccount() {
      const { error } = await (await supabase()).rpc('delete_my_account');
      if (error) fail(error);
      await this.signOut();
    }
  };
})();

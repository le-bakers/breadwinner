import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const routesSource = (await readFile(new URL('./routes.js', import.meta.url), 'utf8'))
  .replaceAll('import.meta.url', JSON.stringify('https://breadwinner.test/routes.js'));
const { pageUrl, assetUrl } = await import('data:text/javascript;base64,' + Buffer.from(routesSource).toString('base64'));
const source = (await readFile(new URL('./cloud.js', import.meta.url), 'utf8'))
  .replace(/^import .* from ['"].*routes\.js['"];?\r?$/m, '')
  .replace('import(LIBRARY)', 'Promise.resolve(library)')
  .replaceAll('import.meta.url', JSON.stringify('https://breadwinner.test/cloud.js'))
  .replace(/export\s*\{\s*\};?/g, '');
const navbarSource = (await readFile(new URL('./components/navbar.js', import.meta.url), 'utf8'))
  .replace(/^import .* from ['"].*routes\.js['"];?\r?$/m, '')
  .replaceAll(/import\('\.\.\/(shared|cloud)\.js'\)/g, 'Promise.resolve()')
  .replace(/export\s*\{\s*\};?/g, '');
const signinSource = (await readFile(new URL('./signin/signin.js', import.meta.url), 'utf8'))
  .replace(/^import .* from ['"].*routes\.js['"];?\r?$/m, '');
const onboardingSource = (await readFile(new URL('./onboarding/onboarding.js', import.meta.url), 'utf8'))
  .replace(/^import .* from ['"].*routes\.js['"];?\r?$/m, '');
const AUTH = 'breadwinner_auth';
const DEADLINE = 'breadwinner_auth_expires_at';
const WINDOW = 30 * 24 * 60 * 60 * 1000;
const NOW = 1800000000000;
const user = { id: 'user-1', email: 'test@example.com', user_metadata: { full_name: 'Test Person' } };
const session = () => ({ user, expires_at: (NOW + 3600000) / 1000, refresh_token: 'refresh' });
const flush = () => new Promise(resolve => setImmediate(resolve));

function storage(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: key => values.get(key) ?? null,
    setItem: (key, value) => values.set(key, String(value)),
    removeItem: key => values.delete(key)
  };
}

function setup({ local = {}, tab = {}, protectedPage = false, hash = '', result, getSession, photo = null, photoError = false } = {}) {
  const localStorage = storage(local);
  const sessionStorage = storage(tab);
  const events = new Map();
  const redirects = [];
  const notices = [];
  const classes = new Set();
  let now = NOW;
  let authOptions;
  let listener;
  const passwordUpdates = [];
  const resetRequests = [];
  let currentResult = result ?? { data: { session: local[AUTH] || tab[AUTH] ? session() : null }, error: null };
  const photos = new Map(photo ? [['user-1', photo]] : []);
  const profileTable = {
    select: () => ({ eq: (key, id) => ({ maybeSingle: async () => ({ data: photos.has(id) ? {photo:photos.get(id)} : null, error: null }) }) }),
    upsert: async (row) => { if(photoError) return {error: {message:'Offline'}}; photos.set(row.user_id,row.photo); return {error:null}; },
    delete: () => ({eq: async (key,id) => { if(photoError) return {error:{message:'Offline'}}; photos.delete(id); return {error:null}; }})
  };
  // The receipts table and the receipt-photos bucket, kept in memory
  const rows = new Map();   // receipt id -> row
  const files = new Map();  // storage path -> blob
  const receiptTable = {
    // Like the real upsert, a column that is left out of the row keeps its old value
    upsert: async (row) => { rows.set(row.id, { ...rows.get(row.id), ...row }); return { error: null }; },
    select: () => ({ order: () => ({ order: async () => ({ data: [...rows.values()], error: null }) }) }),
    delete: () => ({ eq: async (key, id) => { rows.delete(id); return { error: null }; } })
  };
  const bucket = {
    upload: async (path, blob) => { files.set(path, blob); return { error: null }; },
    remove: async (paths) => ({ data: paths.filter(path => files.delete(path)).map(name => ({ name })), error: null }),
    list: async (folder) => ({ data: [...files.keys()].filter(path => path.startsWith(folder + '/')).map(path => ({ name: path.slice(folder.length + 1) })), error: null }),
    createSignedUrls: async (paths) => ({ data: paths.map(path => ({ path, signedUrl: 'https://files.test/' + path })), error: null })
  };
  const from = (table) => table === 'receipts' ? receiptTable : profileTable;
  const timers = new Map();
  let timerId = 0;
  const BW = {
    STORAGE: { name: 'breadwinner_user_name', email: 'breadwinner_user_email', photo: 'breadwinner_user_photo' },
    isSignedIn: () => Boolean(localStorage.getItem('breadwinner_session')),
    signIn: details => localStorage.setItem('breadwinner_session', JSON.stringify(details)),
    signOut: () => localStorage.removeItem('breadwinner_session'),
    safeRemove: key => localStorage.removeItem(key),
    safeGet: (key, fallback) => localStorage.getItem(key) ?? fallback,
    safeSet: (key, value) => localStorage.setItem(key, value)
  };
  const emit = (event, value) => listener(event, value);
  const auth = {
    onAuthStateChange: callback => { listener = callback; },
    getSession: async () => getSession ? getSession({ authOptions, emit }) : currentResult,
    getUser: async () => ({ data: { user: currentResult.data?.session?.user || null }, error: currentResult.error }),
    updateUser: async (attributes) => { passwordUpdates.push(attributes); return { data: { user }, error: null }; },
    resetPasswordForEmail: async (email, options) => { resetRequests.push({ email, ...options }); return { error: null }; },
    signOut: async () => {
      authOptions.storage.removeItem(AUTH);
      currentResult = { data: { session: null }, error: null };
      emit('SIGNED_OUT', null);
      return { error: null };
    },
    signInWithPassword: async () => {
      const next = session();
      authOptions.storage.setItem(AUTH, JSON.stringify(next));
      currentResult = { data: { session: next }, error: null };
      emit('SIGNED_IN', next);
      return { data: { user, session: next }, error: null };
    },
    signUp: async () => auth.signInWithPassword(),
    signInWithOAuth: async () => ({ error: null })
  };
  function element(tag) {
    return { tag, style: {}, children: [], setAttribute() {},
      appendChild(child) { this.children.push(child); },
      addEventListener(name, callback) { this[name] = callback; },
      remove() { notices.splice(notices.indexOf(this), 1); } };
  }
  const window = {
    BreadWinner: BW,
    location: { hash, replace: url => redirects.push(url), reload() {} },
    addEventListener(name, callback) {
      if (!events.has(name)) events.set(name, []);
      events.get(name).push(callback);
    },
    dispatchEvent(event) { for (const callback of events.get(event.type) || []) callback(event); }
  };
  const document = {
    documentElement: {
      hasAttribute: () => protectedPage,
      classList: { add: key => classes.add(key), remove: key => classes.delete(key),
        toggle: (key, value) => value ? classes.add(key) : classes.delete(key) }
    },
    createElement: element,
    body: { prepend: notice => notices.unshift(notice) }
  };
  const context = vm.createContext({ window, document, localStorage, sessionStorage,
    Date: class extends Date { static now() { return now; } }, URL, pageUrl, assetUrl,
    CustomEvent: class { constructor(type, options) { this.type = type; this.detail = options.detail; } },
    setTimeout: (callback, delay) => { timers.set(++timerId, { callback, delay }); return timerId; },
    clearTimeout: id => timers.delete(id),
    fetch,
    library: { createClient: (url, key, options) => { authOptions = options.auth; return { auth, from, storage: { from: () => bucket }, rpc: async () => ({ error: null }) }; } }
  });
  vm.runInContext(source, context);
  return { auth, passwordUpdates, resetRequests, photos, rows, files, BW, window, document, context, localStorage, sessionStorage, redirects, notices, classes, timers,
    emit, get options() { return authOptions; }, setNow: value => { now = value; },
    setResult: value => { currentResult = value; } };
}

function openSignin(app) {
  app.document.getElementById = () => null;
  app.document.querySelector = () => null;
  app.document.querySelectorAll = () => [];
  vm.runInContext(signinSource, app.context);
}

function openOnboarding(app) {
  const elements = new Map();
  app.document.getElementById = id => {
    if (['accountForm', 'password'].includes(id)) return null;
    if (!elements.has(id)) elements.set(id, {
      style: {}, children: [], setAttribute() {}, addEventListener() {}
    });
    return elements.get(id);
  };
  app.document.querySelectorAll = () => [];
  vm.runInContext(onboardingSource, app.context);
}

for (const [page, openPage] of [['sign-in', openSignin], ['onboarding', openOnboarding]]) {
test(`${page} redirects restored sessions to the dashboard`, async () => {
  for (const credentials of [{ local: { [AUTH]: 'stored' } }, { tab: { [AUTH]: 'stored' } }]) {
    const app = setup(credentials);
    openPage(app);
    await flush();
    assert.deepEqual(app.redirects, [pageUrl('/home')]);
  }
});

test(`${page} stays accessible without a session or when restoration fails`, async () => {
  for (const options of [{}, { local: { breadwinner_session: 'stale' } }, {
    local: { [AUTH]: 'stored' },
    result: { data: { session: null }, error: { message: 'Failed to fetch', status: 0 } }
  }]) {
    const app = setup(options);
    openPage(app);
    await flush();
    assert.deepEqual(app.redirects, []);
  }
});

test(`${page} waits for slow session restoration before redirecting`, async () => {
  let finish;
  const app = setup({ getSession: () => new Promise(resolve => { finish = resolve; }) });
  openPage(app);
  await flush();
  assert.deepEqual(app.redirects, []);
  finish({ data: { session: session() }, error: null });
  await flush();
  assert.deepEqual(app.redirects, [pageUrl('/home')]);
});

test(`${page} rechecks sessions when restored with the back button`, async () => {
  const app = setup();
  openPage(app);
  await flush();
  assert.deepEqual(app.redirects, []);
  app.setResult({ data: { session: session() }, error: null });
  app.window.dispatchEvent({ type: 'pageshow', persisted: true });
  await flush();
  assert.deepEqual(app.redirects, [pageUrl('/home')]);
});
}

test('restores real login without a legacy marker and unlocks protected pages', async () => {
  const app = setup({ local: { [AUTH]: 'stored' }, protectedPage: true });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
  await flush();
  assert.equal(app.options.persistSession, true);
  assert.equal(app.options.autoRefreshToken, true);
  assert.equal(app.localStorage.getItem(DEADLINE), String(NOW + WINDOW));
  assert.ok(app.classes.has('auth-ok'));
  assert.deepEqual(app.redirects, []);
});

test('stale legacy marker cannot authenticate a logged-out visitor', async () => {
  const app = setup({ local: { breadwinner_session: 'stale' }, protectedPage: true });
  assert.equal(await app.BW.cloud.getSignedInState(), false);
  await flush();
  assert.equal(app.localStorage.getItem('breadwinner_session'), null);
  assert.ok(app.redirects.includes(pageUrl('/signin')));
});

test('remembered login survives restart and refresh preserves the fixed deadline', async () => {
  const deadline = String(NOW + WINDOW - 1000);
  const app = setup({ local: { [AUTH]: 'old-token', [DEADLINE]: deadline },
    getSession: async ({ authOptions, emit }) => {
      const refreshed = session();
      if (authOptions.storage.getItem(AUTH) === 'old-token') {
        authOptions.storage.setItem(AUTH, JSON.stringify(refreshed));
        emit('TOKEN_REFRESHED', refreshed);
      }
      return { data: { session: refreshed }, error: null };
    } });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
  assert.equal(app.localStorage.getItem(DEADLINE), deadline);
  const restart = setup({ local: { [AUTH]: app.localStorage.getItem(AUTH), [DEADLINE]: deadline } });
  assert.equal(await restart.BW.cloud.getSignedInState(), true);
  assert.equal(restart.localStorage.getItem(DEADLINE), deadline);
});

test('30-day expiry clears credentials and signs out an open page', async () => {
  const app = setup({ local: { [AUTH]: 'stored', [DEADLINE]: String(NOW + 1000) }, protectedPage: true });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
  app.setNow(NOW + 1000);
  for (const timer of [...app.timers.values()]) timer.callback();
  await flush();
  assert.equal(app.BW.cloud.signedIn, false);
  assert.equal(app.localStorage.getItem(AUTH), null);
  assert.equal(app.localStorage.getItem(DEADLINE), null);
  assert.ok(app.redirects.includes(pageUrl('/signin')));
});

test('rejected refresh credentials clear both stores and legacy marker', async () => {
  const app = setup({ local: { [AUTH]: 'bad', breadwinner_session: 'stale' },
    result: { data: { session: null }, error: { code: 'refresh_token_not_found' } } });
  assert.equal(await app.BW.cloud.getSignedInState(), false);
  assert.equal(app.localStorage.getItem(AUTH), null);
  assert.equal(app.localStorage.getItem('breadwinner_session'), null);
});

test('transient refresh failure retains credentials, offers retry, and never redirects', async () => {
  const app = setup({ local: { [AUTH]: 'valid-refresh', breadwinner_session: 'recent' }, protectedPage: true,
    result: { data: { session: null }, error: { message: 'Failed to fetch', status: 0 } } });
  await assert.rejects(app.BW.cloud.getSignedInState());
  await flush();
  assert.equal(app.BW.cloud.signedIn, null);
  assert.equal(app.localStorage.getItem(AUTH), 'valid-refresh');
  assert.equal(app.localStorage.getItem('breadwinner_session'), 'recent');
  assert.deepEqual(app.redirects, []);
  assert.equal(app.notices.length, 1);
  assert.equal(app.notices[0].children[0].textContent, 'Retry');
  app.setResult({ data: { session: session() }, error: null });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
  assert.equal(app.notices.length, 0);
});

test('expired access token without a completed refresh stays unresolved', async () => {
  const app = setup({ local: { [AUTH]: 'refresh' },
    result: { data: { session: { ...session(), expires_at: NOW / 1000 - 1 } }, error: null } });
  await assert.rejects(app.BW.cloud.getSignedInState(), /could not be refreshed/);
  assert.equal(app.BW.cloud.signedIn, null);
  assert.equal(app.localStorage.getItem(AUTH), 'refresh');
});

test('unchecked Remember me stays tab-only across refresh and disappears on closing tab', async () => {
  const app = setup();
  await flush();
  await app.BW.cloud.signIn(user.email, 'password', false);
  assert.ok(app.sessionStorage.getItem(AUTH));
  assert.equal(app.localStorage.getItem(AUTH), null);
  assert.equal(app.localStorage.getItem(DEADLINE), null);
  app.localStorage.setItem('breadwinner_remember', 'yes'); // preference changed by another tab
  app.options.storage.setItem(AUTH, 'refreshed');
  assert.equal(app.sessionStorage.getItem(AUTH), 'refreshed');
  assert.equal(app.localStorage.getItem(AUTH), null);
  const closed = setup({ local: { breadwinner_session: 'stale', breadwinner_remember: 'yes' } });
  assert.equal(await closed.BW.cloud.getSignedInState(), false);
});

test('email reauthentication and signup start a fresh remembered window', async () => {
  const app = setup({ local: { [AUTH]: 'old', [DEADLINE]: String(NOW + 1000) } });
  await app.BW.cloud.getUser();
  await app.BW.cloud.signIn(user.email, 'password', true);
  assert.equal(app.localStorage.getItem(DEADLINE), String(NOW + WINDOW));
  const registered = setup();
  await flush();
  assert.equal(await registered.BW.cloud.signUp('Test', user.email, 'password'), true);
  assert.equal(registered.localStorage.getItem(DEADLINE), String(NOW + WINDOW));
});

test('Google callback renews window and authenticates without a legacy marker', async () => {
  const app = setup({ hash: '#access_token=callback', local: { [AUTH]: 'old', [DEADLINE]: String(NOW - 1) },
    getSession: async ({ authOptions }) => {
      authOptions.storage.setItem(AUTH, 'google');
      return { data: { session: session() }, error: null };
    } });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
  app.emit('SIGNED_IN', session());
  app.emit('INITIAL_SESSION', session());
  assert.equal(app.localStorage.getItem(DEADLINE), String(NOW + WINDOW));
});

test('explicit logout and cross-tab/back navigation clear protected access', async () => {
  const app = setup({ local: { [AUTH]: 'stored' }, protectedPage: true });
  await app.BW.cloud.getUser();
  await app.BW.cloud.signOut();
  assert.equal(app.BW.cloud.signedIn, false);
  assert.equal(app.localStorage.getItem(AUTH), null);
  assert.equal(app.classes.has('auth-ok'), false);
  app.window.dispatchEvent({ type: 'pageshow', persisted: true });
  await flush();
  assert.ok(app.redirects.includes(pageUrl('/signin')));
  const other = setup({ local: { [AUTH]: 'stored' }, protectedPage: true });
  await other.BW.cloud.getUser();
  other.localStorage.removeItem(AUTH);
  other.setResult({ data: { session: null }, error: null });
  other.window.dispatchEvent({ type: 'storage', key: AUTH });
  await flush();
  assert.equal(other.BW.cloud.signedIn, false);
  assert.equal(other.classes.has('auth-ok'), false);
});

test('slow restoration stays pending until the shared check completes', async () => {
  let finish;
  const app = setup({ protectedPage: true, getSession: () => new Promise(resolve => { finish = resolve; }) });
  await flush();
  assert.equal(app.BW.cloud.signedIn, null);
  assert.deepEqual(app.redirects, []);
  finish({ data: { session: session() }, error: null });
  assert.equal(await app.BW.cloud.getSignedInState(), true);
});

test('navbar updates desktop/mobile together and offers retry after network failure', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.getUser();
  const actions = ['desktop', 'mobile'].map(kind => ({ dataset: { authActions: kind }, innerHTML: '',
    querySelector: () => ({ addEventListener() {} }) }));
  app.document.querySelectorAll = selector => selector === '[data-auth-actions]' ? actions : [];
  app.document.querySelector = () => actions[0];
  vm.runInContext(navbarSource, app.context);
  await flush();
  for (const action of actions) assert.match(action.innerHTML, /Continue to Dashboard/);
  app.setResult({ data: { session: null }, error: { message: 'Failed to fetch' } });
  app.window.dispatchEvent({ type: 'online' });
  await flush();
  for (const action of actions) assert.match(action.innerHTML, /Retry sign-in check/);
  app.setResult({ data: { session: null }, error: null });
  app.window.dispatchEvent({ type: 'pageshow', persisted: true });
  await flush();
  for (const action of actions) {
    assert.match(action.innerHTML, /Sign In/);
    assert.doesNotMatch(action.innerHTML, /Continue to Dashboard/);
  }
});

const cloudPhoto = 'data:image/jpeg;base64,YWJj';

test('reset emails target the dedicated recovery page', async () => {
  const app = setup();
  await app.BW.cloud.sendPasswordReset(user.email);
  assert.equal(app.resetRequests[0].redirectTo, 'https://breadwinner.test/resetlink/resetlink.html');
});

test('a normal login or forged recovery URL cannot authorize a password reset', async () => {
  for (const hash of ['', '#type=recovery']) {
    const app = setup({ hash, local: { [AUTH]: 'stored' } });
    await assert.rejects(app.BW.cloud.setNewPassword('a long new password'), /invalid or expired/);
    assert.equal(app.passwordUpdates.length, 0);
  }
});

test('verified recovery allows one password update and clears credentials afterward', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.getUser();
  app.emit('PASSWORD_RECOVERY', session());
  assert.equal(await app.BW.cloud.verifyPasswordRecovery(), true);
  await app.BW.cloud.setNewPassword('a long new password');
  assert.equal(app.passwordUpdates.length, 1);
  assert.equal(app.localStorage.getItem(AUTH), null);
  assert.equal(app.sessionStorage.getItem(AUTH), null);
  await assert.rejects(app.BW.cloud.setNewPassword('another long password'), /invalid or expired/);
});

test('recovery expires, rejects a changed user, and enforces password bounds', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.getUser();
  app.emit('PASSWORD_RECOVERY', session());
  for (const password of ['short', 'x'.repeat(129)]) {
    await assert.rejects(app.BW.cloud.setNewPassword(password), /12 and 128/);
  }
  app.setNow(NOW + 15 * 60 * 1000);
  await assert.rejects(app.BW.cloud.setNewPassword('a long new password'), /invalid or expired/);
  app.setNow(NOW);
  app.emit('PASSWORD_RECOVERY', session());
  app.emit('SIGNED_IN', { ...session(), user: { ...user, id: 'other' } });
  await assert.rejects(app.BW.cloud.setNewPassword('a long new password'), /invalid or expired/);
  assert.equal(app.passwordUpdates.length, 0);
});

test('server rejection and overlapping updates cannot change a password', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.getUser();
  app.emit('PASSWORD_RECOVERY', session());
  app.setResult({ data: { session: null }, error: null });
  await assert.rejects(app.BW.cloud.setNewPassword('a long new password'));
  assert.equal(app.passwordUpdates.length, 0);
  app.setResult({ data: { session: session() }, error: null });
  const first = app.BW.cloud.setNewPassword('a long new password');
  await assert.rejects(app.BW.cloud.setNewPassword('another long password'), /already in progress/);
  await first;
  assert.equal(app.passwordUpdates.length, 1);
});

test('the auth server must confirm the recovery user before an update', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.getUser();
  app.emit('PASSWORD_RECOVERY', session());
  app.auth.getUser = async () => ({ data: { user: null }, error: { message: 'Invalid token' } });
  await assert.rejects(app.BW.cloud.setNewPassword('a long new password'), /Could not verify/);
  assert.equal(app.passwordUpdates.length, 0);
});
test('cloud profile photos restore on a new browser without persisting a local photo', async () => {
  const app = setup({ local: { [AUTH]: 'stored', breadwinner_user_photo:'old local photo' }, photo:cloudPhoto });
  await app.BW.cloud.getUser(); await flush();
  assert.equal(app.BW.profilePhoto,cloudPhoto);
  assert.equal(app.localStorage.getItem('breadwinner_user_photo'),null);
});
test('photo upload and removal persist to the account and clear on sign-out', async () => {
  const app=setup({local:{[AUTH]:'stored'}});
  await app.BW.cloud.saveProfilePhoto(cloudPhoto);
  assert.equal(app.photos.get('user-1'),cloudPhoto);
  assert.equal(app.BW.profilePhoto,cloudPhoto);
  assert.equal(app.localStorage.getItem('breadwinner_user_photo'),null);
  await app.BW.cloud.saveProfilePhoto(null);
  assert.equal(app.photos.has('user-1'),false);
  assert.equal(app.BW.profilePhoto,'');
  await app.BW.cloud.saveProfilePhoto(cloudPhoto);
  await app.BW.cloud.signOut();
  assert.equal(app.BW.profilePhoto,'');
});
test('failed cloud photo changes preserve the existing account photo', async () => {
  const app=setup({local:{[AUTH]:'stored'},photo:cloudPhoto,photoError:true});
  await app.BW.cloud.getUser(); await flush();
  await assert.rejects(app.BW.cloud.saveProfilePhoto(null));
  assert.equal(app.BW.profilePhoto,cloudPhoto);
  assert.equal(app.photos.get('user-1'),cloudPhoto);
});

test('an existing local photo migrates only to its matching cloud account', async () => {
  const app=setup({local:{[AUTH]:'stored',breadwinner_user_photo:cloudPhoto,breadwinner_user_email:user.email}});
  await app.BW.cloud.getUser(); await flush();
  assert.equal(app.photos.get(user.id),cloudPhoto);
  assert.equal(app.localStorage.getItem('breadwinner_user_photo'),null);
});

/* ---------- Receipt photos are files, not database text ---------- */
const jpeg = (bytes = 50000) => new Blob([new Uint8Array(bytes)], { type: 'image/jpeg' });
const newReceipt = (extra = {}) => ({ id: 'receipt-1', name: 'Captured Receipt', date: '2026-10-25', subtotal: null, lines: [], overcharge: 0, ...extra });

test('a new receipt photo is saved as a file and the database row only holds its path', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  const receipt = newReceipt({ photoBlob: jpeg(), imageUrl: 'blob:preview' });
  await app.BW.cloud.saveReceipt(receipt);
  assert.deepEqual([...app.files.keys()], ['user-1/receipt-1.jpg']);
  assert.equal(app.rows.get('receipt-1').photo, 'user-1/receipt-1.jpg');
  assert.equal(receipt.photoBlob, null);
  await app.BW.cloud.saveReceipt(receipt);  // a later save (renaming, an approval) must not lose the photo
  assert.equal(app.rows.get('receipt-1').photo, 'user-1/receipt-1.jpg');
});

test('a photo that is too big or not a JPEG is refused but the receipt is still saved', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  const tooBig = newReceipt({ photoBlob: jpeg(500001) });
  await assert.rejects(app.BW.cloud.saveReceipt(tooBig), /receipt was saved, but its photo was not/);
  const notJpeg = newReceipt({ id: 'receipt-2', photoBlob: new Blob(['GIF89a'], { type: 'image/gif' }) });
  await assert.rejects(app.BW.cloud.saveReceipt(notJpeg), /receipt was saved, but its photo was not/);
  assert.equal(app.files.size, 0);
  assert.equal(app.rows.has('receipt-1'), true);
  assert.equal(app.rows.has('receipt-2'), true);
  assert.equal('photo' in app.rows.get('receipt-1'), false);
});

test('loading receipts gives each photo a temporary viewing link, and keeps old data: photos working', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  app.rows.set('a', { id: 'a', store_name: 'A', receipt_date: '2026-10-25', subtotal: null, photo: 'user-1/a.jpg', lines: [] });
  app.rows.set('b', { id: 'b', store_name: 'B', receipt_date: '2026-10-24', subtotal: null, photo: 'data:image/jpeg;base64,AAAA', lines: [] });
  app.rows.set('c', { id: 'c', store_name: 'C', receipt_date: '2026-10-23', subtotal: null, photo: null, lines: [] });
  const [a, b, c] = await app.BW.cloud.loadReceipts();
  assert.equal(a.imageUrl, 'https://files.test/user-1/a.jpg');
  assert.equal(b.imageUrl, 'data:image/jpeg;base64,AAAA');
  assert.equal(c.imageUrl, null);
});

test('an old receipt with the whole picture in the database is moved to a file when saved', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  const oldPicture = 'data:image/jpeg;base64,' + Buffer.alloc(300).toString('base64');
  app.rows.set('old', { id: 'old', photo: oldPicture });
  const receipt = newReceipt({ id: 'old', photoPath: oldPicture, imageUrl: oldPicture });
  await app.BW.cloud.saveReceipt(receipt);
  assert.equal(app.rows.get('old').photo, 'user-1/old.jpg');
  assert.equal(app.files.get('user-1/old.jpg').type, 'image/jpeg');
});

test('deleting a receipt deletes its photo file, and deleting the account deletes every photo file', async () => {
  const app = setup({ local: { [AUTH]: 'stored' } });
  await app.BW.cloud.saveReceipt(newReceipt({ photoBlob: jpeg() }));
  await app.BW.cloud.saveReceipt(newReceipt({ id: 'receipt-2', photoBlob: jpeg() }));
  const first = newReceipt({ photoPath: 'user-1/receipt-1.jpg' });
  await app.BW.cloud.deleteReceipt(first);
  assert.deepEqual([...app.files.keys()], ['user-1/receipt-2.jpg']);
  await app.BW.cloud.deleteAccount();
  assert.equal(app.files.size, 0);
});

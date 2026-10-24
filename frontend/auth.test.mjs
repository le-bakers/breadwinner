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

function setup({ local = {}, tab = {}, protectedPage = false, hash = '', result, getSession } = {}) {
  const localStorage = storage(local);
  const sessionStorage = storage(tab);
  const events = new Map();
  const redirects = [];
  const notices = [];
  const classes = new Set();
  let now = NOW;
  let authOptions;
  let listener;
  let currentResult = result ?? { data: { session: local[AUTH] || tab[AUTH] ? session() : null }, error: null };
  const timers = new Map();
  let timerId = 0;
  const BW = {
    STORAGE: { name: 'breadwinner_user_name', email: 'breadwinner_user_email' },
    isSignedIn: () => Boolean(localStorage.getItem('breadwinner_session')),
    signIn: details => localStorage.setItem('breadwinner_session', JSON.stringify(details)),
    signOut: () => localStorage.removeItem('breadwinner_session'),
    safeSet: (key, value) => localStorage.setItem(key, value)
  };
  const emit = (event, value) => listener(event, value);
  const auth = {
    onAuthStateChange: callback => { listener = callback; },
    getSession: async () => getSession ? getSession({ authOptions, emit }) : currentResult,
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
    library: { createClient: (url, key, options) => { authOptions = options.auth; return { auth }; } }
  });
  vm.runInContext(source, context);
  return { BW, window, document, context, localStorage, sessionStorage, redirects, notices, classes, timers,
    emit, get options() { return authOptions; }, setNow: value => { now = value; },
    setResult: value => { currentResult = value; } };
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

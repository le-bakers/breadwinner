// Uses a real browser with an in-memory account and scanner; never contacts live APIs.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');
const { chromium } = require('playwright');

let browser, server, origin;
const root = path.resolve(__dirname, '..');
const day = new Date().toLocaleDateString('en-CA');
const comparison = { source: 'manual', gfSize: '14 oz', quantity: 2, regularName: 'Bread',
  regularPrice: 3.49, regularSize: '20 oz', scaledRegularPrice: 2.44, deduction: 8.09,
  sizesComparable: true, warnings: [], date: day };
const lines = [
  { name: 'GF BREAD', price: 12.98, quantity: 2, gf: true, regularTerm: 'bread', unsure: false },
  { name: 'BANANAS', price: 1.12, quantity: 1, gf: false, unsure: false }
];
function receipt(overrides = {}) {
  return { id: 'd14e0d2a-2a9a-4e85-87a9-044276446231', store_name: 'Grocery',
    receipt_date: day, subtotal: 14.10, extra_cost: 8.09, photo: null,
    lines: [{ ...lines[0], compare: comparison }, lines[1]], ...overrides };
}
function deferred() {
  let resolve;
  const promise = new Promise((done) => { resolve = done; });
  return { promise, resolve };
}

before(async () => {
  server = http.createServer(async (req, res) => {
    const file = path.resolve(root, '.' + new URL(req.url, 'http://local').pathname);
    if (!file.startsWith(root + path.sep)) { res.writeHead(403).end(); return; }
    try {
      const content = await fs.readFile(file);
      const type = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' }[path.extname(file)];
      res.writeHead(200, { 'Content-Type': type || 'application/octet-stream' }).end(content);
    } catch { res.writeHead(404).end(); }
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  origin = 'http://127.0.0.1:' + server.address().port;
  browser = await chromium.launch({ headless: true,
    ...(process.env.BROWSER_CHANNEL || process.platform === 'win32'
      ? { channel: process.env.BROWSER_CHANNEL || 'msedge' } : {}) });
});
after(async () => {
  if (browser) await browser.close();
  if (server) await new Promise((resolve) => server.close(resolve));
});

async function setup(t, rows = [receipt()], options = {}) {
  const context = await browser.newContext({ reducedMotion: 'reduce', ...options.viewport && { viewport: options.viewport } });
  t.after(() => context.close());
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  const controls = { suggestion: null, deduction: null, search: null, scan: null };
  await context.addInitScript(({ rows, options }) => {
    localStorage.setItem('breadwinner_settings', JSON.stringify({ reduceMotion: true }));
    if (options.zip) localStorage.setItem('breadwinner_zip', options.zip);
    const state = window.__test = {
      rows: JSON.parse(localStorage.getItem('__testRows') || JSON.stringify(rows)),
      writes: [], failSave: false, failDelete: false, failLoad: !!options.failLoad,
      holdSaves: false, releaseSave: null, failProfile: false, failPhoto: false,
      files: JSON.parse(localStorage.getItem('__testFiles') || '{}'), uploads: [], linkRequests: 0,
      user: JSON.parse(localStorage.getItem('__testUser') || 'null')
        || { id: 'test-user', email: 'test@example.test', user_metadata: { full_name: 'Test Shopper' } }
    };
    const persist = () => localStorage.setItem('__testRows', JSON.stringify(state.rows));
    const client = window.__client = {
      auth: {
        onAuthStateChange() {},
        async getSession() { return { data: { session: { user: structuredClone(state.user), expires_at: Date.now() / 1000 + 3600 } } }; },
        async updateUser(updates) {
          if (state.failProfile) return { error: { message: 'Offline' } };
          state.user.user_metadata = { ...state.user.user_metadata, ...updates.data };
          localStorage.setItem('__testUser', JSON.stringify(state.user));
          return { data: { user: structuredClone(state.user) } };
        }
      },
      storage: { from() { return {
        async upload(path, blob) {
          if (state.failPhoto) return { error: { message: 'Photo upload offline' } };
          state.uploads.push({ path, size: blob.size, type: blob.type });
          state.files[path] = { size: blob.size, type: blob.type };
          localStorage.setItem('__testFiles', JSON.stringify(state.files));
          return {};
        },
        async remove(paths) {
          paths.forEach((path) => { delete state.files[path]; });
          localStorage.setItem('__testFiles', JSON.stringify(state.files));
          return {};
        },
        async createSignedUrls(paths) {
          state.linkRequests += 1;
          return { data: paths.map((path) => ({ path, signedUrl: 'https://photos.test/' + path + '?version=' + state.linkRequests })) };
        }
      }; } },
      from(table) {
        if (table === 'profile_photos') return {
          select() { return this; }, eq() { return this; }, async maybeSingle() { return { data: null }; }
        };
        return {
          select() { return this; }, order() { return this; },
          then(resolve, reject) {
            return Promise.resolve(state.failLoad ? { error: { message: 'Offline' } }
              : { data: structuredClone(state.rows) }).then(resolve, reject);
          },
          async upsert(row) {
            const copy = structuredClone(row);
            state.writes.push(copy);
            if (state.holdSaves) await new Promise((resolve) => { state.releaseSave = resolve; });
            if (state.failSave) return { error: { message: 'Offline' } };
            const index = state.rows.findIndex((other) => other.id === copy.id);
            if (index < 0) state.rows.push(copy); else state.rows[index] = copy;
            persist();
            return {};
          },
          delete() { return { async eq(key, id) {
            if (state.failDelete) return { error: { message: 'Offline' } };
            state.rows = state.rows.filter((row) => row.id !== id);
            persist();
            return {};
          } }; }
        };
      }
    };
  }, { rows, options });
  await context.route('**/*', async (route) => {
    const url = new URL(route.request().url());
    if (url.origin === origin) return route.continue();
    if (url.hostname === 'photos.test') return route.fulfill({ contentType: 'image/png', body: await fs.readFile(path.resolve(root, '../backend/test_receipt.png')) });
    if (url.hostname === 'cdn.jsdelivr.net') return route.fulfill({ contentType: 'text/javascript',
      headers: { 'Access-Control-Allow-Origin': '*' }, body: 'export function createClient() { return window.__client; }' });
    if (url.origin !== 'http://127.0.0.1:8000') return route.abort();
    const json = async (body) => route.fulfill({ json: body, headers: { 'Access-Control-Allow-Origin': '*' } });
    if (route.request().method() === 'OPTIONS') return route.fulfill({ headers: {
      'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST', 'Access-Control-Allow-Headers': '*' } });
    if (url.pathname === '/scan') {
      if (controls.scan) await controls.scan.promise;
      return json({ items: lines.map((line) => ({ ...line, regular_term: line.regularTerm })), subtotal: 14.10 });
    }
    if (url.pathname === '/suggest') {
      if (controls.suggestion) await controls.suggestion.promise;
      return json({ regular: { name: 'Bread', price: 3.49, size: '20 oz' }, gf_size: '14 oz',
        deduction: 8.09, scaled_regular_price: 2.44, sizes_comparable: true, warnings: [] });
    }
    if (url.pathname === '/deduction') {
      if (controls.deduction) await controls.deduction.promise;
      const p = url.searchParams;
      const regular = Number(p.get('regular_price'));
      const scaled = regular * (parseFloat(p.get('gf_size')) || 20) / (parseFloat(p.get('regular_size')) || 20);
      return json({ deduction: Math.round(Math.max(0, Number(p.get('gf_price')) - scaled * Number(p.get('quantity'))) * 100) / 100,
        scaled_regular_price: Math.round(scaled * 100) / 100, sizes_comparable: true, warnings: [] });
    }
    if (url.pathname === '/kroger/search') {
      if (controls.search) await controls.search.promise;
      return json({ results: [{ name: 'Old search result', price: 2, size: '20 oz' }] });
    }
    return json({ status: 'ok' });
  });
  await page.goto(origin + '/home/home.html#receipts');
  await page.waitForFunction(() => !document.getElementById('fabUpload').disabled || document.getElementById('receiptSaveStatus').textContent.includes('Could not load'));
  t.after(() => assert.deepEqual(errors, [], 'No browser script errors'));
  return { page, controls };
}

async function saved(page) {
  await page.waitForFunction(() => window.__test.writes.length > 0 && document.getElementById('receiptSaveStatus').textContent === 'All changes saved.');
}
async function openComparison(page) {
  await page.locator('.receipt-row[tabindex]').first().click();
  await page.locator('.badge-tax, .badge-compare').first().click();
}

test('scan, edit, and reload retain all scanned data and approved totals', async (t) => {
  const { page } = await setup(t, []);
  await page.locator('#fileInput').setInputFiles(path.resolve(root, '../backend/test_receipt.png'));
  await saved(page);
  await page.locator('.receipt-row[tabindex]').click();
  await page.locator('.badge-compare').click();
  await page.locator('[data-pane="manual"]').click();
  await page.locator('#compareGfSize').fill('14 oz');
  await page.locator('#compareManualName').fill('Bread');
  await page.locator('#compareManualPrice').fill('3.49');
  await page.locator('#compareManualSize').fill('20 oz');
  await page.waitForFunction(() => !document.getElementById('compareSave').disabled);
  await page.locator('#compareSave').click();
  await page.locator('.rename-input').fill('Weekly groceries');
  await page.locator('.rename-input').press('Enter');
  await saved(page);
  const before = await page.evaluate(() => window.__test.rows);
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('.cell-name-text'));
  assert.equal(await page.locator('.cell-name-text').textContent(), 'Weekly groceries');
  assert.equal(await page.locator('.cell-overcharge').textContent(), '$8.09');
  assert.equal(await page.locator('.cell-items').textContent(), '2');
  assert.deepEqual(await page.evaluate(() => window.__test.rows), before);
  assert.equal(before[0].lines[0].compare.quantity, 2);
  assert.equal(before[0].subtotal, 14.10);
  assert.match(before[0].photo, /^test-user\/.+\.jpg$/);
});

test('input changes immediately invalidate Save and any in-flight calculation', async (t) => {
  const { page, controls } = await setup(t);
  await openComparison(page);
  await page.waitForFunction(() => !document.getElementById('compareSave').disabled);
  controls.deduction = deferred();
  await page.locator('#compareManualPrice').fill('2');
  assert.equal(await page.locator('#compareSave').isDisabled(), true);
  await page.locator('#compareModal form').dispatchEvent('submit');
  assert.equal(await page.locator('#compareModal').isVisible(), true);
  await page.waitForRequest((request) => request.url().includes('regular_price=2&'));
  await page.locator('#compareManualPrice').fill('4');
  controls.deduction.resolve();
  controls.deduction = null;
  assert.equal(await page.locator('#compareSave').isDisabled(), true);
  await page.waitForFunction(() => !document.getElementById('compareSave').disabled);
  await page.locator('#compareSave').click();
  await saved(page);
  const result = await page.evaluate(() => window.__test.rows[0].lines[0].compare);
  assert.equal(result.regularPrice, 4);
  assert.equal(result.deduction, 7.38);
});

test('a delayed suggestion cannot recreate a deleted receipt', async (t) => {
  const { page, controls } = await setup(t, [], { zip: '45202' });
  controls.suggestion = deferred();
  const suggested = page.waitForRequest((request) => request.url().includes('/suggest?'));
  await page.locator('#fileInput').setInputFiles(path.resolve(root, '../backend/test_receipt.png'));
  await suggested;
  await saved(page);
  await page.locator('.row-delete-btn').click();
  await page.locator('#deleteReceiptConfirm').click();
  await page.waitForFunction(() => window.__test.rows.length === 0);
  controls.suggestion.resolve();
  await page.waitForFunction(() => document.querySelector('.toast-text')?.textContent.includes('Found 2 items'));
  assert.equal(await page.evaluate(() => window.__test.writes.length), 1);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.receipt-empty')?.textContent.includes('No receipts this month'));
});

test('failed saves stay visible, protect navigation, and can be retried', async (t) => {
  const { page } = await setup(t);
  await page.evaluate(() => { window.__test.failSave = true; });
  await page.locator('.receipt-row[tabindex]').click();
  await page.locator('.rename-input').fill('Changed');
  await page.locator('.rename-input').press('Enter');
  await page.waitForFunction(() => !document.getElementById('retrySaveBtn').hidden);
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
  assert.equal(await page.evaluate(() => window.__test.rows[0].store_name), 'Grocery');
  await page.evaluate(() => { window.__test.failSave = false; });
  await page.locator('#retrySaveBtn').click();
  await saved(page);
  assert.equal(await page.evaluate(() => window.__test.rows[0].store_name), 'Changed');
  assert.equal(await page.locator('#retrySaveBtn').isVisible(), false);
});

test('failed deletion leaves the receipt available for retry', async (t) => {
  const { page } = await setup(t);
  await page.evaluate(() => { window.__test.failDelete = true; });
  await page.locator('.row-delete-btn').click();
  await page.locator('#deleteReceiptConfirm').click();
  await page.waitForFunction(() => document.querySelector('.toast-text')?.textContent.includes('could not be deleted'));
  assert.equal(await page.locator('.cell-name-text').count(), 1);
  assert.equal(await page.locator('#deleteReceiptModal').isVisible(), true);
  await page.evaluate(() => { window.__test.failDelete = false; });
  await page.locator('#deleteReceiptConfirm').click();
  await page.waitForFunction(() => window.__test.rows.length === 0);
  assert.equal(await page.locator('.cell-name-text').count(), 0);
});

test('cloud queue snapshots nested data instead of later mutations', async (t) => {
  const { page } = await setup(t, []);
  const result = await page.evaluate(async () => {
    window.__test.holdSaves = true;
    const item = { id: crypto.randomUUID(), name: 'First', date: '2026-10-26', subtotal: 10,
      lines: [{ name: 'Original', price: 10, gf: true }], overcharge: 0 };
    const first = window.BreadWinner.cloud.saveReceipt(item);
    item.name = 'Second';
    item.lines[0].price = 20;
    const second = window.BreadWinner.cloud.saveReceipt(item);
    item.lines[0].price = 30;
    while (!window.__test.releaseSave) await new Promise((resolve) => setTimeout(resolve, 0));
    window.__test.holdSaves = false;
    window.__test.releaseSave();
    await Promise.all([first, second]);
    return window.__test.writes;
  });
  assert.equal(result[0].store_name, 'First');
  assert.equal(result[0].lines[0].price, 10);
  assert.equal(result[1].store_name, 'Second');
  assert.equal(result[1].lines[0].price, 20);
});

test('remembered comparisons require the same quantity and a valid date', async (t) => {
  const { page } = await setup(t);
  const result = await page.evaluate(({ comparison, lines }) => {
    const recall = window.BreadWinner.suggest.recall;
    const old = { ...lines[0], compare: comparison };
    const matching = recall({ ...lines[0] }, [{ lines: [old] }]);
    const otherQuantity = recall({ ...lines[0], quantity: 1 }, [{ lines: [old] }]);
    old.compare = { ...comparison, date: 'invalid' };
    const invalidDate = recall({ ...lines[0] }, [{ lines: [old] }]);
    return { matching, otherQuantity, invalidDate };
  }, { comparison, lines });
  assert.equal(result.matching.deduction, 8.09);
  assert.equal(result.otherQuantity, null);
  assert.equal(result.invalidDate, null);
});

test('loading failures have a retry path without showing a false empty history', async (t) => {
  const { page } = await setup(t, [receipt()], { failLoad: true });
  assert.equal(await page.locator('#fabUpload').isDisabled(), true);
  assert.match(await page.locator('.receipt-empty').textContent(), /could not be loaded/);
  await page.evaluate(() => { window.__test.failLoad = false; });
  await page.locator('#retrySaveBtn').click();
  await page.waitForFunction(() => !document.getElementById('fabUpload').disabled);
  assert.equal(await page.locator('.cell-name-text').count(), 1);
});

test('keyboard controls expose focus rings and keep dialog focus inside', async (t) => {
  const { page } = await setup(t, [receipt()], { viewport: { width: 390, height: 844 } });
  await page.locator('.receipt-row[tabindex]').focus();
  await page.keyboard.press('Enter');
  assert.equal(await page.locator('.receipt-row[tabindex]').getAttribute('aria-expanded'), 'true');
  await page.locator('.badge-tax').click();
  await page.locator('#compareCancel').focus();
  await page.keyboard.press('Tab');
  await page.keyboard.press('Tab');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'compareGfSize');
  for (const theme of ['light', 'dark']) {
    await page.evaluate((theme) => document.documentElement.setAttribute('data-theme', theme), theme);
    const ring = await page.locator('#compareGfSize').evaluate((input) => ({
      style: getComputedStyle(input).outlineStyle, width: getComputedStyle(input).outlineWidth
    }));
    assert.deepEqual(ring, { style: 'solid', width: '3px' });
    if (process.env.SCREENSHOT_DIR) await page.screenshot({ path: path.join(process.env.SCREENSHOT_DIR, 'focus-' + theme + '.png') });
  }
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('#compareModal').isVisible(), false);
});

test('late Kroger results cannot appear in another comparison', async (t) => {
  const { page, controls } = await setup(t);
  await openComparison(page);
  await page.locator('[data-pane="kroger"]').click();
  await page.locator('#compareTerm').fill('bread');
  await page.locator('#compareZip').fill('45202');
  controls.search = deferred();
  const requested = page.waitForRequest((request) => request.url().includes('/kroger/search?'));
  await page.locator('#compareSearchBtn').click();
  await requested;
  await page.locator('#compareCancel').click();
  await page.locator('.badge-tax').click();
  controls.search.resolve();
  // A fresh calculation finishes after reopening; the older search must stay discarded.
  await page.waitForFunction(() => !document.getElementById('compareSave').disabled);
  await page.locator('[data-pane="kroger"]').click();
  assert.equal(await page.locator('.compare-result').count(), 0);
  assert.equal(await page.locator('#compareSearchBtn').isDisabled(), false);
});

test('empty and inconsistent receipts remain marked for review', async (t) => {
  const { page } = await setup(t, [receipt({ lines: [] }),
    receipt({ id: 'd14e0d2a-2a9a-4e85-87a9-044276446232', subtotal: 100 })]);
  assert.deepEqual(await page.locator('.status-pill').allTextContents(), ['Needs Review', 'Needs Review']);
});

test('demo reload recomputes totals from saved lines', async (t) => {
  const { page } = await setup(t, []);
  // Keep the production script and exercise its browser-only storage branch.
  await page.route('**/cloud.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: 'document.documentElement.classList.add("auth-ok"); window.BreadWinner.cloud = { enabled: false };' }));
  await page.evaluate(({ comparison, lines, day }) => {
    localStorage.setItem('breadwinner_receipts', JSON.stringify([{ name: 'Local receipt', date: day,
      lines: [{ ...lines[0], compare: comparison }, lines[1]], items: 900, gfItems: 900, overcharge: 900 }]));
  }, { comparison, lines, day });
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('.cell-name-text'));
  assert.equal(await page.locator('.cell-items').textContent(), '2');
  assert.equal(await page.locator('.cell-gf').textContent(), '1');
  assert.equal(await page.locator('.cell-overcharge').textContent(), '$8.09');
});

test('profile edits persist to the account and email stays read-only', async (t) => {
  const { page } = await setup(t);
  await page.goto(origin + '/settings/settings.html');
  await page.locator('#editProfileBtn').click();
  await page.locator('#fullName').fill('Updated Shopper');
  assert.equal(await page.locator('#email').getAttribute('readonly'), '');
  await page.locator('#saveProfileBtn').click();
  await page.waitForFunction(() => document.getElementById('profileSaveStatus').textContent === 'Profile saved.');
  assert.equal(await page.locator('#summaryEmail').textContent(), 'test@example.test');
  await page.reload();
  await page.waitForFunction(() => !document.getElementById('editProfileBtn').disabled);
  assert.equal(await page.locator('#summaryName').textContent(), 'Updated Shopper');
  assert.equal(await page.locator('#summaryEmail').textContent(), 'test@example.test');
});

test('failed profile saves keep the form ready for retry', async (t) => {
  const { page } = await setup(t);
  await page.goto(origin + '/settings/settings.html');
  await page.locator('#editProfileBtn').click();
  await page.locator('#fullName').fill('Updated Shopper');
  await page.evaluate(() => { window.__test.failProfile = true; });
  await page.locator('#saveProfileBtn').click();
  await page.waitForFunction(() => document.getElementById('profileSaveStatus').textContent.includes('Could not save'));
  assert.equal(await page.locator('#fullName').inputValue(), 'Updated Shopper');
  assert.equal(await page.locator('#fullName').isEnabled(), true);
  assert.equal(await page.locator('#summaryName').textContent(), 'Test Shopper');
  await page.evaluate(() => { window.__test.failProfile = false; });
  await page.locator('#saveProfileBtn').click();
  await page.waitForFunction(() => document.getElementById('profileSaveStatus').textContent === 'Profile saved.');
  assert.equal(await page.locator('#summaryName').textContent(), 'Updated Shopper');
});

test('thumbnail fallback still resizes photos to fit database storage', async (t) => {
  const { page } = await setup(t, []);
  await page.evaluate(() => {
    window.createImageBitmap = async () => { throw new Error('Decoder unavailable'); };
    const encode = HTMLCanvasElement.prototype.toBlob;
    let first = true;
    HTMLCanvasElement.prototype.toBlob = function (callback, ...args) {
      if (first) { first = false; callback(new Blob(['A'.repeat(500001)], { type: 'image/jpeg' })); return; }
      return encode.call(this, callback, ...args);
    };
  });
  await page.locator('#fileInput').setInputFiles(path.resolve(root, '../backend/test_receipt.png'));
  await saved(page);
  assert.equal(await page.evaluate(() => window.__test.uploads[0].size <= 500000), true);
});

test('renaming an item invalidates its old comparison even if its paid price is unchanged', async (t) => {
  const { page } = await setup(t);
  await page.locator('.receipt-row[tabindex]').click();
  await page.locator('.item-edit-btn').first().click();
  await page.locator('.edit-name').fill('GF PASTA');
  await page.locator('.edit-item-form button[type="submit"]').click();
  await saved(page);
  const line = await page.evaluate(() => window.__test.rows[0].lines[0]);
  assert.equal(line.name, 'GF PASTA');
  assert.equal(line.price, 12.98);
  assert.equal(line.compare, undefined);
  assert.equal(line.draft, undefined);
  assert.equal(await page.locator('.cell-overcharge').textContent(), '$0.00');
});

test('a suggestion requested before an item edit cannot save obsolete math', async (t) => {
  const { page, controls } = await setup(t, [receipt({ lines })], { zip: '45202' });
  await page.evaluate(() => {
    const ask = window.BreadWinner.suggest.askKroger;
    window.BreadWinner.suggest.askKroger = async (...args) => {
      const answer = await ask(...args);
      window.__test.suggestionFinished = true;
      return answer;
    };
  });
  await page.locator('.receipt-row[tabindex]').click();
  controls.suggestion = deferred();
  const requested = page.waitForRequest((request) => request.url().includes('/suggest?'));
  await page.locator('.badge-suggest').click();
  await requested;
  await page.locator('.item-edit-btn').first().click();
  await page.locator('.edit-price').fill('20');
  await page.locator('.edit-item-form button[type="submit"]').click();
  await saved(page);
  controls.suggestion.resolve();
  await page.waitForFunction(() => window.__test.suggestionFinished);
  assert.equal(await page.locator('.badge-approve').count(), 0);
  const line = await page.evaluate(() => window.__test.rows[0].lines[0]);
  assert.equal(line.price, 20);
  assert.equal(line.draft, undefined);
  assert.equal(line.compare, undefined);
});

test('failed photo uploads preserve scanned lines and retry without dropping the photo', async (t) => {
  const { page } = await setup(t, []);
  await page.evaluate(() => { window.__test.failPhoto = true; });
  await page.locator('#fileInput').setInputFiles(path.resolve(root, '../backend/test_receipt.png'));
  await page.waitForFunction(() => document.getElementById('receiptSaveStatus').textContent.includes('could not be saved'));
  const first = await page.evaluate(() => window.__test.rows[0]);
  assert.equal(first.lines.length, 2);
  assert.equal(first.lines[0].price, 12.98);
  assert.equal(first.photo, undefined);
  await page.evaluate(() => { window.__test.failPhoto = false; });
  await page.locator('#retrySaveBtn').click();
  await saved(page);
  const last = await page.evaluate(() => window.__test.rows[0]);
  assert.deepEqual(last.lines, first.lines);
  assert.match(last.photo, /^test-user\/.+\.jpg$/);
});

test('a queued photo save cannot replace or clear a newer photo selection', async (t) => {
  const { page } = await setup(t, []);
  const result = await page.evaluate(async () => {
    const state = window.__test;
    state.holdSaves = true;
    const item = { id: crypto.randomUUID(), name: 'Photo receipt', date: '2026-10-26', subtotal: 10,
      lines: [{ name: 'Original', price: 10, gf: true }], photoBlob: new Blob(['a'], { type: 'image/jpeg' }) };
    const first = window.BreadWinner.cloud.saveReceipt(item);
    while (!state.releaseSave) await new Promise((resolve) => setTimeout(resolve, 0));
    item.photoBlob = new Blob(['bb'], { type: 'image/jpeg' });
    item.lines[0].price = 20;
    const second = window.BreadWinner.cloud.saveReceipt(item);
    item.photoBlob = new Blob(['ccc'], { type: 'image/jpeg' });
    item.lines[0].price = 30;
    state.holdSaves = false;
    state.releaseSave();
    await Promise.all([first, second]);
    return { uploads: state.uploads, remainingPhoto: item.photoBlob.size, stored: state.rows[0] };
  });
  assert.deepEqual(result.uploads.map((upload) => upload.size), [1, 2]);
  assert.equal(result.remainingPhoto, 3);
  assert.equal(result.stored.lines[0].price, 20);
});

test('history retains grouped receipts, saved edits, and totals after reload', async (t) => {
  const { page } = await setup(t);
  await page.goto(origin + '/history/history.html');
  await page.waitForFunction(() => document.getElementById('receiptSaveStatus').textContent === 'All changes saved.');
  assert.equal(await page.locator('.history-year').count(), 1);
  assert.match(await page.locator('.history-year > summary').textContent(), /\$8\.09/);
  await page.locator('.receipt-row[tabindex]').click();
  await page.locator('.rename-input').fill('History edit');
  await page.locator('.rename-input').press('Enter');
  await saved(page);
  await page.reload();
  await page.waitForFunction(() => document.querySelector('.cell-name-text')?.textContent === 'History edit');
  assert.equal(await page.locator('.cell-overcharge').textContent(), '$8.09');
  assert.equal(await page.locator('.history-month').count(), 1);
});

test('history load failures have a working retry instead of a false empty result', async (t) => {
  const { page } = await setup(t, [receipt()], { failLoad: true });
  await page.goto(origin + '/history/history.html');
  await page.waitForFunction(() => document.getElementById('receiptSaveStatus').textContent.includes('Could not load'));
  assert.match(await page.locator('.receipt-empty').textContent(), /could not be loaded/);
  await page.evaluate(() => { window.__test.failLoad = false; });
  await page.locator('#retrySaveBtn').click();
  await page.waitForFunction(() => !!document.querySelector('.cell-name-text'));
  assert.equal(await page.locator('.history-year').count(), 1);
});

test('ongoing scans protect navigation and are excluded from other demo saves', async (t) => {
  const { page, controls } = await setup(t, []);
  await page.route('**/cloud.js', (route) => route.fulfill({ contentType: 'text/javascript',
    body: 'document.documentElement.classList.add("auth-ok"); window.BreadWinner.cloud = { enabled: false };' }));
  await page.evaluate(({ day }) => localStorage.setItem('breadwinner_receipts', JSON.stringify([
    { id: 'existing', name: 'Existing', date: day, lines: [{ name: 'Milk', price: 2, gf: false }] }
  ])), { day });
  await page.reload();
  await page.waitForFunction(() => !!document.querySelector('.cell-name-text'));
  controls.scan = deferred();
  await page.locator('#fileInput').setInputFiles(path.resolve(root, '../backend/test_receipt.png'));
  await page.waitForFunction(() => !!document.querySelector('.receipt-row-processing'));
  assert.equal(await page.evaluate(() => !window.dispatchEvent(new Event('beforeunload', { cancelable: true }))), true);
  await page.locator('.receipt-row[tabindex]:not(.receipt-row-processing)').click();
  await page.locator('.receipt-expand.open .rename-input').fill('Renamed existing');
  await page.locator('.receipt-expand.open .rename-input').press('Enter');
  const stored = await page.evaluate(() => JSON.parse(localStorage.getItem('breadwinner_receipts')));
  assert.equal(stored.length, 1);
  assert.equal(stored[0].name, 'Renamed existing');
  controls.scan.resolve();
  await page.waitForFunction(() => JSON.parse(localStorage.getItem('breadwinner_receipts')).length === 2);
  assert.equal(await page.evaluate(() => JSON.parse(localStorage.getItem('breadwinner_receipts')).some((item) => item.processing)), false);
});

test('expired photo viewing links renew without saving over receipt data', async (t) => {
  const { page } = await setup(t, [receipt({ photo: 'test-user/photo.jpg' })]);
  await page.locator('.receipt-row[tabindex]').click();
  const image = page.locator('.expand-receipt-img');
  await page.waitForFunction(() => document.querySelector('.expand-receipt-img').complete);
  await image.dispatchEvent('error');
  await page.waitForFunction(() => document.querySelector('.expand-receipt-img').src.includes('version=2'));
  assert.equal(await page.evaluate(() => window.__test.writes.length), 0);
  assert.equal(await page.locator('.cell-overcharge').textContent(), '$8.09');
});

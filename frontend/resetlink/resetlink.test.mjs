import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = (await readFile(new URL('./resetlink.js', import.meta.url), 'utf8')).replace(/^import .*;\r?$/gm, '');
const flush = () => new Promise(resolve => setImmediate(resolve));

function setup({ sent = false, verify = async () => true, update = async () => {} } = {}) {
  const nodes = new Map();
  function element(id) {
    if (!nodes.has(id)) nodes.set(id, {
      hidden: ['resetForm', 'settingsLink'].includes(id), disabled: id === 'resetFields',
      value: '', textContent: '', checked: false, validity: '', attributes: {},
      classList: { toggle() {} }, focus() {},
      setAttribute(key, value) { this.attributes[key] = value; },
      removeAttribute(key) { delete this.attributes[key]; },
      setCustomValidity(value) { this.validity = value; },
      addEventListener(key, handler) { this[key] = handler; },
      reportValidity() { return !element('confirmPassword').validity; },
      reset() {}
    });
    return nodes.get(id);
  }
  const updates = [];
  let cleaned = false;
  const cloud = { enabled: true, verifyPasswordRecovery: verify, async setNewPassword(value) { updates.push(value); await update(); } };
  vm.runInNewContext(source, {
    document: { getElementById: element }, URLSearchParams,
    window: { BreadWinner: { cloud }, location: { search: sent ? '?sent=1' : '', hash: '', pathname: '/resetlink' },
      history: { replaceState() { cleaned = true; } } }
  });
  return { element, updates, cleaned: () => cleaned };
}

test('confirmation requires no recovery session and exposes no password form', async () => {
  const app = setup({ sent: true, verify: () => { throw Error('Must not verify'); } });
  await flush();
  assert.equal(app.element('resetTitle').textContent, 'Check your email');
  assert.equal(app.element('resetForm').hidden, true);
  assert.equal(app.cleaned(), true);
});

test('invalid recovery stays disabled and clears callback history', async () => {
  const app = setup({ verify: async () => { throw Error('private server detail'); } });
  await flush();
  assert.equal(app.element('resetForm').hidden, true);
  assert.equal(app.element('resetFields').disabled, true);
  assert.equal(app.cleaned(), true);
  assert.doesNotMatch(app.element('resetStatus').textContent, /private server detail/);
  await app.element('resetForm').submit({ preventDefault() {} });
  assert.equal(app.updates.length, 0);
});

test('matching passwords are required and duplicate submits are blocked while saving', async () => {
  let finish;
  const app = setup({ update: () => new Promise(resolve => { finish = resolve; }) });
  await flush();
  const password = app.element('newPassword');
  const confirm = app.element('confirmPassword');
  const form = app.element('resetForm');
  password.value = 'a long new password'; confirm.value = 'a different password';
  await form.submit({ preventDefault() {} });
  assert.equal(app.updates.length, 0);
  confirm.value = password.value;
  const pending = form.submit({ preventDefault() {} });
  assert.equal(app.element('resetFields').disabled, true);
  await form.submit({ preventDefault() {} });
  assert.equal(app.updates.length, 1);
  finish(); await pending;
  assert.equal(form.hidden, true);
  assert.equal(app.element('resetTitle').textContent, 'Password updated');
  assert.equal(password.value, ''); assert.equal(confirm.value, '');
});

test('failed saves clear password fields, hide provider errors, and allow retry', async () => {
  const app = setup({ update: async () => { throw Error('private server detail'); } });
  await flush();
  app.element('newPassword').value = app.element('confirmPassword').value = 'a long new password';
  await app.element('resetForm').submit({ preventDefault() {} });
  assert.equal(app.element('newPassword').value, '');
  assert.equal(app.element('resetFields').disabled, false);
  assert.doesNotMatch(app.element('resetStatus').textContent, /private server detail/);
});

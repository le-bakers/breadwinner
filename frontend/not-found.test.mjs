import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';
import vm from 'node:vm';

const frontend = new URL('./', import.meta.url);
const html = await readFile(new URL('404.html', frontend), 'utf8');

test('direct previews resolve styles, images and home links inside the frontend folder', async () => {
  const script = html.match(/<script>([\s\S]*?)<\/script>/)[1];
  assert.ok(html.indexOf('</script>') < html.indexOf('<link'), 'base must be set before assets load');
  for (const href of [
    'http://localhost:5500/404.html',
    'http://localhost:5500/breadwinner/frontend/404.html',
    'file:///C:/project/breadwinner/frontend/404.html',
    'https://example.test/breadwinner/404.html?preview=1'
  ]) {
    const location = new URL(href);
    const base = { href: '/' };
    vm.runInNewContext(script, { location, URL, document: { querySelector: () => base } });
    const expected = new URL('./', location);
    assert.equal(base.href, expected.href);
    for (const [, reference] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(reference) || reference === '/') continue;
      const target = new URL(reference, base.href);
      assert.ok(target.href.startsWith(expected.href), reference);
      assert.ok((await stat(new URL(target.href.slice(expected.href.length), frontend))).isFile(), reference);
    }
  }
});

test('404 assets and recovery links resolve from nested missing URLs on both hosts', async () => {
  for (const prefix of ['/', '/breadwinner/']) {
    // The Pages workflow replaces the base with the project path.
    const deployed = html.replace('<base href="/">', `<base href="${prefix}">`);
    const missing = new URL(`https://example.test${prefix}missing/nested/page`);
    const base = new URL(deployed.match(/<base href="([^"]+)">/)[1], missing);
    for (const [, href] of deployed.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
      if (/^https?:/.test(href) || href === prefix) continue;
      const target = new URL(href, base);
      assert.ok(target.pathname.startsWith(prefix), href);
      const file = target.pathname.slice(prefix.length);
      if (file) assert.ok((await stat(new URL(file, frontend))).isFile(), href);
      else assert.equal(target.href, `https://example.test${prefix}`);
    }
  }
});

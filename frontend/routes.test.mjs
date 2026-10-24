import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, stat } from 'node:fs/promises';

const frontend = new URL('./', import.meta.url);
const config = JSON.parse(await readFile(new URL('vercel.json', frontend), 'utf8'));
const source = await readFile(new URL('routes.js', frontend), 'utf8');
async function loadRoutes(base) {
  const code = source.replaceAll('import.meta.url', JSON.stringify(new URL('routes.js', base).href));
  return import('data:text/javascript;base64,' + Buffer.from(code).toString('base64'));
}

test('all navigation destinations match the configured routes and existing HTML files', async () => {
  const { pages } = await loadRoutes('http://localhost:5500/');
  assert.deepEqual(pages, Object.fromEntries(config.rewrites.map(route => [route.source, route.destination.slice(1)])));
  for (const file of Object.values(pages)) assert.ok((await stat(new URL(file, frontend))).isFile(), file);
});

test('generated navigation retains the frontend prefix on localhost, file previews, and deployed subpaths', async () => {
  for (const base of ['http://localhost:5500/', 'http://localhost:5500/project/frontend/',
    'https://example.test/breadwinner/', 'file:///C:/project/frontend/']) {
    const { pages, pageUrl, assetUrl } = await loadRoutes(base);
    for (const [route, file] of Object.entries(pages)) {
      assert.equal(pageUrl(route), new URL(file, base).href);
      assert.equal(pageUrl(route + '?test=1#top'), new URL(file + '?test=1#top', base).href);
    }
    assert.equal(assetUrl('images/breadwinner_logo_black.png'), new URL('images/breadwinner_logo_black.png', base).href);
  }
});

test('HTML navigation and assets resolve on every clean route and static localhost page', async () => {
  for (const base of ['http://localhost:5500/', 'http://localhost:5500/project/frontend/']) {
    for (const route of config.rewrites) {
      const file = route.destination.slice(1);
      const html = await readFile(new URL(file, frontend), 'utf8');
      const pages = [new URL(file, base)];
      if (base === 'http://localhost:5500/') pages.push(new URL(route.source, base));
      for (const page of pages) {
        for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
          if (/^(?:https?:|mailto:|data:|#)/.test(href)) continue;
          const target = new URL(href, page);
          assert.ok(target.href.startsWith(base), `${page}: ${href} escaped the frontend folder`);
          const relative = target.pathname.slice(new URL(base).pathname.length);
          assert.ok((await stat(new URL(relative, frontend))).isFile(), `${page}: ${href}`);
          if (target.hash && relative.endsWith('.html')) {
            const destination = await readFile(new URL(relative, frontend), 'utf8');
            assert.ok(destination.includes(`id="${target.hash.slice(1)}"`), `${page}: missing anchor ${href}`);
          }
        }
      }
    }
  }
});

test('GitHub Pages root copy resolves navigation and assets inside the project prefix', async () => {
  // Keep this aligned with the root-page transformation in deploy-pages.yml.
  const html = (await readFile(new URL('index/index.html', frontend), 'utf8')).replaceAll('../', '');
  const base = 'https://example.test/breadwinner/';
  for (const [, href] of html.matchAll(/\b(?:href|src)="([^"]+)"/g)) {
    if (/^(?:https?:|mailto:|data:|#)/.test(href)) continue;
    const target = new URL(href, base);
    assert.ok(target.href.startsWith(base));
    assert.ok((await stat(new URL(target.pathname.slice('/breadwinner/'.length), frontend))).isFile(), href);
  }
});

test('Start Free links lead to account creation', async () => {
  const html = await readFile(new URL('index/index.html', frontend), 'utf8');
  for (const [, href] of html.matchAll(/href="([^"]+)"[^>]*>Start Free</g)) {
    assert.equal(href, '../onboarding/onboarding.html');
  }
  const footer = await readFile(new URL('components/footer.js', frontend), 'utf8');
  assert.match(footer, /pageUrl\('\/signup'\)[^\n]+Start Free/);
});

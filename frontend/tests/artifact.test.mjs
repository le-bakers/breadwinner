import test from 'node:test';
import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';

async function files(directory) {
  const result = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    result.push(...(entry.isDirectory() ? await files(file) : [file]));
  }
  return result;
}
test('deploy artifact excludes private sources and enforces script policy', async () => {
  const paths = await files('_site');
  assert.ok(paths.some(file => file.endsWith('vendor' + path.sep + 'supabase.js')));
  assert.ok(paths.some(file => file.endsWith('THIRD_PARTY_NOTICES.txt')));
  assert.ok(!paths.some(file => /(?:node_modules|Receipts|\.env|\.ts$|\.py$|\.sql$|package-lock)/.test(file)));
  for (const file of paths.filter(file => file.endsWith('.html'))) {
    const html = await readFile(file, 'utf8');
    assert.match(html, /Content-Security-Policy/);
    assert.match(html, /script-src 'self'/);
    assert.doesNotMatch(html, /<script(?![^>]*\bsrc=)[^>]*>/);
    assert.doesNotMatch(html, /fonts\.google|accounts\.google\.com\/gsi|on(?:click|error|load)\s*=/);
  }
});

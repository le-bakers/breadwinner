import { build } from 'esbuild';
import { cp, mkdir, readdir, readFile, writeFile, rm } from 'node:fs/promises';
import path from 'node:path';

// Copy only public assets, never repo data, tooling, env files, or node_modules.
const output = '_site';
const target = path.resolve(output);
if (target !== path.join(process.cwd(), '_site')) throw new Error('Invalid output path');
await rm(target, { recursive: true, force: true });
await mkdir(output, { recursive: true });
const publicDirectories = ['about', 'components', 'contactus', 'home', 'images', 'index', 'legal', 'onboarding', 'settings', '.well-known'];
for (const directory of publicDirectories) {
  await cp(directory, path.join(output, directory), {
    recursive: true, filter: (source) => !source.endsWith('.ts')
  });
}
for (const file of ['shared.js', 'shared.css', 'cloud.js', 'theme.js']) await cp(file, path.join(output, file));
await build({ stdin: { contents: "export * from '@supabase/supabase-js';", resolveDir: process.cwd(), sourcefile: 'supabase-entry.js' },
  bundle: true, format: 'esm', platform: 'browser', minify: true,
  outfile: path.join(output, 'vendor', 'supabase.js') });
// Preserve redistributed library licenses alongside the bundled SDK.
const lock = JSON.parse(await readFile('package-lock.json', 'utf8'));
const notices = [];
for (const [directory, info] of Object.entries(lock.packages)) {
  if (!directory || info.dev || info.devOptional) continue;
  const pkg = JSON.parse(await readFile(path.join(directory, 'package.json'), 'utf8'));
  let license = '';
  for (const candidate of ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENCE', 'License']) {
    try { license = await readFile(path.join(directory, candidate), 'utf8'); break; } catch (_) {}
  }
  if (!license) throw new Error(`Review distribution license for ${pkg.name}`);
  notices.push(`${pkg.name} ${pkg.version}\n${license}`);
}
await writeFile(path.join(output, 'THIRD_PARTY_NOTICES.txt'), notices.join('\n\n--------------------\n\n'));
// Root landing page remains a copy so relative navigation also works on project Pages.
for (const ext of ['html', 'js', 'css']) {
  let source = await readFile(`index/index.${ext}`, 'utf8');
  if (ext !== 'css') source = source.replaceAll('../', './');
  await writeFile(path.join(output, `index.${ext}`), source);
}
const local = process.env.BW_LOCAL_DEV === '1';
const csp = "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; font-src 'self'; connect-src 'self' https://ddnncfschrbihtftzhve.supabase.co https://breadwinner-wt1k.onrender.com" +
  (local ? ' http://127.0.0.1:8000' : '') +
  "; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors 'none'" + (local ? '' : '; upgrade-insecure-requests');
// GitHub Pages ignores custom response headers. A meta CSP supplies supported directives;
// framing protection and HSTS still require the Vercel/edge response headers.
async function protect(directory) {
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const file = path.join(directory, entry.name);
    if (entry.isDirectory()) await protect(file);
    else if (entry.name.endsWith('.html')) {
      const html = await readFile(file, 'utf8');
      const meta = csp.replace("; frame-ancestors 'none'", '');
      await writeFile(file, html.replace('<head>', `<head>\n<meta http-equiv="Content-Security-Policy" content="${meta}">\n<meta name="referrer" content="no-referrer">`));
    }
  }
}
await protect(output);
await writeFile(path.join(output, '.nojekyll'), '');
console.log('Built public site with bundled authentication SDK and CSP.');

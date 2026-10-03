import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

test('production server renders the game, health route, metadata, fonts and classic mode', async (t) => {
  const port = 39121;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  let home;
  for (let i = 0; i < 40; i++) { try { home = await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
  assert.equal(home?.status, 200);
  assert.match(await home.text(), /<title>Healthy Hero<\/title>/);
  const csp = home.headers.get('content-security-policy');
  assert.match(csp, /font-src 'self'/);
  assert.match(csp, /script-src 'self'/);
  const health = await fetch(`http://127.0.0.1:${port}/healthz`);
  assert.equal(await health.text(), 'healthy-hero-ok');
  const meta = await fetch(`http://127.0.0.1:${port}/.well-known/flexzonic-game.json`);
  assert.equal(meta.status, 200);
  const json = await meta.json();
  assert.equal(json.id, 'healthy-hero');
  assert.equal(json.version, '2.0.1');
  const font = await fetch(`http://127.0.0.1:${port}/assets/fonts/nunito-latin-900-normal.woff2`);
  assert.equal(font.headers.get('content-type'), 'font/woff2');
  const three = await fetch(`http://127.0.0.1:${port}/src/vendor/three.module.min.js?v=2.0.1`);
  assert.equal(three.status, 200);
  assert.match(three.headers.get('content-type'), /javascript/);
  const classic = await fetch(`http://127.0.0.1:${port}/classic/`);
  assert.match(await classic.text(), /Healthy Hero Classic/);
  const traversal = await fetch(`http://127.0.0.1:${port}/..%2f..%2fetc%2fpasswd`);
  assert.match(await traversal.text(), /<title>Healthy Hero<\/title>/);
});

test('production server hides blueprints, tools and docs', async (t) => {
  const port = 39122;
  const child = spawn(process.execPath, ['server.mjs'], { cwd: new URL('..', import.meta.url), env: { ...process.env, PORT: String(port), NODE_ENV: 'production' }, stdio: 'ignore' });
  t.after(() => child.kill('SIGTERM'));
  let home;
  for (let i = 0; i < 40; i++) { try { home = await fetch(`http://127.0.0.1:${port}/`); break; } catch { await new Promise((r) => setTimeout(r, 50)); } }
  assert.equal(home?.status, 200);
  for (const path of ['/blueprints/healthy-hero-3d-blueprints.pdf', '/blueprints/', '/tools/blueprint-sheets.html', '/scripts/game.test.mjs', '/README.md', '/x/..%2fblueprints/healthy-hero-3d-blueprints.pdf']) {
    const res = await fetch(`http://127.0.0.1:${port}${path}`);
    assert.equal(res.status, 404, path);
    assert.doesNotMatch(res.headers.get('content-type'), /pdf/, path);
  }
  const odd = await fetch(`http://127.0.0.1:${port}//blueprints/healthy-hero-3d-blueprints.pdf`);
  assert.doesNotMatch(odd.headers.get('content-type'), /pdf/);
  const game = await fetch(`http://127.0.0.1:${port}/src/blueprints.js?v=2.0.1`);
  assert.equal(game.status, 200, 'the game still loads its model specs');
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';

const root = new URL('../', import.meta.url);
const read = (p) => readFile(new URL(p, root), 'utf8');
const main = await read('src/main.js');
const ui = await read('src/ui.js');
const contentSrc = await read('src/content.js');
const narrator = await read('src/narrator.js');
const compose = await read('compose.yaml');
const metadata = JSON.parse(await read('.well-known/flexzonic-game.json'));
const index = await read('index.html');
const server = await read('server.mjs');
const sw = await read('sw.js');
const deploy = await read('deploy.sh');
const styles = await read('styles.css');
const missionPlan = await import(new URL('src/mission-plan.js', root));
const content = await import(new URL('src/content.js', root));
const VERSION = '2.0.0';

test('contains 30 missions, 72 encounters, and six complete wellness topics', () => {
  assert.match(main, /Math\.min\(index, 29\)/);
  for (const world of ['Fuel Garden', 'Hydration Falls', 'Move Mountain', 'Sleep Sky', 'Hygiene Harbor', 'Calm Grove']) assert.match(contentSrc, new RegExp(world));
  assert.equal((contentSrc.match(/^\s+\[\d,'/gm) || []).length, 72);
  for (let zone = 0; zone < 6; zone++) assert.equal((contentSrc.match(new RegExp(`^\\s+\\[${zone},`, 'gm')) || []).length, 12);
  assert.equal(content.Q.length, 72);
  for (const q of content.Q) {
    assert.equal(q.choices.length, 3, q.q);
    assert.ok(q.answer >= 0 && q.answer < 3, q.q);
    assert.ok(q.explain.length > 10 && q.hint.length > 3, q.q);
  }
});

test('first twelve missions use 72 different encounters and mix all six wellness topics', () => {
  const firstTwelve = Array.from({ length: 12 }, (_, i) => missionPlan.missionEncounterIds(i));
  assert.equal(new Set(firstTwelve.flat()).size, 72);
  for (const ids of firstTwelve) {
    assert.equal(ids.length, 6);
    assert.equal(new Set(ids.map((id) => Math.floor(id / missionPlan.QUESTIONS_PER_ZONE))).size, 6);
  }
  assert.equal(missionPlan.READING_GRACE_MS, 7000);
  assert.deepEqual(missionPlan.APPROACH_BY_TIER, [30000, 28000, 26000, 24000, 22000]);
});

test('kid-friendly timing: narration first, then a 7-second grace, then a long answer window', () => {
  assert.ok(Math.min(...missionPlan.APPROACH_BY_TIER) >= 22000);
  assert.match(main, /function encounterChunks/);
  assert.match(main, /'Choices are\.'/);
  assert.match(main, /onEnd: beginGrace/);
  assert.match(main, /readingTimer = setTimeout\(/);
  assert.match(main, /READING_GRACE_MS\)/);
  assert.match(main, /approachTimer = setTimeout\(\(\) => rush\(undefined, true\), run\.m\.approachMs\)/);
  // READ restarts the full read / grace / answer cycle
  assert.match(main, /case 'speak': if \(run\?\.state === 'ready'\) \{ run\.reading = true; queueEncounter\(\); \}/);
  // Pausing clears timers; resuming re-queues the full cycle
  assert.match(main, /function closeOverlayAndResume[\s\S]*queueEncounter\(\)/);
  // Narration never stalls the game if a browser forgets onend
  assert.match(narrator, /safetyTimer/);
  assert.match(narrator, /onChunk/);
});

test('continuous run controls support keyboard, touch cards, buttons and swipes', () => {
  assert.match(main, /KeyW: \(\) => rush\(\), ArrowUp: \(\) => rush\(\)/);
  assert.match(main, /KeyA: \(\) => changeLane\(-1\)/);
  assert.match(main, /KeyD: \(\) => changeLane\(1\)/);
  assert.match(main, /KeyS: \(\) => calmMove\(\)/);
  assert.match(main, /Digit1: \(\) => selectLane\(0\)/);
  assert.match(ui, /'data-action': 'rush'/);
  assert.match(ui, /'data-lane': '-1'/);
  assert.match(ui, /'data-answer': i/);
  assert.match(main, /selectLane\(Number\(t\.dataset\.answer\)\)/);
  assert.match(main, /Swipe controls/);
});

test('helpful answers burst gates open, misses crash through gently, and a Power Fact is taught', () => {
  assert.match(main, /run\.state = 'correct'/);
  assert.match(main, /run\.state = 'wrong'/);
  assert.match(main, /advanceTimer = setTimeout\(\(\) => showFact\(correct, q\)/);
  assert.match(main, /factTimer = setTimeout\(advanceRun/);
  assert.match(ui, /Keep running/);
  assert.match(main, /Keep running/);
  assert.match(main, /save\.facts\[q\.id\] = Math\.max/);
  // scoring and stars unchanged from v1.3.1
  assert.match(main, /run\.score \+= 100 \+ run\.combo \* 20 \+ \(auto \? 0 : 25\)/);
  assert.match(main, /run\.mistakes === 0 && run\.hearts === 3 \? 3 : run\.mistakes <= 2 && run\.hearts >= 1 \? 2 : 1/);
});

test('game is gentle, family-friendly, and avoids body-shaming mechanics', () => {
  assert.match(ui, /no food-shaming/i);
  assert.match(ui, /not medical advice/i);
  assert.match(contentSrc, /FAMILY=/);
  assert.match(narrator, /rate = 0\.72/);
  assert.match(narrator, /masculineNames/);
  assert.match(ui, /Stop if anything hurts/);
  const banned = /\b(calorie|weight loss|diet|skinny|fat)\b/i;
  for (const q of content.Q) assert.doesNotMatch(`${q.q} ${q.choices.join(' ')} ${q.explain}`, banned, q.q);
});

test('save data stays compatible with v1.3.1 and lives only on the device', () => {
  assert.match(main, /const SAVE_KEY = 'healthy-hero-save-v1'/);
  for (const key of ['unlocked', 'selected', 'stars', 'xp', 'badges', 'voice', 'familyDone']) assert.match(main, new RegExp(`${key}:`));
  assert.doesNotMatch(main + ui, /fetch\(|XMLHttpRequest|sendBeacon/);
});

test('portal metadata is standardized for the Flexzonic directory', () => {
  assert.equal(metadata.url, 'https://healthy.flexzonicgames.com');
  assert.equal(metadata.title, 'Healthy Hero');
  assert.equal(metadata.name, 'Healthy Hero');
  assert.equal(metadata.category, 'Educational');
  assert.equal(metadata.version, VERSION);
  assert.equal(metadata.order, 36);
  assert.equal(metadata.healthPath, '/healthz');
});

test('every module import carries the same cache-busting version (no duplicate three.js)', async () => {
  const files = (await readdir(new URL('src/', root))).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = await read(`src/${f}`);
    for (const m of src.matchAll(/from '([^']+)'|import\('([^']+)'\)/g)) {
      const spec = m[1] || m[2];
      assert.ok(spec.endsWith(`?v=${VERSION}`), `${f} imports ${spec} without ?v=${VERSION}`);
    }
  }
  assert.match(index, new RegExp(`styles\\.css\\?v=${VERSION.replace(/\./g, '\\.')}`));
  assert.match(index, new RegExp(`main\\.js\\?v=${VERSION.replace(/\./g, '\\.')}`));
});

test('strict CSP friendly: no inline styles, inline scripts, or external hosts', async () => {
  const files = (await readdir(new URL('src/', root))).filter((f) => f.endsWith('.js'));
  for (const f of files) {
    const src = await read(`src/${f}`);
    assert.doesNotMatch(src, /style="/, `${f} uses an inline style attribute`);
    assert.doesNotMatch(src, /\binnerHTML\s*=/, `${f} assigns innerHTML`);
    const urls = [...src.matchAll(/https?:\/\/[^'"`\s)]+/g)].map((m) => m[0]).filter((u) => !u.startsWith('http://www.w3.org/2000/svg'));
    assert.deepEqual(urls, [], `${f} references external URLs`);
  }
  assert.doesNotMatch(index, /<script>(?!\s*<\/script>)/);
  assert.doesNotMatch(styles, /@import url\('https?:/);
  assert.match(server, /font-src 'self'/);
  assert.match(server, /script-src 'self'/);
});

test('deployment uses bridge networking, port 8121, and cache-safe versioned assets', () => {
  assert.match(compose, /network_mode: bridge/);
  assert.match(compose, /8121\}:3000/);
  assert.match(compose, /image: healthy-hero:2\.0\.0/);
  assert.doesNotMatch(compose, /^networks:/m);
  assert.match(server, /no-cache, must-revalidate/);
  assert.doesNotMatch(server, /immutable/);
  assert.match(sw, /healthy-hero-v\$\{VERSION\}-3d/);
  assert.match(sw, /const VERSION = '2\.0\.0'/);
  assert.match(deploy, /Waiting for health check/);
  assert.match(deploy, /did not become healthy within 30 seconds/);
  assert.match(main, /3D BUILD v|BUILD_VERSION = '2\.0\.0'/);
});

test('service worker precaches only files that exist', async () => {
  const swMod = sw.replace(/self\.addEventListener[\s\S]*$/, '');
  const fn = new Function(`${swMod}; return APP;`);
  const app = fn();
  for (const entry of app) {
    const path = entry.split('?')[0];
    const file = path === '/' ? 'index.html' : path.endsWith('/') ? `${path.slice(1)}index.html` : path.slice(1);
    await access(new URL(file, root));
  }
  assert.ok(app.length > 20);
});

test('classic 2D fallback ships alongside the 3D game', async () => {
  const classic = await read('classic/classic.js');
  assert.match(classic, /from '\.\.\/src\/narrator\.js\?v=2\.0\.0'/);
  assert.match(classic, /setProperty\('--lane'/);
  assert.doesNotMatch(classic.split('function render()')[1].split('function overlayHtml')[0], /style="/);
  assert.match(ui, /href: '\/classic\/'/);
});

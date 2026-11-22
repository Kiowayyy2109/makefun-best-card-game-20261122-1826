// Ember Duel — browser play-test via Playwright + Hatch Chrome.
// Loads the real game, clicks Start, plays cards, ends the turn, waits for
// the AI to answer, and checks the win/loss shot scenes stage correctly.
// Usage: node tests/playtest.mjs
import { chromium } from '/opt/hatch/skills/spaces/ts-runtime/dist/node_modules/playwright/index.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const GAME_DIR = '/home/hatch/workspace/makefun/cardgame-entry-v2/game';
const ORIGIN = 'https://ember-duel.example';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
};
const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');

const browser = await chromium.launch({
  executablePath: '/opt/meta-chromium/chrome',
  args: ['--no-sandbox', '--disable-dev-shm-usage', '--use-angle=swiftshader-webgl', '--enable-unsafe-swiftshader', `--hatch-webgl-allowed-domains-file=${policyPath}`, `--hatch-webgl-allowed-domains-sha256=${policySha}`],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`[console-error] ${msg.text()}`);
});
page.on('pageerror', (err) => errors.push(`[pageerror] ${err.message}`));
page.on('requestfailed', (req) => errors.push(`[requestfailed] ${req.url()} ${req.failure()?.errorText ?? ''}`));
await page.route(`${ORIGIN}/**`, async (route) => {
  const url = new URL(route.request().url());
  let pathname = decodeURIComponent(url.pathname);
  if (pathname.endsWith('/')) pathname += 'index.html';
  const file = join(GAME_DIR, normalize(pathname));
  if (!file.startsWith(GAME_DIR) || !existsSync(file) || !statSync(file).isFile()) {
    await route.fulfill({ status: 404, body: 'not found' });
    return;
  }
  await route.fulfill({
    status: 200,
    contentType: MIME[extname(file).toLowerCase()] ?? 'application/octet-stream',
    body: readFileSync(file),
  });
});

let passed = 0;
let failed = 0;
function check(name, ok, detail = '') {
  if (ok) { passed += 1; console.log(`PASS ${name}`); }
  else { failed += 1; console.log(`FAIL ${name} ${detail}`); }
}

// 1. Title screen loads, no errors.
await page.goto(`${ORIGIN}/?seed=7`, { waitUntil: 'load', timeout: 30000 });
await page.waitForTimeout(800);
let status = await page.evaluate(() => document.getElementById('status')?.textContent);
check('title screen announces start', /Ember Duel/.test(status ?? ''), `status=${status}`);
check('no console errors on load', errors.length === 0, errors.join('; '));

// 2. Click Start (button at 540-740 x, 520-580 y in 1280x720).
await page.mouse.click(640, 550);
await page.waitForTimeout(500);
status = await page.evaluate(() => document.getElementById('status')?.textContent);
check('start button begins the duel', /Playing/.test(status ?? ''), `status=${status}`);

// 3. Play three turns: click a hand card, then End Turn, wait for the AI.
for (let turn = 1; turn <= 3; turn += 1) {
  // Click the first hand card (leftmost card centre ~ x=420, y=590 at 1280x720).
  await page.mouse.click(420, 590);
  await page.waitForTimeout(300);
  // Click End Turn (1090-1250 x, 600-652 y).
  await page.mouse.click(1170, 626);
  // AI answers one card per ~750ms; wait for the turn to come back.
  await page.waitForTimeout(4000);
  status = await page.evaluate(() => document.getElementById('status')?.textContent);
  console.log(`  after turn ${turn}: status=${status}`);
}
check('three turns played without console errors', errors.length === 0, errors.join('; '));
status = await page.evaluate(() => document.getElementById('status')?.textContent);
check('game still running after 3 turns', /Turn \d/.test(status ?? '') || /Playing/.test(status ?? ''), `status=${status}`);

// 4. Keyboard: press a number key to play a card (should not error).
await page.keyboard.press('1');
await page.waitForTimeout(300);
check('number-key play causes no console errors', errors.length === 0, errors.join('; '));

// 5. Win and loss shot scenes stage and paint.
for (const [shot, want] of [['win', 'Victory'], ['loss', 'Defeat']]) {
  await page.goto(`${ORIGIN}/?shot=${shot}&seed=7`, { waitUntil: 'load', timeout: 30000 });
  let ready = false;
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 25000 });
    ready = true;
  } catch { ready = false; }
  check(`shot ${shot} paints (shotReady)`, ready);
  check(`no console errors on ${shot} shot`, errors.length === 0, errors.join('; '));
}

console.log(`\n${passed} passed, ${failed} failed; console errors: ${errors.length}`);
await browser.close();
process.exit(failed === 0 ? 0 : 1);

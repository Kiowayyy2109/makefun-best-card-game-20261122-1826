// Ember Duel — screenshot capture via Playwright + Hatch Chrome.
// The hardened browser refuses loopback navigations, so the game files are
// served through request interception on a fake https origin instead.
// Usage: node tests/capture.mjs [seed]   (writes screenshots/1..4-*.jpg)
import { chromium } from '/opt/hatch/skills/spaces/ts-runtime/dist/node_modules/playwright/index.mjs';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync, statSync, mkdirSync } from 'node:fs';
import { join, normalize, extname } from 'node:path';

const seed = process.argv[2] ?? '7';
const SHOTS = [
  ['start', '1-start.jpg'],
  ['play', '2-play.jpg'],
  ['win', '3-win.jpg'],
  ['loss', '4-loss.jpg'],
];
const GAME_DIR = '/home/hatch/workspace/makefun/cardgame-entry-v2/game';
const OUT_DIR = '/home/hatch/workspace/makefun/cardgame-entry-v2/screenshots';
const ORIGIN = 'https://ember-duel.example';
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
};
const policyPath = '/var/lib/hatch-browser/rootfs-base/usr/share/hatch/chromium/webgl-allowed-domains.txt';
const policySha = createHash('sha256').update(readFileSync(policyPath)).digest('hex');

mkdirSync(OUT_DIR, { recursive: true });
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

for (const [shot, name] of SHOTS) {
  await page.goto(`${ORIGIN}/?shot=${shot}&seed=${seed}`, { waitUntil: 'load', timeout: 30000 });
  let ready = false;
  try {
    await page.waitForFunction(() => window.__shotReady === true, null, { timeout: 25000 });
    ready = true;
  } catch {
    ready = false;
  }
  await page.waitForTimeout(150);
  const state = await page.evaluate(() => ({
    status: document.getElementById('status')?.textContent ?? null,
  }));
  const outPath = join(OUT_DIR, name);
  await page.screenshot({ path: outPath, type: 'jpeg', quality: 86 });
  const size = statSync(outPath).size;
  console.log(JSON.stringify({ shot, seed, file: name, bytes: size, ready, state }));
}
console.log(JSON.stringify({ errors }));
await browser.close();

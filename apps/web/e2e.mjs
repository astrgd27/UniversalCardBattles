// Browser smoke test over the real UI: library -> game menu -> setup -> table, deckbuilder, gallery, saves, hot-seat, phone width.
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
const { chromium } = createRequire(import.meta.url)('playwright'); // pre-installed globally in CI images; else: npm i -D playwright

const port = 4179;
const server = spawn('npx', ['vite', 'preview', '--config', 'apps/web/vite.config.ts', '--port', String(port), '--strictPort'], { stdio: 'ignore' });
const fail = [];
const ok = (c, msg) => { if (!c) fail.push(msg); };
try {
  await new Promise((r) => setTimeout(r, 1500));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1280, height: 900 } });
  page.on('pageerror', (e) => fail.push(`pageerror: ${e.message}`));
  page.on('console', (m) => { if (m.type() === 'error') fail.push(`console: ${m.text()}`); });
  await page.goto(`http://localhost:${port}/`);
  const ids = await page.$$eval('[data-module]', (t) => t.map((x) => x.dataset.module));
  ok(ids.length === 6, `expected 6 game tiles, got ${ids.length}`);
  const open = async (id) => { await page.click('text=← Library').catch(() => {}); await page.click(`[data-module="${id}"]`); };
  const seat = (i, label) => page.click(`[data-seat="${i}"] .seg button:text-is("${label}")`);

  for (const id of ids) {
    await open(id);
    await page.click('[data-menu=play]');
    const n = await page.$$eval('[data-seat]', (s) => s.length);
    for (let i = 1; i <= n; i++) await seat(i, 'Random');
    await page.check('text=Fast AI');
    await page.click('text=Start match');
    await page.waitForSelector('.gameover', { timeout: 120000 });
    const r = await page.evaluate(() => ({ r: window.__ucb.match.s.result, t: window.__ucb.match.s.turn.n }));
    console.log(`${id}: ${JSON.stringify(r.r)} after ${r.t} turns`);
    await page.click('.gameover >> text=Game menu');
    ok(await page.isVisible('[data-menu=play]'), `${id}: back on the game menu`);
  }

  // Human vs AI on Spark Duel.
  await open('spark-duel');
  await page.click('[data-menu=play]');
  await page.waitForSelector('[data-seat="1"]');
  await seat(2, 'AI');
  await page.click('text=Start match');
  await page.waitForSelector('.hud-status.go');
  const dim = await page.$('.seat-area.me .hand .card:not(.legal)');
  if (dim) { await dim.click(); ok(await page.isVisible('.dock .note'), 'tapping an unusable card explains why'); await page.click('.dock .note .x'); }
  const legal = await page.$('.card.legal');
  if (legal) {
    await legal.click();
    if (await page.isVisible('.dock >> text=Confirm')) { await page.click('.target >> nth=0'); await page.click('.dock >> text=Confirm'); }
  }
  await page.click('button.pass');
  await page.waitForFunction(() => window.__ucb.match.s.turn.n >= 3 || window.__ucb.match.s.result, null, { timeout: 30000 });
  await page.click('button[aria-label=Log]');
  ok(await page.$$eval('.log li', (l) => l.length) > 3, 'log drawer has entries');
  await page.click('button[aria-label=Menu]');
  await page.click('.panel-pop >> text=Save game');
  await page.click('.panel-pop >> text=Quit to game menu');
  ok(await page.isVisible('[data-menu=continue]'), 'continue appears after saving');
  await page.click('[data-menu=continue]');
  ok(await page.isVisible('.hud'), 'saved game resumes');
  await page.click('button[aria-label=Menu]');
  await page.click('.panel-pop >> text=Quit to game menu');

  // Hot seat.
  await page.click('[data-menu=play]');
  await seat(2, 'Human');
  await page.click('text=Start match');
  await page.waitForSelector('.hud-status.go');
  await page.click('button.pass');
  ok(await page.isVisible('text=Pass the device to Player 2'), 'hot-seat cover');
  await page.click('text=I am Player 2');
  ok(await page.isVisible('.hud-status.go'), 'player 2 can move');
  await page.click('button[aria-label=Menu]');
  await page.click('.panel-pop >> text=Quit to game menu');

  // Deckbuilder: build a legal 20-card deck (2 copies of 10 cards), save it, see it in setup.
  await page.click('[data-menu=decks]');
  await page.click('text=+ New deck');
  for (let i = 0; i < 10; i++) for (let k = 0; k < 2; k++) await page.click(`.pool .card >> nth=${i}`);
  ok(await page.isVisible('text=✓ Legal'), 'deck becomes legal');
  await page.fill('.deck-name', 'Test Deck');
  await page.press('.deck-name', 'Tab');
  await page.click('text=Save deck');
  ok(await page.isVisible('text=Deck saved'), 'deck saved');
  await page.click('text=← Spark Duel');
  await page.click('[data-menu=play]');
  ok((await page.$$eval('.deck-select option', (o) => o.map((x) => x.textContent))).includes('★ Test Deck'), 'custom deck offered in setup');

  // Gallery.
  await page.click('text=← Spark Duel');
  await page.click('[data-menu=gallery]');
  ok(await page.$$eval('.gallery .grid .card', (c) => c.length) === 19, 'gallery shows all cards');
  await page.fill('.search', 'bolt');
  ok(await page.$$eval('.gallery .grid .card', (c) => c.length) === 1, 'gallery search filters');
  await page.click('.gallery .grid .card');
  ok(await page.isVisible('.enlarged'), 'card enlarges');
  await page.keyboard.press('Escape');

  // Phone width: library and table without horizontal scroll.
  await page.setViewportSize({ width: 390, height: 844 });
  await page.click('text=← Spark Duel');
  await page.click('text=← Library');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'library fits a phone');
  await open('arcane-duel');
  await page.click('[data-menu=play]');
  await page.click('text=Start match');
  await page.waitForSelector('.hud');
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'table fits a phone');
  await browser.close();
} finally {
  server.kill();
}
console.log(fail.length ? `FAIL\n${fail.join('\n')}` : 'e2e OK');
process.exitCode = fail.length ? 1 : 0;

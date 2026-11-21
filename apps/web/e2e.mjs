// Browser smoke test: every reference game AI-vs-AI in the real UI, a human turn, explanations, hot-seat cover, save/load, phone layout.
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
  const seat = (i, v) => page.selectOption(`select[aria-label="Player ${i} seat"]`, v);
  const ids = await page.$$eval('select[aria-label="Game"] option', (o) => o.map((x) => x.value));
  ok(ids.length === 6, `expected 6 games, got ${ids.length}`);
  await page.check('text=Fast AI');
  for (const id of ids) {
    await page.selectOption('select[aria-label="Game"]', id);
    const n = await page.$$eval('select[aria-label$="seat"]', (s) => s.length);
    for (let i = 1; i <= n; i++) await seat(i, 'random');
    await page.click('text=New game');
    await page.waitForFunction(() => window.__ucb.match?.s.result, null, { timeout: 120000 });
    const r = await page.evaluate(() => ({ r: window.__ucb.match.s.result, t: window.__ucb.match.s.turn.n }));
    console.log(`${id}: ${JSON.stringify(r.r)} after ${r.t} turns`);
    ok(await page.isVisible('text=Game over'), `${id}: no game-over banner`);
  }

  // Human vs AI: play legal moves through clicks until the turn comes back.
  await page.selectOption('select[aria-label="Game"]', 'spark-duel');
  await seat(1, 'human');
  await page.click('text=New game');
  await page.waitForSelector('text=Your move');
  await page.click('.panel.me .card:not(.legal)').catch(() => {});
  ok(await page.isVisible('.note'), 'clicking an unusable card should explain why');
  const legal = await page.$('.card.legal');
  if (legal) {
    await legal.click();
    if (await page.isVisible('.prompt >> text=Confirm')) {
      await page.click('.target >> nth=0');
      await page.click('text=Confirm');
    }
  }
  await page.click('button.pass');
  await page.waitForFunction(() => window.__ucb.match.s.turn.n >= 3 || window.__ucb.match.s.result, null, { timeout: 30000 });
  ok(await page.$$eval('.log li', (l) => l.length) > 3, 'log should have entries');
  await page.click('text=Save');
  await page.click('text=Load');
  ok(await page.evaluate(() => !!window.__ucb.match), 'load failed');

  // Hot seat: two humans get a cover screen between turns.
  await seat(2, 'human');
  await page.click('text=New game');
  await page.click('button.pass');
  ok(await page.isVisible('text=Pass the device to Player 2'), 'hot-seat cover missing');
  await page.click('text=I am Player 2');
  ok(await page.isVisible('text=Your move'), 'player 2 should be able to move');

  // Phone layout: no horizontal scrolling.
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'horizontal overflow at phone width');
  await browser.close();
} finally {
  server.kill();
}
console.log(fail.length ? `FAIL\n${fail.join('\n')}` : 'e2e OK');
process.exitCode = fail.length ? 1 : 0;

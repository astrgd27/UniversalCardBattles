// Browser smoke test over the real UI: Workshop (every station, recipes, surprise games, undo, AI lab, playtest,
// publish) -> the published game in the library -> setup -> a full AI match -> deckbuilder, gallery -> phone and tablet widths.
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
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${port}/`);
  ok(await page.isVisible('[data-act=maker]'), 'library shows the Game Maker');

  // ---- Workshop
  await page.click('[data-act=maker]');
  await page.click('[data-act=mk-new]');
  await page.click('[data-blueprint=blank]');
  ok(await page.isVisible('.mk-bugs.good'), 'blank game builds');
  for (const st of ['identity', 'shelf', 'frames', 'types', 'board', 'turn', 'rules', 'keywords', 'cards', 'decks', 'test', 'publish', 'lab']) {
    await page.click(`[data-station=${st}]`);
    ok(await page.isVisible('.mk-main'), `station ${st} renders`);
  }
  await page.click('[data-station=cards]');
  await page.click('.mk-grid .card >> nth=2');
  await page.click('[data-act=mk-ability]');
  ok(await page.isVisible('.mk-bugs.good'), 'still builds after adding an ability');
  await page.click('[data-station=test]');
  await page.click('[data-act=mk-sim]');
  await page.waitForSelector('.mk-report', { timeout: 180000 });
  ok((await page.textContent('.mk-report')).includes('10 AI games'), 'AI lab report');
  await page.click('[data-act=mk-play]');
  await page.waitForSelector('.hud-status', { timeout: 20000 });
  await page.click('[data-act=mk-back]');
  await page.click('[data-station=publish]');
  ok(await page.isVisible('.mk-rules'), 'rulebook renders');
  await page.click('[data-act=mk-publish]');
  await page.click('text=← Projects');

  // Surprise games and stacked recipes all build; undo takes a recipe back.
  for (let i = 0; i < 3; i++) {
    await page.click('[data-act=mk-new]');
    await page.click('[data-blueprint=surprise]');
    ok(await page.isVisible('.mk-bugs.good'), `surprise game ${i} builds (${await page.textContent('.mk-bugs')})`);
    await page.click('text=← Projects');
  }
  await page.click('[data-act=mk-new]');
  await page.click('[data-blueprint=blank]');
  await page.click('[data-station=shelf]');
  for (const r of ['inkwell', 'quest', 'shields', 'twinArenas', 'keywordKit', 'growth', 'restore', 'songs', 'restrictions', 'conditions', 'prevention', 'banish', 'stadium']) {
    await page.click(`[data-recipe=${r}]`);
    ok(await page.isVisible('.mk-bugs.good'), `still builds after recipe ${r} (${await page.textContent('.mk-bugs')})`);
  }
  const nCards = async () => { await page.click('[data-station=cards]'); return page.$$eval('.mk-grid .card', (c) => c.length); };
  const cardsBefore = await nCards();
  await page.click('[data-station=shelf]');
  await page.click('[data-recipe=traps]');
  ok(await nCards() > cardsBefore, 'traps recipe adds a card');
  await page.click('[data-act=mk-undo]');
  ok(await nCards() === cardsBefore, 'undo removes it again');
  await page.setViewportSize({ width: 390, height: 844 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'Workshop on a phone: no sideways scroll');
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.click('text=← Projects');
  await page.click('text=← Library');

  // ---- Generation Wars (default module): a full AI match, then a remix in the Workshop
  ok(await page.isVisible('[data-module=generation-wars]'), 'Generation Wars in the library');
  await page.click('[data-module=generation-wars]');
  await page.click('[data-menu=play]');
  for (const i of [1, 2]) await page.click(`[data-seat="${i}"] .seg button:text-is("Random")`);
  await page.check('text=Fast AI');
  await page.click('text=Start match');
  await page.waitForSelector('.gameover', { timeout: 180000 });
  const gw = await page.evaluate(() => ({ r: window.__ucb.match.s.result, t: window.__ucb.match.s.turn.n }));
  console.log(`generation-wars: ${JSON.stringify(gw.r)} after ${gw.t} turns`);
  await page.click('.gameover >> text=Game menu');
  await page.click('[data-menu=remix]');
  ok(await page.isVisible('.mk-bugs.good'), `Generation Wars remix builds in the Workshop (${await page.textContent('.mk-bugs').catch(() => '')})`);
  await page.click('[data-station=cards]');
  ok(await page.$$eval('.mk-grid .card', (c) => c.length) >= 60, 'remix has all the cards');
  await page.click('text=← Projects');
  await page.click('text=← Library');

  // ---- Ringworld Rumble: in the library, its menu offers the Workshop
  ok(await page.isVisible('[data-module=ringworld-rumble]'), 'Ringworld Rumble in the library');
  await page.click('[data-module=ringworld-rumble]');
  ok(await page.isVisible('[data-menu=remix]'), 'Ringworld Rumble can be edited in the Workshop');
  await page.click('text=← Library');

  // ---- the published game, played like any module
  ok(await page.isVisible('[data-module=my-card-game]'), 'published game in the library');
  await page.click('[data-module=my-card-game]');
  await page.click('[data-menu=play]');
  for (const i of [1, 2]) await page.click(`[data-seat="${i}"] .seg button:text-is("Random")`);
  await page.check('text=Fast AI');
  await page.click('text=Start match');
  await page.waitForSelector('.gameover', { timeout: 120000 });
  const r = await page.evaluate(() => ({ r: window.__ucb.match.s.result, t: window.__ucb.match.s.turn.n }));
  console.log(`my-card-game: ${JSON.stringify(r.r)} after ${r.t} turns`);
  await page.click('.gameover >> text=Game menu');
  await page.click('[data-menu=decks]');
  ok(await page.isVisible('.screen'), 'deckbuilder opens');
  await page.click('text=← My Card Game').catch(() => page.goBack());
  await page.click('[data-menu=gallery]');
  ok(await page.$$eval('.card', (c) => c.length) >= 5, 'gallery shows the cards');
  await page.click('text=← My Card Game').catch(() => page.goBack());
  await page.click('[data-menu=play]');
  await page.click('[data-seat="2"] .seg button:text-is("AI")');
  await page.click('text=Start match');
  await page.waitForSelector('.hud-status.go', { timeout: 30000 });
  ok(await page.isVisible('.logdock'), 'log is docked beside the table');
  await page.click('[data-act=log]');
  ok(!(await page.isVisible('.logdock')), 'log can be hidden');
  await page.click('[data-act=log]');
  ok(await page.isVisible('.phase-strip li.on'), 'phase strip shows the current phase');
  const passText = await page.textContent('[data-act=pass]').catch(() => '');
  ok(/Next:|End turn|Continue|No response|Keep|Mulligan/.test(passText ?? '') || await page.isVisible('.dock .opt'), `pass button says what it does (${passText})`);
  const card = await page.$('.hand.mine .card');
  if (card) {
    let zoom = false; // the table may redraw under the pointer (AI beats), so hover again until the zoom shows
    for (let i = 0; i < 5 && !zoom; i++) { await page.mouse.move(0, 0); const c2 = await page.$('.hand.mine .card'); if (c2) await c2.hover().catch(() => {}); zoom = await page.waitForSelector('#hover-zoom', { timeout: 400 }).then(() => true, () => false); }
    ok(zoom, 'hovering a card zooms it');
  }
  await page.setViewportSize({ width: 834, height: 1194 });
  ok(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1), 'table on a tablet: no sideways scroll');
  await browser.close();
} finally {
  server.kill();
}
console.log(fail.length ? `FAIL\n${fail.join('\n')}` : 'e2e OK');
process.exitCode = fail.length ? 1 : 0;

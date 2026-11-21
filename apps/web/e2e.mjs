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
  page.on('dialog', (d) => d.accept());
  await page.goto(`http://localhost:${port}/`);
  const ids = await page.$$eval('[data-module]', (t) => t.map((x) => x.dataset.module));
  ok(ids.length === 8, `expected 8 game tiles, got ${ids.length}`);
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

  // Vault Breach: deploy onto the grid by clicking a cell, entry animation, external input control.
  await open('vault-breach');
  await page.click('[data-menu=play]');
  await seat(2, 'AI');
  await page.uncheck('text=Fast AI');
  await page.click('text=Start match');
  await page.waitForSelector('.hud-status.go');
  ok(await page.$$eval('.gridboard .cell', (c) => c.length) === 25, 'grid board has 25 cells');
  const deployable = await page.$('.seat-area.me .hand .card.legal:has(.type:text("Unit"))');
  if (deployable) {
    await deployable.click();
    ok(await page.$$eval('.gridboard .cell.target', (c) => c.length) === 5, 'five entry cells glow');
    await page.click('.gridboard .cell.target >> nth=2');
    await page.click('.dock >> text=Confirm');
    ok(await page.isVisible('.gridboard .cell[data-cell="2,0"] .card.own'), 'unit stands on its cell');
    ok(await page.$('.fx-enter') !== null, 'entry animation from the event log');
  } else fail.push('vault-breach: no deployable unit');
  await page.selectOption('select[aria-label="External input lights"]', 'off');
  ok(await page.evaluate(() => window.__ucb.match.s.ext.lights) === 'off', 'external input changed from the HUD');
  await page.click('button[aria-label=Menu]');
  await page.click('.panel-pop >> text=Quit to game menu');
  await page.click('text=← Library');

  // Bastion Clash: slotted zones render as named slots; deploying picks a slot on the table.
  await open('bastion-clash');
  await page.click('[data-menu=play]');
  await seat(2, 'AI');
  await page.click('text=Start match');
  await page.waitForSelector('.hud-status.go');
  ok(await page.$$eval('.seat-area.me .zone.slotted .slot', (s) => s.length) === 9, 'six field slots and three gear slots');
  const well = await page.$('.seat-area.me .hand .card.legal:has(.type:text("Well"))');
  if (well) { await well.click(); await page.waitForSelector('.hud-status.go'); }
  const unit = await page.$('.seat-area.me .hand .card.legal:has(.type:text("Unit"))');
  if (unit) {
    await unit.click();
    ok(await page.$$eval('.seat-area.me .slot.target', (c) => c.length) === 6, 'six open slots glow');
    await page.click('.seat-area.me .slot.target[data-slot="front-mid"]');
    await page.click('.dock >> text=Confirm');
    ok(await page.isVisible('.seat-area.me .slot[data-slot="front-mid"] .card.own'), 'unit stands in its slot');
  } else console.log('bastion-clash: no deployable unit on this seed');
  await page.click('button[aria-label=Menu]');
  await page.click('.panel-pop >> text=Quit to game menu');
  await page.click('text=← Library');

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
  ok(await page.isVisible('[data-menu=load]'), 'load game lists the manual save and the autosave');
  await page.click('[data-menu=load]');
  const slotNames = await page.$$eval('.slot-card strong', (s) => s.map((x) => x.textContent));
  ok(slotNames.length === 2 && slotNames.includes('⟳ Autosave'), `two slots, one autosave (${slotNames})`);
  await page.click('.slot-card >> nth=0 >> text=Load');
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
  // Builder quality of life: facet chips, query language, copy counters, export/import, sample hand.
  const shown = async () => page.$$eval('.pool .card', (c) => c.length);
  const all = await shown();
  await page.click('.facet:has-text("Spell")');
  const spells = await shown();
  ok(spells > 0 && spells < all, `type chip filters (${spells}/${all})`);
  await page.fill('.search', 't:unit k:guard cost<=2');
  ok(await shown() === 2, 'query: guard units costing 2 or less');
  await page.click('text=Clear');
  ok(await page.$$eval('.pool .copies.some', (c) => c.length) === 10, 'copy counters for cards in the deck');
  await page.click('.editor-head >> text=Export');
  const exportedText = await page.inputValue('.io-text');
  ok(exportedText.split('\n').length === 10 && /^2 /.test(exportedText), 'export lists 10 lines of "2 Name"');
  await page.click('.io >> text=Close');
  await page.click('.editor-head >> text=Import');
  await page.fill('.io-text', '20 Mend');
  await page.click('text=Replace deck');
  ok(await page.isVisible('text=20 copies of "mend" (max 2)'), 'imported deck is checked against the rules');
  await page.click('.editor-head >> text=Import');
  await page.fill('.io-text', exportedText);
  await page.click('text=Replace deck');
  ok(await page.isVisible('text=✓ Legal'), 'import restores the legal deck');
  await page.click('text=Sample hand');
  ok(await page.$$eval('.panel-pop .reveal .card', (c) => c.length) === 5, 'sample hand of 5');
  await page.click('.panel-pop >> text=Done');
  await page.click('text=← Spark Duel');
  await page.click('[data-menu=play]');
  ok((await page.$$eval('.deck-select option', (o) => o.map((x) => x.textContent))).includes('★ Test Deck'), 'custom deck offered in setup');

  // Gallery.
  await page.click('text=← Spark Duel');
  await page.click('[data-menu=gallery]');
  ok(await page.$$eval('.gallery .grid .card', (c) => c.length) === 22, 'gallery shows all cards');
  ok(await page.$$eval('.gallery .card[data-template=token]', (c) => c.length) === 3, 'tokens use the token template');
  await page.fill('.search', 'bolt');
  ok(await page.$$eval('.gallery .grid .card', (c) => c.length) === 1, 'gallery search filters');
  await page.click('.gallery .grid .card');
  ok(await page.isVisible('.enlarged'), 'card enlarges');
  ok(await page.isVisible('.enlarged >> text=Template: Spell'), 'template label shown');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
  await page.setInputFiles('[data-act=art] input', { name: 'art.png', mimeType: 'image/png', buffer: png });
  await page.waitForSelector('.enlarged .card .art img[src^="blob:"]');
  ok(await page.isVisible('.enlarged >> text=Reset art'), 'custom art applied');
  await page.click('.enlarged >> text=Reset art');
  await page.waitForSelector('.enlarged .card .art img[src^="data:image/svg"]');
  await page.keyboard.press('Escape');

  // Campaign: begin, intro dialogue, first encounter, play it out, rewards screen, shop purchase, campaign decks.
  await page.click('text=← Spark Duel');
  ok(await page.isVisible('[data-menu=campaign]') && await page.isVisible('[data-menu=shop]'), 'campaign and shop on the game menu');
  await page.click('[data-menu=campaign]');
  await page.click('text=Begin campaign');
  ok(await page.isVisible('.dialogue'), 'campaign intro dialogue');
  await page.click('.dialogue >> text=Skip');
  ok(await page.isDisabled('[data-node=raiders]'), 'second encounter locked');
  await page.click('[data-node=training]');
  await page.click('.dialogue >> text=Skip');
  await page.click('text=Fight!');
  await page.waitForSelector('.hud');
  await page.click('button[aria-label=Menu]');
  await page.check('.panel-pop >> text=Fast AI');
  await page.click('.panel-pop >> text=Resume');
  for (let i = 0; i < 400 && !(await page.isVisible('.gameover')); i++) {
    if (await page.isVisible('.dialogue >> text=Continue')) await page.click('.dialogue >> text=Continue');
    else if (await page.isVisible('.dock >> text=Confirm')) {
      const opt = await page.$('.dock .opt'); if (opt) await opt.click(); else await page.click('.target >> nth=0');
      await page.click('.dock >> text=Confirm').catch(() => {});
    } else if (await page.isVisible('button.pass')) await page.click('button.pass');
    else await page.waitForTimeout(30);
  }
  ok(await page.isVisible('.gameover'), 'campaign match ends');
  await page.click('.gameover >> text=Continue');
  ok(await page.isVisible('.reward .result'), 'reward screen');
  await page.click('text=Back to the map');
  await page.click('[data-camp=shop]');
  const before = await page.evaluate(() => window.__ucb.profile.currency);
  await page.click('[data-buy=ember-pack]');
  ok(await page.$$eval('.reveal .card', (c) => c.length) === 5, 'pack reveals 5 cards');
  await page.click('text=Collect');
  const after = await page.evaluate(() => window.__ucb.profile.currency);
  ok(after === before - 50, `currency deducted (${before} -> ${after})`);
  ok(await page.isVisible(`text=◆ ${after} Sparks`), 'currency shown');
  ok((after < 50) === (await page.isDisabled('[data-buy=ember-pack]')), 'pack affordable only with 50+');
  await page.click('text=← Spark Duel');
  await page.click('[data-menu=campaign]');
  await page.click('[data-camp=decks]');
  ok(await page.isVisible('text=Campaign decks') && await page.isVisible('text=✓ Legal'), 'campaign deck editor');

  // Phone width: library and table without horizontal scroll.
  await page.click('text=← The Ember Road');
  await page.click('text=← Spark Duel');
  await page.click('text=← Library');

  // Save export/import: download a backup, wipe storage, import it, campaign progress is back.
  const [dl] = await Promise.all([page.waitForEvent('download'), page.click('[data-act=export]')]);
  const backupPath = await dl.path();
  const exported = JSON.parse(await (await import('node:fs/promises')).readFile(backupPath, 'utf8'));
  ok(exported.kind === 'saves' && 'ucb-profile:spark-duel' in exported.entries && 'ucb-decks:spark-duel' in exported.entries, 'backup contains profile and decks');
  ok(await page.isVisible('[data-storage=indexeddb]'), 'saves live in IndexedDB');
  await page.evaluate(async () => { const s = window.__ucbStore; for (const k of s.keys()) s.del(k); await s.flush(); });
  await page.reload();
  await page.setInputFiles('[data-act=import] input', backupPath);
  await page.waitForSelector('text=Saves imported');
  await page.evaluate(() => window.__ucbStore.flush());
  await page.reload(); // imported saves survive a reload (written through to IndexedDB)
  await page.waitForSelector('[data-module="spark-duel"]');
  await page.click('[data-module="spark-duel"]');
  ok(await page.isVisible(`text=${exported.entries['ucb-profile:spark-duel'].currency} Sparks to spend`), 'imported campaign currency');
  await page.click('[data-menu=play]');
  ok((await page.$$eval('.deck-select option', (o) => o.map((x) => x.textContent))).includes('★ Test Deck'), 'imported custom deck');
  await page.click('text=← Spark Duel');
  await page.click('text=← Library');
  await page.setInputFiles('[data-act=import] input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{"__proto__": 1}') });
  await page.waitForSelector('text=Nothing imported');

  await page.setViewportSize({ width: 390, height: 844 });
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

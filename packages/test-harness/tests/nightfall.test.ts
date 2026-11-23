// NIGHTFALL (official module): core rules, each faction's signature mechanics, and every way to win.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import type { Match } from '#engine';
import { commitAction, createMatch, deckErrors, eventHash, invalidate, listActions, observe, proposeAction, replay, submitDecision } from '#engine';
import { randomAgent } from '#ai';
import { deckOpts, loadRef, playMatch } from '#harness';
import { place } from './helpers.ts';

const N = loadRef('nightfall');
const DK = { zombie: 'outbreak-at-site-9', cabal: 'the-marsh-whitcombe-trust', slasher: 'dont-go-in-there', harvest: 'the-barrow-wakes', devil: 'nine-moons' };
type F = keyof typeof DK;
const CITY = ['the-docks', 'the-subway', 'whispering-pines-campground', 'st-agnes-hospital', 'financial-district'];
/** A match past both mulligans (kept hands), p0 in its Night phase, with a fixed City (test fixture). */
function start(a: F, b: F, seed = 7): Match {
  let g = createMatch(N, deckOpts(N, [DK[a], DK[b]], seed));
  while (g.s.turn.active !== 0) g = createMatch(N, deckOpts(N, [DK[a], DK[b]], ++seed)); // first player is random: use a seed where seat 1 starts
  while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, []);
  g.s.zones['shared:city'].forEach((id, i) => { const o = g.s.objects[id]; o.card = CITY[o.vars.x]; o.vars.cit = (N.card.get(CITY[o.vars.x]) as any).population; void i; });
  invalidate(g.s);
  return g;
}
const dist = (g: Match, key: string) => g.s.zones['shared:city'].find((id) => (N.card.get(g.s.objects[id].card) as any).key === key)!;
const dx = (g: Match, key: string) => g.s.objects[dist(g, key)].vars.x;
/** Puts a card from p's deck or hand into play at district x (test fixture). */
function put(g: Match, p: string, card: string, x: number, zone = 'units', vars: Record<string, number> = {}) {
  const id = place(g, p, card, zone, { x, y: p === 'p0' ? 2 : 0, ...vars });
  invalidate(g.s);
  return id;
}
const act = (g: Match, p: string, action: string, source?: string | null, targets?: Record<string, string[]>) => commitAction(g, p, { action, source, targets });
const tpl = (g: Match, p: string, action: string, src?: string) => listActions(g, p).find((t) => t.action === action && (src === undefined || t.source === src));
const pass = (g: Match) => act(g, g.s.priority!, 'pass');
const settle = (g: Match, answer: (pd: NonNullable<Match['s']['pending']>) => string[] = (pd) => pd.options.slice(0, pd.min)) => { while (g.s.pending) g = submitDecision(g, g.s.pending.player, g.s.pending.id, answer(g.s.pending)); return g; };
const vars = (g: Match, p: string) => g.s.players[+p.slice(1)].vars;
const setVars = (g: Match, p: string, v: Record<string, number>) => { Object.assign(vars(g, p), v); invalidate(g.s); };

test('nightfall: setup deals a City of 5 districts, sets factions, Essence, resources and the Night Track', () => {
  const g = start('zombie', 'cabal');
  const city = g.s.zones['shared:city'].map((id) => g.s.objects[id]);
  assert.equal(city.length, 5);
  assert.deepEqual(city.map((d) => d.vars.x), [0, 1, 2, 3, 4]);
  for (const d of city) assert.equal(d.vars.cit, (N.card.get(d.card) as any).population);
  assert.deepEqual([vars(g, 'p0').faction, vars(g, 'p0').essence, vars(g, 'p0').biomass], [3, 18, 2], 'Zombie: 2 start, no Gather income (the Morgue pays instead)');
  assert.deepEqual([vars(g, 'p1').faction, vars(g, 'p1').essence, vars(g, 'p1').vitae], [1, 20, 4], 'Cabal: 3 start + 1 for going second');
  assert.equal(g.s.zones['p0:hand'].length, 6, 'first player skips the first draw');
  assert.equal(observe(g, 'p0').phase, 'night');
  assert.equal(g.s.vars.hour, 0);
});

test('nightfall: deck rules (one faction plus up to 10 neutral, Unique and Killer limits)', () => {
  for (const d of Object.values(DK)) assert.deepEqual(deckErrors(N, N.decks![d]), [], d);
  const z = structuredClone(N.decks![DK.zombie]) as Record<string, string[]>;
  z.deck[0] = 'velvet-rope-fledgling';
  assert.ok(deckErrors(N, z).includes("Every card must be neutral or from your Master's faction"));
  const n = structuredClone(N.decks![DK.zombie]) as Record<string, string[]>;
  n.deck.splice(0, 3, 'blackout', 'neighborhood-watch', 'neighborhood-watch');
  assert.ok(deckErrors(N, n).includes('At most 10 neutral cards'));
  const u = structuredClone(N.decks![DK.zombie]) as Record<string, string[]>;
  u.deck[0] = 'subject-12-lockjaw';
  assert.ok(deckErrors(N, u).some((e) => e.includes('copies of "Subject 12, \\"Lockjaw\\""') || e.includes('Lockjaw')));
});

test('nightfall: Prey opens the response step for the defender only; Intercept turns it into a Clash', () => {
  let g = start('zombie', 'devil');
  const x = dx(g, 'docks');
  const z = put(g, 'p0', 'hazmat-shambler', x);
  const dn = put(g, 'p1', 'hellhound', x);
  g = act(g, 'p0', 'prey', z);
  assert.equal(observe(g, 'p0').window?.step, 'respond');
  assert.equal(g.s.priority, 'p1', 'only the defender takes part');
  g = act(g, 'p1', 'intercept', dn);
  assert.equal(g.s.priority, 'p1', 'the defender may still respond, then passes');
  g = settle(pass(g));
  assert.equal(g.s.windows.length, 0);
  assert.equal(g.s.objects[dn].vars.dmg, 2, 'Hazmat Shambler hits for 2');
  assert.ok(!g.s.objects[z], 'Hellhound: 3 Menace +1 while Intercepting; Hazmat prevents 1 of the 4 and still dies');
  assert.ok(g.s.events.some((e) => e.type === 'dying' && e.u === z));
  assert.equal(g.s.objects[dist(g, 'docks')].vars.cit, 4, 'no Citizen was taken');
  assert.equal(g.s.priority, 'p0');
});

test('nightfall: without a possible response the hunt resolves at once; Infect makes a Shambler; Strike needs no ready enemy', () => {
  let g = start('zombie', 'slasher');
  const x = dx(g, 'docks');
  const z = put(g, 'p0', 'sprinter', x);
  g = act(g, 'p0', 'prey', z);
  assert.equal(g.s.priority, 'p0', 'nobody could respond: no extra pass');
  assert.equal(g.s.objects[dist(g, 'docks')].vars.cit, 3);
  assert.ok(g.s.zones['p0:units'].some((id) => g.s.objects[id].card === 'shambler' && g.s.objects[id].vars.x === x), 'Infect: the Citizen rises as a Shambler');
  assert.equal(vars(g, 'p0').trophies, 1);
  const z2 = put(g, 'p0', 'sprinter', x);
  const sh = put(g, 'p1', 'sheriff-dale-burke', x);
  assert.ok(!tpl(g, 'p0', 'strike', z2), 'a ready enemy blocks Strike');
  assert.ok(!tpl(g, 'p0', 'prey', z2), 'Guard blocks Prey');
  g.s.objects[sh].vars.ex = 1;
  invalidate(g.s);
  g = act(g, 'p0', 'strike', z2);
  assert.equal(vars(g, 'p1').essence, 14, 'Old Hollow 16 - 2: a Strike deals at most 2 (Sprinter has 3 Menace)');
});

test('nightfall: Toll — an empty district Falls to the most Dominion; three claims win', () => {
  let g = start('zombie', 'cabal');
  const keys = g.s.zones['shared:city'].map((id) => (N.card.get(g.s.objects[id].card) as any).key);
  for (const k of keys.slice(0, 3)) { g.s.objects[dist(g, k)].vars.cit = 0; put(g, 'p0', 'sprinter', dx(g, k)); }
  g = pass(g);
  g = settle(g);
  assert.equal(vars(g, 'p0').claims, 3);
  assert.deepEqual(g.s.result?.winners, ['p0']);
  assert.ok(observe(g, 'p1').zones['shared:city'].cards!.filter((d) => d.printed).length === 3, 'claimed districts flip to their Fallen side');
});

test('nightfall: Blood Cabal — Feed fills the pens, Thirst taxes Vampires, Domination claims a district with Citizens left', () => {
  let g = start('cabal', 'zombie');
  const x = dx(g, 'subway');
  const d = dist(g, 'subway');
  const v = put(g, 'p0', 'associate-of-the-firm', x);
  put(g, 'p0', 'councilman-doyle', x);
  const before = vars(g, 'p0').vitae;
  g = act(g, 'p0', 'prey', v);
  assert.deepEqual([vars(g, 'p0').thralls, vars(g, 'p0').vitae], [1, before + 3], 'Feed: a Thrall and 2 Vitae, +1 from the Associate');
  assert.equal(g.s.objects[d].vars.cit, 2);
  g = settle(pass(g));
  assert.equal(g.s.objects[d].vars.claim, 1, 'Influence 2 >= 2 Citizens: Dominated');
  assert.equal(vars(g, 'p0').thralls, 3);
  g = settle(pass(g));
  const fed = vars(g, 'p0').vitae;
  setVars(g, 'p0', { vitae: 0 });
  g = settle(pass(pass(g)));
  assert.ok(g.s.events.some((e) => e.type === 'frenzy'), 'unpaid Thirst: Frenzy');
  assert.ok(fed > 0);
});

test('nightfall: Fast Scheme — A Quiet Word cancels a card as it is played, and its owner draws', () => {
  let g = start('zombie', 'cabal');
  place(g, 'p1', 'a-quiet-word-with-the-mayor', 'hand');
  setVars(g, 'p1', { vitae: 9 });
  setVars(g, 'p0', { biomass: 9 });
  const ev = place(g, 'p0', 'containment-breach', 'hand');
  const hand = g.s.zones['p0:hand'].length;
  g = act(g, 'p0', 'cast', ev);
  assert.equal(g.s.priority, 'p1', 'the Cabal may respond to any card played');
  const qw = listActions(g, 'p1').find((t) => t.action === 'cast' && g.s.objects[t.source!].card === 'a-quiet-word-with-the-mayor')!;
  assert.ok(qw, 'A Quiet Word is offered');
  g = act(g, 'p1', 'cast', qw.source);
  g = settle(pass(g));
  assert.ok(g.s.events.some((e) => e.type === 'cancelled'));
  assert.equal(g.s.zones['p0:units'].length, 0, 'no Shamblers were created');
  assert.equal(g.s.zones['p0:hand'].length, hand, 'played one, drew one');
});

test('nightfall: Harvest Cult — the Wheel turns, Plantings ripen and Yield, the Old One awakens and Harvests', () => {
  let g = start('harvest', 'zombie');
  assert.equal(vars(g, 'p0').season, 1, 'first Rise: Sowing');
  const x = dx(g, 'docks');
  put(g, 'p0', 'scarecrow-sentinel', x);
  const pl = place(g, 'p0', 'blood-barley', 'field');
  g.s.objects[pl].slot = 'furrow-1';
  setVars(g, 'p0', { barrow: 6 }); // Awaken 6
  g = settle(pass(g)); g = settle(pass(g)); // to p0's Growing Rise: the Old One awakens at the Effigy
  assert.equal(vars(g, 'p0').season, 2);
  const oo = g.s.zones['p0:units'].find((id) => g.s.objects[id].card === 'he-who-wears-the-hill');
  assert.ok(oo, 'awakened');
  assert.equal(g.s.objects[oo!].vars.x, x);
  assert.equal(vars(g, 'p0').barrow, 0);
  const bounty = vars(g, 'p0').bounty;
  g = settle(pass(g)); g = settle(pass(g)); // Reaping: Blood Barley (Growth 3 >= Ripen 2) yields 3
  assert.equal(vars(g, 'p0').season, 3);
  assert.equal(vars(g, 'p0').bounty, bounty + 3 + 3, 'Gather 3 plus the Blood Barley Yield');
  g = settle(pass(g)); // Reaping Toll: Harvest
  assert.equal(g.s.objects[dist(g, 'docks')].vars.claim, 1, 'the Old One Harvests its district');
});

test('nightfall: Devil\'s Own — Omens advance Gestation only with a Vessel; the Child is born and wins at the next Rise', () => {
  let g = start('devil', 'zombie');
  const x = dx(g, 'docks');
  const om = place(g, 'p0', 'tithe-of-souls', 'omens');
  g.s.objects[om].slot = 'omen-1';
  setVars(g, 'p0', { souls: 6, gestation: 7 });
  g = act(g, 'p0', 'tithe', om);
  assert.equal(vars(g, 'p0').gestation, 7, 'no Vessel: Gestation does not move');
  const v = put(g, 'p0', 'margaret-wells', x);
  const om2 = place(g, 'p0', 'tithe-of-souls', 'omens');
  g.s.objects[om2].slot = 'omen-1';
  setVars(g, 'p1', { pacts: 2 });
  g = act(g, 'p0', 'tithe', om2);
  assert.equal(vars(g, 'p0').gestation, 9);
  const child = g.s.zones['p0:units'].find((id) => g.s.objects[id].card === 'the-child');
  assert.ok(child, 'the Nativity');
  assert.equal(g.s.objects[child!].vars.x, g.s.objects[v].vars.x);
  assert.equal(vars(g, 'p1').essence, 14, '18 - 2 per Pact');
  g = settle(pass(g)); g = settle(pass(g));
  assert.deepEqual(g.s.result?.winners, ['p0'], 'the Child survives to its owner\'s next Rise');
});

test('nightfall: Slashers — Lurkers are hidden, Investigate springs a Trap, Undying returns as a Sequel', () => {
  let g = start('slasher', 'cabal');
  const x = dx(g, 'docks');
  const trap = place(g, 'p0', 'bear-trap', 'hand');
  g = act(g, 'p0', 'lurk', trap, { $d: [dist(g, 'docks')] });
  const lurker = g.s.zones['p0:units'][0];
  assert.equal(observe(g, 'p1').zones['p0:units'].cards![0].card, '', 'the opponent sees only a face-down card');
  assert.ok(!tpl(g, 'p0', 'lurk'), 'one Lurker per turn');
  g = settle(pass(g));
  const det = put(g, 'p1', 'mr-kessler', x);
  g = act(g, 'p1', 'investigate', det, { $t: [lurker] });
  g = settle(g);
  assert.ok(g.s.events.some((e) => e.type === 'sprung'), 'Bear Trap springs');
  assert.equal(g.s.objects[det].vars.dmg, 3);
  g = settle(pass(g));
  const k = put(g, 'p0', 'the-hook-handed-man', x);
  const nb = put(g, 'p1', 'neighborhood-watch', x);
  g = act(g, 'p0', 'clash', k, { $t: [nb] });
  assert.equal(g.s.priority, 'p1', 'the Cabal may answer any Hunt with a Fast Scheme');
  g = settle(pass(g));
  assert.equal(vars(g, 'p0').bodycount, 2, 'a Mortal killed by a Killer is worth 2 Victims');
  assert.ok(g.s.zones['p0:dark'].length === 0);
  g.s.objects[k].vars.dmg = 9;
  g.s.dirty = true;
  g = settle(pass(g));
  assert.equal(g.s.zones['p0:dark'].length, 1, 'Undying: into The Dark');
  g = settle(pass(g)); g = settle(pass(g)); g = settle(pass(g)); // two of p0's Rises later it returns
  g = settle(g, (pd) => [pd.options[0]]);
  assert.ok(g.s.events.some((e) => e.type === 'sequel'));
  assert.equal(vars(g, 'p0').sqC, 1, '+1 Sequel badge');
});

test('nightfall: the Night Track advances after the second player\'s Toll and Dawn ends the game', () => {
  let g = start('zombie', 'cabal');
  g = settle(pass(g));
  assert.equal(g.s.vars.hour, 0);
  g = settle(pass(g));
  assert.equal(g.s.vars.hour, 1);
  g.s.vars.hour = 9;
  g = settle(pass(pass(g)), () => []);
  assert.ok(g.s.result, 'Dawn');
  assert.ok(g.s.events.some((e) => e.type === 'dawn'));
});

test('nightfall: whole games are deterministic and replayable', () => {
  const decks = [DK.devil, DK.slasher];
  const end = playMatch(createMatch(N, deckOpts(N, decks, 3)), decks.map((_, i) => randomAgent(40 + i)));
  assert.ok(end.s.result);
  assert.equal(replay(N, end.s.opts, end.s.cmds).hash, eventHash(end.s));
  assert.equal(proposeAction(end, 'p0', { action: 'pass' }).code, 'over');
});

test('nightfall: the first player is random; the second gets the extra resource and the hour turns after their Toll', () => {
  const firsts = new Set<number>();
  for (let seed = 1; seed <= 12; seed++) {
    let g = createMatch(N, deckOpts(N, [DK.zombie, DK.cabal], seed));
    g = settle(g);
    firsts.add(g.s.turn.active);
    const second = g.s.players[1 - g.s.turn.active];
    assert.equal(second.vars[second.id === 'p0' ? 'biomass' : 'vitae'], second.id === 'p0' ? 3 : 4, 'second player: +1 starting resource');
  }
  assert.deepEqual([...firsts].sort(), [0, 1]);
});

test('nightfall: an unpaid Thirst Frenzies the Vampire, and it must Hunt (Preying if it can)', () => {
  let g = start('cabal', 'zombie');
  const x = dx(g, 'docks');
  put(g, 'p0', 'associate-of-the-firm', x); // 3/3: survives the Frenzy wound (a 2/1 Fledgling would not)
  g = settle(pass(g)); g = settle(pass(g));
  assert.equal(vars(g, 'p0').thralls ?? 0, 0);
  setVars(g, 'p0', { vitae: 0 });
  g = settle(pass(g)); g = settle(pass(g)); // p0's Rise: Thirst unpaid, then the forced Prey
  assert.ok(g.s.events.some((e) => e.type === 'frenzy'));
  assert.equal(vars(g, 'p0').thralls, 1, 'the Frenzied Vampire Fed on its own');
});

test('nightfall: Guard holds a unit back only until that unit has Clashed with it', () => {
  let g = start('zombie', 'cabal');
  const x = dx(g, 'docks');
  const lj = put(g, 'p0', 'subject-12-lockjaw', x, 'units', { dmg: -40 });
  put(g, 'p1', 'mr-kessler', x, 'units', { plus: 20 });
  assert.ok(!tpl(g, 'p0', 'prey', lj), 'Guard');
  g = act(g, 'p0', 'clash', listActions(g, 'p0').find((t) => t.action === 'clash' && t.source === lj)!.source, { $t: [g.s.zones['p1:units'][0]] });
  g = settle(pass(g));
  assert.ok(tpl(g, 'p0', 'prey', lj), 'after Clashing the Guard, Relentless Lockjaw may Prey');
});

test('nightfall: Silver-Etched Revolver wounds can\'t be Mended; the Deep Tunnels work once per turn', () => {
  let g = start('cabal', 'zombie');
  const x = dx(g, 'docks');
  const v = put(g, 'p0', 'silas-whitmore', x);
  g = settle(pass(g));
  const sh = put(g, 'p1', 'sheriff-dale-burke', x);
  const gr = place(g, 'p1', 'blackout', 'gear');
  g.s.objects[gr].card = 'silver-etched-revolver';
  g.s.objects[gr].rel = { on: sh };
  invalidate(g.s);
  g = act(g, 'p1', 'clash', sh, { $t: [v] });
  g = settle(pass(g));
  assert.deepEqual([g.s.objects[v].vars.dmg, g.s.objects[v].vars.silver], [5, 5], 'Sheriff 3 + 2');
  g = settle(pass(g));
  setVars(g, 'p0', { vitae: 9 });
  assert.ok(!tpl(g, 'p0', 'mend', v), 'silver wounds cannot be Mended');

  let t = start('zombie', 'cabal');
  t.s.objects[dist(t, 'the-subway'.replace('the-', ''))].vars.claim = 1;
  const a = put(t, 'p0', 'sprinter', 0);
  const b = put(t, 'p0', 'hazmat-shambler', 0);
  const far = t.s.zones['shared:city'].find((id) => t.s.objects[id].vars.x === 3)!;
  invalidate(t.s);
  assert.ok(tpl(t, 'p0', 'move', a)!.slots[0].options.includes(far), 'any district through the Deep Tunnels');
  t = act(t, 'p0', 'move', a, { $d: [far] });
  assert.ok(!tpl(t, 'p0', 'move', b)!.slots[0].options.includes(far), 'once per turn');
});

test('nightfall: advanced play drafts the City from 3 Districts per player, alternating from the second player', () => {
  const z = { ...(N.decks![DK.zombie] as Record<string, string[]>), brought: ['old-town', 'the-docks', 'the-subway'] };
  const c = { ...(N.decks![DK.cabal] as Record<string, string[]>), brought: ['financial-district', 'maple-hollow-suburbs', 'holy-cross-cathedral'] };
  assert.deepEqual(deckErrors(N, z), []);
  assert.ok(deckErrors(N, { ...z, brought: ['old-town'] }).some((e) => e.startsWith('Advanced play')));
  let g = createMatch(N, { decks: [z, c], seed: 4 });
  const pickers: string[] = [];
  while (g.s.pending && g.s.pending.prompt.startsWith('Place')) { pickers.push(g.s.pending.player); g = submitDecision(g, g.s.pending.player, g.s.pending.id, [g.s.pending.options[0]]); }
  const second = `p${1 - g.s.turn.active}`;
  assert.deepEqual(pickers, [second, `p${g.s.turn.active}`, second, `p${g.s.turn.active}`], 'the fifth District is the one left');
  const placed = g.s.zones['shared:city'].map((id) => g.s.objects[id].card);
  assert.equal(placed.length, 5);
  assert.ok(placed.every((cid) => [...z.brought, ...c.brought].includes(cid)), 'only the brought Districts');
  assert.ok(g.s.events.some((e) => e.type === 'districtRemoved'));
});

test('nightfall: the Final Girl survives her first death, and a Killer she destroys is Ended', () => {
  let g = start('slasher', 'zombie');
  const x = dx(g, 'docks');
  const k = put(g, 'p0', 'the-groundskeeper', x);
  const fg = put(g, 'p1', 'sheriff-dale-burke', x);
  g.s.objects[fg].card = 'the-final-girl';
  g.s.objects[k].vars.dmg = 4;
  invalidate(g.s);
  g = act(g, 'p0', 'clash', k, { $t: [fg] });
  g = settle(g);
  assert.ok(g.s.objects[fg], 'she survives her first death');
  assert.equal(g.s.objects[fg].vars.saved, 1);
  assert.equal(g.s.zones['p0:removed'].length, 1, 'the Killer is Ended, not sent to The Dark');
  assert.equal(g.s.zones['p0:dark'].length, 0);
});

test('nightfall store: claim exactly one promo starter, earn Marks from AI battles (win or lose), buy Blood Dawn boosters', async () => {
  const { buy, campaignOf, finishEncounter, itemBlocked, newProfile, nodeState, openBooster, startEncounter, validateCampaign } = await import('#campaign');
  const c = campaignOf(N)!;
  assert.deepEqual(validateCampaign(N, c), []);
  let p = newProfile(N, c, 99);
  assert.deepEqual([p.currency, Object.keys(p.decks).length], [0, 0], 'you start with nothing but the right to one free deck');
  const promos = c.shop!.filter((x) => x.group === 'starter-promo');
  assert.deepEqual(promos.map((x) => x.deck), ['outbreak-at-site-9', 'the-marsh-whitcombe-trust', 'dont-go-in-there', 'the-barrow-wakes'], 'the first four starters');
  assert.ok(promos.every((x) => itemBlocked(c, p, x) === null && x.price === 0));
  p = buy(c, p, 'promo-dont-go-in-there', N).profile;
  assert.deepEqual(Object.keys(p.decks), ["Don't Go in There"]);
  assert.equal(Object.values(p.collection).reduce((a, n) => a + n, 0), 41, '40 cards and the Master');
  assert.equal(itemBlocked(c, p, promos[0]), "You chose Don't Go in There");
  assert.equal(itemBlocked(c, p, promos[2]), 'Claimed');
  assert.throws(() => buy(c, p, 'promo-site-9', N), /You chose/);
  assert.equal(nodeState(c, p, 'zombie-witching'), 'locked', 'the Witching Hour rivals need a Dusk win first');

  const s1 = startEncounter(N, c, p, 'zombie-dusk', "Don't Go in There", 5);
  p = finishEncounter(c, s1.profile, 'zombie-dusk', s1.profile.active!.seq, { winners: ['p1'], reason: 'ruin' }).profile;
  assert.equal(p.currency, 20, 'a loss still pays');
  const s2 = startEncounter(N, c, p, 'zombie-dusk', "Don't Go in There", 6);
  const won = finishEncounter(c, s2.profile, 'zombie-dusk', s2.profile.active!.seq, { winners: ['p0'], reason: 'city' });
  p = won.profile;
  assert.equal(p.currency, 170);
  assert.equal(won.granted!.packs[0].cards.length, 10, 'first win: a Blood Dawn booster');
  assert.equal(nodeState(c, p, 'zombie-witching'), 'open');
  const before = Object.values(p.collection).reduce((a, n) => a + n, 0);
  p = buy(c, p, 'blood-dawn-pack', N).profile;
  assert.equal(p.currency, 70);
  assert.equal(Object.values(p.collection).reduce((a, n) => a + n, 0), before + 10);
  const pack = openBooster(c, 'blood-dawn', [1, 2, 3, 4]);
  const rar = pack.map((id) => (N.card.get(id) as any).rarity);
  assert.deepEqual([rar.slice(0, 6).every((r) => r === 'C'), rar.slice(6, 9).every((r) => r === 'U'), ['R', 'L'].includes(rar[9])], [true, true, true], '6 common, 3 uncommon, 1 rare or Legendary');
});

test('nightfall balance: Shamblers are mindless (no Prey, no Strike), Spread infects one district, Domination needs a Vampire', () => {
  let g = start('zombie', 'cabal');
  /** A Shambler token at district x (a spare deck card turned into the token: test fixture). */
  const shambler = (at: number) => {
    const id = g.s.zones['p0:deck'].pop()!;
    Object.assign(g.s.objects[id], { card: 'shambler', zone: 'p0:units' });
    g.s.zones['p0:units'].push(id);
    Object.assign(g.s.objects[id].vars, { x: at, y: 2 });
    invalidate(g.s);
    return id;
  };
  const x = dx(g, 'docks');
  const sh = shambler(x);
  g.s.objects[sh].vars.fresh = 0;
  invalidate(g.s);
  assert.equal(tpl(g, 'p0', 'prey', sh), undefined, 'a Shambler cannot Prey');
  assert.equal(tpl(g, 'p0', 'strike', sh), undefined, 'a Shambler cannot Strike');
  // Spread: 3 Zombies in two districts, but only one district is infected at the Rise
  const [a, b] = [dx(g, 'subway'), dx(g, 'hospital')];
  for (const at of [a, a, a, b, b, b]) shambler(at);
  const cit = (k: string) => g.s.objects[dist(g, k)].vars.cit;
  const before = cit('subway') + cit('hospital');
  g = settle(pass(g)); g = settle(pass(g)); // p1's turn, then back to p0's Rise
  assert.equal(cit('subway') + cit('hospital'), before - 1, 'Spread infects once per Rise');
  // Domination: Influence alone is not enough without a Vampire in the district
  let c = start('cabal', 'zombie');
  const z = dx(c, 'subway');
  put(c, 'p0', 'councilman-doyle', z);
  put(c, 'p0', 'blood-bank-holdings', z, 'units');
  c.s.objects[dist(c, 'subway')].vars.cit = 2;
  c = settle(pass(c));
  assert.equal(c.s.objects[dist(c, 'subway')].vars.claim, 0, 'no Vampire: no Domination');
  put(c, 'p0', 'associate-of-the-firm', z);
  c = settle(pass(c)); c = settle(pass(c));
  assert.equal(c.s.objects[dist(c, 'subway')].vars.claim, 1, 'with a Vampire there: Dominated');
});

test('nightfall balance: Devil Gestation starts at 0 and rises at each Rise with a Vessel; Augustin finds a Vessel for 2 Sin', () => {
  let g = start('devil', 'zombie');
  assert.equal(vars(g, 'p0').gestation ?? 0, 0);
  put(g, 'p0', 'margaret-wells', dx(g, 'docks'));
  g = settle(pass(g)); g = settle(pass(g));
  assert.ok(vars(g, 'p0').gestation >= 2, 'Gestation rose at the Rise with a Vessel');
  const gift = listActions(g, 'p0').find((t) => t.action === 'darkGift');
  assert.ok(gift, 'Dark Gift available');
  const sin = vars(g, 'p0').sin;
  g = settle(act(g, 'p0', 'darkGift', gift!.source));
  assert.equal(vars(g, 'p0').sin, sin - 2);
});

test('nightfall balance: the Final Act (Body Count 11) empowers the Slashers instead of winning', () => {
  let g = start('slasher', 'zombie');
  const x = dx(g, 'docks');
  const k = put(g, 'p0', 'the-groundskeeper', x);
  const hook = put(g, 'p0', 'the-hook-handed-man', dx(g, 'financial'));
  setVars(g, 'p0', { bodycount: 9 });
  g = settle(act(g, 'p0', 'prey', k)); // a Slay is worth 2 Victims
  if (g.s.priority === 'p1') g = settle(pass(g));
  assert.equal(vars(g, 'p0').bodycount, 11);
  assert.equal(g.s.result, null, 'no instant win');
  assert.equal(vars(g, 'p0').finalAct, 1);
  assert.ok(g.s.events.some((e) => e.type === 'finalAct'));
  const before = vars(g, 'p1').essence;
  g = settle(act(g, 'p0', 'strike', hook));
  if (g.s.priority === 'p1') g = settle(pass(g));
  const menace = (N.card.get('the-hook-handed-man') as any).menace;
  assert.equal(vars(g, 'p1').essence, before - (menace + 2), 'a Killer Strikes for its full, boosted Menace');
  const bc = vars(g, 'p0').bodycount;
  g = settle(pass(g)); // Toll: each face-up Killer Slays a Citizen in its district
  assert.equal(vars(g, 'p0').bodycount, bc + 4, 'two face-up Killers, 2 Victims each');
});


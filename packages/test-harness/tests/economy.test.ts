// Workshop shop & campaign: compiled into module campaign data and run through the campaign runtime.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { compileModule } from '#engine';
import { balance, buy, finishEncounter, hasEncounters, itemBlocked, newProfile, nodeState, priceOf, startEncounter, validateCampaign, migrateProfile, type Campaign } from '#campaign';
import { build, compileBlueprint, fromBlueprint, starterEconomy } from '#maker';

const game = (tweak?: (bp: ReturnType<typeof fromBlueprint>) => void) => {
  const bp = fromBlueprint('blank');
  bp.decks.push({ ...structuredClone(bp.decks[0]), id: 'second', name: 'Second Deck' });
  bp.cards.forEach((k, i) => { k.rarity = (['common', 'common', 'uncommon', 'rare'] as const)[i % 4]; });
  bp.economy = starterEconomy(bp);
  tweak?.(bp);
  const def = compileBlueprint(bp) as any;
  return { bp, def, mod: compileModule(def), c: def.campaign as Campaign };
};

test('economy: neither part enabled means no campaign data; the starter economy validates and builds', () => {
  const bp = fromBlueprint('blank');
  assert.equal((compileBlueprint(bp) as any).campaign, undefined);
  bp.economy = starterEconomy(bp); bp.economy.shop!.enabled = false; bp.economy.campaign!.enabled = false;
  assert.equal((compileBlueprint(bp) as any).campaign, undefined);
  const { bp: b2, mod, c } = game();
  assert.deepEqual(validateCampaign(mod, c), []);
  assert.ok(build(b2).mod, build(b2).problems.map((p) => p.text).join('; '));
  assert.equal(c.currencies!.length, 2);
  assert.deepEqual(c.chapters.map((ch) => ch.nodes), [['rookie', 'rival'], ['champion']], 'tiers become chapters');
});

test('economy: pick-one free starters, a free first pack then a price, a locked deck and a second currency', () => {
  const { mod, c } = game();
  let p = newProfile(mod, c, 7);
  assert.equal(balance(c, p, 'gold'), 100);
  assert.equal(balance(c, p, 'gems'), 0);
  p = buy(c, p, 'starter-1', mod).profile;
  assert.ok(Object.keys(p.decks).length === 1 && itemBlocked(c, p, c.shop!.find((i) => i.id === 'starter-2')!)?.startsWith('You chose'), 'choosing one starter rules out the others');
  const pack = c.shop!.find((i) => i.id === 'pack')!;
  assert.equal(priceOf(pack, p), 0, 'first pack is free');
  p = buy(c, p, 'pack', mod).profile;
  assert.equal(priceOf(pack, p), 50);
  p = buy(c, p, 'pack', mod).profile; // packs can be bought again and again
  assert.equal(balance(c, p, 'gold'), 50);
  assert.match(itemBlocked(c, p, c.shop!.find((i) => i.id === 'champ-deck')!)!, /Win Title Match first/);
  assert.match(itemBlocked(c, p, c.shop!.find((i) => i.id === 'gem-pack')!)!, /Needs 1 Gems/);
});

test('economy: battles are gated, pay rewards in each currency on a win, a smaller repeat reward, and a loss reward', () => {
  const { mod, c } = game();
  let p = buy(c, newProfile(mod, c, 3), 'starter-1', mod).profile;
  const deck = Object.keys(p.decks)[0];
  assert.equal(nodeState(c, p, 'champion'), 'locked');
  assert.ok(hasEncounters(c));
  const fight = (id: string, win: boolean) => { const s = startEncounter(mod, c, p, id, deck, 1); p = finishEncounter(c, s.profile, id, s.profile.active!.seq, { winners: [win ? 'p0' : 'p1'], reason: 'test' } as any).profile; };
  fight('rookie', false);
  assert.equal(balance(c, p, 'gold'), 105, 'loss reward');
  fight('rookie', true);
  assert.equal(balance(c, p, 'gold'), 165); assert.equal(balance(c, p, 'gems'), 1);
  fight('rookie', true);
  assert.equal(balance(c, p, 'gold'), 180, 'repeat reward');
  fight('rival', true);
  assert.equal(nodeState(c, p, 'champion'), 'open', 'tier 2 opens after both tier-1 wins');
  fight('champion', true);
  assert.equal(itemBlocked(c, p, c.shop!.find((i) => i.id === 'champ-deck')!), null, 'the locked deck is for sale after the win');
  assert.equal(c.encounters.champion.ai?.kind, 'planner');
  assert.equal(c.encounters.rookie.intro?.[0].speaker, 'The Trainee');
  assert.ok(c.encounters.rookie.outro?.length && c.encounters.rookie.defeat?.length, 'after-battle lines for a win and a loss');
});

test('economy: a shop-only game has no battles; old single-currency profiles migrate', () => {
  const { mod, c } = game((bp) => { bp.economy!.campaign!.enabled = false; });
  assert.ok(!hasEncounters(c) && c.shop!.length > 0);
  assert.deepEqual(validateCampaign(mod, c), []);
  const old = migrateProfile({ v: 1, module: 'x', currency: 40, collection: {}, decks: {}, wins: {}, bought: {}, ledger: [], seq: 0, seed: 1, active: null });
  assert.equal(old.v, 2); assert.equal(old.currency, 40);
});

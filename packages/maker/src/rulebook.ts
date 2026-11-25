// Writes a plain-language rulebook from a blueprint: what a player needs to know to play the game.
import type { Blueprint } from './blueprint.ts';
import { KEYWORD_RULES, ROLES, normalize } from './blueprint.ts';
import { context } from './compile.ts';

export interface RuleSection { title: string; items: string[] }

export function rulebook(bp0: Blueprint): RuleSection[] {
  const bp = normalize(structuredClone(bp0));
  const x = context(bp);
  const { c, r } = x;
  const stat = (id: string | null | undefined) => bp.stats.find((s) => s.id === id)?.name ?? id ?? '';
  const zone = (id: string, d: string) => bp.zoneNames[id] ?? d;
  const out: RuleSection[] = [];

  const win: string[] = [];
  if (bp.win.life) win.push(`Each player starts with ${bp.win.life} life. Reduce your opponent to 0 to win.`);
  if (x.lifeCards) win.push(`Each player has ${bp.win.lifeCards || 'their leader\'s Life in'} face-down life cards. Each hit puts one into its owner's hand; a hit when none are left wins the game.${bp.win.lifeTriggers ? ' Cards with a trigger may be used for free when they are taken.' : ''}`);
  if (x.prizes) win.push(`Set aside ${bp.win.prizes} prize cards. Each time an enemy unit is destroyed, take one into your hand. Take your last prize to win.`);
  if (x.points) win.push(`Score points${c.quest ? ` by questing (exhaust a unit to score its ${stat(c.quest)})` : ''}${c.mode === 'lanes' ? ' by conquering and holding battlefields' : ''}. The first to ${bp.win.points || (c.mode === 'lanes' ? 8 : 20)} wins.`);
  if (bp.win.noUnits) win.push('A player with no units in play loses.');
  if (bp.win.deckOut) win.push('A player who has to draw from an empty deck loses.');
  out.push({ title: 'How to win', items: win });

  const setup = [`Decks have ${bp.setup.deckMin === bp.setup.deckMax ? bp.setup.deckMin : `${bp.setup.deckMin}-${bp.setup.deckMax}`} cards, at most ${bp.setup.maxCopies} copies of each.`,
    `Shuffle and draw ${bp.setup.hand} cards${bp.setup.mulligan ? '; you may mulligan once' : ''}. A random player goes first${bp.setup.skipFirstDraw ? ' and skips their first draw' : ''}.`];
  if (x.leader) setup.push('Each deck has a leader, which starts in play.');
  if (r.mode === 'deck') setup.push(`Each player also has a ${r.deckSize}-card ${r.name} deck.`);
  if (x.hasRole('extra')) setup.push('Extra-deck units wait in a separate extra deck.');
  if (c.mode === 'duel') setup.push('Each player puts a unit from hand into the active spot.');
  out.push({ title: 'Setup', items: setup });

  const turn = bp.turn.map((p) => {
    const who = p.each ? 'each player' : 'you';
    switch (p.kind) {
      case 'ready': return `${p.name}: ${who} ready (untap) your cards.${(r.actions ?? 0) > 0 ? ` You get ${r.actions} action point.` : ''}`;
      case 'draw': return `${p.name}: ${who} ${p.drawTo ? `draw up to ${p.drawTo} cards` : `draw ${p.n ?? 1} card${(p.n ?? 1) > 1 ? 's' : ''}`}.`;
      case 'resource': return `${p.name}: gain your ${r.name} for the turn.`;
      case 'main': return `${p.name}: play cards, use abilities${c.mode !== 'none' && !x.combatP.length ? ' and attack' : ''}.${p.alternate ? ' Both players act, one action at a time; when both pass in a row the phase ends.' : ''}`;
      case 'combat': return `${p.name}: attack with your units.`;
      case 'end': return `${p.name}: end-of-turn effects${c.damage === 'heal' && c.health ? '; damage on units heals' : ''}; discard down to ${bp.setup.handLimit}.`;
      default: return `${p.name}: a custom step.`;
    }
  });
  out.push({ title: 'A turn', items: turn });

  const res: string[] = [];
  switch (r.mode) {
    case 'ramp': res.push(`Your ${r.name} starts at ${r.start} and grows by ${r.perTurn} each turn (up to ${r.max}); it refills every turn.`); break;
    case 'cards': res.push(`Once per turn, play a resource card from your hand. Each one makes 1 ${r.name}${bp.colors.length ? ' of its color' : ''} every turn.`); break;
    case 'anycard': res.push(`Once per turn, put ${r.onlyKeyword ? `a card with ${bp.keywords.find((k) => k.id === r.onlyKeyword)?.name ?? r.onlyKeyword}` : 'any card'} from your hand into your ${zone('resources', r.name)}${r.faceDown ? ' face down' : ''}. Each makes 1 ${r.name} every turn.`); break;
    case 'deck': res.push(`Each turn, put the top ${r.perTurn} cards of your ${r.name} deck into play (${r.start} on the first player's first turn).`); break;
    case 'attach': res.push(`Once per turn, attach a ${r.name} card from your hand to one of your units. Attacks need ${r.name} attached.`); break;
    case 'pitch': res.push(`Pay costs by pitching cards from your hand: each is worth its ${stat(r.pitchStat ?? 'pitch')}. Pitched cards go to the bottom of your deck at the end of the turn.`); break;
    case 'none': res.push('Cards have no cost.'); break;
  }
  if (r.summonsPerTurn) res.push(`You may summon ${r.summonsPerTurn} unit${r.summonsPerTurn > 1 ? 's' : ''} per turn.`);
  for (const t of r.tribute) res.push(`Units of ${stat('level')} ${t.level}+ need ${t.n} tribute${t.n > 1 ? 's' : ''} (your units sent to the discard pile).`);
  if (r.levelGate) res.push(`A card's ${stat(r.levelGate)} can't be higher than the ${r.name} you have in play.`);
  if (r.need) res.push(`A card needs your units' total ${stat(r.need.gen)} to be at least its ${stat(r.need.stat)} (nothing is spent).`);
  if ((r.actions ?? 0) > 0) res.push(`Each non-quick card costs an action point. Go again gives it back.`);
  if (r.boost) res.push(`Spend 1 ${r.name} to give a unit +${r.boost} ${stat(c.power)} until end of turn.`);
  out.push({ title: 'Resources', items: res });

  const fight: string[] = [];
  switch (c.mode) {
    case 'block': fight.push(`Attacking exhausts a unit. The defender may block with up to ${c.maxBlockers} ready unit${(c.maxBlockers ?? 1) > 1 ? 's' : ''}; unblocked attackers hit the player.`); break;
    case 'target': fight.push(`Attack ${c.targetUnits === 'none' ? 'the opponent' : `${c.targetUnits === 'exhausted' ? 'an exhausted enemy unit' : 'an enemy unit'}${c.direct === 'never' ? '' : ' or the opponent'}`}${c.direct === 'ifEmpty' ? ' (directly only when they have no units)' : ''}${c.sameArena ? '; units only fight units in their own arena' : ''}.`); break;
    case 'duel': fight.push('Your active unit uses one of its printed attacks against the opposing active unit. When an active unit is defeated, its owner promotes one from the bench.'); break;
    case 'lanes': fight.push('Move units onto battlefields. When both players have units there, each side deals its total power. Conquer an empty or cleared battlefield for 1 point and hold it for 1 more each turn.'); break;
    case 'cards': fight.push(`Play attack cards to attack with their ${stat(c.power)}. The defender may block with cards from hand (their ${stat(c.blockStat ?? 'defense')}); the rest hits.`); break;
    case 'none': fight.push('There is no combat.'); break;
  }
  if (c.mode === 'block' || c.mode === 'target') {
    fight.push(c.health ? `Units deal damage equal to their ${stat(c.power)}; a unit with damage equal to its ${stat(c.health)} is destroyed.${c.damage === 'heal' ? ' Damage heals at end of turn.' : ''}`
      : `The higher ${stat(c.power)} wins a battle${c.compare.loser ? ' and the loser is destroyed' : ''}${c.compare.ties === 'both' ? '; ties destroy both' : c.compare.ties === 'defender' ? '; ties go to the attacker' : ''}.`);
    if (c.sickness) fight.push('Units can\'t attack the turn they are played.');
    if (c.counterStep) fight.push('When attacked, the defender may discard cards from hand for their Counter value.');
    if (c.positions) fight.push('Units can be set face down in defense position.');
  }
  if (c.quest) fight.push(`Instead of attacking, a unit can quest: exhaust it to score its ${stat(c.quest)}.`);
  if (c.arenas?.length) fight.push(`The board has ${c.arenas.map((a) => `${a.name}${a.attack ? '' : ' (can\'t attack)'}`).join(' and ')}.`);
  out.push({ title: 'Combat', items: fight });

  out.push({ title: 'Card types', items: bp.types.map((t) => `${t.name}: ${ROLES[t.role].hint}`) });
  if (bp.keywords.length) out.push({ title: 'Keywords', items: bp.keywords.map((k) => `${k.name}${k.valued ? ' N' : ''}: ${k.text || KEYWORD_RULES[k.rule].text || 'see the card.'}`) });
  if (bp.counters?.length) out.push({ title: 'Counters', items: bp.counters.map((k) => `${k.name}${k.adds ? `: each gives ${Object.entries(k.adds).map(([s, n]) => `${n >= 0 ? '+' : ''}${n} ${stat(s)}`).join(', ')}` : ''}.`) });
  out.push({ title: 'Timing', items: [bp.timing === 'stack' ? 'Players may respond with quick cards; the last card played resolves first.' : bp.timing === 'chain' ? 'Players add responses to a chain in turn; it resolves from the last link back.' : 'Only the active player acts, except for quick cards and traps during battles.'] });
  return out.filter((s) => s.items.length);
}

export function rulebookMarkdown(bp: Blueprint): string {
  return [`# ${bp.name}`, bp.tagline ? `*${bp.tagline}*` : '', ...rulebook(bp).flatMap((s) => [`\n## ${s.title}`, ...s.items.map((i) => `- ${i}`)])].filter((l) => l !== '').join('\n');
}

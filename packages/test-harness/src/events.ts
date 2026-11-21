// Usage: npm run -s events <module-id> <event-type-prefix>... (counts events over 50 random games; actions as action:<name>)
import { randomAgent } from '#ai';
import { createMatch } from '#engine';
import { defaultDecks, deckOpts, loadRef, playMatch } from '#harness';
const [id, ...types] = process.argv.slice(2);
const m = loadRef(id); const t: Record<string, number> = {};
for (let g = 1; g <= 50; g++) {
  const d = defaultDecks(m);
  const e = playMatch(createMatch(m, deckOpts(m, d, g)), d.map((_, i) => randomAgent(g * 9 + i)));
  for (const ev of e.s.events) { const k = ev.type === 'action' ? `action:${ev.action}` : ev.type; if (types.some((x) => k.startsWith(x))) t[k] = (t[k] ?? 0) + 1; }
}
console.log(id, JSON.stringify(t));

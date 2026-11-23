// Shadow Earth faction fingerprint: how each faction plays (attributes, targets, Doctrine uses, signature events). Copy to packages/test-harness/tests/_sefp.ts to run.
import { writeFileSync } from 'node:fs';
import { createMatch } from '#engine';
import { makeAgent } from '#ai';
import { deckOpts, loadRef, playMatch } from '#harness';
const args = process.argv.slice(2);
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const N = +flag('games', '1'); const [PI, PN] = flag('part', '1/1').split('/').map(Number); const SEED0 = +flag('seed0', '0');
const M = loadRef('shadow-earth'); const D = Object.keys(M.decks!); const F = (d: string) => d.replace('-starter', '');
const st: Record<string, Record<string, number>> = {}; const inc = (f: string, k: string, n = 1) => { st[f] ??= {}; st[f][k] = (st[f][k] ?? 0) + n; };
const types = new Set<string>(); let pair = 0;
for (const a of D) for (const b of D) {
  if (a === b || pair++ % PN !== PI - 1) continue;
  for (let s = SEED0 + 1; s <= SEED0 + N; s++) {
    const g = playMatch(createMatch(M, deckOpts(M, [a, b], s)), [makeAgent('heuristic', s * 7), makeAgent('heuristic', s * 7 + 1)]);
    const fac = (p: any) => (p == null ? '' : F([a, b][+String(p).slice(1)]));
    for (const i of [0, 1]) { inc(F([a, b][i]), 'games'); inc(F([a, b][i]), 'turns', g.s.turn.n); if (g.s.result?.winners[0] === `p${i}`) inc(F([a, b][i]), 'wins'); inc(F([a, b][i]), 'domEnd', g.s.players[i].vars.dom ?? 0); }
    for (const e of g.s.events as any[]) {
      types.add(e.type);
      const f = fac(e.p);
      if (e.type === 'missionResult') { inc(f, 'mis'); inc(f, `attr${e.attr}`); inc(f, `k.${e.kind}`); inc(f, 'misOk', e.ok); }
      else if (e.type === 'played') { inc(f, `t.${e.type_ ?? e.type}`); inc(f, `ty.${e.type}`); inc(f, `c.${e.card}`); inc(f, `ty2.${(e as any)['type']}`); }
      else if (e.type === 'agendaScored') inc(f, 'domAg');
      else if (e.type === 'planEnacted') inc(f, 'domPlan');
      else if (e.type === 'eliminated') { inc(fac(e.ctrl), 'lost'); inc(fac(e.ctrl) ? (fac(e.ctrl) === F(a) ? F(b) : F(a)) : '', 'killed'); }
      else if (['sacrificed', 'control', 'revelation', 'attached', 'sabotaged', 'progressLost', 'peeked', 'bloodshed', 'scried', 'tmpGained'].includes(e.type)) inc(f || fac(e.owner), e.type, e.n && e.type !== 'tmpGained' ? e.n : 1);
      if (e.type === 'created') inc(fac(e.toPlayer), 'tokens');
      if (e.type === 'action' && /^(useR|use)/.test(e.action)) inc(fac(e.player), `u.${e.card}`);
      if (e.type === 'action' && e.action === 'respond') inc(fac(e.player), 'responses');
    }
  }
}
writeFileSync(flag('json', '/dev/null'), JSON.stringify({ st, types: [...types] }));

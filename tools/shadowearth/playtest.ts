// Shadow Earth playtest analytics: AI-vs-AI games across every faction pairing.
//   cp tools/shadowearth/playtest.ts packages/test-harness/tests/_sept.ts && node packages/test-harness/tests/_sept.ts [--games=1] [--agents=heuristic]
import { writeFileSync } from 'node:fs';
import { compileModule, createMatch } from '#engine';
import { makeAgent } from '#ai';
import { deckOpts, loadRef, playMatch, readModuleDir } from '#harness';
const args = process.argv.slice(2);
const flag = (k: string, d: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1] ?? d;
const N = +flag('games', '1');
const [PI, PN] = flag('part', '1/1').split('/').map(Number);
const JSONOUT = flag('json', '');
const SEED0 = +flag('seed0', '0');
const kind = flag('agents', 'heuristic') as any;
const M = process.env.SE_OUT ? compileModule(readModuleDir(process.env.SE_OUT)) : loadRef('shadow-earth');
const D = Object.keys(M.decks!);
const F = (d: string) => d.replace('-starter', '');
const wins: Record<string, [number, number]> = {};
const how: Record<string, number> = {};
let turns = 0, games = 0, missions = 0, ok = 0, agendas = 0, domLoser = 0, pairIdx = 0;
const st: Record<string, number> = {};
const inc = (k: string, n = 1) => (st[k] = (st[k] ?? 0) + n);
const lines: string[] = [];
for (const a of D) for (const b of D) {
  if (a === b) continue;
  if (pairIdx++ % PN !== PI - 1) continue;
  for (let s = SEED0 + 1; s <= SEED0 + N; s++) {
    const g = playMatch(createMatch(M, deckOpts(M, [a, b], s)), [makeAgent(kind, s * 7), makeAgent(kind, s * 7 + 1)]);
    const r = g.s.result!;
    const w = r.winners[0];
    const doms = g.s.players.map((p: any) => p.vars.dom ?? 0);
    const end = r.reason === 'turnLimit' ? 'turnLimit' : doms.some((d: number) => d >= 20) ? 'dominance' : 'deck-out';
    how[end] = (how[end] ?? 0) + 1;
    for (const [i, d] of [a, b].entries()) { wins[F(d)] ??= [0, 0]; wins[F(d)][1]++; if (w === `p${i}`) wins[F(d)][0]++; }
    turns += g.s.turn.n; games++;
    let inMission = false;
    for (const e of g.s.events as any[]) {
      if (e.type === 'missionDeclared') inMission = true;
      if (e.type === 'missionResult') {
        missions++; ok += e.ok; inMission = false;
        const k = ['', 'strike', 'infiltrate', 'subvert', 'op', 'investigate', 'disrupt'][e.kind];
        inc(`m.${k}`); inc(`m.${k}.ok`, e.ok);
        inc(e.ndef > 0 ? 'def' : 'undef'); inc(e.ndef > 0 ? 'def.ok' : 'undef.ok', e.ok);
        inc('atkTotal', e.at); inc('defTotal', e.dt);
        const fa = F([a, b][+String(e.p).slice(1)]); inc(`fm.${fa}`); inc(`fm.${fa}.ok`, e.ok); inc(`fm.${fa}.undef`, e.ndef > 0 ? 0 : 1);
      }
      if (e.type === 'dominance') inc(inMission ? 'dom.mission' : 'dom.other', e.n);
      if (e.type === 'agendaCompleted') { agendas++; inc(`ag.${F([a, b][+String(e.p).slice(1)])}`); }
      if (e.type === 'deployed') inc(`dep.${F([a, b][+String(e.p).slice(1)])}`);
      if (e.type === 'drawFail') inc('deckout');
    }
    const fd = F(w ? [a, b][+w.slice(1)] : a);
    if (end === 'deck-out') inc(`deckoutWin.${fd}`);
    domLoser += Math.min(...doms);
    lines.push(`  ${F(a)} v ${F(b)}: ${w ? F([a, b][+w.slice(1)]) : 'draw'} by ${end}, turn ${g.s.turn.n}, Dominance ${doms.join('-')}`);
  }
}
console.log(`${games} games (${kind})`);
console.log('how games end:', JSON.stringify(how));
console.log('win rate by faction:', Object.entries(wins).map(([f, [w, n]]) => `${f} ${Math.round((100 * w) / n)}%`).join(', '));
console.log(`avg turns ${(turns / games).toFixed(1)} | missions per game ${(missions / games).toFixed(1)} (${Math.round((100 * ok) / missions)}% succeed) | Agendas completed per game ${(agendas / games).toFixed(2)} | loser's Dominance ${(domLoser / games).toFixed(1)}`);
const pct = (a: string, b: string) => `${Math.round((100 * (st[a] ?? 0)) / Math.max(1, st[b] ?? 0))}%`;
console.log(`missions: undefended ${st.undef ?? 0} (${pct('undef.ok', 'undef')} succeed), defended ${st.def ?? 0} (${pct('def.ok', 'def')} succeed); avg attack ${((st.atkTotal ?? 0) / missions).toFixed(1)} vs defense ${((st.defTotal ?? 0) / missions).toFixed(1)}`);
console.log('by kind:', ['strike', 'infiltrate', 'subvert', 'op', 'investigate', 'disrupt'].filter((k) => st[`m.${k}`]).map((k) => `${k} ${st[`m.${k}`]} (${pct(`m.${k}.ok`, `m.${k}`)})`).join(', '));
console.log(`Dominance from missions ${st['dom.mission'] ?? 0}, from other effects ${st['dom.other'] ?? 0}`);
if (JSONOUT) writeFileSync(JSONOUT, JSON.stringify({ wins, how, turns, games, missions, ok, agendas, domLoser, st, lines }));
console.log(lines.join('\n'));

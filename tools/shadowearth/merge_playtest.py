#!/usr/bin/env python3
"""Merges playtest.ts --json outputs from parallel parts:  python3 tools/shadowearth/merge_playtest.py part1.json part2.json ..."""
import json, sys
W, how, st, lines = {}, {}, {}, []
tot = {'turns': 0, 'games': 0, 'missions': 0, 'ok': 0, 'agendas': 0, 'domLoser': 0}
for f in sys.argv[1:]:
    d = json.load(open(f))
    for k, (w, n) in d['wins'].items(): W.setdefault(k, [0, 0]); W[k][0] += w; W[k][1] += n
    for k, v in d['how'].items(): how[k] = how.get(k, 0) + v
    for k, v in d['st'].items(): st[k] = st.get(k, 0) + v
    for k in tot: tot[k] += d[k]
    lines += d['lines']
g, m = tot['games'], max(1, tot['missions'])
pct = lambda a, b: f"{round(100 * st.get(a, 0) / max(1, st.get(b, 0)))}%"
print(f"{g} games | how games end: {how}")
print('win rate by faction: ' + ', '.join(f"{k} {round(100 * w / n)}% ({w}/{n})" for k, (w, n) in sorted(W.items())))
print(f"avg turns {tot['turns'] / g:.1f} | missions/game {m / g:.1f} ({round(100 * tot['ok'] / m)}% succeed) | Agendas/game {tot['agendas'] / g:.2f} | loser's Dominance {tot['domLoser'] / g:.1f}")
print(f"undefended {st.get('undef', 0)} ({pct('undef.ok', 'undef')}), defended {st.get('def', 0)} ({pct('def.ok', 'def')}); avg attack {st.get('atkTotal', 0) / m:.1f} vs defense {st.get('defTotal', 0) / m:.1f}")
print('by kind: ' + ', '.join(f"{k} {st[f'm.{k}']} ({pct(f'm.{k}.ok', f'm.{k}')})" for k in ['strike', 'infiltrate', 'subvert', 'op', 'investigate', 'disrupt'] if st.get(f'm.{k}')))
print(f"Dominance from missions {st.get('dom.mission', 0)}, other {st.get('dom.other', 0)} | deck-out wins: " + ', '.join(f"{k[10:]} {v}" for k, v in st.items() if k.startswith('deckoutWin.')))
fs = sorted({k.split('.')[1] for k in st if k.startswith('fm.')})
for f in fs:
    n = st.get(f'fm.{f}', 0); games_f = W.get(f, [0, 1])[1]
    print(f"  {f}: {n / max(1, games_f):.1f} missions/game, {pct(f'fm.{f}.ok', f'fm.{f}')} succeed, {pct(f'fm.{f}.undef', f'fm.{f}')} undefended, "
          f"{st.get(f'dep.{f}', 0) / max(1, games_f):.1f} permanents played/game, Agendas {st.get(f'ag.{f}', 0)}")

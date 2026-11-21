// Player-specific projections. The only way UI and AI read match state.
import type { GEvent, Match, Pending } from './types.ts';
import { chars } from './layers.ts';
import { cardNow, isBlank } from './identity.ts';
import { activeId, curPhase, list, topWin, viewers } from './util.ts';

export interface ObjView {
  id: string;
  card: string;
  owner: string;
  controller: string;
  vars: Record<string, number>;
  stats?: Record<string, any>; // computed characteristics (rules.stats)
  keywords?: string[];
  rel?: Record<string, string>;
  faceDown?: boolean; // card is "" unless you control it
  slot?: string; // position in a slotted zone
  printed?: string; // the printed card when it is currently a copy of another
  blank?: boolean; // has lost all abilities
}
export interface StackView { id: string; kind: string; ctrl: string; label: string; card: string | null; source: string | null; targets: string[] }
export interface View {
  me: string;
  turn: number;
  active: string;
  phase: string; // the phase, or the step of the open timing window
  window: { id: string; step: string; data: Record<string, any> } | null;
  priority: string | null;
  players: { id: string; vars: Record<string, number>; lost: boolean }[];
  vars: Record<string, number>; // game vars
  ext: Record<string, string | number>; // external inputs
  zones: Record<string, { count: number; cards?: ObjView[] }>;
  stack: StackView[]; // bottom -> top
  pending: Pending | { player: string; prompt: string } | null;
  result: Match['s']['result'];
  eventCount: number;
}

export function observe({ m, s }: Match, p: string): View {
  const zones: View['zones'] = {};
  const ch = chars(m, s);
  const canSee = (id: string) => !!s.players.find((x) => x.id === id) || (s.objects[id] && (viewers(m, s.objects[id].zone)?.includes(p) ?? true));
  for (const key in s.zones) {
    const ids = s.zones[key];
    const v = viewers(m, key);
    zones[key] = { count: ids.length };
    if (v === null || v.includes(p)) {
      zones[key].cards = ids.map((id) => {
        const o = s.objects[id];
        const now = cardNow(m, s, o);
        const v: ObjView = { id, card: now, owner: o.owner, controller: o.controller, vars: { ...o.vars } };
        if (now !== o.card) v.printed = o.card;
        if (isBlank(m, s, o)) v.blank = true;
        if (o.fd) {
          v.faceDown = true;
          if (o.slot) v.slot = o.slot;
          if (o.controller !== p) { v.card = ''; delete v.printed; delete v.blank; return v; }
        }
        const c = ch?.get(id);
        if (c) { v.stats = { ...c.stats }; v.keywords = [...c.kw].sort(); }
        if (o.rel) v.rel = { ...o.rel };
        if (o.slot) v.slot = o.slot;
        return v;
      });
    }
  }
  const pd = s.pending;
  return {
    me: p, turn: s.turn.n, active: activeId(s), phase: curPhase(m, s).id, priority: s.priority,
    window: topWin(s) ? { id: topWin(s)!.id, step: curPhase(m, s).id, data: structuredClone(topWin(s)!.data) } : null,
    players: s.players.map((pl) => ({ id: pl.id, vars: { ...pl.vars }, lost: pl.lost })), vars: { ...s.vars }, ext: { ...s.ext }, zones,
    stack: s.stack.map((it) => ({
      id: it.id, kind: it.kind, ctrl: it.ctrl, label: it.label, card: it.card, source: it.source && canSee(it.source) ? it.source : null,
      targets: it.slots.flatMap((sl) => list(it.ctx[sl.as])).filter(canSee),
    })),
    pending: pd ? (pd.player === p ? structuredClone(pd) : { player: pd.player, prompt: pd.prompt }) : null,
    result: s.result, eventCount: s.events.length,
  };
}

export function redact(e: GEvent, p: string): Record<string, any> {
  const { masks, ...rest } = e;
  for (const [who, fields] of masks ?? []) if (!who.includes(p)) for (const f of fields) delete rest[f];
  return rest;
}

export const eventsFor = ({ s }: Match, p: string, from = 0) => s.events.slice(from).map((e) => redact(e, p));

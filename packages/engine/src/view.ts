// Player-specific projections. The only way UI and AI read match state.
import type { GEvent, Match, Pending } from './types.ts';
import { activeId, viewers } from './util.ts';

export interface ObjView { id: string; card: string; owner: string; controller: string; vars: Record<string, number> }
export interface View {
  me: string;
  turn: number;
  active: string;
  phase: string;
  priority: string | null;
  players: { id: string; vars: Record<string, number>; lost: boolean }[];
  zones: Record<string, { count: number; cards?: ObjView[] }>;
  pending: Pending | { player: string; prompt: string } | null;
  result: Match['s']['result'];
  eventCount: number;
}

export function observe({ m, s }: Match, p: string): View {
  const zones: View['zones'] = {};
  for (const key in s.zones) {
    const ids = s.zones[key];
    const v = viewers(m, key);
    zones[key] = { count: ids.length };
    if (v === null || v.includes(p)) {
      zones[key].cards = ids.map((id) => {
        const o = s.objects[id];
        return { id, card: o.card, owner: o.owner, controller: o.controller, vars: { ...o.vars } };
      });
    }
  }
  const pd = s.pending;
  return {
    me: p, turn: s.turn.n, active: activeId(s), phase: m.rules.phases[s.turn.phase].id, priority: s.priority,
    players: s.players.map((pl) => ({ id: pl.id, vars: { ...pl.vars }, lost: pl.lost })), zones,
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

import type { ActionDef, ActivatedDef, Ctx, Limit, Mask, Mod, Obj, PhaseDef, Player, SlotPos, State, Win } from './types.ts';

export class EngineError extends Error {}
/** Thrown when a cost cannot be paid; the action is rejected and nothing changes. */
export class CostError extends EngineError {}
/** A module script exceeded its gas or recursion budget. */
export class ScriptError extends EngineError {}

export const one = (x: any): any => (Array.isArray(x) ? x[0] : x);
export const list = (x: any): any[] => (x == null ? [] : Array.isArray(x) ? x : [x]);
export const num = (x: any): number => (typeof x === 'number' ? x : Number(one(x)) || 0);
export const uniq = <T>(a: T[]): T[] => [...new Set(a)];

export const zoneIdOf = (key: string) => key.slice(key.indexOf(':') + 1);
export const zoneOwnerOf = (key: string) => key.slice(0, key.indexOf(':'));
export function zkey(m: Mod, owner: string, zone: string): string {
  const zd = m.zone.get(zone);
  if (!zd) throw new EngineError(`Unknown zone ${zone}`);
  return zd.shared ? `shared:${zone}` : `${owner}:${zone}`;
}
/** Player ids allowed to see a zone's contents; null = everyone. */
export function viewers(m: Mod, key: string): string[] | null {
  const zd = m.zone.get(zoneIdOf(key))!;
  if (zd.vis === 'public') return null;
  if (zd.vis === 'owner' && !zd.shared) return [zoneOwnerOf(key)];
  return [];
}
/** Builds event masks from [viewers|null, fields] pairs; null (everyone) needs no mask. */
export function masks(...pairs: [string[] | null, string[]][]): { masks?: Mask[] } {
  const out = pairs.filter((p): p is Mask => p[0] !== null);
  return out.length ? { masks: out } : {};
}
/** Who may know an object's identity: the controller only while it is face down. */
export const objViewers = (m: Mod, o: Obj): string[] | null => (o.fd ? [o.controller] : viewers(m, o.zone));
export const unionViewers = (a: string[] | null, b: string[] | null) => (a === null || b === null ? null : uniq([...a, ...b]));

export const player = (s: State, id: unknown): Player | undefined => s.players.find((p) => p.id === id);
export const activeId = (s: State) => s.players[s.turn.active].id;
export function nextPlayer(s: State, id: string): string {
  const i = s.players.findIndex((p) => p.id === id);
  for (let k = 1; k <= s.players.length; k++) {
    const p = s.players[(i + k) % s.players.length];
    if (!p.lost) return p.id;
  }
  return id;
}
/** $opp: the next living player, or with teams (player var `team`) the next living player on another team. */
export function baseCtx(s: State, me: string): Ctx {
  const mine = player(s, me)?.vars.team;
  if (mine === undefined) return { $me: me, $opp: nextPlayer(s, me) };
  let o = nextPlayer(s, me);
  for (let k = 0; k < s.players.length && player(s, o)!.vars.team === mine && o !== me; k++) o = nextPlayer(s, o);
  return { $me: me, $opp: o };
}

/**
 * The definition behind an action name. "<base>#<i>" is the i-th activated ability listed in the source card's
 * `activated` field, merged over the base action: lists concatenate (base first), scalars come from the ability.
 */
export function actionDef(m: Mod, s: State, name: string, src: string | null): ActionDef | undefined {
  const h = name.indexOf('#');
  if (h < 0) return m.rules.actions[name];
  const a = m.rules.actions[name.slice(0, h)];
  const o = src ? s.objects[src] : undefined;
  if (!a?.activated || !o) return undefined;
  const i = Number(name.slice(h + 1));
  const ab = ((m.card.get(o.card) as any)?.[a.activated] as ActivatedDef[] | undefined)?.[i];
  if (!ab || !Number.isInteger(i)) return undefined;
  const cat = <T>(x?: T[], y?: T[]) => [...(x ?? []), ...(y ?? [])];
  return {
    ...a, label: ab.label ?? `${a.label ?? name.slice(0, h)} ${i + 1}`, phases: ab.phases ?? a.phases, speed: ab.speed ?? a.speed, stack: ab.stack ?? a.stack,
    req: cat(a.req, ab.req), targets: cat(a.targets, ab.targets), check: cat(a.check, ab.check), cost: cat(a.cost, ab.cost), do: cat(a.do, ab.do),
    countered: ab.countered ?? a.countered, limit: ab.limit ? { ...ab.limit, group: ab.limit.group ?? `ab:${o.card}#${i}` } : a.limit,
  };
}

// ---------- timing windows ----------
export const topWin = (s: State): Win | undefined => s.windows[s.windows.length - 1];
/** The phase (or, inside a timing window, the window step) the game is in. */
export function curPhase(m: Mod, s: State): PhaseDef {
  const w = topWin(s);
  return w ? m.rules.windows![w.id].steps[w.step] : m.rules.phases[s.turn.phase];
}

// ---------- slotted zones ----------
const defList = (x: unknown): string[] => (x == null ? [] : Array.isArray(x) ? x.map(String) : [String(x)]);
/** Whether a card (definition id) may occupy a slot: type in types, card field `kind` in kinds. */
export function slotAccepts(m: Mod, sp: SlotPos, card: string): boolean {
  const d = m.card.get(card) as any;
  if (!d) return false;
  if (sp.types && !sp.types.includes(d.type)) return false;
  if (sp.kinds && !defList(d.kind).some((k) => sp.kinds!.includes(k))) return false;
  return true;
}
export const slotsOf = (m: Mod, zone: string): SlotPos[] => m.zone.get(zone)?.slots ?? [];
export const inSlot = (s: State, key: string, slot: string) => (s.zones[key] ?? []).filter((id) => s.objects[id]?.slot === slot);
/** Slots of a zone with room left (ignoring `except`), optionally only those that accept `card`. */
export function freeSlots(m: Mod, s: State, key: string, card?: string, except?: string): string[] {
  return slotsOf(m, zoneIdOf(key))
    .filter((sp) => inSlot(s, key, sp.id).filter((id) => id !== except).length < (sp.cap ?? 1) && (card === undefined || slotAccepts(m, sp, card)))
    .map((sp) => sp.id);
}

// ---------- usage limits ----------
/** Counter key for a limit: scope | group | who (player, object, physical card, or player/card id or name). */
export function useKey(m: Mod, s: State, lim: Limit, group: string, p: string, src: string | null): string {
  const o = src ? s.objects[src] : undefined;
  const by = lim.by ?? 'player';
  const who = by === 'player' || !o ? p : by === 'source' ? o.id : by === 'inst' ? o.inst : by === 'card' ? `${p}/${o.card}` : `${p}/${m.card.get(o.card)?.name ?? o.card}`;
  return `${lim.per}|${lim.group ?? group}|${who}`;
}
export const resetUses = (s: State, scope: 'turn' | 'phase') => {
  for (const k of Object.keys(s.uses)) if (k.startsWith(`${scope}|`)) delete s.uses[k];
};

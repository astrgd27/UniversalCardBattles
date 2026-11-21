import type { Ctx, Mask, Mod, Player, State } from './types.ts';

export class EngineError extends Error {}

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
export const baseCtx = (s: State, me: string): Ctx => ({ $me: me, $opp: nextPlayer(s, me) });

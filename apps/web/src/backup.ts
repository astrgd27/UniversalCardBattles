// Browser save backups: every stored "ucb-*" entry (profiles, custom decks, save slots, theme) in one JSON file.
// Imports are untrusted: strict JSON parsing, size cap, key whitelist and per-entry shape checks.
import { CampaignError, migrateProfile } from '#campaign';
import { PackageError, parseJson } from '#sdk';

export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 5 << 20;
const KEY = /^ucb-(save|profile|decks):[a-z0-9][a-z0-9-]{1,63}$|^ucb-slot:[a-z0-9][a-z0-9-]{1,63}:[a-z0-9]{1,32}$|^ucb-theme$/;
export interface Backup { app: 'universal-card-battles'; kind: 'saves'; version: number; exportedAt: string; entries: Record<string, unknown> }

const isRec = (x: unknown): x is Record<string, any> => !!x && typeof x === 'object' && !Array.isArray(x);
const isDeck = (d: unknown) => (Array.isArray(d) && d.every((c) => typeof c === 'string')) || (isRec(d) && Object.values(d).every((l) => Array.isArray(l) && l.every((c) => typeof c === 'string')));

export function makeBackup(entries: Record<string, unknown>, now = new Date()): Backup {
  const kept = Object.fromEntries(Object.entries(entries).filter(([k]) => KEY.test(k)));
  return { app: 'universal-card-battles', kind: 'saves', version: BACKUP_VERSION, exportedAt: now.toISOString(), entries: kept };
}

/** Checks one stored entry; returns its (possibly migrated) value or throws an Error with a reason. */
function checkEntry(key: string, v: unknown): unknown {
  const kind = key.slice(4, key.indexOf(':') < 0 ? undefined : key.indexOf(':'));
  if (kind === 'theme') { if (v !== 'dark' && v !== 'light') throw new Error('theme must be "dark" or "light"'); return v; }
  if (kind === 'profile') {
    try { return migrateProfile(v); } catch (e) { throw new Error(e instanceof CampaignError ? e.reasons.join('; ') : String(e)); }
  }
  if (kind === 'decks') {
    if (!isRec(v) || !Object.values(v).every(isDeck)) throw new Error('decks are malformed');
    return v;
  }
  // saved match: {seats, decks, camp?, state: serialized engine state}; the engine re-checks module id, version and rules hash on restore.
  if (!isRec(v) || typeof v.state !== 'string' || !Array.isArray(v.seats) || !Array.isArray(v.decks)) throw new Error('saved match is malformed');
  if (v.state.length > MAX_BACKUP_BYTES) throw new Error('saved match is too large');
  const st = JSON.parse(v.state);
  if (!isRec(st) || typeof st.moduleId !== 'string' || typeof st.rulesHash !== 'string') throw new Error('saved match state is malformed');
  return v;
}

/** Parses and validates a backup file. Returns the entries to write and the problems found (bad entries are skipped). */
export function readBackup(text: string): { entries: Record<string, unknown>; problems: string[] } {
  if (text.length > MAX_BACKUP_BYTES) return { entries: {}, problems: [`file is larger than ${MAX_BACKUP_BYTES >> 20} MB`] };
  let data: any;
  try { data = parseJson(text, 'backup').value; } catch (e) { return { entries: {}, problems: e instanceof PackageError ? e.errors : [String(e)] }; }
  if (!isRec(data) || data.app !== 'universal-card-battles' || data.kind !== 'saves') return { entries: {}, problems: ['not a Universal Card Battles save backup'] };
  if (data.version !== BACKUP_VERSION) return { entries: {}, problems: [`unsupported backup version ${data.version}`] };
  if (!isRec(data.entries)) return { entries: {}, problems: ['backup has no entries'] };
  const entries: Record<string, unknown> = {};
  const problems: string[] = [];
  for (const [k, v] of Object.entries(data.entries)) {
    if (!KEY.test(k)) { problems.push(`${k}: unknown entry, skipped`); continue; }
    try { entries[k] = checkEntry(k, v); } catch (e) { problems.push(`${k}: ${(e as Error).message}, skipped`); }
  }
  return { entries, problems };
}

// Scripted tutorials: a validated scenario (the set-piece board), coaching steps that each expect one move or
// decision from the learner, and a scripted opponent. Cards and targets are named by card id, never by object id,
// so scripts stay valid when unrelated content changes. The UI enforces the expected move; this module is pure.
import type { ActionCmd, Match, Mod, Pending, Template, View } from '#engine';
import { listActions } from '#engine';
import type { Agent } from '#ai';

/** A move named by card ids. targets: slot name -> card ids, or "$me" / "$opp" for players. */
export interface TutorialMove { action: string; card?: string; targets?: Record<string, string[]> }
export interface TutorialStep {
  say: string; // coaching text for this step
  speaker?: string;
  do?: TutorialMove; // the move the learner must make
  pass?: boolean; // the learner must pass / end the step
  decide?: string[]; // expected answer to a pending decision (option values or card ids); [] accepts any answer
  wait?: boolean; // a read step shown only once it is the learner's move again (the opponent plays on until then)
}
export interface Tutorial {
  id: string;
  name: string;
  blurb?: string;
  icon?: string;
  deck: string; // the learner's deck (module or campaign deck)
  opponentDeck: string;
  opponent?: string; // opponent's display name
  seed?: number;
  scenario?: import('#engine').Scenario;
  steps: TutorialStep[];
  script?: TutorialMove[]; // the opponent's moves, in order
  rewards?: import('./index.ts').Reward;
}
export type StepKind = 'read' | 'move' | 'pass' | 'decide';
export const stepKind = (st: TutorialStep | undefined): StepKind | null =>
  !st ? null : st.do ? 'move' : st.pass ? 'pass' : st.decide ? 'decide' : 'read';

type Ids = (id: string) => string | undefined; // object id -> card id (undefined if unknown)
const idsOfMatch = (m: Match): Ids => (id) => m.s.objects[id]?.card;
const idsOfView = (v: View): Ids => {
  const map = new Map<string, string>();
  for (const z of Object.values(v.zones)) for (const o of z.cards ?? []) if (o.card) map.set(o.id, o.card);
  return (id) => map.get(id);
};
const who = (x: string, me: string, opp: string) => (x === '$me' ? me : x === '$opp' ? opp : x);

/** Whether option `opt` (an object or player id) is what `want` names (a card id, "$me" or "$opp"). */
function same(opt: string, want: string, ids: Ids, me: string, opp: string): boolean {
  return opt === who(want, me, opp) || ids(opt) === want;
}

/** Whether a read step is showing now (it pauses the game) or still waiting for the learner's turn. */
export function readShowing(m: Match, learner: string, step: TutorialStep | undefined): boolean {
  if (stepKind(step) !== 'read') return false;
  if (!step!.wait || m.s.result) return true;
  return m.s.pending ? m.s.pending.player === learner : m.s.priority === learner;
}

/** The templates the learner may use for this step: only the expected one, with only the expected targets. */
export function allowedTemplates(m: Match, p: string, step: TutorialStep | undefined, tpls: Template[]): Template[] {
  const kind = stepKind(step);
  if (kind === 'pass') return tpls.filter((t) => t.action === 'pass');
  if (kind !== 'move') return [];
  const mv = step!.do!;
  const ids = idsOfMatch(m);
  const opp = m.s.players.find((x) => x.id !== p)?.id ?? p;
  return tpls
    .filter((t) => t.action === mv.action && (!mv.card || (t.source !== null && ids(t.source) === mv.card)))
    .map((t) => ({ ...t, slots: t.slots.map((sl) => {
      const want = mv.targets?.[sl.as];
      if (!want) return sl;
      const options = sl.options.filter((o) => want.some((w) => same(o, w, ids, p, opp)));
      return { ...sl, options, min: Math.min(sl.min, options.length), max: Math.min(sl.max, options.length) };
    }) }))
    .filter((t) => t.slots.every((sl) => sl.options.length >= sl.min))
    .slice(0, 1);
}

/** The options of a pending decision the learner may pick in this step ([] / no list = any). */
export function allowedOptions(m: Match, step: TutorialStep | undefined, pd: Pending): string[] {
  const want = step?.decide;
  if (!want || !want.length) return pd.options;
  const ids = idsOfMatch(m);
  const opp = m.s.players.find((x) => x.id !== pd.player)?.id ?? pd.player;
  const ok = pd.options.filter((o) => want.some((w) => same(o, w, ids, pd.player, opp)));
  return ok.length ? ok : pd.options;
}

/** Whether a command is the move this step expects. */
export function isExpected(m: Match, p: string, step: TutorialStep | undefined, cmd: ActionCmd): boolean {
  const kind = stepKind(step);
  if (kind === 'pass') return cmd.action === 'pass';
  if (kind !== 'move') return false;
  const mv = step!.do!;
  const ids = idsOfMatch(m);
  const opp = m.s.players.find((x) => x.id !== p)?.id ?? p;
  if (cmd.action !== mv.action || (mv.card && (!cmd.source || ids(cmd.source) !== mv.card))) return false;
  return Object.entries(mv.targets ?? {}).every(([slot, want]) => (cmd.targets?.[slot] ?? []).every((t) => want.some((w) => same(t, w, ids, p, opp))));
}

/** A full command for the step's move (the first legal match), or null. Used by tests and by "show me" hints. */
export function expectedCommand(m: Match, p: string, step: TutorialStep | undefined): ActionCmd | null {
  const t = allowedTemplates(m, p, step, listActions(m, p))[0];
  if (!t) return null;
  return { action: t.action, source: t.source, targets: Object.fromEntries(t.slots.map((sl) => [sl.as, sl.options.slice(0, Math.max(1, sl.min))])) };
}

/**
 * The scripted opponent: plays its moves in order whenever it has priority. A move that is not legal right now
 * is kept for later and the opponent passes, so a script reads as "what it does on its turn". Decisions take
 * the first options (enough to satisfy the minimum).
 */
export function tutorialAgent(t: Tutorial): Agent & { next: () => number } {
  let i = 0;
  return {
    next: () => i,
    act(view: View, tpls: Template[]) {
      const mv = t.script?.[i];
      if (mv) {
        const ids = idsOfView(view);
        const opp = view.players.find((x) => x.id !== view.me)?.id ?? view.me;
        const tp = tpls.find((x) => x.action === mv.action && (!mv.card || (x.source !== null && ids(x.source) === mv.card)));
        if (tp) {
          const targets: Record<string, string[]> = {};
          let ok = true;
          for (const sl of tp.slots) {
            const want = mv.targets?.[sl.as];
            const opts = want ? sl.options.filter((o) => want.some((w) => same(o, w, ids, view.me, opp))) : sl.options;
            if (opts.length < Math.max(1, sl.min)) { ok = false; break; }
            targets[sl.as] = opts.slice(0, Math.max(1, sl.min));
          }
          if (ok) { i++; return { action: tp.action, source: tp.source, targets }; }
        }
      }
      return { action: 'pass' };
    },
    decide(view: View) {
      const pd = view.pending as Pending;
      return pd.options.slice(0, Math.max(pd.min, pd.kind === 'divide' ? pd.min : 0));
    },
  };
}

export function validateTutorials(m: Mod, tutorials: unknown, decks: Record<string, unknown>, scenarioErrors: (sc: unknown) => string[]): string[] {
  const e: string[] = [];
  if (tutorials === undefined) return e;
  if (!Array.isArray(tutorials)) return ['campaign/tutorials: must be a list'];
  const seen = new Set<string>();
  const cardOk = (id: unknown) => typeof id === 'string' && (id === '$me' || id === '$opp' || m.card.has(id));
  const move = (mv: any, w: string) => {
    if (!mv || typeof mv !== 'object' || typeof mv.action !== 'string' || !(mv.action in m.rules.actions || mv.action.includes('#'))) { e.push(`${w}: needs a known action`); return; }
    if (mv.card !== undefined && !cardOk(mv.card)) e.push(`${w}: unknown card "${mv.card}"`);
    for (const [k, l] of Object.entries(mv.targets ?? {})) if (!Array.isArray(l) || !l.every(cardOk)) e.push(`${w}/targets/${k}: card ids, "$me" or "$opp"`);
  };
  tutorials.forEach((t: any, i: number) => {
    const w = `campaign/tutorials/${t?.id ?? i}`;
    if (!t || typeof t !== 'object' || typeof t.id !== 'string' || typeof t.name !== 'string') { e.push(`${w}: needs id and name`); return; }
    if (seen.has(t.id)) e.push(`${w}: duplicate id`);
    seen.add(t.id);
    for (const k of ['deck', 'opponentDeck']) if (typeof t[k] !== 'string' || !decks[t[k]]) e.push(`${w}/${k}: unknown deck "${t[k]}"`);
    if (!Array.isArray(t.steps) || !t.steps.length) e.push(`${w}/steps: at least one step`);
    else t.steps.forEach((st: any, j: number) => {
      const sw = `${w}/steps/${j}`;
      if (!st || typeof st.say !== 'string') { e.push(`${sw}: needs "say"`); return; }
      if ([st.do, st.pass, st.decide].filter((x) => x !== undefined).length > 1) e.push(`${sw}: at most one of do, pass, decide`);
      if (st.do !== undefined) move(st.do, `${sw}/do`);
      if (st.decide !== undefined && !(Array.isArray(st.decide) && st.decide.every((x: unknown) => typeof x === 'string'))) e.push(`${sw}/decide: a list of options or card ids`);
    });
    (Array.isArray(t.script) ? t.script : t.script === undefined ? [] : [null]).forEach((mv: any, j: number) => move(mv, `${w}/script/${j}`));
    if (t.scenario !== undefined) for (const x of scenarioErrors(t.scenario)) e.push(`${w}/${x}`);
  });
  return e;
}

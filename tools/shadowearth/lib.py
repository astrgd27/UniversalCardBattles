"""Shadow Earth effect macros and the card-effect registry.

Faction files call `fx(name, ...)` to give a card its behaviour, and add static terms (attribute bonuses,
cost changes, Security, durability, "can't defend") with `attr_term`, `cost_term` and friends. build.py
compiles the terms into rule functions, so every printed number is computed in one place.
"""
import re
from dsl import *

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

FX = {}  # card name -> dict of card fields (deploy, op, resp, mop, abil, abilities, ...)
ATTR, COST, SEC, DUR, NODEF, NOATK, HASTE = [], [], [], [], [], [], []
MIN1 = set()  # cards whose cost reductions stop at 1

def fx(name, **kw):
    assert name not in FX, name
    FX[name] = kw
    return kw

# ---------------------------------------------------------------- where things are
OPS = lambda p='*': ['cards', p, 'ops']
SITES = lambda p='*': ['cards', p, 'sites']
GEAR = lambda p='*': ['cards', p, 'gear']
PERMS = lambda p='*': ['concat', OPS(p), SITES(p), GEAR(p)]
HAND = lambda p='$me': ['cards', p, 'hand']
DECK = lambda p='$me': ['cards', p, 'deck']
GRAVE = lambda p='$me': ['cards', p, 'grave']

def isc(o, name): return eq(g(o, 'card'), slug(name))
def live(name, p='$me'):
    """Active (not Disabled) copies of `name` controlled by p, in play."""
    return flt(PERMS(p), AND(isc('$it', name), C('active', '$it')))
def own(name, p='$me'): return ANY(PERMS(p), AND(isc('$it', name), C('active', '$it')))
def typ(o, t): return eq(g(o, 'type'), t)
def kw(o, k): return has(o, k)
def ctrl(o): return g(o, 'controller')
def mine(o, p='$me'): return eq(ctrl(o), p)
def opsOf(p, pred=None): return flt(OPS(p), pred) if pred is not None else OPS(p)
def readyOps(p, pred=None): return flt(OPS(p), AND(eq(g('$it', 'ex'), 0), *( [pred] if pred is not None else [])))
def nkind(p, k): return cnt(flt(OPS(p), has('$it', k)))
def facs(p): return flt(SITES(p), typ('$it', 'facility'))
def projs(p): return flt(SITES(p), typ('$it', 'project'))
def assets(p): return flt(GEAR(p), typ('$it', 'asset'))
def bearerOf(a): return g(a, 'bearer')
def gearOn(o): return ['linked', o, 'bearer']

# mission context (game vars; mp = attacker seat + 1, 0 outside a mission)
IN_MISSION = gt(g('game', 'mp'), 0)
MK = {'strike': 1, 'infiltrate': 2, 'subvert': 3, 'op': 4, 'investigate': 5, 'disrupt': 6}
MA = {'F': 1, 'T': 2, 'W': 3}
def kind_is(k): return AND(IN_MISSION, eq(g('game', 'mk'), MK[k]))
def attr_is(a): return AND(IN_MISSION, eq(g('game', 'ma'), MA[a]))
ATTACKER = ['nth', ['players'], sub(g('game', 'mp'), 1)]
def attacking(o): return eq(g(o, 'atk'), 1)
def defending(o): return eq(g(o, 'dfn'), 1)
def participating(o): return OR(attacking(o), defending(o))
def myMission(p='$me'): return AND(IN_MISSION, eq(ATTACKER, p))
def theirMission(p='$me'): return AND(IN_MISSION, ne(ATTACKER, p))
ATK = flt(OPS(), eq(g('$it', 'atk'), 1))
DFN = flt(OPS(), eq(g('$it', 'dfn'), 1))
TGT = first(flt(['concat', PERMS(), ['cards', '*', 'agenda']], eq(g('$it', 'tgt'), 1)))

# ---------------------------------------------------------------- effect macros (each returns ONE effect)
def draw(n=1, p='$me'): return ['draw', p, n]
def loot(n=1): return C('loot', '$me', n)              # draw n, then discard n
def scry(n): return C('scry', '$me', n)
def tmp(n, p='$me'): return C('gainTmp', p, n)          # temporary Influence until your next Refresh
def tmpc(n, p='$me'): return C('gainTmpC', p, n)        # temporary Influence that expires at Cleanup
def dom(n, p='$me'): return C('gainDom', p, n)
def lose_dom(n, p='$me'): return C('loseDom', p, n)
def rev(n, p='$me'): return C('gainRev', p, n)
def dmg(o, n): return C('hurt', o, n)
def heal(o, n): return C('heal', o, n)
def exhaust(o): return SET(o, 'ex', 1)
def ready(o): return SET(o, 'ex', 0)
def disable(o): return C('disable', o)
def control(o): return C('putCtl', o)                    # a Control counter (max one per operative)
def token(card, n=1, p='$me', ready_=False): return C('makeTokens', p, card, n, 1 if ready_ else 0)
def peek(p='$opp'): return C('peekHand', '$me', p)     # look at a random card in a hand (private)
def peek_top(p='$opp'): return C('peekTop', '$me', p)  # look at the top card of a deck (private)
def bounce(o): return C('toHand', o)
def eliminate(o): return C('eliminate', o)
def sacrifice(o): return C('sacrifice', o)
def until_cleanup(o, a, n): return INC(o, 'c' + a, n)   # +n to attribute a ('F','T','W') until Cleanup
def mission_bonus(o, n): return INC(o, 'mb', n)          # +n to o's value in the current mission
def team_bonus(side, n): return INC('game', 'am' if side == 'atk' else 'dm', n)
def discard_choice(p, n, prompt='Discard a card'): return C('discardN', p, n)

def pick(frm, as_='$t', prompt='Choose', mn_=1, mx_=1, who=None): return choose(frm, as_, prompt, mn_, mx_, who)
def each_pick(frm, n, body, prompt):
    """Choose up to n from frm, then run body for each ($x)."""
    return [choose(frm, '$xs', prompt, 0, n), EACH(['list', '$xs'] if n == 1 else '$xs', '$x', body)]

# ---------------------------------------------------------------- card ability shorthands
def op(do, targets=None, req=None, label=None):
    """An Operation (or Response) as an activated entry of the card in hand."""
    ab = {'do': do}
    if targets: ab['targets'] = targets
    if req: ab['req'] = [{'if': r, 'why': w} for r, w in req]
    if label: ab['label'] = label
    return [ab]

def slot(frm, as_='$t', prompt='Choose a target', mn_=1, mx_=1, untargeted=False):
    s = {'as': as_, 'from': frm, 'prompt': prompt, 'min': mn_, 'max': mx_}
    if untargeted: s['untargeted'] = True
    return s

def trig(on, do, cond=None, once_per_turn=False, optional=False, text=''):
    t = {'on': on, 'do': do}
    if cond is not None: t['if'] = cond
    if once_per_turn: t['limit'] = {'per': 'turn', 'by': 'source'}
    if optional: t['optional'] = True
    if text: t['text'] = text
    return t

def abil(label, do, phases=('development',), cost=None, req=None, targets=None, once=True):
    a = {'label': label, 'phases': list(phases), 'do': do}
    if cost: a['cost'] = cost
    if req: a['req'] = [{'if': r, 'why': w} for r, w in req]
    if targets: a['targets'] = targets
    if once: a['limit'] = {'per': 'turn', 'by': 'source'}
    return a

# common trigger conditions ($self = the card with the ability; $e = the event)
SELF_P = ctrl('$self')
def at_refresh(do, cond=None, **k): return trig('refresh', do, AND(eq('$e.p', SELF_P), C('active', '$self'), *([cond] if cond is not None else [])), **k)
def at_cleanup(do, cond=None, **k): return trig('cleanup', do, AND(eq('$e.p', SELF_P), C('active', '$self'), *([cond] if cond is not None else [])), **k)
def on_success(kind, do, cond=None, **k):
    """After a mission of `kind` ('any' or a basic/op kind) by this card's controller succeeds."""
    c = [eq('$e.p', SELF_P), eq('$e.ok', 1), C('active', '$self')]
    if kind != 'any': c.append(eq('$e.kind', MK[kind]))
    if cond is not None: c.append(cond)
    return trig('missionResult', do, AND(*c), **k)
def on_played(pred, do, cond=None, **k):
    """When this card's controller plays a card matching pred ($e.c = the new object)."""
    return trig('played', do, AND(eq('$e.p', SELF_P), C('active', '$self'), pred, *([cond] if cond is not None else [])), **k)

# ---------------------------------------------------------------- static terms
def attr_term(expr): ATTR.append(expr)            # uses $o (operative) and $a (1 F, 2 T, 3 W); returns a number
def cost_term(expr): COST.append(expr)            # uses $c (card) and $p (payer); returns a delta
def sec_term(expr): SEC.append(expr)              # uses $p (defending player)
def dur_term(expr): DUR.append(expr)              # uses $o
def nodef_term(expr): NODEF.append(expr)          # uses $o: true = it can't defend
def noatk_term(expr): NOATK.append(expr)          # uses $o and $k (mission kind): true = it can't attack
def haste_term(expr): HASTE.append(expr)          # uses $o and $k: true = it may join although it entered this turn

def A_(a): return eq('$a', MA[a])
def bonus_if(cond, n): return Q(cond, n, 0)
def src_count(name, p): return cnt(live(name, p))

# more hooks the faction files extend (compiled by build.py)
TGTDENY = []        # uses $o (candidate mission target) and $k (mission kind): true = not a legal target
MCOST = []          # uses $p and $k: mission initiation cost delta
PLAYREQ = []        # uses $c and $p: all must hold to play a card
RULE_TRIGGERS = []  # extra rule-level triggers
REPLACEMENTS = []   # extra replacement effects
OPSTART = []        # effects run when an Operation or Response is played ($c2 = the card, $me = its player): cancel by SET game ocan 1
PRE_DEFEND = []     # effects after a mission is declared, before defenders are assigned
AFTER_DEFEND = []   # effects after defenders are assigned
DECKS = {}
SAVE = []           # effects run when operative $o would be eliminated: SET game saved 1 to prevent it
SHIELD = []         # terms (uses $o): damage prevented the first time $o is dealt damage each turn
def gear_n(o, name): return cnt(flt(gearOn(o), isc('$it', name)))
def look_hand(p='$opp'): return C('lookHand', '$me', p)
def bearer_term(name, attr, n, cond=None):
    """Attribute bonus for the operative an Asset named `name` is attached to."""
    c = [A_(attr)] + ([cond] if cond is not None else [])
    return Q(AND(*c), mul(gear_n('$o', name), n), 0)
def self_term(name, attr, n, cond=None):
    """Attribute bonus an operative named `name` gives itself."""
    c = [isc('$o', name), A_(attr)] + ([cond] if cond is not None else [])
    return Q(AND(*c), n, 0)
NULL = ['lit', None]
USEHOOK_ANY = []    # the same for Asset and operative abilities
USEHOOK = []        # effects when a Facility's ability is activated ($self = the Facility, $me = its controller): SET game ucan 1 cancels it
def taxed(payer, n, label):
    """payer pays n more or the thing is cancelled ($y = the choice); emits taxPaid when paid."""
    return [choose(Q(ge(C('avail', payer), n), opts(f'Pay {n}', label), opts(label)), '$y', f'Pay {n} more, or: {label.lower()}?', who=payer),
            IF(eq('$y', f'Pay {n}'), [C('spend', payer, n), emit('taxPaid', p=payer, n=n)])]
COVERT = []         # terms (uses $o): true = this attacker has Covert in the current mission
INFIL_OPTS = []     # extra Infiltrate rewards: (label, condition, effects); $t = the target or null
SUBV_OPTS = []      # extra Subvert rewards against an operative: (label, condition, effects); $t = the target
STRIKE_EXTRA = []   # terms: extra damage for the Strike '3 damage' reward
MY_SAC = lambda p='$me': flt(OPS(p), eq(g('$it', 'ctlT'), 0))  # operatives p may sacrifice (not borrowed ones)
def agenda(reqs, imm=None, phases=('development', 'operations'), cost=None):
    """An Agenda's completion: reqs = [(condition, why)], imm = the Immediate effect list."""
    ab = {'label': 'Complete this Agenda', 'phases': list(phases), 'req': [{'if': r, 'why': w} for r, w in reqs]}
    if cost: ab['cost'] = cost
    out = {'agenda': [ab]}
    if imm: out['imm'] = imm
    return out
def recent(p, k):
    """Successes of a basic kind ('S', 'I', 'W') on your most recent turns, counting this one if it already succeeded."""
    return Q(eq(g(p, 'suc' + k), 1), add(g(p, 'st' + k), 1), g(p, 'st' + k))
def agenda_on(name, p='$me'): return C('agendaDone', p, slug(name))

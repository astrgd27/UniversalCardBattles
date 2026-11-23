"""Shadow Earth 2.0: effect macros, hooks and the card registry used by cards2.py (compiled by build.py)."""
import re
from dsl import *

slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')
CARDS = []                       # card definitions (dicts), in set order
ATTR, HP, COST, NODEF, SWIFT, COVERT, BLOOD, RES = [], [], [], [], [], [], [], []
PRE_DEFEND, AFTER_DEFEND, RULE_TRIGGERS, REPLACEMENTS, PLAYREQ, TGTDENY, OPSTART = [], [], [], [], [], [], []
DECKS = {}

# ---------------------------------------------------------------- where things are
OPS = lambda p='*': ['cards', p, 'ops']
SITES = lambda p='*': ['cards', p, 'sites']
GEAR = lambda p='*': ['cards', p, 'gear']
PERMS = lambda p='*': ['concat', OPS(p), SITES(p), GEAR(p)]
HAND = lambda p='$me': ['cards', p, 'hand']
DECK = lambda p='$me': ['cards', p, 'deck']
GRAVE = lambda p='$me': ['cards', p, 'grave']
ROW = ['cards', 'p0', 'agendas']
PLAN = lambda p='$me': first(['cards', p, 'plan'])
LOOK = lambda p='$me': ['cards', p, 'look']
NULL = ['lit', None]

def isc(o, name): return eq(g(o, 'card'), slug(name))
def live(name, p='$me'): return flt(PERMS(p), isc('$it', name))
def own(name, p='$me'): return ANY(PERMS(p), isc('$it', name))
def typ(o, t): return eq(g(o, 'type'), t)
def ctrl(o): return g(o, 'controller')
def seat(p): return g(p, 'seat')
def ready_(o): return eq(g(o, 'ex'), 0)
def kind_ops(p, k): return flt(OPS(p), has('$it', k))
def gearOn(o): return ['linked', o, 'bearer']
def gear_n(o, name): return cnt(flt(gearOn(o), isc('$it', name)))
def bearerOf(a): return g(a, 'bearer')
def plan_on(p, name): return ANY(['cards', p, 'plan'], AND(isc('$it', name), eq(g('$it', 'done'), 1)))
def prog(a, p): return Q(eq(seat(p), 0), g(a, 'pr0'), g(a, 'pr1'))

# mission context (game vars): mp = attacker seat + 1 (0 = no mission), ma = attribute 1 F / 2 T / 3 W
IN_MISSION = gt(g('game', 'mp'), 0)
ATTACKER = ['nth', ['players'], sub(g('game', 'mp'), 1)]
DEFENDER = ['opp', ATTACKER]
MA = {'F': 1, 'T': 2, 'W': 3}
def attr_is(a): return AND(IN_MISSION, eq(g('game', 'ma'), MA[a]))
def attacking(o): return eq(g(o, 'atk'), 1)
def defending(o): return eq(g(o, 'dfn'), 1)
def participating(o): return OR(attacking(o), defending(o))
def myMission(p='$me'): return AND(IN_MISSION, eq(ATTACKER, p))
def theirMission(p='$me'): return AND(IN_MISSION, ne(ATTACKER, p))
ATK = flt(OPS(), eq(g('$it', 'atk'), 1))
DFN = flt(OPS(), eq(g('$it', 'dfn'), 1))
TGT = first(flt(['concat', PERMS(), ROW, ['cards', '*', 'plan']], eq(g('$it', 'tgt'), 1)))
MY_SIDE = lambda p='$me': flt(OPS(p), participating('$it'))
ENEMY_SIDE = lambda p='$me': flt(OPS(['opp', p]), participating('$it'))

# ---------------------------------------------------------------- effect macros
def draw(n=1, p='$me'): return ['draw', p, n]
def loot(n=1, p='$me'): return C('loot', p, n)
def scry(n, p='$me'): return C('scry', p, n)
def tmp(n, p='$me'): return C('gainTmp', p, n)
def dom(n, p='$me'): return C('gainDom', p, n)
def rev(n, p='$me'): return C('gainRev', p, n)
def dmg(o, n): return C('hurt', o, n)
def heal(o, n): return C('heal', o, n)
def exhaust(o): return SET(o, 'ex', 1)
def ready(o): return SET(o, 'ex', 0)
def control(o): return C('putCtl', o)
def token(card, n=1, p='$me', ready_=True): return C('makeTokens', p, slug(card), n, 1 if ready_ else 0)
def peek(p='$opp'): return C('peekHand', '$me', p)
def peek_top(p='$opp'): return C('peekTop', '$me', p)
def eliminate(o): return C('eliminate', o)
def sacrifice(o): return C('sacrifice', o)
def bounce(o): return C('toHand', o)
def plan_prog(n, p='$me'): return C('addProg', PLAN(p), p, n)
def agenda_prog(a, n, p='$me'): return C('addProg', a, p, n)
def until_eot(o, a, n): return INC(o, 'c' + a, n)
def mission_bonus(o, n): return INC(o, 'mb', n)
def side_bonus(p, n): return IF(eq(ATTACKER, p), [INC('game', 'am', n)], [INC('game', 'dm', n)])
def pick(frm, as_='$v', prompt='Choose', mn_=1, mx_=1, who=None): return choose(frm, as_, prompt, mn_, mx_, who)
def pick_agenda(prompt='Which Conspiracy Agenda?'): return pick(ROW, '$ag', prompt)

# ---------------------------------------------------------------- ability shorthands
SELF_P = ctrl('$self')
def op(do, targets=None, req=None, label=None, phases=None):
    ab = {'do': do}
    if targets: ab['targets'] = targets
    if req: ab['req'] = [{'if': r, 'why': w} for r, w in req]
    if label: ab['label'] = label
    if phases: ab['phases'] = list(phases)
    return [ab]
def slot(frm, as_='$t', prompt='Choose a target', mn_=1, mx_=1):
    return {'as': as_, 'from': frm, 'prompt': prompt, 'min': mn_, 'max': mx_}
def trig(on, do, cond=None, once_per_turn=False, optional=False, text=''):
    t = {'on': on, 'do': do}
    if cond is not None: t['if'] = cond
    if once_per_turn: t['limit'] = {'per': 'turn', 'by': 'source'}
    if optional: t['optional'] = True
    if text: t['text'] = text
    return t
def abil(label, do, cost=None, req=None, targets=None, once=True, phases=('main',)):
    a = {'label': label, 'phases': list(phases), 'do': do}
    if cost: a['cost'] = cost
    if req: a['req'] = [{'if': r, 'why': w} for r, w in req]
    if targets: a['targets'] = targets
    if once: a['limit'] = {'per': 'turn', 'by': 'source'}
    return a
def at_start(do, cond=None, **k): return trig('refresh', do, AND(eq('$e.p', SELF_P), *([cond] if cond is not None else [])), **k)
def at_end(do, cond=None, **k): return trig('endturn', do, AND(eq('$e.p', SELF_P), *([cond] if cond is not None else [])), **k)
def on_win(do, cond=None, **k):
    """When this card's controller wins a mission (cond may test attacking('$self') etc.)."""
    return trig('missionResult', do, AND(eq('$e.p', SELF_P), eq('$e.ok', 1), *([cond] if cond is not None else [])), **k)
def on_defended(do, cond=None, **k):
    """When this card's controller defends successfully."""
    return trig('missionResult', do, AND(ne('$e.p', SELF_P), eq('$e.ok', 0), gt('$e.ndef', 0), *([cond] if cond is not None else [])), **k)
def on_played(pred, do, cond=None, **k):
    return trig('played', do, AND(eq('$e.p', SELF_P), pred, *([cond] if cond is not None else [])), **k)

# static terms ($o = operative, $a = 1 F / 2 T / 3 W)
def A_(a): return eq('$a', MA[a])
def self_term(name, a, n, cond=None): return Q(AND(isc('$o', name), A_(a), *([cond] if cond is not None else [])), n, 0)
def bearer_term(name, a, n, cond=None): return Q(AND(A_(a), *([cond] if cond is not None else [])), mul(gear_n('$o', name), n), 0)
def team_term(src, a, n, pred):
    """+n to attribute a for $o if its controller has `src` in play and pred($o) holds."""
    return Q(AND(A_(a), pred, own(src, ctrl('$o'))), mul(cnt(live(src, ctrl('$o'))), n), 0)

# ---------------------------------------------------------------- card constructors
def _card(name, typ_, faction, cost=None, text='', flavor='', kws=(), **x):
    c = {'id': slug(name), 'name': name, 'type': typ_, 'faction': faction, 'text': text, 'flavor': flavor}
    if cost is not None: c['cost'] = cost
    if kws: c['keywords'] = list(kws)
    if 'unique' in kws: c['maxCopies'] = 1
    c.update(x)
    CARDS.append(c)
    return c
def operative(name, faction, cost, f, t, w, hp, text='', flavor='', kws=(), **x):
    return _card(name, 'operative', faction, cost, text, flavor, kws, force=f, trade=t, will=w, hp=hp, **x)
def asset(name, faction, cost, text='', flavor='', kws=(), attach=0, bearerKw=0, **x):
    return _card(name, 'asset', faction, cost, text, flavor, kws, attach=attach, bearerKw=bearerKw, **x)
def facility(name, faction, cost, text='', flavor='', kws=(), **x): return _card(name, 'facility', faction, cost, text, flavor, kws, **x)
def operation(name, faction, cost, text='', flavor='', do=None, targets=None, req=None, kws=(), **x):
    return _card(name, 'operation', faction, cost, text, flavor, kws, op=op(do, targets, req, label=name), **x)
def response(name, faction, cost, text='', flavor='', do=None, targets=None, req=None, kws=(), **x):
    return _card(name, 'response', faction, cost, text, flavor, kws, resp=op(do, targets, req, label=name), **x)
def token_card(name, f, t, w, hp, kws=(), text='Token.'):
    return _card(name, 'operative', 'neutral', 0, text, '', ('token',) + tuple(kws), force=f, trade=t, will=w, hp=hp, maxCopies=0, rarity='T')

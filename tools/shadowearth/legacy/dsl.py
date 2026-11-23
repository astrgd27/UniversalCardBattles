"""DSL helpers for the Shadow Earth generator (S-expressions as Python lists)."""

def lit(x): return ['lit', x]
def g(o, k): return ['get', o, k]
def C(f, *a): return ['call', f, *a]
def eq(a, b): return ['=', a, b]
def ne(a, b): return ['!=', a, b]
def AND(*a): return ['and', *a]
def OR(*a): return ['or', *a]
def NOT(a): return ['not', a]
def IF(c, t, e=None): return ['if', c, t] + ([e] if e is not None else [])
def Q(c, a, b): return ['?', c, a, b]
def has(o, k): return ['has', o, k]
def flt(l, p): return ['filter', l, p]
def cnt(l): return ['count', l]
def inl(x, l): return ['in', x, l]
def ANY(l, p): return ['any', l, p]
def ALL(l, p): return ['all', l, p]
def SUM(l, e): return ['sum', l, e]
def add(*a): return ['+', *a]
def sub(a, b): return ['-', a, b]
def mul(a, b): return ['*', a, b]
def neg(a): return ['neg', a]
def mn(a, b): return ['min', a, b]
def mx(a, b): return ['max', a, b]
def ge(a, b): return ['>=', a, b]
def gt(a, b): return ['>', a, b]
def lt(a, b): return ['<', a, b]
def le(a, b): return ['<=', a, b]
def EACH(l, v, body): return ['each', l, v, body]
def LET(v, e): return ['let', v, e]
def SET(r, k, v): return ['set', r, k, v]
def INC(r, k, d): return ['inc', r, k, d]
def first(l): return ['first', l]
def isObj(x): return ['isObj', x]
def emit(_type, to=None, **d): return ['emit', _type, {k.rstrip('_'): v for k, v in d.items()}] + ([{'to': to}] if to is not None else [])
def choose(frm, as_, prompt, mn_=1, mx_=1, who=None):
    o = {'from': frm, 'as': as_, 'prompt': prompt, 'min': mn_, 'max': mx_}
    if who is not None: o['who'] = who
    return ['choose', o]
def opts(*names): return lit(list(names))

// Strict JSON parser that records the source offset of every value (by JSON pointer) for line:col errors.
import { PackageError } from './zip.ts';

export interface Parsed { value: any; pos: Map<string, number>; text: string }
const MAX_DEPTH = 256;

export function lineCol(text: string, off: number): [number, number] {
  let line = 1;
  let last = -1;
  for (let i = 0; i < off && i < text.length; i++) if (text.charCodeAt(i) === 10) { line++; last = i; }
  return [line, off - last];
}
const esc = (k: string) => k.replace(/~/g, '~0').replace(/\//g, '~1');
const NUM = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseJson(text: string, file: string): Parsed {
  const pos = new Map<string, number>();
  let i = 0;
  const fail = (msg: string, at = i): never => {
    const [l, c] = lineCol(text, at);
    throw new PackageError([`${file}:${l}:${c}: invalid JSON (${msg})`]);
  };
  const ws = () => { while (i < text.length && ' \t\n\r'.includes(text[i])) i++; };
  const str = (): string => {
    const s = i++;
    for (; i < text.length; i++) {
      const ch = text.charCodeAt(i);
      if (ch === 34) { i++; return JSON.parse(text.slice(s, i)); }
      if (ch === 92) i++;
      else if (ch < 32) fail('control character in string');
    }
    return fail('unterminated string', s);
  };
  const val = (ptr: string, depth: number): any => {
    if (depth > MAX_DEPTH) fail('nesting too deep');
    ws();
    pos.set(ptr, i);
    const c = text[i];
    if (c === '{') {
      i++;
      const o: Record<string, any> = {};
      ws();
      if (text[i] === '}') { i++; return o; }
      for (;;) {
        ws();
        if (text[i] !== '"') fail('expected a property name');
        const kAt = i;
        const k = str();
        if (k === '__proto__' || k === 'constructor' || k === 'prototype') fail(`forbidden key "${k}"`, kAt);
        if (Object.prototype.hasOwnProperty.call(o, k)) fail(`duplicate key "${k}"`, kAt);
        ws();
        if (text[i++] !== ':') fail('expected ":"', i - 1);
        o[k] = val(`${ptr}/${esc(k)}`, depth + 1);
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === '}') { i++; return o; }
        fail('expected "," or "}"');
      }
    }
    if (c === '[') {
      i++;
      const a: any[] = [];
      ws();
      if (text[i] === ']') { i++; return a; }
      for (;;) {
        a.push(val(`${ptr}/${a.length}`, depth + 1));
        ws();
        if (text[i] === ',') { i++; continue; }
        if (text[i] === ']') { i++; return a; }
        fail('expected "," or "]"');
      }
    }
    if (c === '"') return str();
    for (const [lit, v] of [['true', true], ['false', false], ['null', null]] as const) {
      if (text.startsWith(lit, i)) { i += lit.length; return v; }
    }
    NUM.lastIndex = i;
    const m = NUM.exec(text);
    if (m) { i += m[0].length; return Number(m[0]); }
    return fail(i >= text.length ? 'unexpected end of input' : `unexpected character "${c}"`);
  };
  const value = val('', 0);
  ws();
  if (i < text.length) fail('unexpected content after the JSON value');
  return { value, pos, text };
}

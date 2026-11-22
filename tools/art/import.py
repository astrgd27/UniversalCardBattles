#!/usr/bin/env python3
"""Imports artwork into a bundled module: matches files to cards, resizes, converts to WebP.

    python3 tools/art/import.py nightfall <folder-or-files...> [--full] [--dry]

Matching (case-insensitive, by file name): collector number ("NF-012", "nf012", "012"), card id ("the-velvet-club"),
or card name ("The Velvet Club"). Special names: "back" (card back), "pack-<booster>" / "<booster name>" (booster
art), "deck-<deck id>" (starter deck box art).
  default : art for the card's picture window -> assets/cards/<id>.webp (600 px wide)
  --full  : finished full-card images          -> assets/full/<id>.webp  (750 x 1050)
Unmatched files are listed and left alone. Re-running replaces earlier imports.
"""
import json, os, re, sys
from PIL import Image, ImageOps

ROOT = os.path.join(os.path.dirname(__file__), '..', '..', 'packages', 'reference-games')
EXT = ('.png', '.jpg', '.jpeg', '.webp', '.avif', '.gif', '.bmp', '.tif', '.tiff')
slug = lambda s: re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')

def main(argv):
    mod, srcs = argv[0], [a for a in argv[1:] if not a.startswith('--')]
    full, dry = '--full' in argv, '--dry' in argv
    base = os.path.join(ROOT, mod)
    cards = json.load(open(os.path.join(base, 'cards.json')))
    decks = json.load(open(os.path.join(base, 'decks.json')))
    camp_path = os.path.join(base, 'campaign', 'campaign.json')
    boosters = json.load(open(camp_path)).get('boosters', {}) if os.path.exists(camp_path) else {}
    keys = {}
    for c in cards:
        if c.get('maxCopies') == 0 and c['type'] != 'district' and c.get('num', '').startswith('NF-T') is False: pass
        for k in {c['id'], slug(c['name']), slug(c['name'].split(',')[0])}: keys.setdefault(k, ('card', c['id']))
        n = str(c.get('num', ''))
        if n and not c['id'].endswith('-fallen'):
            d = re.sub(r'\D', '', n)
            for k in {slug(n), n.lower().replace('-', ''), d, d.lstrip('0')}: keys.setdefault(k, ('card', c['id']))
    for b, v in boosters.items():
        for k in {b, slug(v['name']), 'pack-' + b, 'pack-' + slug(v['name'])}: keys[k] = ('pack', b)
    for d in decks:
        keys['deck-' + d] = ('deck', d)
    keys['back'] = keys['card-back'] = ('back', 'back')

    files = []
    for s in srcs:
        if os.path.isdir(s): files += [os.path.join(s, f) for f in sorted(os.listdir(s)) if f.lower().endswith(EXT)]
        elif s.lower().endswith(EXT): files.append(s)
    done, missed = [], []
    for f in files:
        stem = slug(os.path.splitext(os.path.basename(f))[0])
        hit = keys.get(stem)
        if not hit:  # try the longest known key contained in the file name (e.g. "NF-012 The Velvet Club final")
            cands = [k for k in keys if len(k) >= 3 and re.search(rf'(^|-){re.escape(k)}(-|$)', stem)]
            if cands: hit = keys[max(cands, key=len)]
        if not hit: missed.append(f); continue
        kind, ident = hit
        if kind == 'card': out, size = (f'assets/full/{ident}.webp', (750, 1050)) if full else (f'assets/cards/{ident}.webp', (600, None))
        elif kind == 'back': out, size = 'assets/back.webp', (750, 1050)
        elif kind == 'pack': out, size = f'assets/packs/{ident}.webp', (600, None)
        else: out, size = f'assets/decks/{ident}.webp', (600, None)
        done.append((f, out))
        if dry: continue
        img = ImageOps.exif_transpose(Image.open(f)).convert('RGB')
        if size[1]: img = ImageOps.fit(img, size, Image.LANCZOS)
        elif img.width > size[0]: img = img.resize((size[0], round(img.height * size[0] / img.width)), Image.LANCZOS)
        dest = os.path.join(base, out)
        os.makedirs(os.path.dirname(dest), exist_ok=True)
        img.save(dest, 'WEBP', quality=82, method=6)
    for f, o in done: print(f'  {os.path.basename(f)} -> {o}')
    if missed: print('unmatched (rename to a card name, id or collector number):\n  ' + '\n  '.join(os.path.basename(m) for m in missed))
    print(f'{len(done)} imported, {len(missed)} unmatched{" (dry run)" if dry else ""}')

if __name__ == '__main__':
    if len(sys.argv) < 3: print(__doc__); sys.exit(1)
    main(sys.argv[1:])

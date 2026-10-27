#!/usr/bin/env python3
"""
Belot asset pipeline.

Slices the raw pixel-art source packs in the project root into the runtime layout
under packages/client/public/assets and writes the skin manifest.

Run from anywhere:  python3 -I scripts/build_assets.py

Sources (project root):
  ClassicCards/                    classic light + dark sheets, pips, backsides
  Custom skins/<Name>Cards/        themed sheets, Pips/, Backside(s)/
  Backgrounds/_backgrounds/        small tileable desk textures
  Bars&Buttons-Asset/              UI sprite sheet (Apollo palette)
  Player Avatars/                  Mana Seed farmer paper-doll sample (optional)

Card sheets are 311x143: 13 cols x 4 rows of 23x35 cards with 1px gutters.
Columns: A,2..10,J,Q,K.  Rows: Hearts, Spades, Clubs, Diamonds (custom skins use the
same row order; the pip that replaces each suit is verified by template matching).
All sprites are kept at native resolution; the client scales them with integer
factors and `image-rendering: pixelated`.
"""
from __future__ import annotations

import json
import re
import shutil
import sys
from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
OUT = ROOT / 'packages' / 'client' / 'public' / 'assets'

CARD_W, CARD_H, PITCH_X, PITCH_Y = 23, 35, 24, 36
COLS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K']
BELOT_RANKS = ['7', '8', '9', '10', 'J', 'Q', 'K', 'A']
ROW_SUITS = ['H', 'S', 'C', 'D']  # sheet row order
SUIT_NAME = {'S': 'spades', 'H': 'hearts', 'D': 'diamonds', 'C': 'clubs'}

# id, folder, sheet, blank card, backs folder, default back, pip file per suit (+EN/BG labels),
# names, background file, price (EUR cents)
SKINS = [
    dict(
        id='default', src='ClassicCards', sheet='ClassicCards.png', blank='ClassicLightCard.png',
        backs='Backsides', default_back='LightClassic', bg='ClassicBackground.png', price=0,
        name={'en': 'Classic', 'bg': 'Класически'},
        pips={'H': ('Hearts', 'Hearts', 'Купа'), 'S': ('Spades', 'Spades', 'Пика'),
              'C': ('Clubs', 'Clubs', 'Спатия'), 'D': ('Diamonds', 'Diamonds', 'Каро')},
    ),
    dict(
        id='classic-dark', src='ClassicCards', sheet='ClassicCardsDark.png', blank='ClassicDarkCard.png',
        backs='Backsides', default_back='DarkClassic', bg='ClassicBackground.png', price=0,
        name={'en': 'Classic Dark', 'bg': 'Класически тъмен'},
        pips={'H': ('Hearts', 'Hearts', 'Купа'), 'S': ('Spades', 'Spades', 'Пика'),
              'C': ('Clubs', 'Clubs', 'Спатия'), 'D': ('Diamonds', 'Diamonds', 'Каро')},
    ),
    dict(
        id='fire', src='Custom skins/FireCards', sheet='FireCards.png', blank='Card.png',
        backs='Backside', default_back='DefaultFire', bg='FireBackground.png', price=199,
        name={'en': 'Fire', 'bg': 'Огън'},
        pips={'H': ('Flame', 'Flame', 'Пламък'), 'S': ('Explosion', 'Explosion', 'Експлозия'),
              'C': ('Grill', 'Grill', 'Скара'), 'D': ('Varning', 'Warning', 'Внимание')},
    ),
    dict(
        id='deco', src='Custom skins/DecoCards', sheet='DecoCards.png', blank='DecoCard.png',
        backs='Backsides', default_back='DecoDefault', bg='ArtDecoBackground.png', price=199,
        name={'en': 'Art Deco', 'bg': 'Арт деко'},
        pips={'H': ('Palm', 'Palm', 'Палма'), 'S': ('Feather', 'Feather', 'Перо'),
              'C': ('Building', 'Tower', 'Кула'), 'D': ('Pot', 'Vase', 'Ваза')},
    ),
    dict(
        id='fantasy', src='Custom skins/FantasyCards', sheet='FantasyCards.png', blank='Card.png',
        backs='Backsides', default_back='DefaultFantasy', bg='FantasyBackground.png', price=199,
        name={'en': 'Fantasy', 'bg': 'Фентъзи'},
        pips={'H': ('Sword', 'Sword', 'Меч'), 'S': ('Skull', 'Skull', 'Череп'),
              'C': ('Magic', 'Magic wand', 'Магия'), 'D': ('Shield', 'Shield', 'Щит')},
    ),
    dict(
        id='forest', src='Custom skins/ForestCards', sheet='ForestCards.png', blank='Card.png',
        backs='Backsides', default_back='DefaultForest', bg='ForestBackground.png', price=199,
        name={'en': 'Forest', 'bg': 'Гора'},
        pips={'H': ('Mushroom', 'Mushroom', 'Гъба'), 'S': ('Leaf', 'Leaf', 'Лист'),
              'C': ('Tree', 'Tree', 'Дърво'), 'D': ('Tulip', 'Tulip', 'Лале')},
    ),
    dict(
        id='geometric', src='Custom skins/GeometricCards', sheet='GeometricCards.png', blank='GeometricCard.png',
        backs='Backsides', default_back='GeometricDefault', bg='GeometricBackground.png', price=199,
        name={'en': 'Geometric', 'bg': 'Геометрия'},
        pips={'H': ('Squares', 'Square', 'Квадрат'), 'S': ('Circles', 'Circle', 'Кръг'),
              'C': ('Triangles', 'Triangle', 'Триъгълник'), 'D': ('Cross', 'Cross', 'Кръстче')},
    ),
    dict(
        id='nautical', src='Custom skins/NauticalCards', sheet='NauticalCards.png', blank='Card.png',
        backs='Backside', default_back='DefaultNautical', bg='NauticalBackground.png', price=199,
        name={'en': 'Nautical', 'bg': 'Морски'},
        pips={'H': ('Anchor', 'Anchor', 'Котва'), 'S': ('Clam', 'Clam', 'Мида'),
              'C': ('Boat', 'Boat', 'Лодка'), 'D': ('Buoy', 'Buoy', 'Шамандура')},
    ),
    dict(
        id='space', src='Custom skins/SpaceCards', sheet='SpaceCards.png', blank='Card.png',
        backs='Backside', default_back='DefaultSpace', bg='SpaceBackground.png', price=199,
        name={'en': 'Space', 'bg': 'Космос'},
        pips={'H': ('Sun', 'Sun', 'Слънце'), 'S': ('Moon', 'Moon', 'Луна'),
              'C': ('Star', 'Star', 'Звезда'), 'D': ('Orbit', 'Orbit', 'Орбита')},
    ),
]

BACKGROUND_NAMES = {
    'default': {'en': 'Classic Felt', 'bg': 'Класическо сукно'},
}


def slug(name: str) -> str:
    s = re.sub(r'(?<=[a-z0-9])(?=[A-Z])', '-', name)
    return re.sub(r'[^a-z0-9]+', '-', s.lower()).strip('-')


def card_at(sheet: Image.Image, col: int, row: int) -> Image.Image:
    x, y = col * PITCH_X, row * PITCH_Y
    return sheet.crop((x, y, x + CARD_W, y + CARD_H))


def pip_mask(pip: Image.Image) -> set[tuple[int, int]]:
    return {(x, y) for y in range(pip.height) for x in range(pip.width) if pip.getpixel((x, y))[3] > 0}


def locate_pip(card: Image.Image, blank: Image.Image, mask: set[tuple[int, int]], w: int, h: int):
    """Best (iou, ox, oy) placement of the pip silhouette over the pixels where the card differs
    from the blank card (searching the centre area so the rank glyphs don't interfere)."""
    diff = {(x, y) for y in range(CARD_H) for x in range(CARD_W) if card.getpixel((x, y)) != blank.getpixel((x, y))}
    best = (0.0, 0, 0)
    for oy in range(8, CARD_H - h - 6):
        for ox in range(2, CARD_W - w - 1):
            win = {(x - ox, y - oy) for (x, y) in diff if ox <= x < ox + w and oy <= y < oy + h}
            inter = len(win & mask)
            union = len(win | mask)
            iou = inter / union if union else 0
            if iou > best[0]:
                best = (iou, ox, oy)
    return best


def save(img: Image.Image, path: Path):
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, optimize=True)


def build_skins() -> list[dict]:
    manifest = []
    skins_root = OUT / 'skins'
    for d in [skins_root / 'default', skins_root / 'custom-skins']:
        if d.exists():
            shutil.rmtree(d)
    bg_out = OUT / 'backgrounds'
    if bg_out.exists():
        shutil.rmtree(bg_out)
    backgrounds = []
    seen_bg = set()

    for sk in SKINS:
        sid = sk['id']
        src = ROOT / sk['src']
        rel = 'default' if sid == 'default' else f'custom-skins/{sid}'
        out = skins_root / rel
        base_url = f'/assets/skins/{rel}'
        sheet = Image.open(src / sk['sheet']).convert('RGBA')
        assert sheet.size == (311, 143), (sid, sheet.size)
        blank = Image.open(src / sk['blank']).convert('RGBA')

        # --- faces
        for r, suit in enumerate(ROW_SUITS):
            for c, rank in enumerate(COLS):
                if rank in BELOT_RANKS:
                    save(card_at(sheet, c, r), out / 'cards' / f'{rank}_{SUIT_NAME[suit]}.png')
        save(blank, out / 'cards' / 'blank.png')

        # --- pips: verify mapping by template matching against the Ace of each row
        pip_dir = src / 'Pips'
        pip_files = {p.stem: p for p in pip_dir.glob('*.png')}
        suit_icons = {}
        report = []
        for r, suit in enumerate(ROW_SUITS):
            ace = card_at(sheet, 0, r)
            scores = []
            for stem, p in pip_files.items():
                pim = Image.open(p).convert('RGBA')
                m = pip_mask(pim)
                iou, ox, oy = locate_pip(ace, blank, m, pim.width, pim.height)
                scores.append((iou, stem, ox, oy, pim, m))
            scores.sort(key=lambda s: -s[0])
            iou, stem, ox, oy, pim, m = scores[0]
            expected, label_en, label_bg = sk['pips'][suit]
            if stem != expected:
                sys.exit(f'[{sid}] pip mismatch for {suit}: matched {stem} ({iou:.2f}), expected {expected}')
            report.append(f'{SUIT_NAME[suit]}={stem}({iou:.2f})')
            # coloured icon: the card's own pixels under the pip silhouette
            icon = Image.new('RGBA', pim.size, (0, 0, 0, 0))
            for (x, y) in m:
                icon.putpixel((x, y), ace.getpixel((ox + x, oy + y)))
            save(icon, out / 'suit-icons' / f'{SUIT_NAME[suit]}.png')
            suit_icons[suit] = {
                'path': f'{base_url}/suit-icons/{SUIT_NAME[suit]}.png',
                'label': label_en,
                'labels': {'en': label_en, 'bg': label_bg},
            }
        print(f'  {sid:13s} ' + ' '.join(report))

        # --- backs
        backs = []
        back_files = sorted((src / sk['backs']).glob('*.png'))
        if sid == 'classic-dark':
            back_files = [b for b in back_files if b.stem.startswith('Dark')]
        elif sid == 'default':
            back_files = [b for b in back_files if b.stem.startswith('Light')] + \
                         [b for b in back_files if not b.stem.startswith('Light')]
        default_back_id = None
        for b in back_files:
            im = Image.open(b).convert('RGBA')
            assert im.size == (CARD_W, CARD_H), (b, im.size)
            s = slug(b.stem)
            bid = f'{sid}/{s}'
            save(im, out / 'backs' / f'{s}.png')
            backs.append({'id': bid, 'path': f'{base_url}/backs/{s}.png', 'name': b.stem})
            if b.stem == sk['default_back']:
                default_back_id = bid
                save(im, out / 'cards' / 'back.png')
        assert default_back_id, (sid, 'default back missing')

        # --- background
        bg_name = 'default-desk' if sk['bg'] == 'ClassicBackground.png' else sid
        bg_url = f'/assets/backgrounds/{bg_name}.png'
        if bg_name not in seen_bg:
            seen_bg.add(bg_name)
            bim = Image.open(ROOT / 'Backgrounds' / '_backgrounds' / sk['bg']).convert('RGBA')
            save(bim, bg_out / f'{bg_name}.png')
            backgrounds.append({
                'id': 'default' if bg_name == 'default-desk' else sid,
                'path': bg_url,
                'width': bim.width,
                'height': bim.height,
                'name': BACKGROUND_NAMES.get('default' if bg_name == 'default-desk' else sid, sk['name']),
                'skinId': sid,
                'priceEurCents': sk['price'],
            })

        manifest.append({
            'id': sid,
            'name': sk['name']['en'],
            'names': sk['name'],
            'basePath': base_url,
            'suitIcons': suit_icons,
            'backs': backs,
            'defaultBack': default_back_id,
            'background': bg_url,
            'backgroundId': 'default' if bg_name == 'default-desk' else sid,
            'preview': f'{base_url}/cards/A_hearts.png',
            'priceEurCents': sk['price'],
        })

    save_json(skins_root / 'manifest.json', manifest)
    save_json(bg_out / 'manifest.json', backgrounds)
    return manifest


def save_json(path: Path, data):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')


# ----------------------------------------------------------------------------- UI sprites

def hexrgb(h: str) -> tuple[int, int, int]:
    return tuple(int(h[i:i + 2], 16) for i in (1, 3, 5))  # type: ignore[return-value]


# roles in the green button: top highlight, light, face, shade, side
GREEN_ROLES = ['#d0da91', '#a8ca58', '#75a743', '#468232', '#25562e']
BUTTON_PALETTES = {
    'green': GREEN_ROLES,
    'blue': ['#a4dddb', '#73bed3', '#4f8fba', '#3c5e8b', '#253a5e'],
    'orange': ['#e8c170', '#de9e41', '#da863e', '#be772b', '#884b2b'],
    'red': ['#df84a5', '#cf573c', '#a53030', '#752438', '#411d31'],
    'dark': ['#a8b5b2', '#819796', '#577277', '#394a50', '#151d28'],
}


def recolor(img: Image.Image, src_roles: list[str], dst_roles: list[str]) -> Image.Image:
    lut = {hexrgb(s): hexrgb(d) for s, d in zip(src_roles, dst_roles)}
    out = img.copy()
    px = out.load()
    for y in range(out.height):
        for x in range(out.width):
            r, g, b, a = px[x, y]
            if a and (r, g, b) in lut:
                px[x, y] = (*lut[(r, g, b)], a)
    return out


def pressed_from(up: Image.Image) -> Image.Image:
    """Synthesise the pressed state of the plain (icon-less) button the same way the sheet's
    icon buttons do it: the face sinks 2px and the front side shrinks to one row."""
    w, h = up.size
    down = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    # face rows 1..10 (incl. the light lip on row 10) move to 3..12
    down.paste(up.crop((0, 1, w, 11)), (0, 3))
    # sides of the frame continue from row 5 downwards
    for y in range(5, 13):
        for x in (1, w - 2):
            if down.getpixel((x, y))[3] == 0:
                down.putpixel((x, y), up.getpixel((x, 7)))
    # rounded side row + bottom border
    down.paste(up.crop((0, 13, w, 15)), (0, 13))
    return down


def build_ui():
    src = ROOT / 'Bars&Buttons-Asset'
    out = OUT / 'ui'
    if out.exists():
        shutil.rmtree(out)
    sheet = Image.open(src / 'Bars and Buttons.png').convert('RGBA')
    save(sheet, out / 'bars-and-buttons.png')
    up_green = sheet.crop((0, 0, 16, 16))
    down_green = pressed_from(up_green)
    for name, pal in BUTTON_PALETTES.items():
        up = recolor(up_green, GREEN_ROLES, pal)
        down = recolor(down_green, GREEN_ROLES, pal)
        save(up, out / 'buttons' / f'{name}.png')
        save(down, out / 'buttons' / f'{name}-pressed.png')
    # toggles (knob left = off, knob right = on); rows: green 3, red 4, blue 5
    def cell(col, row):
        return sheet.crop((col * 16, row * 16, col * 16 + 16, row * 16 + 16))
    for row, color in [(3, 'green'), (4, 'red'), (5, 'blue')]:
        for col, state in [(0, 'off'), (1, 'on')]:
            c = cell(col, row)
            save(c.crop(c.getbbox()), out / 'toggles' / f'{color}-{state}.png')
    # icons used around the UI (heart etc.)
    heart = cell(0, 10)
    save(heart.crop(heart.getbbox()), out / 'icons' / 'heart.png')
    print('  ui: buttons x', len(BUTTON_PALETTES), '+ toggles + sheet')


# ----------------------------------------------------------------------------- avatars

def build_avatars():
    base = ROOT / 'Player Avatars' / 'farmer base sheets'
    out = OUT / 'avatars'
    if not base.exists():
        print('  avatars: source missing, skipped')
        return
    if out.exists():
        shutil.rmtree(out)

    HAIR = ['#503850', '#686878', '#8898a0', '#c8c8b8', '#f8f0e0']
    R3 = ['#205040', '#289860', '#58e0a0']
    R4 = ['#5b2a54', '#b7437b', '#d76ea2', '#fab6c1']
    ramps = {
        'brown': ['#2e1c1c', '#4a2c24', '#7a4a30', '#a87048', '#d0a070'],
        'blonde': ['#6a4a30', '#9a7040', '#c8a050', '#e8d070', '#f8f0b0'],
        'black': ['#16161e', '#262634', '#3a3a4c', '#5a5a70', '#8a8aa0'],
        'ginger': ['#5a2418', '#8a3a20', '#c05a28', '#e08840', '#f0c070'],
        'red': ['#6a2030', '#a53030', '#e06048'],
        'blue': ['#253a5e', '#3c5e8b', '#73bed3'],
        'green': ['#25562e', '#468232', '#a8ca58'],
        'purple': ['#402751', '#7a367b', '#c65197'],
        'denim': ['#1e2440', '#30487a', '#5078b0'],
        'khaki': ['#4a3a28', '#7a6440', '#b09868'],
        'boots': ['#2a1c18', '#5a3828', '#8a5a38'],
        'hat': ['#3a2214', '#6a4024', '#9a6a3a', '#c8a060'],
    }

    def layer(rel, ramp=None):
        img = Image.open(base / rel).convert('RGBA').crop((0, 0, 64, 64))  # cell 0: idle, facing down
        if ramp:
            dst = ramps[ramp]
            src = HAIR if len(dst) == 5 else R3 if len(dst) == 3 else R4
            img = recolor(img, src, dst)
            if ramp == 'hat':  # the hat band uses the 3-colour ramp
                img = recolor(img, R3, ramps['red'])
        return img

    body = ('01body/fbas_1body_human_00.png', None)
    shirt = '05shrt/fbas_05shrt_shortshirt_00a.png'
    shirt_b = '05shrt/fbas_05shrt_shortshirtboobs_00a.png'
    pants = '04lwr1/fbas_04lwr1_longpants_00a.png'
    shoes = '03fot1/fbas_03fot1_shoes_00a.png'
    dapper = '13hair/fbas_13hair_dapper_00a.png'
    bob = '13hair/fbas_13hair_bob1_00a.png'
    hat = '14head/fbas_14head_cowboyhat_00d.png'
    combos = {
        'farmer-dapper': [body, (shoes, 'boots'), (pants, 'denim'), (shirt, 'red'), (dapper, 'brown')],
        'farmer-bob': [body, (shoes, 'boots'), (pants, 'khaki'), (shirt_b, 'blue'), (bob, 'blonde')],
        'farmer-cowboy': [body, (shoes, 'boots'), (pants, 'denim'), (shirt, 'green'), (dapper, 'black'), (hat, 'hat')],
        'farmer-cowgirl': [body, (shoes, 'boots'), (pants, 'denim'), (shirt_b, 'purple'), (bob, 'ginger'), (hat, 'hat')],
    }
    ids = []
    for name, layers in combos.items():
        img = Image.new('RGBA', (64, 64), (0, 0, 0, 0))
        for rel, ramp in layers:
            img.alpha_composite(layer(rel, ramp))
        bb = img.getbbox()
        if not bb:
            continue
        # square crop around the upper body (head + torso) -> 32x32 portrait
        cx = (bb[0] + bb[2]) // 2
        top = bb[1] - 1
        portrait = img.crop((cx - 16, top, cx + 16, top + 32))
        save(portrait, out / f'{name}.png')
        save(img.crop(bb), out / 'full' / f'{name}.png')
        ids.append({'id': name, 'path': f'/assets/avatars/{name}.png', 'full': f'/assets/avatars/full/{name}.png'})
    save_json(out / 'manifest.json', ids)
    print('  avatars:', ', '.join(i['id'] for i in ids))


def main():
    print('Building skins ...')
    build_skins()
    print('Building UI sprites ...')
    build_ui()
    print('Building avatars ...')
    build_avatars()
    print('Done ->', OUT)


if __name__ == '__main__':
    main()

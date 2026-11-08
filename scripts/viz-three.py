"""把 debug/viz.json 画成对照图：底图 + 起点 + 可走点（带编号）+ 连线。

用法：python scripts/viz-three.py [输入.json] [输出.png]  →  默认 debug/viz.png
"""
import json
import sys

from PIL import Image, ImageDraw, ImageFont

FONT = None
NUM_FONT = None
for path in ('C:/Windows/Fonts/msyh.ttc', 'C:/Windows/Fonts/simhei.ttf'):
    try:
        FONT = ImageFont.truetype(path, 26)
        NUM_FONT = ImageFont.truetype(path, 20)
        break
    except OSError:
        continue

src = sys.argv[1] if len(sys.argv) > 1 else 'debug/viz.json'
dst = sys.argv[2] if len(sys.argv) > 2 else 'debug/viz.png'

data = json.load(open(src, encoding='utf-8'))
nodes = json.load(open('debug/three-nodes.json', encoding='utf-8'))['nodes']
base = Image.open('picture/三人地图.png').convert('RGB')

SCALE = 0.52
W = int(1023 * SCALE)
H = int(980 * SCALE)
TITLE = 44
GAP = 10


def draw_panel(sc):
    im = base.copy().resize((W, H), Image.LANCZOS)
    d = ImageDraw.Draw(im)
    px, py = nodes[sc['from']]
    targets = sorted(sc['targets'], key=lambda t: (nodes[t][1], nodes[t][0]))
    for t in targets:
        tx, ty = nodes[t]
        d.line([(px * SCALE, py * SCALE), (tx * SCALE, ty * SCALE)], fill=(0, 120, 200), width=1)
    for i, t in enumerate(targets, 1):
        tx, ty = nodes[t]
        x, y = tx * SCALE, ty * SCALE
        d.ellipse([x - 7, y - 7, x + 7, y + 7], fill=(20, 160, 110), outline=(255, 255, 255))
        if NUM_FONT:
            d.text((x + 9, y - 12), str(i), font=NUM_FONT, fill=(20, 90, 60))
    for p in sc['pieces']:
        x, y = nodes[p['node']]
        x, y = x * SCALE, y * SCALE
        color = (190, 45, 35) if p['team'] == 'red' else ((40, 40, 48) if p['team'] == 'black' else (120, 90, 50))
        d.ellipse([x - 9, y - 9, x + 9, y + 9], fill=color, outline=(255, 255, 255), width=2)
    x, y = px * SCALE, py * SCALE
    d.ellipse([x - 13, y - 13, x + 13, y + 13], outline=(250, 190, 0), width=3)
    return im


panels = [draw_panel(sc) for sc in data['scenarios']]
total_w = GAP * (len(panels) + 1) + W * len(panels)
canvas = Image.new('RGB', (total_w, H + TITLE + GAP), (26, 26, 30))
d = ImageDraw.Draw(canvas)
x = GAP
for sc, im in zip(data['scenarios'], panels):
    if FONT:
        d.text((x + 6, 10), sc['title'], font=FONT, fill=(235, 235, 240))
    canvas.paste(im, (x, TITLE))
    x += W + GAP

canvas.save(dst)
print('saved', dst, canvas.size)

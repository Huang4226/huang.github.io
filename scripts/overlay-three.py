"""把当前模型的交点画到三人地图上，人工核对偏差。

用法：
  python scripts/overlay-three.py                # 用 src/topology/three.ts 里的仿射
  python scripts/overlay-three.py debug/snapped.json  # 用标定后的坐标表
"""
import json
import sys

import numpy as np
from PIL import Image, ImageDraw

IMG = 'picture/三人地图.png'
FILES, RANKS = 9, 5
AFFINE = [
    (72.8617, 0.0197, 255.89, -0.0038, -66.5486, 874.54),
    (36.4436, -53.8537, 706.11, 63.1179, 31.0042, 103.99),
    (-37.2442, 53.6639, 317.37, 62.6546, 30.6386, 105.26),
]


def affine_nodes():
    out = []
    for s in range(3):
        a1, a2, c1, b1, b2, c2 = AFFINE[s]
        for r in range(RANKS):
            for f in range(FILES):
                out.append((a1 * f + a2 * r + c1, b1 * f + b2 * r + c2))
    return out


def main():
    src = sys.argv[1] if len(sys.argv) > 1 else None
    if src:
        data = json.load(open(src, encoding='utf-8'))
        pts = [(p[0], p[1]) for p in data['nodes']]
        tag = 'snapped'
    else:
        pts = affine_nodes()
        tag = 'affine'

    im = Image.open(IMG).convert('RGB')
    d = ImageDraw.Draw(im)
    # 网格连线（同翼相邻）
    for s in range(3):
        for r in range(RANKS):
            for f in range(FILES):
                i = s * FILES * RANKS + r * FILES + f
                if f + 1 < FILES:
                    j = i + 1
                    d.line([pts[i], pts[j]], fill=(0, 90, 255), width=1)
                if r + 1 < RANKS:
                    j = i + FILES
                    d.line([pts[i], pts[j]], fill=(0, 90, 255), width=1)
    for i, (x, y) in enumerate(pts):
        d.ellipse([x - 3, y - 3, x + 3, y + 3], outline=(220, 0, 0), width=2)
        d.point([x, y], fill=(220, 0, 0))
    out = 'debug/overlay-%s.png' % tag
    im.save(out)
    print('saved', out)


main()

"""三人地图标定 · 第一步：找出 96 个格子的中心，并排出 (翼, 列, 行)。

做法：
 1. 泛洪：底图背景是浅色，格子内部是一整块浅色连通域（比直线检测稳得多）；
 2. 每个翼的 32 个格子用"最近邻 + 有向步进"的 BFS 排出 8 列 × 4 行
    （跨河方向的距离大于同翼间距，且按列/行方向分类，不会串翼）。

输出 debug/cells.json、debug/cellmap.json（键 "翼,列,行"）。

用法：python scripts/calib-three.py
"""
import json
from collections import deque

import numpy as np
from PIL import Image

IMG = 'picture/三人地图.png'
FILES, RANKS = 9, 5

# 每翼本方底角（f=0,r=0 的格子就在这个角上），用来定 BFS 起点
CORNER = [(281.0, 907.0), (741.0, 113.0), (281.0, 113.0)]
# 每翼列/行方向的近似单位（只取方向，量值不求准）
BASIS = [(1.0, 0.0, 0.0, -1.0), (0.5, 0.87, -0.87, 0.5), (-0.5, 0.87, 0.87, 0.5)]
CENTER = np.array([511.0, 511.0])


def find_cells():
    im = np.array(Image.open(IMG).convert('L'))
    light = im[::2, ::2] > 150  # 下采样一半，泛洪更快
    H, W = light.shape
    seen = np.zeros((H, W), dtype=bool)
    out = []
    for y in range(1, H - 1):
        for x in range(1, W - 1):
            if not light[y, x] or seen[y, x]:
                continue
            seen[y, x] = True
            q = deque([(y, x)])
            px = []
            while q:
                cy, cx = q.popleft()
                px.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and light[ny, nx] and not seen[ny, nx]:
                        seen[ny, nx] = True
                        q.append((ny, nx))
            if 60 <= len(px) <= 3000:
                ys = [p[0] for p in px]
                xs = [p[1] for p in px]
                out.append([sum(xs) / len(xs) * 2, sum(ys) / len(ys) * 2])
    return np.array(out)


def sector_of(p):
    ang = np.degrees(np.arctan2(p[1] - CENTER[1], p[0] - CENTER[0]))
    if 30 < ang < 150:
        return 0
    if -90 < ang <= 30:
        return 1
    return 2


def lattice(cells):
    out = {}
    for s in range(3):
        pts = np.array([c for c in cells if sector_of(c) == s])
        uf = np.array(BASIS[s][:2])
        ur = np.array(BASIS[s][2:])
        step_len = 65.0
        uf = uf / np.linalg.norm(uf) * step_len
        ur = ur / np.linalg.norm(ur) * step_len
        seed = int(np.argmin(np.hypot(*(pts - np.array(CORNER[s])).T)))

        # 每个方向上取"落点最接近理想步长"的邻居
        step = {}
        for i, p in enumerate(pts):
            for df, dr in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                want = p + df * uf + dr * ur
                d = np.hypot(*(pts - want).T)
                d[i] = 1e9
                j = int(np.argmin(d))
                if d[j] < 45:
                    step[(i, df, dr)] = j

        idx = {seed: (0, 0)}
        queue = [seed]
        while queue:
            p = queue.pop(0)
            f, r = idx[p]
            for (i, df, dr), q in step.items():
                if i != p:
                    continue
                nf, nr = f + df, r + dr
                if not (0 <= nf < FILES - 1 and 0 <= nr < RANKS - 1):
                    continue
                if q in idx or (nf, nr) in idx.values():
                    continue
                idx[q] = (nf, nr)
                queue.append(q)
        print('wing %d: cells=%d assigned=%d' % (s, len(pts), len(idx)))
        for i, (f, r) in idx.items():
            out[(s, f, r)] = pts[i]
    return out


def main():
    cells = find_cells()
    print('cells:', len(cells))
    json.dump([list(map(float, c)) for c in cells], open('debug/cells.json', 'w'))
    cm = lattice(cells)
    json.dump({'%d,%d,%d' % k: list(map(float, v)) for k, v in cm.items()},
              open('debug/cellmap.json', 'w'), indent=1)
    print('saved debug/cellmap.json (%d cells)' % len(cm))


main()

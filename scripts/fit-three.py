"""从图上抠出格子中心，按当前模型归类到 (f,r)，再做最小二乘拟合出每家的仿射矩阵。"""
import json
import math
from collections import deque

import numpy as np
from PIL import Image

im = np.array(Image.open('picture/三人地图.png').convert('L'))
light = im[::2, ::2] > 150
H, W = light.shape
labels = np.zeros((H, W), dtype=np.int32)
centers = []
cur = 0
for y in range(1, H - 1):
    for x in range(1, W - 1):
        if light[y, x] and labels[y, x] == 0:
            cur += 1
            q = deque([(y, x)])
            labels[y, x] = cur
            px = []
            while q:
                cy, cx = q.popleft()
                px.append((cy, cx))
                for dy, dx in ((1, 0), (-1, 0), (0, 1), (0, -1)):
                    ny, nx = cy + dy, cx + dx
                    if 0 <= ny < H and 0 <= nx < W and light[ny, nx] and labels[ny, nx] == 0:
                        labels[ny, nx] = cur
                        q.append((ny, nx))
            if 60 <= len(px) <= 3000:
                ys = [p[0] for p in px]
                xs = [p[1] for p in px]
                centers.append((sum(xs) / len(xs) * 2, sum(ys) / len(ys) * 2))

print('cell centers:', len(centers))

topo = json.load(open('debug/three.json', encoding='utf-8'))
nodes = {n['id']: n for n in topo['nodes']}


def node_at(s, f, r):
    for n in topo['nodes']:
        if n['wing'] == s and n['file'] == f and n['rank'] == r:
            return n
    return None


# 每个阵营的模型格点（用当前模型当作"近似坐标"，只用来分配 (f,r)）
def model_pt(s, f, r):
    n = node_at(s, f, r)
    return (n['x'], n['y'])


rows = []
for cx, cy in centers:
    best = None
    for s in range(3):
        for r in range(4):
            for f in range(8):
                ax, ay = model_pt(s, f, r)
                bx, by = model_pt(s, f + 1, r + 1)
                mx, my = (ax + bx) / 2, (ay + by) / 2
                d = math.hypot(mx - cx, my - cy)
                if best is None or d < best[0]:
                    best = (d, s, f, r)
    if best and best[0] < 70:
        rows.append((best[1], best[2], best[3], cx, cy))

print('assigned:', len(rows))

out = {}
for s in range(3):
    pts = [(f, r, x, y) for (ss, f, r, x, y) in rows if ss == s]
    if len(pts) < 8:
        print('sector', s, 'too few cells', len(pts))
        continue
    A = np.array([[f + 0.5, r + 0.5, 1.0] for (f, r, _, _) in pts])
    X = np.array([x for (_, _, x, _) in pts])
    Y = np.array([y for (_, _, _, y) in pts])
    mx, _, _, _ = np.linalg.lstsq(A, X, rcond=None)
    my, _, _, _ = np.linalg.lstsq(A, Y, rcond=None)
    out[s] = {'ax': mx.tolist(), 'ay': my.tolist(), 'n': len(pts)}
    print('sector', s, 'cells', len(pts))
    print('   x = %.4f*f + %.4f*r + %.2f' % tuple(mx))
    print('   y = %.4f*f + %.4f*r + %.2f' % tuple(my))

json.dump(out, open('debug/affine.json', 'w'), indent=1)
print('saved debug/affine.json')

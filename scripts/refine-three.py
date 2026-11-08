"""三人地图：交点精修。

每个交点 = 它的几条"出边"所在墨线的交点。

 1. 初值：由 96 个格子中心各退半格取平均（scripts/calib-three.py 的 local_node）；
 2. 对每个交点，取到相邻交点的方向，在该方向上做 (角度 ±8°, 法向 ±12px) 搜索，
    找到最贴墨的那条线；
 3. 所有线做最小二乘求交，得到亚像素坐标。

输入/输出：debug/three-nodes.json
"""
import json
import sys

import numpy as np
from PIL import Image

FILES, RANKS = 9, 5
IMG = 'picture/三人地图.png'
CENTER = np.array([511.0, 511.0])

im = np.array(Image.open(IMG).convert('L')).astype(np.float32)
DARK = (255.0 - im) / 255.0
H, W = DARK.shape


def sample(px, py):
    x0 = np.floor(px).astype(int)
    y0 = np.floor(py).astype(int)
    ok = (x0 >= 0) & (y0 >= 0) & (x0 < W - 1) & (y0 < H - 1)
    x0 = np.clip(x0, 0, W - 2)
    y0 = np.clip(y0, 0, H - 2)
    fx, fy = px - x0, py - y0
    v = (DARK[y0, x0] * (1 - fx) * (1 - fy) + DARK[y0, x0 + 1] * fx * (1 - fy)
         + DARK[y0 + 1, x0] * (1 - fx) * fy + DARK[y0 + 1, x0 + 1] * fx * fy)
    return np.where(ok, v, 0.0)


def fit_line(p, d, sides):
    """在 p 附近找最贴墨的直线；返回 (点, 单位方向, 得分)。"""
    tau = np.arange(7.0, 25.0, 1.5)
    ts = np.concatenate([s * tau for s in sorted(sides)])
    best = (-1e9, None)
    for deg in np.arange(-8, 8.01, 1.0):
        a = np.deg2rad(deg)
        ca, sa = np.cos(a), np.sin(a)
        dd = np.array([d[0] * ca - d[1] * sa, d[0] * sa + d[1] * ca])
        nrm = np.array([-dd[1], dd[0]])
        for o in np.arange(-12.0, 12.01, 0.5):
            c = p + o * nrm
            pts = c[None, :] + ts[:, None] * dd[None, :]
            v = float(sample(pts[:, 0], pts[:, 1]).mean())
            if v > best[0]:
                best = (v, c, dd, o)
    return best


def refine(nodes, rounds=4):
    nb = [[] for _ in range(135)]
    for s in range(3):
        for r in range(RANKS):
            for f in range(FILES):
                i = s * 45 + r * FILES + f
                if f + 1 < FILES:
                    nb[i].append(i + 1)
                if f > 0:
                    nb[i].append(i - 1)
                if r + 1 < RANKS:
                    nb[i].append(i + FILES)
                if r > 0:
                    nb[i].append(i - FILES)

    for it in range(rounds):
        new = []
        moves = []
        for i, p in enumerate(nodes):
            dirs = []
            for j in nb[i]:
                d = nodes[j] - p
                n = np.hypot(*d)
                dirs.append(d / n)
            # 把方向聚成线
            lines = []  # [方向的代表, sides]
            for d in dirs:
                for L in lines:
                    c = float(d @ L[0])
                    if c < -0.85:
                        L[1].add(1 if c > 0 else -1)
                        break
                else:
                    lines.append([d, {1}])
            fits = []
            for d, sides in lines:
                sc, c, dd, o = fit_line(p, d, sides)
                if sc > 0.35:
                    fits.append((c, dd))
            if len(fits) < 2:
                new.append(p)
                continue
            # 最小二乘求交：min Σ ((q-c)·n)^2
            A = np.zeros((2, 2))
            b = np.zeros(2)
            for c, dd in fits:
                nrm = np.array([-dd[1], dd[0]])
                A += np.outer(nrm, nrm)
                b += nrm * (nrm @ c)
            q, *_ = np.linalg.lstsq(A, b, rcond=None)
            if np.hypot(*(q - p)) > 14:
                q = p + (q - p) / np.hypot(*(q - p)) * 14
            moves.append(float(np.hypot(*(q - p))))
            new.append(q)
        nodes = new
        m = np.array(moves) if moves else np.array([0.0])
        print('round %d: mean move %.2f  max %.2f' % (it, m.mean(), m.max()))
    return nodes


def build_init():
    """由格子中心各退半格求平均，作为初值。"""
    raw = json.load(open('debug/cellmap.json'))
    cm = {}
    for k, v in raw.items():
        s, f, r = map(int, k.split(','))
        cm[(s, f, r)] = np.array(v, dtype=float)

    def local(s, f, r):
        est = []
        for cf in (f - 1, f):
            for cr in (r - 1, r):
                if not (0 <= cf < FILES - 1 and 0 <= cr < RANKS - 1):
                    continue
                C = cm[(s, cf, cr)]
                if cf + 1 < FILES - 1 and cf - 1 >= 0:
                    uf = (cm[(s, cf + 1, cr)] - cm[(s, cf - 1, cr)]) / 2
                elif cf + 1 < FILES - 1:
                    uf = cm[(s, cf + 1, cr)] - C
                else:
                    uf = C - cm[(s, cf - 1, cr)]
                if cr + 1 < RANKS - 1 and cr - 1 >= 0:
                    ur = (cm[(s, cf, cr + 1)] - cm[(s, cf, cr - 1)]) / 2
                elif cr + 1 < RANKS - 1:
                    ur = cm[(s, cf, cr + 1)] - C
                else:
                    ur = C - cm[(s, cf, cr - 1)]
                est.append(C + (f - cf - 0.5) * uf + (r - cr - 0.5) * ur)
        return np.mean(est, axis=0)

    nodes = []
    for s in range(3):
        for r in range(RANKS):
            for f in range(FILES):
                nodes.append(local(s, f, r))
    return nodes


TS_HEAD = '''/**
 * 三人地图（1023×980）上 135 个交点的像素坐标。
 *
 * 由 scripts/refine-three.py 直接从底图墨线标定：先按 96 个格子中心各退半格
 * 取初值，再把每个交点吸附到它几条出边的墨线交点上（误差约 1px）。
 * 线条再歪也不影响：走法只看拓扑连接，不看像素。
 * 索引：id = s * 45 + r * 9 + f（s 为翼 0/1/2，f 为列 0–8，r 为行 0–4）。
 */
export const THREE_NODES: ReadonlyArray<readonly [number, number]> = [
'''

WING_NAME = ['红（下）', '黑（右上）', '白（左上）']


def write_ts(nodes):
    lines = [TS_HEAD.rstrip('\n')]
    for s in range(3):
        lines.append('  // %s' % WING_NAME[s])
        for r in range(RANKS):
            lines.append('  // r=%d' % r)
            row = nodes[s * 45 + r * FILES: s * 45 + r * FILES + 9]
            for i in range(0, 9, 3):
                lines.append('  ' + ' '.join('[%.1f, %.1f],' % (p[0], p[1]) for p in row[i:i + 3]))
    lines.append('];')
    with open('src/topology/three-coords.ts', 'w', encoding='utf-8', newline='\n') as fh:
        fh.write('\n'.join(lines) + '\n')


def main():
    nodes = build_init()
    json.dump({'box': {'w': 1023, 'h': 980}, 'nodes': [[float(a), float(b)] for a, b in nodes]},
              open('debug/three-init.json', 'w'), indent=1)
    nodes = refine(nodes)
    out = [[float(p[0]), float(p[1])] for p in nodes]
    json.dump({'box': {'w': 1023, 'h': 980}, 'nodes': out},
              open('debug/three-nodes.json', 'w'), indent=1)
    gaps = []
    for s in range(3):
        for r in range(RANKS):
            for f in range(FILES):
                i = s * 45 + r * FILES + f
                if f + 1 < FILES:
                    gaps.append(np.hypot(*(np.array(out[i + 1]) - np.array(out[i]))))
                if r + 1 < RANKS:
                    gaps.append(np.hypot(*(np.array(out[i + FILES]) - np.array(out[i]))))
    print('gaps: min=%.1f med=%.1f max=%.1f' % (min(gaps), float(np.median(gaps)), max(gaps)))
    write_ts(nodes)
    print('saved debug/three-nodes.json + src/topology/three-coords.ts')


main()

import type { GameState, Piece } from '../core/types';
import type { BoardNode, Topology } from '../topology/types';
import { ALL_PIECE_URLS, loadImage, spriteUrl } from './assets';

const MAX_SCALE = 1.2;
const MIN_SCALE = 0.35;

/** 三人局的队伍色环（黑白贴图都是木色，必须靠颜色环区分） */
const TEAM_RING = {
  red: 'rgba(190, 46, 36, 0.95)',
  black: 'rgba(24, 22, 19, 0.95)',
  white: 'rgba(255, 252, 240, 0.98)',
} as const;

export interface BoardHit {
  node: BoardNode;
  /** 客户端坐标到该节点的像素距离（CSS px） */
  distance: number;
}

/**
 * Canvas 棋盘渲染器。
 * 只负责"画"和"点"，不含任何规则判断；状态由外部传入。
 */
export class BoardView {
  readonly canvas: HTMLCanvasElement;
  readonly ctx: CanvasRenderingContext2D;
  private readonly topology: Topology;
  private readonly backgroundUrl: string | null;

  private bg: HTMLImageElement | null = null;
  private scale = 1;
  private dpr = 1;

  state: GameState | null = null;
  selected: number | null = null;
  hints: number[] = [];
  lastMove: { from: number; to: number } | null = null;
  /** 被将军的老将所在节点（高亮闪红） */
  checkNode: number | null = null;
  /** 下一帧要播放的落子动画（由外部在落子后设置） */
  pendingMove: { from: number; to: number } | null = null;

  private anim: {
    piece: Piece;
    x0: number;
    y0: number;
    x1: number;
    y1: number;
    t0: number;
    dur: number;
  } | null = null;
  private animRaf = 0;

  constructor(canvas: HTMLCanvasElement, topology: Topology, backgroundUrl: string | null) {
    this.canvas = canvas;
    this.topology = topology;
    this.backgroundUrl = backgroundUrl;
    const ctx = canvas.getContext('2d', { alpha: false });
    if (!ctx) throw new Error('当前浏览器不支持 Canvas 2D');
    this.ctx = ctx;
  }

  async init(): Promise<void> {
    const tasks: Array<Promise<unknown>> = [warmSprites(ALL_PIECE_URLS)];
    if (this.backgroundUrl) {
      tasks.push(
        loadImage(this.backgroundUrl).then((img) => {
          this.bg = img;
        }),
      );
    }
    await Promise.all(tasks);
  }

  /** 按容器宽度与视口高度计算缩放，并重设 canvas 分辨率 */
  fit(containerWidth: number, viewportHeight = window.innerHeight): void {
    const box = this.topology.boardBox;
    const byWidth = containerWidth / box.w;
    const byHeight = Math.max(0.5, (viewportHeight - 210) / box.h);
    const scale = Math.max(MIN_SCALE, Math.min(MAX_SCALE, byWidth, byHeight));
    this.scale = scale;
    this.dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

    const cssW = Math.round(box.w * scale);
    const cssH = Math.round(box.h * scale);
    this.canvas.style.width = `${cssW}px`;
    this.canvas.style.height = `${cssH}px`;
    this.canvas.width = Math.round(cssW * this.dpr);
    this.canvas.height = Math.round(cssH * this.dpr);
    this.draw();
  }

  get boardScale(): number {
    return this.scale;
  }

  draw(): void {
    if (this.pendingMove) {
      this.beginAnim(this.pendingMove.from, this.pendingMove.to);
      this.pendingMove = null;
    }
    const ctx = this.ctx;
    const s = this.scale * this.dpr;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#1b1410';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    ctx.setTransform(s, 0, 0, s, 0, 0);

    const box = this.topology.boardBox;
    if (this.bg) {
      ctx.drawImage(this.bg, 0, 0, box.w, box.h);
    } else {
      this.drawVectorBoard();
    }

    this.drawLastMove();
    this.drawHints();
    this.drawPieces();
    this.drawCheck();
    this.drawSelection();
  }

  private drawVectorBoard(): void {
    const ctx = this.ctx;
    const box = this.topology.boardBox;
    const g = this.topology.gap;

    const grad = ctx.createLinearGradient(0, 0, box.w, box.h);
    grad.addColorStop(0, '#eccb95');
    grad.addColorStop(0.45, '#e3bd83');
    grad.addColorStop(1, '#d3a76c');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, box.w, box.h);

    const isThree = this.topology.name === 'three';
    const corners = isThree
      ? this.topology.nodes.filter((n) => n.frames.length > 1 && n.frames.includes('center'))
      : [];

    // 逐鹿台底色
    if (corners.length === 3) {
      ctx.beginPath();
      corners.forEach((c, i) => (i === 0 ? ctx.moveTo(c.x, c.y) : ctx.lineTo(c.x, c.y)));
      ctx.closePath();
      ctx.fillStyle = 'rgba(150, 92, 40, 0.13)';
      ctx.fill();
    }

    // 网格
    ctx.strokeStyle = 'rgba(58, 34, 16, 0.88)';
    ctx.lineWidth = isThree ? 1.5 : 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    for (const [a, b] of this.topology.segments) {
      const na = this.topology.nodes[a]!;
      const nb = this.topology.nodes[b]!;
      ctx.moveTo(na.x, na.y);
      ctx.lineTo(nb.x, nb.y);
    }
    ctx.stroke();

    // 九宫斜线
    ctx.beginPath();
    for (const [, palaceIds] of this.topology.palaces) {
      if (palaceIds.length !== 9) continue;
      const pts = palaceIds.map((id) => this.topology.nodes[id]!);
      const cx = pts.reduce((s, p) => s + p.x, 0) / 9;
      const cy = pts.reduce((s, p) => s + p.y, 0) / 9;
      const dist = (p: { x: number; y: number }): number => Math.hypot(p.x - cx, p.y - cy);
      const cornersOfPalace = [...pts].sort((a, b) => dist(b) - dist(a)).slice(0, 4);
      // 每个角连到离它最远的角，得到两条对角线
      for (let i = 0; i < cornersOfPalace.length; i++) {
        const p = cornersOfPalace[i]!;
        const opp = cornersOfPalace
          .filter((q) => q !== p)
          .sort((a, b) => Math.hypot(b.x - p.x, b.y - p.y) - Math.hypot(a.x - p.x, a.y - p.y))[0]!;
        if (p.x < opp.x || (p.x === opp.x && p.y < opp.y)) {
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(opp.x, opp.y);
        }
      }
    }
    ctx.stroke();

    // 文字标识
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(74, 44, 20, 0.55)';
    ctx.font = `600 ${g * 0.5}px "PingFang SC", "Microsoft YaHei", serif`;
    if (isThree && corners.length === 3) {
      const cx = corners.reduce((s, c) => s + c.x, 0) / 3;
      const cy = corners.reduce((s, c) => s + c.y, 0) / 3;
      ctx.fillText('逐 鹿 台', cx, cy);
      for (const wing of ['s0', 's1', 's2'] as const) {
        const base = this.topology.nodes.find(
          (n) => n.frames.includes(wing) && n.rank === 0 && n.file === 4,
        );
        const ferry = this.topology.nodes.find(
          (n) => n.frames.includes(wing) && n.rank === 4 && n.file === 4,
        );
        if (!base || !ferry) continue;
        const dx = base.x - ferry.x;
        const dy = base.y - ferry.y;
        const len = Math.hypot(dx, dy) || 1;
        const label = wing === 's0' ? '红' : wing === 's1' ? '黑' : '白';
        ctx.fillText(label, base.x + (dx / len) * g * 0.9, base.y + (dy / len) * g * 0.9);
      }
    }
  }

  private drawLastMove(): void {
    if (!this.lastMove) return;
    const ctx = this.ctx;
    const g = this.topology.gap;
    const size = g * 0.86;
    ctx.save();
    ctx.strokeStyle = 'rgba(255, 196, 64, 0.85)';
    ctx.lineWidth = 2;
    for (const id of [this.lastMove.from, this.lastMove.to]) {
      const n = this.topology.nodes[id]!;
      ctx.strokeRect(n.x - size / 2, n.y - size / 2, size, size);
    }
    ctx.restore();
  }

  private drawHints(): void {
    if (!this.hints.length) return;
    const ctx = this.ctx;
    const g = this.topology.gap;
    ctx.save();
    for (const id of this.hints) {
      const n = this.topology.nodes[id]!;
      const occupied = this.state?.cells[id] ?? null;
      if (occupied) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, g * 0.42, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(214, 60, 46, 0.95)';
        ctx.lineWidth = g * 0.07;
        ctx.stroke();
      } else {
        ctx.beginPath();
        ctx.arc(n.x, n.y, g * 0.15, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(28, 122, 96, 0.82)';
        ctx.fill();
        ctx.beginPath();
        ctx.arc(n.x, n.y, g * 0.15, 0, Math.PI * 2);
        ctx.strokeStyle = 'rgba(240, 230, 200, 0.75)';
        ctx.lineWidth = g * 0.03;
        ctx.stroke();
      }
    }
    ctx.restore();
  }

  private drawPieces(): void {
    const state = this.state;
    if (!state) return;
    const g = this.topology.gap;
    const size = g * 0.74;
    const anim = this.anim;

    // 动画中的棋子在插值位置先画，再从棋盘里跳过它
    if (anim) {
      const raw = (performance.now() - anim.t0) / anim.dur;
      const t = 1 - Math.pow(1 - Math.min(1, Math.max(0, raw)), 3); // easeOutCubic
      this.drawPieceAt(
        anim.piece,
        anim.x0 + (anim.x1 - anim.x0) * t,
        anim.y0 + (anim.y1 - anim.y0) * t,
        size,
      );
    }

    for (let id = 0; id < state.cells.length; id++) {
      const piece = state.cells[id];
      if (!piece) continue;
      if (anim && piece === anim.piece) continue;
      const n = this.topology.nodes[id]!;
      this.drawPieceAt(piece, n.x, n.y, size);
    }
  }

  private drawPieceAt(piece: Piece, x: number, y: number, size: number): void {
    const ctx = this.ctx;
    const g = this.topology.gap;
    const img = getLoaded(spriteUrl(piece.team, piece.kind));

    // 阴影：贴图自带高光，加一层柔和投影让棋子"压"在棋盘上
    ctx.save();
    ctx.beginPath();
    ctx.arc(x, y + size * 0.06, size * 0.42, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.filter = 'blur(2px)';
    ctx.fill();
    ctx.restore();

    if (img) {
      ctx.drawImage(img, x - size / 2, y - size / 2, size, size);
    } else {
      ctx.beginPath();
      ctx.arc(x, y, size / 2, 0, Math.PI * 2);
      ctx.fillStyle = piece.team === 'red' ? '#c0392b' : '#2c3e50';
      ctx.fill();
    }

    // 三人局：黑白两套贴图都是木色，靠一圈队伍色环区分归属
    if (this.topology.name === 'three') {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, size * 0.51, 0, Math.PI * 2);
      ctx.strokeStyle = TEAM_RING[piece.team];
      ctx.lineWidth = Math.max(2, g * 0.075);
      ctx.stroke();
      ctx.restore();
    }
  }

  /** 建立落子动画并启动逐帧重绘 */
  private beginAnim(from: number, to: number, dur = 180): void {
    const piece = this.state?.cells[to];
    const a = this.topology.nodes[from];
    const b = this.topology.nodes[to];
    if (!piece || !a || !b || from === to) return;
    this.anim = { piece, x0: a.x, y0: a.y, x1: b.x, y1: b.y, t0: performance.now(), dur };
    cancelAnimationFrame(this.animRaf);
    const step = (): void => {
      if (!this.anim) return;
      const raw = (performance.now() - this.anim.t0) / this.anim.dur;
      if (raw >= 1) {
        this.anim = null;
        this.draw();
        return;
      }
      this.draw();
      this.animRaf = requestAnimationFrame(step);
    };
    this.animRaf = requestAnimationFrame(step);
  }

  /** 停止动画（切页面 / 重开时调用，避免残留回调画在旧画布上） */
  dispose(): void {
    cancelAnimationFrame(this.animRaf);
    this.anim = null;
    this.pendingMove = null;
  }

  /** 被将军：老将外圈画一道红色警报环 */
  private drawCheck(): void {
    if (this.checkNode == null) return;
    const ctx = this.ctx;
    const g = this.topology.gap;
    const n = this.topology.nodes[this.checkNode]!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, g * 0.5, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 64, 48, 0.95)';
    ctx.lineWidth = g * 0.08;
    ctx.setLineDash([g * 0.16, g * 0.1]);
    ctx.stroke();
    ctx.restore();
  }

  private drawSelection(): void {
    if (this.selected == null) return;
    const ctx = this.ctx;
    const g = this.topology.gap;
    const n = this.topology.nodes[this.selected]!;
    ctx.save();
    ctx.beginPath();
    ctx.arc(n.x, n.y, g * 0.48, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255, 214, 102, 0.95)';
    ctx.lineWidth = g * 0.07;
    ctx.stroke();
    ctx.restore();
  }

  /** 客户端坐标 → 最近节点（吸附半径 = 0.48 格） */
  hitTest(clientX: number, clientY: number): BoardHit | null {
    const rect = this.canvas.getBoundingClientRect();
    const px = (clientX - rect.left) / this.scale;
    const py = (clientY - rect.top) / this.scale;
    const g = this.topology.gap;
    let best: BoardNode | null = null;
    let bestD = Infinity;
    for (const n of this.topology.nodes) {
      const d = Math.hypot(n.x - px, n.y - py);
      if (d < bestD) {
        bestD = d;
        best = n;
      }
    }
    if (!best || bestD > g * 0.48) return null;
    return { node: best, distance: bestD };
  }
}

const loaded = new Map<string, HTMLImageElement>();
export function registerLoaded(url: string, img: HTMLImageElement): void {
  loaded.set(url, img);
}
function getLoaded(url: string): HTMLImageElement | undefined {
  return loaded.get(url);
}

/** 预载贴图并登记，保证首帧就能画出棋子 */
export async function warmSprites(urls: string[]): Promise<void> {
  await Promise.all(
    urls.map(async (u) => {
      const img = await loadImage(u);
      loaded.set(u, img);
    }),
  );
}

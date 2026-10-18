import type { PieceKind, Team } from '../core/types';

// 素材直接引用项目根的 picture/ 目录，由 Vite 负责 hashed 拷贝（不复制、不改名）
import boardClassicUrl from '../../picture/双人地图.png';
import boardThreeUrl from '../../picture/三人地图.png';

import redGeneral from '../../picture/红帅.png';
import redAdvisor from '../../picture/红仕.png';
import redElephant from '../../picture/红相.png';
import redHorse from '../../picture/红马.png';
import redChariot from '../../picture/红车.png';
import redCannon from '../../picture/红炮.png';
import redPawn from '../../picture/红兵.png';

import blackGeneral from '../../picture/黑将.png';
import blackAdvisor from '../../picture/黑士.png';
import blackElephant from '../../picture/黑象.png';
import blackHorse from '../../picture/黑马.png';
import blackChariot from '../../picture/黑车.png';
import blackCannon from '../../picture/黑炮.png';
import blackPawn from '../../picture/黑卒.png';

import whiteGeneral from '../../picture/白帅.png';
import whiteAdvisor from '../../picture/白士.png';
import whiteElephant from '../../picture/白相.png';
import whiteHorse from '../../picture/白马.png';
import whiteChariot from '../../picture/白车.png';
import whiteCannon from '../../picture/白炮.png';
import whitePawn from '../../picture/白卒.png';

export const BOARD_CLASSIC_URL = boardClassicUrl;
export const BOARD_THREE_URL = boardThreeUrl;

export const PIECE_SPRITE_URLS: Record<Team, Record<PieceKind, string>> = {
  red: {
    general: redGeneral,
    advisor: redAdvisor,
    elephant: redElephant,
    horse: redHorse,
    chariot: redChariot,
    cannon: redCannon,
    pawn: redPawn,
  },
  black: {
    general: blackGeneral,
    advisor: blackAdvisor,
    elephant: blackElephant,
    horse: blackHorse,
    chariot: blackChariot,
    cannon: blackCannon,
    pawn: blackPawn,
  },
  white: {
    general: whiteGeneral,
    advisor: whiteAdvisor,
    elephant: whiteElephant,
    horse: whiteHorse,
    chariot: whiteChariot,
    cannon: whiteCannon,
    pawn: whitePawn,
  },
};

export function spriteUrl(team: Team, kind: PieceKind): string {
  return PIECE_SPRITE_URLS[team][kind];
}

/** 21 张棋子贴图的全部 URL（去重后） */
export const ALL_PIECE_URLS: string[] = (() => {
  const set = new Set<string>();
  for (const team of Object.keys(PIECE_SPRITE_URLS) as Team[]) {
    for (const kind of Object.keys(PIECE_SPRITE_URLS[team]) as PieceKind[]) {
      set.add(PIECE_SPRITE_URLS[team][kind]);
    }
  }
  return [...set];
})();

const cache = new Map<string, HTMLImageElement>();

export function loadImage(url: string): Promise<HTMLImageElement> {
  const hit = cache.get(url);
  if (hit) {
    return hit.complete ? Promise.resolve(hit) : new Promise((res, rej) => {
      hit.addEventListener('load', () => res(hit), { once: true });
      hit.addEventListener('error', () => rej(new Error(`加载失败: ${url}`)), { once: true });
    });
  }
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  cache.set(url, img);
  return new Promise((res, rej) => {
    img.addEventListener('load', () => res(img), { once: true });
    img.addEventListener('error', () => rej(new Error(`加载失败: ${url}`)), { once: true });
  });
}

/** 全量预载：22 张图，总量 < 1 MB，不需要懒加载 */
export async function preloadAll(): Promise<void> {
  const urls = [BOARD_CLASSIC_URL];
  for (const team of Object.keys(PIECE_SPRITE_URLS) as Team[]) {
    for (const kind of Object.keys(PIECE_SPRITE_URLS[team]) as PieceKind[]) {
      urls.push(PIECE_SPRITE_URLS[team][kind]);
    }
  }
  await Promise.all(urls.map((u) => loadImage(u)));
}

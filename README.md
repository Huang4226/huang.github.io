# 逐鹿 · 象棋

一个纯前端的象棋小游戏：首页两个模式入口 —— **经典双人**（标准 9×10 中国象棋）与 **三人逐鹿**（三翼棋盘 + 中央逐鹿台 + 杀将收编）。

设计规格见 [docs/设计文档.md](docs/设计文档.md)，验收条目见 [docs/验收标准.md](docs/验收标准.md)。

---

## 快速开始

```bash
pnpm install        # 首次
pnpm dev            # 开发服务器（默认 http://127.0.0.1:5173）
pnpm build          # 产物输出到 dist/（纯静态，可直接托管）
pnpm build:single   # 再产出一份 dist-single/index.html（单文件，双击即玩）
pnpm preview        # 预览构建产物
pnpm test           # 单元测试（拓扑 / 规则 / 收编 / AI / 记谱）
pnpm typecheck      # tsc --noEmit
pnpm ai:bench       # AI 对随机走子的胜率基准
```

端到端冒烟（无头 Edge 真实点击，需要先 build 并起静态服务）：

```bash
pnpm build
npx serve dist -l 5188       # 或任意静态服务器
pnpm e2e                     # 11 项交互断言 + 截图到 debug/
```

> 本项目在 `pnpm-workspace.yaml` 里设置了 `nodeLinker: hoisted`。原因是本机 pnpm 默认创建的
> junction 链接在 Windows 上无法被 Node 的 ESM 解析器 realpath，导致 vitest/vite 找不到自己的
> 依赖（`Cannot find package 'std-env'`）。改用扁平 node_modules 后一切正常，代价只是依赖树不再严格隔离。

---

## 目录结构

```
├─ index.html
├─ picture/                 原始素材（21 枚棋子贴图 + 2 张棋盘图），只读引用
├─ src/
│  ├─ core/                 类型、对局状态、回合、悔棋
│  ├─ topology/             棋盘拓扑：几何常量、经典 9×10、射线/跳跃表
│  ├─ ui/                   首页、对局页、Canvas 渲染器、素材加载
│  └─ styles/
├─ tests/                   Vitest：拓扑断言 + 状态机断言
├─ scripts/
│  ├─ export-topology.ts    导出交点/线段为 JSON，用于离线标定核对
│  └─ e2e-smoke.mjs         CDP 驱动的真实点击冒烟
└─ docs/                    设计文档与验收标准
```

---

## 当前进度

| 阶段 | 内容 | 状态 |
|---|---|---|
| M0 | 脚手架、首页双模式入口、素材管线、hash 路由 | ✅ 完成 |
| M1 | 经典棋盘渲染、选中/落子、悔棋、重开 | ✅ 完成 |
| M2 | 规则引擎：七兵种走法、将军/将死/困毙、长将、60 回合判和 | ✅ 完成 |
| M3 | 双人 AI：negamax + alpha-beta + 迭代加深，三档难度 | ✅ 完成 |
| M4 | 三人棋盘拓扑（三翼 + 逐鹿台，153 交点）与跨区走法 | ✅ 完成 |
| M5 | 三人回合/收编/淘汰/终局 + 三家 UI + 中央 toast | ✅ 完成 |
| M6 | 中文记谱、落子动画、音效、单文件构建 | ✅ 完成 |
| 二期 | 三人 AI（当前三人局仅同屏轮流） | 待做 |

### 已验证项

| 验收条目 | 结果 | 证据 |
|---|---|---|
| M0-01 `pnpm build` 成功 | ✅ | `dist/`：JS 36 kB（gzip 13 kB）、CSS 8 kB、素材 0.72 MB，合计 0.45 MB |
| M0-03/04/05 首页两入口 + hash 路由 | ✅ | `debug/e2e-home.png` |
| M1-01 拓扑节点 90 / 射线共线等距 / 行列点数 | ✅ | `tests/topology/classic.test.ts`（17 条） |
| M1-02 棋盘与底图对齐（误差 ≤ 2 px） | ✅ | `debug/overlay.png` |
| M1-03 开局布局正确 | ✅ | 单测 + `debug/classic.png` |
| 落子 / 回合交替 / 不能吃己方子 / 悔棋 | ✅ | `tests/core/state.test.ts` + CDP 断言 |
| M2 兵种走法 22 条 + 终局 7 条 | ✅ | `tests/rules/moves.test.ts`（35 条） |
| M2 非法走法被 UI 拒绝、合法走法生效 | ✅ | `pnpm e2e`：红车越不过自家兵；马走日成功 |
| M2 认输 → 终局遮罩 | ✅ | `debug/e2e-result.png` |
| AI-01 对随机走子胜率 ≥ 80% | ✅ **95.0%**（19 胜 1 负 / 20 局） | `pnpm ai:bench`（单步均 19 ms，最慢 111 ms） |
| AI-02 白吃一车必吃 / 一步杀必杀 | ✅ | `tests/ai/search.test.ts` |
| AI-05 每步必合法 | ✅ | 30 手随机对局断言 |
| T-01/T-02 三人拓扑 153 交点、渡口映射、手性闭环 | ✅ | `tests/topology/three.test.ts`（18 条） |
| T-03/T-04 三翼 120° 自同构、任意两点不重合 | ✅ | 同上 |
| X-* 跨区走法 12 条（车马炮兵相士） | ✅ | `tests/rules/three.test.ts`（12 条） |
| S-01…S-19 收编 / 淘汰 / 计分 / 事件 | ✅ | `tests/rules/convert.test.ts`（11 条） |
| 三人局真实点击落子 | ✅ | `debug/e2e-three-selected.png`、`debug/e2e-three-moved.png` |
| 人机对局电脑自动应招 | ✅ | `debug/e2e-ai.png`（手数 1 → 2） |
| 中央 toast（3 秒自动消失） | ✅ | `src/ui/toast.ts` + `docs/设计文档.md` 10.4 |
| 中文记谱（炮八平五 / 卒5进1 / 前炮进二） | ✅ | `tests/core/notation.test.ts`（11 条）+ e2e 断言"马八进七" |
| 落子动画（180ms easeOutCubic） | ✅ | `BoardView.beginAnim`；e2e 截图逐帧可复现 |
| 音效（WebAudio 合成，无音频文件） | ✅ | `src/ui/sound.ts`：走子/吃子/将军/终局四种，可开关并记忆 |
| 单文件构建（双击即玩） | ✅ | `pnpm build:single` → `dist-single/index.html` **620 KB**；已用 `file://` 无头浏览器验证（`debug/single-file-classic.png`） |
| 中文记谱 / 动画 / 音效 / 单文件构建 | ⏳ | M6 |
| 三人 AI | ⏳ | 二期（现在走 `randomMove` 兜底） |

---

## 素材与版权

- `picture/双人地图.png`、`picture/*.png` 棋子贴图：项目自带素材，直接引用。
- `picture/地图.jpg`（昵图网付费素材，带水印）**已删除**，从未参与构建。
- 棋子贴图为 46×46，渲染时按格距（≈50.1 px）的 0.92× 绘制，整体缩放上限 1.2×，超出会发虚。

> 三方棋盘的 `picture/三人地图.png` 来源请自行确认授权；若不希望公开，可把 `picture/` 换成自绘版本（`src/topology/three.ts` 里已预留矢量渲染分支）。

---

## 开源协议

本项目采用 [MIT License](LICENSE)，Copyright (c) 2026 Huang4226。

仓库：<https://github.com/Huang4226/HB-42-1>


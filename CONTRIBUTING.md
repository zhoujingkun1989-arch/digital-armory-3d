<div align="center">

# Contributing to Digital Armory 3D · 参与贡献指南

**English** · [简体中文](#-简体中文指南)

*Thank you for helping build the world's first browser-native open-source 3D firearms, compound archery, 1:1 heavy armor & heavy aero ordnance mechanical museum and interactive engineering encyclopedia (v6.0).*

</div>

---

## 1. Educational Safety Policy (Strict Zero-3D-Printable Rule)

Digital Armory 3D is strictly an **educational mechanical visualization and engineering encyclopedia**.

- **NO 3D-printable files or manufacturing blueprints**: Pull requests containing `.stl`, `.step`, `.iges`, `.dxf`, chambering blueprints, headspace tolerances, or dimensional machining drawings will be **rejected immediately**.
- **Schematic-only proportions**: All procedural CSG and Blender-authored `.glb` meshes are artistic/educational visualizations designed to demonstrate operating systems, locking geometry, kinematics, and safety mechanics—never manufacturing specifications.
- **Open-source provenance only**: Never submit closed-source, game-ripped, or unattributed third-party 3D models or textures. Every high-detail asset must be reproducible via MIT-licensed scripts in this repository.

---

## 2. Museum Architecture Snapshot (v6.0 Baseline)

| Layer | Verified Baseline |
| :--- | :--- |
| **Vault Exhibits & Halls** | **34 exhibits** across **10 halls** (27 legendary firearms + 2 compound archery + 4 `1:1` Main Battle Tanks + 1 `1:1` GE GAU-8/A Avenger 30mm rotary autocannon) |
| **Dual-Track 3D Parts** | **854 parts** total (`775` Blender 5.2 Draco `.glb` watertight parts + `79` real-time dynamic CSG springs/limbs/cables preserving `aSpringParam`) |
| **PBR Textures & Print Plates** | **414** 2K/4K 5-channel Packed ORM WebP maps across **101** material suites (`0` rogue PNGs) + **340** Cycles `2880×1800 RGBA` DK Master Plates |
| **Engineering & Ballistics Registries** | **34/34** Bore & Rifling profiles (`WEAPON_RIFLING_SPECS`), **28-term** bilingual Engineering Glossary, **23** RK4 external ballistics profiles, **17+4** `1:1` ordnance cutaways |
| **Narration & Acoustics** | **1,980** `Charon` (`gemini-3.8-flash-tts`) bilingual audio clips + Web Audio 4-space impulse convolution & Euler-Bernoulli steel waveguide synthesis |

---

## 3. Quick Local Setup

### Prerequisites
- **Node.js** `>= 20` (`npm ci` or `npm install`)
- *(Optional — legacy PBR baker)* **Python** `>= 3.10` with `numpy` & `Pillow`
- *(Optional — photorealistic flagship `.glb` & Cycles plate pipeline)* **Blender 5.2 LTS** (headless CLI)
- *(Optional — live Chromium QA harnesses)* Local Chrome / Chromium / Edge binary

```bash
# 1. Fork & clone the repository
git clone https://github.com/<your-username>/digital-armory-3d.git
cd digital-armory-3d

# 2. Install dependencies
npm ci

# 3. Launch the Vite dev server (serves both / and /showcase.html)
npm run dev
```

---

## 4. Mandatory 5-Gate CI & Headless Chromium QA Suites

### Core 5 Mandatory CI Gates (Required on Every PR — 0 Errors, 0 Warnings)

```bash
npm run typecheck      # Strict TypeScript 5.6 verification (`tsc --noEmit`, 0 errors)
npm run lint           # ESLint across src/ & tests/ (React Hooks rules, 0 errors, 0 warnings)
npm test               # Full Vitest suite (geometry, UV, kinematics, GLB, 3D labs, WCAG SSR, PWA & quality invariants)
npm run build          # Production multi-entry Vite build (every chunk < 800 kB, 0 circular chunk warnings)
npm run assets:audit   # Per-exhibit <= 12 MB budget, 0 rogue PNGs, 340/340 Cycles plates & < 1 GB Pages check
```

CI also verifies subpath deployment integrity on every PR:

```bash
VITE_BASE_PATH=/digital-armory-3d/ npm run build
```

### Headless Chromium QA & Media Automation Suites

Run the relevant headless suites before opening PRs that touch 3D rendering, shaders, routing, accessibility, or showcase media:

```bash
npm run qa:visual -- --weapons <id> --cut   # 1920x1080 WebGL visual regression gate (console = 0, pageerror = 0)
npm run qa:perf                             # Continuous WebGL frame-time & FPS soak test
npm run qa:fleet                            # Full 34-exhibit headless fleet audit
npm run qa:subpath                          # /digital-armory-3d/ subpath routing & WebGL disposal/memory leak audit
npm run qa:a11y                             # Live WCAG 2.1 AA audit across Dark Desktop, Blueprint Daylight & Mobile (390x844)
npm run docs:screenshots -- --dry-run       # Deterministic 1920x1080 flagship docs/screenshots/ capture engine
```

---

## 5. Non-Negotiable Engineering Invariants

### Coordinate & Scale Contract (`1u = 1cm`)
- **Absolute Scale**: Strictly **`1 world unit = 1 cm`** (millimeter UI readouts multiply by `10`).
- **Right-Handed Axes**: `+X` toward muzzle, `+Y` up, `+Z` right flank.
- **Stencil Cutaway Alignment**: Longitudinal `[C]` Two-Pass Stencil section plane slices cleanly along `Z` (`sectionCutOffset` default `0`) and tri-axial `X / Y / Z / 3D Box` clipping planes stay synchronized with `sectionAwareMeshRaycast`.

### Zero-GC `useFrame` & 60Hz Clock Discipline
- **No Frame-Loop Allocations**: Never allocate `new THREE.Vector3()`, `new THREE.Matrix4()`, `new THREE.Quaternion()`, `new THREE.Color()`, arrays, or closures inside R3F `useFrame`. Hoist reusable scratch instances to module or `useRef` scope.
- **No React / Zustand Writes at 60Hz**: Continuous explode, firing, cutaway scan, ballistic trajectory, and recoil telemetry must flow through `src/engine/clock/playbackClock.ts` and direct Three.js object mutation—never call `setState` or Zustand `set` inside `useFrame`.
- **Clean GPU Disposal**: Every procedurally created `BufferGeometry`, `Material`, `CanvasTexture`, or `DataTexture` must call `.dispose()` on unmount/cleanup (`npm run qa:subpath` verifies zero WebGL leaks).

### R3F v8 Linear Texture ColorSpace Lock
- **Protect Linear Data Maps**: React Three Fiber v8 can coerce texture props on JSX material nodes to `SRGBColorSpace`. Always guard linear maps (`normalMap`, `roughnessMap`, `metalnessMap`, `aoMap`) with **`lockLinearTextureColorSpace()`** in `src/engine/materials/pbrManager.ts`.
- **3-Channel RGB WebP Only**: Every `*_normal.webp` (OpenGL `+Y`) and `*_roughness.webp` (Packed ORM: `R = AO`, `G = Roughness`, `B = Metalness`) must be **3-channel RGB** with zero alpha channel.

### Dual-Track Blender 5.2 `.glb` Pipeline & Media Hygiene
1. **Reproducible Blender Scripts**: Author geometry and Cycles GPU baking in `scripts/blender/build_<weaponId>_photoreal.py` and invoke headlessly:
   ```bash
   blender --factory-startup --background --python scripts/blender/build_<weaponId>_photoreal.py
   ```
2. **Per-Part Naming & Watertight Manifolds**: Export every solid part as its exact `partId` from `src/weapons/<id>/plugin.ts` with identity glTF transforms, `non_manifold = 0`, and positive outward signed volume (`vol > 0`).
3. **Preserve Dynamic Parametric Springs**: Never overwrite helical/leaf springs or archery limbs/cables carrying `aSpringParam` in `.glb`; register them in `dynamicSpringParts` inside `src/engine/geometry/glbAssetService.ts`.
4. **Zero Rogue PNGs & Strict Exhibit Budgets**: Keep **0 `.png` files** inside `public/textures/` and `public/plates/`. Total exhibit footprint (`<id>.glb` + `<id>_v3_*.webp`) must stay **`<= 12 MB`** (pistols/revolvers `<= 10 MB`), verified automatically by `npm run assets:audit`.

### Bundle Isolation, Subpath & Optional CDN Safety
- **Chunk Size & Acyclic Graph**: Every production bundle chunk must stay strictly **`< 800 kB`** with **0 Rollup circular chunk warnings**.
- **Lazy Modal Isolation**: Heavy modals (`PosterShareModal`, `MonographPrintModal`, `HistoryTimelineModal`, `ArmorPenetrationModal`, `CausalitySandboxModal`, `DirectorReelModal`, `TextureAtlasModal`, `ArmorerPassportModal`, `OfflineMuseumModal`, `CommandPaletteModal`, `MechanismShowdownModal`) must remain strictly `React.lazy(...)` in `src/App.tsx`.
- **Subpath & CDN URL Resolution**: Never hardcode leading-slash `/models/...`, `/textures/...`, `/audio/...`, or `/plates/...` fetches. Always route static asset paths through **`resolvePublicAssetUrl()`** in `src/engine/utils/assetUrl.ts` so root `/`, GitHub Pages `/digital-armory-3d/`, and optional `VITE_CDN_ASSET_BASE_URL` heavy-media CDN deployments all work identically.

### Narration Voice Lock, Bilingual Parity & WCAG 2.1 AA
- **Narration Voice Lock**: All 1,980 exhibit voiceover clips are locked to **`Charon`** on **`gemini-3.8-flash-tts`** and guarded by SHA-256 manifests (`scripts/narrations/.cache/*_tts_hashes.json`). Do not regenerate existing clips with alternate voices.
- **100% ZH / EN Parity & Zero Public Sprint IDs**: Every UI string, spec label, and encyclopedia entry must ship complete `zh` and `en` copies with **0 CJK characters in English** and **0 internal sprint task tags** in user-facing UI or public documentation.
- **WCAG 2.1 AA & Dual-Theme Parity**: Every interactive button, input, and slider must expose an accessible name (`aria-label` or visible text), dynamic telemetry/feedback banners must use `aria-live="polite"` (or `role="alert"` for errors), mobile `<= 768px` controls must keep **`>= 34px`** touch targets with `0px` horizontal overflow down to `390px`, and every stylesheet must support dark + `[data-theme='light']` Blueprint Daylight themes plus `@media (prefers-reduced-motion: reduce)`.

---

## 6. Submitting a Pull Request

1. Keep PRs focused on a single feature, exhibit, visual upgrade, or fix.
2. Run all **5 mandatory CI gates** (`typecheck`, `lint`, `test`, `build`, `assets:audit`) locally and paste exact pass metrics in your PR description.
3. For 3D, shader, layout, or accessibility changes, run `npm run qa:visual` and `npm run qa:a11y` and confirm `console = 0` and `pageerror = 0`.
4. Respect the narration voiceover policy in [`AGENTS.md`](AGENTS.md) if touching `public/audio/` or `public/narrations/`.

---

<a id="-简体中文指南"></a>

## 简体中文指南

感谢你参与共建全球首个**浏览器端开源 3D 轻武器、复合弓弩、1:1 重装甲与航空重武机械博物馆及交互式工程百科全书（v6.0）**！

### 1. 科普安全红线（严禁可 3D 打印图纸）
- 本项目严格定位为**机械原理科普与交互式工程可视化博物馆**。
- **严禁提交任何 `.stl` / `.step` / `.iges` / `.dxf` 可打印模型、弹膛加工公差或工业制造蓝图**，涉及此类内容的 PR 将被直接关闭。
- **仅限开源可复现资产**：严禁引入闭源版权或拆包第三方模型；所有高精度 `.glb` 资产必须由仓库内 MIT 开源脚本（`scripts/blender/*.py`）通过 Blender 5.2 程序化生成。

### 2. 当前馆藏与工程底座（v6.0 基线）
- **34 款展品 / 10 大展厅 / 854 个运动零件**：27 款传奇轻武器 + 2 款复合弓弩 + 4 款 `1:1` 主战坦克 + 1 款 `1:1` GE GAU-8/A 七管 30mm 航空机炮（`775` 个 Blender 5.2 Draco `.glb` 水密精模零件 + `79` 个保留 `aSpringParam` GPU 实时形变的动态 CSG 弹簧/弓片/缆绳）。
- **媒体与知识底座**：`414` 张 2K/4K 5 通道 Packed ORM WebP 贴图（`101` 套 PBR 图集、`0` 残留 PNG）、`340` 张 Cycles `2880×1800 RGBA` DK 印刷主图、`1,980` 段 `Charon`（`gemini-3.8-flash-tts`）双语导览语音、`34/34` 枪管膛线与内膛规范、`28` 条工程原理词典、`23` 套 RK4 外弹道气动档案。

### 3. 本地启动、五道强制门禁与无头浏览器 QA 套件
需要 **Node.js `>= 20`**（离线重烘 PBR 需 Python `>= 3.10`，重建 `.glb`/图版需 Blender 5.2 LTS）：

```bash
npm ci
npm run dev

# 提交 PR 前必须零错误、零警告通过全部五道自动化 CI 门禁：
npm run typecheck      # TypeScript 5.6 严格类型检查（0 错误）
npm run lint           # ESLint 静态与 React Hooks 规则检查（0 错误 0 警告）
npm test               # Vitest 全量 34 展品几何、UV、运动学、GLB、三维剧场、WCAG 与质量不变式套件
npm run build          # 多入口生产构建（全部 chunk < 800 kB，0 循环分包警告）
npm run assets:audit   # 全馆 34/34 展品 <= 12 MB 预算、0 PNG 卫生检查与 340/340 印刷主图校验

# 子路径部署构建校验：
VITE_BASE_PATH=/digital-armory-3d/ npm run build

# 无头 Chromium 专项 QA 与文档截图套件：
npm run qa:visual -- --weapons <id> --cut   # 1920×1080 WebGL 视觉回归门禁
npm run qa:perf                             # 持续帧率与性能压力监测
npm run qa:fleet                            # 全馆 34 展品批量巡检
npm run qa:subpath                          # /digital-armory-3d/ 子路径路由与 WebGL 显存释放巡检
npm run qa:a11y                             # 暗室桌面 / 工程白昼 / 移动端 (390×844) WCAG 2.1 AA 实时审计
npm run docs:screenshots -- --dry-run       # 1920×1080 旗舰文档截图自动渲染引擎
```

### 4. 不可妥协的核心工程规范
- **统一坐标系与尺度（`1 world unit = 1 cm`）**：UI 毫米读数 `× 10`；右手系 **`+X` 朝枪口、`+Y` 朝上、`+Z` 朝右侧**；纵剖 `[C]` 双通道 Stencil 与三轴/3D 剖切盒保持严格对齐。
- **Zero-GC `useFrame` 与 60Hz 时钟**：严禁在 R3F `useFrame` 中临时 `new Vector3/Matrix4/Quaternion/Color` 或高频调用 React `setState` / Zustand `set`；连续运动学统一经由 `src/engine/clock/playbackClock.ts` 驱动，组件卸载时必须完整 `.dispose()` 几何体、材质与纹理。
- **R3F v8 线性贴图色彩空间锁（`lockLinearTextureColorSpace`）**：法线图（OpenGL `+Y`）与 Packed ORM（`R=AO, G=Roughness, B=Metalness`）必须为 **3 通道 RGB WebP（无 Alpha）**，并在 `pbrManager.ts` 中通过 `lockLinearTextureColorSpace()` 锁定线性色彩空间，防止被 R3F v8 覆盖为 sRGB。
- **资产体积、零 PNG 与懒加载分包约束**：`public/textures/` 与 `public/plates/` 严禁残留 `.png`；单件展品总资产（`.glb` + `_v3_*.webp`）步枪/冲锋枪/航空重武/4K 主战坦克 **`<= 12 MB`**，手枪/转轮 **`<= 10 MB`**；生产构建全部 chunk **`< 800 kB`** 且 **0 循环分包警告**；所有重型弹窗必须在 `src/App.tsx` 中保持 `React.lazy(...)` 懒加载。
- **子路径 `/digital-armory-3d/` 与 CDN 安全**：严禁硬编码根路径 `/models/`、`/textures/` 等 URL，统一通过 `src/engine/utils/assetUrl.ts` 的 **`resolvePublicAssetUrl()`** 解析，无缝兼容 `/`、`/digital-armory-3d/` 及 `VITE_CDN_ASSET_BASE_URL`。
- **语音锁、双语零残留与 WCAG 2.1 AA**：导览语音严格锁定 `gemini-3.8-flash-tts` 的 **`Charon`** 音色与 SHA-256 哈希清单；全站新增文案必须保持 100% 中英对等，英文零 CJK 字符，公开界面与文档零内部任务编号；所有交互控件须满足无障碍名称、`aria-live` 实时播报、移动端 `<= 768px` 至少 `34px` 触控热区、`prefers-reduced-motion` 以及暗室/工程白昼（`[data-theme='light']`）双主题对比度。

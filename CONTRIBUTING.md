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

## 2. Quick Local Setup

### Prerequisites
- **Node.js** `>= 20` (`npm ci` or `npm install`)
- *(Optional — legacy PBR baker)* **Python** `>= 3.10` with `numpy` & `Pillow`
- *(Optional — photorealistic flagship `.glb` pipeline)* **Blender 5.2 LTS** (headless CLI)

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

## 3. Mandatory Engineering Quality Gates

Every PR must pass **all automated CI gates** with **0 errors and 0 warnings** before review:

```bash
npm run typecheck      # Strict TypeScript 5.6 check (0 errors)
npm run lint           # ESLint across src/ and tests/ (0 errors, 0 warnings)
npm test               # Full 34-exhibit Vitest geometry, UV, kinematics, GLB, 3D labs & i18n contract suite
npm run build          # Production multi-entry Vite build (every chunk < 800 kB, 0 warnings)
npm run assets:audit   # Per-exhibit <= 12 MB GLB+WebP budget & 6-directory public/ asset audit
```

For visual / 3D / exhibit PRs, also run the automated 1920×1080 headless Chromium gate:

```bash
npm run qa:visual -- --weapons <id> --cut
```

---

## 4. Architecture & Coordinate Invariants

### Coordinate & Scale Contract (`1u = 1cm`)
- **Scale**: Strictly `1 world unit = 1 cm` (UI millimeter displays multiply by `10`).
- **Right-Handed Axes**: `+X` toward muzzle, `+Y` up, `+Z` right flank.
- **Cutaway Plane**: Longitudinal `[C]` Stencil section plane slices along `Z` (`sectionCutOffset` default `0`), revealing internal fire-control & locking assemblies while keeping `sectionAwareMeshRaycast` aligned.

### Dual-Track Blender 5.2 Headless `.glb` Pipeline Rules
Flagship exhibits use our **Dual-Track Draco `.glb` + CSG Worker** architecture:
1. **Reproducible Blender Scripts**: Author geometry and Cycles GPU baking in `scripts/blender/build_<weaponId>_photoreal.py` and invoke headlessly:
   ```bash
   blender --factory-startup --background --python scripts/blender/build_<weaponId>_photoreal.py
   ```
2. **Per-Part Node Naming & Transforms**: Export every solid part as its exact `partId` from `src/weapons/<id>/plugin.ts`, authored in local part space matching `assembledPos` / `assembledRot` with **identity glTF node transforms**.
3. **Watertight Manifold Geometry**: Ensure `non_manifold = 0` and positive outward signed volume (`vol > 0`) so Two-Pass Stencil Cutaways (`[C]`) cap cleanly with zero leaks.
4. **Preserve Dynamic Parametric Springs**: Do **NOT** override dynamic helical/leaf springs carrying `aSpringParam` in `.glb`; register them in `dynamicSpringParts` inside `src/engine/geometry/glbAssetService.ts` so the CSG Worker provides real-time GPU spring compression.
5. **Cycles-Baked 2K/4K Packed ORM WebP Maps**:
   - Channel packing: `R = Ambient Occlusion`, `G = Roughness`, `B = Metalness` (`*_roughness.webp`), plus `*_albedo.webp` (sRGB) and OpenGL `+Y` `*_normal.webp` (linear). Small-arms & archery use 2K (`2048×2048`), while Heavy Armor Hall (`armor`) Main Battle Tanks use 4K (`4096×4096`) exterior maps paired with shared `512×512` seamless RHA/CARC triplanar detail maps (`armor_detail_{normal,roughness}.webp`).
   - **3-Channel RGB only** (zero alpha channel) on every `*_normal.webp` and `*_roughness.webp` map; `pbrManager.ts` locks linear color space against R3F sRGB clobbering.
   - glTF `UV.y` (`v_gltf = 1 - v_blender`) is automatically flipped once in `glbAssetService.ts` so `TextureLoader(flipY = true)` samples upright WebPs uniformly.
6. **Asset Size Budget**: Total bundle (`<id>.glb` + all `<id>_v3_*.webp`) must stay **`<= 12 MB`** for rifles, SMGs, heavy aero ordnance (`gau8`), and 4K Heavy Armor Main Battle Tanks (`ztz99a` / `m1a2` / `leopard2a7` / `tiger1`), and **`<= 10 MB`** for pistols/revolvers—verified automatically by `npm run assets:audit`.
7. **Registry & Contract Sync**: Register `pbrOverrides` and `dynamicSpringParts` in `src/engine/geometry/glbAssetService.ts`, update exact WebP counts in `src/i18n/{uiStrings,showcaseStrings}.ts` and `tests/{armoryIntegration,weaponContracts,glbAsset}.test.ts` (current v6.0 vault: `34` exhibits across `10` halls, `854` parts [`775` GLB + `79` dynamic CSG], `414` WebP maps across `101` PBR suites, `1,980` Charon TTS clips, `340` Cycles DK plates).

### Runtime Performance & Bilingual Rules
- **60Hz Zero-GC Clock**: Continuous animation/kinematics progress must flow through `src/engine/clock/playbackClock.ts` inside R3F `useFrame`—never write 60fps progress into Zustand or React state.
- **100% EN / ZH Bilingual Parity**: All new UI dictionaries must maintain identical `zh` / `en` keys with **zero CJK/fullwidth characters** in English strings.
- **Subpath & Optional CDN Safety**: Resolve all runtime assets (`models/`, `textures/`, `draco/`, `basis/`, `hdri/`, `narrations/`, `audio/`, `plates/`) via `src/engine/utils/assetUrl.ts` so root `/`, `/digital-armory-3d/`, and optional `VITE_CDN_ASSET_BASE_URL` heavy-media CDN deployments all work seamlessly.

---

## 5. Submitting a Pull Request

1. Keep PRs focused on a single feature, exhibit, or fix.
2. Run all 4 quality gates locally and paste the results in the PR template.
3. For visual / 3D / UX changes, attach before-and-after WebGL screenshots (`console = 0`, `pageerror = 0`).
4. Respect the narration voiceover policy in [`AGENTS.md`](AGENTS.md) if touching `public/audio/` or `public/narrations/`.

---

<a id="-简体中文指南"></a>

## 简体中文指南

感谢你参与共建全球首个**浏览器端开源 3D 轻武器、复合弓弩、1:1 重装甲与航空重武机械博物馆及交互式工程百科全书（v6.0）**！

### 1. 科普安全红线（严禁可 3D 打印图纸）
- 本项目严格定位为**机械原理科普与交互式工程可视化博物馆**。
- **严禁提交任何 `.stl` / `.step` / `.iges` / `.dxf` 可打印模型、弹膛加工公差或工业制造蓝图**，涉及此类内容的 PR 将被直接关闭。
- **仅限开源可复现资产**：严禁引入闭源版权或拆包第三方模型；所有高精度 `.glb` 资产必须由仓库内 MIT 开源脚本（`scripts/blender/*.py`）通过 Blender 5.2 程序化生成。

### 2. 本地启动与强制质量门禁
需要 **Node.js `>= 20`**（离线重烘 PBR 需 Python `>= 3.10`，重建 `.glb` 需 Blender 5.2 LTS）：

```bash
npm ci
npm run dev

# 提交 PR 前必须全部零错误、零警告通过以下五道自动化门禁：
npm run typecheck      # TypeScript 严格类型检查
npm run lint           # ESLint 零警告静态检查
npm test               # Vitest 全量 34 展品几何、UV、运动学、GLB、三维剧场与双语契约测试
npm run build          # 生产多入口构建（全部 chunk < 800 kB，零体积告警）
npm run assets:audit   # 全馆 34/34 展品 <= 12 MB 资产预算与目录体积审计

# 涉及 3D 资产或视觉改动时同步运行 1080p 无头 Chromium 视觉门禁：
npm run qa:visual -- --weapons <id> --cut
```

### 3. 核心工程与 Blender 5.2 `.glb` 管线规范
- **统一坐标系与尺度**：严格遵循 **`1 world unit = 1 cm`**（UI 毫米读数 `× 10`）；右手系 **`+X` 朝枪口、`+Y` 朝上、`+Z` 朝右侧**。
- **双轨资产契约**：
  - 每个实心零件按 `src/weapons/<id>/plugin.ts` 中的精确 `partId` 导出为独立水密流形网格（`non_manifold = 0`、`vol > 0`），节点变换保持单位矩阵（Identity）。
  - 带有 `aSpringParam` GPU 实时压缩变形的动态弹簧**不要**由 GLB 覆盖，须列入 `src/engine/geometry/glbAssetService.ts` 的 `dynamicSpringParts`，交由 CSG Worker 保留实时形变。
  - Cycles 烘焙 2K/4K 5 通道 Packed ORM（`R=AO, G=Roughness, B=Metalness`）贴图（轻武器/弓弩/航炮外观 `2048×2048`，重装甲大厅主战坦克外观 `4096×4096` 配合共享 `512×512` 装甲微细节贴图），法线与 ORM WebP 必须为 **3 通道 RGB（无 Alpha）**；单把展品总资产（`.glb` + 全部 `_v3_*.webp`）手枪/转轮 `<= 10 MB`，步枪/冲锋枪/航空重武/4K 主战坦克 `<= 12 MB`（经 `npm run assets:audit` 自动校验）。
  - 新增贴图或展品后须同步更新 `glbAssetService.ts`、`src/i18n/{uiStrings,showcaseStrings}.ts` 以及 `tests/{glbAsset,armoryIntegration,weaponContracts}.test.ts`（当前 v6.0 基线：`34` 款展品 / `10` 大展厅、`854` 零件 [`775` GLB + `79` 动态 CSG]、`414` 张 WebP / `101` 套 PBR 图集、`1,980` 段 Charon 语音、`340` 张 Cycles DK 印刷主图）。
- **60Hz 零重渲染、子路径/CDN 安全 & 中英 100% 对等**：高频动画通过 `playbackClock.ts` 驱动，禁止高频写入 Zustand；所有静态资源通过 `assetUrl.ts` 解析（兼容 `/`、`/digital-armory-3d/` 及可选 `VITE_CDN_ASSET_BASE_URL`）；所有新增界面文案必须提供完整中英双语，且英文词条严禁残留 CJK 字符。

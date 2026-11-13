# Digital Armory 3D — 终极目标、演进路线图与智能体工程规范

## 1. 长期北极星目标（North Star Goal）

### 终极愿景
打造全球首个**「浏览器端开源 3D 轻武器机械博物馆与交互式工程百科全书」**（*The World's First Browser-Native Open-Source 3D Firearms Mechanical Museum & Interactive Engineering Encyclopedia*）。

以零客户端安装、WebGL 2.0 原生秒开的形态，将机械工程精度、交互式教学深度、物理定量仿真与历史策展叙事融为一体。

### 全球标杆融合定位

| 对标标杆 | 核心吸收能力 | 突破与补齐短板 |
| :--- | :--- | :--- |
| **Matt Rittman 3D 机械原理动画** | 电影级声画同步剖视运镜、功能件分色高亮、火药燃气流向可视化 | 打破纯视频单向播放限制，实现可暂停、旋转、点选、拆解的实时 3D 交互 |
| **World of Guns: Gun Disassembly** | 野战快拆（Field Strip）与军械师全拆、快慢机交互、超慢动作透视、拆装实操考核 | 摒弃闭源客户端下载与重度内购肝度，补强机械咬合/分口径声效与定量工程数据 |
| **Bartosz Ciechanowski (`ciechanow.ski`)** | 网页原生秒开、直接交互操控机构感受机械因果约束、物理数学曲线与 3D 运动 1:1 实时耦合 | 从单一基础机械组件扩展至多枪族大型工业级装配体与 PBR 物理材质管线 |
| **Smithsonian 3D & 英国皇家军械局** | 权威研发史策展脉络、浏览器内 1:1 空间量测尺（Caliper）与开放教育共享属性 | 从静态激光扫描外壳深入到内部火控运动件拆解与 7 阶段实弹内弹道仿真 |

### 终局五大可量化验收里程碑
1. **全流派馆藏闭环**：建成 **14 款殿堂级传奇名枪 + 1 座独立弹药剖视馆**，100% 覆盖人类轻武器核心自动原理、闭锁机构与供弹机械流派。
2. **多模态声画合一**：四幕研发故事升级为**全自动 3D 运镜纪录片**，配合全流程 **Web Audio 军械机械咬合声与分口径实弹声场**。
3. **硬核内弹道定量物理**：7 阶段击发实时同步展示膛压 $P(t)$（`MPa`）、弹头膛内初速 $V(t)$（`m/s`）示波曲线与高压燃气导流轨迹可视化。
4. **军械师级深度实操**：支持按真实军械教范亲手点选拆装（Field-Strip Mode）、快慢机多档位（`SAFE / SEMI / AUTO`）火控交互、经典故障剖视排障诊断，以及 3D 毫米级游标卡尺测量。
5. **横向百科知识网**：支持自动原理流派同屏对照矩阵与全站 100% 中英双语（`zh` / `en`）体验。

---

## 2. 当前基线概览（Current Baseline）

本仓库已建成的核心工程与内容底座如下：
- **11 款馆藏名枪 / 278 个程序化与 CSG 运动零件**：覆盖 `ak15`、`m4a1`、`mp5`、`g17`、`m82a1`、`awm`、`scar`、`deagle`、`aug`、`p320`、`p90`，全量通过法线、体积、UV 与运动学防穿模契约测试。
- **64 张 2K 5 通道 Packed ORM WebP 贴图**：由 `scripts/pbr_core/` 离线烘焙并在 `public/textures/` 提供，配套浏览器内 PBR 贴图图集检视器（`TextureAtlasModal`）。
- **GPU 纵向中轴军械剖视（`C`）与剖面穿透拾取**：通过 `sectionAwareMeshRaycast` 实现穿透虚空剖切面精准点选内部火控与枪机零件；支持外壳 X-Ray 透视（`X`）、CAD 硬边轮廓线（`E`）与零回流 3D 引线编号标签（`L`）。
- **7 阶段耦合运动学 + 7 口径 SAAMI/CIP 实弹内弹道**：位于 `src/engine/actors/BallisticsSystem.tsx`，覆盖 `9×19mm`、`5.7×28mm`、`5.56 NATO`、`7.62×39mm`、`.50 AE`、`.338 Lapua`、`.50 BMG`，含 `90°` 螺旋旋转供弹、底火击发凹坑、碳烟环、膛口冲击波与抛壳轨迹。
- **全馆藏中英双语四幕研发纪录片 + 644 个 Gemini TTS 语音导览 + 3D 导演运镜 & Web Audio 实弹声场**：包含 `public/narrations/*.json`、`public/audio/`、浏览器 `speechSynthesis` 兜底（`src/narration/audioPlayer.ts`）、四幕自动镜头编排与同步字幕（`src/narration/storyDirector.ts`）、程序化 7 口径实弹与 8 点军械咬合合成声场（`src/engine/audio/mechanicalSoundEngine.ts`），以及全站与 `ShowcaseView` 100% 中英双语体验。

---

## 3. 五大阶段 · 12 个具体工程包拆解（Execution Roadmap: `WP-01` ~ `WP-12`）

### 阶段一：基线收口与「声画合一」沉浸感突破（已完成）
- [x] **WP-01｜V3 语音基线归档 & 官方宣传页双语升级**
  - **目标模块**：`src/features/showcase/ShowcaseView.tsx`、`src/i18n/showcaseStrings.ts`、`src/i18n/uiStrings.ts`、`README.md`
  - **交付与验收**：归档当前 10 枪双语故事、586 条 TTS 语音与最小化悬浮播放条基线；为 `ShowcaseView.tsx` 接入 `lang` 中英双语切换，新增「AI 四幕研发纪录片 & 零件语音导览」互动展区并同步更新 `README.md`。
- [x] **WP-02｜四幕纪录片「3D 导演自动运镜模式」**
  - **目标模块**：`src/narration/storyDirector.ts`、`src/features/story/WeaponStoryDrawer.tsx`、`src/store/useAppStore.ts`、`src/engine/clock/playbackClock.ts`
  - **交付与验收**：连播故事时支持一键开启导演模式，自动切入拆解工作台、飞跃镜头聚焦每幕 `focusPartId`、按剧情节点自动开关纵向剖视 `C` / X-Ray / `0.25x` 慢放击发，并同步滚动高亮当前旁白字幕。
- [x] **WP-03｜Web Audio 军械机械声效 & 分口径实弹声场引擎**
  - **目标模块**：`src/engine/audio/mechanicalSoundEngine.ts`、`src/engine/clock/playbackClock.ts`、`src/store/useAppStore.ts`
  - **交付与验收**：与 7 阶段击发相位硬绑定，实现 6 口径差异化枪口冲击波（`.50 BMG` 重低频轰鸣 vs `9×19mm` 清脆短促）；在 `0.25x` 慢放时清晰分离阻铁释放咔哒 → 击针撞击 → 枪机回转开锁碰撞 → 弹壳抛飞 → 复进簧摩擦闭锁声；接入拆装/点选金属卡笋反馈音、TTS 人声自动闪避（Audio Ducking）与独立静音开关。

### 阶段二：定量物理与内弹道可视化
- [ ] **WP-04｜实时内弹道遥测示波器（Chamber Pressure & Velocity HUD）**
  - **目标模块**：`src/features/workbench/TimelineDock.tsx`、`src/engine/clock/playbackClock.ts`
  - **交付与验收**：建立 6 口径真实内弹道曲线模型，在击发模式下以 60fps 零重绘方式同步绘制膛压（`MPa`）、弹头膛内初速（`m/s`）与安全开锁泄压窗口曲线，直观诠释自由行程与滚柱延迟比，支持拖拽曲线反向控制 `fireProgress`。
- [ ] **WP-05｜燃气流向与功能件工程分色视图（Engineering Flow & Functional Tint）**
  - **目标模块**：`src/engine/actors/PartActor.tsx`、`src/engine/actors/BallisticsSystem.tsx`、`src/store/useAppStore.ts`
  - **交付与验收**：提供「工程原理分色模式」，按闭锁件、导气件、火控件与弹性储能件赋予清晰语义色，并动态可视化高压火药燃气从导气孔冲击活塞头或斯通纳气匙的气流路径。
- [ ] **WP-06｜6 大口径 SAAMI 实弹 1:1 剖视对比实验室（Cartridge Cutaway Lab）**
  - **目标模块**：`src/engine/actors/BallisticsSystem.tsx`、`src/features/`（弹药对比视图）
  - **交付与验收**：复用并扩展 SAAMI 车削几何，构建独立弹药展厅，将 `9×19mm`、`5.56 NATO`、`7.62×39mm`、`.50 AE`、`.338 Lapua`、`.50 BMG` 按 `1:1` 绝对比例并排纵剖陈列，定量对比装药容积、被甲弹芯、底火砧座与枪口动能（`500 J` vs `18,000 J`）。

### 阶段三：亲手操作与军械排障教学
- [ ] **WP-07｜引导式野战勤务拆装实操（Hands-On Field-Strip Mode）**
  - **目标模块**：`src/weapons/types.ts`、各武器 `plugin.ts`、`src/features/workbench/`
  - **交付与验收**：为每款武器定义有向拆装依赖图（DAG，如 `卸弹匣 → 拉栓验枪 → 拆机匣盖 → 取复进簧 → 抽枪机框 → 旋出枪机`），支持在 3D 视口直接点击零件完成逐步拆解与复装；若顺序错误，高亮机械干涉部位并弹出军械规范提示。
- [ ] **WP-08｜快慢机多档位（`SAFE / SEMI / AUTO`）火控交互**
  - **目标模块**：`src/weapons/types.ts`、`src/weapons/*/plugin.ts`、`src/features/workbench/`
  - **交付与验收**：扩展火控运动学接口，支持在拆解台切换快慢机档位，实时对比 `SAFE` 阻铁锁死、`SEMI` 单发挂钩截获击锤与松扳机复位、`AUTO` 不到位保险联动连发循环的啮合差异。
- [ ] **WP-09｜经典枪械故障剖视排障室（Malfunction Diagnostics）**
  - **目标模块**：`src/engine/actors/`、`src/features/workbench/`、`src/i18n/`
  - **交付与验收**：内置 4 类典型故障与安全保护定格（`烟囱卡壳 Stovepipe`、`双进弹 Double Feed`、`底火轻敲拒发 Light Strike`、`未闭锁击发阻断 Out-of-Battery Safety`），支持一键剖视定位卡阻成因并演示标准排障步骤。

### 阶段四：博物馆级测绘工具与横向百科串联
- [ ] **WP-10｜1:1 3D 军械游标卡尺与空间标尺（CAD Caliper Tool）**
  - **目标模块**：`src/engine/canvas/`、`src/features/workbench/`
  - **交付与验收**：基于 `1 world unit = 1 cm` 精确坐标，支持在拆解台拾取任意两处 3D 表面点测量毫米级距离（枪管实长、闭锁突笋厚度、后坐行程）并支持开关全枪包络标尺。
- [ ] **WP-11｜自动原理流派对照矩阵（Mechanism Showdown）**
  - **目标模块**：`src/features/armory/ArmoryView.tsx`、`src/weapons/manifests.ts`
  - **交付与验收**：在数字枪库增加机械流派谱系图与双枪同屏对照面板（如 `长行程活塞 vs 短行程活塞 vs 斯通纳气吹`、`滚柱延迟 vs 枪管偏移 vs 膛底导气`）。

### 阶段五：馆藏版图终极补完（填补最后 4 类空白机械流派）
- [ ] **WP-12｜扩充 `BAY-11 ~ BAY-14` 四款异构原理名枪**
  - **目标模块**：`src/weapons/{p90,benellim4,python,...}/`、`scripts/pbr/`、`public/narrations/`、`tests/weaponContracts.test.ts`
  - **交付与验收**：每款均需补齐完整 CSG 几何、2K 5-Ch ORM 贴图、7 阶段内弹道、全量契约测试与中英双语四幕语音：
    1. [x] `BAY-11` **FN P90**：置顶水平透明弹匣 + `90°` 螺旋坡道子弹旋转供弹（已完成）；
    2. `BAY-12` **Benelli M4 (M1014)**：ARGO 双短行程活塞 + 管式弹仓升降托弹板供弹 + `12 Gauge` 多弹丸内弹道；
    3. `BAY-13` **Colt Python (.357 Magnum)**：双动/单动转轮棘轮拨齿分度与止转笋啮合；
    4. `BAY-14` **M1 Garand 或 M249 SAW**：8 发漏夹末发自动弹射 或 双程拨弹滑板弹链开膛机枪。

---

## 4. 智能体工程红线与架构约束（Architecture Invariants & Agent Rules）

所有在本仓库协作的智能体与开发者必须严格遵守以下不可妥协的工程红线：

1. **CAD 尺度与右手坐标系**：严格遵循 `1 world unit = 1 cm`（UI 展示毫米需 `× 10`）；`+X` 朝枪口前方、`+Y` 朝上、`+Z` 朝枪身右侧。纵向剖视平面沿中轴剖开右侧机匣/套筒壳体。
2. **零外部静态网格 & Web Worker 异步建模**：严禁引入 `.glb` / `.gltf` 外部重型模型文件；所有几何体必须在 `src/weapons/<id>/meshes/` 内以参数化/CSG 生成，经 `src/engine/geometry/geometry.worker.ts` 后台计算并通过 `Transferable Float32Array` 零拷贝流式回传主线程。
3. **60Hz 瞬态时钟 & 零 React 重渲染**：高频拆解插值与击发进度必须通过 `src/engine/clock/playbackClock.ts` 订阅并在 R3F `useFrame` 内以 Zero-GC 原地更新矩阵与几何属性，禁止将 60fps 连续进度写入 Zustand 或 React state 引发组件树重渲染。
4. **首屏秒开分包纪律**：`src/weapons/manifests.ts` 仅保留轻量静态目录与相机预设；重型武器插件、CSG 几何与双语故事 JSON 必须保持动态按需懒加载。
5. **中英双语 100% 对等**：任何新增功能、UI 词条（`src/i18n/uiStrings.ts`）、武器/弹药说明及故事旁白（`public/narrations/*.json`）必须同步提供专业准确的中文（`zh`）与英文（`en`）版本。
6. **全馆藏统一配音与 TTS 合成宪法（不可篡改）**：所有武器的四幕研发纪录片（`story_act[1-4]_{zh,en}.mp3`）与全部零件语音讲解（`parts/<partId>_{zh,en}.mp3`）必须且仅能通过 `scripts/build_narrations.py` 调用 Google GenAI SDK 合成，全馆 100% 锁定统一声学基准（以 Glock 17 为标杆）：
   - **唯一模型与音色**：`model = "gemini-3.8-flash-tts"`，**`voice = "Charon"`**（严禁降级为 `flash-lite-tts` 或切换其他音色）。
   - **唯一旁白风格指令（`speech_metadata.style`）**：
     - 中文（`zh`）：`"沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，语速适中自然，重点转折处略作停顿，吐字清晰饱满"`
     - 英文（`en`）：`"Authoritative, warm, articulate museum firearm historian and mechanical engineering documentary narrator, measured pace with natural cadence"`
   - **统一编码与哈希留痕**：统一经 `ffmpeg -ar 24000 -ac 1 -codec:a libmp3lame -b:a 64k` 转码输出 `24 kHz` 单声道 `64 kbps` MP3，并在 `scripts/narrations/.cache/<weaponId>_tts_hashes.json` 记录 `sha256("gemini-3.8-flash-tts|Charon|<style>|<audioScript>")`。
   - **严禁私自替换 TTS 引擎铁律**：**绝对禁止**使用 `edge-tts`（如 `YunxiNeural` / `ChristopherNeural`）、系统 `say` 或任何第三方 TTS 引擎生成音频写入 `public/audio/`！当环境变量 / `.env.local` 缺少 `GEMINI_API_KEY` 或遭遇 `402/429` 配额熔断时，智能体必须**立即中止配音生成并向用户如实报告阻塞**，提示配置 `GEMINI_API_KEY` 后运行 `uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --weapon <id> --batch-tts --force-audio`，严禁擅自用替代音色绕过。
7. **路线图状态同步**：每完成并通过验收一个工程包（`WP-01` ~ `WP-12`），必须同步更新本 `AGENTS.md` 中对应条目的复选框状态（`[x]`）。

---

## 5. 质量门禁命令（Verification & Quality Gates）

完成任意工程包或提交代码前，必须完整运行并全部通过以下四项门禁检查：

```bash
npm run typecheck   # TypeScript 严格模式零错误
npm run lint        # ESLint 零警告 / 零错误
npm test            # Vitest 全量几何、运动学、PBR 亮度与双语契约测试全部通过
npm run build       # 生产环境多入口 (index.html + showcase.html) 分包构建成功
```

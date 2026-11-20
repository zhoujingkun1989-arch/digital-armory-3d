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
1. **全流派馆藏闭环**：建成 **19 款殿堂级馆藏（17 款传奇名枪 + 2 款复合弓弩）+ 独立 11 口径弹药剖视馆与 1,000m 千米外弹道实验室**，100% 覆盖人类轻武器核心自动原理、闭锁机构（含肘节屈伸与 Super V 轴外凸轮）与供弹机械流派（含 M27 可散弹链双供）。
2. **多模态声画合一**：四幕研发故事升级为**全自动 3D 运镜纪录片**，配合全流程 **Web Audio 军械机械咬合声与分口径实弹声场**。
3. **硬核内弹道定量物理**：7 阶段击发实时同步展示膛压 $P(t)$（`MPa`）、弹头膛内初速 $V(t)$（`m/s`）示波曲线与高压燃气导流轨迹可视化。
4. **军械师级深度实操**：支持按真实军械教范亲手点选拆装（Field-Strip Mode）、快慢机多档位（`SAFE / SEMI / AUTO`）火控交互、经典故障剖视排障诊断，以及 3D 毫米级游标卡尺测量。
5. **横向百科知识网**：支持自动原理流派同屏对照矩阵与全站 100% 中英双语（`zh` / `en`）体验。

---

## 2. 当前基线概览（Current Baseline）

本仓库已建成的核心工程与内容底座如下（V2.0 旗舰版 `WP-01` ~ `WP-16` 全部 16 个工程包、`PR-01` ~ `PR-04` Wave 1–4 全部 **19/19（100%）** 照片级旗舰馆藏大满贯与 V3.0 旗舰交互已 100% 闭环交付）：
- **19 款馆藏名枪与复合弓弩 / 480 个独立运动零件（双轨 Draco `.glb` + Web Worker CSG 全量覆盖）**：覆盖 **17 款传奇名枪**（`ak15`、`m4a1`、`mp5`、`g17`、`m82a1`、`awm`、`scar`、`deagle`、`aug`、`p320`、`p90`、`python` 柯尔特蟒蛇 `.357`、`benellim4` 伯奈利 M4 `M1014`、`garand` 美国 M1 加兰德 `.30-06`、`m249` 比利时/美国 FN M249 SAW 班用轻机枪、`p08` 德国 DWM 鲁格 P08 肘节手枪、`vector` 美国/瑞士 KRISS Vector `.45 ACP` 冲锋枪）与 **2 款复合弓弩**（`lift33` Mathews LIFT 33 复合弓、`r500` Ravin R500 螺旋凸轮复合弩），横跨全部 8 大枪族分类（含 `lmg` 机枪）。**全部 19/19（100%）款馆藏（`ak15`、`p08` v2、`deagle`、`m4a1`、`python` v4、`garand`、`mp5`、`awm`、`m82a1`、`g17`、`scar`、`aug`、`p320`、`p90`、`benellim4`、`m249`、`vector`、`lift33`、`r500`）均已完成 Blender 5.2 LTS 高模雕塑 + Cycles GPU 烘焙 Draco `.glb` 全量升级**（总计 `438` 个水密精模零件 + `42` 个保留 `aSpringParam` GPU 实时压缩/弯曲形变的螺旋弹簧、V 形主簧与复合弓弩四片式弓片/凸轮轴/弓弦缆绳于 CSG 轨道 = `480/480` 全零件，单款总资产 `2.13–7.05 MB`，剩余未迁移展品 `0`），同时保留 Web Worker CSG 离线零拷贝兜底，全量通过法线、体积、UV、`t=1.0` 爆炸零穿模、GLB 契约与运动学测试。
- **277 张 2K 5 通道 Packed ORM WebP 贴图 + 3 套 Cycles 32-bit 影棚 `.hdr` + 多层定制 GLSL PBR 着色器**：由 `scripts/blender/`（Cycles GPU 烘焙全部 19 款旗舰 v3 贴图套件）与 `scripts/pbr_core/` 离线烘焙并在 `public/textures/` 提供（`91` 张 Albedo + `93` 张 Normal + `93` 张 Packed ORM，`0` PNG），叠加 GGX Specular AA、实时服役磨损包浆（`出厂 / 微油 / 沧桑`）、CNC 刀痕各向异性微法线、皇家烤蓝、帝国锈蚀烤蓝与 240°C 麦秆黄回火、亚麻籽油黑胡桃实木、枪管连续射击黑体热辐射红热与膛口积碳（`armoryShader.ts`），配套浏览器内 PBR 贴图图集检视器（`TextureAtlasModal`）。
- **实时可拖拽 CT 扫描纵剖面（`C` / `?cut=1`）+ 全局 `Cmd+K` 双语瞬搜指令面板 + 博物馆级精简工作台**：升级 Two-Pass WebGL Stencil 纵剖面支持 `±25 mm` 实时滑动切片（`sectionCutOffset`）、`+Z / -Z` 翻转（`sectionCutFlip`）与 60fps 自动扫描（零着色器重编译，同步 45° ISO 128 剖面斜线与 `sectionAwareMeshRaycast` 穿透拾取）；新增跨全站 5 大页面的 `Cmd+K` / `Ctrl+K` 中英双语瞬搜指令面板（19 展品 / 480 零件 / 全部实验室与视觉开关）及收纳式 `Display` / `Labs & Tools` 玻璃态工作台顶栏；配套 `CONTRIBUTING.md` 与 `.github/` 开源社区治理包。
- **三档影棚环境（暗室展厅 / 军械匠人台 / 工程白昼）+ GTAO/HDR/AgX 后处理 + `<800 kB` 零告警分包 & 子路径硬化（`Pillar 0`）**：内置程序化氯丁橡胶拆枪垫与磁吸零件盘（`GunsmithStageMat.tsx`）、自适应暗色军械师 / 亮色工程蓝图双主题 UI、半分辨率 GTAO + HDR 辉光 + AgX 色调映射管线（`ArmoryPostProcessing.tsx`），以及 `vite.config.ts` 无环分包（主包 `<500 kB`、全部 chunk `<800 kB` 零告警）与 `src/engine/utils/assetUrl.ts` 对 `/` 及 `/digital-armory-3d/` 子路径的幂等安全解析。
- **7 阶段耦合运动学 + 11 口径 SAAMI/CIP 实弹与霰弹及复合弓弩内弹道、刚体抛壳与实时遥测示波器（`WP-04`）**：位于 `src/engine/actors/BallisticsSystem.tsx`、`src/engine/physics/armoryPhysics.ts` 与 `src/features/workbench/BallisticsTelemetryHud.tsx`，覆盖 `9×19mm`、`.45 ACP`、`5.7×28mm`、`.357 Magnum`、`5.56 NATO`、`7.62×39mm`、`.50 AE`、`12 Gauge`、`.30-06 Springfield`、`.338 Lapua`、`.50 BMG` 及 `400 gr` 碳纤维猎箭/弩箭曲线，含 60fps 零重绘膛压 $P(t)$（`MPa`）/ 膛内初速 $V(t)$（`m/s`）示波器与反向拖拽控制、二阶弹簧阻尼枪身后坐上跳与枪管谐振鞭动、桌面碰撞弹跳刚体抛壳及枪管温升积碳演化。
- **1,000m RK4 G1/G7 千米外弹道、横风偏流与第一像面分划板 DOPE 实验室（`[R]` / `?screen=ballistics`，`WP-14`）**：位于 `src/engine/physics/externalBallistics.ts`、`src/features/ballistics/ExternalBallisticsView.tsx` 与 `src/features/ballistics/externalBallisticsStrings.ts`，以纯 TypeScript Zero-GC 四阶龙格-库塔（RK4）3-DOF 引擎实时解算全部 13 套弹头/箭矢气动档案在 ICAO 标准大气海拔/温度与横风下的弹道下坠、风偏、跨音速（Mach 1.0）失稳区间、第一像面（FFP）MIL 圣诞树光学分划板瞄准点及 7 档距离 `MIL / MOA` 狙击手 DOPE 射表。
- **直接手操拉机柄/套筒、膛内验枪（`Press-Check [P]`）与快慢机多档位火控交互（`WP-08`）**：位于 `src/engine/interaction/InteractiveActionController.tsx`，支持 3D 视口直接拖拽套筒/拉机柄、微拉套筒露铜验枪（`P`）、切换 `SAFE / SEMI / AUTO` 快慢机档位（`V`，含 M249 纯开膛待击 `SAFE / AUTO` 连发阻铁）以及按住扳机（`F`）感受保险锁死、单发断连器截获复位与全自动循环差异。
- **6 大机械职能语义分色（`[T]`）与 60fps 高压火药燃气导流可视化（`WP-05`）**：位于 `src/engine/materials/engineeringRoles.ts`、`src/engine/actors/GasFlowVisualizer.tsx` 与 `src/features/workbench/EngineeringTintLegend.tsx`，零着色器重编译实现全库 480 个零件按闭锁承压、导气驱动、自动机框、火控击发、储能弹簧、机匣供弹分色（与 Stencil 纵剖面同步换色）及动态膛内膨胀与导气分流轨迹渲染。
- **军械师引导式野战勤务拆装实操（`[G]`，`WP-07`）+ 限时盲拆考证与随机未知故障盲考诊断（`[G] / [J]`，`WP-13`）**：位于 `src/engine/fieldstrip/`、`src/engine/malfunctions/`、`src/engine/exam/armorerExamStore.ts`、`src/engine/exam/examStrings.ts` 与 `src/features/workbench/{FieldStripHud,MalfunctionHud}.tsx`，内置全部 19 款展品真实军械教范有向拆装依赖图（DAG）与 4 类典型故障排障流程，并支持无提示计时盲拆复装考核（`0 → N → 0`，干涉误点扣分且不泄露前置件名称）与随机未知故障定性 + 乱序排障盲考，自动评定 `S / A / B / C` 军械师认证等级并持久化至 `localStorage`。
- **经典枪械、转轮与弓弩故障剖视排障室（`[J]`，`WP-09`）**：位于 `src/engine/malfunctions/malfunctionSpecs.ts`、`src/engine/malfunctions/malfunctionStore.ts`、`src/engine/actors/MalfunctionActor.tsx` 与 `src/features/workbench/MalfunctionHud.tsx`，覆盖全部 19 款展品的 4 类典型卡阻与安全阻断（`烟囱卡壳 Stovepipe`、`双进弹 Double Feed`、`底火轻敲拒发 Light Strike`、`未闭锁击发阻断 Out-of-Battery`），支持 3D 故障可视化、成因零件脉冲定位与按序排障实操演练。
- **1:1 3D 军械游标卡尺与空间包络标尺（`[K]`，`WP-10`）**：位于 `src/engine/caliper/caliperStore.ts`、`src/engine/canvas/CaliperActor.tsx` 与 `src/features/workbench/CaliperHud.tsx`，严格基于 `1 world unit = 1 cm = 10 mm` 实现穿透纵剖切面的任意两点 3D 表面拾取、60fps 悬停橡皮筋实时跨度预览、正交 `|ΔX| / |ΔY| / |ΔZ|` 分量解算、3 类一键 CAD 基准量测及全枪三维包络标尺。
- **自动原理流派谱系矩阵与双展品同屏对照实验室（`[S]`，`WP-11`）**：位于 `src/features/armory/mechanismShowdownSpecs.ts`、`src/features/armory/MechanismShowdownModal.tsx` 与 `src/features/armory/ArmoryView.tsx`，按 **7 类自动机能量驱动、7 类弹膛闭锁泄压（含双连杆屈膝肘节闭锁与 Super V 轴外凸轮延迟）、7 类空间供弹排布（含 M27 可散弹链双拨爪梭动供弹）** 三大正交谱系完整归类全馆 19 款展品，内置 13 组跨时代经典对决预设、双枪膛压 $P(f)$ / 初速 $V(f)$ 同屏叠加曲线、定量工程参数对照与一键剖视工作台跳转。
- **11 大口径 SAAMI/CIP 实弹与霰弹 1:1 纵剖对比实验室（`[B]` / `?screen=cartridges`，`WP-06` + `WP-15`）**：位于 `src/engine/cartridges/cartridgeSpecs.ts`、`src/engine/actors/CartridgeCutawayStage.tsx` 与 `src/features/cartridges/CartridgeLabView.tsx`，独立博物馆弹药展厅将 `9×19mm`、`.45 ACP`、`5.7×28mm`、`.357 Magnum`、`.50 AE`、`12 Gauge (00 鹿弹)`、`7.62×39mm`、`5.56 NATO`、`.30-06 Springfield`、`.338 Lapua`、`.50 BMG` 按 `1:1` 绝对物理比例（`29.69 mm` 至 `138.43 mm`）同台 `180°` 纵剖陈列，支持轴向分解滑块与定量参数对照矩阵。
- **即时高清 3D 剖视社交分享海报工坊（`[U]`）与平板/移动端触控体验优化（`WP-16`）**：位于 `src/features/share/posterComposer.ts`、`src/features/share/PosterShareModal.tsx`、`src/features/share/posterShareStrings.ts` 与 `src/styles/{poster-share,responsive}.css`，支持一键抓取实时 WebGL 剖视画面合成 `1920×1080`（`16:9`）/ `1080×1350`（`4:5`）三主题高清 PNG 分享卡（含双语铭牌、4 格 `1:1` 测绘参数、内弹道特征曲线、`S/A/B/C` 军械师认证印章与 ISO 18004 二维码直达链接），并针对 iPad/移动端 `@media (pointer: coarse)` 触屏手势与 44×44 px 热区深度适配。
- **17 图版收藏图鉴与儿童 3D 机械绘本打印工坊（`Ctrl/Cmd+P`）**：位于 `src/features/monograph/`（`MonographPrintModal.tsx`、`MonographCaptureRig.tsx`、`MonographDocument.tsx`、`MonographKidsDocument.tsx`、`monographDataAssembler.ts`），支持离屏抓拍 17 幅高清 3D 图版并排版输出 A4/Letter 矢量打印版 **儿童 3D 绘本**（8 页精装 / 4 页紧凑）与 **收藏工程图鉴**（黑曜石 / 蓝图版）。
- **全馆藏中英双语四幕研发纪录片 + 1,112 个 Gemini TTS 语音导览 + 3D 导演运镜 & 立体声卷积混响 / 钢材频散波导声场**：包含 `public/narrations/*.json`（19 套）、`public/audio/`（1,112 条 `Charon` `gemini-3.8-flash-tts` 语音，全量经 `scripts/narrations/.cache/*_tts_hashes.json` SHA-256 校验锁死）、浏览器 `speechSynthesis` 兜底（`src/narration/audioPlayer.ts`）、四幕自动镜头编排与同步字幕（`src/narration/storyDirector.ts`）、3 档立体声卷积脉冲响应（`bench_close` / `tactical_hall` / `indoor_range`）与欧拉-伯努利钢材频散波导（含 M1 加兰德末发漏夹 `"PING!"` 模态共鸣、M249 弹链拨爪、鲁格 P08 肘节咔哒与 Vector 1,200 RPM 亚音速风暴）+ 复合弓弦阻尼合成 + 抛壳落地弹跳声场（`src/engine/audio/mechanicalSoundEngine.ts`），以及全站与 `ShowcaseView` 100% 中英双语体验。

---

## 3. 六大阶段 · 16 个具体工程包拆解（Execution Roadmap: `WP-01` ~ `WP-16`）

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

### 阶段二：定量物理与内弹道可视化（已完成）
- [x] **WP-04｜实时内弹道遥测示波器（Chamber Pressure & Velocity HUD）**
  - **目标模块**：`src/features/workbench/BallisticsTelemetryHud.tsx`、`src/engine/physics/armoryPhysics.ts`、`src/features/workbench/TimelineDock.tsx`、`src/engine/clock/playbackClock.ts`
  - **交付与验收**：建立 7 口径 SAAMI/CIP 真实内弹道曲线模型，在击发模式下以 60fps 零重绘方式同步绘制膛压（`MPa`）、弹头膛内初速（`m/s`）与安全开锁泄压窗口曲线，直观诠释自由行程与滚柱延迟比，支持拖拽曲线反向控制 `fireProgress`。
- [x] **WP-05｜燃气流向与功能件工程分色视图（Engineering Flow & Functional Tint）**
  - **目标模块**：`src/engine/materials/engineeringRoles.ts`、`src/engine/materials/armoryShader.ts`、`src/engine/actors/PartActor.tsx`、`src/engine/actors/GasFlowVisualizer.tsx`、`src/features/workbench/EngineeringTintLegend.tsx`
  - **交付与验收**：提供「工程原理分色模式」，按闭锁件、导气件、火控件与弹性储能件赋予清晰语义色，并动态可视化高压火药燃气从导气孔冲击活塞头或斯通纳气匙的气流路径。
- [x] **WP-06｜6+1 大口径 SAAMI 实弹 1:1 剖视对比实验室（Cartridge Cutaway Lab）**
  - **目标模块**：`src/engine/cartridges/cartridgeSpecs.ts`、`src/engine/actors/CartridgeCutawayStage.tsx`、`src/features/cartridges/CartridgeLabView.tsx`
  - **交付与验收**：复用并扩展 SAAMI/CIP 车削几何，构建独立弹药展厅（`?screen=cartridges`），将 `9×19mm`、`5.7×28mm`、`.50 AE`、`7.62×39mm`、`5.56 NATO`、`.338 Lapua`、`.50 BMG` 按 `1:1` 绝对比例并排纵剖陈列，定量对比装药容积、被甲弹芯、底火砧座与枪口动能（`518 J` vs `18,050 J`）。

### 阶段三：亲手操作与军械排障教学（已完成）
- [x] **WP-07｜引导式野战勤务拆装实操（Hands-On Field-Strip Mode）**
  - **目标模块**：`src/engine/fieldstrip/fieldStripSpecs.ts`、`src/engine/fieldstrip/fieldStripStore.ts`、`src/features/workbench/FieldStripHud.tsx`、`src/engine/actors/PartActor.tsx`
  - **交付与验收**：为每款武器定义有向拆装依赖图（DAG，如 `卸弹匣 → 拉栓验枪 → 拆机匣盖 → 取复进簧 → 抽枪机框 → 旋出枪机`），支持在 3D 视口直接点击零件完成逐步拆解与复装；若顺序错误，高亮机械干涉部位并弹出军械规范提示。
- [x] **WP-08｜快慢机多档位（`SAFE / SEMI / AUTO`）火控交互**
  - **目标模块**：`src/engine/interaction/InteractiveActionController.tsx`、`src/features/workbench/TimelineDock.tsx`、`src/weapons/types.ts`、`src/weapons/*/plugin.ts`
  - **交付与验收**：扩展火控运动学接口与直接 3D 手操控制器，支持在拆解台切换快慢机档位（`V`）、微拉套筒验枪（`P`）与按住扳机（`F`），实时对比 `SAFE` 阻铁锁死、`SEMI` 单发断连器截获与松扳机复位、`AUTO` 不到位保险联动连发循环的啮合差异。
- [x] **WP-09｜经典枪械故障剖视排障室（Malfunction Diagnostics）**
  - **目标模块**：`src/engine/malfunctions/malfunctionSpecs.ts`、`src/engine/malfunctions/malfunctionStore.ts`、`src/engine/actors/MalfunctionActor.tsx`、`src/features/workbench/MalfunctionHud.tsx`
  - **交付与验收**：内置 4 类典型故障与安全保护定格（`烟囱卡壳 Stovepipe`、`双进弹 Double Feed`、`底火轻敲拒发 Light Strike`、`未闭锁击发阻断 Out-of-Battery Safety`），支持一键剖视定位卡阻成因并演示标准排障步骤。

### 阶段四：博物馆级测绘工具与横向百科串联（已完成）
- [x] **WP-10｜1:1 3D 军械游标卡尺与空间标尺（CAD Caliper Tool）**
  - **目标模块**：`src/engine/caliper/caliperStore.ts`、`src/engine/canvas/CaliperActor.tsx`、`src/features/workbench/CaliperHud.tsx`
  - **交付与验收**：基于 `1 world unit = 1 cm` 精确坐标，支持在拆解台拾取任意两处 3D 表面点测量毫米级距离（枪管实长、闭锁突笋厚度、后坐行程）并支持开关全枪包络标尺。
- [x] **WP-11｜自动原理流派对照矩阵（Mechanism Showdown）**
  - **目标模块**：`src/features/armory/mechanismShowdownSpecs.ts`、`src/features/armory/MechanismShowdownModal.tsx`、`src/features/armory/ArmoryView.tsx`、`src/weapons/manifests.ts`
  - **交付与验收**：在数字枪库增加三轴机械流派谱系图与双展品同屏对照面板（如 `长行程活塞 vs 短行程活塞 vs 斯通纳气吹`、`滚柱延迟 vs 枪管偏移 vs 膛底导气`、`柯尔特蟒蛇双动转轮 vs 沙漠之鹰导气回转`、`AK-15 vs M1 加兰德`）。

### 阶段五：馆藏版图终极补完（填补最后 4 类空白机械流派，已完成）
- [x] **WP-12｜扩充 `BAY-11` 及 `BAY-14 ~ BAY-16` 四款异构原理名枪**
  - **目标模块**：`src/weapons/{p90,python,benellim4,garand}/`、`scripts/pbr/`、`public/narrations/`、`tests/weaponContracts.test.ts`
  - **交付与验收**：每款均已补齐完整 CSG 几何、2K 5-Ch ORM 贴图、7 阶段内弹道、全量契约测试与中英双语四幕 `Charon` 语音：
    1. [x] `BAY-11` **FN P90**：置顶水平透明弹匣 + `90°` 螺旋坡道子弹旋转供弹（已完成）；
    2. [x] `BAY-14` **Colt Python (.357 Magnum)**：双动/单动转轮 `60°` 棘轮拨齿分度、折叠 V 形主簧与止转笋啮合（已完成）；
    3. [x] `BAY-15` **Benelli M4 (M1014)**：ARGO 双短行程自调导气活塞 + 管式弹仓升降托弹板供弹 + `12 Gauge` 多弹丸内弹道（已完成）；
    4. [x] `BAY-16` **U.S. Rifle M1 Garand (.30-06 Springfield)**：枪口导气筒长行程弯拉杆 + 8 发弹簧钢漏夹末发自动弹射（`"PING!"`）（已完成）。

### 阶段六：V2.0 军械师盲测考证、千米外弹道实验室、异构奇观扩馆与社交海报工坊（已完成，`WP-13` ~ `WP-16`）
- [x] **WP-13｜军械师限时盲拆考证与随机未知故障盲考诊断（Armorer Blind Qualification Exam & Stoppage Triage）**
  - **目标模块**：`src/engine/exam/armorerExamStore.ts`、`src/engine/exam/examStrings.ts`、`src/engine/fieldstrip/fieldStripStore.ts`、`src/engine/malfunctions/malfunctionStore.ts`、`src/features/workbench/{FieldStripHud,MalfunctionHud}.tsx`、`tests/armorerExam.test.ts`
  - **交付与验收**：实现全馆 19 款展品的无提示限时盲拆与逆序复装闭环考核（`0 → N → 0`，干涉误点扣 `75` 分且严格屏蔽前置零件名剧透）及随机未知故障定格诊断 + 乱序排障盲考（错判扣 `120` 分、乱序扣 `60` 分），按标准时间与零失误门槛评定 `S / A / B / C` 等级并持久化至 `localStorage`，在数字枪库与分享海报同步点亮认证星章。
- [x] **WP-14｜`1,000m` RK4 G1/G7 千米外弹道、横风偏流与第一像面分划板 DOPE 实验室（External Ballistics & Reticle Lab）**
  - **目标模块**：`src/engine/physics/externalBallistics.ts`、`src/features/ballistics/ExternalBallisticsView.tsx`、`src/features/ballistics/externalBallisticsStrings.ts`、`src/app/useUrlStateSync.ts`、`tests/externalBallistics.test.ts`
  - **交付与验收**：构建纯 TypeScript Zero-GC 四阶龙格-库塔（RK4）3-DOF 外弹道解算器，覆盖全部 13 套弹头/箭矢档案（含 `.45 ACP 230gr FMJ`、`12 Gauge` 9 粒鹿弹散布及复合弓箭/弩箭），支持 ICAO 海拔/气温大气密度修正、BRL G1/G7 跨音速阻力曲线、精确归零仰角求解（`< 0.02 cm`）、Mach 1.0 跨音速边界检测、第一像面（FFP）MIL 圣诞树分划板瞄准预览与 7 档距离 `MIL / MOA` 狙击手 DOPE 射表（快捷键 `R` / `?screen=ballistics`）。
- [x] **WP-15｜扩充 `BAY-17 ~ BAY-19` 三款机械奇观名枪与第 11 口径 `.45 ACP` 实弹纵剖**
  - **目标模块**：`src/weapons/{m249,p08,vector}/`、`src/engine/cartridges/cartridgeSpecs.ts`、`scripts/pbr/`、`public/narrations/`、`public/audio/`、`tests/weaponContracts.test.ts`
  - **交付与验收**：新增 3 款异构巅峰名枪（共 `76` 个 CSG 零件、`18` 张 2K 5-Ch ORM 贴图、`176` 条 `Charon` `gemini-3.8-flash-tts` 语音）及第 11 款 `.45 ACP` SAAMI `1:1` 纵剖弹药，使全馆达 **19 款展品 / 480 零件 / 112 贴图 / 1,112 语音 / 11 口径纵剖**：
    1. [x] `BAY-17` **FN M249 SAW (5.56×45mm NATO)**：开膛待击长行程活塞 + 双突笋回转枪机（`rx >= 0.45 rad`）+ M27 可散金属弹链双级棘爪横向梭动拨弹与 STANAG 应急弹匣井双供弹（已完成）；
    2. [x] `BAY-18` **DWM Luger P08 (9×19mm Parabellum)**：`6.5 mm` 叉形节套管退短后坐 + 过死点双连杆向上屈膝肘节闭锁（`dy > 2.5 cm`, `|rz| > 0.7 rad`）+ 侧盖板 L 形直角换向杠杆与 240°C 麦秆黄回火工艺（已完成）；
    3. [x] `BAY-19` **KRISS Vector SMG Gen II (.45 ACP)**：专利 Super V `-65°` 轴外钨钢配重滑块下潜延迟半自由枪机（`slider dy < -5.0 cm`）+ 虎口下低膛轴线枪管 + 顶置倒装下摆击锤与第 11 口径 `.45 ACP` 1:1 纵剖弹药（已完成）。
- [x] **WP-16｜`<800 kB` 零告警分包、子路径硬化、即时高清 3D 剖视社交海报工坊与平板触控优化**
  - **目标模块**：`vite.config.ts`、`src/engine/utils/assetUrl.ts`、`src/features/share/{posterComposer,PosterShareModal,posterShareStrings}.ts*`、`src/styles/{poster-share,responsive}.css`、`tests/bundleAndSubpath.test.ts`
  - **交付与验收**：完成无环代码分包（全部生产 chunk `<800 kB` 零告警）与 `VITE_BASE_PATH` 幂等子路径解析；上线即时高清 3D 剖视社交分享海报工坊（快捷键 `U`，支持 `1920×1080` `16:9` 与 `1080×1350` `4:5`、3 套博物馆主题、`S/A/B/C` 认证印章与 `?cut=1` 二维码直达链接），并补齐 iPad/移动端 `@media (pointer: coarse)` 大触控热区与响应式交互体验。

### 阶段七：V3.0 照片级真铁画质升级（Photorealism-First：`PR-01` ~ `PR-04`）
- [x] **PR-01｜全局照片级影棚光影、真铁材质与光学镜头引擎**
  - **目标模块**：`scripts/blender/render_studio_hdri.py`、`public/hdri/`、`src/engine/canvas/{studioHdriManager,GunsmithStageMat,ArmoryPostProcessing,ArmoryViewport}.tsx`、`src/engine/materials/armoryShader.ts`、`src/app/ViewportErrorBoundary.tsx`
  - **交付与验收**：以 Blender 5.2 Cycles 渲染 3 套真实物理摄影棚 32-bit `.hdr` 反射环境贴图（含渐进柔光箱与黑旗吸光反差）；升级 `armoryShader.ts` 加入 GGX 高光抗锯齿（Specular AA）、宏观/微观枪油粗糙度起伏与实时服役磨损系统（`0% 全新 / 35% 轻油实操 / 100% 战损沧桑`）；接入近景微距景深（Macro Bokeh DOF）、电影暗角与三档自适应画质看门狗（`Ultra / Balanced / Eco`）及双语 `webglcontextlost` 热恢复；交付真机 5 镜改造前后高清对比实拍验收。
- [x] **PR-02｜双轨 Draco/Meshopt `.glb` 装载框架 + 样板一「鲁格 P08（25 零件全重制）」**
  - **目标模块**：`src/engine/geometry/{glbAssetService,geometryService}.ts`、`src/engine/materials/pbrManager.ts`、`scripts/blender/build_p08_photoreal.py`、`public/models/p08.glb`、`public/textures/p08_v3_*.webp`
  - **交付与验收**：建立与既有 `partId`、运动学、`StencilSectionCap` 纵剖、游标卡尺与盲拆 100% 契约兼容的 Draco `.glb` 双轨按需加载架构，并修复 `@react-three/fiber` v8 将全馆法线/ORM 线性贴图覆写为 `SRGB8_ALPHA8` 的底层缺陷；用 Blender 5.2 全零件高模倒角与 Cycles 烘焙重制鲁格 P08 全部 22 个实心零件 + 保留 3 个 `aSpringParam` 螺旋弹簧（总资产 `2.70 MB <= 10 MB`），通过全量契约与真机 6 镜超近景肉眼验收。
- [x] **PR-03｜样板二「AK-15M1（26 零件全重制）」——现代战术步枪照片级标杆**
  - **目标模块**：`scripts/blender/build_ak15_photoreal.py`、`public/models/ak15.glb`、`public/textures/ak15_v3_*.webp`
  - **交付与验收**：复用 Blender 5.2 高模倒角与 Cycles 高烘低管线重制 AK-15M1 全部 24 个实心零件 + 保留 2 个 `aSpringParam` 螺旋弹簧（总资产 `1.85 MB <= 12 MB`），通过全量契约与真机 6 镜超近景肉眼验收。
- [x] **PR-04｜全馆 19 款照片级批量推广 & 汇入 V3.0 GitHub 高星门面与 UX 减负（19/19 100% 大满贯闭环）**
  - **目标模块**：全馆 19 款展品 Blender 5.2 模块化精模迁移、顶栏极简重构、`Cmd+K` 全局瞬搜、动态活体 CT 剖切面、GitHub V3.0 门面与开源社区治理包。
  - **已完成进度（Wave 1 ~ Wave 4 全部 19/19 照片级大满贯均已验收闭环，剩余未迁移展品 `0`）**：
    - [x] **Wave 1 五大照片级旗舰馆藏闭环**（`ak15` `3.90 MB`、`p08` v2 `3.39 MB`、`deagle` `7.05 MB`、`m4a1` `3.53 MB`、`python` v4 `2.13 MB`，共 `117` 个水密精模零件，均已注册 `glbAssetService.ts` 并通过 1920×1080 真机 Chromium 视觉验收）；
    - [x] **Wave 2 四大传奇长枪/冲锋枪旗舰闭环（累计 9 大 Blender 5.2 照片级旗舰 / `211` 个水密精模零件 / `187` 张 2K WebP）**：`garand`（`2.72 MB`，`24` 精模 + `2` 弹簧）、`mp5`（`3.18 MB`，`25` 精模 + `1` 弹簧）、`awm`（`3.68 MB`，`23` 精模 + `1` 弹簧）、`m82a1`（`3.49 MB`，`22` 精模 + `2` 弹簧），均已注册 `glbAssetService.ts` 与 `tests/glbAsset.test.ts` 全量契约并通过 29 镜 1920×1080 真机 Chromium 视觉验收；
    - [x] **Wave 3 五大经典战术手枪/无托/模块化步枪旗舰闭环（累计 14/19 Blender 5.2 照片级旗舰 / `331` 个水密精模零件 + `23` 个动态 CSG 弹簧 / `232` 张 2K WebP：`76` Albedo + `78` Normal + `78` ORM，`0` PNG）**：`g17`（`2.28 MB`，`26` 精模 + `2` 弹簧）、`scar`（`3.41 MB`，`25` 精模 + `1` 弹簧）、`aug`（`3.62 MB`，`24` 精模 + `1` 弹簧）、`p320`（`2.53 MB`，`22` 精模 + `2` 弹簧）、`p90`（`2.17 MB`，`23` 精模 + `2` 弹簧），均已注册 `glbAssetService.ts` 与 `tests/glbAsset.test.ts` 全量契约并通过 1920×1080 真机 Chromium 视觉验收（零控制台错误、零线性色彩空间违规）；
    - [x] **Wave 4 终极收官五大异构枪械与复合弓弩旗舰闭环（全馆 19/19 100% Blender 5.2 照片级大满贯 / `438` 个水密精模零件 + `42` 个动态 `aSpringParam` CSG 弹簧/弓片/弓弦 = `480/480` / `277` 张 2K WebP：`91` Albedo + `93` Normal + `93` ORM，`0` PNG，剩余未迁移展品 `0`）**：`benellim4`（`2.47 MB`，`23` 精模 + `3` 弹簧）、`m249`（`3.64 MB`，`24` 精模 + `2` 弹簧）、`vector`（`2.18 MB`，`22` 精模 + `3` 弹簧）、`lift33`（`3.37 MB`，`19` 精模 + `5` 动态 CSG 弓片/凸轮轴/弓弦缆绳）、`r500`（`3.53 MB`，`19` 精模 + `6` 动态 CSG 弓片/凸轮轴/弓弦/扳机簧），全部编译期锁定注册于 `glbAssetService.ts`（`Readonly<Record<WeaponId, GlbWeaponAssetConfig>>`）与 `tests/glbAsset.test.ts` 全量契约，并通过 62 镜 1920×1080 真机 Chromium 视觉验收（含 `ArmoryViewport.tsx` `camera.far = 1200` 穹顶远裁面修复与 `vector` 弹匣托弹板/压缩弹簧/16 发 `.45 ACP` 弹柱纵剖对齐，零控制台错误、零线性色彩空间违规）；
    - [x] **V3.0 旗舰交互升级**：全局中英双语 `Cmd+K` / `Ctrl+K` 指令面板（`CommandPaletteModal.tsx`）、实时可拖拽 `±25 mm` 活体 CT 扫描剖切面（`LiveSectionPlaneBar.tsx` + `StencilSectionCap.tsx` 动态联动）及工作台玻璃态极简减负；
    - [x] **GitHub 高星门面与社区治理包**：`README.md` 升级为 **19/19 全馆旗舰真机渲染画廊**（`23/23` 幅 1920×1080 实拍 `docs/screenshots/*`）+ V3.0 架构门面，新建中英双语 `CONTRIBUTING.md` 及 `.github/{ISSUE_TEMPLATE,PULL_REQUEST_TEMPLATE}`。

### 阶段八：V3.1「人类机械奇观」殿堂扩馆（`WP-17` · `BAY-20 ~ BAY-23`）
- [ ] **WP-17｜扩充 `BAY-20 ~ BAY-23` 四款世界级机械奇观与新口径弹药（19 → 23 款全照片级馆藏）**
  - **目标模块**：`src/weapons/{g11,vss,m134,an94}/`、`scripts/blender/build_{g11,vss,m134,an94}_photoreal.py`、`public/models/`、`public/textures/`、`src/engine/{geometry,ballistics,physics,fieldstrip,malfunctions,caliper,audio,cartridges}/`、`src/features/armory/mechanismShowdownSpecs.ts`、`public/narrations/`、`tests/`
  - **交付与验收**：每款均严格遵循下方第 4、5 节 V3.0 照片级双轨宪法，一步到位交付 Blender 5.2 高模 Draco `.glb` + 3×2K Packed ORM WebP + 完整 CSG 兜底与 `aSpringParam` 动态弹簧 + 7 阶段专属机械运动学 + 全套实验室/拆装/排障/卡尺/流派对照/双语纪录片接入 + 1920×1080 真机 Chromium 像素级 QA 签收：
    1. [ ] `BAY-20` **H&K G11 K2 (`4.73×33mm DM11` 无壳弹)**：90° 旋转圆柱弹膛（Rotary Breech Cylinder）+ 钟表级齿轮棘爪连杆 + 2,100 RPM 浮置三连发机匣总成；
    2. [ ] `BAY-21` **VSS Vintorez (`9×39mm SP-5/SP-6` 亚音速微声弹)**：整体式多孔泄气枪管 + 6 级斜挡板膨胀消音室 + 6 闭锁突笋旋转枪机 + 俄制 PSO-1 瞄准镜与镂空桦木层压托；
    3. [ ] `BAY-22` **GE M134D Minigun (`7.62×51mm NATO`)**：电机驱动六管旋转枪管簇 + 360° 机匣正弦螺旋凸轮轨道同步驱动 6 套枪机波浪循环 + 无链螺旋供弹器（Delinker）；
    4. [ ] `BAY-23` **Nikonov AN-94 "Abakan" (`5.45×39mm 7N6`)**：浮置枪管/机匣整体长后坐 + 内部钢索滑轮（Pulley & Cable）1,800 RPM 双发延迟后坐 + 15° 右倾弹匣与二级预供弹斜坡。

---

## 4. 智能体工程红线与架构约束（Architecture Invariants & Agent Rules）

所有在本仓库协作的智能体与开发者必须严格遵守以下不可妥协的工程红线（项目宪法）：

1. **CAD 尺度与右手坐标系**：严格遵循 `1 world unit = 1 cm`（UI 展示毫米需 `× 10`）；`+X` 朝枪口前方、`+Y` 朝上、`+Z` 朝枪身右侧。纵向剖视平面沿中轴剖开右侧机匣/套筒壳体。
2. **Blender 5.2 LTS 单文件双轨雕塑与 Cycles Metal GPU 烘焙宪法**：
   - 严禁引入来历不明或闭源版权第三方 3D 模型；所有高精度 `.glb` 资产必须由仓库内可复现 MIT 开源单文件脚本（`scripts/blender/build_<id>_photoreal.py`，内建 `--postprocess` 后处理子进程）通过 Blender 5.2 LTS 程序化高模雕塑与 Cycles Metal GPU 烘焙生成，单款展品总资产（Draco `.glb` + 全部 2K WebP）严格控制在 **`≤ 12 MB`**（目标 `2.1–4.5 MB`）。
   - **坐标系与 Option A 烘焙铁律**：Blender Z-up 严格采用右手正旋转 `(bx, by, bz) = (tx, -tz, ty)`（`det = +1`）；先在 `assembledPos/assembledRot` 装配位烘焙真实接触阴影 AO，导出 Draco glTF 2.0 前全部重置为单位矩阵 `(0, 0, 0)` 局部坐标（严格保证 **`0` 非单位变换、`0` 非流形边、`nodes === meshes === pbrOverrides`**）。
   - **双轨动静分离铁律**：凡在 `computeFiringKinematics` 中由 `scaleX` 驱动 GPU 实时形变的部件（螺旋弹簧压缩、V 形主簧、复合弓弩四片式弓片/凸轮轴/弓弦缆绳），**必须**列入 `glbAssetService.ts` 的 `dynamicSpringParts` 留在 Web Worker CSG 轨道保留 `aSpringParam` 属性；其余实体件全量走 Blender 5.2 水密高模 `.glb`，同时保留 CSG 离线零拷贝兜底。
3. **3×2K 5-Ch Packed ORM WebP 与 UV 防火墙铁律**：
   - 每款展品独立配置 3 套 `2048×2048` 贴图套件（`public/textures/<id>_v3_<suite>_{albedo,normal,roughness}.webp`），其中 `*_roughness.webp` 打包 5 通道 ORM（`R = AO, G = Roughness, B = Metalness`），全库严格保持 **`0` 张 PNG**；`pbrManager.ts` 必须通过 `lockLinearTextureColorSpace` 锁死法线/ORM 线性色彩空间，严禁 `@react-three/fiber` v8 将其覆写为 `SRGB8_ALPHA8`。
   - **UV 排布与零渗色红线**：统一使用 `CONCAVE` UV 排布（`margin >= 0.0045`）；所有枪身铭文、兵工厂戳记、试枪章与 MIL-STD-130 UID 二维码必须映射至无畸变平面 Hero UV 带，确保 1:1 正向无镜像、无裁剪；所有高饱和强调色部件（安全橙托弹板、绯红快慢机/保险点、绿宝石/蓝宝石光学镀膜镜片、黄铜/绿尖弹链、荧光光纤瞄针）必须设置 **`>= 50 px` UV 隔离防火墙**，零色渗。
4. **AgX 真铁材质校准与几何防穿帮红线**：
   - 在 Three.js AgX 色调映射与双柔光条灯（`tactical_vault.hdr`）影棚下，暗色发黑/烤蓝/磷化钢平面 **严禁压黑**，基础反照率基线须维持 `sRGB 0.18–0.28`、缎面粗糙度 `R = 0.25–0.38`（哑光工程聚合物 `sRGB 0.16–0.22, M = 0.0, R = 0.56–0.70`），确保高光呈现丝绸级真铁光泽而非死黑塑料块。
   - **装配与剖面零穿帮红线**：扳机护圈必须前后实心焊接闭环零悬空；套筒/枪管鼻锥严禁内膛破壁；CT 纵剖面（`?cut=1`）下的弹匣托弹板与压缩弹簧必须精确位于实弹柱最底发正下方零穿模；超长/超高展品适配 `ArmoryViewport.tsx` 相机 `far >= 1200` 严禁截断影棚天幕。
5. **60Hz 瞬态时钟 & 零 React 重渲染**：高频拆解插值与击发进度必须通过 `src/engine/clock/playbackClock.ts` 订阅并在 R3F `useFrame` 内以 Zero-GC 原地更新矩阵与几何属性，禁止将 60fps 连续进度写入 Zustand 或 React state 引发组件树重渲染。
6. **首屏秒开与 `<800 kB` 零告警分包纪律**：`src/weapons/manifests.ts` 仅保留轻量静态目录与相机预设；重型武器插件、CSG 几何与双语故事 JSON 必须保持动态按需懒加载，全部生产 Vite chunk 严格 `< 800 kB` 零体积告警，且全部静态资源路径经 `src/engine/utils/assetUrl.ts` 兼容 `/` 与 `/digital-armory-3d/` 子路径。
7. **中英双语 100% 对等**：任何新增功能、UI 词条（`src/i18n/uiStrings.ts`）、武器/弹药说明及故事旁白（`public/narrations/*.json`）必须同步提供专业准确的中文（`zh`）与英文（`en`）版本。
8. **全馆藏统一配音与 TTS 合成宪法（不可篡改）**：所有武器的四幕研发纪录片（`story_act[1-4]_{zh,en}.mp3`）与全部零件语音讲解（`parts/<partId>_{zh,en}.mp3`）必须且仅能通过 `scripts/build_narrations.py` 调用 Google GenAI SDK 合成，全馆 100% 锁定统一声学基准（以 Glock 17 为标杆）：
   - **唯一模型与音色**：`model = "gemini-3.8-flash-tts"`，**`voice = "Charon"`**（严禁降级为 `flash-lite-tts` 或切换其他音色）。
   - **唯一旁白风格指令（`speech_metadata.style`）**：
     - 中文（`zh`）：`"沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，语速适中自然，重点转折处略作停顿，吐字清晰饱满"`
     - 英文（`en`）：`"Authoritative, warm, articulate museum firearm historian and mechanical engineering documentary narrator, measured pace with natural cadence"`
   - **统一编码与哈希留痕**：统一经 `ffmpeg -ar 24000 -ac 1 -codec:a libmp3lame -b:a 64k` 转码输出 `24 kHz` 单声道 `64 kbps` MP3，并在 `scripts/narrations/.cache/<weaponId>_tts_hashes.json` 记录 `sha256("gemini-3.8-flash-tts|Charon|<style>|<audioScript>")`。
   - **严禁私自替换 TTS 引擎铁律**：**绝对禁止**使用 `edge-tts`（如 `YunxiNeural` / `ChristopherNeural`）、系统 `say` 或任何第三方 TTS 引擎生成音频写入 `public/audio/`！当环境变量 / `.env.local` 缺少 `GEMINI_API_KEY` 或遭遇 `402/429` 配额熔断时，智能体必须**立即中止配音生成并向用户如实报告阻塞**，提示配置 `GEMINI_API_KEY` 后运行 `uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --weapon <id> --batch-tts --force-audio`，严禁擅自用替代音色绕过。
9. **科普安全边界、Git 纪律与路线图同步**：严禁导出任何可用于真实制造或 3D 打印的 STL / 公差蓝图；未经用户明确要求严禁私自 `git push` 至远端仓库；每完成并通过验收一个工程包（`WP-01` ~ `WP-17` / `PR-01` ~ `PR-04`），必须同步更新本 `AGENTS.md` 对应基线与复选框状态（`[x]`）。

---

## 5. 五道质量门禁标准（Verification & Quality Gates）

完成任意工程包、新武器实装或提交代码前，必须完整运行并全部通过以下 **四道工程代码门禁 + 一道 1080p 真机视觉 QA 门禁**：

```bash
npm run typecheck   # 1. TypeScript 严格模式零错误
npm run lint        # 2. ESLint 零警告 / 零错误
npm test            # 3. Vitest 全量几何、运动学、GLB/PBR、物理与双语契约测试全部通过
npm run build       # 4. 生产环境多入口 (index.html + showcase.html) 分包构建零告警 (全部 chunk < 800 kB)
```

5. **1920×1080 实机无头 Chromium 逐像素视觉与运行时 QA（新增/重构 3D 资产强制门禁）**：
   - 在真实浏览器（`http://127.0.0.1:5173/?screen=workbench&weapon=<id>`）逐一抓取 **影棚 3/4 全景、核心铭文微距、特色机构特写、实时 CT 纵剖面（`?cut=1`）与 `t = 1.0` 爆炸图** 并通过 `read_file` 逐像素人工/智能体目检；
   - 运行时断言强制全绿：`consoleErrors === 0`、`pageErrors === 0`、实体件 `100%` `userData.isGlbAsset === true`、动态件 `100%` 保留 `aSpringParam`、`0` 线性/sRGB `colorSpace` 违规；
   - 发现任何悬空零件、穿模、破壁、铭文镜像/遮挡、色渗或压黑，**必须直接打回对应画师/工程师返工复验至 10/10**，并将最终签收的 1920×1080 实拍图归档至 `docs/screenshots/<id>-v3-macro.jpg` 并同步校验 `README.md` 零断链。

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
1. **全流派馆藏闭环**：建成 **34 款殿堂级馆藏 / 10 大展厅（27 款传奇名枪 + 2 款复合弓弩 + 4 款 1:1 真实尺度主战坦克重装甲大厅 + 1 款 1:1 30mm 七管航空重武 `GAU-8/A` 第十展厅）+ 独立 17+4 口径实弹、坦克炮弹与航空机炮弹 1:1 剖视馆及 1,000m 三维交互实弹靶场与外弹道实验室（23 套气动档案）**，100% 覆盖人类轻武器、重装主战坦克与重型航空旋转机炮核心自动原理、闭锁机构（含勃朗宁单绞链偏移、MG 42 对称双滚柱短后坐、毛瑟 98 三突笋受控供弹、汤姆逊 45° 青铜布利什延迟、下垂楔块杠杆连珠、双连杆上倾闭锁泵动、90° 无壳旋转弹膛、双连杆屈膝肘节、Super V 轴外凸轮、六管电动与七管双液压 360° 螺旋凸轮轨道、钢索滑轮延迟后坐与立楔/横楔滑膛/线膛坦克主炮炮闩）与供弹机械流派（含 50 发 L 型发条螺旋弹鼓、5 发桥夹内置弹仓、管状弹仓升降托弹板、M27/M13/Gurt 34 弹链、置顶无壳冲杆、15° 右倾预供弹、22 发底置转盘自动装弹机、隔爆泄压尾舱与 1,150 发闭环无链螺旋弹鼓）。
2. **多模态声画合一**：四幕研发故事升级为**全自动 3D 运镜纪录片**与 **浏览器原生 1080p 导演级视频录制（`DirectorReelModal`）**，配合全流程 **Web Audio 四场所卷积混响与欧拉-伯努利钢材频散波导声场**（含模块化消音器/制退器声学耦合与 1,000m 靶场 `d/343` 声波回传）。
3. **硬核内外弹道与三维物理剧场**：7 阶段击发实时同步展示膛压 $P(t)$（`MPa`）、弹头膛内初速 $V(t)$（`m/s`）示波曲线、高压燃气导流与消音器挡板涡旋/制退器侧喷流可视化，并内置 **1:1 复合装甲 3D 慢动作穿甲剖视剧场（5 款动能穿甲弹）**、**1,000m 三维交互实弹靶场与子弹时间追踪镜头（Bullet-Cam / FLIR）** 以及 **实时耦合机械因果沙盒**。
4. **军械师级深度实操与改装**：支持按真实军械教范亲手点选野战快拆与全枪精拆两级 DAG（Field-Strip & Detail-Strip）、限时盲拆与随机未知故障盲考认证护照、物理耦合模块化光学瞄具与枪口改装台（`[O]`）、快慢机多档位（`SAFE / SEMI / AUTO`）火控交互、1:1 坦克乘员炮塔观瞄与 FLIR 火控系统，以及 3D 毫米级游标卡尺测量。
5. **横向百科知识网与离线永续**：支持单画布双裁剪 3D 分屏对决、9×9×9 自动原理流派同屏对照矩阵（30 组跨时代经典对决）、1894–2026 百年演化谱系时间线、PWA 离线博物馆缓存管理与全站 100% 中英双语（`zh` / `en`，英文零 CJK）体验。

---

## 2. 当前基线概览（Current Baseline）

本仓库已建成的核心工程与内容底座如下（`WP-01` ~ `WP-30` 全部 30 个工程包、`PR-01` ~ `PR-04` Wave 1–4、V3.1 机械奇观扩馆、V4.0 重装装甲展厅、V5.0 物理对比与跨世代经典升级，以及 V6.0 基建硬化、三维物理剧场与十殿堂传奇扩馆全部 **34/34（100%）** 照片级旗舰馆藏大满贯已 100% 闭环交付）：
- **34 款馆藏名枪、复合弓弩、1:1 主战坦克与 1:1 航空重武 / 10 大展厅 / 854 个独立运动零件（双轨 Draco `.glb` + Web Worker CSG 全量覆盖）**：覆盖 **27 款传奇名枪**（`ak15`、`m4a1`、`mp5`、`g17`、`m82a1`、`awm`、`scar`、`deagle`、`aug`、`p320`、`p90`、`python` 柯尔特蟒蛇 `.357`、`benellim4` 伯奈利 M4 `M1014`、`garand` 美国 M1 加兰德 `.30-06`、`m249` 比利时/美国 FN M249 SAW、`p08` 德国 DWM 鲁格 P08、`vector` 美国/瑞士 KRISS Vector `.45 ACP`、`g11` 德国 H&K G11 K2 无壳步枪、`vss` 俄罗斯 VSS Vintorez `9×39mm`、`m134` 美国 GE/Dillon Aero M134D 六管转管机枪、`an94` 俄罗斯 Nikonov AN-94 “阿巴坎”、`winchester1894` 温彻斯特 M1894 杠杆步枪、`rem870` 雷明顿 M870 泵动霰弹枪，以及 V6.0 新增 **`m1911` 柯尔特 M1911A1 `.45 ACP`、`mg42` 德国 MG 42 `7.92×57mm` 通用机枪、`k98k` 德国毛瑟 Karabiner 98k `7.92×57mm`、`thompson` 美国汤姆逊 M1928A1 `.45 ACP` 冲锋枪**）、**2 款复合弓弩**（`lift33` Mathews LIFT 33、`r500` Ravin R500）、**4 款 `1:1` 真实尺度主战坦克（`armor` 重装甲大厅）**（`ztz99a`、`m1a2`、`leopard2a7`、`tiger1`）与 **1 款 `1:1` 航空重武（`ordnance` 第十展厅）**（**`gau8` 通用电气 GAU-8/A「复仇者」`30×173mm` 七管旋转机炮与 1,150 发螺旋弹鼓，全长 `6.06 m`、满载 `1,828 kg`**），横跨全部 **10 大展品分类/展厅**（`all / assault / lmg / smg / sniper / shotgun / pistol / archery / armor / ordnance`）。**全部 34/34（100%）款馆藏均已完成 Blender 5.2 LTS 高模雕塑 + Cycles GPU 烘焙 Draco `.glb` 全量升级**（总计 `775` 个水密精模零件 + `79` 个保留 `aSpringParam` GPU 实时压缩/弯曲形变的动态 CSG 弹簧/主炮复进簧/弓片/弓弦缆绳 = `854/854` 全零件，轻武器/弓弩与 GAU-8/A 总资产 `1.25–7.05 MB` [`gau8` `2.87 MB`]，4 款 4K 旗舰主战坦克 `9.94–11.27 MB <= 12 MB`，`34/34` 全量通过 `npm run assets:audit` 资产预算门禁，剩余未迁移展品 `0`），同时保留 Web Worker CSG 离线零拷贝兜底，全量通过法线、体积、UV、`t=1.0` 爆炸零穿模、GLB 契约与运动学测试。
- **414 张 2K/4K 5 通道 Packed ORM 与微表面细节 WebP 贴图（101 套材质图集）+ 4 套 Cycles 32-bit `.hdr` + 生产级 KTX2 (`toktx`) / CDN / 1080p 视觉门禁基建（`WP-25a` + `WP-26`）**：由 `scripts/blender/`（34 套 MIT 无头脚本 Cycles GPU 烘焙全部 34 款旗舰 v3 贴图套件，其中 4 款主战坦克全部 8 套外观贴图升级至 `4096×4096` 共 `24` 张 4K WebP）与 `scripts/pbr_core/`（含 `512×512` 无缝平铺 RHA/CARC 微表面法线与粗糙度贴图 `armor_detail_{normal,roughness}.webp`）离线烘焙并在 `public/textures/` 提供（`136` 张 Albedo + `139` 张 Normal + `139` 张 Packed ORM / 微粗糙度，`0` 张 PNG），配套浏览器内 PBR 贴图图集检视器（`TextureAtlasModal`，覆盖全馆 `101` 套材质图集）；内置真实 Khronos `toktx` 纹理压缩流水线（`scripts/build_ktx2_textures.mjs`，自动 WebP→临时 PNG 解码，线性贴图 UASTC+Zstd / 色彩贴图 ETC1S，无 `toktx` 时零破坏回退 WebP，配套 `public/basis/basis_transcoder.{js,wasm}` 与 `src/engine/materials/ktx2Support.ts`）、资产体积自动审计器（`npm run assets:audit` → `scripts/audit_asset_budget.mjs`）、可选重媒体 CDN 路由（`VITE_CDN_ASSET_BASE_URL` in `src/engine/utils/assetUrl.ts` & `src/vite-env.d.ts`，将 `audio/textures/models/plates/hdri` 无缝切向外部 CDN 并保持根路径与子路径幂等兼容）及 1920×1080 无头 Chromium 视觉回归自动门禁（`npm run qa:visual` → `scripts/qa_visual_gate.mjs`）。
- **三轴实时可拖拽 CT 扫描纵剖面 + 6 面 3D 剖切盒（`C` / `?cut=1`，`Z Long / X Cross / Y Top / 3D Box`，`WP-21`）与全局 `Cmd+K` 双语瞬搜**：`src/engine/actors/{StencilSectionCap,SectionBoxGuide}.tsx` 与 `src/features/workbench/LiveSectionPlaneBar.tsx` 支持轻武器 `±25 mm`（`X` 轴 `-380~+580 mm`、`Y` 轴 `±180 mm`）与主战坦克/航炮 `±1,800 mm` 三轴正交实时滑动切片、6 平面 3D 局部剖切盒（含实时线框辅助框）、`+Z / -Z` 翻转、倾斜局部 Z 剖切（如 AN-94 15° 右倾弹匣）与 60fps 自动扫描（零着色器重编译，同步 45° ISO 128 剖面斜线与 `sectionAwareMeshRaycast` 穿透拾取）；`src/features/workbench/{CommandPaletteModal,commandPaletteEngine}.ts*` 提供跨全站中英双语 `Cmd+K` / `Ctrl+K` 瞬搜指令面板（直达 34 展品 / 854 零件 / 10 大展厅 / 3D 分屏 / 3D 穿甲剧场 / 1,000m 3D 靶场 / 改装工作台 / 因果沙盒 / 历史时间线 / 离线博物馆等全部入口）。
- **单画布双裁剪 3D 分屏对决（`?screen=split_showdown`，`WP-19`）+ 因果沙盒（`?panel=causality`，`WP-20`）+ `1:1` 复合装甲三维慢动作穿甲剧场（`?panel=armor`，`WP-20` + `WP-27`）**：
  - `src/features/showdown3d/{SplitShowdownViewport,SplitShowdownOverlay,splitShowdownCamera,splitShowdownStrings}.ts*` 在单 WebGL 画布内通过双 Scissor 视口实时并行渲染任意两款馆藏，支持锁步/独立轨道视角切换、跨尺度自适应取景（如 `GAU-8/A vs M134D` 或 `ZTZ-99A vs M1A2`）、同步 CT 纵剖/爆炸/击发/X-Ray 与 `MagazineAmmoStack` 独立供弹叠层；
  - `src/engine/physics/causalitySandbox.ts` 与 `src/features/sandbox/CausalitySandboxModal.tsx` 将装药压力、导气孔流量、枪机质量与复进簧刚度实时耦合至 3D 运动学，演示过气提前开锁与短后坐卡壳（FTE）物理因果；
  - `src/engine/physics/armorPenetration.ts` 与 `src/features/armorlab/{ArmorPenetrationModal,ArmorPenetration3DScene,armorPenetration3DMath,armorPenetrationStrings}.ts*` 覆盖 **5 款动能穿甲弹**（`125mm DTC10-125`、`120mm M829A4 / DM63`、`88mm PzGr.39`、`30×173mm GAU-8 PGU-14/B API`、`.50 BMG M2 AP`）× 4 款主战坦克 × 4 防区，基于 Lanz-Odermatt / De Marre 方程在 **3D 剖视剧场 / 2D 原理剖图 / 3D+2D 双屏** 三模式下以 `0.15x / 0.5x / 1x` 慢动作实时演绎 ERA 双飞板剪切、高温流体侵彻空腔、车内高速崩落粒子锥（Spall Cone）与大倾角跳弹偏转。
- **物理耦合模块化光学瞄具与枪口改装工作台（`[O]`，`WP-29`）**：位于 `src/engine/attachments/{attachmentSpecs,attachmentStore}.ts`、`src/engine/actors/AttachmentActor.tsx` 与 `src/features/workbench/AttachmentBenchPanel.tsx`，为全馆 **34 款展品** 定义精确枪口轴线（`boreY` 零缝齐平）与导轨锚点（智能跳过弓弩/主战坦克/航炮并附工程说明），提供 4 枪口（原厂 / 钛合金 7 级 K 型挡板消音器 / 双室竞技制退器 / 三叉消焰器）× 4 光学（原厂 / 红点 / 1–8×24 LPVO 悬臂镜 / 串列 FLIR 热成像）× 4 战术预设，并打通 **四维真实物理耦合**：CT `[C]` 切开直视内部 7 级 K 挡板 / 5 片式 LPVO 镜组 / FLIR 传感器 PCB、`GasFlowVisualizer` 消音器内腔燃气涡旋与制退器双侧后掠射流、`mechanicalSoundEngine` 实时频谱与响度迁移（`-28 dB` / `+6 dB`），以及 `armoryPhysics` / `BallisticsTelemetryHud` 后坐上跳与初速遥测联动。
- **三档影棚环境（暗室展厅 / 军械匠人台 / 工程白昼）+ 1:1 重装装配机库 32-bit HDRI & 边缘羽化做旧混凝土地坪 + Ultra 4096 阴影 + GTAO/HDR/AgX 后处理 + `<800 kB` 零告警分包 & 子路径硬化（`Pillar 0`）**：内置程序化氯丁橡胶拆枪垫与磁吸零件盘、面向 1:1 主战坦克与 `GAU-8/A` 航空重武暗室/匠人台自动绑定的专用 `1:1` 重装装配机库 32-bit `.hdr`（`public/hdri/heavy_armor_hangar.hdr`，`1.33 MB`）及带 `2.6 m` C2 五次方圆角边缘羽化溶解、法线自流平暗色油渍、履带碾压痕与 `Ø 9.6 m` 钢制转盘井环的 `18 m × 12 m` 做旧混凝土地坪（`Y = -120.0 cm`、`near=2.0/far=9000`、Ultra 档 `4096×4096` 紧凑视锥主光阴影，`GunsmithStageMat.tsx`）、自适应暗色军械师 / 亮色工程蓝图双主题 UI、半分辨率 GTAO + HDR 辉光 + AgX 色调映射管线（`ArmoryPostProcessing.tsx`），以及 `vite.config.ts` 无环分包（全部 chunk `<800 kB` 零告警）与 `src/engine/utils/assetUrl.ts` 对 `/`、`/digital-armory-3d/` 及可选 CDN 的幂等安全解析。
- **7 阶段耦合运动学 + 17+4 口径实弹/航炮/坦克炮弹及 2 款复合弓弩内弹道、刚体抛壳与实时遥测示波器（`WP-04`）**：位于 `src/engine/actors/BallisticsSystem.tsx`、`src/engine/physics/armoryPhysics.ts` 与 `src/features/workbench/BallisticsTelemetryHud.tsx`，覆盖 17 款轻武器口径（含 `.30-30 Win` 与 `7.92×57mm Mauser`）、2 款 `400 gr` 碳纤维猎箭/弩箭及 4 款重型火炮弹药（`30×173mm GAU-8 PGU-14/B API`、`88×571mmR PzGr.39`、`120×570mm NATO APFSDS`、`125mm DTC10-125 APFSDS`），含 60fps 零重绘膛压 $P(t)$（`MPa`）/ 膛内初速 $V(t)$（`m/s`）/ 动能（`J / MJ`）示波器、枪管黑体辐射热红（`1,100K`）与动态膛口积碳（`armoryShader.ts`）。
- **1,000m RK4 G1/G7 千米外弹道、三维交互实弹靶场与子弹时间追踪镜头（`[R]` / `?screen=ballistics`，`WP-14` + `WP-28`）**：位于 `src/engine/physics/externalBallistics.ts` 与 `src/features/ballistics/{ExternalBallisticsView,Range3DScene,range3DMath,range3DAudio,externalBallisticsStrings}.ts*`，以纯 TypeScript Zero-GC RK4 3-DOF 引擎实时解算全部 **23 套弹头/箭矢/航炮/坦克主炮弹气动档案**，并新增 **1,000m 3D 交互实弹靶场**（支持 `Range Overview / Bullet-Cam / Spotter FLIR` 三视角、AR500 钢靶受击单摆摆动与 `d/343` 声速回传延音、10% 弹道明胶瞬态空腔膨胀、动态风旗、发光 Mach 1.0 跨音速环与 `DOPE Dial / Elev Only / Raw Zero` 实射验证），联动 FFP MIL 圣诞树分划板与 7 档 `MIL / MOA` DOPE 射表。
- **直接手操拉机柄/套筒/杠杆、膛内验枪（`Press-Check [P]`）与快慢机多档位火控交互（`WP-08`）**：位于 `src/engine/interaction/InteractiveActionController.tsx`，覆盖全馆 34 款展品（含 M1911 套筒/拇指保险、MG 42 开膛拉柄、K98k 90° 抬栓拉机、Thompson 顶置拉机柄及 GAU-8/A 液压驱动循环）。
- **6 大机械职能语义分色（`[T]`）与 60fps 高压火药燃气导流可视化（`WP-05`）**：位于 `src/engine/materials/engineeringRoles.ts`、`src/engine/actors/GasFlowVisualizer.tsx` 与 `src/features/workbench/EngineeringTintLegend.tsx`，零着色器重编译实现全库 **854 个零件** 语义分色及燃气流线（含 V6.0 消音器 5 级 K 挡板螺旋涡流与制退器双侧后掠尾焰）。
- **两级拆装实操（野战快拆 + 全枪精拆 DAG、`[G]`，`WP-07` + `WP-23`）、限时盲拆与未知故障盲考认证护照（`?panel=passport`，`WP-13` + `WP-23`）及 1:1 坦克乘员 FLIR 火控（`?panel=crew`，`WP-23`）**：位于 `src/engine/fieldstrip/{fieldStripSpecs,detailStripGenerator,fieldStripStore}.ts`、`src/engine/malfunctions/`、`src/engine/exam/armorerExamStore.ts`、`src/features/passport/ArmorerPassportModal.tsx`、`src/engine/tank/tankCrewStore.ts` 与 `src/features/workbench/{FieldStripHud,MalfunctionHud,TankCrewHud}.tsx`，覆盖全部 **34 款展品** 两级无环拆装 DAG、4 类典型故障排障盲考、可导出/导入 JSON 的军械师精通护照，以及 4 款 1:1 主战坦克 360° 炮塔回转、耳轴俯仰、激光测距火控解算与炮长 FLIR 白热瞄准镜。
- **1:1 3D 军械游标卡尺（`[K]`，`WP-10`）、9×9×9 流派对照矩阵（`[S]`，`WP-11`）、1894–2026 百年演化时间线（`?panel=timeline`，`WP-24`）与 17+4 口径 1:1 弹药/炮弹纵剖实验室（`[B]`，`WP-06` + `WP-15` + `WP-17` + `WP-18` + `WP-25b` + `WP-30`）**：涵盖全馆 **34 款展品** 毫米级表面测绘、**30 组跨时代经典对决预设**（含 V6.0 新增 `M1911 vs P08`、`K98k vs Garand`、`MG 42 vs M249`、`Thompson vs Vector`、`GAU-8 vs M134D`、`GAU-8 vs ZTZ-99A` 等 9 组）、6 大历史谱系与 4+ 条策展巡礼路线（`HistoryTimelineModal.tsx`），以及 **17 款轻武器实弹**（新增 `7.92×57mm Mauser`）+ **4 款重型火炮/航炮弹**（新增 `30×173mm PGU-14/B API` 与 `88/120/125mm` 坦克炮弹）双展厅 `1:1` 纵剖矩阵。
- **浏览器原生 1080p 导演视频录制（`?panel=reel`，`WP-22`）、高清 3D 分享海报（`[U]`，`WP-16`）、PWA 离线博物馆（`?panel=offline`，`WP-25a`）与 34/34 Cycles 17 图版绘本/图鉴打印工坊（`Ctrl/Cmd+P`）**：支持一键录制 `1920×1080 (16:9)` / `1080×1920 (9:16)` WebM/MP4 声画同步导演短片（`DirectorReelModal.tsx`）、合成 `16:9 / 4:5` 带二维码与认证章海报（`PosterShareModal.tsx`）、按展品离线缓存全部模型/贴图/配音至浏览器 Service Worker（`OfflineMuseumModal.tsx` + `public/sw.js`），以及基于全馆 **34/34 展品 Cycles 2880×1800 透明底印刷主图**（`public/plates/manifest.json`，共 `340` 张 `.webp`）排版输出儿童 3D 绘本、DK 视觉百科与收藏图鉴。
- **全馆藏中英双语四幕研发纪录片 + 1,980 段 Gemini TTS 语音导览 + 3D 导演运镜 & 4 场所卷积混响 / 钢材频散波导声场**：包含 `public/narrations/*.json`（34 套）、`public/audio/`（**1,980 条 `Charon` `gemini-3.8-flash-tts` 语音**，全量经 `scripts/narrations/.cache/*_tts_hashes.json` 34 份 SHA-256 校验清单锁死）、浏览器 `speechSynthesis` 兜底（`src/narration/audioPlayer.ts`）、四幕自动镜头编排（`src/narration/storyDirector.ts`）与 4 档立体声卷积脉冲响应 + 欧拉-伯努利钢材频散波导（`src/engine/audio/{acousticImpulse,mechanicalSoundEngine}.ts`，含 MG 42 1,200 RPM “撕布声”、Thompson 50 发圆鼓连射、K98k 90° 拉栓咔哒、M1911 锻钢套筒闭锁、GAU-8/A 3,900 RPM `"BRRRT!"` 低频咆哮，以及全部轻武器/弓弩/主战坦克声效）。

---

## 3. 十一大阶段 · 30 个具体工程包 + 4 项 V3.0 照片级升级拆解（Execution Roadmap: `WP-01` ~ `WP-30` & `PR-01` ~ `PR-04`）

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

### 阶段八：V3.1「人类机械奇观」殿堂扩馆（已完成，`WP-17` · `BAY-20 ~ BAY-23`）
- [x] **WP-17｜扩充 `BAY-20 ~ BAY-23` 四款世界级机械奇观与 4 大新口径弹药（19 → 23 款全照片级馆藏，100% 闭环签收）**
  - **目标模块**：`src/weapons/{g11,vss,m134,an94}/`、`scripts/blender/build_{g11,vss,m134,an94}_photoreal.py`、`public/models/`、`public/textures/`、`src/engine/{geometry,ballistics,physics,fieldstrip,malfunctions,caliper,audio,cartridges}/`、`src/features/{armory,monograph,workbench,ballistics}/`、`src/i18n/`、`public/narrations/`、`public/audio/`、`tests/`、`docs/screenshots/`、`README.md`
  - **交付与验收**：严格遵循第 4、5 节 V3.0 照片级双轨与 `Charon` TTS 宪法，一步到位交付 4 款 Blender 5.2 高模 Draco `.glb` + 12 套 2K 5-Ch Packed ORM WebP 套件 + 完整 CSG 兜底与 8 个 `aSpringParam` 动态弹簧 + 230 条 `Charon` `gemini-3.8-flash-tts` 语音（全馆达 **23/23 展品 / `579` 零件 [`529` GLB + `50` 动态 CSG] / `313` 张 2K WebP [`103` Albedo + `105` Normal + `105` ORM，`0` PNG] / `1,342` 条 `Charon` 语音 / `15` 口径 `1:1` 纵剖弹药 / `17` 套 RK4 外弹道档案 / 8×8×8 流派 16 组对决**）及全量 **75 镜 1920×1080 真机无头 Chromium 像素级 QA 签收（`consoleErrors === 0`、`pageErrors === 0`、`91/91` 实体件 `isGlbAsset === true`、`8/8` 动态弹簧 `aSpringParam`、`0` `colorSpace` 违规）**：
    1. [x] `BAY-20` **H&K G11 K2 (`4.73×33mm DM11` 无壳弹)**（`2.06 MB`，`22` 精模 + `2` 动态 CSG 弹簧 = `24` 零件）：90° 旋转圆柱弹膛（Rotary Breech Cylinder）+ 钟表级齿轮棘爪连杆 + 2,100 RPM 浮置三连发机匣总成 + 41 发置顶无壳方弹柱与 `4.73×33mm DM11` 方形 HITP 药块 `1:1` 纵剖弹药（已完成）；
    2. [x] `BAY-21` **VSS Vintorez (`9×39mm SP-5/SP-6` 亚音速微声弹)**（`2.23 MB`，`22` 精模 + `2` 动态 CSG 弹簧 = `24` 零件）：整体式三排多孔泄气枪管 + 6 级斜挡板膨胀消音室 + 6 闭锁突笋旋转枪机 + 直线击锤 + 俄制 `PSO-1M2-1` 瞄准镜与层压桦木镂空枪托 + `9×39mm` 亚音速弹药纵剖（已完成）；
    3. [x] `BAY-22` **GE / Dillon Aero M134D Minigun (`7.62×51mm NATO`)**（`3.31 MB`，`23` 精模 + `2` 动态 CSG 弹簧 = `25` 零件）：28V DC 电动双绕组电机驱动六管旋转枪管簇 + 360° 机匣正弦螺旋凸轮轨道同步驱动 6 套枪机波浪循环 + 无链星轮供弹器（Delinker）+ `7.62×51mm NATO` 实弹纵剖（已完成）；
    4. [x] `BAY-23` **Nikonov AN-94 "Abakan" (`5.45×39mm 7N6`)**（`2.92 MB`，`24` 精模 + `2` 动态 CSG 弹簧 = `26` 零件）：浮置枪管/机匣整体长后坐 + 内部钢索滑轮（Pulley & Cable）1,800 RPM 双发延迟后坐 + 15° 右倾紫红弹匣（含局部倾斜 Z 剖切与 26 发弧形弹柱）+ 8 字形双室制退器与 `5.45×39mm 7N6` 实弹纵剖（已完成）。

### 阶段九：V4.0「重装装甲展厅」1:1 真实尺度主战坦克殿堂（已完成，`WP-18` · `BAY-24 ~ BAY-27`）
- [x] **WP-18｜扩充重装装甲展厅（`armor`）与四款 1:1 真实尺度主战坦克（23 → 27 款全照片级馆藏，100% 闭环签收）**
  - **目标模块**：`src/weapons/{ztz99a,m1a2,leopard2a7,tiger1}/`、`scripts/blender/build_{ztz99a,m1a2,leopard2a7,tiger1}_photoreal.py`、`src/engine/canvas/{GunsmithStageMat,ArmoryViewport,CaliperActor,turntableStageMetrics}.ts*`、`src/engine/actors/{PartActor,StencilSectionCap,BallisticsSystem,GasFlowVisualizer,CartridgeCutawayStage}.tsx`、`src/features/{armory,workbench,cartridges,ballistics,monograph}/`、`src/i18n/`、`public/{models,textures,narrations,audio}/`、`tests/`、`docs/screenshots/`、`README.md`
  - **交付与验收**：严格保持 `1 world unit = 1 cm = 10 mm` 实车 `1:1` 尺度，自动切换「`1:1` 重装装配机库 32-bit Cycles `.hdr`（`heavy_armor_hangar.hdr`，`1.33 MB`）+ `18 m × 12 m` 边缘羽化做旧混凝土地坪（`Y = -120.0 cm`，含自流平暗色油渍、履带碾压痕与 Ultra `4096×4096` 主光阴影）+ `camera.near = 2.0 / far = 9000` 远景光学 + `±1,800 mm` 大尺度活体 CT 纵剖面（`hatchScale = 8`）」，并全量完成 **A+B+C 写实大升级**（直射光微阴影/Lagarde 镜面遮蔽/`512px` 三平面 RNM RHA/CARC 微细节/光学 AR 菲涅耳虹彩 + 四款坦克全部 8 套外观图集升级 `4096×4096` + 单侧 `74–96` 块独立铰接下垂履带板与博物馆级次级车体/炮塔细节），新增 3 款 `1:1` 主战坦克主炮弹药纵剖（`125mm DTC10-125` `PLA GJB`、`120mm NATO APFSDS`、`88mm PzGr.39`）与 `240` 条 `Charon` `gemini-3.8-flash-tts` 语音（全馆达 **27/27 展品 / `683` 零件 [`625` GLB + `58` 动态 CSG] / `351` 张 2K/4K WebP [`115` Albedo + `118` Normal + `118` ORM/细节，`80` 贴图套件含 `24` 张 4K 坦克外观图 + `2` 张 512px 装甲微细节，`0` PNG] / `4` 套 32-bit `.hdr` / `1,582` 条 `Charon` 语音 / `15+3` 弹药纵剖 / `20` 套 RK4 外弹道档案 / `9×9×9` 流派 `19` 组对决**），全部 **27 镜 `1920×1080` 真机 Chromium 像素级 QA 闭环签收（`consoleErrors === 0`、`pageErrors === 0`、`failedRequests === 0`、`96/96` 坦克实体件 `0` 非流形、履带 `0.00 cm` 贴地且 `t = 1.0` 零地坪穿模、小口径枪械零压黑回归）**：
    1. [x] `BAY-24` **🇨🇳 ZTZ-99A 主战坦克 (`125mm ZPT-98 L/50`)**（`10.27 MB`，`234,540` tris，`24` 精模 + `2` 动态 CSG 弹簧 = `26` 零件，2×4K 外观 + 1×2K 内部）：86 块/侧双销挂胶独立下垂履带、战斗室底部 22 发盘式自动装弹机 + FY-4 楔形爆反装甲 + JD-3 红宝石 AR 窗口/CITV 绿宝石光瞄 + 尾舱置物篮/双鞭状天线/150HB 1,500 马力 V12 柴油机（已完成）；
    2. [x] `BAY-25` **🇺🇸 M1A2 SEP v3 艾布拉姆斯 (`120mm M256 L/44`)**（`9.94 MB`，`268,300` tris，`24` 精模 + `2` 动态 CSG 弹簧 = `26` 零件，2×4K 外观 + 1×2K 内部）：74 块/侧 T158 独立下垂履带、全宽复合装甲翼子板与侧裙铰链、尾舱防爆泄压隔门/置物篮装备 + 密闭 NGAP 贫铀复合装甲夹层 + CWS 6 块潜望镜环/SINCGARS 天线 + AGT1500 燃气轮机涡轮剖视（已完成）；
    3. [x] `BAY-26` **🇩🇪 豹 2A7V (`120mm Rh-120 L/55A1`)**（`11.27 MB`，`216,656` tris，`24` 精模 + `2` 动态 CSG 弹簧 = `26` 零件，2×4K 外观 + 1×2K 内部）：84 块/侧 Diehl 570FT 独立下垂履带、6.6 米超长滑膛炮 + 锐利箭簇中空复合装甲楔块 + 车灯防撞笼/炮塔尾篮迷彩网/PERI R17A3 光瞄 + MTU MB 873 V12 双涡轮整体吊装动力包（已完成）；
    4. [x] `BAY-27` **🇩🇪 虎式 I 重型坦克 Tiger 131 (`88mm KwK 36 L/56`)**（`10.32 MB`，`210,148` tris，`24` 精模 + `2` 动态 CSG 弹簧 = `26` 零件，2×4K 外观 + 1×2K 内部）：96 块/侧 725mm Kgs 63 独立重型下垂履带 + 标志性 48 轮交错负重轮（Schachtellaufwerk）+ 88 毫米克虏伯横楔炮闩 + 费菲尔滤清器/穿孔排气管防烫罩/博世千斤顶/炮塔挂装备用履带 + 迈巴赫 HL230 V12 引擎与 4K 锯齿防磁装甲（已完成）。

### 阶段十：V5.0 物理对比巅峰、导演录屏、坦克火控与跨世代经典补完（已完成，`WP-19` ~ `WP-25b` · `BAY-28 ~ BAY-29`）
- [x] **WP-19｜单画布双裁剪实时 3D 分屏对决工作台（Live 3D Split-Screen Showdown）**
  - **目标模块**：`src/features/showdown3d/{SplitShowdownViewport,SplitShowdownOverlay}.tsx`、`src/features/showdown3d/{splitShowdownCamera,splitShowdownStrings}.ts`、`src/styles/split-showdown.css`、`src/engine/actors/MagazineAmmoStack.tsx`、`src/store/useAppStore.ts`、`src/app/useUrlStateSync.ts`、`src/features/armory/MechanismShowdownModal.tsx`、`tests/wp19Wp21SplitAndTriAxial.test.ts`
  - **交付与验收**：在单 WebGL 画布内通过双 Scissor 视口实现全馆任意两款展品并行实时 3D 对决（`?screen=split_showdown&weaponA=<a>&weaponB=<b>`），支持锁步/独立轨道视角切换、跨尺度自适应取景（轻武器 vs `1:1` 主战坦克 `far = 9000`）、同步火控击发/爆炸拆解/CT 纵剖/X-Ray、独立弹匣弹柱覆盖与 `WP-11` 流派对照一键启动。
- [x] **WP-20｜实时耦合机械因果沙盒与 `1:1` 复合装甲穿甲物理实验室（Causality Sandbox & Composite Armor Penetration Lab）**
  - **目标模块**：`src/engine/physics/{causalitySandbox,armorPenetration}.ts`、`src/features/sandbox/{CausalitySandboxModal,causalitySandboxStrings}.ts*`、`src/features/armorlab/{ArmorPenetrationModal,armorPenetrationStrings}.ts*`、`src/features/workbench/commandPaletteEngine.ts`、`tests/wp20CausalityAndArmorPenetration.test.ts`
  - **交付与验收**：交付 **实时耦合因果沙盒（`?panel=causality`）**，将装药膛压、导气孔通径、枪机质量与复进簧刚度实时耦合至 3D 击发循环与射速，量化演示过气提前开锁与短后坐卡壳（FTE）；同步交付 **`1:1` 复合装甲穿甲实验室（`?panel=armor`）**，基于 Lanz-Odermatt 长杆穿甲方程（`125mm DTC10-125`、`120mm M829A4 / DM63`）与 De Marre 均质钢方程（`88mm PzGr.39`、`.50 BMG M2 AP`），解算四款主战坦克四防区（FY-4 爆反 / NERA 陶瓷 / 贫铀夹层 / RHA）在 `500–3,500 m` 射程与着角下的等效防护、穿透状态与跳弹临界角。
- [x] **WP-21｜三轴正交活体 CT 切片器、6 面 3D 局部剖切盒与身管黑体热辐射（Tri-Axial CT Slicer & 6-Plane Slice Box）**
  - **目标模块**：`src/engine/actors/{StencilSectionCap,SectionBoxGuide}.tsx`、`src/features/workbench/LiveSectionPlaneBar.tsx`、`src/engine/materials/armoryShader.ts`、`tests/wp19Wp21SplitAndTriAxial.test.ts`
  - **交付与验收**：升级 Stencil 剖切引擎支持 `Z` 纵剖、`X` 横截与 `Y` 俯视切顶三轴正交实时切换及 **6 平面 3D 剖切盒**（配 `SectionBoxGuide` 实时线框指示），覆盖轻武器与 `1:1` 主战坦克大尺度包络（`tankXRange.max = 650 cm`）；叠加 `armoryShader.ts` 连续射击身管黑体辐射热红（`1,100K`）与累积膛口积碳。
- [x] **WP-22｜浏览器原生 1080p 导演级视频录制工坊（Director Reel Video Capture）**
  - **目标模块**：`src/features/video/{DirectorReelModal,directorReelRecorder,directorReelStrings}.ts*`、`src/engine/audio/{acousticImpulse,mechanicalSoundEngine}.ts`、`src/narration/audioPlayer.ts`、`src/styles/director-reel.css`、`tests/wp22Wp23VideoDetailCrew.test.ts`
  - **交付与验收**：支持在浏览器内免后端录制 `1920×1080 (16:9)` 横屏与 `1080×1920 (9:16)` 竖屏 WebM/MP4 声画同步导演短片（`?panel=reel`），实时混录 WebGL 画布、四场所卷积混响/欧拉-伯努利波导机械声效与 `Charon` TTS 旁白，一键命名导出。
- [x] **WP-23｜两级全枪精拆 DAG、军械师精通认证护照与 `1:1` 坦克乘员 FLIR 火控系统（Detail Strip, Armorer Passport & Tank Crew FCS）**
  - **目标模块**：`src/engine/fieldstrip/detailStripGenerator.ts`、`src/engine/exam/armorerExamStore.ts`、`src/features/passport/{ArmorerPassportModal,passportStrings}.ts*`、`src/engine/tank/tankCrewStore.ts`、`src/features/workbench/TankCrewHud.tsx`、`tests/wp22Wp23VideoDetailCrew.test.ts`
  - **交付与验收**：为全馆展品自动生成无环两级全枪精拆 DAG（野战快拆 + 全零件精拆）；上线可导入/导出 JSON 备份的 **军械师精通护照（`?panel=passport`）** 记录快拆/精拆/故障盲考等级；面向 4 款 1:1 主战坦克交付 **乘员舱火控 HUD（`?panel=crew&optic=flir`）**，支持 360° 炮塔回转、耳轴俯仰、激光测距弹道表尺/提前量（`MIL`）实时解算与炮长 FLIR 白热瞄准镜。
- [x] **WP-24｜`1894–2026` 人类轻武器与装甲工程百年演化时间线（Interactive Engineering History Timeline）**
  - **目标模块**：`src/features/timeline/{HistoryTimelineModal,historyTimelineSpecs}.ts*`、`src/styles/timeline-museum.css`、`tests/wp24Wp25TimelineKtx2Pwa.test.ts`
  - **交付与验收**：构建覆盖全馆全部展品、横跨 6 大历史技术谱系与 4+ 条策展巡礼路线的交互式百年技术谱系时间线（`?panel=timeline`），支持祖先脉络图谱跳转与中英双语零 CJK 渗漏验证。
- [x] **WP-25a｜KTX2 / Basis Universal 纹理管线底座与 PWA 离线博物馆管理器（KTX2/Basis & Offline PWA Museum）**
  - **目标模块**：`public/basis/basis_transcoder.{js,wasm}`、`public/textures/ktx2-manifest.json`、`scripts/build_ktx2_textures.mjs`、`src/engine/materials/{ktx2Support,pbrManager}.ts`、`public/{manifest.webmanifest,sw.js}`、`src/engine/offline/offlineMuseumManager.ts`、`src/features/offline/OfflineMuseumModal.tsx`、`tests/wp24Wp25TimelineKtx2Pwa.test.ts`
  - **交付与验收**：部署自托管 Basis WASM 解码器、KTX2 优先/WebP 无缝回退加载链、子路径安全 PWA 清单与 Service Worker，以及按展品粒度一键缓存/校验离线资产的 **离线博物馆面板（`?panel=offline`）**。
- [x] **WP-25b｜扩充 `BAY-28 ~ BAY-29` 跨世代传奇杠杆步枪与泵动霰弹枪（27 → 29 款，V5.0 里程碑闭环）**
  - **目标模块**：`src/weapons/{winchester1894,rem870}/`、`scripts/blender/build_{winchester1894,rem870}_photoreal.py`、`src/engine/cartridges/cartridgeSpecs.ts`、`src/engine/physics/externalBallistics.ts`、`public/{models,textures,narrations,audio,plates}/`、`docs/screenshots/v5-*.jpg`、`tests/*.test.ts`
  - **交付与验收**：完成 **29/29（100%）** Blender 5.2 高模 Draco `.glb` + 2K Packed ORM + `2880×1800` Cycles RGBA DK 印刷主图 + `112` 条 `Charon` `gemini-3.8-flash-tts` 语音（阶段十收官达 **29 款展品 / `731` 零件 [`667` GLB + `64` 动态 CSG] / `369` WebP / `86` PBR 套件 / `290` DK 图版 / `1,694` 语音 / `16+3` 弹药纵剖 / `21` 外弹道档案 / `21` 组经典对决**）：
    1. [x] `BAY-28` **Winchester Model 1894 (`.30-30 Winchester`)**（`1.40 MB` 总资产，`21` 精模 + `3` 动态 CSG 弹簧 = `24` 零件）：约翰·勃朗宁下垂闭锁楔块与下压指环杠杆四连杆运动学 + 管状弹仓垂直供弹升降托板（Carrier）+ `.30-30 Win` 170gr 平头软尖弹 `1:1` 纵剖（已完成）；
    2. [x] `BAY-29` **Remington Model 870 Police Magnum (`12 Gauge 2¾" / 3"`)**（`1.25 MB` 总资产，`21` 精模 + `3` 动态 CSG 弹簧 = `24` 零件）：整块锻钢机匣 + 罗纹黑胡桃木护木双驱动连杆（Twin Action Bars）+ 上倾闭锁块（Locking Block）+ 左侧单/双阻铁弹壳拦截片与升降托弹板（Carrier）运动学（已完成）。

### 阶段十一：V6.0 基建硬化、三维物理剧场与十殿堂传奇扩馆（已完成，Tracks A + B + C · `WP-26` ~ `WP-30` · `BAY-30 ~ BAY-34`）
- [x] **WP-26（Track A）｜生产级 `toktx` KTX2 管线、资产预算审计器、重媒体 CDN 路由与 1080p 视觉回归自动门禁**
  - **目标模块**：`scripts/build_ktx2_textures.mjs`、`scripts/audit_asset_budget.mjs`、`scripts/qa_visual_gate.mjs`、`src/engine/utils/assetUrl.ts`、`src/vite-env.d.ts`、`package.json`、`tests/trackAInfra.test.ts`
  - **交付与验收**：升级 `build_ktx2_textures.mjs` 支持真实 Khronos `toktx` 调用（自动通过 `dwebp` / Pillow / `ffmpeg` 将 WebP 转为临时 PNG，法线/ORM 走 UASTC+Zstd 线性、反照率走 ETC1S sRGB，缺 `toktx` 时零破坏保留 WebP 回退）；上线 **`npm run assets:audit`**（全量审计 6 大 `public/` 目录、`dist/` 与 `34/34` 展品 `<= 12 MB` 预算）；上线 **`VITE_CDN_ASSET_BASE_URL`** 可选重媒体 CDN 路由（将 `audio/`、`textures/`、`models/`、`plates/`、`hdri/` 自动指向外部 CDN，同时保持本地根路径 `/` 与 `/digital-armory-3d/` 子路径及 `narrations/sw.js/draco/basis` 同源幂等）；上线 **`npm run qa:visual`** 零依赖 Node 22+ CDP / Playwright 1920×1080 无头 Chromium 自动化门禁（硬断言 `consoleErrors === 0`、`pageErrors === 0`、`failedRequests === 0`、WebGL 稳帧并输出 `qa-report.json`）。
- [x] **WP-27（Track B1）｜`1:1` 复合装甲三维慢动作穿甲剖视剧场（3D Armor Penetration Theater）**
  - **目标模块**：`src/features/armorlab/{ArmorPenetration3DScene.tsx,ArmorPenetrationModal.tsx,armorPenetration3DMath.ts,armorPenetrationStrings.ts}`、`src/engine/physics/armorPenetration.ts`、`src/styles/armor-penetration.css`、`docs/screenshots/v6-armor-3d.jpg`、`tests/armorPenetration3D.test.ts`
  - **交付与验收**：在 `WP-20` 穿甲实验室内置完整 **3D 慢动作穿甲剖视剧场**（支持 `3D 剖视剧场 / 2D 原理剖图 / 3D+2D 双屏` 三视图与 `0.15x / 0.5x / 1x` 时间轴拖拽），覆盖 **5 款动能穿甲弹**（`125mm DTC10-125`、`120mm M829A4 / DM63`、`88mm PzGr.39`、新增 `30×173mm GAU-8 PGU-14/B API`、`.50 BMG M2 AP`）× 4 款主战坦克 × 4 防区，Zero-GC 实时演绎 ERA 双飞板爆轰剪切、长杆弹体消耗与高温流体侵彻空腔、背板穿透后车内高速崩落粒子锥（Spall Cone）及大着角跳弹偏转。
- [x] **WP-28（Track B2）｜`1,000m` 三维交互实弹靶场与子弹时间追踪镜头（3D 1,000m Firing Range & Bullet-Cam）**
  - **目标模块**：`src/features/ballistics/{Range3DScene.tsx,ExternalBallisticsView.tsx,range3DMath.ts,range3DAudio.ts,externalBallisticsStrings.ts}`、`src/styles/external-ballistics.css`、`docs/screenshots/v6-range-3d.jpg`、`tests/range3D.test.ts`
  - **交付与验收**：在 `WP-14` 外弹道实验室新增全尺寸 **1,000m 3D 交互实弹靶场**，1:1 映射全部 **23 套 RK4 3-DOF 气动档案**（含新增 `7.92×57mm Mauser 198gr s.S.` 与 `30×173mm PGU-14/B API`），支持 `Range Overview / Bullet-Cam / Spotter FLIR` 三机位（含白热热成像对比度校准）、`DOPE Dial / Elev Only / Raw Zero` 三瞄准模式、AR500 钢靶吊链物理单摆与 `d/343` 真实声速回传延音、10% 弹道明胶瞬态空腔膨胀、动态横风旗阵与发光 Mach 1.0 跨音速圆环。
- [x] **WP-29（Track B3）｜物理耦合模块化光学瞄具与枪口改装工作台（Physically Coupled Modular Optics & Muzzle Bench `[O]`）**
  - **目标模块**：`src/engine/attachments/{attachmentSpecs,attachmentStore}.ts`、`src/engine/actors/{AttachmentActor,BallisticsSystem,GasFlowVisualizer,PartActor}.tsx`、`src/engine/audio/mechanicalSoundEngine.ts`、`src/engine/physics/armoryPhysics.ts`、`src/features/workbench/{AttachmentBenchPanel,BallisticsTelemetryHud,WorkbenchHeader}.tsx`、`src/styles/attachment-bench.css`、`docs/screenshots/v6-mods-cutaway.jpg`、`tests/attachmentBench.test.ts`
  - **交付与验收**：为全馆 **34 款展品** 标定世界空间 `boreY` 零缝齐平枪口锚点与导轨锚点（智能跳过弓弩/主战坦克/航炮并给出工程提示），提供 4 枪口（原厂 / 钛合金 7 级 K 型挡板消音器 / 双室竞技制退器 / 三叉消焰器）× 4 光学（原厂 / 红点 / 1–8×24 LPVO 悬臂镜 / 串列 FLIR 热成像）× 4 预设（`Stealth Ops / CQB Race / DMR Precision / Factory`），快捷键 `[O]` 呼出并打通 **四维真实物理耦合**：CT `[C]` 纵剖直视消音器 7 级 K 挡板/LPVO 5 片式镜组/FLIR 传感器 PCB、`GasFlowVisualizer` 挡板螺旋涡流与制退器双侧后掠尾焰、`mechanicalSoundEngine` 低通衰减/侧喷裂空声谱偏移，以及 `armoryPhysics` / 遥测 HUD 后坐上跳与初速实时联动。
- [x] **WP-30（Track C · `BAY-30 ~ BAY-34`）｜十殿堂传奇扩馆：四款跨世代轻武器经典 + 第十展厅「航空重武」`1:1` GAU-8/A 30mm 七管航炮（29 → 34 款全照片级大满贯）**
  - **目标模块**：`src/weapons/{m1911,mg42,k98k,thompson,gau8}/`、`scripts/blender/build_{m1911,mg42,k98k,thompson,gau8}_photoreal.py`、`src/weapons/{types,manifests,registry,geometryLoaders}.ts`、`src/engine/` 全子系统、`src/features/` 全实验室与 34 款矢量轮廓、`src/i18n/`、`public/{models,textures,narrations,audio,plates}/`、`tests/*.test.ts`
  - **交付与验收**：一步到位完成 5 款 Blender 5.2 高模 Draco `.glb` + 15 套 2K 5-Ch Packed ORM WebP（45 张）+ `50` 张 Cycles `2880×1800` RGBA DK 印刷主图 + `286` 段 `Charon` `gemini-3.8-flash-tts` 语音与 5 份 SHA-256 哈希清单，使全馆达到 **34/34（100%）展品 / 10 大展厅 / `854` 零件 [`775` GLB + `79` 动态 CSG] / `414` 张 2K/4K WebP [`136` Albedo + `139` Normal + `139` ORM/细节，`101` 套件，`0` PNG] / `1,980` 段 `Charon` TTS 语音 / `340` 张 Cycles DK 图版 / `17+4` 纵剖弹药 / `23` 套 RK4 外弹道档案 / `5` 款穿甲弹 / `30` 组流派经典对决**：
    1. [x] `BAY-30` **🇺🇸 Colt M1911A1 U.S. Army (`.45 ACP`)**（`1.88 MB` 总资产，`21` 精模 + `3` 动态 CSG 弹簧 = `24` 零件）：勃朗宁 `0.278"` 单绞链圆弧偏移短后坐 + 5" 枪管双半圆顶部闭锁筋 + 纯水平直推 U 形扳机框 + 一簧三用三叉板簧与 Condition 1 / 握把双重保险（已完成）；
    2. [x] `BAY-31` **🇩🇪 MG 42 通用机枪 (`7.92×57mm Mauser`)**（`1.88 MB` 总资产，`22` 精模 + `3` 动态 CSG 弹簧 = `25` 零件）：冷冲压多孔散热护筒 + 锥形枪口助退器 `8.5 mm` 短后坐 + 对称双淬火滚柱刚性闭锁（`1,200 RPM` “撕布声”）+ 右侧 5 秒铰接快换枪管门 + 顶盖 S 槽双向拨弹爪与 50 发 Gurttrommel 34 突击弹鼓（已完成）；
    3. [x] `BAY-32` **🇩🇪 Mauser Karabiner 98k (`7.92×57mm Mauser`)**（`1.77 MB` 总资产，`21` 精模 + `3` 动态 CSG 弹簧 = `24` 零件）：毛瑟 98 前双主突笋 + 后第三保险突笋 `90°` 旋转拉栓 + 全长不旋转大抓钩受控供弹（CRF）+ 三档翼形旗式保险 + 5 发黄铜桥夹双排内置弹仓与 `7.92×57mm` 1:1 实弹纵剖（已完成）；
    4. [x] `BAY-33` **🇺🇸 Thompson M1928A1 (`.45 ACP`)**（`1.71 MB` 总资产，`22` 精模 + `3` 动态 CSG 弹簧 = `25` 零件）：整块立铣深烤蓝机匣 + `45°` 斜槽铸造磷青铜 H 型布利什延迟锁块 + 28 道径向散热鳍枪管与四槽卡茨防跳器 + 顶置滚花拉机柄 + 50 发 L 型发条阿基米德螺旋大弹鼓（已完成）；
    5. [x] `BAY-34` **🇺🇸 GE GAU-8/A「复仇者」30mm 七管航炮 (`30×173mm PGU-14/B API` · 第十展厅 `ordnance`)**（`2.87 MB` 总资产，`22` 精模 + `3` 动态 CSG 弹簧 = `25` 零件）：`1:1` 全尺寸 `6.06 m`（含 `1,150` 发 `Ø876 mm` 闭环无链螺旋弹鼓与空壳返鼓通道，满载 `1,828 kg`）+ 七根 `2,300 mm` 冷锻 30mm 旋转炮管簇（`3,900 RPM`）+ 双 `38.5 HP` 3,000 PSI 液压马达 + `360°` 正弦螺旋凸轮导轨驱动七套钛合金旋转炮闩 + `30×173mm` 1:1 航炮弹纵剖与穿甲/外弹道全链路耦合（已完成）。

---

## 4. 智能体工程红线与架构约束（Architecture Invariants & Agent Rules）

所有在本仓库协作的智能体与开发者必须严格遵守以下不可妥协的工程红线（项目宪法）：

1. **CAD 尺度与右手坐标系**：严格遵循 `1 world unit = 1 cm`（UI 展示毫米需 `× 10`）；`+X` 朝枪口前方、`+Y` 朝上、`+Z` 朝枪身右侧。纵向剖视平面沿中轴剖开右侧机匣/套筒壳体。
2. **Blender 5.2 LTS 单文件双轨雕塑与 Cycles Metal GPU 烘焙宪法**：
   - 严禁引入来历不明或闭源版权第三方 3D 模型；所有高精度 `.glb` 资产必须由仓库内可复现 MIT 开源单文件脚本（`scripts/blender/build_<id>_photoreal.py`，内建 `--postprocess` 后处理子进程）通过 Blender 5.2 LTS 程序化高模雕塑与 Cycles Metal GPU 烘焙生成，单款展品总资产（Draco `.glb` + 全部 2K WebP）严格控制在 **`≤ 12 MB`**（目标 `2.1–4.5 MB`）。
   - **坐标系与 Option A 烘焙铁律**：Blender Z-up 严格采用右手正旋转 `(bx, by, bz) = (tx, -tz, ty)`（`det = +1`）；先在 `assembledPos/assembledRot` 装配位烘焙真实接触阴影 AO，导出 Draco glTF 2.0 前全部重置为单位矩阵 `(0, 0, 0)` 局部坐标（严格保证 **`0` 非单位变换、`0` 非流形边、`nodes === meshes === pbrOverrides`**）。
   - **双轨动静分离铁律**：凡在 `computeFiringKinematics` 中由 `scaleX` 驱动 GPU 实时形变的部件（螺旋弹簧压缩、V 形主簧、复合弓弩四片式弓片/凸轮轴/弓弦缆绳），**必须**列入 `glbAssetService.ts` 的 `dynamicSpringParts` 留在 Web Worker CSG 轨道保留 `aSpringParam` 属性；其余实体件全量走 Blender 5.2 水密高模 `.glb`，同时保留 CSG 离线零拷贝兜底。
3. **3×2K/4K 5-Ch Packed ORM WebP 与 UV 防火墙铁律**：
   - 每款展品独立配置 3 套贴图套件（轻武器/弓弩/航炮 `3×2048×2048`，主战坦克外观 `2×4096×4096` + 内部 `1×2048×2048`，配合全局共享 `512×512` 无缝微细节图 `armor_detail_{normal,roughness}.webp`；文件命名 `public/textures/<id>_v3_<suite>_{albedo,normal,roughness}.webp`），其中 `*_roughness.webp` 打包 5 通道 ORM（`R = AO, G = Roughness, B = Metalness`），全库严格保持 **`0` 张 PNG**；`pbrManager.ts` 必须通过 `lockLinearTextureColorSpace` 锁死法线/ORM/微细节线性色彩空间，严禁 `@react-three/fiber` v8 将其覆写为 `SRGB8_ALPHA8`。
   - **UV 排布与零渗色红线**：统一使用 `CONCAVE` UV 排布（`margin >= 0.0045`）；所有枪身铭文、兵工厂戳记、试枪章与 MIL-STD-130 UID 二维码必须映射至无畸变平面 Hero UV 带，确保 1:1 正向无镜像、无裁剪；所有高饱和强调色部件（安全橙托弹板、绯红快慢机/保险点、绿宝石/蓝宝石光学镀膜镜片、黄铜/绿尖弹链、荧光光纤瞄针）必须设置 **`>= 50 px` UV 隔离防火墙**，零色渗。
4. **AgX 真铁材质校准与几何防穿帮红线**：
   - 在 Three.js AgX 色调映射与双柔光条灯（`tactical_vault.hdr`）影棚下，暗色发黑/烤蓝/磷化钢平面 **严禁压黑**，基础反照率基线须维持 `sRGB 0.18–0.28`、缎面粗糙度 `R = 0.25–0.38`（哑光工程聚合物 `sRGB 0.16–0.22, M = 0.0, R = 0.56–0.70`），确保高光呈现丝绸级真铁光泽而非死黑塑料块。
   - **装配与剖面零穿帮红线**：扳机护圈必须前后实心焊接闭环零悬空；套筒/枪管鼻锥严禁内膛破壁；CT 纵剖面（`?cut=1`）下的弹匣托弹板与压缩弹簧必须精确位于实弹柱最底发正下方零穿模；超长/超高展品适配 `ArmoryViewport.tsx` 相机 `far >= 1200`（重装甲与航炮 `far = 9000`）严禁截断影棚天幕。
5. **60Hz 瞬态时钟 & 零 React 重渲染**：高频拆解插值与击发进度必须通过 `src/engine/clock/playbackClock.ts` 订阅并在 R3F `useFrame` 内以 Zero-GC 原地更新矩阵与几何属性，禁止将 60fps 连续进度写入 Zustand 或 React state 引发组件树重渲染。
6. **首屏秒开与 `<800 kB` 零告警分包纪律**：`src/weapons/manifests.ts` 仅保留轻量静态目录与相机预设；重型武器插件、CSG 几何与双语故事 JSON 必须保持动态按需懒加载，全部生产 Vite chunk 严格 `< 800 kB` 零体积告警，且全部静态资源路径经 `src/engine/utils/assetUrl.ts` 兼容 `/`、`/digital-armory-3d/` 子路径及可选 `VITE_CDN_ASSET_BASE_URL` 外部重媒体 CDN。
7. **中英双语 100% 对等**：任何新增功能、UI 词条（`src/i18n/uiStrings.ts`）、武器/弹药说明及故事旁白（`public/narrations/*.json`）必须同步提供专业准确的中文（`zh`）与英文（`en`）版本，英文严格零 CJK 字符。
8. **全馆藏统一配音与 TTS 合成宪法（不可篡改）**：所有武器的四幕研发纪录片（`story_act[1-4]_{zh,en}.mp3`）与全部零件语音讲解（`parts/<partId>_{zh,en}.mp3`）必须且仅能通过 `scripts/build_narrations.py` 调用 Google GenAI SDK 合成，全馆 100% 锁定统一声学基准（以 Glock 17 为标杆）：
   - **唯一模型与音色**：`model = "gemini-3.8-flash-tts"`，**`voice = "Charon"`**（严禁降级为 `flash-lite-tts` 或切换其他音色）。
   - **唯一旁白风格指令（`speech_metadata.style`）**：
     - 中文（`zh`）：`"沉稳磁性、富有历史厚重感与精密机械工程严谨度的纪录片旁白，语速适中自然，重点转折处略作停顿，吐字清晰饱满"`
     - 英文（`en`）：`"Authoritative, warm, articulate museum firearm historian and mechanical engineering documentary narrator, measured pace with natural cadence"`
   - **统一编码与哈希留痕**：统一经 `ffmpeg -ar 24000 -ac 1 -codec:a libmp3lame -b:a 64k` 转码输出 `24 kHz` 单声道 `64 kbps` MP3，并在 `scripts/narrations/.cache/<weaponId>_tts_hashes.json` 记录 `sha256("gemini-3.8-flash-tts|Charon|<style>|<audioScript>")`。
   - **严禁私自替换 TTS 引擎铁律**：**绝对禁止**使用 `edge-tts`（如 `YunxiNeural` / `ChristopherNeural`）、系统 `say` 或任何第三方 TTS 引擎生成音频写入 `public/audio/`！当环境变量 / `.env.local` 缺少 `GEMINI_API_KEY` 或遭遇 `402/429` 配额熔断时，智能体必须**立即中止配音生成并向用户如实报告阻塞**，提示配置 `GEMINI_API_KEY` 后运行 `uv run --with google-genai --with pydantic python3 scripts/build_narrations.py --weapon <id> --batch-tts --force-audio`，严禁擅自用替代音色绕过。
9. **科普安全边界、Git 纪律与路线图同步**：严禁导出任何可用于真实制造或 3D 打印的 STL / 公差蓝图；未经用户明确要求严禁私自 `git push` 至远端仓库；每完成并通过验收一个工程包（`WP-01` ~ `WP-30` / `PR-01` ~ `PR-04`），必须同步更新本 `AGENTS.md` 对应基线与复选框状态（`[x]`）。

---

## 5. 六道质量门禁标准（Verification & Quality Gates）

完成任意工程包、新武器实装或提交代码前，必须完整运行并全部通过以下 **五道自动化工程门禁 + 一道 1080p 真机视觉 QA 门禁**：

```bash
npm run typecheck      # 1. TypeScript 严格模式零错误
npm run lint           # 2. ESLint 零警告 / 零错误
npm test               # 3. Vitest 全量 34 展品几何、运动学、GLB/PBR、三维剧场与双语契约测试全部通过
npm run build          # 4. 生产环境多入口 (index.html + showcase.html) 分包构建零告警 (全部 chunk < 800 kB)
npm run assets:audit   # 5. 全馆 34/34 展品资产预算 (<= 12 MB) 与 6 大 public/ 目录体积审计
```

6. **1920×1080 实机无头 Chromium 逐像素视觉与运行时 QA（新增/重构 3D 资产强制门禁：`npm run qa:visual`）**：
   - 可运行 `npm run qa:visual -- --weapons <id> --cut` 或在真实浏览器（`http://127.0.0.1:5173/?screen=workbench&weapon=<id>`）逐一抓取 **影棚 3/4 全景、核心铭文微距、特色机构特写、实时 CT 纵剖面（`?cut=1`）与 `t = 1.0` 爆炸图** 并通过 `read_file` 逐像素人工/智能体目检；
   - 运行时断言强制全绿：`consoleErrors === 0`、`pageErrors === 0`、`failedRequests === 0`、实体件 `100%` `userData.isGlbAsset === true`、动态件 `100%` 保留 `aSpringParam`、`0` 线性/sRGB `colorSpace` 违规；
   - 发现任何悬空零件、穿模、破壁、铭文镜像/遮挡、色渗或压黑，**必须直接打回对应画师/工程师返工复验至 10/10**，并将最终签收的 1920×1080 实拍图归档至 `docs/screenshots/<id>-v6-hero.jpg`（或既有 `<id>-v3-macro.jpg`）并同步校验 `README.md` / `README.zh-CN.md` 零断链。

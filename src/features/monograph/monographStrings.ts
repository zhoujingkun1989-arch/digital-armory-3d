import type { CartridgeLabSpec } from '../../engine/cartridges/cartridgeSpecs';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { LanguageCode } from '../../narration/types';

export interface MonographPlaceholders {
  hero: (shortTag: string) => string;
  breech: (shortTag: string, isArchery: boolean) => string;
  stencilCutaway: string;
  functionalRoles: string;
  explodedCad: (shortTag: string) => string;
}

export interface KidsPlatePlaceholders {
  hero: (shortTag: string) => string;
  orthoRight: string;
  orthoLeft: string;
  orthoTop: string;
  xrayVision: string;
  halfCutaway: string;
  rainbowTeams: string;
  explodedPoster: string;
  macroCoreZoom: string;
}

export interface MonographLocalizedStrings {
  focusPrefix: string;
  explodedAlt: (name: string) => string;
  placeholders: MonographPlaceholders;
  kidsPlaceholders: KidsPlatePlaceholders;
}

const MONOGRAPH_LOCALE: Record<LanguageCode, MonographLocalizedStrings> = {
  zh: {
    focusPrefix: '聚焦零件：',
    explodedAlt: (name) => `${name} 100% 爆炸分解工程图`,
    placeholders: {
      hero: (shortTag) => `${shortTag} · 3D 封面摄影`,
      breech: (shortTag, isArchery) =>
        isArchery ? `${shortTag} · 核心机构透视` : `${shortTag} · 闭锁透视微距`,
      stencilCutaway: '45° 实心纵剖面',
      functionalRoles: '六色机械职能分色',
      explodedCad: (shortTag) => `${shortTag} · 100% 爆炸分解图`,
    },
    kidsPlaceholders: {
      hero: (shortTag) => `${shortTag} · 3D 封面大片`,
      orthoRight: '右侧全景 3D 大图',
      orthoLeft: '左侧全景 3D 大图',
      orthoTop: '头顶俯视 3D 大图',
      xrayVision: 'X 光透视 3D 大图',
      halfCutaway: '正中纵剖 3D 大图',
      rainbowTeams: '彩虹六小队 3D 图',
      explodedPoster: '100% 爆炸分解 3D 海报',
      macroCoreZoom: '核心机构微距放大 3D',
    },
  },
  en: {
    focusPrefix: 'FOCUS: ',
    explodedAlt: (name) => `${name} 100% Exploded Blueprint`,
    placeholders: {
      hero: (shortTag) => `${shortTag} · HERO STUDIO`,
      breech: (shortTag, isArchery) =>
        isArchery
          ? `${shortTag} · CORE MECHANISM X-RAY`
          : `${shortTag} · BREECH X-RAY`,
      stencilCutaway: 'STENCIL CUTAWAY 45°',
      functionalRoles: '6-ROLE FUNCTIONAL TINT',
      explodedCad: (shortTag) => `${shortTag} · 100% EXPLODED CAD`,
    },
    kidsPlaceholders: {
      hero: (shortTag) => `${shortTag} · 3D HERO`,
      orthoRight: 'RIGHT SIDE 3D',
      orthoLeft: 'LEFT SIDE 3D',
      orthoTop: 'TOP-DOWN 3D',
      xrayVision: 'X-RAY VISION 3D',
      halfCutaway: 'HALF CUTAWAY 3D',
      rainbowTeams: 'RAINBOW 6-TEAM 3D',
      explodedPoster: '100% EXPLODED 3D POSTER',
      macroCoreZoom: 'MACRO CORE ZOOM 3D',
    },
  },
};

const ARCHERY_DOMAIN_OVERRIDES: Record<
  LanguageCode,
  {
    coverMonographTag: string;
    mechanismLabel: string;
    oalLabel: string;
    barrelLabel: string;
    weightLabel: string;
    muzzleVelLabel: string;
    muzzleEnergy: string;
    plateBreechCaption: string;
    plateStencilCaption: string;
    plateRolesCaption: string;
    explodedLegendNote: string;
    bomColMaterial: string;
    secBallistics: string;
    secBallisticsSub: string;
    chartPressureTitle: string;
    chartCartridgeTitle: string;
    energyLadderTitle: string;
    coreAnatomyLabel: string;
    propellantLabel: string;
    primerLabel: string;
    secArmorerManual: string;
    secArmorerManualSub: string;
    fieldStripHeading: string;
    malfunctionsHeading: string;
  }
> = {
  zh: {
    coverMonographTag: '1:1 复合弓弩精密机械工程档案',
    mechanismLabel: '滑轮储能与驱动原理',
    oalLabel: '轮轴距 / 全长',
    barrelLabel: '做功行程与弓档',
    weightLabel: '裸弓/裸弩净重',
    muzzleVelLabel: '离弦初速 (IBO)',
    muzzleEnergy: '矢箭动能',
    plateBreechCaption:
      'FIG 2.1 · 核心桁架弓把、凸轮轮轴与落箭台 / 悬浮滑台联动机构微距图版',
    plateStencilCaption:
      'FIG 3.1 · 双通道 WebGL Stencil 实心纵剖视图（揭示 7075-T6 铝合金桁架/机匣壁厚与内部导轨机构）',
    plateRolesCaption:
      'FIG 3.2 · 34% 半分解态六大机械职能分色图版（凸轮轮轴 / 弓片力缆 / 弓弦驱动 / 撒放瞄具 / 减震弹簧 / 弓把箭壶）',
    explodedLegendNote:
      '标引色系说明：冷青 = 弓片/凸轮/弦缆总成 · 翠绿 = 弓把/主框总成 · 绯红 = 撒放/瞄具/火控总成 · 琥珀 = 箭壶/矢箭/光学镜总成',
    bomColMaterial: '工程材料与表面工艺',
    secBallistics: 'CHAPTER 06 · 1:1 碳纤维矢箭纵剖与凸轮储能动力学',
    secBallisticsSub:
      '凸轮拉力 F(x) 与矢箭初速 V(t) 定量曲线 · 1:1 碳箭纵剖尺寸图与馆藏动能对比标尺',
    chartPressureTitle:
      'FIG 6.1 · 凸轮拉力 F(x) [N · ATA/IBO] 与矢箭初速 V(t) [m/s] 耦合曲线',
    chartCartridgeTitle:
      'FIG 6.2 · 配用 400 格令碳纤维矢箭 1:1 纵剖结构与储能参数',
    energyLadderTitle: '当前矢箭动能与馆藏 7 大口径动能横向标尺 (J)',
    coreAnatomyLabel: '碳杆与猎箭头结构',
    propellantLabel: '弹性储能驱动体系',
    primerLabel: '箭尾扣与撒放接口',
    secArmorerManual: 'CHAPTER 07 · 弓弩技师拆装教范、防空放排障卡与防伪封底',
    secArmorerManualSub:
      '原厂级有向拓扑拆装规程、弓片/凸轮干涉红线、四大弓弩故障排障口诀与数字交互防伪印鉴',
    fieldStripHeading: '弓弩技师标准拆装规程 (Field-Strip DAG)',
    malfunctionsHeading: '四大弓弩机械故障与防空放排障卡',
  },
  en: {
    coverMonographTag: '1:1 COMPOUND ARCHERY & ELASTIC KINEMATICS DOSSIER',
    mechanismLabel: 'Cam Drive & Energy System',
    oalLabel: 'ATA / Overall Length',
    barrelLabel: 'Power Stroke & Brace',
    weightLabel: 'Bare Weight',
    muzzleVelLabel: 'Launch Velocity',
    muzzleEnergy: 'Launch Energy',
    plateBreechCaption:
      'FIG 2.1 · Macro Mechanism Plate: Riser/Chassis Bridge, Cam Tracks & Rest/Sled Interface',
    plateStencilCaption:
      'FIG 3.1 · Two-Pass WebGL Stencil Longitudinal Section Cutaway (7075-T6 Riser/Chassis Wall Thickness & Internal Track)',
    plateRolesCaption:
      'FIG 3.2 · 34% Semi-Exploded Six-Role Classification Plate (Cams & Axles / Limbs & Cables / String Drive / Release & Sight / Dampers / Riser & Quiver)',
    explodedLegendNote:
      'Callout Palette: Cyan = Limbs/Cams/Strings · Emerald = Riser/Mainframe · Rose = Release/Sight/Trigger · Amber = Quiver/Arrow/Optic',
    bomColMaterial: 'Composite / Metallurgy & Finish',
    secBallistics:
      'CHAPTER 06 · 1:1 CARBON PROJECTILE CUTAWAY & ELASTIC BALLISTICS',
    secBallisticsSub:
      'Coupled Draw Force F(x) & Launch Velocity V(t) Curves · 1:1 Arrow Schematic & Vault Energy Ladder',
    chartPressureTitle:
      'FIG 6.1 · Coupled Draw Force F(x) [N · ATA/IBO] & Launch Velocity V(t) [m/s]',
    chartCartridgeTitle:
      'FIG 6.2 · 1:1 Carbon Arrow/Bolt Half-Section & Elastic Storage Spec',
    energyLadderTitle:
      'Projectile Kinetic Energy vs. 7-Caliber Vault Scale (J)',
    coreAnatomyLabel: 'Shaft & Broadhead Anatomy',
    propellantLabel: 'Elastic Drive System',
    primerLabel: 'Nock & Release Latch',
    secArmorerManual:
      'CHAPTER 07 · ARCHERY FIELD-STRIP DAG, ADF DRILLS & COLOPHON',
    secArmorerManualSub:
      'Directed Topological Strip Procedure, Limb/Cam Interference Locks, Four Archery Stoppage Drills & QR Deep-Link',
    fieldStripHeading: 'AUTHORIZED ARCHERY STRIP SEQUENCE (DAG)',
    malfunctionsHeading: 'FOUR ARCHERY TIMING & ANTI-DRY-FIRE DIAGNOSTICS',
  },
};

export interface MonographDomainLabels {
  coverMonographTag: string;
  mechanismLabel: string;
  oalLabel: string;
  barrelLabel: string;
  weightLabel: string;
  muzzleVelLabel: string;
  rangeLabel: string;
  muzzleEnergy: string;
  plateBreechCaption: string;
  plateStencilCaption: string;
  plateRolesCaption: string;
  explodedLegendNote: string;
  bomColMaterial: string;
  secBallistics: string;
  secBallisticsSub: string;
  chartPressureTitle: string;
  chartCartridgeTitle: string;
  energyLadderTitle: string;
  coreAnatomyLabel: string;
  propellantLabel: string;
  primerLabel: string;
  secArmorerManual: string;
  secArmorerManualSub: string;
  fieldStripHeading: string;
  malfunctionsHeading: string;
}

/**
 * Returns localized placeholder and micro-chrome strings for Monograph documents.
 */
export function getMonographLocalizedStrings(
  lang: LanguageCode
): MonographLocalizedStrings {
  return MONOGRAPH_LOCALE[lang];
}

/**
 * Resolves firearm vs. compound archery terminology across Pro Monograph sections
 * while preserving 100% zh/en parity.
 */
export function getMonographDomainLabels(
  lang: LanguageCode,
  isArchery: boolean
): MonographDomainLabels {
  const ui = UI_STRINGS[lang].monograph;
  const armoryUi = UI_STRINGS[lang].armory;
  const cartUi = UI_STRINGS[lang].cartridgeLab;

  if (!isArchery) {
    return {
      coverMonographTag: ui.coverMonographTag,
      mechanismLabel: armoryUi.mechanismLabel,
      oalLabel: armoryUi.oalLabel,
      barrelLabel: armoryUi.barrelLabel,
      weightLabel: armoryUi.weightLabel,
      muzzleVelLabel: armoryUi.muzzleVelLabel,
      rangeLabel: armoryUi.rangeLabel,
      muzzleEnergy: cartUi.muzzleEnergy,
      plateBreechCaption: ui.plateBreechCaption,
      plateStencilCaption: ui.plateStencilCaption,
      plateRolesCaption: ui.plateRolesCaption,
      explodedLegendNote: ui.explodedLegendNote,
      bomColMaterial: ui.bomColMaterial,
      secBallistics: ui.secBallistics,
      secBallisticsSub: ui.secBallisticsSub,
      chartPressureTitle: ui.chartPressureTitle,
      chartCartridgeTitle: ui.chartCartridgeTitle,
      energyLadderTitle: ui.energyLadderTitle,
      coreAnatomyLabel: cartUi.coreAnatomyLabel,
      propellantLabel: cartUi.propellantLabel,
      primerLabel: cartUi.primerLabel,
      secArmorerManual: ui.secArmorerManual,
      secArmorerManualSub: ui.secArmorerManualSub,
      fieldStripHeading: ui.fieldStripHeading,
      malfunctionsHeading: ui.malfunctionsHeading,
    };
  }

  return {
    ...ARCHERY_DOMAIN_OVERRIDES[lang],
    rangeLabel: armoryUi.rangeLabel,
  };
}

/**
 * Formats the propellant / elastic-drive specification row with accurate units
 * (powder charge grams for firearms vs. arrow grain/gram mass for archery).
 */
export function formatMonographDriveSpec(
  spec: CartridgeLabSpec,
  isArchery: boolean,
  lang: LanguageCode
): string {
  const driveText =
    lang === 'zh' ? spec.propellantTypeZh : spec.propellantTypeEn;
  if (isArchery) {
    return `${driveText} · ${spec.projectileGrain} gr (${spec.projectileMassG.toFixed(2)} g)`;
  }
  return `${driveText} (${spec.propellantMassG.toFixed(2)} g)`;
}

export interface DkEncyclopediaStrings {
  seriesWordmark: string;
  seriesSubtitle: string;
  factFileHeading: string;
  scaleRulerKicker: string;
  loupesHeading: string;
  loupesSub: string;
  spread1Section: string;
  spread2LeftKicker: string;
  spread2RightKicker: string;
  spread3Kicker: string;
  spread3Title: string;
  spread4LeftKicker: string;
  spread4RightKicker: string;
  chronicleHeading: string;
  breakthroughsQuoteKicker: string;
  elevationsHeading: string;
  leftProfileLabel: string;
  topProfileLabel: string;
  rightProfileLabel: string;
  cutawayHeading: string;
  cutawaySub: string;
  cartridgeHeading: string;
  ballisticsHeading: string;
  explodedHeading: string;
  explodedSub: string;
  functionalRolesHeading: string;
  bomDirectoryHeading: string;
  bomDirectoryMeta: (partsCount: number, trisFormatted: string) => string;
  cycleSequenceHeading: string;
  cycle7Heading: string;
  fieldStripHeading: string;
  malfunctionsHeading: string;
  energyLadderHeading: string;
  exLibrisHeading: string;
  qrCompanionHeading: string;
  qrCompanionSub: string;
  colophonCyclesLabel: (cyclesCount: number, total: number) => string;
  colophonWebglLabel: (is300Dpi: boolean) => string;
  colophonPrepressTag: string;
  colophonTrimTag: string;
  spreadFolioLabel: (leftPage: number, rightPage: number, totalPages: number) => string;
  singlePageFolioLabel: (pageNum: number, totalPages: number) => string;
  capturingPlate: (label: string) => string;
  qaDatumLabel: string;
  qaMeshLabel: string;
  qaSignoffLabel: string;
  qaSignoffValue: string;
  qaSpecLine: string;
}

export function getDkEncyclopediaStrings(
  lang: LanguageCode,
  isArchery: boolean
): DkEncyclopediaStrings {
  if (lang === 'zh') {
    return {
      seriesWordmark: 'DIGITAL ARMORY · VISUAL ENCYCLOPEDIA',
      seriesSubtitle: isArchery
        ? '复合弓弩机械百科典藏卷'
        : '世界轻武器机械视觉百科全书',
      factFileHeading: isArchery
        ? '核心技术档案 · FACT FILE'
        : '原厂测绘档案 · FACT FILE',
      scaleRulerKicker: isArchery
        ? '真实比例尺与射手身高对照 · TRUE TO SCALE'
        : '1:1 尺寸比例标尺与人体对照 · TRUE TO SCALE',
      loupesHeading: isArchery
        ? '核心机构光学放大特写 · ANATOMY LOUPES'
        : '关键闭锁与火控放大镜特写 · ANATOMY LOUPES',
      loupesSub: isArchery
        ? '2.0×–3.0× 微距检视凸轮轮组、弓片力缆、撒放机构与箭道接口'
        : '2.0×–3.0× 光学微距检视弹膛闭锁、自动机驱动、火控阻铁与供弹坡道',
      spread1Section: '门扉总览 · GATEFOLD ANATOMY',
      spread2LeftKicker: '研发编年史 · HISTORICAL CHRONICLE',
      spread2RightKicker: isArchery
        ? '纵剖解剖与矢箭动力学 · INSIDE THE MECHANISM'
        : '实心纵剖与 1:1 实弹解剖 · INSIDE THE MECHANISM',
      spread3Kicker: '全机构爆炸蓝图 · EXPLODED BLUEPRINT',
      spread3Title: isArchery
        ? '100% 阶梯分解全景与六大职能图谱'
        : '全枪 100% 阶梯爆炸分解与六大机械职能图谱',
      spread4LeftKicker: isArchery
        ? '拉弓蓄能与发射时序 · LAUNCH CYCLE'
        : '自动机循环时序 · CYCLE OF OPERATION',
      spread4RightKicker: isArchery
        ? '弓弩勤务拆装、排障与馆藏印鉴 · ARCHIVE MANUAL'
        : '野战拆装教范、排障诊断与馆藏印鉴 · ARMORER MANUAL',
      chronicleHeading: '四幕研制演进纪实',
      breakthroughsQuoteKicker: '三大核心工程突破 · KEY BREAKTHROUGHS',
      elevationsHeading: '正交工程视图 · ELEVATION PROFILES',
      leftProfileLabel: '左侧正交视图 · LEFT ELEVATION',
      topProfileLabel: '顶部俯视视图 · PLAN VIEW',
      rightProfileLabel: '右侧正交主视图 · RIGHT ELEVATION',
      cutawayHeading: isArchery
        ? '正中纵剖内部结构透视'
        : '45° 实心金属纵剖面解剖',
      cutawaySub: isArchery
        ? '双通道模板剖切揭示铝合金桁架弓把、凸轮轴承槽与悬浮导轨内部结构'
        : '双通道 Stencil 实体纵剖揭示弹膛闭锁面、导气孔道、膛线壁厚与火控啮合',
      cartridgeHeading: isArchery
        ? '配用碳纤维矢箭精密纵剖'
        : '1:1 原大制式弹药剖视',
      ballisticsHeading: isArchery
        ? '凸轮拉力与离弦箭速曲线'
        : 'SAAMI/CIP 膛压与初速曲线',
      explodedHeading: isArchery
        ? '全弓弩 100% 零穿模阶梯爆炸图'
        : '全枪 100% 零穿模阶梯爆炸总图',
      explodedSub:
        '0.35pt 工程引导线直指核心机械节点，呈现真实装配空间坐标与零件职能精讲',
      functionalRolesHeading: '六大工程子系统语义分色图谱',
      bomDirectoryHeading: '全零件冶金与 1:1 包络总表 (BOM)',
      bomDirectoryMeta: (partsCount, trisFormatted) =>
        `共 ${partsCount} 个精密 CSG 零件 · ${trisFormatted} 三角流形网格`,
      cycleSequenceHeading: isArchery
        ? '四阶段发射慢动作实景序列'
        : '四阶段击发与自动循环实景序列',
      cycle7Heading: isArchery
        ? '七阶弹性蓄能与做功时序链'
        : '七阶击发闭锁与复进运动学时序',
      fieldStripHeading: isArchery
        ? '弓弩技师标准拆装次序 (DAG)'
        : '原厂野战勤务快拆规程 (Field-Strip DAG)',
      malfunctionsHeading: isArchery
        ? '典型弓弩故障与防空放诊断卡'
        : '四大经典枪械故障排障诊断卡',
      energyLadderHeading: '馆藏全口径动能横向标尺 (J)',
      exLibrisHeading: 'EX LIBRIS · 馆藏典藏印鉴',
      qrCompanionHeading: '扫码进入实时 3D 交互剖视工作台',
      qrCompanionSub:
        '无需安装客户端，手机扫码即可旋转剖视、亲手野战拆装并聆听双语语音纪录片。',
      colophonCyclesLabel: (cyclesCount, total) =>
        `Blender Cycles 4K 离线光追母版 (${cyclesCount}/${total}) · 300 DPI 铜版印刷标准`,
      colophonWebglLabel: (is300Dpi) =>
        is300Dpi
          ? '300 DPI 超清 WebGL 2.0 PBR 透明抠图母版 (2880×1800)'
          : 'WebGL 2.0 PBR 透明抠图实时印前预览 (1440×900)',
      colophonPrepressTag: 'ISO 12647 · +3mm 出血与裁切角线',
      colophonTrimTag: 'ISO 216 · 成品净尺寸裁切版',
      spreadFolioLabel: (l, r, total) =>
        `PP. ${String(l).padStart(2, '0')}–${String(r).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      singlePageFolioLabel: (p, total) =>
        `PAGE ${String(p).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      capturingPlate: (label) => `正在渲染图版：${label}`,
      qaDatumLabel: '1:1 坐标基准',
      qaMeshLabel: '流形 CSG 规模',
      qaSignoffLabel: '馆藏核准',
      qaSignoffValue: 'VERIFIED · REV.26',
      qaSpecLine:
        '1:1 空间比例 = 10 mm/单位 · 水密流形 CSG 几何 · 零干涉运动学契约核验通过',
    };
  }

  return {
    seriesWordmark: 'DIGITAL ARMORY · VISUAL ENCYCLOPEDIA',
    seriesSubtitle: isArchery
      ? 'COMPOUND ARCHERY MECHANICAL ARCHIVE'
      : 'DEFINITIVE VISUAL HISTORY OF FIREARMS MECHANICS',
    factFileHeading: 'SPECIFICATION LEDGER · FACT FILE',
    scaleRulerKicker: 'TRUE-TO-SCALE DIMENSIONS & SILHOUETTE COMPARISON',
    loupesHeading: isArchery
      ? 'OPTICAL MECHANISM LOUPES · 2.0×–3.0×'
      : 'LOCKING & FIRE-CONTROL LOUPES · 2.0×–3.0×',
    loupesSub: isArchery
      ? 'Magnified inspection of cams, flex limbs, release latches, and arrow track'
      : 'Magnified studio inspection of breech lockup, operating drive, fire control, and feed path',
    spread1Section: 'GATEFOLD ANATOMY & KEY FEATURES',
    spread2LeftKicker: 'HISTORICAL R&D CHRONICLE',
    spread2RightKicker: isArchery
      ? 'INSIDE THE MECHANISM & PROJECTILE DYNAMICS'
      : 'INSIDE THE MECHANISM & 1:1 AMMUNITION',
    spread3Kicker: 'EXPLODED MECHANICAL BLUEPRINT',
    spread3Title: isArchery
      ? '100% Exploded Architecture & Six-Role Subsystem Map'
      : '100% Exploded Mechanical Blueprint & Six-Role Engineering Map',
    spread4LeftKicker: isArchery
      ? 'DRAW & LAUNCH KINEMATIC CYCLE'
      : 'CYCLE OF OPERATION & KINEMATICS',
    spread4RightKicker: isArchery
      ? 'ARCHERY SERVICE MANUAL & MUSEUM ARCHIVE SEAL'
      : 'FIELD-STRIP MANUAL, STOPPAGES & ARCHIVE SEAL',
    chronicleHeading: 'Four-Act Engineering Genesis',
    breakthroughsQuoteKicker: 'DEFINING ENGINEERING BREAKTHROUGHS',
    elevationsHeading: 'ORTHOGRAPHIC ELEVATION PROFILES',
    leftProfileLabel: 'LEFT ELEVATION PROFILE',
    topProfileLabel: 'PLAN / TOP-DOWN PROFILE',
    rightProfileLabel: 'RIGHT ELEVATION PROFILE',
    cutawayHeading: isArchery
      ? 'Longitudinal Structural Cross-Section'
      : '45° Solid Metal Longitudinal Cutaway',
    cutawaySub: isArchery
      ? 'Two-pass stencil cutaway exposing 7075-T6 truss walls, cam channels, and flight track'
      : 'Two-pass stencil section exposing bore wall thickness, locking recesses, gas path, and sear engagement',
    cartridgeHeading: isArchery
      ? 'Carbon Projectile Precision Cutaway'
      : '1:1 Actual-Size Service Cartridge',
    ballisticsHeading: isArchery
      ? 'Draw-Force F(x) & Launch Velocity V(t)'
      : 'SAAMI/CIP Pressure P(t) & Velocity V(t)',
    explodedHeading: isArchery
      ? '100% Collision-Free Exploded Archery Blueprint'
      : '100% Collision-Free Exploded Mechanical Blueprint',
    explodedSub:
      '0.35pt architectural leader lines map key moving assemblies directly to concise DK mechanical micro-copy',
    functionalRolesHeading: 'Six-Role Functional Subsystem Color Map',
    bomDirectoryHeading: 'Archival Bill of Materials (BOM) Directory',
    bomDirectoryMeta: (partsCount, trisFormatted) =>
      `${partsCount} Parametric CSG Components · ${trisFormatted} Manifold Triangles`,
    cycleSequenceHeading: isArchery
      ? 'Four-Phase Slow-Motion Launch Sequence'
      : 'Four-Phase Action Sequence Cutaway Strip',
    cycle7Heading: isArchery
      ? '7-Stage Elastic Storage & Power-Stroke Breakdown'
      : '7-Stage Firing, Locking & Recoil Breakdown',
    fieldStripHeading: isArchery
      ? 'Authorized Archery Strip Sequence (DAG)'
      : 'Guided Military Field-Strip Order (DAG)',
    malfunctionsHeading: isArchery
      ? 'Archery Timing & Anti-Dry-Fire Diagnostics'
      : 'Malfunction & Safety Stoppage Reference',
    energyLadderHeading: 'Vault Muzzle Kinetic Energy Scale (J)',
    exLibrisHeading: 'EX LIBRIS · MUSEUM ARCHIVE SEAL',
    qrCompanionHeading: 'Scan for Live Interactive 3D Cutaway Workbench',
    qrCompanionSub:
      'Open directly in any mobile browser to rotate, section-cut, field-strip, and hear the bilingual documentary.',
    colophonCyclesLabel: (cyclesCount, total) =>
      `Blender Cycles 4K Path-Traced Masters (${cyclesCount}/${total}) · 300 DPI Coated Press Standard`,
    colophonWebglLabel: (is300Dpi) =>
      is300Dpi
        ? '300 DPI Print-Grade WebGL 2.0 PBR Transparent Masters (2880×1800)'
        : 'WebGL 2.0 PBR Transparent Cutout Preview Masters (1440×900)',
    colophonPrepressTag: 'ISO 12647 · +3mm Bleed & Crop Marks',
    colophonTrimTag: 'ISO 216 · Exact Trim-Size Press Folio',
    spreadFolioLabel: (l, r, total) =>
      `PP. ${String(l).padStart(2, '0')}–${String(r).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    singlePageFolioLabel: (p, total) =>
      `PAGE ${String(p).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    capturingPlate: (label) => `Rendering Plate: ${label}`,
    qaDatumLabel: '1:1 CAD DATUM',
    qaMeshLabel: 'CSG MANIFOLD',
    qaSignoffLabel: 'ARCHIVE QA',
    qaSignoffValue: 'VERIFIED · REV.26',
    qaSpecLine:
      '1:1 Scale = 10 mm/unit · Watertight Manifold CSG · Zero-Interference Kinematics Contract Verified',
  };
}

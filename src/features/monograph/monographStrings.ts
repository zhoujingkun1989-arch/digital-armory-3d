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

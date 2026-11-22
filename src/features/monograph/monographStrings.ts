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

const ARMOR_DOMAIN_OVERRIDES: typeof ARCHERY_DOMAIN_OVERRIDES = {
  zh: {
    coverMonographTag: '1:1 主战坦克重装机械与火炮工程档案',
    mechanismLabel: '主炮闭锁、装填与动力架构',
    oalLabel: '全车长（含主炮）',
    barrelLabel: '主炮身管与倍径',
    weightLabel: '战斗全重',
    muzzleVelLabel: '炮口初速',
    muzzleEnergy: '炮口动能',
    plateBreechCaption:
      'FIG 2.1 · 主炮炮尾闭锁机构、液压驻退复进机与装弹机微距解剖图版',
    plateStencilCaption:
      'FIG 3.1 · 双通道 WebGL Stencil 实心纵剖视图（揭示复合装甲模块、炮塔战斗室、楔形炮闩与动力舱布局）',
    plateRolesCaption:
      'FIG 3.2 · 34% 半分解态六大装甲工程职能分色图版（主炮闭锁 / 驻退制退 / 炮塔驱动 / 火控观瞄 / 扭杆行走 / 装甲弹舱）',
    explodedLegendNote:
      '标引色系说明：冷青 = 炮塔/主炮/装填总成 · 翠绿 = 车体/装甲/底盘总成 · 绯红 = 炮尾/火控/稳像总成 · 琥珀 = 动力/行走/弹舱总成',
    bomColMaterial: '装甲冶金与复合防护工艺',
    secBallistics: 'CHAPTER 06 · 1:10 主炮弹药纵剖与超高压内弹道物理',
    secBallisticsSub:
      '主炮膛压 P(t) 与初速 V(t) 定量曲线 · 1:10 穿甲弹剖视图与兆焦级重装动能标尺',
    chartPressureTitle:
      'FIG 6.1 · 主炮膛压 P(t) [MPa] 与炮弹初速 V(t) [m/s] 实时耦合曲线',
    chartCartridgeTitle:
      'FIG 6.2 · 制式坦克主炮穿甲弹 1:10 纵剖结构与装药参数',
    energyLadderTitle: '当前主炮弹药动能与重装穿甲动能横向标尺 (MJ)',
    coreAnatomyLabel: '穿甲弹芯与弹托结构',
    propellantLabel: '主炮发射药与药筒体系',
    primerLabel: '电发火底火与弹底结构',
    secArmorerManual: 'CHAPTER 07 · 装甲勤务拆装教范、主炮排障卡与防伪封底',
    secArmorerManualSub:
      '装甲机械师有向拓扑拆装规程、重型部件吊装红线、四大装甲火控排障口诀与数字交互防伪印鉴',
    fieldStripHeading: '装甲机械师标准勤务拆装规程 (Field-Strip DAG)',
    malfunctionsHeading: '四大主战坦克火炮与装填排障诊断卡',
  },
  en: {
    coverMonographTag: '1:1 MAIN BATTLE TANK ARMOR & ORDNANCE DOSSIER',
    mechanismLabel: 'Main Gun Breech, Loader & Powerpack',
    oalLabel: 'Overall Length (Gun Fwd)',
    barrelLabel: 'Main Gun Tube & Caliber',
    weightLabel: 'Combat Weight',
    muzzleVelLabel: 'Muzzle Velocity',
    muzzleEnergy: 'Muzzle Energy',
    plateBreechCaption:
      'FIG 2.1 · Macro Ordnance Plate: Sliding Wedge Breech, Recoil Cylinders & Autoloader/Ready Rack',
    plateStencilCaption:
      'FIG 3.1 · Two-Pass WebGL Stencil Longitudinal Cutaway (Composite Armor Arrays, Turret Fighting Compartment & Powerpack Bay)',
    plateRolesCaption:
      'FIG 3.2 · 34% Semi-Exploded Six-Role Armor Map (Main Breech / Recoil Brake / Turret Drive / Fire Control / Suspension / Armor & Ammo)',
    explodedLegendNote:
      'Callout Palette: Cyan = Turret/Main Gun/Loader · Emerald = Hull/Composite Armor · Rose = Breech/FCS/Optics · Amber = Powerpack/Tracks/Ammo',
    bomColMaterial: 'Armor Metallurgy & Composite Array',
    secBallistics:
      'CHAPTER 06 · 1:10 TANK ORDNANCE CUTAWAY & INTERNAL BALLISTICS',
    secBallisticsSub:
      'Main Gun Pressure P(t) & Velocity V(t) Curves · 1:10 Ordnance Cutaway & Megajoule Energy Scale',
    chartPressureTitle:
      'FIG 6.1 · Main Gun Chamber Pressure P(t) [MPa] & Projectile Velocity V(t) [m/s]',
    chartCartridgeTitle:
      'FIG 6.2 · 1:10 Tank Cannon Ammunition Half-Section & Charge Spec',
    energyLadderTitle:
      'Heavy Armor Ordnance Kinetic Energy Scale (MJ vs. .50 BMG)',
    coreAnatomyLabel: 'Penetrator & Sabot Anatomy',
    propellantLabel: 'Main Gun Propellant Charge',
    primerLabel: 'Electric Primer & Stub Base',
    secArmorerManual:
      'CHAPTER 07 · ARMOR MAINTENANCE DAG, STOPPAGE DRILLS & COLOPHON',
    secArmorerManualSub:
      'Directed Heavy Maintenance Sequence, Breech & Powerpack Interlocks, Four Cannon Diagnostics & QR Deep-Link',
    fieldStripHeading: 'ARMORED CREW & DEPOT SERVICE SEQUENCE (DAG)',
    malfunctionsHeading: 'FOUR MAIN GUN & LOADING DIAGNOSTIC DRILLS',
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
  isArchery: boolean,
  isTank = false
): MonographDomainLabels {
  const ui = UI_STRINGS[lang].monograph;
  const armoryUi = UI_STRINGS[lang].armory;
  const cartUi = UI_STRINGS[lang].cartridgeLab;

  if (isTank) {
    return {
      ...ARMOR_DOMAIN_OVERRIDES[lang],
      rangeLabel: armoryUi.rangeLabel,
    };
  }

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
 * (powder charge grams/kg for firearms & tank ordnance vs. arrow grain/gram mass for archery).
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
  if (spec.propellantMassG >= 1000) {
    return `${driveText} (${(spec.propellantMassG / 1000).toFixed(2)} kg)`;
  }
  return `${driveText} (${spec.propellantMassG.toFixed(2)} g)`;
}

export interface DkActionPhaseCopy {
  plateKey:
    | 'comic_1_ready'
    | 'comic_2_ignition'
    | 'comic_3_eject'
    | 'comic_4_reload';
  title: string;
  caption: string;
}

export interface DkEncyclopediaStrings {
  seriesWordmark: string;
  seriesWordmarkCompact: string;
  a4EditionTag: string;
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
  a4RightManualKicker: string;
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
  actionPhases: [
    DkActionPhaseCopy,
    DkActionPhaseCopy,
    DkActionPhaseCopy,
    DkActionPhaseCopy,
  ];
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
  isArchery: boolean,
  isTank = false
): DkEncyclopediaStrings {
  if (lang === 'zh') {
    const actionPhases: DkEncyclopediaStrings['actionPhases'] = isTank
      ? [
          {
            plateKey: 'comic_1_ready',
            title: '闭锁稳像',
            caption:
              '穿甲弹入膛后楔形炮闩刚性闭锁，双轴陀螺稳定仪锁定炮管射向并等待击发。',
          },
          {
            plateKey: 'comic_2_ignition',
            title: '电火击发',
            caption:
              '电发火底火瞬时引燃大装药发射药，超高压燃气以 5 马赫级初速推出穿甲弹芯。',
          },
          {
            plateKey: 'comic_3_eject',
            title: '驻退抛底',
            caption:
              '炮管后坐压缩液压驻退机耗散巨量冲量，炮闩自动下落并弹出残余金属弹底。',
          },
          {
            plateKey: 'comic_4_reload',
            title: '复进装填',
            caption:
              '复进机推炮管平滑复位，底置自动装弹机或人工装填手顺畅推入下一发炮弹。',
          },
        ]
      : isArchery
        ? [
            {
              plateKey: 'comic_1_ready',
              title: '满拉蓄能',
              caption:
                '碳纤维弓片屈曲储存弹性势能，偏心凸轮越峰进入省力谷并稳定锁定。',
            },
            {
              plateKey: 'comic_2_ignition',
              title: '撒放释放',
              caption:
                '撒放机构零扭矩解脱弓弦，同步凸轮高速回转释放弦推力加速碳箭。',
            },
            {
              plateKey: 'comic_3_eject',
              title: '清离出箭',
              caption:
                '碳纤维箭矢沿推力轴线离弦飞出，落箭台或悬浮箭道零刮擦避让尾羽。',
            },
            {
              plateKey: 'comic_4_reload',
              title: '阻尼归位',
              caption:
                '止弦器与谐波阻尼器吸收余振冲击，弓片与缆组平稳复位至初始弓档。',
            },
          ]
        : [
            {
              plateKey: 'comic_1_ready',
              title: '闭锁待击',
              caption:
                '实弹入膛后闭锁机构与枪管刚性咬合，火控阻铁稳固锁持击针或击锤能量。',
            },
            {
              plateKey: 'comic_2_ignition',
              title: '击发建压',
              caption:
                '击针撞击底火引燃发射药，瞬时峰值膛压推动弹头沿膛线高速旋转出膛。',
            },
            {
              plateKey: 'comic_3_eject',
              title: '开锁抽抛',
              caption:
                '膛压泄至安全阈值后自动机解锁后坐，抽壳钩拉出空壳并经抛壳挺抛出。',
            },
            {
              plateKey: 'comic_4_reload',
              title: '复进推弹',
              caption:
                '复进簧释放储能推自动机前移，剥取下一发弹药顺坡入膛并重新闭锁。',
            },
          ];

    return {
      seriesWordmark: 'DIGITAL ARMORY · VISUAL ENCYCLOPEDIA',
      seriesWordmarkCompact: 'DIGITAL ARMORY · DK',
      a4EditionTag: 'DK 典藏图鉴',
      seriesSubtitle: isTank
        ? '重型装甲与主战坦克视觉机械百科全书'
        : isArchery
          ? '复合弓弩机械百科典藏卷'
          : '世界轻武器机械视觉百科全书',
      factFileHeading: isTank
        ? '装甲战车测绘档案 · FACT FILE'
        : isArchery
          ? '核心技术档案 · FACT FILE'
          : '原厂测绘档案 · FACT FILE',
      scaleRulerKicker: isTank
        ? '全车实尺比例标尺与成人身高对照 · TRUE TO SCALE'
        : isArchery
          ? '真实比例尺与射手身高对照 · TRUE TO SCALE'
          : '1:1 尺寸比例标尺与人体对照 · TRUE TO SCALE',
      loupesHeading: isTank
        ? '主炮、炮尾与观瞄放大特写 · ANATOMY LOUPES'
        : isArchery
          ? '核心机构光学放大特写 · ANATOMY LOUPES'
          : '关键闭锁与火控放大镜特写 · ANATOMY LOUPES',
      loupesSub: isTank
        ? '2.0×–3.0× 微距检视楔形炮闩、液压驻退机、稳像观瞄与弹药装填机构'
        : isArchery
          ? '2.0×–3.0× 微距检视凸轮轮组、弓片力缆、撒放机构与箭道接口'
          : '2.0×–3.0× 光学微距检视弹膛闭锁、自动机驱动、火控阻铁与供弹坡道',
      spread1Section: '门扉总览 · GATEFOLD ANATOMY',
      spread2LeftKicker: '研发编年史 · HISTORICAL CHRONICLE',
      spread2RightKicker: isTank
        ? '重装纵剖与 1:10 穿甲弹解剖 · INSIDE THE TANK'
        : isArchery
          ? '纵剖解剖与矢箭动力学 · INSIDE THE MECHANISM'
          : '实心纵剖与 1:1 实弹解剖 · INSIDE THE MECHANISM',
      spread3Kicker: '全机构爆炸蓝图 · EXPLODED BLUEPRINT',
      spread3Title: isTank
        ? '全车 100% 阶梯爆炸分解与六大装甲职能图谱'
        : isArchery
          ? '100% 阶梯分解全景与六大职能图谱'
          : '全枪 100% 阶梯爆炸分解与六大机械职能图谱',
      spread4LeftKicker: isTank
        ? '主炮射击与驻退循环时序 · FIRING CYCLE'
        : isArchery
          ? '拉弓蓄能与发射时序 · LAUNCH CYCLE'
          : '自动机循环时序 · CYCLE OF OPERATION',
      spread4RightKicker: isTank
        ? '装甲勤务拆装、排障与馆藏印鉴 · ARMOR MANUAL'
        : isArchery
          ? '弓弩勤务拆装、排障与馆藏印鉴 · ARCHIVE MANUAL'
          : '野战拆装教范、排障诊断与馆藏印鉴 · ARMORER MANUAL',
      a4RightManualKicker: isTank
        ? '装甲勤务与印鉴 · MANUAL'
        : isArchery
          ? '勤务拆装与印鉴 · ARCHIVE'
          : '拆装教范与印鉴 · MANUAL',
      chronicleHeading: '四幕研制演进纪实',
      breakthroughsQuoteKicker: '三大核心工程突破 · KEY BREAKTHROUGHS',
      elevationsHeading: '正交工程视图 · ELEVATION PROFILES',
      leftProfileLabel: '左侧正交视图 · LEFT ELEVATION',
      topProfileLabel: '顶部俯视视图 · PLAN VIEW',
      rightProfileLabel: '右侧正交主视图 · RIGHT ELEVATION',
      cutawayHeading: isTank
        ? '全车正中实心纵剖面解剖'
        : isArchery
          ? '正中纵剖内部结构透视'
          : '45° 实心金属纵剖面解剖',
      cutawaySub: isTank
        ? '双通道 Stencil 实体纵剖揭示复合装甲层、炮塔战斗室、楔形炮尾与动力舱布局'
        : isArchery
          ? '双通道模板剖切揭示铝合金桁架弓把、凸轮轴承槽与悬浮导轨内部结构'
          : '双通道 Stencil 实体纵剖揭示弹膛闭锁面、导气孔道、膛线壁厚与火控啮合',
      cartridgeHeading: isTank
        ? '1:10 制式主炮弹药精密纵剖'
        : isArchery
          ? '配用碳纤维矢箭精密纵剖'
          : '1:1 原大制式弹药剖视',
      ballisticsHeading: isTank
        ? '主炮膛压 P(t) 与炮口初速 V(t) 曲线'
        : isArchery
          ? '凸轮拉力与离弦箭速曲线'
          : 'SAAMI/CIP 膛压与初速曲线',
      explodedHeading: isTank
        ? '全战车 100% 零穿模阶梯爆炸总图'
        : isArchery
          ? '全弓弩 100% 零穿模阶梯爆炸图'
          : '全枪 100% 零穿模阶梯爆炸总图',
      explodedSub:
        '0.35pt 工程引导线直指核心机械节点，呈现真实装配空间坐标与零件职能精讲',
      functionalRolesHeading: '六大工程子系统语义分色图谱',
      bomDirectoryHeading: '全零件冶金与 1:1 包络总表 (BOM)',
      bomDirectoryMeta: (partsCount, trisFormatted) =>
        `共 ${partsCount} 个精密 CSG 零件 · ${trisFormatted} 三角流形网格`,
      cycleSequenceHeading: isTank
        ? '四阶段主炮击发、驻退与装填实景序列'
        : isArchery
          ? '四阶段发射慢动作实景序列'
          : '四阶段击发与自动循环实景序列',
      actionPhases,
      cycle7Heading: isTank
        ? '七阶主炮击发、驻退与装填运动学时序'
        : isArchery
          ? '七阶弹性蓄能与做功时序链'
          : '七阶击发闭锁与复进运动学时序',
      fieldStripHeading: isTank
        ? '装甲机械师勤务拆装次序 (DAG)'
        : isArchery
          ? '弓弩技师标准拆装次序 (DAG)'
          : '原厂野战勤务快拆规程 (Field-Strip DAG)',
      malfunctionsHeading: isTank
        ? '四大主战坦克火炮与装填排障诊断卡'
        : isArchery
          ? '典型弓弩故障与防空放诊断卡'
          : '四大经典枪械故障排障诊断卡',
      energyLadderHeading: isTank
        ? '重装主炮弹药动能横向标尺 (MJ)'
        : '馆藏全口径动能横向标尺 (J)',
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

  const actionPhasesEn: DkEncyclopediaStrings['actionPhases'] = isTank
    ? [
        {
          plateKey: 'comic_1_ready',
          title: 'Breech Locked & Stabilized',
          caption:
            'Sliding wedge seals the cannon chamber while dual-axis gyros hold the tube on target.',
        },
        {
          plateKey: 'comic_2_ignition',
          title: 'Electric Ignition & Launch',
          caption:
            'Axial electric primer fires the charge, driving a kinetic dart down the barrel at Mach 5.',
        },
        {
          plateKey: 'comic_3_eject',
          title: 'Hydraulic Recoil & Stub Eject',
          caption:
            'Tube recoils into hydraulic brakes as the semi-automatic wedge drops and ejects the stub.',
        },
        {
          plateKey: 'comic_4_reload',
          title: 'Run-Out & Next-Round Load',
          caption:
            'Recuperator returns the cannon to battery as the autoloader or loader rams the next shell.',
        },
      ]
    : isArchery
      ? [
          {
            plateKey: 'comic_1_ready',
            title: 'Full-Draw Storage',
            caption:
              'Flexed split limbs store elastic energy as cams settle cleanly against the draw stop.',
          },
          {
            plateKey: 'comic_2_ignition',
            title: 'Torque-Free Release',
            caption:
              'Latch releases cleanly while synchronized cams uncoil full tension into the shaft.',
          },
          {
            plateKey: 'comic_3_eject',
            title: 'Power Stroke & Clearance',
            caption:
              'Carbon projectile accelerates straight while drop-away forks or track clear vanes.',
          },
          {
            plateKey: 'comic_4_reload',
            title: 'Damped Brace Return',
            caption:
              'String stops and harmonic dampers dissipate shock as limbs settle back to brace.',
          },
        ]
      : [
          {
            plateKey: 'comic_1_ready',
            title: 'Locked & Ready',
            caption:
              'Round chambered in battery with breech locked and fire-control sear holding energy.',
          },
          {
            plateKey: 'comic_2_ignition',
            title: 'Ignition & Acceleration',
            caption:
              'Firing pin strikes primer; peak chamber pressure drives the bullet down the bore.',
          },
          {
            plateKey: 'comic_3_eject',
            title: 'Unlock & Ejection',
            caption:
              'After safe blowdown, the action unlocks rearward to extract and eject spent brass.',
          },
          {
            plateKey: 'comic_4_reload',
            title: 'Feed & Return to Battery',
            caption:
              'Recoil spring drives the bolt forward, chambering the next round into positive lockup.',
          },
        ];

  return {
    seriesWordmark: 'DIGITAL ARMORY · VISUAL ENCYCLOPEDIA',
    seriesWordmarkCompact: 'DIGITAL ARMORY · DK',
    a4EditionTag: 'DK ENCYCLOPEDIA',
    seriesSubtitle: isTank
      ? 'DEFINITIVE VISUAL ENCYCLOPEDIA OF MAIN BATTLE TANKS'
      : isArchery
        ? 'COMPOUND ARCHERY MECHANICAL ARCHIVE'
        : 'DEFINITIVE VISUAL HISTORY OF FIREARMS MECHANICS',
    factFileHeading: 'SPECIFICATION LEDGER · FACT FILE',
    scaleRulerKicker: 'TRUE-TO-SCALE DIMENSIONS & SILHOUETTE COMPARISON',
    loupesHeading: isTank
      ? 'BREECH, RECOIL & OPTICS LOUPES · 2.0×–3.0×'
      : isArchery
        ? 'OPTICAL MECHANISM LOUPES · 2.0×–3.0×'
        : 'LOCKING & FIRE-CONTROL LOUPES · 2.0×–3.0×',
    loupesSub: isTank
      ? 'Magnified inspection of sliding wedge breech, recoil brakes, thermal FCS, and ammo stowage'
      : isArchery
        ? 'Magnified inspection of cams, flex limbs, release latches, and arrow track'
        : 'Magnified studio inspection of breech lockup, operating drive, fire control, and feed path',
    spread1Section: 'GATEFOLD ANATOMY & KEY FEATURES',
    spread2LeftKicker: 'HISTORICAL R&D CHRONICLE',
    spread2RightKicker: isTank
      ? 'INSIDE THE TANK & 1:10 MAIN-GUN ORDNANCE'
      : isArchery
        ? 'INSIDE THE MECHANISM & PROJECTILE DYNAMICS'
        : 'INSIDE THE MECHANISM & 1:1 AMMUNITION',
    spread3Kicker: 'EXPLODED MECHANICAL BLUEPRINT',
    spread3Title: isTank
      ? '100% Exploded Armored Architecture & Six-Role Subsystem Map'
      : isArchery
        ? '100% Exploded Architecture & Six-Role Subsystem Map'
        : '100% Exploded Mechanical Blueprint & Six-Role Engineering Map',
    spread4LeftKicker: isTank
      ? 'MAIN-GUN RECOIL & LOADING CYCLE'
      : isArchery
        ? 'DRAW & LAUNCH KINEMATIC CYCLE'
        : 'CYCLE OF OPERATION & KINEMATICS',
    spread4RightKicker: isTank
      ? 'ARMOR MAINTENANCE MANUAL, STOPPAGES & ARCHIVE SEAL'
      : isArchery
        ? 'ARCHERY SERVICE MANUAL & MUSEUM ARCHIVE SEAL'
        : 'FIELD-STRIP MANUAL, STOPPAGES & ARCHIVE SEAL',
    a4RightManualKicker: isTank
      ? 'ARMOR SERVICE & ARCHIVE'
      : isArchery
        ? 'SERVICE MANUAL & ARCHIVE'
        : 'FIELD-STRIP & ARCHIVE',
    chronicleHeading: 'Four-Act Engineering Genesis',
    breakthroughsQuoteKicker: 'DEFINING ENGINEERING BREAKTHROUGHS',
    elevationsHeading: 'ORTHOGRAPHIC ELEVATION PROFILES',
    leftProfileLabel: 'LEFT ELEVATION PROFILE',
    topProfileLabel: 'PLAN / TOP-DOWN PROFILE',
    rightProfileLabel: 'RIGHT ELEVATION PROFILE',
    cutawayHeading: isTank
      ? 'Longitudinal Armored Hull & Turret Cutaway'
      : isArchery
        ? 'Longitudinal Structural Cross-Section'
        : '45° Solid Metal Longitudinal Cutaway',
    cutawaySub: isTank
      ? 'Two-pass stencil section exposing composite armor arrays, turret fighting bay, breech, and powerpack'
      : isArchery
        ? 'Two-pass stencil cutaway exposing 7075-T6 truss walls, cam channels, and flight track'
        : 'Two-pass stencil section exposing bore wall thickness, locking recesses, gas path, and sear engagement',
    cartridgeHeading: isTank
      ? '1:10 Main-Gun Tank Ordnance Cutaway'
      : isArchery
        ? 'Carbon Projectile Precision Cutaway'
        : '1:1 Actual-Size Service Cartridge',
    ballisticsHeading: isTank
      ? 'Main Gun Pressure P(t) & Velocity V(t)'
      : isArchery
        ? 'Draw-Force F(x) & Launch Velocity V(t)'
        : 'SAAMI/CIP Pressure P(t) & Velocity V(t)',
    explodedHeading: isTank
      ? '100% Collision-Free Exploded Tank Blueprint'
      : isArchery
        ? '100% Collision-Free Exploded Archery Blueprint'
        : '100% Collision-Free Exploded Mechanical Blueprint',
    explodedSub:
      '0.35pt architectural leader lines map key moving assemblies directly to concise DK mechanical micro-copy',
    functionalRolesHeading: 'Six-Role Functional Subsystem Color Map',
    bomDirectoryHeading: 'Archival Bill of Materials (BOM) Directory',
    bomDirectoryMeta: (partsCount, trisFormatted) =>
      `${partsCount} Parametric CSG Components · ${trisFormatted} Manifold Triangles`,
    cycleSequenceHeading: isTank
      ? 'Four-Phase Main Gun Firing & Recoil Strip'
      : isArchery
        ? 'Four-Phase Slow-Motion Launch Sequence'
        : 'Four-Phase Action Sequence Cutaway Strip',
    actionPhases: actionPhasesEn,
    cycle7Heading: isTank
      ? '7-Stage Main Gun Firing, Recoil & Loading Breakdown'
      : isArchery
        ? '7-Stage Elastic Storage & Power-Stroke Breakdown'
        : '7-Stage Firing, Locking & Recoil Breakdown',
    fieldStripHeading: isTank
      ? 'Armored Depot Maintenance Sequence (DAG)'
      : isArchery
        ? 'Authorized Archery Strip Sequence (DAG)'
        : 'Guided Military Field-Strip Order (DAG)',
    malfunctionsHeading: isTank
      ? 'Main Gun & Loading Stoppage Diagnostics'
      : isArchery
        ? 'Archery Timing & Anti-Dry-Fire Diagnostics'
        : 'Malfunction & Safety Stoppage Reference',
    energyLadderHeading: isTank
      ? 'Heavy Armor Ordnance Energy Scale (MJ)'
      : 'Vault Muzzle Kinetic Energy Scale (J)',
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

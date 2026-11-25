import type { WeaponRoundFitSpec } from '../../engine/actors/BallisticsSystem';
import type {
  MuzzleAttachmentId,
  OpticAttachmentId,
  PlatformAttachmentClass,
  WeaponAttachmentMountProfile,
} from '../../engine/attachments/attachmentSpecs';
import type { WeaponMagazineStackSpec } from '../../engine/ballistics/magazineStackSpecs';
import type {
  RiflingKind,
  RiflingTwistDirection,
  WeaponRiflingSpec,
} from '../../engine/ballistics/riflingSpecs';
import type { CaliperBenchmarkPresetNote } from '../../engine/caliper/caliperStore';
import type { TurntableBoundsSpec } from '../../engine/canvas/turntableStageMetrics';
import type { FieldStripWeaponPlan } from '../../engine/fieldstrip/fieldStripSpecs';
import type {
  ActionHandleKind,
  WeaponActionDragSpec,
} from '../../engine/interaction/InteractiveActionController';
import type { WeaponMalfunctionProfile } from '../../engine/malfunctions/malfunctionSpecs';
import type {
  GasOperatingFamily,
  WeaponGasManifoldProfile,
} from '../../engine/materials/engineeringRoles';
import type { WeaponFiringTiming } from '../../engine/physics/armoryPhysics';
import type {
  TankOpticMode,
  TankReticleStyle,
} from '../../engine/tank/tankCrewStore';
import type { ExhibitProvenanceMeta } from '../../engine/utils/techDossierMarkdown';
import type { NonAllMechanismFilter } from '../../features/armory/armorySortFilter';
import type { DkEraRelation } from '../../features/monograph/dkEditorialData';
import type { HistoryTimelineNodeSpec } from '../../features/timeline/historyTimelineSpecs';
import type { WeaponEnglishFallback } from '../../i18n/weaponFallbacks';
import type {
  DirectorExhibitCategory,
  ExhibitDirectorProfile,
} from '../../narration/storyDirector';
import type { WeaponId, WeaponManifest } from '../types';
import { CENTENNIAL_BLUEPRINTS } from './centennialCatalog';
import {
  centennialPartId,
  computeCentennialPartLayout,
} from './centennialLayoutMath';
import {
  mapCentennialMechanismFilterToArmoryBucket,
  type CentennialWeaponBlueprint,
  type CentennialWeaponId,
} from './centennialTypes';

// ============================================================================
// Digital Armory 3D — Pure Acyclic Centennial Registry Projectors (66 Exhibits)
// ----------------------------------------------------------------------------
// Strictly imports ONLY pure leaf modules inside `src/weapons/expansion/` plus
// TypeScript `import type`s. ZERO runtime imports from `armory-catalog`,
// `armory-specs`, `armory-i18n`, `armory-stage`, `armory-audio`, or `three`.
// Every downstream registry imports downward from here with 0 circular chunks.
// ============================================================================

const asWeaponId = (id: CentennialWeaponId): WeaponId =>
  id as unknown as WeaponId;

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function formatWeightSpec(kg: number): string {
  if (kg >= 1000) {
    const tonnes = Number((kg / 1000).toFixed(1));
    return `${Math.round(kg).toLocaleString('en-US')} kg (${tonnes} t)`;
  }
  return `${kg.toFixed(2)} kg`;
}

// ----------------------------------------------------------------------------
// 1. WeaponManifests (`src/weapons/manifests.ts`)
// ----------------------------------------------------------------------------

function resolveCutawayLabel(bp: CentennialWeaponBlueprint): {
  zh: string;
  en: string;
  milestoneZh: string;
  milestoneEn: string;
} {
  if (bp.category === 'armor') {
    return {
      zh: '主炮炮闩与装填剖视',
      en: 'Main Breech & Loader Cutaway',
      milestoneZh: '炮闩退壳',
      milestoneEn: 'Breech Recoil',
    };
  }
  if (bp.category === 'ordnance') {
    return {
      zh: '炮闩循环与供弹剖视',
      en: 'Ordnance Breech & Feed Cutaway',
      milestoneZh: '高速循环',
      milestoneEn: 'Ordnance Cycle',
    };
  }
  if (bp.category === 'archery') {
    return {
      zh: '凸轮储能与箭道特写',
      en: 'Limb Energy & Flight Rail Focus',
      milestoneZh: '离弦加速',
      milestoneEn: 'Power Stroke',
    };
  }
  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    return {
      zh: '转轮棘轮与击锤剖视',
      en: 'Cylinder Ratchet & Hammer Focus',
      milestoneZh: '棘轮分度',
      milestoneEn: 'Ratchet Index',
    };
  }
  if (bp.kinematicLaw === 'bolt_action') {
    return {
      zh: '闭锁突笋与击针特写',
      en: 'Bolt Lugs & Striker Focus',
      milestoneZh: '手动开栓',
      milestoneEn: 'Bolt Lift',
    };
  }
  if (bp.kinematicLaw === 'pump_action') {
    return {
      zh: '双连杆泵动闭锁特写',
      en: 'Pump Action & Lifter Focus',
      milestoneZh: '泵动退壳',
      milestoneEn: 'Pump Cycle',
    };
  }
  if (bp.kinematicLaw === 'lever_action') {
    return {
      zh: '指环杠杆与闭锁块特写',
      en: 'Lever Linkage & Breech Focus',
      milestoneZh: '杠杆抛壳',
      milestoneEn: 'Lever Cycle',
    };
  }
  return {
    zh: '闭锁枪机与火控特写',
    en: 'Locking Bolt & FCG Focus',
    milestoneZh: '开锁抽壳',
    milestoneEn: 'Unlock & Extract',
  };
}

export function buildCentennialManifests(): WeaponManifest[] {
  return CENTENNIAL_BLUEPRINTS.map((bp) => {
    const layout = computeCentennialPartLayout(bp);
    const cut = resolveCutawayLabel(bp);
    const weightStr = formatWeightSpec(bp.emptyWeightKg);

    return {
      id: asWeaponId(bp.id),
      orderIndex: bp.orderIndex,
      shortLabel: bp.shortLabel,
      caliberProfile: bp.caliberProfile,
      atlasHeadingCn: `${bp.shortLabel} 真实物理材质贴图库 (Albedo / Normal / Packed ORM)`,
      catalog: {
        id: asWeaponId(bp.id),
        bayCode: bp.bayCode,
        modelCode: bp.modelCode,
        nameCn: bp.nameZh,
        subtitleEn: bp.subtitleEn,
        originCountryCn: bp.originCountryZh,
        weaponTypeCn: bp.weaponTypeZh,
        category: bp.category,
        categoryCn: bp.categoryZh,
        caliber: bp.caliberLabel,
        actionMechanism: bp.actionMechanismZh,
        specs1To1: {
          overallLengthMm: bp.overallLengthDisplayZh,
          barrelSpec: bp.barrelSpecZh,
          emptyWeightKg: weightStr,
          muzzleVelocityMs: `${bp.muzzleVelocityMs} m/s`,
          effectiveRangeM: `${bp.effectiveRangeM} m`,
          rateOfFire: bp.rateOfFireLabelZh,
        },
        assembliesCount: 4,
        partsCount: 20,
        firingStagesCount: 7,
        available: true,
        statusLabel: '百年馆藏 · 可拆解',
        description: bp.descriptionZh,
        highlights: [...bp.highlightsZh],
      },
      cameraPresets: layout.cameraPresets,
      workbenchMeta: {
        badge: `${bp.bayCode} · ${bp.year}`,
        title: `${bp.shortLabel} 内部结构 3D 拆解与击发演示`,
        subtitle: `4 大总成 · 20 核心节点 · ${bp.actionMechanismZh}`,
        cutawayLabel: cut.zh,
        cutawayTitle: `切换至合拢剖视状态并聚焦 ${bp.shortLabel} 核心闭锁与击发机构`,
        cutawayFocusPartId: centennialPartId(bp.id, 'bolt'),
        searchPlaceholder: '搜索零件名 / 编号 (如 枪管, 枪机, U-05)...',
        muzzlePos: layout.muzzlePos,
        chamberGlowPos: layout.chamberGlowPos,
        scaleProfile: bp.scaleProfile,
        gridY: layout.gridY,
        firingMilestoneLabel: cut.milestoneZh,
      },
    };
  });
}

// ----------------------------------------------------------------------------
// 2. English Fallbacks (`src/i18n/weaponFallbacks.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialEnFallbacks(): Record<
  CentennialWeaponId,
  WeaponEnglishFallback
> {
  const out = {} as Record<CentennialWeaponId, WeaponEnglishFallback>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const cut = resolveCutawayLabel(bp);
    const weightStr = formatWeightSpec(bp.emptyWeightKg);
    out[bp.id] = {
      shortLabel: bp.shortLabel,
      name: bp.nameEn,
      originCountry: bp.originCountryEn,
      weaponType: bp.weaponTypeEn,
      statusLabel: 'Centennial Vault · Ready',
      caliber: bp.caliberLabel,
      compactCaliber: bp.caliberLabel.split('(')[0].trim(),
      actionMechanism: bp.actionMechanismEn,
      overallLengthMm: bp.overallLengthDisplayEn,
      barrelSpec: bp.barrelSpecEn,
      weightKg: weightStr,
      muzzleVelocityMs: `${bp.muzzleVelocityMs} m/s`,
      effectiveRangeM: `${bp.effectiveRangeM} m`,
      rateOfFire: bp.rateOfFireLabelEn,
      description: bp.descriptionEn,
      highlights: [...bp.highlightsEn],
      workbenchTitle: `${bp.shortLabel} 3D Disassembly & Live Firing Simulation`,
      workbenchSubtitle: `4 Assemblies · 20 CAD Parts · ${bp.actionMechanismEn}`,
      cutawayLabel: cut.en,
      cutawayTitle: `Switch to cutaway mode and focus the ${bp.shortLabel} primary locking and ignition assembly`,
      searchPlaceholder: 'Search part name / BOM code (e.g. barrel, bolt, U-05)...',
      firingMilestoneLabel: cut.milestoneEn,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 3. Barrel Rifling Specs (`src/engine/ballistics/riflingSpecs.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialRiflingSpecs(): Record<
  CentennialWeaponId,
  WeaponRiflingSpec
> {
  const out = {} as Record<CentennialWeaponId, WeaponRiflingSpec>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const kind: RiflingKind =
      bp.rifling.profile === 'conventional'
        ? 'cut_rifled'
        : bp.rifling.profile === 'polygonal'
          ? 'polygonal'
          : bp.rifling.profile === 'smoothbore'
            ? 'smoothbore'
            : 'none';
    const direction: RiflingTwistDirection =
      bp.rifling.twistDirection === 'NONE' ? 'none' : bp.rifling.twistDirection;
    const twistInches =
      bp.rifling.twistMm > 0 ? round2(bp.rifling.twistMm / 25.4) : 0;
    const chromeLined =
      kind === 'smoothbore' ||
      bp.year >= 1945 ||
      bp.category === 'lmg' ||
      bp.category === 'ordnance';

    let labelEn: string;
    let labelZh: string;
    if (kind === 'none') {
      labelEn = 'Archery Flight Rail (Non-Rifled)';
      labelZh = '冷兵箭道导向（无膛线）';
    } else if (kind === 'smoothbore') {
      labelEn = `Hard-Chrome Smoothbore (Ø${bp.rifling.boreDiameterMm} mm)`;
      labelZh = `硬铬滑膛身管（Ø${bp.rifling.boreDiameterMm} mm）`;
    } else if (kind === 'polygonal') {
      labelEn = `${bp.rifling.grooveCount}-Flat Polygonal · 1:${twistInches}" ${direction}`;
      labelZh = `${bp.rifling.grooveCount} 棱多边形膛线 · 1:${bp.rifling.twistMm} mm ${direction === 'LH' ? '左旋' : '右旋'}`;
    } else {
      labelEn = `${bp.rifling.grooveCount}-Groove Cut-Rifled · 1:${twistInches}" ${direction}`;
      labelZh = `${bp.rifling.grooveCount} 条切削膛线 · 1:${bp.rifling.twistMm} mm ${direction === 'LH' ? '左旋' : '右旋'}`;
    }

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      kind,
      grooves: bp.rifling.grooveCount,
      twistInches,
      twistMm: bp.rifling.twistMm,
      direction,
      boreDiameterMm: bp.rifling.boreDiameterMm,
      chromeLined,
      labelEn,
      labelZh,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 4. Recoil Physics Specs (`src/features/recoillab/recoilPhysics.ts`)
// ----------------------------------------------------------------------------

export interface CentennialRecoilSpec {
  readonly platformMassKg: number;
  readonly boreAxisMm: number;
  readonly gasBeta: number;
  readonly basePulseDurationMs: number;
  readonly factoryMuzzleRedirect: number;
  readonly climbCoupling: number;
  readonly cyclicRpm: number;
  readonly pivotKind: 'wrist' | 'shoulder' | 'mount' | 'trunnion';
  readonly supportsMuzzleDevices: boolean;
}

export function buildCentennialRecoilSpecs(): Record<
  CentennialWeaponId,
  CentennialRecoilSpec
> {
  const out = {} as Record<CentennialWeaponId, CentennialRecoilSpec>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const isArchery = bp.category === 'archery';
    const isArmor = bp.category === 'armor';
    const isOrdnance = bp.category === 'ordnance';
    const isPistol = bp.category === 'pistol';
    const isHeavyMount =
      isOrdnance || bp.archetype === 'heavy_mg' || bp.archetype === 'lmg_belt';

    const pivotKind: CentennialRecoilSpec['pivotKind'] = isArmor
      ? 'trunnion'
      : isOrdnance || bp.archetype === 'heavy_mg'
        ? 'mount'
        : isPistol
          ? 'wrist'
          : 'shoulder';

    const gasBeta = isArchery
      ? 0
      : isArmor
        ? 1.55
        : isOrdnance
          ? 1.65
          : bp.category === 'sniper' || bp.category === 'lmg'
            ? 1.75
            : isPistol
              ? 1.35
              : 1.62;

    const factoryMuzzleRedirect =
      bp.cad.muzzleStyle === 'artillery_brake'
        ? 0.42
        : bp.cad.muzzleStyle === 'brake'
          ? 0.34
          : bp.cad.muzzleStyle === 'suppressor'
            ? 0.18
            : bp.cad.muzzleStyle === 'flash_hider'
              ? 0.08
              : 0;

    const basePulseDurationMs = isArmor
      ? 24.0
      : isOrdnance
        ? 18.0
        : isArchery
          ? 14.0
          : bp.kinematicLaw === 'direct_impingement' ||
              bp.kinematicLaw === 'short_stroke_piston'
            ? 9.2
            : isPistol
              ? 5.8
              : 8.4;

    const climbCoupling = isArmor
      ? 0.08
      : isOrdnance
        ? 0.14
        : isArchery
          ? 0.25
          : bp.kinematicLaw === 'direct_impingement'
            ? 0.78
            : bp.archetype === 'bullpup_rifle'
              ? 0.84
              : isHeavyMount
                ? 0.45
                : 0.94;

    const cyclicRpm =
      isArchery ||
      isArmor ||
      bp.kinematicLaw === 'bolt_action' ||
      bp.kinematicLaw === 'pump_action' ||
      bp.kinematicLaw === 'lever_action' ||
      bp.kinematicLaw === 'revolver_cylinder' ||
      bp.kinematicLaw === 'artillery_howitzer'
        ? 0
        : bp.rateOfFireRpm;

    out[bp.id] = {
      platformMassKg: bp.emptyWeightKg,
      boreAxisMm: bp.boreAxisMm,
      gasBeta,
      basePulseDurationMs,
      factoryMuzzleRedirect,
      climbCoupling,
      cyclicRpm,
      pivotKind,
      supportsMuzzleDevices: !isArchery && !isArmor && !isOrdnance,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 5. Scale Wall Metrology (`src/features/scalewall/scaleWallSpecs.ts`)
// ----------------------------------------------------------------------------

export interface CentennialScaleWallMetrology {
  readonly oalMm: number;
  readonly secondaryMm?: number;
  readonly massKg: number;
  readonly muzzleEnergyJ?: number;
  readonly eraYear: number;
  readonly caliberEn: string;
  readonly caliberZh: string;
}

export function buildCentennialScaleWallMetrology(): Record<
  CentennialWeaponId,
  CentennialScaleWallMetrology
> {
  const out = {} as Record<CentennialWeaponId, CentennialScaleWallMetrology>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    out[bp.id] = {
      oalMm: bp.overallLengthMm,
      secondaryMm: bp.barrelLengthMm,
      massKg: bp.emptyWeightKg,
      muzzleEnergyJ: bp.muzzleEnergyJ,
      eraYear: bp.year,
      caliberEn: bp.caliberLabel,
      caliberZh: bp.caliberLabel,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 6. Caliper Benchmarks (`src/engine/caliper/caliperStore.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialCaliperBenchmarks(): Record<
  CentennialWeaponId,
  readonly CaliperBenchmarkPresetNote[]
> {
  const out = {} as Record<
    CentennialWeaponId,
    readonly CaliperBenchmarkPresetNote[]
  >;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const isArmor = bp.category === 'armor';
    const isArchery = bp.category === 'archery';
    const isOrdnance = bp.category === 'ordnance';

    const thirdNominalMm = isArmor
      ? Math.round(bp.overallLengthMm * 0.065)
      : isOrdnance
        ? Math.round(bp.barrelLengthMm * 0.14)
        : isArchery
          ? Math.round(bp.overallLengthMm * 0.18)
          : Math.max(18, Math.round(bp.cad.receiverLenCm * 3.8));

    out[bp.id] = [
      {
        kind: 'overall_envelope',
        labelZh: isArmor ? '全车含炮管总长' : '整枪/全装标准全长',
        labelEn: isArmor ? 'Overall Length (Gun Forward)' : 'Factory Overall Length',
        nominalMm: bp.overallLengthMm,
      },
      {
        kind: 'barrel_length',
        labelZh: isArchery
          ? '标准拉距 / 驱动行程'
          : isArmor
            ? '主炮身管全长'
            : isOrdnance
              ? '火炮身管全长'
              : bp.rifling.profile === 'smoothbore'
                ? '标准滑膛枪管实长'
                : '标准线膛枪管实长',
        labelEn: isArchery
          ? 'Draw Length / Power Stroke'
          : isArmor
            ? 'Main Cannon Tube Length'
            : isOrdnance
              ? 'Ordnance Barrel Length'
              : bp.rifling.profile === 'smoothbore'
                ? 'Factory Smoothbore Barrel Length'
                : 'Factory Barrel Length',
        nominalMm: bp.barrelLengthMm,
      },
      {
        kind: 'bolt_lug_span',
        labelZh: isArmor
          ? '主炮炮闩与后坐行程'
          : isArchery
            ? '弓档高度 / 弦距跨度'
            : '枪机行程 / 闭锁跨距',
        labelEn: isArmor
          ? 'Breech & Recoil Stroke Span'
          : isArchery
            ? 'Brace Height / Power Span'
            : 'Bolt Travel & Lockup Span',
        nominalMm: thirdNominalMm,
      },
    ];
  }
  return out;
}

// ----------------------------------------------------------------------------
// 7. Story Director Profiles (`src/narration/storyDirector.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialDirectorProfiles(): Record<
  CentennialWeaponId,
  ExhibitDirectorProfile
> {
  const out = {} as Record<CentennialWeaponId, ExhibitDirectorProfile>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const category: DirectorExhibitCategory =
      bp.category === 'armor'
        ? 'tank'
        : bp.category === 'ordnance'
          ? 'ordnance'
          : bp.category === 'archery'
            ? 'archery'
            : 'firearm';

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      category,
      actFocusParts: [
        centennialPartId(bp.id, 'receiver'),
        centennialPartId(bp.id, 'bolt'),
        centennialPartId(bp.id, 'barrel'),
        centennialPartId(bp.id, 'mag_body'),
      ],
      breakthroughParts: [
        centennialPartId(bp.id, 'bolt_carrier'),
        centennialPartId(bp.id, 'gas_system'),
      ],
      fieldStripProgress: 0.3,
      subStripProgress:
        category === 'tank' ? 0.48 : category === 'firearm' ? 0.52 : 0.5,
      firingSlowMo: 0.25,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 8. History Timeline Nodes (`src/features/timeline/historyTimelineSpecs.ts`)
// ----------------------------------------------------------------------------

const LINEAGE_DEFAULT_LANE: Readonly<
  Record<CentennialWeaponBlueprint['timelineLineage'], number>
> = {
  toggle_short_recoil: 0,
  gas_rotating_bolt: 1,
  roller_blowback_delayed: 2,
  manual_revolver_lever: 3,
  compound_archery: 4,
  heavy_armor_mbt: 5,
};

function resolveTimelineAncestors(bp: CentennialWeaponBlueprint): string[] {
  switch (bp.timelineLineage) {
    case 'gas_rotating_bolt':
      if (bp.year >= 1948 && bp.id !== 'ak47') return ['ak47'];
      if (bp.year >= 1936) return ['garand'];
      if (bp.year >= 1918 && bp.id !== 'bar1918') return ['bar1918'];
      return [];
    case 'toggle_short_recoil':
      if (bp.category === 'pistol') {
        if (bp.year >= 1911) return ['m1911'];
        if (bp.year >= 1900) return ['p08'];
        return [];
      }
      if (bp.year >= 1933 && bp.id !== 'm2hb') return ['m2hb'];
      if (bp.year >= 1911) return ['m1911'];
      return [];
    case 'roller_blowback_delayed':
      if (bp.archetype === 'rotary_cannon') {
        return bp.year >= 1942 ? ['mg42'] : [];
      }
      if (bp.year >= 1959 && bp.id !== 'g3a3') return ['g3a3'];
      if (bp.year >= 1942) return ['mg42'];
      if (bp.year >= 1928) return ['thompson'];
      return [];
    case 'manual_revolver_lever':
      if (bp.category === 'sniper' || bp.kinematicLaw === 'bolt_action') {
        if (bp.year >= 1935) return ['k98k'];
        if (bp.year >= 1891 && bp.id !== 'mosin') return ['mosin'];
        return [];
      }
      if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
        return bp.year >= 1873 && bp.id !== 'saa1873' ? ['saa1873'] : [];
      }
      if (bp.kinematicLaw === 'pump_action') {
        if (bp.year >= 1950) return ['rem870'];
        if (bp.year >= 1894) return ['winchester1894'];
        return [];
      }
      return bp.year >= 1894 ? ['winchester1894'] : [];
    case 'compound_archery':
      return bp.id === 'englishlongbow' ? [] : ['englishlongbow'];
    case 'heavy_armor_mbt':
      if (bp.id === 't90m') return ['ztz99a'];
      if (bp.id === 'merkava4') return ['challenger2'];
      if (bp.id === 'challenger2' || bp.id === 't34_85') return ['tiger1'];
      return bp.year >= 2011 ? ['ztz99a'] : bp.year >= 1942 ? ['tiger1'] : [];
  }
}

export function buildCentennialTimelineNodes(): HistoryTimelineNodeSpec[] {
  return CENTENNIAL_BLUEPRINTS.map((bp) => ({
    weaponId: bp.id,
    year: bp.year,
    lineageId: bp.timelineLineage,
    lane: LINEAGE_DEFAULT_LANE[bp.timelineLineage],
    ancestors: resolveTimelineAncestors(bp).filter((a) => a !== bp.id),
    designerZh: bp.manufacturerZh,
    designerEn: bp.manufacturerEn,
    innovationZh: bp.actionMechanismZh,
    innovationEn: bp.actionMechanismEn,
  }));
}

// ----------------------------------------------------------------------------
// 9. Tech Dossier Provenance (`src/engine/utils/techDossierMarkdown.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialTechDossierProvenance(): Record<
  CentennialWeaponId,
  ExhibitProvenanceMeta
> {
  const out = {} as Record<CentennialWeaponId, ExhibitProvenanceMeta>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    out[bp.id] = {
      year: bp.year,
      manufacturerEn: bp.manufacturerEn,
      manufacturerZh: bp.manufacturerZh,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 10. Armory Sort & Mechanism Filter Metadata (`src/features/armory/armorySortFilter.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialArmorySortMeta(): {
  years: Record<CentennialWeaponId, number>;
  filters: Record<CentennialWeaponId, NonAllMechanismFilter>;
} {
  const years = {} as Record<CentennialWeaponId, number>;
  const filters = {} as Record<CentennialWeaponId, NonAllMechanismFilter>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    years[bp.id] = bp.year;
    filters[bp.id] = mapCentennialMechanismFilterToArmoryBucket(
      bp.mechanismFilter
    );
  }
  return { years, filters };
}

// ----------------------------------------------------------------------------
// 11. Firing Timings (`src/engine/physics/armoryPhysics.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialFiringTimings(): Record<
  CentennialWeaponId,
  WeaponFiringTiming
> {
  const out = {} as Record<CentennialWeaponId, WeaponFiringTiming>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const isGas =
      bp.kinematicLaw === 'long_stroke_piston' ||
      bp.kinematicLaw === 'short_stroke_piston' ||
      bp.kinematicLaw === 'direct_impingement' ||
      bp.kinematicLaw === 'tilting_bolt';

    const isArmor = bp.category === 'armor';
    const isOrdnance = bp.category === 'ordnance';
    const isArchery = bp.category === 'archery';

    out[bp.id] = {
      ignitionF: isArmor ? 0.08 : isArchery ? 0.12 : 0.1,
      muzzleExitF: isArmor ? 0.24 : isOrdnance ? 0.22 : isArchery ? 0.36 : 0.26,
      ejectF: isArmor ? 0.62 : isArchery ? 0.5 : 0.56,
      batteryF: isArmor ? 0.94 : 0.9,
      gasPortTravel: isGas ? 0.62 : null,
      ejectDirX: -0.22,
      ejectDirY: bp.id === 'dp28' || bp.id === 'bofors40' ? -0.85 : 0.45,
      ejectDirZ: bp.id === 'dp28' || bp.id === 'bofors40' ? 0.2 : 0.86,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 12A. Field-Strip 5-Step Acyclic DAG Plans (`src/engine/fieldstrip/fieldStripSpecs.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialFieldStripPlans(): Record<
  CentennialWeaponId,
  FieldStripWeaponPlan
> {
  const out = {} as Record<CentennialWeaponId, FieldStripWeaponPlan>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);
    const isArmor = bp.category === 'armor';
    const isArchery = bp.category === 'archery';
    const isOrdnance = bp.category === 'ordnance';
    const isRevolver =
      bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da';

    const step1TitleZh = isArmor
      ? '清空主炮装弹机/弹药架'
      : isArchery
        ? '卸除快拆箭壶与护箭帽'
        : isRevolver
          ? '外摆清空转轮弹巢'
          : isOrdnance
            ? '解除重型供弹鼓/供弹槽'
            : '卸下供弹弹匣并验枪清膛';
    const step1TitleEn = isArmor
      ? 'Clear Autoloader / Ammo Stowage'
      : isArchery
        ? 'Detach Arrow Quiver & Hood'
        : isRevolver
          ? 'Unload Fluted Cylinder'
          : isOrdnance
            ? 'Disconnect Ordnance Feed Assembly'
            : 'Remove Magazine & Clear Chamber';

    const step2TitleZh = isArmor
      ? '检视观瞄仪与首上复合甲'
      : isArchery
        ? '分离光学弓瞄与护指托'
        : '拆离瞄准镜/前护木与附件轨';
    const step2TitleEn = isArmor
      ? 'Inspect CITV Optics & Glacis Armor'
      : isArchery
        ? 'Detach Sight Optic & Limb Pockets'
        : 'Remove Optic, Handguard & Mount Rail';

    const step3TitleZh = isArmor
      ? '分离车体底盘后段与炮塔辅助配重'
      : isArchery
        ? '拆离后托平衡杆与人体工学握把'
        : '卸除枪托组件与握把总成';
    const step3TitleEn = isArmor
      ? 'Detach Hull Rear Deck & Turret Bustle'
      : isArchery
        ? 'Strip Stabilizer & Ergonomic Grip'
        : 'Detach Buttstock & Grip Assembly';

    const step4TitleZh = isArmor
      ? '取出滑楔炮闩与液气复进机'
      : isArchery
        ? '卸载储能弓片与凸轮弓弦组'
        : '抽出复进簧、枪机框与闭锁枪机';
    const step4TitleEn = isArmor
      ? 'Extract Sliding Breech & Recuperator'
      : isArchery
        ? 'Release Power Limbs, Cams & String'
        : 'Extract Recoil Spring, Carrier & Bolt';

    const step5TitleZh = isArmor
      ? '分离主炮身管与炮口装置'
      : isArchery
        ? '检视箭矢导向与弓梢减震器'
        : '分离精密身管与膛口装置';
    const step5TitleEn = isArmor
      ? 'Detach Main Cannon Tube & Muzzle Brake'
      : isArchery
        ? 'Inspect Arrow Rest & Tip Dampers'
        : 'Detach Precision Barrel & Muzzle Device';

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      manualCodeZh: `军械勤务手册 · ${bp.bayCode} ${bp.shortLabel}`,
      manualCodeEn: `TM-${bp.bayCode} · ${bp.shortLabel} Field Manual`,
      steps: [
        {
          id: 'step_1_feed_clear',
          orderLabel: '01',
          titleZh: step1TitleZh,
          titleEn: step1TitleEn,
          actionHintZh: `点击「供弹主体」分离 ${bp.shortLabel} 供弹组件并确认安全清膛。`,
          actionHintEn: `Click the feed housing to detach the ${bp.shortLabel} ammunition assembly and verify clear.`,
          requires: [],
          stripBlockedNoteZh: '',
          stripBlockedNoteEn: '',
          reassembleBlockedNoteZh: '请先复装护木、托握把与核心闭锁组件，再装回供弹总成。',
          reassembleBlockedNoteEn:
            'Reassemble the furniture, stock, and action group before reinstalling the feed assembly.',
          triggerPartIds: [p('mag_body'), p('mag_base')],
          bindings: [
            { partId: p('mag_body'), explodeStepIndices: [0] },
            { partId: p('follower'), explodeStepIndices: [0] },
            { partId: p('mag_spring'), explodeStepIndices: [0] },
            { partId: p('mag_base'), explodeStepIndices: [0] },
          ],
        },
        {
          id: 'step_2_furniture_optics',
          orderLabel: '02',
          titleZh: step2TitleZh,
          titleEn: step2TitleEn,
          actionHintZh: '点击光学瞄具、护木或导轨组件，释放外围覆盖件。',
          actionHintEn:
            'Click the optic, forend, or rail mount to clear exterior furniture.',
          requires: ['step_1_feed_clear'],
          stripBlockedNoteZh: '请先完成步骤 01 卸除供弹组件并确保处于空膛安全状态。',
          stripBlockedNoteEn:
            'Complete Step 01 first to remove the feed assembly and confirm safe clear.',
          reassembleBlockedNoteZh: '请先装回后托与握把总成，再锁定外围护木与光学组件。',
          reassembleBlockedNoteEn:
            'Reinstall the stock and grip assembly before locking exterior furniture and optics.',
          triggerPartIds: [p('optic'), p('handguard'), p('mount_rail')],
          bindings: [
            { partId: p('optic'), explodeStepIndices: [0] },
            { partId: p('handguard'), explodeStepIndices: [0] },
            { partId: p('mount_rail'), explodeStepIndices: [0] },
          ],
        },
        {
          id: 'step_3_stock_grip',
          orderLabel: '03',
          titleZh: step3TitleZh,
          titleEn: step3TitleEn,
          actionHintZh: '点击枪托或握把总成，敞开后部复进簧与自动机通道。',
          actionHintEn:
            'Click the stock or grip assembly to open rear access to the action channel.',
          requires: ['step_1_feed_clear', 'step_2_furniture_optics'],
          stripBlockedNoteZh: '需先清空供弹组并移除外部瞄具护木后才可安全拆离托握总成。',
          stripBlockedNoteEn:
            'Clear the feed group and exterior furniture before detaching the stock and grip.',
          reassembleBlockedNoteZh: '请先装回内部复进簧与核心自动机，再锁紧枪托与握把。',
          reassembleBlockedNoteEn:
            'Reinstall the recoil spring and bolt carrier group before locking the stock and grip.',
          triggerPartIds: [p('stock'), p('grip')],
          bindings: [
            { partId: p('stock'), explodeStepIndices: [0] },
            { partId: p('grip'), explodeStepIndices: [0] },
          ],
        },
        {
          id: 'step_4_action_group',
          orderLabel: '04',
          titleZh: step4TitleZh,
          titleEn: step4TitleEn,
          actionHintZh: '点击复进簧、枪机框或闭锁枪机头，抽出全部往复核心运动件。',
          actionHintEn:
            'Click the recoil spring, carrier, or locking bolt to withdraw the reciprocating action.',
          requires: ['step_3_stock_grip'],
          stripBlockedNoteZh: '后部托握组件尚未拆离，无法安全抽出内部复进簧与枪机组。',
          stripBlockedNoteEn:
            'Detach the stock and grip assembly in Step 03 before extracting internal action parts.',
          reassembleBlockedNoteZh: '请先就位身管与膛口装置，再推入枪机框与复进簧。',
          reassembleBlockedNoteEn:
            'Seat the barrel and muzzle assembly before inserting the bolt carrier and spring.',
          triggerPartIds: [
            p('recoil_spring'),
            p('bolt_carrier'),
            p('bolt'),
            p('gas_system'),
          ],
          bindings: [
            { partId: p('recoil_spring'), explodeStepIndices: [0] },
            { partId: p('bolt_carrier'), explodeStepIndices: [0] },
            { partId: p('bolt'), explodeStepIndices: [0] },
            { partId: p('gas_system'), explodeStepIndices: [0] },
          ],
        },
        {
          id: 'step_5_barrel_muzzle',
          orderLabel: '05',
          titleZh: step5TitleZh,
          titleEn: step5TitleEn,
          actionHintZh: '点击主身管或膛口装置，完成野战勤务全检拆解。',
          actionHintEn:
            'Click the barrel or muzzle device to complete field inspection stripping.',
          requires: ['step_4_action_group'],
          stripBlockedNoteZh: '需先抽出复进簧与闭锁枪机解除机械干涉，再分离身管组件。',
          stripBlockedNoteEn:
            'Withdraw the recoil spring and bolt assembly first to clear barrel interference.',
          reassembleBlockedNoteZh: '',
          reassembleBlockedNoteEn: '',
          triggerPartIds: [p('barrel'), p('muzzle')],
          bindings: [
            { partId: p('barrel'), explodeStepIndices: [0] },
            { partId: p('muzzle'), explodeStepIndices: [0] },
          ],
        },
      ],
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 12B. Malfunction Profiles (`src/engine/malfunctions/malfunctionSpecs.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialMalfunctionProfiles(): Record<
  CentennialWeaponId,
  WeaponMalfunctionProfile
> {
  const out = {} as Record<CentennialWeaponId, WeaponMalfunctionProfile>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);
    const isTopMag = bp.cad.magStyle === 'pan' || bp.cad.magStyle === 'top_clip';
    const isHeavy = bp.category === 'armor' || bp.category === 'ordnance';

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      actionPartIds: [p('bolt_carrier'), p('bolt'), p('recoil_spring')],
      lockingPartIds: [p('bolt'), p('barrel')],
      extractorPartId: p('bolt'),
      fireControlPartIds: [
        p('trigger'),
        p('hammer'),
        p('hammer_spring'),
        p('selector'),
      ],
      magazinePartIds: [
        p('mag_body'),
        p('follower'),
        p('mag_spring'),
        p('mag_base'),
      ],
      magStripOffsetCm: isHeavy
        ? [0, isTopMag ? 42 : -45, 0]
        : [0, isTopMag ? 9 : -11, 0],
      ejectionUpSign: bp.id === 'dp28' || bp.id === 'bofors40' ? -1 : 1,
      stovepipeF: 0.62,
      doubleFeedF: 0.72,
      rackFullOpenF: 0.56,
      lightStrikeF: 0.08,
      outOfBatteryF: 0.84,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13A. Attachment Mount Profiles (`src/engine/attachments/attachmentSpecs.ts`)
// ----------------------------------------------------------------------------

const ALL_MUZZLES: readonly MuzzleAttachmentId[] = [
  'none',
  'suppressor',
  'muzzle_brake',
  'flash_hider',
];
const ALL_OPTICS: readonly OpticAttachmentId[] = [
  'none',
  'red_dot',
  'lpvo',
  'thermal',
];
const PISTOL_OPTICS: readonly OpticAttachmentId[] = ['none', 'red_dot'];
const NONE_MUZZLE: readonly MuzzleAttachmentId[] = ['none'];
const NONE_OPTIC: readonly OpticAttachmentId[] = ['none'];

export function buildCentennialAttachmentSpecs(): Record<
  CentennialWeaponId,
  WeaponAttachmentMountProfile
> {
  const out = {} as Record<CentennialWeaponId, WeaponAttachmentMountProfile>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const layout = computeCentennialPartLayout(bp);
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);

    const platformClass: PlatformAttachmentClass = bp.category;
    const isUnsupported =
      bp.category === 'archery' ||
      bp.category === 'armor' ||
      bp.category === 'ordnance';

    if (isUnsupported) {
      out[bp.id] = {
        weaponId: asWeaponId(bp.id),
        platformClass,
        modelScale: round2(layout.sceneScale),
        muzzleAnchor: null,
        muzzleFollowPartId: null,
        muzzleReplacedPartIds: [],
        opticRailAnchor: null,
        opticFollowPartId: null,
        opticReplacedPartIds: [],
        allowedMuzzles: NONE_MUZZLE,
        allowedOptics: NONE_OPTIC,
        muzzleCompatibilityNoteZh:
          bp.category === 'archery'
            ? '弓弩平台无火药膛口螺纹，不适用消音器或枪口制退器。'
            : '重装甲主炮/重型火炮采用原厂专用驻退与抽烟装置，不适用轻武器通用枪口件。',
        muzzleCompatibilityNoteEn:
          bp.category === 'archery'
            ? 'Archery platforms do not use threaded firearm muzzle devices.'
            : 'Heavy armor cannons and ordnance use dedicated factory brakes/evacuators rather than small-arms muzzle devices.',
        opticCompatibilityNoteZh:
          bp.category === 'archery'
            ? '弓弩已配备专用多距弓瞄/弩镜系统。'
            : '重装甲与火炮已集成专属车长周视/炮长热成像或数字火控观瞄系统。',
        opticCompatibilityNoteEn:
          bp.category === 'archery'
            ? 'Archery exhibit uses its dedicated bow/crossbow sighting system.'
            : 'Heavy armor and ordnance exhibits use dedicated CITV thermal or digital fire-control optics.',
      };
      continue;
    }

    const isPistol = bp.category === 'pistol';
    const isRevolver =
      bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da';
    const receiverPos = layout.assembledPos.receiver;
    const railY = round2(receiverPos[1] + layout.dims.receiverH * 0.55);

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      platformClass,
      modelScale: isPistol ? 0.65 : bp.scaleProfile === 'heavy_sniper' ? 0.78 : 0.58,
      muzzleAnchor: isRevolver ? null : layout.muzzlePos,
      muzzleFollowPartId: null,
      muzzleReplacedPartIds: isRevolver ? [] : [p('muzzle')],
      opticRailAnchor: [round2(receiverPos[0]), railY, 0],
      opticFollowPartId: null,
      opticReplacedPartIds: [p('optic')],
      allowedMuzzles: isRevolver ? NONE_MUZZLE : ALL_MUZZLES,
      allowedOptics: isPistol ? PISTOL_OPTICS : ALL_OPTICS,
      ...(isRevolver
        ? {
            muzzleCompatibilityNoteZh:
              '转轮手枪弹巢存在气隙，通常不配通用螺纹消音器。',
            muzzleCompatibilityNoteEn:
              'Cylinder-gap gas escape prevents conventional suppressor mounting on revolvers.',
          }
        : {}),
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13B. Magazine Stack Specs (`src/engine/ballistics/magazineStackSpecs.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialMagazineStackSpecs(): Record<
  CentennialWeaponId,
  WeaponMagazineStackSpec
> {
  const out = {} as Record<CentennialWeaponId, WeaponMagazineStackSpec>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const layout = computeCentennialPartLayout(bp);
    const magPos = layout.assembledPos.mag_body;
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);

    // Centennial procedural exhibits house closed sculptural CAD magazines/drums/quivers/racks
    // while `BallisticsSystem` animates the live chambered, feeding, and ejected round (`roundCount: 0, slots: []`).
    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      magBodyPartId: p('mag_body'),
      followerPartId: p('follower'),
      roundCount: 0,
      firingHandoffSlotIndex: 0,
      feedWindow: [0.58, 0.84],
      replenishWindow: [0.9, 0.99],
      magSubStripStartT: 0.45,
      followerDeckPlane: {
        point: magPos,
        normal: bp.cad.magStyle === 'tube' ? [-1, 0, 0] : [0, 1, 0],
      },
      slots: [],
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13C. Causality Sandbox Nominal Cadence (`src/engine/physics/causalitySandbox.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialCausalityDefaults(): Record<
  CentennialWeaponId,
  number
> {
  const out = {} as Record<CentennialWeaponId, number>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    out[bp.id] = Math.max(4, bp.rateOfFireRpm);
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13D. Turntable Stage Metrics (`src/engine/canvas/turntableStageMetrics.ts`)
// ----------------------------------------------------------------------------

export function buildCentennialTurntableMetrics(): Record<
  CentennialWeaponId,
  TurntableBoundsSpec
> {
  const out = {} as Record<CentennialWeaponId, TurntableBoundsSpec>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const layout = computeCentennialPartLayout(bp);
    const cx = round2((layout.boundsMin[0] + layout.boundsMax[0]) * 0.5);
    const minY = round2(layout.boundsMin[1]);
    const maxY = round2(layout.boundsMax[1]);
    const spanX = round2(Math.max(12, layout.boundsMax[0] - layout.boundsMin[0]));

    let eMinX = layout.boundsMin[0];
    let eMaxX = layout.boundsMax[0];
    let eMinY = layout.boundsMin[1];
    let eMaxY = layout.boundsMax[1];
    for (const slot of Object.keys(layout.assembledPos) as Array<
      keyof typeof layout.assembledPos
    >) {
      const a = layout.assembledPos[slot];
      const o = layout.explodeOffset[slot];
      const x = a[0] + o[0] * 0.58;
      const y = a[1] + o[1] * 0.58;
      if (x < eMinX) eMinX = x;
      if (x > eMaxX) eMaxX = x;
      if (y < eMinY) eMinY = y;
      if (y > eMaxY) eMaxY = y;
    }

    out[bp.id] = {
      cx,
      minY,
      maxY,
      spanX,
      explode58: {
        cx: round2((eMinX + eMaxX) * 0.5),
        minY: round2(eMinY),
        maxY: round2(eMaxY),
        spanX: round2(Math.max(spanX, eMaxX - eMinX)),
      },
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13E. Gas Manifold Profiles (`src/engine/materials/engineeringRoles.ts`)
// ----------------------------------------------------------------------------

function resolveGasOperatingFamily(
  bp: CentennialWeaponBlueprint
): GasOperatingFamily {
  switch (bp.kinematicLaw) {
    case 'long_stroke_piston':
    case 'tilting_bolt':
      return 'long_stroke_piston';
    case 'direct_impingement':
      return 'direct_impingement';
    case 'short_stroke_piston':
      return 'short_stroke_piston';
    case 'roller_delayed':
    case 'lever_delayed':
      return 'roller_delayed_blowback';
    case 'open_bolt_blowback':
    case 'closed_bolt_blowback':
      return 'straight_blowback';
    case 'browning_tilt_barrel':
    case 'falling_block_pistol':
    case 'aa_sliding_wedge':
      return 'short_recoil_tilting';
    case 'bolt_action':
    case 'pump_action':
    case 'lever_action':
      return 'manual_bolt_action';
    case 'revolver_cylinder':
      return 'revolver_ratchet_index';
    case 'compound_bow':
    case 'self_longbow':
      return 'compound_bow_binary_cam';
    case 'recurve_crossbow':
      return 'compound_crossbow_helical_cam';
    case 'tank_carousel':
      return 'tank_smoothbore_autoloader';
    case 'tank_manual':
      return bp.archetype === 'mbt_wwii'
        ? 'tank_rifled_horizontal_wedge'
        : 'tank_smoothbore_bustle';
    case 'rotary_gatling':
      return 'electric_rotary_gatling';
    case 'artillery_howitzer':
      return 'tank_rifled_horizontal_wedge';
  }
}

export function buildCentennialGasManifolds(): Record<
  CentennialWeaponId,
  WeaponGasManifoldProfile
> {
  const out = {} as Record<CentennialWeaponId, WeaponGasManifoldProfile>;
  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const layout = computeCentennialPartLayout(bp);
    const family = resolveGasOperatingFamily(bp);
    const hasGasTap =
      bp.kinematicLaw === 'long_stroke_piston' ||
      bp.kinematicLaw === 'short_stroke_piston' ||
      bp.kinematicLaw === 'direct_impingement' ||
      bp.kinematicLaw === 'tilting_bolt';

    const chamberX = layout.chamberGlowPos[0];
    const muzzleX = layout.muzzlePos[0];
    const boreY = layout.boreY;
    const gasPortX = hasGasTap
      ? round2(chamberX + (muzzleX - chamberX) * 0.62)
      : null;
    const gasChannelY = round2(boreY + Math.max(0.9, layout.dims.barrelBreechR * 1.45));

    out[bp.id] = {
      weaponId: asWeaponId(bp.id),
      family,
      hasGasTap,
      familyTitleZh: bp.actionMechanismZh,
      familyTitleEn: bp.actionMechanismEn,
      flowNoteZh: hasGasTap
        ? `弹头经过枪管导气孔后，高压燃气驱动 ${bp.shortLabel} 导气机构完成开锁、抽壳与复进循环。`
        : `${bp.shortLabel} 采用非导气孔式机构（${bp.actionMechanismZh}），火药燃气或弹性储能直接沿主轴释放。`,
      flowNoteEn: hasGasTap
        ? `Once the projectile passes the bore gas port, high-pressure gas drives the ${bp.shortLabel} operating cycle through unlock and extraction.`
        : `The ${bp.shortLabel} operates without a bore gas tap (${bp.actionMechanismEn}), expelling propellant or stored energy directly along the primary axis.`,
      chamberX,
      muzzleX,
      boreY,
      gasPortX,
      gasChannelY,
      gasChannelZ: 0,
      gasTargetX: round2(chamberX + (hasGasTap ? 0.5 : 0)),
      ventPos: hasGasTap && gasPortX !== null ? [gasPortX, gasChannelY, 0] : null,
    };
  }
  return out;
}

// ----------------------------------------------------------------------------
// 13F. Interactive Action Drag Specs (`src/engine/interaction/InteractiveActionController.tsx`)
// ----------------------------------------------------------------------------

const AXIS_REARWARD: readonly [number, number, number] = [-1, 0, 0];
const AXIS_UP: readonly [number, number, number] = [0, 1, 0];
const AXIS_DOWN: readonly [number, number, number] = [0, -1, 0];

export function buildCentennialInteractionSpecs(): {
  explicitActionParts: Record<CentennialWeaponId, readonly string[]>;
  dragSpecs: Record<CentennialWeaponId, WeaponActionDragSpec>;
} {
  const explicitActionParts = {} as Record<
    CentennialWeaponId,
    readonly string[]
  >;
  const dragSpecs = {} as Record<CentennialWeaponId, WeaponActionDragSpec>;

  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);

    let handleKind: ActionHandleKind = 'charging_handle';
    let worldDragAxis: readonly [number, number, number] = AXIS_REARWARD;
    let labelZh = '拉动枪机拉柄';
    let labelEn = 'Drag Charging Handle';
    let parts: readonly string[] = [p('bolt_carrier'), p('bolt')];

    if (bp.category === 'archery') {
      handleKind = 'bowstring';
      labelZh = '向后拉满弓弦';
      labelEn = 'Draw Bowstring';
      parts = [p('bolt'), p('recoil_spring')];
    } else if (bp.category === 'armor' || bp.archetype === 'aa_autocannon' || bp.archetype === 'howitzer') {
      handleKind = 'breech_block';
      worldDragAxis = AXIS_DOWN;
      labelZh = '操作主炮炮闩';
      labelEn = 'Cycle Main Cannon Breech';
      parts = [p('bolt'), p('bolt_carrier')];
    } else if (bp.archetype === 'rotary_cannon') {
      handleKind = 'rotary_cluster';
      labelZh = '驱动旋转炮管转子';
      labelEn = 'Spin Rotary Barrel Cluster';
      parts = [p('barrel'), p('bolt_carrier')];
    } else if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
      handleKind = 'cylinder';
      worldDragAxis = AXIS_UP;
      labelZh = '拨动转轮弹巢与击锤';
      labelEn = 'Cock Hammer & Index Cylinder';
      parts = [p('hammer'), p('mag_body')];
    } else if (bp.archetype === 'pistol_slide') {
      handleKind = 'slide';
      labelZh = '向后拉动套筒';
      labelEn = 'Rack Pistol Slide';
      parts = [p('receiver'), p('bolt')];
    } else if (bp.kinematicLaw === 'bolt_action') {
      handleKind = 'bolt_handle';
      labelZh = '抬栓并向后拉动枪机';
      labelEn = 'Lift & Pull Bolt Handle';
      parts = [p('bolt_carrier'), p('bolt')];
    } else if (bp.kinematicLaw === 'pump_action') {
      handleKind = 'pump_forend';
      labelZh = '前后抽拉泵动前护木';
      labelEn = 'Rack Pump Forend';
      parts = [p('handguard'), p('bolt_carrier')];
    } else if (bp.kinematicLaw === 'lever_action') {
      handleKind = 'lever';
      worldDragAxis = AXIS_DOWN;
      labelZh = '下压指环杠杆抛壳';
      labelEn = 'Throw Finger Lever';
      parts = [p('grip'), p('bolt_carrier')];
    }

    explicitActionParts[bp.id] = parts;
    dragSpecs[bp.id] = {
      weaponId: asWeaponId(bp.id),
      handleKind,
      worldDragAxis,
      strokeSpanScale:
        bp.category === 'armor' || bp.category === 'ordnance'
          ? 1.4
          : bp.category === 'pistol'
            ? 0.85
            : 1.0,
      springReturnRate:
        bp.kinematicLaw === 'bolt_action' ? 6.5 : bp.category === 'pistol' ? 14.0 : 11.2,
      detentThresholds: [0.18, 0.52, 0.88],
      labelZh,
      labelEn,
    };
  }

  return { explicitActionParts, dragSpecs };
}

// ----------------------------------------------------------------------------
// 13G. Ballistics Round Fit & Muzzle Devices (`src/engine/actors/BallisticsSystem.tsx`)
// ----------------------------------------------------------------------------

export interface CentennialMuzzleJetSpec {
  offsetX: number;
  offsetY: number;
  offsetZ: number;
  dir: [number, number, number];
  length: number;
  radius: number;
  layer: 0 | 1;
  intensity: number;
}

export interface CentennialMuzzleDeviceSpec {
  kind: 'brake' | 'flash_hider' | 'bare';
  forwardDamp: number;
  jets: CentennialMuzzleJetSpec[];
}

export function buildCentennialBallisticsConfigs(): {
  roundFit: Record<CentennialWeaponId, WeaponRoundFitSpec>;
  muzzleDevices: Record<CentennialWeaponId, CentennialMuzzleDeviceSpec>;
} {
  const roundFit = {} as Record<CentennialWeaponId, WeaponRoundFitSpec>;
  const muzzleDevices = {} as Record<
    CentennialWeaponId,
    CentennialMuzzleDeviceSpec
  >;

  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const isArmor = bp.category === 'armor';
    const isOrdnance = bp.category === 'ordnance';
    const isPistol = bp.category === 'pistol';

    roundFit[bp.id] = {
      roundScale: isArmor
        ? 1.0
        : isOrdnance
          ? 0.92
          : isPistol
            ? 0.9
            : bp.scaleProfile === 'heavy_sniper'
              ? 0.72
              : 0.64,
      magLocalShiftX: isArmor ? 0 : isPistol ? -0.4 : -0.36,
      ignitionF: isArmor ? 0.08 : 0.1,
    };

    const isBrake =
      bp.cad.muzzleStyle === 'brake' ||
      bp.cad.muzzleStyle === 'artillery_brake';
    const isFlashHider =
      bp.cad.muzzleStyle === 'flash_hider' ||
      bp.cad.muzzleStyle === 'suppressor';

    const kind: CentennialMuzzleDeviceSpec['kind'] = isBrake
      ? 'brake'
      : isFlashHider
        ? 'flash_hider'
        : 'bare';

    const jets: CentennialMuzzleJetSpec[] = [];
    if (isBrake) {
      const jetLen = isOrdnance ? 46 : bp.scaleProfile === 'heavy_sniper' ? 14 : 6.2;
      const jetRad = isOrdnance ? 7.5 : bp.scaleProfile === 'heavy_sniper' ? 2.2 : 1.05;
      for (const side of [-1, 1] as const) {
        jets.push({
          offsetX: isOrdnance ? -18 : -1.8,
          offsetY: 0,
          offsetZ: side * (isOrdnance ? 9 : 0.9),
          dir: [-0.32, 0, side * 0.95],
          length: jetLen,
          radius: jetRad,
          layer: 0,
          intensity: 0.92,
        });
      }
    }

    muzzleDevices[bp.id] = {
      kind,
      forwardDamp: isBrake ? 0.56 : isFlashHider ? 0.72 : 1.0,
      jets,
    };
  }

  return { roundFit, muzzleDevices };
}

// ----------------------------------------------------------------------------
// 13H. GasFlowVisualizer Heavy Profiles (`src/engine/actors/GasFlowVisualizer.tsx`)
// ----------------------------------------------------------------------------

export interface CentennialTankBoreEvacuatorProfile {
  readonly originX: number;
  readonly originY: number;
  readonly muzzleX: number;
  readonly evacRadiusCm: number;
  readonly peakOpacity: number;
  readonly mainGunPartId: string;
  readonly hasTwinBaffleBrake: boolean;
  readonly rearBaffleX: number;
  readonly frontBaffleX: number;
}

export interface CentennialMuzzleShockwaveProfile {
  readonly startF: number;
  readonly endF: number;
  readonly minRadiusCm: number;
  readonly maxRadiusCm: number;
  readonly peakOpacity: number;
  readonly dustPeakOpacity: number;
  readonly centerOffsetXCm: number;
  readonly isHeavyHangar: boolean;
}

export interface CentennialRotaryBlurProfile {
  readonly cyclicRpm: number;
  readonly barrelCount: number;
  readonly radiusCm: number;
  readonly lengthCm: number;
  readonly centerX: number;
  readonly peakOpacity: number;
}

export function buildCentennialGasFlowConfigs(): {
  tankBoreEvacuators: Partial<
    Record<CentennialWeaponId, CentennialTankBoreEvacuatorProfile>
  >;
  muzzleShockwaves: Partial<
    Record<CentennialWeaponId, CentennialMuzzleShockwaveProfile>
  >;
  rotaryBlurs: Partial<Record<CentennialWeaponId, CentennialRotaryBlurProfile>>;
} {
  const tankBoreEvacuators: Partial<
    Record<CentennialWeaponId, CentennialTankBoreEvacuatorProfile>
  > = {};
  const muzzleShockwaves: Partial<
    Record<CentennialWeaponId, CentennialMuzzleShockwaveProfile>
  > = {};
  const rotaryBlurs: Partial<
    Record<CentennialWeaponId, CentennialRotaryBlurProfile>
  > = {};

  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const layout = computeCentennialPartLayout(bp);

    if (bp.category === 'armor') {
      const isWwii = bp.archetype === 'mbt_wwii';
      const originX = isWwii
        ? round2(layout.muzzlePos[0] - 12)
        : round2(
            layout.chamberGlowPos[0] +
              (layout.muzzlePos[0] - layout.chamberGlowPos[0]) * 0.56
          );
      tankBoreEvacuators[bp.id] = {
        originX,
        originY: layout.boreY,
        muzzleX: layout.muzzlePos[0],
        evacRadiusCm: isWwii ? 9.8 : 14.5,
        peakOpacity: isWwii ? 0.24 : 0.34,
        mainGunPartId: centennialPartId(bp.id, 'barrel'),
        hasTwinBaffleBrake: false,
        rearBaffleX: 0,
        frontBaffleX: 0,
      };
      muzzleShockwaves[bp.id] = {
        startF: 0.22,
        endF: 0.68,
        minRadiusCm: 135,
        maxRadiusCm: 500,
        peakOpacity: 0.6,
        dustPeakOpacity: 0.34,
        centerOffsetXCm: 92,
        isHeavyHangar: true,
      };
    } else if (bp.category === 'ordnance') {
      muzzleShockwaves[bp.id] = {
        startF: 0.2,
        endF: 0.64,
        minRadiusCm: bp.id === 'm777' ? 140 : 48,
        maxRadiusCm: bp.id === 'm777' ? 540 : 195,
        peakOpacity: bp.id === 'm777' ? 0.64 : 0.46,
        dustPeakOpacity: bp.id === 'm777' ? 0.36 : 0.2,
        centerOffsetXCm: bp.id === 'm777' ? 96 : 36,
        isHeavyHangar: true,
      };
      if (bp.archetype === 'rotary_cannon') {
        const barrelPos = layout.assembledPos.barrel;
        rotaryBlurs[bp.id] = {
          cyclicRpm: bp.rateOfFireRpm,
          barrelCount: 6,
          radiusCm: round2(Math.max(5.5, layout.dims.barrelBreechR * 1.6)),
          lengthCm: round2(layout.dims.barrelLen * 0.84),
          centerX: barrelPos[0],
          peakOpacity: 0.42,
        };
      }
    } else if (bp.scaleProfile === 'heavy_sniper') {
      muzzleShockwaves[bp.id] = {
        startF: 0.24,
        endF: 0.58,
        minRadiusCm: 14,
        maxRadiusCm: 64,
        peakOpacity: 0.38,
        dustPeakOpacity: 0.16,
        centerOffsetXCm: 12,
        isHeavyHangar: false,
      };
    }
  }

  return { tankBoreEvacuators, muzzleShockwaves, rotaryBlurs };
}

// ----------------------------------------------------------------------------
// 13I. DK Editorial Data (`src/features/monograph/dkEditorialData.ts` — all 5 maps)
// ----------------------------------------------------------------------------

export interface CentennialBilingualText {
  readonly zh: string;
  readonly en: string;
}

export interface CentennialTimelineSeedNode {
  readonly year: string;
  readonly name: CentennialBilingualText;
  readonly subtitle: CentennialBilingualText;
  readonly eraRelation: DkEraRelation;
}

export interface CentennialLoupeCopy {
  readonly title: CentennialBilingualText;
  readonly caption: CentennialBilingualText;
}

export function buildCentennialDkEditorialData(): {
  evolutionTimelineSeeds: Record<
    CentennialWeaponId,
    readonly [
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
    ]
  >;
  fcgLoupeOverrides: Record<CentennialWeaponId, CentennialLoupeCopy>;
  breechLoupeOverrides: Record<CentennialWeaponId, CentennialLoupeCopy>;
  slideLoupeOverrides: Record<CentennialWeaponId, CentennialLoupeCopy>;
  magLoupeOverrides: Record<CentennialWeaponId, CentennialLoupeCopy>;
} {
  const evolutionTimelineSeeds = {} as Record<
    CentennialWeaponId,
    readonly [
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
      CentennialTimelineSeedNode,
    ]
  >;
  const fcgLoupeOverrides = {} as Record<
    CentennialWeaponId,
    CentennialLoupeCopy
  >;
  const breechLoupeOverrides = {} as Record<
    CentennialWeaponId,
    CentennialLoupeCopy
  >;
  const slideLoupeOverrides = {} as Record<
    CentennialWeaponId,
    CentennialLoupeCopy
  >;
  const magLoupeOverrides = {} as Record<
    CentennialWeaponId,
    CentennialLoupeCopy
  >;

  for (const bp of CENTENNIAL_BLUEPRINTS) {
    const isArchery = bp.category === 'archery';
    const isArmor = bp.category === 'armor';
    const isOrdnance = bp.category === 'ordnance';

    const ancestorYr =
      bp.year < 1850
        ? Math.max(1000, bp.year - 48)
        : Math.max(1850, bp.year - 36);
    const predYr =
      bp.year < 1850
        ? Math.max(ancestorYr, bp.year - 16)
        : Math.max(ancestorYr, bp.year - 12);
    const rivalYr =
      bp.year < 1850
        ? bp.year + 4
        : Math.max(bp.year, Math.min(2025, bp.year + 4));
    const succYr =
      bp.year < 1850
        ? bp.year + 25
        : Math.max(rivalYr, Math.min(2026, bp.year + 18));

    evolutionTimelineSeeds[bp.id] = [
      {
        year: String(ancestorYr),
        name: { zh: '早期机构先驱', en: 'Early Mechanical Pioneer' },
        subtitle: {
          zh: '奠定同流派基础结构与弹道范式',
          en: 'Established foundational mechanical and ballistic architecture',
        },
        eraRelation: 'ancestor',
      },
      {
        year: String(predYr),
        name: { zh: '前代制式原型', en: 'Direct Predecessor' },
        subtitle: {
          zh: `${bp.originCountryZh}前代同系设计探索`,
          en: `Prior ${bp.originCountryEn} engineering iteration`,
        },
        eraRelation: 'predecessor',
      },
      {
        year: String(bp.year),
        name: { zh: bp.shortLabel, en: bp.shortLabel },
        subtitle: {
          zh: bp.weaponTypeZh,
          en: bp.weaponTypeEn,
        },
        eraRelation: 'current',
      },
      {
        year: String(rivalYr),
        name: { zh: '同期跨阵营劲敌', en: 'Contemporary Peer Rival' },
        subtitle: {
          zh: '同世代不同机械流派方案对照',
          en: 'Cross-doctrine contemporary mechanical benchmark',
        },
        eraRelation: 'rival',
      },
      {
        year: String(succYr),
        name: { zh: '现代模块化传承', en: 'Modern Modular Legacy' },
        subtitle: {
          zh: '人机、光学与材料学当代演进',
          en: 'Contemporary ergonomics, optics, and metallurgy evolution',
        },
        eraRelation: 'successor',
      },
    ];

    if (isArchery) {
      fcgLoupeOverrides[bp.id] = {
        title: {
          zh: `${bp.shortLabel} 撒放与防空放机构`,
          en: `${bp.shortLabel} Release & Safety Group`,
        },
        caption: {
          zh: `精密协同弓弦锁定与撒放释放，保持 ${bp.rateOfFireLabelZh} 的稳定精准射速。`,
          en: `Coordinates bowstring retention and clean release for steady ${bp.rateOfFireLabelEn} accuracy.`,
        },
      };

      breechLoupeOverrides[bp.id] = {
        title: {
          zh: `${bp.shortLabel} 弓片储能与力矩核心`,
          en: `${bp.shortLabel} Limb Energy & Torque Core`,
        },
        caption: {
          zh: `${bp.actionMechanismZh}，满弓单箭输出 ${bp.muzzleEnergyJ} J 高效弹性动能。`,
          en: `${bp.actionMechanismEn}, delivering ${bp.muzzleEnergyJ} J of stored elastic arrow energy.`,
        },
      };

      slideLoupeOverrides[bp.id] = {
        title: {
          zh: `${bp.shortLabel} 弓把框架与拉距箭道`,
          en: `${bp.shortLabel} Riser & Flight Rail`,
        },
        caption: {
          zh: `${bp.barrelLengthMm} mm 拉距行程将 ${bp.caliberLabel} 平顺加速至 ${bp.muzzleVelocityMs} m/s。`,
          en: `${bp.barrelLengthMm} mm draw stroke accelerates ${bp.caliberLabel} smoothly to ${bp.muzzleVelocityMs} m/s.`,
        },
      };

      magLoupeOverrides[bp.id] = {
        title: {
          zh: `${bp.shortLabel} ${bp.magCapacity} 箭快拆箭壶与箭台`,
          en: `${bp.shortLabel} ${bp.magCapacity}-Arrow Quiver & Rest`,
        },
        caption: {
          zh: `稳固收纳并快速取用 ${bp.caliberLabel}，保持弓身重心平衡与发射一致性。`,
          en: `Secures ${bp.magCapacity} ${bp.caliberLabel} shafts cleanly for balanced carry and quick follow-up nocking.`,
        },
      };
      continue;
    }

    fcgLoupeOverrides[bp.id] = {
      title: {
        zh: `${bp.shortLabel} 火控与安全机构`,
        en: `${bp.shortLabel} Fire-Control Group`,
      },
      caption: {
        zh: `精准协同扳机阻铁、击发储能与机械安全联锁，保障 ${bp.rateOfFireLabelZh} 稳定节奏。`,
        en: `Coordinates trigger sear, ignition spring, and safety interlock for steady ${bp.rateOfFireLabelEn} cycling.`,
      },
    };

    breechLoupeOverrides[bp.id] = {
      title: {
        zh: `${bp.shortLabel} 核心闭锁与膛压区`,
        en: `${bp.shortLabel} Breech & Lockup Zone`,
      },
      caption: {
        zh: `${bp.actionMechanismZh}，安全承受 ${bp.peakPressureMpa} MPa 峰值膛压。`,
        en: `${bp.actionMechanismEn}, sealing ${bp.peakPressureMpa} MPa peak chamber pressure.`,
      },
    };

    slideLoupeOverrides[bp.id] = {
      title: {
        zh: `${bp.shortLabel} 身管与复进总成`,
        en: `${bp.shortLabel} Barrel & Reciprocating Group`,
      },
      caption: {
        zh: `${bp.barrelLengthMm} mm 身管将 ${bp.caliberLabel} 加速至 ${bp.muzzleVelocityMs} m/s。`,
        en: `${bp.barrelLengthMm} mm barrel accelerates ${bp.caliberLabel} cleanly to ${bp.muzzleVelocityMs} m/s.`,
      },
    };

    magLoupeOverrides[bp.id] = {
      title: {
        zh: isArmor
          ? `${bp.shortLabel} ${bp.magCapacity} 发主炮供弹系统`
          : isOrdnance
            ? `${bp.shortLabel} ${bp.magCapacity} 发重炮供弹机构`
            : `${bp.shortLabel} ${bp.magCapacity} 发供弹系统`,
        en: isArmor
          ? `${bp.shortLabel} ${bp.magCapacity}-Rd Main Gun Stowage`
          : isOrdnance
            ? `${bp.shortLabel} ${bp.magCapacity}-Rd Ordnance Feed`
            : `${bp.shortLabel} ${bp.magCapacity}-Rd Feed System`,
      },
      caption: {
        zh: `稳定托举并步进输送 ${bp.caliberLabel} 弹药，确保持续射击进弹顺畅。`,
        en: `Aligns and indexes ${bp.magCapacity} rounds of ${bp.caliberLabel} reliably into the chamber.`,
      },
    };
  }

  return {
    evolutionTimelineSeeds,
    fcgLoupeOverrides,
    breechLoupeOverrides,
    slideLoupeOverrides,
    magLoupeOverrides,
  };
}

// ----------------------------------------------------------------------------
// 13J. Tank Crew Specs for the 4 New 1:1 MBTs (`src/engine/tank/tankCrewStore.ts`)
// ----------------------------------------------------------------------------

export const CENTENNIAL_TANK_IDS = [
  't90m',
  'challenger2',
  'merkava4',
  't34_85',
] as const;

export type CentennialTankWeaponId = (typeof CENTENNIAL_TANK_IDS)[number];

export type CentennialTankNationCode = 'RU' | 'UK' | 'IL' | 'SU-1944';

export interface CentennialTankCrewKinematicsSpec {
  readonly weaponId: CentennialTankWeaponId;
  readonly turretRingPivot: readonly [number, number, number];
  readonly trunnionPivot: readonly [number, number, number];
  readonly gunnerEyeOffset: readonly [number, number, number];
  readonly gunnerLookOffsetY: number;
  readonly elevLimitsDeg: readonly [number, number];
  readonly defaultProjectileSpeedMps: number;
  readonly sightNameZh: string;
  readonly sightNameEn: string;
  readonly turretPartIds: ReadonlySet<string>;
  readonly gunPartIds: ReadonlySet<string>;
}

export interface CentennialTankGunnerOpticProfile {
  readonly weaponId: CentennialTankWeaponId;
  readonly reticleStyle: TankReticleStyle;
  readonly nationCode: CentennialTankNationCode;
  readonly designationZh: string;
  readonly designationEn: string;
  readonly ammoTag: string;
  readonly readyLabelZh: string;
  readonly readyLabelEn: string;
  readonly magnificationLabel: string;
  readonly supportedOpticModes: readonly TankOpticMode[];
  readonly defaultOpticMode: TankOpticMode;
  readonly hasLaserRangefinder: boolean;
  readonly hasCantIndicator: boolean;
  readonly rangeDrumMaxM: number;
  readonly museumStudyThermalNoteZh: string | null;
  readonly museumStudyThermalNoteEn: string | null;
}

const MODERN_OPTIC_MODES: readonly TankOpticMode[] = [
  'daylight',
  'flir_whot',
  'flir_bhot',
  'green_nvg',
];
const WWII_OPTIC_MODES: readonly TankOpticMode[] = ['daylight', 'flir_whot'];

export function buildCentennialTankCrewSpecs(): {
  kinematics: Record<CentennialTankWeaponId, CentennialTankCrewKinematicsSpec>;
  gunnerOptics: Record<CentennialTankWeaponId, CentennialTankGunnerOpticProfile>;
} {
  const tankBps = CENTENNIAL_BLUEPRINTS.filter((bp) => bp.category === 'armor');
  const kinematics = {} as Record<
    CentennialTankWeaponId,
    CentennialTankCrewKinematicsSpec
  >;
  const gunnerOptics = {} as Record<
    CentennialTankWeaponId,
    CentennialTankGunnerOpticProfile
  >;

  const metaByTank: Record<
    CentennialTankWeaponId,
    {
      nationCode: CentennialTankNationCode;
      reticleStyle: TankReticleStyle;
      elevLimitsDeg: readonly [number, number];
      sightNameZh: string;
      sightNameEn: string;
      designationZh: string;
      designationEn: string;
      ammoTag: string;
      magnificationLabel: string;
      isWwii: boolean;
    }
  > = {
    t90m: {
      nationCode: 'RU',
      reticleStyle: 'pla_ztz99a',
      elevLimitsDeg: [-6, 14],
      sightNameZh: '松树-U 多通道热成像火控瞄具',
      sightNameEn: 'Sosna-U Multi-Channel Thermal FCS',
      designationZh: 'T-90M 炮长松树-U 火控视镜',
      designationEn: 'T-90M Sosna-U Gunner Sight',
      ammoTag: '3BM60 SVINETS-2',
      magnificationLabel: '4× / 12×',
      isWwii: false,
    },
    challenger2: {
      nationCode: 'UK',
      reticleStyle: 'de_emes15',
      elevLimitsDeg: [-10, 20],
      sightNameZh: 'TOGS II 热成像与巴尔激光测距瞄具',
      sightNameEn: 'TOGS II Thermal & Barr-Stroud Laser Sight',
      designationZh: '挑战者 2 炮长 TOGS II 火控视镜',
      designationEn: 'Challenger 2 TOGS II Gunner Sight',
      ammoTag: 'L27A1 CHARM 3',
      magnificationLabel: '4× / 10×',
      isWwii: false,
    },
    merkava4: {
      nationCode: 'IL',
      reticleStyle: 'us_m1a2_gps',
      elevLimitsDeg: [-8, 20],
      sightNameZh: '骑士 Mk 4 自动跟踪双稳火控瞄具',
      sightNameEn: 'Knight Mk 4 Auto-Tracker Stabilized FCS',
      designationZh: '梅卡瓦 Mk 4 炮长骑士火控视镜',
      designationEn: 'Merkava Mk 4 Knight Gunner Sight',
      ammoTag: 'M338 APFSDS-T',
      magnificationLabel: '4× / 12×',
      isWwii: false,
    },
    t34_85: {
      nationCode: 'SU-1944',
      reticleStyle: 'ww2_tzf9b',
      elevLimitsDeg: [-5, 22],
      sightNameZh: 'TSh-16 铰接望远光学瞄准镜',
      sightNameEn: 'TSh-16 Articulated Optical Telescope',
      designationZh: 'T-34-85 炮长 TSh-16 光学视镜',
      designationEn: 'T-34-85 TSh-16 Gunner Sight',
      ammoTag: 'BR-365A APHEBC',
      magnificationLabel: '4×',
      isWwii: true,
    },
  };

  for (const bp of tankBps) {
    const id = bp.id as CentennialTankWeaponId;
    const m = metaByTank[id];
    const layout = computeCentennialPartLayout(bp);
    const p = (slot: Parameters<typeof centennialPartId>[1]) =>
      centennialPartId(bp.id, slot);
    const turretPos = layout.assembledPos.receiver;
    const gunPos = layout.assembledPos.bolt_carrier;

    kinematics[id] = {
      weaponId: id,
      turretRingPivot: [turretPos[0], round2(turretPos[1] - 34), 0],
      trunnionPivot: [round2(gunPos[0] + 42), layout.boreY, 0],
      gunnerEyeOffset: [58, 34, 48],
      gunnerLookOffsetY: 0,
      elevLimitsDeg: m.elevLimitsDeg,
      defaultProjectileSpeedMps: bp.muzzleVelocityMs,
      sightNameZh: m.sightNameZh,
      sightNameEn: m.sightNameEn,
      turretPartIds: new Set<string>([
        p('receiver'),
        p('barrel'),
        p('muzzle'),
        p('bolt_carrier'),
        p('bolt'),
        p('recoil_spring'),
        p('optic'),
        p('trigger'),
        p('hammer'),
        p('hammer_spring'),
        p('selector'),
      ]),
      gunPartIds: new Set<string>([
        p('barrel'),
        p('muzzle'),
        p('bolt_carrier'),
        p('bolt'),
        p('recoil_spring'),
      ]),
    };

    gunnerOptics[id] = {
      weaponId: id,
      reticleStyle: m.reticleStyle,
      nationCode: m.nationCode,
      designationZh: m.designationZh,
      designationEn: m.designationEn,
      ammoTag: m.ammoTag,
      readyLabelZh: '主炮装填就绪',
      readyLabelEn: 'MAIN GUN READY',
      magnificationLabel: m.magnificationLabel,
      supportedOpticModes: m.isWwii ? WWII_OPTIC_MODES : MODERN_OPTIC_MODES,
      defaultOpticMode: m.isWwii ? 'daylight' : 'flir_whot',
      hasLaserRangefinder: !m.isWwii,
      hasCantIndicator: !m.isWwii,
      rangeDrumMaxM: m.isWwii ? 3200 : 4000,
      museumStudyThermalNoteZh: m.isWwii
        ? '历史注记：1944 年原车仅配白光望远镜，博物馆热成像供现代对比研习。'
        : null,
      museumStudyThermalNoteEn: m.isWwii
        ? 'Historical note: 1944 vehicles carried daylight optics only; thermal mode is provided for modern museum comparison.'
        : null,
    };
  }

  return { kinematics, gunnerOptics };
}

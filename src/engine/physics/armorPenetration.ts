export type PenetratorId =
  | '125mm_apfsds'
  | '120mm_apfsds'
  | '88mm_pzgr39'
  | '50_bmg';

export type ArmorTargetTankId = 'ztz99a' | 'm1a2' | 'leopard2a7' | 'tiger1';

export type ArmorZoneId =
  | 'turret_front'
  | 'upper_glacis'
  | 'lower_glacis'
  | 'hull_side';

export type PenetrationOutcome =
  | 'perforation'
  | 'partial_penetration'
  | 'ricochet';

export interface PenetratorSpec {
  id: PenetratorId;
  code: string;
  nameZh: string;
  nameEn: string;
  muzzleVelocityMps: number;
  penetratorMassKg: number;
  coreDiameterMm: number;
  coreLengthMm: number;
  refPenetration0mRhaeMm: number;
  dragDecayPerKm: number;
  velocityExponent: number;
  ricochetAngleDeg: number;
  isSubCaliberRod: boolean;
}

export interface ArmorMaterialLayer {
  nameZh: string;
  nameEn: string;
  physicalMm: number;
  rhaFactor: number;
  colorHex: string;
  isEra?: boolean;
  eraKeDefeatFactor?: number;
}

export interface ArmorZoneSpec {
  id: ArmorZoneId;
  labelZh: string;
  labelEn: string;
  naturalSlopeDeg: number;
  hasEra: boolean;
  layers: readonly ArmorMaterialLayer[];
}

export interface ArmorTargetSpec {
  id: ArmorTargetTankId;
  nameZh: string;
  nameEn: string;
  eraSystemZh: string;
  eraSystemEn: string;
  zones: Readonly<Record<ArmorZoneId, ArmorZoneSpec>>;
}

export interface LayerDefeatResult {
  nameZh: string;
  nameEn: string;
  physicalMm: number;
  effectiveLosMm: number;
  rhaEquivalentMm: number;
  colorHex: string;
  isEra: boolean;
  defeated: boolean;
}

export interface RangeCurveSample {
  rangeM: number;
  impactVelocityMps: number;
  penetrationDepthRhaeMm: number;
}

export interface ArmorPenetrationInput {
  projectileId: PenetratorId;
  targetTankId: ArmorTargetTankId;
  zoneId: ArmorZoneId;
  rangeM: number;
  obliquityDeg: number;
  eraEnabled: boolean;
}

export interface ArmorPenetrationResult {
  projectile: PenetratorSpec;
  target: ArmorTargetSpec;
  zone: ArmorZoneSpec;
  rangeM: number;
  obliquityDeg: number;
  effectiveImpactAngleDeg: number;
  eraActive: boolean;
  impactVelocityMps: number;
  impactEnergyMJ: number;
  effectiveLosThicknessMm: number;
  effectiveRhaeMm: number;
  penetrationDepthRhaeMm: number;
  overmatchMarginMm: number;
  ricochetAngleDeg: number;
  outcome: PenetrationOutcome;
  layerBreakdown: readonly LayerDefeatResult[];
  rangeCurve: readonly RangeCurveSample[];
}

export const PENETRATOR_SPECS: Readonly<Record<PenetratorId, PenetratorSpec>> =
  {
    '125mm_apfsds': {
      id: '125mm_apfsds',
      code: '125mm DTC10-125',
      nameZh: '125mm DTC10-125 三期钨合金长杆穿甲弹',
      nameEn: '125mm DTC10-125 Tungsten Long-Rod APFSDS',
      muzzleVelocityMps: 1780,
      penetratorMassKg: 4.8,
      coreDiameterMm: 22,
      coreLengthMm: 640,
      refPenetration0mRhaeMm: 790,
      dragDecayPerKm: 0.044,
      velocityExponent: 1.48,
      ricochetAngleDeg: 78,
      isSubCaliberRod: true,
    },
    '120mm_apfsds': {
      id: '120mm_apfsds',
      code: '120mm M829A4 / DM63',
      nameZh: '120mm M829A4 / DM63 北约贫铀/钨心穿甲弹',
      nameEn: '120mm NATO M829A4 / DM63 Long-Rod APFSDS',
      muzzleVelocityMps: 1710,
      penetratorMassKg: 4.9,
      coreDiameterMm: 22.5,
      coreLengthMm: 615,
      refPenetration0mRhaeMm: 755,
      dragDecayPerKm: 0.046,
      velocityExponent: 1.46,
      ricochetAngleDeg: 78,
      isSubCaliberRod: true,
    },
    '88mm_pzgr39': {
      id: '88mm_pzgr39',
      code: '88mm KwK 36 PzGr.39',
      nameZh: '88×571mmR PzGr.39 二战风帽被帽穿甲弹',
      nameEn: '88×571mmR PzGr.39 APCBC Heavy Armor-Piercing',
      muzzleVelocityMps: 773,
      penetratorMassKg: 10.2,
      coreDiameterMm: 88,
      coreLengthMm: 310,
      refPenetration0mRhaeMm: 162,
      dragDecayPerKm: 0.145,
      velocityExponent: 1.42,
      ricochetAngleDeg: 68,
      isSubCaliberRod: false,
    },
    '50_bmg': {
      id: '50_bmg',
      code: '.50 BMG M2 AP',
      nameZh: '12.7×99mm (.50 BMG) M2 硬化钢芯穿甲弹',
      nameEn: '12.7×99mm (.50 BMG) M2 Hardened Steel Core AP',
      muzzleVelocityMps: 853,
      penetratorMassKg: 0.0458,
      coreDiameterMm: 12.7,
      coreLengthMm: 58.6,
      refPenetration0mRhaeMm: 28,
      dragDecayPerKm: 0.34,
      velocityExponent: 1.38,
      ricochetAngleDeg: 65,
      isSubCaliberRod: false,
    },
  };

export const ARMOR_TARGET_SPECS: Readonly<
  Record<ArmorTargetTankId, ArmorTargetSpec>
> = {
  ztz99a: {
    id: 'ztz99a',
    nameZh: 'ZTZ-99A 主战坦克',
    nameEn: 'PLA ZTZ-99A Main Battle Tank',
    eraSystemZh: 'FY-4 双防重型爆炸反应装甲',
    eraSystemEn: 'FY-4 Dual-Purpose Heavy ERA',
    zones: {
      turret_front: {
        id: 'turret_front',
        labelZh: '炮塔正面主装甲',
        labelEn: 'Turret Cheek Frontal Array',
        naturalSlopeDeg: 42,
        hasEra: true,
        layers: [
          {
            nameZh: 'FY-4 楔形爆反面板',
            nameEn: 'FY-4 Wedge ERA Module',
            physicalMm: 95,
            rhaFactor: 1.35,
            colorHex: '#eab308',
            isEra: true,
            eraKeDefeatFactor: 0.2,
          },
          {
            nameZh: '高强度轧制均质钢外板',
            nameEn: 'High-Hardness RHA Outer Plate',
            physicalMm: 110,
            rhaFactor: 1.05,
            colorHex: '#64748b',
          },
          {
            nameZh: '非金属复合陶瓷/NERA 夹层',
            nameEn: 'Composite Ceramic / NERA Cavity',
            physicalMm: 360,
            rhaFactor: 1.18,
            colorHex: '#0ea5e9',
          },
          {
            nameZh: '全焊接炮塔内背板 RHA',
            nameEn: 'Welded Turret Inner RHA Backing',
            physicalMm: 90,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
      upper_glacis: {
        id: 'upper_glacis',
        labelZh: '车体大倾角首上',
        labelEn: 'Upper Glacis Composite Slope',
        naturalSlopeDeg: 66,
        hasEra: true,
        layers: [
          {
            nameZh: '首上 FY-4 爆反阵列',
            nameEn: 'Glacis FY-4 ERA Bricks',
            physicalMm: 75,
            rhaFactor: 1.3,
            colorHex: '#eab308',
            isEra: true,
            eraKeDefeatFactor: 0.16,
          },
          {
            nameZh: '首上倾斜陶瓷复合包',
            nameEn: 'Sloped Glacis Composite Core',
            physicalMm: 220,
            rhaFactor: 1.12,
            colorHex: '#0ea5e9',
          },
          {
            nameZh: '车体均质钢背甲',
            nameEn: 'Hull Structural RHA Backing',
            physicalMm: 75,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
      lower_glacis: {
        id: 'lower_glacis',
        labelZh: '车体首下装甲',
        labelEn: 'Lower Glacis Plate',
        naturalSlopeDeg: 48,
        hasEra: false,
        layers: [
          {
            nameZh: '高硬钢首下主甲',
            nameEn: 'Lower Hull HHA Steel',
            physicalMm: 165,
            rhaFactor: 1.04,
            colorHex: '#64748b',
          },
        ],
      },
      hull_side: {
        id: 'hull_side',
        labelZh: '车体侧裙与侧甲',
        labelEn: 'Hull Side Skirt & Armor',
        naturalSlopeDeg: 0,
        hasEra: true,
        layers: [
          {
            nameZh: '侧裙 FY-4 爆反挂块',
            nameEn: 'Side Skirt ERA Pack',
            physicalMm: 50,
            rhaFactor: 1.1,
            colorHex: '#eab308',
            isEra: true,
            eraKeDefeatFactor: 0.1,
          },
          {
            nameZh: '侧壁轧制钢板',
            nameEn: 'Side Hull RHA Wall',
            physicalMm: 85,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
    },
  },
  m1a2: {
    id: 'm1a2',
    nameZh: 'M1A2 SEP v3 艾布拉姆斯',
    nameEn: 'U.S. M1A2 SEP v3 Abrams',
    eraSystemZh: 'NGAP 下一代贫铀复合装甲',
    eraSystemEn: 'NGAP Heavy Depleted-Uranium Composite',
    zones: {
      turret_front: {
        id: 'turret_front',
        labelZh: '炮塔正面主装甲',
        labelEn: 'Turret Cheek DU Armor',
        naturalSlopeDeg: 38,
        hasEra: false,
        layers: [
          {
            nameZh: '外层高硬钢包壳',
            nameEn: 'Outer HHS Encapsulation',
            physicalMm: 115,
            rhaFactor: 1.06,
            colorHex: '#64748b',
          },
          {
            nameZh: 'NGAP 第三代贫铀网格夹层',
            nameEn: 'NGAP Heavy Depleted-Uranium Mesh',
            physicalMm: 390,
            rhaFactor: 1.44,
            colorHex: '#10b981',
          },
          {
            nameZh: '内层 RHA 背板',
            nameEn: 'Inner Turret RHA Backing',
            physicalMm: 105,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
      upper_glacis: {
        id: 'upper_glacis',
        labelZh: '大倾角首上滑弹板',
        labelEn: 'High-Obliquity Upper Glacis',
        naturalSlopeDeg: 70,
        hasEra: false,
        layers: [
          {
            nameZh: '38–51mm 高硬钢首上滑弹板',
            nameEn: 'High-Hardness Ricochet Glacis Plate',
            physicalMm: 95,
            rhaFactor: 1.08,
            colorHex: '#64748b',
          },
        ],
      },
      lower_glacis: {
        id: 'lower_glacis',
        labelZh: '车体首下复合模块',
        labelEn: 'Lower Glacis Composite',
        naturalSlopeDeg: 52,
        hasEra: false,
        layers: [
          {
            nameZh: '贫铀重甲首下复合包',
            nameEn: 'Lower Hull Heavy Composite',
            physicalMm: 270,
            rhaFactor: 1.24,
            colorHex: '#10b981',
          },
        ],
      },
      hull_side: {
        id: 'hull_side',
        labelZh: 'TUSK 侧裙与侧甲',
        labelEn: 'ARAT-II / Heavy Side Skirt',
        naturalSlopeDeg: 0,
        hasEra: true,
        layers: [
          {
            nameZh: 'ARAT-II 侧裙爆反瓦',
            nameEn: 'ARAT-II Side ERA Tile',
            physicalMm: 55,
            rhaFactor: 1.05,
            colorHex: '#eab308',
            isEra: true,
            eraKeDefeatFactor: 0.1,
          },
          {
            nameZh: '车体侧钢与裙板',
            nameEn: 'Ballistic Side Plate',
            physicalMm: 75,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
    },
  },
  leopard2a7: {
    id: 'leopard2a7',
    nameZh: '豹 2A7V 主战坦克',
    nameEn: 'KMW Leopard 2A7V',
    eraSystemZh: '墨西哥帽型箭簇中空间隙复合甲',
    eraSystemEn: 'MEXAS / Arrowhead Hollow Wedge Add-On',
    zones: {
      turret_front: {
        id: 'turret_front',
        labelZh: '箭簇楔形炮塔正面',
        labelEn: 'Arrowhead Wedge Turret Front',
        naturalSlopeDeg: 45,
        hasEra: false,
        layers: [
          {
            nameZh: '锐角箭簇中空预偏转楔块',
            nameEn: 'Hollow Arrowhead Pre-Deflection Wedge',
            physicalMm: 260,
            rhaFactor: 1.16,
            colorHex: '#38bdf8',
          },
          {
            nameZh: '多层 NERA/陶瓷主炮塔箱',
            nameEn: 'Multi-Layer NERA / Ceramic Box',
            physicalMm: 310,
            rhaFactor: 1.32,
            colorHex: '#0ea5e9',
          },
          {
            nameZh: '铸造/焊接内侧钢背甲',
            nameEn: 'Inner Turret Steel Wall',
            physicalMm: 100,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
      upper_glacis: {
        id: 'upper_glacis',
        labelZh: '附加重型首上复合甲',
        labelEn: 'Up-Armored Upper Glacis Module',
        naturalSlopeDeg: 64,
        hasEra: false,
        layers: [
          {
            nameZh: '2A7V 附加复合首上包',
            nameEn: '2A7V Add-On Composite Glacis',
            physicalMm: 170,
            rhaFactor: 1.28,
            colorHex: '#38bdf8',
          },
          {
            nameZh: '车体均质钢基体',
            nameEn: 'Base Hull Steel',
            physicalMm: 95,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
      lower_glacis: {
        id: 'lower_glacis',
        labelZh: '车体首下装甲',
        labelEn: 'Lower Glacis Armor',
        naturalSlopeDeg: 50,
        hasEra: false,
        layers: [
          {
            nameZh: '首下高硬复合钢板',
            nameEn: 'Lower Glacis Composite Plate',
            physicalMm: 210,
            rhaFactor: 1.15,
            colorHex: '#64748b',
          },
        ],
      },
      hull_side: {
        id: 'hull_side',
        labelZh: '重型复合侧裙',
        labelEn: 'Heavy Composite Side Skirt',
        naturalSlopeDeg: 0,
        hasEra: false,
        layers: [
          {
            nameZh: '外挂复合裙板',
            nameEn: 'Add-On Composite Skirt',
            physicalMm: 75,
            rhaFactor: 1.2,
            colorHex: '#38bdf8',
          },
          {
            nameZh: '侧体均质钢',
            nameEn: 'Side Hull RHA',
            physicalMm: 70,
            rhaFactor: 1.0,
            colorHex: '#475569',
          },
        ],
      },
    },
  },
  tiger1: {
    id: 'tiger1',
    nameZh: '虎式 I 131 号重型坦克',
    nameEn: 'WWII Tiger I #131 Heavy Tank',
    eraSystemZh: '二战镍铬钼轧制均质装甲 (RHA)',
    eraSystemEn: 'WWII Rolled Homogeneous Nickel-Steel (RHA)',
    zones: {
      turret_front: {
        id: 'turret_front',
        labelZh: '马蹄形炮盾与正额 (120mm)',
        labelEn: 'Mantlet & Turret Face (100–120mm)',
        naturalSlopeDeg: 10,
        hasEra: false,
        layers: [
          {
            nameZh: '克虏伯整块铸/轧炮盾与正额 RHA',
            nameEn: 'Monolithic Krupp RHA Gun Mantlet & Face',
            physicalMm: 120,
            rhaFactor: 1.0,
            colorHex: '#94a3b8',
          },
        ],
      },
      upper_glacis: {
        id: 'upper_glacis',
        labelZh: '垂直首上车体正板 (100mm)',
        labelEn: 'Vertical Nose Driver Plate (100mm)',
        naturalSlopeDeg: 9,
        hasEra: false,
        layers: [
          {
            nameZh: '100mm 垂直均质轧制钢板 (100 mm)',
            nameEn: '100mm Vertical Rolled Homogeneous Steel',
            physicalMm: 100,
            rhaFactor: 1.0,
            colorHex: '#94a3b8',
          },
        ],
      },
      lower_glacis: {
        id: 'lower_glacis',
        labelZh: '首下倾斜前板 (100mm)',
        labelEn: 'Lower Nose Plate (100mm)',
        naturalSlopeDeg: 24,
        hasEra: false,
        layers: [
          {
            nameZh: '100mm 首下均质钢',
            nameEn: '100mm Lower RHA Steel',
            physicalMm: 100,
            rhaFactor: 1.0,
            colorHex: '#64748b',
          },
        ],
      },
      hull_side: {
        id: 'hull_side',
        labelZh: '车体上/下侧甲 (82mm)',
        labelEn: 'Hull Side Wall (82mm)',
        naturalSlopeDeg: 0,
        hasEra: false,
        layers: [
          {
            nameZh: '82mm 垂直侧甲 RHA',
            nameEn: '82mm Monolithic Side RHA',
            physicalMm: 82,
            rhaFactor: 1.0,
            colorHex: '#64748b',
          },
        ],
      },
    },
  },
};

export const PENETRATOR_IDS: readonly PenetratorId[] = [
  '125mm_apfsds',
  '120mm_apfsds',
  '88mm_pzgr39',
  '50_bmg',
];

export const ARMOR_TARGET_TANK_IDS: readonly ArmorTargetTankId[] = [
  'ztz99a',
  'm1a2',
  'leopard2a7',
  'tiger1',
];

export const ARMOR_ZONE_IDS: readonly ArmorZoneId[] = [
  'turret_front',
  'upper_glacis',
  'lower_glacis',
  'hull_side',
];

function computeVelocityAndPenAtRange(
  proj: PenetratorSpec,
  rangeM: number,
  effectiveAngleDeg: number,
  eraDefeatScale: number
): { velocityMps: number; penetrationMm: number } {
  const safeRangeKm = Math.max(0, rangeM) / 1000;
  const velocityMps =
    proj.muzzleVelocityMps * Math.exp(-proj.dragDecayPerKm * safeRangeKm);
  const velRatio = velocityMps / proj.muzzleVelocityMps;
  const rad = (Math.min(82, effectiveAngleDeg) * Math.PI) / 180;
  const angleEfficiency = proj.isSubCaliberRod
    ? Math.pow(Math.cos(rad), 0.14)
    : Math.pow(Math.cos(rad), 0.36);
  const penetrationMm =
    proj.refPenetration0mRhaeMm *
    Math.pow(velRatio, proj.velocityExponent) *
    angleEfficiency *
    eraDefeatScale;
  return { velocityMps, penetrationMm };
}

/**
 * Pure TypeScript Lanz-Odermatt / De Marre Terminal Armor Penetration Solver.
 */
export function evaluateArmorPenetration(
  input: ArmorPenetrationInput
): ArmorPenetrationResult {
  const proj = PENETRATOR_SPECS[input.projectileId];
  const target = ARMOR_TARGET_SPECS[input.targetTankId];
  const zone = target.zones[input.zoneId];

  const rangeM = Math.max(100, Math.min(4000, input.rangeM));
  const obliquityDeg = Math.max(0, Math.min(75, input.obliquityDeg));
  const eraActive = input.eraEnabled && zone.hasEra;

  // Combine armor natural slope + horizontal/user impact obliquity
  const baseRad = (zone.naturalSlopeDeg * Math.PI) / 180;
  const yawRad = (obliquityDeg * Math.PI) / 180;
  const cosCombined = Math.max(0.08, Math.cos(baseRad) * Math.cos(yawRad));
  const effectiveImpactAngleDeg = (Math.acos(cosCombined) * 180) / Math.PI;
  const losMult = 1 / cosCombined;

  let eraKeDefeatSum = 0;
  const activeLayers = zone.layers.filter((l) => !l.isEra || eraActive);
  let effectiveLosThicknessMm = 0;
  let effectiveRhaeMm = 0;

  for (const layer of activeLayers) {
    const losMm = layer.physicalMm * losMult;
    const rhaeMm = losMm * layer.rhaFactor;
    effectiveLosThicknessMm += losMm;
    effectiveRhaeMm += rhaeMm;
    if (layer.isEra && eraActive && layer.eraKeDefeatFactor) {
      eraKeDefeatSum += layer.eraKeDefeatFactor;
    }
  }

  const eraDefeatScale = Math.max(0.55, 1 - eraKeDefeatSum);
  const { velocityMps: impactVelocityMps, penetrationMm: rawPenMm } =
    computeVelocityAndPenAtRange(
      proj,
      rangeM,
      effectiveImpactAngleDeg,
      eraDefeatScale
    );

  const ricochetTriggered = obliquityDeg >= proj.ricochetAngleDeg || effectiveImpactAngleDeg >= proj.ricochetAngleDeg;
  const penetrationDepthRhaeMm = ricochetTriggered ? rawPenMm * 0.12 : rawPenMm;
  const overmatchMarginMm = penetrationDepthRhaeMm - effectiveRhaeMm;

  let outcome: PenetrationOutcome = 'partial_penetration';
  if (ricochetTriggered) {
    outcome = 'ricochet';
  } else if (overmatchMarginMm >= 0) {
    outcome = 'perforation';
  }

  // Build per-layer cumulative defeat diagnostics
  let remPenMm = penetrationDepthRhaeMm;
  const layerBreakdown: LayerDefeatResult[] = activeLayers.map((layer) => {
    const effectiveLosMm = layer.physicalMm * losMult;
    const rhaEquivalentMm = effectiveLosMm * layer.rhaFactor;
    const defeated = !ricochetTriggered && remPenMm >= rhaEquivalentMm;
    remPenMm = Math.max(0, remPenMm - rhaEquivalentMm);
    return {
      nameZh: layer.nameZh,
      nameEn: layer.nameEn,
      physicalMm: layer.physicalMm,
      effectiveLosMm,
      rhaEquivalentMm,
      colorHex: layer.colorHex,
      isEra: !!layer.isEra,
      defeated,
    };
  });

  const rangeCurve: RangeCurveSample[] = [];
  for (let r = 500; r <= 3500; r += 250) {
    const pt = computeVelocityAndPenAtRange(
      proj,
      r,
      effectiveImpactAngleDeg,
      eraDefeatScale
    );
    rangeCurve.push({
      rangeM: r,
      impactVelocityMps: pt.velocityMps,
      penetrationDepthRhaeMm: ricochetTriggered
        ? pt.penetrationMm * 0.12
        : pt.penetrationMm,
    });
  }

  const impactEnergyMJ =
    (0.5 * proj.penetratorMassKg * impactVelocityMps * impactVelocityMps) /
    1_000_000;

  return {
    projectile: proj,
    target,
    zone,
    rangeM,
    obliquityDeg,
    effectiveImpactAngleDeg,
    eraActive,
    impactVelocityMps,
    impactEnergyMJ,
    effectiveLosThicknessMm,
    effectiveRhaeMm,
    penetrationDepthRhaeMm,
    overmatchMarginMm,
    ricochetAngleDeg: proj.ricochetAngleDeg,
    outcome,
    layerBreakdown,
    rangeCurve,
  };
}

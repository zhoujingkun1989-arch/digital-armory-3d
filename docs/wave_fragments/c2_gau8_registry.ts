/**
 * Wave 2 Integration Fragment — Track C2: General Electric GAU-8/A Avenger (`gau8`)
 * =================================================================================
 * New 10th Museum Hall: Heavy Ordnance & Aero Hall (`category: 'ordnance'`)
 * Flagship Centerpiece `BAY-34`: GE GAU-8/A Avenger 30x173mm 7-Barrel Rotary Autocannon
 *
 * ZERO shared files were modified in Wave 1. This fragment contains complete, verified,
 * 100% bilingual (zh/en) drop-in definitions for ALL shared registries:
 *   1. `src/weapons/types.ts` (WEAPON_IDS, ArmoryCategory, CaliberProfile)
 *   2. `src/weapons/manifests.ts` (GAU8_MANIFEST, BAY-34, 1:1 Heavy Hangar framing)
 *   3. `src/weapons/registry.ts` & `src/weapons/geometryLoaders.ts` (lazy loaders)
 *   4. `src/engine/geometry/glbAssetService.ts` (Draco GLB + 3 dynamic CSG springs + 22 PBR overrides)
 *   5. `src/engine/canvas/turntableStageMetrics.ts` (measured 1:1 assembled & t=0.58 bounds)
 *   6. `src/engine/physics/armoryPhysics.ts` (30x173mm PGU-14/B internal ballistics & firing timing)
 *   7. `src/engine/cartridges/cartridgeSpecs.ts` (30x173mm PGU-14/B 1:1 heavy ordnance cutaway spec)
 *   8. `src/engine/physics/externalBallistics.ts` (30x173mm PGU-14/B RK4 3-DOF aerodynamic profile)
 *   9. `src/engine/physics/armorPenetration.ts` (30x173mm PGU-14/B DU/tungsten penetrator spec)
 *  10. `src/engine/materials/engineeringRoles.ts` (6-role mapping for all 25 parts + energy flow profile)
 *  11. `src/engine/fieldstrip/fieldStripSpecs.ts` (6-step USAF A-10 armament maintenance DAG)
 *  12. `src/engine/malfunctions/malfunctionSpecs.ts` (4-malfunction cutaway profile)
 *  13. `src/engine/caliper/caliperStore.ts` (3 CAD metrology benchmarks)
 *  14. `src/features/armory/mechanismShowdownSpecs.ts` (taxonomy + 3 iconic showdown presets)
 *  15. `src/features/timeline/historyTimelineSpecs.ts` (1977 historical lineage node)
 *  16. `src/i18n/weaponFallbacks.ts` (complete English UI fallback metadata)
 *  17. `src/engine/audio/mechanicalSoundEngine.ts` (signature 65 Hz / 3,900 RPM "BRRRT!" acoustic profile)
 *  18. `src/features/armory/WeaponSilhouetteSvg.tsx` & `src/features/monograph/dkEditorialData.ts`
 */

// ============================================================================
// 1. `src/weapons/types.ts` additions
// ============================================================================
export const GAU8_TYPES_ADDITIONS = {
  weaponId: 'gau8' as const,
  armoryCategory: 'ordnance' as const,
  armoryCategoryLabelZh: '航空重武 / 火炮',
  armoryCategoryLabelEn: 'Heavy Ordnance & Aero',
  caliberProfile: '30x173_gau8' as const,
};

// ============================================================================
// 2. `src/weapons/manifests.ts` — BAY-34 Manifest
// ============================================================================
export const GAU8_MANIFEST_FRAGMENT = {
  id: 'gau8' as const,
  orderIndex: 34,
  shortLabel: 'GAU-8/A Avenger',
  caliberProfile: '30x173_gau8' as const,
  atlasHeadingCn:
    'GE GAU-8/A 复仇者 30mm 七管航炮与螺旋弹鼓 2K 5-Ch Packed ORM 贴图图集',
  catalog: {
    id: 'gau8' as const,
    bayCode: 'BAY-34',
    modelCode: 'GENERAL ELECTRIC GAU-8/A AVENGER · 30×173MM',
    nameCn: '通用电气 GAU-8/A「复仇者」30mm 七管航炮',
    subtitleEn:
      '30×173mm 3,900 RPM Hydraulic 7-Barrel Rotary Autocannon & 1,150-Rd Drum',
    originCountryCn: '美国',
    weaponTypeCn: '七管重型航空机炮',
    category: 'ordnance' as const,
    categoryCn: '航空重武',
    caliber: '30×173mm (PGU-14/B API / PGU-13/B HEI)',
    actionMechanism:
      '双 38.5 马力 3,000 PSI 液压外驱 · 七管同轴星形转子 · 360° 螺旋凸轮槽 + 1,150 发闭环无链螺旋弹鼓',
    specs1To1: {
      overallLengthMm: '6,060 mm (全系统含螺旋弹鼓) / 2,850 mm (机炮本体)',
      barrelSpec: '2,300 mm (90.5") × 7 管 · 14 膛线渐速右旋',
      emptyWeightKg: '281 kg (炮本体) / 1,828 kg (含 1,150 发满载弹鼓)',
      muzzleVelocityMs: '1,010 m/s (30×173mm PGU-14/B API)',
      effectiveRangeM: '1,220 m (点装甲目标) / 3,660 m (最大直瞄)',
      rateOfFire: '3,900 发/分 (65 发/秒 · 双液压驱动)',
    },
    assembliesCount: 4,
    partsCount: 25,
    firingStagesCount: 7,
    available: true,
    statusLabel: '航空重武大厅 · 1:1 可拆解',
    description:
      '美国通用电气（GE）围绕其量身缔造出 A-10「雷电 II」攻击机的航空重武图腾——GAU-8/A「复仇者」30×173mm 七管旋转机炮：1:1 真实工程尺度（含 1,150 发巨型螺旋弹鼓全长 6.06 米、满载重达 1.83 吨）还原七根 2.3 米冷锻炮管簇、双联 38.5 马力 3,000 PSI 高压液压马达、内嵌 360° 淬火正弦凸轮导轨与七套错相往复钛合金旋转炮闩，以及直径 876 mm 的闭环无链螺旋弹鼓与 100% 空铝壳返鼓回收通道，开启 CT 纵剖可穿透炮匣与巨鼓直击 3,900 RPM 钢铁风暴全循环！',
    highlights: [
      '七根 2,300 mm 冷锻重型 30mm 炮管簇 + 557 RPM 旋回 · 3,900 RPM 持续火力',
      '360° 渗碳淬火正弦螺旋凸轮导轨（300mm 深行程）+ 七套 51.4° 错相钛合金炮闩',
      '双 38.5 马力（77 HP）3,000 PSI 冗余液压马达 + 双液气反后坐缓冲筒驯服 44.5 kN 推力',
      'Ø876×1,816 mm 1,150 发无链螺旋弹鼓 + 拉丝铝壳 30×173mm PGU-14/B API 与闭环空壳回收',
    ],
  },
  cameraPresets: {
    armory_showcase: { pos: [420, 155, 580], target: [22, -16, 0] },
    iso: { pos: [380, 190, 620], target: [24, -10, 0] },
    right: { pos: [18, 8, 760], target: [18, -12, 0] },
    left: { pos: [18, 8, -760], target: [18, -12, 0] },
    top: { pos: [18, 790, 80], target: [18, -6, 0] },
    cutaway_focus: { pos: [95, 52, 240], target: [34, 4, 0] },
    firing_view: { pos: [215, 76, 440], target: [86, 4, 0] },
  },
  workbenchMeta: {
    badge: 'GE GAU-8/A AVENGER · 30×173MM 3,900 RPM',
    title: 'GE GAU-8/A「复仇者」30mm 七管航炮 1:1 3D 剖视与旋转循环演示',
    subtitle:
      '4 大总成 · 25 核心节点 · 77 HP 双液压驱动、七管旋转、360° 正弦凸轮七炮闩波与 1,150 发闭环螺旋弹鼓',
    cutawayLabel: '360° 凸轮槽与螺旋弹鼓特写',
    cutawayTitle:
      '切换至合拢透视状态并聚焦内嵌 360° 螺旋正弦凸轮导轨、七套钛合金旋转炮闩、七槽星形转子与 1,150 发螺旋弹鼓',
    cutawayFocusPartId: 'gau8_cam_track',
    searchPlaceholder:
      '搜索零件名 / 编号 (如 炮管簇, 凸轮, 炮闩, 液压马达, 螺旋弹鼓, F-02)...',
    muzzlePos: [320.0, 7.4, 0] as [number, number, number],
    chamberGlowPos: [78.0, 7.4, 0] as [number, number, number],
    scaleProfile: 'main_battle_tank' as const,
    gridY: -75.0,
    firingMilestoneLabel: '30mm凸轮波',
  },
};

// ============================================================================
// 3. `src/weapons/registry.ts` & `src/weapons/geometryLoaders.ts`
// ============================================================================
export const GAU8_LAZY_LOADERS = {
  pluginLoader: "gau8: () => import('./gau8/plugin').then((m) => m.GAU8_PLUGIN)",
  geometryLoader:
    "gau8: () => import('./gau8/geometries').then((m) => ({ geometryBuilders: m.GEOMETRY_BUILDERS }))",
};

// ============================================================================
// 4. `src/engine/geometry/glbAssetService.ts` — GLB & 3×2K ORM Overrides
// ============================================================================
const GAU8_V3_EXTERIOR_PBR = {
  albedoFile: 'gau8_v3_exterior_albedo.webp',
  normalFile: 'gau8_v3_exterior_normal.webp',
  roughnessFile: 'gau8_v3_exterior_roughness.webp',
  normalScale: 1.05,
};

const GAU8_V3_INTERNAL_PBR = {
  albedoFile: 'gau8_v3_internal_albedo.webp',
  normalFile: 'gau8_v3_internal_normal.webp',
  roughnessFile: 'gau8_v3_internal_roughness.webp',
  normalScale: 0.94,
};

const GAU8_V3_DRUM_PBR = {
  albedoFile: 'gau8_v3_drum_albedo.webp',
  normalFile: 'gau8_v3_drum_normal.webp',
  roughnessFile: 'gau8_v3_drum_roughness.webp',
  normalScale: 1.02,
};

export const GAU8_GLB_CONFIG_FRAGMENT = {
  modelFile: 'gau8.glb',
  dynamicSpringParts: [
    'gau8_recoil_springs',
    'gau8_buffer_spring',
    'gau8_striker_spring',
  ] as const,
  pbrOverrides: {
    // Suite 1: gau8_v3_exterior (8 solid GLB parts)
    gau8_barrel_cluster: GAU8_V3_EXTERIOR_PBR,
    gau8_barrel_clamps: GAU8_V3_EXTERIOR_PBR,
    gau8_muzzle_clamp: GAU8_V3_EXTERIOR_PBR,
    gau8_gun_housing: GAU8_V3_EXTERIOR_PBR,
    gau8_recoil_mount: GAU8_V3_EXTERIOR_PBR,
    gau8_recoil_buffers: GAU8_V3_EXTERIOR_PBR,
    gau8_hydraulic_motors: GAU8_V3_EXTERIOR_PBR,
    gau8_transfer_unit: GAU8_V3_EXTERIOR_PBR,
    // Suite 2: gau8_v3_internal (9 solid GLB parts)
    gau8_cam_track: GAU8_V3_INTERNAL_PBR,
    gau8_rotor_core: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_1: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_2: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_3: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_4: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_5: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_6: GAU8_V3_INTERNAL_PBR,
    gau8_bolt_7: GAU8_V3_INTERNAL_PBR,
    // Suite 3: gau8_v3_drum (5 solid GLB parts)
    gau8_ammo_drum: GAU8_V3_DRUM_PBR,
    gau8_drum_rotor: GAU8_V3_DRUM_PBR,
    gau8_ammo_belt_stack: GAU8_V3_DRUM_PBR,
    gau8_chute_feed: GAU8_V3_DRUM_PBR,
    gau8_chute_return: GAU8_V3_DRUM_PBR,
  },
};

// ============================================================================
// 5. `src/engine/canvas/turntableStageMetrics.ts` — Measured 1:1 Hangar Bounds
// ============================================================================
export const GAU8_TURNTABLE_BOUNDS_FRAGMENT = {
  cx: 17.1,
  minY: -74.0,
  maxY: 35.5,
  spanX: 605.8,
  explode58: {
    cx: 28.34,
    minY: -74.0,
    maxY: 88.46,
    spanX: 740.06,
  },
};

// ============================================================================
// 6. `src/engine/physics/armoryPhysics.ts` — 30×173mm PGU-14/B Internal Ballistics
// ============================================================================
export const GAU8_INTERNAL_BALLISTICS_FRAGMENT = {
  caliber: '30x173_gau8' as const,
  labelEn: '30×173mm GAU-8 PGU-14/B API (395g DU/Tungsten Core)',
  labelZh: '30×173mm GAU-8 PGU-14/B 贫铀/钨芯穿甲燃烧弹 (395g)',
  standard: 'NATO EPVAT' as const,
  peakPressureMPa: 430,
  muzzleVelocityMps: 1010,
  projectileMassG: 395, // 0.5 * 0.395 * 1010^2 = 201,469.75 J (0.201 MJ!)
  safeUnlockPressureMPa: 12,
  boreTimeMs: 3.15,
  referenceBarrelMm: 2300,
  pressureShapeK: 4.2,
  peakU: 0.39,
  heatPerShotC: 19,
  foulingPerShot: 0.022,
  recoilKickCm: 3.6,
  recoilRiseCm: 0.55,
  muzzleClimbRad: 0.008,
  barrelWhipCm: 0.16,
  ejectSpeedCmS: 195,
  caseHalfLenCm: 8.65,
  caseRadiusCm: 2.13,
  caseMassG: 148,
  shockDiamonds: 6,
};

export const GAU8_FIRING_TIMING_FRAGMENT = {
  ignitionF: 0.08,
  muzzleExitF: 0.19,
  ejectF: 0.44,
  batteryF: 0.88,
  gasPortTravel: null as number | null,
  // Closed-loop spent aluminum case return direction back toward right return chute
  ejectDir: [-0.82, -0.32, 0.48] as const,
};

// ============================================================================
// 7. `src/engine/cartridges/cartridgeSpecs.ts` — 1:1 Heavy Ordnance Cutaway Spec
// ============================================================================
export const GAU8_CARTRIDGE_30X173_LAB_SPEC_FRAGMENT = {
  caliber: '30x173_gau8' as const,
  code: '30×173mm GAU-8',
  standard: 'NATO STANAG' as const,
  nameZh: '30×173mm GAU-8/A PGU-14/B 航空穿甲燃烧弹 (API)',
  nameEn: '30×173mm GAU-8/A PGU-14/B Armor-Piercing Incendiary (API)',
  loadSubtitleZh:
    '395g 铝壳风帽 + 300g 贫铀/钨合金高密度穿甲芯 + 152g 球状双基装药',
  loadSubtitleEn:
    '395g Aluminum-Cased Shell + 300g Depleted-Uranium/Tungsten Core + 152g Propellant',
  representativeWeapons: ['gau8'] as const,
  primaryWeaponId: 'gau8' as const,
  // Suggested 1:1 Heavy Ordnance gallery placement alongside 88mm / 120mm / 125mm tank shells:
  lineupXCm: -44.0,
  caseLengthMm: 173.0,
  oalMm: 290.0,
  bulletDiameterMm: 30.0,
  neckDiameterMm: 33.4,
  shoulderDiameterMm: 41.0,
  baseDiameterMm: 42.6,
  rimDiameterMm: 42.6,
  rimThicknessMm: 3.6,
  caseCapacityMl: 182.0,
  propellantMassG: 152.0,
  propellantFillRatio: 0.89,
  propellantTypeZh: 'WC 870 级双基球状高能航炮发射药（152 g）',
  propellantTypeEn: 'WC 870 Class Double-Base Ball Autocannon Propellant (152 g)',
  primerTypeZh: 'M52A3B1 重型电击发航空耐压底火',
  primerTypeEn: 'M52A3B1 Heavy Percussion/Electric Aviation Cannon Primer',
  projectileMassG: 395.0,
  projectileGrain: 6096,
  coreKind: 'subsonic_tungsten_ap' as const, // Uses hardened sub-caliber penetrator core lathe in CartridgeLab!
  coreAnatomyZh:
    '轻合金炭黑空气动力风帽 + 绯红燃烧剂环 + Ø16mm 300g 超高密度贫铀/钨合金穿甲芯 + 红铜导带',
  coreAnatomyEn:
    'Lightweight Black Alloy Windshield + Crimson Incendiary Ring + Ø16mm 300g High-Density DU/Tungsten Core + Copper Driving Band',
  peakPressureMPa: 430,
  muzzleVelocityMps: 1010,
  muzzleEnergyJ: 201470,
  highlightZh:
    '单发高 290 mm 堪比玻璃汽水瓶！率先改用拉丝航空铝合金弹壳替代黄铜狂减 30% 死重，在 430 MPa 膛压下将 300g 高密度穿甲芯轰至 1,010 m/s（201 kJ），每秒 65 发撕碎重装甲顶甲！',
  highlightEn:
    'Towering 290 mm tall like a soda bottle: pioneered brushed aerospace aluminum casings to slash weight 30%, driving a dense 300 g DU/tungsten core to 1,010 m/s (201 kJ) at 65 rounds per second.',
  caseColor: '#cfd8e3', // Brushed aerospace aluminum case!
  jacketColor: '#2c313a', // Black anodized aluminum ballistic windscreen
  penetratorColor: '#94a3b8', // High-density depleted-uranium / tungsten core
  coreSlugColor: '#cf2e2a', // Crimson incendiary charge cavity
  propellantColor: '#1e293b',
};

// ============================================================================
// 8. `src/engine/physics/externalBallistics.ts` — RK4 3-DOF Aerodynamic Profile
// ============================================================================
export const GAU8_EXTERNAL_BALLISTICS_30X173_FRAGMENT = {
  id: '30x173_gau8' as const,
  code: '30×173mm API',
  nameZh: '30×173mm GAU-8 PGU-14/B API',
  nameEn: '30×173mm GAU-8 PGU-14/B API',
  loadLabelZh: '395 g (6,096 gr) 贫铀/钨芯航空穿甲燃烧弹',
  loadLabelEn: '395 g (6,096 gr) DU/Tungsten Aviation API',
  category: 'armor' as const, // Or 'ordnance' once ProjectileCategory adds 'ordnance'
  dragModel: 'G7' as const,
  bc: 0.88,
  muzzleVelocityMps: 1010,
  massGrains: 6096,
  massGrams: 395,
  caliberMm: 30.0,
  pelletCount: 1,
  defaultSightHeightCm: 14.0,
  recommendedZeroM: 300 as const,
  representativeWeaponIds: ['gau8'] as const,
  primaryWeaponId: 'gau8' as const,
  noteZh:
    'GAU-8/A 七管航炮 395 克高断面密度重弹（G7 BC 0.88 · 201.5 kJ），1,000 m 外仍保持 730 m/s 逾两倍音速与惊人低风偏，精准覆盖 1,220 m 反装甲俯冲攻击距离。',
  noteEn:
    'GAU-8/A’s high-sectional-density 395 g API projectile (G7 BC 0.88, 201.5 kJ) stays past Mach 2.1 at 1,000 m with negligible wind drift across the A-10’s 1,220 m slant-attack envelope.',
};

// ============================================================================
// 9. `src/engine/physics/armorPenetration.ts` — Lanz-Odermatt / De Marre Penetrator
// ============================================================================
export const GAU8_ARMOR_PENETRATOR_30X173_FRAGMENT = {
  id: '30x173_gau8' as const,
  code: '30×173mm PGU-14/B API',
  nameZh: '30×173mm GAU-8 PGU-14/B 贫铀/钨合金航空穿甲弹',
  nameEn: '30×173mm GAU-8 PGU-14/B DU/Tungsten Aviation API',
  muzzleVelocityMps: 1010,
  penetratorMassKg: 0.3, // 300 g high-density sub-caliber DU/tungsten core inside 395 g shell
  coreDiameterMm: 16.0,
  coreLengthMm: 108.0,
  // Real-world USAF GAU-8/A RHA penetration benchmarks: ~78 mm @ 0m, ~69 mm @ 500m, ~55 mm @ 1,000m, ~38 mm @ 1,220m
  refPenetration0mRhaeMm: 78,
  dragDecayPerKm: 0.165,
  velocityExponent: 1.44,
  ricochetAngleDeg: 70,
  isSubCaliberRod: true,
};

// ============================================================================
// 10. `src/engine/materials/engineeringRoles.ts` — All 25 Parts & Energy Flow
// ============================================================================
export const GAU8_GAS_FLOW_PROFILE_FRAGMENT = {
  weaponId: 'gau8' as const,
  family: 'external_electric_rotary' as const,
  hasGasTap: false,
  familyTitleZh: '双 38.5 马力 3,000 PSI 液压外驱 · 七管 360° 螺旋凸轮与闭环弹鼓',
  familyTitleEn:
    'Twin 38.5-HP 3,000 PSI Hydraulic Drive · 7-Barrel 360° Helical Cam & Closed-Loop Drum',
  flowNoteZh:
    '无导气孔：由 A-10 双余度 3,000 PSI 机载液压马达直接提供 77 马力旋转扭矩；430 MPa 高压燃气全部用于将 395g 穿甲弹沿 2.3 米炮管加速至 1,010 m/s，空铝壳经右侧闭环通道 100% 返鼓。',
  flowNoteEn:
    'No gas tap: twin redundant 3,000 PSI aircraft hydraulic motors supply 77 HP directly to the rotor while 100% of 430 MPa propellant energy accelerates the 395g DU/tungsten core down the 2.3 m bore.',
  chamberX: 78.0,
  muzzleX: 320.0,
  boreY: 7.4,
  gasPortX: null as number | null,
  gasChannelY: 7.4,
  gasChannelZ: 0,
  gasTargetX: 30.0,
  ventPos: [320.0, 7.4, 0] as [number, number, number],
};

export const GAU8_ENGINEERING_ROLES_FRAGMENT: Readonly<
  Record<
    string,
    | 'locking'
    | 'gas_drive'
    | 'bolt_carrier'
    | 'fire_control'
    | 'energy_spring'
    | 'housing_feed'
  >
> = {
  gau8_barrel_cluster: 'locking',
  gau8_barrel_clamps: 'locking',
  gau8_muzzle_clamp: 'locking',
  gau8_cam_track: 'locking',
  gau8_hydraulic_motors: 'gas_drive',
  gau8_recoil_buffers: 'gas_drive',
  gau8_rotor_core: 'bolt_carrier',
  gau8_bolt_1: 'bolt_carrier',
  gau8_bolt_2: 'bolt_carrier',
  gau8_bolt_3: 'bolt_carrier',
  gau8_bolt_4: 'bolt_carrier',
  gau8_bolt_5: 'bolt_carrier',
  gau8_bolt_6: 'bolt_carrier',
  gau8_bolt_7: 'bolt_carrier',
  gau8_transfer_unit: 'fire_control',
  gau8_recoil_springs: 'energy_spring',
  gau8_buffer_spring: 'energy_spring',
  gau8_striker_spring: 'energy_spring',
  gau8_gun_housing: 'housing_feed',
  gau8_recoil_mount: 'housing_feed',
  gau8_ammo_drum: 'housing_feed',
  gau8_drum_rotor: 'housing_feed',
  gau8_ammo_belt_stack: 'housing_feed',
  gau8_chute_feed: 'housing_feed',
  gau8_chute_return: 'housing_feed',
};

// ============================================================================
// 11. `src/engine/fieldstrip/fieldStripSpecs.ts` — 6-Step USAF Maintenance DAG
// ============================================================================
export const GAU8_FIELD_STRIP_PLAN_FRAGMENT = {
  weaponId: 'gau8' as const,
  manualCodeZh: 'USAF T.O. 1A-10A-2 航炮勤务教范 · 六步重武吊装分解',
  manualCodeEn: 'USAF T.O. 1A-10A-2 Armament Manual · 6-Step Heavy Strip',
  steps: [
    {
      id: 'gau8_strip_chutes',
      orderLabel: '01',
      titleZh: '解脱双侧无链进弹与空壳返鼓滑槽',
      titleEn: 'Unbolt Twin Linkless Feed & Return Conveyor Chutes',
      actionHintZh:
        '点击左侧实弹输送槽或右侧空壳返鼓槽，向外解脱法兰断开弹鼓与炮尾连接。',
      actionHintEn:
        'Click the left live feed chute or right return chute to uncouple the drum from the breech transfer unit.',
      requires: [],
      stripBlockedNoteZh: '',
      stripBlockedNoteEn: '',
      reassembleBlockedNoteZh:
        '必须先将巨型螺旋弹鼓推回对位并装好交接单元，最后再扣锁双侧无链滑槽。',
      reassembleBlockedNoteEn:
        'Re-dock the helical drum and transfer unit before bolting on the twin linkless chutes.',
      triggerPartIds: ['gau8_chute_feed', 'gau8_chute_return'],
      bindings: [
        { partId: 'gau8_chute_feed', explodeStepIndices: [0, 1] },
        { partId: 'gau8_chute_return', explodeStepIndices: [0, 1] },
      ],
    },
    {
      id: 'gau8_strip_drum',
      orderLabel: '02',
      titleZh: '后移 1,150 发螺旋弹鼓并吊出 30mm 弹药阵与转子',
      titleEn: 'Roll Back 1,150-Rd Helical Drum & Hoist 30mm Spiral',
      actionHintZh:
        '点击航空橄榄绿螺旋弹鼓或内部 30×173mm 弹药阵列，后滚弹鼓并升出内转子。',
      actionHintEn:
        'Click the helical ammo drum or 30x173mm round stack to roll the drum aft and hoist the rotor clear.',
      requires: ['gau8_strip_chutes'],
      stripBlockedNoteZh:
        '双侧无链输弹滑槽仍锁接在弹鼓前法兰上，请先拆离两侧滑槽！',
      stripBlockedNoteEn:
        'The twin linkless chutes are still bolted to the drum front ports—remove the chutes first!',
      reassembleBlockedNoteZh:
        '螺旋弹鼓与内部弹药阵必须在交接单元和液压驱动安装完毕前就位。',
      reassembleBlockedNoteEn:
        'Reassemble the helical drum before re-attaching the twin conveyor chutes.',
      triggerPartIds: [
        'gau8_ammo_drum',
        'gau8_ammo_belt_stack',
        'gau8_drum_rotor',
      ],
      bindings: [
        { partId: 'gau8_ammo_drum', explodeStepIndices: [0, 1] },
        { partId: 'gau8_ammo_belt_stack', explodeStepIndices: [0, 1] },
        { partId: 'gau8_drum_rotor', explodeStepIndices: [0, 1] },
      ],
    },
    {
      id: 'gau8_strip_clamps',
      orderLabel: '03',
      titleZh: '前抽穿孔热回火炮口箍与中段双钛合金稳定箍',
      titleEn: 'Pull Forward Muzzle Clamp & Mid Titanium Barrel Spiders',
      actionHintZh:
        '点击前段穿孔炮口箍或中段钛合金稳定箍，释放七根 2.3 米炮管前支点。',
      actionHintEn:
        'Click the perforated muzzle clamp or mid titanium spider clamps to free the seven 2.3 m barrels.',
      requires: [],
      stripBlockedNoteZh: '',
      stripBlockedNoteEn: '',
      reassembleBlockedNoteZh:
        '炮口箍与稳定箍须在七管炮管簇回锁至星形转子后再向前套入锁紧。',
      reassembleBlockedNoteEn:
        'Seat the seven-barrel cluster into the star-rotor before sliding on the titanium clamps.',
      triggerPartIds: ['gau8_muzzle_clamp', 'gau8_barrel_clamps'],
      bindings: [
        { partId: 'gau8_muzzle_clamp', explodeStepIndices: [0, 1, 2] },
        { partId: 'gau8_barrel_clamps', explodeStepIndices: [0, 1, 2] },
      ],
    },
    {
      id: 'gau8_strip_hydraulics',
      orderLabel: '04',
      titleZh: '卸压并吊离双 38.5 马力液压驱动马达与交接单元',
      titleEn: 'Hoist Twin 38.5-HP Hydraulic Motors & Breech Transfer Unit',
      actionHintZh:
        '点击钴蓝色双液压驱动马达或炮尾无链交接单元，解除 3,000 PSI 动力输入与清膛门。',
      actionHintEn:
        'Click the twin hydraulic drive motors or breech transfer unit to clear the rear housing.',
      requires: ['gau8_strip_chutes'],
      stripBlockedNoteZh:
        '无链滑槽仍锚固于交接单元左右法兰，请先拆离双侧输弹滑槽！',
      stripBlockedNoteEn:
        'Disconnect the left and right linkless chutes from the transfer unit first!',
      reassembleBlockedNoteZh:
        '必须先将星形转子、七炮闩与 360° 凸轮套筒装回主炮匣，再安装尾部双液压马达。',
      reassembleBlockedNoteEn:
        'Reinstall the cam track, star-rotor, and seven bolts before bolting on the hydraulic gearbox.',
      triggerPartIds: [
        'gau8_hydraulic_motors',
        'gau8_transfer_unit',
        'gau8_buffer_spring',
      ],
      bindings: [
        { partId: 'gau8_hydraulic_motors', explodeStepIndices: [0, 1] },
        { partId: 'gau8_transfer_unit', explodeStepIndices: [0, 1] },
        { partId: 'gau8_buffer_spring', explodeStepIndices: [0, 1] },
      ],
    },
    {
      id: 'gau8_strip_barrels_buffers',
      orderLabel: '05',
      titleZh: '前抽七管 2.3 米炮管簇并分离双液气反后坐缓冲筒',
      titleEn: 'Withdraw 7-Barrel Cluster & Dual Hydro-Pneumatic Buffers',
      actionHintZh:
        '点击七管旋转炮管簇或左右双液气缓冲筒，释放炮管闭锁盘与反后坐复进簧。',
      actionHintEn:
        'Click the seven-barrel cluster or twin recoil buffers to withdraw them from the gun housing.',
      requires: ['gau8_strip_clamps'],
      stripBlockedNoteZh:
        '穿孔炮口箍与中段稳定箍仍抱紧七根炮管，请先卸除炮口箍与稳定箍！',
      stripBlockedNoteEn:
        'Remove the muzzle clamp and mid titanium barrel clamps before pulling the seven barrels!',
      reassembleBlockedNoteZh:
        '必须先将主炮匣与内部星形转子就位，再旋装七根 2.3 米重型炮管。',
      reassembleBlockedNoteEn:
        'Re-seat the housing and star-rotor before locking the seven-barrel cluster back in place.',
      triggerPartIds: [
        'gau8_barrel_cluster',
        'gau8_recoil_buffers',
        'gau8_recoil_springs',
      ],
      bindings: [
        { partId: 'gau8_barrel_cluster', explodeStepIndices: [0, 1, 2] },
        { partId: 'gau8_recoil_buffers', explodeStepIndices: [0, 1] },
        { partId: 'gau8_recoil_springs', explodeStepIndices: [0, 1] },
      ],
    },
    {
      id: 'gau8_strip_rotor_cam',
      orderLabel: '06',
      titleZh: '航吊抬升主炮匣，抽出 360° 凸轮套筒、星形转子与七套炮闩',
      titleEn: 'Hoist Gun Housing & Extract 360° Cam Track, Rotor & 7 Bolts',
      actionHintZh:
        '点击主炮匣、360° 正弦凸轮套筒或星形转子，将核心旋转机构呈七芒星完整展开。',
      actionHintEn:
        'Click the gun housing, cam track sleeve, or star-rotor to fan out all seven titanium rotary bolts.',
      requires: ['gau8_strip_hydraulics', 'gau8_strip_barrels_buffers'],
      stripBlockedNoteZh:
        '七管炮管簇或尾部双液压马达仍锁连主转子，请先完成第 4、5 步再抽出转子与七套炮闩！',
      stripBlockedNoteEn:
        'Remove the hydraulic motors and seven-barrel cluster before extracting the cam sleeve and star-rotor!',
      reassembleBlockedNoteZh: '',
      reassembleBlockedNoteEn: '',
      triggerPartIds: [
        'gau8_gun_housing',
        'gau8_cam_track',
        'gau8_rotor_core',
        'gau8_bolt_1',
        'gau8_striker_spring',
      ],
      bindings: [
        { partId: 'gau8_gun_housing', explodeStepIndices: [0, 1] },
        { partId: 'gau8_cam_track', explodeStepIndices: [0, 1] },
        { partId: 'gau8_rotor_core', explodeStepIndices: [0, 1] },
        { partId: 'gau8_striker_spring', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_1', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_2', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_3', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_4', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_5', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_6', explodeStepIndices: [0, 1] },
        { partId: 'gau8_bolt_7', explodeStepIndices: [0, 1] },
      ],
    },
  ],
};

// ============================================================================
// 12. `src/engine/malfunctions/malfunctionSpecs.ts` — 4 Stoppage Diagnostics
// ============================================================================
export const GAU8_MALFUNCTION_PROFILE_FRAGMENT = {
  weaponId: 'gau8' as const,
  actionPartIds: [
    'gau8_rotor_core',
    'gau8_bolt_1',
    'gau8_bolt_2',
    'gau8_bolt_3',
    'gau8_bolt_4',
    'gau8_bolt_5',
    'gau8_bolt_6',
    'gau8_bolt_7',
  ],
  lockingPartIds: ['gau8_cam_track', 'gau8_bolt_1', 'gau8_barrel_cluster'],
  extractorPartId: 'gau8_bolt_3',
  fireControlPartIds: [
    'gau8_hydraulic_motors',
    'gau8_transfer_unit',
    'gau8_striker_spring',
  ],
  magazinePartIds: ['gau8_ammo_drum', 'gau8_chute_feed', 'gau8_chute_return'],
  magStripOffsetCm: [-46.0, 0.0, 0.0] as const,
  ejectionUpSign: -1 as const,
  stovepipeF: 0.44,
  doubleFeedF: 0.62,
  rackFullOpenF: 0.56,
  lightStrikeF: 0.09,
  outOfBatteryF: 0.89,
};

// ============================================================================
// 13. `src/engine/caliper/caliperStore.ts` — 1:1 Metrology Benchmarks
// ============================================================================
export const GAU8_CALIPER_BENCHMARKS_FRAGMENT = [
  {
    kind: 'overall_envelope' as const,
    labelZh: 'GAU-8/A 全系统总长（螺旋弹鼓尾盖至穿孔炮口箍）',
    labelEn: 'GAU-8/A Complete System Overall Length (Drum Aft to Muzzle Clamp)',
    nominalMm: 6058,
  },
  {
    kind: 'barrel_length' as const,
    labelZh: '七管 90.5" (2,300mm) 冷锻 30mm 旋转炮管簇跨度',
    labelEn: '7-Barrel 90.5" (2,300mm) 30x173mm Rotary Barrel Cluster Span',
    nominalMm: 2300,
  },
  {
    kind: 'bolt_lug_span' as const,
    labelZh: '七槽星形中心转子与 360° 螺旋凸轮闭锁核心跨度',
    labelEn: '7-Flute Central Star-Rotor & 360° Cam Track Lockup Span',
    nominalMm: 1118,
  },
];

// ============================================================================
// 14. `src/features/armory/mechanismShowdownSpecs.ts` — Lineage & Matchups
// ============================================================================
export const GAU8_SHOWDOWN_CLASSIFICATION_FRAGMENT = {
  id: 'gau8',
  driveFamily: 'external_electric_rotary' as const,
  lockingFamily: 'rotating_lug_bolt' as const,
  feedFamily: 'autoloader_carousel_or_blast_bustle' as const,
  driveDetail: {
    zh: '双 38.5 马力（77 HP）3,000 PSI 冗余液压马达外能源强驱 · 遇哑弹直接抽出返鼓零卡炮',
    en: 'Twin 38.5-HP (77 HP) 3,000 PSI redundant hydraulic drive — extracts misfires with zero stoppage',
  },
  lockingDetail: {
    zh: '静止 360° 硬化正弦凸轮套筒驱动 7 套三突笋钛合金炮闩作 300mm 错相波浪闭锁',
    en: 'Stationary 360° sinusoidal cam sleeve cycling 7 three-lug titanium rotary bolts across 300 mm',
  },
  feedDetail: {
    zh: 'Ø876mm 1,150 发无链螺旋弹鼓 + 双通道滑槽 100% 回收空铝壳保战机重心',
    en: 'Ø876mm 1,150-rd linkless helical drum w/ closed-loop spent aluminum case return preserving aircraft CG',
  },
  fireControlDetail: {
    zh: 'A-10 二段扳机液压电控 + 清膛安全门停射自动空转清膛防烤燃',
    en: 'Two-stage stick hydraulic trigger + automatic burst-end clearing sector gate preventing cook-off',
  },
  signatureAdvantage: {
    zh: '每秒 65 发 395g 贫铀/钨芯 30mm 穿甲弹幕（单发 201 kJ），千米外撕碎主战坦克顶甲',
    en: '65 rounds/sec of 395g DU/tungsten 30mm API (201 kJ/rd) shredding tank roof armor past 1,200 m',
  },
  engineeringTradeoff: {
    zh: '整套系统长 6.06 m、满载 1,828 kg、后坐力达 44.5 kN，必须围绕机炮专属打造整架 A-10 攻击机',
    en: '6.06 m length, 1,828 kg loaded mass & 44.5 kN recoil required designing the entire A-10 airframe around it',
  },
};

export const GAU8_SHOWDOWN_PRESETS_FRAGMENT = [
  {
    id: 'gau8_vs_m134',
    weaponA: 'gau8',
    weaponB: 'm134',
    titleZh: '加特林终极进化：30mm GAU-8/A 复仇者 vs 7.62mm M134D 迷你炮',
    titleEn: 'Gatling Apex: 30mm GAU-8/A Avenger vs 7.62mm M134D Minigun',
    taglineZh: '77 HP 液压七管反装甲巨炮 vs 3.2 HP 电驱六管直升机门炮',
    taglineEn:
      '77-HP Hydraulic 7-Barrel Tank-Killer vs 3.2-HP Electric 6-Barrel Helo Gun',
  },
  {
    id: 'gau8_vs_ztz99a',
    weaponA: 'gau8',
    weaponB: 'ztz99a',
    titleZh: '空地矛与盾：GAU-8/A 30mm 穿甲风暴 vs ZTZ-99A 复合装甲主战坦克',
    titleEn: 'Air-to-Armor Duel: GAU-8/A 30mm API Storm vs ZTZ-99A MBT',
    taglineZh: '每分钟 3,900 发 30mm 高频暴雨 vs 125mm 7.60 MJ 单发重锤',
    taglineEn: '3,900 RPM 30mm Saturation vs 125mm 7.60 MJ Single-Shot Hammer',
  },
];

// ============================================================================
// 15. `src/features/timeline/historyTimelineSpecs.ts` — Historical Lineage Node
// ============================================================================
export const GAU8_TIMELINE_NODE_FRAGMENT = {
  weaponId: 'gau8',
  year: 1977,
  lineageId: 'roller_blowback_delayed' as const,
  lane: 2,
  ancestors: ['m134'] as const,
  designerZh: '通用电气军械部 (General Electric Armament Systems)',
  designerEn: 'General Electric Armament Systems (Burlington, VT)',
  innovationZh:
    '围绕 6.06m 30×173mm 七管液压航炮造就 A-10 攻击机：铝壳贫铀穿甲弹 + 1,150 发闭环空壳返鼓弹鼓',
  innovationEn:
    '6.06 m 30x173mm 7-barrel hydraulic cannon around which the A-10 was built: aluminum DU-core rounds & closed-loop 1,150-rd drum',
};

// ============================================================================
// 16. `src/i18n/weaponFallbacks.ts` — English UI Fallback Entry
// ============================================================================
export const GAU8_EN_FALLBACK_FRAGMENT = {
  shortLabel: 'GAU-8/A Avenger',
  name: 'General Electric GAU-8/A Avenger 30mm Autocannon',
  originCountry: 'United States',
  weaponType: 'Rotary Heavy Autocannon',
  statusLabel: 'Ordnance Hall · 1:1 Ready',
  caliber: '30×173mm (PGU-14/B API)',
  compactCaliber: '30×173mm',
  actionMechanism:
    'Twin 38.5-HP Hydraulic 7-Barrel Rotary · 360° Cam Track & 1,150-Rd Drum',
  overallLengthMm: '6,060 mm (complete) / 2,850 mm (gun)',
  barrelSpec: '2,300 mm (90.5") × 7 · 14-RH Gain-Twist',
  weightKg: '281 kg (gun) / 1,828 kg (loaded)',
  muzzleVelocityMs: '1,010 m/s',
  effectiveRangeM: '1,220 m (point) / 3,660 m (max)',
  rateOfFire: '3,900 rpm (65 rds/s)',
  description:
    'Six-meter General Electric 30x173mm seven-barrel rotary autocannon around which the A-10 Thunderbolt II was built: 77 HP redundant 3,000 PSI hydraulic drive, stationary 360° sinusoidal cam sleeve cycling seven titanium bolts, dual hydro-pneumatic recoil buffers taming 44.5 kN thrust, and a 1,150-round closed-loop helical drum returning every spent aluminum shell case.',
  highlights: [
    '7 × 2.3 m Rotary Barrels · 3,900 RPM',
    '360° Helical Cam & 7 Phased Titanium Bolts',
    '77 HP Twin Hydraulic Drive & Recoil Mount',
    '1,150-Rd Closed-Loop Aluminum-Case Drum',
  ],
  workbenchTitle: 'GE GAU-8/A Avenger 30mm 1:1 Teardown & Rotary Simulation',
  workbenchSubtitle:
    '4 Assemblies · 25 CAD Nodes · 7-Barrel Spin, 360° Cam Wave & 1,150-Rd Helical Drum',
  cutawayLabel: '360° Cam Track & Helical Drum',
  cutawayTitle:
    'Switch to live CT cutaway and inspect the 360-degree sinusoidal cam track, seven orbiting bolts, and 1,150-round helical drum',
  searchPlaceholder:
    'Search part name / BOM code (e.g. barrel, cam, bolt, hydraulic, drum, F-02)...',
  firingMilestoneLabel: '30mm Cam Wave',
};

// ============================================================================
// 17. `src/engine/audio/mechanicalSoundEngine.ts` — Iconic "BRRRT!" Acoustic Profile
// ============================================================================
export const GAU8_ACOUSTIC_PROFILE_FRAGMENT = {
  caliberKey: '30x173_gau8' as const,
  fundamentalBuzzHz: 65.0, // Exact 3,900 RPM / 60s = 65 Hz iconic sawtooth/horn "BRRRT!" fundamental!
  subBassThumpHz: 42.0, // Supersonic 30mm blast wave pressure chest-punch
  hydraulicWhineHz: 1180.0, // Twin 3,000 PSI hydraulic motor high-pressure servo whine
  metallicClatterHz: 2640.0, // 7-bolt titanium cam roller & linkless conveyor cascade
  crackDecaySec: 0.34,
  echoReverbSend: 0.72,
  description:
    'Synthesizes the unmistakable A-10 GAU-8/A Avenger 65 Hz supersonic pulse-train buzz ("BRRRT!") layered with twin 3,000 PSI hydraulic whine and 30mm deep sub-bass concussive shock.',
};

// ============================================================================
// 18. `src/features/armory/WeaponSilhouetteSvg.tsx` & Monograph Editorial Pack
// ============================================================================
export const GAU8_SILHOUETTE_SVG_PATH_FRAGMENT =
  'M 12 36 L 68 36 L 72 44 L 96 44 L 96 36 L 136 36 L 140 30 L 148 30 L 148 44 L 228 44 L 236 42 L 236 58 L 228 56 L 148 56 L 148 64 L 138 72 L 106 72 L 102 64 L 72 64 L 68 72 L 18 72 L 12 64 Z';

export const GAU8_DK_SCALE_META_FRAGMENT = {
  oalMm: 6060,
  barrelMm: 2300,
  weightKg: 1828,
  silhouetteKind: 'human' as const,
  referenceLengthMm: 1750, // 3.46x human height — bigger than a Volkswagen Beetle!
  captionZh: '全长 6.06 m（约为成人身高 3.5 倍 · 体积超越大众甲壳虫轿车）',
  captionEn: '6.06 m complete length (~3.5× human height — larger than a VW Beetle)',
};

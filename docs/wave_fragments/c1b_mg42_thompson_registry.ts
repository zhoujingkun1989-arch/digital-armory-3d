/**
 * Wave 1 Track C1b — Ready-to-Integrate Registry Fragments for:
 *   - BAY-31: MG 42 (7.92×57mm Mauser · weaponId: 'mg42' · category: 'lmg')
 *   - BAY-33: Thompson M1928A1 (.45 ACP · weaponId: 'thompson' · category: 'smg')
 *   - NEW Caliber: 7.92×57mm Mauser (`792_mauser`) 1:1 CIP Cutaway + Internal & External RK4 Ballistics
 *
 * Wave 2 Integrator: merge each exported section below directly into the
 * corresponding shared registry file in `src/` and `tests/`.
 * Note: This file lives outside `tsconfig.json`'s `include` (`docs/`), keeping
 * Wave 1 zero-conflict on all shared registries.
 */

// ============================================================================
// 1. src/weapons/types.ts — Union Additions
// ============================================================================
export const C1B_WEAPON_IDS = ['mg42', 'thompson'] as const;
export const C1B_NEW_CALIBER_PROFILES = ['792_mauser'] as const;

// ============================================================================
// 2. src/weapons/manifests.ts — WeaponManifest Entries
// ============================================================================
export const C1B_WEAPON_MANIFESTS = [
  {
    id: 'mg42',
    orderIndex: 31,
    shortLabel: 'MG 42',
    caliberProfile: '792_mauser',
    atlasHeadingCn:
      '德国 MG 42 通用机枪 2K 5-Ch Packed ORM 贴图库 (Albedo / Normal / Packed ORM)',
    catalog: {
      id: 'mg42',
      bayCode: 'BAY-31',
      modelCode: 'MASCHINENGEWEHR 42 · 7.92×57MM MAUSER (cra 1943)',
      nameCn: 'MG 42 通用机枪',
      subtitleEn: '7.92×57mm Mauser Short-Recoil Twin-Roller General-Purpose Machine Gun',
      originCountryCn: '德国',
      weaponTypeCn: '通用机枪',
      category: 'lmg',
      categoryCn: '机枪',
      caliber: '7.92×57mm Mauser (8mm Mauser s.S.)',
      actionMechanism:
        '开膛待击 · 枪口助退 8.5mm 短后坐 · 对称双滚柱闭锁 · 顶盖 S 槽双向拨弹爪与下抛壳',
      specs1To1: {
        overallLengthMm: '1,220 mm',
        barrelSpec: '530 mm (4 右旋膛线 · 1:240 mm · 5秒侧门快换)',
        emptyWeightKg: '11.6 kg (含 Zweibein 42 两脚架)',
        muzzleVelocityMs: '755 m/s (198 gr s.S. 重尖船尾弹)',
        effectiveRangeM: '1,000 m (两脚架) / 2,000 m (三脚架)',
        rateOfFire: '1,200–1,500 rpm (纯全自动开膛)',
      },
      assembliesCount: 4,
      partsCount: 25,
      firingStagesCount: 7,
      available: true,
      statusLabel: '馆藏就绪 · 可拆解/剖视',
      description:
        '由金属冲压专家维尔纳·格鲁纳（Grossfuss）于 1942 年定型的冷冲压钢板通用机枪鼻祖：对称双滚柱刚性短后坐闭锁配合锥形枪口助退器爆发 1,200 发/分恐怖“撕布声”射速，右侧铰接门实现 5 秒免工具快换枪管，顶盖 S 型凸轮双级拨弹机直接奠定现代西方机枪供弹范式。',
      highlights: [
        '对称双淬火滚柱短后坐闭锁 + 击针斜楔机械防早发',
        '冷冲压多孔矩形散热护筒 + 右侧铰接 5 秒快换枪管锁门',
        '锥形枪口反冲助退器驱动 1,200 RPM 极速循环与垂直下抛壳',
        '顶盖 S 槽双级梭动拨弹爪 + 50 发 Gurttrommel 34 侧挂突击弹鼓',
      ],
    },
    cameraPresets: {
      armory_showcase: { pos: [40, 18, 84], target: [16, 0.5, 0] },
      iso: { pos: [42, 22, 86], target: [16, 0.5, 0] },
      right: { pos: [16, 2, 92], target: [16, 0.5, 0] },
      left: { pos: [16, 2, -92], target: [16, 0.5, 0] },
      top: { pos: [16, 98, 4], target: [16, 0.5, 0] },
      cutaway_focus: { pos: [14, 5.5, 34], target: [11, 1.5, 0] },
      firing_view: { pos: [24, 9, 44], target: [14, 1.5, 0] },
    },
    workbenchMeta: {
      badge: 'BAY-31 · 7.92×57MM MAUSER · 1,200 RPM',
      title: 'MG 42 通用机枪 3D 滚柱闭锁与 S 槽供弹工作台',
      subtitle:
        '4 大功能模块 · 25 个 1:1 精密构件 · 枪口助退短后坐、对称双滚柱闭锁与双级 S 槽拨弹仿真',
      cutawayLabel: '双滚柱与S槽纵剖',
      cutawayTitle: '切换纵剖特写聚焦对称双闭锁滚柱、击针斜楔、枪管节套与顶盖 S 槽拨弹爪',
      cutawayFocusPartId: 'mg42_locking_rollers',
      searchPlaceholder: '搜索零件 (如: 闭锁滚柱、换管门、助退器、拨弹爪、B-05)...',
      muzzlePos: [81.0, 1.5, 0],
      chamberGlowPos: [20.2, 1.5, 0],
      scaleProfile: 'heavy_sniper',
      gridY: -10.2,
      firingMilestoneLabel: '双滚柱内缩开锁',
    },
  },
  {
    id: 'thompson',
    orderIndex: 33,
    shortLabel: 'Thompson M1928A1',
    caliberProfile: '45_acp',
    atlasHeadingCn:
      '美国汤姆逊 M1928A1 冲锋枪 2K 5-Ch Packed ORM 贴图库 (Albedo / Normal / Packed ORM)',
    catalog: {
      id: 'thompson',
      bayCode: 'BAY-33',
      modelCode: 'U.S. SUBMACHINE GUN CAL. .45 M1928A1 · AUTO-ORDNANCE',
      nameCn: '汤姆逊 M1928A1 冲锋枪',
      subtitleEn: '.45 ACP Bronze Blish-Lock & 50-Round Clockwork Drum Submachine Gun',
      originCountryCn: '美国',
      weaponTypeCn: '冲锋枪',
      category: 'smg',
      categoryCn: '冲锋枪',
      caliber: '.45 ACP (11.43×23mm)',
      actionMechanism:
        '开膛待击 · 45° 斜槽青铜 H 型布利什延迟枪机 · 顶置拉机柄 · 50 发 L 型发条螺旋圆鼓',
      specs1To1: {
        overallLengthMm: '852 mm (含卡茨防跳器与快拆木托)',
        barrelSpec: '267 mm / 10.5" (6 右旋膛线 · 1:406 mm · 28 道散热鳍)',
        emptyWeightKg: '4.9 kg (空枪) / 7.1 kg (满载 50 发圆鼓)',
        muzzleVelocityMs: '285 m/s (230 gr FMJ-RN 重圆头弹)',
        effectiveRangeM: '150 m',
        rateOfFire: '700–800 rpm (半自动/全自动双拨片)',
      },
      assembliesCount: 4,
      partsCount: 25,
      firingStagesCount: 7,
      available: true,
      statusLabel: '馆藏就绪 · 可拆解/剖视',
      description:
        '由约翰·汤姆逊准将构想的二十世纪最具传奇色彩冲锋枪：整块锻钢立铣深烤蓝机匣内嵌约翰·布利什专利青铜 H 型延迟锁块、28 道径向散热鳍枪管配四槽卡茨防跳器、莱曼精密梯形照门、美洲黑胡桃木垂直前握把以及上弦 9 响的 50 发 L 型发条阿基米德螺旋大弹鼓。',
      highlights: [
        '铸造磷青铜 H 型布利什粘附延迟锁块沿 45° 机匣斜槽滑移',
        '10.5 英寸 28 道精车径向散热鳍枪管 + 四槽卡茨防跳制退器',
        '50 发 L 型发条大弹鼓：透视/剖视直击四翼转子与 .45 ACP 螺旋弹阵',
        '整块铣削机匣、顶置滚花拉机柄、莱曼表尺与黑胡桃木指槽垂直握把',
      ],
    },
    cameraPresets: {
      armory_showcase: { pos: [26, 12, 66], target: [4, -2.2, 0] },
      iso: { pos: [28, 16, 68], target: [4, -2.2, 0] },
      right: { pos: [4, -1.5, 72], target: [4, -2.2, 0] },
      left: { pos: [4, -1.5, -72], target: [4, -2.2, 0] },
      top: { pos: [4, 74, 4], target: [4, -1.5, 0] },
      cutaway_focus: { pos: [8, 0.5, 32], target: [4.5, -2.4, 0] },
      firing_view: { pos: [16, 5.5, 38], target: [6, -1.2, 0] },
    },
    workbenchMeta: {
      badge: 'BAY-33 · .45 ACP · BLISH LOCK & TYPE L DRUM',
      title: '汤姆逊 M1928A1 3D 青铜布利什锁与发条圆鼓工作台',
      subtitle:
        '4 大功能模块 · 25 个 1:1 精密构件 · 45° 青铜布利什延迟、顶置拉机柄与 50 发螺旋弹鼓仿真',
      cutawayLabel: '布利什锁与圆鼓纵剖',
      cutawayTitle: '切换纵剖特写聚焦青铜 H 型布利什延迟锁块、45° 斜槽与 50 发螺旋弹鼓',
      cutawayFocusPartId: 'thompson_blish_lock',
      searchPlaceholder: '搜索零件 (如: 布利什、卡茨、散热鳍、发条转子、B-04)...',
      muzzlePos: [46.2, 1.6, 0],
      chamberGlowPos: [12.5, 1.6, 0],
      scaleProfile: 'rifle',
      gridY: -16.8,
      firingMilestoneLabel: '青铜布利什上滑解锁',
    },
  },
] as const;

// ============================================================================
// 3. src/weapons/registry.ts & src/weapons/geometryLoaders.ts
// ============================================================================
export const C1B_DYNAMIC_LOADERS_SNIPPET = `
// In src/weapons/registry.ts -> PLUGIN_LOADERS:
  mg42: async () => (await import('./mg42/plugin')).MG42_PLUGIN,
  thompson: async () => (await import('./thompson/plugin')).THOMPSON_PLUGIN,

// In src/weapons/geometryLoaders.ts -> GEOMETRY_LOADERS:
  mg42: async () => (await import('./mg42/geometries')).GEOMETRY_BUILDERS,
  thompson: async () => (await import('./thompson/geometries')).GEOMETRY_BUILDERS,
`;

// ============================================================================
// 4. src/engine/geometry/glbAssetService.ts — GLB_WEAPON_CONFIGS Entries
// ============================================================================
const MG42_V3_SHROUD_PBR = {
  albedoFile: 'mg42_v3_shroud_albedo.webp',
  normalFile: 'mg42_v3_shroud_normal.webp',
  roughnessFile: 'mg42_v3_shroud_roughness.webp',
  normalScale: 0.88,
} as const;
const MG42_V3_FURNITURE_PBR = {
  albedoFile: 'mg42_v3_furniture_albedo.webp',
  normalFile: 'mg42_v3_furniture_normal.webp',
  roughnessFile: 'mg42_v3_furniture_roughness.webp',
  normalScale: 0.9,
} as const;
const MG42_V3_METAL_PBR = {
  albedoFile: 'mg42_v3_metal_albedo.webp',
  normalFile: 'mg42_v3_metal_normal.webp',
  roughnessFile: 'mg42_v3_metal_roughness.webp',
  normalScale: 0.85,
} as const;

const THOMPSON_V3_WALNUT_PBR = {
  albedoFile: 'thompson_v3_walnut_albedo.webp',
  normalFile: 'thompson_v3_walnut_normal.webp',
  roughnessFile: 'thompson_v3_walnut_roughness.webp',
  normalScale: 0.9,
} as const;
const THOMPSON_V3_RECEIVER_PBR = {
  albedoFile: 'thompson_v3_receiver_albedo.webp',
  normalFile: 'thompson_v3_receiver_normal.webp',
  roughnessFile: 'thompson_v3_receiver_roughness.webp',
  normalScale: 0.88,
} as const;
const THOMPSON_V3_METAL_PBR = {
  albedoFile: 'thompson_v3_metal_albedo.webp',
  normalFile: 'thompson_v3_metal_normal.webp',
  roughnessFile: 'thompson_v3_metal_roughness.webp',
  normalScale: 0.86,
} as const;

export const C1B_GLB_WEAPON_CONFIGS = {
  mg42: {
    modelFile: 'mg42.glb',
    dynamicSpringParts: [
      'mg42_recoil_spring',
      'mg42_buffer_spring',
      'mg42_sear_spring',
    ],
    pbrOverrides: {
      mg42_receiver_shroud: MG42_V3_SHROUD_PBR,
      mg42_top_cover: MG42_V3_SHROUD_PBR,
      mg42_barrel_latch: MG42_V3_SHROUD_PBR,
      mg42_muzzle_booster: MG42_V3_SHROUD_PBR,
      mg42_aa_sight: MG42_V3_SHROUD_PBR,
      mg42_bipod: MG42_V3_SHROUD_PBR,
      mg42_buttstock: MG42_V3_FURNITURE_PBR,
      mg42_grip_frame: MG42_V3_FURNITURE_PBR,
      mg42_ammo_drum: MG42_V3_FURNITURE_PBR,
      mg42_feed_tray: MG42_V3_FURNITURE_PBR,
      mg42_feed_pawl: MG42_V3_FURNITURE_PBR,
      mg42_barrel: MG42_V3_METAL_PBR,
      mg42_bolt_head: MG42_V3_METAL_PBR,
      mg42_locking_rollers: MG42_V3_METAL_PBR,
      mg42_locking_roller_left: MG42_V3_METAL_PBR,
      mg42_locking_wedge: MG42_V3_METAL_PBR,
      mg42_bolt_carrier: MG42_V3_METAL_PBR,
      mg42_charging_handle: MG42_V3_METAL_PBR,
      mg42_recoil_buffer: MG42_V3_METAL_PBR,
      mg42_trigger: MG42_V3_METAL_PBR,
      mg42_sear: MG42_V3_METAL_PBR,
      mg42_ammo_belt: MG42_V3_METAL_PBR,
    },
  },
  thompson: {
    modelFile: 'thompson.glb',
    dynamicSpringParts: [
      'thompson_recoil_spring',
      'thompson_sear_spring',
      'thompson_drum_spring',
    ],
    pbrOverrides: {
      thompson_foregrip: THOMPSON_V3_WALNUT_PBR,
      thompson_pistol_grip: THOMPSON_V3_WALNUT_PBR,
      thompson_buttstock: THOMPSON_V3_WALNUT_PBR,
      thompson_receiver: THOMPSON_V3_RECEIVER_PBR,
      thompson_lyman_sight: THOMPSON_V3_RECEIVER_PBR,
      thompson_lower_frame: THOMPSON_V3_RECEIVER_PBR,
      thompson_buttplate: THOMPSON_V3_RECEIVER_PBR,
      thompson_trigger: THOMPSON_V3_RECEIVER_PBR,
      thompson_sear: THOMPSON_V3_RECEIVER_PBR,
      thompson_selector_levers: THOMPSON_V3_RECEIVER_PBR,
      thompson_mag_catch: THOMPSON_V3_RECEIVER_PBR,
      thompson_barrel: THOMPSON_V3_METAL_PBR,
      thompson_cutts_comp: THOMPSON_V3_METAL_PBR,
      thompson_bolt: THOMPSON_V3_METAL_PBR,
      thompson_blish_lock: THOMPSON_V3_METAL_PBR,
      thompson_actuator: THOMPSON_V3_METAL_PBR,
      thompson_hammer_pin: THOMPSON_V3_METAL_PBR,
      thompson_buffer_pilot: THOMPSON_V3_METAL_PBR,
      thompson_oiler: THOMPSON_V3_METAL_PBR,
      thompson_drum_mag: THOMPSON_V3_METAL_PBR,
      thompson_drum_rotor: THOMPSON_V3_METAL_PBR,
      thompson_drum_rounds: THOMPSON_V3_METAL_PBR,
    },
  },
} as const;

// ============================================================================
// 5. src/engine/cartridges/cartridgeSpecs.ts — NEW 7.92×57mm Mauser Cutaway Spec
//    (Also add `'thompson'` to `45_acp.representativeWeapons`, and `'k98k'` + `'mg42'`
//     to `792_mauser.representativeWeapons` in Wave 2!)
// ============================================================================
export const C1B_NEW_CARTRIDGE_792_MAUSER = {
  caliber: '792_mauser',
  code: '7.92×57mm',
  standard: 'CIP',
  nameZh: '7.92×57mm 毛瑟重尖船尾步枪弹（8mm Mauser s.S.）',
  nameEn: '7.92×57mm Mauser (8mm IS · s.S. Patrone)',
  loadSubtitleZh: '198 格令重尖船尾全被甲铅芯弹（s.S. FMJ-BT）',
  loadSubtitleEn: '198 gr schweres Spitzgeschoss Boat-Tail (FMJ-BT)',
  representativeWeapons: ['mg42', 'k98k'],
  primaryWeaponId: 'mg42',
  lineupXCm: 13.8, // Adjust lineup spacing across 17 small-arms cartridges in Wave 2
  caseLengthMm: 57.0,
  oalMm: 82.0,
  bulletDiameterMm: 8.22,
  neckDiameterMm: 9.08,
  shoulderDiameterMm: 10.95,
  baseDiameterMm: 11.95,
  rimDiameterMm: 11.95,
  rimThicknessMm: 1.3,
  caseCapacityMl: 4.09,
  propellantMassG: 3.15,
  propellantFillRatio: 0.86,
  propellantTypeZh: 'Nz.R.P. 硝化纤维片管状单基步枪发射药',
  propellantTypeEn: 'Nz.R.P. Single-Base Nitrocellulose Flake/Tubular Powder',
  primerTypeZh: 'Berdan 88 大型步枪防漏耐压底火（绿/黑防水环漆）',
  primerTypeEn: 'Berdan 88 Large Rifle High-Pressure Primer (Lacquer Sealed)',
  projectileMassG: 12.8,
  projectileGrain: 198,
  coreKind: 'fmj_spitzer',
  coreAnatomyZh: '覆铜钢/黄铜流线型船尾被甲 + 高密度铅锑合金重弹芯',
  coreAnatomyEn: 'Gilding-Metal Streamlined Boat-Tail Jacket + Heavy Antimonial Lead Core',
  peakPressureMPa: 390,
  muzzleVelocityMps: 755,
  muzzleEnergyJ: 3648,
  highlightZh:
    '1888 年定型、1905 年升级 S 尖头弹并最终演进为 198 格令重尖船尾（s.S.）弹的欧洲步枪弹祖师：11.95 mm 无底缘底径成为后世 .30-06 与 7.62 NATO 共同几何母本，在 MG 42 上以 1,200 RPM 持续倾泻 3,648 J 全威力动能！',
  highlightEn:
    'Pioneering 1888 rimless military bottleneck case (11.95 mm head — ancestor to .30-06 and 7.62 NATO): its streamlined 198 gr s.S. boat-tail delivers 3,648 J with exceptional long-range ballistic retention.',
  caseColor: '#e2b22a',
  jacketColor: '#c3541e',
  penetratorColor: '#cbd5e1',
  coreSlugColor: '#475569',
  propellantColor: '#1f2937',
} as const;

// ============================================================================
// 6. src/engine/physics/externalBallistics.ts — NEW 7.92×57mm Mauser RK4 Profile
// ============================================================================
export const C1B_NEW_EXTERNAL_BALLISTICS_792_MAUSER = {
  id: '792_mauser',
  code: '7.92×57mm',
  nameZh: '7.92×57mm 毛瑟 (s.S.)',
  nameEn: '7.92×57mm Mauser (8mm s.S.)',
  loadLabelZh: '198 gr s.S. 重尖船尾全威力弹',
  loadLabelEn: '198 gr s.S. Heavy Spitzer Boat-Tail',
  category: 'rifle',
  dragModel: 'G7',
  bc: 0.278,
  muzzleVelocityMps: 755,
  massGrains: 198,
  massGrams: 12.8,
  caliberMm: 8.22,
  pelletCount: 1,
  defaultSightHeightCm: 4.8,
  recommendedZeroM: 100,
  representativeWeaponIds: ['mg42', 'k98k'],
  primaryWeaponId: 'mg42',
  noteZh:
    '198 格令流线型船尾重弹（G7 BC 0.278）具备惊人远距存速与抗横风能力，超音速直抵约 880 m，专为 MG 42 远距压制与 K98k 精确射击设计。',
  noteEn:
    'Streamlined 198 gr s.S. boat-tail (G7 BC 0.278) resists crosswind fiercely and stays supersonic past 880 m, powering both MG 42 sustained suppression and K98k marksmanship.',
} as const;

// ============================================================================
// 7. src/engine/physics/armoryPhysics.ts — Caliber & Firing Timing Entries
// ============================================================================
export const C1B_ARMORY_PHYSICS_CALIBER_792_MAUSER = {
  caliber: '792_mauser',
  labelEn: '7.92×57mm Mauser 198gr s.S. Boat-Tail',
  labelZh: '7.92×57mm 毛瑟 198格令 s.S. 重尖船尾弹',
  standard: 'CIP',
  peakPressureMPa: 390,
  muzzleVelocityMps: 755,
  projectileMassG: 12.8,
  safeUnlockPressureMPa: 12,
  boreTimeMs: 1.18,
  referenceBarrelMm: 530,
  pressureShapeK: 4.2,
  peakU: 0.43,
  heatPerShotC: 22,
  foulingPerShot: 0.019,
  recoilKickCm: 1.38,
  recoilRiseCm: 0.25,
  muzzleClimbRad: 0.028,
  barrelWhipCm: 0.044,
  ejectSpeedCmS: 225,
  caseHalfLenCm: 1.42,
  caseRadiusCm: 0.3,
  caseMassG: 11.4,
  shockDiamonds: 4,
} as const;

export const C1B_WEAPON_FIRING_TIMING = {
  // timing(ignitionF, muzzleExitF, ejectF, lockReturnF, gasPortF, ejectDirZ, recoilPeakF, recoilReturnF)
  // MG 42: open-bolt ignition 0.21, muzzle booster exit 0.30, downward belly ejection 0.50 (dirZ ~0.12)
  mg42: {
    ignitionF: 0.21,
    muzzleExitF: 0.3,
    ejectF: 0.5,
    lockReturnF: 0.84,
    gasPortF: 0.295,
    ejectDirZ: 0.14,
    recoilPeakF: 0.62,
    recoilReturnF: 0.85,
  },
  // Thompson M1928A1: open-bolt ignition 0.23, Cutts exit 0.32, right ejection 0.52
  thompson: {
    ignitionF: 0.23,
    muzzleExitF: 0.32,
    ejectF: 0.52,
    lockReturnF: 0.85,
    gasPortF: 0.315,
    ejectDirZ: 0.92,
    recoilPeakF: 0.64,
    recoilReturnF: 0.86,
  },
} as const;

// ============================================================================
// 8. src/engine/fieldstrip/fieldStripSpecs.ts — 5-Step Armorer DAGs
// ============================================================================
export const C1B_FIELD_STRIP_SPECS = {
  mg42: {
    weaponId: 'mg42',
    manualCodeZh: '德军 H.Dv. 181/2 教范 · 五步极速换管与滚柱机分解',
    manualCodeEn: 'H.Dv. 181/2 Armorer Manual · 5-Step Barrel Swap & Roller Strip',
    steps: [
      {
        id: 'mg42_strip_cover_belt',
        orderLabel: '01',
        titleZh: '掀开顶盖，卸除 50 发突击弹鼓与 Gurt 34 钢链',
        titleEn: 'Open Top Cover & Remove 50-Rd Gurttrommel Drum & Belt',
        actionHintZh: '点击受弹器顶盖、50 发侧挂突击弹鼓或 7.92mm 钢链段清枪验膛。',
        actionHintEn: 'Click the hinged top cover, 50-rd drum, or 7.92mm steel belt to clear ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '合上顶盖并挂装弹鼓前，请先复装快拆枪管（步骤 02）！',
        reassembleBlockedNoteEn: 'Reinstall the 530mm quick-change barrel (Step 02) before closing the top cover!',
        triggerPartIds: ['mg42_top_cover', 'mg42_ammo_drum', 'mg42_ammo_belt', 'mg42_feed_tray'],
      },
      {
        id: 'mg42_strip_barrel',
        orderLabel: '02',
        titleZh: '前推右侧铰接换管锁门，5 秒侧抽 530 mm 枪管',
        titleEn: 'Swing Right Hinged Barrel Latch & Withdraw 530mm Barrel',
        actionHintZh: '点击右侧铰接换管侧门或 530mm 快拆枪管体验 5 秒热管抽换。',
        actionHintEn: 'Click the right-side barrel latch door or 530mm barrel for a 5-second quick change.',
        requires: ['mg42_strip_cover_belt'],
        stripBlockedNoteZh: '更换枪管前必须先掀开顶盖卸除弹链与弹鼓并确认开膛（步骤 01）！',
        stripBlockedNoteEn: 'Open the top cover and clear the belt/drum (Step 01) before pulling the barrel!',
        reassembleBlockedNoteZh: '装回 530mm 枪管前，请先装好尾座枪托、缓冲器与复进簧（步骤 03）！',
        reassembleBlockedNoteEn: 'Reinstall buttstock, recoil buffer, and braided spring (Step 03) before locking the barrel!',
        triggerPartIds: ['mg42_barrel_latch', 'mg42_barrel'],
      },
      {
        id: 'mg42_strip_stock_buffer',
        orderLabel: '03',
        titleZh: '旋转 90° 卸下胶木枪托，抽出摩擦环缓冲器与三股复进簧',
        titleEn: 'Twist Buttstock 90° & Extract Friction Buffer & Braided Spring',
        actionHintZh: '点击旋锁胶木枪托、尾座缓冲器或三股绞合复进主簧。',
        actionHintEn: 'Click the twist-lock Bakelite buttstock, rear buffer, or braided driving spring.',
        requires: ['mg42_strip_barrel'],
        stripBlockedNoteZh: '拆枪托抽出复进簧前，请先卸除枪管卸荷（步骤 02）！',
        stripBlockedNoteEn: 'Withdraw the quick-change barrel (Step 02) before twisting off the buttstock!',
        reassembleBlockedNoteZh: '旋回枪托与复进簧前，请先将双滚柱枪机组滑入机匣（步骤 04）！',
        reassembleBlockedNoteEn: 'Slide the twin-roller bolt group into the receiver (Step 04) before locking the buttstock!',
        triggerPartIds: ['mg42_buttstock', 'mg42_recoil_buffer', 'mg42_buffer_spring', 'mg42_recoil_spring'],
      },
      {
        id: 'mg42_strip_roller_bcg',
        orderLabel: '04',
        titleZh: '向后抽出 550g 机框，分解双对称闭锁滚柱与击针斜楔',
        titleEn: 'Withdraw 550g Carrier & Strip Twin Locking Rollers & Wedge',
        actionHintZh: '点击重型机框、双滚柱机头、左右闭锁滚柱或击针斜楔。',
        actionHintEn: 'Click the bolt carrier, roller bolt head, twin rollers, or firing-pin locking wedge.',
        requires: ['mg42_strip_stock_buffer'],
        stripBlockedNoteZh: '机匣尾端由胶木枪托与缓冲器封堵，请先旋拆枪托与复进簧（步骤 03）！',
        stripBlockedNoteEn: 'Remove the buttstock, buffer, and driving spring (Step 03) to clear the rear bolt path!',
        reassembleBlockedNoteZh: '装入双滚柱枪机组前，请先装回握把火控盒与枪口助退器（步骤 05）！',
        reassembleBlockedNoteEn: 'Reattach the Bakelite grip frame and muzzle booster (Step 05) before inserting the bolt!',
        triggerPartIds: [
          'mg42_bolt_carrier',
          'mg42_bolt_head',
          'mg42_locking_rollers',
          'mg42_locking_roller_left',
          'mg42_locking_wedge',
          'mg42_charging_handle',
        ],
      },
      {
        id: 'mg42_strip_fcg_booster',
        orderLabel: '05',
        titleZh: '旋卸枪口锥形助退器并拆离胶木握把火控盒与两脚架',
        titleEn: 'Unscrew Muzzle Recoil Booster & Strip Grip FCG, Sights & Bipod',
        actionHintZh: '点击枪口助退器、胶木握把火控座、高射蛛网照门或两脚架完成深度勤务拆解。',
        actionHintEn: 'Click the muzzle booster, grip frame, AA spider sight, or bipod to finish detail strip.',
        requires: ['mg42_strip_roller_bcg'],
        stripBlockedNoteZh: '请先取出双滚柱枪机组（步骤 04）后再分解握把火控与助退器！',
        stripBlockedNoteEn: 'Extract the roller bolt group (Step 04) before stripping the grip FCG and booster!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'mg42_muzzle_booster',
          'mg42_grip_frame',
          'mg42_trigger',
          'mg42_sear',
          'mg42_sear_spring',
          'mg42_feed_pawl',
          'mg42_aa_sight',
          'mg42_bipod',
        ],
      },
    ],
  },
  thompson: {
    weaponId: 'thompson',
    manualCodeZh: '美军 FM 23-40 教范 · 五步圆鼓与布利什锁快拆',
    manualCodeEn: 'U.S. Army FM 23-40 · 5-Step Drum & Blish-Lock Strip',
    steps: [
      {
        id: 'thompson_strip_drum',
        orderLabel: '01',
        titleZh: '拨起弹鼓卡笋，横滑卸下 50 发 L 型发条大弹鼓',
        titleEn: 'Lift Catch & Slide Off 50-Round Type L Clockwork Drum',
        actionHintZh: '点击 50 发 L 型圆鼓、四翼发条转子或左侧弹鼓卡笋卸载弹药。',
        actionHintEn: 'Click the 50-round Type L drum, rotor, or left mag catch to clear ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '挂回 50 发 L 型圆鼓前，请先锁回快拆黑胡桃木后枪托（步骤 02）！',
        reassembleBlockedNoteEn: 'Slide on the detachable walnut buttstock (Step 02) before locking the 50-rd drum!',
        triggerPartIds: [
          'thompson_drum_mag',
          'thompson_drum_rotor',
          'thompson_drum_rounds',
          'thompson_drum_spring',
        ],
      },
      {
        id: 'thompson_strip_stock',
        orderLabel: '02',
        titleZh: '按压尾部燕尾滑锁，向后抽出快拆黑胡桃木枪托',
        titleEn: 'Depress Slide Catch & Detach Quick-Release Walnut Buttstock',
        actionHintZh: '点击黑胡桃木后枪托或钢制暗门托底板沿滑轨向后卸除。',
        actionHintEn: 'Click the quick-detach walnut buttstock or steel buttplate to slide it off.',
        requires: ['thompson_strip_drum'],
        stripBlockedNoteZh: '安全第一：请先横滑卸除 50 发发条大弹鼓（步骤 01）！',
        stripBlockedNoteEn: 'Safety first: slide off the 50-round Type L drum (Step 01) first!',
        reassembleBlockedNoteZh: '滑装胡桃木后枪托前，请先扣合下机匣火控盒（步骤 03）！',
        reassembleBlockedNoteEn: 'Mate the lower trigger frame (Step 03) before sliding on the walnut buttstock!',
        triggerPartIds: ['thompson_buttstock', 'thompson_buttplate'],
      },
      {
        id: 'thompson_strip_lower',
        orderLabel: '03',
        titleZh: '按下后缓冲锁钮，滑离整块铣削下机匣与火控握把组',
        titleEn: 'Depress Buffer Button & Slide Off Milled Lower Trigger Frame',
        actionHintZh: '点击下机匣火控盒、黑胡桃木后握把或双拨片快慢机分离下机身。',
        actionHintEn: 'Click the lower trigger frame, walnut pistol grip, or selector paddles to separate.',
        requires: ['thompson_strip_stock'],
        stripBlockedNoteZh: '后枪托挡住下机匣尾端滑道，请先拆下快拆木枪托（步骤 02）！',
        stripBlockedNoteEn: 'Remove the quick-detach buttstock (Step 02) to clear the lower frame rails!',
        reassembleBlockedNoteZh: '扣合下机匣前，请先装回复进簧、导杆、青铜布利什块与枪机（步骤 04）！',
        reassembleBlockedNoteEn: 'Reinstall recoil spring, buffer pilot, bronze Blish lock, and bolt (Step 04) first!',
        triggerPartIds: [
          'thompson_lower_frame',
          'thompson_pistol_grip',
          'thompson_trigger',
          'thompson_sear',
          'thompson_sear_spring',
          'thompson_selector_levers',
          'thompson_mag_catch',
        ],
      },
      {
        id: 'thompson_strip_blish_bolt',
        orderLabel: '04',
        titleZh: '取出纤维缓冲导杆、复进簧、青铜 H 型布利什锁与顶置拉柄枪机',
        titleEn: 'Withdraw Fiber Buffer, Spring, Bronze Blish Lock & Top-Actuator Bolt',
        actionHintZh: '点击青铜布利什块、铣削枪机、顶置滚花拉机柄或复进簧完成核心分解。',
        actionHintEn: 'Click the bronze Blish H-piece, bolt, top actuator knob, or recoil spring.',
        requires: ['thompson_strip_lower'],
        stripBlockedNoteZh: '枪机与复进簧封闭于上下机匣间，请先滑离下机匣（步骤 03）！',
        stripBlockedNoteEn: 'Slide off the lower trigger frame (Step 03) to open the upper receiver bottom!',
        reassembleBlockedNoteZh: '装回布利什枪机组前，请先复装散热鳍枪管、卡茨防跳器与前握把（步骤 05）！',
        reassembleBlockedNoteEn: 'Reassemble the finned barrel, Cutts comp, and vertical foregrip (Step 05) first!',
        triggerPartIds: [
          'thompson_buffer_pilot',
          'thompson_recoil_spring',
          'thompson_blish_lock',
          'thompson_bolt',
          'thompson_actuator',
          'thompson_hammer_pin',
          'thompson_oiler',
        ],
      },
      {
        id: 'thompson_strip_front',
        orderLabel: '05',
        titleZh: '拆解垂直黑胡桃木前握把、卡茨防跳器、28 道散热鳍枪管与莱曼照门',
        titleEn: 'Strip Vertical Foregrip, Cutts Comp, 28-Fin Barrel & Lyman Sight',
        actionHintZh: '点击垂直前握把、卡茨防跳器、散热鳍枪管或莱曼梯形表尺完成全拆。',
        actionHintEn: 'Click the vertical foregrip, Cutts comp, finned barrel, or Lyman ladder sight.',
        requires: ['thompson_strip_blish_bolt'],
        stripBlockedNoteZh: '请先抽出青铜布利什枪机组（步骤 04）后再分解前段与表尺！',
        stripBlockedNoteEn: 'Extract the Blish bolt group (Step 04) before stripping the front assembly!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'thompson_foregrip',
          'thompson_cutts_comp',
          'thompson_barrel',
          'thompson_lyman_sight',
        ],
      },
    ],
  },
} as const;

// ============================================================================
// 9. src/engine/malfunctions/malfunctionSpecs.ts — Stoppage Profiles
// ============================================================================
export const C1B_MALFUNCTION_SPECS = {
  mg42: {
    weaponId: 'mg42',
    actionPartIds: ['mg42_charging_handle', 'mg42_bolt_carrier', 'mg42_bolt_head'],
    lockingPartIds: ['mg42_locking_rollers', 'mg42_locking_roller_left', 'mg42_locking_wedge', 'mg42_barrel'],
    extractorPartId: 'mg42_bolt_head',
    fireControlPartIds: ['mg42_trigger', 'mg42_sear', 'mg42_locking_wedge'],
    magazinePartIds: ['mg42_top_cover', 'mg42_ammo_drum', 'mg42_ammo_belt', 'mg42_feed_tray', 'mg42_feed_pawl'],
    magStripOffsetCm: [0, -6.5, -9.5],
    ejectionUpSign: -1, // Authentic MG 42 downward belly ejection!
    stovepipeF: 0.52,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.6,
    lightStrikeF: 0.21,
    outOfBatteryF: 0.16,
  },
  thompson: {
    weaponId: 'thompson',
    actionPartIds: ['thompson_actuator', 'thompson_bolt', 'thompson_blish_lock'],
    lockingPartIds: ['thompson_blish_lock', 'thompson_bolt', 'thompson_barrel'],
    extractorPartId: 'thompson_bolt',
    fireControlPartIds: ['thompson_trigger', 'thompson_sear', 'thompson_hammer_pin'],
    magazinePartIds: ['thompson_drum_mag', 'thompson_drum_rotor', 'thompson_drum_rounds'],
    magStripOffsetCm: [0, -8.5, -7.2],
    ejectionUpSign: 1,
    stovepipeF: 0.54,
    doubleFeedF: 0.66,
    rackFullOpenF: 0.62,
    lightStrikeF: 0.23,
    outOfBatteryF: 0.18,
  },
} as const;

// ============================================================================
// 10. src/engine/materials/engineeringRoles.ts — Gas/Recoil Flow Specs
// ============================================================================
export const C1B_ENGINEERING_FLOW_SPECS = {
  mg42: {
    weaponId: 'mg42',
    family: 'short_recoil',
    hasGasTap: true,
    familyTitleZh: '锥形枪口助退 8.5mm 短后坐 · 对称双滚柱闭锁 + S 槽双级拨弹',
    familyTitleEn: 'Muzzle-Boosted 8.5mm Short Recoil · Symmetric Twin-Roller Lock & S-Cam Feed',
    flowNoteZh:
      '7.92×57mm 390 MPa 高压燃气全部加速弹头至 755 m/s 后冲入枪口锥形助退器截气反冲枪管与节套同步短后坐 8.5 mm，随后机匣斜面挤回左右双滚柱加速 550g 机框飙出 1,200 RPM。',
    flowNoteEn:
      'Sealed 390 MPa pressure drives the 198gr spitzer into the conical muzzle recoil booster, trapping exit gas to kick the barrel and locked twin rollers back 8.5 mm before receiver ramps cam the rollers inward at 1,200 RPM.',
    chamberX: 20.2,
    muzzleX: 81.0,
    boreY: 1.5,
    gasPortX: 76.5,
    gasChannelY: 1.5,
    gasChannelZ: 0,
    gasTargetX: 44.5,
    ventPos: [81.0, 1.5, 0],
  },
  thompson: {
    weaponId: 'thompson',
    family: 'roller_delayed_blowback',
    hasGasTap: false,
    familyTitleZh: '45° 倾斜轨道青铜 H 型布利什粘附延迟半自由枪机 + 卡茨防跳',
    familyTitleEn: '45° Inclined Bronze Blish Adhesion-Delayed Blowback & Cutts Compensator',
    flowNoteZh:
      '145 MPa .45 ACP 亚音速重弹推压机头，青铜 H 型布利什块在高压期紧抵机匣 45° 钢槽产生瞬态摩擦阻滞，出膛后经卡茨四槽向上泄气压低枪口并沿 72° 枪机斜槽上滑开锁。',
    flowNoteEn:
      'Peak 145 MPa .45 ACP thrust seats the bronze Blish H-piece against 45° steel receiver tracks; as the 230gr slug exits the 4-slot upward-venting Cutts compensator, 72° bolt ramps cam the bronze lock upward.',
    chamberX: 12.5,
    muzzleX: 46.2,
    boreY: 1.6,
    gasPortX: null,
    gasChannelY: 2.75,
    gasChannelZ: 0,
    gasTargetX: 1.6,
    ventPos: [42.6, 2.75, 0],
  },
} as const;

// ============================================================================
// 11. src/engine/caliper/caliperStore.ts — 3 CAD Reference Measurements Each
// ============================================================================
export const C1B_CALIPER_PRESETS = {
  mg42: [
    {
      kind: 'overall_envelope',
      labelZh: 'MG 42 通用机枪含助退器全长',
      labelEn: 'MG 42 Overall Length (w/ Recoil Booster)',
      nominalMm: 1220,
    },
    {
      kind: 'barrel_length',
      labelZh: '530 mm 7.92×57mm 快拆线膛枪管实长',
      labelEn: '530 mm Quick-Change 7.92mm Barrel Length',
      nominalMm: 530,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '对称双滚柱张开闭锁跨度（含滚柱机头）',
      labelEn: 'Symmetric Twin Locking Rollers Span',
      nominalMm: 27,
    },
  ],
  thompson: [
    {
      kind: 'overall_envelope',
      labelZh: '汤姆逊 M1928A1 含卡茨防跳器与木托全长',
      labelEn: 'Thompson M1928A1 Overall Length (w/ Cutts & Stock)',
      nominalMm: 852,
    },
    {
      kind: 'barrel_length',
      labelZh: '10.5 英寸 28 道散热鳍枪管实长',
      labelEn: '10.5" 28-Fin Cooled Barrel Length',
      nominalMm: 267,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '50 发 L 型发条螺旋圆鼓外径',
      labelEn: '50-Round Type L Clockwork Drum Outer Diameter',
      nominalMm: 165,
    },
  ],
} as const;

// ============================================================================
// 12. src/engine/canvas/turntableStageMetrics.ts — Turntable Envelopes
// ============================================================================
export const C1B_TURNTABLE_BOUNDS = {
  mg42: {
    cx: 20.0,
    minY: -10.0,
    maxY: 8.5,
    spanX: 124.0,
    explode58: { cx: 18.0, minY: -26.0, maxY: 25.0, spanX: 178.0 },
  },
  thompson: {
    cx: 3.6,
    minY: -16.4,
    maxY: 6.5,
    spanX: 88.0,
    explode58: { cx: 3.6, minY: -31.0, maxY: 22.0, spanX: 142.0 },
  },
} as const;

// ============================================================================
// 13. src/engine/ballistics/magazineStackSpecs.ts — Cutaway Ammo Stack Specs
// ============================================================================
export const C1B_MAGAZINE_STACK_SPECS = {
  mg42: {
    weaponId: 'mg42',
    magBodyPartId: 'mg42_ammo_drum',
    followerPartId: 'mg42_ammo_belt',
    roundCount: 6,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.38, 0.72],
    replenishWindow: [0.84, 0.96],
    magSubStripStartT: 0.2,
    followerDeckPlane: { point: [11.8, -1.8, -6.2], normal: [0, 1, 0] },
  },
  thompson: {
    weaponId: 'thompson',
    magBodyPartId: 'thompson_drum_mag',
    followerPartId: 'thompson_drum_rotor',
    roundCount: 8,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.46, 0.78],
    replenishWindow: [0.85, 0.96],
    magSubStripStartT: 0.22,
    followerDeckPlane: { point: [7.8, -7.8, 0], normal: [0, 1, 0] },
  },
} as const;

// ============================================================================
// 14. src/engine/interaction/InteractiveActionController.tsx — FCG Profiles
// ============================================================================
export const C1B_FIRE_CONTROL_PROFILES = {
  mg42: {
    weaponId: 'mg42',
    supportedModes: ['safe', 'auto'] as const,
    actionPartIds: ['mg42_charging_handle', 'mg42_bolt_carrier', 'mg42_bolt_head'],
    mechanismSummaryZh: '极简纯全自动开膛待击阻铁 + 横推 S/F 物理保险栓',
    mechanismSummaryEn: 'Full-Auto Only Open-Bolt Sear Catch + S/F Cross-Bolt Safety',
    modes: {
      safe: {
        mode: 'safe',
        code: 'S',
        labelZh: '保险 (S · Sicher)',
        labelEn: 'SAFE (S)',
        tooltipZh: '横推保险栓至 S 位直接从物理上锁死重型开膛阻铁。',
        tooltipEn: 'Cross-bolt pushed to S physically locks the heavy open-bolt sear.',
      },
      auto: {
        mode: 'auto',
        code: 'F',
        labelZh: '全自动 1,200 RPM (F · Feuer)',
        labelEn: 'FULL AUTO 1,200 RPM (F)',
        tooltipZh: '纯连发开膛循环：扣住扳机以 1,200 发/分释放双滚柱弹幕，松手即由阻铁截停散热。',
        tooltipEn: 'Pure open-bolt full auto at 1,200 RPM; releasing the trigger raises the sear to vent the barrel.',
      },
    },
  },
  thompson: {
    weaponId: 'thompson',
    supportedModes: ['safe', 'semi', 'auto'] as const,
    actionPartIds: ['thompson_actuator', 'thompson_bolt', 'thompson_blish_lock'],
    mechanismSummaryZh: '开膛双模式阻铁摇臂 + 左侧双独立桨式快慢机与保险拨片',
    mechanismSummaryEn: 'Open-Bolt Select-Fire Sear & Rocker + Twin Left-Side Paddle Levers',
    modes: {
      safe: {
        mode: 'safe',
        code: 'SAFE',
        labelZh: '后桨保险 (SAFE)',
        labelEn: 'SAFE (Rear Paddle)',
        tooltipZh: '后拨片旋至 SAFE 挡死开膛主阻铁与枪机防跌落走火。',
        tooltipEn: 'Rear paddle rotated to SAFE mechanically blocks the open-bolt sear.',
      },
      semi: {
        mode: 'semi',
        code: 'SINGLE',
        labelZh: '前桨单发 (SINGLE)',
        labelEn: 'SEMI (SINGLE)',
        tooltipZh: '单发断连摇臂每发后自动脱钩让阻铁升起截停枪机，实现精准半自动点射。',
        tooltipEn: 'Disconnector rocker trips after each shot so the sear catches the bolt open for accurate single fire.',
      },
      auto: {
        mode: 'auto',
        code: 'FULL AUTO',
        labelZh: '前桨连发 (FULL AUTO)',
        labelEn: 'FULL AUTO (750 RPM)',
        tooltipZh: '快慢机顶死单发摇臂，持续扣机以 750 发/分倾泻 50 发发条大弹鼓火力。',
        tooltipEn: 'Selector bypasses the disconnector for continuous 750 RPM fire fed by the 50-rd clockwork drum.',
      },
    },
  },
} as const;

// ============================================================================
// 15. src/features/armory/mechanismShowdownSpecs.ts — Taxonomy & Presets
// ============================================================================
export const C1B_SHOWDOWN_CLASSIFICATIONS = {
  mg42: {
    id: 'mg42',
    driveFamily: 'short_recoil_barrel',
    lockingFamily: 'roller_or_mass_blowback',
    feedFamily: 'disintegrating_belt_shuttle',
    driveDetail: {
      zh: '锥形枪口助退器截留高压尾流猛推 530mm 枪管与节套整体短后坐 8.5 mm，开锁瞬间滚柱反推斜楔将能量高效注入 550g 重机框。',
      en: 'Conical muzzle recoil booster traps exit gases to drive the 530mm barrel and extension back 8.5 mm before unlocking cams accelerate the 550g carrier.',
    },
    lockingDetail: {
      zh: '左右两枚对称硬化轴承钢滚柱受击针斜楔外撑死锁于锻钢枪管节套内，完全封闭 390 MPa 膛压，解放冷冲压薄钢板机匣。',
      en: 'Symmetric twin hardened bearing-steel rollers are wedged outward by the firing-pin locking piece into the forged barrel extension, isolating 390 MPa from the stamped receiver.',
    },
    feedDetail: {
      zh: '机框顶柱沿顶盖 S 型曲线轨道驱动双级拨弹爪在后坐与复进双程接力拉动 Gurt 34 不可散钢链与 50 发侧挂突击弹鼓。',
      en: 'A vertical bolt-carrier stud rides the top-cover S-cam to drive dual-stage shuttle pawls across both strokes, feeding Gurt 34 belts and 50-rd assault drums.',
    },
    fireControlDetail: {
      zh: '极简纯全自动开膛待击阻铁配横推 S/F 保险栓，三股绞合复进簧抗 20 Hz 共振断裂。',
      en: 'Rugged full-auto-only open-bolt sear with S/F cross-bolt safety and anti-resonance 3-strand braided driving spring.',
    },
    signatureAdvantage: {
      zh: '冷冲压工时腰斩、5 秒单侧门极速换管、1,200 RPM 压倒性火力与现代西方通用机枪共同的 S 槽供弹血统',
      en: 'Half the machining time via presswork, 5-second side-door barrel swaps, 1,200 RPM suppression, and the S-cam belt feed inherited by NATO machine guns',
    },
    engineeringTradeoff: {
      zh: '极高射速导致弹药消耗巨大且连发 250 发即须频繁换管，纯连发设计对射手食指点放控枪训练要求极高',
      en: 'Blistering cyclic rate devours ammunition rapidly, requires barrel changes every ~250 rounds, and demands disciplined short bursts',
    },
  },
  thompson: {
    id: 'thompson',
    driveFamily: 'delayed_or_straight_blowback',
    lockingFamily: 'sliding_wedge_breech',
    feedFamily: 'staggered_box_magazine',
    driveDetail: {
      zh: '开膛半自由枪机配约翰·布利什 45° 斜槽青铜延迟块，靠 72° 枪机斜面与 45° 机匣槽几何角度配比控制开膛时序。',
      en: 'Open-bolt Blish delayed blowback balances 45° inclined receiver rails against 72° bolt ramps via a sliding phosphor-bronze H-piece.',
    },
    lockingDetail: {
      zh: '铸造磷青铜 H 型布利什滑块在闭锁末瞬沿 45° 斜槽前下沉 5.5 mm，借助青铜/钢异质界面高压摩擦阻滞延缓开膛，随后由枪机斜面抬升解锁。',
      en: 'Cast phosphor-bronze H-piece drops 5.5 mm into 45° receiver ears at battery to delay initial opening before camming upward along 72° bolt slots.',
    },
    feedDetail: {
      zh: '50 发 L 型冲压钢发条大弹鼓：前置折叠钥匙上弦 9 响，中心四翼星轮转子沿双圈阿基米德螺旋轨道旋推 .45 ACP 重弹直达顶颈（兼容 20/30 发直匣）。',
      en: '50-round Type L clockwork drum wound 9 clicks drives a central 4-arm spider rotor along concentric Archimedean spiral tracks (also accepts 20/30-rd stick mags).',
    },
    fireControlDetail: {
      zh: '左侧双独立桨式拨片分别控制 FULL AUTO/SINGLE 与 FIRE/SAFE，枪机内置防早发杠杆惯性击锤。',
      en: 'Twin left-side paddles decouple FULL AUTO/SINGLE from FIRE/SAFE, paired with a bolt-mounted pivoting inertia hammer.',
    },
    signatureAdvantage: {
      zh: '50 发圆鼓超大容弹、28 道散热鳍配卡茨防跳器与重型铣削钢壳造就极其平稳的 .45 ACP 近战火力与传世工艺质感',
      en: '50-round drum capacity, 28 cooling fins, Cutts compensator, and milled steel mass deliver smooth .45 ACP control and unmatched heirloom finish',
    },
    engineeringTradeoff: {
      zh: '整块锻钢立铣与布利什斜槽工时极高且空枪重达 4.9 kg（满鼓逾 7 kg），促使二战后期演化出简化自由枪机 M1A1',
      en: 'Expensive billet machining and 4.9 kg empty mass (over 7 kg with loaded drum) led to the simplified wartime straight-blowback M1A1',
    },
  },
} as const;

export const C1B_SHOWDOWN_PRESETS = [
  {
    id: 'mg42_vs_m249',
    a: 'mg42',
    b: 'm249',
    titleZh: '两代通用机枪对决：MG 42 滚柱 1,200 RPM vs M249 长活塞 S 槽传承',
    titleEn: 'Machine Gun Lineage: MG 42 Twin-Roller 1,200 RPM vs FN M249 SAW',
  },
  {
    id: 'thompson_vs_vector',
    a: 'thompson',
    b: 'vector',
    titleZh: '跨越九十年 .45 ACP 冲锋枪巅峰：汤姆逊布利什圆鼓 vs KRISS Super V',
    titleEn: '90 Years of .45 ACP SMGs: Thompson Blish Drum vs KRISS Vector Super V',
  },
  {
    id: 'thompson_vs_mp5',
    a: 'thompson',
    b: 'mp5',
    titleZh: '延迟闭锁流派碰撞：汤姆逊青铜布利什开膛 vs MP5 滚柱延迟闭膛',
    titleEn: 'Delayed Blowback Duel: Thompson Bronze Blish vs HK MP5 Roller-Delayed',
  },
] as const;

// ============================================================================
// 16. src/features/timeline/historyTimelineSpecs.ts — History Timeline Entries
// ============================================================================
export const C1B_TIMELINE_ENTRIES = [
  {
    weaponId: 'thompson',
    year: 1928,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: [],
    designerZh: '约翰·汤姆逊 & 奥斯卡·佩恩 (Auto-Ordnance)',
    designerEn: 'John T. Thompson & Oscar Payne / Auto-Ordnance',
    innovationZh: '45° 青铜布利什延迟锁、卡茨防跳器与 50 发阿基米德螺旋发条大弹鼓',
    innovationEn:
      '45° bronze Blish delayed lock, 28-fin barrel with Cutts comp & 50-rd clockwork spiral drum',
  },
  {
    weaponId: 'mg42',
    year: 1942,
    lineageId: 'roller_blowback_delayed',
    lane: 2,
    ancestors: ['p08'],
    designerZh: '维尔纳·格鲁纳 (Werner Gruner / Grossfuss)',
    designerEn: 'Werner Gruner / Grossfuss',
    innovationZh: '冷冲压多孔散热护筒、对称双滚柱短后坐 1,200 RPM 与顶盖 S 槽双向供弹',
    innovationEn:
      'Stamped perforated shroud, symmetric twin-roller 1,200 RPM short recoil & S-cam shuttle belt feed',
  },
] as const;

// ============================================================================
// 17. src/features/monograph/dkEditorialData.ts — DK Editorial Loupe Overrides
// ============================================================================
export const C1B_DK_LOUPE_OVERRIDES = {
  mg42: {
    action: {
      title: { zh: '对称双滚柱与击针斜楔核心', en: 'Twin Rollers & Locking Wedge' },
      caption: {
        zh: '双轴承钢滚柱被斜楔外撑死锁于枪管节套承压 390 MPa，短后坐 8.5 mm 后内缩飙出 1,200 RPM。',
        en: 'Twin hardened rollers lock into the barrel extension at 390 MPa, camming inward after 8.5 mm recoil.',
      },
    },
    feed: {
      title: { zh: '顶盖 S 槽双级拨弹与 50 发突击弹鼓', en: 'S-Cam Shuttle & Gurttrommel 34' },
      caption: {
        zh: '后坐半步与复进半步接力拉动 Gurt 34 钢链，配侧挂 50 发野战灰突击弹鼓。',
        en: 'Dual-stage pawls split Gurt 34 belt tension across both strokes from the 50-rd side assault drum.',
      },
    },
  },
  thompson: {
    action: {
      title: { zh: '45° 倾斜轨道与青铜 H 型布利什锁', en: '45° Rails & Bronze Blish Lock' },
      caption: {
        zh: '磷青铜 H 型滑块在闭锁末瞬沿机匣 45° 斜槽下沉 5.5 mm 延迟开膛，配顶置滚花拉机柄。',
        en: 'Cast phosphor-bronze H-piece drops 5.5 mm into 45° receiver tracks beneath the top actuator knob.',
      },
    },
    feed: {
      title: { zh: '50 发 L 型阿基米德螺旋发条大弹鼓', en: '50-Rd Type L Clockwork Drum' },
      caption: {
        zh: '前置折叠钥匙上弦 9 响，驱动四翼星轮转子沿双圈阿基米德螺线推送 .45 ACP 重弹。',
        en: 'Front key winds 9 clicks to power a 4-arm spider rotor along twin Archimedean .45 ACP spiral tracks.',
      },
    },
  },
} as const;

// ============================================================================
// 18. src/i18n/atlasStrings.ts & src/i18n/weaponFallbacks.ts
// ============================================================================
export const C1B_ATLAS_STRINGS_EN = {
  mg42: {
    heading:
      'MG 42 General-Purpose Machine Gun 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      mg42_shroud: {
        title: 'Stamped Perforated Shroud, cra 1943 Rollmarks & AA Spider Sight Suite',
        tabTitle: 'Shroud & Sights',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite for cold-stamped phosphated sheet steel with crisp non-mirrored cra 1943 Berlin rollmarks, cooling vents, and conical muzzle recoil booster.',
        highlights: [
          'AgX-calibrated satin dark phosphate stamped steel with metallic crease wear',
          'Flat non-mirrored Hero UV left flank: MG 42 · cra 1943 · 4812 d · WaA 749',
          'True assembled Cycles contact AO across barrel latch, top cover, and bipod',
        ],
        channels: [
          { note: 'sRGB · Stamped phosphated sheet steel & cra 1943 factory rollmarks' },
          { note: 'Linear · Stamped bend bevels, deeply struck legends & booster knurling' },
          { note: 'Linear · R:Cycles AO / G:Satin phosphate(0.32) / B:Steel metalness(0.88)' },
        ],
      },
      mg42_furniture: {
        title: 'Marbled Bakelite Buttstock, Grip Scales & 50-Rd Gurttrommel 34 Suite',
        tabTitle: 'Bakelite & Drum',
        summary:
          'Rich reddish-brown marbled phenolic Bakelite buttstock and grip panels paired with a Feldgrau painted 50-round Gurttrommel 34 drum featuring white ordnance stencils.',
        highlights: [
          'Dielectric marbled phenolic Bakelite with organic satin sheen (M=0.0, R=0.34–0.46)',
          'Feldgrau Gurttrommel 34 drum with crisp GURTTROMMEL 34 · 50 PATR. 7,92 stencil',
          'High-contrast burnished S-cam feed pawls and stamped feed tray wear tracks',
        ],
        channels: [
          { note: 'sRGB · Marbled phenolic Bakelite & Feldgrau 50-rd drum stencil' },
          { note: 'Linear · Ribbed grip scales, Bakelite pores & drum reinforcing beads' },
          { note: 'Linear · R:Contact AO / G:Bakelite & enamel roughness / B:Dielectric vs steel' },
        ],
      },
      mg42_metal: {
        title: '530mm Barrel, Twin Hardened Locking Rollers & Gurt 34 Brass Belt Suite',
        tabTitle: 'Rollers & Belt',
        summary:
          'Precision internal ordnance suite separating blued CHF barrel, mirror-ground twin locking rollers, and a >=74px UV-firewalled quadrant for C26000 brass 7.92×57mm Mauser belt rounds.',
        highlights: [
          'Mirror-ground high-chrome locking rollers & firing-pin wedge (R=0.15–0.20)',
          '>=74px UV firewall preventing brass/copper color bleed into steel internals',
          'Lathe-turned barrel cooling taper and forged barrel extension micro-detail',
        ],
        channels: [
          { note: 'sRGB · Blued 530mm barrel, chrome rollers & firewalled 7.92mm brass belt' },
          { note: 'Linear · Turning grooves, roller chamfers & Gurt 34 spring-steel links' },
          { note: 'Linear · R:Internal AO / G:Chrome(0.15)–Phosphate(0.32) / B:Pure metal' },
        ],
      },
    },
  },
  thompson: {
    heading:
      'Thompson M1928A1 Submachine Gun 2K 5-Channel Packed ORM Texture Atlas (Albedo / Normal / Roughness)',
    suites: {
      thompson_walnut: {
        title: 'American Black Walnut Vertical Foregrip, Pistol Grip & Detachable Stock',
        tabTitle: 'Walnut Furniture',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM suite for contoured quarter-sawn American black walnut finished in hand-rubbed linseed oil with subtle GEG and WB inspection cartouches.',
        highlights: [
          'Rich cathedral-grain black walnut with warm chestnut linseed-oil sheen',
          'Crisp GEG & WB ordnance cartouche stamps along the right buttstock wrist',
          'Natural wood-pore bump and assembled contact AO against steel slide mounts',
        ],
        channels: [
          { note: 'sRGB · Hand-rubbed American black walnut grain & GEG cartouche' },
          { note: 'Linear · Open wood-pore normal relief & contoured grip bevels' },
          { note: 'Linear · R:Cycles AO / G:Oiled satin walnut(0.36–0.48) / B:Dielectric wood' },
        ],
      },
      thompson_receiver: {
        title: 'Milled Du-Lite Blued Receiver, Bridgeport Rollmarks & Lyman Sight Suite',
        tabTitle: 'Receiver & FCG',
        summary:
          'Solid milled Du-Lite deep blued steel upper and lower receivers carrying razor-sharp flat Hero UV rollmarks for Thompson Submachine Gun Model of 1928A1 and Auto-Ordnance Bridgeport.',
        highlights: [
          'AgX-calibrated pre-war Du-Lite deep blued steel sheen (R=0.25, M=0.90)',
          'Flat non-mirrored Hero UV flanks with Model of 1928A1 & Auto-Ordnance legends',
          'Machined horizontal milling striations across receiver, Lyman sight & paddles',
        ],
        channels: [
          { note: 'sRGB · Du-Lite deep blued steel & silvered factory rollmarks' },
          { note: 'Linear · Horizontal milling grain & deeply struck receiver engravings' },
          { note: 'Linear · R:Contact AO / G:Satin blue(0.25) / B:Forged billet steel(0.90)' },
        ],
      },
      thompson_metal: {
        title: '28-Fin Barrel, Bronze Blish H-Lock & 50-Rd Type L Clockwork Drum Suite',
        tabTitle: 'Blish & Drum',
        summary:
          'Flagship internal and ordnance atlas featuring circular Type L drum Hero stamping plus twin >=80px UV firewalls isolating the cast-bronze Blish H-piece and .45 ACP brass spiral rounds.',
        highlights: [
          'Dedicated >=80px UV firewall for gleaming cast phosphor-bronze Blish H-lock',
          'Circular Hero UV faceplate stamping on the 50-round Type L clockwork drum',
          'Second >=80px UV firewall isolating golden .45 ACP brass & copper spiral rounds',
        ],
        channels: [
          { note: 'sRGB · 28-fin blued barrel, phosphor bronze Blish lock & 50-rd drum rounds' },
          { note: 'Linear · Radial fin turning marks, drum beads & circular stamped legends' },
          { note: 'Linear · R:Internal AO / G:Bronze(0.23)–Steel(0.17–0.27) / B:Metalness' },
        ],
      },
    },
  },
} as const;

// ============================================================================
// 19. src/features/armory/WeaponSilhouetteSvg.tsx — Silhouette SVG Paths
// ============================================================================
export const C1B_SILHOUETTE_PATHS = {
  mg42: 'M 4 36 L 26 28 L 28 24 L 68 24 L 74 20 L 92 20 L 96 24 L 182 25 L 194 23 L 196 29 L 182 31 L 160 31 L 138 38 L 134 36 L 154 30 L 90 31 L 88 46 L 76 46 L 74 34 L 58 34 L 54 48 L 46 47 L 48 34 L 28 34 L 22 44 L 4 42 Z',
  thompson:
    'M 6 42 L 36 30 L 42 25 L 92 24 L 94 21 L 100 21 L 102 24 L 116 25 L 166 25 L 178 24 L 180 28 L 166 30 L 144 30 L 148 44 L 140 45 L 136 30 L 112 31 L 112 48 C 112 56 96 56 96 48 L 96 32 L 72 32 L 66 47 L 56 46 L 60 33 L 38 35 L 26 48 L 6 47 Z',
} as const;

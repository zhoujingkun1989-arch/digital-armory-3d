/**
 * Digital Armory 3D V6.0 — Track C1a Ready-to-Integrate Wave 2 Registry Fragments
 * ==============================================================================
 * Covers TWO legendary exhibits:
 *   - BAY-30: Colt M1911A1 U.S. Army (`.45 ACP`, weaponId: `'m1911'`, category: `'pistol'`)
 *   - BAY-32: Mauser Karabiner 98k (`7.92×57mm Mauser`, weaponId: `'k98k'`, category: `'rifle'`)
 *
 * Wave 2 integrator: Paste each section directly into its corresponding shared registry
 * after adding `'m1911' | 'k98k'` to `WEAPON_IDS` and `'792_mauser'` to `CaliberProfile`
 * in `src/weapons/types.ts` (plus lazy loader entries in `registry.ts` & `geometryLoaders.ts`).
 */

// ============================================================================
// 1. src/weapons/manifests.ts (WEAPON_MANIFESTS entries)
// ============================================================================
export const C1A_MANIFEST_FRAGMENTS = {
  m1911: {
    id: 'm1911',
    orderIndex: 30,
    shortLabel: 'Colt M1911A1',
    caliberProfile: '45_acp',
    atlasHeadingCn:
      '美国柯尔特 M1911A1 军用自动手枪 2K 5-Ch Packed ORM 贴图库 (Albedo / Normal / Packed ORM)',
    catalog: {
      id: 'm1911',
      bayCode: 'BAY-30',
      modelCode: 'COLT M1911A1 U.S. ARMY · .45 ACP GOVERNMENT',
      nameCn: '柯尔特 M1911A1 军用自动手枪',
      subtitleEn: '.45 ACP Single-Link Short-Recoil Service Pistol',
      originCountryCn: '美国',
      weaponTypeCn: '半自动军用手枪',
      category: 'pistol',
      categoryCn: '手枪',
      caliber: '.45 ACP (11.43×23mm)',
      actionMechanism:
        '勃朗宁单绞链偏移枪管短后坐 · 顶部双闭锁筋 · 直推单动火控与三重保险',
      specs1To1: {
        overallLengthMm: '216 mm',
        barrelSpec: '127.8 mm (5.03") · 6左旋 1:406mm',
        emptyWeightKg: '1.105 kg (空枪)',
        muzzleVelocityMs: '255 m/s (230 gr FMJ-RN)',
        effectiveRangeM: '50 m',
        rateOfFire: '半自动 (40–60 发/分实战)',
      },
      assembliesCount: 4,
      partsCount: 24,
      firingStagesCount: 7,
      available: true,
      statusLabel: 'V6.0 典藏 · 可拆解',
      description:
        '约翰·摩西·勃朗宁巅峰传世巨作，1911 年在 6,000 发极限魔鬼耐久考核中以零故障夺魁列装美军并连续服役 74 载：采用两孔中心距仅 7.06 mm（0.278"）的“8”字形单绞链在 3 mm 闭锁短后坐后沿精确圆弧拉降枪管尾部 2.7 mm，令顶部双半圆闭锁筋顺滑脱离磷化锻钢套筒；搭配纯水平直推 U 形扳机框、一簧三用无螺钉三叉板簧、A1 弧背主簧壳与双菱格黑胡桃木护片，铸就现代半自动手枪百年黄金法典。',
      highlights: [
        '勃朗宁 0.278" 单绞链圆弧偏移短后坐 + 5" 枪管顶部双半圆闭锁筋',
        '纯水平直推 U 形扳机框 + 外露宽尾击锤 + 一簧三用三叉弹簧钢片',
        '左置 Condition 1 拇指保险 + 虎口加长尾舌自动握把保险 + 惯性击针',
        '1943 哈特福德军用磷化铭文 + A1 弧背主簧壳与双菱格美洲黑胡桃护片',
      ],
    },
    cameraPresets: {
      armory_showcase: { pos: [9.0, 1.8, 33.0], target: [0.85, -2.8, 0] },
      iso: { pos: [11.5, 7.0, 35.0], target: [0.85, -1.2, 0] },
      right: { pos: [0.85, -1.0, 34.5], target: [0.85, -1.2, 0] },
      left: { pos: [0.85, -1.0, -34.5], target: [0.85, -1.2, 0] },
      top: { pos: [0.85, 37.5, 3.6], target: [0.85, 0, 0] },
      cutaway_focus: { pos: [1.5, 3.0, 15.8], target: [-0.8, 0.8, 0.1] },
      firing_view: { pos: [7.5, 4.0, 32.0], target: [1.4, 0.9, 0] },
    },
    workbenchMeta: {
      badge: 'COLT 1943 · M1911A1 U.S. ARMY',
      title: '柯尔特 M1911A1 (.45 ACP) 3D 拆解与勃朗宁单绞链偏移闭锁演示',
      subtitle:
        '4 大总成 · 24 核心节点 · 单绞链 53° 摆动拉降枪管、双闭锁筋脱锁、直推单动与三叉板簧模拟',
      cutawayLabel: '单绞链闭锁与火控剖视',
      cutawayTitle:
        '切换至合拢透视状态并聚焦勃朗宁单绞链、双顶闭锁筋、直推扳机框与 7 发单排弹匣',
      cutawayFocusPartId: 'm1911_barrel_link',
      searchPlaceholder:
        '搜索零件名 / 编号 (如 单绞链, 枪口衬套, 击锤, 握把保险, U-03)...',
      muzzlePos: [11.6, 2.55, 0],
      chamberGlowPos: [0.25, 2.55, 0],
      scaleProfile: 'pistol',
      gridY: -18.5,
      firingMilestoneLabel: '绞链拉降开锁',
    },
  },
  k98k: {
    id: 'k98k',
    orderIndex: 32,
    shortLabel: 'Karabiner 98k',
    caliberProfile: '792_mauser',
    atlasHeadingCn:
      '德国毛瑟 Karabiner 98k (byf 43) 栓动步枪 2K 5-Ch Packed ORM 贴图库 (Albedo / Normal / Packed ORM)',
    catalog: {
      id: 'k98k',
      bayCode: 'BAY-32',
      modelCode: 'MAUSER KARABINER 98k (byf 43) · 7.92×57mm IS',
      nameCn: '毛瑟 98k 栓动步枪',
      subtitleEn: '7.92×57mm Mauser 98 Controlled-Round Feed Service Carbine',
      originCountryCn: '德国',
      weaponTypeCn: '栓动步枪',
      category: 'rifle',
      categoryCn: '步枪',
      caliber: '7.92×57mm Mauser (8×57 IS)',
      actionMechanism:
        '90° 三突笋旋转后拉枪机（前双主突笋 + 后第三保险突笋）· 全长不旋转抓钩受控供弹 · 5 发黄铜桥夹',
      specs1To1: {
        overallLengthMm: '1,110 mm (标准 600mm 阶梯军用枪管)',
        barrelSpec: '600 mm · 4右旋 1:240mm 阶梯军用枪管',
        emptyWeightKg: '3.92 kg (含层压榉木枪托与通条)',
        muzzleVelocityMs: '760 m/s (198 gr s.S. 重尖船尾弹)',
        effectiveRangeM: '500 m (弧形表尺标定 100–2,000 m)',
        rateOfFire: '15 发/分 (手动桥夹栓动循环)',
      },
      assembliesCount: 4,
      partsCount: 24,
      firingStagesCount: 7,
      available: true,
      statusLabel: 'V6.0 典藏 · 可拆解',
      description:
        '保罗·毛瑟于 1898 年奠基并于 1935 年定型为步骑合一制式短步枪的百年栓动教科书（奥伯恩多夫 byf 43 型）：前双对称主闭锁突笋配后置第三保险突笋构筑 390 MPa 防爆堡垒，全长不旋转毛瑟大抓钩实现倒持亦绝不双进的受控供弹，搭配三档翼形旗式保险、5 发齐平双排桥夹弹仓与带背带穿槽及钢制拆解盘的层压榉木枪托，累计产量逾 1,460 万支。',
      highlights: [
        '前双主突笋 + 后第三保险突笋 · 90° 上抬弯柄开锁与预抽壳',
        '全长不旋转毛瑟大抓钩（rx = 0）· 零双进受控供弹教科书',
        '经典三档翼形旗式机械保险 + 防气倒灌尾套与枪托钢制拆解盘',
        '酚醛热压层压榉木枪托 + 100–2,000m 弧形表尺与 5 发黄铜桥夹',
      ],
    },
    cameraPresets: {
      armory_showcase: { pos: [38, 12, 86], target: [10.5, -1.2, 0] },
      iso: { pos: [32, 16, 78], target: [9.5, -1.0, 0] },
      right: { pos: [10.5, 1.5, 88], target: [10.5, -1.0, 0] },
      left: { pos: [10.5, 1.5, -88], target: [10.5, -1.0, 0] },
      top: { pos: [10.5, 86, 12], target: [10.5, 0, 0] },
      cutaway_focus: { pos: [-1.0, 4.5, 25.5], target: [-1.5, 0.2, 0] },
      firing_view: { pos: [6.0, 5.5, 34.0], target: [1.5, 0.8, 0] },
    },
    workbenchMeta: {
      badge: 'BAY-32 · 7.92×57mm MAUSER',
      title: '毛瑟 Karabiner 98k 三维拆解与受控供弹运动学工作台',
      subtitle:
        '4 大模块 · 24 个 CAD 零件 · 90° 三突笋闭锁、不旋转大抓钩抽壳与 7.92×57mm 实弹仿真',
      cutawayLabel: '毛瑟 98 枪机与大抓钩剖视',
      cutawayTitle:
        '切换纵剖面聚焦三突笋旋转枪机、全长不旋转抓钩抽壳钩、三档旗式保险与 5 发双排内置弹仓',
      cutawayFocusPartId: 'k98k_bolt_body',
      searchPlaceholder:
        '搜索零件名称 / BOM 编号 (例如：抓钩、旗式保险、桥夹、B-03)...',
      muzzlePos: [66.2, 1.5, 0],
      chamberGlowPos: [8.6, 1.5, 0],
      scaleProfile: 'rifle',
      gridY: -12.0,
      firingMilestoneLabel: '90°抬柄开锁',
    },
  },
} as const;

// ============================================================================
// 2. src/engine/geometry/glbAssetService.ts (GLB_WEAPON_CONFIGS entries)
// ============================================================================
export const C1A_GLB_CONFIG_FRAGMENTS = {
  m1911: {
    modelFile: 'm1911.glb',
    dynamicSpringParts: [
      'm1911_recoil_spring',
      'm1911_mainspring',
      'm1911_mag_spring',
    ],
    pbrOverrides: {
      m1911_grip_left: {
        albedoFile: 'm1911_v3_walnut_albedo.webp',
        normalFile: 'm1911_v3_walnut_normal.webp',
        roughnessFile: 'm1911_v3_walnut_roughness.webp',
        normalScale: 0.92,
      },
      m1911_grip_right: {
        albedoFile: 'm1911_v3_walnut_albedo.webp',
        normalFile: 'm1911_v3_walnut_normal.webp',
        roughnessFile: 'm1911_v3_walnut_roughness.webp',
        normalScale: 0.92,
      },
      m1911_slide: {
        albedoFile: 'm1911_v3_slide_albedo.webp',
        normalFile: 'm1911_v3_slide_normal.webp',
        roughnessFile: 'm1911_v3_slide_roughness.webp',
        normalScale: 0.88,
      },
      m1911_frame: {
        albedoFile: 'm1911_v3_slide_albedo.webp',
        normalFile: 'm1911_v3_slide_normal.webp',
        roughnessFile: 'm1911_v3_slide_roughness.webp',
        normalScale: 0.88,
      },
      m1911_mainspring_housing: {
        albedoFile: 'm1911_v3_slide_albedo.webp',
        normalFile: 'm1911_v3_slide_normal.webp',
        roughnessFile: 'm1911_v3_slide_roughness.webp',
        normalScale: 0.88,
      },
      m1911_grip_safety: {
        albedoFile: 'm1911_v3_slide_albedo.webp',
        normalFile: 'm1911_v3_slide_normal.webp',
        roughnessFile: 'm1911_v3_slide_roughness.webp',
        normalScale: 0.88,
      },
      m1911_barrel: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_barrel_link: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_barrel_bushing: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_recoil_plug: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_recoil_guide: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_firing_pin: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_extractor: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_slide_stop: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_thumb_safety: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_hammer: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_trigger: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_sear_disconnector: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_leaf_spring: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_mag_body: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
      m1911_mag_follower: {
        albedoFile: 'm1911_v3_metal_albedo.webp',
        normalFile: 'm1911_v3_metal_normal.webp',
        roughnessFile: 'm1911_v3_metal_roughness.webp',
        normalScale: 0.84,
      },
    },
  },
  k98k: {
    modelFile: 'k98k.glb',
    dynamicSpringParts: [
      'k98k_firing_pin_spring',
      'k98k_sear_spring',
      'k98k_mag_spring',
    ],
    pbrOverrides: {
      // Suite 1: Laminated beechwood stock & upper handguard (2 parts)
      k98k_stock: {
        albedoFile: 'k98k_v3_stock_albedo.webp',
        normalFile: 'k98k_v3_stock_normal.webp',
        roughnessFile: 'k98k_v3_stock_roughness.webp',
        normalScale: 0.92,
      },
      k98k_handguard: {
        albedoFile: 'k98k_v3_stock_albedo.webp',
        normalFile: 'k98k_v3_stock_normal.webp',
        roughnessFile: 'k98k_v3_stock_roughness.webp',
        normalScale: 0.92,
      },
      // Suite 2: Large-ring receiver, bottom metal, buttplate & barrel bands (6 parts)
      k98k_receiver: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      k98k_trigger_guard: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      k98k_mag_floorplate: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      k98k_buttplate: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      k98k_front_band: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      k98k_rear_band: {
        albedoFile: 'k98k_v3_receiver_albedo.webp',
        normalFile: 'k98k_v3_receiver_normal.webp',
        roughnessFile: 'k98k_v3_receiver_roughness.webp',
        normalScale: 0.88,
      },
      // Suite 3: Barrel, sights, cleaning rod, Mauser 98 bolt action, FCG, follower & brass clip (13 parts)
      k98k_barrel: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_front_sight: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_rear_sight: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_cleaning_rod: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_bolt_body: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_claw_extractor: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_bolt_shroud: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_flag_safety: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_firing_pin: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_trigger: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_sear: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_mag_follower: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
      k98k_stripper_clip: {
        albedoFile: 'k98k_v3_metal_albedo.webp',
        normalFile: 'k98k_v3_metal_normal.webp',
        roughnessFile: 'k98k_v3_metal_roughness.webp',
        normalScale: 0.86,
      },
    },
  },
} as const;

// ============================================================================
// 3. src/engine/fieldstrip/fieldStripSpecs.ts (FIELD_STRIP_PLANS entries)
// ============================================================================
export const C1A_FIELD_STRIP_FRAGMENTS = {
  m1911: {
    weaponId: 'm1911',
    manualCodeZh: '美军 FM 23-35 教范 · 五步免工具野战分解',
    manualCodeEn: 'U.S. Army FM 23-35 · 5-Step Toolless Field Strip',
    steps: [
      {
        id: 'm1911_strip_magazine',
        orderLabel: '01',
        titleZh: '按下左侧弹匣释放钮，抽出 7 发 .45 ACP 单排钢弹匣',
        titleEn: 'Depress Magazine Catch & Withdraw 7-Rd .45 ACP Single-Stack Magazine',
        actionHintZh: '点击 7 发单排钢制弹匣总成（M-01/M-02/M-03）安全退出弹匣井。',
        actionHintEn: 'Click the 7-round single-stack magazine assembly to clear the magwell.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '插回 7 发单排弹匣前，必须先装复套筒、枪管与空仓挂机横销（步骤 02–05）！',
        reassembleBlockedNoteEn: 'Reassemble the slide, barrel, and slide-stop pin (Steps 02–05) before inserting the magazine!',
        triggerPartIds: ['m1911_mag_body', 'm1911_mag_follower', 'm1911_mag_spring'],
        bindings: [
          { partId: 'm1911_mag_body', stepIndices: [0, 1] },
          { partId: 'm1911_mag_follower', stepIndices: [0, 1] },
          { partId: 'm1911_mag_spring', stepIndices: [0, 1] },
        ],
      },
      {
        id: 'm1911_strip_bushing_plug',
        orderLabel: '02',
        titleZh: '压入滚花复进簧帽，顺时针旋转枪口衬套 45° 释放复进簧帽',
        titleEn: 'Depress Recoil Plug & Rotate Barrel Bushing 45 deg Clockwise',
        actionHintZh: '点击枪口旋转衬套（U-04）或滚花复进簧帽（U-05）卸除 16 磅复进簧张力。',
        actionHintEn: 'Click the muzzle barrel bushing (U-04) or checkered recoil plug (U-05) to release spring tension.',
        requires: ['m1911_strip_magazine'],
        stripBlockedNoteZh: '军械规范铁律：分解复进簧帽前请务必先卸除 7 发弹匣并验明空膛（步骤 01）！',
        stripBlockedNoteEn: 'Clear and withdraw the 7-round magazine (Step 01) before releasing the recoil plug!',
        reassembleBlockedNoteZh: '锁定枪口衬套与复进簧帽前，请先插回空仓挂机横销穿过单绞链下孔（步骤 03）！',
        reassembleBlockedNoteEn: 'Pin the slide stop through the swinging barrel link (Step 03) before locking the muzzle bushing!',
        triggerPartIds: ['m1911_barrel_bushing', 'm1911_recoil_plug'],
        bindings: [
          { partId: 'm1911_barrel_bushing', stepIndices: [0, 1] },
          { partId: 'm1911_recoil_plug', stepIndices: [0, 1] },
        ],
      },
      {
        id: 'm1911_strip_slide_stop',
        orderLabel: '03',
        titleZh: '对齐套筒半圆拆解缺口，横向推出空仓挂机杆与单绞链横销',
        titleEn: 'Align Slide Takedown Notch & Push Out Slide Stop Cross-Pin',
        actionHintZh: '点击左侧空仓挂机杆（F-02）抽出贯穿底把与单绞链的中心主销。',
        actionHintEn: 'Click the left-side slide stop lever (F-02) to withdraw the barrel-link cross-pin.',
        requires: ['m1911_strip_bushing_plug'],
        stripBlockedNoteZh: '复进簧正强力顶推枪管下耳压紧横销，请先旋开枪口衬套释出复进簧帽（步骤 02）！',
        stripBlockedNoteEn: 'Relieve recoil-spring tension at the bushing and plug (Step 02) before pushing out the slide stop!',
        reassembleBlockedNoteZh: '插入空仓挂机横销前，请先将枪管、单绞链、复进簧与套筒套回底把导轨（步骤 04）！',
        reassembleBlockedNoteEn: 'Mount the barrel, link, recoil spring, and slide onto the frame rails (Step 04) first!',
        triggerPartIds: ['m1911_slide_stop'],
        bindings: [{ partId: 'm1911_slide_stop', stepIndices: [0] }],
      },
      {
        id: 'm1911_strip_slide_barrel',
        orderLabel: '04',
        titleZh: '前推磷化锻钢套筒滑脱底把，取出 16 磅复进簧、导杆、5" 枪管与单绞链',
        titleEn: 'Slide Upper Assembly Forward & Extract Recoil Spring, Guide, 5" Barrel & Link',
        actionHintZh: '点击磷化钢套筒（U-01）、5" 双闭锁筋枪管（U-02）、单绞链（U-03）或复进簧完成上机匣分解。',
        actionHintEn: 'Click the slide (U-01), 5" barrel (U-02), swinging link (U-03), or recoil spring to strip the upper.',
        requires: ['m1911_strip_slide_stop'],
        stripBlockedNoteZh: '空仓挂机横销仍锁定在底把与枪管单绞链之间，请先抽出空仓挂机杆（步骤 03）！',
        stripBlockedNoteEn: 'Push out the slide stop cross-pin (Step 03) before sliding the upper off the frame!',
        reassembleBlockedNoteZh: '套回上套筒总成前，请先复装火控、双菱格胡桃木护片与弧背主簧壳（步骤 05）！',
        reassembleBlockedNoteEn: 'Reassemble the fire control group, walnut grips, and mainspring housing (Step 05) first!',
        triggerPartIds: [
          'm1911_slide',
          'm1911_barrel',
          'm1911_barrel_link',
          'm1911_recoil_spring',
          'm1911_recoil_guide',
          'm1911_firing_pin',
          'm1911_extractor',
        ],
        bindings: [
          { partId: 'm1911_slide', stepIndices: [0, 1] },
          { partId: 'm1911_barrel', stepIndices: [0, 1] },
          { partId: 'm1911_barrel_link', stepIndices: [0, 1] },
          { partId: 'm1911_recoil_spring', stepIndices: [0, 1] },
          { partId: 'm1911_recoil_guide', stepIndices: [0, 1] },
          { partId: 'm1911_firing_pin', stepIndices: [0, 1] },
          { partId: 'm1911_extractor', stepIndices: [0, 1] },
        ],
      },
      {
        id: 'm1911_strip_frame_fcg',
        orderLabel: '05',
        titleZh: '拆解双菱格胡桃木护片、拇指保险、弧背主簧壳、握把保险、三叉板簧与击锤火控',
        titleEn: 'Strip Walnut Grips, Thumb Safety, Arched Housing, Grip Safety & Single-Action FCG',
        actionHintZh: '点击双菱格护片、拇指保险、弧背主簧壳或外露击锤完成底把火控全拆。',
        actionHintEn: 'Click the walnut grips, thumb safety, arched mainspring housing, or spur hammer to strip the FCG.',
        requires: ['m1911_strip_slide_barrel'],
        stripBlockedNoteZh: '细拆下机匣火控组前，请先卸除上套筒与枪管组件（步骤 04）！',
        stripBlockedNoteEn: 'Remove the slide and barrel group (Step 04) before stripping the lower frame fire control!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'm1911_grip_left',
          'm1911_grip_right',
          'm1911_thumb_safety',
          'm1911_mainspring_housing',
          'm1911_grip_safety',
          'm1911_hammer',
          'm1911_trigger',
          'm1911_sear_disconnector',
          'm1911_leaf_spring',
          'm1911_mainspring',
        ],
        bindings: [
          { partId: 'm1911_grip_left', stepIndices: [0] },
          { partId: 'm1911_grip_right', stepIndices: [0] },
          { partId: 'm1911_thumb_safety', stepIndices: [0] },
          { partId: 'm1911_mainspring_housing', stepIndices: [0] },
          { partId: 'm1911_grip_safety', stepIndices: [0] },
          { partId: 'm1911_hammer', stepIndices: [0] },
          { partId: 'm1911_trigger', stepIndices: [0] },
          { partId: 'm1911_sear_disconnector', stepIndices: [0] },
          { partId: 'm1911_leaf_spring', stepIndices: [0] },
          { partId: 'm1911_mainspring', stepIndices: [0] },
        ],
      },
    ],
  },
  k98k: {
    weaponId: 'k98k',
    manualCodeZh: '德国陆军 H.Dv. 240 教范 · 五步毛瑟 98k 野战分解',
    manualCodeEn: 'Wehrmacht H.Dv. 240 Manual · 5-Step Mauser 98k Strip',
    steps: [
      {
        id: 'k98k_strip_clip_bolt',
        orderLabel: '01',
        titleZh: '卸下 5 发黄铜桥夹，竖立旗式保险并向外拨开止动卡笋抽出枪机总成',
        titleEn: 'Clear Brass Clip, Flip Flag Safety Vertical & Withdraw Bolt Assembly',
        actionHintZh:
          '点击 5 发黄铜桥夹、三突笋旋转枪机体、三档旗式保险或枪机尾套，整组向后抽出毛瑟枪机。',
        actionHintEn:
          'Click the brass stripper clip, 3-lug bolt body, flag safety, or bolt shroud to draw the bolt clear.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '回装毛瑟 98 枪机总成与黄铜桥夹前，必须先复装内部击针主簧与长击针（步骤 02）！',
        reassembleBlockedNoteEn:
          'Reassemble the firing pin, mainspring, and claw extractor (Step 02) before sliding in the bolt!',
        triggerPartIds: [
          'k98k_stripper_clip',
          'k98k_bolt_body',
          'k98k_bolt_shroud',
          'k98k_flag_safety',
        ],
        bindings: [
          { partId: 'k98k_stripper_clip', stepIndices: [0] },
          { partId: 'k98k_bolt_body', stepIndices: [0, 1] },
          { partId: 'k98k_bolt_shroud', stepIndices: [0, 1] },
          { partId: 'k98k_flag_safety', stepIndices: [0, 1, 2] },
        ],
      },
      {
        id: 'k98k_strip_striker_claw',
        orderLabel: '02',
        titleZh: '借枪托钢制拆解盘顶压尾铁，拆离长击针、24 圈主簧与不旋转大抓钩',
        titleEn: 'Strip Firing Pin, Mainspring & Non-Rotating Claw Extractor via Stock Disk',
        actionHintZh:
          '点击长击针、击针螺旋主簧或全长不旋转大抓钩抽壳钩，完成毛瑟枪机免工具彻底分解。',
        actionHintEn:
          'Click the firing pin, firing pin mainspring, or claw extractor to strip the bolt sub-assembly.',
        requires: ['k98k_strip_clip_bolt'],
        stripBlockedNoteZh:
          '请先将毛瑟 98 枪机总成从大环机匣内完整抽出（步骤 01），再借拆解盘分解击针与抓钩！',
        stripBlockedNoteEn:
          'Withdraw the Mauser 98 bolt assembly from the receiver (Step 01) before stripping the striker & claw!',
        reassembleBlockedNoteZh:
          '将击针与大抓钩装回枪机前，请先复装下挂通条、前后 H 型枪箍与上护木（步骤 03）！',
        reassembleBlockedNoteEn:
          'Reinstall the cleaning rod, H-bands, and handguard (Step 03) before finalizing the bolt!',
        triggerPartIds: [
          'k98k_firing_pin',
          'k98k_firing_pin_spring',
          'k98k_claw_extractor',
        ],
        bindings: [
          { partId: 'k98k_firing_pin', stepIndices: [0, 1] },
          { partId: 'k98k_firing_pin_spring', stepIndices: [0, 1] },
          { partId: 'k98k_claw_extractor', stepIndices: [0, 1] },
        ],
      },
      {
        id: 'k98k_strip_rod_bands_hg',
        orderLabel: '03',
        titleZh: '旋出下挂钢制通条，按压箍簧前推卸下 H 型前箍、后箍与层压榉木上护木',
        titleEn: 'Unscrew Cleaning Rod & Slide Off H-Band, Rear Band & Upper Handguard',
        actionHintZh:
          '点击下挂通条、H 型前枪箍、后枪箍或层压榉木上护木，暴露 600mm 阶梯枪管全貌。',
        actionHintEn:
          'Click the cleaning rod, front H-band, rear band, or laminated handguard to expose the barrel.',
        requires: ['k98k_strip_striker_claw'],
        stripBlockedNoteZh:
          '遵循 H.Dv. 240 规范，请先安全抽出并分解毛瑟枪机组件（步骤 01–02）再拆卸护木与枪箍！',
        stripBlockedNoteEn:
          'Clear and strip the Mauser bolt assembly (Steps 01–02) before unfastening the barrel bands!',
        reassembleBlockedNoteZh:
          '扣合层压榉木上护木与前后枪箍前，请先将层压榉木主枪托与护圈弹仓框复位（步骤 04–05）！',
        reassembleBlockedNoteEn:
          'Seat the laminated stock and trigger guard magazine box (Steps 04–05) before sliding on the bands!',
        triggerPartIds: [
          'k98k_cleaning_rod',
          'k98k_front_band',
          'k98k_rear_band',
          'k98k_handguard',
        ],
        bindings: [
          { partId: 'k98k_cleaning_rod', stepIndices: [0] },
          { partId: 'k98k_front_band', stepIndices: [0] },
          { partId: 'k98k_rear_band', stepIndices: [0] },
          { partId: 'k98k_handguard', stepIndices: [0] },
        ],
      },
      {
        id: 'k98k_strip_floorplate_stock',
        orderLabel: '04',
        titleZh: '用弹尖顶开弹仓底板取出托弹簧与阶梯托弹板，旋出护圈与层压榉木主枪托',
        titleEn: 'Release Magazine Floorplate, Follower & Spring, Then Drop Trigger Guard & Stock',
        actionHintZh:
          '点击可拆弹仓底板、铣削护圈弹仓框、阶梯托弹板或层压榉木枪托分离木托与弹仓机构。',
        actionHintEn:
          'Click the floorplate, trigger guard, follower, or laminated stock to detach the bottom metal and stock.',
        requires: ['k98k_strip_rod_bands_hg'],
        stripBlockedNoteZh:
          '前后枪箍将层压榉木枪托紧箍在枪管上，请先卸下通条、前后箍与上护木（步骤 03）！',
        stripBlockedNoteEn:
          'Remove the cleaning rod, barrel bands, and handguard (Step 03) before separating the stock!',
        reassembleBlockedNoteZh:
          '装回层压榉木主枪托前，请先确认 600mm 阶梯枪管与两道火扳机阻铁已就位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Ensure the stepped barrel, sights, and two-stage trigger group (Step 05) are installed first!',
        triggerPartIds: [
          'k98k_mag_floorplate',
          'k98k_mag_spring',
          'k98k_mag_follower',
          'k98k_trigger_guard',
          'k98k_stock',
          'k98k_buttplate',
        ],
        bindings: [
          { partId: 'k98k_mag_floorplate', stepIndices: [0, 1] },
          { partId: 'k98k_mag_spring', stepIndices: [0] },
          { partId: 'k98k_mag_follower', stepIndices: [0] },
          { partId: 'k98k_trigger_guard', stepIndices: [0] },
          { partId: 'k98k_stock', stepIndices: [0] },
          { partId: 'k98k_buttplate', stepIndices: [0, 1] },
        ],
      },
      {
        id: 'k98k_strip_barrel_fcg',
        orderLabel: '05',
        titleZh: '分解两道火毛瑟扳机、杠杆阻铁与立式阻铁簧，检视 600mm 阶梯枪管与表尺',
        titleEn: 'Strip Two-Stage Trigger, Sear & Return Spring and Separate Stepped Barrel & Sights',
        actionHintZh:
          '点击两道火扳机、杠杆阻铁、600mm 阶梯枪管或弧形表尺完成军械师级全枪大修拆检。',
        actionHintEn:
          'Click the two-stage trigger, sear, stepped barrel, or tangent sight for full armorer inspection.',
        requires: ['k98k_strip_floorplate_stock'],
        stripBlockedNoteZh:
          '两道火扳机与枪管由层压木托和护圈螺钉包覆固定，请先卸除弹仓底板与木托（步骤 04）！',
        stripBlockedNoteEn:
          'Remove the bottom metal and laminated stock (Step 04) before stripping the trigger and barrel!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'k98k_trigger',
          'k98k_sear',
          'k98k_sear_spring',
          'k98k_barrel',
          'k98k_rear_sight',
          'k98k_front_sight',
        ],
        bindings: [
          { partId: 'k98k_trigger', stepIndices: [0] },
          { partId: 'k98k_sear', stepIndices: [0] },
          { partId: 'k98k_sear_spring', stepIndices: [0] },
          { partId: 'k98k_barrel', stepIndices: [0] },
          { partId: 'k98k_rear_sight', stepIndices: [0, 1] },
          { partId: 'k98k_front_sight', stepIndices: [0, 1] },
        ],
      },
    ],
  },
} as const;

// ============================================================================
// 4. src/engine/malfunctions/malfunctionSpecs.ts (MALFUNCTION_SPECS entries)
// ============================================================================
export const C1A_MALFUNCTION_FRAGMENTS = {
  m1911: {
    weaponId: 'm1911',
    actionPartIds: ['m1911_slide', 'm1911_barrel', 'm1911_barrel_link'],
    lockingPartIds: ['m1911_barrel', 'm1911_barrel_link', 'm1911_slide'],
    extractorPartId: 'm1911_extractor',
    fireControlPartIds: [
      'm1911_hammer',
      'm1911_trigger',
      'm1911_sear_disconnector',
      'm1911_grip_safety',
      'm1911_firing_pin',
    ],
    magazinePartIds: ['m1911_mag_body', 'm1911_mag_follower', 'm1911_mag_spring'],
    magStripOffsetCm: [-2.4, -7.8, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.56,
    doubleFeedF: 0.65,
    rackFullOpenF: 0.57,
    lightStrikeF: 0.145,
    outOfBatteryF: 0.81,
  },
  k98k: {
    weaponId: 'k98k',
    actionPartIds: ['k98k_bolt_body', 'k98k_claw_extractor', 'k98k_bolt_shroud'],
    lockingPartIds: ['k98k_bolt_body', 'k98k_receiver', 'k98k_barrel'],
    extractorPartId: 'k98k_claw_extractor',
    fireControlPartIds: [
      'k98k_trigger',
      'k98k_sear',
      'k98k_firing_pin',
      'k98k_flag_safety',
    ],
    magazinePartIds: [
      'k98k_trigger_guard',
      'k98k_mag_floorplate',
      'k98k_mag_follower',
      'k98k_mag_spring',
      'k98k_stripper_clip',
    ],
    magStripOffsetCm: [0, -7.5, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.62,
    doubleFeedF: 0.72,
    rackFullOpenF: 0.58,
    lightStrikeF: 0.125,
    outOfBatteryF: 0.91,
  },
} as const;

// ============================================================================
// 5. src/engine/caliper/caliperStore.ts (WEAPON_CALIPER_BENCHMARKS entries)
// ============================================================================
export const C1A_CALIPER_FRAGMENTS = {
  m1911: [
    {
      kind: 'overall_envelope',
      labelZh: '柯尔特 M1911A1 全枪水平包络总长',
      labelEn: 'Colt M1911A1 Overall Horizontal Envelope',
      nominalMm: 216,
    },
    {
      kind: 'barrel_length',
      labelZh: '5.03" (127.8mm) .45 ACP 双闭锁筋枪管实长',
      labelEn: '5.03" (127.8mm) .45 ACP Dual-Rib Barrel Span',
      nominalMm: 128,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '勃朗宁 0.278" 单绞链与套筒闭锁行程跨度',
      labelEn: 'Browning 0.278" Swinging Link & Slide Recoil Span',
      nominalMm: 191,
    },
  ],
  k98k: [
    {
      kind: 'overall_envelope',
      labelZh: '毛瑟 Karabiner 98k 全枪包络总长',
      labelEn: 'Mauser Karabiner 98k Overall Length',
      nominalMm: 1110,
    },
    {
      kind: 'barrel_length',
      labelZh: '600 mm 阶梯四膛线军用枪管实长',
      labelEn: '600 mm Stepped 4-Groove Military Barrel Length',
      nominalMm: 600,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '毛瑟 98 三突笋旋转枪机体全长跨度',
      labelEn: 'Mauser 98 3-Lug Rotating Bolt Body Span',
      nominalMm: 143,
    },
  ],
} as const;

// ============================================================================
// 6. src/engine/ballistics/magazineStackSpecs.ts (MAGAZINE_STACK_SPECS entries)
// ============================================================================
export const C1A_MAGAZINE_STACK_FRAGMENTS = {
  m1911: {
    weaponId: 'm1911',
    magBodyPartId: 'm1911_mag_body',
    followerPartId: 'm1911_mag_follower',
    roundCount: 7,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.54, 0.72],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.42,
    // World follower top deck: magLocalY = -3.59 rotated by -18 deg around [-4.65, -3.55]
    followerDeckPlane: {
      point: [-5.76, -6.96, 0],
      normal: [0.309017, 0.951057, 0],
    },
    rakedPistolSlotBuilderArgs: {
      count: 7,
      slot0: [-3.27, 0.68, 0],
      slot0Rz: 0.16,
      magAssembledPos: [-4.65, -3.55],
      gripAngleRad: (-18 * Math.PI) / 180,
      localXCenter: 0.0,
      localYSlot1: 3.2,
      localYBottom: -2.9,
      topBodyRz: 0.12,
      bottomRz: 0.08,
      zHalf: 0.0, // Pure single-stack .45 ACP column!
      firstOddSign: 1,
    },
  },
  k98k: {
    weaponId: 'k98k',
    magBodyPartId: 'k98k_trigger_guard',
    throatPartId: 'k98k_receiver',
    followerPartId: 'k98k_mag_follower',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.62, 0.78],
    replenishWindow: [0.88, 0.96],
    magSubStripStartT: 0.22,
    followerDeckPlane: {
      point: [1.1, -2.75, 0],
      normal: [0, 1, 0],
    },
    buildStraightBoxSlotsArgs: {
      count: 5,
      xCenter: 1.05,
      topY: 0.05,
      bottomY: -2.25,
      topRz: 0.06,
      bottomRz: 0.03,
      zHalf: 0.26,
      firstOddSign: 1,
    },
  },
} as const;

// ============================================================================
// 7. src/engine/materials/engineeringRoles.ts (EXPLICIT_PART_ROLE_OVERRIDES)
// ============================================================================
export const C1A_ENGINEERING_ROLE_OVERRIDES = {
  // Colt M1911A1 U.S. Army (24 parts)
  m1911_barrel: 'locking',
  m1911_barrel_link: 'locking',
  m1911_barrel_bushing: 'locking',
  m1911_slide: 'bolt_carrier',
  m1911_recoil_plug: 'bolt_carrier',
  m1911_recoil_guide: 'bolt_carrier',
  m1911_extractor: 'bolt_carrier',
  m1911_hammer: 'fire_control',
  m1911_trigger: 'fire_control',
  m1911_sear_disconnector: 'fire_control',
  m1911_grip_safety: 'fire_control',
  m1911_thumb_safety: 'fire_control',
  m1911_firing_pin: 'fire_control',
  m1911_recoil_spring: 'energy_spring',
  m1911_mainspring: 'energy_spring',
  m1911_mag_spring: 'energy_spring',
  m1911_leaf_spring: 'energy_spring',
  m1911_frame: 'housing_feed',
  m1911_slide_stop: 'housing_feed',
  m1911_mainspring_housing: 'housing_feed',
  m1911_grip_left: 'housing_feed',
  m1911_grip_right: 'housing_feed',
  m1911_mag_body: 'housing_feed',
  m1911_mag_follower: 'housing_feed',
  // Mauser Karabiner 98k (24 parts)
  k98k_barrel: 'locking',
  k98k_bolt_body: 'locking',
  k98k_claw_extractor: 'bolt_carrier',
  k98k_bolt_shroud: 'bolt_carrier',
  k98k_flag_safety: 'fire_control',
  k98k_firing_pin: 'fire_control',
  k98k_trigger: 'fire_control',
  k98k_sear: 'fire_control',
  k98k_firing_pin_spring: 'energy_spring',
  k98k_sear_spring: 'energy_spring',
  k98k_mag_spring: 'energy_spring',
  k98k_receiver: 'housing_feed',
  k98k_stock: 'housing_feed',
  k98k_handguard: 'housing_feed',
  k98k_front_band: 'housing_feed',
  k98k_rear_band: 'housing_feed',
  k98k_cleaning_rod: 'housing_feed',
  k98k_buttplate: 'housing_feed',
  k98k_front_sight: 'housing_feed',
  k98k_rear_sight: 'housing_feed',
  k98k_trigger_guard: 'housing_feed',
  k98k_mag_follower: 'housing_feed',
  k98k_mag_floorplate: 'housing_feed',
  k98k_stripper_clip: 'housing_feed',
} as const;

export const C1A_ENGINEERING_OPERATING_FLOWS = {
  m1911: {
    weaponId: 'm1911',
    family: 'short_recoil_tilting',
    hasGasTap: false,
    familyTitleZh: '勃朗宁 0.278" 单绞链偏移枪管短后坐 · 顶部双半圆闭锁筋',
    familyTitleEn: 'Browning 0.278" Swinging-Link Short Recoil · Dual Top Locking Ribs',
    flowNoteZh:
      '闭锁状态下 5" 枪管与锻钢套筒随 .45 ACP（145 MPa）燃气反冲同步后坐 3 mm，待弹头离口膛压归零后单绞链绕横销后摆 53° 拉降枪尾 2.7 mm 脱锁，套筒独自完成 45.5 mm 抽抛壳循环。',
    flowNoteEn:
      'Slide and 5" dual-rib barrel recoil locked for 3 mm during .45 ACP (145 MPa) pressure blowdown before the 0.278" swinging link pivots 53 deg to drop the breech 2.7 mm and let the slide complete a 45.5 mm stroke.',
    chamberX: 0.25,
    muzzleX: 11.6,
    boreY: 2.55,
    gasPortX: null,
    gasChannelY: 2.55,
    gasChannelZ: 0,
    gasTargetX: -4.5,
    ventPos: null,
  },
  k98k: {
    weaponId: 'k98k',
    family: 'manual_bolt_action',
    hasGasTap: false,
    familyTitleZh:
      '手动 90° 旋转后拉栓动 · 前双主突笋+第三保险突笋 · 不旋转全长抓钩受控供弹',
    familyTitleEn:
      'Manual 90° Rotating Bolt · Dual Front + Rear Safety Lugs · Non-Rotating Claw Feed',
    flowNoteZh:
      '全闭膛无导气孔设计将 7.92×57mm 390 MPa 峰值膛压 100% 转化为 600mm 阶梯枪管推力（760 m/s）；射毕手抬弯拉机柄 90° 开锁并压缩击针主簧，不旋转大抓钩直拉 110 mm 强制抽壳。',
    flowNoteEn:
      'Sealed 600 mm stepped barrel converts 100% of 390 MPa 7.92x57mm pressure into 760 m/s muzzle velocity; a 90-deg bolt lift unlocks three lugs and cocks the striker while the non-rotating claw extracts 110 mm.',
    chamberX: 8.6,
    muzzleX: 66.2,
    boreY: 1.5,
    gasPortX: null,
    gasChannelY: 1.5,
    gasChannelZ: 0,
    gasTargetX: -0.2,
    ventPos: [66.2, 1.5, 0],
  },
} as const;

// ============================================================================
// 8. src/features/armory/mechanismShowdownSpecs.ts (profiles + presets)
// ============================================================================
export const C1A_MECHANISM_SHOWDOWN_FRAGMENTS = {
  profiles: {
    m1911: {
      id: 'm1911',
      driveFamily: 'short_recoil_barrel',
      lockingFamily: 'tilting_browning',
      feedFamily: 'staggered_box_magazine',
      driveDetail: {
        zh: '全包锻钢套筒与 5" 枪管闭锁共同短后坐 3 mm 待膛压安全下降，随后单绞链将枪管拉停在底把冲击床上，套筒独自后坐 45.5 mm。',
        en: 'Forged slide and 5" barrel recoil locked together 3 mm before the swinging link arrests the barrel on the frame bed while the slide completes a 45.5 mm stroke.',
      },
      lockingDetail: {
        zh: '枪管顶部双半圆闭锁筋死锁套筒顶槽；孔距 7.06 mm 单绞链绕空仓挂机横销向后旋转 53° 拉降枪尾 2.7 mm，仰起 +2.1° 干脆脱锁。',
        en: 'Dual top barrel ribs lock into slide roof mortises until the 0.278" swinging link pivots 53 deg around the slide-stop pin, dropping the breech 2.7 mm.',
      },
      feedDetail: {
        zh: '18° 纤薄握把容纳 7 发 .45 ACP 单排钢弹匣，渐进锥形抱弹唇配合内置管状抽壳钩实现高可靠受控供弹，托弹板中央带勃朗宁防前窜凸点。',
        en: '18 deg slim grip houses a 7-round single-stack .45 ACP steel magazine with progressive controlled-feed lips and Browning dimpled follower.',
      },
      fireControlDetail: {
        zh: '纯水平直线滑动 U 形扳机框驱动单动阻铁与垂直断连器，由一片无螺钉三叉板簧统管三套机构，配 Condition 1 拇指保险与虎口自动握把保险。',
        en: 'Straight-sliding U-stirrup trigger actuates a single-action sear & paddle disconnector powered by one screwless 3-leaf spring with thumb and grip safeties.',
      },
      signatureAdvantage: {
        zh: '6,000 发零故障历史传奇、纯直线“玻璃棒”单动扳机手感与统治百年的套筒偏移闭锁范式',
        en: '6,000-round zero-malfunction pedigree, crisp straight-pull single-action trigger, and the foundational tilting-barrel pistol layout',
      },
      engineeringTradeoff: {
        zh: '单排弹匣容弹量仅 7+1 发，且全锻钢结构 1.1 kg 空重高于现代聚合物双排手枪',
        en: '7+1 single-stack capacity and 1.1 kg all-steel mass trail modern double-stack polymer service pistols',
      },
      fallbackCatalog: {
        bayCode: 'BAY-30',
        modelCode: 'COLT M1911A1 U.S. ARMY · .45 ACP',
        shortLabel: { zh: '柯尔特 M1911A1', en: 'Colt M1911A1' },
        fullName: {
          zh: '美国柯尔特 M1911A1 军用自动手枪',
          en: 'Colt M1911A1 U.S. Army Service Pistol',
        },
        originTag: {
          zh: '美国 · 单绞链军用手枪',
          en: 'United States · Single-Link Service Pistol',
        },
        caliber: { zh: '.45 ACP (11.43×23mm)', en: '.45 ACP (11.43×23mm)' },
        compactCaliber: { zh: '.45 ACP · 230gr', en: '.45 ACP · 230gr' },
        caliberProfileFallback: '45_acp',
        isArchery: false,
        peakLoadValue: 145,
        peakLoadFormatted: { zh: '145 MPa', en: '145 MPa' },
        standardLabel: 'SAAMI',
        muzzleVelocityMps: 255,
        projectileMassG: 14.9,
        overallLengthMm: 216,
        barrelOrStrokeMm: 128,
        emptyWeightKg: 1.105,
        partsCount: 24,
        cyclicRateRpm: null,
        rateOfFireDisplay: { zh: '半自动 (7发单排)', en: 'Semi-Auto (7-Rd Mag)' },
        timing: {
          ignitionF: 0.16,
          peakF: 0.22,
          muzzleExitF: 0.29,
          unlockF: 0.34,
          ejectF: 0.49,
          batteryF: 0.87,
          gasPortF: null,
        },
      },
    },
    k98k: {
      id: 'k98k',
      driveFamily: 'manual_bolt_or_revolver_linkage',
      lockingFamily: 'rotating_lug_bolt',
      feedFamily: 'staggered_box_magazine',
      driveDetail: {
        zh: '手动 90° 上抬下弯球头拉机柄同步完成开锁、3.5 mm 螺旋预抽壳与顶回击针待击，再直拉 110 mm 完成抽抛壳与推弹闭锁。',
        en: 'Manual 90-degree lift of the bent bolt handle unlocks three lugs, generates 3.5 mm cammed primary extraction, and cocks the striker before a 110 mm linear extraction stroke.',
      },
      lockingDetail: {
        zh: '前端双对称大面积闭锁主突笋锁入 Ø35.8mm 大环锻钢机匣，辅以后根部第三保险突笋与多层泄气孔防炸膛。',
        en: 'Massive symmetrical dual front locking lugs seat into the 35.8 mm large-ring forged receiver, reinforced by a rear third safety lug and multi-stage gas venting.',
      },
      feedDetail: {
        zh: '与木托下缘齐平的 5 发双排交错内置钢制弹仓，支持后桥 5 发黄铜桥夹单指压装，由全长不旋转大抓钩全程受控供弹。',
        en: 'Flush 5-round staggered internal steel magazine top-loaded via 5-round brass stripper clips and positively controlled from mag lips to chamber by the non-rotating claw extractor.',
      },
      fireControlDetail: {
        zh: '三零件极简双支点两道火军用扳机 + 杠杆阻铁，尾套顶置直锁击针的三档翼形旗式机械保险。',
        en: 'Three-part twin-fulcrum two-stage military trigger and pivoting sear paired with Paul Mauser’s direct-striker three-position wing flag safety on the bolt shroud.',
      },
      signatureAdvantage: {
        zh: '全长不旋转大抓钩受控供弹 + 三突笋防爆泄气 + 免工具拆解盘，缔造统治全球 125 年的栓动步枪工业标准',
        en: 'Non-rotating claw controlled-round feed, triple-lug gas safety, and tool-less takedown disk established the 125-year global standard for bolt-action rifles',
      },
      engineeringTradeoff: {
        zh: '手动 90° 抬栓射速（15 发/分）显著低于半自动步枪，且早期竖直旗式保险与低置光学瞄准镜存在空间干涉',
        en: 'Manual 90-degree bolt cycling (~15 rpm) lags semi-auto firepower, and the tall vertical flag safety interferes with low-mounted optical scopes',
      },
      fallbackCatalog: {
        bayCode: 'BAY-32',
        modelCode: 'MAUSER KARABINER 98k (byf 43) · 7.92×57mm IS',
        shortLabel: { zh: '毛瑟 Karabiner 98k', en: 'Karabiner 98k' },
        fullName: {
          zh: '德国毛瑟 Karabiner 98k 栓动步枪',
          en: 'Mauser Karabiner 98k Bolt-Action Rifle',
        },
        originTag: {
          zh: '德国 · 三突笋受控供弹栓动',
          en: 'Germany · 3-Lug Controlled-Feed Bolt Action',
        },
        caliber: { zh: '7.92×57mm Mauser (8×57 IS)', en: '7.92×57mm Mauser (8×57 IS)' },
        compactCaliber: { zh: '7.92×57mm · 198gr', en: '7.92×57mm · 198gr' },
        caliberProfileFallback: '792_mauser',
        isArchery: false,
        peakLoadValue: 390,
        peakLoadFormatted: { zh: '390 MPa', en: '390 MPa' },
        standardLabel: 'CIP',
        muzzleVelocityMps: 760,
        projectileMassG: 12.8,
        overallLengthMm: 1110,
        barrelOrStrokeMm: 600,
        emptyWeightKg: 3.92,
        partsCount: 24,
        cyclicRateRpm: null,
        rateOfFireDisplay: { zh: '手动栓动 (15发/分)', en: 'Manual Bolt (15 rpm)' },
        timing: {
          ignitionF: 0.14,
          peakF: 0.19,
          muzzleExitF: 0.26,
          unlockF: 0.35,
          ejectF: 0.61,
          batteryF: 0.96,
          gasPortF: null,
        },
      },
    },
  },
  presets: [
    {
      id: 'm1911_vs_p08',
      weaponA: 'm1911',
      weaponB: 'p08',
      pillLabel: {
        zh: '柯尔特 M1911A1 单绞链 vs 鲁格 P08 肘节',
        en: 'Colt M1911A1 Link vs Luger P08 Toggle',
      },
      headline: {
        zh: '两次世界大战王牌手枪世纪对决：美国 .45 ACP 单绞链套筒 vs 德国 9mm 双连杆屈膝肘节',
        en: 'World Wars Sidearm Clash: U.S. .45 ACP Swinging Link vs German 9mm Knee-Joint Toggle',
      },
      verdict: {
        zh: '两款诞生于二十世纪初的军用手枪走了截然相反的机械道路：鲁格 P08 以精密钟表般的过死点屈膝肘节与 55° 握把缔造 9×19mm 传奇；柯尔特 M1911A1 则凭借全包防尘套筒与 0.278" 单绞链在 6,000 发泥沙酷刑中零故障封神，并最终塑造了整个现代自动手枪工业！',
        en: 'Two iconic early-1900s sidearms took opposite kinematic paths: the Luger P08 paired watchmaker toggle links with a 55-deg grip to pioneer 9x19mm, while the M1911A1 paired an enclosing dust-proof slide with a 0.278" swinging link to survive 6,000 rounds unscathed and define modern pistols.',
      },
    },
    {
      id: 'm1911_vs_g17',
      weaponA: 'm1911',
      weaponB: 'g17',
      pillLabel: {
        zh: 'M1911A1 单绞链全钢 vs Glock 17 无绞链聚合物',
        en: 'M1911A1 Steel Link vs Glock 17 Linkless',
      },
      headline: {
        zh: '跨越七十年的勃朗宁闭锁传承：1911 锻钢单绞链单动 vs 1982 聚合物开式凸轮平移击针',
        en: '70 Years of Browning Lockup: 1911 Forged Swinging Link vs 1982 Polymer Linkless Cam',
      },
      verdict: {
        zh: '加斯顿·格洛克将勃朗宁的双顶筋简化为直接卡入抛壳窗的方形膛室、以固定斜坡取代了单绞链，并以聚合物底把将容弹量翻倍至 17 发；但 M1911A1 凭借纯直线滑动单动扳机与沉稳锻钢配重，至今仍稳居手枪击发手感的至高殿堂！',
        en: 'Gaston Glock streamlined Browning’s ribs into a squared ejection-port lock, replaced the swinging link with an open cam ramp, and doubled capacity to 17 rounds—yet the M1911A1’s linear single-action trigger remains the gold standard of handgun feel.',
      },
    },
    {
      id: 'k98k_vs_garand',
      weaponA: 'k98k',
      weaponB: 'garand',
      pillLabel: {
        zh: '毛瑟 98k 三突笋桥夹 vs M1 加兰德导气漏夹',
        en: 'Mauser K98k Bolt vs M1 Garand Gas',
      },
      headline: {
        zh: '二战步兵制式主战步枪终极交锋：德国 7.92mm 手动受控栓动 vs 美国 .30-06 八发半自动导气',
        en: 'WWII Service Rifle Clash: German 7.92mm Mauser 98 Bolt vs U.S. .30-06 Semi-Auto Garand',
      },
      verdict: {
        zh: '毛瑟 Karabiner 98k 将 1898 年三突笋防爆闭锁与全长不旋转大抓钩受控供弹推向机械可靠性巅峰；M1 加兰德则以膛口长行程导气活塞与 8 发弹夹漏夹赋予美军步兵压倒性半自动火力密度——前者铸就百年民用与狙击栓动标准，后者宣告自动装填时代不可逆转地降临！',
        en: 'The Mauser K98k perfected triple-lug safety and non-rotating claw controlled feeding into the benchmark bolt action, whereas the M1 Garand harnessed muzzle gas and 8-round en-bloc clips to deliver overwhelming semi-automatic squad firepower.',
      },
    },
    {
      id: 'k98k_vs_awm',
      weaponA: 'k98k',
      weaponB: 'awm',
      pillLabel: {
        zh: '毛瑟 K98k 90° 受控栓动 vs AWM 60° 现代狙击',
        en: 'Mauser K98k 90° CRF vs AWM 60° Modern Bolt',
      },
      headline: {
        zh: '跨越一个世纪的旋转栓动进化：1898 90° 双前突笋+不旋转大抓钩 vs 1996 60° 六突笋推弹供弹',
        en: 'A Century of Bolt-Action Evolution: 1898 90° Claw CRF vs 1996 60° 6-Lug Push Feed',
      },
      verdict: {
        zh: '从 90° 双主突笋加后第三保险突笋的不旋转抓钩，演进至 60° 短抬行程六突笋与铝合金底盘可拆弹匣，毛瑟 98 奠定的前突笋闭锁与受控泄气基因仍深深镌刻在每一支现代远程高精度狙击步枪之中。',
        en: 'From 90-deg twin front lugs and a full-length claw extractor to 60-deg 6-lug chassis repeaters, Paul Mauser’s front-locking, gas-vented architecture remains the DNA of modern precision rifles.',
      },
    },
  ],
} as const;

// ============================================================================
// 9. src/features/timeline/historyTimelineSpecs.ts (HISTORY_TIMELINE_NODES)
// ============================================================================
export const C1A_HISTORY_TIMELINE_NODES = [
  {
    weaponId: 'm1911',
    year: 1911,
    lineageId: 'toggle_short_recoil',
    lane: 0,
    ancestors: ['p08'],
    designerZh: '约翰·摩西·勃朗宁 (John M. Browning)',
    designerEn: 'John Moses Browning (Colt)',
    innovationZh:
      '0.278" 单绞链偏移枪管闭锁、纯直推单动扳机框与一簧三用三叉钢板簧，奠定现代手枪百年范式',
    innovationEn:
      '0.278" swinging barrel link, straight-pull single-action stirrup trigger & screwless 3-leaf sear spring',
  },
  {
    weaponId: 'k98k',
    year: 1935,
    lineageId: 'manual_revolver_lever',
    lane: 3,
    ancestors: ['winchester1894'],
    designerZh: '保罗·毛瑟 / 奥伯恩多夫毛瑟工厂',
    designerEn: 'Paul Mauser / Mauser-Werke Oberndorf',
    innovationZh:
      '90° 前双主突笋加第三保险突笋 + 全长不旋转抓钩受控供弹 + 三档翼形旗式保险与层压榉木枪托',
    innovationEn:
      '90° dual front + rear safety lugs, non-rotating claw controlled-round feed, 3-position wing flag safety & laminated beech stock',
  },
] as const;

// ============================================================================
// 10. src/features/monograph/dkEditorialData.ts (timelines + loupe overrides)
// ============================================================================
export const C1A_DK_EDITORIAL_FRAGMENTS = {
  evolutionTimelines: {
    m1911: [
      {
        year: '1900',
        name: { zh: '柯尔特 M1900 (.38 ACP)', en: 'Colt Model 1900 (.38 ACP)' },
        subtitle: { zh: '勃朗宁前后双绞链平行下沉鼻祖', en: 'Browning Dual-Link Parallel Drop Ancestor' },
        eraRelation: 'ancestor',
      },
      {
        year: '1910',
        name: { zh: '柯尔特 M1910 试制型', en: 'Colt Model 1910 Trials Prototype' },
        subtitle: { zh: '首创单绞链与 18° 握把倾角原型', en: 'First Single-Link & 18-Deg Grip Prototype' },
        eraRelation: 'predecessor',
      },
      {
        year: '1911/1924',
        name: { zh: 'Colt M1911A1 U.S. Army', en: 'Colt M1911A1 U.S. Army' },
        subtitle: { zh: '单绞链 .45 ACP 百年军用手枪法典', en: 'Swinging-Link .45 ACP Centennial Standard' },
        eraRelation: 'current',
      },
      {
        year: '1908',
        name: { zh: '鲁格 Luger P08', en: 'DWM Luger P08' },
        subtitle: { zh: '同代德军 9mm 屈膝肘节劲敌', en: 'Contemporary 9mm Toggle-Lock Rival' },
        eraRelation: 'rival',
      },
      {
        year: '1935',
        name: { zh: '勃朗宁 Hi-Power (P-35)', en: 'Browning Hi-Power (GP-35)' },
        subtitle: { zh: '无绞链斜坡闭锁与双排弹匣直系演进', en: 'Linkless Cam Ramp & Double-Stack Evolution' },
        eraRelation: 'successor',
      },
    ],
    k98k: [
      {
        year: '1893',
        name: { zh: '西班牙毛瑟 Model 1893', en: 'Spanish Mauser Model 1893' },
        subtitle: {
          zh: '双排齐平内置弹仓与全长不旋转抓钩雏形',
          en: 'Flush Staggered Magazine & Claw Extractor Pioneer',
        },
        eraRelation: 'ancestor',
      },
      {
        year: '1898',
        name: { zh: '德意志 Gewehr 98', en: 'German Gewehr 98' },
        subtitle: {
          zh: '保罗·毛瑟三突笋闭锁与立体泄气定型母本',
          en: 'Paul Mauser 3-Lug Lock & Gas-Vent Archetype',
        },
        eraRelation: 'predecessor',
      },
      {
        year: '1935',
        name: { zh: 'Mauser Karabiner 98k', en: 'Mauser Karabiner 98k' },
        subtitle: {
          zh: '600mm 阶梯管 · 下弯拉机柄 · 层压榉木短步枪',
          en: '600mm Stepped Barrel · Bent Handle · Laminated Stock',
        },
        eraRelation: 'current',
      },
      {
        year: '1936',
        name: { zh: '美国 M1 加兰德步枪', en: 'U.S. M1 Garand Rifle' },
        subtitle: {
          zh: '8 发半自动导气漏夹同代战场宿敌',
          en: '8-Rd Semi-Auto Gas-Operated En-Bloc Rival',
        },
        eraRelation: 'rival',
      },
      {
        year: '1990s',
        name: { zh: '现代 M98 定制猎枪与 AWM', en: 'Modern M98 Safari & Precision Rifles' },
        subtitle: {
          zh: '延续毛瑟三突笋受控供弹基因的百年传奇',
          en: 'Modern Controlled-Feed Actions Descended from M98',
        },
        eraRelation: 'successor',
      },
    ],
  },
  breechLoupeOverrides: {
    m1911: {
      title: { zh: '0.278" 单绞链与双顶闭锁筋', en: '0.278" Link & Dual Top Ribs' },
      caption: {
        zh: '3 mm 共同短后坐后单绞链绕横销后摆 53°，拉降枪管尾部 2.7 mm 脱离套筒顶槽。',
        en: 'After 3 mm locked dwell, the swinging link pivots 53 deg to drop the breech 2.7 mm out of lock.',
      },
    },
    k98k: {
      title: { zh: '前双+后三突笋与不旋转抓钩', en: '3-Lug Bolt & Claw Extractor' },
      caption: {
        zh: '90° 上抬下弯球头柄解锁三突笋并顶回击针，全长不旋转抓钩稳锁底缘实现受控供弹。',
        en: '90-deg bent handle unlocks three lugs and cocks the striker while the non-rotating claw maintains full rim control.',
      },
    },
  },
  fcgLoupeOverrides: {
    m1911: {
      title: { zh: '直推单动扳机与三叉板簧', en: 'Straight Trigger & 3-Leaf Spring' },
      caption: {
        zh: 'U 形扳机框纯水平直拉 4.2 mm 击发，一片无螺钉三叉弹簧同步驱动阻铁、断连器与握把保险。',
        en: 'Linear U-bow slides 4.2 mm rearward while one screwless 3-leaf spring powers sear, disconnector & grip safety.',
      },
    },
    k98k: {
      title: { zh: '三档翼形旗式保险与两道火', en: '3-Pos Flag Safety & 2-Stage' },
      caption: {
        zh: '尾套顶置三档旗式保险直锁击针尾铁，配合双支点两道火极简三件式军用扳机。',
        en: 'Shroud-mounted 3-position flag safety cams directly onto the striker nut above a twin-fulcrum two-stage trigger.',
      },
    },
  },
  magLoupeOverrides: {
    m1911: {
      title: { zh: '7 发双色单排匣与凸点托板', en: '7-Rd Two-Tone Mag & Dimple' },
      caption: {
        zh: '13.8 mm 纤薄单排钢匣采用双色热处理抱弹唇，托弹板中央勃朗宁凸点杜绝末发惯性前窜。',
        en: '13.8 mm two-tone single-stack steel mag with progressive feed lips and Browning dimpled follower.',
      },
    },
    k98k: {
      title: { zh: '5 发齐平双排仓与黄铜桥夹', en: 'Flush 5-Rd Box & Brass Clip' },
      caption: {
        zh: '5 发黄铜桥夹插立于 C 形后桥导槽单指压装，阶梯托弹板打空自动顶起拦栓示警。',
        en: '5-round brass stripper clip feeds the flush staggered box while the stepped follower locks the bolt back when empty.',
      },
    },
  },
} as const;

// ============================================================================
// 11. src/i18n/atlasStrings.ts (ALL_ATLAS_EN_STRINGS entries)
// ============================================================================
export const C1A_ATLAS_EN_STRINGS = {
  m1911: {
    heading:
      'Colt M1911A1 U.S. Army (.45 ACP) 2K 5-Ch Packed ORM Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      m1911_walnut: {
        title: 'Double-Diamond 20-LPI Checkered American Walnut Grip Atlas',
        tabTitle: 'Walnut Grips',
        summary:
          'Offline Cycles-baked 2K 5-channel ORM atlas for both grip panels featuring crisp pyramidal double-diamond checkering, linseed-oiled walnut pores, and UV-firewalled brass slotted screws.',
        highlights: [
          'Dedicated Hero UV outer faces with deep 20-LPI double-diamond checkering',
          'Warm linseed-oiled American walnut grain & hand-worn border bevels',
          'Zero-bleed UV firewall separating brass grip screws from wood',
        ],
        channels: [
          { note: 'sRGB · Oiled American walnut & double-diamond ridge highlights' },
          { note: 'Linear · Pyramidal checkering valleys & slotted screw normals' },
          { note: 'Linear · R:Cycles AO / G:Walnut sheen(0.36-0.72) / B:Metalness' },
        ],
      },
      m1911_slide: {
        title: '1943 Hartford Parkerized Slide, Forged Frame & U.S. Army Rollmarks',
        tabTitle: 'Slide & Frame',
        summary:
          'Wartime manganese-phosphate Parkerized ordnance steel 2K ORM suite with non-mirrored flat Hero UV rollmarks for Browning patents, Colt Hartford address, UNITED STATES PROPERTY & G.H.D. cartouche.',
        highlights: [
          'AgX-calibrated matte manganese-phosphate steel (sRGB 0.22-0.27, zero black crush)',
          'Razor-sharp Hero UV rollmarks on all four slide and frame flanks',
          'Sculpted rear cocking serrations & A1 arched mainspring housing AO',
        ],
        channels: [
          { note: 'sRGB · 1943 Parkerized ordnance gray steel & bright stamped markings' },
          { note: 'Linear · Deep engraved rollmark recesses & crystalline phosphate grain' },
          { note: 'Linear · R:Contact AO / G:Parkerized satin(0.35) / B:Metalness' },
        ],
      },
      m1911_metal: {
        title: '5" Dual-Rib Barrel, Swinging Link, Fire Control & Two-Tone Magazine',
        tabTitle: 'Barrel & Action',
        summary:
          '2K ORM metal atlas uniting the polished chamber hood (COLT .45 AUTO), swinging link, blued controls, straight trigger bow, and classic WWII two-tone tempered 7-round magazine.',
        highlights: [
          'Chamber top Hero UV stamped COLT .45 AUTO / P PROOF TESTED',
          '>= 80px UV firewall separating bright stainless/polished parts from blued steel',
          'Authentic two-tone heat-treated feed lips on the 7-round single-stack mag',
        ],
        channels: [
          { note: 'sRGB · Polished stainless barrel/link vs deep blued steel controls' },
          { note: 'Linear · Lathe machining marks, rifling lands & chamber rollmark' },
          { note: 'Linear · R:AO / G:Polished(0.18)-Blued(0.27) / B:Metalness(0.90-0.96)' },
        ],
      },
      m1911_seamless_springs: {
        title: 'Three Dynamic Music-Wire Helical Springs Micro-Surface Map',
        tabTitle: 'Helical Springs',
        summary:
          'Shared 512x512 seamless steel wire detail textures driving the real-time GPU-compressed 16-lb recoil spring, 23-lb hammer mainspring, and 7-round single-stack mag spring.',
        highlights: [
          'Preserves real-time aSpringParam helical deformation on all 3 springs',
          'Fine drawn high-carbon wire sheen and protective oil film variation',
        ],
        channels: [
          { note: 'Linear · Seamless drawn steel wire micro-normal' },
          { note: 'Linear · Protective oil film roughness variation' },
        ],
      },
    },
  },
  k98k: {
    heading:
      'Mauser Karabiner 98k (byf 43) 2K 5-Ch Packed ORM Atlas (Albedo / Normal / Packed ORM)',
    suites: {
      k98k_stock: {
        title: 'Laminated Beechwood Stock (Schichtholz) & Upper Handguard Suite',
        tabTitle: 'Laminated Beechwood',
        summary:
          'Cycles-baked 2K 5-channel Packed ORM atlas for wartime phenolic-bonded laminated beechwood furniture: crisp alternating horizontal veneer layers, buttstock sling cutout edge wear, inset steel takedown disk isolation, and satin military lacquer roughness.',
        highlights: [
          'Authentic alternating light/dark horizontal laminated beechwood plies',
          'Buttstock sling pass-through slot, steel takedown disk & recoil cross-bolt AO',
          'Satin military protective oil roughness (0.44-0.62) & fine beech ray pores',
        ],
        channels: [
          { note: 'sRGB · Phenolic laminated beechwood layers & right-flank ordnance cartouche' },
          { note: 'Linear · Laminate seam micro-relief, wood pores & chamfered inletting normals' },
          { note: 'Linear · R:Cycles AO / G:Satin wood roughness / B:Isolated steel disk metalness' },
        ],
      },
      k98k_receiver: {
        title: 'Oberndorf byf 43 Large-Ring Receiver, Bottom Metal & Barrel Bands Suite',
        tabTitle: 'byf 43 Receiver',
        summary:
          'AgX-calibrated deep German blued steel 2K Packed ORM suite featuring distortion-free Hero UV engravings: left rail Mod. 98, front receiver ring byf 43, serial 6842 b, and WaA135 inspection stamps alongside H-band and cupped buttplate edge wear.',
        highlights: [
          'AgX-calibrated deep German blued steel (sRGB 0.19-0.28, R = 0.28-0.36)',
          '1:1 non-mirrored Mod. 98, byf 43, 6842 b & WaA135 Oberndorf rollmarks',
          'Milled trigger guard, H-pattern front bayonet band & cupped steel buttplate',
        ],
        channels: [
          { note: 'sRGB · Deep German blued receiver, parkerized bands & crisp factory markings' },
          { note: 'Linear · Milled machining grain, stamped rollmark depth & bevel normals' },
          { note: 'Linear · R:Contact AO / G:Satin blued steel (0.25-0.38) / B:High metalness' },
        ],
      },
      k98k_metal: {
        title: '600mm Stepped Barrel, 2000m Tangent Sight, Bright Bolt & Brass Clip Suite',
        tabTitle: 'Barrel, Bolt & Clip',
        summary:
          'Multi-material 2K Packed ORM atlas spanning the stepped 600 mm barrel, 1-20 graduated tangent rear sight leaf, ground bright Mauser 98 bolt body, spring-tempered blue claw extractor, and UV-firewalled 5-round brass stripper clip.',
        highlights: [
          'Crisp 1-20 hundred-meter tangent sight leaf graduations on positive-Jacobian UV band',
          'Bright polished bolt steel vs deep blued spring-steel claw extractor contrast',
          'Dedicated >=70px UV firewall isolating the 5-round brass stripper clip with zero bleed',
        ],
        channels: [
          { note: 'sRGB · Stepped blued barrel, graduated sight leaf, bright bolt & brass clip' },
          { note: 'Linear · Engraved 1-20 sight numerals, lathe grain & bolt-lug chamfers' },
          { note: 'Linear · Bright steel (0.19) vs brass clip (0.23) vs German blued (0.29)' },
        ],
      },
      k98k_seamless_springs: {
        title: 'Three Dynamic Helical Music-Wire Springs Seamless Detail Suite',
        tabTitle: 'Dynamic Springs',
        summary:
          'Seamless 512x512 brushed music-wire normal and oiled roughness maps shared by the 24-coil firing pin mainspring, vertical sear return spring, and internal 5-round magazine spring.',
        highlights: [
          'Preserves GPU constant-wire-diameter compression via aSpringParam (w = 1)',
          'High-frequency drawn spring-wire micro-grain & protective military gun oil film',
        ],
        channels: [
          { note: 'Linear · Drawn music-wire micro-normal for all 3 dynamic helical springs' },
          { note: 'Linear · Oiled spring-steel roughness variation' },
        ],
      },
    },
  },
} as const;

// ============================================================================
// 12. src/i18n/weaponFallbacks.ts (WEAPON_EN_FALLBACKS & walnut helper IDs)
// ============================================================================
export const C1A_WEAPON_FALLBACK_FRAGMENTS = {
  enFallbacks: {
    m1911: {
      shortLabel: 'Colt M1911A1',
      name: 'Colt M1911A1 U.S. Army Pistol',
      originCountry: 'United States',
      weaponType: 'Service Pistol',
      statusLabel: 'V6.0 Flagship · Ready',
      caliber: '.45 ACP (11.43×23mm)',
      compactCaliber: '.45 ACP · 230gr FMJ',
      actionMechanism:
        'Browning Single-Link Tilting-Barrel Short Recoil · Dual Top Ribs · Straight Single-Action',
      overallLengthMm: '216 mm (5.03" Government Model)',
      barrelSpec: '127.8 mm (5.03" 6-LH 1:16" Rifled Barrel)',
      weightKg: '1.105 kg (Empty)',
      muzzleVelocityMs: '255 m/s (.45 ACP 230 gr FMJ-RN)',
      effectiveRangeM: '50 m',
      rateOfFire: 'Semi-Automatic (40–60 rpm Practical)',
      description:
        'John Moses Browning’s immortal 1911 service pistol (1943 Hartford wartime M1911A1): following a 6,000-round zero-malfunction trial victory, it served frontline U.S. troops for 74 years. A 0.278-inch figure-eight swinging barrel link pulls the dual-rib 5-inch barrel down 2.7 mm after 3 mm of locked recoil, paired with a straight-sliding stirrup trigger, screwless three-leaf sear spring, Condition 1 thumb safety, automatic tang grip safety, arched mainspring housing, and double-diamond walnut grips.',
      highlights: [
        'Browning 0.278" Swinging Barrel Link & Dual Top Radial Locking Ribs',
        'Straight-Sliding Stirrup Trigger, Spur Hammer & Screwless 3-Leaf Spring',
        'Frame Thumb Safety, Automatic Tang Grip Safety & Inertia Firing Pin',
        '1943 Hartford Parkerized Rollmarks, Arched Backstrap & Walnut Grips',
      ],
      workbenchTitle: 'Colt M1911A1 (.45 ACP) 3D Teardown & Swinging-Link Cycle',
      workbenchSubtitle:
        '4 Assemblies · 24 CAD Parts · Single-Link Drop, Dual Locking Ribs & Linear Trigger',
      cutawayLabel: 'Swinging Link & Fire Control Cutaway',
      cutawayTitle:
        'Switch to cutaway view and frame the 0.278" swinging barrel link, dual top ribs, straight stirrup trigger & 7-round single-stack magazine',
      searchPlaceholder:
        'Search module / BOM code (e.g. barrel link, bushing, hammer, grip safety, U-03)...',
      firingMilestoneLabel: 'Swinging-Link Unlock',
    },
    k98k: {
      shortLabel: 'Karabiner 98k',
      name: 'Mauser Karabiner 98k Bolt-Action Rifle',
      originCountry: 'Germany',
      weaponType: 'Bolt-Action Rifle',
      statusLabel: 'V6.0 Flagship · Ready',
      caliber: '7.92×57mm Mauser (8×57 IS)',
      compactCaliber: '7.92×57mm · 198gr',
      actionMechanism:
        '90° 3-Lug Rotating Bolt · Non-Rotating Claw Extractor · 5-Rd Stripper Clip',
      overallLengthMm: '1,110 mm (600 mm Stepped Barrel)',
      barrelSpec: '600 mm · 4-RH 1:240mm Stepped Military Barrel',
      weightKg: '3.92 kg (Unloaded)',
      muzzleVelocityMs: '760 m/s (198 gr s.S. Spitzer)',
      effectiveRangeM: '500 m (Sight Graduated 100–2,000 m)',
      rateOfFire: '15 rpm (Manual Stripper-Clip Bolt)',
      description:
        'Paul Mauser’s immortal Model 98 perfected into the 1935 Karabiner 98 kurz (byf 43 Oberndorf): 600 mm stepped 4-groove barrel, large-ring forged receiver with dual front lugs plus third rear safety lug, non-rotating full-length claw extractor for controlled-round feeding, 3-position wing flag safety, laminated beechwood stock with sling slot and steel takedown disk, and 5-round brass stripper clips.',
      highlights: [
        '90° 3-Lug Mauser 98 Rotating Bolt & Bent Handle',
        'Non-Rotating Full-Length Claw Controlled Feed',
        '3-Position Wing Flag Safety & Stock Takedown Disk',
        'Laminated Beechwood Stock & 5-Rd Brass Clip',
      ],
      workbenchTitle: 'Mauser Karabiner 98k 3D Bolt Kinematics & Disassembly',
      workbenchSubtitle:
        '4 Assemblies · 24 CAD Parts · 90° 3-Lug Lockup, Claw Extractor & 7.92×57mm Cycle',
      cutawayLabel: 'Mauser 98 Bolt & Claw Focus',
      cutawayTitle:
        'Switch to cutaway and frame the 3-lug rotating bolt, non-rotating claw extractor & 3-position flag safety',
      searchPlaceholder:
        'Search part name / BOM code (e.g. claw extractor, flag safety, B-03)...',
      firingMilestoneLabel: '90° Bolt Lift',
    },
  },
  extraWalnutHardwoodPartIds: [
    'm1911_grip_left',
    'm1911_grip_right',
    'k98k_stock',
    'k98k_handguard',
  ],
} as const;

// ============================================================================
// 13. src/features/armory/WeaponSilhouetteSvg.tsx (180x86 SVG card paths)
// ============================================================================
export const C1A_SILHOUETTE_SVG_SPECS = {
  m1911: {
    viewBox: '0 0 180 86',
    comment: 'Colt M1911A1 Government Model (.45 ACP): rounded slide, spur hammer, beavertail grip safety, 18-deg walnut grip, arched backstrap & closed trigger guard',
    elements: [
      { tag: 'rect', x: 34, y: 15, width: 112, height: 15, rx: 2, fillRole: 'parkerized' }, // Slide
      { tag: 'polygon', points: '139,15 143,15 141.5,11.5 138.5,15', fillRole: 'blued' }, // Front sight
      { tag: 'rect', x: 40, y: 12, width: 5, height: 3, rx: 0.6, fillRole: 'blued' }, // Rear sight
      { tag: 'rect', x: 74, y: 15, width: 22, height: 6.5, rx: 1, fillRole: 'polished' }, // Ejection port & chamber hood
      { tag: 'path', d: 'M34 22 L27 17 L29 14 L36 19 Z', fillRole: 'blued' }, // Exposed spur hammer
      { tag: 'path', d: 'M34 30 L122 30 L122 37 L96 37 L96 50 L74 50 L60 76 L32 74 L43 39 L30 33 Z', fillRole: 'parkerized' }, // Frame + dust cover + 18-deg grip
      { tag: 'path', d: 'M76 37 L92 37 L92 46 L76 46 Z', fillRole: 'cutout' }, // Closed trigger guard cutout
      { tag: 'rect', x: 77, y: 38, width: 5, height: 7, rx: 1, fillRole: 'blued' }, // Short straight-pull trigger
      { tag: 'path', d: 'M44 41 L64 41 L54 71 L36 70 Z', fillRole: 'walnut' }, // Double-diamond walnut grip
      { tag: 'path', d: 'M35 42 Q30 57 32 73 L36 73 Q34 57 39 42 Z', fillRole: 'blued' }, // Arched M1911A1 mainspring housing
    ],
  },
  k98k: {
    viewBox: '0 0 180 86',
    comment: 'Mauser Karabiner 98k (7.92x57mm): laminated beech stock w/ sling slot & takedown disk, cupped buttplate, stepped 600mm barrel, H-band bayonet lug, bent bolt handle, flag safety & 5-rd brass clip',
    jsxSnippet: `
      case 'k98k': {
        const laminate = available ? '#8a5c36' : subFill;
        const lamStripe = available ? '#5c381c' : fill;
        const blued = available ? '#2b3444' : fill;
        const bright = available ? '#c4cedb' : accent;
        const brass = available ? '#d6a944' : accent;
        return (
          <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
            <path d="M8 42 L44 39 L53 38 L142 36 L142 41 L92 46 L68 47 L58 51 L51 49 L9 61 Z" fill={laminate} stroke={stroke} strokeWidth="1.2" strokeLinejoin="round" />
            <path d="M12 46 L48 43 M11 51 L54 47 M10 56 L40 52 M80 41 L138 39" stroke={lamStripe} strokeWidth="0.9" opacity="0.7" />
            <path d="M6.5 41.5 L10.5 41.5 L11.5 61.2 L7.2 61.4 Z" fill={blued} stroke={stroke} strokeWidth="1.05" />
            <rect x="16" y="46.5" width="7" height="4.2" rx="1" fill="rgba(10,14,20,0.65)" stroke={stroke} strokeWidth="0.85" />
            <circle cx="29" cy="48.8" r="2.4" fill={blued} stroke={stroke} strokeWidth="0.9" />
            <path d="M86 33.5 L141 34 L141 37 L86 37.5 Z" fill={laminate} stroke={stroke} strokeWidth="1.0" />
            <rect x="82" y="34.2" width="91" height="3.4" rx="0.7" fill={blued} stroke={stroke} strokeWidth="1.15" />
            <line x1="138" y1="39.5" x2="165" y2="39.5" stroke={blued} strokeWidth="1.1" />
            <circle cx="168.5" cy="32.2" r="2.2" fill="none" stroke={stroke} strokeWidth="1.1" />
            <path d="M139 33 L145 33 L145 41.5 L154 41.5 L154 43.3 L139 43.3 Z" fill={blued} stroke={stroke} strokeWidth="1.0" />
            <rect x="114" y="33.2" width="3.6" height="8.6" rx="0.5" fill={blued} stroke={stroke} strokeWidth="0.95" />
            <path d="M91 31.8 L103 32.8 L103 34.8 L91 34.8 Z" fill={blued} stroke={stroke} strokeWidth="0.95" />
            <rect x="57" y="33" width="27" height="8.5" rx="1.2" fill={blued} stroke={stroke} strokeWidth="1.25" />
            <path d="M57 46 L68 46 Q67 53 60 53 Q56 52 57 46 Z" fill="none" stroke={stroke} strokeWidth="1.25" />
            <rect x="54" y="34.2" width="24" height="3.6" rx="1" fill={bright} stroke={stroke} strokeWidth="0.95" />
            <path d="M61 36.5 L59.5 43.5" stroke={bright} strokeWidth="2.0" strokeLinecap="round" />
            <circle cx="59.2" cy="44.2" r="2.1" fill={bright} stroke={stroke} strokeWidth="0.85" />
            <path d="M55 34 L52.5 29.8 L56.5 30.2 L57.5 34 Z" fill={bright} stroke={stroke} strokeWidth="0.8" />
            <rect x="64.5" y="22.5" width="3.4" height="10.8" rx="0.6" fill={brass} stroke={stroke} strokeWidth="0.9" />
          </svg>
        );
      }
    `,
  },
} as const;

// ============================================================================
// 14. src/engine/canvas/turntableStageMetrics.ts (WEAPON_TURNTABLE_BOUNDS)
// ============================================================================
export const C1A_TURNTABLE_STAGE_METRICS = {
  m1911: {
    cx: 0.86,
    minY: -9.7,
    maxY: 4.07,
    spanX: 21.48,
    explode58: { cx: 1.98, minY: -21.14, maxY: 12.55, spanX: 35.26 },
  },
  k98k: {
    cx: 10.68,
    minY: -11.4,
    maxY: 8.05,
    spanX: 111.05,
    explode58: { cx: 21.76, minY: -33.75, maxY: 26.63, spanX: 153.49 },
  },
} as const;

// ============================================================================
// 15. src/engine/interaction/InteractiveActionController.tsx
// ============================================================================
export const C1A_INTERACTIVE_ACTION_FRAGMENTS = {
  selectorCapabilities: {
    m1911: ['safe', 'semi'] as const,
    k98k: ['safe', 'semi'] as const,
  },
  fireControlProfiles: {
    m1911: {
      weaponId: 'm1911',
      supportedModes: ['safe', 'semi'] as const,
      mechanismSummaryZh:
        '左置 Condition 1 拇指保险 + 虎口自动握把保险 + 纯直推单动扳机与单发断连器',
      mechanismSummaryEn:
        'Condition 1 Frame Thumb Safety + Automatic Tang Grip Safety + Straight Single-Action Disconnector',
      modes: {
        safe: {
          mode: 'safe',
          code: 'SAFE',
          labelZh: '待击上锁保险 (SAFE)',
          labelEn: 'THUMB & GRIP SAFE',
          tooltipZh:
            '击锤满待击时上挑拇指保险同步死锁阻铁与套筒，未握实枪柄时自动握把保险内舌物理阻断直推扳机框。',
          tooltipEn:
            'Upward thumb safety locks both sear and slide in Condition 1 while the unpressed grip safety blocks the trigger bow.',
        },
        semi: {
          mode: 'semi',
          code: 'FIRE',
          labelZh: '单动半自动击发 (SEMI)',
          labelEn: 'SINGLE-ACTION SEMI',
          tooltipZh:
            '握实压入握把保险并下拨拇指保险：直推扳机后移 4.2 mm 干脆释放击锤，后坐套筒压下断连器强制单发复位。',
          tooltipEn:
            'Depressing the grip safety and sweeping thumb safety down yields a crisp 4.2 mm straight single-action break with slide disconnector reset.',
        },
      },
    },
    k98k: {
      weaponId: 'k98k',
      supportedModes: ['safe', 'semi'] as const,
      mechanismSummaryZh:
        '毛瑟三档翼形旗式尾套保险 + 双支点两道火军用扳机 + 90° 手动三突笋栓动',
      mechanismSummaryEn:
        'Mauser 3-Position Shroud Wing Flag Safety + Twin-Fulcrum Two-Stage Trigger + 90° Bolt',
      modes: {
        safe: {
          mode: 'safe',
          code: 'SAFE',
          labelZh: '旗式保险右翻/竖立 (SAFE)',
          labelEn: 'FLAG SAFETY LOCKED',
          tooltipZh:
            '翼形旗式保险竖直立起挡住瞄准线并顶退击针（可安全拉栓退弹与拆机），右翻 180° 则同时死锁击针与旋转枪机。',
          tooltipEn:
            'Vertical flag retracts the striker off the sear while permitting safe unloading; flipped right locks both striker and bolt solid.',
        },
        semi: {
          mode: 'semi',
          code: 'FIRE',
          labelZh: '旗式保险左放单发 (FIRE)',
          labelEn: 'BOLT SINGLE SHOT',
          tooltipZh:
            '翼形旗式保险向左放平解锁击针，扣过两道火硬墙击发 7.92×57mm 重尖弹，随后手抬弯拉机柄 90° 开锁并直拉 110 mm 抽抛壳。',
          tooltipEn:
            'Flag folded left frees the striker for two-stage ignition of 7.92×57mm, followed by a 90° bolt lift and 110 mm manual extraction.',
        },
      },
    },
  },
  explicitActionParts: {
    m1911: ['m1911_slide', 'm1911_barrel', 'm1911_barrel_link'],
    k98k: ['k98k_bolt_body', 'k98k_claw_extractor', 'k98k_bolt_shroud'],
  },
  // In rackProgressToFiringProgress:
  //   if (weaponId === 'm1911') return 0.30 + r * 0.27;
  //   if (weaponId === 'k98k') return 0.35 + r * 0.29; (maps r∈[0..1] across 90° bolt lift + 11cm draw!)
  rackProgressWindows: {
    m1911: { startF: 0.3, spanF: 0.27 },
    k98k: { startF: 0.35, spanF: 0.29 },
  },
} as const;

// ============================================================================
// 16. src/engine/actors/BallisticsSystem.tsx (WEAPON_ROUND_FIT & MUZZLE_JET_SPECS)
// ============================================================================
export const C1A_BALLISTICS_SYSTEM_FRAGMENTS = {
  weaponRoundFit: {
    m1911: { roundScale: 0.96, magLocalShiftX: -0.32, ignitionF: 0.16 },
    k98k: { roundScale: 1.25, magLocalShiftX: -0.3, ignitionF: 0.14 },
  },
  muzzleJetSpecs: {
    // Colt M1911A1 5.03" .45 ACP bare crowned muzzle
    m1911: { kind: 'bare', forwardDamp: 1, jets: [] },
    // Mauser Karabiner 98k 600mm bare stepped muzzle
    k98k: { kind: 'bare', forwardDamp: 1, jets: [] },
  },
  caliberVisualSpec_792_mauser: {
    caseColor: '#dca82d',
    reserveCaseColor: '#b5871f',
    bulletColor: '#bd4c19',
    primerColor: '#e2e8f0',
    bulletLocalOffset: 1.48,
    reserveTiltZ: 0.05,
    flashScaleMult: 1.44,
    streakThickness: 0.23,
  },
  build792MauserGeometriesCode: `
function build792MauserGeometries(): CaliberGeometryBundle {
  const pocket: PrimerPocketSpec = {
    xHead: -1.42,
    rPocket: 0.148,
    pocketDepth: 0.095,
  };
  const casePts: THREE.Vector2[] = [
    new THREE.Vector2(0, -1.325),
    new THREE.Vector2(0.148, -1.325),
    new THREE.Vector2(0.148, -1.408),
    new THREE.Vector2(0.162, -1.42),
    new THREE.Vector2(0.292, -1.42),
    new THREE.Vector2(0.31, -1.4),
    new THREE.Vector2(0.31, -1.33),
    new THREE.Vector2(0.258, -1.298),
    new THREE.Vector2(0.258, -1.21),
    new THREE.Vector2(0.308, -1.16),
    new THREE.Vector2(0.285, 0.78),
    new THREE.Vector2(0.214, 1.06),
    new THREE.Vector2(0.212, 1.42),
    new THREE.Vector2(0.194, 1.42),
    new THREE.Vector2(0.194, 1.02),
    new THREE.Vector2(0, 1.02),
  ];
  const bulletPts: THREE.Vector2[] = [
    new THREE.Vector2(0, -0.44),
    new THREE.Vector2(0.155, -0.44),
    new THREE.Vector2(0.194, -0.32),
    new THREE.Vector2(0.194, 0.14),
    new THREE.Vector2(0.165, 0.44),
    new THREE.Vector2(0.108, 0.7),
    new THREE.Vector2(0.044, 0.88),
    new THREE.Vector2(0.014, 0.94),
    new THREE.Vector2(0, 0.95),
  ];
  return {
    caseGeo: finalizeLathe(casePts, 26),
    bulletGeo: finalizeLathe(bulletPts, 24),
    ...buildBoxerPrimerGeometries(pocket),
    xHead: pocket.xHead,
  };
}
`,
} as const;

// ============================================================================
// 17. BONUS Wave 2 Helpers: 792_mauser CIP Physics, Cutaway & External Ballistics
//     (Note: m1911 reuses existing `45_acp` caliber profile!)
// ============================================================================
export const C1A_CALIBER_792_MAUSER_SPEC = {
  armoryPhysics: {
    id: '792_mauser',
    designation: '7.92×57mm Mauser (8×57 IS)',
    standard: 'CIP',
    peakPressureMpa: 390,
    muzzleVelocityMs: 760,
    bulletMassGrams: 12.8,
    muzzleEnergyJ: 3697,
    barrelLengthMm: 600,
    recoilImpulseNs: 10.9,
    ignitionF: 0.14,
    peakF: 0.19,
    muzzleExitF: 0.26,
    safeUnlockPressureMpa: 35,
  },
  cartridgeCutaway: {
    id: '792_mauser',
    nameZh: '7.92×57mm 毛瑟步枪弹 (s.S. 重尖弹)',
    nameEn: '7.92×57mm Mauser (8×57 IS s.S.)',
    caseLengthMm: 57.0,
    overallLengthMm: 82.0,
    bulletDiameterMm: 8.22,
    rimDiameterMm: 11.95,
    baseDiameterMm: 11.91,
    shoulderAngleDeg: 19.13,
    chargeGrains: 47.0,
    bulletMassGrains: 198,
    muzzleVelocityMs: 760,
    muzzleEnergyJ: 3697,
    peakPressureMpa: 390,
    featuredWeapons: ['k98k', 'mg42'],
  },
  externalBallisticsRK4: {
    id: '792_mauser',
    category: 'rifle',
    nameZh: '7.92×57mm Mauser · 198gr s.S. 船尾重尖弹',
    nameEn: '7.92×57mm Mauser · 198gr s.S. Boat-Tail Spitzer',
    dragModel: 'G7',
    bc: 0.285,
    bcG1: 0.562,
    muzzleVelocityMs: 760,
    massGrams: 12.8,
    sightHeightCm: 4.0,
    zeroRangeM: 100,
  },
} as const;

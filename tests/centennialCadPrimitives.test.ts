import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CURVATURE_ATTRIBUTE,
  SPRING_AXIS_MODE_FLEX,
  SPRING_AXIS_MODE_X,
  SPRING_AXIS_MODE_Y,
  SPRING_PARAM_ATTRIBUTE,
} from '../src/engine/geometry/csgBuilder';
import {
  type ArcheryPartKind,
  type ArcheryStyle,
  applyMetricBoxUVs,
  type BarrelMuzzleStyle,
  type BoltCarrierStyle,
  buildArcheryGeo,
  buildBeveledProfile,
  buildBoltAndCarrierGeo,
  buildChamferedReceiverGeo,
  buildChamferedSlab,
  buildDynamicHelicalSpringGeo,
  buildHandguardGeo,
  buildHeavyArmorHullAndTurretGeo,
  buildMagazineGeo,
  buildOpticAndSightGeo,
  buildRotaryAndArtilleryGeo,
  buildSteppedBarrelGeo,
  buildStockAndGripGeo,
  CENTENNIAL_FINISH_COLORS,
  type CentennialFinishPaletteName,
  type HandguardStyle,
  type HeavyArmorPartKind,
  type HeavyArmorStyle,
  type HeavyArmorVariant,
  type MagazineStyle,
  type OpticSightStyle,
  type RotaryArtilleryPartKind,
  type StockGripStyle,
} from '../src/weapons/expansion/centennialCadPrimitives';

function expectValidMuseumGeometry(
  geo: THREE.BufferGeometry,
  label: string,
  expectSpringMode?: number
): void {
  expect(geo.index, `${label}: must be non-indexed`).toBeNull();

  const pos = geo.getAttribute('position') as THREE.BufferAttribute;
  const norm = geo.getAttribute('normal') as THREE.BufferAttribute;
  const uv = geo.getAttribute('uv') as THREE.BufferAttribute;
  const color = geo.getAttribute('color') as THREE.BufferAttribute;
  const curv = geo.getAttribute(CURVATURE_ATTRIBUTE) as THREE.BufferAttribute;

  expect(pos, `${label}: position missing`).toBeDefined();
  expect(norm, `${label}: normal missing`).toBeDefined();
  expect(uv, `${label}: uv missing`).toBeDefined();
  expect(color, `${label}: color missing`).toBeDefined();
  expect(curv, `${label}: aCurvature missing`).toBeDefined();

  expect(pos.itemSize).toBe(3);
  expect(norm.itemSize).toBe(3);
  expect(uv.itemSize).toBe(2);
  expect(color.itemSize).toBe(3);
  expect(curv.itemSize).toBe(1);

  expect(pos.count, `${label}: must have non-zero triangles`).toBeGreaterThanOrEqual(12);
  expect(pos.count % 3, `${label}: vertex count divisible by 3`).toBe(0);
  expect(norm.count).toBe(pos.count);
  expect(uv.count).toBe(pos.count);
  expect(color.count).toBe(pos.count);
  expect(curv.count).toBe(pos.count);

  const checkFinite = (attr: THREE.BufferAttribute, name: string) => {
    const arr = attr.array as ArrayLike<number>;
    for (let i = 0; i < arr.length; i++) {
      if (!Number.isFinite(arr[i])) {
        throw new Error(`${label} ${name}[${i}] is non-finite (${arr[i]})`);
      }
    }
  };
  checkFinite(pos, 'position');
  checkFinite(norm, 'normal');
  checkFinite(uv, 'uv');
  checkFinite(color, 'color');
  checkFinite(curv, 'aCurvature');

  // Unit-length normals
  for (let i = 0; i < norm.count; i++) {
    const len = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
    expect(Math.abs(len - 1), `${label}: normal[${i}] len=${len}`).toBeLessThan(1e-3);
  }

  // Signed curvature in [-1, 1]
  for (let i = 0; i < curv.count; i++) {
    const c = curv.getX(i);
    expect(c).toBeGreaterThanOrEqual(-1.0001);
    expect(c).toBeLessThanOrEqual(1.0001);
  }

  // Non-degenerate positive bounding box & finite bounding sphere
  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  expect(geo.boundingBox, `${label}: boundingBox missing`).not.toBeNull();
  expect(geo.boundingSphere, `${label}: boundingSphere missing`).not.toBeNull();
  const size = new THREE.Vector3();
  geo.boundingBox!.getSize(size);
  expect(size.x, `${label}: bbox dx > 0`).toBeGreaterThan(0);
  expect(size.y, `${label}: bbox dy > 0`).toBeGreaterThan(0);
  expect(size.z, `${label}: bbox dz > 0`).toBeGreaterThan(0);
  expect(Number.isFinite(geo.boundingSphere!.radius)).toBe(true);
  expect(geo.boundingSphere!.radius).toBeGreaterThan(0);

  if (expectSpringMode !== undefined) {
    const sp = geo.getAttribute(SPRING_PARAM_ATTRIBUTE) as THREE.BufferAttribute;
    expect(sp, `${label}: aSpringParam missing`).toBeDefined();
    expect(sp.itemSize).toBe(4);
    expect(sp.count).toBe(pos.count);
    checkFinite(sp, SPRING_PARAM_ATTRIBUTE);

    let modeHits = 0;
    let maxMag = 0;
    for (let i = 0; i < sp.count; i++) {
      if (Math.abs(sp.getW(i) - expectSpringMode) < 1e-4) {
        modeHits++;
        maxMag = Math.max(
          maxMag,
          Math.hypot(sp.getX(i), sp.getY(i), sp.getZ(i))
        );
      }
    }
    expect(modeHits, `${label}: expected aSpringParam mode ${expectSpringMode}`).toBe(pos.count);
    expect(maxMag, `${label}: expected non-zero spring/flex parameters`).toBeGreaterThan(0);
  }

  geo.dispose();
}

describe('Centennial Parametric CAD Primitives Library (Phase 1B)', () => {
  it('defines all 15 AgX-calibrated finish palettes with valid hex colors', () => {
    const expectedPalettes: CentennialFinishPaletteName[] = [
      'blued_steel',
      'parkerized',
      'stainless',
      'fde',
      'od_green',
      'bakelite_ak',
      'walnut_classic',
      'tactical_black',
      'desert_carc',
      'nato_camo',
      'russian_green',
      'wwii_soviet',
      'titanium_matte',
      'yew_wood',
      'carbon_camo',
    ];
    expect(Object.keys(CENTENNIAL_FINISH_COLORS).sort()).toEqual(
      [...expectedPalettes].sort()
    );
    const hexRe = /^#[0-9a-f]{6}$/i;
    for (const key of expectedPalettes) {
      const palette = CENTENNIAL_FINISH_COLORS[key];
      for (const slot of [
        'primary',
        'secondary',
        'accent',
        'furniture',
        'barrel',
        'bolt',
        'brass',
        'optic',
      ] as const) {
        expect(palette[slot], `${key}.${slot}`).toMatch(hexRe);
        // Guard against crushed pure black under AgX
        expect(palette[slot].toLowerCase()).not.toBe('#000000');
      }
    }
  });

  it('builds valid chamfered receivers across rail, rounded-crown, and magwell variants', () => {
    const p = CENTENNIAL_FINISH_COLORS.parkerized;
    expectValidMuseumGeometry(
      buildChamferedReceiverGeo(24, 5.2, 3.6, p.primary, {
        topRail: true,
        magwellCollar: true,
        ejectionPort: true,
      }),
      'receiver:tactical-rail'
    );
    expectValidMuseumGeometry(
      buildChamferedReceiverGeo(20, 4.4, 3.2, p.primary, {
        topRail: false,
        magwellCollar: false,
        roundedTop: true,
        ejectionPort: true,
      }),
      'receiver:rounded-top'
    );
  });

  it('builds valid multi-stepped lathe barrels across all 8 muzzle & feature variants', () => {
    const p = CENTENNIAL_FINISH_COLORS.tactical_black;
    const muzzleStyles: BarrelMuzzleStyle[] = [
      'bare',
      'flash_hider',
      'brake',
      'suppressor',
      'shroud',
      'rotary_clamp',
      'tank_evacuator',
      'artillery_brake',
    ];
    for (const muzzleStyle of muzzleStyles) {
      expectValidMuseumGeometry(
        buildSteppedBarrelGeo(44, 1.35, 0.85, p.barrel, {
          flutes: muzzleStyle === 'brake',
          coolingFins: muzzleStyle === 'shroud',
          frontSightTower: muzzleStyle === 'flash_hider',
          gasBlock: muzzleStyle === 'flash_hider' || muzzleStyle === 'suppressor',
          muzzleStyle,
        }),
        `barrel:${muzzleStyle}`
      );
    }
  });

  it('builds valid machined bolts, carriers, pistol slides (incl. open-top Beretta 92) & fluted 6-chamber revolver cylinders', () => {
    const p = CENTENNIAL_FINISH_COLORS.blued_steel;
    const styles: BoltCarrierStyle[] = [
      'rotating',
      'straight_pull',
      'slide',
      'slide_open_top',
      'falling_block',
      'revolver_cylinder',
    ];
    for (const style of styles) {
      expectValidMuseumGeometry(
        buildBoltAndCarrierGeo(14, 1.1, p.bolt, style),
        `bolt:${style}`
      );
    }
  });

  it('builds valid sculpted handguards across all 6 architectural styles', () => {
    const p = CENTENNIAL_FINISH_COLORS.walnut_classic;
    const styles: HandguardStyle[] = [
      'ventilated_tube',
      'quad_rail',
      'ribbed_historical',
      'triangular_retro',
      'walnut_forend',
      'polymer_bullpup',
    ];
    for (const style of styles) {
      expectValidMuseumGeometry(
        buildHandguardGeo(24, 4.4, 3.8, p.furniture, style),
        `handguard:${style}`
      );
    }
  });

  it('builds valid buttstocks & grips across all 15 styles (incl. PPSh-41 one-piece & M16A1 fixed)', () => {
    const p = CENTENNIAL_FINISH_COLORS.walnut_classic;
    const styles: StockGripStyle[] = [
      'walnut_rifle',
      'straight_walnut',
      'ppsh_one_piece',
      'm16a1_fixed',
      'dragunov_thumbhole',
      'spas12_top_fold',
      'folding_skeleton',
      'telescoping_ar',
      'bullpup_stock',
      'crossbow_thumbhole',
      'pistol_grip',
      'lever_loop',
      'broomhandle_grip',
      'plowhandle_grip',
      'spade_grips',
    ];
    for (const style of styles) {
      expectValidMuseumGeometry(
        buildStockAndGripGeo(22, 11, 3.8, p.furniture, style),
        `stockGrip:${style}`
      );
    }
  });

  it('builds valid magazines across all 8 feeding styles (banana, box, 71-drum, 47-pan, 64-helical, belt tray, tubular, top clip)', () => {
    const p = CENTENNIAL_FINISH_COLORS.bakelite_ak;
    const styles: MagazineStyle[] = [
      'curved_banana',
      'straight_box',
      'drum_71',
      'pan_47',
      'helical_64',
      'belt_tray',
      'tubular',
      'top_clip',
    ];
    for (const style of styles) {
      expectValidMuseumGeometry(
        buildMagazineGeo(style, 18, 6.4, 2.5, p.furniture),
        `magazine:${style}`
      );
    }
  });

  it('builds valid optics & sights across all 4 styles (tactical scope, PSO-1, carry handle, folding tangent)', () => {
    const p = CENTENNIAL_FINISH_COLORS.tactical_black;
    const styles: OpticSightStyle[] = [
      'tactical_scope',
      'pso1_soviet',
      'carry_handle',
      'folding_tangent',
    ];
    for (const style of styles) {
      expectValidMuseumGeometry(
        buildOpticAndSightGeo(style, 26, p.primary),
        `optic:${style}`
      );
    }
  });

  it('builds valid 1:1 Main Battle Tank armor assemblies across all 6 partKinds and all 4 MBT variants (T-90M, Challenger 2, Merkava 4M, T-34-85)', () => {
    const partKinds: HeavyArmorPartKind[] = [
      'hull',
      'turret',
      'era_skirts',
      'suspension_tracks',
      'engine_block',
      'autoloader',
    ];
    const variants: Array<{ style: HeavyArmorStyle; variant: HeavyArmorVariant; hex: string }> = [
      { style: 'mbt_modern', variant: 't90m', hex: CENTENNIAL_FINISH_COLORS.russian_green.primary },
      { style: 'mbt_modern', variant: 'challenger2', hex: CENTENNIAL_FINISH_COLORS.nato_camo.primary },
      { style: 'mbt_modern', variant: 'merkava4', hex: CENTENNIAL_FINISH_COLORS.desert_carc.primary },
      { style: 'mbt_wwii', variant: 't34_85', hex: CENTENNIAL_FINISH_COLORS.wwii_soviet.primary },
    ];
    for (const { style, variant, hex } of variants) {
      for (const kind of partKinds) {
        expectValidMuseumGeometry(
          buildHeavyArmorHullAndTurretGeo(kind, 100, hex, style, variant),
          `armor:${variant}:${kind}`
        );
      }
    }
  });

  it('builds valid rotary autocannon & artillery assemblies (M61 Vulcan, Bofors 40mm, M777A2, breech)', () => {
    const p = CENTENNIAL_FINISH_COLORS.titanium_matte;
    const partKinds: RotaryArtilleryPartKind[] = [
      'vulcan_barrels',
      'bofors_carriage',
      'm777_carriage',
      'breech_block',
    ];
    for (const kind of partKinds) {
      expectValidMuseumGeometry(
        buildRotaryAndArtilleryGeo(kind, 140, p.primary),
        `ordnance:${kind}`
      );
    }
  });

  it('builds valid archery assemblies with GPU flex aSpringParam on bowstrings and flexing limbs', () => {
    const partKinds: ArcheryPartKind[] = [
      'riser',
      'limbs',
      'cams',
      'projectile',
      'bowstring',
    ];
    const styles: ArcheryStyle[] = [
      'bow_compound',
      'crossbow_recurve',
      'bow_longbow',
    ];
    for (const style of styles) {
      const hex =
        style === 'bow_longbow'
          ? CENTENNIAL_FINISH_COLORS.yew_wood.primary
          : CENTENNIAL_FINISH_COLORS.carbon_camo.primary;
      for (const kind of partKinds) {
        const expectedFlex =
          kind === 'bowstring' || kind === 'limbs'
            ? SPRING_AXIS_MODE_FLEX
            : undefined;
        expectValidMuseumGeometry(
          buildArcheryGeo(kind, 80, hex, style),
          `archery:${style}:${kind}`,
          expectedFlex
        );
      }
    }
  });

  it('builds valid GPU-deforming dynamic helical springs along both X and Y axes with aSpringParam', () => {
    const p = CENTENNIAL_FINISH_COLORS.stainless;
    expectValidMuseumGeometry(
      buildDynamicHelicalSpringGeo(12, 0.72, 0.11, 14, p.bolt, 'x'),
      'spring:x',
      SPRING_AXIS_MODE_X
    );
    expectValidMuseumGeometry(
      buildDynamicHelicalSpringGeo(10, 0.65, 0.1, 12, p.bolt, 'y'),
      'spring:y',
      SPRING_AXIS_MODE_Y
    );
  });

  it('enforces Phase 5C-1 matte gunmetal optic palettes, deep oiled woods, compact helical drum, and distinct 4-MBT silhouettes', () => {
    // #3 Eliminate global emerald-green optic flood across all 15 palettes
    for (const [name, pal] of Object.entries(CENTENNIAL_FINISH_COLORS)) {
      const r = parseInt(pal.optic.slice(1, 3), 16);
      const g = parseInt(pal.optic.slice(3, 5), 16);
      const b = parseInt(pal.optic.slice(5, 7), 16);
      expect(g - r, `${name}.optic must be matte dark steel, not emerald green`).toBeLessThanOrEqual(12);
      expect(Math.max(r, g, b), `${name}.optic dark matte anodized tone`).toBeLessThanOrEqual(72);
    }

    // #8 Rich darkened oiled walnut / laminate wood tones (never pale peach)
    for (const hex of [
      CENTENNIAL_FINISH_COLORS.walnut_classic.furniture,
      CENTENNIAL_FINISH_COLORS.bakelite_ak.furniture,
      CENTENNIAL_FINISH_COLORS.yew_wood.primary,
    ]) {
      const r = parseInt(hex.slice(1, 3), 16);
      expect(r, `${hex} deep oiled wood`).toBeLessThan(0x80);
    }

    // #7 Compact PP-19 Bizon helical_64 radius (< 2.0 cm half-height so barrel stays clear)
    const helical = buildMagazineGeo('helical_64', 18, 3.6, 3.4, CENTENNIAL_FINISH_COLORS.tactical_black.secondary);
    helical.computeBoundingBox();
    const helSize = new THREE.Vector3();
    helical.boundingBox!.getSize(helSize);
    expect(helSize.y * 0.5).toBeLessThan(2.0);
    expect(helSize.z * 0.5).toBeLessThan(2.0);
    helical.dispose();

    // #9 WWII T-34-85 fenders sit strictly above tracks (ZERO ERA wall hiding Christie roadwheels)
    const t34Fenders = buildHeavyArmorHullAndTurretGeo(
      'era_skirts',
      100,
      CENTENNIAL_FINISH_COLORS.wwii_soviet.primary,
      'mbt_wwii',
      't34_85'
    );
    t34Fenders.computeBoundingBox();
    expect(t34Fenders.boundingBox!.min.y).toBeGreaterThan(0);
    t34Fenders.dispose();

    // #9 Distinct modern MBT turret silhouettes (T-90M vs Merkava 4M vs Challenger 2)
    const t90Turret = buildHeavyArmorHullAndTurretGeo('turret', 100, '#3c4932', 'mbt_modern', 't90m');
    const merkTurret = buildHeavyArmorHullAndTurretGeo('turret', 100, '#8f7d5d', 'mbt_modern', 'merkava4');
    const challyTurret = buildHeavyArmorHullAndTurretGeo('turret', 100, '#434e38', 'mbt_modern', 'challenger2');
    const vCounts = new Set([
      t90Turret.getAttribute('position').count,
      merkTurret.getAttribute('position').count,
      challyTurret.getAttribute('position').count,
    ]);
    expect(vCounts.size).toBe(3);
    t90Turret.dispose();
    merkTurret.dispose();
    challyTurret.dispose();
  });

  it('enforces Wave A-C4 Metric Box-UVs, beveled slab/profile builders, Beretta open-top slide cutout, and articulated MBT track link belts', () => {
    // 1. Metric Box-Projection UVs align primary U strictly along +X at exact physical tileSizeCm
    const slab = buildChamferedSlab(28, 4.4, 3.2, 0.25, '#4c5664');
    applyMetricBoxUVs(slab, 14);
    slab.computeBoundingBox();
    const uv = slab.getAttribute('uv');
    let minU = Infinity;
    let maxU = -Infinity;
    for (let i = 0; i < uv.count; i++) {
      const u = uv.getX(i);
      if (u < minU) minU = u;
      if (u > maxU) maxU = u;
    }
    const dx = slab.boundingBox!.max.x - slab.boundingBox!.min.x;
    expect(Math.abs(maxU - minU - dx / 14)).toBeLessThan(0.05);
    expect(slab.getAttribute('position').count).toBeGreaterThan(72); // beveled, never raw 36-vert box
    slab.dispose();

    const prof = buildBeveledProfile(
      [
        [-5, -2],
        [5, -2],
        [4, 2],
        [-4, 2],
      ],
      2.4,
      0.16,
      '#59321e'
    );
    expect(prof.getAttribute('position').count).toBeGreaterThan(72);
    prof.dispose();

    // 2. Beretta 92FS open-top slide exposes barrel along central cutout window
    const openSlide = buildBoltAndCarrierGeo(18, 1.15, '#3c4450', 'slide_open_top');
    const pos = openSlide.getAttribute('position');
    let topCenterBlockers = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      if (Math.abs(x) < 2.2 && Math.abs(z) < 0.35 && y > 0.75) {
        topCenterBlockers++;
      }
    }
    expect(topCenterBlockers, 'open-top slide center cutout must remain unobstructed').toBe(0);
    openSlide.dispose();

    // 3. Articulated individual track link belts on both modern and WWII MBTs
    for (const [style, variant] of [
      ['mbt_modern', 't90m'],
      ['mbt_wwii', 't34_85'],
    ] as const) {
      const tracks = buildHeavyArmorHullAndTurretGeo(
        'suspension_tracks',
        100,
        '#45543a',
        style,
        variant
      );
      expect(
        tracks.getAttribute('position').count,
        `${variant} tracks must contain articulated individual track shoes + toothed sprockets`
      ).toBeGreaterThan(6000);
      tracks.dispose();
    }
  });
});

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
  type BarrelMuzzleStyle,
  type BoltCarrierStyle,
  buildArcheryGeo,
  buildBoltAndCarrierGeo,
  buildChamferedReceiverGeo,
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

  it('builds valid machined bolts, carriers, pistol slides & fluted 6-chamber revolver cylinders', () => {
    const p = CENTENNIAL_FINISH_COLORS.blued_steel;
    const styles: BoltCarrierStyle[] = [
      'rotating',
      'straight_pull',
      'slide',
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

  it('builds valid sculpted handguards across all 5 architectural styles', () => {
    const p = CENTENNIAL_FINISH_COLORS.walnut_classic;
    const styles: HandguardStyle[] = [
      'ventilated_tube',
      'quad_rail',
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

  it('builds valid buttstocks & grips across all 8 styles (walnut, folding, AR, bullpup, broomhandle, plowhandle, spade)', () => {
    const p = CENTENNIAL_FINISH_COLORS.walnut_classic;
    const styles: StockGripStyle[] = [
      'walnut_rifle',
      'folding_skeleton',
      'telescoping_ar',
      'bullpup_stock',
      'pistol_grip',
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

  it('builds valid 1:1 Main Battle Tank armor assemblies across all 6 partKinds and both modern/WWII styles', () => {
    const partKinds: HeavyArmorPartKind[] = [
      'hull',
      'turret',
      'era_skirts',
      'suspension_tracks',
      'engine_block',
      'autoloader',
    ];
    const styles: HeavyArmorStyle[] = ['mbt_modern', 'mbt_wwii'];
    for (const style of styles) {
      const hex =
        style === 'mbt_modern'
          ? CENTENNIAL_FINISH_COLORS.russian_green.primary
          : CENTENNIAL_FINISH_COLORS.wwii_soviet.primary;
      for (const kind of partKinds) {
        expectValidMuseumGeometry(
          buildHeavyArmorHullAndTurretGeo(kind, 100, hex, style),
          `armor:${style}:${kind}`
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
});

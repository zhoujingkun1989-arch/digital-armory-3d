import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPRING_AXIS_MODE_FLEX } from '../src/engine/geometry/csgBuilder';
import { ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS } from '../src/weapons/expansion/catalog/archeryArmorOrdnance';
import {
  CENTENNIAL_PART_SLOTS,
  buildCentennialGeometryBuildersForBlueprint,
  centennialPartId,
  computeCentennialPartLayout,
} from '../src/weapons/expansion/centennialGeometryFactory';
import type {
  CentennialArchetype,
  CentennialWeaponBlueprint,
} from '../src/weapons/expansion/centennialTypes';
import type { CameraPresetType } from '../src/weapons/types';

const CAMERA_PRESET_KEYS: readonly CameraPresetType[] = [
  'armory_showcase',
  'iso',
  'right',
  'left',
  'top',
  'cutaway_focus',
  'firing_view',
];

const ALL_28_ARCHETYPES: readonly CentennialArchetype[] = [
  'ak_rifle',
  'ar_rifle',
  'battle_rifle',
  'bullpup_rifle',
  'lmg_belt',
  'lmg_pan',
  'heavy_mg',
  'smg_tube',
  'smg_drum',
  'smg_pdw',
  'sniper_bolt',
  'sniper_bullpup',
  'sniper_dmr',
  'shotgun_pump',
  'shotgun_auto',
  'shotgun_lever',
  'pistol_slide',
  'pistol_broomhandle',
  'revolver_sa',
  'revolver_da',
  'bow_compound',
  'crossbow_recurve',
  'bow_longbow',
  'mbt_modern',
  'mbt_wwii',
  'rotary_cannon',
  'aa_autocannon',
  'howitzer',
];

function assertValidGeometry(geo: THREE.BufferGeometry, label: string): void {
  expect(geo.index, `${label}: must be non-indexed`).toBeNull();

  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  const uv = geo.getAttribute('uv');
  const color = geo.getAttribute('color');
  const curv = geo.getAttribute('aCurvature');

  expect(pos, `${label}: position required`).toBeDefined();
  expect(pos.count, `${label}: non-empty vertices`).toBeGreaterThan(2);
  expect(pos.count % 3, `${label}: triangle list`).toBe(0);
  expect(norm?.count, `${label}: normal count`).toBe(pos.count);
  expect(uv?.count, `${label}: uv count`).toBe(pos.count);
  expect(color?.count, `${label}: color count`).toBe(pos.count);
  expect(curv?.count, `${label}: aCurvature count`).toBe(pos.count);

  let nonFinitePos = 0;
  let badNormals = 0;
  let badCurv = 0;
  for (let i = 0; i < pos.count; i++) {
    if (
      !Number.isFinite(pos.getX(i)) ||
      !Number.isFinite(pos.getY(i)) ||
      !Number.isFinite(pos.getZ(i))
    ) {
      nonFinitePos++;
    }

    const nLen = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
    if (!Number.isFinite(nLen) || Math.abs(nLen - 1) >= 1e-3) {
      badNormals++;
    }

    const cVal = curv.getX(i);
    if (!Number.isFinite(cVal) || cVal < -1.001 || cVal > 1.001) {
      badCurv++;
    }
  }
  expect(nonFinitePos, `${label}: all positions finite`).toBe(0);
  expect(badNormals, `${label}: all normals unit length`).toBe(0);
  expect(badCurv, `${label}: all aCurvature in [-1, 1]`).toBe(0);

  geo.computeBoundingBox();
  geo.computeBoundingSphere();
  const bb = geo.boundingBox!;
  const bs = geo.boundingSphere!;
  expect(Number.isFinite(bs.radius) && bs.radius > 0, `${label}: bs.radius`).toBe(
    true
  );
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  expect(dx > 0 && dy > 0 && dz > 0, `${label}: positive bbox`).toBe(true);
}

function assertValidSpringParam(
  geo: THREE.BufferGeometry,
  label: string,
  expectedFlexMode?: boolean
): void {
  const sp = geo.getAttribute('aSpringParam');
  expect(sp, `${label}: must expose aSpringParam`).toBeDefined();
  expect(sp.itemSize, `${label}: aSpringParam itemSize = 4`).toBe(4);
  expect(sp.count, `${label}: aSpringParam matches vertex count`).toBe(
    geo.getAttribute('position').count
  );
  let maxMag = 0;
  let badSpring = 0;
  for (let i = 0; i < sp.count; i++) {
    const x = sp.getX(i);
    const y = sp.getY(i);
    const z = sp.getZ(i);
    const w = sp.getW(i);
    if (
      !Number.isFinite(x) ||
      !Number.isFinite(y) ||
      !Number.isFinite(z) ||
      !Number.isFinite(w)
    ) {
      badSpring++;
    }
    if (expectedFlexMode) {
      if (w !== SPRING_AXIS_MODE_FLEX) badSpring++;
      maxMag = Math.max(maxMag, Math.hypot(x, y, z));
    }
  }
  expect(badSpring, `${label}: valid finite aSpringParam`).toBe(0);
  if (expectedFlexMode) {
    expect(maxMag, `${label}: non-zero flex displacement`).toBeGreaterThan(0.5);
  }
}

function assertValidLayout(bp: CentennialWeaponBlueprint): void {
  const layout = computeCentennialPartLayout(bp);
  expect(Number.isFinite(layout.sceneScale) && layout.sceneScale > 0).toBe(true);
  expect(Number.isFinite(layout.boreY)).toBe(true);
  expect(Number.isFinite(layout.gridY)).toBe(true);

  for (const vec of [
    layout.muzzlePos,
    layout.chamberGlowPos,
    layout.boundsMin,
    layout.boundsMax,
  ]) {
    for (const v of vec) {
      expect(Number.isFinite(v), `${bp.id}: finite vector`).toBe(true);
    }
  }

  expect(layout.boundsMax[0]).toBeGreaterThan(layout.boundsMin[0]);
  expect(layout.boundsMax[1]).toBeGreaterThan(layout.boundsMin[1]);
  expect(layout.boundsMax[2]).toBeGreaterThan(layout.boundsMin[2]);

  for (const slot of CENTENNIAL_PART_SLOTS) {
    const pos = layout.assembledPos[slot];
    const exp = layout.explodeOffset[slot];
    expect(pos, `${bp.id}: assembledPos.${slot}`).toBeDefined();
    expect(exp, `${bp.id}: explodeOffset.${slot}`).toBeDefined();
    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(pos[i]), `${bp.id}: finite pos.${slot}`).toBe(true);
      expect(Number.isFinite(exp[i]), `${bp.id}: finite exp.${slot}`).toBe(true);
    }
  }

  for (const preset of CAMERA_PRESET_KEYS) {
    const cam = layout.cameraPresets[preset];
    expect(cam, `${bp.id}: camera preset ${preset}`).toBeDefined();
    for (let i = 0; i < 3; i++) {
      expect(Number.isFinite(cam.pos[i])).toBe(true);
      expect(Number.isFinite(cam.target[i])).toBe(true);
    }
    const dist = Math.hypot(
      cam.pos[0] - cam.target[0],
      cam.pos[1] - cam.target[1],
      cam.pos[2] - cam.target[2]
    );
    expect(dist, `${bp.id}: positive camera distance ${preset}`).toBeGreaterThan(
      5
    );
  }
}

/** Builds a realistic synthetic blueprint for any archetype not yet in catalog files. */
function makeSyntheticBlueprint(
  archetype: CentennialArchetype,
  overrides: Partial<CentennialWeaponBlueprint> & {
    cadOverrides?: Partial<CentennialWeaponBlueprint['cad']>;
  } = {}
): CentennialWeaponBlueprint {
  const base = ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS[0];
  const isPistol =
    archetype === 'pistol_slide' ||
    archetype === 'pistol_broomhandle' ||
    archetype === 'revolver_sa' ||
    archetype === 'revolver_da';
  const isMbt = archetype === 'mbt_modern' || archetype === 'mbt_wwii';
  const isHeavy = archetype === 'heavy_mg' || archetype === 'rotary_cannon';
  const isOrdnance = archetype === 'aa_autocannon' || archetype === 'howitzer';

  const cad: CentennialWeaponBlueprint['cad'] = {
    barrelLenCm: isMbt ? 580 : isOrdnance ? 320 : isPistol ? 12.5 : 46,
    receiverLenCm: isMbt ? 680 : isOrdnance ? 140 : isPistol ? 16.5 : 28,
    receiverHeightCm: isMbt ? 230 : isOrdnance ? 170 : isPistol ? 13.5 : 22,
    stockLenCm: isMbt ? 185 : isOrdnance ? 180 : isPistol ? 5 : 26,
    handguardLenCm: isMbt ? 220 : isOrdnance ? 110 : isPistol ? 7 : 26,
    magStyle:
      archetype === 'lmg_pan'
        ? 'pan'
        : archetype === 'lmg_belt' || archetype === 'heavy_mg'
          ? 'belt'
          : archetype === 'smg_drum'
            ? 'drum'
            : archetype === 'shotgun_pump' ||
                archetype === 'shotgun_auto' ||
                archetype === 'shotgun_lever'
              ? 'tube'
              : archetype === 'pistol_slide'
                ? 'pistol_grip'
                : archetype === 'pistol_broomhandle' || archetype === 'sniper_bolt'
                  ? 'box_internal'
                  : archetype === 'revolver_sa' || archetype === 'revolver_da'
                    ? 'cylinder'
                    : archetype === 'aa_autocannon'
                      ? 'top_clip'
                      : archetype === 'mbt_modern'
                        ? 'carousel'
                        : archetype === 'ak_rifle'
                          ? 'curved'
                          : 'straight',
    hasOptic:
      archetype === 'sniper_bolt' ||
      archetype === 'sniper_bullpup' ||
      archetype === 'sniper_dmr',
    hasCarryHandle: archetype === 'ar_rifle' || archetype === 'bullpup_rifle',
    hasBipod:
      archetype === 'lmg_belt' ||
      archetype === 'lmg_pan' ||
      archetype === 'sniper_bolt',
    hasWoodFurniture:
      archetype === 'ak_rifle' ||
      archetype === 'battle_rifle' ||
      archetype === 'shotgun_lever' ||
      archetype === 'pistol_broomhandle' ||
      archetype === 'revolver_sa',
    muzzleStyle:
      archetype === 'mbt_modern'
        ? 'tank_evacuator'
        : archetype === 'howitzer'
          ? 'artillery_brake'
          : archetype === 'rotary_cannon'
            ? 'rotary_clamp'
            : archetype === 'heavy_mg' || archetype === 'smg_drum'
              ? 'shroud'
              : archetype === 'sniper_dmr'
                ? 'suppressor'
                : archetype === 'sniper_bolt'
                  ? 'brake'
                  : 'flash_hider',
    ...overrides.cadOverrides,
  };

  return {
    ...base,
    id: overrides.id ?? ('ak47' as CentennialWeaponBlueprint['id']),
    archetype,
    category: isMbt
      ? 'armor'
      : isOrdnance || archetype === 'rotary_cannon'
        ? 'ordnance'
        : isPistol
          ? 'pistol'
          : archetype.startsWith('smg')
            ? 'smg'
            : archetype.startsWith('sniper')
              ? 'sniper'
              : archetype.startsWith('shotgun')
                ? 'shotgun'
                : archetype.startsWith('lmg') || archetype === 'heavy_mg'
                  ? 'lmg'
                  : archetype.startsWith('bow') || archetype.startsWith('crossbow')
                    ? 'archery'
                    : 'rifle',
    scaleProfile: isMbt || isOrdnance
      ? 'main_battle_tank'
      : isHeavy
        ? 'heavy_sniper'
        : isPistol
          ? 'pistol'
          : archetype.startsWith('bow') || archetype.startsWith('crossbow')
            ? 'compound_bow'
            : 'rifle',
    finishPalette: overrides.finishPalette ?? 'parkerized',
    mechanismFilter: isMbt
      ? 'heavy_armor'
      : archetype === 'sniper_bolt' || archetype === 'shotgun_pump'
        ? 'manual_action'
        : 'gas_piston',
    kinematicLaw:
      archetype === 'sniper_bolt'
        ? 'bolt_action'
        : archetype === 'shotgun_pump'
          ? 'pump_action'
          : archetype === 'shotgun_lever'
            ? 'lever_action'
            : archetype === 'revolver_sa' || archetype === 'revolver_da'
              ? 'revolver_cylinder'
              : archetype === 'pistol_slide'
                ? 'browning_tilt_barrel'
                : archetype === 'pistol_broomhandle'
                  ? 'falling_block_pistol'
                  : 'long_stroke_piston',
    cad,
  };
}

describe('Centennial 20-Part Procedural CAD Geometry Factory & Shared Layout Math (Phase 2D)', () => {
  it('enforces pure zero-Three.js leaf import hygiene in centennialLayoutMath.ts and worker safety in centennialGeometryFactory.ts', () => {
    const layoutSrc = readFileSync(
      resolve(process.cwd(), 'src/weapons/expansion/centennialLayoutMath.ts'),
      'utf8'
    );
    expect(layoutSrc).not.toMatch(/from\s+['"]three['"]/);
    expect(layoutSrc).not.toMatch(/from\s+['"]react['"]/);

    const factorySrc = readFileSync(
      resolve(
        process.cwd(),
        'src/weapons/expansion/centennialGeometryFactory.ts'
      ),
      'utf8'
    );
    expect(factorySrc).not.toMatch(/from\s+['"]react['"]/);
    expect(factorySrc).not.toMatch(/useAppStore/);
    expect(CENTENNIAL_PART_SLOTS).toHaveLength(20);
  });

  it('builds exact 20 valid watertight parts, GPU springs/flex, and 1:1 hangar floor layouts for ALL 10 real BAY-91..100 exhibits', () => {
    expect(ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS).toHaveLength(10);

    for (const bp of ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS) {
      assertValidLayout(bp);
      const layout = computeCentennialPartLayout(bp);

      if (
        bp.archetype === 'mbt_modern' ||
        bp.archetype === 'mbt_wwii' ||
        bp.archetype === 'aa_autocannon' ||
        bp.archetype === 'howitzer'
      ) {
        expect(layout.gridY, `${bp.id}: heavy hangar floor gridY`).toBe(-121.0);
        expect(
          layout.boundsMin[1],
          `${bp.id}: anchored flush on -120 cm floor`
        ).toBe(-120);
      }

      const builders = buildCentennialGeometryBuildersForBlueprint(bp);
      const keys = Object.keys(builders);
      expect(keys, `${bp.id}: exact 20 part builders`).toHaveLength(20);

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const partId = centennialPartId(bp.id, slot);
        expect(builders[partId], `${partId}: builder exists`).toBeTypeOf(
          'function'
        );
        const geo = builders[partId]();
        assertValidGeometry(geo, partId);

        if (
          slot === 'recoil_spring' ||
          slot === 'hammer_spring' ||
          slot === 'mag_spring'
        ) {
          assertValidSpringParam(geo, partId, false);
        }

        if (
          bp.category === 'archery' &&
          (slot === 'barrel' || slot === 'bolt_carrier')
        ) {
          assertValidSpringParam(geo, partId, true);
        }

        geo.dispose();
      }
    }
  }, 20_000);

  it('covers ALL 28 CentennialArchetypes + signature variants (M16A1, Bizon, SVD, Merkava front-engine) with 20/20 valid meshes', () => {
    expect(ALL_28_ARCHETYPES).toHaveLength(28);

    const specialVariants: CentennialWeaponBlueprint[] = [
      makeSyntheticBlueprint('ar_rifle', {
        id: 'm16a1',
        cadOverrides: { hasCarryHandle: true, hasOptic: false },
      }),
      makeSyntheticBlueprint('smg_drum', {
        id: 'bizon',
        cadOverrides: { magStyle: 'drum' },
      }),
      makeSyntheticBlueprint('sniper_dmr', {
        id: 'svd',
        cadOverrides: { hasOptic: true, hasWoodFurniture: true },
      }),
    ];

    const allCases: CentennialWeaponBlueprint[] = [
      ...ALL_28_ARCHETYPES.map((arch) => makeSyntheticBlueprint(arch)),
      ...specialVariants,
    ];

    for (const bp of allCases) {
      assertValidLayout(bp);
      const builders = buildCentennialGeometryBuildersForBlueprint(bp);
      expect(
        Object.keys(builders),
        `${bp.archetype}/${bp.id}: exact 20 builders`
      ).toHaveLength(20);

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const partId = centennialPartId(bp.id, slot);
        const geo = builders[partId]();
        assertValidGeometry(geo, `${bp.archetype}:${partId}`);

        if (
          slot === 'recoil_spring' ||
          slot === 'hammer_spring' ||
          slot === 'mag_spring'
        ) {
          assertValidSpringParam(geo, `${bp.archetype}:${partId}`, false);
        }

        if (
          (bp.archetype === 'bow_compound' ||
            bp.archetype === 'crossbow_recurve' ||
            bp.archetype === 'bow_longbow') &&
          (slot === 'barrel' || slot === 'bolt_carrier')
        ) {
          assertValidSpringParam(geo, `${bp.archetype}:${partId}`, true);
        }

        geo.dispose();
      }
    }

    // Verify authentic Merkava Mk 4M front powerpack vs T-90M rear powerpack distinction
    const merkava = ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS.find(
      (b) => b.id === 'merkava4'
    )!;
    const t90m = ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS.find((b) => b.id === 't90m')!;
    const merkavaLayout = computeCentennialPartLayout(merkava);
    const t90mLayout = computeCentennialPartLayout(t90m);
    expect(merkavaLayout.assembledPos.grip[0]).toBeGreaterThan(0); // front engine
    expect(t90mLayout.assembledPos.grip[0]).toBeLessThan(0); // rear engine
    expect(merkavaLayout.assembledPos.bolt_carrier[0]).toBeLessThan(0); // rear-set turret
  }, 30_000);
});

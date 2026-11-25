import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import type * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { SPRING_AXIS_MODE_FLEX } from '../src/engine/geometry/csgBuilder';
import {
  CENTENNIAL_BLUEPRINTS,
  CENTENNIAL_BLUEPRINT_MAP,
} from '../src/weapons/expansion/centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  buildCentennialGeometryBuilders,
  centennialPartId,
  computeCentennialPartLayout,
} from '../src/weapons/expansion/centennialGeometryFactory';
import {
  CENTENNIAL_66_IDS,
  type CentennialArchetype,
  type CentennialWeaponBlueprint,
  type CentennialWeaponId,
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
  expect(
    Number.isFinite(bs.radius) && bs.radius > 0,
    `${label}: finite positive bs.radius`
  ).toBe(true);
  const dx = bb.max.x - bb.min.x;
  const dy = bb.max.y - bb.min.y;
  const dz = bb.max.z - bb.min.z;
  expect(dx > 0 && dy > 0 && dz > 0, `${label}: positive bbox`).toBe(true);
}

function assertValidSpringParam(
  geo: THREE.BufferGeometry,
  label: string,
  expectedFlexMode: boolean
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

function assertValidLayoutAndExplosion(bp: CentennialWeaponBlueprint): void {
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

  // Validate all 7 camera presets
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

  // Validate t = 1.0 full explosion separation across all 20 parts
  let minExX = Infinity;
  let maxExX = -Infinity;
  let minExY = Infinity;
  let maxExY = -Infinity;
  let minExZ = Infinity;
  let maxExZ = -Infinity;

  let minAsX = Infinity;
  let maxAsX = -Infinity;
  let minAsY = Infinity;
  let maxAsY = -Infinity;

  const explodedPositions: Array<[number, number, number]> = [];
  let movingPartsCount = 0;

  for (const slot of CENTENNIAL_PART_SLOTS) {
    const pos = layout.assembledPos[slot];
    const exp = layout.explodeOffset[slot];
    expect(pos, `${bp.id}: assembledPos.${slot}`).toBeDefined();
    expect(exp, `${bp.id}: explodeOffset.${slot}`).toBeDefined();

    const ex = pos[0] + exp[0];
    const ey = pos[1] + exp[1];
    const ez = pos[2] + exp[2];
    expect(
      Number.isFinite(ex) && Number.isFinite(ey) && Number.isFinite(ez),
      `${bp.id}: finite t=1.0 exploded pos for ${slot}`
    ).toBe(true);

    const disp = Math.hypot(exp[0], exp[1], exp[2]);
    if (slot === 'receiver') {
      expect(disp, `${bp.id}: receiver anchored at t=1.0`).toBe(0);
    } else {
      expect(disp, `${bp.id}: ${slot} separates cleanly at t=1.0`).toBeGreaterThan(
        1.5
      );
      movingPartsCount++;
    }

    minAsX = Math.min(minAsX, pos[0]);
    maxAsX = Math.max(maxAsX, pos[0]);
    minAsY = Math.min(minAsY, pos[1]);
    maxAsY = Math.max(maxAsY, pos[1]);

    minExX = Math.min(minExX, ex);
    maxExX = Math.max(maxExX, ex);
    minExY = Math.min(minExY, ey);
    maxExY = Math.max(maxExY, ey);
    minExZ = Math.min(minExZ, ez);
    maxExZ = Math.max(maxExZ, ez);
    explodedPositions.push([ex, ey, ez]);
  }

  expect(movingPartsCount, `${bp.id}: 19 non-receiver parts explode`).toBe(19);

  // Full exploded 3D diagonal spread must strictly exceed assembled centroid spread
  const assembledDiag = Math.hypot(maxAsX - minAsX, maxAsY - minAsY);
  const explodedDiag = Math.hypot(
    maxExX - minExX,
    maxExY - minExY,
    maxExZ - minExZ
  );
  expect(
    explodedDiag,
    `${bp.id}: exploded 3D spread exceeds assembled spread`
  ).toBeGreaterThan(assembledDiag * 1.15);

  // Class-calibrated realistic minimum exploded diagonal
  const minExpectedSpread =
    bp.category === 'armor'
      ? 550
      : bp.category === 'ordnance'
        ? 180
        : bp.category === 'archery'
          ? 48
          : bp.category === 'pistol'
            ? 24
            : 40;
  expect(
    explodedDiag,
    `${bp.id} (${bp.category}): realistic t=1.0 spread >= ${minExpectedSpread} cm`
  ).toBeGreaterThanOrEqual(minExpectedSpread);

  // Ensure no two distinct slots collapse onto the exact same exploded point
  let collapsedPairs = 0;
  for (let i = 0; i < explodedPositions.length; i++) {
    for (let j = i + 1; j < explodedPositions.length; j++) {
      const d = Math.hypot(
        explodedPositions[i][0] - explodedPositions[j][0],
        explodedPositions[i][1] - explodedPositions[j][1],
        explodedPositions[i][2] - explodedPositions[j][2]
      );
      if (d < 1.0) collapsedPairs++;
    }
  }
  expect(
    collapsedPairs,
    `${bp.id}: zero collapsed part pairs at t=1.0`
  ).toBe(0);
}

describe('Centennial 66-Exhibit 20-Part Procedural CAD Geometry Factory & Layout Math (Phase 2K)', () => {
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
    expect(CENTENNIAL_BLUEPRINTS).toHaveLength(66);
    expect(CENTENNIAL_66_IDS).toHaveLength(66);

    // Unknown ID guard
    expect(() =>
      buildCentennialGeometryBuilders(
        'nonexistent_weapon' as CentennialWeaponId
      )
    ).toThrow(/Unknown Centennial exhibit id/);
  });

  it(
    'builds & validates ALL 66 / 66 real Centennial exhibits (1,320 live 3D CAD meshes, 198 springs, 6 flexing archery parts, all 28 archetypes)',
    () => {
      const globalPartIds = new Set<string>();
      const seenArchetypes = new Set<CentennialArchetype>();
      let totalMeshes = 0;
      let totalDynamicSprings = 0;
      let totalArcheryFlexParts = 0;

      for (const id of CENTENNIAL_66_IDS) {
        const bp = CENTENNIAL_BLUEPRINT_MAP[id];
        expect(bp, `${id}: blueprint present in CENTENNIAL_BLUEPRINT_MAP`).toBeDefined();
        seenArchetypes.add(bp.archetype);

        const builders = buildCentennialGeometryBuilders(id);
        const keys = Object.keys(builders);
        expect(keys, `${id}: exact 20 part builders`).toHaveLength(20);

        for (const slot of CENTENNIAL_PART_SLOTS) {
          const partId = centennialPartId(id, slot);
          expect(
            globalPartIds.has(partId),
            `${partId}: globally unique part ID`
          ).toBe(false);
          globalPartIds.add(partId);

          expect(builders[partId], `${partId}: builder function`).toBeTypeOf(
            'function'
          );
          const geo = builders[partId]();
          assertValidGeometry(geo, partId);
          totalMeshes++;

          if (
            slot === 'recoil_spring' ||
            slot === 'hammer_spring' ||
            slot === 'mag_spring'
          ) {
            assertValidSpringParam(geo, partId, false);
            totalDynamicSprings++;
          }

          if (
            bp.category === 'archery' &&
            (slot === 'barrel' || slot === 'bolt_carrier')
          ) {
            assertValidSpringParam(geo, partId, true);
            totalArcheryFlexParts++;
          }

          geo.dispose();
        }
      }

      expect(totalMeshes).toBe(1320);
      expect(globalPartIds.size).toBe(1320);
      expect(totalDynamicSprings).toBe(198);
      expect(totalArcheryFlexParts).toBe(6);

      // All 28 archetypes must be exercised by the real 66-exhibit catalog
      for (const arch of ALL_28_ARCHETYPES) {
        expect(
          seenArchetypes.has(arch),
          `archetype ${arch} covered in real 66 exhibits`
        ).toBe(true);
      }
    },
    45_000
  );

  it('verifies finite 7-camera layouts, t = 1.0 exploded separation, and signature mechanical geometry across ALL 66 / 66 exhibits', () => {
    for (const bp of CENTENNIAL_BLUEPRINTS) {
      assertValidLayoutAndExplosion(bp);
    }

    // Authentic mechanical architecture spot-checks across real exhibits
    const merkava = computeCentennialPartLayout(
      CENTENNIAL_BLUEPRINT_MAP.merkava4
    );
    const t90m = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.t90m);
    expect(merkava.assembledPos.grip[0]).toBeGreaterThan(0); // front powerpack
    expect(merkava.assembledPos.bolt_carrier[0]).toBeLessThan(0); // rear-set turret
    expect(t90m.assembledPos.grip[0]).toBeLessThan(0); // rear powerpack

    const dp28 = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.dp28);
    const ak47 = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.ak47);
    expect(dp28.assembledPos.mag_body[1]).toBeGreaterThan(0); // top 47-rd pan
    expect(ak47.assembledPos.mag_body[1]).toBeLessThan(0); // bottom curved banana

    const famas = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.famas);
    const m16a1 = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.m16a1);
    expect(famas.assembledPos.mag_body[0]).toBeLessThan(0); // bullpup rear mag
    expect(famas.assembledPos.grip[0]).toBeGreaterThan(0); // bullpup forward grip
    expect(m16a1.assembledPos.mag_body[0]).toBeGreaterThan(0); // standard mag ahead
    expect(m16a1.assembledPos.grip[0]).toBeLessThan(0); // standard rear grip

    const bizon = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP.bizon);
    const mossberg = computeCentennialPartLayout(
      CENTENNIAL_BLUEPRINT_MAP.mossberg500
    );
    expect(bizon.assembledPos.mag_body[0]).toBeGreaterThan(0); // under-handguard helical tube
    expect(mossberg.assembledPos.mag_body[0]).toBeGreaterThan(0); // under-barrel tube
    expect(mossberg.assembledPos.mag_body[1]).toBeLessThan(mossberg.boreY);
  });
});

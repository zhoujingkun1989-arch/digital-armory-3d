import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computePartTransform,
  createMutablePose,
  evaluatePartPoseInto,
} from '../src/engine/kinematics/math';
import { CENTENNIAL_BLUEPRINT_MAP, CENTENNIAL_BLUEPRINTS } from '../src/weapons/expansion/centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  computeCentennialPartLayout,
} from '../src/weapons/expansion/centennialLayoutMath';
import { isCentennialShellSlot } from '../src/weapons/expansion/centennialPartNomenclature';
import {
  CENTENNIAL_SHARED_MATERIAL_SUITES,
  buildCentennialPlugin,
  buildCentennialPluginForBlueprint,
  resolveCentennialPartMaterialSuite,
} from '../src/weapons/expansion/centennialPluginFactory';
import {
  CENTENNIAL_66_IDS,
  type CentennialKinematicLaw,
  type CentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';

const DENSE_FIRING_SWEEP: readonly number[] = Array.from(
  { length: 51 },
  (_, i) => Number((i * 0.02).toFixed(2))
);

const CJK_OR_FULLWIDTH_RE =
  /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;
const WP_TAG_RE = /\bWP-\d+/i;

const EXPECTED_PRESET_IDS = [
  'assembled',
  'field_strip',
  'sub_assembly',
  'full_exploded',
] as const;

const EXPECTED_PHASE_IDS = [
  'phase_1',
  'phase_2',
  'phase_3',
  'phase_4',
  'phase_5',
  'phase_6',
  'phase_7',
] as const;

describe('Centennial Lazy Runtime Plugin & 22-Law Kinematic Engine (Phase 2H)', () => {
  it('satisfies full BOM, group, preset, phase, explode, and dense 67,320-pose contracts across all 66 exhibits', () => {
    expect(CENTENNIAL_BLUEPRINTS).toHaveLength(66);
    expect(CENTENNIAL_66_IDS).toHaveLength(66);

    const globalPartIds = new Set<string>();
    const coveredLaws = new Set<CentennialKinematicLaw>();
    const poseScratch = createMutablePose();
    let totalPoseEvaluations = 0;

    for (const bp of CENTENNIAL_BLUEPRINTS) {
      coveredLaws.add(bp.kinematicLaw);

      const plugin = buildCentennialPlugin(bp.id);
      const fresh = buildCentennialPluginForBlueprint(bp);
      expect(plugin.id).toBe(bp.id);
      expect(fresh.parts).toHaveLength(20);
      expect(plugin.parts).toHaveLength(20);
      expect(plugin.partGroups).toHaveLength(4);
      expect(plugin.timelinePresets).toHaveLength(4);
      expect(plugin.firingPhases).toHaveLength(7);
      expect(Object.keys(plugin.pbrBindings)).toHaveLength(20);
      expect(plugin.pbrSuites).toEqual([]);

      // Exact timeline preset IDs & progress anchors
      expect(plugin.timelinePresets.map((p) => p.id)).toEqual(
        EXPECTED_PRESET_IDS
      );
      expect(plugin.timelinePresets.map((p) => p.t)).toEqual([0, 0.3, 0.65, 1]);

      // Exact firing phase IDs & continuous [0, 1] coverage
      expect(plugin.firingPhases.map((p) => p.id)).toEqual(EXPECTED_PHASE_IDS);
      expect(plugin.firingPhases[0].range[0]).toBeCloseTo(0, 6);
      expect(plugin.firingPhases[6].range[1]).toBeCloseTo(1, 6);
      for (let i = 0; i < plugin.firingPhases.length; i++) {
        const phase = plugin.firingPhases[i];
        expect(phase.range[0]).toBeLessThan(phase.range[1]);
        if (i > 0) {
          expect(phase.range[0]).toBeCloseTo(
            plugin.firingPhases[i - 1].range[1],
            6
          );
        }
        expect(phase.title).not.toMatch(WP_TAG_RE);
        expect(phase.description).not.toMatch(WP_TAG_RE);
      }

      // Group keys & English purity
      const groupKeys = new Set(plugin.partGroups.map((g) => g.key));
      for (const g of plugin.partGroups) {
        expect(g.nameEn).not.toMatch(CJK_OR_FULLWIDTH_RE);
        expect(g.nameEn).not.toMatch(WP_TAG_RE);
      }

      // Layout parity & BOM contract
      const layout = computeCentennialPartLayout(bp);
      const bomCodes = new Set<string>();

      for (let idx = 0; idx < plugin.parts.length; idx++) {
        const part = plugin.parts[idx];
        const slot = CENTENNIAL_PART_SLOTS[idx];
        expect(part.id).toBe(`${bp.id}_${slot}`);
        expect(
          globalPartIds.has(part.id),
          `duplicate global part id: ${part.id}`
        ).toBe(false);
        globalPartIds.add(part.id);

        expect(
          bomCodes.has(part.bomCode),
          `duplicate BOM code ${part.bomCode} in ${bp.id}`
        ).toBe(false);
        bomCodes.add(part.bomCode);

        expect(groupKeys.has(part.group)).toBe(true);
        expect(part.nameEn).not.toMatch(CJK_OR_FULLWIDTH_RE);
        expect(part.nameEn).not.toMatch(WP_TAG_RE);
        expect(part.description).not.toMatch(WP_TAG_RE);
        expect(Boolean(part.isShell)).toBe(isCentennialShellSlot(bp, slot));

        for (const v of part.assembledPos) {
          expect(Number.isFinite(v)).toBe(true);
        }
        expect(part.explodeSteps.length).toBeGreaterThanOrEqual(2);
        for (const step of part.explodeSteps) {
          expect(step.range[0]).toBeGreaterThanOrEqual(0.06);
          expect(step.range[1]).toBeLessThanOrEqual(0.95);
          expect(step.range[0]).toBeLessThan(step.range[1]);
          for (const v of step.offset) {
            expect(Number.isFinite(v)).toBe(true);
          }
        }

        // Verify t = 1.0 explosion matches layout.explodeOffset[slot] exactly
        const exploded = computePartTransform(part, 1.0);
        const expectedOff = layout.explodeOffset[slot];
        expect(exploded.position[0]).toBeCloseTo(
          part.assembledPos[0] + expectedOff[0],
          2
        );
        expect(exploded.position[1]).toBeCloseTo(
          part.assembledPos[1] + expectedOff[1],
          2
        );
        expect(exploded.position[2]).toBeCloseTo(
          part.assembledPos[2] + expectedOff[2],
          2
        );
      }

      // Dense 51-step firing kinematics & ballistics sweep
      for (const f of DENSE_FIRING_SWEEP) {
        const activePhase = plugin.getActiveFiringPhase(f);
        expect(EXPECTED_PHASE_IDS).toContain(activePhase.id);

        for (const part of plugin.parts) {
          const delta = plugin.computeFiringKinematics(part.id, f);
          expect(
            Number.isFinite(delta.pos[0]) &&
              Number.isFinite(delta.pos[1]) &&
              Number.isFinite(delta.pos[2]) &&
              Number.isFinite(delta.rot[0]) &&
              Number.isFinite(delta.rot[1]) &&
              Number.isFinite(delta.rot[2]) &&
              Number.isFinite(delta.scaleX),
            `${bp.id}/${part.id} non-finite delta at f=${f}`
          ).toBe(true);
          expect(
            delta.scaleX,
            `${bp.id}/${part.id} scaleX must stay > 0.15 at f=${f}`
          ).toBeGreaterThan(0.15);

          evaluatePartPoseInto(
            part,
            0,
            true,
            f,
            plugin.computeFiringKinematics,
            poseScratch
          );
          expect(
            Number.isFinite(poseScratch.px) &&
              Number.isFinite(poseScratch.py) &&
              Number.isFinite(poseScratch.pz) &&
              Number.isFinite(poseScratch.rx) &&
              Number.isFinite(poseScratch.ry) &&
              Number.isFinite(poseScratch.rz) &&
              poseScratch.sx > 0.15,
            `${bp.id}/${part.id} invalid pose at f=${f}`
          ).toBe(true);
          totalPoseEvaluations++;
        }

        const ball = plugin.computeBallisticsState(f);
        const numericBallistics = [
          ...ball.bulletPos,
          ...ball.spentCasePos,
          ...ball.spentCaseRot,
          ...ball.nextRoundPos,
          ...ball.reserveRoundPos,
          ...ball.gasPortPos,
          ball.streakLength,
          ball.spentCaseOpacity,
          ball.nextRoundRotZ,
          ball.chamberFlashIntensity,
          ball.gasPortFlashIntensity,
          ball.muzzlePlumeScale,
          ball.muzzlePlumeOpacity,
        ];
        for (const v of numericBallistics) {
          expect(Number.isFinite(v), `${bp.id} non-finite ballistics at f=${f}`).toBe(
            true
          );
        }
      }

      // Dynamic spring & archery flex deformation across EVERY exhibit
      const dynamicSlots =
        bp.category === 'archery'
          ? (['recoil_spring', 'hammer_spring', 'mag_spring', 'barrel', 'bolt_carrier'] as const)
          : (['recoil_spring', 'hammer_spring', 'mag_spring'] as const);

      for (const slot of dynamicSlots) {
        const partId = `${bp.id}_${slot}`;
        let minScale = Infinity;
        let maxScale = -Infinity;
        for (const f of DENSE_FIRING_SWEEP) {
          const sx = plugin.computeFiringKinematics(partId, f).scaleX;
          if (sx < minScale) minScale = sx;
          if (sx > maxScale) maxScale = sx;
        }
        expect(
          minScale,
          `${partId} min scaleX must stay > 0.25`
        ).toBeGreaterThan(0.25);
        expect(
          maxScale - minScale,
          `${partId} must dynamically deform (> 0.15 delta)`
        ).toBeGreaterThan(0.15);
      }
    }

    expect(globalPartIds.size).toBe(1320);
    expect(totalPoseEvaluations).toBe(66 * 51 * 20);
    expect(coveredLaws.size).toBe(22);
  });

  it('enforces authentic mechanism-specific motion laws across all 22 CentennialKinematicLaws', () => {
    const sweepPart = (id: CentennialWeaponId, slot: string) => {
      const plugin = buildCentennialPlugin(id);
      const partId = `${id}_${slot}`;
      let minDx = Infinity;
      let maxDx = -Infinity;
      let minDy = Infinity;
      let maxAbsRx = 0;
      let maxRx = -Infinity;
      let minRx = Infinity;
      let maxAbsRz = 0;
      for (const f of DENSE_FIRING_SWEEP) {
        const d = plugin.computeFiringKinematics(partId, f);
        minDx = Math.min(minDx, d.pos[0]);
        maxDx = Math.max(maxDx, d.pos[0]);
        minDy = Math.min(minDy, d.pos[1]);
        maxAbsRx = Math.max(maxAbsRx, Math.abs(d.rot[0]));
        maxRx = Math.max(maxRx, d.rot[0]);
        minRx = Math.min(minRx, d.rot[0]);
        maxAbsRz = Math.max(maxAbsRz, Math.abs(d.rot[2]));
      }
      return { minDx, maxDx, minDy, maxAbsRx, maxRx, minRx, maxAbsRz };
    };

    // 1. Rotating bolts (gas piston, DI, bolt-action) rotate |rot[0]| > 0.25
    for (const id of [
      'ak47',
      'm16a1',
      'hk416',
      'pkm',
      'svd',
      'mosin',
      'leeenfield',
      'm200',
    ] as const) {
      const bolt = sweepPart(id, 'bolt');
      expect(bolt.maxAbsRx, `${id} rotating bolt roll`).toBeGreaterThan(0.25);
      expect(bolt.minDx, `${id} bolt rearward travel`).toBeLessThan(-2.5);
    }
    // Lee-Enfield 60° vs Mosin 90° bolt lift
    expect(sweepPart('leeenfield', 'bolt').maxAbsRx).toBeCloseTo(Math.PI / 3, 2);
    expect(sweepPart('mosin', 'bolt').maxAbsRx).toBeCloseTo(Math.PI / 2, 2);

    // 2. Revolver cylinders index 60° (6-shot SAA) & 72° (5-shot S&W 500) and retain spent brass
    expect(sweepPart('saa1873', 'bolt').maxRx).toBeCloseTo(Math.PI / 3, 2);
    expect(sweepPart('sw500', 'bolt').maxRx).toBeCloseTo((2 * Math.PI) / 5, 2);
    for (const revId of ['saa1873', 'sw500'] as const) {
      const plugin = buildCentennialPlugin(revId);
      for (const f of DENSE_FIRING_SWEEP) {
        expect(plugin.computeBallisticsState(f).spentCaseVisible).toBe(false);
      }
    }

    // 3. Browning tilt-barrel pistols tilt & drop; M2HB recoils straight-line
    for (const pid of ['cz75', 'p226', 'tt33', 'usp45'] as const) {
      const b = sweepPart(pid, 'barrel');
      expect(b.minDx, `${pid} barrel short recoil`).toBeLessThan(-0.3);
      expect(b.minDy, `${pid} barrel cam drop`).toBeLessThan(-0.15);
      expect(b.maxAbsRz, `${pid} barrel tilt pitch`).toBeGreaterThan(0.04);
    }
    const m2hbBarrel = sweepPart('m2hb', 'barrel');
    expect(m2hbBarrel.minDx).toBeLessThan(-1.5);
    expect(m2hbBarrel.maxAbsRz).toBe(0);

    // 4. Falling-block pistols recoil straight-line while locking block drops
    for (const fbid of ['beretta92', 'c96'] as const) {
      const b = sweepPart(fbid, 'barrel');
      const blk = sweepPart(fbid, 'bolt');
      expect(b.minDx).toBeLessThan(-0.3);
      expect(b.maxAbsRz).toBe(0);
      expect(blk.minDy).toBeLessThan(-0.25);
    }

    // 5. Pump-action forend stroke & lever-action finger lever swing
    expect(sweepPart('mossberg500', 'handguard').minDx).toBeLessThan(-3.0);
    expect(sweepPart('ks23', 'handguard').minDx).toBeLessThan(-3.0);
    expect(sweepPart('winchester1887', 'selector').maxAbsRz).toBeGreaterThan(0.5);

    // 6. M61A1 Vulcan 6-barrel rotary cluster completes full 2π revolution
    const vulcan = sweepPart('m61vulcan', 'barrel');
    expect(vulcan.minRx).toBeCloseTo(0, 5);
    expect(vulcan.maxRx).toBeCloseTo(Math.PI * 2, 4);
    expect(sweepPart('m61vulcan', 'bolt_carrier').maxRx).toBeCloseTo(
      Math.PI * 2,
      4
    );

    // 7. 1:1 MBTs & heavy artillery recoil > 20 cm and drop open breechblock
    for (const heavyId of [
      't90m',
      'challenger2',
      'merkava4',
      't34_85',
      'bofors40',
      'm777',
    ] as const) {
      const bar = sweepPart(heavyId, 'barrel');
      const breech = sweepPart(heavyId, 'bolt');
      expect(bar.minDx, `${heavyId} cannon recoil > 20 cm`).toBeLessThan(-20);
      expect(breech.minDy, `${heavyId} breech drop`).toBeLessThan(-4);
    }

    // 8. Fixed-barrel small arms hold barrel strictly stationary during firing
    for (const fixedId of [
      'ak47',
      'm16a1',
      'fnfal',
      'g3a3',
      'famas',
      'uzi',
      'ppk',
      'mosin',
      'mossberg500',
    ] as const) {
      const b = sweepPart(fixedId, 'barrel');
      expect(
        Math.abs(b.minDx) + Math.abs(b.maxDx) + Math.abs(b.minDy) + b.maxAbsRz,
        `${fixedId} fixed barrel must stay stationary`
      ).toBe(0);
    }

    // 9. Archery emits zero gunpowder flash or spent brass
    for (const archId of ['hoytrx8', 'excalibur', 'englishlongbow'] as const) {
      const plugin = buildCentennialPlugin(archId);
      for (const f of DENSE_FIRING_SWEEP) {
        const ball = plugin.computeBallisticsState(f);
        expect(ball.spentCaseVisible).toBe(false);
        expect(ball.chamberFlashIntensity).toBe(0);
        expect(ball.gasPortFlashIntensity).toBe(0);
        expect(ball.muzzlePlumeOpacity).toBe(0);
      }
    }
  });

  it('enforces pure lazy chunk import hygiene (zero Three.js, React, store, or flagship imports)', () => {
    const filePath = resolve(
      process.cwd(),
      'src/weapons/expansion/centennialPluginFactory.ts'
    );
    const source = readFileSync(filePath, 'utf8');

    const importMatches = [
      ...source.matchAll(/^import\s+([\s\S]*?)\s+from\s+['"]([^'"]+)['"];?/gm),
    ];
    const runtimeImports = importMatches
      .filter((m) => !m[1].trimStart().startsWith('type '))
      .map((m) => m[2])
      .sort();

    expect(runtimeImports).toEqual([
      '../../engine/kinematics/math',
      './centennialCatalog',
      './centennialLayoutMath',
      './centennialPartNomenclature',
    ]);
    expect(source).not.toMatch(/\bimport\s*\(/);
    expect(source).not.toMatch(/\brequire\s*\(/);
    expect(source).not.toContain('@ts-ignore');
  });

  it('locks Phase 5C-2 cutaway turret/slide isShell, m61vulcan 1:1 concrete hangar grounding & rifle/longbow framing', () => {
    // 1. Cutaway outer shells: all 4 Centennial MBTs & all 7 pistol_slide pistols mark bolt_carrier as isShell=true
    const shellCarrierIds: readonly CentennialWeaponId[] = [
      't90m',
      'challenger2',
      'merkava4',
      't34_85',
      'beretta92',
      'p226',
      'usp45',
      'cz75',
      'ppk',
      'tt33',
      'fiveseven',
    ];
    for (const id of shellCarrierIds) {
      const plugin = buildCentennialPlugin(id);
      const carrier = plugin.parts.find((p) => p.id === `${id}_bolt_carrier`);
      expect(carrier?.isShell, `${id}_bolt_carrier must slice open in ?cut=1`).toBe(true);
      if (CENTENNIAL_BLUEPRINT_MAP[id].category === 'armor') {
        expect(
          carrier?.material,
          `${id} MBT turret must use matte CARC polymer_frame (no glossy chrome specular blob)`
        ).toBe('polymer_frame');
      }
    }
    for (const nonShellId of ['ak47', 'm16a1', 'c96', 'saa1873', 'm61vulcan'] as const) {
      const plugin = buildCentennialPlugin(nonShellId);
      const carrier = plugin.parts.find((p) => p.id === `${nonShellId}_bolt_carrier`);
      expect(carrier?.isShell, `${nonShellId}_bolt_carrier must remain solid internal`).toBe(false);
    }

    // 2. m61vulcan promoted to 1:1 heavy concrete hangar stage (gridY=-121, floor=-120)
    const m61Bp = CENTENNIAL_BLUEPRINT_MAP.m61vulcan;
    expect(m61Bp.scaleProfile).toBe('main_battle_tank');
    const m61Layout = computeCentennialPartLayout(m61Bp);
    expect(m61Layout.gridY).toBe(-121);
    expect(m61Layout.boundsMin[1]).toBe(-120);
    expect(m61Layout.boreY).toBeCloseTo(-75.8, 2);

    const stageSrc = readFileSync(
      resolve(process.cwd(), 'src/engine/canvas/GunsmithStageMat.tsx'),
      'utf8'
    );
    expect(stageSrc).toContain('isHeavyScaleWeapon(activeWeaponId)');

    // 3. Tightened vertical explodeOffset on Centennial rifles/bullpups & pulled-back englishlongbow framing
    for (const rifleId of ['famas', 'ak47', 'stg44', 'qbz95', 'tavor'] as const) {
      const layout = computeCentennialPartLayout(CENTENNIAL_BLUEPRINT_MAP[rifleId]);
      expect(Math.abs(layout.explodeOffset.optic[1])).toBeLessThanOrEqual(10);
      expect(Math.abs(layout.explodeOffset.mag_base[1])).toBeLessThanOrEqual(14);
    }
    const bowLayout = computeCentennialPartLayout(
      CENTENNIAL_BLUEPRINT_MAP.englishlongbow
    );
    expect(bowLayout.gridY).toBe(-58);
    expect(bowLayout.cameraPresets.iso.pos[2]).toBeGreaterThanOrEqual(130);
    expect(bowLayout.cameraPresets.armory_showcase.pos[2]).toBeGreaterThanOrEqual(
      142
    );
  });

  it('locks Wave A-C3 constitutional 1,320 shared PBR bindings (all 13 suites), cutaway mag_body/grip shells & domain materials', () => {
    const allowedSuites = new Set<string>(CENTENNIAL_SHARED_MATERIAL_SUITES);
    expect(allowedSuites.size).toBe(13);

    const usedSuites = new Set<string>();
    let boundParts = 0;

    for (const bp of CENTENNIAL_BLUEPRINTS) {
      const plugin = buildCentennialPlugin(bp.id);
      expect(Object.keys(plugin.pbrBindings)).toHaveLength(20);
      expect(plugin.pbrSuites).toEqual([]);

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const partId = `${bp.id}_${slot}`;
        const binding = plugin.pbrBindings[partId];
        expect(binding, `missing PBR binding for ${partId}`).toBeDefined();
        const suite = resolveCentennialPartMaterialSuite(bp, slot);
        expect(allowedSuites.has(suite)).toBe(true);
        usedSuites.add(suite);

        expect(binding.albedoFile).toBe(`centennial_mat_${suite}_albedo.webp`);
        expect(binding.normalFile).toBe(`centennial_mat_${suite}_normal.webp`);
        expect(binding.roughnessFile).toBe(
          `centennial_mat_${suite}_roughness.webp`
        );
        expect(binding.repeat).toBe(1);
        expect(binding.normalScale).toBeGreaterThanOrEqual(0.42);
        expect(binding.normalScale).toBeLessThanOrEqual(0.78);
        boundParts += 1;
      }

      // Cutaway magazine & grip shell contract
      const magPart = plugin.parts.find((p) => p.id === `${bp.id}_mag_body`);
      const gripPart = plugin.parts.find((p) => p.id === `${bp.id}_grip`);
      const expectsMagShell =
        bp.category !== 'archery' &&
        bp.category !== 'armor' &&
        bp.category !== 'ordnance' &&
        bp.archetype !== 'revolver_sa' &&
        bp.archetype !== 'revolver_da' &&
        bp.cad.magStyle !== 'tube' &&
        bp.cad.magStyle !== 'belt';
      expect(
        Boolean(magPart?.isShell),
        `${bp.id}_mag_body cutaway shell expectation`
      ).toBe(expectsMagShell);
      expect(
        Boolean(gripPart?.isShell),
        `${bp.id}_grip cutaway shell expectation`
      ).toBe(bp.cad.magStyle === 'pistol_grip');
    }

    expect(boundParts).toBe(1320);
    // Every single one of the 13 shared museum PBR suites must be utilized
    expect(usedSuites.size).toBe(13);

    // Authentic material spot-checks across iconic exhibits
    expect(
      resolveCentennialPartMaterialSuite(CENTENNIAL_BLUEPRINT_MAP.ak47, 'stock')
    ).toBe('russian_laminate');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.wa2000,
        'stock'
      )
    ).toBe('oiled_walnut');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.englishlongbow,
        'receiver'
      )
    ).toBe('beech_yew');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.t34_85,
        'receiver'
      )
    ).toBe('cast_rha_armor');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.t90m,
        'bolt_carrier'
      )
    ).toBe('carc_olive');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.merkava4,
        'receiver'
      )
    ).toBe('carc_desert');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.beretta92,
        'grip'
      )
    ).toBe('checkered_grip');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.beretta92,
        'receiver'
      )
    ).toBe('anodized_alloy');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.sw500,
        'barrel'
      )
    ).toBe('brushed_stainless');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.usp45,
        'receiver'
      )
    ).toBe('tactical_polymer');
    expect(
      resolveCentennialPartMaterialSuite(
        CENTENNIAL_BLUEPRINT_MAP.ak47,
        'follower'
      )
    ).toBe('cartridge_brass');
  });
});

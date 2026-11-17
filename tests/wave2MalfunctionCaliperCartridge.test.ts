import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  CALIPER_BENCHMARK_ORDER,
  caliperStore,
  computeCaliperMeasurement,
  computeWeaponEnvelopeMetrics,
  WORLD_UNIT_TO_MM,
} from '../src/engine/caliper/caliperStore';
import {
  ARCHERY_PROJECTILE_SPECS,
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
  getCartridgeLabMeshBundle,
  isArcheryCaliberProfile,
  isCaliberProfile,
} from '../src/engine/cartridges/cartridgeSpecs';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  ensureWeaponGeometries,
  getCachedPartGeometry,
} from '../src/engine/geometry/geometryService';
import {
  createMutablePose,
  evaluatePartPoseInto,
} from '../src/engine/kinematics/math';
import {
  ARCHERY_MALFUNCTION_SCENARIOS,
  getMalfunctionScenario,
  isArcheryMalfunctionWeapon,
  MALFUNCTION_ORDER,
  MALFUNCTION_SCENARIOS,
  WEAPON_MALFUNCTION_PROFILES,
} from '../src/engine/malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../src/engine/malfunctions/malfunctionStore';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

function assertFiniteGeometry(
  geo: THREE.BufferGeometry,
  label: string
): THREE.Box3 {
  const pos = geo.getAttribute('position');
  const norm = geo.getAttribute('normal');
  expect(pos, `${label}: missing position attribute`).toBeDefined();
  expect(norm, `${label}: missing normal attribute`).toBeDefined();
  expect(pos.count, `${label}: empty vertex buffer`).toBeGreaterThan(0);
  expect(norm.count, `${label}: normal count mismatch`).toBe(pos.count);

  for (let i = 0; i < pos.array.length; i++) {
    if (!Number.isFinite(pos.array[i])) {
      throw new Error(`${label}: non-finite position at index ${i}`);
    }
  }
  for (let i = 0; i < norm.array.length; i++) {
    if (!Number.isFinite(norm.array[i])) {
      throw new Error(`${label}: non-finite normal at index ${i}`);
    }
  }

  geo.computeBoundingBox();
  expect(geo.boundingBox).not.toBeNull();
  return geo.boundingBox!;
}

describe('Wave 2 Contracts — WP-09 Malfunctions, WP-10 Caliper & WP-06 1:1 Cartridge Lab', () => {
  beforeEach(() => {
    useAppStore.getState().resetAll();
    caliperStore.clearPoints();
  });

  it('WP-09: validates malfunction profiles & valid part IDs across all 13 weapons and bilingual scenario specs', async () => {
    for (const kind of MALFUNCTION_ORDER) {
      for (const spec of [
        MALFUNCTION_SCENARIOS[kind],
        ARCHERY_MALFUNCTION_SCENARIOS[kind],
      ]) {
        expect(spec.kind).toBe(kind);
        expect(spec.titleZh.length).toBeGreaterThan(4);
        expect(spec.titleEn.length).toBeGreaterThan(4);
        expect(spec.symptomZh.length).toBeGreaterThan(8);
        expect(spec.symptomEn.length).toBeGreaterThan(8);
        expect(spec.rootCauseZh.length).toBeGreaterThan(8);
        expect(spec.rootCauseEn.length).toBeGreaterThan(8);
        expect(spec.safetyNoteZh.length).toBeGreaterThan(6);
        expect(spec.safetyNoteEn.length).toBeGreaterThan(6);
        expect(spec.steps.length).toBeGreaterThanOrEqual(3);

        for (const step of spec.steps) {
          expect(step.titleZh.length).toBeGreaterThan(3);
          expect(step.titleEn.length).toBeGreaterThan(3);
          expect(step.detailZh.length).toBeGreaterThan(6);
          expect(step.detailEn.length).toBeGreaterThan(6);
        }
      }
      expect(getMalfunctionScenario(kind, 'lift33')).toBe(
        ARCHERY_MALFUNCTION_SCENARIOS[kind]
      );
      expect(getMalfunctionScenario(kind, 'm4a1')).toBe(
        MALFUNCTION_SCENARIOS[kind]
      );
    }

    for (const weaponId of WEAPON_IDS) {
      const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
      expect(prof).toBeDefined();
      expect(prof.weaponId).toBe(weaponId);
      expect(prof.actionPartIds.length).toBeGreaterThan(0);
      expect(prof.lockingPartIds.length).toBeGreaterThan(0);
      expect(prof.fireControlPartIds.length).toBeGreaterThan(0);
      expect(prof.magazinePartIds.length).toBeGreaterThan(0);

      if (weaponId === 'p90') {
        expect(prof.ejectionUpSign).toBe(-1);
        expect(prof.magStripOffsetCm[1]).toBeGreaterThan(0);
      } else if (isArcheryMalfunctionWeapon(weaponId)) {
        expect(prof.ejectionUpSign).toBe(1);
        expect(prof.magStripOffsetCm[2]).toBeGreaterThan(0);
      } else {
        expect(prof.ejectionUpSign).toBe(1);
        expect(prof.magStripOffsetCm[1]).toBeLessThan(0);
      }

      const plugin = await loadWeaponPlugin(weaponId);
      const partIds = new Set(plugin.parts.map((p) => p.id));

      expect(
        partIds.has(prof.extractorPartId),
        `${weaponId}: missing extractorPartId "${prof.extractorPartId}"`
      ).toBe(true);
      for (const id of prof.actionPartIds) {
        expect(
          partIds.has(id),
          `${weaponId}: missing actionPartId "${id}"`
        ).toBe(true);
      }
      for (const id of prof.lockingPartIds) {
        expect(
          partIds.has(id),
          `${weaponId}: missing lockingPartId "${id}"`
        ).toBe(true);
      }
      for (const id of prof.fireControlPartIds) {
        expect(
          partIds.has(id),
          `${weaponId}: missing fireControlPartId "${id}"`
        ).toBe(true);
      }
      for (const id of prof.magazinePartIds) {
        expect(
          partIds.has(id),
          `${weaponId}: missing magazinePartId "${id}"`
        ).toBe(true);
      }
    }
  });

  it('WP-09: executes all 4 clearing drills end-to-end with stoppage freeze frames, mag rip pose delta, and battery recovery', () => {
    const pose = createMutablePose();

    for (const weaponId of ['ak15', 'g17', 'p90', 'lift33', 'r500'] as const) {
      const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];

      for (const kind of MALFUNCTION_ORDER) {
        malfunctionStore.activate(weaponId, kind);
        let snap = malfunctionStore.getSnapshot();
        expect(snap.weaponId).toBe(weaponId);
        expect(snap.activeKind).toBe(kind);
        expect(snap.completedSteps).toBe(0);
        expect(snap.cleared).toBe(false);

        const expectedInitialF =
          kind === 'stovepipe'
            ? prof.stovepipeF
            : kind === 'double_feed'
              ? prof.doubleFeedF
              : kind === 'light_strike'
                ? prof.lightStrikeF
                : prof.outOfBatteryF;

        expect(playbackClock.getState().fireProgress).toBeCloseTo(
          expectedInitialF,
          4
        );

        // Verify diagnostic role highlighting before clearing
        const actionPart = prof.actionPartIds[0];
        expect(
          malfunctionStore.getPartDiagnosticRole(weaponId, actionPart)
        ).not.toBe('none');

        const totalSteps = MALFUNCTION_SCENARIOS[kind].steps.length;
        for (let stepIdx = 0; stepIdx < totalSteps; stepIdx++) {
          if (stepIdx === 0) {
            // 1st step via direct 3D viewport part click
            const clicked = malfunctionStore.handlePartClick(
              weaponId,
              actionPart
            );
            expect(clicked).toBe(true);
          } else {
            expect(malfunctionStore.advanceClearingStep()).toBe(true);
          }

          // Pump 60fps animation stepper so alphas & fireProgress settle
          for (let frame = 0; frame < 45; frame++) {
            malfunctionStore.stepAnimations(1 / 30);
          }

          if (kind === 'double_feed' && stepIdx === 1) {
            // Step 2 of Double-Feed: magazine stripped free
            const vis = malfunctionStore.getTransientVisuals();
            expect(vis.magStripAlpha).toBeCloseTo(1, 2);
            expect(vis.secondRoundDropAlpha).toBeCloseTo(1, 2);

            pose.px = 0;
            pose.py = 0;
            pose.pz = 0;
            malfunctionStore.applyPartPoseDelta(
              weaponId,
              prof.magazinePartIds[0],
              pose
            );
            expect(Math.hypot(pose.px, pose.py, pose.pz)).toBeGreaterThan(1.5);
          }
        }

        snap = malfunctionStore.getSnapshot();
        expect(snap.cleared).toBe(true);
        expect(snap.completedSteps).toBe(totalSteps);
        expect(snap.activeStepId).toBeNull();
        expect(playbackClock.getState().fireProgress).toBeCloseTo(0, 3);
        expect(
          malfunctionStore.getTransientVisuals().freshChamberAlpha
        ).toBeCloseTo(1, 2);

        // Reset drill restores stoppage state immediately
        malfunctionStore.resetDrill();
        expect(malfunctionStore.getSnapshot().cleared).toBe(false);
        expect(malfunctionStore.getSnapshot().completedSteps).toBe(0);
      }
    }
  });

  it('WP-10: computes exact 1:1 millimeter spans (1 unit = 10 mm) and resolves CAD benchmarks on real weapon geometries', async () => {
    expect(WORLD_UNIT_TO_MM).toBe(10);

    // 3-4-5 right triangle in cm -> 50.0 mm hypotenuse
    const m = computeCaliperMeasurement([0, 0, 0], [3, 4, 0]);
    expect(m.distanceCm).toBeCloseTo(5, 6);
    expect(m.distanceMm).toBeCloseTo(50, 6);
    expect(m.dxMm).toBeCloseTo(30, 6);
    expect(m.dyMm).toBeCloseTo(40, 6);
    expect(m.dzMm).toBeCloseTo(0, 6);
    expect(m.midpoint).toEqual([1.5, 2, 0]);

    // 2-click lock & 3rd-click cycle
    caliperStore.recordSurfacePoint('g17', 'slide', [-5, 1, 0], [-1, 0, 0]);
    expect(caliperStore.getSnapshot().pointA?.partId).toBe('slide');
    expect(caliperStore.getSnapshot().pointB).toBeNull();
    expect(caliperStore.getSnapshot().measurement).toBeNull();

    caliperStore.setTransientHover('barrel', 13.6, 1, 0, 1, 0, 0);
    expect(caliperStore.getTransientHover().active).toBe(true);

    caliperStore.recordSurfacePoint('g17', 'barrel', [13.6, 1, 0], [1, 0, 0]);
    const locked = caliperStore.getSnapshot();
    expect(locked.pointB?.partId).toBe('barrel');
    expect(locked.measurement?.distanceMm).toBeCloseTo(186, 4);

    // 3rd click starts a new Point A measurement
    caliperStore.recordSurfacePoint('g17', 'frame', [0, -4, 0], [0, -1, 0]);
    expect(caliperStore.getSnapshot().pointA?.partId).toBe('frame');
    expect(caliperStore.getSnapshot().pointB).toBeNull();

    // Real procedural CAD weapon envelope & benchmark presets on Glock 17
    const g17Plugin = await loadWeaponPlugin('g17');
    await ensureWeaponGeometries(
      'g17',
      g17Plugin.parts.map((p) => p.id)
    );
    const scratch = createMutablePose();
    const evalAssembled = (
      part: (typeof g17Plugin.parts)[number],
      out: typeof scratch
    ) =>
      evaluatePartPoseInto(
        part,
        0,
        false,
        0,
        g17Plugin.computeFiringKinematics,
        out
      );

    const env = computeWeaponEnvelopeMetrics(
      g17Plugin.parts,
      (partId) => getCachedPartGeometry('g17', partId),
      evalAssembled,
      scratch
    );
    expect(env).not.toBeNull();
    expect(env!.lengthMm).toBeGreaterThan(170);
    expect(env!.lengthMm).toBeLessThan(260);
    expect(env!.heightMm).toBeGreaterThan(110);
    expect(env!.widthMm).toBeGreaterThan(24);

    for (const bench of CALIPER_BENCHMARK_ORDER) {
      const ok = caliperStore.applyBenchmarkPreset(
        'g17',
        bench,
        g17Plugin.parts,
        (partId) => getCachedPartGeometry('g17', partId),
        evalAssembled,
        scratch
      );
      expect(ok).toBe(true);
      const snap = caliperStore.getSnapshot();
      expect(snap.activeBenchmark).toBe(bench);
      expect(snap.measurement).not.toBeNull();
      expect(snap.measurement!.distanceMm).toBeGreaterThan(35);
    }

    // Archery CAD envelopes & 1:1 benchmark presets (lift33 ATA / brace height, r500 axle width / rail)
    for (const wid of ['lift33', 'r500'] as const) {
      const plugin = await loadWeaponPlugin(wid);
      await ensureWeaponGeometries(
        wid,
        plugin.parts.map((p) => p.id)
      );
      const evalArchery = (
        part: (typeof plugin.parts)[number],
        out: typeof scratch
      ) =>
        evaluatePartPoseInto(
          part,
          0,
          false,
          0,
          plugin.computeFiringKinematics,
          out
        );
      const archEnv = computeWeaponEnvelopeMetrics(
        plugin.parts,
        (partId) => getCachedPartGeometry(wid, partId),
        evalArchery,
        scratch
      );
      expect(archEnv).not.toBeNull();
      expect(archEnv!.lengthMm).toBeGreaterThan(500);

      for (const bench of CALIPER_BENCHMARK_ORDER) {
        const ok = caliperStore.applyBenchmarkPreset(
          wid,
          bench,
          plugin.parts,
          (partId) => getCachedPartGeometry(wid, partId),
          evalArchery,
          scratch
        );
        expect(ok, `${wid}: failed caliper benchmark ${bench}`).toBe(true);
        const snap = caliperStore.getSnapshot();
        expect(snap.activeBenchmark).toBe(bench);
        expect(snap.measurement).not.toBeNull();
        expect(snap.measurement!.distanceMm).toBeGreaterThan(100);
      }
    }
  });

  it('WP-06: builds all 7 SAAMI/CIP cartridges at exact 1:1 CAD height (9x19mm = 29.69 mm vs .50 BMG = 138.43 mm)', () => {
    expect(CARTRIDGE_LAB_ORDER).toHaveLength(7);
    expect(isCaliberProfile('50_bmg')).toBe(true);
    expect(isCaliberProfile('unknown_cal')).toBe(false);

    let prevSlotX = -Infinity;
    for (const cal of CARTRIDGE_LAB_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[cal];
      expect(spec.caliber).toBe(cal);
      expect(spec.lineupXCm).toBeGreaterThan(prevSlotX);
      prevSlotX = spec.lineupXCm;

      expect(spec.oalMm).toBeGreaterThan(spec.caseLengthMm);
      expect(spec.muzzleEnergyJ).toBeGreaterThan(400);
      expect(spec.nameZh.length).toBeGreaterThan(3);
      expect(spec.nameEn.length).toBeGreaterThan(3);
      expect(spec.highlightZh.length).toBeGreaterThan(10);
      expect(spec.highlightEn.length).toBeGreaterThan(10);

      for (const cutaway of [true, false]) {
        const bundle = getCartridgeLabMeshBundle(cal, cutaway);
        const caseBox = assertFiniteGeometry(
          bundle.caseGeo,
          `${cal}|cut=${cutaway}|case`
        );
        assertFiniteGeometry(
          bundle.primerCupGeo,
          `${cal}|cut=${cutaway}|primer`
        );
        assertFiniteGeometry(bundle.anvilGeo, `${cal}|cut=${cutaway}|anvil`);
        assertFiniteGeometry(
          bundle.propellantGeo,
          `${cal}|cut=${cutaway}|propellant`
        );
        const jacketBox = assertFiniteGeometry(
          bundle.jacketGeo,
          `${cal}|cut=${cutaway}|jacket`
        );
        assertFiniteGeometry(bundle.coreSlugGeo, `${cal}|cut=${cutaway}|core`);
        if (bundle.penetratorGeo) {
          assertFiniteGeometry(
            bundle.penetratorGeo,
            `${cal}|cut=${cutaway}|penetrator`
          );
        }

        // Exact 1:1 standing height check: base at y = 0, projectile tip at y = oalMm / 10
        expect(caseBox.min.y).toBeCloseTo(0, 2);
        expect(caseBox.max.y).toBeCloseTo(spec.caseLengthMm / 10, 1);
        expect(jacketBox.max.y).toBeCloseTo(spec.oalMm / 10, 1);
      }
    }

    // Verify .50 BMG vs 9x19mm 1:1 scale ratio (~4.66x height, ~35x muzzle energy)
    const box9 = assertFiniteGeometry(
      getCartridgeLabMeshBundle('9mm_para', true).jacketGeo,
      '9mm_jacket'
    );
    const box50 = assertFiniteGeometry(
      getCartridgeLabMeshBundle('50_bmg', true).jacketGeo,
      '50bmg_jacket'
    );
    expect(box50.max.y / box9.max.y).toBeCloseTo(138.43 / 29.69, 2);
    expect(CARTRIDGE_LAB_SPECS['50_bmg'].muzzleEnergyJ).toBeGreaterThan(
      CARTRIDGE_LAB_SPECS['9mm_para'].muzzleEnergyJ * 30
    );

    // Archery projectile metadata preserved separately from the 7 metallic SAAMI/CIP lineup
    expect(isArcheryCaliberProfile('arrow_400gr')).toBe(true);
    expect(isArcheryCaliberProfile('bolt_400gr')).toBe(true);
    expect(isArcheryCaliberProfile('556_nato')).toBe(false);
    expect(Object.keys(ARCHERY_PROJECTILE_SPECS)).toEqual([
      'arrow_400gr',
      'bolt_400gr',
    ]);
    expect(getArcheryProjectileMeta('arrow_400gr')?.muzzleEnergyJ).toBeCloseTo(
      145.6,
      0
    );
    expect(getArcheryProjectileMeta('bolt_400gr')?.muzzleEnergyJ).toBeCloseTo(
      301.0,
      0
    );
  });

  it('manages mutually exclusive Wave 2 store modes and preserves 100% zh/en UI string key parity', () => {
    const s = useAppStore;
    s.getState().enterWorkbench('m4a1');
    s.getState().setFieldStripActive(true);
    expect(s.getState().fieldStripActive).toBe(true);

    // Enabling Malfunction mode turns off Field-Strip & Caliper and engages Firing + Cutaway
    s.getState().setMalfunctionActive(true, 'double_feed');
    expect(s.getState().malfunctionActive).toBe(true);
    expect(s.getState().fieldStripActive).toBe(false);
    expect(s.getState().caliperActive).toBe(false);
    expect(s.getState().mode).toBe('firing');
    expect(s.getState().sectionCut).toBe(true);
    expect(malfunctionStore.getSnapshot().activeKind).toBe('double_feed');

    // Enabling Caliper mode pauses playback & disables Field-Strip while allowing
    // live millimeter metrology directly on the frozen malfunction stoppage
    s.getState().setCaliperActive(true);
    expect(s.getState().caliperActive).toBe(true);
    expect(s.getState().envelopeRulerVisible).toBe(true);
    expect(s.getState().malfunctionActive).toBe(true);

    s.getState().setMalfunctionActive(false);
    expect(s.getState().malfunctionActive).toBe(false);

    // Opening Cartridge Cutaway Lab switches screen to 'cartridges' (and falls back cleanly for archery profiles)
    s.getState().openCartridgeLab('arrow_400gr');
    expect(s.getState().screen).toBe('cartridges');
    expect(s.getState().activeCartridgeCaliber).toBe('556_nato');

    s.getState().openCartridgeLab('338_lapua');
    expect(s.getState().screen).toBe('cartridges');
    expect(s.getState().activeCartridgeCaliber).toBe('338_lapua');
    expect(s.getState().cartridgeLineupOverview).toBe(false);

    s.getState().setCartridgeLineupOverview(true);
    expect(s.getState().cartridgeLineupOverview).toBe(true);

    s.getState().setCartridgeExplodeProgress(0.65);
    expect(s.getState().cartridgeExplodeProgress).toBeCloseTo(0.65, 5);

    // Bilingual key symmetry check across new Wave 2 dictionaries
    expect(Object.keys(UI_STRINGS.zh.malfunction).sort()).toEqual(
      Object.keys(UI_STRINGS.en.malfunction).sort()
    );
    expect(Object.keys(UI_STRINGS.zh.caliper).sort()).toEqual(
      Object.keys(UI_STRINGS.en.caliper).sort()
    );
    expect(Object.keys(UI_STRINGS.zh.cartridgeLab).sort()).toEqual(
      Object.keys(UI_STRINGS.en.cartridgeLab).sort()
    );
  });
});

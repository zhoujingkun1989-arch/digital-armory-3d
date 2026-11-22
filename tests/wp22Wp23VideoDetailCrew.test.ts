import { beforeEach, describe, expect, it } from 'vitest';
import {
  deserializeExamLedger,
  EXAM_STORAGE_KEY,
  useArmorerExamStore,
} from '../src/engine/exam/armorerExamStore';
import { buildDetailStripPlan } from '../src/engine/fieldstrip/detailStripGenerator';
import { FIELD_STRIP_PLANS } from '../src/engine/fieldstrip/fieldStripSpecs';
import { createMutablePose } from '../src/engine/kinematics/math';
import {
  applyTankCrewTransformInto,
  computeTankFcsSolution,
  getTankCrewSpec,
  type TankWeaponId,
  useTankCrewStore,
} from '../src/engine/tank/tankCrewStore';
import { PASSPORT_STRINGS } from '../src/features/passport/passportStrings';
import {
  buildReelFilename,
  pickSupportedVideoMimeType,
  REEL_PRESETS,
} from '../src/features/video/directorReelRecorder';
import { DIRECTOR_REEL_STRINGS } from '../src/features/video/directorReelStrings';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

const CJK_REGEX = /[\u4e00-\u9fff]/;

describe('WP-22 Director Reel, WP-23 Detail Strip, Passport & 1:1 Tank Crew FCS', () => {
  beforeEach(() => {
    useArmorerExamStore.getState().clearExamLedger();
    useTankCrewStore.getState().resetForWeapon('ztz99a');
  });

  it('provides valid Director Reel MIME selection, filename builder, presets, and 0-CJK EN strings', () => {
    expect(REEL_PRESETS['1080p_16x9'].width).toBe(1920);
    expect(REEL_PRESETS['1080p_9x16'].height).toBe(1920);
    expect(
      pickSupportedVideoMimeType((m) => m === 'video/webm;codecs=vp8,opus')
    ).toBe('video/webm;codecs=vp8,opus');
    expect(pickSupportedVideoMimeType(() => false)).toBe('video/webm');

    expect(buildReelFilename('ztz99a', '1080p_16x9', 'video/webm')).toBe(
      'digital-armory-ztz99a-1080p_16x9.webm'
    );
    expect(buildReelFilename('ak15', '1080p_9x16', 'video/mp4')).toBe(
      'digital-armory-ak15-1080p_9x16.mp4'
    );
    expect(CJK_REGEX.test(JSON.stringify(DIRECTOR_REEL_STRINGS.en))).toBe(
      false
    );
  });

  it('builds strictly acyclic Two-Tier Detail Strip DAGs across all 27 exhibits without breaking EN 0-CJK rules', async () => {
    for (const id of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(id);
      const fieldPlan = FIELD_STRIP_PLANS[id];
      const detailPlan = buildDetailStripPlan(id, plugin.parts);

      expect(detailPlan.steps.length).toBeGreaterThanOrEqual(
        fieldPlan.steps.length
      );
      expect(CJK_REGEX.test(detailPlan.manualCodeEn)).toBe(false);

      const seenIds = new Set<string>();
      for (const s of detailPlan.steps) {
        expect(seenIds.has(s.id)).toBe(false);
        seenIds.add(s.id);
        expect(CJK_REGEX.test(s.titleEn)).toBe(false);
        expect(CJK_REGEX.test(s.actionHintEn)).toBe(false);
      }

      // Topological sort acyclicity proof
      const stripped = new Set<string>();
      while (stripped.size < detailPlan.steps.length) {
        const next = detailPlan.steps.find(
          (st) =>
            !stripped.has(st.id) &&
            st.requires.every((req) => stripped.has(req))
        );
        expect(next, `Detail DAG cycle or missing req for ${id}`).toBeDefined();
        stripped.add(next!.id);
      }
    }
  }, 20000);

  it('round-trips Armorer Mastery Passport JSON export/import and keeps EN 0-CJK parity', () => {
    const mockLedger = {
      ak15: {
        fieldStripRank: 'S' as const,
        bestFieldStripMs: 14200,
        bestFieldStripScore: 1120,
        detailStripRank: 'A' as const,
        triageRank: 'S' as const,
        bestTriageScore: 1140,
        certifiedAt: '2026-11-22T00:00:00.000Z',
      },
    };
    useArmorerExamStore.setState({ ledger: mockLedger });
    const json = useArmorerExamStore.getState().exportPassportJson();

    useArmorerExamStore.setState({ ledger: {} });
    const bad = useArmorerExamStore.getState().importPassportJson('{"bad":1}');
    expect(bad.ok).toBe(false);

    const good = useArmorerExamStore.getState().importPassportJson(json);
    expect(good.ok).toBe(true);
    expect(good.importedCount).toBe(1);
    const loaded = useArmorerExamStore.getState().ledger.ak15;
    expect(loaded.fieldStripRank).toBe('S');
    expect(loaded.detailStripRank).toBe('A');
    expect(loaded.triageRank).toBe('S');

    // Also verify deserializeExamLedger backward compatibility
    const compat = deserializeExamLedger(
      JSON.stringify({
        g17: { fieldStripRank: 'B', triageRank: null },
      })
    );
    expect(compat.g17.fieldStripRank).toBe('B');
    expect(EXAM_STORAGE_KEY).toContain('digital-armory');
    expect(CJK_REGEX.test(JSON.stringify(PASSPORT_STRINGS.en))).toBe(false);
  });

  it('evaluates exact 3D turret traverse & gun trunnion elevation pivots and FCS ballistics for all 4 MBTs', () => {
    const tanks: readonly TankWeaponId[] = [
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
    ];
    for (const tankId of tanks) {
      const spec = getTankCrewSpec(tankId);
      expect(spec).not.toBeNull();
      const [mainGunId] = [...spec!.gunPartIds];
      const pose = createMutablePose();
      pose.px = spec!.trunnionPivot[0] + 100;
      pose.py = spec!.trunnionPivot[1];
      pose.pz = 0;

      // 90 deg yaw + 10 deg elevation rotates muzzle cleanly around ring & trunnion
      applyTankCrewTransformInto(tankId, mainGunId, 90, 10, pose);
      expect(pose.py).toBeGreaterThan(spec!.trunnionPivot[1]);
      expect(pose.ry).toBeCloseTo(Math.PI / 2, 4);
      expect(pose.rz).toBeCloseTo((10 * Math.PI) / 180, 4);

      // Non-turret hull part remains stationary
      const hullPose = createMutablePose();
      applyTankCrewTransformInto(tankId, 'some_hull_part', 90, 10, hullPose);
      expect(hullPose.px).toBe(0);
      expect(hullPose.ry).toBe(0);

      const sol = computeTankFcsSolution(tankId, 2000, 36);
      expect(sol.tofSec).toBeGreaterThan(0.5);
      expect(sol.superelevationMil).toBeGreaterThan(0);
      expect(sol.leadMil).toBeGreaterThan(0);
    }
  });
});

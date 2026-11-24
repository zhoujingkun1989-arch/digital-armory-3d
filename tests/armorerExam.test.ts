import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { playbackClock } from '../src/engine/clock/playbackClock';
import {
  compareExamRanks,
  computeExamRank,
  computeFieldStripExamScore,
  computeTriageExamScore,
  deserializeExamLedger,
  EXAM_STORAGE_KEY,
  formatExamDuration,
  getWeaponExamSummary,
  setExamClockForTests,
  useArmorerExamStore,
} from '../src/engine/exam/armorerExamStore';
import { EXAM_STRINGS } from '../src/engine/exam/examStrings';
import {
  FIELD_STRIP_PLANS,
  type FieldStripStepSpec,
} from '../src/engine/fieldstrip/fieldStripSpecs';
import { fieldStripStore } from '../src/engine/fieldstrip/fieldStripStore';
import {
  getMalfunctionScenario,
  MALFUNCTION_ORDER,
  WEAPON_MALFUNCTION_PROFILES,
} from '../src/engine/malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../src/engine/malfunctions/malfunctionStore';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const CJK_OR_FULLWIDTH_RE =
  /[\u2E80-\u9FFF\uF900-\uFAFF\uFE30-\uFE4F\uFF00-\uFFEF]/;

class MemoryStorage {
  private map = new Map<string, string>();

  public getItem(key: string): string | null {
    return this.map.has(key) ? this.map.get(key)! : null;
  }

  public setItem(key: string, value: string): void {
    this.map.set(key, String(value));
  }

  public removeItem(key: string): void {
    this.map.delete(key);
  }

  public clear(): void {
    this.map.clear();
  }
}

/**
 * Computes a valid topological disassembly order from `plan.steps` based ONLY on
 * DAG `requires` edges (mirroring a skilled human armorer clicking 3D parts).
 */
function resolveValidTopologicalOrder(
  steps: readonly FieldStripStepSpec[]
): FieldStripStepSpec[] {
  const stripped = new Set<string>();
  const ordered: FieldStripStepSpec[] = [];

  while (ordered.length < steps.length) {
    const next = steps.find(
      (s) =>
        !stripped.has(s.id) && s.requires.every((reqId) => stripped.has(reqId))
    );
    expect(next, 'DAG must always have an unblocked step').toBeDefined();
    stripped.add(next!.id);
    ordered.push(next!);
  }
  return ordered;
}

describe('WP-13 Armorer Blind Field-Strip Exam & Random Unknown Stoppage Triage', () => {
  let mockStorage: MemoryStorage;
  let originalLocalStorageDescriptor: PropertyDescriptor | undefined;
  let simulatedNowMs = 1_000;

  beforeEach(() => {
    originalLocalStorageDescriptor = Object.getOwnPropertyDescriptor(
      globalThis,
      'localStorage'
    );
    mockStorage = new MemoryStorage();
    Object.defineProperty(globalThis, 'localStorage', {
      value: mockStorage,
      configurable: true,
      writable: true,
    });

    simulatedNowMs = 1_000;
    setExamClockForTests(() => simulatedNowMs);

    useAppStore.getState().resetAll();
    useArmorerExamStore.getState().exitBlindFieldStrip(true);
    useArmorerExamStore.getState().exitBlindTriage();
    useArmorerExamStore.getState().clearExamLedger();
  });

  afterEach(() => {
    setExamClockForTests(null);
    if (originalLocalStorageDescriptor) {
      Object.defineProperty(
        globalThis,
        'localStorage',
        originalLocalStorageDescriptor
      );
    }
  });

  it('maintains 100% zh/en key parity and strictly 0 CJK characters across EXAM_STRINGS.en', () => {
    const collectStrings = (node: unknown, path: string): string[] => {
      if (typeof node === 'string') {
        expect(node.trim().length, `${path} should be non-empty`).toBeGreaterThan(
          0
        );
        return [node];
      }
      if (typeof node === 'function') {
        const fn = node as (...args: unknown[]) => unknown;
        let sample: unknown;
        if (path.includes('blindNodeLabel')) {
          sample = [
            fn('01', 'done'),
            fn('02', 'current'),
            fn('03', 'pending'),
          ].join(' | ');
        } else if (path.includes('personalBestTitle')) {
          sample = fn('S', 1150);
        } else if (path.includes('bestSummary')) {
          sample = fn('S', 1160, '00:21.4');
        } else if (path.includes('diagnosisConfirmedHeadline')) {
          sample = fn('Type-3 Double-Feed');
        } else if (path.includes('completedActionBadge')) {
          sample = fn('01');
        } else {
          sample = fn(3, 6);
        }
        expect(typeof sample, `${path} return value must be string`).toBe(
          'string'
        );
        return [sample as string];
      }
      if (node && typeof node === 'object') {
        const acc: string[] = [];
        for (const [k, v] of Object.entries(node as Record<string, unknown>)) {
          acc.push(...collectStrings(v, `${path}.${k}`));
        }
        return acc;
      }
      return [];
    };

    const zhKeys = Object.keys(EXAM_STRINGS.zh).sort();
    const enKeys = Object.keys(EXAM_STRINGS.en).sort();
    expect(enKeys).toEqual(zhKeys);

    const zhStrings = collectStrings(EXAM_STRINGS.zh, 'zh');
    const enStrings = collectStrings(EXAM_STRINGS.en, 'en');
    expect(zhStrings.length).toBeGreaterThan(30);
    expect(enStrings.length).toBe(zhStrings.length);

    for (const text of enStrings) {
      expect(
        CJK_OR_FULLWIDTH_RE.test(text),
        `Found CJK/fullwidth character leak in English exam string: "${text}"`
      ).toBe(false);
    }
  });

  it('calculates S / A / B / C grades, par time bonuses, and clamping [0..1200] accurately', () => {
    // Exact rank boundary rules
    expect(computeExamRank(1200, 0)).toBe('S');
    expect(computeExamRank(1050, 0)).toBe('S');
    expect(computeExamRank(1049, 0)).toBe('A');
    expect(computeExamRank(1120, 1)).toBe('A'); // >= 1050 but 1 mistake -> A!
    expect(computeExamRank(880, 1)).toBe('A');
    expect(computeExamRank(950, 2)).toBe('B'); // >= 880 but 2 mistakes -> B!
    expect(computeExamRank(700, 4)).toBe('B');
    expect(computeExamRank(699, 0)).toBe('C');
    expect(computeExamRank(0, 18)).toBe('C');

    expect(compareExamRanks('S', 'A')).toBeGreaterThan(0);
    expect(compareExamRanks('A', 'B')).toBeGreaterThan(0);
    expect(compareExamRanks('B', 'C')).toBeGreaterThan(0);
    expect(compareExamRanks('C', null)).toBeGreaterThan(0);

    // 6-step field-strip: parSeconds = 6 * 2 * 4.5 = 54s
    const fastPerfect = computeFieldStripExamScore({
      totalSteps: 6,
      mistakeCount: 0,
      elapsedMs: 18_000,
    });
    expect(fastPerfect.parSeconds).toBeCloseTo(54, 5);
    expect(fastPerfect.timeBonus).toBe(133);
    expect(fastPerfect.totalScore).toBe(1133);
    expect(fastPerfect.rank).toBe('S');

    // Instant completion clamps to 1200
    const instantPerfect = computeFieldStripExamScore({
      totalSteps: 6,
      mistakeCount: 0,
      elapsedMs: 0,
    });
    expect(instantPerfect.totalScore).toBe(1200);
    expect(instantPerfect.rank).toBe('S');

    // Heavy errors clamp cleanly at 0
    const manyMistakes = computeFieldStripExamScore({
      totalSteps: 6,
      mistakeCount: 25,
      elapsedMs: 90_000,
    });
    expect(manyMistakes.totalScore).toBe(0);
    expect(manyMistakes.rank).toBe('C');

    // Triage scoring check
    const triageA = computeTriageExamScore({
      totalClearanceSteps: 3,
      wrongDiagnosisCount: 1,
      wrongClearanceCount: 0,
      elapsedMs: 12_000,
    });
    expect(triageA.diagnosisPenalty).toBe(120);
    expect(triageA.totalScore).toBeGreaterThanOrEqual(880);
    expect(triageA.rank).toBe('A');

    expect(formatExamDuration(24_650)).toBe('00:24.6');
    expect(formatExamDuration(125_300)).toBe('02:05.3');
  });

  it('executes full Blind Timed Field-Strip & Reassembly (0 -> N -> 0) dynamically across all 29 exhibits while locking hints/auto-solve', async () => {
    expect(WEAPON_IDS).toHaveLength(34);
    for (const weaponId of WEAPON_IDS) {
      const plan = FIELD_STRIP_PLANS[weaponId];
      const topoSteps = resolveValidTopologicalOrder(plan.steps);

      simulatedNowMs = 10_000;
      useArmorerExamStore.getState().startBlindFieldStrip(weaponId);

      let ex = useArmorerExamStore.getState().fieldStripExam;
      expect(ex.active).toBe(true);
      expect(ex.weaponId).toBe(weaponId);
      expect(ex.phase).toBe('disassembly');
      expect(ex.totalSteps).toBe(plan.steps.length);
      expect(ex.parSeconds).toBeCloseTo(plan.steps.length * 2 * 4.5, 5);

      // Verify spoilers, hints, phase switch, and auto-solve are 100% locked/redacted!
      expect(fieldStripStore.getSnapshot().recommendedStepId).toBeNull();
      expect(fieldStripStore.triggerHint()).toBeNull();
      expect(fieldStripStore.performRecommendedStep().outcome).toBe(
        'non_strip_part'
      );
      expect(useArmorerExamStore.getState().fieldStripExam.mistakeCount).toBe(
        0
      );

      // Stage 1: Blind Disassembly (0 -> N)
      for (let i = 0; i < topoSteps.length; i++) {
        simulatedNowMs += 1_500;
        const partId = topoSteps[i].triggerPartIds[0];
        const res = fieldStripStore.attemptPartClick(weaponId, partId);
        expect(res.outcome).toBe('stripped');

        ex = useArmorerExamStore.getState().fieldStripExam;
        if (i < topoSteps.length - 1) {
          expect(ex.phase).toBe('disassembly');
          expect(ex.completedPhaseSteps).toBe(i + 1);
        } else {
          // Automatic transition at N/N into reverse reassembly!
          expect(ex.phase).toBe('reassembly');
          expect(ex.completedPhaseSteps).toBe(0);
          expect(fieldStripStore.getSnapshot().phase).toBe('reassemble');
        }
      }

      // Stage 2: Blind Reverse-Topological Reassembly (N -> 0)
      for (let i = topoSteps.length - 1; i >= 0; i--) {
        simulatedNowMs += 1_500;
        const partId = topoSteps[i].triggerPartIds[0];
        const res = fieldStripStore.attemptPartClick(weaponId, partId);
        expect(res.outcome).toBe('reassembled');
      }

      ex = useArmorerExamStore.getState().fieldStripExam;
      expect(ex.phase).toBe('completed');
      expect(ex.mistakeCount).toBe(0);
      expect(ex.rank).toBe('S');
      expect(ex.finalScore).toBeGreaterThanOrEqual(1050);
      expect(fieldStripStore.getSnapshot().fullCycleCompleted).toBe(true);

      const summary = getWeaponExamSummary(weaponId);
      expect(summary.isCertified).toBe(true);
      expect(summary.fieldStripRank).toBe('S');
      expect(summary.stars).toBe(4);
    }
  });

  it('deducts -75 pts per blind interference / wrong-part click and pulses red WITHOUT leaking prerequisite part IDs or names', async () => {
    const weaponId: WeaponId = 'ak15';
    const plugin = await loadWeaponPlugin(weaponId);
    const plan = FIELD_STRIP_PLANS[weaponId];

    simulatedNowMs = 5_000;
    useArmorerExamStore.getState().startBlindFieldStrip(weaponId);

    // 1. Click a blocked dependent part (`ak_bolt` requires `ak_strip_bcg`)
    const boltStep = plan.steps.find((s) => s.id === 'ak_strip_bolt')!;
    const prereqStep = plan.steps.find((s) => s.id === 'ak_strip_bcg')!;
    const blockedRes = fieldStripStore.attemptPartClick(
      weaponId,
      boltStep.triggerPartIds[0]
    );
    expect(blockedRes.outcome).toBe('blocked');
    expect(blockedRes.stepId).toBeNull(); // Step ID redacted in blind exam!

    const fsSnap = fieldStripStore.getSnapshot();
    expect(fsSnap.interference).not.toBeNull();
    expect(fsSnap.interference!.blockingStepIds).toEqual([]);
    // Redacted message must NOT mention "枪机框" or "bolt carrier"
    expect(fsSnap.interference!.messageZh).not.toContain('枪机框');
    expect(fsSnap.interference!.messageEn.toLowerCase()).not.toContain(
      'bolt carrier'
    );
    expect(CJK_OR_FULLWIDTH_RE.test(fsSnap.interference!.messageEn)).toBe(
      false
    );

    // Clicked part pulses red ('blocking'), while secret prerequisite part stays 'none'!
    const perfNow =
      typeof performance !== 'undefined' ? performance.now() : Date.now();
    expect(
      fieldStripStore.getPartHighlight(
        weaponId,
        boltStep.triggerPartIds[0],
        perfNow
      )
    ).toBe('blocking');
    expect(
      fieldStripStore.getPartHighlight(
        weaponId,
        prereqStep.triggerPartIds[0],
        perfNow
      )
    ).toBe('none');

    let ex = useArmorerExamStore.getState().fieldStripExam;
    expect(ex.mistakeCount).toBe(1);
    expect(ex.mistakePenalty).toBe(75);
    expect(ex.finalScore).toBe(925);

    // 2. Click a non-removable base chassis part -> also -75 pts + red pulse
    const claimed = new Set<string>();
    for (const s of plan.steps) {
      s.triggerPartIds.forEach((id) => claimed.add(id));
      s.bindings.forEach((b) => claimed.add(b.partId));
    }
    const basePart = plugin.parts.find((p) => !claimed.has(p.id))!;
    const wrongRes = fieldStripStore.attemptPartClick(weaponId, basePart.id);
    expect(wrongRes.outcome).toBe('non_strip_part');

    ex = useArmorerExamStore.getState().fieldStripExam;
    expect(ex.mistakeCount).toBe(2);
    expect(ex.mistakePenalty).toBe(150);
    expect(ex.finalScore).toBe(850);

    // 3. Complete valid cycle after 2 mistakes at slow time -> score = 850 -> Rank B!
    const topo = resolveValidTopologicalOrder(plan.steps);
    for (const s of topo) {
      fieldStripStore.attemptPartClick(weaponId, s.triggerPartIds[0]);
    }
    // Attempt out-of-order reassembly during Stage 2 (`ak_mag_body` while `ak_bolt_carrier` still stripped) -> 3rd mistake (-225)
    const revBlock = fieldStripStore.attemptPartClick(
      weaponId,
      plan.steps[0].triggerPartIds[0]
    );
    expect(revBlock.outcome).toBe('blocked');
    expect(useArmorerExamStore.getState().fieldStripExam.mistakeCount).toBe(3);

    simulatedNowMs += 60_000; // Over 54s par -> 0 time bonus -> 1000 - 225 = 775 -> Rank B
    for (let i = topo.length - 1; i >= 0; i--) {
      fieldStripStore.attemptPartClick(weaponId, topo[i].triggerPartIds[0]);
    }

    ex = useArmorerExamStore.getState().fieldStripExam;
    expect(ex.phase).toBe('completed');
    expect(ex.finalScore).toBe(775);
    expect(ex.rank).toBe('B');
  });

  it('runs Blind Unknown Stoppage Triage (diagnosis + wrong-guess -120 penalty + out-of-order -60 penalty + clearance) across firearms, revolver, and archery', () => {
    const testCases: Array<{
      weaponId: WeaponId;
      kind: (typeof MALFUNCTION_ORDER)[number];
      wrongGuess: (typeof MALFUNCTION_ORDER)[number];
    }> = [
      { weaponId: 'm4a1', kind: 'double_feed', wrongGuess: 'stovepipe' },
      { weaponId: 'm249', kind: 'stovepipe', wrongGuess: 'double_feed' },
      { weaponId: 'p08', kind: 'light_strike', wrongGuess: 'out_of_battery' },
      { weaponId: 'vector', kind: 'out_of_battery', wrongGuess: 'stovepipe' },
      { weaponId: 'python', kind: 'out_of_battery', wrongGuess: 'light_strike' },
      { weaponId: 'lift33', kind: 'stovepipe', wrongGuess: 'double_feed' },
      { weaponId: 'r500', kind: 'light_strike', wrongGuess: 'out_of_battery' },
    ];

    for (const { weaponId, kind, wrongGuess } of testCases) {
      simulatedNowMs = 20_000;
      useArmorerExamStore.getState().startBlindTriage(weaponId, {
        forcedKind: kind,
      });

      let tr = useArmorerExamStore.getState().triageExam;
      expect(tr.active).toBe(true);
      expect(tr.weaponId).toBe(weaponId);
      expect(tr.phase).toBe('diagnosis');
      expect(tr.secretKind).toBe(kind);

      // Shuffled step indices must be a valid non-identity permutation of 0..N-1
      const scenario = getMalfunctionScenario(kind, weaponId);
      expect(tr.shuffledStepIndices.length).toBe(scenario.steps.length);
      expect([...tr.shuffledStepIndices].sort((a, b) => a - b)).toEqual(
        scenario.steps.map((_, idx) => idx)
      );
      expect(
        tr.shuffledStepIndices.every((val, idx) => val === idx)
      ).toBe(false);

      // 3D stoppage pose is active, while diagnostic glow & direct step advance are suppressed in Step A!
      const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
      expect(
        malfunctionStore.getPartDiagnosticRole(weaponId, prof.extractorPartId)
      ).toBe('none');
      expect(malfunctionStore.advanceClearingStep()).toBe(false);
      expect(
        malfunctionStore.handlePartClick(weaponId, prof.actionPartIds[0])
      ).toBe(false);
      expect(playbackClock.getState().fireProgress).toBeGreaterThan(0);

      // Wrong diagnosis guess deducts -120 pts (duplicate click on same wrong guess is ignored)
      expect(
        useArmorerExamStore.getState().submitTriageDiagnosis(wrongGuess)
      ).toBe('wrong');
      expect(
        useArmorerExamStore.getState().submitTriageDiagnosis(wrongGuess)
      ).toBe('already_guessed');

      tr = useArmorerExamStore.getState().triageExam;
      expect(tr.wrongDiagnosisCount).toBe(1);
      expect(tr.diagnosisPenalty).toBe(120);
      expect(tr.finalScore).toBe(880);

      // Correct diagnosis unlocks Step B (`clearance`)
      expect(useArmorerExamStore.getState().submitTriageDiagnosis(kind)).toBe(
        'correct'
      );
      tr = useArmorerExamStore.getState().triageExam;
      expect(tr.phase).toBe('clearance');

      // Out-of-order clearance step click deducts -60 pts without advancing!
      expect(
        useArmorerExamStore.getState().attemptTriageClearanceStep(2)
      ).toBe('out_of_order');
      tr = useArmorerExamStore.getState().triageExam;
      expect(tr.wrongClearanceCount).toBe(1);
      expect(tr.clearancePenalty).toBe(60);
      expect(tr.completedClearanceSteps).toBe(0);

      // Execute valid clearance steps 0 .. N-1 in order
      simulatedNowMs += 8_000;
      for (let idx = 0; idx < scenario.steps.length; idx++) {
        const res = useArmorerExamStore
          .getState()
          .attemptTriageClearanceStep(idx);
        expect(res).toBe(
          idx === scenario.steps.length - 1 ? 'completed' : 'advanced'
        );
      }

      tr = useArmorerExamStore.getState().triageExam;
      expect(tr.phase).toBe('completed');
      expect(malfunctionStore.getSnapshot().cleared).toBe(true);
      // 2 total mistakes (1 diag + 1 order) with fast speed bonus -> >= 700 -> Rank B!
      expect(tr.rank).toBe('B');
      expect(getWeaponExamSummary(weaponId).triageRank).toBe('B');
    }
  });

  it('persists qualification records safely in localStorage under digital-armory-v2-exam-certs and preserves personal bests across reloads', () => {
    const weaponId: WeaponId = 'g17';
    const plan = FIELD_STRIP_PLANS[weaponId];
    const topo = resolveValidTopologicalOrder(plan.steps);

    // 1. Complete perfect fast Blind Field-Strip -> S rank
    simulatedNowMs = 1_000;
    useArmorerExamStore.getState().startBlindFieldStrip(weaponId);
    simulatedNowMs = 13_000; // 12.0s elapsed
    for (const s of topo) {
      fieldStripStore.attemptPartClick(weaponId, s.triggerPartIds[0]);
    }
    for (let i = topo.length - 1; i >= 0; i--) {
      fieldStripStore.attemptPartClick(weaponId, topo[i].triggerPartIds[0]);
    }
    expect(useArmorerExamStore.getState().fieldStripExam.rank).toBe('S');
    expect(useArmorerExamStore.getState().fieldStripExam.isNewRecord).toBe(
      true
    );
    const bestScoreS =
      useArmorerExamStore.getState().fieldStripExam.finalScore;

    // 2. Run a slower, mistake-heavy C-rank attempt -> must NOT overwrite S personal best!
    simulatedNowMs = 50_000;
    useArmorerExamStore.getState().startBlindFieldStrip(weaponId);
    const depStep = plan.steps.find((s) => s.requires.length > 0)!;
    for (let m = 0; m < 5; m++) {
      fieldStripStore.attemptPartClick(weaponId, depStep.triggerPartIds[0]);
    }
    simulatedNowMs = 120_000; // 70.0s elapsed
    for (const s of topo) {
      fieldStripStore.attemptPartClick(weaponId, s.triggerPartIds[0]);
    }
    for (let i = topo.length - 1; i >= 0; i--) {
      fieldStripStore.attemptPartClick(weaponId, topo[i].triggerPartIds[0]);
    }
    expect(useArmorerExamStore.getState().fieldStripExam.rank).toBe('C');
    expect(useArmorerExamStore.getState().fieldStripExam.isNewRecord).toBe(
      false
    );

    // 3. Complete perfect fast Blind Triage -> S rank (Dual Certified!)
    simulatedNowMs = 200_000;
    useArmorerExamStore.getState().startBlindTriage(weaponId, {
      forcedKind: 'stovepipe',
    });
    expect(
      useArmorerExamStore.getState().submitTriageDiagnosis('stovepipe')
    ).toBe('correct');
    simulatedNowMs = 208_000;
    for (let idx = 0; idx < 3; idx++) {
      useArmorerExamStore.getState().attemptTriageClearanceStep(idx);
    }
    expect(useArmorerExamStore.getState().triageExam.rank).toBe('S');

    // 4. Inspect raw JSON written to `localStorage` and test full round-trip hydration
    const rawSaved = mockStorage.getItem(EXAM_STORAGE_KEY);
    expect(rawSaved).not.toBeNull();
    const parsed = JSON.parse(rawSaved!);
    expect(parsed.g17).toMatchObject({
      fieldStripRank: 'S',
      bestFieldStripMs: 12_000,
      bestFieldStripScore: bestScoreS,
      triageRank: 'S',
    });
    expect(typeof parsed.g17.certifiedAt).toBe('string');

    // Wipe in-memory ledger, restore rawSaved to storage, and re-hydrate!
    useArmorerExamStore.setState({ ledger: {} });
    mockStorage.setItem(EXAM_STORAGE_KEY, rawSaved!);
    useArmorerExamStore.getState().hydrateLedgerFromStorage();

    const restored = getWeaponExamSummary('g17');
    expect(restored.fieldStripRank).toBe('S');
    expect(restored.bestFieldStripMs).toBe(12_000);
    expect(restored.bestFieldStripScore).toBe(bestScoreS);
    expect(restored.triageRank).toBe('S');
    expect(restored.overallRank).toBe('S');
    expect(restored.isCertified).toBe(true);
    expect(restored.isDualCertified).toBe(true);
    expect(restored.stars).toBe(4);

    // Corrupted JSON resilience
    expect(deserializeExamLedger('{not-valid-json')).toEqual({});
    expect(deserializeExamLedger('[]')).toEqual({});
  });
});

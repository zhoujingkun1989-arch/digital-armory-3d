import type {
  MutablePartPose,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import {
  playTriggerDryBlockSound,
  playWorkbenchFoley,
} from '../audio/mechanicalSoundEngine';
import { smoothstep01 } from '../kinematics/math';
import {
  FIELD_STRIP_PLANS,
  type FieldStripStepSpec,
  type FieldStripWeaponPlan,
} from './fieldStripSpecs';

export type FieldStripPhase = 'strip' | 'reassemble';

export type FieldStripPartHighlightKind =
  | 'none'
  | 'blocking'
  | 'blocked'
  | 'hint';

export interface FieldStripInterferenceAlert {
  severity: 'interference' | 'info';
  attemptedPartId: string;
  attemptedStepId: string | null;
  blockingStepIds: readonly string[];
  blockingPartIds: readonly string[];
  messageZh: string;
  messageEn: string;
  seq: number;
}

export interface FieldStripSnapshot {
  weaponId: WeaponId;
  phase: FieldStripPhase;
  strippedStepIds: readonly string[];
  strippedCount: number;
  totalSteps: number;
  recommendedStepId: string | null;
  fullCycleCompleted: boolean;
  interference: FieldStripInterferenceAlert | null;
  hintStepId: string | null;
  hintSeq: number;
}

export interface FieldStripClickOutcome {
  outcome: 'stripped' | 'reassembled' | 'blocked' | 'non_strip_part';
  stepId: string | null;
  focusPartId: string | null;
}

export interface FieldStripExamBridge {
  isBlindActiveForWeapon: (weaponId: WeaponId) => boolean;
  isBlindCompletedForWeapon: (weaponId: WeaponId) => boolean;
  getRedactedMessages: () => {
    stripBlockedZh: string;
    stripBlockedEn: string;
    reassembleBlockedZh: string;
    reassembleBlockedEn: string;
    wrongPartZh: string;
    wrongPartEn: string;
  };
  onAttemptOutcome: (params: {
    weaponId: WeaponId;
    outcome: 'stripped' | 'reassembled' | 'blocked' | 'non_strip_part';
    strippedCount: number;
    totalSteps: number;
    phase: FieldStripPhase;
    fullCycleCompleted: boolean;
  }) => void;
  onExternalReset: (weaponId: WeaponId) => void;
}

interface CompiledPartStepRef {
  stepIndex: number;
  explodeStepIndices: readonly number[];
}

interface CompiledWeaponFieldStripCache {
  plan: FieldStripWeaponPlan;
  stepIndexById: ReadonlyMap<string, number>;
  /** Steps where `partId` is explicitly listed in `triggerPartIds` */
  triggerStepsByPartId: ReadonlyMap<string, readonly number[]>;
  /** All steps whose `bindings` move `partId` */
  boundStepsByPartId: ReadonlyMap<string, readonly CompiledPartStepRef[]>;
  /** Reverse adjacency: for step `u`, indices of steps `v` that list `u.id` in `v.requires` */
  dependentsByStepIndex: readonly (readonly number[])[];
  /** Live 60fps continuous progress [0..1] per step (Zero-GC in-place buffer) */
  alphas: Float32Array;
  /** Discrete target [0 | 1] per step */
  targets: Uint8Array;
}

const ANIMATION_SPEED_PER_SEC = 2.55;
const BLOCK_HIGHLIGHT_DURATION_MS = 2800;
const HINT_HIGHLIGHT_DURATION_MS = 2600;

function nowTimestampMs(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function compileWeaponCache(weaponId: WeaponId): CompiledWeaponFieldStripCache {
  const plan = FIELD_STRIP_PLANS[weaponId];
  const stepCount = plan.steps.length;
  const stepIndexById = new Map<string, number>();
  const triggerMap = new Map<string, number[]>();
  const boundMap = new Map<string, CompiledPartStepRef[]>();

  for (let i = 0; i < stepCount; i++) {
    const step = plan.steps[i];
    stepIndexById.set(step.id, i);

    for (const trigPartId of step.triggerPartIds) {
      let arr = triggerMap.get(trigPartId);
      if (!arr) {
        arr = [];
        triggerMap.set(trigPartId, arr);
      }
      arr.push(i);
    }

    for (const b of step.bindings) {
      let arr = boundMap.get(b.partId);
      if (!arr) {
        arr = [];
        boundMap.set(b.partId, arr);
      }
      arr.push({
        stepIndex: i,
        explodeStepIndices: b.explodeStepIndices,
      });
    }
  }

  const dependents: number[][] = Array.from({ length: stepCount }, () => []);
  for (let v = 0; v < stepCount; v++) {
    const step = plan.steps[v];
    for (const reqId of step.requires) {
      const u = stepIndexById.get(reqId);
      if (u !== undefined) {
        dependents[u].push(v);
      }
    }
  }

  return {
    plan,
    stepIndexById,
    triggerStepsByPartId: triggerMap,
    boundStepsByPartId: boundMap,
    dependentsByStepIndex: dependents,
    alphas: new Float32Array(stepCount),
    targets: new Uint8Array(stepCount),
  };
}

const caches = new Map<WeaponId, CompiledWeaponFieldStripCache>();

function getWeaponCache(weaponId: WeaponId): CompiledWeaponFieldStripCache {
  let c = caches.get(weaponId);
  if (!c) {
    c = compileWeaponCache(weaponId);
    caches.set(weaponId, c);
  }
  return c;
}

class FieldStripRuntimeController {
  private activeWeaponId: WeaponId = 'ak15';
  private phase: FieldStripPhase = 'strip';
  private fullCycleCompleted = false;
  private interference: FieldStripInterferenceAlert | null = null;
  private alertSeq = 0;
  private hintStepId: string | null = null;
  private hintSeq = 0;

  // Transient 60fps highlight sets (zero React re-renders)
  private blockingParts = new Set<string>();
  private blockedParts = new Set<string>();
  private blockHighlightUntilMs = 0;
  private hintParts = new Set<string>();
  private hintHighlightUntilMs = 0;

  private snapshot: FieldStripSnapshot;
  private listeners = new Set<() => void>();
  private examBridge: FieldStripExamBridge | null = null;

  constructor() {
    this.snapshot = this.buildSnapshot();
  }

  public registerExamBridge(bridge: FieldStripExamBridge | null): void {
    this.examBridge = bridge;
    this.emit();
  }

  public refreshSnapshot(): void {
    this.emit();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): FieldStripSnapshot => {
    return this.snapshot;
  };

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  private clearTransientHighlights(): void {
    this.blockingParts.clear();
    this.blockedParts.clear();
    this.blockHighlightUntilMs = 0;
    this.hintParts.clear();
    this.hintHighlightUntilMs = 0;
  }

  private computeRecommendedStep(
    cache: CompiledWeaponFieldStripCache,
    phase: FieldStripPhase
  ): FieldStripStepSpec | null {
    const { steps } = cache.plan;
    const { targets, stepIndexById, dependentsByStepIndex } = cache;

    if (phase === 'strip') {
      for (let i = 0; i < steps.length; i++) {
        if (targets[i] === 1) continue;
        const ready = steps[i].requires.every((reqId) => {
          const reqIdx = stepIndexById.get(reqId);
          return reqIdx !== undefined && targets[reqIdx] === 1;
        });
        if (ready) return steps[i];
      }
      return null;
    }

    // Reassemble phase: reverse scan for a stripped step whose dependents are all reassembled (0)
    for (let i = steps.length - 1; i >= 0; i--) {
      if (targets[i] === 0) continue;
      const deps = dependentsByStepIndex[i];
      const ready = deps.every((depIdx) => targets[depIdx] === 0);
      if (ready) return steps[i];
    }
    return null;
  }

  private buildSnapshot(): FieldStripSnapshot {
    const cache = getWeaponCache(this.activeWeaponId);
    const strippedStepIds: string[] = [];
    for (let i = 0; i < cache.plan.steps.length; i++) {
      if (cache.targets[i] === 1) {
        strippedStepIds.push(cache.plan.steps[i].id);
      }
    }
    const isBlind =
      this.examBridge?.isBlindActiveForWeapon(this.activeWeaponId) ?? false;
    const rec = isBlind
      ? null
      : this.computeRecommendedStep(cache, this.phase);
    return {
      weaponId: this.activeWeaponId,
      phase: this.phase,
      strippedStepIds,
      strippedCount: strippedStepIds.length,
      totalSteps: cache.plan.steps.length,
      recommendedStepId: rec ? rec.id : null,
      fullCycleCompleted: this.fullCycleCompleted,
      interference: this.interference,
      hintStepId: isBlind ? null : this.hintStepId,
      hintSeq: this.hintSeq,
    };
  }

  public syncWeapon(weaponId: WeaponId, resetProgress = false): void {
    const changedWeapon = this.activeWeaponId !== weaponId;
    this.activeWeaponId = weaponId;
    if (changedWeapon || resetProgress) {
      const cache = getWeaponCache(weaponId);
      cache.alphas.fill(0);
      cache.targets.fill(0);
      this.phase = 'strip';
      this.fullCycleCompleted = false;
      this.interference = null;
      this.hintStepId = null;
      this.clearTransientHighlights();
      this.examBridge?.onExternalReset(weaponId);
      this.emit();
    }
  }

  public reset(weaponId?: WeaponId, instant = false): void {
    const targetWeapon = weaponId ?? this.activeWeaponId;
    this.activeWeaponId = targetWeapon;
    const cache = getWeaponCache(targetWeapon);
    cache.targets.fill(0);
    if (instant) {
      cache.alphas.fill(0);
    }
    this.phase = 'strip';
    this.fullCycleCompleted = false;
    this.interference = null;
    this.hintStepId = null;
    this.clearTransientHighlights();
    this.examBridge?.onExternalReset(targetWeapon);
    this.emit();
  }

  public setPhase(nextPhase: FieldStripPhase): void {
    if (this.examBridge?.isBlindActiveForWeapon(this.activeWeaponId)) {
      return;
    }
    const cache = getWeaponCache(this.activeWeaponId);
    let strippedCount = 0;
    for (let i = 0; i < cache.targets.length; i++) {
      if (cache.targets[i] === 1) strippedCount++;
    }
    if (nextPhase === 'reassemble' && strippedCount === 0) return;
    if (nextPhase === 'strip' && strippedCount === cache.plan.steps.length) {
      return;
    }
    if (this.phase !== nextPhase) {
      this.phase = nextPhase;
      this.interference = null;
      this.hintStepId = null;
      this.clearTransientHighlights();
      playWorkbenchFoley('toggle_switch');
      this.emit();
    }
  }

  public dismissInterference(): void {
    if (this.interference !== null) {
      this.interference = null;
      this.clearTransientHighlights();
      this.emit();
    }
  }

  public triggerHint(): string | null {
    if (this.examBridge?.isBlindActiveForWeapon(this.activeWeaponId)) {
      return null;
    }
    const cache = getWeaponCache(this.activeWeaponId);
    const rec = this.computeRecommendedStep(cache, this.phase);
    if (!rec) return null;

    this.hintStepId = rec.id;
    this.hintSeq += 1;
    this.interference = null;
    this.blockingParts.clear();
    this.blockedParts.clear();
    this.hintParts.clear();
    for (const partId of rec.triggerPartIds) {
      this.hintParts.add(partId);
    }
    this.hintHighlightUntilMs = nowTimestampMs() + HINT_HIGHLIGHT_DURATION_MS;
    playWorkbenchFoley('director_cue');
    this.emit();
    return rec.triggerPartIds[0] ?? null;
  }

  /**
   * Executes the next valid topological step automatically (for toolbar button or accessibility).
   */
  public performRecommendedStep(): FieldStripClickOutcome {
    if (this.examBridge?.isBlindActiveForWeapon(this.activeWeaponId)) {
      return { outcome: 'non_strip_part', stepId: null, focusPartId: null };
    }
    const cache = getWeaponCache(this.activeWeaponId);
    const rec = this.computeRecommendedStep(cache, this.phase);
    if (!rec) {
      return { outcome: 'non_strip_part', stepId: null, focusPartId: null };
    }
    const leadPart =
      rec.triggerPartIds[0] ?? rec.bindings[0]?.partId ?? '';
    return this.attemptPartClick(this.activeWeaponId, leadPart);
  }

  private resolveCandidateStepIndex(
    cache: CompiledWeaponFieldStripCache,
    partId: string,
    phase: FieldStripPhase,
    isBlindExam = false
  ): number | null {
    const trigSteps = cache.triggerStepsByPartId.get(partId);
    const boundRefs = cache.boundStepsByPartId.get(partId);

    if (phase === 'strip') {
      if (trigSteps) {
        for (let i = 0; i < trigSteps.length; i++) {
          const idx = trigSteps[i];
          if (cache.targets[idx] === 0) return idx;
        }
      }
      if (boundRefs) {
        for (let i = 0; i < boundRefs.length; i++) {
          const idx = boundRefs[i].stepIndex;
          if (cache.targets[idx] === 0) return idx;
        }
      }
      // In Guided mode only, clicking an already-stripped trigger allows reversing that step
      if (!isBlindExam && trigSteps) {
        for (let i = trigSteps.length - 1; i >= 0; i--) {
          const idx = trigSteps[i];
          if (cache.targets[idx] === 1) return idx;
        }
      }
      return null;
    }

    // Reassemble phase: prefer latest stripped step first
    if (trigSteps) {
      for (let i = trigSteps.length - 1; i >= 0; i--) {
        const idx = trigSteps[i];
        if (cache.targets[idx] === 1) return idx;
      }
    }
    if (boundRefs) {
      for (let i = boundRefs.length - 1; i >= 0; i--) {
        const idx = boundRefs[i].stepIndex;
        if (cache.targets[idx] === 1) return idx;
      }
    }
    return null;
  }

  public attemptPartClick(
    weaponId: WeaponId,
    partId: string
  ): FieldStripClickOutcome {
    if (this.activeWeaponId !== weaponId) {
      this.syncWeapon(weaponId, false);
    }
    if (this.examBridge?.isBlindCompletedForWeapon(weaponId)) {
      return { outcome: 'non_strip_part', stepId: null, focusPartId: null };
    }

    const isBlind =
      this.examBridge?.isBlindActiveForWeapon(weaponId) ?? false;
    const cache = getWeaponCache(weaponId);
    const stepIdx = this.resolveCandidateStepIndex(
      cache,
      partId,
      this.phase,
      isBlind
    );

    if (stepIdx === null) {
      if (isBlind && this.examBridge) {
        this.blockingParts.clear();
        this.blockedParts.clear();
        this.hintParts.clear();
        this.blockingParts.add(partId);
        this.blockHighlightUntilMs =
          nowTimestampMs() + BLOCK_HIGHLIGHT_DURATION_MS;

        const redacted = this.examBridge.getRedactedMessages();
        this.alertSeq += 1;
        this.interference = {
          severity: 'interference',
          attemptedPartId: partId,
          attemptedStepId: null,
          blockingStepIds: [],
          blockingPartIds: [partId],
          messageZh: redacted.wrongPartZh,
          messageEn: redacted.wrongPartEn,
          seq: this.alertSeq,
        };

        let curStripped = 0;
        for (let i = 0; i < cache.targets.length; i++) {
          if (cache.targets[i] === 1) curStripped++;
        }
        playTriggerDryBlockSound();
        this.examBridge.onAttemptOutcome({
          weaponId,
          outcome: 'non_strip_part',
          strippedCount: curStripped,
          totalSteps: cache.plan.steps.length,
          phase: this.phase,
          fullCycleCompleted: false,
        });
        this.emit();
        return { outcome: 'non_strip_part', stepId: null, focusPartId: partId };
      }

      this.alertSeq += 1;
      this.interference = {
        severity: 'info',
        attemptedPartId: partId,
        attemptedStepId: null,
        blockingStepIds: [],
        blockingPartIds: [],
        messageZh:
          '该零件属于机匣基准骨架或军械所级深拆件，野战一级快拆无需拆卸；请点击待拆运动件或点「提示下一步」。',
        messageEn:
          'This component is part of the base receiver chassis or depot-level group and stays intact during field-stripping. Click an active sub-assembly or use "Hint Next".',
        seq: this.alertSeq,
      };
      playWorkbenchFoley('part_select');
      this.emit();
      return { outcome: 'non_strip_part', stepId: null, focusPartId: null };
    }

    const step = cache.plan.steps[stepIdx];
    const isCurrentlyStripped = cache.targets[stepIdx] === 1;

    // -------------------------------------------------------------------------
    // Case A: Attempting to STRIP an assembled step (0 -> 1)
    // -------------------------------------------------------------------------
    if (!isCurrentlyStripped) {
      const unmetStepIndices: number[] = [];
      for (const reqId of step.requires) {
        const reqIdx = cache.stepIndexById.get(reqId);
        if (reqIdx !== undefined && cache.targets[reqIdx] === 0) {
          unmetStepIndices.push(reqIdx);
        }
      }

      if (unmetStepIndices.length > 0) {
        if (isBlind && this.examBridge) {
          // Red interference pulse ONLY on the clicked part — never highlight prerequisite parts!
          this.blockingParts.clear();
          this.blockedParts.clear();
          this.hintParts.clear();
          this.blockingParts.add(partId);
          for (const pId of step.triggerPartIds) {
            this.blockingParts.add(pId);
          }
          this.blockHighlightUntilMs =
            nowTimestampMs() + BLOCK_HIGHLIGHT_DURATION_MS;

          const redacted = this.examBridge.getRedactedMessages();
          this.alertSeq += 1;
          this.interference = {
            severity: 'interference',
            attemptedPartId: partId,
            attemptedStepId: null,
            blockingStepIds: [],
            blockingPartIds: [partId],
            messageZh: redacted.stripBlockedZh,
            messageEn: redacted.stripBlockedEn,
            seq: this.alertSeq,
          };

          let curStripped = 0;
          for (let i = 0; i < cache.targets.length; i++) {
            if (cache.targets[i] === 1) curStripped++;
          }
          playTriggerDryBlockSound();
          this.examBridge.onAttemptOutcome({
            weaponId,
            outcome: 'blocked',
            strippedCount: curStripped,
            totalSteps: cache.plan.steps.length,
            phase: this.phase,
            fullCycleCompleted: false,
          });
          this.emit();
          return {
            outcome: 'blocked',
            stepId: null,
            focusPartId: partId,
          };
        }

        // Find immediate actionable prerequisites so we highlight the exact blocking parts
        const blockingStepIds = unmetStepIndices.map(
          (idx) => cache.plan.steps[idx].id
        );
        const blockingPartIds: string[] = [];
        this.blockingParts.clear();
        this.blockedParts.clear();
        this.hintParts.clear();

        for (const idx of unmetStepIndices) {
          for (const pId of cache.plan.steps[idx].triggerPartIds) {
            if (!this.blockingParts.has(pId)) {
              this.blockingParts.add(pId);
              blockingPartIds.push(pId);
            }
          }
        }
        this.blockedParts.add(partId);
        for (const pId of step.triggerPartIds) {
          this.blockedParts.add(pId);
        }
        this.blockHighlightUntilMs =
          nowTimestampMs() + BLOCK_HIGHLIGHT_DURATION_MS;

        this.alertSeq += 1;
        this.interference = {
          severity: 'interference',
          attemptedPartId: partId,
          attemptedStepId: step.id,
          blockingStepIds,
          blockingPartIds,
          messageZh:
            step.stripBlockedNoteZh ||
            '存在前置机械干涉，请先拆卸高亮指示的前置锁定部件！',
          messageEn:
            step.stripBlockedNoteEn ||
            'Mechanical interference detected—remove the highlighted prerequisite component first!',
          seq: this.alertSeq,
        };
        playTriggerDryBlockSound();
        this.emit();
        return {
          outcome: 'blocked',
          stepId: step.id,
          focusPartId: blockingPartIds[0] ?? partId,
        };
      }

      // Valid strip!
      cache.targets[stepIdx] = 1;
      this.fullCycleCompleted = false;
      this.interference = null;
      this.hintStepId = null;
      this.clearTransientHighlights();

      let strippedTotal = 0;
      for (let i = 0; i < cache.targets.length; i++) {
        if (cache.targets[i] === 1) strippedTotal++;
      }
      if (strippedTotal === cache.plan.steps.length) {
        this.phase = 'reassemble';
      } else {
        this.phase = 'strip';
      }

      playWorkbenchFoley('preset_detent');
      if (isBlind && this.examBridge) {
        this.examBridge.onAttemptOutcome({
          weaponId,
          outcome: 'stripped',
          strippedCount: strippedTotal,
          totalSteps: cache.plan.steps.length,
          phase: this.phase,
          fullCycleCompleted: false,
        });
      }
      this.emit();
      return {
        outcome: 'stripped',
        stepId: step.id,
        focusPartId: step.triggerPartIds[0] ?? partId,
      };
    }

    // -------------------------------------------------------------------------
    // Case B: Attempting to REASSEMBLE a stripped step (1 -> 0)
    // -------------------------------------------------------------------------
    const activeDependents: number[] = [];
    for (const depIdx of cache.dependentsByStepIndex[stepIdx]) {
      if (cache.targets[depIdx] === 1) {
        activeDependents.push(depIdx);
      }
    }

    if (activeDependents.length > 0) {
      if (isBlind && this.examBridge) {
        this.blockingParts.clear();
        this.blockedParts.clear();
        this.hintParts.clear();
        this.blockingParts.add(partId);
        for (const pId of step.triggerPartIds) {
          this.blockingParts.add(pId);
        }
        this.blockHighlightUntilMs =
          nowTimestampMs() + BLOCK_HIGHLIGHT_DURATION_MS;

        const redacted = this.examBridge.getRedactedMessages();
        this.alertSeq += 1;
        this.interference = {
          severity: 'interference',
          attemptedPartId: partId,
          attemptedStepId: null,
          blockingStepIds: [],
          blockingPartIds: [partId],
          messageZh: redacted.reassembleBlockedZh,
          messageEn: redacted.reassembleBlockedEn,
          seq: this.alertSeq,
        };

        let curStripped = 0;
        for (let i = 0; i < cache.targets.length; i++) {
          if (cache.targets[i] === 1) curStripped++;
        }
        playTriggerDryBlockSound();
        this.examBridge.onAttemptOutcome({
          weaponId,
          outcome: 'blocked',
          strippedCount: curStripped,
          totalSteps: cache.plan.steps.length,
          phase: this.phase,
          fullCycleCompleted: false,
        });
        this.emit();
        return {
          outcome: 'blocked',
          stepId: null,
          focusPartId: partId,
        };
      }

      const blockingStepIds = activeDependents.map(
        (idx) => cache.plan.steps[idx].id
      );
      const blockingPartIds: string[] = [];
      this.blockingParts.clear();
      this.blockedParts.clear();
      this.hintParts.clear();

      for (const idx of activeDependents) {
        for (const pId of cache.plan.steps[idx].triggerPartIds) {
          if (!this.blockingParts.has(pId)) {
            this.blockingParts.add(pId);
            blockingPartIds.push(pId);
          }
        }
      }
      this.blockedParts.add(partId);
      for (const pId of step.triggerPartIds) {
        this.blockedParts.add(pId);
      }
      this.blockHighlightUntilMs =
        nowTimestampMs() + BLOCK_HIGHLIGHT_DURATION_MS;

      const firstDepStep = cache.plan.steps[activeDependents[0]];
      this.alertSeq += 1;
      this.interference = {
        severity: 'interference',
        attemptedPartId: partId,
        attemptedStepId: step.id,
        blockingStepIds,
        blockingPartIds,
        messageZh:
          step.reassembleBlockedNoteZh ||
          `逆序复装干涉：必须先装回「${firstDepStep.titleZh}」，才能复装当前部件！`,
        messageEn:
          step.reassembleBlockedNoteEn ||
          `Reverse-assembly interference: reinstall "${firstDepStep.titleEn}" before seating this part!`,
        seq: this.alertSeq,
      };
      playTriggerDryBlockSound();
      this.emit();
      return {
        outcome: 'blocked',
        stepId: step.id,
        focusPartId: blockingPartIds[0] ?? partId,
      };
    }

    // Valid reassembly!
    cache.targets[stepIdx] = 0;
    this.interference = null;
    this.hintStepId = null;
    this.clearTransientHighlights();

    let remainingStripped = 0;
    for (let i = 0; i < cache.targets.length; i++) {
      if (cache.targets[i] === 1) remainingStripped++;
    }
    if (remainingStripped === 0) {
      this.phase = 'strip';
      this.fullCycleCompleted = true;
    } else {
      this.phase = 'reassemble';
    }

    playWorkbenchFoley('preset_detent');
    if (isBlind && this.examBridge) {
      this.examBridge.onAttemptOutcome({
        weaponId,
        outcome: 'reassembled',
        strippedCount: remainingStripped,
        totalSteps: cache.plan.steps.length,
        phase: this.phase,
        fullCycleCompleted: remainingStripped === 0,
      });
    }
    this.emit();
    return {
      outcome: 'reassembled',
      stepId: step.id,
      focusPartId: step.triggerPartIds[0] ?? partId,
    };
  }

  /**
   * Advances 60fps step alphas toward discrete targets with zero heap allocations.
   */
  public stepAnimations(dt: number): void {
    const cache = getWeaponCache(this.activeWeaponId);
    const clampedDt = Math.min(Math.max(dt, 0), 0.1);
    const delta = clampedDt * ANIMATION_SPEED_PER_SEC;
    const { alphas, targets } = cache;

    for (let i = 0; i < alphas.length; i++) {
      const target = targets[i];
      const cur = alphas[i];
      if (cur === target) continue;
      if (cur < target) {
        const next = cur + delta;
        alphas[i] = next >= target ? target : next;
      } else {
        const next = cur - delta;
        alphas[i] = next <= target ? target : next;
      }
    }
  }

  /**
   * Zero-GC 60fps pose evaluator for Field-Strip Mode: maps each active step's
   * alpha sequentially across its bound `explodeSteps` indices.
   */
  public evaluatePartPoseInto(
    weaponId: WeaponId,
    part: WeaponPartSpec,
    out: MutablePartPose
  ): MutablePartPose {
    let px = part.assembledPos[0];
    let py = part.assembledPos[1];
    let pz = part.assembledPos[2];

    const baseRot = part.assembledRot;
    let rx = baseRot ? baseRot[0] : 0;
    let ry = baseRot ? baseRot[1] : 0;
    let rz = baseRot ? baseRot[2] : 0;

    const cache = getWeaponCache(weaponId);
    const refs = cache.boundStepsByPartId.get(part.id);
    if (refs) {
      const { alphas } = cache;
      const explodeSteps = part.explodeSteps;
      for (let r = 0; r < refs.length; r++) {
        const ref = refs[r];
        const alpha = alphas[ref.stepIndex];
        if (alpha <= 0) continue;

        const indices = ref.explodeStepIndices;
        const m = indices.length;
        for (let k = 0; k < m; k++) {
          const stepSpec = explodeSteps[indices[k]];
          if (!stepSpec) continue;
          const rawSub = m === 1 ? alpha : alpha * m - k;
          if (rawSub <= 0) continue;
          const w = smoothstep01(rawSub);
          px += stepSpec.offset[0] * w;
          py += stepSpec.offset[1] * w;
          pz += stepSpec.offset[2] * w;
          if (stepSpec.rotation) {
            rx += stepSpec.rotation[0] * w;
            ry += stepSpec.rotation[1] * w;
            rz += stepSpec.rotation[2] * w;
          }
        }
      }
    }

    out.px = px;
    out.py = py;
    out.pz = pz;
    out.rx = rx;
    out.ry = ry;
    out.rz = rz;
    out.sx = 1;
    return out;
  }

  /**
   * O(1) transient highlight query called inside `PartActor` `useFrame`.
   */
  public getPartHighlight(
    weaponId: WeaponId,
    partId: string,
    nowMs: number
  ): FieldStripPartHighlightKind {
    if (this.activeWeaponId !== weaponId) return 'none';
    if (nowMs < this.blockHighlightUntilMs) {
      if (this.blockingParts.has(partId)) return 'blocking';
      if (this.blockedParts.has(partId)) return 'blocked';
    }
    if (nowMs < this.hintHighlightUntilMs && this.hintParts.has(partId)) {
      return 'hint';
    }
    return 'none';
  }

  public getStepAlpha(weaponId: WeaponId, stepId: string): number {
    const cache = getWeaponCache(weaponId);
    const idx = cache.stepIndexById.get(stepId);
    return idx !== undefined ? cache.alphas[idx] : 0;
  }
}

export const fieldStripStore = new FieldStripRuntimeController();

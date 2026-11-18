import type { MutablePartPose, WeaponId } from '../../weapons/types';
import {
  playTriggerDryBlockSound,
  playWorkbenchFoley,
} from '../audio/mechanicalSoundEngine';
import { playbackClock } from '../clock/playbackClock';
import { smoothstep01 } from '../kinematics/math';
import {
  MALFUNCTION_SCENARIOS,
  type MalfunctionKind,
  WEAPON_MALFUNCTION_PROFILES,
} from './malfunctionSpecs';

export type MalfunctionPartRole = 'none' | 'causal' | 'action' | 'cleared';

export interface MalfunctionSnapshot {
  weaponId: WeaponId;
  activeKind: MalfunctionKind;
  completedSteps: number;
  totalSteps: number;
  cleared: boolean;
  activeStepId: string | null;
}

export interface MalfunctionExamBridge {
  getBlindStateForWeapon: (weaponId: WeaponId) => {
    active: boolean;
    phase: 'idle' | 'diagnosis' | 'clearance' | 'completed';
  };
  onPartClickInClearance: (weaponId: WeaponId, partId: string) => boolean;
  onExternalResetOrChange: (weaponId: WeaponId) => void;
}

export interface MalfunctionTransientVisuals {
  weaponId: WeaponId;
  kind: MalfunctionKind;
  completedSteps: number;
  cleared: boolean;
  /** 0 = seated in mag well, 1 = stripped free (Type-3 Double-Feed Rip step) */
  magStripAlpha: number;
  /** 0 = jammed in port/chamber, 1 = tumbled free after rack/sweep */
  caseClearAlpha: number;
  /** 0 = wedged 2nd round in Double-Feed, 1 = dropped free via mag well */
  secondRoundDropAlpha: number;
  /** Brief upward slap impulse on magazine floorplate during Tap-Rack */
  magTapImpulse: number;
  /** Fresh round chambered at end of clearing drill [0..1] */
  freshChamberAlpha: number;
}

function resolveInitialFireF(weaponId: WeaponId, kind: MalfunctionKind): number {
  const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
  switch (kind) {
    case 'stovepipe':
      return prof.stovepipeF;
    case 'double_feed':
      return prof.doubleFeedF;
    case 'light_strike':
      return prof.lightStrikeF;
    case 'out_of_battery':
      return prof.outOfBatteryF;
  }
}

function resolveStepTargetFireF(
  weaponId: WeaponId,
  kind: MalfunctionKind,
  completedSteps: number
): number {
  const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
  if (completedSteps <= 0) {
    return resolveInitialFireF(weaponId, kind);
  }

  switch (kind) {
    case 'stovepipe':
      if (completedSteps === 1) return prof.rackFullOpenF; // Rack rearward to free stovepipe
      if (completedSteps === 2) return 0.78; // Feed stroke
      return 0.0; // Full battery
    case 'double_feed':
      if (completedSteps === 1) return prof.rackFullOpenF; // Lock rearward
      if (completedSteps === 2) return prof.rackFullOpenF; // Hold open while ripping mag
      if (completedSteps === 3) return prof.rackFullOpenF + 0.04; // Rack empty chamber clear
      return 0.0; // Reloaded & locked in battery
    case 'light_strike':
      if (completedSteps === 1) return prof.lightStrikeF; // Tap baseplate (breech stays closed)
      if (completedSteps === 2) return prof.rackFullOpenF; // Rack & eject misfired round
      return 0.0; // Fresh round in battery
    case 'out_of_battery':
      if (completedSteps === 1) return prof.rackFullOpenF; // Retract & extract bulged round
      if (completedSteps === 2) return prof.rackFullOpenF; // Inspect chamber & lugs while open
      return 0.0; // Slingshot into 100% full lockup
  }
}

class MalfunctionRuntimeController {
  private weaponId: WeaponId = 'ak15';
  private activeKind: MalfunctionKind = 'stovepipe';
  private completedSteps = 0;

  private targetFireF = WEAPON_MALFUNCTION_PROFILES.ak15.stovepipeF;
  private liveFireF = WEAPON_MALFUNCTION_PROFILES.ak15.stovepipeF;

  private magStripTarget = 0;
  private magStripAlpha = 0;

  private caseClearTarget = 0;
  private caseClearAlpha = 0;

  private secondRoundDropTarget = 0;
  private secondRoundDropAlpha = 0;

  private freshChamberTarget = 0;
  private freshChamberAlpha = 0;

  private magTapImpulse = 0;

  private causalParts = new Set<string>();
  private actionParts = new Set<string>();
  private magParts = new Set<string>();

  private snapshot: MalfunctionSnapshot;
  private listeners = new Set<() => void>();
  private examBridge: MalfunctionExamBridge | null = null;

  private readonly transientOut: MalfunctionTransientVisuals = {
    weaponId: 'ak15',
    kind: 'stovepipe',
    completedSteps: 0,
    cleared: false,
    magStripAlpha: 0,
    caseClearAlpha: 0,
    secondRoundDropAlpha: 0,
    magTapImpulse: 0,
    freshChamberAlpha: 0,
  };

  constructor() {
    this.rebuildPartSets();
    this.snapshot = this.buildSnapshot();
  }

  public registerExamBridge(bridge: MalfunctionExamBridge | null): void {
    this.examBridge = bridge;
    this.emit();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): MalfunctionSnapshot => this.snapshot;

  private emit(): void {
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  private buildSnapshot(): MalfunctionSnapshot {
    const spec = MALFUNCTION_SCENARIOS[this.activeKind];
    const total = spec.steps.length;
    const cleared = this.completedSteps >= total;
    const nextStep = !cleared ? spec.steps[this.completedSteps] : null;
    return {
      weaponId: this.weaponId,
      activeKind: this.activeKind,
      completedSteps: this.completedSteps,
      totalSteps: total,
      cleared,
      activeStepId: nextStep ? nextStep.id : null,
    };
  }

  private rebuildPartSets(): void {
    const prof = WEAPON_MALFUNCTION_PROFILES[this.weaponId];
    this.causalParts.clear();
    this.actionParts.clear();
    this.magParts.clear();

    for (const id of prof.actionPartIds) {
      this.actionParts.add(id);
    }
    for (const id of prof.magazinePartIds) {
      this.magParts.add(id);
    }

    switch (this.activeKind) {
      case 'stovepipe':
        this.causalParts.add(prof.extractorPartId);
        for (const id of prof.actionPartIds) this.causalParts.add(id);
        break;
      case 'double_feed':
        this.causalParts.add(prof.extractorPartId);
        if (prof.magazinePartIds[0]) {
          this.causalParts.add(prof.magazinePartIds[0]);
        }
        if (prof.magazinePartIds[1]) {
          this.causalParts.add(prof.magazinePartIds[1]);
        }
        break;
      case 'light_strike':
        for (const id of prof.fireControlPartIds) {
          this.causalParts.add(id);
        }
        break;
      case 'out_of_battery':
        for (const id of prof.lockingPartIds) {
          this.causalParts.add(id);
        }
        for (const id of prof.fireControlPartIds) {
          this.causalParts.add(id);
        }
        break;
    }
  }

  private syncStepTargets(instant: boolean): void {
    const kind = this.activeKind;
    const step = this.completedSteps;
    const total = MALFUNCTION_SCENARIOS[kind].steps.length;

    this.targetFireF = resolveStepTargetFireF(this.weaponId, kind, step);

    // Magazine stripped only during Double-Feed steps 2 & 3
    this.magStripTarget =
      kind === 'double_feed' && (step === 2 || step === 3) ? 1 : 0;

    // Wedged 2nd round drops as soon as mag is ripped (step >= 2)
    this.secondRoundDropTarget = kind === 'double_feed' && step >= 2 ? 1 : 0;

    // Jammed/misfired primary round clears at:
    // - stovepipe: step >= 1
    // - double_feed: step >= 3
    // - light_strike: step >= 2
    // - out_of_battery: step >= 1
    if (kind === 'stovepipe') {
      this.caseClearTarget = step >= 1 ? 1 : 0;
    } else if (kind === 'double_feed') {
      this.caseClearTarget = step >= 3 ? 1 : 0;
    } else if (kind === 'light_strike') {
      this.caseClearTarget = step >= 2 ? 1 : 0;
    } else {
      this.caseClearTarget = step >= 1 ? 1 : 0;
    }

    this.freshChamberTarget = step >= total ? 1 : 0;

    if (instant) {
      this.liveFireF = this.targetFireF;
      this.magStripAlpha = this.magStripTarget;
      this.caseClearAlpha = this.caseClearTarget;
      this.secondRoundDropAlpha = this.secondRoundDropTarget;
      this.freshChamberAlpha = this.freshChamberTarget;
      this.magTapImpulse = 0;
    }

    playbackClock.setFireProgress(this.liveFireF, true);
    playbackClock.setAnimatedFireProgress(this.liveFireF);
  }

  public activate(weaponId: WeaponId, kind?: MalfunctionKind): void {
    this.weaponId = weaponId;
    if (kind) {
      this.activeKind = kind;
    }
    this.completedSteps = 0;
    this.rebuildPartSets();
    this.syncStepTargets(true);
    this.examBridge?.onExternalResetOrChange(weaponId);
    playTriggerDryBlockSound();
    this.emit();
  }

  public syncWeapon(weaponId: WeaponId, applyClock = false): void {
    if (this.weaponId === weaponId && !applyClock) return;
    this.weaponId = weaponId;
    this.completedSteps = 0;
    this.rebuildPartSets();
    if (applyClock) {
      this.syncStepTargets(true);
    }
    this.examBridge?.onExternalResetOrChange(weaponId);
    this.emit();
  }

  public selectMalfunction(kind: MalfunctionKind, weaponId?: WeaponId): void {
    if (weaponId) {
      this.weaponId = weaponId;
    }
    this.activeKind = kind;
    this.completedSteps = 0;
    this.rebuildPartSets();
    this.syncStepTargets(true);
    this.examBridge?.onExternalResetOrChange(this.weaponId);
    playTriggerDryBlockSound();
    this.emit();
  }

  public resetDrill(): void {
    this.completedSteps = 0;
    this.syncStepTargets(true);
    this.examBridge?.onExternalResetOrChange(this.weaponId);
    playTriggerDryBlockSound();
    this.emit();
  }

  public advanceClearingStep(fromVerifiedBlindExam = false): boolean {
    const blind = this.examBridge?.getBlindStateForWeapon(this.weaponId);
    if (blind?.active && !fromVerifiedBlindExam) {
      return false;
    }
    const spec = MALFUNCTION_SCENARIOS[this.activeKind];
    if (this.completedSteps >= spec.steps.length) {
      return false;
    }
    this.completedSteps += 1;
    if (this.activeKind === 'light_strike' && this.completedSteps === 1) {
      this.magTapImpulse = 1;
    }
    this.syncStepTargets(false);
    playWorkbenchFoley(
      this.completedSteps >= spec.steps.length ? 'director_cue' : 'preset_detent'
    );
    this.emit();
    return true;
  }

  /**
   * Allows clicking directly on causal/action/magazine parts in the 3D viewport
   * while Malfunction Diagnostics mode is active to advance the clearing drill!
   */
  public handlePartClick(weaponId: WeaponId, partId: string): boolean {
    if (this.weaponId !== weaponId) {
      this.syncWeapon(weaponId, true);
    }
    const blind = this.examBridge?.getBlindStateForWeapon(weaponId);
    if (blind?.active) {
      if (blind.phase === 'clearance' && this.examBridge) {
        return this.examBridge.onPartClickInClearance(weaponId, partId);
      }
      return false;
    }
    if (
      this.causalParts.has(partId) ||
      this.actionParts.has(partId) ||
      this.magParts.has(partId)
    ) {
      if (this.completedSteps < MALFUNCTION_SCENARIOS[this.activeKind].steps.length) {
        return this.advanceClearingStep();
      }
    }
    return false;
  }

  /**
   * 60fps Zero-GC stepper called in `ArmoryViewport` `useFrame`.
   */
  public stepAnimations(dtRaw: number): void {
    const dt = Math.min(Math.max(dtRaw, 0), 0.1);
    if (dt <= 0) return;

    const kFire = 1 - Math.exp(-8.5 * dt);
    const diffF = this.targetFireF - this.liveFireF;
    if (Math.abs(diffF) > 1e-4) {
      this.liveFireF += diffF * kFire;
      if (Math.abs(this.targetFireF - this.liveFireF) <= 1e-4) {
        this.liveFireF = this.targetFireF;
      }
      playbackClock.setFireProgress(this.liveFireF, true);
      playbackClock.setAnimatedFireProgress(this.liveFireF);
    }

    const stepScalar = (cur: number, goal: number, speed: number): number => {
      if (cur === goal) return cur;
      const d = speed * dt;
      if (cur < goal) return Math.min(goal, cur + d);
      return Math.max(goal, cur - d);
    };

    this.magStripAlpha = stepScalar(
      this.magStripAlpha,
      this.magStripTarget,
      2.8
    );
    this.caseClearAlpha = stepScalar(
      this.caseClearAlpha,
      this.caseClearTarget,
      2.6
    );
    this.secondRoundDropAlpha = stepScalar(
      this.secondRoundDropAlpha,
      this.secondRoundDropTarget,
      2.9
    );
    this.freshChamberAlpha = stepScalar(
      this.freshChamberAlpha,
      this.freshChamberTarget,
      3.0
    );

    if (this.magTapImpulse > 0) {
      this.magTapImpulse = Math.max(0, this.magTapImpulse - dt * 3.4);
    }
  }

  /**
   * Zero-GC pose modifier applied in `PartActor.tsx` when `malfunctionActive` is true
   * (e.g. stripping the magazine during Double-Feed Rip or slapping the floorplate).
   */
  public applyPartPoseDelta(
    weaponId: WeaponId,
    partId: string,
    pose: MutablePartPose
  ): void {
    if (this.weaponId !== weaponId) return;
    if (!this.magParts.has(partId)) return;

    const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
    if (this.magStripAlpha > 0) {
      const w = smoothstep01(this.magStripAlpha);
      pose.px += prof.magStripOffsetCm[0] * w;
      pose.py += prof.magStripOffsetCm[1] * w;
      pose.pz += prof.magStripOffsetCm[2] * w;
    }
    if (this.magTapImpulse > 0) {
      const slap = Math.sin(this.magTapImpulse * Math.PI) * 0.22;
      pose.py += prof.ejectionUpSign === -1 ? -slap : slap;
    }
  }

  public getPartDiagnosticRole(
    weaponId: WeaponId,
    partId: string
  ): MalfunctionPartRole {
    if (this.weaponId !== weaponId) return 'none';
    const blind = this.examBridge?.getBlindStateForWeapon(weaponId);
    if (blind?.active && blind.phase === 'diagnosis') {
      // Suppress causal/action part highlighting until candidate diagnoses the stoppage!
      return 'none';
    }
    const total = MALFUNCTION_SCENARIOS[this.activeKind].steps.length;
    if (this.completedSteps >= total) {
      return this.causalParts.has(partId) ? 'cleared' : 'none';
    }
    if (this.causalParts.has(partId)) return 'causal';
    if (
      this.activeKind === 'double_feed' &&
      this.completedSteps === 1 &&
      this.magParts.has(partId)
    ) {
      return 'action';
    }
    if (this.actionParts.has(partId)) return 'action';
    return 'none';
  }

  public getTransientVisuals(): Readonly<MalfunctionTransientVisuals> {
    const out = this.transientOut;
    out.weaponId = this.weaponId;
    out.kind = this.activeKind;
    out.completedSteps = this.completedSteps;
    out.cleared =
      this.completedSteps >= MALFUNCTION_SCENARIOS[this.activeKind].steps.length;
    out.magStripAlpha = this.magStripAlpha;
    out.caseClearAlpha = this.caseClearAlpha;
    out.secondRoundDropAlpha = this.secondRoundDropAlpha;
    out.magTapImpulse = this.magTapImpulse;
    out.freshChamberAlpha = this.freshChamberAlpha;
    return out;
  }
}

export const malfunctionStore = new MalfunctionRuntimeController();

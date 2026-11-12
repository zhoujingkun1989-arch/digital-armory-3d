import type {
  BallisticsVisualState,
  ExtendedBallisticsState,
  FiringPhaseInfo,
  MutablePartPose,
  PartKinematicDelta,
  WeaponPartSpec,
} from '../../weapons/types';

export function clamp01(v: number): number {
  return v < 0 ? 0 : v > 1 ? 1 : v;
}

export function smoothstep01(x: number): number {
  const c = clamp01(x);
  return c * c * (3 - 2 * c);
}

/** Smooth Hermite interpolation over [start, end] returning [0, 1] */
export function seg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  const u = (f - start) / (end - start);
  return u * u * (3 - 2 * u);
}

/** Linear ramp over [start, end] returning [0, 1] */
export function linearSeg(f: number, start: number, end: number): number {
  if (f <= start) return 0;
  if (f >= end) return 1;
  return (f - start) / (end - start);
}

/** Resolves the active firing phase for normalized cycle progress f ∈ [0, 1] */
export function findActiveFiringPhase(
  phases: readonly FiringPhaseInfo[],
  f: number
): FiringPhaseInfo {
  for (let i = phases.length - 1; i >= 0; i--) {
    if (f >= phases[i].range[0]) {
      return phases[i];
    }
  }
  return phases[0];
}

export function toExtendedBallistics(
  st: BallisticsVisualState | ExtendedBallisticsState
): ExtendedBallisticsState {
  const ext = st as Partial<ExtendedBallisticsState>;
  return {
    ...st,
    gasPortFlashIntensity: ext.gasPortFlashIntensity ?? 0,
    gasPortPos: ext.gasPortPos ?? [0, 0, 0],
  };
}

export function createMutablePose(): MutablePartPose {
  return { px: 0, py: 0, pz: 0, rx: 0, ry: 0, rz: 0, sx: 1 };
}

/**
 * Zero-allocation 60fps pose evaluator: writes world translation, rotation & axial spring scale
 * directly into `out` without allocating intermediate tuple arrays on the heap.
 */
export function evaluatePartPoseInto(
  part: WeaponPartSpec,
  explodeT: number,
  isFiring: boolean,
  fireF: number,
  computeKinematics: ((partId: string, f: number) => PartKinematicDelta) | null,
  out: MutablePartPose
): MutablePartPose {
  let px = part.assembledPos[0];
  let py = part.assembledPos[1];
  let pz = part.assembledPos[2];

  const baseRot = part.assembledRot;
  let rx = baseRot ? baseRot[0] : 0;
  let ry = baseRot ? baseRot[1] : 0;
  let rz = baseRot ? baseRot[2] : 0;
  let sx = 1;

  const steps = part.explodeSteps;
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const start = step.range[0];
    const end = step.range[1];
    if (explodeT <= start) continue;
    const raw = end > start ? (explodeT - start) / (end - start) : 1;
    const w = smoothstep01(raw);
    px += step.offset[0] * w;
    py += step.offset[1] * w;
    pz += step.offset[2] * w;
    if (step.rotation) {
      rx += step.rotation[0] * w;
      ry += step.rotation[1] * w;
      rz += step.rotation[2] * w;
    }
  }

  if (isFiring && computeKinematics) {
    const kin = computeKinematics(part.id, fireF);
    px += kin.pos[0];
    py += kin.pos[1];
    pz += kin.pos[2];
    rx += kin.rot[0];
    ry += kin.rot[1];
    rz += kin.rot[2];
    sx = kin.scaleX;
  }

  out.px = px;
  out.py = py;
  out.pz = pz;
  out.rx = rx;
  out.ry = ry;
  out.rz = rz;
  out.sx = sx;
  return out;
}

/**
 * Pure convenience wrapper used for one-off camera focus targets and contract tests.
 */
export function computePartTransform(
  part: WeaponPartSpec,
  t: number
): {
  position: [number, number, number];
  rotation: [number, number, number];
} {
  const pose = evaluatePartPoseInto(
    part,
    t,
    false,
    0,
    null,
    createMutablePose()
  );
  return {
    position: [pose.px, pose.py, pose.pz],
    rotation: [pose.rx, pose.ry, pose.rz],
  };
}

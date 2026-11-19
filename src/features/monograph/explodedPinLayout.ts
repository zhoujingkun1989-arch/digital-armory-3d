import * as THREE from 'three';
import { getPartLocalCenter } from '../../engine/geometry/geometryService';
import { computePartTransform } from '../../engine/kinematics/math';
import { getWeaponManifest } from '../../weapons/manifests';
import type {
  AssemblyGroupKey,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import type {
  MonographLoupeAnchor,
  MonographLoupeKey,
} from './monographCaptureStore';

export interface ExplodedPinAnchorInput {
  partId: string;
  bomCode: string;
  group: AssemblyGroupKey;
  preferredDir: 'up' | 'down';
  /** Normalized horizontal screen coordinate in [0..1] (0 = left, 1 = right) */
  anchorU: number;
  /** Normalized vertical screen coordinate in [0..1] (0 = top, 1 = bottom) */
  anchorV: number;
}

export interface ExplodedPinItem {
  partId: string;
  bomCode: string;
  group: AssemblyGroupKey;
  rail: 'top' | 'bottom';
  row: 0 | 1;
  anchorU: number;
  anchorV: number;
  badgeU: number;
  badgeV: number;
  kneeU: number;
  kneeV: number;
}

export type DkCalloutSide = 'top' | 'bottom' | 'left' | 'right';

export interface DkCalloutItem {
  partId: string;
  bomCode: string;
  group: AssemblyGroupKey;
  side: DkCalloutSide;
  anchorU: number;
  anchorV: number;
  kneeU: number;
  kneeV: number;
  labelU: number;
  labelV: number;
  align: 'left' | 'right' | 'center';
  priority: number;
}

const _worldVec = new THREE.Vector3();
const _euler = new THREE.Euler();

const DK_GROUP_PRIORITY_ORDER: readonly AssemblyGroupKey[] = [
  'slide',
  'fire_control',
  'frame',
  'magazine',
];

const LOUPE_KEY_BY_GROUP: Readonly<
  Record<AssemblyGroupKey, MonographLoupeKey>
> = {
  slide: 'group_slide',
  frame: 'group_frame',
  fire_control: 'group_fcg',
  magazine: 'group_mag',
};

/**
 * Projects all 3D exploded component anchors (at `explodeT = 1.0`) through `camera`
 * into normalized `[0..1] × [0..1]` plate coordinates.
 */
export function projectExplodedPartAnchors(
  weaponId: WeaponId,
  parts: readonly WeaponPartSpec[],
  camera: THREE.Camera,
  explodeT = 1.0
): ExplodedPinAnchorInput[] {
  camera.updateMatrixWorld();
  const out: ExplodedPinAnchorInput[] = [];

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const { position, rotation } = computePartTransform(part, explodeT);
    const localCenter =
      part.calloutAnchor ?? getPartLocalCenter(weaponId, part.id);

    _euler.set(rotation[0], rotation[1], rotation[2]);
    _worldVec
      .set(localCenter[0], localCenter[1], localCenter[2])
      .applyEuler(_euler);
    _worldVec.x += position[0];
    _worldVec.y += position[1];
    _worldVec.z += position[2];
    _worldVec.project(camera);

    const anchorU = THREE.MathUtils.clamp(_worldVec.x * 0.5 + 0.5, 0.05, 0.95);
    const anchorV = THREE.MathUtils.clamp(-_worldVec.y * 0.5 + 0.5, 0.14, 0.86);

    out.push({
      partId: part.id,
      bomCode: part.bomCode,
      group: part.group,
      preferredDir: part.calloutDir,
      anchorU,
      anchorV,
    });
  }

  return out;
}

/**
 * Deterministically assigns exploded part anchors to clean Top & Bottom ISO callout rails,
 * sorting monotonically left-to-right within each rail so leader lines avoid tangling and
 * BOM code badges never overlap on the 1920×1200 engineering blueprint plate.
 */
export function solveExplodedPinLayout(
  anchors: readonly ExplodedPinAnchorInput[]
): ExplodedPinItem[] {
  if (anchors.length === 0) return [];

  // Score each part for top vs bottom rail: lower score -> top rail, higher -> bottom rail
  const scored = anchors
    .map((a) => ({
      anchor: a,
      verticalRank: a.anchorV + (a.preferredDir === 'up' ? -0.14 : 0.14),
    }))
    .sort((x, y) => x.verticalRank - y.verticalRank);

  const topCount = Math.ceil(scored.length / 2);
  const topBucket = scored
    .slice(0, topCount)
    .map((s) => s.anchor)
    .sort((a, b) => a.anchorU - b.anchorU);
  const botBucket = scored
    .slice(topCount)
    .map((s) => s.anchor)
    .sort((a, b) => a.anchorU - b.anchorU);

  const out: ExplodedPinItem[] = [];

  const layoutRail = (
    bucket: readonly ExplodedPinAnchorInput[],
    rail: 'top' | 'bottom'
  ) => {
    const n = bucket.length;
    if (n === 0) return;

    const useStagger = n > 12;
    const minMarginU = 0.055;
    const maxMarginU = 0.945;
    const spanU = maxMarginU - minMarginU;

    for (let i = 0; i < n; i++) {
      const item = bucket[i];
      const evenSlotU = n === 1 ? 0.5 : minMarginU + (i / (n - 1)) * spanU;
      // Blend 78% uniform rail spacing + 22% natural anchor X, then enforce monotonic gap
      const rawU = evenSlotU * 0.82 + item.anchorU * 0.18;
      const row: 0 | 1 = useStagger ? ((i % 2) as 0 | 1) : 0;

      const badgeV =
        rail === 'top'
          ? row === 0
            ? 0.048
            : 0.098
          : row === 0
            ? 0.952
            : 0.902;

      const kneeV =
        rail === 'top'
          ? Math.min(item.anchorV - 0.02, 0.145)
          : Math.max(item.anchorV + 0.02, 0.855);

      out.push({
        partId: item.partId,
        bomCode: item.bomCode,
        group: item.group,
        rail,
        row,
        anchorU: item.anchorU,
        anchorV: item.anchorV,
        badgeU: rawU,
        badgeV,
        kneeU: rawU,
        kneeV,
      });
    }
  };

  layoutRail(topBucket, 'top');
  layoutRail(botBucket, 'bottom');

  // Enforce strict minimum horizontal clearance within each (rail, row) track
  for (const rail of ['top', 'bottom'] as const) {
    for (const row of [0, 1] as const) {
      const track = out
        .filter((p) => p.rail === rail && p.row === row)
        .sort((a, b) => a.badgeU - b.badgeU);
      if (track.length <= 1) continue;

      const minGap = Math.min(0.068, 0.88 / Math.max(1, track.length - 1));
      for (let i = 1; i < track.length; i++) {
        if (track[i].badgeU - track[i - 1].badgeU < minGap) {
          track[i].badgeU = track[i - 1].badgeU + minGap;
          track[i].kneeU = track[i].badgeU;
        }
      }
      const overflow = track[track.length - 1].badgeU - 0.952;
      if (overflow > 0) {
        for (let i = 0; i < track.length; i++) {
          track[i].badgeU = Math.max(0.048, track[i].badgeU - overflow);
          track[i].kneeU = track[i].badgeU;
        }
      }
    }
  }

  return out;
}

/**
 * Projects a sorted 1D target sequence into `[lo, hi]` with a guaranteed minimum
 * monotonic gap between every adjacent pair without violating either boundary.
 */
function solveMonotonic1DSlots(
  targets: readonly number[],
  lo: number,
  hi: number,
  desiredGap: number
): number[] {
  const n = targets.length;
  if (n === 0) return [];
  if (n === 1) {
    return [THREE.MathUtils.clamp(targets[0], lo, hi)];
  }

  const maxFeasibleGap = Math.max(0, (hi - lo) / (n - 1));
  const gap = Math.min(desiredGap, maxFeasibleGap);
  const out = new Array<number>(n);

  for (let i = 0; i < n; i++) {
    const minI = lo + i * gap;
    const maxI = hi - (n - 1 - i) * gap;
    out[i] = THREE.MathUtils.clamp(targets[i], minI, maxI);
  }

  for (let i = 1; i < n; i++) {
    if (out[i] < out[i - 1] + gap) {
      out[i] = out[i - 1] + gap;
    }
  }

  for (let i = n - 2; i >= 0; i--) {
    if (out[i] > out[i + 1] - gap) {
      out[i] = out[i + 1] - gap;
    }
  }

  return out;
}

function compareAnchorIdentity(
  a: ExplodedPinAnchorInput,
  b: ExplodedPinAnchorInput
): number {
  const bomCmp = a.bomCode.localeCompare(b.bomCode);
  if (bomCmp !== 0) return bomCmp;
  return a.partId.localeCompare(b.partId);
}

function aspectScreenDist(
  au: number,
  av: number,
  bu: number,
  bv: number
): number {
  // 16:10 plate aspect ratio so Euclidean distance matches real visual pixel separation
  return Math.hypot((au - bu) * 1.6, av - bv);
}

/**
 * Deterministically selects up to `maxCallouts` hero parts distributed across assembly
 * groups (`slide`, `fire_control`, `frame`, `magazine`) and spatial X/Y spread, then
 * routes non-crossing 0.35pt DK Publishing elbow leader lines into collision-free
 * top/bottom (or left/right for tall vertical exhibits) editorial margin bands.
 */
export function solveDkAnnotatedCallouts(
  anchors: readonly ExplodedPinAnchorInput[],
  maxCallouts = 10
): DkCalloutItem[] {
  const targetCount = Math.min(
    anchors.length,
    Math.max(0, Math.floor(maxCallouts))
  );
  if (targetCount === 0) return [];

  // Deduplicate by partId and sort canonically so output is order-independent & deterministic
  const seenIds = new Set<string>();
  const pool: ExplodedPinAnchorInput[] = [];
  for (let i = 0; i < anchors.length; i++) {
    const a = anchors[i];
    if (seenIds.has(a.partId)) continue;
    seenIds.add(a.partId);
    pool.push({
      ...a,
      anchorU: THREE.MathUtils.clamp(
        Number.isFinite(a.anchorU) ? a.anchorU : 0.5,
        0.04,
        0.96
      ),
      anchorV: THREE.MathUtils.clamp(
        Number.isFinite(a.anchorV) ? a.anchorV : 0.5,
        0.08,
        0.92
      ),
    });
  }
  pool.sort(compareAnchorIdentity);

  const effectiveTarget = Math.min(pool.length, targetCount);
  const selected: ExplodedPinAnchorInput[] = [];
  const selectedIds = new Set<string>();
  const groupCounts: Record<AssemblyGroupKey, number> = {
    slide: 0,
    frame: 0,
    fire_control: 0,
    magazine: 0,
  };

  // Phase 1: Guarantee assembly-group diversity across all present groups
  for (const group of DK_GROUP_PRIORITY_ORDER) {
    if (selected.length >= effectiveTarget) break;
    const candidates = pool.filter(
      (a) => a.group === group && !selectedIds.has(a.partId)
    );
    if (candidates.length === 0) continue;

    let best = candidates[0];
    let bestScore = -Infinity;

    for (let i = 0; i < candidates.length; i++) {
      const c = candidates[i];
      let score: number;
      if (selected.length === 0) {
        // Seed first hero anchor near upper-center focal heart (bolt / slide / receiver)
        score = -aspectScreenDist(c.anchorU, c.anchorV, 0.48, 0.42);
      } else {
        let minDist = Infinity;
        for (let j = 0; j < selected.length; j++) {
          const d = aspectScreenDist(
            c.anchorU,
            c.anchorV,
            selected[j].anchorU,
            selected[j].anchorV
          );
          if (d < minDist) minDist = d;
        }
        score = minDist;
      }

      if (
        score > bestScore + 1e-6 ||
        (Math.abs(score - bestScore) <= 1e-6 &&
          compareAnchorIdentity(c, best) < 0)
      ) {
        best = c;
        bestScore = score;
      }
    }

    selected.push(best);
    selectedIds.add(best.partId);
    groupCounts[best.group] += 1;
  }

  // Phase 2: Farthest-point sampling with group-balance & X-column spread bonus
  while (selected.length < effectiveTarget) {
    let best: ExplodedPinAnchorInput | null = null;
    let bestScore = -Infinity;

    for (let i = 0; i < pool.length; i++) {
      const c = pool[i];
      if (selectedIds.has(c.partId)) continue;

      let minDist = Infinity;
      let minDeltaU = Infinity;
      for (let j = 0; j < selected.length; j++) {
        const s = selected[j];
        const d = aspectScreenDist(c.anchorU, c.anchorV, s.anchorU, s.anchorV);
        if (d < minDist) minDist = d;
        const du = Math.abs(c.anchorU - s.anchorU);
        if (du < minDeltaU) minDeltaU = du;
      }

      const groupBalance = 1 / (1 + 0.35 * groupCounts[c.group]);
      const colSpread = minDeltaU < 0.018 ? 0.65 : 1.0;
      const score = minDist * groupBalance * colSpread;

      if (
        best === null ||
        score > bestScore + 1e-6 ||
        (Math.abs(score - bestScore) <= 1e-6 &&
          compareAnchorIdentity(c, best) < 0)
      ) {
        best = c;
        bestScore = score;
      }
    }

    if (!best) break;
    selected.push(best);
    selectedIds.add(best.partId);
    groupCounts[best.group] += 1;
  }

  const priorityByPartId = new Map<string, number>();
  for (let i = 0; i < selected.length; i++) {
    priorityByPartId.set(selected[i].partId, selected.length - i);
  }

  let minU = Infinity;
  let maxU = -Infinity;
  let minV = Infinity;
  let maxV = -Infinity;
  for (let i = 0; i < selected.length; i++) {
    const a = selected[i];
    if (a.anchorU < minU) minU = a.anchorU;
    if (a.anchorU > maxU) maxU = a.anchorU;
    if (a.anchorV < minV) minV = a.anchorV;
    if (a.anchorV > maxV) maxV = a.anchorV;
  }
  const spanU = maxU - minU;
  const spanV = maxV - minV;

  // Vertical tall exhibits (e.g. compound bow) benefit from wide left/right DK callout margins
  const useLeftRightRails =
    selected.length >= 2 &&
    minU >= 0.24 &&
    maxU <= 0.76 &&
    spanV > spanU * 1.15;

  const out: DkCalloutItem[] = [];

  if (useLeftRightRails) {
    // Split strictly by horizontal U so left & right leader half-planes are disjoint
    const byHorizontal = [...selected].sort((a, b) => {
      if (Math.abs(a.anchorU - b.anchorU) > 1e-5) return a.anchorU - b.anchorU;
      if (Math.abs(a.anchorV - b.anchorV) > 1e-5) return a.anchorV - b.anchorV;
      return compareAnchorIdentity(a, b);
    });
    const leftCount = Math.ceil(byHorizontal.length / 2);
    const leftBucket = byHorizontal.slice(0, leftCount).sort((a, b) => {
      if (Math.abs(a.anchorV - b.anchorV) > 1e-5) return a.anchorV - b.anchorV;
      return b.anchorU - a.anchorU;
    });
    const rightBucket = byHorizontal.slice(leftCount).sort((a, b) => {
      if (Math.abs(a.anchorV - b.anchorV) > 1e-5) return a.anchorV - b.anchorV;
      return a.anchorU - b.anchorU;
    });

    const layoutVerticalSide = (
      bucket: readonly ExplodedPinAnchorInput[],
      side: 'left' | 'right'
    ) => {
      const n = bucket.length;
      if (n === 0) return;

      const loV = 0.095;
      const hiV = 0.905;
      const labelU = side === 'left' ? 0.145 : 0.855;
      const align: 'left' | 'right' = side === 'left' ? 'right' : 'left';

      const extremeU =
        side === 'left'
          ? Math.min(...bucket.map((b) => b.anchorU))
          : Math.max(...bucket.map((b) => b.anchorU));
      const kneeU =
        side === 'left'
          ? extremeU > labelU + 0.03
            ? Math.max(labelU + 0.025, Math.min(0.225, extremeU - 0.02))
            : Math.max(labelU + 0.006, extremeU - 0.004)
          : extremeU < labelU - 0.03
            ? Math.min(labelU - 0.025, Math.max(0.775, extremeU + 0.02))
            : Math.min(labelU - 0.006, extremeU + 0.004);

      const targetVs = bucket.map((item, idx) => {
        const evenV = n === 1 ? 0.5 : loV + (idx / (n - 1)) * (hiV - loV);
        return evenV * 0.72 + item.anchorV * 0.28;
      });
      const desiredGapV = Math.min(0.165, (hiV - loV) / Math.max(1, n - 1));
      const labelVs = solveMonotonic1DSlots(targetVs, loV, hiV, desiredGapV);

      const rawKneeVs = bucket.map((b) => b.anchorV);
      for (let i = 0; i < n - 1; i++) {
        if (Math.abs(rawKneeVs[i + 1] - rawKneeVs[i]) < 0.004) {
          rawKneeVs[i] -= 0.003;
          rawKneeVs[i + 1] += 0.003;
        }
      }
      const kneeVs = solveMonotonic1DSlots(rawKneeVs, 0.05, 0.95, 0.004);

      for (let i = 0; i < n; i++) {
        const item = bucket[i];
        out.push({
          partId: item.partId,
          bomCode: item.bomCode,
          group: item.group,
          side,
          anchorU: item.anchorU,
          anchorV: item.anchorV,
          kneeU,
          kneeV: kneeVs[i],
          labelU,
          labelV: labelVs[i],
          align,
          priority: priorityByPartId.get(item.partId) ?? 1,
        });
      }
    };

    layoutVerticalSide(leftBucket, 'left');
    layoutVerticalSide(rightBucket, 'right');
    return out;
  }

  // Standard Horizontal DK Spread Layout: strict vertical split -> disjoint top/bottom half-planes
  const byVertical = [...selected].sort((a, b) => {
    if (Math.abs(a.anchorV - b.anchorV) > 0.006) {
      return a.anchorV - b.anchorV;
    }
    if (a.preferredDir !== b.preferredDir) {
      return a.preferredDir === 'up' ? -1 : 1;
    }
    if (Math.abs(a.anchorU - b.anchorU) > 1e-5) {
      return a.anchorU - b.anchorU;
    }
    return compareAnchorIdentity(a, b);
  });

  const topCount = Math.ceil(byVertical.length / 2);
  const topBucket = byVertical.slice(0, topCount).sort((a, b) => {
    if (Math.abs(a.anchorU - b.anchorU) > 1e-5) return a.anchorU - b.anchorU;
    if (Math.abs(a.anchorV - b.anchorV) > 1e-5) return b.anchorV - a.anchorV;
    return compareAnchorIdentity(a, b);
  });
  const bottomBucket = byVertical.slice(topCount).sort((a, b) => {
    if (Math.abs(a.anchorU - b.anchorU) > 1e-5) return a.anchorU - b.anchorU;
    if (Math.abs(a.anchorV - b.anchorV) > 1e-5) return a.anchorV - b.anchorV;
    return compareAnchorIdentity(a, b);
  });

  const layoutHorizontalSide = (
    bucket: readonly ExplodedPinAnchorInput[],
    side: 'top' | 'bottom'
  ) => {
    const n = bucket.length;
    if (n === 0) return;

    const loU = 0.085;
    const hiU = 0.915;
    const labelV = side === 'top' ? 0.055 : 0.945;

    // Shared knee band strictly outside all anchors on this rail guarantees zero crossings
    const extremeV =
      side === 'top'
        ? Math.min(...bucket.map((b) => b.anchorV))
        : Math.max(...bucket.map((b) => b.anchorV));
    const kneeV =
      side === 'top'
        ? extremeV > labelV + 0.03
          ? Math.max(labelV + 0.025, Math.min(0.145, extremeV - 0.02))
          : Math.max(labelV + 0.006, extremeV - 0.004)
        : extremeV < labelV - 0.03
          ? Math.min(labelV - 0.025, Math.max(0.855, extremeV + 0.02))
          : Math.min(labelV - 0.006, extremeV + 0.004);

    const targetUs = bucket.map((item, idx) => {
      const evenU = n === 1 ? 0.5 : loU + (idx / (n - 1)) * (hiU - loU);
      return evenU * 0.72 + item.anchorU * 0.28;
    });
    const desiredGapU = Math.min(0.175, (hiU - loU) / Math.max(1, n - 1));
    const labelUs = solveMonotonic1DSlots(targetUs, loU, hiU, desiredGapU);

    // Strictly monotonic kneeU aligned vertically with each anchor; fan slightly on exact ties
    const rawKneeUs = bucket.map((b) => b.anchorU);
    for (let i = 0; i < n - 1; i++) {
      if (Math.abs(rawKneeUs[i + 1] - rawKneeUs[i]) < 0.004) {
        rawKneeUs[i] -= 0.003;
        rawKneeUs[i + 1] += 0.003;
      }
    }
    const kneeUs = solveMonotonic1DSlots(rawKneeUs, 0.04, 0.96, 0.004);

    for (let i = 0; i < n; i++) {
      const item = bucket[i];
      const labelU = labelUs[i];
      const align: 'left' | 'right' | 'center' =
        labelU < 0.075 ? 'left' : labelU > 0.925 ? 'right' : 'center';

      out.push({
        partId: item.partId,
        bomCode: item.bomCode,
        group: item.group,
        side,
        anchorU: item.anchorU,
        anchorV: item.anchorV,
        kneeU: kneeUs[i],
        kneeV,
        labelU,
        labelV,
        align,
        priority: priorityByPartId.get(item.partId) ?? 1,
      });
    }
  };

  layoutHorizontalSide(topBucket, 'top');
  layoutHorizontalSide(bottomBucket, 'bottom');

  return out;
}

function projectWorldPointToPlate(
  x: number,
  y: number,
  z: number,
  camera: THREE.Camera
): MonographLoupeAnchor {
  _worldVec.set(x, y, z).project(camera);
  return {
    u: THREE.MathUtils.clamp(_worldVec.x * 0.5 + 0.5, 0.04, 0.96),
    v: THREE.MathUtils.clamp(-_worldVec.y * 0.5 + 0.5, 0.06, 0.94),
  };
}

/**
 * Projects the 3D assembled centroid of each assembly group (`slide`, `frame`, `fcg`, `mag`)
 * and the breech/chamber anatomical focus point (`breech_closeup`) onto normalized
 * `[0..1] × [0..1]` hero plate coordinates for DK circular magnification loupe connectors.
 */
export function projectLoupeAnchors(
  weaponId: WeaponId,
  parts: readonly WeaponPartSpec[],
  camera: THREE.Camera
): Partial<Record<MonographLoupeKey, { u: number; v: number }>> {
  camera.updateMatrixWorld();

  const accum: Record<
    AssemblyGroupKey,
    { sx: number; sy: number; sz: number; count: number }
  > = {
    slide: { sx: 0, sy: 0, sz: 0, count: 0 },
    frame: { sx: 0, sy: 0, sz: 0, count: 0 },
    fire_control: { sx: 0, sy: 0, sz: 0, count: 0 },
    magazine: { sx: 0, sy: 0, sz: 0, count: 0 },
  };

  const manifest = getWeaponManifest(weaponId);
  const focusPartId = manifest.workbenchMeta.cutawayFocusPartId;
  let focusPartWorld: [number, number, number] | null = null;

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const { position, rotation } = computePartTransform(part, 0);
    const localCenter =
      part.calloutAnchor ?? getPartLocalCenter(weaponId, part.id);

    _euler.set(rotation[0], rotation[1], rotation[2]);
    _worldVec
      .set(localCenter[0], localCenter[1], localCenter[2])
      .applyEuler(_euler);
    const wx = _worldVec.x + position[0];
    const wy = _worldVec.y + position[1];
    const wz = _worldVec.z + position[2];

    const bucket = accum[part.group];
    bucket.sx += wx;
    bucket.sy += wy;
    bucket.sz += wz;
    bucket.count += 1;

    if (part.id === focusPartId) {
      focusPartWorld = [wx, wy, wz];
    }
  }

  const out: Partial<Record<MonographLoupeKey, MonographLoupeAnchor>> = {};

  for (const group of DK_GROUP_PRIORITY_ORDER) {
    const bucket = accum[group];
    if (bucket.count <= 0) continue;
    const key = LOUPE_KEY_BY_GROUP[group];
    out[key] = projectWorldPointToPlate(
      bucket.sx / bucket.count,
      bucket.sy / bucket.count,
      bucket.sz / bucket.count,
      camera
    );
  }

  const isArchery = manifest.catalog.category === 'archery';
  const chamber = manifest.workbenchMeta.chamberGlowPos;
  const hasValidChamber =
    !isArchery &&
    Array.isArray(chamber) &&
    chamber.length === 3 &&
    chamber.every((v) => Number.isFinite(v));

  if (hasValidChamber) {
    out.breech_closeup = projectWorldPointToPlate(
      chamber[0],
      chamber[1],
      chamber[2],
      camera
    );
  } else if (focusPartWorld) {
    out.breech_closeup = projectWorldPointToPlate(
      focusPartWorld[0],
      focusPartWorld[1],
      focusPartWorld[2],
      camera
    );
  } else {
    const fallbackTarget = manifest.cameraPresets.cutaway_focus.target;
    out.breech_closeup = projectWorldPointToPlate(
      fallbackTarget[0],
      fallbackTarget[1],
      fallbackTarget[2],
      camera
    );
  }

  return out;
}

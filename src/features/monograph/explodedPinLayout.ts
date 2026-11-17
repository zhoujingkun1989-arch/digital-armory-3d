import * as THREE from 'three';
import { getPartLocalCenter } from '../../engine/geometry/geometryService';
import { computePartTransform } from '../../engine/kinematics/math';
import type { AssemblyGroupKey, WeaponId, WeaponPartSpec } from '../../weapons/types';

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

const _worldVec = new THREE.Vector3();
const _euler = new THREE.Euler();

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
      const evenSlotU =
        n === 1 ? 0.5 : minMarginU + (i / (n - 1)) * spanU;
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

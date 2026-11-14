import * as THREE from 'three';
import { csgSubtract, mergeParts } from '../../../engine/geometry/csgBuilder';

/**
 * Performance-critical CSG batching: three-bvh-csg re-builds the BVH of the running result for every
 * sequential cutter, so N cutters cost N full evaluations. We walk the cutters in authored order and
 * pack each run of consecutive cutters whose world AABBs are mutually disjoint (with a safety gap so no
 * two shells in one group touch or share coplanar faces) and merge each group into ONE closed multi-shell
 * cutter brush. Disjoint closed shells classify correctly under the closest-hit back-face test, giving an
 * the same boolean result (and the same coplanar tie-breaking order) in a fraction of the evaluations.
 */
export function csgSubtractBatched(
  base: THREE.BufferGeometry,
  cutters: THREE.BufferGeometry[],
  creaseRad = Math.PI / 5.2,
  gap = 0.004
): THREE.BufferGeometry {
  const groups: { boxes: THREE.Box3[]; geos: THREE.BufferGeometry[] }[] = [];
  for (const cutter of cutters) {
    cutter.computeBoundingBox();
    const box = cutter.boundingBox!.clone().expandByScalar(gap);
    let target: (typeof groups)[number] | undefined = groups[groups.length - 1];
    if (!target || target.boxes.some((b) => b.intersectsBox(box))) {
      target = { boxes: [], geos: [] };
      groups.push(target);
    }
    target.boxes.push(box);
    target.geos.push(cutter);
  }
  const merged = groups.map((g) =>
    g.geos.length === 1 ? g.geos[0] : mergeParts(g.geos, 0)
  );
  return csgSubtract(base, merged, creaseRad);
}

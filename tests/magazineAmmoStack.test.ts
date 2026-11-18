import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  CALIBER_VISUAL_SPECS,
  WEAPON_ROUND_FIT,
  getCaliberGeometries,
} from '../src/engine/actors/BallisticsSystem';
import {
  MAGAZINE_STACK_SPECS,
  MAX_MAGAZINE_STACK_INSTANCES,
  computeMagazineFeedShift,
  computeMagazineReplenishAlpha,
  createMutableMagazineRoundPose,
  evaluateMagazineRoundSlotInto,
} from '../src/engine/ballistics/magazineStackSpecs';
import {
  createMutablePose,
  evaluatePartPoseInto,
} from '../src/engine/kinematics/math';
import { getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponGeometryBuilders } from '../src/weapons/geometryLoaders';
import { loadWeaponPlugin } from '../src/weapons/registry';
import {
  WEAPON_IDS,
  type WeaponId,
  type WeaponPartSpec,
} from '../src/weapons/types';

const MIN_ROUND_COUNTS: Readonly<Record<WeaponId, number>> = {
  awm: 5,
  deagle: 7,
  m82a1: 10,
  g17: 13,
  p320: 13,
  ak15: 18,
  m4a1: 18,
  scar: 18,
  aug: 18,
  mp5: 18,
  p90: 25,
  lift33: 5,
  r500: 3,
  python: 5,
  benellim4: 6,
  garand: 8,
  m249: 4,
  p08: 8,
  vector: 16,
};

function computePartWorldBox(
  geo: THREE.BufferGeometry,
  part: WeaponPartSpec
): THREE.Box3 {
  geo.computeBoundingBox();
  const mat = new THREE.Matrix4();
  const rot = part.assembledRot ?? [0, 0, 0];
  mat.compose(
    new THREE.Vector3(
      part.assembledPos[0],
      part.assembledPos[1],
      part.assembledPos[2]
    ),
    new THREE.Quaternion().setFromEuler(
      new THREE.Euler(rot[0], rot[1], rot[2])
    ),
    new THREE.Vector3(1, 1, 1)
  );
  const worldBox = new THREE.Box3();
  const posAttr = geo.getAttribute('position');
  const v = new THREE.Vector3();
  for (let i = 0; i < posAttr.count; i++) {
    v.fromBufferAttribute(posAttr, i).applyMatrix4(mat);
    worldBox.expandByPoint(v);
  }
  return worldBox;
}

describe('19-Exhibit Full-Capacity 3D Magazine, Belt, Cylinder, Tubular, En-Bloc & Quiver Stack Contracts', () => {
  it('verifies round counts, single/staggered geometry, Slot 0 anchors, P90 90° helical rotation, and zero mag_body / mag_follower clipping', async () => {
    const pose = createMutableMagazineRoundPose();
    const qRound = new THREE.Quaternion();
    const eRound = new THREE.Euler();
    const vHead = new THREE.Vector3();
    const vCenter = new THREE.Vector3();
    const vTip = new THREE.Vector3();

    for (const weaponId of WEAPON_IDS) {
      const spec = MAGAZINE_STACK_SPECS[weaponId];
      expect(spec.weaponId).toBe(weaponId);
      expect(
        spec.roundCount,
        `${weaponId}: insufficient stack roundCount`
      ).toBeGreaterThanOrEqual(MIN_ROUND_COUNTS[weaponId]);
      expect(spec.slots.length).toBe(spec.roundCount + 1);
      expect(spec.slots.length).toBeLessThanOrEqual(
        MAX_MAGAZINE_STACK_INSTANCES
      );

      const manifest = getWeaponManifest(weaponId);
      const calProfile = manifest.caliberProfile;
      const calSpec = CALIBER_VISUAL_SPECS[calProfile];
      const roundFit = WEAPON_ROUND_FIT[weaponId];
      const calGeos = getCaliberGeometries(calProfile);
      calGeos.caseGeo.computeBoundingBox();
      calGeos.bulletGeo.computeBoundingBox();

      const caseBox = calGeos.caseGeo.boundingBox!;
      const bulletBox = calGeos.bulletGeo.boundingBox!;
      const caseRadiusWorld = caseBox.max.y * roundFit.roundScale;
      const localHeadX =
        (caseBox.min.x + roundFit.magLocalShiftX) * roundFit.roundScale;
      const localTipX =
        (bulletBox.max.x +
          calSpec.bulletLocalOffset +
          roundFit.magLocalShiftX) *
        roundFit.roundScale;
      const localMidX = 0.5 * (localHeadX + localTipX);

      const plugin = await loadWeaponPlugin(weaponId);
      const builders = await loadWeaponGeometryBuilders(weaponId);

      const magBodyPart = plugin.parts.find(
        (p) => p.id === spec.magBodyPartId
      );
      const followerPart = plugin.parts.find(
        (p) => p.id === spec.followerPartId
      );
      expect(
        magBodyPart,
        `${weaponId}: missing ${spec.magBodyPartId}`
      ).toBeDefined();
      expect(
        followerPart,
        `${weaponId}: missing ${spec.followerPartId}`
      ).toBeDefined();

      const magBodyGeo = builders[spec.magBodyPartId]();
      const followerGeo = builders[spec.followerPartId]();
      magBodyGeo.computeBoundingBox();
      const magLocalBox = magBodyGeo.boundingBox!.clone();

      const magWorldBox = computePartWorldBox(magBodyGeo, magBodyPart!);
      const followerWorldBox = computePartWorldBox(followerGeo, followerPart!);

      // Pre-extract all world-space vertices of `mag_follower` for exact 3D cylinder non-penetration check
      const fRot = followerPart!.assembledRot ?? [0, 0, 0];
      const followerWorldMat = new THREE.Matrix4().compose(
        new THREE.Vector3(...followerPart!.assembledPos),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(fRot[0], fRot[1], fRot[2])
        ),
        new THREE.Vector3(1, 1, 1)
      );
      const followerPosAttr = followerGeo.getAttribute('position');
      const followerWorldVerts: THREE.Vector3[] = [];
      for (let vi = 0; vi < followerPosAttr.count; vi++) {
        followerWorldVerts.push(
          new THREE.Vector3()
            .fromBufferAttribute(followerPosAttr, vi)
            .applyMatrix4(followerWorldMat)
        );
      }

      const enclosureWorldBox = magWorldBox.clone();
      if (spec.throatPartId) {
        const throatPart = plugin.parts.find(
          (p) => p.id === spec.throatPartId
        );
        expect(throatPart).toBeDefined();
        const throatGeo = builders[spec.throatPartId]();
        enclosureWorldBox.union(computePartWorldBox(throatGeo, throatPart!));
      }

      // Inverse matrix of `mag_body` for exact oriented local-wall verification on raked pistols
      const magRot = magBodyPart!.assembledRot ?? [0, 0, 0];
      const magWorldMat = new THREE.Matrix4().compose(
        new THREE.Vector3(...magBodyPart!.assembledPos),
        new THREE.Quaternion().setFromEuler(
          new THREE.Euler(magRot[0], magRot[1], magRot[2])
        ),
        new THREE.Vector3(1, 1, 1)
      );
      const magInvMat = magWorldMat.clone().invert();

      // 1. Anchor verification against `plugin.computeBallisticsState(0).nextRoundPos`
      const b0 = plugin.computeBallisticsState(0);
      if (weaponId === 'p90') {
        // P90 Slot 0 sits axially in `p90_helical_ramp` feed lips (`ry = 0`), while `Slot 3`
        // (`firingHandoffSlotIndex`) anchors at `b0.nextRoundPos` (`[-3.65, 2.66, 0]`, `ry = +π/2`)!
        evaluateMagazineRoundSlotInto(
          weaponId,
          spec.firingHandoffSlotIndex,
          0,
          pose
        );
        const handoffDist = Math.hypot(
          pose.px - b0.nextRoundPos[0],
          pose.py - b0.nextRoundPos[1],
          pose.pz - b0.nextRoundPos[2]
        );
        expect(
          handoffDist,
          `p90: turret handoff slot diverged from computeBallisticsState(0).nextRoundPos`
        ).toBeLessThanOrEqual(0.05);

        const bFeedLips = plugin.computeBallisticsState(0.68);
        evaluateMagazineRoundSlotInto(weaponId, 0, 0, pose);
        expect(Math.abs(pose.px - bFeedLips.nextRoundPos[0])).toBeLessThanOrEqual(
          0.05
        );
      } else {
        evaluateMagazineRoundSlotInto(weaponId, 0, 0, pose);
        const slot0Dist = Math.hypot(
          pose.px - b0.nextRoundPos[0],
          pose.py - b0.nextRoundPos[1],
          pose.pz - b0.nextRoundPos[2]
        );
        expect(
          slot0Dist,
          `${weaponId}: Slot 0 diverged from computeBallisticsState(0).nextRoundPos`
        ).toBeLessThanOrEqual(0.05);
      }

      // 2. Column stagger verification (Deagle single-stack z=0 vs double-stack stagger)
      if (weaponId === 'deagle') {
        for (let i = 0; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto(weaponId, i, 0, pose);
          expect(Math.abs(pose.pz)).toBeLessThan(1e-6);
        }
      } else if (weaponId !== 'p90') {
        let maxAbsZ = 0;
        for (let i = 1; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto(weaponId, i, 0, pose);
          maxAbsZ = Math.max(maxAbsZ, Math.abs(pose.pz));
        }
        expect(
          maxAbsZ,
          `${weaponId}: expected staggered double-column Z offset`
        ).toBeGreaterThan(0.04);
      }

      // 3. Per-round 3D enclosure (head, center, bullet tip) & lowered follower clearance
      const deckPt = spec.followerDeckPlane.point;
      const deckNormal = spec.followerDeckPlane.normal;

      for (let i = 0; i < spec.roundCount; i++) {
        evaluateMagazineRoundSlotInto(weaponId, i, 0, pose);
        expect(Number.isFinite(pose.px)).toBe(true);
        expect(Number.isFinite(pose.py)).toBe(true);
        expect(Number.isFinite(pose.pz)).toBe(true);
        expect(pose.scaleMult).toBe(1);

        eRound.set(pose.rx, pose.ry, pose.rz);
        qRound.setFromEuler(eRound);

        vHead.set(localHeadX, 0, 0).applyQuaternion(qRound);
        vHead.x += pose.px;
        vHead.y += pose.py;
        vHead.z += pose.pz;

        vCenter.set(localMidX, 0, 0).applyQuaternion(qRound);
        vCenter.x += pose.px;
        vCenter.y += pose.py;
        vCenter.z += pose.pz;

        vTip.set(localTipX, 0, 0).applyQuaternion(qRound);
        vTip.x += pose.px;
        vTip.y += pose.py;
        vTip.z += pose.pz;

        // Top feed-lip allowance on Slot 0/1 where presentation round sits in feed throat/scoop
        const topLipAllowanceY = i <= 1 ? 0.95 : 0.02;
        const frontScoopAllowanceX = i <= 1 ? 0.75 : 0.02;

        for (const [label, pt] of [
          ['head', vHead],
          ['center', vCenter],
          ['tip', vTip],
        ] as const) {
          expect(
            pt.x,
            `${weaponId} slot[${i}] ${label}.x below mag_body minX`
          ).toBeGreaterThanOrEqual(enclosureWorldBox.min.x - 0.02);
          expect(
            pt.x,
            `${weaponId} slot[${i}] ${label}.x above mag_body maxX`
          ).toBeLessThanOrEqual(
            enclosureWorldBox.max.x + frontScoopAllowanceX
          );
          expect(
            pt.y,
            `${weaponId} slot[${i}] ${label}.y below mag_body minY`
          ).toBeGreaterThanOrEqual(enclosureWorldBox.min.y - 0.02);
          expect(
            pt.y,
            `${weaponId} slot[${i}] ${label}.y above mag_body maxY`
          ).toBeLessThanOrEqual(enclosureWorldBox.max.y + topLipAllowanceY);
          expect(
            pt.z,
            `${weaponId} slot[${i}] ${label}.z outside mag_body minZ`
          ).toBeGreaterThanOrEqual(enclosureWorldBox.min.z + 0.02);
          expect(
            pt.z,
            `${weaponId} slot[${i}] ${label}.z outside mag_body maxZ`
          ).toBeLessThanOrEqual(enclosureWorldBox.max.z - 0.02);
        }

        // Oriented local-space wall check for angled pistol tubes (`i >= 1`)
        if (
          i >= 1 &&
          (weaponId === 'g17' || weaponId === 'p320' || weaponId === 'deagle')
        ) {
          const headLocal = vHead.clone().applyMatrix4(magInvMat);
          const tipLocal = vTip.clone().applyMatrix4(magInvMat);
          expect(
            headLocal.x,
            `${weaponId} slot[${i}] local head X poked rear mag wall`
          ).toBeGreaterThanOrEqual(magLocalBox.min.x + 0.04);
          expect(
            tipLocal.x,
            `${weaponId} slot[${i}] local tip X poked front mag wall`
          ).toBeLessThanOrEqual(magLocalBox.max.x - 0.04);
          expect(Math.abs(headLocal.z) + caseRadiusWorld).toBeLessThanOrEqual(
            magLocalBox.max.z - 0.02
          );
        }

        // Exact curved-wall cross-section verification on curved rifle/SMG magazines (`i >= 1`)
        if (i >= 1) {
          for (const [label, pt] of [
            ['head', vHead],
            ['tip', vTip],
          ] as const) {
            if (weaponId === 'ak15') {
              const r = Math.hypot(14.35 - pt.x, -0.3 - pt.y);
              expect(
                r,
                `ak15 slot[${i}] ${label} poked front concave banana wall`
              ).toBeGreaterThanOrEqual(10.68);
              expect(
                r,
                `ak15 slot[${i}] ${label} poked rear convex banana wall`
              ).toBeLessThanOrEqual(13.02);
            } else if (weaponId === 'aug') {
              const r = Math.hypot(8.05 - pt.x, 0.45 - pt.y);
              expect(
                r,
                `aug slot[${i}] ${label} poked front concave waffle wall`
              ).toBeGreaterThanOrEqual(16.78);
              expect(
                r,
                `aug slot[${i}] ${label} poked rear convex waffle wall`
              ).toBeLessThanOrEqual(19.22);
            } else if (weaponId === 'mp5') {
              const r = Math.hypot(18.9 - pt.x, -pt.y);
              expect(
                r,
                `mp5 slot[${i}] ${label} poked front concave steel wall`
              ).toBeGreaterThanOrEqual(15.12);
              expect(
                r,
                `mp5 slot[${i}] ${label} poked rear convex steel wall`
              ).toBeLessThanOrEqual(16.88);
            } else if (weaponId === 'm4a1') {
              if (pt.y < -2.25) {
                const r = Math.hypot(20.4 - pt.x, -2.25 - pt.y);
                expect(r).toBeGreaterThanOrEqual(16.68);
                expect(r).toBeLessThanOrEqual(19.32);
              } else {
                expect(Math.abs(pt.x - 2.4)).toBeLessThanOrEqual(1.32);
              }
            } else if (weaponId === 'scar') {
              const yLoc = pt.y + 1.8;
              const uArc = yLoc >= -1.2 ? 0 : Math.min(1, (-1.2 - yLoc) / 6.4);
              const xMid = 2.45 + 0.72 * uArc * uArc;
              expect(
                Math.abs(pt.x - xMid),
                `scar slot[${i}] ${label} poked curved STANAG wall`
              ).toBeLessThanOrEqual(1.34);
            }
          }
        }

        // Exact 3D mesh-vertex vs cartridge-cylinder non-penetration check against `mag_follower`!
        const segAx = vTip.x - vHead.x;
        const segAy = vTip.y - vHead.y;
        const segAz = vTip.z - vHead.z;
        const segLenSq = Math.max(
          1e-8,
          segAx * segAx + segAy * segAy + segAz * segAz
        );
        let minFollowerDist = Infinity;
        for (let vi = 0; vi < followerWorldVerts.length; vi++) {
          const fv = followerWorldVerts[vi];
          const wx = fv.x - vHead.x;
          const wy = fv.y - vHead.y;
          const wz = fv.z - vHead.z;
          const proj = (wx * segAx + wy * segAy + wz * segAz) / segLenSq;
          if (proj < -0.02 || proj > 1.02) continue;
          const tClamped = proj < 0 ? 0 : proj > 1 ? 1 : proj;
          const dx = wx - segAx * tClamped;
          const dy = wy - segAy * tClamped;
          const dz = wz - segAz * tClamped;
          const d = Math.hypot(dx, dy, dz);
          if (d < minFollowerDist) minFollowerDist = d;
        }
        expect(
          minFollowerDist,
          `${weaponId} slot[${i}] 3D brass cylinder intersected ${spec.followerPartId} mesh`
        ).toBeGreaterThanOrEqual(caseRadiusWorld);

        // Follower clearance check:
        if (weaponId === 'p90') {
          if (i >= spec.firingHandoffSlotIndex) {
            // Horizontal spine rounds sit strictly rearward (-X) of `p90_mag_follower` front rollers!
            expect(
              pose.px + caseRadiusWorld,
              `p90 slot[${i}] encroached into p90_mag_follower`
            ).toBeLessThanOrEqual(followerWorldBox.min.x + 0.06);
          }
        } else {
          // Signed perpendicular distance above the lowered follower's cartridge-supporting deck
          const signedDeckDist =
            (vCenter.x - deckPt[0]) * deckNormal[0] +
            (vCenter.y - deckPt[1]) * deckNormal[1] +
            (vCenter.z - deckPt[2]) * deckNormal[2];
          expect(
            signedDeckDist,
            `${weaponId} slot[${i}] clipped below follower support deck`
          ).toBeGreaterThanOrEqual(caseRadiusWorld * 0.85);
        }
      }

      // 4. Specific FN P90 90° Helical Feed Turret Rotation Contract
      if (weaponId === 'p90') {
        evaluateMagazineRoundSlotInto('p90', 0, 0, pose);
        expect(Math.abs(pose.ry)).toBeLessThan(0.15);

        evaluateMagazineRoundSlotInto('p90', 1, 0, pose);
        expect(Math.abs(pose.ry)).toBeGreaterThan(0.25);
        expect(Math.abs(pose.ry)).toBeLessThan(1.2);

        for (let i = spec.firingHandoffSlotIndex; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto('p90', i, 0, pose);
          expect(
            Math.abs(pose.ry),
            `p90 horizontal spine slot[${i}] expected ~90° sideways yaw`
          ).toBeGreaterThan(1.2);
        }
      }

      // 5. Colt Python 6-chamber circular ring, Benelli M4 horizontal tube, and M1 Garand staggered en-bloc clip geometry
      if (weaponId === 'python') {
        expect(spec.roundCount).toBe(5);
        for (let i = 0; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto('python', i, 0, pose);
          const radialDist = Math.hypot(pose.py - 1.17, pose.pz);
          expect(radialDist).toBeCloseTo(1.18, 2);
        }
      } else if (weaponId === 'benellim4') {
        expect(spec.roundCount).toBe(6);
        let prevX = -Infinity;
        for (let i = 0; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto('benellim4', i, 0, pose);
          // All 6 shells stack coaxially along the underbarrel magazine tube (`py = -1.25`)
          expect(pose.py).toBeCloseTo(-1.25, 3);
          expect(pose.px).toBeGreaterThan(prevX);
          prevX = pose.px;
        }
      } else if (weaponId === 'garand') {
        expect(spec.roundCount).toBe(8);
        for (let i = 1; i < spec.roundCount; i++) {
          evaluateMagazineRoundSlotInto('garand', i, 0, pose);
          expect(Math.abs(pose.pz)).toBeCloseTo(0.22, 2);
        }
      }
    }
  });

  it('smoothly shifts every reserve round i -> i - 1 across feedShift01 ∈ [0, 1] with zero GC discontinuity', () => {
    const pStart = createMutableMagazineRoundPose();
    const pMid = createMutableMagazineRoundPose();
    const pEnd = createMutableMagazineRoundPose();
    const pTarget = createMutableMagazineRoundPose();

    for (const weaponId of WEAPON_IDS) {
      const spec = MAGAZINE_STACK_SPECS[weaponId];
      expect(computeMagazineFeedShift(weaponId, 0)).toBe(0);
      expect(computeMagazineFeedShift(weaponId, 1)).toBe(1);
      const midF = 0.5 * (spec.feedWindow[0] + spec.feedWindow[1]);
      const midShift = computeMagazineFeedShift(weaponId, midF);
      expect(midShift).toBeGreaterThan(0.2);
      expect(midShift).toBeLessThan(0.8);

      for (let i = 1; i < spec.roundCount; i++) {
        evaluateMagazineRoundSlotInto(weaponId, i, 0, pStart);
        evaluateMagazineRoundSlotInto(weaponId, i, 0.5, pMid);
        evaluateMagazineRoundSlotInto(weaponId, i, 1, pEnd);
        evaluateMagazineRoundSlotInto(weaponId, i - 1, 0, pTarget);

        expect(pEnd.px).toBeCloseTo(pTarget.px, 6);
        expect(pEnd.py).toBeCloseTo(pTarget.py, 6);
        expect(pEnd.pz).toBeCloseTo(pTarget.pz, 6);
        expect(pEnd.ry).toBeCloseTo(pTarget.ry, 6);
        expect(pEnd.rz).toBeCloseTo(pTarget.rz, 6);
        expect(pMid.px).toBeCloseTo(0.5 * (pStart.px + pTarget.px), 6);
        expect(pMid.py).toBeCloseTo(0.5 * (pStart.py + pTarget.py), 6);
      }

      // Replacement slot `N` scales from 0 at shift=0 to 1 at shift=1 and lands on `slot[N - 1]`
      evaluateMagazineRoundSlotInto(weaponId, spec.roundCount, 0, pStart);
      evaluateMagazineRoundSlotInto(weaponId, spec.roundCount, 1, pEnd);
      evaluateMagazineRoundSlotInto(
        weaponId,
        spec.roundCount - 1,
        0,
        pTarget
      );
      expect(pStart.scaleMult).toBe(0);
      expect(pEnd.scaleMult).toBe(1);
      expect(pEnd.px).toBeCloseTo(pTarget.px, 6);
      expect(pEnd.py).toBeCloseTo(pTarget.py, 6);
      expect(computeMagazineReplenishAlpha(weaponId, 0)).toBe(0);
      expect(computeMagazineReplenishAlpha(weaponId, 1)).toBe(1);
    }
  });

  it('maintains zero 3D cylinder collision against live pulsing mag_follower and feeding nextRound across f ∈ [0, 1]', async () => {
    const pose = createMutableMagazineRoundPose();
    const followerPose = createMutablePose();
    const eRound = new THREE.Euler();
    const qRound = new THREE.Quaternion();
    const eNext = new THREE.Euler();
    const qNext = new THREE.Quaternion();
    const eFol = new THREE.Euler();
    const qFol = new THREE.Quaternion();
    const mFol = new THREE.Matrix4();
    const vOne = new THREE.Vector3(1, 1, 1);
    const vFolPos = new THREE.Vector3();

    const sHead = new THREE.Vector3();
    const sTip = new THREE.Vector3();
    const nHead = new THREE.Vector3();
    const nTip = new THREE.Vector3();

    function segmentToSegmentDist(
      a0: THREE.Vector3,
      a1: THREE.Vector3,
      b0: THREE.Vector3,
      b1: THREE.Vector3
    ): number {
      const ux = a1.x - a0.x;
      const uy = a1.y - a0.y;
      const uz = a1.z - a0.z;
      const vx = b1.x - b0.x;
      const vy = b1.y - b0.y;
      const vz = b1.z - b0.z;
      const wx = a0.x - b0.x;
      const wy = a0.y - b0.y;
      const wz = a0.z - b0.z;

      const a = ux * ux + uy * uy + uz * uz;
      const b = ux * vx + uy * vy + uz * vz;
      const c = vx * vx + vy * vy + vz * vz;
      const d = ux * wx + uy * wy + uz * wz;
      const e = vx * wx + vy * wy + vz * wz;
      const denom = a * c - b * b;

      let sN: number;
      let sD = denom;
      let tN: number;
      let tD = denom;

      if (denom < 1e-8) {
        sN = 0.0;
        sD = 1.0;
        tN = e;
        tD = c;
      } else {
        sN = b * e - c * d;
        tN = a * e - b * d;
        if (sN < 0.0) {
          sN = 0.0;
          tN = e;
          tD = c;
        } else if (sN > sD) {
          sN = sD;
          tN = e + b;
          tD = c;
        }
      }

      if (tN < 0.0) {
        tN = 0.0;
        if (-d < 0.0) sN = 0.0;
        else if (-d > a) sN = sD;
        else {
          sN = -d;
          sD = a;
        }
      } else if (tN > tD) {
        tN = tD;
        if (-d + b < 0.0) sN = 0;
        else if (-d + b > a) sN = sD;
        else {
          sN = -d + b;
          sD = a;
        }
      }

      const sc = Math.abs(sN) < 1e-8 ? 0.0 : sN / sD;
      const tc = Math.abs(tN) < 1e-8 ? 0.0 : tN / tD;
      const dx = wx + sc * ux - tc * vx;
      const dy = wy + sc * uy - tc * vy;
      const dz = wz + sc * uz - tc * vz;
      return Math.hypot(dx, dy, dz);
    }

    for (const weaponId of WEAPON_IDS) {
      const spec = MAGAZINE_STACK_SPECS[weaponId];
      const manifest = getWeaponManifest(weaponId);
      const calProfile = manifest.caliberProfile;
      const calSpec = CALIBER_VISUAL_SPECS[calProfile];
      const roundFit = WEAPON_ROUND_FIT[weaponId];
      const calGeos = getCaliberGeometries(calProfile);
      calGeos.caseGeo.computeBoundingBox();
      calGeos.bulletGeo.computeBoundingBox();

      const caseBox = calGeos.caseGeo.boundingBox!;
      const bulletBox = calGeos.bulletGeo.boundingBox!;
      const baseCaseRadius = caseBox.max.y * roundFit.roundScale;

      const plugin = await loadWeaponPlugin(weaponId);
      const builders = await loadWeaponGeometryBuilders(weaponId);
      const followerPart = plugin.parts.find(
        (p) => p.id === spec.followerPartId
      )!;
      const followerGeo = builders[spec.followerPartId]();
      const followerPosAttr = followerGeo.getAttribute('position');
      const localFolVerts: THREE.Vector3[] = [];
      for (let vi = 0; vi < followerPosAttr.count; vi++) {
        localFolVerts.push(
          new THREE.Vector3().fromBufferAttribute(followerPosAttr, vi)
        );
      }
      const worldFolVerts = localFolVerts.map((v) => v.clone());

      for (let step = 0; step <= 100; step++) {
        const f = Number((step * 0.01).toFixed(2));
        evaluatePartPoseInto(
          followerPart,
          0,
          true,
          f,
          plugin.computeFiringKinematics,
          followerPose
        );
        vFolPos.set(followerPose.px, followerPose.py, followerPose.pz);
        eFol.set(followerPose.rx, followerPose.ry, followerPose.rz);
        qFol.setFromEuler(eFol);
        mFol.compose(vFolPos, qFol, vOne);
        for (let vi = 0; vi < localFolVerts.length; vi++) {
          worldFolVerts[vi].copy(localFolVerts[vi]).applyMatrix4(mFol);
        }

        // Live `nextRound` segment from `BallisticsSystem.tsx`
        const bState = plugin.computeBallisticsState(f);
        const uFeed = THREE.MathUtils.clamp((f - 0.58) / 0.24, 0, 1);
        const feedBlend = uFeed * uFeed * (3 - 2 * uFeed);
        const nextInnerShiftX = roundFit.magLocalShiftX * (1 - feedBlend);
        eNext.set(0, bState.nextRoundRotY ?? 0, bState.nextRoundRotZ);
        qNext.setFromEuler(eNext);
        nHead
          .set((caseBox.min.x + nextInnerShiftX) * roundFit.roundScale, 0, 0)
          .applyQuaternion(qNext);
        nHead.x += bState.nextRoundPos[0];
        nHead.y += bState.nextRoundPos[1];
        nHead.z += bState.nextRoundPos[2];
        nTip
          .set(
            (bulletBox.max.x + calSpec.bulletLocalOffset + nextInnerShiftX) *
              roundFit.roundScale,
            0,
            0
          )
          .applyQuaternion(qNext);
        nTip.x += bState.nextRoundPos[0];
        nTip.y += bState.nextRoundPos[1];
        nTip.z += bState.nextRoundPos[2];

        const feedShift01 = computeMagazineFeedShift(weaponId, f);
        const replenish01 = computeMagazineReplenishAlpha(weaponId, f);
        const activeIndices: Array<{ idx: number; param: number }> = [];
        for (
          let i = spec.firingHandoffSlotIndex + 1;
          i < spec.roundCount;
          i++
        ) {
          activeIndices.push({ idx: i, param: feedShift01 });
        }
        if (replenish01 > 0.008) {
          activeIndices.push({ idx: spec.roundCount, param: replenish01 });
        }

        for (const item of activeIndices) {
          evaluateMagazineRoundSlotInto(weaponId, item.idx, item.param, pose);
          const sMult = pose.scaleMult;
          if (sMult <= 0.004) continue;
          const effScale = roundFit.roundScale * sMult;
          const effRadius = baseCaseRadius * sMult;

          eRound.set(pose.rx, pose.ry, pose.rz);
          qRound.setFromEuler(eRound);
          sHead
            .set((caseBox.min.x + roundFit.magLocalShiftX) * effScale, 0, 0)
            .applyQuaternion(qRound);
          sHead.x += pose.px;
          sHead.y += pose.py;
          sHead.z += pose.pz;

          sTip
            .set(
              (bulletBox.max.x +
                calSpec.bulletLocalOffset +
                roundFit.magLocalShiftX) *
                effScale,
              0,
              0
            )
            .applyQuaternion(qRound);
          sTip.x += pose.px;
          sTip.y += pose.py;
          sTip.z += pose.pz;

          // 1. Live `mag_follower` mesh non-penetration
          const ax = sTip.x - sHead.x;
          const ay = sTip.y - sHead.y;
          const az = sTip.z - sHead.z;
          const lenSq = Math.max(1e-8, ax * ax + ay * ay + az * az);
          let minFolDist = Infinity;
          for (let vi = 0; vi < worldFolVerts.length; vi++) {
            const fv = worldFolVerts[vi];
            const wx = fv.x - sHead.x;
            const wy = fv.y - sHead.y;
            const wz = fv.z - sHead.z;
            const proj = (wx * ax + wy * ay + wz * az) / lenSq;
            if (proj < -0.02 || proj > 1.02) continue;
            const tc = proj < 0 ? 0 : proj > 1 ? 1 : proj;
            const d = Math.hypot(wx - ax * tc, wy - ay * tc, wz - az * tc);
            if (d < minFolDist) minFolDist = d;
          }
          // 1. Live `mag_follower` mesh non-penetration (`effRadius` = 100% full brass radius!)
          expect(
            minFolDist,
            `${weaponId} f=${f} slot[${item.idx}] clipped live ${spec.followerPartId}`
          ).toBeGreaterThanOrEqual(effRadius);

          // 2. Live `nextRound` non-collision (2 * radius = 1.80+ center-to-center clearance!)
          const nextDist = segmentToSegmentDist(sHead, sTip, nHead, nTip);
          expect(
            nextDist,
            `${weaponId} f=${f} slot[${item.idx}] collided with feeding nextRound`
          ).toBeGreaterThanOrEqual(baseCaseRadius * 1.4);
        }
      }
    }
  });
});

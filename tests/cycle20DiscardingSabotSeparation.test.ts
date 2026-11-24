import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  SABOT_DISCARD_FADE_START_CM,
  SABOT_DISCARD_MAX_DIST_CM,
  SABOT_PETAL_ARC_DEG,
  buildApfsdsSabotPetalGeometry,
  computeDiscardingSabotKinematics,
  createMutableDiscardingSabotKinematicsSample,
  getCaliberGeometries,
  writeDiscardingSabotKinematicsInto,
  type ApfsdsCaliberProfile,
  type SabotPetalIndex,
} from '../src/engine/actors/BallisticsSystem';

const ROOT = path.resolve(__dirname, '..');

function extractAllUseFrameBodies(source: string): string {
  const bodies: string[] = [];
  let idx = 0;
  while (idx < source.length) {
    const start = source.indexOf('useFrame(', idx);
    if (start === -1) break;
    const arrow = source.indexOf('=>', start);
    if (arrow === -1) break;
    const open = source.indexOf('{', arrow);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    bodies.push(source.slice(open, end));
    idx = end;
  }
  return bodies.join('\n');
}

function computeSignedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const idx = geo.index;
  const v0 = new THREE.Vector3();
  const v1 = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const cross = new THREE.Vector3();
  let vol6 = 0;

  if (idx) {
    for (let i = 0; i < idx.count; i += 3) {
      v0.fromBufferAttribute(pos, idx.getX(i));
      v1.fromBufferAttribute(pos, idx.getX(i + 1));
      v2.fromBufferAttribute(pos, idx.getX(i + 2));
      cross.crossVectors(v1, v2);
      vol6 += v0.dot(cross);
    }
  } else {
    for (let i = 0; i < pos.count; i += 3) {
      v0.fromBufferAttribute(pos, i);
      v1.fromBufferAttribute(pos, i + 1);
      v2.fromBufferAttribute(pos, i + 2);
      cross.crossVectors(v1, v2);
      vol6 += v0.dot(cross);
    }
  }
  return vol6 / 6;
}

describe('Cycle 20C — 1:1 MBT 3-Petal Machined-Aluminum Discarding Sabot Geometry', () => {
  const calibers: readonly {
    caliber: ApfsdsCaliberProfile;
    boreRadiusCm: number;
    expectedOuterR: number;
  }[] = [
    { caliber: '120mm_apfsds', boreRadiusCm: 6.0, expectedOuterR: 5.46 },
    { caliber: '125mm_apfsds', boreRadiusCm: 6.25, expectedOuterR: 5.66 },
  ];

  it('builds watertight, finite, multi-tone 114° sabot petal solids clearing both penetrator rod and smoothbore wall for 120mm & 125mm APFSDS', () => {
    expect(SABOT_PETAL_ARC_DEG).toBe(114);
    const halfArcRad = ((SABOT_PETAL_ARC_DEG * Math.PI) / 180) * 0.5;

    for (const { caliber, boreRadiusCm, expectedOuterR } of calibers) {
      const geo = buildApfsdsSabotPetalGeometry(caliber);
      try {
        const pos = geo.getAttribute('position');
        const norm = geo.getAttribute('normal');
        const col = geo.getAttribute('color');
        const uv = geo.getAttribute('uv');

        expect(pos, `${caliber} position`).toBeDefined();
        expect(norm, `${caliber} normal`).toBeDefined();
        expect(col, `${caliber} vertex color`).toBeDefined();
        expect(uv, `${caliber} uv`).toBeDefined();
        expect(pos.count).toBeGreaterThan(600);
        expect(norm.count).toBe(pos.count);
        expect(col.count).toBe(pos.count);

        let minX = Infinity;
        let maxX = -Infinity;
        let minR = Infinity;
        let maxR = -Infinity;
        let maxAbsAz = 0;
        const distinctColorKeys = new Set<string>();

        for (let i = 0; i < pos.count; i++) {
          const x = pos.getX(i);
          const y = pos.getY(i);
          const z = pos.getZ(i);
          expect(Number.isFinite(x)).toBe(true);
          expect(Number.isFinite(y)).toBe(true);
          expect(Number.isFinite(z)).toBe(true);

          const nx = norm.getX(i);
          const ny = norm.getY(i);
          const nz = norm.getZ(i);
          const nLen = Math.hypot(nx, ny, nz);
          expect(nLen, `${caliber} unit normal #${i}`).toBeCloseTo(1.0, 3);

          const r = Math.hypot(y, z);
          const az = Math.atan2(z, y);
          if (x < minX) minX = x;
          if (x > maxX) maxX = x;
          if (r < minR) minR = r;
          if (r > maxR) maxR = r;
          if (Math.abs(az) > maxAbsAz) maxAbsAz = Math.abs(az);

          distinctColorKeys.add(
            `${col.getX(i).toFixed(2)},${col.getY(i).toFixed(2)},${col.getZ(i).toFixed(2)}`
          );
        }

        // Axial bounds sit cleanly over penetrator mid-body (clear of aft fins & front tip)
        expect(minX).toBeGreaterThanOrEqual(-9.6);
        expect(minX).toBeLessThanOrEqual(-9.2);
        expect(maxX).toBeGreaterThanOrEqual(10.0);
        expect(maxX).toBeLessThanOrEqual(10.5);

        // Radial bounds hug 1.22 cm penetrator rod without Z-fighting and clear smoothbore wall
        expect(minR).toBeGreaterThanOrEqual(1.23);
        expect(minR).toBeLessThan(1.35);
        expect(maxR).toBeCloseTo(expectedOuterR, 2);
        expect(maxR).toBeLessThan(boreRadiusCm - 0.3);

        // Azimuthal span matches 114° (leaving crisp 6° separation kerfs between 3 petals at 120°)
        expect(maxAbsAz).toBeCloseTo(halfArcRad, 3);
        expect(maxAbsAz).toBeLessThan((Math.PI * 2) / 6); // strictly < 60° half-angle -> zero overlap!

        // Distinct vertex-color bands (aluminum body, dark saddle grooves, bourrelet ribs, amber obturator)
        expect(distinctColorKeys.size).toBeGreaterThanOrEqual(4);

        // Strictly positive 3D signed volume confirms outward winding on walls & split-kerf end caps
        expect(computeSignedVolume(geo)).toBeGreaterThan(100);
      } finally {
        geo.dispose();
      }
    }
  });

  it('removes the fused sabot collar from APFSDS bulletGeo so the bare penetrator dart flies clean post-discard', () => {
    for (const { caliber } of calibers) {
      const { bulletGeo } = getCaliberGeometries(caliber);
      const pos = bulletGeo.getAttribute('position');
      expect(pos.count).toBeGreaterThan(100);

      // Ahead of the aft stabilizer fins (x > -15), only the slender 1.22 cm tungsten/DU rod remains
      // (no 5.4–5.6 cm fused sabot collar vertices anywhere on the penetrator body!)
      let maxForwardOfFinsR = 0;
      let maxFinZoneR = 0;
      let maxX = -Infinity;
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i);
        const r = Math.hypot(pos.getY(i), pos.getZ(i));
        if (x > maxX) maxX = x;
        if (x > -15 && r > maxForwardOfFinsR) {
          maxForwardOfFinsR = r;
        }
        if (x <= -15 && r > maxFinZoneR) {
          maxFinZoneR = r;
        }
      }

      expect(maxX, `${caliber} penetrator nose tip`).toBeGreaterThan(30);
      expect(
        maxForwardOfFinsR,
        `${caliber} bare penetrator rod radius ahead of fins`
      ).toBeCloseTo(1.22, 2);
      expect(
        maxForwardOfFinsR,
        `${caliber} fused sabot collar must be removed`
      ).toBeLessThan(1.5);
      // 6 tail stabilizer fins remain intact at aft tail
      expect(maxFinZoneR, `${caliber} tail fins intact`).toBeGreaterThan(4.5);
    }
  });
});

describe('Cycle 20C — Pure Aerodynamic Discarding Sabot Kinematics & 3D Orientation', () => {
  const petals: readonly SabotPetalIndex[] = [0, 1, 2];

  it('keeps petals tightly clamped with zero offset/lag/pitch/roll inside the smoothbore tube (distancePastMuzzleCm <= 0)', () => {
    for (const cal of ['120mm_apfsds', '125mm_apfsds'] as const) {
      for (const dist of [-520, -180, -12, -0.001, 0]) {
        for (const p of petals) {
          const k = computeDiscardingSabotKinematics(dist, p, cal);
          expect(k.visible).toBe(true);
          expect(k.radialOffsetCm).toBe(0);
          expect(k.axialLagCm).toBe(0);
          expect(k.pitchOutRad).toBe(0);
          expect(k.rollSpinRad).toBe(0);
          expect(k.opacity).toBe(1);
          expect(k.azimuthRad).toBeCloseTo(p * ((Math.PI * 2) / 3) + Math.PI / 6, 6);
        }
      }
    }
  });

  it('drives monotonic outward radial separation, negative axial lag, nose-up outward pitch, exact 120° azimuths & smooth far-field fade', () => {
    const probes = [10, 45, 110, 220, 340, 460, 560];

    for (const cal of ['120mm_apfsds', '125mm_apfsds'] as const) {
      for (const p of petals) {
        let prevRadial = 0;
        let prevLag = 0;
        let prevPitch = 0;
        let prevRoll = 0;

        for (const d of probes) {
          const k = computeDiscardingSabotKinematics(d, p, cal);
          expect(k.visible, `${cal} p=${p} d=${d}`).toBe(true);
          expect(Number.isFinite(k.radialOffsetCm)).toBe(true);
          expect(Number.isFinite(k.axialLagCm)).toBe(true);
          expect(Number.isFinite(k.pitchOutRad)).toBe(true);
          expect(Number.isFinite(k.rollSpinRad)).toBe(true);

          expect(k.radialOffsetCm).toBeGreaterThan(prevRadial);
          expect(k.axialLagCm).toBeLessThan(prevLag);
          expect(k.pitchOutRad).toBeGreaterThan(prevPitch);
          expect(k.rollSpinRad).toBeGreaterThan(prevRoll);

          if (d <= SABOT_DISCARD_FADE_START_CM) {
            expect(k.opacity).toBe(1);
          } else {
            expect(k.opacity).toBeGreaterThan(0);
            expect(k.opacity).toBeLessThan(1);
          }

          prevRadial = k.radialOffsetCm;
          prevLag = k.axialLagCm;
          prevPitch = k.pitchOutRad;
          prevRoll = k.rollSpinRad;
        }

        // Nose-up outward aerodynamic pitch settles cleanly in 0.48..0.78 rad band
        const midFlight = computeDiscardingSabotKinematics(340, p, cal);
        expect(midFlight.pitchOutRad).toBeGreaterThanOrEqual(0.48);
        expect(midFlight.pitchOutRad).toBeLessThanOrEqual(0.78);

        // Far-field fade hides cleanly at & beyond SABOT_DISCARD_MAX_DIST_CM (well before cycle wrap)
        const fadeMid = computeDiscardingSabotKinematics(520, p, cal);
        const fadeLate = computeDiscardingSabotKinematics(590, p, cal);
        const gone = computeDiscardingSabotKinematics(SABOT_DISCARD_MAX_DIST_CM, p, cal);
        const wayPast = computeDiscardingSabotKinematics(820, p, cal);
        expect(fadeLate.opacity).toBeLessThan(fadeMid.opacity);
        expect(gone.visible).toBe(false);
        expect(gone.opacity).toBe(0);
        expect(wayPast.visible).toBe(false);
        expect(wayPast.opacity).toBe(0);
      }

      // Exact 3-fold 120° azimuthal spacing across petals 0, 1, 2
      const k0 = computeDiscardingSabotKinematics(180, 0, cal);
      const k1 = computeDiscardingSabotKinematics(180, 1, cal);
      const k2 = computeDiscardingSabotKinematics(180, 2, cal);
      expect(k1.azimuthRad - k0.azimuthRad).toBeCloseTo((Math.PI * 2) / 3, 6);
      expect(k2.azimuthRad - k1.azimuthRad).toBeCloseTo((Math.PI * 2) / 3, 6);
    }

    // Non-finite input produces safe hidden sample with zero NaN
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      const k = computeDiscardingSabotKinematics(bad, 0, '120mm_apfsds');
      expect(k.visible).toBe(false);
      expect(k.opacity).toBe(0);
      expect(Number.isFinite(k.radialOffsetCm)).toBe(true);
      expect(Number.isFinite(k.axialLagCm)).toBe(true);
      expect(Number.isFinite(k.pitchOutRad)).toBe(true);
    }

    // Zero-GC scratch reuse
    const scratch = createMutableDiscardingSabotKinematicsSample();
    const sameRef = writeDiscardingSabotKinematicsInto(200, 1, '125mm_apfsds', scratch);
    expect(sameRef).toBe(scratch);
    expect(scratch.visible).toBe(true);
    expect(scratch.radialOffsetCm).toBeGreaterThan(15);
    expect(scratch.axialLagCm).toBeLessThan(-25);
  });

  it('pitches the front air-scoop nose strictly outward along each petal radial separation vector in 3D', () => {
    const axisX = new THREE.Vector3(1, 0, 0);
    const axisZ = new THREE.Vector3(0, 0, 1);
    const qAz = new THREE.Quaternion();
    const qPitch = new THREE.Quaternion();
    const qFinal = new THREE.Quaternion();

    for (const p of petals) {
      const k = computeDiscardingSabotKinematics(180, p, '120mm_apfsds');
      const outwardRadial = new THREE.Vector3(
        0,
        Math.cos(k.azimuthRad),
        Math.sin(k.azimuthRad)
      );

      qAz.setFromAxisAngle(axisX, k.azimuthRad);
      qPitch.setFromAxisAngle(axisZ, k.pitchOutRad);
      qFinal.copy(qAz).multiply(qPitch);

      const noseTip = new THREE.Vector3(10.0, 0, 0).applyQuaternion(qFinal);
      const tailBase = new THREE.Vector3(-9.4, 0, 0).applyQuaternion(qFinal);

      // Nose flares sharply outward (positive projection onto radial vector) while tail stays inward of nose
      expect(noseTip.dot(outwardRadial)).toBeGreaterThan(4.0);
      expect(noseTip.dot(outwardRadial)).toBeGreaterThan(tailBase.dot(outwardRadial));
    }
  });
});

describe('Cycle 20C — Zero-GC useFrame, GPU Disposal & Strict APFSDS Isolation Hygiene', () => {
  const ballisticsSrc = fs.readFileSync(
    path.join(ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
    'utf8'
  );

  it('guarantees zero `new THREE.` allocations inside useFrame and disposes petal geometry & material on switch/unmount', () => {
    const useFrameBody = extractAllUseFrameBodies(ballisticsSrc);
    expect(useFrameBody.length).toBeGreaterThan(1000);
    expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);

    expect(ballisticsSrc).toContain('sabotPetalGeo?.dispose()');
    expect(ballisticsSrc).toContain('sabotPetalMat.dispose()');
    expect(ballisticsSrc).toContain('name="ApfsdsDiscardingSabotPetals"');
    expect(ballisticsSrc).toContain('writeDiscardingSabotKinematicsInto');
  });
});

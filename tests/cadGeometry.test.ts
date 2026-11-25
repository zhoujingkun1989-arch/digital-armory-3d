import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  beginPartSpringCapture,
  createBeveledCylinder,
  createChamferedBox,
  createHelicalSpring,
  createMilStdPicatinnyRail,
  createRectangularMagSpring,
  createRifledBarrelBoreCutter,
  csgSubtract,
  csgUnion,
  finalizeGeometry,
  finishPartSpringCapture,
  mergeParts,
  paintGeometry,
  SPRING_AXIS_MODE_FLEX,
  SPRING_AXIS_MODE_X,
  SPRING_AXIS_MODE_Y,
} from '../src/engine/geometry/csgBuilder';
import {
  computeVertexCurvatureAttribute,
  dihedralAngleToCurvatureMagnitude,
} from '../src/engine/geometry/curvatureBuilder';
import { serializeGeometry } from '../src/engine/geometry/geometry.worker';
import {
  ensureWeaponGeometries,
  getCachedPartGeometry,
  reconstructBufferGeometry,
} from '../src/engine/geometry/geometryService';
import { loadWeaponGeometryBuilders } from '../src/weapons/geometryLoaders';
import { getWeaponManifest } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

const DEG = Math.PI / 180;

function expectFiniteArray(arr: ArrayLike<number>, label: string): void {
  for (let i = 0; i < arr.length; i++) {
    if (!Number.isFinite(arr[i])) {
      throw new Error(`${label}: non-finite value at ${i}`);
    }
  }
}

function expectUnitNormals(geo: THREE.BufferGeometry, label: string): void {
  const n = geo.getAttribute('normal');
  for (let i = 0; i < n.count; i++) {
    const len = Math.hypot(n.getX(i), n.getY(i), n.getZ(i));
    expect(
      Math.abs(len - 1),
      `${label}: normal ${i} length ${len}`
    ).toBeLessThan(1e-3);
  }
}

function signedVolume(geo: THREE.BufferGeometry): number {
  const p = geo.getAttribute('position');
  let vol = 0;
  for (let i = 0; i + 2 < p.count; i += 3) {
    const ax = p.getX(i);
    const ay = p.getY(i);
    const az = p.getZ(i);
    const bx = p.getX(i + 1);
    const by = p.getY(i + 1);
    const bz = p.getZ(i + 1);
    const cx = p.getX(i + 2);
    const cy = p.getY(i + 2);
    const cz = p.getZ(i + 2);
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return vol;
}

/** Every welded undirected edge must be shared by exactly two triangles with opposite orientation. */
function expectWatertight(geo: THREE.BufferGeometry, label: string): void {
  const p = geo.getAttribute('position');
  const key = (i: number) =>
    `${Math.round(p.getX(i) * 1e4)},${Math.round(p.getY(i) * 1e4)},${Math.round(
      p.getZ(i) * 1e4
    )}`;
  const directed = new Map<string, number>();
  for (let t = 0; t + 2 < p.count; t += 3) {
    for (let e = 0; e < 3; e++) {
      const a = key(t + e);
      const b = key(t + ((e + 1) % 3));
      const k = `${a}|${b}`;
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
  }
  let open = 0;
  directed.forEach((count, k) => {
    const [a, b] = k.split('|');
    if (count !== 1 || directed.get(`${b}|${a}`) !== 1) open++;
  });
  expect(open, `${label}: open / non-manifold directed edges`).toBe(0);
}

function curvatureOf(geo: THREE.BufferGeometry): THREE.BufferAttribute {
  const attr = geo.getAttribute('aCurvature') as THREE.BufferAttribute;
  expect(attr, 'aCurvature attribute missing').toBeDefined();
  expect(attr.itemSize).toBe(1);
  expect(attr.count).toBe(geo.getAttribute('position').count);
  expect(attr.array).toBeInstanceOf(Float32Array);
  for (let i = 0; i < attr.count; i++) {
    const v = attr.getX(i);
    expect(Number.isFinite(v)).toBe(true);
    expect(v).toBeGreaterThanOrEqual(-1);
    expect(v).toBeLessThanOrEqual(1);
  }
  return attr;
}

describe('CNC curvature attribute (aCurvature)', () => {
  it('maps dihedral angles into the smooth / sharp bands', () => {
    expect(dihedralAngleToCurvatureMagnitude(0)).toBe(0);
    expect(dihedralAngleToCurvatureMagnitude(5 * DEG)).toBe(0);
    expect(dihedralAngleToCurvatureMagnitude(14 * DEG)).toBeLessThan(0.35);
    expect(dihedralAngleToCurvatureMagnitude(20 * DEG)).toBeCloseTo(0.35, 5);
    expect(dihedralAngleToCurvatureMagnitude(45 * DEG)).toBeGreaterThan(0.35);
    expect(dihedralAngleToCurvatureMagnitude(90 * DEG)).toBeCloseTo(1, 5);
    expect(dihedralAngleToCurvatureMagnitude(170 * DEG)).toBeCloseTo(1, 5);
  });

  it('marks every corner of a sharp billet box as strongly convex (+1)', () => {
    const box = finalizeGeometry(
      paintGeometry(new THREE.BoxGeometry(2, 1, 1).toNonIndexed(), '#445566')
    );
    const curv = curvatureOf(box);
    for (let i = 0; i < curv.count; i++) {
      expect(curv.getX(i)).toBeGreaterThan(0.95);
    }
    // Same result on an indexed input
    const indexed = computeVertexCurvatureAttribute(
      new THREE.BoxGeometry(1, 1, 1)
    );
    for (const v of indexed) expect(v).toBeGreaterThan(0.95);
  });

  it('marks a CSG-milled pocket floor as concave and the pocket rim as convex', () => {
    const block = paintGeometry(new THREE.BoxGeometry(4, 2, 4), '#3a4250');
    const pocketCutter = new THREE.BoxGeometry(1.2, 1.2, 1.2).translate(
      0,
      0.9,
      0
    );
    const milled = csgSubtract(block, [pocketCutter]);
    const curv = curvatureOf(milled);
    const pos = milled.getAttribute('position');
    let floorCount = 0;
    let rimCount = 0;
    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const y = pos.getY(i);
      const z = pos.getZ(i);
      const atPocketCorner =
        Math.abs(Math.abs(x) - 0.6) < 1e-3 &&
        Math.abs(Math.abs(z) - 0.6) < 1e-3;
      if (!atPocketCorner) continue;
      if (Math.abs(y - 0.3) < 1e-3) {
        // Pocket floor corners (floor meets two walls) → concave cavity
        expect(curv.getX(i)).toBeLessThan(-0.35);
        floorCount++;
      } else if (Math.abs(y - 1.0) < 1e-3) {
        // Pocket rim corners on the top face → convex machined edge
        expect(curv.getX(i)).toBeGreaterThan(0.35);
        rimCount++;
      }
    }
    expect(floorCount).toBeGreaterThan(0);
    expect(rimCount).toBeGreaterThan(0);
  });

  it('keeps smooth cylinder walls & coplanar faces near 0', () => {
    const cyl = finalizeGeometry(
      paintGeometry(new THREE.CylinderGeometry(1, 1, 4, 64, 4), '#556677')
    );
    const curv = curvatureOf(cyl);
    const pos = cyl.getAttribute('position');
    let midCount = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i)) < 1.5) {
        expect(Math.abs(curv.getX(i))).toBeLessThan(0.05);
        midCount++;
      }
    }
    expect(midCount).toBeGreaterThan(0);

    const plane = new THREE.PlaneGeometry(4, 4, 8, 8);
    const planeCurv = computeVertexCurvatureAttribute(plane);
    for (const v of planeCurv) expect(v).toBe(0);
  });
});

describe('constant-wire-diameter GPU spring attribute (aSpringParam)', () => {
  const SCALE = 0.4;

  function expectWireRadiusInvariant(
    geo: THREE.BufferGeometry,
    axis: 0 | 1,
    wireRadius: number,
    expectedAnchor: number,
    expectedMode: number
  ): void {
    const pos = geo.getAttribute('position');
    const sp = geo.getAttribute('aSpringParam');
    expect(sp).toBeDefined();
    expect(sp.itemSize).toBe(4);
    expect(sp.count).toBe(pos.count);
    expect(sp.array).toBeInstanceOf(Float32Array);
    const v = new THREE.Vector3();
    let maxErrOriginal = 0;
    let maxErrCompressed = 0;
    for (let i = 0; i < pos.count; i++) {
      const u = sp.getX(i);
      const center = sp.getY(i);
      const anchor = sp.getZ(i);
      expect(u).toBeGreaterThanOrEqual(0);
      expect(u).toBeLessThanOrEqual(1);
      expect(anchor).toBeCloseTo(expectedAnchor, 6);
      expect(sp.getW(i)).toBe(expectedMode);

      v.fromBufferAttribute(pos, i);
      const axial = axis === 0 ? v.x : v.y;
      const wireOffset = axial - center;
      // Wire offset along the axis never exceeds the wire radius
      maxErrOriginal = Math.max(
        maxErrOriginal,
        Math.abs(wireOffset) - wireRadius
      );

      // Simulated shader compression: newX = anchor + (center - anchor) * s + (pos.x - center)
      const newAxial = anchor + (center - anchor) * SCALE + wireOffset;
      const newCenter = anchor + (center - anchor) * SCALE;
      maxErrCompressed = Math.max(
        maxErrCompressed,
        Math.abs(Math.abs(newAxial - newCenter) - Math.abs(wireOffset))
      );
    }
    expect(maxErrOriginal).toBeLessThan(1e-5);
    expect(maxErrCompressed).toBeLessThan(1e-5);
  }

  /** Full 3D check: every vertex stays exactly `wireRadius` from its compressed ring centre. */
  function expectRingDistancePreserved(
    geo: THREE.BufferGeometry,
    axis: 0 | 1,
    wireRadius: number,
    ringCenters: (vertex: number) => THREE.Vector3
  ): void {
    const pos = geo.getAttribute('position');
    const sp = geo.getAttribute('aSpringParam');
    const p = new THREE.Vector3();
    for (let i = 0; i < pos.count; i += 7) {
      p.fromBufferAttribute(pos, i);
      const c = ringCenters(i);
      const anchor = sp.getZ(i);
      const center = sp.getY(i);
      const comp = p.clone();
      const cc = c.clone();
      if (axis === 0) {
        comp.x = anchor + (center - anchor) * SCALE + (p.x - center);
        cc.x = anchor + (center - anchor) * SCALE;
      } else {
        comp.y = anchor + (center - anchor) * SCALE + (p.y - center);
        cc.y = anchor + (center - anchor) * SCALE;
      }
      expect(Math.abs(comp.distanceTo(cc) - wireRadius)).toBeLessThan(1e-4);
    }
  }

  it('createHelicalSpring (X axis) carries exact per-ring centreline & anchor', () => {
    const wire = 0.046;
    const spring = createHelicalSpring({
      axis: 'x',
      start: -2.15,
      end: 2.15,
      centerY: 0.3,
      centerZ: -0.2,
      coilRadius: 0.235,
      wireRadius: wire,
      coils: 18,
    });
    expectWireRadiusInvariant(spring, 0, wire, -2.15, SPRING_AXIS_MODE_X);
    const curv = curvatureOf(spring);
    for (let i = 0; i < curv.count; i++) expect(curv.getX(i)).toBe(0);

    // Radial distance from the coil axis in the YZ plane stays within coilRadius ± wire
    // (+ small CatmullRom chord sag between the 20 samples per coil).
    const pos = spring.getAttribute('position');
    for (let i = 0; i < pos.count; i += 11) {
      const ry = pos.getY(i) - 0.3;
      const rz = pos.getZ(i) + 0.2;
      const rr = Math.hypot(ry, rz);
      expect(rr).toBeGreaterThan(0.235 - wire - 5e-3);
      expect(rr).toBeLessThan(0.235 + wire + 5e-3);
    }
  });

  it('createHelicalSpring (Y axis) & createRectangularMagSpring use axis mode 2', () => {
    const wire = 0.03;
    const ySpring = createHelicalSpring({
      axis: 'y',
      start: -1,
      end: 1.5,
      centerX: 0.2,
      coilRadius: 0.2,
      wireRadius: wire,
      coils: 9,
    });
    expectWireRadiusInvariant(ySpring, 1, wire, -1, SPRING_AXIS_MODE_Y);

    const magWire = 0.064;
    const mag = createRectangularMagSpring({
      height: 6.2,
      widthX: 3.35,
      depthZ: 1.12,
      wireRadius: magWire,
      coils: 8,
    });
    expectWireRadiusInvariant(mag, 1, magWire, -3.1, SPRING_AXIS_MODE_Y);
  });

  it('preserves 3D wire radius exactly under compression (TubeGeometry ring mapping)', () => {
    const wire = 0.05;
    const points: THREE.Vector3[] = [];
    // Rebuild the identical curve used by the builder to recover each ring centre
    const opts = {
      axis: 'x' as const,
      start: 0,
      end: 5,
      coilRadius: 0.3,
      wireRadius: wire,
      coils: 6,
      radialSegments: 10,
      tubularSegmentsPerCoil: 20,
    };
    const totalSteps = Math.max(
      28,
      Math.round(opts.coils * opts.tubularSegmentsPerCoil)
    );
    for (let i = 0; i <= totalSteps; i++) {
      const u = i / totalSteps;
      const angle = u * opts.coils * Math.PI * 2;
      let uMapped: number;
      if (u < 0.04) uMapped = u * 0.35;
      else if (u > 0.96) uMapped = 1 - (1 - u) * 0.35;
      else uMapped = 0.014 + ((u - 0.04) / 0.92) * 0.972;
      points.push(
        new THREE.Vector3(
          opts.start + (opts.end - opts.start) * uMapped,
          Math.cos(angle) * opts.coilRadius,
          Math.sin(angle) * opts.coilRadius
        )
      );
    }
    const curve = new THREE.CatmullRomCurve3(points);
    const spring = createHelicalSpring(opts);
    const sp = spring.getAttribute('aSpringParam');
    expectRingDistancePreserved(spring, 0, wire, (i) =>
      curve.getPointAt(sp.getX(i))
    );
  });

  it('mergeParts / csgUnion / csgSubtract preserve aSpringParam (zero-padding non-spring parts)', () => {
    const spring = createHelicalSpring({
      axis: 'x',
      start: -2,
      end: 2,
      coilRadius: 0.25,
      wireRadius: 0.04,
      coils: 10,
    });
    const endTurn = new THREE.TorusGeometry(0.25, 0.04, 8, 16)
      .rotateY(Math.PI / 2)
      .translate(-2, 0, 0);
    const springCount = spring.getAttribute('position').count;
    const merged = mergeParts([spring, endTurn]);
    const sp = merged.getAttribute('aSpringParam');
    expect(sp).toBeDefined();
    expect(sp.count).toBe(merged.getAttribute('position').count);
    let springVerts = 0;
    let zeroVerts = 0;
    for (let i = 0; i < sp.count; i++) {
      if (sp.getW(i) === SPRING_AXIS_MODE_X) springVerts++;
      else if (
        sp.getX(i) === 0 &&
        sp.getY(i) === 0 &&
        sp.getZ(i) === 0 &&
        sp.getW(i) === 0
      )
        zeroVerts++;
    }
    expect(springVerts).toBe(springCount);
    expect(springVerts + zeroVerts).toBe(sp.count);
    // Spring coil vertices keep 0 curvature after the merge/finalize pass
    const curv = curvatureOf(merged);
    for (let i = 0; i < sp.count; i++) {
      if (sp.getW(i) > 0.5) expect(curv.getX(i)).toBe(0);
    }

    const plainMerge = mergeParts([
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.BoxGeometry(1, 1, 1).translate(2, 0, 0),
    ]);
    expect(plainMerge.getAttribute('aSpringParam')).toBeUndefined();
    curvatureOf(plainMerge);

    const united = csgUnion([
      createHelicalSpring({
        axis: 'y',
        start: 0,
        end: 2,
        coilRadius: 0.3,
        wireRadius: 0.05,
        coils: 4,
      }),
      new THREE.BoxGeometry(1, 0.2, 1).translate(0, -0.05, 0),
    ]);
    const usp = united.getAttribute('aSpringParam');
    expect(usp).toBeDefined();
    expect(usp.count).toBe(united.getAttribute('position').count);
    let anySpring = false;
    for (let i = 0; i < usp.count; i++) if (usp.getW(i) > 1.5) anySpring = true;
    expect(anySpring).toBe(true);
    curvatureOf(united);

    const cut = csgSubtract(
      createHelicalSpring({
        axis: 'x',
        start: 0,
        end: 3,
        coilRadius: 0.3,
        wireRadius: 0.05,
        coils: 5,
      }),
      [new THREE.BoxGeometry(0.4, 2, 2).translate(3, 0, 0)]
    );
    const csp = cut.getAttribute('aSpringParam');
    expect(csp).toBeDefined();
    expect(csp.count).toBe(cut.getAttribute('position').count);
  });
});

describe('precision CNC CAD primitives', () => {
  it('createChamferedBox builds a watertight 26-face billet with 45° chamfers', () => {
    const w = 3;
    const h = 1.2;
    const d = 0.8;
    const c = 0.08;
    const box = createChamferedBox(w, h, d, c, '#3b4452');
    expectWatertight(box, 'chamferedBox');
    expectUnitNormals(box, 'chamferedBox');
    expectFiniteArray(box.getAttribute('uv').array, 'chamferedBox uv');
    const bb = box.boundingBox!;
    expect(bb.max.x - bb.min.x).toBeCloseTo(w, 5);
    expect(bb.max.y - bb.min.y).toBeCloseTo(h, 5);
    expect(bb.max.z - bb.min.z).toBeCloseTo(d, 5);
    // Exact polyhedron volume: box − 12 edge prisms + corner overlap (6c³) − 8 corner tetrahedra (c³/12)
    const expected = w * h * d - 2 * c * c * (w + h + d) + (16 / 3) * c * c * c;
    expect(signedVolume(box)).toBeCloseTo(expected, 4);
    // No razor-sharp corner: the actual box corner point is not a vertex
    const pos = box.getAttribute('position');
    for (let i = 0; i < pos.count; i++) {
      const isRawCorner =
        Math.abs(Math.abs(pos.getX(i)) - w / 2) < 1e-6 &&
        Math.abs(Math.abs(pos.getY(i)) - h / 2) < 1e-6 &&
        Math.abs(Math.abs(pos.getZ(i)) - d / 2) < 1e-6;
      expect(isRawCorner).toBe(false);
    }
    // 45° chamfer facets exist: normals with two equal ±0.707 components
    const n = box.getAttribute('normal');
    let chamferNormals = 0;
    for (let i = 0; i < n.count; i++) {
      const ax = Math.abs(n.getX(i));
      const ay = Math.abs(n.getY(i));
      const az = Math.abs(n.getZ(i));
      const comps = [ax, ay, az].filter(
        (v) => Math.abs(v - Math.SQRT1_2) < 1e-3
      );
      if (comps.length === 2) chamferNormals++;
    }
    expect(chamferNormals).toBeGreaterThan(0);
    const curv = curvatureOf(box);
    let convex = 0;
    for (let i = 0; i < curv.count; i++) if (curv.getX(i) > 0.35) convex++;
    expect(convex).toBe(curv.count);
  });

  it('createBeveledCylinder builds a watertight lathe profile with 45° end chamfers', () => {
    const cyl = createBeveledCylinder(0.5, 0.6, 3, 0.05, 32, '#64748b');
    expectWatertight(cyl, 'beveledCylinder');
    expectUnitNormals(cyl, 'beveledCylinder');
    expectFiniteArray(cyl.getAttribute('uv').array, 'beveledCylinder uv');
    expect(signedVolume(cyl)).toBeGreaterThan(0);
    const bb = cyl.boundingBox!;
    expect(bb.max.y - bb.min.y).toBeCloseTo(3, 5);
    expect(bb.max.x).toBeCloseTo(0.6, 2);
    // Chamfer normals: 45° between the radial direction and ±Y
    const n = cyl.getAttribute('normal');
    let chamfer = 0;
    for (let i = 0; i < n.count; i++) {
      if (Math.abs(Math.abs(n.getY(i)) - Math.SQRT1_2) < 0.02) chamfer++;
    }
    expect(chamfer).toBeGreaterThan(0);
    curvatureOf(cyl);
  });

  it('createRifledBarrelBoreCutter twists land-and-groove rifling along +X', () => {
    const L = 10;
    const bore = 0.28;
    const groove = 0.012;
    const lands = 6;
    const cutter = createRifledBarrelBoreCutter(L, bore, groove, lands, 1.2);
    expectWatertight(cutter, 'rifling');
    expectUnitNormals(cutter, 'rifling');
    expect(signedVolume(cutter)).toBeGreaterThan(0);
    const bb = cutter.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-L / 2, 5);
    expect(bb.max.x).toBeCloseTo(L / 2, 5);
    const pos = cutter.getAttribute('position');
    let maxR = 0;
    let minWallR = Infinity;
    for (let i = 0; i < pos.count; i++) {
      const r = Math.hypot(pos.getY(i), pos.getZ(i));
      maxR = Math.max(maxR, r);
      if (r > 1e-6) minWallR = Math.min(minWallR, r);
    }
    expect(maxR).toBeCloseTo(bore + groove, 5);
    expect(minWallR).toBeCloseTo(bore, 5);
    // Groove phase at the muzzle end is rotated by the twist (right-hand, 1.2 turns over L)
    const angular = lands * 8;
    const hasGrooveVertexAt = (xTarget: number, phi: number): boolean => {
      for (let i = 0; i < pos.count; i++) {
        if (Math.abs(pos.getX(i) - xTarget) > 1e-6) continue;
        const r = Math.hypot(pos.getY(i), pos.getZ(i));
        if (Math.abs(r - (bore + groove)) > 1e-5) continue;
        const ang = Math.atan2(pos.getZ(i), pos.getY(i));
        const diff = Math.atan2(Math.sin(ang - phi), Math.cos(ang - phi));
        if (Math.abs(diff) < 1e-4) return true;
      }
      return false;
    };
    const firstGroovePhi = (3 / angular) * Math.PI * 2;
    expect(hasGrooveVertexAt(-L / 2, firstGroovePhi)).toBe(true);
    expect(hasGrooveVertexAt(L / 2, firstGroovePhi + 1.2 * Math.PI * 2)).toBe(
      true
    );
    // ...and a mid-twist offset that is NOT a groove sample at the muzzle confirms rotation
    expect(
      hasGrooveVertexAt(L / 2, (1 / angular) * Math.PI * 2 + 1.2 * Math.PI * 2)
    ).toBe(false);

    // Rifling a barrel blank via CSG yields a finite, positive-volume, curvature-tagged barrel
    const blank = new THREE.CylinderGeometry(0.6, 0.6, 6, 32).rotateZ(
      Math.PI / 2
    );
    const rifled = csgSubtract(blank, [
      createRifledBarrelBoreCutter(6.4, 0.28, 0.03, 6, 0.5),
    ]);
    expectFiniteArray(rifled.getAttribute('position').array, 'rifled pos');
    expectFiniteArray(rifled.getAttribute('normal').array, 'rifled normal');
    expect(signedVolume(rifled)).toBeGreaterThan(0);
    expect(signedVolume(rifled)).toBeLessThan(Math.PI * 0.36 * 6);
    const rc = curvatureOf(rifled);
    let concave = 0;
    for (let i = 0; i < rc.count; i++) if (rc.getX(i) < -0.35) concave++;
    expect(concave).toBeGreaterThan(0);
  });

  it('createMilStdPicatinnyRail cuts 10 mm-pitch recoil slots through a 45° dovetail', () => {
    const rail = createMilStdPicatinnyRail(12, -6, 2, 2.12, '#2b313b');
    expectFiniteArray(rail.getAttribute('position').array, 'rail pos');
    expectFiniteArray(rail.getAttribute('normal').array, 'rail normal');
    expectFiniteArray(rail.getAttribute('uv').array, 'rail uv');
    expect(signedVolume(rail)).toBeGreaterThan(0);
    const bb = rail.boundingBox!;
    expect(bb.min.x).toBeCloseTo(-6, 4);
    expect(bb.max.x).toBeCloseTo(6, 4);
    expect(bb.max.y).toBeCloseTo(2, 4);
    expect(bb.max.z - bb.min.z).toBeCloseTo(2.12, 3);
    // Slot floors sit 3.0 mm below the crown
    const pos = rail.getAttribute('position');
    const n = rail.getAttribute('normal');
    const slotFloorXs = new Set<number>();
    let dovetailBevels = 0;
    for (let i = 0; i < pos.count; i++) {
      if (Math.abs(pos.getY(i) - (2 - 0.3)) < 1e-3 && n.getY(i) > 0.99) {
        slotFloorXs.add(Math.round(pos.getX(i) * 100));
      }
      if (
        Math.abs(Math.abs(n.getZ(i)) - Math.SQRT1_2) < 0.02 &&
        Math.abs(Math.abs(n.getY(i)) - Math.SQRT1_2) < 0.02
      ) {
        dovetailBevels++;
      }
    }
    expect(slotFloorXs.size).toBeGreaterThan(10);
    expect(dovetailBevels).toBeGreaterThan(0);
    const curv = curvatureOf(rail);
    let concave = 0;
    for (let i = 0; i < curv.count; i++) if (curv.getX(i) < -0.35) concave++;
    expect(concave).toBeGreaterThan(0);
  });
});

describe('worker zero-copy serialization of CAD attributes', () => {
  it('transfers aCurvature always and aSpringParam only for spring parts', () => {
    const transfers: Transferable[] = [];
    const springItem = serializeGeometry(
      'spring',
      createHelicalSpring({
        axis: 'x',
        start: 0,
        end: 3,
        coilRadius: 0.2,
        wireRadius: 0.03,
        coils: 8,
      }),
      transfers
    );
    expect(springItem.curvature).toBeInstanceOf(Float32Array);
    expect(springItem.curvature.length).toBe(springItem.position.length / 3);
    expect(springItem.springParam).toBeInstanceOf(Float32Array);
    expect(springItem.springParam!.length).toBe(
      (springItem.position.length / 3) * 4
    );
    expect(transfers).toContain(springItem.curvature.buffer);
    expect(transfers).toContain(springItem.springParam!.buffer);
    expect(new Set(transfers).size).toBe(transfers.length);

    const boxTransfers: Transferable[] = [];
    // Plain geometry without aCurvature (e.g. stripped by a weapon sanitizer) gets it computed
    const boxItem = serializeGeometry(
      'box',
      new THREE.BoxGeometry(1, 1, 1),
      boxTransfers
    );
    expect(boxItem.springParam).toBeNull();
    expect(boxItem.curvature.length).toBe(24);
    for (const v of boxItem.curvature) expect(v).toBeGreaterThan(0.95);
    expect(boxTransfers).toContain(boxItem.curvature.buffer);

    const geo = reconstructBufferGeometry(springItem);
    expect(geo.getAttribute('aCurvature').itemSize).toBe(1);
    expect(geo.getAttribute('aSpringParam').itemSize).toBe(4);
    expect(geo.getAttribute('aSpringParam').array).toBe(springItem.springParam);
    const boxGeo = reconstructBufferGeometry(boxItem);
    expect(boxGeo.getAttribute('aCurvature').count).toBe(24);
    expect(boxGeo.getAttribute('aSpringParam')).toBeUndefined();
  });

  it('preserves aSpringParam & aCurvature across all 40 helical weapon springs, w=3 V-mainspring & archery flex parts, and main-thread geometryService fallback', async () => {
    const dynamicSprings: Readonly<Partial<Record<WeaponId, readonly string[]>>> = {
      ak15: ['ak_recoil_spring'],
      m4a1: ['m4a1_buffer_spring'],
      mp5: ['mp5_recoil_spring'],
      g17: ['recoil_spring', 'striker_spring'],
      m82a1: ['m82a1_recoil_spring', 'm82a1_barrel_springs'],
      awm: ['awm_firing_pin_spring'],
      scar: ['scar_recoil_spring'],
      deagle: ['deagle_recoil_springs'],
      aug: ['aug_recoil_springs'],
      p320: ['p320_recoil_spring', 'p320_striker_spring'],
      p90: ['p90_recoil_springs'],
      lift33: [],
      r500: ['r500_trigger_spring'],
      python: [
        'python_extractor_spring',
        'python_detent_plunger',
        'python_firing_pin',
      ],
      benellim4: [
        'benellim4_recoil_spring',
        'benellim4_hammer_spring',
        'benellim4_mag_spring',
      ],
      garand: [
        'garand_op_rod_spring',
        'garand_hammer_spring',
        'garand_clip_latch',
      ],
      m249: ['m249_recoil_spring', 'm249_sear_spring'],
      p08: ['p08_striker_spring', 'p08_recoil_spring', 'p08_mag_spring'],
      vector: [
        'vector_recoil_spring',
        'vector_hammer_spring',
        'vector_mag_spring',
      ],
      g11: ['g11_recoil_spring', 'g11_mag_spring'],
      vss: ['vss_recoil_spring', 'vss_striker_spring'],
      m134: ['m134_clutch_spring', 'm134_feeder_spring'],
      an94: ['an94_recoil_spring', 'an94_receiver_buffer_spring'],
      ztz99a: ['ztz99a_recoil_springs', 'ztz99a_rammer_spring'],
      m1a2: ['m1a2_recoil_springs', 'm1a2_door_spring'],
      leopard2a7: ['leo_recoil_springs', 'leo_breech_spring'],
      tiger1: ['tiger_recoil_springs', 'tiger_breech_spring'],
      winchester1894: [
        'win94_mainspring',
        'win94_sear_spring',
        'win94_mag_spring',
      ],
      rem870: [
        'rem870_hammer_spring',
        'rem870_firing_pin_spring',
        'rem870_mag_spring',
      ],
      m1911: ['m1911_recoil_spring', 'm1911_mainspring', 'm1911_mag_spring'],
      mg42: ['mg42_recoil_spring', 'mg42_buffer_spring', 'mg42_sear_spring'],
      k98k: ['k98k_firing_pin_spring', 'k98k_sear_spring', 'k98k_mag_spring'],
      thompson: [
        'thompson_recoil_spring',
        'thompson_sear_spring',
        'thompson_drum_spring',
      ],
      gau8: ['gau8_recoil_springs', 'gau8_buffer_spring', 'gau8_striker_spring'],
    };

    for (const [wid, partIds] of Object.entries(dynamicSprings) as Array<
      [WeaponId, readonly string[]]
    >) {
      const builders = await loadWeaponGeometryBuilders(wid);
      const isTank =
        getWeaponManifest(wid).workbenchMeta.scaleProfile ===
        'main_battle_tank';
      const maxWireDx = isTank ? 2.2 : 0.2;
      for (const partId of partIds) {
        let built: THREE.BufferGeometry | null = null;
        beginPartSpringCapture();
        try {
          built = builders[partId]();
        } finally {
          finishPartSpringCapture(built);
        }
        const transfers: Transferable[] = [];
        const serialized = serializeGeometry(partId, built!, transfers);
        expect(
          serialized.springParam,
          `${wid}/${partId}: expected non-null springParam`
        ).not.toBeNull();

        const restored = reconstructBufferGeometry(serialized);
        const pos = restored.getAttribute('position');
        const sp = restored.getAttribute('aSpringParam');
        expect(sp, `${wid}/${partId}: missing aSpringParam`).toBeDefined();
        expect(sp.count).toBe(pos.count);

        let activeSpringVerts = 0;
        for (let i = 0; i < sp.count; i++) {
          if (sp.getW(i) === SPRING_AXIS_MODE_X) {
            activeSpringVerts++;
            const wireDx = pos.getX(i) - sp.getY(i);
            expect(
              Math.abs(wireDx),
              `${wid}/${partId}: wire offset ${wireDx} exceeds wire bound`
            ).toBeLessThan(maxWireDx);
          }
        }
        expect(
          activeSpringVerts,
          `${wid}/${partId}: expected active X-axis coil vertices`
        ).toBeGreaterThan(100);
        curvatureOf(restored);
        restored.dispose();
      }
    }

    // Verify w = 3 (SPRING_AXIS_MODE_FLEX) parametric flex attribute on lift33 & r500
    const flexParts: ReadonlyArray<{ weaponId: WeaponId; partIds: readonly string[] }> = [
      {
        weaponId: 'lift33',
        partIds: [
          'lift33_bowstring',
          'lift33_yoke_cables',
          'lift33_upper_limbs',
          'lift33_lower_limbs',
          'lift33_cam_axles',
        ],
      },
      {
        weaponId: 'r500',
        partIds: [
          'r500_bowstring',
          'r500_power_cables',
          'r500_left_limbs',
          'r500_right_limbs',
          'r500_cam_axles',
        ],
      },
      {
        weaponId: 'python',
        partIds: ['python_mainspring'],
      },
    ];

    for (const { weaponId, partIds } of flexParts) {
      const builders = await loadWeaponGeometryBuilders(weaponId);
      for (const partId of partIds) {
        let built: THREE.BufferGeometry | null = null;
        beginPartSpringCapture();
        try {
          built = builders[partId]();
        } finally {
          finishPartSpringCapture(built);
        }
        const transfers: Transferable[] = [];
        const serialized = serializeGeometry(partId, built!, transfers);
        expect(
          serialized.springParam,
          `${weaponId}/${partId}: expected non-null flex springParam`
        ).not.toBeNull();

        const restored = reconstructBufferGeometry(serialized);
        const sp = restored.getAttribute('aSpringParam');
        expect(sp, `${weaponId}/${partId}: missing aSpringParam`).toBeDefined();
        let flexVerts = 0;
        let maxFlexDisp = 0;
        for (let i = 0; i < sp.count; i++) {
          if (sp.getW(i) === SPRING_AXIS_MODE_FLEX) {
            flexVerts++;
            const disp = Math.hypot(sp.getX(i), sp.getY(i), sp.getZ(i));
            if (disp > maxFlexDisp) maxFlexDisp = disp;
          }
        }
        expect(
          flexVerts,
          `${weaponId}/${partId}: expected active w=3 flex vertices`
        ).toBeGreaterThan(24);
        expect(
          maxFlexDisp,
          `${weaponId}/${partId}: expected non-zero flex displacement vector`
        ).toBeGreaterThan(0.5);
        curvatureOf(restored);
        restored.dispose();
      }
    }

    // Verify main-thread sliced fallback in geometryService attaches both attributes
    await ensureWeaponGeometries('g17', ['slide', 'recoil_spring']);
    const slideGeo = getCachedPartGeometry('g17', 'slide');
    const recoilGeo = getCachedPartGeometry('g17', 'recoil_spring');
    expect(slideGeo).not.toBeNull();
    expect(recoilGeo).not.toBeNull();
    curvatureOf(slideGeo!);
    expect(slideGeo!.getAttribute('aSpringParam')).toBeUndefined();
    curvatureOf(recoilGeo!);
    expect(recoilGeo!.getAttribute('aSpringParam')?.itemSize).toBe(4);
  }, 20_000);

  it('builds all 24 lift33 and 25 r500 archery geometries with unit normals, positive volume, aCurvature & watertight analytical parts', async () => {
    // Boolean three-bvh-csg cuts introduce T-junction split vertices (same as firearm receivers/rails)
    const r500CsgParts = new Set([
      'r500_chassis',
      'r500_buttstock',
      'r500_flight_rail',
      'r500_riser_head',
      'r500_left_cam',
      'r500_right_cam',
      'r500_trigger_sled',
      'r500_quiver_frame',
      'r500_trigger_spring', // Three.js TubeGeometry open ends (shared with all helical firearm springs)
    ]);
    for (const [wid, expectedCount] of [
      ['lift33', 24],
      ['r500', 25],
    ] as const) {
      const builders = await loadWeaponGeometryBuilders(wid);
      const entries = Object.entries(builders);
      expect(entries).toHaveLength(expectedCount);
      for (const [partId, buildFn] of entries) {
        const label = `${wid}/${partId}`;
        const geo = buildFn();
        try {
          expectFiniteArray(geo.getAttribute('position').array, `${label} pos`);
          expectFiniteArray(geo.getAttribute('normal').array, `${label} normal`);
          expectFiniteArray(geo.getAttribute('uv').array, `${label} uv`);
          if (wid === 'lift33' || !r500CsgParts.has(partId)) {
            expectWatertight(geo, label);
          }
          expectUnitNormals(geo, label);
          expect(signedVolume(geo), `${label}: positive signed volume`).toBeGreaterThan(0);
          curvatureOf(geo);
        } finally {
          geo.dispose();
        }
      }
    }
  }, 60000);
});

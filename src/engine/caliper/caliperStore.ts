import type * as THREE from 'three';
import type {
  MutablePartPose,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import { playWorkbenchFoley } from '../audio/mechanicalSoundEngine';

/**
 * WP-10 — 1:1 3D Armorer Vernier Caliper & Envelope Scale Metrology Store
 * ------------------------------------------------------------------------
 * Coordinate invariant (`AGENTS.md` Rule #1):
 *   `1 world unit = 1 cm = 10 mm` (`+X` muzzle, `+Y` up, `+Z` right flank).
 */

export const WORLD_UNIT_TO_MM = 10;

export type CaliperBenchmarkKind =
  | 'overall_envelope'
  | 'barrel_length'
  | 'bolt_lug_span';

export const CALIPER_BENCHMARK_ORDER: readonly CaliperBenchmarkKind[] = [
  'overall_envelope',
  'barrel_length',
  'bolt_lug_span',
];

export interface CaliperBenchmarkPresetNote {
  kind: CaliperBenchmarkKind;
  labelZh: string;
  labelEn: string;
  nominalMm: number;
}

export const CALIPER_V2_BENCHMARK_NOTES: Readonly<
  Partial<Record<WeaponId, readonly CaliperBenchmarkPresetNote[]>>
> = {
  m249: [
    {
      kind: 'overall_envelope',
      labelZh: 'M249 全枪包络总长 (托底至消焰器)',
      labelEn: 'M249 Overall Envelope Length (Buttpad to Birdcage)',
      nominalMm: 1035,
    },
    {
      kind: 'barrel_length',
      labelZh: '18.3" 快拆镀铬枪管总成跨度',
      labelEn: '18.3" Quick-Change CHF Barrel Assembly Span',
      nominalMm: 465,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双突笋 30° 回转闭锁枪机轴向跨度',
      labelEn: '2-Lug 30° Rotating Breech Bolt Axial Span',
      nominalMm: 78,
    },
  ],
  p08: [
    {
      kind: 'overall_envelope',
      labelZh: '鲁格 P08 全枪水平包络长度',
      labelEn: 'Luger P08 Overall Horizontal Envelope',
      nominalMm: 222,
    },
    {
      kind: 'barrel_length',
      labelZh: '4" (102mm) 锥形 9×19mm 枪管实长',
      labelEn: '4" (102mm) Tapered 9x19mm Barrel Span',
      nominalMm: 102,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '过死点双连杆肘节与矩形枪机闭锁链跨度',
      labelEn: 'Over-Center Knee-Toggle & Breechblock Lockup Train',
      nominalMm: 118,
    },
  ],
  vector: [
    {
      kind: 'overall_envelope',
      labelZh: 'Vector Gen II 展开全枪总长',
      labelEn: 'KRISS Vector Gen II Stock-Extended Overall Length',
      nominalMm: 617,
    },
    {
      kind: 'barrel_length',
      labelZh: '5.5" (140mm) 低膛轴线 .45 ACP 枪管跨度',
      labelEn: '5.5" (140mm) Low-Bore .45 ACP Barrel Span',
      nominalMm: 140,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: 'Super V -65° 钨钢下潜配重滑块对角包络',
      labelEn: 'Super V -65° Tungsten Counterweight Slider Span',
      nominalMm: 115,
    },
  ],
  g11: [
    {
      kind: 'overall_envelope',
      labelZh: 'G11 K2 无托全枪总长 (托底至消焰器)',
      labelEn: 'H&K G11 K2 Bullpup Overall Envelope Length',
      nominalMm: 750,
    },
    {
      kind: 'barrel_length',
      labelZh: '540mm 浮置冷锻 4.73mm 枪管跨度',
      labelEn: '540mm Floating Cold-Forged 4.73mm Barrel Span',
      nominalMm: 540,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '90° 旋转圆柱弹膛与钟表同步齿轮链跨度',
      labelEn: '90-Degree Rotary Breech & Clockwork Gear Train Span',
      nominalMm: 92,
    },
  ],
  vss: [
    {
      kind: 'overall_envelope',
      labelZh: 'VSS 温托雷兹整体微声步枪全长',
      labelEn: 'VSS Vintorez Integral Suppressed Overall Length',
      nominalMm: 894,
    },
    {
      kind: 'barrel_length',
      labelZh: '200mm 泄压孔线膛枪管跨度',
      labelEn: '200mm Ported Subsonic 9x39mm Barrel Span',
      nominalMm: 200,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '六对称闭锁突笋微声回转枪机轴向跨度',
      labelEn: '6-Lug Symmetric Rotating Bolt Axial Span',
      nominalMm: 76,
    },
  ],
  m134: [
    {
      kind: 'overall_envelope',
      labelZh: 'M134D 六管加特林机枪包络总长',
      labelEn: 'GE M134D Minigun 6-Barrel Overall Envelope Length',
      nominalMm: 804,
    },
    {
      kind: 'barrel_length',
      labelZh: '22" (558mm) 六联旋转冷锻枪管簇跨度',
      labelEn: '22" (558mm) 6-Barrel Rotary Cluster Span',
      nominalMm: 558,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '六槽中央旋转转子闭锁驱动跨度',
      labelEn: '6-Flute Central Rotor & Cam Lockup Span',
      nominalMm: 211,
    },
  ],
  an94: [
    {
      kind: 'overall_envelope',
      labelZh: 'AN-94 阿巴坎展开枪托全枪总长',
      labelEn: 'Nikonov AN-94 Abakan Stock-Extended Overall Length',
      nominalMm: 943,
    },
    {
      kind: 'barrel_length',
      labelZh: '405mm 浮置 5.45×39mm 镀铬枪管跨度',
      labelEn: '405mm Floating Chrome-Lined 5.45x39mm Barrel Span',
      nominalMm: 405,
    },
    {
      kind: 'bolt_lug_span',
      labelZh: '双突笋回转枪机与滑轮钢索机框闭锁跨度',
      labelEn: '2-Lug Rotating Bolt & Pulley-Carrier Assembly Span',
      nominalMm: 162,
    },
  ],
};

export interface CaliperSurfacePoint {
  partId: string;
  pos: readonly [number, number, number];
  normal: readonly [number, number, number];
}

export interface CaliperMeasurement {
  distanceCm: number;
  distanceMm: number;
  dxMm: number;
  dyMm: number;
  dzMm: number;
  midpoint: readonly [number, number, number];
}

export interface WeaponEnvelopeMetrics {
  min: readonly [number, number, number];
  max: readonly [number, number, number];
  center: readonly [number, number, number];
  lengthMm: number;
  heightMm: number;
  widthMm: number;
}

export interface CaliperSnapshot {
  weaponId: WeaponId;
  pointA: CaliperSurfacePoint | null;
  pointB: CaliperSurfacePoint | null;
  measurement: CaliperMeasurement | null;
  activeBenchmark: CaliperBenchmarkKind | null;
  seq: number;
}

export interface CaliperTransientHover {
  active: boolean;
  partId: string | null;
  x: number;
  y: number;
  z: number;
  nx: number;
  ny: number;
  nz: number;
}

/**
 * Pure millimeter metrology computation from two 3D CAD coordinates (`1 unit = 1 cm`).
 */
export function computeCaliperMeasurement(
  a: readonly [number, number, number],
  b: readonly [number, number, number]
): CaliperMeasurement {
  const dx = b[0] - a[0];
  const dy = b[1] - a[1];
  const dz = b[2] - a[2];
  const distanceCm = Math.hypot(dx, dy, dz);
  return {
    distanceCm,
    distanceMm: distanceCm * WORLD_UNIT_TO_MM,
    dxMm: Math.abs(dx) * WORLD_UNIT_TO_MM,
    dyMm: Math.abs(dy) * WORLD_UNIT_TO_MM,
    dzMm: Math.abs(dz) * WORLD_UNIT_TO_MM,
    midpoint: [(a[0] + b[0]) * 0.5, (a[1] + b[1]) * 0.5, (a[2] + b[2]) * 0.5],
  };
}

function rotateLocalPointEulerXYZ(
  lx: number,
  ly: number,
  lz: number,
  rx: number,
  ry: number,
  rz: number,
  out: [number, number, number]
): void {
  // Three.js default Euler 'XYZ': R = Rx * Ry * Rz
  const cz = Math.cos(rz);
  const sz = Math.sin(rz);
  const x1 = lx * cz - ly * sz;
  const y1 = lx * sz + ly * cz;
  const z1 = lz;

  const cy = Math.cos(ry);
  const sy = Math.sin(ry);
  const x2 = x1 * cy + z1 * sy;
  const y2 = y1;
  const z2 = -x1 * sy + z1 * cy;

  const cx = Math.cos(rx);
  const sx = Math.sin(rx);
  out[0] = x2;
  out[1] = y2 * cx - z2 * sx;
  out[2] = y2 * sx + z2 * cx;
}

const _cornerPt: [number, number, number] = [0, 0, 0];

function expandBoundsForPart(
  geo: THREE.BufferGeometry,
  pose: Readonly<MutablePartPose>,
  bounds: {
    minX: number;
    minY: number;
    minZ: number;
    maxX: number;
    maxY: number;
    maxZ: number;
    valid: boolean;
  }
): void {
  if (!geo.boundingBox) {
    geo.computeBoundingBox();
  }
  const bb = geo.boundingBox;
  if (!bb) return;

  const xs = [bb.min.x * pose.sx, bb.max.x * pose.sx];
  const ys = [bb.min.y, bb.max.y];
  const zs = [bb.min.z, bb.max.z];

  for (let ix = 0; ix < 2; ix++) {
    for (let iy = 0; iy < 2; iy++) {
      for (let iz = 0; iz < 2; iz++) {
        rotateLocalPointEulerXYZ(
          xs[ix],
          ys[iy],
          zs[iz],
          pose.rx,
          pose.ry,
          pose.rz,
          _cornerPt
        );
        const wx = pose.px + _cornerPt[0];
        const wy = pose.py + _cornerPt[1];
        const wz = pose.pz + _cornerPt[2];
        if (!Number.isFinite(wx) || !Number.isFinite(wy) || !Number.isFinite(wz)) {
          continue;
        }
        if (wx < bounds.minX) bounds.minX = wx;
        if (wy < bounds.minY) bounds.minY = wy;
        if (wz < bounds.minZ) bounds.minZ = wz;
        if (wx > bounds.maxX) bounds.maxX = wx;
        if (wy > bounds.maxY) bounds.maxY = wy;
        if (wz > bounds.maxZ) bounds.maxZ = wz;
        bounds.valid = true;
      }
    }
  }
}

/**
 * Computes exact 1:1 world-space bounding envelope (`mm`) across the provided weapon parts.
 */
export function computeWeaponEnvelopeMetrics(
  parts: readonly WeaponPartSpec[],
  getGeometry: (partId: string) => THREE.BufferGeometry | null,
  evaluatePose: (part: WeaponPartSpec, out: MutablePartPose) => MutablePartPose,
  scratchPose: MutablePartPose
): WeaponEnvelopeMetrics | null {
  const acc = {
    minX: Infinity,
    minY: Infinity,
    minZ: Infinity,
    maxX: -Infinity,
    maxY: -Infinity,
    maxZ: -Infinity,
    valid: false,
  };

  for (let i = 0; i < parts.length; i++) {
    const part = parts[i];
    const geo = getGeometry(part.id);
    if (!geo) continue;
    evaluatePose(part, scratchPose);
    expandBoundsForPart(geo, scratchPose, acc);
  }

  if (!acc.valid) return null;

  return {
    min: [acc.minX, acc.minY, acc.minZ],
    max: [acc.maxX, acc.maxY, acc.maxZ],
    center: [
      (acc.minX + acc.maxX) * 0.5,
      (acc.minY + acc.maxY) * 0.5,
      (acc.minZ + acc.maxZ) * 0.5,
    ],
    lengthMm: (acc.maxX - acc.minX) * WORLD_UNIT_TO_MM,
    heightMm: (acc.maxY - acc.minY) * WORLD_UNIT_TO_MM,
    widthMm: (acc.maxZ - acc.minZ) * WORLD_UNIT_TO_MM,
  };
}

function findBenchmarkTargetPart(
  parts: readonly WeaponPartSpec[],
  kind: Exclude<CaliperBenchmarkKind, 'overall_envelope'>
): WeaponPartSpec | null {
  if (kind === 'barrel_length') {
    return (
      parts.find((p) => p.id === 'm134_barrel_cluster') ??
      parts.find((p) => /(?:^|_)barrel$/.test(p.id)) ??
      parts.find((p) => /barrel/.test(p.id) && !/spring|lock|cross|clamp/.test(p.id)) ??
      parts.find((p) => p.id === 'lift33_arrow_shaft' || p.id === 'r500_flight_rail') ??
      null
    );
  }
  // bolt_lug_span: prefer rotating/locking bolt head (or revolver 6-shot cylinder / P08 toggle / Super V slider / M134 rotor), else slide
  return (
    parts.find(
      (p) =>
        p.id === 'python_cylinder' ||
        p.id === 'vector_slider' ||
        p.id === 'm134_rotor_assembly'
    ) ??
    parts.find(
      (p) =>
        /(?:^|_)(?:bolt|bolt_head|bolt_body|breechblock)$/.test(p.id) &&
        !/cylinder_bolt/.test(p.id)
    ) ??
    parts.find((p) => /(?:^|_)slide$/.test(p.id)) ??
    parts.find((p) => p.id === 'lift33_riser' || p.id === 'r500_cam_axles') ??
    parts[0] ??
    null
  );
}

class CaliperRuntimeController {
  private weaponId: WeaponId = 'ak15';
  private pointA: CaliperSurfacePoint | null = null;
  private pointB: CaliperSurfacePoint | null = null;
  private activeBenchmark: CaliperBenchmarkKind | null = null;
  private seq = 0;

  private readonly hoverState: CaliperTransientHover = {
    active: false,
    partId: null,
    x: 0,
    y: 0,
    z: 0,
    nx: 0,
    ny: 1,
    nz: 0,
  };

  private snapshot: CaliperSnapshot;
  private listeners = new Set<() => void>();

  constructor() {
    this.snapshot = this.buildSnapshot();
  }

  public subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  };

  public getSnapshot = (): CaliperSnapshot => this.snapshot;

  private emit(): void {
    this.seq += 1;
    this.snapshot = this.buildSnapshot();
    for (const fn of this.listeners) {
      fn();
    }
  }

  private buildSnapshot(): CaliperSnapshot {
    const measurement =
      this.pointA && this.pointB
        ? computeCaliperMeasurement(this.pointA.pos, this.pointB.pos)
        : null;
    return {
      weaponId: this.weaponId,
      pointA: this.pointA,
      pointB: this.pointB,
      measurement,
      activeBenchmark: this.activeBenchmark,
      seq: this.seq,
    };
  }

  public syncWeapon(weaponId: WeaponId, clearOnSwitch = true): void {
    if (this.weaponId === weaponId) return;
    this.weaponId = weaponId;
    if (clearOnSwitch) {
      this.pointA = null;
      this.pointB = null;
      this.activeBenchmark = null;
      this.clearTransientHover();
    }
    this.emit();
  }

  public clearPoints(): void {
    if (
      this.pointA === null &&
      this.pointB === null &&
      this.activeBenchmark === null
    ) {
      return;
    }
    this.pointA = null;
    this.pointB = null;
    this.activeBenchmark = null;
    playWorkbenchFoley('toggle_switch');
    this.emit();
  }

  /**
   * Zero-GC 60fps surface hover update (never triggers React state re-renders).
   */
  public setTransientHover(
    partId: string,
    x: number,
    y: number,
    z: number,
    nx = 0,
    ny = 1,
    nz = 0
  ): void {
    this.hoverState.active = true;
    this.hoverState.partId = partId;
    this.hoverState.x = x;
    this.hoverState.y = y;
    this.hoverState.z = z;
    this.hoverState.nx = nx;
    this.hoverState.ny = ny;
    this.hoverState.nz = nz;
  }

  public clearTransientHover(matchingPartId?: string): void {
    if (matchingPartId && this.hoverState.partId !== matchingPartId) {
      return;
    }
    this.hoverState.active = false;
    this.hoverState.partId = null;
  }

  public getTransientHover(): Readonly<CaliperTransientHover> {
    return this.hoverState;
  }

  /**
   * Records a 3D surface click:
   * - 1st click sets Jaw A
   * - 2nd click locks Jaw B and computes exact millimeter span
   * - 3rd click starts a fresh Jaw A measurement
   */
  public recordSurfacePoint(
    weaponId: WeaponId,
    partId: string,
    pos: readonly [number, number, number],
    normal: readonly [number, number, number] = [0, 1, 0]
  ): void {
    if (this.weaponId !== weaponId) {
      this.weaponId = weaponId;
      this.pointA = null;
      this.pointB = null;
    }

    const pt: CaliperSurfacePoint = {
      partId,
      pos: [pos[0], pos[1], pos[2]],
      normal: [normal[0], normal[1], normal[2]],
    };

    this.activeBenchmark = null;
    if (this.pointA === null || this.pointB !== null) {
      this.pointA = pt;
      this.pointB = null;
      playWorkbenchFoley('part_select');
    } else {
      this.pointB = pt;
      playWorkbenchFoley('preset_detent');
    }
    this.emit();
  }

  /**
   * Snaps caliper jaws onto exact CAD datum extremes for 1-click verification
   * (overall weapon length, barrel bore length, or bolt/slide longitudinal span).
   */
  public applyBenchmarkPreset(
    weaponId: WeaponId,
    kind: CaliperBenchmarkKind,
    parts: readonly WeaponPartSpec[],
    getGeometry: (partId: string) => THREE.BufferGeometry | null,
    evaluatePose: (
      part: WeaponPartSpec,
      out: MutablePartPose
    ) => MutablePartPose,
    scratchPose: MutablePartPose
  ): boolean {
    this.weaponId = weaponId;

    // Dedicated 1:1 archery benchmarks:
    // - lift33: Axle-to-Axle (830mm Y), Power-Stroke/Arrow Span (X), Brace Height (string->grip X)
    // - r500: Overall Length (X), Flight Track Power Stroke (X), Axle-to-Axle Cam Width (Z)
    if ((weaponId as string) === 'lift33') {
      const findPart = (id: string) => parts.find((p) => p.id === id);
      if (kind === 'overall_envelope') {
        const up = findPart('lift33_upper_cam');
        const lo = findPart('lift33_lower_cam');
        if (up && lo) {
          const uEnv = computeWeaponEnvelopeMetrics([up], getGeometry, evaluatePose, scratchPose);
          const lEnv = computeWeaponEnvelopeMetrics([lo], getGeometry, evaluatePose, scratchPose);
          if (uEnv && lEnv) {
            this.pointA = {
              partId: lo.id,
              pos: [lEnv.center[0], lEnv.center[1], lEnv.center[2]],
              normal: [0, -1, 0],
            };
            this.pointB = {
              partId: up.id,
              pos: [uEnv.center[0], uEnv.center[1], uEnv.center[2]],
              normal: [0, 1, 0],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      } else if (kind === 'bolt_lug_span') {
        const str = findPart('lift33_bowstring');
        const grip = findPart('lift33_grip');
        if (str && grip) {
          const sEnv = computeWeaponEnvelopeMetrics([str], getGeometry, evaluatePose, scratchPose);
          const gEnv = computeWeaponEnvelopeMetrics([grip], getGeometry, evaluatePose, scratchPose);
          if (sEnv && gEnv) {
            this.pointA = {
              partId: str.id,
              pos: [sEnv.center[0], gEnv.center[1], 0],
              normal: [-1, 0, 0],
            };
            this.pointB = {
              partId: grip.id,
              pos: [gEnv.center[0], gEnv.center[1], 0],
              normal: [1, 0, 0],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      }
    } else if ((weaponId as string) === 'r500') {
      const findPart = (id: string) => parts.find((p) => p.id === id);
      if (kind === 'bolt_lug_span') {
        const lc = findPart('r500_left_cam');
        const rc = findPart('r500_right_cam');
        if (lc && rc) {
          const lEnv = computeWeaponEnvelopeMetrics([lc], getGeometry, evaluatePose, scratchPose);
          const rEnv = computeWeaponEnvelopeMetrics([rc], getGeometry, evaluatePose, scratchPose);
          if (lEnv && rEnv) {
            this.pointA = {
              partId: lc.id,
              pos: [lEnv.center[0], lEnv.center[1], lEnv.center[2]],
              normal: [0, 0, -1],
            };
            this.pointB = {
              partId: rc.id,
              pos: [rEnv.center[0], rEnv.center[1], rEnv.center[2]],
              normal: [0, 0, 1],
            };
            this.activeBenchmark = kind;
            playWorkbenchFoley('preset_detent');
            this.emit();
            return true;
          }
        }
      }
    } else if (weaponId === 'p08' && kind === 'bolt_lug_span') {
      const toggleParts = parts.filter(
        (p) =>
          p.id === 'p08_breechblock' ||
          p.id === 'p08_front_toggle' ||
          p.id === 'p08_rear_toggle'
      );
      if (toggleParts.length >= 2) {
        const tEnv = computeWeaponEnvelopeMetrics(
          toggleParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (tEnv) {
          this.pointA = {
            partId: 'p08_rear_toggle',
            pos: [tEnv.min[0], tEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'p08_breechblock',
            pos: [tEnv.max[0], tEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'vector' && kind === 'bolt_lug_span') {
      const sliderPart = parts.find((p) => p.id === 'vector_slider');
      if (sliderPart) {
        const sEnv = computeWeaponEnvelopeMetrics(
          [sliderPart],
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (sEnv) {
          this.pointA = {
            partId: sliderPart.id,
            pos: [sEnv.min[0], sEnv.min[1], 0],
            normal: [-0.4226, -0.9063, 0],
          };
          this.pointB = {
            partId: sliderPart.id,
            pos: [sEnv.max[0], sEnv.max[1], 0],
            normal: [0.4226, 0.9063, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'g11' && kind === 'bolt_lug_span') {
      const clockworkParts = parts.filter(
        (p) => p.id === 'g11_rotary_breech' || p.id === 'g11_clockwork_gears'
      );
      if (clockworkParts.length >= 2) {
        const cEnv = computeWeaponEnvelopeMetrics(
          clockworkParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (cEnv) {
          this.pointA = {
            partId: 'g11_rotary_breech',
            pos: [cEnv.min[0], cEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'g11_clockwork_gears',
            pos: [cEnv.max[0], cEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    } else if (weaponId === 'an94' && kind === 'bolt_lug_span') {
      const anBoltParts = parts.filter(
        (p) => p.id === 'an94_bolt_carrier' || p.id === 'an94_bolt'
      );
      if (anBoltParts.length >= 2) {
        const aEnv = computeWeaponEnvelopeMetrics(
          anBoltParts,
          getGeometry,
          evaluatePose,
          scratchPose
        );
        if (aEnv) {
          this.pointA = {
            partId: 'an94_bolt_carrier',
            pos: [aEnv.min[0], aEnv.center[1], 0],
            normal: [-1, 0, 0],
          };
          this.pointB = {
            partId: 'an94_bolt',
            pos: [aEnv.max[0], aEnv.center[1], 0],
            normal: [1, 0, 0],
          };
          this.activeBenchmark = kind;
          playWorkbenchFoley('preset_detent');
          this.emit();
          return true;
        }
      }
    }

    if (kind === 'overall_envelope') {
      const env = computeWeaponEnvelopeMetrics(
        parts,
        getGeometry,
        evaluatePose,
        scratchPose
      );
      if (!env) return false;
      const rearPart =
        parts.find(
          (p) =>
            p.id === 'm249_buttstock' ||
            p.id === 'p08_frame' ||
            p.id === 'vector_folding_stock' ||
            p.id === 'm134_spade_grip' ||
            /(?:buttstock|buttplate|walnut_stock|wood_stock|stock)$/.test(p.id)
        )?.id ??
        parts[parts.length - 1]?.id ??
        'receiver';
      const frontPart =
        parts.find(
          (p) =>
            p.id === 'vector_muzzle_device' ||
            p.id === 'g11_flash_hider' ||
            p.id === 'vss_suppressor_tube' ||
            p.id === 'm134_flash_suppressor' ||
            p.id === 'an94_muzzle_brake'
        )?.id ??
        findBenchmarkTargetPart(parts, 'barrel_length')?.id ??
        parts[0]?.id ??
        'muzzle';
      this.pointA = {
        partId: rearPart,
        pos: [env.min[0], env.center[1], 0],
        normal: [-1, 0, 0],
      };
      this.pointB = {
        partId: frontPart,
        pos: [env.max[0], env.center[1], 0],
        normal: [1, 0, 0],
      };
      this.activeBenchmark = kind;
      playWorkbenchFoley('preset_detent');
      this.emit();
      return true;
    }

    const targetPart = findBenchmarkTargetPart(parts, kind);
    if (!targetPart) return false;
    const geo = getGeometry(targetPart.id);
    if (!geo) return false;

    const singleEnv = computeWeaponEnvelopeMetrics(
      [targetPart],
      getGeometry,
      evaluatePose,
      scratchPose
    );
    if (!singleEnv) return false;

    this.pointA = {
      partId: targetPart.id,
      pos: [singleEnv.min[0], singleEnv.center[1], singleEnv.center[2]],
      normal: [-1, 0, 0],
    };
    this.pointB = {
      partId: targetPart.id,
      pos: [singleEnv.max[0], singleEnv.center[1], singleEnv.center[2]],
      normal: [1, 0, 0],
    };
    this.activeBenchmark = kind;
    playWorkbenchFoley('preset_detent');
    this.emit();
    return true;
  }
}

export const caliperStore = new CaliperRuntimeController();

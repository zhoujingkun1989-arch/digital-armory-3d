import {
  buildCentennialMagazineStackSpecs,
  buildCentennialSculpturalAmmoMeta,
} from '../../weapons/expansion/centennialProjectors';
import type { WeaponId } from '../../weapons/types';
import { clamp01, seg, smoothstep01 } from '../kinematics/math';

// ============================================================================
// Museum-Grade Zero-GC 3D Full-Magazine Cartridge Stack Specifications (34 Exhibits)
// ============================================================================
// Defines CAD-accurate staggered double-column, single-column, tubular, revolver,
// en-bloc, belt-chute, caseless overhead, quiver, and 90° helical-turret 3D ammo
// stacks across 27 instanced exhibits + 7 sculptural GLB heavy-ordnance/drum/belt
// exhibits (`ztz99a`, `m1a2`, `leopard2a7`, `tiger1`, `mg42`, `thompson`, `gau8`):
//  - Curved banana & STANAG arcs: `ak15`, `m4a1`, `scar`, `aug`, `mp5`, `an94` (15° canted)
//  - Raked pistol grip columns: `g17` (-20°), `p320` (-18°), `m1911` (-18° single), `deagle` (-15° single), `p08` (-35°), `vector` (+66°)
//  - Straight rifle & internal boxes: `awm`, `m82a1`, `k98k` (5-rd staggered), `garand` (8-rd en-bloc), `vss`
//  - Tubular & rotary: `winchester1894` (.30-30), `rem870` (12ga), `benellim4` (12ga), `python` (.357 cylinder)
//  - Overhead / helical / chute / archery: `p90`, `g11`, `m249`, `m134`, `lift33`, `r500`
// ============================================================================

export interface ReadonlyMagazineRoundSlot {
  readonly px: number;
  readonly py: number;
  readonly pz: number;
  readonly rx: number;
  readonly ry: number;
  readonly rz: number;
}

export interface MutableMagazineRoundPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  /** Per-slot scale factor in [0, 1] (used for post-retraction bottom replacement emergence) */
  scaleMult: number;
}

export interface FollowerDeckSupportPlane {
  /** Point on the follower's cartridge-supporting top deck in assembled world space (cm) */
  readonly point: readonly [number, number, number];
  /** Outward support unit normal pointing from follower deck into the ammo stack */
  readonly normal: readonly [number, number, number];
}

export interface WeaponMagazineStackSpec {
  readonly weaponId: WeaponId;
  readonly magBodyPartId: string;
  readonly followerPartId: string;
  /** Optional secondary magazine housing part enclosing throat rounds (e.g. `p90_helical_ramp`) */
  readonly throatPartId?: string;
  /** Number of visible cartridges in the full static magazine stack (`Slots 0 .. roundCount - 1`) */
  readonly roundCount: number;
  /**
   * Slot index handed off to `BallisticsSystem`'s `nextRoundRef` during active firing:
   * - `0` for all 10 vertical / curved / raked magazines;
   * - `3` for `p90`, where `Slots 0..2` populate the 90° helical feed ramp down to `ry = 0`
   *   at `Slot 0` in static / cutaway views, while `Slot 3` sits at `[-3.65, 2.66, 0]`
   *   matching `computeP90BallisticsState(0).nextRoundPos`!
   */
  readonly firingHandoffSlotIndex: number;
  /** Normalized firing progress window `[feedStartF, feedEndF]` driving upward 1-slot feed shift */
  readonly feedWindow: readonly [number, number];
  /**
   * Post-retraction window `[repStartF, repEndF]` after `mag_follower` returns to rest,
   * smoothly scaling replacement `slot[roundCount]` into `slots[roundCount - 1]` so `f = 1.0` == `f = 0.0`
   * with zero follower-pulse collision!
   */
  readonly replenishWindow: readonly [number, number];
  /** Disassembly scalar `t` above which internal follower/spring sub-disassembly starts */
  readonly magSubStripStartT: number;
  /** Calibrated follower support plane for anti-clipping verification */
  readonly followerDeckPlane: FollowerDeckSupportPlane;
  /**
   * Precomputed static slot table `[0 .. roundCount]` (`roundCount + 1` entries, where entry
   * `roundCount` sits at `slots[roundCount - 1]` for post-retraction loop replenishment).
   */
  readonly slots: readonly ReadonlyMagazineRoundSlot[];
}

export function createMutableMagazineRoundPose(): MutableMagazineRoundPose {
  return {
    px: 0,
    py: 0,
    pz: 0,
    rx: 0,
    ry: 0,
    rz: 0,
    scaleMult: 1,
  };
}

function makeSlot(
  px: number,
  py: number,
  pz: number,
  rx: number,
  ry: number,
  rz: number
): ReadonlyMagazineRoundSlot {
  return { px, py, pz, rx, ry, rz };
}

/**
 * Computes staggered double-column Z offset that tapers cleanly to 0 at `Slot 0`
 * (single-feed / center-presentation throat) and alternates `±zHalf` down the body.
 */
function staggeredZ(
  slotIndex: number,
  zHalf: number,
  firstOddSign: 1 | -1
): number {
  if (slotIndex <= 0 || zHalf === 0) return 0;
  const sign = slotIndex % 2 === 1 ? firstOddSign : -firstOddSign;
  const taper = slotIndex === 1 ? 0.78 : 1.0;
  return sign * zHalf * taper;
}

function appendReplacementSlotAtBottom(
  slots: ReadonlyMagazineRoundSlot[]
): ReadonlyMagazineRoundSlot[] {
  const last = slots[slots.length - 1];
  slots.push(makeSlot(last.px, last.py, last.pz, last.rx, last.ry, last.rz));
  return slots;
}

// ============================================================================
// Analytic Spine Builders per Magazine Architecture
// ============================================================================

/** 1. AK-15 30-Rd 7.62×39mm Windowed Banana Curve (`ARC_CX=11.8, ARC_CY=0.25` at `[2.55, -0.55, 0]`) */
function buildAk15BananaSlots(): ReadonlyMagazineRoundSlot[] {
  const count = 21;
  const worldCx = 2.55 + 11.8; // 14.35
  const worldCy = -0.55 + 0.25; // -0.30
  const ang0 = Math.atan2(worldCy - -0.15, worldCx - 2.55); // -0.012711 -> exact [2.55, -0.15]
  const r0 = Math.hypot(worldCx - 2.55, worldCy - -0.15); // 11.80095
  const rMid = 11.84;
  const angBottom = 0.662; // Clears pulsing follower at f=0.63 & static deck ang=0.717
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push(makeSlot(2.55, -0.15, 0, 0, 0, 0.16));
      continue;
    }
    const u = i / (count - 1);
    const ang = ang0 + (angBottom - ang0) * u;
    const r = r0 + (rMid - r0) * smoothstep01(i / 3);
    const px = worldCx - Math.cos(ang) * r;
    const py = worldCy - Math.sin(ang) * r;
    // Odd slots on -Z (left), even slots (including bottom Slot 20) on +Z (right lower deck)
    const pz = staggeredZ(i, 0.13, -1);
    const topPitchBoost = 0.14 * Math.max(0, 1 - i / 4);
    const rz = ang + topPitchBoost;
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/** 2. Colt M4A1 30-Rd USGI STANAG Curve (straight tower `Y >= -2.25` + `R = 18.0` arc) */
function buildM4a1StanagSlots(): ReadonlyMagazineRoundSlot[] {
  const count = 20;
  const straightTopY = 0.25;
  const arcPivotY = -2.25; // assembledPos.y (-1.0) + STANAG_ARC_CY (-1.25)
  const straightLen = straightTopY - arcPivotY; // 2.50 cm
  const worldArcCx = 2.4 + 18.0; // 20.40
  const rMid = 18.0;
  const angBottom = 0.23; // Above follower left flat deck ang=0.256 & right step ang=0.247
  const totalLen = straightLen + rMid * angBottom;
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push(makeSlot(2.4, 0.25, 0, 0, 0, 0.06));
      continue;
    }
    const s = (i / (count - 1)) * totalLen;
    let px: number;
    let py: number;
    let slopeAng: number;
    if (s <= straightLen) {
      px = 2.4;
      py = straightTopY - s;
      slopeAng = 0;
    } else {
      const ang = (s - straightLen) / rMid;
      px = worldArcCx - Math.cos(ang) * rMid;
      py = arcPivotY - Math.sin(ang) * rMid;
      slopeAng = ang;
    }
    // Odd slots (including bottom Slot 19) sit on -Z (left lower flat deck)!
    const pz = staggeredZ(i, 0.115, -1);
    const rz = slopeAng + 0.06 * Math.max(0, 1 - i / 5);
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/** 3. FN SCAR-L 30-Rd FDE STANAG Curve (`stanagCenterX` quadratic curve below `y_local = -1.20`) */
function buildScarStanagSlots(): ReadonlyMagazineRoundSlot[] {
  const count = 22;
  const topWy = 0.28;
  const bottomWy = -7.05; // Clears peak follower pulse at f=0.63 & static deck Y=-7.503
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push(makeSlot(2.45, 0.28, 0, 0, 0, 0.06));
      continue;
    }
    const uSlot = i / (count - 1);
    const py = topWy + (bottomWy - topWy) * uSlot;
    const yLocal = py - -1.8;
    let px = 2.45;
    let slopeAng = 0;
    if (yLocal < -1.2) {
      const uArc = Math.min(1, (-1.2 - yLocal) / 6.4);
      px = 2.45 + 0.72 * uArc * uArc;
      slopeAng = 0.15 * uArc;
    }
    // Odd slots (including bottom Slot 21) sit on -Z (left lower flat deck)!
    const pz = staggeredZ(i, 0.12, -1);
    const rz = slopeAng + 0.06 * Math.max(0, 1 - i / 5);
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/** 4. Steyr AUG A1 30-Rd Translucent Amber Waffle Curve (`AUG_MAG_ARC_CX=18.0` at `[-9.95, 0.45, 0]`) */
function buildAugWaffleSlots(angBottom: number): ReadonlyMagazineRoundSlot[] {
  const count = 20;
  const worldCx = -9.95 + 18.0; // 8.05
  const worldCy = 0.45;
  const ang0 = Math.atan2(worldCy - 0.25, worldCx - -9.85); // 0.011172 -> exact [-9.85, 0.25]
  const r0 = Math.hypot(worldCx - -9.85, worldCy - 0.25); // 17.9011
  const rMid = 18.0;
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push(makeSlot(-9.85, 0.25, 0, 0, 0, 0.08));
      continue;
    }
    const u = i / (count - 1);
    const ang = ang0 + (angBottom - ang0) * u;
    const r = r0 + (rMid - r0) * smoothstep01(i / 3);
    const px = worldCx - Math.cos(ang) * r;
    const py = worldCy - Math.sin(ang) * r;
    const pz = staggeredZ(i, 0.11, 1);
    const rz = ang + 0.07 * Math.max(0, 1 - i / 4);
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/** 5. HK MP5A3 30-Rd Curved 9×19mm Steel Magazine (`MAG_CX=16.0, MAG_CY=0.45` at `[2.90, -0.45, 0]`) */
function buildMp5CurvedSlots(angBottom: number): ReadonlyMagazineRoundSlot[] {
  const count = 20;
  const worldCx = 2.9 + 16.0; // 18.90
  const worldCy = 0.0; // -0.45 + 0.45
  const ang0 = Math.atan2(worldCy - -0.18, worldCx - 2.68); // 0.011096 -> exact [2.68, -0.18]
  const r0 = Math.hypot(worldCx - 2.68, worldCy - -0.18); // 16.221
  const rMid = 16.06; // Centers asymmetric [-0.594, +0.718] 9mm round inside [15.08, 16.92]
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    if (i === 0) {
      slots.push(makeSlot(2.68, -0.18, 0, 0, 0, 0.15));
      continue;
    }
    const u = i / (count - 1);
    const ang = ang0 + (angBottom - ang0) * u;
    const r = r0 + (rMid - r0) * smoothstep01(i / 3);
    const px = worldCx - Math.cos(ang) * r;
    const py = worldCy - Math.sin(ang) * r;
    const pz = staggeredZ(i, 0.09, 1);
    const rz = ang + 0.12 * Math.max(0, 1 - i / 4);
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/**
 * 6/7/8. Raked Pistol Grip Tube Builder (`g17` -20°, `p320` -18°, `deagle` -15° single-stack)
 * Evaluates local `(lx, ly)` along the raked magazine body frame so every cartridge stays
 * strictly centered between the angled front and rear magazine walls!
 */
function buildRakedPistolSlots(cfg: {
  count: number;
  slot0: readonly [number, number, number];
  slot0Rz: number;
  magAssembledPos: readonly [number, number];
  gripAngleRad: number;
  localXCenter: number;
  localYSlot1: number;
  localYBottom: number;
  topBodyRz: number;
  bottomRz: number;
  zHalf: number;
  firstOddSign: 1 | -1;
}): ReadonlyMagazineRoundSlot[] {
  const {
    count,
    slot0,
    slot0Rz,
    magAssembledPos,
    gripAngleRad,
    localXCenter,
    localYSlot1,
    localYBottom,
    topBodyRz,
    bottomRz,
    zHalf,
    firstOddSign,
  } = cfg;
  const cosG = Math.cos(gripAngleRad);
  const sinG = Math.sin(gripAngleRad);
  const slots: ReadonlyMagazineRoundSlot[] = [
    makeSlot(slot0[0], slot0[1], slot0[2], 0, 0, slot0Rz),
  ];

  for (let i = 1; i < count; i++) {
    const u = count > 2 ? (i - 1) / (count - 2) : 0;
    const ly = localYSlot1 + (localYBottom - localYSlot1) * u;
    const lx = i === 1 && zHalf > 0 ? localXCenter + 0.04 : localXCenter;
    const px = magAssembledPos[0] + lx * cosG - ly * sinG;
    const py = magAssembledPos[1] + lx * sinG + ly * cosG;
    const pz = staggeredZ(i, zHalf, firstOddSign);
    const rz = topBodyRz + (bottomRz - topBodyRz) * u;
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/** 9/10. Straight Sniper Box Column Builder (`awm` 5-rd .338 LM, `m82a1` 10-rd .50 BMG) */
function buildStraightBoxSlots(cfg: {
  count: number;
  xCenter: number;
  topY: number;
  bottomY: number;
  topRz: number;
  bottomRz: number;
  zHalf: number;
  firstOddSign: 1 | -1;
}): ReadonlyMagazineRoundSlot[] {
  const {
    count,
    xCenter,
    topY,
    bottomY,
    topRz,
    bottomRz,
    zHalf,
    firstOddSign,
  } = cfg;
  const slots: ReadonlyMagazineRoundSlot[] = [];

  for (let i = 0; i < count; i++) {
    const u = count > 1 ? i / (count - 1) : 0;
    const py = topY + (bottomY - topY) * u;
    const pz = staggeredZ(i, zHalf, firstOddSign);
    const rz = topRz + (bottomRz - topRz) * u;
    slots.push(makeSlot(xCenter, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

/**
 * 11. FN P90 50-Rd Top Horizontal Double-Stack + Rear 90° Helical Feed Turret (`5.7×28mm`)
 *  - `Slots 0..2`: Inside `p90_helical_ramp` rotating smoothly `ry: 0 <- +π/2` (`Slot 0` aligned
 *    axially `ry = 0` at `[-3.45, 1.54, 0]` in the stainless feed lips!).
 *  - `Slot 3`: Horizontal-to-helical turret entry `[-3.65, 2.66, 0]`, `ry = +π/2` (matches
 *    `computeP90BallisticsState(0).nextRoundPos` to `0.000` cm!).
 *  - `Slots 4..N-1`: Horizontal double-row stack (`Y = 2.66 ± 0.125`, `ry = +π/2`, bullet pointing `-Z`)
 *    advancing forward (`+X`) to the twin rollers of `p90_mag_follower`!
 */
function buildP90HelicalAndHorizontalSlots(
  frontMaxX: number
): ReadonlyMagazineRoundSlot[] {
  const slots: ReadonlyMagazineRoundSlot[] = [
    // Slot 0: Seated in stainless C-hook feed lips of `p90_helical_ramp` (`ry = 0`, pointing +X!)
    makeSlot(-3.45, 1.54, 0, 0, 0.0, 0.0),
    // Slot 1: Lower spiral ramp (`32°` clockwise twist)
    makeSlot(-3.51, 1.9, 0, 0, 0.56, -0.04),
    // Slot 2: Upper spiral ramp (`63°` clockwise twist)
    makeSlot(-3.58, 2.28, 0, 0, 1.1, -0.03),
    // Slot 3: Turret throat entry — exact match to `computeP90BallisticsState(0).nextRoundPos`!
    makeSlot(-3.65, 2.66, 0, 0, Math.PI * 0.5, 0.0),
  ];

  const horizCount = 26; // Total = 4 + 26 = 30 rounds (>= 25 contract!)
  const startX = -3.26;
  for (let k = 0; k < horizCount; k++) {
    const u = k / (horizCount - 1);
    const px = startX + (frontMaxX - startX) * u;
    // Staggered vertically in Y (±0.125 cm) matching `p90_mag_follower` upper/lower dummy rollers!
    const yStagger = (k % 2 === 0 ? 1 : -1) * 0.125;
    slots.push(makeSlot(px, 2.66 + yStagger, 0, 0, Math.PI * 0.5, 0));
  }

  return appendReplacementSlotAtBottom(slots);
}

const G17_GRIP_RAD = (-20 * Math.PI) / 180;
const P320_GRIP_RAD = (-18 * Math.PI) / 180;
const DEAGLE_GRIP_RAD = (-15 * Math.PI) / 180;
const P08_GRIP_RAD = (-35 * Math.PI) / 180;
const VECTOR_MAG_RAD = (66 * Math.PI) / 180;

/**
 * 19. KRISS Vector 25-Rd Glock-21 / MagEx2 `.45 ACP` Forward-Raked (`+66°`) Staggered Column
 * (`vector_mag_body` extruded along local `+X` `[-8.10, +8.45]` at `[4.95, -9.85, 0]`).
 */
function buildVectorMagEx2Slots(): ReadonlyMagazineRoundSlot[] {
  const count = 16;
  const cosM = Math.cos(VECTOR_MAG_RAD);
  const sinM = Math.sin(VECTOR_MAG_RAD);
  const slots: ReadonlyMagazineRoundSlot[] = [
    // Slot 0: Exact match to `computeVectorBallisticsState(0).nextRoundPos`!
    makeSlot(7.95, -2.15, 0, 0, 0, 0.18),
  ];

  const lxTop = 7.25;
  const lxBottom = -4.25;
  for (let i = 1; i < count; i++) {
    const u = (i - 1) / (count - 2);
    const lx = lxTop + (lxBottom - lxTop) * u;
    const px = 4.95 + lx * cosM;
    const py = -9.85 + lx * sinM;
    const pz = staggeredZ(i, 0.21, -1);
    const rz = 0.04 + (-0.24 - 0.04) * u;
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  return appendReplacementSlotAtBottom(slots);
}

function normalFromTiltZ(rz: number): readonly [number, number, number] {
  return [-Math.sin(rz), Math.cos(rz), 0];
}

const AN94_CANT_RAD = -((15 * Math.PI) / 180);

function buildG11CaselessStackSlots(): readonly ReadonlyMagazineRoundSlot[] {
  // 41 vertical 4.73×33mm DM11 caseless blocks laid horizontally along overhead tube Y = +3.95
  // from breech drop mouth X = -21.20 rearward to X = +17.75, sitting 3.7 mm flush against g11_mag_follower (minX = 18.42)
  // while riding rigidly with g11_mag_tube's -4.20 cm floating recoil (`0.0000 cm` live penetration across f ∈ [0, 1]).
  const count = 41;
  const slots: ReadonlyMagazineRoundSlot[] = [];
  const xStart = -21.2;
  const xEnd = 17.75;
  for (let i = 0; i < count; i++) {
    const u = i / (count - 1);
    const px = xStart + (xEnd - xStart) * u;
    const pz = i === 0 ? 0 : staggeredZ(i, 0.06, 1);
    slots.push(makeSlot(px, 3.95, pz, 0, 0, -Math.PI * 0.5));
  }
  slots.push(slots[count - 1]);
  return slots;
}

function buildVss10RdStackSlots(): readonly ReadonlyMagazineRoundSlot[] {
  // 10 double-stack staggered 9×39mm SP-6 rounds inside straight-slightly-canted plum waffle magazine
  // Slot 0 anchors at `b0.nextRoundPos = [1.95, -0.75, 0]`, Slot 9 sits at Y = -7.30 (> -8.03 live follower peak).
  const count = 10;
  const slots: ReadonlyMagazineRoundSlot[] = [];
  slots.push(makeSlot(1.95, -0.75, 0, 0, 0, 0.12));
  for (let i = 1; i < count; i++) {
    const u = (i - 1) / (count - 2);
    const px = 1.9 - 0.28 * u;
    const py = -1.52 - 5.78 * u;
    const pz = staggeredZ(i, 0.22, 1);
    const rz = 0.11 - 0.04 * u;
    slots.push(makeSlot(px, py, pz, 0, 0, rz));
  }
  slots.push(slots[count - 1]);
  return slots;
}

function buildM134BeltChuteSlots(): readonly ReadonlyMagazineRoundSlot[] {
  // 8 linked 7.62×51mm NATO M80 rounds climbing the left stainless chute [-9.2, -12.6, -13.2] -> Delinker [-9.2, -1.6, -7.6]
  const count = 8;
  const slots: ReadonlyMagazineRoundSlot[] = [];
  slots.push(makeSlot(-9.2, -1.6, -7.6, 0, 0, 0));
  for (let i = 1; i < count; i++) {
    const u = (i - 1) / (count - 2);
    const py = -3.35 - 9.25 * u;
    const pz = -8.5 - 4.7 * u;
    slots.push(makeSlot(-9.2, py, pz, 0, 0, 0));
  }
  slots.push(slots[count - 1]);
  return slots;
}

function buildAn94CantedBananaSlots(): readonly ReadonlyMagazineRoundSlot[] {
  // 26 double-stack 5.45×39mm 7N6 rounds following the 15° right-canted banana arc (`CX = 20.5, R = 20.5`)
  // pivoted at `an94_mag_body` origin `[7.6, -0.35, 0]`, `rotX = -15°`, seated flush against the orange follower.
  const count = 26;
  const slots: ReadonlyMagazineRoundSlot[] = [];
  slots.push(makeSlot(7.6, -0.05, 0.12, AN94_CANT_RAD, 0, 0.15));
  const cosC = Math.cos(AN94_CANT_RAD);
  const sinC = Math.sin(AN94_CANT_RAD);
  for (let i = 1; i < count; i++) {
    const u = (i - 1) / (count - 2);
    const theta = 0.055 + u * 0.685; // ends at theta = 0.74, 3.8 mm flush above orange follower at 0.795
    const lx = 20.5 * (1 - Math.cos(theta));
    const ly = -20.5 * Math.sin(theta);
    const lz = staggeredZ(i, 0.18, 1);
    const px = 7.6 + lx;
    const py = -0.35 + ly * cosC - lz * sinC;
    const pz = ly * sinC + lz * cosC;
    const rz = 0.14 + theta * 0.78;
    slots.push(makeSlot(px, py, pz, AN94_CANT_RAD, 0, rz));
  }
  slots.push(slots[count - 1]);
  return slots;
}

export const MAGAZINE_STACK_SPECS: Readonly<
  Record<WeaponId, WeaponMagazineStackSpec>
> = {
  ak15: {
    weaponId: 'ak15',
    magBodyPartId: 'ak_mag_body',
    followerPartId: 'ak_mag_follower',
    roundCount: 21,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [5.434, -8.078, 0],
      normal: normalFromTiltZ(0.717),
    },
    slots: buildAk15BananaSlots(),
  },

  m4a1: {
    weaponId: 'm4a1',
    magBodyPartId: 'm4a1_mag_body',
    followerPartId: 'm4a1_mag_follower',
    roundCount: 20,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [2.985, -6.81, 0],
      normal: normalFromTiltZ(0.27),
    },
    slots: buildM4a1StanagSlots(),
  },

  scar: {
    weaponId: 'scar',
    magBodyPartId: 'scar_mag_body',
    followerPartId: 'scar_mag_follower',
    roundCount: 22,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.64],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [2.81, -7.503, 0],
      normal: normalFromTiltZ(0.15),
    },
    slots: buildScarStanagSlots(),
  },

  aug: {
    weaponId: 'aug',
    magBodyPartId: 'aug_mag_body',
    followerPartId: 'aug_mag_follower',
    roundCount: 20,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [-8.788, -5.917, 0],
      normal: normalFromTiltZ(0.375),
    },
    slots: buildAugWaffleSlots(0.336),
  },

  mp5: {
    weaponId: 'mp5',
    magBodyPartId: 'mp5_mag_body',
    followerPartId: 'mp5_mag_follower',
    roundCount: 20,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.54, 0.72],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [4.286, -6.518, 0],
      normal: normalFromTiltZ(0.432),
    },
    slots: buildMp5CurvedSlots(0.39),
  },

  g17: {
    weaponId: 'g17',
    magBodyPartId: 'mag_body',
    followerPartId: 'mag_follower',
    roundCount: 14,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.49,
    followerDeckPlane: {
      point: [-6.245, -6.956, 0],
      normal: normalFromTiltZ(G17_GRIP_RAD),
    },
    slots: buildRakedPistolSlots({
      count: 14,
      slot0: [-2.85, 1.05, 0],
      slot0Rz: 0.12,
      magAssembledPos: [-5.26, -4.25],
      gripAngleRad: G17_GRIP_RAD,
      localXCenter: 0.02,
      localYSlot1: 4.92,
      localYBottom: -1.96,
      topBodyRz: 0.08,
      bottomRz: -0.18,
      zHalf: 0.175,
      firstOddSign: -1,
    }),
  },

  p320: {
    weaponId: 'p320',
    magBodyPartId: 'p320_mag_body',
    followerPartId: 'p320_mag_follower',
    roundCount: 14,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.5,
    followerDeckPlane: {
      point: [-6.112, -7.243, 0],
      normal: normalFromTiltZ(P320_GRIP_RAD),
    },
    slots: buildRakedPistolSlots({
      count: 14,
      slot0: [-2.85, 1.15, 0],
      slot0Rz: 0.12,
      magAssembledPos: [-5.25, -4.59],
      gripAngleRad: P320_GRIP_RAD,
      localXCenter: 0.02,
      localYSlot1: 4.66,
      localYBottom: -1.92,
      topBodyRz: 0.07,
      bottomRz: -0.16,
      zHalf: 0.17,
      firstOddSign: -1,
    }),
  },

  deagle: {
    weaponId: 'deagle',
    magBodyPartId: 'deagle_mag_body',
    followerPartId: 'deagle_mag_follower',
    roundCount: 7,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.72],
    replenishWindow: [0.84, 0.97],
    magSubStripStartT: 0.5,
    followerDeckPlane: {
      point: [-6.196, -7.804, 0],
      normal: normalFromTiltZ(DEAGLE_GRIP_RAD),
    },
    slots: buildRakedPistolSlots({
      count: 7,
      slot0: [-4.25, 0.85, 0],
      slot0Rz: 0.1,
      magAssembledPos: [-5.35, -4.65],
      gripAngleRad: DEAGLE_GRIP_RAD,
      localXCenter: -0.34,
      localYSlot1: 4.26,
      localYBottom: -2.42,
      topBodyRz: 0.06,
      bottomRz: -0.14,
      zHalf: 0, // Authentic single-stack .50 AE column!
      firstOddSign: 1,
    }),
  },

  awm: {
    weaponId: 'awm',
    magBodyPartId: 'awm_mag_body',
    followerPartId: 'awm_mag_follower',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.68, 0.78],
    replenishWindow: [0.9, 0.98],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [1.35, -3.385, 0],
      normal: [0, 1, 0],
    },
    slots: buildStraightBoxSlots({
      count: 5,
      xCenter: 0.02,
      topY: -0.35,
      bottomY: -2.7,
      topRz: 0.05,
      bottomRz: 0.03,
      zHalf: 0.08,
      firstOddSign: 1,
    }),
  },

  m82a1: {
    weaponId: 'm82a1',
    magBodyPartId: 'm82a1_mag_body',
    followerPartId: 'm82a1_mag_follower',
    roundCount: 10,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.46, 0.72],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.48,
    followerDeckPlane: {
      point: [5.3, -6.0, 0],
      normal: normalFromTiltZ(0.05),
    },
    slots: buildStraightBoxSlots({
      count: 10,
      xCenter: 5.3,
      topY: -1.36,
      bottomY: -5.24,
      topRz: 0.05,
      bottomRz: 0.09,
      zHalf: 0.22,
      firstOddSign: 1,
    }),
  },

  p90: {
    weaponId: 'p90',
    magBodyPartId: 'p90_mag_body',
    followerPartId: 'p90_mag_follower',
    throatPartId: 'p90_helical_ramp',
    roundCount: 30,
    firingHandoffSlotIndex: 3,
    feedWindow: [0.52, 0.66],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.35,
    followerDeckPlane: {
      point: [2.825, 2.66, 0],
      normal: [-1, 0, 0],
    },
    slots: buildP90HelicalAndHorizontalSlots(2.52),
  },

  lift33: {
    weaponId: 'lift33',
    magBodyPartId: 'lift33_quiver_frame',
    followerPartId: 'lift33_quiver_latch',
    throatPartId: 'lift33_quiver_hood',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.54, 0.82],
    replenishWindow: [0.84, 0.96],
    magSubStripStartT: 0.56,
    followerDeckPlane: {
      point: [0.6, 1.0, 2.95],
      normal: [0, 0, 1],
    },
    slots: [
      makeSlot(-1.8, 1.0, 4.95, 0, 0, Math.PI * 0.5),
      makeSlot(-0.6, 1.0, 4.95, 0, 0, Math.PI * 0.5),
      makeSlot(0.6, 1.0, 4.95, 0, 0, Math.PI * 0.5),
      makeSlot(1.8, 1.0, 4.95, 0, 0, Math.PI * 0.5),
      makeSlot(3.0, 1.0, 4.95, 0, 0, Math.PI * 0.5),
      makeSlot(3.0, 1.0, 4.95, 0, 0, Math.PI * 0.5),
    ],
  },

  r500: {
    weaponId: 'r500',
    magBodyPartId: 'r500_quiver_frame',
    followerPartId: 'r500_retention_arm',
    roundCount: 3,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.66],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.35,
    followerDeckPlane: {
      point: [6.8, -6.15, 4.85],
      normal: [0, 1, 0],
    },
    slots: [
      makeSlot(6.8, -2.05, 4.85, 0, 0, 0),
      makeSlot(6.8, -3.6, 4.85, 0, 0, 0),
      makeSlot(6.8, -5.15, 4.85, 0, 0, 0),
      makeSlot(6.8, -5.15, 4.85, 0, 0, 0),
    ],
  },

  python: {
    weaponId: 'python',
    magBodyPartId: 'python_cylinder',
    followerPartId: 'python_extractor_rod',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.16, 0.28],
    replenishWindow: [0.87, 0.98],
    magSubStripStartT: 0.4,
    followerDeckPlane: {
      point: [2.2, 1.17, 0],
      normal: [-1, 0, 0],
    },
    slots: [
      // 6-chamber cylinder ring (R = 1.18 around [0.10, 1.17, 0]; 0° top chamber holds active round)
      makeSlot(0.1, 1.76, -1.022, 0, 0, 0),
      makeSlot(0.1, 0.58, -1.022, 0, 0, 0),
      makeSlot(0.1, -0.01, 0, 0, 0, 0),
      makeSlot(0.1, 0.58, 1.022, 0, 0, 0),
      makeSlot(0.1, 1.76, 1.022, 0, 0, 0),
      makeSlot(0.1, 1.76, 1.022, 0, 0, 0),
    ],
  },

  benellim4: {
    weaponId: 'benellim4',
    magBodyPartId: 'benellim4_mag_tube',
    followerPartId: 'benellim4_mag_follower',
    roundCount: 6,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.53, 0.63],
    replenishWindow: [0.93, 0.99],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [18.45, -1.25, 0],
      normal: [-1, 0, 0],
    },
    slots: [
      makeSlot(10.55, -1.25, 0.045, 0, 0, 0),
      makeSlot(11.7, -1.25, -0.045, 0, 0, 0),
      makeSlot(12.85, -1.25, 0.045, 0, 0, 0),
      makeSlot(14.0, -1.25, -0.045, 0, 0, 0),
      makeSlot(15.15, -1.25, 0.045, 0, 0, 0),
      makeSlot(16.3, -1.25, -0.045, 0, 0, 0),
      makeSlot(16.3, -1.25, -0.045, 0, 0, 0),
    ],
  },

  garand: {
    weaponId: 'garand',
    magBodyPartId: 'garand_enbloc_clip',
    followerPartId: 'garand_follower',
    roundCount: 8,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.68, 0.76],
    replenishWindow: [0.85, 0.96],
    magSubStripStartT: 0.08,
    followerDeckPlane: {
      point: [-1.4, -0.52, 0],
      normal: [0, 1, 0],
    },
    slots: [
      makeSlot(-1.38, 1.12, -0.2, 0, 0, 0.06),
      makeSlot(-1.4, 0.92, 0.22, 0, 0, 0.06),
      makeSlot(-1.4, 0.72, -0.22, 0, 0, 0.06),
      makeSlot(-1.4, 0.52, 0.22, 0, 0, 0.06),
      makeSlot(-1.4, 0.32, -0.22, 0, 0, 0.06),
      makeSlot(-1.4, 0.12, 0.22, 0, 0, 0.06),
      makeSlot(-1.4, -0.06, -0.22, 0, 0, 0.06),
      makeSlot(-1.4, -0.24, 0.22, 0, 0, 0.06),
      makeSlot(-1.4, -0.24, 0.22, 0, 0, 0.06),
    ],
  },

  m249: {
    weaponId: 'm249',
    magBodyPartId: 'm249_m27_belt',
    followerPartId: 'm249_ammo_box',
    throatPartId: 'm249_feed_tray',
    roundCount: 4,
    // Open-bolt M249: Slot 0 sits at [-0.80, 1.56, 0] (`b0.nextRoundPos`), while in live firing
    // `nextRoundRef` strips Slot 0 [0..0.215) and then indexes Slot 1 [-0.80, 1.56, -1.36] -> Z=0 [0.36..0.68]!
    firingHandoffSlotIndex: 1,
    feedWindow: [0.36, 0.68],
    replenishWindow: [0.82, 0.96],
    magSubStripStartT: 0.05,
    followerDeckPlane: {
      point: [-0.8, -1.5, -2.5],
      normal: [0, 1, 0],
    },
    slots: [
      makeSlot(-0.8, 1.56, 0, 0, 0, -0.02),
      makeSlot(-0.8, 1.5, -1.36, 0.02, 0, -0.02),
      makeSlot(-0.8, 1.2, -2.61, 0.16, 0, -0.02),
      makeSlot(-0.8, 0.62, -3.62, 0.54, 0, -0.02),
      makeSlot(-0.8, 0.62, -3.62, 0.54, 0, -0.02),
    ],
  },

  p08: {
    weaponId: 'p08',
    magBodyPartId: 'p08_mag_body',
    followerPartId: 'p08_mag_follower',
    roundCount: 8,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.5, 0.7],
    replenishWindow: [0.86, 0.97],
    magSubStripStartT: 0.44,
    followerDeckPlane: {
      point: [-6.05, -5.85, 0],
      normal: normalFromTiltZ(P08_GRIP_RAD),
    },
    slots: buildRakedPistolSlots({
      count: 8,
      slot0: [-0.95, 1.38, 0],
      slot0Rz: 0.14,
      magAssembledPos: [-4.45, -3.3],
      gripAngleRad: P08_GRIP_RAD,
      localXCenter: -0.02,
      localYSlot1: 4.58,
      localYBottom: -2.18,
      topBodyRz: 0.06,
      bottomRz: -0.26,
      zHalf: 0.055,
      firstOddSign: -1,
    }),
  },

  vector: {
    weaponId: 'vector',
    magBodyPartId: 'vector_mag_body',
    followerPartId: 'vector_mag_follower',
    roundCount: 16,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.72, 0.86],
    replenishWindow: [0.88, 0.98],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [2.937, -14.372, 0],
      normal: [Math.cos(VECTOR_MAG_RAD), Math.sin(VECTOR_MAG_RAD), 0],
    },
    slots: buildVectorMagEx2Slots(),
  },

  g11: {
    weaponId: 'g11',
    magBodyPartId: 'g11_mag_tube',
    followerPartId: 'g11_mag_follower',
    roundCount: 41,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.49, 0.62],
    replenishWindow: [0.88, 0.98],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [18.42, 3.95, 0],
      normal: [-1, 0, 0],
    },
    slots: buildG11CaselessStackSlots(),
  },

  vss: {
    weaponId: 'vss',
    magBodyPartId: 'vss_mag_body',
    followerPartId: 'vss_mag_follower',
    roundCount: 10,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.64, 0.8],
    replenishWindow: [0.88, 0.98],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [1.55, -8.45, 0],
      normal: [0.05, 0.9987, 0],
    },
    slots: buildVss10RdStackSlots(),
  },

  m134: {
    weaponId: 'm134',
    magBodyPartId: 'm134_ammo_chute',
    followerPartId: 'm134_feeder_spring',
    throatPartId: 'm134_delinker_housing',
    roundCount: 8,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.6, 0.78],
    replenishWindow: [0.88, 0.98],
    magSubStripStartT: 0.04,
    followerDeckPlane: {
      point: [-9.2, 0.25, -7.8],
      normal: [0, -1, 0],
    },
    slots: buildM134BeltChuteSlots(),
  },

  an94: {
    weaponId: 'an94',
    magBodyPartId: 'an94_mag_body',
    followerPartId: 'an94_mag_follower',
    roundCount: 26,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.5, 0.66],
    replenishWindow: [0.84, 0.96],
    magSubStripStartT: 0.34,
    followerDeckPlane: {
      point: [11.6, -15.835, 3.776],
      normal: [-0.7142, 0.6762, -0.181],
    },
    slots: buildAn94CantedBananaSlots(),
  },

  // 1:1 Main Battle Tanks (`BAY-24 ~ BAY-27`) carry sculptural 125mm/120mm/88mm rounds
  // directly inside their Blender GLB autoloader carousels / bustle racks + animated ready-round parts,
  // so small-arms instanced cartridge columns stay cleanly disabled (`roundCount: 0`, zero overlap).
  ztz99a: {
    weaponId: 'ztz99a',
    magBodyPartId: 'ztz99a_autoloader_carousel',
    followerPartId: 'ztz99a_loading_tray',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.78],
    replenishWindow: [0.84, 0.96],
    magSubStripStartT: 0.3,
    followerDeckPlane: {
      point: [22, -62, 0],
      normal: [0, 1, 0],
    },
    slots: [],
  },
  m1a2: {
    weaponId: 'm1a2',
    magBodyPartId: 'm1a2_ammo_bustle',
    followerPartId: 'm1a2_ready_round',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.76],
    replenishWindow: [0.84, 0.95],
    magSubStripStartT: 0.3,
    followerDeckPlane: {
      point: [-125, 44, 0],
      normal: [1, 0, 0],
    },
    slots: [],
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    magBodyPartId: 'leo_ammo_bustle',
    followerPartId: 'leo_ready_round',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.76],
    replenishWindow: [0.84, 0.95],
    magSubStripStartT: 0.3,
    followerDeckPlane: {
      point: [-120, 74, 0],
      normal: [1, 0, 0],
    },
    slots: [],
  },
  tiger1: {
    weaponId: 'tiger1',
    magBodyPartId: 'tiger_ammo_racks',
    followerPartId: 'tiger_ready_round',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.56, 0.8],
    replenishWindow: [0.86, 0.96],
    magSubStripStartT: 0.3,
    followerDeckPlane: {
      point: [-20, 48, 0],
      normal: [0, 1, 0],
    },
    slots: [],
  },
  winchester1894: {
    weaponId: 'winchester1894',
    magBodyPartId: 'win94_mag_tube',
    followerPartId: 'win94_mag_follower',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.56, 0.66],
    replenishWindow: [0.88, 0.96],
    magSubStripStartT: 0.36,
    followerDeckPlane: {
      point: [24.4, -0.35, 0],
      normal: [-1, 0, 0],
    },
    slots: [
      makeSlot(9.0, -0.35, 0.045, 0, 0, 0),
      makeSlot(12.3, -0.35, -0.045, 0, 0, 0),
      makeSlot(15.6, -0.35, 0.045, 0, 0, 0),
      makeSlot(18.9, -0.35, -0.045, 0, 0, 0),
      makeSlot(22.2, -0.35, 0.045, 0, 0, 0),
      makeSlot(22.2, -0.35, 0.045, 0, 0, 0),
    ],
  },
  rem870: {
    weaponId: 'rem870',
    magBodyPartId: 'rem870_mag_tube',
    followerPartId: 'rem870_mag_follower',
    roundCount: 4,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.52, 0.63],
    replenishWindow: [0.89, 0.97],
    magSubStripStartT: 0.32,
    followerDeckPlane: {
      point: [16.35, -1.25, 0],
      normal: [-1, 0, 0],
    },
    slots: [
      makeSlot(10.6, -1.25, 0.045, 0, 0, 0),
      makeSlot(12.0, -1.25, -0.045, 0, 0, 0),
      makeSlot(13.4, -1.25, 0.045, 0, 0, 0),
      makeSlot(14.8, -1.25, -0.045, 0, 0, 0),
      makeSlot(14.8, -1.25, -0.045, 0, 0, 0),
    ],
  },
  m1911: {
    weaponId: 'm1911',
    magBodyPartId: 'm1911_mag_body',
    followerPartId: 'm1911_mag_follower',
    roundCount: 7,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.54, 0.72],
    replenishWindow: [0.85, 0.97],
    magSubStripStartT: 0.42,
    followerDeckPlane: {
      point: [-5.76, -6.96, 0],
      normal: [0.309017, 0.951057, 0],
    },
    slots: buildRakedPistolSlots({
      count: 7,
      slot0: [-3.27, 0.68, 0],
      slot0Rz: 0.16,
      magAssembledPos: [-4.65, -3.55],
      gripAngleRad: (-18 * Math.PI) / 180,
      localXCenter: 0.0,
      localYSlot1: 3.2,
      localYBottom: -2.9,
      topBodyRz: 0.12,
      bottomRz: 0.08,
      zHalf: 0.0,
      firstOddSign: 1,
    }),
  },
  mg42: {
    weaponId: 'mg42',
    magBodyPartId: 'mg42_ammo_drum',
    followerPartId: 'mg42_ammo_belt',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.38, 0.72],
    replenishWindow: [0.84, 0.96],
    magSubStripStartT: 0.2,
    followerDeckPlane: {
      point: [11.8, -1.8, -6.2],
      normal: [0, 1, 0],
    },
    slots: [],
  },
  k98k: {
    weaponId: 'k98k',
    magBodyPartId: 'k98k_trigger_guard',
    throatPartId: 'k98k_receiver',
    followerPartId: 'k98k_mag_follower',
    roundCount: 5,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.62, 0.78],
    replenishWindow: [0.88, 0.96],
    magSubStripStartT: 0.22,
    followerDeckPlane: {
      point: [1.1, -2.75, 0],
      normal: [0, 1, 0],
    },
    slots: buildStraightBoxSlots({
      count: 5,
      xCenter: 1.05,
      topY: 0.05,
      bottomY: -2.25,
      topRz: 0.06,
      bottomRz: 0.03,
      zHalf: 0.26,
      firstOddSign: 1,
    }),
  },
  thompson: {
    weaponId: 'thompson',
    magBodyPartId: 'thompson_drum_mag',
    followerPartId: 'thompson_drum_rotor',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.46, 0.78],
    replenishWindow: [0.85, 0.96],
    magSubStripStartT: 0.22,
    followerDeckPlane: {
      point: [7.8, -7.8, 0],
      normal: [0, 1, 0],
    },
    slots: [],
  },
  gau8: {
    weaponId: 'gau8',
    magBodyPartId: 'gau8_ammo_drum',
    followerPartId: 'gau8_ammo_belt_stack',
    roundCount: 0,
    firingHandoffSlotIndex: 0,
    feedWindow: [0.46, 0.76],
    replenishWindow: [0.86, 0.96],
    magSubStripStartT: 0.24,
    followerDeckPlane: {
      point: [-165, -24, 0],
      normal: [0, 1, 0],
    },
    slots: [],
  },
  ...buildCentennialMagazineStackSpecs(),
};

/**
 * Exhibits whose ammunition stacks/drums/belts/autoloaders are sculpted natively inside
 * their flagship Blender Draco GLB assemblies (`roundCount: 0` in instanced column table
 * to avoid duplicate overlapping geometry while maintaining exact BOM part bindings).
 */
export interface SculpturalAmmoExhibitMeta {
  readonly weaponId: WeaponId;
  readonly capacityRounds: number;
  readonly systemEn: string;
  readonly systemZh: string;
}

export const SCULPTURAL_AMMO_EXHIBITS: Readonly<
  Partial<Record<WeaponId, SculpturalAmmoExhibitMeta>>
> = {
  ztz99a: {
    weaponId: 'ztz99a',
    capacityRounds: 22,
    systemEn: '22-Rd Floor Carousel Autoloader (125mm Separate-Loading)',
    systemZh: '22 发底置转盘自动装弹机（125mm 分装式弹药）',
  },
  m1a2: {
    weaponId: 'm1a2',
    capacityRounds: 42,
    systemEn: 'Turret Bustle Blast-Door Ready Rack (120mm NATO)',
    systemZh: '隔爆泄压尾舱待发弹药架（120mm 整装弹）',
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    capacityRounds: 42,
    systemEn: '15-Rd Bustle Ready Rack + 27-Rd Hull Stowage (120mm L/55A1)',
    systemZh: '15 发尾舱待发架 + 27 发车体前部弹药库（120mm）',
  },
  tiger1: {
    weaponId: 'tiger1',
    capacityRounds: 92,
    systemEn: '92-Rd Sponson & Hull Racks (88×571mmR PzGr. 39)',
    systemZh: '92 发翼子板与车体侧甲弹药架（88mm 穿甲弹）',
  },
  mg42: {
    weaponId: 'mg42',
    capacityRounds: 50,
    systemEn: '50-Rd Gurttrommel 34 Saddle Drum & Gurt 34 Steel Belt (7.92×57mm)',
    systemZh: '50 发 Gurttrommel 34 侧挂弹鼓与 Gurt 34 金属弹链（7.92×57mm）',
  },
  thompson: {
    weaponId: 'thompson',
    capacityRounds: 50,
    systemEn: '50-Rd L-Type Clockwork Spiral Drum (0.45 ACP)',
    systemZh: '50 发 L 型发条蜗壳螺旋弹鼓（.45 ACP）',
  },
  gau8: {
    weaponId: 'gau8',
    capacityRounds: 1150,
    systemEn: '1,150-Rd Closed-Loop Linkless Helical Drum & Chute (30×173mm)',
    systemZh: '1,150 发闭环无链螺旋弹鼓与输弹导槽（30×173mm）',
  },
  ...buildCentennialSculpturalAmmoMeta(),
};

/** Maximum instanced capacity needed across all 34 exhibits (`roundCount + 1` replacement) */
export const MAX_MAGAZINE_STACK_INSTANCES = 48;

/**
 * Computes normalized `[0, 1]` upward magazine stack shift at firing progress `f ∈ [0, 1]`.
 * Zero heap allocations.
 */
export function computeMagazineFeedShift(
  weaponId: WeaponId,
  fireProgress: number
): number {
  const win = MAGAZINE_STACK_SPECS[weaponId].feedWindow;
  return seg(clamp01(fireProgress), win[0], win[1]);
}

/**
 * Computes normalized `[0, 1]` post-retraction bottom replacement emergence alpha
 * after `mag_follower` settles back to rest (`f ∈ replenishWindow`). Zero heap allocations.
 */
export function computeMagazineReplenishAlpha(
  weaponId: WeaponId,
  fireProgress: number
): number {
  const win = MAGAZINE_STACK_SPECS[weaponId].replenishWindow;
  return seg(clamp01(fireProgress), win[0], win[1]);
}

/**
 * Zero-GC 60fps cartridge slot evaluator.
 * - For `slotIndex < spec.roundCount`: shifts `slots[slotIndex] -> slots[slotIndex - 1]` by `feedShift01 ∈ [0, 1]`.
 * - For `slotIndex === spec.roundCount`: evaluates replacement round at `slots[roundCount - 1]` with
 *   `scaleMult = smoothstep01(feedShift01)` (pass `computeMagazineReplenishAlpha(weaponId, f)` in live firing).
 */
export function evaluateMagazineRoundSlotInto(
  weaponId: WeaponId,
  slotIndex: number,
  feedShift01: number,
  out: MutableMagazineRoundPose
): MutableMagazineRoundPose {
  const spec = MAGAZINE_STACK_SPECS[weaponId];
  const slots = spec.slots;
  if (spec.roundCount <= 0 || slots.length === 0) {
    out.px = 0;
    out.py = 0;
    out.pz = 0;
    out.rx = 0;
    out.ry = 0;
    out.rz = 0;
    out.scaleMult = 0;
    return out;
  }
  const maxIdx = slots.length - 1;
  const clampedIdx =
    slotIndex < 0 ? 0 : slotIndex > maxIdx ? maxIdx : slotIndex;
  const shift = clamp01(feedShift01);

  if (clampedIdx >= spec.roundCount) {
    const target = slots[spec.roundCount - 1];
    out.px = target.px;
    out.py = target.py;
    out.pz = target.pz;
    out.rx = target.rx;
    out.ry = target.ry;
    out.rz = target.rz;
    out.scaleMult = shift <= 1e-6 ? 0 : smoothstep01(shift);
    return out;
  }

  if (clampedIdx === 0 || shift <= 1e-6) {
    const s = slots[clampedIdx];
    out.px = s.px;
    out.py = s.py;
    out.pz = s.pz;
    out.rx = s.rx;
    out.ry = s.ry;
    out.rz = s.rz;
    out.scaleMult = 1;
    return out;
  }

  const from = slots[clampedIdx];
  const to = slots[clampedIdx - 1];
  out.px = from.px + (to.px - from.px) * shift;
  out.py = from.py + (to.py - from.py) * shift;
  out.pz = from.pz + (to.pz - from.pz) * shift;
  out.rx = from.rx + (to.rx - from.rx) * shift;
  out.ry = from.ry + (to.ry - from.ry) * shift;
  out.rz = from.rz + (to.rz - from.rz) * shift;
  out.scaleMult = 1;
  return out;
}

import type { WeaponCameraMap } from '../types';
import type { CentennialWeaponBlueprint } from './centennialTypes';

// ============================================================================
// Digital Armory 3D — Centennial Shared Pure Layout Math (ZERO Three.js Import)
// ----------------------------------------------------------------------------
// Single Source of Truth (SSOT) for 20-part assembled coordinates, explosion
// vectors, bore/muzzle/chamber anchors, stage floor (`gridY`), and all 7
// camera presets across all 28 Centennial archetypes (small arms, archery,
// 1:1 Main Battle Tanks, and 1:1 aviation / heavy artillery).
//
// Imported cleanly by BOTH:
//   - `centennialGeometryFactory.ts` (Web Worker geometry builder)
//   - `centennialPluginFactory.ts` (Main-thread runtime plugin & manifests)
// with ZERO Three.js runtime overhead in catalog / UI chunks.
// ============================================================================

/** Canonical 20-part slot contract shared 1:1 across geometry & plugin factories. */
export const CENTENNIAL_PART_SLOTS = [
  'receiver',
  'barrel',
  'muzzle',
  'bolt_carrier',
  'bolt',
  'recoil_spring',
  'handguard',
  'stock',
  'grip',
  'optic',
  'gas_system',
  'mount_rail',
  'trigger',
  'hammer',
  'hammer_spring',
  'selector',
  'mag_body',
  'follower',
  'mag_spring',
  'mag_base',
] as const;

export type CentennialPartSlot = (typeof CENTENNIAL_PART_SLOTS)[number];

export type Vec3Tuple = [number, number, number];

export interface CentennialPartDims {
  readonly receiverLen: number;
  readonly receiverH: number;
  readonly receiverW: number;
  readonly barrelLen: number;
  readonly barrelBreechR: number;
  readonly barrelMuzzleR: number;
  readonly muzzleLen: number;
  readonly handguardLen: number;
  readonly handguardH: number;
  readonly handguardW: number;
  readonly stockLen: number;
  readonly stockH: number;
  readonly stockW: number;
  readonly gripLen: number;
  readonly gripH: number;
  readonly gripW: number;
  readonly boltLen: number;
  readonly boltR: number;
  readonly magH: number;
  readonly magW: number;
  readonly magT: number;
  readonly opticLen: number;
  readonly springLen: number;
  readonly springR: number;
  /** Nominal 1:1 meter-scale factor (cm) for heavy armor MBTs (`~90..122`). */
  readonly armorScale: number;
  /** Nominal span (cm) for archery limbs / strings or heavy ordnance carriage. */
  readonly specialSpan: number;
}

export interface CentennialLayoutResult {
  readonly sceneScale: number;
  readonly dims: CentennialPartDims;
  readonly assembledPos: Record<CentennialPartSlot, Vec3Tuple>;
  readonly explodeOffset: Record<CentennialPartSlot, Vec3Tuple>;
  readonly muzzlePos: Vec3Tuple;
  readonly chamberGlowPos: Vec3Tuple;
  readonly boreY: number;
  readonly gridY: number;
  readonly boundsMin: Vec3Tuple;
  readonly boundsMax: Vec3Tuple;
  readonly cameraPresets: WeaponCameraMap;
}

function clamp(v: number, lo: number, hi: number): number {
  if (!Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, v));
}

function round2(v: number): number {
  return Math.round(v * 100) / 100;
}

function v3(x: number, y: number, z: number): Vec3Tuple {
  return [round2(x), round2(y), round2(z)];
}

/** Returns canonical part ID `${weaponId}_${slot}` for any Centennial exhibit. */
export function centennialPartId(
  weaponId: string,
  slot: CentennialPartSlot
): string {
  return `${weaponId}_${slot}`;
}

function computeCameraPresetsFromBounds(
  boundsMin: Vec3Tuple,
  boundsMax: Vec3Tuple,
  chamberGlowPos: Vec3Tuple,
  muzzlePos: Vec3Tuple,
  boreY: number,
  mode: 'small_arm' | 'pistol' | 'archery_vert' | 'mbt' | 'ordnance'
): WeaponCameraMap {
  const cx = (boundsMin[0] + boundsMax[0]) * 0.5;
  const cy = (boundsMin[1] + boundsMax[1]) * 0.5;
  const spanX = Math.max(12, boundsMax[0] - boundsMin[0]);
  const spanY = Math.max(8, boundsMax[1] - boundsMin[1]);
  const spanZ = Math.max(4, boundsMax[2] - boundsMin[2]);

  if (mode === 'mbt') {
    const r = Math.max(spanX * 0.54, spanY * 1.1, spanZ * 0.95, 420);
    return {
      armory_showcase: {
        pos: v3(cx + r * 1.18, cy + r * 0.52, r * 1.62),
        target: v3(cx + r * 0.08, cy - r * 0.04, 0),
      },
      iso: {
        pos: v3(cx + r * 1.08, cy + r * 0.62, r * 1.72),
        target: v3(cx + r * 0.1, cy - r * 0.02, 0),
      },
      right: {
        pos: v3(cx + r * 0.08, cy + r * 0.08, r * 2.28),
        target: v3(cx + r * 0.08, cy - r * 0.02, 0),
      },
      left: {
        pos: v3(cx + r * 0.08, cy + r * 0.08, -r * 2.28),
        target: v3(cx + r * 0.08, cy - r * 0.02, 0),
      },
      top: {
        pos: v3(cx + r * 0.08, cy + r * 2.35, r * 0.28),
        target: v3(cx + r * 0.08, cy, 0),
      },
      cutaway_focus: {
        pos: v3(chamberGlowPos[0] + r * 0.14, boreY + r * 0.18, r * 0.96),
        target: v3(chamberGlowPos[0] - r * 0.06, boreY - r * 0.12, 0),
      },
      firing_view: {
        pos: v3(cx + r * 0.35, boreY + r * 0.22, r * 1.38),
        target: v3((chamberGlowPos[0] + muzzlePos[0]) * 0.45, boreY, 0),
      },
    };
  }

  if (mode === 'ordnance') {
    const r = Math.max(spanX * 0.54, spanY * 0.85, 110);
    return {
      armory_showcase: {
        pos: v3(cx + r * 1.05, cy + r * 0.42, r * 1.65),
        target: v3(cx + r * 0.05, cy - r * 0.05, 0),
      },
      iso: {
        pos: v3(cx + r * 0.96, cy + r * 0.52, r * 1.78),
        target: v3(cx + r * 0.05, cy - r * 0.03, 0),
      },
      right: {
        pos: v3(cx, cy + r * 0.04, r * 2.15),
        target: v3(cx, cy - r * 0.03, 0),
      },
      left: {
        pos: v3(cx, cy + r * 0.04, -r * 2.15),
        target: v3(cx, cy - r * 0.03, 0),
      },
      top: {
        pos: v3(cx, cy + r * 2.22, r * 0.22),
        target: v3(cx, cy, 0),
      },
      cutaway_focus: {
        pos: v3(chamberGlowPos[0] + r * 0.22, boreY + r * 0.16, r * 0.78),
        target: v3(chamberGlowPos[0], boreY, 0),
      },
      firing_view: {
        pos: v3(cx + r * 0.48, boreY + r * 0.22, r * 1.38),
        target: v3((chamberGlowPos[0] + muzzlePos[0]) * 0.48, boreY, 0),
      },
    };
  }

  if (mode === 'archery_vert') {
    const r = Math.max(spanY * 0.68, spanX * 0.72, 38);
    return {
      armory_showcase: {
        pos: v3(cx + r * 0.45, cy + r * 0.12, r * 2.15),
        target: v3(cx, cy - r * 0.05, 0),
      },
      iso: {
        pos: v3(cx + r * 0.52, cy + r * 0.26, r * 1.92),
        target: v3(cx, cy, 0),
      },
      right: {
        pos: v3(cx, cy, r * 2.02),
        target: v3(cx, cy, 0),
      },
      left: {
        pos: v3(cx, cy, -r * 2.02),
        target: v3(cx, cy, 0),
      },
      top: {
        pos: v3(cx, cy + r * 2.12, r * 0.22),
        target: v3(cx, cy, 0),
      },
      cutaway_focus: {
        pos: v3(cx + r * 0.22, boreY + r * 0.08, r * 0.72),
        target: v3(cx, boreY, 0),
      },
      firing_view: {
        pos: v3(cx + r * 0.36, boreY + r * 0.14, r * 1.82),
        target: v3(cx + r * 0.15, boreY, 0),
      },
    };
  }

  if (mode === 'pistol') {
    const r = Math.max(spanX * 0.62, spanY * 0.78, 16);
    return {
      armory_showcase: {
        pos: v3(cx + r * 0.54, cy + r * 0.14, r * 1.98),
        target: v3(cx, cy - r * 0.18, 0),
      },
      iso: {
        pos: v3(cx + r * 0.68, cy + r * 0.38, r * 2.15),
        target: v3(cx, cy - r * 0.04, 0),
      },
      right: {
        pos: v3(cx, cy + r * 0.04, r * 2.12),
        target: v3(cx, cy - r * 0.04, 0),
      },
      left: {
        pos: v3(cx, cy + r * 0.04, -r * 2.12),
        target: v3(cx, cy - r * 0.04, 0),
      },
      top: {
        pos: v3(cx, cy + r * 2.28, r * 0.24),
        target: v3(cx, cy, 0),
      },
      cutaway_focus: {
        pos: v3(chamberGlowPos[0] - r * 0.12, boreY + r * 0.08, r * 0.76),
        target: v3(chamberGlowPos[0] - r * 0.18, boreY - r * 0.06, 0),
      },
      firing_view: {
        pos: v3(cx + r * 0.44, boreY + r * 0.18, r * 1.85),
        target: v3((chamberGlowPos[0] + muzzlePos[0]) * 0.48, boreY - r * 0.04, 0),
      },
    };
  }

  // Standard rifles, battle rifles, bullpups, LMGs, heavy MGs, SMGs, snipers, shotguns, crossbow
  const r = Math.max(spanX * 0.54, spanY * 0.92, 22);
  return {
    armory_showcase: {
      pos: v3(cx + r * 0.46, cy + r * 0.12, r * 2.15),
      target: v3(cx, cy - r * 0.2, 0),
    },
    iso: {
      pos: v3(cx + r * 0.44, cy + r * 0.28, r * 1.68),
      target: v3(cx + r * 0.06, cy - r * 0.04, 0),
    },
    right: {
      pos: v3(cx + r * 0.04, cy - r * 0.02, r * 1.66),
      target: v3(cx + r * 0.04, cy - r * 0.04, 0),
    },
    left: {
      pos: v3(cx + r * 0.04, cy - r * 0.02, -r * 1.66),
      target: v3(cx + r * 0.04, cy - r * 0.04, 0),
    },
    top: {
      pos: v3(cx + r * 0.04, cy + r * 1.82, r * 0.16),
      target: v3(cx + r * 0.04, cy, 0),
    },
    cutaway_focus: {
      pos: v3(chamberGlowPos[0] + r * 0.08, boreY + r * 0.12, r * 0.66),
      target: v3(chamberGlowPos[0] - r * 0.06, boreY, 0),
    },
    firing_view: {
      pos: v3(cx + r * 0.34, boreY + r * 0.16, r * 1.56),
      target: v3((chamberGlowPos[0] + muzzlePos[0]) * 0.42, boreY - r * 0.04, 0),
    },
  };
}

// ============================================================================
// Family Layout Builders
// ============================================================================

function computeMbtLayout(bp: CentennialWeaponBlueprint): CentennialLayoutResult {
  const isWwii = bp.archetype === 'mbt_wwii';
  const isFrontEngine = bp.id === 'merkava4';
  const s = clamp(bp.cad.receiverLenCm / 6.8, 86, 124);
  const barL = clamp(bp.cad.barrelLenCm, 380, 680);
  const breechR = s * 0.155;
  const muzzleR = s * 0.092;
  const muzzleLen = bp.cad.muzzleStyle === 'tank_evacuator' ? barL * 0.17 : s * 0.28;

  // Anchor bottom of tracks dead-flush onto Heavy Armor Hangar floor (Y = -120 cm)
  const tracksY = -119.5 + 0.51 * s;
  const hullY = tracksY + 0.36 * s;
  const turretY = hullY + 0.575 * s + (isWwii ? 0.31 * s : 0.35 * s);
  const boreY = turretY + (isWwii ? 0.03 * s : 0.02 * s);
  const turretX = isFrontEngine ? -s * 0.58 : s * 0.16;
  const mantletFrontX = turretX + (isWwii ? s * 1.88 : s * 2.28);
  const barrelX = mantletFrontX - s * 0.24 + barL * 0.5;
  const barrelTipX = barrelX + barL * 0.5;
  const evacuatorX =
    bp.cad.muzzleStyle === 'tank_evacuator'
      ? mantletFrontX + barL * 0.46
      : barrelTipX - muzzleLen * 0.2;
  const engineX = isFrontEngine ? s * 1.88 : -s * 1.86;

  const dims: CentennialPartDims = {
    receiverLen: s * 6.8,
    receiverH: s * 1.15,
    receiverW: s * 3.35,
    barrelLen: barL,
    barrelBreechR: breechR,
    barrelMuzzleR: muzzleR,
    muzzleLen,
    handguardLen: s * 1.45,
    handguardH: s * 0.46,
    handguardW: s * 2.95,
    stockLen: s * 1.15,
    stockH: s * 0.52,
    stockW: s * 2.55,
    gripLen: s * 1.65,
    gripH: s * 0.78,
    gripW: s * 1.15,
    boltLen: s * 1.45,
    boltR: s * 0.32,
    magH: s * 0.34,
    magW: s * 1.9,
    magT: s * 1.9,
    opticLen: s * 0.72,
    springLen: s * 1.15,
    springR: s * 0.16,
    armorScale: s,
    specialSpan: s * 6.8,
  };

  const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, hullY, 0),
    barrel: v3(barrelX, boreY, 0),
    muzzle: v3(evacuatorX, boreY + (bp.cad.muzzleStyle === 'tank_evacuator' ? muzzleR * 0.18 : 0), 0),
    bolt_carrier: v3(turretX, turretY, 0),
    bolt: v3(turretX + s * 0.12, boreY, 0),
    recoil_spring: v3(turretX + s * 0.85, boreY - s * 0.16, 0),
    handguard: v3(s * 2.45, hullY + s * 0.32, 0),
    stock: v3(-s * 2.75, hullY + s * 0.36, 0),
    grip: v3(engineX, hullY - s * 0.04, 0),
    optic: v3(turretX - s * 0.24, turretY + (isWwii ? s * 0.72 : s * 0.62), -s * 0.42),
    gas_system: v3(0, tracksY, 0),
    mount_rail: v3(0, hullY - s * 0.06, 0),
    trigger: v3(turretX + s * 0.35, boreY - s * 0.12, s * 0.36),
    hammer: v3(turretX - s * 0.25, boreY - s * 0.06, 0),
    hammer_spring: v3(turretX - s * 0.28, boreY - s * 0.28, s * 0.22),
    selector: v3(turretX - s * 0.55, turretY + s * 0.12, s * 0.48),
    mag_body: v3(turretX - (bp.cad.magStyle === 'bustle' ? s * 1.15 : 0), bp.cad.magStyle === 'bustle' ? turretY : hullY - s * 0.06, 0),
    follower: v3(turretX - s * 0.38, hullY + s * 0.34, 0),
    mag_spring: v3(turretX, hullY - s * 0.34, 0),
    mag_base: v3(turretX, hullY - s * 0.48, 0),
  };

  const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(s * 2.6, s * 1.25, 0),
    muzzle: v3(s * 3.8, s * 1.5, 0),
    bolt_carrier: v3(0, s * 2.15, 0),
    bolt: v3(-s * 0.9, s * 1.55, 0),
    recoil_spring: v3(s * 0.7, s * 1.3, s * 0.8),
    handguard: v3(s * 2.2, s * 0.65, 0),
    stock: v3(-s * 2.2, s * 0.9, 0),
    grip: v3(isFrontEngine ? s * 1.4 : -s * 1.4, s * 1.4, 0),
    optic: v3(-s * 0.4, s * 3.1, -s * 0.6),
    gas_system: v3(0, -s * 1.05, 0),
    mount_rail: v3(0, -s * 0.3, s * 1.65),
    trigger: v3(s * 0.5, s * 1.1, s * 1.1),
    hammer: v3(-s * 0.6, s * 1.25, -s * 0.7),
    hammer_spring: v3(-s * 0.7, s * 0.95, s * 0.95),
    selector: v3(-s * 0.9, s * 2.6, s * 0.9),
    mag_body: v3(0, -s * 1.55, 0),
    follower: v3(-s * 0.6, s * 0.75, -s * 1.1),
    mag_spring: v3(0, -s * 2.0, s * 0.6),
    mag_base: v3(0, -s * 2.45, 0),
  };

  const muzzlePos = v3(barrelTipX + s * 0.14, boreY, 0);
  const chamberGlowPos = v3(turretX + s * 0.48, boreY, 0);
  const boundsMin = v3(-s * 3.6, -120, -s * 1.95);
  const boundsMax = v3(barrelTipX + s * 0.25, turretY + s * 1.15, s * 1.95);

  return {
    sceneScale: 1,
    dims,
    assembledPos,
    explodeOffset,
    muzzlePos,
    chamberGlowPos,
    boreY: round2(boreY),
    gridY: -121.0,
    boundsMin,
    boundsMax,
    cameraPresets: computeCameraPresetsFromBounds(
      boundsMin,
      boundsMax,
      chamberGlowPos,
      muzzlePos,
      boreY,
      'mbt'
    ),
  };
}

function computeOrdnanceLayout(
  bp: CentennialWeaponBlueprint
): CentennialLayoutResult {
  if (bp.archetype === 'rotary_cannon') {
    // 1:1 GE M61A1 Vulcan 20mm six-barrel fighter autocannon
    const barL = clamp(bp.cad.barrelLenCm, 120, 175);
    const recL = clamp(bp.cad.receiverLenCm, 44, 64);
    const recH = clamp(bp.cad.receiverHeightCm, 22, 30);
    const recW = recH;
    const pitchR = Math.max(3.8, barL * 0.038);
    const boreY = 0;
    const recX = -32;
    const barrelX = recX + recL * 0.5 - 6 + barL * 0.5;
    const barrelTipX = barrelX + barL * 0.5;
    const muzzleLen = 10;

    const dims: CentennialPartDims = {
      receiverLen: recL,
      receiverH: recH,
      receiverW: recW,
      barrelLen: barL,
      barrelBreechR: pitchR * 0.38,
      barrelMuzzleR: pitchR * 0.3,
      muzzleLen,
      handguardLen: 26,
      handguardH: recH * 0.85,
      handguardW: recW * 0.85,
      stockLen: 20,
      stockH: recH * 0.72,
      stockW: recW * 0.72,
      gripLen: 18,
      gripH: 14,
      gripW: 12,
      boltLen: recL * 0.78,
      boltR: recH * 0.22,
      magH: 42,
      magW: 48,
      magT: 30,
      opticLen: 16,
      springLen: 22,
      springR: 2.2,
      armorScale: 100,
      specialSpan: barL,
    };

    const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(recX, boreY, 0),
      barrel: v3(barrelX, boreY, 0),
      muzzle: v3(barrelTipX - 6, boreY, 0),
      bolt_carrier: v3(recX + 2, boreY, 0),
      bolt: v3(recX + 8, boreY + pitchR, 0),
      recoil_spring: v3(recX - 6, boreY - pitchR * 0.85, 0),
      handguard: v3(recX + recL * 0.5 + 14, boreY, 0),
      stock: v3(recX - recL * 0.5 - 8, boreY, 0),
      grip: v3(recX - 10, boreY - recH * 0.58, 0),
      optic: v3(recX + 4, boreY + recH * 0.58, 0),
      gas_system: v3(recX - 4, boreY + recH * 0.42, recW * 0.54),
      mount_rail: v3(recX + 12, boreY - recH * 0.62, 0),
      trigger: v3(recX - 14, boreY + recH * 0.44, -recW * 0.45),
      hammer: v3(recX + 14, boreY + pitchR * 0.8, 0),
      hammer_spring: v3(recX + 12, boreY + pitchR * 1.15, 2.2),
      selector: v3(recX - 18, boreY + recH * 0.2, recW * 0.55),
      mag_body: v3(recX - 42, boreY - 22, 0),
      follower: v3(recX - 14, boreY - 14, 0),
      mag_spring: v3(recX - 42, boreY - 22, 0),
      mag_base: v3(recX - 66, boreY - 22, 0),
    };

    const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(0, 0, 0),
      barrel: v3(62, 0, 0),
      muzzle: v3(96, 0, 0),
      bolt_carrier: v3(18, 28, 0),
      bolt: v3(28, 38, 12),
      recoil_spring: v3(-16, -24, 14),
      handguard: v3(36, 20, 0),
      stock: v3(-32, 12, 0),
      grip: v3(-10, -28, 16),
      optic: v3(6, 36, 0),
      gas_system: v3(-8, 26, 26),
      mount_rail: v3(14, -34, 0),
      trigger: v3(-20, 24, -22),
      hammer: v3(22, 32, -14),
      hammer_spring: v3(22, 40, 14),
      selector: v3(-26, 16, 24),
      mag_body: v3(-48, -32, 0),
      follower: v3(-16, -26, -14),
      mag_spring: v3(-56, -42, 16),
      mag_base: v3(-74, -32, 0),
    };

    const muzzlePos = v3(barrelTipX + 2, boreY, 0);
    const chamberGlowPos = v3(recX + recL * 0.35, boreY, 0);
    const boundsMin = v3(recX - 72, -46, -26);
    const boundsMax = v3(barrelTipX + 6, 30, 26);

    return {
      sceneScale: 1,
      dims,
      assembledPos,
      explodeOffset,
      muzzlePos,
      chamberGlowPos,
      boreY,
      gridY: -50.0,
      boundsMin,
      boundsMax,
      cameraPresets: computeCameraPresetsFromBounds(
        boundsMin,
        boundsMax,
        chamberGlowPos,
        muzzlePos,
        boreY,
        'ordnance'
      ),
    };
  }

  if (bp.archetype === 'aa_autocannon') {
    // 1:1 Bofors 40mm L/60 Anti-Aircraft Autocannon anchored to -120 cm hangar floor
    const carriageL = 168;
    const carriageY = -119.5 + carriageL * 0.34;
    const boreY = carriageY + carriageL * 0.16;
    const recL = 96;
    const recH = 26;
    const recW = 24;
    const barL = clamp(bp.cad.barrelLenCm, 180, 245);
    const recX = -18;
    const barrelX = recX + recL * 0.5 - 12 + barL * 0.5;
    const barrelTipX = barrelX + barL * 0.5;
    const muzzleLen = 22;

    const dims: CentennialPartDims = {
      receiverLen: recL,
      receiverH: recH,
      receiverW: recW,
      barrelLen: barL,
      barrelBreechR: 7.4,
      barrelMuzzleR: 4.1,
      muzzleLen,
      handguardLen: 72,
      handguardH: 20,
      handguardW: 20,
      stockLen: 42,
      stockH: 24,
      stockW: 22,
      gripLen: 20,
      gripH: 22,
      gripW: 16,
      boltLen: 44,
      boltR: 7.2,
      magH: 38,
      magW: 32,
      magT: 14,
      opticLen: 34,
      springLen: 82,
      springR: 8.6,
      armorScale: 100,
      specialSpan: carriageL,
    };

    const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(recX, boreY, 0),
      barrel: v3(barrelX, boreY, 0),
      muzzle: v3(barrelTipX + muzzleLen * 0.42, boreY, 0),
      bolt_carrier: v3(recX - 6, boreY, 0),
      bolt: v3(recX - 24, boreY, 0),
      recoil_spring: v3(recX + recL * 0.5 + 34, boreY, 0),
      handguard: v3(recX + recL * 0.5 + 34, boreY, 0),
      stock: v3(recX - recL * 0.5 - 16, boreY - 4, 0),
      grip: v3(recX - 22, boreY - 22, 22),
      optic: v3(recX + 6, boreY + 26, -24),
      gas_system: v3(recX + 12, boreY - 18, 0),
      mount_rail: v3(recX + 4, carriageY, 0),
      trigger: v3(recX - 26, boreY - 20, -20),
      hammer: v3(recX - 30, boreY + 4, 0),
      hammer_spring: v3(recX - 36, boreY - 8, 0),
      selector: v3(recX - 18, boreY - 4, recW * 0.62),
      mag_body: v3(recX + 4, boreY + recH * 0.5 + 20, 0),
      follower: v3(recX + 4, boreY + recH * 0.5 + 4, 0),
      mag_spring: v3(recX + 4, boreY + recH * 0.5 + 12, 8),
      mag_base: v3(recX + 4, boreY + recH * 0.5 + 40, 0),
    };

    const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(0, 0, 0),
      barrel: v3(96, 12, 0),
      muzzle: v3(145, 16, 0),
      bolt_carrier: v3(-26, 26, 0),
      bolt: v3(-56, 22, 0),
      recoil_spring: v3(56, 36, 0),
      handguard: v3(52, -26, 0),
      stock: v3(-52, -16, 0),
      grip: v3(-24, -22, 42),
      optic: v3(8, 52, -46),
      gas_system: v3(18, -36, 0),
      mount_rail: v3(0, -48, 0),
      trigger: v3(-32, -26, -40),
      hammer: v3(-48, 34, -18),
      hammer_spring: v3(-58, 12, 18),
      selector: v3(-24, 10, 38),
      mag_body: v3(8, 68, 0),
      follower: v3(8, 42, -18),
      mag_spring: v3(8, 54, 24),
      mag_base: v3(8, 92, 0),
    };

    const muzzlePos = v3(barrelTipX + muzzleLen * 0.94, boreY, 0);
    const chamberGlowPos = v3(recX + recL * 0.28, boreY, 0);
    const boundsMin = v3(-110, -120, -56);
    const boundsMax = v3(muzzlePos[0] + 10, boreY + 56, 56);

    return {
      sceneScale: 1,
      dims,
      assembledPos,
      explodeOffset,
      muzzlePos,
      chamberGlowPos,
      boreY: round2(boreY),
      gridY: -121.0,
      boundsMin,
      boundsMax,
      cameraPresets: computeCameraPresetsFromBounds(
        boundsMin,
        boundsMax,
        chamberGlowPos,
        muzzlePos,
        boreY,
        'ordnance'
      ),
    };
  }

  // 'howitzer' — BAE M777A2 155mm Ultralightweight Howitzer (scaled ~615 cm span, flush on -120 cm floor)
  const scale = 0.78;
  const carriageL = 285;
  const carriageY = -119.5 + carriageL * 0.26;
  const boreY = carriageY + carriageL * 0.14;
  const barL = clamp(bp.cad.barrelLenCm * scale, 410, 510);
  const recL = 132;
  const recH = 38;
  const recW = 40;
  const recX = -22;
  const barrelX = recX + recL * 0.5 - 24 + barL * 0.5;
  const barrelTipX = barrelX + barL * 0.5;
  const muzzleLen = 58;

  const dims: CentennialPartDims = {
    receiverLen: recL,
    receiverH: recH,
    receiverW: recW,
    barrelLen: barL,
    barrelBreechR: 16.5,
    barrelMuzzleR: 10.2,
    muzzleLen,
    handguardLen: 112,
    handguardH: 28,
    handguardW: 36,
    stockLen: 95,
    stockH: 32,
    stockW: 48,
    gripLen: 26,
    gripH: 24,
    gripW: 20,
    boltLen: 105,
    boltR: 14,
    magH: 30,
    magW: 78,
    magT: 22,
    opticLen: 46,
    springLen: 115,
    springR: 9.5,
    armorScale: 100,
    specialSpan: carriageL,
  };

  const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(recX, boreY, 0),
    barrel: v3(barrelX, boreY, 0),
    muzzle: v3(barrelTipX + muzzleLen * 0.44, boreY, 0),
    bolt_carrier: v3(recX - 38, boreY, 0),
    bolt: v3(recX - 58, boreY, 0),
    recoil_spring: v3(recX + 36, boreY + 22, 0),
    handguard: v3(recX + 54, boreY - 12, 0),
    stock: v3(recX - 115, carriageY - 16, 0),
    grip: v3(recX - 36, boreY - 22, 28),
    optic: v3(recX - 10, boreY + 34, -34),
    gas_system: v3(recX + 36, boreY + 22, 18),
    mount_rail: v3(recX - 28, carriageY, 0),
    trigger: v3(recX - 56, boreY - 10, 26),
    hammer: v3(recX - 72, boreY, 0),
    hammer_spring: v3(recX - 74, boreY - 18, 0),
    selector: v3(recX - 24, boreY + 12, -32),
    mag_body: v3(recX - 92, boreY - 18, 0),
    follower: v3(recX - 72, boreY - 4, 0),
    mag_spring: v3(recX - 96, boreY - 26, 14),
    mag_base: v3(recX - 126, boreY - 22, 0),
  };

  const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(135, 22, 0),
    muzzle: v3(215, 28, 0),
    bolt_carrier: v3(-48, 36, 0),
    bolt: v3(-96, 26, 0),
    recoil_spring: v3(46, 62, 0),
    handguard: v3(56, -34, 0),
    stock: v3(-96, -24, 0),
    grip: v3(-34, -28, 56),
    optic: v3(-12, 74, -64),
    gas_system: v3(42, 54, 48),
    mount_rail: v3(0, -56, 0),
    trigger: v3(-64, -22, 52),
    hammer: v3(-118, 26, 0),
    hammer_spring: v3(-120, -28, 22),
    selector: v3(-30, 42, -56),
    mag_body: v3(-135, -36, 0),
    follower: v3(-108, 12, -28),
    mag_spring: v3(-142, -52, 32),
    mag_base: v3(-175, -36, 0),
  };

  const muzzlePos = v3(barrelTipX + muzzleLen * 0.96, boreY, 0);
  const chamberGlowPos = v3(recX + 18, boreY, 0);
  const boundsMin = v3(-210, -120, -105);
  const boundsMax = v3(muzzlePos[0] + 15, boreY + 62, 105);

  return {
    sceneScale: scale,
    dims,
    assembledPos,
    explodeOffset,
    muzzlePos,
    chamberGlowPos,
    boreY: round2(boreY),
    gridY: -121.0,
    boundsMin,
    boundsMax,
    cameraPresets: computeCameraPresetsFromBounds(
      boundsMin,
      boundsMax,
      chamberGlowPos,
      muzzlePos,
      boreY,
      'ordnance'
    ),
  };
}

function computeArcheryLayout(
  bp: CentennialWeaponBlueprint
): CentennialLayoutResult {
  if (bp.archetype === 'crossbow_recurve') {
    const railL = 42;
    const prodSpan = 48;
    const boreY = 2.2;
    const stockL = 22;
    const prodX = railL * 0.42;

    const dims: CentennialPartDims = {
      receiverLen: railL,
      receiverH: 3.8,
      receiverW: 3.4,
      barrelLen: prodSpan,
      barrelBreechR: 1.05,
      barrelMuzzleR: 0.95,
      muzzleLen: 6,
      handguardLen: 18,
      handguardH: 3.4,
      handguardW: 3.6,
      stockLen: stockL,
      stockH: 9.5,
      stockW: 3.2,
      gripLen: 4.4,
      gripH: 8.6,
      gripW: 2.8,
      boltLen: 36,
      boltR: 0.45,
      magH: 14,
      magW: 5.2,
      magT: 2.4,
      opticLen: 18,
      springLen: 6.5,
      springR: 0.55,
      armorScale: 100,
      specialSpan: prodSpan,
    };

    const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(0, 0, 0),
      barrel: v3(prodX, 0.4, 0),
      muzzle: v3(prodX + 4.2, 0.2, 0),
      bolt_carrier: v3(prodX - prodSpan * 0.14, boreY, 0),
      bolt: v3(prodX - prodSpan * 0.14 + 17.5, boreY + 0.35, 0),
      recoil_spring: v3(-4, 0.8, 0),
      handguard: v3(11, -1.6, 0),
      stock: v3(-railL * 0.44 - stockL * 0.45, -0.8, 0),
      grip: v3(-8, -5.8, 0),
      optic: v3(-2, 5.2, 0),
      gas_system: v3(prodX - 6, -1.2, 0),
      mount_rail: v3(prodX + 7.2, -0.6, 0),
      trigger: v3(-5.2, -2.6, 0),
      hammer: v3(-7.4, 1.4, 0),
      hammer_spring: v3(-8.8, 0.4, 0),
      selector: v3(-9.8, 1.4, 1.9),
      mag_body: v3(6, -4.4, 4.2),
      follower: v3(10, boreY - 0.5, 0),
      mag_spring: v3(6, -4.4, 4.2),
      mag_base: v3(14, -4.4, 4.2),
    };

    const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
      receiver: v3(0, 0, 0),
      barrel: v3(14, 4, 0),
      muzzle: v3(22, 4, 0),
      bolt_carrier: v3(-6, 9, 0),
      bolt: v3(18, 12, 0),
      recoil_spring: v3(-4, 7, 5),
      handguard: v3(8, -8, 0),
      stock: v3(-14, -2, 0),
      grip: v3(-6, -10, 0),
      optic: v3(-2, 14, 0),
      gas_system: v3(8, -6, -7),
      mount_rail: v3(26, -3, 0),
      trigger: v3(-4, -9, 4),
      hammer: v3(-8, 8, -4),
      hammer_spring: v3(-10, 6, 5),
      selector: v3(-10, 5, 8),
      mag_body: v3(6, -10, 14),
      follower: v3(10, 7, -5),
      mag_spring: v3(6, -14, 17),
      mag_base: v3(16, -10, 15),
    };

    const muzzlePos = v3(prodX + 16, boreY, 0);
    const chamberGlowPos = v3(prodX - prodSpan * 0.14, boreY, 0);
    const boundsMin = v3(-34, -12, -prodSpan * 0.55);
    const boundsMax = v3(prodX + 18, 10, prodSpan * 0.55);

    return {
      sceneScale: 0.72,
      dims,
      assembledPos,
      explodeOffset,
      muzzlePos,
      chamberGlowPos,
      boreY,
      gridY: -22.5,
      boundsMin,
      boundsMax,
      cameraPresets: computeCameraPresetsFromBounds(
        boundsMin,
        boundsMax,
        chamberGlowPos,
        muzzlePos,
        boreY,
        'small_arm'
      ),
    };
  }

  // Vertical bows: 'bow_compound' (Hoyt RX-8) and 'bow_longbow' (Medieval English Yew Warbow)
  const isLongbow = bp.archetype === 'bow_longbow';
  const bowSpan = isLongbow ? 84 : 64;
  const riserLen = isLongbow ? 18 : 42;
  const arrowLen = 46;
  const boreY = 2.0;
  const stringX = isLongbow ? -bowSpan * 0.145 : -bowSpan * 0.24;

  const dims: CentennialPartDims = {
    receiverLen: riserLen,
    receiverH: bowSpan,
    receiverW: 3.4,
    barrelLen: bowSpan,
    barrelBreechR: 1.2,
    barrelMuzzleR: 0.8,
    muzzleLen: 8,
    handguardLen: 8,
    handguardH: 4.4,
    handguardW: 3.2,
    stockLen: 12,
    stockH: 3.2,
    stockW: 2.8,
    gripLen: 4.2,
    gripH: 10.5,
    gripW: 2.8,
    boltLen: arrowLen,
    boltR: 0.42,
    magH: 22,
    magW: 6.4,
    magT: 3.2,
    opticLen: 10,
    springLen: 5.4,
    springR: 0.55,
    armorScale: 100,
    specialSpan: bowSpan,
  };

  const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(0, 0, 0),
    muzzle: v3(isLongbow ? -bowSpan * 0.14 : -bowSpan * 0.23, bowSpan * (isLongbow ? 0.49 : 0.44), 0),
    bolt_carrier: v3(stringX, 0, 0),
    bolt: v3(stringX + arrowLen * 0.48, boreY, 0),
    recoil_spring: v3(-3.2, -bowSpan * 0.34, 0),
    handguard: v3(1.4, boreY - 1.6, 0),
    stock: v3(-5.8, -6.5, 0),
    grip: v3(-0.4, -4.2, 0),
    optic: v3(4.6, boreY + 4.8, -1.8),
    gas_system: v3(-5.2, 6.2, 2.2),
    mount_rail: v3(11.5, -10.2, 0),
    trigger: v3(stringX - 1.2, boreY, 0),
    hammer: v3(0.4, boreY - 0.8, 1.2),
    hammer_spring: v3(0.4, boreY - 2.6, 1.4),
    selector: v3(-bowSpan * 0.23, -bowSpan * 0.44, 0),
    mag_body: v3(2.8, -1.5, 5.2),
    follower: v3(1.2, boreY - 0.6, 0),
    mag_spring: v3(2.8, -6.5, 5.2),
    mag_base: v3(2.8, 10.5, 5.2),
  };

  const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(-12, 0, 0),
    muzzle: v3(-16, 14, 0),
    bolt_carrier: v3(-22, 0, 0),
    bolt: v3(24, 6, 0),
    recoil_spring: v3(-10, -10, 8),
    handguard: v3(8, 3, -6),
    stock: v3(-12, -8, 6),
    grip: v3(6, -6, 0),
    optic: v3(14, 10, -10),
    gas_system: v3(-10, 8, 10),
    mount_rail: v3(24, -10, 0),
    trigger: v3(-26, 6, 6),
    hammer: v3(8, 6, 8),
    hammer_spring: v3(8, -4, 10),
    selector: v3(-16, -14, 0),
    mag_body: v3(10, -4, 16),
    follower: v3(10, 6, -7),
    mag_spring: v3(10, -10, 18),
    mag_base: v3(10, 16, 16),
  };

  const muzzlePos = v3(stringX + arrowLen * 0.96, boreY, 0);
  const chamberGlowPos = v3(0, boreY, 0);
  const boundsMin = v3(stringX - 6, -bowSpan * 0.54, -8);
  const boundsMax = v3(muzzlePos[0] + 4, bowSpan * 0.54, 10);

  return {
    sceneScale: isLongbow ? 0.44 : 0.72,
    dims,
    assembledPos,
    explodeOffset,
    muzzlePos,
    chamberGlowPos,
    boreY,
    gridY: -54.0,
    boundsMin,
    boundsMax,
    cameraPresets: computeCameraPresetsFromBounds(
      boundsMin,
      boundsMax,
      chamberGlowPos,
      muzzlePos,
      boreY,
      'archery_vert'
    ),
  };
}

function computePistolRevolverLayout(
  bp: CentennialWeaponBlueprint
): CentennialLayoutResult {
  const isBroom = bp.archetype === 'pistol_broomhandle';
  const isRevolver =
    bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da';

  const recL = clamp(bp.cad.receiverLenCm, 11.5, 22);
  const recH = isRevolver ? 3.8 : isBroom ? 3.6 : 2.9;
  const recW = isRevolver ? 3.2 : 2.85;
  const barL = clamp(bp.cad.barrelLenCm, 9.5, 22);
  const breechR = isRevolver ? 1.1 : 0.92;
  const muzzleR = isRevolver ? 0.92 : 0.78;
  const muzzleLen =
    bp.cad.muzzleStyle === 'suppressor'
      ? Math.max(11, barL * 0.78)
      : bp.cad.muzzleStyle === 'brake'
        ? 3.8
        : bp.cad.muzzleStyle === 'bare'
          ? 1.1
          : 2.8;

  const gripH = clamp(bp.cad.receiverHeightCm * 0.72, 8.8, 12.2);
  const gripL = 4.6;
  const gripW = recW * 0.94;
  const magH = isBroom ? 6.2 : gripH * 0.92;
  const magW = isBroom ? 4.4 : 3.2;
  const magT = isBroom ? 2.2 : 1.9;

  const boreY = isRevolver ? recH * 0.34 : isBroom ? recH * 0.28 : recH * 0.74;
  const barrelX = isRevolver || isBroom
    ? recL * 0.5 - 1.2 + barL * 0.5
    : recL * 0.08;
  const barrelTipX = barrelX + barL * 0.5;
  const muzzleX = barrelTipX + muzzleLen * 0.42;

  const gripX = isBroom ? -recL * 0.46 : isRevolver ? -recL * 0.42 : -recL * 0.26;
  const gripY = -recH * 0.42 - gripH * 0.42;

  const magX = isBroom ? recL * 0.22 : isRevolver ? 0.4 : gripX;
  const magY = isBroom ? -recH * 0.5 - magH * 0.4 : isRevolver ? boreY - 0.55 : gripY - 0.25;

  const dims: CentennialPartDims = {
    receiverLen: recL,
    receiverH: recH,
    receiverW: recW,
    barrelLen: barL,
    barrelBreechR: breechR,
    barrelMuzzleR: muzzleR,
    muzzleLen,
    handguardLen: Math.max(5.5, recL * 0.42),
    handguardH: recH * 0.52,
    handguardW: recW * 0.96,
    stockLen: isBroom ? 5.2 : 3.6,
    stockH: recH * 0.85,
    stockW: recW * 0.88,
    gripLen: gripL,
    gripH,
    gripW,
    boltLen: isRevolver ? 4.6 : recL * 0.98,
    boltR: isRevolver ? 1.85 : recW * 0.42,
    magH,
    magW,
    magT,
    opticLen: bp.cad.hasOptic ? 11 : 3.8,
    springLen: Math.max(6.4, recL * 0.46),
    springR: 0.48,
    armorScale: 100,
    specialSpan: recL + barL,
  };

  const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(barrelX, boreY, 0),
    muzzle: v3(muzzleX, boreY, 0),
    bolt_carrier: v3(
      isRevolver ? barrelX - barL * 0.14 : isBroom ? -recL * 0.08 : 0,
      isRevolver ? boreY - 1.35 : boreY,
      0
    ),
    bolt: v3(isRevolver ? 0.4 : -recL * 0.2, isRevolver ? boreY - 0.52 : boreY, 0),
    recoil_spring: v3(
      isRevolver ? -recL * 0.25 : recL * 0.18,
      isRevolver ? gripY * 0.55 : boreY - breechR * 1.35,
      0
    ),
    handguard: v3(
      isRevolver ? barrelX : recL * 0.24,
      isRevolver ? boreY - 1.25 : -recH * 0.24,
      0
    ),
    stock: v3(-recL * 0.46, -recH * 0.15, 0),
    grip: v3(gripX, gripY, 0),
    optic: v3(
      isRevolver || isBroom ? 0.5 : -recL * 0.18,
      (isRevolver || isBroom ? recH * 0.5 : boreY + recH * 0.52) + (bp.cad.hasOptic ? 1.8 : 0.35),
      0
    ),
    gas_system: v3(recL * 0.16, boreY - breechR * 1.35, 0),
    mount_rail: v3(recL * 0.32, -recH * 0.44, 0),
    trigger: v3(isBroom ? -recL * 0.16 : recL * 0.06, -recH * 0.72, 0),
    hammer: v3(-recL * 0.38, boreY + (isRevolver ? 0.55 : -0.25), 0),
    hammer_spring: v3(gripX - 0.6, gripY + 0.8, 0),
    selector: v3(-recL * 0.34, recH * 0.18, recW * 0.54),
    mag_body: v3(magX, magY, 0),
    follower: v3(magX, magY + magH * 0.34, 0),
    mag_spring: v3(magX, magY - magH * 0.05, 0),
    mag_base: v3(magX, magY - magH * 0.48, 0),
  };

  const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(6.5, 4.8, 0),
    muzzle: v3(13.5, 4.8, 0),
    bolt_carrier: v3(2.2, 8.6, 0),
    bolt: v3(-4.5, 6.4, isRevolver ? 5.8 : 0),
    recoil_spring: v3(5.2, 2.6, 0),
    handguard: v3(6.2, -3.2, 0),
    stock: v3(-7.4, -1.2, 0),
    grip: v3(-3.8, -5.6, 0),
    optic: v3(0.5, 11.4, 0),
    gas_system: v3(8.4, 1.4, 0),
    mount_rail: v3(5.8, -5.4, 0),
    trigger: v3(1.8, -5.8, 3.2),
    hammer: v3(-6.2, 4.4, -2.6),
    hammer_spring: v3(-6.8, -5.2, 2.8),
    selector: v3(-5.2, 2.4, 6.2),
    mag_body: v3(-2.6, -12.2, 0),
    follower: v3(-1.2, -7.8, 0),
    mag_spring: v3(-2.6, -14.8, 2.4),
    mag_base: v3(-2.6, -17.6, 0),
  };

  const muzzlePos = v3(muzzleX + muzzleLen * 0.52, boreY, 0);
  const chamberGlowPos = v3(isRevolver ? 0.6 : recL * 0.14, boreY, 0);
  const boundsMin = v3(
    Math.min(-recL * 0.56, gripX - gripL * 0.7),
    Math.min(gripY - gripH * 0.55, magY - magH * 0.55),
    -recW * 0.85
  );
  const boundsMax = v3(
    muzzlePos[0] + 1.5,
    boreY + recH * 0.9 + (bp.cad.hasOptic ? 3.5 : 1.4),
    recW * 0.85
  );

  return {
    sceneScale: 1,
    dims,
    assembledPos,
    explodeOffset,
    muzzlePos,
    chamberGlowPos,
    boreY: round2(boreY),
    gridY: -18.5,
    boundsMin,
    boundsMax,
    cameraPresets: computeCameraPresetsFromBounds(
      boundsMin,
      boundsMax,
      chamberGlowPos,
      muzzlePos,
      boreY,
      'pistol'
    ),
  };
}

function computeLongArmLayout(
  bp: CentennialWeaponBlueprint
): CentennialLayoutResult {
  const isHeavy = bp.scaleProfile === 'heavy_sniper' || bp.archetype === 'heavy_mg';
  const isSmg = bp.category === 'smg';
  const isBullpup =
    bp.archetype === 'bullpup_rifle' || bp.archetype === 'sniper_bullpup';
  const isPan = bp.cad.magStyle === 'pan' || bp.archetype === 'lmg_pan';
  const isBelt = bp.cad.magStyle === 'belt' || bp.archetype === 'lmg_belt' || bp.archetype === 'heavy_mg';
  const isTube = bp.cad.magStyle === 'tube';
  const isHelical = bp.id === 'bizon';
  const isDrum = bp.cad.magStyle === 'drum' && !isHelical;
  const isGripMag = bp.cad.magStyle === 'pistol_grip';
  const isInternalBox = bp.cad.magStyle === 'box_internal';
  const isSpade = bp.archetype === 'heavy_mg';

  const sceneScale = isHeavy ? 0.44 : isSmg ? 0.58 : 0.52;

  const recL = clamp(bp.cad.receiverLenCm * sceneScale, 11.5, 24.5);
  const recH = clamp(bp.cad.receiverHeightCm * sceneScale * 0.34, 3.3, 5.8);
  const recW = clamp(recH * 0.72, 2.6, 4.4);

  const barL = clamp(bp.cad.barrelLenCm * sceneScale, 10.5, 36.5);
  const breechR = isHeavy ? 1.48 : bp.category === 'shotgun' ? 1.22 : 1.04;
  const muzzleR = isHeavy ? 1.08 : bp.category === 'shotgun' ? 1.06 : 0.76;
  const muzzleLen =
    bp.cad.muzzleStyle === 'suppressor'
      ? clamp(barL * 0.42, 7.5, 13.5)
      : bp.cad.muzzleStyle === 'brake'
        ? isHeavy
          ? 5.6
          : 3.8
        : bp.cad.muzzleStyle === 'shroud'
          ? 5.4
          : bp.cad.muzzleStyle === 'bare'
            ? 1.2
            : 3.4;

  const hgL = clamp(bp.cad.handguardLenCm * sceneScale, 6.5, barL * 0.84);
  const hgH = recH * 0.9;
  const hgW = recW * 1.04;

  const stockL = isBullpup
    ? clamp(bp.cad.stockLenCm * sceneScale * 0.55, 5.2, 8.8)
    : isSpade
      ? 6.8
      : clamp(bp.cad.stockLenCm * sceneScale, 6.2, 17.5);
  const stockH = isSpade ? recH * 1.72 : clamp(recH * 1.95, 7.2, 10.6);
  const stockW = isSpade ? recW * 1.75 : recW * 0.92;

  const gripH = clamp(recH * 1.95, 6.4, 9.2);
  const gripL = 3.8;
  const gripW = recW * 0.86;

  const magH = isPan
    ? 2.8
    : isBelt
      ? 4.8
      : isTube
        ? Math.max(12, barL * 0.74)
        : isHelical
          ? Math.max(12, hgL * 1.08)
          : isDrum
            ? 10.5
            : isInternalBox
              ? 3.8
              : clamp(bp.magCapacity >= 25 ? 12.2 : 8.6, 7.2, 13.4);
  const magW = isPan
    ? 11.2
    : isBelt
      ? 7.8
      : isTube
        ? 2.0
        : isHelical
          ? 3.6
          : isDrum
            ? 10.5
            : clamp(recL * 0.28, 3.6, 6.4);
  const magT = isPan
    ? 2.6
    : isBelt
      ? 3.2
      : isTube
        ? 1.9
        : isHelical
          ? 3.4
          : isDrum
            ? 3.4
            : clamp(recW * 0.68, 1.8, 3.1);

  const opticLen = bp.cad.hasOptic
    ? clamp(recL * 0.96, 12, 21)
    : bp.cad.hasCarryHandle
      ? clamp(recL * 0.88, 11, 18)
      : 4.4;

  const boreY = recH * 0.22;
  const barrelOverlap = recL * 0.22;
  const barrelX = recL * 0.5 - barrelOverlap + barL * 0.5;
  const barrelTipX = barrelX + barL * 0.5;
  const muzzleX =
    bp.cad.muzzleStyle === 'shroud'
      ? barrelTipX - muzzleLen * 0.12
      : barrelTipX + muzzleLen * 0.42;

  const handguardX = recL * 0.5 - 0.35 + hgL * 0.5;
  const handguardY = boreY - recH * 0.06;

  const stockX = -recL * 0.5 + 0.4 - stockL * 0.5;
  const stockY = isSpade ? 0 : isBullpup ? -recH * 0.04 : -recH * 0.16;

  const gripX = isBullpup
    ? recL * 0.34
    : bp.archetype === 'shotgun_pump'
      ? handguardX + hgL * 0.08
      : -recL * 0.28;
  const gripY =
    bp.archetype === 'shotgun_pump'
      ? handguardY - hgH * 0.32
      : -recH * 0.5 - gripH * 0.42;

  const trigX = isBullpup ? recL * 0.44 : -recL * 0.1;
  const hammerX = -recL * 0.14;

  // Magazine placement tailored to every feeding architecture
  let magX = isBullpup ? -recL * 0.28 : recL * 0.18;
  let magY = -recH * 0.5 - magH * 0.42;
  let magZ = 0;

  if (isPan) {
    magX = recL * 0.06;
    magY = recH * 0.5 + magT * 0.58;
  } else if (isBelt) {
    magX = recL * 0.12;
    magY = boreY - recH * 0.14;
    magZ = -recW * 0.56;
  } else if (isTube) {
    magX = recL * 0.5 + magH * 0.48;
    magY = boreY - breechR * 2.05;
  } else if (isHelical) {
    magX = handguardX;
    magY = handguardY - hgH * 0.62;
  } else if (isDrum) {
    magX = isBullpup ? -recL * 0.26 : recL * 0.2;
    magY = -recH * 0.5 - magH * 0.48;
  } else if (isGripMag) {
    magX = gripX;
    magY = gripY - 0.65;
  } else if (isInternalBox) {
    magX = recL * 0.08;
    magY = -recH * 0.46;
  }

  const opticR = Math.max(1.25, opticLen * 0.058);
  const opticY = bp.cad.hasOptic
    ? recH * 0.5 + opticR * 2.02
    : bp.cad.hasCarryHandle
      ? recH * 0.5 + 0.12
      : recH * 0.5 + 0.35;

  const dims: CentennialPartDims = {
    receiverLen: recL,
    receiverH: recH,
    receiverW: recW,
    barrelLen: barL,
    barrelBreechR: breechR,
    barrelMuzzleR: muzzleR,
    muzzleLen,
    handguardLen: hgL,
    handguardH: hgH,
    handguardW: hgW,
    stockLen: stockL,
    stockH,
    stockW,
    gripLen: gripL,
    gripH,
    gripW,
    boltLen: recL * 0.64,
    boltR: Math.max(0.72, recW * 0.26),
    magH,
    magW,
    magT,
    opticLen,
    springLen: Math.max(6.8, recL * 0.48),
    springR: Math.max(0.46, recW * 0.15),
    armorScale: 100,
    specialSpan: recL + barL + stockL,
  };

  const assembledPos: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(barrelX, boreY, 0),
    muzzle: v3(muzzleX, boreY, 0),
    bolt_carrier: v3(-recL * 0.06, boreY, 0),
    bolt: v3(recL * 0.14, boreY, 0),
    recoil_spring: v3(-recL * 0.26, boreY, 0),
    handguard: v3(handguardX, handguardY, 0),
    stock: v3(stockX, stockY, 0),
    grip: v3(gripX, gripY, 0),
    optic: v3(bp.cad.hasOptic || bp.cad.hasCarryHandle ? recL * 0.02 : recL * 0.14, opticY, 0),
    gas_system: v3(
      handguardX + hgL * 0.04,
      bp.mechanismFilter === 'gas_piston' || bp.mechanismFilter === 'direct_impingement'
        ? boreY + recH * 0.38
        : boreY - recH * 0.34,
      0
    ),
    mount_rail: v3(
      bp.cad.hasBipod ? handguardX + hgL * 0.36 : recL * 0.32,
      bp.cad.hasBipod ? handguardY - hgH * 0.56 : recH * 0.5 + 0.24,
      0
    ),
    trigger: v3(trigX, -recH * 0.54, 0),
    hammer: v3(hammerX, -recH * 0.18, 0),
    hammer_spring: v3(hammerX - 1.1, -recH * 0.32, 0),
    selector: v3(hammerX - 1.3, -recH * 0.1, recW * 0.54),
    mag_body: v3(magX, magY, magZ),
    follower: v3(
      isTube || isHelical ? magX - magH * 0.34 : magX,
      isTube || isHelical || isBelt ? magY : isPan ? magY + 0.5 : magY + magH * 0.36,
      magZ
    ),
    mag_spring: v3(
      magX,
      isTube || isHelical || isPan || isBelt ? magY : magY - magH * 0.04,
      magZ
    ),
    mag_base: v3(
      isTube || isHelical ? magX + magH * 0.5 : magX,
      isTube || isHelical || isBelt ? magY : isPan ? magY + magT * 0.52 : magY - magH * 0.5,
      magZ
    ),
  };

  const explodeOffset: Record<CentennialPartSlot, Vec3Tuple> = {
    receiver: v3(0, 0, 0),
    barrel: v3(12, 3.2, 0),
    muzzle: v3(21, 3.2, 0),
    bolt_carrier: v3(-4.5, 9.2, 0),
    bolt: v3(4.5, 11.4, 0),
    recoil_spring: v3(-11.5, 7.6, 0),
    handguard: v3(9.5, -5.4, 0),
    stock: v3(-13.5, -1.2, 0),
    grip: v3(isBullpup ? 4.5 : -4.2, -9.2, 0),
    optic: v3(isPan ? -3.4 : 0.8, isPan ? 10.6 : 13.8, 0),
    gas_system: v3(8.5, 8.4, 0),
    mount_rail: v3(bp.cad.hasBipod ? 14 : 4, bp.cad.hasBipod ? -11.5 : 8.5, 0),
    trigger: v3(trigX > 0 ? 3.2 : -1.4, -7.8, 3.5),
    hammer: v3(-3.6, -5.8, -3.2),
    hammer_spring: v3(-5.8, -7.4, 2.8),
    selector: v3(-3.6, 1.4, 7.6),
    mag_body: v3(isTube || isHelical ? 10 : 2.4, isPan ? 12.5 : -12.5, isBelt ? -10 : 0),
    follower: v3(isTube || isHelical ? 6 : 2.4, isPan ? 9.5 : -7.5, isBelt ? -7 : 0),
    mag_spring: v3(isTube || isHelical ? 13 : 2.4, isPan ? 15.5 : -15.5, isBelt ? -12 : 2.8),
    mag_base: v3(isTube || isHelical ? 18 : 2.4, isPan ? 18.2 : -18.5, isBelt ? -14 : 0),
  };

  const muzzlePos = v3(muzzleX + muzzleLen * 0.52, boreY, 0);
  const chamberGlowPos = v3(recL * 0.24, boreY, 0);
  const minX = Math.min(stockX - stockL * 0.56, -recL * 0.6);
  const maxX = Math.max(muzzlePos[0] + 1.5, handguardX + hgL * 0.55);
  const minY = Math.min(
    gripY - gripH * 0.55,
    stockY - stockH * 0.52,
    isPan || isTube || isHelical ? -recH : magY - magH * 0.56
  );
  const maxY = Math.max(
    recH * 0.6,
    opticY + (bp.cad.hasOptic ? opticR * 2.2 : bp.cad.hasCarryHandle ? 4.8 : 2.2),
    isPan ? magY + magT : 0
  );
  const halfZ = Math.max(recW, stockW, isBelt ? magT * 2.2 : 0) * 0.65;

  const boundsMin = v3(minX, minY, -halfZ);
  const boundsMax = v3(maxX, maxY, halfZ);

  return {
    sceneScale,
    dims,
    assembledPos,
    explodeOffset,
    muzzlePos,
    chamberGlowPos,
    boreY: round2(boreY),
    gridY: isHeavy ? -25.0 : -24.0,
    boundsMin,
    boundsMax,
    cameraPresets: computeCameraPresetsFromBounds(
      boundsMin,
      boundsMax,
      chamberGlowPos,
      muzzlePos,
      boreY,
      'small_arm'
    ),
  };
}

/**
 * Pure deterministic 1:1 coordinate & camera layout solver for any of the 66
 * Centennial weapon blueprints across all 28 architectural archetypes.
 */
export function computeCentennialPartLayout(
  bp: CentennialWeaponBlueprint
): CentennialLayoutResult {
  if (bp.archetype === 'mbt_modern' || bp.archetype === 'mbt_wwii') {
    return computeMbtLayout(bp);
  }
  if (
    bp.archetype === 'rotary_cannon' ||
    bp.archetype === 'aa_autocannon' ||
    bp.archetype === 'howitzer'
  ) {
    return computeOrdnanceLayout(bp);
  }
  if (
    bp.archetype === 'bow_compound' ||
    bp.archetype === 'crossbow_recurve' ||
    bp.archetype === 'bow_longbow'
  ) {
    return computeArcheryLayout(bp);
  }
  if (
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle' ||
    bp.archetype === 'revolver_sa' ||
    bp.archetype === 'revolver_da'
  ) {
    return computePistolRevolverLayout(bp);
  }
  return computeLongArmLayout(bp);
}

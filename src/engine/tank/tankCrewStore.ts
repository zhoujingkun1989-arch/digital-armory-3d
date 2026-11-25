import { create } from 'zustand';
import {
  buildCentennialTankCrewSpecs,
  type CentennialTankNationCode,
  type CentennialTankWeaponId,
} from '../../weapons/expansion/centennialProjectors';
import type { MutablePartPose, WeaponId } from '../../weapons/types';
import {
  getCaliberBallisticsSpec,
  isTankWeapon,
} from '../physics/armoryPhysics';
import { getWeaponManifest } from '../../weapons/manifests';

export type TankCrewStation = 'exterior' | 'gunner' | 'interior';
export type TankOpticMode = 'daylight' | 'flir_whot' | 'flir_bhot' | 'green_nvg';
export type TankWeaponId =
  | 'ztz99a'
  | 'm1a2'
  | 'leopard2a7'
  | 'tiger1'
  | CentennialTankWeaponId;
export type TankReticleStyle =
  | 'pla_ztz99a'
  | 'us_m1a2_gps'
  | 'de_emes15'
  | 'ww2_tzf9b';

export interface TankCrewKinematicsSpec {
  weaponId: TankWeaponId;
  turretRingPivot: readonly [number, number, number];
  trunnionPivot: readonly [number, number, number];
  /** Per-tank gunner optic eye offset `[forwardFromRingCm, heightAboveTrunnionCm, lateralRightCm]` */
  gunnerEyeOffset: readonly [number, number, number];
  /** Target look-point Y offset above `trunnionPivot[1]` (cm) along bore line */
  gunnerLookOffsetY: number;
  elevLimitsDeg: readonly [number, number];
  defaultProjectileSpeedMps: number;
  sightNameZh: string;
  sightNameEn: string;
  turretPartIds: ReadonlySet<string>;
  gunPartIds: ReadonlySet<string>;
}

export interface TankGunnerOpticProfile {
  weaponId: TankWeaponId;
  reticleStyle: TankReticleStyle;
  nationCode: 'CN' | 'US' | 'DE' | 'DE-1943' | CentennialTankNationCode;
  designationZh: string;
  designationEn: string;
  ammoTag: string;
  readyLabelZh: string;
  readyLabelEn: string;
  magnificationLabel: string;
  supportedOpticModes: readonly TankOpticMode[];
  defaultOpticMode: TankOpticMode;
  hasLaserRangefinder: boolean;
  hasCantIndicator: boolean;
  rangeDrumMaxM: number;
  museumStudyThermalNoteZh: string | null;
  museumStudyThermalNoteEn: string | null;
}

const CENTENNIAL_TANK_CREW = buildCentennialTankCrewSpecs();

export const TANK_GUNNER_OPTIC_PROFILES: Readonly<
  Record<TankWeaponId, TankGunnerOpticProfile>
> = {
  ztz99a: {
    weaponId: 'ztz99a',
    reticleStyle: 'pla_ztz99a',
    nationCode: 'CN',
    designationZh: '152 式双稳上反炮长主瞄 · 激光数字火控',
    designationEn: 'Type-152 Stabilized Thermal FCS · Digital LRF',
    ammoTag: 'APFSDS-125',
    readyLabelZh: '激光测距 / 就绪 / APFSDS-125',
    readyLabelEn: 'LASE / READY / APFSDS-125',
    magnificationLabel: '6× / 12×',
    supportedOpticModes: ['daylight', 'flir_whot', 'flir_bhot'],
    defaultOpticMode: 'daylight',
    hasLaserRangefinder: true,
    hasCantIndicator: false,
    rangeDrumMaxM: 4000,
    museumStudyThermalNoteZh: null,
    museumStudyThermalNoteEn: null,
  },
  m1a2: {
    weaponId: 'm1a2',
    reticleStyle: 'us_m1a2_gps',
    nationCode: 'US',
    designationZh: 'GPS 炮手主瞄镜 · 三代 FLIR 热成像',
    designationEn: 'GPS Primary Sight · 3rd-Gen FLIR Thermal',
    ammoTag: 'M829A4 SABOT',
    readyLabelZh: '主炮就绪 · READY TO FIRE',
    readyLabelEn: 'READY TO FIRE',
    magnificationLabel: '3× / 10×',
    supportedOpticModes: ['flir_whot', 'green_nvg', 'daylight'],
    defaultOpticMode: 'daylight',
    hasLaserRangefinder: true,
    hasCantIndicator: false,
    rangeDrumMaxM: 4000,
    museumStudyThermalNoteZh: null,
    museumStudyThermalNoteEn: null,
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    reticleStyle: 'de_emes15',
    nationCode: 'DE',
    designationZh: 'EMES-15 激光测距 + ATTICA 三代热像',
    designationEn: 'EMES-15 Laser Rangefinder + ATTICA Thermal',
    ammoTag: 'DM63A1 KE',
    readyLabelZh: '激光锁定 · DM63A1 尾翼稳定脱穿',
    readyLabelEn: 'LASER LOCK · DM63A1 KE',
    magnificationLabel: '4× / 12×',
    supportedOpticModes: ['daylight', 'flir_whot', 'flir_bhot'],
    defaultOpticMode: 'daylight',
    hasLaserRangefinder: true,
    hasCantIndicator: true,
    rangeDrumMaxM: 4000,
    museumStudyThermalNoteZh: null,
    museumStudyThermalNoteEn: null,
  },
  tiger1: {
    weaponId: 'tiger1',
    reticleStyle: 'ww2_tzf9b',
    nationCode: 'DE-1943',
    designationZh: 'Carl Zeiss TZF-9b 双目光学测距瞄准镜',
    designationEn: 'Carl Zeiss TZF-9b Stadiametric Optical Sight',
    ammoTag: 'PzGr.39 88mm',
    readyLabelZh: '蔡司光学表尺 · 88mm PzGr.39',
    readyLabelEn: 'ZEISS OPTICAL DRUM · 88mm PzGr.39',
    magnificationLabel: '2.5× / 5×',
    supportedOpticModes: ['daylight', 'flir_whot'],
    defaultOpticMode: 'daylight',
    hasLaserRangefinder: false,
    hasCantIndicator: false,
    rangeDrumMaxM: 4000,
    museumStudyThermalNoteZh:
      '博物馆 X-Ray / FLIR 教学研究模式（1943 原车仅配蔡司光学镜）',
    museumStudyThermalNoteEn:
      'Museum X-Ray / FLIR Study Mode (1943 Tiger 131 was optical-only)',
  },
  ...CENTENNIAL_TANK_CREW.gunnerOptics,
};

export function getTankGunnerOpticProfile(
  weaponId: WeaponId | string
): TankGunnerOpticProfile | null {
  if (
    Object.prototype.hasOwnProperty.call(TANK_GUNNER_OPTIC_PROFILES, weaponId)
  ) {
    return TANK_GUNNER_OPTIC_PROFILES[weaponId as TankWeaponId];
  }
  return null;
}

export const TANK_CREW_SPECS: Readonly<
  Record<TankWeaponId, TankCrewKinematicsSpec>
> = {
  ztz99a: {
    weaponId: 'ztz99a',
    turretRingPivot: [22, 9.5, 0],
    trunnionPivot: [100, 38, 0],
    gunnerEyeOffset: [-105, 86, 56],
    gunnerLookOffsetY: 18,
    elevLimitsDeg: [-5, 14],
    defaultProjectileSpeedMps: 1780,
    sightNameZh: '152 式双稳上反热像周视猎-歼瞄准镜',
    sightNameEn: 'Dual-Axis Stabilized Thermal Hunter-Killer Sight',
    turretPartIds: new Set([
      'ztz99a_turret_shell',
      'ztz99a_era_wedges',
      'ztz99a_optics_citv',
      'ztz99a_roof_armaments',
      'ztz99a_main_gun',
      'ztz99a_gun_cradle',
      'ztz99a_recoil_cylinders',
      'ztz99a_recoil_springs',
      'ztz99a_breech_block',
      'ztz99a_stub_ejector',
    ]),
    gunPartIds: new Set([
      'ztz99a_main_gun',
      'ztz99a_gun_cradle',
      'ztz99a_recoil_cylinders',
      'ztz99a_recoil_springs',
      'ztz99a_breech_block',
      'ztz99a_stub_ejector',
    ]),
  },
  m1a2: {
    weaponId: 'm1a2',
    turretRingPivot: [20, 12, 0],
    trunnionPivot: [148, 44, 0],
    // Raised +26 cm above legacy offset & shifted +70 cm forward to clear m1a2_crows_optics (maxY = 124 cm)
    // so the Abrams GPS thermal crosshair has a 100% unobstructed sightline over the 120mm M256 barrel.
    gunnerEyeOffset: [-35, 112, 58],
    gunnerLookOffsetY: 38,
    elevLimitsDeg: [-10, 20],
    defaultProjectileSpeedMps: 1710,
    sightNameZh: 'GPS 炮手主瞄镜 + 3rd Gen FLIR 热成像',
    sightNameEn: 'GPS Primary Sight + 3rd-Gen FLIR Thermal',
    turretPartIds: new Set([
      'm1a2_turret_shell',
      'm1a2_blowoff_panels',
      'm1a2_composite_armor',
      'm1a2_smoke_launchers',
      'm1a2_crows_optics',
      'm1a2_blast_doors',
      'm1a2_door_spring',
      'm1a2_ammo_bustle',
      'm1a2_ready_round',
      'm1a2_main_gun',
      'm1a2_gun_mantlet',
      'm1a2_recoil_springs',
      'm1a2_stub_deflector',
      'm1a2_breech_block',
    ]),
    gunPartIds: new Set([
      'm1a2_main_gun',
      'm1a2_gun_mantlet',
      'm1a2_recoil_springs',
      'm1a2_stub_deflector',
      'm1a2_breech_block',
    ]),
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    turretRingPivot: [32, 46, 0],
    trunnionPivot: [138, 74, 0],
    gunnerEyeOffset: [-105, 86, 56],
    gunnerLookOffsetY: 18,
    elevLimitsDeg: [-9, 20],
    defaultProjectileSpeedMps: 1750,
    sightNameZh: 'EMES-15 激光测距 + ATTICA 热成像主瞄',
    sightNameEn: 'EMES-15 Laser Rangefinder + ATTICA Thermal',
    turretPartIds: new Set([
      'leo_turret_shell',
      'leo_arrowhead_wedges',
      'leo_smoke_dischargers',
      'leo_optics_peri',
      'leo_blast_door',
      'leo_ammo_bustle',
      'leo_ready_round',
      'leo_main_gun',
      'leo_gun_mantlet',
      'leo_recoil_system',
      'leo_recoil_springs',
      'leo_breech_block',
      'leo_breech_spring',
    ]),
    gunPartIds: new Set([
      'leo_main_gun',
      'leo_gun_mantlet',
      'leo_recoil_system',
      'leo_recoil_springs',
      'leo_breech_block',
      'leo_breech_spring',
    ]),
  },
  tiger1: {
    weaponId: 'tiger1',
    turretRingPivot: [18, 51, 0],
    trunnionPivot: [134, 102, 0],
    gunnerEyeOffset: [-105, 86, 56],
    gunnerLookOffsetY: 18,
    elevLimitsDeg: [-8, 15],
    defaultProjectileSpeedMps: 773,
    sightNameZh: 'Carl Zeiss TZF 9b 双目光学测距瞄准镜',
    sightNameEn: 'Carl Zeiss TZF 9b Stadiametric Sight (2.5x / 5x)',
    turretPartIds: new Set([
      'tiger_turret_shell',
      'tiger_cupola_hatches',
      'tiger_turret_basket',
      'tiger_optics_tzf9b',
      'tiger_main_gun',
      'tiger_gun_mantlet',
      'tiger_recoil_cradle',
      'tiger_recoil_springs',
      'tiger_shell_guard',
      'tiger_breech_block',
      'tiger_breech_spring',
    ]),
    gunPartIds: new Set([
      'tiger_main_gun',
      'tiger_gun_mantlet',
      'tiger_recoil_cradle',
      'tiger_recoil_springs',
      'tiger_shell_guard',
      'tiger_breech_block',
      'tiger_breech_spring',
    ]),
  },
  ...CENTENNIAL_TANK_CREW.kinematics,
};

export interface TankGunnerCameraPose {
  readonly eye: readonly [number, number, number];
  readonly target: readonly [number, number, number];
}

/**
 * Computes unobstructed world-space gunner primary sight eye & target coordinates (cm)
 * for any 1:1 MBT at the active turret azimuth angle.
 */
export function computeTankGunnerCameraPose(
  weaponId: WeaponId | string,
  turretYawDeg: number
): TankGunnerCameraPose | null {
  const spec = getTankCrewSpec(weaponId);
  if (!spec) return null;
  const yawRad = (turretYawDeg * Math.PI) / 180;
  const dirX = Math.cos(-yawRad);
  const dirZ = Math.sin(-yawRad);
  const rightX = -dirZ;
  const rightZ = dirX;
  const [rx, , rz] = spec.turretRingPivot;
  const [, ty] = spec.trunnionPivot;
  const [fwdOffset, eyeHeightAboveTrunnion, lateralRight] =
    spec.gunnerEyeOffset;

  return {
    eye: [
      rx + dirX * fwdOffset + rightX * lateralRight,
      ty + eyeHeightAboveTrunnion,
      rz + dirZ * fwdOffset + rightZ * lateralRight,
    ],
    target: [
      rx + dirX * 420,
      ty + spec.gunnerLookOffsetY,
      rz + dirZ * 420,
    ],
  };
}

export interface TankFcsSolution {
  rangeM: number;
  tofSec: number;
  superelevationMil: number;
  leadMil: number;
  superelevationDeg: number;
}

export function getTankCrewSpec(
  weaponId: WeaponId | string
): TankCrewKinematicsSpec | null {
  if (Object.prototype.hasOwnProperty.call(TANK_CREW_SPECS, weaponId)) {
    return TANK_CREW_SPECS[weaponId as TankWeaponId];
  }
  return null;
}

/**
 * Computes ballistic superelevation and dynamic target lead in milliradians (mrad)
 * for any of the 4 1:1 MBTs based on real muzzle velocity and LRF/optical distance.
 */
export function computeTankFcsSolution(
  weaponId: WeaponId,
  rangeM: number,
  targetSpeedKph: number
): TankFcsSolution {
  const safeRange = Math.max(100, Math.min(4000, rangeM));
  const manifest = getWeaponManifest(weaponId);
  const spec = getCaliberBallisticsSpec(manifest.caliberProfile);
  const v0 = Math.max(300, spec.muzzleVelocityMps);

  // Average flight velocity factoring mild aerodynamic velocity decay
  const avgVel = v0 * Math.exp(-0.045 * (safeRange / 1000));
  const tofSec = safeRange / avgVel;
  // Drop ~ 0.5 * g * t^2 -> angle rad ~ 0.5 * 9.80665 * tof^2 / range
  const elevRad = (0.5 * 9.80665 * tofSec * tofSec) / safeRange;
  const superelevationMil = elevRad * 1000;
  const superelevationDeg = (elevRad * 180) / Math.PI;

  const targetSpeedMps = targetSpeedKph / 3.6;
  const leadRad = (targetSpeedMps * tofSec) / safeRange;
  const leadMil = leadRad * 1000;

  return {
    rangeM: safeRange,
    tofSec,
    superelevationMil,
    leadMil,
    superelevationDeg,
  };
}

/**
 * Zero-GC 60fps 3D turret traverse & gun trunnion elevation transform
 * applied directly into `MutablePartPose` inside `PartActor.tsx`.
 */
export function applyTankCrewTransformInto(
  weaponId: WeaponId,
  partId: string,
  yawDeg: number,
  elevDeg: number,
  pose: MutablePartPose
): void {
  const spec = getTankCrewSpec(weaponId);
  if (!spec) return;

  const isGun = spec.gunPartIds.has(partId);
  const isTurret = isGun || spec.turretPartIds.has(partId);
  if (!isTurret) return;

  // 1. Elevate main gun & breech around horizontal trunnion axis (Z-axis in +X muzzle coords)
  if (isGun && Math.abs(elevDeg) > 1e-4) {
    const [minE, maxE] = spec.elevLimitsDeg;
    const clampedElev = Math.max(minE, Math.min(maxE, elevDeg));
    const phi = (clampedElev * Math.PI) / 180;
    const c = Math.cos(phi);
    const s = Math.sin(phi);
    const tx = spec.trunnionPivot[0];
    const ty = spec.trunnionPivot[1];
    const dx = pose.px - tx;
    const dy = pose.py - ty;
    pose.px = tx + dx * c - dy * s;
    pose.py = ty + dx * s + dy * c;
    pose.rz += phi;
  }

  // 2. Traverse turret ring + attached gun around vertical Y axis at `turretRingPivot`
  if (Math.abs(yawDeg) > 1e-4) {
    const theta = (yawDeg * Math.PI) / 180;
    const c = Math.cos(theta);
    const s = Math.sin(theta);
    const rx = spec.turretRingPivot[0];
    const rz = spec.turretRingPivot[2];
    const dx = pose.px - rx;
    const dz = pose.pz - rz;
    pose.px = rx + dx * c + dz * s;
    pose.pz = rz - dx * s + dz * c;
    pose.ry += theta;
  }
}

export interface TankCrewState {
  active: boolean;
  station: TankCrewStation;
  opticMode: TankOpticMode;
  turretYawDeg: number;
  gunElevDeg: number;
  lrfRangeM: number;
  targetSpeedKph: number;
  hullCantDeg: number;
  fcsReady: boolean;

  setActive: (active: boolean) => void;
  toggleActive: () => void;
  setStation: (station: TankCrewStation) => void;
  setOpticMode: (mode: TankOpticMode) => void;
  cycleOpticMode: (weaponId?: WeaponId) => void;
  setTurretYawDeg: (deg: number) => void;
  setGunElevDeg: (deg: number, weaponId?: WeaponId) => void;
  setLrfRangeM: (rangeM: number) => void;
  setTargetSpeedKph: (kph: number) => void;
  setHullCantDeg: (deg: number) => void;
  laseAndAutoLay: (weaponId: WeaponId) => void;
  resetForWeapon: (weaponId: WeaponId) => void;
}

export const useTankCrewStore = create<TankCrewState>((set, get) => ({
  active: false,
  station: 'exterior',
  opticMode: 'daylight',
  turretYawDeg: 0,
  gunElevDeg: 0,
  lrfRangeM: 1800,
  targetSpeedKph: 25,
  hullCantDeg: 0,
  fcsReady: true,

  setActive: (active) =>
    set((s) => ({
      active,
      station: active ? s.station : 'exterior',
      opticMode: active ? s.opticMode : 'daylight',
    })),

  toggleActive: () => {
    const cur = get();
    cur.setActive(!cur.active);
  },

  setStation: (station) => set({ station, active: true }),

  setOpticMode: (opticMode) => set({ opticMode }),

  cycleOpticMode: (weaponId) => {
    const cur = get();
    const profile = weaponId ? getTankGunnerOpticProfile(weaponId) : null;
    const modes: readonly TankOpticMode[] = profile
      ? profile.supportedOpticModes
      : ['daylight', 'flir_whot', 'flir_bhot'];
    const idx = modes.indexOf(cur.opticMode);
    const next = modes[(idx + 1) % modes.length] ?? modes[0];
    set({ opticMode: next });
  },

  setTurretYawDeg: (deg) =>
    set({
      turretYawDeg: Math.max(-180, Math.min(180, deg)),
    }),

  setGunElevDeg: (deg, weaponId) => {
    const spec = weaponId ? getTankCrewSpec(weaponId) : null;
    const [minE, maxE] = spec ? spec.elevLimitsDeg : [-10, 20];
    set({
      gunElevDeg: Math.max(minE, Math.min(maxE, deg)),
    });
  },

  setLrfRangeM: (rangeM) =>
    set({
      lrfRangeM: Math.max(200, Math.min(4000, Math.round(rangeM))),
    }),

  setTargetSpeedKph: (kph) =>
    set({
      targetSpeedKph: Math.max(-60, Math.min(60, Math.round(kph))),
    }),

  setHullCantDeg: (deg) =>
    set({
      hullCantDeg: Math.max(-10, Math.min(10, Number(deg.toFixed(1)))),
    }),

  laseAndAutoLay: (weaponId) => {
    const cur = get();
    const sol = computeTankFcsSolution(
      weaponId,
      cur.lrfRangeM,
      cur.targetSpeedKph
    );
    const spec = getTankCrewSpec(weaponId);
    const [minE, maxE] = spec ? spec.elevLimitsDeg : [-10, 20];
    set({
      gunElevDeg: Math.max(
        minE,
        Math.min(maxE, Number(sol.superelevationDeg.toFixed(2)))
      ),
      fcsReady: true,
    });
  },

  resetForWeapon: (weaponId) => {
    const isTank = isTankWeapon(weaponId);
    set({
      active: false,
      station: 'exterior',
      opticMode: 'daylight',
      turretYawDeg: 0,
      gunElevDeg: 0,
      lrfRangeM: isTank ? 1800 : 1200,
      targetSpeedKph: 25,
      hullCantDeg: 0,
      fcsReady: true,
    });
  },
}));

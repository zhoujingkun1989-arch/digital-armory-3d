import {
  G17_PARTS,
  G17PartSpec,
  GroupMeta,
  PART_GROUPS,
  TIMELINE_PRESETS,
} from './g17PartsSpec';
import {
  BallisticsVisualState,
  computeBallisticsState,
  computeFiringKinematics,
  FIRING_PHASES,
  FiringPhaseInfo,
  getActiveFiringPhase,
  PartKinematicDelta,
} from './firingCycleSpec';
import {
  AK15_PART_GROUPS,
  AK15_PARTS,
  AK15_TIMELINE_PRESETS,
} from './ak15PartsSpec';
import {
  AK15_FIRING_PHASES,
  computeAk15BallisticsState,
  computeAk15FiringKinematics,
  ExtendedBallisticsState,
  getActiveAk15FiringPhase,
} from './ak15FiringSpec';
import { AUG_MODULE } from './weapons/augModule';
import { AWM_MODULE } from './weapons/awmModule';
import { DEAGLE_MODULE } from './weapons/deagleModule';
import { M4A1_MODULE } from './weapons/m4a1Module';
import { M82A1_MODULE } from './weapons/m82a1Module';
import { MP5_MODULE } from './weapons/mp5Module';
import { P320_MODULE } from './weapons/p320Module';
import { SCAR_MODULE } from './weapons/scarModule';
import type { CameraPresetType } from '../store/useExplodeStore';

export type CaliberProfile =
  | '762_m43'
  | '556_nato'
  | '9mm_para'
  | '50_bmg'
  | '338_lapua'
  | '50_ae';

export type WeaponScaleProfile = 'pistol' | 'rifle' | 'heavy_sniper';

export type WeaponCameraMap = Record<
  CameraPresetType,
  { pos: [number, number, number]; target: [number, number, number] }
>;

export interface TimelinePresetItem {
  id: string;
  label: string;
  subLabel: string;
  t: number;
  desc: string;
}

export interface WeaponWorkbenchMeta {
  badge: string;
  title: string;
  subtitle: string;
  cutawayLabel: string;
  cutawayTitle: string;
  cutawayFocusPartId: string;
  searchPlaceholder: string;
  muzzlePos: [number, number, number];
  chamberGlowPos: [number, number, number];
  scaleProfile?: WeaponScaleProfile;
  gridY?: number;
}

const G17_CAMERA_PRESETS: WeaponCameraMap = {
  armory_showcase: { pos: [9.4, 1.4, 32.2], target: [0.3, -4.5, 0] },
  iso: { pos: [12.5, 7.2, 39.5], target: [0.2, -0.5, 0] },
  right: { pos: [0.5, 0.5, 39], target: [0.2, -0.5, 0] },
  left: { pos: [0.5, 0.5, -39], target: [0.2, -0.5, 0] },
  top: { pos: [0.5, 42, 4.0], target: [-0.5, 0, 0] },
  safe_action: { pos: [-1.6, 2.2, 11.5], target: [-3.5, 1.0, 0.2] },
  firing_view: { pos: [7.8, 3.8, 33.0], target: [4.6, 0.7, 0] },
};

const AK15_CAMERA_PRESETS: WeaponCameraMap = {
  armory_showcase: { pos: [16.5, 2.2, 62.5], target: [0.8, -6.6, 0] },
  iso: { pos: [14.5, 8.2, 45.5], target: [3.4, -1.0, 0] },
  right: { pos: [3.6, -0.5, 45.0], target: [3.6, -1.0, 0] },
  left: { pos: [3.6, -0.5, -45.0], target: [3.6, -1.0, 0] },
  top: { pos: [3.6, 48.0, 4.5], target: [3.6, 0, 0] },
  safe_action: { pos: [3.8, 3.0, 18.5], target: [1.4, 0.8, 0.2] },
  firing_view: { pos: [11.2, 4.4, 44.0], target: [5.8, -0.2, 0] },
};

const G17_META: WeaponWorkbenchMeta = {
  badge: 'GEN3 SCHEMATIC',
  title: 'G17 内部结构 3D 拆解与击发演示',
  subtitle:
    '4 大总成 · 28 核心节点 · 分阶段爆炸视图 & 动态击发抛壳全流程模拟',
  cutawayLabel: 'Safe Action 咬合特写',
  cutawayTitle: '切换至合拢透视状态并聚焦十字尾与击针啮合特写',
  cutawayFocusPartId: 'trigger_with_bar',
  searchPlaceholder: '搜索零件名 / 编号 (如 击针, U-08)...',
  muzzlePos: [11.4, 2.55, 0],
  chamberGlowPos: [0.85, 2.55, 0],
  scaleProfile: 'pistol',
  gridY: -18.5,
};

const AK15_META: WeaponWorkbenchMeta = {
  badge: '6П71М · OBR.2023',
  title: 'AK-15M1 内部结构 3D 拆解与击发演示',
  subtitle:
    '4 大总成 · 26 核心节点 · 长行程导气活塞回转闭锁 & 7.62×39mm 动态射击模拟',
  cutawayLabel: '回转枪机/击锤咬合特写',
  cutawayTitle: '切换至合拢透视状态并聚焦双突笋回转枪机与回转击锤咬合特写',
  cutawayFocusPartId: 'ak_bolt',
  searchPlaceholder: '搜索零件名 / 编号 (如 活塞, 枪机, B-03)...',
  muzzlePos: [25.5, 1.05, 0],
  chamberGlowPos: [5.4, 1.05, 0],
  scaleProfile: 'rifle',
  gridY: -24.5,
};

function toExtendedBallistics(
  st: BallisticsVisualState | ExtendedBallisticsState
): ExtendedBallisticsState {
  const maybeExt = st as Partial<ExtendedBallisticsState>;
  return {
    ...st,
    gasPortFlashIntensity: maybeExt.gasPortFlashIntensity ?? 0,
    gasPortPos: maybeExt.gasPortPos ?? [0, 0, 0],
  };
}

interface RegisteredWeaponEntry {
  id: string;
  partGroups: GroupMeta[];
  timelinePresets: readonly TimelinePresetItem[];
  parts: G17PartSpec[];
  firingPhases: FiringPhaseInfo[];
  getActiveFiringPhase: (f: number) => FiringPhaseInfo;
  computeFiringKinematics: (partId: string, f: number) => PartKinematicDelta;
  computeBallisticsState: (f: number) => ExtendedBallisticsState;
  caliberProfile: CaliberProfile;
  cameraPresets: WeaponCameraMap;
  workbenchMeta: WeaponWorkbenchMeta;
}

const AK15_ENTRY: RegisteredWeaponEntry = {
  id: 'ak15',
  partGroups: AK15_PART_GROUPS,
  timelinePresets: AK15_TIMELINE_PRESETS,
  parts: AK15_PARTS,
  firingPhases: AK15_FIRING_PHASES,
  getActiveFiringPhase: getActiveAk15FiringPhase,
  computeFiringKinematics: computeAk15FiringKinematics,
  computeBallisticsState: computeAk15BallisticsState,
  caliberProfile: '762_m43',
  cameraPresets: AK15_CAMERA_PRESETS,
  workbenchMeta: AK15_META,
};

const G17_ENTRY: RegisteredWeaponEntry = {
  id: 'g17',
  partGroups: PART_GROUPS,
  timelinePresets: TIMELINE_PRESETS,
  parts: G17_PARTS,
  firingPhases: FIRING_PHASES,
  getActiveFiringPhase: getActiveFiringPhase,
  computeFiringKinematics: computeFiringKinematics,
  computeBallisticsState: (f: number) =>
    toExtendedBallistics(computeBallisticsState(f)),
  caliberProfile: '9mm_para',
  cameraPresets: G17_CAMERA_PRESETS,
  workbenchMeta: G17_META,
};

const WEAPON_ORDERED_LIST: readonly RegisteredWeaponEntry[] = [
  AK15_ENTRY, // BAY-01
  M4A1_MODULE, // BAY-02
  MP5_MODULE, // BAY-03
  G17_ENTRY, // BAY-04
  M82A1_MODULE, // BAY-05
  AWM_MODULE, // BAY-06
  SCAR_MODULE, // BAY-07
  DEAGLE_MODULE, // BAY-08
  AUG_MODULE, // BAY-09
  P320_MODULE, // BAY-10
];

const WEAPON_REGISTRY_MAP: Record<string, RegisteredWeaponEntry> =
  Object.fromEntries(WEAPON_ORDERED_LIST.map((entry) => [entry.id, entry]));

const ALL_REGISTERED_PARTS_CACHE: G17PartSpec[] = WEAPON_ORDERED_LIST.flatMap(
  (entry) => entry.parts
);

function resolveWeaponEntry(weaponId: string): RegisteredWeaponEntry {
  return WEAPON_REGISTRY_MAP[weaponId] ?? G17_ENTRY;
}

const SHORT_WEAPON_LABELS: Record<string, string> = {
  ak15: 'AK-15M1',
  m4a1: 'M4A1',
  mp5: 'MP5A3',
  g17: 'G17',
  m82a1: 'M82A1',
  awm: 'AWM',
  scar: 'SCAR-L',
  deagle: '沙漠之鹰',
  aug: 'AUG A1',
  p320: 'P320 M17',
};

export function getShortWeaponLabel(weaponId: string): string {
  return SHORT_WEAPON_LABELS[weaponId] ?? weaponId.toUpperCase();
}

export function getWeaponCaliberProfile(weaponId: string): CaliberProfile {
  return resolveWeaponEntry(weaponId).caliberProfile;
}

export function getWeaponParts(weaponId: string): G17PartSpec[] {
  return resolveWeaponEntry(weaponId).parts;
}

export function getAllRegisteredParts(): G17PartSpec[] {
  return ALL_REGISTERED_PARTS_CACHE;
}

export function getWeaponPartGroups(weaponId: string): GroupMeta[] {
  return resolveWeaponEntry(weaponId).partGroups;
}

export function getWeaponTimelinePresets(
  weaponId: string
): readonly TimelinePresetItem[] {
  return resolveWeaponEntry(weaponId).timelinePresets;
}

export function getWeaponFiringPhases(weaponId: string): FiringPhaseInfo[] {
  return resolveWeaponEntry(weaponId).firingPhases;
}

export function getWeaponActiveFiringPhase(
  weaponId: string,
  f: number
): FiringPhaseInfo {
  return resolveWeaponEntry(weaponId).getActiveFiringPhase(f);
}

export function computeWeaponFiringKinematics(
  weaponId: string,
  partId: string,
  f: number
): PartKinematicDelta {
  return resolveWeaponEntry(weaponId).computeFiringKinematics(partId, f);
}

export function computeWeaponBallisticsState(
  weaponId: string,
  f: number
): ExtendedBallisticsState {
  return resolveWeaponEntry(weaponId).computeBallisticsState(f);
}

export function getWeaponCameraPresets(weaponId: string): WeaponCameraMap {
  return resolveWeaponEntry(weaponId).cameraPresets;
}

export function getWeaponWorkbenchMeta(weaponId: string): WeaponWorkbenchMeta {
  return resolveWeaponEntry(weaponId).workbenchMeta;
}

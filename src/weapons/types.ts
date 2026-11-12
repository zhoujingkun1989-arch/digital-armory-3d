import type * as THREE from 'three';

export const WEAPON_IDS = [
  'ak15',
  'm4a1',
  'mp5',
  'g17',
  'm82a1',
  'awm',
  'scar',
  'deagle',
  'aug',
  'p320',
] as const;

export type WeaponId = (typeof WEAPON_IDS)[number];

export type ArmoryCategory = 'all' | 'assault' | 'smg' | 'sniper' | 'pistol';

export type AssemblyGroupKey = 'slide' | 'frame' | 'fire_control' | 'magazine';

export type MaterialKind =
  | 'nitride_steel'
  | 'barrel_steel'
  | 'stainless'
  | 'polymer_frame'
  | 'spring_steel'
  | 'follower_orange'
  | 'copper_accent';

export type CaliberProfile =
  '762_m43' | '556_nato' | '9mm_para' | '50_bmg' | '338_lapua' | '50_ae';

export type WeaponScaleProfile = 'pistol' | 'rifle' | 'heavy_sniper';

export type CameraPresetType =
  | 'armory_showcase'
  | 'iso'
  | 'right'
  | 'left'
  | 'top'
  | 'cutaway_focus'
  | 'firing_view';

export type WeaponCameraMap = Record<
  CameraPresetType,
  { pos: [number, number, number]; target: [number, number, number] }
>;

export interface KeyframeStep {
  /** Normalized timeline interval [start, end] within [0, 1] */
  range: [number, number];
  /** Incremental world-space translation delta (X=+Forward, Y=+Up, Z=+RightSide) */
  offset: [number, number, number];
  /** Optional incremental Euler rotation delta in radians */
  rotation?: [number, number, number];
}

export type SilhouetteBoxBounds = readonly [
  minX: number,
  minY: number,
  minZ: number,
  maxX: number,
  maxY: number,
  maxZ: number,
];

export interface WeaponPartSpec {
  id: string;
  bomCode: string;
  nameZh: string;
  /** Concise editorial label shown at the tip of the architectural hairline leader */
  calloutLabel: string;
  nameEn: string;
  group: AssemblyGroupKey;
  material: MaterialKind;
  /** Whether this outer housing becomes translucent when X-Ray mode is active */
  isShell?: boolean;
  /** Base assembled position in world units (1 unit ≈ 1 cm) */
  assembledPos: [number, number, number];
  /** Base assembled Euler rotation [rx, ry, rz] in radians */
  assembledRot?: [number, number, number];
  /** Multi-stage anti-clipping disassembly trajectory */
  explodeSteps: KeyframeStep[];
  /** Vertical hairline callout direction ('up' | 'down') */
  calloutDir: 'up' | 'down';
  /** Base vertical hairline stem length in screen pixels */
  calloutStem: number;
  /** Optional custom 3D local anchor point on the component surface */
  calloutAnchor?: [number, number, number];
  /** Optional multi-box local bounds override for non-convex L-shaped receivers */
  silhouetteBoxes?: readonly SilhouetteBoxBounds[];
  /** Disassembly progress threshold [0..1] after which this component's callout emerges */
  labelAppearAt: number;
  /** Short functional tag */
  roleTag: string;
  /** Detailed mechanical principle & mating relationship */
  description: string;
}

export interface AssemblyGroupMeta {
  key: AssemblyGroupKey;
  nameZh: string;
  nameEn: string;
  badgeColor: string;
}

export interface TimelinePresetItem {
  id: string;
  label: string;
  subLabel: string;
  t: number;
  desc: string;
}

export interface FiringPhaseInfo {
  id: string;
  stepNum: string;
  shortLabel: string;
  title: string;
  range: [number, number];
  description: string;
}

export interface PartKinematicDelta {
  pos: [number, number, number];
  rot: [number, number, number];
  scaleX: number;
}

/** Pre-allocated mutable struct used in 60fps render & callout loops for zero GC pressure */
export interface MutablePartPose {
  px: number;
  py: number;
  pz: number;
  rx: number;
  ry: number;
  rz: number;
  sx: number;
}

export interface BallisticsVisualState {
  bulletVisible: boolean;
  bulletPos: [number, number, number];
  streakLength: number;
  spentCaseVisible: boolean;
  spentCasePos: [number, number, number];
  spentCaseRot: [number, number, number];
  spentCaseOpacity: number;
  chamberFlashIntensity: number;
  muzzlePlumeScale: number;
  muzzlePlumeOpacity: number;
  nextRoundPos: [number, number, number];
  nextRoundRotZ: number;
  reserveRoundPos: [number, number, number];
}

export interface ExtendedBallisticsState extends BallisticsVisualState {
  gasPortFlashIntensity: number;
  gasPortPos: [number, number, number];
}

export interface PbrBindingSpec {
  albedoFile: string;
  normalFile: string;
  roughnessFile: string;
  normalScale: number;
  repeat?: number;
  metalness?: number;
  roughness?: number;
}

export interface PbrChannelMeta {
  kind: 'Albedo' | 'Normal' | 'Roughness';
  labelCn: string;
  fileName: string;
  note: string;
}

export interface PbrSuiteItem {
  id: string;
  weapon: WeaponId;
  titleCn: string;
  partTag: string;
  resolution: string;
  summary: string;
  highlights: string[];
  channels: PbrChannelMeta[];
}

export interface WeaponSpecs1To1 {
  /** Exact real-world factory overall length (including folded/extended where applicable) */
  overallLengthMm: string;
  /** Exact barrel length in mm + rifling lands/twist specification */
  barrelSpec: string;
  /** Exact unloaded factory mass */
  emptyWeightKg: string;
  /** Standard service load muzzle velocity */
  muzzleVelocityMs: string;
  /** Effective point/area target range */
  effectiveRangeM: string;
  /** Cyclic or operational rate of fire */
  rateOfFire: string;
}

export interface ArmoryWeaponItem {
  id: WeaponId;
  bayCode: string;
  modelCode: string;
  nameCn: string;
  subtitleEn: string;
  originCountryCn?: string;
  weaponTypeCn?: string;
  category: 'pistol' | 'rifle' | 'smg' | 'sniper';
  categoryCn: string;
  caliber: string;
  actionMechanism: string;
  specs1To1: WeaponSpecs1To1;
  assembliesCount: number;
  partsCount: number;
  firingStagesCount: number;
  available: boolean;
  statusLabel: string;
  description: string;
  highlights: string[];
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
  scaleProfile: WeaponScaleProfile;
  gridY: number;
  /** Milestone label at 34% on the firing timeline scrubber */
  firingMilestoneLabel?: string;
}

/**
 * Lightweight static manifest loaded upfront (~8 KB for all 10 weapons) so the Armory
 * showcase UI renders instantaneously without pulling in 30k+ lines of CSG builders.
 */
export interface WeaponManifest {
  id: WeaponId;
  orderIndex: number;
  shortLabel: string;
  catalog: ArmoryWeaponItem;
  caliberProfile: CaliberProfile;
  cameraPresets: WeaponCameraMap;
  workbenchMeta: WeaponWorkbenchMeta;
  atlasHeadingCn: string;
}

/**
 * Dynamically loaded runtime plugin containing BOM specifications, multi-stage
 * disassembly keyframes, 7-phase firing kinematics, ballistics, and PBR metadata.
 */
export interface WeaponRuntimePlugin {
  id: WeaponId;
  partGroups: AssemblyGroupMeta[];
  timelinePresets: readonly TimelinePresetItem[];
  parts: WeaponPartSpec[];
  firingPhases: FiringPhaseInfo[];
  getActiveFiringPhase: (f: number) => FiringPhaseInfo;
  computeFiringKinematics: (partId: string, f: number) => PartKinematicDelta;
  computeBallisticsState: (f: number) => ExtendedBallisticsState;
  pbrBindings: Record<string, PbrBindingSpec>;
  pbrSuites: PbrSuiteItem[];
}

/**
 * Heavy CSG & parametric geometry builders module, dynamically imported inside
 * the background Geometry Web Worker (or main-thread fallback in non-worker envs).
 */
export interface WeaponGeometryModule {
  geometryBuilders: Record<string, () => THREE.BufferGeometry>;
}

export function isWeaponId(val: string | null | undefined): val is WeaponId {
  return !!val && (WEAPON_IDS as readonly string[]).includes(val);
}

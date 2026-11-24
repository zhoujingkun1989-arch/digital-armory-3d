import { create } from 'zustand';
import {
  clampSectionCutOffset,
  getDefaultSectionBoxParams,
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
  type SectionCutAxis,
  syncLiveSectionBoxPlanes,
  syncLiveSectionCutPlane,
} from '../engine/actors/StencilSectionCap';

export {
  clampSectionCutOffset,
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
  type SectionCutAxis,
};
import {
  type AcousticEnvironmentPreset,
  setAcousticEnvironment,
} from '../engine/audio/mechanicalSoundEngine';
import type { ArmoryEnvironmentPreset } from '../engine/canvas/GunsmithStageMat';
import {
  detectDefaultGraphicsQuality,
  GRAPHICS_QUALITY_TIERS,
  type GraphicsQualityTier,
} from '../engine/canvas/graphicsQuality';
import { setGpuTelemetryEnabled } from '../engine/canvas/gpuTelemetryBus';
import { playbackClock } from '../engine/clock/playbackClock';
import { caliperStore } from '../engine/caliper/caliperStore';
import {
  isCaliberProfile,
  isTankOrdnanceProfile,
} from '../engine/cartridges/cartridgeSpecs';
import { fieldStripStore } from '../engine/fieldstrip/fieldStripStore';
import { interactiveActionStore } from '../engine/interaction/InteractiveActionController';
import { malfunctionStore } from '../engine/malfunctions/malfunctionStore';
import type { MalfunctionKind } from '../engine/malfunctions/malfunctionSpecs';
import {
  ARMORY_WEAR_PRESET_LEVELS,
  type ArmoryWearPreset,
  DEFAULT_ARMORY_WEAR_LEVEL,
  setArmoryThermalVisualState,
  setArmoryWearLevel,
} from '../engine/materials/armoryShader';
import type { EngineeringRole } from '../engine/materials/engineeringRoles';
import { resetArmoryPhysics } from '../engine/physics/armoryPhysics';
import type {
  ArmorTargetTankId,
  PenetratorId,
} from '../engine/physics/armorPenetration';
import { useCausalitySandboxStore } from '../engine/physics/causalitySandbox';
import { useAttachmentStore } from '../engine/attachments/attachmentStore';
import { useTankCrewStore } from '../engine/tank/tankCrewStore';
import {
  type ExternalProjectileId,
  type ExternalProjectileInput,
  normalizeExternalProjectileId,
} from '../engine/physics/externalBallistics';
import type {
  MonographCaptureQuality,
  MonographEdition,
  MonographLayoutMode,
  MonographPageMode,
  MonographStyleMode,
} from '../features/monograph/monographCaptureStore';
import {
  getNarrationAudioSnapshot,
  stopNarrationAudio,
} from '../narration/audioPlayer';
import type { LanguageCode } from '../narration/types';
import { getWeaponManifest } from '../weapons/manifests';
import { resolveArmorLabPresetForWeapon } from '../weapons/museumMetrics';
import { getLoadedWeaponPlugin, loadWeaponPlugin } from '../weapons/registry';
import type {
  AssemblyGroupKey,
  CaliberProfile,
  CameraPresetType,
  WeaponId,
} from '../weapons/types';
import { isWeaponId } from '../weapons/types';

export type AppScreen =
  | 'showcase'
  | 'armory'
  | 'workbench'
  | 'cartridges'
  | 'ballistics'
  | 'split_showdown';
export type AppViewMode = 'explode' | 'firing';
export type PosterArmorerRankOption = 'S' | 'A' | 'B' | 'C';

export interface PosterModalLaunchOptions {
  weaponId?: WeaponId;
  armorerRank?: PosterArmorerRankOption | null;
}

export interface ArmorPenetrationLaunchOptions {
  projectileId?: PenetratorId;
  targetTankId?: ArmorTargetTankId;
}

export interface MonographModalLaunchOptions {
  styleMode?: MonographStyleMode;
  edition?: MonographEdition;
  layoutMode?: MonographLayoutMode;
  pageMode?: MonographPageMode;
  quality?: MonographCaptureQuality;
  prepress?: boolean;
  collectorCallsign?: string;
}

const ENVIRONMENT_PRESET_CYCLE: readonly ArmoryEnvironmentPreset[] = [
  'tactical_vault',
  'gunsmith_bench',
  'blueprint_daylight',
];

/**
 * Maps visual studio environment + active workbench mode to the matching
 * stereo convolution IR room preset in `mechanicalSoundEngine`.
 */
export function resolveAcousticEnvironmentForState(
  environmentPreset: ArmoryEnvironmentPreset,
  mode: AppViewMode
): AcousticEnvironmentPreset {
  if (environmentPreset === 'tactical_vault') {
    return mode === 'firing' ? 'indoor_range' : 'tactical_hall';
  }
  return 'bench_close';
}

function resetWeaponPhysicsAndAction(
  weaponId: WeaponId,
  fullActionReset: boolean
): void {
  resetArmoryPhysics();
  setArmoryThermalVisualState({
    weaponId,
    barrelHeat01: 0,
    carbonFouling01: 0,
  });
  if (fullActionReset) {
    interactiveActionStore.reset(weaponId);
  } else {
    interactiveActionStore.syncWeapon(weaponId);
  }
}

export interface StoryDirectorStageSpec {
  weaponId: WeaponId;
  mode: AppViewMode;
  targetProgress: number;
  sectionCut: boolean;
  xrayShells: boolean;
  focusPartId: string | null;
  cameraPreset: CameraPresetType;
  fireSpeedMultiplier?: 0.25 | 0.5 | 1.0;
}

const DEFAULT_HIDDEN_GROUPS: Record<AssemblyGroupKey, boolean> = {
  slide: false,
  frame: false,
  fire_control: false,
  magazine: false,
};

export interface NavigatorLanguageLike {
  language?: string;
  languages?: readonly string[];
}

/**
 * Resolves the browser's natural preferred UI language (`'zh'` for `zh*` locales,
 * `'en'` for all international browser locales, and deterministic `'zh'` in headless Node/SSR).
 */
export function detectBrowserDefaultLanguage(
  navOverride?: NavigatorLanguageLike | null
): LanguageCode {
  const nav: NavigatorLanguageLike | null =
    navOverride !== undefined
      ? navOverride
      : typeof window !== 'undefined' && typeof navigator !== 'undefined'
        ? navigator
        : null;
  if (!nav) return 'zh';

  const primary =
    (Array.isArray(nav.languages) && nav.languages.length > 0
      ? nav.languages[0]
      : nav.language) ?? '';
  const normalized = primary.trim().toLowerCase();
  if (!normalized) return 'zh';
  return normalized.startsWith('zh') ? 'zh' : 'en';
}

/**
 * Resolves initial UI language, honoring explicit `?lang=zh|en` query overrides first,
 * then falling back to `detectBrowserDefaultLanguage`.
 */
export function detectPreferredLanguage(
  navOverride?: NavigatorLanguageLike | null,
  searchOverride?: string
): LanguageCode {
  const rawSearch =
    searchOverride !== undefined
      ? searchOverride
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  if (rawSearch) {
    const params = new URLSearchParams(rawSearch);
    const qLang = params.get('lang');
    if (qLang === 'en' || qLang === 'zh') {
      return qLang;
    }
  }
  return detectBrowserDefaultLanguage(navOverride);
}

export interface AppState {
  /** Top-level navigation screen: Armory Vault vs 3D Disassembly Workbench */
  screen: AppScreen;
  activeWeaponId: WeaponId;
  armoryAutoRotate: boolean;
  workbenchAutoOrbit: boolean;

  /** Bilingual UI & narration state */
  lang: LanguageCode;
  storyOpen: boolean;
  storyMinimized: boolean;
  storyDirectorMode: boolean;
  inspectorMinimized: boolean;
  autoPlayPartAudio: boolean;
  sfxMuted: boolean;

  /** Active interactive mode inside Workbench: Exploded Disassembly vs Dynamic Firing Cycle */
  mode: AppViewMode;

  /** Disassembly playback flags (60fps float progress lives in `playbackClock`) */
  isPlaying: boolean;
  playDirection: 1 | -1;
  playSpeed: number;

  /** Firing cycle playback flags (60fps float progress lives in `playbackClock`) */
  isFiringPlaying: boolean;
  fireLoop: boolean;
  fireSpeedMultiplier: 0.25 | 0.5 | 1.0;

  /** Studio lighting/stage environment, post-processing, wear patina & adaptive GPU quality */
  environmentPreset: ArmoryEnvironmentPreset;
  postFxEnabled: boolean;
  telemetryHudOpen: boolean;
  gpuTelemetryOpen: boolean;
  weaponWearLevel: number;
  graphicsQuality: GraphicsQualityTier;
  qualityLockedByUser: boolean;
  macroDofEnabled: boolean;

  /** Visual toggles */
  pbrTexturesEnabled: boolean;
  textureModalOpen: boolean;
  monographModalOpen: boolean;
  monographWeaponId: WeaponId;
  monographLaunchOptions: MonographModalLaunchOptions | null;
  posterShareModalOpen: boolean;
  posterShareOptions: PosterModalLaunchOptions | null;
  causalitySandboxOpen: boolean;
  armorPenetrationModalOpen: boolean;
  armorPenetrationLaunchOptions: ArmorPenetrationLaunchOptions | null;
  directorReelModalOpen: boolean;
  passportModalOpen: boolean;
  timelineModalOpen: boolean;
  offlineModalOpen: boolean;
  scaleWallModalOpen: boolean;
  commandPaletteOpen: boolean;
  xrayShells: boolean;
  sectionCut: boolean;
  sectionCutAxis: SectionCutAxis;
  sectionCutOffset: number;
  sectionCutFlip: boolean;
  sectionBoxCenter: [number, number, number];
  sectionBoxHalfSize: [number, number, number];
  showEdges: boolean;
  showLabels: boolean;
  labelsUserToggled: boolean;
  isolateSelected: boolean;
  sidebarCollapsed: boolean;
  hudHidden: boolean;

  /** WP-05 Engineering Functional Role Tint & Gas Flow Streamlines */
  engineeringTint: boolean;
  focusedEngineeringRole: EngineeringRole | null;
  gasFlowVisible: boolean;

  /** WP-07 Hands-On Guided Military Field-Strip Mode */
  fieldStripActive: boolean;

  /** WP-09 Classic Firearm Malfunction Cutaway & Clearing Diagnostics */
  malfunctionActive: boolean;

  /** WP-10 1:1 3D Armorer Vernier Caliper & Envelope Scale Ruler */
  caliperActive: boolean;
  envelopeRulerVisible: boolean;

  /** WP-06 1:1 SAAMI/CIP Cartridge Cutaway Lab */
  activeCartridgeCaliber: CaliberProfile;
  cartridgeLineupOverview: boolean;
  cartridgeSectionCut: boolean;
  cartridgeExplodeProgress: number;
  cartridgeCameraSeq: number;

  /** WP-14 1,000m RK4 External Ballistics Range Lab */
  activeBallisticsCaliber: ExternalProjectileId;

  /** WP-19 Live 3D Split-Screen Synchronized Mechanism Showdown */
  splitShowdownWeaponA: WeaponId;
  splitShowdownWeaponB: WeaponId;

  /** Group visibility filters */
  hiddenGroups: Record<AssemblyGroupKey, boolean>;

  /** Selection & hover */
  selectedPartId: string | null;
  hoveredPartId: string | null;

  /** Camera control command (cameraEffectSeq bumps when progress jump should re-frame) */
  cameraCommand: { preset: CameraPresetType; seq: number };

  // Bilingual & Story Narration Actions
  setLang: (lang: LanguageCode) => void;
  toggleLang: () => void;
  setStoryOpen: (open: boolean) => void;
  setStoryMinimized: (minimized: boolean) => void;
  toggleStoryOpen: () => void;
  setStoryDirectorMode: (enabled: boolean) => void;
  toggleStoryDirectorMode: () => void;
  applyStoryDirectorStage: (stage: StoryDirectorStageSpec) => void;
  setInspectorMinimized: (minimized: boolean) => void;
  toggleInspectorMinimized: () => void;
  toggleAutoPlayPartAudio: () => void;
  setSfxMuted: (muted: boolean) => void;
  toggleSfxMuted: () => void;
  focusStoryPart: (partId: string) => void;

  // Armory <-> Workbench <-> Showcase <-> Cartridge Lab <-> External Ballistics Navigation Actions
  openShowcase: () => void;
  openCartridgeLab: (caliber?: CaliberProfile) => void;
  selectLabCartridge: (caliber: CaliberProfile, focusCamera?: boolean) => void;
  setCartridgeLineupOverview: (overview: boolean) => void;
  toggleCartridgeSectionCut: () => void;
  setCartridgeExplodeProgress: (val: number) => void;
  openExternalBallistics: (caliber?: ExternalProjectileInput) => void;
  setActiveBallisticsCaliber: (caliber: ExternalProjectileInput) => void;
  openSplitShowdown: (weaponA?: string, weaponB?: string) => void;
  setSplitShowdownWeapons: (weaponA: string, weaponB: string) => void;
  selectArmoryWeapon: (weaponId: string) => void;
  enterWorkbench: (weaponId?: string, initialMode?: AppViewMode) => void;
  returnToArmory: () => void;
  toggleArmoryAutoRotate: () => void;
  setWorkbenchAutoOrbit: (enabled: boolean) => void;
  toggleWorkbenchAutoOrbit: () => void;

  // Disassembly Actions
  setMode: (mode: AppViewMode) => void;
  setTargetProgress: (t: number) => void;
  togglePlay: () => void;
  stopPlay: () => void;
  setPlaySpeed: (speed: number) => void;

  // Firing Simulation Actions
  setFireProgress: (f: number) => void;
  toggleFiringPlay: () => void;
  stopFiringPlay: () => void;
  triggerSingleShot: () => void;
  toggleFireLoop: () => void;
  setFireSpeedMultiplier: (mult: 0.25 | 0.5 | 1.0) => void;

  // Studio Environment, PostFX, Service Wear & Adaptive Quality Actions
  setEnvironmentPreset: (preset: ArmoryEnvironmentPreset) => void;
  cycleEnvironmentPreset: () => void;
  setPostFxEnabled: (enabled: boolean) => void;
  togglePostFx: () => void;
  setTelemetryHudOpen: (open: boolean) => void;
  toggleTelemetryHud: () => void;
  setGpuTelemetryOpen: (open: boolean) => void;
  toggleGpuTelemetry: () => void;
  setWeaponWearLevel: (level: number) => void;
  setWeaponWearPreset: (preset: ArmoryWearPreset) => void;
  setGraphicsQuality: (
    tier: GraphicsQualityTier,
    lockedByUser?: boolean
  ) => void;
  cycleGraphicsQuality: () => void;
  toggleMacroDof: () => void;

  // Shared Visual & Selection Actions
  togglePbrTextures: () => void;
  setTextureModalOpen: (open: boolean) => void;
  openMonographModal: (
    weaponId?: WeaponId,
    options?: MonographModalLaunchOptions | null
  ) => void;
  closeMonographModal: () => void;
  setMonographWeaponId: (weaponId: WeaponId) => void;
  openPosterModal: (options?: PosterModalLaunchOptions) => void;
  closePosterModal: () => void;
  togglePosterModal: (options?: PosterModalLaunchOptions) => void;
  setCausalitySandboxOpen: (open: boolean) => void;
  toggleCausalitySandbox: () => void;
  setArmorPenetrationModalOpen: (open: boolean) => void;
  openArmorPenetrationModal: (options?: ArmorPenetrationLaunchOptions) => void;
  closeArmorPenetrationModal: () => void;
  setDirectorReelModalOpen: (open: boolean) => void;
  openDirectorReelModal: () => void;
  closeDirectorReelModal: () => void;
  setPassportModalOpen: (open: boolean) => void;
  openPassportModal: () => void;
  closePassportModal: () => void;
  setTimelineModalOpen: (open: boolean) => void;
  openTimelineModal: () => void;
  closeTimelineModal: () => void;
  setOfflineModalOpen: (open: boolean) => void;
  openOfflineModal: () => void;
  closeOfflineModal: () => void;
  setScaleWallModalOpen: (open: boolean) => void;
  openScaleWallModal: () => void;
  closeScaleWallModal: () => void;
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  focusWorkbenchPart: (partId: string) => void;
  toggleXrayShells: () => void;
  setXrayShells: (val: boolean) => void;
  toggleSectionCut: () => void;
  setSectionCut: (val: boolean) => void;
  setSectionCutAxis: (axis: SectionCutAxis) => void;
  setSectionCutOffset: (offset: number) => void;
  resetSectionCutOffset: () => void;
  toggleSectionCutFlip: () => void;
  setSectionBoxCenter: (center: readonly [number, number, number]) => void;
  setSectionBoxHalfSize: (halfSize: readonly [number, number, number]) => void;
  toggleShowEdges: () => void;
  toggleShowLabels: () => void;
  toggleIsolateSelected: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  setHudHidden: (hidden: boolean) => void;
  toggleHudHidden: () => void;
  setEngineeringTint: (enabled: boolean) => void;
  toggleEngineeringTint: () => void;
  setFocusedEngineeringRole: (role: EngineeringRole | null) => void;
  setGasFlowVisible: (visible: boolean) => void;
  toggleGasFlowVisible: () => void;
  setFieldStripActive: (active: boolean) => void;
  toggleFieldStripMode: () => void;
  setMalfunctionActive: (active: boolean, kind?: MalfunctionKind) => void;
  toggleMalfunctionMode: () => void;
  setCaliperActive: (active: boolean) => void;
  toggleCaliperMode: () => void;
  setEnvelopeRulerVisible: (visible: boolean) => void;
  toggleEnvelopeRuler: () => void;
  toggleGroupVisibility: (group: AssemblyGroupKey) => void;
  selectPart: (partId: string | null) => void;
  hoverPart: (partId: string | null) => void;
  triggerCameraPreset: (preset: CameraPresetType) => void;
  activateCutawayFocus: () => void;
  resetAll: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'showcase',
  activeWeaponId: 'ak15',
  armoryAutoRotate: true,
  workbenchAutoOrbit: false,

  lang: detectPreferredLanguage(),
  storyOpen: false,
  storyMinimized: false,
  storyDirectorMode: true,
  inspectorMinimized: false,
  autoPlayPartAudio: true,
  sfxMuted: false,

  mode: 'explode',

  isPlaying: false,
  playDirection: 1,
  playSpeed: 0.16,

  isFiringPlaying: false,
  fireLoop: true,
  fireSpeedMultiplier: 0.5,

  environmentPreset: 'tactical_vault',
  postFxEnabled: true,
  telemetryHudOpen: true,
  gpuTelemetryOpen: false,
  weaponWearLevel: DEFAULT_ARMORY_WEAR_LEVEL,
  graphicsQuality: detectDefaultGraphicsQuality(),
  qualityLockedByUser: false,
  macroDofEnabled: true,

  pbrTexturesEnabled: true,
  textureModalOpen: false,
  monographModalOpen: false,
  monographWeaponId: 'ak15',
  monographLaunchOptions: null,
  posterShareModalOpen: false,
  posterShareOptions: null,
  causalitySandboxOpen: false,
  armorPenetrationModalOpen: false,
  armorPenetrationLaunchOptions: null,
  directorReelModalOpen: false,
  passportModalOpen: false,
  timelineModalOpen: false,
  offlineModalOpen: false,
  scaleWallModalOpen: false,
  commandPaletteOpen: false,
  xrayShells: false,
  sectionCut: false,
  sectionCutAxis: 'z',
  sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
  sectionCutFlip: false,
  sectionBoxCenter: [...getDefaultSectionBoxParams('rifle').center] as [
    number,
    number,
    number,
  ],
  sectionBoxHalfSize: [...getDefaultSectionBoxParams('rifle').halfSize] as [
    number,
    number,
    number,
  ],
  showEdges: false,
  showLabels: false,
  labelsUserToggled: false,
  isolateSelected: false,
  sidebarCollapsed: true,
  hudHidden: false,

  engineeringTint: false,
  focusedEngineeringRole: null,
  gasFlowVisible: true,
  fieldStripActive: false,
  malfunctionActive: false,
  caliperActive: false,
  envelopeRulerVisible: false,

  activeCartridgeCaliber: '556_nato',
  cartridgeLineupOverview: true,
  cartridgeSectionCut: true,
  cartridgeExplodeProgress: 0,
  cartridgeCameraSeq: 0,
  activeBallisticsCaliber: '338_lapua',
  splitShowdownWeaponA: 'ak15',
  splitShowdownWeaponB: 'm4a1',

  hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },

  selectedPartId: null,
  hoveredPartId: null,

  cameraCommand: { preset: 'armory_showcase', seq: 0 },

  setLang: (lang) => {
    if (get().lang !== lang) {
      stopNarrationAudio();
      set({ lang });
    }
  },

  toggleLang: () => {
    stopNarrationAudio();
    set((s) => ({ lang: s.lang === 'zh' ? 'en' : 'zh' }));
  },

  setStoryOpen: (storyOpen) =>
    set((s) => ({
      storyOpen,
      storyMinimized: false,
      hudHidden: storyOpen ? false : s.hudHidden,
    })),

  setStoryMinimized: (storyMinimized) => set({ storyMinimized }),

  toggleStoryOpen: () =>
    set((s) => {
      if (!s.storyOpen) {
        return { storyOpen: true, storyMinimized: false, hudHidden: false };
      }
      if (s.storyMinimized) {
        return { storyMinimized: false, hudHidden: false };
      }
      const snap = getNarrationAudioSnapshot();
      if (snap.activeKind === 'story' && snap.isPlaying) {
        return { storyMinimized: true };
      }
      return { storyOpen: false, storyMinimized: false };
    }),

  setStoryDirectorMode: (storyDirectorMode) => set({ storyDirectorMode }),

  toggleStoryDirectorMode: () =>
    set((s) => ({ storyDirectorMode: !s.storyDirectorMode })),

  applyStoryDirectorStage: (stage) => {
    const cur = get();
    fieldStripStore.syncWeapon(stage.weaponId, true);
    malfunctionStore.syncWeapon(stage.weaponId, false);
    caliperStore.syncWeapon(stage.weaponId, true);
    caliperStore.clearTransientHover();
    if (cur.activeWeaponId !== stage.weaponId) {
      resetWeaponPhysicsAndAction(stage.weaponId, false);
    } else {
      interactiveActionStore.syncWeapon(stage.weaponId);
    }
    if (stage.mode === 'firing') {
      playbackClock.setTargetProgress(0, true);
      if (cur.mode !== 'firing' || cur.activeWeaponId !== stage.weaponId) {
        playbackClock.setFireProgress(0, true);
      }
      set({
        screen: 'workbench',
        activeWeaponId: stage.weaponId,
        mode: 'firing',
        fieldStripActive: false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        isPlaying: false,
        isFiringPlaying: true,
        fireLoop: true,
        fireSpeedMultiplier: stage.fireSpeedMultiplier ?? 0.25,
        textureModalOpen: false,
        sectionCut: stage.sectionCut,
        sectionCutAxis: 'z',
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        xrayShells: stage.sectionCut ? false : stage.xrayShells,
        showLabels: true,
        isolateSelected: false,
        selectedPartId: null,
        hoveredPartId: null,
        inspectorMinimized: true,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: {
          preset: stage.cameraPreset,
          seq: cur.cameraCommand.seq + 1,
        },
      });
      return;
    }

    playbackClock.setFireProgress(0, true);
    playbackClock.setTargetProgress(stage.targetProgress, false);

    const commitExplodeStage = () => {
      const live = get();
      set({
        screen: 'workbench',
        activeWeaponId: stage.weaponId,
        mode: 'explode',
        fieldStripActive: false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        isPlaying: false,
        isFiringPlaying: false,
        textureModalOpen: false,
        sectionCut: stage.sectionCut,
        sectionCutAxis: 'z',
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        xrayShells: stage.sectionCut ? false : stage.xrayShells,
        showLabels: true,
        isolateSelected: false,
        selectedPartId: stage.focusPartId,
        hoveredPartId: null,
        inspectorMinimized: true,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: {
          preset: stage.cameraPreset,
          seq: live.cameraCommand.seq + 1,
        },
      });
    };

    commitExplodeStage();
    if (stage.focusPartId && !getLoadedWeaponPlugin(stage.weaponId)) {
      const targetPart = stage.focusPartId;
      void loadWeaponPlugin(stage.weaponId).then(() => {
        const after = get();
        if (
          after.activeWeaponId === stage.weaponId &&
          after.selectedPartId === targetPart
        ) {
          set({ selectedPartId: null });
          set({ selectedPartId: targetPart });
        }
      });
    }
  },

  setInspectorMinimized: (inspectorMinimized) => set({ inspectorMinimized }),

  toggleInspectorMinimized: () =>
    set((s) => ({ inspectorMinimized: !s.inspectorMinimized })),

  toggleAutoPlayPartAudio: () =>
    set((s) => ({ autoPlayPartAudio: !s.autoPlayPartAudio })),

  setSfxMuted: (sfxMuted) => set({ sfxMuted }),

  toggleSfxMuted: () => set((s) => ({ sfxMuted: !s.sfxMuted })),

  focusStoryPart: (partId) => {
    const s = get();
    const weaponId = s.activeWeaponId;
    fieldStripStore.reset(weaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);

    const applyFocus = () => {
      const cur = get();
      set({
        screen: 'workbench',
        mode: 'explode',
        fieldStripActive: false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        storyOpen: cur.storyOpen,
        storyMinimized: cur.storyOpen,
        inspectorMinimized: false,
        isPlaying: false,
        isFiringPlaying: false,
        textureModalOpen: false,
        commandPaletteOpen: false,
        xrayShells: true,
        sectionCut: false,
        sectionCutAxis: 'z',
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        showLabels: true,
        isolateSelected: false,
        selectedPartId: partId,
        hoveredPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand:
          cur.screen === 'workbench'
            ? cur.cameraCommand
            : { preset: 'iso', seq: cur.cameraCommand.seq + 1 },
      });
    };

    if (getLoadedWeaponPlugin(weaponId)) {
      applyFocus();
    } else {
      applyFocus();
      void loadWeaponPlugin(weaponId).then(() => {
        if (get().activeWeaponId === weaponId) {
          set({ selectedPartId: null });
          set({ selectedPartId: partId });
        }
      });
    }
  },

  openShowcase: () => {
    stopNarrationAudio();
    fieldStripStore.reset(get().activeWeaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      screen: 'showcase',
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      armoryAutoRotate: true,
      storyOpen: false,
      storyMinimized: false,
      inspectorMinimized: false,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      xrayShells: false,
      sectionCut: false,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      commandPaletteOpen: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
      cameraCommand: {
        preset: 'armory_showcase',
        seq: s.cameraCommand.seq + 1,
      },
    }));
  },

  openCartridgeLab: (caliber) => {
    const s = get();
    const snap = getNarrationAudioSnapshot();
    const keepStoryMini =
      s.storyOpen && snap.activeKind === 'story' && snap.isPlaying;
    if (!keepStoryMini) {
      stopNarrationAudio();
    }
    fieldStripStore.reset(s.activeWeaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    const rawCaliber =
      caliber ?? getWeaponManifest(s.activeWeaponId).caliberProfile;
    const nextCaliber: CaliberProfile =
      isCaliberProfile(rawCaliber) || isTankOrdnanceProfile(rawCaliber)
        ? rawCaliber
        : '556_nato';
    set({
      screen: 'cartridges',
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      activeCartridgeCaliber: nextCaliber,
      cartridgeLineupOverview: caliber === undefined,
      cartridgeSectionCut: true,
      cartridgeExplodeProgress: 0,
      cartridgeCameraSeq: s.cartridgeCameraSeq + 1,
      storyOpen: keepStoryMini,
      storyMinimized: keepStoryMini,
      inspectorMinimized: false,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      commandPaletteOpen: false,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
    });
  },

  selectLabCartridge: (caliber, focusCamera = true) =>
    set((s) => ({
      activeCartridgeCaliber:
        isCaliberProfile(caliber) || isTankOrdnanceProfile(caliber)
          ? caliber
          : '556_nato',
      cartridgeLineupOverview: focusCamera ? false : s.cartridgeLineupOverview,
      cartridgeCameraSeq: s.cartridgeCameraSeq + 1,
    })),

  setCartridgeLineupOverview: (cartridgeLineupOverview) =>
    set((s) => ({
      cartridgeLineupOverview,
      cartridgeCameraSeq: s.cartridgeCameraSeq + 1,
    })),

  toggleCartridgeSectionCut: () =>
    set((s) => ({ cartridgeSectionCut: !s.cartridgeSectionCut })),

  setCartridgeExplodeProgress: (val) =>
    set({
      cartridgeExplodeProgress: Math.max(0, Math.min(1, val)),
    }),

  openExternalBallistics: (caliber) => {
    const s = get();
    const snap = getNarrationAudioSnapshot();
    const keepStoryMini =
      s.storyOpen && snap.activeKind === 'story' && snap.isPlaying;
    if (!keepStoryMini) {
      stopNarrationAudio();
    }
    fieldStripStore.reset(s.activeWeaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    const fallbackCaliber = getWeaponManifest(s.activeWeaponId).caliberProfile;
    const nextCaliber = normalizeExternalProjectileId(
      caliber ?? fallbackCaliber
    );
    set({
      screen: 'ballistics',
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      activeBallisticsCaliber: nextCaliber,
      storyOpen: keepStoryMini,
      storyMinimized: keepStoryMini,
      inspectorMinimized: false,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      monographModalOpen: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      commandPaletteOpen: false,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      hudHidden: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
    });
  },

  setActiveBallisticsCaliber: (caliber) =>
    set({
      activeBallisticsCaliber: normalizeExternalProjectileId(caliber),
    }),

  openSplitShowdown: (weaponA, weaponB) => {
    const s = get();
    stopNarrationAudio();
    fieldStripStore.reset(s.activeWeaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, true);
    playbackClock.setFireProgress(0, true);
    playbackClock.setAnimatedFireProgress(0);
    const nextA: WeaponId = isWeaponId(weaponA) ? weaponA : s.activeWeaponId;
    const rawB: WeaponId = isWeaponId(weaponB)
      ? weaponB
      : nextA === 'm4a1'
        ? 'ak15'
        : 'm4a1';
    const nextB: WeaponId =
      rawB === nextA ? (nextA === 'm4a1' ? 'ak15' : 'm4a1') : rawB;
    set({
      screen: 'split_showdown',
      splitShowdownWeaponA: nextA,
      splitShowdownWeaponB: nextB,
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      engineeringTint: false,
      storyOpen: false,
      storyMinimized: false,
      inspectorMinimized: false,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      monographModalOpen: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      commandPaletteOpen: false,
      xrayShells: false,
      sectionCut: false,
      sectionCutAxis: 'z',
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      hudHidden: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
    });
  },

  setSplitShowdownWeapons: (weaponA, weaponB) => {
    const nextA: WeaponId = isWeaponId(weaponA)
      ? weaponA
      : get().splitShowdownWeaponA;
    const nextB: WeaponId = isWeaponId(weaponB)
      ? weaponB
      : get().splitShowdownWeaponB;
    set({
      splitShowdownWeaponA: nextA,
      splitShowdownWeaponB: nextB === nextA ? (nextA === 'm4a1' ? 'ak15' : 'm4a1') : nextB,
    });
  },

  selectArmoryWeapon: (weaponIdRaw) => {
    const weaponId: WeaponId = isWeaponId(weaponIdRaw) ? weaponIdRaw : 'ak15';
    if (get().activeWeaponId !== weaponId) {
      stopNarrationAudio();
      resetWeaponPhysicsAndAction(weaponId, false);
      fieldStripStore.syncWeapon(weaponId, true);
      malfunctionStore.syncWeapon(weaponId, false);
      caliperStore.syncWeapon(weaponId, true);
    } else {
      interactiveActionStore.syncWeapon(weaponId);
    }
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      activeWeaponId: weaponId,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      inspectorMinimized: false,
      selectedPartId: null,
      hoveredPartId: null,
      cameraCommand: {
        preset: 'armory_showcase',
        seq: s.cameraCommand.seq + 1,
      },
    }));
  },

  enterWorkbench: (weaponIdRaw, initialMode = 'explode') => {
    const s = get();
    const nextWeaponId: WeaponId = isWeaponId(weaponIdRaw)
      ? weaponIdRaw
      : s.activeWeaponId;
    const sameWeapon = nextWeaponId === s.activeWeaponId;
    if (!sameWeapon) {
      stopNarrationAudio();
      resetWeaponPhysicsAndAction(nextWeaponId, false);
      fieldStripStore.syncWeapon(nextWeaponId, true);
      malfunctionStore.syncWeapon(nextWeaponId, false);
      caliperStore.syncWeapon(nextWeaponId, true);
    } else {
      interactiveActionStore.syncWeapon(nextWeaponId);
      fieldStripStore.syncWeapon(nextWeaponId, false);
      malfunctionStore.syncWeapon(nextWeaponId, false);
      caliperStore.syncWeapon(nextWeaponId, false);
    }
    caliperStore.clearTransientHover();
    const keepStoryMini = sameWeapon && s.storyOpen;
    if (initialMode === 'firing') {
      playbackClock.setTargetProgress(0, false);
      playbackClock.setFireProgress(0, true);
      set({
        screen: 'workbench',
        activeWeaponId: nextWeaponId,
        mode: 'firing',
        fieldStripActive: false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        storyOpen: keepStoryMini,
        storyMinimized: keepStoryMini,
        inspectorMinimized: false,
        isPlaying: false,
        isFiringPlaying: true,
        textureModalOpen: false,
        commandPaletteOpen: false,
        xrayShells: true,
        sectionCut: false,
        sectionCutAxis: 'z',
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        showLabels: false,
        labelsUserToggled: false,
        isolateSelected: false,
        selectedPartId: null,
        hoveredPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: {
          preset: 'firing_view',
          seq: s.cameraCommand.seq + 1,
        },
      });
    } else {
      playbackClock.setTargetProgress(0, !sameWeapon);
      playbackClock.setFireProgress(0, true);
      set({
        screen: 'workbench',
        activeWeaponId: nextWeaponId,
        mode: 'explode',
        fieldStripActive: sameWeapon ? s.fieldStripActive : false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        storyOpen: keepStoryMini,
        storyMinimized: keepStoryMini,
        inspectorMinimized: false,
        isPlaying: false,
        isFiringPlaying: false,
        textureModalOpen: false,
        commandPaletteOpen: false,
        xrayShells: false,
        sectionCut: false,
        sectionCutAxis: 'z',
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        showLabels: false,
        labelsUserToggled: false,
        isolateSelected: false,
        selectedPartId: null,
        hoveredPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
      });
    }
  },

  returnToArmory: () => {
    const snap = getNarrationAudioSnapshot();
    const keepStoryMini =
      get().storyOpen && snap.activeKind === 'story' && snap.isPlaying;
    if (!keepStoryMini) {
      stopNarrationAudio();
    }
    fieldStripStore.reset(get().activeWeaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      screen: 'armory',
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      focusedEngineeringRole: null,
      storyOpen: keepStoryMini,
      storyMinimized: keepStoryMini,
      inspectorMinimized: false,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      xrayShells: false,
      sectionCut: false,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      commandPaletteOpen: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
      cameraCommand: {
        preset: 'armory_showcase',
        seq: s.cameraCommand.seq + 1,
      },
    }));
  },

  toggleArmoryAutoRotate: () =>
    set((s) => ({ armoryAutoRotate: !s.armoryAutoRotate })),

  setWorkbenchAutoOrbit: (workbenchAutoOrbit) => set({ workbenchAutoOrbit }),

  toggleWorkbenchAutoOrbit: () =>
    set((s) => ({ workbenchAutoOrbit: !s.workbenchAutoOrbit })),

  setMode: (mode) => {
    const s = get();
    if (mode === 'firing') {
      fieldStripStore.reset(s.activeWeaponId, true);
      playbackClock.setTargetProgress(0, false);
      playbackClock.setFireProgress(0, true);
      set({
        mode: 'firing',
        fieldStripActive: false,
        malfunctionActive: false,
        isPlaying: false,
        xrayShells: !s.sectionCut,
        isolateSelected: false,
        selectedPartId: null,
        isFiringPlaying: true,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: { preset: 'firing_view', seq: s.cameraCommand.seq + 1 },
      });
    } else {
      if (s.mode === 'firing' || s.malfunctionActive) {
        playbackClock.setTargetProgress(0, false);
      }
      playbackClock.setFireProgress(0, true);
      set({
        mode: 'explode',
        malfunctionActive: false,
        isFiringPlaying: false,
        xrayShells: false,
        cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
      });
    }
  },

  setTargetProgress: (t) => {
    const s = get();
    if (s.fieldStripActive || s.malfunctionActive) {
      fieldStripStore.reset(s.activeWeaponId, true);
      set({ fieldStripActive: false, malfunctionActive: false });
    }
    playbackClock.setTargetProgress(t, false);
  },

  togglePlay: () => {
    const s = get();
    if (s.fieldStripActive) {
      fieldStripStore.reset(s.activeWeaponId, true);
    }
    const { targetProgress } = playbackClock.getState();
    if (!s.isPlaying) {
      let dir: 1 | -1 = 1;
      if (targetProgress >= 0.99) dir = -1;
      else if (targetProgress <= 0.01) dir = 1;
      set({
        mode: 'explode',
        fieldStripActive: false,
        malfunctionActive: false,
        isPlaying: true,
        playDirection: dir,
        cameraCommand: s.selectedPartId
          ? s.cameraCommand
          : { preset: s.cameraCommand.preset, seq: s.cameraCommand.seq + 1 },
      });
    } else {
      set({ isPlaying: false });
    }
  },

  stopPlay: () => set({ isPlaying: false }),

  setPlaySpeed: (playSpeed) => set({ playSpeed }),

  setFireProgress: (f) => {
    if (get().malfunctionActive) {
      set({ malfunctionActive: false });
    }
    playbackClock.setFireProgress(f, false);
  },

  toggleFiringPlay: () => {
    const { isFiringPlaying, activeWeaponId, malfunctionActive } = get();
    const { fireProgress } = playbackClock.getState();
    if (!isFiringPlaying || malfunctionActive) {
      fieldStripStore.reset(activeWeaponId, true);
      playbackClock.setTargetProgress(0, false);
      if (fireProgress >= 0.99 || malfunctionActive) {
        playbackClock.setFireProgress(0, true);
      }
      set({
        mode: 'firing',
        fieldStripActive: false,
        malfunctionActive: false,
        isFiringPlaying: true,
      });
    } else {
      set({ isFiringPlaying: false });
    }
  },

  stopFiringPlay: () => set({ isFiringPlaying: false }),

  triggerSingleShot: () => {
    const s = get();
    fieldStripStore.reset(s.activeWeaponId, true);
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set({
      mode: 'firing',
      fieldStripActive: false,
      malfunctionActive: false,
      isPlaying: false,
      xrayShells: !s.sectionCut,
      fireLoop: false,
      isFiringPlaying: true,
      cameraCommand:
        s.mode === 'firing' && !s.malfunctionActive
          ? s.cameraCommand
          : { preset: 'firing_view', seq: s.cameraCommand.seq + 1 },
    });
  },

  toggleFireLoop: () => set((s) => ({ fireLoop: !s.fireLoop })),

  setFireSpeedMultiplier: (fireSpeedMultiplier) => set({ fireSpeedMultiplier }),

  setEnvironmentPreset: (environmentPreset) => {
    if (!ENVIRONMENT_PRESET_CYCLE.includes(environmentPreset)) return;
    set({ environmentPreset });
  },

  cycleEnvironmentPreset: () =>
    set((s) => {
      const idx = ENVIRONMENT_PRESET_CYCLE.indexOf(s.environmentPreset);
      const next =
        ENVIRONMENT_PRESET_CYCLE[(idx + 1) % ENVIRONMENT_PRESET_CYCLE.length];
      return { environmentPreset: next };
    }),

  setPostFxEnabled: (postFxEnabled) => set({ postFxEnabled }),

  togglePostFx: () => set((s) => ({ postFxEnabled: !s.postFxEnabled })),

  setTelemetryHudOpen: (telemetryHudOpen) => set({ telemetryHudOpen }),

  toggleTelemetryHud: () =>
    set((s) => ({ telemetryHudOpen: !s.telemetryHudOpen })),

  setGpuTelemetryOpen: (open) => {
    setGpuTelemetryEnabled(open);
    set({ gpuTelemetryOpen: open });
  },

  toggleGpuTelemetry: () => {
    const next = !get().gpuTelemetryOpen;
    setGpuTelemetryEnabled(next);
    set({ gpuTelemetryOpen: next });
  },

  setWeaponWearLevel: (level) => {
    const clamped = setArmoryWearLevel(level);
    set({ weaponWearLevel: clamped });
  },

  setWeaponWearPreset: (preset) => {
    const next = setArmoryWearLevel(
      ARMORY_WEAR_PRESET_LEVELS[preset] ?? DEFAULT_ARMORY_WEAR_LEVEL
    );
    set({ weaponWearLevel: next });
  },

  setGraphicsQuality: (graphicsQuality, lockedByUser = true) => {
    if (!GRAPHICS_QUALITY_TIERS.includes(graphicsQuality)) return;
    set((s) => ({
      graphicsQuality,
      qualityLockedByUser: lockedByUser ? true : s.qualityLockedByUser,
    }));
  },

  cycleGraphicsQuality: () =>
    set((s) => {
      const idx = GRAPHICS_QUALITY_TIERS.indexOf(s.graphicsQuality);
      const next =
        GRAPHICS_QUALITY_TIERS[(idx + 1) % GRAPHICS_QUALITY_TIERS.length];
      return {
        graphicsQuality: next,
        qualityLockedByUser: true,
      };
    }),

  toggleMacroDof: () => set((s) => ({ macroDofEnabled: !s.macroDofEnabled })),

  togglePbrTextures: () =>
    set((s) => ({ pbrTexturesEnabled: !s.pbrTexturesEnabled })),
  setTextureModalOpen: (textureModalOpen) =>
    set((s) => ({
      textureModalOpen,
      monographModalOpen: textureModalOpen ? false : s.monographModalOpen,
      posterShareModalOpen: textureModalOpen ? false : s.posterShareModalOpen,
      commandPaletteOpen: textureModalOpen ? false : s.commandPaletteOpen,
      hudHidden: textureModalOpen ? false : s.hudHidden,
    })),
  openMonographModal: (weaponId, options = null) =>
    set((s) => ({
      monographModalOpen: true,
      monographWeaponId:
        weaponId && isWeaponId(weaponId) ? weaponId : s.activeWeaponId,
      monographLaunchOptions: options,
      textureModalOpen: false,
      posterShareModalOpen: false,
      commandPaletteOpen: false,
      hudHidden: false,
    })),
  closeMonographModal: () =>
    set({ monographModalOpen: false, monographLaunchOptions: null }),
  setMonographWeaponId: (weaponId) => {
    if (isWeaponId(weaponId)) {
      set({ monographWeaponId: weaponId });
    }
  },
  openPosterModal: (options) =>
    set((s) => ({
      posterShareModalOpen: true,
      posterShareOptions: {
        weaponId:
          options?.weaponId && isWeaponId(options.weaponId)
            ? options.weaponId
            : s.activeWeaponId,
        armorerRank: options?.armorerRank ?? null,
      },
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      monographModalOpen: false,
      commandPaletteOpen: false,
      hudHidden: false,
    })),
  closePosterModal: () =>
    set({
      posterShareModalOpen: false,
      posterShareOptions: null,
    }),
  togglePosterModal: (options) => {
    const cur = get();
    if (cur.posterShareModalOpen) {
      cur.closePosterModal();
    } else {
      cur.openPosterModal(options);
    }
  },
  setCausalitySandboxOpen: (causalitySandboxOpen) => {
    if (causalitySandboxOpen) {
      useCausalitySandboxStore.getState().setEnabled(true);
    }
    set((s) => ({
      causalitySandboxOpen,
      mode: causalitySandboxOpen ? 'firing' : s.mode,
      fieldStripActive: causalitySandboxOpen ? false : s.fieldStripActive,
      malfunctionActive: causalitySandboxOpen ? false : s.malfunctionActive,
      commandPaletteOpen: causalitySandboxOpen ? false : s.commandPaletteOpen,
      hudHidden: causalitySandboxOpen ? false : s.hudHidden,
    }));
  },
  toggleCausalitySandbox: () => {
    const cur = get();
    cur.setCausalitySandboxOpen(!cur.causalitySandboxOpen);
  },
  setArmorPenetrationModalOpen: (armorPenetrationModalOpen) =>
    set((s) => ({
      armorPenetrationModalOpen,
      armorPenetrationLaunchOptions: armorPenetrationModalOpen
        ? s.armorPenetrationLaunchOptions
        : null,
      textureModalOpen: armorPenetrationModalOpen ? false : s.textureModalOpen,
      monographModalOpen: armorPenetrationModalOpen
        ? false
        : s.monographModalOpen,
      posterShareModalOpen: armorPenetrationModalOpen
        ? false
        : s.posterShareModalOpen,
      commandPaletteOpen: armorPenetrationModalOpen
        ? false
        : s.commandPaletteOpen,
      hudHidden: armorPenetrationModalOpen ? false : s.hudHidden,
    })),
  openArmorPenetrationModal: (options) =>
    set((s) => {
      const contextual = resolveArmorLabPresetForWeapon(s.activeWeaponId);
      return {
        armorPenetrationModalOpen: true,
        armorPenetrationLaunchOptions: {
          projectileId: options?.projectileId ?? contextual.projectileId,
          targetTankId: options?.targetTankId ?? contextual.targetTankId,
        },
        textureModalOpen: false,
        monographModalOpen: false,
        posterShareModalOpen: false,
        scaleWallModalOpen: false,
        commandPaletteOpen: false,
        hudHidden: false,
      };
    }),
  closeArmorPenetrationModal: () =>
    set({
      armorPenetrationModalOpen: false,
      armorPenetrationLaunchOptions: null,
    }),
  setDirectorReelModalOpen: (directorReelModalOpen) =>
    set((s) => ({
      directorReelModalOpen,
      textureModalOpen: directorReelModalOpen ? false : s.textureModalOpen,
      monographModalOpen: directorReelModalOpen
        ? false
        : s.monographModalOpen,
      posterShareModalOpen: directorReelModalOpen
        ? false
        : s.posterShareModalOpen,
      armorPenetrationModalOpen: directorReelModalOpen
        ? false
        : s.armorPenetrationModalOpen,
      passportModalOpen: directorReelModalOpen ? false : s.passportModalOpen,
      scaleWallModalOpen: directorReelModalOpen ? false : s.scaleWallModalOpen,
      commandPaletteOpen: directorReelModalOpen
        ? false
        : s.commandPaletteOpen,
      hudHidden: directorReelModalOpen ? false : s.hudHidden,
    })),
  openDirectorReelModal: () => get().setDirectorReelModalOpen(true),
  closeDirectorReelModal: () => get().setDirectorReelModalOpen(false),
  setPassportModalOpen: (passportModalOpen) =>
    set((s) => ({
      passportModalOpen,
      textureModalOpen: passportModalOpen ? false : s.textureModalOpen,
      monographModalOpen: passportModalOpen ? false : s.monographModalOpen,
      posterShareModalOpen: passportModalOpen
        ? false
        : s.posterShareModalOpen,
      armorPenetrationModalOpen: passportModalOpen
        ? false
        : s.armorPenetrationModalOpen,
      directorReelModalOpen: passportModalOpen
        ? false
        : s.directorReelModalOpen,
      scaleWallModalOpen: passportModalOpen ? false : s.scaleWallModalOpen,
      commandPaletteOpen: passportModalOpen ? false : s.commandPaletteOpen,
      hudHidden: passportModalOpen ? false : s.hudHidden,
    })),
  openPassportModal: () => get().setPassportModalOpen(true),
  closePassportModal: () => get().setPassportModalOpen(false),
  setTimelineModalOpen: (timelineModalOpen) =>
    set((s) => ({
      timelineModalOpen,
      textureModalOpen: timelineModalOpen ? false : s.textureModalOpen,
      monographModalOpen: timelineModalOpen ? false : s.monographModalOpen,
      posterShareModalOpen: timelineModalOpen ? false : s.posterShareModalOpen,
      armorPenetrationModalOpen: timelineModalOpen
        ? false
        : s.armorPenetrationModalOpen,
      directorReelModalOpen: timelineModalOpen
        ? false
        : s.directorReelModalOpen,
      passportModalOpen: timelineModalOpen ? false : s.passportModalOpen,
      offlineModalOpen: timelineModalOpen ? false : s.offlineModalOpen,
      scaleWallModalOpen: timelineModalOpen ? false : s.scaleWallModalOpen,
      commandPaletteOpen: timelineModalOpen ? false : s.commandPaletteOpen,
      hudHidden: timelineModalOpen ? false : s.hudHidden,
    })),
  openTimelineModal: () => get().setTimelineModalOpen(true),
  closeTimelineModal: () => get().setTimelineModalOpen(false),
  setOfflineModalOpen: (offlineModalOpen) =>
    set((s) => ({
      offlineModalOpen,
      textureModalOpen: offlineModalOpen ? false : s.textureModalOpen,
      monographModalOpen: offlineModalOpen ? false : s.monographModalOpen,
      posterShareModalOpen: offlineModalOpen ? false : s.posterShareModalOpen,
      armorPenetrationModalOpen: offlineModalOpen
        ? false
        : s.armorPenetrationModalOpen,
      directorReelModalOpen: offlineModalOpen ? false : s.directorReelModalOpen,
      passportModalOpen: offlineModalOpen ? false : s.passportModalOpen,
      timelineModalOpen: offlineModalOpen ? false : s.timelineModalOpen,
      scaleWallModalOpen: offlineModalOpen ? false : s.scaleWallModalOpen,
      commandPaletteOpen: offlineModalOpen ? false : s.commandPaletteOpen,
      hudHidden: offlineModalOpen ? false : s.hudHidden,
    })),
  openOfflineModal: () => get().setOfflineModalOpen(true),
  closeOfflineModal: () => get().setOfflineModalOpen(false),
  setScaleWallModalOpen: (scaleWallModalOpen) =>
    set((s) => ({
      scaleWallModalOpen,
      textureModalOpen: scaleWallModalOpen ? false : s.textureModalOpen,
      monographModalOpen: scaleWallModalOpen ? false : s.monographModalOpen,
      posterShareModalOpen: scaleWallModalOpen
        ? false
        : s.posterShareModalOpen,
      armorPenetrationModalOpen: scaleWallModalOpen
        ? false
        : s.armorPenetrationModalOpen,
      directorReelModalOpen: scaleWallModalOpen
        ? false
        : s.directorReelModalOpen,
      passportModalOpen: scaleWallModalOpen ? false : s.passportModalOpen,
      timelineModalOpen: scaleWallModalOpen ? false : s.timelineModalOpen,
      offlineModalOpen: scaleWallModalOpen ? false : s.offlineModalOpen,
      commandPaletteOpen: scaleWallModalOpen ? false : s.commandPaletteOpen,
      hudHidden: scaleWallModalOpen ? false : s.hudHidden,
    })),
  openScaleWallModal: () => get().setScaleWallModalOpen(true),
  closeScaleWallModal: () => get().setScaleWallModalOpen(false),
  setCommandPaletteOpen: (commandPaletteOpen) => set({ commandPaletteOpen }),
  openCommandPalette: () => set({ commandPaletteOpen: true }),
  closeCommandPalette: () => set({ commandPaletteOpen: false }),
  toggleCommandPalette: () =>
    set((s) => ({ commandPaletteOpen: !s.commandPaletteOpen })),
  focusWorkbenchPart: (partId) => {
    const s = get();
    const weaponId = s.activeWeaponId;
    fieldStripStore.reset(weaponId, true);
    caliperStore.clearTransientHover();
    playbackClock.setFireProgress(0, true);

    const applyPartFocus = () => {
      const cur = get();
      set({
        screen: 'workbench',
        mode: 'explode',
        fieldStripActive: false,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        isPlaying: false,
        isFiringPlaying: false,
        textureModalOpen: false,
        commandPaletteOpen: false,
        hudHidden: false,
        inspectorMinimized: false,
        isolateSelected: false,
        selectedPartId: partId,
        hoveredPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand:
          cur.screen === 'workbench'
            ? cur.cameraCommand
            : { preset: 'iso', seq: cur.cameraCommand.seq + 1 },
      });
    };

    if (getLoadedWeaponPlugin(weaponId)) {
      applyPartFocus();
    } else {
      applyPartFocus();
      void loadWeaponPlugin(weaponId).then(() => {
        if (get().activeWeaponId === weaponId) {
          set({ selectedPartId: null });
          set({ selectedPartId: partId });
        }
      });
    }
  },
  toggleXrayShells: () =>
    set((s) => {
      const next = !s.xrayShells;
      return {
        xrayShells: next,
        sectionCut: next ? false : s.sectionCut,
      };
    }),
  setXrayShells: (xrayShells) =>
    set((s) => ({
      xrayShells,
      sectionCut: xrayShells ? false : s.sectionCut,
    })),
  toggleSectionCut: () =>
    set((s) => {
      const next = !s.sectionCut;
      return {
        sectionCut: next,
        xrayShells: next ? false : s.xrayShells,
      };
    }),
  setSectionCut: (sectionCut) =>
    set((s) => ({
      sectionCut,
      xrayShells: sectionCut ? false : s.xrayShells,
    })),
  setSectionCutAxis: (axis) => {
    const s = get();
    const scaleProfile = getWeaponManifest(s.activeWeaponId).workbenchMeta
      .scaleProfile;
    const boxDefs = getDefaultSectionBoxParams(scaleProfile);
    set({
      sectionCutAxis: axis,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      sectionBoxCenter: [...boxDefs.center] as [number, number, number],
      sectionBoxHalfSize: [...boxDefs.halfSize] as [number, number, number],
    });
  },
  setSectionCutOffset: (offset) => {
    const s = get();
    const scaleProfile = getWeaponManifest(s.activeWeaponId).workbenchMeta
      .scaleProfile;
    const next = clampSectionCutOffset(offset, scaleProfile, s.sectionCutAxis);
    if (s.sectionCutOffset !== next) {
      set({ sectionCutOffset: next });
    }
  },
  resetSectionCutOffset: () => {
    const scaleProfile = getWeaponManifest(get().activeWeaponId).workbenchMeta
      .scaleProfile;
    const boxDefs = getDefaultSectionBoxParams(scaleProfile);
    set({
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      sectionBoxCenter: [...boxDefs.center] as [number, number, number],
      sectionBoxHalfSize: [...boxDefs.halfSize] as [number, number, number],
    });
  },
  toggleSectionCutFlip: () =>
    set((s) => ({ sectionCutFlip: !s.sectionCutFlip })),
  setSectionBoxCenter: (center) =>
    set({
      sectionBoxCenter: [center[0], center[1], center[2]],
    }),
  setSectionBoxHalfSize: (halfSize) =>
    set({
      sectionBoxHalfSize: [halfSize[0], halfSize[1], halfSize[2]],
    }),
  toggleShowEdges: () => set((s) => ({ showEdges: !s.showEdges })),
  toggleShowLabels: () =>
    set((s) => {
      const autoExplodeActive =
        !s.labelsUserToggled &&
        s.mode === 'explode' &&
        playbackClock.getState().targetProgress >= 0.15;
      const effectiveVisible = s.showLabels || autoExplodeActive;
      return {
        showLabels: !effectiveVisible,
        labelsUserToggled: true,
      };
    }),
  toggleIsolateSelected: () =>
    set((s) => ({ isolateSelected: !s.isolateSelected })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),
  setHudHidden: (hudHidden) =>
    set((s) => ({
      hudHidden,
      textureModalOpen: hudHidden ? false : s.textureModalOpen,
      monographModalOpen: hudHidden ? false : s.monographModalOpen,
      posterShareModalOpen: hudHidden ? false : s.posterShareModalOpen,
      commandPaletteOpen: hudHidden ? false : s.commandPaletteOpen,
    })),
  toggleHudHidden: () =>
    set((s) => {
      const next = !s.hudHidden;
      return {
        hudHidden: next,
        textureModalOpen: next ? false : s.textureModalOpen,
        monographModalOpen: next ? false : s.monographModalOpen,
        posterShareModalOpen: next ? false : s.posterShareModalOpen,
        commandPaletteOpen: next ? false : s.commandPaletteOpen,
      };
    }),

  setEngineeringTint: (engineeringTint) =>
    set((s) => ({
      engineeringTint,
      focusedEngineeringRole: engineeringTint ? s.focusedEngineeringRole : null,
    })),

  toggleEngineeringTint: () =>
    set((s) => {
      const next = !s.engineeringTint;
      return {
        engineeringTint: next,
        focusedEngineeringRole: next ? s.focusedEngineeringRole : null,
      };
    }),

  setFocusedEngineeringRole: (role) =>
    set((s) => ({
      engineeringTint: role !== null ? true : s.engineeringTint,
      focusedEngineeringRole: s.focusedEngineeringRole === role ? null : role,
    })),

  setGasFlowVisible: (gasFlowVisible) => set({ gasFlowVisible }),

  toggleGasFlowVisible: () =>
    set((s) => ({ gasFlowVisible: !s.gasFlowVisible })),

  setFieldStripActive: (active) => {
    const s = get();
    if (active) {
      fieldStripStore.reset(s.activeWeaponId, true);
      caliperStore.clearTransientHover();
      playbackClock.setTargetProgress(0, true);
      playbackClock.setFireProgress(0, true);
      set({
        screen: 'workbench',
        mode: 'explode',
        fieldStripActive: true,
        malfunctionActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        workbenchAutoOrbit: false,
        isPlaying: false,
        isFiringPlaying: false,
        isolateSelected: false,
        selectedPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
      });
    } else {
      fieldStripStore.reset(s.activeWeaponId, true);
      set({ fieldStripActive: false });
    }
  },

  toggleFieldStripMode: () => {
    const s = get();
    s.setFieldStripActive(!s.fieldStripActive);
  },

  setMalfunctionActive: (active, kind) => {
    const s = get();
    if (active) {
      fieldStripStore.reset(s.activeWeaponId, true);
      caliperStore.clearTransientHover();
      interactiveActionStore.reset(s.activeWeaponId);
      playbackClock.setTargetProgress(0, true);
      malfunctionStore.activate(s.activeWeaponId, kind);
      set({
        screen: 'workbench',
        mode: 'firing',
        malfunctionActive: true,
        fieldStripActive: false,
        caliperActive: false,
        envelopeRulerVisible: false,
        isPlaying: false,
        isFiringPlaying: false,
        sectionCut: true,
        sectionCutAxis: 'z',
        xrayShells: false,
        isolateSelected: false,
        selectedPartId: null,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: {
          preset: 'cutaway_focus',
          seq: s.cameraCommand.seq + 1,
        },
      });
    } else {
      playbackClock.setFireProgress(0, true);
      playbackClock.setAnimatedFireProgress(0);
      set({ malfunctionActive: false });
    }
  },

  toggleMalfunctionMode: () => {
    const s = get();
    s.setMalfunctionActive(!s.malfunctionActive);
  },

  setCaliperActive: (active) => {
    const s = get();
    if (active) {
      caliperStore.syncWeapon(s.activeWeaponId, false);
      set({
        screen: 'workbench',
        caliperActive: true,
        envelopeRulerVisible: true,
        fieldStripActive: false,
        workbenchAutoOrbit: false,
        isPlaying: false,
        isFiringPlaying: false,
      });
    } else {
      caliperStore.clearTransientHover();
      set({
        caliperActive: false,
        envelopeRulerVisible: false,
      });
    }
  },

  toggleCaliperMode: () => {
    const s = get();
    s.setCaliperActive(!s.caliperActive);
  },

  setEnvelopeRulerVisible: (envelopeRulerVisible) =>
    set({ envelopeRulerVisible }),

  toggleEnvelopeRuler: () =>
    set((s) => ({ envelopeRulerVisible: !s.envelopeRulerVisible })),

  toggleGroupVisibility: (group) =>
    set((s) => ({
      hiddenGroups: {
        ...s.hiddenGroups,
        [group]: !s.hiddenGroups[group],
      },
    })),

  selectPart: (partId) =>
    set((s) => ({
      selectedPartId: partId,
      isolateSelected: partId === null ? false : s.isolateSelected,
      inspectorMinimized: partId === null ? false : s.inspectorMinimized,
    })),

  hoverPart: (hoveredPartId) => {
    if (get().hoveredPartId !== hoveredPartId) {
      set({ hoveredPartId });
    }
  },

  triggerCameraPreset: (preset) =>
    set((s) => ({
      cameraCommand: { preset, seq: s.cameraCommand.seq + 1 },
    })),

  activateCutawayFocus: () => {
    fieldStripStore.reset(get().activeWeaponId, true);
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => {
      const meta = getWeaponManifest(s.activeWeaponId).workbenchMeta;
      return {
        mode: 'explode',
        fieldStripActive: false,
        malfunctionActive: false,
        isPlaying: false,
        isFiringPlaying: false,
        xrayShells: !s.sectionCut,
        isolateSelected: false,
        selectedPartId: meta.cutawayFocusPartId,
        cameraCommand: {
          preset: 'cutaway_focus',
          seq: s.cameraCommand.seq + 1,
        },
      };
    });
  },

  resetAll: () => {
    const activeId = get().activeWeaponId;
    resetWeaponPhysicsAndAction(activeId, true);
    useCausalitySandboxStore.getState().reset();
    useAttachmentStore.getState().resetWeapon(activeId);
    useAttachmentStore.getState().setBenchOpen(false);
    useTankCrewStore.getState().resetForWeapon(activeId);
    fieldStripStore.setTier('field', activeId);
    fieldStripStore.reset(activeId, true);
    malfunctionStore.syncWeapon(activeId, false);
    caliperStore.clearPoints();
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    playbackClock.setAnimatedFireProgress(0);
    const boxDefs = getDefaultSectionBoxParams(
      getWeaponManifest(activeId).workbenchMeta.scaleProfile
    );
    set((s) => ({
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      workbenchAutoOrbit: false,
      engineeringTint: false,
      focusedEngineeringRole: null,
      gasFlowVisible: true,
      isPlaying: false,
      isFiringPlaying: false,
      pbrTexturesEnabled: true,
      xrayShells: false,
      sectionCut: false,
      sectionCutAxis: 'z',
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      sectionBoxCenter: [...boxDefs.center] as [number, number, number],
      sectionBoxHalfSize: [...boxDefs.halfSize] as [number, number, number],
      showEdges: false,
      showLabels: false,
      labelsUserToggled: false,
      isolateSelected: false,
      hudHidden: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
      causalitySandboxOpen: false,
      armorPenetrationModalOpen: false,
      directorReelModalOpen: false,
      passportModalOpen: false,
      timelineModalOpen: false,
      offlineModalOpen: false,
      scaleWallModalOpen: false,
      commandPaletteOpen: false,
      selectedPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
      cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
    }));
    syncLiveSectionCutPlane(SECTION_CUT_OFFSET_DEFAULT, false);
    setAcousticEnvironment(
      resolveAcousticEnvironmentForState(get().environmentPreset, 'explode')
    );
  },
}));

// Ensure live clipping plane starts synchronized with default store values
syncLiveSectionCutPlane(
  useAppStore.getState().sectionCutOffset,
  useAppStore.getState().sectionCutFlip,
  getWeaponManifest(useAppStore.getState().activeWeaponId).workbenchMeta
    .scaleProfile,
  useAppStore.getState().sectionCutAxis
);
syncLiveSectionBoxPlanes(
  useAppStore.getState().sectionBoxCenter,
  useAppStore.getState().sectionBoxHalfSize,
  getWeaponManifest(useAppStore.getState().activeWeaponId).workbenchMeta
    .scaleProfile
);

// Keep convolution IR room preset & live CT-Scan section plane synchronized with store state
useAppStore.subscribe((state, prevState) => {
  if (
    state.environmentPreset !== prevState.environmentPreset ||
    state.mode !== prevState.mode
  ) {
    setAcousticEnvironment(
      resolveAcousticEnvironmentForState(state.environmentPreset, state.mode)
    );
  }
  const scaleProfile = getWeaponManifest(state.activeWeaponId).workbenchMeta
    .scaleProfile;
  if (
    state.activeWeaponId !== prevState.activeWeaponId &&
    scaleProfile !==
      getWeaponManifest(prevState.activeWeaponId).workbenchMeta.scaleProfile
  ) {
    const boxDefs = getDefaultSectionBoxParams(scaleProfile);
    useAppStore.setState({
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionBoxCenter: [...boxDefs.center] as [number, number, number],
      sectionBoxHalfSize: [...boxDefs.halfSize] as [number, number, number],
    });
  }
  if (
    state.sectionCutOffset !== prevState.sectionCutOffset ||
    state.sectionCutFlip !== prevState.sectionCutFlip ||
    state.sectionCutAxis !== prevState.sectionCutAxis ||
    state.activeWeaponId !== prevState.activeWeaponId
  ) {
    syncLiveSectionCutPlane(
      state.sectionCutOffset,
      state.sectionCutFlip,
      scaleProfile,
      state.sectionCutAxis
    );
  }
  if (
    state.sectionBoxCenter !== prevState.sectionBoxCenter ||
    state.sectionBoxHalfSize !== prevState.sectionBoxHalfSize ||
    state.activeWeaponId !== prevState.activeWeaponId
  ) {
    syncLiveSectionBoxPlanes(
      state.sectionBoxCenter,
      state.sectionBoxHalfSize,
      scaleProfile
    );
  }
});

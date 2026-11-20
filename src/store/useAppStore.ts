import { create } from 'zustand';
import {
  clampSectionCutOffset,
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
  syncLiveSectionCutPlane,
} from '../engine/actors/StencilSectionCap';
import {
  type AcousticEnvironmentPreset,
  setAcousticEnvironment,
} from '../engine/audio/mechanicalSoundEngine';

export {
  clampSectionCutOffset,
  SECTION_CUT_OFFSET_DEFAULT,
  SECTION_CUT_OFFSET_MAX,
  SECTION_CUT_OFFSET_MIN,
  SECTION_CUT_OFFSET_STEP,
};
import type { ArmoryEnvironmentPreset } from '../engine/canvas/GunsmithStageMat';
import {
  detectDefaultGraphicsQuality,
  GRAPHICS_QUALITY_TIERS,
  type GraphicsQualityTier,
} from '../engine/canvas/graphicsQuality';
import { playbackClock } from '../engine/clock/playbackClock';
import { caliperStore } from '../engine/caliper/caliperStore';
import { isCaliberProfile } from '../engine/cartridges/cartridgeSpecs';
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
  | 'ballistics';
export type AppViewMode = 'explode' | 'firing';
export type PosterArmorerRankOption = 'S' | 'A' | 'B' | 'C';

export interface PosterModalLaunchOptions {
  weaponId?: WeaponId;
  armorerRank?: PosterArmorerRankOption | null;
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
  commandPaletteOpen: boolean;
  xrayShells: boolean;
  sectionCut: boolean;
  sectionCutOffset: number;
  sectionCutFlip: boolean;
  showEdges: boolean;
  showLabels: boolean;
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
  selectArmoryWeapon: (weaponId: string) => void;
  enterWorkbench: (weaponId?: string, initialMode?: AppViewMode) => void;
  returnToArmory: () => void;
  toggleArmoryAutoRotate: () => void;

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
  setCommandPaletteOpen: (open: boolean) => void;
  openCommandPalette: () => void;
  closeCommandPalette: () => void;
  toggleCommandPalette: () => void;
  focusWorkbenchPart: (partId: string) => void;
  toggleXrayShells: () => void;
  setXrayShells: (val: boolean) => void;
  toggleSectionCut: () => void;
  setSectionCut: (val: boolean) => void;
  setSectionCutOffset: (offset: number) => void;
  resetSectionCutOffset: () => void;
  toggleSectionCutFlip: () => void;
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
  commandPaletteOpen: false,
  xrayShells: false,
  sectionCut: false,
  sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
  sectionCutFlip: false,
  showEdges: false,
  showLabels: true,
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
    const nextCaliber: CaliberProfile = isCaliberProfile(rawCaliber)
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
      activeCartridgeCaliber: isCaliberProfile(caliber)
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
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        showLabels: true,
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
        sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
        sectionCutFlip: false,
        showLabels: true,
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
  setSectionCutOffset: (offset) => {
    const next = clampSectionCutOffset(offset);
    if (get().sectionCutOffset !== next) {
      set({ sectionCutOffset: next });
    }
  },
  resetSectionCutOffset: () =>
    set({
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
    }),
  toggleSectionCutFlip: () =>
    set((s) => ({ sectionCutFlip: !s.sectionCutFlip })),
  toggleShowEdges: () => set((s) => ({ showEdges: !s.showEdges })),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
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
    fieldStripStore.reset(activeId, true);
    malfunctionStore.syncWeapon(activeId, false);
    caliperStore.clearPoints();
    caliperStore.clearTransientHover();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    playbackClock.setAnimatedFireProgress(0);
    set((s) => ({
      mode: 'explode',
      fieldStripActive: false,
      malfunctionActive: false,
      caliperActive: false,
      envelopeRulerVisible: false,
      engineeringTint: false,
      focusedEngineeringRole: null,
      gasFlowVisible: true,
      isPlaying: false,
      isFiringPlaying: false,
      pbrTexturesEnabled: true,
      xrayShells: false,
      sectionCut: false,
      sectionCutOffset: SECTION_CUT_OFFSET_DEFAULT,
      sectionCutFlip: false,
      showEdges: false,
      showLabels: true,
      isolateSelected: false,
      hudHidden: false,
      posterShareModalOpen: false,
      posterShareOptions: null,
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
  useAppStore.getState().sectionCutFlip
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
  if (
    state.sectionCutOffset !== prevState.sectionCutOffset ||
    state.sectionCutFlip !== prevState.sectionCutFlip
  ) {
    syncLiveSectionCutPlane(state.sectionCutOffset, state.sectionCutFlip);
  }
});

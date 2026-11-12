import { create } from 'zustand';
import { playbackClock } from '../engine/clock/playbackClock';
import { getWeaponManifest } from '../weapons/manifests';
import type {
  AssemblyGroupKey,
  CameraPresetType,
  WeaponId,
} from '../weapons/types';
import { isWeaponId } from '../weapons/types';

export type AppScreen = 'showcase' | 'armory' | 'workbench';
export type AppViewMode = 'explode' | 'firing';

const DEFAULT_HIDDEN_GROUPS: Record<AssemblyGroupKey, boolean> = {
  slide: false,
  frame: false,
  fire_control: false,
  magazine: false,
};

export interface AppState {
  /** Top-level navigation screen: Armory Vault vs 3D Disassembly Workbench */
  screen: AppScreen;
  activeWeaponId: WeaponId;
  armoryAutoRotate: boolean;

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

  /** Visual toggles */
  pbrTexturesEnabled: boolean;
  textureModalOpen: boolean;
  xrayShells: boolean;
  sectionCut: boolean;
  showEdges: boolean;
  showLabels: boolean;
  isolateSelected: boolean;
  sidebarCollapsed: boolean;

  /** Group visibility filters */
  hiddenGroups: Record<AssemblyGroupKey, boolean>;

  /** Selection & hover */
  selectedPartId: string | null;
  hoveredPartId: string | null;

  /** Camera control command (cameraEffectSeq bumps when progress jump should re-frame) */
  cameraCommand: { preset: CameraPresetType; seq: number };

  // Armory <-> Workbench <-> Showcase Navigation Actions
  openShowcase: () => void;
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

  // Shared Visual & Selection Actions
  togglePbrTextures: () => void;
  setTextureModalOpen: (open: boolean) => void;
  toggleXrayShells: () => void;
  setXrayShells: (val: boolean) => void;
  toggleSectionCut: () => void;
  setSectionCut: (val: boolean) => void;
  toggleShowEdges: () => void;
  toggleShowLabels: () => void;
  toggleIsolateSelected: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleGroupVisibility: (group: AssemblyGroupKey) => void;
  selectPart: (partId: string | null) => void;
  hoverPart: (partId: string | null) => void;
  triggerCameraPreset: (preset: CameraPresetType) => void;
  activateCutawayFocus: () => void;
  resetAll: () => void;
}

export const useAppStore = create<AppState>((set, get) => ({
  screen: 'armory',
  activeWeaponId: 'ak15',
  armoryAutoRotate: true,

  mode: 'explode',

  isPlaying: false,
  playDirection: 1,
  playSpeed: 0.16,

  isFiringPlaying: false,
  fireLoop: true,
  fireSpeedMultiplier: 0.5,

  pbrTexturesEnabled: true,
  textureModalOpen: false,
  xrayShells: false,
  sectionCut: false,
  showEdges: false,
  showLabels: true,
  isolateSelected: false,
  sidebarCollapsed: true,

  hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },

  selectedPartId: null,
  hoveredPartId: null,

  cameraCommand: { preset: 'armory_showcase', seq: 0 },

  openShowcase: () => {
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      screen: 'showcase',
      mode: 'explode',
      armoryAutoRotate: true,
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      xrayShells: false,
      sectionCut: false,
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

  selectArmoryWeapon: (weaponIdRaw) => {
    const weaponId: WeaponId = isWeaponId(weaponIdRaw) ? weaponIdRaw : 'ak15';
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      activeWeaponId: weaponId,
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
    if (initialMode === 'firing') {
      playbackClock.setTargetProgress(0, false);
      playbackClock.setFireProgress(0, true);
      set({
        screen: 'workbench',
        activeWeaponId: nextWeaponId,
        mode: 'firing',
        isPlaying: false,
        isFiringPlaying: true,
        textureModalOpen: false,
        xrayShells: true,
        sectionCut: false,
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
      playbackClock.setTargetProgress(0, nextWeaponId !== s.activeWeaponId);
      playbackClock.setFireProgress(0, true);
      set({
        screen: 'workbench',
        activeWeaponId: nextWeaponId,
        mode: 'explode',
        isPlaying: false,
        isFiringPlaying: false,
        textureModalOpen: false,
        xrayShells: false,
        sectionCut: false,
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
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      screen: 'armory',
      mode: 'explode',
      isPlaying: false,
      isFiringPlaying: false,
      textureModalOpen: false,
      xrayShells: false,
      sectionCut: false,
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
      playbackClock.setTargetProgress(0, false);
      playbackClock.setFireProgress(0, true);
      set({
        mode: 'firing',
        isPlaying: false,
        xrayShells: !s.sectionCut,
        isolateSelected: false,
        selectedPartId: null,
        isFiringPlaying: true,
        hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
        cameraCommand: { preset: 'firing_view', seq: s.cameraCommand.seq + 1 },
      });
    } else {
      if (s.mode === 'firing') {
        playbackClock.setTargetProgress(0, false);
      }
      playbackClock.setFireProgress(0, true);
      set({
        mode: 'explode',
        isFiringPlaying: false,
        xrayShells: false,
        cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
      });
    }
  },

  setTargetProgress: (t) => {
    playbackClock.setTargetProgress(t, false);
  },

  togglePlay: () => {
    const s = get();
    const { targetProgress } = playbackClock.getState();
    if (!s.isPlaying) {
      let dir: 1 | -1 = 1;
      if (targetProgress >= 0.99) dir = -1;
      else if (targetProgress <= 0.01) dir = 1;
      set({
        mode: 'explode',
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
    playbackClock.setFireProgress(f, false);
  },

  toggleFiringPlay: () => {
    const { isFiringPlaying } = get();
    const { fireProgress } = playbackClock.getState();
    if (!isFiringPlaying) {
      playbackClock.setTargetProgress(0, false);
      if (fireProgress >= 0.99) {
        playbackClock.setFireProgress(0, true);
      }
      set({
        mode: 'firing',
        isFiringPlaying: true,
      });
    } else {
      set({ isFiringPlaying: false });
    }
  },

  stopFiringPlay: () => set({ isFiringPlaying: false }),

  triggerSingleShot: () => {
    const s = get();
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set({
      mode: 'firing',
      isPlaying: false,
      xrayShells: !s.sectionCut,
      fireLoop: false,
      isFiringPlaying: true,
      cameraCommand:
        s.mode === 'firing'
          ? s.cameraCommand
          : { preset: 'firing_view', seq: s.cameraCommand.seq + 1 },
    });
  },

  toggleFireLoop: () => set((s) => ({ fireLoop: !s.fireLoop })),

  setFireSpeedMultiplier: (fireSpeedMultiplier) => set({ fireSpeedMultiplier }),

  togglePbrTextures: () =>
    set((s) => ({ pbrTexturesEnabled: !s.pbrTexturesEnabled })),
  setTextureModalOpen: (textureModalOpen) => set({ textureModalOpen }),
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
  toggleShowEdges: () => set((s) => ({ showEdges: !s.showEdges })),
  toggleShowLabels: () => set((s) => ({ showLabels: !s.showLabels })),
  toggleIsolateSelected: () =>
    set((s) => ({ isolateSelected: !s.isolateSelected })),
  setSidebarCollapsed: (sidebarCollapsed) => set({ sidebarCollapsed }),

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
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => {
      const meta = getWeaponManifest(s.activeWeaponId).workbenchMeta;
      return {
        mode: 'explode',
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
    playbackClock.setTargetProgress(0, false);
    playbackClock.setFireProgress(0, true);
    set((s) => ({
      mode: 'explode',
      isPlaying: false,
      isFiringPlaying: false,
      pbrTexturesEnabled: true,
      xrayShells: false,
      sectionCut: false,
      showEdges: false,
      showLabels: true,
      isolateSelected: false,
      selectedPartId: null,
      hiddenGroups: { ...DEFAULT_HIDDEN_GROUPS },
      cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
    }));
  },
}));

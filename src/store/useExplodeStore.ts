import { create } from 'zustand';
import { PartGroupKey } from '../data/g17PartsSpec';
import { getWeaponWorkbenchMeta } from '../data/weaponRegistry';

export type CameraPresetType =
  | 'armory_showcase'
  | 'iso'
  | 'right'
  | 'left'
  | 'top'
  | 'safe_action'
  | 'firing_view';

export type AppScreen = 'armory' | 'workbench';
export type AppViewMode = 'explode' | 'firing';

interface ExplodeState {
  /** Top-level navigation screen: Armory Vault vs 3D Disassembly Workbench */
  screen: AppScreen;
  activeWeaponId: string;
  armoryAutoRotate: boolean;

  /** Active interactive mode inside Workbench: Exploded Disassembly vs Dynamic Firing Cycle */
  mode: AppViewMode;

  /** Target disassembly progress in [0, 1] */
  targetProgress: number;
  isPlaying: boolean;
  playDirection: 1 | -1;
  playSpeed: number;

  /** Firing cycle simulation state in [0, 1] */
  fireProgress: number;
  isFiringPlaying: boolean;
  fireLoop: boolean;
  fireSpeedMultiplier: 0.25 | 0.5 | 1.0;

  /** Visual toggles */
  pbrTexturesEnabled: boolean;
  textureModalOpen: boolean;
  xrayShells: boolean;
  showEdges: boolean;
  showLabels: boolean;
  isolateSelected: boolean;
  sidebarCollapsed: boolean;

  /** Group visibility filters */
  hiddenGroups: Record<PartGroupKey, boolean>;

  /** Selection & hover */
  selectedPartId: string | null;
  hoveredPartId: string | null;

  /** Camera control command */
  cameraCommand: { preset: CameraPresetType; seq: number };

  // Armory <-> Workbench Navigation Actions
  selectArmoryWeapon: (weaponId: string) => void;
  enterWorkbench: (weaponId?: string) => void;
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
  toggleShowEdges: () => void;
  toggleShowLabels: () => void;
  toggleIsolateSelected: () => void;
  setSidebarCollapsed: (collapsed: boolean) => void;
  toggleGroupVisibility: (group: PartGroupKey) => void;
  selectPart: (partId: string | null) => void;
  hoverPart: (partId: string | null) => void;
  triggerCameraPreset: (preset: CameraPresetType) => void;
  activateSafeActionCutaway: () => void;
  resetAll: () => void;
}

export const useExplodeStore = create<ExplodeState>((set, get) => ({
  screen: 'armory',
  activeWeaponId: 'ak15',
  armoryAutoRotate: true,

  mode: 'explode',

  // Start assembled (0%) inside the Armory 3D showcase; entering Workbench expands to 100%!
  targetProgress: 0.0,
  isPlaying: false,
  playDirection: 1,
  playSpeed: 0.16,

  fireProgress: 0,
  isFiringPlaying: false,
  fireLoop: true,
  fireSpeedMultiplier: 0.5,

  pbrTexturesEnabled: true,
  textureModalOpen: false,
  xrayShells: false,
  showEdges: false,
  showLabels: true,
  isolateSelected: false,
  sidebarCollapsed: true,

  hiddenGroups: {
    slide: false,
    frame: false,
    fire_control: false,
    magazine: false,
  },

  selectedPartId: null,
  hoveredPartId: null,

  cameraCommand: { preset: 'armory_showcase', seq: 0 },

  selectArmoryWeapon: (weaponId) =>
    set((s) => ({
      activeWeaponId: weaponId,
      targetProgress: 0.0,
      fireProgress: 0,
      selectedPartId: null,
      hoveredPartId: null,
      cameraCommand: {
        preset: 'armory_showcase',
        seq: s.cameraCommand.seq + 1,
      },
    })),

  enterWorkbench: (weaponId) =>
    set((s) => ({
      screen: 'workbench',
      activeWeaponId: weaponId ?? s.activeWeaponId,
      mode: 'explode',
      isPlaying: false,
      isFiringPlaying: false,
      targetProgress: 1.0,
      fireProgress: 0,
      textureModalOpen: false,
      xrayShells: false,
      showLabels: true,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: {
        slide: false,
        frame: false,
        fire_control: false,
        magazine: false,
      },
      cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
    })),

  returnToArmory: () =>
    set((s) => ({
      screen: 'armory',
      mode: 'explode',
      isPlaying: false,
      isFiringPlaying: false,
      targetProgress: 0.0,
      fireProgress: 0,
      textureModalOpen: false,
      xrayShells: false,
      isolateSelected: false,
      selectedPartId: null,
      hoveredPartId: null,
      hiddenGroups: {
        slide: false,
        frame: false,
        fire_control: false,
        magazine: false,
      },
      cameraCommand: {
        preset: 'armory_showcase',
        seq: s.cameraCommand.seq + 1,
      },
    })),

  toggleArmoryAutoRotate: () =>
    set((s) => ({ armoryAutoRotate: !s.armoryAutoRotate })),

  setMode: (mode) => {
    const s = get();
    if (mode === 'firing') {
      set({
        mode: 'firing',
        isPlaying: false,
        targetProgress: 0,
        xrayShells: true,
        isolateSelected: false,
        selectedPartId: null,
        fireProgress: 0,
        isFiringPlaying: true,
        hiddenGroups: {
          slide: false,
          frame: false,
          fire_control: false,
          magazine: false,
        },
        cameraCommand: { preset: 'firing_view', seq: s.cameraCommand.seq + 1 },
      });
    } else {
      set({
        mode: 'explode',
        isFiringPlaying: false,
        fireProgress: 0,
        xrayShells: false,
        targetProgress: s.mode === 'firing' ? 1.0 : s.targetProgress,
        cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
      });
    }
  },

  setTargetProgress: (t) =>
    set({
      targetProgress: Math.max(0, Math.min(1, t)),
    }),

  togglePlay: () => {
    const { isPlaying, targetProgress } = get();
    if (!isPlaying) {
      let dir: 1 | -1 = 1;
      if (targetProgress >= 0.99) dir = -1;
      else if (targetProgress <= 0.01) dir = 1;
      set({ mode: 'explode', isPlaying: true, playDirection: dir });
    } else {
      set({ isPlaying: false });
    }
  },

  stopPlay: () => set({ isPlaying: false }),

  setPlaySpeed: (playSpeed) => set({ playSpeed }),

  setFireProgress: (f) =>
    set({
      fireProgress: Math.max(0, Math.min(1, f)),
    }),

  toggleFiringPlay: () => {
    const { isFiringPlaying, fireProgress } = get();
    if (!isFiringPlaying) {
      set({
        mode: 'firing',
        targetProgress: 0,
        fireProgress: fireProgress >= 0.99 ? 0 : fireProgress,
        isFiringPlaying: true,
      });
    } else {
      set({ isFiringPlaying: false });
    }
  },

  stopFiringPlay: () => set({ isFiringPlaying: false }),

  triggerSingleShot: () => {
    const s = get();
    set({
      mode: 'firing',
      isPlaying: false,
      targetProgress: 0,
      xrayShells: true,
      fireProgress: 0,
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
  toggleXrayShells: () => set((s) => ({ xrayShells: !s.xrayShells })),
  setXrayShells: (xrayShells) => set({ xrayShells }),
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

  hoverPart: (hoveredPartId) => set({ hoveredPartId }),

  triggerCameraPreset: (preset) =>
    set((s) => ({
      cameraCommand: { preset, seq: s.cameraCommand.seq + 1 },
    })),

  activateSafeActionCutaway: () =>
    set((s) => {
      const meta = getWeaponWorkbenchMeta(s.activeWeaponId);
      return {
        mode: 'explode',
        isPlaying: false,
        isFiringPlaying: false,
        targetProgress: 0,
        xrayShells: true,
        isolateSelected: false,
        selectedPartId: meta.cutawayFocusPartId,
        cameraCommand: { preset: 'safe_action', seq: s.cameraCommand.seq + 1 },
      };
    }),

  resetAll: () =>
    set((s) => ({
      mode: 'explode',
      isPlaying: false,
      isFiringPlaying: false,
      targetProgress: 1.0,
      fireProgress: 0,
      pbrTexturesEnabled: true,
  xrayShells: false,
      showEdges: false,
      showLabels: true,
      isolateSelected: false,
      selectedPartId: null,
      hiddenGroups: {
        slide: false,
        frame: false,
        fire_control: false,
        magazine: false,
      },
      cameraCommand: { preset: 'iso', seq: s.cameraCommand.seq + 1 },
    })),
}));

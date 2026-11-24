import { create } from 'zustand';
import type { WeaponId } from '../../weapons/types';
import {
  type AttachmentPhysicsDelta,
  type AttachmentPresetId,
  DEFAULT_ATTACHMENT_LOADOUT,
  type MuzzleAttachmentId,
  NEUTRAL_PHYSICS_DELTA,
  type OpticAttachmentId,
  type WeaponAttachmentLoadout,
  computeCombinedAttachmentPhysics,
  getWeaponAttachmentMountProfile,
  isMuzzleCompatible,
  isOpticCompatible,
  resolvePresetForWeapon,
} from './attachmentSpecs';

// Pre-cached physics delta table keyed by `${muzzle}|${optic}` so 60fps `useFrame`
// hot paths read combined attachment modifiers with strictly ZERO heap allocations.
const COMBINED_PHYSICS_CACHE = new Map<string, AttachmentPhysicsDelta>();

export function getCachedCombinedAttachmentPhysics(
  muzzle: MuzzleAttachmentId,
  optic: OpticAttachmentId
): Readonly<AttachmentPhysicsDelta> {
  if (muzzle === 'none' && optic === 'none') {
    return NEUTRAL_PHYSICS_DELTA;
  }
  const key = `${muzzle}|${optic}`;
  let cached = COMBINED_PHYSICS_CACHE.get(key);
  if (!cached) {
    cached = computeCombinedAttachmentPhysics(muzzle, optic);
    COMBINED_PHYSICS_CACHE.set(key, cached);
  }
  return cached;
}

export interface AttachmentStoreState {
  benchOpen: boolean;
  loadouts: Partial<Record<WeaponId, WeaponAttachmentLoadout>>;
  setBenchOpen: (open: boolean) => void;
  toggleBenchOpen: () => void;
  setMuzzle: (weaponId: WeaponId, muzzle: MuzzleAttachmentId) => boolean;
  setOptic: (weaponId: WeaponId, optic: OpticAttachmentId) => boolean;
  applyPreset: (
    weaponId: WeaponId,
    presetId: AttachmentPresetId
  ) => WeaponAttachmentLoadout;
  resetWeapon: (weaponId: WeaponId) => void;
  resetAll: () => void;
}

export const useAttachmentStore = create<AttachmentStoreState>((set, get) => ({
  benchOpen: false,
  loadouts: {},

  setBenchOpen: (benchOpen) => set({ benchOpen }),

  toggleBenchOpen: () => set((s) => ({ benchOpen: !s.benchOpen })),

  setMuzzle: (weaponId, muzzle) => {
    if (!isMuzzleCompatible(weaponId, muzzle)) {
      return false;
    }
    const cur = get().loadouts[weaponId] ?? DEFAULT_ATTACHMENT_LOADOUT;
    if (cur.muzzle === muzzle) return true;
    const next: WeaponAttachmentLoadout = { muzzle, optic: cur.optic };
    set((s) => {
      const nextLoadouts = { ...s.loadouts };
      if (next.muzzle === 'none' && next.optic === 'none') {
        delete nextLoadouts[weaponId];
      } else {
        nextLoadouts[weaponId] = next;
      }
      return { loadouts: nextLoadouts };
    });
    return true;
  },

  setOptic: (weaponId, optic) => {
    if (!isOpticCompatible(weaponId, optic)) {
      return false;
    }
    const cur = get().loadouts[weaponId] ?? DEFAULT_ATTACHMENT_LOADOUT;
    if (cur.optic === optic) return true;
    const next: WeaponAttachmentLoadout = { muzzle: cur.muzzle, optic };
    set((s) => {
      const nextLoadouts = { ...s.loadouts };
      if (next.muzzle === 'none' && next.optic === 'none') {
        delete nextLoadouts[weaponId];
      } else {
        nextLoadouts[weaponId] = next;
      }
      return { loadouts: nextLoadouts };
    });
    return true;
  },

  applyPreset: (weaponId, presetId) => {
    const resolved = resolvePresetForWeapon(weaponId, presetId);
    set((s) => {
      const nextLoadouts = { ...s.loadouts };
      if (resolved.muzzle === 'none' && resolved.optic === 'none') {
        delete nextLoadouts[weaponId];
      } else {
        nextLoadouts[weaponId] = resolved;
      }
      return { loadouts: nextLoadouts };
    });
    return resolved;
  },

  resetWeapon: (weaponId) => {
    set((s) => {
      if (!(weaponId in s.loadouts)) return s;
      const nextLoadouts = { ...s.loadouts };
      delete nextLoadouts[weaponId];
      return { loadouts: nextLoadouts };
    });
  },

  resetAll: () => set({ loadouts: {}, benchOpen: false }),
}));

/** Zero-GC non-reactive loadout getter for 60fps `useFrame` & audio hooks. */
export function getWeaponAttachmentLoadout(
  weaponId: WeaponId
): Readonly<WeaponAttachmentLoadout> {
  return (
    useAttachmentStore.getState().loadouts[weaponId] ??
    DEFAULT_ATTACHMENT_LOADOUT
  );
}

/** Zero-GC non-reactive combined physics delta getter for 60fps `useFrame` & audio hooks. */
export function getActiveWeaponAttachmentPhysics(
  weaponId: WeaponId
): Readonly<AttachmentPhysicsDelta> {
  const loadout = getWeaponAttachmentLoadout(weaponId);
  return getCachedCombinedAttachmentPhysics(loadout.muzzle, loadout.optic);
}

/**
 * Boolean helper used by granular Zustand selectors in `PartActor.tsx` so stock
 * muzzle devices / carry handles / scopes cleanly yield to mounted custom attachments.
 */
export function selectIsPartReplacedByAttachment(
  state: AttachmentStoreState,
  weaponId: WeaponId,
  partId: string
): boolean {
  const loadout = state.loadouts[weaponId];
  if (!loadout) return false;
  const profile = getWeaponAttachmentMountProfile(weaponId);
  if (
    loadout.muzzle !== 'none' &&
    profile.muzzleReplacedPartIds.includes(partId)
  ) {
    return true;
  }
  if (
    loadout.optic !== 'none' &&
    profile.opticReplacedPartIds.includes(partId)
  ) {
    return true;
  }
  return false;
}

import { useCallback, useSyncExternalStore } from 'react';
import type { FiringPhaseInfo, TimelinePresetItem } from '../../weapons/types';
import { clamp01, findActiveFiringPhase } from '../kinematics/math';

export interface PlaybackClockSnapshot {
  targetProgress: number;
  animatedProgress: number;
  fireProgress: number;
  animatedFireProgress: number;
}

const clockState: PlaybackClockSnapshot = {
  targetProgress: 0,
  animatedProgress: 0,
  fireProgress: 0,
  animatedFireProgress: 0,
};

type ScalarListener = (value: number) => void;

const explodeListeners = new Set<ScalarListener>();
const fireListeners = new Set<ScalarListener>();

export const playbackClock = {
  getState(): Readonly<PlaybackClockSnapshot> {
    return clockState;
  },

  setTargetProgress(t: number, snapAnimated = false): void {
    const clamped = clamp01(t);
    clockState.targetProgress = clamped;
    if (snapAnimated) {
      clockState.animatedProgress = clamped;
    }
    explodeListeners.forEach((fn) => fn(clamped));
  },

  setAnimatedProgress(t: number): void {
    clockState.animatedProgress = t;
  },

  setFireProgress(f: number, snapAnimated = false): void {
    const clamped = clamp01(f);
    clockState.fireProgress = clamped;
    if (snapAnimated) {
      clockState.animatedFireProgress = clamped;
    }
    fireListeners.forEach((fn) => fn(clamped));
  },

  setAnimatedFireProgress(f: number): void {
    clockState.animatedFireProgress = f;
  },

  subscribeExplodeProgress(listener: ScalarListener): () => void {
    explodeListeners.add(listener);
    return () => {
      explodeListeners.delete(listener);
    };
  },

  subscribeFireProgress(listener: ScalarListener): () => void {
    fireListeners.add(listener);
    return () => {
      fireListeners.delete(listener);
    };
  },
};

function subscribeExplodeStore(onStoreChange: () => void): () => void {
  return playbackClock.subscribeExplodeProgress(() => onStoreChange());
}

function subscribeFireStore(onStoreChange: () => void): () => void {
  return playbackClock.subscribeFireProgress(() => onStoreChange());
}

function resolveActivePresetId(
  presets: readonly TimelinePresetItem[],
  t: number
): string | null {
  for (let i = 0; i < presets.length; i++) {
    if (Math.abs(t - presets[i].t) < 0.03) {
      return presets[i].id;
    }
  }
  return null;
}

/**
 * Subscribes to disassembly progress via `useSyncExternalStore` and ONLY triggers
 * a React re-render when the discrete active preset ID string changes (zero 60Hz re-renders).
 */
export function useActiveTimelinePresetId(
  presets: readonly TimelinePresetItem[]
): string | null {
  const getSnapshot = useCallback(
    () => resolveActivePresetId(presets, clockState.targetProgress),
    [presets]
  );

  return useSyncExternalStore(subscribeExplodeStore, getSnapshot, () => null);
}

/**
 * Subscribes to firing cycle progress via `useSyncExternalStore` and ONLY triggers
 * a React re-render when crossing into a new mechanical stage out of the 7 firing phases.
 */
export function useActiveFiringPhase(
  phases: readonly FiringPhaseInfo[]
): FiringPhaseInfo | null {
  const getSnapshot = useCallback(
    () =>
      phases.length > 0
        ? findActiveFiringPhase(phases, clockState.fireProgress)
        : null,
    [phases]
  );

  return useSyncExternalStore(subscribeFireStore, getSnapshot, () => null);
}

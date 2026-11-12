import { useSyncExternalStore } from 'react';
import { resolveAssetUrl } from '../engine/utils/assetUrl';

export interface NarrationTrack {
  key: string;
  relativeUrl: string;
  label: string;
  kind: 'story' | 'part';
  actId?: string;
  partId?: string;
}

export interface AudioPlayerSnapshot {
  isPlaying: boolean;
  isLoading: boolean;
  hasError: boolean;
  activeKey: string | null;
  activeKind: 'story' | 'part' | null;
  activeActId: string | null;
  activePartId: string | null;
  activeLabel: string | null;
  queueLength: number;
  queueIndex: number;
  currentTime: number;
  duration: number;
  progress: number;
  playbackRate: 1 | 1.25 | 1.5;
}

const INITIAL_SNAPSHOT: AudioPlayerSnapshot = {
  isPlaying: false,
  isLoading: false,
  hasError: false,
  activeKey: null,
  activeKind: null,
  activeActId: null,
  activePartId: null,
  activeLabel: null,
  queueLength: 0,
  queueIndex: 0,
  currentTime: 0,
  duration: 0,
  progress: 0,
  playbackRate: 1,
};

let currentSnapshot: AudioPlayerSnapshot = INITIAL_SNAPSHOT;
let trackQueue: NarrationTrack[] = [];
let audioEl: HTMLAudioElement | null = null;
const listeners = new Set<() => void>();

function emitSnapshot(patch: Partial<AudioPlayerSnapshot>): void {
  currentSnapshot = { ...currentSnapshot, ...patch };
  listeners.forEach((fn) => fn());
}

function ensureAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (audioEl) return audioEl;

  const el = new Audio();
  el.preload = 'auto';

  el.addEventListener('loadstart', () => {
    if (!currentSnapshot.activeKey) return;
    emitSnapshot({ isLoading: true, hasError: false });
  });

  el.addEventListener('loadedmetadata', () => {
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    emitSnapshot({
      isLoading: false,
      duration: dur,
      progress: dur > 0 ? Math.min(1, el.currentTime / dur) : 0,
    });
  });

  el.addEventListener('canplay', () => {
    emitSnapshot({ isLoading: false });
  });

  el.addEventListener('play', () => {
    emitSnapshot({ isPlaying: true, isLoading: false, hasError: false });
  });

  el.addEventListener('pause', () => {
    if (!el.ended) {
      emitSnapshot({ isPlaying: false });
    }
  });

  el.addEventListener('timeupdate', () => {
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    const cur = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    emitSnapshot({
      currentTime: cur,
      duration: dur,
      progress: dur > 0 ? Math.min(1, cur / dur) : 0,
    });
  });

  el.addEventListener('ended', () => {
    const nextIdx = currentSnapshot.queueIndex + 1;
    if (nextIdx < trackQueue.length) {
      startQueueIndex(nextIdx);
    } else {
      emitSnapshot({
        isPlaying: false,
        currentTime: 0,
        progress: 0,
      });
    }
  });

  el.addEventListener('error', () => {
    emitSnapshot({
      isPlaying: false,
      isLoading: false,
      hasError: true,
    });
  });

  audioEl = el;
  return el;
}

function startQueueIndex(index: number): void {
  const el = ensureAudioElement();
  const track = trackQueue[index];
  if (!el || !track) return;

  el.pause();
  el.src = resolveAssetUrl(track.relativeUrl);
  el.playbackRate = currentSnapshot.playbackRate;
  el.currentTime = 0;

  emitSnapshot({
    isPlaying: false,
    isLoading: true,
    hasError: false,
    activeKey: track.key,
    activeKind: track.kind,
    activeActId: track.actId ?? null,
    activePartId: track.partId ?? null,
    activeLabel: track.label,
    queueLength: trackQueue.length,
    queueIndex: index,
    currentTime: 0,
    duration: 0,
    progress: 0,
  });

  void el.play().catch(() => {
    emitSnapshot({
      isPlaying: false,
      isLoading: false,
    });
  });
}

export function playNarrationPlaylist(
  tracks: NarrationTrack[],
  startIndex = 0
): void {
  if (tracks.length === 0) return;
  const clamped = Math.max(0, Math.min(tracks.length - 1, startIndex));
  trackQueue = [...tracks];
  startQueueIndex(clamped);
}

export function playOrToggleNarrationTrack(track: NarrationTrack): void {
  const el = ensureAudioElement();
  if (!el) return;

  if (currentSnapshot.activeKey === track.key) {
    if (currentSnapshot.isPlaying) {
      el.pause();
      emitSnapshot({ isPlaying: false });
    } else {
      el.playbackRate = currentSnapshot.playbackRate;
      void el.play().catch(() => {
        emitSnapshot({ isPlaying: false });
      });
    }
    return;
  }

  trackQueue = [track];
  startQueueIndex(0);
}

export function toggleActiveNarrationPlayPause(): void {
  const el = ensureAudioElement();
  if (!el || !currentSnapshot.activeKey) return;
  if (currentSnapshot.isPlaying) {
    el.pause();
    emitSnapshot({ isPlaying: false });
  } else {
    el.playbackRate = currentSnapshot.playbackRate;
    void el.play().catch(() => {
      emitSnapshot({ isPlaying: false });
    });
  }
}

export function stopNarrationAudio(): void {
  if (audioEl) {
    audioEl.pause();
    audioEl.removeAttribute('src');
    audioEl.load();
  }
  trackQueue = [];
  emitSnapshot({
    isPlaying: false,
    isLoading: false,
    hasError: false,
    activeKey: null,
    activeKind: null,
    activeActId: null,
    activePartId: null,
    activeLabel: null,
    queueLength: 0,
    queueIndex: 0,
    currentTime: 0,
    duration: 0,
    progress: 0,
  });
}

export function seekNarrationAudio(ratio01: number): void {
  const el = ensureAudioElement();
  if (!el || !Number.isFinite(el.duration) || el.duration <= 0) return;
  const clamped = Math.max(0, Math.min(1, ratio01));
  el.currentTime = clamped * el.duration;
  emitSnapshot({
    currentTime: el.currentTime,
    progress: clamped,
  });
}

export function cycleNarrationPlaybackRate(): void {
  const nextRate: 1 | 1.25 | 1.5 =
    currentSnapshot.playbackRate === 1
      ? 1.25
      : currentSnapshot.playbackRate === 1.25
        ? 1.5
        : 1;
  if (audioEl) {
    audioEl.playbackRate = nextRate;
  }
  emitSnapshot({ playbackRate: nextRate });
}

export function subscribeAudioPlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function useNarrationAudioPlayer(): AudioPlayerSnapshot {
  return useSyncExternalStore(
    subscribeAudioPlayer,
    () => currentSnapshot,
    () => INITIAL_SNAPSHOT
  );
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

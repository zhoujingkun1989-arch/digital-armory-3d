import { useSyncExternalStore } from 'react';
import { resolveAssetUrl } from '../engine/utils/assetUrl';

export interface NarrationTrack {
  key: string;
  relativeUrl: string;
  label: string;
  kind: 'story' | 'part';
  actId?: string;
  partId?: string;
  fallbackText?: string;
  lang?: 'zh' | 'en';
}

export const MIN_NARRATION_PLAYBACK_RATE = 0.75;
export const MAX_NARRATION_PLAYBACK_RATE = 1.5;
export const DOCUMENTARY_PLAYBACK_RATES = [0.85, 1, 1.25] as const;
export type DocumentaryPlaybackRate = (typeof DOCUMENTARY_PLAYBACK_RATES)[number];

const PLAYBACK_RATE_STORAGE_KEY = 'digital-armory-narration-rate';

export function clampNarrationPlaybackRate(rate: number): number {
  if (!Number.isFinite(rate)) return 1;
  const clamped = Math.max(
    MIN_NARRATION_PLAYBACK_RATE,
    Math.min(MAX_NARRATION_PLAYBACK_RATE, rate)
  );
  return Math.round(clamped * 100) / 100;
}

function loadPersistedPlaybackRate(): number {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const storage = (
        globalThis as unknown as {
          localStorage?: { getItem?: (k: string) => string | null };
        }
      ).localStorage;
      const raw = storage?.getItem?.(PLAYBACK_RATE_STORAGE_KEY);
      if (raw !== null && raw !== undefined) {
        const parsed = Number(raw);
        if (Number.isFinite(parsed)) {
          return clampNarrationPlaybackRate(parsed);
        }
      }
    }
  } catch {
    // Ignore restricted storage environments
  }
  return 1;
}

function persistPlaybackRate(rate: number): void {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const storage = (
        globalThis as unknown as {
          localStorage?: { setItem?: (k: string, v: string) => void };
        }
      ).localStorage;
      storage?.setItem?.(PLAYBACK_RATE_STORAGE_KEY, String(rate));
    }
  } catch {
    // Ignore QuotaExceeded / private browsing
  }
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
  playbackRate: number;
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
  playbackRate: loadPersistedPlaybackRate(),
};

let currentSnapshot: AudioPlayerSnapshot = INITIAL_SNAPSHOT;
let trackQueue: NarrationTrack[] = [];
let audioEl: HTMLAudioElement | null = null;
let pendingSeekRatio: number | null = null;
let usingSpeechFallback = false;
let activeUtterance: SpeechSynthesisUtterance | null = null;
let speechPaused = false;
let speechTimer: number | null = null;
const listeners = new Set<() => void>();

function emitSnapshot(patch: Partial<AudioPlayerSnapshot>): void {
  currentSnapshot = { ...currentSnapshot, ...patch };
  listeners.forEach((fn) => fn());
}

function canUseSpeechSynthesis(): boolean {
  return (
    typeof window !== 'undefined' &&
    'speechSynthesis' in window &&
    typeof window.speechSynthesis?.speak === 'function' &&
    typeof SpeechSynthesisUtterance !== 'undefined'
  );
}

function clearSpeechTimer(): void {
  if (speechTimer !== null && typeof window !== 'undefined') {
    window.clearInterval(speechTimer);
    speechTimer = null;
  }
}

function cancelSpeechFallback(): void {
  clearSpeechTimer();
  activeUtterance = null;
  usingSpeechFallback = false;
  speechPaused = false;
  if (typeof window !== 'undefined') {
    window.speechSynthesis?.cancel();
  }
}

function startSpeechFallback(track: NarrationTrack): boolean {
  if (usingSpeechFallback && activeUtterance) {
    return true;
  }
  const text = track.fallbackText?.trim();
  if (!text || !canUseSpeechSynthesis()) {
    return false;
  }

  cancelSpeechFallback();

  const langTag =
    track.lang === 'en'
      ? 'en-US'
      : track.lang === 'zh'
        ? 'zh-CN'
        : /[\u4e00-\u9fff]/.test(text)
          ? 'zh-CN'
          : 'en-US';
  const rate = currentSnapshot.playbackRate;
  const estDuration =
    langTag === 'zh-CN'
      ? Math.max(4, text.length / (4.2 * rate))
      : Math.max(4, text.split(/\s+/).length / (2.6 * rate));

  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = langTag;
  utterance.rate = rate;

  activeUtterance = utterance;
  usingSpeechFallback = true;
  speechPaused = false;

  utterance.onstart = () => {
    if (utterance !== activeUtterance) return;
    emitSnapshot({
      isPlaying: true,
      isLoading: false,
      hasError: false,
    });
  };

  utterance.onend = () => {
    if (utterance !== activeUtterance) return;
    clearSpeechTimer();
    activeUtterance = null;
    usingSpeechFallback = false;
    speechPaused = false;

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
  };

  utterance.onerror = (ev) => {
    if (utterance !== activeUtterance) return;
    if (ev.error === 'canceled' || ev.error === 'interrupted') {
      return;
    }
    clearSpeechTimer();
    activeUtterance = null;
    usingSpeechFallback = false;
    speechPaused = false;
    emitSnapshot({
      isPlaying: false,
      isLoading: false,
      hasError: true,
    });
  };

  try {
    window.speechSynthesis.speak(utterance);
  } catch {
    clearSpeechTimer();
    activeUtterance = null;
    usingSpeechFallback = false;
    speechPaused = false;
    return false;
  }

  emitSnapshot({
    isPlaying: true,
    isLoading: false,
    hasError: false,
    currentTime: 0,
    duration: estDuration,
    progress: 0,
  });

  speechTimer = window.setInterval(() => {
    if (!usingSpeechFallback || speechPaused) return;
    const nextCur = Math.min(
      estDuration * 0.98,
      currentSnapshot.currentTime + 0.25 * currentSnapshot.playbackRate
    );
    emitSnapshot({
      currentTime: nextCur,
      duration: estDuration,
      progress: estDuration > 0 ? Math.min(0.98, nextCur / estDuration) : 0,
    });
  }, 250);

  return true;
}

function ensureAudioElement(): HTMLAudioElement | null {
  if (typeof window === 'undefined' || typeof Audio === 'undefined') {
    return null;
  }
  if (audioEl) return audioEl;

  const el = new Audio();
  el.preload = 'auto';

  el.addEventListener('loadstart', () => {
    if (!currentSnapshot.activeKey || usingSpeechFallback) return;
    emitSnapshot({ isLoading: true, hasError: false });
  });

  el.addEventListener('loadedmetadata', () => {
    if (usingSpeechFallback) return;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    if (pendingSeekRatio !== null && dur > 0) {
      const ratio = pendingSeekRatio;
      pendingSeekRatio = null;
      el.currentTime = ratio * dur;
      emitSnapshot({
        isLoading: false,
        duration: dur,
        currentTime: el.currentTime,
        progress: ratio,
      });
      return;
    }
    emitSnapshot({
      isLoading: false,
      duration: dur,
      progress: dur > 0 ? Math.min(1, el.currentTime / dur) : 0,
    });
  });

  el.addEventListener('canplay', () => {
    if (usingSpeechFallback) return;
    emitSnapshot({ isLoading: false });
  });

  el.addEventListener('play', () => {
    if (usingSpeechFallback) return;
    emitSnapshot({ isPlaying: true, isLoading: false, hasError: false });
  });

  el.addEventListener('pause', () => {
    if (usingSpeechFallback) return;
    if (!el.ended) {
      emitSnapshot({ isPlaying: false });
    }
  });

  el.addEventListener('timeupdate', () => {
    if (usingSpeechFallback) return;
    const dur = Number.isFinite(el.duration) ? el.duration : 0;
    const cur = Number.isFinite(el.currentTime) ? el.currentTime : 0;
    emitSnapshot({
      currentTime: cur,
      duration: dur,
      progress: dur > 0 ? Math.min(1, cur / dur) : 0,
    });
  });

  el.addEventListener('ended', () => {
    if (usingSpeechFallback) return;
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
    if (!currentSnapshot.activeKey) return;
    const activeTrack = trackQueue[currentSnapshot.queueIndex];
    if (
      activeTrack &&
      activeTrack.key === currentSnapshot.activeKey &&
      startSpeechFallback(activeTrack)
    ) {
      return;
    }
    emitSnapshot({
      isPlaying: false,
      isLoading: false,
      hasError: true,
    });
  });

  audioEl = el;
  return el;
}

function startQueueIndex(index: number, initialSeekRatio = 0): void {
  const track = trackQueue[index];
  if (!track) return;

  const trimmedUrl = track.relativeUrl?.trim() ?? '';
  if (!trimmedUrl) {
    pendingSeekRatio = null;
    cancelSpeechFallback();
    if (audioEl) {
      audioEl.pause();
      audioEl.removeAttribute('src');
    }

    emitSnapshot({
      isPlaying: false,
      isLoading: false,
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

    if (canUseSpeechSynthesis()) {
      const started = startSpeechFallback(track);
      if (!started) {
        emitSnapshot({
          isPlaying: false,
          isLoading: false,
          hasError: false,
        });
      }
    }
    return;
  }

  const el = ensureAudioElement();
  if (!el) return;

  const clampedRatio =
    initialSeekRatio > 0 ? Math.max(0, Math.min(0.99, initialSeekRatio)) : 0;
  pendingSeekRatio = clampedRatio > 0 ? clampedRatio : null;

  cancelSpeechFallback();
  el.pause();
  el.src = resolveAssetUrl(trimmedUrl);
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
    progress: clampedRatio,
  });

  const targetKey = track.key;
  void el.play().catch(() => {
    if (currentSnapshot.activeKey !== targetKey || usingSpeechFallback) {
      return;
    }
    if (el.error && startSpeechFallback(track)) {
      return;
    }
    emitSnapshot({
      isPlaying: false,
      isLoading: false,
    });
  });
}

export function playNarrationPlaylist(
  tracks: NarrationTrack[],
  startIndex = 0,
  initialSeekRatio = 0
): void {
  if (tracks.length === 0) return;
  const clamped = Math.max(0, Math.min(tracks.length - 1, startIndex));
  trackQueue = [...tracks];
  startQueueIndex(clamped, initialSeekRatio);
}

export function playOrToggleNarrationTrack(track: NarrationTrack): void {
  const hasAudioUrl = Boolean(track.relativeUrl?.trim());
  if (hasAudioUrl && !ensureAudioElement()) return;

  if (currentSnapshot.activeKey === track.key) {
    if (currentSnapshot.hasError) {
      trackQueue = [track];
      startQueueIndex(0);
    } else {
      toggleActiveNarrationPlayPause();
    }
    return;
  }

  trackQueue = [track];
  startQueueIndex(0);
}

export function toggleActiveNarrationPlayPause(): void {
  if (!currentSnapshot.activeKey) return;

  if (usingSpeechFallback && canUseSpeechSynthesis()) {
    if (currentSnapshot.isPlaying) {
      window.speechSynthesis.pause();
      speechPaused = true;
      emitSnapshot({ isPlaying: false });
    } else if (
      speechPaused &&
      (window.speechSynthesis.paused || window.speechSynthesis.speaking)
    ) {
      window.speechSynthesis.resume();
      speechPaused = false;
      emitSnapshot({ isPlaying: true, hasError: false });
    } else {
      startQueueIndex(currentSnapshot.queueIndex);
    }
    return;
  }

  const activeTrack = trackQueue[currentSnapshot.queueIndex];
  if (activeTrack && !activeTrack.relativeUrl?.trim()) {
    startQueueIndex(currentSnapshot.queueIndex);
    return;
  }

  const el = ensureAudioElement();
  if (!el) return;

  if (currentSnapshot.isPlaying) {
    el.pause();
    emitSnapshot({ isPlaying: false });
  } else {
    el.playbackRate = currentSnapshot.playbackRate;
    void el.play().catch(() => {
      const currentTrack = trackQueue[currentSnapshot.queueIndex];
      if (currentTrack && el.error && startSpeechFallback(currentTrack)) {
        return;
      }
      emitSnapshot({ isPlaying: false });
    });
  }
}

export function stopNarrationAudio(): void {
  pendingSeekRatio = null;
  cancelSpeechFallback();
  if (audioEl) {
    audioEl.pause();
    if (audioEl.hasAttribute?.('src') || audioEl.src) {
      audioEl.removeAttribute('src');
      audioEl.load();
    }
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
  if (usingSpeechFallback) return;
  const clamped = Math.max(0, Math.min(1, Number.isFinite(ratio01) ? ratio01 : 0));
  const el = ensureAudioElement();
  if (!el) return;
  if (!Number.isFinite(el.duration) || el.duration <= 0) {
    pendingSeekRatio = clamped;
    emitSnapshot({ progress: clamped });
    return;
  }
  pendingSeekRatio = null;
  el.currentTime = clamped * el.duration;
  emitSnapshot({
    currentTime: el.currentTime,
    progress: clamped,
  });
}

export function setNarrationPlaybackRate(rate: number): number {
  const nextRate = clampNarrationPlaybackRate(rate);
  if (audioEl) {
    audioEl.playbackRate = nextRate;
  }
  if (activeUtterance) {
    activeUtterance.rate = nextRate;
  }
  persistPlaybackRate(nextRate);
  emitSnapshot({ playbackRate: nextRate });
  return nextRate;
}

export function cycleNarrationPlaybackRate(): void {
  const cur = currentSnapshot.playbackRate;
  const idx = DOCUMENTARY_PLAYBACK_RATES.findIndex(
    (r) => Math.abs(r - cur) < 0.02
  );
  const nextRate =
    idx >= 0
      ? DOCUMENTARY_PLAYBACK_RATES[(idx + 1) % DOCUMENTARY_PLAYBACK_RATES.length]
      : 1;
  setNarrationPlaybackRate(nextRate);
}

export function subscribeAudioPlayer(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNarrationAudioSnapshot(): AudioPlayerSnapshot {
  return currentSnapshot;
}

export function getNarrationAudioElement(): HTMLAudioElement | null {
  return audioEl;
}

export function useNarrationAudioPlayer(): AudioPlayerSnapshot {
  return useSyncExternalStore(
    subscribeAudioPlayer,
    () => currentSnapshot,
    () => INITIAL_SNAPSHOT
  );
}

export function formatAudioTimestamp(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '00:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
}

export function formatAudioTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const total = Math.floor(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

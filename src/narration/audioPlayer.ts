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

function startQueueIndex(index: number): void {
  const el = ensureAudioElement();
  const track = trackQueue[index];
  if (!el || !track) return;

  cancelSpeechFallback();
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
  const el = ensureAudioElement();
  if (!el || !currentSnapshot.activeKey) return;

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

  if (currentSnapshot.isPlaying) {
    el.pause();
    emitSnapshot({ isPlaying: false });
  } else {
    el.playbackRate = currentSnapshot.playbackRate;
    void el.play().catch(() => {
      const activeTrack = trackQueue[currentSnapshot.queueIndex];
      if (activeTrack && el.error && startSpeechFallback(activeTrack)) {
        return;
      }
      emitSnapshot({ isPlaying: false });
    });
  }
}

export function stopNarrationAudio(): void {
  cancelSpeechFallback();
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
  if (usingSpeechFallback) return;
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
  if (activeUtterance) {
    activeUtterance.rate = nextRate;
  }
  emitSnapshot({ playbackRate: nextRate });
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

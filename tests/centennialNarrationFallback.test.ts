import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as assetUrl from '../src/engine/utils/assetUrl';
import {
  getNarrationAudioSnapshot,
  type NarrationTrack,
  playNarrationPlaylist,
  playOrToggleNarrationTrack,
  setNarrationPlaybackRate,
  stopNarrationAudio,
  toggleActiveNarrationPlayPause,
} from '../src/narration/audioPlayer';

class MockSpeechSynthesisUtterance {
  text: string;
  lang = '';
  rate = 1;
  onstart: (() => void) | null = null;
  onend: (() => void) | null = null;
  onerror: ((ev: { error: string }) => void) | null = null;

  constructor(text: string) {
    this.text = text;
  }
}

interface MockAudioInstance {
  preload: string;
  playbackRate: number;
  currentTime: number;
  duration: number;
  ended: boolean;
  error: MediaError | null;
  src: string;
  srcAssignments: string[];
  pauseCount: number;
  playCount: number;
  loadCount: number;
  removeAttributeCalls: string[];
  hasAttribute: (name: string) => boolean;
  removeAttribute: (name: string) => void;
  addEventListener: (event: string, fn: () => void) => void;
  pause: () => void;
  play: () => Promise<void>;
  load: () => void;
}

function createMockAudioInstance(): MockAudioInstance {
  let currentSrc = '';
  const listeners = new Map<string, (() => void)[]>();
  const inst: MockAudioInstance = {
    preload: '',
    playbackRate: 1,
    currentTime: 0,
    duration: 0,
    ended: false,
    error: null,
    srcAssignments: [],
    pauseCount: 0,
    playCount: 0,
    loadCount: 0,
    removeAttributeCalls: [],
    get src() {
      return currentSrc;
    },
    set src(val: string) {
      currentSrc = val;
      inst.srcAssignments.push(val);
    },
    hasAttribute(name: string) {
      return name === 'src' && currentSrc.length > 0;
    },
    removeAttribute(name: string) {
      inst.removeAttributeCalls.push(name);
      if (name === 'src') {
        currentSrc = '';
      }
    },
    addEventListener(event: string, fn: () => void) {
      const list = listeners.get(event) ?? [];
      list.push(fn);
      listeners.set(event, list);
    },
    pause() {
      inst.pauseCount += 1;
    },
    play() {
      inst.playCount += 1;
      return Promise.resolve();
    },
    load() {
      inst.loadCount += 1;
    },
  };
  return inst;
}

describe('100-Weapon Expansion Phase 1D — Clean Empty-URL Web Speech API Fallback', () => {
  const originalWindow = (globalThis as { window?: unknown }).window;
  const originalAudio = (globalThis as { Audio?: unknown }).Audio;
  const originalUtterance = (
    globalThis as { SpeechSynthesisUtterance?: unknown }
  ).SpeechSynthesisUtterance;

  let spokenUtterances: MockSpeechSynthesisUtterance[];
  let cancelCount: number;
  let pauseSpeechCount: number;
  let resumeSpeechCount: number;
  let speechMock: {
    paused: boolean;
    speaking: boolean;
    speak: (u: MockSpeechSynthesisUtterance) => void;
    cancel: () => void;
    pause: () => void;
    resume: () => void;
  };
  let mockAudioInstances: MockAudioInstance[];
  let resolveSpy: ReturnType<typeof vi.spyOn>;

  function installBrowserMocks(withSpeech: boolean): void {
    spokenUtterances = [];
    cancelCount = 0;
    pauseSpeechCount = 0;
    resumeSpeechCount = 0;

    speechMock = {
      paused: false,
      speaking: false,
      speak(u: MockSpeechSynthesisUtterance) {
        speechMock.speaking = true;
        speechMock.paused = false;
        spokenUtterances.push(u);
      },
      cancel() {
        cancelCount += 1;
        speechMock.speaking = false;
        speechMock.paused = false;
      },
      pause() {
        pauseSpeechCount += 1;
        speechMock.paused = true;
      },
      resume() {
        resumeSpeechCount += 1;
        speechMock.paused = false;
      },
    };

    const windowStub: Record<string, unknown> = {
      setInterval: globalThis.setInterval.bind(globalThis),
      clearInterval: globalThis.clearInterval.bind(globalThis),
    };
    if (withSpeech) {
      windowStub.speechSynthesis = speechMock;
      (
        globalThis as { SpeechSynthesisUtterance?: unknown }
      ).SpeechSynthesisUtterance = MockSpeechSynthesisUtterance;
    } else {
      delete (globalThis as { SpeechSynthesisUtterance?: unknown })
        .SpeechSynthesisUtterance;
    }

    (globalThis as { window?: unknown }).window = windowStub;
    (globalThis as { Audio?: unknown }).Audio = class {
      constructor() {
        const inst = createMockAudioInstance();
        mockAudioInstances.push(inst);
        return inst;
      }
    };
  }

  beforeEach(() => {
    mockAudioInstances = [];
    installBrowserMocks(true);
    setNarrationPlaybackRate(1);
    stopNarrationAudio();
    resolveSpy = vi.spyOn(assetUrl, 'resolveAssetUrl');
  });

  afterEach(() => {
    stopNarrationAudio();
    setNarrationPlaybackRate(1);
    vi.restoreAllMocks();
    vi.useRealTimers();

    if (originalWindow === undefined) {
      delete (globalThis as { window?: unknown }).window;
    } else {
      (globalThis as { window?: unknown }).window = originalWindow;
    }
    if (originalAudio === undefined) {
      delete (globalThis as { Audio?: unknown }).Audio;
    } else {
      (globalThis as { Audio?: unknown }).Audio = originalAudio;
    }
    if (originalUtterance === undefined) {
      delete (globalThis as { SpeechSynthesisUtterance?: unknown })
        .SpeechSynthesisUtterance;
    } else {
      (globalThis as { SpeechSynthesisUtterance?: unknown })
        .SpeechSynthesisUtterance = originalUtterance;
    }
  });

  it('bypasses resolveAssetUrl and HTMLAudioElement when relativeUrl is empty or whitespace, invoking Web Speech directly in en-US and zh-CN', () => {
    const enTrack: NarrationTrack = {
      key: 't90m:story:en:act1',
      relativeUrl: '',
      label: 'Act I — Relikt & Proryv Evolution',
      kind: 'story',
      actId: 'act1',
      fallbackText:
        'The T-90M Proryv pairs a welded turret with Relikt explosive reactive armor.',
      lang: 'en',
    };

    playOrToggleNarrationTrack(enTrack);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(mockAudioInstances.length).toBe(0);
    expect(spokenUtterances.length).toBe(1);
    expect(spokenUtterances[0].lang).toBe('en-US');
    expect(spokenUtterances[0].text).toBe(enTrack.fallbackText);

    const enSnap = getNarrationAudioSnapshot();
    expect(enSnap.isPlaying).toBe(true);
    expect(enSnap.isLoading).toBe(false);
    expect(enSnap.hasError).toBe(false);
    expect(enSnap.activeKey).toBe(enTrack.key);
    expect(enSnap.activeKind).toBe('story');
    expect(enSnap.activeActId).toBe('act1');
    expect(enSnap.activePartId).toBeNull();
    expect(enSnap.activeLabel).toBe(enTrack.label);
    expect(enSnap.queueLength).toBe(1);
    expect(enSnap.queueIndex).toBe(0);
    expect(enSnap.duration).toBeGreaterThanOrEqual(4);

    // Whitespace-only URL in Chinese part narration also uses Web Speech directly
    const zhTrack: NarrationTrack = {
      key: 't90m:part:zh:t90m_barrel',
      relativeUrl: '   ',
      label: '2A46M-5 125mm 滑膛炮管',
      kind: 'part',
      partId: 't90m_barrel',
      fallbackText: '2A46M-5 125毫米滑膛炮管配备热护套与自动抽烟装置。',
      lang: 'zh',
    };

    playOrToggleNarrationTrack(zhTrack);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(spokenUtterances.length).toBe(2);
    expect(spokenUtterances[1].lang).toBe('zh-CN');
    expect(spokenUtterances[1].text).toBe(zhTrack.fallbackText);

    const zhSnap = getNarrationAudioSnapshot();
    expect(zhSnap.isPlaying).toBe(true);
    expect(zhSnap.isLoading).toBe(false);
    expect(zhSnap.hasError).toBe(false);
    expect(zhSnap.activePartId).toBe('t90m_barrel');
    expect(zhSnap.activeKind).toBe('part');
  });

  it('supports multi-act empty-URL playlists with playbackRate, pause/resume, 250ms progress timer, and seamless auto-advance', () => {
    vi.useFakeTimers();
    installBrowserMocks(true);
    setNarrationPlaybackRate(1.25);

    const playlist: NarrationTrack[] = [
      {
        key: 'bofors40:story:en:act1',
        relativeUrl: '',
        label: 'Act I — Naval Anti-Air Origins',
        kind: 'story',
        actId: 'act1',
        fallbackText:
          'Bofors engineered the 40mm L/60 autocannon for rapid naval air defense.',
        lang: 'en',
      },
      {
        key: 'bofors40:story:en:act2',
        relativeUrl: '',
        label: 'Act II — Vertical Sliding-Wedge Breech',
        kind: 'story',
        actId: 'act2',
        fallbackText:
          'A recoil-operated falling-block breech cycles four-round clips at 120 RPM.',
        lang: 'en',
      },
    ];

    playNarrationPlaylist(playlist, 0);

    expect(resolveSpy).not.toHaveBeenCalled();
    expect(spokenUtterances.length).toBe(1);
    expect(spokenUtterances[0].rate).toBe(1.25);
    expect(getNarrationAudioSnapshot().queueLength).toBe(2);
    expect(getNarrationAudioSnapshot().queueIndex).toBe(0);

    // 250ms timer advances currentTime & progress
    vi.advanceTimersByTime(500);
    const midSnap = getNarrationAudioSnapshot();
    expect(midSnap.currentTime).toBeGreaterThan(0);
    expect(midSnap.progress).toBeGreaterThan(0);

    // Pause & resume via toggleActiveNarrationPlayPause
    toggleActiveNarrationPlayPause();
    expect(pauseSpeechCount).toBe(1);
    expect(getNarrationAudioSnapshot().isPlaying).toBe(false);

    toggleActiveNarrationPlayPause();
    expect(resumeSpeechCount).toBe(1);
    expect(getNarrationAudioSnapshot().isPlaying).toBe(true);

    // Completing Act 1 automatically advances to Act 2 with zero network fetches
    spokenUtterances[0].onend?.();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(spokenUtterances.length).toBe(2);
    expect(spokenUtterances[1].text).toBe(playlist[1].fallbackText);

    const act2Snap = getNarrationAudioSnapshot();
    expect(act2Snap.isPlaying).toBe(true);
    expect(act2Snap.isLoading).toBe(false);
    expect(act2Snap.hasError).toBe(false);
    expect(act2Snap.activeKey).toBe(playlist[1].key);
    expect(act2Snap.activeActId).toBe('act2');
    expect(act2Snap.queueIndex).toBe(1);

    // Completing final act settles cleanly
    spokenUtterances[1].onend?.();
    const endSnap = getNarrationAudioSnapshot();
    expect(endSnap.isPlaying).toBe(false);
    expect(endSnap.hasError).toBe(false);
    expect(endSnap.currentTime).toBe(0);
    expect(endSnap.progress).toBe(0);
  });

  it('fails gracefully with isPlaying=false, isLoading=false, hasError=false when speechSynthesis is unavailable (headless CI)', () => {
    installBrowserMocks(false);

    const headlessTrack: NarrationTrack = {
      key: 'm777:story:en:act1',
      relativeUrl: '',
      label: 'Act I — Titanium Ultralight Howitzer',
      kind: 'story',
      actId: 'act1',
      fallbackText:
        'Extensive titanium alloy castings cut M777 weight nearly in half.',
      lang: 'en',
    };

    expect(() => playOrToggleNarrationTrack(headlessTrack)).not.toThrow();
    expect(resolveSpy).not.toHaveBeenCalled();

    const snap = getNarrationAudioSnapshot();
    expect(snap.isPlaying).toBe(false);
    expect(snap.isLoading).toBe(false);
    expect(snap.hasError).toBe(false);
    expect(snap.activeKey).toBe(headlessTrack.key);
    expect(snap.activeKind).toBe('story');
    expect(snap.activeActId).toBe('act1');
    expect(snap.activeLabel).toBe(headlessTrack.label);
    expect(snap.queueLength).toBe(1);
    expect(snap.queueIndex).toBe(0);
    expect(snap.currentTime).toBe(0);
    expect(snap.duration).toBe(0);
    expect(snap.progress).toBe(0);

    // Re-toggling play/pause when speechSynthesis is unavailable must never call el.play() or set hasError
    expect(() => toggleActiveNarrationPlayPause()).not.toThrow();
    expect(resolveSpy).not.toHaveBeenCalled();
    expect(getNarrationAudioSnapshot().hasError).toBe(false);
    expect(getNarrationAudioSnapshot().isPlaying).toBe(false);
  });

  it('preserves Flagship MP3 playback and cleanly strips audio src without refetching when switching from MP3 to empty-URL track', () => {
    const flagshipMp3Track: NarrationTrack = {
      key: 'ak15:story:en:act1',
      relativeUrl: 'audio/ak15/story_en_act1.mp3',
      label: 'Act I — Kalashnikov Modernization',
      kind: 'story',
      actId: 'act1',
      fallbackText: 'AK-15 modernizes the classic long-stroke piston.',
      lang: 'en',
    };

    playOrToggleNarrationTrack(flagshipMp3Track);

    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(resolveSpy).toHaveBeenCalledWith('audio/ak15/story_en_act1.mp3');

    const audioInst = mockAudioInstances[0];
    expect(audioInst).toBeDefined();
    expect(audioInst.srcAssignments).toEqual(['/audio/ak15/story_en_act1.mp3']);
    expect(audioInst.playCount).toBe(1);
    expect(getNarrationAudioSnapshot().isLoading).toBe(true);

    // Switch from Flagship MP3 directly to a Centennial empty-URL exhibit
    const centennialTrack: NarrationTrack = {
      key: 'm61vulcan:story:en:act1',
      relativeUrl: '',
      label: 'Act I — 6,000 RPM Rotary Revival',
      kind: 'story',
      actId: 'act1',
      fallbackText:
        'General Electric revived the Gatling principle for supersonic jet combat.',
      lang: 'en',
    };

    const pausesBefore = audioInst.pauseCount;
    const playsBefore = audioInst.playCount;

    playOrToggleNarrationTrack(centennialTrack);

    // Must NOT call resolveAssetUrl or audio.play() again; must pause & remove src attribute cleanly
    expect(resolveSpy).toHaveBeenCalledTimes(1);
    expect(audioInst.pauseCount).toBeGreaterThan(pausesBefore);
    expect(audioInst.removeAttributeCalls).toContain('src');
    expect(audioInst.src).toBe('');
    expect(audioInst.playCount).toBe(playsBefore);
    expect(spokenUtterances.length).toBe(1);
    expect(spokenUtterances[0].lang).toBe('en-US');
    expect(cancelCount).toBeGreaterThan(0);

    const snap = getNarrationAudioSnapshot();
    expect(snap.isPlaying).toBe(true);
    expect(snap.isLoading).toBe(false);
    expect(snap.hasError).toBe(false);
    expect(snap.activeKey).toBe(centennialTrack.key);
  });
});

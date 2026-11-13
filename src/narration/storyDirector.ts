import { useEffect, useState } from 'react';
import { playWorkbenchFoley } from '../engine/audio/mechanicalSoundEngine';
import {
  type StoryDirectorStageSpec,
  useAppStore,
} from '../store/useAppStore';
import { isWeaponId, type WeaponId } from '../weapons/types';
import {
  getNarrationAudioSnapshot,
  type NarrationTrack,
  playNarrationPlaylist,
  subscribeAudioPlayer,
} from './audioPlayer';
import {
  getLoadedNarrationBundle,
  loadWeaponNarration,
  subscribeWeaponNarrations,
} from './narrationService';
import type { LanguageCode, LocalizedWeaponStory } from './types';

export interface SubtitleCue {
  index: number;
  text: string;
  startRatio: number;
  endRatio: number;
}

export interface DirectorBeatPlan {
  beatKey: string;
  actId: string;
  stageBadgeZh: string;
  stageBadgeEn: string;
  stage: StoryDirectorStageSpec;
}

const EN_ABBREV_REGEX =
  /\b(?:U\.S|Obr|Gen|Mk|Dr|Mr|St|No|vs|approx|cal|in|mm|cm|kg|ft)\.$/i;

function splitEnglishSentences(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];

  const parts: string[] = [];
  let start = 0;

  for (let i = 0; i < trimmed.length; i++) {
    const ch = trimmed[i];
    if (ch !== '.' && ch !== '!' && ch !== '?' && ch !== ';') continue;

    // Skip decimal points such as 7.62, 5.56, .50, .338
    const prevCh = i > 0 ? trimmed[i - 1] : '';
    const nextCh = i + 1 < trimmed.length ? trimmed[i + 1] : '';
    if (ch === '.' && /\d/.test(nextCh)) continue;
    if (ch === '.' && /\d/.test(prevCh) && /\d/.test(nextCh)) continue;

    let endIdx = i + 1;
    while (
      endIdx < trimmed.length &&
      (trimmed[endIdx] === '"' ||
        trimmed[endIdx] === "'" ||
        trimmed[endIdx] === ')' ||
        trimmed[endIdx] === '”')
    ) {
      endIdx++;
    }

    if (endIdx < trimmed.length && !/\s/.test(trimmed[endIdx])) {
      continue;
    }

    const candidate = trimmed.slice(start, endIdx).trim();
    if (!candidate) continue;

    if (ch === '.' && EN_ABBREV_REGEX.test(candidate)) {
      continue;
    }
    // Single initial like "E. Stoner" or "M. Kalashnikov"
    if (ch === '.' && /(?:^|\s)[A-Z]\.$/.test(candidate)) {
      continue;
    }

    parts.push(candidate);
    start = endIdx;
    while (start < trimmed.length && /\s/.test(trimmed[start])) {
      start++;
    }
    i = start - 1;
  }

  const tail = trimmed.slice(start).trim();
  if (tail) {
    parts.push(tail);
  }
  return parts;
}

function splitChineseSentences(raw: string): string[] {
  const trimmed = raw.trim();
  if (!trimmed) return [];
  const matches = trimmed.match(/[^。！？；]+[。！？；]*[”」』）)]*/g);
  if (!matches) return [trimmed];
  return matches.map((s) => s.trim()).filter((s) => s.length > 0);
}

/**
 * Splits a verbatim TTS `audioScript` into proportional `[startRatio, endRatio]`
 * subtitle cues weighted by spoken character/word cadence and punctuation pauses.
 */
export function splitScriptIntoTimedCues(
  audioScript: string,
  lang: LanguageCode
): SubtitleCue[] {
  const clean = audioScript.trim();
  if (!clean) return [];

  const isZh = lang === 'zh' || /[\u4e00-\u9fff]/.test(clean);
  const sentences = isZh
    ? splitChineseSentences(clean)
    : splitEnglishSentences(clean);

  if (sentences.length === 0) return [];

  const weights = sentences.map((sentence) => {
    if (isZh) {
      const charCount = sentence.replace(/\s+/g, '').length;
      const commaCount = (sentence.match(/[，、：]/g) ?? []).length;
      return Math.max(4, charCount + commaCount * 2.4 + 3.8);
    }
    const charCount = sentence.replace(/\s+/g, '').length;
    const commaCount = (sentence.match(/[,:]/g) ?? []).length;
    return Math.max(8, charCount + commaCount * 4.5 + 7.5);
  });

  const totalWeight = weights.reduce((acc, w) => acc + w, 0);
  if (totalWeight <= 0) {
    return [
      {
        index: 0,
        text: clean,
        startRatio: 0,
        endRatio: 1,
      },
    ];
  }

  let acc = 0;
  return sentences.map((text, index) => {
    const startRatio = index === 0 ? 0 : acc / totalWeight;
    acc += weights[index];
    const endRatio = index === sentences.length - 1 ? 1 : acc / totalWeight;
    return {
      index,
      text,
      startRatio,
      endRatio,
    };
  });
}

export function findActiveSubtitleCueIndex(
  cues: readonly SubtitleCue[],
  progress01: number
): number {
  if (cues.length === 0) return -1;
  const p = Math.max(0, Math.min(1, progress01));
  for (let i = 0; i < cues.length; i++) {
    if (p < cues[i].endRatio || i === cues.length - 1) {
      return i;
    }
  }
  return cues.length - 1;
}

/**
 * Pure choreography planner mapping `(weaponId, story, actId, progress)` to an
 * idempotent 3D camera, cutaway, X-Ray, disassembly, or 0.25x firing stage.
 */
export function resolveDirectorBeat(
  weaponId: WeaponId,
  story: LocalizedWeaponStory,
  actId: string,
  progress01: number
): DirectorBeatPlan | null {
  const actIndex = story.acts.findIndex((a) => a.id === actId);
  if (actIndex < 0) return null;

  const act = story.acts[actIndex];
  const focusPart = act.focusPartId ?? null;
  const bt0 = story.breakthroughs[0]?.focusPartId ?? focusPart;
  const bt1 = story.breakthroughs[1]?.focusPartId ?? focusPart;
  const p = Math.max(0, Math.min(1, progress01));

  if (actIndex === 0) {
    if (p < 0.54) {
      return {
        beatKey: `${weaponId}:${actId}:pbr_focus`,
        actId,
        stageBadgeZh: '1:1 真铁特写',
        stageBadgeEn: '1:1 PBR Focus',
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: false,
          xrayShells: false,
          focusPartId: focusPart,
          cameraPreset: 'iso',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:field_strip`,
      actId,
      stageBadgeZh: '30% 野战快拆',
      stageBadgeEn: '30% Field Strip',
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: 0.3,
        sectionCut: false,
        xrayShells: false,
        focusPartId: null,
        cameraPreset: 'iso',
      },
    };
  }

  if (actIndex === 1) {
    if (p < 0.54) {
      return {
        beatKey: `${weaponId}:${actId}:cutaway_main`,
        actId,
        stageBadgeZh: 'C 纵向军械剖视',
        stageBadgeEn: 'Section-Cut (C)',
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: true,
          xrayShells: false,
          focusPartId: focusPart,
          cameraPreset: 'right',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:cutaway_bt0`,
      actId,
      stageBadgeZh: 'C 剖视内构聚焦',
      stageBadgeEn: 'Cutaway Core',
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: 0,
        sectionCut: true,
        xrayShells: false,
        focusPartId: bt0,
        cameraPreset: 'cutaway_focus',
      },
    };
  }

  if (actIndex === 2) {
    if (p < 0.52) {
      return {
        beatKey: `${weaponId}:${actId}:xray_lockup`,
        actId,
        stageBadgeZh: 'X-Ray 闭锁透视',
        stageBadgeEn: 'X-Ray Lockup',
        stage: {
          weaponId,
          mode: 'explode',
          targetProgress: 0,
          sectionCut: false,
          xrayShells: true,
          focusPartId: focusPart,
          cameraPreset: 'iso',
        },
      };
    }
    return {
      beatKey: `${weaponId}:${actId}:xray_explode`,
      actId,
      stageBadgeZh: '52% 核心机构分解',
      stageBadgeEn: '52% Sub-Strip',
      stage: {
        weaponId,
        mode: 'explode',
        targetProgress: 0.52,
        sectionCut: false,
        xrayShells: true,
        focusPartId: bt1,
        cameraPreset: 'iso',
      },
    };
  }

  // Act 4 (and any subsequent finale act): 0.25x Ultra-Slow Live Firing
  if (p < 0.54) {
    return {
      beatKey: `${weaponId}:${actId}:firing_xray`,
      actId,
      stageBadgeZh: '0.25x 透视慢放击发',
      stageBadgeEn: '0.25x X-Ray Firing',
      stage: {
        weaponId,
        mode: 'firing',
        targetProgress: 0,
        sectionCut: false,
        xrayShells: true,
        focusPartId: null,
        cameraPreset: 'firing_view',
        fireSpeedMultiplier: 0.25,
      },
    };
  }

  return {
    beatKey: `${weaponId}:${actId}:firing_cutaway`,
    actId,
    stageBadgeZh: '0.25x 剖视实弹循环',
    stageBadgeEn: '0.25x Cutaway Firing',
    stage: {
      weaponId,
      mode: 'firing',
      targetProgress: 0,
      sectionCut: true,
      xrayShells: false,
      focusPartId: null,
      cameraPreset: 'right',
      fireSpeedMultiplier: 0.25,
    },
  };
}

export function buildWeaponStoryTracks(
  weaponId: WeaponId,
  lang: LanguageCode,
  story: LocalizedWeaponStory
): NarrationTrack[] {
  return story.acts.map((act) => ({
    key: `story:${weaponId}:${lang}:${act.id}`,
    relativeUrl: act.audioUrl,
    label: `${act.actNumber} · ${act.title}`,
    kind: 'story',
    actId: act.id,
    fallbackText: act.audioScript,
    lang,
  }));
}

/**
 * One-click entry point to launch a firearm's 4-Act Bilingual Documentary in
 * 3D Director Mode (used by Showcase & Armory CTAs).
 */
export async function launchDirectorDocumentary(
  weaponIdRaw?: string,
  options?: { minimizeDrawer?: boolean; startActIndex?: number }
): Promise<void> {
  const store = useAppStore.getState();
  const weaponId: WeaponId = isWeaponId(weaponIdRaw)
    ? weaponIdRaw
    : store.activeWeaponId;
  const minimize = options?.minimizeDrawer ?? true;
  const startIdx = options?.startActIndex ?? 0;

  store.enterWorkbench(weaponId, 'explode');
  useAppStore.setState({
    storyOpen: true,
    storyMinimized: minimize,
    storyDirectorMode: true,
  });

  const bundle = await loadWeaponNarration(weaponId);
  const live = useAppStore.getState();
  if (!bundle || live.activeWeaponId !== weaponId) return;

  const localizedStory = bundle.story[live.lang];
  if (!localizedStory || localizedStory.acts.length === 0) return;

  const tracks = buildWeaponStoryTracks(weaponId, live.lang, localizedStory);
  playNarrationPlaylist(tracks, startIdx);
}

let activeDirectorBeat: DirectorBeatPlan | null = null;
const beatListeners = new Set<() => void>();

function setActiveDirectorBeat(next: DirectorBeatPlan | null): void {
  if (activeDirectorBeat?.beatKey === next?.beatKey) return;
  activeDirectorBeat = next;
  beatListeners.forEach((fn) => fn());
}

export function useActiveDirectorBeat(): DirectorBeatPlan | null {
  const [, setTick] = useState(0);
  useEffect(() => {
    const onBeat = () => setTick((n) => n + 1);
    beatListeners.add(onBeat);
    return () => {
      beatListeners.delete(onBeat);
    };
  }, []);
  return activeDirectorBeat;
}

/**
 * Root non-visual controller that orchestrates 3D camera flights, longitudinal
 * section-cut (`C`), X-Ray (`X`), staged explode, and `0.25x` slow-motion firing
 * in lockstep with the 4-Act narration audio timeline.
 */
export function useStoryDirectorController(): void {
  useEffect(() => {
    let lastAppliedBeatKey: string | null = null;

    const evaluateDirector = () => {
      const state = useAppStore.getState();
      const audio = getNarrationAudioSnapshot();

      if (
        !state.storyDirectorMode ||
        !state.storyOpen ||
        state.screen === 'showcase' ||
        audio.activeKind !== 'story' ||
        !audio.activeKey ||
        !audio.activeActId
      ) {
        if (!audio.isPlaying && !audio.isLoading) {
          lastAppliedBeatKey = null;
          setActiveDirectorBeat(null);
        }
        return;
      }

      // Track key format: `story:<weaponId>:<lang>:<actId>`
      const segments = audio.activeKey.split(':');
      const keyWeapon = segments[1];
      const keyLang = segments[2] as LanguageCode | undefined;
      if (!isWeaponId(keyWeapon)) return;

      const bundle = getLoadedNarrationBundle(keyWeapon);
      if (!bundle) {
        void loadWeaponNarration(keyWeapon);
        return;
      }

      const lang: LanguageCode = keyLang === 'en' ? 'en' : state.lang;
      const localizedStory = bundle.story[lang];
      if (!localizedStory) return;

      const plan = resolveDirectorBeat(
        keyWeapon,
        localizedStory,
        audio.activeActId,
        audio.progress
      );
      if (!plan) return;

      setActiveDirectorBeat(plan);

      if (
        (audio.isPlaying || audio.isLoading) &&
        plan.beatKey !== lastAppliedBeatKey
      ) {
        lastAppliedBeatKey = plan.beatKey;
        playWorkbenchFoley('director_cue');
        state.applyStoryDirectorStage(plan.stage);
      }
    };

    const unsubAudio = subscribeAudioPlayer(evaluateDirector);
    const unsubNarrations = subscribeWeaponNarrations(evaluateDirector);

    let prevDirectorEnabled = useAppStore.getState().storyDirectorMode;
    const unsubStore = useAppStore.subscribe((s) => {
      if (s.storyDirectorMode !== prevDirectorEnabled) {
        prevDirectorEnabled = s.storyDirectorMode;
        if (s.storyDirectorMode) {
          lastAppliedBeatKey = null;
          evaluateDirector();
        } else {
          setActiveDirectorBeat(null);
        }
      }
    });

    return () => {
      unsubAudio();
      unsubNarrations();
      unsubStore();
    };
  }, []);
}

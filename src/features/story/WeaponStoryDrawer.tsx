import React, { useCallback, useEffect, useId, useMemo, useRef } from 'react';
import {
  BookOpen,
  Captions,
  Clapperboard,
  Cpu,
  Crosshair,
  Film,
  History,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Sparkles,
  Volume2,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { isArcheryWeapon } from '../../engine/physics/armoryPhysics';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import {
  DOCUMENTARY_PLAYBACK_RATES,
  cycleNarrationPlaybackRate,
  formatAudioTimestamp,
  type NarrationTrack,
  playNarrationPlaylist,
  seekNarrationAudio,
  setNarrationPlaybackRate,
  stopNarrationAudio,
  toggleActiveNarrationPlayPause,
  useNarrationAudioPlayer,
} from '../../narration/audioPlayer';
import { useWeaponNarration } from '../../narration/narrationService';
import {
  buildWeaponStoryTracks,
  findActiveSubtitleCueIndex,
  splitScriptIntoTimedCues,
  type SubtitleCue,
  useActiveDirectorBeat,
} from '../../narration/storyDirector';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import { LanguageSwitchPill } from './LanguageSwitchPill';

const ACT_ROMAN_NUMERALS = ['I', 'II', 'III', 'IV'] as const;

export function formatPlaybackRateLabel(rate: number): string {
  return Math.abs(rate - 1) < 0.01 ? '1.0x' : `${rate}x`;
}

export interface WeaponStoryDrawerProps {
  forceOpen?: boolean;
}

export const WeaponStoryDrawer: React.FC<WeaponStoryDrawerProps> = ({
  forceOpen = false,
}) => {
  const storyOpenStore = useAppStore((s) => s.storyOpen);
  const storyOpen = forceOpen || storyOpenStore;
  const storyMinimized = useAppStore((s) => s.storyMinimized);
  const storyDirectorMode = useAppStore((s) => s.storyDirectorMode);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const setStoryMinimized = useAppStore((s) => s.setStoryMinimized);
  const toggleStoryDirectorMode = useAppStore((s) => s.toggleStoryDirectorMode);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const screen = useAppStore((s) => s.screen);
  const lang = useAppStore((s) => s.lang);
  const focusStoryPart = useAppStore((s) => s.focusStoryPart);

  const { bundle, loading } = useWeaponNarration(activeWeaponId);
  const audio = useNarrationAudioPlayer();
  const activeBeat = useActiveDirectorBeat();

  const ui = UI_STRINGS[lang].story;
  const isArchery = isArcheryWeapon(activeWeaponId);
  const drawerSubtitle = isArchery
    ? ui.archeryDrawerSubtitle
    : ui.drawerSubtitle;
  const minimizeTitle = isArchery ? ui.archeryMinimizeTitle : ui.minimizeTitle;
  const manifest = getWeaponManifest(activeWeaponId);
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);
  const localizedStory = bundle?.story[lang] ?? null;

  const playlistTracks: NarrationTrack[] = useMemo(() => {
    if (!localizedStory) return [];
    return buildWeaponStoryTracks(activeWeaponId, lang, localizedStory);
  }, [localizedStory, activeWeaponId, lang]);

  const actCuesMap = useMemo<Record<string, SubtitleCue[]>>(() => {
    if (!localizedStory) return {};
    const out: Record<string, SubtitleCue[]> = {};
    for (const act of localizedStory.acts) {
      out[act.id] = splitScriptIntoTimedCues(act.audioScript, lang);
    }
    return out;
  }, [localizedStory, lang]);

  const isThisWeaponStoryActive =
    audio.activeKind === 'story' &&
    Boolean(audio.activeKey?.startsWith(`story:${activeWeaponId}:${lang}:`));
  const isStoryPlaying = isThisWeaponStoryActive && audio.isPlaying;

  const activeActId = isThisWeaponStoryActive ? audio.activeActId : null;
  const activeCues = activeActId ? (actCuesMap[activeActId] ?? []) : [];
  const activeCueIndex =
    isThisWeaponStoryActive && activeCues.length > 0
      ? findActiveSubtitleCueIndex(activeCues, audio.progress)
      : -1;
  const activeCue = activeCueIndex >= 0 ? activeCues[activeCueIndex] : null;

  const titleId = useId();
  const drawerRef = useRef<HTMLElement>(null);
  const activeCueBtnRef = useRef<HTMLButtonElement | null>(null);

  const isExpandedDrawer =
    storyOpen && !storyMinimized && (forceOpen || screen !== 'showcase');

  const handleEscapeDismiss = useCallback(() => {
    if (audio.activeKind === 'story' && audio.isPlaying) {
      setStoryMinimized(true);
      return;
    }
    if (audio.activeKind === 'story') {
      stopNarrationAudio();
    }
    setStoryOpen(false);
  }, [audio.activeKind, audio.isPlaying, setStoryMinimized, setStoryOpen]);

  useDialogAccessibility({
    isOpen: isExpandedDrawer,
    containerRef: drawerRef,
    onClose: handleEscapeDismiss,
  });

  // Smoothly auto-scroll active subtitle sentence inside expanded drawer
  useEffect(() => {
    if (
      !storyOpen ||
      storyMinimized ||
      !isStoryPlaying ||
      activeCueIndex < 0 ||
      !activeCueBtnRef.current
    ) {
      return;
    }
    const prefersReducedMotion =
      typeof window !== 'undefined' &&
      Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);

    activeCueBtnRef.current.scrollIntoView({
      block: 'nearest',
      behavior: prefersReducedMotion ? 'auto' : 'smooth',
    });
  }, [storyOpen, storyMinimized, isStoryPlaying, activeActId, activeCueIndex]);

  if (!storyOpen || (!forceOpen && screen === 'showcase')) {
    return null;
  }

  const stageBadgeLabel =
    storyDirectorMode && isThisWeaponStoryActive && activeBeat
      ? lang === 'en'
        ? activeBeat.stageBadgeEn
        : activeBeat.stageBadgeZh
      : null;

  const handleMainPlayToggle = () => {
    if (playlistTracks.length === 0) return;
    if (isThisWeaponStoryActive) {
      toggleActiveNarrationPlayPause();
    } else {
      playNarrationPlaylist(playlistTracks, 0);
    }
  };

  const handleActClick = (actIndex: number, actId: string) => {
    if (playlistTracks.length === 0) return;
    if (isThisWeaponStoryActive && audio.activeActId === actId) {
      toggleActiveNarrationPlayPause();
    } else {
      playNarrationPlaylist(playlistTracks, actIndex);
    }
  };

  const handleCueSentenceClick = (
    actIndex: number,
    actId: string,
    cue: SubtitleCue
  ) => {
    if (playlistTracks.length === 0) return;
    const seekTarget = Math.min(0.99, cue.startRatio + 0.004);
    if (isThisWeaponStoryActive && audio.activeActId === actId) {
      seekNarrationAudio(seekTarget);
      if (!audio.isPlaying) {
        toggleActiveNarrationPlayPause();
      }
    } else {
      playNarrationPlaylist(playlistTracks, actIndex, seekTarget);
    }
  };

  const handleScrubChange = (ratio01: number) => {
    if (playlistTracks.length === 0) return;
    if (isThisWeaponStoryActive) {
      seekNarrationAudio(ratio01);
    } else {
      playNarrationPlaylist(playlistTracks, 0, ratio01);
    }
  };

  const activeActIndex =
    isThisWeaponStoryActive && localizedStory
      ? localizedStory.acts.findIndex((a) => a.id === audio.activeActId)
      : -1;
  const scrubProgressPct = isThisWeaponStoryActive
    ? Math.max(0, Math.min(100, audio.progress * 100))
    : 0;

  const handleClose = () => {
    if (audio.activeKind === 'story') {
      stopNarrationAudio();
    }
    setStoryOpen(false);
  };

  const handleSwitchToPilotAk15 = () => {
    stopNarrationAudio();
    if (screen === 'workbench') {
      enterWorkbench('ak15', 'explode');
      setStoryOpen(true);
    } else {
      selectArmoryWeapon('ak15');
      setStoryOpen(true);
    }
  };

  if (storyMinimized) {
    const miniHeadline = isThisWeaponStoryActive
      ? (audio.activeLabel ?? displayMeta.name)
      : (localizedStory?.headline ?? ui.miniIdleSubtitle);

    return (
      <aside
        className="story-mini-player"
        aria-label={`${displayMeta.name} — ${ui.badge}`}
      >
        <div className="story-mini-main">
          <button
            type="button"
            className={`story-mini-play-btn ${isStoryPlaying ? 'playing' : ''}`}
            onClick={handleMainPlayToggle}
            disabled={playlistTracks.length === 0}
            title={isStoryPlaying ? ui.pauseStory : ui.playFullStory}
            aria-label={isStoryPlaying ? ui.pauseStory : ui.playFullStory}
          >
            {audio.isLoading && isThisWeaponStoryActive ? (
              <Loader2 size={14} className="spin-icon" aria-hidden="true" />
            ) : isStoryPlaying ? (
              <Pause size={14} aria-hidden="true" />
            ) : (
              <Play size={14} aria-hidden="true" />
            )}
            {isStoryPlaying && (
              <span className="eq-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>

          <div className="story-mini-info">
            <div className="story-mini-title-row">
              <span className="story-mini-tag">{displayMeta.shortLabel}</span>
              <span className="story-mini-title" title={miniHeadline}>
                {miniHeadline}
              </span>
            </div>
          </div>

          {localizedStory && localizedStory.acts.length > 0 && (
            <div
              className="story-mini-acts"
              role="group"
              aria-label={
                lang === 'zh'
                  ? '四幕纪录片章节切换'
                  : 'Documentary act selector'
              }
            >
              {localizedStory.acts.map((act, idx) => {
                const isActCurrent =
                  isThisWeaponStoryActive && audio.activeActId === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    className={`story-mini-act-pill ${
                      isActCurrent ? 'active' : ''
                    }`}
                    aria-label={`${act.actNumber} · ${act.title}`}
                    aria-current={isActCurrent ? 'step' : undefined}
                    onClick={() => handleActClick(idx, act.id)}
                    title={`${act.actNumber} · ${act.title}`}
                  >
                    {idx + 1}
                  </button>
                );
              })}
            </div>
          )}

          <button
            type="button"
            className={`story-director-mini-btn ${
              storyDirectorMode ? 'active' : ''
            }`}
            aria-pressed={storyDirectorMode}
            aria-label={ui.directorBtnTitle}
            onClick={toggleStoryDirectorMode}
            title={ui.directorBtnTitle}
          >
            <Clapperboard size={12} aria-hidden="true" />
            <span>{ui.directorBtn}</span>
          </button>

          <button
            type="button"
            className="story-rate-btn"
            aria-label={`${ui.playbackRateTitle}: ${formatPlaybackRateLabel(audio.playbackRate)}`}
            onClick={cycleNarrationPlaybackRate}
            title={ui.playbackRateTitle}
          >
            {formatPlaybackRateLabel(audio.playbackRate)}
          </button>

          <button
            type="button"
            className="story-mini-expand-btn"
            onClick={() => setStoryMinimized(false)}
            title={ui.expandTitle}
          >
            <Maximize2 size={12} aria-hidden="true" />
            <span>{ui.expandBtn}</span>
          </button>

          <button
            type="button"
            className="story-mini-close-btn"
            onClick={handleClose}
            title={ui.closeTitle}
            aria-label={ui.closeTitle}
          >
            <X size={14} aria-hidden="true" />
          </button>
        </div>

        {isThisWeaponStoryActive && activeCue && (
          <div
            className="story-mini-caption-bar"
            role="status"
            aria-live="polite"
            aria-atomic="true"
          >
            {stageBadgeLabel && (
              <span className="story-stage-live-badge">{stageBadgeLabel}</span>
            )}
            <span className="story-mini-caption-text">{activeCue.text}</span>
          </div>
        )}

        {isThisWeaponStoryActive && (
          <div className="story-mini-scrubber">
            <input
              type="range"
              min={0}
              max={1000}
              value={Math.round(audio.progress * 1000)}
              onChange={(e) =>
                handleScrubChange(Number(e.target.value) / 1000)
              }
              aria-label={
                audio.activeLabel
                  ? `${lang === 'zh' ? '纪录片语音进度' : 'Documentary narration seek'}: ${audio.activeLabel}`
                  : lang === 'zh'
                    ? '纪录片语音进度条'
                    : 'Documentary narration seek scrubber'
              }
              aria-valuetext={`${formatAudioTimestamp(audio.currentTime)} / ${formatAudioTimestamp(audio.duration)}`}
              className="story-audio-slider"
              style={
                {
                  '--story-scrub-pct': `${scrubProgressPct.toFixed(1)}%`,
                } as React.CSSProperties
              }
            />
            <span className="story-time-readout">
              {formatAudioTimestamp(audio.currentTime)} /{' '}
              {formatAudioTimestamp(audio.duration)}
            </span>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      ref={drawerRef}
      className="story-drawer"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      tabIndex={-1}
    >
      {/* Persistent polite live region announcing the active documentary subtitle cue */}
      <div
        className="story-sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {isThisWeaponStoryActive && activeCue ? activeCue.text : ''}
      </div>

      {/* Sticky Drawer Header */}
      <div className="story-drawer-header">
        <div className="story-header-meta">
          <div className="story-badge-row">
            <span className="story-ai-badge">
              <Sparkles size={11} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <span className="story-weapon-code">
              {manifest.catalog.bayCode} · {displayMeta.shortLabel}
            </span>
          </div>
          <h2 id={titleId} className="story-weapon-name">
            {displayMeta.name}
          </h2>
          <p className="story-drawer-sub">{drawerSubtitle}</p>
        </div>

        <div className="story-header-controls">
          <LanguageSwitchPill compact />
          <button
            type="button"
            className="story-minimize-btn"
            onClick={() => setStoryMinimized(true)}
            title={minimizeTitle}
          >
            <Minimize2 size={13} aria-hidden="true" />
            <span>{ui.minimizeBtn}</span>
          </button>
          <button
            type="button"
            className="story-close-btn"
            onClick={handleClose}
            title={ui.closeTitle}
            aria-label={ui.closeTitle}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Sticky BBC / Smithsonian Documentary Audio Bar */}
      {localizedStory && playlistTracks.length > 0 && (
        <div className="story-audio-dock">
          <div className="story-audio-top">
            <button
              type="button"
              className={`story-play-all-btn ${isStoryPlaying ? 'playing' : ''}`}
              onClick={handleMainPlayToggle}
            >
              {audio.isLoading && isThisWeaponStoryActive ? (
                <Loader2 size={14} className="spin-icon" aria-hidden="true" />
              ) : isStoryPlaying ? (
                <Pause size={14} aria-hidden="true" />
              ) : (
                <Play size={14} aria-hidden="true" />
              )}
              <span>{isStoryPlaying ? ui.pauseStory : ui.playFullStory}</span>
            </button>

            <div
              className="story-speed-group"
              role="group"
              aria-label={
                lang === 'zh' ? '纪录片播速控制' : 'Documentary playback speed'
              }
            >
              {DOCUMENTARY_PLAYBACK_RATES.map((rate) => {
                const isSelected = Math.abs(audio.playbackRate - rate) < 0.02;
                return (
                  <button
                    key={rate}
                    type="button"
                    className={`story-speed-seg ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    title={ui.playbackRateTitle}
                    onClick={() => setNarrationPlaybackRate(rate)}
                  >
                    {formatPlaybackRateLabel(rate)}
                  </button>
                );
              })}
            </div>
          </div>

          {/* 4-Act Visual Progress Rail (`Act I · II · III · IV`) */}
          <div
            className="story-act-rail"
            role="group"
            aria-label={
              lang === 'zh'
                ? '四幕纪录片章节进度轨'
                : 'Four-act documentary progress rail'
            }
          >
            {localizedStory.acts.map((act, idx) => {
              const isActCurrent =
                isThisWeaponStoryActive && audio.activeActId === act.id;
              const isActDone = activeActIndex > idx;
              const fillPct = isActDone
                ? 100
                : isActCurrent
                  ? scrubProgressPct
                  : 0;
              const roman = ACT_ROMAN_NUMERALS[idx] ?? String(idx + 1);
              return (
                <button
                  key={act.id}
                  type="button"
                  className={`story-act-rail-seg ${isActCurrent ? 'is-active' : ''} ${
                    isActDone ? 'is-done' : ''
                  }`}
                  aria-label={`${act.actNumber} · ${act.title}`}
                  aria-current={isActCurrent ? 'step' : undefined}
                  onClick={() => handleActClick(idx, act.id)}
                  title={`${act.actNumber} · ${act.title}`}
                >
                  <span className="story-act-rail-head">
                    <span className="story-act-rail-roman">Act {roman}</span>
                    {isActCurrent && audio.isPlaying && (
                      <span className="eq-bars" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </span>
                  <span className="story-act-rail-bar" aria-hidden="true">
                    <span
                      className="story-act-rail-fill"
                      style={{ width: `${fillPct.toFixed(1)}%` }}
                    />
                  </span>
                </button>
              );
            })}
          </div>

          {/* Interactive Documentary Timeline Scrubber (`mm:ss / mm:ss`) */}
          <div className="story-scrubber-row">
            <Volume2
              size={12}
              className="story-vol-icon"
              aria-hidden="true"
            />
            <span
              className="story-now-playing"
              title={
                isThisWeaponStoryActive
                  ? (audio.activeLabel ?? '')
                  : localizedStory.acts[0]?.title ?? ''
              }
            >
              {isThisWeaponStoryActive
                ? audio.activeLabel
                : (localizedStory.acts[0]?.actNumber ?? ui.badge)}
            </span>
            <input
              type="range"
              min={0}
              max={1000}
              value={
                isThisWeaponStoryActive ? Math.round(audio.progress * 1000) : 0
              }
              onChange={(e) =>
                handleScrubChange(Number(e.target.value) / 1000)
              }
              aria-label={
                lang === 'zh'
                  ? '纪录片语音进度条'
                  : 'Documentary narration seek scrubber'
              }
              aria-valuetext={`${formatAudioTimestamp(
                isThisWeaponStoryActive ? audio.currentTime : 0
              )} / ${formatAudioTimestamp(
                isThisWeaponStoryActive ? audio.duration : 0
              )}`}
              className="story-audio-slider"
              style={
                {
                  '--story-scrub-pct': `${scrubProgressPct.toFixed(1)}%`,
                } as React.CSSProperties
              }
            />
            <span className="story-time-readout">
              {formatAudioTimestamp(
                isThisWeaponStoryActive ? audio.currentTime : 0
              )}{' '}
              /{' '}
              {formatAudioTimestamp(
                isThisWeaponStoryActive ? audio.duration : 0
              )}
            </span>
          </div>

          <div className="story-director-row">
            <button
              type="button"
              className={`story-director-toggle ${
                storyDirectorMode ? 'active' : ''
              }`}
              aria-pressed={storyDirectorMode}
              onClick={toggleStoryDirectorMode}
              title={ui.directorBtnTitle}
            >
              <Clapperboard size={12} aria-hidden="true" />
              <span>{ui.directorBtn}</span>
            </button>

            {stageBadgeLabel && (
              <span className="story-stage-live-badge">{stageBadgeLabel}</span>
            )}

            <button
              type="button"
              className="story-cinema-bar-btn"
              onClick={() => setStoryMinimized(true)}
              title={ui.cinemaModeTitle}
            >
              <Captions size={12} aria-hidden="true" />
              <span>{ui.cinemaModeBtn}</span>
            </button>

            <button
              type="button"
              className="story-cinema-bar-btn"
              onClick={() => useAppStore.getState().openDirectorReelModal()}
              title={
                lang === 'zh'
                  ? '录制 60fps 3D 机械短片与混音字幕视频'
                  : 'Record 60fps 3D Director Reel Video'
              }
            >
              <Film size={12} aria-hidden="true" />
              <span>{lang === 'zh' ? '录制短片' : 'Reel'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Scrollable Documentary Body */}
      <div className="story-drawer-body">
        {loading ? (
          <div className="story-state-card">
            <Loader2
              size={22}
              className="spin-icon accent"
              aria-hidden="true"
            />
            <h3>{ui.loadingTitle}</h3>
            <p>{ui.loadingDesc}</p>
          </div>
        ) : !localizedStory ? (
          <div className="story-state-card pending">
            <BookOpen size={22} className="accent" aria-hidden="true" />
            <h3>{ui.pendingTitle}</h3>
            <p>{ui.pendingDesc}</p>
            {activeWeaponId !== 'ak15' && (
              <button
                type="button"
                className="story-switch-ak15-btn"
                onClick={handleSwitchToPilotAk15}
              >
                <Sparkles size={14} aria-hidden="true" />
                <span>{ui.switchToAk15Btn}</span>
              </button>
            )}
          </div>
        ) : (
          <>
            {/* Executive Headline & Deck */}
            <section className="story-hero-card">
              <h3 className="story-headline">{localizedStory.headline}</h3>
              <p className="story-deck">{localizedStory.deck}</p>
            </section>

            {/* 4-Act Chronological Documentary */}
            <section className="story-acts-list">
              {localizedStory.acts.map((act, idx) => {
                const isActCurrent =
                  isThisWeaponStoryActive && audio.activeActId === act.id;
                const isActPlaying = isActCurrent && audio.isPlaying;
                const cues = actCuesMap[act.id] ?? [];
                const showCueTranscript =
                  cues.length > 0 &&
                  (isActCurrent || (!isThisWeaponStoryActive && idx === 0));

                return (
                  <article
                    key={act.id}
                    className={`story-act-card ${
                      isActCurrent ? 'active-act' : ''
                    }`}
                  >
                    <div className="story-act-top">
                      <div className="story-act-badges">
                        <span className="act-num-pill">{act.actNumber}</span>
                        <span className="act-era-pill">{act.eraTag}</span>
                      </div>
                      <button
                        type="button"
                        className={`act-audio-btn ${
                          isActPlaying ? 'playing' : ''
                        }`}
                        aria-pressed={isActPlaying}
                        aria-label={`${
                          isActPlaying ? ui.actVoicePlaying : ui.actVoicePlay
                        } — ${act.actNumber} · ${act.title}`}
                        onClick={() => handleActClick(idx, act.id)}
                      >
                        {isActPlaying ? (
                          <Pause size={12} aria-hidden="true" />
                        ) : (
                          <Play size={12} aria-hidden="true" />
                        )}
                        <span>
                          {isActPlaying ? ui.actVoicePlaying : ui.actVoicePlay}
                        </span>
                      </button>
                    </div>

                    <h4 className="story-act-title">{act.title}</h4>

                    {showCueTranscript && (
                      <div className="story-cues-box">
                        <div className="story-cues-head">
                          <Captions size={11} aria-hidden="true" />
                          <span>{ui.liveSubtitlesLabel}</span>
                        </div>
                        <div className="story-cues-list">
                          {cues.map((cue) => {
                            const isCueCurrent =
                              isActCurrent && cue.index === activeCueIndex;
                            const isCuePast =
                              isActCurrent && cue.index < activeCueIndex;
                            return (
                              <button
                                key={cue.index}
                                ref={isCueCurrent ? activeCueBtnRef : undefined}
                                type="button"
                                aria-current={isCueCurrent ? 'true' : undefined}
                                className={`story-cue-line ${
                                  isCueCurrent
                                    ? 'is-active'
                                    : isCuePast
                                      ? 'is-past'
                                      : ''
                                }`}
                                onClick={() =>
                                  handleCueSentenceClick(idx, act.id, cue)
                                }
                              >
                                {cue.text}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    )}

                    <div className="story-act-paragraphs">
                      {act.paragraphs.map((para, pIdx) => (
                        <p key={pIdx}>{para}</p>
                      ))}
                    </div>

                    {act.focusPartId && act.focusPartLabel && (
                      <button
                        type="button"
                        className="story-part-focus-btn"
                        onClick={() => focusStoryPart(act.focusPartId!)}
                      >
                        <Crosshair size={13} aria-hidden="true" />
                        <span>{ui.inspectPartBtn(act.focusPartLabel)}</span>
                      </button>
                    )}
                  </article>
                );
              })}
            </section>

            {/* 3 Key Mechanical Breakthroughs */}
            {localizedStory.breakthroughs.length > 0 && (
              <section className="story-section-block">
                <div className="story-sec-header">
                  <Cpu size={15} className="sec-icon" aria-hidden="true" />
                  <div>
                    <h3>{ui.breakthroughsTitle}</h3>
                    <p>{ui.breakthroughsSub}</p>
                  </div>
                </div>

                <div className="story-bt-grid">
                  {localizedStory.breakthroughs.map((bt) => (
                    <div key={bt.id} className="story-bt-card">
                      <div className="bt-top-row">
                        <span className="bt-tag">{bt.tag}</span>
                      </div>
                      <h4 className="bt-title">{bt.title}</h4>
                      <p className="bt-summary">{bt.summary}</p>
                      <button
                        type="button"
                        className="story-part-focus-btn compact"
                        onClick={() => focusStoryPart(bt.focusPartId)}
                      >
                        <Crosshair size={12} aria-hidden="true" />
                        <span>{ui.inspectPartBtn(bt.focusPartLabel)}</span>
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Chronological R&D Milestones */}
            {localizedStory.milestones.length > 0 && (
              <section className="story-section-block">
                <div className="story-sec-header">
                  <History size={15} className="sec-icon" aria-hidden="true" />
                  <div>
                    <h3>{ui.milestonesTitle}</h3>
                    <p>{ui.milestonesSub}</p>
                  </div>
                </div>

                <div className="story-timeline">
                  {localizedStory.milestones.map((ms, idx) => (
                    <div key={`${ms.year}-${idx}`} className="milestone-row">
                      <div className="milestone-rail">
                        <span className="milestone-dot" />
                        {idx < localizedStory.milestones.length - 1 && (
                          <span className="milestone-line" />
                        )}
                      </div>
                      <div className="milestone-content">
                        <div className="milestone-head">
                          <span className="milestone-year">{ms.year}</span>
                          <span className="milestone-title">{ms.title}</span>
                        </div>
                        <p className="milestone-detail">{ms.detail}</p>
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}

            <footer className="story-footer-note">
              <Sparkles size={11} aria-hidden="true" />
              <span>{ui.aiAttribution}</span>
            </footer>
          </>
        )}
      </div>
    </aside>
  );
};

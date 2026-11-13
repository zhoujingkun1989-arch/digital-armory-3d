import React, { useEffect, useMemo, useRef } from 'react';
import {
  BookOpen,
  Captions,
  Clapperboard,
  Cpu,
  Crosshair,
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
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import {
  cycleNarrationPlaybackRate,
  formatAudioTime,
  type NarrationTrack,
  playNarrationPlaylist,
  seekNarrationAudio,
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

export const WeaponStoryDrawer: React.FC = () => {
  const storyOpen = useAppStore((s) => s.storyOpen);
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

  const activeCueBtnRef = useRef<HTMLButtonElement | null>(null);

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

  if (!storyOpen || screen === 'showcase') {
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
            <div className="story-mini-acts">
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
            onClick={toggleStoryDirectorMode}
            title={ui.directorBtnTitle}
          >
            <Clapperboard size={12} aria-hidden="true" />
            <span>{ui.directorBtn}</span>
          </button>

          <button
            type="button"
            className="story-rate-btn"
            onClick={cycleNarrationPlaybackRate}
            title="1.0x / 1.25x / 1.5x"
          >
            {audio.playbackRate}x
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
          <div className="story-mini-caption-bar" aria-live="polite">
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
                seekNarrationAudio(Number(e.target.value) / 1000)
              }
              aria-label={audio.activeLabel ?? ui.badge}
              className="story-audio-slider"
            />
            <span className="story-time-readout">
              {formatAudioTime(audio.currentTime)} /{' '}
              {formatAudioTime(audio.duration)}
            </span>
          </div>
        )}
      </aside>
    );
  }

  return (
    <aside
      className="story-drawer"
      aria-label={`${displayMeta.name} — ${ui.badge}`}
    >
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
          <h2 className="story-weapon-name">{displayMeta.name}</h2>
          <p className="story-drawer-sub">{ui.drawerSubtitle}</p>
        </div>

        <div className="story-header-controls">
          <LanguageSwitchPill compact />
          <button
            type="button"
            className="story-minimize-btn"
            onClick={() => setStoryMinimized(true)}
            title={ui.minimizeTitle}
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

      {/* Sticky Audio Documentary Bar (when story bundle is loaded) */}
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

            <div className="story-chapter-pills">
              {localizedStory.acts.map((act, idx) => {
                const isActCurrent =
                  isThisWeaponStoryActive && audio.activeActId === act.id;
                return (
                  <button
                    key={act.id}
                    type="button"
                    className={`story-chapter-pill ${
                      isActCurrent ? 'active' : ''
                    }`}
                    onClick={() => handleActClick(idx, act.id)}
                    title={act.title}
                  >
                    <span>{act.actNumber}</span>
                    {isActCurrent && audio.isPlaying && (
                      <span className="eq-bars" aria-hidden="true">
                        <i />
                        <i />
                        <i />
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <button
              type="button"
              className="story-rate-btn"
              onClick={cycleNarrationPlaybackRate}
              title="1.0x / 1.25x / 1.5x"
            >
              {audio.playbackRate}x
            </button>
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
          </div>

          {isThisWeaponStoryActive && (
            <div className="story-scrubber-row">
              <Volume2
                size={12}
                className="story-vol-icon"
                aria-hidden="true"
              />
              <span
                className="story-now-playing"
                title={audio.activeLabel ?? ''}
              >
                {audio.activeLabel}
              </span>
              <input
                type="range"
                min={0}
                max={1000}
                value={Math.round(audio.progress * 1000)}
                onChange={(e) =>
                  seekNarrationAudio(Number(e.target.value) / 1000)
                }
                aria-label={audio.activeLabel ?? ui.badge}
                className="story-audio-slider"
              />
              <span className="story-time-readout">
                {formatAudioTime(audio.currentTime)} /{' '}
                {formatAudioTime(audio.duration)}
              </span>
            </div>
          )}
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

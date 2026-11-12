import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  ChevronLeft,
  ChevronRight,
  Crosshair,
  Focus,
  Loader2,
  Pause,
  Play,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import { useActiveFiringPhase } from '../../engine/clock/playbackClock';
import {
  getCachedPartGeometry,
  subscribeGeometryStatus,
} from '../../engine/geometry/geometryService';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  resolveFiringPhaseText,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import {
  playNarrationPlaylist,
  playOrToggleNarrationTrack,
  stopNarrationAudio,
  useNarrationAudioPlayer,
} from '../../narration/audioPlayer';
import { useWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { useWeaponPlugin } from '../../weapons/registry';
import type { FiringPhaseInfo } from '../../weapons/types';

const EMPTY_FIRING_PHASES: readonly FiringPhaseInfo[] = [];

export const PartInspectorCard: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const autoPlayPartAudio = useAppStore((s) => s.autoPlayPartAudio);
  const toggleAutoPlayPartAudio = useAppStore((s) => s.toggleAutoPlayPartAudio);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const mode = useAppStore((s) => s.mode);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const isolateSelected = useAppStore((s) => s.isolateSelected);
  const selectPart = useAppStore((s) => s.selectPart);
  const toggleIsolateSelected = useAppStore((s) => s.toggleIsolateSelected);
  const activateCutawayFocus = useAppStore((s) => s.activateCutawayFocus);

  const [, setGeoTick] = useState(0);
  useEffect(() => {
    return subscribeGeometryStatus((changedWeaponId) => {
      if (changedWeaponId === activeWeaponId) {
        setGeoTick((n) => n + 1);
      }
    });
  }, [activeWeaponId]);

  const plugin = useWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const audio = useNarrationAudioPlayer();

  const weaponParts = plugin?.parts ?? [];
  const partGroups = plugin?.partGroups ?? [];
  const activePhase = useActiveFiringPhase(
    plugin?.firingPhases ?? EMPTY_FIRING_PHASES
  );

  const currentIdx = selectedPartId
    ? weaponParts.findIndex((p) => p.id === selectedPartId)
    : -1;
  const part = currentIdx >= 0 ? weaponParts[currentIdx] : null;
  const partNarrationEntry = part ? (bundle?.parts[part.id] ?? null) : null;
  const localizedPartNarration = partNarrationEntry
    ? partNarrationEntry[lang]
    : null;

  const autoVoiceSignature =
    part && localizedPartNarration
      ? `${activeWeaponId}:${part.id}:${lang}:${localizedPartNarration.audioUrl}`
      : null;

  const lastAutoPlayedRef = useRef<string | null>(null);

  // Auto-play part voiceover when clicking a new part (or switching language while inspecting a part)
  useEffect(() => {
    if (!autoVoiceSignature) {
      lastAutoPlayedRef.current = null;
      return;
    }
    if (lastAutoPlayedRef.current === autoVoiceSignature) {
      return;
    }
    lastAutoPlayedRef.current = autoVoiceSignature;

    if (!autoPlayPartAudio || !part || !localizedPartNarration) {
      return;
    }
    const titleStr = lang === 'en' ? part.nameEn : part.nameZh;
    playNarrationPlaylist(
      [
        {
          key: `part:${activeWeaponId}:${lang}:${part.id}`,
          relativeUrl: localizedPartNarration.audioUrl,
          label: `${part.bomCode} · ${titleStr}`,
          kind: 'part',
          partId: part.id,
        },
      ],
      0
    );
  }, [
    autoVoiceSignature,
    autoPlayPartAudio,
    activeWeaponId,
    lang,
    part,
    localizedPartNarration,
  ]);

  const ui = UI_STRINGS[lang].inspector;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  if (!selectedPartId) {
    if (mode === 'firing') {
      if (!activePhase) return null;
      const locPhase = resolveFiringPhaseText(activePhase, lang, bundle);
      return (
        <div className="inspector-card firing-compact-card">
          <div className="guide-badge firing-badge">
            {ui.firingBadge(activePhase.stepNum)}
          </div>
          <h3 className="guide-title">{locPhase.title}</h3>
          <p className="guide-desc">{locPhase.description}</p>
        </div>
      );
    }

    return (
      <button
        className="floating-cutaway-pill"
        onClick={activateCutawayFocus}
        title={displayMeta.cutawayTitle}
      >
        <ShieldCheck size={14} />
        <span>{displayMeta.cutawayLabel}</span>
      </button>
    );
  }

  if (!part) return null;

  const groupMeta = partGroups.find((g) => g.key === part.group);
  const badgeColor = groupMeta?.badgeColor ?? '#0284c7';
  const groupTitle =
    lang === 'en'
      ? (groupMeta?.nameEn ?? part.group)
      : (groupMeta?.nameZh ?? part.group);

  const cachedGeo = getCachedPartGeometry(activeWeaponId, part.id);
  let cadEnvelopeLabel = ui.envelopeBuilding;
  let meshTriLabel = ui.meshBuilding;
  if (cachedGeo) {
    if (!cachedGeo.boundingBox) {
      cachedGeo.computeBoundingBox();
    }
    const box = cachedGeo.boundingBox;
    if (box) {
      const dxMm = (box.max.x - box.min.x) * 10;
      const dyMm = (box.max.y - box.min.y) * 10;
      const dzMm = (box.max.z - box.min.z) * 10;
      cadEnvelopeLabel = `${dxMm.toFixed(1)} × ${dyMm.toFixed(1)} × ${dzMm.toFixed(1)} mm`;
    }
    const indexAttr = cachedGeo.getIndex();
    const posAttr = cachedGeo.getAttribute('position');
    const triCount = indexAttr
      ? Math.round(indexAttr.count / 3)
      : posAttr
        ? Math.round(posAttr.count / 3)
        : 0;
    meshTriLabel = ui.meshTriangles(triCount.toLocaleString('en-US'));
  }

  const goPrev = () => {
    const prevIdx = (currentIdx - 1 + weaponParts.length) % weaponParts.length;
    selectPart(weaponParts[prevIdx].id);
  };

  const goNext = () => {
    const nextIdx = (currentIdx + 1) % weaponParts.length;
    selectPart(weaponParts[nextIdx].id);
  };

  const primaryTitle = lang === 'en' ? part.nameEn : part.nameZh;
  const secondaryTitle = lang === 'en' ? part.nameZh : part.nameEn;
  const roleTagDisplay =
    localizedPartNarration?.roleTag ??
    (lang === 'en' ? part.nameEn : part.roleTag);

  const trackKey = `part:${activeWeaponId}:${lang}:${part.id}`;
  const isThisPartActive = audio.activeKey === trackKey;
  const isThisPartPlaying = isThisPartActive && audio.isPlaying;
  const isThisPartLoading = isThisPartActive && audio.isLoading;

  const handleTogglePartVoice = () => {
    if (!localizedPartNarration) return;
    playOrToggleNarrationTrack({
      key: trackKey,
      relativeUrl: localizedPartNarration.audioUrl,
      label: `${part.bomCode} · ${primaryTitle}`,
      kind: 'part',
      partId: part.id,
    });
  };

  const handleCloseInspector = () => {
    if (audio.activeKind === 'part') {
      stopNarrationAudio();
    }
    selectPart(null);
  };

  return (
    <div
      className={`inspector-card ${
        localizedPartNarration ? 'has-deep-narration' : ''
      }`}
    >
      <div className="inspector-top">
        <span
          className="part-group-badge"
          style={{
            borderColor: badgeColor,
            color: badgeColor,
          }}
        >
          {part.bomCode} · {groupTitle}
        </span>
        <button
          className="close-btn"
          onClick={handleCloseInspector}
          title={ui.closeTitle}
        >
          <X size={15} />
        </button>
      </div>

      <h2 className="part-title-zh">{primaryTitle}</h2>
      <div className="part-title-en">{secondaryTitle}</div>

      {/* Google Gemini TTS Part Audio Guide Bar */}
      {localizedPartNarration && (
        <div className="part-voice-bar">
          <button
            type="button"
            className={`part-voice-play-btn ${
              isThisPartPlaying ? 'playing' : ''
            }`}
            onClick={handleTogglePartVoice}
          >
            {isThisPartLoading ? (
              <Loader2 size={13} className="spin-icon" />
            ) : isThisPartPlaying ? (
              <Pause size={13} />
            ) : (
              <Play size={13} />
            )}
            <span>
              {isThisPartLoading
                ? ui.voiceGuideLoading
                : isThisPartPlaying
                  ? ui.voiceGuideBtnPause
                  : ui.voiceGuideBtnPlay}
            </span>
            {isThisPartPlaying && (
              <span className="eq-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>

          <button
            type="button"
            className={`part-auto-voice-btn ${
              autoPlayPartAudio ? 'active' : ''
            }`}
            onClick={toggleAutoPlayPartAudio}
            title={ui.autoVoiceTitle}
          >
            {autoPlayPartAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
            <span>{ui.autoVoiceLabel}</span>
          </button>
        </div>
      )}

      <div
        className={localizedPartNarration ? 'inspector-scroll-area' : undefined}
      >
        <div className="meta-grid">
          <div className="meta-row">
            <span className="meta-label">{ui.roleLabel}</span>
            <span className="meta-value highlight">{roleTagDisplay}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">{ui.materialLabel}</span>
            <span className="meta-value">{ui.materials[part.material]}</span>
          </div>
          <div className="meta-row" title={ui.envelopeTitle}>
            <span className="meta-label">{ui.envelopeLabel}</span>
            <span className="meta-value mono">{cadEnvelopeLabel}</span>
          </div>
          <div className="meta-row" title={ui.meshTitle}>
            <span className="meta-label">{ui.meshLabel}</span>
            <span className="meta-value mono">{meshTriLabel}</span>
          </div>
        </div>

        {localizedPartNarration ? (
          <>
            <div className="part-narration-sections">
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secOverview}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.overview}
                </p>
              </div>
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secCraft}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.craftAndMaterial}
                </p>
              </div>
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secKinematics}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.kinematicRole}
                </p>
              </div>
              <div className="part-narration-sec highlight-sec">
                <span className="part-sec-label">{ui.secDesign}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.designHighlight}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="part-story-jump-link"
              onClick={() => setStoryOpen(true)}
            >
              <BookOpen size={12} />
              <span>{ui.openStoryLink}</span>
            </button>
          </>
        ) : (
          <div className="part-description">{part.description}</div>
        )}
      </div>

      <div className="inspector-actions">
        <button
          className={`isolate-btn ${isolateSelected ? 'active' : ''}`}
          onClick={toggleIsolateSelected}
        >
          <Focus size={14} />
          <span>{isolateSelected ? ui.isolateExit : ui.isolateEnter}</span>
        </button>

        <div className="step-nav">
          <button onClick={goPrev} title={ui.prevPart}>
            <ChevronLeft size={15} />
          </button>
          <span className="step-counter">
            <Crosshair size={12} />
            {currentIdx + 1} / {weaponParts.length}
          </span>
          <button onClick={goNext} title={ui.nextPart}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

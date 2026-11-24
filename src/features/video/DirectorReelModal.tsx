import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Film,
  Layers,
  Square,
  Video,
  Volume2,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import {
  getRecordingAudioStream,
  playWorkbenchFoley,
} from '../../engine/audio/mechanicalSoundEngine';
import { WEAPON_RIFLING_SPECS } from '../../engine/ballistics/riflingSpecs';
import { getGlossaryTermsForWeapon } from '../../engine/encyclopedia/engineeringGlossary';
import { formatExamDuration } from '../../engine/exam/armorerExamStore';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { getNarrationAudioSnapshot } from '../../narration/audioPlayer';
import { useWeaponNarration } from '../../narration/narrationService';
import { useActiveDirectorBeat } from '../../narration/storyDirector';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import {
  buildReelFilename,
  buildReelLowerThirdMeta,
  DirectorReelRecorderSession,
  REEL_PRESET_IDS,
  REEL_PRESETS,
  type DirectorReelPresetId,
} from './directorReelRecorder';
import { DIRECTOR_REEL_STRINGS } from './directorReelStrings';
import '../../styles/director-reel.css';

/**
 * Pure broadcast lower-third metrology ticker pairing an exhibit's authoritative
 * Bore & Rifling (or Compound/Helical Cam) spec from `WEAPON_RIFLING_SPECS` with
 * its flagship mechanical engineering principle from the 28-term encyclopedia.
 * Guaranteed 0 CJK in EN and 0 internal sprint IDs.
 */
export function buildReelBroadcastMetrologyLine(
  weaponId: WeaponId,
  lang: LanguageCode
): string {
  const spec = WEAPON_RIFLING_SPECS[weaponId];
  const isZh = lang === 'zh';
  const topPrinciple = getGlossaryTermsForWeapon(weaponId)[0];
  const principleLabel = topPrinciple
    ? isZh
      ? topPrinciple.termZh
      : topPrinciple.termEn
    : '';

  let boreSegment: string;
  if (spec.kind === 'none') {
    if (weaponId === 'lift33') {
      boreSegment = isZh
        ? '复合弓滑轮 · SwitchWeight-X'
        : 'COMPOUND CAM · SWITCHWEIGHT-X';
    } else if (weaponId === 'r500') {
      boreSegment = isZh
        ? '螺旋凸轮复合弩 · Versa-Drive'
        : 'HELICAL CAM · VERSA-DRIVE';
    } else {
      boreSegment = isZh ? spec.labelZh : spec.labelEn;
    }
  } else if (spec.kind === 'smoothbore') {
    boreSegment = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm 滑膛${spec.chromeLined ? '镀铬' : ''}`
      : `BORE Ø${spec.boreDiameterMm}mm SMOOTHBORE${spec.chromeLined ? ' CHROME' : ''}`;
  } else if (spec.kind === 'polygonal') {
    const dirZh = spec.direction === 'LH' ? '左旋' : '右旋';
    boreSegment = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm · ${spec.grooves}边多边形膛线 1:${spec.twistInches}" ${dirZh}`
      : `BORE Ø${spec.boreDiameterMm}mm · ${spec.grooves}-POLYGONAL 1:${spec.twistInches}" ${spec.direction}`;
  } else {
    const dirZh = spec.direction === 'LH' ? '左旋' : '右旋';
    boreSegment = isZh
      ? `内膛 Ø${spec.boreDiameterMm}mm · ${spec.grooves}条${dirZh}膛线 1:${spec.twistInches}"${spec.chromeLined ? ' 镀铬' : ''}`
      : `BORE Ø${spec.boreDiameterMm}mm · ${spec.grooves}G 1:${spec.twistInches}" ${spec.direction}${spec.chromeLined ? ' CHROME' : ''}`;
  }

  return principleLabel ? `${boreSegment} · ${principleLabel}` : boreSegment;
}

export interface DirectorReelModalProps {
  onClose: () => void;
}

export const DirectorReelModal: React.FC<DirectorReelModalProps> = ({
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const sessionRef = useRef<DirectorReelRecorderSession | null>(null);
  const autoStartedFiringRef = useRef(false);

  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const mode = useAppStore((s) => s.mode);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const setMode = useAppStore((s) => s.setMode);
  const stopFiringPlay = useAppStore((s) => s.stopFiringPlay);
  const activeBeat = useActiveDirectorBeat();
  const { bundle } = useWeaponNarration(activeWeaponId);

  const [presetId, setPresetId] = useState<DirectorReelPresetId>('1080p_16x9');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [showLowerThird, setShowLowerThird] = useState(true);
  const [autoCycleFiring, setAutoCycleFiring] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const ui = DIRECTOR_REEL_STRINGS[lang];
  const manifest = getWeaponManifest(activeWeaponId);
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);
  const activeBeatStageBadge = activeBeat
    ? lang === 'zh'
      ? activeBeat.stageBadgeZh
      : activeBeat.stageBadgeEn
    : null;
  const activeBeatBadgeRef = useRef<string | null>(activeBeatStageBadge);
  useEffect(() => {
    activeBeatBadgeRef.current = activeBeatStageBadge;
  }, [activeBeatStageBadge]);

  const lowerThirdPreview = useMemo(
    () =>
      buildReelLowerThirdMeta(activeWeaponId, lang, {
        displayName: displayMeta.name,
        mode,
        sectionCut,
        xrayShells,
        activeStageBadge: activeBeatStageBadge,
      }),
    [
      activeWeaponId,
      lang,
      displayMeta.name,
      mode,
      sectionCut,
      xrayShells,
      activeBeatStageBadge,
    ]
  );

  const broadcastMetrologyLine = useMemo(
    () => buildReelBroadcastMetrologyLine(activeWeaponId, lang),
    [activeWeaponId, lang]
  );

  const recorderSupported =
    typeof window !== 'undefined' && typeof MediaRecorder !== 'undefined';

  useDialogAccessibility({
    isOpen: true,
    containerRef: dialogRef,
    onClose,
    closeOnEscape: !recording,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (sessionRef.current) {
        void sessionRef.current.stop();
        sessionRef.current = null;
      }
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  const handleStart = async () => {
    const canvas = document.querySelector<HTMLCanvasElement>(
      '.canvas-container canvas'
    );
    if (!canvas) {
      setStatusMessage(ui.unsupportedHint);
      return;
    }
    if (!recorderSupported) {
      setStatusMessage(ui.unsupportedHint);
      return;
    }

    if (autoCycleFiring && mode !== 'firing') {
      autoStartedFiringRef.current = true;
      setMode('firing');
    }

    const session = new DirectorReelRecorderSession();
    sessionRef.current = session;
    setElapsedMs(0);
    setStatusMessage(null);
    playWorkbenchFoley('director_cue');

    const activePreset = REEL_PRESETS[presetId];
    const presetTelemetryLabel =
      lang === 'zh' ? activePreset.labelZh : activePreset.labelEn;

    try {
      await session.start({
        sourceCanvas: canvas,
        presetId,
        includeAudio,
        audioStream: includeAudio ? getRecordingAudioStream() : null,
        lang,
        showLowerThird,
        fillOverlayMetaInto: (out) => {
          const st = useAppStore.getState();
          const curDisplay = resolveWeaponDisplayMeta(
            st.activeWeaponId,
            st.lang,
            bundle
          );
          const lt = buildReelLowerThirdMeta(st.activeWeaponId, st.lang, {
            displayName: curDisplay.name,
            mode: st.mode,
            sectionCut: st.sectionCut,
            xrayShells: st.xrayShells,
            activeStageBadge: activeBeatBadgeRef.current,
          });
          const snap = getNarrationAudioSnapshot();
          const metrologyLine = buildReelBroadcastMetrologyLine(
            st.activeWeaponId,
            st.lang
          );
          out.weaponTitle = lt.weaponTitle;
          out.weaponMetaLine = lt.caliberYearLine;
          out.bayBadge = lt.bayBadge;
          out.phaseTag = lt.phaseTag;
          out.watermarkText = lt.watermarkText;
          out.showLowerThird = showLowerThird;
          out.captionText = snap.activeLabel ?? '';
          out.telemetryLine = `${metrologyLine} · ${presetTelemetryLabel}`;
        },
        onTick: (ms) => {
          setElapsedMs(Math.round(ms));
        },
      });
      setRecording(true);
    } catch {
      setRecording(false);
      sessionRef.current = null;
      setStatusMessage(ui.unsupportedHint);
    }
  };

  const handleStopAndSave = async () => {
    const session = sessionRef.current;
    sessionRef.current = null;
    setRecording(false);
    if (autoStartedFiringRef.current) {
      autoStartedFiringRef.current = false;
      stopFiringPlay();
    }
    if (!session) return;
    const blob = await session.stop();
    if (!blob || blob.size === 0) {
      setStatusMessage(ui.unsupportedHint);
      return;
    }
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = buildReelFilename(
      activeWeaponId,
      presetId,
      session.getMimeType()
    );
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    playWorkbenchFoley('preset_detent');
    setStatusMessage(ui.savedMsg);
  };

  const isVerticalPreset = presetId === '1080p_9x16';

  return (
    <dialog
      ref={dialogRef}
      className="director-reel-dialog"
      data-testid="director-reel-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current && !recording) {
          onClose();
        }
      }}
    >
      <div className="director-reel-shell">
        <header className="director-reel-header">
          <div>
            <span className="director-reel-badge">
              <Clapperboard size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <h2 id={titleId} className="director-reel-title">
              {ui.title}
            </h2>
            <p className="director-reel-sub">{ui.subtitle}</p>
          </div>

          <button
            type="button"
            className="director-reel-close-btn"
            aria-label={ui.close}
            disabled={recording}
            onClick={onClose}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </header>

        <div className="director-reel-body">
          <div className="director-reel-exhibit-pill">
            <Film size={14} aria-hidden="true" />
            <strong>{displayMeta.name}</strong>
            <span>
              {manifest.workbenchMeta.badge} · {manifest.catalog.caliber}
            </span>
          </div>

          {/* Crisp Broadcast Framing & Lower-Third Live Preview */}
          <div className="director-reel-section">
            <div className="director-reel-preview-head">
              <h3>{ui.previewHeading}</h3>
              <span className="director-reel-preview-pill">
                {showLowerThird
                  ? ui.previewBroadcastTag
                  : ui.previewCleanFeedTag}
              </span>
            </div>
            <div className="director-reel-preview-stage">
              <div
                className={`director-reel-preview-frame ${
                  isVerticalPreset ? 'is-vertical' : 'is-widescreen'
                }`}
                data-testid="director-reel-preview"
              >
                <div className="director-reel-safe-guide" aria-hidden="true" />
                {showLowerThird && (
                  <>
                    <div className="director-reel-preview-top">
                      <span>{lowerThirdPreview.watermarkText}</span>
                      <strong className="director-reel-rec-code">
                        REC {recording ? formatExamDuration(elapsedMs) : '00:00'}
                      </strong>
                    </div>
                    <div className="director-reel-lower-third">
                      <div className="director-reel-lt-card">
                        <span className="director-reel-lt-bay">
                          {lowerThirdPreview.bayBadge}
                        </span>
                        <strong className="director-reel-lt-title">
                          {lowerThirdPreview.weaponTitle}
                        </strong>
                        <span className="director-reel-lt-meta">
                          {lowerThirdPreview.caliberYearLine}
                        </span>
                        <span
                          className="director-reel-lt-meta"
                          data-testid="director-reel-metrology-ticker"
                        >
                          {broadcastMetrologyLine}
                        </span>
                      </div>
                      <span className="director-reel-lt-phase">
                        {lowerThirdPreview.phaseTag}
                      </span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>

          <div className="director-reel-section">
            <h3>{ui.presetHeading}</h3>
            <div
              className="director-reel-preset-grid"
              role="group"
              aria-label={ui.presetHeading}
            >
              {REEL_PRESET_IDS.map((pid) => {
                const p = REEL_PRESETS[pid];
                const active = presetId === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    disabled={recording}
                    aria-pressed={active}
                    className={`director-reel-preset-card ${
                      active ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setPresetId(pid);
                    }}
                  >
                    <strong>{lang === 'zh' ? p.labelZh : p.labelEn}</strong>
                    <span className="tabular">
                      {p.width}×{p.height} · {p.fps} fps
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="director-reel-options">
            <label className="director-reel-check">
              <input
                type="checkbox"
                checked={showLowerThird}
                disabled={recording}
                onChange={(e) => setShowLowerThird(e.target.checked)}
              />
              <Layers size={14} aria-hidden="true" />
              <span>{ui.includeLowerThird}</span>
            </label>

            <label className="director-reel-check">
              <input
                type="checkbox"
                checked={includeAudio}
                disabled={recording}
                onChange={(e) => setIncludeAudio(e.target.checked)}
              />
              <Volume2 size={14} aria-hidden="true" />
              <span>{ui.includeAudio}</span>
            </label>

            <label className="director-reel-check">
              <input
                type="checkbox"
                checked={autoCycleFiring}
                disabled={recording}
                onChange={(e) => setAutoCycleFiring(e.target.checked)}
              />
              <Video size={14} aria-hidden="true" />
              <span>{ui.autoCycleFiring}</span>
            </label>
          </div>

          <div
            className={`director-reel-status-bar ${
              recording ? 'is-recording' : ''
            }`}
            role="status"
            aria-live="polite"
          >
            <span>
              {recording
                ? `${ui.recordingBadge} · ${ui.elapsedLabel}: ${formatExamDuration(elapsedMs)}`
                : (statusMessage ??
                  (recorderSupported ? ui.readyHint : ui.unsupportedHint))}
            </span>
          </div>

          <div className="director-reel-footer">
            {recording ? (
              <button
                type="button"
                className="director-reel-action-btn is-stop"
                onClick={() => void handleStopAndSave()}
              >
                <Square size={14} aria-hidden="true" />
                <span>{ui.stopAndSaveBtn}</span>
              </button>
            ) : (
              <button
                type="button"
                className="director-reel-action-btn is-start"
                onClick={() => void handleStart()}
              >
                <Download size={14} aria-hidden="true" />
                <span>{ui.startBtn}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default DirectorReelModal;

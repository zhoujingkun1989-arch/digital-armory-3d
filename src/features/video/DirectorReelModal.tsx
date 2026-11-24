import React, { useEffect, useId, useRef, useState } from 'react';
import {
  Clapperboard,
  Download,
  Film,
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
import { formatExamDuration } from '../../engine/exam/armorerExamStore';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { getNarrationAudioSnapshot } from '../../narration/audioPlayer';
import { useWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  buildReelFilename,
  DirectorReelRecorderSession,
  REEL_PRESET_IDS,
  REEL_PRESETS,
  type DirectorReelPresetId,
} from './directorReelRecorder';
import { DIRECTOR_REEL_STRINGS } from './directorReelStrings';
import '../../styles/director-reel.css';

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
  const setMode = useAppStore((s) => s.setMode);
  const stopFiringPlay = useAppStore((s) => s.stopFiringPlay);
  const telemetry = getNarrationAudioSnapshot();
  const { bundle } = useWeaponNarration(activeWeaponId);

  const [presetId, setPresetId] = useState<DirectorReelPresetId>('1080p_16x9');
  const [includeAudio, setIncludeAudio] = useState(true);
  const [autoCycleFiring, setAutoCycleFiring] = useState(true);
  const [recording, setRecording] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [statusMessage, setStatusMessage] = useState<string | null>(null);

  const ui = DIRECTOR_REEL_STRINGS[lang];
  const manifest = getWeaponManifest(activeWeaponId);
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);
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

    try {
      await session.start({
        sourceCanvas: canvas,
        presetId,
        includeAudio,
        audioStream: includeAudio ? getRecordingAudioStream() : null,
        lang,
        getOverlayMeta: () => {
          const st = useAppStore.getState();
          const curDisplay = resolveWeaponDisplayMeta(
            st.activeWeaponId,
            st.lang,
            bundle
          );
          const curManifest = getWeaponManifest(st.activeWeaponId);
          const curMeta = curManifest.workbenchMeta;
          const snap = getNarrationAudioSnapshot();
          return {
            weaponTitle: curDisplay.name,
            weaponMetaLine: `${curMeta.badge} · ${curManifest.catalog.caliber}`,
            captionText:
              snap.activeLabel ??
              (st.mode === 'firing'
                ? `${curMeta.badge} Live Firing Kinematics`
                : `${curMeta.badge} Cutaway Architecture`),
            telemetryLine: REEL_PRESETS[presetId].labelEn,
          };
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

  void telemetry;

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

          <div className="director-reel-section">
            <h3>{ui.presetHeading}</h3>
            <div className="director-reel-preset-grid">
              {REEL_PRESET_IDS.map((pid) => {
                const p = REEL_PRESETS[pid];
                const active = presetId === pid;
                return (
                  <button
                    key={pid}
                    type="button"
                    disabled={recording}
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

import '../../styles/poster-share.css';

import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import {
  Award,
  Camera,
  Check,
  Copy,
  Download,
  Link2,
  Loader2,
  Palette,
  Ratio,
  Share2,
  Sparkles,
  Stamp,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { playbackClock } from '../../engine/clock/playbackClock';
import { useWeaponGeometries } from '../../engine/geometry/geometryService';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import {
  preloadWeaponNarration,
  useWeaponNarration,
} from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import {
  assemblePosterMetadata,
  captureLiveViewportCanvas,
  POSTER_DIMENSIONS,
  readSavedArmorerRank,
  renderPosterToCanvas,
} from './posterComposer';
import {
  POSTER_SHARE_STRINGS,
  type PosterArmorerRank,
  type PosterAspectRatio,
  type PosterThemeId,
} from './posterShareStrings';

// ============================================================================
// Standalone Modal Controller (Allows zero-friction Wave 2 wiring via store OR
// imperative `openPosterShareModal()` OR controlled `<PosterShareModal open />`)
// ============================================================================

export interface PosterShareLaunchOptions {
  weaponId?: WeaponId;
  armorerRank?: PosterArmorerRank | null;
  capturedDataUrl?: string | null;
}

interface StandalonePosterModalState {
  open: boolean;
  options: PosterShareLaunchOptions | null;
}

let standaloneModalState: StandalonePosterModalState = {
  open: false,
  options: null,
};
const modalListeners = new Set<() => void>();

function emitStandaloneModalChange(): void {
  modalListeners.forEach((fn) => fn());
}

export function openPosterShareModal(options?: PosterShareLaunchOptions): void {
  standaloneModalState = {
    open: true,
    options: options ?? null,
  };
  emitStandaloneModalChange();
}

export function closePosterShareModal(): void {
  if (!standaloneModalState.open) return;
  standaloneModalState = {
    open: false,
    options: null,
  };
  emitStandaloneModalChange();
}

export function usePosterShareModalState(): StandalonePosterModalState {
  return useSyncExternalStore(
    (listener) => {
      modalListeners.add(listener);
      return () => {
        modalListeners.delete(listener);
      };
    },
    () => standaloneModalState,
    () => standaloneModalState
  );
}

export interface PosterShareModalProps {
  open?: boolean;
  onClose?: () => void;
  weaponId?: WeaponId;
  armorerRank?: PosterArmorerRank | null;
  capturedDataUrl?: string | null;
}

const ASPECT_LIST: readonly PosterAspectRatio[] = ['16:9', '4:5'];
const THEME_LIST: readonly PosterThemeId[] = [
  'obsidian_gold',
  'blueprint_white',
  'cyber_cyan',
];
const RANK_LIST: readonly PosterArmorerRank[] = ['S', 'A', 'B', 'C'];

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => {
    if (typeof canvas.toBlob === 'function') {
      canvas.toBlob((blob) => resolve(blob), 'image/png', 1.0);
      return;
    }
    try {
      const dataUrl = canvas.toDataURL('image/png');
      const [, base64] = dataUrl.split(',');
      if (!base64) {
        resolve(null);
        return;
      }
      const bin = atob(base64);
      const bytes = new Uint8Array(bin.length);
      for (let i = 0; i < bin.length; i++) {
        bytes[i] = bin.charCodeAt(i);
      }
      resolve(new Blob([bytes], { type: 'image/png' }));
    } catch {
      resolve(null);
    }
  });
}

export const PosterShareModal: React.FC<PosterShareModalProps> = ({
  open: openProp,
  onClose,
  weaponId: weaponIdProp,
  armorerRank: armorerRankProp,
  capturedDataUrl: capturedDataUrlProp,
}) => {
  const titleId = useId();
  const callsignInputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const posterCanvasRef = useRef<HTMLCanvasElement>(null);

  const standalone = usePosterShareModalState();
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const lang = useAppStore((s) => s.lang);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);

  // Support optional future `useAppStore` flags (`posterModalOpen` / `posterShareOpen`)
  const storeOpenFlag = useAppStore((s) => {
    const rec = s as unknown as Record<string, unknown>;
    if (typeof rec.posterModalOpen === 'boolean') return rec.posterModalOpen;
    if (typeof rec.posterShareOpen === 'boolean') return rec.posterShareOpen;
    if (typeof rec.shareModalOpen === 'boolean') return rec.shareModalOpen;
    return undefined;
  });

  const isOpen =
    openProp !== undefined
      ? openProp
      : storeOpenFlag !== undefined
        ? storeOpenFlag
        : standalone.open
          ? true
          : onClose !== undefined;

  const [weaponOverride, setWeaponOverride] = useState<WeaponId | null>(null);
  const selectedWeaponId: WeaponId =
    weaponOverride ??
    weaponIdProp ??
    standalone.options?.weaponId ??
    activeWeaponId;

  const [aspect, setAspect] = useState<PosterAspectRatio>('16:9');
  const [themeOverride, setThemeOverride] = useState<PosterThemeId | null>(
    null
  );
  const themeId: PosterThemeId =
    themeOverride ??
    (environmentPreset === 'blueprint_daylight'
      ? 'blueprint_white'
      : 'obsidian_gold');
  const [collectorCallsign, setCollectorCallsign] = useState<string>('');
  const [rankOverride, setRankOverride] = useState<
    PosterArmorerRank | 'none' | 'auto'
  >('auto');

  const [viewportImage, setViewportImage] = useState<
    HTMLCanvasElement | HTMLImageElement | null
  >(null);
  const [isCapturing, setIsCapturing] = useState<boolean>(false);
  const [isExporting, setIsExporting] = useState<boolean>(false);
  const [copiedImage, setCopiedImage] = useState<boolean>(false);
  const [copiedLink, setCopiedLink] = useState<boolean>(false);

  const plugin = useWeaponPlugin(selectedWeaponId);
  const geoStatus = useWeaponGeometries(selectedWeaponId, plugin?.parts ?? null);
  const { bundle: narrationBundle } = useWeaponNarration(selectedWeaponId);

  const copy = POSTER_SHARE_STRINGS[lang];
  const dims = POSTER_DIMENSIONS[aspect];

  const canCopyImage =
    typeof navigator !== 'undefined' &&
    Boolean(navigator.clipboard?.write) &&
    typeof ClipboardItem !== 'undefined';
  const canNativeShare =
    typeof navigator !== 'undefined' && typeof navigator.share === 'function';

  const handleClose = useCallback(() => {
    setWeaponOverride(null);
    closePosterShareModal();
    const storeRec = useAppStore.getState() as unknown as Record<
      string,
      unknown
    >;
    if (typeof storeRec.closePosterModal === 'function') {
      (storeRec.closePosterModal as () => void)();
    } else if (typeof storeRec.setPosterModalOpen === 'function') {
      (storeRec.setPosterModalOpen as (v: boolean) => void)(false);
    } else if (typeof storeRec.setPosterShareOpen === 'function') {
      (storeRec.setPosterShareOpen as (v: boolean) => void)(false);
    }
    onClose?.();
  }, [onClose]);

  const resolveCaptureAsync = useCallback((): Promise<
    HTMLCanvasElement | HTMLImageElement | null
  > => {
    const explicitDataUrl =
      capturedDataUrlProp ?? standalone.options?.capturedDataUrl ?? null;
    if (explicitDataUrl && typeof Image !== 'undefined') {
      return new Promise((resolve) => {
        const img = new Image();
        img.onload = () => resolve(img);
        img.onerror = () => resolve(null);
        img.src = explicitDataUrl;
      });
    }
    return captureLiveViewportCanvas();
  }, [capturedDataUrlProp, standalone.options?.capturedDataUrl]);

  const handleManualRecapture = useCallback(async () => {
    setIsCapturing(true);
    const snap = await resolveCaptureAsync();
    setViewportImage(snap);
    setIsCapturing(false);
  }, [resolveCaptureAsync]);

  // Capture live WebGL 2.0 frame asynchronously on open (and after exhibit CSG stream completes)
  const geoReadyKey =
    geoStatus.totalCount > 0 && geoStatus.readyCount >= geoStatus.totalCount
      ? `${selectedWeaponId}:ready`
      : `${selectedWeaponId}:loading`;

  useEffect(() => {
    if (!isOpen) return undefined;
    let cancelled = false;
    const timer = window.setTimeout(() => {
      void resolveCaptureAsync().then((snap) => {
        if (!cancelled) {
          setViewportImage(snap);
          setIsCapturing(false);
        }
      });
    }, 16);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [isOpen, geoReadyKey, resolveCaptureAsync]);

  useDialogAccessibility({
    isOpen,
    containerRef: dialogRef,
    onClose: handleClose,
  });

  // Native <dialog> top-layer management + Safari light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!isOpen || !dialog) return;

    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }

    const onDialogClose = () => {
      dialog.returnValue = '';
      handleClose();
    };
    dialog.addEventListener('close', onDialogClose);

    let cleanupLightDismiss: (() => void) | null = null;
    if (
      typeof HTMLDialogElement !== 'undefined' &&
      !('closedBy' in HTMLDialogElement.prototype)
    ) {
      let pressedOutside = false;
      const isOutside = (e: PointerEvent) => {
        const r = dialog.getBoundingClientRect();
        return (
          e.clientX < r.left ||
          e.clientX > r.right ||
          e.clientY < r.top ||
          e.clientY > r.bottom
        );
      };
      const onDown = (e: PointerEvent) => {
        pressedOutside = isOutside(e);
      };
      const onUp = (e: PointerEvent) => {
        if (pressedOutside && isOutside(e)) {
          dialog.close();
        }
      };
      dialog.addEventListener('pointerdown', onDown);
      dialog.addEventListener('pointerup', onUp);
      cleanupLightDismiss = () => {
        dialog.removeEventListener('pointerdown', onDown);
        dialog.removeEventListener('pointerup', onUp);
      };
    }

    return () => {
      dialog.removeEventListener('close', onDialogClose);
      cleanupLightDismiss?.();
    };
  }, [isOpen, handleClose]);

  const savedRank = useMemo(
    () => readSavedArmorerRank(selectedWeaponId),
    [selectedWeaponId]
  );

  const effectiveArmorerRank: PosterArmorerRank | null =
    rankOverride === 'none'
      ? null
      : rankOverride !== 'auto'
        ? rankOverride
        : (armorerRankProp ?? standalone.options?.armorerRank ?? savedRank);

  const explodeProgress = isOpen
    ? playbackClock.getState().animatedProgress
    : 0;

  const metadata = useMemo(
    () =>
      assemblePosterMetadata({
        weaponId: selectedWeaponId,
        lang,
        activeModes: {
          sectionCut,
          xrayShells,
          engineeringTint,
          explodeProgress,
          firingMode: mode === 'firing',
        },
        armorerRank: effectiveArmorerRank,
        collectorCallsign,
        narrationBundle,
      }),
    [
      selectedWeaponId,
      lang,
      sectionCut,
      xrayShells,
      engineeringTint,
      explodeProgress,
      mode,
      effectiveArmorerRank,
      collectorCallsign,
      narrationBundle,
    ]
  );

  // Render vector-sharp HD Canvas 2D poster whenever configuration or live frame updates
  useEffect(() => {
    if (!isOpen || !posterCanvasRef.current) return;
    renderPosterToCanvas({
      canvas: posterCanvasRef.current,
      aspect,
      themeId,
      lang,
      metadata,
      viewportImage,
    });
  }, [isOpen, aspect, themeId, lang, metadata, viewportImage]);

  const handleDownloadPng = useCallback(async () => {
    const canvas = posterCanvasRef.current;
    if (!canvas) return;
    playWorkbenchFoley('preset_detent');
    setIsExporting(true);
    try {
      const blob = await canvasToPngBlob(canvas);
      const href = blob
        ? URL.createObjectURL(blob)
        : canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = href;
      a.download = metadata.filename;
      document.body.appendChild(a);
      a.click();
      a.remove();
      if (blob) {
        window.setTimeout(() => URL.revokeObjectURL(href), 3000);
      }
    } finally {
      setIsExporting(false);
    }
  }, [metadata.filename]);

  const handleCopyImage = useCallback(async () => {
    const canvas = posterCanvasRef.current;
    if (!canvas || !canCopyImage) return;
    playWorkbenchFoley('toggle_switch');
    const blob = await canvasToPngBlob(canvas);
    if (!blob) return;
    try {
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ]);
      setCopiedImage(true);
      window.setTimeout(() => setCopiedImage(false), 2400);
    } catch {
      // Ignore clipboard permission rejection cleanly
    }
  }, [canCopyImage]);

  const handleCopyDeepLink = useCallback(async () => {
    if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) {
      return;
    }
    playWorkbenchFoley('toggle_switch');
    try {
      await navigator.clipboard.writeText(metadata.deepLinkUrl);
      setCopiedLink(true);
      window.setTimeout(() => setCopiedLink(false), 2200);
    } catch {
      // Ignore clipboard error cleanly
    }
  }, [metadata.deepLinkUrl]);

  const handleNativeShare = useCallback(async () => {
    const canvas = posterCanvasRef.current;
    if (!canvas || !canNativeShare) return;
    playWorkbenchFoley('preset_detent');
    const blob = await canvasToPngBlob(canvas);
    const title = copy.shareTitle(metadata.primaryTitle);
    const text = copy.shareText(metadata.primaryTitle, metadata.bayCode);

    try {
      if (blob && typeof File !== 'undefined') {
        const file = new File([blob], metadata.filename, {
          type: 'image/png',
        });
        if (
          typeof navigator.canShare === 'function' &&
          navigator.canShare({ files: [file] })
        ) {
          await navigator.share({
            title,
            text,
            url: metadata.deepLinkUrl,
            files: [file],
          });
          return;
        }
      }
      await navigator.share({
        title,
        text,
        url: metadata.deepLinkUrl,
      });
    } catch {
      // User canceled OS share sheet (AbortError) — no-op
    }
  }, [
    canNativeShare,
    copy,
    metadata.bayCode,
    metadata.deepLinkUrl,
    metadata.filename,
    metadata.primaryTitle,
  ]);

  if (!isOpen) return null;

  return (
    <dialog
      ref={dialogRef}
      className="poster-share-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      {...({ closedby: 'any' } as Record<string, string>)}
    >
      {/* Top Studio Header */}
      <div className="ps-studio-header">
        <div className="ps-title-block">
          <div className="ps-badge-row">
            <span className="ps-studio-badge">
              <Sparkles size={11} aria-hidden="true" />
              <span>{copy.studioBadge}</span>
            </span>
            <span className="ps-dims-pill">
              {dims.width} × {dims.height} PX · {metadata.bayCode}
            </span>
          </div>
          <h2 id={titleId} className="ps-studio-title">
            {copy.studioTitle}
          </h2>
          <p className="ps-studio-sub">{copy.studioSub}</p>
        </div>

        <div className="ps-header-actions">
          <LanguageSwitchPill compact />

          <button
            type="button"
            className="ps-btn-secondary"
            disabled={isCapturing}
            title={copy.recaptureTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              void handleManualRecapture();
            }}
          >
            {isCapturing ? (
              <Loader2 size={14} className="ps-spin-icon" aria-hidden="true" />
            ) : (
              <Camera size={14} aria-hidden="true" />
            )}
            <span>{copy.recaptureBtn}</span>
          </button>

          {canCopyImage && (
            <button
              type="button"
              className={`ps-btn-secondary ${copiedImage ? 'is-success' : ''}`}
              onClick={() => void handleCopyImage()}
            >
              {copiedImage ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Copy size={14} aria-hidden="true" />
              )}
              <span>
                {copiedImage ? copy.copiedImageBtn : copy.copyImageBtn}
              </span>
            </button>
          )}

          <button
            type="button"
            className={`ps-btn-secondary ${copiedLink ? 'is-success' : ''}`}
            onClick={() => void handleCopyDeepLink()}
          >
            {copiedLink ? (
              <Check size={14} aria-hidden="true" />
            ) : (
              <Link2 size={14} aria-hidden="true" />
            )}
            <span>{copiedLink ? copy.copiedLinkBtn : copy.copyLinkBtn}</span>
          </button>

          {canNativeShare && (
            <button
              type="button"
              className="ps-btn-secondary"
              onClick={() => void handleNativeShare()}
            >
              <Share2 size={14} aria-hidden="true" />
              <span>{copy.nativeShareBtn}</span>
            </button>
          )}

          <button
            type="button"
            className="ps-btn-primary"
            autoFocus
            disabled={isExporting || isCapturing}
            onClick={() => void handleDownloadPng()}
          >
            <Download size={15} aria-hidden="true" />
            <span>
              {isExporting ? copy.downloadingBtn : copy.downloadPngBtn}
            </span>
          </button>

          <form method="dialog" className="ps-close-form">
            <button
              type="submit"
              value="cancel"
              className="ps-close-btn"
              aria-label={copy.closeTitle}
              title={copy.closeTitle}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </form>
        </div>
      </div>

      {/* Studio Split Workspace */}
      <div className="ps-studio-body">
        <aside className="ps-controls-rail">
          {/* Aspect Ratio Presets */}
          <div className="ps-control-group">
            <div className="ps-control-label">
              <Ratio size={13} aria-hidden="true" />
              <span>{copy.aspectLabel}</span>
            </div>
            <div className="ps-aspect-grid" role="group" aria-label={copy.aspectLabel}>
              {ASPECT_LIST.map((ratio) => {
                const opt = copy.aspectOptions[ratio];
                const isSelected = aspect === ratio;
                return (
                  <button
                    key={ratio}
                    type="button"
                    className={`ps-aspect-card ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setAspect(ratio);
                    }}
                  >
                    <span className="ps-aspect-title">{opt.label}</span>
                    <span className="ps-aspect-dims">{opt.dims}</span>
                    <span className="ps-aspect-sub">{opt.sub}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* 3 Curatorial Themes */}
          <div className="ps-control-group">
            <div className="ps-control-label">
              <Palette size={13} aria-hidden="true" />
              <span>{copy.themeLabel}</span>
            </div>
            <div className="ps-theme-stack" role="group" aria-label={copy.themeLabel}>
              {THEME_LIST.map((tid) => {
                const opt = copy.themeOptions[tid];
                const isSelected = themeId === tid;
                return (
                  <button
                    key={tid}
                    type="button"
                    className={`ps-theme-card ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setThemeOverride(tid);
                    }}
                  >
                    <span
                      className={`ps-theme-swatch swatch-${tid}`}
                      aria-hidden="true"
                    />
                    <span className="ps-theme-meta">
                      <span className="ps-theme-name">{opt.label}</span>
                      <span className="ps-theme-tip">{opt.tip}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Optional Armorer Qualification Rank Seal (`S / A / B / C`) */}
          <div className="ps-control-group">
            <div className="ps-control-label">
              <Award size={13} aria-hidden="true" />
              <span>{copy.rankSealLabel}</span>
            </div>
            <div className="ps-rank-row" role="group" aria-label={copy.rankSealLabel}>
              <button
                type="button"
                className={`ps-rank-pill ${
                  effectiveArmorerRank === null ? 'active' : ''
                }`}
                aria-pressed={effectiveArmorerRank === null}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setRankOverride('none');
                }}
              >
                {copy.rankNone}
              </button>
              {RANK_LIST.map((rk) => {
                const isSelected = effectiveArmorerRank === rk;
                return (
                  <button
                    key={rk}
                    type="button"
                    className={`ps-rank-pill ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    title={copy.rankTitles[rk]}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setRankOverride(rk);
                    }}
                  >
                    <span>{rk}</span>
                    {savedRank === rk && <span aria-hidden="true">★</span>}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Custom Collector Callsign Input */}
          <div className="ps-control-group">
            <label htmlFor={callsignInputId} className="ps-control-label">
              <Stamp size={13} aria-hidden="true" />
              <span>{copy.callsignLabel}</span>
            </label>
            <input
              id={callsignInputId}
              type="text"
              maxLength={32}
              value={collectorCallsign}
              onChange={(e) => setCollectorCallsign(e.target.value)}
              placeholder={copy.callsignPlaceholder}
              className="ps-callsign-input"
            />
          </div>

          {/* Exhibit Switcher */}
          <div className="ps-control-group">
            <div className="ps-control-label">
              <Sparkles size={13} aria-hidden="true" />
              <span>{copy.exhibitSelectAria}</span>
            </div>
            <div
              className="ps-exhibit-grid"
              role="group"
              aria-label={copy.exhibitSelectAria}
            >
              {WEAPON_MANIFESTS.map((m) => {
                const isSelected = m.id === selectedWeaponId;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`ps-exhibit-pill ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onMouseEnter={() => {
                      preloadWeaponPlugin(m.id);
                      preloadWeaponNarration(m.id);
                    }}
                    onClick={() => {
                      if (isSelected) return;
                      playWorkbenchFoley('preset_detent');
                      setIsCapturing(true);
                      setWeaponOverride(m.id);
                      if (screen === 'workbench') {
                        enterWorkbench(m.id, mode);
                      } else {
                        selectArmoryWeapon(m.id);
                      }
                    }}
                  >
                    <span className="ps-exhibit-bay">
                      {m.catalog.bayCode.replace('BAY-', '#')}
                    </span>
                    <span>{getLocalizedShortWeaponLabel(m.id, lang)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </aside>

        {/* Live WYSIWYG High-DPI Poster Preview Stage */}
        <div className="ps-preview-stage">
          <div className="ps-canvas-frame">
            <canvas
              ref={posterCanvasRef}
              width={dims.width}
              height={dims.height}
              className="ps-poster-canvas"
            />
          </div>

          <div className="ps-status-bar">
            <span>
              {isCapturing
                ? copy.capturingStatus
                : copy.readyStatus(dims.width, dims.height, aspect)}
            </span>
            <code className="ps-deeplink-code" title={metadata.deepLinkUrl}>
              {metadata.deepLinkUrl}
            </code>
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default PosterShareModal;

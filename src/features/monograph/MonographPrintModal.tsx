import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookMarked,
  BookOpen,
  Camera,
  Columns2,
  Crop,
  FileText,
  Images,
  Layers,
  Loader2,
  Printer,
  RectangleVertical,
  RefreshCw,
  Sparkles,
  Stamp,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { useWeaponGeometries } from '../../engine/geometry/geometryService';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import {
  preloadWeaponNarration,
  useWeaponNarration,
} from '../../narration/narrationService';
import {
  type MonographModalLaunchOptions,
  useAppStore,
} from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import {
  cancelMonographCapture,
  getCachedMonographBundle,
  MONOGRAPH_PLATE_KEYS,
  type MonographCaptureBundle,
  type MonographCaptureQuality,
  type MonographEdition,
  type MonographLayoutMode,
  type MonographPageMode,
  type MonographPlateKey,
  type MonographPlateSource,
  type MonographStyleMode,
  requestMonographCapture,
  useMonographCaptureState,
} from './monographCaptureStore';
import { assembleMonographDossier } from './monographDataAssembler';
import { MonographDkDocument } from './MonographDkDocument';
import { MonographDocument } from './MonographDocument';
import { MonographKidsDocument } from './MonographKidsDocument';

export interface MonographPrintReadySignal {
  ready: boolean;
  weaponId: WeaponId;
  edition: MonographEdition;
  styleMode: MonographStyleMode;
  layoutMode: MonographLayoutMode;
  layout: MonographLayoutMode;
  quality: MonographCaptureQuality;
  prepress: boolean;
  completedPlates: number;
  totalPlates: number;
  plateSources: Partial<Record<MonographPlateKey, MonographPlateSource>>;
  pageCount: number;
}

declare global {
  interface Window {
    __MONOGRAPH_PRINT_READY__?: MonographPrintReadySignal;
  }
}

export interface MonographPrintGeometry {
  effectiveLayout: MonographLayoutMode;
  effectivePrepress: boolean;
  trimWidthMm: number;
  trimHeightMm: number;
  bleedMm: number;
  sheetWidthMm: number;
  sheetHeightMm: number;
  sheetCount: number;
}

export function computeMonographPrintGeometry(
  styleMode: MonographStyleMode,
  layoutMode: MonographLayoutMode,
  pageMode: MonographPageMode,
  prepress: boolean
): MonographPrintGeometry {
  const effectiveLayout: MonographLayoutMode =
    styleMode === 'dk_encyclopedia' ? layoutMode : 'portrait_a4';
  const effectivePrepress = styleMode === 'dk_encyclopedia' && prepress;
  const trimWidthMm = effectiveLayout === 'spread_a3' ? 420 : 210;
  const trimHeightMm = 297;
  const bleedMm = effectivePrepress ? 3 : 0;
  const sheetWidthMm = trimWidthMm + bleedMm * 2;
  const sheetHeightMm = trimHeightMm + bleedMm * 2;
  const singlePages = pageMode === 'full_8p' ? 8 : 4;
  const sheetCount =
    effectiveLayout === 'spread_a3' ? singlePages / 2 : singlePages;

  return {
    effectiveLayout,
    effectivePrepress,
    trimWidthMm,
    trimHeightMm,
    bleedMm,
    sheetWidthMm,
    sheetHeightMm,
    sheetCount,
  };
}

function resolveDefaultEditionForStyle(
  styleMode: MonographStyleMode
): MonographEdition {
  return styleMode === 'dk_encyclopedia'
    ? 'dk_encyclopedia'
    : 'blueprint_manual';
}

function resolveInitialStyle(
  opts: MonographModalLaunchOptions | null
): MonographStyleMode {
  return opts?.styleMode ?? 'dk_encyclopedia';
}

function resolveInitialEdition(
  opts: MonographModalLaunchOptions | null
): MonographEdition {
  if (opts?.edition) return opts.edition;
  return resolveDefaultEditionForStyle(resolveInitialStyle(opts));
}

const MAX_MODAL_EDITION_CACHE = 6;
const modalEditionBundleCache = new Map<string, MonographCaptureBundle>();
const DYNAMIC_PAGE_STYLE_ID = 'monograph-dynamic-page-style';
const CSS_PX_PER_MM = 96 / 25.4;

function buildModalCacheKey(
  weaponId: string,
  edition: MonographEdition,
  quality: MonographCaptureQuality
): string {
  return `${weaponId}:${edition}:${quality}`;
}

function readModalEditionCache(
  weaponId: string,
  edition: MonographEdition,
  quality: MonographCaptureQuality
): MonographCaptureBundle | null {
  const key = buildModalCacheKey(weaponId, edition, quality);
  const hit = modalEditionBundleCache.get(key) ?? null;
  if (hit) {
    modalEditionBundleCache.delete(key);
    modalEditionBundleCache.set(key, hit);
  }
  return hit;
}

function writeModalEditionCache(bundle: MonographCaptureBundle): void {
  const key = buildModalCacheKey(
    bundle.weaponId,
    bundle.edition,
    bundle.quality
  );
  modalEditionBundleCache.delete(key);
  modalEditionBundleCache.set(key, bundle);
  while (modalEditionBundleCache.size > MAX_MODAL_EDITION_CACHE) {
    const oldestKey = modalEditionBundleCache.keys().next().value;
    if (oldestKey !== undefined) {
      modalEditionBundleCache.delete(oldestKey);
    } else {
      break;
    }
  }
}

function evictModalEditionCache(
  weaponId: string,
  edition: MonographEdition,
  quality: MonographCaptureQuality
): void {
  modalEditionBundleCache.delete(buildModalCacheKey(weaponId, edition, quality));
}

function waitWithTimeout<T>(promise: Promise<T>, ms: number): Promise<T | void> {
  return Promise.race([
    promise,
    new Promise<void>((resolve) => {
      window.setTimeout(resolve, ms);
    }),
  ]);
}

export const MonographPrintModal: React.FC = () => {
  const titleId = useId();
  const callsignInputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);
  const printPortalRef = useRef<HTMLDivElement>(null);

  const open = useAppStore((s) => s.monographModalOpen);
  const weaponId = useAppStore((s) => s.monographWeaponId);
  const launchOptions = useAppStore((s) => s.monographLaunchOptions);
  const setWeaponId = useAppStore((s) => s.setMonographWeaponId);
  const closeModal = useAppStore((s) => s.closeMonographModal);
  const lang = useAppStore((s) => s.lang);

  const [styleMode, setStyleMode] = useState<MonographStyleMode>(() =>
    resolveInitialStyle(launchOptions)
  );
  const [edition, setEdition] = useState<MonographEdition>(() =>
    resolveInitialEdition(launchOptions)
  );
  const [layoutMode, setLayoutMode] = useState<MonographLayoutMode>(
    () => launchOptions?.layoutMode ?? 'spread_a3'
  );
  const [pageMode, setPageMode] = useState<MonographPageMode>(
    () => launchOptions?.pageMode ?? 'full_8p'
  );
  const [quality, setQuality] = useState<MonographCaptureQuality>(
    () => launchOptions?.quality ?? 'standard_1440'
  );
  const [prepress, setPrepress] = useState<boolean>(
    () => launchOptions?.prepress ?? false
  );
  const [collectorCallsign, setCollectorCallsign] = useState<string>(
    () => launchOptions?.collectorCallsign ?? ''
  );
  const [prevLaunchOptions, setPrevLaunchOptions] =
    useState<MonographModalLaunchOptions | null>(launchOptions);
  const [previewScale, setPreviewScale] = useState<number>(1);
  const [readySignature, setReadySignature] = useState<string | null>(null);

  // Sync URL deep-link launch options immediately during render when launchOptions changes
  if (open && launchOptions && launchOptions !== prevLaunchOptions) {
    setPrevLaunchOptions(launchOptions);
    const nextStyle = resolveInitialStyle(launchOptions);
    setStyleMode(nextStyle);
    setEdition(resolveInitialEdition(launchOptions));
    if (launchOptions.layoutMode) {
      setLayoutMode(launchOptions.layoutMode);
    }
    if (launchOptions.pageMode) {
      setPageMode(launchOptions.pageMode);
    }
    if (launchOptions.quality) {
      setQuality(launchOptions.quality);
    }
    if (launchOptions.prepress !== undefined) {
      setPrepress(launchOptions.prepress);
    }
    if (launchOptions.collectorCallsign !== undefined) {
      setCollectorCallsign(launchOptions.collectorCallsign);
    }
  } else if (!open && prevLaunchOptions !== null) {
    setPrevLaunchOptions(null);
  }

  const plugin = useWeaponPlugin(weaponId);
  const geoStatus = useWeaponGeometries(weaponId, plugin?.parts ?? null);
  const { bundle: narrationBundle } = useWeaponNarration(weaponId);
  const captureState = useMonographCaptureState();

  const storeBundle = getCachedMonographBundle(weaponId, edition, quality);
  const cachedCapture =
    storeBundle ?? readModalEditionCache(weaponId, edition, quality);
  const isCapturingThis =
    captureState.activeRequest?.weaponId === weaponId &&
    captureState.activeRequest?.edition === edition &&
    captureState.activeRequest?.quality === quality;

  const ui = UI_STRINGS[lang].monograph;
  const shortTag = getLocalizedShortWeaponLabel(weaponId, lang);

  const printGeometry = useMemo(
    () => computeMonographPrintGeometry(styleMode, layoutMode, pageMode, prepress),
    [styleMode, layoutMode, pageMode, prepress]
  );

  const cyclesMasterCount = useMemo(() => {
    if (!cachedCapture?.plateSources) return 0;
    return Object.values(cachedCapture.plateSources).filter(
      (src) => src === 'cycles_4k'
    ).length;
  }, [cachedCapture]);

  useEffect(() => {
    if (storeBundle) {
      writeModalEditionCache(storeBundle);
    }
  }, [storeBundle]);

  // Trigger offscreen 17-plate capture only when (weaponId, edition, quality) lacks a cached bundle.
  useEffect(() => {
    if (!open) return;
    const hit =
      getCachedMonographBundle(weaponId, edition, quality) ??
      readModalEditionCache(weaponId, edition, quality);
    if (hit) {
      cancelMonographCapture();
      return;
    }
    requestMonographCapture(weaponId, edition, false, quality);
  }, [open, weaponId, edition, quality]);

  // Inject exact scoped `@page` size + `--monograph-print-width` while modal is open so both
  // browser `window.print()` and Chromium CDP `preferCSSPageSize: true` get exact A3/A4 + bleed geometry.
  useEffect(() => {
    if (!open || typeof document === 'undefined') return;
    let styleEl = document.getElementById(
      DYNAMIC_PAGE_STYLE_ID
    ) as HTMLStyleElement | null;
    if (!styleEl) {
      styleEl = document.createElement('style');
      styleEl.id = DYNAMIC_PAGE_STYLE_ID;
      document.head.appendChild(styleEl);
    }
    styleEl.textContent = `@page { size: ${printGeometry.sheetWidthMm}mm ${printGeometry.sheetHeightMm}mm; margin: 0; }\n:root { --monograph-print-width: ${printGeometry.sheetWidthMm}mm; --monograph-print-height: ${printGeometry.sheetHeightMm}mm; }`;

    return () => {
      const existing = document.getElementById(DYNAMIC_PAGE_STYLE_ID);
      if (existing) {
        existing.remove();
      }
    };
  }, [open, printGeometry.sheetWidthMm, printGeometry.sheetHeightMm]);

  // Dynamically scale wide 420mm/426mm DK A3 spreads to fit the interactive modal viewport cleanly
  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const container = previewScrollRef.current;
    if (!container) return;

    const recalc = () => {
      const availableW = Math.max(320, container.clientWidth - 44);
      const targetSheetPx = printGeometry.sheetWidthMm * CSS_PX_PER_MM;
      const nextScale = Math.min(1, Math.max(0.32, availableW / targetSheetPx));
      setPreviewScale(Number(nextScale.toFixed(4)));
    };

    recalc();
    if (typeof ResizeObserver === 'function') {
      const ro = new ResizeObserver(recalc);
      ro.observe(container);
      return () => ro.disconnect();
    }
    window.addEventListener('resize', recalc);
    return () => window.removeEventListener('resize', recalc);
  }, [open, printGeometry.sheetWidthMm]);

  // Open native <dialog> in modal top-layer + Safari closedby="any" light-dismiss fallback
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!open || !dialog) return;

    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }

    const handleClose = () => {
      dialog.returnValue = '';
      cancelMonographCapture();
      closeModal();
    };
    dialog.addEventListener('close', handleClose);

    let cleanupLightDismiss: (() => void) | null = null;
    if (!('closedBy' in HTMLDialogElement.prototype)) {
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
      dialog.removeEventListener('close', handleClose);
      cleanupLightDismiss?.();
    };
  }, [open, closeModal]);

  const dossier = useMemo(() => {
    if (!plugin) return null;
    return assembleMonographDossier(weaponId, plugin, lang, narrationBundle);
    // Re-evaluate as CSG parts stream in so live millimeter envelopes populate accurately
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weaponId, plugin, lang, narrationBundle, geoStatus.version]);

  const readyToPrint = Boolean(dossier && cachedCapture && !isCapturingThis);
  const currentReadySignature =
    open && readyToPrint && cachedCapture
      ? [
          weaponId,
          edition,
          styleMode,
          printGeometry.effectiveLayout,
          pageMode,
          quality,
          printGeometry.effectivePrepress ? '1' : '0',
          lang,
          collectorCallsign,
          cachedCapture.cacheKey,
          cachedCapture.capturedAtIso,
        ].join('|')
      : null;
  const portalReady = Boolean(
    currentReadySignature && readySignature === currentReadySignature
  );

  // Automated Pre-Press PDF Readiness Handshake:
  // Wait for dossier + capture + font faces + every <img> decoded inside `.monograph-print-portal`,
  // then set `data-monograph-ready="true"` AND `window.__MONOGRAPH_PRINT_READY__`.
  useEffect(() => {
    if (typeof window === 'undefined') return;

    if (!open) {
      window.__MONOGRAPH_PRINT_READY__ = undefined;
      return;
    }

    const pendingSignal: MonographPrintReadySignal = {
      ready: false,
      weaponId,
      edition,
      styleMode,
      layoutMode: printGeometry.effectiveLayout,
      layout: printGeometry.effectiveLayout,
      quality,
      prepress: printGeometry.effectivePrepress,
      completedPlates: isCapturingThis
        ? captureState.completedPlates
        : cachedCapture
          ? MONOGRAPH_PLATE_KEYS.length
          : 0,
      totalPlates: MONOGRAPH_PLATE_KEYS.length,
      plateSources: cachedCapture?.plateSources
        ? { ...cachedCapture.plateSources }
        : {},
      pageCount: printGeometry.sheetCount,
    };
    window.__MONOGRAPH_PRINT_READY__ = pendingSignal;

    if (!readyToPrint || !cachedCapture || !currentReadySignature) {
      return;
    }

    let cancelled = false;

    void (async () => {
      if (document.fonts?.ready) {
        await waitWithTimeout(document.fonts.ready.catch(() => undefined), 5000);
      }
      if (cancelled) return;

      const portal = printPortalRef.current;
      const imgs = portal ? Array.from(portal.querySelectorAll('img')) : [];

      await Promise.allSettled(
        imgs.map(async (img) => {
          const src = img.getAttribute('src');
          if (!src) return;
          if (!img.complete) {
            await waitWithTimeout(
              new Promise<void>((resolve) => {
                const done = () => resolve();
                img.addEventListener('load', done, { once: true });
                img.addEventListener('error', done, { once: true });
              }),
              10000
            );
          }
          if (typeof img.decode === 'function') {
            await waitWithTimeout(img.decode().catch(() => undefined), 6000);
          }
        })
      );
      if (cancelled) return;

      // Ensure DOM paint & SVG vector layout commit across two animation frames
      await new Promise<void>((resolve) => {
        requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
      });
      if (cancelled) return;

      const allDecoded = imgs.every((img) => {
        if (!img.getAttribute('src')) return true;
        return img.complete && img.naturalWidth > 0;
      });
      if (!allDecoded && imgs.length > 0) {
        return;
      }

      setReadySignature(currentReadySignature);
      window.__MONOGRAPH_PRINT_READY__ = {
        ready: true,
        weaponId,
        edition,
        styleMode,
        layoutMode: printGeometry.effectiveLayout,
        layout: printGeometry.effectiveLayout,
        quality,
        prepress: printGeometry.effectivePrepress,
        completedPlates: MONOGRAPH_PLATE_KEYS.length,
        totalPlates: MONOGRAPH_PLATE_KEYS.length,
        plateSources: { ...cachedCapture.plateSources },
        pageCount: printGeometry.sheetCount,
      };
    })();

    return () => {
      cancelled = true;
    };
  }, [
    open,
    readyToPrint,
    currentReadySignature,
    weaponId,
    edition,
    styleMode,
    printGeometry.effectiveLayout,
    printGeometry.effectivePrepress,
    printGeometry.sheetCount,
    quality,
    cachedCapture,
    isCapturingThis,
    captureState.completedPlates,
  ]);

  // Ensure global readiness flag cleans up on unmount
  useEffect(() => {
    return () => {
      if (typeof window !== 'undefined') {
        window.__MONOGRAPH_PRINT_READY__ = undefined;
      }
    };
  }, []);

  const handleSelectStyle = useCallback(
    (nextStyle: MonographStyleMode) => {
      playWorkbenchFoley('toggle_switch');
      setStyleMode(nextStyle);
      if (nextStyle === 'dk_encyclopedia') {
        setEdition('dk_encyclopedia');
      } else if (edition === 'dk_encyclopedia') {
        setEdition('blueprint_manual');
      }
    },
    [edition]
  );

  const handleTriggerPrint = useCallback(() => {
    if (typeof window === 'undefined') return;
    playWorkbenchFoley('preset_detent');
    const prevTitle = document.title;
    const safeTag = shortTag.replace(/\s+/g, '-');
    const styleSlug =
      styleMode === 'dk_encyclopedia'
        ? printGeometry.effectiveLayout === 'spread_a3'
          ? 'DK-Encyclopedia-A3-Spread'
          : 'DK-Encyclopedia-A4'
        : styleMode === 'kids_pictorial'
          ? 'Kids-3D-Picture-Book'
          : 'Pro-Monograph';
    const editionSlug =
      edition === 'dk_encyclopedia'
        ? 'DK-White'
        : edition === 'blueprint_manual'
          ? 'Bright'
          : 'Dark';
    document.title = `Digital-Armory-3D-${safeTag}-${styleSlug}-${editionSlug}`;

    const restoreTitle = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 1500);
  }, [shortTag, styleMode, edition, printGeometry.effectiveLayout]);

  // Listen for `armory:monograph-print` CustomEvent and Ctrl/Cmd+P while open so printing uses curated filename
  useEffect(() => {
    if (!open) return;

    const onMonographPrintEvent = () => {
      if (readyToPrint) {
        handleTriggerPrint();
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (
        (e.metaKey || e.ctrlKey) &&
        !e.altKey &&
        !e.shiftKey &&
        e.key.toLowerCase() === 'p'
      ) {
        if (e.defaultPrevented) return;
        e.preventDefault();
        if (readyToPrint) {
          handleTriggerPrint();
        }
      }
    };

    window.addEventListener('armory:monograph-print', onMonographPrintEvent);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener(
        'armory:monograph-print',
        onMonographPrintEvent
      );
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [open, readyToPrint, handleTriggerPrint]);

  if (!open) return null;

  const isDkMode = styleMode === 'dk_encyclopedia';
  const isSpreadMode = isDkMode && layoutMode === 'spread_a3';
  const jumpCount = printGeometry.sheetCount;

  const scrollToPreviewSheet = (sheetIdx: number) => {
    const root = previewScrollRef.current;
    if (!root) return;
    const selector = isSpreadMode
      ? `.dk-spread-sheet[data-spread="${sheetIdx}"]`
      : `.dk-page-sheet[data-page="${sheetIdx}"], .monograph-page[data-page="${sheetIdx}"]`;
    const target = root.querySelector<HTMLElement>(selector);
    if (target) {
      const prefersReduced =
        typeof window !== 'undefined' &&
        Boolean(window.matchMedia?.('(prefers-reduced-motion: reduce)').matches);
      target.scrollIntoView({
        behavior: prefersReduced ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  const renderActiveDocument = () => {
    if (!dossier) return null;
    if (styleMode === 'dk_encyclopedia') {
      return (
        <MonographDkDocument
          dossier={dossier}
          captureBundle={cachedCapture}
          edition={edition}
          layoutMode={layoutMode}
          pageMode={pageMode}
          collectorCallsign={collectorCallsign}
          prepress={prepress}
        />
      );
    }
    if (styleMode === 'kids_pictorial') {
      return (
        <MonographKidsDocument
          dossier={dossier}
          captureBundle={cachedCapture}
          edition={edition}
          pageMode={pageMode}
          collectorCallsign={collectorCallsign}
        />
      );
    }
    return (
      <MonographDocument
        dossier={dossier}
        captureBundle={cachedCapture}
        edition={edition}
        pageMode={pageMode}
        collectorCallsign={collectorCallsign}
      />
    );
  };

  return (
    <>
      <dialog
        ref={dialogRef}
        className="monograph-dialog"
        aria-labelledby={titleId}
        {...({ closedby: 'any' } as Record<string, string>)}
      >
        {/* Top Pre-Press Studio Control Header */}
        <div className="monograph-studio-header">
          <div className="ms-title-block">
            <div className="ms-badge-row">
              <span className="ms-studio-badge">
                <Sparkles size={11} aria-hidden="true" />
                <span>{ui.studioBadge}</span>
              </span>
              <span className="ms-serial-pill">
                {dossier?.serialCode ?? weaponId.toUpperCase()}
              </span>
              {cyclesMasterCount > 0 && (
                <span className="ms-cycles-badge">
                  <Sparkles size={10} aria-hidden="true" />
                  <span>
                    {ui.cyclesBadge(
                      cyclesMasterCount,
                      MONOGRAPH_PLATE_KEYS.length
                    )}
                  </span>
                </span>
              )}
            </div>
            <h2 id={titleId} className="ms-studio-title">
              {ui.studioTitle}
            </h2>
            <p className="ms-studio-sub">{ui.studioSub}</p>
          </div>

          <div className="ms-header-right">
            <LanguageSwitchPill compact />

            <button
              type="button"
              className="ms-reshoot-btn"
              disabled={isCapturingThis}
              title={ui.reshootTitle}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                evictModalEditionCache(weaponId, edition, quality);
                requestMonographCapture(weaponId, edition, true, quality);
              }}
            >
              <RefreshCw
                size={13}
                className={isCapturingThis ? 'spin-icon' : ''}
                aria-hidden="true"
              />
              <span>{ui.reshootBtn}</span>
            </button>

            <button
              type="button"
              className="ms-print-primary-btn"
              autoFocus
              disabled={!readyToPrint}
              onClick={handleTriggerPrint}
            >
              {isCapturingThis ? (
                <>
                  <Loader2 size={15} className="spin-icon" aria-hidden="true" />
                  <span>
                    {ui.printCapturingCta(
                      captureState.completedPlates,
                      captureState.totalPlates
                    )}
                  </span>
                </>
              ) : (
                <>
                  <Printer size={15} aria-hidden="true" />
                  <span>{ui.printCta}</span>
                </>
              )}
            </button>

            <form method="dialog" className="ms-close-form">
              <button
                type="submit"
                value="cancel"
                className="ms-close-btn"
                aria-label={ui.closeTitle}
                title={ui.closeTitle}
              >
                <X size={16} aria-hidden="true" />
              </button>
            </form>
          </div>
        </div>

        {/* Second Toolbar Row: 19-Exhibit Selector + DK/Pro/Kids Style + Edition + Layout + Quality + Bleed + Callsign */}
        <div className="monograph-studio-controls">
          <div
            className="ms-weapon-strip"
            role="group"
            aria-label={ui.weaponSelectAria}
          >
            {WEAPON_MANIFESTS.map((m) => {
              const isSelected = m.id === weaponId;
              return (
                <button
                  key={m.id}
                  type="button"
                  className={`ms-weapon-pill ${isSelected ? 'active' : ''}`}
                  aria-pressed={isSelected}
                  onMouseEnter={() => {
                    preloadWeaponPlugin(m.id);
                    preloadWeaponNarration(m.id);
                  }}
                  onClick={() => {
                    if (!isSelected) {
                      playWorkbenchFoley('preset_detent');
                      setWeaponId(m.id);
                    }
                  }}
                >
                  <span className="ms-wp-bay">
                    {m.catalog.bayCode.replace('BAY-', '#')}
                  </span>
                  <span>{getLocalizedShortWeaponLabel(m.id, lang)}</span>
                </button>
              );
            })}
          </div>

          <div className="ms-options-cluster">
            {/* Style Mode Switcher: DK Visual Encyclopedia | Pro Dossier | Kids Picture Book */}
            <div className="ms-seg-group" role="group" aria-label="Book Style">
              <button
                type="button"
                className={`ms-seg-btn ${
                  styleMode === 'dk_encyclopedia' ? 'active-dk' : ''
                }`}
                aria-pressed={styleMode === 'dk_encyclopedia'}
                title={ui.styleDkTip}
                onClick={() => handleSelectStyle('dk_encyclopedia')}
              >
                <BookMarked size={12} aria-hidden="true" />
                <span>{ui.styleDk}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  styleMode === 'pro_dossier' ? 'active' : ''
                }`}
                aria-pressed={styleMode === 'pro_dossier'}
                title={ui.styleProTip}
                onClick={() => handleSelectStyle('pro_dossier')}
              >
                <BookOpen size={12} aria-hidden="true" />
                <span>{ui.stylePro}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  styleMode === 'kids_pictorial' ? 'active-kids' : ''
                }`}
                aria-pressed={styleMode === 'kids_pictorial'}
                title={ui.styleKidsTip}
                onClick={() => handleSelectStyle('kids_pictorial')}
              >
                <Images size={12} aria-hidden="true" />
                <span>{ui.styleKids}</span>
              </button>
            </div>

            {/* Edition Palette Switcher: DK Pure White | Blueprint Bright | Obsidian Dark */}
            <div className="ms-seg-group" role="group" aria-label="Edition">
              <button
                type="button"
                className={`ms-seg-btn ${
                  edition === 'dk_encyclopedia' ? 'active-dk-white' : ''
                }`}
                aria-pressed={edition === 'dk_encyclopedia'}
                title={ui.editionDkTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setEdition('dk_encyclopedia');
                }}
              >
                <Layers size={12} aria-hidden="true" />
                <span>{ui.editionDk}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  edition === 'blueprint_manual' ? 'active-blueprint' : ''
                }`}
                aria-pressed={edition === 'blueprint_manual'}
                title={ui.editionBlueprintTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setEdition('blueprint_manual');
                }}
              >
                <FileText size={12} aria-hidden="true" />
                <span>{ui.editionBlueprint}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  edition === 'obsidian_folio' ? 'active-gold' : ''
                }`}
                aria-pressed={edition === 'obsidian_folio'}
                title={ui.editionObsidianTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setEdition('obsidian_folio');
                }}
              >
                <Sparkles size={12} aria-hidden="true" />
                <span>{ui.editionObsidian}</span>
              </button>
            </div>

            {/* Layout Geometry Switcher (DK Encyclopedia: A3 Spread vs A4 Portrait) */}
            {isDkMode && (
              <div className="ms-seg-group" role="group" aria-label="Layout">
                <button
                  type="button"
                  className={`ms-seg-btn ${
                    layoutMode === 'spread_a3' ? 'active-dk' : ''
                  }`}
                  aria-pressed={layoutMode === 'spread_a3'}
                  title={ui.layoutSpreadA3Tip}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setLayoutMode('spread_a3');
                  }}
                >
                  <Columns2 size={12} aria-hidden="true" />
                  <span>{ui.layoutSpreadA3}</span>
                </button>
                <button
                  type="button"
                  className={`ms-seg-btn ${
                    layoutMode === 'portrait_a4' ? 'active-dk' : ''
                  }`}
                  aria-pressed={layoutMode === 'portrait_a4'}
                  title={ui.layoutPortraitA4Tip}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setLayoutMode('portrait_a4');
                  }}
                >
                  <RectangleVertical size={12} aria-hidden="true" />
                  <span>{ui.layoutPortraitA4}</span>
                </button>
              </div>
            )}

            {/* Page Density Switcher */}
            <div className="ms-seg-group" role="group" aria-label="Pages">
              <button
                type="button"
                className={`ms-seg-btn ${pageMode === 'full_8p' ? 'active' : ''}`}
                aria-pressed={pageMode === 'full_8p'}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setPageMode('full_8p');
                }}
              >
                <span>{isSpreadMode ? ui.mode4Spreads : ui.mode8p}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  pageMode === 'compact_4p' ? 'active' : ''
                }`}
                aria-pressed={pageMode === 'compact_4p'}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setPageMode('compact_4p');
                }}
              >
                <span>{isSpreadMode ? ui.mode2Spreads : ui.mode4p}</span>
              </button>
            </div>

            {/* Capture Resolution Quality Switcher */}
            <div className="ms-seg-group" role="group" aria-label="Quality">
              <button
                type="button"
                className={`ms-seg-btn ${
                  quality === 'standard_1440' ? 'active' : ''
                }`}
                aria-pressed={quality === 'standard_1440'}
                title={ui.qualityStandardTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setQuality('standard_1440');
                }}
              >
                <span>{ui.qualityStandard}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  quality === 'print_2880' ? 'active-print-dpi' : ''
                }`}
                aria-pressed={quality === 'print_2880'}
                title={ui.qualityPrintTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setQuality('print_2880');
                }}
              >
                <span>{ui.qualityPrint}</span>
              </button>
            </div>

            {/* ISO 12647 3mm Pre-Press Bleed & Crop Marks Toggle (DK mode) */}
            {isDkMode && (
              <button
                type="button"
                className={`ms-prepress-toggle ${prepress ? 'active' : ''}`}
                aria-pressed={prepress}
                title={ui.prepressToggleTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setPrepress((prev) => !prev);
                }}
              >
                <Crop size={12} aria-hidden="true" />
                <span>{ui.prepressToggle}</span>
              </button>
            )}

            {/* Personalized Collector Callsign Stamp Input */}
            <div className="ms-callsign-field">
              <label htmlFor={callsignInputId} className="ms-callsign-label">
                <Stamp size={12} aria-hidden="true" />
                <span>{ui.callsignLabel}</span>
              </label>
              <input
                id={callsignInputId}
                type="text"
                maxLength={32}
                value={collectorCallsign}
                onChange={(e) => setCollectorCallsign(e.target.value)}
                placeholder={ui.callsignPlaceholder}
                className="ms-callsign-input"
              />
            </div>
          </div>
        </div>

        {/* Live Offscreen Darkroom Capture Banner (shown during 17-plate offscreen render) */}
        {isCapturingThis && (
          <div className="ms-capture-progress-bar">
            <div className="ms-cp-left">
              <Camera size={14} className="ms-cp-icon" aria-hidden="true" />
              <div>
                <strong>
                  {ui.capturingTitle(
                    shortTag,
                    captureState.completedPlates,
                    captureState.totalPlates
                  )}
                </strong>
                <span>{ui.capturingSub}</span>
              </div>
            </div>
            <progress
              className="ms-cp-progress"
              max={captureState.totalPlates}
              value={captureState.completedPlates}
            />
          </div>
        )}

        {/* Scrollable WYSIWYG Preview Stage */}
        <div ref={previewScrollRef} className="monograph-preview-stage">
          {/* Quick Spread / Page Jump Rail */}
          <div className="ms-page-jump-rail">
            {Array.from({ length: jumpCount }, (_, i) => i + 1).map((idx) => (
              <button
                key={idx}
                type="button"
                className="ms-page-jump-pill"
                onClick={() => scrollToPreviewSheet(idx)}
              >
                {isSpreadMode ? `S${idx} (P${idx * 2 - 1}-${idx * 2})` : `P${idx}`}
              </button>
            ))}
            <span className="ms-print-tip-inline">
              {isSpreadMode ? ui.printHintDkSpread : ui.printHint}
            </span>
          </div>

          <div
            className="monograph-preview-sheets"
            style={
              {
                '--dk-preview-scale': String(previewScale),
              } as React.CSSProperties
            }
          >
            {dossier ? (
              renderActiveDocument()
            ) : (
              <div className="ms-loading-dossier">
                <Loader2 size={22} className="spin-icon" aria-hidden="true" />
                <span>
                  {ui.capturingTitle(
                    shortTag,
                    captureState.completedPlates,
                    captureState.totalPlates
                  )}
                </span>
              </div>
            )}
          </div>
        </div>
      </dialog>

      {/* Dedicated Static Print-Flow Portal: hidden on screen, expands cleanly across press sheets in @media print */}
      {dossier && (
        <div
          ref={printPortalRef}
          className="monograph-print-portal"
          data-monograph-ready={portalReady ? 'true' : 'false'}
          data-layout={printGeometry.effectiveLayout}
          data-prepress={printGeometry.effectivePrepress ? '1' : '0'}
          aria-hidden="true"
        >
          {renderActiveDocument()}
        </div>
      )}
    </>
  );
};

export default MonographPrintModal;

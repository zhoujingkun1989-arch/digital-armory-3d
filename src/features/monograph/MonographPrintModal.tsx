import React, {
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  BookOpen,
  Camera,
  FileText,
  Images,
  Loader2,
  Printer,
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
import { useAppStore } from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { assembleMonographDossier } from './monographDataAssembler';
import {
  cancelMonographCapture,
  getCachedMonographBundle,
  type MonographEdition,
  type MonographPageMode,
  type MonographStyleMode,
  requestMonographCapture,
  useMonographCaptureState,
} from './monographCaptureStore';
import { MonographDocument } from './MonographDocument';
import { MonographKidsDocument } from './MonographKidsDocument';

export const MonographPrintModal: React.FC = () => {
  const titleId = useId();
  const callsignInputId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previewScrollRef = useRef<HTMLDivElement>(null);

  const open = useAppStore((s) => s.monographModalOpen);
  const weaponId = useAppStore((s) => s.monographWeaponId);
  const setWeaponId = useAppStore((s) => s.setMonographWeaponId);
  const closeModal = useAppStore((s) => s.closeMonographModal);
  const lang = useAppStore((s) => s.lang);

  const [styleMode, setStyleMode] =
    useState<MonographStyleMode>('kids_pictorial');
  const [edition, setEdition] = useState<MonographEdition>('blueprint_manual');
  const [pageMode, setPageMode] = useState<MonographPageMode>('full_8p');
  const [collectorCallsign, setCollectorCallsign] = useState<string>('');

  const plugin = useWeaponPlugin(weaponId);
  const geoStatus = useWeaponGeometries(weaponId, plugin?.parts ?? null);
  const { bundle: narrationBundle } = useWeaponNarration(weaponId);
  const captureState = useMonographCaptureState();

  const cachedCapture = getCachedMonographBundle(weaponId, edition);
  const isCapturingThis =
    captureState.activeRequest?.weaponId === weaponId &&
    captureState.activeRequest?.edition === edition;

  const ui = UI_STRINGS[lang].monograph;
  const shortTag = getLocalizedShortWeaponLabel(weaponId, lang);

  // Trigger offscreen 17-plate WebGL capture whenever (weaponId, edition) lacks a cached bundle
  useEffect(() => {
    if (!open) return;
    if (!getCachedMonographBundle(weaponId, edition)) {
      requestMonographCapture(weaponId, edition, false);
    }
  }, [open, weaponId, edition]);

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

  const handleTriggerPrint = useCallback(() => {
    if (typeof window === 'undefined') return;
    playWorkbenchFoley('preset_detent');
    const prevTitle = document.title;
    const safeTag = shortTag.replace(/\s+/g, '-');
    const styleSlug =
      styleMode === 'kids_pictorial' ? 'Kids-3D-Picture-Book' : 'Pro-Monograph';
    const editionSlug = edition === 'blueprint_manual' ? 'Bright' : 'Dark';
    document.title = `Digital-Armory-3D-${safeTag}-${styleSlug}-${editionSlug}`;

    const restoreTitle = () => {
      document.title = prevTitle;
      window.removeEventListener('afterprint', restoreTitle);
    };
    window.addEventListener('afterprint', restoreTitle);
    window.print();
    window.setTimeout(restoreTitle, 1500);
  }, [shortTag, styleMode, edition]);

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

  const totalPages = pageMode === 'full_8p' ? 8 : 4;

  const scrollToPreviewPage = (pageNum: number) => {
    const root = previewScrollRef.current;
    if (!root) return;
    const target = root.querySelector<HTMLElement>(
      `.monograph-page[data-page="${pageNum}"]`
    );
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
                requestMonographCapture(weaponId, edition, true);
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

        {/* Second Toolbar Row: 13-Exhibit Selector + Edition Theme + Page Count + Collector Stamp */}
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
            {/* Audience Style Switcher: Kids Multi-Picture Book vs Pro Technical Dossier */}
            <div className="ms-seg-group" role="group" aria-label="Book Style">
              <button
                type="button"
                className={`ms-seg-btn ${
                  styleMode === 'kids_pictorial' ? 'active-kids' : ''
                }`}
                aria-pressed={styleMode === 'kids_pictorial'}
                title={ui.styleKidsTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setStyleMode('kids_pictorial');
                }}
              >
                <Images size={12} aria-hidden="true" />
                <span>{ui.styleKids}</span>
              </button>
              <button
                type="button"
                className={`ms-seg-btn ${
                  styleMode === 'pro_dossier' ? 'active' : ''
                }`}
                aria-pressed={styleMode === 'pro_dossier'}
                title={ui.styleProTip}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setStyleMode('pro_dossier');
                }}
              >
                <BookOpen size={12} aria-hidden="true" />
                <span>{ui.stylePro}</span>
              </button>
            </div>

            {/* Edition Theme Switcher */}
            <div className="ms-seg-group" role="group" aria-label="Edition">
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

            {/* 8-Page vs 4-Page Switcher */}
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
                <span>{ui.mode8p}</span>
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
                <span>{ui.mode4p}</span>
              </button>
            </div>

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

        {/* Scrollable A4 Folio WYSIWYG Preview Stage */}
        <div ref={previewScrollRef} className="monograph-preview-stage">
          {/* Quick Page Jump Rail */}
          <div className="ms-page-jump-rail">
            {Array.from({ length: totalPages }, (_, i) => i + 1).map((pNum) => (
              <button
                key={pNum}
                type="button"
                className="ms-page-jump-pill"
                onClick={() => scrollToPreviewPage(pNum)}
              >
                P{pNum}
              </button>
            ))}
            <span className="ms-print-tip-inline">{ui.printHint}</span>
          </div>

          <div className="monograph-preview-sheets">
            {dossier ? (
              styleMode === 'kids_pictorial' ? (
                <MonographKidsDocument
                  dossier={dossier}
                  captureBundle={cachedCapture}
                  edition={edition}
                  pageMode={pageMode}
                  collectorCallsign={collectorCallsign}
                />
              ) : (
                <MonographDocument
                  dossier={dossier}
                  captureBundle={cachedCapture}
                  edition={edition}
                  pageMode={pageMode}
                  collectorCallsign={collectorCallsign}
                />
              )
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

      {/* Dedicated Static Print-Flow Portal: hidden on screen, expands cleanly across 4/8 A4 pages in @media print */}
      {dossier && (
        <div className="monograph-print-portal" aria-hidden="true">
          {styleMode === 'kids_pictorial' ? (
            <MonographKidsDocument
              dossier={dossier}
              captureBundle={cachedCapture}
              edition={edition}
              pageMode={pageMode}
              collectorCallsign={collectorCallsign}
            />
          ) : (
            <MonographDocument
              dossier={dossier}
              captureBundle={cachedCapture}
              edition={edition}
              pageMode={pageMode}
              collectorCallsign={collectorCallsign}
            />
          )}
        </div>
      )}
    </>
  );
};

export default MonographPrintModal;

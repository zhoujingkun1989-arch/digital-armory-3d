import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  CheckCircle2,
  Flame,
  GitBranch,
  GitCompareArrows,
  Hexagon,
  Play,
  Ruler,
  Scale,
  Scissors,
  Sparkles,
  X,
  Zap,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { WEAPON_RIFLING_SPECS } from '../../engine/ballistics/riflingSpecs';
import { UI_STRINGS } from '../../i18n/uiStrings';
import type { LanguageCode } from '../../narration/types';
import { preloadWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { ARMORY_WEAPONS } from '../../weapons/manifests';
import { preloadWeaponPlugin } from '../../weapons/registry';
import { isWeaponId } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { SPLIT_SHOWDOWN_STRINGS } from '../showdown3d/splitShowdownStrings';
import {
  buildShowdownDualSvgGeometry,
  buildShowdownRadarGeometry,
  computeShowdownPeakLabelLayout,
  computeWeaponRadarMetrics,
  findMatchingRivalryPreset,
  getActiveShowdownWeaponIds,
  getClassicRivalryPresets,
  getLocalizedAxisMeta,
  getShowdownExhibitProfile,
  getSuggestedRivalWeaponId,
  getTaxonomyFamiliesForAxis,
  interpolateShowdownCurveAt,
  MECHANISM_TAXONOMY_AXES,
  resolveFreePairSelection,
  resolveFreePairSwap,
  SHOWDOWN_RADAR_AXES,
  type ShowdownChartScaleMode,
  type ShowdownExhibitProfile,
  type ShowdownRadarAxisId,
  type TaxonomyAxisId,
} from './mechanismShowdownSpecs';
import { WeaponSilhouetteSvg } from './WeaponSilhouetteSvg';
import '../../styles/showdown.css';

export type ShowdownViewMode = 'matrix' | 'showdown';

export interface MechanismShowdownModalProps {
  initialMode?: ShowdownViewMode;
  initialWeaponA?: string;
  initialWeaponB?: string;
  /** Optional language override for deterministic SSR/unit verification */
  langOverride?: LanguageCode;
  onClose: () => void;
}

type AxisFilterOption = 'all' | TaxonomyAxisId;

function formatEnergyJ(energyJ: number): string {
  if (energyJ >= 1_000_000) {
    return `${(energyJ / 1_000_000).toFixed(2)} MJ`;
  }
  if (energyJ >= 1000) {
    return `${Math.round(energyJ).toLocaleString('en-US')} J`;
  }
  return `${energyJ.toFixed(energyJ < 200 ? 1 : 0)} J`;
}

function formatMassKg(weightKg: number): string {
  if (weightKg >= 1000) {
    return `${(weightKg / 1000).toFixed(1)} t`;
  }
  return `${weightKg} kg`;
}

function computeVisualBarWidths(
  valA: number,
  valB: number,
  useSqrtCompression = false
): [number, number] {
  const safeA = Math.max(0, valA);
  const safeB = Math.max(0, valB);
  const maxRaw = Math.max(1e-6, safeA, safeB);
  if (useSqrtCompression && maxRaw / Math.max(1, Math.min(safeA, safeB)) > 6) {
    const rootMax = Math.sqrt(maxRaw);
    return [
      Math.max(6, (Math.sqrt(safeA) / rootMax) * 100),
      Math.max(6, (Math.sqrt(safeB) / rootMax) * 100),
    ];
  }
  return [
    safeA > 0 ? Math.max(5, (safeA / maxRaw) * 100) : 0,
    safeB > 0 ? Math.max(5, (safeB / maxRaw) * 100) : 0,
  ];
}

export const MechanismShowdownModal: React.FC<MechanismShowdownModalProps> = ({
  initialMode = 'matrix',
  initialWeaponA,
  initialWeaponB,
  langOverride,
  onClose,
}) => {
  const titleId = useId();
  const gradAId = useId();
  const gradBId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);

  const storeLang = useAppStore((s) => s.lang);
  const lang = langOverride ?? storeLang;
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const openSplitShowdown = useAppStore((s) => s.openSplitShowdown);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const setEngineeringTint = useAppStore((s) => s.setEngineeringTint);
  const triggerCameraPreset = useAppStore((s) => s.triggerCameraPreset);

  const activeIds = useMemo(() => getActiveShowdownWeaponIds(), []);

  const defaultA =
    initialWeaponA && activeIds.includes(initialWeaponA)
      ? initialWeaponA
      : activeWeaponId;
  const defaultB =
    initialWeaponB &&
    activeIds.includes(initialWeaponB) &&
    initialWeaponB !== defaultA
      ? initialWeaponB
      : getSuggestedRivalWeaponId(defaultA, activeIds);

  const [viewMode, setViewMode] = useState<ShowdownViewMode>(initialMode);
  const [axisFilter, setAxisFilter] = useState<AxisFilterOption>('all');
  const [weaponAId, setWeaponAId] = useState<string>(defaultA);
  const [weaponBId, setWeaponBId] = useState<string>(defaultB);
  const [nextStageSlot, setNextStageSlot] = useState<'A' | 'B'>('A');
  const [scaleMode, setScaleMode] =
    useState<ShowdownChartScaleMode>('normalized');
  const [hoverProgress, setHoverProgress] = useState<number | null>(null);
  const [focusedRadarAxis, setFocusedRadarAxis] =
    useState<ShowdownRadarAxisId>('energy');

  const ui = UI_STRINGS[lang].mechanismShowdown;

  // Open native <dialog> in modal top-layer + capture-phase keyboard guard
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    if (!dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }

    const handleDialogClose = () => {
      dialog.returnValue = '';
      onClose();
    };
    dialog.addEventListener('close', handleDialogClose);

    // Light-dismiss click outside dialog bounds
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
    const onPointerDown = (e: PointerEvent) => {
      pressedOutside = isOutside(e);
    };
    const onPointerUp = (e: PointerEvent) => {
      if (pressedOutside && isOutside(e)) {
        onClose();
      }
    };
    dialog.addEventListener('pointerdown', onPointerDown);
    dialog.addEventListener('pointerup', onPointerUp);

    const onKeyDownCapture = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      const target = e.target;
      const isFormField =
        target instanceof HTMLElement &&
        (target.tagName === 'SELECT' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA');
      if (!isFormField && e.key.toLowerCase() === 's') {
        e.preventDefault();
        e.stopImmediatePropagation();
        onClose();
        return;
      }
      // Prevent global single-key Armory shortcuts from mutating background 3D stage while modal is open
      if (!isFormField && e.key.length === 1) {
        e.stopImmediatePropagation();
      }
    };
    window.addEventListener('keydown', onKeyDownCapture, true);

    return () => {
      dialog.removeEventListener('close', handleDialogClose);
      dialog.removeEventListener('pointerdown', onPointerDown);
      dialog.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('keydown', onKeyDownCapture, true);
    };
  }, [onClose]);

  const profileA = useMemo(
    () => getShowdownExhibitProfile(weaponAId, lang),
    [weaponAId, lang]
  );
  const profileB = useMemo(
    () => getShowdownExhibitProfile(weaponBId, lang),
    [weaponBId, lang]
  );

  const allProfiles = useMemo(
    () => activeIds.map((id) => getShowdownExhibitProfile(id, lang)),
    [activeIds, lang]
  );
  const profileMap = useMemo(() => {
    const map = new Map<string, ShowdownExhibitProfile>();
    for (const p of allProfiles) map.set(p.id, p);
    return map;
  }, [allProfiles]);

  const rivalryPresets = useMemo(
    () => getClassicRivalryPresets(lang, activeIds),
    [lang, activeIds]
  );

  const activeRivalry = useMemo(
    () => findMatchingRivalryPreset(weaponAId, weaponBId, lang, activeIds),
    [weaponAId, weaponBId, lang, activeIds]
  );

  const chartGeo = useMemo(
    () => buildShowdownDualSvgGeometry(weaponAId, weaponBId, scaleMode, 96),
    [weaponAId, weaponBId, scaleMode]
  );

  const radarA = useMemo(
    () => computeWeaponRadarMetrics(weaponAId),
    [weaponAId]
  );
  const radarB = useMemo(
    () => computeWeaponRadarMetrics(weaponBId),
    [weaponBId]
  );
  const radarGeo = useMemo(
    () => buildShowdownRadarGeometry(radarA, radarB),
    [radarA, radarB]
  );

  const riflingA = isWeaponId(weaponAId)
    ? WEAPON_RIFLING_SPECS[weaponAId]
    : null;
  const riflingB = isWeaponId(weaponBId)
    ? WEAPON_RIFLING_SPECS[weaponBId]
    : null;

  const visibleAxes = useMemo(
    () =>
      axisFilter === 'all'
        ? MECHANISM_TAXONOMY_AXES
        : MECHANISM_TAXONOMY_AXES.filter((a) => a.id === axisFilter),
    [axisFilter]
  );

  const handleSwapPair = () => {
    playWorkbenchFoley('toggle_switch');
    const [nextA, nextB] = resolveFreePairSwap(weaponAId, weaponBId);
    setWeaponAId(nextA);
    setWeaponBId(nextB);
  };

  const handleSelectWeaponA = (nextId: string) => {
    playWorkbenchFoley('preset_detent');
    const [nextA, nextB] = resolveFreePairSelection(
      'A',
      nextId,
      weaponAId,
      weaponBId
    );
    setWeaponAId(nextA);
    setWeaponBId(nextB);
  };

  const handleSelectWeaponB = (nextId: string) => {
    playWorkbenchFoley('preset_detent');
    const [nextA, nextB] = resolveFreePairSelection(
      'B',
      nextId,
      weaponAId,
      weaponBId
    );
    setWeaponAId(nextA);
    setWeaponBId(nextB);
  };

  const handleStageFromMatrixChip = (clickedId: string) => {
    playWorkbenchFoley('part_select');
    if (clickedId === weaponAId || clickedId === weaponBId) {
      return;
    }
    if (nextStageSlot === 'A') {
      setWeaponAId(clickedId);
      setNextStageSlot('B');
    } else {
      setWeaponBId(clickedId);
      setNextStageSlot('A');
    }
  };

  const handleQuickCompareFromChip = (clickedId: string) => {
    playWorkbenchFoley('preset_detent');
    if (clickedId === weaponAId) {
      const rival = getSuggestedRivalWeaponId(clickedId, activeIds);
      setWeaponBId(rival);
    } else {
      setWeaponBId(clickedId);
    }
    setViewMode('showdown');
  };

  const handleDeepLinkCutaway = (targetId: string) => {
    playWorkbenchFoley('preset_detent');
    const resolvedId = isWeaponId(targetId) ? targetId : activeWeaponId;
    if (isWeaponId(resolvedId)) {
      preloadWeaponPlugin(resolvedId);
      preloadWeaponNarration(resolvedId);
    }
    onClose();
    enterWorkbench(resolvedId, 'explode');
    setSectionCut(true);
    setEngineeringTint(true);
    triggerCameraPreset('cutaway_focus');
  };

  const handleDeepLinkLiveCycle = (targetId: string) => {
    playWorkbenchFoley('preset_detent');
    const resolvedId = isWeaponId(targetId) ? targetId : activeWeaponId;
    onClose();
    enterWorkbench(resolvedId, 'firing');
    setSectionCut(true);
  };

  const handleLaunchSplit3d = (pairA: string, pairB: string) => {
    playWorkbenchFoley('preset_detent');
    if (isWeaponId(pairA)) {
      preloadWeaponPlugin(pairA);
      preloadWeaponNarration(pairA);
    }
    if (isWeaponId(pairB)) {
      preloadWeaponPlugin(pairB);
      preloadWeaponNarration(pairB);
    }
    onClose();
    openSplitShowdown(pairA, pairB);
    setSectionCut(true);
  };

  const split3dCtaLabel =
    lang === 'zh'
      ? '启动双屏 3D 剖视对决'
      : 'Launch Linked 3D Split Cutaway';
  const split3dQuickTitle = (label: string) =>
    lang === 'zh'
      ? `直接启动「${label}」双屏 3D 实心剖视对决`
      : `Launch linked 3D split cutaway for ${label}`;

  const handleSvgPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * chartGeo.width;
    const clamped =
      (svgX - chartGeo.plotLeft) /
      Math.max(1, chartGeo.plotRight - chartGeo.plotLeft);
    setHoverProgress(Math.max(0, Math.min(1, clamped)));
  };

  const scrubSampleA =
    hoverProgress !== null
      ? interpolateShowdownCurveAt(chartGeo.traceA.points, hoverProgress)
      : null;
  const scrubSampleB =
    hoverProgress !== null
      ? interpolateShowdownCurveAt(chartGeo.traceB.points, hoverProgress)
      : null;

  const peakLayout = useMemo(
    () => computeShowdownPeakLabelLayout(chartGeo),
    [chartGeo]
  );

  // Quantitative bar widths
  const [velBarA, velBarB] = computeVisualBarWidths(
    profileA.muzzleVelocityMps,
    profileB.muzzleVelocityMps
  );
  const [engBarA, engBarB] = computeVisualBarWidths(
    profileA.muzzleEnergyJ,
    profileB.muzzleEnergyJ,
    true
  );
  const [loadBarA, loadBarB] = computeVisualBarWidths(
    profileA.peakLoadValue,
    profileB.peakLoadValue
  );
  const [oalBarA, oalBarB] = computeVisualBarWidths(
    profileA.overallLengthMm,
    profileB.overallLengthMm
  );
  const [massBarA, massBarB] = computeVisualBarWidths(
    profileA.emptyWeightKg,
    profileB.emptyWeightKg
  );
  const [rpmBarA, rpmBarB] = computeVisualBarWidths(
    profileA.cyclicRateRpm ?? 180,
    profileB.cyclicRateRpm ?? 180
  );

  const sharedDrive = profileA.driveFamily === profileB.driveFamily;
  const sharedLocking = profileA.lockingFamily === profileB.lockingFamily;
  const sharedFeed = profileA.feedFamily === profileB.feedFamily;
  const diffAxisCount =
    (sharedDrive ? 0 : 1) + (sharedLocking ? 0 : 1) + (sharedFeed ? 0 : 1);

  const renderExhibitHeroCard = (
    profile: ShowdownExhibitProfile,
    slot: 'A' | 'B'
  ) => {
    const isSlotA = slot === 'A';
    return (
      <article
        className={`sd-hero-card ${isSlotA ? 'is-slot-a' : 'is-slot-b'}`}
        onMouseEnter={() => {
          if (isWeaponId(profile.id)) {
            preloadWeaponPlugin(profile.id);
            preloadWeaponNarration(profile.id);
          }
        }}
      >
        <div className="sd-hero-top">
          <div className="sd-hero-badges">
            <span className={`sd-slot-pill ${isSlotA ? 'slot-a' : 'slot-b'}`}>
              {isSlotA ? ui.slotALabel : ui.slotBLabel}
            </span>
            <span className="sd-bay-code">{profile.bayCode}</span>
            <span className="sd-origin-pill">{profile.originTag}</span>
          </div>
          <span className="sd-caliber-tag">{profile.compactCaliber}</span>
        </div>

        <div className="sd-hero-Identity">
          <div>
            <h3 className="sd-hero-name">{profile.fullName}</h3>
            <div className="sd-hero-model">{profile.modelCode}</div>
          </div>
        </div>

        <div className="sd-hero-silhouette-stage">
          <WeaponSilhouetteSvg id={profile.id} available={profile.available} />
        </div>

        {/* 3-Axis Lineage Comparison Badges (Shared vs Divergent Traits) */}
        <div className="sd-lineage-badges">
          <div
            className={`sd-lineage-chip ${sharedDrive ? 'is-shared' : 'is-diff'}`}
          >
            <span className="sd-lc-axis">{ui.axisShortDrive}</span>
            <span className="sd-lc-title">{profile.driveFamilyTitle}</span>
            <span className="sd-lc-state">
              {sharedDrive ? ui.sharedTraitBadge : ui.diffTraitBadge}
            </span>
          </div>

          <div
            className={`sd-lineage-chip ${
              sharedLocking ? 'is-shared' : 'is-diff'
            }`}
          >
            <span className="sd-lc-axis">{ui.axisShortLocking}</span>
            <span className="sd-lc-title">{profile.lockingFamilyTitle}</span>
            <span className="sd-lc-state">
              {sharedLocking ? ui.sharedTraitBadge : ui.diffTraitBadge}
            </span>
          </div>

          <div
            className={`sd-lineage-chip ${sharedFeed ? 'is-shared' : 'is-diff'}`}
          >
            <span className="sd-lc-axis">{ui.axisShortFeed}</span>
            <span className="sd-lc-title">{profile.feedFamilyTitle}</span>
            <span className="sd-lc-state">
              {sharedFeed ? ui.sharedTraitBadge : ui.diffTraitBadge}
            </span>
          </div>
        </div>

        {/* Direct Deep-Link Workbench Triggers */}
        <div className="sd-hero-actions">
          <button
            type="button"
            className={`sd-deep-cutaway-btn ${isSlotA ? 'slot-a' : 'slot-b'}`}
            onClick={() => handleDeepLinkCutaway(profile.id)}
            title={ui.cutawayBenchTitle}
          >
            <Scissors size={13} aria-hidden="true" />
            <span>{ui.cutawayBenchBtn(profile.shortLabel)}</span>
          </button>

          <button
            type="button"
            className="sd-deep-cycle-btn"
            onClick={() => handleDeepLinkLiveCycle(profile.id)}
            title={ui.liveCycleBenchTitle}
          >
            <Play size={12} aria-hidden="true" />
            <span>{ui.liveCycleBenchBtn}</span>
          </button>
        </div>
      </article>
    );
  };

  return (
    <dialog
      ref={dialogRef}
      className="showdown-dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      {/* Top Studio Header */}
      <header className="showdown-header">
        <div className="sd-title-block">
          <div className="sd-badge-row">
            <span className="sd-kicker-badge">
              <GitCompareArrows size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <span className="sd-count-pill">
              {ui.exhibitCountPill(
                ARMORY_WEAPONS.length,
                MECHANISM_TAXONOMY_AXES.length
              )}
            </span>
          </div>
          <h2 id={titleId} className="sd-main-title">
            {ui.title}
          </h2>
          <p className="sd-main-sub">{ui.subtitle}</p>
        </div>

        <div className="sd-header-controls">
          <div
            className="sd-mode-tabs"
            role="tablist"
            aria-label={ui.dialogAria}
          >
            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'matrix'}
              className={`sd-mode-tab ${viewMode === 'matrix' ? 'active' : ''}`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setViewMode('matrix');
              }}
            >
              <GitBranch size={13} aria-hidden="true" />
              <span>{ui.modeMatrix}</span>
            </button>

            <button
              type="button"
              role="tab"
              aria-selected={viewMode === 'showdown'}
              className={`sd-mode-tab ${
                viewMode === 'showdown' ? 'active' : ''
              }`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setViewMode('showdown');
              }}
            >
              <Scale size={13} aria-hidden="true" />
              <span>{ui.modeShowdown}</span>
              <span className="sd-pair-mini-pill">
                {profileA.shortLabel} vs {profileB.shortLabel}
              </span>
            </button>
          </div>

            <button
              type="button"
              className="sd-mode-tab sd-split3d-cta"
              data-testid="sd-header-split3d-cta"
              title={SPLIT_SHOWDOWN_STRINGS[lang].matrixLaunchTitle}
              onClick={() => handleLaunchSplit3d(weaponAId, weaponBId)}
            >
              <GitCompareArrows size={13} aria-hidden="true" />
              <span>{split3dCtaLabel}</span>
            </button>

          <LanguageSwitchPill compact />

          <button
            type="button"
            className="sd-close-btn"
            onClick={onClose}
            aria-label={ui.closeTitle}
            title={ui.closeTitle}
          >
            <X size={16} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Main Scrollable Stage */}
      <div className="showdown-scroll-body">
        {/* Universal Free-Pair 34 × 33 Custom Duel Builder (Always Accessible Across Matrix & Showdown) */}
        <section
          className="sd-staging-bar sd-custom-duel-bar"
          data-testid="sd-custom-duel-bar"
          aria-label={
            lang === 'zh'
              ? '34 × 33 全馆自由配对对决构建器'
              : 'Free-Pair 34 x 33 Custom Duel Builder'
          }
        >
          <div className="sd-custom-duel-pickers">
            <span className="sd-custom-duel-badge">
              {lang === 'zh'
                ? `${allProfiles.length}×${Math.max(1, allProfiles.length - 1)} 自由对决`
                : `${allProfiles.length}×${Math.max(1, allProfiles.length - 1)} Custom Duel`}
            </span>

            <div className="sd-select-group is-a">
              <span className="sd-slot-pill slot-a">{ui.slotALabel}</span>
              <select
                aria-label={ui.selectWeaponAAria}
                data-testid="sd-custom-select-a"
                className="sd-weapon-select"
                value={weaponAId}
                onChange={(e) => handleSelectWeaponA(e.target.value)}
              >
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.bayCode} · {p.shortLabel} ({p.compactCaliber})
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              className="sd-swap-icon-btn"
              data-testid="sd-custom-swap-btn"
              onClick={handleSwapPair}
              title={ui.swapPairTitle}
              aria-label={ui.swapPairTitle}
            >
              <ArrowLeftRight size={14} aria-hidden="true" />
            </button>

            <div className="sd-select-group is-b">
              <span className="sd-slot-pill slot-b">{ui.slotBLabel}</span>
              <select
                aria-label={ui.selectWeaponBAria}
                data-testid="sd-custom-select-b"
                className="sd-weapon-select"
                value={weaponBId}
                onChange={(e) => handleSelectWeaponB(e.target.value)}
              >
                {allProfiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.bayCode} · {p.shortLabel} ({p.compactCaliber})
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="sd-staging-right">
            <div className="sd-staging-actions">
              {viewMode === 'matrix' && (
                <button
                  type="button"
                  className="sd-launch-showdown-btn"
                  data-testid="sd-custom-compare-btn"
                  onClick={() => {
                    playWorkbenchFoley('preset_detent');
                    setViewMode('showdown');
                  }}
                >
                  <Scale size={14} aria-hidden="true" />
                  <span>{ui.openShowdownCta}</span>
                </button>
              )}
              <button
                type="button"
                className="sd-launch-split3d-btn"
                data-testid="sd-staging-split3d-cta"
                title={SPLIT_SHOWDOWN_STRINGS[lang].matrixLaunchTitle}
                onClick={() => handleLaunchSplit3d(weaponAId, weaponBId)}
              >
                <Scissors size={13} aria-hidden="true" />
                <span>{split3dCtaLabel}</span>
              </button>
            </div>
          </div>
        </section>

        {viewMode === 'matrix' ? (
          <>
            {/* Axis Filter Bar */}
            <div className="sd-axis-filter-row" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={axisFilter === 'all'}
                className={`sd-axis-pill ${axisFilter === 'all' ? 'active' : ''}`}
                onClick={() => setAxisFilter('all')}
              >
                {ui.allAxesTab}
              </button>
              {MECHANISM_TAXONOMY_AXES.map((ax) => {
                const loc = getLocalizedAxisMeta(ax.id, lang);
                return (
                  <button
                    key={ax.id}
                    type="button"
                    role="tab"
                    aria-selected={axisFilter === ax.id}
                    className={`sd-axis-pill ${
                      axisFilter === ax.id ? 'active' : ''
                    }`}
                    onClick={() => setAxisFilter(ax.id)}
                  >
                    <span className="sd-axis-code">{loc.code}</span>
                    <span>{loc.title}</span>
                  </button>
                );
              })}
            </div>

            {/* 3-Axis Mechanical Lineage Sections */}
            <div className="sd-axes-stack">
              {visibleAxes.map((ax) => {
                const axisLoc = getLocalizedAxisMeta(ax.id, lang);
                const families = getTaxonomyFamiliesForAxis(
                  ax.id,
                  lang,
                  activeIds
                );
                return (
                  <section key={ax.id} className="sd-axis-section">
                    <div className="sd-axis-head">
                      <span className="sd-axis-badge">{axisLoc.code}</span>
                      <div>
                        <h3 className="sd-axis-title">{axisLoc.title}</h3>
                        <p className="sd-axis-sub">{axisLoc.subtitle}</p>
                      </div>
                    </div>

                    <div className="sd-family-grid">
                      {families.map((fam) => (
                        <article
                          key={fam.id}
                          className="sd-family-card"
                          style={
                            {
                              '--sd-fam-accent': fam.accentHex,
                            } as React.CSSProperties
                          }
                        >
                          <div className="sd-fam-top">
                            <span className="sd-fam-badge">{fam.badge}</span>
                            <span className="sd-fam-count">
                              {ui.familyCountBadge(fam.exhibitIds.length)}
                            </span>
                          </div>

                          <h4 className="sd-fam-title">{fam.title}</h4>
                          <p className="sd-fam-principle">{fam.principle}</p>

                          <div className="sd-fam-tradeoffs">
                            <div className="sd-tradeoff-row is-pro">
                              <span className="sd-tf-tag">
                                + {ui.prosLabel}
                              </span>
                              <span>{fam.pros}</span>
                            </div>
                            <div className="sd-tradeoff-row is-con">
                              <span className="sd-tf-tag">
                                − {ui.consLabel}
                              </span>
                              <span>{fam.cons}</span>
                            </div>
                          </div>

                          <div className="sd-fam-exhibits">
                            {fam.exhibitIds.map((exId) => {
                              const ex =
                                profileMap.get(exId) ??
                                getShowdownExhibitProfile(exId, lang);
                              const isA = exId === weaponAId;
                              const isB = exId === weaponBId;
                              return (
                                <div
                                  key={exId}
                                  className={`sd-exhibit-chip ${
                                    isA ? 'is-slot-a' : isB ? 'is-slot-b' : ''
                                  }`}
                                >
                                  <button
                                    type="button"
                                    className="sd-exhibit-select-area"
                                    onClick={() =>
                                      handleStageFromMatrixChip(exId)
                                    }
                                    onMouseEnter={() => {
                                      if (isWeaponId(exId)) {
                                        preloadWeaponPlugin(exId);
                                        preloadWeaponNarration(exId);
                                      }
                                    }}
                                  >
                                    <div className="sd-ex-mini-sil">
                                      <WeaponSilhouetteSvg
                                        id={ex.id}
                                        available={ex.available}
                                      />
                                    </div>
                                    <div className="sd-ex-meta">
                                      <div className="sd-ex-name-row">
                                        <span className="sd-ex-bay">
                                          {ex.bayCode.replace('BAY-', '#')}
                                        </span>
                                        <span className="sd-ex-short">
                                          {ex.shortLabel}
                                        </span>
                                        {isA && (
                                          <span className="sd-ex-slot-tag slot-a">
                                            A
                                          </span>
                                        )}
                                        {isB && (
                                          <span className="sd-ex-slot-tag slot-b">
                                            B
                                          </span>
                                        )}
                                      </div>
                                      <span className="sd-ex-cal">
                                        {ex.compactCaliber}
                                      </span>
                                    </div>
                                  </button>

                                  <button
                                    type="button"
                                    className="sd-ex-quick-vs-btn"
                                    onClick={() =>
                                      handleQuickCompareFromChip(exId)
                                    }
                                  >
                                    {isA
                                      ? ui.compareWithRivalBtn
                                      : ui.compareWithSlotBtn}
                                  </button>
                                </div>
                              );
                            })}
                          </div>
                        </article>
                      ))}
                    </div>
                  </section>
                );
              })}
            </div>
          </>
        ) : (
          /* ==================== MODE 2: Dual-Exhibit A vs B Showdown ==================== */
          <div className="sd-showdown-stage">
            {/* Classic Rivalry Presets + Weapon A/B Selectors */}
            <section className="sd-rivalry-toolbar">
              <div className="sd-presets-row">
                <span className="sd-presets-label">
                  <Sparkles size={12} aria-hidden="true" />
                  <span>{ui.presetsLabel}</span>
                </span>
                <div className="sd-preset-pills">
                  {rivalryPresets.map((preset) => {
                    const isActive = activeRivalry?.id === preset.id;
                    return (
                      <div
                        key={preset.id}
                        className={`sd-preset-item ${isActive ? 'active' : ''}`}
                      >
                        <button
                          type="button"
                          className={`sd-preset-pill ${isActive ? 'active' : ''}`}
                          onClick={() => {
                            playWorkbenchFoley('preset_detent');
                            setWeaponAId(preset.weaponA);
                            setWeaponBId(preset.weaponB);
                          }}
                        >
                          {preset.pillLabel}
                        </button>
                        <button
                          type="button"
                          className="sd-preset-split3d-btn"
                          data-testid={`sd-preset-split3d-${preset.id}`}
                          aria-label={split3dQuickTitle(preset.pillLabel)}
                          title={split3dQuickTitle(preset.pillLabel)}
                          onClick={() =>
                            handleLaunchSplit3d(preset.weaponA, preset.weaponB)
                          }
                        >
                          <Scissors size={10} aria-hidden="true" />
                          <span>3D</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            </section>

            {/* Rivalry Thesis / Synthesized Lineage Summary Banner + 1-Click 3D Split Cutaway */}
            <div className="sd-verdict-banner">
              <div className="sd-verdict-copy">
                <div className="sd-verdict-head">
                  <Zap
                    size={13}
                    className="sd-verdict-icon"
                    aria-hidden="true"
                  />
                  <strong>
                    {activeRivalry
                      ? activeRivalry.headline
                      : lang === 'zh'
                        ? `${profileA.shortLabel} vs ${profileB.shortLabel} · 三维机械谱系共有 ${diffAxisCount} 项异构分流 / ${3 - diffAxisCount} 项同源架构`
                        : `${profileA.shortLabel} vs ${profileB.shortLabel} · ${diffAxisCount} Divergent / ${3 - diffAxisCount} Shared Mechanical Axes`}
                  </strong>
                </div>
                <p className="sd-verdict-body">
                  {activeRivalry
                    ? activeRivalry.verdict
                    : lang === 'zh'
                      ? `${profileA.shortLabel} 采用「${profileA.driveFamilyTitle} + ${profileA.lockingFamilyTitle} + ${profileA.feedFamilyTitle}」，而 ${profileB.shortLabel} 采用「${profileB.driveFamilyTitle} + ${profileB.lockingFamilyTitle} + ${profileB.feedFamilyTitle}」。`
                      : `${profileA.shortLabel} pairs ${profileA.driveFamilyTitle}, ${profileA.lockingFamilyTitle}, and ${profileA.feedFamilyTitle}, whereas ${profileB.shortLabel} pairs ${profileB.driveFamilyTitle}, ${profileB.lockingFamilyTitle}, and ${profileB.feedFamilyTitle}.`}
                </p>
              </div>

              <button
                type="button"
                className="sd-verdict-split3d-cta"
                data-testid="sd-active-split3d-cta"
                title={SPLIT_SHOWDOWN_STRINGS[lang].matrixLaunchTitle}
                onClick={() => handleLaunchSplit3d(weaponAId, weaponBId)}
              >
                <GitCompareArrows size={14} aria-hidden="true" />
                <span>{split3dCtaLabel}</span>
              </button>
            </div>

            {/* Side-by-Side Exhibit Hero Cards */}
            <div className="sd-heroes-grid">
              {renderExhibitHeroCard(profileA, 'A')}
              {renderExhibitHeroCard(profileB, 'B')}
            </div>

            {/* Live 6-Axis Quantitative Engineering Radar SVG + Bore/Rifling & Scale Parity Strip */}
            <section
              className="sd-radar-section"
              data-testid="sd-radar-card"
            >
              <div className="sd-card-head">
                <div>
                  <h3 className="sd-card-title">
                    <Hexagon size={14} aria-hidden="true" />
                    <span>
                      {lang === 'zh'
                        ? '六维定量工程雷达图（对数归一化 0–100）'
                        : '6-Axis Quantitative Engineering Radar (Log-Normalized 0–100)'}
                    </span>
                  </h3>
                  <p className="sd-card-sub">
                    {lang === 'zh'
                      ? '悬停或聚焦任意坐标轴查看初速、枪口动能、射速、紧凑度、机构复杂度与有效射程精确对比'
                      : 'Hover or focus any axis to inspect exact velocity, energy, tempo, compactness, complexity & reach deltas'}
                  </p>
                </div>

                <div className="sd-radar-legend">
                  <span className="sd-radar-leg-pill is-a">
                    <i className="sd-radar-dot is-a" aria-hidden="true" />
                    <span>A · {profileA.shortLabel}</span>
                  </span>
                  <span className="sd-radar-leg-pill is-b">
                    <i className="sd-radar-dot is-b" aria-hidden="true" />
                    <span>B · {profileB.shortLabel}</span>
                  </span>
                </div>
              </div>

              <div className="sd-radar-layout">
                <div className="sd-radar-svg-wrap">
                  <svg
                    viewBox={`0 0 ${radarGeo.width} ${radarGeo.height}`}
                    className="sd-radar-svg"
                    data-testid="sd-radar-svg"
                    role="img"
                    aria-label={
                      lang === 'zh'
                        ? `${profileA.shortLabel} 对比 ${profileB.shortLabel} 六维定量工程雷达图`
                        : `6-axis engineering radar comparing ${profileA.shortLabel} versus ${profileB.shortLabel}`
                    }
                  >
                    {/* Concentric Hexagonal Scale Rings (25 / 50 / 75 / 100) */}
                    {radarGeo.ringPolygons.map((ring) => (
                      <polygon
                        key={ring.level}
                        points={ring.points}
                        className={`sd-radar-ring ${
                          ring.level === 100 ? 'is-outer' : ''
                        }`}
                      />
                    ))}

                    {/* 6 Radial Axis Spokes */}
                    {radarGeo.vertices.map((v) => (
                      <line
                        key={v.axisId}
                        x1={radarGeo.cx}
                        y1={radarGeo.cy}
                        x2={v.axisEndX}
                        y2={v.axisEndY}
                        className={`sd-radar-spoke ${
                          focusedRadarAxis === v.axisId ? 'is-focused' : ''
                        }`}
                      />
                    ))}

                    {/* Exhibit B Amber Overlay Polygon */}
                    <polygon
                      points={radarGeo.polygonB}
                      className="sd-radar-poly-b"
                    />

                    {/* Exhibit A Cyan Overlay Polygon */}
                    <polygon
                      points={radarGeo.polygonA}
                      className="sd-radar-poly-a"
                    />

                    {/* Interactive Vertex Nodes & Perimeter Axis Labels */}
                    {radarGeo.vertices.map((v, idx) => {
                      const meta = SHOWDOWN_RADAR_AXES[idx];
                      const isFocused = focusedRadarAxis === v.axisId;
                      const anchor: 'middle' | 'start' | 'end' =
                        Math.abs(v.labelX - radarGeo.cx) < 8
                          ? 'middle'
                          : v.labelX > radarGeo.cx
                            ? 'start'
                            : 'end';
                      return (
                        <g
                          key={v.axisId}
                          className={`sd-radar-axis-group ${
                            isFocused ? 'is-focused' : ''
                          }`}
                          onMouseEnter={() => setFocusedRadarAxis(v.axisId)}
                        >
                          <circle
                            cx={v.xB}
                            cy={v.yB}
                            r={isFocused ? 4.8 : 3.4}
                            className="sd-radar-node-b"
                          />
                          <circle
                            cx={v.xA}
                            cy={v.yA}
                            r={isFocused ? 4.8 : 3.4}
                            className="sd-radar-node-a"
                          />
                          <text
                            x={v.labelX}
                            y={v.labelY + 3.5}
                            textAnchor={anchor}
                            className="sd-radar-axis-label"
                          >
                            {lang === 'zh' ? meta.shortZh : meta.shortEn}
                          </text>
                        </g>
                      );
                    })}
                  </svg>
                </div>

                {/* Interactive 6-Axis Numeric Breakdown & Hover/Focus Tooltip */}
                <div
                  className="sd-radar-axis-list"
                  data-testid="sd-radar-axis-table"
                >
                  {SHOWDOWN_RADAR_AXES.map((axis) => {
                    const isFocused = focusedRadarAxis === axis.id;
                    const scoreA = radarA[axis.id];
                    const scoreB = radarB[axis.id];
                    const formatRaw = (r: typeof radarA.raw): string => {
                      switch (axis.id) {
                        case 'velocity':
                          return `${Math.round(r.velocityMps)} m/s`;
                        case 'energy':
                          return formatEnergyJ(r.energyJ);
                        case 'cyclicRate':
                          return `${Math.round(r.effectiveRpm)} RPM`;
                        case 'compactness':
                          return `${Math.round(r.overallLengthMm)} mm`;
                        case 'partComplexity':
                          return lang === 'zh'
                            ? `${r.partsCount} 零件`
                            : `${r.partsCount} parts`;
                        case 'rangeReach':
                          return `${Math.round(r.effectiveRangeM).toLocaleString('en-US')} m`;
                      }
                    };
                    return (
                      <button
                        key={axis.id}
                        type="button"
                        className={`sd-radar-axis-row ${
                          isFocused ? 'is-focused' : ''
                        }`}
                        data-radar-axis={axis.id}
                        aria-pressed={isFocused}
                        onMouseEnter={() => setFocusedRadarAxis(axis.id)}
                        onFocus={() => setFocusedRadarAxis(axis.id)}
                        onClick={() => setFocusedRadarAxis(axis.id)}
                      >
                        <div className="sd-radar-row-top">
                          <span className="sd-radar-row-name">
                            {lang === 'zh' ? axis.labelZh : axis.labelEn}
                          </span>
                          <span className="sd-radar-row-scores">
                            <strong className="is-a">{scoreA}</strong>
                            <span className="sd-radar-vs-sep">/</span>
                            <strong className="is-b">{scoreB}</strong>
                          </span>
                        </div>
                        <div className="sd-radar-row-raws">
                          <span className="is-a">
                            A: {formatRaw(radarA.raw)}
                          </span>
                          <span className="is-b">
                            B: {formatRaw(radarB.raw)}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Bore & Rifling + 1:1 Scale & Mass Parity Strip */}
              <div
                className="sd-rifling-scale-strip"
                data-testid="sd-rifling-scale-strip"
              >
                <div className="sd-parity-cell">
                  <span className="sd-parity-kicker">
                    <Ruler size={11} aria-hidden="true" />
                    <span>
                      {lang === 'zh'
                        ? `A · ${profileA.shortLabel} 膛线与内膛`
                        : `A · ${profileA.shortLabel} Bore & Rifling`}
                    </span>
                  </span>
                  <span className="sd-parity-value">
                    {riflingA && riflingA.kind !== 'none'
                      ? `${lang === 'zh' ? riflingA.labelZh : riflingA.labelEn} (Ø${riflingA.boreDiameterMm} mm)`
                      : lang === 'zh'
                        ? '复合弓弩机械推进（无膛线枪管）'
                        : 'Compound Archery Elastic Propulsion (Non-Barreled)'}
                  </span>
                </div>

                <div className="sd-parity-cell is-ratio">
                  <span className="sd-parity-kicker">
                    <Scale size={11} aria-hidden="true" />
                    <span>
                      {lang === 'zh' ? '1:1 尺度与质量比' : '1:1 Scale & Mass Ratio'}
                    </span>
                  </span>
                  <span className="sd-parity-value tabular">
                    {lang === 'zh' ? '长度 ' : 'OAL '}
                    <strong>
                      {(
                        Math.max(
                          profileA.overallLengthMm,
                          profileB.overallLengthMm
                        ) /
                        Math.max(
                          1,
                          Math.min(
                            profileA.overallLengthMm,
                            profileB.overallLengthMm
                          )
                        )
                      ).toFixed(2)}
                      ×
                    </strong>
                    {' · '}
                    {lang === 'zh' ? '质量 ' : 'Mass '}
                    <strong>
                      {(
                        Math.max(profileA.emptyWeightKg, profileB.emptyWeightKg) /
                        Math.max(
                          0.05,
                          Math.min(
                            profileA.emptyWeightKg,
                            profileB.emptyWeightKg
                          )
                        )
                      ).toFixed(2)}
                      ×
                    </strong>
                  </span>
                </div>

                <div className="sd-parity-cell is-b">
                  <span className="sd-parity-kicker">
                    <Ruler size={11} aria-hidden="true" />
                    <span>
                      {lang === 'zh'
                        ? `B · ${profileB.shortLabel} 膛线与内膛`
                        : `B · ${profileB.shortLabel} Bore & Rifling`}
                    </span>
                  </span>
                  <span className="sd-parity-value">
                    {riflingB && riflingB.kind !== 'none'
                      ? `${lang === 'zh' ? riflingB.labelZh : riflingB.labelEn} (Ø${riflingB.boreDiameterMm} mm)`
                      : lang === 'zh'
                        ? '复合弓弩机械推进（无膛线枪管）'
                        : 'Compound Archery Elastic Propulsion (Non-Barreled)'}
                  </span>
                </div>
              </div>
            </section>

            {/* Dual-Curve Quantitative SVG Chart + 6-Dimension Comparison Bars */}
            <div className="sd-quant-grid">
              {/* Left: Overlaid Dual-Curve SVG Oscilloscope */}
              <section className="sd-chart-card">
                <div className="sd-card-head">
                  <div>
                    <h3 className="sd-card-title">
                      <Flame size={14} aria-hidden="true" />
                      <span>{ui.chartTitle}</span>
                    </h3>
                    <p className="sd-card-sub">{ui.chartSub}</p>
                  </div>

                  <div className="sd-scale-toggle">
                    <button
                      type="button"
                      className={`sd-scale-btn ${
                        chartGeo.effectiveScaleMode === 'normalized'
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => setScaleMode('normalized')}
                    >
                      {ui.scaleNormalized}
                    </button>
                    <button
                      type="button"
                      disabled={chartGeo.crossDomain}
                      className={`sd-scale-btn ${
                        chartGeo.effectiveScaleMode === 'relative'
                          ? 'active'
                          : ''
                      }`}
                      onClick={() => setScaleMode('relative')}
                    >
                      {ui.scaleRelative}
                    </button>
                  </div>
                </div>

                {/* 4-Trace Color Legend */}
                <div className="sd-chart-legend">
                  <span className="sd-leg-item is-pa">
                    <i className="sd-leg-swatch solid-cyan" />
                    <span>
                      {ui.legendPressure(profileA.shortLabel)} (
                      {profileA.peakLoadFormatted})
                    </span>
                  </span>
                  <span className="sd-leg-item is-va">
                    <i className="sd-leg-swatch dashed-amber" />
                    <span>
                      {ui.legendVelocity(profileA.shortLabel)} (
                      {profileA.muzzleVelocityMps} m/s)
                    </span>
                  </span>
                  <span className="sd-leg-item is-pb">
                    <i className="sd-leg-swatch solid-emerald" />
                    <span>
                      {ui.legendPressure(profileB.shortLabel)} (
                      {profileB.peakLoadFormatted})
                    </span>
                  </span>
                  <span className="sd-leg-item is-vb">
                    <i className="sd-leg-swatch dashed-rose" />
                    <span>
                      {ui.legendVelocity(profileB.shortLabel)} (
                      {profileB.muzzleVelocityMps} m/s)
                    </span>
                  </span>
                </div>

                <div className="sd-svg-wrap">
                  <svg
                    viewBox={`0 0 ${chartGeo.width} ${chartGeo.height}`}
                    className="sd-ballistics-svg"
                    onPointerMove={handleSvgPointerMove}
                    onPointerLeave={() => setHoverProgress(null)}
                    role="img"
                    aria-label={ui.chartTitle}
                  >
                    <defs>
                      <linearGradient id={gradAId} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#38bdf8"
                          stopOpacity="0.28"
                        />
                        <stop
                          offset="100%"
                          stopColor="#38bdf8"
                          stopOpacity="0.01"
                        />
                      </linearGradient>
                      <linearGradient id={gradBId} x1="0" y1="0" x2="0" y2="1">
                        <stop
                          offset="0%"
                          stopColor="#10b981"
                          stopOpacity="0.26"
                        />
                        <stop
                          offset="100%"
                          stopColor="#10b981"
                          stopOpacity="0.01"
                        />
                      </linearGradient>
                    </defs>

                    {/* Horizontal & Vertical Engineering Grid */}
                    {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
                      const y =
                        chartGeo.plotBottom -
                        tick * (chartGeo.plotBottom - chartGeo.plotTop);
                      const x =
                        chartGeo.plotLeft +
                        tick * (chartGeo.plotRight - chartGeo.plotLeft);
                      return (
                        <g key={tick}>
                          <line
                            x1={chartGeo.plotLeft}
                            y1={y}
                            x2={chartGeo.plotRight}
                            y2={y}
                            className="sd-svg-grid-line"
                          />
                          <text
                            x={chartGeo.plotLeft - 6}
                            y={y + 3.5}
                            textAnchor="end"
                            className="sd-svg-axis-txt"
                          >
                            {Math.round(tick * 100)}%
                          </text>
                          <line
                            x1={x}
                            y1={chartGeo.plotTop}
                            x2={x}
                            y2={chartGeo.plotBottom}
                            className="sd-svg-grid-line"
                          />
                          <text
                            x={x}
                            y={chartGeo.height - 10}
                            textAnchor="middle"
                            className="sd-svg-axis-txt"
                          >
                            {Math.round(tick * 100)}%
                          </text>
                        </g>
                      );
                    })}

                    {/* Muzzle / Launch Exit Vertical Markers */}
                    <line
                      x1={chartGeo.traceA.muzzleExitX}
                      y1={chartGeo.plotTop}
                      x2={chartGeo.traceA.muzzleExitX}
                      y2={chartGeo.plotBottom}
                      stroke="#38bdf8"
                      strokeOpacity="0.34"
                      strokeDasharray="2 3"
                    />
                    <line
                      x1={chartGeo.traceB.muzzleExitX}
                      y1={chartGeo.plotTop}
                      x2={chartGeo.traceB.muzzleExitX}
                      y2={chartGeo.plotBottom}
                      stroke="#10b981"
                      strokeOpacity="0.34"
                      strokeDasharray="2 3"
                    />

                    {/* Shaded Pressure/Thrust Envelopes */}
                    <path
                      d={chartGeo.traceA.pressureAreaPath}
                      fill={`url(#${gradAId})`}
                    />
                    <path
                      d={chartGeo.traceB.pressureAreaPath}
                      fill={`url(#${gradBId})`}
                    />

                    {/* Velocity Dashed Curves (Amber for A, Rose for B) */}
                    <path
                      d={chartGeo.traceA.velocityLinePath}
                      fill="none"
                      stroke="#f59e0b"
                      strokeWidth="1.9"
                      strokeDasharray="5 3.5"
                    />
                    <path
                      d={chartGeo.traceB.velocityLinePath}
                      fill="none"
                      stroke="#fb7185"
                      strokeWidth="1.9"
                      strokeDasharray="5 3.5"
                    />

                    {/* Primary Pressure/Thrust Solid Curves (Cyan for A, Emerald for B) */}
                    <path
                      d={chartGeo.traceA.pressureLinePath}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                    />
                    <path
                      d={chartGeo.traceB.pressureLinePath}
                      fill="none"
                      stroke="#10b981"
                      strokeWidth="2.4"
                      strokeLinejoin="round"
                    />

                    {/* Peak Annotations for Exhibit A & Exhibit B (Smart Horizontal Separation + Pill Backing) */}
                    {peakLayout.peakA.showLeader && (
                      <line
                        x1={peakLayout.peakA.leaderX1}
                        y1={peakLayout.peakA.leaderY1}
                        x2={peakLayout.peakA.leaderX2}
                        y2={peakLayout.peakA.leaderY2}
                        className="sd-svg-peak-leader is-a"
                      />
                    )}
                    {peakLayout.peakB.showLeader && (
                      <line
                        x1={peakLayout.peakB.leaderX1}
                        y1={peakLayout.peakB.leaderY1}
                        x2={peakLayout.peakB.leaderX2}
                        y2={peakLayout.peakB.leaderY2}
                        className="sd-svg-peak-leader is-b"
                      />
                    )}

                    <circle
                      cx={chartGeo.traceA.peakMarker.x}
                      cy={chartGeo.traceA.peakMarker.y}
                      r="4"
                      fill="#38bdf8"
                      stroke="#0f172a"
                      strokeWidth="1.4"
                    />
                    <circle
                      cx={chartGeo.traceB.peakMarker.x}
                      cy={chartGeo.traceB.peakMarker.y}
                      r="4"
                      fill="#10b981"
                      stroke="#0f172a"
                      strokeWidth="1.4"
                    />

                    <g className="sd-svg-peak-group is-a">
                      <rect
                        x={peakLayout.peakA.pillX}
                        y={peakLayout.peakA.pillY}
                        width={peakLayout.peakA.pillW}
                        height={peakLayout.peakA.pillH}
                        rx="4"
                        className="sd-svg-peak-pill is-a"
                      />
                      <text
                        x={peakLayout.peakA.textX}
                        y={peakLayout.peakA.textY}
                        textAnchor={peakLayout.peakA.textAnchor}
                        className="sd-svg-peak-label is-a"
                      >
                        {peakLayout.peakA.labelText}
                      </text>
                    </g>

                    <g className="sd-svg-peak-group is-b">
                      <rect
                        x={peakLayout.peakB.pillX}
                        y={peakLayout.peakB.pillY}
                        width={peakLayout.peakB.pillW}
                        height={peakLayout.peakB.pillH}
                        rx="4"
                        className="sd-svg-peak-pill is-b"
                      />
                      <text
                        x={peakLayout.peakB.textX}
                        y={peakLayout.peakB.textY}
                        textAnchor={peakLayout.peakB.textAnchor}
                        className="sd-svg-peak-label is-b"
                      >
                        {peakLayout.peakB.labelText}
                      </text>
                    </g>

                    {/* Interactive Hover Crosshair */}
                    {hoverProgress !== null && (
                      <line
                        x1={
                          chartGeo.plotLeft +
                          hoverProgress *
                            (chartGeo.plotRight - chartGeo.plotLeft)
                        }
                        y1={chartGeo.plotTop}
                        x2={
                          chartGeo.plotLeft +
                          hoverProgress *
                            (chartGeo.plotRight - chartGeo.plotLeft)
                        }
                        y2={chartGeo.plotBottom}
                        className="sd-svg-cursor-line"
                      />
                    )}
                  </svg>
                </div>

                {/* Live Hover Telemetry Readout Bar */}
                <div className="sd-chart-footer">
                  {hoverProgress !== null && scrubSampleA && scrubSampleB ? (
                    <div className="sd-scrub-readout">
                      <span className="sd-scrub-phase">
                        {ui.scrubReadoutLabel(Math.round(hoverProgress * 100))}
                      </span>
                      <span className="sd-scrub-val is-a">
                        A ({profileA.shortLabel}):{' '}
                        {Math.round(scrubSampleA.pressureRaw)}{' '}
                        {profileA.peakLoadUnit} ·{' '}
                        {Math.round(scrubSampleA.velocityMps)} m/s
                      </span>
                      <span className="sd-scrub-val is-b">
                        B ({profileB.shortLabel}):{' '}
                        {Math.round(scrubSampleB.pressureRaw)}{' '}
                        {profileB.peakLoadUnit} ·{' '}
                        {Math.round(scrubSampleB.velocityMps)} m/s
                      </span>
                    </div>
                  ) : (
                    <span className="sd-axis-caption">
                      {chartGeo.crossDomain
                        ? ui.crossDomainNote
                        : `${ui.axisProgressLabel} · ${ui.scrubHoverHint}`}
                    </span>
                  )}
                </div>
              </section>

              {/* Right: 6-Dimension Quantitative Engineering Comparison Bars */}
              <section className="sd-metrics-card">
                <div className="sd-card-head">
                  <div>
                    <h3 className="sd-card-title">
                      <CheckCircle2 size={14} aria-hidden="true" />
                      <span>{ui.metricsTitle}</span>
                    </h3>
                    <p className="sd-card-sub">{ui.metricsSub}</p>
                  </div>
                </div>

                <div className="sd-metric-bars-list">
                  {/* 1. Velocity */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {profileA.muzzleVelocityMps} m/s
                      </span>
                      <span className="sd-metric-label">
                        {ui.metricVelocity}
                      </span>
                      <span className="sd-metric-val is-b">
                        {profileB.muzzleVelocityMps} m/s
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${velBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${velBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 2. Muzzle Kinetic Energy */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {formatEnergyJ(profileA.muzzleEnergyJ)}
                      </span>
                      <span className="sd-metric-label">{ui.metricEnergy}</span>
                      <span className="sd-metric-val is-b">
                        {formatEnergyJ(profileB.muzzleEnergyJ)}
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${engBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${engBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 3. Peak Pressure / Peak Draw */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {profileA.peakLoadFormatted} ({profileA.standardLabel})
                      </span>
                      <span className="sd-metric-label">
                        {ui.metricPeakLoad}
                      </span>
                      <span className="sd-metric-val is-b">
                        {profileB.peakLoadFormatted} ({profileB.standardLabel})
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${loadBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${loadBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 4. Cyclic Rate / Operational Action */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {profileA.rateOfFireDisplay}
                      </span>
                      <span className="sd-metric-label">{ui.metricCyclic}</span>
                      <span className="sd-metric-val is-b">
                        {profileB.rateOfFireDisplay}
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${rpmBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${rpmBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 5. OAL & Barrel / Power Stroke */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {profileA.overallLengthMm} mm (
                        {profileA.barrelOrStrokeMm} mm)
                      </span>
                      <span className="sd-metric-label">
                        {ui.metricOalBarrel}
                      </span>
                      <span className="sd-metric-val is-b">
                        {profileB.overallLengthMm} mm (
                        {profileB.barrelOrStrokeMm} mm)
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${oalBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${oalBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>

                  {/* 6. Unloaded Mass & CAD Parts */}
                  <div className="sd-metric-item">
                    <div className="sd-metric-head">
                      <span className="sd-metric-val is-a">
                        {formatMassKg(profileA.emptyWeightKg)} ({profileA.partsCount})
                      </span>
                      <span className="sd-metric-label">
                        {ui.metricMassParts}
                      </span>
                      <span className="sd-metric-val is-b">
                        {formatMassKg(profileB.emptyWeightKg)} ({profileB.partsCount})
                      </span>
                    </div>
                    <div className="sd-dual-bars">
                      <div className="sd-bar-track align-right">
                        <div
                          className="sd-bar-fill slot-a"
                          style={{ width: `${massBarA}%` }}
                        />
                      </div>
                      <div className="sd-bar-track">
                        <div
                          className="sd-bar-fill slot-b"
                          style={{ width: `${massBarB}%` }}
                        />
                      </div>
                    </div>
                  </div>
                </div>
              </section>
            </div>

            {/* Subsystem Architectural Breakdown Matrix */}
            <section className="sd-breakdown-card">
              <h3 className="sd-card-title sd-breakdown-heading">
                <GitCompareArrows size={14} aria-hidden="true" />
                <span>{ui.archBreakdownTitle}</span>
              </h3>

              <div className="sd-breakdown-table">
                <div className="sd-bd-row">
                  <div className="sd-bd-cell is-a">{profileA.driveDetail}</div>
                  <div className="sd-bd-label">{ui.rowDrive}</div>
                  <div className="sd-bd-cell is-b">{profileB.driveDetail}</div>
                </div>

                <div className="sd-bd-row">
                  <div className="sd-bd-cell is-a">
                    {profileA.lockingDetail}
                  </div>
                  <div className="sd-bd-label">{ui.rowLocking}</div>
                  <div className="sd-bd-cell is-b">
                    {profileB.lockingDetail}
                  </div>
                </div>

                <div className="sd-bd-row">
                  <div className="sd-bd-cell is-a">{profileA.feedDetail}</div>
                  <div className="sd-bd-label">{ui.rowFeed}</div>
                  <div className="sd-bd-cell is-b">{profileB.feedDetail}</div>
                </div>

                <div className="sd-bd-row">
                  <div className="sd-bd-cell is-a">
                    {profileA.fireControlDetail}
                  </div>
                  <div className="sd-bd-label">{ui.rowFireControl}</div>
                  <div className="sd-bd-cell is-b">
                    {profileB.fireControlDetail}
                  </div>
                </div>

                <div className="sd-bd-row is-verdict">
                  <div className="sd-bd-cell is-a">
                    <div className="sd-verdict-line is-pro">
                      <span className="sd-vtag pro">{ui.strengthTag}</span>
                      <span>{profileA.signatureAdvantage}</span>
                    </div>
                    <div className="sd-verdict-line is-con">
                      <span className="sd-vtag con">{ui.tradeoffTag}</span>
                      <span>{profileA.engineeringTradeoff}</span>
                    </div>
                  </div>
                  <div className="sd-bd-label">{ui.rowVerdict}</div>
                  <div className="sd-bd-cell is-b">
                    <div className="sd-verdict-line is-pro">
                      <span className="sd-vtag pro">{ui.strengthTag}</span>
                      <span>{profileB.signatureAdvantage}</span>
                    </div>
                    <div className="sd-verdict-line is-con">
                      <span className="sd-vtag con">{ui.tradeoffTag}</span>
                      <span>{profileB.engineeringTradeoff}</span>
                    </div>
                  </div>
                </div>
              </div>
            </section>
          </div>
        )}
      </div>
    </dialog>
  );
};

export default MechanismShowdownModal;

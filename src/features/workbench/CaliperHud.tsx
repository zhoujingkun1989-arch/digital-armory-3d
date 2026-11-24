import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { BoxSelect, Crosshair, RotateCcw, Ruler, X } from 'lucide-react';
import {
  CALIPER_BENCHMARK_ORDER,
  type CaliperBenchmarkKind,
  WORLD_UNIT_TO_MM,
  caliperStore,
  computeWeaponEnvelopeMetrics,
  convertMmToInches,
  formatCaliperDistance,
  formatCaliperPlaceholder,
  formatCaliperSignedDelta,
  getCaliperBenchmarkNote,
} from '../../engine/caliper/caliperStore';
import { playbackClock } from '../../engine/clock/playbackClock';
import { fieldStripStore } from '../../engine/fieldstrip/fieldStripStore';
import {
  getCachedPartGeometry,
  useWeaponGeometries,
} from '../../engine/geometry/geometryService';
import {
  createMutablePose,
  evaluatePartPoseInto,
} from '../../engine/kinematics/math';
import { isArcheryWeapon } from '../../engine/physics/armoryPhysics';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolvePartCalloutLabel } from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId } from '../../weapons/types';

const _hudScratchPose = createMutablePose();

export interface CaliperHudProps {
  /** Optional overrides for deterministic SSR/unit verification */
  forceVisible?: boolean;
  weaponIdOverride?: WeaponId;
  langOverride?: LanguageCode;
}

export const CaliperHud: React.FC<CaliperHudProps> = ({
  forceVisible = false,
  weaponIdOverride,
  langOverride,
}) => {
  const screen = useAppStore((s) => s.screen);
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const storeLang = useAppStore((s) => s.lang);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const lang = langOverride ?? storeLang;
  const mode = useAppStore((s) => s.mode);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const envelopeRulerVisible = useAppStore((s) => s.envelopeRulerVisible);
  const setCaliperActive = useAppStore((s) => s.setCaliperActive);
  const toggleEnvelopeRuler = useAppStore((s) => s.toggleEnvelopeRuler);

  const snap = useSyncExternalStore(
    caliperStore.subscribe,
    caliperStore.getSnapshot,
    caliperStore.getSnapshot
  );

  const plugin = useWeaponPlugin(activeWeaponId);
  const geoStatus = useWeaponGeometries(activeWeaponId, plugin?.parts ?? null);
  const { bundle } = useWeaponNarration(activeWeaponId);

  const liveReadoutRef = useRef<HTMLSpanElement>(null);

  // Zero-GC 60fps live hover preview span when Jaw A is placed and Jaw B is awaiting click
  useEffect(() => {
    if (!caliperActive || !snap.pointA || snap.pointB) return;

    let rafId = 0;
    const ax = snap.pointA.pos[0];
    const ay = snap.pointA.pos[1];
    const az = snap.pointA.pos[2];

    const tick = () => {
      const hover = caliperStore.getTransientHover();
      const unit = caliperStore.getUnitSystem();
      if (liveReadoutRef.current) {
        if (hover.active) {
          const distMm =
            Math.hypot(hover.x - ax, hover.y - ay, hover.z - az) *
            WORLD_UNIT_TO_MM;
          liveReadoutRef.current.textContent = formatCaliperDistance(
            distMm,
            unit
          );
        } else {
          liveReadoutRef.current.textContent = formatCaliperPlaceholder(unit);
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [caliperActive, snap.pointA, snap.pointB, snap.unitSystem]);

  const envelopeMetrics = useMemo(() => {
    if (!plugin || geoStatus.readyCount === 0 || geoStatus.version < 0) {
      return null;
    }
    const clock = playbackClock.getState();
    const isFs = fieldStripActive && mode === 'explode';
    const isFiring = mode === 'firing';
    return computeWeaponEnvelopeMetrics(
      plugin.parts,
      (partId) => getCachedPartGeometry(activeWeaponId, partId),
      (part, out) => {
        if (isFs) {
          return fieldStripStore.evaluatePartPoseInto(
            activeWeaponId,
            part,
            out
          );
        }
        return evaluatePartPoseInto(
          part,
          clock.targetProgress,
          isFiring,
          clock.fireProgress,
          plugin.computeFiringKinematics,
          out
        );
      },
      _hudScratchPose
    );
  }, [
    plugin,
    geoStatus.readyCount,
    geoStatus.version,
    activeWeaponId,
    mode,
    fieldStripActive,
  ]);

  if (!forceVisible && (screen !== 'workbench' || !caliperActive)) {
    return null;
  }

  const rawUi = UI_STRINGS[lang].caliper;
  const ui = isArcheryWeapon(activeWeaponId)
    ? { ...rawUi, ...rawUi.archery }
    : rawUi;
  const unit = snap.unitSystem;
  const activeBenchmarkNote = snap.activeBenchmark
    ? getCaliperBenchmarkNote(activeWeaponId, snap.activeBenchmark)
    : null;
  const benchmarkDeltaMm =
    activeBenchmarkNote && snap.measurement
      ? snap.measurement.distanceMm - activeBenchmarkNote.nominalMm
      : null;

  const resolvePartName = (partId: string): string => {
    const spec = plugin?.parts.find((p) => p.id === partId);
    if (!spec) return partId;
    return resolvePartCalloutLabel(spec, lang, bundle?.parts[partId]);
  };

  const handleBenchmark = (kind: CaliperBenchmarkKind) => {
    if (!plugin) return;
    const clock = playbackClock.getState();
    const isFs = fieldStripActive && mode === 'explode';
    const isFiring = mode === 'firing';
    caliperStore.applyBenchmarkPreset(
      activeWeaponId,
      kind,
      plugin.parts,
      (partId) => getCachedPartGeometry(activeWeaponId, partId),
      (part, out) => {
        if (isFs) {
          return fieldStripStore.evaluatePartPoseInto(
            activeWeaponId,
            part,
            out
          );
        }
        return evaluatePartPoseInto(
          part,
          clock.targetProgress,
          isFiring,
          clock.fireProgress,
          plugin.computeFiringKinematics,
          out
        );
      },
      _hudScratchPose
    );
  };

  return (
    <aside className="caliper-hud" aria-label={ui.badge}>
      <div className="caliper-hud-header">
        <div className="caliper-badge">
          <Ruler size={12} aria-hidden="true" />
          <span>{ui.badge}</span>
        </div>

        <div className="caliper-header-actions">
          <div
            className="caliper-unit-seg"
            role="group"
            data-testid="caliper-unit-toggle"
            aria-label={
              lang === 'en'
                ? 'Select measurement unit system'
                : '切换毫米 / 英寸计量单位'
            }
          >
            <button
              type="button"
              className={`caliper-unit-btn ${unit === 'mm' ? 'active' : ''}`}
              data-testid="caliper-unit-mm"
              aria-pressed={unit === 'mm'}
              onClick={() => caliperStore.setUnitSystem('mm')}
            >
              mm
            </button>
            <button
              type="button"
              className={`caliper-unit-btn ${unit === 'in' ? 'active' : ''}`}
              data-testid="caliper-unit-in"
              aria-pressed={unit === 'in'}
              onClick={() => caliperStore.setUnitSystem('in')}
            >
              in
            </button>
          </div>

          <button
            type="button"
            className={`caliper-mini-btn ${
              envelopeRulerVisible ? 'active' : ''
            }`}
            aria-pressed={envelopeRulerVisible}
            title={ui.envelopeRulerTitle}
            onClick={toggleEnvelopeRuler}
          >
            <BoxSelect size={12} aria-hidden="true" />
            <span>{ui.envelopeRulerBtn}</span>
          </button>

          <button
            type="button"
            className="caliper-mini-btn"
            disabled={!snap.pointA && !snap.pointB}
            title={ui.clearTitle}
            onClick={() => caliperStore.clearPoints()}
          >
            <RotateCcw size={11} aria-hidden="true" />
            <span>{ui.clearBtn}</span>
          </button>

          <button
            type="button"
            className="caliper-close-btn"
            aria-label={ui.closeTitle}
            title={ui.closeTitle}
            onClick={() => setCaliperActive(false)}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      {/* Digital Vernier Millimeter LCD Display */}
      <div className="caliper-lcd-box" role="status" aria-live="polite">
        <div className="caliper-lcd-top">
          <span className="caliper-lcd-status">
            {snap.measurement
              ? ui.lockedLabel
              : snap.pointA
                ? ui.promptPointB
                : ui.promptPointA}
          </span>
          <span
            className="caliper-lcd-value"
            ref={liveReadoutRef}
            data-testid="caliper-lcd-value"
          >
            {snap.measurement
              ? formatCaliperDistance(snap.measurement.distanceMm, unit)
              : unit === 'in'
                ? '0.00 in'
                : '0.0 mm'}
          </span>
        </div>

        {snap.measurement && (
          <div className="caliper-axis-deltas">
            <span>
              {ui.deltaX}:{' '}
              <strong>
                {formatCaliperDistance(snap.measurement.dxMm, unit)}
              </strong>
            </span>
            <span>
              {ui.deltaY}:{' '}
              <strong>
                {formatCaliperDistance(snap.measurement.dyMm, unit)}
              </strong>
            </span>
            <span>
              {ui.deltaZ}:{' '}
              <strong>
                {formatCaliperDistance(snap.measurement.dzMm, unit)}
              </strong>
            </span>
          </div>
        )}

        {activeBenchmarkNote && (
          <div
            className="caliper-benchmark-note"
            data-testid="caliper-benchmark-note"
          >
            <span className="caliper-benchmark-note-title">
              {lang === 'en'
                ? activeBenchmarkNote.labelEn
                : activeBenchmarkNote.labelZh}
            </span>
            <span className="caliper-benchmark-note-meta">
              {lang === 'en' ? 'Nominal' : '标称'}:{' '}
              <strong>
                {formatCaliperDistance(activeBenchmarkNote.nominalMm, unit)}
              </strong>
              {benchmarkDeltaMm !== null && (
                <>
                  {' '}
                  · Δ{' '}
                  <strong>
                    {formatCaliperSignedDelta(benchmarkDeltaMm, unit)}
                  </strong>
                </>
              )}
            </span>
          </div>
        )}

        {(snap.pointA || snap.pointB) && (
          <div className="caliper-jaw-tags">
            {snap.pointA && (
              <span className="caliper-jaw-pill jaw-a">
                <Crosshair size={10} aria-hidden="true" />
                <span>
                  {ui.pointALabel}: {resolvePartName(snap.pointA.partId)}
                </span>
              </span>
            )}
            {snap.pointB && (
              <span className="caliper-jaw-pill jaw-b">
                <Crosshair size={10} aria-hidden="true" />
                <span>
                  {ui.pointBLabel}: {resolvePartName(snap.pointB.partId)}
                </span>
              </span>
            )}
          </div>
        )}
      </div>

      {/* 1-Click CAD Benchmark Datum Presets */}
      <div className="caliper-benchmarks">
        <span className="caliper-bench-label">{ui.benchmarksLabel}</span>
        <div className="caliper-bench-pills">
          {CALIPER_BENCHMARK_ORDER.map((kind) => {
            const isActive = snap.activeBenchmark === kind;
            return (
              <button
                key={kind}
                type="button"
                className={`caliper-bench-btn ${isActive ? 'active' : ''}`}
                aria-pressed={isActive}
                onClick={() => handleBenchmark(kind)}
              >
                {ui.benchmarks[kind]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="caliper-footer-meta">
        <span>
          {unit === 'in'
            ? lang === 'en'
              ? '1:1 CAD Scale · 25.4 mm = 1.00 in'
              : '1:1 真实工程尺度 · 25.4 mm = 1.00 in'
            : ui.unitNote}
        </span>
        {envelopeMetrics && (
          <strong className="caliper-env-summary">
            {unit === 'in'
              ? `${lang === 'en' ? 'Envelope' : '包络'} ${convertMmToInches(envelopeMetrics.lengthMm).toFixed(1)} × ${convertMmToInches(envelopeMetrics.heightMm).toFixed(1)} × ${convertMmToInches(envelopeMetrics.widthMm).toFixed(1)} in`
              : ui.envelopeSummary(
                  envelopeMetrics.lengthMm.toFixed(0),
                  envelopeMetrics.heightMm.toFixed(0),
                  envelopeMetrics.widthMm.toFixed(0)
                )}
          </strong>
        )}
      </div>
    </aside>
  );
};

CaliperHud.displayName = 'CaliperHud';

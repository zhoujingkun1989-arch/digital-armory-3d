import React, { useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { BoxSelect, Crosshair, RotateCcw, Ruler, X } from 'lucide-react';
import {
  CALIPER_BENCHMARK_ORDER,
  type CaliperBenchmarkKind,
  WORLD_UNIT_TO_MM,
  caliperStore,
  computeWeaponEnvelopeMetrics,
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
import { useAppStore } from '../../store/useAppStore';
import { useWeaponPlugin } from '../../weapons/registry';

const _hudScratchPose = createMutablePose();

export const CaliperHud: React.FC = () => {
  const screen = useAppStore((s) => s.screen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
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
      if (liveReadoutRef.current) {
        if (hover.active) {
          const distMm =
            Math.hypot(hover.x - ax, hover.y - ay, hover.z - az) *
            WORLD_UNIT_TO_MM;
          liveReadoutRef.current.textContent = `${distMm.toFixed(1)} mm`;
        } else {
          liveReadoutRef.current.textContent = '---.- mm';
        }
      }
      rafId = window.requestAnimationFrame(tick);
    };
    rafId = window.requestAnimationFrame(tick);
    return () => window.cancelAnimationFrame(rafId);
  }, [caliperActive, snap.pointA, snap.pointB]);

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

  if (screen !== 'workbench' || !caliperActive) {
    return null;
  }

  const rawUi = UI_STRINGS[lang].caliper;
  const ui = isArcheryWeapon(activeWeaponId)
    ? { ...rawUi, ...rawUi.archery }
    : rawUi;

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
          <span className="caliper-lcd-value" ref={liveReadoutRef}>
            {snap.measurement
              ? `${snap.measurement.distanceMm.toFixed(1)} mm`
              : '0.0 mm'}
          </span>
        </div>

        {snap.measurement && (
          <div className="caliper-axis-deltas">
            <span>
              {ui.deltaX}: <strong>{snap.measurement.dxMm.toFixed(1)} mm</strong>
            </span>
            <span>
              {ui.deltaY}: <strong>{snap.measurement.dyMm.toFixed(1)} mm</strong>
            </span>
            <span>
              {ui.deltaZ}: <strong>{snap.measurement.dzMm.toFixed(1)} mm</strong>
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
        <span>{ui.unitNote}</span>
        {envelopeMetrics && (
          <strong className="caliper-env-summary">
            {ui.envelopeSummary(
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

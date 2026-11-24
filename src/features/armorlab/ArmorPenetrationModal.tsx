import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Box,
  Columns2,
  Crosshair,
  Layers,
  RotateCcw,
  Shield,
  ShieldAlert,
  ShieldCheck,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ARMOR_TARGET_SPECS,
  ARMOR_TARGET_TANK_IDS,
  ARMOR_ZONE_IDS,
  type ArmorTargetTankId,
  type ArmorZoneId,
  evaluateArmorPenetration,
  PENETRATOR_IDS,
  PENETRATOR_SPECS,
  type PenetratorId,
} from '../../engine/physics/armorPenetration';
import { useAppStore } from '../../store/useAppStore';
import { resolveArmorLabPresetForWeapon } from '../../weapons/museumMetrics';
import { ARMOR_PENETRATION_STRINGS } from './armorPenetrationStrings';
import { ArmorPenetration3DScene } from './ArmorPenetration3DScene';
import '../../styles/armor-penetration.css';

export interface ArmorPenetrationModalProps {
  onClose: () => void;
  initialProjectileId?: PenetratorId;
  initialTargetTankId?: ArmorTargetTankId;
}

export type ArmorLabViewMode = 'theater3d' | 'schematic2d' | 'split';

const SVG_CURVE_W = 540;
const SVG_CURVE_H = 152;
const PAD_L = 48;
const PAD_R = 16;
const PAD_T = 12;
const PAD_B = 28;

export const ArmorPenetrationModal: React.FC<ArmorPenetrationModalProps> = ({
  onClose,
  initialProjectileId,
  initialTargetTankId,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const launchOptions = useAppStore((s) => s.armorPenetrationLaunchOptions);
  const ui = ARMOR_PENETRATION_STRINGS[lang];
  const isZh = lang === 'zh';

  const contextualPreset = resolveArmorLabPresetForWeapon(activeWeaponId);
  const initialProjectile: PenetratorId =
    initialProjectileId ??
    launchOptions?.projectileId ??
    contextualPreset.projectileId;
  const initialTarget: ArmorTargetTankId =
    initialTargetTankId ??
    launchOptions?.targetTankId ??
    contextualPreset.targetTankId;

  const [projectileId, setProjectileId] =
    useState<PenetratorId>(initialProjectile);
  const [targetTankId, setTargetTankId] =
    useState<ArmorTargetTankId>(initialTarget);
  const [zoneId, setZoneId] = useState<ArmorZoneId>('turret_front');
  const [rangeM, setRangeM] = useState<number>(1500);
  const [obliquityDeg, setObliquityDeg] = useState<number>(15);
  const [eraEnabled, setEraEnabled] = useState<boolean>(true);
  const [viewMode, setViewMode] = useState<ArmorLabViewMode>('theater3d');

  useDialogAccessibility({
    isOpen: true,
    containerRef: dialogRef,
    onClose,
  });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    return () => {
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, []);

  const result = useMemo(
    () =>
      evaluateArmorPenetration({
        projectileId,
        targetTankId,
        zoneId,
        rangeM,
        obliquityDeg,
        eraEnabled,
      }),
    [projectileId, targetTankId, zoneId, rangeM, obliquityDeg, eraEnabled]
  );

  // Cross-section diagram geometry calculations
  const totalPhysMm = Math.max(
    1,
    result.layerBreakdown.reduce((acc, l) => acc + l.physicalMm, 0)
  );
  const stackStartX = 185;
  const stackAvailW = 240;
  const layerRects = useMemo(() => {
    const rects: Array<{
      layer: (typeof result.layerBreakdown)[number];
      x: number;
      w: number;
    }> = [];
    let nextX = stackStartX;
    for (const layer of result.layerBreakdown) {
      const w = Math.max(12, (layer.physicalMm / totalPhysMm) * stackAvailW);
      rects.push({ layer, x: nextX, w });
      nextX += w;
    }
    return rects;
  }, [result, totalPhysMm]);
  const penFrac =
    result.effectiveRhaeMm > 0
      ? Math.max(
          0.06,
          Math.min(1.18, result.penetrationDepthRhaeMm / result.effectiveRhaeMm)
        )
      : 1;
  const rodTipX =
    result.outcome === 'ricochet'
      ? stackStartX + 12
      : stackStartX + stackAvailW * penFrac;

  // Range curve scaling
  const maxCurveY = Math.max(
    900,
    result.effectiveRhaeMm * 1.15,
    result.rangeCurve[0]?.penetrationDepthRhaeMm ?? 850
  );
  const plotW = SVG_CURVE_W - PAD_L - PAD_R;
  const plotH = SVG_CURVE_H - PAD_T - PAD_B;
  const xForR = (r: number) => PAD_L + ((r - 500) / 3000) * plotW;
  const yForMm = (mm: number) =>
    PAD_T + (1 - Math.max(0, Math.min(1, mm / maxCurveY))) * plotH;

  const curvePath = result.rangeCurve
    .map(
      (pt, i) =>
        `${i === 0 ? 'M' : 'L'}${xForR(pt.rangeM).toFixed(1)},${yForMm(
          pt.penetrationDepthRhaeMm
        ).toFixed(1)}`
    )
    .join('');
  const targetLineY = yForMm(result.effectiveRhaeMm);

  const outcomeClass =
    result.outcome === 'perforation'
      ? 'is-perforation'
      : result.outcome === 'ricochet'
        ? 'is-ricochet'
        : 'is-defeated';

  const zoneHasEra = result.zone.hasEra;

  const schematicCard = (
    <div className="armor-card">
      <div className="armor-card-head">
        <span className="armor-card-head-title">
          <Shield size={13} aria-hidden="true" />
          <span>{ui.crossSectionTitle}</span>
        </span>
      </div>
      <svg
        viewBox="0 0 540 165"
        className="armor-cross-svg"
        role="img"
        aria-label={ui.crossSectionTitle}
      >
        <rect
          x="0"
          y="0"
          width="540"
          height="165"
          rx="8"
          fill="rgba(2, 6, 23, 0.55)"
        />
        {/* Draw armor stack proportionally */}
        {layerRects.map(({ layer, x, w }, idx) => (
          <g key={`${layer.nameEn}-${idx}`}>
            <rect
              x={x}
              y={24}
              width={w - 2}
              height={116}
              fill={layer.colorHex}
              fillOpacity={layer.defeated ? 0.52 : 0.9}
              stroke={
                layer.defeated ? '#f87171' : 'rgba(226,232,240,0.4)'
              }
              strokeWidth={layer.isEra ? 1.5 : 1}
            />
            {layer.isEra && (
              <line
                x1={x + 2}
                y1={30}
                x2={x + w - 4}
                y2={134}
                stroke="rgba(255,255,255,0.28)"
                strokeDasharray="3 3"
              />
            )}
          </g>
        ))}

        {/* Incoming penetrator path */}
        <line
          x1="28"
          y1={82 - Math.min(48, result.effectiveImpactAngleDeg * 0.55)}
          x2={stackStartX}
          y2="82"
          stroke="#38bdf8"
          strokeWidth="4"
          strokeLinecap="round"
        />

        {/* Inside stack / spall / ricochet path */}
        {result.outcome === 'ricochet' ? (
          <line
            x1={stackStartX}
            y1="82"
            x2={stackStartX - 65}
            y2="20"
            stroke="#22d3ee"
            strokeWidth="3.5"
            strokeDasharray="5 3"
            strokeLinecap="round"
          />
        ) : (
          <>
            <line
              x1={stackStartX}
              y1="82"
              x2={Math.min(478, rodTipX)}
              y2="82"
              stroke={
                result.outcome === 'perforation' ? '#ef4444' : '#f59e0b'
              }
              strokeWidth="5"
              strokeLinecap="round"
            />
            {result.outcome === 'perforation' && (
              <>
                <line
                  x1={stackStartX + stackAvailW}
                  y1="82"
                  x2={495}
                  y2="60"
                  stroke="#fb7185"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
                <line
                  x1={stackStartX + stackAvailW}
                  y1="82"
                  x2={495}
                  y2="104"
                  stroke="#fb7185"
                  strokeWidth="1.5"
                  strokeDasharray="3 2"
                />
              </>
            )}
          </>
        )}

        <text
          x="28"
          y="151"
          fill="#94a3b8"
          fontSize="10"
          fontFamily="monospace"
        >
          {result.projectile.code} ({result.effectiveImpactAngleDeg.toFixed(1)}°)
        </text>
        <text
          x="442"
          y="151"
          fill="#94a3b8"
          fontSize="10"
          fontFamily="monospace"
        >
          {Math.round(result.effectiveRhaeMm)} mm RHAe
        </text>
      </svg>
    </div>
  );

  const rangeCurveCard = (
    <div className="armor-card">
      <div className="armor-card-head">
        <span>{ui.rangeCurveTitle}</span>
        <div className="armor-curve-legend">
          <span className="is-pen">{ui.curveLegend.penetration}</span>
          <span className="is-req">{ui.curveLegend.targetReq}</span>
        </div>
      </div>
      <svg
        viewBox={`0 0 ${SVG_CURVE_W} ${SVG_CURVE_H}`}
        preserveAspectRatio="xMidYMid meet"
        className="armor-curve-svg"
      >
        {[0, 0.25, 0.5, 0.75, 1].map((frac) => {
          const mm = Math.round(frac * maxCurveY);
          const y = yForMm(mm);
          return (
            <g key={frac}>
              <line
                x1={PAD_L}
                y1={y}
                x2={SVG_CURVE_W - PAD_R}
                y2={y}
                stroke="rgba(148,163,184,0.16)"
              />
              <text
                x={PAD_L - 6}
                y={y + 3}
                textAnchor="end"
                fill="#94a3b8"
                fontSize="9.5"
                fontFamily="monospace"
              >
                {mm}
              </text>
            </g>
          );
        })}

        {[500, 1000, 1500, 2000, 2500, 3000, 3500].map((r) => (
          <text
            key={r}
            x={xForR(r)}
            y={SVG_CURVE_H - 7}
            textAnchor="middle"
            fill="#94a3b8"
            fontSize="9.5"
            fontFamily="monospace"
          >
            {r}m
          </text>
        ))}

        <line
          x1={PAD_L}
          y1={targetLineY}
          x2={SVG_CURVE_W - PAD_R}
          y2={targetLineY}
          stroke="#f87171"
          strokeWidth="1.5"
          strokeDasharray="5 4"
        />

        <path
          d={curvePath}
          fill="none"
          stroke="#38bdf8"
          strokeWidth="2.4"
        />

        <circle
          cx={xForR(result.rangeM)}
          cy={yForMm(result.penetrationDepthRhaeMm)}
          r={4.5}
          fill={result.outcome === 'perforation' ? '#ef4444' : '#38bdf8'}
          stroke="#0f172a"
          strokeWidth="1.5"
        />
      </svg>
    </div>
  );

  return (
    <dialog
      ref={dialogRef}
      className="armor-pen-dialog"
      data-testid="armor-penetration-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="armor-pen-shell">
        <header className="armor-pen-header">
          <div className="armor-pen-title-group">
            <span className="armor-pen-badge">{ui.badge}</span>
            <h2 id={titleId} className="armor-pen-title">
              {ui.title}
            </h2>
            <p className="armor-pen-subtitle">{ui.subtitle}</p>
          </div>
          <div className="armor-pen-header-actions">
            <button
              type="button"
              className="armor-pen-reset-btn"
              onClick={() => {
                playWorkbenchFoley('preset_detent');
                setProjectileId(initialProjectile);
                setTargetTankId(initialTarget);
                setZoneId('turret_front');
                setRangeM(1500);
                setObliquityDeg(15);
                setEraEnabled(true);
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
              <span>1500m / 15°</span>
            </button>
            <button
              type="button"
              className="armor-pen-close-btn"
              aria-label={ui.close}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="armor-pen-body">
          {/* Left Controls */}
          <aside className="armor-pen-controls">
            <div className="armor-control-group">
              <h3>{ui.penetratorHeading}</h3>
              <div className="armor-chip-list">
                {PENETRATOR_IDS.map((pid) => {
                  const spec = PENETRATOR_SPECS[pid];
                  return (
                    <button
                      key={pid}
                      type="button"
                      className={`armor-select-btn ${
                        projectileId === pid ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        playWorkbenchFoley('toggle_switch');
                        setProjectileId(pid);
                      }}
                    >
                      <strong>{spec.code}</strong>
                      <span>
                        {isZh ? spec.nameZh : spec.nameEn} ·{' '}
                        {spec.muzzleVelocityMps} m/s
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="armor-control-group">
              <h3>{ui.targetTankHeading}</h3>
              <div className="armor-grid-2">
                {ARMOR_TARGET_TANK_IDS.map((tid) => {
                  const t = ARMOR_TARGET_SPECS[tid];
                  return (
                    <button
                      key={tid}
                      type="button"
                      className={`armor-pill-btn ${
                        targetTankId === tid ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        playWorkbenchFoley('toggle_switch');
                        setTargetTankId(tid);
                      }}
                    >
                      {isZh ? t.nameZh : t.nameEn}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="armor-control-group">
              <h3>{ui.zoneHeading}</h3>
              <div className="armor-grid-2">
                {ARMOR_ZONE_IDS.map((zid) => {
                  const z = result.target.zones[zid];
                  return (
                    <button
                      key={zid}
                      type="button"
                      className={`armor-pill-btn ${
                        zoneId === zid ? 'is-active' : ''
                      }`}
                      onClick={() => {
                        playWorkbenchFoley('toggle_switch');
                        setZoneId(zid);
                      }}
                    >
                      <span>{isZh ? z.labelZh : z.labelEn}</span>
                      <small>{z.naturalSlopeDeg}°</small>
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="armor-control-group">
              <label className="armor-slider-box">
                <div className="armor-slider-head">
                  <span>{ui.rangeLabel}</span>
                  <strong className="tabular">{rangeM} m</strong>
                </div>
                <input
                  type="range"
                  min={500}
                  max={3500}
                  step={50}
                  value={rangeM}
                  onChange={(e) => setRangeM(Number(e.target.value))}
                />
              </label>

              <label className="armor-slider-box">
                <div className="armor-slider-head">
                  <span>{ui.obliquityLabel}</span>
                  <strong className="tabular">{obliquityDeg}°</strong>
                </div>
                <input
                  type="range"
                  min={0}
                  max={75}
                  step={1}
                  value={obliquityDeg}
                  onChange={(e) => setObliquityDeg(Number(e.target.value))}
                />
              </label>

              <div className="armor-era-row">
                <span>{ui.eraToggleLabel}</span>
                <button
                  type="button"
                  disabled={!zoneHasEra}
                  className={`armor-era-btn ${
                    result.eraActive ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setEraEnabled((v) => !v);
                  }}
                >
                  {!zoneHasEra
                    ? ui.eraUnavailable
                    : result.eraActive
                      ? ui.eraOn
                      : ui.eraOff}
                </button>
              </div>
            </div>
          </aside>

          {/* Right Stage */}
          <main className="armor-pen-stage">
            <div className={`armor-verdict-banner ${outcomeClass}`}>
              <div className="armor-verdict-icon">
                {result.outcome === 'perforation' ? (
                  <ShieldAlert size={20} aria-hidden="true" />
                ) : result.outcome === 'ricochet' ? (
                  <Crosshair size={20} aria-hidden="true" />
                ) : (
                  <ShieldCheck size={20} aria-hidden="true" />
                )}
              </div>
              <div className="armor-verdict-copy">
                <strong>{ui.outcomes[result.outcome].label}</strong>
                <p>{ui.outcomes[result.outcome].summary}</p>
              </div>
              <div className="armor-verdict-score tabular">
                <span>
                  {Math.round(result.penetrationDepthRhaeMm)} vs{' '}
                  {Math.round(result.effectiveRhaeMm)} mm RHAe
                </span>
                <small>
                  {result.overmatchMarginMm >= 0 ? '+' : ''}
                  {Math.round(result.overmatchMarginMm)} mm
                </small>
              </div>
            </div>

            <div className="armor-kpi-strip">
              <div className="armor-kpi-cell">
                <span>{ui.kpi.velocity}</span>
                <strong className="tabular">
                  {Math.round(result.impactVelocityMps)} m/s
                </strong>
              </div>
              <div className="armor-kpi-cell">
                <span>{ui.kpi.energy}</span>
                <strong className="tabular">
                  {result.impactEnergyMJ.toFixed(2)} MJ
                </strong>
              </div>
              <div className="armor-kpi-cell">
                <span>{ui.kpi.effectiveAngle}</span>
                <strong className="tabular">
                  {result.effectiveImpactAngleDeg.toFixed(1)}°
                </strong>
              </div>
              <div className="armor-kpi-cell">
                <span>{ui.kpi.ricochetCutoff}</span>
                <strong className="tabular">{result.ricochetAngleDeg}°</strong>
              </div>
            </div>

            {/* Stage View Mode Toggle: 3D Cutaway Theater / 2D Schematic / Split */}
            <div className="armor-view-bar">
              <span className="armor-view-bar-title">
                {viewMode === 'schematic2d'
                  ? ui.crossSectionTitle
                  : ui.theater.title}
              </span>
              <div
                className="armor-view-toggle"
                role="tablist"
                aria-label={ui.viewModes.groupAria}
              >
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'theater3d'}
                  className={`armor-view-tab ${
                    viewMode === 'theater3d' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setViewMode('theater3d');
                  }}
                >
                  <Box size={13} aria-hidden="true" />
                  <span>{ui.viewModes.theater3d}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'schematic2d'}
                  className={`armor-view-tab ${
                    viewMode === 'schematic2d' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setViewMode('schematic2d');
                  }}
                >
                  <Layers size={13} aria-hidden="true" />
                  <span>{ui.viewModes.schematic2d}</span>
                </button>
                <button
                  type="button"
                  role="tab"
                  aria-selected={viewMode === 'split'}
                  className={`armor-view-tab ${
                    viewMode === 'split' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setViewMode('split');
                  }}
                >
                  <Columns2 size={13} aria-hidden="true" />
                  <span>{ui.viewModes.split}</span>
                </button>
              </div>
            </div>

            {/* Primary Visual Stage according to active viewMode */}
            {viewMode === 'theater3d' && (
              <>
                <ArmorPenetration3DScene result={result} lang={lang} />
                {rangeCurveCard}
              </>
            )}

            {viewMode === 'schematic2d' && (
              <div className="armor-visual-grid">
                {schematicCard}
                {rangeCurveCard}
              </div>
            )}

            {viewMode === 'split' && (
              <>
                <div className="armor-split-stage">
                  <ArmorPenetration3DScene
                    result={result}
                    lang={lang}
                    compact
                  />
                  {schematicCard}
                </div>
                {rangeCurveCard}
              </>
            )}

            {/* Layer Breakdown Table */}
            <div className="armor-card">
              <div className="armor-card-head">
                <span>{ui.layerTableTitle}</span>
                <span className="tabular">
                  {Math.round(result.effectiveLosThicknessMm)} mm LOS →{' '}
                  {Math.round(result.effectiveRhaeMm)} mm RHAe
                </span>
              </div>
              <table className="armor-layer-table">
                <thead>
                  <tr>
                    <th>{ui.tableCols.layer}</th>
                    <th>{ui.tableCols.physical}</th>
                    <th>{ui.tableCols.los}</th>
                    <th>{ui.tableCols.rhae}</th>
                    <th>{ui.tableCols.status}</th>
                  </tr>
                </thead>
                <tbody>
                  {result.layerBreakdown.map((layer, idx) => (
                    <tr key={`${layer.nameEn}-${idx}`}>
                      <td>
                        <span
                          className="armor-swatch"
                          style={{ background: layer.colorHex }}
                        />
                        <span>{isZh ? layer.nameZh : layer.nameEn}</span>
                      </td>
                      <td className="tabular">
                        {Math.round(layer.physicalMm)} mm
                      </td>
                      <td className="tabular">
                        {Math.round(layer.effectiveLosMm)} mm
                      </td>
                      <td className="tabular">
                        {Math.round(layer.rhaEquivalentMm)} mm
                      </td>
                      <td>
                        <span
                          className={`armor-status-pill ${
                            result.outcome === 'ricochet'
                              ? 'is-ricochet'
                              : layer.defeated
                                ? 'is-defeated'
                                : 'is-stopped'
                          }`}
                        >
                          {result.outcome === 'ricochet'
                            ? ui.layerStatus.ricocheted
                            : layer.defeated
                              ? ui.layerStatus.defeated
                              : ui.layerStatus.stopped}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </main>
        </div>
      </div>
    </dialog>
  );
};

export default ArmorPenetrationModal;

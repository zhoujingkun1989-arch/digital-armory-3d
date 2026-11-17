import React, { useId, useMemo } from 'react';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
} from '../../engine/cartridges/cartridgeSpecs';
import {
  computeGasPortUncoverF,
  computePeakPressureF,
  computeSafeUnlockF,
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
} from '../../engine/physics/armoryPhysics';
import type { LanguageCode } from '../../narration/types';
import type {
  AssemblyGroupKey,
  CaliberProfile,
  WeaponId,
} from '../../weapons/types';
import type { ExplodedPinItem } from './explodedPinLayout';
import type { MonographEdition } from './monographCaptureStore';

const GROUP_ACCENT_DARK: Record<
  AssemblyGroupKey,
  { bg: string; border: string; text: string; line: string }
> = {
  slide: {
    bg: '#0c233a',
    border: '#38bdf8',
    text: '#e0f2fe',
    line: '#38bdf8',
  },
  frame: {
    bg: '#142620',
    border: '#34d399',
    text: '#d1fae5',
    line: '#34d399',
  },
  fire_control: {
    bg: '#33161c',
    border: '#fb7185',
    text: '#ffe4e6',
    line: '#fb7185',
  },
  magazine: {
    bg: '#31210e',
    border: '#f59e0b',
    text: '#fef3c7',
    line: '#f59e0b',
  },
};

const GROUP_ACCENT_LIGHT: Record<
  AssemblyGroupKey,
  { bg: string; border: string; text: string; line: string }
> = {
  slide: {
    bg: '#f0f9ff',
    border: '#0284c7',
    text: '#0c4a6e',
    line: '#0284c7',
  },
  frame: {
    bg: '#ecfdf5',
    border: '#059669',
    text: '#064e3b',
    line: '#059669',
  },
  fire_control: {
    bg: '#fff1f2',
    border: '#e11d48',
    text: '#881337',
    line: '#e11d48',
  },
  magazine: {
    bg: '#fffbeb',
    border: '#d97706',
    text: '#78350f',
    line: '#d97706',
  },
};

/**
 * Infinite-DPI `<svg viewBox="0 0 1920 1200">` overlay for Page 05 Full-Weapon Exploded Blueprint.
 * Draws CAD border fiducials, target anchor rings, non-crossing bent leader lines, and BOM badges.
 */
export const ExplodedPlateVectorOverlay: React.FC<{
  pins: readonly ExplodedPinItem[];
  edition: MonographEdition;
}> = ({ pins, edition }) => {
  const isBlueprint = edition === 'blueprint_manual';
  const palette = isBlueprint ? GROUP_ACCENT_LIGHT : GROUP_ACCENT_DARK;
  const gridStroke = isBlueprint
    ? 'rgba(12, 74, 110, 0.16)'
    : 'rgba(245, 158, 11, 0.18)';

  const W = 1920;
  const H = 1200;
  const badgeW = 78;
  const badgeH = 32;

  return (
    <svg
      className="monograph-exploded-svg"
      viewBox={`0 0 ${W} ${H}`}
      aria-hidden="true"
    >
      {/* Subtle CAD Fiducial Ticks & Center Axis Hairlines */}
      <line
        x1={40}
        y1={H * 0.5}
        x2={84}
        y2={H * 0.5}
        stroke={gridStroke}
        strokeWidth={1.6}
      />
      <line
        x1={W - 84}
        y1={H * 0.5}
        x2={W - 40}
        y2={H * 0.5}
        stroke={gridStroke}
        strokeWidth={1.6}
      />
      <line
        x1={W * 0.5}
        y1={16}
        x2={W * 0.5}
        y2={42}
        stroke={gridStroke}
        strokeWidth={1.6}
      />
      <line
        x1={W * 0.5}
        y1={H - 42}
        x2={W * 0.5}
        y2={H - 16}
        stroke={gridStroke}
        strokeWidth={1.6}
      />

      {pins.map((pin) => {
        const c = palette[pin.group];
        const ax = pin.anchorU * W;
        const ay = pin.anchorV * H;
        const bx = pin.badgeU * W;
        const by = pin.badgeV * H;
        const kx = pin.kneeU * W;
        const ky = pin.kneeV * H;
        const tipY = pin.rail === 'top' ? by + badgeH * 0.5 : by - badgeH * 0.5;

        return (
          <g key={pin.partId}>
            <path
              d={`M ${ax.toFixed(1)} ${ay.toFixed(1)} L ${kx.toFixed(1)} ${ky.toFixed(1)} L ${bx.toFixed(1)} ${tipY.toFixed(1)}`}
              fill="none"
              stroke={c.line}
              strokeWidth={1.85}
              strokeOpacity={0.85}
            />
            <circle
              cx={ax}
              cy={ay}
              r={5.8}
              fill={isBlueprint ? '#ffffff' : '#080c12'}
              stroke={c.border}
              strokeWidth={2}
            />
            <circle cx={ax} cy={ay} r={2.3} fill={c.border} />

            <rect
              x={bx - badgeW * 0.5}
              y={by - badgeH * 0.5}
              width={badgeW}
              height={badgeH}
              rx={6}
              fill={c.bg}
              stroke={c.border}
              strokeWidth={1.8}
            />
            <text
              x={bx}
              y={by + 1}
              textAnchor="middle"
              dominantBaseline="central"
              fill={c.text}
              fontSize={16.5}
              fontWeight={800}
              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
              letterSpacing="0.04em"
            >
              {pin.bomCode}
            </text>
          </g>
        );
      })}
    </svg>
  );
};

/**
 * Pure Vector Dual-Axis Internal Ballistics Chart (Chamber Pressure P(t) in MPa & Bore Velocity V(t) in m/s).
 */
export const BallisticsVectorChart: React.FC<{
  weaponId: WeaponId;
  caliber: CaliberProfile;
  edition: MonographEdition;
  lang: LanguageCode;
}> = ({ weaponId, caliber, edition, lang }) => {
  const gradId = useId();
  const isZh = lang === 'zh';
  const isBlueprint = edition === 'blueprint_manual';

  const spec = getCaliberBallisticsSpec(caliber);
  const timing = getWeaponFiringTiming(weaponId);
  const peakF = computePeakPressureF(caliber, timing);
  const safeUnlockF = computeSafeUnlockF(caliber, timing);
  const gasPortF = computeGasPortUncoverF(caliber, timing);

  // Zoom horizontal domain to [0..maxDomainF] so high-speed bore & blowdown dynamics fill 85% of plot
  const maxDomainF = Math.min(1, Math.max(0.58, safeUnlockF + 0.14));

  const W = 760;
  const H = 300;
  const padL = 56;
  const padR = 58;
  const padT = 30;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const pCeil = Math.ceil((spec.peakPressureMPa * 1.12) / 50) * 50;
  const vCeil = Math.ceil((spec.muzzleVelocityMps * 1.12) / 100) * 100;

  const xOf = (f: number) =>
    padL + Math.max(0, Math.min(1, f / maxDomainF)) * plotW;
  const yOfP = (p: number) =>
    padT + plotH - Math.max(0, Math.min(1, p / pCeil)) * plotH;
  const yOfV = (v: number) =>
    padT + plotH - Math.max(0, Math.min(1, v / vCeil)) * plotH;

  const { pressurePath, pressureArea, velocityPath } = useMemo(() => {
    const sample = createInternalBallisticsSample(caliber);
    const N = 220;
    const pPts: string[] = [];
    const vPts: string[] = [];
    for (let i = 0; i <= N; i++) {
      const f = (i / N) * maxDomainF;
      evaluateInternalBallisticsInto(caliber, f, sample, timing);
      const sx = xOf(f).toFixed(1);
      const syP = yOfP(sample.pressureMPa).toFixed(1);
      const syV = yOfV(sample.velocityMps).toFixed(1);
      pPts.push(`${i === 0 ? 'M' : 'L'}${sx} ${syP}`);
      vPts.push(`${i === 0 ? 'M' : 'L'}${sx} ${syV}`);
    }
    const baseY = (padT + plotH).toFixed(1);
    const pPath = pPts.join(' ');
    const pArea = `${pPath} L${(padL + plotW).toFixed(1)} ${baseY} L${padL.toFixed(1)} ${baseY} Z`;
    return {
      pressurePath: pPath,
      pressureArea: pArea,
      velocityPath: vPts.join(' '),
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [caliber, weaponId, maxDomainF, pCeil, vCeil]);

  const axisColor = isBlueprint ? '#334155' : '#94a3b8';
  const gridColor = isBlueprint
    ? 'rgba(15, 23, 42, 0.1)'
    : 'rgba(148, 163, 184, 0.16)';
  const pStroke = isBlueprint ? '#c2410c' : '#f59e0b';
  const vStroke = isBlueprint ? '#0369a1' : '#38bdf8';
  const textPrimary = isBlueprint ? '#0f172a' : '#f1f5f9';

  const ignX = xOf(timing.ignitionF);
  const peakX = xOf(peakF);
  const exitX = xOf(timing.muzzleExitF);
  const safeX = xOf(safeUnlockF);
  const gasX = gasPortF !== null ? xOf(gasPortF) : null;

  return (
    <svg
      className="monograph-vector-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        isZh
          ? `${spec.labelZh} 膛压与膛内初速定量曲线`
          : `${spec.labelEn} Chamber Pressure & Bore Velocity Curve`
      }
    >
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={pStroke} stopOpacity={0.34} />
          <stop offset="100%" stopColor={pStroke} stopOpacity={0.02} />
        </linearGradient>
      </defs>

      {/* Pressure-Locked vs Safe-Unlock Background Shading */}
      <rect
        x={ignX}
        y={padT}
        width={Math.max(0, safeX - ignX)}
        height={plotH}
        fill={
          isBlueprint ? 'rgba(220, 38, 38, 0.06)' : 'rgba(239, 68, 68, 0.1)'
        }
      />
      <rect
        x={safeX}
        y={padT}
        width={Math.max(0, padL + plotW - safeX)}
        height={plotH}
        fill={
          isBlueprint ? 'rgba(5, 150, 105, 0.07)' : 'rgba(16, 185, 129, 0.11)'
        }
      />

      {/* Horizontal Grid & Dual Y-Axis Labels */}
      {[0, 0.25, 0.5, 0.75, 1].map((t) => {
        const y = padT + plotH * (1 - t);
        const pVal = Math.round(pCeil * t);
        const vVal = Math.round(vCeil * t);
        return (
          <g key={t}>
            <line
              x1={padL}
              y1={y}
              x2={padL + plotW}
              y2={y}
              stroke={gridColor}
              strokeWidth={1}
            />
            <text
              x={padL - 7}
              y={y + 3.5}
              textAnchor="end"
              fontSize={9.5}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              fill={pStroke}
              fontWeight={700}
            >
              {pVal}
            </text>
            <text
              x={padL + plotW + 7}
              y={y + 3.5}
              textAnchor="start"
              fontSize={9.5}
              fontFamily="ui-monospace, SFMono-Regular, monospace"
              fill={vStroke}
              fontWeight={700}
            >
              {vVal}
            </text>
          </g>
        );
      })}

      {/* Axis Titles */}
      <text
        x={padL}
        y={16}
        fontSize={10}
        fontWeight={800}
        fill={pStroke}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {isZh
          ? `▲ 膛压 P(t) [MPa · ${spec.standard}]`
          : `▲ Pressure P(t) [MPa · ${spec.standard}]`}
      </text>
      <text
        x={padL + plotW}
        y={16}
        textAnchor="end"
        fontSize={10}
        fontWeight={800}
        fill={vStroke}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {isZh ? '弹头初速 V(t) [m/s] ▲' : 'Bore Velocity V(t) [m/s] ▲'}
      </text>

      {/* Event Milestone Hairlines */}
      {[
        {
          x: ignX,
          label: isZh ? '底火击发' : 'Ignition',
          color: axisColor,
          yOff: plotH - 8,
        },
        {
          x: peakX,
          label: `${spec.peakPressureMPa} MPa`,
          color: pStroke,
          yOff: 14,
        },
        ...(gasX !== null
          ? [
              {
                x: gasX,
                label: isZh ? '导气孔开启' : 'Gas Port',
                color: '#06b6d4',
                yOff: 30,
              },
            ]
          : []),
        {
          x: exitX,
          label: isZh
            ? `出膛 ${spec.muzzleVelocityMps} m/s`
            : `Exit ${spec.muzzleVelocityMps} m/s`,
          color: vStroke,
          yOff: 46,
        },
        {
          x: safeX,
          label: isZh
            ? `安全开锁 (<${spec.safeUnlockPressureMPa}MPa)`
            : `Safe Unlock (<${spec.safeUnlockPressureMPa}MPa)`,
          color: '#10b981',
          yOff: 18,
        },
      ].map((m, idx) => (
        <g key={idx}>
          <line
            x1={m.x}
            y1={padT}
            x2={m.x}
            y2={padT + plotH}
            stroke={m.color}
            strokeWidth={1.1}
            strokeDasharray="3 3"
          />
          <text
            x={m.x + 4}
            y={padT + m.yOff}
            fontSize={9}
            fontWeight={700}
            fill={m.color}
          >
            {m.label}
          </text>
        </g>
      ))}

      {/* Curves */}
      <path d={pressureArea} fill={`url(#${gradId})`} />
      <path
        d={pressurePath}
        fill="none"
        stroke={pStroke}
        strokeWidth={2.4}
        strokeLinejoin="round"
      />
      <path
        d={velocityPath}
        fill="none"
        stroke={vStroke}
        strokeWidth={2.2}
        strokeLinejoin="round"
      />

      {/* Peak Pressure Dot */}
      <circle
        cx={peakX}
        cy={yOfP(spec.peakPressureMPa)}
        r={4}
        fill={pStroke}
        stroke={isBlueprint ? '#ffffff' : '#080c12'}
        strokeWidth={1.5}
      />

      {/* Bottom X Axis */}
      <line
        x1={padL}
        y1={padT + plotH}
        x2={padL + plotW}
        y2={padT + plotH}
        stroke={axisColor}
        strokeWidth={1.2}
      />
      <text
        x={W * 0.5}
        y={H - 10}
        textAnchor="middle"
        fontSize={9.5}
        fill={textPrimary}
        opacity={0.78}
      >
        {isZh
          ? `内弹道循环相位 (膛内驻留时间 ≈ ${spec.boreTimeMs.toFixed(2)} ms · 基准枪管 ${spec.referenceBarrelMm} mm)`
          : `Internal Ballistic Cycle Phase (In-Bore Transit ≈ ${spec.boreTimeMs.toFixed(2)} ms · Ref Barrel ${spec.referenceBarrelMm} mm)`}
      </text>
    </svg>
  );
};

/**
 * Precision CAD Half-Section Schematic of the SAAMI/CIP Cartridge (`Left: Exterior`, `Right: 45° Section Cut`).
 */
export const CartridgeCutawayDiagram: React.FC<{
  caliber: CaliberProfile;
  edition: MonographEdition;
  lang: LanguageCode;
}> = ({ caliber, edition, lang }) => {
  const hatchId = useId();
  const powderId = useId();
  const isZh = lang === 'zh';
  const isBlueprint = edition === 'blueprint_manual';
  const spec = CARTRIDGE_LAB_SPECS[caliber];

  const W = 380;
  const H = 310;
  const cx = 162;
  const botY = 268;
  const topPad = 34;

  // Auto-scale cartridge height so both 9x19mm (29.7mm) and .50 BMG (138.4mm) render with crisp detail
  const availH = botY - topPad;
  const pxPerMm = Math.min(5.2, availH / spec.oalMm);

  const oalPx = spec.oalMm * pxPerMm;
  const casePx = spec.caseLengthMm * pxPerMm;
  const rimThkPx = Math.max(2.8, spec.rimThicknessMm * pxPerMm);
  const grooveTopPx = rimThkPx * 2.15;

  const rRim = (spec.rimDiameterMm * 0.5) * pxPerMm;
  const rBase = (spec.baseDiameterMm * 0.5) * pxPerMm;
  const rGroove = rBase * 0.85;
  const rShoulder =
    ((spec.shoulderDiameterMm ?? spec.neckDiameterMm) * 0.5) * pxPerMm;
  const rNeck = (spec.neckDiameterMm * 0.5) * pxPerMm;
  const rBullet = (spec.bulletDiameterMm * 0.5) * pxPerMm;

  const isBottleneck =
    spec.shoulderDiameterMm !== null &&
    spec.shoulderDiameterMm > spec.neckDiameterMm * 1.06;
  const shoulderStartPx = isBottleneck ? casePx * 0.72 : casePx * 0.92;
  const neckStartPx = isBottleneck ? casePx * 0.85 : casePx;

  const yTop = botY - oalPx;
  const yCaseMouth = botY - casePx;
  const yNeckStart = botY - neckStartPx;
  const yShoulderStart = botY - shoulderStartPx;
  const yGrooveTop = botY - grooveTopPx;
  const yRimTop = botY - rimThkPx;

  const wallThk = Math.max(2.2, rNeck * 0.16);
  const webH = Math.max(6.5, casePx * 0.12);
  const primerR = Math.min(rBase * 0.36, 9);
  const primerH = Math.min(webH * 0.74, 7.5);

  const bulletSeatDepth = Math.min(rBullet * 1.35, casePx * 0.22);
  const yBulletBase = yCaseMouth + bulletSeatDepth;
  const cavityH = Math.max(8, botY - webH - yBulletBase);
  const powderH = cavityH * spec.propellantFillRatio;
  const yPowderTop = botY - webH - powderH;

  // Left half exterior profile path
  const leftExteriorPath = [
    `M ${cx} ${botY}`,
    `L ${cx - rRim} ${botY}`,
    `L ${cx - rRim} ${yRimTop}`,
    `L ${cx - rGroove} ${yRimTop - 1.2}`,
    `L ${cx - rGroove} ${yGrooveTop}`,
    `L ${cx - rBase} ${yGrooveTop - 1.5}`,
    `L ${cx - rShoulder} ${yShoulderStart}`,
    `L ${cx - rNeck} ${yNeckStart}`,
    `L ${cx - rNeck} ${yCaseMouth}`,
    `L ${cx} ${yCaseMouth}`,
    `Z`,
  ].join(' ');

  // Left half bullet exterior ogive
  const leftBulletPath = [
    `M ${cx} ${yCaseMouth}`,
    `L ${cx - rBullet} ${yCaseMouth}`,
    `Q ${cx - rBullet} ${yTop + (yCaseMouth - yTop) * 0.42} ${cx} ${yTop}`,
    `Z`,
  ].join(' ');

  // Right half cutaway case wall
  const rightCaseWallPath = [
    `M ${cx} ${botY}`,
    `L ${cx + rRim} ${botY}`,
    `L ${cx + rRim} ${yRimTop}`,
    `L ${cx + rGroove} ${yRimTop - 1.2}`,
    `L ${cx + rGroove} ${yGrooveTop}`,
    `L ${cx + rBase} ${yGrooveTop - 1.5}`,
    `L ${cx + rShoulder} ${yShoulderStart}`,
    `L ${cx + rNeck} ${yNeckStart}`,
    `L ${cx + rNeck} ${yCaseMouth}`,
    `L ${cx + Math.max(1.5, rNeck - wallThk)} ${yCaseMouth}`,
    `L ${cx + Math.max(1.5, rNeck - wallThk)} ${yNeckStart}`,
    `L ${cx + Math.max(2, rShoulder - wallThk * 1.15)} ${yShoulderStart}`,
    `L ${cx + Math.max(2.5, rBase - wallThk * 1.5)} ${botY - webH}`,
    `L ${cx + 1.4} ${botY - webH}`,
    `L ${cx + 1.4} ${botY - primerH}`,
    `L ${cx + primerR} ${botY - primerH}`,
    `L ${cx + primerR} ${botY}`,
    `Z`,
  ].join(' ');

  // Right half bullet jacket + internal core
  const rightBulletOuterPath = [
    `M ${cx} ${yBulletBase}`,
    `L ${cx + rBullet} ${yBulletBase}`,
    `L ${cx + rBullet} ${yCaseMouth}`,
    `Q ${cx + rBullet} ${yTop + (yCaseMouth - yTop) * 0.42} ${cx} ${yTop}`,
    `Z`,
  ].join(' ');

  const rCore = Math.max(1.6, rBullet - 1.9);
  const yCoreTip = yTop + Math.max(4, (yCaseMouth - yTop) * 0.14);
  const rightCorePath = [
    `M ${cx} ${yBulletBase - 1.2}`,
    `L ${cx + rCore} ${yBulletBase - 1.2}`,
    `L ${cx + rCore} ${yCaseMouth}`,
    `Q ${cx + rCore} ${yCoreTip + (yCaseMouth - yCoreTip) * 0.44} ${cx} ${yCoreTip}`,
    `Z`,
  ].join(' ');

  const dimStroke = isBlueprint ? '#0369a1' : '#f59e0b';
  const labelFill = isBlueprint ? '#0f172a' : '#e2e8f0';
  const mutedFill = isBlueprint ? '#475569' : '#94a3b8';

  const dimOalX = cx + Math.max(rRim, rBase) + 46;
  const dimCaseX = cx - Math.max(rRim, rBase) - 34;

  return (
    <svg
      className="monograph-vector-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={isZh ? `${spec.nameZh} 纵剖工程图` : `${spec.nameEn} Cutaway Schematic`}
    >
      <defs>
        <pattern
          id={hatchId}
          width={6}
          height={6}
          patternTransform="rotate(45)"
          patternUnits="userSpaceOnUse"
        >
          <rect width={6} height={6} fill={spec.caseColor} fillOpacity={0.3} />
          <line
            x1={0}
            y1={0}
            x2={0}
            y2={6}
            stroke={isBlueprint ? '#92400e' : '#fbbf24'}
            strokeWidth={1.3}
          />
        </pattern>
        <pattern
          id={powderId}
          width={5}
          height={5}
          patternUnits="userSpaceOnUse"
        >
          <rect width={5} height={5} fill="#1e293b" />
          <circle cx={1.5} cy={1.5} r={0.9} fill="#64748b" />
          <circle cx={3.8} cy={3.6} r={0.8} fill="#94a3b8" />
        </pattern>
      </defs>

      {/* Center Datum Axis */}
      <line
        x1={cx}
        y1={14}
        x2={cx}
        y2={H - 12}
        stroke={mutedFill}
        strokeWidth={1}
        strokeDasharray="6 3 1.5 3"
      />

      {/* Propellant Charge Bed (Right Cutaway Cavity) */}
      <rect
        x={cx}
        y={yPowderTop}
        width={Math.max(2, rShoulder - wallThk * 1.25)}
        height={Math.max(2, botY - webH - yPowderTop)}
        fill={`url(#${powderId})`}
      />

      {/* Left Exterior Brass Case & Bullet */}
      <path
        d={leftExteriorPath}
        fill={spec.caseColor}
        fillOpacity={0.86}
        stroke={isBlueprint ? '#78350f' : '#fde68a'}
        strokeWidth={1.1}
      />
      <path
        d={leftBulletPath}
        fill={spec.jacketColor}
        fillOpacity={0.9}
        stroke={isBlueprint ? '#7c2d12' : '#fed7aa'}
        strokeWidth={1.1}
      />

      {/* Right Cutaway Case Wall (45° ISO Hatching) & Primer Cup */}
      <path
        d={rightCaseWallPath}
        fill={`url(#${hatchId})`}
        stroke={isBlueprint ? '#92400e' : '#f59e0b'}
        strokeWidth={1.15}
      />
      <rect
        x={cx}
        y={botY - primerH}
        width={primerR}
        height={primerH}
        fill="#cbd5e1"
        stroke="#475569"
        strokeWidth={0.9}
      />

      {/* Right Cutaway Bullet Jacket & Penetrator/Lead Core */}
      <path
        d={rightBulletOuterPath}
        fill={spec.jacketColor}
        stroke={isBlueprint ? '#7c2d12' : '#fb923c'}
        strokeWidth={1.1}
      />
      <path
        d={rightCorePath}
        fill={spec.penetratorColor}
        stroke={isBlueprint ? '#1e293b' : '#cbd5e1'}
        strokeWidth={0.85}
      />

      {/* CAD Dimension Callout: OAL (Right) */}
      <line
        x1={cx + 4}
        y1={yTop}
        x2={dimOalX + 5}
        y2={yTop}
        stroke={dimStroke}
        strokeWidth={0.85}
        strokeOpacity={0.65}
      />
      <line
        x1={cx + rRim + 3}
        y1={botY}
        x2={dimOalX + 5}
        y2={botY}
        stroke={dimStroke}
        strokeWidth={0.85}
        strokeOpacity={0.65}
      />
      <line
        x1={dimOalX}
        y1={yTop}
        x2={dimOalX}
        y2={botY}
        stroke={dimStroke}
        strokeWidth={1.2}
      />
      <text
        x={dimOalX + 7}
        y={(yTop + botY) * 0.5 - 5}
        fontSize={9.5}
        fontWeight={800}
        fill={dimStroke}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        OAL
      </text>
      <text
        x={dimOalX + 7}
        y={(yTop + botY) * 0.5 + 8}
        fontSize={10}
        fontWeight={800}
        fill={labelFill}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {spec.oalMm.toFixed(2)} mm
      </text>

      {/* CAD Dimension Callout: Case Length (Left) */}
      <line
        x1={dimCaseX - 5}
        y1={yCaseMouth}
        x2={cx - rNeck - 3}
        y2={yCaseMouth}
        stroke={mutedFill}
        strokeWidth={0.85}
      />
      <line
        x1={dimCaseX - 5}
        y1={botY}
        x2={cx - rRim - 3}
        y2={botY}
        stroke={mutedFill}
        strokeWidth={0.85}
      />
      <line
        x1={dimCaseX}
        y1={yCaseMouth}
        x2={dimCaseX}
        y2={botY}
        stroke={mutedFill}
        strokeWidth={1.1}
      />
      <text
        x={dimCaseX - 6}
        y={(yCaseMouth + botY) * 0.5 - 4}
        textAnchor="end"
        fontSize={9}
        fontWeight={700}
        fill={mutedFill}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {isZh ? '壳长' : 'CASE'}
      </text>
      <text
        x={dimCaseX - 6}
        y={(yCaseMouth + botY) * 0.5 + 8}
        textAnchor="end"
        fontSize={9.5}
        fontWeight={800}
        fill={labelFill}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {spec.caseLengthMm.toFixed(2)} mm
      </text>

      {/* Anatomy Callout Notes (Right Side) */}
      <text
        x={dimOalX + 7}
        y={yTop + 18}
        fontSize={9}
        fontWeight={700}
        fill={mutedFill}
      >
        Ø{spec.bulletDiameterMm.toFixed(2)}mm · {spec.projectileGrain}gr
      </text>
      <text
        x={dimOalX + 7}
        y={botY - 6}
        fontSize={9}
        fontWeight={700}
        fill={mutedFill}
      >
        {isZh ? '底缘' : 'Rim'} Ø{spec.rimDiameterMm.toFixed(2)}mm
      </text>

      {/* Bottom Caption */}
      <text
        x={W * 0.5}
        y={H - 12}
        textAnchor="middle"
        fontSize={9.5}
        fontWeight={700}
        fill={labelFill}
        fontFamily="ui-monospace, SFMono-Regular, monospace"
      >
        {spec.code} · {spec.standard} · {spec.propellantMassG.toFixed(2)}g (
        {Math.round(spec.propellantFillRatio * 100)}%)
      </text>
    </svg>
  );
};

/**
 * 7-Caliber Muzzle Kinetic Energy Comparison Ladder (`518 J` -> `18,050 J`).
 */
export const CaliberEnergyLadder: React.FC<{
  activeCaliber: CaliberProfile;
  lang: LanguageCode;
}> = ({ activeCaliber, lang }) => {
  const isZh = lang === 'zh';
  const maxSqrt = Math.sqrt(18050);

  return (
    <div className="monograph-energy-ladder">
      {CARTRIDGE_LAB_ORDER.map((cal) => {
        const s = CARTRIDGE_LAB_SPECS[cal];
        const isCurrent = cal === activeCaliber;
        const widthPct = Math.max(
          6,
          Math.min(100, (Math.sqrt(s.muzzleEnergyJ) / maxSqrt) * 100)
        );
        return (
          <div
            key={cal}
            className={`m-energy-row ${isCurrent ? 'is-current' : ''}`}
          >
            <span className="m-energy-code">{s.code}</span>
            <div className="m-energy-bar-track">
              <div
                className="m-energy-bar-fill"
                style={{ width: `${widthPct.toFixed(1)}%` }}
              />
            </div>
            <span className="m-energy-val">
              {s.muzzleEnergyJ.toLocaleString('en-US')} J · {s.muzzleVelocityMps}{' '}
              {isZh ? 'm/s' : 'm/s'}
            </span>
          </div>
        );
      })}
    </div>
  );
};

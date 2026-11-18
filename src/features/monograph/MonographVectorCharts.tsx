import React, { useId, useMemo } from 'react';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
  isArcheryCaliberProfile,
  type ArcheryProjectileSpec,
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
function evalArcheryChartCurve(
  meta: ArcheryProjectileSpec,
  f: number
): { forceN: number; velMps: number } {
  const exitF = meta.caliber === 'arrow_400gr' ? 0.5 : 0.48;
  const peakN = meta.peakDrawForceN;
  const holdN = peakN * (1 - meta.letOffPercent / 100);
  if (f > 0.01 && f < 0.24) {
    const u = (f - 0.01) / 0.23;
    if (u < 0.65) {
      return {
        forceN: peakN * Math.sin((u / 0.65) * (Math.PI * 0.5)),
        velMps: 0,
      };
    }
    const d = (u - 0.65) / 0.35;
    const smooth = d * d * (3 - 2 * d);
    return { forceN: peakN - (peakN - holdN) * smooth, velMps: 0 };
  }
  if (f >= 0.24 && f < 0.32) {
    return { forceN: holdN, velMps: 0 };
  }
  if (f >= 0.32 && f <= exitF) {
    const u = Math.max(0, Math.min(1, (f - 0.32) / Math.max(0.01, exitF - 0.32)));
    const hump = Math.sin(u * Math.PI);
    return {
      forceN: holdN * (1 - u) + peakN * 0.94 * Math.pow(hump, 0.85),
      velMps: meta.muzzleVelocityMps * Math.pow(Math.sin(u * Math.PI * 0.5), 0.78),
    };
  }
  return { forceN: 0, velMps: 0 };
}

export const BallisticsVectorChart: React.FC<{
  weaponId: WeaponId;
  caliber: CaliberProfile;
  edition: MonographEdition;
  lang: LanguageCode;
}> = ({ weaponId, caliber, edition, lang }) => {
  const gradId = useId();
  const isZh = lang === 'zh';
  const isBlueprint = edition === 'blueprint_manual';

  const isArchery =
    isArcheryCaliberProfile(caliber as string) ||
    (weaponId as string) === 'lift33' ||
    (weaponId as string) === 'r500';
  const archeryMeta = isArchery
    ? getArcheryProjectileMeta(
        isArcheryCaliberProfile(caliber as string)
          ? (caliber as string)
          : (weaponId as string) === 'lift33'
            ? 'arrow_400gr'
            : 'bolt_400gr'
      )
    : null;

  const spec = getCaliberBallisticsSpec(caliber);
  const hasNativeArcherySpec =
    isArchery && (spec.caliber as string) === (caliber as string);
  const timing = getWeaponFiringTiming(weaponId);
  const peakF = isArchery ? 0.16 : computePeakPressureF(caliber, timing);
  const safeUnlockF = isArchery ? 0.32 : computeSafeUnlockF(caliber, timing);
  const gasPortF = isArchery ? null : computeGasPortUncoverF(caliber, timing);
  const effectiveExitF =
    isArchery && archeryMeta
      ? archeryMeta.caliber === 'arrow_400gr'
        ? 0.5
        : 0.48
      : timing.muzzleExitF;

  // Zoom horizontal domain to [0..maxDomainF] so high-speed bore & blowdown dynamics fill 85% of plot
  const maxDomainF = isArchery
    ? Math.min(1, effectiveExitF + 0.14)
    : Math.min(1, Math.max(0.58, safeUnlockF + 0.14));

  const W = 760;
  const H = 300;
  const padL = 56;
  const padR = 58;
  const padT = 30;
  const padB = 42;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const topForceOrPressure =
    isArchery && archeryMeta
      ? hasNativeArcherySpec
        ? spec.peakPressureMPa
        : archeryMeta.peakDrawForceN
      : spec.peakPressureMPa;
  const topVelocity =
    isArchery && archeryMeta
      ? hasNativeArcherySpec
        ? spec.muzzleVelocityMps
        : archeryMeta.muzzleVelocityMps
      : spec.muzzleVelocityMps;

  const pStep = isArchery ? (topForceOrPressure > 500 ? 200 : 50) : 50;
  const vStep = isArchery ? 25 : 100;
  const pCeil = Math.ceil((topForceOrPressure * 1.14) / pStep) * pStep;
  const vCeil = Math.ceil((topVelocity * 1.14) / vStep) * vStep;

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
      let yPVal: number;
      let yVVal: number;
      if (isArchery && archeryMeta && !hasNativeArcherySpec) {
        const res = evalArcheryChartCurve(archeryMeta, f);
        yPVal = res.forceN;
        yVVal = res.velMps;
      } else {
        evaluateInternalBallisticsInto(caliber, f, sample, timing);
        yPVal = sample.pressureMPa;
        yVVal = sample.velocityMps;
      }
      const sx = xOf(f).toFixed(1);
      const syP = yOfP(yPVal).toFixed(1);
      const syV = yOfV(yVVal).toFixed(1);
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
  }, [caliber, weaponId, maxDomainF, pCeil, vCeil, isArchery, hasNativeArcherySpec]);

  const axisColor = isBlueprint ? '#334155' : '#94a3b8';
  const gridColor = isBlueprint
    ? 'rgba(15, 23, 42, 0.1)'
    : 'rgba(148, 163, 184, 0.16)';
  const pStroke = isBlueprint ? '#c2410c' : '#f59e0b';
  const vStroke = isBlueprint ? '#0369a1' : '#38bdf8';
  const textPrimary = isBlueprint ? '#0f172a' : '#f1f5f9';

  const ignX = xOf(isArchery ? 0.01 : timing.ignitionF);
  const peakX = xOf(peakF);
  const exitX = xOf(effectiveExitF);
  const safeX = xOf(safeUnlockF);
  const gasX = gasPortF !== null ? xOf(gasPortF) : null;
  const valleyX = xOf(0.24);

  return (
    <svg
      className="monograph-vector-svg"
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={
        isArchery && archeryMeta
          ? isZh
            ? `${archeryMeta.nameZh} 拉力与箭速定量曲线`
            : `${archeryMeta.nameEn} Draw-Force & Launch Velocity Curve`
          : isZh
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

      {/* Pressure-Locked vs Safe-Unlock Background Shading (or Draw vs Power-Stroke for Archery) */}
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
        width={Math.max(0, (isArchery ? exitX : padL + plotW) - safeX)}
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
        {isArchery
          ? isZh
            ? '▲ 凸轮拉力 F(x) [N · ATA / IBO]'
            : '▲ Draw Force F(x) [N · ATA / IBO]'
          : isZh
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
        {isArchery
          ? isZh
            ? '矢箭初速 V(t) [m/s] ▲'
            : 'Launch Velocity V(t) [m/s] ▲'
          : isZh
            ? '弹头初速 V(t) [m/s] ▲'
            : 'Bore Velocity V(t) [m/s] ▲'}
      </text>

      {/* Event Milestone Hairlines */}
      {(isArchery && archeryMeta
        ? [
            {
              x: peakX,
              label: `${archeryMeta.peakDrawForceN} N (${archeryMeta.peakDrawForceLb} lb)`,
              color: pStroke,
              yOff: 14,
            },
            {
              x: valleyX,
              label: isZh
                ? `${archeryMeta.letOffPercent}% 省力谷`
                : `${archeryMeta.letOffPercent}% Let-Off`,
              color: '#06b6d4',
              yOff: 30,
            },
            {
              x: safeX,
              label: isZh ? '撒放做功' : 'Release',
              color: '#10b981',
              yOff: 18,
            },
            {
              x: exitX,
              label: isZh
                ? `离弦 ${archeryMeta.velocityFps} FPS (${archeryMeta.muzzleVelocityMps} m/s)`
                : `Exit ${archeryMeta.velocityFps} FPS (${archeryMeta.muzzleVelocityMps} m/s)`,
              color: vStroke,
              yOff: 46,
            },
          ]
        : [
            {
              x: ignX,
              label: isZh ? '底火击发' : 'Ignition',
              color: axisColor,
              yOff: plotH - 18,
              align: 'end' as const,
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
          ]
      ).map((m, idx) => (
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
            x={'align' in m && m.align === 'end' ? m.x - 5 : m.x + 4}
            y={padT + m.yOff}
            textAnchor={'align' in m && m.align ? m.align : 'start'}
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

      {/* Peak Pressure / Draw Force Dot */}
      <circle
        cx={peakX}
        cy={yOfP(topForceOrPressure)}
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
        {isArchery && archeryMeta
          ? isZh
            ? `弹力蓄能与做功相位 (有效做功行程 ${archeryMeta.powerStrokeMm} mm · 弓档距 ${archeryMeta.braceHeightMm} mm · 动能 ${archeryMeta.muzzleEnergyJ.toFixed(1)} J)`
            : `Elastic Draw & Power-Stroke Cycle (Power Stroke ${archeryMeta.powerStrokeMm} mm · Brace Height ${archeryMeta.braceHeightMm} mm · KE ${archeryMeta.muzzleEnergyJ.toFixed(1)} J)`
          : isZh
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

  const archeryMeta = isArcheryCaliberProfile(caliber as string)
    ? getArcheryProjectileMeta(caliber as string)
    : null;
  if (archeryMeta) {
    const meta = archeryMeta;
    const W = 380;
    const H = 310;
    const cx = 160;
    const botY = 272;
    const topY = 30;
    const shaftStroke = isBlueprint ? '#0f172a' : '#e2e8f0';
    const dimColor = isBlueprint ? '#0369a1' : '#38bdf8';
    const textMuted = isBlueprint ? '#334155' : '#94a3b8';
    const carbonFill = isBlueprint ? '#334155' : '#1e293b';
    const bronzeFill = isBlueprint ? '#b45309' : '#d97706';
    const nockColor = '#22d3ee';

    return (
      <svg
        className="monograph-vector-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          isZh
            ? `${meta.nameZh} 纵剖工程结构图`
            : `${meta.nameEn} Cutaway Schematic`
        }
      >
        <defs>
          <pattern
            id={hatchId}
            width="5"
            height="5"
            patternTransform="rotate(45 0 0)"
            patternUnits="userSpaceOnUse"
          >
            <line
              x1="0"
              y1="0"
              x2="0"
              y2="5"
              stroke={shaftStroke}
              strokeWidth="1.2"
              strokeOpacity="0.48"
            />
          </pattern>
        </defs>

        {/* Center Axis */}
        <line
          x1={cx}
          y1={16}
          x2={cx}
          y2={botY + 14}
          stroke={dimColor}
          strokeWidth={1}
          strokeDasharray="6 3 2 3"
          opacity={0.75}
        />

        {/* Machined 3-Blade Broadhead + Brass/Aluminum Insert */}
        <polygon
          points={`${cx},${topY} ${cx - 19},${topY + 46} ${cx - 6},${topY + 46} ${cx - 6},${topY + 62} ${cx},${topY + 62}`}
          fill={isBlueprint ? '#475569' : '#94a3b8'}
          stroke={shaftStroke}
          strokeWidth={1.1}
        />
        <polygon
          points={`${cx},${topY} ${cx + 19},${topY + 46} ${cx + 6},${topY + 46} ${cx + 6},${topY + 62} ${cx},${topY + 62}`}
          fill={`url(#${hatchId})`}
          stroke={shaftStroke}
          strokeWidth={1.1}
        />
        <rect
          x={cx - 8}
          y={topY + 58}
          width={8}
          height={20}
          fill={bronzeFill}
          stroke={shaftStroke}
          strokeWidth={0.9}
        />
        <rect
          x={cx}
          y={topY + 58}
          width={8}
          height={20}
          fill={`url(#${hatchId})`}
          stroke={shaftStroke}
          strokeWidth={0.9}
        />

        {/* High-Modulus Carbon Shaft: Left Exterior / Right Micro-ID Cutaway */}
        <rect
          x={cx - 10}
          y={topY + 78}
          width={10}
          height={150}
          fill={carbonFill}
          stroke={shaftStroke}
          strokeWidth={1.1}
        />
        <rect
          x={cx}
          y={topY + 78}
          width={10}
          height={150}
          fill={`url(#${hatchId})`}
          stroke={shaftStroke}
          strokeWidth={1.1}
        />
        <rect
          x={cx + 0.5}
          y={topY + 78}
          width={5}
          height={150}
          fill={isBlueprint ? '#f8fafc' : '#090e17'}
          opacity={0.9}
        />

        {/* Helical Fletching Vanes */}
        <polygon
          points={`${cx - 10},${botY - 62} ${cx - 28},${botY - 34} ${cx - 28},${botY - 22} ${cx - 10},${botY - 22}`}
          fill={isBlueprint ? '#0284c7' : '#38bdf8'}
          fillOpacity={0.65}
          stroke={shaftStroke}
          strokeWidth={0.9}
        />
        <polygon
          points={`${cx + 10},${botY - 62} ${cx + 28},${botY - 34} ${cx + 28},${botY - 22} ${cx + 10},${botY - 22}`}
          fill={isBlueprint ? '#d97706' : '#f59e0b'}
          fillOpacity={0.65}
          stroke={shaftStroke}
          strokeWidth={0.9}
        />

        {/* Precision Collar + Half-Moon / Lighted Nock */}
        <rect
          x={cx - 10}
          y={botY - 14}
          width={20}
          height={14}
          rx={2}
          fill={nockColor}
          fillOpacity={0.8}
          stroke={shaftStroke}
          strokeWidth={1}
        />
        <circle
          cx={cx}
          cy={botY - 2}
          r={4.2}
          fill={isBlueprint ? '#ffffff' : '#080c12'}
        />

        {/* Dimension Annotations */}
        <line
          x1={cx - 46}
          y1={topY}
          x2={cx - 46}
          y2={botY}
          stroke={dimColor}
          strokeWidth={1}
        />
        <text
          x={cx - 52}
          y={(topY + botY) * 0.5}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={700}
          fill={dimColor}
          transform={`rotate(-90 ${cx - 52} ${(topY + botY) * 0.5})`}
        >
          OAL {meta.oalMm.toFixed(0)} mm
        </text>

        <g fontSize={9.5} fill={textMuted} fontFamily="ui-monospace, monospace">
          <text x={cx + 38} y={topY + 28} fontWeight={700} fill={shaftStroke}>
            {isZh ? '3刃切削机械猎箭头' : 'Fixed/Mech Broadhead'}
          </text>
          <text x={cx + 38} y={topY + 68}>
            {isZh ? '铝合金/黄铜配重插栓' : 'Brass / 7075 Insert'}
          </text>
          <text x={cx + 38} y={topY + 132} fontWeight={700} fill={shaftStroke}>
            {isZh
              ? `高模量碳纤维杆 (Ø${meta.shaftDiameterMm} mm)`
              : `Carbon Shaft (Ø${meta.shaftDiameterMm} mm OD)`}
          </text>
          <text x={cx + 38} y={topY + 148}>
            {isZh
              ? `净重 ${meta.projectileGrain} gr (${meta.projectileMassG} g)`
              : `Total Mass ${meta.projectileGrain} gr (${meta.projectileMassG} g)`}
          </text>
          <text x={cx + 38} y={botY - 40}>
            {isZh ? '3片高速螺旋尾羽' : '3x Helical Polymer Vanes'}
          </text>
          <text x={cx + 38} y={botY - 6} fontWeight={700} fill={dimColor}>
            {meta.caliber === 'bolt_400gr'
              ? isZh
                ? '半月防空放弩箭尾扣'
                : 'Ravin Clip-On Nock'
              : isZh
                ? '高分子荧光尾扣 (Micro ID)'
                : 'Micro-ID Lighted Nock'}
          </text>
        </g>

        <text
          x={W * 0.5}
          y={H - 8}
          textAnchor="middle"
          fontSize={9}
          fill={textMuted}
        >
          {isZh
            ? `左：碳箭外轮廓 · 右：45° 中轴剖切壁厚 | 初速 ${meta.velocityFps} FPS · 动能 ${meta.muzzleEnergyJ.toFixed(1)} J`
            : `Left: Carbon Exterior · Right: 45° Section Cut | ${meta.velocityFps} FPS · ${meta.muzzleEnergyJ.toFixed(1)} J`}
        </text>
      </svg>
    );
  }

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
  const archeryRow = isArcheryCaliberProfile(activeCaliber as string)
    ? getArcheryProjectileMeta(activeCaliber as string)
    : null;

  return (
    <div className="monograph-energy-ladder">
      {archeryRow ? (
        <div key={archeryRow.caliber} className="m-energy-row is-current">
          <span className="m-energy-code">{archeryRow.code}</span>
          <div className="m-energy-bar-track">
            <div
              className="m-energy-bar-fill"
              style={{
                width: `${Math.max(
                  6,
                  Math.min(100, (Math.sqrt(archeryRow.muzzleEnergyJ) / maxSqrt) * 100)
                ).toFixed(1)}%`,
              }}
            />
          </div>
          <span className="m-energy-val">
            {archeryRow.muzzleEnergyJ.toFixed(1)} J · {archeryRow.muzzleVelocityMps}{' '}
            m/s ({archeryRow.velocityFps} FPS)
          </span>
        </div>
      ) : null}
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

import React, { useId, useMemo } from 'react';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
  isArcheryCaliberProfile,
  type ArcheryProjectileSpec,
  type CartridgeLabSpec,
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

export type MonographWeaponId = WeaponId | 'm249' | 'p08' | 'vector';
export type MonographCaliberProfile = CaliberProfile | '45_acp';

interface CartridgeDiagramFallbackSpec {
  code: string;
  standard: 'SAAMI' | 'CIP' | 'NATO STANAG';
  nameZh: string;
  nameEn: string;
  caseLengthMm: number;
  oalMm: number;
  bulletDiameterMm: number;
  neckDiameterMm: number;
  shoulderDiameterMm: number | null;
  baseDiameterMm: number;
  rimDiameterMm: number;
  rimThicknessMm: number;
  propellantMassG: number;
  propellantFillRatio: number;
  projectileGrain: number;
  muzzleVelocityMps: number;
  muzzleEnergyJ: number;
  caseColor: string;
  jacketColor: string;
  penetratorColor: string;
}

const WAVE2_CARTRIDGE_FALLBACK_SPECS: Readonly<
  Record<
    '45_acp' | '357_magnum' | '12_gauge' | '30_06',
    CartridgeDiagramFallbackSpec
  >
> = {
  '45_acp': {
    code: '.45 ACP',
    standard: 'SAAMI',
    nameZh: '.45 ACP 勃朗宁大威力亚音速手枪弹 (11.43×23mm)',
    nameEn: '.45 Automatic Colt Pistol (230 gr FMJ)',
    caseLengthMm: 22.81,
    oalMm: 32.39,
    bulletDiameterMm: 11.48,
    neckDiameterMm: 12.01,
    shoulderDiameterMm: null,
    baseDiameterMm: 12.09,
    rimDiameterMm: 12.19,
    rimThicknessMm: 1.24,
    propellantMassG: 0.36,
    propellantFillRatio: 0.58,
    projectileGrain: 230,
    muzzleVelocityMps: 260,
    muzzleEnergyJ: 504,
    caseColor: '#d6a432',
    jacketColor: '#c04e18',
    penetratorColor: '#94a3b8',
  },
  '357_magnum': {
    code: '.357 Magnum',
    standard: 'SAAMI',
    nameZh: '.357 S&W 马格南转轮手枪弹',
    nameEn: '.357 S&W Magnum (158 gr JSP)',
    caseLengthMm: 32.77,
    oalMm: 40.39,
    bulletDiameterMm: 9.07,
    neckDiameterMm: 9.63,
    shoulderDiameterMm: null,
    baseDiameterMm: 9.63,
    rimDiameterMm: 11.18,
    rimThicknessMm: 1.52,
    propellantMassG: 0.94,
    propellantFillRatio: 0.82,
    projectileGrain: 158,
    muzzleVelocityMps: 385,
    muzzleEnergyJ: 760,
    caseColor: '#dbe4ef',
    jacketColor: '#c2511a',
    penetratorColor: '#94a3b8',
  },
  '12_gauge': {
    code: '12 Gauge',
    standard: 'SAAMI',
    nameZh: '12号 2¾英寸 00号军用鹿弹 (70mm)',
    nameEn: '12 Gauge 2.75" 00 Buckshot (9-Pellet)',
    caseLengthMm: 69.85,
    oalMm: 69.85,
    bulletDiameterMm: 18.53,
    neckDiameterMm: 20.05,
    shoulderDiameterMm: null,
    baseDiameterMm: 20.42,
    rimDiameterMm: 22.45,
    rimThicknessMm: 1.8,
    propellantMassG: 1.95,
    propellantFillRatio: 0.28,
    projectileGrain: 490,
    muzzleVelocityMps: 405,
    muzzleEnergyJ: 2605,
    caseColor: '#dc2626',
    jacketColor: '#e5b318',
    penetratorColor: '#64748b',
  },
  '30_06': {
    code: '.30-06',
    standard: 'SAAMI',
    nameZh: '.30-06 春田 M2 普通步枪弹 (7.62×63mm)',
    nameEn: '.30-06 Springfield M2 Ball (150 gr)',
    caseLengthMm: 63.35,
    oalMm: 84.84,
    bulletDiameterMm: 7.82,
    neckDiameterMm: 8.63,
    shoulderDiameterMm: 11.2,
    baseDiameterMm: 11.96,
    rimDiameterMm: 12.01,
    rimThicknessMm: 1.24,
    propellantMassG: 3.24,
    propellantFillRatio: 0.88,
    projectileGrain: 150,
    muzzleVelocityMps: 853,
    muzzleEnergyJ: 3536,
    caseColor: '#d6a432',
    jacketColor: '#c04e18',
    penetratorColor: '#64748b',
  },
};

function resolveCartridgeDiagramSpec(
  caliber: MonographCaliberProfile
): CartridgeDiagramFallbackSpec {
  const labMap = CARTRIDGE_LAB_SPECS as Readonly<
    Record<string, CartridgeLabSpec | undefined>
  >;
  const live = labMap[caliber];
  if (live) return live;
  if (
    caliber === '45_acp' ||
    caliber === '357_magnum' ||
    caliber === '12_gauge' ||
    caliber === '30_06'
  ) {
    return WAVE2_CARTRIDGE_FALLBACK_SPECS[caliber];
  }
  return CARTRIDGE_LAB_SPECS['556_nato'];
}

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
  weaponId: MonographWeaponId;
  caliber: MonographCaliberProfile;
  edition: MonographEdition;
  lang: LanguageCode;
}> = ({ weaponId, caliber, edition, lang }) => {
  const gradId = useId();
  const isZh = lang === 'zh';
  const isBlueprint = edition === 'blueprint_manual';
  const runtimeCaliber = caliber as CaliberProfile;
  const runtimeWeaponId = weaponId as WeaponId;

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

  const spec = getCaliberBallisticsSpec(runtimeCaliber);
  const hasNativeArcherySpec =
    isArchery && (spec.caliber as string) === (caliber as string);
  const timing = getWeaponFiringTiming(runtimeWeaponId);
  const peakF = isArchery ? 0.16 : computePeakPressureF(runtimeCaliber, timing);
  const safeUnlockF = isArchery
    ? 0.32
    : computeSafeUnlockF(runtimeCaliber, timing);
  const gasPortF = isArchery
    ? null
    : computeGasPortUncoverF(runtimeCaliber, timing);
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
    const sample = createInternalBallisticsSample(runtimeCaliber);
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
        evaluateInternalBallisticsInto(runtimeCaliber, f, sample, timing);
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
  caliber: MonographCaliberProfile;
  edition: MonographEdition;
  lang: LanguageCode;
}> = ({ caliber, edition, lang }) => {
  const hatchId = useId();
  const hullHatchId = useId();
  const powderId = useId();
  const isZh = lang === 'zh';
  const isBlueprint = edition === 'blueprint_manual';
  const caliberKey = caliber as string;

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

  const spec = resolveCartridgeDiagramSpec(caliber);

  const W = 380;
  const H = 310;
  const cx = 162;
  const botY = 268;
  const topPad = 34;
  const dimStroke = isBlueprint ? '#0369a1' : '#f59e0b';
  const labelFill = isBlueprint ? '#0f172a' : '#e2e8f0';
  const mutedFill = isBlueprint ? '#475569' : '#94a3b8';

  // Dedicated 12-Gauge Combat Shotshell Cutaway Branch (High-Brass Cup + Crimson Hull + Plastic Wad + 9× 00 Buckshot)
  if (caliberKey === '12_gauge') {
    const availH = botY - topPad;
    const pxPerMm = Math.min(3.8, availH / Math.max(58, spec.oalMm));
    const hullPx = spec.oalMm * pxPerMm;
    const yTop = botY - hullPx;
    const rimThkPx = Math.max(3.6, spec.rimThicknessMm * pxPerMm);
    const yRimTop = botY - rimThkPx;
    const brassH = hullPx * 0.27;
    const yBrassTop = botY - brassH;

    const rRim = (spec.rimDiameterMm * 0.5) * pxPerMm;
    const rHull = (spec.baseDiameterMm * 0.5) * pxPerMm;
    const hullWall = Math.max(2.6, rHull * 0.13);
    const rInner = Math.max(8, rHull - hullWall);

    const baseWadH = Math.max(10, hullPx * 0.085);
    const primerR = Math.min(rHull * 0.28, 8.2);
    const primerH = Math.min(baseWadH + 2, 11.5);
    const powderH = Math.max(18, hullPx * 0.16);
    const yPowderBottom = botY - baseWadH;
    const yPowderTop = yPowderBottom - powderH;

    const wadSkirtH = Math.max(14, hullPx * 0.11);
    const yWadCupBottom = yPowderTop - wadSkirtH;
    const yCrimpFold = yTop + Math.max(5.5, hullPx * 0.045);

    // 9× 00 Lead Buckshot Spheres (Ø8.38mm -> 3 tiers × 3 pellets inside polyethylene shot cup)
    const pelletR = Math.min((rInner - 2.2) * 0.44, Math.max(5.8, 4.19 * pxPerMm * 0.78));
    const tierSpan = Math.max(pelletR * 2.02, (yWadCupBottom - yCrimpFold - pelletR * 2.4) * 0.46);
    const tierBaseY = yWadCupBottom - pelletR - 2.5;
    const buckshotPellets: { px: number; py: number; sectioned: boolean }[] = [
      // Tier 1 (Bottom 3× 00 Buck)
      { px: cx - pelletR * 0.92, py: tierBaseY, sectioned: false },
      { px: cx + pelletR * 0.96, py: tierBaseY, sectioned: false },
      { px: cx + pelletR * 0.12, py: tierBaseY - pelletR * 0.34, sectioned: true },
      // Tier 2 (Middle 3× 00 Buck)
      { px: cx - pelletR * 0.88, py: tierBaseY - tierSpan, sectioned: false },
      { px: cx + pelletR * 0.94, py: tierBaseY - tierSpan, sectioned: false },
      { px: cx + pelletR * 0.08, py: tierBaseY - tierSpan - pelletR * 0.32, sectioned: true },
      // Tier 3 (Top 3× 00 Buck)
      { px: cx - pelletR * 0.9, py: tierBaseY - tierSpan * 2, sectioned: false },
      { px: cx + pelletR * 0.92, py: tierBaseY - tierSpan * 2, sectioned: false },
      { px: cx + pelletR * 0.1, py: tierBaseY - tierSpan * 2 - pelletR * 0.3, sectioned: true },
    ];

    const leftBrassPath = [
      `M ${cx} ${botY}`,
      `L ${cx - rRim} ${botY}`,
      `L ${cx - rRim} ${yRimTop}`,
      `L ${cx - rHull - 0.8} ${yRimTop - 0.8}`,
      `L ${cx - rHull - 0.8} ${yBrassTop}`,
      `L ${cx} ${yBrassTop}`,
      `Z`,
    ].join(' ');

    const leftHullPath = [
      `M ${cx} ${yBrassTop}`,
      `L ${cx - rHull} ${yBrassTop}`,
      `L ${cx - rHull} ${yCrimpFold}`,
      `Q ${cx - rHull} ${yTop} ${cx - rHull + 5} ${yTop}`,
      `L ${cx} ${yTop}`,
      `Z`,
    ].join(' ');

    const rightHullWallPath = [
      `M ${cx + rHull} ${yBrassTop}`,
      `L ${cx + rHull} ${yCrimpFold}`,
      `Q ${cx + rHull} ${yTop} ${cx + rHull - 5} ${yTop}`,
      `L ${cx + 2} ${yTop}`,
      `L ${cx + 2} ${yCrimpFold}`,
      `L ${cx + rInner} ${yCrimpFold}`,
      `L ${cx + rInner} ${yBrassTop}`,
      `Z`,
    ].join(' ');

    const rightBrassWallPath = [
      `M ${cx + primerR} ${botY}`,
      `L ${cx + rRim} ${botY}`,
      `L ${cx + rRim} ${yRimTop}`,
      `L ${cx + rHull + 0.8} ${yRimTop - 0.8}`,
      `L ${cx + rHull + 0.8} ${yBrassTop}`,
      `L ${cx + rInner} ${yBrassTop}`,
      `L ${cx + rInner} ${yPowderBottom}`,
      `L ${cx + primerR} ${yPowderBottom}`,
      `Z`,
    ].join(' ');

    const dimOalX = cx + rRim + 38;
    const dimBrassX = cx - rRim - 28;
    const crimsonHull = '#dc2626';
    const brassHead = '#e5b318';

    return (
      <svg
        className="monograph-vector-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          isZh ? `${spec.nameZh} 纵剖工程图` : `${spec.nameEn} Cutaway Schematic`
        }
      >
        <defs>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={6} height={6} fill={brassHead} fillOpacity={0.34} />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              stroke={isBlueprint ? '#92400e' : '#fbbf24'}
              strokeWidth={1.25}
            />
          </pattern>
          <pattern
            id={hullHatchId}
            width={5}
            height={5}
            patternTransform="rotate(-45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={5} height={5} fill={crimsonHull} fillOpacity={0.35} />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={5}
              stroke={isBlueprint ? '#991b1b' : '#f87171'}
              strokeWidth={1.2}
            />
          </pattern>
          <pattern
            id={powderId}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={5} height={5} fill="#1e293b" />
            <rect x={1} y={1} width={1.8} height={1.1} fill="#94a3b8" />
            <rect x={3} y={3.1} width={1.6} height={1.1} fill="#64748b" />
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

        {/* Right Interior Cavity Backdrop + Double-Base Flake Powder Bed */}
        <rect
          x={cx - rInner * 0.94}
          y={yCrimpFold}
          width={rInner * 1.9}
          height={yPowderBottom - yCrimpFold}
          fill={isBlueprint ? '#f8fafc' : '#0b1120'}
        />
        <rect
          x={cx}
          y={yPowderTop}
          width={rInner}
          height={powderH}
          fill={`url(#${powderId})`}
        />

        {/* One-Piece Polyethylene Shot-Cup H-Wad (Obturator Skirt + Cushion Legs + Shot Petals) */}
        <rect
          x={cx}
          y={yPowderTop - 3.5}
          width={rInner}
          height={3.5}
          fill="#e2e8f0"
          stroke="#64748b"
          strokeWidth={0.75}
        />
        <line
          x1={cx + rInner * 0.35}
          y1={yPowderTop - 3.5}
          x2={cx + rInner * 0.65}
          y2={yWadCupBottom + 3}
          stroke="#cbd5e1"
          strokeWidth={2}
        />
        <line
          x1={cx + rInner * 0.75}
          y1={yPowderTop - 3.5}
          x2={cx + rInner * 0.35}
          y2={yWadCupBottom + 3}
          stroke="#cbd5e1"
          strokeWidth={2}
        />
        <path
          d={`M ${cx - rInner + 1.5} ${yWadCupBottom + 3} L ${cx + rInner} ${yWadCupBottom + 3} L ${cx + rInner} ${yCrimpFold + 2} L ${cx + rInner - 2.3} ${yCrimpFold + 2} L ${cx + rInner - 2.3} ${yWadCupBottom} L ${cx - rInner + 1.5} ${yWadCupBottom} Z`}
          fill="#e2e8f0"
          fillOpacity={0.88}
          stroke="#64748b"
          strokeWidth={0.85}
        />

        {/* 9× 00 Antimonial Lead Buckshot Spheres (Ø8.38 mm) */}
        {buckshotPellets.map((p, idx) => (
          <g key={idx}>
            <circle
              cx={p.px}
              cy={p.py}
              r={pelletR}
              fill={p.sectioned ? `url(#${hatchId})` : '#64748b'}
              stroke={isBlueprint ? '#1e293b' : '#e2e8f0'}
              strokeWidth={1}
            />
            {!p.sectioned && (
              <circle
                cx={p.px - pelletR * 0.3}
                cy={p.py - pelletR * 0.3}
                r={pelletR * 0.28}
                fill="#cbd5e1"
                opacity={0.7}
              />
            )}
          </g>
        ))}

        {/* Left Exterior: Crimson Ribbed Polymer Hull + C26000 High-Brass Cup (Masking Left Buckshot Half) */}
        <path
          d={leftHullPath}
          fill={crimsonHull}
          fillOpacity={0.94}
          stroke={isBlueprint ? '#7f1d1d' : '#fca5a5'}
          strokeWidth={1.15}
        />
        {[0.28, 0.54, 0.78].map((u) => (
          <line
            key={u}
            x1={cx - rHull * u}
            y1={yTop + 4}
            x2={cx - rHull * u}
            y2={yBrassTop - 1}
            stroke={isBlueprint ? '#991b1b' : '#f87171'}
            strokeWidth={0.75}
            opacity={0.6}
          />
        ))}
        <path
          d={leftBrassPath}
          fill={brassHead}
          fillOpacity={0.92}
          stroke={isBlueprint ? '#78350f' : '#fde68a'}
          strokeWidth={1.15}
        />

        {/* Right 45° Sectioned Crimson Polymer Hull Wall + High-Brass Cup + 209 Primer */}
        <path
          d={rightHullWallPath}
          fill={`url(#${hullHatchId})`}
          stroke={isBlueprint ? '#991b1b' : '#f87171'}
          strokeWidth={1.1}
        />
        <path
          d={rightBrassWallPath}
          fill={`url(#${hatchId})`}
          stroke={isBlueprint ? '#92400e' : '#fbbf24'}
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
          x={dimOalX + 6}
          y={(yTop + botY) * 0.5 - 4}
          fontSize={9.5}
          fontWeight={800}
          fill={dimStroke}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {isZh ? '壳长' : 'HULL'}
        </text>
        <text
          x={dimOalX + 6}
          y={(yTop + botY) * 0.5 + 9}
          fontSize={10}
          fontWeight={800}
          fill={labelFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {spec.oalMm.toFixed(1)} mm
        </text>

        {/* Left Callout: High-Brass Head Cup */}
        <line
          x1={dimBrassX - 4}
          y1={yBrassTop}
          x2={cx - rHull - 3}
          y2={yBrassTop}
          stroke={mutedFill}
          strokeWidth={0.85}
        />
        <line
          x1={dimBrassX - 4}
          y1={botY}
          x2={cx - rRim - 3}
          y2={botY}
          stroke={mutedFill}
          strokeWidth={0.85}
        />
        <line
          x1={dimBrassX}
          y1={yBrassTop}
          x2={dimBrassX}
          y2={botY}
          stroke={mutedFill}
          strokeWidth={1.1}
        />
        <text
          x={dimBrassX - 5}
          y={(yBrassTop + botY) * 0.5 - 3}
          textAnchor="end"
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {isZh ? '高黄铜杯' : 'HIGH BRASS'}
        </text>
        <text
          x={dimBrassX - 5}
          y={(yBrassTop + botY) * 0.5 + 9}
          textAnchor="end"
          fontSize={9}
          fontWeight={800}
          fill={labelFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {isZh ? '凸缘 Ø22.5' : 'Rim Ø22.5'}
        </text>

        {/* Right Anatomy Labels */}
        <text
          x={dimOalX + 6}
          y={yTop + 18}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? '9× Ø8.4mm 00鹿弹' : '9× Ø8.4mm 00 Buck'}
        </text>
        <text
          x={dimOalX + 6}
          y={yWadCupBottom + 10}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? '一体塑料花瓣弹托' : 'Poly Shot-Cup Wad'}
        </text>
        <text
          x={dimOalX + 6}
          y={botY - 6}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? '209 霰弹底火' : '209 Primer Cup'}
        </text>

        <text
          x={W * 0.5}
          y={H - 12}
          textAnchor="middle"
          fontSize={9.5}
          fontWeight={700}
          fill={labelFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {spec.code} · {spec.standard} · {spec.projectileGrain}gr ·{' '}
          {spec.propellantMassG.toFixed(2)}g
        </text>
      </svg>
    );
  }

  // Dedicated 4.73×33mm DM11 Caseless Telescoped Cutaway Branch (8×8mm Molded HITP Block + Flush Copper Spitzer)
  if (caliberKey === '473_caseless') {
    const availH = botY - topPad;
    const pxPerMm = Math.min(6.4, availH / Math.max(30, spec.oalMm));
    const oalPx = spec.oalMm * pxPerMm;
    const blockPx = Math.min(oalPx - 3, spec.caseLengthMm * pxPerMm);
    const yTop = botY - oalPx;
    const yBlockTop = botY - blockPx;

    const halfBlockW = Math.max(16, (spec.baseDiameterMm * 0.5) * pxPerMm);
    const chamfer = Math.min(4.2, halfBlockW * 0.17);
    const rBullet = Math.max(8, (spec.bulletDiameterMm * 0.5) * pxPerMm);
    const rCore = Math.max(4.5, rBullet - 2.3);
    const rTail = Math.max(4.5, rBullet * 0.72);

    const primerH = Math.max(8, 2.0 * pxPerMm);
    const primerW = Math.min(halfBlockW * 0.56, rBullet * 0.92);
    const boosterH = Math.max(14, 4.3 * pxPerMm);
    const yPrimerTop = botY - primerH;
    const yBulletBase = Math.min(yBlockTop + blockPx * 0.8, yPrimerTop - boosterH);
    const yBoatTailTop = yBulletBase - Math.max(8, 2.8 * pxPerMm);
    const yOgiveStart = yTop + (yBulletBase - yTop) * 0.44;
    const capH = Math.max(7, 1.8 * pxPerMm);
    const yCapBot = yBlockTop + capH;

    const hitpExterior = spec.caseColor || '#a68252';
    const hitpStroke = isBlueprint ? '#713f12' : '#fcd34d';
    const capFill = isBlueprint ? '#334155' : '#475569';
    const dimOalX = cx + halfBlockW + 40;
    const dimBlockX = cx - halfBlockW - 30;

    const leftBlockPath = [
      `M ${cx} ${botY}`,
      `L ${cx - halfBlockW + chamfer} ${botY}`,
      `L ${cx - halfBlockW} ${botY - chamfer}`,
      `L ${cx - halfBlockW} ${yBlockTop + chamfer}`,
      `L ${cx - halfBlockW + chamfer} ${yBlockTop}`,
      `L ${cx} ${yBlockTop}`,
      `Z`,
    ].join(' ');

    const rightBlockSectionPath = [
      `M ${cx + primerW} ${botY}`,
      `L ${cx + halfBlockW - chamfer} ${botY}`,
      `L ${cx + halfBlockW} ${botY - chamfer}`,
      `L ${cx + halfBlockW} ${yBlockTop + chamfer}`,
      `L ${cx + halfBlockW - chamfer} ${yBlockTop}`,
      `L ${cx + rBullet + 0.8} ${yBlockTop}`,
      `L ${cx + rBullet + 0.8} ${yBoatTailTop}`,
      `L ${cx + rTail + 0.6} ${yBulletBase}`,
      `L ${cx + primerW} ${yBulletBase}`,
      `Z`,
    ].join(' ');

    const leftFlushTipPath = [
      `M ${cx} ${yBlockTop}`,
      `L ${cx - rBullet * 0.42} ${yBlockTop}`,
      `Q ${cx - rBullet * 0.24} ${yTop + (yBlockTop - yTop) * 0.42} ${cx} ${yTop}`,
      `Z`,
    ].join(' ');

    const rightBulletJacketPath = [
      `M ${cx} ${yBulletBase}`,
      `L ${cx + rTail} ${yBulletBase}`,
      `L ${cx + rBullet} ${yBoatTailTop}`,
      `L ${cx + rBullet} ${yOgiveStart}`,
      `Q ${cx + rBullet} ${yTop + (yOgiveStart - yTop) * 0.44} ${cx} ${yTop}`,
      `Z`,
    ].join(' ');

    const yCoreTip = yTop + Math.max(8, (yOgiveStart - yTop) * 0.24);
    const rightBulletCorePath = [
      `M ${cx} ${yBulletBase - 1.6}`,
      `L ${cx + Math.max(3, rTail - 1.8)} ${yBulletBase - 1.6}`,
      `L ${cx + rCore} ${yBoatTailTop}`,
      `L ${cx + rCore} ${yOgiveStart}`,
      `Q ${cx + rCore} ${yCoreTip + (yOgiveStart - yCoreTip) * 0.44} ${cx} ${yCoreTip}`,
      `Z`,
    ].join(' ');

    return (
      <svg
        className="monograph-vector-svg"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          isZh ? `${spec.nameZh} 纵剖工程图` : `${spec.nameEn} Cutaway Schematic`
        }
      >
        <defs>
          <pattern
            id={hatchId}
            width={6}
            height={6}
            patternTransform="rotate(45)"
            patternUnits="userSpaceOnUse"
          >
            <rect width={6} height={6} fill={hitpExterior} fillOpacity={0.42} />
            <line
              x1={0}
              y1={0}
              x2={0}
              y2={6}
              stroke={isBlueprint ? '#78350f' : '#d97706'}
              strokeWidth={1.2}
            />
            <circle cx={3} cy={3} r={0.75} fill={isBlueprint ? '#451a03' : '#fef3c7'} opacity={0.5} />
          </pattern>
          <pattern
            id={powderId}
            width={5}
            height={5}
            patternUnits="userSpaceOnUse"
          >
            <rect width={5} height={5} fill="#78350f" fillOpacity={0.35} />
            <circle cx={1.6} cy={1.8} r={0.85} fill="#f59e0b" />
            <circle cx={3.7} cy={3.5} r={0.8} fill="#d97706" />
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

        {/* Left Exterior: Rectangular 8x8mm Molded HITP Propellant Block */}
        <path
          d={leftBlockPath}
          fill={hitpExterior}
          fillOpacity={0.92}
          stroke={hitpStroke}
          strokeWidth={1.15}
        />
        {/* Molded Block Corner Bevel Highlight */}
        <line
          x1={cx - halfBlockW + chamfer + 2}
          y1={yBlockTop + 3}
          x2={cx - halfBlockW + chamfer + 2}
          y2={botY - 3}
          stroke={isBlueprint ? '#78350f' : '#fef3c7'}
          strokeWidth={0.85}
          opacity={0.45}
        />
        {/* Left Combustible Polymer End-Cap & Flush Copper Bullet Tip */}
        <rect
          x={cx - halfBlockW + chamfer}
          y={yBlockTop}
          width={Math.max(4, halfBlockW - chamfer)}
          height={capH}
          fill={capFill}
          fillOpacity={0.92}
          stroke={isBlueprint ? '#0f172a' : '#cbd5e1'}
          strokeWidth={0.9}
        />
        <path
          d={leftFlushTipPath}
          fill={spec.jacketColor}
          stroke={isBlueprint ? '#7c2d12' : '#fed7aa'}
          strokeWidth={1.05}
        />
        {/* Left Flush Combustible Base Primer Wafer Hint */}
        <rect
          x={cx - primerW}
          y={botY - 3.2}
          width={primerW}
          height={3.2}
          fill="#d97706"
          opacity={0.85}
        />

        {/* Right 45-Deg Section Cutaway: Solid HITP Propellant Matrix */}
        <path
          d={rightBlockSectionPath}
          fill={`url(#${hatchId})`}
          stroke={isBlueprint ? '#78350f' : '#f59e0b'}
          strokeWidth={1.15}
        />
        {/* Central Combustible Booster Pellet + Nitrocellulose Primer Wafer (Zero Brass!) */}
        <rect
          x={cx}
          y={yBulletBase}
          width={primerW}
          height={Math.max(4, yPrimerTop - yBulletBase)}
          fill={`url(#${powderId})`}
          stroke={isBlueprint ? '#78350f' : '#fbbf24'}
          strokeWidth={0.85}
        />
        <rect
          x={cx}
          y={yPrimerTop}
          width={primerW}
          height={primerH}
          fill="#ea580c"
          fillOpacity={0.85}
          stroke={isBlueprint ? '#7c2d12' : '#fdba74'}
          strokeWidth={0.9}
        />
        {/* Right Sectioned Combustible End-Cap Ring */}
        <rect
          x={cx + rBullet + 0.8}
          y={yBlockTop}
          width={Math.max(3, halfBlockW - chamfer - rBullet - 0.8)}
          height={Math.max(4, yCapBot - yBlockTop)}
          fill={capFill}
          stroke={isBlueprint ? '#0f172a' : '#cbd5e1'}
          strokeWidth={0.85}
        />

        {/* Full Telescoped 26.5mm 4.73mm Copper-Jacketed Boat-Tail Spitzer Inside Block */}
        <path
          d={rightBulletJacketPath}
          fill={spec.jacketColor}
          stroke={isBlueprint ? '#7c2d12' : '#fb923c'}
          strokeWidth={1.1}
        />
        <path
          d={rightBulletCorePath}
          fill={spec.penetratorColor}
          stroke={isBlueprint ? '#1e293b' : '#cbd5e1'}
          strokeWidth={0.85}
        />

        {/* CAD Dimension Callout: OAL (Right) */}
        <line
          x1={cx + 3}
          y1={yTop}
          x2={dimOalX + 5}
          y2={yTop}
          stroke={dimStroke}
          strokeWidth={0.85}
          strokeOpacity={0.65}
        />
        <line
          x1={cx + halfBlockW + 3}
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
          {spec.oalMm.toFixed(1)} mm
        </text>

        {/* Left Dimension Callout: Rectangular 8x8mm HITP Block */}
        <line
          x1={dimBlockX - 5}
          y1={yBlockTop}
          x2={cx - halfBlockW - 3}
          y2={yBlockTop}
          stroke={mutedFill}
          strokeWidth={0.85}
        />
        <line
          x1={dimBlockX - 5}
          y1={botY}
          x2={cx - halfBlockW - 3}
          y2={botY}
          stroke={mutedFill}
          strokeWidth={0.85}
        />
        <line
          x1={dimBlockX}
          y1={yBlockTop}
          x2={dimBlockX}
          y2={botY}
          stroke={mutedFill}
          strokeWidth={1.1}
        />
        <text
          x={dimBlockX - 6}
          y={(yBlockTop + botY) * 0.5 - 4}
          textAnchor="end"
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {isZh ? '无壳药块' : 'HITP BLOCK'}
        </text>
        <text
          x={dimBlockX - 6}
          y={(yBlockTop + botY) * 0.5 + 8}
          textAnchor="end"
          fontSize={9.2}
          fontWeight={800}
          fill={labelFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          {spec.caseLengthMm.toFixed(1)} mm
        </text>
        <text
          x={dimBlockX - 6}
          y={(yBlockTop + botY) * 0.5 + 20}
          textAnchor="end"
          fontSize={8.5}
          fontWeight={700}
          fill={mutedFill}
          fontFamily="ui-monospace, SFMono-Regular, monospace"
        >
          8.0×8.0 mm
        </text>

        {/* Right Anatomy Notes */}
        <text
          x={dimOalX + 7}
          y={yTop + 18}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? '4.73mm 埋头尖头弹' : '4.73mm Telescoped'}
        </text>
        <text
          x={dimOalX + 7}
          y={yOgiveStart + 18}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? 'HITP 固体发射药块' : 'HITP Solid Block'}
        </text>
        <text
          x={dimOalX + 7}
          y={botY - 6}
          fontSize={8.8}
          fontWeight={700}
          fill={mutedFill}
        >
          {isZh ? '可燃底火片 (零残壳)' : 'Combustible Primer'}
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
          {spec.code} · {spec.standard} · {spec.projectileGrain}gr ·{' '}
          {spec.propellantMassG.toFixed(2)}g HITP
        </text>
      </svg>
    );
  }

  // Auto-scale metallic cartridge height so .357 Mag (40.4mm), .30-06 (84.8mm) & .50 BMG (138.4mm) render crisply
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

  const isRimmedRevolver =
    caliberKey === '357_magnum' || spec.rimDiameterMm > spec.baseDiameterMm * 1.08;
  const is45Acp = caliberKey === '45_acp';
  const is3006 = caliberKey === '30_06';
  const is762Nato = caliberKey === '762_nato';
  const is9x39 = caliberKey === '9x39_subsonic';
  const is545 = caliberKey === '545_m74';
  const isSteelLacquered = is9x39 || is545;
  const isBottleneck =
    spec.shoulderDiameterMm !== null &&
    spec.shoulderDiameterMm > spec.neckDiameterMm * 1.06;
  const shoulderStartPx =
    is3006 || is762Nato
      ? casePx * 0.782
      : isBottleneck
        ? casePx * 0.72
        : casePx * 0.94;
  const neckStartPx =
    is3006 || is762Nato
      ? casePx * 0.852
      : isBottleneck
        ? casePx * 0.85
        : casePx;

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

  // Left half exterior profile path (Rimmed straight-wall for .357 Magnum vs Rimless extractor groove)
  const leftExteriorPath = isRimmedRevolver
    ? [
        `M ${cx} ${botY}`,
        `L ${cx - rRim} ${botY}`,
        `L ${cx - rRim} ${yRimTop}`,
        `L ${cx - rBase} ${yRimTop}`,
        `L ${cx - rNeck} ${yCaseMouth}`,
        `L ${cx} ${yCaseMouth}`,
        `Z`,
      ].join(' ')
    : [
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

  // Projectile ogive: Truncated flat-meplat JSP for .357 Magnum, sharp M2 spitzer for .30-06, standard ogive otherwise
  const jspMeplatR = Math.max(2.4, rBullet * 0.48);
  const yJspJacketStop = yTop + (yCaseMouth - yTop) * 0.3;

  const leftBulletPath =
    caliberKey === '357_magnum'
      ? [
          `M ${cx} ${yCaseMouth}`,
          `L ${cx - rBullet} ${yCaseMouth}`,
          `L ${cx - rBullet * 0.92} ${yJspJacketStop}`,
          `L ${cx} ${yJspJacketStop}`,
          `Z`,
        ].join(' ')
      : is45Acp
        ? [
            `M ${cx} ${yCaseMouth}`,
            `L ${cx - rBullet} ${yCaseMouth}`,
            `C ${cx - rBullet} ${yTop + (yCaseMouth - yTop) * 0.16} ${cx - rBullet * 0.56} ${yTop} ${cx} ${yTop}`,
            `Z`,
          ].join(' ')
        : is3006
          ? [
              `M ${cx} ${yCaseMouth}`,
              `L ${cx - rBullet} ${yCaseMouth}`,
              `C ${cx - rBullet} ${yCaseMouth - (yCaseMouth - yTop) * 0.46} ${cx - rBullet * 0.38} ${yTop + (yCaseMouth - yTop) * 0.24} ${cx} ${yTop}`,
              `Z`,
            ].join(' ')
          : [
              `M ${cx} ${yCaseMouth}`,
              `L ${cx - rBullet} ${yCaseMouth}`,
              `Q ${cx - rBullet} ${yTop + (yCaseMouth - yTop) * 0.42} ${cx} ${yTop}`,
              `Z`,
            ].join(' ');

  const leftExposedJspLeadPath =
    caliberKey === '357_magnum'
      ? [
          `M ${cx} ${yJspJacketStop}`,
          `L ${cx - rBullet * 0.92} ${yJspJacketStop}`,
          `L ${cx - jspMeplatR} ${yTop}`,
          `L ${cx} ${yTop}`,
          `Z`,
        ].join(' ')
      : is9x39
        ? [
            `M ${cx} ${yTop + (yCaseMouth - yTop) * 0.34}`,
            `L ${cx - rBullet * 0.56} ${yTop + (yCaseMouth - yTop) * 0.34}`,
            `Q ${cx - rBullet * 0.38} ${yTop + (yCaseMouth - yTop) * 0.14} ${cx} ${yTop}`,
            `Z`,
          ].join(' ')
        : null;

  // Right half cutaway case wall
  const rightCaseWallPath = isRimmedRevolver
    ? [
        `M ${cx} ${botY}`,
        `L ${cx + rRim} ${botY}`,
        `L ${cx + rRim} ${yRimTop}`,
        `L ${cx + rBase} ${yRimTop}`,
        `L ${cx + rNeck} ${yCaseMouth}`,
        `L ${cx + Math.max(1.5, rNeck - wallThk)} ${yCaseMouth}`,
        `L ${cx + Math.max(2.2, rBase - wallThk * 1.25)} ${botY - webH}`,
        `L ${cx + 1.4} ${botY - webH}`,
        `L ${cx + 1.4} ${botY - primerH}`,
        `L ${cx + primerR} ${botY - primerH}`,
        `L ${cx + primerR} ${botY}`,
        `Z`,
      ].join(' ')
    : [
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
  const rightBulletOuterPath =
    caliberKey === '357_magnum'
      ? [
          `M ${cx} ${yBulletBase}`,
          `L ${cx + rBullet} ${yBulletBase}`,
          `L ${cx + rBullet} ${yCaseMouth}`,
          `L ${cx + rBullet * 0.92} ${yJspJacketStop}`,
          `L ${cx} ${yJspJacketStop}`,
          `Z`,
        ].join(' ')
      : is45Acp
        ? [
            `M ${cx} ${yBulletBase}`,
            `L ${cx + rBullet} ${yBulletBase}`,
            `L ${cx + rBullet} ${yCaseMouth}`,
            `C ${cx + rBullet} ${yTop + (yCaseMouth - yTop) * 0.16} ${cx + rBullet * 0.56} ${yTop} ${cx} ${yTop}`,
            `Z`,
          ].join(' ')
        : is3006
          ? [
              `M ${cx} ${yBulletBase}`,
              `L ${cx + rBullet} ${yBulletBase}`,
              `L ${cx + rBullet} ${yCaseMouth}`,
              `C ${cx + rBullet} ${yCaseMouth - (yCaseMouth - yTop) * 0.46} ${cx + rBullet * 0.38} ${yTop + (yCaseMouth - yTop) * 0.24} ${cx} ${yTop}`,
              `Z`,
            ].join(' ')
          : [
              `M ${cx} ${yBulletBase}`,
              `L ${cx + rBullet} ${yBulletBase}`,
              `L ${cx + rBullet} ${yCaseMouth}`,
              `Q ${cx + rBullet} ${yTop + (yCaseMouth - yTop) * 0.42} ${cx} ${yTop}`,
              `Z`,
            ].join(' ');

  const rCore = Math.max(1.6, rBullet - 1.9);
  const yCoreTip = yTop + Math.max(4, (yCaseMouth - yTop) * 0.14);
  const rightCorePath =
    caliberKey === '357_magnum'
      ? [
          `M ${cx} ${yBulletBase - 1.2}`,
          `L ${cx + rCore} ${yBulletBase - 1.2}`,
          `L ${cx + rCore} ${yJspJacketStop}`,
          `L ${cx + rBullet * 0.92} ${yJspJacketStop}`,
          `L ${cx + jspMeplatR} ${yTop}`,
          `L ${cx} ${yTop}`,
          `Z`,
        ].join(' ')
      : is3006
        ? [
            `M ${cx} ${yBulletBase - 1.2}`,
            `L ${cx + rCore} ${yBulletBase - 1.2}`,
            `L ${cx + rCore} ${yCaseMouth}`,
            `C ${cx + rCore} ${yCaseMouth - (yCaseMouth - yCoreTip) * 0.46} ${cx + rCore * 0.36} ${yCoreTip + (yCaseMouth - yCoreTip) * 0.24} ${cx} ${yCoreTip}`,
            `Z`,
          ].join(' ')
        : [
            `M ${cx} ${yBulletBase - 1.2}`,
            `L ${cx + rCore} ${yBulletBase - 1.2}`,
            `L ${cx + rCore} ${yCaseMouth}`,
            `Q ${cx + rCore} ${yCoreTip + (yCaseMouth - yCoreTip) * 0.44} ${cx} ${yCoreTip}`,
            `Z`,
          ].join(' ');

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

      {/* Left Exterior Brass/Nickel Case & Bullet (+ JSP Exposed Lead Nose / .357 Cannelure / .30-06 Annealed Neck) */}
      <path
        d={leftExteriorPath}
        fill={spec.caseColor}
        fillOpacity={0.88}
        stroke={
          caliberKey === '357_magnum' || isSteelLacquered
            ? isBlueprint
              ? '#475569'
              : '#cbd5e1'
            : isBlueprint
              ? '#78350f'
              : '#fde68a'
        }
        strokeWidth={1.1}
      />
      {caliberKey === '357_magnum' && (
        <line
          x1={cx - rBase}
          y1={botY - casePx * 0.56}
          x2={cx}
          y2={botY - casePx * 0.56}
          stroke={isBlueprint ? '#64748b' : '#94a3b8'}
          strokeWidth={1.2}
          strokeDasharray="1.8 1.2"
        />
      )}
      {(is3006 || is762Nato) && (
        <polygon
          points={`${cx},${yCaseMouth} ${cx - rNeck},${yCaseMouth} ${cx - rNeck},${yNeckStart} ${cx - rShoulder},${yShoulderStart} ${cx},${yShoulderStart}`}
          fill="#b45309"
          fillOpacity={0.22}
        />
      )}
      <path
        d={leftBulletPath}
        fill={spec.jacketColor}
        fillOpacity={0.9}
        stroke={isBlueprint ? '#7c2d12' : '#fed7aa'}
        strokeWidth={1.1}
      />
      {leftExposedJspLeadPath && (
        <path
          d={leftExposedJspLeadPath}
          fill={spec.penetratorColor}
          stroke={isBlueprint ? '#334155' : '#e2e8f0'}
          strokeWidth={1.0}
        />
      )}
      {(is3006 || is545) && (
        <line
          x1={cx - rBullet}
          y1={yCaseMouth}
          x2={cx + rBullet}
          y2={yCaseMouth}
          stroke="#dc2626"
          strokeWidth={1.3}
          opacity={0.75}
        />
      )}

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
 * 7->10 Caliber Muzzle Kinetic Energy Comparison Ladder (`513 J` -> `18,050 J`).
 */
export const CaliberEnergyLadder: React.FC<{
  activeCaliber: MonographCaliberProfile;
  lang: LanguageCode;
}> = ({ activeCaliber, lang }) => {
  const isZh = lang === 'zh';
  const maxSqrt = Math.sqrt(18050);
  const activeKey = activeCaliber as string;
  const archeryRow = isArcheryCaliberProfile(activeKey)
    ? getArcheryProjectileMeta(activeKey)
    : null;
  const isRegisteredLabCaliber = (
    CARTRIDGE_LAB_ORDER as readonly string[]
  ).includes(activeKey);
  const pendingWave2Spec =
    !archeryRow &&
    !isRegisteredLabCaliber &&
    (activeKey === '357_magnum' ||
      activeKey === '12_gauge' ||
      activeKey === '30_06')
      ? WAVE2_CARTRIDGE_FALLBACK_SPECS[activeKey]
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
      {pendingWave2Spec ? (
        <div key={activeKey} className="m-energy-row is-current">
          <span className="m-energy-code">{pendingWave2Spec.code}</span>
          <div className="m-energy-bar-track">
            <div
              className="m-energy-bar-fill"
              style={{
                width: `${Math.max(
                  6,
                  Math.min(
                    100,
                    (Math.sqrt(pendingWave2Spec.muzzleEnergyJ) / maxSqrt) * 100
                  )
                ).toFixed(1)}%`,
              }}
            />
          </div>
          <span className="m-energy-val">
            {pendingWave2Spec.muzzleEnergyJ.toLocaleString('en-US')} J ·{' '}
            {pendingWave2Spec.muzzleVelocityMps} {isZh ? 'm/s' : 'm/s'}
          </span>
        </div>
      ) : null}
      {CARTRIDGE_LAB_ORDER.map((cal) => {
        const s = CARTRIDGE_LAB_SPECS[cal];
        const isCurrent = (cal as string) === activeKey;
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

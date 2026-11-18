import React, { useId, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowUpRight,
  Compass,
  Crosshair,
  Gauge,
  RotateCcw,
  Table2,
  Wind,
  Zap,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ALLOWED_MAX_RANGES_M,
  ALLOWED_ZERO_RANGES_M,
  BALLISTICS_RANGE_PRESETS,
  buildDopeCardRows,
  computeAtmosphere,
  computeBallisticSolution,
  DEFAULT_DOPE_RANGES_M,
  EXTERNAL_PROJECTILE_ORDER,
  EXTERNAL_PROJECTILE_SPECS,
  interpolateTrajectoryAt,
  normalizeExternalProjectileId,
  type BallisticSolution,
  type ExternalProjectileId,
  type ExternalProjectileInput,
  type MaxRangeOptionM,
  type TrajectorySample,
  type ZeroRangeOptionM,
} from '../../engine/physics/externalBallistics';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { isWeaponId } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';
import {
  EXTERNAL_BALLISTICS_STRINGS,
  WAVE2_WEAPON_LABELS,
} from './externalBallisticsStrings';
import '../../styles/external-ballistics.css';

const MAX_ACTIVE_PROJECTILES = 4;

type SecondaryChartMode = 'wind' | 'velocity' | 'energy';
type EnergyScaleMode = 'linear' | 'sqrt';
type ReticleIllumMode = 'etched' | 'red' | 'cyan';
type DopeUnitMode = 'both' | 'mil' | 'moa';

const DARK_SLOT_PALETTE = ['#38bdf8', '#f59e0b', '#34d399', '#fb7185'] as const;

const LIGHT_SLOT_PALETTE = [
  '#0284c7',
  '#d97706',
  '#059669',
  '#e11d48',
] as const;

export interface ExternalBallisticsViewProps {
  /** Optional initial caliber to highlight when opening from Armory or Cartridge Lab */
  initialCaliber?: ExternalProjectileInput;
  /** Optional custom back navigation callback (falls back to store `returnToArmory`) */
  onBack?: () => void;
  /** Optional custom 3D workbench jump callback (falls back to store `enterWorkbench`) */
  onInspectWeapon?: (weaponId: string) => void;
}

const SVG_W = 760;
const DROP_SVG_H = 276;
const SEC_SVG_H = 248;
const PAD_L = 58;
const PAD_R = 24;
const PAD_T = 20;
const PAD_B = 34;

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function formatSigned(val: number, digits = 1): string {
  if (Math.abs(val) < Math.pow(10, -(digits + 1))) {
    return (0).toFixed(digits);
  }
  return `${val > 0 ? '+' : ''}${val.toFixed(digits)}`;
}

function formatDropShort(dropCm: number): string {
  if (Math.abs(dropCm) >= 200) {
    return `${formatSigned(dropCm / 100, 2)} m`;
  }
  return `${formatSigned(dropCm, 1)} cm`;
}

function formatEnergyShort(energyJ: number): string {
  if (energyJ >= 1000) {
    return `${Math.round(energyJ).toLocaleString('en-US')} J`;
  }
  return `${energyJ.toFixed(energyJ < 100 ? 1 : 0)} J`;
}

function niceStepCeiling(rawMax: number): number {
  if (rawMax <= 0) return 10;
  const exp = Math.pow(10, Math.floor(Math.log10(rawMax)));
  const norm = rawMax / exp;
  if (norm <= 1.2) return 1.2 * exp;
  if (norm <= 1.5) return 1.5 * exp;
  if (norm <= 2) return 2 * exp;
  if (norm <= 2.5) return 2.5 * exp;
  if (norm <= 3) return 3 * exp;
  if (norm <= 4) return 4 * exp;
  if (norm <= 5) return 5 * exp;
  if (norm <= 6) return 6 * exp;
  if (norm <= 8) return 8 * exp;
  return 10 * exp;
}

/** De-collides vertical Y coordinates of stacked cursor callout badges inside `[minY, maxY]`. */
function decollideBadgeYs(
  rawYs: readonly number[],
  minGap: number,
  minY: number,
  maxY: number
): number[] {
  const indexed = rawYs.map((y, idx) => ({
    idx,
    y: clamp(y, minY, maxY),
  }));
  indexed.sort((a, b) => a.y - b.y);

  for (let i = 1; i < indexed.length; i++) {
    if (indexed[i].y - indexed[i - 1].y < minGap) {
      indexed[i].y = indexed[i - 1].y + minGap;
    }
  }
  if (indexed.length > 0 && indexed[indexed.length - 1].y > maxY) {
    indexed[indexed.length - 1].y = maxY;
    for (let i = indexed.length - 2; i >= 0; i--) {
      if (indexed[i + 1].y - indexed[i].y < minGap) {
        indexed[i].y = Math.max(minY, indexed[i + 1].y - minGap);
      }
    }
  }

  const out = new Array<number>(rawYs.length);
  for (const item of indexed) {
    out[item.idx] = item.y;
  }
  return out;
}

export const ExternalBallisticsView: React.FC<ExternalBallisticsViewProps> = ({
  initialCaliber,
  onBack,
  onInspectWeapon,
}) => {
  const rawUid = useId().replace(/:/g, '');
  const dropClipId = `eb-drop-clip-${rawUid}`;
  const secClipId = `eb-sec-clip-${rawUid}`;
  const scopeClipId = `eb-scope-clip-${rawUid}`;
  const dopeSectionRef = useRef<HTMLElement>(null);

  const lang = useAppStore((s) => s.lang);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const storeBallisticsCaliber = useAppStore((s) => s.activeBallisticsCaliber);
  const setActiveBallisticsCaliber = useAppStore(
    (s) => s.setActiveBallisticsCaliber
  );
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);

  const isLightTheme = environmentPreset === 'blueprint_daylight';
  const palette = isLightTheme ? LIGHT_SLOT_PALETTE : DARK_SLOT_PALETTE;
  const ui = EXTERNAL_BALLISTICS_STRINGS[lang];
  const isZh = lang === 'zh';

  // Resolve initial preset & projectile selection
  const resolvedInitialCaliber = initialCaliber ?? storeBallisticsCaliber;
  const defaultPreset = BALLISTICS_RANGE_PRESETS[0];
  const initialProjectiles = useMemo<ExternalProjectileId[]>(() => {
    if (!resolvedInitialCaliber) {
      return [...defaultPreset.projectiles];
    }
    const normalized = normalizeExternalProjectileId(resolvedInitialCaliber);
    const matchingPreset = BALLISTICS_RANGE_PRESETS.find((p) =>
      p.projectiles.includes(normalized)
    );
    if (matchingPreset) {
      return [...matchingPreset.projectiles];
    }
    return [normalized, '9mm_para', '556_nato', '30_06'].slice(
      0,
      MAX_ACTIVE_PROJECTILES
    ) as ExternalProjectileId[];
  }, [resolvedInitialCaliber, defaultPreset.projectiles]);

  const [activeProjectiles, setActiveProjectiles] =
    useState<ExternalProjectileId[]>(initialProjectiles);
  const [focusedProjectile, setFocusedProjectile] =
    useState<ExternalProjectileId>(() =>
      resolvedInitialCaliber
        ? normalizeExternalProjectileId(resolvedInitialCaliber)
        : initialProjectiles[0]
    );

  const [maxRangeM, setMaxRangeM] = useState<MaxRangeOptionM>(() => {
    if (!resolvedInitialCaliber) return defaultPreset.maxRangeM;
    const norm = normalizeExternalProjectileId(resolvedInitialCaliber);
    const match = BALLISTICS_RANGE_PRESETS.find((p) =>
      p.projectiles.includes(norm)
    );
    return match ? match.maxRangeM : 300;
  });
  const [zeroRangeM, setZeroRangeM] = useState<ZeroRangeOptionM>(() => {
    if (!resolvedInitialCaliber) return defaultPreset.zeroRangeM;
    const norm = normalizeExternalProjectileId(resolvedInitialCaliber);
    const match = BALLISTICS_RANGE_PRESETS.find((p) =>
      p.projectiles.includes(norm)
    );
    return match
      ? match.zeroRangeM
      : EXTERNAL_PROJECTILE_SPECS[norm].recommendedZeroM;
  });
  const [sightHeightCm, setSightHeightCm] = useState<number>(
    defaultPreset.sightHeightCm
  );
  const [windSpeedMps, setWindSpeedMps] = useState<number>(
    defaultPreset.crosswindMps
  );
  const [windSign, setWindSign] = useState<1 | -1>(1);
  const [altitudeM, setAltitudeM] = useState<number>(0);
  const [tempC, setTempC] = useState<number>(15);

  const [scrubRangeM, setScrubRangeM] = useState<number>(() =>
    Math.round(defaultPreset.maxRangeM * 0.6)
  );
  const [secondaryMode, setSecondaryMode] =
    useState<SecondaryChartMode>('wind');
  const [energyScale, setEnergyScale] = useState<EnergyScaleMode>('sqrt');
  const [reticleIllum, setReticleIllum] = useState<ReticleIllumMode>('etched');
  const [dopeUnitMode, setDopeUnitMode] = useState<DopeUnitMode>('both');

  // Derive valid focused projectile directly without cascading useEffect setState
  const effectiveFocusedProjectile: ExternalProjectileId =
    activeProjectiles.includes(focusedProjectile)
      ? focusedProjectile
      : activeProjectiles[0];

  // Keep scrubRangeM inside [2..maxRangeM]
  const effectiveScrubM = clamp(scrubRangeM, 2, maxRangeM);
  const signedCrosswindMps = windSpeedMps * windSign;

  const atmosphere = useMemo(
    () => computeAtmosphere(altitudeM, tempC),
    [altitudeM, tempC]
  );

  const solutions = useMemo<BallisticSolution[]>(
    () =>
      activeProjectiles.map((id) =>
        computeBallisticSolution(id, {
          maxRangeM,
          zeroRangeM,
          sightHeightCm,
          crosswindMps: signedCrosswindMps,
          altitudeM,
          tempC,
        })
      ),
    [
      activeProjectiles,
      maxRangeM,
      zeroRangeM,
      sightHeightCm,
      signedCrosswindMps,
      altitudeM,
      tempC,
    ]
  );

  const focusedIdx = Math.max(
    0,
    solutions.findIndex((s) => s.projectileId === effectiveFocusedProjectile)
  );
  const focusedSolution = solutions[focusedIdx] ?? solutions[0];

  const scrubSamples = useMemo<(TrajectorySample | null)[]>(
    () => solutions.map((sol) => interpolateTrajectoryAt(sol, effectiveScrubM)),
    [solutions, effectiveScrubM]
  );

  const focusedSample = scrubSamples[focusedIdx] ?? null;

  // DOPE table rows for the focused projectile (includes 25m when zeroed at 25m + 50..1000m)
  const dopeRanges = useMemo<readonly number[]>(
    () =>
      zeroRangeM === 25
        ? [25, ...DEFAULT_DOPE_RANGES_M]
        : DEFAULT_DOPE_RANGES_M,
    [zeroRangeM]
  );

  const dopeRows = useMemo(
    () =>
      focusedSolution ? buildDopeCardRows(focusedSolution, dopeRanges) : [],
    [focusedSolution, dopeRanges]
  );

  // Detect active preset badge highlight
  const activePresetId = useMemo(() => {
    for (const p of BALLISTICS_RANGE_PRESETS) {
      if (
        p.projectiles.length === activeProjectiles.length &&
        p.projectiles.every((cal, idx) => cal === activeProjectiles[idx])
      ) {
        return p.id;
      }
    }
    return null;
  }, [activeProjectiles]);

  const handleApplyPreset = (presetId: string) => {
    const preset = BALLISTICS_RANGE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    playWorkbenchFoley('preset_detent');
    const nextList = [...preset.projectiles];
    setActiveProjectiles(nextList);
    setFocusedProjectile(nextList[0]);
    setActiveBallisticsCaliber(nextList[0]);
    setMaxRangeM(preset.maxRangeM);
    setZeroRangeM(preset.zeroRangeM);
    setSightHeightCm(preset.sightHeightCm);
    setWindSpeedMps(preset.crosswindMps);
    setWindSign(1);
    setScrubRangeM(Math.round(preset.maxRangeM * 0.6));
  };

  const handleToggleProjectileChip = (id: ExternalProjectileId) => {
    playWorkbenchFoley('part_select');
    const exists = activeProjectiles.includes(id);
    if (exists) {
      if (activeProjectiles.length <= 1) {
        setFocusedProjectile(id);
        setActiveBallisticsCaliber(id);
        return;
      }
      const nextList = activeProjectiles.filter((item) => item !== id);
      setActiveProjectiles(nextList);
      if (effectiveFocusedProjectile === id && nextList.length > 0) {
        setFocusedProjectile(nextList[0]);
        setActiveBallisticsCaliber(nextList[0]);
      }
      return;
    }
    setActiveProjectiles((prev) => {
      const next =
        prev.length >= MAX_ACTIVE_PROJECTILES
          ? [...prev.slice(0, MAX_ACTIVE_PROJECTILES - 1), id]
          : [...prev, id];
      return next;
    });
    setFocusedProjectile(id);
    setActiveBallisticsCaliber(id);
  };

  const handleChangeMaxRange = (nextMax: MaxRangeOptionM) => {
    playWorkbenchFoley('toggle_switch');
    setMaxRangeM(nextMax);
    setScrubRangeM((prev) =>
      prev > nextMax || prev < nextMax * 0.15 ? Math.round(nextMax * 0.6) : prev
    );
  };

  const handleResetEnvironment = () => {
    playWorkbenchFoley('preset_detent');
    setAltitudeM(0);
    setTempC(15);
    setWindSpeedMps(4.5);
    setWindSign(1);
  };

  const handleBackClick = () => {
    playWorkbenchFoley('toggle_switch');
    if (onBack) {
      onBack();
    } else {
      returnToArmory();
    }
  };

  const handleWeaponJump = (wId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    playWorkbenchFoley('preset_detent');
    if (onInspectWeapon) {
      onInspectWeapon(wId);
    } else if (isWeaponId(wId)) {
      enterWorkbench(wId, 'firing');
    }
  };

  const handleDopeRowClick = (targetRangeM: number) => {
    playWorkbenchFoley('part_select');
    if (targetRangeM > maxRangeM) {
      const fitRange =
        ALLOWED_MAX_RANGES_M.find((r) => r >= targetRangeM) ?? 1000;
      setMaxRangeM(fitRange);
    }
    setScrubRangeM(targetRangeM);
  };

  const handleChartPointerScrub = (e: React.PointerEvent<SVGSVGElement>) => {
    if (
      e.pointerType === 'mouse' &&
      e.buttons === 0 &&
      e.type !== 'pointermove'
    ) {
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    if (rect.width <= 0) return;
    const svgX = ((e.clientX - rect.left) / rect.width) * SVG_W;
    const plotW = SVG_W - PAD_L - PAD_R;
    const u = clamp((svgX - PAD_L) / plotW, 0, 1);
    const rawRange = u * maxRangeM;
    const snap = maxRangeM >= 600 ? 5 : 1;
    const snapped = clamp(Math.round(rawRange / snap) * snap, 2, maxRangeM);
    setScrubRangeM(snapped);
  };

  // ==========================================================================
  // Chart 1 Geometry: Side-Profile Bullet Drop Trajectory Y(x)
  // ==========================================================================
  const dropChart = useMemo(() => {
    const plotW = SVG_W - PAD_L - PAD_R;
    const plotH = DROP_SVG_H - PAD_T - PAD_B;

    let globalMaxCm = 12;
    const minDrops: number[] = [];
    for (const sol of solutions) {
      let solMin = 0;
      for (const s of sol.samples) {
        if (s.rangeM <= maxRangeM) {
          if (s.dropCm > globalMaxCm) globalMaxCm = s.dropCm;
          if (s.dropCm < solMin) solMin = s.dropCm;
        }
      }
      minDrops.push(solMin);
    }

    const sortedMins = [...minDrops].sort((a, b) => b - a); // shallowest (closest to 0) first
    let displayMinCm =
      sortedMins.length > 0 ? sortedMins[sortedMins.length - 1] : -50;
    let isClamped = false;

    // Prevent extreme subsonic plunge at 600–1000m from squashing flat rifle curves
    if (sortedMins.length >= 2) {
      const refIdx = Math.min(sortedMins.length - 2, 1);
      const refDeep = Math.min(-35, sortedMins[refIdx]);
      if (displayMinCm < refDeep * 4.5 && displayMinCm < -500) {
        displayMinCm = refDeep * 2.4;
        isClamped = true;
      }
    }

    const yTopCm = Math.max(15, niceStepCeiling(globalMaxCm * 1.18));
    const yBotCm = -Math.max(
      25,
      niceStepCeiling(Math.abs(displayMinCm) * 1.08)
    );
    const ySpanCm = Math.max(1, yTopCm - yBotCm);
    const useMetersAxis = ySpanCm > 380;

    const xToPx = (rM: number) => PAD_L + (rM / maxRangeM) * plotW;
    const yToPx = (cm: number) => PAD_T + ((yTopCm - cm) / ySpanCm) * plotH;

    const yTicks: { cm: number; py: number; label: string }[] = [];
    for (let i = 0; i <= 5; i++) {
      const cm = yBotCm + (ySpanCm * i) / 5;
      yTicks.push({
        cm,
        py: yToPx(cm),
        label: useMetersAxis
          ? `${(cm / 100).toFixed(1)}m`
          : `${Math.round(cm)}`,
      });
    }

    const paths = solutions.map((sol, idx) => {
      let d = '';
      for (let i = 0; i < sol.samples.length; i++) {
        const pt = sol.samples[i];
        if (pt.rangeM > maxRangeM + 0.1) break;
        const px = xToPx(pt.rangeM);
        const py = yToPx(pt.dropCm);
        d += `${i === 0 ? 'M' : 'L'}${px.toFixed(1)},${py.toFixed(1)}`;
      }

      let mach1Marker: { px: number; py: number; rangeM: number } | null = null;
      if (
        sol.transonicRangeM !== null &&
        sol.transonicRangeM <= sol.effectiveMaxRangeM &&
        sol.transonicRangeM <= maxRangeM
      ) {
        const mSample = interpolateTrajectoryAt(sol, sol.transonicRangeM);
        if (mSample && mSample.dropCm >= yBotCm) {
          mach1Marker = {
            px: xToPx(sol.transonicRangeM),
            py: yToPx(mSample.dropCm),
            rangeM: sol.transonicRangeM,
          };
        }
      }

      return {
        projectileId: sol.projectileId,
        code: sol.spec.code,
        color: palette[idx % palette.length],
        d,
        mach1Marker,
      };
    });

    return {
      plotW,
      plotH,
      yTopCm,
      yBotCm,
      useMetersAxis,
      isClamped,
      losPy: clamp(yToPx(0), PAD_T, PAD_T + plotH),
      zeroPx: zeroRangeM <= maxRangeM ? xToPx(zeroRangeM) : null,
      scrubPx: xToPx(effectiveScrubM),
      yTicks,
      paths,
      xToPx,
      yToPx,
    };
  }, [solutions, maxRangeM, zeroRangeM, effectiveScrubM, palette]);

  // ==========================================================================
  // Chart 2 Geometry: Switchable Wind Drift Z(x) | Velocity V(x) | Energy Ek(x)
  // ==========================================================================
  const secondaryChart = useMemo(() => {
    const plotW = SVG_W - PAD_L - PAD_R;
    const plotH = SEC_SVG_H - PAD_T - PAD_B;
    const xToPx = (rM: number) => PAD_L + (rM / maxRangeM) * plotW;

    if (secondaryMode === 'wind') {
      let maxAbsCm = 12;
      for (const sol of solutions) {
        for (const s of sol.samples) {
          if (s.rangeM <= maxRangeM) {
            const spreadCm = s.patternSpreadRadiusMm / 10;
            const ext = Math.abs(s.windDriftCm) + spreadCm;
            if (ext > maxAbsCm) maxAbsCm = ext;
          }
        }
      }
      const boundCm = niceStepCeiling(maxAbsCm * 1.14);
      const useMeters = boundCm >= 250;
      // Top-down firing lane: +Z (right downwind) maps downward on screen, -Z upward
      const valToPy = (zCm: number) =>
        PAD_T + ((zCm + boundCm) / (2 * boundCm)) * plotH;

      const yTicks = [-1, -0.5, 0, 0.5, 1].map((frac) => {
        const cm = frac * boundCm;
        return {
          py: valToPy(cm),
          label: useMeters
            ? `${formatSigned(cm / 100, 2)}m`
            : `${formatSigned(cm, Math.abs(cm) < 10 && cm !== 0 ? 1 : 0)}cm`,
        };
      });

      let buckshotConePath: string | null = null;
      const buckSol = solutions.find((s) => s.spec.pelletCount > 1);
      if (buckSol) {
        const upperPts: string[] = [];
        const lowerPts: string[] = [];
        for (const pt of buckSol.samples) {
          if (pt.rangeM > maxRangeM + 0.1) break;
          const px = xToPx(pt.rangeM).toFixed(1);
          const rCm = pt.patternSpreadRadiusMm / 10;
          upperPts.push(`${px},${valToPy(pt.windDriftCm - rCm).toFixed(1)}`);
          lowerPts.unshift(`${px},${valToPy(pt.windDriftCm + rCm).toFixed(1)}`);
        }
        if (upperPts.length > 1) {
          buckshotConePath = `M${upperPts.join('L')}L${lowerPts.join('L')}Z`;
        }
      }

      const paths = solutions.map((sol, idx) => {
        let d = '';
        for (let i = 0; i < sol.samples.length; i++) {
          const pt = sol.samples[i];
          if (pt.rangeM > maxRangeM + 0.1) break;
          d += `${i === 0 ? 'M' : 'L'}${xToPx(pt.rangeM).toFixed(1)},${valToPy(
            pt.windDriftCm
          ).toFixed(1)}`;
        }
        return {
          projectileId: sol.projectileId,
          color: palette[idx % palette.length],
          d,
        };
      });

      return {
        mode: 'wind' as const,
        plotW,
        plotH,
        yTicks,
        zeroPy: valToPy(0),
        sonicPy: null as number | null,
        transonicBand: null as { y0: number; h: number } | null,
        buckshotConePath,
        paths,
        scrubPx: xToPx(effectiveScrubM),
        samplePy: (s: TrajectorySample) => valToPy(s.windDriftCm),
        sampleBadge: (s: TrajectorySample) =>
          Math.abs(s.windDriftCm) >= 150
            ? `${formatSigned(s.windDriftCm / 100, 2)}m`
            : `${formatSigned(s.windDriftCm, 1)}cm`,
      };
    }

    if (secondaryMode === 'velocity') {
      let maxVel = atmosphere.speedOfSoundMps * 1.25;
      for (const sol of solutions) {
        if (sol.spec.muzzleVelocityMps > maxVel) {
          maxVel = sol.spec.muzzleVelocityMps;
        }
      }
      const vTop = niceStepCeiling(maxVel * 1.08);
      const valToPy = (v: number) => PAD_T + (1 - v / vTop) * plotH;

      const yTicks = [0, 0.25, 0.5, 0.75, 1].map((frac) => {
        const v = frac * vTop;
        return {
          py: valToPy(v),
          label: `${Math.round(v)}`,
        };
      });

      const yM12 = clamp(
        valToPy(atmosphere.speedOfSoundMps * 1.2),
        PAD_T,
        PAD_T + plotH
      );
      const yM085 = clamp(
        valToPy(atmosphere.speedOfSoundMps * 0.85),
        PAD_T,
        PAD_T + plotH
      );

      const paths = solutions.map((sol, idx) => {
        let d = '';
        for (let i = 0; i < sol.samples.length; i++) {
          const pt = sol.samples[i];
          if (pt.rangeM > maxRangeM + 0.1) break;
          d += `${i === 0 ? 'M' : 'L'}${xToPx(pt.rangeM).toFixed(1)},${valToPy(
            pt.velocityMps
          ).toFixed(1)}`;
        }
        return {
          projectileId: sol.projectileId,
          color: palette[idx % palette.length],
          d,
        };
      });

      return {
        mode: 'velocity' as const,
        plotW,
        plotH,
        yTicks,
        zeroPy: null as number | null,
        sonicPy: valToPy(atmosphere.speedOfSoundMps),
        transonicBand: { y0: yM12, h: Math.max(0, yM085 - yM12) },
        buckshotConePath: null as string | null,
        paths,
        scrubPx: xToPx(effectiveScrubM),
        samplePy: (s: TrajectorySample) => valToPy(s.velocityMps),
        sampleBadge: (s: TrajectorySample) =>
          `${Math.round(s.velocityMps)} m/s`,
      };
    }

    // Energy mode ('linear' | 'sqrt')
    let maxE = 500;
    for (const sol of solutions) {
      if (sol.spec.muzzleEnergyJ > maxE) {
        maxE = sol.spec.muzzleEnergyJ;
      }
    }
    const eTop = niceStepCeiling(maxE * 1.08);
    const mapNorm = (eJ: number) =>
      energyScale === 'sqrt'
        ? Math.sqrt(Math.max(0, eJ) / eTop)
        : Math.max(0, eJ) / eTop;
    const valToPy = (eJ: number) => PAD_T + (1 - mapNorm(eJ)) * plotH;

    const yTicks = [0, 0.25, 0.5, 0.75, 1].map((u) => {
      const eVal = energyScale === 'sqrt' ? u * u * eTop : u * eTop;
      return {
        py: valToPy(eVal),
        label:
          eVal >= 1000
            ? `${(eVal / 1000).toFixed(eVal >= 10000 ? 0 : 1)}k`
            : `${Math.round(eVal)}`,
      };
    });

    const paths = solutions.map((sol, idx) => {
      let d = '';
      for (let i = 0; i < sol.samples.length; i++) {
        const pt = sol.samples[i];
        if (pt.rangeM > maxRangeM + 0.1) break;
        d += `${i === 0 ? 'M' : 'L'}${xToPx(pt.rangeM).toFixed(1)},${valToPy(
          pt.energyJ
        ).toFixed(1)}`;
      }
      return {
        projectileId: sol.projectileId,
        color: palette[idx % palette.length],
        d,
      };
    });

    return {
      mode: 'energy' as const,
      plotW,
      plotH,
      yTicks,
      zeroPy: null as number | null,
      sonicPy: null as number | null,
      transonicBand: null as { y0: number; h: number } | null,
      buckshotConePath: null as string | null,
      paths,
      scrubPx: xToPx(effectiveScrubM),
      samplePy: (s: TrajectorySample) => valToPy(s.energyJ),
      sampleBadge: (s: TrajectorySample) => formatEnergyShort(s.energyJ),
    };
  }, [
    secondaryMode,
    energyScale,
    solutions,
    maxRangeM,
    effectiveScrubM,
    atmosphere.speedOfSoundMps,
    palette,
  ]);

  // ==========================================================================
  // Optical FFP Christmas-Tree Scope Reticle Geometry
  // ==========================================================================
  const reticleGeo = useMemo(() => {
    const cx = 160;
    const cy = 160;
    const lensR = 148;

    const reqElev = focusedSample ? Math.abs(focusedSample.holdoverMil) : 3;
    const reqWind = focusedSample
      ? Math.abs(focusedSample.windageMil) * 1.2
      : 1;
    const reqMax = Math.max(reqElev, reqWind, 2.5);

    let fovMil = 6;
    let majorStep = 1;
    let labelStep = 2;
    if (reqMax > 54) {
      fovMil = 140;
      majorStep = 20;
      labelStep = 40;
    } else if (reqMax > 22) {
      fovMil = 60;
      majorStep = 10;
      labelStep = 20;
    } else if (reqMax > 10.8) {
      fovMil = 25;
      majorStep = 5;
      labelStep = 5;
    } else if (reqMax > 5.2) {
      fovMil = 12;
      majorStep = 2;
      labelStep = 2;
    }

    const pxPerMil = 128 / fovMil;

    const treeRows: number[] = [];
    for (let m = majorStep; m <= fovMil - majorStep * 0.4; m += majorStep) {
      treeRows.push(m);
    }

    const pips = solutions
      .map((sol, idx) => {
        const s = scrubSamples[idx];
        if (!s) return null;
        const clampedWind = clamp(s.windageMil, -fovMil * 1.06, fovMil * 1.06);
        const clampedElev = clamp(s.holdoverMil, -fovMil * 0.9, fovMil * 1.06);
        const spreadMil = s.rangeM > 0 ? s.patternSpreadRadiusMm / s.rangeM : 0;
        return {
          projectileId: sol.projectileId,
          code: sol.spec.code,
          color: palette[idx % palette.length],
          isFocused: sol.projectileId === focusedSolution?.projectileId,
          px: cx + clampedWind * pxPerMil,
          py: cy + clampedElev * pxPerMil,
          spreadPx: spreadMil * pxPerMil,
          holdoverMil: s.holdoverMil,
          windageMil: s.windageMil,
        };
      })
      .filter((item): item is NonNullable<typeof item> => item !== null);

    return {
      cx,
      cy,
      lensR,
      fovMil,
      majorStep,
      labelStep,
      pxPerMil,
      treeRows,
      pips,
    };
  }, [solutions, scrubSamples, focusedSample, focusedSolution, palette]);

  // Pre-compute de-collided cursor callout badge Ys for both charts
  const activeDropDots = scrubSamples
    .map((s, idx) =>
      s
        ? {
            idx,
            code: solutions[idx].spec.code,
            color: palette[idx % palette.length],
            py: clamp(
              dropChart.yToPx(s.dropCm),
              PAD_T + 4,
              PAD_T + dropChart.plotH - 4
            ),
            text: `${solutions[idx].spec.code}: ${formatDropShort(s.dropCm)}`,
          }
        : null
    )
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const dropBadgeYs = decollideBadgeYs(
    activeDropDots.map((d) => d.py),
    17,
    PAD_T + 10,
    PAD_T + dropChart.plotH - 8
  );

  const activeSecDots = scrubSamples
    .map((s, idx) =>
      s
        ? {
            idx,
            color: palette[idx % palette.length],
            py: clamp(
              secondaryChart.samplePy(s),
              PAD_T + 4,
              PAD_T + secondaryChart.plotH - 4
            ),
            text: `${solutions[idx].spec.code}: ${secondaryChart.sampleBadge(s)}`,
          }
        : null
    )
    .filter((d): d is NonNullable<typeof d> => d !== null);

  const secBadgeYs = decollideBadgeYs(
    activeSecDots.map((d) => d.py),
    17,
    PAD_T + 10,
    PAD_T + secondaryChart.plotH - 8
  );

  const windSummaryText = `${windSpeedMps.toFixed(1)} m/s (${
    windSign > 0 ? '+Z' : '-Z'
  })`;

  const reticleStrokeColor =
    reticleIllum === 'red'
      ? '#ef4444'
      : reticleIllum === 'cyan'
        ? '#22d3ee'
        : 'var(--eb-reticle-line)';

  const xTickFractions = [0, 0.2, 0.4, 0.6, 0.8, 1];

  return (
    <div className="eb-lab-screen" data-testid="external-ballistics-view">
      {/* ==================== Top Exhibition Header ==================== */}
      <header className="eb-header">
        <div className="eb-brand-cluster">
          <button
            type="button"
            className="back-armory-btn"
            onClick={handleBackClick}
            title={ui.backTitle}
          >
            <ArrowLeft size={14} aria-hidden="true" />
            <span>{ui.backBtn}</span>
          </button>

          <span className="eb-badge">{ui.badge}</span>
          <div className="eb-title-wrap">
            <h1 className="eb-title">{ui.title}</h1>
            <p className="eb-subtitle">{ui.subtitle}</p>
          </div>
        </div>

        <div className="eb-header-actions">
          <StudioEnvironmentBar compact />
          <LanguageSwitchPill compact />
          <button
            type="button"
            className="eb-dope-jump-btn"
            title={ui.dopeJumpTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              dopeSectionRef.current?.scrollIntoView({ behavior: 'smooth' });
            }}
          >
            <Table2 size={13} aria-hidden="true" />
            <span>{ui.dopeJumpBtn}</span>
          </button>
        </div>
      </header>

      {/* ==================== Showdown Presets & 13-Projectile Selector Deck ==================== */}
      <section className="eb-selector-deck">
        <div className="eb-presets-row">
          <div className="eb-presets-left">
            <span className="eb-section-kicker">{ui.presetsLabel}</span>
            {BALLISTICS_RANGE_PRESETS.map((preset) => {
              const isAct = activePresetId === preset.id;
              return (
                <button
                  key={preset.id}
                  type="button"
                  className={`eb-preset-pill ${isAct ? 'is-active' : ''}`}
                  aria-pressed={isAct}
                  title={isZh ? preset.subtitleZh : preset.subtitleEn}
                  onClick={() => handleApplyPreset(preset.id)}
                >
                  <span>{isZh ? preset.labelZh : preset.labelEn}</span>
                </button>
              );
            })}
          </div>

          <div className="eb-isa-cluster">
            <span className="eb-isa-pill">
              <Gauge size={12} aria-hidden="true" />
              <span>
                {ui.isaReadout(
                  atmosphere.airDensityKgM3.toFixed(3),
                  (atmosphere.densityRatio * 100).toFixed(1),
                  atmosphere.speedOfSoundMps.toFixed(1),
                  atmosphere.pressureHPa.toFixed(1)
                )}
              </span>
            </span>

            <button
              type="button"
              className="eb-reset-btn"
              title={ui.resetEnvTitle}
              onClick={handleResetEnvironment}
            >
              <RotateCcw size={11} aria-hidden="true" />
              <span>{ui.resetEnvBtn}</span>
            </button>
          </div>
        </div>

        <div className="eb-caliber-strip-head">
          <span className="eb-section-kicker">
            {ui.projectilesLabel(
              activeProjectiles.length,
              MAX_ACTIVE_PROJECTILES
            )}
          </span>
          <span className="eb-slot-hint">{ui.slotLimitHint}</span>
        </div>

        <div className="eb-caliber-grid">
          {EXTERNAL_PROJECTILE_ORDER.map((id) => {
            const spec = EXTERNAL_PROJECTILE_SPECS[id];
            const slotIdx = activeProjectiles.indexOf(id);
            const isSelected = slotIdx !== -1;
            const isFocused = isSelected && focusedProjectile === id;
            const slotColor = isSelected
              ? palette[slotIdx % palette.length]
              : undefined;

            return (
              <button
                key={id}
                type="button"
                className={`eb-caliber-chip ${isSelected ? 'is-selected' : ''} ${
                  isFocused ? 'is-focused' : ''
                }`}
                aria-pressed={isSelected}
                style={
                  slotColor
                    ? ({
                        '--chip-slot-color': slotColor,
                      } as React.CSSProperties)
                    : undefined
                }
                title={`${isZh ? spec.nameZh : spec.nameEn} · ${
                  isZh ? spec.loadLabelZh : spec.loadLabelEn
                }`}
                onClick={() => handleToggleProjectileChip(id)}
              >
                <span className="eb-chip-dot" aria-hidden="true" />
                <div className="eb-chip-body">
                  <span className="eb-chip-code">{spec.code}</span>
                  <span className="eb-chip-meta">
                    {spec.muzzleVelocityMps} m/s · {spec.dragModel}{' '}
                    {spec.bc.toFixed(3)}
                  </span>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* ==================== Environmental & Range Control Console ==================== */}
      <section className="eb-controls-bar">
        {/* 1. Max Range */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.maxRangeLabel}</span>
            <span className="eb-ctrl-val">{maxRangeM} m</span>
          </div>
          <div className="eb-seg-row">
            {ALLOWED_MAX_RANGES_M.map((r) => (
              <button
                key={r}
                type="button"
                className={`eb-seg-btn ${maxRangeM === r ? 'is-active' : ''}`}
                aria-pressed={maxRangeM === r}
                onClick={() => handleChangeMaxRange(r)}
              >
                {r}m
              </button>
            ))}
          </div>
        </div>

        {/* 2. Zero Distance */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.zeroRangeLabel}</span>
            <span className="eb-ctrl-val">{zeroRangeM} m</span>
          </div>
          <div className="eb-seg-row">
            {ALLOWED_ZERO_RANGES_M.map((z) => (
              <button
                key={z}
                type="button"
                className={`eb-seg-btn ${zeroRangeM === z ? 'is-active' : ''}`}
                aria-pressed={zeroRangeM === z}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setZeroRangeM(z);
                }}
              >
                {z}m
              </button>
            ))}
          </div>
        </div>

        {/* 3. Sight Height */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.sightHeightLabel}</span>
            <span className="eb-ctrl-val">{sightHeightCm.toFixed(1)} cm</span>
          </div>
          <div className="eb-seg-row">
            {[
              { val: 4.8, label: ui.sightStdShort },
              { val: 6.2, label: ui.sightHighShort },
            ].map((opt) => (
              <button
                key={opt.val}
                type="button"
                className={`eb-seg-btn ${
                  Math.abs(sightHeightCm - opt.val) < 0.05 ? 'is-active' : ''
                }`}
                aria-pressed={Math.abs(sightHeightCm - opt.val) < 0.05}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setSightHeightCm(opt.val);
                }}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* 4. 90° Crosswind */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.crosswindLabel}</span>
            <span className="eb-ctrl-val">
              {formatSigned(signedCrosswindMps, 1)} m/s
            </span>
          </div>
          <div className="eb-slider-row">
            <input
              type="range"
              className="eb-range-input"
              aria-label={ui.crosswindLabel}
              min={0}
              max={15}
              step={0.5}
              value={windSpeedMps}
              onChange={(e) => setWindSpeedMps(Number(e.target.value))}
            />
            <button
              type="button"
              className="eb-wind-dir-btn"
              title={ui.windDirToggleTitle}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setWindSign((prev) => (prev === 1 ? -1 : 1));
              }}
            >
              {windSign > 0 ? ui.windLeftToRight : ui.windRightToLeft}
            </button>
          </div>
        </div>

        {/* 5. Altitude */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.altitudeLabel}</span>
            <span className="eb-ctrl-val">{altitudeM} m</span>
          </div>
          <div className="eb-slider-row">
            <input
              type="range"
              className="eb-range-input"
              aria-label={ui.altitudeLabel}
              min={0}
              max={3000}
              step={50}
              value={altitudeM}
              onChange={(e) => setAltitudeM(Number(e.target.value))}
            />
          </div>
        </div>

        {/* 6. Ambient Temperature */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.temperatureLabel}</span>
            <span className="eb-ctrl-val">
              {tempC > 0 ? `+${tempC}` : tempC} °C
            </span>
          </div>
          <div className="eb-slider-row">
            <input
              type="range"
              className="eb-range-input"
              aria-label={ui.temperatureLabel}
              min={-20}
              max={45}
              step={1}
              value={tempC}
              onChange={(e) => setTempC(Number(e.target.value))}
            />
          </div>
        </div>

        {/* 7. Synchronized Target Cursor Scrubber */}
        <div className="eb-ctrl-group">
          <div className="eb-ctrl-head">
            <span>{ui.targetScrubLabel}</span>
            <span className="eb-ctrl-val">{effectiveScrubM} m</span>
          </div>
          <div className="eb-slider-row">
            <input
              type="range"
              className="eb-range-input"
              aria-label={ui.targetScrubLabel}
              min={5}
              max={maxRangeM}
              step={maxRangeM >= 600 ? 5 : 1}
              value={effectiveScrubM}
              onChange={(e) => setScrubRangeM(Number(e.target.value))}
            />
          </div>
        </div>
      </section>

      {/* ==================== Main 2-Column Workspace ==================== */}
      <div className="eb-main-grid">
        {/* Left Column: Synchronized Dual Interactive Vector Charts */}
        <div className="eb-charts-col">
          {/* Chart 1: Side-Profile Bullet Drop Trajectory Y(x) */}
          <article className="eb-panel-card">
            <div className="eb-panel-head">
              <div className="eb-panel-title-group">
                <span className="eb-panel-kicker">{ui.dropChartBadge}</span>
                <h2 className="eb-panel-title">{ui.dropChartTitle}</h2>
                <p className="eb-panel-sub">
                  {ui.dropChartSubtitle(zeroRangeM, sightHeightCm)}
                </p>
              </div>
              <span className="eb-slot-hint">{ui.scrubInteractiveHint}</span>
            </div>

            <div className="eb-svg-frame">
              <svg
                className="eb-vector-svg"
                viewBox={`0 0 ${SVG_W} ${DROP_SVG_H}`}
                onPointerMove={handleChartPointerScrub}
                onPointerDown={handleChartPointerScrub}
              >
                <defs>
                  <clipPath id={dropClipId}>
                    <rect
                      x={PAD_L}
                      y={PAD_T}
                      width={dropChart.plotW}
                      height={dropChart.plotH}
                    />
                  </clipPath>
                </defs>

                {/* Vertical Range Grid & X-Axis Labels */}
                {xTickFractions.map((u) => {
                  const rVal = Math.round(u * maxRangeM);
                  const px = PAD_L + u * dropChart.plotW;
                  return (
                    <g key={u}>
                      <line
                        x1={px}
                        y1={PAD_T}
                        x2={px}
                        y2={PAD_T + dropChart.plotH}
                        stroke={
                          u === 0 || u === 1
                            ? 'var(--eb-chart-grid-major)'
                            : 'var(--eb-chart-grid)'
                        }
                        strokeWidth={1}
                      />
                      <text
                        x={px}
                        y={DROP_SVG_H - 11}
                        textAnchor="middle"
                        fill="var(--eb-chart-axis-text)"
                        fontSize={10}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {rVal}m
                      </text>
                    </g>
                  );
                })}

                {/* Horizontal Drop Grid & Y-Axis Labels */}
                {dropChart.yTicks.map((t, idx) => (
                  <g key={idx}>
                    <line
                      x1={PAD_L}
                      y1={t.py}
                      x2={PAD_L + dropChart.plotW}
                      y2={t.py}
                      stroke="var(--eb-chart-grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 7}
                      y={t.py + 3.5}
                      textAnchor="end"
                      fill="var(--eb-chart-axis-text)"
                      fontSize={10}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {t.label}
                    </text>
                  </g>
                ))}

                {/* Y-Axis Unit Label */}
                <text
                  x={8}
                  y={14}
                  fill="var(--eb-chart-muted-text)"
                  fontSize={9.5}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {dropChart.useMetersAxis ? ui.yAxisDropM : ui.yAxisDropCm}
                </text>

                {/* Optical Line-of-Sight (Y = 0) Crosshair Reference */}
                <line
                  x1={PAD_L}
                  y1={dropChart.losPy}
                  x2={PAD_L + dropChart.plotW}
                  y2={dropChart.losPy}
                  stroke="var(--eb-los-stroke)"
                  strokeWidth={1.3}
                  strokeDasharray="5 4"
                />
                <text
                  x={PAD_L + dropChart.plotW - 6}
                  y={Math.max(PAD_T + 11, dropChart.losPy - 5)}
                  textAnchor="end"
                  fill="var(--eb-chart-muted-text)"
                  fontSize={9.5}
                  fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                >
                  {ui.losLabel}
                </text>

                {/* Clipped Trajectory Curves & M=1.0 Transonic Diamond Markers */}
                <g clipPath={`url(#${dropClipId})`}>
                  {dropChart.paths.map((p) => {
                    const isFoc = p.projectileId === effectiveFocusedProjectile;
                    return (
                      <g key={p.projectileId}>
                        <path
                          d={p.d}
                          fill="none"
                          stroke={p.color}
                          strokeWidth={isFoc ? 2.7 : 2.0}
                          strokeOpacity={isFoc ? 1 : 0.86}
                        />
                        {p.mach1Marker && (
                          <g
                            transform={`translate(${p.mach1Marker.px}, ${p.mach1Marker.py})`}
                          >
                            <polygon
                              points="0,-5.5 5.5,0 0,5.5 -5.5,0"
                              fill="var(--eb-chart-bg)"
                              stroke={p.color}
                              strokeWidth={1.8}
                            />
                            <text
                              x={0}
                              y={-8}
                              textAnchor="middle"
                              fill={p.color}
                              fontSize={9}
                              fontWeight={700}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            >
                              M1·{Math.round(p.mach1Marker.rangeM)}m
                            </text>
                          </g>
                        )}
                      </g>
                    );
                  })}
                </g>

                {/* Sight-In Zero Intersection Marker */}
                {dropChart.zeroPx !== null && (
                  <g
                    transform={`translate(${dropChart.zeroPx}, ${dropChart.losPy})`}
                  >
                    <circle
                      r={6}
                      fill="none"
                      stroke="#38bdf8"
                      strokeWidth={1.5}
                    />
                    <circle r={2.2} fill="#38bdf8" />
                    <text
                      x={0}
                      y={-10}
                      textAnchor="middle"
                      fill="#38bdf8"
                      fontSize={9.5}
                      fontWeight={700}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {ui.zeroCrossLabel(zeroRangeM)}
                    </text>
                  </g>
                )}

                {/* Synchronized Range Scrubber Playhead & De-Collided Readouts */}
                <line
                  x1={dropChart.scrubPx}
                  y1={PAD_T}
                  x2={dropChart.scrubPx}
                  y2={PAD_T + dropChart.plotH}
                  stroke="var(--eb-cursor-stroke)"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />
                {activeDropDots.map((dot, i) => {
                  const flipLeft = dropChart.scrubPx > SVG_W - 185;
                  const labelX = flipLeft
                    ? dropChart.scrubPx - 9
                    : dropChart.scrubPx + 9;
                  return (
                    <g key={dot.idx}>
                      <circle
                        cx={dropChart.scrubPx}
                        cy={dot.py}
                        r={4}
                        fill={dot.color}
                        stroke="var(--eb-chart-bg)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={labelX}
                        y={dropBadgeYs[i] + 3.5}
                        textAnchor={flipLeft ? 'end' : 'start'}
                        fill={dot.color}
                        fontSize={10}
                        fontWeight={700}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {dot.text}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>

            <div className="eb-chart-foot">
              <div className="eb-legend-pills">
                {solutions.map((sol, idx) => (
                  <span key={sol.projectileId} className="eb-legend-item">
                    <span
                      className="eb-legend-swatch"
                      style={{ background: palette[idx % palette.length] }}
                    />
                    <span>{sol.spec.code}</span>
                  </span>
                ))}
              </div>
              {dropChart.isClamped && (
                <span className="eb-clamp-note">{ui.clampedPlungeHint}</span>
              )}
            </div>
          </article>

          {/* Chart 2: Switchable Wind Drift Z(x) | Velocity V(x) | Kinetic Energy Ek(x) */}
          <article className="eb-panel-card">
            <div className="eb-panel-head">
              <div className="eb-panel-title-group">
                <span className="eb-panel-kicker">{ui.secondaryBadge}</span>
                <h2 className="eb-panel-title">
                  {secondaryMode === 'wind'
                    ? ui.windChartTitle
                    : secondaryMode === 'velocity'
                      ? ui.velocityChartTitle
                      : ui.energyChartTitle}
                </h2>
                <p className="eb-panel-sub">
                  {secondaryMode === 'wind'
                    ? ui.windChartSubtitle(windSummaryText)
                    : secondaryMode === 'velocity'
                      ? ui.velocityChartSubtitle(
                          atmosphere.speedOfSoundMps.toFixed(1)
                        )
                      : ui.energyChartSubtitle}
                </p>
              </div>

              <div className="eb-chart-tabs">
                <button
                  type="button"
                  className={`eb-tab-btn ${
                    secondaryMode === 'wind' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setSecondaryMode('wind');
                  }}
                >
                  <Wind size={12} aria-hidden="true" />
                  <span>{ui.tabWindDrift}</span>
                </button>
                <button
                  type="button"
                  className={`eb-tab-btn ${
                    secondaryMode === 'velocity' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setSecondaryMode('velocity');
                  }}
                >
                  <Compass size={12} aria-hidden="true" />
                  <span>{ui.tabVelocity}</span>
                </button>
                <button
                  type="button"
                  className={`eb-tab-btn ${
                    secondaryMode === 'energy' ? 'is-active' : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    setSecondaryMode('energy');
                  }}
                >
                  <Zap size={12} aria-hidden="true" />
                  <span>{ui.tabEnergy}</span>
                </button>

                {secondaryMode === 'energy' && (
                  <button
                    type="button"
                    className="eb-reset-btn"
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setEnergyScale((s) => (s === 'sqrt' ? 'linear' : 'sqrt'));
                    }}
                  >
                    <span>
                      {energyScale === 'sqrt' ? ui.scaleSqrt : ui.scaleLinear}
                    </span>
                  </button>
                )}
              </div>
            </div>

            <div className="eb-svg-frame">
              <svg
                className="eb-vector-svg"
                viewBox={`0 0 ${SVG_W} ${SEC_SVG_H}`}
                onPointerMove={handleChartPointerScrub}
                onPointerDown={handleChartPointerScrub}
              >
                <defs>
                  <clipPath id={secClipId}>
                    <rect
                      x={PAD_L}
                      y={PAD_T}
                      width={secondaryChart.plotW}
                      height={secondaryChart.plotH}
                    />
                  </clipPath>
                </defs>

                {/* Transonic Wave-Drag Band (Velocity Mode) */}
                {secondaryChart.transonicBand && (
                  <g>
                    <rect
                      x={PAD_L}
                      y={secondaryChart.transonicBand.y0}
                      width={secondaryChart.plotW}
                      height={secondaryChart.transonicBand.h}
                      fill="var(--eb-transonic-band)"
                    />
                    <text
                      x={PAD_L + 8}
                      y={secondaryChart.transonicBand.y0 + 12}
                      fill="var(--eb-sonic-stroke)"
                      fontSize={9}
                      opacity={0.85}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {ui.transonicZoneLabel}
                    </text>
                  </g>
                )}

                {/* Vertical Range Grid */}
                {xTickFractions.map((u) => {
                  const rVal = Math.round(u * maxRangeM);
                  const px = PAD_L + u * secondaryChart.plotW;
                  return (
                    <g key={u}>
                      <line
                        x1={px}
                        y1={PAD_T}
                        x2={px}
                        y2={PAD_T + secondaryChart.plotH}
                        stroke={
                          u === 0 || u === 1
                            ? 'var(--eb-chart-grid-major)'
                            : 'var(--eb-chart-grid)'
                        }
                        strokeWidth={1}
                      />
                      <text
                        x={px}
                        y={SEC_SVG_H - 11}
                        textAnchor="middle"
                        fill="var(--eb-chart-axis-text)"
                        fontSize={10}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {rVal}m
                      </text>
                    </g>
                  );
                })}

                {/* Horizontal Y Grid */}
                {secondaryChart.yTicks.map((t, idx) => (
                  <g key={idx}>
                    <line
                      x1={PAD_L}
                      y1={t.py}
                      x2={PAD_L + secondaryChart.plotW}
                      y2={t.py}
                      stroke="var(--eb-chart-grid)"
                      strokeWidth={1}
                    />
                    <text
                      x={PAD_L - 7}
                      y={t.py + 3.5}
                      textAnchor="end"
                      fill="var(--eb-chart-axis-text)"
                      fontSize={9.5}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {t.label}
                    </text>
                  </g>
                ))}

                {/* Zero-Wind Boreline (Wind Mode) */}
                {secondaryChart.zeroPy !== null && (
                  <g>
                    <line
                      x1={PAD_L}
                      y1={secondaryChart.zeroPy}
                      x2={PAD_L + secondaryChart.plotW}
                      y2={secondaryChart.zeroPy}
                      stroke="var(--eb-los-stroke)"
                      strokeWidth={1.2}
                      strokeDasharray="5 4"
                    />
                    <text
                      x={PAD_L + secondaryChart.plotW - 6}
                      y={secondaryChart.zeroPy - 5}
                      textAnchor="end"
                      fill="var(--eb-chart-muted-text)"
                      fontSize={9.5}
                      fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                    >
                      {ui.windZeroAxisLabel}
                    </text>
                  </g>
                )}

                {/* Speed of Sound M = 1.0 Barrier Line (Velocity Mode) */}
                {secondaryChart.sonicPy !== null &&
                  secondaryChart.sonicPy >= PAD_T &&
                  secondaryChart.sonicPy <= PAD_T + secondaryChart.plotH && (
                    <g>
                      <line
                        x1={PAD_L}
                        y1={secondaryChart.sonicPy}
                        x2={PAD_L + secondaryChart.plotW}
                        y2={secondaryChart.sonicPy}
                        stroke="var(--eb-sonic-stroke)"
                        strokeWidth={1.5}
                        strokeDasharray="6 4"
                      />
                      <text
                        x={PAD_L + secondaryChart.plotW - 6}
                        y={secondaryChart.sonicPy - 5}
                        textAnchor="end"
                        fill="var(--eb-sonic-stroke)"
                        fontSize={9.5}
                        fontWeight={700}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {ui.sonicBarrierLine(
                          atmosphere.speedOfSoundMps.toFixed(1)
                        )}
                      </text>
                    </g>
                  )}

                {/* Clipped Secondary Curves + Optional 12ga Buckshot Spread Cone */}
                <g clipPath={`url(#${secClipId})`}>
                  {secondaryChart.buckshotConePath && (
                    <path
                      d={secondaryChart.buckshotConePath}
                      fill="rgba(245, 158, 11, 0.14)"
                      stroke="rgba(245, 158, 11, 0.42)"
                      strokeWidth={1}
                      strokeDasharray="3 3"
                    />
                  )}
                  {secondaryChart.paths.map((p) => {
                    const isFoc = p.projectileId === effectiveFocusedProjectile;
                    return (
                      <path
                        key={p.projectileId}
                        d={p.d}
                        fill="none"
                        stroke={p.color}
                        strokeWidth={isFoc ? 2.6 : 2.0}
                        strokeOpacity={isFoc ? 1 : 0.86}
                      />
                    );
                  })}
                </g>

                {/* Synchronized Scrubber Playhead */}
                <line
                  x1={secondaryChart.scrubPx}
                  y1={PAD_T}
                  x2={secondaryChart.scrubPx}
                  y2={PAD_T + secondaryChart.plotH}
                  stroke="var(--eb-cursor-stroke)"
                  strokeWidth={1.2}
                  strokeDasharray="3 3"
                />
                {activeSecDots.map((dot, i) => {
                  const flipLeft = secondaryChart.scrubPx > SVG_W - 190;
                  const labelX = flipLeft
                    ? secondaryChart.scrubPx - 9
                    : secondaryChart.scrubPx + 9;
                  return (
                    <g key={dot.idx}>
                      <circle
                        cx={secondaryChart.scrubPx}
                        cy={dot.py}
                        r={4}
                        fill={dot.color}
                        stroke="var(--eb-chart-bg)"
                        strokeWidth={1.5}
                      />
                      <text
                        x={labelX}
                        y={secBadgeYs[i] + 3.5}
                        textAnchor={flipLeft ? 'end' : 'start'}
                        fill={dot.color}
                        fontSize={10}
                        fontWeight={700}
                        fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                      >
                        {dot.text}
                      </text>
                    </g>
                  );
                })}
              </svg>
            </div>
          </article>
        </div>

        {/* Right Column: FFP Christmas-Tree Scope Reticle + Active Caliber Dossier Cards */}
        <aside className="eb-right-col">
          {/* 1. Optical FFP MIL-Dot / Christmas-Tree Scope Reticle Card */}
          <section className="eb-panel-card">
            <div className="eb-panel-head">
              <div className="eb-panel-title-group">
                <span className="eb-panel-kicker">{ui.reticleBadge}</span>
                <h2 className="eb-panel-title">{ui.reticleTitle}</h2>
                <p className="eb-panel-sub">
                  {ui.reticleSubtitle(
                    effectiveScrubM,
                    focusedSolution?.spec.code ?? '—'
                  )}
                </p>
              </div>
            </div>

            <div className="eb-reticle-toolbar">
              <div className="eb-seg-row">
                {(
                  [
                    ['etched', ui.illumEtched],
                    ['red', ui.illumRed],
                    ['cyan', ui.illumCyan],
                  ] as const
                ).map(([modeKey, label]) => (
                  <button
                    key={modeKey}
                    type="button"
                    className={`eb-seg-btn ${
                      reticleIllum === modeKey ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setReticleIllum(modeKey);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <span className="eb-isa-pill">
                <Crosshair size={11} aria-hidden="true" />
                <span>{ui.reticleScaleBadge(reticleGeo.fovMil)}</span>
              </span>
            </div>

            <div className="eb-reticle-stage">
              <div className="eb-scope-ocular-wrap">
                <svg
                  className="eb-reticle-svg"
                  viewBox="0 0 320 320"
                  aria-label={ui.reticleTitle}
                >
                  <defs>
                    <clipPath id={scopeClipId}>
                      <circle
                        cx={reticleGeo.cx}
                        cy={reticleGeo.cy}
                        r={reticleGeo.lensR}
                      />
                    </clipPath>
                  </defs>

                  <g clipPath={`url(#${scopeClipId})`}>
                    {/* Main Etched Horizontal & Vertical Stadia Crosshairs */}
                    <line
                      x1={reticleGeo.cx - reticleGeo.lensR}
                      y1={reticleGeo.cy}
                      x2={reticleGeo.cx - 8}
                      y2={reticleGeo.cy}
                      stroke={reticleStrokeColor}
                      strokeWidth={1.1}
                    />
                    <line
                      x1={reticleGeo.cx + 8}
                      y1={reticleGeo.cy}
                      x2={reticleGeo.cx + reticleGeo.lensR}
                      y2={reticleGeo.cy}
                      stroke={reticleStrokeColor}
                      strokeWidth={1.1}
                    />
                    <line
                      x1={reticleGeo.cx}
                      y1={reticleGeo.cy - reticleGeo.lensR}
                      x2={reticleGeo.cx}
                      y2={reticleGeo.cy - 8}
                      stroke={reticleStrokeColor}
                      strokeWidth={1.1}
                    />
                    <line
                      x1={reticleGeo.cx}
                      y1={reticleGeo.cy + 8}
                      x2={reticleGeo.cx}
                      y2={reticleGeo.cy + reticleGeo.lensR}
                      stroke={reticleStrokeColor}
                      strokeWidth={1.1}
                    />

                    {/* Precision Floating Center Aiming Dot */}
                    <circle
                      cx={reticleGeo.cx}
                      cy={reticleGeo.cy}
                      r={1.8}
                      fill={reticleStrokeColor}
                    />

                    {/* Horizontal Windage MIL Hashmarks */}
                    {reticleGeo.treeRows.map((m) => {
                      const dx = m * reticleGeo.pxPerMil;
                      return (
                        <g key={`wx-${m}`}>
                          <line
                            x1={reticleGeo.cx - dx}
                            y1={reticleGeo.cy - 4}
                            x2={reticleGeo.cx - dx}
                            y2={reticleGeo.cy + 4}
                            stroke={reticleStrokeColor}
                            strokeWidth={1}
                          />
                          <line
                            x1={reticleGeo.cx + dx}
                            y1={reticleGeo.cy - 4}
                            x2={reticleGeo.cx + dx}
                            y2={reticleGeo.cy + 4}
                            stroke={reticleStrokeColor}
                            strokeWidth={1}
                          />
                        </g>
                      );
                    })}

                    {/* Lower FFP Christmas-Tree Elevation Bars & Wind-Hold Dots */}
                    {reticleGeo.treeRows.map((m, rIdx) => {
                      const py = reticleGeo.cy + m * reticleGeo.pxPerMil;
                      const showNumber = m % reticleGeo.labelStep === 0;
                      const maxWindCols = Math.min(4, rIdx + 2);
                      const windCols: number[] = [];
                      for (let c = 1; c <= maxWindCols; c++) {
                        windCols.push(c * reticleGeo.majorStep * 0.5);
                      }

                      return (
                        <g key={`tree-${m}`}>
                          <line
                            x1={reticleGeo.cx - 6}
                            y1={py}
                            x2={reticleGeo.cx + 6}
                            y2={py}
                            stroke={reticleStrokeColor}
                            strokeWidth={1.1}
                          />
                          {showNumber && (
                            <text
                              x={reticleGeo.cx - 10}
                              y={py + 3}
                              textAnchor="end"
                              fill={reticleStrokeColor}
                              fontSize={8.5}
                              fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                            >
                              {m}
                            </text>
                          )}
                          {windCols.map((wm) => {
                            const wx = wm * reticleGeo.pxPerMil;
                            return (
                              <g key={wm}>
                                <circle
                                  cx={reticleGeo.cx - wx}
                                  cy={py}
                                  r={1.35}
                                  fill="var(--eb-reticle-sub)"
                                />
                                <circle
                                  cx={reticleGeo.cx + wx}
                                  cy={py}
                                  r={1.35}
                                  fill="var(--eb-reticle-sub)"
                                />
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}

                    {/* Live Multi-Caliber Holdover Pips & Optional 12ga Buckshot Pattern Ring */}
                    {reticleGeo.pips.map((pip) => (
                      <g key={pip.projectileId}>
                        {pip.spreadPx > 2.5 && (
                          <circle
                            cx={pip.px}
                            cy={pip.py}
                            r={Math.min(130, pip.spreadPx)}
                            fill="rgba(245, 158, 11, 0.12)"
                            stroke={pip.color}
                            strokeWidth={1.2}
                            strokeDasharray="4 3"
                          />
                        )}
                        {pip.isFocused && (
                          <circle
                            cx={pip.px}
                            cy={pip.py}
                            r={9}
                            fill="none"
                            stroke={pip.color}
                            strokeWidth={1.6}
                          />
                        )}
                        <circle
                          cx={pip.px}
                          cy={pip.py}
                          r={pip.isFocused ? 4.2 : 3.4}
                          fill={pip.color}
                          stroke="#0f172a"
                          strokeWidth={1}
                        />
                        {pip.isFocused && (
                          <text
                            x={
                              pip.px > reticleGeo.cx + 52
                                ? pip.px - 12
                                : pip.px + 12
                            }
                            y={pip.py + 3.5}
                            textAnchor={
                              pip.px > reticleGeo.cx + 52 ? 'end' : 'start'
                            }
                            fill={pip.color}
                            fontSize={9.5}
                            fontWeight={800}
                            fontFamily="ui-monospace, SFMono-Regular, Menlo, monospace"
                          >
                            {pip.code}
                          </text>
                        )}
                      </g>
                    ))}
                  </g>

                  {/* Outer Ocular Bezel Ring */}
                  <circle
                    cx={reticleGeo.cx}
                    cy={reticleGeo.cy}
                    r={reticleGeo.lensR}
                    fill="none"
                    stroke="rgba(148, 163, 184, 0.36)"
                    strokeWidth={2}
                  />
                </svg>
              </div>

              {/* Digital Scope Turret Dial Readout */}
              {focusedSample ? (
                <>
                  <div className="eb-turret-readout-grid">
                    <div className="eb-turret-box">
                      <span className="eb-turret-label">
                        {ui.elevTurretLabel}
                      </span>
                      <strong className="eb-turret-primary">
                        {focusedSample.holdoverMil >= 0
                          ? ui.holdUpPrefix
                          : ui.holdDownPrefix}{' '}
                        {Math.abs(focusedSample.holdoverMil).toFixed(2)} MIL
                      </strong>
                      <span className="eb-turret-secondary">
                        {formatSigned(focusedSample.holdoverMoa, 1)} MOA ·{' '}
                        {formatDropShort(focusedSample.dropCm)}
                      </span>
                    </div>

                    <div className="eb-turret-box">
                      <span className="eb-turret-label">
                        {ui.windTurretLabel}
                      </span>
                      <strong className="eb-turret-primary">
                        {focusedSample.windageMil >= 0
                          ? ui.holdRightPrefix
                          : ui.holdLeftPrefix}{' '}
                        {Math.abs(focusedSample.windageMil).toFixed(2)} MIL
                      </strong>
                      <span className="eb-turret-secondary">
                        {formatSigned(focusedSample.windageMoa, 1)} MOA ·{' '}
                        {formatDropShort(focusedSample.windDriftCm)}
                      </span>
                    </div>
                  </div>

                  {focusedSample.patternSpreadRadiusMm > 0 && (
                    <div className="eb-buckshot-banner">
                      {ui.buckshotPatternNote(
                        focusedSample.patternSpreadRadiusMm * 2,
                        (
                          (focusedSample.patternSpreadRadiusMm * 2) /
                          Math.max(1, effectiveScrubM)
                        ).toFixed(1)
                      )}
                    </div>
                  )}
                </>
              ) : (
                focusedSolution && (
                  <div className="eb-buckshot-banner">
                    {ui.stalledAtRangeNote(focusedSolution.effectiveMaxRangeM)}
                  </div>
                )
              )}
            </div>
          </section>

          {/* 2. Live Multi-Caliber Telemetry & 3D Workbench Deep-Link Cards */}
          <section className="eb-panel-card">
            <span className="eb-panel-kicker">
              {ui.telemetryDeckTitle(effectiveScrubM)}
            </span>

            <div className="eb-telemetry-stack">
              {solutions.map((sol, idx) => {
                const sample = scrubSamples[idx];
                const isFoc = sol.projectileId === effectiveFocusedProjectile;
                const slotColor = palette[idx % palette.length];
                const transonicText = sol.isInitiallySubsonic
                  ? ui.subsonicMuzzleText
                  : sol.transonicRangeM !== null
                    ? sol.transonicRangeM > maxRangeM
                      ? ui.supersonicBeyondText(sol.transonicRangeM)
                      : `${Math.round(sol.transonicRangeM)} m`
                    : '—';

                return (
                  <div
                    key={sol.projectileId}
                    className={`eb-cal-card ${isFoc ? 'is-focused' : ''}`}
                    style={
                      { '--card-slot-color': slotColor } as React.CSSProperties
                    }
                    onClick={() => {
                      playWorkbenchFoley('part_select');
                      setFocusedProjectile(sol.projectileId);
                      setActiveBallisticsCaliber(sol.projectileId);
                    }}
                  >
                    <div className="eb-cal-card-top">
                      <div className="eb-cal-card-name">
                        <span>{isZh ? sol.spec.nameZh : sol.spec.nameEn}</span>
                        <span className="eb-cal-bc-tag">
                          {sol.spec.dragModel} {sol.spec.bc.toFixed(3)}
                        </span>
                      </div>

                      <div className="eb-weapon-jump-row">
                        {isFoc ? (
                          <span className="eb-focus-pill">
                            {ui.primaryFocusTag}
                          </span>
                        ) : (
                          <span className="eb-slot-hint">
                            {ui.setFocusHint}
                          </span>
                        )}
                        {sample && (
                          <span
                            className={`eb-regime-pill regime-${sample.flightRegime}`}
                          >
                            {ui.regimeLabels[sample.flightRegime]}
                          </span>
                        )}
                      </div>
                    </div>

                    {sample ? (
                      <div className="eb-cal-metrics-grid">
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">{ui.metricVelMach}</span>
                          <strong className="eb-mini-v">
                            {Math.round(sample.velocityMps)} m/s · M
                            {sample.mach.toFixed(2)}
                          </strong>
                        </div>
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">{ui.metricDropHold}</span>
                          <strong className="eb-mini-v">
                            {formatDropShort(sample.dropCm)} (
                            {formatSigned(sample.holdoverMil, 1)} MIL)
                          </strong>
                        </div>
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">{ui.metricWindHold}</span>
                          <strong className="eb-mini-v">
                            {formatDropShort(sample.windDriftCm)} (
                            {formatSigned(sample.windageMil, 1)} MIL)
                          </strong>
                        </div>
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">
                            {ui.metricEnergyRetained}
                          </span>
                          <strong className="eb-mini-v">
                            {formatEnergyShort(sample.energyJ)} (
                            {Math.round(sample.retainedEnergyPct)}%)
                          </strong>
                        </div>
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">
                            {ui.metricTimeOfFlight}
                          </span>
                          <strong className="eb-mini-v">
                            {sample.timeOfFlightS < 1
                              ? `${Math.round(sample.timeOfFlightMs)} ms`
                              : `${sample.timeOfFlightS.toFixed(2)} s`}
                          </strong>
                        </div>
                        <div className="eb-mini-cell">
                          <span className="eb-mini-k">
                            {ui.metricTransonicAt}
                          </span>
                          <strong className="eb-mini-v">{transonicText}</strong>
                        </div>
                      </div>
                    ) : (
                      <span className="eb-cal-note">
                        {ui.stalledAtRangeNote(sol.effectiveMaxRangeM)}
                      </span>
                    )}

                    {sample && sol.spec.pelletCount > 1 && (
                      <span className="eb-cal-note">
                        {ui.pelletBreakdownText(
                          sample.singlePelletEnergyJ,
                          sample.patternSpreadRadiusMm
                        )}
                      </span>
                    )}

                    <div className="eb-cal-card-foot">
                      <span className="eb-cal-note">
                        {isZh ? sol.spec.noteZh : sol.spec.noteEn}
                      </span>

                      <div className="eb-weapon-jump-row">
                        {sol.spec.representativeWeaponIds
                          .filter(
                            (wId) => isWeaponId(wId) || Boolean(onInspectWeapon)
                          )
                          .map((wId) => {
                            const wLabel = isWeaponId(wId)
                              ? getLocalizedShortWeaponLabel(wId, lang)
                              : (WAVE2_WEAPON_LABELS[wId]?.[lang] ?? wId);
                            return (
                              <button
                                key={wId}
                                type="button"
                                className="eb-weapon-link-pill"
                                title={ui.inspectInWorkbenchTitle(wLabel)}
                                onClick={(e) => handleWeaponJump(wId, e)}
                              >
                                <span>{wLabel}</span>
                                <ArrowUpRight size={10} aria-hidden="true" />
                              </button>
                            );
                          })}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        </aside>
      </div>

      {/* ==================== Bottom Multi-Range Sniper DOPE Drop Card ==================== */}
      {focusedSolution && (
        <section className="eb-dope-section" ref={dopeSectionRef}>
          <div className="eb-panel-head">
            <div className="eb-panel-title-group">
              <span className="eb-panel-kicker">{ui.dopeBadge}</span>
              <h2 className="eb-panel-title">
                {ui.dopeTitle(
                  isZh
                    ? `${focusedSolution.spec.nameZh} (${focusedSolution.spec.loadLabelZh})`
                    : `${focusedSolution.spec.nameEn} (${focusedSolution.spec.loadLabelEn})`
                )}
              </h2>
              <p className="eb-panel-sub">
                {ui.dopeSubtitle(
                  zeroRangeM,
                  sightHeightCm,
                  windSummaryText,
                  altitudeM,
                  tempC
                )}
              </p>
            </div>

            <div className="eb-dope-controls">
              {/* Switch focused caliber right on DOPE header */}
              {solutions.map((sol, idx) => (
                <button
                  key={sol.projectileId}
                  type="button"
                  className={`eb-tab-btn ${
                    sol.projectileId === effectiveFocusedProjectile
                      ? 'is-active'
                      : ''
                  }`}
                  onClick={() => {
                    playWorkbenchFoley('part_select');
                    setFocusedProjectile(sol.projectileId);
                  }}
                >
                  <span
                    className="eb-legend-swatch"
                    style={{ background: palette[idx % palette.length] }}
                  />
                  <span>{sol.spec.code}</span>
                </button>
              ))}

              <div className="eb-seg-row">
                {(
                  [
                    ['both', ui.dopeUnitBoth],
                    ['mil', ui.dopeUnitMil],
                    ['moa', ui.dopeUnitMoa],
                  ] as const
                ).map(([uKey, label]) => (
                  <button
                    key={uKey}
                    type="button"
                    className={`eb-seg-btn ${
                      dopeUnitMode === uKey ? 'is-active' : ''
                    }`}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      setDopeUnitMode(uKey);
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="eb-dope-table-wrap">
            <table className="eb-dope-table">
              <thead>
                <tr>
                  <th scope="col">{ui.colRange}</th>
                  <th scope="col">{ui.colDrop}</th>
                  <th scope="col">{ui.colElev}</th>
                  <th scope="col">{ui.colDrift}</th>
                  <th scope="col">{ui.colWind}</th>
                  <th scope="col">{ui.colVelocity}</th>
                  <th scope="col">{ui.colMach}</th>
                  <th scope="col">{ui.colEnergy}</th>
                  <th scope="col">{ui.colFlightTime}</th>
                  <th scope="col">{ui.colRegime}</th>
                </tr>
              </thead>
              <tbody>
                {dopeRows.map((row) => {
                  const isZeroRow = row.rangeM === zeroRangeM;
                  const isNearScrub =
                    Math.abs(row.rangeM - effectiveScrubM) <= 12;

                  const elevCell =
                    dopeUnitMode === 'mil'
                      ? `${formatSigned(row.holdoverMil, 2)} MIL`
                      : dopeUnitMode === 'moa'
                        ? `${formatSigned(row.holdoverMoa, 1)} MOA`
                        : `${formatSigned(row.holdoverMil, 2)} MIL / ${formatSigned(
                            row.holdoverMoa,
                            1
                          )} MOA`;

                  const windCell =
                    dopeUnitMode === 'mil'
                      ? `${formatSigned(row.windageMil, 2)} MIL`
                      : dopeUnitMode === 'moa'
                        ? `${formatSigned(row.windageMoa, 1)} MOA`
                        : `${formatSigned(row.windageMil, 2)} MIL / ${formatSigned(
                            row.windageMoa,
                            1
                          )} MOA`;

                  return (
                    <tr
                      key={row.rangeM}
                      className={`${isNearScrub ? 'is-scrub-near' : ''} ${
                        isZeroRow ? 'is-zero-row' : ''
                      }`}
                      onClick={() => handleDopeRowClick(row.rangeM)}
                    >
                      <td>
                        <span>{row.rangeM} m</span>
                        {isZeroRow && (
                          <span className="eb-zero-tag">{ui.zeroBadge}</span>
                        )}
                      </td>

                      {row.inFlight ? (
                        <>
                          <td className="eb-dope-mono">
                            {formatSigned(row.dropCm, 1)} cm
                          </td>
                          <td className="eb-dope-elev">{elevCell}</td>
                          <td className="eb-dope-mono">
                            {formatSigned(row.windDriftCm, 1)} cm
                          </td>
                          <td className="eb-dope-wind">{windCell}</td>
                          <td className="eb-dope-mono">
                            {Math.round(row.velocityMps)} m/s
                          </td>
                          <td className="eb-dope-mono">
                            {row.mach.toFixed(2)}
                          </td>
                          <td className="eb-dope-mono">
                            {formatEnergyShort(row.energyJ)}
                          </td>
                          <td className="eb-dope-mono">
                            {row.timeOfFlightS.toFixed(3)} s
                          </td>
                          <td>
                            <span
                              className={`eb-regime-pill regime-${row.flightRegime}`}
                            >
                              {ui.regimeLabels[row.flightRegime]}
                            </span>
                          </td>
                        </>
                      ) : (
                        <td colSpan={9} className="eb-dope-mono">
                          {ui.outOfEnvelopeLabel}
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          <span className="eb-slot-hint">{ui.dopeClickHint}</span>
        </section>
      )}
    </div>
  );
};

ExternalBallisticsView.displayName = 'ExternalBallisticsView';
export default ExternalBallisticsView;

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeft,
  ArrowLeftRight,
  Eye,
  Flame,
  GitCompareArrows,
  Layers,
  Link2,
  Link2Off,
  Palette,
  Pause,
  Play,
  RotateCcw,
  Scissors,
  SlidersHorizontal,
  Wrench,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  SECTION_CUT_AXES,
  type SectionCutAxis,
} from '../../engine/actors/StencilSectionCap';
import { playbackClock } from '../../engine/clock/playbackClock';
import {
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getCaliberBallisticsSpec,
  getWeaponFiringTiming,
  isArcheryCaliber,
  isTankCaliber,
} from '../../engine/physics/armoryPhysics';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { ARMORY_WEAPONS, getWeaponManifest } from '../../weapons/manifests';
import { isWeaponId } from '../../weapons/types';
import {
  findMatchingRivalryPreset,
  getClassicRivalryPresets,
  queueMechanismShowdownLaunch,
} from '../armory/mechanismShowdownSpecs';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';
import {
  SPLIT_MOBILE_BREAKPOINT_PX,
  splitShowdownCameraStore,
} from './splitShowdownCamera';
import { SPLIT_SHOWDOWN_STRINGS } from './splitShowdownStrings';
import '../../styles/split-showdown.css';
import '../../styles/split-showdown-upgrade.css';

const SPLIT_SPEEDS: readonly (0.25 | 0.5 | 1.0)[] = [0.25, 0.5, 1.0];

function formatCompactEnergy(energyJ: number): string {
  if (energyJ >= 1_000_000) return `${(energyJ / 1_000_000).toFixed(2)} MJ`;
  if (energyJ >= 1000) return `${Math.round(energyJ).toLocaleString('en-US')} J`;
  return `${energyJ.toFixed(0)} J`;
}

export const SplitShowdownOverlay: React.FC = () => {
  const lang = useAppStore((s) => s.lang);
  const weaponA = useAppStore((s) => s.splitShowdownWeaponA);
  const weaponB = useAppStore((s) => s.splitShowdownWeaponB);
  const setSplitShowdownWeapons = useAppStore(
    (s) => s.setSplitShowdownWeapons
  );
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
  const setSectionCutAxis = useAppStore((s) => s.setSectionCutAxis);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const toggleEngineeringTint = useAppStore((s) => s.toggleEngineeringTint);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const isFiringPlaying = useAppStore((s) => s.isFiringPlaying);
  const togglePlay = useAppStore((s) => s.togglePlay);
  const toggleFiringPlay = useAppStore((s) => s.toggleFiringPlay);
  const stopPlay = useAppStore((s) => s.stopPlay);
  const stopFiringPlay = useAppStore((s) => s.stopFiringPlay);
  const fireSpeedMultiplier = useAppStore((s) => s.fireSpeedMultiplier);
  const setFireSpeedMultiplier = useAppStore((s) => s.setFireSpeedMultiplier);

  const [linkedOrbit, setLinkedOrbit] = useState(
    () => splitShowdownCameraStore.linkCameras
  );
  const [isVerticalSplit, setIsVerticalSplit] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const syncLayout = () => {
      const mobile = window.innerWidth < SPLIT_MOBILE_BREAKPOINT_PX;
      setIsVerticalSplit(mobile);
      if (!mobile) {
        setMobileToolsOpen(false);
      }
    };
    syncLayout();
    window.addEventListener('resize', syncLayout);
    return () => window.removeEventListener('resize', syncLayout);
  }, []);

  const sliderRef = useRef<HTMLInputElement>(null);
  const pctRef = useRef<HTMLSpanElement>(null);
  const liveARef = useRef<HTMLDivElement>(null);
  const liveBRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    side: 'A' | 'B';
    lastX: number;
    lastY: number;
  }>({ active: false, side: 'A', lastX: 0, lastY: 0 });

  const ui = SPLIT_SHOWDOWN_STRINGS[lang];
  const rivalryPresets = useMemo(() => getClassicRivalryPresets(lang), [lang]);
  const activeRivalry = useMemo(
    () => findMatchingRivalryPreset(weaponA, weaponB, lang),
    [weaponA, weaponB, lang]
  );

  const manifestA = getWeaponManifest(weaponA);
  const manifestB = getWeaponManifest(weaponB);
  const bayA = ARMORY_WEAPONS.find((w) => w.id === weaponA)?.bayCode ?? weaponA;
  const bayB = ARMORY_WEAPONS.find((w) => w.id === weaponB)?.bayCode ?? weaponB;
  const displayA = useMemo(
    () => resolveWeaponDisplayMeta(weaponA, lang, null),
    [weaponA, lang]
  );
  const displayB = useMemo(
    () => resolveWeaponDisplayMeta(weaponB, lang, null),
    [weaponB, lang]
  );
  const balA = getCaliberBallisticsSpec(manifestA.caliberProfile);
  const balB = getCaliberBallisticsSpec(manifestB.caliberProfile);

  // Imperative 60fps progress + dual telemetry readout (zero React re-renders during playback)
  useEffect(() => {
    const sampleA = createInternalBallisticsSample();
    const sampleB = createInternalBallisticsSample();
    let rafId = 0;
    const renderFrame = () => {
      const clk = playbackClock.getState();
      const st = useAppStore.getState();
      const val =
        st.mode === 'firing' ? clk.animatedFireProgress : clk.animatedProgress;
      if (sliderRef.current) {
        sliderRef.current.value = String(Math.round(val * 1000));
      }
      if (pctRef.current) {
        pctRef.current.textContent = `${Math.round(val * 100)}%`;
      }
      if (liveARef.current && st.mode === 'firing') {
        const manA = getWeaponManifest(st.splitShowdownWeaponA);
        evaluateInternalBallisticsInto(
          manA.caliberProfile,
          val,
          sampleA,
          getWeaponFiringTiming(st.splitShowdownWeaponA)
        );
        const unitP = isArcheryCaliber(manA.caliberProfile) ? 'N' : 'MPa';
        const pVal = isArcheryCaliber(manA.caliberProfile)
          ? sampleA.pressureMPa.toFixed(0)
          : sampleA.pressureMPa.toFixed(1);
        liveARef.current.textContent = `${pVal} ${unitP} · ${Math.round(sampleA.velocityMps)} m/s`;
      }
      if (liveBRef.current && st.mode === 'firing') {
        const manB = getWeaponManifest(st.splitShowdownWeaponB);
        evaluateInternalBallisticsInto(
          manB.caliberProfile,
          val,
          sampleB,
          getWeaponFiringTiming(st.splitShowdownWeaponB)
        );
        const unitP = isArcheryCaliber(manB.caliberProfile) ? 'N' : 'MPa';
        const pVal = isArcheryCaliber(manB.caliberProfile)
          ? sampleB.pressureMPa.toFixed(0)
          : sampleB.pressureMPa.toFixed(1);
        liveBRef.current.textContent = `${pVal} ${unitP} · ${Math.round(sampleB.velocityMps)} m/s`;
      }
      rafId = window.requestAnimationFrame(renderFrame);
    };
    rafId = window.requestAnimationFrame(renderFrame);
    return () => {
      window.cancelAnimationFrame(rafId);
    };
  }, [mode, weaponA, weaponB]);

  const activePlaying = mode === 'firing' ? isFiringPlaying : isPlaying;

  const handleTogglePlay = () => {
    playWorkbenchFoley('preset_detent');
    if (mode === 'firing') {
      toggleFiringPlay();
    } else {
      togglePlay();
    }
  };

  const handleScrub = (rawVal: number) => {
    const val = Math.max(0, Math.min(1, rawVal));
    if (mode === 'firing') {
      stopFiringPlay();
      playbackClock.setFireProgress(val, false);
    } else {
      stopPlay();
      playbackClock.setTargetProgress(val, false);
    }
  };

  const handleRivalryChange = (presetId: string) => {
    const match = rivalryPresets.find((p) => p.id === presetId);
    if (!match) return;
    playWorkbenchFoley('preset_detent');
    setSplitShowdownWeapons(match.weaponA, match.weaponB);
  };

  const handleToggleLink = () => {
    const next = !linkedOrbit;
    splitShowdownCameraStore.setLinked(next);
    setLinkedOrbit(next);
    playWorkbenchFoley('toggle_switch');
  };

  const resolvePointerSide = (clientX: number, clientY: number): 'A' | 'B' => {
    if (isVerticalSplit) {
      return clientY < window.innerHeight * 0.5 ? 'A' : 'B';
    }
    return clientX < window.innerWidth * 0.5 ? 'A' : 'B';
  };

  const mobileToolsLabel = mobileToolsOpen
    ? lang === 'zh'
      ? '收起'
      : 'Close'
    : lang === 'zh'
      ? '对比工具'
      : 'Controls';

  return (
    <div
      className={`split-showdown-overlay ${isVerticalSplit ? 'is-vertical-split' : ''}`}
    >
      {/* Unobstructed full-canvas orbit & zoom layer */}
      <div
        className="split-drag-surface"
        onPointerDown={(e) => {
          dragStateRef.current = {
            active: true,
            side: resolvePointerSide(e.clientX, e.clientY),
            lastX: e.clientX,
            lastY: e.clientY,
          };
          e.currentTarget.setPointerCapture(e.pointerId);
        }}
        onPointerMove={(e) => {
          if (!dragStateRef.current.active) return;
          const dx = e.clientX - dragStateRef.current.lastX;
          const dy = e.clientY - dragStateRef.current.lastY;
          dragStateRef.current.lastX = e.clientX;
          dragStateRef.current.lastY = e.clientY;
          splitShowdownCameraStore.orbit(
            dragStateRef.current.side,
            -dx * 0.0085,
            -dy * 0.0072
          );
        }}
        onPointerUp={(e) => {
          dragStateRef.current.active = false;
          if (e.currentTarget.hasPointerCapture(e.pointerId)) {
            e.currentTarget.releasePointerCapture(e.pointerId);
          }
        }}
        onPointerCancel={() => {
          dragStateRef.current.active = false;
        }}
        onWheel={(e) => {
          const side = resolvePointerSide(e.clientX, e.clientY);
          const factor = e.deltaY > 0 ? 1.07 : 0.935;
          splitShowdownCameraStore.zoomBy(side, factor);
        }}
      />

      <div className="split-divider-line" aria-hidden="true" />
      <div className="split-vs-medallion" aria-hidden="true">
        {ui.vsBadge}
      </div>

      {/* Top Navigation & Comparison Toolbar (collapsible compact header on mobile < 768px) */}
      <header
        className={`split-topbar ${mobileToolsOpen ? 'is-mobile-expanded' : ''}`}
      >
        <div className="split-topbar-left">
          <button
            type="button"
            className="split-btn"
            onClick={returnToArmory}
          >
            <ArrowLeft size={13} aria-hidden="true" />
            <span>{ui.backVault}</span>
          </button>

          <button
            type="button"
            className="split-btn split-desktop-only-btn"
            onClick={() => {
              queueMechanismShowdownLaunch('showdown', weaponA, weaponB);
              returnToArmory();
            }}
          >
            <GitCompareArrows size={13} aria-hidden="true" />
            <span>{ui.backMatrix}</span>
          </button>

          <LanguageSwitchPill compact />

          <button
            type="button"
            className={`split-btn split-mobile-tools-toggle ${mobileToolsOpen ? 'is-active' : ''}`}
            aria-expanded={mobileToolsOpen}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setMobileToolsOpen((prev) => !prev);
            }}
          >
            {mobileToolsOpen ? (
              <X size={13} aria-hidden="true" />
            ) : (
              <SlidersHorizontal size={13} aria-hidden="true" />
            )}
            <span>{mobileToolsLabel}</span>
          </button>
        </div>

        <div className="split-topbar-center">
          <select
            aria-label={ui.rivalryLabel}
            className="split-select"
            value={activeRivalry?.id ?? ''}
            onChange={(e) => handleRivalryChange(e.target.value)}
          >
            {!activeRivalry && <option value="">{ui.customRivalry}</option>}
            {rivalryPresets.map((p) => (
              <option key={p.id} value={p.id}>
                {p.pillLabel}
              </option>
            ))}
          </select>

          <select
            aria-label={ui.leftPaneTag}
            className="split-select is-slot-a"
            value={weaponA}
            onChange={(e) => {
              if (isWeaponId(e.target.value)) {
                setSplitShowdownWeapons(e.target.value, weaponB);
              }
            }}
          >
            {ARMORY_WEAPONS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.bayCode} · {resolveWeaponDisplayMeta(w.id, lang, null).shortLabel}
              </option>
            ))}
          </select>

          <button
            type="button"
            className="split-btn"
            title={ui.swapTitle}
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              setSplitShowdownWeapons(weaponB, weaponA);
            }}
          >
            <ArrowLeftRight size={13} aria-hidden="true" />
          </button>

          <select
            aria-label={ui.rightPaneTag}
            className="split-select is-slot-b"
            value={weaponB}
            onChange={(e) => {
              if (isWeaponId(e.target.value)) {
                setSplitShowdownWeapons(weaponA, e.target.value);
              }
            }}
          >
            {ARMORY_WEAPONS.map((w) => (
              <option key={w.id} value={w.id}>
                {w.bayCode} · {resolveWeaponDisplayMeta(w.id, lang, null).shortLabel}
              </option>
            ))}
          </select>
        </div>

        <div className="split-topbar-right">
          <div className="split-env-cluster-wrap">
            <StudioEnvironmentBar compact />
          </div>

          <button
            type="button"
            className={`split-btn ${linkedOrbit ? 'is-active' : ''}`}
            onClick={handleToggleLink}
          >
            {linkedOrbit ? (
              <Link2 size={13} aria-hidden="true" />
            ) : (
              <Link2Off size={13} aria-hidden="true" />
            )}
            <span>{linkedOrbit ? ui.linkedOrbitOn : ui.linkedOrbitOff}</span>
          </button>

          <button
            type="button"
            className="split-btn"
            title={ui.resetCamTitle}
            onClick={() => splitShowdownCameraStore.resetPoses()}
          >
            <RotateCcw size={13} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`split-btn ${mode === 'explode' ? 'is-active' : ''}`}
            onClick={() => setMode('explode')}
          >
            <Layers size={13} aria-hidden="true" />
            <span>{ui.modeExplode}</span>
          </button>

          <button
            type="button"
            className={`split-btn ${mode === 'firing' ? 'is-orange' : ''}`}
            onClick={() => setMode('firing')}
          >
            <Flame size={13} aria-hidden="true" />
            <span>{ui.modeFiring}</span>
          </button>

          <button
            type="button"
            className={`split-btn ${sectionCut ? 'is-teal' : ''}`}
            onClick={toggleSectionCut}
          >
            <Scissors size={13} aria-hidden="true" />
            <span>{ui.sectionLabel}</span>
          </button>

          {sectionCut && (
            <div style={{ display: 'inline-flex', gap: 3 }}>
              {SECTION_CUT_AXES.filter((ax) => ax !== 'box').map((ax) => (
                <button
                  key={ax}
                  type="button"
                  className={`split-btn ${sectionCutAxis === ax ? 'is-teal' : ''}`}
                  style={{ padding: '4px 7px', fontSize: 10.5 }}
                  onClick={() => setSectionCutAxis(ax as SectionCutAxis)}
                >
                  {ax === 'z' ? ui.axisZ : ax === 'x' ? ui.axisX : ui.axisY}
                </button>
              ))}
            </div>
          )}

          <button
            type="button"
            className={`split-btn ${xrayShells ? 'is-active' : ''}`}
            onClick={toggleXrayShells}
          >
            <Eye size={13} aria-hidden="true" />
            <span>{ui.xrayLabel}</span>
          </button>

          <button
            type="button"
            className={`split-btn ${engineeringTint ? 'is-orange' : ''}`}
            onClick={toggleEngineeringTint}
          >
            <Palette size={13} aria-hidden="true" />
            <span>{ui.tintLabel}</span>
          </button>
        </div>
      </header>

      {/* Dual Corner Plaques */}
      <div className="split-cards-row">
        <aside className="split-plaque is-a">
          <div className="split-plaque-tag">
            {bayA} · {ui.leftPaneTag}
          </div>
          <h2 className="split-plaque-title">{displayA.name}</h2>
          <div className="split-plaque-specs">
            <span>
              {ui.caliberLabel}: <strong>{displayA.caliber}</strong>
            </span>
            <span>
              {ui.velocityLabel}:{' '}
              <strong>{Math.round(balA.muzzleVelocityMps)} m/s</strong>
            </span>
            <span>
              {ui.energyLabel}:{' '}
              <strong>
                {formatCompactEnergy(balA.muzzleEnergyJ)}
                {isTankCaliber(manifestA.caliberProfile) ? ' (APFSDS)' : ''}
              </strong>
            </span>
          </div>
          {mode === 'firing' && (
            <div ref={liveARef} className="split-plaque-live">
              0.0 MPa · 0 m/s
            </div>
          )}
          <div style={{ marginTop: 6 }}>
            <button
              type="button"
              className="split-btn"
              onClick={() => enterWorkbench(weaponA, mode)}
            >
              <Wrench size={11} aria-hidden="true" />
              <span>{ui.openWorkbenchA}</span>
            </button>
          </div>
        </aside>

        <aside className="split-plaque is-b">
          <div className="split-plaque-tag">
            {bayB} · {ui.rightPaneTag}
          </div>
          <h2 className="split-plaque-title">{displayB.name}</h2>
          <div className="split-plaque-specs">
            <span>
              {ui.caliberLabel}: <strong>{displayB.caliber}</strong>
            </span>
            <span>
              {ui.velocityLabel}:{' '}
              <strong>{Math.round(balB.muzzleVelocityMps)} m/s</strong>
            </span>
            <span>
              {ui.energyLabel}:{' '}
              <strong>
                {formatCompactEnergy(balB.muzzleEnergyJ)}
                {isTankCaliber(manifestB.caliberProfile) ? ' (APFSDS)' : ''}
              </strong>
            </span>
          </div>
          {mode === 'firing' && (
            <div ref={liveBRef} className="split-plaque-live">
              0.0 MPa · 0 m/s
            </div>
          )}
          <div style={{ marginTop: 6, display: 'flex', justifyContent: 'flex-end' }}>
            <button
              type="button"
              className="split-btn"
              onClick={() => enterWorkbench(weaponB, mode)}
            >
              <Wrench size={11} aria-hidden="true" />
              <span>{ui.openWorkbenchB}</span>
            </button>
          </div>
        </aside>
      </div>

      {/* Synchronized Timeline Control Dock */}
      <footer className="split-bottom-dock">
        <div className="split-dock-controls">
          <button
            type="button"
            className={`split-btn ${activePlaying ? 'is-orange' : 'is-active'}`}
            onClick={handleTogglePlay}
          >
            {activePlaying ? (
              <Pause size={13} aria-hidden="true" />
            ) : (
              <Play size={13} aria-hidden="true" />
            )}
            <span>{activePlaying ? ui.pauseLabel : ui.playLabel}</span>
          </button>

          {mode === 'firing' &&
            SPLIT_SPEEDS.map((spd) => (
              <button
                key={spd}
                type="button"
                className={`split-btn ${fireSpeedMultiplier === spd ? 'is-active' : ''}`}
                onClick={() => setFireSpeedMultiplier(spd)}
              >
                {spd}×
              </button>
            ))}

          <input
            ref={sliderRef}
            type="range"
            className="split-dock-slider"
            min={0}
            max={1000}
            defaultValue={0}
            aria-label={ui.title}
            onChange={(e) => handleScrub(Number(e.target.value) / 1000)}
          />

          <span ref={pctRef} className="split-dock-pct">
            0%
          </span>
        </div>

        <div className="split-dock-hint">
          {linkedOrbit ? ui.dragHintLinked : ui.dragHintFree}
        </div>
      </footer>
    </div>
  );
};

export default SplitShowdownOverlay;

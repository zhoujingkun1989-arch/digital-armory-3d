import React, { useEffect } from 'react';
import { Crosshair, Eye, RotateCcw, Shield, Target, X } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { isTankWeapon } from '../../engine/physics/armoryPhysics';
import {
  computeTankFcsSolution,
  getTankCrewSpec,
  type TankCrewStation,
  type TankOpticMode,
  useTankCrewStore,
} from '../../engine/tank/tankCrewStore';
import { useAppStore } from '../../store/useAppStore';
import '../../styles/tank-crew.css';

const STATION_ORDER: readonly TankCrewStation[] = [
  'exterior',
  'gunner',
  'interior',
];
const OPTIC_ORDER: readonly TankOpticMode[] = [
  'daylight',
  'flir_whot',
  'flir_bhot',
];

const TANK_CREW_STRINGS = {
  zh: {
    badge: 'WP-23 · 1:1 坦克车长/炮长火控台',
    stations: {
      exterior: '全车外视',
      gunner: '炮手瞄准镜 FCS',
      interior: '炮塔战斗室视角',
    },
    optics: {
      daylight: '白光昼间 12×',
      flir_whot: '热像白热 WHOT',
      flir_bhot: '热像黑热 BHOT',
    },
    yaw: '炮塔方向回转角',
    elev: '主炮俯仰高低角',
    range: '激光测距 LRF',
    speed: '目标横速',
    laseBtn: '测距自动装表 (Auto-Lay)',
    resetBtn: '回正炮塔',
    closeBtn: '关闭车组台',
    superelevation: '弹道表尺',
    lead: '动目标提前量',
    tof: '飞行时间',
  },
  en: {
    badge: 'WP-23 · 1:1 TANK CREW FCS STATION',
    stations: {
      exterior: 'Exterior',
      gunner: 'Gunner Optic FCS',
      interior: 'Fighting Compartment',
    },
    optics: {
      daylight: 'Daylight 12x',
      flir_whot: 'FLIR White-Hot',
      flir_bhot: 'FLIR Black-Hot',
    },
    yaw: 'Turret Traverse Azimuth',
    elev: 'Main Gun Elevation',
    range: 'Laser Rangefinder',
    speed: 'Target Crossing Speed',
    laseBtn: 'Lase & Auto-Lay Gun',
    resetBtn: 'Center Turret',
    closeBtn: 'Close Crew Station',
    superelevation: 'Superelevation',
    lead: 'Dynamic Lead',
    tof: 'Flight Time',
  },
} as const;

export const TankCrewHud: React.FC = () => {
  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const active = useTankCrewStore((s) => s.active);
  const station = useTankCrewStore((s) => s.station);
  const opticMode = useTankCrewStore((s) => s.opticMode);
  const turretYawDeg = useTankCrewStore((s) => s.turretYawDeg);
  const gunElevDeg = useTankCrewStore((s) => s.gunElevDeg);
  const lrfRangeM = useTankCrewStore((s) => s.lrfRangeM);
  const targetSpeedKph = useTankCrewStore((s) => s.targetSpeedKph);

  const setActive = useTankCrewStore((s) => s.setActive);
  const setStation = useTankCrewStore((s) => s.setStation);
  const setOpticMode = useTankCrewStore((s) => s.setOpticMode);
  const setTurretYawDeg = useTankCrewStore((s) => s.setTurretYawDeg);
  const setGunElevDeg = useTankCrewStore((s) => s.setGunElevDeg);
  const setLrfRangeM = useTankCrewStore((s) => s.setLrfRangeM);
  const setTargetSpeedKph = useTankCrewStore((s) => s.setTargetSpeedKph);
  const laseAndAutoLay = useTankCrewStore((s) => s.laseAndAutoLay);
  const resetForWeapon = useTankCrewStore((s) => s.resetForWeapon);

  const spec = getTankCrewSpec(activeWeaponId);
  const isTank = isTankWeapon(activeWeaponId) && spec !== null;

  // Apply thermal CSS optic treatment cleanly onto the persistent 3D canvas container when active
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const canvasWrap = document.querySelector('.canvas-container');
    if (!canvasWrap) return;
    if (active && isTank && opticMode === 'flir_whot') {
      canvasWrap.setAttribute('data-flir-optic', 'whot');
    } else if (active && isTank && opticMode === 'flir_bhot') {
      canvasWrap.setAttribute('data-flir-optic', 'bhot');
    } else {
      canvasWrap.removeAttribute('data-flir-optic');
    }
    return () => {
      canvasWrap.removeAttribute('data-flir-optic');
    };
  }, [active, isTank, opticMode]);

  if (!active || !isTank || !spec) return null;

  const ui = TANK_CREW_STRINGS[lang];
  const fcs = computeTankFcsSolution(activeWeaponId, lrfRangeM, targetSpeedKph);
  const [minElev, maxElev] = spec.elevLimitsDeg;
  const sightLabel = lang === 'zh' ? spec.sightNameZh : spec.sightNameEn;

  return (
    <>
      {station === 'gunner' && (
        <div
          className={`tank-gunner-reticle-overlay is-${opticMode}`}
          data-testid="tank-gunner-reticle"
          aria-hidden="true"
        >
          <svg viewBox="0 0 1200 680" className="tank-reticle-svg">
            <defs>
              <radialGradient id="gunnerVignette" cx="50%" cy="48%" r="52%">
                <stop offset="72%" stopColor="rgba(0,0,0,0)" />
                <stop offset="100%" stopColor="rgba(2,6,23,0.42)" />
              </radialGradient>
            </defs>
            <rect width="1200" height="680" fill="url(#gunnerVignette)" />
            {/* Main Aim Crosshair */}
            <line x1="420" y1="330" x2="575" y2="330" stroke="currentColor" strokeWidth="1.6" />
            <line x1="625" y1="330" x2="780" y2="330" stroke="currentColor" strokeWidth="1.6" />
            <line x1="600" y1="215" x2="600" y2="308" stroke="currentColor" strokeWidth="1.6" />
            <line x1="600" y1="352" x2="600" y2="450" stroke="currentColor" strokeWidth="1.6" />
            {/* Dynamic ballistic lead pip */}
            <polygon
              points={`${600 + fcs.leadMil * 5},${324 + fcs.superelevationMil * 3} ${606 + fcs.leadMil * 5},${334 + fcs.superelevationMil * 3} ${594 + fcs.leadMil * 5},${334 + fcs.superelevationMil * 3}`}
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
            />
            {/* MIL ticks */}
            {[-20, -10, 10, 20].map((m) => (
              <line
                key={m}
                x1={600 + m * 5}
                y1="324"
                x2={600 + m * 5}
                y2="336"
                stroke="currentColor"
                strokeWidth="1.4"
              />
            ))}
            <text
              x="600"
              y="98"
              textAnchor="middle"
              fill="currentColor"
              fontSize="12"
              fontFamily="monospace"
            >
              {opticMode.toUpperCase()} · YAW {Math.round(turretYawDeg)}° · ELEV{' '}
              {gunElevDeg.toFixed(1)}°
            </text>
            <text
              x="600"
              y="482"
              textAnchor="middle"
              fill="currentColor"
              fontSize="12.5"
              fontFamily="monospace"
            >
              LRF {lrfRangeM}m · SUP {fcs.superelevationMil.toFixed(1)} MIL · LEAD{' '}
              {fcs.leadMil >= 0 ? '+' : ''}
              {fcs.leadMil.toFixed(1)} MIL · TOF {fcs.tofSec.toFixed(2)}s
            </text>
          </svg>
        </div>
      )}

      <section
        className="tank-crew-hud"
        data-testid="tank-crew-hud"
        aria-label={ui.badge}
      >
        <div className="tank-crew-head">
          <div className="tank-crew-title-wrap">
            <span className="tank-crew-badge">
              <Shield size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <p className="tank-crew-sight">{sightLabel}</p>
          </div>
          <div className="tank-crew-head-btns">
            <button
              type="button"
              className="tank-crew-icon-btn"
              title={ui.resetBtn}
              onClick={() => {
                playWorkbenchFoley('preset_detent');
                resetForWeapon(activeWeaponId);
                setActive(true);
              }}
            >
              <RotateCcw size={13} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="tank-crew-icon-btn"
              title={ui.closeBtn}
              aria-label={ui.closeBtn}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setActive(false);
              }}
            >
              <X size={13} aria-hidden="true" />
            </button>
          </div>
        </div>

        <div className="tank-crew-pills">
          {STATION_ORDER.map((st) => (
            <button
              key={st}
              type="button"
              className={`tank-crew-pill ${station === st ? 'is-active' : ''}`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setStation(st);
              }}
            >
              <Eye size={11} aria-hidden="true" />
              <span>{ui.stations[st]}</span>
            </button>
          ))}
        </div>

        <div className="tank-crew-pills">
          {OPTIC_ORDER.map((op) => (
            <button
              key={op}
              type="button"
              className={`tank-crew-pill is-optic ${opticMode === op ? 'is-active' : ''}`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setOpticMode(op);
              }}
            >
              <span>{ui.optics[op]}</span>
            </button>
          ))}
        </div>

        <div className="tank-crew-sliders">
          <label className="tank-crew-slider">
            <div>
              <span>{ui.yaw}</span>
              <strong className="tabular">{Math.round(turretYawDeg)}°</strong>
            </div>
            <input
              type="range"
              min={-180}
              max={180}
              step={1}
              value={turretYawDeg}
              onChange={(e) => setTurretYawDeg(Number(e.target.value))}
            />
          </label>

          <label className="tank-crew-slider">
            <div>
              <span>
                {ui.elev} ({minElev}°..+{maxElev}°)
              </span>
              <strong className="tabular">{gunElevDeg.toFixed(1)}°</strong>
            </div>
            <input
              type="range"
              min={minElev}
              max={maxElev}
              step={0.2}
              value={gunElevDeg}
              onChange={(e) =>
                setGunElevDeg(Number(e.target.value), activeWeaponId)
              }
            />
          </label>

          <label className="tank-crew-slider">
            <div>
              <span>{ui.range}</span>
              <strong className="tabular">{lrfRangeM} m</strong>
            </div>
            <input
              type="range"
              min={200}
              max={3500}
              step={50}
              value={lrfRangeM}
              onChange={(e) => setLrfRangeM(Number(e.target.value))}
            />
          </label>

          <label className="tank-crew-slider">
            <div>
              <span>{ui.speed}</span>
              <strong className="tabular">
                {targetSpeedKph > 0 ? '+' : ''}
                {targetSpeedKph} km/h
              </strong>
            </div>
            <input
              type="range"
              min={-60}
              max={60}
              step={2}
              value={targetSpeedKph}
              onChange={(e) => setTargetSpeedKph(Number(e.target.value))}
            />
          </label>
        </div>

        <div className="tank-crew-fcs-bar">
          <div className="tank-crew-fcs-stats tabular">
            <span>
              {ui.superelevation}: {fcs.superelevationMil.toFixed(1)} MIL
            </span>
            <span>
              {ui.lead}: {fcs.leadMil >= 0 ? '+' : ''}
              {fcs.leadMil.toFixed(1)} MIL
            </span>
            <span>
              {ui.tof}: {fcs.tofSec.toFixed(2)}s
            </span>
          </div>
          <button
            type="button"
            className="tank-crew-lase-btn"
            onClick={() => {
              playWorkbenchFoley('director_cue');
              laseAndAutoLay(activeWeaponId);
            }}
          >
            <Target size={12} aria-hidden="true" />
            <Crosshair size={12} aria-hidden="true" />
            <span>{ui.laseBtn}</span>
          </button>
        </div>
      </section>
    </>
  );
};

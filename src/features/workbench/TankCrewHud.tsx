import React, { useEffect } from 'react';
import { Crosshair, Eye, RotateCcw, Shield, Target, X } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { isTankWeapon } from '../../engine/physics/armoryPhysics';
import {
  computeTankFcsSolution,
  getTankCrewSpec,
  getTankGunnerOpticProfile,
  type TankCrewStation,
  type TankFcsSolution,
  type TankGunnerOpticProfile,
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

const ZEISS_DRUM_MARKS = [0, 4, 8, 12, 16, 20, 24, 28, 32, 36, 40] as const;
const PLA_STADIA_TICKS = [-30, -20, -10, 10, 20, 30] as const;
const ABRAMS_MIL_TICKS = [-15, -10, -5, 5, 10, 15] as const;
const EMES_STADIA_TICKS = [-20, -10, -5, 5, 10, 20] as const;

export interface TankCrewLocaleStrings {
  badge: string;
  stations: Record<TankCrewStation, string>;
  optics: Record<TankOpticMode, string>;
  abramsOptics: Record<'flir_whot' | 'green_nvg' | 'daylight', string>;
  tigerOptics: Record<'daylight' | 'flir_whot', string>;
  yaw: string;
  elev: string;
  range: string;
  rangeOptical: string;
  speed: string;
  laseBtn: string;
  setDrumBtn: string;
  resetBtn: string;
  closeBtn: string;
  superelevation: string;
  lead: string;
  tof: string;
  cantLabel: string;
}

export const TANK_CREW_STRINGS: Readonly<
  Record<'zh' | 'en', TankCrewLocaleStrings>
> = {
  zh: {
    badge: '1:1 坦克车组观瞄与火控台',
    stations: {
      exterior: '全车外视',
      gunner: '炮手瞄准镜 FCS',
      interior: '炮塔战斗室视角',
    },
    optics: {
      daylight: '白光昼间',
      flir_whot: '热像白热 WHOT',
      flir_bhot: '热像黑热 BHOT',
      green_nvg: '绿磷夜视 NVG',
    },
    abramsOptics: {
      flir_whot: 'GPS 白热 WHOT',
      green_nvg: 'GPS 绿磷 NVG',
      daylight: '昼间白光 DAY',
    },
    tigerOptics: {
      daylight: '蔡司光学白光 2.5×/5×',
      flir_whot: '博物馆 FLIR 教学模式',
    },
    yaw: '炮塔方向回转角',
    elev: '主炮俯仰高低角',
    range: '激光测距 LRF',
    rangeOptical: '光学表尺距离',
    speed: '目标横速',
    laseBtn: '测距自动装表 (Auto-Lay)',
    setDrumBtn: '装定蔡司光学表尺',
    resetBtn: '回正炮塔',
    closeBtn: '关闭车组台',
    superelevation: '弹道表尺',
    lead: '动目标提前量',
    tof: '飞行时间',
    cantLabel: '耳轴倾斜',
  },
  en: {
    badge: '1:1 TANK CREW OPTICS & FCS',
    stations: {
      exterior: 'Exterior',
      gunner: 'Gunner Optic FCS',
      interior: 'Fighting Compartment',
    },
    optics: {
      daylight: 'Daylight',
      flir_whot: 'FLIR White-Hot',
      flir_bhot: 'FLIR Black-Hot',
      green_nvg: 'Green NVG',
    },
    abramsOptics: {
      flir_whot: 'GPS FLIR · WHITE-HOT',
      green_nvg: 'GREEN-NVG',
      daylight: 'DAY',
    },
    tigerOptics: {
      daylight: 'Zeiss Daylight 2.5x/5x',
      flir_whot: 'Museum FLIR Study',
    },
    yaw: 'Turret Traverse Azimuth',
    elev: 'Main Gun Elevation',
    range: 'Laser Rangefinder',
    rangeOptical: 'Optical Range Drum',
    speed: 'Target Crossing Speed',
    laseBtn: 'Lase & Auto-Lay Gun',
    setDrumBtn: 'Set Zeiss Range Drum',
    resetBtn: 'Center Turret',
    closeBtn: 'Close Crew Station',
    superelevation: 'Superelevation',
    lead: 'Dynamic Lead',
    tof: 'Flight Time',
    cantLabel: 'Trunnion Cant',
  },
};

function resolveOpticButtonLabel(
  profile: TankGunnerOpticProfile,
  mode: TankOpticMode,
  ui: TankCrewLocaleStrings
): string {
  if (profile.reticleStyle === 'us_m1a2_gps') {
    if (mode === 'flir_whot' || mode === 'green_nvg' || mode === 'daylight') {
      return ui.abramsOptics[mode];
    }
  }
  if (profile.reticleStyle === 'ww2_tzf9b') {
    if (mode === 'daylight' || mode === 'flir_whot') {
      return ui.tigerOptics[mode];
    }
  }
  return ui.optics[mode];
}

interface ReticleSvgProps {
  profile: TankGunnerOpticProfile;
  opticMode: TankOpticMode;
  turretYawDeg: number;
  gunElevDeg: number;
  lrfRangeM: number;
  hullCantDeg: number;
  fcsReady: boolean;
  fcs: TankFcsSolution;
  lang: 'zh' | 'en';
}

const TankGunnerReticleSvg: React.FC<ReticleSvgProps> = ({
  profile,
  opticMode,
  turretYawDeg,
  gunElevDeg,
  lrfRangeM,
  hullCantDeg,
  fcsReady,
  fcs,
  lang,
}) => {
  const cx = 600;
  const cy = 340;
  const leadShiftX = Math.max(-130, Math.min(130, fcs.leadMil * 5.2));
  const dropShiftY = Math.max(-75, Math.min(115, fcs.superelevationMil * 3.4));
  const modeTag =
    opticMode === 'flir_whot'
      ? 'WHOT FLIR'
      : opticMode === 'flir_bhot'
        ? 'BHOT FLIR'
        : opticMode === 'green_nvg'
          ? 'GREEN-NVG'
          : 'DAY OPTIC';

  // 1. ZTZ-99A — PLA Digital LRF Ballistic Box + Cyan/Green Stadiametric Lead Brackets
  if (profile.reticleStyle === 'pla_ztz99a') {
    const aimX = cx + leadShiftX;
    const aimY = cy + dropShiftY;
    return (
      <svg viewBox="0 0 1200 680" className="tank-reticle-svg">
        <defs>
          <radialGradient id="gunnerVigPla" cx="50%" cy="50%" r="56%">
            <stop offset="68%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(2,10,18,0.52)" />
          </radialGradient>
        </defs>
        <rect width="1200" height="680" fill="url(#gunnerVigPla)" />

        {/* Digital LRF central ballistic corner gate */}
        <path
          d={`M ${cx - 56} ${cy - 36} H ${cx - 32} M ${cx - 56} ${cy - 36} V ${cy - 18}
              M ${cx + 56} ${cy - 36} H ${cx + 32} M ${cx + 56} ${cy - 36} V ${cy - 18}
              M ${cx - 56} ${cy + 36} H ${cx - 32} M ${cx - 56} ${cy + 36} V ${cy + 18}
              M ${cx + 56} ${cy + 36} H ${cx + 32} M ${cx + 56} ${cy + 36} V ${cy + 18}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.2"
        />

        {/* Horizontal stadiametric lead brackets & mil ticks */}
        <line x1="340" y1={cy} x2={cx - 64} y2={cy} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx + 64} y1={cy} x2="860" y2={cy} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx} y1="190" x2={cx} y2={cy - 44} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx} y1={cy + 44} x2={cx} y2="480" stroke="currentColor" strokeWidth="1.5" />

        {PLA_STADIA_TICKS.map((m) => (
          <g key={m}>
            <line
              x1={cx + m * 7.2}
              y1={cy - (Math.abs(m) === 20 ? 11 : 7)}
              x2={cx + m * 7.2}
              y2={cy + (Math.abs(m) === 20 ? 11 : 7)}
              stroke="currentColor"
              strokeWidth="1.4"
            />
            <text
              x={cx + m * 7.2}
              y={cy + 24}
              textAnchor="middle"
              fill="currentColor"
              fontSize="10"
              fontFamily="monospace"
            >
              {Math.abs(m)}
            </text>
          </g>
        ))}

        {/* Stadiametric 2.3m MBT height rangefinder curve (lower-left) */}
        <path
          d="M 355 462 H 470 M 355 462 C 378 440, 415 415, 470 404"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.35"
          opacity="0.82"
        />
        <text
          x="412"
          y="478"
          textAnchor="middle"
          fill="currentColor"
          fontSize="10"
          fontFamily="monospace"
          opacity="0.85"
        >
          STADIA 2.3m · 10 / 20 / 30
        </text>

        {/* Computed FCS aim-off reticle chevron */}
        <polygon
          points={`${aimX},${aimY - 9} ${aimX + 9},${aimY + 7} ${aimX - 9},${aimY + 7}`}
          fill="none"
          stroke="#22d3ee"
          strokeWidth="2.1"
        />
        <circle cx={aimX} cy={aimY} r="2.2" fill="#22d3ee" />

        {/* Top PLA telemetry strip */}
        <rect
          x="360"
          y="64"
          width="480"
          height="30"
          rx="4"
          fill="rgba(4, 18, 28, 0.62)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <text
          x={cx}
          y="83"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12.5"
          fontWeight="700"
          fontFamily="monospace"
        >
          {fcsReady ? 'LASE / READY / APFSDS-125' : 'STANDBY / APFSDS-125'} ·{' '}
          {modeTag} · {profile.magnificationLabel}
        </text>

        {/* Bottom digital LRF + ballistic readout bar */}
        <rect
          x="335"
          y="510"
          width="530"
          height="32"
          rx="4"
          fill="rgba(4, 18, 28, 0.66)"
          stroke="currentColor"
          strokeWidth="1.2"
        />
        <text
          x={cx}
          y="530"
          textAnchor="middle"
          fill="currentColor"
          fontSize="13"
          fontWeight="700"
          fontFamily="monospace"
        >
          LRF {lrfRangeM}m · YAW {Math.round(turretYawDeg)}° · ELEV{' '}
          {gunElevDeg.toFixed(1)}° · LEAD {fcs.leadMil >= 0 ? '+' : ''}
          {fcs.leadMil.toFixed(1)}mrad · TOF {fcs.tofSec.toFixed(2)}s
        </text>
      </svg>
    );
  }

  // 2. M1A2 SEP v3 — Abrams GPS Thermal Crosshair + Stepped Mil-Ticks + READY TO FIRE
  if (profile.reticleStyle === 'us_m1a2_gps') {
    const aimX = cx + leadShiftX;
    const aimY = cy + dropShiftY;
    const gpsModeText =
      opticMode === 'flir_whot'
        ? 'GPS FLIR · WHITE-HOT'
        : opticMode === 'green_nvg'
          ? 'GPS FLIR · GREEN-NVG'
          : 'GPS PRIMARY · DAY';

    return (
      <svg viewBox="0 0 1200 680" className="tank-reticle-svg">
        <defs>
          <radialGradient id="gunnerVigUs" cx="50%" cy="50%" r="58%">
            <stop offset="70%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(5,12,8,0.56)" />
          </radialGradient>
        </defs>
        <rect width="1200" height="680" fill="url(#gunnerVigUs)" />

        {/* Abrams GPS rectangular viewport frame */}
        <rect
          x="290"
          y="108"
          width="620"
          height="432"
          rx="6"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.3"
          strokeDasharray="18 10"
          opacity="0.55"
        />

        {/* Heavy outer stadia bars tapering to fine stepped GPS crosshair */}
        <line x1="330" y1={cy} x2={cx - 110} y2={cy} stroke="currentColor" strokeWidth="3.2" />
        <line x1={cx - 110} y1={cy} x2={cx - 12} y2={cy} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx + 12} y1={cy} x2={cx + 110} y2={cy} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx + 110} y1={cy} x2="870" y2={cy} stroke="currentColor" strokeWidth="3.2" />

        <line x1={cx} y1="150" x2={cx} y2={cy - 92} stroke="currentColor" strokeWidth="3.0" />
        <line x1={cx} y1={cy - 92} x2={cx} y2={cy - 12} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx} y1={cy + 12} x2={cx} y2={cy + 92} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx} y1={cy + 92} x2={cx} y2="492" stroke="currentColor" strokeWidth="3.0" />

        {/* Central ballistic floating dot + stepped mil ticks */}
        <rect
          x={cx - 5}
          y={cy - 5}
          width="10"
          height="10"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
        />
        {ABRAMS_MIL_TICKS.map((m) => (
          <line
            key={m}
            x1={cx + m * 7}
            y1={cy - (Math.abs(m) === 10 ? 10 : 6)}
            x2={cx + m * 7}
            y2={cy + (Math.abs(m) === 10 ? 10 : 6)}
            stroke="currentColor"
            strokeWidth="1.5"
          />
        ))}

        {/* Stepped vertical ballistic drop stadia */}
        {[1, 2, 3, 4].map((step) => (
          <line
            key={step}
            x1={cx - (26 - step * 4)}
            y1={cy + step * 24}
            x2={cx + (26 - step * 4)}
            y2={cy + step * 24}
            stroke="currentColor"
            strokeWidth="1.4"
          />
        ))}

        {/* Dynamic GPS lead aim-box */}
        <rect
          x={aimX - 7}
          y={aimY - 7}
          width="14"
          height="14"
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2"
        />

        {/* Top GPS FLIR mode banner */}
        <text
          x={cx}
          y="92"
          textAnchor="middle"
          fill="currentColor"
          fontSize="13"
          fontWeight="700"
          fontFamily="monospace"
        >
          {gpsModeText} · {profile.magnificationLabel} · {profile.ammoTag}
        </text>

        {/* Amber READY TO FIRE annunciator + digital range bar */}
        <rect
          x="455"
          y="502"
          width="290"
          height="28"
          rx="4"
          fill="rgba(120, 53, 15, 0.58)"
          stroke="#f59e0b"
          strokeWidth="1.5"
        />
        <text
          x={cx}
          y="521"
          textAnchor="middle"
          fill="#fcd34d"
          fontSize="13"
          fontWeight="800"
          fontFamily="monospace"
        >
          {fcsReady ? 'READY TO FIRE' : 'SAFE'} · LRF {lrfRangeM}m ·{' '}
          {fcs.tofSec.toFixed(2)}s
        </text>
        <text
          x={cx}
          y="556"
          textAnchor="middle"
          fill="currentColor"
          fontSize="11.5"
          fontFamily="monospace"
        >
          AZ {Math.round(turretYawDeg)}° · EL {gunElevDeg.toFixed(1)}° · SUP{' '}
          {fcs.superelevationMil.toFixed(1)} MIL · LEAD{' '}
          {fcs.leadMil >= 0 ? '+' : ''}
          {fcs.leadMil.toFixed(1)} MIL
        </text>
      </svg>
    );
  }

  // 3. Leopard 2A7V — EMES-15 German Precision Chevron Reticle + Laser Range Bar + Cant Indicator
  if (profile.reticleStyle === 'de_emes15') {
    const aimX = cx + leadShiftX;
    const aimY = cy + dropShiftY;
    const cantRad = (hullCantDeg * Math.PI) / 180;
    const cantDx = Math.sin(cantRad) * 44;
    const cantDy = Math.cos(cantRad) * 44;

    return (
      <svg viewBox="0 0 1200 680" className="tank-reticle-svg">
        <defs>
          <radialGradient id="gunnerVigDe" cx="50%" cy="50%" r="55%">
            <stop offset="68%" stopColor="rgba(0,0,0,0)" />
            <stop offset="100%" stopColor="rgba(4,8,16,0.54)" />
          </radialGradient>
        </defs>
        <rect width="1200" height="680" fill="url(#gunnerVigDe)" />

        {/* EMES-15 crisp central German precision chevron */}
        <path
          d={`M ${cx - 18} ${cy + 14} L ${cx} ${cy - 4} L ${cx + 18} ${cy + 14}`}
          fill="none"
          stroke="currentColor"
          strokeWidth="2.4"
          strokeLinejoin="miter"
        />
        <circle cx={cx} cy={cy - 4} r="2.2" fill="currentColor" />

        {/* Flanking horizontal precision bars + mil ticks */}
        <line x1="360" y1={cy} x2={cx - 46} y2={cy} stroke="currentColor" strokeWidth="1.7" />
        <line x1={cx + 46} y1={cy} x2="840" y2={cy} stroke="currentColor" strokeWidth="1.7" />
        <line x1={cx} y1="196" x2={cx} y2={cy - 34} stroke="currentColor" strokeWidth="1.5" />
        <line x1={cx} y1={cy + 34} x2={cx} y2="462" stroke="currentColor" strokeWidth="1.5" />

        {EMES_STADIA_TICKS.map((m) => (
          <line
            key={m}
            x1={cx + m * 8}
            y1={cy - (Math.abs(m) >= 10 ? 9 : 5)}
            x2={cx + m * 8}
            y2={cy + (Math.abs(m) >= 10 ? 9 : 5)}
            stroke="currentColor"
            strokeWidth="1.4"
          />
        ))}

        {/* Computed ballistic lead chevron */}
        <path
          d={`M ${aimX - 10} ${aimY + 8} L ${aimX} ${aimY - 3} L ${aimX + 10} ${aimY + 8}`}
          fill="none"
          stroke="#fbbf24"
          strokeWidth="2.0"
        />

        {/* EMES-15 Trunnion Cant Indicator (upper right arc) */}
        <g transform="translate(835, 165)">
          <path
            d="M -46 0 A 46 46 0 0 1 46 0"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.4"
            opacity="0.72"
          />
          <line
            x1={-cantDy * 0.72}
            y1={-cantDx * 0.72}
            x2={cantDy * 0.72}
            y2={cantDx * 0.72}
            stroke="#fbbf24"
            strokeWidth="2.1"
          />
          <text
            x="0"
            y="22"
            textAnchor="middle"
            fill="currentColor"
            fontSize="11"
            fontFamily="monospace"
          >
            CANT {hullCantDeg >= 0 ? '+' : ''}
            {hullCantDeg.toFixed(1)}°
          </text>
        </g>

        {/* Top EMES-15 header */}
        <text
          x={cx}
          y="94"
          textAnchor="middle"
          fill="currentColor"
          fontSize="12.5"
          fontWeight="700"
          fontFamily="monospace"
        >
          EMES-15 · {modeTag} · {profile.ammoTag} · {profile.magnificationLabel}
        </text>

        {/* Bottom laser range bar */}
        <rect
          x="395"
          y="494"
          width="410"
          height="32"
          rx="3"
          fill="rgba(10, 14, 24, 0.68)"
          stroke="currentColor"
          strokeWidth="1.5"
        />
        <text
          x={cx}
          y="515"
          textAnchor="middle"
          fill="currentColor"
          fontSize="14"
          fontWeight="800"
          fontFamily="monospace"
        >
          [ LRF {String(lrfRangeM).padStart(4, '0')} m ] · KE ·{' '}
          {fcs.superelevationMil.toFixed(1)} MIL
        </text>
        <text
          x={cx}
          y="546"
          textAnchor="middle"
          fill="currentColor"
          fontSize="11"
          fontFamily="monospace"
        >
          YAW {Math.round(turretYawDeg)}° · ELEV {gunElevDeg.toFixed(1)}° · LEAD{' '}
          {fcs.leadMil >= 0 ? '+' : ''}
          {fcs.leadMil.toFixed(1)} MIL · TOF {fcs.tofSec.toFixed(2)}s
        </text>
      </svg>
    );
  }

  // 4. Tiger 131 — Iconic WWII Carl Zeiss TZF-9b Optical Reticle + 0–4,000 m Circular Range Drum
  const drumRadius = 258;
  const activeDrumFrac = Math.max(0, Math.min(1, lrfRangeM / 4000));
  const activeDrumAngleDeg = -135 + activeDrumFrac * 270;
  const isMuseumThermal = opticMode !== 'daylight';

  return (
    <svg viewBox="0 0 1200 680" className="tank-reticle-svg">
      <defs>
        <mask id="tzf9bOcularMask">
          <rect width="1200" height="680" fill="white" />
          <circle cx={cx} cy={cy} r="286" fill="black" />
        </mask>
        <radialGradient id="tzf9bGlassTint" cx="50%" cy="50%" r="50%">
          <stop offset="76%" stopColor="rgba(220, 232, 204, 0.04)" />
          <stop offset="96%" stopColor="rgba(24, 30, 22, 0.24)" />
          <stop offset="100%" stopColor="rgba(6, 8, 6, 0.72)" />
        </radialGradient>
      </defs>

      {/* Circular Zeiss optical eyepiece dark surround + subtle daylight optical glass tint */}
      <rect
        width="1200"
        height="680"
        fill="rgba(5, 7, 10, 0.78)"
        mask="url(#tzf9bOcularMask)"
      />
      <circle
        cx={cx}
        cy={cy}
        r="286"
        fill="url(#tzf9bGlassTint)"
        stroke="currentColor"
        strokeWidth="2.4"
      />
      <circle
        cx={cx}
        cy={cy}
        r="232"
        fill="none"
        stroke="currentColor"
        strokeWidth="0.9"
        strokeDasharray="4 6"
        opacity="0.45"
      />

      {/* Circular outer range-drum scale (0–4,000 m in 400 m graduations: 0..40 ×100m) */}
      {ZEISS_DRUM_MARKS.map((hm) => {
        const frac = (hm * 100) / 4000;
        const deg = -135 + frac * 270;
        const rad = ((deg - 90) * Math.PI) / 180;
        const x1 = cx + Math.cos(rad) * (drumRadius - 11);
        const y1 = cy + Math.sin(rad) * (drumRadius - 11);
        const x2 = cx + Math.cos(rad) * (drumRadius + 3);
        const y2 = cy + Math.sin(rad) * (drumRadius + 3);
        const lx = cx + Math.cos(rad) * (drumRadius + 16);
        const ly = cy + Math.sin(rad) * (drumRadius + 16);
        return (
          <g key={hm}>
            <line
              x1={x1}
              y1={y1}
              x2={x2}
              y2={y2}
              stroke="currentColor"
              strokeWidth={hm % 8 === 0 ? '2' : '1.2'}
            />
            <text
              x={lx}
              y={ly + 4}
              textAnchor="middle"
              fill="currentColor"
              fontSize="10.5"
              fontWeight={hm % 8 === 0 ? '700' : '500'}
              fontFamily="monospace"
            >
              {hm}
            </text>
          </g>
        );
      })}

      {/* Live range-drum index pointer synced to current rangeM */}
      {(() => {
        const rad = ((activeDrumAngleDeg - 90) * Math.PI) / 180;
        const tipX = cx + Math.cos(rad) * (drumRadius - 14);
        const tipY = cy + Math.sin(rad) * (drumRadius - 14);
        const baseL = rad - 0.035;
        const baseR = rad + 0.035;
        const lx = cx + Math.cos(baseL) * (drumRadius - 29);
        const ly = cy + Math.sin(baseL) * (drumRadius - 29);
        const rx = cx + Math.cos(baseR) * (drumRadius - 29);
        const ry = cy + Math.sin(baseR) * (drumRadius - 29);
        return (
          <polygon
            points={`${tipX},${tipY} ${lx},${ly} ${rx},${ry}`}
            fill="#f59e0b"
            stroke="#0f172a"
            strokeWidth="0.9"
          />
        );
      })()}

      {/* Iconic Carl Zeiss TZF-9b Stadiametric Triangles:
          Central large 4-mil aiming triangle flanked by 3 smaller 2-mil triangles on each side */}
      <line
        x1={cx - 196}
        y1={cy}
        x2={cx - 122}
        y2={cy}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={cx + 122}
        y1={cy}
        x2={cx + 196}
        y2={cy}
        stroke="currentColor"
        strokeWidth="1.6"
      />
      <line
        x1={cx}
        y1={cy + 26}
        x2={cx}
        y2={cy + 148}
        stroke="currentColor"
        strokeWidth="1.5"
      />

      {/* Central large 4-mil apex triangle (exact apex on optical axis cx, cy) */}
      <polygon
        points={`${cx},${cy} ${cx - 15},${cy + 24} ${cx + 15},${cy + 24}`}
        fill="currentColor"
        data-testid="tzf9b-center-triangle"
      />

      {/* 3 smaller 2-mil rangefinding triangles on left (-1,-2,-3) & right (+1,+2,+3) at 4-mil intervals */}
      {[-3, -2, -1, 1, 2, 3].map((slot) => {
        const tx = cx + slot * 34;
        return (
          <polygon
            key={slot}
            points={`${tx},${cy} ${tx - 7.5},${cy + 12} ${tx + 7.5},${cy + 12}`}
            fill="currentColor"
            data-testid={`tzf9b-side-triangle-${slot}`}
          />
        );
      })}

      {/* Fine horizontal 4-mil mil-bar ticks between side triangles */}
      {[-3, -2, -1, 1, 2, 3].map((slot) => (
        <line
          key={`bar-${slot}`}
          x1={cx + slot * 34}
          y1={cy - 6}
          x2={cx + slot * 34}
          y2={cy}
          stroke="currentColor"
          strokeWidth="1.2"
        />
      ))}

      {/* Historical TZF-9b PzGr.39 engraved bezel callout */}
      <text
        x={cx}
        y={cy - 182}
        textAnchor="middle"
        fill="currentColor"
        fontSize="12"
        fontWeight="700"
        fontFamily="monospace"
      >
        CARL ZEISS TZF 9b · 8.8cm KwK 36 · PzGr.39
      </text>
      <text
        x={cx}
        y={cy + 186}
        textAnchor="middle"
        fill="currentColor"
        fontSize="12.5"
        fontWeight="700"
        fontFamily="monospace"
      >
        DRUM {lrfRangeM} m · SUP {fcs.superelevationMil.toFixed(1)} MIL · TOF{' '}
        {fcs.tofSec.toFixed(2)}s
      </text>

      {/* Clear disclaimer badge whenever optional museum FLIR study overlay is toggled on Tiger 131 */}
      {isMuseumThermal && (
        <g data-testid="tiger-museum-thermal-note">
          <rect
            x="320"
            y="24"
            width="560"
            height="28"
            rx="5"
            fill="rgba(15, 23, 42, 0.85)"
            stroke="#fbbf24"
            strokeWidth="1.3"
          />
          <text
            x={cx}
            y="43"
            textAnchor="middle"
            fill="#fde68a"
            fontSize="11.5"
            fontWeight="700"
            fontFamily="monospace"
          >
            {lang === 'zh'
              ? profile.museumStudyThermalNoteZh
              : profile.museumStudyThermalNoteEn}
          </text>
        </g>
      )}
    </svg>
  );
};

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
  const hullCantDeg = useTankCrewStore((s) => s.hullCantDeg);
  const fcsReady = useTankCrewStore((s) => s.fcsReady);

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
  const opticProfile = getTankGunnerOpticProfile(activeWeaponId);
  const isTank = isTankWeapon(activeWeaponId) && spec !== null && opticProfile !== null;

  // Apply thermal / NVG / WWII Zeiss CSS optic treatment onto the persistent 3D canvas container
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const canvasWrap = document.querySelector('.canvas-container');
    if (!canvasWrap) return;
    if (active && isTank && opticMode === 'flir_whot') {
      canvasWrap.setAttribute('data-flir-optic', 'whot');
    } else if (active && isTank && opticMode === 'flir_bhot') {
      canvasWrap.setAttribute('data-flir-optic', 'bhot');
    } else if (active && isTank && opticMode === 'green_nvg') {
      canvasWrap.setAttribute('data-flir-optic', 'green_nvg');
    } else if (
      active &&
      isTank &&
      station === 'gunner' &&
      opticProfile?.reticleStyle === 'ww2_tzf9b'
    ) {
      canvasWrap.setAttribute('data-flir-optic', 'zeiss_day');
    } else {
      canvasWrap.removeAttribute('data-flir-optic');
    }
    return () => {
      canvasWrap.removeAttribute('data-flir-optic');
    };
  }, [active, isTank, opticMode, station, opticProfile]);

  if (!active || !isTank || !spec || !opticProfile) return null;

  const ui = TANK_CREW_STRINGS[lang];
  const fcs = computeTankFcsSolution(activeWeaponId, lrfRangeM, targetSpeedKph);
  const [minElev, maxElev] = spec.elevLimitsDeg;
  const sightLabel =
    lang === 'zh' ? opticProfile.designationZh : opticProfile.designationEn;
  const rangeLabel = opticProfile.hasLaserRangefinder
    ? ui.range
    : ui.rangeOptical;
  const actionBtnLabel = opticProfile.hasLaserRangefinder
    ? ui.laseBtn
    : ui.setDrumBtn;

  return (
    <>
      {station === 'gunner' && (
        <div
          className={`tank-gunner-reticle-overlay is-${opticMode} is-reticle-${opticProfile.reticleStyle}`}
          data-testid="tank-gunner-reticle"
          data-reticle-style={opticProfile.reticleStyle}
          aria-hidden="true"
        >
          <TankGunnerReticleSvg
            profile={opticProfile}
            opticMode={opticMode}
            turretYawDeg={turretYawDeg}
            gunElevDeg={gunElevDeg}
            lrfRangeM={lrfRangeM}
            hullCantDeg={hullCantDeg}
            fcsReady={fcsReady}
            fcs={fcs}
            lang={lang}
          />
        </div>
      )}

      <section
        className={`tank-crew-hud is-nation-${opticProfile.reticleStyle}`}
        data-testid="tank-crew-hud"
        aria-label={ui.badge}
      >
        <div className="tank-crew-head">
          <div className="tank-crew-title-wrap">
            <span className="tank-crew-badge">
              <Shield size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
              <em className="tank-crew-nation-tag">{opticProfile.nationCode}</em>
            </span>
            <p className="tank-crew-sight">{sightLabel}</p>
          </div>
          <div className="tank-crew-head-btns">
            <button
              type="button"
              className="tank-crew-icon-btn"
              title={ui.resetBtn}
              aria-label={ui.resetBtn}
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
          {opticProfile.supportedOpticModes.map((op) => (
            <button
              key={op}
              type="button"
              className={`tank-crew-pill is-optic ${opticMode === op ? 'is-active' : ''}`}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setOpticMode(op);
              }}
            >
              <span>{resolveOpticButtonLabel(opticProfile, op, ui)}</span>
            </button>
          ))}
        </div>

        {opticProfile.reticleStyle === 'ww2_tzf9b' &&
          opticMode !== 'daylight' && (
            <div className="tank-crew-study-note">
              {lang === 'zh'
                ? opticProfile.museumStudyThermalNoteZh
                : opticProfile.museumStudyThermalNoteEn}
            </div>
          )}

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
              <span>{rangeLabel}</span>
              <strong className="tabular">{lrfRangeM} m</strong>
            </div>
            <input
              type="range"
              min={200}
              max={opticProfile.rangeDrumMaxM}
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
            {opticProfile.hasCantIndicator && (
              <span>
                {ui.cantLabel}: {hullCantDeg >= 0 ? '+' : ''}
                {hullCantDeg.toFixed(1)}°
              </span>
            )}
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
            <span>{actionBtnLabel}</span>
          </button>
        </div>
      </section>
    </>
  );
};

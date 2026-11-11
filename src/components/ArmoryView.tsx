import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Globe2,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  Orbit,
  Rotate3d,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import {
  ARMORY_WEAPONS,
  ArmoryCategory,
  ArmoryWeaponItem,
  matchesArmoryCategory,
} from '../data/armoryCatalog';
import { getShortWeaponLabel } from '../data/weaponRegistry';
import { useExplodeStore } from '../store/useExplodeStore';

const WeaponSilhouetteSvg: React.FC<{ id: string; available: boolean }> = ({
  id,
  available,
}) => {
  const stroke = available ? '#0f172a' : '#64748b';
  const fill = available ? '#1e293b' : '#cbd5e1';
  const subFill = available ? '#334155' : '#94a3b8';
  const accent = available ? '#0284c7' : '#94a3b8';

  switch (id) {
    case 'ak15':
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* EVO Folding Stock + Cheek Riser */}
          <path
            d="M9 29 L14 29 L14 52 L9 51 Z"
            fill={stroke}
            stroke={stroke}
            strokeWidth="1"
          />
          <path
            d="M14 31 L46 31 L46 40 L31 42 L14 50 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <path
            d="M21 27.5 L41 27.5 L43 31 L19 31 Z"
            fill={accent}
            opacity="0.85"
          />
          {/* Stamped Receiver + Railed Cover + Handguard */}
          <path
            d="M46 27 L98 27 L98 41 L46 41 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.3"
          />
          <path
            d="M98 28 L134 28 L135 39 L98 40 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <line
            x1="48"
            y1="25.5"
            x2="133"
            y2="25.5"
            stroke={accent}
            strokeWidth="1.7"
            strokeDasharray="2.5 1.8"
          />
          <rect x="50" y="21" width="5.5" height="4.5" rx="0.8" fill={stroke} />
          {/* Barrel + 90-deg Gas Block + Slotted Suppressor-Mount Flash Hider */}
          <rect x="134" y="32.5" width="26" height="3.1" fill={fill} />
          <path
            d="M136 28 L143 28 L144 21.5 L139 21.5 L137 32.5 L136 32.5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.1"
          />
          <rect
            x="159"
            y="31.3"
            width="12"
            height="5.4"
            rx="1.2"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.1"
          />
          {/* Grip + Guard + 30-Rd Windowed Banana Mag */}
          <path
            d="M54 41 L65 41 L57 64 L46 62 L53 43 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <rect
            x="65"
            y="41"
            width="14"
            height="7.5"
            fill="none"
            stroke={stroke}
            strokeWidth="1.2"
          />
          <path
            d="M82 41 L96 41 Q102 59 113 73 L100 78 Q88 63 82 41 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <path
            d="M90 48 Q95 58 101 68"
            fill="none"
            stroke={available ? '#f59e0b' : '#94a3b8'}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
        </svg>
      );

    case 'm4a1':
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Buffer Tube + M4 Waffle Collapsible Stock */}
          <rect x="14" y="30" width="33" height="5.5" fill={subFill} />
          <path
            d="M11 27 L35 27 L35 37 L25 46 L11 52 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          {/* Upper & Lower Forged Receivers + Magwell */}
          <path
            d="M46 27 L95 27 L95 43 L79 43 L78 49 L64 49 L64 41 L46 41 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.3"
          />
          {/* Detachable A2 Carry Handle Sight */}
          <path
            d="M52 27 L55 18.5 L88 18.5 L91 27 Z"
            fill="none"
            stroke={stroke}
            strokeWidth="2.1"
            strokeLinejoin="round"
          />
          <rect x="54" y="16.5" width="5" height="3.5" fill={stroke} />
          {/* KAC RAS Picatinny Quad-Rail Handguard */}
          <rect
            x="95"
            y="27"
            width="33"
            height="11.5"
            rx="1"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <line
            x1="97"
            y1="25.6"
            x2="127"
            y2="25.6"
            stroke={accent}
            strokeWidth="1.6"
            strokeDasharray="2.2 1.6"
          />
          <line
            x1="98"
            y1="32.8"
            x2="126"
            y2="32.8"
            stroke="#94a3b8"
            strokeWidth="1.2"
            strokeDasharray="2.2 1.8"
          />
          {/* Triangular A-Frame Front Sight Tower (FSB) + M203 Stepped Barrel + A2 Birdcage */}
          <polygon
            points="129,34 137,34 134,17.5 131,17.5"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.15"
          />
          <rect x="128" y="31.2" width="16" height="3.2" fill={fill} />
          <rect x="144" y="31.7" width="15" height="2.3" fill={fill} />
          <rect
            x="159"
            y="30.8"
            width="9.5"
            height="4.2"
            rx="0.9"
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
          {/* A2 Pistol Grip + Curved 30-Rd Grey STANAG Mag */}
          <path
            d="M52 41 L63 41 L55 64 L45 61 L51 43 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <path
            d="M79 43 L94 43 Q97 60 103 74 L89 77 Q83 61 79 43 Z"
            fill={available ? '#475569' : '#cbd5e1'}
            stroke={stroke}
            strokeWidth="1.25"
          />
        </svg>
      );

    case 'mp5':
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* MP5A3 Retractable Twin-Rail Steel Stock */}
          <path
            d="M14 27 L19 27 L19 48 L14 46 Z"
            fill={stroke}
            stroke={stroke}
            strokeWidth="1.1"
          />
          <line
            x1="19"
            y1="33.5"
            x2="50"
            y2="33.5"
            stroke={stroke}
            strokeWidth="2.2"
          />
          {/* Stamped Fluted Upper Receiver + Cocking Tube */}
          <path
            d="M48 26 L108 26 L108 39 L48 39 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.3"
          />
          <rect
            x="108"
            y="26.5"
            width="34"
            height="4.8"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.1"
          />
          {/* HK Rotary Drum Rear Sight + Hooded Ring Front Sight */}
          <polygon points="51,26 59,26 57,20 52,21" fill={stroke} />
          <circle
            cx="142"
            cy="24.5"
            r="3.6"
            fill="none"
            stroke={stroke}
            strokeWidth="1.5"
          />
          {/* Wide Tropical Forearm + 3-Lug Navy Muzzle */}
          <path
            d="M106 31.5 L143 32.5 L140 41.5 L105 40.5 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <rect x="143" y="33" width="14" height="3.2" rx="0.8" fill={fill} />
          {/* Navy Polymer Grip Housing + Red/White Pictogram Dot + Curved 9mm Steel Mag */}
          <path
            d="M52 39 L84 39 L84 47 L71 47 L63 66 L52 64 L59 44 L52 42 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <circle
            cx="65"
            cy="42.5"
            r="1.6"
            fill={available ? '#ef4444' : '#94a3b8'}
          />
          <path
            d="M88 39 L99 39 Q103 57 110 73 L100 76 Q92 59 88 39 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.25"
          />
        </svg>
      );

    case 'g17':
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Tenifer Slide & Sights */}
          <path
            d="M36 17 L150 17 L153 20 L153 34 L34 34 L34 19 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.35"
          />
          <rect x="39" y="13.5" width="7" height="3.5" rx="0.8" fill={stroke} />
          <polygon points="144,17 149,17 147.5,13.5 145,13.5" fill={stroke} />
          <rect x="85" y="18.5" width="22" height="7" rx="1" fill="#475569" />
          {[42, 46, 50, 54, 58].map((x) => (
            <line
              key={x}
              x1={x}
              y1="20"
              x2={x}
              y2="31.5"
              stroke="#94a3b8"
              strokeWidth="1.2"
            />
          ))}
          {/* Gen3 Polymer Frame, Guard & Grip */}
          <path
            d="M34 34 L152 34 L151 40 L97 40 L97 55 Q97 59 92 59 L73 59 Q69 57 68 53 L55 80 L35 77 L47 44 Q48 38 38 37 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <rect x="73" y="40" width="18" height="14" rx="3" fill="#eef2f6" />
          <path
            d="M83 40 Q84 48 80 51"
            fill="none"
            stroke={stroke}
            strokeWidth="2.3"
            strokeLinecap="round"
          />
          <line
            x1="112"
            y1="37"
            x2="147"
            y2="37"
            stroke={accent}
            strokeWidth="1.6"
          />
        </svg>
      );

    case 'm82a1':
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Sheet-Steel Buttstock + Ventilated Upper Forend */}
          <path
            d="M7 29 L12 29 L12 53 L7 52 Z"
            fill={stroke}
            stroke={stroke}
            strokeWidth="1"
          />
          <path
            d="M12 31 L118 30 L121 39 L48 42 L12 50 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          {/* Forend Cooling Oval Vents */}
          {[88, 95, 102, 109].map((x) => (
            <ellipse
              key={x}
              cx={x}
              cy="34.5"
              rx="2.3"
              ry="1.2"
              fill="#94a3b8"
            />
          ))}
          {/* Leupold Mark 4 Sniper Scope + Rings + Carry Handle */}
          <path
            d="M52 20 L62 21.5 L88 21.5 L98 19.5 L98 25.5 L88 24 L62 24 L52 25 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.15"
          />
          <rect x="66" y="24" width="3.5" height="6" fill={stroke} />
          <rect x="83" y="24" width="3.5" height="6" fill={stroke} />
          <rect x="73" y="17.5" width="5" height="4" rx="0.6" fill={accent} />
          {/* 29" Fluted Recoiling Barrel + Iconic Two-Chamber Arrowhead Tank Brake */}
          <rect x="120" y="33" width="39" height="3.6" fill={subFill} />
          <polygon
            points="158,31.5 173,28.5 169,34.8 173,41 158,38"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.25"
          />
          {/* Folding Spiked Bipod + Grip + Massive 10-Rd .50 BMG Box Mag */}
          <line
            x1="113"
            y1="40"
            x2="104"
            y2="68"
            stroke={stroke}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <line
            x1="116"
            y1="40"
            x2="123"
            y2="67"
            stroke={stroke}
            strokeWidth="1.8"
            strokeLinecap="round"
          />
          <path
            d="M46 42 L55 42 L49 62 L40 60 Z"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.15"
          />
          <polygon
            points="67,41 91,40.5 91,66 67,61"
            fill={subFill}
            stroke={stroke}
            strokeWidth="1.25"
          />
        </svg>
      );

    case 'awm': {
      const odChassis = available ? '#3f4e35' : '#cbd5e1';
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* British Olive-Drab Thumbhole Polymer Sniper Chassis */}
          <path
            d="M8 31 L38 31 L46 34 L118 33 L116 41 L58 42 L54 58 L39 58 L39 46 L14 52 L8 51 Z"
            fill={odChassis}
            stroke={stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          {/* Thumbhole Cutout + Black Adjustable Cheekpiece */}
          <rect x="42" y="40" width="9" height="11" rx="3.2" fill="#eef2f6" />
          <path d="M16 27.5 L35 27.5 L36 31 L15 31 Z" fill={stroke} />
          {/* Steel Action + S&B PM II 5-25x56 Scope + Bolt Handle */}
          <rect x="52" y="29" width="36" height="5" fill={fill} />
          <path
            d="M49 18.5 L61 20.5 L89 20.5 L103 18 L103 25 L89 23.5 L61 23.5 L49 24.5 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.15"
          />
          <rect x="72" y="16" width="5.5" height="4.5" fill={accent} />
          <rect x="62" y="23.5" width="22" height="5.5" fill={stroke} />
          <circle cx="59" cy="38" r="2.4" fill={stroke} />
          {/* 27" Fluted Stainless Match Barrel + AI 2-Chamber Brake + Front Spigot Bipod */}
          <rect
            x="118"
            y="30.8"
            width="43"
            height="3.2"
            fill={available ? '#475569' : '#94a3b8'}
          />
          <rect
            x="160"
            y="29.6"
            width="11"
            height="5.6"
            rx="0.9"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.1"
          />
          <line
            x1="117"
            y1="39"
            x2="109"
            y2="65"
            stroke={stroke}
            strokeWidth="2"
            strokeLinecap="round"
          />
          {/* 5-Rd .338 Lapua Magnum Box Magazine */}
          <rect
            x="67"
            y="42"
            width="18"
            height="14"
            rx="1"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.2"
          />
        </svg>
      );
    }

    case 'scar': {
      const fdeUpper = available ? '#a78b62' : '#cbd5e1';
      const fdePoly = available ? '#8f7654' : '#94a3b8';
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Iconic "Ugg-Boot" Folding Telescoping FDE Stock + Cheek Riser */}
          <path
            d="M9 28 L14 28 L14 55 L9 53 Z"
            fill={stroke}
            stroke={stroke}
            strokeWidth="1"
          />
          <path
            d="M14 29 L46 28 L46 42 L29 45 L14 53 Z"
            fill={fdePoly}
            stroke={stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M18 25.5 L42 25.5 L44 29 L16 29 Z"
            fill={fdeUpper}
            stroke={stroke}
            strokeWidth="1"
          />
          {/* Monolithic Extruded FDE Aluminum Upper Receiver + Full Picatinny Rail */}
          <path
            d="M46 24.5 L132 24.5 L132 38.5 L46 38.5 Z"
            fill={fdeUpper}
            stroke={stroke}
            strokeWidth="1.3"
          />
          <line
            x1="48"
            y1="23"
            x2="130"
            y2="23"
            stroke={stroke}
            strokeWidth="1.7"
            strokeDasharray="2.5 1.8"
          />
          {/* Folding Front & Rear Sights + Side Charging Handle */}
          <rect x="50" y="18.5" width="4" height="5" fill={stroke} />
          <rect x="128" y="18.5" width="4" height="6" fill={stroke} />
          <rect x="94" y="29.5" width="8" height="2.6" rx="1" fill={stroke} />
          {/* 14" Barrel + 3-Prong Flash Hider */}
          <rect x="132" y="31.5" width="26" height="3.2" fill={fill} />
          <path
            d="M158 30.3 L169 30.3 L169 31.8 L162 31.8 L162 34.2 L169 34.2 L169 35.7 L158 35.7 Z"
            fill={fill}
          />
          {/* FDE Lower + Grip + 30-Rd FDE STANAG Mag w/ Ranger Floorplate */}
          <path
            d="M48 38.5 L96 38.5 L95 45 L50 45 Z"
            fill={fdePoly}
            stroke={stroke}
            strokeWidth="1.15"
          />
          <path
            d="M54 44 L65 44 L57 66 L46 63 Z"
            fill={fdePoly}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <path
            d="M79 44 L94 44 Q97 60 102 74 L88 77 Q83 61 79 44 Z"
            fill={fdeUpper}
            stroke={stroke}
            strokeWidth="1.25"
          />
        </svg>
      );
    }

    case 'deagle': {
      const chromeMain = available ? '#e2e8f0' : '#cbd5e1';
      const chromeShade = available ? '#94a3b8' : '#94a3b8';
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Massive Polished Chrome Triangular Barrel + Open-Top Bridge Slide */}
          <path
            d="M32 16 L156 16 L158 19.5 L156 35 L32 35 L30 22 Z"
            fill={chromeMain}
            stroke={stroke}
            strokeWidth="1.45"
            strokeLinejoin="round"
          />
          {/* Barrel Top Scope Slots + Gas Cylinder Contour + Ejection Port */}
          <line
            x1="96"
            y1="14.6"
            x2="148"
            y2="14.6"
            stroke={stroke}
            strokeWidth="1.8"
            strokeDasharray="4 3"
          />
          <rect
            x="78"
            y="18"
            width="28"
            height="8.5"
            rx="1.2"
            fill={chromeShade}
          />
          {/* Tear-drop Safety Red Dot + Exposed Spur Hammer */}
          <circle
            cx="42"
            cy="24"
            r="2"
            fill={available ? '#dc2626' : '#64748b'}
          />
          <path
            d="M31 20 L23 16 L27 25"
            fill="none"
            stroke={stroke}
            strokeWidth="2.4"
            strokeLinecap="round"
          />
          {/* Chrome Frame + Black Wrap-Around Rubber Grip + .50 AE Baseplate */}
          <path
            d="M30 35 L154 35 L151 41 L99 41 L99 56 Q99 60 93 60 L74 60 L61 81 L36 78 L47 45 Q47 39 30 39 Z"
            fill={chromeShade}
            stroke={stroke}
            strokeWidth="1.3"
          />
          <path
            d="M49 42 L72 42 L60 78 L39 75 Z"
            fill={available ? '#1e293b' : '#94a3b8'}
            stroke={stroke}
            strokeWidth="1.1"
          />
          <rect x="75" y="41" width="18" height="14" rx="3.5" fill="#eef2f6" />
        </svg>
      );
    }

    case 'aug': {
      const augOlive = available ? '#4b5841' : '#cbd5e1';
      const waffleMag = available ? '#d97706' : '#94a3b8';
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Bullpup Rear Olive-Green Polyamide Stock + Full-Hand Trigger Guard Bow */}
          <path
            d="M12 27 L98 28 L104 37 L96 43 L89 64 L78 63 L81 45 L66 45 L63 63 L55 62 L58 44 L14 49 Z"
            fill={augOlive}
            stroke={stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <rect x="10" y="27" width="4.5" height="22.5" fill={stroke} />
          {/* Rear Bullpup Translucent Amber Waffle Curved Magazine BEHIND Grip */}
          <path
            d="M27 47 L42 46 Q46 62 52 75 L38 78 Q31 63 27 47 Z"
            fill={waffleMag}
            fillOpacity={available ? '0.85' : '1'}
            stroke={stroke}
            strokeWidth="1.25"
          />
          {/* Integrated Slanted 1.5x Swarovski Optical Sight Tube Handle */}
          <path
            d="M62 28 L70 16.5 L115 16.5 L112 28 L105 28 L107 20.5 L74 20.5 L69 28 Z"
            fill={fill}
            stroke={stroke}
            strokeWidth="1.2"
          />
          {/* Folding Vertical Foregrip + Quick-Change 20" Barrel + Tulip Flash Hider */}
          <path
            d="M106 39 L114 39 L111 61 L103 60 Z"
            fill={augOlive}
            stroke={stroke}
            strokeWidth="1.2"
          />
          <rect x="102" y="31.5" width="54" height="3.3" fill={fill} />
          <rect
            x="155"
            y="30.5"
            width="11"
            height="5.2"
            rx="1"
            fill={fill}
            stroke={stroke}
            strokeWidth="1"
          />
        </svg>
      );
    }

    case 'p320':
    default: {
      const pvdSlide = available ? '#9d8363' : '#cbd5e1';
      const fdeGrip = available ? '#8d7251' : '#94a3b8';
      return (
        <svg viewBox="0 0 180 86" className="weapon-silhouette-svg" aria-hidden>
          {/* Coyote Tan PVD Stainless Slide + Black Optic Plate Rear Sight */}
          <path
            d="M36 17 L148 17 L152 21 L152 34 L34 34 L34 20 Z"
            fill={pvdSlide}
            stroke={stroke}
            strokeWidth="1.35"
          />
          <rect x="38" y="13.2" width="12" height="3.8" rx="0.8" fill={stroke} />
          <polygon points="143,17 148,17 146.5,13.5 144,13.5" fill={stroke} />
          <rect x="84" y="18.5" width="22" height="7" rx="1" fill={fill} />
          {/* Coyote FDE Modular Carry Grip w/ Beavertail, M1913 Rail & FCU Window */}
          <path
            d="M29 34 L150 34 L149 41 L98 41 L98 55 Q98 59 92 59 L73 59 L57 79 L36 76 L47 45 Q47 39 29 37 Z"
            fill={fdeGrip}
            stroke={stroke}
            strokeWidth="1.25"
          />
          {/* Serialized Stainless FCU Window + M17 Manual Safety + Coyote Baseplate */}
          <rect
            x="64"
            y="36.2"
            width="11"
            height="3.2"
            rx="0.8"
            fill="#e2e8f0"
            stroke={stroke}
            strokeWidth="0.7"
          />
          <line
            x1="40"
            y1="35.5"
            x2="50"
            y2="34.5"
            stroke={stroke}
            strokeWidth="2.1"
            strokeLinecap="round"
          />
          <rect x="74" y="41" width="18" height="14" rx="3.2" fill="#eef2f6" />
          <path
            d="M34 75 L59 78 L58 82 L33 79 Z"
            fill={pvdSlide}
            stroke={stroke}
            strokeWidth="1.1"
          />
        </svg>
      );
    }
  }
};

const CATEGORY_FILTER_DEFS: { key: ArmoryCategory; labelBase: string }[] = [
  { key: 'all', labelBase: '全部馆藏' },
  { key: 'assault', labelBase: '突击/卡宾/无托' },
  { key: 'smg', labelBase: '冲锋枪' },
  { key: 'sniper', labelBase: '狙击/反器材' },
  { key: 'pistol', labelBase: '半自动手枪' },
];

export const ArmoryView: React.FC = () => {
  const [category, setCategory] = useState<ArmoryCategory>('all');
  const [plannedToast, setPlannedToast] = useState<string | null>(null);
  const rackScrollRef = useRef<HTMLDivElement>(null);

  const activeWeaponId = useExplodeStore((s) => s.activeWeaponId);
  const selectArmoryWeapon = useExplodeStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useExplodeStore((s) => s.enterWorkbench);
  const armoryAutoRotate = useExplodeStore((s) => s.armoryAutoRotate);
  const toggleArmoryAutoRotate = useExplodeStore(
    (s) => s.toggleArmoryAutoRotate
  );
  const xrayShells = useExplodeStore((s) => s.xrayShells);
  const toggleXrayShells = useExplodeStore((s) => s.toggleXrayShells);
  const pbrTexturesEnabled = useExplodeStore((s) => s.pbrTexturesEnabled);
  const togglePbrTextures = useExplodeStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useExplodeStore((s) => s.setTextureModalOpen);

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const shortWeaponTag = getShortWeaponLabel(featuredWeapon.id);

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesArmoryCategory(w, category)
  );

  const scrollRackBy = (dir: -1 | 1) => {
    if (!rackScrollRef.current) return;
    rackScrollRef.current.scrollBy({
      left: dir * 480,
      behavior: 'smooth',
    });
  };

  const handleCardBodyClick = (
    item: ArmoryWeaponItem,
    cardEl?: HTMLDivElement | null
  ) => {
    if (cardEl) {
      cardEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
    if (item.available) {
      if (item.id !== activeWeaponId) {
        selectArmoryWeapon(item.id);
      } else {
        enterWorkbench(item.id);
      }
      return;
    }
    setPlannedToast(
      `「${item.nameCn}」模块正在接入中，当前可预览并拆解已入库枪械`
    );
    window.setTimeout(() => {
      setPlannedToast((prev) => (prev?.includes(item.nameCn) ? null : prev));
    }, 3000);
  };

  const featuredOriginTag = featuredWeapon.originCountryCn
    ? `${featuredWeapon.originCountryCn} · ${
        featuredWeapon.weaponTypeCn ?? featuredWeapon.categoryCn
      }`
    : featuredWeapon.categoryCn;

  return (
    <div className="armory-overlay">
      {/* Top Digital Armory Header */}
      <header className="armory-header">
        <div className="brand-block">
          <div className="brand-badge armory-vault-badge">DIGITAL ARMORY</div>
          <div>
            <h1 className="brand-title">枪械内部结构 3D 数字枪库</h1>
            <p className="brand-sub">
              十款世界名枪交互式陈列馆 · 选择枪械预览 3D 真铁材质并进入爆炸拆解与击发演示
            </p>
          </div>
        </div>

        <div className="armory-header-actions">
          <div className="armory-filter-pills" role="tablist" aria-label="枪械类别筛选">
            {CATEGORY_FILTER_DEFS.map((tab) => {
              const count = ARMORY_WEAPONS.filter((w) =>
                matchesArmoryCategory(w, tab.key)
              ).length;
              return (
                <button
                  key={tab.key}
                  type="button"
                  className={`armory-filter-btn ${
                    category === tab.key ? 'active' : ''
                  }`}
                  onClick={() => setCategory(tab.key)}
                >
                  {tab.labelBase} ({count})
                </button>
              );
            })}
          </div>

          <button
            type="button"
            className="armory-quick-enter-btn"
            onClick={() => enterWorkbench(featuredWeapon.id)}
          >
            <Wrench size={14} />
            <span>进入 {shortWeaponTag} 拆解台</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

      {/* Left Featured Weapon Technical Plaque */}
      <aside className="armory-hero-plaque">
        <div className="plaque-status-row">
          <div className="plaque-bay-cluster">
            <span className="plaque-bay-tag">{featuredWeapon.bayCode}</span>
            <span className="plaque-origin-pill">
              <Globe2 size={11} />
              <span>{featuredOriginTag}</span>
            </span>
          </div>
          <span className="plaque-ready-pill">
            <CheckCircle2 size={11} />
            {featuredWeapon.statusLabel}
          </span>
        </div>

        <h2 className="plaque-weapon-title">{featuredWeapon.nameCn}</h2>
        <div className="plaque-weapon-sub">{featuredWeapon.modelCode}</div>

        <p className="plaque-desc">{featuredWeapon.description}</p>

        <div className="plaque-spec-grid">
          <div className="plaque-spec-cell">
            <span className="spec-k">口径规格</span>
            <span className="spec-v">{featuredWeapon.caliber}</span>
          </div>
          <div className="plaque-spec-cell">
            <span className="spec-k">建模精度</span>
            <span className="spec-v">
              {featuredWeapon.assembliesCount} 总成 /{' '}
              {featuredWeapon.partsCount} 零件
            </span>
          </div>
          <div className="plaque-spec-cell full">
            <span className="spec-k">核心自动与闭锁原理</span>
            <span className="spec-v">{featuredWeapon.actionMechanism}</span>
          </div>
        </div>

        <div className="plaque-feature-chips">
          {featuredWeapon.highlights.map((h) => (
            <span key={h} className="plaque-chip">
              {h}
            </span>
          ))}
        </div>

        <button
          type="button"
          className="plaque-primary-cta"
          onClick={() => enterWorkbench(featuredWeapon.id)}
        >
          <Layers size={16} />
          <span>进入 {shortWeaponTag} 分解与发射演示</span>
          <ArrowRight size={16} />
        </button>
      </aside>

      {/* Right Turntable Controls & Direct Click Hint */}
      <div className="armory-stage-controls">
        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            pbrTexturesEnabled ? 'active-cyan' : ''
          }`}
          onClick={togglePbrTextures}
          title="开启或关闭真实 2K PBR 材质贴图 (Albedo + Normal + Roughness)"
        >
          <Sparkles size={14} />
          <span>
            {pbrTexturesEnabled ? '真实 PBR 贴图已启用' : 'PBR 贴图已关闭'}
          </span>
        </button>

        <button
          type="button"
          className="toggle-chip armory-ctrl-chip"
          onClick={() => setTextureModalOpen(true)}
          title="检视并下载全部定制 2K PBR 材质贴图原图"
        >
          <ImageIcon size={14} />
          <span>查看 PBR 贴图图集</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            armoryAutoRotate ? 'active-cyan' : ''
          }`}
          onClick={toggleArmoryAutoRotate}
          title="开启或暂停 3D 展台自动环绕旋转"
        >
          <Orbit size={14} />
          <span>{armoryAutoRotate ? '展台旋转中' : '自动旋转已停'}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            xrayShells ? 'active-cyan' : ''
          }`}
          onClick={toggleXrayShells}
          title="在枪库展台内直接预览内部枪机与火控透视结构"
        >
          <Eye size={14} />
          <span>X-Ray 透视预览</span>
        </button>

        <div className="armory-stage-hint">
          <MousePointerClick size={13} />
          <span>拖拽检视 · 单击枪体直达分解</span>
        </div>
      </div>

      {/* Non-intrusive toast when clicking planned slot */}
      {plannedToast && <div className="armory-toast-banner">{plannedToast}</div>}

      {/* Bottom Compact Single-Row 10-Bay Armory Weapon Vault Rack (~176px tall) */}
      <section className="armory-rack-dock" aria-label="枪库十槽武器展架">
        <div className="rack-dock-header">
          <div className="rack-dock-title">
            <Shield size={13} className="rack-icon" />
            <span>枪库武器陈列架 · 10-BAY WEAPON VAULT RACK</span>
            <span className="rack-count-pill">
              {filteredWeapons.length} / {ARMORY_WEAPONS.length}
            </span>
          </div>

          <div className="rack-dock-right">
            <span className="rack-dock-tip">
              单击卡片切换展台预览 · 再次点击或点蓝字进入 3D 拆解台
            </span>
            <div className="rack-scroll-btns">
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(-1)}
                aria-label="向左滚动武器展架"
                title="向左滚动查看槽位"
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(1)}
                aria-label="向右滚动武器展架"
                title="向右滚动查看槽位"
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div ref={rackScrollRef} className="armory-cards-grid">
          {filteredWeapons.map((item) => {
            const isOnTurntable = item.id === activeWeaponId;
            const originTypeLabel = item.originCountryCn
              ? `${item.originCountryCn} · ${
                  item.weaponTypeCn ?? item.categoryCn
                }`
              : item.categoryCn;

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`armory-weapon-card ${
                  item.available ? 'is-ready' : 'is-planned'
                } ${isOnTurntable ? 'is-on-turntable' : ''}`}
                onClick={(e) => handleCardBodyClick(item, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardBodyClick(item, e.currentTarget);
                  }
                }}
              >
                <div className="wcard-top-row">
                  <span className="wcard-bay">{item.bayCode}</span>
                  <span className="wcard-origin-tag">{originTypeLabel}</span>
                  {item.available ? (
                    <span
                      className={`wcard-status ${
                        isOnTurntable ? 'turntable-active' : 'ready'
                      }`}
                    >
                      {isOnTurntable ? (
                        <>
                          <Rotate3d size={10} />
                          <span>预览中</span>
                        </>
                      ) : (
                        <span className="live-dot" title={item.statusLabel} />
                      )}
                    </span>
                  ) : (
                    <span className="wcard-status planned">
                      <Clock size={10} />
                      <span>待接入</span>
                    </span>
                  )}
                </div>

                <div className="wcard-silhouette-box">
                  <WeaponSilhouetteSvg
                    id={item.id}
                    available={item.available}
                  />
                </div>

                <div className="wcard-body">
                  <div className="wcard-title-row">
                    <span className="wcard-name">{item.nameCn}</span>
                  </div>
                  <div className="wcard-meta">
                    {item.caliber} · {item.partsCount} 零件节点
                  </div>
                </div>

                <div className="wcard-footer">
                  {item.available ? (
                    <button
                      type="button"
                      className="wcard-enter-cta-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        enterWorkbench(item.id);
                      }}
                    >
                      <span>进入 3D 内部拆解与发射演示</span>
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <span className="wcard-planned-note">
                      {item.actionMechanism}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

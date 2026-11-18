import React from 'react';

export interface WeaponSilhouetteSvgProps {
  id: string;
  available: boolean;
}

export const WeaponSilhouetteSvg: React.FC<WeaponSilhouetteSvgProps> =
  React.memo(({ id, available }) => {
    const stroke = available
      ? 'var(--silhouette-stroke, #cbd5e1)'
      : '#64748b';
    const fill = available
      ? 'var(--silhouette-fill, #334155)'
      : 'rgba(100, 116, 139, 0.35)';
    const subFill = available
      ? 'var(--silhouette-subfill, #475569)'
      : 'rgba(148, 163, 184, 0.45)';
    const accent = available
      ? 'var(--silhouette-accent, #38bdf8)'
      : '#94a3b8';
    const cutout = 'var(--silhouette-cutout, #0d1420)';

    switch (id) {
      case 'ak15':
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
            <rect
              x="50"
              y="21"
              width="5.5"
              height="4.5"
              rx="0.8"
              fill={stroke}
            />
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
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Tenifer Slide & Sights */}
            <path
              d="M36 17 L150 17 L153 20 L153 34 L34 34 L34 19 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="39"
              y="13.5"
              width="7"
              height="3.5"
              rx="0.8"
              fill={stroke}
            />
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
            <rect x="73" y="40" width="18" height="14" rx="3" fill={cutout} />
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
            {/* Gen3 Universal Rail Cross-Slot */}
            <rect x="133" y="37.5" width="3" height="2.6" fill={cutout} />
          </svg>
        );

      case 'm82a1':
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* British Olive-Drab Thumbhole Polymer Sniper Chassis */}
            <path
              d="M8 31 L38 31 L46 34 L118 33 L116 41 L58 42 L54 58 L39 58 L39 46 L14 52 L8 51 Z"
              fill={odChassis}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            {/* Thumbhole Cutout + Black Adjustable Cheekpiece */}
            <rect x="42" y="40" width="9" height="11" rx="3.2" fill={cutout} />
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
              y="31.5"
              width="43"
              height="3.4"
              fill={available ? '#475569' : '#94a3b8'}
            />
            <line
              x1="120"
              y1="33.2"
              x2="158"
              y2="33.2"
              stroke="#cbd5e1"
              strokeWidth="0.7"
            />
            <rect
              x="160"
              y="30.4"
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
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
            {/* 14" Barrel + Gas Regulator Plug + 3-Prong Flash Hider */}
            <rect
              x="132"
              y="27.2"
              width="4.5"
              height="3.2"
              rx="0.6"
              fill={stroke}
            />
            <rect x="132" y="31.5" width="26" height="3.2" fill={fill} />
            <path
              d="M158 30.3 L169 30.3 L169 31.8 L162 31.8 L162 34.2 L169 34.2 L169 35.7 L158 35.7 Z"
              fill={fill}
            />
            {/* FDE Lower + Oversized Trigger Guard + Grip + 30-Rd FDE STANAG Mag */}
            <path
              d="M48 38.5 L96 38.5 L95 45 L50 45 Z"
              fill={fdePoly}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <path
              d="M64 45 L66 52 L78 52 L79 45"
              fill="none"
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            <path
              d="M71 45 Q72 49 69.5 50.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinecap="round"
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
        const chromeShade = '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
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
            <rect
              x="75"
              y="41"
              width="18"
              height="14"
              rx="3.5"
              fill={cutout}
            />
            <path
              d="M84 41 Q85 49 81 52"
              fill="none"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
          </svg>
        );
      }

      case 'aug': {
        const augOlive = available ? '#4b5841' : '#cbd5e1';
        const waffleMag = available ? '#d97706' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Bullpup Rear Olive-Green Polyamide Stock + Closed Full-Hand Trigger Guard Bow */}
            <path
              d="M12 27 L98 28 L104 37 L99 42 L91 64 L66 64 L69 44 L14 49 Z"
              fill={augOlive}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            {/* Enclosed Full-Hand Guard Opening + Progressive Sliding Trigger */}
            <polygon
              points="78,43 94,43 88,59 75,59"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <rect x="78" y="45" width="4.5" height="6" rx="1" fill={stroke} />
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
            {/* Folding Vertical Foregrip + Gas Block + Quick-Change 20" Barrel + Tulip Flash Hider */}
            <path
              d="M106 39 L114 39 L111 61 L103 60 Z"
              fill={augOlive}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <rect
              x="114"
              y="28.5"
              width="9"
              height="3.2"
              rx="0.7"
              fill={subFill}
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

      case 'p320': {
        const pvdSlide = available ? '#9d8363' : '#cbd5e1';
        const fdeGrip = available ? '#8d7251' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Coyote Tan PVD Stainless Slide + Black Optic Plate Rear Sight */}
            <path
              d="M36 17 L148 17 L152 21 L152 34 L34 34 L34 20 Z"
              fill={pvdSlide}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="38"
              y="13.2"
              width="12"
              height="3.8"
              rx="0.8"
              fill={stroke}
            />
            <polygon points="143,17 148,17 146.5,13.5 144,13.5" fill={stroke} />
            <rect x="84" y="18.5" width="22" height="7" rx="1" fill={fill} />
            {/* Coyote FDE Modular Carry Grip w/ Beavertail, M1913 Rail & FCU Window */}
            <path
              d="M29 34 L150 34 L149 41 L98 41 L98 55 Q98 59 92 59 L73 59 L57 79 L36 76 L47 45 Q47 39 29 37 Z"
              fill={fdeGrip}
              stroke={stroke}
              strokeWidth="1.25"
            />
            {/* 3-Slot M1913 Picatinny Dust-Cover Rail Notches */}
            {[118, 127, 136].map((rx) => (
              <rect
                key={rx}
                x={rx}
                y="39.2"
                width="3"
                height="2"
                fill={cutout}
              />
            ))}
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
            <rect
              x="74"
              y="41"
              width="18"
              height="14"
              rx="3.2"
              fill={cutout}
            />
            <path
              d="M84 41 Q85 48.5 81 51.5"
              fill="none"
              stroke={stroke}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <path
              d="M34 75 L59 78 L58 82 L33 79 Z"
              fill={pvdSlide}
              stroke={stroke}
              strokeWidth="1.1"
            />
          </svg>
        );
      }

      case 'p90': {
        const smokedMag = available ? '#8a6f52' : '#78716c';
        const opticAlloy = available ? '#3f4a59' : '#64748b';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Top-Mounted Horizontal 50-Rd Smoked Translucent Polycarbonate Magazine */}
            <rect
              x="23"
              y="24"
              width="98"
              height="9.5"
              rx="2"
              fill={smokedMag}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {[36, 52, 68, 84, 100].map((mx) => (
              <line
                key={mx}
                x1={mx}
                y1="25.5"
                x2={mx}
                y2="32"
                stroke="#fcd34d"
                strokeWidth="1.2"
                opacity="0.7"
              />
            ))}
            {/* Forward Alloy Optical Bridge & Ring Sight MC-10-80 Collimator */}
            <path
              d="M108 33.5 L121 33.5 L125 14 Q127 10 133 10 L160 10 Q166 10 171 22 L177 33.5 L177 41 L108 41 Z"
              fill={opticAlloy}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect
              x="132"
              y="14.5"
              width="28"
              height="9.5"
              rx="2.5"
              fill="#0ea5c6"
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Slanted Birdcage Compensator & 10.4" Muzzle */}
            <polygon
              points="177,34 191,34 187,40.5 177,40.5"
              fill={stroke}
            />
            {/* Futuristic Ergonomic Bullpup Polymer Thumbhole Stock & Front Hand-Stop */}
            <path
              d="M18 33.5 L108 33.5 L108 41 L175 41 Q175 56 170 66 Q167 68 164 63 Q158 53 149 51 Q147 65 138 69 L114 75 Q107 76 104 71 Q101 60 94 55 L68 55 Q48 57 25 67 L18 67 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.3"
            />
            {/* Oval Ergonomic Thumbhole Cutout & Enclosed Front Trigger Window */}
            <ellipse
              cx="114"
              cy="56"
              rx="8.5"
              ry="9.5"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <ellipse
              cx="134"
              cy="53.5"
              rx="8.5"
              ry="9"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.05"
            />
            {/* Progressive Sliding Trigger + Rotary Dial + Ribbed Buttplate */}
            <path
              d="M133 45.5 L136 45.5 L135 55 L131.5 55 Z"
              fill={stroke}
            />
            <circle cx="130" cy="58.5" r="2.2" fill={opticAlloy} />
            <rect
              x="15.5"
              y="33.5"
              width="3.5"
              height="33.8"
              rx="1"
              fill={stroke}
            />
          </svg>
        );
      }

      case 'lift33': {
        const riserTan = available ? '#7e7668' : '#94a3b8';
        const limbCarbon = available ? '#1e293b' : '#475569';
        const camBronze = available ? '#b98f58' : '#cbd5e1';
        const shaftGold = available ? '#d4a359' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Bowstring & Bus/Control Cables */}
            <line
              x1="56.5"
              y1="9.5"
              x2="56.5"
              y2="76.5"
              stroke={stroke}
              strokeWidth="1.05"
            />
            <line
              x1="63"
              y1="12.5"
              x2="77.5"
              y2="41.5"
              stroke={subFill}
              strokeWidth="0.9"
            />
            <line
              x1="63"
              y1="73.5"
              x2="77.5"
              y2="41.5"
              stroke={subFill}
              strokeWidth="0.9"
            />
            <line
              x1="65"
              y1="14"
              x2="65"
              y2="72"
              stroke={subFill}
              strokeWidth="0.75"
              strokeDasharray="2 1.5"
            />
            {/* D-Loop & Cable Guard Roller Rod */}
            <path
              d="M56.5 34.8 C53 34.8 53 37.8 56.5 37.8"
              fill="none"
              stroke={accent}
              strokeWidth="1.2"
            />
            <rect x="73" y="40.2" width="13" height="2.4" rx="1" fill={fill} />
            <circle cx="77.5" cy="41.4" r="2.1" fill={camBronze} />

            {/* Top & Bottom Quad Split Limbs */}
            <path
              d="M61.5 13 C69 15.5 79 19 88.5 23.5 L86 27 C77 22.5 68 18.8 60.5 16 Z"
              fill={limbCarbon}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M61.5 73 C69 70.5 79 67 88.5 62.5 L86 59 C77 63.5 68 67.2 60.5 70 Z"
              fill={limbCarbon}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Limb Pockets */}
            <rect
              x="83.5"
              y="21"
              width="7.5"
              height="6.2"
              rx="1.2"
              fill={fill}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <rect
              x="83.5"
              y="58.8"
              width="7.5"
              height="6.2"
              rx="1.2"
              fill={fill}
              stroke={stroke}
              strokeWidth="0.9"
            />

            {/* SwitchWeight-X Binary Cams (Top & Bottom) */}
            <ellipse
              cx="61.5"
              cy="12.5"
              rx="5.6"
              ry="4.2"
              transform="rotate(-14 61.5 12.5)"
              fill={camBronze}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <circle cx="62" cy="12.5" r="1.4" fill={cutout} />
            <ellipse
              cx="61.5"
              cy="73.5"
              rx="5.6"
              ry="4.2"
              transform="rotate(14 61.5 73.5)"
              fill={camBronze}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <circle cx="62" cy="73.5" r="1.4" fill={cutout} />

            {/* Bridged Truss Riser & Engage Grip */}
            <path
              d="M86 24 L92.5 24 L94 34 L91 40 L89.5 47 L93 54 L92 62 L85.5 62 L86.5 52 L83.5 45 L86 35 Z"
              fill={riserTan}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <polygon points="88,27 91,27 91.5,33 88,33" fill={cutout} />
            <polygon points="87.5,53 91,53 90.5,59 87,59" fill={cutout} />
            <path
              d="M84.2 43.5 C82.4 45.5 82.4 49.5 84.5 52 L89.2 51.5 L89.5 44 Z"
              fill={limbCarbon}
              stroke={stroke}
              strokeWidth="0.9"
            />

            {/* Sight Housing + Drop-Away Rest + Bridge-Lock 10" Stabilizer */}
            <rect
              x="92.5"
              y="30.2"
              width="12.5"
              height="2.3"
              rx="0.8"
              fill={fill}
            />
            <circle
              cx="106.5"
              cy="31.3"
              r="3.6"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <circle cx="106.5" cy="31.3" r="1" fill={accent} />
            <path d="M91.5 37 L96 36.4 L96.5 39 L91.5 39 Z" fill={subFill} />
            <rect
              x="92"
              y="55.2"
              width="42"
              height="3.2"
              rx="1.4"
              fill={limbCarbon}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <rect x="129.5" y="54.2" width="6.5" height="5.2" rx="1.2" fill={fill} />
            <circle cx="127" cy="56.8" r="1.1" fill={accent} />

            {/* Nocked 400gr Carbon Arrow & 3-Blade Broadhead */}
            <line
              x1="56.5"
              y1="36.3"
              x2="151"
              y2="36.3"
              stroke={shaftGold}
              strokeWidth="1.8"
            />
            <polygon points="58.5,36.3 67.5,33.5 69,36.3" fill={accent} />
            <polygon points="58.5,36.3 67.5,39.1 69,36.3" fill={accent} />
            <polygon
              points="151,33.6 161,36.3 151,39"
              fill={stroke}
              stroke={stroke}
              strokeWidth="0.6"
            />
          </svg>
        );
      }

      case 'python': {
        const royalBlue = available ? '#1e3252' : fill;
        const royalUnderlug = available ? '#2c446b' : subFill;
        const walnutGrip = available ? '#7c4a27' : subFill;
        const walnutCheck = available ? '#5c3419' : fill;
        const goldMedallion = available ? '#f59e0b' : '#94a3b8';
        const redRamp = available ? '#ef4444' : stroke;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Wide Target Spur DA/SA Hammer */}
            <path
              d="M50 22 L38 15.5 L40.5 20.5 L46 25.5"
              fill="none"
              stroke={stroke}
              strokeWidth="2.3"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {/* Forged Colt I-Frame, Top Strap, Recoil Shield & Trigger Guard */}
            <path
              d="M46 20 L97 20 L97 39 L91 40 L90 54 Q89 58 84 58 L69 58 Q65 56 64 51 L55 77 L33 74 L45 45 Q47 38 41 34 L43 24 Z"
              fill={royalBlue}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            {/* Colt Accro Adjustable Micrometer Target Rear Sight */}
            <polygon
              points="50,20 60,20 59,15.2 52,16.2"
              fill={stroke}
            />
            {/* Pull-Back Teardrop Cylinder Latch */}
            <ellipse
              cx="56.5"
              cy="28"
              rx="3.4"
              ry="2.1"
              fill={royalUnderlug}
              stroke={stroke}
              strokeWidth="0.9"
            />
            {/* Swing-Out 6-Shot Fluted .357 Magnum Cylinder */}
            <rect
              x="66.5"
              y="22.2"
              width="28.5"
              height="16.8"
              rx="1.8"
              fill={royalUnderlug}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect
              x="70"
              y="27.2"
              width="21"
              height="5.4"
              rx="2.7"
              fill={royalBlue}
              stroke={stroke}
              strokeWidth="0.85"
            />
            <line
              x1="68.5"
              y1="23.2"
              x2="68.5"
              y2="38"
              stroke={goldMedallion}
              strokeWidth="1"
              opacity="0.75"
            />
            {/* 6" Heavy Barrel w/ 3-Slot Ventilated Rib & Full-Length Ejector Underlug */}
            <path
              d="M95 18.2 L162 18.2 L163 27.5 L95 27.5 Z"
              fill={royalBlue}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <path
              d="M95 27.5 L161 27.5 L158.5 33.8 L95 34.2 Z"
              fill={royalUnderlug}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* 3 Signature Rectangular Cooling Rib Vents */}
            {[104, 121, 138].map((vx) => (
              <rect
                key={vx}
                x={vx}
                y="19.8"
                width="10.5"
                height="2.9"
                rx="0.7"
                fill={cutout}
                stroke={stroke}
                strokeWidth="0.7"
              />
            ))}
            {/* Pinned Red-Insert Baughman Ramped Front Sight */}
            <polygon
              points="152,18.2 160.5,18.2 159,12.6 155,13.2"
              fill={stroke}
            />
            <line
              x1="152.8"
              y1="17.5"
              x2="155.3"
              y2="13.5"
              stroke={redRamp}
              strokeWidth="1.5"
              strokeLinecap="round"
            />
            {/* Trigger Guard Window & Grooved Curved Target Trigger */}
            <rect
              x="68"
              y="40.5"
              width="18.5"
              height="13.8"
              rx="4.2"
              fill={cutout}
            />
            <path
              d="M78 41 Q79.5 48.5 75 51.5"
              fill="none"
              stroke={stroke}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            {/* Flared American Black Walnut Target Grip, 22-LPI Checkering & 24K Gold Colt Medallion */}
            <path
              d="M46 39 L61 41 L54 78 L31 74 L42 46 Z"
              fill={walnutGrip}
              stroke={stroke}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <polygon
              points="46,48 56.5,50 51.5,73.5 36.5,70.5"
              fill={walnutCheck}
              stroke={stroke}
              strokeWidth="0.75"
            />
            <circle
              cx="50.5"
              cy="44.5"
              r="2.2"
              fill={goldMedallion}
            />
          </svg>
        );
      }

      case 'benellim4': {
        const receiverAlloy = available ? '#334155' : fill;
        const barrelPhos = available ? '#475569' : subFill;
        const polyFurniture = available ? '#1e293b' : subFill;
        const argoStainless = available ? '#cbd5e1' : stroke;
        const safetyRed = available ? '#ef4444' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* 14-Deg Angled 3-Position Recoil Tube + M1014 Skeletonized Telestock & Cheekpiece */}
            <line
              x1="49"
              y1="34.5"
              x2="12"
              y2="43.5"
              stroke={barrelPhos}
              strokeWidth="4.2"
              strokeLinecap="round"
            />
            <path
              d="M9 31 L36 30.5 L38 36.5 L28 45.5 L13 56.5 L9 55.5 Z"
              fill={polyFurniture}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {/* Raised Elastomer Comb Cheekpiece + Skeletonized Buttstock Window + Rubber Pad */}
            <path
              d="M15 28 L34 28 L36 31.2 L14 31.5 Z"
              fill={barrelPhos}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <polygon
              points="15,36.5 30,36 23,46.5 15,49"
              fill={cutout}
            />
            <rect
              x="6.8"
              y="30.8"
              width="3.6"
              height="25.5"
              rx="1.1"
              fill={stroke}
            />
            {/* Independent Stippled M1014 Pistol Grip + Removable Trigger Guard + Red Safety */}
            <path
              d="M47 39.5 L57 39.5 L51 62.5 L41 60.5 Z"
              fill={polyFurniture}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <path
              d="M57 39.5 L71 39.5 L70 47.5 L57 47.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
            />
            <path
              d="M64 39.8 Q65 44.5 62.5 46"
              fill="none"
              stroke={stroke}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="59.5" cy="41.5" r="1.4" fill={safetyRed} />
            {/* MIL-STD Type-III Anodized Receiver + Top Picatinny Rail + LPA Ghost-Ring Rear Sight */}
            <path
              d="M48 26.5 L99 26.5 L99 39.8 L48 39.8 Z"
              fill={receiverAlloy}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <line
              x1="57"
              y1="25"
              x2="96"
              y2="25"
              stroke={accent}
              strokeWidth="1.6"
              strokeDasharray="2.3 1.7"
            />
            <polygon
              points="50,26.5 57.5,26.5 56.5,20.2 51.5,21"
              fill={stroke}
            />
            {/* 3" Magnum Ejection Port + Knurled Rotating Tactical Bolt Handle */}
            <rect
              x="74"
              y="29"
              width="19"
              height="5.2"
              rx="1"
              fill={argoStainless}
              opacity="0.85"
            />
            <rect
              x="88"
              y="30.2"
              width="6.5"
              height="2.8"
              rx="1.2"
              fill={stroke}
            />
            {/* Pivoting Stainless Shell Elevator Spoon Hint Beneath Receiver */}
            <line
              x1="74"
              y1="40.3"
              x2="94"
              y2="40.3"
              stroke={argoStainless}
              strokeWidth="1.3"
            />
            {/* 2-Piece Ribbed Polymer Forend Shielding Twin ARGO Cylinders */}
            <path
              d="M99 30.8 L136 31.2 L134 41.2 L99 41.2 Z"
              fill={polyFurniture}
              stroke={stroke}
              strokeWidth="1.2"
            />
            {[105, 111, 117, 123, 129].map((rx) => (
              <line
                key={rx}
                x1={rx}
                y1="32.5"
                x2={rx}
                y2="39.8"
                stroke="#64748b"
                strokeWidth="1.1"
              />
            ))}
            {/* Twin Symmetrical ARGO Gas Cylinder Front Plugs */}
            <rect
              x="136"
              y="31.3"
              width="5.5"
              height="3.3"
              rx="0.8"
              fill={argoStainless}
              stroke={stroke}
              strokeWidth="0.85"
            />
            {/* 18.5" Chrome-Lined 12ga Barrel + Full-Length 7-Rd Tubular Magazine + Ghost-Ring Front Sight */}
            <rect
              x="99"
              y="27"
              width="70"
              height="3.8"
              fill={barrelPhos}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect
              x="135"
              y="35"
              width="33"
              height="4"
              fill={receiverAlloy}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect
              x="168"
              y="34.5"
              width="4.5"
              height="5"
              rx="1"
              fill={stroke}
            />
            <polygon
              points="159.5,27 166,27 164.5,20.2 161.5,20.8"
              fill={stroke}
            />
          </svg>
        );
      }

      case 'garand': {
        const walnutStock = available ? '#7c4622' : subFill;
        const walnutHandguard = available ? '#8f532b' : subFill;
        const parkerized = available ? '#3b444b' : fill;
        const gasStainless = available ? '#cbd5e1' : stroke;
        const clipAmber = available ? '#f59e0b' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Full-Length American Black Walnut Stock + Semi-Pistol Wrist + Checkered Steel Buttplate */}
            <path
              d="M9 32.5 L40 31.5 L52 34 L120 33.5 L120 39.5 L92 41.5 L58 41.5 L49 51 L41 51 L37 45.5 L12 56.5 L9 55.5 Z"
              fill={walnutStock}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <path
              d="M7.2 32.2 L10.5 32.2 L10.5 56.2 L7.2 55.2 Z"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Forged Heeled Open-Top Springfield Receiver + 8-Rd En-Bloc Clip Rim + T105 Rear Sight */}
            <path
              d="M52 26.2 L88 26.2 L88 34.5 L50 34.5 Z"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect
              x="67"
              y="24.6"
              width="12"
              height="1.8"
              rx="0.6"
              fill={clipAmber}
            />
            <path
              d="M52.5 26.2 L55 20 L61.5 20.5 L62 26.2 Z"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <circle cx="57.5" cy="23.2" r="2.1" fill={stroke} />
            {/* Walnut Rear & Front Handguards + Barrel Lower Band & Front Sling Swivel */}
            <path
              d="M88 27 L117 27.5 L117 33.8 L88 33.8 Z"
              fill={walnutHandguard}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect
              x="117"
              y="26.8"
              width="3.2"
              height="13.5"
              rx="0.6"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <circle
              cx="118.6"
              cy="42"
              r="2"
              fill="none"
              stroke={stroke}
              strokeWidth="1.1"
            />
            <path
              d="M120.2 27.8 L147 28.2 L147 35.8 L120.2 37.5 Z"
              fill={walnutHandguard}
              stroke={stroke}
              strokeWidth="1.1"
            />
            {/* Curved Right-Side Long-Stroke Operating Rod Handle & Cam Hump */}
            <line
              x1="77"
              y1="31.2"
              x2="147"
              y2="33"
              stroke={stroke}
              strokeWidth="1.6"
            />
            <rect
              x="76"
              y="28.8"
              width="7.5"
              height="3.2"
              rx="1"
              fill={stroke}
            />
            {/* Quick-Detach Milled Trigger Housing, Pivoting Trigger Guard & Winter Safety */}
            <path
              d="M56 41.5 L73 41.5 L72 48.8 L58 48.8 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <path
              d="M64.5 41.8 Q65.5 46 63 47.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <line
              x1="71.5"
              y1="42"
              x2="74"
              y2="46"
              stroke={accent}
              strokeWidth="1.3"
              strokeLinecap="round"
            />
            {/* 24" .30-06 Stepped Barrel + Stainless Muzzle Gas Cylinder, Bayonet Lug & Winged Front Sight */}
            <rect
              x="147"
              y="27.8"
              width="25.5"
              height="2.9"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M147.5 30.7 L166 30.7 L166 35.4 L154 35.4 L152 37.8 L148.5 37.8 Z"
              fill={gasStainless}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="166"
              y="30.9"
              width="3.2"
              height="4.2"
              rx="0.7"
              fill={stroke}
            />
            <polygon
              points="156.5,27.8 162,27.8 160.8,21.5 158,22"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1"
            />
          </svg>
        );
      }

      case 'r500':
      default: {
        const chassisSlate = available ? '#475569' : '#94a3b8';
        const railDark = available ? '#1e293b' : '#475569';
        const hexBronze = available ? '#c2924c' : '#cbd5e1';
        const opticAlloy = available ? '#334155' : '#64748b';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Folding Foot Stirrup & Riser Bridge */}
            <path
              d="M148 39 L164 39 L167 43.5 L164 48 L148 48"
              fill="none"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            {/* Bullpup Skeletonized Stock, Versa-Drive Crank & Pistol Grip */}
            <path
              d="M12 37 L58 37 L64 41 L148 41 L148 47.5 L92 48.5 L83 54.5 L68 54.5 L62 63 L48 63 L44 55.5 L16 57 L12 53 Z"
              fill={chassisSlate}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Stock Thumbhole Cutout & Rubber Buttplate */}
            <polygon
              points="21,42 48,42 46,51.5 21,52.5"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <rect
              x="9.5"
              y="36.2"
              width="3.6"
              height="21.5"
              rx="1.2"
              fill={railDark}
              stroke={stroke}
              strokeWidth="0.9"
            />
            {/* Ergonomic Bullpup Pistol Grip & Trigger Guard */}
            <path
              d="M72 48.5 L80 48.5 L77 67.5 L67.5 67.5 Z"
              fill={railDark}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <path
              d="M80 48.5 L93 48.5 L91 56 L78.5 56"
              fill="none"
              stroke={stroke}
              strokeWidth="1.2"
            />
            <path
              d="M85.5 48.5 L87 54 L84 54.5 Z"
              fill={accent}
            />
            {/* Versa-Drive Silent Crank Wheel */}
            <circle
              cx="53.5"
              cy="46"
              r="4.2"
              fill={opticAlloy}
              stroke={stroke}
              strokeWidth="1"
            />
            <circle cx="53.5" cy="46" r="1.4" fill={hexBronze} />

            {/* 1-8x24 Illuminated Crossbow Scope & Picatinny Bridge */}
            <rect
              x="60"
              y="34"
              width="48"
              height="5"
              rx="1"
              fill={railDark}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect x="69" y="29" width="5.5" height="5.5" rx="0.8" fill={fill} />
            <rect x="92" y="29" width="5.5" height="5.5" rx="0.8" fill={fill} />
            <path
              d="M46 21 L59 22.5 L97 22.5 L112 20 L112 29 L97 26.8 L59 26.8 L46 28.2 Z"
              fill={opticAlloy}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect x="78" y="19.2" width="7" height="3.2" rx="0.8" fill={hexBronze} />
            <line
              x1="112"
              y1="21.5"
              x2="112"
              y2="27.5"
              stroke={accent}
              strokeWidth="1.4"
            />

            {/* Twin Tight-Profile Quad Split Limbs Sweeping to HexCoil Cams */}
            <path
              d="M148 39.5 C139 33 125 29.5 113 30.5 L114 34.2 C125 33.5 137 36.2 145.5 41.5 Z"
              fill={railDark}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <path
              d="M148 47.5 C139 54 125 57.5 113 56.5 L114 52.8 C125 53.5 137 50.8 145.5 45.5 Z"
              fill={railDark}
              stroke={stroke}
              strokeWidth="1.05"
            />
            {/* Multi-Stage HexCoil Helical Cam Stacks + Taut String/Cable */}
            <rect
              x="110"
              y="26.5"
              width="8.5"
              height="9"
              rx="2.5"
              fill={hexBronze}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect
              x="110"
              y="51.5"
              width="8.5"
              height="9"
              rx="2.5"
              fill={hexBronze}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <line
              x1="114"
              y1="30"
              x2="75"
              y2="37.2"
              stroke={stroke}
              strokeWidth="1"
            />
            <line
              x1="114"
              y1="56"
              x2="75"
              y2="40.5"
              stroke={stroke}
              strokeWidth="1"
            />

            {/* Trac-Trigger Sled & 20-Inch 400gr Carbon Bolt + Broadhead */}
            <rect
              x="71"
              y="36.2"
              width="11"
              height="4.4"
              rx="1.2"
              fill={hexBronze}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <line
              x1="78"
              y1="38.2"
              x2="157"
              y2="38.2"
              stroke={accent}
              strokeWidth="1.8"
            />
            <polygon points="82,38.2 90,35.6 91.5,38.2" fill={hexBronze} />
            <polygon points="82,38.2 90,40.8 91.5,38.2" fill={hexBronze} />
            <polygon
              points="157,35.4 168.5,38.2 157,41"
              fill={stroke}
              stroke={stroke}
              strokeWidth="0.6"
            />
          </svg>
        );
      }
    }
  });

WeaponSilhouetteSvg.displayName = 'WeaponSilhouetteSvg';

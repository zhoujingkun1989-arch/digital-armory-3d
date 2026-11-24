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

      case 'm249': {
        const odBox = available ? '#4d5d43' : '#94a3b8';
        const brassBelt = available ? '#d4a238' : '#cbd5e1';
        const heatShield = available ? '#475569' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Heavy Polymer PIP Buttstock + Folding Shoulder Rest */}
            <path
              d="M11 33 L46 33 L46 47 L37 51 L13 55 L9 51 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <line
              x1="14"
              y1="32"
              x2="34"
              y2="32"
              stroke={stroke}
              strokeWidth="1.8"
              strokeLinecap="round"
            />
            {/* Stamped Steel Receiver + Hinged Railed Feed Cover */}
            <path
              d="M46 30 L110 30 L112 34 L112 46 L46 46 Z"
              fill={fill}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <path
              d="M52 25.5 L98 25.5 L101 30 L50 30 Z"
              fill={heatShield}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {[56, 63, 70, 77, 84, 91].map((rx) => (
              <rect
                key={rx}
                x={rx}
                y="24"
                width="3.2"
                height="1.8"
                fill={stroke}
              />
            ))}
            {/* Pistol Grip & Trigger Guard */}
            <path
              d="M56 46 L67 46 L62 66 L51 65 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <path
              d="M67 46 L77 46 L75 53 L66 53 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* 200-Round OD-Green Polymer Assault Box + Exposed M27 Brass Belt */}
            <rect
              x="75"
              y="47"
              width="31"
              height="27"
              rx="2.6"
              fill={odBox}
              stroke={stroke}
              strokeWidth="1.25"
            />
            {[81, 90, 99].map((bx) => (
              <line
                key={bx}
                x1={bx}
                y1="50"
                x2={bx}
                y2="71"
                stroke={stroke}
                strokeWidth="0.9"
                opacity="0.65"
              />
            ))}
            {[33, 36.5, 40, 43.5].map((by, idx) => (
              <rect
                key={by}
                x={88 + idx * 0.6}
                y={by}
                width="9.5"
                height="2.3"
                rx="0.8"
                fill={brassBelt}
                stroke={stroke}
                strokeWidth="0.55"
              />
            ))}
            {/* Quick-Change Carry Handle + Perforated 7-Slot Barrel Heatshield */}
            <line
              x1="104"
              y1="29"
              x2="117"
              y2="21.5"
              stroke={stroke}
              strokeWidth="1.9"
              strokeLinecap="round"
            />
            <rect
              x="114"
              y="19.5"
              width="9"
              height="3.4"
              rx="1.4"
              fill={subFill}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <path
              d="M112 29.5 L154 30.5 L154 36.5 L112 36.5 Z"
              fill={heatShield}
              stroke={stroke}
              strokeWidth="1.1"
            />
            {[116, 122, 128, 134, 140, 146].map((sx) => (
              <rect
                key={sx}
                x={sx}
                y="31.8"
                width="3.6"
                height="2.2"
                rx="0.6"
                fill={cutout}
              />
            ))}
            {/* Forend, Under-Barrel Gas Cylinder, Folded Bipod, 18.3" Barrel & Birdcage */}
            <path
              d="M112 37 L151 37 L148 44 L112 44 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect
              x="148"
              y="37.5"
              width="24"
              height="3.4"
              rx="0.8"
              fill={fill}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <line
              x1="149"
              y1="42.5"
              x2="118"
              y2="46.5"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinecap="round"
            />
            <rect x="154" y="32.2" width="35" height="3.2" fill={fill} />
            <polygon
              points="178,32.2 183,32.2 181.5,24.5 179,24.5"
              fill={fill}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <rect
              x="189"
              y="31.2"
              width="10"
              height="5.2"
              rx="1"
              fill={fill}
              stroke={stroke}
              strokeWidth="1"
            />
          </svg>
        );
      }

      case 'p08': {
        const rustBlue = available ? '#283548' : '#64748b';
        const walnutGrip = available ? '#7c4d2b' : '#94a3b8';
        const strawGold = available ? '#eab308' : '#cbd5e1';
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* 4-Inch Tapered Rust-Blued Barrel + Dove-Tailed Front Sight */}
            <path
              d="M98 22.5 L156 24.2 L156 28.4 L98 29.8 Z"
              fill={rustBlue}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <polygon
              points="149,24.2 155,24.2 153.5,19.2 150.5,19.2"
              fill={rustBlue}
              stroke={stroke}
              strokeWidth="0.95"
            />
            {/* Forked Receiver, Over-Center Knee-Joint Toggle & Knurled Toggle Ears */}
            <path
              d="M35 21.5 L99 21.5 L99 31.5 L32 31.5 Q28 28 35 21.5 Z"
              fill={rustBlue}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <circle
              cx="53"
              cy="22.2"
              r="5.6"
              fill={rustBlue}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <circle
              cx="53"
              cy="22.2"
              r="2.6"
              fill="none"
              stroke={strawGold}
              strokeWidth="0.85"
            />
            <line
              x1="58.5"
              y1="23.5"
              x2="82"
              y2="24.5"
              stroke={accent}
              strokeWidth="1.2"
            />
            {/* S-Curved Toggle Ramp Frame + Iconic 55° Grip Frame */}
            <path
              d="M27 31.5 L96 31.5 L94 37.5 L88 37.5 L88 50 Q88 55 81 55 L69 55 L52 76 L32 72 L47 42 Q34 39 27 31.5 Z"
              fill={rustBlue}
              stroke={stroke}
              strokeWidth="1.3"
            />
            {/* 20-LPI Checkered European Walnut Grip Panel */}
            <polygon
              points="49,38 68,39 51,71 35,68"
              fill={walnutGrip}
              stroke={stroke}
              strokeWidth="1.05"
            />
            {/* Rounded Luger Trigger Guard + Straw-Tempered Trigger, Takedown & Safety */}
            <ellipse
              cx="77.5"
              cy="45.2"
              rx="8.2"
              ry="6.8"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <path
              d="M78.5 40 Q80 45.5 76 48.5"
              fill="none"
              stroke={strawGold}
              strokeWidth="2.2"
              strokeLinecap="round"
            />
            <rect
              x="86.5"
              y="33"
              width="5.5"
              height="3.2"
              rx="0.8"
              fill={strawGold}
            />
            <line
              x1="35"
              y1="33.5"
              x2="43"
              y2="31.5"
              stroke={strawGold}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Concentric Twin-Ear Magazine Base Knob */}
            <circle
              cx="41.5"
              cy="75"
              r="4.2"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <circle cx="41.5" cy="75" r="1.6" fill={strawGold} />
          </svg>
        );
      }

      case 'vector': {
        const fdeUpper = available ? '#a38764' : '#94a3b8';
        const superVLower = available ? '#242c38' : '#64748b';
        const brassPivot = available ? '#eab308' : '#cbd5e1';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Gen II Skeletonized Right-Folding Stock */}
            <path
              d="M12 25 L54 26.5 L54 34 L21 43 L12 47 Z"
              fill={superVLower}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <polygon
              points="19,30 46,30.5 46,33.5 22,39.5"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.85"
            />
            {/* Flat Dark Earth Upper Receiver + Full-Length Picatinny Rail & Flip Sights */}
            <path
              d="M54 23 L147 23 L150 26.5 L150 35 L54 35 Z"
              fill={fdeUpper}
              stroke={stroke}
              strokeWidth="1.3"
            />
            {[60, 70, 80, 90, 100, 110, 120, 130, 140].map((rx) => (
              <rect
                key={rx}
                x={rx}
                y="21"
                width="4"
                height="2"
                fill={stroke}
              />
            ))}
            <rect x="57" y="17.5" width="6" height="4" rx="0.8" fill={stroke} />
            <rect
              x="141"
              y="17.5"
              width="5.5"
              height="4"
              rx="0.8"
              fill={stroke}
            />
            {/* Brass Charging Handle Pivot + Deep Black Super V 110° Off-Axis Lower Housing */}
            <circle cx="117" cy="29.5" r="2.1" fill={brassPivot} />
            <path
              d="M58 35 L150 35 L148 56 L124 59 L106 58 L98 46 L81 46 L76 68 L63 67 L67 44 L58 41 Z"
              fill={superVLower}
              stroke={stroke}
              strokeWidth="1.35"
            />
            {/* 110° Super V Angled Track Accent Line */}
            <line
              x1="112"
              y1="37"
              x2="119"
              y2="55"
              stroke={accent}
              strokeWidth="1.5"
              strokeDasharray="2.5 1.8"
            />
            {/* Trigger Cutout Between Grip & Super V Magwell */}
            <polygon
              points="80,38 99,38 103,47 79,47"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M89 38.5 Q90 43 87 45"
              fill="none"
              stroke={stroke}
              strokeWidth="2"
              strokeLinecap="round"
            />
            {/* Steep 66° Extended 25-Round .45 ACP MagEx2 Magazine */}
            <polygon
              points="126,57 141,55 129,82 114,80"
              fill={fdeUpper}
              stroke={stroke}
              strokeWidth="1.2"
            />
            {/* Ultra-Low-Bore 5.5" .45 ACP Barrel (Aligned w/ Lower Housing!) & Prong Flash Hider */}
            <rect
              x="150"
              y="44.2"
              width="19"
              height="4.2"
              fill={fill}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect
              x="169"
              y="43.3"
              width="10"
              height="6"
              rx="1"
              fill={superVLower}
              stroke={stroke}
              strokeWidth="1"
            />
          </svg>
        );
      }

      case 'g11': {
        const oliveMonolith = available ? '#3d453d' : '#64748b';
        const darkPoly = available ? '#282f2b' : '#475569';
        const magSmoked = available ? '#7a6248' : '#94a3b8';
        const dm11Ochre = available ? '#d4a238' : '#cbd5e1';
        const hensoldtTint = available ? '#0ea5c6' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Integral Hensoldt 1x/3.5x Optical Carry-Handle Housing */}
            <path
              d="M66 26 L73 10.5 L125 10.5 L130 26 Z"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <polygon
              points="76,24.5 79,17.5 119,17.5 122,24.5"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.85"
            />
            <rect
              x="123"
              y="12.2"
              width="3.2"
              height="4.4"
              rx="0.6"
              fill={hensoldtTint}
            />
            <rect
              x="95"
              y="8.5"
              width="6"
              height="2.2"
              rx="0.5"
              fill={stroke}
            />

            {/* Overhead 45-Round Horizontal DM11 Caseless Magazine Tube */}
            <rect
              x="56"
              y="22.5"
              width="118"
              height="6.4"
              rx="1.4"
              fill={magSmoked}
              stroke={stroke}
              strokeWidth="1.1"
            />
            {[68, 76, 84, 92, 100, 108, 116, 124, 132, 140, 148, 156, 164].map(
              (mx) => (
                <line
                  key={mx}
                  x1={mx}
                  y1="23.8"
                  x2={mx}
                  y2="27.6"
                  stroke={dm11Ochre}
                  strokeWidth="1.25"
                  opacity="0.78"
                />
              )
            )}

            {/* Iconic Boxy Olive-Charcoal Monocoque Bullpup Polymer Shell */}
            <path
              d="M16 26.5 L173 26.5 L175 29.5 L174 44.5 L118 45.5 L114 48 L64 48 L56 57.5 L16 57.5 Z"
              fill={oliveMonolith}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Rubber Buttpad */}
            <rect
              x="12.5"
              y="26.2"
              width="4.2"
              height="31.8"
              rx="1.2"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="1"
            />

            {/* K2 Side Spare Caseless Magazine Clip Rail Accent */}
            <rect
              x="124"
              y="31"
              width="44"
              height="7.5"
              rx="1.2"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <line
              x1="128"
              y1="34.8"
              x2="164"
              y2="34.8"
              stroke={dm11Ochre}
              strokeWidth="1.1"
              strokeDasharray="3 2"
              opacity="0.8"
            />

            {/* Clockwork 360-Deg Pop-Out Winding Crank Dial & Rotary Breech Track */}
            <circle
              cx="45"
              cy="39.5"
              r="5.6"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <circle
              cx="45"
              cy="39.5"
              r="2.4"
              fill={dm11Ochre}
              stroke={stroke}
              strokeWidth="0.75"
            />
            <line
              x1="45"
              y1="39.5"
              x2="50.5"
              y2="36.5"
              stroke={stroke}
              strokeWidth="1.4"
              strokeLinecap="round"
            />
            <line
              x1="56"
              y1="36.5"
              x2="112"
              y2="36.5"
              stroke={accent}
              strokeWidth="1.25"
              strokeDasharray="3 2"
              opacity="0.8"
            />

            {/* Bullpup Pistol Grip + Full-Hand Winter Trigger Guard Bow */}
            <path
              d="M78 47.5 L90 47.5 L83 74.5 L71 72.5 Z"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <path
              d="M89 47.5 L112 46.5 L108 66 L86 67"
              fill="none"
              stroke={stroke}
              strokeWidth="1.65"
              strokeLinejoin="round"
            />
            <polygon
              points="90,49.5 107,49 104,63 87.5,63.5"
              fill={cutout}
              opacity="0.75"
            />
            <path
              d="M96 50 Q97.5 55.5 94 58.5"
              fill="none"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinecap="round"
            />

            {/* Recessed Floating 540mm Barrel Tip + 6-Slot Birdcage Flash Hider & Bayonet Lug */}
            <rect
              x="174"
              y="33.8"
              width="7.5"
              height="3.4"
              fill={fill}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <rect
              x="181.5"
              y="32.4"
              width="12.5"
              height="6.2"
              rx="1.1"
              fill={darkPoly}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <line
              x1="184.5"
              y1="35.5"
              x2="191.5"
              y2="35.5"
              stroke={accent}
              strokeWidth="1.1"
            />
            <rect
              x="178"
              y="38.2"
              width="5.5"
              height="2.6"
              rx="0.5"
              fill={stroke}
            />
          </svg>
        );
      }

      case 'vss': {
        const birchWood = available ? '#9c5d2e' : '#94a3b8';
        const birchGrain = available ? '#7a451e' : '#64748b';
        const plumPoly = available ? '#4d2f3a' : '#64748b';
        const tulaBlued = available ? '#29323f' : fill;
        const psoGrey = available ? '#64748b' : subFill;
        const opticBlue = available ? '#38bdf8' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* PSO-1M2-1 4x24 Hammer-Tone Grey Sniper Scope, Rubber Eyecup & Side Dovetail */}
            <path
              d="M36 16 L47 17.5 L47 24 L36 25.2 Z"
              fill={tulaBlued}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M47 16.5 L57 18 L92 18 L106 15.8 L106 25.4 L92 23.4 L57 23.4 L47 24.4 Z"
              fill={psoGrey}
              stroke={stroke}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <rect
              x="71"
              y="14"
              width="6"
              height="4"
              rx="0.7"
              fill={accent}
            />
            <line
              x1="106"
              y1="17"
              x2="106"
              y2="24.2"
              stroke={opticBlue}
              strokeWidth="1.5"
            />
            <path
              d="M68 23.4 L87 23.4 L84 32.5 L71 32.5 Z"
              fill={psoGrey}
              stroke={stroke}
              strokeWidth="1.05"
            />

            {/* Quick-Detach Skeletonized Russian Laminated Birchwood Thumbhole Stock */}
            <path
              d="M12 36 L63 35 L65 44 L59 64 L48 63 L50 51 L15 62 L11 59 Z"
              fill={birchWood}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <polygon
              points="19,41.5 52,40.5 47,49 19,55.5"
              fill={cutout}
              stroke={birchGrain}
              strokeWidth="1.1"
            />
            <rect
              x="9.5"
              y="35.8"
              width="3.4"
              height="24.8"
              rx="1"
              fill={tulaBlued}
              stroke={stroke}
              strokeWidth="0.95"
            />

            {/* CNC Milled Tula Steel Receiver + 3-Rib Stamped Dust Cover */}
            <path
              d="M62 32.5 L108 32.5 L108 44.5 L62 44.5 Z"
              fill={tulaBlued}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <path
              d="M63 32.5 L66 29.5 L105 29.5 L108 32.5 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1"
            />
            <line
              x1="78"
              y1="38.2"
              x2="101"
              y2="37.2"
              stroke={stroke}
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            {/* Trigger Guard + Silent Cross-Bolt Selector Dot */}
            <path
              d="M64 44.5 L78 44.5 L76 52.5 L63 52.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
            />
            <path
              d="M70 45 Q71 49 68.5 51"
              fill="none"
              stroke={stroke}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            <circle cx="66.5" cy="46.8" r="1.35" fill={accent} />

            {/* 10-Round Straight Plum Waffle 9x39mm Magazine */}
            <path
              d="M86 44.5 L100 44.5 L102 65.5 L88 66.5 Z"
              fill={plumPoly}
              stroke={stroke}
              strokeWidth="1.2"
            />
            {[49, 54, 59].map((my) => (
              <line
                key={my}
                x1="88"
                y1={my}
                x2="100"
                y2={my + 1.2}
                stroke={stroke}
                strokeWidth="0.75"
                opacity="0.65"
              />
            ))}

            {/* Dark Plum Bakelite Forend Handguard */}
            <path
              d="M108 34.2 L134 34.8 L132 43.8 L108 44.5 Z"
              fill={plumPoly}
              stroke={stroke}
              strokeWidth="1.2"
            />

            {/* Monolithic 414mm Stepped Integral Cylindrical Suppressor Shroud + Baffle Ticks */}
            <rect
              x="108"
              y="29.8"
              width="89"
              height="9.4"
              rx="1.6"
              fill={tulaBlued}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <line
              x1="138"
              y1="29.8"
              x2="138"
              y2="39.2"
              stroke={stroke}
              strokeWidth="1.1"
            />
            {/* Radial Bleed Ports & 6-Stage Slanted Baffle Cutaway Hints */}
            {[146, 154, 162, 170, 178, 186].map((bx, idx) => (
              <line
                key={bx}
                x1={bx}
                y1={idx % 2 === 0 ? '31.5' : '37.5'}
                x2={bx + 3.5}
                y2={idx % 2 === 0 ? '37.5' : '31.5'}
                stroke={accent}
                strokeWidth="1.05"
                opacity="0.8"
              />
            ))}
            {/* Tangent Iron Rear Sight & Hooded Front Sight on Suppressor Tube */}
            <rect
              x="126"
              y="27"
              width="12"
              height="2.8"
              rx="0.6"
              fill={stroke}
            />
            <polygon
              points="186,29.8 192.5,29.8 191,23.5 187.5,24"
              fill={tulaBlued}
              stroke={stroke}
              strokeWidth="1.05"
            />
          </svg>
        );
      }

      case 'm134': {
        const housingMetal = available ? '#2b3442' : fill;
        const barrelPhos = available ? '#475569' : subFill;
        const motorCopper = available ? '#c97a36' : '#cbd5e1';
        const brassChute = available ? '#d4a238' : '#cbd5e1';
        const armCrimson = available ? '#ef4444' : '#94a3b8';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Top-Mounted 28V DC Aerospace Electric Drive Motor + Rear Reduction Gearbox */}
            <path
              d="M27 21 L37 21 L37 33 L27 33 Z"
              fill={barrelPhos}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect
              x="36"
              y="14.5"
              width="40"
              height="13.5"
              rx="3"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.25"
            />
            {[42, 48, 54, 60, 66, 71].map((fx) => (
              <line
                key={fx}
                x1={fx}
                y1="16.2"
                x2={fx}
                y2="26.2"
                stroke={motorCopper}
                strokeWidth="1.4"
                opacity="0.85"
              />
            ))}
            {/* Chainsaw Top Carry Handle Bar */}
            <path
              d="M72 28 L79 13.5 L107 13.5 L112 29"
              fill="none"
              stroke={stroke}
              strokeWidth="2.1"
              strokeLinejoin="round"
            />

            {/* Rear Twin-Handle Aviation Spade Grips + Butterfly Triggers & Crimson Master Arm */}
            <path
              d="M11 29 L28 31 L28 54 L11 56 L11 51 L21 49.5 L21 35.5 L11 34 Z"
              fill={barrelPhos}
              stroke={stroke}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <rect
              x="12"
              y="33.5"
              width="5"
              height="18"
              rx="1.5"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1"
            />
            <circle cx="22.5" cy="34.5" r="2.1" fill={armCrimson} />

            {/* Ribbed Cylindrical Mainframe Rotor Housing + Top Safing Sector */}
            <rect
              x="28"
              y="28"
              width="65"
              height="27.5"
              rx="2.6"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="47"
              y="25.5"
              width="22"
              height="3.2"
              rx="0.8"
              fill={armCrimson}
              stroke={stroke}
              strokeWidth="0.85"
            />
            {[38, 52, 66, 80].map((rx) => (
              <line
                key={rx}
                x1={rx}
                y1="28.5"
                x2={rx}
                y2="55"
                stroke={stroke}
                strokeWidth="0.95"
                opacity="0.6"
              />
            ))}
            {/* 360-Deg Sinusoidal Cam Track Wave Hint Inside Mainframe */}
            <path
              d="M34 42 Q47 32 60 42 T87 42"
              fill="none"
              stroke={accent}
              strokeWidth="1.5"
              strokeDasharray="3 1.8"
            />

            {/* Dillon Aero Star-Wheel Delinker Feeder + Ribbed Flexible M13 Ammo Chute */}
            <rect
              x="58"
              y="55.5"
              width="28"
              height="12.5"
              rx="2"
              fill={barrelPhos}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <circle
              cx="72"
              cy="61.8"
              r="3.8"
              fill={housingMetal}
              stroke={brassChute}
              strokeWidth="1.15"
            />
            <path
              d="M62 68 L76 68 Q71 77 62 82.5 L48 80 Q57 75 62 68 Z"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {[69.5, 73, 76.5, 79.5].map((cy, idx) => (
              <line
                key={cy}
                x1={60 - idx * 2.4}
                y1={cy}
                x2={72 - idx * 2.4}
                y2={cy + 0.8}
                stroke={brassChute}
                strokeWidth="1.45"
              />
            ))}

            {/* 6-Barrel 22-Inch Rotary Cluster (Stacked Profile) */}
            {[32, 36.2, 40.4, 44.6, 48.8].map((by, idx) => (
              <rect
                key={by}
                x="93"
                y={by}
                width="90"
                height="2.7"
                fill={idx % 2 === 0 ? barrelPhos : housingMetal}
                stroke={stroke}
                strokeWidth="0.85"
              />
            ))}
            {/* Twin Ventilated Rotary Barrel Clamps (Mid & Forward) */}
            <rect
              x="128"
              y="30.2"
              width="7.5"
              height="23.2"
              rx="1.2"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect
              x="162"
              y="30.2"
              width="7"
              height="23.2"
              rx="1.2"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Dillon Aero 6-Tube Rotary Flash Suppressor Cage with Heat-Temper Ring */}
            <rect
              x="183"
              y="29.8"
              width="14.5"
              height="24"
              rx="1.6"
              fill={housingMetal}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <line
              x1="186"
              y1="30.5"
              x2="186"
              y2="53.2"
              stroke={motorCopper}
              strokeWidth="1.7"
            />
            {[34, 39, 44, 49].map((fy) => (
              <line
                key={fy}
                x1="188.5"
                y1={fy}
                x2="195.5"
                y2={fy}
                stroke={stroke}
                strokeWidth="1.1"
              />
            ))}
          </svg>
        );
      }

      case 'an94': {
        const polyShell = available ? '#262d38' : fill;
        const plumMag = available ? '#4a2f3a' : subFill;
        const floatSteel = available ? '#475569' : subFill;
        const bronzePulley = available ? '#d49a42' : '#cbd5e1';
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Right-Folding Sleek Russian Solid Polymer Buttstock */}
            <path
              d="M11 31.5 L55 30.5 L55 43.5 L34 45.5 L12 53.5 L9 51 Z"
              fill={polyShell}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <rect
              x="8.2"
              y="31.2"
              width="3.2"
              height="22.4"
              rx="0.9"
              fill={stroke}
            />

            {/* Monocoque Charcoal Polyamide Outer Housing & Unified Forend */}
            <path
              d="M55 28 L108 28 L112 29.5 L146 29.5 L145 43.5 L55 44.5 Z"
              fill={polyShell}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* 5-Position Rotary Star-Wheel Diopter Rear Sight */}
            <circle
              cx="63"
              cy="24.2"
              r="3.8"
              fill={floatSteel}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <circle cx="63" cy="24.2" r="1.4" fill={cutout} />

            {/* Internal CNC Steel Pulley Wheel & Braided Cable Hint */}
            <circle
              cx="84"
              cy="36.5"
              r="3.4"
              fill="none"
              stroke={bronzePulley}
              strokeWidth="1.25"
            />
            <line
              x1="87.5"
              y1="35"
              x2="112"
              y2="35"
              stroke={accent}
              strokeWidth="1.25"
              strokeDasharray="2.5 1.8"
            />

            {/* Pistol Grip & Trigger Guard */}
            <path
              d="M61 44.5 L72.5 44.5 L66 67 L55.5 65 Z"
              fill={polyShell}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <path
              d="M72.5 44.5 L87 44.5 L85 52.5 L71 52.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
            />
            <path
              d="M78.5 44.8 Q79.5 49 77 51"
              fill="none"
              stroke={stroke}
              strokeWidth="1.75"
              strokeLinecap="round"
            />

            {/* Signature 15-Degree Right-Canted 30-Rd 5.45x39mm Plum Magazine (Foreshortened Side Flank) */}
            <path
              d="M94 44 L109 43.8 Q113 60 122 75 L108 78.5 Q99 63 94 44 Z"
              fill={plumMag}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {/* Canted Magazine Front-Edge Rib Accent showing 15-Deg Twist */}
            <path
              d="M104 44.2 Q108 59.5 116.5 74.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.1"
              opacity="0.72"
            />
            <path
              d="M100 50 Q104 60 110 71"
              fill="none"
              stroke={bronzePulley}
              strokeWidth="1.15"
              opacity="0.65"
            />

            {/* Floating Upper Gas Tube, Lower 405mm Barrel & Dual-Tier Front Sight / Gas Block */}
            <rect
              x="146"
              y="30.2"
              width="21"
              height="3.2"
              fill={floatSteel}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <rect
              x="145"
              y="35.2"
              width="39"
              height="3.3"
              fill={floatSteel}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <path
              d="M161 35.2 L169 35.2 L170 21 L164.5 21 L162.5 29.8 L161 29.8 Z"
              fill={polyShell}
              stroke={stroke}
              strokeWidth="1.1"
            />

            {/* Iconic Asymmetrical Figure-8 Dual-Chamber Self-Cleaning Whistling Muzzle Brake */}
            <path
              d="M184 31.2 L197.5 31.2 Q200 31.2 200 33.8 L200 39.2 Q200 41.8 197.5 41.8 L184 41.8 Z"
              fill={floatSteel}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <circle cx="192" cy="34.2" r="2.1" fill={cutout} stroke={stroke} strokeWidth="0.8" />
            <circle cx="192" cy="38.9" r="2.1" fill={cutout} stroke={stroke} strokeWidth="0.8" />
          </svg>
        );
      }

      case 'ztz99a': {
        const plaOlive = available ? '#4a5a3a' : fill;
        const plaKhaki = available ? '#7a7852' : subFill;
        const gunSteel = available ? '#3f4b43' : subFill;
        const lensCyan = available ? '#38bdf8' : accent;
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* 125mm ZPT-98 L/50 Smoothbore Barrel + Bore Evacuator + Muzzle Reference Sensor */}
            <rect
              x="123"
              y="32.2"
              width="79"
              height="3.6"
              rx="0.6"
              fill={gunSteel}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="151"
              y="30.6"
              width="14.5"
              height="6.8"
              rx="1.6"
              fill={plaOlive}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect x="197.5" y="29.4" width="3.5" height="2.8" fill={stroke} />

            {/* Roof CITV / JD-3 Laser Optical Mast & Rear Turret Bustle Stowage Basket */}
            <rect
              x="68"
              y="22"
              width="8.5"
              height="6"
              rx="1"
              fill={plaKhaki}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect x="73.2" y="23.4" width="2.6" height="3" fill={lensCyan} />
            <rect
              x="84"
              y="23.2"
              width="7.5"
              height="4.8"
              rx="0.8"
              fill={gunSteel}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M39 29.5 L53 29.5 L53 38.5 L42 38.5 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1.15"
              strokeDasharray="2.5 1.5"
            />

            {/* Low Welded Arrowhead Turret + Angled FY-4 ERA Cheek Wedges */}
            <path
              d="M52 28 L104 28 L127 33.8 L125 41.5 L53 41.5 Z"
              fill={plaOlive}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            <polygon
              points="102,29 125.5,33.8 119,40.5 98,40.5"
              fill={plaKhaki}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <line
              x1="108"
              y1="30.8"
              x2="104"
              y2="40"
              stroke={stroke}
              strokeWidth="0.95"
              opacity="0.75"
            />
            <line
              x1="115"
              y1="32.2"
              x2="111.5"
              y2="40"
              stroke={stroke}
              strokeWidth="0.95"
              opacity="0.75"
            />

            {/* Low-Profile Hull + Steep Sloped Glacis with FY-4 ERA Blocks & Rear Engine Deck */}
            <path
              d="M17 44 L112 43.2 L144 51.5 L140 58.5 L20 58.5 L14 52 Z"
              fill={plaOlive}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* FY-4 Glacis ERA Brick Strip */}
            <polygon
              points="114,43.8 140.5,50.5 138,53.8 112.5,47.2"
              fill={plaKhaki}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Armored Side Skirts */}
            <path
              d="M21 51.5 L137 51.5 L139 59.5 L19 59.5 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Track Belt & 6 Twin Road Wheels */}
            <path
              d="M22 57.5 L135 57.5 Q141 58.5 140 65 L132 72.5 L28 72.5 L18 65 Q17.5 58.5 22 57.5 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.4"
            />
            <circle cx="24.5" cy="63" r="4.2" fill={gunSteel} stroke={stroke} strokeWidth="1.05" />
            {[38, 55, 72, 89, 106, 122].map((cx) => (
              <g key={cx}>
                <circle
                  cx={cx}
                  cy="66.2"
                  r="5.4"
                  fill={plaOlive}
                  stroke={stroke}
                  strokeWidth="1.15"
                />
                <circle cx={cx} cy="66.2" r="2.1" fill={stroke} />
              </g>
            ))}
            <circle cx="134.5" cy="62.5" r="4.1" fill={gunSteel} stroke={stroke} strokeWidth="1.05" />
          </svg>
        );
      }

      case 'm1a2': {
        const desertTan = available ? '#a8926a' : fill;
        const tanShade = available ? '#806d4e' : subFill;
        const gunMetal = available ? '#5c5243' : subFill;
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* 120mm M256 L/44 Smoothbore Barrel + Bore Evacuator + Muzzle Sensor */}
            <rect
              x="126"
              y="32"
              width="74"
              height="3.8"
              rx="0.6"
              fill={gunMetal}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="151"
              y="30.2"
              width="14"
              height="7.4"
              rx="1.6"
              fill={desertTan}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect x="195.5" y="29.2" width="3.2" height="2.8" fill={stroke} />

            {/* CROWS-LP RWS + CITV Thermal Sight on Turret Roof */}
            <path
              d="M78 21.5 L87 21.5 L89 27.5 L77 27.5 Z"
              fill={tanShade}
              stroke={stroke}
              strokeWidth="1"
            />
            <line x1="87" y1="23.5" x2="98" y2="23.5" stroke={stroke} strokeWidth="1.4" />
            <rect
              x="95"
              y="22.8"
              width="6.5"
              height="4.8"
              rx="0.8"
              fill={gunMetal}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <circle cx="99.2" cy="25.2" r="1.3" fill={accent} />

            {/* Iconic Slab-Sided Angular M1A2 Turret + Long Rear Bustle + Blow-Off Panels */}
            <path
              d="M32 28.5 L105 27.5 L128 33 L123 43.2 L35 42.5 Z"
              fill={desertTan}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Blow-off panel seam & bustle ammo compartment */}
            <line
              x1="64"
              y1="28.2"
              x2="64"
              y2="42.5"
              stroke={stroke}
              strokeWidth="1.05"
              strokeDasharray="2.2 1.4"
            />
            <rect
              x="36"
              y="26.3"
              width="25"
              height="2.1"
              rx="0.5"
              fill={accent}
              opacity="0.82"
            />
            <rect
              x="25"
              y="31"
              width="8.5"
              height="8.5"
              fill="none"
              stroke={stroke}
              strokeWidth="1.1"
            />

            {/* Low-Slung Abrams Hull with Sharply Sloped Glacis & Raised Rear Turbine Deck */}
            <path
              d="M14 43.5 L112 43.5 L149 52.8 L145 59.5 L16 59.5 L12 52 Z"
              fill={desertTan}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Segmented Heavy Ballistic Side Skirts */}
            <path
              d="M18 50.2 L145 50.8 L146 61 L16 61 Z"
              fill={tanShade}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {[36, 54, 72, 90, 108, 126].map((sx) => (
              <line
                key={sx}
                x1={sx}
                y1="50.5"
                x2={sx}
                y2="60.8"
                stroke={stroke}
                strokeWidth="0.9"
                opacity="0.7"
              />
            ))}

            {/* Track Envelope & 7 Abrams Road Wheels */}
            <path
              d="M19 59 L142 59 Q148 60 147 66.5 L138 73.5 L24 73.5 L15 66.5 Q14.5 60 19 59 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.4"
            />
            <circle cx="21" cy="64" r="4" fill={gunMetal} stroke={stroke} strokeWidth="1" />
            {[33, 49, 65, 81, 97, 113, 129].map((cx) => (
              <g key={cx}>
                <circle
                  cx={cx}
                  cy="67"
                  r="4.9"
                  fill={desertTan}
                  stroke={stroke}
                  strokeWidth="1.1"
                />
                <circle cx={cx} cy="67" r="1.9" fill={stroke} />
              </g>
            ))}
            <circle cx="141" cy="63.8" r="3.9" fill={gunMetal} stroke={stroke} strokeWidth="1" />
          </svg>
        );
      }

      case 'leopard2a7': {
        const natoGreen = available ? '#4a5741' : fill;
        const natoBrown = available ? '#5d4a3a' : subFill;
        const barrelDark = available ? '#374151' : subFill;
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* Extra-Long 6.6m Rheinmetall Rh-120 L/55A1 High-Pressure Barrel */}
            <rect
              x="120"
              y="30.8"
              width="86"
              height="3.6"
              rx="0.5"
              fill={barrelDark}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="151"
              y="29.1"
              width="14"
              height="7"
              rx="1.6"
              fill={natoGreen}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <rect x="201.5" y="28.2" width="3.5" height="2.6" fill={stroke} />

            {/* PERI R17A3 Commander Panoramic Periscope & Smoke Dischargers */}
            <rect
              x="76"
              y="21"
              width="6.5"
              height="6.2"
              rx="1"
              fill={natoBrown}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect x="79.5" y="22.4" width="2.4" height="2.6" fill={accent} />
            <line x1="60" y1="31" x2="66" y2="27.5" stroke={stroke} strokeWidth="1.4" />
            <line x1="63" y1="32" x2="69" y2="28.5" stroke={stroke} strokeWidth="1.4" />

            {/* Leopard 2A7V Turret + Signature Hollow Arrowhead Front Composite Wedges */}
            <path
              d="M34 27.2 L99 27.2 L125 33.4 L117 42.8 L34 42.8 Z"
              fill={natoGreen}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Hollow Arrowhead Cheek Wedge Highlight */}
            <polygon
              points="99,27.6 125.5,33.4 116.5,42.5 96,42.5"
              fill={natoBrown}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <line
              x1="102"
              y1="34.5"
              x2="122"
              y2="34.5"
              stroke={accent}
              strokeWidth="1.1"
              opacity="0.8"
            />

            {/* Stepped Rear MTU EuroPowerpack Deck + Hull & Composite Side Skirts */}
            <path
              d="M15 41.5 L62 41.5 L68 44.5 L118 44.5 L143 52 L139 59 L17 59 L13 51 Z"
              fill={natoGreen}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Heavy Forward Composite Skirt + Rear Rubber Skirt */}
            <path
              d="M19 50 L139 50.5 L141 60.5 L17 60.5 Z"
              fill={natoBrown}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect
              x="92"
              y="49.5"
              width="47"
              height="11.2"
              fill={natoGreen}
              stroke={stroke}
              strokeWidth="1.1"
            />

            {/* Track Belt & 7 Leopard Road Wheels */}
            <path
              d="M20 58.8 L137 58.8 Q143 60 142 66.5 L133 73.5 L25 73.5 L16 66.5 Q15.5 60 20 58.8 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.4"
            />
            <circle cx="22" cy="63.8" r="4.1" fill={barrelDark} stroke={stroke} strokeWidth="1" />
            {[34, 49.5, 65, 80.5, 96, 111.5, 126.5].map((cx) => (
              <g key={cx}>
                <circle
                  cx={cx}
                  cy="67"
                  r="4.8"
                  fill={natoGreen}
                  stroke={stroke}
                  strokeWidth="1.1"
                />
                <circle cx={cx} cy="67" r="1.9" fill={stroke} />
              </g>
            ))}
            <circle cx="136.5" cy="63.5" r="3.9" fill={barrelDark} stroke={stroke} strokeWidth="1" />
          </svg>
        );
      }

      case 'tiger1': {
        const dunkelgelb = available ? '#b29b6b' : fill;
        const dunkelShade = available ? '#8c774f' : subFill;
        const steelGrey = available ? '#475569' : subFill;
        return (
          <svg
            viewBox="0 0 210 88"
            className="weapon-silhouette-svg"
            aria-hidden="true"
          >
            {/* 88mm KwK 36 L/56 Rifled Barrel + Stepped Sleeve + Iconic Double-Baffle Muzzle Brake */}
            <rect
              x="118"
              y="28.6"
              width="28"
              height="4.8"
              fill={dunkelShade}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="146"
              y="29.3"
              width="42"
              height="3.4"
              fill={dunkelgelb}
              stroke={stroke}
              strokeWidth="1.05"
            />
            {/* Signature Cylindrical Twin-Baffle Muzzle Brake */}
            <rect
              x="188"
              y="26.8"
              width="12.5"
              height="8.4"
              rx="1.8"
              fill={steelGrey}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <line x1="192" y1="27.5" x2="192" y2="34.5" stroke={cutout} strokeWidth="1.6" />
            <line x1="196.2" y1="27.5" x2="196.2" y2="34.5" stroke={cutout} strokeWidth="1.6" />

            {/* Drum Commander Cupola + Rear Stowage Bin (Rommelkiste) */}
            <rect
              x="71"
              y="17.8"
              width="13"
              height="6.4"
              rx="1.2"
              fill={dunkelShade}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect
              x="51"
              y="26.5"
              width="9.5"
              height="10.5"
              rx="0.8"
              fill={dunkelShade}
              stroke={stroke}
              strokeWidth="1.1"
            />

            {/* Horseshoe Heavy Turret + Thick Cylindrical Armored Gun Mantlet */}
            <path
              d="M60 24 L112 24 L114 40.5 L60 40.5 Z"
              fill={dunkelgelb}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            <rect
              x="108"
              y="25.5"
              width="12"
              height="11.5"
              rx="2.6"
              fill={dunkelShade}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <circle cx="115.5" cy="31" r="1.4" fill={cutout} />

            {/* Classic WWII Vertical-Plate 100mm Box Hull + Driver Visor + Rear Exhaust Shrouds */}
            <path
              d="M27 40.5 L138 40.5 L140 53.5 L144 54.5 L141 60.5 L26 60.5 L24 52 Z"
              fill={dunkelgelb}
              stroke={stroke}
              strokeWidth="1.35"
              strokeLinejoin="round"
            />
            {/* Vertical Upper Hull Superstructure Step & 100mm Flat Driver Plate */}
            <line
              x1="126"
              y1="40.8"
              x2="126"
              y2="52"
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect x="129.5" y="44.2" width="6.5" height="2.4" fill={cutout} />
            <rect
              x="21.5"
              y="42.5"
              width="5.5"
              height="13.5"
              rx="1.2"
              fill={steelGrey}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Fender Mudguard Line */}
            <line
              x1="25"
              y1="52.5"
              x2="145"
              y2="52.5"
              stroke={stroke}
              strokeWidth="1.5"
            />

            {/* Wide Kgs 63 Track Loop & Signature Interleaved Overlapping Road Wheels (Schachtellaufwerk) */}
            <path
              d="M29 56.5 L139 56.5 Q145 58 144 65 L135 74.5 L34 74.5 L25 65 Q24.5 58 29 56.5 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.45"
            />
            {/* Rear Idler & Large Toothed Front Drive Sprocket */}
            <circle cx="32.5" cy="63" r="5.2" fill={steelGrey} stroke={stroke} strokeWidth="1.15" />
            <circle cx="137" cy="62.2" r="5.8" fill={steelGrey} stroke={stroke} strokeWidth="1.2" />
            {/* Inner Interleaved Wheel Tier (behind outer wheels) */}
            {[50, 69, 88, 107, 125].map((cx) => (
              <circle
                key={`inner-${cx}`}
                cx={cx}
                cy="66.5"
                r="6.8"
                fill={dunkelShade}
                stroke={stroke}
                strokeWidth="1.05"
                opacity="0.88"
              />
            ))}
            {/* Outer Overlapping Wheel Tier */}
            {[42, 60, 78, 96, 114].map((cx) => (
              <g key={`outer-${cx}`}>
                <circle
                  cx={cx}
                  cy="67.5"
                  r="6.6"
                  fill={dunkelgelb}
                  stroke={stroke}
                  strokeWidth="1.2"
                />
                <circle cx={cx} cy="67.5" r="2.2" fill={stroke} />
              </g>
            ))}
          </svg>
        );
      }

      case 'winchester1894': {
        const walnut = available ? '#7a4b2a' : subFill;
        const walnutShade = available ? '#5c361d' : fill;
        const blued = available ? '#2e3847' : fill;
        const saddleBrass = available ? '#d4a644' : accent;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Straight-Grip Walnut Buttstock + Curved Steel Carbine Buttplate */}
            <path
              d="M9 36 L14 35 L58 34 L58 43 L11 63 L8 62 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            <path
              d="M7.5 36.2 Q10.5 49 7.5 62.5 L11.5 63 Q14 49 11.5 35.8 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.1"
            />
            {/* Exposed Checkered Hammer Spur */}
            <path
              d="M57 34 L54 27 L60 28 L61 34 Z"
              fill={stroke}
              stroke={stroke}
              strokeWidth="0.8"
            />
            {/* Top-Eject Forged Blued Receiver + King Side Loading Gate + Saddle Ring */}
            <rect
              x="58"
              y="32"
              width="29"
              height="12"
              rx="1.4"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="71"
              y="35.5"
              width="9.5"
              height="4.2"
              rx="0.8"
              fill={accent}
              opacity="0.7"
            />
            <circle
              cx="65"
              cy="38"
              r="3.2"
              fill="none"
              stroke={saddleBrass}
              strokeWidth="1.3"
            />
            {/* Iconic D-Loop Finger Lever Toggle */}
            <path
              d="M66 44 L73 44 L55 59 L46 57 L52 46 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1.8"
              strokeLinejoin="round"
            />
            {/* 20" Tapered Round Carbine Barrel & Front Brass-Bead Sight */}
            <rect
              x="87"
              y="32.2"
              width="82"
              height="3.4"
              rx="0.8"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <polygon points="164,32.2 167.5,32.2 166.2,28.5" fill={saddleBrass} />
            {/* Semi-Buckhorn Stepped Rear Sight */}
            <polygon points="99,32.2 106,32.2 101,29.5" fill={stroke} />
            {/* Full-Length Tubular Magazine + Black Walnut Carbine Forend + Barrel Band */}
            <rect
              x="87"
              y="37"
              width="79"
              height="3"
              rx="0.7"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1"
            />
            <path
              d="M87 34 L132 34.4 L132 42.2 L87 42.5 Z"
              fill={walnutShade}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect
              x="128"
              y="31.8"
              width="4.2"
              height="10.8"
              rx="0.8"
              fill={stroke}
            />
          </svg>
        );
      }

      case 'rem870': {
        const walnut = available ? '#7a492a' : subFill;
        const walnutFore = available ? '#693d21' : subFill;
        const parkerized = available ? '#363c44' : fill;
        const chrome = available ? '#e2e8f0' : accent;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Vented Rubber Police Recoil Pad & Semi-Pistol Walnut Stock */}
            <path
              d="M8.5 34.5 L13.5 34 L13.5 62 L8.5 60.5 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="1.2"
            />
            <path
              d="M13.5 34.5 L53 33 L58 34.5 L55 44 L44 50 L13.5 61 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {/* Solid Billet Steel Model 870 Receiver + Hard-Chrome Bolt & Ejection Port */}
            <path
              d="M55 29.5 L94 29.5 L94 43.5 L55 43.5 Z"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="71"
              y="31.5"
              width="16"
              height="5"
              rx="1"
              fill={chrome}
            />
            {/* Aluminum Trigger Guard & Trigger */}
            <path
              d="M58 43.5 L72 43.5 L71 51 L57 51 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1.3"
            />
            <line
              x1="64"
              y1="43.8"
              x2="63"
              y2="49.2"
              stroke={stroke}
              strokeWidth="1.7"
              strokeLinecap="round"
            />
            {/* 18" Heavy-Wall Barrel + Rear Sight & Front Tritium Bead */}
            <rect
              x="94"
              y="30"
              width="75"
              height="4.6"
              rx="0.9"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <rect x="61" y="27.2" width="6" height="2.3" fill={stroke} />
            <polygon points="164,30 168,30 166.5,26.5" fill={chrome} />
            {/* 4+1 Steel Tubular Magazine + Barrel Guide Ring Collar + Knurled Mag Cap */}
            <rect
              x="94"
              y="36.2"
              width="65"
              height="4"
              rx="0.9"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="151"
              y="30"
              width="5"
              height="10.4"
              rx="0.8"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect
              x="159"
              y="35.6"
              width="5.5"
              height="5.2"
              rx="1"
              fill={stroke}
            />
            {/* Deeply Grooved Corn-Cob Walnut Pump Forend + Action Bar Spine */}
            <line
              x1="88"
              y1="38.2"
              x2="106"
              y2="38.2"
              stroke={chrome}
              strokeWidth="1.5"
            />
            <path
              d="M106 34.8 L142 35.2 L142 44.2 L106 44.6 Z"
              fill={walnutFore}
              stroke={stroke}
              strokeWidth="1.25"
            />
            {[110, 115, 120, 125, 130, 135, 139].map((gx) => (
              <line
                key={gx}
                x1={gx}
                y1="35.6"
                x2={gx}
                y2="43.8"
                stroke={stroke}
                strokeWidth="1"
                opacity="0.7"
              />
            ))}
          </svg>
        );
      }

      case 'm1911': {
        const parkerized = available ? '#47505c' : fill;
        const blued = available ? '#28303b' : fill;
        const polished = available ? '#cbd5e1' : accent;
        const walnut = available ? '#7a4b2a' : subFill;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Rounded Forged Parkerized Slide + Front/Rear Sights + Polished Chamber Hood */}
            <rect
              x="34"
              y="15"
              width="112"
              height="15"
              rx="2"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <polygon points="139,15 143,15 141.5,11.2 138.5,15" fill={blued} />
            <rect x="40" y="12" width="5" height="3" rx="0.6" fill={blued} />
            <rect
              x="74"
              y="15"
              width="22"
              height="6.5"
              rx="1"
              fill={polished}
              stroke={stroke}
              strokeWidth="0.9"
            />
            {[42, 45.5, 49, 52.5, 56].map((sx) => (
              <line
                key={sx}
                x1={sx}
                y1="17.5"
                x2={sx}
                y2="28"
                stroke={stroke}
                strokeWidth="0.85"
                opacity="0.65"
              />
            ))}
            {/* Exposed Spur Hammer */}
            <path
              d="M34 22 L27 17 L29 14 L36 19 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Forged Frame + Dust Cover + 18-Deg Grip + Closed Trigger Guard */}
            <path
              d="M34 30 L122 30 L122 37 L96 37 L96 50 L74 50 L60 76 L32 74 L43 39 L30 33 Z"
              fill={parkerized}
              stroke={stroke}
              strokeWidth="1.3"
              strokeLinejoin="round"
            />
            <path
              d="M76 37 L92 37 L92 46 L76 46 Z"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <rect x="77" y="38" width="5" height="7" rx="1" fill={blued} />
            {/* Double-Diamond Checkered Walnut Grip & Arched M1911A1 Mainspring Housing */}
            <path
              d="M44 41 L64 41 L54 71 L36 70 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <path
              d="M35 42 Q30 57 32 73 L36 73 Q34 57 39 42 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="0.95"
            />
          </svg>
        );
      }

      case 'mg42': {
        const stamped = available ? '#353c45' : fill;
        const bakelite = available ? '#6e3222' : subFill;
        const feldgrau = available ? '#4d584b' : subFill;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Marbled Bakelite Buttstock */}
            <path
              d="M8 36 L34 32 L36 45 L10 53 Z"
              fill={bakelite}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {/* Stamped Receiver & Perforated Rectangular Cooling Shroud */}
            <path
              d="M34 30 L96 29 L160 31.5 L160 38.5 L96 41 L34 42 Z"
              fill={stamped}
              stroke={stroke}
              strokeWidth="1.3"
            />
            {/* Top Feed Cover & Flip-Up AA Spider Sight */}
            <rect
              x="64"
              y="26.5"
              width="34"
              height="4.2"
              rx="0.8"
              fill={stamped}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <circle
              cx="103"
              cy="22"
              r="4.2"
              fill="none"
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Cooling Shroud Slots */}
            {[106, 117, 128, 139, 150].map((vx) => (
              <rect
                key={vx}
                x={vx}
                y="33.2"
                width="7.2"
                height="3.2"
                rx="1"
                fill={cutout}
              />
            ))}
            {/* Conical Muzzle Recoil Booster */}
            <path
              d="M160 31.8 L172 30.2 L173 39.8 L160 38.2 Z"
              fill={stamped}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* 50-Rd Gurttrommel 34 Assault Drum & Bakelite Pistol Grip */}
            <circle
              cx="84"
              cy="46.5"
              r="9.2"
              fill={feldgrau}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <path
              d="M52 42 L61 42 L57 60 L48 59 Z"
              fill={bakelite}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Folded Zweibein 42 Bipod */}
            <path
              d="M150 38.5 L122 50 L119 47.5 L146 38.5 Z"
              fill={stamped}
              stroke={stroke}
              strokeWidth="1"
            />
          </svg>
        );
      }

      case 'k98k': {
        const laminate = available ? '#8a5c36' : subFill;
        const lamStripe = available ? '#5c381c' : fill;
        const blued = available ? '#2b3444' : fill;
        const bright = available ? '#c4cedb' : accent;
        const brass = available ? '#d6a944' : accent;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            <path
              d="M8 42 L44 39 L53 38 L142 36 L142 41 L92 46 L68 47 L58 51 L51 49 L9 61 Z"
              fill={laminate}
              stroke={stroke}
              strokeWidth="1.2"
              strokeLinejoin="round"
            />
            <path
              d="M12 46 L48 43 M11 51 L54 47 M10 56 L40 52 M80 41 L138 39"
              stroke={lamStripe}
              strokeWidth="0.9"
              opacity="0.7"
            />
            <path
              d="M6.5 41.5 L10.5 41.5 L11.5 61.2 L7.2 61.4 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.05"
            />
            <rect
              x="16"
              y="46.5"
              width="7"
              height="4.2"
              rx="1"
              fill={cutout}
              stroke={stroke}
              strokeWidth="0.85"
            />
            <circle
              cx="29"
              cy="48.8"
              r="2.4"
              fill={blued}
              stroke={stroke}
              strokeWidth="0.9"
            />
            <path
              d="M86 33.5 L141 34 L141 37 L86 37.5 Z"
              fill={laminate}
              stroke={stroke}
              strokeWidth="1.0"
            />
            <rect
              x="82"
              y="34.2"
              width="91"
              height="3.4"
              rx="0.7"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.15"
            />
            <line
              x1="138"
              y1="39.5"
              x2="165"
              y2="39.5"
              stroke={blued}
              strokeWidth="1.1"
            />
            <circle
              cx="168.5"
              cy="32.2"
              r="2.2"
              fill="none"
              stroke={stroke}
              strokeWidth="1.1"
            />
            <path
              d="M139 33 L145 33 L145 41.5 L154 41.5 L154 43.3 L139 43.3 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.0"
            />
            <rect
              x="114"
              y="33.2"
              width="3.6"
              height="8.6"
              rx="0.5"
              fill={blued}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <path
              d="M91 31.8 L103 32.8 L103 34.8 L91 34.8 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <rect
              x="57"
              y="33"
              width="27"
              height="8.5"
              rx="1.2"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.25"
            />
            <path
              d="M57 46 L68 46 Q67 53 60 53 Q56 52 57 46 Z"
              fill="none"
              stroke={stroke}
              strokeWidth="1.25"
            />
            <rect
              x="54"
              y="34.2"
              width="24"
              height="3.6"
              rx="1"
              fill={bright}
              stroke={stroke}
              strokeWidth="0.95"
            />
            <path
              d="M61 36.5 L59.5 43.5"
              stroke={bright}
              strokeWidth="2.0"
              strokeLinecap="round"
            />
            <circle
              cx="59.2"
              cy="44.2"
              r="2.1"
              fill={bright}
              stroke={stroke}
              strokeWidth="0.85"
            />
            <path
              d="M55 34 L52.5 29.8 L56.5 30.2 L57.5 34 Z"
              fill={bright}
              stroke={stroke}
              strokeWidth="0.8"
            />
            <rect
              x="64.5"
              y="22.5"
              width="3.4"
              height="10.8"
              rx="0.6"
              fill={brass}
              stroke={stroke}
              strokeWidth="0.9"
            />
          </svg>
        );
      }

      case 'thompson': {
        const blued = available ? '#26303d' : fill;
        const walnut = available ? '#7a4526' : subFill;
        const bronze = available ? '#c88c44' : accent;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Quick-Detach Sloped American Black Walnut Buttstock */}
            <path
              d="M8 46 L48 33 L50 42 L10 62 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.25"
              strokeLinejoin="round"
            />
            {/* Solid Milled Du-Lite Upper & Lower Receiver + Lyman Rear Sight */}
            <rect
              x="47"
              y="28"
              width="66"
              height="11"
              rx="1.2"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.3"
            />
            <rect
              x="52"
              y="23.5"
              width="9"
              height="4.5"
              rx="0.8"
              fill={blued}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Top Knurled Actuator & Bronze Blish Indicator */}
            <rect
              x="76"
              y="25.2"
              width="8"
              height="2.8"
              rx="0.8"
              fill={bronze}
              stroke={stroke}
              strokeWidth="0.85"
            />
            <rect
              x="54"
              y="39"
              width="36"
              height="6.2"
              rx="1"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Rear Walnut Pistol Grip */}
            <path
              d="M54 44 L64 44 L59 64 L49 62 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* 50-Rd Type L Clockwork Spiral Drum Magazine */}
            <circle
              cx="102"
              cy="55"
              r="14.5"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <circle
              cx="102"
              cy="55"
              r="6.2"
              fill="none"
              stroke={bronze}
              strokeWidth="1.1"
              opacity="0.8"
            />
            {/* 28-Fin Barrel + Cutts Compensator + Vertical Walnut Foregrip */}
            <rect
              x="113"
              y="30.5"
              width="45"
              height="4.4"
              rx="0.7"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {[118, 122, 126, 130, 134, 138, 142, 146].map((fx) => (
              <line
                key={fx}
                x1={fx}
                y1="29.5"
                x2={fx}
                y2="36"
                stroke={stroke}
                strokeWidth="0.9"
              />
            ))}
            <path
              d="M158 29.5 L171 29.2 L171 35.8 L158 35.4 Z"
              fill={blued}
              stroke={stroke}
              strokeWidth="1.1"
            />
            <path
              d="M134 36 L142 36 L146 58 L137 59 Z"
              fill={walnut}
              stroke={stroke}
              strokeWidth="1.15"
            />
          </svg>
        );
      }

      case 'gau8': {
        const oliveDrum = available ? '#4a5547' : subFill;
        const housingSteel = available ? '#353e4a' : fill;
        const barrelSteel = available ? '#2a313b' : fill;
        const hazardYellow = available ? '#eab308' : accent;
        const thermalBronze = available ? '#b47442' : accent;
        return (
          <svg
            viewBox="0 0 180 86"
            className="weapon-silhouette-svg"
            aria-hidden
          >
            {/* Ø876mm 1,150-Rd Helical Ammunition Drum (Aft) */}
            <rect
              x="8"
              y="26"
              width="48"
              height="34"
              rx="5"
              fill={oliveDrum}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <line
              x1="18"
              y1="26"
              x2="18"
              y2="60"
              stroke={hazardYellow}
              strokeWidth="1.6"
              opacity="0.85"
            />
            <line
              x1="46"
              y1="26"
              x2="46"
              y2="60"
              stroke={stroke}
              strokeWidth="1.1"
            />
            {/* Closed-Loop Linkless Feed & Return Chutes */}
            <path
              d="M56 34 L76 34 L76 52 L56 52 Z"
              fill={subFill}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* Elliptical Heavy Forged Gun Housing & Twin Hydraulic Motors */}
            <rect
              x="74"
              y="29"
              width="34"
              height="24"
              rx="3"
              fill={housingSteel}
              stroke={stroke}
              strokeWidth="1.35"
            />
            <rect
              x="78"
              y="22.5"
              width="14"
              height="6.5"
              rx="1.5"
              fill={hazardYellow}
              stroke={stroke}
              strokeWidth="1"
            />
            {/* Titanium Recoil Adapter Cradle */}
            <path
              d="M78 53 L104 53 L109 63 L73 63 Z"
              fill={housingSteel}
              stroke={stroke}
              strokeWidth="1.15"
            />
            {/* 7-Barrel 2.3m 30mm Rotary Cluster + Intermediate & Perforated Muzzle Clamps */}
            {[33.5, 37.5, 41.5, 45.5, 49.5].map((by) => (
              <rect
                key={by}
                x="108"
                y={by}
                width="62"
                height="2.1"
                rx="0.5"
                fill={barrelSteel}
                stroke={stroke}
                strokeWidth="0.65"
              />
            ))}
            <rect
              x="128"
              y="32"
              width="4.5"
              height="20.5"
              rx="1"
              fill={housingSteel}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect
              x="148"
              y="32"
              width="4.5"
              height="20.5"
              rx="1"
              fill={housingSteel}
              stroke={stroke}
              strokeWidth="1"
            />
            <rect
              x="166"
              y="31.2"
              width="7.5"
              height="22"
              rx="1.5"
              fill={thermalBronze}
              stroke={stroke}
              strokeWidth="1.15"
            />
          </svg>
        );
      }
    }
  });

WeaponSilhouetteSvg.displayName = 'WeaponSilhouetteSvg';

import React from 'react';
import type {
  CentennialCadSpec,
  CentennialFinishPalette,
  CentennialMagStyle,
  CentennialMuzzleStyle,
  CentennialWeaponBlueprint,
} from './centennialTypes';

// ============================================================================
// Digital Armory 3D — 28-Archetype Pure-Leaf Centennial Vector Silhouette Engine
// ----------------------------------------------------------------------------
// Pure leaf module: imports ONLY React and `import type` contracts from
// `./centennialTypes` (ZERO runtime catalog/store imports) so the
// `armory-silhouettes` Rollup chunk remains strictly acyclic and < 115 kB.
// Matches `WeaponSilhouetteSvg.tsx` (`viewBox="0 0 180 86"`).
// ============================================================================

export interface CentennialSilhouettePalette {
  stroke: string;
  fill: string;
  subFill: string;
  accent: string;
  cutout: string;
}

interface ResolvedTones {
  readonly stroke: string;
  readonly fill: string;
  readonly subFill: string;
  readonly accent: string;
  readonly cutout: string;
  readonly body: string;
  readonly furniture: string;
  readonly mag: string;
  readonly detail: string;
}

function resolveTones(
  finish: CentennialFinishPalette,
  cad: CentennialCadSpec,
  palette: CentennialSilhouettePalette
): ResolvedTones {
  const muted = palette.fill.startsWith('rgba(');
  if (muted) {
    return {
      stroke: palette.stroke,
      fill: palette.fill,
      subFill: palette.subFill,
      accent: palette.accent,
      cutout: palette.cutout,
      body: palette.fill,
      furniture: palette.subFill,
      mag: palette.fill,
      detail: palette.accent,
    };
  }

  let body: string;
  switch (finish) {
    case 'blued_steel':
      body = '#253246';
      break;
    case 'stainless':
      body = '#7c8896';
      break;
    case 'fde':
      body = '#8c7656';
      break;
    case 'od_green':
    case 'nato_camo':
      body = '#44533b';
      break;
    case 'russian_green':
    case 'wwii_soviet':
      body = '#3e4d37';
      break;
    case 'desert_carc':
      body = '#9e8860';
      break;
    case 'titanium_matte':
      body = '#5d6978';
      break;
    default:
      body = palette.fill;
      break;
  }

  let furniture = palette.subFill;
  if (finish === 'yew_wood') {
    furniture = '#8c5a2b';
  } else if (finish === 'bakelite_ak') {
    furniture = '#8f4725';
  } else if (cad.hasWoodFurniture || finish === 'walnut_classic') {
    furniture = '#7a4b2a';
  } else if (finish === 'fde' || finish === 'desert_carc') {
    furniture = '#a6906a';
  } else if (finish === 'carbon_camo') {
    furniture = '#2c3645';
  }

  const mag = finish === 'bakelite_ak' ? '#a64d24' : palette.fill;
  const detail =
    finish === 'walnut_classic' || finish === 'yew_wood'
      ? '#d4a359'
      : palette.accent;

  return {
    stroke: palette.stroke,
    fill: palette.fill,
    subFill: palette.subFill,
    accent: palette.accent,
    cutout: palette.cutout,
    body,
    furniture,
    mag,
    detail,
  };
}

function renderMuzzleDevice(
  x: number,
  centerY: number,
  style: CentennialMuzzleStyle,
  t: ResolvedTones
): React.ReactNode {
  switch (style) {
    case 'suppressor':
      return (
        <g>
          <rect
            x={x}
            y={centerY - 3.6}
            width="22"
            height="7.2"
            rx="1.6"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.15"
          />
          <line
            x1={x + 6}
            y1={centerY - 3.4}
            x2={x + 6}
            y2={centerY + 3.4}
            stroke={t.stroke}
            strokeWidth="0.7"
            opacity="0.65"
          />
          <line
            x1={x + 15}
            y1={centerY - 3.4}
            x2={x + 15}
            y2={centerY + 3.4}
            stroke={t.stroke}
            strokeWidth="0.7"
            opacity="0.65"
          />
        </g>
      );
    case 'brake':
      return (
        <g>
          <rect
            x={x}
            y={centerY - 3.1}
            width="12"
            height="6.2"
            rx="0.9"
            fill={t.fill}
            stroke={t.stroke}
            strokeWidth="1.1"
          />
          <rect
            x={x + 2.5}
            y={centerY - 1.6}
            width="2.6"
            height="3.2"
            fill={t.cutout}
          />
          <rect
            x={x + 7}
            y={centerY - 1.6}
            width="2.6"
            height="3.2"
            fill={t.cutout}
          />
        </g>
      );
    case 'flash_hider':
      return (
        <g>
          <rect
            x={x}
            y={centerY - 2.6}
            width="10.5"
            height="5.2"
            rx="0.8"
            fill={t.fill}
            stroke={t.stroke}
            strokeWidth="1.05"
          />
          <line
            x1={x + 4}
            y1={centerY - 1.2}
            x2={x + 9}
            y2={centerY - 1.2}
            stroke={t.cutout}
            strokeWidth="1.1"
          />
          <line
            x1={x + 4}
            y1={centerY + 1.2}
            x2={x + 9}
            y2={centerY + 1.2}
            stroke={t.cutout}
            strokeWidth="1.1"
          />
        </g>
      );
    case 'shroud':
      return (
        <path
          d={`M${x} ${centerY - 3.2} L${x + 11} ${centerY - 3.2} L${x + 8.5} ${centerY + 3.2} L${x} ${centerY + 3.2} Z`}
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.05"
        />
      );
    case 'bare':
    case 'rotary_clamp':
    case 'tank_evacuator':
    case 'artillery_brake':
      return (
        <rect
          x={x}
          y={centerY - 1.9}
          width="3.2"
          height="3.8"
          rx="0.5"
          fill={t.stroke}
        />
      );
  }
}

function renderOptic(
  x: number,
  railY: number,
  variant: 'scope' | 'compact' | 'pso',
  t: ResolvedTones
): React.ReactNode {
  if (variant === 'compact') {
    return (
      <g>
        <rect
          x={x}
          y={railY - 8.5}
          width="18"
          height="6.8"
          rx="1.2"
          fill={t.fill}
          stroke={t.stroke}
          strokeWidth="1.1"
        />
        <rect x={x + 3} y={railY - 1.7} width="12" height="2" fill={t.stroke} />
        <rect
          x={x + 14.5}
          y={railY - 7.3}
          width="2.4"
          height="4.4"
          rx="0.6"
          fill={t.accent}
        />
      </g>
    );
  }
  if (variant === 'pso') {
    return (
      <g>
        <path
          d={`M${x - 4} ${railY - 9.2} L${x + 4} ${railY - 8.4} L${x + 28} ${railY - 8.4} L${x + 35} ${railY - 9.6} L${x + 35} ${railY - 3.4} L${x + 28} ${railY - 4.8} L${x + 4} ${railY - 4.8} L${x - 4} ${railY - 4} Z`}
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.1"
        />
        <rect x={x + 14} y={railY - 11} width="4.2" height="2.6" fill={t.accent} />
        <path
          d={`M${x + 6} ${railY - 4.8} L${x + 12} ${railY + 2} L${x + 22} ${railY + 2} L${x + 24} ${railY - 4.8}`}
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.5"
        />
      </g>
    );
  }
  return (
    <g>
      <path
        d={`M${x} ${railY - 10.4} L${x + 11} ${railY - 8.6} L${x + 36} ${railY - 8.6} L${x + 50} ${railY - 11.2} L${x + 50} ${railY - 3.2} L${x + 36} ${railY - 5.2} L${x + 11} ${railY - 5.2} L${x} ${railY - 4} Z`}
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="1.15"
        strokeLinejoin="round"
      />
      <rect x={x + 21} y={railY - 12.2} width="5.2" height="3.6" fill={t.accent} />
      <rect x={x + 13} y={railY - 5.2} width="3.2" height="5.4" fill={t.stroke} />
      <rect x={x + 30} y={railY - 5.2} width="3.2" height="5.4" fill={t.stroke} />
    </g>
  );
}

function renderBipod(
  pivotX: number,
  pivotY: number,
  footY: number,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      <rect
        x={pivotX - 3}
        y={pivotY - 1}
        width="6"
        height="4"
        rx="0.8"
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      <line
        x1={pivotX - 0.5}
        y1={pivotY + 2.5}
        x2={pivotX - 9}
        y2={footY}
        stroke={t.stroke}
        strokeWidth="2.1"
        strokeLinecap="round"
      />
      <line
        x1={pivotX + 1.5}
        y1={pivotY + 2.5}
        x2={pivotX + 7}
        y2={footY - 1}
        stroke={t.stroke}
        strokeWidth="1.7"
        strokeLinecap="round"
        opacity="0.75"
      />
      <line
        x1={pivotX - 11.5}
        y1={footY}
        x2={pivotX - 6.5}
        y2={footY}
        stroke={t.accent}
        strokeWidth="1.6"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderRifleMag(
  x: number,
  y: number,
  magStyle: CentennialMagStyle,
  capacity: number,
  t: ResolvedTones
): React.ReactNode {
  if (magStyle === 'box_internal') {
    return (
      <path
        d={`M${x} ${y} L${x + 20} ${y} L${x + 17} ${y + 6.5} L${x + 2} ${y + 5.5} Z`}
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
    );
  }
  if (magStyle === 'drum') {
    return (
      <g>
        <circle
          cx={x + 8}
          cy={y + 13}
          r="13.5"
          fill={t.mag}
          stroke={t.stroke}
          strokeWidth="1.3"
        />
        <circle
          cx={x + 8}
          cy={y + 13}
          r="6.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="0.9"
        />
        <circle cx={x + 8} cy={y + 13} r="2.2" fill={t.accent} />
      </g>
    );
  }
  if (magStyle === 'straight') {
    const h = capacity >= 25 ? 25 : capacity >= 15 ? 20 : 14;
    return (
      <path
        d={`M${x} ${y} L${x + 14.5} ${y} L${x + 16} ${y + h} L${x + 1.5} ${y + h} Z`}
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
    );
  }
  const deep = capacity >= 40 ? 37 : capacity >= 25 ? 30 : 21;
  const sweep = capacity >= 40 ? 20 : capacity >= 25 ? 14 : 7;
  return (
    <path
      d={`M${x} ${y} L${x + 13.5} ${y} Q${x + 17} ${y + deep * 0.55} ${x + 14 + sweep} ${y + deep} L${x + 1 + sweep} ${y + deep + 3.5} Q${x + 3} ${y + deep * 0.6} ${x} ${y} Z`}
      fill={t.mag}
      stroke={t.stroke}
      strokeWidth="1.25"
      strokeLinejoin="round"
    />
  );
}

// ============================================================================
// Archetype Silhouette Builders (28 Distinct Silhouettes)
// ============================================================================

function renderAkRifle(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isStg44 = bp.id === 'stg44';
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 146 : 158;
  return (
    <g>
      {/* Fixed Wood or Folding Skeleton Buttstock */}
      {bp.cad.hasWoodFurniture || isStg44 ? (
        <path
          d="M9 32 L46 30 L46 41 L24 47 L9 54 Z"
          fill={t.furniture}
          stroke={t.stroke}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      ) : (
        <g>
          <path
            d="M10 30 L46 30 L46 39 L15 51 L10 51 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon points="17,34 40,34 17,45" fill={t.cutout} />
        </g>
      )}
      {/* Stamped Receiver & Ribbed Dust Cover */}
      <path
        d="M46 27.5 L99 27.5 L100 41 L46 41 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <line
        x1="50"
        y1="32"
        x2="94"
        y2="32"
        stroke={t.stroke}
        strokeWidth="0.9"
        opacity="0.7"
      />
      {/* Upper Gas Tube + Handguard */}
      <rect
        x="100"
        y="28.5"
        width={isStg44 ? 42 : 34}
        height="4.4"
        rx="0.8"
        fill={isStg44 ? t.body : t.furniture}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <path
        d={
          isStg44
            ? 'M100 32.5 L143 32.5 L141 40.5 L100 40.5 Z'
            : 'M100 33 L133 33 L131 41 L100 41 Z'
        }
        fill={isStg44 ? t.subFill : t.furniture}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {isStg44 &&
        [107, 114, 121, 128, 135].map((vx) => (
          <circle key={vx} cx={vx} cy="36.5" r="1.4" fill={t.cutout} />
        ))}
      {/* Barrel + 45-deg Gas Block + Front Sight Tower */}
      <rect
        x={isStg44 ? 142 : 132}
        y="32.2"
        width={muzzleX - (isStg44 ? 142 : 132)}
        height="3.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.8"
      />
      <path
        d={`M${isStg44 ? 143 : 134} 28.5 L${isStg44 ? 148 : 141} 28.5 L${isStg44 ? 146 : 139} 33 L${isStg44 ? 142 : 134} 33 Z`}
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <path
        d={`M${muzzleX - 8} 32.2 L${muzzleX - 5} 21.5 L${muzzleX - 1.5} 21.5 L${muzzleX - 2} 32.2 Z`}
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Pistol Grip + Trigger Guard + Curved Banana Mag */}
      <path
        d="M54 41 L64.5 41 L56.5 64 L46.5 61.5 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="65"
        y="41"
        width="14.5"
        height="7.5"
        rx="1.5"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {renderRifleMag(82, 41, bp.cad.magStyle, bp.magCapacity, t)}
      {bp.cad.hasOptic && renderOptic(54, 27.5, 'pso', t)}
      {bp.cad.hasBipod && renderBipod(muzzleX - 12, 36.5, 65, t)}
      {renderMuzzleDevice(muzzleX, 33.8, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderArRifle(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isM16 = bp.id === 'm16a1';
  const isG36 = bp.id === 'g36c';
  const muzzleX =
    bp.cad.muzzleStyle === 'suppressor' ? 144 : isG36 ? 146 : 158;
  return (
    <g>
      {/* Buttstock (Fixed M16 Triangle / Folding G36 / Collapsible AR) */}
      {isM16 ? (
        <path
          d="M9 28.5 L47 28.5 L47 39.5 L15 52 L9 51 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      ) : isG36 ? (
        <g>
          <path
            d="M12 29 L47 29 L47 39 L16 50 L12 50 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon points="18,33 41,33 18,44" fill={t.cutout} />
        </g>
      ) : (
        <g>
          <rect
            x="16"
            y="29.5"
            width="31"
            height="5.5"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="0.9"
          />
          <path
            d="M11 27 L36 27 L36 37.5 L24 47 L11 51.5 Z"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
        </g>
      )}
      {/* Forged Upper & Lower Receiver + Flared Magwell */}
      <path
        d="M47 27 L98 27 L98 42.5 L81 42.5 L80 49.5 L65 49.5 L65 41 L47 41 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Carry Handle OR Flat-Top Picatinny Rail */}
      {bp.cad.hasCarryHandle ? (
        <g>
          <path
            d={
              isG36
                ? 'M50 27 L55 17.5 L126 17.5 L130 27 Z'
                : 'M51 27 L55 18.5 L90 18.5 L93 27 Z'
            }
            fill="none"
            stroke={t.stroke}
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
          <line
            x1="57"
            y1="17.5"
            x2={isG36 ? 124 : 88}
            y2="17.5"
            stroke={t.accent}
            strokeWidth="1.2"
          />
        </g>
      ) : (
        <line
          x1="49"
          y1="25.6"
          x2={isG36 ? 131 : 134}
          y2="25.6"
          stroke={t.accent}
          strokeWidth="1.6"
          strokeDasharray="2.6 1.6"
        />
      )}
      {/* Handguard (M16 Triangular / Quad-Rail / M-LOK) */}
      {isM16 ? (
        <path
          d="M98 28 L138 30.2 L138 37.5 L98 40.5 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
      ) : (
        <g>
          <rect
            x="98"
            y="27.2"
            width={isG36 ? 32 : 36}
            height="11.4"
            rx="1.2"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          {[104, 113, 122].map((sx) => (
            <rect
              key={sx}
              x={sx}
              y="31.4"
              width="5.5"
              height="2.5"
              rx="0.9"
              fill={t.cutout}
            />
          ))}
        </g>
      )}
      {/* Barrel + Front Sight A-Frame (when carry handle) */}
      <rect
        x={isG36 ? 130 : 134}
        y="31.8"
        width={muzzleX - (isG36 ? 130 : 134)}
        height="3.3"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.85"
      />
      {isM16 && (
        <path
          d="M138 32 L143 20.5 L146 20.5 L148 32 Z"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.4"
        />
      )}
      {/* Pistol Grip + Trigger Guard + Magazine */}
      <path
        d="M52 41 L62 41 L54 64 L44 61.5 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="62"
        y="41"
        width="13"
        height="7.5"
        rx="1.2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {renderRifleMag(79.5, 42.5, bp.cad.magStyle, bp.magCapacity, t)}
      {bp.cad.hasOptic &&
        renderOptic(
          54,
          bp.cad.hasCarryHandle ? 17.5 : 26.8,
          bp.cad.barrelLenCm >= 40 ? 'scope' : 'compact',
          t
        )}
      {bp.cad.hasBipod && renderBipod(131, 38.6, 66, t)}
      {renderMuzzleDevice(muzzleX, 33.4, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderBattleRifle(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isWoodTraditional =
    bp.cad.hasWoodFurniture &&
    (bp.cad.magStyle === 'box_internal' ||
      bp.id === 'm14' ||
      bp.id === 'bar1918');
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 148 : 160;
  return (
    <g>
      {isWoodTraditional ? (
        /* Continuous Traditional Rifle Stock + Semi-Pistol Wrist (M14 / SKS) */
        <path
          d="M8 35 L46 33 L62 34 L134 34 L132 41.5 L62 42 L48 48 L12 56 L8 54 Z"
          fill={t.furniture}
          stroke={t.stroke}
          strokeWidth="1.3"
          strokeLinejoin="round"
        />
      ) : (
        /* Modernized Battle Rifle Stock + Separate Pistol Grip (FN FAL / G3A3) */
        <g>
          <path
            d="M8 30 L47 30 L47 40 L14 52 L8 51 Z"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <path
            d="M47 28.5 L100 28.5 L100 41.5 L47 41.5 Z"
            fill={t.body}
            stroke={t.stroke}
            strokeWidth="1.3"
          />
          <path
            d="M100 29.5 L139 30.8 L138 39.8 L100 41 Z"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          <path
            d="M52 41.5 L62.5 41.5 L54.5 64 L44.5 62 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
        </g>
      )}
      {isWoodTraditional && (
        <rect
          x="56"
          y="29"
          width="42"
          height="6.2"
          rx="1"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
      )}
      {/* Long 7.62 Full-Power Barrel & Front Sight */}
      <rect
        x="134"
        y="31.8"
        width={muzzleX - 134}
        height="3.4"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      <rect
        x={muzzleX - 6}
        y="24"
        width="3.4"
        height="7.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      {/* SKS Folded Under-Barrel Blade Bayonet */}
      {bp.id === 'sks' && (
        <path
          d="M114 41.5 L154 37.5 L154 39.8 L114 43.2 Z"
          fill={t.stroke}
          opacity="0.85"
        />
      )}
      {/* Trigger Guard + Magazine */}
      <rect
        x="63"
        y="41.5"
        width="14.5"
        height="7.5"
        rx="1.6"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {renderRifleMag(81, 41.5, bp.cad.magStyle, bp.magCapacity, t)}
      {bp.cad.hasCarryHandle && (
        <path
          d="M90 28.5 L92 21.5 L106 21.5 L108 28.5"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.8"
          strokeLinejoin="round"
        />
      )}
      {bp.cad.hasOptic && renderOptic(54, 28.5, 'scope', t)}
      {bp.cad.hasBipod && renderBipod(136, 39.5, 67, t)}
      {renderMuzzleDevice(muzzleX, 33.5, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderBullpupRifle(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isFamas = bp.id === 'famas';
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 142 : 154;
  return (
    <g>
      {/* Integrated Rear Bullpup Buttpad + Monolithic Polymer Chassis */}
      <path
        d="M16 27.5 L120 27.5 L124 39 L102 42 L84 42 L84 62 L73 62 L73 46 L16 53 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <rect x="14" y="27" width="4.5" height="26.5" rx="1" fill={t.stroke} />
      {/* Forward Cutlass Trigger Guard + Pistol Grip */}
      <path
        d="M84 42 L105 42 L101 57 L84 57 Z"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <line
        x1="93"
        y1="43"
        x2="91"
        y2="50"
        stroke={t.accent}
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      {/* Tall Iconic Carry Handle (FAMAS Clarion / QBZ-95) or Flat Tactical Rail (Tavor) */}
      {bp.cad.hasCarryHandle ? (
        <g>
          <path
            d={
              isFamas
                ? 'M32 27.5 L38 14 L112 14 L118 27.5 Z'
                : 'M38 27.5 L46 16.5 L112 16.5 L118 27.5 Z'
            }
            fill="none"
            stroke={t.stroke}
            strokeWidth="2.4"
            strokeLinejoin="round"
          />
          <rect
            x="44"
            y={isFamas ? 17.5 : 19.5}
            width="62"
            height={isFamas ? 7.5 : 5.5}
            rx="1.5"
            fill={t.cutout}
          />
          <line
            x1="40"
            y1={isFamas ? 13.8 : 16.2}
            x2="110"
            y2={isFamas ? 13.8 : 16.2}
            stroke={t.accent}
            strokeWidth="1.3"
          />
        </g>
      ) : (
        <line
          x1="28"
          y1="25.8"
          x2="119"
          y2="25.8"
          stroke={t.accent}
          strokeWidth="1.7"
          strokeDasharray="2.5 1.5"
        />
      )}
      {/* Rear-Inserted Bullpup Magazine (Behind Pistol Grip) */}
      {renderRifleMag(36, 48, bp.cad.magStyle, bp.magCapacity, t)}
      {/* Exposed Forward Barrel & Muzzle */}
      <rect
        x="120"
        y="31.5"
        width={muzzleX - 120}
        height="3.6"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      {bp.cad.hasOptic &&
        renderOptic(64, bp.cad.hasCarryHandle ? 14 : 26.5, 'compact', t)}
      {bp.cad.hasBipod && renderBipod(118, 39.5, 68, t)}
      {renderMuzzleDevice(muzzleX, 33.3, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderLmgBelt(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isBelt = bp.cad.magStyle === 'belt';
  const isPkm = bp.id === 'pkm';
  const isM60 = bp.id === 'm60e4';
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 148 : 158;
  return (
    <g>
      {/* Heavy Machine Gun Buttstock (In-Line M60 / Cutout PKM / Hydraulic M240B) */}
      {isM60 ? (
        <path
          d="M12 26.5 L45 26.5 L45 41.5 L12 43.5 Z"
          fill={t.furniture}
          stroke={t.stroke}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      ) : (
        <path
          d="M8 29 L45 29 L45 41 L21 47 L8 53 Z"
          fill={t.furniture}
          stroke={t.stroke}
          strokeWidth="1.25"
          strokeLinejoin="round"
        />
      )}
      {(bp.cad.hasWoodFurniture || isPkm) && (
        <polygon points="16,35 35,34 35,41 16,46" fill={t.cutout} />
      )}
      {/* Boxy Belt-Feed Receiver & Hinged Top Cover */}
      <rect
        x="45"
        y="25.5"
        width="60"
        height="16.5"
        rx="1.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <rect
        x="49"
        y="22.8"
        width="50"
        height="3.2"
        rx="0.8"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      {/* Quick-Change Barrel Carry Handle */}
      {bp.cad.hasCarryHandle && (
        <path
          d="M105 27.5 L112 18 L125 18 L127 21.5 L114 21.5 L109 28.5"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.15"
        />
      )}
      {/* Vented Handguard + Heavy Fluted Barrel + Under-Barrel Gas Tube */}
      <rect
        x="105"
        y="29.5"
        width="26"
        height="10.5"
        rx="1.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      <rect
        x="105"
        y="29.2"
        width={muzzleX - 105}
        height="4"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <rect
        x="105"
        y="35.2"
        width="36"
        height="2.8"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.8"
      />
      <path
        d={`M${muzzleX - 8} 29.2 L${muzzleX - 4} 20.5 L${muzzleX - 1} 20.5 L${muzzleX - 2} 29.2 Z`}
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      {/* Pistol Grip & Trigger Guard */}
      <path
        d="M52 42 L62 42 L54 64 L45 62 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="62"
        y="42"
        width="14"
        height="7.5"
        rx="1.2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Hanging 100-Rd Ammo Box + Brass Belt Links (or Extended Box Mag) */}
      {isBelt ? (
        <g>
          <rect
            x="78"
            y="45"
            width="24"
            height="24"
            rx="2"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.3"
          />
          {[82, 86, 90, 94, 98].map((bx) => (
            <rect
              key={bx}
              x={bx}
              y="36"
              width="2.4"
              height="9.5"
              rx="0.7"
              fill={t.detail}
              stroke={t.stroke}
              strokeWidth="0.5"
            />
          ))}
        </g>
      ) : (
        renderRifleMag(80, 42, bp.cad.magStyle, bp.magCapacity, t)
      )}
      {bp.cad.hasOptic && renderOptic(54, 22.8, 'compact', t)}
      {bp.cad.hasBipod && renderBipod(139, 38.5, 69, t)}
      {renderMuzzleDevice(muzzleX, 31.2, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderLmgPan(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Iconic DP-28 Flat Circular 47-Rd Top Pan Magazine ("Record Player") */}
      <rect
        x="56"
        y="22.5"
        width="50"
        height="7.5"
        rx="3.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <rect
        x="77"
        y="19"
        width="8"
        height="3.5"
        rx="1"
        fill={t.accent}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      {[64, 72, 88, 96].map((rx) => (
        <line
          key={rx}
          x1={rx}
          y1="23.5"
          x2={rx}
          y2="29"
          stroke={t.stroke}
          strokeWidth="0.85"
          opacity="0.75"
        />
      ))}
      {/* Straight Soviet Birch Semi-Pistol Stock */}
      <path
        d="M8 38 L52 33 L56 41 L42 47 L11 56 L8 54 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Slender Machined Receiver & Trigger Guard */}
      <rect
        x="52"
        y="30.5"
        width="52"
        height="10.5"
        rx="1.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <rect
        x="58"
        y="41"
        width="16"
        height="7.5"
        rx="2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Perforated Cylindrical Barrel Cooling Jacket */}
      <rect
        x="104"
        y="31.5"
        width="45"
        height="7.4"
        rx="1.4"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {[110, 118, 126, 134, 142].map((vx) => (
        <rect
          key={vx}
          x={vx}
          y="33.5"
          width="4.5"
          height="3.2"
          rx="1.2"
          fill={t.cutout}
        />
      ))}
      {/* Exposed Barrel + Conical Bell Flash Hider */}
      <rect x="149" y="33.6" width="11" height="3.2" fill={t.body} />
      <polygon
        points="160,33.4 171,30.5 171,39.8 160,37"
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      {/* Sweeping Forward V-Bipod */}
      {bp.cad.hasBipod && renderBipod(145, 39, 69, t)}
    </g>
  );
}

function renderHeavyMg(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Twin Rear Spade Grips & Butterfly Thumb Trigger (M2HB .50 BMG) */}
      <rect
        x="12"
        y="25"
        width="5"
        height="27"
        rx="2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <path
        d="M17 28 L27 28 M17 48 L27 48"
        stroke={t.stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <rect x="20" y="35.5" width="7" height="5.5" rx="1" fill={t.accent} />
      {/* Massive Slab-Sided Steel Receiver Box */}
      <rect
        x="27"
        y="24"
        width="68"
        height="26"
        rx="1.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.45"
      />
      <rect
        x="34"
        y="20.5"
        width="52"
        height="3.5"
        rx="0.8"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Belted .50 BMG Feed Tray + Hanging Brass Rounds */}
      {[68, 72.5, 77, 81.5, 86].map((bx) => (
        <rect
          key={bx}
          x={bx}
          y="48"
          width="2.7"
          height="14"
          rx="0.8"
          fill={t.detail}
          stroke={t.stroke}
          strokeWidth="0.6"
        />
      ))}
      {/* Perforated Cylindrical Barrel Support Jacket */}
      <rect
        x="95"
        y="29"
        width="32"
        height="13.5"
        rx="1.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      {[101, 108, 115, 122].map((cx) => (
        <circle key={cx} cx={cx} cy="35.7" r="2.2" fill={t.cutout} />
      ))}
      {/* Heavy Tapered .50 Cal Barrel + Carry Handle */}
      {bp.cad.hasCarryHandle && (
        <path
          d="M110 29 L115 20.5 L129 20.5 L131 24"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.9"
          strokeLinejoin="round"
        />
      )}
      <path
        d="M127 32.5 L170 33.4 L170 38 L127 39 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Pintle Cradle / Tripod Mounting Yoke */}
      <path
        d="M46 50 L62 50 L58 67 L49 67 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <line
        x1="50"
        y1="66"
        x2="32"
        y2="77"
        stroke={t.stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
      <line
        x1="57"
        y1="66"
        x2="80"
        y2="77"
        stroke={t.stroke}
        strokeWidth="2.4"
        strokeLinecap="round"
      />
    </g>
  );
}

function renderSmgTube(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  if (bp.id === 'uzi' || bp.cad.magStyle === 'pistol_grip') {
    /* T-Shaped Uzi Profile (Central Pistol-Grip Magazine) */
    return (
      <g>
        <path
          d="M16 28 L52 28 L52 38 L22 46 L16 46 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <polygon points="22,32 46,32 22,42" fill={t.cutout} />
        <rect
          x="52"
          y="25.5"
          width="66"
          height="16.5"
          rx="1.5"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        <rect
          x="94"
          y="36"
          width="24"
          height="8.5"
          rx="1.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.1"
        />
        <rect
          x="118"
          y="30.5"
          width="34"
          height="4.6"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1"
        />
        <rect
          x="74"
          y="42"
          width="13"
          height="24"
          rx="1.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.25"
        />
        <rect
          x="76.5"
          y="65"
          width="8.5"
          height="15"
          rx="0.8"
          fill={t.mag}
          stroke={t.stroke}
          strokeWidth="1.15"
        />
        <rect
          x="87"
          y="42"
          width="12"
          height="8.5"
          rx="1.5"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        {renderMuzzleDevice(152, 32.8, bp.cad.muzzleStyle, t)}
      </g>
    );
  }
  if (bp.id === 'sten') {
    /* British Sten Mk II Welded Wire Stock + Cylindrical Tube + Perforated Shroud */
    return (
      <g>
        <path
          d="M12 31 L56 32 M12 31 L12 52 L19 52 L19 42 L56 36"
          fill="none"
          stroke={t.stroke}
          strokeWidth="2.4"
          strokeLinejoin="round"
        />
        <rect
          x="56"
          y="29"
          width="58"
          height="10.5"
          rx="5"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        {/* Side-Mounted Horizontal Magazine Housing & Exposed Stick Shadow */}
        <rect
          x="96"
          y="32"
          width="16"
          height="6.5"
          rx="1"
          fill={t.accent}
          stroke={t.stroke}
          strokeWidth="1"
        />
        <rect
          x="65"
          y="39.5"
          width="14"
          height="8"
          rx="2"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        <rect
          x="114"
          y="30"
          width="36"
          height="8.5"
          rx="1.5"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        {[120, 128, 136, 144].map((vx) => (
          <circle key={vx} cx={vx} cy="34.2" r="1.8" fill={t.cutout} />
        ))}
        <rect x="150" y="32.5" width="16" height="3.6" fill={t.body} />
      </g>
    );
  }
  /* MP 40 Schmeisser Classic Underfolding Stock + Straight Vertical Mag + Resting Bar */
  return (
    <g>
      <path
        d="M14 28 L19 28 L19 47 L14 47 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <line x1="19" y1="31" x2="52" y2="33" stroke={t.stroke} strokeWidth="2.1" />
      <line x1="19" y1="43" x2="52" y2="38" stroke={t.stroke} strokeWidth="2.1" />
      <rect
        x="52"
        y="28.5"
        width="64"
        height="11.5"
        rx="2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <rect
        x="72"
        y="36.5"
        width="38"
        height="6"
        rx="1.2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <path
        d="M55 40 L65 40 L57 63 L48 61 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="65"
        y="40"
        width="13"
        height="7.5"
        rx="1.5"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Forward Straight 32-Rd Vertical Stick Mag */}
      <rect
        x="105"
        y="40"
        width="9"
        height="35"
        rx="1"
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      {/* Exposed Barrel + Signature Under-Barrel Resting Bar */}
      <rect x="116" y="31.5" width="44" height="3.6" fill={t.body} />
      <path
        d="M116 36 L146 36 L146 39.5 L143 39.5 L143 37.5 L116 37.5 Z"
        fill={t.subFill}
      />
      <rect x="155" y="25.5" width="3" height="6" fill={t.stroke} />
    </g>
  );
}

function renderSmgDrum(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  if (bp.id === 'bizon') {
    /* PP-19 Bizon — Massive Cylindrical Under-Barrel 64-Rd Helical Magazine Tube */
    return (
      <g>
        <path
          d="M12 29 L48 29 L48 39 L17 50 L12 50 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
          strokeLinejoin="round"
        />
        <polygon points="18,33 42,33 18,44" fill={t.cutout} />
        <rect
          x="48"
          y="26.5"
          width="52"
          height="13.5"
          rx="1.2"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        <rect
          x="100"
          y="28"
          width="36"
          height="9"
          rx="1"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.15"
        />
        <rect x="136" y="30.2" width="18" height="3.6" fill={t.body} />
        <path
          d="M54 40 L64 40 L56 63 L46 61 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        <rect
          x="64"
          y="40"
          width="14"
          height="7.5"
          rx="1.5"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.15"
        />
        {/* 64-Rd Cylindrical Under-Barrel Helical Tube */}
        <rect
          x="84"
          y="39"
          width="60"
          height="12.5"
          rx="5.5"
          fill={t.mag}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        {[96, 108, 120, 132].map((hx) => (
          <line
            key={hx}
            x1={hx}
            y1="39.8"
            x2={hx - 3}
            y2="50.8"
            stroke={t.accent}
            strokeWidth="1.2"
            opacity="0.85"
          />
        ))}
        {renderMuzzleDevice(154, 32, bp.cad.muzzleStyle, t)}
      </g>
    );
  }
  /* PPSh-41 — Wood Stock + Ventilated Barrel Shroud + Iconic 71-Rd Circular Drum */
  return (
    <g>
      <path
        d="M9 36 L52 33 L58 41 L43 48 L12 56 L9 54 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <rect
        x="52"
        y="28.5"
        width="50"
        height="11.5"
        rx="1.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <rect
        x="62"
        y="40"
        width="16"
        height="7.5"
        rx="2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Ventilated Barrel Jacket with Slanted Integral Compensator Cut */}
      <path
        d="M102 28.5 L164 28.5 L158 39 L102 39 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      {[108, 117, 126, 135, 144].map((vx) => (
        <rect
          key={vx}
          x={vx}
          y="31.3"
          width="5.2"
          height="4.4"
          rx="1.2"
          fill={t.cutout}
        />
      ))}
      <rect x="151" y="23.5" width="3.5" height="5" fill={t.stroke} />
      {/* Iconic 71-Rd Circular Drum Magazine */}
      <circle
        cx="95"
        cy="56"
        r="15.5"
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.4"
      />
      <circle
        cx="95"
        cy="56"
        r="9.2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="0.95"
        strokeDasharray="3 2"
      />
      <circle cx="95" cy="56" r="3.2" fill={t.accent} />
    </g>
  );
}

function renderSmgPdw(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isGripMag = bp.cad.magStyle === 'pistol_grip';
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 132 : 144;
  return (
    <g>
      {/* Telescoping Wire or Folding PDW Stock */}
      {isGripMag ? (
        <g>
          <rect
            x="18"
            y="26"
            width="5"
            height="24"
            rx="1.2"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          <line
            x1="23"
            y1="31"
            x2="54"
            y2="31"
            stroke={t.stroke}
            strokeWidth="2.1"
          />
          <line
            x1="23"
            y1="40"
            x2="54"
            y2="40"
            stroke={t.stroke}
            strokeWidth="2.1"
          />
        </g>
      ) : (
        <g>
          <path
            d="M15 27 L52 27 L52 38 L20 49 L15 49 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
            strokeLinejoin="round"
          />
          <polygon points="21,31 46,31 21,43" fill={t.cutout} />
        </g>
      )}
      {/* Compact Monolithic Tactical PDW Upper + Picatinny Rail */}
      <path
        d="M52 25.5 L130 25.5 L130 41 L52 41 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <line
        x1="54"
        y1="24"
        x2="128"
        y2="24"
        stroke={t.accent}
        strokeWidth="1.6"
        strokeDasharray="2.5 1.5"
      />
      {/* Grip + Trigger Guard + Magazine Style */}
      {isGripMag ? (
        <g>
          <path
            d="M66 41 L79 41 L73 66 L60 64 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.25"
          />
          <path
            d="M63 64 L71 65.5 L68 78 L60 76.5 Z"
            fill={t.mag}
            stroke={t.stroke}
            strokeWidth="1.15"
          />
          <rect
            x="79"
            y="41"
            width="14"
            height="8.5"
            rx="1.5"
            fill="none"
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          {/* Folding Front Vertical Grip on MP7 */}
          {bp.id === 'mp7' && (
            <path
              d="M114 41 L122 41 L120 57 L113 56 Z"
              fill={t.subFill}
              stroke={t.stroke}
              strokeWidth="1.1"
            />
          )}
        </g>
      ) : (
        <g>
          <path
            d="M56 41 L67 41 L59 64 L49 62 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          <rect
            x="67"
            y="41"
            width="14"
            height="8"
            rx="1.5"
            fill="none"
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          {renderRifleMag(85, 41, bp.cad.magStyle, bp.magCapacity, t)}
        </g>
      )}
      <rect
        x="130"
        y="30.5"
        width={muzzleX - 130}
        height="4.4"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      {bp.cad.hasOptic && renderOptic(72, 25, 'compact', t)}
      {renderMuzzleDevice(muzzleX, 32.7, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderSniperBolt(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isM200 = bp.id === 'm200';
  const muzzleX =
    bp.cad.muzzleStyle === 'suppressor'
      ? 148
      : bp.cad.muzzleStyle === 'brake'
        ? 158
        : 166;
  return (
    <g>
      {isM200 ? (
        /* Modern CheyTac M200 Intervention Collapsible Rod Chassis */
        <g>
          <rect
            x="10"
            y="29"
            width="5"
            height="23"
            rx="1.2"
            fill={t.stroke}
          />
          <line x1="15" y1="32" x2="48" y2="32" stroke={t.stroke} strokeWidth="2.4" />
          <line x1="15" y1="42" x2="48" y2="42" stroke={t.stroke} strokeWidth="2.4" />
          <rect
            x="48"
            y="29"
            width="70"
            height="13.5"
            rx="1.5"
            fill={t.body}
            stroke={t.stroke}
            strokeWidth="1.35"
          />
          <path
            d="M52 42.5 L62 42.5 L55 63 L46 61 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          {bp.cad.hasCarryHandle && (
            <path
              d="M90 29 L94 21 L114 21 L117 29"
              fill="none"
              stroke={t.stroke}
              strokeWidth="1.9"
            />
          )}
        </g>
      ) : (
        /* Classic Wood Military or Composite Precision Sniper Stock */
        <g>
          <path
            d="M8 34 L44 33 L56 34.5 L126 34 L124 41.5 L58 42.5 L45 48 L12 56 L8 54 Z"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <rect
            x="54"
            y="29.5"
            width="40"
            height="5.8"
            rx="1"
            fill={t.body}
            stroke={t.stroke}
            strokeWidth="1.15"
          />
        </g>
      )}
      {/* Turned-Down Bolt Handle + Spherical Knob */}
      <line
        x1="59"
        y1="33"
        x2="63"
        y2="40"
        stroke={t.stroke}
        strokeWidth="1.8"
      />
      <circle cx="63.5" cy="40.5" r="2.6" fill={t.accent} stroke={t.stroke} strokeWidth="0.9" />
      {/* Trigger Guard + Internal or Detachable Box Mag */}
      <rect
        x="62"
        y="42"
        width="14"
        height="7"
        rx="1.6"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {renderRifleMag(78, 42, bp.cad.magStyle, bp.magCapacity, t)}
      {/* Long Free-Floated Match Fluted Barrel */}
      <rect
        x="118"
        y="31.2"
        width={muzzleX - 118}
        height="3.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      <line
        x1="122"
        y1="32.9"
        x2={muzzleX - 3}
        y2="32.9"
        stroke={t.stroke}
        strokeWidth="0.7"
        opacity="0.7"
      />
      {bp.cad.hasOptic && renderOptic(48, 29.5, 'scope', t)}
      {bp.cad.hasBipod && renderBipod(118, 40.5, 68, t)}
      {renderMuzzleDevice(muzzleX, 33, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderSniperBullpup(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 148 : 158;
  return (
    <g>
      {/* Iconic Walther WA 2000 Twin Upper & Lower Architectural Chassis Rails */}
      <rect
        x="18"
        y="25.5"
        width="112"
        height="4.2"
        rx="0.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="18"
        y="39"
        width="110"
        height="4.5"
        rx="0.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Sculpted Walnut Rear Stock, Grip & Forend Panels */}
      <path
        d="M16 26 L44 26 L44 54 L16 56 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <path
        d="M68 43 L84 43 L78 63 L64 62 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="96"
        y="42.5"
        width="30"
        height="7.5"
        rx="1.2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      <rect
        x="84"
        y="43"
        width="12"
        height="8"
        rx="1.4"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Rear 6-Rd Bullpup Box Magazine */}
      <rect
        x="48"
        y="43.5"
        width="16"
        height="16"
        rx="1"
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Free-Floated Heavy Fluted Match Barrel Centered Between Frame Rails */}
      <rect
        x="44"
        y="32.2"
        width={muzzleX - 44}
        height="4.4"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Signature Top-Suspended WA 2000 Bipod */}
      {bp.cad.hasBipod && renderBipod(124, 29.5, 67, t)}
      {bp.cad.hasOptic && renderOptic(54, 25.5, 'scope', t)}
      {renderMuzzleDevice(muzzleX, 34.4, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderSniperDmr(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isSvd = bp.id === 'svd' || bp.cad.hasWoodFurniture;
  const muzzleX = bp.cad.muzzleStyle === 'suppressor' ? 146 : 159;
  return (
    <g>
      {isSvd ? (
        /* Iconic SVD Dragunov Skeletonized Wood Thumbhole Stock & Cheekpad */
        <g>
          <path
            d="M8 31 L50 31 L50 42 L44 61 L35 60 L37 46 L12 53 L8 52 Z"
            fill={t.furniture}
            stroke={t.stroke}
            strokeWidth="1.3"
            strokeLinejoin="round"
          />
          <polygon points="15,35 38,35 34,43 15,47" fill={t.cutout} />
          <rect x="18" y="28" width="16" height="3.2" rx="1" fill={t.subFill} />
        </g>
      ) : (
        /* Modern Tactical DMR Stock (SR-25 / Mk14 EBR) + Pistol Grip */
        <g>
          <path
            d="M10 28.5 L48 28.5 L48 39.5 L15 51 L10 50 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.25"
            strokeLinejoin="round"
          />
          <rect x="20" y="26" width="16" height="3" rx="0.8" fill={t.accent} />
          <path
            d="M52 41 L62 41 L54 63 L45 61 Z"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
        </g>
      )}
      {/* Long Receiver & Vented/Railed Handguard */}
      <rect
        x="48"
        y="28"
        width="50"
        height="13"
        rx="1.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <rect
        x="98"
        y="29"
        width="36"
        height="10.5"
        rx="1.2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {[104, 112, 120, 128].map((vx) => (
        <rect
          key={vx}
          x={vx}
          y="32.5"
          width="4.8"
          height="2.6"
          rx="0.9"
          fill={t.cutout}
        />
      ))}
      <rect
        x="62"
        y="41"
        width="14"
        height="7.5"
        rx="1.5"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {renderRifleMag(79, 41, bp.cad.magStyle, bp.magCapacity, t)}
      <rect
        x="134"
        y="31.5"
        width={muzzleX - 134}
        height="3.4"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      {bp.cad.hasOptic &&
        renderOptic(50, 28, isSvd ? 'pso' : 'scope', t)}
      {bp.cad.hasBipod && renderBipod(131, 39.5, 67, t)}
      {renderMuzzleDevice(muzzleX, 33.2, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderShotgunPump(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isHeavyBore = bp.id === 'ks23';
  const barrelH = isHeavyBore ? 5.6 : 4.2;
  return (
    <g>
      {/* Shotgun Buttstock & Curved Wrist */}
      <path
        d="M8 37 L48 33 L56 41.5 L42 48 L12 58 L8 56 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Heavy Receiver + Side Ejection Port */}
      <path
        d="M48 28.5 L90 28.5 L90 42.5 L54 42.5 L48 37 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <rect
        x="66"
        y="31"
        width="16"
        height="4.4"
        rx="1"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="0.8"
      />
      <rect
        x="56"
        y="42.5"
        width="15"
        height="7.5"
        rx="2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Heavy Smoothbore/Rifled Barrel + Parallel Tubular Under-Barrel Magazine */}
      <rect
        x="90"
        y="29"
        width="76"
        height={barrelH}
        rx="0.7"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.05"
      />
      <rect
        x="90"
        y={29 + barrelH + 0.8}
        width="62"
        height="4.4"
        rx="0.9"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <circle cx="163.5" cy="27.5" r="1.5" fill={t.accent} />
      {/* Ribbed Sliding Pump Forend */}
      <rect
        x="104"
        y={29 + barrelH - 0.5}
        width="30"
        height="8.6"
        rx="2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      {[109, 114, 119, 124, 129].map((gx) => (
        <line
          key={gx}
          x1={gx}
          y1={29 + barrelH + 0.6}
          x2={gx}
          y2={29 + barrelH + 7}
          stroke={t.stroke}
          strokeWidth="0.85"
          opacity="0.7"
        />
      ))}
    </g>
  );
}

function renderShotgunAuto(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  if (bp.id === 'spas12') {
    /* Franchi SPAS-12 — Iconic Top-Folded Stock + Arm Hook + Perforated Heatshield */
    return (
      <g>
        {/* Top-Folded Steel Buttstock & Curved Arm Hook */}
        <path
          d="M46 29 L46 21 L108 21 L114 27 M100 21 C106 13 118 13 121 20"
          fill="none"
          stroke={t.stroke}
          strokeWidth="2.3"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
        {/* Chunky SPAS-12 Receiver + Raked Grip */}
        <rect
          x="44"
          y="28"
          width="48"
          height="14.5"
          rx="1.5"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        <path
          d="M46 42.5 L57 42.5 L49 65 L39 62.5 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.25"
        />
        <rect
          x="57"
          y="42.5"
          width="15"
          height="7.5"
          rx="1.5"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        {/* Wide Perforated Barrel Heatshield */}
        <rect
          x="92"
          y="27.8"
          width="66"
          height="6.4"
          rx="1"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.15"
        />
        {[98, 106, 114, 122, 130, 138, 146].map((vx) => (
          <circle key={vx} cx={vx} cy="31" r="1.4" fill={t.cutout} />
        ))}
        {/* Tubular Mag & Ribbed Dual-Mode Pump Forend */}
        <rect
          x="92"
          y="34.5"
          width="62"
          height="4.6"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="0.95"
        />
        <rect
          x="104"
          y="34"
          width="32"
          height="9.2"
          rx="1.8"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.25"
        />
        <rect x="158" y="29" width="11" height="4.4" fill={t.body} />
      </g>
    );
  }
  if (bp.cad.magStyle === 'drum') {
    /* AA-12 Full-Auto Clamshell Shotgun + Massive 20-Rd Circular Drum */
    return (
      <g>
        <path
          d="M14 27 L128 27 L128 42 L74 44 L44 46 L14 55 Z"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <rect
          x="42"
          y="22.5"
          width="74"
          height="4.5"
          rx="1"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1"
        />
        <path
          d="M54 44 L65 44 L58 66 L48 64 Z"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        <rect
          x="65"
          y="44"
          width="14"
          height="7.5"
          rx="1.5"
          fill="none"
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        <circle
          cx="95"
          cy="58"
          r="15.5"
          fill={t.mag}
          stroke={t.stroke}
          strokeWidth="1.4"
        />
        <circle cx="95" cy="58" r="5.5" fill={t.subFill} stroke={t.stroke} strokeWidth="0.9" />
        <circle cx="95" cy="58" r="2.2" fill={t.accent} />
        <rect
          x="128"
          y="30.5"
          width="34"
          height="5.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1"
        />
      </g>
    );
  }
  /* Saiga-12 AK-Derived Box-Magazine Semi-Auto Shotgun */
  return (
    <g>
      <path
        d="M10 30 L47 30 L47 40 L15 51 L10 50 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
        strokeLinejoin="round"
      />
      <rect
        x="47"
        y="27"
        width="53"
        height="14.5"
        rx="1.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <rect
        x="100"
        y="28.5"
        width="34"
        height="11.5"
        rx="1.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="134"
        y="30.8"
        width="24"
        height="4.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <path
        d="M52 41.5 L62 41.5 L54 64 L45 62 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <rect
        x="62"
        y="41.5"
        width="15"
        height="7.5"
        rx="1.5"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Wide Chunky 12-Gauge Box Magazine */}
      <path
        d="M80 41.5 L98 41.5 L102 72 L84 74 Z"
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      {renderMuzzleDevice(158, 33.2, bp.cad.muzzleStyle, t)}
    </g>
  );
}

function renderShotgunLever(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Classic Curved Walnut Buttstock (Winchester Model 1887) */}
      <path
        d="M8 38 L52 33 L58 41.5 L42 49 L11 59 L8 56 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Rounded Rolling-Block Receiver + Exposed Spur Hammer */}
      <path
        d="M50 28.5 L88 28.5 L88 43 Q70 46 52 42 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <path
        d="M52 30 L45 24 L48 21.5 L55 28.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Iconic Large Curved Finger-Lever Loop */}
      <path
        d="M53 42.5 L78 42.5 C83 42.5 84 53 76 54 L52 54 C46 54 45 45 53 42.5 Z"
        fill="none"
        stroke={t.stroke}
        strokeWidth="2.2"
      />
      {/* Long 12-Gauge Barrel + Full Under-Barrel Tubular Mag + Wood Side Panels */}
      <rect
        x="88"
        y="29"
        width="79"
        height="4.4"
        rx="0.6"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <rect
        x="88"
        y="34.2"
        width="68"
        height="4"
        rx="0.8"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <rect
        x="92"
        y="33.5"
        width="26"
        height="6"
        rx="1.2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.05"
      />
      <circle cx="164" cy="27.5" r="1.5" fill={t.detail} />
    </g>
  );
}

function renderPistolSlide(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isCompact = bp.id === 'ppk';
  const isOpenTop = bp.id === 'beretta92';
  const hasSuppressor = bp.cad.muzzleStyle === 'suppressor';
  const slideX = isCompact ? 48 : 32;
  const slideW = isCompact ? 82 : hasSuppressor ? 94 : 112;
  const slideEnd = slideX + slideW;

  return (
    <g>
      {/* Forged / Polymer Slide */}
      <rect
        x={slideX}
        y="16"
        width={slideW}
        height={isCompact ? 13.5 : 15.5}
        rx="2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      {/* Beretta 92 Iconic Open-Top Cutout Exposing Rounded Barrel */}
      {isOpenTop ? (
        <path
          d={`M${slideX + 34} 16 L${slideX + 82} 16 L${slideX + 82} 22.5 L${slideX + 34} 22.5 Z`}
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="0.95"
        />
      ) : (
        <rect
          x={slideX + slideW * 0.38}
          y="16.5"
          width="21"
          height="6.2"
          rx="1"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="0.9"
        />
      )}
      {/* Slide Serrations + Sights */}
      {[0, 3.8, 7.6, 11.4, 15.2].map((dx) => (
        <line
          key={dx}
          x1={slideX + 7 + dx}
          y1="18.5"
          x2={slideX + 7 + dx}
          y2={isCompact ? 27.5 : 29}
          stroke={t.stroke}
          strokeWidth="0.9"
          opacity="0.65"
        />
      ))}
      <rect
        x={slideX + 4}
        y={hasSuppressor ? 11.2 : 12.6}
        width="5"
        height={hasSuppressor ? 4.8 : 3.4}
        rx="0.6"
        fill={t.stroke}
      />
      <rect
        x={slideEnd - 7}
        y={hasSuppressor ? 11.2 : 12.6}
        width="4.2"
        height={hasSuppressor ? 4.8 : 3.4}
        rx="0.6"
        fill={t.accent}
      />
      {/* Exposed Spur Hammer (except striker/shrouded Five-seveN) */}
      {bp.id !== 'fiveseven' && (
        <path
          d={`M${slideX} 23 L${slideX - 6.5} 18 L${slideX - 4.5} 15 L${slideX + 2} 20 Z`}
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1"
        />
      )}
      {/* Contoured Frame + Dust Cover + Angled Grip + Trigger Guard */}
      <path
        d={`M${slideX} 31.5 L${slideEnd - 12} 31.5 L${slideEnd - 14} 38.5 L${slideX + 58} 38.5 L${slideX + 56} 52 L${slideX + 36} 52 L${slideX + 24} 76 L${slideX - 3} 74 L${slideX + 8} 41 L${slideX - 4} 34 Z`}
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <rect
        x={slideX + 39}
        y="38.5"
        width="15"
        height="10"
        rx="2"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <path
        d={`M${slideX + 43} 39.5 Q${slideX + 41} 44 ${slideX + 45} 47.5`}
        fill="none"
        stroke={t.accent}
        strokeWidth="1.5"
        strokeLinecap="round"
      />
      {/* Textured Grip Panel & Magazine Floorplate */}
      <path
        d={`M${slideX + 9} 43 L${slideX + 28} 43 L${slideX + 19} 71 L${slideX + 1} 70 Z`}
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      <rect
        x={slideX - 3}
        y="73.5"
        width="27"
        height="3.4"
        rx="1"
        fill={t.stroke}
      />
      {/* Optional Threaded Sound Suppressor (USP .45 Tactical) */}
      {hasSuppressor && (
        <g>
          <rect
            x={slideEnd}
            y="18.2"
            width="42"
            height="10.4"
            rx="2.2"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.25"
          />
          <line
            x1={slideEnd + 11}
            y1="18.5"
            x2={slideEnd + 11}
            y2="28.3"
            stroke={t.stroke}
            strokeWidth="0.85"
            opacity="0.7"
          />
          <line
            x1={slideEnd + 28}
            y1="18.5"
            x2={slideEnd + 28}
            y2="28.3"
            stroke={t.stroke}
            strokeWidth="0.85"
            opacity="0.7"
          />
        </g>
      )}
    </g>
  );
}

function renderPistolBroomhandle(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Iconic Mauser C96 Tapered Cylindrical Barrel + Front Sight */}
      <path
        d="M94 21 L162 22.8 L162 28.8 L94 31 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <polygon points="154,22.5 161,22.8 159,17.2 156,17.8" fill={t.stroke} />
      {/* Square Machined Bolt Receiver + Tangent Rear Sight + Ring Hammer */}
      <rect
        x="48"
        y="19"
        width="48"
        height="16.5"
        rx="1.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <rect
        x="68"
        y="15.2"
        width="16"
        height="3.8"
        rx="0.8"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.95"
      />
      <circle
        cx="43"
        cy="23"
        r="4.2"
        fill="none"
        stroke={t.stroke}
        strokeWidth="2"
      />
      {/* Signature Forward Internal 10-Rd Box Magazine Ahead of Trigger Guard */}
      <path
        d="M72 35.5 L94 35.5 L91 58 L71 55 Z"
        fill={t.mag}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <rect
        x="54"
        y="35.5"
        width="17"
        height="13.5"
        rx="4"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <path
        d="M61 37 Q59 42 63 46"
        fill="none"
        stroke={t.accent}
        strokeWidth="1.5"
      />
      {/* Unmistakable Narrow Grooved Wooden "Broomhandle" Grip & Lanyard Ring */}
      <path
        d="M44 35.5 L56 35.5 L41 72 Q35 76 28 72 L24 67 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {[46, 52, 58, 64].map((gy) => (
        <line
          key={gy}
          x1={47 - (gy - 42) * 0.45}
          y1={gy}
          x2={55 - (gy - 42) * 0.45}
          y2={gy + 2}
          stroke={t.stroke}
          strokeWidth="0.9"
          opacity="0.65"
        />
      ))}
      <circle
        cx="27"
        cy="75"
        r="3.2"
        fill="none"
        stroke={t.detail}
        strokeWidth="1.3"
      />
    </g>
  );
}

function renderRevolverSa(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Colt SAA 1873 Peacemaker — High Spur Single-Action Hammer */}
      <path
        d="M52 24 L40 16 L43 21.5 L49 27"
        fill="none"
        stroke={t.stroke}
        strokeWidth="2.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {/* Solid Top-Strap Frame + Rounded Trigger Guard */}
      <path
        d="M48 22 L97 22 L97 41 L88 42 L86 55 Q81 58 70 55 L64 47 L46 43 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <ellipse
        cx="75"
        cy="48.5"
        rx="8.5"
        ry="5.2"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Fluted 6-Shot Revolver Cylinder */}
      <rect
        x="67"
        y="24"
        width="28"
        height="16.5"
        rx="2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <rect
        x="71"
        y="29.5"
        width="19"
        height="5"
        rx="2.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.85"
      />
      {/* Slender Round Barrel + Under-Barrel Ejector Rod Housing + Quarter-Moon Blade Sight */}
      <rect
        x="97"
        y="21.5"
        width="63"
        height="7.6"
        rx="1.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <rect
        x="97"
        y="29.5"
        width="46"
        height="4.4"
        rx="1.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <path
        d="M150 21.5 Q155 13 159 21.5 Z"
        fill={t.stroke}
      />
      {/* Signature Curved "Plowhandle" Walnut Grip */}
      <path
        d="M46 37 C42 46 33 58 29 73 C37 78 49 77 56 71 C58 58 60 47 64 43 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <circle cx="43" cy="61" r="2.1" fill={t.detail} />
    </g>
  );
}

function renderRevolverDa(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Massive S&W 500 X-Frame Double-Action Magnum Revolver */}
      <path
        d="M48 21 L38 15 L41 20 L46 25"
        fill="none"
        stroke={t.stroke}
        strokeWidth="2.3"
        strokeLinecap="round"
      />
      <path
        d="M44 19 L98 19 L98 42 L88 43 L87 57 L66 57 L62 47 L42 43 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect
        x="67"
        y="44"
        width="16"
        height="9.5"
        rx="3"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Oversized Heavy 5-Shot Magnum Cylinder */}
      <rect
        x="63"
        y="21.5"
        width="33"
        height="20"
        rx="2.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.3"
      />
      <rect
        x="68"
        y="28.2"
        width="23"
        height="6.2"
        rx="3"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      {/* Thick Full-Underlug Bull Barrel */}
      <rect
        x="98"
        y="18.2"
        width="52"
        height="15.5"
        rx="1.2"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <line
        x1="100"
        y1="26.5"
        x2="148"
        y2="26.5"
        stroke={t.stroke}
        strokeWidth="0.95"
        opacity="0.7"
      />
      {/* Integral Ported Muzzle Compensator */}
      {bp.cad.muzzleStyle === 'brake' ? (
        <g>
          <rect
            x="150"
            y="18.2"
            width="19"
            height="13.5"
            rx="1.4"
            fill={t.subFill}
            stroke={t.stroke}
            strokeWidth="1.25"
          />
          {[154, 159.5, 165].map((px) => (
            <rect
              key={px}
              x={px}
              y="20.2"
              width="2.4"
              height="7"
              rx="0.7"
              fill={t.cutout}
            />
          ))}
        </g>
      ) : (
        <rect x="150" y="19" width="10" height="12" fill={t.body} />
      )}
      <polygon points="142,18.2 150,18.2 148,13.5 144,14.2" fill={t.accent} />
      {/* Ergonomic Finger-Groove Rubber Magnum Grip */}
      <path
        d="M44 38 L61 42 L53 76 L31 74 L38 47 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <path
        d="M59 48 Q62 52 57 56 Q60 60 55 64 Q58 68 53 72"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.2"
      />
    </g>
  );
}

function renderBowCompound(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Taut Vertical Bowstring & Crossed Bus Cables */}
      <line x1="56" y1="10" x2="56" y2="76" stroke={t.stroke} strokeWidth="1.2" />
      <line x1="63" y1="13" x2="79" y2="43" stroke={t.subFill} strokeWidth="0.95" />
      <line x1="63" y1="73" x2="79" y2="43" stroke={t.subFill} strokeWidth="0.95" />
      <line
        x1="65"
        y1="14"
        x2="65"
        y2="72"
        stroke={t.subFill}
        strokeWidth="0.8"
        strokeDasharray="2.2 1.6"
      />
      {/* Flexed Top & Bottom Split Carbon Limbs */}
      <path
        d="M61 12.5 C71 15 81 18.5 91 24 L88 27.5 C78 22.5 69 19 60 16 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      <path
        d="M61 73.5 C71 71 81 67.5 91 62 L88 58.5 C78 63.5 69 67 60 70 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Twin Eccentric Elliptical Cams */}
      <ellipse
        cx="61"
        cy="14.5"
        rx="6.2"
        ry="7.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <circle cx="61" cy="14.5" r="2.2" fill={t.accent} />
      <ellipse
        cx="61"
        cy="71.5"
        rx="6.2"
        ry="7.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <circle cx="61" cy="71.5" r="2.2" fill={t.accent} />
      {/* Machined Truss Carbon Riser */}
      <path
        d="M86 24 L95 25 L98 43 L95 61 L86 62 L89 43 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <rect x="89.5" y="30" width="4" height="8" rx="1.5" fill={t.cutout} />
      <rect x="89.5" y="48" width="4" height="8" rx="1.5" fill={t.cutout} />
      {/* Forward Stabilizer Rod + Sight Pin Housing */}
      <rect
        x="96"
        y="50"
        width="32"
        height="3.2"
        rx="1.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      <circle cx="129.5" cy="51.6" r="3" fill={t.accent} />
      {bp.cad.hasOptic && (
        <circle
          cx="104"
          cy="35"
          r="4.2"
          fill="none"
          stroke={t.accent}
          strokeWidth="1.4"
        />
      )}
      {/* Carbon Hunting Arrow + Vanes + Broadhead */}
      <line x1="56" y1="42" x2="148" y2="42" stroke={t.detail} strokeWidth="1.6" />
      <polygon points="146,38.5 156,42 146,45.5" fill={t.stroke} />
      <polygon points="60,42 68,38 72,42 68,46" fill={t.accent} />
    </g>
  );
}

function renderCrossbowRecurve(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Ergonomic Thumbhole Crossbow Stock */}
      <path
        d="M10 34 L62 34 L66 44 L54 61 L42 60 L44 48 L14 55 L10 53 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <polygon points="18,38 46,38 42,46 18,49" fill={t.cutout} />
      {/* Machined Flight Rail & Forend */}
      <rect
        x="62"
        y="34"
        width="76"
        height="7.5"
        rx="1.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <rect
        x="82"
        y="41.5"
        width="34"
        height="6"
        rx="1.5"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      {/* Wide Swept-Back Recurve Prod Limbs (3/4 Side Profile Perspective) */}
      <path
        d="M134 34 C132 22 118 16 102 15 L100 18.5 C114 20 126 25 128 34 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <path
        d="M134 41.5 C132 54 118 61 102 63 L100 59.5 C114 57.5 126 51.5 128 41.5 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      <line
        x1="101"
        y1="17"
        x2="78"
        y2="37.5"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      <line
        x1="101"
        y1="61"
        x2="78"
        y2="37.5"
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Front Foot Stirrup Loop */}
      <path
        d="M138 33 L156 31 C162 31 162 45 156 45 L138 42"
        fill="none"
        stroke={t.stroke}
        strokeWidth="2.1"
      />
      {/* Loaded Carbon Bolt + Broadhead */}
      <line x1="78" y1="36.2" x2="150" y2="36.2" stroke={t.detail} strokeWidth="1.5" />
      <polygon points="148,33.2 157,36.2 148,39.2" fill={t.accent} />
      {bp.cad.hasOptic && renderOptic(58, 33.8, 'compact', t)}
    </g>
  );
}

function renderBowLongbow(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Graceful Medieval English Yew Warbow Stave (Single-Piece Curved D-Section) */}
      <path
        d="M52 7 C84 13 96 27 96 43 C96 59 84 73 52 79 L50 75.5 C78 70 89 58 89 43 C89 28 78 16 50 10.5 Z"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      {/* Horn Nocks & Central Leather Grip Wrap */}
      <circle cx="51" cy="8.5" r="2.2" fill={t.stroke} />
      <circle cx="51" cy="77.5" r="2.2" fill={t.stroke} />
      <rect
        x="88.5"
        y="36.5"
        width="8"
        height="13"
        rx="1.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Taut Vertical Hemp Bowstring */}
      <line x1="51.5" y1="9" x2="51.5" y2="77" stroke={t.stroke} strokeWidth="1.2" />
      {/* Full-Length Medieval War Arrow with Goose Fletching & Bodkin Point */}
      <line x1="51.5" y1="43" x2="146" y2="43" stroke={t.detail} strokeWidth="1.8" />
      <path
        d="M56 43 L62 37.5 L74 38.5 L71 43 L74 47.5 L62 48.5 Z"
        fill={t.stroke}
        opacity="0.9"
      />
      <polygon
        points="144,39.5 157,43 144,46.5"
        fill={t.accent}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
    </g>
  );
}

function renderMbtModern(
  bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  const isMerkava = bp.id === 'merkava4';
  const isT90 = bp.id === 't90m' || bp.cad.magStyle === 'carousel';
  const turretPath = isMerkava
    ? 'M32 30 L82 28.5 L110 35.5 L98 43 L34 43 Z'
    : isT90
      ? 'M44 28.5 L92 28.5 L112 34.5 L108 42 L44 42 Z'
      : 'M38 26.5 L96 26.5 L112 34 L108 42.5 L38 42.5 Z';

  return (
    <g>
      {/* Long 120/125mm Main Cannon + Bore Evacuator + Muzzle Reference Sensor */}
      <rect
        x="105"
        y="32"
        width="68"
        height="3.6"
        rx="0.6"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <rect
        x="128"
        y="30.2"
        width="13.5"
        height="7"
        rx="1.8"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      <rect x="169.5" y="29" width="3" height="3" fill={t.accent} />
      {/* Panoramic CITV Sight Mast & Rear Bustle Basket */}
      <rect
        x="58"
        y="21.5"
        width="7.5"
        height="5.5"
        rx="1"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <rect x="62.5" y="22.8" width="2.4" height="2.8" fill={t.accent} />
      <path
        d="M27 31 L38 31 L38 40 L30 40 Z"
        fill="none"
        stroke={t.stroke}
        strokeWidth="1.1"
        strokeDasharray="2.2 1.4"
      />
      {isMerkava &&
        [30, 34, 38].map((cx) => (
          <circle key={cx} cx={cx} cy="42.6" r="1.35" fill={t.accent} />
        ))}
      {/* Sloped Composite Turret + Cheek ERA Wedge */}
      <path
        d={turretPath}
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <polygon
        points="88,29.5 110,34.8 103,41.2 84,41.2"
        fill={t.furniture}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Low Composite Hull + Glacis Plate + Side Skirts */}
      <path
        d="M14 44 L102 43 L130 51 L126 59 L18 59 L12 52 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <rect
        x="18"
        y="51"
        width="107"
        height="8"
        rx="1"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
      {/* Track Belt & 6 Twin Roadwheels */}
      <path
        d="M20 58 L124 58 Q129 60 128 65 L121 72.5 L26 72.5 L17 65 Q16 59 20 58 Z"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      {[32, 47, 62, 77, 92, 107].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="66.2"
            r="5.1"
            fill={t.body}
            stroke={t.stroke}
            strokeWidth="1.1"
          />
          <circle cx={cx} cy="66.2" r="1.9" fill={t.stroke} />
        </g>
      ))}
      <circle cx="22.5" cy="63" r="3.6" fill={t.subFill} stroke={t.stroke} strokeWidth="1" />
      <circle cx="121.5" cy="62.8" r="3.6" fill={t.subFill} stroke={t.stroke} strokeWidth="1" />
    </g>
  );
}

function renderMbtWwii(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Long Slim 85mm ZiS-S-53 WWII Gun Barrel (No Bore Evacuator) */}
      <rect
        x="102"
        y="31.5"
        width="69"
        height="3.6"
        rx="0.6"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.05"
      />
      {/* Rounded Cast Bulbous T-34-85 Turret & Commander Cupola */}
      <path
        d="M52 24 C66 21 88 22 103 29 L104 41.5 L50 41.5 C46 35 46 27 52 24 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect
        x="62"
        y="19"
        width="13"
        height="4.2"
        rx="1.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      {/* Iconic 60-Deg Sloped Glacis Hull + Sloped Rear Engine Deck + External Fuel Drum */}
      <path
        d="M15 47 L26 42 L106 42 L134 54.5 L128 60 L19 60 L13 53 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
      <rect
        x="24"
        y="43.5"
        width="18"
        height="6.5"
        rx="2.6"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      {/* Rugged Track Loop & 5 Large Christie Roadwheels */}
      <path
        d="M19 56.5 L126 56.5 Q132 59 130 65 L122 73.5 L26 73.5 L16 65 Q15 58 19 56.5 Z"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="1.4"
      />
      {[34, 52, 70, 88, 106].map((cx) => (
        <g key={cx}>
          <circle
            cx={cx}
            cy="66.2"
            r="6.2"
            fill={t.body}
            stroke={t.stroke}
            strokeWidth="1.2"
          />
          <circle cx={cx} cy="66.2" r="2.3" fill={t.stroke} />
        </g>
      ))}
      <circle cx="21.5" cy="62" r="3.8" fill={t.subFill} stroke={t.stroke} strokeWidth="1" />
      <circle cx="122" cy="61.5" r="4" fill={t.subFill} stroke={t.stroke} strokeWidth="1" />
    </g>
  );
}

function renderRotaryCannon(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Linkless Rotary Ammunition Feed Drum (Aft) */}
      <rect
        x="10"
        y="27"
        width="36"
        height="32"
        rx="5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <line
        x1="20"
        y1="27"
        x2="20"
        y2="59"
        stroke={t.accent}
        strokeWidth="1.6"
      />
      <rect
        x="46"
        y="35"
        width="14"
        height="16"
        fill={t.fill}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      {/* Elliptical Forged Rotary Breech Housing + Hydraulic Drive Motor */}
      <rect
        x="58"
        y="29"
        width="34"
        height="26"
        rx="3.5"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
      />
      <rect
        x="63"
        y="22.5"
        width="15"
        height="6.5"
        rx="1.5"
        fill={t.accent}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <path
        d="M62 55 L88 55 L92 63 L58 63 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
      {/* 6-Barrel M61A1 Vulcan Cluster + Intermediate & Muzzle Clamps */}
      {[33, 37, 41, 45, 49].map((by) => (
        <rect
          key={by}
          x="92"
          y={by}
          width="74"
          height="2.1"
          rx="0.5"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="0.65"
        />
      ))}
      <rect
        x="118"
        y="31.5"
        width="4.5"
        height="21"
        rx="1"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <rect
        x="142"
        y="31.5"
        width="4.5"
        height="21"
        rx="1"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1"
      />
      <rect
        x="162"
        y="30.8"
        width="7.5"
        height="22.4"
        rx="1.4"
        fill={t.detail}
        stroke={t.stroke}
        strokeWidth="1.15"
      />
    </g>
  );
}

function renderAaAutocannon(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Elevated 40mm Bofors Barrel + Flared Trumpet Flash Hider + Top 4-Rd Clip Hopper */}
      <g transform="rotate(-17 86 44)">
        <rect
          x="58"
          y="36"
          width="46"
          height="13.5"
          rx="1.8"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        {/* Vertical Top-Fed 4-Round Stripper Clip Loader Hopper */}
        <rect
          x="74"
          y="21"
          width="13"
          height="15"
          rx="1.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        {[24, 27.5, 31].map((ry) => (
          <line
            key={ry}
            x1="76"
            y1={ry}
            x2="85"
            y2={ry}
            stroke={t.detail}
            strokeWidth="1.6"
          />
        ))}
        {/* Recoil Spring Jacket + Tapered 40mm Barrel */}
        <rect
          x="104"
          y="38.5"
          width="22"
          height="8.2"
          rx="1"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.15"
        />
        <path
          d="M126 40 L170 40.8 L170 44.4 L126 45.2 Z"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.1"
        />
        {/* Iconic Flared Trumpet Flash Hider */}
        <polygon
          points="170,40.5 178,37.8 178,47.4 170,44.7"
          fill={t.accent}
          stroke={t.stroke}
          strokeWidth="1"
        />
      </g>
      {/* Angled Gunner Shield + Pedestal Turntable + Cruciform Outrigger Carriage */}
      <path
        d="M84 26 L98 28 L93 66 L79 64 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
        opacity="0.92"
      />
      <path
        d="M54 50 L98 50 L108 72 L46 72 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.35"
        strokeLinejoin="round"
      />
      <circle
        cx="65"
        cy="59"
        r="5.2"
        fill="none"
        stroke={t.accent}
        strokeWidth="1.5"
      />
      <rect
        x="22"
        y="72"
        width="116"
        height="5.5"
        rx="1.5"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.25"
      />
      <rect x="24" y="68" width="6" height="10" rx="1" fill={t.stroke} />
      <rect x="130" y="68" width="6" height="10" rx="1" fill={t.stroke} />
    </g>
  );
}

function renderHowitzer(
  _bp: CentennialWeaponBlueprint,
  t: ResolvedTones
): React.ReactNode {
  return (
    <g>
      {/* Elevated 155mm L/39 Howitzer Tube + Recoil Cylinders + Double-Baffle Artillery Brake */}
      <g transform="rotate(-15 88 48)">
        {/* Breech Ring & Hydropneumatic Recoil Recuperators */}
        <rect
          x="64"
          y="40.5"
          width="38"
          height="13"
          rx="2"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.35"
        />
        <rect
          x="74"
          y="36.5"
          width="32"
          height="4"
          rx="1.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="0.95"
        />
        {/* Long Tapered 155mm Ordnance Barrel */}
        <path
          d="M102 43.2 L166 44.2 L166 49.4 L102 50.6 Z"
          fill={t.body}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        {/* Massive Double-Baffle Artillery Muzzle Brake */}
        <rect
          x="166"
          y="42"
          width="13"
          height="9.6"
          rx="1.2"
          fill={t.subFill}
          stroke={t.stroke}
          strokeWidth="1.2"
        />
        <rect x="169" y="44" width="2.6" height="5.6" fill={t.cutout} />
        <rect x="174" y="44" width="2.6" height="5.6" fill={t.cutout} />
      </g>
      {/* Low-Slung Ultralight Titanium Box-Truss Cradle + Panoramic Sight */}
      <rect
        x="72"
        y="34"
        width="6.5"
        height="8"
        rx="1"
        fill={t.accent}
        stroke={t.stroke}
        strokeWidth="0.9"
      />
      <path
        d="M58 55 L112 55 L122 69 L54 69 Z"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      {/* Long Swept-Back Titanium Split Trail Leg & Grounded Recoil Spade */}
      <path
        d="M60 58 L16 71 L14 77 L26 77 L66 64 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.3"
        strokeLinejoin="round"
      />
      <polygon
        points="11,68 18,68 15,79 9,77"
        fill={t.stroke}
      />
      {/* Forward Stabilizer Outrigger Spade */}
      <path
        d="M106 60 L134 73 L130 77 L102 66 Z"
        fill={t.body}
        stroke={t.stroke}
        strokeWidth="1.2"
      />
      {/* Carriage Road Wheel */}
      <circle
        cx="84"
        cy="67"
        r="9.2"
        fill={t.cutout}
        stroke={t.stroke}
        strokeWidth="2.1"
      />
      <circle
        cx="84"
        cy="67"
        r="4.2"
        fill={t.subFill}
        stroke={t.stroke}
        strokeWidth="1.1"
      />
    </g>
  );
}

// ============================================================================
// Public Entry Point
// ============================================================================

export function renderCentennialWeaponSilhouette(
  bp: CentennialWeaponBlueprint,
  palette: CentennialSilhouettePalette
): React.ReactElement {
  const t = resolveTones(bp.finishPalette, bp.cad, palette);
  let body: React.ReactNode;

  switch (bp.archetype) {
    case 'ak_rifle':
      body = renderAkRifle(bp, t);
      break;
    case 'ar_rifle':
      body = renderArRifle(bp, t);
      break;
    case 'battle_rifle':
      body = renderBattleRifle(bp, t);
      break;
    case 'bullpup_rifle':
      body = renderBullpupRifle(bp, t);
      break;
    case 'lmg_belt':
      body = renderLmgBelt(bp, t);
      break;
    case 'lmg_pan':
      body = renderLmgPan(bp, t);
      break;
    case 'heavy_mg':
      body = renderHeavyMg(bp, t);
      break;
    case 'smg_tube':
      body = renderSmgTube(bp, t);
      break;
    case 'smg_drum':
      body = renderSmgDrum(bp, t);
      break;
    case 'smg_pdw':
      body = renderSmgPdw(bp, t);
      break;
    case 'sniper_bolt':
      body = renderSniperBolt(bp, t);
      break;
    case 'sniper_bullpup':
      body = renderSniperBullpup(bp, t);
      break;
    case 'sniper_dmr':
      body = renderSniperDmr(bp, t);
      break;
    case 'shotgun_pump':
      body = renderShotgunPump(bp, t);
      break;
    case 'shotgun_auto':
      body = renderShotgunAuto(bp, t);
      break;
    case 'shotgun_lever':
      body = renderShotgunLever(bp, t);
      break;
    case 'pistol_slide':
      body = renderPistolSlide(bp, t);
      break;
    case 'pistol_broomhandle':
      body = renderPistolBroomhandle(bp, t);
      break;
    case 'revolver_sa':
      body = renderRevolverSa(bp, t);
      break;
    case 'revolver_da':
      body = renderRevolverDa(bp, t);
      break;
    case 'bow_compound':
      body = renderBowCompound(bp, t);
      break;
    case 'crossbow_recurve':
      body = renderCrossbowRecurve(bp, t);
      break;
    case 'bow_longbow':
      body = renderBowLongbow(bp, t);
      break;
    case 'mbt_modern':
      body = renderMbtModern(bp, t);
      break;
    case 'mbt_wwii':
      body = renderMbtWwii(bp, t);
      break;
    case 'rotary_cannon':
      body = renderRotaryCannon(bp, t);
      break;
    case 'aa_autocannon':
      body = renderAaAutocannon(bp, t);
      break;
    case 'howitzer':
      body = renderHowitzer(bp, t);
      break;
    default: {
      const _exhaustive: never = bp.archetype;
      body = _exhaustive;
    }
  }

  return (
    <svg
      viewBox="0 0 180 86"
      className="weapon-silhouette-svg"
      aria-hidden="true"
    >
      {body}
    </svg>
  );
}

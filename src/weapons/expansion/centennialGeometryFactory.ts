import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createMilStdPicatinnyRail,
  mergeParts,
} from '../../engine/geometry/csgBuilder';
import {
  CENTENNIAL_FINISH_COLORS,
  buildArcheryGeo,
  buildBoltAndCarrierGeo,
  buildChamferedReceiverGeo,
  buildDynamicHelicalSpringGeo,
  buildHandguardGeo,
  buildHeavyArmorHullAndTurretGeo,
  buildMagazineGeo,
  buildOpticAndSightGeo,
  buildRotaryAndArtilleryGeo,
  buildSteppedBarrelGeo,
  buildStockAndGripGeo,
  type ArcheryStyle,
  type BoltCarrierStyle,
  type CentennialFinishColorSet,
  type HandguardStyle,
  type MagazineStyle,
  type OpticSightStyle,
  type StockGripStyle,
} from './centennialCadPrimitives';
import { CENTENNIAL_BLUEPRINT_MAP } from './centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  centennialPartId,
  computeCentennialPartLayout,
  type CentennialPartDims,
  type CentennialPartSlot,
} from './centennialLayoutMath';
import type {
  CentennialWeaponBlueprint,
  CentennialWeaponId,
} from './centennialTypes';

export {
  CENTENNIAL_PART_SLOTS,
  centennialPartId,
  computeCentennialPartLayout,
  type CentennialLayoutResult,
  type CentennialPartDims,
  type CentennialPartSlot,
} from './centennialLayoutMath';

// ============================================================================
// Digital Armory 3D — Centennial 20-Part Procedural CAD Geometry Factory
// ----------------------------------------------------------------------------
// Pure Web-Worker-safe assembly factory (ZERO React / store / catalog imports).
// Projects any `CentennialWeaponBlueprint` across all 28 archetypes into exact
// 20 watertight, chamfered, vertex-colored, curvature-baked (`aCurvature`),
// UV-unwrapped `THREE.BufferGeometry` builders matching `computeCentennialPartLayout`.
// ============================================================================

const FOLLOWER_ORANGE = '#e06224';
const SPRING_STEEL_HEX = '#8f9aa8';

function clampMin(v: number, minVal: number): number {
  return Number.isFinite(v) && v > minVal ? v : minVal;
}

function paintGeo(geo: THREE.BufferGeometry, colorHex: string): void {
  const pos = geo.getAttribute('position');
  if (!pos) return;
  const c = new THREE.Color(colorHex);
  const colors = new Float32Array(pos.count * 3);
  for (let i = 0; i < pos.count; i++) {
    colors[i * 3] = c.r;
    colors[i * 3 + 1] = c.g;
    colors[i * 3 + 2] = c.b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
}

function cylX(
  rRear: number,
  rFront: number,
  len: number,
  bevel: number,
  segs: number,
  colorHex: string
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    clampMin(rRear, 0.05),
    clampMin(rFront, 0.05),
    clampMin(len, 0.1),
    Math.min(bevel, Math.min(rRear, rFront) * 0.35, len * 0.25),
    segs,
    colorHex
  );
  g.rotateZ(-Math.PI / 2);
  return g;
}

function cylZ(
  rA: number,
  rB: number,
  len: number,
  bevel: number,
  segs: number,
  colorHex: string
): THREE.BufferGeometry {
  const g = createBeveledCylinder(
    clampMin(rA, 0.05),
    clampMin(rB, 0.05),
    clampMin(len, 0.1),
    Math.min(bevel, Math.min(rA, rB) * 0.35, len * 0.25),
    segs,
    colorHex
  );
  g.rotateX(Math.PI / 2);
  return g;
}

function ensureUnitNormals(geo: THREE.BufferGeometry): void {
  let norm = geo.getAttribute('normal');
  if (!norm) {
    geo.computeVertexNormals();
    norm = geo.getAttribute('normal');
  }
  if (!norm) return;
  const arr = norm.array as Float32Array;
  for (let i = 0; i < arr.length; i += 3) {
    const nx = arr[i];
    const ny = arr[i + 1];
    const nz = arr[i + 2];
    const len = Math.hypot(nx, ny, nz);
    if (!Number.isFinite(len) || len < 1e-6) {
      arr[i] = 0;
      arr[i + 1] = 1;
      arr[i + 2] = 0;
    } else if (Math.abs(len - 1) > 1e-4) {
      arr[i] = nx / len;
      arr[i + 1] = ny / len;
      arr[i + 2] = nz / len;
    }
  }
  norm.needsUpdate = true;
}

function finalizeParts(
  parts: THREE.BufferGeometry[],
  creaseAngle = Math.PI / 5.2
): THREE.BufferGeometry {
  const merged = mergeParts(parts, creaseAngle);
  for (const p of parts) p.dispose();
  ensureUnitNormals(merged);
  merged.computeBoundingBox();
  merged.computeBoundingSphere();
  return merged;
}

// ============================================================================
// Archetype Style Resolvers
// ============================================================================

function resolveHandguardStyle(bp: CentennialWeaponBlueprint): HandguardStyle {
  if (
    bp.archetype === 'bullpup_rifle' ||
    bp.archetype === 'sniper_bullpup'
  ) {
    return 'polymer_bullpup';
  }
  if (bp.id === 'm16a1') {
    return 'triangular_retro';
  }
  if (bp.cad.hasWoodFurniture) {
    return 'walnut_forend';
  }
  if (
    bp.archetype === 'smg_tube' ||
    bp.archetype === 'smg_drum' ||
    bp.archetype === 'lmg_belt' ||
    bp.archetype === 'lmg_pan' ||
    bp.archetype === 'heavy_mg' ||
    bp.id === 'spas12'
  ) {
    return 'ventilated_tube';
  }
  return 'quad_rail';
}

function resolveStockStyle(bp: CentennialWeaponBlueprint): StockGripStyle {
  if (bp.archetype === 'heavy_mg') return 'spade_grips';
  if (bp.archetype === 'bullpup_rifle' || bp.archetype === 'sniper_bullpup') {
    return 'bullpup_stock';
  }
  if (bp.cad.hasWoodFurniture) return 'walnut_rifle';
  if (
    bp.archetype === 'ar_rifle' ||
    bp.archetype === 'sniper_dmr' ||
    bp.id === 'm24' ||
    bp.id === 'm200'
  ) {
    return 'telescoping_ar';
  }
  if (
    bp.archetype === 'smg_tube' ||
    bp.archetype === 'smg_pdw' ||
    bp.archetype === 'smg_drum' ||
    bp.archetype === 'ak_rifle' ||
    bp.archetype === 'lmg_belt' ||
    bp.archetype === 'shotgun_auto'
  ) {
    return 'folding_skeleton';
  }
  return 'telescoping_ar';
}

function resolveBoltStyle(bp: CentennialWeaponBlueprint): BoltCarrierStyle {
  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    return 'revolver_cylinder';
  }
  if (bp.archetype === 'pistol_slide') {
    return 'slide';
  }
  if (
    bp.kinematicLaw === 'falling_block_pistol' ||
    bp.kinematicLaw === 'lever_action' ||
    bp.kinematicLaw === 'tilting_bolt' ||
    bp.kinematicLaw === 'open_bolt_blowback'
  ) {
    return 'falling_block';
  }
  if (
    bp.kinematicLaw === 'bolt_action' ||
    bp.kinematicLaw === 'pump_action'
  ) {
    return 'straight_pull';
  }
  return 'rotating';
}

function resolveOpticStyle(bp: CentennialWeaponBlueprint): OpticSightStyle {
  if (bp.cad.hasCarryHandle && !bp.cad.hasOptic) {
    return 'carry_handle';
  }
  if (bp.cad.hasOptic) {
    const isEastern =
      bp.originCountryEn.includes('Russia') ||
      bp.originCountryEn.includes('USSR') ||
      bp.originCountryEn.includes('Soviet') ||
      bp.id === 'svd' ||
      bp.id === 'mosin';
    return isEastern ? 'pso1_soviet' : 'tactical_scope';
  }
  return 'folding_tangent';
}

function resolveMagazineStyle(bp: CentennialWeaponBlueprint): MagazineStyle {
  if (bp.id === 'bizon') return 'helical_64';
  switch (bp.cad.magStyle) {
    case 'curved':
      return 'curved_banana';
    case 'drum':
      return 'drum_71';
    case 'pan':
      return 'pan_47';
    case 'belt':
      return 'belt_tray';
    case 'tube':
      return 'tubular';
    case 'top_clip':
      return 'top_clip';
    case 'straight':
    case 'box_internal':
    case 'pistol_grip':
    default:
      return 'straight_box';
  }
}

function resolveArcheryStyle(bp: CentennialWeaponBlueprint): ArcheryStyle {
  if (bp.archetype === 'crossbow_recurve') return 'crossbow_recurve';
  if (bp.archetype === 'bow_longbow') return 'bow_longbow';
  return 'bow_compound';
}

// ============================================================================
// Standalone Sculpted Mechanical Sub-Components
// ============================================================================

function buildStandaloneMuzzleGeo(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const L = clampMin(dims.muzzleLen, 1.0);
  const r = clampMin(dims.barrelMuzzleR, 0.55);
  const style = bp.cad.muzzleStyle;
  const parts: THREE.BufferGeometry[] = [];

  if (style === 'flash_hider') {
    // Tapered Bofors cone if aa_autocannon, else 4-prong birdcage flash suppressor
    if (bp.archetype === 'aa_autocannon') {
      parts.push(cylX(r * 1.15, r * 2.45, L, r * 0.14, 28, pal.barrel));
      const collar = cylX(r * 1.45, r * 1.45, L * 0.24, r * 0.08, 24, pal.accent);
      collar.translate(-L * 0.42, 0, 0);
      parts.push(collar);
    } else {
      const collar = cylX(r * 1.32, r * 1.28, L * 0.36, 0.05, 24, pal.secondary);
      collar.translate(-L * 0.32, 0, 0);
      parts.push(collar);
      for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
        const prong = createChamferedBox(L * 0.72, r * 0.36, r * 0.36, 0.03, pal.barrel);
        prong.translate(L * 0.16, r * 0.96, 0);
        prong.rotateX(a);
        parts.push(prong);
      }
    }
    return finalizeParts(parts);
  }

  if (style === 'brake' || style === 'artillery_brake') {
    const isArt = style === 'artillery_brake';
    const body = createChamferedBox(
      L,
      r * (isArt ? 2.9 : 2.45),
      r * (isArt ? 3.7 : 2.85),
      r * 0.18,
      pal.secondary
    );
    parts.push(body);
    for (const dx of [-0.24, 0.18]) {
      const baffle = createChamferedBox(
        L * 0.2,
        r * (isArt ? 3.3 : 2.75),
        r * (isArt ? 4.1 : 3.1),
        r * 0.12,
        pal.accent
      );
      baffle.translate(L * dx, 0, 0);
      parts.push(baffle);
    }
    const collar = cylX(r * 1.38, r * 1.38, L * 0.22, r * 0.08, 22, pal.barrel);
    collar.translate(-L * 0.48, 0, 0);
    parts.push(collar);
    return finalizeParts(parts);
  }

  if (style === 'suppressor') {
    const canR = r * 1.88;
    parts.push(cylX(canR, canR * 0.98, L, Math.min(0.14, canR * 0.12), 28, pal.secondary));
    const qdCollar = cylX(canR * 1.12, canR * 1.08, L * 0.16, 0.05, 24, pal.accent);
    qdCollar.translate(-L * 0.44, 0, 0);
    parts.push(qdCollar);
    const endCap = cylX(canR * 0.94, canR * 0.84, L * 0.1, 0.04, 24, pal.barrel);
    endCap.translate(L * 0.48, 0, 0);
    parts.push(endCap);
    return finalizeParts(parts);
  }

  if (style === 'shroud') {
    parts.push(cylX(r * 1.56, r * 1.5, L, 0.07, 26, pal.secondary));
    const lip = createChamferedBox(L * 0.28, r * 3.1, r * 2.8, 0.06, pal.accent);
    lip.translate(L * 0.36, 0, 0);
    parts.push(lip);
    return finalizeParts(parts);
  }

  if (style === 'rotary_clamp') {
    const clampR = Math.max(r * 3.8, 6.2);
    parts.push(cylX(clampR, clampR, L, clampR * 0.08, 32, pal.accent));
    const ring = cylX(clampR * 1.12, clampR * 1.12, L * 0.32, clampR * 0.06, 32, pal.secondary);
    parts.push(ring);
    return finalizeParts(parts);
  }

  if (style === 'tank_evacuator') {
    const evacR = r * 1.75;
    parts.push(cylX(evacR * 0.96, evacR, L, evacR * 0.14, 30, pal.primary));
    for (const dx of [-L * 0.46, L * 0.46]) {
      const band = cylX(evacR * 1.04, evacR * 1.04, L * 0.09, evacR * 0.05, 28, pal.accent);
      band.translate(dx, 0, 0);
      parts.push(band);
    }
    return finalizeParts(parts);
  }

  // 'bare': precision-crowned muzzle thread protector & front blade sight collar
  parts.push(cylX(r * 1.18, r * 1.12, L, 0.04, 24, pal.barrel));
  const blade = createChamferedBox(L * 0.65, r * 1.1, r * 0.34, 0.03, pal.accent);
  blade.translate(0, r * 1.35, 0);
  parts.push(blade);
  return finalizeParts(parts);
}

function buildTriggerAssemblyGeo(
  scale: number,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const s = clampMin(scale, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  // Swept curved trigger shoe
  const shoe = createChamferedBox(0.55 * s, 2.2 * s, 0.52 * s, 0.05 * s, pal.bolt);
  shoe.rotateZ(0.28);
  shoe.translate(0, -0.35 * s, 0);
  parts.push(shoe);
  // Protective lower trigger guard bow
  const bowBot = createChamferedBox(3.6 * s, 0.36 * s, 0.92 * s, 0.05 * s, pal.secondary);
  bowBot.translate(0.15 * s, -1.65 * s, 0);
  parts.push(bowBot);
  const bowFront = createChamferedBox(0.42 * s, 1.85 * s, 0.92 * s, 0.05 * s, pal.secondary);
  bowFront.rotateZ(-0.22);
  bowFront.translate(1.8 * s, -0.75 * s, 0);
  parts.push(bowFront);
  const bowRear = createChamferedBox(0.42 * s, 1.75 * s, 0.92 * s, 0.05 * s, pal.secondary);
  bowRear.translate(-1.55 * s, -0.8 * s, 0);
  parts.push(bowRear);
  return finalizeParts(parts);
}

function buildHammerGeo(
  scale: number,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const s = clampMin(scale, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const hub = cylZ(0.58 * s, 0.58 * s, 0.85 * s, 0.05 * s, 18, pal.bolt);
  parts.push(hub);
  const arm = createChamferedBox(0.75 * s, 2.1 * s, 0.68 * s, 0.06 * s, pal.bolt);
  arm.rotateZ(0.32);
  arm.translate(-0.25 * s, 0.95 * s, 0);
  parts.push(arm);
  const spur = createChamferedBox(1.25 * s, 0.48 * s, 0.78 * s, 0.05 * s, pal.accent);
  spur.translate(-0.85 * s, 1.85 * s, 0);
  parts.push(spur);
  return finalizeParts(parts);
}

function buildSelectorLeverGeo(
  scale: number,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const s = clampMin(scale, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const axle = cylZ(0.38 * s, 0.38 * s, 1.3 * s, 0.04 * s, 18, pal.accent);
  parts.push(axle);
  const lever = createChamferedBox(2.2 * s, 0.58 * s, 0.38 * s, 0.05 * s, pal.secondary);
  lever.rotateZ(0.18);
  lever.translate(0.75 * s, 0.14 * s, 0.42 * s);
  parts.push(lever);
  const thumbPad = createChamferedBox(0.68 * s, 0.72 * s, 0.62 * s, 0.06 * s, pal.brass);
  thumbPad.translate(1.65 * s, 0.28 * s, 0.54 * s);
  parts.push(thumbPad);
  return finalizeParts(parts);
}

function buildBipodOrRailGeo(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  if (bp.cad.hasBipod) {
    const legL = Math.max(7.2, dims.receiverH * 2.05);
    const legR = Math.max(0.34, dims.receiverW * 0.11);
    const parts: THREE.BufferGeometry[] = [];
    const saddle = createChamferedBox(2.8, 1.15, dims.handguardW * 0.82, 0.08, pal.secondary);
    parts.push(saddle);
    for (const side of [-1, 1] as const) {
      const leg = createBeveledCylinder(legR, legR * 0.85, legL, 0.05, 16, pal.accent);
      leg.rotateX(side * 0.34);
      leg.rotateZ(-0.22);
      leg.translate(legL * 0.12, -legL * 0.46, side * (dims.handguardW * 0.34 + legL * 0.16));
      parts.push(leg);
      const foot = createChamferedBox(1.1, 0.48, 1.1, 0.06, pal.secondary);
      foot.translate(legL * 0.24, -legL * 0.92, side * (dims.handguardW * 0.34 + legL * 0.32));
      parts.push(foot);
    }
    return finalizeParts(parts);
  }

  // Precision MIL-STD-1913 top/under accessory Picatinny mount rail
  const railL = clampMin(dims.receiverLen * 0.52, 4.5);
  const railW = clampMin(Math.min(2.1, dims.receiverW * 0.72), 1.4);
  const rail = createMilStdPicatinnyRail(railL, -railL * 0.5, 0.45, railW, pal.accent);
  return finalizeParts([rail]);
}

function buildGasSystemGeo(
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const rodL = clampMin(dims.handguardLen * 0.92, 6.5);
  const rodR = clampMin(dims.barrelMuzzleR * 0.46, 0.34);
  const parts: THREE.BufferGeometry[] = [];
  parts.push(cylX(rodR, rodR, rodL, 0.04, 20, pal.bolt));
  const block = createChamferedBox(
    Math.min(2.6, rodL * 0.18),
    rodR * 4.2,
    rodR * 3.4,
    0.06,
    pal.secondary
  );
  block.translate(rodL * 0.44, -rodR * 0.6, 0);
  parts.push(block);
  const pistonHead = cylX(rodR * 1.48, rodR * 1.38, Math.min(2.2, rodL * 0.16), 0.05, 22, pal.accent);
  pistonHead.translate(-rodL * 0.42, 0, 0);
  parts.push(pistonHead);
  return finalizeParts(parts);
}

function buildFollowerGeo(
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet,
  isTubeOrPan: boolean
): THREE.BufferGeometry {
  if (isTubeOrPan) {
    const r = clampMin(Math.min(dims.magT, dims.magW) * 0.38, 0.65);
    return finalizeParts([cylX(r, r * 0.92, r * 2.2, 0.05, 20, FOLLOWER_ORANGE)]);
  }
  const w = clampMin(dims.magW * 0.84, 2.2);
  const t = clampMin(dims.magT * 0.76, 1.2);
  const parts = [
    createChamferedBox(w, 0.82, t, 0.06, FOLLOWER_ORANGE),
    createChamferedBox(w * 0.68, 0.42, t * 0.42, 0.04, pal.brass),
  ];
  parts[1].translate(0, 0.48, 0);
  return finalizeParts(parts);
}

function buildMagBaseGeo(
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet,
  isCircular: boolean
): THREE.BufferGeometry {
  if (isCircular) {
    const r = clampMin(Math.min(dims.magW, dims.magH) * 0.44, 0.95);
    return finalizeParts([cylX(r, r * 0.95, Math.max(0.85, dims.magT * 0.35), 0.06, 24, pal.secondary)]);
  }
  const w = clampMin(dims.magW * 1.12, 2.8);
  const t = clampMin(dims.magT * 1.14, 1.6);
  const h = clampMin(Math.min(1.15, dims.magH * 0.12), 0.65);
  return finalizeParts([createChamferedBox(w, h, t, 0.07, pal.secondary)]);
}

// ============================================================================
// Specialized Family 20-Part Factories
// ============================================================================

function buildMbtGeometryBuilders(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): Record<CentennialPartSlot, () => THREE.BufferGeometry> {
  const style = bp.archetype === 'mbt_wwii' ? 'mbt_wwii' : 'mbt_modern';
  const s = dims.armorScale;

  return {
    receiver: () =>
      buildHeavyArmorHullAndTurretGeo('hull', s, pal.primary, style),
    barrel: () =>
      buildSteppedBarrelGeo(
        dims.barrelLen,
        dims.barrelBreechR,
        dims.barrelMuzzleR,
        pal.barrel,
        { muzzleStyle: 'bare', accentColorHex: pal.accent }
      ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      buildHeavyArmorHullAndTurretGeo('turret', s, pal.primary, style),
    bolt: () =>
      buildRotaryAndArtilleryGeo('breech_block', dims.boltLen, pal.bolt),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.18,
        12,
        SPRING_STEEL_HEX,
        'x'
      ),
    handguard: () =>
      finalizeParts([
        createChamferedBox(
          dims.handguardLen,
          dims.handguardH,
          dims.handguardW,
          s * 0.06,
          pal.secondary
        ),
      ]),
    stock: () => {
      const parts: THREE.BufferGeometry[] = [
        createChamferedBox(
          dims.stockLen,
          dims.stockH,
          dims.stockW,
          s * 0.05,
          pal.secondary
        ),
      ];
      for (const side of [-1, 1] as const) {
        const drum = cylZ(s * 0.24, s * 0.24, s * 0.72, s * 0.03, 20, pal.accent);
        drum.translate(-dims.stockLen * 0.35, s * 0.18, side * s * 0.82);
        parts.push(drum);
      }
      return finalizeParts(parts);
    },
    grip: () =>
      buildHeavyArmorHullAndTurretGeo('engine_block', s, pal.secondary, style),
    optic: () => {
      const parts: THREE.BufferGeometry[] = [
        createBeveledCylinder(s * 0.24, s * 0.28, s * 0.48, s * 0.04, 22, pal.optic),
        createChamferedBox(s * 0.36, s * 0.24, s * 0.32, s * 0.03, pal.accent),
      ];
      parts[1].translate(s * 0.14, s * 0.16, 0);
      return finalizeParts(parts);
    },
    gas_system: () =>
      buildHeavyArmorHullAndTurretGeo('suspension_tracks', s, pal.secondary, style),
    mount_rail: () =>
      buildHeavyArmorHullAndTurretGeo('era_skirts', s, pal.accent, style),
    trigger: () => buildTriggerAssemblyGeo(s * 0.16, pal),
    hammer: () => buildHammerGeo(s * 0.18, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(
        s * 0.62,
        s * 0.11,
        s * 0.022,
        9,
        SPRING_STEEL_HEX,
        'y'
      ),
    selector: () => buildSelectorLeverGeo(s * 0.16, pal),
    mag_body: () =>
      buildHeavyArmorHullAndTurretGeo('autoloader', s, pal.secondary, style),
    follower: () => {
      const parts = [
        createChamferedBox(s * 1.15, s * 0.18, s * 0.42, s * 0.03, FOLLOWER_ORANGE),
        cylX(s * 0.075, s * 0.06, s * 0.92, s * 0.015, 16, pal.brass),
      ];
      parts[1].translate(0, s * 0.15, 0);
      return finalizeParts(parts);
    },
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(
        s * 0.48,
        s * 0.16,
        s * 0.028,
        7,
        SPRING_STEEL_HEX,
        'y'
      ),
    mag_base: () =>
      finalizeParts([
        createBeveledCylinder(s * 0.98, s * 1.02, s * 0.14, s * 0.03, 30, pal.secondary),
      ]),
  };
}

function buildOrdnanceGeometryBuilders(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): Record<CentennialPartSlot, () => THREE.BufferGeometry> {
  const isVulcan = bp.archetype === 'rotary_cannon';
  const isBofors = bp.archetype === 'aa_autocannon';
  const unitScale = isVulcan ? 3.0 : isBofors ? 4.2 : 5.5;

  return {
    receiver: () =>
      buildChamferedReceiverGeo(
        dims.receiverLen,
        dims.receiverH,
        dims.receiverW,
        pal.primary,
        {
          roundedTop: isVulcan,
          topRail: false,
          magwellCollar: false,
          ejectionPort: true,
          accentColorHex: pal.accent,
        }
      ),
    barrel: () =>
      isVulcan
        ? buildRotaryAndArtilleryGeo('vulcan_barrels', dims.barrelLen, pal.barrel)
        : buildSteppedBarrelGeo(
            dims.barrelLen,
            dims.barrelBreechR,
            dims.barrelMuzzleR,
            pal.barrel,
            { muzzleStyle: 'bare', accentColorHex: pal.accent }
          ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      buildBoltAndCarrierGeo(
        dims.boltLen,
        dims.boltR,
        pal.bolt,
        isVulcan ? 'rotating' : 'falling_block'
      ),
    bolt: () =>
      buildRotaryAndArtilleryGeo('breech_block', dims.boltLen, pal.bolt),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.18,
        12,
        SPRING_STEEL_HEX,
        'x'
      ),
    handguard: () =>
      buildHandguardGeo(
        dims.handguardLen,
        dims.handguardH,
        dims.handguardW,
        pal.secondary,
        'ventilated_tube'
      ),
    stock: () =>
      buildStockAndGripGeo(
        dims.stockLen,
        dims.stockH,
        dims.stockW,
        pal.secondary,
        'spade_grips'
      ),
    grip: () => {
      const wheel = new THREE.TorusGeometry(dims.gripH * 0.42, dims.gripH * 0.08, 12, 24);
      paintGeo(wheel, pal.brass);
      const hub = cylZ(dims.gripH * 0.12, dims.gripH * 0.12, dims.gripW * 0.5, 0.2, 16, pal.accent);
      return finalizeParts([wheel, hub]);
    },
    optic: () =>
      buildOpticAndSightGeo(
        isVulcan ? 'folding_tangent' : 'tactical_scope',
        dims.opticLen,
        pal.optic
      ),
    gas_system: () =>
      finalizeParts([
        cylX(dims.receiverH * 0.26, dims.receiverH * 0.24, dims.receiverLen * 0.62, 0.35, 24, pal.accent),
      ]),
    mount_rail: () =>
      isVulcan
        ? finalizeParts([
            createChamferedBox(dims.receiverLen * 0.85, 6.2, dims.receiverW * 0.92, 0.45, pal.secondary),
          ])
        : buildRotaryAndArtilleryGeo(
            isBofors ? 'bofors_carriage' : 'm777_carriage',
            dims.specialSpan,
            pal.primary
          ),
    trigger: () => buildTriggerAssemblyGeo(unitScale, pal),
    hammer: () => buildHammerGeo(unitScale, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen * 0.45,
        dims.springR * 0.55,
        dims.springR * 0.12,
        8,
        SPRING_STEEL_HEX,
        'y'
      ),
    selector: () => buildSelectorLeverGeo(unitScale, pal),
    mag_body: () =>
      buildMagazineGeo(
        isVulcan ? 'drum_71' : isBofors ? 'top_clip' : 'belt_tray',
        dims.magH,
        dims.magW,
        dims.magT,
        pal.secondary
      ),
    follower: () => buildFollowerGeo(dims, pal, true),
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.magH * 0.62,
        Math.max(1.8, dims.springR * 0.55),
        Math.max(0.32, dims.springR * 0.12),
        8,
        SPRING_STEEL_HEX,
        isVulcan ? 'x' : 'y'
      ),
    mag_base: () => buildMagBaseGeo(dims, pal, isVulcan),
  };
}

function buildArcheryGeometryBuilders(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): Record<CentennialPartSlot, () => THREE.BufferGeometry> {
  const style = resolveArcheryStyle(bp);
  const isCrossbow = style === 'crossbow_recurve';
  const isLongbow = style === 'bow_longbow';
  const span = dims.specialSpan;

  return {
    receiver: () =>
      buildArcheryGeo(
        'riser',
        isCrossbow ? dims.receiverLen : dims.receiverLen,
        isLongbow ? pal.furniture : pal.primary,
        style
      ),
    // Real GPU `SPRING_AXIS_MODE_FLEX` flexing limbs!
    barrel: () =>
      buildArcheryGeo(
        'limbs',
        span,
        isLongbow ? pal.primary : pal.secondary,
        style
      ),
    muzzle: () =>
      isLongbow
        ? finalizeParts([
            createBeveledCylinder(0.85, 1.35, 3.6, 0.12, 18, pal.accent),
          ])
        : buildArcheryGeo('cams', span, pal.accent, style),
    // Real GPU `SPRING_AXIS_MODE_FLEX` flexing bowstring!
    bolt_carrier: () =>
      buildArcheryGeo('bowstring', span * 0.92, pal.brass, style),
    bolt: () =>
      buildArcheryGeo('projectile', dims.boltLen, pal.barrel, style),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.2,
        9,
        SPRING_STEEL_HEX,
        'x'
      ),
    handguard: () =>
      finalizeParts([
        createChamferedBox(
          dims.handguardLen,
          dims.handguardH,
          dims.handguardW,
          0.14,
          pal.secondary
        ),
      ]),
    stock: () =>
      isCrossbow
        ? buildStockAndGripGeo(
            dims.stockLen,
            dims.stockH,
            dims.stockW,
            pal.secondary,
            'telescoping_ar'
          )
        : finalizeParts([
            cylX(0.62, 0.56, dims.stockLen, 0.06, 18, pal.secondary),
          ]),
    grip: () =>
      buildStockAndGripGeo(
        dims.gripLen,
        dims.gripH,
        dims.gripW,
        pal.furniture,
        'pistol_grip'
      ),
    optic: () =>
      buildOpticAndSightGeo(
        isCrossbow ? 'tactical_scope' : 'folding_tangent',
        dims.opticLen,
        pal.optic
      ),
    gas_system: () =>
      finalizeParts([
        cylX(0.38, 0.38, Math.max(8, dims.handguardLen * 0.65), 0.04, 16, pal.accent),
      ]),
    mount_rail: () =>
      finalizeParts([
        cylX(0.75, 0.62, isCrossbow ? 8.5 : 18, 0.08, 20, pal.secondary),
      ]),
    trigger: () => buildTriggerAssemblyGeo(0.95, pal),
    hammer: () => buildHammerGeo(0.9, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen * 0.65,
        dims.springR * 0.85,
        dims.springR * 0.18,
        7,
        SPRING_STEEL_HEX,
        'y'
      ),
    selector: () =>
      style === 'bow_compound'
        ? buildArcheryGeo('cams', span, pal.accent, style)
        : buildSelectorLeverGeo(0.95, pal),
    mag_body: () =>
      buildMagazineGeo('straight_box', dims.magH, dims.magW, dims.magT, pal.secondary),
    follower: () => buildFollowerGeo(dims, pal, false),
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.magH * 0.42,
        dims.springR * 0.9,
        dims.springR * 0.18,
        7,
        SPRING_STEEL_HEX,
        'y'
      ),
    mag_base: () => buildMagBaseGeo(dims, pal, false),
  };
}

function buildPistolRevolverGeometryBuilders(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): Record<CentennialPartSlot, () => THREE.BufferGeometry> {
  const isRevolver =
    bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da';
  const isBroom = bp.archetype === 'pistol_broomhandle';

  const gripStyle: StockGripStyle = isBroom
    ? 'broomhandle_grip'
    : bp.archetype === 'revolver_sa'
      ? 'plowhandle_grip'
      : 'pistol_grip';

  return {
    receiver: () =>
      buildChamferedReceiverGeo(
        dims.receiverLen,
        dims.receiverH,
        dims.receiverW,
        pal.primary,
        {
          topRail: false,
          roundedTop: isRevolver,
          magwellCollar: isBroom,
          ejectionPort: isBroom,
          accentColorHex: pal.accent,
        }
      ),
    barrel: () =>
      buildSteppedBarrelGeo(
        dims.barrelLen,
        dims.barrelBreechR,
        dims.barrelMuzzleR,
        pal.barrel,
        {
          muzzleStyle: 'bare',
          frontSightTower: isRevolver,
          accentColorHex: pal.accent,
        }
      ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      isRevolver
        ? finalizeParts([
            cylX(0.45, 0.45, dims.barrelLen * 0.72, 0.04, 18, pal.accent),
          ])
        : buildBoltAndCarrierGeo(
            dims.boltLen,
            dims.boltR,
            pal.primary,
            isBroom ? 'falling_block' : 'slide'
          ),
    bolt: () =>
      buildBoltAndCarrierGeo(
        isRevolver ? dims.boltLen : dims.boltLen * 0.42,
        isRevolver ? dims.boltR : dims.boltR * 0.72,
        pal.bolt,
        isRevolver ? 'revolver_cylinder' : 'falling_block'
      ),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.22,
        11,
        SPRING_STEEL_HEX,
        isRevolver ? 'y' : 'x'
      ),
    handguard: () =>
      finalizeParts([
        createChamferedBox(
          dims.handguardLen,
          dims.handguardH,
          dims.handguardW,
          0.09,
          pal.secondary
        ),
      ]),
    stock: () =>
      finalizeParts([
        createChamferedBox(
          dims.stockLen,
          dims.stockH,
          dims.stockW,
          0.12,
          isBroom ? pal.furniture : pal.secondary
        ),
      ]),
    grip: () =>
      buildStockAndGripGeo(
        dims.gripLen,
        dims.gripH,
        dims.gripW,
        pal.furniture,
        gripStyle
      ),
    optic: () =>
      buildOpticAndSightGeo(
        bp.cad.hasOptic ? 'tactical_scope' : 'folding_tangent',
        dims.opticLen,
        pal.optic
      ),
    gas_system: () =>
      finalizeParts([
        cylX(0.32, 0.32, dims.springLen * 0.96, 0.04, 16, pal.bolt),
      ]),
    mount_rail: () => buildBipodOrRailGeo(bp, dims, pal),
    trigger: () => buildTriggerAssemblyGeo(0.82, pal),
    hammer: () => buildHammerGeo(0.86, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(
        Math.max(4.4, dims.gripH * 0.48),
        0.38,
        0.09,
        9,
        SPRING_STEEL_HEX,
        'y'
      ),
    selector: () => buildSelectorLeverGeo(0.78, pal),
    mag_body: () =>
      isRevolver
        ? buildMagazineGeo('drum_71', 3.4, 3.4, 2.2, pal.brass)
        : buildMagazineGeo(
            'straight_box',
            dims.magH,
            dims.magW,
            dims.magT,
            pal.secondary
          ),
    follower: () => buildFollowerGeo(dims, pal, isRevolver),
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(
        Math.max(3.6, dims.magH * 0.65),
        0.44,
        0.09,
        9,
        SPRING_STEEL_HEX,
        'y'
      ),
    mag_base: () => buildMagBaseGeo(dims, pal, isRevolver),
  };
}

function buildLongArmGeometryBuilders(
  bp: CentennialWeaponBlueprint,
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet
): Record<CentennialPartSlot, () => THREE.BufferGeometry> {
  const hgStyle = resolveHandguardStyle(bp);
  const stockStyle = resolveStockStyle(bp);
  const boltStyle = resolveBoltStyle(bp);
  const opticStyle = resolveOpticStyle(bp);
  const magStyle = resolveMagazineStyle(bp);
  const isTubeOrHelical = magStyle === 'tubular' || magStyle === 'helical_64';
  const isCircularMag =
    magStyle === 'drum_71' || magStyle === 'pan_47' || isTubeOrHelical;

  return {
    receiver: () =>
      buildChamferedReceiverGeo(
        dims.receiverLen,
        dims.receiverH,
        dims.receiverW,
        pal.primary,
        {
          topRail: bp.cad.hasOptic || bp.archetype === 'ar_rifle',
          roundedTop:
            bp.archetype === 'smg_tube' ||
            bp.archetype === 'sniper_bolt' ||
            bp.archetype === 'shotgun_pump',
          magwellCollar:
            magStyle === 'curved_banana' || magStyle === 'straight_box',
          ejectionPort: true,
          accentColorHex: pal.accent,
        }
      ),
    barrel: () =>
      buildSteppedBarrelGeo(
        dims.barrelLen,
        dims.barrelBreechR,
        dims.barrelMuzzleR,
        pal.barrel,
        {
          flutes:
            bp.archetype === 'sniper_bolt' ||
            bp.archetype === 'sniper_dmr' ||
            bp.archetype === 'sniper_bullpup',
          coolingFins:
            bp.archetype === 'lmg_belt' ||
            bp.archetype === 'lmg_pan' ||
            bp.archetype === 'heavy_mg',
          gasBlock:
            bp.mechanismFilter === 'gas_piston' ||
            bp.mechanismFilter === 'direct_impingement',
          frontSightTower:
            bp.archetype === 'ak_rifle' ||
            bp.archetype === 'ar_rifle' ||
            bp.archetype === 'battle_rifle',
          muzzleStyle: 'bare',
          accentColorHex: pal.accent,
        }
      ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      buildBoltAndCarrierGeo(dims.boltLen, dims.boltR, pal.bolt, boltStyle),
    bolt: () =>
      buildBoltAndCarrierGeo(
        dims.boltLen * 0.56,
        dims.boltR * 0.82,
        pal.accent,
        boltStyle === 'falling_block' ? 'falling_block' : 'rotating'
      ),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.2,
        12,
        SPRING_STEEL_HEX,
        'x'
      ),
    handguard: () =>
      buildHandguardGeo(
        dims.handguardLen,
        dims.handguardH,
        dims.handguardW,
        hgStyle === 'walnut_forend' ? pal.furniture : pal.secondary,
        hgStyle
      ),
    stock: () =>
      buildStockAndGripGeo(
        dims.stockLen,
        dims.stockH,
        dims.stockW,
        stockStyle === 'walnut_rifle' ? pal.furniture : pal.secondary,
        stockStyle
      ),
    grip: () =>
      bp.archetype === 'shotgun_pump'
        ? buildHandguardGeo(
            Math.max(8, dims.handguardLen * 0.52),
            dims.handguardH * 0.92,
            dims.handguardW * 1.08,
            bp.cad.hasWoodFurniture ? pal.furniture : pal.secondary,
            bp.cad.hasWoodFurniture ? 'walnut_forend' : 'ventilated_tube'
          )
        : buildStockAndGripGeo(
            dims.gripLen,
            dims.gripH,
            dims.gripW,
            bp.cad.hasWoodFurniture ? pal.furniture : pal.secondary,
            'pistol_grip'
          ),
    optic: () => buildOpticAndSightGeo(opticStyle, dims.opticLen, pal.optic),
    gas_system: () => buildGasSystemGeo(dims, pal),
    mount_rail: () => buildBipodOrRailGeo(bp, dims, pal),
    trigger: () => buildTriggerAssemblyGeo(1.0, pal),
    hammer: () => buildHammerGeo(1.0, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(
        Math.max(3.4, dims.receiverH * 0.72),
        Math.max(0.34, dims.springR * 0.78),
        Math.max(0.08, dims.springR * 0.17),
        8,
        SPRING_STEEL_HEX,
        'y'
      ),
    selector: () => buildSelectorLeverGeo(0.95, pal),
    mag_body: () =>
      buildMagazineGeo(
        magStyle,
        dims.magH,
        dims.magW,
        dims.magT,
        bp.finishPalette === 'bakelite_ak' && magStyle === 'curved_banana'
          ? pal.furniture
          : pal.secondary
      ),
    follower: () => buildFollowerGeo(dims, pal, isCircularMag),
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(
        Math.max(3.6, dims.magH * 0.62),
        Math.max(0.42, Math.min(dims.magT, dims.magW) * 0.24),
        0.09,
        10,
        SPRING_STEEL_HEX,
        isTubeOrHelical ? 'x' : 'y'
      ),
    mag_base: () => buildMagBaseGeo(dims, pal, isCircularMag),
  };
}

/**
 * Generates exact 20 watertight procedural CAD geometry builders keyed by
 * `${bp.id}_${slot}` for any of the 66 Centennial blueprints across all 28
 * architectural archetypes.
 */
export function buildCentennialGeometryBuildersForBlueprint(
  bp: CentennialWeaponBlueprint
): Record<string, () => THREE.BufferGeometry> {
  const layout = computeCentennialPartLayout(bp);
  const pal =
    CENTENNIAL_FINISH_COLORS[bp.finishPalette] ??
    CENTENNIAL_FINISH_COLORS.parkerized;

  let slotBuilders: Record<CentennialPartSlot, () => THREE.BufferGeometry>;

  if (bp.archetype === 'mbt_modern' || bp.archetype === 'mbt_wwii') {
    slotBuilders = buildMbtGeometryBuilders(bp, layout.dims, pal);
  } else if (
    bp.archetype === 'rotary_cannon' ||
    bp.archetype === 'aa_autocannon' ||
    bp.archetype === 'howitzer'
  ) {
    slotBuilders = buildOrdnanceGeometryBuilders(bp, layout.dims, pal);
  } else if (
    bp.archetype === 'bow_compound' ||
    bp.archetype === 'crossbow_recurve' ||
    bp.archetype === 'bow_longbow'
  ) {
    slotBuilders = buildArcheryGeometryBuilders(bp, layout.dims, pal);
  } else if (
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle' ||
    bp.archetype === 'revolver_sa' ||
    bp.archetype === 'revolver_da'
  ) {
    slotBuilders = buildPistolRevolverGeometryBuilders(bp, layout.dims, pal);
  } else {
    slotBuilders = buildLongArmGeometryBuilders(bp, layout.dims, pal);
  }

  const builders: Record<string, () => THREE.BufferGeometry> = {};
  for (const slot of CENTENNIAL_PART_SLOTS) {
    builders[centennialPartId(bp.id, slot)] = slotBuilders[slot];
  }
  return builders;
}

/**
 * Lazily invoked by `src/weapons/geometryLoaders.ts` inside the Geometry Web
 * Worker to resolve exact 20 procedural CAD builders for any of the 66
 * Centennial Expansion exhibits (`BAY-35 .. BAY-100`).
 */
export function buildCentennialGeometryBuilders(
  id: CentennialWeaponId
): Record<string, () => THREE.BufferGeometry> {
  const bp = CENTENNIAL_BLUEPRINT_MAP[id];
  if (!bp) {
    throw new Error(`Unknown Centennial exhibit id: ${String(id)}`);
  }
  return buildCentennialGeometryBuildersForBlueprint(bp);
}

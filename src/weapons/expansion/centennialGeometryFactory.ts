import * as THREE from 'three';
import {
  createBeveledCylinder,
  createChamferedBox,
  createMilStdPicatinnyRail,
  mergeParts,
} from '../../engine/geometry/csgBuilder';
import {
  CENTENNIAL_FINISH_COLORS,
  applyMetricBoxUVs,
  buildArcheryGeo,
  buildBoltAndCarrierGeo,
  buildChamferedReceiverGeo,
  buildChamferedSlab,
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
  type HeavyArmorVariant,
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
  // Ventilated perforated steel barrel shrouds / cooling jackets MUST take priority
  // over `hasWoodFurniture` so PPSh-41, DP-28, and M2HB keep steel shrouds w/ wood stocks!
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
  if (bp.cad.hasWoodFurniture) {
    return 'walnut_forend';
  }
  // Constitutional Rule 10.2: ZERO Picatinny 1913 quad rails on pre-1990 historical weapons!
  if (bp.year < 1990) {
    return 'ribbed_historical';
  }
  return 'quad_rail';
}

function resolveStockStyle(bp: CentennialWeaponBlueprint): StockGripStyle {
  if (bp.id === 'ppsh41') return 'ppsh_one_piece';
  if (bp.id === 'm16a1') return 'm16a1_fixed';
  if (bp.id === 'svd') return 'dragunov_thumbhole';
  if (bp.id === 'spas12') return 'spas12_top_fold';
  if (bp.archetype === 'shotgun_lever') return 'straight_walnut';
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
  if (bp.archetype === 'heavy_mg') {
    // M2HB uses a low folding AA leaf iron sight, never a rifle carry handle!
    return 'folding_tangent';
  }
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
    if (bp.id === 'ppsh41') {
      // Iconic 1941 PPSh-41 slanted-cut stamped barrel shroud integral compensator + hooded front sight!
      const shroud = cylX(r * 1.62, r * 1.56, L * 0.86, 0.08, 26, pal.secondary);
      shroud.translate(-L * 0.08, 0, 0);
      parts.push(shroud);
      // Signature forward-angled slanted baffle plate extending ahead of muzzle
      const slantPlate = createChamferedBox(L * 0.24, r * 3.25, r * 2.6, 0.06, pal.accent);
      slantPlate.rotateZ(-0.42);
      slantPlate.translate(L * 0.36, -r * 0.14, 0);
      parts.push(slantPlate);
      // Hooded Soviet front sight ring perched atop the shroud nose
      const sightBase = createChamferedBox(L * 0.28, r * 0.72, r * 0.95, 0.04, pal.secondary);
      sightBase.translate(0, r * 1.78, 0);
      parts.push(sightBase);
      const hood = new THREE.TorusGeometry(r * 0.76, r * 0.18, 10, 20);
      paintGeo(hood, pal.accent);
      hood.rotateY(Math.PI / 2);
      hood.translate(0, r * 2.55, 0);
      parts.push(hood);
      return finalizeParts(parts);
    }
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

  // 'bare': precision-crowned muzzle thread protector / AK slant brake / revolver crescent front blade
  if (bp.id === 'ak47') {
    // Classic AK slant-cut muzzle compensator
    const sleeve = cylX(r * 1.26, r * 1.22, L * 1.15, 0.05, 24, pal.barrel);
    parts.push(sleeve);
    const slantLip = createChamferedBox(L * 0.55, r * 1.05, r * 1.9, 0.04, pal.secondary);
    slantLip.rotateZ(-0.46);
    slantLip.translate(L * 0.44, -r * 0.56, 0);
    parts.push(slantLip);
    return finalizeParts(parts);
  }
  parts.push(cylX(r * 1.18, r * 1.12, L, 0.04, 24, pal.barrel));
  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    // Classic Colt SAA 1873 / revolver low swept half-moon crescent blued-steel front blade sight
    const bladeBase = createChamferedBox(L * 1.35, r * 0.55, r * 0.24, 0.03, pal.barrel);
    bladeBase.translate(-L * 0.25, r * 1.12, 0);
    parts.push(bladeBase);
    const crescent = createChamferedBox(L * 0.82, r * 0.72, r * 0.2, 0.03, pal.secondary);
    crescent.rotateZ(0.32);
    crescent.translate(-L * 0.08, r * 1.48, 0);
    parts.push(crescent);
    return finalizeParts(parts);
  }
  const blade = createChamferedBox(L * 0.65, r * 0.95, r * 0.3, 0.03, pal.secondary);
  blade.translate(0, r * 1.25, 0);
  parts.push(blade);
  return finalizeParts(parts);
}

function buildTriggerAssemblyGeo(
  scale: number,
  pal: CentennialFinishColorSet
): THREE.BufferGeometry {
  const s = clampMin(scale, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  // Ergonomic curved crescent trigger shoe (2-segment swept finger arc!)
  const upperShoe = createChamferedBox(0.46 * s, 1.18 * s, 0.48 * s, 0.05 * s, pal.bolt);
  upperShoe.rotateZ(0.18);
  upperShoe.translate(0.12 * s, -0.02 * s, 0);
  parts.push(upperShoe);
  const lowerShoe = createChamferedBox(0.44 * s, 1.12 * s, 0.48 * s, 0.05 * s, pal.bolt);
  lowerShoe.rotateZ(0.48);
  lowerShoe.translate(-0.18 * s, -0.92 * s, 0);
  parts.push(lowerShoe);

  // Smooth curved rounded oval/teardrop trigger guard loop (Constitutional Rule 10.2: ZERO square brackets!)
  const segs = 10;
  const rx = 1.85 * s;
  const ry = 1.62 * s;
  const bandT = 0.3 * s;
  const bandW = 0.86 * s;
  for (let i = 0; i < segs; i++) {
    const a0 = -Math.PI + (i / segs) * Math.PI;
    const a1 = -Math.PI + ((i + 1) / segs) * Math.PI;
    const x0 = Math.cos(a0) * rx + 0.1 * s;
    const y0 = Math.sin(a0) * ry;
    const x1 = Math.cos(a1) * rx + 0.1 * s;
    const y1 = Math.sin(a1) * ry;
    const segLen = Math.hypot(x1 - x0, y1 - y0) * 1.12;
    const angle = Math.atan2(y1 - y0, x1 - x0);
    const seg = createChamferedBox(segLen, bandT, bandW, 0.05 * s, pal.secondary);
    seg.rotateZ(angle);
    seg.translate((x0 + x1) * 0.5, (y0 + y1) * 0.5, 0);
    parts.push(seg);
  }
  return finalizeParts(parts);
}

function buildHammerGeo(
  scale: number,
  pal: CentennialFinishColorSet,
  skeletonized = false
): THREE.BufferGeometry {
  const s = clampMin(scale, 0.6);
  const parts: THREE.BufferGeometry[] = [];
  const hub = cylZ(0.56 * s, 0.56 * s, 0.82 * s, 0.05 * s, 18, pal.bolt);
  parts.push(hub);
  if (skeletonized) {
    // Iconic Beretta 92FS skeletonized DA/SA ring-spur hammer
    const ring = new THREE.TorusGeometry(0.76 * s, 0.22 * s, 10, 18);
    paintGeo(ring, pal.bolt);
    ring.translate(-0.52 * s, 1.15 * s, 0);
    parts.push(ring);
    const spur = createChamferedBox(0.9 * s, 0.38 * s, 0.58 * s, 0.05 * s, pal.accent);
    spur.rotateZ(0.28);
    spur.translate(-1.12 * s, 1.75 * s, 0);
    parts.push(spur);
    return finalizeParts(parts);
  }
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
    const isWa2000 = bp.id === 'wa2000';
    const legL = Math.max(7.2, dims.receiverH * (isWa2000 ? 2.55 : 2.05));
    const legR = Math.max(0.32, dims.receiverW * 0.1);
    const splayAngle = isWa2000 ? 0.24 : 0.28;
    const tiltAngle = isWa2000 ? 0.14 : 0.18;
    const hingeZ = dims.handguardW * (isWa2000 ? 0.56 : 0.34);
    const hingeY = isWa2000 ? dims.handguardH * 1.18 : -0.32;
    const parts: THREE.BufferGeometry[] = [];

    if (isWa2000) {
      // Iconic Walther WA 2000 top-mounted hanging bipod clamped to the upper aluminum frame rail!
      const topClamp = createChamferedBox(3.1, 1.05, dims.handguardW * 1.24, 0.08, pal.secondary);
      topClamp.translate(0, hingeY + 0.35, 0);
      parts.push(topClamp);
      for (const side of [-1, 1] as const) {
        const yoke = createChamferedBox(1.5, 1.35, 0.42, 0.05, pal.accent);
        yoke.translate(0, hingeY - 0.18, side * hingeZ);
        parts.push(yoke);
      }
    } else {
      const saddle = createChamferedBox(2.8, 1.15, dims.handguardW * 0.82, 0.08, pal.secondary);
      parts.push(saddle);
    }

    const xAxis = new THREE.Vector3(1, 0, 0);
    const zAxis = new THREE.Vector3(0, 0, 1);
    for (const side of [-1, 1] as const) {
      // Build leg extending straight down from origin (0, 0, 0) to (0, -legL, 0),
      // rotate around the upper hinge, and seat the horizontal rubber foot DEAD-FLUSH at exact tip!
      const leg = createBeveledCylinder(legR * 0.85, legR, legL, 0.05, 16, pal.accent);
      leg.translate(0, -legL * 0.5, 0);
      leg.rotateX(side * splayAngle);
      leg.rotateZ(tiltAngle);
      leg.translate(0, hingeY, side * hingeZ);
      parts.push(leg);

      // Compute exact world bottom tip of rotated leg
      const tip = new THREE.Vector3(0, -legL, 0)
        .applyAxisAngle(xAxis, side * splayAngle)
        .applyAxisAngle(zAxis, tiltAngle);

      const ankle = createBeveledCylinder(legR * 1.15, legR * 1.05, 0.42, 0.04, 14, pal.secondary);
      ankle.translate(tip.x, hingeY + tip.y + 0.12, side * hingeZ + tip.z);
      parts.push(ankle);

      const foot = createChamferedBox(1.22, 0.46, 1.18, 0.07, '#252a32');
      foot.translate(tip.x, hingeY + tip.y - 0.14, side * hingeZ + tip.z);
      parts.push(foot);
    }
    return finalizeParts(parts);
  }

  // Constitutional Rule 10.2: STRICTLY FORBID Picatinny 1913 toothed rails on pre-1990 classics!
  if (bp.year < 1990) {
    const isEasternSideRail =
      bp.id === 'ak47' ||
      bp.id === 'svd' ||
      bp.id === 'mosin' ||
      bp.id === 'sks' ||
      bp.id === 'stg44' ||
      bp.id === 'ks23';
    if (isEasternSideRail) {
      // Authentic Warsaw Pact / historical blued-steel dovetail side-mount rail on left receiver flank (-Z)
      const barL = clampMin(dims.receiverLen * 0.42, 4.2);
      const bar = buildChamferedSlab(barL, 0.72, 0.42, 0.06, pal.secondary);
      bar.translate(-dims.receiverLen * 0.34, -dims.receiverH * 0.56, -(dims.receiverW * 0.54));
      const lug = createChamferedBox(barL * 0.76, 0.28, 0.24, 0.03, pal.accent);
      lug.translate(-dims.receiverLen * 0.34, -dims.receiverH * 0.44, -(dims.receiverW * 0.62));
      return finalizeParts([bar, lug]);
    }
    if (bp.id === 'ppsh41') {
      // Iconic 1941 PPSh-41 smooth stamped barrel-shroud hinge & receiver top catch (ZERO Picatinny!)
      const catchPlate = buildChamferedSlab(3.8, 0.46, dims.receiverW * 0.62, 0.08, pal.secondary);
      catchPlate.translate(-0.8, -0.1, 0);
      const pin = cylZ(0.28, 0.28, dims.receiverW * 0.96, 0.04, 14, pal.accent);
      pin.translate(0.7, -0.22, 0);
      return finalizeParts([catchPlate, pin]);
    }
    // Smooth contoured historical receiver top sight rib / rear sight leaf saddle (ZERO Picatinny teeth!)
    const ribL = clampMin(dims.receiverLen * 0.38, 3.8);
    const ribW = clampMin(Math.min(1.5, dims.receiverW * 0.48), 1.0);
    const rib = buildChamferedSlab(ribL, 0.34, ribW, 0.06, pal.secondary);
    rib.translate(-dims.receiverLen * 0.14, -0.1, 0);
    return finalizeParts([rib]);
  }

  // Modern (>= 1990) MIL-STD-1913 top accessory Picatinny mount rail
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
  isTubeOrPan: boolean,
  withCutawayBrassStack = false,
  isCurvedMag = false
): THREE.BufferGeometry {
  if (isTubeOrPan) {
    const r = clampMin(Math.min(dims.magT, dims.magW) * 0.38, 0.65);
    return finalizeParts([cylX(r, r * 0.92, r * 2.2, 0.05, 20, FOLLOWER_ORANGE)]);
  }
  const w = clampMin(dims.magW * 0.82, 2.1);
  const t = clampMin(dims.magT * 0.74, 1.15);
  const parts: THREE.BufferGeometry[] = [];

  if (withCutawayBrassStack && dims.magH >= 6.0) {
    // Constitutional Rule 10.4: Gleaming stacked metallic brass cartridges + copper FMJ bullet tips
    // seated cleanly above the orange follower sled inside the sliced cutaway magazine (`?cut=1`)!
    const roundCount = 5;
    const roundR = Math.min(t * 0.32, Math.max(0.24, dims.magH * 0.036));
    const pitchY = roundR * 2.18;
    const stackH = roundCount * pitchY;
    const caseLen = w * 0.58;
    const bulletLen = w * 0.3;
    const topY = Math.min(dims.magH * 0.12, 1.35);
    const followerY = topY - stackH - 0.35;

    const sled = createChamferedBox(w * 0.94, 0.68, t * 0.92, 0.05, FOLLOWER_ORANGE);
    sled.translate(isCurvedMag ? dims.magH * 0.05 : 0, followerY, 0);
    parts.push(sled);

    for (let i = 0; i < roundCount; i++) {
      const ry = followerY + 0.52 + i * pitchY;
      // Gentle double-stack stagger inside the magazine wall thickness (zero side-wall poke-through!)
      const rz = (i % 2 === 0 ? -1 : 1) * Math.min(t * 0.15, roundR * 0.42);
      const tFromTop = Math.max(0, (topY - ry) / Math.max(dims.magH, 1));
      const rxCurve = isCurvedMag ? tFromTop * tFromTop * dims.magH * 0.2 : 0;

      const casing = cylX(roundR, roundR * 0.88, caseLen, 0.02, 12, pal.brass);
      casing.translate(rxCurve - bulletLen * 0.34, ry, rz);
      parts.push(casing);

      const bullet = cylX(roundR * 0.78, 0.05, bulletLen, 0.015, 12, '#c86c36');
      bullet.translate(rxCurve + caseLen * 0.5 + bulletLen * 0.12, ry, rz);
      parts.push(bullet);
    }
    return finalizeParts(parts);
  }

  const sled = createChamferedBox(w, 0.82, t, 0.06, FOLLOWER_ORANGE);
  const rib = createChamferedBox(w * 0.68, 0.42, t * 0.42, 0.04, pal.brass);
  rib.translate(0, 0.48, 0);
  parts.push(sled, rib);
  return finalizeParts(parts);
}

function buildMagBaseGeo(
  dims: CentennialPartDims,
  pal: CentennialFinishColorSet,
  magStyle: MagazineStyle,
  isOrdnance = false
): THREE.BufferGeometry {
  if (magStyle === 'curved_banana') {
    // Align floorplate DEAD-FLUSH with curved banana toe at (+magH*0.24, 0, 0) & tilt 0.28 rad!
    const w = clampMin(dims.magW * 1.12, 2.8);
    const t = clampMin(dims.magT * 1.14, 1.6);
    const h = clampMin(Math.min(1.05, dims.magH * 0.09), 0.55);
    const sweepX = dims.magH * 0.24;
    const plate = createChamferedBox(w, h, t, 0.06, pal.secondary);
    plate.rotateZ(0.28);
    plate.translate(sweepX, -h * 0.22, 0);
    const lockPin = createChamferedBox(w * 0.36, h * 0.35, t * 0.45, 0.03, pal.accent);
    lockPin.rotateZ(0.28);
    lockPin.translate(sweepX, -h * 0.65, 0);
    return finalizeParts([plate, lockPin]);
  }

  if (magStyle === 'drum_71') {
    const r = Math.max(dims.magH, dims.magW) * 0.42;
    if (isOrdnance) {
      // M61 Vulcan rear helical drum drive end-cap seated flush at rear of drum
      const cap = cylX(r * 0.92, r * 0.88, Math.max(2.2, dims.magT * 0.14), 0.14, 28, pal.secondary);
      cap.translate(6.5, 0, 0);
      const hub = cylX(r * 0.34, r * 0.28, Math.max(3.4, dims.magT * 0.22), 0.1, 22, pal.accent);
      hub.translate(5.0, 0, 0);
      return finalizeParts([cap, hub]);
    }
    // PPSh-41 / AA-12 drum: flush concentric front drum cover plate + radial winding key
    // translated UP (+dims.magH * 0.5) to sit concentric on the drum's front face (+X)!
    const yCenter = dims.magH * 0.5;
    const xFace = dims.magT * 0.6;
    const cover = cylX(r * 0.92, r * 0.88, 0.52, 0.07, 32, pal.secondary);
    cover.translate(xFace, yCenter, 0);
    const windingKey = createChamferedBox(0.75, r * 0.44, r * 0.16, 0.04, pal.accent);
    windingKey.translate(xFace + 0.32, yCenter, 0);
    const latch = cylX(r * 0.18, r * 0.16, 0.82, 0.04, 18, pal.accent);
    latch.translate(xFace + 0.26, yCenter, 0);
    return finalizeParts([cover, windingKey, latch]);
  }

  if (magStyle === 'pan_47') {
    // DP-28 horizontal 47-round pan: flush flat horizontal top cover lid + radial latch bar (axis Y!)
    const r = Math.max(dims.magW, dims.magH) * 0.48;
    const lid = createBeveledCylinder(r * 0.84, r * 0.88, 0.42, 0.06, 32, pal.secondary);
    const hub = createBeveledCylinder(r * 0.24, r * 0.28, 0.72, 0.05, 22, pal.accent);
    hub.translate(0, 0.22, 0);
    const latch = createChamferedBox(r * 0.78, 0.32, r * 0.16, 0.04, pal.accent);
    latch.translate(0, 0.38, 0);
    return finalizeParts([lid, hub, latch]);
  }

  if (magStyle === 'helical_64') {
    // PP-19 Bizon compact forward cylindrical end-cap ratchet matching scaled helical tubeR
    const tubeR = Math.min(1.52, Math.max(1.18, dims.magT * 0.42));
    const yDrop = -0.28;
    const cap = cylX(tubeR * 1.04, tubeR * 0.92, 1.25, 0.08, 26, pal.secondary);
    cap.translate(0, yDrop, 0);
    const ratchet = cylX(tubeR * 0.56, tubeR * 0.48, 0.65, 0.05, 20, pal.accent);
    ratchet.translate(0.75, yDrop, 0);
    return finalizeParts([cap, ratchet]);
  }

  if (magStyle === 'tubular') {
    // Compact knurled shotgun/lever-action front magazine tube end-cap
    const tubeR = Math.max(0.85, dims.magT * 0.48);
    const cap = cylX(tubeR * 1.15, tubeR * 1.08, 1.35, 0.08, 22, pal.accent);
    const stud = cylX(tubeR * 0.42, tubeR * 0.36, 0.55, 0.04, 16, pal.secondary);
    stud.translate(0.72, 0, 0);
    return finalizeParts([cap, stud]);
  }

  if (magStyle === 'belt_tray') {
    // Compact lower feed-chute retention plate tucked cleanly below belt tray
    const plate = createChamferedBox(dims.magW * 0.78, 0.52, dims.magT * 0.95, 0.06, pal.secondary);
    plate.translate(0, -dims.magH * 0.36, 0);
    return finalizeParts([plate]);
  }

  const w = clampMin(dims.magW * 1.12, 2.8);
  const t = clampMin(dims.magT * 1.14, 1.6);
  const h = clampMin(Math.min(1.08, dims.magH * 0.11), 0.58);
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
  const variant: HeavyArmorVariant =
    bp.id === 't34_85' ||
    bp.id === 't90m' ||
    bp.id === 'challenger2' ||
    bp.id === 'merkava4'
      ? bp.id
      : style === 'mbt_wwii'
        ? 't34_85'
        : 't90m';
  const s = dims.armorScale;

  return {
    receiver: () =>
      buildHeavyArmorHullAndTurretGeo('hull', s, pal.primary, style, variant),
    barrel: () =>
      buildSteppedBarrelGeo(
        dims.barrelLen,
        dims.barrelBreechR,
        dims.barrelMuzzleR,
        pal.barrel,
        {
          muzzleStyle: 'bare',
          thermalSleeve: style === 'mbt_modern',
          accentColorHex: pal.accent,
        }
      ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      buildHeavyArmorHullAndTurretGeo('turret', s, pal.primary, style, variant),
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
      // Twin cylindrical external rear fuel drums on T-34-85, T-90M & Challenger 2 (Merkava has rear crew doors!)
      if (variant !== 'merkava4') {
        for (const side of [-1, 1] as const) {
          const drum = cylZ(s * 0.24, s * 0.24, s * 0.72, s * 0.03, 20, pal.primary);
          drum.translate(-dims.stockLen * 0.35, s * 0.18, side * s * 0.82);
          parts.push(drum);
        }
      }
      return finalizeParts(parts);
    },
    grip: () =>
      buildHeavyArmorHullAndTurretGeo('engine_block', s, pal.secondary, style, variant),
    optic: () => {
      // Matte armor-painted commander cupola / panoramic CITV housing (ZERO emerald flood!)
      const parts: THREE.BufferGeometry[] = [
        createBeveledCylinder(s * 0.24, s * 0.28, s * 0.44, s * 0.04, 22, pal.primary),
        createChamferedBox(s * 0.36, s * 0.22, s * 0.32, s * 0.03, pal.accent),
      ];
      parts[1].translate(s * 0.12, s * 0.16, 0);
      // Tiny recessed dark anti-reflective periscope glass aperture on forward (+X) face
      const lens = createChamferedBox(s * 0.05, s * 0.11, s * 0.18, s * 0.01, '#16332c');
      lens.translate(s * 0.3, s * 0.16, 0);
      parts.push(lens);
      return finalizeParts(parts);
    },
    gas_system: () =>
      buildHeavyArmorHullAndTurretGeo('suspension_tracks', s, pal.secondary, style, variant),
    mount_rail: () =>
      buildHeavyArmorHullAndTurretGeo('era_skirts', s, pal.accent, style, variant),
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
    mag_base: () =>
      buildMagBaseGeo(
        dims,
        pal,
        isVulcan ? 'drum_71' : isBofors ? 'top_clip' : 'belt_tray',
        true
      ),
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

  if (isLongbow) {
    // 1415 Agincourt Medieval English Yew Warbow:
    // Pure continuous tapered D-section yew stave, dark stitched-leather center grip wrap,
    // carved pale cow-horn upper & lower nocks, taut braided hemp bowstring, and bodkin war-arrow.
    // Every secondary slot seats seamlessly along the stave/grip/string with ZERO floating boxes,
    // ZERO compound stabilizer rods, ZERO green sights, and ZERO protruding coil springs!
    const leatherDark = pal.furniture; // '#452412'
    const leatherCord = '#3a2315';
    const hornPale = pal.accent; // '#cfc09e'
    const hempHex = '#c7b796';

    // Exact stave curve helper matching `centennialCadPrimitives.ts`: x(y) = -(|y|/(span/2))^1.85 * span * 0.145
    const staveXAtY = (y: number) =>
      -Math.pow(Math.min(1, Math.abs(y) / (span * 0.5)), 1.85) * (span * 0.145);

    return {
      receiver: () => buildArcheryGeo('riser', dims.receiverLen, leatherDark, style),
      // Real GPU `SPRING_AXIS_MODE_FLEX` flexing tapered D-section yew stave!
      barrel: () => buildArcheryGeo('limbs', span, pal.primary, style),
      // Upper carved cow-horn tip nock seated dead-flush on upper stave tip
      muzzle: () => {
        const horn = createBeveledCylinder(0.46, 0.78, 2.8, 0.08, 18, hornPale);
        horn.rotateZ(0.28);
        horn.translate(-0.22, 0.55, 0);
        const groove = createBeveledCylinder(0.68, 0.68, 0.35, 0.04, 16, leatherCord);
        groove.rotateZ(0.28);
        groove.translate(-0.18, 0.15, 0);
        return finalizeParts([horn, groove]);
      },
      // Real GPU `SPRING_AXIS_MODE_FLEX` flexing natural-hemp bowstring!
      bolt_carrier: () => buildArcheryGeo('bowstring', span * 0.96, hempHex, style),
      bolt: () => buildArcheryGeo('projectile', dims.boltLen, pal.barrel, style),
      // Compact dark-toned internal aSpringParam micro-coil concealed 100% inside leather grip at world (0,0,0)
      recoil_spring: () => {
        const s = buildDynamicHelicalSpringGeo(2.0, 0.24, 0.055, 5, leatherDark, 'x');
        s.translate(3.2, span * 0.34, 0);
        return s;
      },
      // Pale cow-horn arrow-pass inlay plate seated flush on arrow-pass side of stave
      handguard: () => {
        const inlay = createChamferedBox(0.55, 2.6, 0.72, 0.08, hornPale);
        inlay.translate(-0.7, 1.6, 1.02);
        return finalizeParts([inlay]);
      },
      // Lower-limb waxed linen whipping band seated flush on stave at y = -9.0
      stock: () => {
        const band = createBeveledCylinder(1.26, 1.28, 2.2, 0.08, 20, leatherCord);
        band.translate(5.8 + staveXAtY(-9.0), -2.5, 0);
        return finalizeParts([band]);
      },
      // Stitched lower leather grip binding collar seated flush on grip at world (0, -3.2, 0)
      grip: () => {
        const cuff = createBeveledCylinder(1.42, 1.44, 4.2, 0.1, 22, leatherDark);
        cuff.translate(0.4, 1.0, 0);
        return finalizeParts([cuff]);
      },
      // Upper leather grip collar & bowyer's mark ring seated flush at world (0, +6.2, 0) — ZERO green sight!
      optic: () => {
        const ring = createBeveledCylinder(1.36, 1.42, 1.25, 0.08, 20, leatherCord);
        ring.translate(-4.6 + staveXAtY(6.2), -0.6, 1.8);
        return finalizeParts([ring]);
      },
      // Upper-limb waxed linen whipping band seated flush on stave at y = +9.0
      gas_system: () => {
        const band = createBeveledCylinder(1.26, 1.28, 2.2, 0.08, 20, leatherCord);
        band.translate(5.2 + staveXAtY(9.0), 2.8, -2.2);
        return finalizeParts([band]);
      },
      // Lower leather grip retaining collar seated flush at world (0, -6.2, 0) — ZERO stabilizer rod!
      mount_rail: () => {
        const collar = createBeveledCylinder(1.42, 1.36, 1.25, 0.08, 20, leatherCord);
        collar.translate(-11.5 + staveXAtY(-6.2), 4.0, 0);
        return finalizeParts([collar]);
      },
      // Waxed leather bowstring nocking bead centered dead-flush on bowstring at world (stringX, 2.0, 0)
      trigger: () => {
        const bead = createBeveledCylinder(0.28, 0.28, 1.1, 0.05, 16, leatherCord);
        bead.translate(1.2, 0, 0);
        return finalizeParts([bead]);
      },
      // Compact horn arrow-shelf ridge flush on grip arrow pass
      hammer: () => {
        const shelf = createChamferedBox(0.7, 0.55, 0.65, 0.06, hornPale);
        shelf.translate(-0.4, 0.45, -0.35);
        return finalizeParts([shelf]);
      },
      // Compact internal aSpringParam micro-coil concealed 100% inside leather grip at world (0,0,0)
      hammer_spring: () => {
        const s = buildDynamicHelicalSpringGeo(2.0, 0.24, 0.055, 5, leatherDark, 'y');
        s.translate(-0.4, 0.6, -1.4);
        return s;
      },
      // Lower carved cow-horn tip nock — exact mirror of upper horn nock seated flush on lower stave tip!
      selector: () => {
        const horn = createBeveledCylinder(0.78, 0.46, 2.8, 0.08, 18, hornPale);
        horn.rotateZ(-0.28);
        // assembledPos.selector = (-span*0.23, -span*0.44, 0); lower tip is (-span*0.145, -span*0.495, 0)
        horn.translate(span * (0.23 - 0.145) - 0.1, -span * (0.495 - 0.44) - 0.45, 0);
        return finalizeParts([horn]);
      },
      // Seamless stitched leather grip over-sleeve tucked coaxial with grip waist (ZERO giant rectangular box!)
      mag_body: () => {
        const sleeve = createBeveledCylinder(1.36, 1.38, 8.6, 0.12, 22, leatherDark);
        sleeve.translate(-2.8, 1.5, -5.2);
        return finalizeParts([sleeve]);
      },
      // Compact waxed-hemp string serving ring centered on bowstring
      follower: () => {
        const serv = createBeveledCylinder(0.24, 0.24, 1.4, 0.04, 16, leatherCord);
        serv.translate(-1.2 - span * 0.145, 0.6, 0);
        return finalizeParts([serv]);
      },
      // Compact internal aSpringParam micro-coil concealed 100% inside leather grip at world (0,0,0)
      mag_spring: () => {
        const s = buildDynamicHelicalSpringGeo(2.0, 0.24, 0.055, 5, leatherDark, 'y');
        s.translate(-2.8, 6.5, -5.2);
        return s;
      },
      // Lower leather grip butt-ring seated coaxial at world (0, -4.6, 0)
      mag_base: () => {
        const ring = createBeveledCylinder(1.4, 1.38, 0.9, 0.08, 20, leatherCord);
        ring.translate(-2.8, -15.1, -5.2);
        return finalizeParts([ring]);
      },
    };
  }

  if (isCrossbow) {
    // Excalibur Assassin Extreme Camless Recurve Crossbow:
    // Pure tapered horizontal recurve limbs, front open tubular metal FOOT STIRRUP (NO giant cam disc!),
    // horizontal low-profile side-mounted 4-bolt quiver (NO vertical M4 box magazine!),
    // sculpted thumbhole crossbow buttstock, and matte dark-anodized scope (NO emerald green!).
    return {
      receiver: () => buildArcheryGeo('riser', dims.receiverLen, pal.primary, style),
      barrel: () => buildArcheryGeo('limbs', span, pal.secondary, style),
      // Authentic angled open D-shaped metal crossbow foot stirrup + twin rubber string suppressors
      muzzle: () => {
        const parts: THREE.BufferGeometry[] = [];
        const loopW = 7.4;
        const loopL = 6.2;
        const tubeR = 0.34;
        // Front flat foot-rest bar
        const frontBar = cylZ(tubeR, tubeR, loopW, 0.04, 16, '#232830');
        frontBar.translate(loopL * 0.68, -0.35, 0);
        parts.push(frontBar);
        // Twin swept side stirrup arms joining front bar cleanly back into riser nose
        for (const side of [-1, 1] as const) {
          const arm = cylX(tubeR, tubeR, loopL * 0.95, 0.04, 14, pal.secondary);
          arm.rotateY(side * -0.26);
          arm.translate(loopL * 0.2, -0.2, side * (loopW * 0.36));
          parts.push(arm);
          // Twin compact rubberized string-dampener bumpers behind riser
          const dampRod = cylX(0.24, 0.24, 3.4, 0.03, 14, pal.accent);
          dampRod.translate(-4.6, 1.4, side * 2.8);
          parts.push(dampRod);
          const pad = createChamferedBox(0.85, 1.15, 0.95, 0.08, '#232830');
          pad.translate(-6.2, 1.4, side * 2.8);
          parts.push(pad);
        }
        return finalizeParts(parts);
      },
      bolt_carrier: () => buildArcheryGeo('bowstring', span * 0.92, pal.brass, style),
      bolt: () => buildArcheryGeo('projectile', dims.boltLen, pal.barrel, style),
      recoil_spring: () =>
        buildDynamicHelicalSpringGeo(3.6, 0.34, 0.08, 8, SPRING_STEEL_HEX, 'x'),
      // Contoured ergonomic under-rail crossbow fore-grip guard seated flush under flight rail
      handguard: () => {
        const body = createChamferedBox(dims.handguardLen * 0.88, 2.0, 3.0, 0.14, pal.secondary);
        body.translate(0, 0.45, 0);
        const wingL = createChamferedBox(dims.handguardLen * 0.72, 0.42, 0.65, 0.06, pal.accent);
        wingL.translate(0, 1.25, 1.72);
        const wingR = createChamferedBox(dims.handguardLen * 0.72, 0.42, 0.65, 0.06, pal.accent);
        wingR.translate(0, 1.25, -1.72);
        return finalizeParts([body, wingL, wingR]);
      },
      stock: () =>
        buildStockAndGripGeo(
          dims.stockLen,
          dims.stockH,
          dims.stockW,
          pal.secondary,
          'crossbow_thumbhole'
        ),
      grip: () =>
        buildStockAndGripGeo(
          dims.gripLen,
          dims.gripH,
          dims.gripW,
          pal.furniture,
          'pistol_grip'
        ),
      optic: () => buildOpticAndSightGeo('tactical_scope', dims.opticLen, pal.optic),
      // Integrated Charger silent crank strap spool tucked flush inside the flight rail channel
      gas_system: () => {
        const spool = cylX(0.42, 0.42, 8.5, 0.05, 16, pal.accent);
        spool.translate(-5.5, 1.2, 0);
        return finalizeParts([spool]);
      },
      // Flush CNC riser-limb mounting bridge yoke seated cleanly at riser nose (ZERO floating bar!)
      mount_rail: () => {
        const yoke = createChamferedBox(3.4, 2.2, 6.2, 0.12, pal.secondary);
        yoke.translate(-7.2, 0.7, 0);
        return finalizeParts([yoke]);
      },
      trigger: () => buildTriggerAssemblyGeo(0.95, pal),
      hammer: () => buildHammerGeo(0.85, pal),
      hammer_spring: () =>
        buildDynamicHelicalSpringGeo(3.2, 0.34, 0.08, 7, SPRING_STEEL_HEX, 'y'),
      selector: () => buildSelectorLeverGeo(0.9, pal),
      // Sleek low-profile HORIZONTAL side-mounted 4-bolt crossbow quiver (ZERO vertical M4 box mag!)
      mag_body: () => {
        const parts: THREE.BufferGeometry[] = [];
        const bracket = createChamferedBox(13.5, 1.65, 1.35, 0.1, pal.primary);
        bracket.translate(0, 2.2, -1.35);
        parts.push(bracket);
        const arm = createChamferedBox(2.2, 1.1, 2.2, 0.08, pal.accent);
        arm.translate(0, 2.4, -2.35);
        parts.push(arm);
        // 3 horizontal parallel carbon spare bolts clipped neatly along the side quiver
        for (let i = 0; i < 3; i++) {
          const by = 1.65 + i * 0.55;
          const shaft = cylX(0.22, 0.22, 14.5, 0.02, 12, '#252b34');
          shaft.translate(0.5, by, -0.78);
          parts.push(shaft);
          const fletch = createChamferedBox(2.2, 0.42, 0.16, 0.02, i === 0 ? '#c45822' : '#d8dde4');
          fletch.translate(-5.6, by, -0.78);
          parts.push(fletch);
        }
        return finalizeParts(parts);
      },
      follower: () => {
        const clip = createChamferedBox(5.2, 0.42, 1.4, 0.05, pal.accent);
        clip.translate(0, -0.25, 0);
        return finalizeParts([clip]);
      },
      mag_spring: () => {
        const s = buildDynamicHelicalSpringGeo(3.4, 0.24, 0.06, 7, SPRING_STEEL_HEX, 'x');
        s.translate(0, 2.2, -1.35);
        return s;
      },
      // Matching horizontal broadhead hood cap enclosing front bolt tips
      mag_base: () => {
        const hood = createChamferedBox(3.4, 2.1, 1.75, 0.12, pal.secondary);
        hood.translate(-1.0, 2.2, -1.15);
        return finalizeParts([hood]);
      },
    };
  }

  // 'bow_compound' (Hoyt Carbon RX-8 Ultra)
  return {
    receiver: () => buildArcheryGeo('riser', dims.receiverLen, pal.primary, style),
    // Real GPU `SPRING_AXIS_MODE_FLEX` flexing split carbon quad limbs!
    barrel: () => buildArcheryGeo('limbs', span, pal.secondary, style),
    muzzle: () => buildArcheryGeo('cams', span, pal.accent, style),
    // Real GPU `SPRING_AXIS_MODE_FLEX` flexing compound bowstring!
    bolt_carrier: () => buildArcheryGeo('bowstring', span * 0.92, pal.brass, style),
    bolt: () => buildArcheryGeo('projectile', dims.boltLen, pal.barrel, style),
    recoil_spring: () =>
      buildDynamicHelicalSpringGeo(3.6, 0.36, 0.08, 8, SPRING_STEEL_HEX, 'x'),
    handguard: () =>
      finalizeParts([
        createChamferedBox(
          dims.handguardLen * 0.72,
          dims.handguardH * 0.68,
          dims.handguardW * 0.76,
          0.12,
          pal.secondary
        ),
      ]),
    stock: () =>
      finalizeParts([cylX(0.48, 0.44, dims.stockLen * 0.85, 0.05, 18, pal.secondary)]),
    grip: () =>
      buildStockAndGripGeo(
        dims.gripLen * 0.85,
        dims.gripH * 0.88,
        dims.gripW * 0.88,
        pal.furniture,
        'pistol_grip'
      ),
    optic: () => buildOpticAndSightGeo('folding_tangent', dims.opticLen * 0.72, pal.optic),
    gas_system: () =>
      finalizeParts([
        cylX(0.32, 0.32, Math.max(7, dims.handguardLen * 0.62), 0.04, 16, pal.accent),
      ]),
    mount_rail: () =>
      finalizeParts([cylX(0.68, 0.56, 15.5, 0.08, 20, pal.secondary)]),
    trigger: () => buildTriggerAssemblyGeo(0.82, pal),
    hammer: () => buildHammerGeo(0.8, pal),
    hammer_spring: () =>
      buildDynamicHelicalSpringGeo(3.2, 0.34, 0.08, 7, SPRING_STEEL_HEX, 'y'),
    selector: () => buildArcheryGeo('cams', span, pal.accent, style),
    // Sleek vertical carbon-rod side hunting quiver w/ 3 carbon arrows (NOT an M4 box!)
    mag_body: () => {
      const parts: THREE.BufferGeometry[] = [];
      const spine = createBeveledCylinder(0.45, 0.45, 19.5, 0.06, 16, pal.primary);
      parts.push(spine);
      const gripper = createChamferedBox(1.8, 1.4, 2.8, 0.08, pal.accent);
      gripper.translate(0, -4.5, 0);
      parts.push(gripper);
      for (let i = -1; i <= 1; i++) {
        const shaft = createBeveledCylinder(0.22, 0.22, 21.0, 0.02, 12, '#242a32');
        shaft.translate(0.55, 0, i * 0.72);
        parts.push(shaft);
      }
      return finalizeParts(parts);
    },
    follower: () => buildFollowerGeo(dims, pal, false),
    mag_spring: () =>
      buildDynamicHelicalSpringGeo(3.6, 0.28, 0.07, 7, SPRING_STEEL_HEX, 'y'),
    mag_base: () =>
      finalizeParts([createChamferedBox(2.4, 3.2, 3.4, 0.14, pal.secondary)]),
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
          // Classic revolvers use low swept crescent front blade in `muzzle`, NEVER a tall AK tower!
          frontSightTower: false,
          accentColorHex: pal.accent,
        }
      ),
    muzzle: () => buildStandaloneMuzzleGeo(bp, dims, pal),
    bolt_carrier: () =>
      isRevolver
        ? finalizeParts([
            cylX(0.32, 0.32, dims.barrelLen * 0.68, 0.04, 18, pal.accent),
          ])
        : buildBoltAndCarrierGeo(
            dims.boltLen,
            dims.boltR,
            pal.primary,
            isBroom
              ? 'falling_block'
              : bp.id === 'beretta92'
                ? 'slide_open_top'
                : 'slide'
          ),
    bolt: () =>
      buildBoltAndCarrierGeo(
        isRevolver ? dims.boltLen : dims.boltLen * 0.42,
        isRevolver ? dims.boltR : dims.boltR * 0.72,
        pal.bolt,
        isRevolver ? 'revolver_cylinder' : 'falling_block'
      ),
    recoil_spring: () => {
      if (isRevolver) {
        // Compact internal trigger/bolt return spring concealed inside steel frame (ZERO exposed front coil!)
        const s = buildDynamicHelicalSpringGeo(2.2, 0.22, 0.05, 7, SPRING_STEEL_HEX, 'y');
        const gripY = -dims.receiverH * 0.42 - dims.gripH * 0.42;
        s.translate(0.5, -gripY * 0.55 - 0.15, 0);
        return s;
      }
      return buildDynamicHelicalSpringGeo(
        dims.springLen,
        dims.springR,
        dims.springR * 0.22,
        11,
        SPRING_STEEL_HEX,
        'x'
      );
    },
    handguard: () => {
      if (isRevolver) {
        // Iconic slim cylindrical Colt SAA 1873 under-barrel ejector-rod housing tube (ZERO chunky brick!)
        const tubeLen = dims.barrelLen * 0.68;
        const tube = cylX(0.46, 0.42, tubeLen, 0.05, 20, pal.barrel);
        tube.translate(-dims.barrelLen * 0.1, 0.22, 0.48);
        const tab = createChamferedBox(0.75, 0.55, 0.52, 0.04, pal.accent);
        tab.translate(tubeLen * 0.46 - dims.barrelLen * 0.1, 0.05, 0.68);
        return finalizeParts([tube, tab]);
      }
      // Trim slide-pistol dustcover frame nose strictly flush behind muzzle face
      const hgLen = isBroom ? dims.handguardLen * 0.72 : dims.receiverLen * 0.34;
      const box = createChamferedBox(hgLen, dims.handguardH, dims.handguardW * 0.94, 0.09, pal.secondary);
      if (!isBroom) {
        box.translate(-dims.receiverLen * 0.04, 0, 0);
      }
      return finalizeParts([box]);
    },
    stock: () => {
      if (isBroom) {
        // Compact blued-steel Mauser C96 rear shoulder-stock dovetail mounting lug
        const lug = createChamferedBox(1.8, dims.stockH * 0.78, dims.stockW * 0.76, 0.08, pal.secondary);
        lug.translate(1.2, 0, 0);
        return finalizeParts([lug]);
      }
      const cap = createChamferedBox(
        Math.min(2.2, dims.stockLen * 0.65),
        dims.stockH * 0.78,
        dims.stockW * 0.84,
        0.1,
        pal.secondary
      );
      cap.translate(0.55, 0, 0);
      return finalizeParts([cap]);
    },
    grip: () =>
      buildStockAndGripGeo(
        dims.gripLen,
        dims.gripH,
        dims.gripW,
        pal.furniture,
        gripStyle
      ),
    optic: () => {
      if (bp.cad.hasOptic) {
        return buildOpticAndSightGeo('tactical_scope', dims.opticLen, pal.optic);
      }
      if (isRevolver) {
        // Slim matte blued-steel top-strap sighting groove bar (ZERO chunky green block!)
        const strap = createChamferedBox(dims.receiverLen * 0.44, 0.34, 1.15, 0.04, pal.primary);
        strap.translate(-0.2, -0.22, 0);
        return finalizeParts([strap]);
      }
      if (isBroom) {
        // Authentic Mauser C96 blued graduated tangent rear sight
        return buildOpticAndSightGeo('folding_tangent', dims.opticLen, pal.optic);
      }
      // Sleek low-profile matte-black dovetail 3-dot rear pistol sight (Beretta 92 / P226 / CZ 75)
      const base = createChamferedBox(1.45, 0.44, dims.receiverW * 0.64, 0.04, pal.optic);
      const earL = createChamferedBox(1.05, 0.56, 0.44, 0.03, pal.optic);
      earL.translate(-0.1, 0.34, 0.52);
      const earR = createChamferedBox(1.05, 0.56, 0.44, 0.03, pal.optic);
      earR.translate(-0.1, 0.34, -0.52);
      return finalizeParts([base, earL, earR]);
    },
    gas_system: () =>
      finalizeParts([
        cylX(0.3, 0.3, dims.springLen * 0.92, 0.04, 16, pal.bolt),
      ]),
    mount_rail: () => {
      if (isRevolver || isBroom || bp.year < 1990) {
        // Constitutional Rule 10.2: ZERO Picatinny rails on pre-1990 pistols/revolvers!
        // Smooth contoured steel front frame dustcover chin & disassembly latch (Beretta 92 / P226 / CZ 75 / PPK / TT-33)
        const chinL = isRevolver || isBroom ? 2.2 : Math.min(dims.receiverLen * 0.28, 4.0);
        const chin = buildChamferedSlab(chinL, 0.62, dims.receiverW * 0.68, 0.08, pal.secondary);
        chin.translate(-dims.receiverLen * 0.16, 0.14, 0);
        return finalizeParts([chin]);
      }
      // Modern (>= 1990: USP45 / Five-seveN) compact under-dustcover accessory rail strictly trimmed behind muzzle
      const railL = Math.min(dims.receiverLen * 0.28, 4.4);
      const railW = Math.min(1.85, dims.receiverW * 0.66);
      const rail = createMilStdPicatinnyRail(railL, -railL * 0.5, 0.26, railW, pal.accent);
      rail.translate(-dims.receiverLen * 0.16, 0.12, 0);
      return finalizeParts([rail]);
    },
    trigger: () => buildTriggerAssemblyGeo(0.82, pal),
    hammer: () => buildHammerGeo(0.86, pal, bp.id === 'beretta92'),
    hammer_spring: () => {
      // Concealed cleanly inside pistol/revolver grip frame (ZERO exposed coil sticking out front!)
      const s = buildDynamicHelicalSpringGeo(
        Math.min(4.2, dims.gripH * 0.42),
        0.26,
        0.065,
        8,
        SPRING_STEEL_HEX,
        'y'
      );
      if (isRevolver) {
        s.translate(-0.45, 0.35, 0);
      } else if (isBroom) {
        s.translate(0.55, 0.25, 0);
      }
      return s;
    },
    selector: () => buildSelectorLeverGeo(0.78, pal),
    mag_body: () => {
      if (isRevolver) {
        // 6 gleaming brass revolver cartridges seated inside the fluted cylinder charge holes
        const parts: THREE.BufferGeometry[] = [];
        const pitch = dims.boltR * 0.58;
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2;
          const rd = cylX(0.36, 0.34, dims.boltLen * 0.78, 0.02, 12, pal.brass);
          rd.translate(0, Math.cos(a) * pitch, Math.sin(a) * pitch);
          parts.push(rd);
        }
        return finalizeParts(parts);
      }
      return buildMagazineGeo(
        'straight_box',
        dims.magH,
        dims.magW,
        dims.magT,
        pal.secondary
      );
    },
    follower: () => {
      if (isRevolver) {
        // Star ratchet ejector seated dead-center on rear cylinder axis (ZERO floating top orange blob!)
        const star = cylX(dims.boltR * 0.42, dims.boltR * 0.36, 0.45, 0.04, 18, pal.bolt);
        star.translate(-dims.boltLen * 0.48, -dims.magH * 0.34, 0);
        return finalizeParts([star]);
      }
      return buildFollowerGeo(dims, pal, false, !isBroom, false);
    },
    mag_spring: () => {
      if (isRevolver) {
        const s = buildDynamicHelicalSpringGeo(2.0, 0.2, 0.05, 6, SPRING_STEEL_HEX, 'y');
        s.translate(-0.8, 0.1, 0);
        return s;
      }
      return buildDynamicHelicalSpringGeo(
        Math.max(3.6, dims.magH * 0.65),
        0.44,
        0.09,
        9,
        SPRING_STEEL_HEX,
        'y'
      );
    },
    mag_base: () => {
      if (isRevolver) {
        // Blued-steel cylinder base-pin & knurled arbor head seated dead-center on front cylinder axis!
        const pin = cylX(0.36, 0.34, dims.boltLen * 0.72, 0.04, 16, pal.accent);
        pin.translate(dims.boltLen * 0.48, dims.magH * 0.48, 0);
        return finalizeParts([pin]);
      }
      return buildMagBaseGeo(dims, pal, 'straight_box');
    },
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
          // Constitutional Rule 10.2: ZERO Picatinny top rails on pre-1990 classics!
          topRail: bp.year >= 1990 && (bp.cad.hasOptic || bp.archetype === 'ar_rifle'),
          roundedTop:
            bp.archetype === 'smg_tube' ||
            bp.archetype === 'sniper_bolt' ||
            bp.archetype === 'shotgun_pump' ||
            bp.id === 'ppsh41',
          magwellCollar:
            magStyle === 'curved_banana' || magStyle === 'straight_box',
          ejectionPort: true,
          akStyle:
            bp.archetype === 'ak_rifle' ||
            bp.id === 'bizon' ||
            bp.id === 'saiga12',
          arA1Style: bp.id === 'm16a1',
          dovetailSideRail:
            bp.id === 'ak74m' ||
            bp.id === 'svd' ||
            bp.id === 'rpk74' ||
            bp.id === 'pkm',
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
          akGasBlock45: bp.id === 'ak47',
          m16AFrameSight: bp.id === 'm16a1',
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
    handguard: () => {
      if (bp.id === 'wa2000') {
        // Iconic Walther WA 2000 twin upper/lower anodized aluminum chassis rails + oiled walnut panels!
        const L = dims.handguardLen;
        const H = dims.handguardH;
        const W = dims.handguardW;
        const parts: THREE.BufferGeometry[] = [];
        // Upper full-length anodized aluminum frame beam running cleanly ABOVE the free-floated barrel
        const upperRail = createChamferedBox(L * 1.06, H * 0.24, W * 0.86, 0.08, pal.secondary);
        upperRail.translate(0, H * 0.52, 0);
        parts.push(upperRail);
        // Lower anodized aluminum spine beam
        const lowerRail = createChamferedBox(L * 1.02, H * 0.22, W * 0.84, 0.08, pal.secondary);
        lowerRail.translate(0, -H * 0.48, 0);
        parts.push(lowerRail);
        // Rich oiled walnut side & lower forend panels sandwiched between the twin rails
        const woodForend = createChamferedBox(L * 0.88, H * 0.52, W * 1.04, 0.14, pal.furniture);
        woodForend.translate(-L * 0.04, -H * 0.14, 0);
        parts.push(woodForend);
        // Front vertical frame bridge strut linking upper & lower rails
        const frontBridge = createChamferedBox(1.3, H * 1.12, W * 0.82, 0.07, pal.accent);
        frontBridge.translate(L * 0.48, 0.02, 0);
        parts.push(frontBridge);
        return finalizeParts(parts);
      }
      if (bp.id === 'svd') {
        // Slotted Russian birch-laminate Dragunov SVD ventilated handguard
        const L = dims.handguardLen;
        const H = dims.handguardH;
        const W = dims.handguardW;
        const base = buildHandguardGeo(L, H, W, pal.furniture, 'walnut_forend');
        const parts: THREE.BufferGeometry[] = [base];
        for (const side of [-1, 1] as const) {
          for (let i = 0; i < 6; i++) {
            const sx = -L * 0.34 + (i / 5) * (L * 0.68);
            const slot = createChamferedBox(L * 0.075, H * 0.26, 0.2, 0.02, '#362114');
            slot.translate(sx, H * 0.14, side * (W * 0.51));
            parts.push(slot);
          }
        }
        return finalizeParts(parts);
      }
      return buildHandguardGeo(
        dims.handguardLen,
        dims.handguardH,
        dims.handguardW,
        hgStyle === 'walnut_forend' ? pal.furniture : pal.secondary,
        hgStyle
      );
    },
    stock: () => {
      if (bp.id === 'wa2000') {
        // Iconic Walther WA 2000 oiled-walnut bullpup cheekpiece & buttstock framed in anodized aluminum
        return buildStockAndGripGeo(
          dims.stockLen,
          dims.stockH,
          dims.stockW,
          pal.furniture,
          'bullpup_stock'
        );
      }
      const isWoodStock =
        stockStyle === 'walnut_rifle' ||
        stockStyle === 'straight_walnut' ||
        stockStyle === 'ppsh_one_piece' ||
        stockStyle === 'dragunov_thumbhole';
      return buildStockAndGripGeo(
        dims.stockLen,
        dims.stockH,
        dims.stockW,
        isWoodStock ? pal.furniture : pal.secondary,
        stockStyle
      );
    },
    grip: () => {
      if (bp.id === 'ppsh41') {
        // Iconic 1941 PPSh-41 one-piece birch rifle stock has NO separate vertical AK pistol grip!
        // Tuck sleek blued-steel lower trigger tang & contoured wood wrist bridge seamlessly into stock wrist.
        const tang = buildChamferedSlab(dims.gripLen * 1.35, 1.45, dims.receiverW * 0.72, 0.08, pal.secondary);
        tang.rotateZ(0.14);
        tang.translate(-0.55, dims.gripH * 0.44, 0);
        const wristCollar = buildChamferedSlab(dims.gripLen * 1.1, 1.85, dims.gripW * 0.96, 0.14, pal.furniture);
        wristCollar.rotateZ(0.22);
        wristCollar.translate(-1.25, dims.gripH * 0.36, 0);
        return finalizeParts([tang, wristCollar]);
      }
      if (bp.archetype === 'shotgun_pump') {
        return buildHandguardGeo(
          Math.max(8, dims.handguardLen * 0.52),
          dims.handguardH * 0.92,
          dims.handguardW * 1.08,
          bp.cad.hasWoodFurniture ? pal.furniture : pal.secondary,
          bp.cad.hasWoodFurniture ? 'walnut_forend' : 'ventilated_tube'
        );
      }
      if (bp.archetype === 'shotgun_lever') {
        // Iconic Winchester 1887 blued-steel curved finger-loop lever (NO vertical AK pistol grip!)
        return buildStockAndGripGeo(
          dims.gripLen,
          dims.gripH,
          dims.gripW,
          pal.secondary,
          'lever_loop'
        );
      }
      if (bp.archetype === 'heavy_mg') {
        // M2HB heavy steel tripod pintle mounting cradle lug tucked flush under receiver (NO pistol grip!)
        const cradle = createChamferedBox(dims.gripLen * 1.45, 2.2, dims.receiverW * 0.88, 0.1, pal.secondary);
        cradle.translate(0, dims.gripH * 0.34, 0);
        const pintle = cylZ(0.65, 0.65, dims.receiverW * 1.06, 0.05, 18, pal.accent);
        pintle.translate(0, dims.gripH * 0.24, 0);
        return finalizeParts([cradle, pintle]);
      }
      return buildStockAndGripGeo(
        dims.gripLen,
        dims.gripH,
        dims.gripW,
        bp.cad.hasWoodFurniture ? pal.furniture : pal.secondary,
        'pistol_grip'
      );
    },
    optic: () =>
      buildOpticAndSightGeo(
        opticStyle,
        dims.opticLen,
        opticStyle === 'pso1_soviet' ? '#48515c' : pal.optic
      ),
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
    mag_body: () => {
      const magGeo = buildMagazineGeo(
        magStyle,
        dims.magH,
        dims.magW,
        dims.magT,
        // AK-47 Type 3 uses authentic stamped dark blued steel curved mag (NOT orange bakelite!)
        bp.finishPalette === 'bakelite_ak' &&
          magStyle === 'curved_banana' &&
          bp.id !== 'ak47'
          ? pal.furniture
          : pal.secondary
      );
      if (bp.id === 'm16a1') {
        // Iconic 20-round Colt M16A1 aluminum waffle-rib straight magazine detail
        const parts: THREE.BufferGeometry[] = [magGeo];
        for (const side of [-1, 1] as const) {
          for (let i = 0; i < 4; i++) {
            const ry = -dims.magH * 0.32 + (i / 3) * (dims.magH * 0.62);
            const hRib = createChamferedBox(dims.magW * 0.78, 0.28, 0.14, 0.02, pal.accent);
            hRib.translate(0, ry, side * (dims.magT * 0.52));
            parts.push(hRib);
          }
        }
        return finalizeParts(parts);
      }
      return magGeo;
    },
    follower: () =>
      buildFollowerGeo(
        dims,
        pal,
        isCircularMag,
        magStyle === 'curved_banana' || magStyle === 'straight_box',
        magStyle === 'curved_banana'
      ),
    mag_spring: () => {
      if (magStyle === 'helical_64') {
        const s = buildDynamicHelicalSpringGeo(
          Math.min(11.5, Math.max(6.5, dims.magH * 0.68)),
          0.58,
          0.09,
          10,
          SPRING_STEEL_HEX,
          'x'
        );
        s.translate(0, -0.28, 0);
        return s;
      }
      return buildDynamicHelicalSpringGeo(
        Math.max(3.6, dims.magH * 0.62),
        Math.max(0.42, Math.min(dims.magT, dims.magW) * 0.24),
        0.09,
        10,
        SPRING_STEEL_HEX,
        isTubeOrHelical ? 'x' : 'y'
      );
    },
    mag_base: () => buildMagBaseGeo(dims, pal, magStyle, false),
  };
}

/**
 * Physical metric UV tile size (`cm`) per exhibit class & part slot so shared
 * 1024×1024 seamless PBR textures (`centennial_mat_*`) render at authentic
 * real-world grain / checkering / machined-steel / armor-plate density with
 * primary `U` aligned strictly along the barrel `+X` axis.
 */
export function resolveMetricUvTileCm(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): number {
  if (bp.category === 'armor' || bp.category === 'ordnance') {
    if (
      slot === 'receiver' ||
      slot === 'bolt_carrier' ||
      slot === 'barrel' ||
      slot === 'handguard' ||
      slot === 'stock' ||
      slot === 'gas_system' ||
      slot === 'mount_rail' ||
      slot === 'muzzle'
    ) {
      return 75;
    }
    return 28;
  }
  if (bp.category === 'archery') {
    if (
      slot === 'barrel' ||
      slot === 'receiver' ||
      slot === 'stock' ||
      slot === 'bolt'
    ) {
      return 16;
    }
    return 10;
  }
  if (slot === 'grip') {
    // Crisp 20-LPI diamond checkering pitch (~4.5 cm tile) on pistol & tactical grips
    if (
      bp.archetype === 'pistol_slide' ||
      (!bp.cad.hasWoodFurniture && bp.archetype !== 'heavy_mg')
    ) {
      return 4.5;
    }
    return 10;
  }
  if (
    bp.cad.hasWoodFurniture &&
    (slot === 'stock' ||
      (slot === 'handguard' && resolveHandguardStyle(bp) === 'walnut_forend'))
  ) {
    return 14;
  }
  return 10;
}

/**
 * Generates exact 20 watertight procedural CAD geometry builders keyed by
 * `${bp.id}_${slot}` for any of the 66 Centennial blueprints across all 28
 * architectural archetypes, with physical metric Box-Projection UVs (`+X` aligned).
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
    const rawBuilder = slotBuilders[slot];
    const tileCm = resolveMetricUvTileCm(bp, slot);
    builders[centennialPartId(bp.id, slot)] = () =>
      applyMetricBoxUVs(rawBuilder(), tileCm);
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

import React, { useEffect } from 'react';
import * as THREE from 'three';
import { resolvePartCalloutLabel } from '../../i18n/weaponFallbacks';
import {
  getLoadedNarrationBundle,
  useWeaponNarration,
} from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId, WeaponPartSpec } from '../../weapons/types';
import {
  DEFAULT_ATTACHMENT_LOADOUT,
  OPTIC_ATTACHMENT_SPECS,
  type OpticAttachmentId,
  getWeaponAttachmentMountProfile,
} from '../attachments/attachmentSpecs';
import { useAttachmentStore } from '../attachments/attachmentStore';
import {
  getCachedPartGeometry,
  getPartLocalCenter,
} from '../geometry/geometryService';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import {
  getCachedHudBoxes,
  getCachedHudClearance,
  initHudBoundsObserver,
  scheduleHudBoundsRefresh,
  type ScreenRectBox,
} from './hudBoundsCache';

interface CalloutDomRefs {
  svgGroup: SVGGElement | null;
  path: SVGPathElement | null;
  dot: SVGCircleElement | null;
  label: HTMLButtonElement | null;
}

const domRegistry = new Map<string, CalloutDomRefs>();

function isNarrowAsciiGlyph(code: number): boolean {
  return (
    code === 32 || // ' '
    code === 39 || // '\''
    code === 40 || // '('
    code === 41 || // ')'
    code === 44 || // ','
    code === 45 || // '-'
    code === 46 || // '.'
    code === 47 || // '/'
    code === 49 || // '1'
    code === 58 || // ':'
    code === 59 || // ';'
    code === 102 || // 'f'
    code === 105 || // 'i'
    code === 106 || // 'j'
    code === 108 || // 'l'
    code === 114 || // 'r'
    code === 116 || // 't'
    code === 124 // '|'
  );
}

function estimateLabelWidth(text: string, compact: boolean): number {
  const cjkW = compact ? 11.2 : 12.6;
  const upperWideW = compact ? 9.5 : 10.6;
  const upperW = compact ? 7.6 : 8.5;
  const upperIW = compact ? 4.4 : 5.0;
  const lowerWideW = compact ? 8.8 : 9.8;
  const digitSymW = compact ? 6.6 : 7.4;
  const narrowW = compact ? 4.2 : 4.8;
  const asciiW = compact ? 6.2 : 7.0;

  // Horizontal pill padding (2 × 6.5px) + 2px border + bold/subpixel AA guard
  let px = compact ? 15.5 : 18;
  for (let i = 0; i < text.length; i++) {
    const code = text.charCodeAt(i);
    if (code > 0x2ff) {
      px += cjkW;
    } else if (code === 77 || code === 87) {
      px += upperWideW;
    } else if (code === 73) {
      px += upperIW;
    } else if (code >= 65 && code <= 90) {
      px += upperW;
    } else if (code === 109 || code === 119) {
      px += lowerWideW;
    } else if (isNarrowAsciiGlyph(code)) {
      px += narrowW;
    } else if (
      (code >= 48 && code <= 57) ||
      code === 34 ||
      code === 37 ||
      code === 38 ||
      code === 43 ||
      code === 176 ||
      code === 215
    ) {
      px += digitSymW;
    } else {
      px += asciiW;
    }
  }
  return px;
}

function overlapsCounted(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  placed: readonly ScreenRectBox[],
  count: number
): boolean {
  for (let i = 0; i < count; i++) {
    const b = placed[i];
    if (xMin < b.xMax && xMax > b.xMin && yMin < b.yMax && yMax > b.yMin) {
      return true;
    }
  }
  return false;
}

function computeOverlapPenalty(
  xMin: number,
  xMax: number,
  yMin: number,
  yMax: number,
  placed: readonly ScreenRectBox[],
  count: number,
  hudCount: number
): number {
  let penalty = 0;
  for (let i = 0; i < count; i++) {
    const b = placed[i];
    const ox = Math.min(xMax, b.xMax) - Math.max(xMin, b.xMin);
    if (ox <= 0) continue;
    const oy = Math.min(yMax, b.yMax) - Math.max(yMin, b.yMin);
    if (oy <= 0) continue;
    const isHud = i < hudCount;
    penalty += (isHud ? 2600 : 520) + ox * oy * (isHud ? 3.5 : 1.4);
  }
  return penalty;
}

function smoothAlpha(edge0: number, edge1: number, x: number): number {
  const u = Math.max(
    0,
    Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0))
  );
  return u * u * (3 - 2 * u);
}

/**
 * Resolves the callout hemisphere ('up' vs 'down') from the anchor's vertical
 * position relative to the weapon's projected vertical centroid (`weaponMidY`).
 * Upper parts (e.g. tank CITV roof sights, top rails, scopes) always prefer the
 * top hemisphere; lower parts (grips, magazines, lower hulls) prefer the bottom
 * hemisphere, eliminating leaders crossing straight through the weapon body.
 */
export function resolveCalloutHemisphere(
  anchorY: number,
  weaponMidY: number,
  preferredDir: 'up' | 'down',
  colTopY: number,
  colBotY: number,
  minY: number,
  approxFloorLimit: number
): 'up' | 'down' {
  let dir: 'up' | 'down' = preferredDir;
  if (anchorY < weaponMidY - 10) {
    dir = 'up';
  } else if (anchorY > weaponMidY + 10) {
    dir = 'down';
  }

  if (
    dir === 'down' &&
    approxFloorLimit - colBotY < 26 &&
    colTopY - minY > 40
  ) {
    dir = 'up';
  } else if (
    dir === 'up' &&
    colTopY - minY < 26 &&
    approxFloorLimit - colBotY > 40
  ) {
    dir = 'down';
  }
  return dir;
}

/**
 * Zero-GC crossing-minimization pass for callout leader lines.
 * Operates independently within the upper (`ly < anchorY`) and lower
 * (`ly >= anchorY`) hemispheres: whenever two labels in the same hemisphere
 * have `anchorX[i] < anchorX[j]` but `lx[i] > lx[j]`, their horizontal/vertical
 * label slots are swapped so leaders fan cleanly without X-crossings.
 */
export function untangleHemisphereLeaders(
  anchorX: Float64Array,
  anchorY: Float64Array,
  lx: Float64Array,
  ly: Float64Array,
  halfW: Float64Array,
  minX: Float64Array,
  maxX: Float64Array,
  count: number
): void {
  const MAX_PASSES = 6;
  for (let pass = 0; pass < MAX_PASSES; pass++) {
    let swapped = false;
    for (let i = 0; i < count; i++) {
      const iUpper = ly[i] < anchorY[i];
      for (let j = i + 1; j < count; j++) {
        const jUpper = ly[j] < anchorY[j];
        if (iUpper !== jUpper) continue;

        const anchorOrder = anchorX[i] - anchorX[j];
        const labelOrder = lx[i] - lx[j];
        // Crossing occurs when anchor order and label X order are inverted
        if (
          (anchorOrder < -1 && labelOrder > 1) ||
          (anchorOrder > 1 && labelOrder < -1)
        ) {
          const tmpLx = lx[i];
          const tmpLy = ly[i];
          lx[i] = Math.max(minX[i], Math.min(maxX[i], lx[j]));
          ly[i] = ly[j];
          lx[j] = Math.max(minX[j], Math.min(maxX[j], tmpLx));
          ly[j] = tmpLy;
          swapped = true;
        }
      }
    }
    if (!swapped) break;
  }

  // Ensure monotonic left-to-right clearance for adjacent same-row labels in same hemisphere
  for (let i = 0; i < count; i++) {
    const iUpper = ly[i] < anchorY[i];
    for (let j = i + 1; j < count; j++) {
      const jUpper = ly[j] < anchorY[j];
      if (iUpper !== jUpper) continue;
      if (Math.abs(ly[i] - ly[j]) > 22) continue;
      const leftIdx = anchorX[i] <= anchorX[j] ? i : j;
      const rightIdx = leftIdx === i ? j : i;
      const minSep = halfW[leftIdx] + halfW[rightIdx] + 8;
      const curSep = lx[rightIdx] - lx[leftIdx];
      if (curSep < minSep) {
        const push = (minSep - curSep) * 0.5;
        lx[leftIdx] = Math.max(
          minX[leftIdx],
          Math.min(maxX[leftIdx], lx[leftIdx] - push)
        );
        lx[rightIdx] = Math.max(
          minX[rightIdx],
          Math.min(maxX[rightIdx], lx[rightIdx] + push)
        );
      }
    }
  }
}

/**
 * Returns the approximate 3D world-space AABB `[xMin, yMin, zMin, xMax, yMax, zMax]`
 * of a mounted modular optic so upper-receiver callouts lift cleanly above it.
 */
export function computeMountedOpticClearanceBox(
  weaponId: WeaponId,
  opticId: OpticAttachmentId
): readonly [number, number, number, number, number, number] | null {
  if (opticId === 'none') return null;
  const profile = getWeaponAttachmentMountProfile(weaponId);
  if (!profile.opticRailAnchor) return null;
  const spec = OPTIC_ATTACHMENT_SPECS[opticId];
  const s = profile.modelScale;
  const [ax, ay, az] = profile.opticRailAnchor;
  const halfLen = Math.max(3.5, spec.lengthCm * 0.56) * s;
  const height =
    (opticId === 'thermal' ? 6.4 : opticId === 'lpvo' ? 5.8 : 4.6) * s;
  const halfZ = 2.4 * s;
  return [ax - halfLen, ay, az - halfZ, ax + halfLen, ay + height, az + halfZ];
}

const tmpVec = new THREE.Vector3();
const tmpEuler = new THREE.Euler();
const sharedPose = createMutablePose();

interface Candidate {
  part: WeaponPartSpec;
  sx: number;
  sy: number;
  alpha: number;
  width: number;
  isHighlighted: boolean;
}

// Pre-allocated Zero-GC scratch pools for 60Hz `useFrame` execution
const MAX_RELAX_SLOTS = 96;
const reusableActiveIdSet = new Set<string>();
const silhouettePool: ScreenRectBox[] = [];
const candidatePool: Candidate[] = [];
const candidateOrder: number[] = [];
const placedBoxPool: ScreenRectBox[] = [];

const relaxLx = new Float64Array(MAX_RELAX_SLOTS);
const relaxLy = new Float64Array(MAX_RELAX_SLOTS);
const relaxHalfW = new Float64Array(MAX_RELAX_SLOTS);
const relaxAnchorX = new Float64Array(MAX_RELAX_SLOTS);
const relaxAnchorY = new Float64Array(MAX_RELAX_SLOTS);
const relaxMinX = new Float64Array(MAX_RELAX_SLOTS);
const relaxMaxX = new Float64Array(MAX_RELAX_SLOTS);

const DX_CANDIDATES = [
  0, -24, 24, -50, 50, -80, 80, -114, 114, -152, 152, -194, 194, -240, 240,
  -290, 290, -344, 344, -402, 402, -464, 464, -528, 528,
];
const RELAX_ITERATIONS = 16;

/**
 * Called inside R3F `useFrame` at 60fps: projects 3D component surface anchors to 2D viewport
 * and positions vertical hairline leader lines + editorial labels with zero DOM layout reflow.
 */
export function updateCalloutOverlay60fps(
  camera: THREE.Camera,
  viewportW: number,
  viewportH: number,
  animatedExplodeT: number,
  animatedFireF: number
): void {
  const state = useAppStore.getState();
  if (state.screen !== 'workbench' || state.hudHidden) {
    for (const refs of domRegistry.values()) {
      if (refs.svgGroup) refs.svgGroup.style.opacity = '0';
      if (refs.label) {
        refs.label.style.opacity = '0';
        refs.label.style.pointerEvents = 'none';
      }
    }
    return;
  }

  const {
    activeWeaponId,
    lang,
    mode,
    showLabels,
    labelsUserToggled,
    xrayShells,
    isolateSelected,
    selectedPartId,
    hoveredPartId,
    hiddenGroups,
  } = state;
  const autoExplodeLabels =
    !labelsUserToggled && mode === 'explode' && animatedExplodeT >= 0.15;
  const effectiveShowLabels = showLabels || autoExplodeLabels;
  const autoExplodeFade = showLabels
    ? 1
    : smoothAlpha(0.15, 0.24, animatedExplodeT);

  const plugin = getLoadedWeaponPlugin(activeWeaponId);
  const narrationBundle = getLoadedNarrationBundle(activeWeaponId);
  const activeParts = plugin?.parts ?? [];
  reusableActiveIdSet.clear();
  for (let i = 0; i < activeParts.length; i++) {
    reusableActiveIdSet.add(activeParts[i].id);
  }

  for (const [regId, refs] of domRegistry.entries()) {
    if (!reusableActiveIdSet.has(regId)) {
      if (refs.svgGroup) refs.svgGroup.style.opacity = '0';
      if (refs.label) {
        refs.label.style.opacity = '0';
        refs.label.style.pointerEvents = 'none';
      }
    }
  }

  if (!plugin || activeParts.length === 0) return;

  const isCompact = viewportW < 820;
  const staticMinY = viewportW < 720 ? 174 : viewportW < 920 ? 116 : 76;
  const { topPx, bottomPx } = getCachedHudClearance();
  const minY = Math.max(staticMinY, topPx + 6);
  const storyDrawerOpen =
    state.storyOpen && !state.storyMinimized && viewportW >= 900;
  const storyDrawerW = Math.min(448, Math.max(360, viewportW * 0.3));
  const centerX = storyDrawerOpen
    ? (viewportW - storyDrawerW - 12) * 0.5
    : viewportW * 0.5;
  const dockAvailW = storyDrawerOpen
    ? viewportW - storyDrawerW - 44
    : viewportW - 32;
  const dockHalfW = Math.min(968, Math.max(280, dockAvailW)) * 0.5 + 10;
  const isDark = state.environmentPreset !== 'blueprint_daylight';

  let silhouetteCount = 0;
  let candidateCount = 0;

  const pushBoxSilhouette = (
    bx0: number,
    by0: number,
    bz0: number,
    bx1: number,
    by1: number,
    bz1: number,
    px: number,
    py: number,
    pz: number,
    sxScale: number
  ) => {
    let xMin = Infinity;
    let xMax = -Infinity;
    let yMin = Infinity;
    let yMax = -Infinity;
    for (let mask = 0; mask < 8; mask++) {
      const lx = (mask & 1 ? bx1 : bx0) * sxScale;
      const ly = mask & 2 ? by1 : by0;
      const lz = mask & 4 ? bz1 : bz0;
      tmpVec.set(lx, ly, lz).applyEuler(tmpEuler);
      tmpVec.x += px;
      tmpVec.y += py;
      tmpVec.z += pz;
      tmpVec.project(camera);
      if (tmpVec.z < -1 || tmpVec.z > 1) continue;
      const psx = (tmpVec.x * 0.5 + 0.5) * viewportW;
      const psy = (-tmpVec.y * 0.5 + 0.5) * viewportH;
      if (psx < xMin) xMin = psx;
      if (psx > xMax) xMax = psx;
      if (psy < yMin) yMin = psy;
      if (psy > yMax) yMax = psy;
    }
    if (xMin <= xMax) {
      let slot = silhouettePool[silhouetteCount];
      if (!slot) {
        slot = { xMin, xMax, yMin, yMax };
        silhouettePool[silhouetteCount] = slot;
      } else {
        slot.xMin = xMin;
        slot.xMax = xMax;
        slot.yMin = yMin;
        slot.yMax = yMax;
      }
      silhouetteCount++;
    }
  };

  const isFiring = mode === 'firing';
  const isFieldStrip = state.fieldStripActive && mode === 'explode';
  const nowMs = isFieldStrip ? performance.now() : 0;

  for (let i = 0; i < activeParts.length; i++) {
    const part = activeParts[i];
    const refs = domRegistry.get(part.id);
    if (!refs || !refs.svgGroup || !refs.label) continue;

    const geo = getCachedPartGeometry(activeWeaponId, part.id);
    if (!geo) {
      refs.svgGroup.style.opacity = '0';
      refs.label.style.opacity = '0';
      refs.label.style.pointerEvents = 'none';
      continue;
    }

    const isSelected = selectedPartId === part.id;
    const isHovered = hoveredPartId === part.id;
    const groupHidden = hiddenGroups[part.group];
    const ghostedByIsolate =
      isolateSelected && selectedPartId !== null && !isSelected;

    if (isFieldStrip) {
      fieldStripStore.evaluatePartPoseInto(activeWeaponId, part, sharedPose);
    } else {
      evaluatePartPoseInto(
        part,
        animatedExplodeT,
        isFiring,
        animatedFireF,
        plugin.computeFiringKinematics,
        sharedPose
      );
      if (state.malfunctionActive) {
        malfunctionStore.applyPartPoseDelta(
          activeWeaponId,
          part.id,
          sharedPose
        );
      }
    }

    const { px, py, pz, rx, ry, rz, sx: sxScale } = sharedPose;
    tmpEuler.set(rx, ry, rz);

    if (!groupHidden && !ghostedByIsolate) {
      if (part.silhouetteBoxes && part.silhouetteBoxes.length > 0) {
        for (let bIdx = 0; bIdx < part.silhouetteBoxes.length; bIdx++) {
          const sb = part.silhouetteBoxes[bIdx];
          pushBoxSilhouette(
            sb[0],
            sb[1],
            sb[2],
            sb[3],
            sb[4],
            sb[5],
            px,
            py,
            pz,
            sxScale
          );
        }
      } else if (geo.boundingBox) {
        const b = geo.boundingBox;
        pushBoxSilhouette(
          b.min.x,
          b.min.y,
          b.min.z,
          b.max.x,
          b.max.y,
          b.max.z,
          px,
          py,
          pz,
          sxScale
        );
      }
    }

    let alpha = 0;
    if (!groupHidden && !ghostedByIsolate) {
      if (isSelected || isHovered) {
        alpha = 1;
      } else if (isFieldStrip && showLabels) {
        const movedDist =
          Math.abs(px - part.assembledPos[0]) +
          Math.abs(py - part.assembledPos[1]) +
          Math.abs(pz - part.assembledPos[2]);
        const hl = fieldStripStore.getPartHighlight(
          activeWeaponId,
          part.id,
          nowMs
        );
        if (hl !== 'none' || part.labelAppearAt <= 0.01) {
          alpha = 1;
        } else if (movedDist > 0.06) {
          alpha = smoothAlpha(0.06, 0.45, movedDist);
        } else if (xrayShells && part.group === 'fire_control') {
          alpha = 0.88;
        }
      } else if (mode === 'explode' && effectiveShowLabels) {
        if (part.labelAppearAt <= 0.01) {
          alpha = autoExplodeFade;
        } else if (animatedExplodeT >= part.labelAppearAt - 0.02) {
          alpha =
            smoothAlpha(
              part.labelAppearAt - 0.02,
              part.labelAppearAt + 0.05,
              animatedExplodeT
            ) * autoExplodeFade;
        } else if (xrayShells && part.group === 'fire_control') {
          alpha = 0.88 * autoExplodeFade;
        }
      }
    }

    if (alpha <= 0.02) {
      refs.svgGroup.style.opacity = '0';
      refs.label.style.opacity = '0';
      refs.label.style.pointerEvents = 'none';
      continue;
    }

    const anchorLocal =
      part.calloutAnchor ?? getPartLocalCenter(activeWeaponId, part.id);
    tmpVec.set(anchorLocal[0] * sxScale, anchorLocal[1], anchorLocal[2]);
    tmpVec.applyEuler(tmpEuler);
    tmpVec.x += px;
    tmpVec.y += py;
    tmpVec.z += pz;

    tmpVec.project(camera);

    if (tmpVec.z < -1 || tmpVec.z > 1) {
      refs.svgGroup.style.opacity = '0';
      refs.label.style.opacity = '0';
      refs.label.style.pointerEvents = 'none';
      continue;
    }

    const sx = (tmpVec.x * 0.5 + 0.5) * viewportW;
    const sy = (-tmpVec.y * 0.5 + 0.5) * viewportH;

    if (sx < 6 || sx > viewportW - 6 || sy < 48 || sy > viewportH - 20) {
      refs.svgGroup.style.opacity = '0';
      refs.label.style.opacity = '0';
      refs.label.style.pointerEvents = 'none';
      continue;
    }

    const labelText = resolvePartCalloutLabel(
      part,
      lang,
      narrationBundle?.parts[part.id]
    );
    if (candidateCount < MAX_RELAX_SLOTS) {
      let cand = candidatePool[candidateCount];
      const estW = estimateLabelWidth(labelText, isCompact);
      const hl = isSelected || isHovered;
      if (!cand) {
        cand = {
          part,
          sx,
          sy,
          alpha,
          width: estW,
          isHighlighted: hl,
        };
        candidatePool[candidateCount] = cand;
      } else {
        cand.part = part;
        cand.sx = sx;
        cand.sy = sy;
        cand.alpha = alpha;
        cand.width = estW;
        cand.isHighlighted = hl;
      }
      candidateOrder[candidateCount] = candidateCount;
      candidateCount++;
    }
  }

  // Inject active mounted modular optic silhouette into `silhouettePool` (Zero-GC)
  // so upper-receiver callouts lift cleanly ABOVE LPVO / Thermal / Red Dot scopes.
  const activeLoadout =
    useAttachmentStore.getState().loadouts[activeWeaponId] ??
    DEFAULT_ATTACHMENT_LOADOUT;
  if (activeLoadout.optic !== 'none') {
    const attProfile = getWeaponAttachmentMountProfile(activeWeaponId);
    if (attProfile.opticRailAnchor) {
      const opticSpec = OPTIC_ATTACHMENT_SPECS[activeLoadout.optic];
      const s = attProfile.modelScale;
      const halfLen = Math.max(3.5, opticSpec.lengthCm * 0.56) * s;
      const height =
        (activeLoadout.optic === 'thermal'
          ? 6.4
          : activeLoadout.optic === 'lpvo'
            ? 5.8
            : 4.6) * s;
      const halfZ = 2.4 * s;
      const [ax, ay, az] = attProfile.opticRailAnchor;
      tmpEuler.set(0, 0, 0);
      pushBoxSilhouette(
        -halfLen,
        0,
        -halfZ,
        halfLen,
        height,
        halfZ,
        ax,
        ay,
        az,
        1
      );
    }
  }

  if (candidateCount === 0) return;

  // Compute global projected vertical midpoint of the weapon for hemisphere routing
  let globalSilMinY = viewportH;
  let globalSilMaxY = 0;
  for (let s = 0; s < silhouetteCount; s++) {
    const sil = silhouettePool[s];
    if (sil.yMin < globalSilMinY) globalSilMinY = sil.yMin;
    if (sil.yMax > globalSilMaxY) globalSilMaxY = sil.yMax;
  }
  const weaponMidY =
    globalSilMinY <= globalSilMaxY
      ? (globalSilMinY + globalSilMaxY) * 0.5
      : viewportH * 0.48;

  // In-place insertion sort on `candidateOrder[0..candidateCount)` by `sx` (Zero-GC)
  for (let i = 1; i < candidateCount; i++) {
    const idx = candidateOrder[i];
    const keySx = candidatePool[idx].sx;
    let j = i - 1;
    while (j >= 0 && candidatePool[candidateOrder[j]].sx > keySx) {
      candidateOrder[j + 1] = candidateOrder[j];
      j--;
    }
    candidateOrder[j + 1] = idx;
  }

  // Copy pre-cached HUD obstacle rectangles into reusable pool (O(1), zero getBoundingClientRect layout thrash!)
  const hudBoxes = getCachedHudBoxes();
  const hudCount = hudBoxes.length;
  let placedCount = 0;
  for (let h = 0; h < hudCount; h++) {
    const src = hudBoxes[h];
    let dst = placedBoxPool[placedCount];
    if (!dst) {
      dst = { xMin: src.xMin, xMax: src.xMax, yMin: src.yMin, yMax: src.yMax };
      placedBoxPool[placedCount] = dst;
    } else {
      dst.xMin = src.xMin;
      dst.xMax = src.xMax;
      dst.yMin = src.yMin;
      dst.yMax = src.yMax;
    }
    placedCount++;
  }

  const labelH = isCompact ? 19 : 21;
  const padX = isCompact ? 6.5 : 8.5;
  const padY = isCompact ? 4.5 : 5.5;
  const rowStep = isCompact ? 24 : 27;
  const absMinY = Math.max(12 + labelH * 0.5, topPx + 6);
  const absMaxY = Math.max(absMinY, viewportH - 14 - labelH * 0.5);

  for (let rank = 0; rank < candidateCount; rank++) {
    const c = candidatePool[candidateOrder[rank]];
    const halfW = c.width * 0.5;

    const absMinX = 8 + halfW;
    const absMaxX = Math.max(absMinX, viewportW - 8 - halfW);

    let colTopY = c.sy;
    let colBotY = c.sy;
    for (let s = 0; s < silhouetteCount; s++) {
      const sil = silhouettePool[s];
      if (c.sx >= sil.xMin - 8 && c.sx <= sil.xMax + 8) {
        if (sil.yMin < colTopY) colTopY = sil.yMin;
        if (sil.yMax > colBotY) colBotY = sil.yMax;
      }
    }

    const overBottomDock = Math.abs(c.sx - centerX) < dockHalfW + halfW * 0.4;
    const approxFloorLimit = overBottomDock
      ? viewportH - Math.max(168, bottomPx)
      : viewportH - 26;

    const dir = resolveCalloutHemisphere(
      c.sy,
      weaponMidY,
      c.part.calloutDir,
      colTopY,
      colBotY,
      minY,
      approxFloorLimit
    );

    const stemScale = isCompact ? 0.8 : 0.96;
    const clearPad = isCompact ? 18 : 24;
    const idealLy =
      dir === 'up'
        ? Math.min(c.sy - c.part.calloutStem * stemScale, colTopY - clearPad)
        : Math.max(c.sy + c.part.calloutStem * stemScale, colBotY + clearPad);

    let chosenLx = Math.max(absMinX, Math.min(absMaxX, c.sx));
    let chosenLy = Math.max(absMinY, Math.min(absMaxY, idealLy));
    let bestCost = Infinity;
    let fallbackLx = chosenLx;
    let fallbackLy = chosenLy;
    let bestFallbackCost = Infinity;

    const trySlot = (candLx: number, candLy: number, penaltyBias: number) => {
      if (candLx < absMinX - 0.5 || candLx > absMaxX + 0.5) return;
      if (candLy < absMinY || candLy > absMaxY) return;
      const xMin = candLx - halfW - padX;
      const xMax = candLx + halfW + padX;
      const yMin = candLy - labelH * 0.5 - padY;
      const yMax = candLy + labelH * 0.5 + padY;
      const dx = Math.abs(candLx - c.sx);
      const pureVerticalBonus = dx <= Math.max(4, halfW - 4) ? 0 : 120;
      const baseCost =
        penaltyBias + pureVerticalBonus + dx * 2.1 + Math.abs(candLy - idealLy);

      if (!overlapsCounted(xMin, xMax, yMin, yMax, placedBoxPool, placedCount)) {
        if (baseCost < bestCost) {
          bestCost = baseCost;
          chosenLx = candLx;
          chosenLy = candLy;
        }
      } else if (bestCost === Infinity) {
        const ovCost =
          baseCost +
          computeOverlapPenalty(
            xMin,
            xMax,
            yMin,
            yMax,
            placedBoxPool,
            placedCount,
            hudCount
          );
        if (ovCost < bestFallbackCost) {
          bestFallbackCost = ovCost;
          fallbackLx = candLx;
          fallbackLy = candLy;
        }
      }
    };

    const stepSign = dir === 'up' ? -1 : 1;

    for (let dIdx = 0; dIdx < DX_CANDIDATES.length; dIdx++) {
      const candLx = Math.max(
        absMinX,
        Math.min(absMaxX, c.sx + DX_CANDIDATES[dIdx])
      );
      let localTopY = c.sy;
      let localBotY = c.sy;
      for (let s = 0; s < silhouetteCount; s++) {
        const sil = silhouettePool[s];
        if (candLx >= sil.xMin - 8 && candLx <= sil.xMax + 8) {
          if (sil.yMin < localTopY) localTopY = sil.yMin;
          if (sil.yMax > localBotY) localBotY = sil.yMax;
        }
      }
      const startLy =
        dir === 'up'
          ? Math.min(
              c.sy - c.part.calloutStem * stemScale,
              localTopY - clearPad
            )
          : Math.max(
              c.sy + c.part.calloutStem * stemScale,
              localBotY + clearPad
            );
      for (let r = 0; r < 22; r++) {
        trySlot(candLx, startLy + stepSign * r * rowStep, 0);
      }
      if (dIdx === 0 && bestCost < Infinity) {
        break;
      }
    }

    if (bestCost === Infinity) {
      const altSign = -stepSign;
      for (let dIdx = 0; dIdx < DX_CANDIDATES.length; dIdx++) {
        const candLx = Math.max(
          absMinX,
          Math.min(absMaxX, c.sx + DX_CANDIDATES[dIdx])
        );
        let localTopY = c.sy;
        let localBotY = c.sy;
        for (let s = 0; s < silhouetteCount; s++) {
          const sil = silhouettePool[s];
          if (candLx >= sil.xMin - 8 && candLx <= sil.xMax + 8) {
            if (sil.yMin < localTopY) localTopY = sil.yMin;
            if (sil.yMax > localBotY) localBotY = sil.yMax;
          }
        }
        const altStartLy =
          altSign < 0 ? localTopY - clearPad : localBotY + clearPad;
        for (let r = 0; r < 20; r++) {
          trySlot(candLx, altStartLy + altSign * r * rowStep, 320);
        }
      }
    }

    const initLx = bestCost < Infinity ? chosenLx : fallbackLx;
    const initLy = bestCost < Infinity ? chosenLy : fallbackLy;

    relaxLx[rank] = initLx;
    relaxLy[rank] = initLy;
    relaxHalfW[rank] = halfW;
    relaxAnchorX[rank] = c.sx;
    relaxAnchorY[rank] = c.sy;
    relaxMinX[rank] = absMinX;
    relaxMaxX[rank] = absMaxX;

    let slotBox = placedBoxPool[placedCount];
    if (!slotBox) {
      slotBox = {
        xMin: initLx - halfW - padX,
        xMax: initLx + halfW + padX,
        yMin: initLy - labelH * 0.5 - padY,
        yMax: initLy + labelH * 0.5 + padY,
      };
      placedBoxPool[placedCount] = slotBox;
    } else {
      slotBox.xMin = initLx - halfW - padX;
      slotBox.xMax = initLx + halfW + padX;
      slotBox.yMin = initLy - labelH * 0.5 - padY;
      slotBox.yMax = initLy + labelH * 0.5 + padY;
    }
    placedCount++;
  }

  // Zero-GC 16-pass iterative pairwise X+Y repulsion & HUD obstacle clearance
  const minGapX = isCompact ? 8 : 11;
  const minGapY = isCompact ? 5.5 : 7.5;
  const halfH = labelH * 0.5;

  for (let iter = 0; iter < RELAX_ITERATIONS; iter++) {
    let anyOverlap = false;

    for (let i = 0; i < candidateCount; i++) {
      for (let j = i + 1; j < candidateCount; j++) {
        const reqDx = relaxHalfW[i] + relaxHalfW[j] + minGapX;
        const reqDy = labelH + minGapY;
        const dx = relaxLx[j] - relaxLx[i];
        const dy = relaxLy[j] - relaxLy[i];
        const penX = reqDx - Math.abs(dx);
        if (penX <= 0) continue;
        const penY = reqDy - Math.abs(dy);
        if (penY <= 0) continue;

        anyOverlap = true;
        const signX =
          Math.abs(dx) > 0.5
            ? dx > 0
              ? 1
              : -1
            : relaxAnchorX[j] !== relaxAnchorX[i]
              ? relaxAnchorX[j] > relaxAnchorX[i]
                ? 1
                : -1
              : 1;
        const signY =
          Math.abs(dy) > 0.5
            ? dy > 0
              ? 1
              : -1
            : relaxAnchorY[j] !== relaxAnchorY[i]
              ? relaxAnchorY[j] > relaxAnchorY[i]
                ? 1
                : -1
              : j % 2 === 0
                ? 1
                : -1;

        const roomX =
          (signX > 0
            ? relaxLx[i] - relaxMinX[i] + (relaxMaxX[j] - relaxLx[j])
            : relaxMaxX[i] - relaxLx[i] + (relaxLx[j] - relaxMinX[j])) >
          penX * 0.6;
        const roomY =
          (signY > 0
            ? relaxLy[i] - absMinY + (absMaxY - relaxLy[j])
            : absMaxY - relaxLy[i] + (relaxLy[j] - absMinY)) >
          penY * 0.6;

        if ((penY * 1.08 <= penX * 0.64 && roomY) || !roomX) {
          const pushY = penY * 0.56;
          const shearX = Math.min(penX, 9) * 0.16;
          relaxLy[i] -= signY * pushY;
          relaxLy[j] += signY * pushY;
          relaxLx[i] -= signX * shearX;
          relaxLx[j] += signX * shearX;
        } else {
          const pushX = penX * 0.56;
          const shearY = Math.min(penY, 6) * 0.18;
          relaxLx[i] -= signX * pushX;
          relaxLx[j] += signX * pushX;
          relaxLy[i] -= signY * shearY;
          relaxLy[j] += signY * shearY;
        }

        relaxLx[i] = Math.max(relaxMinX[i], Math.min(relaxMaxX[i], relaxLx[i]));
        relaxLx[j] = Math.max(relaxMinX[j], Math.min(relaxMaxX[j], relaxLx[j]));
        relaxLy[i] = Math.max(absMinY, Math.min(absMaxY, relaxLy[i]));
        relaxLy[j] = Math.max(absMinY, Math.min(absMaxY, relaxLy[j]));
      }
    }

    // Keep relaxed pills clear of HUD obstacle boxes on first 14 passes
    if (iter < RELAX_ITERATIONS - 2) {
      for (let i = 0; i < candidateCount; i++) {
        const hw = relaxHalfW[i] + 3;
        const hh = halfH + 2;
        for (let h = 0; h < hudCount; h++) {
          const hb = hudBoxes[h];
          const lx = relaxLx[i];
          const ly = relaxLy[i];
          if (
            lx - hw >= hb.xMax ||
            lx + hw <= hb.xMin ||
            ly - hh >= hb.yMax ||
            ly + hh <= hb.yMin
          ) {
            continue;
          }
          anyOverlap = true;
          const escLeft = hb.xMin - hw;
          const escRight = hb.xMax + hw;
          const escUp = hb.yMin - hh;
          const escDown = hb.yMax + hh;

          let bestShift = Infinity;
          let nextX = lx;
          let nextY = ly;

          if (escUp >= absMinY && Math.abs(escUp - ly) < bestShift) {
            bestShift = Math.abs(escUp - ly);
            nextX = lx;
            nextY = escUp;
          }
          if (escDown <= absMaxY && Math.abs(escDown - ly) < bestShift) {
            bestShift = Math.abs(escDown - ly);
            nextX = lx;
            nextY = escDown;
          }
          if (escLeft >= relaxMinX[i] && Math.abs(escLeft - lx) < bestShift) {
            bestShift = Math.abs(escLeft - lx);
            nextX = escLeft;
            nextY = ly;
          }
          if (escRight <= relaxMaxX[i] && Math.abs(escRight - lx) < bestShift) {
            nextX = escRight;
            nextY = ly;
          }

          relaxLx[i] = Math.max(relaxMinX[i], Math.min(relaxMaxX[i], nextX));
          relaxLy[i] = Math.max(absMinY, Math.min(absMaxY, nextY));
        }
      }
    }

    if (!anyOverlap) break;
  }

  // Crossing-minimization untangle within upper & lower hemispheres (Zero-GC)
  untangleHemisphereLeaders(
    relaxAnchorX,
    relaxAnchorY,
    relaxLx,
    relaxLy,
    relaxHalfW,
    relaxMinX,
    relaxMaxX,
    candidateCount
  );

  for (let rank = 0; rank < candidateCount; rank++) {
    const c = candidatePool[candidateOrder[rank]];
    const refs = domRegistry.get(c.part.id)!;
    const halfW = relaxHalfW[rank];
    const lx = relaxLx[rank];
    const ly = relaxLy[rank];

    const lineTipY = ly < c.sy ? ly + halfH + 1 : ly - halfH - 1;

    let dPath: string;
    if (Math.abs(lx - c.sx) <= Math.max(4, halfW - 6)) {
      dPath = `M ${c.sx.toFixed(1)} ${c.sy.toFixed(1)} L ${c.sx.toFixed(1)} ${lineTipY.toFixed(1)}`;
    } else {
      const edgeX = lx > c.sx ? lx - halfW - 2 : lx + halfW + 2;
      dPath = `M ${c.sx.toFixed(1)} ${c.sy.toFixed(1)} L ${c.sx.toFixed(1)} ${ly.toFixed(1)} L ${edgeX.toFixed(1)} ${ly.toFixed(1)}`;
    }

    const strokeColor = c.isHighlighted
      ? isDark
        ? '#38bdf8'
        : '#0284c7'
      : isDark
        ? 'rgba(148, 163, 184, 0.56)'
        : 'rgba(51, 65, 85, 0.52)';
    const strokeWidth = c.isHighlighted ? '1.5' : '0.95';

    refs.svgGroup!.style.opacity = c.alpha.toFixed(3);
    refs.path!.setAttribute('d', dPath);
    refs.path!.setAttribute('stroke', strokeColor);
    refs.path!.setAttribute('stroke-width', strokeWidth);

    refs.dot!.setAttribute('cx', c.sx.toFixed(1));
    refs.dot!.setAttribute('cy', c.sy.toFixed(1));
    refs.dot!.setAttribute('r', c.isHighlighted ? '3.2' : '2.1');
    refs.dot!.setAttribute(
      'fill',
      c.isHighlighted
        ? isDark
          ? '#38bdf8'
          : '#0284c7'
        : isDark
          ? '#0f172a'
          : '#f8fafc'
    );
    refs.dot!.setAttribute(
      'stroke',
      c.isHighlighted
        ? isDark
          ? '#0f172a'
          : '#ffffff'
        : isDark
          ? '#94a3b8'
          : '#1e293b'
    );

    refs.label!.style.opacity = c.alpha.toFixed(3);
    refs.label!.style.fontSize = isCompact ? '10.5px' : '11.5px';
    refs.label!.style.pointerEvents = c.alpha > 0.35 ? 'auto' : 'none';
    refs.label!.style.transform = `translate3d(${lx.toFixed(1)}px, ${ly.toFixed(1)}px, 0) translate(-50%, -50%)`;
  }
}

export const CalloutOverlay: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const storyMinimized = useAppStore((s) => s.storyMinimized);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const telemetryHudOpen = useAppStore((s) => s.telemetryHudOpen);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const sidebarCollapsed = useAppStore((s) => s.sidebarCollapsed);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const hoveredPartId = useAppStore((s) => s.hoveredPartId);
  const selectPart = useAppStore((s) => s.selectPart);
  const hoverPart = useAppStore((s) => s.hoverPart);

  const plugin = useWeaponPlugin(activeWeaponId);
  const { bundle: narrationBundle } = useWeaponNarration(activeWeaponId);
  const weaponParts = plugin?.parts ?? [];

  useEffect(() => {
    return initHudBoundsObserver();
  }, []);

  useEffect(() => {
    scheduleHudBoundsRefresh();
    const timer = window.setTimeout(scheduleHudBoundsRefresh, 240);
    return () => window.clearTimeout(timer);
  }, [
    screen,
    mode,
    telemetryHudOpen,
    engineeringTint,
    fieldStripActive,
    malfunctionActive,
    caliperActive,
    sidebarCollapsed,
    selectedPartId,
    activeWeaponId,
    lang,
    storyOpen,
    storyMinimized,
  ]);

  const ensureEntry = (id: string): CalloutDomRefs => {
    let entry = domRegistry.get(id);
    if (!entry) {
      entry = { svgGroup: null, path: null, dot: null, label: null };
      domRegistry.set(id, entry);
    }
    return entry;
  };

  return (
    <div className="callout-overlay-root" aria-hidden={false}>
      <svg className="callout-svg-layer">
        {weaponParts.map((part) => (
          <g
            key={part.id}
            ref={(el) => {
              ensureEntry(part.id).svgGroup = el;
            }}
            style={{ opacity: 0 }}
          >
            <path
              ref={(el) => {
                ensureEntry(part.id).path = el;
              }}
              fill="none"
              stroke="rgba(51, 65, 85, 0.56)"
              strokeWidth="0.95"
            />
            <circle
              ref={(el) => {
                ensureEntry(part.id).dot = el;
              }}
              r="2.2"
              fill="#ffffff"
              stroke="#334155"
              strokeWidth="1.2"
            />
          </g>
        ))}
      </svg>

      <div className="callout-labels-layer">
        {weaponParts.map((part) => {
          const isSelected = selectedPartId === part.id;
          const isHovered = hoveredPartId === part.id;
          return (
            <button
              key={part.id}
              ref={(el) => {
                ensureEntry(part.id).label = el;
              }}
              className={`editorial-callout-label ${
                isSelected ? 'selected' : ''
              } ${isHovered ? 'hovered' : ''}`}
              style={{ opacity: 0, pointerEvents: 'none' }}
              onClick={(e) => {
                const st = useAppStore.getState();
                if (
                  st.fieldStripActive &&
                  st.mode === 'explode' &&
                  !e.shiftKey
                ) {
                  fieldStripStore.attemptPartClick(activeWeaponId, part.id);
                  return;
                }
                if (st.malfunctionActive && !e.shiftKey) {
                  if (
                    malfunctionStore.handlePartClick(activeWeaponId, part.id)
                  ) {
                    return;
                  }
                }
                selectPart(isSelected ? null : part.id);
              }}
              onMouseEnter={() => hoverPart(part.id)}
              onMouseLeave={() => hoverPart(null)}
            >
              {resolvePartCalloutLabel(
                part,
                lang,
                narrationBundle?.parts[part.id]
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};

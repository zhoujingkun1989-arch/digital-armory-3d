import React, { useEffect } from 'react';
import * as THREE from 'three';
import { resolvePartCalloutLabel } from '../../i18n/weaponFallbacks';
import {
  getLoadedNarrationBundle,
  useWeaponNarration,
} from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { getLoadedWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponPartSpec } from '../../weapons/types';
import {
  getCachedPartGeometry,
  getPartLocalCenter,
} from '../geometry/geometryService';
import { createMutablePose, evaluatePartPoseInto } from '../kinematics/math';
import {
  getCachedHudBoxes,
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

function estimateLabelWidth(text: string, compact: boolean): number {
  const cjkW = compact ? 10.2 : 11.6;
  const asciiW = compact ? 5.8 : 6.5;
  let px = 10;
  for (let i = 0; i < text.length; i++) {
    px += text.charCodeAt(i) > 255 ? cjkW : asciiW;
  }
  return px;
}

function overlapsAny(box: ScreenRectBox, placed: ScreenRectBox[]): boolean {
  for (let i = 0; i < placed.length; i++) {
    const b = placed[i];
    if (
      box.xMin < b.xMax &&
      box.xMax > b.xMin &&
      box.yMin < b.yMax &&
      box.yMax > b.yMin
    ) {
      return true;
    }
  }
  return false;
}

function smoothAlpha(edge0: number, edge1: number, x: number): number {
  const u = Math.max(
    0,
    Math.min(1, (x - edge0) / Math.max(0.0001, edge1 - edge0))
  );
  return u * u * (3 - 2 * u);
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

const DX_CANDIDATES = [
  0, -20, 20, -42, 42, -66, 66, -94, 94, -126, 126, -162, 162, -202, 202, -246,
  246, -294, 294, -346, 346,
];

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
  if (state.screen !== 'workbench') {
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
    xrayShells,
    isolateSelected,
    selectedPartId,
    hoveredPartId,
    hiddenGroups,
  } = state;

  const plugin = getLoadedWeaponPlugin(activeWeaponId);
  const narrationBundle = getLoadedNarrationBundle(activeWeaponId);
  const activeParts = plugin?.parts ?? [];
  const activeIdSet = new Set(activeParts.map((p) => p.id));

  for (const [regId, refs] of domRegistry.entries()) {
    if (!activeIdSet.has(regId)) {
      if (refs.svgGroup) refs.svgGroup.style.opacity = '0';
      if (refs.label) {
        refs.label.style.opacity = '0';
        refs.label.style.pointerEvents = 'none';
      }
    }
  }

  if (!plugin || activeParts.length === 0) return;

  const isCompact = viewportW < 820;
  const minY = viewportW < 720 ? 174 : viewportW < 920 ? 116 : 76;
  const dockHalfW = Math.min(860, viewportW - 24) * 0.5 + 10;
  const centerX = viewportW * 0.5;

  const silhouettes: ScreenRectBox[] = [];
  const candidates: Candidate[] = [];

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
      silhouettes.push({ xMin, xMax, yMin, yMax });
    }
  };

  const isFiring = mode === 'firing';

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

    evaluatePartPoseInto(
      part,
      animatedExplodeT,
      isFiring,
      animatedFireF,
      plugin.computeFiringKinematics,
      sharedPose
    );

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
      if (isSelected) {
        alpha = 1;
      } else if (mode === 'explode' && showLabels) {
        if (part.labelAppearAt <= 0.01) {
          alpha = 1;
        } else if (animatedExplodeT >= part.labelAppearAt - 0.02) {
          alpha = smoothAlpha(
            part.labelAppearAt - 0.02,
            part.labelAppearAt + 0.05,
            animatedExplodeT
          );
        } else if (xrayShells && part.group === 'fire_control') {
          alpha = 0.88;
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
    candidates.push({
      part,
      sx,
      sy,
      alpha,
      width: estimateLabelWidth(labelText, isCompact),
      isHighlighted: isSelected || isHovered,
    });
  }

  candidates.sort((a, b) => a.sx - b.sx);

  // Copy pre-cached HUD obstacle rectangles (O(1), zero getBoundingClientRect layout thrash!)
  const placedBoxes: ScreenRectBox[] = [...getCachedHudBoxes()];

  const labelH = isCompact ? 15.5 : 18;
  const rowStep = isCompact ? 17.5 : 19.5;

  for (let i = 0; i < candidates.length; i++) {
    const c = candidates[i];
    const refs = domRegistry.get(c.part.id)!;
    const halfW = c.width * 0.5;

    const absMinX = 8 + halfW;
    const absMaxX = Math.max(absMinX, viewportW - 8 - halfW);
    const absMinY = 12 + labelH * 0.5;
    const absMaxY = viewportH - 14 - labelH * 0.5;

    let colTopY = c.sy;
    let colBotY = c.sy;
    for (let s = 0; s < silhouettes.length; s++) {
      const sil = silhouettes[s];
      if (c.sx >= sil.xMin - 6 && c.sx <= sil.xMax + 6) {
        if (sil.yMin < colTopY) colTopY = sil.yMin;
        if (sil.yMax > colBotY) colBotY = sil.yMax;
      }
    }

    const overBottomDock = Math.abs(c.sx - centerX) < dockHalfW + halfW * 0.4;
    const approxFloorLimit = overBottomDock ? viewportH - 168 : viewportH - 26;

    let dir: 'up' | 'down' = c.part.calloutDir;
    if (
      dir === 'down' &&
      approxFloorLimit - colBotY < 22 &&
      colTopY - minY > 40
    ) {
      dir = 'up';
    } else if (
      dir === 'up' &&
      colTopY - minY < 22 &&
      approxFloorLimit - colBotY > 40
    ) {
      dir = 'down';
    }

    const stemScale = isCompact ? 0.76 : 0.94;
    const clearPad = isCompact ? 15 : 21;
    const idealLy =
      dir === 'up'
        ? Math.min(c.sy - c.part.calloutStem * stemScale, colTopY - clearPad)
        : Math.max(c.sy + c.part.calloutStem * stemScale, colBotY + clearPad);

    let chosenLx = Math.max(absMinX, Math.min(absMaxX, c.sx));
    let chosenLy = Math.max(absMinY, Math.min(absMaxY, idealLy));
    let bestCost = Infinity;

    const trySlot = (candLx: number, candLy: number, penaltyBias: number) => {
      if (candLx < absMinX - 0.5 || candLx > absMaxX + 0.5) return;
      if (candLy < absMinY || candLy > absMaxY) return;
      const box: ScreenRectBox = {
        xMin: candLx - halfW - 3.5,
        xMax: candLx + halfW + 3.5,
        yMin: candLy - labelH * 0.5 - 1.5,
        yMax: candLy + labelH * 0.5 + 1.5,
      };
      if (overlapsAny(box, placedBoxes)) return;
      const dx = Math.abs(candLx - c.sx);
      const pureVerticalBonus = dx <= Math.max(4, halfW - 4) ? 0 : 140;
      const cost =
        penaltyBias + pureVerticalBonus + dx * 2.4 + Math.abs(candLy - idealLy);
      if (cost < bestCost) {
        bestCost = cost;
        chosenLx = candLx;
        chosenLy = candLy;
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
      for (let s = 0; s < silhouettes.length; s++) {
        const sil = silhouettes[s];
        if (candLx >= sil.xMin - 6 && candLx <= sil.xMax + 6) {
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
      for (let r = 0; r < 18; r++) {
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
        for (let s = 0; s < silhouettes.length; s++) {
          const sil = silhouettes[s];
          if (candLx >= sil.xMin - 6 && candLx <= sil.xMax + 6) {
            if (sil.yMin < localTopY) localTopY = sil.yMin;
            if (sil.yMax > localBotY) localBotY = sil.yMax;
          }
        }
        const altStartLy =
          altSign < 0 ? localTopY - clearPad : localBotY + clearPad;
        for (let r = 0; r < 16; r++) {
          trySlot(candLx, altStartLy + altSign * r * rowStep, 360);
        }
      }
    }

    const lx = chosenLx;
    const ly = chosenLy;

    placedBoxes.push({
      xMin: lx - halfW - 3,
      xMax: lx + halfW + 3,
      yMin: ly - labelH * 0.5 - 1.5,
      yMax: ly + labelH * 0.5 + 1.5,
    });

    const lineTipY = ly < c.sy ? ly + 9 : ly - 9;

    let dPath: string;
    if (Math.abs(lx - c.sx) <= Math.max(4, halfW - 4)) {
      dPath = `M ${c.sx.toFixed(1)} ${c.sy.toFixed(1)} L ${c.sx.toFixed(1)} ${lineTipY.toFixed(1)}`;
    } else {
      const edgeX = lx > c.sx ? lx - halfW + 2 : lx + halfW - 2;
      dPath = `M ${c.sx.toFixed(1)} ${c.sy.toFixed(1)} L ${c.sx.toFixed(1)} ${ly.toFixed(1)} L ${edgeX.toFixed(1)} ${ly.toFixed(1)}`;
    }

    const strokeColor = c.isHighlighted ? '#0284c7' : 'rgba(51, 65, 85, 0.52)';
    const strokeWidth = c.isHighlighted ? '1.5' : '0.95';

    refs.svgGroup!.style.opacity = c.alpha.toFixed(3);
    refs.path!.setAttribute('d', dPath);
    refs.path!.setAttribute('stroke', strokeColor);
    refs.path!.setAttribute('stroke-width', strokeWidth);

    refs.dot!.setAttribute('cx', c.sx.toFixed(1));
    refs.dot!.setAttribute('cy', c.sy.toFixed(1));
    refs.dot!.setAttribute('r', c.isHighlighted ? '3.2' : '2.1');
    refs.dot!.setAttribute('fill', c.isHighlighted ? '#0284c7' : '#f8fafc');
    refs.dot!.setAttribute('stroke', c.isHighlighted ? '#ffffff' : '#1e293b');

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
  const screen = useAppStore((s) => s.screen);
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
  }, [
    screen,
    sidebarCollapsed,
    selectedPartId,
    activeWeaponId,
    lang,
    storyOpen,
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
              onClick={() => selectPart(isSelected ? null : part.id)}
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

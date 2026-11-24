import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EXPLODE_GUIDE_MIN_PROGRESS,
  EXPLODE_GUIDE_RAMP_END,
  computeExplodeGuideMetrics,
  computeExplodeGuideVisibility,
  getExplodeGuidePalette,
  getExplodeGuideScaleSpec,
  writeExplodeGuideVisibilityInto,
} from '../src/engine/actors/ExplodeAxisGuide';
import { getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');

function extractAllUseFrameBodies(source: string): string {
  let combined = '';
  let searchFrom = 0;
  while (true) {
    const idx = source.indexOf('useFrame(', searchFrom);
    if (idx === -1) break;
    const arrowIdx = source.indexOf('=>', idx);
    if (arrowIdx === -1) break;
    const openBrace = source.indexOf('{', arrowIdx);
    if (openBrace === -1) break;

    let depth = 1;
    let cursor = openBrace + 1;
    while (cursor < source.length && depth > 0) {
      const ch = source[cursor];
      if (ch === '{') depth++;
      else if (ch === '}') depth--;
      cursor++;
    }
    combined += '\n' + source.slice(openBrace, cursor);
    searchFrom = cursor;
  }
  return combined;
}

function hexLuminance(hex: string): number {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.slice(0, 2), 16) / 255;
  const g = parseInt(clean.slice(2, 4), 16) / 255;
  const b = parseInt(clean.slice(4, 6), 16) / 255;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

describe('Cycle 11B.1 — Exploded Assembly Axis Guide Metrics across Small Arms, GAU-8 & 1:1 MBTs', () => {
  it('computes scale-calibrated finite axis vectors at t=0, t=0.5, and t=1.0 for ak15, m1911, gau8 & ztz99a', async () => {
    const cases: readonly {
      id: WeaponId;
      expectedMinDisp: number;
    }[] = [
      { id: 'ak15', expectedMinDisp: 0.6 },
      { id: 'm1911', expectedMinDisp: 0.6 },
      { id: 'gau8', expectedMinDisp: 4.0 },
      { id: 'ztz99a', expectedMinDisp: 12.0 },
    ];

    const dashSizes: Record<string, number> = {};

    for (const { id, expectedMinDisp } of cases) {
      const plugin = await loadWeaponPlugin(id);
      const scaleProfile = getWeaponManifest(id).workbenchMeta.scaleProfile;

      const m0 = computeExplodeGuideMetrics(plugin.parts, 0, scaleProfile);
      expect(m0.activeCount, `${id} t=0`).toBe(0);
      expect(m0.segments).toHaveLength(0);
      expect(m0.maxDisplacementCm).toBe(0);
      expect(m0.minDisplacementCm).toBeCloseTo(expectedMinDisp, 5);

      const mHalf = computeExplodeGuideMetrics(plugin.parts, 0.5, scaleProfile);
      const mFull = computeExplodeGuideMetrics(plugin.parts, 1.0, scaleProfile);

      expect(mHalf.activeCount, `${id} t=0.5 active`).toBeGreaterThan(0);
      expect(mFull.activeCount, `${id} t=1.0 active`).toBeGreaterThanOrEqual(
        mHalf.activeCount
      );
      expect(mFull.activeCount).toBeGreaterThanOrEqual(plugin.parts.length - 3);
      expect(mFull.maxDisplacementCm).toBeGreaterThan(mHalf.maxDisplacementCm);

      for (const seg of mFull.segments) {
        expect(seg.displacementCm).toBeGreaterThan(expectedMinDisp);
        expect(Number.isFinite(seg.displacementCm)).toBe(true);
        for (let k = 0; k < 3; k++) {
          expect(Number.isFinite(seg.anchor[k])).toBe(true);
          expect(Number.isFinite(seg.tip[k])).toBe(true);
        }
        const vecLen = Math.hypot(
          seg.tip[0] - seg.anchor[0],
          seg.tip[1] - seg.anchor[1],
          seg.tip[2] - seg.anchor[2]
        );
        expect(vecLen).toBeCloseTo(seg.displacementCm, 4);
      }

      dashSizes[id] = mFull.dashSize;
    }

    // Scale hierarchy: 1:1 MBT > GAU-8 > small arms
    expect(dashSizes.ztz99a).toBeGreaterThan(dashSizes.gau8);
    expect(dashSizes.gau8).toBeGreaterThan(dashSizes.ak15);

    const rifleSpec = getExplodeGuideScaleSpec('rifle', 'ak15');
    const gau8Spec = getExplodeGuideScaleSpec('main_battle_tank', 'gau8');
    const mbtSpec = getExplodeGuideScaleSpec('main_battle_tank', 'ztz99a');
    expect(mbtSpec.anchorDotRadiusCm).toBeGreaterThan(gau8Spec.anchorDotRadiusCm);
    expect(gau8Spec.anchorDotRadiusCm).toBeGreaterThan(
      rifleSpec.anchorDotRadiusCm
    );
  });

  it('anchors guide segments cleanly to part bounding-box local centers when provided', async () => {
    const ak = await loadWeaponPlugin('ak15');
    const shifted = computeExplodeGuideMetrics(
      ak.parts,
      1.0,
      'rifle',
      'ak15',
      () => [5.5, -2.25, 0.4]
    );
    const origin = computeExplodeGuideMetrics(ak.parts, 1.0, 'rifle', 'ak15');
    expect(shifted.activeCount).toBe(origin.activeCount);
    const s0 = shifted.segments[0];
    const o0 = origin.segments[0];
    expect(s0.anchor[0]).toBeCloseTo(o0.anchor[0] + 5.5, 4);
    expect(s0.anchor[1]).toBeCloseTo(o0.anchor[1] - 2.25, 4);
    expect(s0.anchor[2]).toBeCloseTo(o0.anchor[2] + 0.4, 4);
  });
});

describe('Cycle 11B.2 — Visibility Gating, Opacity Ramp & Blueprint Daylight vs Dark Studio Palette', () => {
  it('strictly hides guides at t<=0.06 and during firing, sectionCut, fieldStripActive, or non-workbench screens', () => {
    expect(EXPLODE_GUIDE_MIN_PROGRESS).toBeCloseTo(0.06, 5);
    expect(EXPLODE_GUIDE_RAMP_END).toBeCloseTo(0.35, 5);

    const hiddenCases = [
      {
        label: 't=0',
        input: {
          screen: 'workbench' as const,
          mode: 'explode' as const,
          fieldStripActive: false,
          sectionCut: false,
          explodeProgress: 0,
          environmentPreset: 'tactical_vault' as const,
        },
      },
      {
        label: 't=0.06 boundary',
        input: {
          screen: 'workbench' as const,
          mode: 'explode' as const,
          fieldStripActive: false,
          sectionCut: false,
          explodeProgress: 0.06,
          environmentPreset: 'blueprint_daylight' as const,
        },
      },
      {
        label: 'firing mode',
        input: {
          screen: 'workbench' as const,
          mode: 'firing' as const,
          fieldStripActive: false,
          sectionCut: false,
          explodeProgress: 0.8,
          environmentPreset: 'tactical_vault' as const,
        },
      },
      {
        label: 'sectionCut active',
        input: {
          screen: 'workbench' as const,
          mode: 'explode' as const,
          fieldStripActive: false,
          sectionCut: true,
          explodeProgress: 0.8,
          environmentPreset: 'tactical_vault' as const,
        },
      },
      {
        label: 'fieldStripActive',
        input: {
          screen: 'workbench' as const,
          mode: 'explode' as const,
          fieldStripActive: true,
          sectionCut: false,
          explodeProgress: 0.8,
          environmentPreset: 'tactical_vault' as const,
        },
      },
      {
        label: 'armory screen',
        input: {
          screen: 'armory' as const,
          mode: 'explode' as const,
          fieldStripActive: false,
          sectionCut: false,
          explodeProgress: 0.8,
          environmentPreset: 'tactical_vault' as const,
        },
      },
    ];

    for (const c of hiddenCases) {
      const vis = computeExplodeGuideVisibility(c.input);
      expect(vis.visible, c.label).toBe(false);
      expect(vis.baseOpacity, c.label).toBe(0);
      expect(vis.highlightOpacity, c.label).toBe(0);
    }
  });

  it('ramps opacity smoothly across [0.06..0.35] and distinguishes Dark Studio vs Blueprint Daylight palettes', () => {
    const darkPal = getExplodeGuidePalette('tactical_vault');
    const lightPal = getExplodeGuidePalette('blueprint_daylight');

    expect(darkPal.isLight).toBe(false);
    expect(lightPal.isLight).toBe(true);
    expect(lightPal.baseColor.toLowerCase()).toBe('#0369a1');
    expect(lightPal.highlightColor.toLowerCase()).toBe('#b45309');
    expect(darkPal.highlightColor.toLowerCase()).toBe('#f59e0b');
    expect(hexLuminance(lightPal.baseColor)).toBeLessThan(
      hexLuminance(darkPal.baseColor)
    );
    expect(hexLuminance(lightPal.highlightColor)).toBeLessThan(
      hexLuminance(darkPal.highlightColor)
    );

    const earlyDark = computeExplodeGuideVisibility({
      screen: 'workbench',
      mode: 'explode',
      fieldStripActive: false,
      sectionCut: false,
      explodeProgress: 0.14,
      environmentPreset: 'tactical_vault',
    });
    const fullDark = computeExplodeGuideVisibility({
      screen: 'workbench',
      mode: 'explode',
      fieldStripActive: false,
      sectionCut: false,
      explodeProgress: 0.5,
      environmentPreset: 'tactical_vault',
    });
    const fullLight = computeExplodeGuideVisibility({
      screen: 'workbench',
      mode: 'explode',
      fieldStripActive: false,
      sectionCut: false,
      explodeProgress: 0.5,
      environmentPreset: 'blueprint_daylight',
    });

    expect(earlyDark.visible).toBe(true);
    expect(earlyDark.baseOpacity).toBeGreaterThan(0);
    expect(earlyDark.baseOpacity).toBeLessThan(fullDark.baseOpacity);
    expect(fullDark.baseOpacity).toBeCloseTo(0.28, 4);
    expect(fullDark.highlightOpacity).toBeCloseTo(0.78, 4);
    expect(fullLight.baseOpacity).toBeCloseTo(0.42, 4);
    expect(fullLight.highlightOpacity).toBeCloseTo(0.78, 4);

    // Zero-GC scratch helper
    const scratch = {
      visible: false,
      ramp01: 0,
      baseOpacity: 0,
      highlightOpacity: 0,
    };
    const sameRef = writeExplodeGuideVisibilityInto(
      'workbench',
      'explode',
      false,
      false,
      0.5,
      'blueprint_daylight',
      scratch
    );
    expect(sameRef).toBe(scratch);
    expect(scratch.baseOpacity).toBeCloseTo(0.42, 4);
  });
});

describe('Cycle 11B.3 — Zero-GC useFrame, Dirty-Gating, Mount Wiring & GPU Disposal Hygiene', () => {
  it('enforces zero `new THREE.` inside useFrame, clean disposal, GTAO exclusion, and WeaponRecoilGroup mounting', () => {
    const guideSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/actors/ExplodeAxisGuide.tsx'),
      'utf8'
    );
    const viewportSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/canvas/ArmoryViewport.tsx'),
      'utf8'
    );

    const guideUseFrame = extractAllUseFrameBodies(guideSrc);
    expect(guideUseFrame.length).toBeGreaterThan(200);
    expect(guideUseFrame).not.toMatch(/\bnew THREE\./);

    // Dirty-gated buffer updates + explicit disposal + GTAO exclusion
    expect(guideSrc).toContain('Math.abs(p - lastProgressRef.current) > 1e-4');
    expect(guideSrc).toContain('resources.baseGeo.dispose()');
    expect(guideSrc).toContain('resources.hlGeo.dispose()');
    expect(guideSrc).toContain('resources.dotGeo.dispose()');
    expect(guideSrc).toContain('resources.baseMat.dispose()');
    expect(guideSrc).toContain('resources.hlMat.dispose()');
    expect(guideSrc).toContain('resources.dotMat.dispose()');
    expect(guideSrc).toContain('excludeFromGtao: true');
    expect(guideSrc).toContain('raycast={noopRaycast}');

    // Mounted cleanly inside <WeaponRecoilGroup> in ArmoryViewport
    const recoilStart = viewportSrc.indexOf('<WeaponRecoilGroup>');
    const recoilEnd = viewportSrc.indexOf('</WeaponRecoilGroup>', recoilStart);
    expect(recoilStart).toBeGreaterThan(-1);
    expect(recoilEnd).toBeGreaterThan(recoilStart);
    expect(viewportSrc.slice(recoilStart, recoilEnd)).toContain(
      '<ExplodeAxisGuide />'
    );
  });
});

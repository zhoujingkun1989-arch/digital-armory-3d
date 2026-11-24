import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import { computeBallisticSolution } from '../src/engine/physics/externalBallistics';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import {
  computeTargetCamPipRect,
  computeTargetCamPose,
  FIRING_LINE_HEIGHT_M,
  TARGET_CAM_PIP_MIN_VIEWPORT_W,
} from '../src/features/ballistics/range3DMath';
import {
  createProvingGroundGeometry,
  Range3DScene,
  sampleGeologicalStrataColor,
  sampleTerrainHeight,
} from '../src/features/ballistics/Range3DScene';

const ROOT = process.cwd();
const CJK_REGEX = /[\u4e00-\u9fff]/;

describe('Cycle 4C · Live Target-Cam PIP Inset, Craggy Geological Mountain Strata & qa:perf Wiring', () => {
  it('computes bounded Target-Cam PIP rects on desktop and auto-hides cleanly below 720px width', () => {
    // Mobile / narrow viewport auto-hide (< 720px)
    const mobile = computeTargetCamPipRect(390, 320);
    expect(mobile.visible).toBe(false);
    expect(mobile.width).toBe(0);
    expect(mobile.height).toBe(0);

    const thresholdBelow = computeTargetCamPipRect(
      TARGET_CAM_PIP_MIN_VIEWPORT_W - 1,
      460
    );
    expect(thresholdBelow.visible).toBe(false);

    // Desktop & wide tablet viewports stay strictly inside canvas bounds with clean 16:10 aspect
    const sizes: [number, number][] = [
      [720, 360],
      [1024, 480],
      [1280, 560],
      [1920, 720],
    ];
    for (const [w, h] of sizes) {
      const rect = computeTargetCamPipRect(w, h);
      expect(rect.visible).toBe(true);
      expect(rect.width).toBeGreaterThanOrEqual(160);
      expect(rect.width).toBeLessThanOrEqual(304);
      expect(rect.height).toBeGreaterThanOrEqual(88);
      expect(rect.x).toBeGreaterThan(0);
      expect(rect.x + rect.width).toBeLessThanOrEqual(w);
      expect(rect.yBottom).toBeGreaterThanOrEqual(40);
      expect(rect.yTop).toBeGreaterThanOrEqual(60);
      expect(rect.yTop + rect.height + rect.yBottom).toBe(h);
      expect(rect.aspect).toBeGreaterThan(1.3);
      expect(rect.aspect).toBeLessThan(1.9);
    }
  });

  it('frames AR500 steel gongs and 10% ballistic gel blocks cleanly with unobstructed LOS across 100m..1000m', () => {
    const ranges = [100, 300, 600, 1000];
    for (const rangeM of ranges) {
      const targetPos = { x: rangeM, y: FIRING_LINE_HEIGHT_M, z: 0 };

      // Small-arms steel gong
      const steelSmall = computeTargetCamPose(targetPos, 'steel_gong', false);
      expect(steelSmall.posX).toBeLessThan(rangeM);
      expect(steelSmall.posX).toBeGreaterThan(rangeM - 4.0);
      expect(steelSmall.posY).toBeGreaterThan(1.2);
      expect(Math.abs(steelSmall.lookX - rangeM)).toBeLessThan(0.5);
      expect(steelSmall.fovDeg).toBeGreaterThanOrEqual(22);
      expect(steelSmall.fovDeg).toBeLessThanOrEqual(32);

      // Heavy armor 2.2m gong sits farther back to frame full plate & swing
      const steelArmor = computeTargetCamPose(targetPos, 'steel_gong', true);
      expect(rangeM - steelArmor.posX).toBeGreaterThan(rangeM - steelSmall.posX);
      expect(steelArmor.posZ).toBeGreaterThan(steelSmall.posZ);

      // Translucent 10% ballistic gel block framed at crisp 3/4 side profile
      const gelSmall = computeTargetCamPose(targetPos, 'ballistic_gel', false);
      expect(gelSmall.posX).toBeLessThan(rangeM);
      expect(gelSmall.posZ).toBeGreaterThan(1.0);
      expect(gelSmall.lookX).toBeGreaterThan(rangeM);

      const gelArmor = computeTargetCamPose(targetPos, 'ballistic_gel', true);
      expect(gelArmor.posZ).toBeGreaterThan(gelSmall.posZ);
      expect(gelArmor.lookX).toBeGreaterThan(gelSmall.lookX);
    }
  });

  it('sculpts multi-octave craggy geological strata mountains while preserving a dead-flat firing corridor and linear bump lock', () => {
    // 1. Dead-flat compacted firing corridor inside |z| <= 16m up to 1,000m
    for (const x of [0, 100, 300, 600, 1000]) {
      expect(sampleTerrainHeight(x, 0)).toBeCloseTo(0, 5);
      expect(sampleTerrainHeight(x, 12)).toBeCloseTo(0, 5);
      expect(sampleTerrainHeight(x, -12)).toBeCloseTo(0, 5);
    }

    // 2. Flanking mountain ridges & backstop massif rise into craggy alpine elevation (> 45m)
    let peakFlank = 0;
    let peakBack = 0;
    for (let x = 100; x <= 1000; x += 60) {
      peakFlank = Math.max(peakFlank, sampleTerrainHeight(x, 260));
      peakFlank = Math.max(peakFlank, sampleTerrainHeight(x, -260));
    }
    for (let z = -200; z <= 200; z += 40) {
      peakBack = Math.max(peakBack, sampleTerrainHeight(1170, z));
    }
    expect(peakFlank).toBeGreaterThan(45);
    expect(peakBack).toBeGreaterThan(45);

    // 3. Geological strata vertex-color diversity across all 5 altitude/slope regimes
    const geo = createProvingGroundGeometry();
    try {
      const colorAttr = geo.attributes.color as THREE.BufferAttribute;
      const posAttr = geo.attributes.position as THREE.BufferAttribute;
      expect(colorAttr).toBeDefined();
      expect(posAttr.count).toBeGreaterThan(15000);

      let minR = 1;
      let maxR = 0;
      let minB = 1;
      let maxB = 0;
      let terracottaCount = 0;
      let highRidgeCount = 0;
      for (let i = 0; i < colorAttr.count; i++) {
        const r = colorAttr.getX(i);
        const b = colorAttr.getZ(i);
        const y = posAttr.getY(i);
        minR = Math.min(minR, r);
        maxR = Math.max(maxR, r);
        minB = Math.min(minB, b);
        maxB = Math.max(maxB, b);
        if (y > 14 && y <= 42 && r > b + 0.18) terracottaCount += 1;
        if (y > 46) highRidgeCount += 1;
      }
      expect(maxR - minR).toBeGreaterThan(0.35);
      expect(maxB - minB).toBeGreaterThan(0.35);
      expect(terracottaCount).toBeGreaterThan(500);
      expect(highRidgeCount).toBeGreaterThan(400);

      // Steep alpine peaks shed snow to expose darker granite than gentle snow saddles
      const gentleSnow = sampleGeologicalStrataColor(
        500,
        82,
        280,
        0.1,
        new THREE.Color()
      );
      const steepCliff = sampleGeologicalStrataColor(
        500,
        82,
        280,
        0.9,
        new THREE.Color()
      );
      expect(gentleSnow.r).toBeGreaterThan(steepCliff.r + 0.3);
    } finally {
      geo.dispose();
    }

    // 4. Static WebGL hygiene invariants in Range3DScene.tsx
    const src = fs.readFileSync(
      path.join(ROOT, 'src/features/ballistics/Range3DScene.tsx'),
      'utf8'
    );
    expect(src).toContain('gl.setScissorTest(true)');
    expect(src).toContain('gl.setScissor(');
    expect(src).toContain('gl.setViewport(');
    expect(src).toContain('gl.setScissorTest(false)');
    expect(src).toContain('el.clientWidth');
    expect(src).toContain('el.clientHeight');
    expect(src).toContain('lockLinearTextureColorSpace(bumpTex)');
    expect(src).not.toContain('flatShading');

    // Verify 0-corner-bleed optical bezel matching 90-deg WebGL scissor rect
    const css = fs.readFileSync(
      path.join(ROOT, 'src/styles/range-3d-upgrade.css'),
      'utf8'
    );
    expect(css).toMatch(/\.eb-range3d-pip-frame\s*\{[^}]*border-radius:\s*0;/s);
  });

  it('maintains zh/en Target-Cam PIP string parity (0 CJK in EN), renders PIP toggle & bezel in SSR, and wires qa:perf in package.json', () => {
    expect(Object.keys(EXTERNAL_BALLISTICS_STRINGS.en)).toEqual(
      Object.keys(EXTERNAL_BALLISTICS_STRINGS.zh)
    );
    const pipEnStrings = [
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipBtn,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipTitle,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipBadge,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipLiveTag,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipTargetSteel,
      EXTERNAL_BALLISTICS_STRINGS.en.range3dPipTargetGel,
    ];
    for (const s of pipEnStrings) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(CJK_REGEX.test(s)).toBe(false);
    }

    const sol = computeBallisticSolution('338_lapua', { maxRangeM: 1000 });
    const htmlEn = renderToStaticMarkup(
      React.createElement(Range3DScene, {
        focusedSolution: sol,
        comparisonSolutions: [sol],
        slotColors: ['#38bdf8'],
        maxRangeM: 1000,
        targetRangeM: 800,
        signedCrosswindMps: 4.5,
        lang: 'en',
        isLightTheme: false,
      })
    );
    expect(htmlEn).toContain('data-testid="range3d-pip-toggle"');
    expect(htmlEn).toContain('Target-Cam PIP');
    expect(htmlEn).toContain('data-testid="range3d-pip-overlay"');
    expect(htmlEn).toContain('TARGET-CAM');
    expect(htmlEn).toContain('800m');
    expect(CJK_REGEX.test(htmlEn)).toBe(false);

    // package.json scripts check: qa:perf wired cleanly without altering version/description
    const pkg = JSON.parse(
      fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8')
    );
    expect(pkg.scripts['qa:perf']).toBe('node scripts/qa_perf_soak.mjs');
    expect(pkg.version).toBe('6.0.0');
  });
});

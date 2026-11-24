import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  CALIPER_IMPERIAL_TICK_CM,
  CALIPER_METRIC_TICK_CM,
  CALIPER_SPRITE_HEIGHT,
  CALIPER_SPRITE_WIDTH,
  buildEnvelopeRulerGeometry,
  buildSpanAndProjectionLines,
  computeCaliperTickStepCm,
  getCaliperThemePalette,
  paintCaliperDimensionPill,
} from '../src/engine/canvas/CaliperActor';
import {
  computeCutawayFocusRefinement,
  computeWorkbenchSectionBarOffsetY,
} from '../src/engine/canvas/ArmoryViewport';
import { getWeaponManifest } from '../src/weapons/manifests';
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

function createMockCanvas2d(): {
  ctx: CanvasRenderingContext2D;
  texts: string[];
} {
  const texts: string[] = [];
  const stub = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    font: '12px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    clearRect: () => {},
    save: () => {},
    restore: () => {},
    beginPath: () => {},
    closePath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    fillText: (t: string) => {
      texts.push(t);
    },
  };
  return { ctx: stub as unknown as CanvasRenderingContext2D, texts };
}

describe('Cycle 10C.1 — 3D Caliper Imperial vs Metric Vernier Ticks, Daylight Palette & Floating Midpoint Pill', () => {
  it('computes exact metric (1 cm / 10 cm) and imperial (2.54 cm / 25.4 cm) tick steps and builds matching span geometry', () => {
    expect(CALIPER_METRIC_TICK_CM).toBeCloseTo(1.0, 5);
    expect(CALIPER_IMPERIAL_TICK_CM).toBeCloseTo(2.54, 5);

    expect(computeCaliperTickStepCm(false, 'mm')).toBeCloseTo(1.0, 5);
    expect(computeCaliperTickStepCm(false, 'in')).toBeCloseTo(2.54, 5);
    expect(computeCaliperTickStepCm(true, 'mm')).toBeCloseTo(10.0, 5);
    expect(computeCaliperTickStepCm(true, 'in')).toBeCloseTo(25.4, 5);

    // 25.4 cm (10 inches = 254 mm) horizontal span on small arms
    const metricGeo = buildSpanAndProjectionLines(
      [0, 0, 0],
      [25.4, 0, 0],
      false,
      'mm'
    );
    const imperialGeo = buildSpanAndProjectionLines(
      [0, 0, 0],
      [25.4, 0, 0],
      false,
      'in'
    );
    try {
      const mPos = metricGeo.getAttribute('position');
      const iPos = imperialGeo.getAttribute('position');
      // 3 orthogonal legs (6 verts) + 25 metric ticks (50 verts) = 56
      expect(mPos.count).toBe(56);
      // 3 orthogonal legs (6 verts) + 10 imperial 1-in ticks (20 verts) = 26
      expect(iPos.count).toBe(26);

      // First imperial tick sits at exact x = 2.54 cm (minor half-len 0.14)
      expect(iPos.getX(6)).toBeCloseTo(2.54, 4);
      expect(Math.abs(iPos.getY(7) - iPos.getY(6))).toBeCloseTo(0.28, 4);

      // 5th imperial tick (idx=5, vertex indices 6 + 4*2 = 14..15) is a major tick at 12.70 cm (half-len 0.28 -> full 0.56)
      expect(iPos.getX(14)).toBeCloseTo(12.7, 4);
      expect(Math.abs(iPos.getY(15) - iPos.getY(14))).toBeCloseTo(0.56, 4);
    } finally {
      metricGeo.dispose();
      imperialGeo.dispose();
    }

    // 254 cm (100 inches) horizontal span on 1:1 Main Battle Tank
    const mbtMetric = buildSpanAndProjectionLines(
      [0, 0, 0],
      [254, 0, 0],
      true,
      'mm'
    );
    const mbtImperial = buildSpanAndProjectionLines(
      [0, 0, 0],
      [254, 0, 0],
      true,
      'in'
    );
    try {
      expect(mbtMetric.getAttribute('position').count).toBe(56);
      expect(mbtImperial.getAttribute('position').count).toBe(26);
      expect(mbtImperial.getAttribute('position').getX(6)).toBeCloseTo(25.4, 3);
      expect(mbtImperial.getAttribute('position').getX(14)).toBeCloseTo(127.0, 3);
    } finally {
      mbtMetric.dispose();
      mbtImperial.dispose();
    }

    // Envelope ruler honors imperial vs metric tick density cleanly
    const envMetric = buildEnvelopeRulerGeometry(
      [-30, -10, -3],
      [30, 10, 3],
      false,
      'mm'
    );
    const envImperial = buildEnvelopeRulerGeometry(
      [-30, -10, -3],
      [30, 10, 3],
      false,
      'in'
    );
    try {
      expect(envImperial.getAttribute('position').count).toBeLessThan(
        envMetric.getAttribute('position').count
      );
      expect(envImperial.getAttribute('position').count).toBeGreaterThan(30);
    } finally {
      envMetric.dispose();
      envImperial.dispose();
    }
  });

  it('provides high-contrast Blueprint Daylight caliper palette and paints the floating CAD dimension pill cleanly', () => {
    const dark = getCaliperThemePalette('tactical_vault');
    const bench = getCaliperThemePalette('gunsmith_bench');
    const light = getCaliperThemePalette('blueprint_daylight');

    expect(dark.isLight).toBe(false);
    expect(bench.isLight).toBe(false);
    expect(light.isLight).toBe(true);

    // Blueprint Daylight uses deep cobalt & high-contrast ordnance amber (strictly darker than dark-mode cyan/amber)
    expect(light.beamColor.toLowerCase()).toBe('#0284c7');
    expect(light.tickColor.toLowerCase()).toBe('#b45309');
    expect(hexLuminance(light.beamColor)).toBeLessThan(
      hexLuminance(dark.beamColor)
    );
    expect(hexLuminance(light.tickColor)).toBeLessThan(
      hexLuminance(dark.tickColor)
    );
    expect(hexLuminance(light.pillText)).toBeLessThan(0.15);
    expect(hexLuminance(dark.pillText)).toBeGreaterThan(0.85);

    const mockDark = createMockCanvas2d();
    paintCaliperDimensionPill(
      mockDark.ctx,
      CALIPER_SPRITE_WIDTH,
      CALIPER_SPRITE_HEIGHT,
      '415.0 mm',
      'A ↔ B · 16.34 in',
      dark
    );
    expect(mockDark.texts).toEqual(['415.0 mm', 'A ↔ B · 16.34 in']);

    const mockLight = createMockCanvas2d();
    paintCaliperDimensionPill(
      mockLight.ctx,
      CALIPER_SPRITE_WIDTH,
      CALIPER_SPRITE_HEIGHT,
      '16.34 in',
      'A ↔ B · 415.0 mm',
      light
    );
    expect(mockLight.texts).toEqual(['16.34 in', 'A ↔ B · 415.0 mm']);
  });
});

describe('Cycle 10C.2 — Cutaway Bore/Breech Focus Camera Refinement & Z-Flip Mirroring', () => {
  it('mirrors cutaway_focus cleanly to the open -Z flank when sectionCutFlip is true across small arms, gau8 & MBTs', () => {
    const exhibits: readonly WeaponId[] = [
      'ak15',
      'm1911',
      'm82a1',
      'gau8',
      'ztz99a',
      'm1a2',
      'tiger1',
    ];

    for (const id of exhibits) {
      const base = getWeaponManifest(id).cameraPresets.cutaway_focus;

      // Inactive cutaway or non-Z axis returns verbatim pose
      const off = computeCutawayFocusRefinement(base, id, false, 'z', true);
      expect(off.mirroredZ).toBe(false);
      expect(off.pos).toEqual([...base.pos]);
      expect(off.target).toEqual([...base.target]);

      const xAxis = computeCutawayFocusRefinement(base, id, true, 'x', true);
      expect(xAxis.mirroredZ).toBe(false);
      expect(xAxis.pos).toEqual([...base.pos]);

      // Active Z cutaway unflipped stays on +Z flank
      const posZ = computeCutawayFocusRefinement(base, id, true, 'z', false);
      expect(posZ.mirroredZ).toBe(false);
      expect(posZ.pos[2]).toBeGreaterThan(posZ.target[2]);

      // Active Z cutaway flipped mirrors cleanly to open -Z flank at equal standoff distance
      const negZ = computeCutawayFocusRefinement(base, id, true, 'z', true);
      expect(negZ.mirroredZ).toBe(true);
      expect(negZ.pos[2]).toBeLessThan(negZ.target[2]);
      expect(negZ.target[2]).toBeCloseTo(-base.target[2], 4);
      expect(Math.abs(negZ.pos[2] - negZ.target[2])).toBeCloseTo(
        Math.abs(posZ.pos[2] - posZ.target[2]),
        4
      );
      expect(negZ.pos[0]).toBeCloseTo(posZ.pos[0], 4);
      expect(negZ.pos[1]).toBeCloseTo(posZ.pos[1], 4);
    }
  });

  it('clamps degenerate standoff & grazing obliquity safely while preserving Cycle 6C tall-grip offsets', () => {
    // Too-close & too-oblique pose on rifle clamps cleanly to >= 9.5 cm standoff and <= 0.78 oblique ratio
    const clampedRifle = computeCutawayFocusRefinement(
      { pos: [120, 2, 1.5], target: [0, 0, 0] },
      'ak15',
      true,
      'z',
      true
    );
    expect(clampedRifle.mirroredZ).toBe(true);
    expect(clampedRifle.pos[2]).toBeCloseTo(-9.5, 4);
    expect(Math.abs(clampedRifle.pos[0] - clampedRifle.target[0])).toBeLessThanOrEqual(
      9.5 * 0.78 + 1e-4
    );

    // Too-close pose on 1:1 MBT clamps cleanly to >= 340 cm standoff
    const clampedTank = computeCutawayFocusRefinement(
      { pos: [0, 80, 40], target: [0, 0, 0] },
      'ztz99a',
      true,
      'z',
      false
    );
    expect(clampedTank.pos[2]).toBeCloseTo(340, 4);

    // GAU-8 clamps cleanly to [180, 520] cm
    const clampedGau8 = computeCutawayFocusRefinement(
      { pos: [40, 20, 900], target: [30, 4, 0] },
      'gau8',
      true,
      'z',
      true
    );
    expect(clampedGau8.pos[2]).toBeCloseTo(-520, 4);

    // Cycle 6C tall-grip pistol clearance untouched
    expect(
      computeWorkbenchSectionBarOffsetY('pistol', 'iso', true, 'p08', true)
    ).toBeLessThan(
      computeWorkbenchSectionBarOffsetY('pistol', 'iso', true, 'mp5', true)
    );
  });
});

describe('Cycle 10C — Zero-GC useFrame & GPU Resource Disposal Hygiene', () => {
  it('maintains zero `new THREE.` inside useFrame and disposes all CaliperActor geometries & sprite CanvasTextures', () => {
    const caliperSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/canvas/CaliperActor.tsx'),
      'utf8'
    );
    const viewportSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/canvas/ArmoryViewport.tsx'),
      'utf8'
    );

    const caliperUseFrame = extractAllUseFrameBodies(caliperSrc);
    const viewportUseFrame = extractAllUseFrameBodies(viewportSrc);
    expect(caliperUseFrame.length).toBeGreaterThan(100);
    expect(viewportUseFrame.length).toBeGreaterThan(500);
    expect(caliperUseFrame).not.toMatch(/\bnew THREE\./);
    expect(viewportUseFrame).not.toMatch(/\bnew THREE\./);

    expect(caliperSrc).toContain('lockedSpanGeo?.dispose()');
    expect(caliperSrc).toContain('envelopeGeo?.dispose()');
    expect(caliperSrc).toContain('dimensionSpriteTex?.dispose()');
    expect(caliperSrc).toContain('renderOrder={17}');
    expect(caliperSrc).toContain('excludeFromGtao: true');
  });
});

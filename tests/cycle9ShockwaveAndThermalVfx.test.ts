import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  THERMAL_MIRAGE_HEAT_THRESHOLD,
  THERMAL_MIRAGE_RIBBON_COUNT,
  computeMuzzleShockwaveSample,
  computeThermalMirageSample,
  writeMuzzleShockwaveSampleInto,
  writeThermalMirageSampleInto,
} from '../src/engine/actors/GasFlowVisualizer';
import {
  computeBrassContactShadowSample,
  paintBrassContactShadowAlpha,
  writeBrassContactShadowSampleInto,
} from '../src/engine/actors/BallisticsSystem';
import {
  CORNER_FASTENER_FIDUCIALS,
  METRIC_FASTENER_GAUGES,
  TAKEDOWN_MAT_SPEC,
  buildMillimeterVernierTicks,
  buildTakedownMatGeometries,
  paintGunsmithMatAlbedo,
  paintGunsmithMatRoughness,
} from '../src/engine/canvas/GunsmithStageMat';
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

function createMockCanvas2dContext(width: number, height: number): {
  ctx: CanvasRenderingContext2D;
  drawnTexts: string[];
  radialGradientCalls: number;
} {
  const drawnTexts: string[] = [];
  let radialGradientCalls = 0;
  const imageDataBuffer = new Uint8ClampedArray(width * height * 4);
  const gradientStub = {
    addColorStop: () => {},
  };

  const ctxStub = {
    fillStyle: '#000000',
    strokeStyle: '#000000',
    lineWidth: 1,
    lineCap: 'butt',
    lineJoin: 'miter',
    globalAlpha: 1,
    font: '12px monospace',
    textAlign: 'left',
    textBaseline: 'alphabetic',
    save: () => {},
    restore: () => {},
    translate: () => {},
    rotate: () => {},
    scale: () => {},
    clearRect: () => {},
    fillRect: () => {},
    strokeRect: () => {},
    beginPath: () => {},
    closePath: () => {},
    rect: () => {},
    clip: () => {},
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    ellipse: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    fillText: (text: string) => {
      drawnTexts.push(text);
    },
    createLinearGradient: () => gradientStub,
    createRadialGradient: () => {
      radialGradientCalls++;
      return gradientStub;
    },
    getImageData: (_x: number, _y: number, w: number, h: number) => ({
      width: w,
      height: h,
      data: imageDataBuffer,
    }),
    putImageData: () => {},
  };

  return {
    ctx: ctxStub as unknown as CanvasRenderingContext2D,
    drawnTexts,
    get radialGradientCalls() {
      return radialGradientCalls;
    },
  };
}

describe('Cycle 9B.1 — Supersonic Muzzle Overpressure Ground-Shockwave Ring', () => {
  it('sweeps 140–520 cm across the -120 cm concrete hangar floor for 125mm/120mm MBTs and stays strictly inactive at t=0', () => {
    const mbts: readonly WeaponId[] = ['ztz99a', 'm1a2', 'leopard2a7'];

    for (const id of mbts) {
      const idle = computeMuzzleShockwaveSample(id, 0);
      expect(idle.active, `${id} at f=0`).toBe(false);
      expect(idle.radiusCm).toBe(0);
      expect(idle.opacity).toBe(0);
      expect(idle.floorY).toBeCloseTo(-120, 3);

      const preUncork = computeMuzzleShockwaveSample(id, 0.15);
      expect(preUncork.active, `${id} pre-uncork`).toBe(false);

      const postWindow = computeMuzzleShockwaveSample(id, 0.72);
      expect(postWindow.active, `${id} post-window`).toBe(false);

      const early = computeMuzzleShockwaveSample(id, 0.235);
      const mid = computeMuzzleShockwaveSample(id, 0.42);
      const late = computeMuzzleShockwaveSample(id, 0.65);

      expect(early.active).toBe(true);
      expect(mid.active).toBe(true);
      expect(late.active).toBe(true);

      // Sweeps monotonically across [140, 520] cm
      expect(early.radiusCm).toBeGreaterThanOrEqual(140);
      expect(early.radiusCm).toBeLessThan(220);
      expect(mid.radiusCm).toBeGreaterThan(early.radiusCm);
      expect(late.radiusCm).toBeGreaterThan(mid.radiusCm);
      expect(late.radiusCm).toBeGreaterThan(480);
      expect(late.radiusCm).toBeLessThanOrEqual(520);

      // Opacity rises crisply after uncorking and decays smoothly toward end of window
      expect(early.opacity).toBeGreaterThan(0.05);
      expect(mid.opacity).toBeGreaterThan(late.opacity);
      expect(late.opacity).toBeGreaterThan(0);

      // Secondary trailing ground dust wave is active and finite
      expect(mid.dustRadiusCm).toBeGreaterThan(100);
      expect(mid.dustOpacity).toBeGreaterThan(0.04);
    }
  });

  it('scales Tiger I 88mm, GAU-8 30mm, .50 BMG M82A1, .338 AWM & full-power bench rifles to their exact floor datums', () => {
    const tigerMid = computeMuzzleShockwaveSample('tiger1', 0.44);
    expect(tigerMid.active).toBe(true);
    expect(tigerMid.floorY).toBeCloseTo(-120, 3);
    expect(tigerMid.radiusCm).toBeGreaterThan(220);
    expect(tigerMid.radiusCm).toBeLessThanOrEqual(430);

    const gau8Mid = computeMuzzleShockwaveSample('gau8', 0.42);
    expect(gau8Mid.active).toBe(true);
    expect(gau8Mid.floorY).toBeCloseTo(
      getWeaponManifest('gau8').workbenchMeta.gridY + 1.0,
      3
    );
    expect(gau8Mid.radiusCm).toBeGreaterThan(120);
    expect(gau8Mid.radiusCm).toBeLessThanOrEqual(255);

    // .50 BMG benchtop blast wave on gunsmith mat datum
    const m82Idle = computeMuzzleShockwaveSample('m82a1', 0);
    expect(m82Idle.active).toBe(false);
    const m82Mid = computeMuzzleShockwaveSample('m82a1', 0.4);
    expect(m82Mid.active).toBe(true);
    expect(m82Mid.floorY).toBeCloseTo(
      getWeaponManifest('m82a1').workbenchMeta.gridY + 0.45,
      3
    );
    expect(m82Mid.radiusCm).toBeGreaterThan(24);
    expect(m82Mid.radiusCm).toBeLessThanOrEqual(56);

    // .338 Lapua AWM + subtle bench dust ripples on MG 42, M1 Garand, K98k
    const awmMid = computeMuzzleShockwaveSample('awm', 0.48);
    expect(awmMid.active).toBe(true);
    expect(awmMid.radiusCm).toBeGreaterThan(15);
    expect(awmMid.radiusCm).toBeLessThan(m82Mid.radiusCm);

    for (const rifleId of ['mg42', 'garand', 'k98k'] as const) {
      const sample = computeMuzzleShockwaveSample(rifleId, 0.45);
      expect(sample.active, `${rifleId} active at f=0.45`).toBe(true);
      expect(sample.floorY).toBeCloseTo(
        getWeaponManifest(rifleId).workbenchMeta.gridY + 0.45,
        3
      );
      expect(sample.radiusCm).toBeGreaterThan(10);
      expect(sample.radiusCm).toBeLessThan(40);
      expect(sample.opacity).toBeLessThan(m82Mid.opacity);
    }
  });

  it('keeps archery (lift33 / r500) and light pistols strictly inactive across the entire firing cycle', () => {
    const probes = [0, 0.1, 0.25, 0.35, 0.45, 0.55, 0.65, 0.85, 1.0];
    for (const id of ['lift33', 'r500', 'g17', 'mp5'] as const) {
      for (const f of probes) {
        const s = computeMuzzleShockwaveSample(id, f);
        expect(s.active, `${id} at f=${f}`).toBe(false);
        expect(s.radiusCm).toBe(0);
        expect(s.opacity).toBe(0);
      }
    }
  });

  it('mutates caller scratch buffer in-place via writeMuzzleShockwaveSampleInto (Zero-GC)', () => {
    const scratch = computeMuzzleShockwaveSample('ztz99a', 0);
    const returned = writeMuzzleShockwaveSampleInto('ztz99a', 0.4, scratch);
    expect(returned).toBe(scratch);
    expect(scratch.active).toBe(true);
    expect(scratch.radiusCm).toBeGreaterThan(250);
  });
});

describe('Cycle 9B.2 — Hot-Barrel Thermal Convection Mirage Ribbons', () => {
  it('stays cleanly hidden at barrelHeat01 <= 0.22 and activates smoothly above threshold', () => {
    expect(THERMAL_MIRAGE_HEAT_THRESHOLD).toBeCloseTo(0.22, 5);
    expect(THERMAL_MIRAGE_RIBBON_COUNT).toBe(4);

    for (const h of [0, 0.1, 0.219, 0.22]) {
      const s = computeThermalMirageSample('ak15', h);
      expect(s.active, `ak15 heat=${h}`).toBe(false);
      expect(s.opacity).toBe(0);
    }

    const warm = computeThermalMirageSample('mg42', 0.35);
    const hot = computeThermalMirageSample('mg42', 0.72);
    const glowing = computeThermalMirageSample('mg42', 1.0);

    expect(warm.active).toBe(true);
    expect(hot.active).toBe(true);
    expect(glowing.active).toBe(true);
    expect(hot.opacity).toBeGreaterThan(warm.opacity);
    expect(glowing.opacity).toBeGreaterThan(hot.opacity);
    expect(glowing.opacity).toBeLessThanOrEqual(0.25);
    expect(glowing.riseSpeed).toBeGreaterThan(warm.riseSpeed);

    // 1:1 tank barrel scales convection sway larger than small arms
    const tankHot = computeThermalMirageSample('ztz99a', 0.8);
    expect(tankHot.active).toBe(true);
    expect(tankHot.swayAmplitudeCm).toBeGreaterThan(hot.swayAmplitudeCm * 5);

    // Zero-GC scratch helper
    const scratch = computeThermalMirageSample('ak15', 0);
    const sameRef = writeThermalMirageSampleInto('ak15', 0.65, scratch);
    expect(sameRef).toBe(scratch);
    expect(scratch.active).toBe(true);
  });

  it('remains strictly disabled for compound archery exhibits regardless of heat input', () => {
    for (const id of ['lift33', 'r500'] as const) {
      for (const h of [0, 0.35, 0.75, 1.0]) {
        const s = computeThermalMirageSample(id, h);
        expect(s.active, `${id} heat=${h}`).toBe(false);
        expect(s.opacity).toBe(0);
      }
    }
  });
});

describe('Cycle 9B.3 — Grounded Spent-Brass Contact Shadow Discs', () => {
  it('projects shadows onto floorY + 0.03 and sharpens opacity & footprint as casings settle', () => {
    const floorY = -24.05;
    const grounded = computeBrassContactShadowSample(floorY, floorY, 2.44, 0.52, 0);
    const lowBounce = computeBrassContactShadowSample(floorY, floorY + 4.0, 2.44, 0.52, 0);
    const midAir = computeBrassContactShadowSample(floorY, floorY + 14.0, 2.44, 0.52, 0);
    const highArc = computeBrassContactShadowSample(floorY, floorY + 32.0, 2.44, 0.52, 0);

    expect(grounded.y).toBeCloseTo(floorY + 0.03, 5);
    expect(lowBounce.y).toBeCloseTo(floorY + 0.03, 5);
    expect(midAir.y).toBeCloseTo(floorY + 0.03, 5);

    // Opacity decreases monotonically with height above floor
    expect(grounded.opacity).toBeGreaterThan(0.5);
    expect(grounded.opacity).toBeGreaterThan(lowBounce.opacity);
    expect(lowBounce.opacity).toBeGreaterThan(midAir.opacity);
    expect(midAir.opacity).toBeGreaterThan(highArc.opacity);

    // Penumbra spreads wider as casing lifts off the mat
    expect(lowBounce.scaleX).toBeGreaterThan(grounded.scaleX);
    expect(midAir.scaleX).toBeGreaterThan(lowBounce.scaleX);
    expect(midAir.scaleZ).toBeGreaterThan(grounded.scaleZ);

    // Vertically pitched tumbling casing foreshortens its elliptical shadow length
    const upright = computeBrassContactShadowSample(
      floorY,
      floorY + 4.0,
      2.44,
      0.52,
      Math.PI / 2
    );
    expect(upright.scaleX).toBeLessThan(lowBounce.scaleX);

    // Zero-GC scratch helper
    const scratch = { y: 0, opacity: 0, scaleX: 0, scaleZ: 0 };
    const ret = writeBrassContactShadowSampleInto(
      floorY,
      floorY + 0.3,
      2.44,
      0.52,
      0,
      scratch
    );
    expect(ret).toBe(scratch);
    expect(scratch.y).toBeCloseTo(floorY + 0.03, 5);
  });

  it('paints a radial linear alpha gradient cleanly onto Canvas2D contexts', () => {
    const mock = createMockCanvas2dContext(64, 64);
    expect(() => paintBrassContactShadowAlpha(mock.ctx, 64)).not.toThrow();
    expect(mock.radialGradientCalls).toBe(1);
  });
});

describe('Cycle 9B.4 — Gunsmith Neoprene Mat 0–60 cm Millimeter Vernier, Fastener Ticks & Magnetic Dish Rim', () => {
  it('builds 601 millimeter Vernier ticks (0–60 cm) with accurate 1 mm / 5 mm / 10 mm / 5 cm graduations', () => {
    const ticks = buildMillimeterVernierTicks(600);
    expect(ticks).toHaveLength(601);
    expect(ticks[0]).toEqual({ mm: 0, kind: 'major_cm', label: '0' });
    expect(ticks[1]).toEqual({ mm: 1, kind: 'mm', label: null });
    expect(ticks[5]).toEqual({ mm: 5, kind: 'half_cm', label: null });
    expect(ticks[10]).toEqual({ mm: 10, kind: 'cm', label: null });
    expect(ticks[50]).toEqual({ mm: 50, kind: 'major_cm', label: '5' });
    expect(ticks[600]).toEqual({ mm: 600, kind: 'major_cm', label: '60' });

    expect(CORNER_FASTENER_FIDUCIALS).toHaveLength(4);
    expect(METRIC_FASTENER_GAUGES.map((g) => g.label)).toEqual([
      'M2.5',
      'M3',
      'M4',
      'M5',
    ]);
    for (let i = 1; i < METRIC_FASTENER_GAUGES.length; i++) {
      expect(METRIC_FASTENER_GAUGES[i].radiusCm).toBeGreaterThan(
        METRIC_FASTENER_GAUGES[i - 1].radiusCm
      );
    }
  });

  it('builds a finite brushed-steel magnetic parts dish rim encircling the circular magnetic bowl', () => {
    const geos = buildTakedownMatGeometries();
    try {
      const rim = geos.magneticDishRim;
      const pos = rim.getAttribute('position');
      expect(pos).toBeDefined();
      expect(pos.count).toBeGreaterThan(100);
      for (let i = 0; i < pos.array.length; i++) {
        expect(Number.isFinite(pos.array[i])).toBe(true);
      }

      rim.computeBoundingBox();
      const bb = rim.boundingBox!;
      const magBowl = TAKEDOWN_MAT_SPEC.trayCompartments.find(
        (c) => c.id === 'magnetic_bowl'
      )!;
      const cx = (bb.min.x + bb.max.x) * 0.5;
      const cz = (bb.min.z + bb.max.z) * 0.5;
      expect(cx).toBeCloseTo(magBowl.cx, 1);
      expect(cz).toBeCloseTo(magBowl.cz, 1);
      expect(bb.max.y).toBeGreaterThan(TAKEDOWN_MAT_SPEC.thicknessCm);
      expect(bb.max.y).toBeLessThan(TAKEDOWN_MAT_SPEC.thicknessCm + 0.15);
    } finally {
      geos.slab.dispose();
      geos.lip.dispose();
      geos.trayFloor.dispose();
      geos.magneticDishRim.dispose();
    }
  });

  it('paints the 0–60 cm millimeter Vernier rule and M2.5–M5 fastener marks cleanly in both albedo and roughness', () => {
    const albedoMock = createMockCanvas2dContext(512, 256);
    paintGunsmithMatAlbedo(albedoMock.ctx, 512, 256, 'gunsmith_bench');
    expect(
      albedoMock.drawnTexts.some((t) => t.includes('0–60 cm · VERNIER mm'))
    ).toBe(true);
    expect(albedoMock.drawnTexts).toContain('60');
    expect(albedoMock.drawnTexts).toContain('M2.5');
    expect(albedoMock.drawnTexts).toContain('M5');

    const roughMock = createMockCanvas2dContext(256, 128);
    expect(() =>
      paintGunsmithMatRoughness(roughMock.ctx, 256, 128)
    ).not.toThrow();
    expect(
      roughMock.drawnTexts.some((t) => t.includes('0–60 cm · VERNIER mm'))
    ).toBe(true);
  });
});

describe('Cycle 9B — Zero-GC useFrame, Linear ColorSpace Lock & GPU Disposal Hygiene', () => {
  it('guarantees zero `new THREE.` allocations inside useFrame across all 3 touched VFX/stage modules', () => {
    const files = [
      'src/engine/actors/GasFlowVisualizer.tsx',
      'src/engine/actors/BallisticsSystem.tsx',
      'src/engine/canvas/GunsmithStageMat.tsx',
    ];

    for (const rel of files) {
      const src = fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');
      const useFrameBody = extractAllUseFrameBodies(src);
      expect(useFrameBody.length, `${rel} useFrame`).toBeGreaterThan(100);
      expect(useFrameBody, `${rel} Zero-GC useFrame`).not.toMatch(
        /\bnew THREE\./
      );
    }
  });

  it('disposes all newly allocated shaders/geometries/textures and locks linear CanvasTexture colorSpace', () => {
    const gasSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/actors/GasFlowVisualizer.tsx'),
      'utf8'
    );
    expect(gasSrc).toContain('shockPrimaryMat.dispose()');
    expect(gasSrc).toContain('shockDustMat.dispose()');
    expect(gasSrc).toContain('mirageMats[i].dispose()');

    const ballisticsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
      'utf8'
    );
    expect(ballisticsSrc).toContain('lockLinearTextureColorSpace(tex)');
    expect(ballisticsSrc).toContain('casingShadowGeo.dispose()');
    expect(ballisticsSrc).toContain('casingShadowAlphaTex?.dispose()');

    const matSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src/engine/canvas/GunsmithStageMat.tsx'),
      'utf8'
    );
    expect(matSrc).toContain('geos.magneticDishRim.dispose()');
    expect(matSrc).toContain('lockLinearTextureColorSpace(tex)');
  });
});

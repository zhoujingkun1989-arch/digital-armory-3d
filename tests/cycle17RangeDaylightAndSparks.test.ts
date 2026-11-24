import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  RANGE_IMPACT_BURST_MAX_WINDOW_S,
  RANGE_IMPACT_SPARK_COUNT,
  RANGE_IMPACT_SPARK_WINDOW_S,
  computeRangeImpactBurstState,
  createMutableRangeImpactBurstState,
  createMutableRangeSparkParticle,
  evaluateRangeSparkParticleInto,
  resolveRange3DThemePalette,
  writeRangeImpactBurstStateInto,
} from '../src/features/ballistics/range3DMath';

const ROOT = path.resolve(__dirname, '..');

function extractAllUseFrameBodies(source: string): string {
  const bodies: string[] = [];
  let idx = 0;
  while (idx < source.length) {
    const start = source.indexOf('useFrame(', idx);
    if (start === -1) break;
    const arrow = source.indexOf('=>', start);
    if (arrow === -1) break;
    const open = source.indexOf('{', arrow);
    if (open === -1) break;
    let depth = 0;
    let end = open;
    for (let i = open; i < source.length; i++) {
      const ch = source[i];
      if (ch === '{') depth++;
      else if (ch === '}') {
        depth--;
        if (depth === 0) {
          end = i + 1;
          break;
        }
      }
    }
    bodies.push(source.slice(open, end));
    idx = end;
  }
  return bodies.join('\n');
}

describe('Cycle 17C — 1,000m Proving Ground AR500 Impact Spark Burst, Berm Dust & Bright Alpine Daylight Sky Sync', () => {
  it('computes AR500 steel impact spark burst & berm dust cleanly, suppresses metallic sparks on gelatin, and hides pre-impact / post-decay', () => {
    expect(RANGE_IMPACT_SPARK_COUNT).toBe(28);
    expect(RANGE_IMPACT_SPARK_WINDOW_S).toBeCloseTo(0.55, 4);
    expect(RANGE_IMPACT_BURST_MAX_WINDOW_S).toBeCloseTo(0.6, 4);

    // 1. Pre-impact & invalid timings stay strictly inactive
    expect(computeRangeImpactBurstState(0.45, 0.8, false).active).toBe(false);
    expect(computeRangeImpactBurstState(0.45, 0.8, true).active).toBe(false);
    expect(computeRangeImpactBurstState(Number.NaN, 0.8, false).active).toBe(
      false
    );
    expect(
      computeRangeImpactBurstState(1.0, Number.POSITIVE_INFINITY, false).active
    ).toBe(false);

    // 2. AR500 Steel Gong hit peaks immediately at impact and decays smoothly over 0.55s
    const steelImpact = computeRangeImpactBurstState(0.8, 0.8, false);
    expect(steelImpact.active).toBe(true);
    expect(steelImpact.sparkIntensity01).toBeCloseTo(1.0, 5);
    expect(steelImpact.gelVaporIntensity01).toBe(0);

    const steelEarly = computeRangeImpactBurstState(0.86, 0.8, false);
    const steelMid = computeRangeImpactBurstState(1.05, 0.8, false);
    const steelLate = computeRangeImpactBurstState(1.3, 0.8, false);
    expect(steelEarly.sparkIntensity01).toBeGreaterThan(
      steelMid.sparkIntensity01
    );
    expect(steelMid.sparkIntensity01).toBeGreaterThan(
      steelLate.sparkIntensity01
    );
    expect(steelLate.sparkIntensity01).toBeGreaterThan(0);
    expect(steelEarly.bermDustIntensity01).toBeGreaterThan(0.2);

    // After 0.6s decay window, burst is strictly inactive
    const steelExpired = computeRangeImpactBurstState(1.45, 0.8, false);
    expect(steelExpired.active).toBe(false);
    expect(steelExpired.sparkIntensity01).toBe(0);
    expect(steelExpired.bermDustIntensity01).toBe(0);

    // 3. 10% Ballistic Gelatin suppresses metallic sparks and fires entry vapor/mist shock flash
    const gelEarly = computeRangeImpactBurstState(0.85, 0.8, true);
    expect(gelEarly.active).toBe(true);
    expect(gelEarly.sparkIntensity01).toBe(0);
    expect(gelEarly.bermDustIntensity01).toBe(0);
    expect(gelEarly.gelVaporIntensity01).toBeGreaterThan(0.5);
    expect(gelEarly.gelVaporScale01).toBeGreaterThan(0.15);

    const gelExpired = computeRangeImpactBurstState(1.45, 0.8, true);
    expect(gelExpired.active).toBe(false);
    expect(gelExpired.gelVaporIntensity01).toBe(0);

    // 4. Zero-GC in-place mutation preserves caller scratch identity
    const scratch = createMutableRangeImpactBurstState();
    const ref = writeRangeImpactBurstStateInto(0.92, 0.8, false, scratch);
    expect(ref).toBe(scratch);
    expect(scratch.active).toBe(true);
    expect(scratch.sparkIntensity01).toBeGreaterThan(0.5);
  });

  it('fans 28 golden-white AR500 sparks radially across plate face with gravity arc and hides them pre-impact / on gelatin', () => {
    const out = createMutableRangeSparkParticle();

    // Pre-impact & gelatin strictly hide all 28 sparks
    const preBurst = computeRangeImpactBurstState(0.5, 0.8, false);
    const gelBurst = computeRangeImpactBurstState(0.85, 0.8, true);
    for (let i = 0; i < RANGE_IMPACT_SPARK_COUNT; i++) {
      expect(
        evaluateRangeSparkParticleInto(preBurst, 300, 1.65, 0, i, false, out)
          .visible
      ).toBe(false);
      expect(
        evaluateRangeSparkParticleInto(gelBurst, 300, 1.65, 0, i, false, out)
          .visible
      ).toBe(false);
    }

    // Active steel hit: all 28 sparks visible at t = +0.08s, fanning +Z and -Z, bouncing -X off plate
    const hitBurst = computeRangeImpactBurstState(0.88, 0.8, false);
    let visibleCount = 0;
    let posZCount = 0;
    let negZCount = 0;
    for (let i = 0; i < RANGE_IMPACT_SPARK_COUNT; i++) {
      const ref = evaluateRangeSparkParticleInto(
        hitBurst,
        300,
        1.65,
        0,
        i,
        false,
        out
      );
      expect(ref).toBe(out);
      if (out.visible) {
        visibleCount++;
        expect(out.x).toBeLessThan(300);
        expect(out.y).toBeGreaterThanOrEqual(0.04);
        expect(out.scaleX).toBeGreaterThan(out.scaleY);
        expect(out.heat01).toBeGreaterThan(0);
        if (out.z > 0) posZCount++;
        if (out.z < 0) negZCount++;
      }
    }
    expect(visibleCount).toBe(RANGE_IMPACT_SPARK_COUNT);
    expect(posZCount).toBeGreaterThanOrEqual(10);
    expect(negZCount).toBeGreaterThanOrEqual(10);

    // Heavy armor target scales sparks proportionally larger for Target-Cam PIP legibility
    const smallScale = evaluateRangeSparkParticleInto(
      hitBurst,
      300,
      1.65,
      0,
      0,
      false,
      out
    ).scaleX;
    const armorScale = evaluateRangeSparkParticleInto(
      hitBurst,
      300,
      1.65,
      0,
      0,
      true,
      out
    ).scaleX;
    expect(armorScale).toBeGreaterThan(smallScale * 1.5);
  });

  it('resolves Bright Alpine Morning sky palette for blueprint_daylight while preserving Dark Twilight unchanged', () => {
    const alpine = resolveRange3DThemePalette('blueprint_daylight');
    const dark = resolveRange3DThemePalette('tactical_vault');
    const bench = resolveRange3DThemePalette('gunsmith_bench');

    expect(alpine.isAlpineDaylight).toBe(true);
    expect(alpine.skyZenithHex).toBe('#dce8f5');
    expect(alpine.skyHorizonHex).toBe('#eff5fc');
    expect(alpine.backgroundHex).toBe('#dce8f5');
    expect(alpine.fogHex).toBe('#eff5fc');
    expect(alpine.sunKeyIntensity).toBeGreaterThan(dark.sunKeyIntensity);
    expect(alpine.hemiIntensity).toBeGreaterThan(dark.hemiIntensity);

    expect(dark.isAlpineDaylight).toBe(false);
    expect(bench.isAlpineDaylight).toBe(false);
    expect(dark.skyZenithHex).toBe('#070e1c');
    expect(dark.backgroundHex).toBe('#162033');
    expect(dark.fogHex).toBe('#26344a');
  });

  it('maintains Zero-GC useFrame, linear bump texture colorSpace lock, GPU disposal & Cycle 4C/14A compatibility', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/features/ballistics/Range3DScene.tsx'),
      'utf8'
    );

    const useFrameBodies = extractAllUseFrameBodies(src);
    expect(useFrameBodies.length).toBeGreaterThan(1000);
    expect(useFrameBodies).not.toMatch(/\bnew\s+THREE\./);
    expect(useFrameBodies).toContain('writeRangeImpactBurstStateInto');
    expect(useFrameBodies).toContain('evaluateRangeSparkParticleInto');

    // Explicit disposal of all Cycle 17C & existing GPU resources + linear colorSpace lock
    expect(src).toContain('impactBurstAssets.sparkGeo.dispose()');
    expect(src).toContain('impactBurstAssets.sparkMat.dispose()');
    expect(src).toContain('impactBurstAssets.bermDustGeo.dispose()');
    expect(src).toContain('impactBurstAssets.bermDustMat.dispose()');
    expect(src).toContain('impactBurstAssets.gelVaporGeo.dispose()');
    expect(src).toContain('impactBurstAssets.gelVaporMat.dispose()');
    expect(src).toContain('lockLinearTextureColorSpace(bumpTex)');
    expect(src).toContain('useAppStore((s) => s.environmentPreset)');
    expect(src).toContain('resolveRange3DThemePalette');

    // Cycle 4C Target-Cam PIP & Cycle 14A Schlieren Fresnel Mach-Cone preserved 100% intact
    expect(src).toContain('computeTargetCamPipRectInto');
    expect(src).toContain('SCHLIEREN_MACH_CONE_FRAG');
    expect(src).toContain('machConeAssets.outerGeo.dispose()');

    // Verify gel entry vapor cone opens outward toward -X (bbox X in [-1, 0]) and never into the gel block (+X)
    expect(src).toContain('gelVaporGeo.rotateZ(-Math.PI / 2)');
    const verifyCone = new THREE.ConeGeometry(1, 1, 18, 1, true);
    verifyCone.translate(0, -0.5, 0);
    verifyCone.rotateZ(-Math.PI / 2);
    verifyCone.computeBoundingBox();
    expect(verifyCone.boundingBox!.min.x).toBeCloseTo(-1, 4);
    expect(verifyCone.boundingBox!.max.x).toBeCloseTo(0, 4);
    verifyCone.dispose();
  });
});

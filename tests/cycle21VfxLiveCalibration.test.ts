import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  computeChamberFlashEnvelope,
  writeChamberFlashEnvelopeInto,
} from '../src/engine/actors/BallisticsSystem';
import {
  computeInBoreDeflagrationSample,
  computeRotaryBlurHaloSample,
  resolveLiveInBoreTravelRatio,
} from '../src/engine/actors/GasFlowVisualizer';
import { computeRiflingBoreBounds } from '../src/engine/ballistics/riflingSpecs';

const ROOT = path.resolve(__dirname, '..');

describe('Cycle 21C — Live WebGL VFX Alignment & Calibration Regressions', () => {
  it('constrains chamberFlashRef strictly inside the sliced bore wall during Z-cutaway in-bore deflagration so no oversized orange sphere protrudes from steel receivers', () => {
    for (const { weaponId, caliber, isTank } of [
      { weaponId: 'ak15' as const, caliber: '762_m43' as const, isTank: false },
      { weaponId: 'm4a1' as const, caliber: '556_nato' as const, isTank: false },
      { weaponId: 'mp5' as const, caliber: '9mm_para' as const, isTank: false },
      { weaponId: 'm1a2' as const, caliber: '120mm_apfsds' as const, isTank: true },
    ]) {
      const bounds = computeRiflingBoreBounds(weaponId)!;
      const inBoreRadius = bounds.boreRadiusCm * 0.88;

      const cutawayEnv = computeChamberFlashEnvelope(
        caliber,
        0.95,
        isTank,
        true,
        inBoreRadius
      );
      const xrayEnv = computeChamberFlashEnvelope(
        caliber,
        0.95,
        isTank,
        false,
        inBoreRadius
      );

      // SphereGeometry base radius is 0.52 -> rendered Y radius is scaleY * 0.52
      const renderedCutawayRadiusCm = cutawayEnv.scaleY * 0.52;
      expect(
        renderedCutawayRadiusCm,
        `${weaponId} cutaway chamber glow radius must stay strictly within bore`
      ).toBeLessThanOrEqual(bounds.boreRadiusCm * 1.05);
      expect(cutawayEnv.opacity).toBeGreaterThan(0);
      expect(cutawayEnv.opacity).toBeLessThan(xrayEnv.opacity);
      expect(cutawayEnv.scaleY).toBeLessThan(xrayEnv.scaleY);

      // Zero intensity stays strictly hidden
      const idle = computeChamberFlashEnvelope(caliber, 0, isTank, true, inBoreRadius);
      expect(idle.opacity).toBe(0);
      expect(idle.scaleY).toBe(0);
    }

    // Zero-GC scratch reuse
    const scratch = { scaleX: 0, scaleY: 0, scaleZ: 0, opacity: 0 };
    const ret = writeChamberFlashEnvelopeInto('762_m43', 0.8, false, true, 0.32, scratch);
    expect(ret).toBe(scratch);
    expect(scratch.opacity).toBeGreaterThan(0);
  });

  it('locks Cycle 15A in-bore propellant plasma flush to the live 3D projectile base with zero dark gap (small arms & 1:1 MBTs)', () => {
    // AK-15 mid-bore: bullet at 11.1 cm (base at 10.55 cm), chamber 5.4 -> muzzle 25.5
    const akRatio = resolveLiveInBoreTravelRatio(
      11.1,
      5.4,
      25.5,
      0.19,
      0.235,
      0.295,
      0.55
    );
    expect(akRatio).toBeCloseTo((10.55 - 5.4) / (25.5 - 5.4), 4);
    expect(akRatio).toBeGreaterThan(0.24);

    // M1A2 120mm sabot in-bore: dart at 299.6 cm (obturator base at 290.2 cm), chamber 54 -> muzzle 581
    const m1a2Ratio = resolveLiveInBoreTravelRatio(
      299.6,
      54,
      581,
      0.32,
      0.145,
      0.19,
      9.4
    );
    expect(m1a2Ratio).toBeCloseTo((290.2 - 54) / (581 - 54), 4);
    expect(m1a2Ratio).toBeGreaterThan(0.43);

    const m1a2Sample = computeInBoreDeflagrationSample(
      'm1a2',
      0.145,
      0.55,
      m1a2Ratio,
      true
    );
    expect(m1a2Sample.active).toBe(true);
    expect(m1a2Sample.columnActive).toBe(true);
    expect(m1a2Sample.columnEndX).toBeGreaterThan(260);

    // Post-muzzle blowdown clamps cleanly to 1.0; static rest returns 0
    expect(
      resolveLiveInBoreTravelRatio(400, 54, 581, 0.8, 0.21, 0.19, 9.4)
    ).toBe(1);
    expect(
      resolveLiveInBoreTravelRatio(54, 54, 581, 0, 0, 0.19, 9.4)
    ).toBe(0);
    // Null/unloaded plugin falls back smoothly
    expect(
      resolveLiveInBoreTravelRatio(null, 54, 581, 0.42, 0.14, 0.19, 9.4)
    ).toBeCloseTo(0.42, 5);
  });

  it('maintains crisp calibrated rotary blur visibility at 0.5x & 1.0x and valid GLSL smoothstep ordering across upgraded shaders', () => {
    const gau8Half = computeRotaryBlurHaloSample('gau8', true, 0.45, 0.5, 0.2);
    const gau8Full = computeRotaryBlurHaloSample('gau8', true, 0.45, 1.0, 0.2);
    expect(gau8Half.opacity).toBeGreaterThan(0.25);
    expect(gau8Full.opacity).toBeGreaterThan(gau8Half.opacity);
    expect(gau8Full.opacity).toBeLessThanOrEqual(0.45);

    const gasSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/GasFlowVisualizer.tsx'),
      'utf8'
    );
    const ballisticsSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
      'utf8'
    );
    expect(gasSrc).toContain('resolveLiveInBoreTravelRatio');
    expect(gasSrc).toContain('smoothstep(0.18, 0.86, fbm)');
    expect(ballisticsSrc).toContain('writeChamberFlashEnvelopeInto');
    expect(ballisticsSrc).toContain('BLAST_SHOCK_SHELL_FRAG_GLSL');
    expect(ballisticsSrc).toContain('blastShellMat.dispose()');
  });
});

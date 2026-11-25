import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  IN_BORE_RADIUS_CLEARANCE_SCALE,
  IN_BORE_TEMP_EMBER_K,
  IN_BORE_TEMP_EXPANSION_K,
  IN_BORE_TEMP_PEAK_K,
  computeInBoreDeflagrationSample,
  createMutableInBoreDeflagrationSample,
  inBoreColorTempToRgbInto,
  writeInBoreDeflagrationSampleInto,
} from '../src/engine/actors/GasFlowVisualizer';
import { computeChamberIgnitionBounceIntensity } from '../src/engine/actors/BallisticsSystem';
import { computeRiflingBoreBounds } from '../src/engine/ballistics/riflingSpecs';
import {
  createInternalBallisticsSample,
  evaluateInternalBallisticsInto,
  getWeaponFiringTiming,
  isArcheryWeapon,
} from '../src/engine/physics/armoryPhysics';
import { WEAPON_MANIFESTS, getWeaponManifest } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

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

describe('Cycle 15A — Real-Time 3D In-Bore Propellant Deflagration Glow & Boxer Primer Ignition Spark', () => {
  it('stays strictly inactive at t=0 rest, when cutaway Z is off, when exploded >= 0.04, and on archery exhibits', () => {
    const timingAk = getWeaponFiringTiming('ak15');
    const midBoreF = (timingAk.ignitionF + timingAk.muzzleExitF) * 0.5;

    // 1. Static rest (fireProgress = 0, negative, NaN, or post-blowdown)
    expect(computeInBoreDeflagrationSample('ak15', 0, 1, 0.5, true).active).toBe(
      false
    );
    expect(
      computeInBoreDeflagrationSample('ak15', -0.2, 1, 0.5, true).active
    ).toBe(false);
    expect(
      computeInBoreDeflagrationSample('ak15', Number.NaN, 1, 0.5, true).active
    ).toBe(false);
    expect(
      computeInBoreDeflagrationSample('ak15', 0.96, 0.05, 1, true).active
    ).toBe(false);

    // 2. Opaque / non-Z cutaway (`isCutawayZ === false`)
    expect(
      computeInBoreDeflagrationSample('ak15', midBoreF, 0.9, 0.45, false).active
    ).toBe(false);

    // 3. Exploded disassembly (`explodeProgress >= 0.04`)
    expect(
      computeInBoreDeflagrationSample('ak15', midBoreF, 0.9, 0.45, true, 0.04)
        .active
    ).toBe(false);
    expect(
      computeInBoreDeflagrationSample('ak15', midBoreF, 0.9, 0.45, true, 0.65)
        .active
    ).toBe(false);

    // 4. Compound archery (`lift33`, `r500`) strictly inactive across all phases
    for (const archeryId of ['lift33', 'r500'] as const) {
      for (const f of [0.05, 0.12, 0.25, 0.35, 0.5]) {
        const s = computeInBoreDeflagrationSample(archeryId, f, 1, 0.5, true);
        expect(s.active).toBe(false);
        expect(s.columnActive).toBe(false);
        expect(s.primerFlashIntensity01).toBe(0);
        expect(s.columnIntensity01).toBe(0);
      }
    }
  });

  it('fires intense Boxer primer spark at ignition onset and expands monotonic deflagration plasma inside [chamberX..muzzleX] across small arms, GAU-8 & 1:1 MBTs', () => {
    const featured: readonly WeaponId[] = [
      'm1911',
      'ak15',
      'k98k',
      'gau8',
      'ztz99a',
    ];
    const ibSample = createInternalBallisticsSample('556_nato');

    for (const weaponId of featured) {
      const bounds = computeRiflingBoreBounds(weaponId);
      expect(bounds).not.toBeNull();
      const timing = getWeaponFiringTiming(weaponId);
      const caliber = getWeaponManifest(weaponId).caliberProfile;

      // Boxer primer flash peaks sharply right at ignition onset and decays rapidly
      const primerPeak = computeInBoreDeflagrationSample(
        weaponId,
        timing.ignitionF + 0.005,
        0.15,
        0.02,
        true
      );
      expect(primerPeak.active).toBe(true);
      expect(primerPeak.primerFlashIntensity01).toBeGreaterThan(0.85);
      expect(primerPeak.primerFlashX).toBeLessThanOrEqual(primerPeak.chamberX);

      const primerDecayed = computeInBoreDeflagrationSample(
        weaponId,
        timing.ignitionF + 0.05,
        0.85,
        0.4,
        true
      );
      expect(primerDecayed.primerFlashIntensity01).toBeLessThan(0.12);

      // Live internal ballistics mid-bore check + strict clearance inside sliced rifling bore
      const midF = (timing.ignitionF + timing.muzzleExitF) * 0.5;
      evaluateInternalBallisticsInto(caliber, midF, ibSample, timing);
      const midSample = computeInBoreDeflagrationSample(
        weaponId,
        midF,
        ibSample.pressure01,
        ibSample.boreTravelRatio,
        true
      );
      expect(midSample.active).toBe(true);
      expect(midSample.columnActive).toBe(true);
      expect(midSample.columnIntensity01).toBeGreaterThan(0.25);
      expect(midSample.columnRadiusCm).toBeCloseTo(
        bounds!.boreRadiusCm * IN_BORE_RADIUS_CLEARANCE_SCALE,
        5
      );
      expect(midSample.columnRadiusCm).toBeLessThan(bounds!.boreRadiusCm);
      expect(midSample.boreY).toBeCloseTo(bounds!.boreY, 5);
      expect(midSample.boreZ).toBeCloseTo(bounds!.boreZ, 5);

      // Column length expands strictly monotonically with boreTravelRatio01 and stays clamped in [chamberX..muzzleX]
      let prevLen = -1;
      for (const travel of [0.05, 0.25, 0.5, 0.75, 1.0]) {
        const s = computeInBoreDeflagrationSample(
          weaponId,
          midF,
          0.75,
          travel,
          true
        );
        const len = s.columnEndX - s.columnStartX;
        expect(len).toBeGreaterThan(prevLen);
        expect(s.columnStartX).toBeGreaterThanOrEqual(s.chamberX - 1e-6);
        expect(s.columnEndX).toBeLessThanOrEqual(s.muzzleX + 1e-6);
        prevLen = len;
      }

      // Extreme out-of-range travel clamps cleanly inside [chamberX..muzzleX]
      const over = computeInBoreDeflagrationSample(
        weaponId,
        midF,
        0.75,
        2.5,
        true
      );
      expect(over.columnEndX).toBeCloseTo(over.muzzleX, 5);
      const under = computeInBoreDeflagrationSample(
        weaponId,
        midF,
        0.75,
        -0.5,
        true
      );
      expect(under.columnEndX).toBeCloseTo(under.chamberX, 5);
    }

    // All 95 barreled exhibits produce valid positive bore plasma geometry in Z-cutaway
    const allIds: WeaponId[] = WEAPON_MANIFESTS.map((m) => m.id);
    let activeBarreledCount = 0;
    for (const id of allIds) {
      const timing = getWeaponFiringTiming(id);
      const midF = (timing.ignitionF + timing.muzzleExitF) * 0.5;
      const sample = computeInBoreDeflagrationSample(id, midF, 0.8, 0.5, true);
      if (isArcheryWeapon(id)) {
        expect(sample.active).toBe(false);
      } else {
        activeBarreledCount++;
        expect(sample.active, `${id} should be active`).toBe(true);
        expect(sample.columnActive, `${id} columnActive`).toBe(true);
        expect(sample.columnEndX).toBeGreaterThan(sample.columnStartX);
        expect(sample.columnRadiusCm).toBeGreaterThan(0);
      }
    }
    expect(activeBarreledCount).toBe(95);
  });

  it('maps pressure ratio monotonically from 3,200K incandescent white-gold -> 1,900K burnt orange -> ember glow with Zero-GC scratch reuse', () => {
    const timing = getWeaponFiringTiming('ak15');
    const midF = (timing.ignitionF + timing.muzzleExitF) * 0.5;
    const scratch = createMutableInBoreDeflagrationSample();

    const peakRef = writeInBoreDeflagrationSampleInto(
      'ak15',
      midF,
      1.0,
      0.35,
      true,
      scratch
    );
    expect(peakRef).toBe(scratch);
    const peakTemp = scratch.colorTempK;
    expect(peakTemp).toBe(IN_BORE_TEMP_PEAK_K);

    const expandRef = writeInBoreDeflagrationSampleInto(
      'ak15',
      midF,
      0.22,
      0.65,
      true,
      scratch
    );
    expect(expandRef).toBe(scratch);
    const expandTemp = scratch.colorTempK;
    expect(expandTemp).toBeGreaterThanOrEqual(IN_BORE_TEMP_EXPANSION_K - 80);
    expect(expandTemp).toBeLessThanOrEqual(IN_BORE_TEMP_EXPANSION_K + 120);

    writeInBoreDeflagrationSampleInto(
      'ak15',
      timing.muzzleExitF + 0.04,
      0.05,
      1.0,
      true,
      scratch
    );
    const emberTemp = scratch.colorTempK;
    expect(emberTemp).toBeGreaterThanOrEqual(IN_BORE_TEMP_EMBER_K);
    expect(emberTemp).toBeLessThan(expandTemp);
    expect(expandTemp).toBeLessThan(peakTemp);

    // Zero-GC color ramp: white-gold (3200K) has higher blue/green channel than burnt orange (1900K) > ember (1150K)
    const c = new THREE.Color();
    const cPeak = inBoreColorTempToRgbInto(IN_BORE_TEMP_PEAK_K, c).clone();
    const cExp = inBoreColorTempToRgbInto(IN_BORE_TEMP_EXPANSION_K, c).clone();
    const cEmber = inBoreColorTempToRgbInto(IN_BORE_TEMP_EMBER_K, c).clone();
    expect(cPeak.b).toBeGreaterThan(cExp.b);
    expect(cPeak.g).toBeGreaterThan(cExp.g);
    expect(cExp.g).toBeGreaterThan(cEmber.g);
  });

  it('enforces Zero-GC useFrame, GTAO exclusion, valid GLSL smoothstep, GPU disposal & Cycle 3A chamber light compatibility', () => {
    const gasSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/GasFlowVisualizer.tsx'),
      'utf8'
    );
    const ballisticsSrc = fs.readFileSync(
      path.join(ROOT, 'src/engine/actors/BallisticsSystem.tsx'),
      'utf8'
    );

    // Zero `new THREE.` inside any useFrame callback
    expect(extractAllUseFrameBodies(gasSrc)).not.toMatch(/\bnew\s+THREE\./);
    expect(extractAllUseFrameBodies(ballisticsSrc)).not.toMatch(
      /\bnew\s+THREE\./
    );

    // GPU disposal & GTAO exclusion on newly added plasma & primer spark shaders
    expect(gasSrc).toContain('inBorePlasmaMat.dispose()');
    expect(gasSrc).toContain('primerSparkMat.dispose()');
    expect(gasSrc).toContain('name="InBorePropellantDeflagration"');
    expect(gasSrc).toContain('IN_BORE_PLASMA_FRAG_GLSL');
    expect(gasSrc).toContain('PRIMER_SPARK_FRAG_GLSL');
    expect(gasSrc).not.toContain('smoothstep(1.0, 0.92');

    // Existing Cycle 3A chamber ignition bounce helper remains 100% intact
    expect(
      computeChamberIgnitionBounceIntensity(0.11, '556_nato', false, true, 0.9)
    ).toBeGreaterThan(0);
    expect(
      computeChamberIgnitionBounceIntensity(0.0, '556_nato', false, true, 0.9)
    ).toBe(0);
    expect(
      computeChamberIgnitionBounceIntensity(0.11, 'arrow_400gr', true, true, 1)
    ).toBe(0);
  });
});

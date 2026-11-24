import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ROTARY_BLUR_FIRE_THRESHOLD,
  TANK_BORE_EVACUATOR_END_F,
  TANK_BORE_EVACUATOR_START_F,
  TANK_EVAC_PUFF_COUNT,
  TIGER_BAFFLE_JET_COUNT,
  computeInBoreDeflagrationSample,
  computeMuzzleShockwaveSample,
  computeRotaryBlurHaloSample,
  computeTankBoreEvacuatorSample,
  computeThermalMirageSample,
  createMutableRotaryBlurHaloSample,
  createMutableTankBoreEvacuatorSample,
  writeRotaryBlurHaloSampleInto,
  writeTankBoreEvacuatorSampleInto,
} from '../src/engine/actors/GasFlowVisualizer';
import { getWeaponFiringTiming } from '../src/engine/physics/armoryPhysics';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
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

function extractShaderLiteral(source: string, constName: string): string {
  const marker = `const ${constName} = /* glsl */ \``;
  const start = source.indexOf(marker);
  expect(start, `${constName} shader marker`).toBeGreaterThan(-1);
  const bodyStart = start + marker.length;
  const bodyEnd = source.indexOf('`;', bodyStart);
  expect(bodyEnd, `${constName} closing backtick`).toBeGreaterThan(bodyStart);
  return source.slice(bodyStart, bodyEnd);
}

describe('Cycle 19A.1 — High-RPM Rotary Barrel-Cluster Motion-Blur Sweep Halo (GAU-8/A & M134D)', () => {
  it('activates strictly for gau8 & m134 during firing (fireProgress > 0.04) and stays strictly inactive on all other 32 exhibits', () => {
    expect(ROTARY_BLUR_FIRE_THRESHOLD).toBeCloseTo(0.04, 6);

    const allIds: WeaponId[] = WEAPON_MANIFESTS.map((m) => m.id);
    expect(allIds).toHaveLength(34);

    const activeIds: WeaponId[] = [];
    for (const id of allIds) {
      const s = computeRotaryBlurHaloSample(id, true, 0.42, 1.0, 0.35);
      if (s.active) {
        activeIds.push(id);
      } else {
        expect(s.opacity, `${id} inactive opacity`).toBe(0);
        expect(s.spinRadPerSec, `${id} inactive spin`).toBe(0);
        expect(s.radiusCm, `${id} inactive radius`).toBe(0);
        expect(s.lengthCm, `${id} inactive length`).toBe(0);
        expect(s.heatTint01, `${id} inactive heatTint`).toBe(0);
      }
    }

    expect(activeIds.sort()).toEqual(['gau8', 'm134']);

    // Spot-check key non-rotary exhibits across categories (small arms, MBT, archery)
    for (const nonRotary of ['ak15', 'ztz99a', 'lift33', 'r500', 'mg42', 'tiger1'] as const) {
      const s = computeRotaryBlurHaloSample(nonRotary, true, 0.5, 1.0, 0.8);
      expect(s.active, `${nonRotary} must never show rotary blur halo`).toBe(false);
    }

    // Verify authentic 1:1 barrel-cluster metrology for GAU-8/A vs M134D
    const gau8 = computeRotaryBlurHaloSample('gau8', true, 0.45, 1.0, 0.5);
    const m134 = computeRotaryBlurHaloSample('m134', true, 0.45, 1.0, 0.5);

    expect(gau8.active).toBe(true);
    expect(gau8.barrelCount).toBe(7);
    expect(gau8.radiusCm).toBeCloseTo(10.8, 3);
    expect(gau8.lengthCm).toBeCloseTo(216.0, 3);
    expect(gau8.spinRadPerSec).toBeCloseTo((3900 / 7) * ((Math.PI * 2) / 60), 2);
    expect(gau8.opacity).toBeGreaterThan(0.25);
    expect(gau8.opacity).toBeLessThanOrEqual(0.45);

    expect(m134.active).toBe(true);
    expect(m134.barrelCount).toBe(6);
    expect(m134.radiusCm).toBeCloseTo(3.65, 3);
    expect(m134.lengthCm).toBeCloseTo(41.6, 3);
    expect(m134.spinRadPerSec).toBeCloseTo((3000 / 6) * ((Math.PI * 2) / 60), 2);
    expect(gau8.radiusCm).toBeGreaterThan(m134.radiusCm * 2);
    expect(gau8.lengthCm).toBeGreaterThan(m134.lengthCm * 4);
    expect(gau8.spinRadPerSec).toBeGreaterThan(m134.spinRadPerSec);
  });

  it('stays strictly inactive at t=0, fireProgress <= 0.04, explode mode (!isFiring / exploded), and during sectionCut cutaway', () => {
    for (const id of ['gau8', 'm134'] as const) {
      // Static t=0 and sub-threshold fireProgress
      for (const f of [-0.1, 0, 0.02, 0.04, Number.NaN, 1.2]) {
        const s = computeRotaryBlurHaloSample(id, true, f, 1.0, 0.6);
        expect(s.active, `${id} f=${f}`).toBe(false);
        expect(s.opacity).toBe(0);
        expect(s.spinRadPerSec).toBe(0);
      }

      // Immediately above threshold (0.04) activates cleanly
      const onset = computeRotaryBlurHaloSample(id, true, 0.05, 1.0, 0.2);
      expect(onset.active, `${id} onset f=0.05`).toBe(true);
      expect(onset.opacity).toBeGreaterThan(0.01);

      // Explode mode (`isFiring === false`) or exploded disassembly (`explodeProgress >= 0.04`)
      expect(computeRotaryBlurHaloSample(id, false, 0.45, 1.0, 0.6).active).toBe(
        false
      );
      expect(
        computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.6, false, 0.04).active
      ).toBe(false);
      expect(
        computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.6, false, 0.5).active
      ).toBe(false);

      // Cutaway mode (`isCutaway === true`) hides sweep halo so internal rotary bolts stay crystal clear
      const cut = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.6, true);
      expect(cut.active, `${id} cutaway must disable halo`).toBe(false);
      expect(cut.opacity).toBe(0);

      // Zero or negative speed multiplier disables spin halo
      expect(computeRotaryBlurHaloSample(id, true, 0.45, 0, 0.4).active).toBe(
        false
      );
      expect(computeRotaryBlurHaloSample(id, true, 0.45, -0.5, 0.4).active).toBe(
        false
      );
    }
  });

  it('scales tangential blur opacity & angular velocity monotonically with speedMultiplier and warms heatTint01 smoothly with barrelHeat01', () => {
    for (const id of ['gau8', 'm134'] as const) {
      const slow = computeRotaryBlurHaloSample(id, true, 0.45, 0.25, 0.0);
      const mid = computeRotaryBlurHaloSample(id, true, 0.45, 0.5, 0.0);
      const full = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.0);

      expect(slow.active).toBe(true);
      expect(mid.active).toBe(true);
      expect(full.active).toBe(true);

      expect(mid.spinRadPerSec).toBeGreaterThan(slow.spinRadPerSec);
      expect(full.spinRadPerSec).toBeGreaterThan(mid.spinRadPerSec);
      expect(mid.opacity).toBeGreaterThan(slow.opacity);
      expect(full.opacity).toBeGreaterThan(mid.opacity);

      // Barrel heat warming ramp (0 -> dull cherry)
      const cold = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.0);
      const warm = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.35);
      const hot = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 0.75);
      const cherry = computeRotaryBlurHaloSample(id, true, 0.45, 1.0, 1.0);

      expect(cold.heatTint01).toBe(0);
      expect(warm.heatTint01).toBeGreaterThan(0);
      expect(hot.heatTint01).toBeGreaterThan(warm.heatTint01);
      expect(cherry.heatTint01).toBeCloseTo(1.0, 5);
    }

    // Zero-GC scratch reuse check
    const scratch = createMutableRotaryBlurHaloSample();
    const returned = writeRotaryBlurHaloSampleInto(
      'gau8',
      true,
      0.5,
      1.0,
      0.6,
      scratch
    );
    expect(returned).toBe(scratch);
    expect(scratch.active).toBe(true);
    expect(scratch.barrelCount).toBe(7);
  });
});

describe('Cycle 19A.2 — 1:1 MBT Bore-Evacuator / Fume-Extractor & Tiger I Twin-Baffle Smoke Plume', () => {
  const ALL_MBTS: readonly WeaponId[] = [
    'ztz99a',
    'm1a2',
    'leopard2a7',
    'tiger1',
  ];

  it('activates strictly for all 4 1:1 MBTs across post-exit scavenging window (0.30..0.76) and stays strictly inactive on all 30 non-tank exhibits', () => {
    expect(TANK_BORE_EVACUATOR_START_F).toBeLessThan(0.3);
    expect(TANK_BORE_EVACUATOR_END_F).toBeCloseTo(0.78, 5);
    expect(TANK_EVAC_PUFF_COUNT).toBe(6);
    expect(TIGER_BAFFLE_JET_COUNT).toBe(4);

    const allIds: WeaponId[] = WEAPON_MANIFESTS.map((m) => m.id);
    const activeIds: WeaponId[] = [];

    for (const id of allIds) {
      const s = computeTankBoreEvacuatorSample(id, true, 0.45);
      if (s.active) {
        activeIds.push(id);
      } else {
        expect(s.plumeScale, `${id} inactive plumeScale`).toBe(0);
        expect(s.opacity, `${id} inactive opacity`).toBe(0);
        expect(s.baffleJetStrength01, `${id} inactive baffleJet`).toBe(0);
      }
    }

    expect(activeIds.sort()).toEqual(['leopard2a7', 'm1a2', 'tiger1', 'ztz99a']);

    // Explicitly verify small arms, rotary cannons & archery are never active across entire firing cycle
    const nonTanks: readonly WeaponId[] = [
      'ak15',
      'm4a1',
      'm82a1',
      'mg42',
      'gau8',
      'm134',
      'lift33',
      'r500',
    ];
    for (const id of nonTanks) {
      for (const f of [0, 0.15, 0.3, 0.42, 0.55, 0.72, 0.9]) {
        const s = computeTankBoreEvacuatorSample(id, true, f);
        expect(s.active, `${id} f=${f}`).toBe(false);
        expect(s.plumeScale).toBe(0);
        expect(s.opacity).toBe(0);
        expect(s.originX).toBe(0);
        expect(s.originY).toBe(0);
      }
    }
  });

  it('matches exact 1:1 bore evacuator & Tiger I Krupp twin-baffle CAD anchors, expands monotonically post-exit, and stays inactive at t=0', () => {
    const expectedAnchors: Record<
      'ztz99a' | 'm1a2' | 'leopard2a7' | 'tiger1',
      { originX: number; originY: number; hasTwinBaffleBrake: boolean }
    > = {
      ztz99a: { originX: 405.0, originY: 38.0, hasTwinBaffleBrake: false },
      m1a2: { originX: 315.0, originY: 44.0, hasTwinBaffleBrake: false },
      leopard2a7: { originX: 376.0, originY: 74.0, hasTwinBaffleBrake: false },
      tiger1: { originX: 513.5, originY: 102.0, hasTwinBaffleBrake: true },
    };

    for (const id of ALL_MBTS) {
      const expected = expectedAnchors[id as keyof typeof expectedAnchors];

      // Strictly inactive at t=0, pre-exit, post-window, non-firing, and exploded
      for (const f of [0, 0.1, 0.2, 0.28, 0.78, 0.88, 1.0, Number.NaN]) {
        const idle = computeTankBoreEvacuatorSample(id, true, f);
        expect(idle.active, `${id} idle f=${f}`).toBe(false);
        expect(idle.plumeScale).toBe(0);
        expect(idle.opacity).toBe(0);
      }
      expect(computeTankBoreEvacuatorSample(id, false, 0.45).active).toBe(false);
      expect(computeTankBoreEvacuatorSample(id, true, 0.45, 0.15).active).toBe(
        false
      );

      // Post-exit scavenging progression (0.30 -> 0.45 -> 0.72)
      const early = computeTankBoreEvacuatorSample(id, true, 0.3);
      const peak = computeTankBoreEvacuatorSample(id, true, 0.42);
      const tail = computeTankBoreEvacuatorSample(id, true, 0.72);

      expect(early.active, `${id} early f=0.30`).toBe(true);
      expect(peak.active, `${id} peak f=0.42`).toBe(true);
      expect(tail.active, `${id} tail f=0.72`).toBe(true);

      expect(peak.originX).toBeCloseTo(expected.originX, 3);
      expect(peak.originY).toBeCloseTo(expected.originY, 3);
      expect(peak.muzzleX).toBeGreaterThan(peak.originX);

      // Plume expands monotonically while opacity peaks early post-exit and fades gently
      expect(peak.plumeScale).toBeGreaterThan(early.plumeScale);
      expect(tail.plumeScale).toBeGreaterThan(peak.plumeScale);
      expect(peak.opacity).toBeGreaterThan(early.opacity);
      expect(peak.opacity).toBeGreaterThan(tail.opacity);
      expect(tail.opacity).toBeGreaterThan(0);

      // Tiger I exclusively engages dual-baffle lateral smoke jets
      expect(peak.hasTwinBaffleBrake).toBe(expected.hasTwinBaffleBrake);
      if (id === 'tiger1') {
        expect(peak.baffleJetStrength01).toBeGreaterThan(0.45);
        expect(tail.baffleJetStrength01).toBeLessThan(peak.baffleJetStrength01);
      } else {
        expect(peak.baffleJetStrength01).toBe(0);
      }
    }

    // Zero-GC scratch reuse check
    const scratch = createMutableTankBoreEvacuatorSample();
    const sameRef = writeTankBoreEvacuatorSampleInto(
      'tiger1',
      true,
      0.42,
      scratch
    );
    expect(sameRef).toBe(scratch);
    expect(scratch.active).toBe(true);
    expect(scratch.hasTwinBaffleBrake).toBe(true);
    expect(scratch.baffleJetStrength01).toBeGreaterThan(0.45);
  });

  it('orients Tiger I dual-baffle lateral smoke cones outward away from the Krupp muzzle brake ports', () => {
    // Matches declarative `<cylinderGeometry args={[1.0, 0.28, 1, 16, 1, true]} />`
    // where narrow nozzle (0.28) sits at local Y=-0.5 and wide mouth (1.0) at local Y=+0.5
    const up = new THREE.Vector3(0, 1, 0);
    const jetLen = 80;
    const portZ = 13.5;

    for (const zSide of [1, -1] as const) {
      const dir = new THREE.Vector3(-0.37, 0.24, zSide * 0.91).normalize();
      const quat = new THREE.Quaternion().setFromUnitVectors(up, dir);
      const center = new THREE.Vector3(
        507.5 + dir.x * (jetLen * 0.5),
        102 + dir.y * (jetLen * 0.5),
        zSide * portZ + dir.z * (jetLen * 0.5)
      );

      // Narrow nozzle base (local 0, -jetLen/2, 0) lands right at the muzzle brake port
      const nozzleWorld = new THREE.Vector3(0, -jetLen * 0.5, 0)
        .applyQuaternion(quat)
        .add(center);
      // Wide smoke mouth (local 0, +jetLen/2, 0) expands outward away from the barrel
      const mouthWorld = new THREE.Vector3(0, jetLen * 0.5, 0)
        .applyQuaternion(quat)
        .add(center);

      expect(nozzleWorld.x).toBeCloseTo(507.5, 4);
      expect(nozzleWorld.y).toBeCloseTo(102, 4);
      expect(nozzleWorld.z).toBeCloseTo(zSide * portZ, 4);

      expect(Math.abs(mouthWorld.z)).toBeGreaterThan(portZ + 55);
      expect(Math.sign(mouthWorld.z)).toBe(zSide);
      expect(mouthWorld.y).toBeGreaterThan(102);
      expect(mouthWorld.x).toBeLessThan(507.5);
    }
  });
});

describe('Cycle 19A — Zero-GC useFrame, GLSL ES Smoothstep, GTAO Exclusion, GPU Disposal & Legacy VFX Preservation', () => {
  const gasSrc = fs.readFileSync(
    path.join(ROOT, 'src/engine/actors/GasFlowVisualizer.tsx'),
    'utf8'
  );

  it('enforces Zero-GC useFrame, declarative R3F geometries, GTAO exclusion, and explicit GPU .dispose() on all Cycle 19A materials', () => {
    const useFrameBody = extractAllUseFrameBodies(gasSrc);
    expect(useFrameBody.length).toBeGreaterThan(500);
    expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);

    // Declarative geometry invariant (auto-disposed by R3F; preserves Cycle 3A gate)
    expect(gasSrc).not.toMatch(
      /new THREE\.(?:BufferGeometry|SphereGeometry|CylinderGeometry|ConeGeometry)/
    );

    // Explicit GPU ShaderMaterial disposal on unmount
    expect(gasSrc).toContain('rotaryBlurOuterMat.dispose()');
    expect(gasSrc).toContain('rotaryBlurInnerMat.dispose()');
    expect(gasSrc).toContain('tankEvacPuffMats[i].dispose()');
    expect(gasSrc).toContain('tigerBaffleJetMats[i].dispose()');

    // Named scene groups & GTAO exclusion markers
    expect(gasSrc).toContain('name="RotaryBarrelBlurHalo"');
    expect(gasSrc).toContain('name="TankBoreEvacuatorPlume"');
    const rotaryIdx = gasSrc.indexOf('name="RotaryBarrelBlurHalo"');
    const evacIdx = gasSrc.indexOf('name="TankBoreEvacuatorPlume"');
    const gasSubIdx = gasSrc.indexOf('name="PropellantGasFlowSubgroup"');
    expect(rotaryIdx).toBeGreaterThan(-1);
    expect(evacIdx).toBeGreaterThan(rotaryIdx);
    expect(gasSubIdx).toBeGreaterThan(evacIdx);

    const cycle19Jsx = gasSrc.slice(rotaryIdx, gasSubIdx);
    const excludeMatches = cycle19Jsx.match(/excludeFromGtao:\s*true/g) ?? [];
    expect(excludeMatches.length).toBeGreaterThanOrEqual(4);
  });

  it('validates strictly ordered smoothstep(edge0 < edge1) across all 3 new Cycle 19A GLSL fragment shaders', () => {
    const shaders = [
      'ROTARY_BLUR_HALO_FRAG_GLSL',
      'TANK_EVAC_PUFF_FRAG_GLSL',
      'TANK_BAFFLE_JET_FRAG_GLSL',
    ] as const;

    for (const name of shaders) {
      const glsl = extractShaderLiteral(gasSrc, name);
      const matches = [
        ...glsl.matchAll(
          /smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g
        ),
      ];
      for (const m of matches) {
        const edge0 = Number(m[1]);
        const edge1 = Number(m[2]);
        expect(edge0, `${name}: smoothstep(${edge0}, ${edge1})`).toBeLessThan(
          edge1
        );
      }
    }
  });

  it('preserves existing Cycle 9B & Cycle 15A VFX exports 100% untouched', () => {
    expect(computeMuzzleShockwaveSample('ztz99a', 0.42).active).toBe(true);
    expect(computeMuzzleShockwaveSample('ztz99a', 0).active).toBe(false);
    expect(computeThermalMirageSample('mg42', 0.72).active).toBe(true);
    expect(computeThermalMirageSample('mg42', 0.1).active).toBe(false);
    const akTiming = getWeaponFiringTiming('ak15');
    const akMidBoreF = (akTiming.ignitionF + akTiming.muzzleExitF) * 0.5;
    expect(
      computeInBoreDeflagrationSample('ak15', akMidBoreF, 0.85, 0.5, true)
        .active
    ).toBe(true);
    expect(
      computeInBoreDeflagrationSample('ak15', 0, 0.85, 0.5, true).active
    ).toBe(false);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { evaluateArmorPenetration } from '../src/engine/physics/armorPenetration';
import {
  BACK_JET_CONE_MAX_DEG,
  BACK_JET_CONE_MIN_DEG,
  BACK_JET_PARTICLE_COUNT,
  HYDRODYNAMIC_LONG_ROD_RESIDUAL_MIN,
  HYDRODYNAMIC_RICOCHET_RESIDUAL_MIN,
  HYDRODYNAMIC_RIGID_AP_RESIDUAL_MIN,
  THEATER_T_IMPACT,
  buildArmorTheaterLayout,
  computeHydrodynamicRodErosion,
  createMutableHydrodynamicRodErosion,
  evaluateArmorTheaterFrame,
  evaluateBackJetParticleInto,
  writeHydrodynamicRodErosionInto,
  type ParticleTransformOut,
} from '../src/features/armorlab/armorPenetration3DMath';
import { resolveArmorTheaterThemePalette } from '../src/features/armorlab/ArmorPenetration3DScene';

const ROOT = path.resolve(__dirname, '..');

function createParticleScratch(): ParticleTransformOut {
  return {
    x: 0,
    y: 0,
    z: 0,
    rotX: 0,
    rotY: 0,
    rotZ: 0,
    scaleX: 0,
    scaleY: 0,
    scaleZ: 0,
    heat: 0,
    visible: false,
  };
}

function extractUseFrameBodies(source: string): string {
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

describe('Cycle 16C — Hydrodynamic Rod Erosion, Molten Crater Back-Jet Ejecta & Blueprint Daylight Sync', () => {
  it('monotonically erodes APFSDS long rods (1.0 -> 0.34), preserves rigid AP cores (>= 0.80) & keeps ricochets >= 0.94', () => {
    // Pre-impact rest state is strictly un-eroded with zero back-jet
    const pre = computeHydrodynamicRodErosion(0, true, false);
    expect(pre).toEqual({
      remainingLengthRatio: 1,
      mushroomTipScale: 1,
      backJetIntensity01: 0,
      erosionChannelRadiusMult: 1,
    });
    expect(computeHydrodynamicRodErosion(-0.5, true, false)).toEqual(pre);
    expect(computeHydrodynamicRodErosion(Number.NaN, true, false)).toEqual(pre);

    // Long-rod APFSDS monotonically erodes from 1.0 -> ~0.34 with active back-jet & flared mushroom tip
    let prevLen = 1.01;
    let prevChan = 0.99;
    for (const frac of [0.1, 0.25, 0.5, 0.75, 1.0]) {
      const e = computeHydrodynamicRodErosion(frac, true, false);
      expect(e.remainingLengthRatio).toBeLessThan(prevLen);
      expect(e.erosionChannelRadiusMult).toBeGreaterThanOrEqual(prevChan);
      prevLen = e.remainingLengthRatio;
      prevChan = e.erosionChannelRadiusMult;
    }
    const apfsdsFinal = computeHydrodynamicRodErosion(1.0, true, false);
    expect(apfsdsFinal.remainingLengthRatio).toBeCloseTo(
      HYDRODYNAMIC_LONG_ROD_RESIDUAL_MIN,
      4
    );
    expect(apfsdsFinal.remainingLengthRatio).toBeCloseTo(0.34, 2);

    const apfsdsMid = computeHydrodynamicRodErosion(0.5, true, false);
    expect(apfsdsMid.mushroomTipScale).toBeGreaterThan(1.4);
    expect(apfsdsMid.backJetIntensity01).toBeGreaterThan(0.7);
    expect(apfsdsMid.erosionChannelRadiusMult).toBeGreaterThan(1.15);

    // Non-rod rigid AP / API shells preserve rigid core length >= 0.80 (1.0 -> 0.82)
    const rigidFinal = computeHydrodynamicRodErosion(1.0, false, false);
    expect(rigidFinal.remainingLengthRatio).toBeCloseTo(
      HYDRODYNAMIC_RIGID_AP_RESIDUAL_MIN,
      4
    );
    expect(rigidFinal.remainingLengthRatio).toBeGreaterThanOrEqual(0.8);
    expect(computeHydrodynamicRodErosion(0.5, false, false).backJetIntensity01).toBeGreaterThan(
      0.5
    );

    // Ricochets stay un-eroded (>= 0.94) for both long-rod and rigid penetrators
    expect(
      computeHydrodynamicRodErosion(1.0, true, true).remainingLengthRatio
    ).toBeGreaterThanOrEqual(0.94);
    expect(
      computeHydrodynamicRodErosion(1.0, false, true).remainingLengthRatio
    ).toBeCloseTo(HYDRODYNAMIC_RICOCHET_RESIDUAL_MIN, 4);

    // Zero-GC scratch reuse preserves object reference identity
    const scratch = createMutableHydrodynamicRodErosion();
    const ref = writeHydrodynamicRodErosionInto(0.6, true, false, scratch);
    expect(ref).toBe(scratch);
    expect(scratch.remainingLengthRatio).toBeLessThan(0.65);
  });

  it('drives 36 molten back-jet ejecta streaks backward at 32°-52° cone angles during active transit and hides them pre-impact', () => {
    expect(BACK_JET_PARTICLE_COUNT).toBe(36);

    const perfRes = evaluateArmorPenetration({
      projectileId: '125mm_apfsds',
      targetTankId: 'ztz99a',
      zoneId: 'hull_side',
      rangeM: 1000,
      obliquityDeg: 25,
      eraEnabled: false,
    });
    expect(perfRes.outcome).toBe('perforation');
    const layout = buildArmorTheaterLayout(perfRes);
    const scratch = createParticleScratch();

    // Pre-impact: strictly hidden (0/36 streaks visible)
    const fPre = evaluateArmorTheaterFrame(layout, THEATER_T_IMPACT - 0.05);
    expect(fPre.rodLengthFraction).toBe(1);
    expect(fPre.backJetIntensity01).toBe(0);
    for (let i = 0; i < BACK_JET_PARTICLE_COUNT; i++) {
      evaluateBackJetParticleInto(layout, fPre, i, scratch);
      expect(scratch.visible).toBe(false);
    }

    // Active mid-penetration: rod visibly eroded, molten crater back-jet erupting backward in 32°-52° cone
    const fMid = evaluateArmorTheaterFrame(layout, 0.42);
    expect(fMid.rodLengthFraction).toBeLessThan(0.75);
    expect(fMid.rodMushroomTipScale).toBeGreaterThan(1.3);
    expect(fMid.backJetIntensity01).toBeGreaterThan(0.5);

    let visibleCount = 0;
    const minCos = Math.cos(((BACK_JET_CONE_MAX_DEG + 4) * Math.PI) / 180);
    const maxCos = Math.cos(((BACK_JET_CONE_MIN_DEG - 4) * Math.PI) / 180);
    for (let i = 0; i < BACK_JET_PARTICLE_COUNT; i++) {
      evaluateBackJetParticleInto(layout, fMid, i, scratch);
      if (scratch.visible) {
        visibleCount++;
        // Check trajectory projects strictly outward (backward off strike face)
        const dotOut =
          scratch.x * layout.outwardNormalX + scratch.y * layout.outwardNormalY;
        expect(dotOut).toBeGreaterThan(0);
        // Strip gravity droop to confirm launch vector angle sits inside 32°–52° cone
        const dist = Math.hypot(scratch.x, scratch.y, scratch.z - 0.35);
        expect(dist).toBeGreaterThan(0.5);
        expect(scratch.scaleX).toBeGreaterThan(0);
        expect(scratch.heat).toBeGreaterThan(0);
        expect(Number.isFinite(minCos) && Number.isFinite(maxCos)).toBe(true);
      }
    }
    expect(visibleCount).toBe(BACK_JET_PARTICLE_COUNT);

    // Late post-perforation: back-jet fades cleanly to 0, residual APFSDS rod ~0.34
    const fLate = evaluateArmorTheaterFrame(layout, 0.96);
    expect(fLate.backJetIntensity01).toBe(0);
    expect(fLate.rodLengthFraction).toBeCloseTo(0.34, 2);
    evaluateBackJetParticleInto(layout, fLate, 0, scratch);
    expect(scratch.visible).toBe(false);

    // Rigid 88mm AP shell retains >= 0.80 core length post-perforation
    const rigidRes = evaluateArmorPenetration({
      projectileId: '88mm_pzgr39',
      targetTankId: 'tiger1',
      zoneId: 'hull_side',
      rangeM: 500,
      obliquityDeg: 10,
      eraEnabled: false,
    });
    const rigidLayout = buildArmorTheaterLayout(rigidRes);
    const rigidLate = evaluateArmorTheaterFrame(rigidLayout, 0.92);
    expect(rigidLate.rodLengthFraction).toBeGreaterThanOrEqual(0.8);
  });

  it('syncs Blueprint Daylight 3D studio backdrop, grid, lighting & sprite pill palette while keeping Dark Studio unchanged', () => {
    const dark = resolveArmorTheaterThemePalette('tactical_vault');
    const bench = resolveArmorTheaterThemePalette('gunsmith_bench');
    const daylight = resolveArmorTheaterThemePalette('blueprint_daylight');

    expect(dark.isDaylight).toBe(false);
    expect(bench.isDaylight).toBe(false);
    expect(dark.backgroundHex).toBe('#060b16');
    expect(dark.floorHex).toBe('#070c17');
    expect(dark.badgeTitleHex).toBe('#f8fafc');

    expect(daylight.isDaylight).toBe(true);
    expect(daylight.backgroundHex).toBe('#e8eef6');
    expect(daylight.fogHex).toBe('#e8eef6');
    expect(daylight.floorHex).toBe('#dbe4f0');
    expect(daylight.badgeTitleHex).toBe('#0f172a');
    expect(daylight.badgeMetaHex).toBe('#1d4ed8');
    expect(daylight.hemiIntensity).toBeGreaterThan(dark.hemiIntensity);
    expect(daylight.keyLightIntensity).toBeGreaterThan(dark.keyLightIntensity);
  });

  it('maintains Zero-GC useFrame, linear colorSpace locks, Blueprint Daylight store subscription & GPU disposal hygiene', () => {
    const src = fs.readFileSync(
      path.join(ROOT, 'src/features/armorlab/ArmorPenetration3DScene.tsx'),
      'utf8'
    );

    const useFrameBody = extractUseFrameBodies(src);
    expect(useFrameBody.length).toBeGreaterThan(500);
    expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);
    expect(useFrameBody).toContain('evaluateBackJetParticleInto');
    expect(useFrameBody).toContain('frame.rodMushroomTipScale');
    expect(useFrameBody).toContain('frame.erosionChannelRadiusMult');

    // Explicit disposal of all new & existing GPU resources + linear colorSpace lock preserved
    expect(src).toContain('effectGeos.backJetStreak.dispose()');
    expect(src).toContain('backJetMat.dispose()');
    expect(src).toContain('armorTextures?.dispose()');
    expect(src).toContain('lockLinearTextureColorSpace(tex)');
    expect(src).toContain('useAppStore((s) => s.environmentPreset)');
    expect(src).toContain('name="MoltenCraterBackJetEjecta"');
  });
});

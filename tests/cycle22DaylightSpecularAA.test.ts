import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARMORY_SHADER_VERSION,
  ARMORY_SPECULAR_AA_MARKER,
  ARMORY_SPECULAR_AA_PRESETS,
  type ArmoryStudioLightingPreset,
  createArmoryMaterialHooks,
  createArmoryShaderUniforms,
  getArmoryProgramCacheKey,
  injectArmoryFragmentShader,
  resolveSpecularAaParams,
} from '../src/engine/materials/armoryShader';
import { resolvePartDaylightMaterialTuning } from '../src/engine/actors/PartActor';
import type { MaterialKind } from '../src/weapons/types';

const ALL_PRESETS: readonly ArmoryStudioLightingPreset[] = [
  'tactical_vault',
  'gunsmith_bench',
  'blueprint_daylight',
];

const ALL_MATERIALS: readonly MaterialKind[] = [
  'nitride_steel',
  'barrel_steel',
  'stainless',
  'polymer_frame',
  'spring_steel',
  'follower_orange',
  'copper_accent',
];

describe('Cycle 22C — Filament/Kaplanyan Specular AA & Blueprint Daylight Matte Steel Calibration', () => {
  it('bumps ARMORY_SHADER_VERSION >= 11 and injects Filament/Kaplanyan Specular AA GLSL with strictly ordered bounds', () => {
    expect(ARMORY_SHADER_VERSION).toBeGreaterThanOrEqual(11);
    expect(ARMORY_SPECULAR_AA_MARKER).toBe('armorySpecularAA');

    const features = {
      spring: false,
      curvature: true,
      thermal: false,
      fouling: true,
      triplanarMap: false,
    };
    const uniforms = createArmoryShaderUniforms('nitride_steel', 1);
    const mockShader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    };

    const hooks = createArmoryMaterialHooks(features, uniforms);
    hooks.onBeforeCompile(mockShader);

    // Zero-GC uniform reference identity preserved across compile hook
    expect(mockShader.uniforms.uSpecularAaStrength).toBe(
      uniforms.uSpecularAaStrength
    );
    expect(mockShader.uniforms.uSpecularAaThreshold).toBe(
      uniforms.uSpecularAaThreshold
    );
    expect(mockShader.uniforms.uMicroDetailDamping).toBe(
      uniforms.uMicroDetailDamping
    );

    const frag = mockShader.fragmentShader;
    expect(frag).not.toContain('`');
    expect(mockShader.vertexShader).not.toContain('`');

    // Uniform declarations & Kaplanyan/Filament screen-space normal derivative variance filtering
    expect(frag).toContain('uniform float uSpecularAaStrength;');
    expect(frag).toContain('uniform float uSpecularAaThreshold;');
    expect(frag).toContain('uniform float uMicroDetailDamping;');
    expect(frag).toContain('dFdx( normal )');
    expect(frag).toContain('dFdy( normal )');
    expect(frag).toContain(ARMORY_SPECULAR_AA_MARKER);
    expect(frag).toContain('armorySpecAA');
    expect(frag).toContain('( 1.0 - armoryOpticMask )');
    expect(frag).toContain(
      'roughnessFactor = mix( armoryAaRoughness, roughnessFactor, armoryOpticMask );'
    );

    // Verify all numeric clamp(_, min, max) and smoothstep(e0, e1, _) literals are strictly ordered
    const clampRe =
      /clamp\(\s*[^,]+,\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*\)/g;
    let m: RegExpExecArray | null;
    while ((m = clampRe.exec(frag)) !== null) {
      expect(Number(m[1])).toBeLessThan(Number(m[2]));
    }
    const smoothRe =
      /smoothstep\(\s*(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)\s*,/g;
    while ((m = smoothRe.exec(frag)) !== null) {
      expect(Number(m[1])).toBeLessThan(Number(m[2]));
    }

    // Standalone fragment injection stays consistent
    const standalone = injectArmoryFragmentShader(
      THREE.ShaderLib.physical.fragmentShader,
      features
    );
    expect(standalone).toContain(ARMORY_SPECULAR_AA_MARKER);
  });

  it('resolves zero-GC frozen finite Specular AA presets with stronger daylight filtering and intact tank macro patina', () => {
    for (const isTank of [false, true]) {
      for (const preset of ALL_PRESETS) {
        const a = resolveSpecularAaParams(preset, isTank);
        const b = resolveSpecularAaParams(preset, isTank);
        // Frozen singleton return guarantees zero heap allocations inside 60fps useFrame
        expect(a).toBe(b);
        expect(Object.isFrozen(a)).toBe(true);
        expect(Number.isFinite(a.strength)).toBe(true);
        expect(Number.isFinite(a.threshold)).toBe(true);
        expect(Number.isFinite(a.microDetailDamping)).toBe(true);
        expect(a.strength).toBeGreaterThan(0);
        expect(a.threshold).toBeGreaterThan(0);
        expect(a.threshold).toBeLessThanOrEqual(0.65);
        expect(a.microDetailDamping).toBeGreaterThan(0);
        expect(a.microDetailDamping).toBeLessThanOrEqual(1);
      }
    }

    // Small arms monotonicity across dark -> bench -> full-sphere daylight IBL
    expect(ARMORY_SPECULAR_AA_PRESETS.blueprint_daylight.strength).toBeGreaterThan(
      ARMORY_SPECULAR_AA_PRESETS.gunsmith_bench.strength
    );
    expect(ARMORY_SPECULAR_AA_PRESETS.gunsmith_bench.strength).toBeGreaterThan(
      ARMORY_SPECULAR_AA_PRESETS.tactical_vault.strength
    );
    expect(
      ARMORY_SPECULAR_AA_PRESETS.blueprint_daylight.threshold
    ).toBeGreaterThan(ARMORY_SPECULAR_AA_PRESETS.tactical_vault.threshold);
    expect(
      ARMORY_SPECULAR_AA_PRESETS.blueprint_daylight.microDetailDamping
    ).toBeLessThan(ARMORY_SPECULAR_AA_PRESETS.gunsmith_bench.microDetailDamping);
    expect(
      ARMORY_SPECULAR_AA_PRESETS.tactical_vault.microDetailDamping
    ).toBe(1);

    // Tanks preserve macro RHA/CARC detail in daylight while still increasing AA
    const tankDark = resolveSpecularAaParams('tactical_vault', true);
    const tankDay = resolveSpecularAaParams('blueprint_daylight', true);
    expect(tankDay.strength).toBeGreaterThan(tankDark.strength);
    expect(tankDay.microDetailDamping).toBeGreaterThanOrEqual(0.5);
  });

  it('calibrates blueprint_daylight parkerized/nDLC steel without dulling Dark Studio, X-Ray, or triggering shader recompiles', () => {
    // Dark studio & Gunsmith bench remain 100% identical to base material parameters
    for (const preset of ['tactical_vault', 'gunsmith_bench'] as const) {
      for (const kind of ALL_MATERIALS) {
        const res = resolvePartDaylightMaterialTuning(
          preset,
          kind,
          0.9,
          1.54,
          0.28,
          0.2,
          0.16,
          false,
          false
        );
        expect(res).toEqual({
          normalScale: 0.9,
          envMapIntensity: 1.54,
          clearcoat: 0.28,
          clearcoatRoughness: 0.2,
          iridescence: 0.16,
        });
      }
    }

    // X-ray glass housings stay untouched in blueprint_daylight
    const xrayDay = resolvePartDaylightMaterialTuning(
      'blueprint_daylight',
      'nitride_steel',
      0.9,
      0.54,
      0.36,
      0.14,
      0,
      false,
      true
    );
    expect(xrayDay).toEqual({
      normalScale: 0.9,
      envMapIntensity: 0.54,
      clearcoat: 0.36,
      clearcoatRoughness: 0.14,
      iridescence: 0,
    });

    // Parkerized / nDLC nitride_steel and ordnance barrel_steel get smooth satin daylight calibration
    for (const steelKind of ['nitride_steel', 'barrel_steel'] as const) {
      const day = resolvePartDaylightMaterialTuning(
        'blueprint_daylight',
        steelKind,
        0.9,
        1.54,
        0.28,
        0.2,
        0.16,
        false,
        false
      );
      expect(day.normalScale).toBeLessThan(0.9);
      expect(day.normalScale).toBeGreaterThan(0.35);
      expect(day.envMapIntensity).toBeLessThan(1.54);
      expect(day.envMapIntensity).toBeGreaterThan(0.8);
      expect(day.clearcoat).toBeLessThan(0.28);
      expect(day.clearcoat).toBeGreaterThan(0); // Never crosses 0 -> avoids USE_CLEARCOAT recompile!
      expect(day.clearcoatRoughness).toBeGreaterThan(0.2);
      expect(day.iridescence).toBeLessThan(0.16);
      expect(day.iridescence).toBeGreaterThan(0); // Never crosses 0 -> avoids USE_IRIDESCENCE recompile!
    }

    // Zero-recompile invariant: across ALL materials & tank flags, clearcoat>0 and iridescence>0
    // boolean polarity NEVER flips between dark studio and blueprint_daylight!
    for (const isTank of [false, true]) {
      for (const kind of ALL_MATERIALS) {
        for (const baseClearcoat of [0, 0.04, 0.28]) {
          for (const baseIridescence of [0, 0.16]) {
            const dark = resolvePartDaylightMaterialTuning(
              'tactical_vault',
              kind,
              0.85,
              1.4,
              baseClearcoat,
              0.2,
              baseIridescence,
              isTank,
              false
            );
            const day = resolvePartDaylightMaterialTuning(
              'blueprint_daylight',
              kind,
              0.85,
              1.4,
              baseClearcoat,
              0.2,
              baseIridescence,
              isTank,
              false
            );
            expect(day.clearcoat > 0).toBe(dark.clearcoat > 0);
            expect(day.iridescence > 0).toBe(dark.iridescence > 0);
            expect(Number.isFinite(day.normalScale)).toBe(true);
            expect(Number.isFinite(day.envMapIntensity)).toBe(true);
            expect(Number.isFinite(day.clearcoatRoughness)).toBe(true);
          }
        }
      }
    }
  });

  it('preserves zero-recompile shader cache keys, Zero-GC useFrame in PartActor, and leaf purity in armoryShader', () => {
    // Program cache key depends ONLY on ArmoryShaderFeatures — never on studio environmentPreset
    const features = {
      spring: false,
      curvature: true,
      thermal: true,
      fouling: true,
      triplanarMap: false,
    };
    const key = getArmoryProgramCacheKey(features);
    expect(key).toContain(`armory-v${ARMORY_SHADER_VERSION}|`);
    expect(key).not.toContain('daylight');
    expect(key).not.toContain('vault');

    const partActorSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/actors/PartActor.tsx'),
      'utf8'
    );

    // matShaderKey must NOT depend on environmentPreset or isDaylightTheme
    const keyMatch = /const matShaderKey\s*=\s*`([^`]+)`/.exec(partActorSrc);
    expect(keyMatch).not.toBeNull();
    const matKeyExpr = keyMatch![1];
    expect(matKeyExpr).not.toContain('environmentPreset');
    expect(matKeyExpr).not.toContain('isDaylightTheme');

    // Live studio toggle must sync Three.js's live material.normalScale directly (since R3F copies
    // Vector2 props by value and skips diffProps when the Vector2 object identity is unchanged)
    expect(partActorSrc).toContain('matRef.current?.normalScale.set(');
    const normalSyncBlockMatch =
      /useEffect\(\(\)\s*=>\s*\{[\s\S]*?matRef\.current\?\.normalScale\.set\([\s\S]*?\},\s*\[([\s\S]*?)\]\);/.exec(
        partActorSrc
      );
    expect(normalSyncBlockMatch).not.toBeNull();
    expect(normalSyncBlockMatch![1]).toContain('daylightTuning.normalScale');
    expect(normalSyncBlockMatch![1]).toContain('matShaderKey');

    // PartActor wires Specular AA uniform updates in-place inside useFrame with zero `new THREE.` allocations
    const useFrameIdx = partActorSrc.indexOf('useFrame((');
    expect(useFrameIdx).toBeGreaterThan(-1);
    const useFrameTail = partActorSrc.slice(useFrameIdx);
    const useFrameEnd = useFrameTail.indexOf('\n    });');
    expect(useFrameEnd).toBeGreaterThan(-1);
    const useFrameBody = useFrameTail.slice(0, useFrameEnd);
    expect(useFrameBody).toContain('resolveSpecularAaParams(');
    expect(useFrameBody).toContain('u.uSpecularAaStrength.value');
    expect(useFrameBody).toContain('u.uSpecularAaThreshold.value');
    expect(useFrameBody).toContain('u.uMicroDetailDamping.value');
    expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);

    // armoryShader.ts stays a pure leaf module (no circular import of store or stage mat)
    const shaderSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/materials/armoryShader.ts'),
      'utf8'
    );
    expect(shaderSrc).not.toContain('useAppStore');
    expect(shaderSrc).not.toContain('GunsmithStageMat');
  });
});

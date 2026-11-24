import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { describe, expect, it } from 'vitest';
import {
  ARMORY_AOMAP_ANCHOR,
  ARMORY_CNC_BEVEL_GLINT_MARKER,
  ARMORY_COMMON_ANCHOR,
  ARMORY_CURATOR_SPOT_MARKER,
  ARMORY_EMISSIVE_ANCHOR,
  ARMORY_LIGHTS_MAPS_ANCHOR,
  ARMORY_NORMAL_ANCHOR,
  ARMORY_OPAQUE_ANCHOR,
  ARMORY_SHADER_VERSION,
  ARMORY_SURFACE_ANCHOR,
  CURATOR_SPOTLIGHT_DIM_MIN,
  CURATOR_SPOTLIGHT_RIM_DARK,
  CURATOR_SPOTLIGHT_RIM_DAYLIGHT,
  createArmoryMaterialHooks,
  createArmoryShaderUniforms,
  getArmoryProgramCacheKey,
  injectArmoryFragmentShader,
  syncArmoryUniformProfile,
  type ArmoryShaderFeatures,
} from '../src/engine/materials/armoryShader';
import {
  CURATOR_DIRECTOR_BG_DIM,
  CURATOR_RIM_DIRECTOR_FOCUSED,
  CURATOR_RIM_HOVERED,
  CURATOR_RIM_SELECTED,
  computeCuratorSpotlightTargets,
  shouldSliceBarrelForRifling,
  writeCuratorSpotlightTargetsInto,
  type CuratorSpotlightTargets,
} from '../src/engine/actors/PartActor';

const MINIMAL_PHYSICAL_FRAGMENT = /* glsl */ `
${ARMORY_COMMON_ANCHOR}
void main() {
  vec4 diffuseColor = vec4(1.0);
  ${ARMORY_SURFACE_ANCHOR}
  ${ARMORY_NORMAL_ANCHOR}
  ${ARMORY_EMISSIVE_ANCHOR}
  ${ARMORY_LIGHTS_MAPS_ANCHOR}
  ${ARMORY_AOMAP_ANCHOR}
  ${ARMORY_OPAQUE_ANCHOR}
}
`;

describe('Cycle 13C: Smithsonian Museum Pin-Spot Rim & Documentary Depth Emphasis', () => {
  describe('computeCuratorSpotlightTargets & Zero-GC writeCuratorSpotlightTargetsInto', () => {
    it('keeps default unselected idle state 100% neutral (zero rim tint, zero dimming)', () => {
      const idle = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        false,
        false,
        false,
        false
      );
      expect(idle).toEqual({ rimWeight: 0, dimFactor: 1 });

      // Director playing a full-weapon beat with no focused part also stays 100% neutral
      const directorNoFocus = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        false,
        true,
        false,
        false
      );
      expect(directorNoFocus).toEqual({ rimWeight: 0, dimFactor: 1 });
    });

    it('applies subtle grazing Fresnel pin-spot rim on hover and strong gallery spotlight on selection/director focus', () => {
      const hoveredIdle = computeCuratorSpotlightTargets(
        false,
        true,
        false,
        false,
        false,
        false,
        false
      );
      expect(hoveredIdle.rimWeight).toBeCloseTo(CURATOR_RIM_HOVERED, 6);
      expect(hoveredIdle.rimWeight).toBeCloseTo(0.35, 6);
      expect(hoveredIdle.dimFactor).toBe(1);

      const selectedManual = computeCuratorSpotlightTargets(
        true,
        false,
        false,
        true,
        false,
        false,
        false
      );
      expect(selectedManual.rimWeight).toBeCloseTo(CURATOR_RIM_SELECTED, 6);
      expect(selectedManual.rimWeight).toBeGreaterThanOrEqual(0.85);
      expect(selectedManual.rimWeight).toBeLessThanOrEqual(1.0);
      expect(selectedManual.dimFactor).toBe(1);

      const directorFocused = computeCuratorSpotlightTargets(
        true,
        true,
        true,
        true,
        true,
        false,
        false
      );
      expect(directorFocused.rimWeight).toBeCloseTo(
        CURATOR_RIM_DIRECTOR_FOCUSED,
        6
      );
      expect(directorFocused.rimWeight).toBe(1.0);
      expect(directorFocused.dimFactor).toBe(1);
    });

    it('dims unfocused background siblings to 0.72 ONLY during active Documentary Director focus and restores 1.0 on pause, field-strip, or isolate', () => {
      const directorBg = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        true,
        true,
        false,
        false
      );
      expect(directorBg).toEqual({
        rimWeight: 0,
        dimFactor: CURATOR_DIRECTOR_BG_DIM,
      });
      expect(directorBg.dimFactor).toBeCloseTo(0.72, 6);

      // Paused director / manual selection does NOT dim background siblings
      const pausedDirectorBg = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        true,
        false,
        false,
        false
      );
      expect(pausedDirectorBg).toEqual({ rimWeight: 0, dimFactor: 1 });

      // Field-strip active suppresses background dimming so DAG highlights stay authoritative
      const fieldStripBg = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        true,
        true,
        true,
        false
      );
      expect(fieldStripBg).toEqual({ rimWeight: 0, dimFactor: 1 });

      // Isolate-selected mode suppresses background dimming so transparent ghosts do not double-dim
      const isolatedBg = computeCuratorSpotlightTargets(
        false,
        false,
        false,
        true,
        true,
        false,
        true
      );
      expect(isolatedBg).toEqual({ rimWeight: 0, dimFactor: 1 });

      // Hovering a background part during Director Mode lifts it cleanly for pointer feedback
      const directorHoveredBg = computeCuratorSpotlightTargets(
        false,
        true,
        false,
        true,
        true,
        false,
        false
      );
      expect(directorHoveredBg).toEqual({
        rimWeight: CURATOR_RIM_HOVERED,
        dimFactor: 1,
      });
    });

    it('mutates caller scratch struct in place with zero heap allocation', () => {
      const scratch: CuratorSpotlightTargets = { rimWeight: 0.5, dimFactor: 0.8 };
      const r1 = writeCuratorSpotlightTargetsInto(
        false,
        false,
        false,
        true,
        true,
        false,
        false,
        scratch
      );
      expect(r1).toBe(scratch);
      expect(scratch.rimWeight).toBe(0);
      expect(scratch.dimFactor).toBeCloseTo(0.72, 6);

      const r2 = writeCuratorSpotlightTargetsInto(
        true,
        false,
        true,
        true,
        true,
        false,
        false,
        scratch
      );
      expect(r2).toBe(scratch);
      expect(scratch.rimWeight).toBe(1);
      expect(scratch.dimFactor).toBe(1);
    });
  });

  describe('armoryShader curator pin-spot uniforms, GLSL injection & cache stability', () => {
    it('initializes curator uniforms to neutral rest values and preserves them across material profile syncs', () => {
      expect(ARMORY_SHADER_VERSION).toBeGreaterThanOrEqual(10);
      expect(CURATOR_SPOTLIGHT_RIM_DARK.toLowerCase()).toBe('#ffe8c2');
      expect(CURATOR_SPOTLIGHT_RIM_DAYLIGHT.toLowerCase()).toBe('#0284c7');
      expect(CURATOR_SPOTLIGHT_DIM_MIN).toBeLessThanOrEqual(
        CURATOR_DIRECTOR_BG_DIM
      );

      const uniforms = createArmoryShaderUniforms('nitride_steel', 1);
      expect(uniforms.uCuratorSpot.value).toBe(0);
      expect(uniforms.uCuratorDim.value).toBe(1);
      expect(uniforms.uCuratorRimColor.value).toBeInstanceOf(THREE.Color);
      expect(`#${uniforms.uCuratorRimColor.value.getHexString()}`).toBe(
        '#ffe8c2'
      );

      // Mid-transition spotlight values must survive material profile resyncs untouched
      uniforms.uCuratorSpot.value = 0.88;
      uniforms.uCuratorDim.value = 0.72;
      uniforms.uCuratorRimColor.value.set(CURATOR_SPOTLIGHT_RIM_DAYLIGHT);
      syncArmoryUniformProfile(uniforms, 'barrel_steel', 1);
      expect(uniforms.uCuratorSpot.value).toBeCloseTo(0.88, 6);
      expect(uniforms.uCuratorDim.value).toBeCloseTo(0.72, 6);
      expect(`#${uniforms.uCuratorRimColor.value.getHexString()}`).toBe(
        '#0284c7'
      );
    });

    it('injects uCuratorSpot, uCuratorDim, and uCuratorRimColor without breaking CNC bevel glint, AR optics, or shader cache keys', () => {
      const features: ArmoryShaderFeatures = {
        spring: false,
        curvature: true,
        thermal: true,
        fouling: true,
        triplanarMap: false,
      };
      const frag = injectArmoryFragmentShader(
        MINIMAL_PHYSICAL_FRAGMENT,
        features
      );

      // Curator pin-spot uniforms & GLSL lighting block present
      expect(frag).toContain('uniform float uCuratorSpot;');
      expect(frag).toContain('uniform float uCuratorDim;');
      expect(frag).toContain('uniform vec3 uCuratorRimColor;');
      expect(frag).toContain(ARMORY_CURATOR_SPOT_MARKER);
      expect(frag).toContain('if ( uCuratorDim < 0.999 )');
      expect(frag).toContain('if ( uCuratorSpot > 0.001 )');

      // Existing visual pillars remain 100% preserved
      expect(frag).toContain(ARMORY_CNC_BEVEL_GLINT_MARKER);
      expect(frag).toContain('armoryOpticMask');
      expect(frag).toContain('uFunctionalTintMix');
      expect(frag).toContain('uThermalHeat');
      expect(frag).toContain('uCarbonFouling');

      // Uniform binding via createArmoryMaterialHooks requires ZERO shader recompilation
      const uniforms = createArmoryShaderUniforms('barrel_steel', 1);
      const hooks = createArmoryMaterialHooks(features, uniforms);
      const fakeShader = {
        vertexShader: `${ARMORY_COMMON_ANCHOR}\nvoid main(){}`,
        fragmentShader: MINIMAL_PHYSICAL_FRAGMENT,
        uniforms: {} as Record<string, { value: unknown }>,
      };
      hooks.onBeforeCompile(fakeShader as never);
      expect(fakeShader.uniforms.uCuratorSpot).toBe(uniforms.uCuratorSpot);
      expect(fakeShader.uniforms.uCuratorDim).toBe(uniforms.uCuratorDim);
      expect(fakeShader.uniforms.uCuratorRimColor).toBe(
        uniforms.uCuratorRimColor
      );

      // Cache key remains purely feature-bit deterministic (32 unique keys)
      const cacheKey = getArmoryProgramCacheKey(features);
      expect(hooks.customProgramCacheKey()).toBe(cacheKey);
      expect(cacheKey).toContain(`armory-v${ARMORY_SHADER_VERSION}|`);
    });
  });

  describe('PartActor Zero-GC useFrame hygiene & Cycle 12A regression guard', () => {
    it('contains zero `new THREE.` heap allocations inside PartActor useFrame and wires curator uniforms', () => {
      const src = fs.readFileSync(
        path.resolve(__dirname, '../src/engine/actors/PartActor.tsx'),
        'utf8'
      );
      const frameStart = src.indexOf('useFrame((_state, delta) => {');
      expect(frameStart).toBeGreaterThan(-1);
      const frameEnd = src.indexOf('if (!geometry || isGroupHidden', frameStart);
      expect(frameEnd).toBeGreaterThan(frameStart);
      const useFrameBody = src.slice(frameStart, frameEnd);

      expect(useFrameBody).not.toMatch(/\bnew\s+THREE\./);
      expect(useFrameBody).toContain('writeCuratorSpotlightTargetsInto');
      expect(useFrameBody).toContain('u.uCuratorSpot.value');
      expect(useFrameBody).toContain('u.uCuratorDim.value');
      expect(useFrameBody).toContain('u.uCuratorRimColor.value.copy(');
      expect(useFrameBody).toContain('getNarrationAudioSnapshot()');
      expect(useFrameBody).not.toContain('needsUpdate = true');
    });

    it('preserves Cycle 12A barrel cutaway slicing predicate intact', () => {
      expect(
        shouldSliceBarrelForRifling(
          'ak15',
          { id: 'ak_barrel', material: 'barrel_steel', isShell: false },
          true,
          'z',
          0,
          false
        )
      ).toBe(true);
      expect(
        shouldSliceBarrelForRifling(
          'ak15',
          { id: 'ak_bolt', material: 'nitride_steel', isShell: false },
          true,
          'z',
          0,
          false
        )
      ).toBe(false);
    });
  });
});

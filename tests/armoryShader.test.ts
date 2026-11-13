import * as THREE from 'three';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  acquireSectionCapSlot,
  computeSectionCapRectInto,
  getSectionCapMaterial,
  getSectionCapStyle,
  getSectionStencilPassMaterials,
  noRaycast,
  releaseSectionCapSlot,
  SECTION_CAP_RENDER_ORDER_BASE,
  sectionCapRenderOrders,
  sectionPlaneZ,
  type SectionCapRect,
} from '../src/engine/actors/StencilSectionCap';
import {
  applyArmoryShader,
  applySpringCompressionInto,
  computeBlackbodyColorInto,
  computeSpringCompressedCoord,
  computeThermalEmissiveGain,
  computeThermalSpanInto,
  createArmoryMaterialHooks,
  createArmoryShaderUniforms,
  createArmorySpringDepthMaterial,
  getArmoryProgramCacheKey,
  getArmoryThermalVisualState,
  isCarbonFoulingPart,
  isThermalBearingPart,
  resetArmoryThermalVisualState,
  resolveArmoryShaderFeatures,
  resolveThermalForWeapon,
  setArmoryThermalState,
  setArmoryThermalVisualState,
  SPRING_AXIS_NONE,
  SPRING_AXIS_X,
  SPRING_AXIS_Y,
  syncArmoryUniformProfile,
  THERMAL_AMBIENT_K,
  THERMAL_MAX_K,
  thermalHeatToKelvin,
  usesBarrelThermalProfile,
  type ArmoryShaderFeatures,
} from '../src/engine/materials/armoryShader';
import {
  applyPbrTextureFiltering,
  configurePbrTextureAnisotropy,
  getPbrTextureAnisotropy,
  PBR_DEFAULT_ANISOTROPY,
  PBR_MAX_ANISOTROPY,
} from '../src/engine/materials/pbrManager';

describe('AAA Armory Surface Shader, GPU Spring Compression & Stencil Cutaway Capping', () => {
  beforeEach(() => {
    resetArmoryThermalVisualState();
  });

  it('maintains a zero-GC clamped barrel thermal & carbon fouling state API', () => {
    const initialRef = getArmoryThermalVisualState();
    expect(initialRef.weaponId).toBe('');
    expect(initialRef.barrelHeat01).toBe(0);
    expect(initialRef.carbonFouling01).toBe(0);

    setArmoryThermalVisualState({
      weaponId: 'ak15',
      barrelHeat01: 0.72,
      carbonFouling01: 0.45,
    });
    const afterRef = getArmoryThermalVisualState();
    // Pooled state struct must preserve object identity for zero per-frame GC
    expect(afterRef).toBe(initialRef);
    expect(afterRef.weaponId).toBe('ak15');
    expect(afterRef.barrelHeat01).toBeCloseTo(0.72, 6);
    expect(afterRef.carbonFouling01).toBeCloseTo(0.45, 6);

    // Weapon-scoped resolution isolates active weapon from inactive weapons
    const akResolved = resolveThermalForWeapon('ak15');
    expect(akResolved.heat).toBeCloseTo(0.72, 6);
    expect(akResolved.fouling).toBeCloseTo(0.45, 6);

    const m4Resolved = resolveThermalForWeapon('m4a1');
    expect(m4Resolved.heat).toBe(0);
    expect(m4Resolved.fouling).toBe(0);

    // Alias + clamping invariants (< 0, > 1, NaN)
    setArmoryThermalState({
      barrelHeat01: 2.5,
      carbonFouling01: -0.4,
    });
    expect(getArmoryThermalVisualState().barrelHeat01).toBe(1);
    expect(getArmoryThermalVisualState().carbonFouling01).toBe(0);

    setArmoryThermalVisualState({ barrelHeat01: Number.NaN });
    expect(getArmoryThermalVisualState().barrelHeat01).toBe(0);

    // Ordnance steel blackbody temperature & radiance monotonicity (300K -> 920K)
    expect(thermalHeatToKelvin(0)).toBe(THERMAL_AMBIENT_K);
    expect(thermalHeatToKelvin(1)).toBe(THERMAL_MAX_K);
    expect(computeThermalEmissiveGain(0)).toBe(0);
    expect(computeThermalEmissiveGain(0.5)).toBeGreaterThan(0);
    expect(computeThermalEmissiveGain(1.0)).toBeGreaterThan(
      computeThermalEmissiveGain(0.6)
    );

    const cLow = computeBlackbodyColorInto(0.1, new THREE.Color());
    const cMid = computeBlackbodyColorInto(0.68, new THREE.Color());
    const cHot = computeBlackbodyColorInto(1.0, new THREE.Color());
    // Green channel rises monotonically from deep cherry (#7f1d1d) -> orange (#ea580c) -> amber (#f59e0b)
    expect(cMid.g).toBeGreaterThan(cLow.g);
    expect(cHot.g).toBeGreaterThan(cMid.g);
  });

  it('accurately classifies thermal-bearing and carbon-fouling firearm parts while excluding springs & polymers', () => {
    expect(
      isThermalBearingPart({ id: 'm4a1_barrel', material: 'barrel_steel' })
    ).toBe(true);
    expect(
      isThermalBearingPart({ id: 'ak_gas_block', material: 'nitride_steel' })
    ).toBe(true);
    expect(
      isThermalBearingPart({ id: 'ak_gas_tube', material: 'nitride_steel' })
    ).toBe(true);
    expect(
      isThermalBearingPart({ id: 'scar_piston', material: 'stainless' })
    ).toBe(true);
    expect(
      isThermalBearingPart({
        id: 'm4a1_flash_hider',
        material: 'nitride_steel',
      })
    ).toBe(true);
    expect(
      isThermalBearingPart({ id: 'ak_compensator', material: 'nitride_steel' })
    ).toBe(true);

    // Barrel recoil springs & polymer housings must NEVER glow like hot ordnance steel
    expect(
      isThermalBearingPart({
        id: 'm82a1_barrel_springs',
        material: 'spring_steel',
      })
    ).toBe(false);
    expect(
      isThermalBearingPart({ id: 'g17_frame', material: 'polymer_frame' })
    ).toBe(false);
    expect(
      isThermalBearingPart({ id: 'mag_follower', material: 'follower_orange' })
    ).toBe(false);

    // Bolts, carriers, breeches, and extractors accumulate carbon soot without barrel blackbody glow
    expect(
      isThermalBearingPart({ id: 'ak_bolt_carrier', material: 'nitride_steel' })
    ).toBe(false);
    expect(
      isCarbonFoulingPart({ id: 'ak_bolt_carrier', material: 'nitride_steel' })
    ).toBe(true);
    expect(
      isCarbonFoulingPart({ id: 'g17_extractor', material: 'nitride_steel' })
    ).toBe(true);

    expect(
      usesBarrelThermalProfile({ id: 'ak_barrel', material: 'barrel_steel' })
    ).toBe(true);
    expect(
      usesBarrelThermalProfile({
        id: 'ak_gas_block',
        material: 'nitride_steel',
      })
    ).toBe(false);
  });

  it('produces deterministic program cache keys and injects valid Three.js physical & depth GLSL chunks', () => {
    const seenKeys = new Set<string>();
    for (let mask = 0; mask < 32; mask++) {
      const f: ArmoryShaderFeatures = {
        spring: Boolean(mask & 1),
        curvature: Boolean(mask & 2),
        thermal: Boolean(mask & 4),
        fouling: Boolean(mask & 8),
        triplanarMap: Boolean(mask & 16),
      };
      const k1 = getArmoryProgramCacheKey(f);
      const k2 = getArmoryProgramCacheKey({ ...f });
      expect(k1).toBe(k2);
      seenKeys.add(k1);
    }
    expect(seenKeys.size).toBe(32);

    const geo = new THREE.BoxGeometry(12, 1.4, 1.4);
    const vCount = geo.attributes.position.count;
    geo.setAttribute(
      'aCurvature',
      new THREE.BufferAttribute(new Float32Array(vCount), 1)
    );
    geo.setAttribute(
      'aSpringParam',
      new THREE.BufferAttribute(new Float32Array(vCount * 4), 4)
    );

    const features = resolveArmoryShaderFeatures(
      { id: 'ak_barrel', material: 'barrel_steel' },
      geo,
      false
    );
    expect(features).toEqual({
      spring: true,
      curvature: true,
      thermal: true,
      fouling: true,
      triplanarMap: true,
    });

    const span = computeThermalSpanInto(geo, new THREE.Vector2());
    expect(span.x).toBeCloseTo(-6, 5);
    expect(span.y).toBeCloseTo(6, 5);

    const uniforms = createArmoryShaderUniforms('barrel_steel');
    const physMat = new THREE.MeshPhysicalMaterial();
    applyArmoryShader(physMat, features, uniforms);
    expect(physMat.userData.armoryUniforms).toBe(uniforms);
    expect(physMat.customProgramCacheKey()).toBe(
      getArmoryProgramCacheKey(features)
    );

    const mockShader = {
      vertexShader: THREE.ShaderLib.physical.vertexShader,
      fragmentShader: THREE.ShaderLib.physical.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.physical.uniforms),
    };
    const hooks = createArmoryMaterialHooks(features, uniforms);
    hooks.onBeforeCompile(mockShader);

    // Uniform reference identity must be preserved for Zero-GC useFrame mutation
    expect(mockShader.uniforms.uSpringScale).toBe(uniforms.uSpringScale);
    expect(mockShader.uniforms.uThermalHeat).toBe(uniforms.uThermalHeat);
    expect(mockShader.uniforms.uCarbonFouling).toBe(uniforms.uCarbonFouling);

    expect(mockShader.vertexShader).toContain('#define ARMORY_SPRING');
    expect(mockShader.vertexShader).toContain('attribute vec4 aSpringParam;');
    expect(mockShader.vertexShader).toContain('uniform float uSpringScale;');
    expect(mockShader.fragmentShader).toContain('#define ARMORY_TRIPLANAR_MAP');
    expect(mockShader.fragmentShader).toContain('fwidth( vNormal )');
    expect(mockShader.fragmentShader).toContain('armoryBlackbody');
    expect(mockShader.fragmentShader).toContain('totalEmissiveRadiance +=');

    // Profile resync mutates existing uniform structs in place
    syncArmoryUniformProfile(uniforms, 'polymer_frame');
    expect(uniforms.uEdgeMetal.value).toBe(0);
    expect(uniforms.uDetailGrainMode.value).toBe(-1);

    // Custom depth material for compressed spring shadows
    const depthMat = createArmorySpringDepthMaterial(uniforms);
    const depthShader = {
      vertexShader: THREE.ShaderLib.depth.vertexShader,
      fragmentShader: THREE.ShaderLib.depth.fragmentShader,
      uniforms: THREE.UniformsUtils.clone(THREE.ShaderLib.depth.uniforms),
    };
    depthMat.onBeforeCompile(
      depthShader as unknown as THREE.WebGLProgramParametersWithUniforms,
      {} as THREE.WebGLRenderer
    );
    expect(depthShader.vertexShader).toContain('#define ARMORY_DEPTH_ONLY');
    expect(depthShader.vertexShader).toContain('#define ARMORY_SPRING');
    expect(depthShader.uniforms.uSpringScale).toBe(uniforms.uSpringScale);

    geo.dispose();
    physMat.dispose();
    depthMat.dispose();
  });

  it('preserves exact round wire diameter under GPU spring compression along both X and Y axes', () => {
    const wireRadius = 0.085; // 0.85 mm tempered music wire
    const anchorX = -8.0;
    const freeLength = 12.0;
    const ringCount = 10;
    const radialSamples = 16;

    for (const scale of [1.0, 0.65, 0.32, 1.2]) {
      for (let r = 0; r <= ringCount; r++) {
        const u01 = r / ringCount;
        const coilCenterX = anchorX + u01 * freeLength;
        let minCompressedX = Infinity;
        let maxCompressedX = -Infinity;

        for (let k = 0; k < radialSamples; k++) {
          const phi = (k / radialSamples) * Math.PI * 2;
          const vx = coilCenterX + Math.cos(phi) * wireRadius;
          const vy = Math.sin(phi) * wireRadius;
          const pt = { x: vx, y: vy, z: 0.45 };

          applySpringCompressionInto(
            pt,
            [u01, coilCenterX, anchorX, SPRING_AXIS_X],
            scale
          );
          minCompressedX = Math.min(minCompressedX, pt.x);
          maxCompressedX = Math.max(maxCompressedX, pt.x);
        }

        const compressedWireDiameter = maxCompressedX - minCompressedX;
        expect(compressedWireDiameter).toBeCloseTo(wireRadius * 2, 6);

        // Stationary anchor ring (r === 0) must stay pinned at anchorX
        if (r === 0) {
          expect((minCompressedX + maxCompressedX) * 0.5).toBeCloseTo(
            anchorX,
            6
          );
        }
      }
    }

    // Y-axis magazine spring compression invariance
    const anchorY = -6.5;
    const ringCenterY = 1.5;
    const topWire = { x: 0, y: ringCenterY + wireRadius, z: 0 };
    const botWire = { x: 0, y: ringCenterY - wireRadius, z: 0 };
    applySpringCompressionInto(
      topWire,
      [0.8, ringCenterY, anchorY, SPRING_AXIS_Y],
      0.4
    );
    applySpringCompressionInto(
      botWire,
      [0.8, ringCenterY, anchorY, SPRING_AXIS_Y],
      0.4
    );
    expect(topWire.y - botWire.y).toBeCloseTo(wireRadius * 2, 6);

    // Non-spring (mode 0) & WebGL default disabled vec4 attribute (0, 0, 0, 1) invariance
    const nonSpring = { x: 4.2, y: -1.7, z: 0.3 };
    applySpringCompressionInto(nonSpring, [0, 0, 0, SPRING_AXIS_NONE], 0.25);
    expect(nonSpring.x).toBeCloseTo(4.2, 6);
    expect(nonSpring.y).toBeCloseTo(-1.7, 6);
    expect(computeSpringCompressedCoord(4.2, 0, 0, 0.25)).toBeCloseTo(
      4.2 * 1 + 0,
      6
    );
  });

  it('configures Two-Pass WebGL Stencil Cross-Section Capping & PBR max anisotropy cleanly', () => {
    const planes = [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.06)];
    expect(sectionPlaneZ(planes[0])).toBeCloseTo(0.06, 6);

    const pass = getSectionStencilPassMaterials(planes);
    expect(pass.back.side).toBe(THREE.BackSide);
    expect(pass.back.colorWrite).toBe(false);
    expect(pass.back.depthWrite).toBe(false);
    expect(pass.back.stencilWrite).toBe(true);
    expect(pass.back.stencilZPass).toBe(THREE.IncrementWrapStencilOp);

    expect(pass.front.side).toBe(THREE.FrontSide);
    expect(pass.front.colorWrite).toBe(false);
    expect(pass.front.depthWrite).toBe(false);
    expect(pass.front.stencilWrite).toBe(true);
    expect(pass.front.stencilZPass).toBe(THREE.DecrementWrapStencilOp);

    // Cap clears stencil back to 0 on every stencil outcome so sliced shells never bleed
    const capSlide = getSectionCapMaterial('nitride_steel', 'slide');
    const capFrame = getSectionCapMaterial('polymer_frame', 'frame');
    expect(capFrame).not.toBe(capSlide);
    expect(capSlide.uniforms.uHatchDir.value).toBe(1);
    expect(capFrame.uniforms.uHatchDir.value).toBe(-1);
    expect(capSlide.stencilWrite).toBe(true);
    expect(capSlide.stencilFunc).toBe(THREE.NotEqualStencilFunc);
    expect(capSlide.stencilRef).toBe(0);
    expect(capSlide.stencilFail).toBe(THREE.ZeroStencilOp);
    expect(capSlide.stencilZFail).toBe(THREE.ZeroStencilOp);
    expect(capSlide.stencilZPass).toBe(THREE.ZeroStencilOp);

    // Alternating ISO +45° vs -45° hatch directions and authentic cross-section albedos
    const slideStyle = getSectionCapStyle('nitride_steel', 'slide');
    const frameStyle = getSectionCapStyle('polymer_frame', 'frame');
    const brassStyle = getSectionCapStyle('copper_accent', 'fire_control');
    const followerStyle = getSectionCapStyle('follower_orange', 'magazine');
    expect(slideStyle.base).toBe('#94a3b8');
    expect(frameStyle.base).toBe('#334155');
    expect(brassStyle.base).toBe('#c2853f');
    expect(followerStyle.base).toBe('#f97316');
    expect(slideStyle.hatchDir).toBe(1);
    expect(frameStyle.hatchDir).toBe(-1);
    expect(brassStyle.hatchDir).toBe(1);
    expect(followerStyle.hatchDir).toBe(-1);

    // Deterministic non-overlapping contiguous renderOrder triples per sliced part
    const s0 = acquireSectionCapSlot();
    const s1 = acquireSectionCapSlot();
    const o0 = sectionCapRenderOrders(s0);
    const o1 = sectionCapRenderOrders(s1);
    expect(o0).toEqual({
      back: SECTION_CAP_RENDER_ORDER_BASE + s0 * 3,
      front: SECTION_CAP_RENDER_ORDER_BASE + s0 * 3 + 1,
      cap: SECTION_CAP_RENDER_ORDER_BASE + s0 * 3 + 2,
    });
    expect(o1.back).toBeGreaterThan(o0.cap);
    releaseSectionCapSlot(s0);
    releaseSectionCapSlot(s1);

    // Cap bounding rect straddling check at z = 0.06
    const box = new THREE.Box3(
      new THREE.Vector3(-10, -2, -1.2),
      new THREE.Vector3(14, 3, 1.2)
    );
    const rect: SectionCapRect = {
      visible: false,
      cx: 0,
      cy: 0,
      width: 0,
      height: 0,
      z: 0,
    };
    computeSectionCapRectInto(box, new THREE.Matrix4(), 0.06, 0.1, rect);
    expect(rect.visible).toBe(true);
    expect(rect.cx).toBeCloseTo(2, 5);
    expect(rect.cy).toBeCloseTo(0.5, 5);
    expect(rect.width).toBeCloseTo(24.2, 5);
    expect(rect.height).toBeCloseTo(5.2, 5);
    expect(rect.z).toBeCloseTo(0.06, 5);

    // Shifted completely behind z = 0.06 -> cap hidden
    const shifted = new THREE.Matrix4().makeTranslation(0, 0, -5);
    computeSectionCapRectInto(box, shifted, 0.06, 0.1, rect);
    expect(rect.visible).toBe(false);

    // Raycast helper returns null so internal picking is never obstructed
    expect(noRaycast()).toBeNull();

    // PBR texture anisotropy & mipmap filtering
    expect(PBR_DEFAULT_ANISOTROPY).toBe(12);
    expect(PBR_MAX_ANISOTROPY).toBe(16);
    expect(configurePbrTextureAnisotropy(32)).toBe(16);
    expect(getPbrTextureAnisotropy()).toBe(16);
    const tex = new THREE.Texture();
    applyPbrTextureFiltering(tex);
    expect(tex.anisotropy).toBe(16);
    expect(tex.minFilter).toBe(THREE.LinearMipmapLinearFilter);
    expect(tex.magFilter).toBe(THREE.LinearFilter);
    expect(configurePbrTextureAnisotropy(8)).toBe(8);
    expect(configurePbrTextureAnisotropy(PBR_DEFAULT_ANISOTROPY)).toBe(12);
    tex.dispose();
  });
});

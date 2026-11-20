import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { describe, expect, it } from 'vitest';
import {
  AZIMUTH_DIAL_TEXTURE_SIZE,
  TURNTABLE_PEDESTAL_PROFILE,
  buildTurntablePedestalGeometries,
  getAzimuthDialTexture,
  paintAzimuthDial,
  paintSpunFinish,
} from '../src/engine/actors/ExhibitionTurntable';
import {
  ARMORY_POSTFX_DEFAULTS,
  computeGtaoInternalSize,
  computeMacroBokehParams,
  createArmoryComposerRenderTarget,
  createFilmicLensPass,
  getFilmicLensPresetParams,
  getPostProcessingPresetParams,
  hardenBloomPassAgainstNaN,
  hardenGtaoPassAgainstNaN,
  hardenOutputPassAgainstNaN,
  resolveEffectiveBloomStrength,
  resolveEffectiveBloomThreshold,
  resolveGtaoBlendIntensity,
  shouldExcludeFromGtaoPass,
} from '../src/engine/canvas/ArmoryPostProcessing';
import {
  GRAPHICS_QUALITY_TIERS,
  createFpsWatchdogState,
  getGraphicsQualityProfile,
  stepDownGraphicsQuality,
  updateFpsWatchdog,
} from '../src/engine/canvas/graphicsQuality';
import {
  STUDIO_HDRI_FILES,
  getStudioHdriEnvIntensity,
  getStudioHdriFileName,
} from '../src/engine/canvas/studioHdriManager';
import { resolveHdriUrl, resolveModelUrl } from '../src/engine/utils/assetUrl';
import {
  ARMORY_ENVIRONMENTS,
  ARMORY_ENVIRONMENT_PRESETS,
  DEFAULT_ARMORY_ENVIRONMENT,
  PROTRACTOR_LABELED_ANGLES,
  SAAMI_REFERENCE_CARTRIDGES,
  TAKEDOWN_MAT_SPEC,
  buildAzimuthDialMarks,
  buildCartridgeProfileMm,
  buildProtractorGraduations,
  buildRulerTicks,
  buildTakedownMatGeometries,
  canCreateCanvasTextures,
  createSeededRandom,
  getArmoryEnvironment,
  getGunsmithMatTextures,
  getMatTrayBounds,
  paintGunsmithMatAlbedo,
  paintGunsmithMatRoughness,
} from '../src/engine/canvas/GunsmithStageMat';
import {
  evaluateWeaponTurntableEnvelopeInto,
  getTurntableRadius,
} from '../src/engine/canvas/turntableStageMetrics';
import { WEAPON_IDS } from '../src/weapons/types';

const HEX_COLOR_RE = /^#[0-9a-fA-F]{6}$/;

function createMockCanvas2dContext(
  width: number,
  height: number
): {
  ctx: CanvasRenderingContext2D;
  drawnTexts: string[];
  imageDataBuffer: Uint8ClampedArray;
} {
  const drawnTexts: string[] = [];
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
    moveTo: () => {},
    lineTo: () => {},
    quadraticCurveTo: () => {},
    arc: () => {},
    fill: () => {},
    stroke: () => {},
    setLineDash: () => {},
    fillText: (text: string) => {
      drawnTexts.push(text);
    },
    createRadialGradient: () => gradientStub,
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
    imageDataBuffer,
  };
}

function assertFiniteGeometry(geo: THREE.BufferGeometry, label: string): void {
  const pos = geo.getAttribute('position');
  expect(pos, `${label} missing position`).toBeDefined();
  expect(pos.count, `${label} empty vertices`).toBeGreaterThan(0);
  for (let i = 0; i < pos.array.length; i++) {
    expect(Number.isFinite(pos.array[i]), `${label} non-finite pos[${i}]`).toBe(
      true
    );
  }
  const norm = geo.getAttribute('normal');
  expect(norm, `${label} missing normal`).toBeDefined();
  for (let i = 0; i < norm.array.length; i++) {
    expect(
      Number.isFinite(norm.array[i]),
      `${label} non-finite normal[${i}]`
    ).toBe(true);
  }
}

describe('studio environment profiles & 3D gunsmith takedown mat', () => {
  it('defines complete bilingual dark/light studio presets with tactical_vault as default', () => {
    expect(DEFAULT_ARMORY_ENVIRONMENT).toBe('tactical_vault');
    expect(ARMORY_ENVIRONMENT_PRESETS).toEqual([
      'tactical_vault',
      'gunsmith_bench',
      'blueprint_daylight',
    ]);

    expect(ARMORY_ENVIRONMENTS.tactical_vault.background.toLowerCase()).toBe(
      '#0b1017'
    );
    expect(ARMORY_ENVIRONMENTS.gunsmith_bench.background.toLowerCase()).toBe(
      '#14181f'
    );
    expect(
      ARMORY_ENVIRONMENTS.blueprint_daylight.background.toLowerCase()
    ).toBe('#dce4ee');

    for (const preset of ARMORY_ENVIRONMENT_PRESETS) {
      const cfg = getArmoryEnvironment(preset);
      expect(cfg.id).toBe(preset);
      expect(cfg.labelZh.trim().length).toBeGreaterThan(0);
      expect(cfg.labelEn.trim().length).toBeGreaterThan(0);
      expect(cfg.descriptionZh.trim().length).toBeGreaterThan(8);
      expect(cfg.descriptionEn.trim().length).toBeGreaterThan(12);

      expect(cfg.background).toMatch(HEX_COLOR_RE);
      expect(cfg.fog.color).toMatch(HEX_COLOR_RE);
      expect(cfg.fog.far).toBeGreaterThan(cfg.fog.near);
      expect(cfg.environmentBackground).toMatch(HEX_COLOR_RE);
      expect(cfg.keyLight.color).toMatch(HEX_COLOR_RE);
      expect(cfg.rimLight.color).toMatch(HEX_COLOR_RE);
      expect(cfg.fillLight.color).toMatch(HEX_COLOR_RE);
      expect(cfg.keyLight.intensity).toBeGreaterThan(1.5);
      expect(cfg.lightformers.length).toBeGreaterThanOrEqual(6);
      expect(cfg.toneMappingExposure).toBeGreaterThanOrEqual(0.85);
      expect(cfg.toneMappingExposure).toBeLessThanOrEqual(1.45);
      expect(cfg.mat.rubber).toMatch(HEX_COLOR_RE);
      expect(cfg.turntable.platter).toMatch(HEX_COLOR_RE);
    }
  });

  it('builds 1:1 metric beveled neoprene takedown mat with raised perimeter lip & upper-right recessed magnetic tray', () => {
    const geos = buildTakedownMatGeometries();
    try {
      assertFiniteGeometry(geos.slab, 'mat.slab');
      assertFiniteGeometry(geos.lip, 'mat.lip');
      assertFiniteGeometry(geos.trayFloor, 'mat.trayFloor');

      geos.slab.computeBoundingBox();
      geos.lip.computeBoundingBox();
      geos.trayFloor.computeBoundingBox();

      const slabBox = geos.slab.boundingBox!;
      const lipBox = geos.lip.boundingBox!;
      const trayBox = geos.trayFloor.boundingBox!;

      // 110 cm × 52 cm × 0.45 cm slab resting on y = 0 (gridY) with top working face at +0.45 cm
      expect(slabBox.max.x - slabBox.min.x).toBeCloseTo(110, 1);
      expect(slabBox.max.z - slabBox.min.z).toBeCloseTo(52, 1);
      expect(slabBox.min.y).toBeCloseTo(0, 2);
      expect(slabBox.max.y).toBeCloseTo(0.45, 2);

      // Raised ~0.3 cm perimeter lip above +0.45 cm working surface (-> +0.74..0.75 cm)
      expect(lipBox.max.y).toBeCloseTo(
        TAKEDOWN_MAT_SPEC.thicknessCm + TAKEDOWN_MAT_SPEC.lipHeightCm,
        1
      );

      // Upper-right (+X, -Z) recessed magnetic parts tray compartments (0.30 cm recess -> +0.15 cm)
      const tb = getMatTrayBounds();
      expect(tb.minX).toBeGreaterThan(20);
      expect(tb.maxX).toBeLessThan(TAKEDOWN_MAT_SPEC.widthCm / 2);
      expect(tb.maxZ).toBeLessThan(-8);
      expect(trayBox.max.y).toBeCloseTo(
        TAKEDOWN_MAT_SPEC.thicknessCm - TAKEDOWN_MAT_SPEC.trayRecessCm,
        2
      );

      // Planar UVs strictly inside [0, 1]
      const uv = geos.slab.getAttribute('uv');
      expect(uv).toBeDefined();
      for (let i = 0; i < uv.array.length; i++) {
        expect(uv.array[i]).toBeGreaterThanOrEqual(0);
        expect(uv.array[i]).toBeLessThanOrEqual(1);
      }
    } finally {
      geos.slab.dispose();
      geos.lip.dispose();
      geos.trayFloor.dispose();
    }
  });

  it('generates accurate 1cm/5cm vernier ticks, FCG sear protractor angles & 7 SAAMI 1:1 cartridge profiles', () => {
    const xTicks = buildRulerTicks(1000, 10);
    expect(xTicks).toHaveLength(101);
    expect(xTicks[0]).toEqual({ mm: 0, kind: 'major', label: '0' });
    expect(xTicks[1]).toEqual({ mm: 10, kind: 'minor', label: null });
    expect(xTicks[5]).toEqual({ mm: 50, kind: 'mid', label: '50' });
    expect(xTicks[100]).toEqual({ mm: 1000, kind: 'major', label: '1000' });

    const grad = buildProtractorGraduations();
    for (const angle of PROTRACTOR_LABELED_ANGLES) {
      const hit = grad.find((g) => g.deg === angle);
      expect(hit?.kind).toBe('labeled');
    }

    expect(SAAMI_REFERENCE_CARTRIDGES).toHaveLength(7);
    for (const c of SAAMI_REFERENCE_CARTRIDGES) {
      expect(c.overallLengthMm).toBeGreaterThan(c.caseLengthMm);
      expect(c.muzzleEnergyJ).toBeGreaterThanOrEqual(500);
      expect(c.muzzleEnergyJ).toBeLessThanOrEqual(18000);
      const { casePts, bulletPts } = buildCartridgeProfileMm(c);
      expect(casePts.length).toBeGreaterThanOrEqual(7);
      expect(bulletPts.length).toBeGreaterThanOrEqual(14);
    }

    // Deterministic seeded PRNG repeatability
    const r1 = createSeededRandom(42);
    const r2 = createSeededRandom(42);
    for (let i = 0; i < 8; i++) {
      expect(r1()).toBe(r2());
    }
  });

  it('guards DOM absence cleanly in Node and paints complete mat/dial markings on Canvas2D contexts', () => {
    if (typeof document === 'undefined') {
      expect(canCreateCanvasTextures()).toBe(false);
      expect(getGunsmithMatTextures('tactical_vault')).toBeNull();
      expect(getAzimuthDialTexture('tactical_vault')).toBeNull();
    }

    const albedoMock = createMockCanvas2dContext(256, 128);
    paintGunsmithMatAlbedo(albedoMock.ctx, 256, 128, 'tactical_vault');
    expect(albedoMock.drawnTexts.some((t) => t.includes('+X MUZZLE'))).toBe(
      true
    );
    expect(
      albedoMock.drawnTexts.some((t) => t.includes('MAGNETIC PARTS TRAY'))
    ).toBe(true);
    expect(
      albedoMock.drawnTexts.some((t) => t.includes('FCG SEAR ANGLE'))
    ).toBe(true);
    expect(albedoMock.drawnTexts).toContain('45°');
    expect(albedoMock.drawnTexts).toContain('90°');
    expect(albedoMock.drawnTexts).toContain('1000');

    const roughMock = createMockCanvas2dContext(128, 64);
    paintGunsmithMatRoughness(roughMock.ctx, 128, 64);
    expect(roughMock.drawnTexts.length).toBeGreaterThan(20);
  });
});

describe('CNC billet exhibition turntable & 360° azimuth vernier ring', () => {
  it('preserves dynamic envelope sizing across all 23 exhibits and spans platterTopY -> gridFloorY', () => {
    expect(AZIMUTH_DIAL_TEXTURE_SIZE).toBe(2048);
    expect(WEAPON_IDS).toHaveLength(23);

    for (const weaponId of WEAPON_IDS) {
      const r = getTurntableRadius(weaponId);
      const env = evaluateWeaponTurntableEnvelopeInto(weaponId, 0);
      expect(env.radius).toBeCloseTo(r, 5);
      expect(env.platterTopY - env.gridFloorY).toBeCloseTo(
        TURNTABLE_PEDESTAL_PROFILE.totalHeight,
        5
      );

      const geos = buildTurntablePedestalGeometries(r);
      try {
        assertFiniteGeometry(geos.platter, `${weaponId}.platter`);
        assertFiniteGeometry(geos.chassis, `${weaponId}.chassis`);
        assertFiniteGeometry(geos.dial, `${weaponId}.dial`);

        geos.platter.computeBoundingBox();
        geos.chassis.computeBoundingBox();
        expect(geos.platter.boundingBox!.max.y).toBeCloseTo(0, 3);
        expect(geos.chassis.boundingBox!.min.y).toBeCloseTo(
          -TURNTABLE_PEDESTAL_PROFILE.totalHeight,
          3
        );
      } finally {
        geos.platter.dispose();
        geos.chassis.dispose();
        geos.accentGroove.dispose();
        geos.dial.dispose();
        geos.insert.dispose();
        geos.statusRing.dispose();
        geos.indexNotch.dispose();
      }
    }
  });

  it('builds 72 5° vernier ticks and 12 30° numerals on the laser-etched azimuth dial', () => {
    const marks = buildAzimuthDialMarks();
    expect(marks).toHaveLength(72);
    expect(marks.filter((m) => m.kind === 'cardinal')).toHaveLength(4);
    expect(marks.filter((m) => m.label !== null)).toHaveLength(12);
    expect(marks[0]).toEqual({ deg: 0, kind: 'cardinal', label: '000' });
    expect(marks[6]).toEqual({ deg: 30, kind: 'major', label: '030' });

    const dialMock = createMockCanvas2dContext(256, 256);
    paintAzimuthDial(dialMock.ctx, 256, {
      etch: '#a9b8ca',
      etchMajor: '#e8eef6',
      accent: '#f59e0b',
    });
    expect(dialMock.drawnTexts).toContain('000°');
    expect(dialMock.drawnTexts).toContain('090°');
    expect(dialMock.drawnTexts).toContain('180°');
    expect(dialMock.drawnTexts).toContain('270°');
    expect(dialMock.drawnTexts.some((t) => t.includes('AZIMUTH'))).toBe(true);

    const spunMock = createMockCanvas2dContext(128, 128);
    expect(() => paintSpunFinish(spunMock.ctx, 128)).not.toThrow();
  });
});

describe('native Three.js r169 post-processing pipeline & stencil buffer invariants', () => {
  it('allocates HalfFloat EffectComposer render targets with stencilBuffer + depthBuffer enabled', () => {
    const rt = createArmoryComposerRenderTarget(1920, 1080);
    const cloned = rt.clone();
    try {
      expect(rt.width).toBe(1920);
      expect(rt.height).toBe(1080);
      expect(rt.stencilBuffer).toBe(true);
      expect(rt.depthBuffer).toBe(true);
      expect(rt.texture.type).toBe(THREE.HalfFloatType);
      expect(rt.texture.colorSpace).toBe(THREE.LinearSRGBColorSpace);

      // EffectComposer clones renderTarget1 -> renderTarget2; stencil MUST survive clone()
      expect(cloned.stencilBuffer).toBe(true);
      expect(cloned.depthBuffer).toBe(true);
      expect(cloned.texture.type).toBe(THREE.HalfFloatType);
    } finally {
      rt.dispose();
      cloned.dispose();
    }
  });

  it('configures AgX tone mapping, 1.8cm GTAO radius & selective HDR bloom (threshold >= 3.2)', () => {
    expect(ARMORY_POSTFX_DEFAULTS.gtao.radius).toBeCloseTo(1.8, 5);
    expect(ARMORY_POSTFX_DEFAULTS.bloom.threshold).toBeCloseTo(3.2, 5);
    expect(ARMORY_POSTFX_DEFAULTS.bloom.strength).toBeCloseTo(0.32, 5);
    expect(ARMORY_POSTFX_DEFAULTS.bloom.radius).toBeCloseTo(0.45, 5);

    for (const preset of ARMORY_ENVIRONMENT_PRESETS) {
      const p = getPostProcessingPresetParams(preset);
      expect(p.toneMapping).toBe(THREE.AgXToneMapping);
      expect(p.gtao.radius).toBeCloseTo(1.8, 5);
      expect(p.gtao.screenSpaceRadius).toBe(false);
      expect(p.bloom.threshold).toBeGreaterThanOrEqual(3.2);
      expect(p.bloom.strength).toBeGreaterThan(0);
    }

    const half = computeGtaoInternalSize(1920, 1080, 'half', 1);
    expect(half.width).toBe(960);
    expect(half.height).toBe(540);

    const retina = computeGtaoInternalSize(3840, 2160, 'adaptive', 2);
    expect(retina.width).toBeLessThanOrEqual(2160);
    expect(retina.height).toBeLessThanOrEqual(1215);

    expect(resolveGtaoBlendIntensity(0.95, false, false)).toBeCloseTo(0.95, 5);
    expect(resolveGtaoBlendIntensity(0.95, true, false)).toBeLessThan(0.65);
    expect(resolveGtaoBlendIntensity(0.95, false, true)).toBeLessThan(0.95);

    // Cutaway inner steel walls must never haze in white bloom outside firing mode
    expect(resolveEffectiveBloomStrength(0.36, true, false)).toBe(0);
    expect(resolveEffectiveBloomStrength(0.36, true, true)).toBeLessThan(0.2);
    expect(resolveEffectiveBloomStrength(0.36, false, true)).toBeCloseTo(0.36, 5);
    expect(resolveEffectiveBloomThreshold(3.2, true, true)).toBeGreaterThanOrEqual(4.8);
  });

  it('excludes X-Ray shells, stencil cap helpers, section-clipped housings, grid shaders & additive VFX from GTAO G-buffer', () => {
    const geo = new THREE.BoxGeometry(1, 1, 1);
    try {
      const opaquePart = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({ color: '#222', transparent: false })
      );
      expect(shouldExcludeFromGtaoPass(opaquePart)).toBe(false);

      const xrayShell = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          transparent: true,
          opacity: 0.18,
          depthWrite: false,
        })
      );
      expect(shouldExcludeFromGtaoPass(xrayShell)).toBe(true);

      const stencilBackfaceHelper = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          colorWrite: false,
          depthWrite: false,
          stencilWrite: true,
        })
      );
      expect(shouldExcludeFromGtaoPass(stencilBackfaceHelper)).toBe(true);

      const stencilCapQuad = new THREE.Mesh(
        geo,
        new THREE.ShaderMaterial({
          stencilWrite: true,
          stencilFunc: THREE.NotEqualStencilFunc,
        })
      );
      expect(shouldExcludeFromGtaoPass(stencilCapQuad)).toBe(true);

      const sectionSlicedHousing = new THREE.Mesh(
        geo,
        new THREE.MeshPhysicalMaterial({
          clippingPlanes: [new THREE.Plane(new THREE.Vector3(0, 0, -1), 0.06)],
        })
      );
      expect(shouldExcludeFromGtaoPass(sectionSlicedHousing)).toBe(true);

      const muzzleFlash = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          blending: THREE.AdditiveBlending,
          transparent: true,
        })
      );
      expect(shouldExcludeFromGtaoPass(muzzleFlash)).toBe(true);

      const edgeLine = new THREE.LineSegments(
        geo,
        new THREE.LineBasicMaterial()
      );
      expect(shouldExcludeFromGtaoPass(edgeLine)).toBe(true);

      opaquePart.material.dispose();
      xrayShell.material.dispose();
      stencilBackfaceHelper.material.dispose();
      stencilCapQuad.material.dispose();
      sectionSlicedHousing.material.dispose();
      muzzleFlash.material.dispose();
      edgeLine.material.dispose();
    } finally {
      geo.dispose();
    }
  });

  it('hardens GTAOPass, UnrealBloomPass & OutputPass against HalfFloat NaN / Infinity black-box artifacts', () => {
    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(41, 16 / 9, 0.1, 560);
    const gtaoPass = new GTAOPass(scene, camera, 512, 512);
    const bloomPass = new UnrealBloomPass(
      new THREE.Vector2(512, 512),
      0.32,
      0.45,
      3.2
    );
    const outputPass = new OutputPass();

    try {
      hardenGtaoPassAgainstNaN(gtaoPass);
      expect(gtaoPass.gtaoRenderTarget.texture.type).toBe(
        THREE.UnsignedByteType
      );
      expect(gtaoPass.pdRenderTarget.texture.type).toBe(THREE.UnsignedByteType);
      expect(gtaoPass.gtaoMaterial.fragmentShader).toContain(
        'dot(viewDelta, viewDelta) > 1e-8'
      );
      expect(gtaoPass.gtaoMaterial.fragmentShader).toContain(
        'clamp(cosHorizons, vec2(-0.99999), vec2(0.99999))'
      );
      expect(gtaoPass.gtaoMaterial.fragmentShader).toContain(
        'pow(max(ao, 1e-5), scale)'
      );
      expect(gtaoPass.pdMaterial.fragmentShader).toContain(
        'pow(max(normalDiff, 1e-5), normalPhi)'
      );

      hardenBloomPassAgainstNaN(bloomPass);
      expect(bloomPass.materialHighPassFilter.fragmentShader).toContain(
        'floatBitsToUint'
      );
      expect(bloomPass.materialHighPassFilter.fragmentShader).toContain(
        'armorySanitizeHdrRgb'
      );

      hardenOutputPassAgainstNaN(outputPass);
      expect(outputPass.material.glslVersion).toBe(THREE.GLSL3);
      expect(outputPass.material.fragmentShader).toContain('floatBitsToUint');
      expect(outputPass.material.fragmentShader).toContain(
        'armorySanitizeHdrRgb'
      );
    } finally {
      gtaoPass.dispose();
      bloomPass.dispose();
      outputPass.dispose();
    }
  });

  it('ships valid 32-bit Radiance studio HDRIs, macro Bokeh DOF, filmic lens finish & 3-tier adaptive FPS watchdog (PR-01)', () => {
    const hdriDir = path.resolve(process.cwd(), 'public/hdri');
    for (const preset of ARMORY_ENVIRONMENT_PRESETS) {
      const fileName = getStudioHdriFileName(preset);
      expect(fileName).toBe(STUDIO_HDRI_FILES[preset]);
      expect(getStudioHdriEnvIntensity(preset)).toBeGreaterThanOrEqual(0.8);
      expect(getStudioHdriEnvIntensity(preset)).toBeLessThanOrEqual(1.3);

      const fullPath = path.join(hdriDir, fileName);
      expect(fs.existsSync(fullPath), `missing ${fileName}`).toBe(true);
      const header = fs.readFileSync(fullPath).subarray(0, 32).toString('ascii');
      expect(header).toContain('#?RADIANCE');

      expect(resolveHdriUrl(fileName, '/digital-armory-3d/')).toBe(
        `/digital-armory-3d/hdri/${fileName}`
      );
    }
    expect(resolveModelUrl('p08.glb', '/digital-armory-3d/')).toBe(
      '/digital-armory-3d/models/p08.glb'
    );

    // Macro Bokeh DOF: off at full-gun distance or during cutaway/caliper; activates smoothly on close-ups
    expect(computeMacroBokehParams(54, true, false).enabled).toBe(false);
    expect(computeMacroBokehParams(20, true, true).enabled).toBe(false);
    expect(computeMacroBokehParams(20, false, false).enabled).toBe(false);
    const closeUp = computeMacroBokehParams(22, true, false);
    expect(closeUp.enabled).toBe(true);
    expect(closeUp.focus).toBeCloseTo(22, 4);
    expect(closeUp.aperture).toBeGreaterThan(0);
    expect(closeUp.aperture).toBeLessThanOrEqual(0.0002);

    // Filmic lens finish: vignette & micro-grain active on dark presets, off in blueprint daylight
    expect(getFilmicLensPresetParams('tactical_vault').vignetteStrength).toBeGreaterThan(0.1);
    expect(getFilmicLensPresetParams('blueprint_daylight').vignetteStrength).toBe(0);
    const lensPass = createFilmicLensPass('tactical_vault');
    expect(lensPass.uniforms.uVignetteStrength.value).toBeCloseTo(0.2, 4);
    lensPass.dispose();

    // 3-tier adaptive quality profiles & FPS watchdog
    expect(GRAPHICS_QUALITY_TIERS).toEqual(['ultra', 'balanced', 'eco']);
    expect(getGraphicsQualityProfile('ultra').macroDofCapable).toBe(true);
    expect(getGraphicsQualityProfile('balanced').gtaoQuality).toBe('half');
    expect(getGraphicsQualityProfile('eco').gtaoEnabled).toBe(false);
    expect(stepDownGraphicsQuality('ultra')).toBe('balanced');
    expect(stepDownGraphicsQuality('balanced')).toBe('eco');
    expect(stepDownGraphicsQuality('eco')).toBeNull();

    const wd = createFpsWatchdogState();
    // Background tab pause spike (> 0.25s) must never falsely trigger downgrade
    expect(updateFpsWatchdog(wd, 1.5)).toBe(false);
    // Sustained 15 FPS (~0.0667s/frame) over 3 consecutive 1.2s windows triggers step-down
    let triggered = false;
    for (let f = 0; f < 65; f++) {
      if (updateFpsWatchdog(wd, 1 / 15)) {
        triggered = true;
        break;
      }
    }
    expect(triggered).toBe(true);
  });
});

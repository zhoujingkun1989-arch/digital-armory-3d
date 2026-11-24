import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
import type { WeaponScaleProfile } from '../../weapons/types';
import { resolveHdriUrl } from '../utils/assetUrl';
import type { ArmoryEnvironmentPreset } from './GunsmithStageMat';

export const STUDIO_HDRI_FILES: Readonly<
  Record<ArmoryEnvironmentPreset, string>
> = {
  tactical_vault: 'tactical_vault.hdr',
  gunsmith_bench: 'gunsmith_bench.hdr',
  blueprint_daylight: 'blueprint_daylight.hdr',
};

/**
 * Dedicated 1:1 Heavy Armor Assembly Hangar Cycles 32-bit Radiance HDRI
 * (steel roof trusses, angled clerestory skylights, industrial high-bay LED & sodium
 * work fixtures, weathered concrete bounce) bound for Main Battle Tanks on dark presets.
 */
export const HEAVY_ARMOR_HDRI_FILE = 'heavy_armor_hangar.hdr';

/**
 * Balanced environment IBL intensity multipliers for Cycles-rendered 32-bit Radiance HDRIs
 * so polished bluing, chrome, stainless, and parkerized gunmetal hold deep blacks alongside
 * crisp softbox highlights under AgX tone mapping.
 */
export const STUDIO_HDRI_ENV_INTENSITY: Readonly<
  Record<ArmoryEnvironmentPreset, number>
> = {
  tactical_vault: 1.28,
  gunsmith_bench: 1.24,
  blueprint_daylight: 0.96,
};

export interface StudioSoftboxCardSpec {
  id: string;
  position: readonly [number, number, number];
  scale: readonly [number, number];
  /** Linear HDR RGB radiance added onto the small-arms reflection dome. */
  radiance: readonly [number, number, number];
}

/**
 * Wide horizontal neutral-white & brushed-silver studio softbox reflection cards
 * composited additively into the small-arms PMREM environment for dark studio presets.
 * Ensures vertical chrome/stainless flats (e.g. Desert Eagle .50 AE Chrome, Colt Python)
 * and dark parkerized steel bevels reflect luminous photographic light ribbons rather than black void.
 */
export const STUDIO_SOFTBOX_REFLECTION_CARDS: Readonly<
  Record<'tactical_vault' | 'gunsmith_bench', readonly StudioSoftboxCardSpec[]>
> = {
  tactical_vault: [
    {
      id: 'overhead_key_ribbon',
      position: [0, 22, 4],
      scale: [46, 10],
      radiance: [1.52, 1.56, 1.64],
    },
    {
      id: 'front_chrome_horizon_strip',
      position: [4, 6.2, 26],
      scale: [54, 11],
      radiance: [2.45, 2.52, 2.64],
    },
    {
      id: 'front_mid_chrome_ribbon',
      position: [0, 2.0, 26],
      scale: [58, 7.5],
      radiance: [2.65, 2.7, 2.78],
    },
    {
      id: 'front_lower_silver_bounce',
      position: [0, -3.6, 26],
      scale: [52, 9],
      radiance: [1.42, 1.5, 1.62],
    },
    {
      id: 'rear_chrome_horizon_strip',
      position: [-4, 6.2, -26],
      scale: [54, 11],
      radiance: [2.25, 2.34, 2.48],
    },
    {
      id: 'rear_mid_chrome_ribbon',
      position: [0, 2.0, -26],
      scale: [58, 7.5],
      radiance: [2.35, 2.4, 2.5],
    },
    {
      id: 'rear_lower_silver_bounce',
      position: [0, -3.6, -26],
      scale: [52, 9],
      radiance: [1.32, 1.4, 1.52],
    },
    {
      id: 'muzzle_end_rim_card',
      position: [28, 5.5, 4],
      scale: [22, 7.5],
      radiance: [1.22, 1.26, 1.34],
    },
    {
      id: 'breech_end_rim_card',
      position: [-28, 5.5, -4],
      scale: [22, 7.5],
      radiance: [1.14, 1.2, 1.3],
    },
  ],
  gunsmith_bench: [
    {
      id: 'overhead_shop_ribbon',
      position: [0, 22, 2],
      scale: [48, 10],
      radiance: [1.58, 1.48, 1.34],
    },
    {
      id: 'front_chrome_horizon_strip',
      position: [4, 6.2, 26],
      scale: [54, 11],
      radiance: [2.22, 2.18, 2.1],
    },
    {
      id: 'front_mid_chrome_ribbon',
      position: [0, 2.0, 26],
      scale: [58, 7.5],
      radiance: [2.38, 2.36, 2.32],
    },
    {
      id: 'front_lower_silver_bounce',
      position: [0, -3.6, 26],
      scale: [52, 9],
      radiance: [1.28, 1.3, 1.34],
    },
    {
      id: 'rear_chrome_horizon_strip',
      position: [-4, 6.2, -26],
      scale: [54, 11],
      radiance: [2.05, 2.12, 2.24],
    },
    {
      id: 'rear_mid_chrome_ribbon',
      position: [0, 2.0, -26],
      scale: [58, 7.5],
      radiance: [2.16, 2.18, 2.24],
    },
    {
      id: 'rear_lower_silver_bounce',
      position: [0, -3.6, -26],
      scale: [52, 9],
      radiance: [1.18, 1.24, 1.32],
    },
    {
      id: 'muzzle_end_rim_card',
      position: [28, 5.5, 4],
      scale: [22, 7.5],
      radiance: [1.24, 1.18, 1.1],
    },
    {
      id: 'breech_end_rim_card',
      position: [-28, 5.5, -4],
      scale: [22, 7.5],
      radiance: [1.08, 1.16, 1.26],
    },
  ],
};

function createSoftboxFeatherDataTexture(size = 64): THREE.DataTexture {
  const data = new Uint8Array(size * size * 4);
  for (let y = 0; y < size; y++) {
    const ny = ((y + 0.5) / size) * 2 - 1;
    const fy = 1 - Math.min(1, Math.pow(Math.abs(ny), 2.4));
    const sy = fy * fy * (3 - 2 * fy);
    for (let x = 0; x < size; x++) {
      const nx = ((x + 0.5) / size) * 2 - 1;
      const fx = 1 - Math.min(1, Math.pow(Math.abs(nx), 3.0));
      const sx = fx * fx * (3 - 2 * fx);
      const alpha = Math.max(0, Math.min(255, Math.round(sx * sy * 255)));
      const idx = (y * size + x) * 4;
      data[idx] = 255;
      data[idx + 1] = 255;
      data[idx + 2] = 255;
      data[idx + 3] = alpha;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.colorSpace = THREE.NoColorSpace;
  tex.minFilter = THREE.LinearFilter;
  tex.magFilter = THREE.LinearFilter;
  tex.wrapS = THREE.ClampToEdgeWrapping;
  tex.wrapT = THREE.ClampToEdgeWrapping;
  tex.needsUpdate = true;
  return tex;
}

function buildCompositeSmallArmsPmrem(
  pmrem: THREE.PMREMGenerator,
  equirectTex: THREE.Texture,
  preset: 'tactical_vault' | 'gunsmith_bench'
): THREE.WebGLRenderTarget {
  const cards = STUDIO_SOFTBOX_REFLECTION_CARDS[preset];
  const envScene = new THREE.Scene();
  const disposables: Array<{ dispose: () => void }> = [];

  try {
    const domeGeo = new THREE.SphereGeometry(50, 48, 24);
    const domeMat = new THREE.MeshBasicMaterial({
      map: equirectTex,
      side: THREE.BackSide,
      depthWrite: false,
      toneMapped: false,
    });
    disposables.push(domeGeo, domeMat);
    const domeMesh = new THREE.Mesh(domeGeo, domeMat);
    domeMesh.renderOrder = 0;
    envScene.add(domeMesh);

    const cardGeo = new THREE.PlaneGeometry(1, 1);
    const featherTex = createSoftboxFeatherDataTexture(64);
    disposables.push(cardGeo, featherTex);

    for (const spec of cards) {
      const cardMat = new THREE.MeshBasicMaterial({
        color: new THREE.Color(
          spec.radiance[0],
          spec.radiance[1],
          spec.radiance[2]
        ),
        map: featherTex,
        transparent: true,
        blending: THREE.AdditiveBlending,
        depthTest: false,
        depthWrite: false,
        side: THREE.DoubleSide,
        toneMapped: false,
      });
      disposables.push(cardMat);
      const cardMesh = new THREE.Mesh(cardGeo, cardMat);
      cardMesh.position.set(
        spec.position[0],
        spec.position[1],
        spec.position[2]
      );
      cardMesh.scale.set(spec.scale[0], spec.scale[1], 1);
      cardMesh.lookAt(0, 0, 0);
      cardMesh.renderOrder = 1;
      envScene.add(cardMesh);
    }

    return pmrem.fromScene(envScene, 0.015, 0.1, 120);
  } finally {
    for (const item of disposables) {
      item.dispose();
    }
  }
}

/**
 * Calibrated environment IBL intensity multipliers for the Heavy Armor Assembly Hangar HDRI
 * so rolled homogeneous armor, matte CARC camo, burnished track steel, optics, and concrete
 * oil puddles read with cinema-grade depot contrast without blowing out highlights.
 */
export const HEAVY_ARMOR_HDRI_ENV_INTENSITY: Readonly<
  Record<ArmoryEnvironmentPreset, number>
> = {
  tactical_vault: 1.28,
  gunsmith_bench: 1.18,
  blueprint_daylight: 0.96,
};

export function getStudioHdriFileName(preset: ArmoryEnvironmentPreset): string {
  return STUDIO_HDRI_FILES[preset] ?? STUDIO_HDRI_FILES.tactical_vault;
}

export function isHeavyArmorHdriActive(
  preset: ArmoryEnvironmentPreset,
  scaleProfile?: WeaponScaleProfile
): boolean {
  return (
    scaleProfile === 'main_battle_tank' && preset !== 'blueprint_daylight'
  );
}

export function getStudioHdriFileNameForScale(
  preset: ArmoryEnvironmentPreset,
  scaleProfile?: WeaponScaleProfile
): string {
  if (isHeavyArmorHdriActive(preset, scaleProfile)) {
    return HEAVY_ARMOR_HDRI_FILE;
  }
  return getStudioHdriFileName(preset);
}

export function getStudioHdriEnvIntensity(
  preset: ArmoryEnvironmentPreset
): number {
  return (
    STUDIO_HDRI_ENV_INTENSITY[preset] ?? STUDIO_HDRI_ENV_INTENSITY.tactical_vault
  );
}

export function getStudioHdriEnvIntensityForScale(
  preset: ArmoryEnvironmentPreset,
  scaleProfile?: WeaponScaleProfile
): number {
  if (isHeavyArmorHdriActive(preset, scaleProfile)) {
    return (
      HEAVY_ARMOR_HDRI_ENV_INTENSITY[preset] ??
      HEAVY_ARMOR_HDRI_ENV_INTENSITY.tactical_vault
    );
  }
  return getStudioHdriEnvIntensity(preset);
}

interface RendererHdriCache {
  pmrem: THREE.PMREMGenerator;
  targets: Map<string, THREE.WebGLRenderTarget>;
  inflight: Map<string, Promise<THREE.Texture | null>>;
}

const rendererCaches = new WeakMap<THREE.WebGLRenderer, RendererHdriCache>();

function getRendererCache(renderer: THREE.WebGLRenderer): RendererHdriCache {
  let entry = rendererCaches.get(renderer);
  if (!entry) {
    const pmrem = new THREE.PMREMGenerator(renderer);
    pmrem.compileEquirectangularShader();
    entry = {
      pmrem,
      targets: new Map(),
      inflight: new Map(),
    };
    rendererCaches.set(renderer, entry);
  }
  return entry;
}

/**
 * Loads and PMREM-prefilters a Blender Cycles `.hdr` studio or heavy-armor hangar environment
 * map for the given WebGLRenderer. Results are cached per renderer & filename so switching
 * presets or weapon scales is instant, and returns `null` gracefully in headless/offline
 * environments so the procedural Lightformer fallback stays active.
 */
export function loadStudioHdriTexture(
  renderer: THREE.WebGLRenderer,
  preset: ArmoryEnvironmentPreset,
  scaleProfile?: WeaponScaleProfile
): Promise<THREE.Texture | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }

  const fileName = getStudioHdriFileNameForScale(preset, scaleProfile);
  const useSmallArmsSoftboxComposite =
    !isHeavyArmorHdriActive(preset, scaleProfile) &&
    (preset === 'tactical_vault' || preset === 'gunsmith_bench');
  const cacheKey = useSmallArmsSoftboxComposite
    ? `${fileName}#softbox`
    : fileName;
  const cache = getRendererCache(renderer);
  const existing = cache.targets.get(cacheKey);
  if (existing) {
    return Promise.resolve(existing.texture);
  }

  const inflight = cache.inflight.get(cacheKey);
  if (inflight) {
    return inflight;
  }

  const url = resolveHdriUrl(fileName);
  const loader = new RGBELoader();
  loader.setDataType(THREE.HalfFloatType);

  const promise = new Promise<THREE.Texture | null>((resolve) => {
    loader.load(
      url,
      (equirectTex) => {
        try {
          equirectTex.mapping = THREE.EquirectangularReflectionMapping;
          let rt: THREE.WebGLRenderTarget;
          if (
            useSmallArmsSoftboxComposite &&
            typeof cache.pmrem.fromScene === 'function'
          ) {
            try {
              rt = buildCompositeSmallArmsPmrem(
                cache.pmrem,
                equirectTex,
                preset
              );
            } catch {
              rt = cache.pmrem.fromEquirectangular(equirectTex);
            }
          } else {
            rt = cache.pmrem.fromEquirectangular(equirectTex);
          }
          equirectTex.dispose();
          rt.texture.name = `ArmoryStudioHDRI.${cacheKey}`;
          cache.targets.set(cacheKey, rt);
          cache.inflight.delete(cacheKey);
          resolve(rt.texture);
        } catch {
          equirectTex.dispose();
          cache.inflight.delete(cacheKey);
          resolve(null);
        }
      },
      undefined,
      () => {
        cache.inflight.delete(cacheKey);
        resolve(null);
      }
    );
  });

  cache.inflight.set(cacheKey, promise);
  return promise;
}

/**
 * Disposes and clears cached PMREM cubemaps for `renderer` (e.g. on WebGL context loss/restore).
 */
export function invalidateStudioHdriCache(
  renderer: THREE.WebGLRenderer
): void {
  const entry = rendererCaches.get(renderer);
  if (!entry) return;
  entry.targets.forEach((rt) => rt.dispose());
  entry.targets.clear();
  entry.inflight.clear();
  entry.pmrem.dispose();
  rendererCaches.delete(renderer);
}

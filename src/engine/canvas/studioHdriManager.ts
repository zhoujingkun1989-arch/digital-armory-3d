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
  tactical_vault: 1.25,
  gunsmith_bench: 1.18,
  blueprint_daylight: 0.96,
};

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
  const cache = getRendererCache(renderer);
  const existing = cache.targets.get(fileName);
  if (existing) {
    return Promise.resolve(existing.texture);
  }

  const inflight = cache.inflight.get(fileName);
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
          const rt = cache.pmrem.fromEquirectangular(equirectTex);
          equirectTex.dispose();
          rt.texture.name = `ArmoryStudioHDRI.${fileName}`;
          cache.targets.set(fileName, rt);
          cache.inflight.delete(fileName);
          resolve(rt.texture);
        } catch {
          equirectTex.dispose();
          cache.inflight.delete(fileName);
          resolve(null);
        }
      },
      undefined,
      () => {
        cache.inflight.delete(fileName);
        resolve(null);
      }
    );
  });

  cache.inflight.set(fileName, promise);
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

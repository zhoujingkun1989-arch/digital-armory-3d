import * as THREE from 'three';
import { RGBELoader } from 'three/examples/jsm/loaders/RGBELoader.js';
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

export function getStudioHdriFileName(preset: ArmoryEnvironmentPreset): string {
  return STUDIO_HDRI_FILES[preset] ?? STUDIO_HDRI_FILES.tactical_vault;
}

export function getStudioHdriEnvIntensity(
  preset: ArmoryEnvironmentPreset
): number {
  return (
    STUDIO_HDRI_ENV_INTENSITY[preset] ?? STUDIO_HDRI_ENV_INTENSITY.tactical_vault
  );
}

interface RendererHdriCache {
  pmrem: THREE.PMREMGenerator;
  targets: Map<ArmoryEnvironmentPreset, THREE.WebGLRenderTarget>;
  inflight: Map<ArmoryEnvironmentPreset, Promise<THREE.Texture | null>>;
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
 * Loads and PMREM-prefilters a Blender Cycles `.hdr` studio environment map for the given
 * WebGLRenderer. Results are cached per renderer so switching presets is instant, and returns
 * `null` gracefully in headless/offline environments so the procedural Lightformer fallback stays active.
 */
export function loadStudioHdriTexture(
  renderer: THREE.WebGLRenderer,
  preset: ArmoryEnvironmentPreset
): Promise<THREE.Texture | null> {
  if (typeof window === 'undefined' || typeof fetch === 'undefined') {
    return Promise.resolve(null);
  }

  const cache = getRendererCache(renderer);
  const existing = cache.targets.get(preset);
  if (existing) {
    return Promise.resolve(existing.texture);
  }

  const inflight = cache.inflight.get(preset);
  if (inflight) {
    return inflight;
  }

  const url = resolveHdriUrl(getStudioHdriFileName(preset));
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
          rt.texture.name = `ArmoryStudioHDRI.${preset}`;
          cache.targets.set(preset, rt);
          cache.inflight.delete(preset);
          resolve(rt.texture);
        } catch {
          equirectTex.dispose();
          cache.inflight.delete(preset);
          resolve(null);
        }
      },
      undefined,
      () => {
        cache.inflight.delete(preset);
        resolve(null);
      }
    );
  });

  cache.inflight.set(preset, promise);
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

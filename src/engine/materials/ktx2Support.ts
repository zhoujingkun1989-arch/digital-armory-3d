import * as THREE from 'three';
import { KTX2Loader } from 'three/examples/jsm/loaders/KTX2Loader.js';
import { resolveAssetUrl, normalizeTextureFileName } from '../utils/assetUrl';

export interface Ktx2Manifest {
  version: number;
  transcoderPath?: string;
  entries: Record<string, string>;
}

let ktx2LoaderInstance: KTX2Loader | null = null;
let supportInitialized = false;
let ktx2SupportedOnGpu = false;
let cachedManifest: Ktx2Manifest | null = null;

/**
 * Registers or queries whether the active WebGLRenderer supports hardware compressed
 * KTX2 / Basis Universal transcoding, setting `public/basis/` as the transcoder path.
 */
export function initKtx2Support(renderer: THREE.WebGLRenderer): boolean {
  if (typeof window === 'undefined') return false;
  try {
    if (!ktx2LoaderInstance) {
      ktx2LoaderInstance = new KTX2Loader();
      ktx2LoaderInstance.setTranscoderPath(resolveAssetUrl('basis/'));
    }
    ktx2LoaderInstance.detectSupport(renderer);
    supportInitialized = true;
    ktx2SupportedOnGpu = true;
    return true;
  } catch {
    supportInitialized = true;
    ktx2SupportedOnGpu = false;
    return false;
  }
}

export function getKtx2Loader(): KTX2Loader | null {
  return ktx2LoaderInstance;
}

export function getKtx2SupportStatus(): {
  initialized: boolean;
  gpuSupported: boolean;
  publishedCount: number;
} {
  return {
    initialized: supportInitialized,
    gpuSupported: ktx2SupportedOnGpu,
    publishedCount: cachedManifest
      ? Object.keys(cachedManifest.entries).length
      : 0,
  };
}

export function setKtx2ManifestForRuntime(manifest: Ktx2Manifest | null): void {
  cachedManifest = manifest;
}

export function resolvePreferredTexturePath(
  fileName: string,
  baseOverride?: string
): { url: string; isKtx2: boolean } {
  const normalized = normalizeTextureFileName(fileName);
  const ktx2Rel = cachedManifest?.entries[normalized];
  if (ktx2SupportedOnGpu && ktx2Rel) {
    return {
      url: resolveAssetUrl(`textures/${ktx2Rel}`, baseOverride),
      isKtx2: true,
    };
  }
  return {
    url: resolveAssetUrl(`textures/${normalized}`, baseOverride),
    isKtx2: false,
  };
}

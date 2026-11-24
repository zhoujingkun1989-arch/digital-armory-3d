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
let manifestAutoLoadAttempted = false;
let inflightManifestRequest: Promise<Ktx2Manifest | null> | null = null;

function parseKtx2ManifestPayload(raw: unknown): Ktx2Manifest | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }
  const candidate = raw as {
    version?: unknown;
    transcoderPath?: unknown;
    entries?: unknown;
  };
  if (typeof candidate.version !== 'number' || !Number.isFinite(candidate.version)) {
    return null;
  }
  if (
    !candidate.entries ||
    typeof candidate.entries !== 'object' ||
    Array.isArray(candidate.entries)
  ) {
    return null;
  }

  const cleanEntries: Record<string, string> = {};
  for (const [key, value] of Object.entries(
    candidate.entries as Record<string, unknown>
  )) {
    if (typeof value !== 'string') continue;
    const trimmedVal = value.trim().replace(/^\/+/, '');
    if (!key.trim() || !trimmedVal) continue;
    cleanEntries[normalizeTextureFileName(key)] = trimmedVal;
  }

  // Empty manifest (`entries: {}`) is an intentional silent no-op (WebP runtime fallback stays active).
  if (Object.keys(cleanEntries).length === 0) {
    return null;
  }

  const transcoderPath =
    typeof candidate.transcoderPath === 'string' &&
    candidate.transcoderPath.trim().length > 0
      ? candidate.transcoderPath.trim()
      : undefined;

  return {
    version: candidate.version,
    ...(transcoderPath ? { transcoderPath } : {}),
    entries: cleanEntries,
  };
}

/**
 * Fetches `textures/ktx2-manifest.json` from the active deployment base (or optional CDN)
 * and populates the runtime KTX2 lookup table when non-empty.
 * Silent no-op (`null`) if `fetch` is unavailable, the file is missing/unreachable,
 * malformed, or contains zero published entries.
 */
export function loadKtx2ManifestFromNetwork(
  baseOverride?: string
): Promise<Ktx2Manifest | null> {
  if (typeof fetch !== 'function') {
    return Promise.resolve(null);
  }
  if (baseOverride === undefined && inflightManifestRequest) {
    return inflightManifestRequest;
  }

  const manifestUrl = resolveAssetUrl('textures/ktx2-manifest.json', baseOverride);
  const task = (async (): Promise<Ktx2Manifest | null> => {
    try {
      const response = await fetch(manifestUrl);
      if (!response || !response.ok) {
        return null;
      }
      const payload: unknown = await response.json();
      const parsed = parseKtx2ManifestPayload(payload);
      if (!parsed) {
        return null;
      }
      cachedManifest = parsed;
      if (parsed.transcoderPath && ktx2LoaderInstance) {
        ktx2LoaderInstance.setTranscoderPath(
          resolveAssetUrl(parsed.transcoderPath, baseOverride)
        );
      }
      return parsed;
    } catch {
      return null;
    }
  })();

  if (baseOverride === undefined) {
    inflightManifestRequest = task.finally(() => {
      inflightManifestRequest = null;
    });
    return inflightManifestRequest;
  }

  return task;
}

/**
 * Registers or queries whether the active WebGLRenderer supports hardware compressed
 * KTX2 / Basis Universal transcoding, setting `public/basis/` as the transcoder path
 * and non-blockingly probing `textures/ktx2-manifest.json`.
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
    if (!cachedManifest && !manifestAutoLoadAttempted) {
      manifestAutoLoadAttempted = true;
      void loadKtx2ManifestFromNetwork();
    }
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
  if (manifest === null) {
    manifestAutoLoadAttempted = false;
  }
}

/**
 * Disposes any active KTX2Loader worker pool and resets KTX2 runtime state.
 */
export function resetKtx2Support(): void {
  if (ktx2LoaderInstance) {
    try {
      ktx2LoaderInstance.dispose();
    } catch {
      // Ignore worker teardown errors in mocked/headless environments
    }
    ktx2LoaderInstance = null;
  }
  supportInitialized = false;
  ktx2SupportedOnGpu = false;
  cachedManifest = null;
  manifestAutoLoadAttempted = false;
  inflightManifestRequest = null;
}

export function resolvePreferredTexturePath(
  fileName: string,
  baseOverride?: string
): { url: string; isKtx2: boolean } {
  const normalized = normalizeTextureFileName(fileName);
  const ktx2Rel = cachedManifest?.entries[normalized]?.replace(/^\/+/, '');
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

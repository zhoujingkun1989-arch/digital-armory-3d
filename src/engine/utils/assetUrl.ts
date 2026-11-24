/**
 * Heavy media top-level directories eligible for optional external CDN offloading
 * when `VITE_CDN_ASSET_BASE_URL` is configured.
 *
 * Lightweight app metadata & same-origin workers (`narrations/`, `sw.js`, `draco/`,
 * `basis/`, `showcase/`, `manifest.webmanifest`) intentionally stay local.
 */
export const HEAVY_ASSET_DIRS = [
  'audio/',
  'textures/',
  'models/',
  'plates/',
  'hdri/',
] as const;

export type HeavyAssetDir = (typeof HEAVY_ASSET_DIRS)[number];

const EXTERNAL_URL_RE = /^(?:https?:|data:|blob:)/i;
const HTTP_CDN_URL_RE = /^https?:\/\/[^/\s]+/i;

/**
 * Normalizes any deployment base path (e.g. `""`, `"/"`, `"digital-armory-3d"`,
 * `"/digital-armory-3d"`, `"/digital-armory-3d/"`) into a canonical leading-and-trailing
 * slash prefix (`"/"` or `"/digital-armory-3d/"`), while preserving explicit relative `"./"`.
 */
export function normalizeBasePath(base?: string): string {
  const raw = (base ?? '').trim();
  if (!raw || raw === '/') return '/';
  if (raw === '.' || raw === './') return './';
  const collapsed = raw.replace(/\/+/g, '/');
  const withLeading = collapsed.startsWith('/') ? collapsed : `/${collapsed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Normalizes an optional external heavy-asset CDN origin/prefix
 * (e.g. `"https://cdn.example.com/armory"` -> `"https://cdn.example.com/armory/"`).
 * Returns `null` when empty, whitespace-only, or not a valid `http(s)://` URL.
 */
export function normalizeCdnBaseUrl(cdnBase?: string | null): string | null {
  if (typeof cdnBase !== 'string') return null;
  const trimmed = cdnBase.trim();
  if (!trimmed || !HTTP_CDN_URL_RE.test(trimmed)) return null;
  return `${trimmed.replace(/\/+$/, '')}/`;
}

/**
 * Reads the runtime/build-time configured `VITE_CDN_ASSET_BASE_URL`, if any.
 */
export function getConfiguredCdnBaseUrl(): string | null {
  const raw = import.meta.env?.VITE_CDN_ASSET_BASE_URL;
  return normalizeCdnBaseUrl(raw);
}

/**
 * Checks whether a normalized relative asset path targets one of the heavy media
 * directories (`audio/`, `textures/`, `models/`, `plates/`, `hdri/`).
 */
export function isHeavyMediaPath(cleanRelPath: string): boolean {
  const normalized = cleanRelPath.replace(/^(?:\.\/|\/)+/, '');
  return HEAVY_ASSET_DIRS.some((prefix) => normalized.startsWith(prefix));
}

function resolveEffectiveCdnBase(
  cdnBaseOverride?: string | null
): string | null {
  if (cdnBaseOverride !== undefined) {
    return normalizeCdnBaseUrl(cdnBaseOverride);
  }
  return getConfiguredCdnBaseUrl();
}

/**
 * Resolves static public asset URLs safely under any deployment base path
 * (e.g. `/` in local dev or `/digital-armory-3d/` on GitHub Pages), and optionally
 * routes heavy media directories (`audio/`, `textures/`, `models/`, `plates/`, `hdri/`)
 * through `VITE_CDN_ASSET_BASE_URL` when configured.
 *
 * Idempotent if `relativePath` is already prefixed with `normalizedBase` or already
 * an external `http(s):` / `data:` / `blob:` URL.
 */
export function resolveAssetUrl(
  relativePath: string,
  baseOverride?: string,
  cdnBaseOverride?: string | null
): string {
  const trimmed = relativePath.trim();
  if (EXTERNAL_URL_RE.test(trimmed)) {
    return trimmed;
  }

  const base =
    baseOverride !== undefined
      ? baseOverride
      : (import.meta.env?.BASE_URL ?? '/');
  const normalizedBase = normalizeBasePath(base);
  const cdnBase = resolveEffectiveCdnBase(cdnBaseOverride);

  if (!trimmed || trimmed === '/') {
    return normalizedBase;
  }

  const cleanRel = trimmed.replace(/^(?:\.\/|\/)+/, '');
  const baseNoLead =
    normalizedBase !== '/' && normalizedBase !== './'
      ? normalizedBase.replace(/^\/+/, '')
      : '';

  const hasBasePrefix =
    Boolean(baseNoLead) &&
    (trimmed.startsWith(normalizedBase) || cleanRel.startsWith(baseNoLead));

  const innerRel = hasBasePrefix ? cleanRel.slice(baseNoLead.length) : cleanRel;

  if (cdnBase && isHeavyMediaPath(innerRel)) {
    return `${cdnBase}${innerRel}`;
  }

  if (hasBasePrefix) {
    return trimmed.startsWith(normalizedBase) ? trimmed : `/${cleanRel}`;
  }

  return `${normalizedBase}${cleanRel}`;
}

export function normalizeTextureFileName(fileOrPath: string): string {
  const trimmed = fileOrPath.trim();
  const texIdx = trimmed.lastIndexOf('textures/');
  const rawName =
    texIdx >= 0
      ? trimmed.slice(texIdx + 'textures/'.length)
      : trimmed.replace(/^\/+/, '');
  return rawName.replace(/\.png$/i, '.webp');
}

/**
 * Resolves a texture filename (automatically normalizing legacy `.png` references to `.webp`)
 * inside `public/textures/`, routing to CDN when `VITE_CDN_ASSET_BASE_URL` is active.
 */
export function resolveTextureUrl(
  fileOrPath: string,
  baseOverride?: string,
  cdnBaseOverride?: string | null
): string {
  const trimmed = fileOrPath.trim();
  if (EXTERNAL_URL_RE.test(trimmed)) {
    return trimmed;
  }
  const cleanName = normalizeTextureFileName(trimmed);
  return resolveAssetUrl(`textures/${cleanName}`, baseOverride, cdnBaseOverride);
}

/**
 * Resolves a Radiance `.hdr` studio environment filename inside `public/hdri/`,
 * routing to CDN when `VITE_CDN_ASSET_BASE_URL` is active.
 */
export function resolveHdriUrl(
  fileOrPath: string,
  baseOverride?: string,
  cdnBaseOverride?: string | null
): string {
  const trimmed = fileOrPath.trim();
  if (EXTERNAL_URL_RE.test(trimmed)) {
    return trimmed;
  }
  const idx = trimmed.lastIndexOf('hdri/');
  const cleanName =
    idx >= 0 ? trimmed.slice(idx + 'hdri/'.length) : trimmed.replace(/^\/+/, '');
  return resolveAssetUrl(`hdri/${cleanName}`, baseOverride, cdnBaseOverride);
}

/**
 * Resolves a Blender-baked Draco/Meshopt `.glb` firearm model filename inside `public/models/`,
 * routing to CDN when `VITE_CDN_ASSET_BASE_URL` is active.
 */
export function resolveModelUrl(
  fileOrPath: string,
  baseOverride?: string,
  cdnBaseOverride?: string | null
): string {
  const trimmed = fileOrPath.trim();
  if (EXTERNAL_URL_RE.test(trimmed)) {
    return trimmed;
  }
  const idx = trimmed.lastIndexOf('models/');
  const cleanName =
    idx >= 0
      ? trimmed.slice(idx + 'models/'.length)
      : trimmed.replace(/^\/+/, '');
  return resolveAssetUrl(`models/${cleanName}`, baseOverride, cdnBaseOverride);
}

export interface DeepLinkResolveOptions {
  origin?: string;
  pathname?: string;
  baseOverride?: string;
}

const DEFAULT_PUBLIC_ORIGIN = 'https://zhoujingkun1989-arch.github.io';

/**
 * Builds an absolute shareable / QR-scannable URL (e.g. `?screen=workbench&weapon=ak15&cut=1`
 * or `showcase.html`) that preserves non-root subpath deployments such as `/digital-armory-3d/`
 * and strips entry HTML filenames (`index.html` / `showcase.html`) cleanly.
 */
export function resolveAppDeepLink(
  queryOrPage = '',
  options?: DeepLinkResolveOptions
): string {
  const rawOrigin =
    options?.origin ??
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : DEFAULT_PUBLIC_ORIGIN);
  const cleanOrigin = rawOrigin.replace(/\/+$/, '');

  let baseDir: string;
  if (options?.baseOverride !== undefined) {
    baseDir = normalizeBasePath(options.baseOverride);
  } else if (options?.pathname !== undefined) {
    const stripped = options.pathname.replace(/(?:index|showcase)\.html$/i, '');
    baseDir = normalizeBasePath(stripped);
  } else if (typeof window !== 'undefined' && window.location?.pathname) {
    const stripped = window.location.pathname.replace(
      /(?:index|showcase)\.html$/i,
      ''
    );
    const fromWindow = normalizeBasePath(stripped);
    const envBase = normalizeBasePath(import.meta.env?.BASE_URL ?? '/');
    baseDir = fromWindow === '/' && envBase !== '/' ? envBase : fromWindow;
  } else {
    const envBase = normalizeBasePath(import.meta.env?.BASE_URL ?? '/');
    baseDir = envBase !== '/' ? envBase : '/digital-armory-3d/';
  }

  const normalizedPrefix =
    baseDir === './' ? `${cleanOrigin}/` : `${cleanOrigin}${baseDir}`;
  const target = queryOrPage.trim();
  if (!target) {
    return normalizedPrefix;
  }
  if (target.startsWith('?') || target.startsWith('#')) {
    return `${normalizedPrefix}${target}`;
  }
  return `${normalizedPrefix}${target.replace(/^\/+/, '')}`;
}

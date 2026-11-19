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
 * Resolves static public asset URLs safely under any deployment base path
 * (e.g. `/` in local dev or `/digital-armory-3d/` on GitHub Pages).
 * Idempotent if `relativePath` already begins with `normalizedBase`, and
 * leaves external `http(s):` / `data:` / `blob:` URLs untouched.
 */
export function resolveAssetUrl(
  relativePath: string,
  baseOverride?: string
): string {
  const trimmed = relativePath.trim();
  if (/^(?:https?:|data:|blob:)/i.test(trimmed)) {
    return trimmed;
  }

  const base =
    baseOverride !== undefined
      ? baseOverride
      : (import.meta.env?.BASE_URL ?? '/');
  const normalizedBase = normalizeBasePath(base);

  if (!trimmed || trimmed === '/') {
    return normalizedBase;
  }

  if (
    normalizedBase !== '/' &&
    normalizedBase !== './' &&
    trimmed.startsWith(normalizedBase)
  ) {
    return trimmed;
  }

  const cleanRel = trimmed.replace(/^\/+/, '');
  const baseNoLead = normalizedBase.replace(/^\/+/, '');
  if (
    baseNoLead &&
    normalizedBase !== './' &&
    cleanRel.startsWith(baseNoLead)
  ) {
    return `/${cleanRel}`;
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
 * inside `public/textures/`.
 */
export function resolveTextureUrl(
  fileOrPath: string,
  baseOverride?: string
): string {
  const cleanName = normalizeTextureFileName(fileOrPath);
  return resolveAssetUrl(`textures/${cleanName}`, baseOverride);
}

/**
 * Resolves a Radiance `.hdr` studio environment filename inside `public/hdri/`.
 */
export function resolveHdriUrl(
  fileOrPath: string,
  baseOverride?: string
): string {
  const trimmed = fileOrPath.trim();
  const idx = trimmed.lastIndexOf('hdri/');
  const cleanName =
    idx >= 0 ? trimmed.slice(idx + 'hdri/'.length) : trimmed.replace(/^\/+/, '');
  return resolveAssetUrl(`hdri/${cleanName}`, baseOverride);
}

/**
 * Resolves a Blender-baked Draco/Meshopt `.glb` firearm model filename inside `public/models/`.
 */
export function resolveModelUrl(
  fileOrPath: string,
  baseOverride?: string
): string {
  const trimmed = fileOrPath.trim();
  const idx = trimmed.lastIndexOf('models/');
  const cleanName =
    idx >= 0
      ? trimmed.slice(idx + 'models/'.length)
      : trimmed.replace(/^\/+/, '');
  return resolveAssetUrl(`models/${cleanName}`, baseOverride);
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

/**
 * Resolves static public asset URLs safely under any deployment base path
 * (e.g. `/` in local dev or `/digital-armory-3d/` on GitHub Pages).
 */
export function resolveAssetUrl(relativePath: string): string {
  const base = import.meta.env?.BASE_URL ?? '/';
  const normalizedBase = base.endsWith('/') ? base : `${base}/`;
  const cleanRel = relativePath.replace(/^\/+/, '');
  return `${normalizedBase}${cleanRel}`;
}

/**
 * Resolves a texture filename (automatically normalizing legacy `.png` references to `.webp`)
 * inside `public/textures/`.
 */
export function resolveTextureUrl(fileOrPath: string): string {
  const cleanName = fileOrPath
    .replace(/^\/?textures\//, '')
    .replace(/\.png$/i, '.webp');
  return resolveAssetUrl(`textures/${cleanName}`);
}

export function normalizeTextureFileName(fileOrPath: string): string {
  return fileOrPath.replace(/^\/?textures\//, '').replace(/\.png$/i, '.webp');
}

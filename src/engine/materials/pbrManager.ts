import * as THREE from 'three';
import type {
  MaterialKind,
  PbrBindingSpec,
  WeaponId,
} from '../../weapons/types';
import { isWeaponId } from '../../weapons/types';
import { resolveTextureUrl } from '../utils/assetUrl';

export interface PartPbrBundle {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  normalScale: number;
  hasCustomAtlas: boolean;
  textureKeys: string[];
}

interface CachedTextureRecord {
  key: string;
  tex: THREE.Texture;
  ownerWeapon: WeaponId | 'shared';
}

const MAX_CACHED_TEXTURE_WEAPONS = 5;

const texCache = new Map<string, CachedTextureRecord>();
const weaponTexKeys = new Map<WeaponId, Set<string>>();
const weaponTexLru: WeaponId[] = [];
const keyListeners = new Map<string, Set<() => void>>();

let loaderInstance: THREE.TextureLoader | null = null;

function notifyKeyReady(key: string): void {
  const set = keyListeners.get(key);
  if (set) {
    set.forEach((fn) => fn());
  }
}

export function subscribeTextureKeys(
  keys: readonly string[],
  listener: () => void
): () => void {
  if (keys.length === 0) return () => {};
  for (let i = 0; i < keys.length; i++) {
    const k = keys[i];
    let set = keyListeners.get(k);
    if (!set) {
      set = new Set();
      keyListeners.set(k, set);
    }
    set.add(listener);
  }
  return () => {
    for (let i = 0; i < keys.length; i++) {
      const k = keys[i];
      const set = keyListeners.get(k);
      if (set) {
        set.delete(listener);
        if (set.size === 0) keyListeners.delete(k);
      }
    }
  };
}

export function isTextureLoaded(tex: THREE.Texture | null): boolean {
  if (!tex || !tex.image) return false;
  const img = tex.image as { width?: number; complete?: boolean };
  if (typeof img.complete === 'boolean') {
    return img.complete && (img.width ?? 0) > 0;
  }
  return (img.width ?? 0) > 0;
}

function touchTextureWeaponLru(
  weaponId: WeaponId,
  activeProtectedId?: WeaponId
): void {
  const idx = weaponTexLru.indexOf(weaponId);
  if (idx !== -1) {
    weaponTexLru.splice(idx, 1);
  }
  weaponTexLru.push(weaponId);

  while (weaponTexLru.length > MAX_CACHED_TEXTURE_WEAPONS) {
    const candidate = weaponTexLru[0];
    if (candidate === activeProtectedId) break;
    weaponTexLru.shift();
    const keys = weaponTexKeys.get(candidate);
    if (keys) {
      keys.forEach((k) => {
        const rec = texCache.get(k);
        if (rec && rec.ownerWeapon !== 'shared') {
          rec.tex.dispose();
          texCache.delete(k);
        }
      });
      weaponTexKeys.delete(candidate);
    }
  }
}

function loadCachedTexture(
  fileName: string,
  opts: {
    srgb: boolean;
    repeat?: number;
    ownerWeapon: WeaponId | 'shared';
  }
): { key: string; tex: THREE.Texture | null } {
  const url = resolveTextureUrl(fileName);
  const key = `${url}|${opts.srgb ? 'srgb' : 'lin'}|${opts.repeat ?? 1}`;
  if (typeof window === 'undefined') {
    return { key, tex: null };
  }

  const existing = texCache.get(key);
  if (existing) {
    if (opts.ownerWeapon !== 'shared') {
      touchTextureWeaponLru(opts.ownerWeapon, opts.ownerWeapon);
    }
    return { key, tex: existing.tex };
  }

  if (!loaderInstance) {
    loaderInstance = new THREE.TextureLoader();
  }

  const tex = loaderInstance.load(url, () => {
    tex.needsUpdate = true;
    notifyKeyReady(key);
  });
  tex.colorSpace = opts.srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  tex.anisotropy = 8;

  if (opts.repeat && opts.repeat > 1) {
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(opts.repeat, opts.repeat);
  } else {
    tex.wrapS = THREE.ClampToEdgeWrapping;
    tex.wrapT = THREE.ClampToEdgeWrapping;
  }

  texCache.set(key, { key, tex, ownerWeapon: opts.ownerWeapon });
  if (opts.ownerWeapon !== 'shared') {
    let set = weaponTexKeys.get(opts.ownerWeapon);
    if (!set) {
      set = new Set();
      weaponTexKeys.set(opts.ownerWeapon, set);
    }
    set.add(key);
    touchTextureWeaponLru(opts.ownerWeapon, opts.ownerWeapon);
  }

  return { key, tex };
}

/**
 * Resolves multi-channel WebP PBR textures (Albedo + Tangent-Space Normal + Roughness)
 * for any weapon component, automatically pooling shared micro-detail maps and managing
 * weapon-specific 2K atlases in a bounded GPU LRU pool.
 */
export function getPartPbrBundle(
  weaponIdRaw: string,
  material: MaterialKind,
  customBinding?: PbrBindingSpec
): PartPbrBundle {
  const ownerWeapon: WeaponId = isWeaponId(weaponIdRaw) ? weaponIdRaw : 'ak15';

  if (customBinding) {
    const alb = loadCachedTexture(customBinding.albedoFile, {
      srgb: true,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    const nrm = loadCachedTexture(customBinding.normalFile, {
      srgb: false,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    const rgh = loadCachedTexture(customBinding.roughnessFile, {
      srgb: false,
      repeat: customBinding.repeat,
      ownerWeapon,
    });
    return {
      map: alb.tex,
      normalMap: nrm.tex,
      roughnessMap: rgh.tex,
      normalScale: customBinding.normalScale,
      hasCustomAtlas: true,
      textureKeys: [alb.key, nrm.key, rgh.key],
    };
  }

  if (material === 'polymer_frame' || material === 'follower_orange') {
    const nrm = loadCachedTexture('polymer_detail_normal.webp', {
      srgb: false,
      repeat: 3,
      ownerWeapon: 'shared',
    });
    const rgh = loadCachedTexture('polymer_detail_roughness.webp', {
      srgb: false,
      repeat: 3,
      ownerWeapon: 'shared',
    });
    return {
      map: null,
      normalMap: nrm.tex,
      roughnessMap: rgh.tex,
      normalScale: material === 'polymer_frame' ? 0.34 : 0.24,
      hasCustomAtlas: false,
      textureKeys: [nrm.key, rgh.key],
    };
  }

  if (
    material === 'nitride_steel' ||
    material === 'barrel_steel' ||
    material === 'stainless' ||
    material === 'copper_accent'
  ) {
    const nrm = loadCachedTexture('metal_detail_normal.webp', {
      srgb: false,
      repeat: 2,
      ownerWeapon: 'shared',
    });
    const rgh = loadCachedTexture('metal_detail_roughness.webp', {
      srgb: false,
      repeat: 2,
      ownerWeapon: 'shared',
    });
    return {
      map: null,
      normalMap: nrm.tex,
      roughnessMap: rgh.tex,
      normalScale: material === 'stainless' ? 0.28 : 0.42,
      hasCustomAtlas: false,
      textureKeys: [nrm.key, rgh.key],
    };
  }

  return {
    map: null,
    normalMap: null,
    roughnessMap: null,
    normalScale: 0,
    hasCustomAtlas: false,
    textureKeys: [],
  };
}

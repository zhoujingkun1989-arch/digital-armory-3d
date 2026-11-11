import * as THREE from 'three';
import { MaterialKind } from '../data/g17PartsSpec';
import { AUG_PBR_BINDINGS } from '../data/weapons/augModule';
import { AWM_PBR_BINDINGS } from '../data/weapons/awmModule';
import { DEAGLE_PBR_BINDINGS } from '../data/weapons/deagleModule';
import { M4A1_PBR_BINDINGS } from '../data/weapons/m4a1Module';
import { M82A1_PBR_BINDINGS } from '../data/weapons/m82a1Module';
import { MP5_PBR_BINDINGS } from '../data/weapons/mp5Module';
import { P320_PBR_BINDINGS } from '../data/weapons/p320Module';
import { SCAR_PBR_BINDINGS } from '../data/weapons/scarModule';

export interface PartPbrBundle {
  map: THREE.Texture | null;
  normalMap: THREE.Texture | null;
  roughnessMap: THREE.Texture | null;
  normalScale: number;
  hasCustomAtlas: boolean;
}

interface CustomPbrBinding {
  albedoUrl: string;
  normalUrl: string;
  roughnessUrl: string;
  normalScale: number;
  repeat?: number;
}

const CUSTOM_PART_PBR_BINDINGS: Record<string, CustomPbrBinding> = {
  // BAY-04: Glock 17 Gen3 Custom 2K Atlases
  slide: {
    albedoUrl: '/textures/slide_albedo.png',
    normalUrl: '/textures/slide_normal.png',
    roughnessUrl: '/textures/slide_roughness.png',
    normalScale: 0.65,
  },
  barrel: {
    albedoUrl: '/textures/barrel_albedo.png',
    normalUrl: '/textures/barrel_normal.png',
    roughnessUrl: '/textures/barrel_roughness.png',
    normalScale: 0.58,
  },
  frame: {
    albedoUrl: '/textures/frame_albedo.png',
    normalUrl: '/textures/frame_normal.png',
    roughnessUrl: '/textures/frame_roughness.png',
    normalScale: 0.42,
  },
  mag_body: {
    albedoUrl: '/textures/mag_albedo.png',
    normalUrl: '/textures/mag_normal.png',
    roughnessUrl: '/textures/mag_roughness.png',
    normalScale: 0.72,
  },

  // BAY-01: AK-15M1 Custom 2K Atlases
  ak_receiver: {
    albedoUrl: '/textures/ak_receiver_albedo.png',
    normalUrl: '/textures/ak_receiver_normal.png',
    roughnessUrl: '/textures/ak_receiver_roughness.png',
    normalScale: 0.38,
  },
  ak_bolt_carrier: {
    albedoUrl: '/textures/ak_metal_albedo.png',
    normalUrl: '/textures/ak_metal_normal.png',
    roughnessUrl: '/textures/ak_metal_roughness.png',
    normalScale: 0.55,
  },
  ak_mag_body: {
    albedoUrl: '/textures/ak_mag_albedo.png',
    normalUrl: '/textures/ak_mag_normal.png',
    roughnessUrl: '/textures/ak_mag_roughness.png',
    normalScale: 0.68,
  },

  // BAY-02..BAY-10: 8 New Armory Weapons Custom 2K Atlases
  ...M4A1_PBR_BINDINGS,
  ...MP5_PBR_BINDINGS,
  ...M82A1_PBR_BINDINGS,
  ...AWM_PBR_BINDINGS,
  ...SCAR_PBR_BINDINGS,
  ...DEAGLE_PBR_BINDINGS,
  ...AUG_PBR_BINDINGS,
  ...P320_PBR_BINDINGS,
};

const texCache = new Map<string, THREE.Texture>();
const readyListeners = new Set<() => void>();
let loaderInstance: THREE.TextureLoader | null = null;

function notifyReady(): void {
  readyListeners.forEach((fn) => fn());
}

export function subscribePbrTextureReady(listener: () => void): () => void {
  readyListeners.add(listener);
  return () => {
    readyListeners.delete(listener);
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

function loadCachedTexture(
  url: string,
  opts: { srgb: boolean; repeat?: number }
): THREE.Texture | null {
  if (typeof window === 'undefined') return null;
  const key = `${url}|${opts.srgb ? 'srgb' : 'lin'}|${opts.repeat ?? 1}`;
  const existing = texCache.get(key);
  if (existing) return existing;

  if (!loaderInstance) {
    loaderInstance = new THREE.TextureLoader();
  }

  const tex = loaderInstance.load(url, () => {
    tex.needsUpdate = true;
    notifyReady();
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

  texCache.set(key, tex);
  return tex;
}

/**
 * Returns multi-channel PBR textures (Albedo + Tangent-Space Normal + Roughness)
 * tailored to each weapon part ID across all 10 armory firearms and material families.
 */
export function getPartPbrBundle(
  partId: string,
  material: MaterialKind
): PartPbrBundle {
  const custom = CUSTOM_PART_PBR_BINDINGS[partId];
  if (custom) {
    return {
      map: loadCachedTexture(custom.albedoUrl, {
        srgb: true,
        repeat: custom.repeat,
      }),
      normalMap: loadCachedTexture(custom.normalUrl, {
        srgb: false,
        repeat: custom.repeat,
      }),
      roughnessMap: loadCachedTexture(custom.roughnessUrl, {
        srgb: false,
        repeat: custom.repeat,
      }),
      normalScale: custom.normalScale,
      hasCustomAtlas: true,
    };
  }

  if (material === 'polymer_frame' || material === 'follower_orange') {
    return {
      map: null,
      normalMap: loadCachedTexture('/textures/polymer_detail_normal.png', {
        srgb: false,
        repeat: 3,
      }),
      roughnessMap: loadCachedTexture(
        '/textures/polymer_detail_roughness.png',
        {
          srgb: false,
          repeat: 3,
        }
      ),
      normalScale: material === 'polymer_frame' ? 0.34 : 0.24,
      hasCustomAtlas: false,
    };
  }

  if (
    material === 'nitride_steel' ||
    material === 'barrel_steel' ||
    material === 'stainless' ||
    material === 'copper_accent'
  ) {
    return {
      map: null,
      normalMap: loadCachedTexture('/textures/metal_detail_normal.png', {
        srgb: false,
        repeat: 2,
      }),
      roughnessMap: loadCachedTexture('/textures/metal_detail_roughness.png', {
        srgb: false,
        repeat: 2,
      }),
      normalScale: material === 'stainless' ? 0.28 : 0.42,
      hasCustomAtlas: false,
    };
  }

  return {
    map: null,
    normalMap: null,
    roughnessMap: null,
    normalScale: 0,
    hasCustomAtlas: false,
  };
}

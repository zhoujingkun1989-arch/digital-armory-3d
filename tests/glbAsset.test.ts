import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import viteConfig from '../vite.config';
import { CURVATURE_ATTRIBUTE, SPRING_PARAM_ATTRIBUTE } from '../src/engine/geometry/curvatureBuilder';
import {
  clearWeaponGeometryCache,
  ensureWeaponGeometries,
  getCachedPartGeometry,
  getWeaponGeometrySnapshot,
} from '../src/engine/geometry/geometryService';
import {
  disposeGlbLoaderResources,
  GLB_WEAPON_CONFIGS,
  getGlbPartPbrOverride,
  getGlbWeaponConfig,
  hasGlbWeaponAsset,
  isGlbDynamicSpringPart,
  isIdentityMatrix,
  loadWeaponGlbGeometries,
  matchGlbNodeToPartId,
  parseGlbArrayBuffer,
  prepareGlbPartGeometry,
  resolveDracoDecoderPath,
  resolveWeaponGlbUrl,
} from '../src/engine/geometry/glbAssetService';
import {
  getPartPbrBundle,
  lockLinearTextureColorSpace,
} from '../src/engine/materials/pbrManager';
import { AK15_PARTS } from '../src/weapons/ak15/plugin';
import { P08_PARTS } from '../src/weapons/p08/plugin';
import type { WeaponId } from '../src/weapons/types';

/**
 * Builds a minimal spec-compliant uncompressed binary glTF 2.0 (`.glb`) ArrayBuffer
 * containing multiple named meshes (single-primitive, Blender `.001` suffix, multi-primitive
 * node, and an intentionally present dynamic spring mesh) for deterministic Node parsing tests.
 */
function buildSyntheticTestGlb(): ArrayBuffer {
  // Unit cube (8 vertices, 12 triangles = 36 indices) with explicit glTF UVs (`v_gltf` in [0.25, 0.75])
  const positions = new Float32Array([
    // Front (+Z)
    -0.5, -0.5, 0.5, 0.5, -0.5, 0.5, 0.5, 0.5, 0.5, -0.5, 0.5, 0.5,
    // Back (-Z)
    -0.5, -0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, -0.5, -0.5, 0.5, -0.5,
  ]);
  const uvs = new Float32Array([
    0.1, 0.25, 0.9, 0.25, 0.9, 0.75, 0.1, 0.75, 0.1, 0.25, 0.9, 0.25, 0.9, 0.75,
    0.1, 0.75,
  ]);
  const indices = new Uint16Array([
    0, 1, 2, 0, 2, 3, // +Z
    5, 4, 7, 5, 7, 6, // -Z
    4, 0, 3, 4, 3, 7, // -X
    1, 5, 6, 1, 6, 2, // +X
    3, 2, 6, 3, 6, 7, // +Y
    4, 5, 1, 4, 1, 0, // -Y
  ]);

  // Second primitive shifted in +Y for multi-primitive node testing
  const positionsB = new Float32Array(positions.length);
  for (let i = 0; i < positions.length; i += 3) {
    positionsB[i] = positions[i];
    positionsB[i + 1] = positions[i + 1] + 2.0;
    positionsB[i + 2] = positions[i + 2];
  }

  const posOffset = 0;
  const posBOffset = positions.byteLength;
  const uvOffset = posBOffset + positionsB.byteLength;
  const idxOffset = uvOffset + uvs.byteLength;
  const rawBinLen = idxOffset + indices.byteLength;
  const paddedBinLen = (rawBinLen + 3) & ~3;

  const binBuf = new Uint8Array(paddedBinLen);
  binBuf.set(new Uint8Array(positions.buffer), posOffset);
  binBuf.set(new Uint8Array(positionsB.buffer), posBOffset);
  binBuf.set(new Uint8Array(uvs.buffer), uvOffset);
  binBuf.set(new Uint8Array(indices.buffer), idxOffset);

  const gltfJson = {
    asset: { version: '2.0', generator: 'digital-armory-3d-test' },
    scene: 0,
    scenes: [{ nodes: [0, 1, 2, 3] }],
    nodes: [
      // 0: single-primitive mesh with non-identity node translation [2, 0, 0]
      { name: 'p08_barrel', mesh: 0, translation: [2, 0, 0] },
      // 1: Blender numeric duplicate suffix `.001`
      { name: 'p08_grip_left.001', mesh: 0 },
      // 2: multi-primitive mesh (GLTFLoader creates a THREE.Group with 2 child Meshes)
      { name: 'p08_frame', mesh: 1 },
      // 3: dynamic spring accidentally exported — MUST be skipped by glbAssetService!
      { name: 'p08_recoil_spring', mesh: 0 },
    ],
    meshes: [
      {
        name: 'SingleCubeMesh',
        primitives: [{ attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 3 }],
      },
      {
        name: 'MultiPrimFrameMesh',
        primitives: [
          { attributes: { POSITION: 0, TEXCOORD_0: 2 }, indices: 3 },
          { attributes: { POSITION: 1, TEXCOORD_0: 2 }, indices: 3 },
        ],
      },
    ],
    buffers: [{ byteLength: rawBinLen }],
    bufferViews: [
      { buffer: 0, byteOffset: posOffset, byteLength: positions.byteLength, target: 34962 },
      { buffer: 0, byteOffset: posBOffset, byteLength: positionsB.byteLength, target: 34962 },
      { buffer: 0, byteOffset: uvOffset, byteLength: uvs.byteLength, target: 34962 },
      { buffer: 0, byteOffset: idxOffset, byteLength: indices.byteLength, target: 34963 },
    ],
    accessors: [
      {
        bufferView: 0,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-0.5, -0.5, -0.5],
        max: [0.5, 0.5, 0.5],
      },
      {
        bufferView: 1,
        componentType: 5126,
        count: 8,
        type: 'VEC3',
        min: [-0.5, 1.5, -0.5],
        max: [0.5, 2.5, 0.5],
      },
      { bufferView: 2, componentType: 5126, count: 8, type: 'VEC2' },
      { bufferView: 3, componentType: 5123, count: 36, type: 'SCALAR' },
    ],
  };

  const jsonBytesRaw = new TextEncoder().encode(JSON.stringify(gltfJson));
  const paddedJsonLen = (jsonBytesRaw.byteLength + 3) & ~3;
  const jsonBytes = new Uint8Array(paddedJsonLen);
  jsonBytes.fill(0x20); // JSON chunk padded with ASCII spaces per glTF 2.0 spec
  jsonBytes.set(jsonBytesRaw);

  const totalLength = 12 + 8 + paddedJsonLen + 8 + paddedBinLen;
  const out = new ArrayBuffer(totalLength);
  const view = new DataView(out);
  const outBytes = new Uint8Array(out);

  // GLB Header
  view.setUint32(0, 0x46546c67, true); // 'glTF'
  view.setUint32(4, 2, true); // version 2
  view.setUint32(8, totalLength, true);

  // Chunk 0: JSON
  view.setUint32(12, paddedJsonLen, true);
  view.setUint32(16, 0x4e4f534a, true); // 'JSON'
  outBytes.set(jsonBytes, 20);

  // Chunk 1: BIN
  const binChunkStart = 20 + paddedJsonLen;
  view.setUint32(binChunkStart, paddedBinLen, true);
  view.setUint32(binChunkStart + 4, 0x004e4942, true); // 'BIN\0'
  outBytes.set(binBuf, binChunkStart + 8);

  return out;
}

function signedVolume(geo: THREE.BufferGeometry): number {
  const pos = geo.getAttribute('position');
  const idx = geo.getIndex();
  const count = idx ? idx.count : pos.count;
  const vAt = (k: number) => (idx ? idx.getX(k) : k);
  let vol = 0;
  for (let i = 0; i + 2 < count; i += 3) {
    const a = vAt(i);
    const b = vAt(i + 1);
    const c = vAt(i + 2);
    const ax = pos.getX(a);
    const ay = pos.getY(a);
    const az = pos.getZ(a);
    const bx = pos.getX(b);
    const by = pos.getY(b);
    const bz = pos.getZ(b);
    const cx = pos.getX(c);
    const cy = pos.getY(c);
    const cz = pos.getZ(c);
    vol +=
      (ax * (by * cz - bz * cy) -
        ay * (bx * cz - bz * cx) +
        az * (bx * cy - by * cx)) /
      6;
  }
  return vol;
}

describe('Dual-Track Draco GLB Loading Engine (PR-02)', () => {
  afterEach(() => {
    clearWeaponGeometryCache();
    disposeGlbLoaderResources();
    vi.restoreAllMocks();
  });

  it('ships all 3 Three.js glTF Draco decoder runtime files in public/draco/', () => {
    const dracoDir = path.resolve(__dirname, '../public/draco');
    for (const file of [
      'draco_decoder.js',
      'draco_decoder.wasm',
      'draco_wasm_wrapper.js',
    ]) {
      const fullPath = path.join(dracoDir, file);
      expect(fs.existsSync(fullPath), `Missing ${fullPath}`).toBe(true);
      const stat = fs.statSync(fullPath);
      expect(stat.size, `${file} must be non-empty`).toBeGreaterThan(10_000);
    }

    // Verify valid WebAssembly binary magic header (\0asm)
    const wasmBytes = fs.readFileSync(path.join(dracoDir, 'draco_decoder.wasm'));
    expect(wasmBytes[0]).toBe(0x00);
    expect(wasmBytes[1]).toBe(0x61);
    expect(wasmBytes[2]).toBe(0x73);
    expect(wasmBytes[3]).toBe(0x6d);
  });

  it('resolves subpath-safe Draco decoder & GLB model URLs and routes loaders to vendor-three-postfx', () => {
    // Root deployment ('/')
    expect(resolveDracoDecoderPath('/')).toBe('/draco/');
    expect(resolveWeaponGlbUrl('p08', '/')).toBe('/models/p08.glb');
    expect(resolveWeaponGlbUrl('ak15', '/')).toBe('/models/ak15.glb');
    expect(resolveWeaponGlbUrl('m4a1', '/')).toBeNull();

    // Non-root GitHub Pages subpath deployment ('/digital-armory-3d/')
    expect(resolveDracoDecoderPath('/digital-armory-3d/')).toBe(
      '/digital-armory-3d/draco/'
    );
    expect(resolveDracoDecoderPath('digital-armory-3d')).toBe(
      '/digital-armory-3d/draco/'
    );
    expect(resolveWeaponGlbUrl('p08', '/digital-armory-3d/')).toBe(
      '/digital-armory-3d/models/p08.glb'
    );
    expect(resolveWeaponGlbUrl('ak15', 'digital-armory-3d')).toBe(
      '/digital-armory-3d/models/ak15.glb'
    );

    // Verify Vite chunk splitting places GLTFLoader, DRACOLoader & BufferGeometryUtils in vendor-three-postfx
    const output = viteConfig.build?.rollupOptions?.output;
    const singleOutput = Array.isArray(output) ? output[0] : output;
    const manualChunks = singleOutput?.manualChunks;
    expect(typeof manualChunks).toBe('function');
    if (typeof manualChunks === 'function') {
      const chunkOf = (id: string) =>
        manualChunks(id, {
          getModuleInfo: () => null,
          getModuleIds: function* () {},
        });
      expect(
        chunkOf('/repo/node_modules/three/examples/jsm/loaders/GLTFLoader.js')
      ).toBe('vendor-three-postfx');
      expect(
        chunkOf('/repo/node_modules/three/examples/jsm/loaders/DRACOLoader.js')
      ).toBe('vendor-three-postfx');
      expect(
        chunkOf(
          '/repo/node_modules/three/examples/jsm/utils/BufferGeometryUtils.js'
        )
      ).toBe('vendor-three-postfx');
    }
  });

  it('locks exact 100% disjoint part-to-atlas & dynamic-spring contracts for p08 (25 parts) and ak15 (26 parts)', () => {
    expect(hasGlbWeaponAsset('p08')).toBe(true);
    expect(hasGlbWeaponAsset('ak15')).toBe(true);
    for (const unmigrated of ['m4a1', 'g17', 'mp5', 'garand', 'vector'] as WeaponId[]) {
      expect(hasGlbWeaponAsset(unmigrated)).toBe(false);
      expect(getGlbWeaponConfig(unmigrated)).toBeNull();
      expect(isGlbDynamicSpringPart(unmigrated, 'recoil_spring')).toBe(false);
      expect(getGlbPartPbrOverride(unmigrated, 'barrel')).toBeUndefined();
    }

    // --- Luger P08 (25 parts = 3 dynamic springs + 2 walnut + 20 metal) ---
    const p08Cfg = GLB_WEAPON_CONFIGS.p08!;
    expect(p08Cfg.modelFile).toBe('p08.glb');
    expect(p08Cfg.dynamicSpringParts).toEqual([
      'p08_recoil_spring',
      'p08_striker_spring',
      'p08_mag_spring',
    ]);
    const p08Ids = P08_PARTS.map((p) => p.id);
    const p08Springs = new Set(p08Cfg.dynamicSpringParts);
    const p08OverrideIds = Object.keys(p08Cfg.pbrOverrides);
    expect(p08Ids).toHaveLength(25);
    expect(p08OverrideIds).toHaveLength(22);

    for (const id of p08Ids) {
      if (p08Springs.has(id)) {
        expect(isGlbDynamicSpringPart('p08', id)).toBe(true);
        expect(getGlbPartPbrOverride('p08', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('p08', id)).toBe(false);
        const ov = getGlbPartPbrOverride('p08', id);
        expect(ov, `Missing p08 PBR override for ${id}`).toBeDefined();
        if (id === 'p08_grip_left' || id === 'p08_grip_right') {
          expect(ov!.albedoFile).toBe('p08_v3_walnut_albedo.webp');
          expect(ov!.normalFile).toBe('p08_v3_walnut_normal.webp');
          expect(ov!.roughnessFile).toBe('p08_v3_walnut_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else {
          expect(ov!.albedoFile).toBe('p08_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('p08_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('p08_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.72, 5);
        }
      }
    }

    // --- AK-15M1 (26 parts = 2 dynamic springs + 8 furniture/mag + 16 metal) ---
    const akCfg = GLB_WEAPON_CONFIGS.ak15!;
    expect(akCfg.modelFile).toBe('ak15.glb');
    expect(akCfg.dynamicSpringParts).toEqual([
      'ak_recoil_spring',
      'ak_mag_spring',
    ]);
    const akIds = AK15_PARTS.map((p) => p.id);
    const akSprings = new Set(akCfg.dynamicSpringParts);
    const akReceiver = new Set([
      'ak_receiver',
      'ak_dust_cover',
      'ak_rear_sight',
      'ak_selector',
    ]);
    const akFurniture = new Set([
      'ak_upper_handguard',
      'ak_lower_handguard',
      'ak_buttstock',
      'ak_cheek_riser',
      'ak_pistol_grip',
      'ak_mag_body',
      'ak_mag_follower',
      'ak_mag_floorplate',
    ]);
    const akOverrideIds = Object.keys(akCfg.pbrOverrides);
    expect(akIds).toHaveLength(26);
    expect(akOverrideIds).toHaveLength(24);

    for (const id of akIds) {
      if (akSprings.has(id)) {
        expect(isGlbDynamicSpringPart('ak15', id)).toBe(true);
        expect(getGlbPartPbrOverride('ak15', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('ak15', id)).toBe(false);
        const ov = getGlbPartPbrOverride('ak15', id);
        expect(ov, `Missing ak15 PBR override for ${id}`).toBeDefined();
        if (akFurniture.has(id)) {
          expect(ov!.albedoFile).toBe('ak15_v3_furniture_albedo.webp');
          expect(ov!.normalFile).toBe('ak15_v3_furniture_normal.webp');
          expect(ov!.roughnessFile).toBe('ak15_v3_furniture_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.92, 5);
        } else if (akReceiver.has(id)) {
          expect(ov!.albedoFile).toBe('ak15_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('ak15_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('ak15_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('ak15_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('ak15_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('ak15_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }
  });

  it('parses raw binary GLB buffers, flips glTF UV.y, bakes transforms, merges multi-primitive nodes, and excludes dynamic springs', async () => {
    const glbBuffer = buildSyntheticTestGlb();
    const extracted = await parseGlbArrayBuffer(
      glbBuffer,
      'p08',
      ['p08_barrel', 'p08_grip_left', 'p08_frame', 'p08_recoil_spring'],
      { useDraco: false }
    );

    try {
      // Dynamic spring MUST be excluded even if present in the GLB
      expect(extracted.has('p08_recoil_spring')).toBe(false);
      expect(extracted.has('p08_barrel')).toBe(true);
      expect(extracted.has('p08_grip_left')).toBe(true);
      expect(extracted.has('p08_frame')).toBe(true);

      // 1. Single-primitive mesh with non-identity translation [2, 0, 0] baked into vertices
      const barrelGeo = extracted.get('p08_barrel')!;
      expect(barrelGeo.userData.isGlbAsset).toBe(true);
      expect(barrelGeo.boundingBox).not.toBeNull();
      expect(barrelGeo.boundingSphere).not.toBeNull();
      expect(barrelGeo.boundingBox!.min.x).toBeCloseTo(1.5, 4);
      expect(barrelGeo.boundingBox!.max.x).toBeCloseTo(2.5, 4);

      // Verify glTF UV.y (`0.25` and `0.75`) flipped cleanly to `1 - v` (`0.75` and `0.25`)
      const uv = barrelGeo.getAttribute('uv');
      expect(uv).toBeDefined();
      expect(uv.getX(0)).toBeCloseTo(0.1, 5);
      expect(uv.getY(0)).toBeCloseTo(0.75, 5); // 1 - 0.25
      expect(uv.getY(2)).toBeCloseTo(0.25, 5); // 1 - 0.75

      // Verify unit normals, linear RGB color & CNC curvature attribute
      const norm = barrelGeo.getAttribute('normal');
      expect(norm).toBeDefined();
      for (let i = 0; i < norm.count; i++) {
        const len = Math.hypot(norm.getX(i), norm.getY(i), norm.getZ(i));
        expect(Math.abs(len - 1)).toBeLessThan(1e-3);
      }

      const color = barrelGeo.getAttribute('color');
      expect(color).toBeDefined();
      expect(color.itemSize).toBe(3);
      expect(color.count).toBe(barrelGeo.getAttribute('position').count);

      const curv = barrelGeo.getAttribute(CURVATURE_ATTRIBUTE);
      expect(curv).toBeDefined();
      expect(curv.itemSize).toBe(1);
      expect(curv.array).toBeInstanceOf(Float32Array);
      expect(barrelGeo.getAttribute(SPRING_PARAM_ATTRIBUTE)).toBeUndefined();

      // 2. Blender `.001` suffix matched `p08_grip_left`
      const gripGeo = extracted.get('p08_grip_left')!;
      expect(gripGeo.userData.isGlbAsset).toBe(true);
      expect(gripGeo.boundingBox!.min.x).toBeCloseTo(-0.5, 4);
      expect(gripGeo.boundingBox!.max.x).toBeCloseTo(0.5, 4);

      // 3. Multi-primitive node `p08_frame` merged both cubes spanning Y in [-0.5, +2.5]
      const frameGeo = extracted.get('p08_frame')!;
      expect(frameGeo.userData.isGlbAsset).toBe(true);
      expect(frameGeo.boundingBox!.min.y).toBeCloseTo(-0.5, 4);
      expect(frameGeo.boundingBox!.max.y).toBeCloseTo(2.5, 4);
      expect(frameGeo.getAttribute('position').count).toBe(72); // 2 cubes * 36 non-indexed verts
      expect(frameGeo.getAttribute(CURVATURE_ATTRIBUTE)?.count).toBe(72);
    } finally {
      extracted.forEach((g) => g.dispose());
    }
  });

  it('handles node-name normalization, identity detection, and negative-determinant mirror winding cleanly', () => {
    const candidates = new Set(['p08_barrel', 'ak_receiver']);
    expect(matchGlbNodeToPartId('p08_barrel', candidates)).toBe('p08_barrel');
    expect(matchGlbNodeToPartId('p08_barrel.001', candidates)).toBe('p08_barrel');
    expect(matchGlbNodeToPartId('p08_barrel001', candidates)).toBe('p08_barrel');
    expect(matchGlbNodeToPartId('ak_receiver_1', candidates)).toBe('ak_receiver');
    expect(matchGlbNodeToPartId('unrelated_node', candidates)).toBeNull();

    const idMat = new THREE.Matrix4();
    expect(isIdentityMatrix(idMat)).toBe(true);
    const shifted = new THREE.Matrix4().makeTranslation(0, 0.5, 0);
    expect(isIdentityMatrix(shifted)).toBe(false);

    // Negative determinant mirror matrix must still yield positive outward signed volume
    const rawBox = new THREE.BoxGeometry(1, 2, 3);
    const mirrorZ = new THREE.Matrix4().makeScale(1, 1, -1);
    const prepared = prepareGlbPartGeometry(rawBox, mirrorZ);
    rawBox.dispose();
    expect(prepared).not.toBeNull();
    try {
      expect(signedVolume(prepared!)).toBeGreaterThan(5.9);
      expect(prepared!.userData.isGlbAsset).toBe(true);
    } finally {
      prepared!.dispose();
    }
  });

  it('automatically falls back to CSG with preserved dynamic spring aSpringParam in headless Node & on GLB load failure', async () => {
    // 1. Headless Node (`typeof window === 'undefined'`): loadWeaponGlbGeometries skips fetch cleanly
    expect(typeof window).toBe('undefined');
    const headlessMap = await loadWeaponGlbGeometries('p08', [
      'p08_barrel',
      'p08_recoil_spring',
    ]);
    expect(headlessMap.size).toBe(0);

    // 2. Dual-track ensureWeaponGeometries automatically populates CSG geometries + exact spring attributes
    await ensureWeaponGeometries('p08', ['p08_barrel', 'p08_recoil_spring']);
    const p08Barrel = getCachedPartGeometry('p08', 'p08_barrel');
    const p08Spring = getCachedPartGeometry('p08', 'p08_recoil_spring');
    expect(p08Barrel).not.toBeNull();
    expect(p08Spring).not.toBeNull();
    expect(p08Barrel!.userData.isGlbAsset).toBeUndefined();
    expect(p08Barrel!.getAttribute(CURVATURE_ATTRIBUTE)?.itemSize).toBe(1);
    expect(p08Spring!.getAttribute(SPRING_PARAM_ATTRIBUTE)?.itemSize).toBe(4);
    expect(getWeaponGeometrySnapshot('p08')).toEqual({
      readyCount: 2,
      totalCount: 2,
      isBuilding: false,
    });

    await ensureWeaponGeometries('ak15', ['ak_receiver', 'ak_recoil_spring']);
    const akReceiver = getCachedPartGeometry('ak15', 'ak_receiver');
    const akSpring = getCachedPartGeometry('ak15', 'ak_recoil_spring');
    expect(akReceiver).not.toBeNull();
    expect(akSpring).not.toBeNull();
    expect(akSpring!.getAttribute(SPRING_PARAM_ATTRIBUTE)?.itemSize).toBe(4);

    // 3. Simulated browser where GLB network fetch fails: swallows error and falls back seamlessly to CSG
    clearWeaponGeometryCache('p08');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prevWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { origin: 'http://localhost', pathname: '/' } },
    });
    try {
      await ensureWeaponGeometries('p08', ['p08_trigger', 'p08_mag_spring']);
      const fallbackTrigger = getCachedPartGeometry('p08', 'p08_trigger');
      const fallbackMagSpring = getCachedPartGeometry('p08', 'p08_mag_spring');
      expect(fallbackTrigger).not.toBeNull();
      expect(fallbackMagSpring).not.toBeNull();
      expect(fallbackTrigger!.userData.isGlbAsset).toBeUndefined();
      expect(fallbackMagSpring!.getAttribute(SPRING_PARAM_ATTRIBUTE)?.itemSize).toBe(4);
      expect(warnSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: prevWindow,
      });
    }
  }, 20_000);

  it('wires GLB v3 PBR overrides, Cycles contact aoMapIntensity (0.95) & unclamped metalness (1.0) in PartActor.tsx', () => {
    const partActorSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/actors/PartActor.tsx'),
      'utf8'
    );
    expect(partActorSrc).toContain('getGlbPartPbrOverride');
    expect(partActorSrc).toContain('geometry?.userData?.isGlbAsset === true');
    expect(partActorSrc).toContain('aoMap={activeOrmMap}');
    expect(partActorSrc).toContain('isGlbAsset ? 0.95');
    expect(partActorSrc).toContain('isGlbAsset\n                      ? 1.0');
  });

  it('locks linear normal/ORM texture colorSpace to NoColorSpace against R3F v8 sRGB clobbering', () => {
    // 1. Direct lock helper immunity under strict-mode assignment
    const rawLinear = new THREE.Texture();
    rawLinear.colorSpace = THREE.SRGBColorSpace;
    lockLinearTextureColorSpace(rawLinear);
    expect('colorSpace' in rawLinear).toBe(true);
    expect(rawLinear.colorSpace).toBe(THREE.NoColorSpace);
    // Simulate R3F v8 `applyProps` unconditionally assigning `gl.outputColorSpace`
    rawLinear.colorSpace = THREE.SRGBColorSpace;
    expect(rawLinear.colorSpace).toBe(THREE.NoColorSpace);
    rawLinear.dispose();

    // 2. End-to-end getPartPbrBundle under simulated browser window:
    //    albedo stays SRGBColorSpace while normalMap & Packed ORM roughnessMap stay locked linear
    const prevWindow = globalThis.window;
    const loadSpy = vi
      .spyOn(THREE.TextureLoader.prototype, 'load')
      .mockImplementation((_url: string) => new THREE.Texture());
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { origin: 'http://localhost', pathname: '/' } },
    });
    try {
      const binding = getGlbPartPbrOverride('ak15', 'ak_lower_handguard');
      expect(binding).toBeDefined();
      const bundle = getPartPbrBundle('ak15', 'polymer_frame', binding);
      expect(bundle.map).not.toBeNull();
      expect(bundle.normalMap).not.toBeNull();
      expect(bundle.roughnessMap).not.toBeNull();

      expect(bundle.map!.colorSpace).toBe(THREE.SRGBColorSpace);
      expect(bundle.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(bundle.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);

      // R3F v8 applyProps clobber attempt must leave normal & Packed ORM strictly linear
      bundle.normalMap!.colorSpace = THREE.SRGBColorSpace;
      bundle.roughnessMap!.colorSpace = THREE.SRGBColorSpace;
      expect(bundle.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(bundle.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
      expect(loadSpy).toHaveBeenCalled();
    } finally {
      Object.defineProperty(globalThis, 'window', {
        configurable: true,
        writable: true,
        value: prevWindow,
      });
    }
  });
});

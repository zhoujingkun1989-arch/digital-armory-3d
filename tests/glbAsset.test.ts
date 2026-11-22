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
import { AN94_PARTS } from '../src/weapons/an94/plugin';
import { AUG_PARTS } from '../src/weapons/aug/plugin';
import { AWM_PARTS } from '../src/weapons/awm/plugin';
import { BENELLIM4_PARTS } from '../src/weapons/benellim4/plugin';
import { DEAGLE_PARTS } from '../src/weapons/deagle/plugin';
import { G11_PARTS } from '../src/weapons/g11/plugin';
import { G17_PARTS } from '../src/weapons/g17/plugin';
import { GARAND_PARTS } from '../src/weapons/garand/plugin';
import { LEOPARD2A7_PARTS } from '../src/weapons/leopard2a7/plugin';
import { LIFT33_PARTS } from '../src/weapons/lift33/plugin';
import { M134_PARTS } from '../src/weapons/m134/plugin';
import { M1A2_PARTS } from '../src/weapons/m1a2/plugin';
import { M249_PARTS } from '../src/weapons/m249/plugin';
import { M4A1_PARTS } from '../src/weapons/m4a1/plugin';
import { M82A1_PARTS } from '../src/weapons/m82a1/plugin';
import { MP5_PARTS } from '../src/weapons/mp5/plugin';
import { P08_PARTS } from '../src/weapons/p08/plugin';
import { P320_PARTS } from '../src/weapons/p320/plugin';
import { P90_PARTS } from '../src/weapons/p90/plugin';
import { PYTHON_PARTS } from '../src/weapons/python/plugin';
import { R500_PARTS } from '../src/weapons/r500/plugin';
import { REM870_PARTS } from '../src/weapons/rem870/plugin';
import { SCAR_PARTS } from '../src/weapons/scar/plugin';
import { TIGER1_PARTS } from '../src/weapons/tiger1/plugin';
import { VECTOR_PARTS } from '../src/weapons/vector/plugin';
import { VSS_PARTS } from '../src/weapons/vss/plugin';
import { WINCHESTER1894_PARTS } from '../src/weapons/winchester1894/plugin';
import { ZTZ99A_PARTS } from '../src/weapons/ztz99a/plugin';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

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

  it('resolves subpath-safe Draco decoder & GLB model URLs for ALL 29/29 exhibits and routes loaders to vendor-three-postfx', () => {
    // Root deployment ('/') across all 29 exhibits
    expect(resolveDracoDecoderPath('/')).toBe('/draco/');
    expect(WEAPON_IDS).toHaveLength(29);
    for (const wid of WEAPON_IDS) {
      expect(resolveWeaponGlbUrl(wid, '/')).toBe(`/models/${wid}.glb`);
    }
    expect(resolveWeaponGlbUrl('unknown_exhibit' as WeaponId, '/')).toBeNull();

    // Non-root GitHub Pages subpath deployment ('/digital-armory-3d/' and 'digital-armory-3d')
    expect(resolveDracoDecoderPath('/digital-armory-3d/')).toBe(
      '/digital-armory-3d/draco/'
    );
    expect(resolveDracoDecoderPath('digital-armory-3d')).toBe(
      '/digital-armory-3d/draco/'
    );
    for (const wid of WEAPON_IDS) {
      expect(resolveWeaponGlbUrl(wid, '/digital-armory-3d/')).toBe(
        `/digital-armory-3d/models/${wid}.glb`
      );
      expect(resolveWeaponGlbUrl(wid, 'digital-armory-3d')).toBe(
        `/digital-armory-3d/models/${wid}.glb`
      );
    }

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

  it('locks exact 100% disjoint part-to-atlas & dynamic-spring contracts and on-disk budgets for ALL 29/29 flagship GLB exhibits (Wave 1–4 + WP-17/18 + WP-25b)', () => {
    const migrated: WeaponId[] = [
      'p08',
      'ak15',
      'deagle',
      'm4a1',
      'python',
      'garand',
      'mp5',
      'awm',
      'm82a1',
      'g17',
      'scar',
      'aug',
      'p320',
      'p90',
      'benellim4',
      'm249',
      'vector',
      'lift33',
      'r500',
      'g11',
      'vss',
      'm134',
      'an94',
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      'winchester1894',
      'rem870',
    ];
    expect(migrated).toHaveLength(29);
    expect([...migrated].sort()).toEqual([...WEAPON_IDS].sort());
    for (const wid of migrated) {
      expect(hasGlbWeaponAsset(wid)).toBe(true);
      expect(getGlbWeaponConfig(wid)).not.toBeNull();
    }
    expect(Object.keys(GLB_WEAPON_CONFIGS).sort()).toEqual([...WEAPON_IDS].sort());

    // Unknown or non-own-property IDs degrade gracefully with safe null/false fallbacks
    for (const unknownId of [
      'unknown_exhibit',
      'toString',
      '__proto__',
    ] as unknown as WeaponId[]) {
      expect(hasGlbWeaponAsset(unknownId)).toBe(false);
      expect(getGlbWeaponConfig(unknownId)).toBeNull();
      expect(isGlbDynamicSpringPart(unknownId, 'recoil_spring')).toBe(false);
      expect(getGlbPartPbrOverride(unknownId, 'barrel')).toBeUndefined();
      expect(resolveWeaponGlbUrl(unknownId, '/')).toBeNull();
    }

    // --- 1. Luger P08 (25 parts = 3 dynamic springs + 2 walnut + 20 metal) ---
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

    // --- 2. AK-15M1 (26 parts = 2 dynamic springs + 8 furniture + 4 receiver + 12 metal) ---
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

    // --- 3. Desert Eagle Mark XIX (24 parts = 1 dynamic spring + 3 hero + 17 steel + 3 grip) ---
    const deagleCfg = GLB_WEAPON_CONFIGS.deagle!;
    expect(deagleCfg.modelFile).toBe('deagle.glb');
    expect(deagleCfg.dynamicSpringParts).toEqual(['deagle_recoil_springs']);
    const deagleIds = DEAGLE_PARTS.map((p) => p.id);
    const deagleSprings = new Set(deagleCfg.dynamicSpringParts);
    const deagleHero = new Set(['deagle_barrel', 'deagle_slide', 'deagle_frame']);
    const deagleGrip = new Set([
      'deagle_grip',
      'deagle_mag_follower',
      'deagle_mag_baseplate',
    ]);
    expect(deagleIds).toHaveLength(24);
    expect(Object.keys(deagleCfg.pbrOverrides)).toHaveLength(23);

    for (const id of deagleIds) {
      if (deagleSprings.has(id)) {
        expect(isGlbDynamicSpringPart('deagle', id)).toBe(true);
        expect(getGlbPartPbrOverride('deagle', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('deagle', id)).toBe(false);
        const ov = getGlbPartPbrOverride('deagle', id);
        expect(ov, `Missing deagle PBR override for ${id}`).toBeDefined();
        if (deagleHero.has(id)) {
          expect(ov!.albedoFile).toBe('deagle_v3_hero_albedo.webp');
          expect(ov!.normalFile).toBe('deagle_v3_hero_normal.webp');
          expect(ov!.roughnessFile).toBe('deagle_v3_hero_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else if (deagleGrip.has(id)) {
          expect(ov!.albedoFile).toBe('deagle_v3_grip_albedo.webp');
          expect(ov!.normalFile).toBe('deagle_v3_grip_normal.webp');
          expect(ov!.roughnessFile).toBe('deagle_v3_grip_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.92, 5);
        } else {
          expect(ov!.albedoFile).toBe('deagle_v3_steel_albedo.webp');
          expect(ov!.normalFile).toBe('deagle_v3_steel_normal.webp');
          expect(ov!.roughnessFile).toBe('deagle_v3_steel_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.82, 5);
        }
      }
    }

    // --- 4. Colt M4A1 SOPMOD (26 parts = 1 dynamic spring + 6 receiver + 12 metal + 7 furniture) ---
    const m4a1Cfg = GLB_WEAPON_CONFIGS.m4a1!;
    expect(m4a1Cfg.modelFile).toBe('m4a1.glb');
    expect(m4a1Cfg.dynamicSpringParts).toEqual(['m4a1_buffer_spring']);
    const m4a1Ids = M4A1_PARTS.map((p) => p.id);
    const m4a1Springs = new Set(m4a1Cfg.dynamicSpringParts);
    const m4a1Receiver = new Set([
      'm4a1_upper_receiver',
      'm4a1_lower_receiver',
      'm4a1_carry_handle',
      'm4a1_charging_handle',
      'm4a1_selector',
      'm4a1_dust_cover',
    ]);
    const m4a1Furniture = new Set([
      'm4a1_ras_upper',
      'm4a1_ras_lower',
      'm4a1_buttstock',
      'm4a1_pistol_grip',
      'm4a1_mag_body',
      'm4a1_mag_follower',
      'm4a1_mag_floorplate',
    ]);
    expect(m4a1Ids).toHaveLength(26);
    expect(Object.keys(m4a1Cfg.pbrOverrides)).toHaveLength(25);

    for (const id of m4a1Ids) {
      if (m4a1Springs.has(id)) {
        expect(isGlbDynamicSpringPart('m4a1', id)).toBe(true);
        expect(getGlbPartPbrOverride('m4a1', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('m4a1', id)).toBe(false);
        const ov = getGlbPartPbrOverride('m4a1', id);
        expect(ov, `Missing m4a1 PBR override for ${id}`).toBeDefined();
        if (m4a1Receiver.has(id)) {
          expect(ov!.albedoFile).toBe('m4a1_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('m4a1_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('m4a1_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (m4a1Furniture.has(id)) {
          expect(ov!.albedoFile).toBe('m4a1_v3_furniture_albedo.webp');
          expect(ov!.normalFile).toBe('m4a1_v3_furniture_normal.webp');
          expect(ov!.roughnessFile).toBe('m4a1_v3_furniture_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('m4a1_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('m4a1_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('m4a1_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 5. Colt Python 6" .357 Magnum (25 parts = 2 dynamic springs + 2 walnut + 21 metal) ---
    const pythonCfg = GLB_WEAPON_CONFIGS.python!;
    expect(pythonCfg.modelFile).toBe('python.glb');
    expect(pythonCfg.dynamicSpringParts).toEqual([
      'python_mainspring',
      'python_extractor_spring',
    ]);
    const pythonIds = PYTHON_PARTS.map((p) => p.id);
    const pythonSprings = new Set(pythonCfg.dynamicSpringParts);
    expect(pythonIds).toHaveLength(25);
    expect(Object.keys(pythonCfg.pbrOverrides)).toHaveLength(23);

    for (const id of pythonIds) {
      if (pythonSprings.has(id)) {
        expect(isGlbDynamicSpringPart('python', id)).toBe(true);
        expect(getGlbPartPbrOverride('python', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('python', id)).toBe(false);
        const ov = getGlbPartPbrOverride('python', id);
        expect(ov, `Missing python PBR override for ${id}`).toBeDefined();
        if (id === 'python_grip_left' || id === 'python_grip_right') {
          expect(ov!.albedoFile).toBe('python_v3_walnut_albedo.webp');
          expect(ov!.normalFile).toBe('python_v3_walnut_normal.webp');
          expect(ov!.roughnessFile).toBe('python_v3_walnut_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('python_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('python_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('python_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.8, 5);
        }
      }
    }

    // --- 6. U.S. Rifle M1 Garand (26 parts = 2 dynamic springs + 3 walnut + 6 receiver + 15 metal) ---
    const garandCfg = GLB_WEAPON_CONFIGS.garand!;
    expect(garandCfg.modelFile).toBe('garand.glb');
    expect(garandCfg.dynamicSpringParts).toEqual([
      'garand_op_rod_spring',
      'garand_hammer_spring',
    ]);
    const garandIds = GARAND_PARTS.map((p) => p.id);
    const garandSprings = new Set(garandCfg.dynamicSpringParts);
    const garandWalnut = new Set([
      'garand_walnut_stock',
      'garand_rear_handguard',
      'garand_front_handguard',
    ]);
    const garandReceiver = new Set([
      'garand_receiver',
      'garand_rear_sight',
      'garand_clip_latch',
      'garand_trigger_housing',
      'garand_trigger_guard',
      'garand_enbloc_clip',
    ]);
    expect(garandIds).toHaveLength(26);
    expect(Object.keys(garandCfg.pbrOverrides)).toHaveLength(24);

    for (const id of garandIds) {
      if (garandSprings.has(id)) {
        expect(isGlbDynamicSpringPart('garand', id)).toBe(true);
        expect(getGlbPartPbrOverride('garand', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('garand', id)).toBe(false);
        const ov = getGlbPartPbrOverride('garand', id);
        expect(ov, `Missing garand PBR override for ${id}`).toBeDefined();
        if (garandWalnut.has(id)) {
          expect(ov!.albedoFile).toBe('garand_v3_walnut_albedo.webp');
          expect(ov!.normalFile).toBe('garand_v3_walnut_normal.webp');
          expect(ov!.roughnessFile).toBe('garand_v3_walnut_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else if (garandReceiver.has(id)) {
          expect(ov!.albedoFile).toBe('garand_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('garand_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('garand_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('garand_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('garand_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('garand_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 7. H&K MP5A3 (26 parts = 1 dynamic spring + 5 receiver + 16 metal + 4 furniture) ---
    const mp5Cfg = GLB_WEAPON_CONFIGS.mp5!;
    expect(mp5Cfg.modelFile).toBe('mp5.glb');
    expect(mp5Cfg.dynamicSpringParts).toEqual(['mp5_recoil_spring']);
    const mp5Ids = MP5_PARTS.map((p) => p.id);
    const mp5Springs = new Set(mp5Cfg.dynamicSpringParts);
    const mp5Receiver = new Set([
      'mp5_upper_receiver',
      'mp5_cocking_tube',
      'mp5_front_sight',
      'mp5_rear_sight',
      'mp5_stock_endcap',
    ]);
    const mp5Furniture = new Set([
      'mp5_grip_housing',
      'mp5_forearm',
      'mp5_selector',
      'mp5_mag_follower',
    ]);
    expect(mp5Ids).toHaveLength(26);
    expect(Object.keys(mp5Cfg.pbrOverrides)).toHaveLength(25);

    for (const id of mp5Ids) {
      if (mp5Springs.has(id)) {
        expect(isGlbDynamicSpringPart('mp5', id)).toBe(true);
        expect(getGlbPartPbrOverride('mp5', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('mp5', id)).toBe(false);
        const ov = getGlbPartPbrOverride('mp5', id);
        expect(ov, `Missing mp5 PBR override for ${id}`).toBeDefined();
        if (mp5Receiver.has(id)) {
          expect(ov!.albedoFile).toBe('mp5_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('mp5_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('mp5_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (mp5Furniture.has(id)) {
          expect(ov!.albedoFile).toBe('mp5_v3_furniture_albedo.webp');
          expect(ov!.normalFile).toBe('mp5_v3_furniture_normal.webp');
          expect(ov!.roughnessFile).toBe('mp5_v3_furniture_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('mp5_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('mp5_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('mp5_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 8. Accuracy International AWM (24 parts = 1 dynamic spring + 5 chassis + 12 metal + 6 optic) ---
    const awmCfg = GLB_WEAPON_CONFIGS.awm!;
    expect(awmCfg.modelFile).toBe('awm.glb');
    expect(awmCfg.dynamicSpringParts).toEqual(['awm_firing_pin_spring']);
    const awmIds = AWM_PARTS.map((p) => p.id);
    const awmSprings = new Set(awmCfg.dynamicSpringParts);
    const awmChassis = new Set([
      'awm_chassis_skins',
      'awm_folding_stock',
      'awm_cheekpiece',
      'awm_buttpad_spacers',
      'awm_mag_follower',
    ]);
    const awmOptic = new Set([
      'awm_scope',
      'awm_scope_mount',
      'awm_bipod',
      'awm_mag_body',
      'awm_mag_spring',
      'awm_mag_floorplate',
    ]);
    expect(awmIds).toHaveLength(24);
    expect(Object.keys(awmCfg.pbrOverrides)).toHaveLength(23);

    for (const id of awmIds) {
      if (awmSprings.has(id)) {
        expect(isGlbDynamicSpringPart('awm', id)).toBe(true);
        expect(getGlbPartPbrOverride('awm', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('awm', id)).toBe(false);
        const ov = getGlbPartPbrOverride('awm', id);
        expect(ov, `Missing awm PBR override for ${id}`).toBeDefined();
        if (awmChassis.has(id)) {
          expect(ov!.albedoFile).toBe('awm_v3_chassis_albedo.webp');
          expect(ov!.normalFile).toBe('awm_v3_chassis_normal.webp');
          expect(ov!.roughnessFile).toBe('awm_v3_chassis_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else if (awmOptic.has(id)) {
          expect(ov!.albedoFile).toBe('awm_v3_optic_albedo.webp');
          expect(ov!.normalFile).toBe('awm_v3_optic_normal.webp');
          expect(ov!.roughnessFile).toBe('awm_v3_optic_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else {
          expect(ov!.albedoFile).toBe('awm_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('awm_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('awm_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        }
      }
    }

    // --- 9. Barrett M82A1 (24 parts = 2 dynamic springs + 4 receiver + 11 ordnance + 7 optics_mag) ---
    const m82Cfg = GLB_WEAPON_CONFIGS.m82a1!;
    expect(m82Cfg.modelFile).toBe('m82a1.glb');
    expect(m82Cfg.dynamicSpringParts).toEqual([
      'm82a1_recoil_spring',
      'm82a1_barrel_springs',
    ]);
    const m82Ids = M82A1_PARTS.map((p) => p.id);
    const m82Springs = new Set(m82Cfg.dynamicSpringParts);
    const m82Receiver = new Set([
      'm82a1_upper_receiver',
      'm82a1_lower_receiver',
      'm82a1_carry_handle',
      'm82a1_selector',
    ]);
    const m82OpticsMag = new Set([
      'm82a1_scope',
      'm82a1_scope_rings',
      'm82a1_pistol_grip',
      'm82a1_mag_body',
      'm82a1_mag_follower',
      'm82a1_mag_spring',
      'm82a1_mag_floorplate',
    ]);
    expect(m82Ids).toHaveLength(24);
    expect(Object.keys(m82Cfg.pbrOverrides)).toHaveLength(22);

    for (const id of m82Ids) {
      if (m82Springs.has(id)) {
        expect(isGlbDynamicSpringPart('m82a1', id)).toBe(true);
        expect(getGlbPartPbrOverride('m82a1', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('m82a1', id)).toBe(false);
        const ov = getGlbPartPbrOverride('m82a1', id);
        expect(ov, `Missing m82a1 PBR override for ${id}`).toBeDefined();
        if (m82Receiver.has(id)) {
          expect(ov!.albedoFile).toBe('m82a1_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('m82a1_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('m82a1_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (m82OpticsMag.has(id)) {
          expect(ov!.albedoFile).toBe('m82a1_v3_optics_mag_albedo.webp');
          expect(ov!.normalFile).toBe('m82a1_v3_optics_mag_normal.webp');
          expect(ov!.roughnessFile).toBe('m82a1_v3_optics_mag_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('m82a1_v3_ordnance_albedo.webp');
          expect(ov!.normalFile).toBe('m82a1_v3_ordnance_normal.webp');
          expect(ov!.roughnessFile).toBe('m82a1_v3_ordnance_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 10. Glock 17 Gen 5 (28 parts = 2 dynamic springs + 5 slide + 8 polymer + 13 metal) ---
    const g17Cfg = GLB_WEAPON_CONFIGS.g17!;
    expect(g17Cfg.modelFile).toBe('g17.glb');
    expect(g17Cfg.dynamicSpringParts).toEqual([
      'recoil_spring',
      'striker_spring',
    ]);
    const g17Ids = G17_PARTS.map((p) => p.id);
    const g17Springs = new Set(g17Cfg.dynamicSpringParts);
    const g17Slide = new Set([
      'slide',
      'front_sight',
      'rear_sight',
      'slide_cover_plate',
      'extractor',
    ]);
    const g17Polymer = new Set([
      'frame',
      'recoil_guide_rod',
      'magazine_catch',
      'trigger_housing_pin',
      'trigger_housing',
      'mag_body',
      'mag_follower',
      'mag_base_plate',
    ]);
    expect(g17Ids).toHaveLength(28);
    expect(Object.keys(g17Cfg.pbrOverrides)).toHaveLength(26);

    for (const id of g17Ids) {
      if (g17Springs.has(id)) {
        expect(isGlbDynamicSpringPart('g17', id)).toBe(true);
        expect(getGlbPartPbrOverride('g17', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('g17', id)).toBe(false);
        const ov = getGlbPartPbrOverride('g17', id);
        expect(ov, `Missing g17 PBR override for ${id}`).toBeDefined();
        if (g17Slide.has(id)) {
          expect(ov!.albedoFile).toBe('g17_v3_slide_albedo.webp');
          expect(ov!.normalFile).toBe('g17_v3_slide_normal.webp');
          expect(ov!.roughnessFile).toBe('g17_v3_slide_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        } else if (g17Polymer.has(id)) {
          expect(ov!.albedoFile).toBe('g17_v3_polymer_albedo.webp');
          expect(ov!.normalFile).toBe('g17_v3_polymer_normal.webp');
          expect(ov!.roughnessFile).toBe('g17_v3_polymer_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.92, 5);
        } else {
          expect(ov!.albedoFile).toBe('g17_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('g17_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('g17_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 11. FN SCAR-L Mk 16 Mod 0 (26 parts = 1 dynamic spring + 3 upper + 8 fde_polymer + 14 metal) ---
    const scarCfg = GLB_WEAPON_CONFIGS.scar!;
    expect(scarCfg.modelFile).toBe('scar.glb');
    expect(scarCfg.dynamicSpringParts).toEqual(['scar_recoil_spring']);
    const scarIds = SCAR_PARTS.map((p) => p.id);
    const scarSprings = new Set(scarCfg.dynamicSpringParts);
    const scarUpper = new Set([
      'scar_upper_receiver',
      'scar_rear_sight',
      'scar_barrel_crossbolts',
    ]);
    const scarFdePolymer = new Set([
      'scar_lower_receiver',
      'scar_pistol_grip',
      'scar_buttstock',
      'scar_cheek_riser',
      'scar_buttpad',
      'scar_selector',
      'scar_mag_follower',
      'scar_mag_floorplate',
    ]);
    expect(scarIds).toHaveLength(26);
    expect(Object.keys(scarCfg.pbrOverrides)).toHaveLength(25);

    for (const id of scarIds) {
      if (scarSprings.has(id)) {
        expect(isGlbDynamicSpringPart('scar', id)).toBe(true);
        expect(getGlbPartPbrOverride('scar', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('scar', id)).toBe(false);
        const ov = getGlbPartPbrOverride('scar', id);
        expect(ov, `Missing scar PBR override for ${id}`).toBeDefined();
        if (scarUpper.has(id)) {
          expect(ov!.albedoFile).toBe('scar_v3_upper_albedo.webp');
          expect(ov!.normalFile).toBe('scar_v3_upper_normal.webp');
          expect(ov!.roughnessFile).toBe('scar_v3_upper_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (scarFdePolymer.has(id)) {
          expect(ov!.albedoFile).toBe('scar_v3_fde_polymer_albedo.webp');
          expect(ov!.normalFile).toBe('scar_v3_fde_polymer_normal.webp');
          expect(ov!.roughnessFile).toBe('scar_v3_fde_polymer_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('scar_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('scar_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('scar_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 12. Steyr AUG A1 / StG 77 (25 parts = 1 dynamic spring + 10 stock + 4 receiver + 10 metal) ---
    const augCfg = GLB_WEAPON_CONFIGS.aug!;
    expect(augCfg.modelFile).toBe('aug.glb');
    expect(augCfg.dynamicSpringParts).toEqual(['aug_recoil_springs']);
    const augIds = AUG_PARTS.map((p) => p.id);
    const augSprings = new Set(augCfg.dynamicSpringParts);
    const augStock = new Set([
      'aug_stock',
      'aug_buttpad',
      'aug_foregrip',
      'aug_trigger',
      'aug_safety',
      'aug_mag_body',
      'aug_mag_follower',
      'aug_mag_floorplate',
      'aug_hammer_pack',
      'aug_hammer',
    ]);
    const augReceiver = new Set([
      'aug_receiver_optic',
      'aug_charging_handle',
      'aug_barrel_lock',
      'aug_takedown_pin',
    ]);
    expect(augIds).toHaveLength(25);
    expect(Object.keys(augCfg.pbrOverrides)).toHaveLength(24);

    for (const id of augIds) {
      if (augSprings.has(id)) {
        expect(isGlbDynamicSpringPart('aug', id)).toBe(true);
        expect(getGlbPartPbrOverride('aug', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('aug', id)).toBe(false);
        const ov = getGlbPartPbrOverride('aug', id);
        expect(ov, `Missing aug PBR override for ${id}`).toBeDefined();
        if (augStock.has(id)) {
          expect(ov!.albedoFile).toBe('aug_v3_stock_albedo.webp');
          expect(ov!.normalFile).toBe('aug_v3_stock_normal.webp');
          expect(ov!.roughnessFile).toBe('aug_v3_stock_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else if (augReceiver.has(id)) {
          expect(ov!.albedoFile).toBe('aug_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('aug_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('aug_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('aug_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('aug_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('aug_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 13. SIG Sauer P320 / U.S. Army M17 (24 parts = 2 dynamic springs + 5 slide + 3 grip + 14 fcu_metal) ---
    const p320Cfg = GLB_WEAPON_CONFIGS.p320!;
    expect(p320Cfg.modelFile).toBe('p320.glb');
    expect(p320Cfg.dynamicSpringParts).toEqual([
      'p320_recoil_spring',
      'p320_striker_spring',
    ]);
    const p320Ids = P320_PARTS.map((p) => p.id);
    const p320Springs = new Set(p320Cfg.dynamicSpringParts);
    const p320Slide = new Set([
      'p320_slide',
      'p320_optic_plate_sight',
      'p320_front_sight',
      'p320_striker_housing',
      'p320_extractor',
    ]);
    const p320Grip = new Set([
      'p320_grip_module',
      'p320_mag_follower',
      'p320_mag_baseplate',
    ]);
    expect(p320Ids).toHaveLength(24);
    expect(Object.keys(p320Cfg.pbrOverrides)).toHaveLength(22);

    for (const id of p320Ids) {
      if (p320Springs.has(id)) {
        expect(isGlbDynamicSpringPart('p320', id)).toBe(true);
        expect(getGlbPartPbrOverride('p320', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('p320', id)).toBe(false);
        const ov = getGlbPartPbrOverride('p320', id);
        expect(ov, `Missing p320 PBR override for ${id}`).toBeDefined();
        if (p320Slide.has(id)) {
          expect(ov!.albedoFile).toBe('p320_v3_slide_albedo.webp');
          expect(ov!.normalFile).toBe('p320_v3_slide_normal.webp');
          expect(ov!.roughnessFile).toBe('p320_v3_slide_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        } else if (p320Grip.has(id)) {
          expect(ov!.albedoFile).toBe('p320_v3_grip_albedo.webp');
          expect(ov!.normalFile).toBe('p320_v3_grip_normal.webp');
          expect(ov!.roughnessFile).toBe('p320_v3_grip_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.92, 5);
        } else {
          expect(ov!.albedoFile).toBe('p320_v3_fcu_metal_albedo.webp');
          expect(ov!.normalFile).toBe('p320_v3_fcu_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('p320_v3_fcu_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 14. FN Herstal P90 PDW (25 parts = 2 dynamic springs + 8 stock + 5 mag_optic + 10 metal) ---
    const p90Cfg = GLB_WEAPON_CONFIGS.p90!;
    expect(p90Cfg.modelFile).toBe('p90.glb');
    expect(p90Cfg.dynamicSpringParts).toEqual([
      'p90_recoil_springs',
      'p90_mag_spring',
    ]);
    const p90Ids = P90_PARTS.map((p) => p.id);
    const p90Springs = new Set(p90Cfg.dynamicSpringParts);
    const p90Stock = new Set([
      'p90_stock',
      'p90_buttplate',
      'p90_mag_catches',
      'p90_ejection_cover',
      'p90_trigger',
      'p90_selector',
      'p90_hammer_pack',
      'p90_mag_floorplate',
    ]);
    const p90MagOptic = new Set([
      'p90_mag_body',
      'p90_helical_ramp',
      'p90_mag_follower',
      'p90_hammer',
      'p90_ring_sight',
    ]);
    expect(p90Ids).toHaveLength(25);
    expect(Object.keys(p90Cfg.pbrOverrides)).toHaveLength(23);

    for (const id of p90Ids) {
      if (p90Springs.has(id)) {
        expect(isGlbDynamicSpringPart('p90', id)).toBe(true);
        expect(getGlbPartPbrOverride('p90', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('p90', id)).toBe(false);
        const ov = getGlbPartPbrOverride('p90', id);
        expect(ov, `Missing p90 PBR override for ${id}`).toBeDefined();
        if (p90Stock.has(id)) {
          expect(ov!.albedoFile).toBe('p90_v3_stock_albedo.webp');
          expect(ov!.normalFile).toBe('p90_v3_stock_normal.webp');
          expect(ov!.roughnessFile).toBe('p90_v3_stock_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else if (p90MagOptic.has(id)) {
          expect(ov!.albedoFile).toBe('p90_v3_mag_optic_albedo.webp');
          expect(ov!.normalFile).toBe('p90_v3_mag_optic_normal.webp');
          expect(ov!.roughnessFile).toBe('p90_v3_mag_optic_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else {
          expect(ov!.albedoFile).toBe('p90_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('p90_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('p90_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        }
      }
    }

    // --- 15. Benelli M4 Super 90 / USMC M1014 (26 parts = 3 dynamic springs + 7 receiver + 12 metal + 4 furniture) ---
    const benelliCfg = GLB_WEAPON_CONFIGS.benellim4;
    expect(benelliCfg.modelFile).toBe('benellim4.glb');
    expect(benelliCfg.dynamicSpringParts).toEqual([
      'benellim4_recoil_spring',
      'benellim4_hammer_spring',
      'benellim4_mag_spring',
    ]);
    const benelliIds = BENELLIM4_PARTS.map((p) => p.id);
    const benelliSprings = new Set(benelliCfg.dynamicSpringParts);
    const benelliReceiver = new Set([
      'benellim4_receiver',
      'benellim4_picatinny_rail',
      'benellim4_front_sight',
      'benellim4_rear_sight',
      'benellim4_trigger_housing',
      'benellim4_trigger',
      'benellim4_safety_button',
    ]);
    const benelliFurniture = new Set([
      'benellim4_forend',
      'benellim4_recoil_tube',
      'benellim4_telestock',
      'benellim4_mag_follower',
    ]);
    expect(benelliIds).toHaveLength(26);
    expect(Object.keys(benelliCfg.pbrOverrides)).toHaveLength(23);

    for (const id of benelliIds) {
      if (benelliSprings.has(id)) {
        expect(isGlbDynamicSpringPart('benellim4', id)).toBe(true);
        expect(getGlbPartPbrOverride('benellim4', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('benellim4', id)).toBe(false);
        const ov = getGlbPartPbrOverride('benellim4', id);
        expect(ov, `Missing benellim4 PBR override for ${id}`).toBeDefined();
        if (benelliReceiver.has(id)) {
          expect(ov!.albedoFile).toBe('benellim4_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('benellim4_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('benellim4_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (benelliFurniture.has(id)) {
          expect(ov!.albedoFile).toBe('benellim4_v3_furniture_albedo.webp');
          expect(ov!.normalFile).toBe('benellim4_v3_furniture_normal.webp');
          expect(ov!.roughnessFile).toBe(
            'benellim4_v3_furniture_roughness.webp'
          );
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('benellim4_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('benellim4_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('benellim4_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 16. FN M249 SAW (26 parts = 2 dynamic springs + 6 receiver + 13 metal + 5 furniture) ---
    const m249Cfg = GLB_WEAPON_CONFIGS.m249;
    expect(m249Cfg.modelFile).toBe('m249.glb');
    expect(m249Cfg.dynamicSpringParts).toEqual([
      'm249_recoil_spring',
      'm249_sear_spring',
    ]);
    const m249Ids = M249_PARTS.map((p) => p.id);
    const m249Springs = new Set(m249Cfg.dynamicSpringParts);
    const m249Receiver = new Set([
      'm249_receiver',
      'm249_top_cover',
      'm249_rear_sight',
      'm249_front_sight',
      'm249_feed_tray',
      'm249_charging_handle',
    ]);
    const m249Furniture = new Set([
      'm249_barrel_handle',
      'm249_handguard',
      'm249_buttstock',
      'm249_trigger_frame',
      'm249_ammo_box',
    ]);
    expect(m249Ids).toHaveLength(26);
    expect(Object.keys(m249Cfg.pbrOverrides)).toHaveLength(24);

    for (const id of m249Ids) {
      if (m249Springs.has(id)) {
        expect(isGlbDynamicSpringPart('m249', id)).toBe(true);
        expect(getGlbPartPbrOverride('m249', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('m249', id)).toBe(false);
        const ov = getGlbPartPbrOverride('m249', id);
        expect(ov, `Missing m249 PBR override for ${id}`).toBeDefined();
        if (m249Receiver.has(id)) {
          expect(ov!.albedoFile).toBe('m249_v3_receiver_albedo.webp');
          expect(ov!.normalFile).toBe('m249_v3_receiver_normal.webp');
          expect(ov!.roughnessFile).toBe('m249_v3_receiver_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (m249Furniture.has(id)) {
          expect(ov!.albedoFile).toBe('m249_v3_furniture_albedo.webp');
          expect(ov!.normalFile).toBe('m249_v3_furniture_normal.webp');
          expect(ov!.roughnessFile).toBe('m249_v3_furniture_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('m249_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('m249_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('m249_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 17. KRISS Vector SMG Gen II (25 parts = 3 dynamic springs + 7 housing + 12 metal + 3 mag) ---
    const vectorCfg = GLB_WEAPON_CONFIGS.vector;
    expect(vectorCfg.modelFile).toBe('vector.glb');
    expect(vectorCfg.dynamicSpringParts).toEqual([
      'vector_recoil_spring',
      'vector_hammer_spring',
      'vector_mag_spring',
    ]);
    const vectorIds = VECTOR_PARTS.map((p) => p.id);
    const vectorSprings = new Set(vectorCfg.dynamicSpringParts);
    const vectorHousing = new Set([
      'vector_upper_housing',
      'vector_lower_chassis',
      'vector_folding_stock',
      'vector_front_sight',
      'vector_rear_sight',
      'vector_fire_selector',
      'vector_thumb_safety',
    ]);
    const vectorMag = new Set([
      'vector_mag_body',
      'vector_mag_follower',
      'vector_mag_baseplate',
    ]);
    expect(vectorIds).toHaveLength(25);
    expect(Object.keys(vectorCfg.pbrOverrides)).toHaveLength(22);

    for (const id of vectorIds) {
      if (vectorSprings.has(id)) {
        expect(isGlbDynamicSpringPart('vector', id)).toBe(true);
        expect(getGlbPartPbrOverride('vector', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('vector', id)).toBe(false);
        const ov = getGlbPartPbrOverride('vector', id);
        expect(ov, `Missing vector PBR override for ${id}`).toBeDefined();
        if (vectorHousing.has(id)) {
          expect(ov!.albedoFile).toBe('vector_v3_housing_albedo.webp');
          expect(ov!.normalFile).toBe('vector_v3_housing_normal.webp');
          expect(ov!.roughnessFile).toBe('vector_v3_housing_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (vectorMag.has(id)) {
          expect(ov!.albedoFile).toBe('vector_v3_mag_albedo.webp');
          expect(ov!.normalFile).toBe('vector_v3_mag_normal.webp');
          expect(ov!.roughnessFile).toBe('vector_v3_mag_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        } else {
          expect(ov!.albedoFile).toBe('vector_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('vector_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('vector_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.82, 5);
        }
      }
    }

    // --- 18. Mathews LIFT 33 Compound Bow (24 parts = 5 dynamic CSG limbs/axles/strings + 6 riser + 8 cams_acc + 5 quiver_arrow) ---
    const liftCfg = GLB_WEAPON_CONFIGS.lift33;
    expect(liftCfg.modelFile).toBe('lift33.glb');
    expect(liftCfg.dynamicSpringParts).toEqual([
      'lift33_upper_limbs',
      'lift33_lower_limbs',
      'lift33_cam_axles',
      'lift33_bowstring',
      'lift33_yoke_cables',
    ]);
    const liftIds = LIFT33_PARTS.map((p) => p.id);
    const liftSprings = new Set(liftCfg.dynamicSpringParts);
    const liftRiser = new Set([
      'lift33_riser',
      'lift33_grip',
      'lift33_upper_pocket',
      'lift33_lower_pocket',
      'lift33_cable_guard',
      'lift33_stabilizer',
    ]);
    const liftQuiverArrow = new Set([
      'lift33_quiver_frame',
      'lift33_quiver_hood',
      'lift33_quiver_latch',
      'lift33_arrow_shaft',
      'lift33_broadhead',
    ]);
    expect(liftIds).toHaveLength(24);
    expect(Object.keys(liftCfg.pbrOverrides)).toHaveLength(19);

    for (const id of liftIds) {
      if (liftSprings.has(id)) {
        expect(isGlbDynamicSpringPart('lift33', id)).toBe(true);
        expect(getGlbPartPbrOverride('lift33', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('lift33', id)).toBe(false);
        const ov = getGlbPartPbrOverride('lift33', id);
        expect(ov, `Missing lift33 PBR override for ${id}`).toBeDefined();
        if (liftRiser.has(id)) {
          expect(ov!.albedoFile).toBe('lift33_v3_riser_albedo.webp');
          expect(ov!.normalFile).toBe('lift33_v3_riser_normal.webp');
          expect(ov!.roughnessFile).toBe('lift33_v3_riser_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (liftQuiverArrow.has(id)) {
          expect(ov!.albedoFile).toBe('lift33_v3_quiver_arrow_albedo.webp');
          expect(ov!.normalFile).toBe('lift33_v3_quiver_arrow_normal.webp');
          expect(ov!.roughnessFile).toBe(
            'lift33_v3_quiver_arrow_roughness.webp'
          );
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('lift33_v3_cams_acc_albedo.webp');
          expect(ov!.normalFile).toBe('lift33_v3_cams_acc_normal.webp');
          expect(ov!.roughnessFile).toBe('lift33_v3_cams_acc_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 19. Ravin R500 Crossbow (25 parts = 6 dynamic CSG limbs/axles/strings/spring + 6 chassis + 9 cams_mech + 4 optic_bolt) ---
    const r500Cfg = GLB_WEAPON_CONFIGS.r500;
    expect(r500Cfg.modelFile).toBe('r500.glb');
    expect(r500Cfg.dynamicSpringParts).toEqual([
      'r500_left_limbs',
      'r500_right_limbs',
      'r500_cam_axles',
      'r500_bowstring',
      'r500_power_cables',
      'r500_trigger_spring',
    ]);
    const r500Ids = R500_PARTS.map((p) => p.id);
    const r500Springs = new Set(r500Cfg.dynamicSpringParts);
    const r500Chassis = new Set([
      'r500_chassis',
      'r500_forend_grip',
      'r500_pistol_grip',
      'r500_buttstock',
      'r500_flight_rail',
      'r500_riser_head',
    ]);
    const r500OpticBolt = new Set([
      'r500_scope',
      'r500_quiver_frame',
      'r500_retention_arm',
      'r500_carbon_bolt',
    ]);
    expect(r500Ids).toHaveLength(25);
    expect(Object.keys(r500Cfg.pbrOverrides)).toHaveLength(19);

    for (const id of r500Ids) {
      if (r500Springs.has(id)) {
        expect(isGlbDynamicSpringPart('r500', id)).toBe(true);
        expect(getGlbPartPbrOverride('r500', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('r500', id)).toBe(false);
        const ov = getGlbPartPbrOverride('r500', id);
        expect(ov, `Missing r500 PBR override for ${id}`).toBeDefined();
        if (r500Chassis.has(id)) {
          expect(ov!.albedoFile).toBe('r500_v3_chassis_albedo.webp');
          expect(ov!.normalFile).toBe('r500_v3_chassis_normal.webp');
          expect(ov!.roughnessFile).toBe('r500_v3_chassis_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (r500OpticBolt.has(id)) {
          expect(ov!.albedoFile).toBe('r500_v3_optic_bolt_albedo.webp');
          expect(ov!.normalFile).toBe('r500_v3_optic_bolt_normal.webp');
          expect(ov!.roughnessFile).toBe('r500_v3_optic_bolt_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else {
          expect(ov!.albedoFile).toBe('r500_v3_cams_mech_albedo.webp');
          expect(ov!.normalFile).toBe('r500_v3_cams_mech_normal.webp');
          expect(ov!.roughnessFile).toBe('r500_v3_cams_mech_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        }
      }
    }

    // --- 20. H&K G11 K2 (24 parts = 2 dynamic springs + 7 housing + 9 clockwork + 6 barrel_mag) ---
    const g11Cfg = GLB_WEAPON_CONFIGS.g11;
    expect(g11Cfg.modelFile).toBe('g11.glb');
    expect(g11Cfg.dynamicSpringParts).toEqual([
      'g11_recoil_spring',
      'g11_mag_spring',
    ]);
    const g11Ids = G11_PARTS.map((p) => p.id);
    const g11Springs = new Set(g11Cfg.dynamicSpringParts);
    const g11Housing = new Set([
      'g11_outer_housing',
      'g11_optic_handle',
      'g11_pistol_grip',
      'g11_buttplate',
      'g11_winding_knob',
      'g11_selector',
      'g11_spare_clips',
    ]);
    const g11BarrelMag = new Set([
      'g11_barrel',
      'g11_flash_hider',
      'g11_trigger',
      'g11_mag_tube',
      'g11_mag_follower',
      'g11_mag_endcap',
    ]);
    expect(g11Ids).toHaveLength(24);
    expect(Object.keys(g11Cfg.pbrOverrides)).toHaveLength(22);

    for (const id of g11Ids) {
      if (g11Springs.has(id)) {
        expect(isGlbDynamicSpringPart('g11', id)).toBe(true);
        expect(getGlbPartPbrOverride('g11', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('g11', id)).toBe(false);
        const ov = getGlbPartPbrOverride('g11', id);
        expect(ov, `Missing g11 PBR override for ${id}`).toBeDefined();
        if (g11Housing.has(id)) {
          expect(ov!.albedoFile).toBe('g11_v3_housing_albedo.webp');
          expect(ov!.normalFile).toBe('g11_v3_housing_normal.webp');
          expect(ov!.roughnessFile).toBe('g11_v3_housing_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (g11BarrelMag.has(id)) {
          expect(ov!.albedoFile).toBe('g11_v3_barrel_mag_albedo.webp');
          expect(ov!.normalFile).toBe('g11_v3_barrel_mag_normal.webp');
          expect(ov!.roughnessFile).toBe('g11_v3_barrel_mag_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        } else {
          expect(ov!.albedoFile).toBe('g11_v3_clockwork_albedo.webp');
          expect(ov!.normalFile).toBe('g11_v3_clockwork_normal.webp');
          expect(ov!.roughnessFile).toBe('g11_v3_clockwork_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 21. VSS Vintorez (24 parts = 2 dynamic springs + 7 receiver_supp + 4 wood_optic + 11 metal) ---
    const vssCfg = GLB_WEAPON_CONFIGS.vss;
    expect(vssCfg.modelFile).toBe('vss.glb');
    expect(vssCfg.dynamicSpringParts).toEqual([
      'vss_recoil_spring',
      'vss_striker_spring',
    ]);
    const vssIds = VSS_PARTS.map((p) => p.id);
    const vssSprings = new Set(vssCfg.dynamicSpringParts);
    const vssReceiverSupp = new Set([
      'vss_receiver',
      'vss_dust_cover',
      'vss_suppressor_tube',
      'vss_rear_sight',
      'vss_forend',
      'vss_safety_lever',
      'vss_selector_switch',
    ]);
    const vssWoodOptic = new Set([
      'vss_wood_stock',
      'vss_pso1_scope',
      'vss_mag_body',
      'vss_mag_follower',
    ]);
    expect(vssIds).toHaveLength(24);
    expect(Object.keys(vssCfg.pbrOverrides)).toHaveLength(22);

    for (const id of vssIds) {
      if (vssSprings.has(id)) {
        expect(isGlbDynamicSpringPart('vss', id)).toBe(true);
        expect(getGlbPartPbrOverride('vss', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('vss', id)).toBe(false);
        const ov = getGlbPartPbrOverride('vss', id);
        expect(ov, `Missing vss PBR override for ${id}`).toBeDefined();
        if (vssReceiverSupp.has(id)) {
          expect(ov!.albedoFile).toBe('vss_v3_receiver_supp_albedo.webp');
          expect(ov!.normalFile).toBe('vss_v3_receiver_supp_normal.webp');
          expect(ov!.roughnessFile).toBe('vss_v3_receiver_supp_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (vssWoodOptic.has(id)) {
          expect(ov!.albedoFile).toBe('vss_v3_wood_optic_albedo.webp');
          expect(ov!.normalFile).toBe('vss_v3_wood_optic_normal.webp');
          expect(ov!.roughnessFile).toBe('vss_v3_wood_optic_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else {
          expect(ov!.albedoFile).toBe('vss_v3_metal_albedo.webp');
          expect(ov!.normalFile).toBe('vss_v3_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('vss_v3_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.84, 5);
        }
      }
    }

    // --- 22. M134D Minigun (25 parts = 2 dynamic springs + 7 housing_motor + 6 barrels_rotor + 10 delinker_bolts) ---
    const m134Cfg = GLB_WEAPON_CONFIGS.m134;
    expect(m134Cfg.modelFile).toBe('m134.glb');
    expect(m134Cfg.dynamicSpringParts).toEqual([
      'm134_clutch_spring',
      'm134_feeder_spring',
    ]);
    const m134Ids = M134_PARTS.map((p) => p.id);
    const m134Springs = new Set(m134Cfg.dynamicSpringParts);
    const m134HousingMotor = new Set([
      'm134_main_housing',
      'm134_cam_track_ring',
      'm134_drive_motor',
      'm134_gear_housing',
      'm134_spade_grip',
      'm134_carry_handle',
      'm134_mount_pintle',
    ]);
    const m134BarrelsRotor = new Set([
      'm134_barrel_cluster',
      'm134_barrel_clamp',
      'm134_flash_suppressor',
      'm134_rotor_assembly',
      'm134_drive_gear',
      'm134_safing_sector',
    ]);
    expect(m134Ids).toHaveLength(25);
    expect(Object.keys(m134Cfg.pbrOverrides)).toHaveLength(23);

    for (const id of m134Ids) {
      if (m134Springs.has(id)) {
        expect(isGlbDynamicSpringPart('m134', id)).toBe(true);
        expect(getGlbPartPbrOverride('m134', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('m134', id)).toBe(false);
        const ov = getGlbPartPbrOverride('m134', id);
        expect(ov, `Missing m134 PBR override for ${id}`).toBeDefined();
        if (m134HousingMotor.has(id)) {
          expect(ov!.albedoFile).toBe('m134_v3_housing_motor_albedo.webp');
          expect(ov!.normalFile).toBe('m134_v3_housing_motor_normal.webp');
          expect(ov!.roughnessFile).toBe('m134_v3_housing_motor_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else if (m134BarrelsRotor.has(id)) {
          expect(ov!.albedoFile).toBe('m134_v3_barrels_rotor_albedo.webp');
          expect(ov!.normalFile).toBe('m134_v3_barrels_rotor_normal.webp');
          expect(ov!.roughnessFile).toBe('m134_v3_barrels_rotor_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        } else {
          expect(ov!.albedoFile).toBe('m134_v3_delinker_bolts_albedo.webp');
          expect(ov!.normalFile).toBe('m134_v3_delinker_bolts_normal.webp');
          expect(ov!.roughnessFile).toBe(
            'm134_v3_delinker_bolts_roughness.webp'
          );
          expect(ov!.normalScale).toBeCloseTo(0.86, 5);
        }
      }
    }

    // --- 23. AN-94 Abakan (26 parts = 2 dynamic springs + 7 receiver_stock + 10 pulley_metal + 7 barrel_mag) ---
    const an94Cfg = GLB_WEAPON_CONFIGS.an94;
    expect(an94Cfg.modelFile).toBe('an94.glb');
    expect(an94Cfg.dynamicSpringParts).toEqual([
      'an94_recoil_spring',
      'an94_receiver_buffer_spring',
    ]);
    const an94Ids = AN94_PARTS.map((p) => p.id);
    const an94Springs = new Set(an94Cfg.dynamicSpringParts);
    const an94ReceiverStock = new Set([
      'an94_outer_housing',
      'an94_dust_cover',
      'an94_buttstock',
      'an94_pistol_grip',
      'an94_rear_sight',
      'an94_safety_switch',
      'an94_fire_selector',
    ]);
    const an94BarrelMag = new Set([
      'an94_barrel',
      'an94_gas_tube',
      'an94_muzzle_brake',
      'an94_mag_body',
      'an94_mag_follower',
      'an94_mag_spring',
      'an94_mag_floorplate',
    ]);
    expect(an94Ids).toHaveLength(26);
    expect(Object.keys(an94Cfg.pbrOverrides)).toHaveLength(24);

    for (const id of an94Ids) {
      if (an94Springs.has(id)) {
        expect(isGlbDynamicSpringPart('an94', id)).toBe(true);
        expect(getGlbPartPbrOverride('an94', id)).toBeUndefined();
      } else {
        expect(isGlbDynamicSpringPart('an94', id)).toBe(false);
        const ov = getGlbPartPbrOverride('an94', id);
        expect(ov, `Missing an94 PBR override for ${id}`).toBeDefined();
        if (an94ReceiverStock.has(id)) {
          expect(ov!.albedoFile).toBe('an94_v3_receiver_stock_albedo.webp');
          expect(ov!.normalFile).toBe('an94_v3_receiver_stock_normal.webp');
          expect(ov!.roughnessFile).toBe(
            'an94_v3_receiver_stock_roughness.webp'
          );
          expect(ov!.normalScale).toBeCloseTo(0.9, 5);
        } else if (an94BarrelMag.has(id)) {
          expect(ov!.albedoFile).toBe('an94_v3_barrel_mag_albedo.webp');
          expect(ov!.normalFile).toBe('an94_v3_barrel_mag_normal.webp');
          expect(ov!.roughnessFile).toBe('an94_v3_barrel_mag_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.88, 5);
        } else {
          expect(ov!.albedoFile).toBe('an94_v3_pulley_metal_albedo.webp');
          expect(ov!.normalFile).toBe('an94_v3_pulley_metal_normal.webp');
          expect(ov!.roughnessFile).toBe('an94_v3_pulley_metal_roughness.webp');
          expect(ov!.normalScale).toBeCloseTo(0.85, 5);
        }
      }
    }

    // --- 24–27. WP-18 Heavy Armor Hall 1:1 Main Battle Tanks (4 × 26 parts = 96 solid GLB + 8 dynamic CSG springs) ---
    const tankContracts: ReadonlyArray<{
      id: WeaponId;
      modelFile: string;
      parts: readonly { id: string }[];
      springs: readonly string[];
      suitePrefixes: readonly string[];
    }> = [
      {
        id: 'ztz99a',
        modelFile: 'ztz99a.glb',
        parts: ZTZ99A_PARTS,
        springs: ['ztz99a_recoil_springs', 'ztz99a_rammer_spring'],
        suitePrefixes: [
          'ztz99a_v3_armor_hull',
          'ztz99a_v3_turret_gun',
          'ztz99a_v3_interior_power',
        ],
      },
      {
        id: 'm1a2',
        modelFile: 'm1a2.glb',
        parts: M1A2_PARTS,
        springs: ['m1a2_recoil_springs', 'm1a2_door_spring'],
        suitePrefixes: [
          'm1a2_v3_hull_armor',
          'm1a2_v3_turret_gun',
          'm1a2_v3_turbine_bustle',
        ],
      },
      {
        id: 'leopard2a7',
        modelFile: 'leopard2a7.glb',
        parts: LEOPARD2A7_PARTS,
        springs: ['leo_recoil_springs', 'leo_breech_spring'],
        suitePrefixes: [
          'leopard2a7_v3_hull_camo',
          'leopard2a7_v3_turret_gun',
          'leopard2a7_v3_powerpack_int',
        ],
      },
      {
        id: 'tiger1',
        modelFile: 'tiger1.glb',
        parts: TIGER1_PARTS,
        springs: ['tiger_recoil_springs', 'tiger_breech_spring'],
        suitePrefixes: [
          'tiger1_v3_hull_zimmerit',
          'tiger1_v3_turret_88mm',
          'tiger1_v3_drivetrain_int',
        ],
      },
    ];

    for (const tc of tankContracts) {
      const cfg = GLB_WEAPON_CONFIGS[tc.id];
      expect(cfg.modelFile).toBe(tc.modelFile);
      expect(cfg.dynamicSpringParts).toEqual(tc.springs);
      expect(tc.parts).toHaveLength(26);
      expect(Object.keys(cfg.pbrOverrides)).toHaveLength(24);
      const springSet = new Set(tc.springs);
      const seenSuites = new Set<string>();
      for (const p of tc.parts) {
        if (springSet.has(p.id)) {
          expect(isGlbDynamicSpringPart(tc.id, p.id)).toBe(true);
          expect(getGlbPartPbrOverride(tc.id, p.id)).toBeUndefined();
        } else {
          expect(isGlbDynamicSpringPart(tc.id, p.id)).toBe(false);
          const ov = getGlbPartPbrOverride(tc.id, p.id);
          expect(ov, `Missing ${tc.id} PBR override for ${p.id}`).toBeDefined();
          const matchedPrefix = tc.suitePrefixes.find(
            (pref) => ov!.albedoFile === `${pref}_albedo.webp`
          );
          expect(
            matchedPrefix,
            `Unexpected texture suite on ${tc.id}.${p.id}: ${ov!.albedoFile}`
          ).toBeDefined();
          expect(ov!.normalFile).toBe(`${matchedPrefix}_normal.webp`);
          expect(ov!.roughnessFile).toBe(`${matchedPrefix}_roughness.webp`);
          seenSuites.add(matchedPrefix!);
        }
      }
      expect(seenSuites.size).toBe(3);
    }

    // --- 28–29. WP-25b Lever & Pump Action Classics: Winchester 1894 + Remington 870 (each 24 parts = 21 solid GLB + 3 dynamic CSG springs) ---
    const wp25Contracts = [
      {
        id: 'winchester1894' as WeaponId,
        modelFile: 'winchester1894.glb',
        parts: WINCHESTER1894_PARTS,
        springs: ['win94_mainspring', 'win94_sear_spring', 'win94_mag_spring'],
        suitePrefixes: ['win94_v3_walnut', 'win94_v3_receiver', 'win94_v3_metal'],
      },
      {
        id: 'rem870' as WeaponId,
        modelFile: 'rem870.glb',
        parts: REM870_PARTS,
        springs: [
          'rem870_hammer_spring',
          'rem870_firing_pin_spring',
          'rem870_mag_spring',
        ],
        suitePrefixes: [
          'rem870_v3_walnut',
          'rem870_v3_receiver',
          'rem870_v3_metal',
        ],
      },
    ];

    for (const wc of wp25Contracts) {
      const cfg = GLB_WEAPON_CONFIGS[wc.id];
      expect(cfg.modelFile).toBe(wc.modelFile);
      expect(cfg.dynamicSpringParts).toEqual(wc.springs);
      expect(wc.parts).toHaveLength(24);
      expect(Object.keys(cfg.pbrOverrides)).toHaveLength(21);
      const springSet = new Set(wc.springs);
      const seenSuites = new Set<string>();
      for (const p of wc.parts) {
        if (springSet.has(p.id)) {
          expect(isGlbDynamicSpringPart(wc.id, p.id)).toBe(true);
          expect(getGlbPartPbrOverride(wc.id, p.id)).toBeUndefined();
        } else {
          expect(isGlbDynamicSpringPart(wc.id, p.id)).toBe(false);
          const ov = getGlbPartPbrOverride(wc.id, p.id);
          expect(ov, `Missing ${wc.id} PBR override for ${p.id}`).toBeDefined();
          const matchedPrefix = wc.suitePrefixes.find(
            (pref) => ov!.albedoFile === `${pref}_albedo.webp`
          );
          expect(
            matchedPrefix,
            `Unexpected texture suite on ${wc.id}.${p.id}: ${ov!.albedoFile}`
          ).toBeDefined();
          expect(ov!.normalFile).toBe(`${matchedPrefix}_normal.webp`);
          expect(ov!.roughnessFile).toBe(`${matchedPrefix}_roughness.webp`);
          seenSuites.add(matchedPrefix!);
        }
      }
      expect(seenSuites.size).toBe(3);
    }

    // --- V5.0 29/29 part accounting invariant: 667 solid GLB + 64 dynamic CSG = 731 total parts ---
    const totalSolidGlbParts = migrated.reduce(
      (sum, wid) => sum + Object.keys(GLB_WEAPON_CONFIGS[wid].pbrOverrides).length,
      0
    );
    const totalDynamicCsgParts = migrated.reduce(
      (sum, wid) => sum + GLB_WEAPON_CONFIGS[wid].dynamicSpringParts.length,
      0
    );
    expect(totalSolidGlbParts).toBe(667);
    expect(totalDynamicCsgParts).toBe(64);
    expect(totalSolidGlbParts + totalDynamicCsgParts).toBe(731);

    // --- Verify on-disk binary GLB headers, exact node/mesh alignment, referenced v3 WebP maps & per-exhibit MB size budgets ---
    const modelsDir = path.resolve(__dirname, '../public/models');
    const texturesDir = path.resolve(__dirname, '../public/textures');
    const maxBudgetBytes: Record<WeaponId, number> = {
      p08: 10 * 1024 * 1024,
      python: 10 * 1024 * 1024,
      ak15: 12 * 1024 * 1024,
      deagle: 12 * 1024 * 1024,
      m4a1: 12 * 1024 * 1024,
      garand: 12 * 1024 * 1024,
      mp5: 12 * 1024 * 1024,
      awm: 12 * 1024 * 1024,
      m82a1: 12 * 1024 * 1024,
      g17: 12 * 1024 * 1024,
      scar: 12 * 1024 * 1024,
      aug: 12 * 1024 * 1024,
      p320: 12 * 1024 * 1024,
      p90: 12 * 1024 * 1024,
      benellim4: 12 * 1024 * 1024,
      m249: 12 * 1024 * 1024,
      vector: 12 * 1024 * 1024,
      lift33: 12 * 1024 * 1024,
      r500: 12 * 1024 * 1024,
      g11: 12 * 1024 * 1024,
      vss: 12 * 1024 * 1024,
      m134: 12 * 1024 * 1024,
      an94: 12 * 1024 * 1024,
      ztz99a: 12 * 1024 * 1024,
      m1a2: 12 * 1024 * 1024,
      leopard2a7: 12 * 1024 * 1024,
      tiger1: 12 * 1024 * 1024,
      winchester1894: 12 * 1024 * 1024,
      rem870: 12 * 1024 * 1024,
    };

    for (const wid of migrated) {
      const cfg = GLB_WEAPON_CONFIGS[wid]!;
      const glbPath = path.join(modelsDir, cfg.modelFile);
      expect(fs.existsSync(glbPath), `Missing ${glbPath}`).toBe(true);
      const glbBuf = fs.readFileSync(glbPath);
      expect(glbBuf.readUInt32LE(0), `${cfg.modelFile} bad glTF magic`).toBe(
        0x46546c67
      );
      expect(glbBuf.readUInt32LE(4), `${cfg.modelFile} must be glTF v2`).toBe(2);

      // Verify embedded glTF JSON chunk nodes match pbrOverrides 1:1 with 0 dynamic springs & 0 non-identity transforms
      const jsonLen = glbBuf.readUInt32LE(12);
      const gltfJson = JSON.parse(
        glbBuf.subarray(20, 20 + jsonLen).toString('utf8')
      ) as {
        nodes?: Array<{
          name?: string;
          translation?: number[];
          rotation?: number[];
          scale?: number[];
          matrix?: number[];
        }>;
        meshes?: unknown[];
      };
      const nodeNames = (gltfJson.nodes ?? []).map((n) => n.name ?? '');
      const expectedSolidParts = Object.keys(cfg.pbrOverrides).sort();
      expect([...nodeNames].sort(), `${wid} GLB node set mismatch`).toEqual(
        expectedSolidParts
      );
      expect(gltfJson.meshes?.length, `${wid} meshes !== nodes`).toBe(
        nodeNames.length
      );
      for (const node of gltfJson.nodes ?? []) {
        expect(
          Boolean(
            node.translation || node.rotation || node.scale || node.matrix
          ),
          `${wid} non-identity node transform on ${node.name}`
        ).toBe(false);
      }

      const uniqueWebps = new Set<string>();
      for (const spec of Object.values(cfg.pbrOverrides)) {
        uniqueWebps.add(spec.albedoFile);
        uniqueWebps.add(spec.normalFile);
        uniqueWebps.add(spec.roughnessFile);
      }
      let totalBytes = glbBuf.byteLength;
      for (const texFile of uniqueWebps) {
        const texPath = path.join(texturesDir, texFile);
        expect(fs.existsSync(texPath), `Missing v3 WebP ${texPath}`).toBe(true);
        totalBytes += fs.statSync(texPath).size;
      }
      expect(
        totalBytes,
        `${wid} total bundle (${(totalBytes / 1048576).toFixed(2)} MB) exceeds budget`
      ).toBeLessThanOrEqual(maxBudgetBytes[wid]);
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

    // 3. Simulated browser where GLB network fetch fails or weapon ID is unknown: swallows error and falls back seamlessly to CSG
    clearWeaponGeometryCache('p08');
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const prevWindow = globalThis.window;
    Object.defineProperty(globalThis, 'window', {
      configurable: true,
      writable: true,
      value: { location: { origin: 'http://localhost', pathname: '/' } },
    });
    try {
      const unknownMap = await loadWeaponGlbGeometries(
        'unknown_exhibit' as WeaponId,
        ['x_part']
      );
      expect(unknownMap.size).toBe(0);

      await expect(
        parseGlbArrayBuffer(new ArrayBuffer(16), 'p08', ['p08_barrel'], {
          useDraco: false,
        })
      ).rejects.toThrow();

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

  it('wires GLB v3 PBR overrides, Cycles contact aoMapIntensity (0.95 firearms / 1.26 tanks) & unclamped metalness (1.0) in PartActor.tsx', () => {
    const partActorSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/engine/actors/PartActor.tsx'),
      'utf8'
    );
    expect(partActorSrc).toContain('getGlbPartPbrOverride');
    expect(partActorSrc).toContain('geometry?.userData?.isGlbAsset === true');
    expect(partActorSrc).toContain('aoMap={activeOrmMap}');
    expect(partActorSrc).toContain('aoMapIntensity={resolvedAoMapIntensity}');
    expect(partActorSrc).toContain('isTank\n        ? 1.26\n        : 0.95');
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

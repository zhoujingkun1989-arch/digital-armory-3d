import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CENTENNIAL_SHARED_MATERIAL_PREFIX,
  clearPbrTextureCache,
  getPbrCacheStats,
  getPartPbrBundle,
  isCentennialSharedTextureFile,
} from '../src/engine/materials/pbrManager';
import {
  MUSEUM_CENTENNIAL_SHARED_PBR_SUITE_COUNT,
  MUSEUM_CENTENNIAL_SHARED_PBR_WEBP_COUNT,
  MUSEUM_FLAGSHIP_PBR_SUITE_COUNT,
  MUSEUM_FLAGSHIP_PBR_WEBP_COUNT,
  MUSEUM_PBR_SUITE_COUNT,
  MUSEUM_PBR_WEBP_COUNT,
} from '../src/weapons/museumMetrics';

const REPO_ROOT = path.resolve(__dirname, '..');
const TEXTURES_DIR = path.join(REPO_ROOT, 'public', 'textures');
const GENERATOR_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'pbr_core',
  'generate_centennial_materials.py'
);

const CENTENNIAL_SHARED_MATERIAL_NAMES = [
  'oiled_walnut',
  'russian_laminate',
  'beech_yew',
  'blued_steel',
  'parkerized_steel',
  'anodized_alloy',
  'brushed_stainless',
  'tactical_polymer',
  'checkered_grip',
  'cast_rha_armor',
  'carc_olive',
  'carc_desert',
  'cartridge_brass',
] as const;

const CHANNELS = ['albedo', 'normal', 'roughness'] as const;

const EXPECTED_ORM_RANGES: Record<
  (typeof CENTENNIAL_SHARED_MATERIAL_NAMES)[number],
  { roughMin: number; roughMax: number; metalTarget: number }
> = {
  oiled_walnut: { roughMin: 0.56, roughMax: 0.72, metalTarget: 0.0 },
  russian_laminate: { roughMin: 0.44, roughMax: 0.64, metalTarget: 0.0 },
  beech_yew: { roughMin: 0.54, roughMax: 0.70, metalTarget: 0.0 },
  blued_steel: { roughMin: 0.24, roughMax: 0.38, metalTarget: 0.92 },
  parkerized_steel: { roughMin: 0.36, roughMax: 0.52, metalTarget: 0.84 },
  anodized_alloy: { roughMin: 0.32, roughMax: 0.46, metalTarget: 0.88 },
  brushed_stainless: { roughMin: 0.16, roughMax: 0.30, metalTarget: 0.98 },
  tactical_polymer: { roughMin: 0.58, roughMax: 0.74, metalTarget: 0.0 },
  checkered_grip: { roughMin: 0.54, roughMax: 0.76, metalTarget: 0.0 },
  cast_rha_armor: { roughMin: 0.66, roughMax: 0.84, metalTarget: 0.18 },
  carc_olive: { roughMin: 0.72, roughMax: 0.88, metalTarget: 0.04 },
  carc_desert: { roughMin: 0.74, roughMax: 0.90, metalTarget: 0.03 },
  cartridge_brass: { roughMin: 0.18, roughMax: 0.34, metalTarget: 0.98 },
};

function parseWebpHeader(buf: Buffer, label: string): {
  width: number;
  height: number;
  hasAlpha: boolean;
} {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error(`${label}: not a valid RIFF/WEBP file`);
  }
  const fourcc = buf.toString('ascii', 12, 16);
  if (fourcc === 'VP8X') {
    const flags = buf.readUInt8(20);
    const width = 1 + (buf.readUIntLE(24, 3) & 0xffffff);
    const height = 1 + (buf.readUIntLE(27, 3) & 0xffffff);
    return { width, height, hasAlpha: (flags & 0x10) !== 0 };
  }
  if (fourcc === 'VP8 ') {
    const width = buf.readUInt16LE(26) & 0x3fff;
    const height = buf.readUInt16LE(28) & 0x3fff;
    return { width, height, hasAlpha: false };
  }
  if (fourcc === 'VP8L') {
    const b0 = buf.readUInt32LE(21);
    const width = (b0 & 0x3fff) + 1;
    const height = ((b0 >> 14) & 0x3fff) + 1;
    const hasAlpha = ((b0 >> 28) & 1) === 1;
    return { width, height, hasAlpha };
  }
  throw new Error(`${label}: unsupported WebP chunk "${fourcc}"`);
}

describe('Wave A-C2 · 13-Material Shared 1024x1024 Seamless Centennial PBR Library', () => {
  afterEach(() => {
    clearPbrTextureCache();
    vi.restoreAllMocks();
    if ('window' in globalThis) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
    }
  });

  it('locks SSOT PBR suite & WebP texture inventory (101 Flagship + 13 Centennial Shared = 114 suites / 453 WebPs)', () => {
    expect(MUSEUM_FLAGSHIP_PBR_SUITE_COUNT).toBe(101);
    expect(MUSEUM_CENTENNIAL_SHARED_PBR_SUITE_COUNT).toBe(13);
    expect(MUSEUM_PBR_SUITE_COUNT).toBe(114);
    expect(MUSEUM_FLAGSHIP_PBR_WEBP_COUNT).toBe(414);
    expect(MUSEUM_CENTENNIAL_SHARED_PBR_WEBP_COUNT).toBe(39);
    expect(MUSEUM_PBR_WEBP_COUNT).toBe(453);
    expect(fs.existsSync(GENERATOR_PATH)).toBe(true);
  });

  it('verifies all 39 centennial_mat_* WebPs exist at 1024x1024 RGB (hasAlpha=false), 0 PNGs, and combined size < 10 MB', () => {
    let totalBytes = 0;

    for (const matName of CENTENNIAL_SHARED_MATERIAL_NAMES) {
      for (const ch of CHANNELS) {
        const fileName = `${CENTENNIAL_SHARED_MATERIAL_PREFIX}${matName}_${ch}.webp`;
        expect(isCentennialSharedTextureFile(fileName)).toBe(true);
        const fullPath = path.join(TEXTURES_DIR, fileName);
        expect(fs.existsSync(fullPath), `${fileName} missing on disk`).toBe(
          true
        );

        const buf = fs.readFileSync(fullPath);
        totalBytes += buf.length;
        expect(buf.length, `${fileName} empty`).toBeGreaterThan(2048);

        const hdr = parseWebpHeader(buf, fileName);
        expect(hdr.width, `${fileName} width`).toBe(1024);
        expect(hdr.height, `${fileName} height`).toBe(1024);
        expect(
          hdr.hasAlpha,
          `${fileName} must be strictly 3-channel RGB without alpha`
        ).toBe(false);
      }
    }

    // Constitutional hard budget: combined size of all 39 WebPs strictly < 10 MB
    expect(totalBytes).toBeLessThan(10 * 1024 * 1024);
    // Guard against degenerate over-compressed blank tiles
    expect(totalBytes).toBeGreaterThan(1.5 * 1024 * 1024);
  });

  it('verifies multiplicative albedo calibration (mean 0.78-0.96), physical ORM ranges & seamless toroidal edge continuity', () => {
    const pyCheck = `
import json, pathlib
import numpy as np
from PIL import Image

tex_dir = pathlib.Path(${JSON.stringify(TEXTURES_DIR)})
names = ${JSON.stringify(CENTENNIAL_SHARED_MATERIAL_NAMES)}
out = {}
for name in names:
    alb = np.asarray(Image.open(tex_dir / f"centennial_mat_{name}_albedo.webp"), dtype=np.float32)
    nrm = np.asarray(Image.open(tex_dir / f"centennial_mat_{name}_normal.webp"), dtype=np.float32)
    orm = np.asarray(Image.open(tex_dir / f"centennial_mat_{name}_roughness.webp"), dtype=np.float32)
    assert alb.shape == (1024, 1024, 3), f"{name} alb shape {alb.shape}"
    assert nrm.shape == (1024, 1024, 3), f"{name} nrm shape {nrm.shape}"
    assert orm.shape == (1024, 1024, 3), f"{name} orm shape {orm.shape}"
    def wrap_mae(a):
        return max(float(np.mean(np.abs(a[:, 0] - a[:, -1]))), float(np.mean(np.abs(a[0, :] - a[-1, :]))))
    out[name] = {
        "albedoMean": float(np.mean(alb) / 255.0),
        "albedoStd": float(np.std(alb) / 255.0),
        "normalMeanB": float(np.mean(nrm[..., 2]) / 255.0),
        "aoMin": float(np.min(orm[..., 0]) / 255.0),
        "aoMean": float(np.mean(orm[..., 0]) / 255.0),
        "roughMean": float(np.mean(orm[..., 1]) / 255.0),
        "metalMean": float(np.mean(orm[..., 2]) / 255.0),
        "maxWrapMae": max(wrap_mae(alb), wrap_mae(nrm), wrap_mae(orm)),
    }
print(json.dumps(out))
`;

    const raw = execFileSync('python3', ['-c', pyCheck], {
      encoding: 'utf-8',
    });
    const metrics = JSON.parse(raw) as Record<
      string,
      {
        albedoMean: number;
        albedoStd: number;
        normalMeanB: number;
        aoMin: number;
        aoMean: number;
        roughMean: number;
        metalMean: number;
        maxWrapMae: number;
      }
    >;

    for (const matName of CENTENNIAL_SHARED_MATERIAL_NAMES) {
      const m = metrics[matName];
      const spec = EXPECTED_ORM_RANGES[matName];
      expect(m, `${matName} metrics missing`).toBeDefined();
      // Non-crushed multiplicative detail albedo band [0.78, 0.96] with visible texture variance
      expect(m.albedoMean, `${matName} albedoMean`).toBeGreaterThanOrEqual(0.78);
      expect(m.albedoMean, `${matName} albedoMean`).toBeLessThanOrEqual(0.96);
      expect(m.albedoStd, `${matName} albedoStd`).toBeGreaterThan(0.015);
      // OpenGL tangent-space normal (+Z dominant)
      expect(m.normalMeanB, `${matName} normalMeanB`).toBeGreaterThan(0.88);
      // Physical ORM R=AO, G=Roughness, B=Metalness
      expect(m.aoMean, `${matName} aoMean`).toBeGreaterThan(0.65);
      expect(m.roughMean, `${matName} roughMean`).toBeGreaterThanOrEqual(
        spec.roughMin
      );
      expect(m.roughMean, `${matName} roughMean`).toBeLessThanOrEqual(
        spec.roughMax
      );
      expect(
        Math.abs(m.metalMean - spec.metalTarget),
        `${matName} metalMean`
      ).toBeLessThan(0.04);
      // Seamless toroidal edge continuity (0-255 scale MAE well below seam threshold)
      expect(m.maxWrapMae, `${matName} maxWrapMae`).toBeLessThan(18);
    }
  });

  it('pools centennial_mat_* as ownerWeapon="shared" with RepeatWrapping and linear-locked normal/ORM in pbrManager', () => {
    // Provide minimal browser window stub and spy on TextureLoader.prototype.load
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(() => {
      return new THREE.Texture();
    });

    clearPbrTextureCache();

    const sharedBinding = {
      albedoFile: 'centennial_mat_oiled_walnut_albedo.webp',
      normalFile: 'centennial_mat_oiled_walnut_normal.webp',
      roughnessFile: 'centennial_mat_oiled_walnut_roughness.webp',
      normalScale: 0.65,
      repeat: 1,
    } as const;

    const bundleA = getPartPbrBundle('ak47', 'polymer_frame', sharedBinding);
    const bundleB = getPartPbrBundle('ppsh41', 'polymer_frame', sharedBinding);

    // Pooled identically across different Centennial exhibits with ZERO per-weapon LRU entries
    expect(bundleA.hasCustomAtlas).toBe(true);
    expect(bundleA.map).toBe(bundleB.map);
    expect(bundleA.normalMap).toBe(bundleB.normalMap);
    expect(bundleA.roughnessMap).toBe(bundleB.roughnessMap);

    const stats = getPbrCacheStats();
    expect(stats.cachedTextureCount).toBe(3);
    expect(stats.cachedWeaponsLru).toHaveLength(0);

    // Seamless metric Box-UV tiling at repeat: 1 requires RepeatWrapping (never ClampToEdge)
    expect(bundleA.map?.wrapS).toBe(THREE.RepeatWrapping);
    expect(bundleA.map?.wrapT).toBe(THREE.RepeatWrapping);
    expect(bundleA.normalMap?.wrapS).toBe(THREE.RepeatWrapping);
    expect(bundleA.roughnessMap?.wrapS).toBe(THREE.RepeatWrapping);

    // Color spaces strictly locked: sRGB albedo, NoColorSpace normal & ORM
    expect(bundleA.map?.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(bundleA.normalMap?.colorSpace).toBe(THREE.NoColorSpace);
    expect(bundleA.roughnessMap?.colorSpace).toBe(THREE.NoColorSpace);
  });
});

import fs from 'node:fs';
import path from 'node:path';
import * as THREE from 'three';
import { afterEach, beforeAll, describe, expect, it, vi } from 'vitest';

const picatinnyRuntimeCalls: Array<{ weaponId: string; slot: string }> = [];
let activeBuildWeaponId = '';
let activeBuildSlot = '';

vi.mock('../src/engine/geometry/csgBuilder', async (importOriginal) => {
  const actual = await importOriginal<
    typeof import('../src/engine/geometry/csgBuilder')
  >();
  return {
    ...actual,
    createMilStdPicatinnyRail: vi.fn(
      (
        ...args: Parameters<typeof actual.createMilStdPicatinnyRail>
      ): ReturnType<typeof actual.createMilStdPicatinnyRail> => {
        if (activeBuildWeaponId) {
          picatinnyRuntimeCalls.push({
            weaponId: activeBuildWeaponId,
            slot: activeBuildSlot,
          });
        }
        return actual.createMilStdPicatinnyRail(...args);
      }
    ),
  };
});

import {
  CENTENNIAL_SHARED_MATERIAL_PREFIX,
  clearPbrTextureCache,
  getPartPbrBundle,
  getPbrCacheStats,
  isCentennialSharedTextureFile,
} from '../src/engine/materials/pbrManager';
import {
  CENTENNIAL_BLUEPRINT_MAP,
  CENTENNIAL_BLUEPRINTS,
} from '../src/weapons/expansion/centennialCatalog';
import {
  buildCentennialGeometryBuilders,
  CENTENNIAL_PART_SLOTS,
  centennialPartId,
  computeCentennialPartLayout,
  resolveMetricUvTileCm,
} from '../src/weapons/expansion/centennialGeometryFactory';
import {
  isCentennialShellSlot,
  resolveCentennialGroupMetas,
  resolveCentennialPartMeta,
} from '../src/weapons/expansion/centennialPartNomenclature';
import {
  buildCentennialPlugin,
  CENTENNIAL_SHARED_MATERIAL_SUITES,
  resolveCentennialPartMaterialSuite,
} from '../src/weapons/expansion/centennialPluginFactory';
import type {
  CentennialWeaponBlueprint,
  CentennialWeaponId,
} from '../src/weapons/expansion/centennialTypes';
import {
  MUSEUM_CENTENNIAL_SHARED_PBR_SUITE_COUNT,
  MUSEUM_CENTENNIAL_SHARED_PBR_WEBP_COUNT,
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_PBR_SUITE_COUNT,
  MUSEUM_PBR_WEBP_COUNT,
  MUSEUM_TOTAL_PARTS,
} from '../src/weapons/museumMetrics';

const REPO_ROOT = path.resolve(__dirname, '..');
const TEXTURES_DIR = path.join(REPO_ROOT, 'public', 'textures');
const AGENTS_MD_PATH = path.join(REPO_ROOT, 'AGENTS.md');
const GEOMETRY_FACTORY_PATH = path.join(
  REPO_ROOT,
  'src',
  'weapons',
  'expansion',
  'centennialGeometryFactory.ts'
);
const CAD_PRIMITIVES_PATH = path.join(
  REPO_ROOT,
  'src',
  'weapons',
  'expansion',
  'centennialCadPrimitives.ts'
);

const EXPECTED_13_SHARED_SUITES = [
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

const CENTENNIAL_MBT_IDS = [
  't90m',
  'challenger2',
  'merkava4',
  't34_85',
] as const satisfies readonly CentennialWeaponId[];

const PRE_1990_PICATINNY_RE =
  /picatinny|皮卡汀尼|mil-std-1913|\b1913\b|tactical rail|战术导轨|accessory rail|战术槽/i;

interface PartMeshAuditSummary {
  vertexCount: number;
  uvCountMatchesPos: boolean;
  nonFiniteUvCount: number;
  uSpan: number;
  vSpan: number;
  dx: number;
  dy: number;
  dz: number;
  brassVertexCount: number;
  centerTopBlockers: number;
}

function parseWebpHeader(
  buf: Buffer,
  label: string
): { width: number; height: number; hasAlpha: boolean } {
  if (
    buf.length < 30 ||
    buf.toString('ascii', 0, 4) !== 'RIFF' ||
    buf.toString('ascii', 8, 12) !== 'WEBP'
  ) {
    throw new Error(`${label}: not a valid RIFF/WEBP container`);
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

function expectsRemovableSmallArmMagShell(bp: CentennialWeaponBlueprint): boolean {
  if (
    bp.category === 'archery' ||
    bp.category === 'armor' ||
    bp.category === 'ordnance' ||
    bp.archetype === 'revolver_sa' ||
    bp.archetype === 'revolver_da'
  ) {
    return false;
  }
  return bp.cad.magStyle !== 'tube' && bp.cad.magStyle !== 'belt';
}

function expectsCutawayBrassCartridgeStack(bp: CentennialWeaponBlueprint): boolean {
  if (
    bp.category === 'archery' ||
    bp.category === 'armor' ||
    bp.category === 'ordnance' ||
    bp.archetype === 'revolver_sa' ||
    bp.archetype === 'revolver_da' ||
    bp.archetype === 'pistol_broomhandle'
  ) {
    return false;
  }
  const layout = computeCentennialPartLayout(bp);
  if (layout.dims.magH < 6.0) return false;
  if (bp.archetype === 'pistol_slide') return true;
  return (
    bp.cad.magStyle === 'curved' ||
    bp.cad.magStyle === 'straight' ||
    bp.cad.magStyle === 'pistol_grip' ||
    bp.cad.magStyle === 'box_internal'
  );
}

describe('AGENTS.md Rule 4.10 · Unified 100-Exhibit Centennial Visual & Mechanical Constitution', () => {
  const meshAudit = new Map<string, PartMeshAuditSummary>();

  beforeAll(() => {
    picatinnyRuntimeCalls.length = 0;
    meshAudit.clear();

    // Single full-fleet build across all 66 × 20 = 1,320 Centennial CAD meshes
    for (const bp of CENTENNIAL_BLUEPRINTS) {
      const builders = buildCentennialGeometryBuilders(bp.id);
      for (const slot of CENTENNIAL_PART_SLOTS) {
        const partId = centennialPartId(bp.id, slot);
        activeBuildWeaponId = bp.id;
        activeBuildSlot = slot;
        const geo = builders[partId]();
        activeBuildWeaponId = '';
        activeBuildSlot = '';

        const pos = geo.getAttribute('position');
        const uv = geo.getAttribute('uv');
        const col = geo.getAttribute('color');

        let nonFiniteUvCount = 0;
        let uMin = Infinity;
        let uMax = -Infinity;
        let vMin = Infinity;
        let vMax = -Infinity;

        if (uv) {
          for (let i = 0; i < uv.count; i++) {
            const u = uv.getX(i);
            const v = uv.getY(i);
            if (!Number.isFinite(u) || !Number.isFinite(v)) {
              nonFiniteUvCount++;
            } else {
              if (u < uMin) uMin = u;
              if (u > uMax) uMax = u;
              if (v < vMin) vMin = v;
              if (v > vMax) vMax = v;
            }
          }
        }

        let brassVertexCount = 0;
        if (col && slot === 'follower') {
          for (let i = 0; i < col.count; i++) {
            if (col.getX(i) > 0.5 && col.getY(i) > 0.3 && col.getZ(i) < 0.25) {
              brassVertexCount++;
            }
          }
        }

        let centerTopBlockers = 0;
        if (bp.id === 'beretta92' && slot === 'bolt_carrier') {
          for (let i = 0; i < pos.count; i++) {
            if (
              Math.abs(pos.getX(i)) < 2.0 &&
              Math.abs(pos.getZ(i)) < 0.3 &&
              pos.getY(i) > 0.75
            ) {
              centerTopBlockers++;
            }
          }
        }

        geo.computeBoundingBox();
        const bb = geo.boundingBox!;
        meshAudit.set(partId, {
          vertexCount: pos.count,
          uvCountMatchesPos: Boolean(uv && uv.count === pos.count),
          nonFiniteUvCount,
          uSpan: Number.isFinite(uMax - uMin) ? uMax - uMin : 0,
          vSpan: Number.isFinite(vMax - vMin) ? vMax - vMin : 0,
          dx: bb.max.x - bb.min.x,
          dy: bb.max.y - bb.min.y,
          dz: bb.max.z - bb.min.z,
          brassVertexCount,
          centerTopBlockers,
        });

        geo.dispose();
      }
    }
  });

  afterEach(() => {
    clearPbrTextureCache();
    vi.restoreAllMocks();
    if ('window' in globalThis) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      delete (globalThis as any).window;
    }
  });

  it('Rule 10.1: enforces 1,320/1,320 shared 13-suite PBR bindings, 39 RGB WebPs (< 10 MB, 0 PNGs), shared RepeatWrapping pool & finite non-degenerate UVs', () => {
    expect(MUSEUM_EXHIBIT_COUNT).toBe(100);
    expect(MUSEUM_TOTAL_PARTS).toBe(2174);
    expect(MUSEUM_PBR_SUITE_COUNT).toBe(114);
    expect(MUSEUM_PBR_WEBP_COUNT).toBe(453);
    expect(CENTENNIAL_BLUEPRINTS).toHaveLength(66);
    expect(CENTENNIAL_PART_SLOTS).toHaveLength(20);
    expect(meshAudit.size).toBe(1320);

    // 1. Canonical 13 shared museum suites & 39 strictly 3-channel RGB 1024x1024 WebPs < 10 MB, 0 PNGs
    expect(MUSEUM_CENTENNIAL_SHARED_PBR_SUITE_COUNT).toBe(13);
    expect(MUSEUM_CENTENNIAL_SHARED_PBR_WEBP_COUNT).toBe(39);
    expect([...CENTENNIAL_SHARED_MATERIAL_SUITES].sort()).toEqual(
      [...EXPECTED_13_SHARED_SUITES].sort()
    );

    const textureDirFiles = fs.readdirSync(TEXTURES_DIR);
    const pngFiles = textureDirFiles.filter((f) =>
      f.toLowerCase().endsWith('.png')
    );
    expect(pngFiles, 'Rule 10.1 forbids PNG textures in public/textures/').toEqual(
      []
    );

    const centennialWebpsOnDisk = textureDirFiles.filter(
      (f) =>
        f.startsWith(CENTENNIAL_SHARED_MATERIAL_PREFIX) && f.endsWith('.webp')
    );
    expect(centennialWebpsOnDisk).toHaveLength(39);

    const validDiskSet = new Set<string>();
    let combinedBytes = 0;
    for (const suite of EXPECTED_13_SHARED_SUITES) {
      for (const channel of CHANNELS) {
        const fileName = `${CENTENNIAL_SHARED_MATERIAL_PREFIX}${suite}_${channel}.webp`;
        expect(isCentennialSharedTextureFile(fileName)).toBe(true);
        const fullPath = path.join(TEXTURES_DIR, fileName);
        expect(fs.existsSync(fullPath), `Missing ${fileName}`).toBe(true);

        const buf = fs.readFileSync(fullPath);
        combinedBytes += buf.length;
        const hdr = parseWebpHeader(buf, fileName);
        expect(hdr.width, `${fileName} width`).toBe(1024);
        expect(hdr.height, `${fileName} height`).toBe(1024);
        expect(hdr.hasAlpha, `${fileName} must be RGB without alpha`).toBe(
          false
        );
        validDiskSet.add(fileName);
      }
    }
    expect(combinedBytes).toBeLessThan(10 * 1024 * 1024);
    expect(combinedBytes).toBeGreaterThan(1024 * 1024);

    // 2. Every single one of the 1,320 Centennial parts binds a valid on-disk centennial_mat_* suite
    //    AND carries finite, non-degenerate UVs on its real 3D geometry
    const suitesUsed = new Set<string>();
    let totalBoundParts = 0;

    for (const bp of CENTENNIAL_BLUEPRINTS) {
      const plugin = buildCentennialPlugin(bp.id);
      expect(plugin.parts).toHaveLength(20);
      expect(Object.keys(plugin.pbrBindings)).toHaveLength(20);

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const partId = centennialPartId(bp.id, slot);
        const binding = plugin.pbrBindings[partId];
        expect(binding, `Missing PBR binding for ${partId}`).toBeDefined();

        const suite = resolveCentennialPartMaterialSuite(bp, slot);
        suitesUsed.add(suite);

        expect(binding.albedoFile).toBe(
          `${CENTENNIAL_SHARED_MATERIAL_PREFIX}${suite}_albedo.webp`
        );
        expect(binding.normalFile).toBe(
          `${CENTENNIAL_SHARED_MATERIAL_PREFIX}${suite}_normal.webp`
        );
        expect(binding.roughnessFile).toBe(
          `${CENTENNIAL_SHARED_MATERIAL_PREFIX}${suite}_roughness.webp`
        );
        expect(validDiskSet.has(binding.albedoFile)).toBe(true);
        expect(validDiskSet.has(binding.normalFile)).toBe(true);
        expect(validDiskSet.has(binding.roughnessFile)).toBe(true);
        expect(binding.repeat).toBe(1);
        expect(binding.normalScale).toBeGreaterThanOrEqual(0.4);
        expect(binding.normalScale).toBeLessThanOrEqual(0.8);

        const mesh = meshAudit.get(partId);
        expect(mesh, `Missing geometry audit for ${partId}`).toBeDefined();
        expect(mesh!.vertexCount, `${partId} non-empty mesh`).toBeGreaterThan(
          12
        );
        expect(mesh!.uvCountMatchesPos, `${partId} UV count`).toBe(true);
        expect(mesh!.nonFiniteUvCount, `${partId} finite UVs`).toBe(0);
        expect(mesh!.uSpan, `${partId} non-degenerate U span`).toBeGreaterThan(
          1e-4
        );
        expect(mesh!.vSpan, `${partId} non-degenerate V span`).toBeGreaterThan(
          1e-4
        );

        totalBoundParts++;
      }
    }

    expect(totalBoundParts).toBe(1320);
    expect(suitesUsed.size).toBe(13);

    // 3. pbrManager forces ownerWeapon: 'shared' + wrapRepeat: true + linear-locked normal/ORM
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (globalThis as any).window = {};
    vi.spyOn(THREE.TextureLoader.prototype, 'load').mockImplementation(
      () => new THREE.Texture()
    );
    clearPbrTextureCache();

    const akStockBinding =
      buildCentennialPlugin('ak47').pbrBindings['ak47_stock'];
    const ppshStockBinding =
      buildCentennialPlugin('ppsh41').pbrBindings['ppsh41_stock'];
    expect(akStockBinding.albedoFile).toBe(ppshStockBinding.albedoFile);

    const bundleAk = getPartPbrBundle('ak47', 'polymer_frame', akStockBinding);
    const bundlePpsh = getPartPbrBundle(
      'ppsh41',
      'polymer_frame',
      ppshStockBinding
    );

    expect(bundleAk.hasCustomAtlas).toBe(true);
    expect(bundleAk.map).toBe(bundlePpsh.map);
    expect(bundleAk.normalMap).toBe(bundlePpsh.normalMap);
    expect(bundleAk.roughnessMap).toBe(bundlePpsh.roughnessMap);

    const stats = getPbrCacheStats();
    expect(stats.cachedTextureCount).toBe(3);
    expect(stats.cachedWeaponsLru).toEqual([]);

    for (const tex of [
      bundleAk.map!,
      bundleAk.normalMap!,
      bundleAk.roughnessMap!,
    ]) {
      expect(tex.wrapS).toBe(THREE.RepeatWrapping);
      expect(tex.wrapT).toBe(THREE.RepeatWrapping);
      expect(tex.repeat.x).toBe(1);
      expect(tex.repeat.y).toBe(1);
    }

    expect(bundleAk.map!.colorSpace).toBe(THREE.SRGBColorSpace);
    expect(bundleAk.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(bundleAk.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);

    // Verify lockLinearTextureColorSpace blocks accidental R3F SRGBColorSpace overwrites
    bundleAk.normalMap!.colorSpace = THREE.SRGBColorSpace;
    bundleAk.roughnessMap!.colorSpace = THREE.SRGBColorSpace;
    expect(bundleAk.normalMap!.colorSpace).toBe(THREE.NoColorSpace);
    expect(bundleAk.roughnessMap!.colorSpace).toBe(THREE.NoColorSpace);
  });

  it('Rule 10.2: enforces zero pre-1990 Picatinny 1913 rails in bilingual copy, static CAD gating & live 1,320-mesh runtime spy', () => {
    const pre1990Blueprints = CENTENNIAL_BLUEPRINTS.filter(
      (bp) => bp.year < 1990
    );
    const post1990Blueprints = CENTENNIAL_BLUEPRINTS.filter(
      (bp) => bp.year >= 1990
    );
    expect(pre1990Blueprints.length).toBeGreaterThanOrEqual(40);
    expect(post1990Blueprints.length).toBeGreaterThanOrEqual(15);

    // 1. Bilingual part & group nomenclature audit across ALL year < 1990 Centennial exhibits
    for (const bp of pre1990Blueprints) {
      const plugin = buildCentennialPlugin(bp.id);

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const meta = resolveCentennialPartMeta(bp, slot);
        const fields = [
          meta.nameZh,
          meta.nameEn,
          meta.calloutLabelZh,
          meta.calloutLabelEn,
          meta.roleTagZh,
          meta.roleTagEn,
          meta.descZh,
          meta.descEn,
        ];
        for (const text of fields) {
          expect(
            PRE_1990_PICATINNY_RE.test(text),
            `Rule 10.2 pre-1990 Picatinny leak in ${bp.id} (${bp.year}).${slot}: "${text}"`
          ).toBe(false);
        }
      }

      for (const part of plugin.parts) {
        for (const text of [
          part.nameZh,
          part.nameEn,
          part.calloutLabel,
          part.roleTag,
          part.description,
        ]) {
          expect(
            PRE_1990_PICATINNY_RE.test(text),
            `Rule 10.2 pre-1990 Picatinny leak in plugin ${part.id} (${bp.year}): "${text}"`
          ).toBe(false);
        }
      }

      for (const group of resolveCentennialGroupMetas(bp)) {
        expect(
          PRE_1990_PICATINNY_RE.test(group.nameZh),
          `Rule 10.2 pre-1990 group ZH leak in ${bp.id}.${group.key}: "${group.nameZh}"`
        ).toBe(false);
        expect(
          PRE_1990_PICATINNY_RE.test(group.nameEn),
          `Rule 10.2 pre-1990 group EN leak in ${bp.id}.${group.key}: "${group.nameEn}"`
        ).toBe(false);
      }
    }

    // 2. Runtime spy proof across ALL 66 exhibits: ZERO createMilStdPicatinnyRail calls for year < 1990
    const pre1990RailCalls = picatinnyRuntimeCalls.filter(
      (call) =>
        CENTENNIAL_BLUEPRINT_MAP[call.weaponId as CentennialWeaponId].year < 1990
    );
    expect(
      pre1990RailCalls,
      `createMilStdPicatinnyRail invoked on pre-1990 exhibits: ${JSON.stringify(pre1990RailCalls)}`
    ).toEqual([]);

    // Non-vacuous proof: modern (>= 1990) exhibits genuinely invoke createMilStdPicatinnyRail
    const modernRailCalls = picatinnyRuntimeCalls.filter(
      (call) =>
        CENTENNIAL_BLUEPRINT_MAP[call.weaponId as CentennialWeaponId].year >=
        1990
    );
    expect(modernRailCalls.length).toBeGreaterThan(0);

    // 3. Static source guard verifying chamfered/beveled extrusions & year >= 1990 gating
    const factorySrc = fs.readFileSync(GEOMETRY_FACTORY_PATH, 'utf-8');
    const primitivesSrc = fs.readFileSync(CAD_PRIMITIVES_PATH, 'utf-8');

    expect(primitivesSrc).toMatch(/bevelEnabled:\s*(?:true|b\s*>\s*1e-4)/);
    expect(primitivesSrc).toContain('export function buildChamferedSlab');
    expect(primitivesSrc).toContain('export function buildBeveledProfile');
    expect(factorySrc).toContain('buildChamferedSlab');

    // Every createMilStdPicatinnyRail call site in centennialGeometryFactory.ts must sit after a year < 1990 guard
    const factoryLines = factorySrc.split('\n');
    const factoryCallLineIndices = factoryLines
      .map((line, idx) => ({ line, idx }))
      .filter(
        ({ line }) =>
          line.includes('createMilStdPicatinnyRail(') &&
          !line.trim().startsWith('//')
      )
      .map(({ idx }) => idx);
    expect(factoryCallLineIndices.length).toBeGreaterThanOrEqual(2);

    for (const lineIdx of factoryCallLineIndices) {
      const guardWindow = factoryLines
        .slice(Math.max(0, lineIdx - 45), lineIdx)
        .join('\n');
      expect(
        /bp\.year\s*<\s*1990|bp\.year\s*>=\s*1990/.test(guardWindow),
        `createMilStdPicatinnyRail at centennialGeometryFactory.ts:${lineIdx + 1} missing year < 1990 / >= 1990 guard`
      ).toBe(true);
    }

    // topRail and quad_rail dispatch in centennialGeometryFactory.ts must also be year >= 1990 gated
    expect(factorySrc).toMatch(/topRail:\s*bp\.year\s*>=\s*1990/);
    expect(factorySrc).toMatch(
      /if\s*\(bp\.year\s*<\s*1990\)[\s\S]{0,160}return\s+'quad_rail'/
    );

    // Inside centennialCadPrimitives.ts, createMilStdPicatinnyRail is strictly conditional (never unconditional)
    const primLines = primitivesSrc.split('\n');
    const primCallLineIndices = primLines
      .map((line, idx) => ({ line, idx }))
      .filter(
        ({ line }) =>
          line.includes('createMilStdPicatinnyRail(') &&
          !line.trim().startsWith('//')
      )
      .map(({ idx }) => idx);
    expect(primCallLineIndices.length).toBeGreaterThanOrEqual(2);
    for (const lineIdx of primCallLineIndices) {
      const condWindow = primLines
        .slice(Math.max(0, lineIdx - 20), lineIdx)
        .join('\n');
      expect(
        /if\s*\(\s*opts\.topRail\s*\)|if\s*\(\s*style\s*===\s*'quad_rail'\s*\)/.test(
          condWindow
        ),
        `createMilStdPicatinnyRail at centennialCadPrimitives.ts:${lineIdx + 1} must stay gated behind opts.topRail or style === 'quad_rail'`
      ).toBe(true);
    }
  });

  it('Rule 10.3: locks 1-second iconic silhouettes (ppsh41, beretta92, winchester1887, englishlongbow) & articulated 1:1 MBT tracks + matte CARC/RHA armor', () => {
    const factorySrc = fs.readFileSync(GEOMETRY_FACTORY_PATH, 'utf-8');

    // 1. PPSh-41: blued-steel perforated cooling shroud + one-piece Russian birch stock + compact wrist tang (no vertical AK grip)
    const ppshBp = CENTENNIAL_BLUEPRINT_MAP.ppsh41;
    const ppshPlugin = buildCentennialPlugin('ppsh41');
    expect(resolveCentennialPartMaterialSuite(ppshBp, 'handguard')).toBe(
      'blued_steel'
    );
    expect(
      ppshPlugin.parts.find((p) => p.id === 'ppsh41_handguard')
    ).toMatchObject({
      material: 'nitride_steel',
      nameEn: 'Perforated Steel Barrel Cooling Shroud',
    });
    expect(resolveCentennialPartMaterialSuite(ppshBp, 'stock')).toBe(
      'russian_laminate'
    );
    expect(resolveCentennialPartMaterialSuite(ppshBp, 'grip')).toBe(
      'russian_laminate'
    );
    expect(factorySrc).toContain("if (bp.id === 'ppsh41') return 'ppsh_one_piece'");
    const ppshGripMesh = meshAudit.get('ppsh41_grip')!;
    expect(
      ppshGripMesh.dy,
      'ppsh41 wrist tang must NOT be a tall vertical pistol grip'
    ).toBeLessThan(3.4);

    // 2. Beretta 92FS: open-top slide cutout exposing barrel + 20-LPI checkered grip + anodized alloy frame
    const b92Bp = CENTENNIAL_BLUEPRINT_MAP.beretta92;
    expect(factorySrc).toContain("'slide_open_top'");
    const b92SlideMesh = meshAudit.get('beretta92_bolt_carrier')!;
    expect(
      b92SlideMesh.centerTopBlockers,
      'beretta92 slide must expose cylindrical barrel through open-top cutout'
    ).toBe(0);
    expect(resolveCentennialPartMaterialSuite(b92Bp, 'grip')).toBe(
      'checkered_grip'
    );
    expect(resolveMetricUvTileCm(b92Bp, 'grip')).toBe(4.5);
    expect(resolveCentennialPartMaterialSuite(b92Bp, 'receiver')).toBe(
      'anodized_alloy'
    );
    expect(resolveCentennialPartMaterialSuite(b92Bp, 'bolt_carrier')).toBe(
      'blued_steel'
    );

    // 3. Winchester 1887: blued-steel curved finger-loop lever (NOT walnut wood!)
    const w1887Bp = CENTENNIAL_BLUEPRINT_MAP.winchester1887;
    const w1887Plugin = buildCentennialPlugin('winchester1887');
    expect(resolveCentennialPartMaterialSuite(w1887Bp, 'grip')).toBe(
      'blued_steel'
    );
    expect(
      w1887Plugin.parts.find((p) => p.id === 'winchester1887_grip')?.material
    ).toBe('nitride_steel');
    const w1887GripMesh = meshAudit.get('winchester1887_grip')!;
    expect(w1887GripMesh.dx).toBeGreaterThan(w1887GripMesh.dy * 1.2);

    // 4. 1415 English Longbow: matte non-metallic carved cow-horn nocks + yew stave (ZERO brass/copper!)
    const bowBp = CENTENNIAL_BLUEPRINT_MAP.englishlongbow;
    const bowPlugin = buildCentennialPlugin('englishlongbow');
    for (const hornSlot of ['muzzle', 'selector'] as const) {
      expect(resolveCentennialPartMaterialSuite(bowBp, hornSlot)).toBe(
        'beech_yew'
      );
      expect(
        bowPlugin.parts.find((p) => p.id === `englishlongbow_${hornSlot}`)
          ?.material
      ).toBe('polymer_frame');
    }
    expect(resolveCentennialPartMaterialSuite(bowBp, 'barrel')).toBe(
      'beech_yew'
    );

    // 5. All 4 Centennial 1:1 MBTs: high-detail articulated individual track link belts + matte CARC/RHA armor
    const expectedMbtArmorSuite: Record<
      (typeof CENTENNIAL_MBT_IDS)[number],
      'carc_olive' | 'carc_desert' | 'cast_rha_armor'
    > = {
      t90m: 'carc_olive',
      challenger2: 'carc_olive',
      merkava4: 'carc_desert',
      t34_85: 'cast_rha_armor',
    };

    for (const mbtId of CENTENNIAL_MBT_IDS) {
      const mbtBp = CENTENNIAL_BLUEPRINT_MAP[mbtId];
      expect(mbtBp.category).toBe('armor');

      // Articulated individual track link belts (`gas_system` = suspension_tracks) must be high-detail (> 6,000 verts)
      const trackMesh = meshAudit.get(`${mbtId}_gas_system`)!;
      expect(
        trackMesh.vertexCount,
        `${mbtId} articulated individual track link belts + bolted roadwheels`
      ).toBeGreaterThan(6000);

      // Rear hull deck (`stock`) carries non-trivial geometry (incl. twin fuel drums on non-Merkava MBTs)
      const stockMesh = meshAudit.get(`${mbtId}_stock`)!;
      expect(stockMesh.vertexCount).toBeGreaterThan(
        mbtId === 'merkava4' ? 30 : 300
      );

      // Matte CARC / cast RHA armor suites on primary armor shells & tracks (ZERO shiny blued steel armor!)
      const armorSuite = expectedMbtArmorSuite[mbtId];
      for (const armorSlot of [
        'receiver',
        'bolt_carrier',
        'handguard',
        'stock',
        'mount_rail',
      ] as const) {
        expect(
          resolveCentennialPartMaterialSuite(mbtBp, armorSlot),
          `${mbtId}.${armorSlot} armor material`
        ).toBe(armorSuite);
      }
      expect(resolveCentennialPartMaterialSuite(mbtBp, 'gas_system')).toBe(
        'cast_rha_armor'
      );
    }
  });

  it('Rule 10.4: enforces CT cutaway isShell matrix (4 MBT turrets, 7 pistol slides, removable mags, pistol grips) & multi-vertex brass cartridge stack on follower', () => {
    // 1. All 4 Centennial 1:1 MBT turrets (`bolt_carrier`) & hulls (`receiver`) slice cleanly under ?cut=1
    for (const mbtId of CENTENNIAL_MBT_IDS) {
      const bp = CENTENNIAL_BLUEPRINT_MAP[mbtId];
      const plugin = buildCentennialPlugin(mbtId);
      expect(isCentennialShellSlot(bp, 'receiver')).toBe(true);
      expect(isCentennialShellSlot(bp, 'bolt_carrier')).toBe(true);
      expect(
        plugin.parts.find((p) => p.id === `${mbtId}_receiver`)?.isShell
      ).toBe(true);
      expect(
        plugin.parts.find((p) => p.id === `${mbtId}_bolt_carrier`)?.isShell
      ).toBe(true);
    }

    // 2. All 7 semi-auto pistol_slide exhibits slice receiver, outer slide, mag_body & grip
    const pistolSlideBlueprints = CENTENNIAL_BLUEPRINTS.filter(
      (bp) => bp.archetype === 'pistol_slide'
    );
    expect(pistolSlideBlueprints).toHaveLength(7);
    for (const bp of pistolSlideBlueprints) {
      const plugin = buildCentennialPlugin(bp.id);
      for (const shellSlot of [
        'receiver',
        'bolt_carrier',
        'mag_body',
        'grip',
      ] as const) {
        expect(
          isCentennialShellSlot(bp, shellSlot),
          `${bp.id}.${shellSlot} must be cutaway shell`
        ).toBe(true);
        expect(
          plugin.parts.find((p) => p.id === `${bp.id}_${shellSlot}`)?.isShell,
          `plugin ${bp.id}_${shellSlot}.isShell`
        ).toBe(true);
      }
    }

    // 3. All removable/box/drum/pan small-arms mag_body & all pistol_grip grips declare isShell === true
    let removableMagShellCount = 0;
    let pistolGripShellCount = 0;
    let cutawayBrassFollowerCount = 0;

    for (const bp of CENTENNIAL_BLUEPRINTS) {
      const plugin = buildCentennialPlugin(bp.id);
      const magPart = plugin.parts.find((p) => p.id === `${bp.id}_mag_body`);
      const gripPart = plugin.parts.find((p) => p.id === `${bp.id}_grip`);

      const expectMagShell = expectsRemovableSmallArmMagShell(bp);
      expect(
        Boolean(magPart?.isShell),
        `${bp.id}_mag_body isShell expectation`
      ).toBe(expectMagShell);
      if (expectMagShell) removableMagShellCount++;

      const expectGripShell = bp.cad.magStyle === 'pistol_grip';
      expect(
        Boolean(gripPart?.isShell),
        `${bp.id}_grip isShell expectation`
      ).toBe(expectGripShell);
      if (expectGripShell) pistolGripShellCount++;

      // 4. Multi-vertex gleaming brass cutaway cartridge stack on removable-mag follower
      if (expectsCutawayBrassCartridgeStack(bp)) {
        const followerMesh = meshAudit.get(`${bp.id}_follower`)!;
        expect(
          followerMesh.vertexCount,
          `${bp.id}_follower must carry multi-vertex cutaway brass cartridge stack`
        ).toBeGreaterThan(1200);
        expect(
          followerMesh.brassVertexCount,
          `${bp.id}_follower must render gleaming metallic brass cartridges`
        ).toBeGreaterThan(100);
        expect(
          resolveCentennialPartMaterialSuite(bp, 'follower'),
          `${bp.id}_follower must bind cartridge_brass PBR suite`
        ).toBe('cartridge_brass');
        cutawayBrassFollowerCount++;
      }
    }

    expect(removableMagShellCount).toBeGreaterThanOrEqual(40);
    expect(pistolGripShellCount).toBeGreaterThanOrEqual(8);
    expect(cutawayBrassFollowerCount).toBeGreaterThanOrEqual(30);
  });

  it('Rules 10.5 & 10.6: verifies AGENTS.md codifies Rule 10 (10.1–10.6), 9.9/9.7 visual floors, Wave 11+ charter & Section 5 CI gate', () => {
    const agentsMd = fs.readFileSync(AGENTS_MD_PATH, 'utf-8');

    // Preserve Rules 1–9 and codify Rule 10 with all 6 sub-clauses (10.1–10.6)
    const section4Match = agentsMd.match(
      /## 4\.[\s\S]*?(?=\n## 5\.)/
    );
    expect(section4Match, 'Section 4 missing in AGENTS.md').not.toBeNull();
    const section4 = section4Match![0];

    for (let ruleNum = 1; ruleNum <= 10; ruleNum++) {
      expect(
        new RegExp(`^${ruleNum}\\.\\s+\\*\\*`, 'm').test(section4),
        `AGENTS.md Section 4 missing Rule ${ruleNum}`
      ).toBe(true);
    }
    for (const subClause of ['10.1', '10.2', '10.3', '10.4', '10.5', '10.6']) {
      expect(
        section4,
        `AGENTS.md Rule 10 missing sub-clause ${subClause}`
      ).toContain(`**${subClause} `);
    }

    // Key constitutional thresholds locked in Rule 10
    expect(section4).toContain('`39`');
    expect(section4).toContain('< 10 MB');
    expect(section4).toContain("ownerWeapon: 'shared'");
    expect(section4).toContain('wrapRepeat: true');
    expect(section4).toContain('bevelEnabled: true');
    expect(section4).toContain('year < 1990');
    expect(section4).toContain('isShell: true');
    expect(section4).toContain('>= 9.9 / 10.0');
    expect(section4).toContain('>= 9.7 / 10.0');
    expect(section4).toContain('Wave 11+');
    expect(section4).toContain('dist/ <= 800 MB');
    expect(section4).toContain('VITE_CDN_ASSET_BASE_URL');

    // Section 5 CI quality gates must reference centennialConstitution.test.ts, < 10 MB budget, and 9.9 / 9.7 floors
    const section5Match = agentsMd.match(/## 5\.[\s\S]*$/);
    expect(section5Match, 'Section 5 missing in AGENTS.md').not.toBeNull();
    const section5 = section5Match![0];

    expect(section5).toContain('centennialConstitution.test.ts');
    expect(section5).toContain('< 10 MB');
    expect(section5).toContain('>= 9.9 / 10.0');
    expect(section5).toContain('>= 9.7 / 10.0');
  });
});

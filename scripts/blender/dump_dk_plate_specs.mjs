#!/usr/bin/env node
/**
 * Digital Armory 3D — DK Master-Plate Specification & Dynamic CSG Mesh Exporter
 * =============================================================================
 * Bundles TypeScript weapon manifests, plugins, GLB PBR overrides, and dynamic
 * spring/limb/bowstring CSG builders via `esbuild` so `scripts/blender/render_dk_plates.py`
 * can deterministically render Cycles 2880x1800 RGBA studio master plates for all
 * 27 museum exhibits with zero duplicated geometry or keyframe tables in Python.
 *
 * Usage:
 *   node scripts/blender/dump_dk_plate_specs.mjs \
 *     --weapons all \
 *     --out-json /tmp/dk_specs.json \
 *     --mesh-dir /tmp/dk_meshes
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '../..');

function parseArgs(argv) {
  let weapons = 'all';
  let outJson = null;
  let meshDir = null;

  for (let i = 0; i < argv.length; i += 1) {
    const tok = argv[i];
    if (tok === '--weapons' && i + 1 < argv.length) {
      weapons = argv[++i];
    } else if (tok.startsWith('--weapons=')) {
      weapons = tok.slice('--weapons='.length);
    } else if (tok === '--out-json' && i + 1 < argv.length) {
      outJson = argv[++i];
    } else if (tok.startsWith('--out-json=')) {
      outJson = tok.slice('--out-json='.length);
    } else if (tok === '--mesh-dir' && i + 1 < argv.length) {
      meshDir = argv[++i];
    } else if (tok.startsWith('--mesh-dir=')) {
      meshDir = tok.slice('--mesh-dir='.length);
    } else {
      throw new Error(`Unknown or incomplete argument: ${tok}`);
    }
  }

  return { weapons, outJson, meshDir };
}

const { weapons: weaponsArg, outJson, meshDir } = parseArgs(process.argv.slice(2));

if (meshDir) {
  fs.mkdirSync(path.resolve(meshDir), { recursive: true });
}

const entryCode = `
import fs from 'node:fs';
import path from 'node:path';
import { GLB_WEAPON_CONFIGS } from './src/engine/geometry/glbAssetService.ts';
import { loadWeaponGeometryBuilders } from './src/weapons/geometryLoaders.ts';
import { getWeaponManifest } from './src/weapons/manifests.ts';
import { loadWeaponPlugin } from './src/weapons/registry.ts';
import { isWeaponId, WEAPON_IDS } from './src/weapons/types.ts';

const weaponsArg = ${JSON.stringify(weaponsArg)};
const outJson = ${JSON.stringify(outJson)};
const meshDir = ${JSON.stringify(meshDir ? path.resolve(meshDir) : null)};

function r5(v) {
  return Math.round(v * 1e5) / 1e5;
}

function inferAtlasKind(prefix) {
  const lower = prefix.toLowerCase();
  if (/walnut|wood|birch/.test(lower)) return 'wood';
  if (
    /polymer|furniture|grip|stock|chassis|hull|turret|armor|housing|quiver|barrel_mag|_mag$|_mag_optic/.test(
      lower
    )
  ) {
    return 'polymer';
  }
  return 'metal';
}

function inferDynamicAtlasKey(partId, material) {
  const lower = partId.toLowerCase();
  if (lower.includes('bowstring') || lower.includes('cables')) {
    return 'spring_bowstring';
  }
  if (material === 'polymer_frame') return 'spring_carbon';
  if (material === 'stainless') return 'spring_stainless';
  return 'spring_steel';
}

function exportGeometryToJson(geo, destPath) {
  const posAttr = geo.getAttribute('position');
  if (!posAttr || posAttr.count < 3) {
    throw new Error('Dynamic geometry missing valid position attribute: ' + destPath);
  }
  const positions = new Array(posAttr.count * 3);
  for (let i = 0; i < posAttr.count; i += 1) {
    positions[i * 3] = r5(posAttr.getX(i));
    positions[i * 3 + 1] = r5(posAttr.getY(i));
    positions[i * 3 + 2] = r5(posAttr.getZ(i));
  }
  const idxAttr = geo.getIndex();
  let indices;
  if (idxAttr && idxAttr.count >= 3) {
    indices = new Array(idxAttr.count);
    for (let i = 0; i < idxAttr.count; i += 1) {
      indices[i] = idxAttr.getX(i);
    }
  } else {
    indices = new Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i += 1) {
      indices[i] = i;
    }
  }
  fs.writeFileSync(destPath, JSON.stringify({ positions, indices }));
}

const targetIds =
  weaponsArg.trim().toLowerCase() === 'all'
    ? [...WEAPON_IDS]
    : weaponsArg
        .split(',')
        .map((w) => w.trim().toLowerCase())
        .filter(Boolean);

for (const wid of targetIds) {
  if (!isWeaponId(wid)) {
    throw new Error('Unknown weaponId: ' + wid);
  }
}

const specs = {};

for (const wid of targetIds) {
  const manifest = getWeaponManifest(wid);
  const plugin = await loadWeaponPlugin(wid);
  const glbCfg = GLB_WEAPON_CONFIGS[wid];
  if (!glbCfg) {
    throw new Error('Missing GLB config for weapon: ' + wid);
  }
  const builders = await loadWeaponGeometryBuilders(wid);
  const dynamicSet = new Set(glbCfg.dynamicSpringParts);

  const isTank = manifest.workbenchMeta.scaleProfile === 'main_battle_tank';
  const isArchery = wid === 'lift33' || wid === 'r500';
  const closeCfg = manifest.cameraPresets.cutaway_focus;

  const atlases = {};
  const parts = [];

  for (const part of plugin.parts) {
    const isDynamic = dynamicSet.has(part.id);
    let atlasKey;
    let meshFile = null;

    if (isDynamic) {
      atlasKey = inferDynamicAtlasKey(part.id, part.material);
      if (meshDir) {
        const builder = builders[part.id];
        if (!builder) {
          throw new Error('Missing dynamic CSG builder for ' + wid + '/' + part.id);
        }
        const geo = builder();
        const fileName = wid + '__' + part.id + '.json';
        exportGeometryToJson(geo, path.join(meshDir, fileName));
        geo.dispose();
        meshFile = fileName;
      }
    } else {
      const binding = glbCfg.pbrOverrides[part.id] ?? plugin.pbrBindings[part.id];
      if (!binding) {
        throw new Error('Missing PBR binding for ' + wid + '/' + part.id);
      }
      const prefix = binding.albedoFile.replace(/_albedo\\.webp$/, '');
      atlasKey = prefix;
      if (!atlases[atlasKey]) {
        atlases[atlasKey] = {
          prefix,
          normalScale: binding.normalScale ?? 0.85,
          kind: inferAtlasKind(prefix),
        };
      }
    }

    parts.push({
      partId: part.id,
      group: part.group,
      material: part.material,
      atlasKey,
      assembledPos: part.assembledPos.map(r5),
      assembledRot: (part.assembledRot ?? [0, 0, 0]).map(r5),
      explodeSteps: part.explodeSteps.map((s) => ({
        start: s.range[0],
        end: s.range[1],
        offset: s.offset.map(r5),
        rotation: (s.rotation ?? [0, 0, 0]).map(r5),
      })),
      dynamicSpring: isDynamic,
      meshFile,
    });
  }

  specs[wid] = {
    weaponId: wid,
    glbFile: glbCfg.modelFile,
    isTank,
    isArchery,
    closeFocusPos: [
      r5(closeCfg.pos[0]),
      r5(closeCfg.pos[1]),
      r5(closeCfg.pos[2] * 0.92),
    ],
    closeFocusTarget: closeCfg.target.map(r5),
    atlases,
    parts,
  };
}

const serialized = JSON.stringify({ version: 1, weapons: specs });
if (outJson) {
  const outPath = path.resolve(outJson);
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, serialized);
} else {
  process.stdout.write(serialized + '\\n');
}
`;

const result = await esbuild.build({
  stdin: {
    contents: entryCode,
    resolveDir: REPO_ROOT,
    sourcefile: 'dump-dk-specs-entry.ts',
    loader: 'ts',
  },
  bundle: true,
  platform: 'node',
  format: 'esm',
  write: false,
  logLevel: 'silent',
});

const jsCode = result.outputFiles[0].text;
const dataUrl = `data:text/javascript;base64,${Buffer.from(jsCode).toString('base64')}`;
await import(dataUrl);

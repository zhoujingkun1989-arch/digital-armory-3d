#!/usr/bin/env node
/**
 * Bundles and evaluates a single weapon's manifest + runtime plugin via esbuild
 * and prints pure JSON metadata (catalog, workbenchMeta, partGroups, timelinePresets,
 * parts, firingPhases) to stdout for `scripts/build_narrations.py`.
 */
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import * as esbuild from 'esbuild';

const __dirname = dirname(fileURLToPath(import.meta.url));
const rootDir = resolve(__dirname, '../..');
const weaponId = process.argv[2] || 'ak15';

const pluginExportName = `${weaponId.toUpperCase()}_PLUGIN`;
const entryCode = `
import { getWeaponManifest } from './src/weapons/manifests.ts';
import * as pluginMod from './src/weapons/${weaponId}/plugin.ts';

const plugin = pluginMod[${JSON.stringify(pluginExportName)}];
const manifest = getWeaponManifest(${JSON.stringify(weaponId)});
const payload = {
  id: manifest.id,
  shortLabel: manifest.shortLabel,
  caliberProfile: manifest.caliberProfile,
  catalog: manifest.catalog,
  workbenchMeta: manifest.workbenchMeta,
  partGroups: plugin.partGroups,
  timelinePresets: plugin.timelinePresets,
  parts: plugin.parts.map((p) => ({
    id: p.id,
    bomCode: p.bomCode,
    nameZh: p.nameZh,
    calloutLabel: p.calloutLabel,
    nameEn: p.nameEn,
    group: p.group,
    material: p.material,
    isShell: !!p.isShell,
    explodeSteps: p.explodeSteps,
    roleTag: p.roleTag,
    description: p.description,
  })),
  firingPhases: plugin.firingPhases,
};
console.log(JSON.stringify(payload));
`;

const result = await esbuild.build({
  stdin: {
    contents: entryCode,
    resolveDir: rootDir,
    sourcefile: 'dump-entry.ts',
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

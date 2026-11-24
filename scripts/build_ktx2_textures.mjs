#!/usr/bin/env node
/**
 * Digital Armory 3D — KTX2 / Basis Universal Texture Compression Pipeline
 *
 * Encodes `public/textures/*.webp` textures into GPU-compressed `.ktx2` files:
 *   - `_normal`, `_orm`, `_roughness` -> UASTC + Zstandard supercompression, Linear OETF
 *   - `_albedo` (and other color maps) -> ETC1S, sRGB OETF
 *
 * Because Khronos `toktx` does not decode WebP natively, each `.webp` is decoded
 * to a temporary `.png` via `dwebp`, Python Pillow (`PIL.Image`), or `ffmpeg`,
 * encoded with `toktx`, and cleaned up automatically.
 *
 * When `toktx` is unavailable in PATH, existing `ktx2-manifest.json` and WebP
 * runtime fallback remain completely untouched and an actionable install hint is printed.
 *
 * Usage:
 *   node scripts/build_ktx2_textures.mjs --dry-run
 *   node scripts/build_ktx2_textures.mjs --weapon ak15 --dry-run
 *   node scripts/build_ktx2_textures.mjs --weapon ak15 --limit 3
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  parseGlbWeaponAssetMap,
  resolveWeaponTextureFiles,
} from './audit_asset_budget.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_KTX2_SUBDIR = 'ktx2';

export const TOKTX_INSTALL_HINT = [
  'Install Khronos KTX-Software (`toktx`) to enable GPU-compressed KTX2 texture builds:',
  '  • macOS (Homebrew): brew install ktx',
  '  • macOS / Linux / Windows installers: https://github.com/KhronosGroup/KTX-Software/releases',
  '  • Verify installation: toktx --version',
].join('\n');

export function hasBinary(cmd, env = process.env) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
      env,
    });
    return true;
  } catch {
    return false;
  }
}

export function hasPythonPillow(env = process.env) {
  if (!hasBinary('python3', env)) return false;
  try {
    execFileSync('python3', ['-c', 'import PIL.Image'], {
      stdio: 'ignore',
      env,
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the best available WebP -> PNG decoder for feeding `toktx`.
 * Priority: `dwebp` > `python3` (Pillow) > `ffmpeg`.
 */
export function detectWebpDecoder(env = process.env) {
  if (hasBinary('dwebp', env)) return 'dwebp';
  if (hasPythonPillow(env)) return 'python3-pillow';
  if (hasBinary('ffmpeg', env)) return 'ffmpeg';
  return null;
}

/**
 * Classify a texture filename into UASTC linear (normal / ORM / roughness maps)
 * or ETC1S sRGB (albedo / diffuse color maps).
 */
export function classifyTextureMode(fileName) {
  const lower = String(fileName).toLowerCase();
  if (
    lower.includes('_normal') ||
    lower.includes('_orm') ||
    lower.includes('_roughness') ||
    lower.includes('roughness')
  ) {
    return 'UASTC_LINEAR';
  }
  return 'ETC1S_SRGB';
}

/**
 * Build exact Khronos `toktx` CLI arguments for the given texture mode.
 */
export function buildToktxArgs(mode, outKtx2Path, inputPngPath) {
  if (mode === 'UASTC_LINEAR') {
    return [
      '--t2',
      '--encode',
      'uastc',
      '--uastc_quality',
      '2',
      '--uastc_rdo_l',
      '1.0',
      '--zcmp',
      '18',
      '--assign_oetf',
      'linear',
      '--genmipmap',
      outKtx2Path,
      inputPngPath,
    ];
  }
  return [
    '--t2',
    '--encode',
    'etc1s',
    '--clevel',
    '2',
    '--qlevel',
    '192',
    '--assign_oetf',
    'srgb',
    '--genmipmap',
    outKtx2Path,
    inputPngPath,
  ];
}

/**
 * Decode a `.webp` image to a temporary `.png` suitable for `toktx`.
 */
export function decodeWebpToPng(webpPath, pngPath, decoder, env = process.env) {
  if (decoder === 'dwebp') {
    execFileSync('dwebp', [webpPath, '-o', pngPath], {
      stdio: 'pipe',
      env,
    });
    return;
  }
  if (decoder === 'python3-pillow') {
    execFileSync(
      'python3',
      [
        '-c',
        'import sys; from PIL import Image; Image.open(sys.argv[1]).save(sys.argv[2], "PNG")',
        webpPath,
        pngPath,
      ],
      { stdio: 'pipe', env }
    );
    return;
  }
  if (decoder === 'ffmpeg') {
    execFileSync(
      'ffmpeg',
      ['-y', '-loglevel', 'error', '-i', webpPath, pngPath],
      { stdio: 'pipe', env }
    );
    return;
  }
  throw new Error(
    'No WebP-to-PNG decoder found in PATH (tried `dwebp`, `python3`+Pillow, and `ffmpeg`). Install `webp` (`brew install webp`) or Pillow (`pip install pillow`).'
  );
}

export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    root: DEFAULT_REPO_ROOT,
    dryRun: false,
    force: false,
    weapon: null,
    limit: null,
    outSubdir: DEFAULT_KTX2_SUBDIR,
    help: false,
  };

  const readVal = (idx, flag, inline) => {
    if (inline !== undefined) {
      if (!inline) throw new Error(`Option ${flag} requires a value.`);
      return { value: inline, nextIndex: idx };
    }
    const next = args[idx + 1];
    if (next === undefined || next.startsWith('--')) {
      throw new Error(`Option ${flag} requires a value.`);
    }
    return { value: next, nextIndex: idx + 1 };
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '-h' || token === '--help') {
      opts.help = true;
      continue;
    }
    const eqIdx = token.indexOf('=');
    const flag = eqIdx >= 0 ? token.slice(0, eqIdx) : token;
    const inline = eqIdx >= 0 ? token.slice(eqIdx + 1) : undefined;

    switch (flag) {
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--force':
        opts.force = true;
        break;
      case '--weapon': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.weapon = value.trim().toLowerCase();
        break;
      }
      case '--limit': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1) {
          throw new Error(`Invalid --limit "${value}". Expected a positive integer.`);
        }
        opts.limit = n;
        break;
      }
      case '--out-subdir': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.outSubdir = value.trim().replace(/^\/+|\/+$/g, '');
        break;
      }
      case '--root': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.root = path.resolve(value);
        break;
      }
      default:
        throw new Error(`Unknown option "${flag}". Run with --help to see usage.`);
    }
  }

  return opts;
}

function readExistingManifest(manifestPath) {
  if (!fs.existsSync(manifestPath)) return null;
  try {
    const parsed = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    if (
      parsed &&
      typeof parsed === 'object' &&
      typeof parsed.version === 'number' &&
      parsed.entries &&
      typeof parsed.entries === 'object'
    ) {
      return parsed;
    }
    return null;
  } catch {
    return null;
  }
}

export function buildEncodingPlan(options = {}) {
  const repoRoot = path.resolve(options.root ?? DEFAULT_REPO_ROOT);
  const texDir = path.join(repoRoot, 'public', 'textures');
  const outSubdir = options.outSubdir ?? DEFAULT_KTX2_SUBDIR;
  const weaponFilter = options.weapon
    ? String(options.weapon).trim().toLowerCase()
    : null;
  const limit = options.limit ?? null;

  const allWebpFiles = fs.existsSync(texDir)
    ? fs
        .readdirSync(texDir)
        .filter((f) => f.toLowerCase().endsWith('.webp'))
        .sort()
    : [];

  let matchedFiles = allWebpFiles;
  if (weaponFilter) {
    const glbAssetMap = parseGlbWeaponAssetMap(repoRoot);
    const weaponFiles = resolveWeaponTextureFiles(
      weaponFilter,
      allWebpFiles,
      glbAssetMap,
      { includeLegacyPrefixMatches: true }
    );
    const allowedSet = new Set(weaponFiles);
    matchedFiles = allWebpFiles.filter((f) => allowedSet.has(f));
  }

  const selectedFiles =
    limit !== null ? matchedFiles.slice(0, limit) : matchedFiles;

  const items = selectedFiles.map((fileName) => {
    const mode = classifyTextureMode(fileName);
    const ktx2Name = fileName.replace(/\.webp$/i, '.ktx2');
    const outRelPath = outSubdir ? `${outSubdir}/${ktx2Name}` : ktx2Name;
    const sourcePath = path.join(texDir, fileName);
    const outAbsPath = path.join(texDir, outRelPath);
    const sourceBytes = fs.existsSync(sourcePath)
      ? fs.statSync(sourcePath).size
      : 0;
    return {
      fileName,
      outName: ktx2Name,
      outRelPath,
      sourcePath,
      outAbsPath,
      sourceBytes,
      mode,
    };
  });

  return {
    repoRoot,
    texDir,
    manifestPath: path.join(texDir, 'ktx2-manifest.json'),
    totalSourceWebpCount: allWebpFiles.length,
    matchedCount: matchedFiles.length,
    weaponFilter,
    limit,
    outSubdir,
    items,
  };
}

export function runKtx2Build(options = {}, env = process.env) {
  const plan = buildEncodingPlan(options);
  const toktxAvailable = hasBinary('toktx', env);
  const webpDecoder = detectWebpDecoder(env);
  const uastcLinearCount = plan.items.filter(
    (p) => p.mode === 'UASTC_LINEAR'
  ).length;
  const etc1sSrgbCount = plan.items.length - uastcLinearCount;

  if (options.dryRun) {
    return {
      status: 'dry-run',
      payload: {
        dryRun: true,
        weaponFilter: plan.weaponFilter,
        limit: plan.limit,
        sourceTextureCount: plan.items.length,
        totalTextureLibraryCount: plan.totalSourceWebpCount,
        matchedTextureCount: plan.matchedCount,
        uastcLinearCount,
        etc1sSrgbCount,
        toktxAvailable,
        webpDecoder,
        manifestPath: path.relative(plan.repoRoot, plan.manifestPath),
        outSubdir: plan.outSubdir,
        samplePlan: plan.items.slice(0, 12).map((item) => ({
          fileName: item.fileName,
          outRelPath: item.outRelPath,
          mode: item.mode,
          sourceBytes: item.sourceBytes,
          toktxArgs: buildToktxArgs(item.mode, item.outRelPath, '<temp.png>'),
        })),
        installHint: toktxAvailable ? null : TOKTX_INSTALL_HINT,
      },
    };
  }

  const existingManifest = readExistingManifest(plan.manifestPath);

  if (!toktxAvailable) {
    // Preserve any existing valid manifest untouched; only create baseline if absent/corrupt.
    let manifestPreserved = true;
    if (!existingManifest) {
      fs.mkdirSync(plan.texDir, { recursive: true });
      fs.writeFileSync(
        plan.manifestPath,
        `${JSON.stringify({ version: 1, transcoderPath: 'basis/', entries: {} }, null, 2)}\n`,
        'utf8'
      );
      manifestPreserved = false;
    }

    return {
      status: 'toktx-missing',
      manifestPreserved,
      existingEntryCount: existingManifest
        ? Object.keys(existingManifest.entries).length
        : 0,
      installHint: TOKTX_INSTALL_HINT,
      manifestPath: plan.manifestPath,
    };
  }

  if (!webpDecoder) {
    throw new Error(
      'Cannot decode WebP textures to PNG for `toktx`: none of `dwebp`, `python3` (Pillow), or `ffmpeg` were found in PATH.'
    );
  }

  const mergedEntries = { ...(existingManifest?.entries ?? {}) };
  const mergedPerFile = { ...(existingManifest?.stats?.perFile ?? {}) };

  // Prune any stale manifest entries whose .ktx2 target no longer exists on disk
  for (const [webpName, relKtx2] of Object.entries(mergedEntries)) {
    const absKtx2 = path.join(plan.texDir, relKtx2);
    if (!fs.existsSync(absKtx2)) {
      delete mergedEntries[webpName];
      delete mergedPerFile[webpName];
    }
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'digital-armory-ktx2-'));
  let encodedCount = 0;
  let skippedUpToDateCount = 0;
  let failedCount = 0;
  const failures = [];

  try {
    for (const item of plan.items) {
      fs.mkdirSync(path.dirname(item.outAbsPath), { recursive: true });

      const alreadyUpToDate =
        !options.force &&
        fs.existsSync(item.outAbsPath) &&
        fs.statSync(item.outAbsPath).mtimeMs >=
          fs.statSync(item.sourcePath).mtimeMs &&
        fs.statSync(item.outAbsPath).size > 0;

      if (alreadyUpToDate) {
        skippedUpToDateCount += 1;
      } else {
        const tempPngPath = path.join(
          tmpDir,
          item.fileName.replace(/\.webp$/i, '.png')
        );
        try {
          decodeWebpToPng(item.sourcePath, tempPngPath, webpDecoder, env);
          const toktxArgs = buildToktxArgs(
            item.mode,
            item.outAbsPath,
            tempPngPath
          );
          execFileSync('toktx', toktxArgs, {
            stdio: 'pipe',
            env,
          });
          if (!fs.existsSync(item.outAbsPath) || fs.statSync(item.outAbsPath).size === 0) {
            throw new Error(`toktx produced no output at ${item.outAbsPath}`);
          }
          encodedCount += 1;
        } catch (err) {
          failedCount += 1;
          failures.push({
            fileName: item.fileName,
            error: err instanceof Error ? err.message : String(err),
          });
          continue;
        } finally {
          if (fs.existsSync(tempPngPath)) {
            fs.rmSync(tempPngPath, { force: true });
          }
        }
      }

      const ktx2Bytes = fs.statSync(item.outAbsPath).size;
      const savingsBytes = item.sourceBytes - ktx2Bytes;
      const savingsPercent =
        item.sourceBytes > 0
          ? Number(((savingsBytes / item.sourceBytes) * 100).toFixed(2))
          : 0;

      mergedEntries[item.fileName] = item.outRelPath;
      mergedPerFile[item.fileName] = {
        ktx2: item.outRelPath,
        mode: item.mode,
        sourceBytes: item.sourceBytes,
        ktx2Bytes,
        savingsBytes,
        savingsPercent,
      };
    }
  } finally {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  }

  // Sort manifest keys deterministically & compute aggregate byte stats
  const sortedEntries = {};
  const sortedPerFile = {};
  let totalSourceWebpBytes = 0;
  let totalKtx2Bytes = 0;
  let totalUastcCount = 0;
  let totalEtc1sCount = 0;

  for (const key of Object.keys(mergedEntries).sort()) {
    sortedEntries[key] = mergedEntries[key];
    const srcPath = path.join(plan.texDir, key);
    const outPath = path.join(plan.texDir, mergedEntries[key]);
    const srcBytes = fs.existsSync(srcPath) ? fs.statSync(srcPath).size : 0;
    const outBytes = fs.existsSync(outPath) ? fs.statSync(outPath).size : 0;
    const mode = classifyTextureMode(key);
    if (mode === 'UASTC_LINEAR') totalUastcCount += 1;
    else totalEtc1sCount += 1;

    totalSourceWebpBytes += srcBytes;
    totalKtx2Bytes += outBytes;
    const delta = srcBytes - outBytes;
    sortedPerFile[key] = mergedPerFile[key] ?? {
      ktx2: mergedEntries[key],
      mode,
      sourceBytes: srcBytes,
      ktx2Bytes: outBytes,
      savingsBytes: delta,
      savingsPercent:
        srcBytes > 0 ? Number(((delta / srcBytes) * 100).toFixed(2)) : 0,
    };
  }

  const totalSavingsBytes = totalSourceWebpBytes - totalKtx2Bytes;
  const totalSavingsPercent =
    totalSourceWebpBytes > 0
      ? Number(((totalSavingsBytes / totalSourceWebpBytes) * 100).toFixed(2))
      : 0;

  const manifest = {
    version: 1,
    transcoderPath: existingManifest?.transcoderPath ?? 'basis/',
    generatedAt: new Date().toISOString(),
    entries: sortedEntries,
    stats: {
      publishedCount: Object.keys(sortedEntries).length,
      encodedCount,
      skippedUpToDateCount,
      failedCount,
      uastcLinearCount: totalUastcCount,
      etc1sSrgbCount: totalEtc1sCount,
      sourceWebpBytes: totalSourceWebpBytes,
      ktx2Bytes: totalKtx2Bytes,
      savingsBytes: totalSavingsBytes,
      savingsPercent: totalSavingsPercent,
      perFile: sortedPerFile,
    },
  };

  fs.writeFileSync(
    plan.manifestPath,
    `${JSON.stringify(manifest, null, 2)}\n`,
    'utf8'
  );

  return {
    status: failedCount > 0 ? 'partial-failure' : 'encoded',
    manifestPath: plan.manifestPath,
    webpDecoder,
    manifest,
    failures,
  };
}

export function formatHelpText() {
  return `Digital Armory 3D — KTX2 / Basis Universal Texture Pipeline

Usage:
  node scripts/build_ktx2_textures.mjs [options]

Options:
  --weapon <id>        Filter textures belonging to a single exhibit (e.g. ak15, winchester1894)
  --limit <n>          Limit encoding to the first <n> matched textures
  --dry-run            Print JSON encoding plan & tool availability without writing files
  --force              Re-encode even when existing .ktx2 outputs are up to date
  --out-subdir <dir>   Subdirectory under public/textures/ for .ktx2 files (default: ${DEFAULT_KTX2_SUBDIR})
  --root <dir>         Repository root directory override
  -h, --help           Show this help text
`;
}

function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[build_ktx2_textures] ERROR: ${err.message}\n`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatHelpText());
    process.exit(0);
  }

  let result;
  try {
    result = runKtx2Build(opts);
  } catch (err) {
    process.stderr.write(
      `[build_ktx2_textures] ERROR: ${err instanceof Error ? err.message : String(err)}\n`
    );
    process.exit(1);
  }

  if (result.status === 'dry-run') {
    process.stdout.write(`${JSON.stringify(result.payload, null, 2)}\n`);
    process.exit(0);
  }

  if (result.status === 'toktx-missing') {
    process.stdout.write(
      `[build_ktx2_textures] \`toktx\` binary not found in PATH — WebP runtime fallback remains active (${result.manifestPreserved ? `existing manifest preserved with ${result.existingEntryCount} entries` : 'initialized empty fallback manifest'}).\n${result.installHint}\n`
    );
    process.exit(0);
  }

  const s = result.manifest.stats;
  process.stdout.write(
    `[build_ktx2_textures] Completed via ${result.webpDecoder} + toktx: encoded=${s.encodedCount}, upToDate=${s.skippedUpToDateCount}, failed=${s.failedCount}, published=${s.publishedCount} (WebP ${s.sourceWebpBytes} B -> KTX2 ${s.ktx2Bytes} B, delta ${s.savingsBytes >= 0 ? '-' : '+'}${Math.abs(s.savingsBytes)} B / ${s.savingsPercent}%).\n`
  );
  if (result.failures.length > 0) {
    for (const f of result.failures) {
      process.stderr.write(`  [FAIL] ${f.fileName}: ${f.error}\n`);
    }
    process.exit(1);
  }
  process.exit(0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

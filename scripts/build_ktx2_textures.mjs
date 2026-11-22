#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const TEX_DIR = path.join(ROOT, 'public', 'textures');
const MANIFEST_PATH = path.join(TEX_DIR, 'ktx2-manifest.json');
const DRY_RUN = process.argv.includes('--dry-run');

function hasBinary(cmd) {
  try {
    execFileSync(process.platform === 'win32' ? 'where' : 'which', [cmd], {
      stdio: 'ignore',
    });
    return true;
  } catch {
    return false;
  }
}

function classifyTextureMode(fileName) {
  if (fileName.includes('_normal') || fileName.includes('_orm') || fileName.includes('roughness')) {
    return 'UASTC_LINEAR';
  }
  return 'ETC1S_SRGB';
}

const files = fs
  .readdirSync(TEX_DIR)
  .filter((f) => f.endsWith('.webp'))
  .sort();

const plan = files.map((fileName) => {
  const mode = classifyTextureMode(fileName);
  const outName = fileName.replace(/\.webp$/i, '.ktx2');
  return {
    fileName,
    outName,
    mode,
  };
});

const toktxAvailable = hasBinary('toktx');
const cwebpAvailable = hasBinary('cwebp');

if (DRY_RUN) {
  const uastcCount = plan.filter((p) => p.mode === 'UASTC_LINEAR').length;
  const etc1sCount = plan.length - uastcCount;
  console.log(
    JSON.stringify(
      {
        dryRun: true,
        sourceTextureCount: plan.length,
        uastcLinearCount: uastcCount,
        etc1sSrgbCount: etc1sCount,
        toktxAvailable,
        cwebpAvailable,
        manifestPath: path.relative(ROOT, MANIFEST_PATH),
      },
      null,
      2
    )
  );
  process.exit(0);
}

if (!toktxAvailable) {
  console.log(
    '[build_ktx2_textures] `toktx` binary not found in PATH — leaving WebP runtime fallback active with empty manifest entries.'
  );
  fs.writeFileSync(
    MANIFEST_PATH,
    `${JSON.stringify({ version: 1, transcoderPath: 'basis/', entries: {} }, null, 2)}\n`,
    'utf8'
  );
  process.exit(0);
}

console.log(
  `[build_ktx2_textures] Encoding ${plan.length} WebP textures to KTX2 (BasisU)...`
);
process.exit(0);

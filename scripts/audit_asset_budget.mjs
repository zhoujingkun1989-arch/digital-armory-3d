#!/usr/bin/env node
/**
 * Digital Armory 3D — Asset & Bundle Budget Auditor
 *
 * Measures static media footprint across `public/{audio,textures,models,plates,hdri,narrations}`
 * and `dist/`, enforces per-weapon GLB + texture budgets (`<= 12 MB`), and warns when
 * `dist/` approaches GitHub Pages' 1 GB deployment limit (`> 800 MB`).
 *
 * Usage:
 *   node scripts/audit_asset_budget.mjs
 *   node scripts/audit_asset_budget.mjs --json
 *   node scripts/audit_asset_budget.mjs --weapon ak15 --strict
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

export const PUBLIC_AUDIT_DIRS = Object.freeze([
  'audio',
  'textures',
  'models',
  'plates',
  'hdri',
  'narrations',
]);

export const DEFAULT_WEAPON_BUDGET_MB = 12;
export const DEFAULT_DIST_WARN_MB = 800;
export const GITHUB_PAGES_LIMIT_MB = 1024;
export const EXPECTED_PLATES_PER_WEAPON = 10;
const BYTES_PER_MB = 1024 * 1024;

export const WEAPON_TEXTURE_PREFIX_ALIASES = Object.freeze({
  winchester1894: ['winchester1894_', 'win94_'],
});

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  if (mb < 1024) return `${mb.toFixed(2)} MB`;
  return `${(mb / 1024).toFixed(2)} GB`;
}

function roundMb(bytes) {
  return Number((bytes / BYTES_PER_MB).toFixed(3));
}

function roundPct(part, total) {
  if (!Number.isFinite(total) || total <= 0) return 0;
  return Number(((part / total) * 100).toFixed(2));
}

/**
 * Recursively sums file sizes and file counts under `dirPath`.
 */
export function measureDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return {
      exists: false,
      bytes: 0,
      mb: 0,
      fileCount: 0,
    };
  }

  let bytes = 0;
  let fileCount = 0;
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile()) {
        try {
          bytes += fs.statSync(fullPath).size;
          fileCount += 1;
        } catch {
          // ignore transient/unreadable files
        }
      }
    }
  }

  return {
    exists: true,
    bytes,
    mb: roundMb(bytes),
    fileCount,
  };
}

/**
 * Recursively finds files under `dirPath` matching case-insensitive extension `ext`
 * (e.g. `.png`), returning sorted POSIX-style relative paths.
 */
export function findFilesWithExtension(dirPath, ext) {
  if (!fs.existsSync(dirPath)) {
    return [];
  }
  const needle = String(ext).toLowerCase();
  const matches = [];
  const stack = [dirPath];

  while (stack.length > 0) {
    const current = stack.pop();
    let entries;
    try {
      entries = fs.readdirSync(current, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const entry of entries) {
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else if (entry.isFile() && entry.name.toLowerCase().endsWith(needle)) {
        const rel = path.relative(dirPath, fullPath).split(path.sep).join('/');
        matches.push(rel);
      }
    }
  }

  return matches.sort();
}

/**
 * Statically parses `src/engine/geometry/glbAssetService.ts` to extract each weapon's
 * authoritative `modelFile` and unique referenced `.webp` PBR texture set.
 * Falls back cleanly to an empty map if the source file does not exist (e.g. synthetic fixtures).
 */
export function parseGlbWeaponAssetMap(repoRoot = DEFAULT_REPO_ROOT) {
  const glbServicePath = path.join(
    repoRoot,
    'src',
    'engine',
    'geometry',
    'glbAssetService.ts'
  );
  if (!fs.existsSync(glbServicePath)) {
    return new Map();
  }

  const source = fs.readFileSync(glbServicePath, 'utf8');

  // 1. Parse named PbrBindingSpec constants: `const FOO_PBR: PbrBindingSpec = { ... };`
  const specFilesByConst = new Map();
  const constRe =
    /const\s+([A-Z0-9_]+)\s*:\s*PbrBindingSpec\s*=\s*\{([\s\S]*?)\};/g;
  for (const match of source.matchAll(constRe)) {
    const constName = match[1];
    const body = match[2];
    const files = new Set();
    for (const fileMatch of body.matchAll(
      /(?:albedoFile|normalFile|roughnessFile)\s*:\s*['"]([^'"]+\.(?:webp|png|ktx2))['"]/g
    )) {
      files.add(fileMatch[1]);
    }
    specFilesByConst.set(constName, files);
  }

  // 2. Locate `export const GLB_WEAPON_CONFIGS ... = { ... };`
  const configsAnchor = source.indexOf('export const GLB_WEAPON_CONFIGS');
  if (configsAnchor < 0) {
    return new Map();
  }
  const openBraceIdx = source.indexOf('= {', configsAnchor);
  if (openBraceIdx < 0) {
    return new Map();
  }

  // Extract balanced block for GLB_WEAPON_CONFIGS
  const blockStart = openBraceIdx + 2;
  let depth = 0;
  let blockEnd = -1;
  for (let i = blockStart; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        blockEnd = i;
        break;
      }
    }
  }
  if (blockEnd < 0) {
    return new Map();
  }

  const configsBody = source.slice(blockStart + 1, blockEnd);
  const result = new Map();

  // Walk top-level `weaponId: { ... }` entries inside GLB_WEAPON_CONFIGS
  let idx = 0;
  while (idx < configsBody.length) {
    const entryRe = /([a-z0-9_]+)\s*:\s*\{/g;
    entryRe.lastIndex = idx;
    const m = entryRe.exec(configsBody);
    if (!m) break;

    const weaponId = m[1];
    const entryOpen = m.index + m[0].length - 1;
    let d = 0;
    let entryClose = -1;
    for (let j = entryOpen; j < configsBody.length; j += 1) {
      if (configsBody[j] === '{') d += 1;
      else if (configsBody[j] === '}') {
        d -= 1;
        if (d === 0) {
          entryClose = j;
          break;
        }
      }
    }
    if (entryClose < 0) break;

    const entryBody = configsBody.slice(entryOpen + 1, entryClose);
    const modelMatch = /modelFile\s*:\s*['"]([^'"]+\.glb)['"]/.exec(entryBody);
    const modelFile = modelMatch ? modelMatch[1] : `${weaponId}.glb`;

    const textureFiles = new Set();
    // Referenced spec constants inside pbrOverrides
    for (const refMatch of entryBody.matchAll(/\b([A-Z][A-Z0-9_]*_PBR)\b/g)) {
      const files = specFilesByConst.get(refMatch[1]);
      if (files) {
        for (const f of files) textureFiles.add(f);
      }
    }
    // Inline file literals if any
    for (const litMatch of entryBody.matchAll(
      /['"]([^'"]+\.(?:webp|png|ktx2))['"]/g
    )) {
      textureFiles.add(litMatch[1]);
    }

    result.set(weaponId, {
      weaponId,
      modelFile,
      textureFiles: Array.from(textureFiles).sort(),
    });

    idx = entryClose + 1;
  }

  return result;
}

/**
 * Resolves texture filenames belonging to `weaponId`, using `glbAssetService.ts`
 * when available and falling back to `<weaponId>_v3_*.webp` / `<weaponId>_*.webp`
 * filename prefix discovery for any unregistered or synthetic fixture weapon.
 */
export function resolveWeaponTextureFiles(
  weaponId,
  allTextureFiles,
  glbAssetMap = new Map(),
  options = {}
) {
  const { includeLegacyPrefixMatches = false } = options;
  const fromGlb = glbAssetMap.get(weaponId);
  const selected = new Set(fromGlb ? fromGlb.textureFiles : []);

  const prefixes = WEAPON_TEXTURE_PREFIX_ALIASES[weaponId] ?? [`${weaponId}_`];
  if (selected.size === 0 || includeLegacyPrefixMatches) {
    const v3Matches = allTextureFiles.filter((f) =>
      prefixes.some((p) => f.startsWith(`${p}v3_`))
    );
    if (v3Matches.length > 0 && !includeLegacyPrefixMatches) {
      for (const f of v3Matches) selected.add(f);
    } else {
      for (const f of allTextureFiles) {
        if (prefixes.some((p) => f.startsWith(p))) {
          selected.add(f);
        }
      }
    }
  }

  return Array.from(selected).sort();
}

export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    root: DEFAULT_REPO_ROOT,
    json: false,
    strict: false,
    weapon: null,
    maxWeaponMb: DEFAULT_WEAPON_BUDGET_MB,
    distWarnMb: DEFAULT_DIST_WARN_MB,
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
      case '--json':
        opts.json = true;
        break;
      case '--strict':
        opts.strict = true;
        break;
      case '--weapon': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.weapon = value.trim().toLowerCase();
        break;
      }
      case '--root': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.root = path.resolve(value);
        break;
      }
      case '--max-weapon-mb': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`Invalid --max-weapon-mb "${value}". Expected positive number.`);
        }
        opts.maxWeaponMb = n;
        break;
      }
      case '--dist-warn-mb': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n <= 0) {
          throw new Error(`Invalid --dist-warn-mb "${value}". Expected positive number.`);
        }
        opts.distWarnMb = n;
        break;
      }
      default:
        throw new Error(`Unknown option "${flag}". Run with --help to see supported options.`);
    }
  }

  return opts;
}

/**
 * Executes a full asset and bundle budget audit against `repoRoot`.
 */
export function runAssetBudgetAudit(options = {}) {
  const repoRoot = path.resolve(options.root ?? DEFAULT_REPO_ROOT);
  const maxWeaponMb = options.maxWeaponMb ?? DEFAULT_WEAPON_BUDGET_MB;
  const distWarnMb = options.distWarnMb ?? DEFAULT_DIST_WARN_MB;
  const weaponFilter = options.weapon ? String(options.weapon).trim().toLowerCase() : null;

  const weaponBudgetBytes = Math.round(maxWeaponMb * BYTES_PER_MB);
  const distWarnBytes = Math.round(distWarnMb * BYTES_PER_MB);
  const distHardLimitBytes = Math.round(GITHUB_PAGES_LIMIT_MB * BYTES_PER_MB);

  const publicRoot = path.join(repoRoot, 'public');
  const distRoot = path.join(repoRoot, 'dist');
  const modelsDir = path.join(publicRoot, 'models');
  const texturesDir = path.join(publicRoot, 'textures');
  const platesDir = path.join(publicRoot, 'plates');
  const platesManifestPath = path.join(platesDir, 'manifest.json');

  const publicDirs = {};
  for (const dirName of PUBLIC_AUDIT_DIRS) {
    publicDirs[dirName] = measureDirectory(path.join(publicRoot, dirName));
  }
  const publicTotal = measureDirectory(publicRoot);
  const distStats = measureDirectory(distRoot);

  const distGithubPagesUsagePercent = roundPct(distStats.bytes, distHardLimitBytes);
  const distApproachingLimit = distStats.exists && distStats.bytes > distWarnBytes;
  const distExceedsLimit = distStats.exists && distStats.bytes > distHardLimitBytes;

  // Discover weapons from both glbAssetService.ts and public/models/*.glb
  const glbAssetMap = parseGlbWeaponAssetMap(repoRoot);
  const discoveredWeaponIds = new Set(glbAssetMap.keys());
  if (fs.existsSync(modelsDir)) {
    for (const name of fs.readdirSync(modelsDir)) {
      if (name.toLowerCase().endsWith('.glb')) {
        discoveredWeaponIds.add(name.replace(/\.glb$/i, '').toLowerCase());
      }
    }
  }

  const allTextureFiles = fs.existsSync(texturesDir)
    ? fs
        .readdirSync(texturesDir)
        .filter((f) => f.toLowerCase().endsWith('.webp'))
        .sort()
    : [];

  let weaponIds = Array.from(discoveredWeaponIds).sort();
  if (weaponFilter) {
    weaponIds = weaponIds.filter((id) => id === weaponFilter);
  }

  const weapons = [];
  const warnings = [];
  const errors = [];

  for (const weaponId of weaponIds) {
    const config = glbAssetMap.get(weaponId);
    const modelFile = config?.modelFile ?? `${weaponId}.glb`;
    const glbPath = path.join(modelsDir, modelFile);
    const glbExists = fs.existsSync(glbPath);
    const glbBytes = glbExists ? fs.statSync(glbPath).size : 0;

    const textureFiles = resolveWeaponTextureFiles(
      weaponId,
      allTextureFiles,
      glbAssetMap,
      { includeLegacyPrefixMatches: false }
    );

    let textureBytes = 0;
    const missingTextures = [];
    for (const texFile of textureFiles) {
      const texPath = path.join(texturesDir, texFile);
      if (fs.existsSync(texPath)) {
        textureBytes += fs.statSync(texPath).size;
      } else {
        missingTextures.push(texFile);
      }
    }

    const totalBytes = glbBytes + textureBytes;
    const withinBudget = totalBytes <= weaponBudgetBytes;

    if (!glbExists) {
      errors.push(`Weapon "${weaponId}" missing GLB model: public/models/${modelFile}`);
    }
    if (missingTextures.length > 0) {
      errors.push(
        `Weapon "${weaponId}" missing ${missingTextures.length} texture(s): ${missingTextures.join(', ')}`
      );
    }
    if (!withinBudget) {
      errors.push(
        `Weapon "${weaponId}" GLB+textures (${formatBytes(totalBytes)}) exceeds ${maxWeaponMb} MB budget (${formatBytes(weaponBudgetBytes)}).`
      );
    }

    weapons.push({
      weaponId,
      modelFile,
      glbExists,
      glbBytes,
      glbMb: roundMb(glbBytes),
      textureCount: textureFiles.length,
      textureFiles,
      missingTextures,
      textureBytes,
      textureMb: roundMb(textureBytes),
      totalBytes,
      totalMb: roundMb(totalBytes),
      budgetBytes: weaponBudgetBytes,
      budgetMb: maxWeaponMb,
      budgetUsagePercent: roundPct(totalBytes, weaponBudgetBytes),
      withinBudget,
    });
  }

  if (weaponFilter && weapons.length === 0) {
    errors.push(`Weapon "${weaponFilter}" was not found in public/models/ or glbAssetService.ts.`);
  }

  // Strict zero-PNG hygiene check across public/textures/ and public/plates/
  const rogueTexturePngs = findFilesWithExtension(texturesDir, '.png');
  const roguePlatePngs = findFilesWithExtension(platesDir, '.png');
  const allRoguePngs = [
    ...rogueTexturePngs.map((f) => `public/textures/${f}`),
    ...roguePlatePngs.map((f) => `public/plates/${f}`),
  ];
  if (allRoguePngs.length > 0) {
    const sample = allRoguePngs.slice(0, 10).join(', ');
    const more =
      allRoguePngs.length > 10 ? ` (+${allRoguePngs.length - 10} more)` : '';
    errors.push(
      `Rogue PNG asset(s) detected in public/textures/ or public/plates/ (${allRoguePngs.length} found; zero-PNG WebP policy): ${sample}${more}`
    );
  }

  // Strict Cycles plates manifest parity check (34/34 weapons × 10 plates = 340 on disk)
  // Skipped cleanly on minimal synthetic test fixtures that do not ship public/plates/manifest.json.
  const platesAudit = {
    checked: false,
    manifestExists: fs.existsSync(platesManifestPath),
    manifestWeaponCount: 0,
    expectedWeaponCount: weaponIds.length,
    expectedPlatesPerWeapon: EXPECTED_PLATES_PER_WEAPON,
    expectedTotalPlates: weaponIds.length * EXPECTED_PLATES_PER_WEAPON,
    verifiedPlateFiles: 0,
    missingWeapons: [],
    extraWeapons: [],
    underPopulatedWeapons: [],
    missingPlateFiles: [],
    ok: true,
  };

  if (platesAudit.manifestExists) {
    platesAudit.checked = true;
    let parsedManifest = null;
    try {
      parsedManifest = JSON.parse(fs.readFileSync(platesManifestPath, 'utf8'));
    } catch (err) {
      platesAudit.ok = false;
      errors.push(
        `Invalid JSON in public/plates/manifest.json: ${err instanceof Error ? err.message : String(err)}`
      );
    }

    if (
      parsedManifest &&
      parsedManifest.weapons &&
      typeof parsedManifest.weapons === 'object'
    ) {
      const manifestWeapons = parsedManifest.weapons;
      const manifestKeys = Object.keys(manifestWeapons).sort();
      platesAudit.manifestWeaponCount = manifestKeys.length;

      if (!weaponFilter) {
        const discoveredSet = new Set(weaponIds);
        for (const extraId of manifestKeys) {
          if (!discoveredSet.has(extraId)) {
            platesAudit.extraWeapons.push(extraId);
          }
        }
        if (platesAudit.extraWeapons.length > 0) {
          platesAudit.ok = false;
          errors.push(
            `public/plates/manifest.json contains unregistered weapon(s): ${platesAudit.extraWeapons.join(', ')}`
          );
        }
      }

      for (const weaponId of weaponIds) {
        const entry = manifestWeapons[weaponId];
        if (!entry || typeof entry !== 'object') {
          platesAudit.missingWeapons.push(weaponId);
          platesAudit.ok = false;
          errors.push(
            `public/plates/manifest.json missing exhibit "${weaponId}" (expected ${weaponIds.length}/${weaponIds.length} parity).`
          );
          continue;
        }

        const plateEntries =
          entry.plates && typeof entry.plates === 'object'
            ? Object.entries(entry.plates)
            : [];
        if (plateEntries.length !== EXPECTED_PLATES_PER_WEAPON) {
          platesAudit.underPopulatedWeapons.push({
            weaponId,
            plateCount: plateEntries.length,
          });
          platesAudit.ok = false;
          errors.push(
            `Exhibit "${weaponId}" in public/plates/manifest.json has ${plateEntries.length} plate(s) (expected ${EXPECTED_PLATES_PER_WEAPON}).`
          );
        }

        for (const [plateKey, plateMeta] of plateEntries) {
          const relFile =
            typeof plateMeta?.file === 'string' && plateMeta.file.length > 0
              ? plateMeta.file
              : `plates/${weaponId}/${plateKey}.webp`;
          const fullPlatePath = path.join(publicRoot, relFile);
          let validFile = false;
          try {
            validFile =
              fs.existsSync(fullPlatePath) && fs.statSync(fullPlatePath).size > 0;
          } catch {
            validFile = false;
          }
          if (validFile) {
            platesAudit.verifiedPlateFiles += 1;
          } else {
            platesAudit.missingPlateFiles.push(`public/${relFile}`);
            platesAudit.ok = false;
          }
        }
      }

      if (platesAudit.missingPlateFiles.length > 0) {
        const sample = platesAudit.missingPlateFiles.slice(0, 10).join(', ');
        const more =
          platesAudit.missingPlateFiles.length > 10
            ? ` (+${platesAudit.missingPlateFiles.length - 10} more)`
            : '';
        errors.push(
          `Missing or empty Cycles plate file(s) referenced in public/plates/manifest.json (${platesAudit.missingPlateFiles.length}): ${sample}${more}`
        );
      }
    } else if (parsedManifest !== null) {
      platesAudit.ok = false;
      errors.push('public/plates/manifest.json is missing a valid "weapons" map.');
    }
  }

  if (!distStats.exists) {
    warnings.push(
      `dist/ directory not found yet (run "npm run build" to measure final bundle size; public/ alone is currently ${formatBytes(publicTotal.bytes)}).`
    );
  } else if (distExceedsLimit) {
    errors.push(
      `dist/ total size (${formatBytes(distStats.bytes)}) exceeds GitHub Pages 1 GB limit (${GITHUB_PAGES_LIMIT_MB} MB)! Offload heavy media via VITE_CDN_ASSET_BASE_URL.`
    );
  } else if (distApproachingLimit) {
    warnings.push(
      `dist/ total size (${formatBytes(distStats.bytes)}, ${distGithubPagesUsagePercent}% of 1 GB) exceeds ${distWarnMb} MB GitHub Pages warning threshold. Consider enabling VITE_CDN_ASSET_BASE_URL for heavy media.`
    );
  }

  const overBudgetWeapons = weapons.filter((w) => !w.withinBudget);
  const largestWeapon =
    weapons.length > 0
      ? weapons.reduce((max, cur) => (cur.totalBytes > max.totalBytes ? cur : max))
      : null;

  return {
    generatedAt: new Date().toISOString(),
    repoRoot,
    thresholds: {
      weaponBudgetBytes,
      weaponBudgetMb: maxWeaponMb,
      distWarnBytes,
      distWarnMb,
      distHardLimitBytes,
      distHardLimitMb: GITHUB_PAGES_LIMIT_MB,
    },
    directories: {
      public: {
        ...publicDirs,
        total: publicTotal,
      },
      dist: {
        ...distStats,
        githubPagesUsagePercent: distGithubPagesUsagePercent,
        approachingLimit: distApproachingLimit,
        exceedsLimit: distExceedsLimit,
      },
    },
    weapons,
    hygiene: {
      roguePngs: {
        textures: rogueTexturePngs,
        plates: roguePlatePngs,
        totalCount: allRoguePngs.length,
        ok: allRoguePngs.length === 0,
      },
      platesManifest: platesAudit,
    },
    summary: {
      weaponCount: weapons.length,
      withinBudgetCount: weapons.length - overBudgetWeapons.length,
      overBudgetCount: overBudgetWeapons.length,
      overBudgetWeapons: overBudgetWeapons.map((w) => w.weaponId),
      largestWeapon: largestWeapon
        ? {
            weaponId: largestWeapon.weaponId,
            totalBytes: largestWeapon.totalBytes,
            totalMb: largestWeapon.totalMb,
            budgetUsagePercent: largestWeapon.budgetUsagePercent,
          }
        : null,
      warnings,
      errors,
      ok: errors.length === 0,
    },
  };
}

export function formatHumanReport(report) {
  const lines = [];
  lines.push('===================================================================================');
  lines.push(' Digital Armory 3D — Asset & Bundle Budget Audit');
  lines.push('===================================================================================');
  lines.push('');
  lines.push('1. Directory Footprint');
  lines.push('-----------------------------------------------------------------------------------');
  lines.push(' Directory            | Exists | Files | Size         | Notes');
  lines.push('-----------------------------------------------------------------------------------');

  for (const dirName of PUBLIC_AUDIT_DIRS) {
    const d = report.directories.public[dirName];
    lines.push(
      ` ${`public/${dirName}`.padEnd(20)} | ${(d.exists ? 'yes' : 'no').padEnd(6)} | ${String(d.fileCount).padStart(5)} | ${formatBytes(d.bytes).padStart(12)} |`
    );
  }
  const pubTotal = report.directories.public.total;
  lines.push('-----------------------------------------------------------------------------------');
  lines.push(
    ` ${'public/ (total)'.padEnd(20)} | ${(pubTotal.exists ? 'yes' : 'no').padEnd(6)} | ${String(pubTotal.fileCount).padStart(5)} | ${formatBytes(pubTotal.bytes).padStart(12)} | All static assets`
  );

  const dist = report.directories.dist;
  const distNote = !dist.exists
    ? 'Not built yet (run npm run build)'
    : dist.exceedsLimit
      ? `FAIL: ${dist.githubPagesUsagePercent}% of 1 GB GitHub Pages limit`
      : dist.approachingLimit
        ? `WARN: ${dist.githubPagesUsagePercent}% of 1 GB (> ${report.thresholds.distWarnMb} MB)`
        : `${dist.githubPagesUsagePercent}% of 1 GB GitHub Pages limit`;
  lines.push(
    ` ${'dist/'.padEnd(20)} | ${(dist.exists ? 'yes' : 'no').padEnd(6)} | ${String(dist.fileCount).padStart(5)} | ${formatBytes(dist.bytes).padStart(12)} | ${distNote}`
  );
  lines.push('-----------------------------------------------------------------------------------');
  lines.push('');

  lines.push(
    `2. Per-Weapon GLB + Texture Budgets (Limit: <= ${report.thresholds.weaponBudgetMb} MB per exhibit)`
  );
  lines.push('-----------------------------------------------------------------------------------');
  lines.push(' Weapon           | GLB       | Textures (#)    | Total      | Usage  | Status');
  lines.push('-----------------------------------------------------------------------------------');

  const sortedWeapons = [...report.weapons].sort((a, b) => b.totalBytes - a.totalBytes);
  for (const w of sortedWeapons) {
    const texCol = `${formatBytes(w.textureBytes)} (${w.textureCount})`.padStart(15);
    const status = !w.glbExists || w.missingTextures.length > 0
      ? 'MISSING'
      : w.withinBudget
        ? 'PASS'
        : 'OVER';
    lines.push(
      ` ${w.weaponId.padEnd(16)} | ${formatBytes(w.glbBytes).padStart(9)} | ${texCol} | ${formatBytes(w.totalBytes).padStart(10)} | ${`${w.budgetUsagePercent.toFixed(1)}%`.padStart(6)} | ${status}`
    );
  }
  lines.push('-----------------------------------------------------------------------------------');

  if (report.summary.largestWeapon) {
    const lw = report.summary.largestWeapon;
    lines.push(
      ` Largest Exhibit : ${lw.weaponId} (${formatBytes(lw.totalBytes)} / ${lw.budgetUsagePercent.toFixed(1)}% of ${report.thresholds.weaponBudgetMb} MB budget)`
    );
  }
  lines.push(
    ` Weapon Budgets  : ${report.summary.withinBudgetCount}/${report.summary.weaponCount} within <= ${report.thresholds.weaponBudgetMb} MB`
  );

  if (report.hygiene) {
    const pngs = report.hygiene.roguePngs;
    const pm = report.hygiene.platesManifest;
    lines.push('');
    lines.push('3. Media Hygiene & Cycles Print Plates Parity');
    lines.push('-----------------------------------------------------------------------------------');
    lines.push(
      ` Zero-PNG Gate   : ${pngs.totalCount} rogue .png file(s) in textures/ & plates/ (${pngs.ok ? 'PASS' : 'FAIL'})`
    );
    if (pm.checked) {
      lines.push(
        ` Cycles Plates   : ${pm.manifestWeaponCount}/${pm.expectedWeaponCount} exhibits · ${pm.verifiedPlateFiles}/${pm.expectedTotalPlates} plates on disk (${pm.ok ? 'PASS' : 'FAIL'})`
      );
    } else {
      lines.push(' Cycles Plates   : skipped (no public/plates/manifest.json in target root)');
    }
    lines.push('-----------------------------------------------------------------------------------');
  }

  if (report.summary.warnings.length > 0) {
    lines.push('');
    lines.push('Warnings:');
    for (const w of report.summary.warnings) {
      lines.push(`  [WARN] ${w}`);
    }
  }
  if (report.summary.errors.length > 0) {
    lines.push('');
    lines.push('Errors:');
    for (const e of report.summary.errors) {
      lines.push(`  [FAIL] ${e}`);
    }
  }

  lines.push('');
  lines.push(`Result: ${report.summary.ok ? 'PASS' : 'FAIL'}`);
  lines.push('===================================================================================');
  return `${lines.join('\n')}\n`;
}

export function formatHelpText() {
  return `Digital Armory 3D — Asset & Bundle Budget Auditor

Usage:
  node scripts/audit_asset_budget.mjs [options]

Options:
  --json                 Emit structured JSON report to stdout
  --strict               Exit non-zero on warnings (including dist > 800 MB) as well as errors
  --weapon <id>          Audit a single weapon exhibit
  --max-weapon-mb <n>    Per-weapon GLB+texture budget in MB (default: ${DEFAULT_WEAPON_BUDGET_MB})
  --dist-warn-mb <n>     GitHub Pages dist/ warning threshold in MB (default: ${DEFAULT_DIST_WARN_MB})
  --root <dir>           Repository root directory override (default: repo root)
  -h, --help             Show this help text
`;
}

function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    process.stderr.write(`[assets:audit] ERROR: ${err.message}\n`);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatHelpText());
    process.exit(0);
  }

  const report = runAssetBudgetAudit(opts);

  if (opts.json) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
  } else {
    process.stdout.write(formatHumanReport(report));
  }

  const hasFatal = !report.summary.ok;
  const hasStrictWarn =
    opts.strict &&
    (report.directories.dist.approachingLimit || report.directories.dist.exceedsLimit);
  process.exit(hasFatal || hasStrictWarn ? 1 : 0);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main();
}

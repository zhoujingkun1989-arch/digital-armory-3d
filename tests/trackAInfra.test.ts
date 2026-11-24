import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  getConfiguredCdnBaseUrl,
  HEAVY_ASSET_DIRS,
  isHeavyMediaPath,
  normalizeCdnBaseUrl,
  resolveAppDeepLink,
  resolveAssetUrl,
  resolveHdriUrl,
  resolveModelUrl,
  resolveTextureUrl,
} from '../src/engine/utils/assetUrl';

const REPO_ROOT = path.resolve(__dirname, '..');
const KTX2_SCRIPT = path.join(REPO_ROOT, 'scripts', 'build_ktx2_textures.mjs');
const AUDIT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'audit_asset_budget.mjs');
const QA_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa_visual_gate.mjs');

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  vi.unstubAllEnvs();
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Track A — assetUrl.ts optional heavy-media CDN & subpath compatibility', () => {
  it('normalizes valid http(s) CDN base URLs and rejects empty or relative values', () => {
    expect(HEAVY_ASSET_DIRS).toEqual([
      'audio/',
      'textures/',
      'models/',
      'plates/',
      'hdri/',
    ]);

    expect(normalizeCdnBaseUrl(undefined)).toBeNull();
    expect(normalizeCdnBaseUrl(null)).toBeNull();
    expect(normalizeCdnBaseUrl('')).toBeNull();
    expect(normalizeCdnBaseUrl('   ')).toBeNull();
    expect(normalizeCdnBaseUrl('/relative/cdn')).toBeNull();
    expect(normalizeCdnBaseUrl('cdn.example.com/armory')).toBeNull();

    expect(normalizeCdnBaseUrl('https://cdn.example.com')).toBe(
      'https://cdn.example.com/'
    );
    expect(normalizeCdnBaseUrl('https://cdn.example.com/armory///')).toBe(
      'https://cdn.example.com/armory/'
    );
    expect(normalizeCdnBaseUrl('  http://127.0.0.1:9000/v6  ')).toBe(
      'http://127.0.0.1:9000/v6/'
    );
  });

  it('classifies heavy media directories accurately and keeps lightweight/same-origin assets local', () => {
    expect(isHeavyMediaPath('audio/ak15/story_act1_en.mp3')).toBe(true);
    expect(isHeavyMediaPath('/textures/ak15_v3_metal_albedo.webp')).toBe(true);
    expect(isHeavyMediaPath('./models/ztz99a.glb')).toBe(true);
    expect(isHeavyMediaPath('plates/manifest.json')).toBe(true);
    expect(isHeavyMediaPath('hdri/heavy_armor_hangar.hdr')).toBe(true);

    expect(isHeavyMediaPath('narrations/ak15.json')).toBe(false);
    expect(isHeavyMediaPath('sw.js')).toBe(false);
    expect(isHeavyMediaPath('draco/draco_decoder.wasm')).toBe(false);
    expect(isHeavyMediaPath('basis/basis_transcoder.wasm')).toBe(false);
    expect(isHeavyMediaPath('showcase/ak15-section.webp')).toBe(false);
    expect(isHeavyMediaPath('manifest.webmanifest')).toBe(false);
  });

  it('routes heavy media to VITE_CDN_ASSET_BASE_URL while preserving local root & subpath resolution', () => {
    const cdn = 'https://assets.digitalarmory.org/v6';
    vi.stubEnv('VITE_CDN_ASSET_BASE_URL', cdn);
    expect(getConfiguredCdnBaseUrl()).toBe('https://assets.digitalarmory.org/v6/');

    const sub = '/digital-armory-3d/';

    // Heavy media routes to CDN regardless of root '/' or subpath '/digital-armory-3d/'
    expect(resolveAssetUrl('audio/ak15/story_act1_zh.mp3', '/')).toBe(
      'https://assets.digitalarmory.org/v6/audio/ak15/story_act1_zh.mp3'
    );
    expect(resolveAssetUrl('audio/ak15/story_act1_zh.mp3', sub)).toBe(
      'https://assets.digitalarmory.org/v6/audio/ak15/story_act1_zh.mp3'
    );
    expect(resolveTextureUrl('ak15_v3_metal_albedo.png', sub)).toBe(
      'https://assets.digitalarmory.org/v6/textures/ak15_v3_metal_albedo.webp'
    );
    expect(resolveModelUrl('ztz99a.glb', sub)).toBe(
      'https://assets.digitalarmory.org/v6/models/ztz99a.glb'
    );
    expect(resolveHdriUrl('heavy_armor_hangar.hdr', sub)).toBe(
      'https://assets.digitalarmory.org/v6/hdri/heavy_armor_hangar.hdr'
    );
    expect(resolveAssetUrl('plates/ak15/hero.webp', sub)).toBe(
      'https://assets.digitalarmory.org/v6/plates/ak15/hero.webp'
    );

    // Subpath-prefixed heavy media path upgrades cleanly without duplicating subpath
    expect(
      resolveAssetUrl('/digital-armory-3d/textures/p08_v3_metal_normal.webp', sub)
    ).toBe('https://assets.digitalarmory.org/v6/textures/p08_v3_metal_normal.webp');

    // Non-heavy & same-origin assets remain on local subpath
    expect(resolveAssetUrl('narrations/ak15.json', sub)).toBe(
      '/digital-armory-3d/narrations/ak15.json'
    );
    expect(resolveAssetUrl('sw.js', sub)).toBe('/digital-armory-3d/sw.js');
    expect(resolveAssetUrl('draco/', sub)).toBe('/digital-armory-3d/draco/');
    expect(resolveAssetUrl('basis/', sub)).toBe('/digital-armory-3d/basis/');
    expect(resolveAssetUrl('showcase/ak15-section.webp', sub)).toBe(
      '/digital-armory-3d/showcase/ak15-section.webp'
    );

    // Explicit null override disables CDN cleanly
    expect(resolveModelUrl('ak15.glb', sub, null)).toBe(
      '/digital-armory-3d/models/ak15.glb'
    );

    // Deep links stay on app origin/subpath and are never routed to CDN
    expect(
      resolveAppDeepLink('?screen=workbench&weapon=ak15&cut=1', {
        origin: 'https://zhoujingkun1989-arch.github.io',
        baseOverride: sub,
      })
    ).toBe(
      'https://zhoujingkun1989-arch.github.io/digital-armory-3d/?screen=workbench&weapon=ak15&cut=1'
    );
  });

  it('remains 100% idempotent when resolvers are invoked repeatedly in local or CDN mode', () => {
    const sub = '/digital-armory-3d/';
    const cdn = 'https://cdn.example.com/media/';

    // Local root & subpath idempotency (CDN unset)
    const localModel = resolveModelUrl('m4a1.glb', sub, null);
    expect(localModel).toBe('/digital-armory-3d/models/m4a1.glb');
    expect(resolveModelUrl(localModel, sub, null)).toBe(localModel);
    expect(resolveAssetUrl(localModel, sub, null)).toBe(localModel);

    const localTex = resolveTextureUrl('m4a1_v3_receiver_albedo.png', '/', null);
    expect(localTex).toBe('/textures/m4a1_v3_receiver_albedo.webp');
    expect(resolveTextureUrl(localTex, '/', null)).toBe(localTex);

    // CDN idempotency
    const cdnTex = resolveTextureUrl('m4a1_v3_receiver_albedo.png', sub, cdn);
    expect(cdnTex).toBe(
      'https://cdn.example.com/media/textures/m4a1_v3_receiver_albedo.webp'
    );
    expect(resolveTextureUrl(cdnTex, sub, cdn)).toBe(cdnTex);
    expect(resolveAssetUrl(cdnTex, sub, cdn)).toBe(cdnTex);

    const cdnHdri = resolveHdriUrl('tactical_vault.hdr', '/', cdn);
    expect(cdnHdri).toBe('https://cdn.example.com/media/hdri/tactical_vault.hdr');
    expect(resolveHdriUrl(cdnHdri, '/', cdn)).toBe(cdnHdri);

    const cdnModel = resolveModelUrl('p08.glb', './', cdn);
    expect(cdnModel).toBe('https://cdn.example.com/media/models/p08.glb');
    expect(resolveModelUrl(cdnModel, './', cdn)).toBe(cdnModel);
  });
});

describe('Track A — scripts/build_ktx2_textures.mjs KTX2/Basis Universal pipeline', () => {
  it('supports --dry-run, --weapon (including winchester1894 alias), and --limit cleanly without mutating manifest', () => {
    const manifestPath = path.join(
      REPO_ROOT,
      'public',
      'textures',
      'ktx2-manifest.json'
    );
    const beforeManifest = fs.readFileSync(manifestPath, 'utf8');

    const fullDryOut = execFileSync(process.execPath, [KTX2_SCRIPT, '--dry-run'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const fullDry = JSON.parse(fullDryOut);
    expect(fullDry.dryRun).toBe(true);
    expect(fullDry.sourceTextureCount).toBeGreaterThanOrEqual(369);
    expect(fullDry.uastcLinearCount + fullDry.etc1sSrgbCount).toBe(
      fullDry.sourceTextureCount
    );
    expect(fullDry.manifestPath).toBe('public/textures/ktx2-manifest.json');

    const weaponDryOut = execFileSync(
      process.execPath,
      [KTX2_SCRIPT, '--dry-run', '--weapon', 'winchester1894', '--limit', '4'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const weaponDry = JSON.parse(weaponDryOut);
    expect(weaponDry.weaponFilter).toBe('winchester1894');
    expect(weaponDry.limit).toBe(4);
    expect(weaponDry.matchedTextureCount).toBe(9);
    expect(weaponDry.sourceTextureCount).toBe(4);
    expect(weaponDry.samplePlan).toHaveLength(4);

    for (const item of weaponDry.samplePlan) {
      expect(item.fileName.startsWith('win94_v3_')).toBe(true);
      if (
        item.fileName.includes('_normal') ||
        item.fileName.includes('_roughness') ||
        item.fileName.includes('_orm')
      ) {
        expect(item.mode).toBe('UASTC_LINEAR');
        expect(item.toktxArgs).toContain('uastc');
        expect(item.toktxArgs).toContain('linear');
      } else {
        expect(item.mode).toBe('ETC1S_SRGB');
        expect(item.toktxArgs).toContain('etc1s');
        expect(item.toktxArgs).toContain('srgb');
      }
    }

    // Dry-run must leave existing manifest byte-identical
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(beforeManifest);
  });

  it('preserves existing manifest and prints actionable install hint when toktx is unavailable', () => {
    const tmpRoot = makeTempDir('armory-ktx2-notoktx-');
    const texDir = path.join(tmpRoot, 'public', 'textures');
    fs.mkdirSync(texDir, { recursive: true });
    fs.writeFileSync(path.join(texDir, 'ak15_v3_metal_albedo.webp'), Buffer.from('RIFF0000WEBP'));

    const existingManifestContent = `${JSON.stringify(
      {
        version: 1,
        transcoderPath: 'basis/',
        entries: { 'custom.webp': 'ktx2/custom.ktx2' },
      },
      null,
      2
    )}\n`;
    const manifestPath = path.join(texDir, 'ktx2-manifest.json');
    fs.writeFileSync(manifestPath, existingManifestContent, 'utf8');

    const emptyBinDir = makeTempDir('armory-empty-bin-');
    const output = execFileSync(
      process.execPath,
      [KTX2_SCRIPT, '--root', tmpRoot],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${emptyBinDir}:/usr/bin:/bin`,
        },
      }
    );

    expect(output).toContain('toktx');
    expect(output).toContain('brew install ktx');
    expect(output).toContain('KhronosGroup/KTX-Software/releases');
    // Existing manifest MUST NOT be clobbered when toktx is absent
    expect(fs.readFileSync(manifestPath, 'utf8')).toBe(existingManifestContent);
  });

  it('invokes toktx with UASTC linear & ETC1S sRGB flags via real WebP decoding and populates manifest stats', () => {
    const tmpRoot = makeTempDir('armory-ktx2-exec-');
    const texDir = path.join(tmpRoot, 'public', 'textures');
    const binDir = makeTempDir('armory-ktx2-bin-');
    fs.mkdirSync(texDir, { recursive: true });

    // Copy 3 real small WebP textures (albedo + normal + roughness/ORM) from the repo
    const realTexDir = path.join(REPO_ROOT, 'public', 'textures');
    const sampleFiles = [
      'win94_v3_receiver_albedo.webp',
      'win94_v3_receiver_normal.webp',
      'win94_v3_receiver_roughness.webp',
    ];
    for (const file of sampleFiles) {
      fs.copyFileSync(path.join(realTexDir, file), path.join(texDir, file));
    }

    // Create an executable mock `toktx` that verifies its input PNG is a real PNG, logs args, and writes a fake KTX2 file
    const logPath = path.join(tmpRoot, 'toktx-invocations.jsonl');
    const fakeToktxPath = path.join(binDir, 'toktx');
    fs.writeFileSync(
      fakeToktxPath,
      `#!${process.execPath}
import fs from 'node:fs';
const args = process.argv.slice(2);
const outPath = args[args.length - 2];
const inPath = args[args.length - 1];
const pngHeader = fs.readFileSync(inPath).subarray(0, 8);
const isPng = pngHeader[0] === 0x89 && pngHeader[1] === 0x50 && pngHeader[2] === 0x4e && pngHeader[3] === 0x47;
if (!isPng) {
  console.error('Input was not a valid decoded PNG:', inPath);
  process.exit(1);
}
fs.appendFileSync(${JSON.stringify(logPath)}, JSON.stringify({ args, outPath, inPath }) + '\\n');
// Write a deterministic fake KTX2 header + small payload so byte savings are measurable
const ktx2Magic = Buffer.from([0xab, 0x4b, 0x54, 0x58, 0x20, 0x32, 0x30, 0xbb, 0x0d, 0x0a, 0x1a, 0x0a]);
fs.writeFileSync(outPath, Buffer.concat([ktx2Magic, Buffer.alloc(4096, 0x42)]));
`,
      { mode: 0o755 }
    );

    const stdout = execFileSync(
      process.execPath,
      [KTX2_SCRIPT, '--root', tmpRoot, '--limit', '3'],
      {
        cwd: REPO_ROOT,
        encoding: 'utf8',
        env: {
          ...process.env,
          PATH: `${binDir}:${process.env.PATH ?? ''}`,
        },
      }
    );

    expect(stdout).toContain('encoded=3');
    expect(stdout).toContain('failed=0');

    const invocations = fs
      .readFileSync(logPath, 'utf8')
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line));
    expect(invocations).toHaveLength(3);

    const albedoCall = invocations.find((c) =>
      c.outPath.endsWith('win94_v3_receiver_albedo.ktx2')
    );
    const normalCall = invocations.find((c) =>
      c.outPath.endsWith('win94_v3_receiver_normal.ktx2')
    );
    const roughCall = invocations.find((c) =>
      c.outPath.endsWith('win94_v3_receiver_roughness.ktx2')
    );

    expect(albedoCall?.args).toContain('etc1s');
    expect(albedoCall?.args).toContain('srgb');
    expect(normalCall?.args).toContain('uastc');
    expect(normalCall?.args).toContain('linear');
    expect(roughCall?.args).toContain('uastc');
    expect(roughCall?.args).toContain('linear');

    const manifest = JSON.parse(
      fs.readFileSync(path.join(texDir, 'ktx2-manifest.json'), 'utf8')
    );
    expect(manifest.version).toBe(1);
    expect(manifest.transcoderPath).toBe('basis/');
    expect(Object.keys(manifest.entries)).toEqual(sampleFiles.sort());
    expect(manifest.entries['win94_v3_receiver_albedo.webp']).toBe(
      'ktx2/win94_v3_receiver_albedo.ktx2'
    );
    expect(manifest.stats.publishedCount).toBe(3);
    expect(manifest.stats.encodedCount).toBe(3);
    expect(manifest.stats.uastcLinearCount).toBe(2);
    expect(manifest.stats.etc1sSrgbCount).toBe(1);
    expect(manifest.stats.sourceWebpBytes).toBeGreaterThan(50_000);
    expect(manifest.stats.ktx2Bytes).toBe(3 * (12 + 4096));
    expect(manifest.stats.savingsBytes).toBe(
      manifest.stats.sourceWebpBytes - manifest.stats.ktx2Bytes
    );
    expect(manifest.stats.savingsPercent).toBeGreaterThan(0);

    // Temp PNG inputs must have been cleaned up after encoding
    for (const inv of invocations) {
      expect(fs.existsSync(inv.inPath)).toBe(false);
    }
  });
});

describe('Track A — scripts/audit_asset_budget.mjs asset & bundle auditor', () => {
  it('outputs valid --json audit against the repository verifying all 6 public dirs and all 29 exhibits <= 12 MB', () => {
    const rawJson = execFileSync(
      process.execPath,
      [AUDIT_SCRIPT, '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const report = JSON.parse(rawJson);

    expect(report.thresholds.weaponBudgetMb).toBe(12);
    expect(report.thresholds.distWarnMb).toBe(800);
    expect(report.thresholds.distHardLimitMb).toBe(1024);

    for (const dirName of [
      'audio',
      'textures',
      'models',
      'plates',
      'hdri',
      'narrations',
    ]) {
      const stats = report.directories.public[dirName];
      expect(stats.exists, `public/${dirName} should exist`).toBe(true);
      expect(stats.bytes, `public/${dirName} should be non-empty`).toBeGreaterThan(0);
      expect(stats.fileCount, `public/${dirName} should contain files`).toBeGreaterThan(0);
    }

    expect(report.summary.weaponCount).toBeGreaterThanOrEqual(29);
    expect(report.summary.overBudgetCount).toBe(0);
    expect(report.summary.withinBudgetCount).toBe(report.summary.weaponCount);
    expect(report.summary.ok).toBe(true);

    const win94 = report.weapons.find(
      (w: { weaponId: string }) => w.weaponId === 'winchester1894'
    );
    expect(win94).toBeDefined();
    expect(win94.textureCount).toBe(9);
    expect(win94.withinBudget).toBe(true);

    // Human-readable mode also runs cleanly
    const humanOut = execFileSync(process.execPath, [AUDIT_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(humanOut).toContain('Digital Armory 3D — Asset & Bundle Budget Audit');
    expect(humanOut).toContain('Result: PASS');
  });

  it('flags per-weapon over-budget violations and dist/ approaching GitHub Pages limit warnings', () => {
    const tmpRoot = makeTempDir('armory-audit-fixture-');
    fs.mkdirSync(path.join(tmpRoot, 'public', 'models'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'public', 'textures'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'dist'), { recursive: true });

    // Create a 12 KB GLB + 12 KB WebP = 24 KB weapon (~0.023 MB) and 30 KB dist/
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'models', 'testgun.glb'),
      Buffer.alloc(12 * 1024, 1)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'textures', 'testgun_v3_metal_albedo.webp'),
      Buffer.alloc(12 * 1024, 2)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'dist', 'bundle.bin'),
      Buffer.alloc(30 * 1024, 3)
    );

    // 1. Trigger dist warning (> 0.01 MB) while weapon is within 1 MB budget
    const warnOut = execFileSync(
      process.execPath,
      [
        AUDIT_SCRIPT,
        '--root',
        tmpRoot,
        '--json',
        '--max-weapon-mb',
        '1',
        '--dist-warn-mb',
        '0.01',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const warnReport = JSON.parse(warnOut);
    expect(warnReport.summary.ok).toBe(true);
    expect(warnReport.directories.dist.approachingLimit).toBe(true);
    expect(
      warnReport.summary.warnings.some((w: string) =>
        w.includes('GitHub Pages warning threshold')
      )
    ).toBe(true);

    // 2. Trigger per-weapon over-budget violation (0.023 MB > 0.01 MB) -> exits with status 1
    let failExitCode = 0;
    let failStdout = '';
    try {
      execFileSync(
        process.execPath,
        [
          AUDIT_SCRIPT,
          '--root',
          tmpRoot,
          '--json',
          '--max-weapon-mb',
          '0.01',
        ],
        { cwd: REPO_ROOT, encoding: 'utf8' }
      );
    } catch (err) {
      const e = err as { status?: number; stdout?: string };
      failExitCode = e.status ?? 0;
      failStdout = e.stdout ?? '';
    }
    expect(failExitCode).toBe(1);
    const failReport = JSON.parse(failStdout);
    expect(failReport.summary.ok).toBe(false);
    expect(failReport.summary.overBudgetWeapons).toEqual(['testgun']);
  });
});

describe('Track A — scripts/qa_visual_gate.mjs CLI & target planning', () => {
  it('plans 1920x1080 targets cleanly in --dry-run across --weapons, --screens, and --cut', () => {
    const out = execFileSync(
      process.execPath,
      [
        QA_SCRIPT,
        '--dry-run',
        '--url',
        'http://127.0.0.1:4173',
        '--weapons',
        'ak15,ztz99a',
        '--screens',
        'armory,cartridges',
        '--cut',
        '--format',
        'jpg',
        '--out',
        'exports/qa-dry-test',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );

    const plan = JSON.parse(out);
    expect(plan.dryRun).toBe(true);
    expect(plan.viewport).toEqual({
      width: 1920,
      height: 1080,
      deviceScaleFactor: 1,
    });
    expect(plan.format).toBe('jpg');
    expect(plan.targets).toHaveLength(4);
    expect(plan.targets.map((t: { id: string }) => t.id)).toEqual([
      'screen-armory',
      'screen-cartridges',
      'workbench-ak15-cut',
      'workbench-ztz99a-cut',
    ]);
    expect(plan.targets[2].url).toBe(
      'http://127.0.0.1:4173/?screen=workbench&weapon=ak15&cut=1'
    );
    expect(plan.targets[2].cut).toBe(true);
    expect(plan.targets[2].fileName).toBe('workbench-ak15-cut.jpg');
  });
});

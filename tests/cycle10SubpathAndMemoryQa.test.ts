import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

const REPO_ROOT = path.resolve(__dirname, '..');
const SUBPATH_SCRIPT = path.join(
  REPO_ROOT,
  'scripts',
  'qa_subpath_and_memory.mjs'
);

interface SubpathQaModule {
  DEFAULT_SUBPATH_BASE: string;
  SUBPATH_AUDIT_ROUTES: ReadonlyArray<{
    id: string;
    screen: string;
    query: string;
    expectsWebgl: boolean;
  }>;
  SOAK_EXHIBIT_SEQUENCE: ReadonlyArray<string>;
  DEFAULT_MEMORY_SOAK_LIMITS: {
    maxCachedWeapons: number;
    maxEndGeometries: number;
    maxEndTextures: number;
    maxPostLruGeoDelta: number;
    maxPostLruTexDelta: number;
    maxJsHeapGrowthMb: number;
  };
  normalizeBasePath: (raw: string) => string;
  isRogueRootAssetPath: (pathname: string, basePath?: string) => boolean;
  buildSubpathAuditTargets: (
    origin: string,
    basePath?: string
  ) => Array<{ id: string; screen: string; url: string; expectsWebgl: boolean }>;
  parseSubpathCliArgs: (argv: string[]) => {
    basePath: string;
    skipBuild: boolean;
    buildDir: string | null;
    runSubpath: boolean;
    runSoak: boolean;
    json: boolean;
    dryRun: boolean;
    help: boolean;
  };
  evaluateMemorySoakBounds: (
    samples: Array<Record<string, unknown>>,
    opts?: Record<string, unknown>
  ) => {
    passed: boolean;
    reasons: string[];
    peak: Record<string, number | null> | null;
    deltas: Record<string, number | null> | null;
  };
  formatSubpathSummaryTable: (report: Record<string, unknown>) => string;
  startStrictSubpathServer: (
    distDir: string,
    basePath?: string
  ) => Promise<{
    origin: string;
    port: number;
    basePath: string;
    setRecorder: (
      rec: { rogueRootRequests: string[]; missingFiles: string[] } | null
    ) => void;
    stop: () => Promise<void>;
  }>;
}

async function loadSubpathModule(): Promise<SubpathQaModule> {
  const href = pathToFileURL(SUBPATH_SCRIPT).href;
  return (await import(/* @vite-ignore */ href)) as SubpathQaModule;
}

describe('Cycle 10A · Subpath /digital-armory-3d/ Zero-404 & WebGL Memory Soak Harness', () => {
  it('registers npm run qa:subpath, passes node --check, prints --help, and plans all 12 subpath routes + 12-exhibit soak via --dry-run --json', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['qa:subpath']).toBe(
      'node scripts/qa_subpath_and_memory.mjs'
    );

    // Syntax check
    execFileSync(process.execPath, ['--check', SUBPATH_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    // Help text check
    const helpOut = execFileSync(process.execPath, [SUBPATH_SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(helpOut).toContain('--base-path');
    expect(helpOut).toContain('--skip-build');
    expect(helpOut).toContain('--soak');
    expect(helpOut).toContain('--dry-run');
    expect(helpOut).toContain('--json');

    // Dry-run JSON plan
    const dryRaw = execFileSync(
      process.execPath,
      [SUBPATH_SCRIPT, '--dry-run', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const plan = JSON.parse(dryRaw) as {
      dryRun: boolean;
      basePath: string;
      runSubpath: boolean;
      runSoak: boolean;
      subpathRouteCount: number;
      subpathTargets: Array<{ id: string; url: string }>;
      soakSequence: string[];
    };

    expect(plan.dryRun).toBe(true);
    expect(plan.basePath).toBe('/digital-armory-3d/');
    expect(plan.runSubpath).toBe(true);
    expect(plan.runSoak).toBe(true);
    expect(plan.subpathRouteCount).toBe(12);
    expect(plan.subpathTargets.map((t) => t.id)).toEqual([
      'subpath:showcase',
      'subpath:armory',
      'subpath:wb_ak15',
      'subpath:wb_deagle_cut',
      'subpath:wb_ztz99a',
      'subpath:wb_gau8',
      'subpath:cartridges',
      'subpath:ballistics',
      'subpath:split_showdown',
      'subpath:panel_armor',
      'subpath:panel_scalewall',
      'subpath:panel_recoil',
    ]);
    for (const t of plan.subpathTargets) {
      expect(t.url.startsWith('http://127.0.0.1:4173/digital-armory-3d/?')).toBe(
        true
      );
    }

    expect(plan.soakSequence).toEqual([
      'ak15',
      'deagle',
      'garand',
      'python',
      'mg42',
      'k98k',
      'thompson',
      'an94',
      'g11',
      'gau8',
      'ztz99a',
      'ak15',
    ]);
  });

  it('normalizes subpath prefixes, detects rogue root-path asset requests, and enforces strict 404 isolation in the local static server', async () => {
    const mod = await loadSubpathModule();

    expect(mod.normalizeBasePath('digital-armory-3d')).toBe(
      '/digital-armory-3d/'
    );
    expect(mod.normalizeBasePath('/digital-armory-3d')).toBe(
      '/digital-armory-3d/'
    );
    expect(mod.normalizeBasePath('/')).toBe('/');

    // Rogue root-path assets outside /digital-armory-3d/ MUST be flagged
    for (const roguePath of [
      '/models/ak15.glb',
      '/textures/ak15_v3_metal_albedo.webp',
      '/audio/ak15_overview_en.mp3',
      '/plates/ak15/cover_hero.webp',
      '/hdri/heavy_armor_hangar.hdr',
      '/draco/draco_decoder.wasm',
      '/sw.js',
    ]) {
      expect(
        mod.isRogueRootAssetPath(roguePath, '/digital-armory-3d/'),
        `Expected ${roguePath} to be flagged as rogue root path`
      ).toBe(true);
    }

    // Properly prefixed subpath assets MUST pass
    for (const validPath of [
      '/digital-armory-3d/',
      '/digital-armory-3d/index.html',
      '/digital-armory-3d/models/ak15.glb',
      '/digital-armory-3d/textures/ztz99a_v3_hull_albedo.webp',
      '/digital-armory-3d/hdri/heavy_armor_hangar.hdr',
    ]) {
      expect(
        mod.isRogueRootAssetPath(validPath, '/digital-armory-3d/'),
        `Expected ${validPath} to be allowed under subpath`
      ).toBe(false);
    }
    expect(mod.isRogueRootAssetPath('/models/ak15.glb', '/')).toBe(false);

    // Live strict HTTP subpath server smoke test
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-subpath-test-'));
    let server: Awaited<ReturnType<SubpathQaModule['startStrictSubpathServer']>> | null =
      null;
    try {
      fs.writeFileSync(path.join(tmpDir, 'index.html'), '<!doctype html><html>ok</html>');
      fs.mkdirSync(path.join(tmpDir, 'models'), { recursive: true });
      fs.writeFileSync(path.join(tmpDir, 'models', 'sample.glb'), 'glTF');

      server = await mod.startStrictSubpathServer(tmpDir, '/digital-armory-3d/');
      const recorder = { rogueRootRequests: [] as string[], missingFiles: [] as string[] };
      server.setRecorder(recorder);

      const okHtml = await fetch(`${server.origin}/digital-armory-3d/?screen=armory`);
      expect(okHtml.status).toBe(200);
      expect(await okHtml.text()).toContain('ok');

      const okGlb = await fetch(`${server.origin}/digital-armory-3d/models/sample.glb`);
      expect(okGlb.status).toBe(200);

      const rogueRes = await fetch(`${server.origin}/models/sample.glb`);
      expect(rogueRes.status).toBe(404);
      expect(recorder.rogueRootRequests).toContain('GET /models/sample.glb');

      const missingRes = await fetch(`${server.origin}/digital-armory-3d/models/missing.glb`);
      expect(missingRes.status).toBe(404);
      expect(recorder.missingFiles).toContain('GET /digital-armory-3d/models/missing.glb');
    } finally {
      await server?.stop();
      fs.rmSync(tmpDir, { recursive: true, force: true });
    }
  });

  it('evaluates 12-exhibit WebGL memory soak bounds accurately (passes bounded LRU plateau, catches leaks, context loss, reloads & rogue fetches)', async () => {
    const mod = await loadSubpathModule();

    const healthySamples = [
      { step: 1, weaponId: 'ak15', switchMs: 2800, geometries: 60, textures: 43, programs: 52, drawCalls: 145, cachedWeapons: 1, pbrTextures: 111, jsHeapMb: 13.3 },
      { step: 2, weaponId: 'deagle', switchMs: 3100, geometries: 85, textures: 54, programs: 44, drawCalls: 120, cachedWeapons: 2, pbrTextures: 202, jsHeapMb: 14.4 },
      { step: 3, weaponId: 'garand', switchMs: 2300, geometries: 112, textures: 65, programs: 44, drawCalls: 125, cachedWeapons: 3, pbrTextures: 293, jsHeapMb: 15.2 },
      { step: 4, weaponId: 'python', switchMs: 2250, geometries: 138, textures: 73, programs: 46, drawCalls: 118, cachedWeapons: 4, pbrTextures: 354, jsHeapMb: 15.7 },
      { step: 5, weaponId: 'mg42', switchMs: 3200, geometries: 161, textures: 84, programs: 43, drawCalls: 130, cachedWeapons: 5, pbrTextures: 445, jsHeapMb: 16.0 },
      { step: 6, weaponId: 'k98k', switchMs: 2300, geometries: 189, textures: 86, programs: 44, drawCalls: 126, cachedWeapons: 6, pbrTextures: 445, jsHeapMb: 16.6 },
      { step: 7, weaponId: 'thompson', switchMs: 2260, geometries: 186, textures: 88, programs: 43, drawCalls: 137, cachedWeapons: 6, pbrTextures: 445, jsHeapMb: 16.9 },
      { step: 8, weaponId: 'an94', switchMs: 3280, geometries: 192, textures: 90, programs: 44, drawCalls: 140, cachedWeapons: 6, pbrTextures: 445, jsHeapMb: 17.5 },
      { step: 9, weaponId: 'g11', switchMs: 2600, geometries: 191, textures: 95, programs: 44, drawCalls: 135, cachedWeapons: 6, pbrTextures: 475, jsHeapMb: 17.9 },
      { step: 10, weaponId: 'gau8', switchMs: 3210, geometries: 191, textures: 103, programs: 43, drawCalls: 142, cachedWeapons: 6, pbrTextures: 475, jsHeapMb: 17.8 },
      { step: 11, weaponId: 'ztz99a', switchMs: 3980, geometries: 193, textures: 105, programs: 41, drawCalls: 150, cachedWeapons: 6, pbrTextures: 475, jsHeapMb: 18.2 },
      { step: 12, weaponId: 'ak15', switchMs: 2250, geometries: 200, textures: 110, programs: 45, drawCalls: 145, cachedWeapons: 6, pbrTextures: 475, jsHeapMb: 18.6 },
    ];

    const passEval = mod.evaluateMemorySoakBounds(healthySamples, {
      contextLosses: 0,
      singleTabPreserved: true,
    });
    expect(passEval.passed).toBe(true);
    expect(passEval.reasons).toEqual([]);
    expect(passEval.peak?.cachedWeapons).toBe(6);
    expect(passEval.deltas?.postLruGeometries).toBe(14);
    expect(passEval.deltas?.postLruTextures).toBe(22);

    // Context loss fails immediately
    const ctxLossEval = mod.evaluateMemorySoakBounds(healthySamples, {
      contextLosses: 1,
    });
    expect(ctxLossEval.passed).toBe(false);
    expect(ctxLossEval.reasons.some((r) => r.includes('WebGL context lost'))).toBe(
      true
    );

    // Unbounded geometry leak fails
    const leakedSamples = healthySamples.map((s, idx) =>
      idx === healthySamples.length - 1
        ? { ...s, geometries: 720, cachedWeapons: 11 }
        : s
    );
    const leakEval = mod.evaluateMemorySoakBounds(leakedSamples);
    expect(leakEval.passed).toBe(false);
    expect(leakEval.reasons.some((r) => r.includes('GPU geometries'))).toBe(true);
    expect(leakEval.reasons.some((r) => r.includes('cachedWeapons peak'))).toBe(
      true
    );

    // Unexpected reload + rogue root request fails
    const reloadEval = mod.evaluateMemorySoakBounds(healthySamples, {
      singleTabPreserved: false,
      rogueRootRequests: ['GET /models/ak15.glb'],
    });
    expect(reloadEval.passed).toBe(false);
    expect(reloadEval.reasons.some((r) => r.includes('full page reload'))).toBe(
      true
    );
    expect(reloadEval.reasons.some((r) => r.includes('rogueRootRequests=1'))).toBe(
      true
    );

    // Table formatter renders cleanly
    const table = mod.formatSubpathSummaryTable({
      basePath: '/digital-armory-3d/',
      subpath: {
        totalRoutes: 1,
        passedCount: 1,
        totalRogueRootRequests: 0,
        totalFailedRequests: 0,
        results: [
          {
            id: 'subpath:wb_ak15',
            screen: 'workbench',
            loadMs: 2349,
            consoleErr: 0,
            pageErr: 0,
            failedReq: 0,
            rogueRootReq: 0,
            brokenImgs: 0,
            passed: true,
          },
        ],
      },
      memorySoak: {
        passed: true,
        contextLosses: 0,
        samples: healthySamples,
        evaluation: passEval,
      },
    });
    expect(table).toContain('subpath:wb_ak15');
    expect(table).toContain('Soak Summary    : PASS');
    expect(table).toContain('peakGeo=200');
  });
});

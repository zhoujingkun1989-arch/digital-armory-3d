import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { beforeAll, describe, expect, it } from 'vitest';
import {
  ARMOR_HALL_OFFLINE_IDS,
  buildExhibitOfflineAssetUrls,
  FEATURED_LEGENDS_OFFLINE_IDS,
  OFFLINE_MUSEUM_CACHE_NAME,
  OFFLINE_RUNTIME_CACHE_NAME,
  summarizeOfflinePack,
} from '../src/engine/offline/offlineMuseumManager';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import type { WeaponId } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const SW_PATH = path.join(PUBLIC_DIR, 'sw.js');
const CAPTURE_SCRIPT_PATH = path.join(
  REPO_ROOT,
  'scripts',
  'capture_flagship_docs_screenshots.mjs'
);

interface DocShotSpec {
  id: string;
  filename: string;
  group: 'core' | 'sculptures' | 'labs';
  label: string;
  query: string;
  weaponId: string | null;
  expectsWebgl: boolean;
  postAction?: string;
}

interface DocsCaptureModule {
  DEFAULT_DOCS_OUT_DIR: string;
  DEFAULT_JPEG_QUALITY: number;
  MIN_NON_BG_PIXEL_RATIO: number;
  VALID_SHOT_GROUPS: readonly string[];
  FLAGSHIP_DOC_SHOTS: readonly DocShotSpec[];
  parseCliArgs: (argv?: string[]) => {
    group: string;
    only: string[] | null;
    outDir: string;
    quality: number;
    lang: string;
    dryRun: boolean;
    json: boolean;
    help: boolean;
  };
  selectDocShots: (options?: { group?: string; only?: string[] | null }) => DocShotSpec[];
  buildDocShotTargets: (
    origin: string,
    options?: { group?: string; only?: string[] | null; outDir?: string; lang?: string }
  ) => Array<DocShotSpec & { url: string; outPath: string; isHeavy: boolean }>;
  evaluateCapturedShot: (
    shot: { id: string; filename: string; group: string; weaponId: string | null; url: string; outPath: string },
    metrics: {
      width: number;
      height: number;
      bytes: number;
      nonBgPixelRatio: number | null;
      consoleErrorCount: number;
      pageErrorCount: number;
      failedRequestCount: number;
      durationMs: number;
    }
  ) => { pass: boolean; issues: string[] };
}

let captureMod: DocsCaptureModule;

beforeAll(async () => {
  captureMod = (await import(
    pathToFileURL(CAPTURE_SCRIPT_PATH).href
  )) as DocsCaptureModule;
});

describe('Cycle 16A · PWA Service Worker, Offline Pack Integrity & Flagship 1920×1080 Docs Capture Engine', () => {
  describe('PWA Service Worker (public/sw.js) Hardening Contracts', () => {
    const swSource = fs.readFileSync(SW_PATH, 'utf-8');

    it('passes Node syntax check and matches offlineMuseumManager cache versions', () => {
      expect(() =>
        execFileSync(process.execPath, ['--check', SW_PATH], {
          cwd: REPO_ROOT,
          stdio: 'pipe',
        })
      ).not.toThrow();

      expect(swSource).toContain(
        `const OFFLINE_CACHE_NAME = '${OFFLINE_MUSEUM_CACHE_NAME}'`
      );
      expect(swSource).toContain(
        `const RUNTIME_CACHE_NAME = '${OFFLINE_RUNTIME_CACHE_NAME}'`
      );
      expect(OFFLINE_MUSEUM_CACHE_NAME).toBe('digital-armory-offline-v6-0');
      expect(OFFLINE_RUNTIME_CACHE_NAME).toBe('digital-armory-runtime-v6-0');
    });

    it('enforces protected offline pack separation, bounded FIFO runtime eviction, Range/206 skip, subpath scope & HTTP 503 fallback', () => {
      expect(swSource).toMatch(/const RUNTIME_CACHE_MAX_ENTRIES = 120/);
      expect(swSource).toMatch(/function trimRuntimeCache\(/);
      expect(swSource).toMatch(/keys\.slice\(0,\s*excess\)/);

      // Range / 206 Partial Content guard
      expect(swSource).toMatch(/req\.headers\.has\(['"]range['"]\)/);
      expect(swSource).toMatch(/res\.status !== 200/);

      // Safe HTTP 503 fallback instead of resolving undefined
      expect(swSource).toMatch(/function createOfflineResponse\(\)/);
      expect(swSource).toMatch(/status:\s*503/);
      expect(swSource).toMatch(/\.catch\(\(\)\s*=>\s*createOfflineResponse\(\)\)/);

      // Subpath scope guard for both `/` and `/digital-armory-3d/`
      expect(swSource).toContain('self.registration.scope');
    });
  });

  describe('Offline Museum Pack On-Disk Asset Verification (All 34 Exhibits)', () => {
    const allWeaponIds = WEAPON_MANIFESTS.map((m) => m.id) as WeaponId[];

    it('resolves 100% real existing files inside public/ for every exhibit (0 dangling/404 paths)', () => {
      expect(allWeaponIds).toHaveLength(34);

      const missingFiles: string[] = [];
      for (const weaponId of allWeaponIds) {
        const manifest = buildExhibitOfflineAssetUrls(weaponId, '/');
        expect(manifest.urls.length).toBeGreaterThanOrEqual(8);
        expect(manifest.estimatedMb).toBeGreaterThan(2);

        for (const url of manifest.urls) {
          expect(url.startsWith('/')).toBe(true);
          expect(url).not.toContain('_v3_hull_orm.webp');
          expect(url).not.toMatch(/\/steel_normal\.webp$/);

          const diskPath = path.join(PUBLIC_DIR, url.replace(/^\/+/, ''));
          if (!fs.existsSync(diskPath)) {
            missingFiles.push(`${weaponId}: ${url}`);
          }
        }
      }

      expect(missingFiles).toEqual([]);
    });

    it('prefixes subpath URLs cleanly for /digital-armory-3d/ and deduplicates curated multi-exhibit packs', () => {
      const subManifest = buildExhibitOfflineAssetUrls('ztz99a', '/digital-armory-3d/');
      expect(subManifest.urls.every((u) => u.startsWith('/digital-armory-3d/'))).toBe(true);
      expect(subManifest.urls.some((u) => u.endsWith('/hdri/heavy_armor_hangar.hdr'))).toBe(true);
      expect(subManifest.urls.some((u) => u.endsWith('/textures/armor_detail_normal.webp'))).toBe(true);

      const legendsPack = summarizeOfflinePack(FEATURED_LEGENDS_OFFLINE_IDS, '/');
      expect(legendsPack.weaponIds).toHaveLength(5);
      expect(legendsPack.uniqueUrls.length).toBeLessThan(legendsPack.totalAssetRequests);
      expect(legendsPack.estimatedMb).toBeGreaterThan(15);

      const armorPack = summarizeOfflinePack(ARMOR_HALL_OFFLINE_IDS, '/');
      expect(armorPack.weaponIds).toHaveLength(4);
      expect(armorPack.estimatedMb).toBeGreaterThan(35);
    });
  });

  describe('Flagship 1920×1080 Documentation Screenshot Engine Contracts', () => {
    it('registers "docs:screenshots" in package.json and passes node --check + --help', () => {
      const pkg = JSON.parse(
        fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf-8')
      ) as { scripts: Record<string, string> };
      expect(pkg.scripts['docs:screenshots']).toBe(
        'node scripts/capture_flagship_docs_screenshots.mjs'
      );

      expect(() =>
        execFileSync(process.execPath, ['--check', CAPTURE_SCRIPT_PATH], {
          cwd: REPO_ROOT,
          stdio: 'pipe',
        })
      ).not.toThrow();

      const helpText = execFileSync(
        process.execPath,
        [CAPTURE_SCRIPT_PATH, '--help'],
        { cwd: REPO_ROOT, encoding: 'utf-8' }
      );
      expect(helpText).toContain('--group <name>');
      expect(helpText).toContain('--only <csv>');
      expect(helpText).toContain('--out-dir <dir>');
      expect(helpText).toContain('--quality <50-100>');
      expect(helpText).toContain('--dry-run');
      expect(helpText).toContain('--json');
    });

    it('emits valid 32-shot JSON manifest on --dry-run --json with unique filenames and valid WeaponIds', () => {
      const stdout = execFileSync(
        process.execPath,
        [CAPTURE_SCRIPT_PATH, '--dry-run', '--json'],
        { cwd: REPO_ROOT, encoding: 'utf-8' }
      );
      const plan = JSON.parse(stdout) as {
        dryRun: boolean;
        viewport: string;
        quality: number;
        totalShots: number;
        shots: Array<{
          id: string;
          filename: string;
          group: string;
          weaponId: string | null;
          isHeavy: boolean;
          url: string;
        }>;
      };

      expect(plan.dryRun).toBe(true);
      expect(plan.viewport).toBe('1920x1080');
      expect(plan.quality).toBe(92);
      expect(plan.totalShots).toBe(32);
      expect(plan.shots).toHaveLength(32);

      const idSet = new Set<string>();
      const fileSet = new Set<string>();
      const validWeaponIds = new Set<string>(WEAPON_MANIFESTS.map((m) => m.id));

      for (const shot of plan.shots) {
        expect(idSet.has(shot.id)).toBe(false);
        expect(fileSet.has(shot.filename)).toBe(false);
        idSet.add(shot.id);
        fileSet.add(shot.filename);
        expect(shot.filename.endsWith('.jpg')).toBe(true);
        if (shot.weaponId !== null) {
          expect(validWeaponIds.has(shot.weaponId)).toBe(true);
        }
      }

      // Check core, sculptures, and labs counts + key README filenames
      expect(plan.shots.filter((s) => s.group === 'core')).toHaveLength(5);
      expect(plan.shots.filter((s) => s.group === 'sculptures')).toHaveLength(19);
      expect(plan.shots.filter((s) => s.group === 'labs')).toHaveLength(8);
      for (const requiredFile of [
        'showcase-landing.jpg',
        'armory-showcase.jpg',
        'hero-ct-cutaway.jpg',
        'm4a1-exploded.jpg',
        'm1911-v6-hero.jpg',
        'gau8-v6-hero.jpg',
        'p08-v3-macro.jpg',
        'benellim4-v3-macro.jpg',
        'v6-range-3d.jpg',
        'v7-scale-wall.jpg',
        'v7-recoil-lab.jpg',
        'v7-showdown-radar.jpg',
        'v7-caliper-daylight.jpg',
      ]) {
        expect(fileSet.has(requiredFile)).toBe(true);
      }

      const gau8Shot = plan.shots.find((s) => s.id === 'gau8-v6-hero');
      expect(gau8Shot?.isHeavy).toBe(true);
    });

    it('supports group/only CLI selection and validates capture quality invariants', () => {
      const coreOpts = captureMod.parseCliArgs([
        '--group=core',
        '--out-dir=/tmp/test-shots',
        '--quality=90',
        '--dry-run',
        '--json',
      ]);
      expect(coreOpts.group).toBe('core');
      expect(coreOpts.quality).toBe(90);
      expect(captureMod.selectDocShots(coreOpts)).toHaveLength(5);

      const onlyOpts = captureMod.parseCliArgs([
        '--only=showcase-landing,hero-ct-cutaway',
      ]);
      const targets = captureMod.buildDocShotTargets('http://127.0.0.1:4173', onlyOpts);
      expect(targets).toHaveLength(2);
      expect(targets[1].url).toContain('weapon=ak15');
      expect(targets[1].url).toContain('cut=1');

      expect(() => captureMod.parseCliArgs(['--group=invalid'])).toThrow(/Unknown --group/);
      expect(() => captureMod.parseCliArgs(['--only=missing-shot'])).toThrow(/Unknown shot ID/);

      const passEval = captureMod.evaluateCapturedShot(targets[0], {
        width: 1920,
        height: 1080,
        bytes: 215_000,
        nonBgPixelRatio: 0.64,
        consoleErrorCount: 0,
        pageErrorCount: 0,
        failedRequestCount: 0,
        durationMs: 1800,
      });
      expect(passEval.pass).toBe(true);
      expect(passEval.issues).toEqual([]);

      const failEval = captureMod.evaluateCapturedShot(targets[1], {
        width: 1280,
        height: 720,
        bytes: 12_000,
        nonBgPixelRatio: 0.03,
        consoleErrorCount: 1,
        pageErrorCount: 0,
        failedRequestCount: 2,
        durationMs: 2100,
      });
      expect(failEval.pass).toBe(false);
      expect(failEval.issues).toHaveLength(4);
    });
  });
});

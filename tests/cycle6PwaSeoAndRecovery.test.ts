import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  classifyViewportError,
  VIEWPORT_RECOVERY_STRINGS,
  ViewportErrorBoundary,
  ViewportRecoveryFallbackView,
} from '../src/app/ViewportErrorBoundary';
import {
  ARMOR_HALL_OFFLINE_IDS,
  buildExhibitOfflineAssetUrls,
  FEATURED_LEGENDS_OFFLINE_IDS,
  summarizeOfflinePack,
} from '../src/engine/offline/offlineMuseumManager';
import {
  OFFLINE_MUSEUM_STRINGS,
  OfflineMuseumModal,
} from '../src/features/offline/OfflineMuseumModal';
import { useAppStore } from '../src/store/useAppStore';

const REPO_ROOT = path.resolve(__dirname, '..');
const PUBLIC_DIR = path.join(REPO_ROOT, 'public');
const AUDIT_SCRIPT = path.join(REPO_ROOT, 'scripts', 'audit_asset_budget.mjs');

const CJK_RE = /[\u4e00-\u9fff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;
const STALE_META_RE = /\b(?:27|29|731)\b|v5\.0/i;

const tempDirs: string[] = [];

function makeTempDir(prefix: string): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  tempDirs.push(dir);
  return dir;
}

afterEach(() => {
  while (tempDirs.length > 0) {
    const dir = tempDirs.pop();
    if (dir && fs.existsSync(dir)) {
      fs.rmSync(dir, { recursive: true, force: true });
    }
  }
});

describe('Cycle 6B · PWA Manifest & Multi-Entry HTML SEO / OpenGraph Parity', () => {
  it('keeps index.html & showcase.html free of stale 27/29/731/v5.0 metadata and aligned to 34 Exhibits · 10 Halls · 854 Parts · 30mm Aviation Ordnance', () => {
    for (const fileName of ['index.html', 'showcase.html']) {
      const html = fs.readFileSync(path.join(REPO_ROOT, fileName), 'utf8');

      expect(html, `${fileName} leaked stale metadata`).not.toMatch(STALE_META_RE);
      expect(html, `${fileName} leaked WP-XX`).not.toMatch(WP_BADGE_RE);

      expect(html).toContain('href="./manifest.webmanifest"');
      expect(html).toContain('href="./favicon.ico"');
      expect(html).toContain('name="theme-color" content="#0b1120"');
      expect(html).toContain('34 Exhibits');
      expect(html).toContain('10 Halls');
      expect(html).toContain('854 Parts');
      expect(html).toContain('30mm Aviation Ordnance');
      expect(html).toContain('property="og:title"');
      expect(html).toContain('property="og:description"');
      expect(html).toContain('name="twitter:title"');
      expect(html).toContain('name="twitter:description"');
    }
  });

  it('ships valid subpath-safe public/manifest.webmanifest with 34/10/854/30mm copy and 4 PWA shortcuts', () => {
    const raw = fs.readFileSync(
      path.join(PUBLIC_DIR, 'manifest.webmanifest'),
      'utf8'
    );
    expect(raw).not.toMatch(STALE_META_RE);
    expect(raw).not.toMatch(WP_BADGE_RE);

    const manifest = JSON.parse(raw) as {
      name: string;
      short_name: string;
      description: string;
      start_url: string;
      scope: string;
      display: string;
      theme_color: string;
      shortcuts: Array<{
        name: string;
        short_name: string;
        url: string;
        description?: string;
      }>;
    };

    expect(manifest.start_url).toBe('./index.html');
    expect(manifest.scope).toBe('./');
    expect(manifest.display).toBe('standalone');
    expect(manifest.theme_color).toBe('#0b1120');
    expect(manifest.description).toContain('34 Exhibits');
    expect(manifest.description).toContain('10 Halls');
    expect(manifest.description).toContain('854 Parts');
    expect(manifest.description).toContain('30mm Aviation Ordnance');

    expect(Array.isArray(manifest.shortcuts)).toBe(true);
    expect(manifest.shortcuts).toHaveLength(4);

    const shortcutUrls = manifest.shortcuts.map((s) => s.url);
    expect(shortcutUrls).toEqual([
      './?screen=armory',
      './?screen=ballistics',
      './?screen=cartridges',
      './?screen=split_showdown',
    ]);
    for (const sc of manifest.shortcuts) {
      expect(sc.url.startsWith('./'), `Shortcut URL must be subpath-safe: ${sc.url}`).toBe(
        true
      );
      expect(sc.name.length).toBeGreaterThan(3);
    }
  });
});

describe('Cycle 6B · Self-Healing Museum-Grade WebGL Error Boundary', () => {
  it('classifies WebGL GPU failures vs 3D scene render exceptions accurately', () => {
    expect(
      classifyViewportError(new Error('WebGL 2.0 context lost during frame render'))
    ).toBe('webgl');
    expect(
      classifyViewportError(new Error('THREE.WebGLProgram: Shader Error 0'))
    ).toBe('webgl');
    expect(
      classifyViewportError(new TypeError('Cannot read properties of undefined (reading mesh)'))
    ).toBe('runtime');
  });

  it('renders bilingual glassmorphism recovery UI with Reload, Eco Graphics Retry, and Return to Vault actions (0 CJK in EN)', () => {
    expect(Object.keys(VIEWPORT_RECOVERY_STRINGS.en).sort()).toEqual(
      Object.keys(VIEWPORT_RECOVERY_STRINGS.zh).sort()
    );
    for (const val of Object.values(VIEWPORT_RECOVERY_STRINGS.en)) {
      expect(val).not.toMatch(CJK_RE);
      expect(val).not.toMatch(WP_BADGE_RE);
    }

    const enWebglHtml = renderToStaticMarkup(
      React.createElement(ViewportRecoveryFallbackView, {
        lang: 'en',
        failureKind: 'webgl',
        errorMessage: 'WebGL2 context creation failed',
        currentQuality: 'ultra',
        onReload: () => {},
        onEcoRetry: () => {},
        onReturnVault: () => {},
      })
    );
    expect(enWebglHtml).toContain('role="alert"');
    expect(enWebglHtml).toContain('data-testid="viewport-error-fallback"');
    expect(enWebglHtml).toContain('data-testid="viewport-retry-btn"');
    expect(enWebglHtml).toContain('data-testid="viewport-eco-retry-btn"');
    expect(enWebglHtml).toContain('data-testid="viewport-vault-btn"');
    expect(enWebglHtml).toContain('WEBGL GPU FAILURE');
    expect(enWebglHtml).toContain('Drop to Eco Graphics &amp; Retry');
    expect(enWebglHtml).not.toMatch(CJK_RE);

    const zhRuntimeHtml = renderToStaticMarkup(
      React.createElement(ViewportRecoveryFallbackView, {
        lang: 'zh',
        failureKind: 'runtime',
        errorMessage: 'TypeError: invalid matrix',
        currentQuality: 'high',
        onReload: () => {},
        onEcoRetry: () => {},
        onReturnVault: () => {},
      })
    );
    expect(zhRuntimeHtml).toContain('3D 场景渲染异常');
    expect(zhRuntimeHtml).toContain('切换节能画质重试');
    expect(zhRuntimeHtml).toContain('返回兵器库');

    // SSR via initialError prop on ViewportErrorBoundary class itself
    const boundaryHtml = renderToStaticMarkup(
      React.createElement(ViewportErrorBoundary, {
        initialError: new Error('GPU context lost'),
        children: React.createElement('div', null, 'child'),
      })
    );
    expect(boundaryHtml).toContain('data-testid="viewport-eco-retry-btn"');
    expect(boundaryHtml).toContain('GPU context lost');
  });

  it('drops graphicsQuality to eco on Eco Retry and returns to Armory Vault on Vault action', () => {
    const prevQuality = useAppStore.getState().graphicsQuality;
    const prevScreen = useAppStore.getState().screen;
    try {
      useAppStore.getState().setGraphicsQuality('ultra', true);
      useAppStore.getState().enterWorkbench('gau8');

      const boundary = new ViewportErrorBoundary({
        children: null,
        initialError: new Error('WebGL context lost'),
      });
      boundary.setState = (() => {}) as typeof boundary.setState;

      // Invoke Eco Retry recovery
      (
        boundary as unknown as { handleEcoRetry: () => void }
      ).handleEcoRetry();
      expect(useAppStore.getState().graphicsQuality).toBe('eco');

      // Invoke Return to 34-Bay Vault recovery
      (
        boundary as unknown as { handleReturnToVault: () => void }
      ).handleReturnToVault();
      expect(useAppStore.getState().screen).toBe('armory');
    } finally {
      useAppStore.getState().setGraphicsQuality(prevQuality, false);
      useAppStore.setState({ screen: prevScreen });
    }
  });
});

describe('Cycle 6B · Offline Museum Featured 5 Legends Pack', () => {
  it('exports exact FEATURED_LEGENDS_OFFLINE_IDS with 100% real on-disk assets and accurate aggregate MB summary', () => {
    expect(FEATURED_LEGENDS_OFFLINE_IDS).toEqual([
      'ak15',
      'p08',
      'm1911',
      'gau8',
      'ztz99a',
    ]);
    expect(ARMOR_HALL_OFFLINE_IDS).toEqual([
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
    ]);

    const summary = summarizeOfflinePack(FEATURED_LEGENDS_OFFLINE_IDS, '/');
    expect(summary.weaponIds).toEqual(FEATURED_LEGENDS_OFFLINE_IDS);
    expect(summary.uniqueUrls.length).toBeGreaterThan(40);
    expect(summary.totalAssetRequests).toBeGreaterThan(summary.uniqueUrls.length);

    const expectedSumMb = Number(
      FEATURED_LEGENDS_OFFLINE_IDS.reduce(
        (acc, id) => acc + buildExhibitOfflineAssetUrls(id, '/').estimatedMb,
        0
      ).toFixed(1)
    );
    expect(summary.estimatedMb).toBe(expectedSumMb);
    expect(summary.estimatedMb).toBeGreaterThan(20);
    expect(summary.estimatedMb).toBeLessThan(35);

    for (const url of summary.uniqueUrls) {
      const rel = url.replace(/^\//, '');
      const fullPath = path.join(PUBLIC_DIR, rel);
      expect(
        fs.existsSync(fullPath),
        `Featured Legends offline URL missing on disk: ${url}`
      ).toBe(true);
    }
  });

  it('renders Featured 5 Legends 1-click button with aggregate MB estimate, bilingual batch progress strings, and zero CJK/WP leaks', () => {
    expect(Object.keys(OFFLINE_MUSEUM_STRINGS.en).sort()).toEqual(
      Object.keys(OFFLINE_MUSEUM_STRINGS.zh).sort()
    );
    const enProgress = OFFLINE_MUSEUM_STRINGS.en.batchCachingProgressStatus(
      2,
      5,
      'P08 Luger',
      14,
      20,
      30,
      78
    );
    expect(enProgress).toContain('Exhibit 2/5');
    expect(enProgress).toContain('14/20 files');
    expect(enProgress).not.toMatch(CJK_RE);
    expect(enProgress).not.toMatch(WP_BADGE_RE);

    const zhProgress = OFFLINE_MUSEUM_STRINGS.zh.batchCachingProgressStatus(
      2,
      5,
      '鲁格 P08',
      14,
      20,
      30,
      78
    );
    expect(zhProgress).toContain('2/5');
    expect(zhProgress).toContain('14/20');

    const modalHtml = renderToStaticMarkup(
      React.createElement(OfflineMuseumModal, { onClose: () => {} })
    );
    const legendsSummary = summarizeOfflinePack(FEATURED_LEGENDS_OFFLINE_IDS);
    const armorSummary = summarizeOfflinePack(ARMOR_HALL_OFFLINE_IDS);

    expect(modalHtml).toContain('data-testid="offline-cache-legends-btn"');
    expect(modalHtml).toContain('data-testid="offline-cache-armor-btn"');
    expect(modalHtml).toContain(`~${legendsSummary.estimatedMb.toFixed(1)} MB`);
    expect(modalHtml).toContain(`~${armorSummary.estimatedMb.toFixed(1)} MB`);
    expect(modalHtml).not.toMatch(WP_BADGE_RE);

    const css = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/offline-museum.css'),
      'utf8'
    );
    expect(css).not.toMatch(WP_BADGE_RE);
    expect(css).toContain('.offline-btn.is-legends');
  });
});

describe('Cycle 6B · Strict Zero-PNG & 340-Plate Parity Gate (audit_asset_budget.mjs)', () => {
  it('passes zero-PNG hygiene and full 34/34 exhibits × 10 plates = 340/340 parity on the real repository', () => {
    const raw = execFileSync(process.execPath, [AUDIT_SCRIPT, '--json'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    const report = JSON.parse(raw);

    expect(report.summary.ok).toBe(true);
    expect(report.hygiene.roguePngs.totalCount).toBe(0);
    expect(report.hygiene.roguePngs.ok).toBe(true);
    expect(report.hygiene.platesManifest.checked).toBe(true);
    expect(report.hygiene.platesManifest.manifestWeaponCount).toBe(34);
    expect(report.hygiene.platesManifest.expectedWeaponCount).toBe(34);
    expect(report.hygiene.platesManifest.verifiedPlateFiles).toBe(340);
    expect(report.hygiene.platesManifest.expectedTotalPlates).toBe(340);
    expect(report.hygiene.platesManifest.ok).toBe(true);
  });

  it('fails hard when a rogue .png file is introduced into public/textures/ or public/plates/', () => {
    const tmpRoot = makeTempDir('armory-rogue-png-');
    fs.mkdirSync(path.join(tmpRoot, 'public', 'models'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'public', 'textures'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'public', 'plates', 'testgun'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'models', 'testgun.glb'),
      Buffer.alloc(1024, 1)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'textures', 'testgun_v3_metal_albedo.webp'),
      Buffer.alloc(1024, 2)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'textures', 'rogue_bake.png'),
      Buffer.alloc(128, 3)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'plates', 'testgun', 'rogue_plate.png'),
      Buffer.alloc(128, 4)
    );

    const res = spawnSync(
      process.execPath,
      [AUDIT_SCRIPT, '--root', tmpRoot, '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(res.status).toBe(1);

    const report = JSON.parse(res.stdout);
    expect(report.summary.ok).toBe(false);
    expect(report.hygiene.roguePngs.ok).toBe(false);
    expect(report.hygiene.roguePngs.totalCount).toBe(2);
    expect(report.hygiene.roguePngs.textures).toEqual(['rogue_bake.png']);
    expect(report.hygiene.roguePngs.plates).toEqual(['testgun/rogue_plate.png']);
  });

  it('fails hard when public/plates/manifest.json has fewer than 10 plates or missing plate files on disk', () => {
    const tmpRoot = makeTempDir('armory-plates-parity-');
    fs.mkdirSync(path.join(tmpRoot, 'public', 'models'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'public', 'textures'), { recursive: true });
    fs.mkdirSync(path.join(tmpRoot, 'public', 'plates', 'testgun'), {
      recursive: true,
    });

    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'models', 'testgun.glb'),
      Buffer.alloc(1024, 1)
    );
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'textures', 'testgun_v3_metal_albedo.webp'),
      Buffer.alloc(1024, 2)
    );

    // Only 9 plates instead of 10, AND one referenced file is missing on disk
    const plates: Record<string, { file: string }> = {};
    for (let i = 1; i <= 9; i += 1) {
      const key = `plate_${i}`;
      const rel = `plates/testgun/${key}.webp`;
      plates[key] = { file: rel };
      if (i <= 8) {
        fs.writeFileSync(
          path.join(tmpRoot, 'public', rel),
          Buffer.alloc(256, i)
        );
      }
    }
    fs.writeFileSync(
      path.join(tmpRoot, 'public', 'plates', 'manifest.json'),
      JSON.stringify({ version: 1, weapons: { testgun: { plates } } }, null, 2)
    );

    const res = spawnSync(
      process.execPath,
      [AUDIT_SCRIPT, '--root', tmpRoot, '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    expect(res.status).toBe(1);

    const report = JSON.parse(res.stdout);
    expect(report.summary.ok).toBe(false);
    expect(report.hygiene.platesManifest.checked).toBe(true);
    expect(report.hygiene.platesManifest.ok).toBe(false);
    expect(report.hygiene.platesManifest.underPopulatedWeapons).toEqual([
      { weaponId: 'testgun', plateCount: 9 },
    ]);
    expect(report.hygiene.platesManifest.missingPlateFiles).toEqual([
      'public/plates/testgun/plate_9.webp',
    ]);
  });
});

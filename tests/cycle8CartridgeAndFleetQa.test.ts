import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  getCartridgeHighlightLayer,
  setCartridgeHighlightLayer,
  subscribeCartridgeHighlightLayer,
} from '../src/engine/actors/CartridgeCutawayStage';
import {
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  TANK_ORDNANCE_ORDER,
} from '../src/engine/cartridges/cartridgeSpecs';
import {
  ALL_CARTRIDGE_LAB_ORDER,
  CARTRIDGE_DUEL_STRINGS,
  type CartridgeSortKey,
  computeCartridgeDuelMetrics,
  computeCartridgeMomentumNs,
  computeSectionalDensity,
  formatMomentumNs,
  formatRatioLabel,
  getSuggestedDuelOpponent,
  sortCartridgeOrder,
} from '../src/features/cartridges/cartridgeDuelMath';
import { CartridgeLabView } from '../src/features/cartridges/CartridgeLabView';

const REPO_ROOT = path.resolve(__dirname, '..');
const FLEET_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa_full_fleet_audit.mjs');
const CJK_RE = /[\u4e00-\u9fff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    try {
      const sample = (value as (...args: unknown[]) => unknown)('SD');
      return typeof sample === 'string' ? [sample] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value.flatMap(collectStrings);
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe('Cycle 8A · Cross-Caliber Ballistic Duel & Sectional Density Engine', () => {
  it('computes accurate Sectional Density (g/cm2 & lb/in2) and momentum across all 21 rounds', () => {
    expect(ALL_CARTRIDGE_LAB_ORDER).toHaveLength(21);
    expect(CARTRIDGE_LAB_ORDER).toHaveLength(17);
    expect(TANK_ORDNANCE_ORDER).toHaveLength(4);

    for (const cal of ALL_CARTRIDGE_LAB_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[cal];
      const sd = computeSectionalDensity(
        spec.projectileMassG,
        spec.bulletDiameterMm
      );
      const mom = computeCartridgeMomentumNs(
        spec.projectileMassG,
        spec.muzzleVelocityMps
      );

      expect(Number.isFinite(sd.metricGCm2), `${cal} metric SD`).toBe(true);
      expect(sd.metricGCm2).toBeGreaterThan(0);
      expect(Number.isFinite(sd.imperialLbIn2), `${cal} imperial SD`).toBe(true);
      expect(sd.imperialLbIn2).toBeGreaterThan(0);
      expect(mom).toBeGreaterThan(0);
    }

    // Classic ballistic SD benchmarks
    const sd3006 = computeSectionalDensity(
      CARTRIDGE_LAB_SPECS['30_06'].projectileMassG,
      CARTRIDGE_LAB_SPECS['30_06'].bulletDiameterMm
    );
    expect(sd3006.imperialLbIn2).toBeGreaterThan(0.2);
    expect(sd3006.imperialLbIn2).toBeLessThan(0.26);

    const sd50 = computeSectionalDensity(
      CARTRIDGE_LAB_SPECS['50_bmg'].projectileMassG,
      CARTRIDGE_LAB_SPECS['50_bmg'].bulletDiameterMm
    );
    expect(sd50.imperialLbIn2).toBeGreaterThan(0.32);
    expect(sd50.imperialLbIn2).toBeLessThan(0.42);

    // Cross-gallery duel: 125mm APFSDS vs .50 BMG
    const tankVs50 = computeCartridgeDuelMetrics(
      CARTRIDGE_LAB_SPECS['125mm_apfsds'],
      CARTRIDGE_LAB_SPECS['50_bmg']
    );
    expect(tankVs50.energyRatio).toBeGreaterThan(400);
    expect(tankVs50.momentumRatio).toBeGreaterThan(200);
    expect(tankVs50.oalRatio).toBeGreaterThan(6);
    expect(tankVs50.velocityDeltaMps).toBeGreaterThan(800);

    // Classic WWII rifle duel: .30-06 vs 7.92x57mm Mauser
    const wwiiDuel = computeCartridgeDuelMetrics(
      CARTRIDGE_LAB_SPECS['30_06'],
      CARTRIDGE_LAB_SPECS['792_mauser']
    );
    expect(wwiiDuel.energyRatio).toBeGreaterThan(0.85);
    expect(wwiiDuel.energyRatio).toBeLessThan(1.15);

    expect(getSuggestedDuelOpponent('125mm_apfsds')).toBe('50_bmg');
    expect(getSuggestedDuelOpponent('50_bmg')).toBe('125mm_apfsds');
    expect(formatRatioLabel(488.4)).toBe('488x');
    expect(formatRatioLabel(1.04)).toBe('1.04x');
    expect(formatMomentumNs(8544)).toBe('8.54 kN·s');
  });

  it('sorts cartridge matrix non-destructively across all 8 sort keys in desc and asc order', () => {
    const keys: CartridgeSortKey[] = [
      'default',
      'oal',
      'charge',
      'mass',
      'pressure',
      'velocity',
      'energy',
      'sd',
    ];
    const snapshot = [...CARTRIDGE_LAB_ORDER];

    for (const key of keys) {
      const desc = sortCartridgeOrder(CARTRIDGE_LAB_ORDER, key, 'desc');
      const asc = sortCartridgeOrder(CARTRIDGE_LAB_ORDER, key, 'asc');
      expect(desc).toHaveLength(17);
      expect(asc).toHaveLength(17);
      expect(CARTRIDGE_LAB_ORDER).toEqual(snapshot);
    }

    const byEnergyDesc = sortCartridgeOrder(CARTRIDGE_LAB_ORDER, 'energy', 'desc');
    expect(byEnergyDesc[0]).toBe('50_bmg');

    const byEnergyAsc = sortCartridgeOrder(CARTRIDGE_LAB_ORDER, 'energy', 'asc');
    expect(CARTRIDGE_LAB_SPECS[byEnergyAsc[0]].muzzleEnergyJ).toBeLessThan(
      CARTRIDGE_LAB_SPECS[byEnergyAsc[byEnergyAsc.length - 1]].muzzleEnergyJ
    );

    const bySdDesc = sortCartridgeOrder(CARTRIDGE_LAB_ORDER, 'sd', 'desc');
    const topSd = computeSectionalDensity(
      CARTRIDGE_LAB_SPECS[bySdDesc[0]].projectileMassG,
      CARTRIDGE_LAB_SPECS[bySdDesc[0]].bulletDiameterMm
    ).metricGCm2;
    const bottomSd = computeSectionalDensity(
      CARTRIDGE_LAB_SPECS[bySdDesc[bySdDesc.length - 1]].projectileMassG,
      CARTRIDGE_LAB_SPECS[bySdDesc[bySdDesc.length - 1]].bulletDiameterMm
    ).metricGCm2;
    expect(topSd).toBeGreaterThan(bottomSd);

    const tankByEnergy = sortCartridgeOrder(TANK_ORDNANCE_ORDER, 'energy', 'desc');
    expect(tankByEnergy[0]).toBe('125mm_apfsds');
  });
});

describe('Cycle 8A · Interactive 3D Anatomy Highlight Store, CartridgeLabView & Bilingual Hygiene', () => {
  it('notifies subscribers cleanly on anatomy layer changes and resets safely to null', () => {
    let calls = 0;
    const unsub = subscribeCartridgeHighlightLayer(() => {
      calls += 1;
    });
    try {
      setCartridgeHighlightLayer(null);
      const startCalls = calls;

      setCartridgeHighlightLayer('core');
      expect(getCartridgeHighlightLayer()).toBe('core');
      expect(calls).toBe(startCalls + 1);

      // Idempotent set does not spuriously notify
      setCartridgeHighlightLayer('core');
      expect(calls).toBe(startCalls + 1);

      setCartridgeHighlightLayer('propellant');
      expect(getCartridgeHighlightLayer()).toBe('propellant');
      expect(calls).toBe(startCalls + 2);

      setCartridgeHighlightLayer('primer');
      expect(getCartridgeHighlightLayer()).toBe('primer');
      expect(calls).toBe(startCalls + 3);

      setCartridgeHighlightLayer(null);
      expect(getCartridgeHighlightLayer()).toBeNull();
    } finally {
      unsub();
      setCartridgeHighlightLayer(null);
    }
  });

  it('enforces 0 CJK in EN CARTRIDGE_DUEL_STRINGS, 0 WP-XX leaks, and SSR-renders interactive anatomy + duel controls', () => {
    expect(Object.keys(CARTRIDGE_DUEL_STRINGS.en).sort()).toEqual(
      Object.keys(CARTRIDGE_DUEL_STRINGS.zh).sort()
    );
    for (const s of collectStrings(CARTRIDGE_DUEL_STRINGS.en)) {
      expect(s, `EN duel string leaked CJK: ${s}`).not.toMatch(CJK_RE);
      expect(s, `EN duel string leaked WP-XX: ${s}`).not.toMatch(WP_BADGE_RE);
    }
    for (const s of collectStrings(CARTRIDGE_DUEL_STRINGS.zh)) {
      expect(s, `ZH duel string leaked WP-XX: ${s}`).not.toMatch(WP_BADGE_RE);
    }

    const html = renderToStaticMarkup(React.createElement(CartridgeLabView));
    expect(html).toContain('data-testid="cartridge-anatomy-core"');
    expect(html).toContain('data-testid="cartridge-anatomy-propellant"');
    expect(html).toContain('data-testid="cartridge-anatomy-primer"');
    expect(html).toContain('data-testid="cartridge-duel-toggle"');
    expect(html).toContain('aria-pressed="false"');
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toMatch(WP_BADGE_RE);

    const css = fs.readFileSync(
      path.join(REPO_ROOT, 'src/styles/cartridges.css'),
      'utf8'
    );
    expect(css).not.toMatch(WP_BADGE_RE);
    expect(css).toContain('.c-note-row.is-interactive.is-highlighted');
    expect(css).toContain('.cartridge-duel-toggle');
    expect(css).toContain('min-height: 40px');
    expect(css).toContain("@media (max-width: 440px)");
  });
});

describe('Cycle 8A · Full 34-Exhibit Automated WebGL Fleet Audit Harness', () => {
  it('registers npm run qa:fleet, passes node --check, prints --help, and builds exact 42-target full & 14-target quick plans dynamically', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(REPO_ROOT, 'package.json'), 'utf8')
    ) as { scripts: Record<string, string> };
    expect(pkg.scripts['qa:fleet']).toBe('node scripts/qa_full_fleet_audit.mjs');

    // Syntax check
    execFileSync(process.execPath, ['--check', FLEET_SCRIPT], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });

    // Help text check
    const helpOut = execFileSync(process.execPath, [FLEET_SCRIPT, '--help'], {
      cwd: REPO_ROOT,
      encoding: 'utf8',
    });
    expect(helpOut).toContain('--mode=quick|flagship|full');
    expect(helpOut).toContain('--theme=dark|light');
    expect(helpOut).toContain('--cut');
    expect(helpOut).toContain('--json');

    // Full mode dry-run: all 34 exhibits + 8 museum views = 42 targets
    const fullDryRaw = execFileSync(
      process.execPath,
      [
        FLEET_SCRIPT,
        '--mode=full',
        '--theme=light',
        '--cut',
        '--dry-run',
        '--json',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const fullPlan = JSON.parse(fullDryRaw) as {
      dryRun: boolean;
      mode: string;
      theme: string;
      cut: boolean;
      exhibitTargets: number;
      viewTargets: number;
      totalTargets: number;
      targets: Array<{ id: string; url: string }>;
    };

    expect(fullPlan.dryRun).toBe(true);
    expect(fullPlan.mode).toBe('full');
    expect(fullPlan.theme).toBe('light');
    expect(fullPlan.cut).toBe(true);
    expect(fullPlan.exhibitTargets).toBe(100);
    expect(fullPlan.viewTargets).toBe(8);
    expect(fullPlan.totalTargets).toBe(108);

    const ak15Target = fullPlan.targets.find((t) => t.id === 'exhibit:ak15');
    expect(ak15Target?.url).toContain('cut=1');
    expect(ak15Target?.url).toContain('env=blueprint_daylight');

    const viewIds = fullPlan.targets
      .filter((t) => t.id.startsWith('view:'))
      .map((t) => t.id);
    expect(viewIds).toEqual([
      'view:showcase',
      'view:armory',
      'view:cartridges',
      'view:ballistics',
      'view:split_showdown',
      'view:panel_armor',
      'view:panel_scalewall',
      'view:panel_recoil',
    ]);

    // Quick mode dry-run: 10 representative exhibits (6 Flagship + 4 Centennial) + 8 museum views = 18 targets
    const quickDryRaw = execFileSync(
      process.execPath,
      [FLEET_SCRIPT, '--mode=quick', '--dry-run', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const quickPlan = JSON.parse(quickDryRaw) as {
      exhibitTargets: number;
      viewTargets: number;
      totalTargets: number;
      targets: Array<{ id: string; url: string }>;
    };
    expect(quickPlan.exhibitTargets).toBe(10);
    expect(quickPlan.viewTargets).toBe(8);
    expect(quickPlan.totalTargets).toBe(18);

    // Split Showdown target passes weaponA/weaponB as parsed by useUrlStateSync.ts
    const splitTarget = quickPlan.targets.find((t) => t.id === 'view:split_showdown');
    expect(splitTarget?.url).toContain('weaponA=gau8');
    expect(splitTarget?.url).toContain('weaponB=m134');
  });

  it('hardens CDP launch unpacking, lazy-image readiness, heavy exhibit settling, zero-zombie exit, and fleet summary stats', async () => {
    const fleetModUrl = pathToFileURL(FLEET_SCRIPT).href;
    const fleetMod = (await import(/* @vite-ignore */ fleetModUrl)) as {
      HEAVY_EXHIBIT_IDS: Set<string>;
      FLEET_READINESS_PROBE_SCRIPT: string;
      summarizeFleetStats: (results: Array<Record<string, unknown>>) => {
        fastest: { id: string; loadMs: number } | null;
        slowest: { id: string; loadMs: number } | null;
        medianLoadMs: number | null;
        minNonBgRatio: number | null;
        medianNonBgRatio: number | null;
        maxNonBgRatio: number | null;
        lightThemeAppliedCount: number;
        errorBoundaryHits: number;
        readinessTimeouts: number;
      };
    };

    for (const heavyId of [
      'ztz99a',
      'm1a2',
      'leopard2a7',
      'tiger1',
      't90m',
      'challenger2',
      'merkava4',
      't34_85',
      'gau8',
      'm61vulcan',
      'bofors40',
      'm777',
    ]) {
      expect(fleetMod.HEAVY_EXHIBIT_IDS.has(heavyId)).toBe(true);
    }

    expect(fleetMod.FLEET_READINESS_PROBE_SCRIPT).toContain(
      '.viewport-error-fallback'
    );
    expect(fleetMod.FLEET_READINESS_PROBE_SCRIPT).toContain("loadingAttr !== 'lazy'");

    const stats = fleetMod.summarizeFleetStats([
      {
        id: 'exhibit:deagle',
        loadMs: 2530,
        nonBgPixelRatio: 0.62,
        ready: true,
        readiness: { appliedTheme: 'dark', hasErrorBoundary: false },
      },
      {
        id: 'exhibit:leopard2a7',
        loadMs: 5796,
        nonBgPixelRatio: 0.617,
        ready: true,
        readiness: { appliedTheme: 'light', hasErrorBoundary: false },
      },
      {
        id: 'view:split_showdown',
        loadMs: 3491,
        nonBgPixelRatio: 0.2576,
        ready: true,
        readiness: { appliedTheme: 'light', hasErrorBoundary: false },
      },
    ]);
    expect(stats.fastest).toEqual({ id: 'exhibit:deagle', loadMs: 2530 });
    expect(stats.slowest).toEqual({ id: 'exhibit:leopard2a7', loadMs: 5796 });
    expect(stats.medianLoadMs).toBe(3491);
    expect(stats.minNonBgRatio).toBe(0.2576);
    expect(stats.medianNonBgRatio).toBe(0.617);
    expect(stats.maxNonBgRatio).toBe(0.62);
    expect(stats.lightThemeAppliedCount).toBe(2);
    expect(stats.errorBoundaryHits).toBe(0);
    expect(stats.readinessTimeouts).toBe(0);

    // Static contract checks on CDP driver and zero-zombie teardown
    const scriptSrc = fs.readFileSync(FLEET_SCRIPT, 'utf8');
    expect(scriptSrc).toContain('discovered.executablePath');
    expect(scriptSrc).toContain('NativeCdpClient.connect(wsUrl)');
    expect(scriptSrc).toContain("Target.createTarget");
    expect(scriptSrc).toContain("Target.closeTarget");
    expect(scriptSrc).toContain("Page.captureScreenshot");
    expect(scriptSrc).toContain('process.exit(exitCode);');
  });

  it('supports 100-exhibit spread/alias discovery in types.ts + centennialTypes.ts and --mode=flagship / --mode=quick / --mode=full', async () => {
    const fleetModUrl = pathToFileURL(FLEET_SCRIPT).href;
    const fleetMod = (await import(/* @vite-ignore */ fleetModUrl)) as {
      FLEET_VALID_MODES: readonly string[];
      discoverFleetWeaponIds: (repoRoot?: string) => string[];
      discoverFlagshipWeaponIds: (repoRoot?: string) => string[];
      buildFleetAuditTargets: (
        baseUrl: string,
        options?: { repoRoot?: string; mode?: string; theme?: string }
      ) => Array<{ id: string; weaponId: string | null }>;
    };

    expect(fleetMod.FLEET_VALID_MODES).toEqual(['quick', 'flagship', 'full']);

    // Real repo today: 34 flagships -> --mode=flagship produces exact 34 + 8 = 42 targets
    const realFlagshipRaw = execFileSync(
      process.execPath,
      [FLEET_SCRIPT, '--mode=flagship', '--dry-run', '--json'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const realFlagshipPlan = JSON.parse(realFlagshipRaw) as {
      mode: string;
      exhibitTargets: number;
      viewTargets: number;
      totalTargets: number;
    };
    expect(realFlagshipPlan.mode).toBe('flagship');
    expect(realFlagshipPlan.exhibitTargets).toBe(34);
    expect(realFlagshipPlan.viewTargets).toBe(8);
    expect(realFlagshipPlan.totalTargets).toBe(42);

    // Synthetic 100-exhibit workspace using [...FLAGSHIP_34_IDS, ...CENTENNIAL_66_IDS]
    const tmpRoot = fs.mkdtempSync(
      path.join(os.tmpdir(), 'armory-fleet-100w-')
    );
    try {
      const expansionDir = path.join(
        tmpRoot,
        'src',
        'weapons',
        'expansion'
      );
      fs.mkdirSync(expansionDir, { recursive: true });
      fs.copyFileSync(
        path.join(REPO_ROOT, 'src', 'weapons', 'expansion', 'centennialTypes.ts'),
        path.join(expansionDir, 'centennialTypes.ts')
      );

      // 1. Spread syntax: [...FLAGSHIP_34_IDS, ...CENTENNIAL_66_IDS] as const
      fs.writeFileSync(
        path.join(tmpRoot, 'src', 'weapons', 'types.ts'),
        `import { CENTENNIAL_66_IDS, FLAGSHIP_34_IDS } from './expansion/centennialTypes';\nexport const WEAPON_IDS = [...FLAGSHIP_34_IDS, ...CENTENNIAL_66_IDS] as const;\n`,
        'utf8'
      );

      const discovered100 = fleetMod.discoverFleetWeaponIds(tmpRoot);
      expect(discovered100).toHaveLength(100);
      expect(discovered100[0]).toBe('ak15');
      expect(discovered100[33]).toBe('gau8');
      expect(discovered100[34]).toBe('ak47');
      expect(discovered100[99]).toBe('m777');

      const discovered34 = fleetMod.discoverFlagshipWeaponIds(tmpRoot);
      expect(discovered34).toHaveLength(34);
      expect(discovered34[33]).toBe('gau8');

      // CLI dry-runs against 100-exhibit root: full=108, flagship=42, quick=18 (10 exhibits + 8 views)
      const full100Plan = JSON.parse(
        execFileSync(
          process.execPath,
          [
            FLEET_SCRIPT,
            '--root',
            tmpRoot,
            '--mode=full',
            '--dry-run',
            '--json',
          ],
          { cwd: REPO_ROOT, encoding: 'utf8' }
        )
      ) as { exhibitTargets: number; viewTargets: number; totalTargets: number };
      expect(full100Plan.exhibitTargets).toBe(100);
      expect(full100Plan.viewTargets).toBe(8);
      expect(full100Plan.totalTargets).toBe(108);

      const flagship100Plan = JSON.parse(
        execFileSync(
          process.execPath,
          [
            FLEET_SCRIPT,
            '--root',
            tmpRoot,
            '--mode=flagship',
            '--dry-run',
            '--json',
          ],
          { cwd: REPO_ROOT, encoding: 'utf8' }
        )
      ) as { exhibitTargets: number; viewTargets: number; totalTargets: number };
      expect(flagship100Plan.exhibitTargets).toBe(34);
      expect(flagship100Plan.viewTargets).toBe(8);
      expect(flagship100Plan.totalTargets).toBe(42);

      const quick100Plan = JSON.parse(
        execFileSync(
          process.execPath,
          [
            FLEET_SCRIPT,
            '--root',
            tmpRoot,
            '--mode=quick',
            '--dry-run',
            '--json',
          ],
          { cwd: REPO_ROOT, encoding: 'utf8' }
        )
      ) as {
        exhibitTargets: number;
        viewTargets: number;
        totalTargets: number;
        targets: Array<{ id: string }>;
      };
      expect(quick100Plan.exhibitTargets).toBe(10);
      expect(quick100Plan.viewTargets).toBe(8);
      expect(quick100Plan.totalTargets).toBe(18);
      expect(quick100Plan.targets.some((t) => t.id === 'exhibit:t90m')).toBe(
        true
      );
      expect(quick100Plan.targets.some((t) => t.id === 'exhibit:m777')).toBe(
        true
      );

      // 2. Direct alias syntax: export const WEAPON_IDS = ALL_100_WEAPON_IDS;
      fs.writeFileSync(
        path.join(tmpRoot, 'src', 'weapons', 'types.ts'),
        `import { ALL_100_WEAPON_IDS } from './expansion/centennialTypes';\nexport const WEAPON_IDS = ALL_100_WEAPON_IDS;\n`,
        'utf8'
      );
      expect(fleetMod.discoverFleetWeaponIds(tmpRoot)).toHaveLength(100);
    } finally {
      fs.rmSync(tmpRoot, { recursive: true, force: true });
    }
  });
});

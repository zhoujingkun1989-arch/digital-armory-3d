import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  CHAMBER_IGNITION_LIGHT_COLOR,
  CHAMBER_IGNITION_WINDOW_END,
  CHAMBER_IGNITION_WINDOW_START,
  computeChamberIgnitionBounceIntensity,
  resolveCaliberVfxClassScale,
} from '../src/engine/actors/BallisticsSystem';
import {
  getGpuTelemetrySnapshot,
  getGpuTelemetrySubscriberCount,
  GPU_TELEMETRY_RING_SIZE,
  isGpuTelemetryEnabled,
  publishGpuTelemetrySample,
  resetGpuTelemetryBus,
  setGpuTelemetryEnabled,
  subscribeGpuTelemetry,
} from '../src/engine/canvas/gpuTelemetryBus';
import {
  ARMORY_AOMAP_ANCHOR,
  ARMORY_CNC_BEVEL_GLINT_MARKER,
  ARMORY_COMMON_ANCHOR,
  ARMORY_EMISSIVE_ANCHOR,
  ARMORY_LIGHTS_MAPS_ANCHOR,
  ARMORY_NORMAL_ANCHOR,
  ARMORY_OPAQUE_ANCHOR,
  ARMORY_SHADER_VERSION,
  ARMORY_SURFACE_ANCHOR,
  getArmoryProgramCacheKey,
  injectArmoryFragmentShader,
  isCncBevelGlintMaterial,
} from '../src/engine/materials/armoryShader';
import { GPU_TELEMETRY_STRINGS } from '../src/features/workbench/GpuTelemetryOverlay';
import type { CaliberProfile, MaterialKind } from '../src/weapons/types';

const REPO_ROOT = path.resolve(__dirname, '..');
const QA_VISUAL_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa_visual_gate.mjs');
const QA_SOAK_SCRIPT = path.join(REPO_ROOT, 'scripts', 'qa_perf_soak.mjs');

const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

/**
 * Extracts the body of the first `useFrame((...) => { ... })` block in a TSX source file
 * using balanced brace scanning so static Zero-GC assertions are deterministic.
 */
function extractUseFrameBody(source: string): string {
  const idx = source.indexOf('useFrame(');
  if (idx < 0) return '';
  const arrowIdx = source.indexOf('=>', idx);
  if (arrowIdx < 0) return '';
  const openBrace = source.indexOf('{', arrowIdx);
  if (openBrace < 0) return '';

  let depth = 0;
  for (let i = openBrace; i < source.length; i += 1) {
    const ch = source[i];
    if (ch === '{') depth += 1;
    else if (ch === '}') {
      depth -= 1;
      if (depth === 0) {
        return source.slice(openBrace, i + 1);
      }
    }
  }
  return '';
}

afterEach(() => {
  resetGpuTelemetryBus();
});

describe('Cycle 3A — Zero-Overhead GPU Telemetry Bus & HUD', () => {
  it('acts as a strict no-op when disabled and notifies zero subscribers', () => {
    expect(isGpuTelemetryEnabled()).toBe(false);
    const listener = vi.fn();
    const unsub = subscribeGpuTelemetry(listener);
    expect(getGpuTelemetrySubscriberCount()).toBe(1);

    const accepted = publishGpuTelemetrySample({
      frameMs: 16.67,
      drawCalls: 42,
      triangles: 120_000,
      geometries: 85,
      textures: 36,
      programs: 12,
      nowMs: 1000,
    });

    expect(accepted).toBe(false);
    expect(listener).not.toHaveBeenCalled();

    const snap = getGpuTelemetrySnapshot();
    expect(snap.enabled).toBe(false);
    expect(snap.sampleCount).toBe(0);
    expect(snap.fps).toBe(0);
    expect(snap.drawCalls).toBe(0);

    unsub();
    expect(getGpuTelemetrySubscriberCount()).toBe(0);
  });

  it('computes accurate FPS, avgFrameMs, and P95 across wrapped 60-sample ring & throttles listeners', () => {
    const listener = vi.fn();
    const unsub = subscribeGpuTelemetry(listener);
    setGpuTelemetryEnabled(true);
    expect(isGpuTelemetryEnabled()).toBe(true);

    // Seed 10 initial slow frames (40ms) that will be evicted after 60 more fast frames
    for (let i = 0; i < 10; i += 1) {
      expect(
        publishGpuTelemetrySample(
          {
            frameMs: 40,
            drawCalls: 50,
            triangles: 180_000,
            geometries: 90,
            textures: 40,
            programs: 14,
            nowMs: 1000 + i * 16,
          },
          250
        )
      ).toBe(true);
    }

    // Immediate first sample triggers notification; subsequent samples within 250ms are throttled
    expect(listener).toHaveBeenCalledTimes(1);

    // Push 60 new frames: 57 frames at 16ms + 3 frames at 32ms -> wraps & evicts all 10 initial 40ms frames
    for (let i = 0; i < GPU_TELEMETRY_RING_SIZE; i += 1) {
      const frameMs = i >= 57 ? 32 : 16;
      publishGpuTelemetrySample(
        {
          frameMs,
          drawCalls: 64,
          triangles: 245_000,
          geometries: 102,
          textures: 48,
          programs: 15,
          nowMs: 1200 + i * 16,
        },
        250
      );
    }

    const snap = getGpuTelemetrySnapshot();
    expect(snap.enabled).toBe(true);
    expect(snap.sampleCount).toBe(70);
    // Exact average of 57 * 16 + 3 * 32 = (912 + 96) / 60 = 16.8 ms
    expect(snap.avgFrameMs).toBeCloseTo(16.8, 3);
    expect(snap.fps).toBeCloseTo(1000 / 16.8, 2);
    // 95th percentile of 60 samples = index ceil(60*0.95)-1 = 56 -> 16ms; verify sorted rank precisely
    expect(snap.p95FrameMs).toBeCloseTo(16, 3);
    expect(snap.drawCalls).toBe(64);
    expect(snap.triangles).toBe(245_000);
    expect(snap.geometries).toBe(102);
    expect(snap.textures).toBe(48);
    expect(snap.programs).toBe(15);

    // Push one more 32ms frame (now 4 frames at 32ms -> index 56 is 32ms!)
    publishGpuTelemetrySample(
      {
        frameMs: 32,
        drawCalls: 64,
        triangles: 245_000,
        geometries: 102,
        textures: 48,
        nowMs: 3000,
      },
      250
    );
    expect(getGpuTelemetrySnapshot().p95FrameMs).toBeCloseTo(32, 3);
    expect(listener.mock.calls.length).toBeGreaterThanOrEqual(4);

    // Disabling halts further recording cleanly
    setGpuTelemetryEnabled(false);
    const beforeCount = getGpuTelemetrySnapshot().sampleCount;
    expect(
      publishGpuTelemetrySample({
        frameMs: 10,
        drawCalls: 1,
        triangles: 10,
        geometries: 1,
        textures: 1,
        nowMs: 4000,
      })
    ).toBe(false);
    expect(getGpuTelemetrySnapshot().sampleCount).toBe(beforeCount);

    unsub();
  });

  it('maintains 100% zh/en key parity and zero CJK characters in EN telemetry strings', () => {
    const zhKeys = Object.keys(GPU_TELEMETRY_STRINGS.zh).sort();
    const enKeys = Object.keys(GPU_TELEMETRY_STRINGS.en).sort();
    expect(enKeys).toEqual(zhKeys);

    for (const key of zhKeys) {
      const zhVal =
        GPU_TELEMETRY_STRINGS.zh[key as keyof typeof GPU_TELEMETRY_STRINGS.zh];
      const enVal =
        GPU_TELEMETRY_STRINGS.en[key as keyof typeof GPU_TELEMETRY_STRINGS.en];
      expect(zhVal.trim().length, `zh.${key} empty`).toBeGreaterThan(0);
      expect(enVal.trim().length, `en.${key} empty`).toBeGreaterThan(0);
      expect(CJK_RE.test(enVal), `CJK found in en.${key}: "${enVal}"`).toBe(
        false
      );
    }

    // Confirm lazy CSS import & zero-overhead open guard in GpuTelemetryOverlay.tsx
    const overlaySrc = fs.readFileSync(
      path.join(
        REPO_ROOT,
        'src',
        'features',
        'workbench',
        'GpuTelemetryOverlay.tsx'
      ),
      'utf8'
    );
    expect(overlaySrc).toContain("import '../../styles/gpu-telemetry.css'");
    expect(overlaySrc).toContain('if (!open)');
    expect(overlaySrc).toContain('setGpuTelemetryEnabled(false)');
  });
});

describe('Cycle 3A — CNC Machined-Edge Bevel Glint in armoryShader.ts', () => {
  const MOCK_FRAGMENT = [
    ARMORY_COMMON_ANCHOR,
    ARMORY_SURFACE_ANCHOR,
    ARMORY_NORMAL_ANCHOR,
    ARMORY_EMISSIVE_ANCHOR,
    ARMORY_LIGHTS_MAPS_ANCHOR,
    ARMORY_AOMAP_ANCHOR,
    ARMORY_OPAQUE_ANCHOR,
  ].join('\n');

  it('restricts CNC bevel glint strictly to steel MaterialKind values', () => {
    const steelKinds: MaterialKind[] = [
      'nitride_steel',
      'barrel_steel',
      'stainless',
      'spring_steel',
    ];
    const nonSteelKinds: MaterialKind[] = [
      'polymer_frame',
      'follower_orange',
      'copper_accent',
    ];

    for (const kind of steelKinds) {
      expect(isCncBevelGlintMaterial(kind), `${kind} should be steel`).toBe(
        true
      );
    }
    for (const kind of nonSteelKinds) {
      expect(
        isCncBevelGlintMaterial(kind),
        `${kind} should not be steel glint`
      ).toBe(false);
    }
  });

  it('injects curvature-gated CNC bevel glint GLSL while preserving 32 unique shader cache keys', () => {
    expect(ARMORY_SHADER_VERSION).toBeGreaterThanOrEqual(9);
    expect(ARMORY_CNC_BEVEL_GLINT_MARKER).toBe('armoryCncBevelGlint');

    const injected = injectArmoryFragmentShader(MOCK_FRAGMENT, {
      spring: false,
      curvature: true,
      thermal: true,
      fouling: true,
      triplanarMap: true,
    });

    expect(injected).toContain('float armoryCncBevelMask = 0.0;');
    expect(injected).toContain(ARMORY_CNC_BEVEL_GLINT_MARKER);
    expect(injected).toContain('armoryLocalizedConvex');
    expect(injected).toContain('armoryIsCoolSteel');
    expect(injected).not.toContain('`');

    // Verify all 2^5 = 32 feature bitmask program cache keys remain distinct
    const keys = new Set<string>();
    for (let mask = 0; mask < 32; mask += 1) {
      keys.add(
        getArmoryProgramCacheKey({
          spring: Boolean(mask & 1),
          curvature: Boolean(mask & 2),
          thermal: Boolean(mask & 4),
          fouling: Boolean(mask & 8),
          triplanarMap: Boolean(mask & 16),
        })
      );
    }
    expect(keys.size).toBe(32);
  });
});

describe('Cycle 3A — Cinematic Firing VFX, Chamber Bounce Light & Zero-GC', () => {
  it('gates warm-amber chamber ignition bounce light strictly to [0.04, 0.24], disables for archery, and attenuates opaque vs cutaway', () => {
    expect(CHAMBER_IGNITION_LIGHT_COLOR).toBe('#ff9c42');
    expect(CHAMBER_IGNITION_WINDOW_START).toBeCloseTo(0.04, 4);
    expect(CHAMBER_IGNITION_WINDOW_END).toBeCloseTo(0.24, 4);

    // Strictly zero outside [0.04, 0.24]
    expect(
      computeChamberIgnitionBounceIntensity(0.0, '556_nato', false, true, 1.0)
    ).toBe(0);
    expect(
      computeChamberIgnitionBounceIntensity(
        0.039,
        '556_nato',
        false,
        true,
        1.0
      )
    ).toBe(0);
    expect(
      computeChamberIgnitionBounceIntensity(
        0.241,
        '556_nato',
        false,
        true,
        1.0
      )
    ).toBe(0);
    expect(
      computeChamberIgnitionBounceIntensity(0.55, '556_nato', false, true, 1.0)
    ).toBe(0);

    // Strictly zero for archery at all phases
    expect(
      computeChamberIgnitionBounceIntensity(
        0.11,
        'arrow_400gr',
        true,
        true,
        1.0
      )
    ).toBe(0);
    expect(
      computeChamberIgnitionBounceIntensity(
        0.11,
        'bolt_400gr',
        true,
        false,
        1.0
      )
    ).toBe(0);

    // Dramatic peak in CT cutaway vs restrained damping in assembled opaque view
    const cutawayPeak = computeChamberIgnitionBounceIntensity(
      0.11,
      '556_nato',
      false,
      true,
      0.92
    );
    const opaquePeak = computeChamberIgnitionBounceIntensity(
      0.11,
      '556_nato',
      false,
      false,
      0.92
    );
    const tailCutaway = computeChamberIgnitionBounceIntensity(
      0.22,
      '556_nato',
      false,
      true,
      0.25
    );

    expect(cutawayPeak).toBeGreaterThan(2.5);
    expect(opaquePeak).toBeGreaterThan(0);
    expect(cutawayPeak).toBeGreaterThan(opaquePeak * 3);
    expect(cutawayPeak).toBeGreaterThan(tailCutaway * 2);
  });

  it('scales firing VFX and chamber bounce light monotonically from pistol -> rifle -> .50 BMG -> 30mm GAU-8 -> MBT', () => {
    const ladder: CaliberProfile[] = [
      '9mm_para',
      '556_nato',
      '50_bmg',
      '30x173_gau8',
      '120mm_apfsds',
    ];
    const scales = ladder.map((c) => resolveCaliberVfxClassScale(c));
    const bouncePeaks = ladder.map((c) =>
      computeChamberIgnitionBounceIntensity(0.11, c, false, true, 0.9)
    );

    for (let i = 1; i < ladder.length; i += 1) {
      expect(
        scales[i].diamondScale,
        `${ladder[i]} diamondScale > ${ladder[i - 1]}`
      ).toBeGreaterThan(scales[i - 1].diamondScale);
      expect(
        scales[i].smokeScale,
        `${ladder[i]} smokeScale > ${ladder[i - 1]}`
      ).toBeGreaterThan(scales[i - 1].smokeScale);
      expect(
        scales[i].chamberBouncePeak,
        `${ladder[i]} chamberBouncePeak > ${ladder[i - 1]}`
      ).toBeGreaterThan(scales[i - 1].chamberBouncePeak);
      expect(
        bouncePeaks[i],
        `${ladder[i]} bouncePeak > ${ladder[i - 1]}`
      ).toBeGreaterThan(bouncePeaks[i - 1]);
    }
  });

  it('maintains strict Zero-GC inside useFrame and disposes memoized VFX geometries in BallisticsSystem & GasFlowVisualizer', () => {
    const ballisticsSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'engine', 'actors', 'BallisticsSystem.tsx'),
      'utf8'
    );
    const gasFlowSrc = fs.readFileSync(
      path.join(REPO_ROOT, 'src', 'engine', 'actors', 'GasFlowVisualizer.tsx'),
      'utf8'
    );

    const ballisticsUseFrame = extractUseFrameBody(ballisticsSrc);
    const gasFlowUseFrame = extractUseFrameBody(gasFlowSrc);

    expect(ballisticsUseFrame.length).toBeGreaterThan(500);
    expect(gasFlowUseFrame.length).toBeGreaterThan(500);

    expect(ballisticsUseFrame).not.toMatch(/\bnew THREE\./);
    expect(gasFlowUseFrame).not.toMatch(/\bnew THREE\./);

    expect(ballisticsSrc).toContain('muzzlePuffGeo.dispose()');
    expect(ballisticsSrc).toContain('smokeGeo.dispose()');
    expect(gasFlowSrc).not.toMatch(/new THREE\.(?:BufferGeometry|SphereGeometry|CylinderGeometry|ConeGeometry)/);
  });
});

describe('Cycle 3A — Visual Gate (--explode & webglInvariants) and WebGL Perf Soak Script', () => {
  it('supports --explode and --explode=both in qa_visual_gate.mjs --dry-run without breaking default mode', async () => {
    const out = execFileSync(
      process.execPath,
      [
        QA_VISUAL_SCRIPT,
        '--dry-run',
        '--url',
        'http://127.0.0.1:4173',
        '--weapons',
        'ak15,ztz99a',
        '--cut',
        '--explode=both',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );

    const plan = JSON.parse(out);
    expect(plan.dryRun).toBe(true);
    expect(plan.targets).toHaveLength(4);
    expect(plan.targets.map((t: { id: string }) => t.id)).toEqual([
      'workbench-ak15-cut',
      'workbench-ak15-cut-explode',
      'workbench-ztz99a-cut',
      'workbench-ztz99a-cut-explode',
    ]);
    expect(plan.targets[1].url).toBe(
      'http://127.0.0.1:4173/?screen=workbench&weapon=ak15&cut=1&explode=1'
    );
    expect(plan.targets[1].explode).toBe(true);
    expect(plan.targets[0].explode).toBe(false);

    const visualGateUrl = pathToFileURL(QA_VISUAL_SCRIPT).href;
    const visualGateMod = (await import(
      /* @vite-ignore */ visualGateUrl
    )) as {
      summarizeWebglInvariants: (results: unknown[]) => {
        webglTargetCount: number;
        canvasesVerified: number;
        allCanvasesPresent: boolean;
        errorBoundaryHits: number;
        zeroConsoleErrors: boolean;
        zeroPageErrors: boolean;
        zeroFailedRequests: boolean;
        allInvariantsPassed: boolean;
      };
    };

    const passSummary = visualGateMod.summarizeWebglInvariants([
      {
        screen: 'workbench',
        expectsWebgl: true,
        canvas: { width: 1920, height: 1080 },
        reasons: [],
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      },
      {
        screen: 'armory',
        expectsWebgl: false,
        canvas: null,
        reasons: [],
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      },
    ]);
    expect(passSummary.webglTargetCount).toBe(1);
    expect(passSummary.canvasesVerified).toBe(1);
    expect(passSummary.allInvariantsPassed).toBe(true);

    const failSummary = visualGateMod.summarizeWebglInvariants([
      {
        screen: 'workbench',
        expectsWebgl: true,
        canvas: null,
        reasons: ['missing-webgl-canvas', 'webgl-error-boundary-rendered'],
        consoleErrors: ['WebGL error'],
        pageErrors: [],
        failedRequests: [],
      },
    ]);
    expect(failSummary.allCanvasesPresent).toBe(false);
    expect(failSummary.errorBoundaryHits).toBe(1);
    expect(failSummary.zeroConsoleErrors).toBe(false);
    expect(failSummary.allInvariantsPassed).toBe(false);
  });

  it('plans 12 default soak exhibits in qa_perf_soak.mjs --dry-run and summarizes soak metrics accurately', async () => {
    const defaultDryOut = execFileSync(
      process.execPath,
      [QA_SOAK_SCRIPT, '--dry-run', '--url', 'http://127.0.0.1:4173'],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const defaultPlan = JSON.parse(defaultDryOut);
    expect(defaultPlan.dryRun).toBe(true);
    expect(defaultPlan.targets).toHaveLength(12);
    expect(
      defaultPlan.targets.map((t: { weaponId: string }) => t.weaponId)
    ).toEqual([
      'ak15',
      'p08',
      'deagle',
      'm1911',
      'mg42',
      'k98k',
      'thompson',
      'gau8',
      'lift33',
      'ztz99a',
      'm1a2',
      'tiger1',
    ]);
    expect(defaultPlan.targets[0].url).toBe(
      'http://127.0.0.1:4173/?screen=workbench&weapon=ak15'
    );

    const customDryOut = execFileSync(
      process.execPath,
      [
        QA_SOAK_SCRIPT,
        '--dry-run',
        '--url',
        'http://127.0.0.1:4173',
        '--weapons',
        'ak15,deagle,ztz99a',
        '--lang',
        'en',
      ],
      { cwd: REPO_ROOT, encoding: 'utf8' }
    );
    const customPlan = JSON.parse(customDryOut);
    expect(customPlan.targets).toHaveLength(3);
    expect(customPlan.targets[2].url).toBe(
      'http://127.0.0.1:4173/?screen=workbench&weapon=ztz99a&lang=en'
    );

    const soakUrl = pathToFileURL(QA_SOAK_SCRIPT).href;
    const soakMod = (await import(/* @vite-ignore */ soakUrl)) as {
      DEFAULT_SOAK_WEAPONS: readonly string[];
      parseSoakCliArgs: (argv: string[]) => {
        weapons: string[];
        json: boolean;
        sampleMs: number;
      };
      summarizeSoakResults: (results: unknown[]) => {
        totalExhibits: number;
        passedExhibits: number;
        failedExhibits: number;
        totalConsoleErrors: number;
        totalPageErrors: number;
        totalFailedRequests: number;
        avgSettleMs: number;
        maxSettleMs: number;
        minFps: number;
        avgFps: number;
        maxFps: number;
        heapBytesStart: number | null;
        heapBytesEnd: number | null;
        heapBytesPeak: number | null;
        heapDeltaBytes: number | null;
        heapGrowthRatio: number | null;
        allInvariantsPassed: boolean;
      };
    };

    expect(soakMod.DEFAULT_SOAK_WEAPONS).toHaveLength(12);
    const parsed = soakMod.parseSoakCliArgs([
      '--weapons',
      'ak15,ztz99a',
      '--sample-ms',
      '800',
      '--json',
    ]);
    expect(parsed.weapons).toEqual(['ak15', 'ztz99a']);
    expect(parsed.sampleMs).toBe(800);
    expect(parsed.json).toBe(true);

    const summary = soakMod.summarizeSoakResults([
      {
        weaponId: 'ak15',
        passed: true,
        settleMs: 1400,
        fps: 58.2,
        jsHeapUsedBytes: 100_000_000,
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      },
      {
        weaponId: 'ztz99a',
        passed: true,
        settleMs: 2200,
        fps: 46.8,
        jsHeapUsedBytes: 125_000_000,
        consoleErrors: [],
        pageErrors: [],
        failedRequests: [],
      },
    ]);
    expect(summary.totalExhibits).toBe(2);
    expect(summary.passedExhibits).toBe(2);
    expect(summary.avgSettleMs).toBe(1800);
    expect(summary.maxSettleMs).toBe(2200);
    expect(summary.minFps).toBe(46.8);
    expect(summary.maxFps).toBe(58.2);
    expect(summary.avgFps).toBe(52.5);
    expect(summary.heapDeltaBytes).toBe(25_000_000);
    expect(summary.heapGrowthRatio).toBe(1.25);
    expect(summary.allInvariantsPassed).toBe(true);

    const failedSummary = soakMod.summarizeSoakResults([
      {
        weaponId: 'ak15',
        passed: false,
        settleMs: 1000,
        fps: 60,
        jsHeapUsedBytes: null,
        consoleErrors: ['err'],
        pageErrors: [],
        failedRequests: [],
      },
    ]);
    expect(failedSummary.heapBytesStart).toBeNull();
    expect(failedSummary.totalConsoleErrors).toBe(1);
    expect(failedSummary.allInvariantsPassed).toBe(false);
  });
});

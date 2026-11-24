#!/usr/bin/env node
/**
 * Digital Armory 3D — Production Subpath (`/digital-armory-3d/`) Zero-404 E2E Verifier
 * & Rapid Multi-Exhibit WebGL VRAM / Geometry / Texture Memory-Leak Soak Harness
 *
 * Phase 1 (Subpath Zero-404 E2E):
 *   Builds a production bundle with `VITE_BASE_PATH=/digital-armory-3d/` into an
 *   isolated temporary directory (never touching workspace `dist/`), mounts a strict
 *   local static HTTP server serving ONLY under `/digital-armory-3d/` (returning 404
 *   and recording a hard failure for any rogue root-path asset fetch), and audits
 *   12 flagship museum routes in headless Chromium.
 *
 * Phase 2 (12-Exhibit Single-Tab WebGL Memory-Leak Soak):
 *   Inside a single persistent browser tab (zero full reloads, zero WebGL context
 *   recreation), transitions live via SPA history/popstate across 12 diverse exhibits:
 *     ak15 -> deagle -> garand -> python -> mg42 -> k98k -> thompson -> an94 ->
 *     g11 -> gau8 -> ztz99a -> ak15
 *   Reads live `gl.info.memory` (`geometries`, `textures`, `programs`), `gl.info.render`
 *   (`drawCalls`, `triangles`), geometry/PBR LRU cache counts from `GpuTelemetryOverlay`,
 *   and Chrome V8 `JSHeapUsedSize` via CDP `Performance.getMetrics` to verify bounded
 *   VRAM/LRU behavior and zero WebGL context losses.
 *
 * Usage:
 *   npm run qa:subpath -- --json
 *   npm run qa:subpath -- --skip-build --build-dir /tmp/armory-subpath
 *   npm run qa:subpath -- --dry-run --json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChromiumLaunchArgs,
  discoverChromiumExecutable,
} from './dk_pdf_utils.mjs';
import {
  FLEET_READINESS_PROBE_SCRIPT,
  HEAVY_EXHIBIT_IDS,
} from './qa_full_fleet_audit.mjs';
import {
  DEFAULT_REPO_ROOT,
  NativeCdpClient,
  QA_DEVICE_SCALE_FACTOR,
  QA_VIEWPORT_HEIGHT,
  QA_VIEWPORT_WIDTH,
  summarizeWebglInvariants,
  WAIT_STABILIZE_FRAMES_SCRIPT,
  waitForTargetReadiness,
} from './qa_visual_gate.mjs';

export const DEFAULT_SUBPATH_BASE = '/digital-armory-3d/';

export const SUBPATH_AUDIT_ROUTES = Object.freeze([
  { id: 'subpath:showcase', screen: 'showcase', query: 'screen=showcase', expectsWebgl: false },
  { id: 'subpath:armory', screen: 'armory', query: 'screen=armory', expectsWebgl: true },
  {
    id: 'subpath:wb_ak15',
    screen: 'workbench',
    weaponId: 'ak15',
    query: 'screen=workbench&weapon=ak15',
    expectsWebgl: true,
  },
  {
    id: 'subpath:wb_deagle_cut',
    screen: 'workbench',
    weaponId: 'deagle',
    query: 'screen=workbench&weapon=deagle&cut=1',
    expectsWebgl: true,
  },
  {
    id: 'subpath:wb_ztz99a',
    screen: 'workbench',
    weaponId: 'ztz99a',
    query: 'screen=workbench&weapon=ztz99a',
    expectsWebgl: true,
  },
  {
    id: 'subpath:wb_gau8',
    screen: 'workbench',
    weaponId: 'gau8',
    query: 'screen=workbench&weapon=gau8',
    expectsWebgl: true,
  },
  {
    id: 'subpath:cartridges',
    screen: 'cartridges',
    query: 'screen=cartridges',
    expectsWebgl: true,
  },
  {
    id: 'subpath:ballistics',
    screen: 'ballistics',
    query: 'screen=ballistics',
    expectsWebgl: true,
  },
  {
    id: 'subpath:split_showdown',
    screen: 'split_showdown',
    weaponId: 'gau8',
    query: 'screen=split_showdown&weaponA=gau8&weaponB=m134',
    expectsWebgl: true,
  },
  {
    id: 'subpath:panel_armor',
    screen: 'armory',
    query: 'panel=armor',
    expectsWebgl: true,
  },
  {
    id: 'subpath:panel_scalewall',
    screen: 'armory',
    query: 'panel=scalewall',
    expectsWebgl: true,
  },
  {
    id: 'subpath:panel_recoil',
    screen: 'armory',
    query: 'panel=recoil',
    expectsWebgl: true,
  },
]);

export const SOAK_EXHIBIT_SEQUENCE = Object.freeze([
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

export const ROGUE_ROOT_ASSET_PREFIXES = Object.freeze([
  '/models/',
  '/textures/',
  '/audio/',
  '/plates/',
  '/hdri/',
  '/narrations/',
  '/draco/',
  '/basis/',
  '/assets/',
  '/sw.js',
  '/manifest.webmanifest',
  '/favicon.ico',
]);

export const DEFAULT_MEMORY_SOAK_LIMITS = Object.freeze({
  maxCachedWeapons: 6,
  maxEndGeometries: 650,
  maxEndTextures: 180,
  maxPostLruGeoDelta: 180,
  maxPostLruTexDelta: 45,
  maxJsHeapGrowthMb: 350,
});

const DEFAULT_SETTLE_MS = 900;
const HEAVY_MIN_SETTLE_MS = 1_200;
const DEFAULT_TIMEOUT_MS = 45_000;
const DETACHED_WORKER_RE = /(?:\.worker(?:[-.][^/?#]*)?\.js|\/sw\.js)(?:[?#]|$)/i;

const MIME_TYPES = Object.freeze({
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wasm': 'application/wasm',
  '.glb': 'model/gltf-binary',
  '.gltf': 'model/gltf+json',
  '.hdr': 'application/octet-stream',
  '.ktx2': 'image/ktx2',
  '.mp3': 'audio/mpeg',
  '.wav': 'audio/wav',
  '.ogg': 'audio/ogg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.txt': 'text/plain; charset=utf-8',
});

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(msg, jsonMode = false) {
  const stream = jsonMode ? process.stderr : process.stdout;
  stream.write(`[qa-subpath] ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[qa-subpath] ERROR: ${msg}\n`);
}

/**
 * Normalizes a Vite base path to always start and end with `/`.
 */
export function normalizeBasePath(raw) {
  const trimmed = String(raw ?? '').trim();
  if (!trimmed || trimmed === '/') return '/';
  const withLeading = trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
  return withLeading.endsWith('/') ? withLeading : `${withLeading}/`;
}

/**
 * Returns true if `pathname` is a rogue root-path asset request outside the
 * configured non-root `basePath` (e.g., `/models/ak15.glb` when mounted at
 * `/digital-armory-3d/`).
 */
export function isRogueRootAssetPath(pathname, basePath = DEFAULT_SUBPATH_BASE) {
  const normBase = normalizeBasePath(basePath);
  if (normBase === '/') return false;
  const cleanPath = String(pathname ?? '').split(/[?#]/)[0];
  if (!cleanPath.startsWith('/')) return false;
  if (cleanPath === normBase || cleanPath.startsWith(normBase)) {
    return false;
  }
  const baseNoSlash = normBase.slice(0, -1);
  if (cleanPath === baseNoSlash) return false;
  return true;
}

/**
 * Builds the ordered list of 12 production subpath verification targets.
 */
export function buildSubpathAuditTargets(origin, basePath = DEFAULT_SUBPATH_BASE) {
  const cleanOrigin = String(origin).replace(/\/+$/, '');
  const normBase = normalizeBasePath(basePath);
  return SUBPATH_AUDIT_ROUTES.map((route) => ({
    id: route.id,
    screen: route.screen,
    weaponId: route.weaponId ?? null,
    expectsWebgl: route.expectsWebgl,
    url: `${cleanOrigin}${normBase}?${route.query}`,
  }));
}

/**
 * Parses CLI flags for `scripts/qa_subpath_and_memory.mjs`.
 */
export function parseSubpathCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    basePath: DEFAULT_SUBPATH_BASE,
    skipBuild: false,
    buildDir: null,
    runSubpath: true,
    runSoak: true,
    settleMs: DEFAULT_SETTLE_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    executablePath: null,
    repoRoot: DEFAULT_REPO_ROOT,
    json: false,
    dryRun: false,
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
      case '--base-path': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.basePath = normalizeBasePath(value);
        break;
      }
      case '--skip-build':
        opts.skipBuild = true;
        break;
      case '--build-dir': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.buildDir = path.resolve(value);
        break;
      }
      case '--soak':
        opts.runSoak = true;
        break;
      case '--soak-only':
        opts.runSubpath = false;
        opts.runSoak = true;
        break;
      case '--subpath-only':
        opts.runSubpath = true;
        opts.runSoak = false;
        break;
      case '--settle-ms': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0) {
          throw new Error(`Invalid --settle-ms "${value}".`);
        }
        opts.settleMs = Math.round(n);
        break;
      }
      case '--timeout-ms': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 1000) {
          throw new Error(`Invalid --timeout-ms "${value}".`);
        }
        opts.timeoutMs = Math.round(n);
        break;
      }
      case '--executable-path': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.executablePath = path.resolve(value);
        break;
      }
      case '--root': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.repoRoot = path.resolve(value);
        break;
      }
      case '--json':
        opts.json = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
      default:
        throw new Error(
          `Unknown option "${flag}". Run with --help to see supported options.`
        );
    }
  }

  return opts;
}

export function formatSubpathHelpText() {
  return `Digital Armory 3D — Production Subpath Zero-404 & WebGL Memory-Leak Soak Harness

Usage:
  npm run qa:subpath -- [options]
  node scripts/qa_subpath_and_memory.mjs [options]

Options:
  --base-path <path>       Subpath mount prefix (default: ${DEFAULT_SUBPATH_BASE})
  --skip-build             Reuse an existing subpath build (pass --build-dir <dir>)
  --build-dir <dir>        Directory of pre-built subpath dist/ when --skip-build is set
  --soak                   Include the 12-exhibit single-tab WebGL memory soak (enabled by default)
  --soak-only              Run only the 12-exhibit memory soak
  --subpath-only           Run only the 12-route subpath zero-404 audit
  --settle-ms <ms>         Additional settle delay after readiness (default: ${DEFAULT_SETTLE_MS})
  --timeout-ms <ms>        Per-route readiness timeout (default: ${DEFAULT_TIMEOUT_MS})
  --executable-path <path> Override Chromium/Chrome binary path
  --dry-run                Print planned routes & soak sequence without building or launching Chromium
  --json                   Emit structured JSON report to stdout
  -h, --help               Show this help text
`;
}

/**
 * Pure evaluator verifying bounded GPU VRAM (geometries, textures, LRU cache),
 * JS heap stability, and zero WebGL context losses across the 12-exhibit soak.
 */
export function evaluateMemorySoakBounds(
  samples,
  {
    contextLosses = 0,
    consoleErrors = [],
    pageErrors = [],
    failedRequests = [],
    rogueRootRequests = [],
    singleTabPreserved = true,
    limits = DEFAULT_MEMORY_SOAK_LIMITS,
  } = {}
) {
  const list = Array.isArray(samples) ? samples : [];
  const reasons = [];

  if (list.length < 2) {
    return {
      passed: false,
      reasons: ['Insufficient memory soak samples (expected >= 2).'],
      baseline: list[0] ?? null,
      plateau: null,
      final: list[list.length - 1] ?? null,
      peak: null,
      deltas: null,
    };
  }

  const baseline = list[0];
  // Once 6 distinct exhibits have loaded (index 5/6), geometry LRU (cap 6) and
  // PBR texture LRU (cap 5) are saturated; comparing plateau -> final detects leaks.
  const plateauIndex = Math.min(6, Math.max(1, list.length - 2));
  const plateau = list[plateauIndex];
  const final = list[list.length - 1];

  const validNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const maxOf = (key) => {
    const vals = list.map((s) => s[key]).filter(validNum);
    return vals.length > 0 ? Math.max(...vals) : null;
  };

  const peak = {
    geometries: maxOf('geometries'),
    textures: maxOf('textures'),
    programs: maxOf('programs'),
    cachedWeapons: maxOf('cachedWeapons'),
    pbrTextures: maxOf('pbrTextures'),
    jsHeapMb: maxOf('jsHeapMb'),
  };

  const delta = (a, b) =>
    validNum(a) && validNum(b) ? Number((b - a).toFixed(2)) : null;

  const deltas = {
    totalGeometries: delta(baseline.geometries, final.geometries),
    totalTextures: delta(baseline.textures, final.textures),
    postLruGeometries: delta(plateau.geometries, final.geometries),
    postLruTextures: delta(plateau.textures, final.textures),
    totalJsHeapMb: delta(baseline.jsHeapMb, final.jsHeapMb),
    postLruJsHeapMb: delta(plateau.jsHeapMb, final.jsHeapMb),
  };

  if (!singleTabPreserved) {
    reasons.push('Soak triggered an unexpected full page reload instead of in-place SPA switching.');
  }
  if (contextLosses > 0) {
    reasons.push(`WebGL context lost ${contextLosses} time(s) during soak.`);
  }
  if (consoleErrors.length > 0) {
    reasons.push(`consoleErrors=${consoleErrors.length}`);
  }
  if (pageErrors.length > 0) {
    reasons.push(`pageErrors=${pageErrors.length}`);
  }
  if (failedRequests.length > 0) {
    reasons.push(`failedRequests=${failedRequests.length}`);
  }
  if (rogueRootRequests.length > 0) {
    reasons.push(`rogueRootRequests=${rogueRootRequests.length}`);
  }

  if (!validNum(baseline.geometries) || !validNum(final.geometries)) {
    reasons.push('Missing live WebGL geometry telemetry samples.');
  } else {
    if (final.geometries > limits.maxEndGeometries) {
      reasons.push(
        `Final GPU geometries ${final.geometries} exceeded limit ${limits.maxEndGeometries}.`
      );
    }
    if (
      validNum(deltas.postLruGeometries) &&
      deltas.postLruGeometries > limits.maxPostLruGeoDelta
    ) {
      reasons.push(
        `Post-LRU geometry drift +${deltas.postLruGeometries} exceeded limit ${limits.maxPostLruGeoDelta}.`
      );
    }
  }

  if (!validNum(baseline.textures) || !validNum(final.textures)) {
    reasons.push('Missing live WebGL texture telemetry samples.');
  } else {
    if (final.textures > limits.maxEndTextures) {
      reasons.push(
        `Final GPU textures ${final.textures} exceeded limit ${limits.maxEndTextures}.`
      );
    }
    if (
      validNum(deltas.postLruTextures) &&
      deltas.postLruTextures > limits.maxPostLruTexDelta
    ) {
      reasons.push(
        `Post-LRU texture drift +${deltas.postLruTextures} exceeded limit ${limits.maxPostLruTexDelta}.`
      );
    }
  }

  if (
    validNum(peak.cachedWeapons) &&
    peak.cachedWeapons > limits.maxCachedWeapons
  ) {
    reasons.push(
      `Geometry LRU cachedWeapons peak ${peak.cachedWeapons} exceeded cap ${limits.maxCachedWeapons}.`
    );
  }

  if (
    validNum(deltas.totalJsHeapMb) &&
    deltas.totalJsHeapMb > limits.maxJsHeapGrowthMb
  ) {
    reasons.push(
      `JS heap growth +${deltas.totalJsHeapMb} MB exceeded limit ${limits.maxJsHeapGrowthMb} MB.`
    );
  }

  return {
    passed: reasons.length === 0,
    reasons,
    baseline,
    plateau,
    final,
    peak,
    deltas,
  };
}

export function formatSubpathSummaryTable(report) {
  const lines = [];
  lines.push(
    '===================================================================================================='
  );
  lines.push(
    ` Digital Armory 3D — Subpath (${report.basePath}) Zero-404 & WebGL Memory Soak Audit`
  );
  lines.push(
    '===================================================================================================='
  );

  if (report.subpath) {
    lines.push(
      ' Route                   | Screen         |  Load | Cons | Page | Net | Rogue | BrkImg | Status'
    );
    lines.push(
      '----------------------------------------------------------------------------------------------------'
    );
    for (const r of report.subpath.results) {
      lines.push(
        ` ${r.id.padEnd(23)} | ${r.screen.padEnd(14)} | ${`${r.loadMs}ms`.padStart(5)} | ${String(r.consoleErr).padStart(4)} | ${String(r.pageErr).padStart(4)} | ${String(r.failedReq).padStart(3)} | ${String(r.rogueRootReq).padStart(5)} | ${String(r.brokenImgs).padStart(6)} | ${r.passed ? 'PASS' : 'FAIL'}`
      );
    }
    lines.push(
      ` Subpath Summary : ${report.subpath.passedCount}/${report.subpath.totalRoutes} passed · rogueRoot=${report.subpath.totalRogueRootRequests} · httpErrors=${report.subpath.totalFailedRequests}`
    );
  }

  if (report.memorySoak) {
    lines.push(
      '----------------------------------------------------------------------------------------------------'
    );
    lines.push(
      ' Step | Exhibit  | Switch | Geos | Texs | Progs | Calls | LRU Wpn | PBR Tex | JS Heap MB'
    );
    lines.push(
      '----------------------------------------------------------------------------------------------------'
    );
    for (const s of report.memorySoak.samples) {
      const n = (v, pad) =>
        typeof v === 'number' && Number.isFinite(v)
          ? String(v).padStart(pad)
          : 'n/a'.padStart(pad);
      const heap =
        typeof s.jsHeapMb === 'number'
          ? s.jsHeapMb.toFixed(1).padStart(10)
          : 'n/a'.padStart(10);
      lines.push(
        ` ${String(s.step).padStart(4)} | ${s.weaponId.padEnd(8)} | ${`${s.switchMs}ms`.padStart(6)} | ${n(s.geometries, 4)} | ${n(s.textures, 4)} | ${n(s.programs, 5)} | ${n(s.drawCalls, 5)} | ${n(s.cachedWeapons, 7)} | ${n(s.pbrTextures, 7)} | ${heap}`
      );
    }
    lines.push(
      ` Soak Summary    : ${report.memorySoak.passed ? 'PASS' : 'FAIL'} · contextLosses=${report.memorySoak.contextLosses} · peakGeo=${report.memorySoak.evaluation?.peak?.geometries ?? 'n/a'} · peakTex=${report.memorySoak.evaluation?.peak?.textures ?? 'n/a'} · endHeap=${report.memorySoak.evaluation?.final?.jsHeapMb ?? 'n/a'} MB`
    );
  }

  lines.push(
    '===================================================================================================='
  );
  return `${lines.join('\n')}\n`;
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve();
    };
    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      finish();
      return;
    }
    const timer = setTimeout(() => {
      try {
        if (child.exitCode === null) child.kill('SIGKILL');
      } catch {
        // ignore
      }
      finish();
    }, 3000);
    timer.unref?.();
  });
}

/**
 * Builds a clean production bundle into `outDir` with `VITE_BASE_PATH=basePath`.
 */
async function buildSubpathDist(repoRoot, basePath, outDir, jsonMode) {
  const viteJsPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');
  const cmd = fs.existsSync(viteJsPath) ? process.execPath : 'npx';
  const args = fs.existsSync(viteJsPath)
    ? [viteJsPath, 'build', '--outDir', outDir, '--emptyOutDir']
    : ['vite', 'build', '--outDir', outDir, '--emptyOutDir'];

  logInfo(
    `Building production bundle with VITE_BASE_PATH=${basePath} into temp dir ${outDir}...`,
    jsonMode
  );
  const startedAt = Date.now();

  await new Promise((resolve, reject) => {
    const child = spawn(cmd, args, {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
      env: {
        ...process.env,
        VITE_BASE_PATH: basePath,
        FORCE_COLOR: '0',
        NO_COLOR: '1',
      },
    });
    let stderrBuf = '';
    let stdoutBuf = '';
    child.stdout.on('data', (c) => {
      stdoutBuf += c.toString('utf8');
    });
    child.stderr.on('data', (c) => {
      stderrBuf += c.toString('utf8');
    });
    child.once('error', (err) => reject(err));
    child.once('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(
          new Error(
            `Subpath Vite build failed (exit ${code}).\nSTDOUT:\n${stdoutBuf.slice(-1500)}\nSTDERR:\n${stderrBuf.slice(-1500)}`
          )
        );
      }
    });
  });

  logInfo(
    `Subpath build ready in ${((Date.now() - startedAt) / 1000).toFixed(2)}s.`,
    jsonMode
  );
}

/**
 * Starts a strict local static HTTP server that serves files ONLY under `basePath`.
 * Any request outside `basePath` (such as a rogue `/models/...` or `/textures/...`
 * root-path fetch) returns HTTP 404 and is recorded immediately.
 */
export async function startStrictSubpathServer(distDir, basePath = DEFAULT_SUBPATH_BASE) {
  const normBase = normalizeBasePath(basePath);
  const baseNoSlash = normBase.length > 1 ? normBase.slice(0, -1) : '/';
  const rootResolved = path.resolve(distDir);
  let activeRecorder = null;

  const setRecorder = (recorder) => {
    activeRecorder = recorder;
  };

  const server = http.createServer((req, res) => {
    const rawUrl = req.url || '/';
    let pathname = '/';
    try {
      pathname = decodeURIComponent(
        new URL(rawUrl, 'http://127.0.0.1').pathname
      );
    } catch {
      res.writeHead(400, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Bad Request');
      return;
    }

    if (normBase !== '/' && pathname === baseNoSlash) {
      res.writeHead(301, { Location: `${normBase}${rawUrl.includes('?') ? rawUrl.slice(rawUrl.indexOf('?')) : ''}` });
      res.end();
      return;
    }

    if (isRogueRootAssetPath(pathname, normBase)) {
      activeRecorder?.rogueRootRequests.push(`${req.method || 'GET'} ${pathname}`);
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end(`404 Rogue root-path request outside ${normBase}: ${pathname}`);
      return;
    }

    const relPath =
      normBase === '/' ? pathname.slice(1) : pathname.slice(normBase.length);
    const targetRel = relPath === '' || relPath.endsWith('/') ? `${relPath}index.html` : relPath;
    const candidatePath = path.resolve(rootResolved, targetRel);

    if (
      candidatePath !== rootResolved &&
      !candidatePath.startsWith(`${rootResolved}${path.sep}`)
    ) {
      res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Forbidden');
      return;
    }

    let filePath = candidatePath;
    if (!fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
      const idxPath = path.join(filePath, 'index.html');
      if (fs.existsSync(idxPath)) {
        filePath = idxPath;
      } else {
        activeRecorder?.missingFiles.push(`${req.method || 'GET'} ${pathname}`);
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        res.end(`404 Not Found: ${pathname}`);
        return;
      }
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const stat = fs.statSync(filePath);
    res.writeHead(200, {
      'Content-Type': contentType,
      'Content-Length': stat.size,
      'Cache-Control': ext === '.html' ? 'no-cache' : 'public, max-age=300',
    });
    if (req.method === 'HEAD') {
      res.end();
      return;
    }
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const addr = server.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  const origin = `http://127.0.0.1:${port}`;

  return {
    origin,
    port,
    basePath: normBase,
    setRecorder,
    stop: async () => {
      await new Promise((resolve) => {
        server.closeAllConnections?.();
        server.close(() => resolve());
      });
    },
  };
}

/**
 * Opens `GpuTelemetryOverlay` via WorkbenchHeader's real Tools menu button and
 * installs a `webglcontextlost` counter + single-tab session marker.
 */
const INIT_SOAK_TELEMETRY_SCRIPT = `(async () => {
  window.__armorySoakSessionToken = 'soak-' + Date.now();
  window.__armorySoakContextLosses = 0;
  const attachLossListener = () => {
    const canvas = document.querySelector('canvas');
    if (canvas && !canvas.__armorySoakBound) {
      canvas.__armorySoakBound = true;
      canvas.addEventListener('webglcontextlost', () => {
        window.__armorySoakContextLosses += 1;
      });
    }
  };
  attachLossListener();

  const waitFrames = async (n) => {
    for (let i = 0; i < n; i += 1) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  };

  if (!document.querySelector('[data-testid="gpu-telemetry-overlay"]')) {
    const toolsBtn = document.querySelector('button.workbench-tools-trigger');
    if (toolsBtn instanceof HTMLElement) {
      toolsBtn.click();
      await waitFrames(4);
      const toggleBtn = document.querySelector('[data-testid="wb-gpu-telemetry-toggle"]');
      if (toggleBtn instanceof HTMLElement) {
        toggleBtn.click();
        await waitFrames(6);
      }
    }
  }

  return {
    token: window.__armorySoakSessionToken,
    overlayMounted: Boolean(document.querySelector('[data-testid="gpu-telemetry-overlay"]')),
  };
})()`;

/**
 * Reads live WebGL memory (`geometries`, `textures`, `programs`), render stats
 * (`drawCalls`, `triangles`), geometry LRU & PBR cache counters, and JS heap
 * from the live `GpuTelemetryOverlay` DOM + `performance.memory`.
 */
const READ_SOAK_TELEMETRY_SCRIPT = `(async () => {
  const parseCompactNum = (raw) => {
    if (!raw) return null;
    const text = String(raw).trim().toLowerCase();
    const m = /([0-9]+(?:\\.[0-9]+)?)\\s*([km])?/.exec(text);
    if (!m) return null;
    const base = Number(m[1]);
    if (!Number.isFinite(base)) return null;
    if (m[2] === 'm') return Math.round(base * 1_000_000);
    if (m[2] === 'k') return Math.round(base * 1_000);
    return Math.round(base);
  };
  const parseIntSafe = (raw) => {
    const n = Number(String(raw ?? '').replace(/[^0-9.-]/g, ''));
    return Number.isFinite(n) ? Math.round(n) : null;
  };

  // Poll briefly so ArmoryPostProcessing publishes a fresh frame to gpuTelemetryBus
  for (let attempt = 0; attempt < 25; attempt += 1) {
    const overlay = document.querySelector('[data-testid="gpu-telemetry-overlay"]');
    if (overlay) {
      const kpis = Array.from(overlay.querySelectorAll('.gpu-telemetry-kpi'));
      const sections = Array.from(overlay.querySelectorAll('.gpu-telemetry-section'));
      const webglVals = sections[0]
        ? Array.from(sections[0].querySelectorAll('.gpu-telemetry-row-val')).map((el) =>
            parseIntSafe(el.textContent)
          )
        : [];
      const geoVals = sections[1]
        ? Array.from(sections[1].querySelectorAll('.gpu-telemetry-row-val')).map((el) =>
            el.textContent?.trim() ?? ''
          )
        : [];
      const pbrVals = sections[2]
        ? Array.from(sections[2].querySelectorAll('.gpu-telemetry-row-val')).map((el) =>
            el.textContent?.trim() ?? ''
          )
        : [];
      const lruEl = overlay.querySelector('.gpu-telemetry-lru');
      const lruTitle = lruEl?.getAttribute('title') || lruEl?.textContent || '';
      const drawCalls = kpis[2]
        ? parseIntSafe(kpis[2].querySelector('.gpu-telemetry-kpi-value')?.textContent)
        : null;
      const triangles = kpis[2]
        ? parseCompactNum(kpis[2].querySelector('.gpu-telemetry-kpi-sub')?.textContent)
        : null;
      const geometries = webglVals[0] ?? null;
      const textures = webglVals[1] ?? null;
      const programs = webglVals[2] ?? null;
      if (geometries !== null && geometries > 0 && drawCalls !== null) {
        const mem = performance && 'memory' in performance ? performance.memory : null;
        return {
          overlayMounted: true,
          geometries,
          textures,
          programs,
          drawCalls,
          triangles,
          cachedWeapons: parseIntSafe(geoVals[0]),
          cachedParts: parseIntSafe(geoVals[1]),
          glbCsgSplit: geoVals[2] || null,
          lruOrder: lruTitle,
          pbrTextures: parseIntSafe(pbrVals[0]),
          perfHeapMb:
            mem && typeof mem.usedJSHeapSize === 'number'
              ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2))
              : null,
          contextLosses: Number(window.__armorySoakContextLosses || 0),
          sessionToken: window.__armorySoakSessionToken ?? null,
          title: document.title,
          href: window.location.href,
        };
      }
    }
    await new Promise((r) => setTimeout(r, 120));
  }

  const mem = performance && 'memory' in performance ? performance.memory : null;
  return {
    overlayMounted: Boolean(document.querySelector('[data-testid="gpu-telemetry-overlay"]')),
    geometries: null,
    textures: null,
    programs: null,
    drawCalls: null,
    triangles: null,
    cachedWeapons: null,
    cachedParts: null,
    glbCsgSplit: null,
    lruOrder: null,
    pbrTextures: null,
    perfHeapMb:
      mem && typeof mem.usedJSHeapSize === 'number'
        ? Number((mem.usedJSHeapSize / (1024 * 1024)).toFixed(2))
        : null,
    contextLosses: Number(window.__armorySoakContextLosses || 0),
    sessionToken: window.__armorySoakSessionToken ?? null,
    title: document.title,
    href: window.location.href,
  };
})()`;

async function launchNativeCdpBrowser(opts) {
  const discovered = discoverChromiumExecutable({
    explicitPath: opts.executablePath,
  });
  if (!discovered) {
    throw new Error(
      opts.executablePath
        ? `Chromium executable not found at "${opts.executablePath}".`
        : 'No Chromium/Chrome executable found. Install Playwright Chromium or pass --executable-path.'
    );
  }

  logInfo(
    `Launching headless Chromium via native-cdp (${discovered.source})...`,
    opts.json
  );

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'armory-qa-subpath-')
  );
  const chromeArgs = [
    ...buildChromiumLaunchArgs({
      mode: 'cdp',
      isHeadlessShell: discovered.isHeadlessShell,
      userDataDir,
      viewportWidth: QA_VIEWPORT_WIDTH,
      viewportHeight: QA_VIEWPORT_HEIGHT,
      deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
    }),
    'about:blank',
  ];

  const chromeProc = spawn(discovered.executablePath, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const wsUrl = await new Promise((resolve, reject) => {
    let stderrBuf = '';
    let settled = false;
    const finishResolve = (u) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(u);
    };
    const finishReject = (err) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(err);
    };
    const timer = setTimeout(() => {
      finishReject(new Error(`Chromium DevTools failed to start:\n${stderrBuf}`));
    }, 20_000);
    timer.unref?.();

    const onData = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
      if (m) finishResolve(m[1]);
    };
    chromeProc.stderr.on('data', onData);
    chromeProc.stdout.on('data', onData);
    chromeProc.once('error', (err) => finishReject(err));
    chromeProc.once('exit', (code, signal) =>
      finishReject(
        new Error(
          `Chromium exited prematurely (code=${code}, signal=${signal}):\n${stderrBuf}`
        )
      )
    );
  });

  const cdp = await NativeCdpClient.connect(wsUrl);

  const evalInSession = async (
    sessionId,
    expression,
    awaitPromise = true,
    timeoutMs = 30_000
  ) => {
    const resp = await cdp.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise,
        returnByValue: true,
      },
      sessionId,
      timeoutMs
    );
    if (resp?.exceptionDetails) {
      const desc =
        resp.exceptionDetails.exception?.description ||
        resp.exceptionDetails.text ||
        'Unknown JS evaluation error';
      throw new Error(`Page evaluation error: ${desc}`);
    }
    return resp?.result?.value;
  };

  return {
    driverName: `native-cdp (${discovered.source})`,
    cdp,
    evalInSession,
    async close() {
      try {
        await cdp
          .send('Browser.close', {}, undefined, 5000)
          .catch(() => undefined);
        cdp.close();
      } catch {
        // ignore
      }
      await terminateProcess(chromeProc);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

function attachSessionListeners(cdp, sessionId, state) {
  const unsubs = [];
  unsubs.push(
    cdp.on('Runtime.consoleAPICalled', (params, sid) => {
      if (sid !== sessionId || state.tearingDown || params.type !== 'error') {
        return;
      }
      const text = (params.args ?? [])
        .map((a) => a.value ?? a.description ?? '')
        .filter(Boolean)
        .join(' ');
      if (text) state.consoleErrors.push(text);
    })
  );
  unsubs.push(
    cdp.on('Runtime.exceptionThrown', (params, sid) => {
      if (sid !== sessionId || state.tearingDown) return;
      const desc =
        params.exceptionDetails?.exception?.description ||
        params.exceptionDetails?.text ||
        'Unhandled exception';
      state.pageErrors.push(desc);
    })
  );
  unsubs.push(
    cdp.on('Log.entryAdded', (params, sid) => {
      if (sid !== sessionId || state.tearingDown) return;
      const entry = params.entry;
      if (!entry || entry.level !== 'error' || entry.source === 'network') {
        return;
      }
      const msg = entry.text || 'Browser log error';
      if (!state.consoleErrors.includes(msg)) {
        state.consoleErrors.push(msg);
      }
    })
  );
  unsubs.push(
    cdp.on('Network.requestWillBeSent', (params, sid) => {
      if (sid !== sessionId || state.tearingDown) return;
      const u = params.request?.url ?? '';
      if (u.startsWith('data:') || u.startsWith('blob:')) return;
      if (
        (!params.loaderId && params.documentURL === u) ||
        DETACHED_WORKER_RE.test(u)
      ) {
        return;
      }
      state.activeRequests.set(params.requestId, {
        url: u,
        method: params.request?.method || 'GET',
      });
      state.lastNetActivityMs = Date.now();
    })
  );
  unsubs.push(
    cdp.on('Network.responseReceived', (params, sid) => {
      if (sid !== sessionId || state.tearingDown) return;
      state.lastNetActivityMs = Date.now();
      const status = params.response?.status;
      const meta = state.activeRequests.get(params.requestId);
      const u = params.response?.url || meta?.url || '';
      if (typeof status === 'number' && status >= 400) {
        state.failedRequests.push(`HTTP ${status} ${u}`.trim());
      }
    })
  );
  unsubs.push(
    cdp.on('Network.requestServedFromCache', (params, sid) => {
      if (sid !== sessionId) return;
      state.activeRequests.delete(params.requestId);
      state.lastNetActivityMs = Date.now();
    })
  );
  unsubs.push(
    cdp.on('Network.loadingFinished', (params, sid) => {
      if (sid !== sessionId) return;
      state.activeRequests.delete(params.requestId);
      state.lastNetActivityMs = Date.now();
    })
  );
  unsubs.push(
    cdp.on('Network.loadingFailed', (params, sid) => {
      if (sid !== sessionId) return;
      const meta = state.activeRequests.get(params.requestId);
      state.activeRequests.delete(params.requestId);
      state.lastNetActivityMs = Date.now();
      if (state.tearingDown) return;
      const u = meta?.url ?? '';
      if (params.canceled || DETACHED_WORKER_RE.test(u)) return;
      state.failedRequests.push(
        `${params.errorText ?? 'Network load failed'} ${u}`.trim()
      );
    })
  );
  return () => {
    for (const off of unsubs) off();
  };
}

async function runSubpathZero404Sweep(browser, server, targets, opts) {
  const { cdp, evalInSession } = browser;
  const results = [];

  for (let idx = 0; idx < targets.length; idx += 1) {
    const target = targets[idx];
    const startedAt = Date.now();
    const recorder = { rogueRootRequests: [], missingFiles: [] };
    server.setRecorder(recorder);

    const state = {
      consoleErrors: [],
      pageErrors: [],
      failedRequests: [],
      activeRequests: new Map(),
      lastNetActivityMs: Date.now(),
      tearingDown: false,
    };

    let targetId = null;
    let detachListeners = null;

    try {
      const created = await cdp.send('Target.createTarget', {
        url: 'about:blank',
      });
      targetId = created.targetId;
      const attached = await cdp.send('Target.attachToTarget', {
        targetId,
        flatten: true,
      });
      const sessionId = attached.sessionId;
      detachListeners = attachSessionListeners(cdp, sessionId, state);

      await cdp.send('Page.enable', {}, sessionId);
      await cdp.send('Runtime.enable', {}, sessionId);
      await cdp.send('Network.enable', {}, sessionId);
      await cdp.send('Log.enable', {}, sessionId);
      await cdp.send(
        'Emulation.setDeviceMetricsOverride',
        {
          width: QA_VIEWPORT_WIDTH,
          height: QA_VIEWPORT_HEIGHT,
          deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
          mobile: false,
        },
        sessionId
      );

      const nav = await cdp.send('Page.navigate', { url: target.url }, sessionId);
      if (nav?.errorText) {
        throw new Error(`Navigation failed: ${nav.errorText}`);
      }

      const effectiveSettleMs =
        target.weaponId && HEAVY_EXHIBIT_IDS.has(target.weaponId)
          ? Math.max(opts.settleMs, HEAVY_MIN_SETTLE_MS)
          : opts.settleMs;

      const readyRes = await waitForTargetReadiness({
        probeFn: () =>
          evalInSession(sessionId, FLEET_READINESS_PROBE_SCRIPT, false, 15_000),
        waitFramesFn: (frames) =>
          evalInSession(
            sessionId,
            `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
            true,
            15_000
          ),
        getInFlightUrls: () =>
          Array.from(state.activeRequests.values()).map((r) => r.url),
        getLastNetActivityMs: () => state.lastNetActivityMs,
        expectsWebgl: target.expectsWebgl,
        timeoutMs: opts.timeoutMs,
        settleMs: effectiveSettleMs,
      });

      const readiness = readyRes?.probe ?? null;
      const brokenImgs = readiness?.brokenImgs ?? 0;
      const entry = {
        id: target.id,
        url: target.url,
        screen: target.screen,
        expectsWebgl: target.expectsWebgl,
        ready: readyRes?.ready !== false,
        pendingReasons: readyRes?.pendingReasons ?? [],
        canvas: readiness?.primaryCanvas ?? null,
        readiness,
        brokenImgs,
        consoleErrors: [...state.consoleErrors],
        pageErrors: [...state.pageErrors],
        failedRequests: [...state.failedRequests],
        rogueRootRequests: [...recorder.rogueRootRequests],
        missingFiles: [...recorder.missingFiles],
        consoleErr: state.consoleErrors.length,
        pageErr: state.pageErrors.length,
        failedReq: state.failedRequests.length,
        rogueRootReq: recorder.rogueRootRequests.length,
        loadMs: Date.now() - startedAt,
      };
      const inv = summarizeWebglInvariants([entry]);
      entry.webglInvariants = inv;
      entry.passed =
        entry.ready &&
        entry.consoleErr === 0 &&
        entry.pageErr === 0 &&
        entry.failedReq === 0 &&
        entry.rogueRootReq === 0 &&
        entry.brokenImgs === 0 &&
        inv.allInvariantsPassed;
      results.push(entry);

      logInfo(
        `[subpath ${idx + 1}/${targets.length}] ${entry.id.padEnd(22)} ${entry.passed ? 'PASS' : 'FAIL'} ${String(entry.loadMs).padStart(5)}ms net=${entry.failedReq} rogue=${entry.rogueRootReq} brkImg=${entry.brokenImgs}`,
        opts.json
      );
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      state.pageErrors.push(`Subpath harness error: ${msg}`);
      const entry = {
        id: target.id,
        url: target.url,
        screen: target.screen,
        expectsWebgl: target.expectsWebgl,
        ready: false,
        pendingReasons: [msg],
        canvas: null,
        readiness: null,
        brokenImgs: 0,
        consoleErrors: [...state.consoleErrors],
        pageErrors: [...state.pageErrors],
        failedRequests: [...state.failedRequests],
        rogueRootRequests: [...recorder.rogueRootRequests],
        missingFiles: [...recorder.missingFiles],
        consoleErr: state.consoleErrors.length,
        pageErr: state.pageErrors.length,
        failedReq: state.failedRequests.length,
        rogueRootReq: recorder.rogueRootRequests.length,
        loadMs: Date.now() - startedAt,
      };
      entry.webglInvariants = summarizeWebglInvariants([entry]);
      entry.passed = false;
      results.push(entry);
      logInfo(
        `[subpath ${idx + 1}/${targets.length}] ${entry.id.padEnd(22)} FAIL ${String(entry.loadMs).padStart(5)}ms err=${msg}`,
        opts.json
      );
    } finally {
      state.tearingDown = true;
      detachListeners?.();
      server.setRecorder(null);
      if (targetId) {
        await cdp
          .send('Target.closeTarget', { targetId }, undefined, 5000)
          .catch(() => undefined);
      }
      await sleep(50);
    }
  }

  const passedCount = results.filter((r) => r.passed).length;
  const webglInvariants = summarizeWebglInvariants(results);
  return {
    totalRoutes: results.length,
    passedCount,
    failedCount: results.length - passedCount,
    totalFailedRequests: results.reduce((s, r) => s + r.failedReq, 0),
    totalRogueRootRequests: results.reduce((s, r) => s + r.rogueRootReq, 0),
    totalBrokenImages: results.reduce((s, r) => s + r.brokenImgs, 0),
    webglInvariants,
    ok: passedCount === results.length && webglInvariants.allInvariantsPassed,
    results,
  };
}

async function getCdpHeapUsedMb(cdp, sessionId) {
  try {
    const res = await cdp.send('Performance.getMetrics', {}, sessionId, 10_000);
    const metric = (res?.metrics ?? []).find((m) => m.name === 'JSHeapUsedSize');
    if (metric && typeof metric.value === 'number' && Number.isFinite(metric.value)) {
      return Number((metric.value / (1024 * 1024)).toFixed(2));
    }
  } catch {
    // ignore
  }
  return null;
}

async function runMemoryLeakSoak(browser, server, opts) {
  const { cdp, evalInSession } = browser;
  const normBase = server.basePath;
  const startUrl = `${server.origin}${normBase}?screen=workbench&weapon=${SOAK_EXHIBIT_SEQUENCE[0]}`;

  const recorder = { rogueRootRequests: [], missingFiles: [] };
  server.setRecorder(recorder);

  const state = {
    consoleErrors: [],
    pageErrors: [],
    failedRequests: [],
    activeRequests: new Map(),
    lastNetActivityMs: Date.now(),
    tearingDown: false,
  };

  let targetId = null;
  let detachListeners = null;
  const samples = [];
  let initialToken = null;
  let singleTabPreserved = true;
  let contextLosses = 0;

  try {
    const created = await cdp.send('Target.createTarget', {
      url: 'about:blank',
    });
    targetId = created.targetId;
    const attached = await cdp.send('Target.attachToTarget', {
      targetId,
      flatten: true,
    });
    const sessionId = attached.sessionId;
    detachListeners = attachSessionListeners(cdp, sessionId, state);

    await cdp.send('Page.enable', {}, sessionId);
    await cdp.send('Runtime.enable', {}, sessionId);
    await cdp.send('Network.enable', {}, sessionId);
    await cdp.send('Log.enable', {}, sessionId);
    await cdp.send('Performance.enable', {}, sessionId);
    await cdp.send(
      'Emulation.setDeviceMetricsOverride',
      {
        width: QA_VIEWPORT_WIDTH,
        height: QA_VIEWPORT_HEIGHT,
        deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
        mobile: false,
      },
      sessionId
    );

    logInfo(
      `Starting 12-exhibit single-tab WebGL memory soak (${SOAK_EXHIBIT_SEQUENCE.join(' -> ')})...`,
      opts.json
    );

    const navStartedAt = Date.now();
    const nav = await cdp.send('Page.navigate', { url: startUrl }, sessionId);
    if (nav?.errorText) {
      throw new Error(`Soak initial navigation failed: ${nav.errorText}`);
    }

    await waitForTargetReadiness({
      probeFn: () =>
        evalInSession(sessionId, FLEET_READINESS_PROBE_SCRIPT, false, 15_000),
      waitFramesFn: (frames) =>
        evalInSession(
          sessionId,
          `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
          true,
          15_000
        ),
      getInFlightUrls: () =>
        Array.from(state.activeRequests.values()).map((r) => r.url),
      getLastNetActivityMs: () => state.lastNetActivityMs,
      expectsWebgl: true,
      timeoutMs: opts.timeoutMs,
      settleMs: opts.settleMs,
    });

    const initInfo = await evalInSession(
      sessionId,
      INIT_SOAK_TELEMETRY_SCRIPT,
      true,
      15_000
    );
    initialToken = initInfo?.token ?? null;

    for (let stepIdx = 0; stepIdx < SOAK_EXHIBIT_SEQUENCE.length; stepIdx += 1) {
      const weaponId = SOAK_EXHIBIT_SEQUENCE[stepIdx];
      const stepStartedAt = stepIdx === 0 ? navStartedAt : Date.now();

      if (stepIdx > 0) {
        const nextUrl = `${normBase}?screen=workbench&weapon=${weaponId}`;
        await evalInSession(
          sessionId,
          `(() => {
            window.history.pushState(null, '', ${JSON.stringify(nextUrl)});
            window.dispatchEvent(new PopStateEvent('popstate'));
            return window.location.search;
          })()`,
          false,
          10_000
        );
        // Allow React effect & GLB/texture fetches to kick off
        await sleep(180);
        const effectiveSettleMs = HEAVY_EXHIBIT_IDS.has(weaponId)
          ? Math.max(opts.settleMs, HEAVY_MIN_SETTLE_MS)
          : Math.min(opts.settleMs, 800);

        await waitForTargetReadiness({
          probeFn: () =>
            evalInSession(sessionId, FLEET_READINESS_PROBE_SCRIPT, false, 15_000),
          waitFramesFn: (frames) =>
            evalInSession(
              sessionId,
              `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
              true,
              15_000
            ),
          getInFlightUrls: () =>
            Array.from(state.activeRequests.values()).map((r) => r.url),
          getLastNetActivityMs: () => state.lastNetActivityMs,
          expectsWebgl: true,
          timeoutMs: opts.timeoutMs,
          settleMs: effectiveSettleMs,
        });
      }

      // Stabilize 16 frames so Three.js unmount disposals & GpuTelemetryOverlay settle
      await evalInSession(
        sessionId,
        `(${WAIT_STABILIZE_FRAMES_SCRIPT})(16)`,
        true,
        15_000
      );

      // Optional V8 GC hint via CDP HeapProfiler.collectGarbage if available (safe no-op on failure)
      await cdp
        .send('HeapProfiler.collectGarbage', {}, sessionId, 5_000)
        .catch(() => undefined);

      const telemetry = await evalInSession(
        sessionId,
        READ_SOAK_TELEMETRY_SCRIPT,
        true,
        15_000
      );
      const cdpHeapMb = await getCdpHeapUsedMb(cdp, sessionId);
      const jsHeapMb = cdpHeapMb ?? telemetry?.perfHeapMb ?? null;

      if (
        initialToken &&
        telemetry?.sessionToken &&
        telemetry.sessionToken !== initialToken
      ) {
        singleTabPreserved = false;
      }
      if (typeof telemetry?.contextLosses === 'number') {
        contextLosses = Math.max(contextLosses, telemetry.contextLosses);
      }

      const sample = {
        step: stepIdx + 1,
        weaponId,
        switchMs: Date.now() - stepStartedAt,
        geometries: telemetry?.geometries ?? null,
        textures: telemetry?.textures ?? null,
        programs: telemetry?.programs ?? null,
        drawCalls: telemetry?.drawCalls ?? null,
        triangles: telemetry?.triangles ?? null,
        cachedWeapons: telemetry?.cachedWeapons ?? null,
        cachedParts: telemetry?.cachedParts ?? null,
        glbCsgSplit: telemetry?.glbCsgSplit ?? null,
        lruOrder: telemetry?.lruOrder ?? null,
        pbrTextures: telemetry?.pbrTextures ?? null,
        jsHeapMb,
        title: telemetry?.title ?? null,
      };
      samples.push(sample);

      logInfo(
        `[soak ${sample.step}/${SOAK_EXHIBIT_SEQUENCE.length}] ${weaponId.padEnd(8)} ${String(sample.switchMs).padStart(5)}ms geo=${sample.geometries ?? 'n/a'} tex=${sample.textures ?? 'n/a'} prog=${sample.programs ?? 'n/a'} lruWpn=${sample.cachedWeapons ?? 'n/a'} pbrTex=${sample.pbrTextures ?? 'n/a'} heap=${sample.jsHeapMb !== null ? `${sample.jsHeapMb}MB` : 'n/a'}`,
        opts.json
      );
    }
  } finally {
    state.tearingDown = true;
    detachListeners?.();
    server.setRecorder(null);
    if (targetId) {
      await cdp
        .send('Target.closeTarget', { targetId }, undefined, 5000)
        .catch(() => undefined);
    }
  }

  const evaluation = evaluateMemorySoakBounds(samples, {
    contextLosses,
    consoleErrors: state.consoleErrors,
    pageErrors: state.pageErrors,
    failedRequests: state.failedRequests,
    rogueRootRequests: recorder.rogueRootRequests,
    singleTabPreserved,
  });

  return {
    sequence: [...SOAK_EXHIBIT_SEQUENCE],
    singleTabPreserved,
    contextLosses,
    consoleErrors: [...state.consoleErrors],
    pageErrors: [...state.pageErrors],
    failedRequests: [...state.failedRequests],
    rogueRootRequests: [...recorder.rogueRootRequests],
    samples,
    evaluation,
    passed: evaluation.passed,
  };
}

async function main() {
  let opts;
  try {
    opts = parseSubpathCliArgs(process.argv.slice(2));
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatSubpathHelpText());
    process.exit(0);
  }

  if (opts.dryRun) {
    const targets = buildSubpathAuditTargets(
      'http://127.0.0.1:4173',
      opts.basePath
    );
    const plan = {
      dryRun: true,
      basePath: opts.basePath,
      runSubpath: opts.runSubpath,
      runSoak: opts.runSoak,
      skipBuild: opts.skipBuild,
      subpathRouteCount: targets.length,
      subpathTargets: targets,
      soakSequence: [...SOAK_EXHIBIT_SEQUENCE],
      memoryLimits: DEFAULT_MEMORY_SOAK_LIMITS,
    };
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      logInfo(
        `DRY RUN (basePath=${opts.basePath}): ${targets.length} subpath routes + ${SOAK_EXHIBIT_SEQUENCE.length}-step memory soak`
      );
      for (const t of targets) {
        process.stdout.write(`  - ${t.id.padEnd(23)} ${t.url}\n`);
      }
    }
    process.exit(0);
  }

  let tempBuildDir = null;
  let server = null;
  let browser = null;
  let exitCode = 1;

  try {
    let serveDir = opts.buildDir;
    if (opts.skipBuild) {
      if (!serveDir || !fs.existsSync(path.join(serveDir, 'index.html'))) {
        throw new Error(
          '--skip-build requires --build-dir pointing to an existing subpath dist/ directory containing index.html.'
        );
      }
    } else {
      tempBuildDir = fs.mkdtempSync(
        path.join(os.tmpdir(), 'armory-subpath-dist-')
      );
      await buildSubpathDist(opts.repoRoot, opts.basePath, tempBuildDir, opts.json);
      serveDir = tempBuildDir;
    }

    server = await startStrictSubpathServer(serveDir, opts.basePath);
    logInfo(
      `Strict subpath static server listening on ${server.origin}${server.basePath} (root asset requests -> 404).`,
      opts.json
    );

    browser = await launchNativeCdpBrowser(opts);

    let subpathReport = null;
    if (opts.runSubpath) {
      const targets = buildSubpathAuditTargets(server.origin, opts.basePath);
      subpathReport = await runSubpathZero404Sweep(browser, server, targets, opts);
    }

    let memorySoakReport = null;
    if (opts.runSoak) {
      memorySoakReport = await runMemoryLeakSoak(browser, server, opts);
    }

    const ok =
      (subpathReport ? subpathReport.ok : true) &&
      (memorySoakReport ? memorySoakReport.passed : true);

    const report = {
      generatedAt: new Date().toISOString(),
      basePath: opts.basePath,
      driver: browser.driverName,
      subpath: subpathReport,
      memorySoak: memorySoakReport,
      summary: {
        ok,
        subpathPassed: subpathReport ? subpathReport.ok : null,
        soakPassed: memorySoakReport ? memorySoakReport.passed : null,
      },
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatSubpathSummaryTable(report));
    }

    exitCode = ok ? 0 : 1;
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    exitCode = 1;
  } finally {
    await browser?.close().catch(() => undefined);
    await server?.stop().catch(() => undefined);
    if (tempBuildDir) {
      fs.rmSync(tempBuildDir, { recursive: true, force: true });
    }
  }

  process.exit(exitCode);
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void main();
}

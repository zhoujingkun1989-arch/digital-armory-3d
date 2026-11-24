#!/usr/bin/env node
/**
 * Digital Armory 3D — Multi-Exhibit Headless WebGL 2.0 Memory & Performance Soak Test
 *
 * Cycles sequentially through 12 heterogeneous museum exhibits in a single persistent
 * Chromium WebGL 2.0 session (via in-place SPA history transitions after initial boot),
 * exercising geometry & PBR texture LRU eviction, GPU disposal, and shader cache reuse.
 *
 * Measures per exhibit:
 *   - settleMs (DOM + network quiet + WebGL frame readiness)
 *   - live rAF FPS & average frame duration (ms)
 *   - JS heap size (`performance.memory.usedJSHeapSize`, when exposed by Chromium)
 *   - WebGL canvas & error-boundary health
 *   - Zero-tolerance invariants: consoleErrors === 0, pageErrors === 0, failedRequests === 0
 *
 * Usage:
 *   node scripts/qa_perf_soak.mjs
 *   node scripts/qa_perf_soak.mjs --weapons ak15,deagle,ztz99a --json
 *   node scripts/qa_perf_soak.mjs --dry-run
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChromiumLaunchArgs,
  discoverChromiumExecutable,
  formatBytes,
} from './dk_pdf_utils.mjs';
import {
  DEFAULT_REPO_ROOT,
  NativeCdpClient,
  PAGE_READINESS_PROBE_SCRIPT,
  QA_DEVICE_SCALE_FACTOR,
  QA_VIEWPORT_HEIGHT,
  QA_VIEWPORT_WIDTH,
  startLocalViteServer,
  WAIT_STABILIZE_FRAMES_SCRIPT,
  waitForTargetReadiness,
} from './qa_visual_gate.mjs';

export const DEFAULT_SOAK_WEAPONS = Object.freeze([
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

export const DEFAULT_SOAK_OUT_DIR = 'exports/qa-perf-soak';
export const DEFAULT_SOAK_SAMPLE_MS = 1_200;
export const DEFAULT_SOAK_SETTLE_MS = 900;
export const DEFAULT_SOAK_TIMEOUT_MS = 45_000;

const VALID_LANGS = Object.freeze(['zh', 'en']);
const WEAPON_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;
const DETACHED_WORKER_SCRIPT_RE =
  /(?:\.worker(?:[-.][^/?#]*)?\.js|\/sw\.js)(?:[?#]|$)/i;

function isDetachedWorkerScriptUrl(url) {
  return typeof url === 'string' && DETACHED_WORKER_SCRIPT_RE.test(url);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(msg, jsonMode = false) {
  const stream = jsonMode ? process.stderr : process.stdout;
  stream.write(`[qa-perf-soak] ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[qa-perf-soak] ERROR: ${msg}\n`);
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
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
 * Parse CLI arguments for `scripts/qa_perf_soak.mjs`.
 */
export function parseSoakCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    url: null,
    weapons: [],
    outDir: DEFAULT_SOAK_OUT_DIR,
    sampleMs: DEFAULT_SOAK_SAMPLE_MS,
    settleMs: DEFAULT_SOAK_SETTLE_MS,
    timeoutMs: DEFAULT_SOAK_TIMEOUT_MS,
    lang: null,
    executablePath: null,
    dryRun: false,
    json: false,
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

  const addWeapon = (raw) => {
    const id = String(raw).trim().toLowerCase();
    if (!id || !WEAPON_ID_RE.test(id)) {
      throw new Error(`Invalid weapon ID "${raw}".`);
    }
    opts.weapons.push(id);
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
      case '--url': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        let parsed;
        try {
          parsed = new URL(value);
        } catch {
          throw new Error(`Invalid --url "${value}". Expected http(s)://...`);
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error(`Unsupported protocol "${parsed.protocol}" for --url.`);
        }
        opts.url = value;
        break;
      }
      case '--weapon': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        addWeapon(value);
        break;
      }
      case '--weapons': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const items = value
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        if (items.length === 0) {
          throw new Error(
            '--weapons requires a comma-separated list (e.g. --weapons ak15,deagle,ztz99a).'
          );
        }
        for (const item of items) addWeapon(item);
        break;
      }
      case '--out': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.outDir = value;
        break;
      }
      case '--sample-ms': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 200 || n > 15_000) {
          throw new Error(`Invalid --sample-ms "${value}". Expected 200..15000.`);
        }
        opts.sampleMs = Math.round(n);
        break;
      }
      case '--settle-ms': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 20_000) {
          throw new Error(`Invalid --settle-ms "${value}". Expected 0..20000.`);
        }
        opts.settleMs = Math.round(n);
        break;
      }
      case '--timeout': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 2000) {
          throw new Error(`Invalid --timeout "${value}". Expected integer >= 2000.`);
        }
        opts.timeoutMs = n;
        break;
      }
      case '--lang': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const l = value.trim().toLowerCase();
        if (!VALID_LANGS.includes(l)) {
          throw new Error(`Invalid --lang "${value}". Expected zh or en.`);
        }
        opts.lang = l;
        break;
      }
      case '--executable': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.executablePath = value;
        break;
      }
      case '--dry-run':
        opts.dryRun = true;
        break;
      case '--json':
        opts.json = true;
        break;
      default:
        throw new Error(`Unknown option "${flag}". Run with --help for usage.`);
    }
  }

  // Deduplicate while preserving exact requested order
  opts.weapons = Array.from(new Set(opts.weapons));
  if (!opts.help && opts.weapons.length === 0) {
    opts.weapons = [...DEFAULT_SOAK_WEAPONS];
  }

  return opts;
}

/**
 * Build deterministic sequential exhibit targets for the WebGL soak run.
 */
export function buildSoakTargets(baseUrl, options) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const weapons =
    Array.isArray(options?.weapons) && options.weapons.length > 0
      ? options.weapons
      : [...DEFAULT_SOAK_WEAPONS];

  return weapons.map((weaponId, index) => {
    const u = new URL(normalizedBase);
    u.searchParams.set('screen', 'workbench');
    u.searchParams.set('weapon', weaponId);
    if (options?.lang) {
      u.searchParams.set('lang', options.lang);
    }
    return {
      index,
      weaponId,
      url: u.toString(),
    };
  });
}

/**
 * Summarize exhibit soak metrics and enforce zero-tolerance runtime invariants.
 */
export function summarizeSoakResults(results) {
  const list = Array.isArray(results) ? results : [];
  const totalExhibits = list.length;
  const passedExhibits = list.filter((r) => r.passed).length;
  const failedExhibits = totalExhibits - passedExhibits;
  const totalConsoleErrors = list.reduce(
    (sum, r) => sum + (r.consoleErrors?.length ?? 0),
    0
  );
  const totalPageErrors = list.reduce(
    (sum, r) => sum + (r.pageErrors?.length ?? 0),
    0
  );
  const totalFailedRequests = list.reduce(
    (sum, r) => sum + (r.failedRequests?.length ?? 0),
    0
  );

  const settleValues = list
    .map((r) => r.settleMs)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v >= 0);
  const avgSettleMs =
    settleValues.length > 0
      ? Math.round(
          settleValues.reduce((s, v) => s + v, 0) / settleValues.length
        )
      : 0;
  const maxSettleMs =
    settleValues.length > 0 ? Math.round(Math.max(...settleValues)) : 0;

  const fpsValues = list
    .map((r) => r.fps)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const minFps =
    fpsValues.length > 0 ? Number(Math.min(...fpsValues).toFixed(1)) : 0;
  const avgFps =
    fpsValues.length > 0
      ? Number(
          (
            fpsValues.reduce((s, v) => s + v, 0) / fpsValues.length
          ).toFixed(1)
        )
      : 0;
  const maxFps =
    fpsValues.length > 0 ? Number(Math.max(...fpsValues).toFixed(1)) : 0;

  const heapValues = list
    .map((r) => r.jsHeapUsedBytes)
    .filter((v) => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const heapBytesStart = heapValues.length > 0 ? heapValues[0] : null;
  const heapBytesEnd =
    heapValues.length > 0 ? heapValues[heapValues.length - 1] : null;
  const heapBytesPeak = heapValues.length > 0 ? Math.max(...heapValues) : null;
  const heapDeltaBytes =
    heapBytesStart !== null && heapBytesEnd !== null
      ? heapBytesEnd - heapBytesStart
      : null;
  const heapGrowthRatio =
    heapBytesStart !== null && heapBytesStart > 0 && heapBytesEnd !== null
      ? Number((heapBytesEnd / heapBytesStart).toFixed(3))
      : null;

  const allInvariantsPassed =
    totalExhibits > 0 &&
    failedExhibits === 0 &&
    totalConsoleErrors === 0 &&
    totalPageErrors === 0 &&
    totalFailedRequests === 0;

  return {
    totalExhibits,
    passedExhibits,
    failedExhibits,
    totalConsoleErrors,
    totalPageErrors,
    totalFailedRequests,
    avgSettleMs,
    maxSettleMs,
    minFps,
    avgFps,
    maxFps,
    heapBytesStart,
    heapBytesEnd,
    heapBytesPeak,
    heapDeltaBytes,
    heapGrowthRatio,
    allInvariantsPassed,
  };
}

export function formatSoakHelpText() {
  return `Digital Armory 3D — Multi-Exhibit Headless WebGL 2.0 Performance & Memory Soak Test

Usage:
  node scripts/qa_perf_soak.mjs [options]

Options:
  --url <baseUrl>        Target app URL (if omitted, auto-starts local Vite preview/dev server)
  --weapons <csv>        Comma-separated weapon IDs (default: ${DEFAULT_SOAK_WEAPONS.join(',')})
  --weapon <id>          Single weapon ID (repeatable alias for --weapons)
  --out <dir>            Output directory for soak-report.json (default: ${DEFAULT_SOAK_OUT_DIR})
  --sample-ms <ms>       FPS sampling window per exhibit in ms (default: ${DEFAULT_SOAK_SAMPLE_MS})
  --settle-ms <ms>       Extra WebGL stabilization delay per exhibit (default: ${DEFAULT_SOAK_SETTLE_MS})
  --timeout <ms>         Per-exhibit readiness timeout in ms (default: ${DEFAULT_SOAK_TIMEOUT_MS})
  --lang <zh|en>         Optional locale query parameter
  --executable <path>    Explicit Chrome / Chromium binary path
  --dry-run              Print planned soak exhibit sequence & detected browser as JSON then exit
  --json                 Print final JSON report cleanly to stdout (progress logs go to stderr)
  -h, --help             Show this help text

Examples:
  node scripts/qa_perf_soak.mjs --dry-run
  node scripts/qa_perf_soak.mjs --weapons ak15,deagle,ztz99a --json
`;
}

const SAMPLE_PERF_AND_MEMORY_SCRIPT = `(async (sampleMs) => {
  const frames = [];
  const start = performance.now();
  let last = start;
  await new Promise((resolve) => {
    function step(now) {
      const dt = now - last;
      if (dt > 0 && dt < 2000) {
        frames.push(dt);
      }
      last = now;
      if (now - start >= sampleMs && frames.length >= 4) {
        resolve();
        return;
      }
      if (now - start >= Math.max(sampleMs + 1500, 3500)) {
        resolve();
        return;
      }
      requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
  });

  const elapsed = Math.max(1, performance.now() - start);
  const avgFrameMs =
    frames.length > 0
      ? frames.reduce((s, v) => s + v, 0) / frames.length
      : elapsed;
  const sorted = [...frames].sort((a, b) => a - b);
  const p95FrameMs =
    sorted.length > 0
      ? sorted[Math.min(sorted.length - 1, Math.ceil(sorted.length * 0.95) - 1)]
      : avgFrameMs;
  const fps = avgFrameMs > 0 ? 1000 / avgFrameMs : 0;

  const mem = performance.memory || null;
  return {
    frameSamples: frames.length,
    fps: Number(fps.toFixed(1)),
    avgFrameMs: Number(avgFrameMs.toFixed(2)),
    p95FrameMs: Number(p95FrameMs.toFixed(2)),
    jsHeapUsedBytes:
      mem && typeof mem.usedJSHeapSize === 'number' ? mem.usedJSHeapSize : null,
    jsHeapTotalBytes:
      mem && typeof mem.totalJSHeapSize === 'number' ? mem.totalJSHeapSize : null,
    jsHeapLimitBytes:
      mem && typeof mem.jsHeapSizeLimit === 'number' ? mem.jsHeapSizeLimit : null,
  };
})`;

async function createSoakCdpSession(options) {
  const discovered = discoverChromiumExecutable({
    explicitPath: options.executablePath,
  });

  if (!discovered) {
    throw new Error(
      options.executablePath
        ? `Chromium executable not found at "${options.executablePath}".`
        : 'No Chromium or Google Chrome executable found. Install Google Chrome, run `npx playwright install chromium`, or pass `--executable <path>`.'
    );
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'digital-armory-qa-soak-')
  );
  const launchArgs = [
    ...buildChromiumLaunchArgs({
      mode: 'cdp',
      isHeadlessShell: discovered.isHeadlessShell,
      userDataDir,
      viewportWidth: QA_VIEWPORT_WIDTH,
      viewportHeight: QA_VIEWPORT_HEIGHT,
      deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
    }),
    '--enable-precise-memory-info',
  ];

  const child = spawn(discovered.executablePath, [...launchArgs, 'about:blank'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  const wsUrl = await new Promise((resolve, reject) => {
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
      finishReject(
        new Error(
          `Timed out waiting for Chromium DevTools WebSocket.\nSTDERR:\n${stderrBuf}`
        )
      );
    }, 25_000);
    timer.unref?.();

    const inspect = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const m = stderrBuf.match(/DevTools listening on (ws:\/\/[^\s]+)/);
      if (m) finishResolve(m[1]);
    };

    child.stderr.on('data', inspect);
    child.stdout.on('data', inspect);
    child.once('error', (err) =>
      finishReject(new Error(`Failed to launch Chromium: ${err.message}`))
    );
    child.once('exit', (code, signal) =>
      finishReject(
        new Error(
          `Chromium exited before CDP ready (code=${code}, signal=${signal}).\nSTDERR:\n${stderrBuf}`
        )
      )
    );
  });

  const cdp = await NativeCdpClient.connect(wsUrl);
  const { targetId } = await cdp.send('Target.createTarget', {
    url: 'about:blank',
  });
  const { sessionId } = await cdp.send('Target.attachToTarget', {
    targetId,
    flatten: true,
  });

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

  const evalInSession = async (
    expression,
    awaitPromise = false,
    timeoutMs = 20_000
  ) => {
    const res = await cdp.send(
      'Runtime.evaluate',
      {
        expression,
        returnByValue: true,
        awaitPromise,
      },
      sessionId,
      timeoutMs
    );
    if (res.exceptionDetails) {
      throw new Error(
        res.exceptionDetails.exception?.description ||
          res.exceptionDetails.text ||
          'Runtime.evaluate exception'
      );
    }
    return res.result?.value;
  };

  let consoleErrors = [];
  let pageErrors = [];
  let failedRequests = [];
  const activeRequests = new Map();
  let lastNetActivityMs = Date.now();
  let tearingDown = false;

  const unsubs = [
    cdp.on('Runtime.consoleAPICalled', (params, sid) => {
      if (sid !== sessionId) return;
      if (params.type === 'error') {
        const text = (params.args || [])
          .map((a) => a.value ?? a.description ?? a.type)
          .join(' ');
        consoleErrors.push(text);
      }
    }),
    cdp.on('Log.entryAdded', (params, sid) => {
      if (sid !== sessionId) return;
      if (params.entry?.level === 'error') {
        consoleErrors.push(params.entry.text || 'Log error');
      }
    }),
    cdp.on('Runtime.exceptionThrown', (params, sid) => {
      if (sid !== sessionId) return;
      const d = params.exceptionDetails;
      pageErrors.push(
        d?.exception?.description || d?.text || 'Uncaught page exception'
      );
    }),
    cdp.on('Network.requestWillBeSent', (params, sid) => {
      if (sid !== sessionId) return;
      const url = params.request?.url || '';
      if (
        url.startsWith('data:') ||
        url.startsWith('blob:') ||
        (!params.loaderId && params.documentURL === url) ||
        isDetachedWorkerScriptUrl(url)
      ) {
        return;
      }
      activeRequests.set(params.requestId, {
        url,
        method: params.request?.method || 'GET',
      });
      lastNetActivityMs = Date.now();
    }),
    cdp.on('Network.responseReceived', (params, sid) => {
      if (sid !== sessionId) return;
      lastNetActivityMs = Date.now();
      if (tearingDown) return;
      const status = params.response?.status ?? 0;
      if (status >= 400) {
        const meta = activeRequests.get(params.requestId);
        failedRequests.push({
          url: params.response?.url || meta?.url || 'unknown-url',
          method: meta?.method || 'GET',
          status,
          reason: `HTTP ${status}`,
        });
      }
    }),
    cdp.on('Network.requestServedFromCache', (params, sid) => {
      if (sid !== sessionId) return;
      activeRequests.delete(params.requestId);
      lastNetActivityMs = Date.now();
    }),
    cdp.on('Network.loadingFinished', (params, sid) => {
      if (sid !== sessionId) return;
      activeRequests.delete(params.requestId);
      lastNetActivityMs = Date.now();
    }),
    cdp.on('Network.loadingFailed', (params, sid) => {
      if (sid !== sessionId) return;
      const meta = activeRequests.get(params.requestId);
      activeRequests.delete(params.requestId);
      lastNetActivityMs = Date.now();
      if (tearingDown) return;
      failedRequests.push({
        url: meta?.url || params.blockedReason || 'unknown-url',
        method: meta?.method || 'GET',
        status: null,
        reason: params.errorText || 'loadingFailed',
      });
    }),
  ];

  let booted = false;

  return {
    executablePath: discovered.executablePath,
    async runExhibit(target, runOpts) {
      consoleErrors = [];
      pageErrors = [];
      failedRequests = [];
      activeRequests.clear();
      lastNetActivityMs = Date.now();

      const startedAt = Date.now();
      if (!booted) {
        const nav = await cdp.send(
          'Page.navigate',
          { url: target.url },
          sessionId
        );
        if (nav.errorText) {
          throw new Error(
            `Navigation failed for ${target.url}: ${nav.errorText}`
          );
        }
        booted = true;
      } else {
        // In-place SPA transition preserves the live WebGL 2.0 context & exercises LRU eviction
        await evalInSession(
          `(() => {
            window.history.pushState({}, '', ${JSON.stringify(target.url)});
            window.dispatchEvent(new PopStateEvent('popstate'));
            return true;
          })()`,
          false,
          10_000
        );
        // Brief handoff so React/Zustand initiates geometry & PBR loads before netQuiet checks
        await sleep(220);
      }

      const readiness = await waitForTargetReadiness({
        probeFn: () =>
          evalInSession(PAGE_READINESS_PROBE_SCRIPT, false, 15_000),
        waitFramesFn: (frames) =>
          evalInSession(
            `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
            true,
            15_000
          ),
        getInFlightUrls: () =>
          Array.from(activeRequests.values()).map((entry) => entry.url),
        getLastNetActivityMs: () => lastNetActivityMs,
        expectsWebgl: true,
        timeoutMs: runOpts.timeoutMs,
        settleMs: runOpts.settleMs,
      });

      const settleMs = Date.now() - startedAt;

      const perf = await evalInSession(
        `(${SAMPLE_PERF_AND_MEMORY_SCRIPT})(${runOpts.sampleMs})`,
        true,
        Math.max(10_000, runOpts.sampleMs + 8_000)
      );

      const reasons = [];
      if (consoleErrors.length > 0) {
        reasons.push(`consoleErrors=${consoleErrors.length}`);
      }
      if (pageErrors.length > 0) {
        reasons.push(`pageErrors=${pageErrors.length}`);
      }
      if (failedRequests.length > 0) {
        reasons.push(`failedRequests=${failedRequests.length}`);
      }
      if (!readiness.ready) {
        const detail =
          readiness.pendingReasons?.length > 0
            ? `(${readiness.pendingReasons.join('; ')})`
            : '';
        reasons.push(`readiness-timeout${detail}`);
      }
      if (readiness.probe?.hasErrorBoundary) {
        reasons.push('webgl-error-boundary-rendered');
      }
      if (!readiness.probe?.primaryCanvas) {
        reasons.push('missing-webgl-canvas');
      }

      return {
        index: target.index,
        weaponId: target.weaponId,
        url: target.url,
        passed: reasons.length === 0,
        reasons,
        settleMs,
        fps: perf?.fps ?? 0,
        avgFrameMs: perf?.avgFrameMs ?? 0,
        p95FrameMs: perf?.p95FrameMs ?? 0,
        frameSamples: perf?.frameSamples ?? 0,
        jsHeapUsedBytes: perf?.jsHeapUsedBytes ?? null,
        jsHeapTotalBytes: perf?.jsHeapTotalBytes ?? null,
        canvas: readiness.probe?.primaryCanvas ?? null,
        consoleErrors: [...consoleErrors],
        pageErrors: [...pageErrors],
        failedRequests: [...failedRequests],
      };
    },
    async close() {
      tearingDown = true;
      for (const off of unsubs) off();
      await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
      await cdp.send('Browser.close', {}, undefined, 5000).catch(() => undefined);
      cdp.close();
      await terminateProcess(child);
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function main() {
  let opts;
  try {
    opts = parseSoakCliArgs(process.argv.slice(2));
  } catch (err) {
    logError(err.message);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatSoakHelpText());
    process.exit(0);
  }

  const outDirAbs = path.resolve(DEFAULT_REPO_ROOT, opts.outDir);

  if (opts.dryRun) {
    const discovered = discoverChromiumExecutable({
      explicitPath: opts.executablePath,
    });
    const previewBase = opts.url || 'http://127.0.0.1:4173/';
    const targets = buildSoakTargets(previewBase, opts);
    process.stdout.write(
      `${JSON.stringify(
        {
          dryRun: true,
          viewport: {
            width: QA_VIEWPORT_WIDTH,
            height: QA_VIEWPORT_HEIGHT,
            deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
          },
          sampleMs: opts.sampleMs,
          settleMs: opts.settleMs,
          outDir: path.relative(DEFAULT_REPO_ROOT, outDirAbs),
          baseUrl: opts.url ?? '(auto-start vite preview)',
          detectedChromium: discovered,
          targets,
        },
        null,
        2
      )}\n`
    );
    process.exit(0);
  }

  const totalStart = Date.now();
  let server = null;
  let session = null;

  try {
    let baseUrl = opts.url;
    let serverMode = 'external';
    if (!baseUrl) {
      server = await startLocalViteServer(DEFAULT_REPO_ROOT, 30_000, opts.json);
      baseUrl = server.url;
      serverMode = server.mode;
    }

    const targets = buildSoakTargets(baseUrl, opts);
    session = await createSoakCdpSession(opts);
    logInfo(
      `Soak runner started (${session.executablePath}) | Exhibits: ${targets.length} | Sample window: ${opts.sampleMs}ms`,
      opts.json
    );

    const results = [];
    for (const target of targets) {
      logInfo(
        `[${target.index + 1}/${targets.length}] Loading ${target.weaponId} -> ${target.url}`,
        opts.json
      );
      try {
        const entry = await session.runExhibit(target, opts);
        results.push(entry);
        const heapText =
          entry.jsHeapUsedBytes !== null
            ? formatBytes(entry.jsHeapUsedBytes)
            : 'n/a';
        logInfo(
          `  [${entry.passed ? 'PASS' : 'FAIL'}] ${entry.weaponId} | settle=${entry.settleMs}ms | fps=${entry.fps} (p95=${entry.p95FrameMs}ms) | heap=${heapText} | err=${entry.consoleErrors.length}/${entry.pageErrors.length}/${entry.failedRequests.length}`,
          opts.json
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        results.push({
          index: target.index,
          weaponId: target.weaponId,
          url: target.url,
          passed: false,
          reasons: [msg],
          settleMs: 0,
          fps: 0,
          avgFrameMs: 0,
          p95FrameMs: 0,
          frameSamples: 0,
          jsHeapUsedBytes: null,
          jsHeapTotalBytes: null,
          canvas: null,
          consoleErrors: [],
          pageErrors: [msg],
          failedRequests: [],
        });
        logError(`FAIL ${target.weaponId}: ${msg}`);
      }
    }

    const summary = summarizeSoakResults(results);
    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      serverMode,
      executablePath: session.executablePath,
      viewport: {
        width: QA_VIEWPORT_WIDTH,
        height: QA_VIEWPORT_HEIGHT,
        deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
      },
      sampleMs: opts.sampleMs,
      settleMs: opts.settleMs,
      passed: summary.allInvariantsPassed,
      totalElapsedSec: Number(((Date.now() - totalStart) / 1000).toFixed(2)),
      summary,
      exhibits: results,
    };

    await fs.promises.mkdir(outDirAbs, { recursive: true });
    const reportPath = path.join(outDirAbs, 'soak-report.json');
    await fs.promises.writeFile(
      reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      logInfo(
        `Soak report written to ${path.relative(DEFAULT_REPO_ROOT, reportPath)} — ${summary.passedExhibits}/${summary.totalExhibits} passed | avgFps=${summary.avgFps} minFps=${summary.minFps} | ${summary.allInvariantsPassed ? 'PASS' : 'FAIL'}.`,
        false
      );
    }

    process.exitCode = summary.allInvariantsPassed ? 0 : 1;
  } finally {
    if (session) {
      await session.close().catch(() => undefined);
    }
    if (server) {
      await server.stop().catch(() => undefined);
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  main().catch((err) => {
    logError(err instanceof Error ? err.stack || err.message : String(err));
    process.exit(1);
  });
}

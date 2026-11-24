#!/usr/bin/env node
/**
 * Digital Armory 3D — Full 34-Exhibit Automated WebGL Fleet Audit Harness
 *
 * Sweeps all museum exhibits (discovered dynamically from `src/weapons/types.ts`,
 * `src/weapons/registry.ts`, or `public/models/*.glb`) plus key museum screens &
 * interactive lab panels in a single reused headless Chromium session.
 *
 * Supports both Playwright (when installed) and zero-dependency native Node 22+
 * WebSocket CDP fallback, auto-spawning `vite preview` on a free local port when
 * `--url` is omitted and tearing down all processes cleanly on exit.
 *
 * Usage:
 *   npm run qa:fleet -- --mode=quick --theme=dark
 *   npm run qa:fleet -- --mode=full --theme=light --cut --json
 *   npm run qa:fleet -- --mode=full --dry-run --json
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildChromiumLaunchArgs,
  discoverChromiumExecutable,
} from './dk_pdf_utils.mjs';
import {
  DEFAULT_REPO_ROOT,
  NativeCdpClient,
  PAGE_READINESS_PROBE_SCRIPT,
  QA_DEVICE_SCALE_FACTOR,
  QA_VIEWPORT_HEIGHT,
  QA_VIEWPORT_WIDTH,
  startLocalViteServer,
  summarizeWebglInvariants,
  WAIT_STABILIZE_FRAMES_SCRIPT,
  waitForTargetReadiness,
} from './qa_visual_gate.mjs';

export const FLEET_VALID_MODES = Object.freeze(['quick', 'full']);
export const FLEET_VALID_THEMES = Object.freeze(['dark', 'light']);
export const FLEET_QUICK_REPRESENTATIVES = Object.freeze([
  'ak15',
  'p08',
  'm1911',
  'lift33',
  'gau8',
  'ztz99a',
]);

export const FLEET_MUSEUM_VIEWS = Object.freeze([
  { id: 'view:showcase', screen: 'showcase', query: 'screen=showcase', expectsWebgl: false },
  { id: 'view:armory', screen: 'armory', query: 'screen=armory', expectsWebgl: true },
  { id: 'view:cartridges', screen: 'cartridges', query: 'screen=cartridges', expectsWebgl: true },
  { id: 'view:ballistics', screen: 'ballistics', query: 'screen=ballistics', expectsWebgl: true },
  {
    id: 'view:split_showdown',
    screen: 'split_showdown',
    query: 'screen=split_showdown&weapon=gau8&rival=m134',
    expectsWebgl: true,
  },
  {
    id: 'view:panel_armor',
    screen: 'workbench',
    query: 'screen=workbench&weapon=ztz99a&panel=armor',
    expectsWebgl: true,
  },
  {
    id: 'view:panel_scalewall',
    screen: 'armory',
    query: 'screen=armory&panel=scalewall',
    expectsWebgl: true,
  },
  {
    id: 'view:panel_recoil',
    screen: 'armory',
    query: 'screen=armory&panel=recoil',
    expectsWebgl: true,
  },
]);

const DEFAULT_SETTLE_MS = 900;
const DEFAULT_TIMEOUT_MS = 45_000;
const DETACHED_WORKER_RE = /(?:\.worker(?:[-.][^/?#]*)?\.js|\/sw\.js)(?:[?#]|$)/i;

const SAMPLE_NON_BG_PIXEL_RATIO_SCRIPT = `(() => {
  try {
    const canvases = Array.from(document.querySelectorAll('canvas'));
    const target = canvases.find((c) => c.width > 0 && c.height > 0);
    if (!target) return null;
    const w = 64;
    const h = 36;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(target, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const bgR = data[0];
    const bgG = data[1];
    const bgB = data[2];
    let nonBg = 0;
    const total = w * h;
    for (let i = 0; i < data.length; i += 4) {
      const dr = Math.abs(data[i] - bgR);
      const dg = Math.abs(data[i + 1] - bgG);
      const db = Math.abs(data[i + 2] - bgB);
      if (dr + dg + db > 18) nonBg += 1;
    }
    return Number((nonBg / total).toFixed(4));
  } catch {
    return null;
  }
})()`;

function logInfo(msg, jsonMode = false) {
  const stream = jsonMode ? process.stderr : process.stdout;
  stream.write(`[qa-fleet] ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[qa-fleet] ERROR: ${msg}\n`);
}

/**
 * Dynamically discovers every exhibit weapon ID from `src/weapons/types.ts`
 * (`WEAPON_IDS`), falling back to `src/weapons/registry.ts` or `public/models/*.glb`.
 */
export function discoverFleetWeaponIds(repoRoot = DEFAULT_REPO_ROOT) {
  const typesPath = path.join(repoRoot, 'src', 'weapons', 'types.ts');
  if (fs.existsSync(typesPath)) {
    const src = fs.readFileSync(typesPath, 'utf8');
    const blockMatch = /export\s+const\s+WEAPON_IDS\s*=\s*\[([\s\S]*?)\]\s*as\s*const/.exec(
      src
    );
    if (blockMatch) {
      const ids = [];
      for (const m of blockMatch[1].matchAll(/['"]([a-z0-9_-]+)['"]/g)) {
        ids.push(m[1]);
      }
      if (ids.length > 0) return ids;
    }
  }

  const registryPath = path.join(repoRoot, 'src', 'weapons', 'registry.ts');
  if (fs.existsSync(registryPath)) {
    const src = fs.readFileSync(registryPath, 'utf8');
    const ids = new Set();
    for (const m of src.matchAll(/\b([a-z0-9_]+)\s*:\s*\(\)\s*=>\s*import\(/g)) {
      ids.add(m[1]);
    }
    if (ids.size > 0) return Array.from(ids);
  }

  const modelsDir = path.join(repoRoot, 'public', 'models');
  if (fs.existsSync(modelsDir)) {
    return fs
      .readdirSync(modelsDir)
      .filter((f) => f.toLowerCase().endsWith('.glb'))
      .map((f) => f.replace(/\.glb$/i, '').toLowerCase())
      .sort();
  }

  return [];
}

/**
 * Parses CLI flags for `scripts/qa_full_fleet_audit.mjs`.
 */
export function parseFleetCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    mode: 'full',
    theme: 'dark',
    cut: false,
    url: null,
    lang: null,
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
      case '--mode': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const normalized = value.trim().toLowerCase();
        if (!FLEET_VALID_MODES.includes(normalized)) {
          throw new Error(
            `Invalid --mode "${value}". Expected one of: ${FLEET_VALID_MODES.join(', ')}.`
          );
        }
        opts.mode = normalized;
        break;
      }
      case '--theme': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const normalized = value.trim().toLowerCase();
        if (!FLEET_VALID_THEMES.includes(normalized)) {
          throw new Error(
            `Invalid --theme "${value}". Expected one of: ${FLEET_VALID_THEMES.join(', ')}.`
          );
        }
        opts.theme = normalized;
        break;
      }
      case '--cut':
        opts.cut = true;
        break;
      case '--json':
        opts.json = true;
        break;
      case '--dry-run':
        opts.dryRun = true;
        break;
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
      case '--lang': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const normalized = value.trim().toLowerCase();
        if (normalized !== 'zh' && normalized !== 'en') {
          throw new Error(`Invalid --lang "${value}". Expected zh or en.`);
        }
        opts.lang = normalized;
        break;
      }
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
      default:
        throw new Error(
          `Unknown option "${flag}". Run with --help to see supported options.`
        );
    }
  }

  return opts;
}

/**
 * Builds the complete ordered fleet target list for either `quick` or `full` mode.
 */
export function buildFleetAuditTargets(baseUrl, options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const mode = options.mode ?? 'full';
  const theme = options.theme ?? 'dark';
  const cut = Boolean(options.cut);
  const lang = options.lang ?? null;

  const allWeaponIds = discoverFleetWeaponIds(repoRoot);
  const selectedWeapons =
    mode === 'quick'
      ? FLEET_QUICK_REPRESENTATIVES.filter((id) => allWeaponIds.includes(id))
      : allWeaponIds;

  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const appendCommonParams = (params) => {
    if (theme === 'light') {
      params.set('env', 'blueprint_daylight');
    }
    if (lang) {
      params.set('lang', lang);
    }
  };

  const targets = [];

  for (const weaponId of selectedWeapons) {
    const params = new URLSearchParams({
      screen: 'workbench',
      weapon: weaponId,
    });
    if (cut) params.set('cut', '1');
    appendCommonParams(params);
    targets.push({
      id: `exhibit:${weaponId}`,
      weaponId,
      screen: 'workbench',
      expectsWebgl: true,
      url: `${normalizedBase}?${params.toString()}`,
    });
  }

  for (const view of FLEET_MUSEUM_VIEWS) {
    const params = new URLSearchParams(view.query);
    appendCommonParams(params);
    targets.push({
      id: view.id,
      weaponId: params.get('weapon'),
      screen: view.screen,
      expectsWebgl: view.expectsWebgl,
      url: `${normalizedBase}?${params.toString()}`,
    });
  }

  return targets;
}

export function formatFleetHelpText() {
  return `Digital Armory 3D — Full 34-Exhibit Automated WebGL Fleet Audit Harness

Usage:
  npm run qa:fleet -- [options]
  node scripts/qa_full_fleet_audit.mjs [options]

Options:
  --mode=quick|full        Sweep 6 representative exhibits + 8 views (quick) or all 34 exhibits + 8 views (full, default)
  --theme=dark|light       Studio environment theme (default: dark; light passes env=blueprint_daylight)
  --cut                    Enable CT longitudinal cutaway (cut=1) on all workbench exhibit targets
  --lang=zh|en             Optional UI language override
  --url <http://...>       Target an already-running preview/dev server (otherwise auto-starts vite preview)
  --settle-ms <ms>         Additional settle delay after readiness (default: ${DEFAULT_SETTLE_MS})
  --timeout-ms <ms>        Per-target readiness timeout (default: ${DEFAULT_TIMEOUT_MS})
  --executable-path <path> Override Chromium/Chrome binary path
  --dry-run                Print target audit plan without launching Chromium
  --json                   Output structured JSON report to stdout
  -h, --help               Show this help text
`;
}

export function formatFleetSummaryTable(report) {
  const lines = [];
  lines.push(
    '================================================================================================='
  );
  lines.push(
    ` Digital Armory 3D — WebGL Fleet Audit (${report.mode.toUpperCase()} · theme=${report.theme}${report.cut ? ' · cut=1' : ''})`
  );
  lines.push(
    '================================================================================================='
  );
  lines.push(
    ' Target                 | Screen         |  Load | Cons | Page | Net | NonBg  | WebGL | Status'
  );
  lines.push(
    '-------------------------------------------------------------------------------------------------'
  );

  for (const r of report.results) {
    const nonBgStr =
      typeof r.nonBgPixelRatio === 'number'
        ? `${(r.nonBgPixelRatio * 100).toFixed(1)}%`.padStart(6)
        : '   n/a';
    const webglStr = r.expectsWebgl
      ? r.webglInvariants.allInvariantsPassed
        ? ' PASS'
        : ' FAIL'
      : '  n/a';
    lines.push(
      ` ${r.id.padEnd(22)} | ${r.screen.padEnd(14)} | ${`${r.loadMs}ms`.padStart(5)} | ${String(r.consoleErr).padStart(4)} | ${String(r.pageErr).padStart(4)} | ${String(r.failedReq).padStart(3)} | ${nonBgStr} | ${webglStr} | ${r.passed ? 'PASS' : 'FAIL'}`
    );
  }

  lines.push(
    '-------------------------------------------------------------------------------------------------'
  );
  lines.push(
    ` Fleet Summary : ${report.summary.passedCount}/${report.summary.totalTargets} passed · WebGL invariants=${report.webglInvariants.allInvariantsPassed ? 'PASS' : 'FAIL'} · totalErrors=${report.summary.failedCount}`
  );
  lines.push(
    '================================================================================================='
  );
  return `${lines.join('\n')}\n`;
}

async function terminateProcess(child) {
  if (!child || child.exitCode !== null || child.killed) return;
  await new Promise((resolve) => {
    let done = false;
    const finish = () => {
      if (done) return;
      done = true;
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

async function tryLoadPlaywright() {
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(pkg);
      if (mod?.chromium) return mod.chromium;
    } catch {
      // fallback to native CDP
    }
  }
  return null;
}

async function runFleetWithPlaywright(chromium, targets, opts) {
  const executablePath = opts.executablePath ?? discoverChromiumExecutable();
  const browser = await chromium.launch({
    headless: true,
    executablePath: executablePath || undefined,
    args: buildChromiumLaunchArgs({ headless: true }),
  });

  const results = [];
  try {
    const context = await browser.newContext({
      viewport: { width: QA_VIEWPORT_WIDTH, height: QA_VIEWPORT_HEIGHT },
      deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
    });
    const page = await context.newPage();

    let activeErrors = { consoleErrors: [], pageErrors: [], failedRequests: [] };
    const inFlight = new Set();
    let lastNetActivityMs = Date.now();

    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        activeErrors.consoleErrors.push(msg.text());
      }
    });
    page.on('pageerror', (err) => {
      activeErrors.pageErrors.push(err?.message ?? String(err));
    });
    page.on('request', (req) => {
      const u = req.url();
      if (!DETACHED_WORKER_RE.test(u)) {
        inFlight.add(req);
        lastNetActivityMs = Date.now();
      }
    });
    page.on('requestfinished', (req) => {
      inFlight.delete(req);
      lastNetActivityMs = Date.now();
    });
    page.on('requestfailed', (req) => {
      inFlight.delete(req);
      lastNetActivityMs = Date.now();
      const u = req.url();
      if (!DETACHED_WORKER_RE.test(u)) {
        activeErrors.failedRequests.push(`${req.method()} ${u}`);
      }
    });

    for (const target of targets) {
      const startedAt = Date.now();
      activeErrors = { consoleErrors: [], pageErrors: [], failedRequests: [] };
      inFlight.clear();
      lastNetActivityMs = Date.now();

      await page.goto(target.url, {
        waitUntil: 'domcontentloaded',
        timeout: opts.timeoutMs,
      });

      const readyRes = await waitForTargetReadiness({
        probeFn: () => page.evaluate(PAGE_READINESS_PROBE_SCRIPT),
        waitFramesFn: (frames) =>
          page.evaluate(`(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`),
        getInFlightUrls: () => Array.from(inFlight).map((r) => r.url()),
        getLastNetActivityMs: () => lastNetActivityMs,
        expectsWebgl: target.expectsWebgl,
        timeoutMs: opts.timeoutMs,
        settleMs: opts.settleMs,
      });
      const readiness = readyRes?.probe ?? readyRes;

      const nonBgPixelRatio = target.expectsWebgl
        ? await page.evaluate(SAMPLE_NON_BG_PIXEL_RATIO_SCRIPT)
        : null;

      const loadMs = Date.now() - startedAt;
      const entry = {
        id: target.id,
        url: target.url,
        screen: target.screen,
        expectsWebgl: target.expectsWebgl,
        canvas: readiness?.primaryCanvas ?? null,
        readiness,
        consoleErrors: [...activeErrors.consoleErrors],
        pageErrors: [...activeErrors.pageErrors],
        failedRequests: [...activeErrors.failedRequests],
        consoleErr: activeErrors.consoleErrors.length,
        pageErr: activeErrors.pageErrors.length,
        failedReq: activeErrors.failedRequests.length,
        nonBgPixelRatio,
        loadMs,
      };
      const inv = summarizeWebglInvariants([entry]);
      entry.webglInvariants = inv;
      entry.passed =
        entry.consoleErr === 0 &&
        entry.pageErr === 0 &&
        entry.failedReq === 0 &&
        inv.allInvariantsPassed;
      results.push(entry);
    }

    await context.close();
  } finally {
    await browser.close();
  }

  return results;
}

async function runFleetWithNativeCdp(targets, opts) {
  const executablePath = opts.executablePath ?? discoverChromiumExecutable();
  if (!executablePath) {
    throw new Error(
      'No Chromium/Chrome executable found. Install Playwright Chromium or pass --executable-path.'
    );
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'armory-qa-fleet-')
  );
  const chromeArgs = [
    ...buildChromiumLaunchArgs({ headless: true }),
    '--remote-debugging-port=0',
    `--user-data-dir=${userDataDir}`,
    'about:blank',
  ];

  const chromeProc = spawn(executablePath, chromeArgs, {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  const results = [];
  let cdp = null;
  try {
    const wsUrl = await new Promise((resolve, reject) => {
      let stderrBuf = '';
      const timer = setTimeout(() => {
        reject(new Error(`Chromium DevTools failed to start: ${stderrBuf}`));
      }, 20_000);
      const onData = (chunk) => {
        stderrBuf += chunk.toString('utf8');
        const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
        if (m) {
          clearTimeout(timer);
          resolve(m[1]);
        }
      };
      chromeProc.stderr.on('data', onData);
      chromeProc.once('exit', (code) => {
        clearTimeout(timer);
        reject(new Error(`Chromium exited prematurely (${code}): ${stderrBuf}`));
      });
    });

    const devUrl = new URL(wsUrl);
    const listRes = await fetch(`http://${devUrl.host}/json/list`);
    const pages = await listRes.json();
    const pageTarget = pages.find((p) => p.type === 'page') ?? pages[0];
    if (!pageTarget?.webSocketDebuggerUrl) {
      throw new Error('Could not acquire Chromium page WebSocket target.');
    }

    cdp = new NativeCdpClient(pageTarget.webSocketDebuggerUrl);
    await cdp.connect();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.enable');
    await cdp.send('Network.enable');
    await cdp.send('Emulation.setDeviceMetricsOverride', {
      width: QA_VIEWPORT_WIDTH,
      height: QA_VIEWPORT_HEIGHT,
      deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
      mobile: false,
    });

    let activeErrors = { consoleErrors: [], pageErrors: [], failedRequests: [] };
    const inFlightMap = new Map();
    let lastNetActivityMs = Date.now();

    cdp.on('Runtime.consoleAPICalled', (evt) => {
      if (evt.type === 'error') {
        const text = (evt.args ?? [])
          .map((a) => a.value ?? a.description ?? '')
          .join(' ');
        activeErrors.consoleErrors.push(text);
      }
    });
    cdp.on('Runtime.exceptionThrown', (evt) => {
      activeErrors.pageErrors.push(
        evt.exceptionDetails?.text ?? 'Unhandled exception'
      );
    });
    cdp.on('Network.requestWillBeSent', (evt) => {
      const u = evt.request?.url ?? '';
      if (!DETACHED_WORKER_RE.test(u)) {
        inFlightMap.set(evt.requestId, u);
        lastNetActivityMs = Date.now();
      }
    });
    cdp.on('Network.loadingFinished', (evt) => {
      inFlightMap.delete(evt.requestId);
      lastNetActivityMs = Date.now();
    });
    cdp.on('Network.loadingFailed', (evt) => {
      const u = inFlightMap.get(evt.requestId) ?? '';
      inFlightMap.delete(evt.requestId);
      lastNetActivityMs = Date.now();
      if (evt.canceled || DETACHED_WORKER_RE.test(u)) return;
      activeErrors.failedRequests.push(
        `${evt.errorText ?? 'Network load failed'} ${u}`.trim()
      );
    });

    const evalJs = async (expression) => {
      const resp = await cdp.send('Runtime.evaluate', {
        expression,
        awaitPromise: true,
        returnByValue: true,
      });
      return resp?.result?.value;
    };

    for (const target of targets) {
      const startedAt = Date.now();
      activeErrors = { consoleErrors: [], pageErrors: [], failedRequests: [] };
      inFlightMap.clear();
      lastNetActivityMs = Date.now();
      await cdp.send('Page.navigate', { url: target.url });

      const readyRes = await waitForTargetReadiness({
        probeFn: () => evalJs(PAGE_READINESS_PROBE_SCRIPT),
        waitFramesFn: (frames) =>
          evalJs(`(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`),
        getInFlightUrls: () => Array.from(inFlightMap.values()),
        getLastNetActivityMs: () => lastNetActivityMs,
        expectsWebgl: target.expectsWebgl,
        timeoutMs: opts.timeoutMs,
        settleMs: opts.settleMs,
      });
      const readiness = readyRes?.probe ?? readyRes;

      const nonBgPixelRatio = target.expectsWebgl
        ? await evalJs(SAMPLE_NON_BG_PIXEL_RATIO_SCRIPT)
        : null;

      const loadMs = Date.now() - startedAt;
      const entry = {
        id: target.id,
        url: target.url,
        screen: target.screen,
        expectsWebgl: target.expectsWebgl,
        canvas: readiness?.primaryCanvas ?? null,
        readiness,
        consoleErrors: [...activeErrors.consoleErrors],
        pageErrors: [...activeErrors.pageErrors],
        failedRequests: [...activeErrors.failedRequests],
        consoleErr: activeErrors.consoleErrors.length,
        pageErr: activeErrors.pageErrors.length,
        failedReq: activeErrors.failedRequests.length,
        nonBgPixelRatio,
        loadMs,
      };
      const inv = summarizeWebglInvariants([entry]);
      entry.webglInvariants = inv;
      entry.passed =
        entry.consoleErr === 0 &&
        entry.pageErr === 0 &&
        entry.failedReq === 0 &&
        inv.allInvariantsPassed;
      results.push(entry);
    }
  } finally {
    try {
      await cdp?.close();
    } catch {
      // ignore
    }
    await terminateProcess(chromeProc);
    fs.rmSync(userDataDir, { recursive: true, force: true });
  }

  return results;
}

async function main() {
  let opts;
  try {
    opts = parseFleetCliArgs(process.argv.slice(2));
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatFleetHelpText());
    process.exit(0);
  }

  if (opts.dryRun) {
    const planTargets = buildFleetAuditTargets(
      opts.url ?? 'http://127.0.0.1:4173/',
      opts
    );
    const plan = {
      dryRun: true,
      mode: opts.mode,
      theme: opts.theme,
      cut: opts.cut,
      totalTargets: planTargets.length,
      exhibitTargets: planTargets.filter((t) => t.id.startsWith('exhibit:')).length,
      viewTargets: planTargets.filter((t) => t.id.startsWith('view:')).length,
      targets: planTargets,
    };
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
    } else {
      logInfo(
        `DRY RUN (${plan.mode} · theme=${plan.theme}): ${plan.totalTargets} targets (${plan.exhibitTargets} exhibits + ${plan.viewTargets} views)`
      );
      for (const t of planTargets) {
        process.stdout.write(`  - ${t.id.padEnd(22)} ${t.url}\n`);
      }
    }
    process.exit(0);
  }

  let serverHandle = null;
  try {
    let baseUrl = opts.url;
    if (!baseUrl) {
      logInfo('Starting local Vite preview server...', opts.json);
      serverHandle = await startLocalViteServer(opts.repoRoot, 30_000, opts.json);
      baseUrl = serverHandle.url;
    }

    const targets = buildFleetAuditTargets(baseUrl, opts);
    logInfo(
      `Auditing ${targets.length} fleet targets (mode=${opts.mode}, theme=${opts.theme}${opts.cut ? ', cut=1' : ''})...`,
      opts.json
    );

    const playwrightChromium = await tryLoadPlaywright();
    const results = playwrightChromium
      ? await runFleetWithPlaywright(playwrightChromium, targets, opts)
      : await runFleetWithNativeCdp(targets, opts);

    const webglInvariants = summarizeWebglInvariants(results);
    const passedCount = results.filter((r) => r.passed).length;
    const report = {
      generatedAt: new Date().toISOString(),
      mode: opts.mode,
      theme: opts.theme,
      cut: opts.cut,
      driver: playwrightChromium ? 'playwright' : 'native-cdp',
      results,
      webglInvariants,
      summary: {
        totalTargets: results.length,
        passedCount,
        failedCount: results.length - passedCount,
        ok: passedCount === results.length && webglInvariants.allInvariantsPassed,
      },
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatFleetSummaryTable(report));
    }

    process.exit(report.summary.ok ? 0 : 1);
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  } finally {
    if (typeof serverHandle?.stop === 'function') {
      await serverHandle.stop();
    } else if (serverHandle?.child) {
      await terminateProcess(serverHandle.child);
    }
  }
}

const isDirectRun =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectRun) {
  void main();
}

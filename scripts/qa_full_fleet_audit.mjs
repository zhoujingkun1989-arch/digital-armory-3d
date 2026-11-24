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

export const FLEET_VALID_MODES = Object.freeze(['quick', 'flagship', 'full']);
export const FLEET_VALID_THEMES = Object.freeze(['dark', 'light']);
export const FLEET_QUICK_REPRESENTATIVES = Object.freeze([
  // 6 Flagship representatives across small arms, archery, rotary heavy ordnance & 1:1 MBT
  'ak15',
  'p08',
  'm1911',
  'lift33',
  'gau8',
  'ztz99a',
  // 4 Centennial representatives (auto-included once WEAPON_IDS scales 34 -> 100)
  'ak47',
  'm200',
  't90m',
  'm777',
]);

export const FLEET_MUSEUM_VIEWS = Object.freeze([
  { id: 'view:showcase', screen: 'showcase', query: 'screen=showcase', expectsWebgl: false },
  { id: 'view:armory', screen: 'armory', query: 'screen=armory', expectsWebgl: true },
  { id: 'view:cartridges', screen: 'cartridges', query: 'screen=cartridges', expectsWebgl: true },
  { id: 'view:ballistics', screen: 'ballistics', query: 'screen=ballistics', expectsWebgl: true },
  {
    id: 'view:split_showdown',
    screen: 'split_showdown',
    query: 'screen=split_showdown&weaponA=gau8&weaponB=m134',
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

export const HEAVY_EXHIBIT_IDS = new Set([
  // Flagship 1:1 MBTs & Aviation Heavy Ordnance
  'ztz99a',
  'm1a2',
  'leopard2a7',
  'tiger1',
  'gau8',
  // Centennial 1:1 MBTs & Heavy Ordnance
  't90m',
  'challenger2',
  'merkava4',
  't34_85',
  'm61vulcan',
  'bofors40',
  'm777',
]);

const DEFAULT_SETTLE_MS = 900;
const HEAVY_MIN_SETTLE_MS = 1_200;
const DEFAULT_TIMEOUT_MS = 45_000;
const DETACHED_WORKER_RE = /(?:\.worker(?:[-.][^/?#]*)?\.js|\/sw\.js)(?:[?#]|$)/i;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Extended DOM & WebGL readiness probe that covers both legacy error-boundary
 * selectors and the upgraded `.viewport-error-fallback` recovery UI while
 * reporting active `data-theme` / `data-env` attributes.
 */
export const FLEET_READINESS_PROBE_SCRIPT = `(() => {
  const base = ${PAGE_READINESS_PROBE_SCRIPT};
  const fallbackEl = document.querySelector(
    '.viewport-error-fallback, .viewport-error-boundary, .webgl-context-lost-banner'
  );
  const visibleImgs = Array.from(document.querySelectorAll('img')).filter((img) => {
    const src = img.getAttribute('src');
    if (!src) return false;
    const style = window.getComputedStyle(img);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  const pendingImgs = visibleImgs.filter((img) => {
    if (img.complete) return false;
    const loadingAttr = (img.getAttribute('loading') || img.loading || '').toLowerCase();
    if (loadingAttr !== 'lazy') return true;
    const r = img.getBoundingClientRect();
    return r.width > 0 && r.height > 0 && r.bottom >= 0 && r.top <= window.innerHeight + 250;
  }).length;
  const brokenImgs = visibleImgs.filter(
    (img) => img.complete && img.naturalWidth === 0
  ).length;
  const appliedTheme = document.documentElement?.dataset?.theme ?? null;
  const appliedEnv = document.documentElement?.dataset?.env ?? null;
  return {
    ...base,
    visibleImages: visibleImgs.length,
    pendingImgs,
    brokenImgs,
    hasErrorBoundary: Boolean(base?.hasErrorBoundary || fallbackEl),
    appliedTheme,
    appliedEnv,
  };
})()`;

/**
 * Activates Blueprint Daylight (`blueprint_daylight`) via real UI controls when
 * the URL query parameter alone did not switch the studio theme.
 */
const ACTIVATE_BLUEPRINT_DAYLIGHT_SCRIPT = `(async () => {
  if (document.documentElement?.dataset?.theme === 'light') {
    return { switched: false, alreadyLight: true, theme: 'light' };
  }
  const waitFrames = async (n) => {
    for (let i = 0; i < n; i += 1) {
      await new Promise((r) => requestAnimationFrame(r));
    }
  };
  let btn = document.querySelector('button.env-blueprint_daylight');
  let openedPopoverTrigger = null;
  if (!btn) {
    const trigger = document.querySelector('button[aria-controls="armory-display-popover-panel"]');
    if (trigger instanceof HTMLElement) {
      trigger.click();
      openedPopoverTrigger = trigger;
      await waitFrames(3);
      btn = document.querySelector('button.env-blueprint_daylight');
    }
  }
  if (btn instanceof HTMLElement) {
    btn.click();
    await waitFrames(4);
    if (openedPopoverTrigger instanceof HTMLElement) {
      openedPopoverTrigger.click();
      await waitFrames(2);
    }
    return {
      switched: true,
      alreadyLight: false,
      theme: document.documentElement?.dataset?.theme ?? null,
      env: document.documentElement?.dataset?.env ?? null,
    };
  }
  return {
    switched: false,
    alreadyLight: false,
    theme: document.documentElement?.dataset?.theme ?? null,
    env: document.documentElement?.dataset?.env ?? null,
  };
})()`;

/**
 * Computes the non-background pixel ratio on the center stage area (x: 15%..85%,
 * y: 16%..82% — avoiding edge HUD chrome) from a composited viewport screenshot
 * so WebGL canvases with `preserveDrawingBuffer: false` are measured accurately.
 */
const SAMPLE_SCREENSHOT_NON_BG_FN = `(async (base64Jpeg) => {
  try {
    if (!base64Jpeg) return null;
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = 'data:image/jpeg;base64,' + base64Jpeg;
    });
    const w = 96;
    const h = 54;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;

    // Sample backdrop color from 4 stage-edge points (avoiding top/bottom HUD bars)
    const sampleCoords = [
      [4, 14],
      [w - 5, 14],
      [4, h - 14],
      [w - 5, h - 14],
    ];
    const rs = [];
    const gs = [];
    const bs = [];
    for (const [sx, sy] of sampleCoords) {
      const idx = (sy * w + sx) * 4;
      rs.push(data[idx]);
      gs.push(data[idx + 1]);
      bs.push(data[idx + 2]);
    }
    rs.sort((a, b) => a - b);
    gs.sort((a, b) => a - b);
    bs.sort((a, b) => a - b);
    const bgR = Math.round((rs[1] + rs[2]) / 2);
    const bgG = Math.round((gs[1] + gs[2]) / 2);
    const bgB = Math.round((bs[1] + bs[2]) / 2);

    const x0 = Math.floor(w * 0.15);
    const x1 = Math.ceil(w * 0.85);
    const y0 = Math.floor(h * 0.16);
    const y1 = Math.ceil(h * 0.82);
    let nonBg = 0;
    let total = 0;
    for (let y = y0; y < y1; y += 1) {
      for (let x = x0; x < x1; x += 1) {
        const idx = (y * w + x) * 4;
        const dr = Math.abs(data[idx] - bgR);
        const dg = Math.abs(data[idx + 1] - bgG);
        const db = Math.abs(data[idx + 2] - bgB);
        if (dr + dg + db > 22) nonBg += 1;
        total += 1;
      }
    }
    return total > 0 ? Number((nonBg / total).toFixed(4)) : null;
  } catch {
    return null;
  }
})`;

const SAMPLE_CANVAS_NON_BG_FALLBACK_SCRIPT = `(() => {
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

function stripTsComments(source) {
  return source
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/\/\/[^\n]*/g, '');
}

/**
 * Extracts string-literal IDs from a `export const <NAME> = [ ... ] as const` tuple,
 * recursively expanding any `...SPREAD_IDENTIFIER` references from `sources` in exact order.
 */
function parseConstIdTuple(constName, sources, visited = new Set()) {
  if (visited.has(constName)) return [];
  visited.add(constName);

  const arrayRe = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*=\\s*\\[([\\s\\S]*?)\\]\\s*(?:as\\s+const)?`,
    'm'
  );
  const aliasRe = new RegExp(
    `(?:export\\s+)?const\\s+${constName}\\s*=\\s*([A-Za-z0-9_]+)\\s*(?:as\\s+const)?\\s*;`,
    'm'
  );
  for (const raw of sources) {
    if (!raw) continue;
    const clean = stripTsComments(raw);
    const match = arrayRe.exec(clean);
    if (!match) {
      const aliasMatch = aliasRe.exec(clean);
      if (aliasMatch) {
        const resolved = parseConstIdTuple(
          aliasMatch[1],
          sources,
          new Set(visited)
        );
        if (resolved.length > 0) return resolved;
      }
      continue;
    }

    const ids = [];
    const seen = new Set();
    const tokenRe = /\.\.\.([A-Za-z0-9_]+)|['"]([a-z0-9_-]+)['"]/g;
    for (const tok of match[1].matchAll(tokenRe)) {
      if (tok[1]) {
        for (const spreadId of parseConstIdTuple(
          tok[1],
          sources,
          new Set(visited)
        )) {
          if (!seen.has(spreadId)) {
            seen.add(spreadId);
            ids.push(spreadId);
          }
        }
      } else if (tok[2]) {
        if (!seen.has(tok[2])) {
          seen.add(tok[2]);
          ids.push(tok[2]);
        }
      }
    }
    if (ids.length > 0) return ids;
  }

  return [];
}

/**
 * Dynamically discovers the 34 Blender 5.2 flagship exhibit IDs from
 * `src/weapons/expansion/centennialTypes.ts` (`FLAGSHIP_34_IDS`), falling back
 * to `public/models/*.glb` or the first 34 IDs in `discoverFleetWeaponIds`.
 */
export function discoverFlagshipWeaponIds(repoRoot = DEFAULT_REPO_ROOT) {
  const centennialTypesPath = path.join(
    repoRoot,
    'src',
    'weapons',
    'expansion',
    'centennialTypes.ts'
  );
  if (fs.existsSync(centennialTypesPath)) {
    const centennialSrc = fs.readFileSync(centennialTypesPath, 'utf8');
    const flagshipIds = parseConstIdTuple('FLAGSHIP_34_IDS', [centennialSrc]);
    if (flagshipIds.length > 0) return flagshipIds;
  }

  const allIds = discoverFleetWeaponIds(repoRoot);
  if (allIds.length <= 34) return allIds;

  const modelsDir = path.join(repoRoot, 'public', 'models');
  if (fs.existsSync(modelsDir)) {
    const modelSet = new Set(
      fs
        .readdirSync(modelsDir)
        .filter((f) => f.toLowerCase().endsWith('.glb'))
        .map((f) => f.replace(/\.glb$/i, '').toLowerCase())
    );
    const orderedFlagships = allIds.filter((id) => modelSet.has(id));
    if (orderedFlagships.length > 0) return orderedFlagships;
  }

  return allIds.slice(0, 34);
}

/**
 * Dynamically discovers every exhibit weapon ID from `src/weapons/types.ts`
 * (`WEAPON_IDS`, supporting both inline literals and `...FLAGSHIP_34_IDS` /
 * `...CENTENNIAL_66_IDS` spreads resolved from `src/weapons/expansion/centennialTypes.ts`),
 * falling back to `src/weapons/registry.ts` or `public/models/*.glb`.
 */
export function discoverFleetWeaponIds(repoRoot = DEFAULT_REPO_ROOT) {
  const typesPath = path.join(repoRoot, 'src', 'weapons', 'types.ts');
  const centennialTypesPath = path.join(
    repoRoot,
    'src',
    'weapons',
    'expansion',
    'centennialTypes.ts'
  );
  if (fs.existsSync(typesPath)) {
    const typesSrc = fs.readFileSync(typesPath, 'utf8');
    const centennialSrc = fs.existsSync(centennialTypesPath)
      ? fs.readFileSync(centennialTypesPath, 'utf8')
      : '';
    const ids = parseConstIdTuple('WEAPON_IDS', [typesSrc, centennialSrc]);
    if (ids.length > 0) return ids;
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
 * Builds the complete ordered fleet target list for `quick`, `flagship`, or `full` mode.
 */
export function buildFleetAuditTargets(baseUrl, options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const mode = options.mode ?? 'full';
  const theme = options.theme ?? 'dark';
  const cut = Boolean(options.cut);
  const lang = options.lang ?? null;

  const allWeaponIds = discoverFleetWeaponIds(repoRoot);
  let selectedWeapons;
  if (mode === 'quick') {
    selectedWeapons = FLEET_QUICK_REPRESENTATIVES.filter((id) =>
      allWeaponIds.includes(id)
    );
  } else if (mode === 'flagship') {
    const flagshipIds = discoverFlagshipWeaponIds(repoRoot);
    selectedWeapons = flagshipIds.filter((id) => allWeaponIds.includes(id));
  } else {
    selectedWeapons = allWeaponIds;
  }

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
  return `Digital Armory 3D — Automated WebGL Fleet Audit Harness (34 Flagships -> 100 Exhibits)

Usage:
  npm run qa:fleet -- [options]
  node scripts/qa_full_fleet_audit.mjs [options]

Options:
  --mode=quick|flagship|full Sweep representative exhibits + 8 views (quick), 34 flagships + 8 views (flagship), or all discovered exhibits + 8 views (full, default)
  --theme=dark|light         Studio environment theme (default: dark; light passes env=blueprint_daylight)
  --cut                      Enable CT longitudinal cutaway (cut=1) on all workbench exhibit targets
  --lang=zh|en               Optional UI language override
  --url <http://...>         Target an already-running preview/dev server (otherwise auto-starts vite preview)
  --settle-ms <ms>           Additional settle delay after readiness (default: ${DEFAULT_SETTLE_MS})
  --timeout-ms <ms>          Per-target readiness timeout (default: ${DEFAULT_TIMEOUT_MS})
  --executable-path <path>   Override Chromium/Chrome binary path
  --dry-run                  Print target audit plan without launching Chromium
  --json                     Output structured JSON report to stdout
  -h, --help                 Show this help text
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

export function summarizeFleetStats(results) {
  const list = Array.isArray(results) ? results : [];
  const loadTimes = list
    .map((r) => r.loadMs)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);
  const nonBgValues = list
    .map((r) => r.nonBgPixelRatio)
    .filter((v) => typeof v === 'number' && Number.isFinite(v))
    .sort((a, b) => a - b);

  const medianOf = (sorted) => {
    if (sorted.length === 0) return null;
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 === 1
      ? sorted[mid]
      : Number(((sorted[mid - 1] + sorted[mid]) / 2).toFixed(4));
  };

  let fastest = null;
  let slowest = null;
  for (const r of list) {
    if (typeof r.loadMs !== 'number') continue;
    if (!fastest || r.loadMs < fastest.loadMs) {
      fastest = { id: r.id, loadMs: r.loadMs };
    }
    if (!slowest || r.loadMs > slowest.loadMs) {
      slowest = { id: r.id, loadMs: r.loadMs };
    }
  }

  return {
    fastest,
    slowest,
    medianLoadMs:
      loadTimes.length > 0 ? Math.round(medianOf(loadTimes)) : null,
    minNonBgRatio: nonBgValues.length > 0 ? nonBgValues[0] : null,
    medianNonBgRatio: medianOf(nonBgValues),
    maxNonBgRatio:
      nonBgValues.length > 0 ? nonBgValues[nonBgValues.length - 1] : null,
    lightThemeAppliedCount: list.filter(
      (r) => r.readiness?.appliedTheme === 'light'
    ).length,
    errorBoundaryHits: list.filter(
      (r) => r.readiness?.hasErrorBoundary === true
    ).length,
    readinessTimeouts: list.filter((r) => r.ready === false).length,
  };
}

function getEffectiveSettleMs(target, opts) {
  if (target.weaponId && HEAVY_EXHIBIT_IDS.has(target.weaponId)) {
    return Math.max(opts.settleMs, HEAVY_MIN_SETTLE_MS);
  }
  return opts.settleMs;
}

function finalizeTargetEntry(target, raw) {
  const entry = {
    id: target.id,
    url: target.url,
    screen: target.screen,
    expectsWebgl: target.expectsWebgl,
    ready: raw.ready !== false,
    pendingReasons: raw.pendingReasons ?? [],
    canvas: raw.readiness?.primaryCanvas ?? null,
    readiness: raw.readiness ?? null,
    appliedTheme: raw.readiness?.appliedTheme ?? null,
    appliedEnv: raw.readiness?.appliedEnv ?? null,
    consoleErrors: [...raw.consoleErrors],
    pageErrors: [...raw.pageErrors],
    failedRequests: [...raw.failedRequests],
    consoleErr: raw.consoleErrors.length,
    pageErr: raw.pageErrors.length,
    failedReq: raw.failedRequests.length,
    nonBgPixelRatio: raw.nonBgPixelRatio ?? null,
    loadMs: raw.loadMs,
  };
  const inv = summarizeWebglInvariants([entry]);
  entry.webglInvariants = inv;
  entry.passed =
    entry.ready &&
    entry.consoleErr === 0 &&
    entry.pageErr === 0 &&
    entry.failedReq === 0 &&
    inv.allInvariantsPassed;
  return entry;
}

function logTargetProgress(index, total, entry, jsonMode) {
  const ratioStr =
    typeof entry.nonBgPixelRatio === 'number'
      ? ` nonBg=${(entry.nonBgPixelRatio * 100).toFixed(1)}%`
      : '';
  const themeStr = entry.appliedTheme ? ` theme=${entry.appliedTheme}` : '';
  const errSummary =
    entry.passed
      ? ''
      : ` [ready=${entry.ready} cons=${entry.consoleErr} page=${entry.pageErr} net=${entry.failedReq} webgl=${entry.webglInvariants.allInvariantsPassed}]`;
  logInfo(
    `[${index + 1}/${total}] ${entry.id.padEnd(22)} ${entry.passed ? 'PASS' : 'FAIL'} ${String(entry.loadMs).padStart(5)}ms${ratioStr}${themeStr}${errSummary}`,
    jsonMode
  );
}

async function tryLoadPlaywright() {
  for (const pkg of ['playwright', 'playwright-core']) {
    try {
      const mod = await import(pkg);
      if (mod?.chromium) return { chromium: mod.chromium, pkgName: pkg };
    } catch {
      // fallback to native CDP
    }
  }
  return null;
}

async function runFleetWithPlaywright(pwInfo, targets, opts) {
  const { chromium, pkgName } = pwInfo;
  let executablePath = opts.executablePath || undefined;
  let isHeadlessShell = false;
  if (!executablePath && pkgName === 'playwright-core') {
    const discovered = discoverChromiumExecutable();
    if (discovered) {
      executablePath = discovered.executablePath;
      isHeadlessShell = discovered.isHeadlessShell;
    }
  }

  const browser = await chromium.launch({
    headless: true,
    executablePath,
    args: buildChromiumLaunchArgs({
      mode: 'playwright',
      isHeadlessShell,
      viewportWidth: QA_VIEWPORT_WIDTH,
      viewportHeight: QA_VIEWPORT_HEIGHT,
      deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
    }),
  });

  const results = [];
  const context = await browser.newContext({
    viewport: { width: QA_VIEWPORT_WIDTH, height: QA_VIEWPORT_HEIGHT },
    deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
  });

  try {
    for (let idx = 0; idx < targets.length; idx += 1) {
      const target = targets[idx];
      const startedAt = Date.now();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const inFlight = new Map();
      let lastNetActivityMs = Date.now();
      let tearingDown = false;
      const page = await context.newPage();

      try {
        page.on('console', (msg) => {
          if (!tearingDown && msg.type() === 'error') {
            consoleErrors.push(msg.text());
          }
        });
        page.on('pageerror', (err) => {
          if (!tearingDown) {
            pageErrors.push(err?.message ?? String(err));
          }
        });
        page.on('request', (req) => {
          const u = req.url();
          if (
            !tearingDown &&
            !u.startsWith('data:') &&
            !u.startsWith('blob:') &&
            !DETACHED_WORKER_RE.test(u)
          ) {
            inFlight.set(req, u);
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
          if (tearingDown) return;
          const u = req.url();
          if (!DETACHED_WORKER_RE.test(u)) {
            const reason = req.failure()?.errorText || 'requestfailed';
            failedRequests.push(`${req.method()} ${u} (${reason})`);
          }
        });
        page.on('response', (res) => {
          lastNetActivityMs = Date.now();
          if (tearingDown) return;
          if (res.status() >= 400) {
            failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
          }
        });

        await page.goto(target.url, {
          waitUntil: 'domcontentloaded',
          timeout: opts.timeoutMs,
        });

        const effectiveSettleMs = getEffectiveSettleMs(target, opts);
        let readyRes = await waitForTargetReadiness({
          probeFn: () => page.evaluate(FLEET_READINESS_PROBE_SCRIPT),
          waitFramesFn: (frames) =>
            page.evaluate(`(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`),
          getInFlightUrls: () => Array.from(inFlight.values()),
          getLastNetActivityMs: () => lastNetActivityMs,
          expectsWebgl: target.expectsWebgl,
          timeoutMs: opts.timeoutMs,
          settleMs: effectiveSettleMs,
        });

        if (
          opts.theme === 'light' &&
          readyRes?.probe?.appliedTheme !== 'light'
        ) {
          const switched = await page.evaluate(ACTIVATE_BLUEPRINT_DAYLIGHT_SCRIPT);
          if (switched?.switched) {
            readyRes = await waitForTargetReadiness({
              probeFn: () => page.evaluate(FLEET_READINESS_PROBE_SCRIPT),
              waitFramesFn: (frames) =>
                page.evaluate(`(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`),
              getInFlightUrls: () => Array.from(inFlight.values()),
              getLastNetActivityMs: () => lastNetActivityMs,
              expectsWebgl: target.expectsWebgl,
              timeoutMs: Math.min(opts.timeoutMs, 20_000),
              settleMs: Math.min(effectiveSettleMs, 650),
            });
          }
        }

        const readiness = readyRes?.probe ?? readyRes;
        let nonBgPixelRatio = null;
        if (target.expectsWebgl) {
          try {
            const shotBuf = await page.screenshot({
              type: 'jpeg',
              quality: 65,
              fullPage: false,
            });
            nonBgPixelRatio = await page.evaluate(
              `(${SAMPLE_SCREENSHOT_NON_BG_FN})(${JSON.stringify(shotBuf.toString('base64'))})`
            );
          } catch {
            nonBgPixelRatio = await page.evaluate(
              SAMPLE_CANVAS_NON_BG_FALLBACK_SCRIPT
            );
          }
        }

        const entry = finalizeTargetEntry(target, {
          ready: readyRes?.ready !== false,
          pendingReasons: readyRes?.pendingReasons ?? [],
          readiness,
          consoleErrors,
          pageErrors,
          failedRequests,
          nonBgPixelRatio,
          loadMs: Date.now() - startedAt,
        });
        results.push(entry);
        logTargetProgress(idx, targets.length, entry, opts.json);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pageErrors.push(`Fleet harness error: ${msg}`);
        const entry = finalizeTargetEntry(target, {
          ready: false,
          pendingReasons: [msg],
          readiness: null,
          consoleErrors,
          pageErrors,
          failedRequests,
          nonBgPixelRatio: null,
          loadMs: Date.now() - startedAt,
        });
        results.push(entry);
        logTargetProgress(idx, targets.length, entry, opts.json);
      } finally {
        tearingDown = true;
        await page.close().catch(() => undefined);
      }
    }
  } finally {
    await context.close().catch(() => undefined);
    await browser.close().catch(() => undefined);
  }

  return results;
}

async function runFleetWithNativeCdp(targets, opts) {
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
    `Launching headless Chromium via native-cdp (${discovered.source}: ${discovered.executablePath})...`,
    opts.json
  );

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'armory-qa-fleet-')
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

  const results = [];
  let cdp = null;
  try {
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
        finishReject(
          new Error(`Chromium DevTools failed to start:\n${stderrBuf}`)
        );
      }, 20_000);
      timer.unref?.();

      const onData = (chunk) => {
        stderrBuf += chunk.toString('utf8');
        const m = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
        if (m) finishResolve(m[1]);
      };
      chromeProc.stderr.on('data', onData);
      chromeProc.stdout.on('data', onData);
      chromeProc.once('error', (err) => {
        finishReject(
          new Error(
            `Failed to spawn Chromium (${discovered.executablePath}): ${err.message}`
          )
        );
      });
      chromeProc.once('exit', (code, signal) => {
        finishReject(
          new Error(
            `Chromium exited prematurely (code=${code}, signal=${signal}):\n${stderrBuf}`
          )
        );
      });
    });

    cdp = await NativeCdpClient.connect(wsUrl);

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

    for (let idx = 0; idx < targets.length; idx += 1) {
      const target = targets[idx];
      const startedAt = Date.now();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const activeRequests = new Map();
      let lastNetActivityMs = Date.now();
      let tearingDown = false;
      const unsubs = [];
      let targetId = null;

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

        unsubs.push(
          cdp.on('Runtime.consoleAPICalled', (params, sid) => {
            if (sid !== sessionId || tearingDown || params.type !== 'error') {
              return;
            }
            const text = (params.args ?? [])
              .map((a) => a.value ?? a.description ?? '')
              .filter(Boolean)
              .join(' ');
            if (text) consoleErrors.push(text);
          })
        );
        unsubs.push(
          cdp.on('Runtime.exceptionThrown', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            const desc =
              params.exceptionDetails?.exception?.description ||
              params.exceptionDetails?.text ||
              'Unhandled exception';
            pageErrors.push(desc);
          })
        );
        unsubs.push(
          cdp.on('Log.entryAdded', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            const entry = params.entry;
            if (!entry || entry.level !== 'error') return;
            if (entry.source === 'network') return;
            const msg = entry.text || 'Browser log error';
            if (!consoleErrors.includes(msg)) {
              consoleErrors.push(msg);
            }
          })
        );
        unsubs.push(
          cdp.on('Network.requestWillBeSent', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            const u = params.request?.url ?? '';
            if (u.startsWith('data:') || u.startsWith('blob:')) return;
            if (
              (!params.loaderId && params.documentURL === u) ||
              DETACHED_WORKER_RE.test(u)
            ) {
              return;
            }
            activeRequests.set(params.requestId, {
              url: u,
              method: params.request?.method || 'GET',
            });
            lastNetActivityMs = Date.now();
          })
        );
        unsubs.push(
          cdp.on('Network.responseReceived', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            lastNetActivityMs = Date.now();
            const status = params.response?.status;
            const meta = activeRequests.get(params.requestId);
            const u = params.response?.url || meta?.url || '';
            if (typeof status === 'number' && status >= 400) {
              failedRequests.push(`HTTP ${status} ${u}`.trim());
            }
          })
        );
        unsubs.push(
          cdp.on('Network.requestServedFromCache', (params, sid) => {
            if (sid !== sessionId) return;
            activeRequests.delete(params.requestId);
            lastNetActivityMs = Date.now();
          })
        );
        unsubs.push(
          cdp.on('Network.loadingFinished', (params, sid) => {
            if (sid !== sessionId) return;
            activeRequests.delete(params.requestId);
            lastNetActivityMs = Date.now();
          })
        );
        unsubs.push(
          cdp.on('Network.loadingFailed', (params, sid) => {
            if (sid !== sessionId) return;
            const meta = activeRequests.get(params.requestId);
            activeRequests.delete(params.requestId);
            lastNetActivityMs = Date.now();
            if (tearingDown) return;
            const u = meta?.url ?? '';
            if (params.canceled || DETACHED_WORKER_RE.test(u)) return;
            failedRequests.push(
              `${params.errorText ?? 'Network load failed'} ${u}`.trim()
            );
          })
        );

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

        const nav = await cdp.send(
          'Page.navigate',
          { url: target.url },
          sessionId
        );
        if (nav?.errorText) {
          throw new Error(`Navigation failed for ${target.url}: ${nav.errorText}`);
        }

        const effectiveSettleMs = getEffectiveSettleMs(target, opts);
        let readyRes = await waitForTargetReadiness({
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
            Array.from(activeRequests.values()).map((r) => r.url),
          getLastNetActivityMs: () => lastNetActivityMs,
          expectsWebgl: target.expectsWebgl,
          timeoutMs: opts.timeoutMs,
          settleMs: effectiveSettleMs,
        });

        if (
          opts.theme === 'light' &&
          readyRes?.probe?.appliedTheme !== 'light'
        ) {
          const switched = await evalInSession(
            sessionId,
            ACTIVATE_BLUEPRINT_DAYLIGHT_SCRIPT,
            true,
            15_000
          );
          if (switched?.switched) {
            readyRes = await waitForTargetReadiness({
              probeFn: () =>
                evalInSession(
                  sessionId,
                  FLEET_READINESS_PROBE_SCRIPT,
                  false,
                  15_000
                ),
              waitFramesFn: (frames) =>
                evalInSession(
                  sessionId,
                  `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
                  true,
                  15_000
                ),
              getInFlightUrls: () =>
                Array.from(activeRequests.values()).map((r) => r.url),
              getLastNetActivityMs: () => lastNetActivityMs,
              expectsWebgl: target.expectsWebgl,
              timeoutMs: Math.min(opts.timeoutMs, 20_000),
              settleMs: Math.min(effectiveSettleMs, 650),
            });
          }
        }

        const readiness = readyRes?.probe ?? readyRes;
        let nonBgPixelRatio = null;
        if (target.expectsWebgl) {
          try {
            const shot = await cdp.send(
              'Page.captureScreenshot',
              {
                format: 'jpeg',
                quality: 65,
                fromSurface: true,
              },
              sessionId,
              20_000
            );
            if (shot?.data) {
              nonBgPixelRatio = await evalInSession(
                sessionId,
                `(${SAMPLE_SCREENSHOT_NON_BG_FN})(${JSON.stringify(shot.data)})`,
                true,
                15_000
              );
            }
          } catch {
            nonBgPixelRatio = await evalInSession(
              sessionId,
              SAMPLE_CANVAS_NON_BG_FALLBACK_SCRIPT,
              false,
              10_000
            );
          }
        }

        const entry = finalizeTargetEntry(target, {
          ready: readyRes?.ready !== false,
          pendingReasons: readyRes?.pendingReasons ?? [],
          readiness,
          consoleErrors,
          pageErrors,
          failedRequests,
          nonBgPixelRatio,
          loadMs: Date.now() - startedAt,
        });
        results.push(entry);
        logTargetProgress(idx, targets.length, entry, opts.json);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        pageErrors.push(`Fleet harness error: ${msg}`);
        const entry = finalizeTargetEntry(target, {
          ready: false,
          pendingReasons: [msg],
          readiness: null,
          consoleErrors,
          pageErrors,
          failedRequests,
          nonBgPixelRatio: null,
          loadMs: Date.now() - startedAt,
        });
        results.push(entry);
        logTargetProgress(idx, targets.length, entry, opts.json);
      } finally {
        tearingDown = true;
        for (const off of unsubs) off();
        if (targetId) {
          await cdp
            .send('Target.closeTarget', { targetId }, undefined, 5000)
            .catch(() => undefined);
        }
        // Give Chromium a brief moment to release WebGL/GPU buffers between heavy tabs
        await sleep(50);
      }
    }
  } finally {
    try {
      await cdp
        ?.send('Browser.close', {}, undefined, 5000)
        .catch(() => undefined);
      cdp?.close();
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
  let exitCode = 1;
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

    const pwInfo = await tryLoadPlaywright();
    const results = pwInfo
      ? await runFleetWithPlaywright(pwInfo, targets, opts)
      : await runFleetWithNativeCdp(targets, opts);

    const webglInvariants = summarizeWebglInvariants(results);
    const stats = summarizeFleetStats(results);
    const passedCount = results.filter((r) => r.passed).length;
    const report = {
      generatedAt: new Date().toISOString(),
      mode: opts.mode,
      theme: opts.theme,
      cut: opts.cut,
      driver: pwInfo ? `playwright (${pwInfo.pkgName})` : 'native-cdp',
      results,
      webglInvariants,
      summary: {
        totalTargets: results.length,
        passedCount,
        failedCount: results.length - passedCount,
        ok: passedCount === results.length && webglInvariants.allInvariantsPassed,
        ...stats,
      },
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatFleetSummaryTable(report));
    }

    exitCode = report.summary.ok ? 0 : 1;
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    exitCode = 1;
  } finally {
    if (typeof serverHandle?.stop === 'function') {
      await serverHandle.stop();
    } else if (serverHandle?.child) {
      await terminateProcess(serverHandle.child);
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

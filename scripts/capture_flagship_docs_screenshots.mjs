#!/usr/bin/env node
/**
 * Digital Armory 3D — Deterministic 1920×1080 Flagship `docs/screenshots/` Capture Engine
 *
 * Captures museum-grade 1920×1080 JPEG documentation screenshots across three
 * curated shot groups using the zero-zombie native Node 22+ WebSocket CDP runner
 * and an isolated ephemeral static `dist/` server:
 *   - core       (5 shots):  Showcase landing, Armory Vault, CT Cutaway, AK-15 Studio, Blueprint Exploded M4A1
 *   - sculptures (19 shots): Waves 1–7 Blender 5.2 hyper-sculpted exhibits (M1911A1..MP5)
 *   - labs       (8 shots):  3D 1,000m Range + Schlieren Bullet-Cam, 3D Armor Theater,
 *                            3D Split Cutaway, 1:1 Cartridge Duel, 1:1 Scale Wall,
 *                            Blueprint Daylight Recoil Lab, 34×33 Showdown 6-Axis Radar,
 *                            Blueprint Daylight 3D Caliper Imperial Sprite
 *
 * Enforces strict capture invariants on every single frame:
 *   - 0 console errors, 0 uncaught page errors, 0 failed network requests
 *   - Exact 1920×1080 JPEG dimensions (`inspectImageDimensions`)
 *   - `nonBgPixelRatio > 0.08` (guarantees rendered 3D/UI geometry, never blank)
 *   - `HEAVY_EXHIBIT_IDS`-aware WebGL settle + `WAIT_STABILIZE_FRAMES_SCRIPT`
 *
 * Usage:
 *   npm run docs:screenshots -- --dry-run --json
 *   npm run docs:screenshots -- --group=core --out-dir=/tmp/test-shots --json
 *   npm run docs:screenshots -- --only=showcase-landing,hero-ct-cutaway --out-dir=/tmp/test-shots
 *   npm run docs:screenshots -- --group=all --quality=92
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ALL_WEAPON_IDS,
  buildChromiumLaunchArgs,
  discoverChromiumExecutable,
} from './dk_pdf_utils.mjs';
import {
  FLEET_READINESS_PROBE_SCRIPT,
  HEAVY_EXHIBIT_IDS,
} from './qa_full_fleet_audit.mjs';
import {
  DEFAULT_REPO_ROOT,
  inspectImageDimensions,
  NativeCdpClient,
  QA_VIEWPORT_HEIGHT,
  QA_VIEWPORT_WIDTH,
  WAIT_STABILIZE_FRAMES_SCRIPT,
} from './qa_visual_gate.mjs';

export const DEFAULT_DOCS_OUT_DIR = 'docs/screenshots';
export const DEFAULT_JPEG_QUALITY = 92;
export const DEFAULT_CAPTURE_LANG = 'en';
export const DEFAULT_TIMEOUT_MS = 45_000;
export const MIN_NON_BG_PIXEL_RATIO = 0.08;

export const VALID_SHOT_GROUPS = Object.freeze([
  'all',
  'core',
  'labs',
  'sculptures',
]);

export const FLAGSHIP_DOC_SHOTS = Object.freeze([
  // ==================== Core Museum Views (5) ====================
  Object.freeze({
    id: 'showcase-landing',
    filename: 'showcase-landing.jpg',
    group: 'core',
    label: 'Showcase Landing (2-Line Keynote Hero)',
    query: 'screen=showcase',
    weaponId: null,
    expectsWebgl: false,
    readySelector: '.showcase-scroll-root, h1',
  }),
  Object.freeze({
    id: 'armory-showcase',
    filename: 'armory-showcase.jpg',
    group: 'core',
    label: 'Armory 3D Vault (Single-Row Header + Inline Sort/Filter)',
    query: 'screen=armory',
    weaponId: 'ak15',
    expectsWebgl: true,
    readySelector: '.armory-header, .rack-dock-header',
  }),
  Object.freeze({
    id: 'hero-ct-cutaway',
    filename: 'hero-ct-cutaway.jpg',
    group: 'core',
    label: 'AK-15M1 Live CT Cutaway (Sliced Rifling Bore + CT Slider)',
    query: 'screen=workbench&weapon=ak15&cut=1',
    weaponId: 'ak15',
    expectsWebgl: true,
    readySelector: '.live-section-bar, .top-bar',
  }),
  Object.freeze({
    id: 'ak15-v3-studio',
    filename: 'ak15-v3-studio.jpg',
    group: 'core',
    label: 'AK-15M1 Dark Tactical Vault Studio Hero',
    query: 'screen=workbench&weapon=ak15',
    weaponId: 'ak15',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'm4a1-exploded',
    filename: 'm4a1-exploded.jpg',
    group: 'core',
    label: 'M4A1 Blueprint Daylight Exploded View + 3D Axis Guides',
    query: 'screen=workbench&weapon=m4a1&explode=1&env=blueprint_daylight',
    weaponId: 'm4a1',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),

  // ==================== Refreshed Sculptures — Waves 1–7 (19) ====================
  Object.freeze({
    id: 'm1911-v6-hero',
    filename: 'm1911-v6-hero.jpg',
    group: 'sculptures',
    label: 'Colt M1911A1 CT Cutaway (LH 6-Groove Rifling + Beveled .45 ACP Mag)',
    query: 'screen=workbench&weapon=m1911&cut=1',
    weaponId: 'm1911',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'mg42-v6-hero',
    filename: 'mg42-v6-hero.jpg',
    group: 'sculptures',
    label: 'MG 42 7.92×57mm General-Purpose Machine Gun',
    query: 'screen=workbench&weapon=mg42',
    weaponId: 'mg42',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'k98k-v6-hero',
    filename: 'k98k-v6-hero.jpg',
    group: 'sculptures',
    label: 'Mauser Karabiner 98k 7.92×57mm Bolt-Action Rifle',
    query: 'screen=workbench&weapon=k98k',
    weaponId: 'k98k',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'thompson-v6-hero',
    filename: 'thompson-v6-hero.jpg',
    group: 'sculptures',
    label: 'Thompson M1928A1 .45 ACP w/ 50-Rd L-Drum',
    query: 'screen=workbench&weapon=thompson',
    weaponId: 'thompson',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'gau8-v6-hero',
    filename: 'gau8-v6-hero.jpg',
    group: 'sculptures',
    label: '1:1 GE GAU-8/A Avenger 30mm 7-Barrel Rotary Autocannon',
    query: 'screen=workbench&weapon=gau8',
    weaponId: 'gau8',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'an94-v3-macro',
    filename: 'an94-v3-macro.jpg',
    group: 'sculptures',
    label: 'Nikonov AN-94 Abakan (Pulley Hyperburst Macro)',
    query: 'screen=workbench&weapon=an94',
    weaponId: 'an94',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'vss-v3-macro',
    filename: 'vss-v3-macro.jpg',
    group: 'sculptures',
    label: 'VSS Vintorez 9×39mm CT Cutaway (Integral Ported Suppressor)',
    query: 'screen=workbench&weapon=vss&cut=1',
    weaponId: 'vss',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'g11-v3-macro',
    filename: 'g11-v3-macro.jpg',
    group: 'sculptures',
    label: 'H&K G11 K2 CT Cutaway (90° Caseless Rotary Breech)',
    query: 'screen=workbench&weapon=g11&cut=1',
    weaponId: 'g11',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'garand-v3-macro',
    filename: 'garand-v3-macro.jpg',
    group: 'sculptures',
    label: 'M1 Garand .30-06 (En-Bloc Clip & Oil-Rubbed Walnut)',
    query: 'screen=workbench&weapon=garand',
    weaponId: 'garand',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'python-v3-macro',
    filename: 'python-v3-macro.jpg',
    group: 'sculptures',
    label: 'Colt Python .357 Magnum (Royal Blue & Vent-Rib Barrel)',
    query: 'screen=workbench&weapon=python',
    weaponId: 'python',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'deagle-v3-macro',
    filename: 'deagle-v3-macro.jpg',
    group: 'sculptures',
    label: 'Desert Eagle Mark XIX .50 AE (Brushed Chrome & Gas Piston)',
    query: 'screen=workbench&weapon=deagle',
    weaponId: 'deagle',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'p08-v3-macro',
    filename: 'p08-v3-macro.jpg',
    group: 'sculptures',
    label: 'Luger P08 9×19mm (Mirror-Rust-Blued & Straw-Gold Toggle Lock)',
    query: 'screen=workbench&weapon=p08',
    weaponId: 'p08',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'p90-v3-macro',
    filename: 'p90-v3-macro.jpg',
    group: 'sculptures',
    label: 'FN P90 5.7×28mm (Translucent 50-Rd Staggered-Brass Magazine)',
    query: 'screen=workbench&weapon=p90',
    weaponId: 'p90',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'lift33-v3-macro',
    filename: 'lift33-v3-macro.jpg',
    group: 'sculptures',
    label: 'Mathews LIFT 33 (CNC Warren-Truss Riser & SwitchWeight-X Cams)',
    query: 'screen=workbench&weapon=lift33',
    weaponId: 'lift33',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'benellim4-v3-macro',
    filename: 'benellim4-v3-macro.jpg',
    group: 'sculptures',
    label: 'Benelli M4 / M1014 12ga (Twin A.R.G.O. Stainless Gas Pistons)',
    query: 'screen=workbench&weapon=benellim4',
    weaponId: 'benellim4',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'vector-v3-macro',
    filename: 'vector-v3-macro.jpg',
    group: 'sculptures',
    label: 'KRISS Vector Gen II .45 ACP (Combat FDE & Super V Slider)',
    query: 'screen=workbench&weapon=vector',
    weaponId: 'vector',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'm249-v3-macro',
    filename: 'm249-v3-macro.jpg',
    group: 'sculptures',
    label: 'FN M249 SAW 5.56mm (Manganese-Phosphate Receiver & M27 Belt)',
    query: 'screen=workbench&weapon=m249',
    weaponId: 'm249',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'm4a1-v3-macro',
    filename: 'm4a1-v3-macro.jpg',
    group: 'sculptures',
    label: 'Colt M4A1 SOPMOD 5.56mm (Wave 7 Museum Sculpture)',
    query: 'screen=workbench&weapon=m4a1',
    weaponId: 'm4a1',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),
  Object.freeze({
    id: 'mp5-v3-macro',
    filename: 'mp5-v3-macro.jpg',
    group: 'sculptures',
    label: 'H&K MP5A3 9×19mm (Wave 7 Roller-Delayed Sculpture)',
    query: 'screen=workbench&weapon=mp5',
    weaponId: 'mp5',
    expectsWebgl: true,
    readySelector: '.top-bar',
  }),

  // ==================== Refreshed & New Interactive Labs (8) ====================
  Object.freeze({
    id: 'v6-range-3d',
    filename: 'v6-range-3d.jpg',
    group: 'labs',
    label: '1,000m Proving Ground + Bullet-Cam Schlieren Mach-Cone + Target-Cam PIP + Miller Sg',
    query: 'screen=ballistics',
    weaponId: null,
    expectsWebgl: true,
    readySelector: '.eb-topbar, .eb-range3d-canvas, header',
    postAction: 'ballistics_bullet_cam',
  }),
  Object.freeze({
    id: 'v6-armor-3d',
    filename: 'v6-armor-3d.jpg',
    group: 'labs',
    label: '1:1 3D Composite Armor Penetration Cutaway Theater',
    query: 'screen=armory&panel=armor',
    weaponId: null,
    expectsWebgl: true,
    readySelector: '[role="dialog"], dialog[open]',
  }),
  Object.freeze({
    id: 'v5-split-showdown',
    filename: 'v5-split-showdown.jpg',
    group: 'labs',
    label: '3D Split-Screen Cutaway Showdown (M1911A1 vs Desert Eagle)',
    query: 'screen=split_showdown&weaponA=m1911&weaponB=deagle&cut=1',
    weaponId: 'm1911',
    expectsWebgl: true,
    readySelector: '.split-showdown-topbar, .split-topbar',
  }),
  Object.freeze({
    id: 'cartridges-15-lab',
    filename: 'cartridges-15-lab.jpg',
    group: 'labs',
    label: '1:1 SAAMI Cartridge Cutaway Lab w/ 1v1 Ballistic Duel',
    query: 'screen=cartridges',
    weaponId: null,
    expectsWebgl: true,
    readySelector: '.cartridge-topbar, .cartridge-lab-screen',
    postAction: 'cartridge_duel_toggle',
  }),
  Object.freeze({
    id: 'v7-scale-wall',
    filename: 'v7-scale-wall.jpg',
    group: 'labs',
    label: 'Smithsonian 1:1 True-Scale Museum Wall (M1911A1 to ZTZ-99A)',
    query: 'screen=armory&panel=scalewall',
    weaponId: null,
    expectsWebgl: false,
    readySelector: '[data-testid="scalewall-blueprint-grid"]',
  }),
  Object.freeze({
    id: 'v7-recoil-lab',
    filename: 'v7-recoil-lab.jpg',
    group: 'labs',
    label: 'Blueprint Daylight Recoil Impulse & Muzzle-Climb Physics Lab',
    query: 'screen=armory&panel=recoil&env=blueprint_daylight',
    weaponId: null,
    expectsWebgl: false,
    readySelector: '[data-testid="recoil-lab-modal"], .recoillab-dialog',
  }),
  Object.freeze({
    id: 'v7-showdown-radar',
    filename: 'v7-showdown-radar.jpg',
    group: 'labs',
    label: '34×33 Mechanism Showdown 6-Axis Engineering Radar SVG',
    query: 'screen=armory',
    weaponId: null,
    expectsWebgl: false,
    readySelector: '.armory-header',
    postAction: 'open_showdown_radar',
  }),
  Object.freeze({
    id: 'v7-caliper-daylight',
    filename: 'v7-caliper-daylight.jpg',
    group: 'labs',
    label: 'Blueprint Daylight 3D Vernier Caliper w/ Floating Imperial Sprite',
    query: 'screen=workbench&weapon=ak15&env=blueprint_daylight',
    weaponId: 'ak15',
    expectsWebgl: true,
    readySelector: '.top-bar',
    postAction: 'open_caliper_imperial',
  }),
]);

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
  stream.write(`[docs-screenshots] ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[docs-screenshots] ERROR: ${msg}\n`);
}

export function formatHelpText() {
  const byGroup = { core: [], sculptures: [], labs: [] };
  for (const s of FLAGSHIP_DOC_SHOTS) {
    byGroup[s.group].push(s.id);
  }
  return [
    'Digital Armory 3D — Deterministic 1920×1080 Flagship Documentation Screenshot Engine',
    '',
    'Usage:',
    '  npm run docs:screenshots -- [options]',
    '  node scripts/capture_flagship_docs_screenshots.mjs [options]',
    '',
    'Options:',
    '  --group <name>       Shot group: all | core | labs | sculptures (default: all)',
    '  --only <csv>         Comma-separated shot IDs (overrides --group)',
    `  --out-dir <dir>      Output directory for 1920x1080 JPEGs (default: ${DEFAULT_DOCS_OUT_DIR})`,
    '  --dist-dir <dir>     Production build directory to serve when --url is omitted (default: dist)',
    '  --url <origin>       Attach to an already-running local preview server',
    `  --quality <50-100>   JPEG compression quality (default: ${DEFAULT_JPEG_QUALITY})`,
    '  --lang <en|zh>       UI language query param (default: en)',
    `  --timeout-ms <ms>    Per-shot readiness timeout (default: ${DEFAULT_TIMEOUT_MS})`,
    '  --dry-run            Print planned shot list without launching Chromium or writing files',
    '  --json               Emit structured JSON summary to stdout (progress logs to stderr)',
    '  -h, --help           Show this help text',
    '',
    `Core       (${byGroup.core.length}): ${byGroup.core.join(', ')}`,
    `Labs       (${byGroup.labs.length}): ${byGroup.labs.join(', ')}`,
    `Sculptures (${byGroup.sculptures.length}): ${byGroup.sculptures.join(', ')}`,
    '',
  ].join('\n');
}

export function parseCliArgs(argv = []) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    group: 'all',
    only: null,
    outDir: DEFAULT_DOCS_OUT_DIR,
    distDir: 'dist',
    url: null,
    quality: DEFAULT_JPEG_QUALITY,
    lang: DEFAULT_CAPTURE_LANG,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    dryRun: false,
    json: false,
    help: false,
  };

  const validShotIds = new Set(FLAGSHIP_DOC_SHOTS.map((s) => s.id));

  for (let i = 0; i < args.length; i += 1) {
    const raw = args[i];
    if (raw === '--help' || raw === '-h') {
      opts.help = true;
      continue;
    }
    if (raw === '--dry-run') {
      opts.dryRun = true;
      continue;
    }
    if (raw === '--json') {
      opts.json = true;
      continue;
    }

    const eqIdx = raw.indexOf('=');
    const flag = eqIdx === -1 ? raw : raw.slice(0, eqIdx);
    const inlineVal = eqIdx === -1 ? undefined : raw.slice(eqIdx + 1);
    const nextVal = () => {
      if (inlineVal !== undefined) return inlineVal;
      if (i + 1 >= args.length) {
        throw new Error(`Option ${flag} requires a value.`);
      }
      i += 1;
      return args[i];
    };

    if (flag === '--group') {
      const grp = nextVal().trim().toLowerCase();
      if (!VALID_SHOT_GROUPS.includes(grp)) {
        throw new Error(
          `Unknown --group "${grp}". Expected one of: ${VALID_SHOT_GROUPS.join(', ')}`
        );
      }
      opts.group = grp;
    } else if (flag === '--only') {
      const ids = nextVal()
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);
      if (ids.length === 0) {
        throw new Error('--only requires at least one shot ID.');
      }
      for (const id of ids) {
        if (!validShotIds.has(id)) {
          throw new Error(
            `Unknown shot ID "${id}". Run with --help to list all ${FLAGSHIP_DOC_SHOTS.length} valid shot IDs.`
          );
        }
      }
      opts.only = ids;
    } else if (flag === '--out-dir') {
      opts.outDir = nextVal();
    } else if (flag === '--dist-dir') {
      opts.distDir = nextVal();
    } else if (flag === '--url') {
      opts.url = nextVal().replace(/\/+$/, '');
    } else if (flag === '--quality') {
      const q = Number(nextVal());
      if (!Number.isFinite(q) || q < 50 || q > 100) {
        throw new Error(`Invalid --quality "${q}". Must be between 50 and 100.`);
      }
      opts.quality = Math.round(q);
    } else if (flag === '--lang') {
      const lang = nextVal().trim().toLowerCase();
      if (lang !== 'en' && lang !== 'zh') {
        throw new Error(`Invalid --lang "${lang}". Expected "en" or "zh".`);
      }
      opts.lang = lang;
    } else if (flag === '--timeout-ms') {
      const ms = Number(nextVal());
      if (!Number.isFinite(ms) || ms < 3000) {
        throw new Error(`Invalid --timeout-ms "${ms}". Must be >= 3000.`);
      }
      opts.timeoutMs = Math.round(ms);
    } else {
      throw new Error(`Unknown CLI argument: ${raw}`);
    }
  }

  return opts;
}

export function selectDocShots(options = {}) {
  if (Array.isArray(options.only) && options.only.length > 0) {
    const byId = new Map(FLAGSHIP_DOC_SHOTS.map((s) => [s.id, s]));
    return options.only.map((id) => {
      const found = byId.get(id);
      if (!found) throw new Error(`Unknown shot ID "${id}".`);
      return found;
    });
  }
  const group = options.group ?? 'all';
  if (group === 'all') return [...FLAGSHIP_DOC_SHOTS];
  return FLAGSHIP_DOC_SHOTS.filter((s) => s.group === group);
}

export function buildDocShotTargets(origin, options = {}) {
  const cleanOrigin = String(origin || 'http://127.0.0.1:4173').replace(/\/+$/, '');
  const lang = options.lang === 'zh' ? 'zh' : 'en';
  const outDir = path.resolve(
    DEFAULT_REPO_ROOT,
    options.outDir || DEFAULT_DOCS_OUT_DIR
  );
  const shots = selectDocShots(options);

  return shots.map((shot) => {
    const params = new URLSearchParams(shot.query);
    params.set('lang', lang);
    const isHeavy = Boolean(shot.weaponId && HEAVY_EXHIBIT_IDS.has(shot.weaponId));
    return {
      ...shot,
      isHeavy,
      url: `${cleanOrigin}/?${params.toString()}`,
      outPath: path.join(outDir, shot.filename),
    };
  });
}

export function evaluateCapturedShot(shot, metrics) {
  const issues = [];
  if (metrics.consoleErrorCount > 0) {
    issues.push(`consoleErrors=${metrics.consoleErrorCount}`);
  }
  if (metrics.pageErrorCount > 0) {
    issues.push(`pageErrors=${metrics.pageErrorCount}`);
  }
  if (metrics.failedRequestCount > 0) {
    issues.push(`failedRequests=${metrics.failedRequestCount}`);
  }
  if (
    metrics.width !== QA_VIEWPORT_WIDTH ||
    metrics.height !== QA_VIEWPORT_HEIGHT
  ) {
    issues.push(
      `unexpectedDimensions=${metrics.width}x${metrics.height} (expected ${QA_VIEWPORT_WIDTH}x${QA_VIEWPORT_HEIGHT})`
    );
  }
  if (
    typeof metrics.nonBgPixelRatio !== 'number' ||
    metrics.nonBgPixelRatio <= MIN_NON_BG_PIXEL_RATIO
  ) {
    issues.push(
      `nonBgPixelRatio=${metrics.nonBgPixelRatio} <= ${MIN_NON_BG_PIXEL_RATIO}`
    );
  }

  return {
    id: shot.id,
    filename: shot.filename,
    group: shot.group,
    weaponId: shot.weaponId,
    url: shot.url,
    outPath: shot.outPath,
    pass: issues.length === 0,
    issues,
    width: metrics.width,
    height: metrics.height,
    bytes: metrics.bytes,
    nonBgPixelRatio: metrics.nonBgPixelRatio,
    consoleErrorCount: metrics.consoleErrorCount,
    pageErrorCount: metrics.pageErrorCount,
    failedRequestCount: metrics.failedRequestCount,
    durationMs: metrics.durationMs,
  };
}

// ============================================================================
// In-Page Image Non-Background Pixel Sampler & Interactive Post-Actions
// ============================================================================

const SAMPLE_JPEG_NON_BG_FN = `(async (dataUrl) => {
  try {
    const img = new Image();
    await new Promise((resolve, reject) => {
      img.onload = resolve;
      img.onerror = reject;
      img.src = dataUrl;
    });
    const w = 128;
    const h = 72;
    const off = document.createElement('canvas');
    off.width = w;
    off.height = h;
    const ctx = off.getContext('2d', { willReadFrequently: true });
    if (!ctx) return null;
    ctx.drawImage(img, 0, 0, w, h);
    const data = ctx.getImageData(0, 0, w, h).data;
    const corners = [
      [2, 2],
      [w - 3, 2],
      [2, h - 3],
      [w - 3, h - 3],
    ];
    const rs = [];
    const gs = [];
    const bs = [];
    for (const [sx, sy] of corners) {
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

    const x0 = Math.floor(w * 0.12);
    const x1 = Math.ceil(w * 0.88);
    const y0 = Math.floor(h * 0.12);
    const y1 = Math.ceil(h * 0.88);
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

async function startStaticDistServer(distDir) {
  const absDist = path.resolve(DEFAULT_REPO_ROOT, distDir);
  if (!fs.existsSync(path.join(absDist, 'index.html'))) {
    throw new Error(
      `Missing production build at "${absDist}/index.html". Run "npm run build" first or pass --url.`
    );
  }

  const server = http.createServer((req, res) => {
    const reqPath = (req.url || '/').split(/[?#]/)[0];
    const cleanRel = decodeURIComponent(reqPath).replace(/^\/+/, '');
    let filePath = path.join(absDist, cleanRel || 'index.html');
    if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
      filePath = path.join(filePath, 'index.html');
    }
    if (!fs.existsSync(filePath) || !filePath.startsWith(absDist)) {
      if (!path.extname(cleanRel)) {
        filePath = path.join(absDist, 'index.html');
      } else {
        res.writeHead(404);
        res.end('Not Found');
        return;
      }
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
    });
    fs.createReadStream(filePath).pipe(res);
  });

  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });

  const addr = server.address();
  return {
    origin: `http://127.0.0.1:${addr.port}`,
    close: () => new Promise((resolve) => server.close(() => resolve())),
  };
}

async function launchHeadlessChromium() {
  const discovered = discoverChromiumExecutable();
  if (!discovered?.executablePath) {
    throw new Error(
      'Unable to locate Chromium / Google Chrome executable for docs screenshot capture.'
    );
  }
  const { executablePath, isHeadlessShell } = discovered;
  const tmpProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'armory-docs-cdp-'));

  const probeSrv = http.createServer();
  await new Promise((resolve) => probeSrv.listen(0, '127.0.0.1', resolve));
  const debugPort = probeSrv.address().port;
  await new Promise((resolve) => probeSrv.close(() => resolve()));

  const baseArgs = buildChromiumLaunchArgs({
    mode: 'cdp',
    isHeadlessShell,
    userDataDir: tmpProfile,
    viewportWidth: QA_VIEWPORT_WIDTH,
    viewportHeight: QA_VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
  });
  const launchArgs = [
    ...baseArgs.filter((a) => !a.startsWith('--remote-debugging-port=')),
    `--remote-debugging-port=${debugPort}`,
    'about:blank',
  ];

  const proc = spawn(executablePath, launchArgs, {
    stdio: ['ignore', 'ignore', 'pipe'],
  });

  let wsUrl = null;
  for (let i = 0; i < 60; i += 1) {
    try {
      const res = await fetch(`http://127.0.0.1:${debugPort}/json/list`);
      if (res.ok) {
        const list = await res.json();
        const page = list.find((t) => t.type === 'page' && t.webSocketDebuggerUrl);
        if (page) {
          wsUrl = page.webSocketDebuggerUrl;
          break;
        }
      }
    } catch {
      // retry until CDP binds
    }
    await sleep(150);
  }

  if (!wsUrl) {
    proc.kill('SIGKILL');
    fs.rmSync(tmpProfile, { recursive: true, force: true });
    throw new Error('Timed out waiting for headless Chromium CDP endpoint.');
  }

  const cdp = await NativeCdpClient.connect(wsUrl, 15_000);
  await cdp.send('Page.enable');
  await cdp.send('Runtime.enable');
  await cdp.send('Network.enable');
  await cdp.send('Emulation.setDeviceMetricsOverride', {
    width: QA_VIEWPORT_WIDTH,
    height: QA_VIEWPORT_HEIGHT,
    deviceScaleFactor: 1,
    mobile: false,
  });

  const shutdown = async () => {
    try {
      if (!cdp.closed) cdp.ws?.close?.();
    } catch {
      // ignore
    }
    try {
      if (!proc.killed) proc.kill('SIGTERM');
    } catch {
      // ignore
    }
    await sleep(250);
    try {
      if (proc.exitCode === null) proc.kill('SIGKILL');
    } catch {
      // ignore
    }
    await sleep(150);
    try {
      fs.rmSync(tmpProfile, { recursive: true, force: true });
    } catch {
      // ignore
    }
  };

  return { cdp, proc, shutdown };
}

async function evalValue(cdp, expression) {
  const res = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (res?.exceptionDetails) {
    throw new Error(
      res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'CDP Runtime.evaluate exception'
    );
  }
  return res?.result?.value;
}

async function waitForSelector(cdp, selector, timeoutMs = 15_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const found = await evalValue(
      cdp,
      `Boolean(document.querySelector(${JSON.stringify(selector)}))`
    );
    if (found) return true;
    await sleep(140);
  }
  return false;
}

async function dispatchKey(cdp, key, code, windowsVirtualKeyCode) {
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyDown',
    key,
    code,
    text: key.length === 1 ? key : '',
    unmodifiedText: key.length === 1 ? key : '',
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
  await cdp.send('Input.dispatchKeyEvent', {
    type: 'keyUp',
    key,
    code,
    windowsVirtualKeyCode,
    nativeVirtualKeyCode: windowsVirtualKeyCode,
  });
}

async function runPostAction(cdp, actionName) {
  if (!actionName) return;
  if (actionName === 'open_showdown_radar') {
    await evalValue(cdp, 'document.activeElement?.blur?.()');
    await dispatchKey(cdp, 's', 'KeyS', 83);
    await waitForSelector(cdp, '[role="dialog"], dialog[open]', 6_000);
    await sleep(500);
    return;
  }
  if (actionName === 'open_caliper_imperial') {
    await evalValue(cdp, 'document.activeElement?.blur?.()');
    await dispatchKey(cdp, 'k', 'KeyK', 75);
    await waitForSelector(cdp, '.caliper-hud', 6_000);
    await evalValue(
      cdp,
      `(() => {
        const btns = [...document.querySelectorAll('.caliper-hud button')];
        const inBtn = btns.find((b) => /^in$/i.test((b.textContent || '').trim()));
        if (inBtn) inBtn.click();
        const envBtn = btns.find((b) => /envelope|包络/i.test(b.textContent || ''));
        if (envBtn) envBtn.click();
      })()`
    );
    await sleep(600);
    return;
  }
  if (actionName === 'cartridge_duel_toggle') {
    await evalValue(
      cdp,
      `(() => {
        const btn = document.querySelector('.cartridge-duel-toggle');
        if (btn) btn.click();
      })()`
    );
    await sleep(600);
    return;
  }
  if (actionName === 'ballistics_bullet_cam') {
    await evalValue(
      cdp,
      `(() => {
        const btns = [...document.querySelectorAll('button')];
        const camBtn = btns.find((b) => /bullet-cam|子弹时间/i.test(b.textContent || ''));
        if (camBtn) camBtn.click();
        const fireBtn = btns.find((b) => /fire|发射|实射/i.test(b.textContent || ''));
        if (fireBtn) fireBtn.click();
      })()`
    );
    await sleep(650);
  }
}

async function captureSingleShot(cdp, shot, options) {
  const startedAt = Date.now();
  const consoleErrors = [];
  const pageErrors = [];
  const failedRequests = [];

  const offConsole = cdp.on('Runtime.consoleAPICalled', (params) => {
    if (params.type === 'error') {
      const msg = (params.args || [])
        .map((a) => a.value ?? a.description ?? '')
        .join(' ')
        .trim();
      if (msg) consoleErrors.push(msg);
    }
  });
  const offException = cdp.on('Runtime.exceptionThrown', (params) => {
    const desc =
      params.exceptionDetails?.exception?.description ||
      params.exceptionDetails?.text ||
      'Uncaught exception';
    pageErrors.push(desc);
  });
  const offNetFail = cdp.on('Network.loadingFailed', (params) => {
    if (!params.canceled) {
      failedRequests.push(params.errorText || 'Network.loadingFailed');
    }
  });
  const offNetResp = cdp.on('Network.responseReceived', (params) => {
    const status = params.response?.status ?? 200;
    const url = params.response?.url ?? '';
    if (status >= 400 && !url.includes('favicon')) {
      failedRequests.push(`HTTP ${status} ${url}`);
    }
  });

  try {
    await cdp.send('Page.navigate', { url: 'about:blank' });
    await sleep(80);
    await cdp.send('Page.navigate', { url: shot.url });

    await waitForSelector(cdp, '#root > *', Math.min(options.timeoutMs, 15_000));
    if (shot.readySelector) {
      await waitForSelector(cdp, shot.readySelector, Math.min(options.timeoutMs, 12_000));
    }

    if (shot.expectsWebgl) {
      const deadline = Date.now() + Math.min(options.timeoutMs, 25_000);
      while (Date.now() < deadline) {
        const probe = await evalValue(cdp, FLEET_READINESS_PROBE_SCRIPT);
        if (
          Boolean(probe?.primaryCanvas) &&
          !probe?.hasGeoBuildBanner &&
          (probe?.pendingImgs ?? 0) === 0
        ) {
          break;
        }
        await sleep(200);
      }
      await sleep(shot.isHeavy ? 2_200 : 1_100);
      await evalValue(cdp, `(${WAIT_STABILIZE_FRAMES_SCRIPT})(6)`);
    } else {
      await sleep(750);
    }

    if (shot.postAction) {
      await runPostAction(cdp, shot.postAction);
      if (shot.expectsWebgl) {
        await evalValue(cdp, `(${WAIT_STABILIZE_FRAMES_SCRIPT})(4)`);
      }
    }

    const shotRes = await cdp.send('Page.captureScreenshot', {
      format: 'jpeg',
      quality: options.quality,
      fromSurface: true,
    });
    const jpegBuf = Buffer.from(shotRes.data, 'base64');
    const dims = inspectImageDimensions(jpegBuf);

    const dataUrl = `data:image/jpeg;base64,${shotRes.data}`;
    const nonBgPixelRatio = await evalValue(
      cdp,
      `(${SAMPLE_JPEG_NON_BG_FN})(${JSON.stringify(dataUrl)})`
    );

    fs.mkdirSync(path.dirname(shot.outPath), { recursive: true });
    fs.writeFileSync(shot.outPath, jpegBuf);

    return evaluateCapturedShot(shot, {
      width: dims?.width ?? 0,
      height: dims?.height ?? 0,
      bytes: jpegBuf.length,
      nonBgPixelRatio,
      consoleErrorCount: consoleErrors.length,
      pageErrorCount: pageErrors.length,
      failedRequestCount: failedRequests.length,
      durationMs: Date.now() - startedAt,
    });
  } finally {
    offConsole();
    offException();
    offNetFail();
    offNetResp();
  }
}

export async function runDocsCapture(argv = process.argv.slice(2)) {
  const opts = parseCliArgs(argv);
  if (opts.help) {
    process.stdout.write(formatHelpText());
    return { exitCode: 0 };
  }

  // Validate all referenced weaponIds against canonical ALL_WEAPON_IDS
  const validWeapons = new Set(ALL_WEAPON_IDS);
  for (const shot of FLAGSHIP_DOC_SHOTS) {
    if (shot.weaponId && !validWeapons.has(shot.weaponId)) {
      throw new Error(
        `Invalid weaponId "${shot.weaponId}" in FLAGSHIP_DOC_SHOTS entry "${shot.id}".`
      );
    }
  }

  if (opts.dryRun) {
    const plannedOrigin = opts.url || 'http://127.0.0.1:4173';
    const targets = buildDocShotTargets(plannedOrigin, opts);
    const payload = {
      dryRun: true,
      origin: plannedOrigin,
      group: opts.group,
      outDir: path.resolve(DEFAULT_REPO_ROOT, opts.outDir),
      quality: opts.quality,
      lang: opts.lang,
      viewport: `${QA_VIEWPORT_WIDTH}x${QA_VIEWPORT_HEIGHT}`,
      totalShots: targets.length,
      shots: targets.map((t) => ({
        id: t.id,
        filename: t.filename,
        group: t.group,
        weaponId: t.weaponId,
        isHeavy: t.isHeavy,
        expectsWebgl: t.expectsWebgl,
        postAction: t.postAction ?? null,
        url: t.url,
        outPath: t.outPath,
      })),
    };
    if (opts.json) {
      process.stdout.write(`${JSON.stringify(payload, null, 2)}\n`);
    } else {
      logInfo(
        `Dry-run plan: ${targets.length} flagship 1920x1080 JPEG shots (group=${opts.group}, outDir=${opts.outDir})`
      );
      for (const s of payload.shots) {
        logInfo(`  - [${s.group}] ${s.filename.padEnd(28)} -> ${s.url}`);
      }
    }
    return { exitCode: 0, payload };
  }

  let server = null;
  let browser = null;
  let cleanedUp = false;

  const cleanup = async () => {
    if (cleanedUp) return;
    cleanedUp = true;
    if (browser) await browser.shutdown();
    if (server) await server.close();
  };

  const onSignal = () => {
    cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  try {
    let origin = opts.url;
    if (!origin) {
      server = await startStaticDistServer(opts.distDir);
      origin = server.origin;
      logInfo(`Serving "${opts.distDir}" at ${origin}`, opts.json);
    }

    const targets = buildDocShotTargets(origin, opts);
    logInfo(
      `Launching headless Chromium for ${targets.length} flagship 1920x1080 documentation shots...`,
      opts.json
    );
    browser = await launchHeadlessChromium();

    const results = [];
    for (let idx = 0; idx < targets.length; idx += 1) {
      const shot = targets[idx];
      logInfo(
        `[${idx + 1}/${targets.length}] ${shot.filename} (${shot.group})`,
        opts.json
      );
      const res = await captureSingleShot(browser.cdp, shot, opts);
      results.push(res);
    }

    const passedShots = results.filter((r) => r.pass).length;
    const failedShots = results.length - passedShots;
    const report = {
      timestamp: new Date().toISOString(),
      origin,
      group: opts.group,
      outDir: path.resolve(DEFAULT_REPO_ROOT, opts.outDir),
      quality: opts.quality,
      summary: {
        pass: failedShots === 0,
        totalShots: results.length,
        passedShots,
        failedShots,
        totalBytes: results.reduce((a, r) => a + r.bytes, 0),
      },
      results,
    };

    if (opts.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      for (const r of results) {
        const tag = r.pass ? 'PASS' : 'FAIL';
        logInfo(
          `[${tag}] ${r.filename.padEnd(28)} ${r.width}x${r.height} ${(r.bytes / 1024).toFixed(1)} KB nonBg=${((r.nonBgPixelRatio ?? 0) * 100).toFixed(1)}% ${r.durationMs}ms${r.issues.length ? ` | ${r.issues.join(', ')}` : ''}`
        );
      }
      logInfo(
        `Summary: ${passedShots}/${results.length} passed (${failedShots} failed).`
      );
    }

    return { exitCode: failedShots === 0 ? 0 : 1, report };
  } finally {
    process.removeListener('SIGINT', onSignal);
    process.removeListener('SIGTERM', onSignal);
    await cleanup();
  }
}

const isDirectEntry =
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);

if (isDirectEntry) {
  runDocsCapture(process.argv.slice(2))
    .then(({ exitCode }) => process.exit(exitCode))
    .catch((err) => {
      logError(err instanceof Error ? err.message : String(err));
      process.exit(2);
    });
}

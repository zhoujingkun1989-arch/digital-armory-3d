#!/usr/bin/env node
/**
 * Digital Armory 3D — Automated 1920×1080 Headless Chromium Visual QA Gate
 *
 * Drives Chromium via Playwright (when installed) or zero-dependency native Node 22+
 * WebSocket CDP against local Playwright Chromium (`$HOME/Library/Caches/ms-playwright/...`)
 * or system Google Chrome (`/Applications/Google Chrome.app/...`).
 *
 * Enforces zero-tolerance runtime invariants on every captured view:
 *   - consoleErrors === 0
 *   - pageErrors === 0
 *   - failedRequests === 0
 *   - WebGL canvas present & stabilized (on 3D screens)
 *   - Crisp 1920×1080 PNG/JPG screenshot + structured `qa-report.json`
 *
 * Usage:
 *   node scripts/qa_visual_gate.mjs --weapons ak15
 *   node scripts/qa_visual_gate.mjs --weapons ak15,ztz99a --cut --out exports/qa-visual
 *   node scripts/qa_visual_gate.mjs --screens armory,cartridges,ballistics --weapons ak15
 *   node scripts/qa_visual_gate.mjs --url http://127.0.0.1:4173 --weapons ak15 --format jpg
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
  parseViteServerUrl,
} from './dk_pdf_utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const QA_VIEWPORT_WIDTH = 1920;
export const QA_VIEWPORT_HEIGHT = 1080;
export const QA_DEVICE_SCALE_FACTOR = 1;
export const DEFAULT_QA_OUT_DIR = 'exports/qa-visual';
export const DEFAULT_TIMEOUT_MS = 45_000;
export const DEFAULT_SETTLE_MS = 1_500;

export const VALID_SCREENS = Object.freeze([
  'showcase',
  'armory',
  'workbench',
  'cartridges',
  'ballistics',
  'split_showdown',
  'armor',
]);

export const SCREENS_WITH_WEBGL = new Set([
  'workbench',
  'cartridges',
  'split_showdown',
]);

const VALID_FORMATS = Object.freeze(['png', 'jpg', 'jpeg']);
const VALID_DRIVERS = Object.freeze(['auto', 'playwright', 'cdp']);
const VALID_LANGS = Object.freeze(['zh', 'en']);
const WEAPON_ID_RE = /^[a-z0-9][a-z0-9_-]*$/;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(msg) {
  process.stdout.write(`[qa-visual] ${msg}\n`);
}

function logWarn(msg) {
  process.stderr.write(`[qa-visual] WARN: ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[qa-visual] ERROR: ${msg}\n`);
}

/**
 * Parse CLI arguments for `scripts/qa_visual_gate.mjs`.
 */
export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const opts = {
    url: null,
    weapons: [],
    screens: [],
    outDir: DEFAULT_QA_OUT_DIR,
    cut: false,
    cutMode: 'off', // 'off' | 'only' | 'both'
    explode: false,
    explodeMode: 'off', // 'off' | 'only' | 'both'
    format: 'png',
    lang: null,
    settleMs: DEFAULT_SETTLE_MS,
    timeoutMs: DEFAULT_TIMEOUT_MS,
    driver: 'auto',
    executablePath: null,
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
          throw new Error('--weapons requires a comma-separated list (e.g. --weapons ak15,p08).');
        }
        for (const item of items) addWeapon(item);
        break;
      }
      case '--screens': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const items = value
          .split(',')
          .map((s) => s.trim().toLowerCase())
          .filter(Boolean);
        if (items.length === 0) {
          throw new Error(
            `--screens requires a comma-separated list from: ${VALID_SCREENS.join(', ')}`
          );
        }
        for (const item of items) {
          if (!VALID_SCREENS.includes(item)) {
            throw new Error(
              `Unknown screen "${item}". Valid screens: ${VALID_SCREENS.join(', ')}`
            );
          }
          opts.screens.push(item);
        }
        break;
      }
      case '--out': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        opts.outDir = value;
        break;
      }
      case '--cut': {
        if (inline === 'both') {
          opts.cut = true;
          opts.cutMode = 'both';
        } else if (inline === 'false' || inline === '0') {
          opts.cut = false;
          opts.cutMode = 'off';
        } else {
          opts.cut = true;
          opts.cutMode = 'only';
        }
        break;
      }
      case '--explode': {
        if (inline === 'both') {
          opts.explode = true;
          opts.explodeMode = 'both';
        } else if (inline === 'false' || inline === '0') {
          opts.explode = false;
          opts.explodeMode = 'off';
        } else {
          opts.explode = true;
          opts.explodeMode = 'only';
        }
        break;
      }
      case '--format': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const fmt = value.trim().toLowerCase();
        if (!VALID_FORMATS.includes(fmt)) {
          throw new Error(`Invalid --format "${value}". Expected png or jpg.`);
        }
        opts.format = fmt === 'jpeg' ? 'jpg' : fmt;
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
      case '--settle-ms': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isFinite(n) || n < 0 || n > 30_000) {
          throw new Error(`Invalid --settle-ms "${value}". Expected 0..30000.`);
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
      case '--driver': {
        const { value, nextIndex } = readVal(i, flag, inline);
        i = nextIndex;
        const d = value.trim().toLowerCase();
        if (!VALID_DRIVERS.includes(d)) {
          throw new Error(
            `Invalid --driver "${value}". Expected one of: ${VALID_DRIVERS.join(', ')}`
          );
        }
        opts.driver = d;
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
      default:
        throw new Error(`Unknown option "${flag}". Run with --help for usage.`);
    }
  }

  opts.weapons = Array.from(new Set(opts.weapons));
  opts.screens = Array.from(new Set(opts.screens));

  if (!opts.help && opts.weapons.length === 0 && opts.screens.length === 0) {
    opts.weapons = ['ak15'];
  }

  return opts;
}

/**
 * Build deterministic capture targets from parsed CLI options and base URL.
 */
export function buildQaTargets(baseUrl, options) {
  const normalizedBase = baseUrl.endsWith('/') ? baseUrl : `${baseUrl}/`;
  const ext = options.format === 'jpg' ? 'jpg' : 'png';
  const targets = [];

  const buildUrl = (params) => {
    const u = new URL(normalizedBase);
    for (const [k, v] of Object.entries(params)) {
      if (v !== undefined && v !== null && v !== '') {
        u.searchParams.set(k, String(v));
      }
    }
    return u.toString();
  };

  const hasExplicitScreens = options.screens.length > 0;
  const includeWorkbench =
    options.weapons.length > 0 || options.screens.includes('workbench');
  const weapons =
    options.weapons.length > 0
      ? options.weapons
      : includeWorkbench
        ? ['ak15']
        : [];

  if (hasExplicitScreens) {
    for (const screen of options.screens) {
      if (screen === 'workbench') continue;
      if (screen === 'armor') {
        const params = { screen: 'armory', panel: 'armor' };
        if (options.lang) params.lang = options.lang;
        targets.push({
          id: 'screen-armor-lab',
          screen: 'armor',
          weaponId: null,
          cut: false,
          expectsWebgl: false,
          url: buildUrl(params),
          fileName: `screen-armor-lab.${ext}`,
        });
        continue;
      }
      const params = { screen };
      if (options.lang) params.lang = options.lang;
      if (screen === 'split_showdown' && weapons.length >= 2) {
        params.weaponA = weapons[0];
        params.weaponB = weapons[1];
      } else if (
        (screen === 'cartridges' || screen === 'ballistics') &&
        weapons.length >= 1
      ) {
        params.weapon = weapons[0];
      }
      targets.push({
        id: `screen-${screen}`,
        screen,
        weaponId: null,
        cut: false,
        expectsWebgl: SCREENS_WITH_WEBGL.has(screen),
        url: buildUrl(params),
        fileName: `screen-${screen}.${ext}`,
      });
    }
  }

  if (includeWorkbench) {
    for (const weaponId of weapons) {
      const cutVariants =
        options.cutMode === 'both'
          ? [false, true]
          : options.cutMode === 'only' || options.cut
            ? [true]
            : [false];
      const explodeVariants =
        options.explodeMode === 'both'
          ? [false, true]
          : options.explodeMode === 'only' || options.explode
            ? [true]
            : [false];

      for (const isCut of cutVariants) {
        for (const isExplode of explodeVariants) {
          const params = {
            screen: 'workbench',
            weapon: weaponId,
          };
          if (isCut) params.cut = '1';
          if (isExplode) params.explode = '1';
          if (options.lang) params.lang = options.lang;
          const id = `workbench-${weaponId}${isCut ? '-cut' : ''}${isExplode ? '-explode' : ''}`;
          targets.push({
            id,
            screen: 'workbench',
            weaponId,
            cut: isCut,
            explode: isExplode,
            expectsWebgl: true,
            url: buildUrl(params),
            fileName: `${id}.${ext}`,
          });
        }
      }
    }
  }

  return targets;
}

/**
 * Inspect PNG IHDR or JPEG SOF markers to confirm exact screenshot pixel dimensions.
 */
export function inspectImageDimensions(buf) {
  if (!(buf instanceof Uint8Array) || buf.byteLength < 24) {
    return null;
  }
  const b = Buffer.isBuffer(buf)
    ? buf
    : Buffer.from(buf.buffer, buf.byteOffset, buf.byteLength);

  // PNG magic: 89 50 4E 47 0D 0A 1A 0A, IHDR width/height at offsets 16..24
  if (
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return {
      format: 'png',
      width: b.readUInt32BE(16),
      height: b.readUInt32BE(20),
    };
  }

  // JPEG magic: FF D8
  if (b[0] === 0xff && b[1] === 0xd8) {
    let offset = 2;
    while (offset + 9 < b.byteLength) {
      if (b[offset] !== 0xff) {
        offset += 1;
        continue;
      }
      const marker = b[offset + 1];
      offset += 2;
      if (marker === 0xd8 || marker === 0x01) continue;
      if (marker === 0xd9 || marker === 0xda) break;
      const segLen = b.readUInt16BE(offset);
      if (
        marker === 0xc0 ||
        marker === 0xc1 ||
        marker === 0xc2 ||
        marker === 0xc3
      ) {
        const height = b.readUInt16BE(offset + 3);
        const width = b.readUInt16BE(offset + 5);
        return { format: 'jpg', width, height };
      }
      offset += segLen;
    }
  }

  return null;
}

async function terminateProcess(child, label = 'process') {
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
        if (child.exitCode === null) {
          logWarn(`Force-killing ${label} (pid=${child.pid})`);
          child.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
      finish();
    }, 3000);
    timer.unref?.();
  });
}

/**
 * Auto-start `vite preview` (when `dist/index.html` exists) or `vite` dev server.
 */
export async function startLocalViteServer(
  repoRoot = DEFAULT_REPO_ROOT,
  timeoutMs = 30_000,
  quiet = false
) {
  const distIndexPath = path.join(repoRoot, 'dist', 'index.html');
  const hasDist = fs.existsSync(distIndexPath);
  const mode = hasDist ? 'preview' : 'dev';
  const viteJsPath = path.join(repoRoot, 'node_modules', 'vite', 'bin', 'vite.js');

  const viteArgs = hasDist
    ? ['preview', '--host', '127.0.0.1', '--port', '0', '--strictPort=false']
    : ['--host', '127.0.0.1', '--port', '0', '--strictPort=false'];

  const command = fs.existsSync(viteJsPath) ? process.execPath : 'npx';
  const spawnArgs = fs.existsSync(viteJsPath)
    ? [viteJsPath, ...viteArgs]
    : ['vite', ...viteArgs];

  if (!quiet) {
    logInfo(
      `Auto-starting local Vite ${mode} server (${hasDist ? 'serving dist/' : 'dev fallback — dist/ not found'})...`
    );
  }

  const child = spawn(command, spawnArgs, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });

  let stdoutLog = '';
  let stderrLog = '';

  const detectedUrl = await new Promise((resolve, reject) => {
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
          `Timed out waiting ${timeoutMs}ms for Vite ${mode} server.\nSTDOUT:\n${stdoutLog}\nSTDERR:\n${stderrLog}`
        )
      );
    }, timeoutMs);
    timer.unref?.();

    const inspect = (chunk, isErr) => {
      const text = chunk.toString('utf8');
      if (isErr) stderrLog += text;
      else stdoutLog += text;
      const u = parseViteServerUrl(text);
      if (u) finishResolve(u);
    };

    child.stdout.on('data', (c) => inspect(c, false));
    child.stderr.on('data', (c) => inspect(c, true));
    child.once('error', (err) =>
      finishReject(new Error(`Failed to spawn Vite ${mode}: ${err.message}`))
    );
    child.once('exit', (code, signal) =>
      finishReject(
        new Error(
          `Vite ${mode} server exited early (code=${code}, signal=${signal}).\nSTDERR:\n${stderrLog}`
        )
      )
    );
  });

  const deadline = Date.now() + 10_000;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(detectedUrl);
      if (res.ok || res.status < 500) {
        reachable = true;
        break;
      }
    } catch {
      // retry
    }
    await sleep(150);
  }
  if (!reachable) {
    await terminateProcess(child, `vite ${mode}`);
    throw new Error(`Vite ${mode} announced ${detectedUrl} but HTTP probe failed.`);
  }

  if (!quiet) {
    logInfo(`Local Vite ${mode} server ready at ${detectedUrl}`);
  }
  return {
    url: detectedUrl,
    mode,
    stop: async () => {
      await terminateProcess(child, `vite ${mode}`);
    },
  };
}

/**
 * In-page probe evaluating DOM readiness, geometry build completion, WebGL canvas status,
 * and image load completion.
 */
export const PAGE_READINESS_PROBE_SCRIPT = `(() => {
  const canvases = Array.from(document.querySelectorAll('canvas')).map((c) => {
    const r = c.getBoundingClientRect();
    return {
      width: c.width,
      height: c.height,
      clientWidth: Math.round(r.width),
      clientHeight: Math.round(r.height),
    };
  });
  const primaryCanvas = canvases.find((c) => c.width > 0 && c.height > 0 && c.clientWidth >= 200 && c.clientHeight >= 150) || null;
  const geoBanner = document.querySelector('.geo-build-banner');
  const errorBoundary = document.querySelector('.viewport-error-boundary, .webgl-context-lost-banner');
  const imgs = Array.from(document.querySelectorAll('img')).filter((img) => {
    const src = img.getAttribute('src');
    if (!src) return false;
    const style = window.getComputedStyle(img);
    return style.display !== 'none' && style.visibility !== 'hidden';
  });
  const pendingImgs = imgs.filter((img) => !img.complete).length;
  const brokenImgs = imgs.filter((img) => img.complete && img.naturalWidth === 0).length;
  return {
    readyState: document.readyState,
    fontsStatus: document.fonts ? document.fonts.status : 'loaded',
    hasGeoBuildBanner: Boolean(geoBanner),
    hasErrorBoundary: Boolean(errorBoundary),
    canvasCount: canvases.length,
    primaryCanvas,
    visibleImages: imgs.length,
    pendingImgs,
    brokenImgs,
    title: document.title,
  };
})()`;

export const WAIT_STABILIZE_FRAMES_SCRIPT = `(async (frameCount) => {
  if (document.fonts && document.fonts.ready) {
    await Promise.race([
      document.fonts.ready.catch(() => undefined),
      new Promise((r) => setTimeout(r, 8000)),
    ]);
  }
  for (let i = 0; i < frameCount; i += 1) {
    await new Promise((r) => requestAnimationFrame(r));
  }
  return true;
})`;

export const SET_EXPLODE_FULL_SCRIPT = `(() => {
  const slider = document.querySelector('input.explode-slider');
  if (!slider) return false;
  const setter = Object.getOwnPropertyDescriptor(
    window.HTMLInputElement.prototype,
    'value'
  )?.set;
  if (setter) {
    setter.call(slider, '1000');
  } else {
    slider.value = '1000';
  }
  slider.dispatchEvent(new Event('input', { bubbles: true }));
  slider.dispatchEvent(new Event('change', { bubbles: true }));
  return true;
})()`;

const DETACHED_WORKER_SCRIPT_RE =
  /(?:\.worker(?:[-.][^/?#]*)?\.js|\/sw\.js)(?:[?#]|$)/i;

function isDetachedWorkerScriptUrl(url) {
  return typeof url === 'string' && DETACHED_WORKER_SCRIPT_RE.test(url);
}

/**
 * Minimal Node 22+ native WebSocket Chrome DevTools Protocol client.
 */
export class NativeCdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.closed = false;

    ws.addEventListener('message', (event) => this.#onMessage(event.data));
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket closed unexpectedly.'));
      }
      this.pending.clear();
    });
    ws.addEventListener('error', (event) => {
      const msg = event?.message || 'CDP WebSocket transport error';
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(msg));
      }
      this.pending.clear();
    });
  }

  static async connect(wsUrl, timeoutMs = 15_000) {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error('Native WebSocket unavailable (requires Node 22+).');
    }
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try {
          ws.close();
        } catch {
          // ignore
        }
        reject(new Error(`Timed out connecting to CDP endpoint ${wsUrl}`));
      }, timeoutMs);
      timer.unref?.();

      ws.addEventListener('open', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(new NativeCdpClient(ws));
      });
      ws.addEventListener('error', () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        reject(new Error(`Failed to open CDP WebSocket at ${wsUrl}`));
      });
    });
  }

  #onMessage(rawData) {
    const text = typeof rawData === 'string' ? rawData : String(rawData);
    let msg;
    try {
      msg = JSON.parse(text);
    } catch {
      return;
    }

    if (typeof msg.id === 'number') {
      const entry = this.pending.get(msg.id);
      if (!entry) return;
      this.pending.delete(msg.id);
      clearTimeout(entry.timer);
      if (msg.error) {
        const detail = msg.error.data ? ` (${msg.error.data})` : '';
        entry.reject(
          new Error(`CDP ${entry.method} failed [${msg.error.code}]: ${msg.error.message}${detail}`)
        );
      } else {
        entry.resolve(msg.result ?? {});
      }
      return;
    }

    if (typeof msg.method === 'string') {
      const listeners = this.eventListeners.get(msg.method);
      if (listeners) {
        for (const fn of listeners) {
          try {
            fn(msg.params ?? {}, msg.sessionId ?? null);
          } catch {
            // ignore listener failure
          }
        }
      }
    }
  }

  on(method, listener) {
    let set = this.eventListeners.get(method);
    if (!set) {
      set = new Set();
      this.eventListeners.set(method, set);
    }
    set.add(listener);
    return () => set.delete(listener);
  }

  send(method, params = {}, sessionId = undefined, commandTimeoutMs = 45_000) {
    if (this.closed) {
      return Promise.reject(new Error(`Cannot send CDP ${method}: connection closed.`));
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) payload.sessionId = sessionId;

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP ${method} timed out after ${commandTimeoutMs}ms.`));
      }, commandTimeoutMs);
      timer.unref?.();

      this.pending.set(id, { resolve, reject, timer, method });
      try {
        this.ws.send(JSON.stringify(payload));
      } catch (err) {
        clearTimeout(timer);
        this.pending.delete(id);
        reject(err);
      }
    });
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    try {
      this.ws.close();
    } catch {
      // ignore
    }
  }
}

export async function waitForTargetReadiness({
  probeFn,
  waitFramesFn,
  getInFlightUrls,
  getLastNetActivityMs,
  expectsWebgl,
  timeoutMs,
  settleMs,
}) {
  const start = Date.now();
  const deadline = start + timeoutMs;
  const quietWindowMs = expectsWebgl ? 700 : 450;
  let lastProbe = null;
  let lastPending = [];

  while (Date.now() < deadline) {
    const snap = await probeFn();
    lastProbe = snap;
    const inFlightUrls = getInFlightUrls();
    const docReady = snap && snap.readyState === 'complete';
    const noGeoBanner = !snap?.hasGeoBuildBanner;
    const canvasOk = !expectsWebgl || Boolean(snap?.primaryCanvas);
    const imagesReady = (snap?.pendingImgs ?? 0) === 0;
    const quietElapsed = Date.now() - getLastNetActivityMs();
    const netQuiet = inFlightUrls.length === 0 && quietElapsed >= quietWindowMs;

    lastPending = [];
    if (!docReady) lastPending.push(`readyState=${snap?.readyState ?? 'null'}`);
    if (!noGeoBanner) lastPending.push('geo-build-banner-visible');
    if (!canvasOk) lastPending.push('canvas-not-ready');
    if (!imagesReady) lastPending.push(`pendingImgs=${snap?.pendingImgs}`);
    if (inFlightUrls.length > 0) {
      lastPending.push(`inFlight=${inFlightUrls.slice(0, 3).join(',')}`);
    } else if (quietElapsed < quietWindowMs) {
      lastPending.push(`netQuiet=${quietElapsed}ms/${quietWindowMs}ms`);
    }

    if (docReady && noGeoBanner && canvasOk && imagesReady && netQuiet) {
      await waitFramesFn(expectsWebgl ? 12 : 6);
      if (settleMs > 0) {
        await sleep(expectsWebgl ? settleMs : Math.min(settleMs, 600));
      }
      await waitFramesFn(4);
      const finalProbe = await probeFn();
      return {
        ready: true,
        probe: finalProbe,
        pendingReasons: [],
      };
    }

    await sleep(200);
  }

  return {
    ready: false,
    probe: lastProbe,
    pendingReasons: lastPending,
  };
}

/**
 * Driver 1: Playwright (`playwright` or `playwright-core`) when installed.
 */
async function tryCreatePlaywrightDriver(options) {
  let pw = null;
  let pkgName = null;
  for (const candidate of ['playwright', 'playwright-core']) {
    try {
      pw = await import(candidate);
      pkgName = candidate;
      break;
    } catch {
      // not installed
    }
  }
  if (!pw || !pw.chromium) return null;

  let executablePath = options.executablePath || undefined;
  let isHeadlessShell = false;
  if (!executablePath && pkgName === 'playwright-core') {
    const discovered = discoverChromiumExecutable();
    if (discovered) {
      executablePath = discovered.executablePath;
      isHeadlessShell = discovered.isHeadlessShell;
    }
  }

  const launchArgs = buildChromiumLaunchArgs({
    mode: 'playwright',
    isHeadlessShell,
    viewportWidth: QA_VIEWPORT_WIDTH,
    viewportHeight: QA_VIEWPORT_HEIGHT,
    deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
  });

  const browser = await pw.chromium.launch({
    headless: true,
    executablePath,
    args: launchArgs,
  });

  const context = await browser.newContext({
    viewport: { width: QA_VIEWPORT_WIDTH, height: QA_VIEWPORT_HEIGHT },
    deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
  });

  return {
    driverName: `playwright (${pkgName})`,
    executablePath:
      executablePath || pw.chromium.executablePath?.() || 'bundled-chromium',
    async captureTarget(target, outPath, runOpts) {
      const startedAt = Date.now();
      const page = await context.newPage();
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const activeRequests = new Map();
      let lastNetActivityMs = Date.now();
      let tearingDown = false;

      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          consoleErrors.push(msg.text());
        }
      });
      page.on('pageerror', (err) => {
        pageErrors.push(err?.message || String(err));
      });
      page.on('request', (req) => {
        const url = req.url();
        if (!url.startsWith('data:') && !url.startsWith('blob:')) {
          activeRequests.set(req, url);
          lastNetActivityMs = Date.now();
        }
      });
      page.on('requestfinished', (req) => {
        activeRequests.delete(req);
        lastNetActivityMs = Date.now();
      });
      page.on('requestfailed', (req) => {
        activeRequests.delete(req);
        lastNetActivityMs = Date.now();
        if (tearingDown) return;
        const reason = req.failure()?.errorText || 'requestfailed';
        failedRequests.push({
          url: req.url(),
          method: req.method(),
          status: null,
          reason,
        });
      });
      page.on('response', (res) => {
        lastNetActivityMs = Date.now();
        if (tearingDown) return;
        if (res.status() >= 400) {
          failedRequests.push({
            url: res.url(),
            method: res.request().method(),
            status: res.status(),
            reason: `HTTP ${res.status()}`,
          });
        }
      });

      try {
        await page.goto(target.url, {
          waitUntil: 'domcontentloaded',
          timeout: runOpts.timeoutMs,
        });

        const readiness = await waitForTargetReadiness({
          probeFn: () =>
            page.evaluate((expr) => (0, eval)(expr), PAGE_READINESS_PROBE_SCRIPT),
          waitFramesFn: (frames) =>
            page.evaluate(
              ({ expr, n }) => (0, eval)(expr)(n),
              { expr: WAIT_STABILIZE_FRAMES_SCRIPT, n: frames }
            ),
          getInFlightUrls: () => Array.from(activeRequests.values()),
          getLastNetActivityMs: () => lastNetActivityMs,
          expectsWebgl: target.expectsWebgl,
          timeoutMs: runOpts.timeoutMs,
          settleMs: runOpts.settleMs,
        });

        if (target.explode) {
          const moved = await page.evaluate(
            (expr) => (0, eval)(expr),
            SET_EXPLODE_FULL_SCRIPT
          );
          if (moved) {
            await sleep(900);
            await page.evaluate(
              ({ expr, n }) => (0, eval)(expr)(n),
              { expr: WAIT_STABILIZE_FRAMES_SCRIPT, n: 16 }
            );
          }
        }

        await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
        const screenshotBuf = await page.screenshot({
          path: outPath,
          type: runOpts.format === 'jpg' ? 'jpeg' : 'png',
          quality: runOpts.format === 'jpg' ? 92 : undefined,
          fullPage: false,
        });

        const dims = inspectImageDimensions(screenshotBuf);
        return {
          readiness,
          consoleErrors,
          pageErrors,
          failedRequests,
          screenshotBytes: screenshotBuf.byteLength,
          screenshotDims: dims,
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        };
      } finally {
        tearingDown = true;
        await page.close().catch(() => undefined);
      }
    },
    async close() {
      await context.close().catch(() => undefined);
      await browser.close().catch(() => undefined);
    },
  };
}

/**
 * Driver 2: Zero-dependency native Node 22+ WebSocket CDP driver against local
 * Playwright Chromium or system Google Chrome.
 */
async function createNativeCdpDriver(options) {
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
    path.join(os.tmpdir(), 'digital-armory-qa-visual-')
  );
  const launchArgs = buildChromiumLaunchArgs({
    mode: 'cdp',
    isHeadlessShell: discovered.isHeadlessShell,
    userDataDir,
    viewportWidth: QA_VIEWPORT_WIDTH,
    viewportHeight: QA_VIEWPORT_HEIGHT,
    deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
  });

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
    }, 20_000);
    timer.unref?.();

    const onChunk = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
      if (match) finishResolve(match[1]);
    };

    child.stderr.on('data', onChunk);
    child.stdout.on('data', onChunk);
    child.once('error', (err) =>
      finishReject(
        new Error(`Failed to launch Chromium (${discovered.executablePath}): ${err.message}`)
      )
    );
    child.once('exit', (code, signal) =>
      finishReject(
        new Error(
          `Chromium exited before DevTools ready (code=${code}, signal=${signal}).\nSTDERR:\n${stderrBuf}`
        )
      )
    );
  });

  const cdp = await NativeCdpClient.connect(wsUrl);

  const evalInSession = async (
    sessionId,
    expression,
    awaitPromise = false,
    timeoutMs = 30_000
  ) => {
    const res = await cdp.send(
      'Runtime.evaluate',
      {
        expression,
        awaitPromise,
        returnByValue: true,
      },
      sessionId,
      timeoutMs
    );
    if (res.exceptionDetails) {
      const desc =
        res.exceptionDetails.exception?.description ||
        res.exceptionDetails.text ||
        'Unknown JS evaluation error';
      throw new Error(`Page evaluation error: ${desc}`);
    }
    return res.result?.value;
  };

  return {
    driverName: `native-cdp (${discovered.source})`,
    executablePath: discovered.executablePath,
    async captureTarget(target, outPath, runOpts) {
      const startedAt = Date.now();
      const { targetId } = await cdp.send('Target.createTarget', {
        url: 'about:blank',
      });

      let sessionId = null;
      const consoleErrors = [];
      const pageErrors = [];
      const failedRequests = [];
      const activeRequests = new Map();
      let lastNetActivityMs = Date.now();
      let tearingDown = false;
      const unsubs = [];

      try {
        const attached = await cdp.send('Target.attachToTarget', {
          targetId,
          flatten: true,
        });
        sessionId = attached.sessionId;

        unsubs.push(
          cdp.on('Runtime.exceptionThrown', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            const desc =
              params.exceptionDetails?.exception?.description ||
              params.exceptionDetails?.text ||
              'Uncaught page exception';
            pageErrors.push(desc);
          })
        );
        unsubs.push(
          cdp.on('Runtime.consoleAPICalled', (params, sid) => {
            if (sid !== sessionId || tearingDown || params.type !== 'error') return;
            const text = (params.args || [])
              .map((arg) => arg.value ?? arg.description ?? '')
              .filter(Boolean)
              .join(' ');
            if (text) consoleErrors.push(text);
          })
        );
        unsubs.push(
          cdp.on('Log.entryAdded', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            const entry = params.entry;
            if (!entry || entry.level !== 'error') return;
            // Network errors are recorded with full URL/status via Network domain below
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
            const url = params.request?.url || '';
            if (url.startsWith('data:') || url.startsWith('blob:')) return;
            // Dedicated/Service Worker bootstrap requests have an empty loaderId and
            // complete in their own worker target without firing loadingFinished here.
            if (
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
          })
        );
        unsubs.push(
          cdp.on('Network.responseReceived', (params, sid) => {
            if (sid !== sessionId || tearingDown) return;
            lastNetActivityMs = Date.now();
            const status = params.response?.status;
            const url = params.response?.url || activeRequests.get(params.requestId)?.url || '';
            if (typeof status === 'number' && status >= 400) {
              failedRequests.push({
                url,
                method: activeRequests.get(params.requestId)?.method || 'GET',
                status,
                reason: `HTTP ${status}`,
              });
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
            failedRequests.push({
              url: meta?.url || params.blockedReason || 'unknown-url',
              method: meta?.method || 'GET',
              status: null,
              reason: params.errorText || 'loadingFailed',
            });
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

        const nav = await cdp.send('Page.navigate', { url: target.url }, sessionId);
        if (nav.errorText) {
          throw new Error(`Navigation failed for ${target.url}: ${nav.errorText}`);
        }

        const readiness = await waitForTargetReadiness({
          probeFn: () =>
            evalInSession(sessionId, PAGE_READINESS_PROBE_SCRIPT, false, 15_000),
          waitFramesFn: (frames) =>
            evalInSession(
              sessionId,
              `(${WAIT_STABILIZE_FRAMES_SCRIPT})(${frames})`,
              true,
              15_000
            ),
          getInFlightUrls: () =>
            Array.from(activeRequests.values()).map((entry) => entry.url),
          getLastNetActivityMs: () => lastNetActivityMs,
          expectsWebgl: target.expectsWebgl,
          timeoutMs: runOpts.timeoutMs,
          settleMs: runOpts.settleMs,
        });

        if (target.explode) {
          const moved = await evalInSession(
            sessionId,
            SET_EXPLODE_FULL_SCRIPT,
            false,
            10_000
          );
          if (moved) {
            await sleep(900);
            await evalInSession(
              sessionId,
              `(${WAIT_STABILIZE_FRAMES_SCRIPT})(16)`,
              true,
              15_000
            );
          }
        }

        const shot = await cdp.send(
          'Page.captureScreenshot',
          {
            format: runOpts.format === 'jpg' ? 'jpeg' : 'png',
            quality: runOpts.format === 'jpg' ? 92 : undefined,
            fromSurface: true,
          },
          sessionId,
          30_000
        );

        if (!shot.data) {
          throw new Error('CDP Page.captureScreenshot returned empty payload.');
        }

        const buf = Buffer.from(shot.data, 'base64');
        await fs.promises.mkdir(path.dirname(outPath), { recursive: true });
        await fs.promises.writeFile(outPath, buf);

        const dims = inspectImageDimensions(buf);
        return {
          readiness,
          consoleErrors,
          pageErrors,
          failedRequests,
          screenshotBytes: buf.byteLength,
          screenshotDims: dims,
          elapsedSec: Number(((Date.now() - startedAt) / 1000).toFixed(2)),
        };
      } finally {
        tearingDown = true;
        for (const off of unsubs) off();
        await cdp.send('Target.closeTarget', { targetId }).catch(() => undefined);
      }
    },
    async close() {
      await cdp.send('Browser.close', {}, undefined, 5000).catch(() => undefined);
      cdp.close();
      await terminateProcess(child, 'chromium');
      fs.rmSync(userDataDir, { recursive: true, force: true });
    },
  };
}

async function createBrowserDriver(options) {
  if (options.driver === 'playwright') {
    const pw = await tryCreatePlaywrightDriver(options);
    if (!pw) {
      throw new Error(
        'Driver "playwright" requested, but neither `playwright` nor `playwright-core` is installed.'
      );
    }
    return pw;
  }
  if (options.driver === 'auto') {
    const pw = await tryCreatePlaywrightDriver(options);
    if (pw) return pw;
  }
  return createNativeCdpDriver(options);
}

export function summarizeWebglInvariants(results) {
  const list = Array.isArray(results) ? results : [];
  const webglTargets = list.filter(
    (r) =>
      r.expectsWebgl === true ||
      r.screen === 'workbench' ||
      r.screen === 'cartridges' ||
      r.screen === 'split_showdown'
  );
  const canvasesVerified = webglTargets.filter((r) =>
    Boolean(r.canvas && r.canvas.width > 0 && r.canvas.height > 0)
  ).length;
  const errorBoundaryHits = list.filter(
    (r) =>
      r.reasons?.includes('webgl-error-boundary-rendered') ||
      r.readiness?.hasErrorBoundary === true
  ).length;
  const zeroConsoleErrors = list.every(
    (r) => (r.consoleErrors?.length ?? 0) === 0
  );
  const zeroPageErrors = list.every((r) => (r.pageErrors?.length ?? 0) === 0);
  const zeroFailedRequests = list.every(
    (r) => (r.failedRequests?.length ?? 0) === 0
  );
  const allCanvasesPresent = canvasesVerified === webglTargets.length;

  return {
    webglTargetCount: webglTargets.length,
    canvasesVerified,
    allCanvasesPresent,
    errorBoundaryHits,
    zeroConsoleErrors,
    zeroPageErrors,
    zeroFailedRequests,
    allInvariantsPassed:
      list.length > 0 &&
      allCanvasesPresent &&
      errorBoundaryHits === 0 &&
      zeroConsoleErrors &&
      zeroPageErrors &&
      zeroFailedRequests,
  };
}

export function formatHelpText() {
  return `Digital Armory 3D — Automated 1920×1080 Headless Chromium Visual QA Gate

Usage:
  node scripts/qa_visual_gate.mjs [options]

Options:
  --url <baseUrl>        Target app URL (if omitted, auto-starts local Vite preview/dev server)
  --weapons <csv>        Comma-separated weapon IDs for workbench QA (default: ak15)
  --weapon <id>          Single weapon ID (repeatable alias for --weapons)
  --screens <csv>        Comma-separated screens (${VALID_SCREENS.join(', ')})
  --out <dir>            Output directory for screenshots & qa-report.json (default: ${DEFAULT_QA_OUT_DIR})
  --cut[=both]           Capture workbench with CT cutaway (?cut=1); use --cut=both for normal + cutaway
  --explode[=both]       Capture workbench in exploded view (?explode=1); use --explode=both for assembled + exploded
  --format <png|jpg>     Screenshot format (default: png)
  --lang <zh|en>         Optional locale query parameter
  --settle-ms <ms>       Extra WebGL stabilization delay in ms (default: ${DEFAULT_SETTLE_MS})
  --timeout <ms>         Per-target readiness timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --driver <mode>        auto | playwright | cdp (default: auto)
  --executable <path>    Explicit Chrome / Chromium binary path
  --dry-run              Print planned capture matrix & detected browser as JSON then exit
  -h, --help             Show this help text

Examples:
  node scripts/qa_visual_gate.mjs --weapons ak15
  node scripts/qa_visual_gate.mjs --weapons ak15,ztz99a --cut=both --explode=both --out exports/qa-v6
  node scripts/qa_visual_gate.mjs --screens armory,cartridges,ballistics --weapons ak15
`;
}

async function main() {
  let opts;
  try {
    opts = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    logError(err.message);
    process.exit(2);
  }

  if (opts.help) {
    process.stdout.write(formatHelpText());
    process.exit(0);
  }

  const outDirAbs = path.resolve(DEFAULT_REPO_ROOT, opts.outDir);

  if (opts.dryRun) {
    const discovered = discoverChromiumExecutable({
      explicitPath: opts.executablePath,
    });
    const previewBase = opts.url || 'http://127.0.0.1:4173/';
    const targets = buildQaTargets(previewBase, opts);
    process.stdout.write(
      `${JSON.stringify(
        {
          dryRun: true,
          viewport: {
            width: QA_VIEWPORT_WIDTH,
            height: QA_VIEWPORT_HEIGHT,
            deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
          },
          format: opts.format,
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
  let driver = null;

  try {
    let baseUrl = opts.url;
    let serverMode = 'external';
    if (!baseUrl) {
      server = await startLocalViteServer(DEFAULT_REPO_ROOT);
      baseUrl = server.url;
      serverMode = server.mode;
    }

    const targets = buildQaTargets(baseUrl, opts);
    driver = await createBrowserDriver(opts);
    logInfo(
      `Browser driver: ${driver.driverName} (${driver.executablePath}) | Viewport: ${QA_VIEWPORT_WIDTH}×${QA_VIEWPORT_HEIGHT} | Targets: ${targets.length}`
    );

    await fs.promises.mkdir(outDirAbs, { recursive: true });
    const results = [];

    for (const target of targets) {
      const shotPath = path.join(outDirAbs, target.fileName);
      logInfo(`Capturing ${target.id} -> ${target.url}`);
      let outcome;
      let fatalError = null;
      try {
        outcome = await driver.captureTarget(target, shotPath, opts);
      } catch (err) {
        fatalError = err instanceof Error ? err.message : String(err);
      }

      if (fatalError || !outcome) {
        results.push({
          id: target.id,
          screen: target.screen,
          weaponId: target.weaponId,
          cut: target.cut,
          explode: Boolean(target.explode),
          expectsWebgl: target.expectsWebgl,
          url: target.url,
          passed: false,
          reasons: [fatalError || 'Unknown capture failure'],
          consoleErrors: [],
          pageErrors: fatalError ? [fatalError] : [],
          failedRequests: [],
          canvas: null,
          screenshot: null,
          elapsedSec: 0,
        });
        logError(`FAIL ${target.id}: ${fatalError}`);
        continue;
      }

      const reasons = [];
      if (outcome.consoleErrors.length > 0) {
        reasons.push(`consoleErrors=${outcome.consoleErrors.length}`);
      }
      if (outcome.pageErrors.length > 0) {
        reasons.push(`pageErrors=${outcome.pageErrors.length}`);
      }
      if (outcome.failedRequests.length > 0) {
        reasons.push(`failedRequests=${outcome.failedRequests.length}`);
      }
      if (!outcome.readiness.ready) {
        const detail =
          outcome.readiness.pendingReasons?.length > 0
            ? `(${outcome.readiness.pendingReasons.join('; ')})`
            : '';
        reasons.push(`readiness-timeout${detail}`);
      }
      if (outcome.readiness.probe?.hasErrorBoundary) {
        reasons.push('webgl-error-boundary-rendered');
      }
      if (target.expectsWebgl && !outcome.readiness.probe?.primaryCanvas) {
        reasons.push('missing-webgl-canvas');
      }
      if (
        !outcome.screenshotDims ||
        outcome.screenshotDims.width !== QA_VIEWPORT_WIDTH ||
        outcome.screenshotDims.height !== QA_VIEWPORT_HEIGHT
      ) {
        reasons.push(
          `unexpected-screenshot-dimensions:${outcome.screenshotDims ? `${outcome.screenshotDims.width}x${outcome.screenshotDims.height}` : 'unreadable'}`
        );
      }

      const passed = reasons.length === 0;
      const entry = {
        id: target.id,
        screen: target.screen,
        weaponId: target.weaponId,
        cut: target.cut,
        explode: Boolean(target.explode),
        expectsWebgl: target.expectsWebgl,
        url: target.url,
        passed,
        reasons,
        consoleErrors: outcome.consoleErrors,
        pageErrors: outcome.pageErrors,
        failedRequests: outcome.failedRequests,
        canvas: outcome.readiness.probe?.primaryCanvas ?? null,
        readiness: {
          ready: outcome.readiness.ready,
          hasGeoBuildBanner: outcome.readiness.probe?.hasGeoBuildBanner ?? false,
          hasErrorBoundary: outcome.readiness.probe?.hasErrorBoundary ?? false,
          brokenImages: outcome.readiness.probe?.brokenImgs ?? 0,
        },
        screenshot: {
          path: path.relative(DEFAULT_REPO_ROOT, shotPath),
          fileName: target.fileName,
          bytes: outcome.screenshotBytes,
          width: outcome.screenshotDims?.width ?? null,
          height: outcome.screenshotDims?.height ?? null,
        },
        elapsedSec: outcome.elapsedSec,
      };
      results.push(entry);

      const statusTag = passed ? 'PASS' : 'FAIL';
      logInfo(
        `  [${statusTag}] ${target.id} (${entry.screenshot.width}×${entry.screenshot.height}, ${formatBytes(entry.screenshot.bytes)}, ${entry.elapsedSec}s) | consoleErr=${entry.consoleErrors.length} pageErr=${entry.pageErrors.length} failedReq=${entry.failedRequests.length}${reasons.length > 0 ? ` | reasons=${reasons.join(', ')}` : ''}`
      );
    }

    const totalConsoleErrors = results.reduce(
      (sum, r) => sum + r.consoleErrors.length,
      0
    );
    const totalPageErrors = results.reduce(
      (sum, r) => sum + r.pageErrors.length,
      0
    );
    const totalFailedRequests = results.reduce(
      (sum, r) => sum + r.failedRequests.length,
      0
    );
    const passedTargets = results.filter((r) => r.passed).length;
    const failedTargets = results.length - passedTargets;
    const allPassed =
      results.length > 0 &&
      failedTargets === 0 &&
      totalConsoleErrors === 0 &&
      totalPageErrors === 0 &&
      totalFailedRequests === 0;

    const webglInvariants = summarizeWebglInvariants(results);

    const report = {
      generatedAt: new Date().toISOString(),
      baseUrl,
      serverMode,
      driver: driver.driverName,
      executablePath: driver.executablePath,
      viewport: {
        width: QA_VIEWPORT_WIDTH,
        height: QA_VIEWPORT_HEIGHT,
        deviceScaleFactor: QA_DEVICE_SCALE_FACTOR,
      },
      format: opts.format,
      passed: allPassed,
      summary: {
        totalTargets: results.length,
        passedTargets,
        failedTargets,
        totalConsoleErrors,
        totalPageErrors,
        totalFailedRequests,
        totalElapsedSec: Number(((Date.now() - totalStart) / 1000).toFixed(2)),
      },
      webglInvariants,
      targets: results,
    };

    const reportPath = path.join(outDirAbs, 'qa-report.json');
    await fs.promises.writeFile(
      reportPath,
      `${JSON.stringify(report, null, 2)}\n`,
      'utf8'
    );
    logInfo(
      `QA report written to ${path.relative(DEFAULT_REPO_ROOT, reportPath)} — ${passedTargets}/${results.length} passed (${allPassed ? 'PASS' : 'FAIL'}).`
    );

    process.exitCode = allPassed ? 0 : 1;
  } finally {
    if (driver) {
      await driver.close().catch(() => undefined);
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

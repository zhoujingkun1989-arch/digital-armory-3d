#!/usr/bin/env node
/**
 * Digital Armory 3D — Offline 300 DPI Pre-Press PDF Batch Publishing Pipeline
 *
 * Drives Chromium via Playwright (when `playwright` / `playwright-core` is installed)
 * or falls back automatically to zero-dependency native Node 22 WebSocket CDP
 * against local Playwright Chromium or system Google Chrome.
 *
 * Usage:
 *   node scripts/export_dk_pdf.mjs --weapon p08 --thumbnails
 *   node scripts/export_dk_pdf.mjs --weapons p08,ak15 --layout spread_a3 --bleed
 *   node scripts/export_dk_pdf.mjs --all --layout portrait_a4 --no-bleed
 */

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  CliArgumentError,
  MIN_VALID_PDF_BYTES,
  buildChromiumLaunchArgs,
  buildMonographUrl,
  buildOutputPaths,
  computePrepressDimensions,
  discoverChromiumExecutable,
  formatBytes,
  formatHelpText,
  formatSummaryReport,
  getExpectedSheetCount,
  parseCliArgs,
  parseViteServerUrl,
  summarizePlateSources,
  validatePdfBuffer,
} from './dk_pdf_utils.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
const VIEWPORT_WIDTH = 1920;
const VIEWPORT_HEIGHT = 1200;
const DEVICE_SCALE_FACTOR = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function logInfo(msg) {
  process.stdout.write(`[dk-pdf] ${msg}\n`);
}

function logWarn(msg) {
  process.stderr.write(`[dk-pdf] WARN: ${msg}\n`);
}

function logError(msg) {
  process.stderr.write(`[dk-pdf] ERROR: ${msg}\n`);
}

/**
 * Browser-side synchronous readiness probe.
 * Honors the exact app readiness contract:
 *   - `.monograph-print-portal[data-monograph-ready="true"]`
 *   - `window.__MONOGRAPH_PRINT_READY__?.ready === true`
 */
const READINESS_PROBE_SCRIPT = `(() => {
  const readyPortal = document.querySelector('.monograph-print-portal[data-monograph-ready="true"]');
  const anyPortal = document.querySelector('.monograph-print-portal');
  const signal = window.__MONOGRAPH_PRINT_READY__;
  const ready = Boolean(readyPortal && signal && signal.ready === true);
  const imgs = anyPortal ? Array.from(anyPortal.querySelectorAll('img')) : [];
  const loadedImgs = imgs.filter((img) => img.complete && img.naturalWidth > 0).length;
  return {
    ready,
    hasPortal: Boolean(anyPortal),
    portalReadyAttr: anyPortal ? anyPortal.getAttribute('data-monograph-ready') : null,
    signalReady: Boolean(signal && signal.ready === true),
    completedPlates: typeof signal?.completedPlates === 'number' ? signal.completedPlates : null,
    totalPlates: typeof signal?.totalPlates === 'number' ? signal.totalPlates : null,
    totalImgs: imgs.length,
    loadedImgs,
    plateSources: signal?.plateSources && typeof signal.plateSources === 'object' ? signal.plateSources : null,
    pageCount: typeof signal?.pageCount === 'number' ? signal.pageCount : null,
    weaponId: typeof signal?.weaponId === 'string' ? signal.weaponId : null,
    layout: typeof signal?.layout === 'string' ? signal.layout : null,
    prepress: signal?.prepress ?? null,
  };
})()`;

/**
 * Browser-side async asset finalizer: waits for `document.fonts.ready` and decodes
 * every `<img>` inside `.monograph-print-portal` before PDF rasterization/vector print.
 */
const FINALIZE_ASSETS_SCRIPT = `(async () => {
  const withTimeout = (promise, ms) =>
    Promise.race([
      promise,
      new Promise((resolve) => setTimeout(resolve, ms)),
    ]);

  if (document.fonts && document.fonts.ready) {
    await withTimeout(document.fonts.ready.catch(() => undefined), 10000);
  }

  const portal = document.querySelector('.monograph-print-portal');
  const imgs = portal ? Array.from(portal.querySelectorAll('img')) : [];

  await Promise.allSettled(
    imgs.map(async (img) => {
      if (!img.getAttribute('src')) return;
      if (img.loading === 'lazy') {
        img.loading = 'eager';
      }
      if (!img.complete) {
        await withTimeout(
          new Promise((resolve) => {
            const done = () => resolve();
            img.addEventListener('load', done, { once: true });
            img.addEventListener('error', done, { once: true });
          }),
          15000
        );
      }
      if (typeof img.decode === 'function') {
        await withTimeout(img.decode().catch(() => undefined), 8000);
      }
    })
  );

  let loadedImages = 0;
  let brokenImages = 0;
  for (const img of imgs) {
    if (!img.getAttribute('src')) continue;
    if (img.complete && img.naturalWidth > 0) {
      loadedImages += 1;
    } else {
      brokenImages += 1;
    }
  }

  const signal = window.__MONOGRAPH_PRINT_READY__ || null;
  return {
    totalImages: imgs.length,
    loadedImages,
    brokenImages,
    fontsStatus: document.fonts ? document.fonts.status : 'unknown',
    plateSources: signal?.plateSources && typeof signal.plateSources === 'object' ? signal.plateSources : null,
    pageCount: typeof signal?.pageCount === 'number' ? signal.pageCount : null,
  };
})()`;

const WAIT_TWO_FRAMES_SCRIPT = `new Promise((resolve) => {
  requestAnimationFrame(() => requestAnimationFrame(() => resolve(true)));
})`;

const FIRST_SHEET_RECT_SCRIPT = `(() => {
  const selectors = [
    '.monograph-print-portal .dk-spread-sheet',
    '.monograph-print-portal .dk-page-sheet',
    '.monograph-print-portal .monograph-spread',
    '.monograph-print-portal .monograph-page',
    '.monograph-print-portal [data-spread="1"]',
    '.monograph-print-portal [data-page="1"]',
    '.monograph-print-portal',
  ];
  for (const sel of selectors) {
    const el = document.querySelector(sel);
    if (!el) continue;
    const rect = el.getBoundingClientRect();
    if (rect.width >= 10 && rect.height >= 10) {
      return {
        selector: sel,
        x: Math.max(0, Math.floor(rect.left + window.scrollX)),
        y: Math.max(0, Math.floor(rect.top + window.scrollY)),
        width: Math.ceil(rect.width),
        height: Math.ceil(rect.height),
      };
    }
  }
  return null;
})()`;

/**
 * Wait for a child process to terminate cleanly with graceful SIGTERM -> SIGKILL escalation.
 */
async function terminateProcess(child, label = 'process') {
  if (!child || child.exitCode !== null || child.killed) {
    return;
  }
  await new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      clearTimeout(killTimer);
      resolve();
    };
    child.once('exit', finish);
    try {
      child.kill('SIGTERM');
    } catch {
      finish();
      return;
    }
    const killTimer = setTimeout(() => {
      try {
        if (child.exitCode === null) {
          logWarn(`Force-killing unresponsive ${label} (pid=${child.pid}).`);
          child.kill('SIGKILL');
        }
      } catch {
        // ignore
      }
      finish();
    }, 3000);
    killTimer.unref?.();
  });
}

/**
 * Automatically start `vite preview` (when `dist/index.html` exists) or `vite` dev server
 * bound to `127.0.0.1` with `--port 0 --strictPort=false`, wait until HTTP responds,
 * and return `{ url, mode, stop }`.
 */
export async function startLocalViteServer(repoRoot = REPO_ROOT, timeoutMs = 30_000) {
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

  logInfo(
    `Auto-starting local Vite ${mode} server (${hasDist ? 'serving dist/' : 'dev mode'})...`
  );

  const child = spawn(command, spawnArgs, {
    cwd: repoRoot,
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, FORCE_COLOR: '0', NO_COLOR: '1' },
  });

  let stdoutLog = '';
  let stderrLog = '';

  const detectedUrl = await new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
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
          `Timed out waiting ${timeoutMs}ms for Vite ${mode} server to start.\nSTDOUT:\n${stdoutLog}\nSTDERR:\n${stderrLog}`
        )
      );
    }, timeoutMs);
    timer.unref?.();

    const inspect = (chunk, isErr) => {
      const text = chunk.toString('utf8');
      if (isErr) stderrLog += text;
      else stdoutLog += text;
      const url = parseViteServerUrl(text);
      if (url) {
        finishResolve(url);
      }
    };

    child.stdout.on('data', (chunk) => inspect(chunk, false));
    child.stderr.on('data', (chunk) => inspect(chunk, true));
    child.once('error', (err) => {
      finishReject(new Error(`Failed to spawn Vite ${mode} server: ${err.message}`));
    });
    child.once('exit', (code, signal) => {
      finishReject(
        new Error(
          `Vite ${mode} server exited prematurely (code=${code}, signal=${signal}).\nSTDOUT:\n${stdoutLog}\nSTDERR:\n${stderrLog}`
        )
      );
    });
  });

  // Confirm HTTP endpoint answers before launching Chromium
  const deadline = Date.now() + 10_000;
  let reachable = false;
  while (Date.now() < deadline) {
    try {
      const res = await fetch(detectedUrl, { method: 'GET' });
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
    await terminateProcess(child, 'vite server');
    throw new Error(`Vite ${mode} server announced ${detectedUrl}, but HTTP probe failed.`);
  }

  logInfo(`Local Vite ${mode} server ready at ${detectedUrl}`);

  return {
    url: detectedUrl,
    mode,
    stop: async () => {
      await terminateProcess(child, `vite ${mode} server`);
    },
  };
}

/**
 * Minimal, rock-solid Chrome DevTools Protocol client built on Node 22's native WebSocket.
 */
class NativeCdpClient {
  constructor(ws) {
    this.ws = ws;
    this.nextId = 1;
    this.pending = new Map();
    this.eventListeners = new Map();
    this.closed = false;

    ws.addEventListener('message', (event) => {
      this.#handleMessage(event.data);
    });
    ws.addEventListener('close', () => {
      this.closed = true;
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error('CDP WebSocket connection closed unexpectedly.'));
      }
      this.pending.clear();
    });
    ws.addEventListener('error', (event) => {
      const message = event?.message || 'CDP WebSocket transport error';
      for (const { reject, timer } of this.pending.values()) {
        clearTimeout(timer);
        reject(new Error(message));
      }
      this.pending.clear();
    });
  }

  static async connect(wsUrl, timeoutMs = 15_000) {
    if (typeof globalThis.WebSocket !== 'function') {
      throw new Error(
        'Native WebSocket is unavailable in this Node runtime (requires Node 22+).'
      );
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

  #handleMessage(rawData) {
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
            // ignore listener error
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

  send(method, params = {}, sessionId = undefined, commandTimeoutMs = 90_000) {
    if (this.closed) {
      return Promise.reject(new Error(`Cannot send CDP ${method}: connection closed.`));
    }
    const id = this.nextId;
    this.nextId += 1;
    const payload = { id, method, params };
    if (sessionId) {
      payload.sessionId = sessionId;
    }

    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`CDP command ${method} timed out after ${commandTimeoutMs}ms.`));
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

/**
 * Driver 1: Playwright (`playwright` or `playwright-core`) when installed.
 */
async function tryCreatePlaywrightDriver(options) {
  let pw = null;
  let packageName = null;
  for (const candidate of ['playwright', 'playwright-core']) {
    try {
      pw = await import(candidate);
      packageName = candidate;
      break;
    } catch {
      // not installed
    }
  }

  if (!pw || !pw.chromium) {
    return null;
  }

  let executablePath = options.executablePath || undefined;
  let isHeadlessShell = false;
  if (!executablePath && packageName === 'playwright-core') {
    const discovered = discoverChromiumExecutable();
    if (discovered) {
      executablePath = discovered.executablePath;
      isHeadlessShell = discovered.isHeadlessShell;
    }
  }

  const launchArgs = buildChromiumLaunchArgs({
    mode: 'playwright',
    isHeadlessShell,
    viewportWidth: VIEWPORT_WIDTH,
    viewportHeight: VIEWPORT_HEIGHT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  const browser = await pw.chromium.launch({
    headless: true,
    executablePath,
    args: launchArgs,
  });

  const context = await browser.newContext({
    viewport: { width: VIEWPORT_WIDTH, height: VIEWPORT_HEIGHT },
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  return {
    driverName: `playwright (${packageName})`,
    executablePath: executablePath || pw.chromium.executablePath?.() || 'bundled-chromium',
    async renderWeaponPdf(job) {
      const page = await context.newPage();
      const pageErrors = [];
      page.on('pageerror', (err) => {
        pageErrors.push(err?.message || String(err));
      });
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          pageErrors.push(`console.error: ${msg.text()}`);
        }
      });

      try {
        await page.goto(job.url, {
          waitUntil: 'domcontentloaded',
          timeout: job.timeoutMs,
        });

        const readiness = await pollReadiness(
          () => page.evaluate((expr) => (0, eval)(expr), READINESS_PROBE_SCRIPT),
          job.weaponId,
          job.timeoutMs,
          pageErrors
        );

        const finalized = await page.evaluate(
          (expr) => (0, eval)(expr),
          FINALIZE_ASSETS_SCRIPT
        );

        await page.emulateMedia({ media: 'print' });
        await page.evaluate((expr) => (0, eval)(expr), WAIT_TWO_FRAMES_SCRIPT);

        let thumbnailSaved = false;
        if (job.thumbnails) {
          const rect = await page.evaluate(
            (expr) => (0, eval)(expr),
            FIRST_SHEET_RECT_SCRIPT
          );
          await fs.promises.mkdir(path.dirname(job.thumbnailPath), { recursive: true });
          if (rect && rect.width >= 10 && rect.height >= 10) {
            await page.screenshot({
              path: job.thumbnailPath,
              type: 'png',
              clip: {
                x: rect.x,
                y: rect.y,
                width: rect.width,
                height: rect.height,
              },
            });
          } else {
            await page.screenshot({
              path: job.thumbnailPath,
              type: 'png',
              fullPage: false,
            });
          }
          thumbnailSaved = true;
        }

        const pdfBuffer = await page.pdf({
          width: `${job.dimensions.widthInches}in`,
          height: `${job.dimensions.heightInches}in`,
          landscape: job.dimensions.cdpLandscape,
          printBackground: true,
          preferCSSPageSize: true,
          displayHeaderFooter: false,
          margin: {
            top: '0in',
            right: '0in',
            bottom: '0in',
            left: '0in',
          },
        });

        return {
          pdfBuffer: Buffer.from(pdfBuffer),
          plateSources: finalized?.plateSources ?? readiness?.plateSources ?? null,
          brokenImages: finalized?.brokenImages ?? 0,
          thumbnailSaved,
          pageErrors,
        };
      } finally {
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
 * Driver 2: Zero-dependency native Node 22 WebSocket CDP driver against local
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
        : 'No Chromium or Google Chrome executable found. Install Playwright browsers (`npx playwright install chromium`), install Google Chrome, or pass `--executable <path>`.'
    );
  }

  const userDataDir = fs.mkdtempSync(
    path.join(os.tmpdir(), 'digital-armory-dk-pdf-')
  );
  const launchArgs = buildChromiumLaunchArgs({
    mode: 'cdp',
    isHeadlessShell: discovered.isHeadlessShell,
    userDataDir,
    viewportWidth: VIEWPORT_WIDTH,
    viewportHeight: VIEWPORT_HEIGHT,
    deviceScaleFactor: DEVICE_SCALE_FACTOR,
  });

  const child = spawn(discovered.executablePath, [...launchArgs, 'about:blank'], {
    stdio: ['ignore', 'pipe', 'pipe'],
  });

  let stderrBuf = '';
  const wsUrl = await new Promise((resolve, reject) => {
    let settled = false;
    const finishResolve = (url) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(url);
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
          `Timed out waiting for Chromium DevTools endpoint.\nSTDERR:\n${stderrBuf}`
        )
      );
    }, 20_000);
    timer.unref?.();

    const onChunk = (chunk) => {
      stderrBuf += chunk.toString('utf8');
      const match = /DevTools listening on (ws:\/\/[^\s]+)/.exec(stderrBuf);
      if (match) {
        finishResolve(match[1]);
      }
    };

    child.stderr.on('data', onChunk);
    child.stdout.on('data', onChunk);
    child.once('error', (err) => {
      finishReject(
        new Error(`Failed to launch Chromium (${discovered.executablePath}): ${err.message}`)
      );
    });
    child.once('exit', (code, signal) => {
      finishReject(
        new Error(
          `Chromium exited before DevTools became ready (code=${code}, signal=${signal}).\nSTDERR:\n${stderrBuf}`
        )
      );
    });
  });

  const cdp = await NativeCdpClient.connect(wsUrl);

  const evalInSession = async (sessionId, expression, awaitPromise = false, timeoutMs = 45_000) => {
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

  const readStreamToBuffer = async (sessionId, handle) => {
    const chunks = [];
    try {
      for (;;) {
        const res = await cdp.send(
          'IO.read',
          { handle, size: 1024 * 1024 },
          sessionId,
          60_000
        );
        if (res.data) {
          chunks.push(
            res.base64Encoded
              ? Buffer.from(res.data, 'base64')
              : Buffer.from(res.data, 'utf8')
          );
        }
        if (res.eof) {
          break;
        }
      }
    } finally {
      await cdp.send('IO.close', { handle }, sessionId, 15_000).catch(() => undefined);
    }
    return Buffer.concat(chunks);
  };

  return {
    driverName: `native-cdp (${discovered.source})`,
    executablePath: discovered.executablePath,
    async renderWeaponPdf(job) {
      const { targetId } = await cdp.send('Target.createTarget', {
        url: 'about:blank',
      });

      let sessionId = null;
      const pageErrors = [];
      let offException = null;
      let offConsole = null;

      try {
        const attached = await cdp.send('Target.attachToTarget', {
          targetId,
          flatten: true,
        });
        sessionId = attached.sessionId;

        offException = cdp.on('Runtime.exceptionThrown', (params, sid) => {
          if (sid !== sessionId) return;
          const desc =
            params.exceptionDetails?.exception?.description ||
            params.exceptionDetails?.text ||
            'Uncaught page exception';
          pageErrors.push(desc);
        });
        offConsole = cdp.on('Runtime.consoleAPICalled', (params, sid) => {
          if (sid !== sessionId || params.type !== 'error') return;
          const text = (params.args || [])
            .map((arg) => arg.value ?? arg.description ?? '')
            .filter(Boolean)
            .join(' ');
          if (text) pageErrors.push(`console.error: ${text}`);
        });

        await cdp.send('Page.enable', {}, sessionId);
        await cdp.send('Runtime.enable', {}, sessionId);
        await cdp.send(
          'Emulation.setDeviceMetricsOverride',
          {
            width: VIEWPORT_WIDTH,
            height: VIEWPORT_HEIGHT,
            deviceScaleFactor: DEVICE_SCALE_FACTOR,
            mobile: false,
          },
          sessionId
        );

        const nav = await cdp.send('Page.navigate', { url: job.url }, sessionId);
        if (nav.errorText) {
          throw new Error(`Navigation failed for ${job.url}: ${nav.errorText}`);
        }

        const readiness = await pollReadiness(
          () => evalInSession(sessionId, READINESS_PROBE_SCRIPT, false, 15_000),
          job.weaponId,
          job.timeoutMs,
          pageErrors
        );

        const finalized = await evalInSession(
          sessionId,
          FINALIZE_ASSETS_SCRIPT,
          true,
          Math.min(job.timeoutMs, 45_000)
        );

        await cdp.send(
          'Emulation.setEmulatedMedia',
          { media: 'print' },
          sessionId
        );
        await evalInSession(sessionId, WAIT_TWO_FRAMES_SCRIPT, true, 10_000);

        let thumbnailSaved = false;
        if (job.thumbnails) {
          const rect = await evalInSession(
            sessionId,
            FIRST_SHEET_RECT_SCRIPT,
            false,
            10_000
          );
          const screenshotParams = {
            format: 'png',
            fromSurface: true,
          };
          if (rect && rect.width >= 10 && rect.height >= 10) {
            screenshotParams.captureBeyondViewport = true;
            screenshotParams.clip = {
              x: rect.x,
              y: rect.y,
              width: rect.width,
              height: rect.height,
              scale: 1,
            };
          }
          const shot = await cdp.send(
            'Page.captureScreenshot',
            screenshotParams,
            sessionId,
            30_000
          );
          if (shot.data) {
            await fs.promises.mkdir(path.dirname(job.thumbnailPath), {
              recursive: true,
            });
            await fs.promises.writeFile(
              job.thumbnailPath,
              Buffer.from(shot.data, 'base64')
            );
            thumbnailSaved = true;
          }
        }

        const pdfResult = await cdp.send(
          'Page.printToPDF',
          {
            landscape: job.dimensions.cdpLandscape,
            displayHeaderFooter: false,
            printBackground: true,
            scale: 1,
            paperWidth: job.dimensions.widthInches,
            paperHeight: job.dimensions.heightInches,
            marginTop: job.dimensions.marginsInches.top,
            marginBottom: job.dimensions.marginsInches.bottom,
            marginLeft: job.dimensions.marginsInches.left,
            marginRight: job.dimensions.marginsInches.right,
            preferCSSPageSize: true,
            transferMode: 'ReturnAsStream',
          },
          sessionId,
          Math.max(job.timeoutMs, 180_000)
        );

        let pdfBuffer;
        if (pdfResult.stream) {
          pdfBuffer = await readStreamToBuffer(sessionId, pdfResult.stream);
        } else if (pdfResult.data) {
          pdfBuffer = Buffer.from(pdfResult.data, 'base64');
        } else {
          throw new Error('CDP Page.printToPDF returned neither a stream nor base64 data.');
        }

        return {
          pdfBuffer,
          plateSources: finalized?.plateSources ?? readiness?.plateSources ?? null,
          brokenImages: finalized?.brokenImages ?? 0,
          thumbnailSaved,
          pageErrors,
        };
      } finally {
        offException?.();
        offConsole?.();
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

/**
 * Poll the page until both `.monograph-print-portal[data-monograph-ready="true"]`
 * and `window.__MONOGRAPH_PRINT_READY__?.ready === true` become true.
 */
async function pollReadiness(probeFn, weaponId, timeoutMs, pageErrors) {
  const startMs = Date.now();
  const deadline = startMs + timeoutMs;
  let lastProgressKey = '';
  let lastSnapshot = null;

  while (Date.now() < deadline) {
    try {
      const snap = await probeFn();
      lastSnapshot = snap;
      if (snap && snap.ready) {
        return snap;
      }
      if (snap) {
        const progressKey = `${snap.completedPlates}/${snap.totalPlates}:${snap.loadedImgs}/${snap.totalImgs}`;
        if (
          progressKey !== lastProgressKey &&
          (snap.completedPlates !== null || snap.totalImgs > 0)
        ) {
          lastProgressKey = progressKey;
          const elapsed = ((Date.now() - startMs) / 1000).toFixed(1);
          const plateText =
            snap.completedPlates !== null && snap.totalPlates !== null
              ? `plates ${snap.completedPlates}/${snap.totalPlates}`
              : `images ${snap.loadedImgs}/${snap.totalImgs}`;
          logInfo(`  [${weaponId}] waiting for monograph ready (${plateText}, ${elapsed}s)...`);
        }
      }
    } catch {
      // Page may still be navigating or re-initializing JS context
    }
    await sleep(350);
  }

  const errTail =
    pageErrors.length > 0
      ? ` Recent page errors: ${pageErrors.slice(-3).join(' | ')}`
      : '';
  const snapInfo = lastSnapshot
    ? ` Last state: hasPortal=${lastSnapshot.hasPortal}, data-monograph-ready=${lastSnapshot.portalReadyAttr}, signalReady=${lastSnapshot.signalReady}, imgs=${lastSnapshot.loadedImgs}/${lastSnapshot.totalImgs}.`
    : '';
  throw new Error(
    `Timed out after ${timeoutMs}ms waiting for monograph readiness signal for "${weaponId}".${snapInfo}${errTail}`
  );
}

/**
 * Acquire the appropriate browser driver (Playwright preferred in `auto` mode,
 * automatic zero-dependency native Node 22 WebSocket CDP fallback).
 */
async function acquireBrowserDriver(options) {
  if (options.driver === 'auto' || options.driver === 'playwright') {
    const pwDriver = await tryCreatePlaywrightDriver(options);
    if (pwDriver) {
      return pwDriver;
    }
    if (options.driver === 'playwright') {
      throw new Error(
        'Driver "playwright" was explicitly requested, but neither "playwright" nor "playwright-core" is installed. Install playwright or use `--driver auto` / `--driver cdp`.'
      );
    }
  }
  return createNativeCdpDriver(options);
}

/**
 * Execute the complete pre-press PDF export pipeline for parsed CLI options.
 */
export async function runExportPipeline(options, repoRoot = REPO_ROOT) {
  const dimensions = computePrepressDimensions(options.layout, options.bleed);
  const expectedSheets = getExpectedSheetCount(options.layout, options.pages);
  const outDirAbs = path.resolve(repoRoot, options.outDir);

  if (options.dryRun) {
    const previewBase = options.baseUrl || 'http://127.0.0.1:4173/';
    const discovered = discoverChromiumExecutable({
      explicitPath: options.executablePath,
    });
    logInfo('DRY RUN — no browser or server launched.');
    logInfo(
      `Format      : ${dimensions.label} | trim ${dimensions.trimWidthMm}×${dimensions.trimHeightMm}mm | sheet ${dimensions.widthMm}×${dimensions.heightMm}mm (${dimensions.widthInches.toFixed(4)}×${dimensions.heightInches.toFixed(4)} in, ${dimensions.widthPx300Dpi}×${dimensions.heightPx300Dpi} px @ 300 DPI)`
    );
    logInfo(
      `Pre-Press   : bleed=${options.bleed ? `${dimensions.bleedMm}mm (prepress=1)` : 'disabled (prepress=0)'} | expected sheets=${expectedSheets}`
    );
    logInfo(
      `Browser     : ${discovered ? `${discovered.executablePath} (${discovered.source})` : 'NOT FOUND'}`
    );
    for (const weaponId of options.weapons) {
      const url = buildMonographUrl(previewBase, { ...options, weapon: weaponId });
      const paths = buildOutputPaths(outDirAbs, weaponId, options);
      logInfo(`  [${weaponId}] URL -> ${url}`);
      logInfo(`  [${weaponId}] PDF -> ${paths.pdfPath}`);
      if (options.thumbnails) {
        logInfo(`  [${weaponId}] PNG -> ${paths.thumbnailPath}`);
      }
    }
    return { ok: true, results: [], dryRun: true };
  }

  let serverHandle = null;
  let browserDriver = null;
  let shuttingDown = false;

  const cleanup = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (browserDriver) {
      await browserDriver.close().catch(() => undefined);
      browserDriver = null;
    }
    if (serverHandle) {
      await serverHandle.stop().catch(() => undefined);
      serverHandle = null;
    }
  };

  const onSignal = (sig) => {
    logWarn(`Received ${sig}; shutting down Chromium and Vite server cleanly...`);
    cleanup().finally(() => process.exit(130));
  };
  process.once('SIGINT', onSignal);
  process.once('SIGTERM', onSignal);

  const pipelineStartMs = Date.now();
  const results = [];

  try {
    let baseUrl = options.baseUrl;
    if (!baseUrl) {
      serverHandle = await startLocalViteServer(repoRoot);
      baseUrl = serverHandle.url;
    }

    browserDriver = await acquireBrowserDriver(options);
    logInfo(
      `Browser ready via ${browserDriver.driverName} (${browserDriver.executablePath})`
    );
    logInfo(
      `Exporting ${options.weapons.length} exhibit(s) -> ${dimensions.label} ${dimensions.widthMm}×${dimensions.heightMm}mm (${options.bleed ? '+3mm bleed' : 'trim only'}), style=${options.style}, edition=${options.edition}, quality=${options.quality}, lang=${options.lang}`
    );

    await fs.promises.mkdir(outDirAbs, { recursive: true });

    const jobs = options.weapons.map((weaponId) => {
      const outPaths = buildOutputPaths(outDirAbs, weaponId, options);
      return {
        weaponId,
        url: buildMonographUrl(baseUrl, { ...options, weapon: weaponId }),
        pdfPath: outPaths.pdfPath,
        thumbnailPath: outPaths.thumbnailPath,
        thumbnails: options.thumbnails,
        timeoutMs: options.timeoutMs,
        dimensions,
      };
    });

    const runJob = async (job, index) => {
      const startedMs = Date.now();
      logInfo(
        `[${index + 1}/${jobs.length}] Rendering ${job.weaponId} (${job.url})...`
      );
      try {
        const rendered = await browserDriver.renderWeaponPdf(job);
        await fs.promises.writeFile(job.pdfPath, rendered.pdfBuffer);

        const validation = validatePdfBuffer(rendered.pdfBuffer, {
          minBytes: MIN_VALID_PDF_BYTES,
          expectedPages: expectedSheets,
          expectedWidthPt: dimensions.widthPt,
          expectedHeightPt: dimensions.heightPt,
        });

        const platesSummary = summarizePlateSources(rendered.plateSources);
        const warnings = [...validation.warnings];
        if (rendered.brokenImages > 0) {
          warnings.push(`${rendered.brokenImages} plate image(s) failed to decode.`);
        }

        const elapsedSec = (Date.now() - startedMs) / 1000;
        if (!validation.valid) {
          return {
            ok: false,
            weaponId: job.weaponId,
            pdfPath: job.pdfPath,
            thumbnailPath: rendered.thumbnailSaved ? job.thumbnailPath : null,
            byteLength: validation.byteLength,
            pageCount: validation.pageCount,
            mediaBoxMm: validation.mediaBoxMm,
            platesSummary,
            elapsedSec,
            warnings,
            error: validation.errors.join('; '),
          };
        }

        logInfo(
          `  [${job.weaponId}] OK: ${formatBytes(validation.byteLength)}, ${validation.pageCount} sheet(s), ${platesSummary.label} (${elapsedSec.toFixed(1)}s)`
        );
        return {
          ok: true,
          weaponId: job.weaponId,
          pdfPath: job.pdfPath,
          thumbnailPath: rendered.thumbnailSaved ? job.thumbnailPath : null,
          byteLength: validation.byteLength,
          pageCount: validation.pageCount,
          mediaBoxMm: validation.mediaBoxMm,
          platesSummary,
          elapsedSec,
          warnings,
          error: null,
        };
      } catch (err) {
        const elapsedSec = (Date.now() - startedMs) / 1000;
        const message = err instanceof Error ? err.message : String(err);
        logError(`  [${job.weaponId}] FAILED (${elapsedSec.toFixed(1)}s): ${message}`);
        return {
          ok: false,
          weaponId: job.weaponId,
          pdfPath: job.pdfPath,
          thumbnailPath: null,
          byteLength: 0,
          pageCount: 0,
          mediaBoxMm: null,
          platesSummary: summarizePlateSources(null),
          elapsedSec,
          warnings: [],
          error: message,
        };
      }
    };

    // Execute with bounded concurrency (default 1 to protect WebGL GPU memory)
    const workerCount = Math.min(options.concurrency, jobs.length);
    let cursor = 0;
    const orderedResults = new Array(jobs.length);

    const workers = Array.from({ length: workerCount }, async () => {
      for (;;) {
        const idx = cursor;
        cursor += 1;
        if (idx >= jobs.length) break;
        orderedResults[idx] = await runJob(jobs[idx], idx);
      }
    });
    await Promise.all(workers);
    results.push(...orderedResults);

    const totalElapsedSec = (Date.now() - pipelineStartMs) / 1000;
    const report = formatSummaryReport(results, {
      driver: browserDriver.driverName,
      executablePath: browserDriver.executablePath,
      dimensions,
      style: options.style,
      edition: options.edition,
      pages: options.pages,
      quality: options.quality,
      lang: options.lang,
      outDir: outDirAbs,
      totalElapsedSec,
    });
    process.stdout.write(report);

    const allOk = results.every((r) => r.ok);
    return { ok: allOk, results, dryRun: false };
  } finally {
    process.off('SIGINT', onSignal);
    process.off('SIGTERM', onSignal);
    await cleanup();
  }
}

async function main() {
  let options;
  try {
    options = parseCliArgs(process.argv.slice(2));
  } catch (err) {
    if (err instanceof CliArgumentError) {
      logError(err.message);
      process.stderr.write('\nRun `node scripts/export_dk_pdf.mjs --help` for usage.\n');
      process.exit(2);
    }
    throw err;
  }

  if (options.help) {
    process.stdout.write(formatHelpText());
    process.exit(0);
  }

  try {
    const outcome = await runExportPipeline(options, REPO_ROOT);
    process.exit(outcome.ok ? 0 : 1);
  } catch (err) {
    logError(err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

const isEntryPoint =
  process.argv[1] &&
  pathToFileURL(path.resolve(process.argv[1])).href === import.meta.url;

if (isEntryPoint) {
  main();
}

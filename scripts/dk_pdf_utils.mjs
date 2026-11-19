/**
 * Pure utilities for the Digital Armory 3D DK Visual Encyclopedia
 * 300 DPI Pre-Press PDF Batch Publishing Pipeline.
 *
 * Kept dependency-free (Node built-ins only) so both `scripts/export_dk_pdf.mjs`
 * and `tests/dkPdfExport.test.ts` can import and verify every calculation deterministically.
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export const ALL_WEAPON_IDS = Object.freeze([
  'ak15',
  'm4a1',
  'mp5',
  'g17',
  'm82a1',
  'awm',
  'scar',
  'deagle',
  'aug',
  'p320',
  'p90',
  'lift33',
  'r500',
  'python',
  'benellim4',
  'garand',
  'm249',
  'p08',
  'vector',
]);

export const VALID_STYLES = Object.freeze([
  'dk_encyclopedia',
  'pro_dossier',
  'kids_pictorial',
]);

export const VALID_EDITIONS = Object.freeze([
  'dk_encyclopedia',
  'blueprint_manual',
  'obsidian_folio',
]);

export const VALID_LAYOUTS = Object.freeze(['spread_a3', 'portrait_a4']);

export const VALID_PAGES = Object.freeze(['full_8p', 'compact_4p']);

export const VALID_QUALITIES = Object.freeze(['print_2880', 'standard_1440']);

export const VALID_LANGS = Object.freeze(['zh', 'en']);

export const VALID_DRIVERS = Object.freeze(['auto', 'playwright', 'cdp']);

export const MM_PER_INCH = 25.4;
export const POINTS_PER_INCH = 72;
export const TARGET_PRINT_DPI = 300;
export const DEFAULT_BLEED_MM = 3;
export const MIN_VALID_PDF_BYTES = 50 * 1024;
export const DEFAULT_TIMEOUT_MS = 120_000;
export const DEFAULT_OUT_DIR = 'exports/dk-monographs';

export const LAYOUT_TRIM_SPECS = Object.freeze({
  portrait_a4: Object.freeze({
    trimWidthMm: 210,
    trimHeightMm: 297,
    orientation: 'portrait',
    label: 'A4 Portrait',
  }),
  spread_a3: Object.freeze({
    trimWidthMm: 420,
    trimHeightMm: 297,
    orientation: 'landscape',
    label: 'A3 Landscape Spread',
  }),
});

export const DEFAULT_CLI_OPTIONS = Object.freeze({
  style: 'dk_encyclopedia',
  edition: 'dk_encyclopedia',
  layout: 'spread_a3',
  pages: 'full_8p',
  quality: 'print_2880',
  lang: 'zh',
  bleed: true,
  callsign: '',
  outDir: DEFAULT_OUT_DIR,
  baseUrl: null,
  thumbnails: false,
  timeoutMs: DEFAULT_TIMEOUT_MS,
  executablePath: null,
  driver: 'auto',
  concurrency: 1,
  dryRun: false,
  help: false,
});

const WEAPON_ID_SET = new Set(ALL_WEAPON_IDS);

export class CliArgumentError extends Error {
  constructor(message) {
    super(message);
    this.name = 'CliArgumentError';
  }
}

function assertEnumValue(flagName, value, allowed) {
  if (!allowed.includes(value)) {
    throw new CliArgumentError(
      `Invalid value "${value}" for ${flagName}. Expected one of: ${allowed.join(', ')}`
    );
  }
  return value;
}

function normalizeWeaponId(raw) {
  const normalized = String(raw).trim().toLowerCase();
  if (!WEAPON_ID_SET.has(normalized)) {
    throw new CliArgumentError(
      `Unknown weapon ID "${raw}". Valid IDs (${ALL_WEAPON_IDS.length}): ${ALL_WEAPON_IDS.join(', ')}`
    );
  }
  return normalized;
}

/**
 * Parse CLI arguments for `scripts/export_dk_pdf.mjs`.
 * Supports both `--flag value` and `--flag=value` forms.
 */
export function parseCliArgs(argv) {
  const args = Array.isArray(argv) ? argv : [];
  const state = {
    ...DEFAULT_CLI_OPTIONS,
    weapons: [],
    all: false,
  };

  const readNextValue = (index, flagName, inlineValue) => {
    if (inlineValue !== undefined) {
      if (inlineValue.length === 0) {
        throw new CliArgumentError(`Option ${flagName} requires a non-empty value.`);
      }
      return { value: inlineValue, nextIndex: index };
    }
    const next = args[index + 1];
    if (next === undefined || (next.startsWith('--') && next !== '--')) {
      throw new CliArgumentError(`Option ${flagName} requires a value.`);
    }
    return { value: next, nextIndex: index + 1 };
  };

  for (let i = 0; i < args.length; i += 1) {
    const token = args[i];
    if (token === '-h' || token === '--help') {
      state.help = true;
      continue;
    }

    if (!token.startsWith('--')) {
      throw new CliArgumentError(
        `Unexpected positional argument "${token}". Use --weapon <id>, --weapons a,b, or --all.`
      );
    }

    const eqIdx = token.indexOf('=');
    const flag = eqIdx >= 0 ? token.slice(0, eqIdx) : token;
    const inlineValue = eqIdx >= 0 ? token.slice(eqIdx + 1) : undefined;

    switch (flag) {
      case '--all': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError('--all does not accept a value.');
        }
        state.all = true;
        break;
      }
      case '--weapon': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.weapons.push(normalizeWeaponId(value));
        break;
      }
      case '--weapons': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        const items = value
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
        if (items.length === 0) {
          throw new CliArgumentError(
            '--weapons requires a comma-separated list of weapon IDs (e.g. --weapons p08,ak15).'
          );
        }
        for (const item of items) {
          state.weapons.push(normalizeWeaponId(item));
        }
        break;
      }
      case '--style': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.style = assertEnumValue(flag, value, VALID_STYLES);
        break;
      }
      case '--edition': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.edition = assertEnumValue(flag, value, VALID_EDITIONS);
        break;
      }
      case '--layout': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.layout = assertEnumValue(flag, value, VALID_LAYOUTS);
        break;
      }
      case '--pages': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.pages = assertEnumValue(flag, value, VALID_PAGES);
        break;
      }
      case '--quality': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.quality = assertEnumValue(flag, value, VALID_QUALITIES);
        break;
      }
      case '--lang': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.lang = assertEnumValue(flag, value, VALID_LANGS);
        break;
      }
      case '--bleed': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError(
            '--bleed is a boolean flag; use --bleed or --no-bleed.'
          );
        }
        state.bleed = true;
        break;
      }
      case '--no-bleed': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError('--no-bleed does not accept a value.');
        }
        state.bleed = false;
        break;
      }
      case '--callsign': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.callsign = value.trim();
        break;
      }
      case '--out': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.outDir = value;
        break;
      }
      case '--url': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        let parsed;
        try {
          parsed = new URL(value);
        } catch {
          throw new CliArgumentError(
            `Invalid URL "${value}" for --url. Expected http(s)://...`
          );
        }
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new CliArgumentError(
            `Unsupported protocol "${parsed.protocol}" for --url. Expected http: or https:.`
          );
        }
        state.baseUrl = value;
        break;
      }
      case '--thumbnails': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError(
            '--thumbnails is a boolean flag; use --thumbnails or --no-thumbnails.'
          );
        }
        state.thumbnails = true;
        break;
      }
      case '--no-thumbnails': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError('--no-thumbnails does not accept a value.');
        }
        state.thumbnails = false;
        break;
      }
      case '--timeout': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        const parsedMs = Number(value);
        if (!Number.isFinite(parsedMs) || !Number.isInteger(parsedMs) || parsedMs < 1000) {
          throw new CliArgumentError(
            `Invalid --timeout "${value}". Expected an integer >= 1000 (milliseconds).`
          );
        }
        state.timeoutMs = parsedMs;
        break;
      }
      case '--executable': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.executablePath = value;
        break;
      }
      case '--driver': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        state.driver = assertEnumValue(flag, value, VALID_DRIVERS);
        break;
      }
      case '--concurrency': {
        const { value, nextIndex } = readNextValue(i, flag, inlineValue);
        i = nextIndex;
        const n = Number(value);
        if (!Number.isInteger(n) || n < 1 || n > 8) {
          throw new CliArgumentError(
            `Invalid --concurrency "${value}". Expected an integer between 1 and 8.`
          );
        }
        state.concurrency = n;
        break;
      }
      case '--dry-run': {
        if (inlineValue !== undefined) {
          throw new CliArgumentError('--dry-run does not accept a value.');
        }
        state.dryRun = true;
        break;
      }
      default:
        throw new CliArgumentError(
          `Unknown option "${flag}". Run with --help to see supported options.`
        );
    }
  }

  const dedupedWeapons = state.all
    ? [...ALL_WEAPON_IDS]
    : Array.from(new Set(state.weapons));

  if (!state.help && dedupedWeapons.length === 0) {
    throw new CliArgumentError(
      'No weapons selected. Specify --weapon <id>, --weapons p08,ak15, or --all (run with --help for usage).'
    );
  }

  return {
    help: state.help,
    dryRun: state.dryRun,
    weapons: dedupedWeapons,
    style: state.style,
    edition: state.edition,
    layout: state.layout,
    pages: state.pages,
    quality: state.quality,
    lang: state.lang,
    bleed: state.bleed,
    prepress: state.bleed ? 1 : 0,
    callsign: state.callsign,
    outDir: state.outDir,
    baseUrl: state.baseUrl,
    thumbnails: state.thumbnails,
    timeoutMs: state.timeoutMs,
    executablePath: state.executablePath,
    driver: state.driver,
    concurrency: state.concurrency,
  };
}

/**
 * Compute exact physical sheet dimensions (mm, inches, PDF points, and 300 DPI pixel grid)
 * including optional ISO 3mm pre-press bleed on all 4 edges.
 *
 * Note on Chromium `landscape`: Chromium swaps `paperWidth` and `paperHeight` when
 * `landscape: true`. Because `widthInches` and `heightInches` already carry the exact
 * physical sheet orientation (420×297mm / 426×303mm for `spread_a3`, 210×297mm / 216×303mm
 * for `portrait_a4`), `cdpLandscape` is always `false` to prevent double-rotation.
 */
export function computePrepressDimensions(
  layout,
  bleed = true,
  bleedMm = DEFAULT_BLEED_MM
) {
  const trim = LAYOUT_TRIM_SPECS[layout];
  if (!trim) {
    throw new CliArgumentError(
      `Unsupported layout "${layout}". Expected one of: ${VALID_LAYOUTS.join(', ')}`
    );
  }
  if (!Number.isFinite(bleedMm) || bleedMm < 0) {
    throw new CliArgumentError(
      `Invalid bleedMm "${bleedMm}". Expected a finite number >= 0.`
    );
  }

  const effectiveBleedMm = bleed ? bleedMm : 0;
  const widthMm = trim.trimWidthMm + effectiveBleedMm * 2;
  const heightMm = trim.trimHeightMm + effectiveBleedMm * 2;
  const widthInches = widthMm / MM_PER_INCH;
  const heightInches = heightMm / MM_PER_INCH;
  const widthPt = widthInches * POINTS_PER_INCH;
  const heightPt = heightInches * POINTS_PER_INCH;
  const widthPx300Dpi = Math.round(widthInches * TARGET_PRINT_DPI);
  const heightPx300Dpi = Math.round(heightInches * TARGET_PRINT_DPI);

  return {
    layout,
    label: trim.label,
    orientation: trim.orientation,
    bleed: Boolean(bleed),
    bleedMm: effectiveBleedMm,
    trimWidthMm: trim.trimWidthMm,
    trimHeightMm: trim.trimHeightMm,
    widthMm,
    heightMm,
    widthInches,
    heightInches,
    widthPt,
    heightPt,
    widthPx300Dpi,
    heightPx300Dpi,
    cssPageSize: `${widthMm}mm ${heightMm}mm`,
    cdpLandscape: false,
    marginsInches: { top: 0, right: 0, bottom: 0, left: 0 },
    trimBoxMm: {
      left: effectiveBleedMm,
      top: effectiveBleedMm,
      right: effectiveBleedMm + trim.trimWidthMm,
      bottom: effectiveBleedMm + trim.trimHeightMm,
      width: trim.trimWidthMm,
      height: trim.trimHeightMm,
    },
  };
}

/**
 * Expected PDF sheet count for a given layout & page mode.
 * - `portrait_a4`: 8 single pages (`full_8p`) or 4 single pages (`compact_4p`)
 * - `spread_a3`: 4 double-page spreads (`full_8p`) or 2 double-page spreads (`compact_4p`)
 */
export function getExpectedSheetCount(layout, pages) {
  assertEnumValue('--layout', layout, VALID_LAYOUTS);
  assertEnumValue('--pages', pages, VALID_PAGES);
  const singlePages = pages === 'full_8p' ? 8 : 4;
  return layout === 'spread_a3' ? singlePages / 2 : singlePages;
}

/**
 * Construct the Monograph Studio deep-link URL conforming to the app contract:
 * `/?monograph=1&weapon=<id>&style=<style>&edition=<edition>&layout=<layout>&pages=<pages>&quality=<quality>&lang=<lang>&prepress=<0|1>[&callsign=<encoded>]`
 */
export function buildMonographUrl(baseUrl, options) {
  let url;
  try {
    url = new URL(baseUrl);
  } catch {
    throw new CliArgumentError(`Invalid baseUrl "${baseUrl}".`);
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new CliArgumentError(
      `Unsupported URL protocol "${url.protocol}" in "${baseUrl}".`
    );
  }

  const weapon = normalizeWeaponId(options.weapon);
  const style = assertEnumValue(
    '--style',
    options.style ?? DEFAULT_CLI_OPTIONS.style,
    VALID_STYLES
  );
  const edition = assertEnumValue(
    '--edition',
    options.edition ?? DEFAULT_CLI_OPTIONS.edition,
    VALID_EDITIONS
  );
  const layout = assertEnumValue(
    '--layout',
    options.layout ?? DEFAULT_CLI_OPTIONS.layout,
    VALID_LAYOUTS
  );
  const pages = assertEnumValue(
    '--pages',
    options.pages ?? DEFAULT_CLI_OPTIONS.pages,
    VALID_PAGES
  );
  const quality = assertEnumValue(
    '--quality',
    options.quality ?? DEFAULT_CLI_OPTIONS.quality,
    VALID_QUALITIES
  );
  const lang = assertEnumValue(
    '--lang',
    options.lang ?? DEFAULT_CLI_OPTIONS.lang,
    VALID_LANGS
  );
  const bleed = options.bleed ?? DEFAULT_CLI_OPTIONS.bleed;
  const callsign =
    typeof options.callsign === 'string' ? options.callsign.trim() : '';

  const params = new URLSearchParams();
  params.set('monograph', '1');
  params.set('weapon', weapon);
  params.set('style', style);
  params.set('edition', edition);
  params.set('layout', layout);
  params.set('pages', pages);
  params.set('quality', quality);
  params.set('lang', lang);
  params.set('prepress', bleed ? '1' : '0');
  if (callsign.length > 0) {
    params.set('callsign', callsign);
  }

  url.search = params.toString();
  url.hash = '';
  return url.toString();
}

/**
 * Compute deterministic, collision-free output paths for a weapon's PDF and optional PNG thumbnail.
 */
export function buildOutputPaths(outDir, weaponId, options = {}) {
  const weapon = normalizeWeaponId(weaponId);
  const style = assertEnumValue(
    '--style',
    options.style ?? DEFAULT_CLI_OPTIONS.style,
    VALID_STYLES
  );
  const edition = assertEnumValue(
    '--edition',
    options.edition ?? DEFAULT_CLI_OPTIONS.edition,
    VALID_EDITIONS
  );
  const layout = assertEnumValue(
    '--layout',
    options.layout ?? DEFAULT_CLI_OPTIONS.layout,
    VALID_LAYOUTS
  );
  const pages = assertEnumValue(
    '--pages',
    options.pages ?? DEFAULT_CLI_OPTIONS.pages,
    VALID_PAGES
  );
  const lang = assertEnumValue(
    '--lang',
    options.lang ?? DEFAULT_CLI_OPTIONS.lang,
    VALID_LANGS
  );
  const bleed = options.bleed ?? DEFAULT_CLI_OPTIONS.bleed;
  const bleedTag = bleed ? 'bleed3mm' : 'trim';

  const stem = `dk-${weapon}-${style}-${edition}-${layout}-${pages}-${lang}-${bleedTag}`;
  const dir = outDir || DEFAULT_OUT_DIR;
  return {
    dir,
    stem,
    pdfPath: path.join(dir, `${stem}.pdf`),
    thumbnailPath: path.join(dir, `${stem}.thumb.png`),
  };
}

function parsePlaywrightRevision(dirName, prefix) {
  if (!dirName.startsWith(prefix)) return -1;
  const suffix = dirName.slice(prefix.length);
  const num = Number.parseInt(suffix, 10);
  return Number.isFinite(num) ? num : -1;
}

function getPlaywrightBinarySubpaths(platform, isHeadlessShell) {
  if (isHeadlessShell) {
    if (platform === 'darwin') {
      return [
        'chrome-headless-shell-mac-arm64/chrome-headless-shell',
        'chrome-headless-shell-mac-x64/chrome-headless-shell',
        'chrome-mac/headless_shell',
      ];
    }
    if (platform === 'win32') {
      return [
        'chrome-headless-shell-win64/chrome-headless-shell.exe',
        'chrome-headless-shell-win32/chrome-headless-shell.exe',
        'chrome-win/headless_shell.exe',
      ];
    }
    return [
      'chrome-headless-shell-linux64/chrome-headless-shell',
      'chrome-linux/headless_shell',
    ];
  }

  if (platform === 'darwin') {
    return [
      'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-x64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
      'chrome-mac-arm64/Chromium.app/Contents/MacOS/Chromium',
      'chrome-mac/Chromium.app/Contents/MacOS/Chromium',
    ];
  }
  if (platform === 'win32') {
    return [
      'chrome-win64/chrome.exe',
      'chrome-win/chrome.exe',
    ];
  }
  return ['chrome-linux/chrome', 'chrome-linux64/chrome'];
}

function getSystemBrowserCandidates(platform) {
  if (platform === 'darwin') {
    return [
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Google Chrome Canary.app/Contents/MacOS/Google Chrome Canary',
      '/Applications/Chromium.app/Contents/MacOS/Chromium',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    ];
  }
  if (platform === 'win32') {
    return [
      'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
      'C:\\Program Files\\Chromium\\Application\\chrome.exe',
      'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    ];
  }
  return [
    '/usr/bin/google-chrome',
    '/usr/bin/google-chrome-stable',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    '/snap/bin/chromium',
  ];
}

function getPlaywrightCacheRoots(platform, homeDir, env) {
  const roots = [];
  if (env.PLAYWRIGHT_BROWSERS_PATH && env.PLAYWRIGHT_BROWSERS_PATH !== '0') {
    roots.push(env.PLAYWRIGHT_BROWSERS_PATH);
  }
  if (platform === 'darwin') {
    roots.push(path.join(homeDir, 'Library', 'Caches', 'ms-playwright'));
  } else if (platform === 'win32') {
    const localAppData =
      env.LOCALAPPDATA || path.join(homeDir, 'AppData', 'Local');
    roots.push(path.join(localAppData, 'ms-playwright'));
  } else {
    roots.push(path.join(homeDir, '.cache', 'ms-playwright'));
  }
  return Array.from(new Set(roots));
}

function looksLikeHeadlessShell(executablePath) {
  const lower = String(executablePath).toLowerCase();
  return (
    lower.includes('headless_shell') || lower.includes('headless-shell')
  );
}

/**
 * Locate the best available Chromium / Chrome executable for headless WebGL + printToPDF.
 *
 * Priority order:
 * 1. Explicit `--executable <path>`
 * 2. Environment variables (`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, `CHROMIUM_PATH`, `CHROME_PATH`, `PUPPETEER_EXECUTABLE_PATH`)
 * 3. Playwright cached full `chromium-<rev>` (highest revision first)
 * 4. System Chrome / Chromium / Edge
 * 5. Playwright cached `chromium_headless_shell-<rev>` (highest revision first)
 */
export function discoverChromiumExecutable(options = {}) {
  const {
    explicitPath = null,
    env = process.env,
    homeDir = os.homedir(),
    platform = process.platform,
    existsSync = fs.existsSync,
    readdirSync = fs.readdirSync,
  } = options;

  if (explicitPath) {
    if (existsSync(explicitPath)) {
      return {
        executablePath: explicitPath,
        source: 'cli-flag',
        isHeadlessShell: looksLikeHeadlessShell(explicitPath),
      };
    }
    return null;
  }

  const envVars = [
    'PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH',
    'CHROMIUM_PATH',
    'CHROME_PATH',
    'PUPPETEER_EXECUTABLE_PATH',
  ];
  for (const key of envVars) {
    const candidate = env[key];
    if (candidate && existsSync(candidate)) {
      return {
        executablePath: candidate,
        source: `env:${key}`,
        isHeadlessShell: looksLikeHeadlessShell(candidate),
      };
    }
  }

  const cacheRoots = getPlaywrightCacheRoots(platform, homeDir, env);
  const scanPlaywrightCache = (prefix, isHeadlessShell) => {
    const subpaths = getPlaywrightBinarySubpaths(platform, isHeadlessShell);
    for (const cacheRoot of cacheRoots) {
      if (!existsSync(cacheRoot)) continue;
      let entries;
      try {
        entries = readdirSync(cacheRoot);
      } catch {
        continue;
      }
      const matching = entries
        .map((name) => ({
          name,
          rev: parsePlaywrightRevision(name, prefix),
        }))
        .filter((item) => item.rev >= 0)
        .sort((a, b) => b.rev - a.rev);

      for (const item of matching) {
        for (const rel of subpaths) {
          const candidate = path.join(cacheRoot, item.name, rel);
          if (existsSync(candidate)) {
            return {
              executablePath: candidate,
              source: `playwright-cache:${item.name}`,
              isHeadlessShell,
            };
          }
        }
      }
    }
    return null;
  };

  // Prefer full Chromium (supports full ANGLE/Metal WebGL + --headless=new)
  const fullChromium = scanPlaywrightCache('chromium-', false);
  if (fullChromium) {
    return fullChromium;
  }

  // Next prefer system Chrome/Chromium (full browser binary)
  for (const candidate of getSystemBrowserCandidates(platform)) {
    if (existsSync(candidate)) {
      return {
        executablePath: candidate,
        source: 'system-browser',
        isHeadlessShell: false,
      };
    }
  }

  // Fallback to Playwright headless shell if present
  const headlessShell = scanPlaywrightCache('chromium_headless_shell-', true);
  if (headlessShell) {
    return headlessShell;
  }

  return null;
}

/**
 * Build Chromium launch flags tuned for WebGL 2.0 + 300 DPI print fidelity.
 */
export function buildChromiumLaunchArgs(options = {}) {
  const {
    platform = process.platform,
    mode = 'cdp',
    isHeadlessShell = false,
    userDataDir = null,
    viewportWidth = 1920,
    viewportHeight = 1200,
    deviceScaleFactor = 2,
  } = options;

  const args = [
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-background-timer-throttling',
    '--disable-backgrounding-occluded-windows',
    '--disable-renderer-backgrounding',
    '--disable-dev-shm-usage',
    '--disable-extensions',
    '--font-render-hinting=none',
    '--enable-webgl',
    '--ignore-gpu-blocklist',
    '--enable-unsafe-swiftshader',
    `--window-size=${viewportWidth},${viewportHeight}`,
    `--force-device-scale-factor=${deviceScaleFactor}`,
  ];

  if (platform === 'darwin') {
    args.push('--use-gl=angle', '--use-angle=metal');
  } else if (platform === 'linux') {
    args.push('--no-sandbox', '--use-gl=angle');
  }

  if (mode === 'cdp') {
    if (!isHeadlessShell) {
      args.push('--headless=new');
    }
    args.push(
      '--remote-debugging-port=0',
      '--remote-debugging-address=127.0.0.1'
    );
    if (userDataDir) {
      args.push(`--user-data-dir=${userDataDir}`);
    }
  }

  return args;
}

/**
 * Validate a generated PDF binary buffer for structural & pre-press integrity.
 * Checks `%PDF-` header, `%%EOF` trailer, minimum byte size (> 50 KB by default),
 * page count via `/Type /Page` (excluding `/Type /Pages`), and `/MediaBox` dimensions.
 */
export function validatePdfBuffer(input, options = {}) {
  const {
    minBytes = MIN_VALID_PDF_BYTES,
    expectedPages = null,
    expectedWidthPt = null,
    expectedHeightPt = null,
    mediaBoxTolerancePt = 3.0,
    strictPageCount = false,
  } = options;

  const errors = [];
  const warnings = [];

  if (!(input instanceof Uint8Array)) {
    return {
      valid: false,
      errors: ['PDF payload is not a Buffer or Uint8Array.'],
      warnings,
      pdfVersion: null,
      byteLength: 0,
      hasPdfHeader: false,
      hasEofTrailer: false,
      pageCount: 0,
      mediaBoxPt: null,
      mediaBoxMm: null,
    };
  }

  const buf = Buffer.isBuffer(input)
    ? input
    : Buffer.from(input.buffer, input.byteOffset, input.byteLength);
  const byteLength = buf.byteLength;

  if (byteLength === 0) {
    errors.push('PDF file is empty (0 bytes).');
  }

  const headStr = buf.subarray(0, Math.min(32, byteLength)).toString('latin1');
  const headerMatch = /^%PDF-(\d+\.\d+)/.exec(headStr);
  const hasPdfHeader = Boolean(headerMatch);
  const pdfVersion = headerMatch ? headerMatch[1] : null;
  if (!hasPdfHeader) {
    errors.push('Missing "%PDF-" header magic bytes.');
  }

  const tailStart = Math.max(0, byteLength - 2048);
  const tailStr = buf.subarray(tailStart, byteLength).toString('latin1');
  const hasEofTrailer = /%%EOF[\r\n\s]*$/.test(tailStr) || tailStr.includes('%%EOF');
  if (!hasEofTrailer) {
    errors.push('Missing "%%EOF" trailer marker.');
  }

  if (byteLength < minBytes) {
    errors.push(
      `PDF file size (${formatBytes(byteLength)}) is below minimum threshold (${formatBytes(minBytes)}).`
    );
  }

  const fullLatin1 = buf.toString('latin1');
  const pageMatches = fullLatin1.match(/\/Type\s*\/Page\b(?!s)/g);
  let pageCount = pageMatches ? pageMatches.length : 0;

  if (pageCount === 0) {
    // Fallback for PDFs using compressed object streams where /Pages catalog carries /Count N
    const pagesCatalogMatch =
      /\/Type\s*\/Pages\b[\s\S]{0,200}?\/Count\s+(\d+)/.exec(fullLatin1) ||
      /\/Count\s+(\d+)[\s\S]{0,200}?\/Type\s*\/Pages\b/.exec(fullLatin1);
    if (pagesCatalogMatch) {
      pageCount = Number.parseInt(pagesCatalogMatch[1], 10) || 0;
    }
  }

  if (pageCount < 1) {
    errors.push('Could not detect any pages ("/Type /Page") in generated PDF.');
  } else if (expectedPages !== null && pageCount !== expectedPages) {
    const msg = `Page count mismatch: detected ${pageCount} sheet(s), expected ${expectedPages}.`;
    if (strictPageCount) {
      errors.push(msg);
    } else {
      warnings.push(msg);
    }
  }

  let mediaBoxPt = null;
  let mediaBoxMm = null;
  const mediaBoxMatch =
    /\/MediaBox\s*\[\s*(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s+(-?\d+(?:\.\d+)?)\s*\]/.exec(
      fullLatin1
    );
  if (mediaBoxMatch) {
    const x0 = Number(mediaBoxMatch[1]);
    const y0 = Number(mediaBoxMatch[2]);
    const x1 = Number(mediaBoxMatch[3]);
    const y1 = Number(mediaBoxMatch[4]);
    const width = Math.abs(x1 - x0);
    const height = Math.abs(y1 - y0);
    if (Number.isFinite(width) && Number.isFinite(height) && width > 0 && height > 0) {
      mediaBoxPt = {
        width: Number(width.toFixed(2)),
        height: Number(height.toFixed(2)),
      };
      mediaBoxMm = {
        width: Number(((width / POINTS_PER_INCH) * MM_PER_INCH).toFixed(1)),
        height: Number(((height / POINTS_PER_INCH) * MM_PER_INCH).toFixed(1)),
      };

      if (
        expectedWidthPt !== null &&
        expectedHeightPt !== null &&
        (Math.abs(width - expectedWidthPt) > mediaBoxTolerancePt ||
          Math.abs(height - expectedHeightPt) > mediaBoxTolerancePt)
      ) {
        const expWmm = ((expectedWidthPt / POINTS_PER_INCH) * MM_PER_INCH).toFixed(1);
        const expHmm = ((expectedHeightPt / POINTS_PER_INCH) * MM_PER_INCH).toFixed(1);
        warnings.push(
          `MediaBox ${mediaBoxMm.width}×${mediaBoxMm.height}mm differs from requested ${expWmm}×${expHmm}mm.`
        );
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
    pdfVersion,
    byteLength,
    hasPdfHeader,
    hasEofTrailer,
    pageCount,
    mediaBoxPt,
    mediaBoxMm,
  };
}

/**
 * Summarize Cycles 4K vs WebGL 2880/1440 plate sources from the app's readiness metadata.
 */
export function summarizePlateSources(plateSources) {
  const counts = {
    total: 0,
    cycles4k: 0,
    webgl2880: 0,
    webgl1440: 0,
    other: 0,
  };

  if (plateSources && typeof plateSources === 'object') {
    for (const source of Object.values(plateSources)) {
      if (typeof source !== 'string') continue;
      counts.total += 1;
      if (source === 'cycles_4k') {
        counts.cycles4k += 1;
      } else if (source === 'webgl_2880') {
        counts.webgl2880 += 1;
      } else if (source === 'webgl_1440') {
        counts.webgl1440 += 1;
      } else {
        counts.other += 1;
      }
    }
  }

  const parts = [];
  if (counts.cycles4k > 0) parts.push(`${counts.cycles4k} Cycles 4K`);
  if (counts.webgl2880 > 0) parts.push(`${counts.webgl2880} WebGL 2880`);
  if (counts.webgl1440 > 0) parts.push(`${counts.webgl1440} WebGL 1440`);
  if (counts.other > 0) parts.push(`${counts.other} Other`);

  return {
    ...counts,
    label: parts.length > 0 ? parts.join(' + ') : 'n/a',
  };
}

export function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes < 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${kb.toFixed(1)} KB`;
  const mb = kb / 1024;
  return `${mb.toFixed(2)} MB`;
}

export function stripAnsi(text) {
  // eslint-disable-next-line no-control-regex
  return String(text).replace(/\u001B\[[0-?]*[ -/]*[@-~]/g, '');
}

/**
 * Extract a local HTTP(S) URL printed by `vite` / `vite preview` stdout.
 */
export function parseViteServerUrl(stdoutChunk) {
  const clean = stripAnsi(stdoutChunk);
  const localMatch = /Local:\s*(https?:\/\/[^\s]+)/i.exec(clean);
  if (localMatch) {
    return localMatch[1].replace(/\/+$/, '') + '/';
  }
  const fallbackMatch = /(https?:\/\/(?:127\.0\.0\.1|localhost):\d+\/?)/i.exec(clean);
  if (fallbackMatch) {
    return fallbackMatch[1].replace(/\/+$/, '') + '/';
  }
  return null;
}

/**
 * Render a clean tabular pre-press export summary report for terminal logs.
 */
export function formatSummaryReport(results, meta = {}) {
  const lines = [];
  const dims = meta.dimensions;
  const headerDim = dims
    ? `${dims.layout} (${dims.widthMm}×${dims.heightMm}mm${dims.bleed ? `, +${dims.bleedMm}mm bleed` : ', trim only'})`
    : meta.layout || 'unknown';

  lines.push('');
  lines.push('=========================================================================================================');
  lines.push(' Digital Armory 3D — DK Visual Encyclopedia 300 DPI Pre-Press PDF Publishing Report');
  lines.push('=========================================================================================================');
  if (meta.driver) {
    lines.push(` Driver      : ${meta.driver}${meta.executablePath ? ` (${meta.executablePath})` : ''}`);
  }
  lines.push(` Format      : ${headerDim}`);
  if (meta.style || meta.edition || meta.lang) {
    lines.push(
      ` Edition     : style=${meta.style ?? '-'} | edition=${meta.edition ?? '-'} | pages=${meta.pages ?? '-'} | quality=${meta.quality ?? '-'} | lang=${meta.lang ?? '-'}`
    );
  }
  if (meta.outDir) {
    lines.push(` Output Dir  : ${meta.outDir}`);
  }
  lines.push('---------------------------------------------------------------------------------------------------------');
  lines.push(
    ' Weapon     | Status | Pages | Size      | Time   | Plates Breakdown                | Output File'
  );
  lines.push('---------------------------------------------------------------------------------------------------------');

  let passed = 0;
  let failed = 0;
  let totalBytes = 0;

  for (const r of results) {
    if (r.ok) {
      passed += 1;
      totalBytes += r.byteLength || 0;
    } else {
      failed += 1;
    }
    const weaponCol = String(r.weaponId).padEnd(10);
    const statusCol = (r.ok ? 'OK' : 'FAIL').padEnd(6);
    const pagesCol = String(r.pageCount ?? '-').padStart(5);
    const sizeCol = (r.byteLength ? formatBytes(r.byteLength) : '-').padStart(9);
    const timeCol = (
      Number.isFinite(r.elapsedSec) ? `${r.elapsedSec.toFixed(1)}s` : '-'
    ).padStart(6);
    const platesCol = String(r.platesSummary?.label ?? 'n/a').slice(0, 31).padEnd(31);
    const fileCol = r.pdfPath ? path.basename(r.pdfPath) : r.error || '-';
    lines.push(
      ` ${weaponCol} | ${statusCol} | ${pagesCol} | ${sizeCol} | ${timeCol} | ${platesCol} | ${fileCol}`
    );
    if (r.thumbnailPath && r.ok) {
      lines.push(`              └─ thumbnail: ${path.basename(r.thumbnailPath)}`);
    }
    if (r.warnings && r.warnings.length > 0) {
      for (const w of r.warnings) {
        lines.push(`              └─ warn: ${w}`);
      }
    }
    if (!r.ok && r.error) {
      lines.push(`              └─ error: ${r.error}`);
    }
  }

  lines.push('---------------------------------------------------------------------------------------------------------');
  const elapsedLabel = Number.isFinite(meta.totalElapsedSec)
    ? `${meta.totalElapsedSec.toFixed(1)}s`
    : '-';
  lines.push(
    ` Summary     : ${passed}/${results.length} succeeded, ${failed} failed | Total PDF size: ${formatBytes(totalBytes)} | Total time: ${elapsedLabel}`
  );
  lines.push('=========================================================================================================');
  lines.push('');

  return lines.join('\n');
}

export function formatHelpText() {
  return `Digital Armory 3D — Offline 300 DPI Pre-Press PDF Batch Publisher (DK Visual Encyclopedia)

Usage:
  node scripts/export_dk_pdf.mjs [options]

Weapon Selection (required unless --help):
  --weapon <id>             Export a single exhibit (repeatable; e.g. --weapon p08)
  --weapons <id1,id2,...>   Export a comma-separated list (e.g. --weapons p08,ak15)
  --all                     Export all ${ALL_WEAPON_IDS.length} exhibits in the museum vault

Publishing & Pre-Press Options:
  --style <mode>            ${VALID_STYLES.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.style})
  --edition <theme>         ${VALID_EDITIONS.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.edition})
  --layout <format>         ${VALID_LAYOUTS.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.layout})
                              spread_a3   = 420×297mm trim (426×303mm w/ 3mm bleed)
                              portrait_a4 = 210×297mm trim (216×303mm w/ 3mm bleed)
  --pages <count>           ${VALID_PAGES.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.pages})
  --quality <res>           ${VALID_QUALITIES.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.quality})
  --lang <locale>           ${VALID_LANGS.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.lang})
  --bleed / --no-bleed      Include 3mm ISO pre-press bleed + crop marks (default: --bleed)
  --callsign <text>         Optional collector callsign printed on the monograph cover

Output & Runtime Options:
  --out <dir>               Output directory (default: ${DEFAULT_OUT_DIR})
  --url <baseUrl>           Target app URL (if omitted, auto-starts local Vite preview/dev server)
  --thumbnails              Also save PNG preview renders of Page 1 / Spread 1 alongside each PDF
  --timeout <ms>            Per-exhibit readiness timeout in ms (default: ${DEFAULT_TIMEOUT_MS})
  --driver <mode>           ${VALID_DRIVERS.join(' | ')} (default: ${DEFAULT_CLI_OPTIONS.driver})
                              auto uses Playwright if installed, else zero-dep Node 22 WebSocket CDP
  --executable <path>       Explicit Chromium / Google Chrome executable path
  --concurrency <1..8>      Parallel browser tabs (default: 1 for deterministic WebGL GPU fidelity)
  --dry-run                 Print resolved deep-link URLs, page math, and detected browser then exit
  -h, --help                Show this help message

Supported Weapon IDs (${ALL_WEAPON_IDS.length}):
  ${ALL_WEAPON_IDS.join(', ')}

Examples:
  node scripts/export_dk_pdf.mjs --weapon p08 --thumbnails
  node scripts/export_dk_pdf.mjs --weapons p08,ak15 --layout spread_a3 --lang en --bleed
  node scripts/export_dk_pdf.mjs --all --layout portrait_a4 --no-bleed --out exports/a4-trim
`;
}

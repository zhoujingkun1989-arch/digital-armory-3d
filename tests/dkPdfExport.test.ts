import { describe, expect, it } from 'vitest';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';

interface PrepressDimensions {
  layout: 'spread_a3' | 'portrait_a4';
  label: string;
  orientation: 'landscape' | 'portrait';
  bleed: boolean;
  bleedMm: number;
  trimWidthMm: number;
  trimHeightMm: number;
  widthMm: number;
  heightMm: number;
  widthInches: number;
  heightInches: number;
  widthPt: number;
  heightPt: number;
  widthPx300Dpi: number;
  heightPx300Dpi: number;
  cssPageSize: string;
  cdpLandscape: boolean;
  marginsInches: { top: number; right: number; bottom: number; left: number };
  trimBoxMm: {
    left: number;
    top: number;
    right: number;
    bottom: number;
    width: number;
    height: number;
  };
}

interface ParsedCliOptions {
  help: boolean;
  dryRun: boolean;
  weapons: string[];
  style: 'dk_encyclopedia' | 'pro_dossier' | 'kids_pictorial';
  edition: 'dk_encyclopedia' | 'blueprint_manual' | 'obsidian_folio';
  layout: 'spread_a3' | 'portrait_a4';
  pages: 'full_8p' | 'compact_4p';
  quality: 'print_2880' | 'standard_1440';
  lang: 'zh' | 'en';
  bleed: boolean;
  prepress: 0 | 1;
  callsign: string;
  outDir: string;
  baseUrl: string | null;
  thumbnails: boolean;
  timeoutMs: number;
  executablePath: string | null;
  driver: 'auto' | 'playwright' | 'cdp';
  concurrency: number;
}

interface DiscoveredChromium {
  executablePath: string;
  source: string;
  isHeadlessShell: boolean;
}

interface PdfValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
  pdfVersion: string | null;
  byteLength: number;
  hasPdfHeader: boolean;
  hasEofTrailer: boolean;
  pageCount: number;
  mediaBoxPt: { width: number; height: number } | null;
  mediaBoxMm: { width: number; height: number } | null;
}

interface PlateSourceSummary {
  total: number;
  cycles4k: number;
  webgl2880: number;
  webgl1440: number;
  other: number;
  label: string;
}

interface DkPdfUtilsModule {
  ALL_WEAPON_IDS: readonly string[];
  MM_PER_INCH: number;
  POINTS_PER_INCH: number;
  DEFAULT_BLEED_MM: number;
  MIN_VALID_PDF_BYTES: number;
  CliArgumentError: new (message: string) => Error;
  parseCliArgs: (argv: string[]) => ParsedCliOptions;
  computePrepressDimensions: (
    layout: string,
    bleed?: boolean,
    bleedMm?: number
  ) => PrepressDimensions;
  getExpectedSheetCount: (layout: string, pages: string) => number;
  buildMonographUrl: (
    baseUrl: string,
    options: Partial<{
      weapon: string;
      style: string;
      edition: string;
      layout: string;
      pages: string;
      quality: string;
      lang: string;
      bleed: boolean;
      callsign: string;
    }>
  ) => string;
  buildOutputPaths: (
    outDir: string,
    weaponId: string,
    options?: Partial<{
      style: string;
      edition: string;
      layout: string;
      pages: string;
      lang: string;
      bleed: boolean;
    }>
  ) => {
    dir: string;
    stem: string;
    pdfPath: string;
    thumbnailPath: string;
  };
  discoverChromiumExecutable: (options?: {
    explicitPath?: string | null;
    env?: Record<string, string | undefined>;
    homeDir?: string;
    platform?: string;
    existsSync?: (p: string) => boolean;
    readdirSync?: (p: string) => string[];
  }) => DiscoveredChromium | null;
  buildChromiumLaunchArgs: (options?: {
    platform?: string;
    mode?: 'cdp' | 'playwright';
    isHeadlessShell?: boolean;
    userDataDir?: string | null;
    viewportWidth?: number;
    viewportHeight?: number;
    deviceScaleFactor?: number;
  }) => string[];
  validatePdfBuffer: (
    input: Uint8Array,
    options?: {
      minBytes?: number;
      expectedPages?: number | null;
      expectedWidthPt?: number | null;
      expectedHeightPt?: number | null;
      mediaBoxTolerancePt?: number;
      strictPageCount?: boolean;
    }
  ) => PdfValidationResult;
  summarizePlateSources: (
    plateSources: Record<string, string> | null | undefined
  ) => PlateSourceSummary;
  formatBytes: (bytes: number) => string;
  parseViteServerUrl: (stdoutChunk: string) => string | null;
  formatSummaryReport: (
    results: Array<{
      ok: boolean;
      weaponId: string;
      pdfPath: string | null;
      thumbnailPath: string | null;
      byteLength: number;
      pageCount: number;
      platesSummary?: PlateSourceSummary;
      elapsedSec: number;
      warnings?: string[];
      error?: string | null;
    }>,
    meta?: {
      driver?: string;
      executablePath?: string;
      dimensions?: PrepressDimensions;
      style?: string;
      edition?: string;
      pages?: string;
      quality?: string;
      lang?: string;
      outDir?: string;
      totalElapsedSec?: number;
    }
  ) => string;
  formatHelpText: () => string;
}

const utilsModuleUrl = new URL('../scripts/dk_pdf_utils.mjs', import.meta.url)
  .href;
const utils = (await import(utilsModuleUrl)) as DkPdfUtilsModule;

function buildSyntheticPdf(
  options: {
    pageCount?: number;
    widthPt?: number;
    heightPt?: number;
    padBytes?: number;
    includeHeader?: boolean;
    includeEof?: boolean;
    useCompressedPagesFallback?: boolean;
  } = {}
): Buffer {
  const {
    pageCount = 4,
    widthPt = 1207.56,
    heightPt = 858.9,
    padBytes = 60 * 1024,
    includeHeader = true,
    includeEof = true,
    useCompressedPagesFallback = false,
  } = options;

  const chunks: string[] = [];
  if (includeHeader) {
    chunks.push('%PDF-1.4\n%\xE2\xE3\xCF\xD3\n');
  }
  chunks.push('1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n');
  chunks.push(
    `2 0 obj\n<< /Type /Pages /Count ${pageCount} /Kids [3 0 R] >>\nendobj\n`
  );
  if (!useCompressedPagesFallback) {
    for (let i = 0; i < pageCount; i += 1) {
      chunks.push(
        `${3 + i} 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] >>\nendobj\n`
      );
    }
  } else {
    chunks.push(
      `3 0 obj\n<< /MediaBox [0 0 ${widthPt.toFixed(2)} ${heightPt.toFixed(2)}] >>\nendobj\n`
    );
  }
  if (padBytes > 0) {
    chunks.push(`%${'A'.repeat(padBytes)}\n`);
  }
  if (includeEof) {
    chunks.push('%%EOF\n');
  }
  return Buffer.from(chunks.join(''), 'latin1');
}

describe('DK Pre-Press PDF Batch Pipeline utilities', () => {
  describe('weapon registry parity', () => {
    it('covers all 34 exhibits from WEAPON_MANIFESTS in exact parity', () => {
      const manifestIds = WEAPON_MANIFESTS.map((m) => m.id).sort();
      const cliIds = [...utils.ALL_WEAPON_IDS].sort();
      expect(utils.ALL_WEAPON_IDS).toHaveLength(34);
      expect(cliIds).toEqual(manifestIds);
    });
  });

  describe('CLI argument parsing', () => {
    it('parses single --weapon with DK 300 DPI pre-press defaults', () => {
      const parsed = utils.parseCliArgs(['--weapon', 'p08']);
      expect(parsed).toMatchObject({
        help: false,
        dryRun: false,
        weapons: ['p08'],
        style: 'dk_encyclopedia',
        edition: 'dk_encyclopedia',
        layout: 'spread_a3',
        pages: 'full_8p',
        quality: 'print_2880',
        lang: 'zh',
        bleed: true,
        prepress: 1,
        callsign: '',
        outDir: 'exports/dk-monographs',
        baseUrl: null,
        thumbnails: false,
        driver: 'auto',
        concurrency: 1,
      });
    });

    it('parses --weapons comma list, normalizes case, and deduplicates preserving order', () => {
      const parsed = utils.parseCliArgs([
        '--weapons',
        'P08, ak15, p08',
        '--weapon',
        'VECTOR',
      ]);
      expect(parsed.weapons).toEqual(['p08', 'ak15', 'vector']);
    });

    it('expands --all to all 29 exhibits', () => {
      const parsed = utils.parseCliArgs([
        '--all',
        '--no-bleed',
        '--lang',
        'en',
      ]);
      expect(parsed.weapons).toHaveLength(34);
      expect(parsed.weapons).toContain('p08');
      expect(parsed.weapons).toContain('m249');
      expect(parsed.weapons).toContain('vector');
      expect(parsed.weapons).toContain('g11');
      expect(parsed.weapons).toContain('vss');
      expect(parsed.weapons).toContain('m134');
      expect(parsed.weapons).toContain('an94');
      expect(parsed.weapons).toContain('ztz99a');
      expect(parsed.weapons).toContain('m1a2');
      expect(parsed.weapons).toContain('leopard2a7');
      expect(parsed.weapons).toContain('tiger1');
      expect(parsed.bleed).toBe(false);
      expect(parsed.prepress).toBe(0);
      expect(parsed.lang).toBe('en');
    });

    it('supports inline --flag=value syntax across all publishing options', () => {
      const parsed = utils.parseCliArgs([
        '--weapon=m4a1',
        '--style=pro_dossier',
        '--edition=obsidian_folio',
        '--layout=portrait_a4',
        '--pages=compact_4p',
        '--quality=standard_1440',
        '--lang=en',
        '--no-bleed',
        '--bleed',
        '--callsign=ARMORER-07',
        '--out=tmp/prepress',
        '--url=http://127.0.0.1:4173/digital-armory-3d/',
        '--thumbnails',
        '--timeout=45000',
        '--driver=cdp',
        '--concurrency=2',
        '--executable=/custom/chrome',
        '--dry-run',
      ]);
      expect(parsed).toMatchObject({
        weapons: ['m4a1'],
        style: 'pro_dossier',
        edition: 'obsidian_folio',
        layout: 'portrait_a4',
        pages: 'compact_4p',
        quality: 'standard_1440',
        lang: 'en',
        bleed: true,
        prepress: 1,
        callsign: 'ARMORER-07',
        outDir: 'tmp/prepress',
        baseUrl: 'http://127.0.0.1:4173/digital-armory-3d/',
        thumbnails: true,
        timeoutMs: 45000,
        driver: 'cdp',
        concurrency: 2,
        executablePath: '/custom/chrome',
        dryRun: true,
      });
    });

    it('allows --help / -h without weapon selection and renders full help text', () => {
      expect(utils.parseCliArgs(['--help']).help).toBe(true);
      expect(utils.parseCliArgs(['-h']).help).toBe(true);
      const help = utils.formatHelpText();
      expect(help).toContain('--weapon');
      expect(help).toContain('--weapons');
      expect(help).toContain('--all');
      expect(help).toContain('--bleed');
      expect(help).toContain('--thumbnails');
      expect(help).toContain('spread_a3');
      expect(help).toContain('portrait_a4');
    });

    it('rejects missing weapon selection, unknown weapons, invalid enums, and unknown flags', () => {
      expect(() => utils.parseCliArgs([])).toThrow(utils.CliArgumentError);
      expect(() => utils.parseCliArgs(['--weapon', 'railgun9000'])).toThrow(
        utils.CliArgumentError
      );
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--layout', 'letter'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--style', 'magazine'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--edition', 'gold'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--pages', '16p'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--quality', '720p'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--lang', 'de'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--url', 'ftp://example.com'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--timeout', '500'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--concurrency', '12'])
      ).toThrow(utils.CliArgumentError);
      expect(() =>
        utils.parseCliArgs(['--weapon', 'p08', '--bogus-flag'])
      ).toThrow(utils.CliArgumentError);
      expect(() => utils.parseCliArgs(['p08'])).toThrow(utils.CliArgumentError);
    });
  });

  describe('pre-press page dimension & 3mm bleed conversions', () => {
    it('computes exact A4 portrait dimensions with and without 3mm bleed', () => {
      const trim = utils.computePrepressDimensions('portrait_a4', false);
      expect(trim.widthMm).toBe(210);
      expect(trim.heightMm).toBe(297);
      expect(trim.bleedMm).toBe(0);
      expect(trim.widthInches).toBeCloseTo(210 / 25.4, 6);
      expect(trim.heightInches).toBeCloseTo(297 / 25.4, 6);
      expect(trim.widthPx300Dpi).toBe(2480);
      expect(trim.heightPx300Dpi).toBe(3508);
      expect(trim.orientation).toBe('portrait');
      expect(trim.cdpLandscape).toBe(false);
      expect(trim.marginsInches).toEqual({
        top: 0,
        right: 0,
        bottom: 0,
        left: 0,
      });

      const bleed = utils.computePrepressDimensions('portrait_a4', true);
      expect(bleed.widthMm).toBe(216);
      expect(bleed.heightMm).toBe(303);
      expect(bleed.bleedMm).toBe(3);
      expect(bleed.widthInches).toBeCloseTo(216 / 25.4, 6);
      expect(bleed.heightInches).toBeCloseTo(303 / 25.4, 6);
      expect(bleed.widthPx300Dpi).toBe(2551);
      expect(bleed.heightPx300Dpi).toBe(3579);
      expect(bleed.trimBoxMm).toEqual({
        left: 3,
        top: 3,
        right: 213,
        bottom: 300,
        width: 210,
        height: 297,
      });
    });

    it('computes exact A3 landscape spread dimensions with and without 3mm bleed', () => {
      const trim = utils.computePrepressDimensions('spread_a3', false);
      expect(trim.widthMm).toBe(420);
      expect(trim.heightMm).toBe(297);
      expect(trim.widthInches).toBeCloseTo(420 / 25.4, 6);
      expect(trim.heightInches).toBeCloseTo(297 / 25.4, 6);
      expect(trim.widthPx300Dpi).toBe(4961);
      expect(trim.heightPx300Dpi).toBe(3508);
      expect(trim.orientation).toBe('landscape');
      // Must remain false so Chromium never swaps already-landscape paperWidth & paperHeight
      expect(trim.cdpLandscape).toBe(false);

      const bleed = utils.computePrepressDimensions('spread_a3', true);
      expect(bleed.widthMm).toBe(426);
      expect(bleed.heightMm).toBe(303);
      expect(bleed.bleedMm).toBe(3);
      expect(bleed.widthInches).toBeCloseTo(426 / 25.4, 6);
      expect(bleed.heightInches).toBeCloseTo(303 / 25.4, 6);
      expect(bleed.widthPt).toBeCloseTo((426 / 25.4) * 72, 4);
      expect(bleed.heightPt).toBeCloseTo((303 / 25.4) * 72, 4);
      expect(bleed.widthPx300Dpi).toBe(5031);
      expect(bleed.heightPx300Dpi).toBe(3579);
      expect(bleed.cssPageSize).toBe('426mm 303mm');
      expect(bleed.trimBoxMm).toEqual({
        left: 3,
        top: 3,
        right: 423,
        bottom: 300,
        width: 420,
        height: 297,
      });
    });

    it('calculates expected PDF sheet counts for spreads vs portrait pages', () => {
      expect(utils.getExpectedSheetCount('spread_a3', 'full_8p')).toBe(4);
      expect(utils.getExpectedSheetCount('spread_a3', 'compact_4p')).toBe(2);
      expect(utils.getExpectedSheetCount('portrait_a4', 'full_8p')).toBe(8);
      expect(utils.getExpectedSheetCount('portrait_a4', 'compact_4p')).toBe(4);
    });
  });

  describe('deep-link URL construction & output paths', () => {
    it('builds exact Monograph Studio deep-link query contract', () => {
      const built = utils.buildMonographUrl('http://127.0.0.1:4173/', {
        weapon: 'p08',
        style: 'dk_encyclopedia',
        edition: 'dk_encyclopedia',
        layout: 'spread_a3',
        pages: 'full_8p',
        quality: 'print_2880',
        lang: 'zh',
        bleed: true,
        callsign: 'Master Armorer #1',
      });

      const u = new URL(built);
      expect(u.origin).toBe('http://127.0.0.1:4173');
      expect(u.pathname).toBe('/');
      expect(u.searchParams.get('monograph')).toBe('1');
      expect(u.searchParams.get('weapon')).toBe('p08');
      expect(u.searchParams.get('style')).toBe('dk_encyclopedia');
      expect(u.searchParams.get('edition')).toBe('dk_encyclopedia');
      expect(u.searchParams.get('layout')).toBe('spread_a3');
      expect(u.searchParams.get('pages')).toBe('full_8p');
      expect(u.searchParams.get('quality')).toBe('print_2880');
      expect(u.searchParams.get('lang')).toBe('zh');
      expect(u.searchParams.get('prepress')).toBe('1');
      expect(u.searchParams.get('callsign')).toBe('Master Armorer #1');
    });

    it('preserves subpath deployments and omits empty callsign when prepress=0', () => {
      const built = utils.buildMonographUrl(
        'https://armory.example.org/digital-armory-3d/',
        {
          weapon: 'ak15',
          style: 'pro_dossier',
          edition: 'blueprint_manual',
          layout: 'portrait_a4',
          pages: 'compact_4p',
          quality: 'standard_1440',
          lang: 'en',
          bleed: false,
          callsign: '   ',
        }
      );

      const u = new URL(built);
      expect(u.pathname).toBe('/digital-armory-3d/');
      expect(u.searchParams.get('prepress')).toBe('0');
      expect(u.searchParams.has('callsign')).toBe(false);
    });

    it('generates distinct, deterministic PDF and thumbnail output paths', () => {
      const a = utils.buildOutputPaths('exports/dk-monographs', 'p08', {
        style: 'dk_encyclopedia',
        edition: 'dk_encyclopedia',
        layout: 'spread_a3',
        pages: 'full_8p',
        lang: 'zh',
        bleed: true,
      });
      const b = utils.buildOutputPaths('exports/dk-monographs', 'p08', {
        style: 'dk_encyclopedia',
        edition: 'dk_encyclopedia',
        layout: 'spread_a3',
        pages: 'full_8p',
        lang: 'zh',
        bleed: false,
      });

      expect(a.pdfPath).toContain(
        'dk-p08-dk_encyclopedia-dk_encyclopedia-spread_a3-full_8p-zh-bleed3mm.pdf'
      );
      expect(a.thumbnailPath).toContain('.thumb.png');
      expect(b.pdfPath).toContain('-trim.pdf');
      expect(a.pdfPath).not.toBe(b.pdfPath);
    });
  });

  describe('Chromium executable discovery & WebGL launch flags', () => {
    it('selects newest Playwright full Chromium over older revision and headless shell on macOS', () => {
      const cacheRoot = '/Users/tester/Library/Caches/ms-playwright';
      const files = new Set([
        cacheRoot,
        `${cacheRoot}/chromium-1243/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        `${cacheRoot}/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        `${cacheRoot}/chromium_headless_shell-1254/chrome-headless-shell-mac-arm64/chrome-headless-shell`,
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      ]);

      const found = utils.discoverChromiumExecutable({
        env: {},
        homeDir: '/Users/tester',
        platform: 'darwin',
        existsSync: (p) => files.has(p),
        readdirSync: () => [
          'chromium-1243',
          'chromium-1254',
          'chromium_headless_shell-1254',
          'ffmpeg-1013',
        ],
      });

      expect(found).toEqual({
        executablePath: `${cacheRoot}/chromium-1254/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
        source: 'playwright-cache:chromium-1254',
        isHeadlessShell: false,
      });
    });

    it('falls back cleanly to system Google Chrome and then Playwright headless shell', () => {
      const chromePath =
        '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
      const systemFound = utils.discoverChromiumExecutable({
        env: {},
        homeDir: '/Users/tester',
        platform: 'darwin',
        existsSync: (p) => p === chromePath,
        readdirSync: () => [],
      });
      expect(systemFound).toEqual({
        executablePath: chromePath,
        source: 'system-browser',
        isHeadlessShell: false,
      });

      const shellPath =
        '/home/ci/.cache/ms-playwright/chromium_headless_shell-1254/chrome-headless-shell-linux64/chrome-headless-shell';
      const shellFound = utils.discoverChromiumExecutable({
        env: {},
        homeDir: '/home/ci',
        platform: 'linux',
        existsSync: (p) =>
          p === '/home/ci/.cache/ms-playwright' || p === shellPath,
        readdirSync: () => ['chromium_headless_shell-1254'],
      });
      expect(shellFound).toEqual({
        executablePath: shellPath,
        source: 'playwright-cache:chromium_headless_shell-1254',
        isHeadlessShell: true,
      });
    });

    it('honors explicit path and environment overrides strictly', () => {
      const explicitFound = utils.discoverChromiumExecutable({
        explicitPath: '/opt/custom-chromium',
        existsSync: (p) => p === '/opt/custom-chromium',
      });
      expect(explicitFound?.source).toBe('cli-flag');

      // Missing explicit path returns null instead of silently switching binaries
      const explicitMissing = utils.discoverChromiumExecutable({
        explicitPath: '/opt/does-not-exist',
        existsSync: () => false,
      });
      expect(explicitMissing).toBeNull();

      const envFound = utils.discoverChromiumExecutable({
        env: { CHROMIUM_PATH: '/usr/local/bin/chromium' },
        existsSync: (p) => p === '/usr/local/bin/chromium',
      });
      expect(envFound?.source).toBe('env:CHROMIUM_PATH');
    });

    it('builds WebGL + high-DPI Chromium flags tailored to OS and driver mode', () => {
      const macCdp = utils.buildChromiumLaunchArgs({
        platform: 'darwin',
        mode: 'cdp',
        isHeadlessShell: false,
        userDataDir: '/tmp/profile-1',
      });
      expect(macCdp).toContain('--use-gl=angle');
      expect(macCdp).toContain('--use-angle=metal');
      expect(macCdp).toContain('--enable-webgl');
      expect(macCdp).toContain('--ignore-gpu-blocklist');
      expect(macCdp).toContain('--headless=new');
      expect(macCdp).toContain('--remote-debugging-port=0');
      expect(macCdp).toContain('--user-data-dir=/tmp/profile-1');

      const shellCdp = utils.buildChromiumLaunchArgs({
        platform: 'linux',
        mode: 'cdp',
        isHeadlessShell: true,
      });
      expect(shellCdp).toContain('--no-sandbox');
      expect(shellCdp).not.toContain('--headless=new');

      const pwMode = utils.buildChromiumLaunchArgs({
        platform: 'darwin',
        mode: 'playwright',
      });
      expect(pwMode).not.toContain('--remote-debugging-port=0');
      expect(pwMode).not.toContain('--headless=new');
    });
  });

  describe('PDF binary validation & reporting helpers', () => {
    it('validates a well-formed 4-spread A3+bleed PDF (> 50 KB) with accurate MediaBox', () => {
      const dims = utils.computePrepressDimensions('spread_a3', true);
      const pdf = buildSyntheticPdf({
        pageCount: 4,
        widthPt: dims.widthPt,
        heightPt: dims.heightPt,
        padBytes: 64 * 1024,
      });

      const res = utils.validatePdfBuffer(pdf, {
        expectedPages: 4,
        expectedWidthPt: dims.widthPt,
        expectedHeightPt: dims.heightPt,
      });

      expect(res.valid).toBe(true);
      expect(res.errors).toEqual([]);
      expect(res.warnings).toEqual([]);
      expect(res.pdfVersion).toBe('1.4');
      expect(res.hasPdfHeader).toBe(true);
      expect(res.hasEofTrailer).toBe(true);
      expect(res.pageCount).toBe(4);
      expect(res.mediaBoxMm?.width).toBeCloseTo(426, 0);
      expect(res.mediaBoxMm?.height).toBeCloseTo(303, 0);
    });

    it('detects compressed /Pages /Count fallback when /Type /Page objects are compressed', () => {
      const pdf = buildSyntheticPdf({
        pageCount: 8,
        padBytes: 55 * 1024,
        useCompressedPagesFallback: true,
      });
      const res = utils.validatePdfBuffer(pdf, { expectedPages: 8 });
      expect(res.valid).toBe(true);
      expect(res.pageCount).toBe(8);
    });

    it('rejects corrupt headers, missing %%EOF, tiny PDFs (< 50 KB), and 0-page PDFs', () => {
      const missingHeader = buildSyntheticPdf({ includeHeader: false });
      expect(utils.validatePdfBuffer(missingHeader).valid).toBe(false);
      expect(utils.validatePdfBuffer(missingHeader).hasPdfHeader).toBe(false);

      const missingEof = buildSyntheticPdf({ includeEof: false });
      expect(utils.validatePdfBuffer(missingEof).valid).toBe(false);
      expect(utils.validatePdfBuffer(missingEof).hasEofTrailer).toBe(false);

      const tooSmall = buildSyntheticPdf({ padBytes: 512 });
      const smallRes = utils.validatePdfBuffer(tooSmall);
      expect(smallRes.valid).toBe(false);
      expect(smallRes.errors.join(' ')).toContain('below minimum threshold');

      const zeroPages = buildSyntheticPdf({ pageCount: 0 });
      const zeroRes = utils.validatePdfBuffer(zeroPages);
      expect(zeroRes.valid).toBe(false);
      expect(zeroRes.pageCount).toBe(0);
    });

    it('warns on MediaBox or sheet count mismatch and fails when strictPageCount is enabled', () => {
      const a4Dims = utils.computePrepressDimensions('portrait_a4', false);
      const a3Dims = utils.computePrepressDimensions('spread_a3', true);
      const pdf = buildSyntheticPdf({
        pageCount: 8,
        widthPt: a4Dims.widthPt,
        heightPt: a4Dims.heightPt,
      });

      const warnRes = utils.validatePdfBuffer(pdf, {
        expectedPages: 4,
        expectedWidthPt: a3Dims.widthPt,
        expectedHeightPt: a3Dims.heightPt,
      });
      expect(warnRes.valid).toBe(true);
      expect(warnRes.warnings.length).toBeGreaterThanOrEqual(2);

      const strictRes = utils.validatePdfBuffer(pdf, {
        expectedPages: 4,
        strictPageCount: true,
      });
      expect(strictRes.valid).toBe(false);
    });

    it('summarizes Cycles 4K vs WebGL plate sources, parses ANSI Vite URLs, and formats report', () => {
      const plates = utils.summarizePlateSources({
        cover_hero: 'cycles_4k',
        ortho_right: 'cycles_4k',
        stencil_cutaway: 'webgl_2880',
        exploded_bom: 'webgl_1440',
      });
      expect(plates).toEqual({
        total: 4,
        cycles4k: 2,
        webgl2880: 1,
        webgl1440: 1,
        other: 0,
        label: '2 Cycles 4K + 1 WebGL 2880 + 1 WebGL 1440',
      });

      const ansiViteLine =
        '  \u001b[32m➜\u001b[39m  \u001b[1mLocal\u001b[22m:   \u001b[36mhttp://127.0.0.1:\u001b[1m51792\u001b[22m/\u001b[39m\n';
      expect(utils.parseViteServerUrl(ansiViteLine)).toBe(
        'http://127.0.0.1:51792/'
      );

      const report = utils.formatSummaryReport(
        [
          {
            ok: true,
            weaponId: 'p08',
            pdfPath: '/out/dk-p08.pdf',
            thumbnailPath: '/out/dk-p08.thumb.png',
            byteLength: 2_500_000,
            pageCount: 4,
            platesSummary: plates,
            elapsedSec: 6.4,
            warnings: [],
          },
        ],
        {
          driver: 'native-cdp',
          dimensions: utils.computePrepressDimensions('spread_a3', true),
          style: 'dk_encyclopedia',
          edition: 'dk_encyclopedia',
          pages: 'full_8p',
          quality: 'print_2880',
          lang: 'zh',
          totalElapsedSec: 7.2,
        }
      );

      expect(report).toContain('p08');
      expect(report).toContain('426×303mm');
      expect(report).toContain('2 Cycles 4K + 1 WebGL 2880');
      expect(report).toContain('1/1 succeeded');
    });
  });
});

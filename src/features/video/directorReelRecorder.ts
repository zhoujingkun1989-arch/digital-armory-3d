import type { LanguageCode } from '../../narration/types';
import { buildCentennialArmorySortMeta } from '../../weapons/expansion/centennialProjectors';
import { getWeaponManifest } from '../../weapons/manifests';
import type { ArmoryWeaponItem, WeaponId } from '../../weapons/types';

export type DirectorReelPresetId = '1080p_16x9' | '1080p_9x16' | '720p_16x9';

export interface DirectorReelPreset {
  id: DirectorReelPresetId;
  width: number;
  height: number;
  fps: number;
  videoBitsPerSecond: number;
  labelZh: string;
  labelEn: string;
}

export const REEL_PRESETS: Readonly<
  Record<DirectorReelPresetId, DirectorReelPreset>
> = {
  '1080p_16x9': {
    id: '1080p_16x9',
    width: 1920,
    height: 1080,
    fps: 30,
    videoBitsPerSecond: 8_000_000,
    labelZh: '1080p 横屏宽银幕 (16:9)',
    labelEn: '1080p Widescreen (16:9)',
  },
  '1080p_9x16': {
    id: '1080p_9x16',
    width: 1080,
    height: 1920,
    fps: 30,
    videoBitsPerSecond: 8_000_000,
    labelZh: '1080p 竖屏短视频 (9:16)',
    labelEn: '1080p Vertical Short (9:16)',
  },
  '720p_16x9': {
    id: '720p_16x9',
    width: 1280,
    height: 720,
    fps: 30,
    videoBitsPerSecond: 5_000_000,
    labelZh: '720p 轻量分享版 (16:9)',
    labelEn: '720p Compact WebM (16:9)',
  },
};

export const REEL_PRESET_IDS: readonly DirectorReelPresetId[] = [
  '1080p_16x9',
  '1080p_9x16',
  '720p_16x9',
];

export const REEL_MIME_CANDIDATES: readonly string[] = [
  'video/webm;codecs=vp9,opus',
  'video/webm;codecs=vp8,opus',
  'video/webm',
  'video/mp4',
];

const BAY_LABELS: Readonly<
  Record<ArmoryWeaponItem['category'], { zh: string; en: string }>
> = {
  rifle: { zh: '步枪展厅', en: 'RIFLES HALL' },
  lmg: { zh: '机枪展厅', en: 'MACHINE GUNS HALL' },
  smg: { zh: '冲锋枪展厅', en: 'SUBMACHINE GUNS HALL' },
  sniper: { zh: '狙击展厅', en: 'PRECISION RIFLES HALL' },
  shotgun: { zh: '霰弹展厅', en: 'SHOTGUNS HALL' },
  pistol: { zh: '手枪展厅', en: 'SIDEARMS HALL' },
  archery: { zh: '弓弩展厅', en: 'COMPOUND ARCHERY HALL' },
  armor: { zh: '重装装甲厅', en: 'MAIN BATTLE TANKS HALL' },
  ordnance: { zh: '航空重武厅', en: 'AERIAL ORDNANCE HALL' },
};

const EXHIBIT_YEAR_BY_ID: Readonly<Record<WeaponId, number>> = {
  ak15: 2018,
  m4a1: 1994,
  mp5: 1966,
  g17: 1982,
  m82a1: 1982,
  awm: 1996,
  scar: 2004,
  deagle: 1982,
  aug: 1977,
  p320: 2014,
  p90: 1990,
  lift33: 2024,
  r500: 2022,
  python: 1955,
  benellim4: 1999,
  garand: 1936,
  m249: 1982,
  p08: 1908,
  vector: 2009,
  g11: 1990,
  vss: 1987,
  m134: 2009,
  an94: 1994,
  ztz99a: 2015,
  m1a2: 2020,
  leopard2a7: 2021,
  tiger1: 1942,
  winchester1894: 1894,
  rem870: 1950,
  m1911: 1911,
  mg42: 1942,
  k98k: 1935,
  thompson: 1928,
  gau8: 1977,
  ...buildCentennialArmorySortMeta().years,
};

const EN_CALIBER_OVERRIDES: Partial<Record<WeaponId, string>> = {
  lift33: '400 gr Carbon Arrow (70 lb · 348 FPS)',
  r500: '400 gr Carbon Bolt (300 lb · 500 FPS)',
  m249: '5.56x45mm NATO (M27 Belt / STANAG)',
  g11: '4.73x33mm DM11 Caseless',
  vss: '9x39mm SP-5 / SP-6 Subsonic AP',
  m134: '7.62x51mm NATO (M80 / M13 Belt)',
};

export interface ReelLowerThirdMeta {
  weaponTitle: string;
  caliberYearLine: string;
  bayBadge: string;
  phaseTag: string;
  watermarkText: string;
}

export interface BuildReelLowerThirdOptions {
  displayName?: string;
  mode?: 'explode' | 'firing';
  sectionCut?: boolean;
  xrayShells?: boolean;
  activeStageBadge?: string | null;
}

/**
 * Pure bilingual metadata builder for the Broadcast Lower-Third Museum Title Card
 * and archival watermark (guaranteed 0 CJK in EN).
 */
export function buildReelLowerThirdMeta(
  weaponId: WeaponId,
  lang: LanguageCode,
  opts: BuildReelLowerThirdOptions = {}
): ReelLowerThirdMeta {
  const manifest = getWeaponManifest(weaponId);
  const bayInfo = BAY_LABELS[manifest.catalog.category];
  const weaponTitle =
    opts.displayName && opts.displayName.trim().length > 0
      ? opts.displayName.trim()
      : manifest.workbenchMeta.badge;
  const caliberText =
    lang === 'en'
      ? (EN_CALIBER_OVERRIDES[weaponId] ?? manifest.catalog.caliber)
      : manifest.catalog.caliber;
  const year = EXHIBIT_YEAR_BY_ID[weaponId];
  const caliberYearLine = `${caliberText} · ${year}`;
  const bayBadge =
    lang === 'zh'
      ? `${manifest.catalog.bayCode} · ${bayInfo.zh} · ${manifest.workbenchMeta.badge}`
      : `${manifest.catalog.bayCode} · ${bayInfo.en} · ${manifest.workbenchMeta.badge}`;

  let phaseTag = opts.activeStageBadge?.trim() ?? '';
  if (!phaseTag) {
    if (opts.mode === 'firing') {
      phaseTag = opts.sectionCut
        ? lang === 'zh'
          ? '剖视实弹击发循环'
          : 'CUTAWAY FIRING CYCLE'
        : lang === 'zh'
          ? '实弹内弹道演示'
          : 'LIVE FIRING KINEMATICS';
    } else if (opts.sectionCut) {
      phaseTag = lang === 'zh' ? 'CT 纵向剖视' : 'LIVE CT SECTION CUT';
    } else if (opts.xrayShells) {
      phaseTag = lang === 'zh' ? 'X-Ray 内构透视' : 'X-RAY INTERNAL VIEW';
    } else {
      phaseTag = lang === 'zh' ? '1:1 机械装配研究' : '1:1 MECHANICAL ARCHIVE';
    }
  }

  return {
    weaponTitle,
    caliberYearLine,
    bayBadge,
    phaseTag,
    watermarkText: 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE',
  };
}

export function pickSupportedVideoMimeType(
  isSupportedFn?: (mime: string) => boolean
): string {
  const checker =
    isSupportedFn ??
    (typeof MediaRecorder !== 'undefined' &&
    typeof MediaRecorder.isTypeSupported === 'function'
      ? (m: string) => MediaRecorder.isTypeSupported(m)
      : () => false);
  for (const mime of REEL_MIME_CANDIDATES) {
    try {
      if (checker(mime)) return mime;
    } catch {
      // ignore invalid codec check
    }
  }
  return 'video/webm';
}

export function buildReelFilename(
  weaponId: WeaponId | string,
  presetId: DirectorReelPresetId,
  mimeType: string
): string {
  const safeId = String(weaponId).replace(/[^a-z0-9_-]/gi, '_');
  const ext = mimeType.includes('mp4') ? 'mp4' : 'webm';
  return `digital-armory-${safeId}-${presetId}.${ext}`;
}

export interface ReelOverlayDrawOptions {
  targetWidth: number;
  targetHeight: number;
  weaponTitle: string;
  weaponMetaLine: string;
  captionText: string;
  telemetryLine: string;
  lang: LanguageCode;
  elapsedSec: number;
  /** Toggle broadcast lower-third museum card & archival watermark (default true). */
  showLowerThird?: boolean;
  bayBadge?: string;
  phaseTag?: string;
  watermarkText?: string;
}

interface CachedReelGradients {
  width: number;
  height: number;
  topGrad: CanvasGradient;
  botGrad: CanvasGradient;
  cardGrad: CanvasGradient;
}

const gradientCache = new WeakMap<
  CanvasRenderingContext2D,
  CachedReelGradients
>();

function getCachedGradients(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number
): CachedReelGradients {
  const cached = gradientCache.get(ctx);
  if (cached && cached.width === w && cached.height === h) {
    return cached;
  }
  const topGrad = ctx.createLinearGradient(0, 0, 0, Math.round(h * 0.12));
  topGrad.addColorStop(0, 'rgba(4, 7, 15, 0.72)');
  topGrad.addColorStop(1, 'rgba(4, 7, 15, 0)');

  const botGrad = ctx.createLinearGradient(0, h - Math.round(h * 0.18), 0, h);
  botGrad.addColorStop(0, 'rgba(4, 7, 15, 0)');
  botGrad.addColorStop(1, 'rgba(4, 7, 15, 0.86)');

  const cardGrad = ctx.createLinearGradient(0, h - 180, w * 0.55, h);
  cardGrad.addColorStop(0, 'rgba(8, 15, 29, 0.86)');
  cardGrad.addColorStop(1, 'rgba(8, 15, 29, 0.62)');

  const entry: CachedReelGradients = {
    width: w,
    height: h,
    topGrad,
    botGrad,
    cardGrad,
  };
  gradientCache.set(ctx, entry);
  return entry;
}

function formatTimecode(elapsedSec: number): string {
  const safe = Math.max(0, Number.isFinite(elapsedSec) ? elapsedSec : 0);
  const mins = Math.floor(safe / 60);
  const secs = Math.floor(safe % 60);
  const tenths = Math.floor((safe * 10) % 10);
  const mm = mins < 10 ? `0${mins}` : `${mins}`;
  const ss = secs < 10 ? `0${secs}` : `${secs}`;
  return `${mm}:${ss}.${tenths}`;
}

/**
 * Zero-GC per-frame compositor rendering the live 3D WebGL canvas plus optional
 * Broadcast Lower-Third Museum Title Card, archival watermark, timecode & subtitles.
 */
export function drawReelOverlayFrame(
  ctx: CanvasRenderingContext2D,
  sourceCanvas: CanvasImageSource & { width?: number; height?: number },
  opts: ReelOverlayDrawOptions
): void {
  const { targetWidth: w, targetHeight: h } = opts;
  ctx.fillStyle = '#070b14';
  ctx.fillRect(0, 0, w, h);

  const srcW = Math.max(1, Number(sourceCanvas.width) || w);
  const srcH = Math.max(1, Number(sourceCanvas.height) || h);
  const scale = Math.min(w / srcW, h / srcH);
  const drawW = srcW * scale;
  const drawH = srcH * scale;
  const offsetX = (w - drawW) * 0.5;
  const offsetY = (h - drawH) * 0.5;
  ctx.drawImage(sourceCanvas, offsetX, offsetY, drawW, drawH);

  const grads = getCachedGradients(ctx, w, h);
  const pad = Math.round(w * 0.032);
  const showLowerThird = opts.showLowerThird !== false;

  if (showLowerThird) {
    // Cached top & bottom cinema gradient scrims
    ctx.fillStyle = grads.topGrad;
    ctx.fillRect(0, 0, w, Math.round(h * 0.12));

    ctx.fillStyle = grads.botGrad;
    ctx.fillRect(0, h - Math.round(h * 0.18), w, Math.round(h * 0.18));

    // Top-left archival museum watermark & top-right live REC timecode
    const topY = Math.round(h * 0.046);
    const monoPx = Math.round(Math.max(12, w * 0.0105));
    ctx.fillStyle = '#38bdf8';
    ctx.font = `700 ${monoPx}px monospace`;
    ctx.textAlign = 'left';
    ctx.fillText(
      opts.watermarkText || 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE',
      pad,
      topY
    );

    ctx.textAlign = 'right';
    ctx.fillStyle = '#f87171';
    ctx.fillText(`REC ${formatTimecode(opts.elapsedSec)}`, w - pad, topY);
    ctx.textAlign = 'left';

    // Broadcast Lower-Third Museum Title Card plate (bottom-left)
    const cardH = Math.round(Math.max(82, h * 0.098));
    const cardW = Math.round(Math.min(w - pad * 2, Math.max(460, w * 0.48)));
    const cardX = pad;
    const cardY = h - pad - cardH;

    ctx.fillStyle = grads.cardGrad;
    ctx.fillRect(cardX, cardY, cardW, cardH);

    // Crisp left accent bar + hairline border
    ctx.fillStyle = '#38bdf8';
    ctx.fillRect(cardX, cardY, 4, cardH);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1;
    ctx.strokeRect(cardX + 0.5, cardY + 0.5, cardW - 1, cardH - 1);

    const innerX = cardX + 18;
    const bayText = opts.bayBadge || 'DIGITAL ARMORY 3D';
    ctx.fillStyle = '#38bdf8';
    ctx.font = `700 ${Math.round(Math.max(11, w * 0.009))}px monospace`;
    ctx.fillText(bayText, innerX, cardY + Math.round(cardH * 0.27));

    ctx.fillStyle = '#f8fafc';
    ctx.font = `800 ${Math.round(Math.max(18, w * 0.0185))}px sans-serif`;
    ctx.fillText(opts.weaponTitle, innerX, cardY + Math.round(cardH * 0.62));

    ctx.fillStyle = '#cbd5e1';
    ctx.font = `600 ${Math.round(Math.max(11, w * 0.0095))}px monospace`;
    ctx.fillText(opts.weaponMetaLine, innerX, cardY + Math.round(cardH * 0.86));

    // Bottom-right live phase pill & preset readout
    const phaseLabel = opts.phaseTag || opts.telemetryLine;
    if (phaseLabel) {
      ctx.textAlign = 'right';
      ctx.fillStyle = '#fbbf24';
      ctx.font = `700 ${Math.round(Math.max(12, w * 0.0105))}px monospace`;
      ctx.fillText(phaseLabel, w - pad, cardY + Math.round(cardH * 0.56));
      if (opts.telemetryLine && opts.phaseTag) {
        ctx.fillStyle = '#94a3b8';
        ctx.font = `600 ${Math.round(Math.max(10, w * 0.0085))}px monospace`;
        ctx.fillText(
          opts.telemetryLine,
          w - pad,
          cardY + Math.round(cardH * 0.82)
        );
      }
      ctx.textAlign = 'left';
    }
  }

  if (opts.captionText) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `600 ${Math.round(Math.max(14, w * 0.0125))}px sans-serif`;
    const captionY = showLowerThird
      ? h - pad - Math.round(Math.max(98, h * 0.122))
      : h - pad - Math.round(h * 0.03);
    ctx.fillText(opts.captionText.slice(0, 88), w * 0.5, captionY);
    ctx.textAlign = 'left';
  }
}

export interface MutableReelOverlayMeta {
  weaponTitle: string;
  weaponMetaLine: string;
  captionText: string;
  telemetryLine: string;
  showLowerThird: boolean;
  bayBadge: string;
  phaseTag: string;
  watermarkText: string;
}

export interface StartDirectorReelOptions {
  sourceCanvas: HTMLCanvasElement;
  presetId: DirectorReelPresetId;
  includeAudio: boolean;
  audioStream: MediaStream | null;
  lang: LanguageCode;
  showLowerThird?: boolean;
  /** Legacy object-returning metadata callback (supported for compatibility). */
  getOverlayMeta?: () => {
    weaponTitle: string;
    weaponMetaLine: string;
    captionText: string;
    telemetryLine: string;
    bayBadge?: string;
    phaseTag?: string;
    watermarkText?: string;
  };
  /** Preferred Zero-GC in-place metadata writer called at recording cadence. */
  fillOverlayMetaInto?: (out: MutableReelOverlayMeta) => void;
  onTick?: (elapsedMs: number) => void;
}

export class DirectorReelRecorderSession {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private rafId = 0;
  private startTs = 0;
  private lastTickEmitMs = -Infinity;
  private mimeType = 'video/webm';
  private stopped = false;

  // Pre-allocated mutable frame descriptors to keep 30fps recording Zero-GC
  private readonly metaScratch: MutableReelOverlayMeta = {
    weaponTitle: '',
    weaponMetaLine: '',
    captionText: '',
    telemetryLine: '',
    showLowerThird: true,
    bayBadge: '',
    phaseTag: '',
    watermarkText: 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE',
  };

  private readonly drawOptsScratch: ReelOverlayDrawOptions = {
    targetWidth: 1920,
    targetHeight: 1080,
    weaponTitle: '',
    weaponMetaLine: '',
    captionText: '',
    telemetryLine: '',
    lang: 'zh',
    elapsedSec: 0,
    showLowerThird: true,
    bayBadge: '',
    phaseTag: '',
    watermarkText: 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE',
  };

  public async start(opts: StartDirectorReelOptions): Promise<void> {
    if (typeof MediaRecorder === 'undefined') {
      throw new Error('MediaRecorder API not available in this browser');
    }
    const preset = REEL_PRESETS[opts.presetId];
    this.mimeType = pickSupportedVideoMimeType();

    const offscreen = document.createElement('canvas');
    offscreen.width = preset.width;
    offscreen.height = preset.height;
    const ctx = offscreen.getContext('2d');
    if (!ctx) {
      throw new Error('Failed to create 2D compositor canvas');
    }

    const canvasStream = offscreen.captureStream(preset.fps);
    const tracks: MediaStreamTrack[] = [...canvasStream.getVideoTracks()];
    if (opts.includeAudio && opts.audioStream) {
      for (const t of opts.audioStream.getAudioTracks()) {
        tracks.push(t);
      }
    }
    const composedStream = new MediaStream(tracks);

    this.chunks = [];
    this.stopped = false;
    this.startTs = performance.now();
    this.lastTickEmitMs = -Infinity;

    const recorder = new MediaRecorder(composedStream, {
      mimeType: this.mimeType,
      videoBitsPerSecond: preset.videoBitsPerSecond,
    });
    this.mediaRecorder = recorder;
    recorder.ondataavailable = (ev) => {
      if (ev.data && ev.data.size > 0) {
        this.chunks.push(ev.data);
      }
    };
    recorder.start(250);

    const drawOpts = this.drawOptsScratch;
    const metaScratch = this.metaScratch;
    drawOpts.targetWidth = preset.width;
    drawOpts.targetHeight = preset.height;
    drawOpts.lang = opts.lang;
    drawOpts.showLowerThird = opts.showLowerThird !== false;

    const drawLoop = () => {
      if (this.stopped) return;
      const elapsedMs = performance.now() - this.startTs;

      if (opts.fillOverlayMetaInto) {
        metaScratch.showLowerThird = opts.showLowerThird !== false;
        opts.fillOverlayMetaInto(metaScratch);
        drawOpts.weaponTitle = metaScratch.weaponTitle;
        drawOpts.weaponMetaLine = metaScratch.weaponMetaLine;
        drawOpts.captionText = metaScratch.captionText;
        drawOpts.telemetryLine = metaScratch.telemetryLine;
        drawOpts.showLowerThird = metaScratch.showLowerThird;
        drawOpts.bayBadge = metaScratch.bayBadge;
        drawOpts.phaseTag = metaScratch.phaseTag;
        drawOpts.watermarkText = metaScratch.watermarkText;
      } else if (opts.getOverlayMeta) {
        const meta = opts.getOverlayMeta();
        drawOpts.weaponTitle = meta.weaponTitle;
        drawOpts.weaponMetaLine = meta.weaponMetaLine;
        drawOpts.captionText = meta.captionText;
        drawOpts.telemetryLine = meta.telemetryLine;
        drawOpts.bayBadge = meta.bayBadge ?? '';
        drawOpts.phaseTag = meta.phaseTag ?? '';
        drawOpts.watermarkText =
          meta.watermarkText ?? 'DIGITAL ARMORY 3D · MUSEUM ARCHIVE';
      }
      drawOpts.elapsedSec = elapsedMs / 1000;

      drawReelOverlayFrame(ctx, opts.sourceCanvas, drawOpts);

      if (opts.onTick && elapsedMs - this.lastTickEmitMs >= 100) {
        this.lastTickEmitMs = elapsedMs;
        opts.onTick(elapsedMs);
      }
      this.rafId = window.requestAnimationFrame(drawLoop);
    };
    this.rafId = window.requestAnimationFrame(drawLoop);
  }

  public getMimeType(): string {
    return this.mimeType;
  }

  public stop(): Promise<Blob | null> {
    this.stopped = true;
    if (this.rafId) {
      window.cancelAnimationFrame(this.rafId);
      this.rafId = 0;
    }
    const recorder = this.mediaRecorder;
    if (!recorder || recorder.state === 'inactive') {
      return Promise.resolve(
        this.chunks.length > 0
          ? new Blob(this.chunks, { type: this.mimeType })
          : null
      );
    }
    return new Promise((resolve) => {
      recorder.onstop = () => {
        const blob = new Blob(this.chunks, { type: this.mimeType });
        this.chunks = [];
        resolve(blob);
      };
      recorder.stop();
    });
  }
}

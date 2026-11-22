import type { LanguageCode } from '../../narration/types';
import type { WeaponId } from '../../weapons/types';

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
}

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

  // Subtle top & bottom gradient scrims for crisp legibility
  const topGrad = ctx.createLinearGradient(0, 0, 0, 120);
  topGrad.addColorStop(0, 'rgba(4, 7, 15, 0.72)');
  topGrad.addColorStop(1, 'rgba(4, 7, 15, 0)');
  ctx.fillStyle = topGrad;
  ctx.fillRect(0, 0, w, 120);

  const botGrad = ctx.createLinearGradient(0, h - 150, 0, h);
  botGrad.addColorStop(0, 'rgba(4, 7, 15, 0)');
  botGrad.addColorStop(1, 'rgba(4, 7, 15, 0.84)');
  ctx.fillStyle = botGrad;
  ctx.fillRect(0, h - 150, w, 150);

  const pad = Math.round(w * 0.032);
  ctx.fillStyle = '#38bdf8';
  ctx.font = `700 ${Math.round(Math.max(12, w * 0.011))}px monospace`;
  ctx.fillText('DIGITAL ARMORY 3D · DIRECTOR REEL', pad, Math.round(h * 0.048));

  ctx.fillStyle = '#f8fafc';
  ctx.font = `800 ${Math.round(Math.max(18, w * 0.02))}px sans-serif`;
  ctx.fillText(opts.weaponTitle, pad, h - Math.round(h * 0.072));

  ctx.fillStyle = '#94a3b8';
  ctx.font = `600 ${Math.round(Math.max(12, w * 0.011))}px monospace`;
  ctx.fillText(opts.weaponMetaLine, pad, h - Math.round(h * 0.044));

  if (opts.telemetryLine) {
    ctx.textAlign = 'right';
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(opts.telemetryLine, w - pad, h - Math.round(h * 0.044));
    ctx.textAlign = 'left';
  }

  if (opts.captionText) {
    ctx.textAlign = 'center';
    ctx.fillStyle = '#e2e8f0';
    ctx.font = `600 ${Math.round(Math.max(14, w * 0.013))}px sans-serif`;
    ctx.fillText(
      opts.captionText.slice(0, 88),
      w * 0.5,
      h - Math.round(h * 0.112)
    );
    ctx.textAlign = 'left';
  }
}

export interface StartDirectorReelOptions {
  sourceCanvas: HTMLCanvasElement;
  presetId: DirectorReelPresetId;
  includeAudio: boolean;
  audioStream: MediaStream | null;
  lang: LanguageCode;
  getOverlayMeta: () => {
    weaponTitle: string;
    weaponMetaLine: string;
    captionText: string;
    telemetryLine: string;
  };
  onTick?: (elapsedMs: number) => void;
}

export class DirectorReelRecorderSession {
  private mediaRecorder: MediaRecorder | null = null;
  private chunks: Blob[] = [];
  private rafId = 0;
  private startTs = 0;
  private mimeType = 'video/webm';
  private stopped = false;

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

    const drawLoop = () => {
      if (this.stopped) return;
      const elapsedMs = performance.now() - this.startTs;
      const meta = opts.getOverlayMeta();
      drawReelOverlayFrame(ctx, opts.sourceCanvas, {
        targetWidth: preset.width,
        targetHeight: preset.height,
        weaponTitle: meta.weaponTitle,
        weaponMetaLine: meta.weaponMetaLine,
        captionText: meta.captionText,
        telemetryLine: meta.telemetryLine,
        lang: opts.lang,
        elapsedSec: elapsedMs / 1000,
      });
      opts.onTick?.(elapsedMs);
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

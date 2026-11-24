import React, { useEffect, useState } from 'react';
import type { GraphicsQualityTier } from '../../engine/canvas/graphicsQuality';
import {
  getGpuTelemetrySnapshot,
  getGpuTelemetrySubscriberCount,
  setGpuTelemetryEnabled,
  subscribeGpuTelemetry,
  type GpuTelemetrySnapshot,
} from '../../engine/canvas/gpuTelemetryBus';
import {
  getGeometryCacheStats,
  type GeometryCacheStats,
} from '../../engine/geometry/geometryService';
import { getKtx2SupportStatus } from '../../engine/materials/ktx2Support';
import {
  getPbrCacheStats,
  type PbrCacheStats,
} from '../../engine/materials/pbrManager';
import '../../styles/gpu-telemetry.css';

export interface GpuTelemetryLocaleStrings {
  title: string;
  closeAria: string;
  fpsLabel: string;
  frameTimeLabel: string;
  p95Prefix: string;
  drawCallsLabel: string;
  trisSuffix: string;
  awaitingFrames: string;
  webglSection: string;
  gpuGeometries: string;
  gpuTextures: string;
  gpuPrograms: string;
  geometryCacheSection: string;
  cachedWeapons: string;
  cachedParts: string;
  glbCsgSplit: string;
  lruQueue: string;
  pbrSection: string;
  pbrTextures: string;
  pbrHitsSplit: string;
  ktx2Pipeline: string;
  ktx2Ready: string;
  ktx2Fallback: string;
  ktx2Standby: string;
  ktx2EntriesSuffix: string;
  qualityTierUltra: string;
  qualityTierBalanced: string;
  qualityTierEco: string;
  none: string;
}

export const GPU_TELEMETRY_STRINGS: Readonly<
  Record<'zh' | 'en', GpuTelemetryLocaleStrings>
> = {
  zh: {
    title: 'GPU 与显存实时遥测',
    closeAria: '关闭 GPU 实时遥测面板',
    fpsLabel: '帧率',
    frameTimeLabel: '帧耗时',
    p95Prefix: 'P95',
    drawCallsLabel: '绘制调用',
    trisSuffix: '面',
    awaitingFrames: '等待采样',
    webglSection: 'WebGL 2.0 显存资源',
    gpuGeometries: 'GPU 几何缓冲',
    gpuTextures: 'GPU 贴图对象',
    gpuPrograms: '着色器管线',
    geometryCacheSection: '几何体 LRU 缓存',
    cachedWeapons: '常驻展品',
    cachedParts: '零件总数',
    glbCsgSplit: 'GLB / CSG 分布',
    lruQueue: 'LRU 队列',
    pbrSection: 'PBR 材质与 KTX2 管线',
    pbrTextures: '缓存贴图',
    pbrHitsSplit: 'KTX2 / WebP 命中',
    ktx2Pipeline: 'KTX2 转码状态',
    ktx2Ready: 'GPU 已就绪',
    ktx2Fallback: 'WebP 回退',
    ktx2Standby: '待初始化',
    ktx2EntriesSuffix: '项清单',
    qualityTierUltra: '旗舰画质',
    qualityTierBalanced: '均衡画质',
    qualityTierEco: '节能画质',
    none: '无',
  },
  en: {
    title: 'GPU & Memory Telemetry',
    closeAria: 'Close live GPU telemetry HUD',
    fpsLabel: 'FPS',
    frameTimeLabel: 'Frame Time',
    p95Prefix: 'P95',
    drawCallsLabel: 'Draw Calls',
    trisSuffix: 'tris',
    awaitingFrames: 'Awaiting frames',
    webglSection: 'WebGL 2.0 GPU Resources',
    gpuGeometries: 'GPU Geometries',
    gpuTextures: 'GPU Textures',
    gpuPrograms: 'Shader Programs',
    geometryCacheSection: 'Geometry LRU Cache',
    cachedWeapons: 'Cached Exhibits',
    cachedParts: 'Cached Parts',
    glbCsgSplit: 'GLB / CSG Split',
    lruQueue: 'LRU Order',
    pbrSection: 'PBR & KTX2 Pipeline',
    pbrTextures: 'Cached Textures',
    pbrHitsSplit: 'KTX2 / WebP Hits',
    ktx2Pipeline: 'KTX2 Transcoder',
    ktx2Ready: 'GPU Ready',
    ktx2Fallback: 'WebP Fallback',
    ktx2Standby: 'Standby',
    ktx2EntriesSuffix: 'entries',
    qualityTierUltra: 'Ultra',
    qualityTierBalanced: 'Balanced',
    qualityTierEco: 'Eco',
    none: 'None',
  },
};

export interface GpuTelemetryOverlayProps {
  open: boolean;
  onClose: () => void;
  lang: 'zh' | 'en';
  qualityTier?: GraphicsQualityTier;
  theme?: 'dark' | 'light';
  className?: string;
}

interface TelemetryViewState {
  gpu: GpuTelemetrySnapshot;
  geometry: GeometryCacheStats;
  pbr: PbrCacheStats;
  ktx2: ReturnType<typeof getKtx2SupportStatus>;
}

function formatCompactCount(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0';
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return String(Math.round(n));
}

function captureTelemetryState(): TelemetryViewState {
  const snap = getGpuTelemetrySnapshot();
  return {
    gpu: { ...snap },
    geometry: getGeometryCacheStats(),
    pbr: getPbrCacheStats(),
    ktx2: getKtx2SupportStatus(),
  };
}

function getTierLabel(
  tier: GraphicsQualityTier,
  t: GpuTelemetryLocaleStrings
): string {
  switch (tier) {
    case 'ultra':
      return t.qualityTierUltra;
    case 'balanced':
      return t.qualityTierBalanced;
    case 'eco':
      return t.qualityTierEco;
  }
}

const GpuTelemetryOverlayPanel: React.FC<
  Omit<GpuTelemetryOverlayProps, 'open'>
> = ({ onClose, lang, qualityTier = 'ultra', theme = 'dark', className }) => {
  const [state, setState] = useState<TelemetryViewState>(() =>
    captureTelemetryState()
  );

  useEffect(() => {
    setGpuTelemetryEnabled(true);

    const unsubscribe = subscribeGpuTelemetry((snap) => {
      setState({
        gpu: { ...snap },
        geometry: getGeometryCacheStats(),
        pbr: getPbrCacheStats(),
        ktx2: getKtx2SupportStatus(),
      });
    });

    // Low-frequency fallback refresh for cache stats when canvas is idle
    const fallbackTimer = window.setInterval(() => {
      setState(captureTelemetryState());
    }, 1000);

    return () => {
      window.clearInterval(fallbackTimer);
      unsubscribe();
      if (getGpuTelemetrySubscriberCount() === 0) {
        setGpuTelemetryEnabled(false);
      }
    };
  }, []);

  const t = GPU_TELEMETRY_STRINGS[lang];
  const { gpu, geometry, pbr, ktx2 } = state;
  const hasSamples = gpu.sampleCount > 0;

  const fpsTier = !hasSamples
    ? 'idle'
    : gpu.fps >= 50
      ? 'good'
      : gpu.fps >= 30
        ? 'warn'
        : 'poor';

  const ktx2Status = !ktx2.initialized
    ? { label: t.ktx2Standby, badge: 'idle' as const }
    : ktx2.gpuSupported
      ? { label: t.ktx2Ready, badge: 'ktx2' as const }
      : { label: t.ktx2Fallback, badge: 'webp' as const };

  const rootClassName = [
    'gpu-telemetry-hud',
    theme === 'light' ? 'gpu-telemetry-hud--light' : '',
    className ?? '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <aside
      className={rootClassName}
      role="status"
      aria-live="off"
      aria-label={t.title}
      data-testid="gpu-telemetry-overlay"
    >
      <header className="gpu-telemetry-header">
        <div className="gpu-telemetry-title-wrap">
          <span
            className={`gpu-telemetry-dot${fpsTier !== 'idle' ? ` gpu-telemetry-dot--${fpsTier}` : ''}`}
            aria-hidden="true"
          />
          <h3 className="gpu-telemetry-title">{t.title}</h3>
        </div>
        <div className="gpu-telemetry-header-actions">
          <span className="gpu-telemetry-tier-pill">
            {getTierLabel(qualityTier, t)}
          </span>
          <button
            type="button"
            className="gpu-telemetry-close"
            onClick={onClose}
            aria-label={t.closeAria}
          >
            ×
          </button>
        </div>
      </header>

      <div className="gpu-telemetry-kpi-grid">
        <div className="gpu-telemetry-kpi">
          <span className="gpu-telemetry-kpi-label">{t.fpsLabel}</span>
          <span
            className={`gpu-telemetry-kpi-value${fpsTier !== 'idle' ? ` gpu-telemetry-kpi-value--${fpsTier}` : ''}`}
          >
            {hasSamples ? Math.round(gpu.fps) : '—'}
          </span>
          <span className="gpu-telemetry-kpi-sub">
            {hasSamples ? `${gpu.frameMs.toFixed(1)} ms` : t.awaitingFrames}
          </span>
        </div>

        <div className="gpu-telemetry-kpi">
          <span className="gpu-telemetry-kpi-label">{t.frameTimeLabel}</span>
          <span className="gpu-telemetry-kpi-value">
            {hasSamples ? `${gpu.avgFrameMs.toFixed(1)}` : '—'}
          </span>
          <span className="gpu-telemetry-kpi-sub">
            {hasSamples
              ? `${t.p95Prefix} ${gpu.p95FrameMs.toFixed(1)} ms`
              : 'ms'}
          </span>
        </div>

        <div className="gpu-telemetry-kpi">
          <span className="gpu-telemetry-kpi-label">{t.drawCallsLabel}</span>
          <span className="gpu-telemetry-kpi-value">
            {hasSamples ? gpu.drawCalls : '—'}
          </span>
          <span className="gpu-telemetry-kpi-sub">
            {hasSamples
              ? `${formatCompactCount(gpu.triangles)} ${t.trisSuffix}`
              : `0 ${t.trisSuffix}`}
          </span>
        </div>
      </div>

      <section className="gpu-telemetry-section">
        <div className="gpu-telemetry-section-title">{t.webglSection}</div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.gpuGeometries}</span>
          <span className="gpu-telemetry-row-val">{gpu.geometries}</span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.gpuTextures}</span>
          <span className="gpu-telemetry-row-val">{gpu.textures}</span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.gpuPrograms}</span>
          <span className="gpu-telemetry-row-val">{gpu.programs}</span>
        </div>
      </section>

      <section className="gpu-telemetry-section">
        <div className="gpu-telemetry-section-title">
          {t.geometryCacheSection}
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.cachedWeapons}</span>
          <span className="gpu-telemetry-row-val">
            {geometry.cachedWeaponsCount}
          </span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.cachedParts}</span>
          <span className="gpu-telemetry-row-val">
            {geometry.cachedPartsCount}
          </span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.glbCsgSplit}</span>
          <span className="gpu-telemetry-row-val">
            {geometry.glbPartsCount} / {geometry.csgPartsCount}
          </span>
        </div>
        <div
          className="gpu-telemetry-lru"
          title={
            geometry.lruOrder.length > 0
              ? geometry.lruOrder.join(' -> ')
              : t.none
          }
        >
          {t.lruQueue}:{' '}
          {geometry.lruOrder.length > 0
            ? geometry.lruOrder.join(' → ')
            : t.none}
        </div>
      </section>

      <section className="gpu-telemetry-section">
        <div className="gpu-telemetry-section-title">{t.pbrSection}</div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.pbrTextures}</span>
          <span className="gpu-telemetry-row-val">
            {pbr.cachedTextureCount} ({pbr.cachedWeaponsLru.length})
          </span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.pbrHitsSplit}</span>
          <span className="gpu-telemetry-row-val">
            {pbr.ktx2Hits} / {pbr.webpHits}
          </span>
        </div>
        <div className="gpu-telemetry-row">
          <span className="gpu-telemetry-row-label">{t.ktx2Pipeline}</span>
          <span className="gpu-telemetry-row-val">
            <span
              className={`gpu-telemetry-badge gpu-telemetry-badge--${ktx2Status.badge}`}
            >
              {ktx2Status.label}
            </span>
            {ktx2.publishedCount > 0
              ? ` · ${ktx2.publishedCount} ${t.ktx2EntriesSuffix}`
              : ''}
          </span>
        </div>
      </section>
    </aside>
  );
};

export const GpuTelemetryOverlay: React.FC<GpuTelemetryOverlayProps> = ({
  open,
  ...rest
}) => {
  if (!open) {
    return null;
  }
  return <GpuTelemetryOverlayPanel {...rest} />;
};

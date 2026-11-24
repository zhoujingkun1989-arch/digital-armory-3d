import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  RefreshCw,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getKtx2SupportStatus } from '../../engine/materials/ktx2Support';
import {
  buildExhibitOfflineAssetUrls,
  cacheExhibitOffline,
  type OfflineStorageEstimate,
  purgeAllOfflineCaches,
  queryAllCachedWeaponIds,
  queryOfflineStorageStatus,
  removeExhibitOfflineCache,
} from '../../engine/offline/offlineMuseumManager';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import type { WeaponId } from '../../weapons/types';
import '../../styles/offline-museum.css';

export interface OfflineMuseumModalProps {
  onClose: () => void;
}

interface CacheProgressState {
  label: string;
  done: number;
  total: number;
}

interface StatusBannerState {
  tone: 'info' | 'success' | 'error';
  text: string;
}

const ARMOR_HALL_IDS = ['ztz99a', 'm1a2', 'leopard2a7', 'tiger1'] as const;

export const OFFLINE_MUSEUM_STRINGS = {
  zh: {
    badge: 'PWA 离线博物馆 · GPU KTX2 管线',
    title: '离线博物馆缓存包与硬件纹理管线中心',
    subtitle:
      '将全馆 Draco .glb 3D 精模、双语四幕语音剧本、2K/4K 5 通道 ORM 贴图与 HDRI 环境光预缓存至独立保护库，断网环境仍可零卡顿独立运行',
    close: '关闭离线中心',
    cacheCountLabel: '已缓存展品包',
    storageUsedLabel: '浏览器缓存占用',
    filesUnit: (count: number) => `${count} 个文件`,
    ktx2Label: 'Basis / KTX2 GPU 状态',
    ktx2Ready: 'BasisU 转码器就绪 (WebP 无损回退)',
    ktx2Standby: 'WebP 默认在线流式渲染',
    cacheArmorHallBtn: '一键缓存重装坦克展厅 (4)',
    purgeBtn: '清空离线缓存',
    cachedPill: '已离线缓存',
    cacheBtn: '缓存离线包',
    removeTitle: (name: string) => `点击移除「${name}」离线缓存包`,
    cacheTitle: (name: string, mb: number) =>
      `缓存「${name}」全部离线资产（约 ${mb.toFixed(1)} MB）`,
    cachingBusy: '写入中',
    cachingProgressStatus: (label: string, done: number, total: number) =>
      `正在写入离线保护缓存：${label}（${done} / ${total}）`,
    cachedCompleteStatus: (label: string, total: number) =>
      `已完成「${label}」全量离线包缓存（${total} / ${total} 项资产已锁定）`,
    cachedPartialStatus: (label: string, cached: number, total: number) =>
      `「${label}」部分资产写入失败（${cached} / ${total}），请检查网络后重试`,
    armorHallCompleteStatus: (cachedTanks: number, totalTanks: number) =>
      `重装坦克展厅离线同步完成（${cachedTanks} / ${totalTanks} 辆主战坦克就绪）`,
    removedStatus: (label: string) => `已移除「${label}」离线缓存包`,
    purgedStatus: '已清空全部离线博物馆保护缓存包',
    unsupportedStatus: '当前浏览器环境不支持 Cache Storage 离线缓存 API',
  },
  en: {
    badge: 'OFFLINE VAULT · PWA & KTX2 PIPELINE',
    title: 'Offline Museum Package Cache & GPU Texture Pipeline',
    subtitle:
      'Pre-cache Draco .glb 3D models, bilingual story scripts, 2K/4K 5-channel ORM maps, and HDRI lighting into protected Service Worker storage for air-gapped offline browsing',
    close: 'Close Offline Center',
    cacheCountLabel: 'Cached Exhibits',
    storageUsedLabel: 'Cache Storage',
    filesUnit: (count: number) => `${count} files`,
    ktx2Label: 'Basis / KTX2 Pipeline',
    ktx2Ready: 'BasisU Transcoder Ready (WebP Fallback)',
    ktx2Standby: 'WebP Runtime Streaming',
    cacheArmorHallBtn: 'Cache Heavy Armor Hall (4)',
    purgeBtn: 'Purge All Cache',
    cachedPill: 'Cached Offline',
    cacheBtn: 'Cache Offline',
    removeTitle: (name: string) => `Click to remove offline package for ${name}`,
    cacheTitle: (name: string, mb: number) =>
      `Cache full offline package for ${name} (~${mb.toFixed(1)} MB)`,
    cachingBusy: 'Caching',
    cachingProgressStatus: (label: string, done: number, total: number) =>
      `Caching protected offline pack: ${label} (${done} / ${total})`,
    cachedCompleteStatus: (label: string, total: number) =>
      `Cached full offline pack for ${label} (${total} / ${total} assets locked)`,
    cachedPartialStatus: (label: string, cached: number, total: number) =>
      `Incomplete cache for ${label} (${cached} / ${total} assets) — retry when online`,
    armorHallCompleteStatus: (cachedTanks: number, totalTanks: number) =>
      `Heavy Armor Hall offline sync complete (${cachedTanks} / ${totalTanks} MBTs ready)`,
    removedStatus: (label: string) => `Removed offline package for ${label}`,
    purgedStatus: 'Purged all protected Offline Museum caches',
    unsupportedStatus:
      'Cache Storage API is unavailable in this browser context',
  },
} as const;

export const OfflineMuseumModal: React.FC<OfflineMuseumModalProps> = ({
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lang = useAppStore((s) => s.lang);
  const ui = OFFLINE_MUSEUM_STRINGS[lang];

  const [cachedIds, setCachedIds] = useState<Set<WeaponId>>(() => new Set());
  const [estimate, setEstimate] = useState<OfflineStorageEstimate>({
    supported: true,
    usageMb: 0,
    quotaMb: 0,
    cachedUrlsCount: 0,
  });
  const [busyId, setBusyId] = useState<string | null>(null);
  const [progress, setProgress] = useState<CacheProgressState | null>(null);
  const [statusBanner, setStatusBanner] = useState<StatusBannerState | null>(
    null
  );

  const exhibitSizes = useMemo(() => {
    const map = new Map<WeaponId, { estimatedMb: number; assetCount: number }>();
    for (const m of WEAPON_MANIFESTS) {
      const manifest = buildExhibitOfflineAssetUrls(m.id);
      map.set(m.id, {
        estimatedMb: manifest.estimatedMb,
        assetCount: manifest.urls.length,
      });
    }
    return map;
  }, []);

  const refreshStatus = useCallback(async () => {
    const [ids, est] = await Promise.all([
      queryAllCachedWeaponIds(),
      queryOfflineStorageStatus(),
    ]);
    setCachedIds(ids);
    setEstimate(est);
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (dialog && !dialog.open && typeof dialog.showModal === 'function') {
      dialog.showModal();
    }
    const timerId = window.setTimeout(() => {
      void refreshStatus();
    }, 0);
    const handleCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    dialog?.addEventListener('cancel', handleCancel);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timerId);
      dialog?.removeEventListener('cancel', handleCancel);
      window.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, [onClose, refreshStatus]);

  const ktx2Status = getKtx2SupportStatus();

  const handleToggleWeapon = async (weaponId: WeaponId) => {
    if (!estimate.supported) {
      setStatusBanner({ tone: 'error', text: ui.unsupportedStatus });
      return;
    }
    const shortLabel = getLocalizedShortWeaponLabel(weaponId, lang);
    const info = exhibitSizes.get(weaponId);
    setBusyId(weaponId);
    playWorkbenchFoley('toggle_switch');

    if (cachedIds.has(weaponId)) {
      setProgress(null);
      await removeExhibitOfflineCache(weaponId);
      setStatusBanner({ tone: 'info', text: ui.removedStatus(shortLabel) });
    } else {
      const total = info?.assetCount ?? 0;
      setProgress({ label: shortLabel, done: 0, total });
      const res = await cacheExhibitOffline(weaponId, (done, totalFiles) => {
        setProgress({ label: shortLabel, done, total: totalFiles });
      });
      setStatusBanner(
        res.ok
          ? {
              tone: 'success',
              text: ui.cachedCompleteStatus(shortLabel, res.totalCount),
            }
          : {
              tone: 'error',
              text: ui.cachedPartialStatus(
                shortLabel,
                res.cachedCount,
                res.totalCount
              ),
            }
      );
    }

    await refreshStatus();
    setProgress(null);
    setBusyId(null);
  };

  const handleCacheArmorHall = async () => {
    if (!estimate.supported) {
      setStatusBanner({ tone: 'error', text: ui.unsupportedStatus });
      return;
    }
    setBusyId('armor_hall');
    playWorkbenchFoley('preset_detent');

    const totalAssets = ARMOR_HALL_IDS.reduce(
      (acc, id) => acc + (exhibitSizes.get(id)?.assetCount ?? 0),
      0
    );
    let completedBefore = 0;
    let succeededTanks = 0;

    for (const id of ARMOR_HALL_IDS) {
      const tankLabel = getLocalizedShortWeaponLabel(id, lang);
      const tankTotal = exhibitSizes.get(id)?.assetCount ?? 0;
      setProgress({
        label: tankLabel,
        done: completedBefore,
        total: totalAssets,
      });
      const res = await cacheExhibitOffline(id, (done) => {
        setProgress({
          label: tankLabel,
          done: completedBefore + done,
          total: totalAssets,
        });
      });
      if (res.ok) succeededTanks += 1;
      completedBefore += tankTotal;
    }

    setStatusBanner({
      tone: succeededTanks === ARMOR_HALL_IDS.length ? 'success' : 'error',
      text: ui.armorHallCompleteStatus(succeededTanks, ARMOR_HALL_IDS.length),
    });

    await refreshStatus();
    setProgress(null);
    setBusyId(null);
  };

  const handlePurge = async () => {
    setBusyId('purge');
    setProgress(null);
    playWorkbenchFoley('toggle_switch');
    await purgeAllOfflineCaches();
    await refreshStatus();
    setStatusBanner({ tone: 'info', text: ui.purgedStatus });
    setBusyId(null);
  };

  const progressPct =
    progress && progress.total > 0
      ? Math.min(100, Math.round((progress.done / progress.total) * 100))
      : 0;

  return (
    <dialog
      ref={dialogRef}
      className="offline-dialog"
      data-testid="offline-museum-modal"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      onClick={(e) => {
        if (e.target === dialogRef.current) {
          onClose();
        }
      }}
    >
      <div className="offline-shell">
        <header className="offline-header">
          <div>
            <span className="offline-badge">
              <WifiOff size={12} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
            <h2 id={titleId} className="offline-title">
              {ui.title}
            </h2>
            <p className="offline-sub">{ui.subtitle}</p>
          </div>
          <div className="offline-head-actions">
            <button
              type="button"
              className="offline-btn is-accent"
              disabled={busyId !== null}
              onClick={() => void handleCacheArmorHall()}
            >
              <Download size={13} aria-hidden="true" />
              <span>
                {busyId === 'armor_hall' && progress
                  ? `${progress.done} / ${progress.total}`
                  : ui.cacheArmorHallBtn}
              </span>
            </button>
            <button
              type="button"
              className="offline-btn is-danger"
              disabled={busyId !== null}
              onClick={() => void handlePurge()}
            >
              <Trash2 size={13} aria-hidden="true" />
              <span>{ui.purgeBtn}</span>
            </button>
            <button
              type="button"
              className="offline-close-btn"
              aria-label={ui.close}
              onClick={onClose}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </header>

        <div className="offline-body">
          <div className="offline-kpi-row">
            <div className="offline-kpi-card">
              <span>
                <HardDrive size={12} aria-hidden="true" /> {ui.cacheCountLabel}
              </span>
              <strong className="tabular">
                {cachedIds.size} / {WEAPON_MANIFESTS.length}
              </strong>
            </div>
            <div className="offline-kpi-card">
              <span>{ui.storageUsedLabel}</span>
              <strong className="tabular">
                {estimate.usageMb} MB ({ui.filesUnit(estimate.cachedUrlsCount)})
              </strong>
            </div>
            <div className="offline-kpi-card">
              <span>
                <Cpu size={12} aria-hidden="true" /> {ui.ktx2Label}
              </span>
              <strong>
                {ktx2Status.initialized ? ui.ktx2Ready : ui.ktx2Standby}
              </strong>
            </div>
          </div>

          {(progress || statusBanner) && (
            <div
              role="status"
              aria-live="polite"
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 6,
                padding: '9px 12px',
                borderRadius: 10,
                border:
                  progress || statusBanner?.tone === 'success'
                    ? '1px solid rgba(52, 211, 153, 0.42)'
                    : statusBanner?.tone === 'error'
                      ? '1px solid rgba(248, 113, 113, 0.45)'
                      : '1px solid rgba(148, 163, 184, 0.28)',
                background:
                  progress || statusBanner?.tone === 'success'
                    ? 'rgba(16, 185, 129, 0.12)'
                    : statusBanner?.tone === 'error'
                      ? 'rgba(239, 68, 68, 0.12)'
                      : 'var(--surface-subtle, rgba(15, 23, 42, 0.56))',
                fontSize: 12,
              }}
            >
              <span>
                {progress
                  ? ui.cachingProgressStatus(
                      progress.label,
                      progress.done,
                      progress.total
                    )
                  : statusBanner?.text}
              </span>
              {progress && (
                <div
                  style={{
                    height: 5,
                    borderRadius: 999,
                    background: 'rgba(148, 163, 184, 0.22)',
                    overflow: 'hidden',
                  }}
                >
                  <div
                    style={{
                      width: `${progressPct}%`,
                      height: '100%',
                      background: '#34d399',
                      transition: 'width 0.15s ease',
                    }}
                  />
                </div>
              )}
            </div>
          )}

          <div className="offline-grid">
            {WEAPON_MANIFESTS.map((m) => {
              const isCached = cachedIds.has(m.id);
              const isBusy = busyId === m.id;
              const shortName = getLocalizedShortWeaponLabel(m.id, lang);
              const sizeInfo = exhibitSizes.get(m.id);
              const estMb = sizeInfo?.estimatedMb ?? 3.5;
              const buttonLabel = isBusy
                ? progress
                  ? `${progress.done} / ${progress.total}`
                  : ui.cachingBusy
                : isCached
                  ? ui.cachedPill
                  : ui.cacheBtn;

              return (
                <div
                  key={m.id}
                  className={`offline-item-card ${isCached ? 'is-cached' : ''}`}
                >
                  <div className="offline-item-meta">
                    <span className="offline-bay">{m.catalog.bayCode}</span>
                    <strong>{shortName}</strong>
                    <span
                      className="tabular"
                      style={{
                        fontSize: 10,
                        opacity: 0.72,
                        whiteSpace: 'nowrap',
                      }}
                    >
                      ~{estMb.toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    className={`offline-item-btn ${isCached ? 'is-cached' : ''}`}
                    title={
                      isCached
                        ? ui.removeTitle(shortName)
                        : ui.cacheTitle(shortName, estMb)
                    }
                    onClick={() => void handleToggleWeapon(m.id)}
                  >
                    {isBusy ? (
                      <RefreshCw
                        size={12}
                        className="spin-icon"
                        aria-hidden="true"
                      />
                    ) : isCached ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : (
                      <Download size={12} aria-hidden="true" />
                    )}
                    <span className="tabular">{buttonLabel}</span>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </dialog>
  );
};

export default OfflineMuseumModal;

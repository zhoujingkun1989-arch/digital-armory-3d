import React, { useCallback, useEffect, useId, useRef, useState } from 'react';
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

const OFFLINE_STRINGS = {
  zh: {
    badge: 'WP-25a · PWA 离线博物馆 & GPU KTX2 管线',
    title: '离线博物馆缓存包与硬件纹理管线中心',
    subtitle:
      '支持将全馆 Draco .glb 3D 精模、双语四幕语音剧本与 4K 装甲贴图预缓存至浏览器持久库，断网环境仍可独立安装运行',
    close: '关闭离线中心',
    cacheCountLabel: '已缓存展品包',
    storageUsedLabel: '浏览器缓存占用',
    ktx2Label: 'Basis / KTX2 GPU 状态',
    ktx2Ready: 'BasisU 转码器就绪 (WebP 无损回退)',
    ktx2Standby: 'WebP 默认在线流式渲染',
    cacheArmorHallBtn: '一键缓存重装坦克展厅 (4)',
    purgeBtn: '清空离线缓存',
    cachedPill: '已离线缓存',
    cacheBtn: '缓存离线包',
    removeBtn: '移除',
    cachingBusy: '写入缓存中…',
  },
  en: {
    badge: 'WP-25a · PWA OFFLINE MUSEUM & KTX2 PIPELINE',
    title: 'Offline Museum Package Cache & GPU Texture Pipeline',
    subtitle:
      'Pre-cache Draco .glb 3D models, bilingual story scripts, and PBR armor textures into Service Worker Storage for air-gapped offline museum browsing',
    close: 'Close Offline Center',
    cacheCountLabel: 'Cached Exhibits',
    storageUsedLabel: 'Cache Storage',
    ktx2Label: 'Basis / KTX2 Pipeline',
    ktx2Ready: 'BasisU Transcoder Ready (WebP Fallback)',
    ktx2Standby: 'WebP Runtime Streaming',
    cacheArmorHallBtn: 'Cache Heavy Armor Hall (4)',
    purgeBtn: 'Purge All Cache',
    cachedPill: 'Cached Offline',
    cacheBtn: 'Cache Offline',
    removeBtn: 'Remove',
    cachingBusy: 'Caching...',
  },
} as const;

export const OfflineMuseumModal: React.FC<OfflineMuseumModalProps> = ({
  onClose,
}) => {
  const titleId = useId();
  const dialogRef = useRef<HTMLDialogElement>(null);
  const lang = useAppStore((s) => s.lang);
  const ui = OFFLINE_STRINGS[lang];

  const [cachedIds, setCachedIds] = useState<Set<WeaponId>>(() => new Set());
  const [estimate, setEstimate] = useState<OfflineStorageEstimate>({
    supported: true,
    usageMb: 0,
    quotaMb: 0,
    cachedUrlsCount: 0,
  });
  const [busyId, setBusyId] = useState<string | null>(null);

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
    if (dialog && !dialog.open) {
      dialog.showModal();
    }
    const timerId = window.setTimeout(() => {
      void refreshStatus();
    }, 0);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.clearTimeout(timerId);
      window.removeEventListener('keydown', onKeyDown);
      if (dialog?.open) {
        dialog.close();
      }
    };
  }, [onClose, refreshStatus]);

  const ktx2Status = getKtx2SupportStatus();

  const handleToggleWeapon = async (weaponId: WeaponId) => {
    setBusyId(weaponId);
    playWorkbenchFoley('toggle_switch');
    if (cachedIds.has(weaponId)) {
      await removeExhibitOfflineCache(weaponId);
    } else {
      await cacheExhibitOffline(weaponId);
    }
    await refreshStatus();
    setBusyId(null);
  };

  const handleCacheArmorHall = async () => {
    setBusyId('armor_hall');
    playWorkbenchFoley('preset_detent');
    for (const id of ['ztz99a', 'm1a2', 'leopard2a7', 'tiger1'] as const) {
      await cacheExhibitOffline(id);
    }
    await refreshStatus();
    setBusyId(null);
  };

  const handlePurge = async () => {
    setBusyId('purge');
    playWorkbenchFoley('toggle_switch');
    await purgeAllOfflineCaches();
    await refreshStatus();
    setBusyId(null);
  };

  return (
    <dialog
      ref={dialogRef}
      className="offline-dialog"
      data-testid="offline-museum-modal"
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
              <span>{ui.cacheArmorHallBtn}</span>
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
                {estimate.usageMb} MB ({estimate.cachedUrlsCount} files)
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

          <div className="offline-grid">
            {WEAPON_MANIFESTS.map((m) => {
              const isCached = cachedIds.has(m.id);
              const isBusy = busyId === m.id;
              return (
                <div
                  key={m.id}
                  className={`offline-item-card ${isCached ? 'is-cached' : ''}`}
                >
                  <div className="offline-item-meta">
                    <span className="offline-bay">{m.catalog.bayCode}</span>
                    <strong>{getLocalizedShortWeaponLabel(m.id, lang)}</strong>
                  </div>
                  <button
                    type="button"
                    disabled={isBusy}
                    className={`offline-item-btn ${isCached ? 'is-cached' : ''}`}
                    onClick={() => void handleToggleWeapon(m.id)}
                  >
                    {isBusy ? (
                      <RefreshCw size={12} className="spin-icon" aria-hidden="true" />
                    ) : isCached ? (
                      <CheckCircle2 size={12} aria-hidden="true" />
                    ) : (
                      <Download size={12} aria-hidden="true" />
                    )}
                    <span>
                      {isBusy
                        ? ui.cachingBusy
                        : isCached
                          ? ui.cachedPill
                          : ui.cacheBtn}
                    </span>
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

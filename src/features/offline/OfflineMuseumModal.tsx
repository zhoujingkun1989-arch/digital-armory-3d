import React, { useCallback, useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  CheckCircle2,
  Cpu,
  Download,
  HardDrive,
  RefreshCw,
  Sparkles,
  Trash2,
  WifiOff,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { getKtx2SupportStatus } from '../../engine/materials/ktx2Support';
import {
  ARMOR_HALL_OFFLINE_IDS,
  buildExhibitOfflineAssetUrls,
  cacheExhibitOffline,
  FEATURED_LEGENDS_OFFLINE_IDS,
  type OfflineStorageEstimate,
  purgeAllOfflineCaches,
  queryAllCachedWeaponIds,
  queryOfflineStorageStatus,
  removeExhibitOfflineCache,
  summarizeOfflinePack,
} from '../../engine/offline/offlineMuseumManager';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import { useAppStore } from '../../store/useAppStore';
import {
  matchesArmoryCategory,
  WEAPON_MANIFESTS,
} from '../../weapons/manifests';
import type { ArmoryCategory, WeaponId } from '../../weapons/types';
import '../../styles/offline-museum.css';

export type OfflineSpecializedHallId = Exclude<ArmoryCategory, 'all'>;

export const OFFLINE_SPECIALIZED_HALLS: readonly OfflineSpecializedHallId[] = [
  'assault',
  'lmg',
  'smg',
  'sniper',
  'shotgun',
  'pistol',
  'archery',
  'armor',
  'ordnance',
];

export const OFFLINE_HALL_LABELS: Readonly<
  Record<ArmoryCategory, { zh: string; en: string }>
> = {
  all: { zh: '全部 10 展厅', en: 'All 10 Halls' },
  assault: { zh: '步枪/无托', en: 'Assault' },
  lmg: { zh: '轻重机枪', en: 'LMG' },
  smg: { zh: '冲锋枪', en: 'SMG' },
  sniper: { zh: '狙击/反器材', en: 'Sniper' },
  shotgun: { zh: '霰弹枪', en: 'Shotgun' },
  pistol: { zh: '手枪/左轮', en: 'Pistol' },
  archery: { zh: '复合弓弩', en: 'Archery' },
  armor: { zh: '重装甲大厅', en: 'Heavy Armor' },
  ordnance: { zh: '航空重武', en: 'Ordnance' },
};

export interface OfflineHallBreakdownItem {
  hallId: OfflineSpecializedHallId;
  labelZh: string;
  labelEn: string;
  cached: number;
  total: number;
  pct: number;
  isComplete: boolean;
}

/**
 * Pure 10-Hall offline collection partition computing cached vs total exhibit
 * counts across all 9 specialized museum halls (exact partition summing to
 * `WEAPON_MANIFESTS.length` = 34).
 */
export function buildOfflineHallBreakdown(
  cachedIds: ReadonlySet<WeaponId> | readonly WeaponId[] = []
): OfflineHallBreakdownItem[] {
  const cachedSet =
    cachedIds instanceof Set ? cachedIds : new Set<WeaponId>(cachedIds);

  return OFFLINE_SPECIALIZED_HALLS.map((hallId) => {
    const members = WEAPON_MANIFESTS.filter((m) =>
      matchesArmoryCategory(m.catalog, hallId)
    );
    const total = members.length;
    const cached = members.filter((m) => cachedSet.has(m.id)).length;
    const pct = total > 0 ? Math.round((cached / total) * 100) : 0;
    const labels = OFFLINE_HALL_LABELS[hallId];
    return {
      hallId,
      labelZh: labels.zh,
      labelEn: labels.en,
      cached,
      total,
      pct,
      isComplete: total > 0 && cached === total,
    };
  });
}

export interface OfflineMuseumModalProps {
  onClose: () => void;
}

interface CacheProgressState {
  label: string;
  done: number;
  total: number;
  exhibitIndex?: number;
  exhibitTotal?: number;
  exhibitDone?: number;
  exhibitFilesTotal?: number;
}

interface StatusBannerState {
  tone: 'info' | 'success' | 'error';
  text: string;
}

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
    cacheFeaturedLegendsBtn: '一键缓存五大殿堂传奇 (5)',
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
    batchCachingProgressStatus: (
      exhibitIndex: number,
      exhibitTotal: number,
      label: string,
      exhibitDone: number,
      exhibitFilesTotal: number,
      totalDone: number,
      totalFiles: number
    ) =>
      `正在批量同步离线包 · 展品 ${exhibitIndex}/${exhibitTotal}（${label}）· ${exhibitDone}/${exhibitFilesTotal} 文件（总计 ${totalDone}/${totalFiles}）`,
    cachedCompleteStatus: (label: string, total: number) =>
      `已完成「${label}」全量离线包缓存（${total} / ${total} 项资产已锁定）`,
    cachedPartialStatus: (label: string, cached: number, total: number) =>
      `「${label}」部分资产写入失败（${cached} / ${total}），请检查网络后重试`,
    featuredLegendsCompleteStatus: (cached: number, total: number) =>
      `五大殿堂传奇离线包同步完成（${cached} / ${total} 款核心馆藏就绪）`,
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
    cacheFeaturedLegendsBtn: 'Cache Featured 5 Legends',
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
    batchCachingProgressStatus: (
      exhibitIndex: number,
      exhibitTotal: number,
      label: string,
      exhibitDone: number,
      exhibitFilesTotal: number,
      totalDone: number,
      totalFiles: number
    ) =>
      `Exhibit ${exhibitIndex}/${exhibitTotal} (${label}) · ${exhibitDone}/${exhibitFilesTotal} files (${totalDone}/${totalFiles} total)`,
    cachedCompleteStatus: (label: string, total: number) =>
      `Cached full offline pack for ${label} (${total} / ${total} assets locked)`,
    cachedPartialStatus: (label: string, cached: number, total: number) =>
      `Incomplete cache for ${label} (${cached} / ${total} assets) — retry when online`,
    featuredLegendsCompleteStatus: (cached: number, total: number) =>
      `Featured 5 Legends offline sync complete (${cached} / ${total} iconic exhibits ready)`,
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

  const featuredLegendsSummary = useMemo(
    () => summarizeOfflinePack(FEATURED_LEGENDS_OFFLINE_IDS),
    []
  );
  const armorHallSummary = useMemo(
    () => summarizeOfflinePack(ARMOR_HALL_OFFLINE_IDS),
    []
  );
  const hallBreakdown = useMemo(
    () => buildOfflineHallBreakdown(cachedIds),
    [cachedIds]
  );
  const totalCachedPct = Math.round(
    (cachedIds.size / Math.max(1, WEAPON_MANIFESTS.length)) * 100
  );

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

  const handleCacheBatchPack = async (
    packKey: 'featured_legends' | 'armor_hall',
    packIds: readonly WeaponId[]
  ) => {
    if (!estimate.supported) {
      setStatusBanner({ tone: 'error', text: ui.unsupportedStatus });
      return;
    }
    setBusyId(packKey);
    playWorkbenchFoley('preset_detent');

    const totalAssets = packIds.reduce(
      (acc, id) => acc + (exhibitSizes.get(id)?.assetCount ?? 0),
      0
    );
    let completedBefore = 0;
    let succeededCount = 0;

    for (let idx = 0; idx < packIds.length; idx += 1) {
      const id = packIds[idx];
      const exhibitLabel = getLocalizedShortWeaponLabel(id, lang);
      const exhibitTotal = exhibitSizes.get(id)?.assetCount ?? 0;
      const exhibitIndex = idx + 1;

      setProgress({
        label: exhibitLabel,
        done: completedBefore,
        total: totalAssets,
        exhibitIndex,
        exhibitTotal: packIds.length,
        exhibitDone: 0,
        exhibitFilesTotal: exhibitTotal,
      });

      const res = await cacheExhibitOffline(id, (done, totalFiles) => {
        setProgress({
          label: exhibitLabel,
          done: completedBefore + done,
          total: totalAssets,
          exhibitIndex,
          exhibitTotal: packIds.length,
          exhibitDone: done,
          exhibitFilesTotal: totalFiles,
        });
      });
      if (res.ok) succeededCount += 1;
      completedBefore += exhibitTotal;
    }

    setStatusBanner({
      tone: succeededCount === packIds.length ? 'success' : 'error',
      text:
        packKey === 'featured_legends'
          ? ui.featuredLegendsCompleteStatus(succeededCount, packIds.length)
          : ui.armorHallCompleteStatus(succeededCount, packIds.length),
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

  const progressMessage = progress
    ? progress.exhibitIndex !== undefined &&
      progress.exhibitTotal !== undefined &&
      progress.exhibitDone !== undefined &&
      progress.exhibitFilesTotal !== undefined
      ? ui.batchCachingProgressStatus(
          progress.exhibitIndex,
          progress.exhibitTotal,
          progress.label,
          progress.exhibitDone,
          progress.exhibitFilesTotal,
          progress.done,
          progress.total
        )
      : ui.cachingProgressStatus(progress.label, progress.done, progress.total)
    : statusBanner?.text;

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
        {/* Persistent polite live region announcing cache progress, completion & purge events */}
        <div
          className="offline-sr-only"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="offline-live-announcer"
        >
          {progressMessage ?? ''}
        </div>

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
              className="offline-btn is-legends"
              data-testid="offline-cache-legends-btn"
              aria-label={`${ui.cacheFeaturedLegendsBtn} (~${featuredLegendsSummary.estimatedMb.toFixed(1)} MB)`}
              disabled={busyId !== null}
              onClick={() =>
                void handleCacheBatchPack(
                  'featured_legends',
                  FEATURED_LEGENDS_OFFLINE_IDS
                )
              }
            >
              <Sparkles size={13} aria-hidden="true" />
              <span className="tabular">
                {busyId === 'featured_legends' &&
                progress &&
                progress.exhibitIndex !== undefined &&
                progress.exhibitTotal !== undefined
                  ? `${progress.exhibitIndex}/${progress.exhibitTotal} · ${progress.exhibitDone ?? 0}/${progress.exhibitFilesTotal ?? 0}`
                  : ui.cacheFeaturedLegendsBtn}
              </span>
              {busyId !== 'featured_legends' && (
                <span className="offline-pack-mb tabular">
                  ~{featuredLegendsSummary.estimatedMb.toFixed(1)} MB
                </span>
              )}
            </button>
            <button
              type="button"
              className="offline-btn is-accent"
              data-testid="offline-cache-armor-btn"
              aria-label={`${ui.cacheArmorHallBtn} (~${armorHallSummary.estimatedMb.toFixed(1)} MB)`}
              disabled={busyId !== null}
              onClick={() =>
                void handleCacheBatchPack('armor_hall', ARMOR_HALL_OFFLINE_IDS)
              }
            >
              <Download size={13} aria-hidden="true" />
              <span className="tabular">
                {busyId === 'armor_hall' &&
                progress &&
                progress.exhibitIndex !== undefined &&
                progress.exhibitTotal !== undefined
                  ? `${progress.exhibitIndex}/${progress.exhibitTotal} · ${progress.exhibitDone ?? 0}/${progress.exhibitFilesTotal ?? 0}`
                  : ui.cacheArmorHallBtn}
              </span>
              {busyId !== 'armor_hall' && (
                <span className="offline-pack-mb tabular">
                  ~{armorHallSummary.estimatedMb.toFixed(1)} MB
                </span>
              )}
            </button>
            <button
              type="button"
              className="offline-btn is-danger"
              aria-label={ui.purgeBtn}
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

          {/* 10-Hall Offline Collection Summary Bar */}
          <section
            className="offline-halls-section"
            data-testid="offline-halls-breakdown"
            aria-label={
              lang === 'zh'
                ? '十大展厅离线缓存进度汇总'
                : '10-hall offline collection cache breakdown'
            }
          >
            <div className="offline-halls-head">
              <span className="offline-halls-title">
                {lang === 'zh'
                  ? '10 大展厅离线藏品覆盖进度'
                  : '10-HALL OFFLINE COLLECTION COVERAGE'}
              </span>
              <span className="offline-halls-overall tabular">
                {cachedIds.size} / {WEAPON_MANIFESTS.length} ({totalCachedPct}%)
              </span>
            </div>
            <div className="offline-halls-bar" role="list">
              <div
                role="listitem"
                className={`offline-hall-chip ${
                  cachedIds.size === WEAPON_MANIFESTS.length ? 'is-complete' : ''
                }`}
              >
                <span className="offline-hall-top">
                  <span className="offline-hall-name">
                    {OFFLINE_HALL_LABELS.all[lang]}
                  </span>
                  <span className="offline-hall-ratio tabular">
                    {cachedIds.size}/{WEAPON_MANIFESTS.length}
                  </span>
                </span>
                <span className="offline-hall-track" aria-hidden="true">
                  <span
                    className="offline-hall-fill"
                    style={{ width: `${totalCachedPct}%` }}
                  />
                </span>
              </div>
              {hallBreakdown.map((h) => (
                <div
                  key={h.hallId}
                  role="listitem"
                  data-hall-id={h.hallId}
                  className={`offline-hall-chip ${h.isComplete ? 'is-complete' : ''}`}
                >
                  <span className="offline-hall-top">
                    <span className="offline-hall-name">
                      {lang === 'zh' ? h.labelZh : h.labelEn}
                    </span>
                    <span className="offline-hall-ratio tabular">
                      {h.cached}/{h.total}
                    </span>
                  </span>
                  <span className="offline-hall-track" aria-hidden="true">
                    <span
                      className="offline-hall-fill"
                      style={{ width: `${h.pct}%` }}
                    />
                  </span>
                </div>
              ))}
            </div>
          </section>

          {(progress || statusBanner) && (
            <div
              data-testid="offline-status-banner"
              className={`offline-status-banner ${
                progress || statusBanner?.tone === 'success'
                  ? 'is-success'
                  : statusBanner?.tone === 'error'
                    ? 'is-error'
                    : 'is-info'
              }`}
            >
              <span className="tabular">{progressMessage}</span>
              {progress && (
                <div className="offline-progress-track">
                  <div
                    className="offline-progress-fill"
                    style={{ width: `${progressPct}%` }}
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
                    <span className="offline-item-mb tabular">
                      ~{estMb.toFixed(1)} MB
                    </span>
                  </div>
                  <button
                    type="button"
                    disabled={busyId !== null}
                    aria-pressed={isCached}
                    aria-label={
                      isCached
                        ? ui.removeTitle(shortName)
                        : ui.cacheTitle(shortName, estMb)
                    }
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

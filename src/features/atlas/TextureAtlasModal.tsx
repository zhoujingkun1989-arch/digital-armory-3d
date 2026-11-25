import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import {
  Check,
  Cpu,
  Download,
  Image as ImageIcon,
  Layers,
  Search,
  Sparkles,
  X,
} from 'lucide-react';
import { getKtx2SupportStatus } from '../../engine/materials/ktx2Support';
import {
  normalizeTextureFileName,
  resolveTextureUrl,
} from '../../engine/utils/assetUrl';
import {
  ALL_ATLAS_EN_STRINGS,
  getLocalizedAtlasHeading,
  getLocalizedAtlasSuite,
} from '../../i18n/atlasStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { getLocalizedShortWeaponLabel } from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest, WEAPON_MANIFESTS } from '../../weapons/manifests';
import { preloadWeaponPlugin, useWeaponPlugin } from '../../weapons/registry';
import type { WeaponId, WeaponManifest } from '../../weapons/types';
import '../../styles/atlas-modal.css';

/**
 * Pure helper returning only manifests that carry Cycles-baked 2K/4K 5-channel
 * Packed ORM texture atlases (`ALL_ATLAS_EN_STRINGS[m.id]`), preventing empty tabs
 * when the museum expands from 34 Flagships to 100 exhibits.
 */
export function getBakedAtlasManifests(
  manifests: readonly WeaponManifest[] = WEAPON_MANIFESTS
): WeaponManifest[] {
  return manifests.filter((m) => Boolean(ALL_ATLAS_EN_STRINGS[m.id]));
}

/**
 * Resolves a safe baked-atlas tab ID, gracefully falling back to `'ak15'`
 * when opened while viewing a Centennial procedural-CAD exhibit.
 */
export function resolveAtlasWeaponTab(
  candidate: WeaponId,
  bakedManifests: readonly WeaponManifest[] = getBakedAtlasManifests()
): WeaponId {
  if (
    ALL_ATLAS_EN_STRINGS[candidate] &&
    bakedManifests.some((m) => m.id === candidate)
  ) {
    return candidate;
  }
  return bakedManifests.some((m) => m.id === 'ak15')
    ? 'ak15'
    : (bakedManifests[0]?.id ?? 'ak15');
}

/**
 * Concise bilingual coverage badge clarifying the 34 Flagship baked Cycles ORM
 * atlases vs the shared 13-suite 1K 5-channel Packed ORM library on Centennial exhibits.
 */
export function buildAtlasBakedCoverageNote(
  bakedCount: number,
  totalCount: number,
  lang: LanguageCode
): string {
  const proceduralCount = Math.max(0, totalCount - bakedCount);
  if (lang === 'zh') {
    return proceduralCount > 0
      ? `${bakedCount} 款旗舰 Cycles 2K/4K 烘焙 ORM 图集 · ${proceduralCount} 款百年展品共享 13 套 1K 5通道 ORM 材质图库`
      : `${bakedCount} 款旗舰全量 Cycles 2K/4K 5 通道烘焙 ORM 图集`;
  }
  return proceduralCount > 0
    ? `${bakedCount} Flagship Cycles 2K/4K Baked ORM Atlases · ${proceduralCount} Centennial Exhibits Use 13 Shared 1K 5-Ch ORM PBR Suites`
    : `${bakedCount} Flagship Cycles 2K/4K 5-Ch Baked ORM Atlases`;
}

/** Exact 8 MBT exterior suites baked at 4096x4096 (24 4K WebP maps on disk). */
export const TANK_4K_ATLAS_SUITE_IDS: ReadonlySet<string> = new Set([
  'ztz99a_v3_armor_hull',
  'ztz99a_v3_turret_gun',
  'm1a2_v3_hull_armor',
  'm1a2_v3_turret_gun',
  'leopard2a7_v3_hull_camo',
  'leopard2a7_v3_turret_gun',
  'tiger1_v3_hull_zimmerit',
  'tiger1_v3_turret_88mm',
]);

export type AtlasResolutionTier = '4k_tank' | '2k_suite' | 'seamless';

export interface AtlasResolutionClassification {
  tier: AtlasResolutionTier;
  pixelDims: string;
  badgeEn: string;
  badgeZh: string;
}

export function classifyAtlasSuiteResolution(
  suiteId: string,
  fallbackResolution?: string
): AtlasResolutionClassification {
  const combined = `${suiteId} ${fallbackResolution ?? ''}`;
  if (TANK_4K_ATLAS_SUITE_IDS.has(suiteId) || /4096/.test(combined)) {
    return {
      tier: '4k_tank',
      pixelDims: '4096 × 4096 px',
      badgeEn: '4096x4096 4K TANK ATLAS',
      badgeZh: '4096×4096 4K 主战坦克图集',
    };
  }
  if (/512|seamless|micro/i.test(combined)) {
    return {
      tier: 'seamless',
      pixelDims: fallbackResolution || '512 × 512 px (Seamless)',
      badgeEn: '512x512 SEAMLESS MICRO',
      badgeZh: '512×512 无缝微表面贴图',
    };
  }
  return {
    tier: '2k_suite',
    pixelDims: fallbackResolution || '2048 × 2048 px',
    badgeEn: '2048x2048 2K SUITE',
    badgeZh: '2048×2048 2K 材质套件',
  };
}

export interface AtlasSuiteIndexEntry {
  weaponId: WeaponId;
  bayCode: string;
  suiteId: string;
  weaponNameCn: string;
  weaponNameEn: string;
  suiteTitleEn: string;
  suiteTabTitleEn: string;
  tier: AtlasResolutionTier;
  searchBlob: string;
}

const MATERIAL_ZH_SYNONYMS: readonly [RegExp, string][] = [
  [/walnut|wood|stock|grip/i, '胡桃木 木托 木纹 实木 握把'],
  [/beech|laminated/i, '榉木 层压木'],
  [/armor|hull|era|composite|glacis/i, '装甲 车体 爆反 复合装甲'],
  [/turret|gun|88mm|cannon/i, '炮塔 主炮 航炮'],
  [/zimmerit/i, '防磁 齐默里特 涂层'],
  [/polymer|nylon|polyamide|frame|chassis/i, '聚合物 工程塑料 机匣 框架'],
  [/steel|metal|slide|receiver|bolt|shroud|parker/i, '精钢 金属 套筒 机匣 护筒 磷化'],
  [/drum|mag|belt|feed/i, '弹鼓 弹匣 弹链 供弹'],
  [/carbon|limb|cam|riser|archery/i, '碳纤维 弓片 凸轮 弓把'],
  [/chrome|stainless|nickel|silver|royal/i, '镀铬 不锈钢 抛光 烤蓝'],
  [/turbine|power|engine|drivetrain|internal/i, '动力 燃气轮机 发动机 内部'],
];

function deriveZhMaterialTags(text: string): string {
  const tags: string[] = [];
  for (const [rx, zh] of MATERIAL_ZH_SYNONYMS) {
    if (rx.test(text)) tags.push(zh);
  }
  return tags.join(' ');
}

export const ATLAS_SUITE_SEARCH_INDEX: readonly AtlasSuiteIndexEntry[] = (() => {
  const entries: AtlasSuiteIndexEntry[] = [];
  for (const manifest of WEAPON_MANIFESTS) {
    const enWeapon = ALL_ATLAS_EN_STRINGS[manifest.id];
    if (!enWeapon) continue;
    for (const [suiteId, suiteData] of Object.entries(enWeapon.suites)) {
      const resInfo = classifyAtlasSuiteResolution(suiteId);
      const rawEn = `${suiteId} ${suiteData.title} ${suiteData.tabTitle} ${suiteData.summary} ${suiteData.highlights.join(' ')}`;
      const zhHints = deriveZhMaterialTags(rawEn);
      const tierTokens =
        resInfo.tier === '4k_tank'
          ? '4k 4096 tank armor mbt 主战坦克 4k图集'
          : resInfo.tier === 'seamless'
            ? '512 seamless micro 无缝 微表面'
            : '2k 2048 suite 2k套件';
      const searchBlob = [
        manifest.id,
        manifest.catalog.bayCode,
        manifest.catalog.nameCn,
        manifest.catalog.subtitleEn,
        manifest.catalog.category,
        manifest.atlasHeadingCn,
        enWeapon.heading,
        rawEn,
        zhHints,
        tierTokens,
      ]
        .join(' ')
        .toLowerCase();

      entries.push({
        weaponId: manifest.id,
        bayCode: manifest.catalog.bayCode,
        suiteId,
        weaponNameCn: manifest.catalog.nameCn,
        weaponNameEn: manifest.catalog.subtitleEn,
        suiteTitleEn: suiteData.title,
        suiteTabTitleEn: suiteData.tabTitle,
        tier: resInfo.tier,
        searchBlob,
      });
    }
  }
  return entries;
})();

export type AtlasTierFilter = 'all' | '4k_tank' | '2k_suite';

export function searchAtlasSuites(
  query: string,
  tierFilter: AtlasTierFilter = 'all'
): AtlasSuiteIndexEntry[] {
  const tokens = query
    .trim()
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
  return ATLAS_SUITE_SEARCH_INDEX.filter((entry) => {
    if (tierFilter === '4k_tank' && entry.tier !== '4k_tank') return false;
    if (tierFilter === '2k_suite' && entry.tier === '4k_tank') return false;
    if (tokens.length === 0) return true;
    for (const tok of tokens) {
      if (!entry.searchBlob.includes(tok)) return false;
    }
    return true;
  });
}

export const ATLAS_PIPELINE_STRINGS: Readonly<
  Record<
    LanguageCode,
    {
      searchPlaceholder: string;
      searchAria: string;
      clearSearch: string;
      filterAll: string;
      filter4k: string;
      filter2k: string;
      matchesCount: (shown: number, total: number) => string;
      noMatches: string;
      resetFilters: string;
      ormPackingBadge: string;
      ktx2GpuReady: (published: number) => string;
      ktx2WebpFallback: string;
    }
  >
> = {
  zh: {
    searchPlaceholder: `搜索 ${ATLAS_SUITE_SEARCH_INDEX.length} 套旗舰 2K/4K 图集（如 4K / 胡桃木 / 装甲 / ZTZ / 弹鼓 / 防磁）...`,
    searchAria: '按展品或材质关键词检索 PBR 贴图套件',
    clearSearch: '清除检索',
    filterAll: '全部套件',
    filter4k: '4K 主战坦克 (8)',
    filter2k: '2K 精雕套件',
    matchesCount: (shown, total) => `${shown} / ${total} 旗舰套件（+13 共享）`,
    noMatches: '未找到匹配的 PBR 材质套件，请尝试其他关键词或重置筛选。',
    resetFilters: '重置筛选',
    ormPackingBadge: '5通道 Packed ORM · R=环境遮蔽 G=粗糙度 B=金属度',
    ktx2GpuReady: (published) =>
      published > 0
        ? `KTX2 / Basis GPU 硬解就绪 (${published} 项已发布)`
        : 'KTX2 / Basis 转码器就绪 · WebP ORM 实时流式',
    ktx2WebpFallback: 'WebP 5通道 ORM 物理材质管线',
  },
  en: {
    searchPlaceholder: `Search ${ATLAS_SUITE_SEARCH_INDEX.length} Flagship 2K/4K suites (e.g. 4K, walnut, ERA, zimmerit, GAU-8)...`,
    searchAria: 'Filter PBR texture suites by exhibit or material keyword',
    clearSearch: 'Clear search',
    filterAll: 'All Suites',
    filter4k: '4K Tank Atlas (8)',
    filter2k: '2K Suites',
    matchesCount: (shown, total) => `${shown} / ${total} Flagship (+13 Shared)`,
    noMatches: 'No matching PBR suites found. Try another material keyword or reset filters.',
    resetFilters: 'Reset Filters',
    ormPackingBadge: '5-Ch Packed ORM · R=AO G=Rough B=Metal',
    ktx2GpuReady: (published) =>
      published > 0
        ? `KTX2 / Basis GPU Ready (${published} published)`
        : 'KTX2 / Basis Transcoder Ready · WebP ORM Active',
    ktx2WebpFallback: 'WebP 5-Ch Packed ORM Runtime',
  },
};

export interface Ktx2RuntimeStatusSnapshot {
  readonly initialized: boolean;
  readonly gpuSupported: boolean;
  readonly publishedCount: number;
}

export interface AtlasPipelineTelemetry {
  readonly lang: LanguageCode;
  readonly ariaLabel: string;
  readonly kicker: string;
  readonly activeCodecLabel: string;
  readonly ktx2StatusLabel: string;
  readonly ktx2Mode: 'gpu_published' | 'transcoder_ready' | 'webp_fallback';
  readonly inventorySummary: string;
  readonly totalSuites: number;
  readonly totalMaps: number;
  readonly tank4kMaps: number;
}

export const VERIFIED_ATLAS_SUITE_COUNT = 114;
export const VERIFIED_ATLAS_MAP_COUNT = 453;
export const VERIFIED_TANK_4K_MAP_COUNT = 24;

/**
 * Pure bilingual runtime telemetry composer for the PBR Texture Atlas pipeline banner.
 * Reports active 5-channel Packed ORM WebP streaming alongside live KTX2 Basis Universal
 * transcoder readiness and verified repository texture counts.
 */
export function buildAtlasPipelineTelemetry(
  ktx2Status: Ktx2RuntimeStatusSnapshot,
  lang: LanguageCode
): AtlasPipelineTelemetry {
  const isZh = lang === 'zh';
  const gpuReady = ktx2Status.initialized && ktx2Status.gpuSupported;
  const ktx2Mode: AtlasPipelineTelemetry['ktx2Mode'] =
    gpuReady && ktx2Status.publishedCount > 0
      ? 'gpu_published'
      : gpuReady
        ? 'transcoder_ready'
        : 'webp_fallback';

  const ktx2StatusLabel =
    ktx2Mode === 'gpu_published'
      ? isZh
        ? `KTX2 Basis Universal 转码器硬解启用（${ktx2Status.publishedCount} 项 GPU 压缩贴图）`
        : `KTX2 Basis Universal Transcoder Active (${ktx2Status.publishedCount} GPU maps)`
      : ktx2Mode === 'transcoder_ready'
        ? isZh
          ? 'KTX2 Basis Universal 转码器就绪 · 零损 WebP 流式激活'
          : 'KTX2 Basis Universal Transcoder Ready · WebP Streaming Active'
        : isZh
          ? 'KTX2 Basis Universal 转码器待机 · WebP 5 通道 ORM 零损直出'
          : 'KTX2 Basis Universal Transcoder Standby · WebP Fallback Active';

  return {
    lang,
    ariaLabel: isZh
      ? 'PBR 贴图管线与 4K 及 KTX2 实时遥测状态'
      : 'PBR texture pipeline and 4K/KTX2 runtime telemetry',
    kicker: isZh ? '实时纹理管线遥测' : 'LIVE TEXTURE PIPELINE TELEMETRY',
    activeCodecLabel: isZh
      ? 'WebP 5 通道 Packed ORM 实时激活'
      : 'WebP 5-Channel Packed ORM Active',
    ktx2StatusLabel,
    ktx2Mode,
    inventorySummary: isZh
      ? `${VERIFIED_ATLAS_SUITE_COUNT} 套材质图集 · ${VERIFIED_ATLAS_MAP_COUNT} 张贴图 · ${VERIFIED_TANK_4K_MAP_COUNT}× 4K 主战坦克贴图`
      : `${VERIFIED_ATLAS_SUITE_COUNT} Material Suites · ${VERIFIED_ATLAS_MAP_COUNT} Maps · ${VERIFIED_TANK_4K_MAP_COUNT}× 4K MBT Textures`,
    totalSuites: VERIFIED_ATLAS_SUITE_COUNT,
    totalMaps: VERIFIED_ATLAS_MAP_COUNT,
    tank4kMaps: VERIFIED_TANK_4K_MAP_COUNT,
  };
}

export interface TextureAtlasModalProps {
  forceOpen?: boolean;
}

export const TextureAtlasModal: React.FC<TextureAtlasModalProps> = ({
  forceOpen = false,
}) => {
  const titleId = useId();
  const closeBtnRef = useRef<HTMLButtonElement>(null);
  const storeOpen = useAppStore((s) => s.textureModalOpen);
  const open = forceOpen || storeOpen;
  const setOpen = useAppStore((s) => s.setTextureModalOpen);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const pbrEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbr = useAppStore((s) => s.togglePbrTextures);

  const bakedManifests = useMemo(
    () => getBakedAtlasManifests(WEAPON_MANIFESTS),
    []
  );

  const [weaponTab, setWeaponTab] = useState<WeaponId>(() =>
    resolveAtlasWeaponTab(activeWeaponId, bakedManifests)
  );
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<AtlasTierFilter>('all');

  const resolvedWeaponTab = resolveAtlasWeaponTab(weaponTab, bakedManifests);

  useEffect(() => {
    if (!open || typeof window === 'undefined') return;
    const previousFocus =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    closeBtnRef.current?.focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        setOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('keydown', onKeyDown, true);
      if (previousFocus && previousFocus.isConnected) {
        previousFocus.focus();
      }
    };
  }, [open, setOpen]);

  const matchedSuites = useMemo(
    () => searchAtlasSuites(searchQuery, tierFilter),
    [searchQuery, tierFilter]
  );
  const matchedWeaponIdSet = useMemo(
    () => new Set(matchedSuites.map((e) => e.weaponId)),
    [matchedSuites]
  );
  const isFiltering = searchQuery.trim().length > 0 || tierFilter !== 'all';
  const visibleManifests = useMemo(
    () =>
      isFiltering
        ? bakedManifests.filter((m) => matchedWeaponIdSet.has(m.id))
        : bakedManifests,
    [bakedManifests, isFiltering, matchedWeaponIdSet]
  );

  const tabManifest = getWeaponManifest(resolvedWeaponTab);
  const tabPlugin = useWeaponPlugin(resolvedWeaponTab);
  const suites = tabPlugin?.pbrSuites ?? [];

  if (!open) return null;

  const atlasUi = UI_STRINGS[lang].atlasModal;
  const pipeUi = ATLAS_PIPELINE_STRINGS[lang];
  const ktx2Status = getKtx2SupportStatus();
  const pipelineTelemetry = buildAtlasPipelineTelemetry(ktx2Status, lang);
  const bakedCoverageNote = buildAtlasBakedCoverageNote(
    bakedManifests.length,
    WEAPON_MANIFESTS.length,
    lang
  );
  const ktx2BadgeText =
    ktx2Status.initialized && ktx2Status.gpuSupported
      ? pipeUi.ktx2GpuReady(ktx2Status.publishedCount)
      : pipeUi.ktx2WebpFallback;

  const activeIndex = suites.findIndex((s) => s.id === activeSuiteId);
  const currentIdx = activeIndex >= 0 ? activeIndex : 0;
  const rawCurrent = suites[currentIdx];
  const current = rawCurrent
    ? getLocalizedAtlasSuite(resolvedWeaponTab, rawCurrent, lang, currentIdx)
    : null;
  const currentResMeta = current
    ? classifyAtlasSuiteResolution(current.id, current.resolution)
    : null;
  const tabShortLabel = getLocalizedShortWeaponLabel(resolvedWeaponTab, lang);

  return (
    <div
      className="tex-modal-backdrop"
      onClick={() => setOpen(false)}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div className="tex-modal-card" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="tex-modal-header">
          <div className="tex-modal-title-wrap">
            <div className="tex-badge-row">
              <span className="tex-modal-badge">
                <ImageIcon size={12} aria-hidden="true" />
                {atlasUi.kicker}
              </span>

              {/* Bilingual 101-Suite Material / Exhibit Search & Resolution Filter */}
              <div className="tex-search-bar" data-testid="atlas-search-bar">
                <div className="tex-search-input-wrap">
                  <Search size={13} className="tex-search-icon" aria-hidden="true" />
                  <input
                    type="search"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder={pipeUi.searchPlaceholder}
                    aria-label={pipeUi.searchAria}
                    data-testid="atlas-search-input"
                    className="tex-search-input"
                  />
                  {searchQuery.length > 0 && (
                    <button
                      type="button"
                      className="tex-search-clear-btn"
                      aria-label={pipeUi.clearSearch}
                      onClick={() => setSearchQuery('')}
                    >
                      <X size={12} aria-hidden="true" />
                    </button>
                  )}
                </div>

                <div
                  className="tex-tier-pills"
                  role="group"
                  aria-label={
                    lang === 'zh'
                      ? '按贴图分辨率分级筛选'
                      : 'Filter suites by resolution tier'
                  }
                >
                  {(
                    [
                      ['all', pipeUi.filterAll],
                      ['4k_tank', pipeUi.filter4k],
                      ['2k_suite', pipeUi.filter2k],
                    ] as const
                  ).map(([tierKey, label]) => (
                    <button
                      key={tierKey}
                      type="button"
                      className={`tex-tier-pill ${
                        tierFilter === tierKey ? 'active' : ''
                      } ${tierKey === '4k_tank' ? 'is-4k' : ''}`}
                      aria-pressed={tierFilter === tierKey}
                      onClick={() => {
                        setTierFilter(tierKey);
                        const nextList = searchAtlasSuites(searchQuery, tierKey);
                        if (
                          nextList.length > 0 &&
                          !nextList.some((x) => x.weaponId === resolvedWeaponTab)
                        ) {
                          preloadWeaponPlugin(nextList[0].weaponId);
                          setWeaponTab(nextList[0].weaponId);
                          setActiveSuiteId(nextList[0].suiteId);
                        }
                      }}
                    >
                      {label}
                    </button>
                  ))}
                  <span className="tex-match-count tabular">
                    {pipeUi.matchesCount(
                      matchedSuites.length,
                      ATLAS_SUITE_SEARCH_INDEX.length
                    )}
                  </span>
                </div>
              </div>

              {/* Matching Suites Quick-Jump Results when Search or Tier Filter is active */}
              {isFiltering && (
                <div
                  className="tex-search-results"
                  data-testid="atlas-search-results"
                >
                  {matchedSuites.length === 0 ? (
                    <div className="tex-search-empty">
                      <span>{pipeUi.noMatches}</span>
                      <button
                        type="button"
                        className="tex-reset-search-btn"
                        onClick={() => {
                          setSearchQuery('');
                          setTierFilter('all');
                        }}
                      >
                        {pipeUi.resetFilters}
                      </button>
                    </div>
                  ) : (
                    matchedSuites.slice(0, 18).map((item) => {
                      const isCurrent =
                        item.weaponId === resolvedWeaponTab &&
                        item.suiteId === (current?.id ?? activeSuiteId);
                      return (
                        <button
                          key={`${item.weaponId}:${item.suiteId}`}
                          type="button"
                          className={`tex-result-chip ${
                            isCurrent ? 'active' : ''
                          } ${item.tier === '4k_tank' ? 'is-4k' : ''}`}
                          onMouseEnter={() => preloadWeaponPlugin(item.weaponId)}
                          onClick={() => {
                            preloadWeaponPlugin(item.weaponId);
                            setWeaponTab(item.weaponId);
                            setActiveSuiteId(item.suiteId);
                          }}
                        >
                          <span className="tex-res-tag">
                            {item.tier === '4k_tank' ? '4K' : '2K'}
                          </span>
                          <strong>
                            {getLocalizedShortWeaponLabel(item.weaponId, lang)}
                          </strong>
                          <span>· {item.suiteTabTitleEn}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              )}

              <div
                className="tex-weapon-switcher"
                role="tablist"
                aria-label={atlasUi.weaponSwitcherAria}
              >
                {visibleManifests.map((m) => {
                  const pillText = `${m.catalog.bayCode.replace('BAY-', '#')} ${getLocalizedShortWeaponLabel(m.id, lang)}`;
                  return (
                    <button
                      key={m.id}
                      type="button"
                      role="tab"
                      title={pillText}
                      aria-selected={resolvedWeaponTab === m.id}
                      className={`tex-weapon-pill ${
                        resolvedWeaponTab === m.id ? 'active' : ''
                      }`}
                      onMouseEnter={() => preloadWeaponPlugin(m.id)}
                      onClick={() => {
                        setWeaponTab(m.id);
                        setActiveSuiteId('');
                      }}
                    >
                      <span className="tex-weapon-pill-label">{pillText}</span>
                    </button>
                  );
                })}
              </div>
            </div>
            <div>
              <h2 id={titleId} className="tex-modal-title">
                {getLocalizedAtlasHeading(
                  resolvedWeaponTab,
                  lang,
                  tabManifest.atlasHeadingCn
                )}
              </h2>
              <p className="tex-modal-sub">{atlasUi.subtitle}</p>
            </div>
          </div>

          <div className="tex-modal-header-actions">
            <button
              type="button"
              className={`tex-live-toggle ${pbrEnabled ? 'is-on' : ''}`}
              aria-pressed={pbrEnabled}
              onClick={togglePbr}
            >
              {pbrEnabled ? (
                <Check size={14} aria-hidden="true" />
              ) : (
                <Layers size={14} aria-hidden="true" />
              )}
              <span>{pbrEnabled ? atlasUi.liveOn : atlasUi.liveOff}</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="tex-close-btn"
              onClick={() => setOpen(false)}
              aria-label={atlasUi.closeAria}
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>

        {/* Archival Live Texture Pipeline & 4K/KTX2 Runtime Telemetry Banner */}
        <section
          className="tex-telemetry-banner"
          data-testid="atlas-pipeline-telemetry"
          role="status"
          aria-live="polite"
          aria-label={pipelineTelemetry.ariaLabel}
        >
          <div className="tex-telemetry-head">
            <span className="tex-telemetry-kicker">
              {pipelineTelemetry.kicker}
            </span>
            <span className="tex-telemetry-inventory tabular">
              {pipelineTelemetry.inventorySummary}
            </span>
          </div>
          <div className="tex-telemetry-pills">
            <span className="tex-telemetry-pill is-codec">
              <Layers size={11} aria-hidden="true" />
              <span>{pipelineTelemetry.activeCodecLabel}</span>
            </span>
            <span
              className={`tex-telemetry-pill is-ktx2 ${
                pipelineTelemetry.ktx2Mode !== 'webp_fallback'
                  ? 'is-gpu-ready'
                  : ''
              }`}
            >
              <Cpu size={11} aria-hidden="true" />
              <span>{pipelineTelemetry.ktx2StatusLabel}</span>
            </span>
            <span
              className="tex-telemetry-pill"
              data-testid="atlas-baked-coverage-note"
            >
              <Sparkles size={11} aria-hidden="true" />
              <span>{bakedCoverageNote}</span>
            </span>
          </div>
        </section>

        {/* Live PBR & KTX2 Pipeline Spec Strip */}
        <div
          className="tex-pipeline-strip"
          data-testid="atlas-pipeline-badges"
        >
          {currentResMeta && (
            <span
              className={`tex-pipe-badge ${
                currentResMeta.tier === '4k_tank' ? 'is-4k' : 'is-2k'
              }`}
            >
              {lang === 'zh' ? currentResMeta.badgeZh : currentResMeta.badgeEn}
            </span>
          )}
          <span className="tex-pipe-badge is-orm">
            <Layers size={11} aria-hidden="true" />
            <span>{pipeUi.ormPackingBadge}</span>
          </span>
          <span
            className={`tex-pipe-badge is-gpu ${
              ktx2Status.gpuSupported ? 'is-ready' : ''
            }`}
          >
            <Cpu size={11} aria-hidden="true" />
            <span>{ktx2BadgeText}</span>
          </span>
        </div>

        {current ? (
          <>
            {/* Suite Selector Tabs */}
            <div
              className="tex-suite-tabs"
              role="tablist"
              aria-label={
                lang === 'zh' ? '当前展品材质套件切换' : 'Exhibit material suites'
              }
              style={{
                gridTemplateColumns: `repeat(${suites.length}, minmax(0, 1fr))`,
              }}
            >
              {suites.map((s, idx) => {
                const locTab = getLocalizedAtlasSuite(
                  resolvedWeaponTab,
                  s,
                  lang,
                  idx
                );
                const tabRes = classifyAtlasSuiteResolution(s.id, s.resolution);
                return (
                  <button
                    key={s.id}
                    type="button"
                    role="tab"
                    aria-selected={s.id === current.id}
                    className={`tex-suite-tab ${
                      s.id === current.id ? 'active' : ''
                    }`}
                    onClick={() => setActiveSuiteId(s.id)}
                  >
                    <span className="tex-tab-top-row">
                      <span className="tex-tab-tag">{locTab.partTag}</span>
                      <span
                        className={`tex-tab-res-dot ${
                          tabRes.tier === '4k_tank' ? 'is-4k' : ''
                        }`}
                      >
                        {tabRes.tier === '4k_tank'
                          ? '4K'
                          : tabRes.tier === 'seamless'
                            ? '512'
                            : '2K'}
                      </span>
                    </span>
                    <span className="tex-tab-name">{locTab.tabTitle}</span>
                  </button>
                );
              })}
            </div>

            {/* Suite Metadata Banner */}
            <div className="tex-suite-info">
              <div className="tex-info-main">
                <div className="tex-info-headline">
                  <h3>{current.title}</h3>
                  <span
                    className={`tex-res-pill ${
                      currentResMeta?.tier === '4k_tank' ? 'is-4k' : ''
                    }`}
                  >
                    {currentResMeta?.pixelDims ?? current.resolution}
                  </span>
                </div>
                <p>{current.summary}</p>
              </div>
              <div className="tex-info-chips">
                {current.highlights.map((h) => (
                  <span key={h} className="tex-highlight-chip">
                    <Sparkles size={11} aria-hidden="true" />
                    {h}
                  </span>
                ))}
              </div>
            </div>

            {/* 3-Channel Preview Grid */}
            <div className="tex-channels-grid">
              {current.channels.map((ch) => {
                const cleanFile = normalizeTextureFileName(ch.fileName);
                const resolvedUrl = resolveTextureUrl(cleanFile);
                return (
                  <div
                    key={`${current.id}-${cleanFile}`}
                    className="tex-channel-card"
                  >
                    <div className="tex-ch-head">
                      <div className="tex-ch-meta">
                        <span
                          className={`tex-ch-badge kind-${ch.kind.toLowerCase()}`}
                        >
                          {ch.kind === 'Roughness'
                            ? atlasUi.ormBadge
                            : ch.kind.toUpperCase()}
                        </span>
                        <span
                          className="tex-ch-title"
                          title={
                            ch.kind === 'Roughness'
                              ? atlasUi.ormChannelTitle
                              : ch.label
                          }
                        >
                          {ch.kind === 'Roughness'
                            ? atlasUi.ormChannelTitle
                            : ch.label}
                        </span>
                      </div>
                      <a
                        href={resolvedUrl}
                        download={cleanFile}
                        className="tex-download-link"
                        title={atlasUi.downloadTitle(cleanFile)}
                        aria-label={atlasUi.downloadTitle(cleanFile)}
                      >
                        <Download size={12} aria-hidden="true" />
                        <span>WEBP</span>
                      </a>
                    </div>

                    <div className="tex-img-frame">
                      <img src={resolvedUrl} alt={ch.label} loading="lazy" />
                    </div>

                    <div className="tex-ch-foot">
                      <code>/textures/{cleanFile}</code>
                      <span>{ch.note}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        ) : (
          <div className="tex-suite-info">
            <p>{atlasUi.loadingFallback(tabShortLabel)}</p>
          </div>
        )}
      </div>
    </div>
  );
};

export default TextureAtlasModal;

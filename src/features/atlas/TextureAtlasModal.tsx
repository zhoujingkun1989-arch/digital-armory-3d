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
import type { WeaponId } from '../../weapons/types';
import '../../styles/atlas-modal.css';

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
    searchPlaceholder: '搜索全馆 101+ 套贴图（如 4K / 胡桃木 / 装甲 / ZTZ / 弹鼓 / 防磁）...',
    searchAria: '按展品或材质关键词检索 PBR 贴图套件',
    clearSearch: '清除检索',
    filterAll: '全部套件',
    filter4k: '4K 主战坦克 (8)',
    filter2k: '2K 精雕套件',
    matchesCount: (shown, total) => `${shown} / ${total} 套贴图`,
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
    searchPlaceholder:
      'Search 101+ PBR suites (e.g. 4K, walnut, ERA, zimmerit, GAU-8, chrome)...',
    searchAria: 'Filter PBR texture suites by exhibit or material keyword',
    clearSearch: 'Clear search',
    filterAll: 'All Suites',
    filter4k: '4K Tank Atlas (8)',
    filter2k: '2K Suites',
    matchesCount: (shown, total) => `${shown} / ${total} suites`,
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

  const [weaponTab, setWeaponTab] = useState<WeaponId>(activeWeaponId);
  const [activeSuiteId, setActiveSuiteId] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [tierFilter, setTierFilter] = useState<AtlasTierFilter>('all');

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
        ? WEAPON_MANIFESTS.filter((m) => matchedWeaponIdSet.has(m.id))
        : WEAPON_MANIFESTS,
    [isFiltering, matchedWeaponIdSet]
  );

  const tabManifest = getWeaponManifest(weaponTab);
  const tabPlugin = useWeaponPlugin(weaponTab);
  const suites = tabPlugin?.pbrSuites ?? [];

  if (!open) return null;

  const atlasUi = UI_STRINGS[lang].atlasModal;
  const pipeUi = ATLAS_PIPELINE_STRINGS[lang];
  const ktx2Status = getKtx2SupportStatus();
  const ktx2BadgeText =
    ktx2Status.initialized && ktx2Status.gpuSupported
      ? pipeUi.ktx2GpuReady(ktx2Status.publishedCount)
      : pipeUi.ktx2WebpFallback;

  const activeIndex = suites.findIndex((s) => s.id === activeSuiteId);
  const currentIdx = activeIndex >= 0 ? activeIndex : 0;
  const rawCurrent = suites[currentIdx];
  const current = rawCurrent
    ? getLocalizedAtlasSuite(weaponTab, rawCurrent, lang, currentIdx)
    : null;
  const currentResMeta = current
    ? classifyAtlasSuiteResolution(current.id, current.resolution)
    : null;
  const tabShortLabel = getLocalizedShortWeaponLabel(weaponTab, lang);

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
                <ImageIcon size={12} />
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

                <div className="tex-tier-pills" role="group" aria-label={pipeUi.searchAria}>
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
                          !nextList.some((x) => x.weaponId === weaponTab)
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
                        item.weaponId === weaponTab &&
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
                {visibleManifests.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    className={`tex-weapon-pill ${
                      weaponTab === m.id ? 'active' : ''
                    }`}
                    onMouseEnter={() => preloadWeaponPlugin(m.id)}
                    onClick={() => {
                      setWeaponTab(m.id);
                      setActiveSuiteId('');
                    }}
                  >
                    {m.catalog.bayCode.replace('BAY-', '#')}{' '}
                    {getLocalizedShortWeaponLabel(m.id, lang)}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <h2 id={titleId} className="tex-modal-title">
                {getLocalizedAtlasHeading(
                  weaponTab,
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
              onClick={togglePbr}
            >
              {pbrEnabled ? <Check size={14} /> : <Layers size={14} />}
              <span>{pbrEnabled ? atlasUi.liveOn : atlasUi.liveOff}</span>
            </button>

            <button
              ref={closeBtnRef}
              type="button"
              className="tex-close-btn"
              onClick={() => setOpen(false)}
              aria-label={atlasUi.closeAria}
            >
              <X size={16} />
            </button>
          </div>
        </div>

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
              style={{
                gridTemplateColumns: `repeat(${suites.length}, minmax(0, 1fr))`,
              }}
            >
              {suites.map((s, idx) => {
                const locTab = getLocalizedAtlasSuite(weaponTab, s, lang, idx);
                const tabRes = classifyAtlasSuiteResolution(s.id, s.resolution);
                return (
                  <button
                    key={s.id}
                    type="button"
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
                    <Sparkles size={11} />
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
                      >
                        <Download size={12} />
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

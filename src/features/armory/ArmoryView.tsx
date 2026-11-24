import React, {
  Suspense,
  lazy,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  Aperture,
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Droplets,
  Eye,
  EyeOff,
  FlaskConical,
  Gauge,
  GitCompareArrows,
  Globe2,
  HardDrive,
  Headphones,
  Image as ImageIcon,
  Layers,
  Lightbulb,
  Maximize2,
  Menu,
  Minimize2,
  Moon,
  MousePointerClick,
  Orbit,
  Palette,
  Printer,
  Rotate3d,
  Ruler,
  Scissors,
  Search,
  Share2,
  Shield,
  SlidersHorizontal,
  Sparkles,
  Sun,
  Wrench,
  X,
} from 'lucide-react';
import { useDialogAccessibility } from '../../app/useDialogAccessibility';
import { useBrowserFullscreen } from '../../app/useFullscreen';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { WEAPON_RIFLING_SPECS } from '../../engine/ballistics/riflingSpecs';
import { scheduleHudBoundsRefresh } from '../../engine/callout/hudBoundsCache';
import {
  ARMORY_ENVIRONMENT_PRESETS,
  type ArmoryEnvironmentPreset,
} from '../../engine/canvas/GunsmithStageMat';
import { GRAPHICS_QUALITY_TIERS } from '../../engine/canvas/graphicsQuality';
import { useWeaponExamSummary } from '../../engine/exam/armorerExamStore';
import {
  ARMORY_WEAR_PRESETS,
  resolveWearPresetFromLevel,
} from '../../engine/materials/armoryShader';
import {
  isArcheryWeapon,
  isTankWeapon,
} from '../../engine/physics/armoryPhysics';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  getLocalizedShortWeaponLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import {
  getLoadedNarrationBundle,
  preloadWeaponNarration,
  useWeaponNarration,
} from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { ARMORY_WEAPONS, matchesArmoryCategory } from '../../weapons/manifests';
import {
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_TIMELINE_SPAN_ASCII,
  resolveArmorLabPresetForWeapon,
} from '../../weapons/museumMetrics';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type {
  ArmoryCategory,
  ArmoryWeaponItem,
  WeaponId,
} from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { isMacLikePlatform } from '../workbench/CommandPaletteModal';
import { EngineeringTintLegend } from '../workbench/EngineeringTintLegend';
import type { ShowdownViewMode } from './MechanismShowdownModal';
import {
  consumePendingShowdownLaunch,
  getShowdownExhibitProfile,
  getSuggestedRivalWeaponId,
} from './mechanismShowdownSpecs';
import { WeaponSilhouetteSvg } from './WeaponSilhouetteSvg';

const LazyMechanismShowdownModal = lazy(
  () => import('./MechanismShowdownModal')
);

/**
 * Keeps the desktop Armory header wordmark crisp beside the `DIGITAL ARMORY`
 * badge in English (eliminating duplicate "Digital Armory" truncation while
 * preserving the full localized Chinese title).
 */
export function resolveArmoryHeaderDesktopTitle(
  lang: LanguageCode,
  fallbackTitle: string
): string {
  return lang === 'en' ? '3D Vault' : fallbackTitle;
}

type ArmoryFilterKey = ArmoryCategory | 'lmg';

const CATEGORY_KEYS: readonly ArmoryFilterKey[] = [
  'all',
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

function matchesCategoryWithLmg(
  item: ArmoryWeaponItem,
  filter: ArmoryFilterKey
): boolean {
  if (filter === 'all') return true;
  const typeTag = `${item.weaponTypeCn ?? ''} ${item.categoryCn}`;
  const isLmg =
    (item.id as string) === 'm249' ||
    (item.category as string) === 'lmg' ||
    typeTag.includes('机枪');
  if (filter === 'lmg') return isLmg;
  if (filter === 'assault' && isLmg) return false;
  return matchesArmoryCategory(item, filter as ArmoryCategory);
}

const ARMORY_ENV_ICONS: Record<ArmoryEnvironmentPreset, React.ReactNode> = {
  tactical_vault: <Moon size={12} aria-hidden="true" />,
  gunsmith_bench: <Lightbulb size={12} aria-hidden="true" />,
  blueprint_daylight: <Sun size={12} aria-hidden="true" />,
};

export function resolveArmoryPlaqueStrings(
  weaponId: WeaponId,
  category: ArmoryWeaponItem['category'],
  armoryUi: (typeof UI_STRINGS)['zh']['armory']
) {
  if (isArcheryWeapon(weaponId) || category === 'archery') {
    return armoryUi.archeryPlaque;
  }
  if (isTankWeapon(weaponId) || category === 'armor') {
    return armoryUi.tankPlaque;
  }
  if (category === 'ordnance' || weaponId === 'gau8') {
    return armoryUi.ordnancePlaque;
  }
  return armoryUi;
}

export const ARMORY_HOVER_PRELOAD_DEBOUNCE_MS = 180;

interface ArmoryRackBayCardProps {
  item: ArmoryWeaponItem;
  isOnTurntable: boolean;
  lang: LanguageCode;
  ui: (typeof UI_STRINGS)['zh']['armory'];
  onCardClick: (item: ArmoryWeaponItem, el: HTMLDivElement) => void;
  onEnterWorkbench: (weaponId: WeaponId) => void;
}

export const ArmoryRackBayCard = React.memo<ArmoryRackBayCardProps>(
  ({
    item,
    isOnTurntable,
    lang,
    ui,
    onCardClick,
    onEnterWorkbench,
  }) => {
    const examSummary = useWeaponExamSummary(item.id);
    const hoverPreloadTimerRef = useRef<number | null>(null);
    const itemMeta = resolveWeaponDisplayMeta(
      item.id,
      lang,
      getLoadedNarrationBundle(item.id)
    );

    const clearHoverPreload = useCallback(() => {
      if (hoverPreloadTimerRef.current !== null) {
        window.clearTimeout(hoverPreloadTimerRef.current);
        hoverPreloadTimerRef.current = null;
      }
    }, []);

    const scheduleHoverPreload = useCallback(() => {
      if (!item.available) return;
      clearHoverPreload();
      hoverPreloadTimerRef.current = window.setTimeout(() => {
        hoverPreloadTimerRef.current = null;
        preloadWeaponPlugin(item.id);
        preloadWeaponNarration(item.id);
      }, ARMORY_HOVER_PRELOAD_DEBOUNCE_MS);
    }, [clearHoverPreload, item.available, item.id]);

    useEffect(() => clearHoverPreload, [clearHoverPreload]);

    return (
      <div
        role="button"
        tabIndex={0}
        className={`armory-weapon-card bay-card ${
          item.available ? 'is-ready' : 'is-planned'
        } ${item.category === 'armor' || item.category === 'ordnance' ? 'is-armor-card' : ''} ${
          isOnTurntable ? 'is-on-turntable' : ''
        }`}
        onMouseEnter={scheduleHoverPreload}
        onMouseLeave={clearHoverPreload}
        onFocus={scheduleHoverPreload}
        onBlur={clearHoverPreload}
        onClick={(e) => onCardClick(item, e.currentTarget)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onCardClick(item, e.currentTarget);
          }
        }}
      >
        <div className="wcard-top-row">
          <span className="wcard-bay">{item.bayCode}</span>
          <span className="wcard-origin-tag">{itemMeta.originTag}</span>
          {examSummary.isCertified && examSummary.overallRank && (
            <span
              className={`wcard-rank-badge rank-${examSummary.overallRank}`}
              title={ui.certRackTitle(examSummary.overallRank)}
            >
              <span className="wcard-rank-letter">{examSummary.overallRank}</span>
              <span className="wcard-rank-stars" aria-hidden="true">
                {'★'.repeat(examSummary.stars)}
              </span>
            </span>
          )}
          {item.available ? (
            <span
              className={`wcard-status ${
                isOnTurntable ? 'turntable-active' : 'ready'
              }`}
            >
              {isOnTurntable ? (
                <>
                  <Rotate3d size={10} />
                  <span>{ui.previewingBadge}</span>
                </>
              ) : (
                <span className="live-dot" title={itemMeta.statusLabel} />
              )}
            </span>
          ) : (
            <span className="wcard-status planned">
              <Clock size={10} />
              <span>{ui.plannedBadge}</span>
            </span>
          )}
        </div>

        <div className="wcard-silhouette-box">
          <WeaponSilhouetteSvg id={item.id} available={item.available} />
        </div>

        <div className="wcard-body">
          <div className="wcard-title-row">
            <span className="wcard-name">{itemMeta.name}</span>
          </div>
          <div className="wcard-meta">
            <span className="wcard-caliber" title={itemMeta.caliber}>
              {itemMeta.compactCaliber}
            </span>
            <span className="wcard-parts-pill">
              {lang === 'zh'
                ? `${item.partsCount} 零件`
                : `${item.partsCount} Parts`}
            </span>
          </div>
        </div>

        <div className="wcard-footer">
          {item.available ? (
            <button
              type="button"
              className={`wcard-enter-cta-btn ${
                isOnTurntable ? 'is-stage-active' : ''
              }`}
              title={ui.cardEnterCta}
              onClick={(e) => {
                e.stopPropagation();
                onEnterWorkbench(item.id);
              }}
            >
              <span className="wcard-spec-tag">{itemMeta.actionMechanism}</span>
              <span className="wcard-enter-cue">
                <span>{ui.cardCompactCta}</span>
                <ArrowRight size={11} aria-hidden="true" />
              </span>
            </button>
          ) : (
            <span className="wcard-planned-note">{itemMeta.actionMechanism}</span>
          )}
        </div>
      </div>
    );
  }
);
ArmoryRackBayCard.displayName = 'ArmoryRackBayCard';

export interface ArmoryViewProps {
  /** Optional exhibit override for deterministic SSR/unit verification */
  weaponIdOverride?: WeaponId;
  /** Optional language override for deterministic SSR/unit verification */
  langOverride?: LanguageCode;
}

export const ArmoryView: React.FC<ArmoryViewProps> = ({
  weaponIdOverride,
  langOverride,
}) => {
  const [category, setCategory] = useState<ArmoryFilterKey>('all');
  const [plannedToast, setPlannedToast] = useState<string | null>(null);
  const [showdownRequest, setShowdownRequest] = useState<{
    mode: ShowdownViewMode;
    weaponA: string;
    weaponB: string;
  } | null>(() => consumePendingShowdownLaunch());
  const [openPopover, setOpenPopover] = useState<'labs' | 'display' | null>(
    null
  );
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState<boolean>(false);
  const [canScrollHallsRight, setCanScrollHallsRight] = useState<boolean>(true);

  const rackScrollRef = useRef<HTMLDivElement>(null);
  const hallsScrollRef = useRef<HTMLDivElement>(null);
  const labsPopoverRef = useRef<HTMLDivElement>(null);
  const displayPopoverRef = useRef<HTMLDivElement>(null);
  const mobileDrawerRef = useRef<HTMLDivElement>(null);
  const mobileDrawerTitleId = useId();

  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const storeLang = useAppStore((s) => s.lang);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const lang = langOverride ?? storeLang;
  const storyOpen = useAppStore((s) => s.storyOpen);
  const toggleStoryOpen = useAppStore((s) => s.toggleStoryOpen);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const openShowcase = useAppStore((s) => s.openShowcase);
  const openCartridgeLab = useAppStore((s) => s.openCartridgeLab);
  const openExternalBallistics = useAppStore((s) => s.openExternalBallistics);
  const openPosterModal = useAppStore((s) => s.openPosterModal);
  const openCommandPalette = useAppStore((s) => s.openCommandPalette);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const toggleArmoryAutoRotate = useAppStore((s) => s.toggleArmoryAutoRotate);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const toggleEngineeringTint = useAppStore((s) => s.toggleEngineeringTint);
  const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbrTextures = useAppStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);
  const openMonographModal = useAppStore((s) => s.openMonographModal);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const setEnvironmentPreset = useAppStore((s) => s.setEnvironmentPreset);
  const postFxEnabled = useAppStore((s) => s.postFxEnabled);
  const togglePostFx = useAppStore((s) => s.togglePostFx);
  const weaponWearLevel = useAppStore((s) => s.weaponWearLevel);
  const setWeaponWearPreset = useAppStore((s) => s.setWeaponWearPreset);
  const graphicsQuality = useAppStore((s) => s.graphicsQuality);
  const setGraphicsQuality = useAppStore((s) => s.setGraphicsQuality);
  const hudHidden = useAppStore((s) => s.hudHidden);
  const setHudHidden = useAppStore((s) => s.setHudHidden);

  const { isFullscreen, isSupported, toggleFullscreen } =
    useBrowserFullscreen();

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const { bundle: featuredBundle } = useWeaponNarration(featuredWeapon.id);
  const featuredExam = useWeaponExamSummary(featuredWeapon.id);

  const ui = UI_STRINGS[lang].armory;
  const studioUi = UI_STRINGS[lang].studio;
  const monoUi = UI_STRINGS[lang].monograph;
  const showdownUi = UI_STRINGS[lang].mechanismShowdown;
  const cmdUi = COMMAND_PALETTE_STRINGS[lang];
  const menuUi = cmdUi.workbenchMenus;
  const kbdHint = isMacLikePlatform()
    ? cmdUi.trigger.kbdMac
    : cmdUi.trigger.kbdOther;
  const plaqueUi = resolveArmoryPlaqueStrings(
    featuredWeapon.id,
    featuredWeapon.category,
    ui
  );
  const featuredDisplay = resolveWeaponDisplayMeta(
    featuredWeapon.id,
    lang,
    featuredBundle
  );
  const shortWeaponTag = getLocalizedShortWeaponLabel(featuredWeapon.id, lang);
  const suggestedRivalId = getSuggestedRivalWeaponId(featuredWeapon.id);
  const suggestedRivalShort = getShowdownExhibitProfile(
    suggestedRivalId,
    lang
  ).shortLabel;
  const activeWearPreset = resolveWearPresetFromLevel(weaponWearLevel);
  const hasCustomDisplaySetting =
    activeWearPreset !== 'field_oiled' ||
    !postFxEnabled ||
    graphicsQuality !== 'ultra';
  const activePopover = hudHidden ? null : openPopover;
  const isMobileDrawerOpen = mobileDrawerOpen && !hudHidden;

  useDialogAccessibility({
    isOpen: isMobileDrawerOpen,
    containerRef: mobileDrawerRef,
    onClose: () => setMobileDrawerOpen(false),
  });

  useEffect(() => {
    if (!activePopover) return;
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      const inLabs = labsPopoverRef.current?.contains(target) ?? false;
      const inDisplay = displayPopoverRef.current?.contains(target) ?? false;
      if (!inLabs && !inDisplay) {
        setOpenPopover(null);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setOpenPopover(null);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown, true);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown, true);
    };
  }, [activePopover]);

  const handleFullscreenClick = useCallback(async () => {
    playWorkbenchFoley('toggle_switch');
    setOpenPopover(null);
    setMobileDrawerOpen(false);
    if (!isSupported) {
      setHudHidden(true);
      return;
    }
    const wasFullscreen = isFullscreen;
    const activeAfter = await toggleFullscreen();
    if (!wasFullscreen && !activeAfter) {
      setHudHidden(true);
    }
  }, [isFullscreen, isSupported, setHudHidden, toggleFullscreen]);

  const storyMenuLabel =
    isArcheryWeapon(featuredWeapon.id) && lang === 'zh'
      ? '弓弩研发故事'
      : isTankWeapon(featuredWeapon.id) && lang === 'zh'
        ? '坦克研发故事'
        : featuredWeapon.category === 'ordnance' && lang === 'zh'
          ? '航炮研发故事'
          : ui.storyBtn;

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [category, lang]);

  useEffect(() => {
    const el = hallsScrollRef.current;
    if (!el) return;
    const syncScrollCue = () => {
      const remaining = el.scrollWidth - el.scrollLeft - el.clientWidth;
      setCanScrollHallsRight(remaining > 6);
    };
    syncScrollCue();
    el.addEventListener('scroll', syncScrollCue, { passive: true });
    window.addEventListener('resize', syncScrollCue, { passive: true });
    return () => {
      el.removeEventListener('scroll', syncScrollCue);
      window.removeEventListener('resize', syncScrollCue);
    };
  }, [lang]);

  // Armory keyboard shortcut `[S]` opens Mechanism Showdown without conflicting with `[M]` (SFX mute)
  useEffect(() => {
    if (showdownRequest !== null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.metaKey || e.ctrlKey || e.altKey) return;
      const target = e.target;
      if (
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      ) {
        return;
      }
      const s = useAppStore.getState();
      if (
        s.screen !== 'armory' ||
        s.textureModalOpen ||
        s.monographModalOpen ||
        s.posterShareModalOpen ||
        s.hudHidden
      ) {
        return;
      }
      if (e.key.toLowerCase() === 's') {
        e.preventDefault();
        playWorkbenchFoley('preset_detent');
        setShowdownRequest({
          mode: 'matrix',
          weaponA: featuredWeapon.id,
          weaponB: suggestedRivalId,
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [showdownRequest, featuredWeapon.id, suggestedRivalId]);

  const categoryCounts = useMemo(() => {
    const map: Record<ArmoryFilterKey, number> = {} as Record<
      ArmoryFilterKey,
      number
    >;
    for (const key of CATEGORY_KEYS) {
      map[key] = ARMORY_WEAPONS.filter((w) =>
        matchesCategoryWithLmg(w, key)
      ).length;
    }
    return map;
  }, []);

  const filteredWeapons = useMemo(
    () => ARMORY_WEAPONS.filter((w) => matchesCategoryWithLmg(w, category)),
    [category]
  );

  const scrollRackBy = (dir: -1 | 1) => {
    if (!rackScrollRef.current) return;
    rackScrollRef.current.scrollBy({
      left: dir * 480,
      behavior: 'smooth',
    });
  };

  const handleCardBodyClick = useCallback(
    (item: ArmoryWeaponItem, cardEl?: HTMLDivElement | null) => {
      if (cardEl) {
        cardEl.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }
      if (item.available) {
        const currentActiveId = useAppStore.getState().activeWeaponId;
        if (item.id !== currentActiveId) {
          selectArmoryWeapon(item.id);
        } else {
          enterWorkbench(item.id);
        }
        return;
      }
      const cardMeta = resolveWeaponDisplayMeta(
        item.id,
        lang,
        getLoadedNarrationBundle(item.id)
      );
      const msg = ui.plannedToast(cardMeta.name);
      setPlannedToast(msg);
      window.setTimeout(() => {
        setPlannedToast((prev) => (prev === msg ? null : prev));
      }, 3000);
    },
    [enterWorkbench, lang, selectArmoryWeapon, ui]
  );

  const closeMenus = () => {
    setOpenPopover(null);
    setMobileDrawerOpen(false);
  };

  const renderLabsPanelContent = () => (
    <>
      <div className="popover-section">
        <div className="popover-section-head">
          <FlaskConical size={12} aria-hidden="true" />
          <span>{ui.labsSectionPhysics}</span>
        </div>
        <div className="popover-chip-grid">
          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              closeMenus();
              openCartridgeLab();
            }}
            title={ui.cartridgeLabTitle}
          >
            <Layers size={13} aria-hidden="true" />
            <span>{ui.cartridgeLabBtn}</span>
            <kbd className="popover-kbd">B</kbd>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              closeMenus();
              openExternalBallistics();
            }}
            title={ui.ballisticsLabTitle}
          >
            <Crosshair size={13} aria-hidden="true" />
            <span>{ui.ballisticsLabBtn}</span>
            <kbd className="popover-kbd">R</kbd>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore
                .getState()
                .openArmorPenetrationModal(
                  resolveArmorLabPresetForWeapon(featuredWeapon.id)
                );
            }}
            title={
              lang === 'en'
                ? 'Open 1:1 Composite Armor Penetration Lab'
                : '打开 1:1 主战坦克复合装甲抗弹与穿甲实验室'
            }
          >
            <Shield size={13} aria-hidden="true" />
            <span>{lang === 'en' ? 'Armor Lab' : '穿甲抗弹台'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip armory-showdown-btn"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              setShowdownRequest({
                mode: 'matrix',
                weaponA: featuredWeapon.id,
                weaponB: suggestedRivalId,
              });
            }}
            title={showdownUi.entryBtnTitle}
          >
            <GitCompareArrows size={13} aria-hidden="true" />
            <span>{showdownUi.entryBtn}</span>
            <kbd className="popover-kbd">S</kbd>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openSplitShowdown(featuredWeapon.id);
            }}
            title={
              lang === 'en'
                ? 'Compare two exhibits live side-by-side in 3D viewports'
                : '进入双展品实时 3D 同屏剖视对比台'
            }
          >
            <GitCompareArrows size={13} aria-hidden="true" />
            <span>{lang === 'en' ? '3D Split' : '3D 同屏对比'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            data-testid="armory-scale-wall-btn"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openScaleWallModal();
            }}
            title={UI_STRINGS[lang].workbench.scaleWallChipTitle}
          >
            <Ruler size={13} aria-hidden="true" />
            <span>{lang === 'en' ? '1:1 Scale Wall' : '1:1 真实尺度墙'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            data-testid="armory-recoil-lab-btn"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openRecoilLab();
            }}
            title={UI_STRINGS[lang].workbench.recoilLabChipTitle}
          >
            <Gauge size={13} aria-hidden="true" />
            <span>{lang === 'en' ? 'Recoil Impulse Lab' : '后坐冲量实验室'}</span>
          </button>
        </div>
      </div>

      <div className="popover-section">
        <div className="popover-section-head">
          <BookOpen size={12} aria-hidden="true" />
          <span>{ui.labsSectionArchive}</span>
        </div>
        <div className="popover-chip-grid">
          <button
            type="button"
            className={`toggle-chip ${storyOpen ? 'active-cyan' : ''}`}
            onClick={() => {
              closeMenus();
              toggleStoryOpen();
            }}
            title={ui.storyBtnTitle}
          >
            <BookOpen size={13} aria-hidden="true" />
            <span>{storyMenuLabel}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openTimelineModal();
            }}
            title={
              lang === 'en'
                ? `Explore ${MUSEUM_TIMELINE_SPAN_ASCII} Mechanical Patent Lineage Timeline`
                : `打开 ${MUSEUM_TIMELINE_SPAN_ASCII} 全馆机械专利演化时间轴`
            }
          >
            <Clock size={13} aria-hidden="true" />
            <span>{lang === 'en' ? 'Timeline' : '演化时间轴'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openPassportModal();
            }}
            title={
              lang === 'en'
                ? `Open ${MUSEUM_EXHIBIT_COUNT}-Exhibit Armorer Certification Passport`
                : `打开全馆 ${MUSEUM_EXHIBIT_COUNT} 展品军械师资格护照`
            }
          >
            <Award size={13} aria-hidden="true" />
            <span>{lang === 'en' ? 'Passport' : '军械护照'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              closeMenus();
              openPosterModal({
                weaponId: featuredWeapon.id,
                armorerRank: featuredExam.overallRank,
              });
            }}
            title={ui.posterTitle}
          >
            <Share2 size={13} aria-hidden="true" />
            <span>{ui.posterBtn}</span>
            <kbd className="popover-kbd">U</kbd>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              closeMenus();
              openMonographModal(featuredWeapon.id);
            }}
            title={monoUi.entryChipTitle}
          >
            <Printer size={13} aria-hidden="true" />
            <span>{monoUi.entryChip}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              closeMenus();
              useAppStore.getState().openOfflineModal();
            }}
            title={
              lang === 'en'
                ? 'Manage Offline PWA Museum Storage & KTX2 Pipeline'
                : '打开 PWA 离线博物馆缓存与 KTX2 纹理状态中心'
            }
          >
            <HardDrive size={13} aria-hidden="true" />
            <span>{lang === 'en' ? 'Offline' : '离线中心'}</span>
          </button>

          <button
            type="button"
            className="toggle-chip"
            onClick={() => {
              closeMenus();
              openShowcase();
            }}
            title={ui.showcaseTitle}
          >
            <Sparkles size={13} aria-hidden="true" />
            <span>{ui.showcaseBtn}</span>
          </button>
        </div>
      </div>
    </>
  );

  const renderDisplayPanelContent = () => (
    <>
      <div className="popover-section">
        <div className="popover-section-head">
          {ARMORY_ENV_ICONS[environmentPreset]}
          <span>{ui.displayLightingHeading}</span>
        </div>
        <div
          className="popover-seg-row"
          role="group"
          aria-label={studioUi.envGroupAria}
        >
          {ARMORY_ENVIRONMENT_PRESETS.map((preset) => {
            const isActive = environmentPreset === preset;
            const copy = studioUi.presets[preset];
            return (
              <button
                key={preset}
                type="button"
                className={`popover-seg-btn ${isActive ? 'is-active' : ''} env-${preset}`}
                aria-pressed={isActive}
                title={copy.title}
                onClick={() => {
                  if (!isActive) {
                    playWorkbenchFoley('toggle_switch');
                    setEnvironmentPreset(preset);
                  }
                }}
              >
                {copy.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="popover-section">
        <div className="popover-section-head">
          <Droplets size={12} aria-hidden="true" />
          <span>{menuUi.studioWearHeading}</span>
        </div>
        <div
          className="popover-seg-row"
          role="group"
          aria-label={studioUi.wearGroupAria}
        >
          {ARMORY_WEAR_PRESETS.map((wearPreset) => {
            const isActive = activeWearPreset === wearPreset;
            const meta = studioUi.wearPresets[wearPreset];
            return (
              <button
                key={wearPreset}
                type="button"
                className={`popover-seg-btn ${isActive ? 'is-active' : ''} wear-${wearPreset}`}
                aria-pressed={isActive}
                title={meta.title}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setWeaponWearPreset(wearPreset);
                }}
              >
                {meta.label}
              </button>
            );
          })}
        </div>
      </div>

      <div className="popover-section">
        <div className="popover-section-head">
          <Gauge size={12} aria-hidden="true" />
          <span>{menuUi.studioQualityHeading}</span>
        </div>
        <div className="popover-seg-row">
          {GRAPHICS_QUALITY_TIERS.map((tier) => {
            const isActive = graphicsQuality === tier;
            return (
              <button
                key={tier}
                type="button"
                className={`popover-seg-btn ${isActive ? 'is-active' : ''}`}
                aria-pressed={isActive}
                title={studioUi.qualityTitle(tier)}
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  setGraphicsQuality(tier, true);
                }}
              >
                {studioUi.qualityLabels[tier]}
              </button>
            );
          })}
        </div>
      </div>

      <div className="popover-section popover-section-inline">
        <div className="popover-inline-copy">
          <div className="popover-section-head">
            <Aperture size={12} aria-hidden="true" />
            <span>{menuUi.studioPostFxHeading}</span>
          </div>
          <p className="popover-section-desc">{menuUi.studioPostFxDesc}</p>
        </div>
        <button
          type="button"
          className={`toggle-chip postfx-chip ${postFxEnabled ? 'active-cyan' : ''}`}
          aria-pressed={postFxEnabled}
          title={studioUi.postFxTitle(postFxEnabled)}
          onClick={() => {
            playWorkbenchFoley('toggle_switch');
            togglePostFx();
          }}
        >
          <Aperture size={12} aria-hidden="true" />
          <span>{studioUi.postFxChip}</span>
        </button>
      </div>

      <div className="popover-section">
        <div className="popover-chip-grid">
          <button
            type="button"
            className="toggle-chip"
            title={studioUi.hideUiTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              closeMenus();
              setHudHidden(true);
            }}
          >
            <EyeOff size={13} aria-hidden="true" />
            <span>{studioUi.hideUiChip}</span>
            <kbd className="popover-kbd">H</kbd>
          </button>

          <button
            type="button"
            className={`toggle-chip ${isFullscreen ? 'active-cyan' : ''}`}
            title={studioUi.fullscreenTitle(isFullscreen)}
            onClick={() => {
              void handleFullscreenClick();
            }}
          >
            {isFullscreen ? (
              <Minimize2 size={13} aria-hidden="true" />
            ) : (
              <Maximize2 size={13} aria-hidden="true" />
            )}
            <span>
              {isFullscreen
                ? studioUi.fullscreenExitChip
                : studioUi.fullscreenEnterChip}
            </span>
          </button>
        </div>
      </div>
    </>
  );

  return (
    <div className="armory-overlay">
      {/* Consolidated Single-Row Luxury Digital Armory Header (<= 8 Desktop Controls) */}
      <header className="armory-header">
        <div className="brand-block armory-brand-block" data-lang={lang}>
          <div className="brand-badge armory-vault-badge">DIGITAL ARMORY</div>
          <div className="armory-brand-titles">
            <h1 className="brand-title" data-testid="armory-brand-title">
              <span className="armory-title-desktop">
                {resolveArmoryHeaderDesktopTitle(lang, ui.title)}
              </span>
              <span className="armory-title-mobile">{ui.mobileTitle}</span>
            </h1>
            <p className="brand-sub">{ui.subtitle}</p>
          </div>
        </div>

        {/* Compact Single-Row Scrollable Hall Category Tabs (Desktop > 1024px) with right-edge scroll cue */}
        <div className="armory-halls-wrap">
          <div ref={hallsScrollRef} className="armory-halls-strip">
            <div
              className="armory-filter-pills"
              role="tablist"
              aria-label={ui.filterAria}
            >
              {CATEGORY_KEYS.map((key) => {
                const count = categoryCounts[key];
                if (count === 0 && key !== 'all' && category !== key) {
                  return null;
                }
                return (
                  <button
                    key={key}
                    type="button"
                    role="tab"
                    aria-selected={category === key}
                    className={`armory-filter-btn ${
                      key === 'armor' || key === 'ordnance'
                        ? 'is-armor-pill'
                        : ''
                    } ${category === key ? 'active' : ''}`}
                    onClick={() => setCategory(key)}
                  >
                    {(key === 'armor' || key === 'ordnance') && (
                      <Shield
                        size={11}
                        className="filter-pill-icon"
                        aria-hidden="true"
                      />
                    )}
                    <span>
                      {ui.categories[key]} ({count})
                    </span>
                  </button>
                );
              })}
            </div>
          </div>

          <button
            type="button"
            className={`armory-halls-scroll-cue ${
              canScrollHallsRight ? '' : 'is-hidden'
            }`}
            aria-label={ui.hallsScrollMoreAria}
            title={ui.hallsScrollMoreAria}
            tabIndex={canScrollHallsRight ? 0 : -1}
            onClick={() => {
              hallsScrollRef.current?.scrollBy({
                left: 260,
                behavior: 'smooth',
              });
            }}
          >
            <ChevronRight size={13} aria-hidden="true" />
          </button>
        </div>

        {/* Right Luxury Control Cluster: Cmd+K, Labs ▾, Display ▾, Lang, Inspect CTA (+ Mobile Drawer Trigger) */}
        <div className="armory-header-controls">
          <button
            type="button"
            className="cmdk-trigger-pill armory-desktop-ctrl"
            title={cmdUi.trigger.title}
            aria-label={cmdUi.trigger.ariaLabel}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              closeMenus();
              openCommandPalette();
            }}
          >
            <Search size={12} aria-hidden="true" />
            <span className="cmdk-trigger-text">{cmdUi.trigger.shortLabel}</span>
            <kbd className="cmdk-trigger-kbd" aria-hidden="true">
              {kbdHint}
            </kbd>
          </button>

          {/* Consolidated Labs & Archive Popover */}
          <div
            ref={labsPopoverRef}
            className="studio-popover-wrap armory-desktop-ctrl"
          >
            <button
              type="button"
              className={`toggle-chip armory-popover-trigger ${
                activePopover === 'labs' ? 'active-cyan' : ''
              }`}
              aria-expanded={activePopover === 'labs'}
              aria-controls="armory-labs-popover-panel"
              title={ui.labsMenuTitle}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setOpenPopover((prev) => (prev === 'labs' ? null : 'labs'));
              }}
            >
              <FlaskConical size={12} aria-hidden="true" />
              <span>{ui.labsMenuBtn}</span>
              <ChevronDown
                size={11}
                className={`popover-caret ${
                  activePopover === 'labs' ? 'is-open' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {activePopover === 'labs' && (
              <div
                id="armory-labs-popover-panel"
                className="workbench-popover-menu armory-labs-popover"
                role="region"
                aria-label={ui.labsMenuAria}
              >
                {renderLabsPanelContent()}
              </div>
            )}
          </div>

          {/* Consolidated Studio Display / Lighting / Wear Popover */}
          <div
            ref={displayPopoverRef}
            className="studio-popover-wrap armory-desktop-ctrl"
          >
            <button
              type="button"
              className={`toggle-chip armory-popover-trigger ${
                activePopover === 'display' ? 'active-cyan' : ''
              }`}
              aria-expanded={activePopover === 'display'}
              aria-controls="armory-display-popover-panel"
              title={ui.displayMenuTitle}
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setOpenPopover((prev) =>
                  prev === 'display' ? null : 'display'
                );
              }}
            >
              <SlidersHorizontal size={12} aria-hidden="true" />
              <span>{ui.displayMenuBtn}</span>
              {hasCustomDisplaySetting && activePopover !== 'display' && (
                <span className="popover-active-dot" aria-hidden="true" />
              )}
              <ChevronDown
                size={11}
                className={`popover-caret ${
                  activePopover === 'display' ? 'is-open' : ''
                }`}
                aria-hidden="true"
              />
            </button>

            {activePopover === 'display' && (
              <div
                id="armory-display-popover-panel"
                className="workbench-popover-menu studio-display-popover armory-display-popover"
                role="region"
                aria-label={ui.displayMenuAria}
              >
                {renderDisplayPanelContent()}
              </div>
            )}
          </div>

          <div className="armory-desktop-lang">
            <LanguageSwitchPill compact />
          </div>

          {/* Mobile / Tablet Compact Drawer Trigger (<= 1024px) */}
          <button
            type="button"
            className={`toggle-chip armory-mobile-menu-btn ${
              isMobileDrawerOpen ? 'active-cyan' : ''
            }`}
            aria-expanded={isMobileDrawerOpen}
            aria-controls="armory-mobile-nav-drawer"
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setOpenPopover(null);
              setMobileDrawerOpen((prev) => !prev);
            }}
          >
            <Menu size={14} aria-hidden="true" />
            <span>{ui.mobileMenuBtn}</span>
          </button>

          <button
            type="button"
            className="armory-quick-enter-btn"
            onClick={() => enterWorkbench(featuredWeapon.id)}
          >
            <Wrench size={13} aria-hidden="true" />
            <span className="armory-enter-desktop">
              {ui.enterBenchBtn(shortWeaponTag)}
            </span>
            <span className="armory-enter-mobile">
              {ui.mobileEnterBenchBtn}
            </span>
            <ArrowRight size={13} aria-hidden="true" />
          </button>
        </div>
      </header>

      {/* Mobile / Tablet Slide-Over Halls & Museum Navigation Drawer */}
      {isMobileDrawerOpen && (
        <div
          className="armory-drawer-backdrop"
          onClick={() => setMobileDrawerOpen(false)}
        >
          <div
            id="armory-mobile-nav-drawer"
            ref={mobileDrawerRef}
            className="armory-mobile-drawer"
            role="dialog"
            aria-modal="true"
            aria-labelledby={mobileDrawerTitleId}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="armory-drawer-head">
              <h2 id={mobileDrawerTitleId} className="armory-drawer-title">
                {ui.mobileMenuBtn}
              </h2>
              <div className="armory-drawer-head-right">
                <LanguageSwitchPill compact />
                <button
                  type="button"
                  className="armory-drawer-close-btn"
                  aria-label={lang === 'zh' ? '关闭导航菜单' : 'Close menu'}
                  onClick={() => setMobileDrawerOpen(false)}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>

            <div className="armory-drawer-body">
              <button
                type="button"
                className="cmdk-trigger-pill armory-drawer-search-btn"
                onClick={() => {
                  playWorkbenchFoley('toggle_switch');
                  closeMenus();
                  openCommandPalette();
                }}
              >
                <Search size={13} aria-hidden="true" />
                <span className="cmdk-trigger-text">
                  {cmdUi.trigger.title}
                </span>
                <kbd className="cmdk-trigger-kbd" aria-hidden="true">
                  {kbdHint}
                </kbd>
              </button>

              <div className="popover-section">
                <div className="popover-section-head">
                  <Shield size={12} aria-hidden="true" />
                  <span>{ui.mobileHallsHeading}</span>
                </div>
                <div className="armory-drawer-halls-grid">
                  {CATEGORY_KEYS.map((key) => {
                    const count = categoryCounts[key];
                    if (count === 0 && key !== 'all' && category !== key) {
                      return null;
                    }
                    return (
                      <button
                        key={key}
                        type="button"
                        className={`armory-filter-btn ${
                          key === 'armor' || key === 'ordnance'
                            ? 'is-armor-pill'
                            : ''
                        } ${category === key ? 'active' : ''}`}
                        onClick={() => {
                          setCategory(key);
                          setMobileDrawerOpen(false);
                        }}
                      >
                        <span>
                          {ui.categories[key]} ({count})
                        </span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {renderLabsPanelContent()}
              {renderDisplayPanelContent()}
            </div>
          </div>
        </div>
      )}

      {/* Left Featured Weapon Technical Plaque */}
      <aside className="armory-hero-plaque armory-plaque">
        <div className="plaque-scroll-body">
          <div className="plaque-status-row">
            <div className="plaque-bay-cluster">
              <span className="plaque-bay-tag">{featuredWeapon.bayCode}</span>
              <span className="plaque-origin-pill">
                <Globe2 size={11} />
                <span>{featuredDisplay.originTag}</span>
              </span>
            </div>
            <span className="plaque-ready-pill">
              <CheckCircle2 size={11} />
              {featuredDisplay.statusLabel}
            </span>
          </div>

          <h2 className="plaque-weapon-title">{featuredDisplay.name}</h2>
          <div className="plaque-weapon-sub">{featuredWeapon.modelCode}</div>

          {featuredExam.isCertified && featuredExam.overallRank && (
            <button
              type="button"
              className={`plaque-exam-cert-banner rank-${featuredExam.overallRank}`}
              title={ui.posterTitle}
              onClick={() =>
                openPosterModal({
                  weaponId: featuredWeapon.id,
                  armorerRank: featuredExam.overallRank,
                })
              }
            >
              <span
                className={`plaque-exam-rank-seal rank-${featuredExam.overallRank}`}
              >
                {featuredExam.overallRank}
              </span>
              <span className="plaque-exam-meta">
                <span className="plaque-exam-kicker">
                  <Award size={11} aria-hidden="true" />
                  <span>{ui.certPlaqueLabel}</span>
                  <span className="plaque-exam-stars" aria-hidden="true">
                    {'★'.repeat(featuredExam.stars)}
                  </span>
                </span>
                <span className="plaque-exam-sub">
                  {ui.certPlaqueSub(
                    featuredExam.fieldStripRank,
                    featuredExam.triageRank
                  )}
                </span>
              </span>
              <Share2 size={12} className="plaque-exam-share-icon" aria-hidden="true" />
            </button>
          )}

          <p className="plaque-desc">{featuredDisplay.description}</p>

          <div className="plaque-spec-grid">
            <div className="plaque-spec-cell">
              <span className="spec-k">{plaqueUi.caliberLabel}</span>
              <span className="spec-v">{featuredDisplay.caliber}</span>
            </div>
            <div className="plaque-spec-cell">
              <span className="spec-k">{ui.precisionLabel}</span>
              <span className="spec-v">
                {ui.precisionValue(
                  featuredWeapon.assembliesCount,
                  featuredWeapon.partsCount
                )}
              </span>
            </div>
            <div className="plaque-spec-cell full">
              <span className="spec-k">{plaqueUi.mechanismLabel}</span>
              <span className="spec-v">{featuredDisplay.actionMechanism}</span>
            </div>
            {WEAPON_RIFLING_SPECS[featuredWeapon.id].kind !== 'none' && (
              <div
                className="plaque-spec-cell full plaque-rifling-cell"
                data-testid="armory-plaque-rifling-row"
                data-rifling-kind={WEAPON_RIFLING_SPECS[featuredWeapon.id].kind}
              >
                <span className="spec-k plaque-rifling-head">
                  <span>{lang === 'en' ? 'Bore & Rifling' : '膛线规格'}</span>
                  <span className="plaque-rifling-meta">
                    Ø{WEAPON_RIFLING_SPECS[featuredWeapon.id].boreDiameterMm} mm
                    {WEAPON_RIFLING_SPECS[featuredWeapon.id].chromeLined
                      ? lang === 'en'
                        ? ' · Chrome'
                        : ' · 镀铬'
                      : ''}
                  </span>
                </span>
                <span className="spec-v plaque-rifling-value">
                  {lang === 'en'
                    ? WEAPON_RIFLING_SPECS[featuredWeapon.id].labelEn
                    : WEAPON_RIFLING_SPECS[featuredWeapon.id].labelZh}
                </span>
              </div>
            )}
          </div>

          <div className="plaque-metrology-box">
            <div className="plaque-metrology-head">
              <span className="plaque-metrology-title">
                <Ruler size={11} />
                <span>{plaqueUi.metrologyTitle}</span>
              </span>
              <span className="plaque-metrology-tag">FACTORY 1:1</span>
            </div>
            <div className="plaque-metrology-grid">
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.oalLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.overallLengthMm}
                </span>
              </div>
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.barrelLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.barrelSpec}
                </span>
              </div>
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.weightLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.weightKg}
                </span>
              </div>
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.muzzleVelLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.muzzleVelocityMs}
                </span>
              </div>
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.rangeLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.effectiveRangeM}
                </span>
              </div>
              <div className="metrology-cell">
                <span className="spec-k">{plaqueUi.rofLabel}</span>
                <span className="spec-v tabular">
                  {featuredDisplay.rateOfFire}
                </span>
              </div>
            </div>
          </div>

          <div className="plaque-feature-chips">
            {featuredDisplay.highlights.map((h) => (
              <span key={h} className="plaque-chip">
                {h}
              </span>
            ))}
          </div>
        </div>

        <div className="plaque-cta-footer">
          <div className="plaque-secondary-ctas">
            <button
              type="button"
              className="plaque-compact-cta is-story"
              onClick={() => setStoryOpen(true)}
              title={`${ui.plaqueStoryCta} — ${ui.plaqueStorySub}`}
            >
              <Headphones size={13} aria-hidden="true" />
              <span>{lang === 'zh' ? '四幕语音故事' : '4-Act Story'}</span>
            </button>

            <button
              type="button"
              className="plaque-compact-cta is-monograph"
              onClick={() => openMonographModal(featuredWeapon.id)}
              title={`${monoUi.plaqueCtaMain} — ${monoUi.plaqueCtaSub}`}
            >
              <Printer size={13} aria-hidden="true" />
              <span>{monoUi.entryChip}</span>
            </button>
          </div>

          <button
            type="button"
            className="plaque-showdown-cta"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
              setShowdownRequest({
                mode: 'showdown',
                weaponA: featuredWeapon.id,
                weaponB: suggestedRivalId,
              });
            }}
            title={showdownUi.plaqueCompareTitle(
              shortWeaponTag,
              suggestedRivalShort
            )}
          >
            <GitCompareArrows size={13} aria-hidden="true" />
            <span>{showdownUi.plaqueCompareBtn(suggestedRivalShort)}</span>
            <span className="plaque-showdown-kbd">S</span>
          </button>

          <button
            type="button"
            className="plaque-primary-cta"
            onClick={() => enterWorkbench(featuredWeapon.id)}
          >
            <Layers size={15} />
            <span>{plaqueUi.plaquePrimaryCta(shortWeaponTag)}</span>
            <ArrowRight size={15} />
          </button>
        </div>
      </aside>

      {/* Right Turntable Controls & Direct Click Hint */}
      <div className="armory-stage-controls">
        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            pbrTexturesEnabled ? 'active-cyan' : ''
          }`}
          onClick={togglePbrTextures}
          title={ui.pbrTitle}
        >
          <Sparkles size={14} />
          <span>{pbrTexturesEnabled ? ui.pbrOn : ui.pbrOff}</span>
        </button>

        <button
          type="button"
          className="toggle-chip armory-ctrl-chip"
          onClick={() => setTextureModalOpen(true)}
          title={ui.atlasTitle}
        >
          <ImageIcon size={14} />
          <span>{ui.atlasBtn}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            armoryAutoRotate ? 'active-cyan' : ''
          }`}
          onClick={toggleArmoryAutoRotate}
          title={ui.rotateTitle}
        >
          <Orbit size={14} />
          <span>{armoryAutoRotate ? ui.rotateOn : ui.rotateOff}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            xrayShells ? 'active-cyan' : ''
          }`}
          onClick={toggleXrayShells}
          title={ui.xrayTitle}
        >
          <Eye size={14} />
          <span>{ui.xrayBtn}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            sectionCut ? 'active-teal' : ''
          }`}
          aria-pressed={sectionCut}
          onClick={toggleSectionCut}
          title={ui.sectionTitle}
        >
          <Scissors size={14} aria-hidden="true" />
          <span>{sectionCut ? ui.sectionOn : ui.sectionOff}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip armory-ctrl-chip ${
            engineeringTint ? 'active-amber' : ''
          }`}
          aria-pressed={engineeringTint}
          onClick={toggleEngineeringTint}
          title={ui.tintTitle}
        >
          <Palette size={14} aria-hidden="true" />
          <span>{ui.tintBtn}</span>
        </button>

        <EngineeringTintLegend compact />

        <div className="armory-stage-hint">
          <MousePointerClick size={13} />
          <span>{plaqueUi.stageHint}</span>
        </div>
      </div>

      {/* Non-intrusive toast when clicking planned slot */}
      {plannedToast && (
        <div className="armory-toast-banner">{plannedToast}</div>
      )}

      {/* Bottom Compact Single-Row Armory Weapon Vault Rack (~176px tall) */}
      <section className="armory-rack-dock" aria-label={ui.rackAria}>
        <div className="rack-dock-header">
          <div className="rack-dock-title">
            <Shield size={13} className="rack-icon" />
            <span>{ui.rackTitle}</span>
            <span className="rack-count-pill armory-rack-counter">
              {filteredWeapons.length} / {ARMORY_WEAPONS.length}
            </span>
          </div>

          <div className="rack-dock-right">
            <span className="rack-dock-tip">{ui.rackTip}</span>
            <div className="rack-scroll-btns">
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(-1)}
                aria-label={ui.scrollLeft}
                title={ui.scrollLeft}
              >
                <ChevronLeft size={14} />
              </button>
              <button
                type="button"
                className="rack-scroll-btn"
                onClick={() => scrollRackBy(1)}
                aria-label={ui.scrollRight}
                title={ui.scrollRight}
              >
                <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </div>

        <div ref={rackScrollRef} className="armory-cards-grid">
          {filteredWeapons.map((item) => (
            <ArmoryRackBayCard
              key={item.id}
              item={item}
              isOnTurntable={item.id === activeWeaponId}
              lang={lang}
              ui={ui}
              onCardClick={handleCardBodyClick}
              onEnterWorkbench={enterWorkbench}
            />
          ))}
        </div>
      </section>

      {showdownRequest && (
        <Suspense fallback={null}>
          <LazyMechanismShowdownModal
            initialMode={showdownRequest.mode}
            initialWeaponA={showdownRequest.weaponA}
            initialWeaponB={showdownRequest.weaponB}
            onClose={() => setShowdownRequest(null)}
          />
        </Suspense>
      )}
    </div>
  );
};

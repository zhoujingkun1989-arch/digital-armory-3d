import React, { Suspense, lazy, useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  Award,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Crosshair,
  Eye,
  GitCompareArrows,
  Globe2,
  Headphones,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  Orbit,
  Palette,
  Printer,
  Rotate3d,
  Ruler,
  Scissors,
  Share2,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { useWeaponExamSummary } from '../../engine/exam/armorerExamStore';
import { isArcheryWeapon } from '../../engine/physics/armoryPhysics';
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
import { preloadWeaponPlugin } from '../../weapons/registry';
import type {
  ArmoryCategory,
  ArmoryWeaponItem,
  WeaponId,
} from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { EngineeringTintLegend } from '../workbench/EngineeringTintLegend';
import { StudioEnvironmentBar } from '../workbench/StudioEnvironmentBar';
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

interface ArmoryRackBayCardProps {
  item: ArmoryWeaponItem;
  isOnTurntable: boolean;
  lang: LanguageCode;
  ui: (typeof UI_STRINGS)['zh']['armory'];
  onCardClick: (item: ArmoryWeaponItem, el: HTMLDivElement) => void;
  onEnterWorkbench: (weaponId: WeaponId) => void;
}

const ArmoryRackBayCard: React.FC<ArmoryRackBayCardProps> = ({
  item,
  isOnTurntable,
  lang,
  ui,
  onCardClick,
  onEnterWorkbench,
}) => {
  const examSummary = useWeaponExamSummary(item.id);
  const itemMeta = resolveWeaponDisplayMeta(
    item.id,
    lang,
    getLoadedNarrationBundle(item.id)
  );

  return (
    <div
      role="button"
      tabIndex={0}
      className={`armory-weapon-card bay-card ${
        item.available ? 'is-ready' : 'is-planned'
      } ${isOnTurntable ? 'is-on-turntable' : ''}`}
      onMouseEnter={() => {
        if (item.available) {
          preloadWeaponPlugin(item.id);
          preloadWeaponNarration(item.id);
        }
      }}
      onFocus={() => {
        if (item.available) {
          preloadWeaponPlugin(item.id);
          preloadWeaponNarration(item.id);
        }
      }}
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
            className="wcard-enter-cta-btn"
            onClick={(e) => {
              e.stopPropagation();
              onEnterWorkbench(item.id);
            }}
          >
            <span>{ui.cardEnterCta}</span>
            <ArrowRight size={12} />
          </button>
        ) : (
          <span className="wcard-planned-note">{itemMeta.actionMechanism}</span>
        )}
      </div>
    </div>
  );
};

export const ArmoryView: React.FC = () => {
  const [category, setCategory] = useState<ArmoryFilterKey>('all');
  const [plannedToast, setPlannedToast] = useState<string | null>(null);
  const [showdownRequest, setShowdownRequest] = useState<{
    mode: ShowdownViewMode;
    weaponA: string;
    weaponB: string;
  } | null>(() => consumePendingShowdownLaunch());
  const rackScrollRef = useRef<HTMLDivElement>(null);

  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const toggleStoryOpen = useAppStore((s) => s.toggleStoryOpen);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const openShowcase = useAppStore((s) => s.openShowcase);
  const openCartridgeLab = useAppStore((s) => s.openCartridgeLab);
  const openExternalBallistics = useAppStore((s) => s.openExternalBallistics);
  const openPosterModal = useAppStore((s) => s.openPosterModal);
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

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const { bundle: featuredBundle } = useWeaponNarration(featuredWeapon.id);
  const featuredExam = useWeaponExamSummary(featuredWeapon.id);

  const ui = UI_STRINGS[lang].armory;
  const monoUi = UI_STRINGS[lang].monograph;
  const showdownUi = UI_STRINGS[lang].mechanismShowdown;
  const plaqueUi = isArcheryWeapon(featuredWeapon.id) ? ui.archeryPlaque : ui;
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

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesCategoryWithLmg(w, category)
  );

  const scrollRackBy = (dir: -1 | 1) => {
    if (!rackScrollRef.current) return;
    rackScrollRef.current.scrollBy({
      left: dir * 480,
      behavior: 'smooth',
    });
  };

  const handleCardBodyClick = (
    item: ArmoryWeaponItem,
    cardEl?: HTMLDivElement | null
  ) => {
    if (cardEl) {
      cardEl.scrollIntoView({
        behavior: 'smooth',
        block: 'nearest',
        inline: 'nearest',
      });
    }
    if (item.available) {
      if (item.id !== activeWeaponId) {
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
  };

  return (
    <div className="armory-overlay">
      {/* Top Digital Armory Header */}
      <header className="armory-header">
        <div className="brand-block">
          <div className="brand-badge armory-vault-badge">DIGITAL ARMORY</div>
          <div>
            <h1 className="brand-title">{ui.title}</h1>
            <p className="brand-sub">{ui.subtitle}</p>
          </div>
        </div>

        <div className="armory-header-actions armory-actions-filters">
          <div
            className="armory-filter-pills"
            style={{ flexWrap: 'wrap', maxWidth: '100%' }}
            role="tablist"
            aria-label={ui.filterAria}
          >
            {CATEGORY_KEYS.map((key) => {
              const count = ARMORY_WEAPONS.filter((w) =>
                matchesCategoryWithLmg(w, key)
              ).length;
              if (count === 0 && key !== 'all' && category !== key) {
                return null;
              }
              return (
                <button
                  key={key}
                  type="button"
                  className={`armory-filter-btn ${
                    category === key ? 'active' : ''
                  }`}
                  onClick={() => setCategory(key)}
                >
                  {ui.categories[key]} ({count})
                </button>
              );
            })}
          </div>
        </div>

        <div className="armory-header-actions armory-actions-utility">
          <StudioEnvironmentBar compact />

          <LanguageSwitchPill compact />

          <button
            type="button"
            className={`armory-story-btn ${storyOpen ? 'active' : ''}`}
            onClick={toggleStoryOpen}
            title={ui.storyBtnTitle}
          >
            <BookOpen size={13} />
            <span>
              {isArcheryWeapon(featuredWeapon.id) && lang === 'zh'
                ? '弓弩研发故事'
                : ui.storyBtn}
            </span>
          </button>

          <button
            type="button"
            className="armory-showdown-btn"
            onClick={() => {
              playWorkbenchFoley('preset_detent');
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
          </button>

          <button
            type="button"
            className="armory-showcase-btn armory-ballistics-btn"
            onClick={() => openExternalBallistics()}
            title={ui.ballisticsLabTitle}
          >
            <Crosshair size={13} aria-hidden="true" />
            <span>{ui.ballisticsLabBtn}</span>
          </button>

          <button
            type="button"
            className="armory-showcase-btn armory-poster-btn"
            onClick={() =>
              openPosterModal({
                weaponId: featuredWeapon.id,
                armorerRank: featuredExam.overallRank,
              })
            }
            title={ui.posterTitle}
          >
            <Share2 size={13} aria-hidden="true" />
            <span>{ui.posterBtn}</span>
          </button>

          <button
            type="button"
            className="armory-showcase-btn"
            onClick={() => openMonographModal(featuredWeapon.id)}
            title={monoUi.entryChipTitle}
          >
            <Printer size={13} aria-hidden="true" />
            <span>{monoUi.entryChip}</span>
          </button>

          <button
            type="button"
            className="armory-showcase-btn"
            onClick={() => openCartridgeLab()}
            title={ui.cartridgeLabTitle}
          >
            <Layers size={13} aria-hidden="true" />
            <span>{ui.cartridgeLabBtn}</span>
          </button>

          <button
            type="button"
            className="armory-showcase-btn"
            onClick={openShowcase}
            title={ui.showcaseTitle}
          >
            <Sparkles size={13} />
            <span>{ui.showcaseBtn}</span>
          </button>

          <button
            type="button"
            className="armory-quick-enter-btn"
            onClick={() => enterWorkbench(featuredWeapon.id)}
          >
            <Wrench size={14} />
            <span>{ui.enterBenchBtn(shortWeaponTag)}</span>
            <ArrowRight size={14} />
          </button>
        </div>
      </header>

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

      {/* Bottom Compact Single-Row 13-Bay Armory Weapon Vault Rack (~176px tall) */}
      <section className="armory-rack-dock" aria-label={ui.rackAria}>
        <div className="rack-dock-header">
          <div className="rack-dock-title">
            <Shield size={13} className="rack-icon" />
            <span>{ui.rackTitle}</span>
            <span className="rack-count-pill">
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

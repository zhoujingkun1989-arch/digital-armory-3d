import React, { useRef, useState } from 'react';
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Clock,
  Eye,
  Globe2,
  Headphones,
  Image as ImageIcon,
  Layers,
  MousePointerClick,
  Orbit,
  Rotate3d,
  Ruler,
  Scissors,
  Shield,
  Sparkles,
  Wrench,
} from 'lucide-react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  getLocalizedShortWeaponLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import {
  getLoadedNarrationBundle,
  preloadWeaponNarration,
  useWeaponNarration,
} from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { ARMORY_WEAPONS, matchesArmoryCategory } from '../../weapons/manifests';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { ArmoryCategory, ArmoryWeaponItem } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { WeaponSilhouetteSvg } from './WeaponSilhouetteSvg';

const CATEGORY_KEYS: ArmoryCategory[] = [
  'all',
  'assault',
  'smg',
  'sniper',
  'pistol',
];

export const ArmoryView: React.FC = () => {
  const [category, setCategory] = useState<ArmoryCategory>('all');
  const [plannedToast, setPlannedToast] = useState<string | null>(null);
  const rackScrollRef = useRef<HTMLDivElement>(null);

  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const toggleStoryOpen = useAppStore((s) => s.toggleStoryOpen);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const openShowcase = useAppStore((s) => s.openShowcase);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const toggleArmoryAutoRotate = useAppStore((s) => s.toggleArmoryAutoRotate);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const togglePbrTextures = useAppStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const { bundle: featuredBundle } = useWeaponNarration(featuredWeapon.id);

  const ui = UI_STRINGS[lang].armory;
  const featuredDisplay = resolveWeaponDisplayMeta(
    featuredWeapon.id,
    lang,
    featuredBundle
  );
  const shortWeaponTag = getLocalizedShortWeaponLabel(featuredWeapon.id, lang);

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesArmoryCategory(w, category)
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

        <div className="armory-header-actions">
          <div
            className="armory-filter-pills"
            role="tablist"
            aria-label={ui.filterAria}
          >
            {CATEGORY_KEYS.map((key) => {
              const count = ARMORY_WEAPONS.filter((w) =>
                matchesArmoryCategory(w, key)
              ).length;
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

          <LanguageSwitchPill />

          <button
            type="button"
            className={`armory-story-btn ${storyOpen ? 'active' : ''}`}
            onClick={toggleStoryOpen}
            title={ui.storyBtnTitle}
          >
            <BookOpen size={13} />
            <span>{ui.storyBtn}</span>
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
      <aside className="armory-hero-plaque">
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

        <p className="plaque-desc">{featuredDisplay.description}</p>

        <div className="plaque-spec-grid">
          <div className="plaque-spec-cell">
            <span className="spec-k">{ui.caliberLabel}</span>
            <span className="spec-v">{featuredWeapon.caliber}</span>
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
            <span className="spec-k">{ui.mechanismLabel}</span>
            <span className="spec-v">{featuredDisplay.actionMechanism}</span>
          </div>
        </div>

        <div className="plaque-metrology-box">
          <div className="plaque-metrology-head">
            <span className="plaque-metrology-title">
              <Ruler size={11} />
              <span>{ui.metrologyTitle}</span>
            </span>
            <span className="plaque-metrology-tag">FACTORY 1:1</span>
          </div>
          <div className="plaque-metrology-grid">
            <div className="metrology-cell">
              <span className="spec-k">{ui.oalLabel}</span>
              <span className="spec-v tabular">
                {featuredDisplay.overallLengthMm}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">{ui.barrelLabel}</span>
              <span className="spec-v tabular">
                {featuredDisplay.barrelSpec}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">{ui.weightLabel}</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.emptyWeightKg}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">{ui.muzzleVelLabel}</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.muzzleVelocityMs}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">{ui.rangeLabel}</span>
              <span className="spec-v tabular">
                {featuredWeapon.specs1To1.effectiveRangeM}
              </span>
            </div>
            <div className="metrology-cell">
              <span className="spec-k">{ui.rofLabel}</span>
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

        <button
          type="button"
          className="plaque-story-cta"
          onClick={() => setStoryOpen(true)}
        >
          <div className="plaque-story-cta-left">
            <span className="plaque-story-icon">
              <Headphones size={14} />
            </span>
            <div>
              <span className="plaque-story-main">{ui.plaqueStoryCta}</span>
              <span className="plaque-story-sub">{ui.plaqueStorySub}</span>
            </div>
          </div>
          <ArrowRight size={14} />
        </button>

        <button
          type="button"
          className="plaque-primary-cta"
          onClick={() => enterWorkbench(featuredWeapon.id)}
        >
          <Layers size={16} />
          <span>{ui.plaquePrimaryCta(shortWeaponTag)}</span>
          <ArrowRight size={16} />
        </button>
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
          onClick={toggleSectionCut}
          title={ui.sectionTitle}
        >
          <Scissors size={14} />
          <span>{sectionCut ? ui.sectionOn : ui.sectionOff}</span>
        </button>

        <div className="armory-stage-hint">
          <MousePointerClick size={13} />
          <span>{ui.stageHint}</span>
        </div>
      </div>

      {/* Non-intrusive toast when clicking planned slot */}
      {plannedToast && (
        <div className="armory-toast-banner">{plannedToast}</div>
      )}

      {/* Bottom Compact Single-Row 10-Bay Armory Weapon Vault Rack (~176px tall) */}
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
          {filteredWeapons.map((item) => {
            const isOnTurntable = item.id === activeWeaponId;
            const itemMeta = resolveWeaponDisplayMeta(
              item.id,
              lang,
              getLoadedNarrationBundle(item.id)
            );

            return (
              <div
                key={item.id}
                role="button"
                tabIndex={0}
                className={`armory-weapon-card ${
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
                onClick={(e) => handleCardBodyClick(item, e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleCardBodyClick(item, e.currentTarget);
                  }
                }}
              >
                <div className="wcard-top-row">
                  <span className="wcard-bay">{item.bayCode}</span>
                  <span className="wcard-origin-tag">{itemMeta.originTag}</span>
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
                        <span
                          className="live-dot"
                          title={itemMeta.statusLabel}
                        />
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
                  <WeaponSilhouetteSvg
                    id={item.id}
                    available={item.available}
                  />
                </div>

                <div className="wcard-body">
                  <div className="wcard-title-row">
                    <span className="wcard-name">{itemMeta.name}</span>
                  </div>
                  <div className="wcard-meta">
                    {item.caliber} · {ui.partsNodeSuffix(item.partsCount)}
                  </div>
                </div>

                <div className="wcard-footer">
                  {item.available ? (
                    <button
                      type="button"
                      className="wcard-enter-cta-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        enterWorkbench(item.id);
                      }}
                    >
                      <span>{ui.cardEnterCta}</span>
                      <ArrowRight size={12} />
                    </button>
                  ) : (
                    <span className="wcard-planned-note">
                      {itemMeta.actionMechanism}
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
};

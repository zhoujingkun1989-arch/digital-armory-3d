import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowRight,
  ArrowUpRight,
  BookOpen,
  Box,
  Check,
  Clapperboard,
  Copy,
  Cpu,
  Eye,
  Flame,
  Gauge,
  GitBranch,
  Globe2,
  Headphones,
  Image as ImageIcon,
  Keyboard,
  Layers,
  type LucideIcon,
  Orbit,
  Play,
  Ruler,
  Scissors,
  Shield,
  Sparkles,
  Star,
  Terminal,
  Volume2,
  Wrench,
  X,
  Zap,
} from 'lucide-react';
import { unlockMechanicalAudio } from '../../engine/audio/mechanicalSoundEngine';
import {
  dragTurntableBy,
  setShowcaseUserDragging,
  setShowcaseWindowBounds,
} from '../../engine/canvas/turntableStageMetrics';
import { playbackClock } from '../../engine/clock/playbackClock';
import { resolveAssetUrl } from '../../engine/utils/assetUrl';
import {
  SHOWCASE_STRINGS,
  type ShowcaseArchPillarCopy,
  type ShowcaseGalleryItemCopy,
} from '../../i18n/showcaseStrings';
import {
  getLocalizedShortWeaponLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import { preloadWeaponNarration } from '../../narration/narrationService';
import { launchDirectorDocumentary } from '../../narration/storyDirector';
import { useAppStore } from '../../store/useAppStore';
import {
  ARMORY_WEAPONS,
  matchesArmoryCategory,
} from '../../weapons/manifests';
import { preloadWeaponPlugin } from '../../weapons/registry';
import type { ArmoryCategory, WeaponId } from '../../weapons/types';
import { WeaponSilhouetteSvg } from '../armory/WeaponSilhouetteSvg';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';

const GITHUB_REPO_URL =
  'https://github.com/zhoujingkun1989-arch/digital-armory-3d';

type HeroStageMode = 'pbr' | 'section' | 'xray' | 'explode';

const CATEGORY_KEYS: readonly ArmoryCategory[] = [
  'all',
  'assault',
  'smg',
  'sniper',
  'pistol',
];

const ARCH_ICONS: Record<ShowcaseArchPillarCopy['iconKey'], LucideIcon> = {
  git: GitBranch,
  cpu: Cpu,
  gauge: Gauge,
  sparkles: Sparkles,
  scissors: Scissors,
  shield: Shield,
};

const QUICKSTART_SNIPPET = `git clone ${GITHUB_REPO_URL}.git
cd digital-armory-3d
npm install
npm run dev`;

export const ShowcaseView: React.FC = () => {
  const [heroMode, setHeroMode] = useState<HeroStageMode>('pbr');
  const [category, setCategory] = useState<ArmoryCategory>('all');
  const [docWeaponId, setDocWeaponId] = useState<WeaponId>('ak15');
  const [copied, setCopied] = useState(false);
  const [lightboxItemId, setLightboxItemId] = useState<string | null>(null);
  const [isDraggingStage, setIsDraggingStage] = useState(false);

  const heroSectionRef = useRef<HTMLElement>(null);
  const liveWindowRef = useRef<HTMLDivElement>(null);
  const dragStateRef = useRef<{
    active: boolean;
    pointerId: number;
    lastX: number;
    lastY: number;
  }>({
    active: false,
    pointerId: -1,
    lastX: 0,
    lastY: 0,
  });

  const lang = useAppStore((s) => s.lang);
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const armoryAutoRotate = useAppStore((s) => s.armoryAutoRotate);
  const selectArmoryWeapon = useAppStore((s) => s.selectArmoryWeapon);
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const enterWorkbench = useAppStore((s) => s.enterWorkbench);
  const toggleArmoryAutoRotate = useAppStore((s) => s.toggleArmoryAutoRotate);
  const setSectionCut = useAppStore((s) => s.setSectionCut);
  const setXrayShells = useAppStore((s) => s.setXrayShells);
  const setTargetProgress = useAppStore((s) => s.setTargetProgress);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);

  const s = SHOWCASE_STRINGS[lang];

  const lightboxItem: ShowcaseGalleryItemCopy | null = lightboxItemId
    ? (s.gallery.items.find((it) => it.id === lightboxItemId) ?? null)
    : null;

  useEffect(() => {
    if (!lightboxItemId) return;
    const onKeyDown = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape') {
        ev.stopPropagation();
        setLightboxItemId(null);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [lightboxItemId]);

  useEffect(() => {
    const measureWindow = () => {
      const heroEl = heroSectionRef.current;
      const winEl = liveWindowRef.current;
      if (!heroEl || !winEl) return;
      const topPx = heroEl.offsetTop + winEl.offsetTop;
      const bottomPx = topPx + winEl.offsetHeight;
      setShowcaseWindowBounds({ topPx, bottomPx });
    };

    measureWindow();
    const ro =
      typeof ResizeObserver !== 'undefined'
        ? new ResizeObserver(measureWindow)
        : null;
    if (ro) {
      if (heroSectionRef.current) ro.observe(heroSectionRef.current);
      if (liveWindowRef.current) ro.observe(liveWindowRef.current);
    }
    window.addEventListener('resize', measureWindow, { passive: true });
    return () => {
      window.removeEventListener('resize', measureWindow);
      ro?.disconnect();
      setShowcaseWindowBounds(null);
      setShowcaseUserDragging(false);
    };
  }, []);

  const handleStagePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.button !== 0 || e.pointerType === 'touch') return;
    if ((e.target as HTMLElement).closest('.showcase-live-telemetry')) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragStateRef.current = {
      active: true,
      pointerId: e.pointerId,
      lastX: e.clientX,
      lastY: e.clientY,
    };
    setIsDraggingStage(true);
    setShowcaseUserDragging(true);
  };

  const handleStagePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds.active || e.pointerId !== ds.pointerId) return;
    const dx = e.clientX - ds.lastX;
    const dy = e.clientY - ds.lastY;
    ds.lastX = e.clientX;
    ds.lastY = e.clientY;
    if (dx !== 0 || dy !== 0) {
      dragTurntableBy(dx, dy);
    }
  };

  const endStagePointerDrag = (e: React.PointerEvent<HTMLDivElement>) => {
    const ds = dragStateRef.current;
    if (!ds.active || e.pointerId !== ds.pointerId) return;
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId);
    }
    ds.active = false;
    setIsDraggingStage(false);
    setShowcaseUserDragging(false);
  };

  const featuredWeapon =
    ARMORY_WEAPONS.find((w) => w.id === activeWeaponId) ?? ARMORY_WEAPONS[0];
  const featuredMeta = resolveWeaponDisplayMeta(featuredWeapon.id, lang, null);
  const shortWeaponTag = getLocalizedShortWeaponLabel(featuredWeapon.id, lang);
  const docShortTag = getLocalizedShortWeaponLabel(docWeaponId, lang);

  const filteredWeapons = ARMORY_WEAPONS.filter((w) =>
    matchesArmoryCategory(w, category)
  );

  const applyHeroStageMode = (nextMode: HeroStageMode) => {
    setHeroMode(nextMode);
    if (nextMode === 'pbr') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0);
    } else if (nextMode === 'section') {
      setSectionCut(true);
      setTargetProgress(0);
    } else if (nextMode === 'xray') {
      setXrayShells(true);
      setTargetProgress(0);
    } else if (nextMode === 'explode') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0.58);
    }
  };

  const handleHeroWeaponSwitch = (weaponId: WeaponId) => {
    selectArmoryWeapon(weaponId);
    if (heroMode === 'section') {
      setSectionCut(true);
      setTargetProgress(0);
    } else if (heroMode === 'xray') {
      setXrayShells(true);
      setTargetProgress(0);
    } else if (heroMode === 'explode') {
      setSectionCut(false);
      setXrayShells(false);
      setTargetProgress(0.58);
    }
  };

  const launchSectionWorkbench = (weaponId: WeaponId) => {
    enterWorkbench(weaponId, 'explode');
    playbackClock.setTargetProgress(0, false);
    setSectionCut(true);
    useAppStore.getState().triggerCameraPreset('right');
  };

  const launchSlowMoAcousticDemo = () => {
    unlockMechanicalAudio();
    enterWorkbench('m82a1', 'firing');
    const st = useAppStore.getState();
    st.setSfxMuted(false);
    st.setFireSpeedMultiplier(0.25);
    st.setSectionCut(true);
    st.triggerCameraPreset('right');
  };

  const handleGalleryAction = (item: ShowcaseGalleryItemCopy) => {
    setLightboxItemId(null);
    if (item.actionType === 'armory') {
      returnToArmory();
      selectArmoryWeapon(item.weaponId);
    } else if (item.actionType === 'explode') {
      enterWorkbench(item.weaponId, 'explode');
    } else if (item.actionType === 'firing') {
      unlockMechanicalAudio();
      enterWorkbench(item.weaponId, 'firing');
    } else if (item.actionType === 'section') {
      launchSectionWorkbench(item.weaponId);
    } else if (item.actionType === 'atlas') {
      selectArmoryWeapon(item.weaponId);
      setTextureModalOpen(true);
    }
  };

  const handleCopyQuickstart = async () => {
    try {
      await navigator.clipboard.writeText(QUICKSTART_SNIPPET);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2200);
    } catch {
      setCopied(false);
    }
  };

  const scrollToSection = (sectionId: string) => {
    const el = document.getElementById(sectionId);
    if (el) {
      const prefersReducedMotion =
        typeof window !== 'undefined' &&
        Boolean(
          window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
        );
      el.scrollIntoView({
        behavior: prefersReducedMotion ? 'auto' : 'smooth',
        block: 'start',
      });
    }
  };

  return (
    <div className="showcase-scroll-root" id="showcase-top">
      {/* Sticky Precision Glass Launch Navigation */}
      <nav className="showcase-nav" aria-label={s.nav.ariaLabel}>
        <div className="showcase-nav-inner">
          <button
            type="button"
            className="showcase-brand"
            onClick={() => scrollToSection('showcase-top')}
          >
            <span className="showcase-brand-badge">DIGITAL ARMORY 3D</span>
            <span className="showcase-brand-ver">{s.nav.versionBadge}</span>
          </button>

          <div className="showcase-nav-links">
            <button
              type="button"
              onClick={() => scrollToSection('capabilities')}
            >
              {s.nav.capabilities}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('documentary')}
            >
              {s.nav.documentary}
            </button>
            <button type="button" onClick={() => scrollToSection('gallery')}>
              {s.nav.gallery}
            </button>
            <button type="button" onClick={() => scrollToSection('arsenal')}>
              {s.nav.arsenal}
            </button>
            <button
              type="button"
              onClick={() => scrollToSection('architecture')}
            >
              {s.nav.architecture}
            </button>
            <button type="button" onClick={() => scrollToSection('quickstart')}>
              {s.nav.quickstart}
            </button>
          </div>

          <div className="showcase-nav-actions">
            <LanguageSwitchPill compact />
            <a
              href={GITHUB_REPO_URL}
              target="_blank"
              rel="noreferrer"
              className="showcase-gh-pill"
            >
              <Star size={13} aria-hidden="true" />
              <span>GitHub</span>
              <ArrowUpRight size={13} aria-hidden="true" />
            </a>
            <button
              type="button"
              className="showcase-launch-pill"
              onClick={returnToArmory}
            >
              <Layers size={14} aria-hidden="true" />
              <span>{s.nav.launchArmory}</span>
              <ArrowRight size={14} aria-hidden="true" />
            </button>
          </div>
        </div>
      </nav>

      {/* ==================== HERO STAGE (LIVE REAL-TIME 3D WEBGL WINDOW) ==================== */}
      <section ref={heroSectionRef} className="showcase-hero">
        <div className="showcase-hero-top">
          <div className="showcase-eyebrow">
            <Sparkles size={12} aria-hidden="true" />
            <span>{s.hero.eyebrow}</span>
          </div>

          <h1 className="showcase-hero-title">
            {s.hero.titlePrefix}
            <span>{s.hero.titleHighlight}</span>
            {s.hero.titleSuffix}
          </h1>

          <p className="showcase-hero-sub">
            {s.hero.subLead}
            <strong>{s.hero.subPartsStrong}</strong>
            {s.hero.subMid1}
            <strong>{s.hero.subMapsStrong}</strong>
            {s.hero.subMid2}
            <strong>{s.hero.subAudioStrong}</strong>
            {s.hero.subTail}
          </p>

          <div className="showcase-hero-ctas">
            <button
              type="button"
              className="showcase-cta-primary"
              onClick={returnToArmory}
            >
              <Layers size={15} aria-hidden="true" />
              <span>{s.hero.ctaArmory}</span>
              <ArrowRight size={15} aria-hidden="true" />
            </button>

            <button
              type="button"
              className="showcase-cta-director"
              onMouseEnter={() => preloadWeaponNarration(featuredWeapon.id)}
              onClick={() => {
                unlockMechanicalAudio();
                void launchDirectorDocumentary(featuredWeapon.id, {
                  minimizeDrawer: true,
                });
              }}
            >
              <Clapperboard size={14} aria-hidden="true" />
              <span>{s.hero.ctaDirector(shortWeaponTag)}</span>
            </button>

            <button
              type="button"
              className="showcase-cta-secondary"
              onClick={() => enterWorkbench(featuredWeapon.id, 'explode')}
            >
              <Wrench size={14} aria-hidden="true" />
              <span>{s.hero.ctaExplode(shortWeaponTag)}</span>
            </button>

            <button
              type="button"
              className="showcase-cta-firing"
              onClick={() => {
                unlockMechanicalAudio();
                enterWorkbench(featuredWeapon.id, 'firing');
              }}
            >
              <Flame size={14} aria-hidden="true" />
              <span>{s.hero.ctaFiring}</span>
            </button>
          </div>
        </div>

        {/* Unobstructed Panoramic Window Revealing Live 60FPS WebGL Turntable Behind */}
        <div
          ref={liveWindowRef}
          className={`showcase-live-window ${isDraggingStage ? 'is-dragging' : ''}`}
          onPointerDown={handleStagePointerDown}
          onPointerMove={handleStagePointerMove}
          onPointerUp={endStagePointerDrag}
          onPointerCancel={endStagePointerDrag}
          title={s.hero.dragStageTitle}
        >
          <div className="showcase-live-telemetry">
            <div className="live-telemetry-head">
              <span className="live-pulse-dot" aria-hidden="true" />
              <span>{s.hero.liveBadge}</span>
            </div>
            <div className="live-telemetry-name">{featuredMeta.name}</div>
            <div className="live-telemetry-meta">
              <span>{featuredWeapon.caliber}</span>
              <span>·</span>
              <span>{s.hero.partsUnit(featuredWeapon.partsCount)}</span>
              <span>·</span>
              <span>OAL {featuredMeta.overallLengthMm}</span>
            </div>
            <div className="live-telemetry-mech">
              {featuredMeta.actionMechanism}
            </div>
          </div>
        </div>

        {/* Interactive Live 3D Turntable Stage Controller */}
        <div className="showcase-stage-dock">
          <div className="stage-dock-controls">
            <div
              className="stage-mode-group"
              role="group"
              aria-label={s.hero.stageGroupAria}
            >
              <span className="stage-ctrl-label">{s.hero.stageLabel}</span>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'pbr' ? 'active' : ''}`}
                aria-pressed={heroMode === 'pbr'}
                onClick={() => applyHeroStageMode('pbr')}
              >
                <Sparkles size={13} aria-hidden="true" />
                <span>{s.hero.modePbr}</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'section' ? 'active-teal' : ''}`}
                aria-pressed={heroMode === 'section'}
                onClick={() => applyHeroStageMode('section')}
              >
                <Scissors size={13} aria-hidden="true" />
                <span>{s.hero.modeSection}</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'xray' ? 'active' : ''}`}
                aria-pressed={heroMode === 'xray'}
                onClick={() => applyHeroStageMode('xray')}
              >
                <Eye size={13} aria-hidden="true" />
                <span>{s.hero.modeXray}</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${heroMode === 'explode' ? 'active-amber' : ''}`}
                aria-pressed={heroMode === 'explode'}
                onClick={() => applyHeroStageMode('explode')}
              >
                <Box size={13} aria-hidden="true" />
                <span>{s.hero.modeExplode}</span>
              </button>
              <button
                type="button"
                className={`stage-mode-btn ${armoryAutoRotate ? 'active-subtle' : ''}`}
                onClick={toggleArmoryAutoRotate}
              >
                <Orbit size={13} aria-hidden="true" />
                <span>
                  {armoryAutoRotate ? s.hero.rotateOn : s.hero.rotateOff}
                </span>
              </button>
            </div>

            <div
              className="stage-weapon-pills"
              aria-label={s.hero.weaponPillsAria}
            >
              {ARMORY_WEAPONS.map((w) => {
                const active = w.id === activeWeaponId;
                return (
                  <button
                    key={w.id}
                    type="button"
                    className={`stage-weapon-pill ${active ? 'active' : ''}`}
                    aria-pressed={active}
                    onMouseEnter={() => preloadWeaponPlugin(w.id)}
                    onClick={() => handleHeroWeaponSwitch(w.id)}
                  >
                    <span className="swp-bay">
                      {w.bayCode.replace('BAY-', '#')}
                    </span>
                    <span>{getLocalizedShortWeaponLabel(w.id, lang)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      {/* ==================== SOLID EDITORIAL CONTENT BODY ==================== */}
      <div className="showcase-editorial-body">
        <div className="showcase-metrics-ribbon">
          <div className="showcase-metrics-bar">
            {s.metrics.map((m, idx) => (
              <div key={idx} className="s-metric-item">
                <div className="s-metric-val">{m.val}</div>
                <div className="s-metric-lbl">{m.lbl}</div>
              </div>
            ))}
          </div>
        </div>

        {/* SECTION 1: FOUR CORE INSPECTION MODES BENTO */}
        <section id="capabilities" className="showcase-section">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">{s.capabilities.kicker}</span>
              <h2 className="section-title">{s.capabilities.title}</h2>
              <p className="section-desc">{s.capabilities.desc}</p>
            </div>

            <div className="bento-grid">
              <article className="bento-card bento-wide">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/ak15-callouts.webp')}
                    alt={s.capabilities.cards.explode.alt}
                    loading="lazy"
                  />
                  <span className="bento-tag">
                    {s.capabilities.cards.explode.tag}
                  </span>
                </div>
                <div className="bento-content">
                  <h3>{s.capabilities.cards.explode.title}</h3>
                  <p>
                    {s.capabilities.cards.explode.descPrefix}
                    <code>L × H × W mm</code>
                    {s.capabilities.cards.explode.descSuffix}
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn"
                    onClick={() => enterWorkbench('ak15', 'explode')}
                  >
                    <Play size={14} aria-hidden="true" />
                    <span>{s.capabilities.cards.explode.cta}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>

              <article className="bento-card bento-wide">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/m82a1-firing.webp')}
                    alt={s.capabilities.cards.firing.alt}
                    loading="lazy"
                  />
                  <span className="bento-tag bento-tag-orange">
                    {s.capabilities.cards.firing.tag}
                  </span>
                </div>
                <div className="bento-content">
                  <h3>{s.capabilities.cards.firing.title}</h3>
                  <p>{s.capabilities.cards.firing.desc}</p>
                  <button
                    type="button"
                    className="bento-action-btn bento-action-orange"
                    onClick={() => {
                      unlockMechanicalAudio();
                      enterWorkbench('m82a1', 'firing');
                    }}
                  >
                    <Flame size={14} aria-hidden="true" />
                    <span>{s.capabilities.cards.firing.cta}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>

              <article className="bento-card">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/ak15-section.webp')}
                    alt={s.capabilities.cards.section.alt}
                    loading="lazy"
                  />
                  <span className="bento-tag bento-tag-teal">
                    {s.capabilities.cards.section.tag}
                  </span>
                </div>
                <div className="bento-content">
                  <h3>{s.capabilities.cards.section.title}</h3>
                  <p>
                    {s.capabilities.cards.section.descPrefix}
                    <code>C</code>
                    {s.capabilities.cards.section.descSuffix}
                  </p>
                  <button
                    type="button"
                    className="bento-action-btn bento-action-teal"
                    onClick={() => launchSectionWorkbench('ak15')}
                  >
                    <Scissors size={14} aria-hidden="true" />
                    <span>{s.capabilities.cards.section.cta}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>

              <article className="bento-card">
                <div className="bento-media">
                  <img
                    src={resolveAssetUrl('showcase/pbr-atlas.webp')}
                    alt={s.capabilities.cards.pbr.alt}
                    loading="lazy"
                  />
                  <span className="bento-tag">
                    {s.capabilities.cards.pbr.tag}
                  </span>
                </div>
                <div className="bento-content">
                  <h3>{s.capabilities.cards.pbr.title}</h3>
                  <p>{s.capabilities.cards.pbr.desc}</p>
                  <button
                    type="button"
                    className="bento-action-btn"
                    onClick={() => setTextureModalOpen(true)}
                  >
                    <ImageIcon size={14} aria-hidden="true" />
                    <span>{s.capabilities.cards.pbr.cta}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </article>
            </div>
          </div>
        </section>

        {/* SECTION 1.5: INTERACTIVE AI 4-ACT DOCUMENTARY, 3D DIRECTOR & WEB AUDIO SOUNDSCAPE */}
        <section
          id="documentary"
          className="showcase-section showcase-section-alt"
        >
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">{s.documentary.kicker}</span>
              <h2 className="section-title">{s.documentary.title}</h2>
              <p className="section-desc">{s.documentary.desc}</p>
            </div>

            <div className="doc-showcase-grid">
              {/* Left Panel: 4-Act 3D Story Director Interactive Launcher */}
              <div className="doc-showcase-panel">
                <div className="doc-panel-badge">
                  <Clapperboard size={13} aria-hidden="true" />
                  <span>{s.documentary.directorBadge}</span>
                </div>
                <h3 className="doc-panel-title">
                  {s.documentary.directorTitle}
                </h3>
                <p className="doc-panel-desc">{s.documentary.directorDesc}</p>

                <div className="doc-acts-timeline">
                  {s.documentary.acts.map((act, idx) => (
                    <div key={idx} className="doc-act-step">
                      <div className="doc-act-step-head">
                        <span className="doc-act-tag">{act.actTag}</span>
                        <span className="doc-act-stage">{act.stageBadge}</span>
                      </div>
                      <h4>{act.title}</h4>
                      <p>{act.detail}</p>
                    </div>
                  ))}
                </div>

                <div className="doc-weapon-picker">
                  <span className="doc-picker-label">
                    {s.documentary.pickWeaponLabel}
                  </span>
                  <div className="doc-picker-pills">
                    {ARMORY_WEAPONS.map((w) => {
                      const active = w.id === docWeaponId;
                      return (
                        <button
                          key={w.id}
                          type="button"
                          className={`doc-weapon-pill ${active ? 'active' : ''}`}
                          aria-pressed={active}
                          onMouseEnter={() => {
                            preloadWeaponPlugin(w.id);
                            preloadWeaponNarration(w.id);
                          }}
                          onClick={() => setDocWeaponId(w.id)}
                        >
                          {getLocalizedShortWeaponLabel(w.id, lang)}
                        </button>
                      );
                    })}
                  </div>
                </div>

                <div className="doc-panel-ctas">
                  <button
                    type="button"
                    className="showcase-cta-director"
                    onClick={() => {
                      unlockMechanicalAudio();
                      void launchDirectorDocumentary(docWeaponId, {
                        minimizeDrawer: true,
                      });
                    }}
                  >
                    <Headphones size={14} aria-hidden="true" />
                    <span>{s.documentary.launchTourCta(docShortTag)}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>

                  <button
                    type="button"
                    className="showcase-cta-secondary"
                    onClick={() => {
                      unlockMechanicalAudio();
                      void launchDirectorDocumentary(docWeaponId, {
                        minimizeDrawer: false,
                      });
                    }}
                  >
                    <BookOpen size={14} aria-hidden="true" />
                    <span>{s.documentary.openDrawerCta}</span>
                  </button>
                </div>
              </div>

              {/* Right Panel: Procedural Web Audio 6-Caliber & 7-Stage Foley Matrix */}
              <div className="doc-showcase-panel doc-sound-panel">
                <div className="doc-panel-badge sound">
                  <Volume2 size={13} aria-hidden="true" />
                  <span>{s.documentary.soundBadge}</span>
                </div>
                <h3 className="doc-panel-title">{s.documentary.soundTitle}</h3>
                <p className="doc-panel-desc">{s.documentary.soundDesc}</p>

                <div className="caliber-sound-table">
                  {s.documentary.caliberRows.map((row, idx) => (
                    <div key={idx} className="caliber-sound-row">
                      <div className="cs-row-top">
                        <strong className="cs-caliber">{row.caliber}</strong>
                        <span className="cs-weapon">{row.weaponTag}</span>
                        <span className="cs-freq">{row.freqTag}</span>
                      </div>
                      <p className="cs-sig">{row.signature}</p>
                    </div>
                  ))}
                </div>

                <ul className="doc-sound-features">
                  {s.documentary.soundFeatures.map((feat, idx) => (
                    <li key={idx}>{feat}</li>
                  ))}
                </ul>

                <div className="doc-panel-ctas">
                  <button
                    type="button"
                    className="showcase-cta-firing"
                    onClick={launchSlowMoAcousticDemo}
                  >
                    <Flame size={14} aria-hidden="true" />
                    <span>{s.documentary.testSlowMoCta}</span>
                    <ArrowRight size={14} aria-hidden="true" />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* SECTION 2: HIGH-RES WEBGL 2.0 GALLERY */}
        <section id="gallery" className="showcase-section">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">{s.gallery.kicker}</span>
              <h2 className="section-title">{s.gallery.title}</h2>
              <p className="section-desc">{s.gallery.desc}</p>
            </div>

            <div className="gallery-grid">
              {s.gallery.items.map((item) => (
                <div key={item.id} className="gallery-card">
                  <button
                    type="button"
                    className="gallery-img-btn"
                    onClick={() => setLightboxItemId(item.id)}
                    title={s.gallery.zoomTitle}
                  >
                    <img
                      src={resolveAssetUrl(item.imageFile)}
                      alt={item.title}
                      loading="lazy"
                    />
                    <span className="gallery-zoom-pill">
                      {s.gallery.zoomPill}
                    </span>
                  </button>
                  <div className="gallery-card-body">
                    <div className="gallery-badge">{item.badge}</div>
                    <h3 className="gallery-title">{item.title}</h3>
                    <p className="gallery-sub">{item.subtitle}</p>
                    <button
                      type="button"
                      className="gallery-launch-link"
                      onClick={() => handleGalleryAction(item)}
                    >
                      <span>{item.ctaLabel}</span>
                      <ArrowRight size={13} aria-hidden="true" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* SECTION 3: 10-WEAPON MASTER ARSENAL MATRIX */}
        <section
          id="arsenal"
          className="showcase-section showcase-section-alt"
        >
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">{s.arsenal.kicker}</span>
              <h2 className="section-title">{s.arsenal.title}</h2>
              <p className="section-desc">{s.arsenal.desc}</p>
            </div>

            <div
              className="arsenal-filter-bar"
              role="group"
              aria-label={s.arsenal.filterAria}
            >
              {CATEGORY_KEYS.map((catKey) => {
                const count = ARMORY_WEAPONS.filter((w) =>
                  matchesArmoryCategory(w, catKey)
                ).length;
                const isSelected = category === catKey;
                return (
                  <button
                    key={catKey}
                    type="button"
                    className={`arsenal-tab ${isSelected ? 'active' : ''}`}
                    aria-pressed={isSelected}
                    onClick={() => setCategory(catKey)}
                  >
                    {s.arsenal.categories[catKey]} ({count})
                  </button>
                );
              })}
            </div>

            <div className="arsenal-grid">
              {filteredWeapons.map((item) => {
                const wMeta = resolveWeaponDisplayMeta(item.id, lang, null);
                const originLabel = wMeta.originTag;
                return (
                  <article
                    key={item.id}
                    className="arsenal-card"
                    onMouseEnter={() => {
                      preloadWeaponPlugin(item.id);
                      preloadWeaponNarration(item.id);
                    }}
                  >
                    <div className="arsenal-card-top">
                      <span className="arsenal-bay">{item.bayCode}</span>
                      <span className="arsenal-origin">
                        <Globe2 size={11} aria-hidden="true" />
                        <span>{originLabel}</span>
                      </span>
                      <span className="arsenal-parts-pill">
                        {s.arsenal.partsPill(item.partsCount)}
                      </span>
                    </div>

                    <div className="arsenal-silhouette">
                      <WeaponSilhouetteSvg
                        id={item.id}
                        available={item.available}
                      />
                    </div>

                    <div className="arsenal-head">
                      <h3>{wMeta.name}</h3>
                      <div className="arsenal-code">{item.modelCode}</div>
                    </div>

                    <p className="arsenal-mech">{wMeta.actionMechanism}</p>

                    <div className="arsenal-specs">
                      <div className="a-spec">
                        <span>{s.arsenal.specCaliber}</span>
                        <strong>{item.caliber}</strong>
                      </div>
                      <div className="a-spec">
                        <span>{s.arsenal.specOal}</span>
                        <strong>{wMeta.overallLengthMm}</strong>
                      </div>
                      <div className="a-spec">
                        <span>{s.arsenal.specVel}</span>
                        <strong>{item.specs1To1.muzzleVelocityMs}</strong>
                      </div>
                      <div className="a-spec">
                        <span>{s.arsenal.specRange}</span>
                        <strong>{item.specs1To1.effectiveRangeM}</strong>
                      </div>
                    </div>

                    <div className="arsenal-actions arsenal-actions-three">
                      <button
                        type="button"
                        className="arsenal-btn-explode"
                        aria-label={`${s.arsenal.btnExplode} — ${wMeta.shortLabel}`}
                        onClick={() => enterWorkbench(item.id, 'explode')}
                      >
                        <Wrench size={13} aria-hidden="true" />
                        <span>{s.arsenal.btnExplode}</span>
                      </button>
                      <button
                        type="button"
                        className="arsenal-btn-fire"
                        aria-label={`${s.arsenal.btnFire} — ${wMeta.shortLabel}`}
                        onClick={() => {
                          unlockMechanicalAudio();
                          enterWorkbench(item.id, 'firing');
                        }}
                      >
                        <Flame size={13} aria-hidden="true" />
                        <span>{s.arsenal.btnFire}</span>
                      </button>
                      <button
                        type="button"
                        className="arsenal-btn-story"
                        aria-label={`${s.arsenal.btnStory} — ${wMeta.shortLabel}`}
                        onClick={() => {
                          unlockMechanicalAudio();
                          void launchDirectorDocumentary(item.id, {
                            minimizeDrawer: true,
                          });
                        }}
                      >
                        <Clapperboard size={13} aria-hidden="true" />
                        <span>{s.arsenal.btnStory}</span>
                      </button>
                    </div>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 4: 6-PILLAR ENGINE ARCHITECTURE */}
        <section id="architecture" className="showcase-section">
          <div className="showcase-container">
            <div className="section-header">
              <span className="section-kicker">{s.architecture.kicker}</span>
              <h2 className="section-title">{s.architecture.title}</h2>
              <p className="section-desc">{s.architecture.desc}</p>
            </div>

            <div
              className="pipeline-ribbon"
              aria-label={s.architecture.pipelineAria}
            >
              {s.architecture.pipelineSteps.map((stepLabel, idx) => (
                <React.Fragment key={idx}>
                  {idx > 0 && (
                    <ArrowRight
                      size={14}
                      className="pipe-arrow"
                      aria-hidden="true"
                    />
                  )}
                  <div className="pipe-step">
                    <span className="pipe-num">
                      {String(idx + 1).padStart(2, '0')}
                    </span>
                    <span>{stepLabel}</span>
                  </div>
                </React.Fragment>
              ))}
            </div>

            <div className="arch-grid">
              {s.architecture.pillars.map((pillar) => {
                const IconComp = ARCH_ICONS[pillar.iconKey];
                return (
                  <div key={pillar.code} className="arch-card">
                    <div className="arch-card-head">
                      <div className="arch-icon-box">
                        <IconComp size={18} aria-hidden="true" />
                      </div>
                      <span className="arch-code">{pillar.code}</span>
                      <span className="arch-metric">{pillar.metric}</span>
                    </div>
                    <h3>{pillar.title}</h3>
                    <p>{pillar.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* SECTION 5: DEVELOPER QUICK-START, SHORTCUTS & FINAL CTA */}
        <section
          id="quickstart"
          className="showcase-section showcase-section-alt"
        >
          <div className="showcase-container">
            <div className="quickstart-layout">
              <div className="quickstart-panel">
                <div className="qs-head">
                  <div className="qs-title-group">
                    <Terminal
                      size={16}
                      className="qs-icon"
                      aria-hidden="true"
                    />
                    <span>{s.quickstart.cloneTitle}</span>
                  </div>
                  <button
                    type="button"
                    className="qs-copy-btn"
                    onClick={handleCopyQuickstart}
                  >
                    {copied ? (
                      <Check size={13} aria-hidden="true" />
                    ) : (
                      <Copy size={13} aria-hidden="true" />
                    )}
                    <span>
                      {copied ? s.quickstart.copied : s.quickstart.copy}
                    </span>
                  </button>
                </div>
                <pre className="qs-code">
                  <code>{QUICKSTART_SNIPPET}</code>
                </pre>
                <div className="qs-badges">
                  <span>
                    <Zap size={12} aria-hidden="true" /> Node.js &gt;= 20
                  </span>
                  <span>
                    <Ruler size={12} aria-hidden="true" /> TypeScript Strict +
                    ESLint 10
                  </span>
                  <span>
                    <Shield size={12} aria-hidden="true" />{' '}
                    {s.quickstart.badgeTests}
                  </span>
                </div>
              </div>

              <div className="shortcuts-panel">
                <div className="qs-head">
                  <div className="qs-title-group">
                    <Keyboard
                      size={16}
                      className="qs-icon"
                      aria-hidden="true"
                    />
                    <span>{s.quickstart.shortcutsTitle}</span>
                  </div>
                </div>
                <div className="shortcuts-list">
                  {s.quickstart.shortcuts.map((sc) => (
                    <div key={sc.key} className="shortcut-row">
                      <kbd className="shortcut-kbd">{sc.key}</kbd>
                      <span>{sc.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            {/* Final Closing Banner */}
            <div className="final-cta-banner">
              <div>
                <div className="final-cta-kicker">
                  {s.quickstart.finalKicker}
                </div>
                <h2 className="final-cta-title">{s.quickstart.finalTitle}</h2>
                <p className="final-cta-sub">{s.quickstart.finalSub}</p>
              </div>
              <div className="final-cta-buttons">
                <button
                  type="button"
                  className="showcase-cta-primary"
                  onClick={returnToArmory}
                >
                  <Layers size={16} aria-hidden="true" />
                  <span>{s.quickstart.finalLaunchBtn}</span>
                  <ArrowRight size={16} aria-hidden="true" />
                </button>
                <a
                  href={GITHUB_REPO_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="showcase-cta-github-solid"
                >
                  <Star size={16} aria-hidden="true" />
                  <span>{s.quickstart.finalStarBtn}</span>
                  <ArrowUpRight size={15} aria-hidden="true" />
                </a>
              </div>
            </div>

            <footer className="showcase-footer">
              <div className="footer-left">
                <strong>{s.quickstart.footerBrand}</strong>
                <span>{s.quickstart.footerDisclaimer}</span>
              </div>
              <div className="footer-right">
                <span>MIT License</span>
                <span>·</span>
                <a href={GITHUB_REPO_URL} target="_blank" rel="noreferrer">
                  zhoujingkun1989-arch/digital-armory-3d
                </a>
              </div>
            </footer>
          </div>
        </section>
      </div>

      {/* High-Res Screenshot Lightbox Modal */}
      {lightboxItem && (
        <div
          className="showcase-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={lightboxItem.title}
          onClick={() => setLightboxItemId(null)}
        >
          <div
            className="showcase-lightbox-card"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="lightbox-top">
              <div>
                <span className="gallery-badge">{lightboxItem.badge}</span>
                <h3>{lightboxItem.title}</h3>
              </div>
              <div className="lightbox-top-actions">
                <button
                  type="button"
                  className="showcase-launch-pill"
                  onClick={() => handleGalleryAction(lightboxItem)}
                >
                  <span>{lightboxItem.ctaLabel}</span>
                  <ArrowRight size={13} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="lightbox-close-btn"
                  onClick={() => setLightboxItemId(null)}
                  aria-label={s.gallery.closeLightboxAria}
                >
                  <X size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            <img
              src={resolveAssetUrl(lightboxItem.imageFile)}
              alt={lightboxItem.title}
              className="lightbox-img"
            />
            <p className="lightbox-caption">{lightboxItem.subtitle}</p>
          </div>
        </div>
      )}
    </div>
  );
};

export default ShowcaseView;

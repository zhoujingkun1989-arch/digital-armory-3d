import React, { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  Award,
  BookOpen,
  Box,
  Camera,
  ChevronDown,
  Clock,
  Compass,
  Crosshair,
  Eye,
  Flame,
  GitCompareArrows,
  HardDrive,
  Image as ImageIcon,
  Layers,
  Menu,
  Palette,
  Printer,
  RotateCcw,
  Ruler,
  Scissors,
  Share2,
  Shield,
  ShieldAlert,
  SlidersHorizontal,
  Sparkles,
  Tag,
  Video,
  Volume2,
  VolumeX,
  Wrench,
  X,
} from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import { DEFAULT_ATTACHMENT_LOADOUT } from '../../engine/attachments/attachmentSpecs';
import { useAttachmentStore } from '../../engine/attachments/attachmentStore';
import { scheduleHudBoundsRefresh } from '../../engine/callout/hudBoundsCache';
import { isTankWeapon } from '../../engine/physics/armoryPhysics';
import { useTankCrewStore } from '../../engine/tank/tankCrewStore';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_TIMELINE_SPAN_ASCII,
  resolveArmorLabPresetForWeapon,
} from '../../weapons/museumMetrics';
import type { CameraPresetType } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
import { launchMechanismShowdownFromPalette } from './commandPaletteEngine';
import { StudioEnvironmentBar } from './StudioEnvironmentBar';

const VIEW_ANGLE_KEYS: Extract<
  CameraPresetType,
  'iso' | 'right' | 'left' | 'top'
>[] = ['iso', 'right', 'left', 'top'];

export const WorkbenchHeader: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const storyOpen = useAppStore((s) => s.storyOpen);
  const toggleStoryOpen = useAppStore((s) => s.toggleStoryOpen);
  const returnToArmory = useAppStore((s) => s.returnToArmory);
  const mode = useAppStore((s) => s.mode);
  const setMode = useAppStore((s) => s.setMode);
  const pbrTexturesEnabled = useAppStore((s) => s.pbrTexturesEnabled);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const fieldStripActive = useAppStore((s) => s.fieldStripActive);
  const malfunctionActive = useAppStore((s) => s.malfunctionActive);
  const caliperActive = useAppStore((s) => s.caliperActive);
  const causalitySandboxOpen = useAppStore((s) => s.causalitySandboxOpen);
  const armorPenetrationModalOpen = useAppStore(
    (s) => s.armorPenetrationModalOpen
  );
  const showEdges = useAppStore((s) => s.showEdges);
  const showLabels = useAppStore((s) => s.showLabels);
  const sfxMuted = useAppStore((s) => s.sfxMuted);
  const hudHidden = useAppStore((s) => s.hudHidden);
  const cameraPreset = useAppStore((s) => s.cameraCommand.preset);

  const togglePbrTextures = useAppStore((s) => s.togglePbrTextures);
  const setTextureModalOpen = useAppStore((s) => s.setTextureModalOpen);
  const openMonographModal = useAppStore((s) => s.openMonographModal);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const toggleEngineeringTint = useAppStore((s) => s.toggleEngineeringTint);
  const toggleFieldStripMode = useAppStore((s) => s.toggleFieldStripMode);
  const toggleMalfunctionMode = useAppStore((s) => s.toggleMalfunctionMode);
  const toggleCaliperMode = useAppStore((s) => s.toggleCaliperMode);
  const openCartridgeLab = useAppStore((s) => s.openCartridgeLab);
  const openExternalBallistics = useAppStore((s) => s.openExternalBallistics);
  const openPosterModal = useAppStore((s) => s.openPosterModal);
  const toggleCausalitySandbox = useAppStore((s) => s.toggleCausalitySandbox);
  const openArmorPenetrationModal = useAppStore(
    (s) => s.openArmorPenetrationModal
  );
  const openDirectorReelModal = useAppStore((s) => s.openDirectorReelModal);
  const openPassportModal = useAppStore((s) => s.openPassportModal);
  const openTimelineModal = useAppStore((s) => s.openTimelineModal);
  const openOfflineModal = useAppStore((s) => s.openOfflineModal);
  const tankCrewActive = useTankCrewStore((s) => s.active);
  const toggleTankCrew = useTankCrewStore((s) => s.toggleActive);
  const attachmentBenchOpen = useAttachmentStore((s) => s.benchOpen);
  const toggleAttachmentBench = useAttachmentStore((s) => s.toggleBenchOpen);
  const activeAttachmentLoadout = useAttachmentStore(
    (s) => s.loadouts[activeWeaponId] ?? DEFAULT_ATTACHMENT_LOADOUT
  );
  const hasMountedAttachments =
    activeAttachmentLoadout.muzzle !== 'none' ||
    activeAttachmentLoadout.optic !== 'none';
  const isTank = isTankWeapon(activeWeaponId);
  const toggleShowEdges = useAppStore((s) => s.toggleShowEdges);
  const toggleShowLabels = useAppStore((s) => s.toggleShowLabels);
  const toggleSfxMuted = useAppStore((s) => s.toggleSfxMuted);
  const triggerCameraPreset = useAppStore((s) => s.triggerCameraPreset);
  const resetAll = useAppStore((s) => s.resetAll);

  const [toolsMenuOpen, setToolsMenuOpen] = useState(false);
  const [mobileToolsOpen, setMobileToolsOpen] = useState(false);
  const toolsPopoverRef = useRef<HTMLDivElement>(null);
  const isToolsMenuOpen = toolsMenuOpen && !hudHidden;
  const isMobileToolsOpen = mobileToolsOpen && !hudHidden;

  const { bundle } = useWeaponNarration(activeWeaponId);
  const manifest = getWeaponManifest(activeWeaponId);
  const meta = manifest.workbenchMeta;
  const partsCount = manifest.catalog.partsCount;
  const ui = UI_STRINGS[lang].workbench;
  const monoUi = UI_STRINGS[lang].monograph;
  const menuUi = COMMAND_PALETTE_STRINGS[lang].workbenchMenus;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  const hasSecondaryActive =
    (fieldStripActive && mode === 'explode') ||
    (mode === 'firing' && !malfunctionActive) ||
    malfunctionActive ||
    attachmentBenchOpen ||
    hasMountedAttachments ||
    causalitySandboxOpen ||
    armorPenetrationModalOpen ||
    (isTank && tankCrewActive) ||
    showEdges ||
    !pbrTexturesEnabled;

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [activeWeaponId, lang, mode, showLabels, sectionCut, isMobileToolsOpen]);

  useEffect(() => {
    if (!isMobileToolsOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setMobileToolsOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown, true);
    return () => window.removeEventListener('keydown', onKeyDown, true);
  }, [isMobileToolsOpen]);

  useEffect(() => {
    if (!isToolsMenuOpen) return;
    const onPointerDown = (e: PointerEvent) => {
      if (
        toolsPopoverRef.current &&
        e.target instanceof Node &&
        !toolsPopoverRef.current.contains(e.target)
      ) {
        setToolsMenuOpen(false);
      }
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        setToolsMenuOpen(false);
      }
    };
    window.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('keydown', onKeyDown);
    return () => {
      window.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('keydown', onKeyDown);
    };
  }, [isToolsMenuOpen]);

  return (
    <header
      className={`top-bar ${isMobileToolsOpen ? 'is-mobile-expanded' : ''}`}
    >
      <div className="brand-block">
        <button
          type="button"
          className="back-armory-btn"
          onClick={returnToArmory}
          title={ui.backTitle}
        >
          <ArrowLeft size={14} />
          <span>{ui.backBtn}</span>
        </button>

        <div className="brand-badge">{meta.badge}</div>
        <div className="brand-title-wrap">
          <h1 className="brand-title" title={displayMeta.workbenchTitle}>
            {displayMeta.workbenchTitle}
          </h1>
          <p className="brand-sub">{displayMeta.workbenchSubtitle}</p>
        </div>

        {/* Compact Mobile Quick Controls (<= 768px keeps header <= 56px single row) */}
        <div className="wb-mobile-actions">
          <button
            type="button"
            className={`toggle-chip wb-accent-cutaway wb-mobile-cut-btn ${
              sectionCut ? 'active-teal' : ''
            }`}
            aria-pressed={sectionCut}
            aria-label={ui.sectionChip}
            title={ui.sectionChipTitle}
            onClick={toggleSectionCut}
          >
            <Scissors size={14} aria-hidden="true" />
          </button>

          <button
            type="button"
            className={`toggle-chip wb-mobile-drawer-btn ${
              isMobileToolsOpen ? 'active-cyan' : ''
            }`}
            aria-expanded={isMobileToolsOpen}
            aria-label={
              lang === 'zh' ? '展开工作台工具栏' : 'Toggle workbench tools'
            }
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setMobileToolsOpen((prev) => !prev);
            }}
          >
            {isMobileToolsOpen ? (
              <X size={15} aria-hidden="true" />
            ) : (
              <Menu size={15} aria-hidden="true" />
            )}
            <span>{lang === 'zh' ? '工具' : 'Tools'}</span>
          </button>
        </div>
      </div>

      <div className="toolbar-cluster toolbar-cluster-primary">
        <StudioEnvironmentBar compact />

        <LanguageSwitchPill compact />

        <button
          type="button"
          className={`toggle-chip ${storyOpen ? 'active-cyan' : ''}`}
          onClick={toggleStoryOpen}
          title={ui.storyChipTitle}
        >
          <BookOpen size={13} />
          <span>{ui.storyChip}</span>
        </button>
      </div>

      <div className="toolbar-cluster toolbar-cluster-tools">
        <div className="camera-pills">
          <Camera size={13} className="cam-icon" />
          {VIEW_ANGLE_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              className={`cam-btn ${cameraPreset === key ? 'active' : ''}`}
              onClick={() => triggerCameraPreset(key)}
            >
              {ui.viewAngles[key]}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        {/* Hero 3D Cutaway & Engineering Inspection Controls */}
        <button
          type="button"
          className={`toggle-chip wb-accent-cutaway ${
            sectionCut ? 'active-teal' : ''
          }`}
          aria-pressed={sectionCut}
          onClick={toggleSectionCut}
          title={ui.sectionChipTitle}
        >
          <Scissors size={13} aria-hidden="true" />
          <span>{ui.sectionChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${xrayShells ? 'active-cyan' : ''}`}
          aria-pressed={xrayShells}
          onClick={toggleXrayShells}
          title={ui.xrayChipTitle}
        >
          <Eye size={13} aria-hidden="true" />
          <span>{ui.xrayChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${engineeringTint ? 'active-amber' : ''}`}
          aria-pressed={engineeringTint}
          onClick={toggleEngineeringTint}
          title={ui.tintChipTitle}
        >
          <Palette size={13} aria-hidden="true" />
          <span>{ui.tintChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${caliperActive ? 'active-cyan' : ''}`}
          aria-pressed={caliperActive}
          onClick={toggleCaliperMode}
          title={ui.caliperChipTitle}
        >
          <Ruler size={13} aria-hidden="true" />
          <span>{ui.caliperChip}</span>
        </button>

        {/* Consolidated Labs, Interactive Modes & CAD Overlays Menu */}
        <div ref={toolsPopoverRef} className="studio-popover-wrap">
          <button
            type="button"
            className={`toggle-chip workbench-tools-trigger wb-accent-labs ${
              isToolsMenuOpen ? 'active-cyan' : ''
            }`}
            aria-expanded={isToolsMenuOpen}
            aria-haspopup="menu"
            title={menuUi.toolsBtnTitle}
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setToolsMenuOpen((prev) => !prev);
            }}
          >
            <Layers size={13} aria-hidden="true" />
            <span>{menuUi.toolsBtnLabel}</span>
            {hasSecondaryActive && !isToolsMenuOpen && (
              <span className="popover-active-dot" aria-hidden="true" />
            )}
            <ChevronDown
              size={11}
              className={`popover-caret ${isToolsMenuOpen ? 'is-open' : ''}`}
              aria-hidden="true"
            />
          </button>

          {isToolsMenuOpen && (
            <div
              className="workbench-popover-menu workbench-tools-popover"
              role="menu"
              aria-label={menuUi.toolsPopoverAria}
            >
              <div className="popover-section">
                <div className="popover-section-head">
                  <span>{menuUi.toolsModesHeading}</span>
                </div>
                <div className="popover-chip-grid">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={fieldStripActive && mode === 'explode'}
                    className={`toggle-chip ${
                      fieldStripActive && mode === 'explode'
                        ? 'active-emerald'
                        : ''
                    }`}
                    onClick={() => {
                      toggleFieldStripMode();
                      setToolsMenuOpen(false);
                    }}
                    title={ui.fieldStripChipTitle}
                  >
                    <Wrench size={13} aria-hidden="true" />
                    <span>{ui.fieldStripChip}</span>
                    <kbd className="popover-kbd">G</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={mode === 'firing' && !malfunctionActive}
                    className={`toggle-chip ${
                      mode === 'firing' && !malfunctionActive
                        ? 'active-orange'
                        : ''
                    }`}
                    onClick={() => {
                      setMode(
                        mode === 'firing' && !malfunctionActive
                          ? 'explode'
                          : 'firing'
                      );
                      setToolsMenuOpen(false);
                    }}
                    title={ui.firingChipTitle}
                  >
                    <Flame size={13} aria-hidden="true" />
                    <span>{ui.firingChip}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={malfunctionActive}
                    className={`toggle-chip ${
                      malfunctionActive ? 'active-amber' : ''
                    }`}
                    onClick={() => {
                      toggleMalfunctionMode();
                      setToolsMenuOpen(false);
                    }}
                    title={ui.malfunctionChipTitle}
                  >
                    <ShieldAlert size={13} aria-hidden="true" />
                    <span>{ui.malfunctionChip}</span>
                    <kbd className="popover-kbd">J</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={attachmentBenchOpen}
                    className={`toggle-chip ${
                      attachmentBenchOpen || hasMountedAttachments
                        ? 'active-amber'
                        : ''
                    }`}
                    onClick={() => {
                      playWorkbenchFoley('toggle_switch');
                      toggleAttachmentBench();
                      setToolsMenuOpen(false);
                    }}
                    title={ui.attachmentsChipTitle}
                  >
                    <Crosshair size={13} aria-hidden="true" />
                    <span>{ui.attachmentsChip}</span>
                    <kbd className="popover-kbd">O</kbd>
                  </button>
                </div>
              </div>

              <div className="popover-section">
                <div className="popover-section-head">
                  <span>{menuUi.toolsLabsHeading}</span>
                </div>
                <div className="popover-chip-grid">
                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openCartridgeLab();
                    }}
                    title={ui.cartridgeChipTitle}
                  >
                    <Crosshair size={13} aria-hidden="true" />
                    <span>{ui.cartridgeChip}</span>
                    <kbd className="popover-kbd">B</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openExternalBallistics(manifest.caliberProfile);
                    }}
                    title={ui.ballisticsChipTitle}
                  >
                    <Compass size={13} aria-hidden="true" />
                    <span>{ui.ballisticsChip}</span>
                    <kbd className="popover-kbd">R</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      launchMechanismShowdownFromPalette();
                    }}
                    title={menuUi.showdownTitle}
                  >
                    <GitCompareArrows size={13} aria-hidden="true" />
                    <span>{menuUi.showdownLabel}</span>
                    <kbd className="popover-kbd">S</kbd>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      useAppStore.getState().openSplitShowdown(activeWeaponId);
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
                    role="menuitemcheckbox"
                    aria-checked={causalitySandboxOpen}
                    className={`toggle-chip ${
                      causalitySandboxOpen ? 'active-cyan' : ''
                    }`}
                    onClick={() => {
                      setToolsMenuOpen(false);
                      toggleCausalitySandbox();
                    }}
                    title={
                      lang === 'en'
                        ? 'Tune gas port, spring k, bolt mass, and powder charge live'
                        : '实时调节导气量、复进簧刚度、机框质量与装药量并驱动 3D 循环'
                    }
                  >
                    <SlidersHorizontal size={13} aria-hidden="true" />
                    <span>
                      {lang === 'en' ? 'Causality Sandbox' : '物理因果沙盒'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openArmorPenetrationModal(
                        resolveArmorLabPresetForWeapon(activeWeaponId)
                      );
                    }}
                    title={
                      lang === 'en'
                        ? 'Evaluate APFSDS / APCR vs composite armor & ERA layers'
                        : '进入 1:1 主战坦克复合装甲抗弹与穿甲推演台'
                    }
                  >
                    <Shield size={13} aria-hidden="true" />
                    <span>
                      {lang === 'en' ? 'Armor Penetration' : '穿甲抗弹实验室'}
                    </span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openDirectorReelModal();
                    }}
                    title={
                      lang === 'en'
                        ? 'Record 3D mechanical showcase reel video'
                        : '录制导出 60fps 3D 导演机械短片'
                    }
                  >
                    <Video size={13} aria-hidden="true" />
                    <span>{lang === 'en' ? 'Director Reel' : '导演短片录制'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openPassportModal();
                    }}
                    title={
                      lang === 'en'
                        ? `View ${MUSEUM_EXHIBIT_COUNT}-exhibit Armorer Certification Passport`
                        : `查看全馆 ${MUSEUM_EXHIBIT_COUNT} 展品军械师资格护照与档案`
                    }
                  >
                    <Award size={13} aria-hidden="true" />
                    <span>{lang === 'en' ? 'Passport' : '军械师护照'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openTimelineModal();
                    }}
                    title={
                      lang === 'en'
                        ? `Open ${MUSEUM_TIMELINE_SPAN_ASCII} Firearms & Armor History Timeline`
                        : `浏览 ${MUSEUM_TIMELINE_SPAN_ASCII} 全馆专利谱系演化时间轴`
                    }
                  >
                    <Clock size={13} aria-hidden="true" />
                    <span>{lang === 'en' ? 'History Timeline' : '演化时间轴'}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      openOfflineModal();
                    }}
                    title={
                      lang === 'en'
                        ? 'Manage Offline PWA Cache & GPU KTX2 Pipeline'
                        : '管理 PWA 离线博物馆缓存包与 KTX2 管线'
                    }
                  >
                    <HardDrive size={13} aria-hidden="true" />
                    <span>{lang === 'en' ? 'Offline Cache' : '离线缓存包'}</span>
                  </button>

                  {isTank && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={tankCrewActive}
                      className={`toggle-chip ${
                        tankCrewActive ? 'active-emerald' : ''
                      }`}
                      onClick={() => {
                        setToolsMenuOpen(false);
                        toggleTankCrew();
                      }}
                      title={
                        lang === 'en'
                          ? 'Open 1:1 Tank Crew Station (Turret Yaw / FLIR FCS)'
                          : '开启 1:1 主战坦克车长/炮长火控台（炮塔回转与热像瞄准）'
                      }
                    >
                      <Crosshair size={13} aria-hidden="true" />
                      <span>
                        {lang === 'en' ? 'Tank Crew FCS' : '坦克车长火控台'}
                      </span>
                    </button>
                  )}
                </div>
              </div>

              <div className="popover-section">
                <div className="popover-section-head">
                  <span>{menuUi.toolsVisualsHeading}</span>
                </div>
                <div className="popover-chip-grid">
                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={pbrTexturesEnabled}
                    className={`toggle-chip ${
                      pbrTexturesEnabled ? 'active-cyan' : ''
                    }`}
                    onClick={togglePbrTextures}
                    title={ui.pbrChipTitle}
                  >
                    <Sparkles size={13} aria-hidden="true" />
                    <span>{ui.pbrChip}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitem"
                    className="toggle-chip"
                    onClick={() => {
                      setToolsMenuOpen(false);
                      setTextureModalOpen(true);
                    }}
                    title={ui.atlasChipTitle}
                  >
                    <ImageIcon size={13} aria-hidden="true" />
                    <span>{ui.atlasChip}</span>
                  </button>

                  <button
                    type="button"
                    role="menuitemcheckbox"
                    aria-checked={showEdges}
                    className={`toggle-chip ${showEdges ? 'active' : ''}`}
                    onClick={toggleShowEdges}
                    title={ui.edgesChipTitle}
                  >
                    <Box size={13} aria-hidden="true" />
                    <span>{ui.edgesChip}</span>
                    <kbd className="popover-kbd">E</kbd>
                  </button>

                  {mode === 'explode' && (
                    <button
                      type="button"
                      role="menuitemcheckbox"
                      aria-checked={showLabels}
                      className={`toggle-chip ${showLabels ? 'active' : ''}`}
                      onClick={toggleShowLabels}
                      title={ui.labelsChipTitle(partsCount)}
                    >
                      <Tag size={13} aria-hidden="true" />
                      <span>{ui.labelsChip}</span>
                      <kbd className="popover-kbd">L</kbd>
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        <div className="toolbar-divider" />

        <button
          type="button"
          className="toggle-chip wb-ghost-chip"
          onClick={() => openPosterModal({ weaponId: activeWeaponId })}
          title={ui.posterChipTitle}
        >
          <Share2 size={13} aria-hidden="true" />
          <span>{ui.posterChip}</span>
        </button>

        <button
          type="button"
          className="toggle-chip wb-ghost-chip"
          onClick={() => openMonographModal(activeWeaponId)}
          title={monoUi.entryChipTitle}
        >
          <Printer size={13} aria-hidden="true" />
          <span>{monoUi.entryChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip wb-ghost-chip ${
            sfxMuted ? 'is-sfx-muted' : ''
          }`}
          aria-pressed={!sfxMuted}
          onClick={toggleSfxMuted}
          title={ui.sfxChipTitle(sfxMuted)}
        >
          {sfxMuted ? (
            <VolumeX size={13} aria-hidden="true" />
          ) : (
            <Volume2 size={13} aria-hidden="true" />
          )}
          <span>{ui.sfxChip}</span>
        </button>

        <button
          type="button"
          className="toggle-chip reset-chip"
          onClick={resetAll}
          title={ui.resetChipTitle}
        >
          <RotateCcw size={13} aria-hidden="true" />
          <span>{ui.resetChip}</span>
        </button>
      </div>
    </header>
  );
};

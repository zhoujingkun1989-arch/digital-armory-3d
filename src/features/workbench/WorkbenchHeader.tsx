import React from 'react';
import {
  ArrowLeft,
  BookOpen,
  Box,
  Camera,
  Crosshair,
  Eye,
  Flame,
  Image as ImageIcon,
  Palette,
  Printer,
  RotateCcw,
  Ruler,
  Scissors,
  ShieldAlert,
  Sparkles,
  Tag,
  Volume2,
  VolumeX,
  Wrench,
} from 'lucide-react';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { resolveWeaponDisplayMeta } from '../../i18n/weaponFallbacks';
import { useWeaponNarration } from '../../narration/narrationService';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import type { CameraPresetType } from '../../weapons/types';
import { LanguageSwitchPill } from '../story/LanguageSwitchPill';
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
  const showEdges = useAppStore((s) => s.showEdges);
  const showLabels = useAppStore((s) => s.showLabels);
  const sfxMuted = useAppStore((s) => s.sfxMuted);
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
  const toggleShowEdges = useAppStore((s) => s.toggleShowEdges);
  const toggleShowLabels = useAppStore((s) => s.toggleShowLabels);
  const toggleSfxMuted = useAppStore((s) => s.toggleSfxMuted);
  const triggerCameraPreset = useAppStore((s) => s.triggerCameraPreset);
  const resetAll = useAppStore((s) => s.resetAll);

  const { bundle } = useWeaponNarration(activeWeaponId);
  const manifest = getWeaponManifest(activeWeaponId);
  const meta = manifest.workbenchMeta;
  const partsCount = manifest.catalog.partsCount;
  const ui = UI_STRINGS[lang].workbench;
  const monoUi = UI_STRINGS[lang].monograph;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  return (
    <header className="top-bar">
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
        <div>
          <h1 className="brand-title">{displayMeta.workbenchTitle}</h1>
          <p className="brand-sub">{displayMeta.workbenchSubtitle}</p>
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

        <button
          type="button"
          className="toggle-chip active-amber"
          onClick={() => openMonographModal(activeWeaponId)}
          title={monoUi.entryChipTitle}
        >
          <Printer size={13} aria-hidden="true" />
          <span>{monoUi.entryChip}</span>
        </button>
      </div>

      <div className="toolbar-cluster toolbar-cluster-tools">
        <div className="camera-pills">
          <Camera size={13} className="cam-icon" />
          {VIEW_ANGLE_KEYS.map((key) => (
            <button
              key={key}
              className={`cam-btn ${cameraPreset === key ? 'active' : ''}`}
              onClick={() => triggerCameraPreset(key)}
            >
              {ui.viewAngles[key]}
            </button>
          ))}
        </div>

        <div className="toolbar-divider" />

        <button
          type="button"
          className={`toggle-chip ${
            fieldStripActive && mode === 'explode' ? 'active-emerald' : ''
          }`}
          aria-pressed={fieldStripActive && mode === 'explode'}
          onClick={toggleFieldStripMode}
          title={ui.fieldStripChipTitle}
        >
          <Wrench size={13} aria-hidden="true" />
          <span>{ui.fieldStripChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${
            mode === 'firing' && !malfunctionActive ? 'active-orange' : ''
          }`}
          aria-pressed={mode === 'firing' && !malfunctionActive}
          onClick={() =>
            setMode(
              mode === 'firing' && !malfunctionActive ? 'explode' : 'firing'
            )
          }
          title={ui.firingChipTitle}
        >
          <Flame size={14} aria-hidden="true" />
          <span>{ui.firingChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${malfunctionActive ? 'active-amber' : ''}`}
          aria-pressed={malfunctionActive}
          onClick={toggleMalfunctionMode}
          title={ui.malfunctionChipTitle}
        >
          <ShieldAlert size={13} aria-hidden="true" />
          <span>{ui.malfunctionChip}</span>
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

        <button
          type="button"
          className="toggle-chip"
          onClick={() => openCartridgeLab()}
          title={ui.cartridgeChipTitle}
        >
          <Crosshair size={13} aria-hidden="true" />
          <span>{ui.cartridgeChip}</span>
        </button>

        <button
          className={`toggle-chip ${pbrTexturesEnabled ? 'active-cyan' : ''}`}
          onClick={togglePbrTextures}
          title={ui.pbrChipTitle}
        >
          <Sparkles size={13} />
          <span>{ui.pbrChip}</span>
        </button>

        <button
          className="toggle-chip"
          onClick={() => setTextureModalOpen(true)}
          title={ui.atlasChipTitle}
        >
          <ImageIcon size={13} />
          <span>{ui.atlasChip}</span>
        </button>

        <button
          className={`toggle-chip ${xrayShells ? 'active-cyan' : ''}`}
          onClick={toggleXrayShells}
          title={ui.xrayChipTitle}
        >
          <Eye size={14} />
          <span>{ui.xrayChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${sectionCut ? 'active-teal' : ''}`}
          aria-pressed={sectionCut}
          onClick={toggleSectionCut}
          title={ui.sectionChipTitle}
        >
          <Scissors size={14} aria-hidden="true" />
          <span>{ui.sectionChip}</span>
        </button>

        <button
          type="button"
          className={`toggle-chip ${engineeringTint ? 'active-amber' : ''}`}
          aria-pressed={engineeringTint}
          onClick={toggleEngineeringTint}
          title={ui.tintChipTitle}
        >
          <Palette size={14} aria-hidden="true" />
          <span>{ui.tintChip}</span>
        </button>

        <button
          className={`toggle-chip ${showEdges ? 'active' : ''}`}
          onClick={toggleShowEdges}
          title={ui.edgesChipTitle}
        >
          <Box size={14} />
          <span>{ui.edgesChip}</span>
        </button>

        {mode === 'explode' && (
          <button
            type="button"
            className={`toggle-chip ${showLabels ? 'active' : ''}`}
            aria-pressed={showLabels}
            onClick={toggleShowLabels}
            title={ui.labelsChipTitle(partsCount)}
          >
            <Tag size={14} aria-hidden="true" />
            <span>{ui.labelsChip}</span>
          </button>
        )}

        <button
          type="button"
          className={`toggle-chip ${!sfxMuted ? 'active-cyan' : ''}`}
          aria-pressed={!sfxMuted}
          onClick={toggleSfxMuted}
          title={ui.sfxChipTitle(sfxMuted)}
        >
          {sfxMuted ? (
            <VolumeX size={14} aria-hidden="true" />
          ) : (
            <Volume2 size={14} aria-hidden="true" />
          )}
          <span>{ui.sfxChip}</span>
        </button>

        <button
          type="button"
          className="toggle-chip reset-chip"
          onClick={resetAll}
          title={ui.resetChipTitle}
        >
          <RotateCcw size={14} />
          <span>{ui.resetChip}</span>
        </button>
      </div>
    </header>
  );
};

import React from 'react';
import { Aperture, Lightbulb, Moon, Sun } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ARMORY_ENVIRONMENT_PRESETS,
  type ArmoryEnvironmentPreset,
} from '../../engine/canvas/GunsmithStageMat';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

export interface StudioEnvironmentBarProps {
  compact?: boolean;
}

const PRESET_ICONS: Record<ArmoryEnvironmentPreset, React.ReactNode> = {
  tactical_vault: <Moon size={11} aria-hidden="true" />,
  gunsmith_bench: <Lightbulb size={11} aria-hidden="true" />,
  blueprint_daylight: <Sun size={11} aria-hidden="true" />,
};

export const StudioEnvironmentBar: React.FC<StudioEnvironmentBarProps> = ({
  compact = false,
}) => {
  const lang = useAppStore((s) => s.lang);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const setEnvironmentPreset = useAppStore((s) => s.setEnvironmentPreset);
  const postFxEnabled = useAppStore((s) => s.postFxEnabled);
  const togglePostFx = useAppStore((s) => s.togglePostFx);

  const studioUi = UI_STRINGS[lang].studio;

  return (
    <div className={`studio-env-cluster ${compact ? 'is-compact' : ''}`}>
      <div
        className="env-switch-pill"
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
              className={`env-seg-btn ${isActive ? 'active' : ''} env-${preset}`}
              aria-pressed={isActive}
              title={copy.title}
              onClick={() => {
                if (!isActive) {
                  playWorkbenchFoley('toggle_switch');
                  setEnvironmentPreset(preset);
                }
              }}
            >
              {PRESET_ICONS[preset]}
              <span>{copy.label}</span>
            </button>
          );
        })}
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
        <Aperture size={13} aria-hidden="true" />
        <span>{studioUi.postFxChip}</span>
      </button>
    </div>
  );
};

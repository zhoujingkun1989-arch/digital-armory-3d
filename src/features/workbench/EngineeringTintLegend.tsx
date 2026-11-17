import React from 'react';
import { Flame, Palette, Wind, X } from 'lucide-react';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ENGINEERING_ROLE_META,
  ENGINEERING_ROLE_ORDER,
  WEAPON_GAS_MANIFOLD_PROFILES,
  type EngineeringRole,
} from '../../engine/materials/engineeringRoles';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

export interface EngineeringTintLegendProps {
  compact?: boolean;
}

export const EngineeringTintLegend: React.FC<EngineeringTintLegendProps> = ({
  compact = false,
}) => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const focusedEngineeringRole = useAppStore((s) => s.focusedEngineeringRole);
  const gasFlowVisible = useAppStore((s) => s.gasFlowVisible);
  const setEngineeringTint = useAppStore((s) => s.setEngineeringTint);
  const setFocusedEngineeringRole = useAppStore(
    (s) => s.setFocusedEngineeringRole
  );
  const toggleGasFlowVisible = useAppStore((s) => s.toggleGasFlowVisible);
  const setMode = useAppStore((s) => s.setMode);
  const setSectionCut = useAppStore((s) => s.setSectionCut);

  if (!engineeringTint) return null;

  const ui = UI_STRINGS[lang].engineeringTint;
  const manifold = WEAPON_GAS_MANIFOLD_PROFILES[activeWeaponId];
  const familyTitle =
    lang === 'zh' ? manifold.familyTitleZh : manifold.familyTitleEn;
  const flowNote = lang === 'zh' ? manifold.flowNoteZh : manifold.flowNoteEn;

  const handleRoleToggle = (role: EngineeringRole) => {
    playWorkbenchFoley('toggle_switch');
    setFocusedEngineeringRole(focusedEngineeringRole === role ? null : role);
  };

  return (
    <section
      className={`engineering-tint-legend ${compact ? 'is-compact' : ''}`}
      aria-label={ui.badge}
    >
      <div className="eng-legend-header">
        <div className="eng-legend-badge">
          <Palette size={12} aria-hidden="true" />
          <span>{ui.badge}</span>
        </div>

        <div className="eng-legend-header-actions">
          {focusedEngineeringRole !== null && (
            <button
              type="button"
              className="eng-reset-focus-btn"
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setFocusedEngineeringRole(null);
              }}
            >
              {ui.showAllBtn}
            </button>
          )}
          <button
            type="button"
            className="close-btn"
            onClick={() => {
              playWorkbenchFoley('toggle_switch');
              setEngineeringTint(false);
            }}
            title={ui.closeTitle}
            aria-label={ui.closeTitle}
          >
            <X size={13} aria-hidden="true" />
          </button>
        </div>
      </div>

      <div className="eng-role-grid">
        {ENGINEERING_ROLE_ORDER.map((role) => {
          const meta = ENGINEERING_ROLE_META[role];
          const isFocused = focusedEngineeringRole === role;
          const isDimmed =
            focusedEngineeringRole !== null && !isFocused;
          const label =
            lang === 'zh'
              ? compact
                ? meta.shortZh
                : meta.labelZh
              : compact
                ? meta.shortEn
                : meta.labelEn;
          const desc = lang === 'zh' ? meta.descZh : meta.descEn;

          return (
            <button
              key={role}
              type="button"
              className={`eng-role-chip ${isFocused ? 'is-focused' : ''} ${
                isDimmed ? 'is-dimmed' : ''
              }`}
              aria-pressed={isFocused}
              title={desc}
              onClick={() => handleRoleToggle(role)}
            >
              <span
                className="eng-role-swatch"
                style={{ backgroundColor: meta.colorHex }}
                aria-hidden="true"
              />
              <span className="eng-role-label">{label}</span>
            </button>
          );
        })}
      </div>

      {!compact && (
        <div className="eng-manifold-box">
          <div className="eng-manifold-title">{familyTitle}</div>
          <p className="eng-manifold-note">{flowNote}</p>

          {screen === 'workbench' && (
            <div className="eng-manifold-footer">
              <span className="eng-filter-hint">{ui.filterHint}</span>

              {mode === 'firing' ? (
                <button
                  type="button"
                  className={`eng-gas-toggle-btn ${
                    gasFlowVisible ? 'active' : ''
                  }`}
                  aria-pressed={gasFlowVisible}
                  title={ui.gasFlowToggleTitle}
                  onClick={() => {
                    playWorkbenchFoley('toggle_switch');
                    toggleGasFlowVisible();
                  }}
                >
                  <Wind size={12} aria-hidden="true" />
                  <span>{ui.gasFlowToggle}</span>
                </button>
              ) : (
                <button
                  type="button"
                  className="eng-live-gas-cta"
                  onClick={() => {
                    playWorkbenchFoley('preset_detent');
                    setSectionCut(true);
                    setMode('firing');
                  }}
                >
                  <Flame size={12} aria-hidden="true" />
                  <span>{ui.liveGasCta}</span>
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

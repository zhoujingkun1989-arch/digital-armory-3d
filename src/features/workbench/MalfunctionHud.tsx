import React, { useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Play,
  RotateCcw,
  ShieldAlert,
  X,
} from 'lucide-react';
import {
  getMalfunctionScenario,
  isArcheryMalfunctionWeapon,
  MALFUNCTION_ORDER,
} from '../../engine/malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../../engine/malfunctions/malfunctionStore';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

export const MalfunctionHud: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const setMalfunctionActive = useAppStore((s) => s.setMalfunctionActive);

  const snap = useSyncExternalStore(
    malfunctionStore.subscribe,
    malfunctionStore.getSnapshot,
    malfunctionStore.getSnapshot
  );

  const isArchery = isArcheryMalfunctionWeapon(activeWeaponId);
  const ui = UI_STRINGS[lang].malfunction;
  const scenario = getMalfunctionScenario(snap.activeKind, activeWeaponId);
  const isZh = lang === 'zh';

  return (
    <div className="malfunction-hud">
      {/* Top Diagnostics Header & Action Controls */}
      <div className="malf-header">
        <div className="malf-title-cluster">
          <span className="malf-badge">
            <ShieldAlert size={12} aria-hidden="true" />
            <span>{isArchery ? ui.archeryBadge : ui.badge}</span>
          </span>
          <span className="malf-progress-pill">
            {ui.progressLabel(snap.completedSteps, snap.totalSteps)}
          </span>
        </div>

        <div className="malf-controls">
          <button
            type="button"
            className="malf-ctrl-btn malf-step-btn"
            disabled={snap.cleared}
            title={ui.nextStepTitle}
            onClick={() => malfunctionStore.advanceClearingStep()}
          >
            <Play size={12} aria-hidden="true" />
            <span>{ui.nextStepBtn}</span>
          </button>

          <button
            type="button"
            className="malf-ctrl-btn"
            title={ui.resetDrillTitle}
            onClick={() => malfunctionStore.resetDrill()}
          >
            <RotateCcw size={12} aria-hidden="true" />
            <span>{ui.resetDrillBtn}</span>
          </button>

          <button
            type="button"
            className="malf-ctrl-btn malf-exit-btn"
            title={ui.exitTitle}
            onClick={() => setMalfunctionActive(false)}
          >
            <X size={12} aria-hidden="true" />
            <span>{ui.exitBtn}</span>
          </button>
        </div>
      </div>

      {/* 4 Canonical Malfunction & Safety Scenario Selector Tabs */}
      <div className="malf-scenario-tabs">
        {MALFUNCTION_ORDER.map((kind) => {
          const item = getMalfunctionScenario(kind, activeWeaponId);
          const isSelected = snap.activeKind === kind;
          return (
            <button
              key={kind}
              type="button"
              className={`malf-tab-btn kind-${kind} ${
                isSelected ? 'active' : ''
              }`}
              aria-pressed={isSelected}
              onClick={() =>
                malfunctionStore.selectMalfunction(kind, activeWeaponId)
              }
            >
              <span className="malf-tab-code">{item.code}</span>
              <span className="malf-tab-name">
                {isZh ? item.shortZh : item.shortEn}
              </span>
            </button>
          );
        })}
      </div>

      {/* Root-Cause Cutaway Diagnosis & Safety Protocol Banner */}
      <div
        className={`malf-diagnosis-banner ${snap.cleared ? 'is-cleared' : ''}`}
        role="status"
        aria-live="polite"
      >
        {snap.cleared ? (
          <div className="malf-cleared-row">
            <CheckCircle2
              size={15}
              className="malf-cleared-icon"
              aria-hidden="true"
            />
            <div>
              <strong>{isArchery ? ui.archeryClearedTitle : ui.clearedTitle}</strong>
              <span className="malf-diag-sub">
                {' '}
                {isArchery ? ui.archeryClearedDesc : ui.clearedDesc}
              </span>
            </div>
          </div>
        ) : (
          <div className="malf-diag-grid">
            <div className="malf-diag-main">
              <span className="malf-severity-chip">
                <AlertTriangle size={11} aria-hidden="true" />
                <span>{isZh ? scenario.badgeZh : scenario.badgeEn}</span>
              </span>
              <strong className="malf-diag-title">
                {isZh ? scenario.titleZh : scenario.titleEn}
              </strong>
              <p className="malf-diag-cause">
                <strong>
                  {isArchery ? ui.archeryRootCauseLabel : ui.rootCauseLabel}
                </strong>{' '}
                {isZh ? scenario.rootCauseZh : scenario.rootCauseEn}
              </p>
            </div>
            <div className="malf-safety-box">
              <span className="malf-safety-label">
                {isArchery ? ui.archerySafetyNoteLabel : ui.safetyNoteLabel}
              </span>
              <span>{isZh ? scenario.safetyNoteZh : scenario.safetyNoteEn}</span>
              <span className="malf-click-hint">
                {isArchery ? ui.archeryClick3dHint : ui.click3dHint}
              </span>
            </div>
          </div>
        )}
      </div>

      {/* Ordered Clearing Drill Steps (<ol> per accessibility semantic sequence rule) */}
      <ol className="malfunction-steps-list" aria-label={ui.drillStepsAria}>
        {scenario.steps.map((step, idx) => {
          const isDone = idx < snap.completedSteps;
          const isCurrent = idx === snap.completedSteps && !snap.cleared;
          return (
            <li
              key={step.id}
              className={`malf-step-item ${isDone ? 'is-done' : ''} ${
                isCurrent ? 'is-current' : ''
              }`}
            >
              <button
                type="button"
                className="malf-step-btn-card"
                disabled={!isCurrent}
                onClick={() => {
                  if (isCurrent) {
                    malfunctionStore.advanceClearingStep();
                  }
                }}
              >
                <span className="malf-step-num">
                  {isDone ? (
                    <CheckCircle2 size={12} aria-hidden="true" />
                  ) : (
                    step.orderLabel
                  )}
                </span>
                <span className="malf-step-copy">
                  <span className="malf-step-title">
                    {isZh ? step.titleZh : step.titleEn}
                  </span>
                  <span className="malf-step-detail">
                    {isZh ? step.detailZh : step.detailEn}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

MalfunctionHud.displayName = 'MalfunctionHud';

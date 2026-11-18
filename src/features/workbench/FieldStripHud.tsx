import React, { useEffect, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  FastForward,
  Info,
  Lightbulb,
  RotateCcw,
  Wrench,
  X,
} from 'lucide-react';
import { scheduleHudBoundsRefresh } from '../../engine/callout/hudBoundsCache';
import { FIELD_STRIP_PLANS } from '../../engine/fieldstrip/fieldStripSpecs';
import { fieldStripStore } from '../../engine/fieldstrip/fieldStripStore';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';

export const FieldStripHud: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const setFieldStripActive = useAppStore((s) => s.setFieldStripActive);

  const snap = useSyncExternalStore(
    fieldStripStore.subscribe,
    fieldStripStore.getSnapshot
  );

  useEffect(() => {
    fieldStripStore.syncWeapon(activeWeaponId, false);
  }, [activeWeaponId]);

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [snap.interference, snap.fullCycleCompleted, snap.phase]);

  const plan = FIELD_STRIP_PLANS[activeWeaponId];
  const ui = UI_STRINGS[lang].fieldStrip;
  const strippedSet = new Set(snap.strippedStepIds);
  const recommendedStep =
    plan.steps.find((st) => st.id === snap.recommendedStepId) ?? null;

  const manualTitle =
    lang === 'zh' ? plan.manualCodeZh : plan.manualCodeEn;

  return (
    <div className="field-strip-hud">
      {/* Top Toolbar Row: Manual Title, Phase Switcher, Progress & Action Buttons */}
      <div className="field-strip-top-row">
        <div className="field-strip-title-cluster">
          <span className="field-strip-badge">
            <Wrench size={11} aria-hidden="true" />
            <span>{ui.badge}</span>
          </span>
          <span className="field-strip-manual-name">{manualTitle}</span>
          <span className="field-strip-progress-pill">
            {ui.progressLabel(snap.strippedCount, snap.totalSteps)}
          </span>
        </div>

        <div className="field-strip-actions-cluster">
          <div className="field-strip-phase-switch" role="group">
            <button
              type="button"
              className={`fs-phase-btn ${
                snap.phase === 'strip' ? 'active-strip' : ''
              }`}
              aria-pressed={snap.phase === 'strip'}
              disabled={snap.strippedCount === snap.totalSteps}
              onClick={() => fieldStripStore.setPhase('strip')}
            >
              {ui.phaseStrip}
            </button>
            <button
              type="button"
              className={`fs-phase-btn ${
                snap.phase === 'reassemble' ? 'active-reassemble' : ''
              }`}
              aria-pressed={snap.phase === 'reassemble'}
              disabled={snap.strippedCount === 0}
              onClick={() => fieldStripStore.setPhase('reassemble')}
            >
              {ui.phaseReassemble}
            </button>
          </div>

          <button
            type="button"
            className="fs-ctrl-btn fs-hint-btn"
            onClick={() => fieldStripStore.triggerHint()}
            disabled={!recommendedStep}
            title={ui.hintTitle}
          >
            <Lightbulb size={13} aria-hidden="true" />
            <span>{ui.hintBtn}</span>
          </button>

          <button
            type="button"
            className="fs-ctrl-btn fs-auto-btn"
            onClick={() => fieldStripStore.performRecommendedStep()}
            disabled={!recommendedStep}
            title={ui.autoStepTitle}
          >
            <FastForward size={13} aria-hidden="true" />
            <span>{ui.autoStepBtn}</span>
          </button>

          <button
            type="button"
            className="fs-ctrl-btn"
            onClick={() => fieldStripStore.reset(activeWeaponId, false)}
            title={ui.resetTitle}
          >
            <RotateCcw size={13} aria-hidden="true" />
            <span>{ui.resetBtn}</span>
          </button>

          <button
            type="button"
            className="fs-ctrl-btn fs-exit-btn"
            onClick={() => setFieldStripActive(false)}
            title={ui.exitTitle}
          >
            <X size={13} aria-hidden="true" />
            <span>{ui.exitBtn}</span>
          </button>
        </div>
      </div>

      {/* DAG Step Pipeline Strip */}
      <div className="field-strip-steps-grid">
        {plan.steps.map((step) => {
          const isStripped = strippedSet.has(step.id);
          const isRecommended = snap.recommendedStepId === step.id;
          const isBlocking =
            snap.interference?.blockingStepIds.includes(step.id) ?? false;
          const title = lang === 'zh' ? step.titleZh : step.titleEn;
          const instruction =
            lang === 'zh' ? step.actionHintZh : step.actionHintEn;
          const leadPartId =
            step.triggerPartIds[0] ?? step.bindings[0]?.partId ?? '';

          return (
            <button
              key={step.id}
              type="button"
              className={`fs-step-pill ${isStripped ? 'is-stripped' : ''} ${
                isRecommended ? 'is-recommended' : ''
              } ${isBlocking ? 'is-blocking' : ''}`}
              aria-pressed={isStripped}
              title={`${step.orderLabel} · ${title} — ${instruction}`}
              onClick={() =>
                fieldStripStore.attemptPartClick(activeWeaponId, leadPartId)
              }
            >
              <span className="fs-step-num">
                {isStripped ? '✓' : step.orderLabel}
              </span>
              <span className="fs-step-name">{title}</span>
            </button>
          );
        })}
      </div>

      {/* Live Mechanical Interference Alert OR Polite Step Guidance */}
      {snap.interference ? (
        <div
          key={`alert-${snap.interference.seq}`}
          role="alert"
          className={`field-strip-alert ${
            snap.interference.severity === 'interference'
              ? 'is-interference'
              : 'is-info'
          }`}
        >
          <div className="fs-alert-main">
            {snap.interference.severity === 'interference' ? (
              <AlertTriangle
                size={15}
                className="fs-alert-icon"
                aria-hidden="true"
              />
            ) : (
              <Info size={15} className="fs-alert-icon" aria-hidden="true" />
            )}
            <span className="fs-alert-badge">
              {snap.interference.severity === 'interference'
                ? ui.interferenceBadge
                : ui.infoBadge}
            </span>
            <span className="fs-alert-msg">
              {lang === 'zh'
                ? snap.interference.messageZh
                : snap.interference.messageEn}
            </span>
          </div>
          <button
            type="button"
            className="fs-alert-dismiss"
            onClick={() => fieldStripStore.dismissInterference()}
          >
            {ui.dismissAlert}
          </button>
        </div>
      ) : snap.fullCycleCompleted && snap.strippedCount === 0 ? (
        <div
          aria-live="polite"
          className="field-strip-guidance is-completed"
        >
          <CheckCircle2
            size={15}
            className="fs-complete-icon"
            aria-hidden="true"
          />
          <div className="fs-guidance-text">
            <strong>{ui.completedTitle}</strong>
            <span>{ui.completedDesc}</span>
          </div>
        </div>
      ) : recommendedStep ? (
        <div aria-live="polite" className="field-strip-guidance">
          <div className="fs-guidance-text">
            <strong>
              {snap.phase === 'strip'
                ? ui.nextActionPrefixStrip
                : ui.nextActionPrefixReassemble}
              {lang === 'zh'
                ? recommendedStep.titleZh
                : recommendedStep.titleEn}
            </strong>
            <span>
              {lang === 'zh'
                ? recommendedStep.actionHintZh
                : recommendedStep.actionHintEn}
            </span>
          </div>
          <span className="fs-guidance-sub">{ui.click3dHint}</span>
        </div>
      ) : null}
    </div>
  );
};

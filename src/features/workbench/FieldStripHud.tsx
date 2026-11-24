import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Award,
  CheckCircle2,
  FastForward,
  Info,
  Lightbulb,
  Lock,
  RotateCcw,
  Share2,
  Timer,
  Trophy,
  Wrench,
  X,
} from 'lucide-react';
import { scheduleHudBoundsRefresh } from '../../engine/callout/hudBoundsCache';
import {
  formatExamDuration,
  nowExamMs,
  useArmorerExamStore,
  useWeaponExamSummary,
} from '../../engine/exam/armorerExamStore';
import { EXAM_STRINGS } from '../../engine/exam/examStrings';
import { fieldStripStore } from '../../engine/fieldstrip/fieldStripStore';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';
import '../../styles/exam.css';

interface ExamElapsedTimerProps {
  startedAtMs: number;
  completedAtMs: number | null;
  active: boolean;
  parSeconds: number;
  parTitle: string;
}

/**
 * Isolated 100ms timer widget — state updates stay strictly inside this tiny leaf
 * component so neither `FieldStripHud` nor the 60fps 3D `<Canvas>` ever re-renders!
 */
const ExamElapsedTimer: React.FC<ExamElapsedTimerProps> = React.memo(
  ({ startedAtMs, completedAtMs, active, parSeconds, parTitle }) => {
    const [tickNow, setTickNow] = useState<number>(() => nowExamMs());

    useEffect(() => {
      if (!active || completedAtMs !== null) return;
      const id = window.setInterval(() => {
        setTickNow(nowExamMs());
      }, 100);
      return () => window.clearInterval(id);
    }, [active, completedAtMs, startedAtMs]);

    const elapsedMs =
      completedAtMs !== null
        ? Math.max(0, completedAtMs - startedAtMs)
        : Math.max(0, tickNow - startedAtMs);
    const isOverPar = elapsedMs > parSeconds * 1000;

    return (
      <span
        className={`exam-timer-pill ${isOverPar ? 'is-over-par' : ''}`}
        title={parTitle}
      >
        <Timer size={11} aria-hidden="true" />
        <span>{formatExamDuration(elapsedMs)}</span>
      </span>
    );
  }
);
ExamElapsedTimer.displayName = 'ExamElapsedTimer';

export const FieldStripHud: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const setFieldStripActive = useAppStore((s) => s.setFieldStripActive);
  const openPosterModal = useAppStore((s) => s.openPosterModal);

  const snap = useSyncExternalStore(
    fieldStripStore.subscribe,
    fieldStripStore.getSnapshot
  );

  const exam = useArmorerExamStore((s) => s.fieldStripExam);
  const startBlindFieldStrip = useArmorerExamStore(
    (s) => s.startBlindFieldStrip
  );
  const exitBlindFieldStrip = useArmorerExamStore((s) => s.exitBlindFieldStrip);
  const examSummary = useWeaponExamSummary(activeWeaponId);

  const isExamActive = exam.active && exam.weaponId === activeWeaponId;

  useEffect(() => {
    fieldStripStore.syncWeapon(activeWeaponId, false);
  }, [activeWeaponId]);

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [
    snap.interference,
    snap.fullCycleCompleted,
    snap.phase,
    isExamActive,
    exam.phase,
  ]);

  useEffect(() => {
    return () => {
      if (useArmorerExamStore.getState().fieldStripExam.active) {
        useArmorerExamStore.getState().exitBlindFieldStrip(false);
      }
    };
  }, []);

  const plan = fieldStripStore.getActivePlan(activeWeaponId);
  const ui = UI_STRINGS[lang].fieldStrip;
  const exUi = EXAM_STRINGS[lang];
  const strippedSet = new Set(snap.strippedStepIds);
  const recommendedStep = isExamActive
    ? null
    : (plan.steps.find((st) => st.id === snap.recommendedStepId) ?? null);

  const manualTitle =
    lang === 'zh' ? plan.manualCodeZh : plan.manualCodeEn;

  const examStageText =
    exam.phase === 'completed'
      ? exUi.fieldStrip.stageCompleted
      : exam.phase === 'reassembly'
        ? exUi.fieldStrip.stageReassembly(
            exam.completedPhaseSteps,
            exam.totalSteps
          )
        : exUi.fieldStrip.stageDisassembly(
            exam.completedPhaseSteps,
            exam.totalSteps
          );

  const earnedRank = exam.rank ?? 'C';
  const rankMeta = exUi.ranks[earnedRank];

  return (
    <div className="field-strip-hud">
      {/* Top Toolbar Row: Manual Title, Blind Exam Toggle, Telemetry & Action Buttons */}
      <div className="field-strip-top-row">
        <div className="field-strip-title-cluster">
          {isExamActive ? (
            <span className="exam-active-mode-badge">
              <Award size={11} aria-hidden="true" />
              <span>{exUi.fieldStrip.examBadge}</span>
            </span>
          ) : (
            <span className="field-strip-badge">
              <Wrench size={11} aria-hidden="true" />
              <span>{ui.badge}</span>
            </span>
          )}
          <span className="field-strip-manual-name">{manualTitle}</span>
          {isExamActive ? (
            <span
              className={`exam-stage-pill ${
                exam.phase === 'reassembly' || exam.phase === 'completed'
                  ? 'is-reassembly'
                  : ''
              }`}
            >
              {examStageText}
            </span>
          ) : (
            <span className="field-strip-progress-pill">
              {ui.progressLabel(snap.strippedCount, snap.totalSteps)}
            </span>
          )}
        </div>

        <div className="field-strip-actions-cluster">
          <div className="fs-phase-toggle" role="group">
            <button
              type="button"
              disabled={isExamActive}
              className={`fs-phase-btn ${
                snap.tier === 'field' ? 'active-strip' : ''
              }`}
              onClick={() => fieldStripStore.setTier('field', activeWeaponId)}
            >
              {lang === 'zh' ? '野战快拆' : 'Field Strip'}
            </button>
            <button
              type="button"
              disabled={isExamActive}
              className={`fs-phase-btn ${
                snap.tier === 'detail' ? 'active-strip' : ''
              }`}
              onClick={() => fieldStripStore.setTier('detail', activeWeaponId)}
            >
              {lang === 'zh' ? '军械师全拆' : 'Detail Strip'}
            </button>
          </div>

          {/* Blind Certification Exam Toggle Pill (with Personal Best Rank Badge) */}
          <button
            type="button"
            className={`exam-mode-toggle-pill ${isExamActive ? 'is-active' : ''}`}
            aria-pressed={isExamActive}
            title={
              !isExamActive &&
              examSummary.fieldStripRank &&
              examSummary.bestFieldStripScore !== null
                ? exUi.common.personalBestTitle(
                    examSummary.fieldStripRank,
                    examSummary.bestFieldStripScore
                  )
                : exUi.fieldStrip.toggleTitle
            }
            onClick={() => {
              if (isExamActive) {
                exitBlindFieldStrip(false);
              } else {
                startBlindFieldStrip(activeWeaponId);
              }
            }}
          >
            <Award size={12} aria-hidden="true" />
            <span>
              {isExamActive
                ? exUi.fieldStrip.toggleActiveBtn
                : exUi.fieldStrip.toggleBtn}
            </span>
            {!isExamActive && examSummary.fieldStripRank && (
              <span
                className={`exam-pb-rank-chip rank-${examSummary.fieldStripRank}`}
              >
                {examSummary.fieldStripRank}
              </span>
            )}
          </button>

          {isExamActive ? (
            <>
              <div className="exam-telemetry-strip">
                <ExamElapsedTimer
                  key={`fs-timer-${exam.startedAtMs}`}
                  startedAtMs={exam.startedAtMs}
                  completedAtMs={exam.completedAtMs}
                  active={isExamActive}
                  parSeconds={exam.parSeconds}
                  parTitle={exUi.common.parPrefix(exam.parSeconds)}
                />
                <span className="exam-score-pill">
                  <Trophy size={11} aria-hidden="true" />
                  <span>
                    {exam.finalScore} {exUi.common.ptsUnit}
                  </span>
                </span>
                <span
                  key={`err-${exam.errorSeq}`}
                  className={`exam-mistake-pill ${
                    exam.mistakeCount > 0 ? 'has-mistakes' : ''
                  }`}
                >
                  {exUi.common.mistakesCount(exam.mistakeCount)}
                </span>
              </div>

              <button
                type="button"
                className="fs-ctrl-btn is-exam-locked"
                disabled
                title={exUi.common.lockedBtnTag}
              >
                <Lock size={11} aria-hidden="true" />
                <span>{ui.hintBtn}</span>
              </button>

              <button
                type="button"
                className="fs-ctrl-btn is-exam-locked"
                disabled
                title={exUi.common.lockedBtnTag}
              >
                <Lock size={11} aria-hidden="true" />
                <span>{ui.autoStepBtn}</span>
              </button>

              <button
                type="button"
                className="fs-ctrl-btn"
                onClick={() => startBlindFieldStrip(activeWeaponId)}
                title={ui.resetTitle}
              >
                <RotateCcw size={13} aria-hidden="true" />
                <span>{ui.resetBtn}</span>
              </button>
            </>
          ) : (
            <>
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
            </>
          )}

          <button
            type="button"
            className="fs-ctrl-btn fs-exit-btn"
            onClick={() => {
              if (isExamActive) {
                exitBlindFieldStrip(false);
              }
              setFieldStripActive(false);
            }}
            title={ui.exitTitle}
          >
            <X size={13} aria-hidden="true" />
            <span>{ui.exitBtn}</span>
          </button>
        </div>
      </div>

      {/* Blind Certification Mode Body vs Guided DAG Step Pipeline */}
      {isExamActive ? (
        exam.phase === 'completed' ? (
          <div
            className={`exam-certificate-card rank-${earnedRank}`}
            role="region"
            aria-label={exUi.fieldStrip.certTitle}
          >
            <div className="exam-cert-top-row">
              <div className="exam-cert-identity">
                <div className={`exam-rank-medallion rank-${earnedRank}`}>
                  {earnedRank}
                </div>
                <div className="exam-cert-titles">
                  <div className="exam-cert-overline">
                    <span>{ui.certBadge}</span>
                    {exam.isNewRecord && (
                      <span className="exam-new-record-pill">
                        {exUi.common.newRecordBadge}
                      </span>
                    )}
                  </div>
                  <strong className="exam-cert-main-heading">
                    {rankMeta.badgeLabel} · {exUi.fieldStrip.certTitle}
                  </strong>
                  {examSummary.fieldStripRank &&
                    examSummary.bestFieldStripScore !== null &&
                    examSummary.bestFieldStripMs !== null && (
                      <span className="exam-cert-sub-meta">
                        {exUi.fieldStrip.bestSummary(
                          examSummary.fieldStripRank,
                          examSummary.bestFieldStripScore,
                          formatExamDuration(examSummary.bestFieldStripMs)
                        )}
                      </span>
                    )}
                </div>
              </div>

              <div className="exam-cert-actions">
                <button
                  type="button"
                  className="exam-cert-share-btn"
                  title={ui.shareCertPosterTitle}
                  onClick={() =>
                    openPosterModal({
                      weaponId: activeWeaponId,
                      armorerRank: earnedRank,
                    })
                  }
                >
                  <Share2 size={12} aria-hidden="true" />
                  <span>{ui.shareCertPosterBtn}</span>
                </button>
                <button
                  type="button"
                  className="exam-cert-retry-btn"
                  onClick={() => startBlindFieldStrip(activeWeaponId)}
                >
                  <RotateCcw size={12} aria-hidden="true" />
                  <span>{exUi.fieldStrip.retryBtn}</span>
                </button>
                <button
                  type="button"
                  className="exam-cert-exit-btn"
                  onClick={() => exitBlindFieldStrip(false)}
                >
                  <X size={12} aria-hidden="true" />
                  <span>{exUi.fieldStrip.exitBtn}</span>
                </button>
              </div>
            </div>

            <div className="exam-cert-metrics-grid">
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.fieldStrip.statFinalScore}
                </span>
                <span className="exam-cert-metric-val">
                  {exam.finalScore} / 1200 {exUi.common.ptsUnit}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.fieldStrip.statElapsedTime}
                </span>
                <span className="exam-cert-metric-val">
                  {formatExamDuration(exam.elapsedMs)}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.fieldStrip.statTimeBonus}
                </span>
                <span className="exam-cert-metric-val is-bonus">
                  +{exam.timeBonus} {exUi.common.ptsUnit}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.fieldStrip.statMistakes}
                </span>
                <span
                  className={`exam-cert-metric-val ${
                    exam.mistakeCount > 0 ? 'is-penalty' : 'is-bonus'
                  }`}
                >
                  {exam.mistakeCount} (-{exam.mistakePenalty}{' '}
                  {exUi.common.ptsUnit})
                </span>
              </div>
            </div>
          </div>
        ) : (
          <>
            {/* Numbered Blind Progress Nodes (`01 ✓`, `02 ●`, `03 ?`...) — Zero Part/Step Spoilers */}
            <div className="exam-blind-nodes-grid" role="list">
              {plan.steps.map((step, idx) => {
                const status: 'done' | 'current' | 'pending' =
                  idx < exam.completedPhaseSteps
                    ? 'done'
                    : idx === exam.completedPhaseSteps
                      ? 'current'
                      : 'pending';
                return (
                  <div
                    key={step.orderLabel}
                    role="listitem"
                    className={`exam-blind-node is-${status}`}
                    aria-label={exUi.fieldStrip.blindNodeLabel(
                      step.orderLabel,
                      status
                    )}
                  >
                    <span>{step.orderLabel}</span>
                    <span
                      className={
                        status === 'current' ? 'exam-node-dot' : undefined
                      }
                      aria-hidden="true"
                    >
                      {status === 'done'
                        ? '✓'
                        : status === 'current'
                          ? '●'
                          : '?'}
                    </span>
                  </div>
                );
              })}
            </div>

            {snap.interference ? (
              <div
                key={`alert-${snap.interference.seq}`}
                role="alert"
                className="field-strip-alert is-interference"
              >
                <div className="fs-alert-main">
                  <AlertTriangle
                    size={15}
                    className="fs-alert-icon"
                    aria-hidden="true"
                  />
                  <span className="fs-alert-badge">
                    {exUi.fieldStrip.interferenceBadge}
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
            ) : (
              <div aria-live="polite" className="field-strip-guidance">
                <div className="fs-guidance-text">
                  <strong>
                    {exam.phase === 'reassembly'
                      ? exUi.fieldStrip.reassemblyPromptTitle
                      : exUi.fieldStrip.disassemblyPromptTitle}
                  </strong>
                  <span>
                    {exam.phase === 'reassembly'
                      ? exUi.fieldStrip.reassemblyPromptDesc
                      : exUi.fieldStrip.disassemblyPromptDesc}
                  </span>
                </div>
              </div>
            )}
          </>
        )
      ) : (
        <>
          {/* Guided Mode: Named DAG Step Pipeline Strip */}
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

          {/* Guided Mode: Live Mechanical Interference Alert OR Polite Step Guidance */}
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
        </>
      )}
    </div>
  );
};

import React, { useEffect, useState, useSyncExternalStore } from 'react';
import {
  AlertTriangle,
  Award,
  BookOpen,
  CheckCircle2,
  Crosshair,
  Eye,
  Lock,
  Play,
  RotateCcw,
  Scissors,
  Share2,
  ShieldAlert,
  Shuffle,
  Timer,
  Trophy,
  X,
} from 'lucide-react';
import { scheduleHudBoundsRefresh } from '../../engine/callout/hudBoundsCache';
import {
  computeExamAccuracyPct,
  formatExamDuration,
  nowExamMs,
  useArmorerExamStore,
  useWeaponExamSummary,
} from '../../engine/exam/armorerExamStore';
import { EXAM_STRINGS } from '../../engine/exam/examStrings';
import {
  getMalfunctionScenario,
  isArcheryMalfunctionWeapon,
  MALFUNCTION_ORDER,
} from '../../engine/malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../../engine/malfunctions/malfunctionStore';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { useAppStore } from '../../store/useAppStore';
import '../../styles/exam.css';

interface TriageElapsedTimerProps {
  startedAtMs: number;
  completedAtMs: number | null;
  active: boolean;
  parSeconds: number;
  parTitle: string;
}

/**
 * Isolated 100ms timer widget — keeps interval state strictly local so neither
 * `MalfunctionHud` nor the 60fps 3D `<Canvas>` ever re-renders on timer ticks!
 */
const TriageElapsedTimer: React.FC<TriageElapsedTimerProps> = React.memo(
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
TriageElapsedTimer.displayName = 'TriageElapsedTimer';

export const MalfunctionHud: React.FC = () => {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const lang = useAppStore((s) => s.lang);
  const setMalfunctionActive = useAppStore((s) => s.setMalfunctionActive);
  const openPosterModal = useAppStore((s) => s.openPosterModal);
  const openPassportModal = useAppStore((s) => s.openPassportModal);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const toggleSectionCut = useAppStore((s) => s.toggleSectionCut);
  const toggleXrayShells = useAppStore((s) => s.toggleXrayShells);

  const snap = useSyncExternalStore(
    malfunctionStore.subscribe,
    malfunctionStore.getSnapshot,
    malfunctionStore.getSnapshot
  );

  const triage = useArmorerExamStore((s) => s.triageExam);
  const startBlindTriage = useArmorerExamStore((s) => s.startBlindTriage);
  const submitTriageDiagnosis = useArmorerExamStore(
    (s) => s.submitTriageDiagnosis
  );
  const attemptTriageClearanceStep = useArmorerExamStore(
    (s) => s.attemptTriageClearanceStep
  );
  const exitBlindTriage = useArmorerExamStore((s) => s.exitBlindTriage);
  const examSummary = useWeaponExamSummary(activeWeaponId);

  const isTriageActive = triage.active && triage.weaponId === activeWeaponId;

  useEffect(() => {
    scheduleHudBoundsRefresh();
  }, [
    snap.cleared,
    isTriageActive,
    triage.phase,
    triage.lastFeedback?.seq,
  ]);

  useEffect(() => {
    return () => {
      if (useArmorerExamStore.getState().triageExam.active) {
        useArmorerExamStore.getState().exitBlindTriage();
      }
    };
  }, []);

  const isArchery = isArcheryMalfunctionWeapon(activeWeaponId);
  const ui = UI_STRINGS[lang].malfunction;
  const exUi = EXAM_STRINGS[lang];
  const scenario = getMalfunctionScenario(snap.activeKind, activeWeaponId);
  const secretScenario = getMalfunctionScenario(
    triage.secretKind,
    activeWeaponId
  );
  const isZh = lang === 'zh';

  const triageStageLabel =
    triage.phase === 'completed'
      ? exUi.triage.stageCompleted
      : triage.phase === 'clearance'
        ? exUi.triage.stageClearance(
            triage.completedClearanceSteps,
            triage.totalClearanceSteps
          )
        : exUi.triage.stageDiagnosis;

  const earnedRank = triage.rank ?? 'C';
  const rankMeta = exUi.ranks[earnedRank];
  const triageAccuracyPct = computeExamAccuracyPct(
    triage.totalClearanceSteps + 1,
    triage.mistakeCount
  );

  return (
    <div
      className="malfunction-hud"
      role="region"
      aria-label={
        isTriageActive
          ? exUi.triage.examBadge
          : isArchery
            ? ui.archeryBadge
            : ui.badge
      }
    >
      {/* Top Diagnostics Header & Action Controls */}
      <div className="malf-header">
        <div className="malf-title-cluster">
          {isTriageActive ? (
            <>
              <span className="exam-active-mode-badge">
                <Crosshair size={11} aria-hidden="true" />
                <span>{exUi.triage.examBadge}</span>
              </span>
              <span
                className={`exam-stage-pill ${
                  triage.phase === 'clearance' || triage.phase === 'completed'
                    ? 'is-reassembly'
                    : ''
                }`}
              >
                {triageStageLabel}
              </span>
            </>
          ) : (
            <>
              <span className="malf-badge">
                <ShieldAlert size={12} aria-hidden="true" />
                <span>{isArchery ? ui.archeryBadge : ui.badge}</span>
              </span>
              <span className="malf-progress-pill">
                {ui.progressLabel(snap.completedSteps, snap.totalSteps)}
              </span>
            </>
          )}
        </div>

        <div className="malf-controls">
          {/* Random Blind Stoppage Triage Toggle Pill */}
          <button
            type="button"
            className={`exam-mode-toggle-pill ${isTriageActive ? 'is-active' : ''}`}
            aria-pressed={isTriageActive}
            title={
              !isTriageActive &&
              examSummary.triageRank &&
              examSummary.bestTriageScore !== null
                ? exUi.common.personalBestTitle(
                    examSummary.triageRank,
                    examSummary.bestTriageScore
                  )
                : exUi.triage.toggleTitle
            }
            onClick={() => {
              if (isTriageActive) {
                exitBlindTriage();
              } else {
                startBlindTriage(activeWeaponId);
              }
            }}
          >
            <Award size={12} aria-hidden="true" />
            <span>
              {isTriageActive ? exUi.triage.toggleActiveBtn : exUi.triage.toggleBtn}
            </span>
            {!isTriageActive && examSummary.triageRank && (
              <span
                className={`exam-pb-rank-chip rank-${examSummary.triageRank}`}
              >
                {examSummary.triageRank}
              </span>
            )}
          </button>

          {isTriageActive ? (
            <>
              <div className="exam-telemetry-strip">
                <TriageElapsedTimer
                  key={`tr-timer-${triage.startedAtMs}`}
                  startedAtMs={triage.startedAtMs}
                  completedAtMs={triage.completedAtMs}
                  active={isTriageActive}
                  parSeconds={triage.parSeconds}
                  parTitle={exUi.common.parPrefix(triage.parSeconds)}
                />
                <span className="exam-score-pill">
                  <Trophy size={11} aria-hidden="true" />
                  <span>
                    {triage.finalScore} {exUi.common.ptsUnit}
                  </span>
                </span>
                <span
                  key={`tr-err-${triage.lastFeedback?.seq ?? 0}`}
                  className={`exam-mistake-pill ${
                    triage.mistakeCount > 0 ? 'has-mistakes' : ''
                  }`}
                >
                  {exUi.common.mistakesCount(triage.mistakeCount)}
                </span>
              </div>

              <button
                type="button"
                className="malf-ctrl-btn"
                title={exUi.triage.rerollTitle}
                onClick={() => startBlindTriage(activeWeaponId)}
              >
                <Shuffle size={12} aria-hidden="true" />
                <span>{exUi.triage.rerollBtn}</span>
              </button>
            </>
          ) : (
            <>
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
            </>
          )}

          <button
            type="button"
            className="malf-ctrl-btn malf-exit-btn"
            title={ui.exitTitle}
            onClick={() => {
              if (isTriageActive) {
                exitBlindTriage();
              }
              setMalfunctionActive(false);
            }}
          >
            <X size={12} aria-hidden="true" />
            <span>{ui.exitBtn}</span>
          </button>
        </div>
      </div>

      {/* Blind Unknown Stoppage Triage Mode vs Guided Malfunction Diagnostics */}
      {isTriageActive ? (
        triage.phase === 'completed' ? (
          <div
            className={`exam-certificate-card rank-${earnedRank}`}
            role="region"
            aria-label={exUi.triage.certTitle}
          >
            <div className="exam-cert-top-row">
              <div className="exam-cert-identity">
                <div
                  className={`exam-qualification-seal rank-${earnedRank}`}
                  aria-label={exUi.common.qualificationSealLabel(earnedRank)}
                >
                  <div className={`exam-rank-medallion rank-${earnedRank}`}>
                    {earnedRank}
                  </div>
                  <span className="exam-seal-caption">
                    {exUi.common.qualificationSealLabel(earnedRank)}
                  </span>
                </div>
                <div className="exam-cert-titles">
                  <div className="exam-cert-overline">
                    <span>{exUi.triage.certBadge}</span>
                    {triage.isNewRecord && (
                      <span className="exam-new-record-pill">
                        {exUi.common.newRecordBadge}
                      </span>
                    )}
                    <span className="exam-cert-summary-pill">
                      {exUi.common.accuracySummary(
                        triageAccuracyPct,
                        formatExamDuration(triage.elapsedMs)
                      )}
                    </span>
                  </div>
                  <strong className="exam-cert-main-heading">
                    {rankMeta.badgeLabel} · {exUi.triage.certTitle}
                  </strong>
                  {examSummary.triageRank &&
                    examSummary.bestTriageScore !== null && (
                      <span className="exam-cert-sub-meta">
                        {exUi.triage.bestSummary(
                          examSummary.triageRank,
                          examSummary.bestTriageScore
                        )}
                      </span>
                    )}
                </div>
              </div>

              <div className="exam-cert-actions">
                <button
                  type="button"
                  className="exam-cert-passport-btn"
                  title={exUi.common.openPassportTitle}
                  onClick={openPassportModal}
                >
                  <BookOpen size={12} aria-hidden="true" />
                  <span>{exUi.common.openPassportBtn}</span>
                </button>
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
                  <span>{exUi.common.sharePosterBtn}</span>
                </button>
                <button
                  type="button"
                  className="exam-cert-retry-btn"
                  onClick={() => startBlindTriage(activeWeaponId)}
                >
                  <Shuffle size={12} aria-hidden="true" />
                  <span>{exUi.triage.retryBtn}</span>
                </button>
                <button
                  type="button"
                  className="exam-cert-exit-btn"
                  onClick={() => exitBlindTriage()}
                >
                  <X size={12} aria-hidden="true" />
                  <span>{exUi.triage.exitBtn}</span>
                </button>
              </div>
            </div>

            <div className="exam-cert-metrics-grid">
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.triage.statFinalScore}
                </span>
                <span className="exam-cert-metric-val">
                  {triage.finalScore} / 1200 {exUi.common.ptsUnit}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.triage.statElapsedTime}
                </span>
                <span className="exam-cert-metric-val">
                  {formatExamDuration(triage.elapsedMs)}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.triage.statTimeBonus}
                </span>
                <span className="exam-cert-metric-val is-bonus">
                  +{triage.timeBonus} {exUi.common.ptsUnit}
                </span>
              </div>
              <div className="exam-cert-metric-cell">
                <span className="exam-cert-metric-label">
                  {exUi.triage.statPenalties}
                </span>
                <span
                  className={`exam-cert-metric-val ${
                    triage.mistakeCount > 0 ? 'is-penalty' : 'is-bonus'
                  }`}
                >
                  {triage.wrongDiagnosisCount}/{triage.wrongClearanceCount} (-
                  {triage.diagnosisPenalty + triage.clearancePenalty}{' '}
                  {exUi.common.ptsUnit})
                </span>
              </div>
            </div>

            <div className="exam-cert-debrief">
              <strong>
                {exUi.triage.debriefPrefix}
                {isZh ? secretScenario.titleZh : secretScenario.titleEn}
              </strong>{' '}
              — {isZh ? secretScenario.rootCauseZh : secretScenario.rootCauseEn}
            </div>
          </div>
        ) : (
          <>
            {/* Step A: 4 Weapon-Authentic Diagnosis Choice Buttons */}
            <div
              className="malf-scenario-tabs"
              role="group"
              aria-label={
                isZh
                  ? '未知故障盲测诊断选项'
                  : 'Blind stoppage diagnosis options'
              }
            >
              {MALFUNCTION_ORDER.map((kind) => {
                const item = getMalfunctionScenario(kind, activeWeaponId);
                const isWrong = triage.wrongGuesses.includes(kind);
                const isConfirmed =
                  triage.phase === 'clearance' && triage.secretKind === kind;
                const isDimmed =
                  triage.phase === 'clearance' && triage.secretKind !== kind;

                return (
                  <button
                    key={kind}
                    type="button"
                    aria-pressed={isConfirmed}
                    className={`malf-tab-btn is-blind-choice kind-${kind} ${
                      isWrong ? 'is-wrong-guess' : ''
                    } ${isConfirmed ? 'is-confirmed-choice' : ''} ${
                      isDimmed ? 'is-dimmed-choice' : ''
                    }`}
                    disabled={isWrong || triage.phase === 'clearance'}
                    onClick={() => submitTriageDiagnosis(kind)}
                  >
                    <span className="exam-choice-top-row">
                      <span className="malf-tab-code">{item.code}</span>
                      <span className="exam-choice-status-tag">
                        {isConfirmed
                          ? exUi.triage.confirmedGuessTag
                          : isWrong
                            ? exUi.triage.wrongGuessTag
                            : exUi.triage.choicePromptTag}
                      </span>
                    </span>
                    <span className="malf-tab-name">
                      {isZh ? item.shortZh : item.shortEn}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Redacted Unknown Stoppage Banner (Step A) OR Confirmed Clearance Banner (Step B) */}
            <div
              className={`exam-redacted-banner ${
                triage.phase === 'clearance' ? 'is-confirmed' : ''
              }`}
              role="status"
              aria-live="polite"
            >
              <div className="exam-redacted-top">
                <div className="exam-redacted-headline">
                  {triage.phase === 'diagnosis' ? (
                    <>
                      <span className="malf-severity-chip">
                        <AlertTriangle size={11} aria-hidden="true" />
                        <span>{exUi.triage.redactedBadge}</span>
                      </span>
                      <span>{exUi.triage.redactedHeadline}</span>
                    </>
                  ) : (
                    <>
                      <CheckCircle2
                        size={14}
                        className="malf-cleared-icon"
                        aria-hidden="true"
                      />
                      <span>
                        {exUi.triage.diagnosisConfirmedHeadline(
                          isZh
                            ? secretScenario.titleZh
                            : secretScenario.titleEn
                        )}
                      </span>
                    </>
                  )}
                </div>

                <div
                  className="exam-optics-shortcuts"
                  role="group"
                  aria-label={
                    isZh
                      ? '剖视与透视快捷观察开关'
                      : 'Cutaway and X-ray inspection toggles'
                  }
                >
                  <button
                    type="button"
                    className={`exam-optic-chip ${sectionCut ? 'active' : ''}`}
                    aria-pressed={sectionCut}
                    onClick={toggleSectionCut}
                  >
                    <Scissors size={11} aria-hidden="true" />
                    <span>{exUi.triage.quickSectionBtn}</span>
                  </button>
                  <button
                    type="button"
                    className={`exam-optic-chip ${xrayShells ? 'active' : ''}`}
                    aria-pressed={xrayShells}
                    onClick={toggleXrayShells}
                  >
                    <Eye size={11} aria-hidden="true" />
                    <span>{exUi.triage.quickXrayBtn}</span>
                  </button>
                </div>
              </div>

              <p className="exam-redacted-sub">
                {triage.phase === 'diagnosis'
                  ? exUi.triage.redactedSubnote
                  : exUi.triage.clearanceInstruction}
              </p>

              {triage.lastFeedback?.kind === 'wrong_diagnosis' && (
                <div
                  key={`fb-${triage.lastFeedback.seq}`}
                  role="alert"
                  className="exam-inline-error-bar"
                >
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{exUi.triage.wrongDiagnosisAlert}</span>
                </div>
              )}

              {triage.lastFeedback?.kind === 'wrong_clearance' && (
                <div
                  key={`fb-${triage.lastFeedback.seq}`}
                  role="alert"
                  className="exam-inline-error-bar"
                >
                  <AlertTriangle size={13} aria-hidden="true" />
                  <span>{exUi.triage.wrongClearanceAlert}</span>
                </div>
              )}
            </div>

            {/* Step B: Shuffled Blind Clearance Action Cards (Locked during Step A) */}
            {triage.phase === 'diagnosis' ? (
              <div className="exam-locked-steps-strip">
                <Lock size={13} aria-hidden="true" />
                <span>{exUi.triage.lockedStepsNotice}</span>
              </div>
            ) : (
              <ol
                className="malfunction-steps-list"
                aria-label={ui.drillStepsAria}
              >
                {triage.shuffledStepIndices.map((canonicalIdx) => {
                  const step = secretScenario.steps[canonicalIdx];
                  if (!step) return null;
                  const isDone = canonicalIdx < triage.completedClearanceSteps;

                  return (
                    <li
                      key={step.id}
                      className={`malf-step-item ${
                        isDone ? 'is-done' : 'is-blind-candidate'
                      }`}
                    >
                      <button
                        type="button"
                        className="malf-step-btn-card"
                        disabled={isDone}
                        onClick={() => attemptTriageClearanceStep(canonicalIdx)}
                      >
                        <span className="malf-step-num">
                          {isDone
                            ? exUi.triage.completedActionBadge(step.orderLabel)
                            : exUi.triage.blindActionBadge}
                        </span>
                        <span className="malf-step-copy">
                          <span className="malf-step-title">
                            {isZh ? step.titleZh : step.titleEn}
                          </span>
                          {!isDone && (
                            <span className="malf-step-detail">
                              {exUi.triage.blindActionSub(
                                triage.completedClearanceSteps + 1
                              )}
                            </span>
                          )}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            )}
          </>
        )
      ) : (
        <>
          {/* Guided Mode: 4 Canonical Malfunction & Safety Scenario Selector Tabs */}
          <div
            className="malf-scenario-tabs"
            role="group"
            aria-label={
              isZh ? '故障情景选择' : 'Stoppage scenario selection'
            }
          >
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

          {/* Guided Mode: Root-Cause Cutaway Diagnosis & Safety Protocol Banner */}
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
                  <strong>
                    {isArchery ? ui.archeryClearedTitle : ui.clearedTitle}
                  </strong>
                  <span className="malf-diag-sub">
                    {' '}
                    {isArchery ? ui.archeryClearedDesc : ui.clearedDesc}
                  </span>
                </div>
                <div className="exam-guided-celebration-actions">
                  <button
                    type="button"
                    className="exam-cert-retry-btn"
                    onClick={() => startBlindTriage(activeWeaponId)}
                  >
                    <Award size={12} aria-hidden="true" />
                    <span>{exUi.triage.toggleBtn}</span>
                  </button>
                  <button
                    type="button"
                    className="exam-cert-passport-btn"
                    title={exUi.common.openPassportTitle}
                    onClick={openPassportModal}
                  >
                    <BookOpen size={12} aria-hidden="true" />
                    <span>{exUi.common.openPassportBtn}</span>
                  </button>
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
                  <span>
                    {isZh ? scenario.safetyNoteZh : scenario.safetyNoteEn}
                  </span>
                  <span className="malf-click-hint">
                    {isArchery ? ui.archeryClick3dHint : ui.click3dHint}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Guided Mode: Ordered Clearing Drill Steps */}
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
        </>
      )}
    </div>
  );
};

MalfunctionHud.displayName = 'MalfunctionHud';

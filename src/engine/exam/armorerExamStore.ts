import { create } from 'zustand';
import type { WeaponId } from '../../weapons/types';
import {
  playTriggerDryBlockSound,
  playWorkbenchFoley,
} from '../audio/mechanicalSoundEngine';
import { FIELD_STRIP_PLANS } from '../fieldstrip/fieldStripSpecs';
import { fieldStripStore } from '../fieldstrip/fieldStripStore';
import {
  getMalfunctionScenario,
  isArcheryMalfunctionWeapon,
  MALFUNCTION_ORDER,
  type MalfunctionKind,
  WEAPON_MALFUNCTION_PROFILES,
} from '../malfunctions/malfunctionSpecs';
import { malfunctionStore } from '../malfunctions/malfunctionStore';
import { EXAM_STRINGS, type ExamRank } from './examStrings';

export type { ExamRank } from './examStrings';

export const EXAM_STORAGE_KEY = 'digital-armory-v2-exam-certs';

export const FIELD_STRIP_BASE_SCORE = 1000;
export const FIELD_STRIP_MISTAKE_PENALTY = 75;
export const FIELD_STRIP_MAX_TIME_BONUS = 200;
export const FIELD_STRIP_PAR_SECONDS_PER_ACTION = 4.5;

export const TRIAGE_BASE_SCORE = 1000;
export const TRIAGE_WRONG_DIAGNOSIS_PENALTY = 120;
export const TRIAGE_WRONG_CLEARANCE_PENALTY = 60;
export const TRIAGE_MAX_TIME_BONUS = 200;
export const TRIAGE_PAR_SECONDS_PER_STEP = 7.0;

export const EXAM_MIN_SCORE = 0;
export const EXAM_MAX_SCORE = 1200;

const RANK_WEIGHT: Readonly<Record<ExamRank, 1 | 2 | 3 | 4>> = {
  C: 1,
  B: 2,
  A: 3,
  S: 4,
};

export interface WeaponExamRecord {
  fieldStripRank: ExamRank | null;
  bestFieldStripMs: number | null;
  bestFieldStripScore: number | null;
  detailStripRank?: ExamRank | null;
  triageRank: ExamRank | null;
  bestTriageScore: number | null;
  certifiedAt: string | null;
}

export interface WeaponExamSummary extends WeaponExamRecord {
  weaponId: string;
  overallRank: ExamRank | null;
  isCertified: boolean;
  isDualCertified: boolean;
  stars: 0 | 1 | 2 | 3 | 4;
}

export type BlindFieldStripExamPhase =
  | 'idle'
  | 'disassembly'
  | 'reassembly'
  | 'completed';

export interface BlindFieldStripExamState {
  active: boolean;
  weaponId: WeaponId;
  phase: BlindFieldStripExamPhase;
  totalSteps: number;
  completedPhaseSteps: number;
  overallCompletedActions: number;
  totalActions: number;
  mistakeCount: number;
  startedAtMs: number;
  completedAtMs: number | null;
  elapsedMs: number;
  parSeconds: number;
  baseScore: number;
  mistakePenalty: number;
  timeBonus: number;
  finalScore: number;
  rank: ExamRank | null;
  isNewRecord: boolean;
  errorSeq: number;
}

export type BlindTriageExamPhase =
  | 'idle'
  | 'diagnosis'
  | 'clearance'
  | 'completed';

export interface BlindTriageFeedback {
  kind: 'wrong_diagnosis' | 'diagnosis_confirmed' | 'wrong_clearance';
  seq: number;
}

export interface BlindTriageExamState {
  active: boolean;
  weaponId: WeaponId;
  phase: BlindTriageExamPhase;
  secretKind: MalfunctionKind;
  wrongGuesses: readonly MalfunctionKind[];
  wrongDiagnosisCount: number;
  wrongClearanceCount: number;
  mistakeCount: number;
  completedClearanceSteps: number;
  totalClearanceSteps: number;
  shuffledStepIndices: readonly number[];
  startedAtMs: number;
  diagnosedAtMs: number | null;
  completedAtMs: number | null;
  elapsedMs: number;
  parSeconds: number;
  baseScore: number;
  diagnosisPenalty: number;
  clearancePenalty: number;
  timeBonus: number;
  finalScore: number;
  rank: ExamRank | null;
  isNewRecord: boolean;
  lastFeedback: BlindTriageFeedback | null;
}

export interface FieldStripScoreBreakdown {
  baseScore: number;
  mistakePenalty: number;
  timeBonus: number;
  parSeconds: number;
  totalScore: number;
  rank: ExamRank;
}

export interface TriageScoreBreakdown {
  baseScore: number;
  diagnosisPenalty: number;
  clearancePenalty: number;
  timeBonus: number;
  parSeconds: number;
  totalScore: number;
  rank: ExamRank;
}

export interface StartBlindTriageOptions {
  forcedKind?: MalfunctionKind;
  shuffleOrder?: readonly number[];
  startNowMs?: number;
}

export type TriageDiagnosisOutcome =
  | 'correct'
  | 'wrong'
  | 'already_guessed'
  | 'inactive';

export type TriageClearanceAttemptOutcome =
  | 'advanced'
  | 'completed'
  | 'out_of_order'
  | 'already_done'
  | 'inactive';

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

let customExamClock: (() => number) | null = null;

export function setExamClockForTests(clockFn: (() => number) | null): void {
  customExamClock = clockFn;
}

export function nowExamMs(): number {
  if (customExamClock) return customExamClock();
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}

function clampScore(val: number): number {
  return Math.max(EXAM_MIN_SCORE, Math.min(EXAM_MAX_SCORE, Math.round(val)));
}

export function isExamRank(val: unknown): val is ExamRank {
  return val === 'S' || val === 'A' || val === 'B' || val === 'C';
}

export function compareExamRanks(
  a: ExamRank | null,
  b: ExamRank | null
): number {
  const wa = a ? RANK_WEIGHT[a] : 0;
  const wb = b ? RANK_WEIGHT[b] : 0;
  return wa - wb;
}

export function maxExamRank(
  a: ExamRank | null,
  b: ExamRank | null
): ExamRank | null {
  return compareExamRanks(a, b) >= 0 ? a : b;
}

/**
 * Evaluates Armorer Certification Rank from clamped [0..1200] score & total mistakes:
 * - `S` (`Master Armorer / 首席军械师`): `>= 1050` pts & `0` mistakes
 * - `A` (`Senior Armorer / 高级军械师`): `>= 880` pts & `<= 1` mistake
 * - `B` (`Qualified / 合格军械员`): `>= 700` pts
 * - `C` (`Trainee / 见习学徒`): `< 700` pts
 */
export function computeExamRank(score: number, mistakeCount: number): ExamRank {
  const safeMistakes = Math.max(0, Math.floor(mistakeCount));
  if (score >= 1050 && safeMistakes === 0) return 'S';
  if (score >= 880 && safeMistakes <= 1) return 'A';
  if (score >= 700) return 'B';
  return 'C';
}

export function computeFieldStripExamScore(params: {
  totalSteps: number;
  mistakeCount: number;
  elapsedMs: number;
}): FieldStripScoreBreakdown {
  const safeSteps = Math.max(1, params.totalSteps);
  const safeMistakes = Math.max(0, Math.floor(params.mistakeCount));
  const parSeconds = safeSteps * 2 * FIELD_STRIP_PAR_SECONDS_PER_ACTION;
  const elapsedSec = Math.max(0, params.elapsedMs) / 1000;
  const rawBonus =
    parSeconds > 0
      ? (1 - elapsedSec / parSeconds) * FIELD_STRIP_MAX_TIME_BONUS
      : 0;
  const timeBonus = Math.round(
    Math.max(0, Math.min(FIELD_STRIP_MAX_TIME_BONUS, rawBonus))
  );
  const mistakePenalty = safeMistakes * FIELD_STRIP_MISTAKE_PENALTY;
  const totalScore = clampScore(
    FIELD_STRIP_BASE_SCORE - mistakePenalty + timeBonus
  );
  const rank = computeExamRank(totalScore, safeMistakes);
  return {
    baseScore: FIELD_STRIP_BASE_SCORE,
    mistakePenalty,
    timeBonus,
    parSeconds,
    totalScore,
    rank,
  };
}

export function computeTriageExamScore(params: {
  totalClearanceSteps: number;
  wrongDiagnosisCount: number;
  wrongClearanceCount: number;
  elapsedMs: number;
}): TriageScoreBreakdown {
  const safeSteps = Math.max(1, params.totalClearanceSteps);
  const safeDiagErr = Math.max(0, Math.floor(params.wrongDiagnosisCount));
  const safeClearErr = Math.max(0, Math.floor(params.wrongClearanceCount));
  const parSeconds = (2 + safeSteps) * TRIAGE_PAR_SECONDS_PER_STEP;
  const elapsedSec = Math.max(0, params.elapsedMs) / 1000;
  const rawBonus =
    parSeconds > 0
      ? (1 - elapsedSec / parSeconds) * TRIAGE_MAX_TIME_BONUS
      : 0;
  const timeBonus = Math.round(
    Math.max(0, Math.min(TRIAGE_MAX_TIME_BONUS, rawBonus))
  );
  const diagnosisPenalty = safeDiagErr * TRIAGE_WRONG_DIAGNOSIS_PENALTY;
  const clearancePenalty = safeClearErr * TRIAGE_WRONG_CLEARANCE_PENALTY;
  const totalScore = clampScore(
    TRIAGE_BASE_SCORE - diagnosisPenalty - clearancePenalty + timeBonus
  );
  const rank = computeExamRank(totalScore, safeDiagErr + safeClearErr);
  return {
    baseScore: TRIAGE_BASE_SCORE,
    diagnosisPenalty,
    clearancePenalty,
    timeBonus,
    parSeconds,
    totalScore,
    rank,
  };
}

export function formatExamDuration(ms: number): string {
  const clamped = Math.max(0, ms);
  const totalTenths = Math.floor(clamped / 100);
  const tenths = totalTenths % 10;
  const totalSecs = Math.floor(totalTenths / 10);
  const mins = Math.floor(totalSecs / 60);
  const secs = totalSecs % 60;
  const mm = String(mins).padStart(2, '0');
  const ss = String(secs).padStart(2, '0');
  return `${mm}:${ss}.${tenths}`;
}

function getSafeLocalStorage(): StorageLike | null {
  try {
    if (typeof globalThis !== 'undefined' && 'localStorage' in globalThis) {
      const candidate = (
        globalThis as unknown as { localStorage?: StorageLike | null }
      ).localStorage;
      if (
        candidate &&
        typeof candidate.getItem === 'function' &&
        typeof candidate.setItem === 'function'
      ) {
        return candidate;
      }
    }
  } catch {
    // Ignore SecurityError in sandboxed contexts or Node --localstorage-file absence
  }
  return null;
}

function createEmptyWeaponRecord(): WeaponExamRecord {
  return {
    fieldStripRank: null,
    bestFieldStripMs: null,
    bestFieldStripScore: null,
    triageRank: null,
    bestTriageScore: null,
    certifiedAt: null,
  };
}

export function deserializeExamLedger(
  rawJson: string | null | undefined
): Record<string, WeaponExamRecord> {
  if (!rawJson || typeof rawJson !== 'string') return {};
  try {
    const parsed: unknown = JSON.parse(rawJson);
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {};
    }
    const out: Record<string, WeaponExamRecord> = {};
    for (const [weaponKey, rawVal] of Object.entries(
      parsed as Record<string, unknown>
    )) {
      if (!rawVal || typeof rawVal !== 'object' || Array.isArray(rawVal)) {
        continue;
      }
      const rec = rawVal as Record<string, unknown>;
      const fieldStripRank = isExamRank(rec.fieldStripRank)
        ? rec.fieldStripRank
        : null;
      const detailStripRank = isExamRank(rec.detailStripRank)
        ? rec.detailStripRank
        : null;
      const bestFieldStripMs =
        typeof rec.bestFieldStripMs === 'number' &&
        Number.isFinite(rec.bestFieldStripMs) &&
        rec.bestFieldStripMs >= 0
          ? Math.round(rec.bestFieldStripMs)
          : null;
      const bestFieldStripScore =
        typeof rec.bestFieldStripScore === 'number' &&
        Number.isFinite(rec.bestFieldStripScore)
          ? clampScore(rec.bestFieldStripScore)
          : null;
      const triageRank = isExamRank(rec.triageRank) ? rec.triageRank : null;
      const bestTriageScore =
        typeof rec.bestTriageScore === 'number' &&
        Number.isFinite(rec.bestTriageScore)
          ? clampScore(rec.bestTriageScore)
          : null;
      const certifiedAt =
        typeof rec.certifiedAt === 'string' && rec.certifiedAt.length > 0
          ? rec.certifiedAt
          : null;

      if (
        fieldStripRank !== null ||
        detailStripRank !== null ||
        bestFieldStripMs !== null ||
        bestFieldStripScore !== null ||
        triageRank !== null ||
        bestTriageScore !== null
      ) {
        out[weaponKey] = {
          fieldStripRank,
          bestFieldStripMs,
          bestFieldStripScore,
          ...(detailStripRank !== null ? { detailStripRank } : {}),
          triageRank,
          bestTriageScore,
          certifiedAt,
        };
      }
    }
    return out;
  } catch {
    return {};
  }
}

export function serializeExamLedger(
  ledger: Readonly<Record<string, WeaponExamRecord>>
): string {
  return JSON.stringify(ledger);
}

function loadLedgerFromStorage(): Record<string, WeaponExamRecord> {
  const storage = getSafeLocalStorage();
  if (!storage) return {};
  try {
    return deserializeExamLedger(storage.getItem(EXAM_STORAGE_KEY));
  } catch {
    return {};
  }
}

function persistLedgerToStorage(
  ledger: Readonly<Record<string, WeaponExamRecord>>
): void {
  const storage = getSafeLocalStorage();
  if (!storage) return;
  try {
    storage.setItem(EXAM_STORAGE_KEY, serializeExamLedger(ledger));
  } catch {
    // Ignore QuotaExceededError in private browsing
  }
}

function buildShuffledIndices(count: number): number[] {
  const arr = Array.from({ length: count }, (_, i) => i);
  if (count <= 1) return arr;
  for (let i = count - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = arr[i];
    arr[i] = arr[j];
    arr[j] = tmp;
  }
  // Ensure cards are never left in trivial sorted [0, 1, 2, ...] order so the candidate must evaluate SOP sequence
  const isIdentity = arr.every((val, idx) => val === idx);
  if (isIdentity) {
    const first = arr[0];
    arr[0] = arr[count - 1];
    arr[count - 1] = first;
  }
  return arr;
}

function pickRandomMalfunctionKind(
  previousKind: MalfunctionKind | null
): MalfunctionKind {
  const candidates =
    previousKind !== null && MALFUNCTION_ORDER.length > 1
      ? MALFUNCTION_ORDER.filter((k) => k !== previousKind)
      : MALFUNCTION_ORDER;
  const idx = Math.floor(Math.random() * candidates.length);
  return candidates[idx] ?? 'stovepipe';
}

function createInitialFieldStripExamState(
  weaponId: WeaponId = 'ak15'
): BlindFieldStripExamState {
  const totalSteps =
    fieldStripStore.getActivePlan(weaponId)?.steps.length ??
    FIELD_STRIP_PLANS[weaponId]?.steps.length ??
    6;
  return {
    active: false,
    weaponId,
    phase: 'idle',
    totalSteps,
    completedPhaseSteps: 0,
    overallCompletedActions: 0,
    totalActions: totalSteps * 2,
    mistakeCount: 0,
    startedAtMs: 0,
    completedAtMs: null,
    elapsedMs: 0,
    parSeconds: totalSteps * 2 * FIELD_STRIP_PAR_SECONDS_PER_ACTION,
    baseScore: FIELD_STRIP_BASE_SCORE,
    mistakePenalty: 0,
    timeBonus: 0,
    finalScore: FIELD_STRIP_BASE_SCORE,
    rank: null,
    isNewRecord: false,
    errorSeq: 0,
  };
}

function createInitialTriageExamState(
  weaponId: WeaponId = 'ak15'
): BlindTriageExamState {
  return {
    active: false,
    weaponId,
    phase: 'idle',
    secretKind: 'stovepipe',
    wrongGuesses: [],
    wrongDiagnosisCount: 0,
    wrongClearanceCount: 0,
    mistakeCount: 0,
    completedClearanceSteps: 0,
    totalClearanceSteps: 3,
    shuffledStepIndices: [2, 0, 1],
    startedAtMs: 0,
    diagnosedAtMs: null,
    completedAtMs: null,
    elapsedMs: 0,
    parSeconds: 5 * TRIAGE_PAR_SECONDS_PER_STEP,
    baseScore: TRIAGE_BASE_SCORE,
    diagnosisPenalty: 0,
    clearancePenalty: 0,
    timeBonus: 0,
    finalScore: TRIAGE_BASE_SCORE,
    rank: null,
    isNewRecord: false,
    lastFeedback: null,
  };
}

export interface ArmorerExamStoreState {
  ledger: Readonly<Record<string, WeaponExamRecord>>;
  fieldStripExam: BlindFieldStripExamState;
  triageExam: BlindTriageExamState;

  startBlindFieldStrip: (weaponId: WeaponId, startNowMs?: number) => void;
  exitBlindFieldStrip: (resetParts?: boolean) => void;

  startBlindTriage: (
    weaponId: WeaponId,
    options?: StartBlindTriageOptions
  ) => void;
  submitTriageDiagnosis: (
    guessedKind: MalfunctionKind
  ) => TriageDiagnosisOutcome;
  attemptTriageClearanceStep: (
    canonicalStepIndexOrId: number | string,
    nowOverrideMs?: number
  ) => TriageClearanceAttemptOutcome;
  exitBlindTriage: () => void;

  hydrateLedgerFromStorage: () => Readonly<Record<string, WeaponExamRecord>>;
  exportPassportJson: () => string;
  importPassportJson: (rawJson: string) => {
    ok: boolean;
    importedCount: number;
  };
  clearExamLedger: () => void;
}

let suppressExternalFieldStripReset = false;
let suppressExternalMalfunctionReset = false;
let feedbackSeqCounter = 0;

export const useArmorerExamStore = create<ArmorerExamStoreState>((set, get) => ({
  ledger: loadLedgerFromStorage(),
  fieldStripExam: createInitialFieldStripExamState('ak15'),
  triageExam: createInitialTriageExamState('ak15'),

  startBlindFieldStrip: (weaponId, startNowMs) => {
    const plan = fieldStripStore.getActivePlan(weaponId);
    const totalSteps = plan ? plan.steps.length : 6;
    const parSeconds = totalSteps * 2 * FIELD_STRIP_PAR_SECONDS_PER_ACTION;
    const startTs = startNowMs ?? nowExamMs();

    set({
      fieldStripExam: {
        active: true,
        weaponId,
        phase: 'disassembly',
        totalSteps,
        completedPhaseSteps: 0,
        overallCompletedActions: 0,
        totalActions: totalSteps * 2,
        mistakeCount: 0,
        startedAtMs: startTs,
        completedAtMs: null,
        elapsedMs: 0,
        parSeconds,
        baseScore: FIELD_STRIP_BASE_SCORE,
        mistakePenalty: 0,
        timeBonus: 0,
        finalScore: FIELD_STRIP_BASE_SCORE,
        rank: null,
        isNewRecord: false,
        errorSeq: 0,
      },
    });

    suppressExternalFieldStripReset = true;
    try {
      fieldStripStore.reset(weaponId, true);
    } finally {
      suppressExternalFieldStripReset = false;
    }
    playWorkbenchFoley('toggle_switch');
  },

  exitBlindFieldStrip: (resetParts = false) => {
    const cur = get().fieldStripExam;
    if (!cur.active) return;
    set({
      fieldStripExam: createInitialFieldStripExamState(cur.weaponId),
    });
    if (resetParts) {
      suppressExternalFieldStripReset = true;
      try {
        fieldStripStore.reset(cur.weaponId, false);
      } finally {
        suppressExternalFieldStripReset = false;
      }
    } else {
      fieldStripStore.dismissInterference();
      fieldStripStore.refreshSnapshot();
    }
  },

  startBlindTriage: (weaponId, options) => {
    const prevTriage = get().triageExam;
    const prevKind =
      prevTriage.weaponId === weaponId ? prevTriage.secretKind : null;
    const secretKind =
      options?.forcedKind ?? pickRandomMalfunctionKind(prevKind);
    const scenario = getMalfunctionScenario(secretKind, weaponId);
    const totalClearanceSteps = scenario.steps.length;
    const parSeconds = (2 + totalClearanceSteps) * TRIAGE_PAR_SECONDS_PER_STEP;
    const startTs = options?.startNowMs ?? nowExamMs();

    let shuffled: readonly number[];
    if (
      options?.shuffleOrder &&
      options.shuffleOrder.length === totalClearanceSteps
    ) {
      shuffled = [...options.shuffleOrder];
    } else {
      shuffled = buildShuffledIndices(totalClearanceSteps);
    }

    suppressExternalMalfunctionReset = true;
    try {
      malfunctionStore.activate(weaponId, secretKind);
    } finally {
      suppressExternalMalfunctionReset = false;
    }

    set({
      triageExam: {
        active: true,
        weaponId,
        phase: 'diagnosis',
        secretKind,
        wrongGuesses: [],
        wrongDiagnosisCount: 0,
        wrongClearanceCount: 0,
        mistakeCount: 0,
        completedClearanceSteps: 0,
        totalClearanceSteps,
        shuffledStepIndices: shuffled,
        startedAtMs: startTs,
        diagnosedAtMs: null,
        completedAtMs: null,
        elapsedMs: 0,
        parSeconds,
        baseScore: TRIAGE_BASE_SCORE,
        diagnosisPenalty: 0,
        clearancePenalty: 0,
        timeBonus: 0,
        finalScore: TRIAGE_BASE_SCORE,
        rank: null,
        isNewRecord: false,
        lastFeedback: null,
      },
    });
  },

  submitTriageDiagnosis: (guessedKind) => {
    const cur = get().triageExam;
    if (!cur.active || cur.phase !== 'diagnosis') {
      return 'inactive';
    }
    if (cur.wrongGuesses.includes(guessedKind)) {
      return 'already_guessed';
    }

    feedbackSeqCounter += 1;
    if (guessedKind !== cur.secretKind) {
      const nextWrongGuesses = [...cur.wrongGuesses, guessedKind];
      const nextWrongDiag = cur.wrongDiagnosisCount + 1;
      const nextDiagPenalty = nextWrongDiag * TRIAGE_WRONG_DIAGNOSIS_PENALTY;
      const nextLiveScore = clampScore(
        TRIAGE_BASE_SCORE - nextDiagPenalty - cur.clearancePenalty
      );
      playTriggerDryBlockSound();
      set({
        triageExam: {
          ...cur,
          wrongGuesses: nextWrongGuesses,
          wrongDiagnosisCount: nextWrongDiag,
          mistakeCount: nextWrongDiag + cur.wrongClearanceCount,
          diagnosisPenalty: nextDiagPenalty,
          finalScore: nextLiveScore,
          lastFeedback: {
            kind: 'wrong_diagnosis',
            seq: feedbackSeqCounter,
          },
        },
      });
      return 'wrong';
    }

    playWorkbenchFoley('director_cue');
    set({
      triageExam: {
        ...cur,
        phase: 'clearance',
        diagnosedAtMs: nowExamMs(),
        lastFeedback: {
          kind: 'diagnosis_confirmed',
          seq: feedbackSeqCounter,
        },
      },
    });
    return 'correct';
  },

  attemptTriageClearanceStep: (canonicalStepIndexOrId, nowOverrideMs) => {
    const cur = get().triageExam;
    if (!cur.active || cur.phase !== 'clearance') {
      return 'inactive';
    }

    const scenario = getMalfunctionScenario(cur.secretKind, cur.weaponId);
    let targetIdx: number;
    if (typeof canonicalStepIndexOrId === 'number') {
      targetIdx = canonicalStepIndexOrId;
    } else {
      targetIdx = scenario.steps.findIndex(
        (st) => st.id === canonicalStepIndexOrId
      );
    }

    if (targetIdx < 0 || targetIdx >= cur.totalClearanceSteps) {
      return 'inactive';
    }
    if (targetIdx < cur.completedClearanceSteps) {
      return 'already_done';
    }

    feedbackSeqCounter += 1;
    if (targetIdx !== cur.completedClearanceSteps) {
      const nextClearErr = cur.wrongClearanceCount + 1;
      const nextClearPenalty =
        nextClearErr * TRIAGE_WRONG_CLEARANCE_PENALTY;
      const nextLiveScore = clampScore(
        TRIAGE_BASE_SCORE - cur.diagnosisPenalty - nextClearPenalty
      );
      playTriggerDryBlockSound();
      set({
        triageExam: {
          ...cur,
          wrongClearanceCount: nextClearErr,
          mistakeCount: cur.wrongDiagnosisCount + nextClearErr,
          clearancePenalty: nextClearPenalty,
          finalScore: nextLiveScore,
          lastFeedback: {
            kind: 'wrong_clearance',
            seq: feedbackSeqCounter,
          },
        },
      });
      return 'out_of_order';
    }

    // Valid sequential clearance action!
    malfunctionStore.advanceClearingStep(true);
    const nextCompleted = cur.completedClearanceSteps + 1;

    if (nextCompleted >= cur.totalClearanceSteps) {
      const finishTs = nowOverrideMs ?? nowExamMs();
      const elapsedMs = Math.max(0, Math.round(finishTs - cur.startedAtMs));
      const breakdown = computeTriageExamScore({
        totalClearanceSteps: cur.totalClearanceSteps,
        wrongDiagnosisCount: cur.wrongDiagnosisCount,
        wrongClearanceCount: cur.wrongClearanceCount,
        elapsedMs,
      });

      const currentLedger = get().ledger;
      const prevRec =
        currentLedger[cur.weaponId] ?? createEmptyWeaponRecord();
      const isNewRecord =
        prevRec.bestTriageScore === null ||
        breakdown.totalScore > prevRec.bestTriageScore ||
        compareExamRanks(breakdown.rank, prevRec.triageRank) > 0;

      const updatedRecord: WeaponExamRecord = {
        ...prevRec,
        triageRank: maxExamRank(breakdown.rank, prevRec.triageRank),
        bestTriageScore:
          prevRec.bestTriageScore === null
            ? breakdown.totalScore
            : Math.max(prevRec.bestTriageScore, breakdown.totalScore),
        certifiedAt:
          isNewRecord || prevRec.certifiedAt === null
            ? new Date().toISOString()
            : prevRec.certifiedAt,
      };
      const nextLedger = {
        ...currentLedger,
        [cur.weaponId]: updatedRecord,
      };
      persistLedgerToStorage(nextLedger);

      set({
        ledger: nextLedger,
        triageExam: {
          ...cur,
          phase: 'completed',
          completedClearanceSteps: nextCompleted,
          completedAtMs: finishTs,
          elapsedMs,
          timeBonus: breakdown.timeBonus,
          finalScore: breakdown.totalScore,
          rank: breakdown.rank,
          isNewRecord,
          lastFeedback: null,
        },
      });
      return 'completed';
    }

    set({
      triageExam: {
        ...cur,
        completedClearanceSteps: nextCompleted,
        lastFeedback: null,
      },
    });
    return 'advanced';
  },

  exitBlindTriage: () => {
    const cur = get().triageExam;
    if (!cur.active) return;
    set({
      triageExam: createInitialTriageExamState(cur.weaponId),
    });
  },

  hydrateLedgerFromStorage: () => {
    const loaded = loadLedgerFromStorage();
    set({ ledger: loaded });
    return loaded;
  },

  exportPassportJson: () => {
    return JSON.stringify(
      {
        schema: 'digital-armory-armorer-passport-v1',
        exportedAt: new Date().toISOString(),
        ledger: get().ledger,
      },
      null,
      2
    );
  },

  importPassportJson: (rawJson) => {
    try {
      const parsed: unknown = JSON.parse(rawJson);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
        return { ok: false, importedCount: 0 };
      }
      const env = parsed as Record<string, unknown>;
      if (
        env.schema !== 'digital-armory-armorer-passport-v1' ||
        !env.ledger ||
        typeof env.ledger !== 'object'
      ) {
        return { ok: false, importedCount: 0 };
      }
      const cleaned = deserializeExamLedger(JSON.stringify(env.ledger));
      const importedCount = Object.keys(cleaned).length;
      const merged: Record<string, WeaponExamRecord> = { ...get().ledger };
      for (const [wid, incoming] of Object.entries(cleaned)) {
        const curRec = merged[wid] ?? createEmptyWeaponRecord();
        merged[wid] = {
          fieldStripRank: maxExamRank(
            curRec.fieldStripRank,
            incoming.fieldStripRank
          ),
          bestFieldStripMs:
            curRec.bestFieldStripMs === null
              ? incoming.bestFieldStripMs
              : incoming.bestFieldStripMs === null
                ? curRec.bestFieldStripMs
                : Math.min(curRec.bestFieldStripMs, incoming.bestFieldStripMs),
          bestFieldStripScore:
            curRec.bestFieldStripScore === null
              ? incoming.bestFieldStripScore
              : incoming.bestFieldStripScore === null
                ? curRec.bestFieldStripScore
                : Math.max(
                    curRec.bestFieldStripScore,
                    incoming.bestFieldStripScore
                  ),
          detailStripRank: maxExamRank(
            curRec.detailStripRank ?? null,
            incoming.detailStripRank ?? null
          ),
          triageRank: maxExamRank(curRec.triageRank, incoming.triageRank),
          bestTriageScore:
            curRec.bestTriageScore === null
              ? incoming.bestTriageScore
              : incoming.bestTriageScore === null
                ? curRec.bestTriageScore
                : Math.max(curRec.bestTriageScore, incoming.bestTriageScore),
          certifiedAt: incoming.certifiedAt ?? curRec.certifiedAt,
        };
      }
      persistLedgerToStorage(merged);
      set({ ledger: merged });
      return { ok: true, importedCount };
    } catch {
      return { ok: false, importedCount: 0 };
    }
  },

  clearExamLedger: () => {
    const storage = getSafeLocalStorage();
    if (storage && typeof storage.removeItem === 'function') {
      try {
        storage.removeItem(EXAM_STORAGE_KEY);
      } catch {
        // Ignore storage error
      }
    }
    set({ ledger: {} });
  },
}));

export function buildSummaryFromRecord(
  weaponId: string,
  record: WeaponExamRecord | undefined
): WeaponExamSummary {
  const rec = record ?? createEmptyWeaponRecord();
  const overallRank = maxExamRank(
    maxExamRank(rec.fieldStripRank, rec.triageRank),
    rec.detailStripRank ?? null
  );
  const isCertified =
    rec.fieldStripRank !== null ||
    rec.triageRank !== null ||
    (rec.detailStripRank ?? null) !== null;
  const isDualCertified =
    rec.fieldStripRank !== null && rec.triageRank !== null;
  const stars: 0 | 1 | 2 | 3 | 4 = overallRank ? RANK_WEIGHT[overallRank] : 0;
  return {
    weaponId,
    ...rec,
    overallRank,
    isCertified,
    isDualCertified,
    stars,
  };
}

/**
 * Returns the persistent Armorer Certification summary for any `weaponId`
 * (compatible with all 16 baseline exhibits and Wave-2 19-exhibit expansion,
 * Armory qualification star badges, and Social Share Posters).
 */
export function getWeaponExamSummary(
  weaponId: WeaponId | string
): WeaponExamSummary {
  const inMemory = useArmorerExamStore.getState().ledger[weaponId];
  if (inMemory) {
    return buildSummaryFromRecord(weaponId, inMemory);
  }
  const fromDisk = loadLedgerFromStorage()[weaponId];
  return buildSummaryFromRecord(weaponId, fromDisk);
}

export function useWeaponExamSummary(
  weaponId: WeaponId | string
): WeaponExamSummary {
  const record = useArmorerExamStore((s) => s.ledger[weaponId]);
  return buildSummaryFromRecord(weaponId, record);
}

// -----------------------------------------------------------------------------
// Register Zero-Cycle Runtime Bridges with `fieldStripStore` & `malfunctionStore`
// -----------------------------------------------------------------------------

fieldStripStore.registerExamBridge({
  isBlindActiveForWeapon: (weaponId) => {
    const ex = useArmorerExamStore.getState().fieldStripExam;
    return ex.active && ex.weaponId === weaponId;
  },
  isBlindCompletedForWeapon: (weaponId) => {
    const ex = useArmorerExamStore.getState().fieldStripExam;
    return ex.active && ex.weaponId === weaponId && ex.phase === 'completed';
  },
  getRedactedMessages: () => ({
    stripBlockedZh: EXAM_STRINGS.zh.fieldStrip.interferenceStripMsg,
    stripBlockedEn: EXAM_STRINGS.en.fieldStrip.interferenceStripMsg,
    reassembleBlockedZh: EXAM_STRINGS.zh.fieldStrip.interferenceReassembleMsg,
    reassembleBlockedEn: EXAM_STRINGS.en.fieldStrip.interferenceReassembleMsg,
    wrongPartZh: EXAM_STRINGS.zh.fieldStrip.wrongPartMsg,
    wrongPartEn: EXAM_STRINGS.en.fieldStrip.wrongPartMsg,
  }),
  onAttemptOutcome: ({
    weaponId,
    outcome,
    strippedCount,
    totalSteps,
    fullCycleCompleted,
  }) => {
    const state = useArmorerExamStore.getState();
    const cur = state.fieldStripExam;
    if (!cur.active || cur.weaponId !== weaponId || cur.phase === 'completed') {
      return;
    }

    if (outcome === 'blocked' || outcome === 'non_strip_part') {
      const nextMistakes = cur.mistakeCount + 1;
      const nextPenalty = nextMistakes * FIELD_STRIP_MISTAKE_PENALTY;
      useArmorerExamStore.setState({
        fieldStripExam: {
          ...cur,
          mistakeCount: nextMistakes,
          mistakePenalty: nextPenalty,
          finalScore: clampScore(FIELD_STRIP_BASE_SCORE - nextPenalty),
          errorSeq: cur.errorSeq + 1,
        },
      });
      return;
    }

    if (outcome === 'stripped') {
      if (strippedCount >= totalSteps) {
        // N/N stripped -> automatic transition into reverse-topological reassembly!
        playWorkbenchFoley('director_cue');
        useArmorerExamStore.setState({
          fieldStripExam: {
            ...cur,
            phase: 'reassembly',
            completedPhaseSteps: 0,
            overallCompletedActions: totalSteps,
          },
        });
      } else {
        useArmorerExamStore.setState({
          fieldStripExam: {
            ...cur,
            phase: 'disassembly',
            completedPhaseSteps: strippedCount,
            overallCompletedActions: strippedCount,
          },
        });
      }
      return;
    }

    if (outcome === 'reassembled') {
      const reassembledCount = Math.max(0, totalSteps - strippedCount);
      const overallActions = totalSteps + reassembledCount;

      if (fullCycleCompleted || strippedCount === 0) {
        const finishTs = nowExamMs();
        const elapsedMs = Math.max(0, Math.round(finishTs - cur.startedAtMs));
        const breakdown = computeFieldStripExamScore({
          totalSteps,
          mistakeCount: cur.mistakeCount,
          elapsedMs,
        });

        const currentLedger = state.ledger;
        const prevRec =
          currentLedger[weaponId] ?? createEmptyWeaponRecord();
        const isNewRecord =
          prevRec.bestFieldStripScore === null ||
          breakdown.totalScore > prevRec.bestFieldStripScore ||
          compareExamRanks(breakdown.rank, prevRec.fieldStripRank) > 0;

        const isDetailTier = fieldStripStore.getTier() === 'detail';
        const updatedRecord: WeaponExamRecord = {
          ...prevRec,
          fieldStripRank: maxExamRank(
            breakdown.rank,
            prevRec.fieldStripRank
          ),
          ...(isDetailTier
            ? {
                detailStripRank: maxExamRank(
                  breakdown.rank,
                  prevRec.detailStripRank ?? null
                ),
              }
            : {}),
          bestFieldStripMs:
            prevRec.bestFieldStripMs === null
              ? elapsedMs
              : Math.min(prevRec.bestFieldStripMs, elapsedMs),
          bestFieldStripScore:
            prevRec.bestFieldStripScore === null
              ? breakdown.totalScore
              : Math.max(prevRec.bestFieldStripScore, breakdown.totalScore),
          certifiedAt:
            isNewRecord || prevRec.certifiedAt === null
              ? new Date().toISOString()
              : prevRec.certifiedAt,
        };
        const nextLedger = {
          ...currentLedger,
          [weaponId]: updatedRecord,
        };
        persistLedgerToStorage(nextLedger);
        playWorkbenchFoley('director_cue');

        useArmorerExamStore.setState({
          ledger: nextLedger,
          fieldStripExam: {
            ...cur,
            phase: 'completed',
            completedPhaseSteps: totalSteps,
            overallCompletedActions: totalSteps * 2,
            completedAtMs: finishTs,
            elapsedMs,
            timeBonus: breakdown.timeBonus,
            mistakePenalty: breakdown.mistakePenalty,
            finalScore: breakdown.totalScore,
            rank: breakdown.rank,
            isNewRecord,
          },
        });
      } else {
        useArmorerExamStore.setState({
          fieldStripExam: {
            ...cur,
            phase: 'reassembly',
            completedPhaseSteps: reassembledCount,
            overallCompletedActions: overallActions,
          },
        });
      }
    }
  },
  onExternalReset: (weaponId) => {
    if (suppressExternalFieldStripReset) return;
    const cur = useArmorerExamStore.getState().fieldStripExam;
    if (cur.active) {
      useArmorerExamStore.setState({
        fieldStripExam: createInitialFieldStripExamState(weaponId),
      });
    }
  },
});

malfunctionStore.registerExamBridge({
  getBlindStateForWeapon: (weaponId) => {
    const tr = useArmorerExamStore.getState().triageExam;
    if (!tr.active || tr.weaponId !== weaponId) {
      return { active: false, phase: 'idle' };
    }
    return { active: true, phase: tr.phase };
  },
  onPartClickInClearance: (weaponId, partId) => {
    const state = useArmorerExamStore.getState();
    const tr = state.triageExam;
    if (!tr.active || tr.weaponId !== weaponId || tr.phase !== 'clearance') {
      return false;
    }
    const prof = WEAPON_MALFUNCTION_PROFILES[weaponId];
    if (!prof) return false;

    const isAction = prof.actionPartIds.includes(partId);
    const isMag = prof.magazinePartIds.includes(partId);
    const isExtractor = prof.extractorPartId === partId;
    const isLocking = prof.lockingPartIds.includes(partId);
    const isFcg = prof.fireControlPartIds.includes(partId);

    if (!isAction && !isMag && !isExtractor && !isLocking && !isFcg) {
      return false;
    }

    const step = tr.completedClearanceSteps;
    const isStandardFirearm =
      !isArcheryMalfunctionWeapon(weaponId) && weaponId !== 'python';

    if (isStandardFirearm && tr.secretKind === 'double_feed') {
      // Step 0: Lock bolt/slide -> Step 1: Rip mag -> Step 2: Rack -> Step 3: Reload mag/bolt
      if (step === 0 && isMag && !isAction) {
        state.attemptTriageClearanceStep(1);
        return true;
      }
      if (step === 1 && !isMag) {
        state.attemptTriageClearanceStep(2);
        return true;
      }
    } else if (isStandardFirearm && tr.secretKind === 'light_strike') {
      // Step 0: Tap mag -> Step 1: Rack action -> Step 2: Battery
      if (step === 0 && !isMag) {
        state.attemptTriageClearanceStep(1);
        return true;
      }
      if (step === 1 && isMag && !isAction) {
        state.attemptTriageClearanceStep(2);
        return true;
      }
    }

    state.attemptTriageClearanceStep(step);
    return true;
  },
  onExternalResetOrChange: (weaponId) => {
    if (suppressExternalMalfunctionReset) return;
    const tr = useArmorerExamStore.getState().triageExam;
    if (tr.active) {
      useArmorerExamStore.setState({
        triageExam: createInitialTriageExamState(weaponId),
      });
    }
  },
});

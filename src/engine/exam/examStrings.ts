import type { LanguageCode } from '../../narration/types';

export type ExamRank = 'S' | 'A' | 'B' | 'C';

export interface ExamRankLocaleMeta {
  rank: ExamRank;
  title: string;
  badgeLabel: string;
  criteriaHint: string;
}

export interface ExamLocaleStrings {
  ranks: Readonly<Record<ExamRank, ExamRankLocaleMeta>>;
  common: {
    ptsUnit: string;
    parPrefix: (seconds: number) => string;
    scoreLabel: string;
    mistakesCount: (count: number) => string;
    newRecordBadge: string;
    personalBestTitle: (rank: ExamRank, score: number) => string;
    lockedBtnTag: string;
  };
  fieldStrip: {
    toggleBtn: string;
    toggleActiveBtn: string;
    toggleTitle: string;
    examBadge: string;
    stageDisassembly: (done: number, total: number) => string;
    stageReassembly: (done: number, total: number) => string;
    stageCompleted: string;
    blindNodeLabel: (orderLabel: string, status: 'done' | 'current' | 'pending') => string;
    disassemblyPromptTitle: string;
    disassemblyPromptDesc: string;
    reassemblyPromptTitle: string;
    reassemblyPromptDesc: string;
    interferenceBadge: string;
    interferenceStripMsg: string;
    interferenceReassembleMsg: string;
    wrongPartMsg: string;
    certBadge: string;
    certTitle: string;
    statFinalScore: string;
    statElapsedTime: string;
    statTimeBonus: string;
    statMistakes: string;
    bestSummary: (rank: ExamRank, score: number, bestTime: string) => string;
    retryBtn: string;
    exitBtn: string;
  };
  triage: {
    toggleBtn: string;
    toggleActiveBtn: string;
    toggleTitle: string;
    examBadge: string;
    rerollBtn: string;
    rerollTitle: string;
    stageDiagnosis: string;
    stageClearance: (done: number, total: number) => string;
    stageCompleted: string;
    redactedBadge: string;
    redactedHeadline: string;
    redactedSubnote: string;
    quickSectionBtn: string;
    quickXrayBtn: string;
    choicePromptTag: string;
    wrongGuessTag: string;
    confirmedGuessTag: string;
    wrongDiagnosisAlert: string;
    diagnosisConfirmedHeadline: (scenarioTitle: string) => string;
    clearanceInstruction: string;
    wrongClearanceAlert: string;
    lockedStepsNotice: string;
    blindActionBadge: string;
    blindActionSub: (stepNumber: number) => string;
    completedActionBadge: (orderLabel: string) => string;
    certBadge: string;
    certTitle: string;
    statFinalScore: string;
    statElapsedTime: string;
    statTimeBonus: string;
    statPenalties: string;
    debriefPrefix: string;
    bestSummary: (rank: ExamRank, score: number) => string;
    retryBtn: string;
    exitBtn: string;
  };
}

export const EXAM_STRINGS: Readonly<Record<LanguageCode, ExamLocaleStrings>> = {
  zh: {
    ranks: {
      S: {
        rank: 'S',
        title: '首席军械师',
        badgeLabel: 'S · 首席军械师',
        criteriaHint: '>= 1050 PTS 且 0 失误',
      },
      A: {
        rank: 'A',
        title: '高级军械师',
        badgeLabel: 'A · 高级军械师',
        criteriaHint: '>= 880 PTS 且 <= 1 失误',
      },
      B: {
        rank: 'B',
        title: '合格军械员',
        badgeLabel: 'B · 合格军械员',
        criteriaHint: '>= 700 PTS',
      },
      C: {
        rank: 'C',
        title: '见习学徒',
        badgeLabel: 'C · 见习学徒',
        criteriaHint: '< 700 PTS',
      },
    },
    common: {
      ptsUnit: 'PTS',
      parPrefix: (seconds) => `基准时限 ${seconds.toFixed(0)}s（提前完赛获最高 +200 速拆加分）`,
      scoreLabel: '积分',
      mistakesCount: (count) => `失误 ${count}`,
      newRecordBadge: '新纪录',
      personalBestTitle: (rank, score) => `本枪最佳认证：${rank} 级（${score} PTS）`,
      lockedBtnTag: '盲考禁用',
    },
    fieldStrip: {
      toggleBtn: '盲拆考核 · Blind Exam',
      toggleActiveBtn: '退出考核',
      toggleTitle:
        '开启军械师全盲计时拆装考核：隐藏全部步骤名、零件提示与自动执行按钮，完成 0→N 分解与 N→0 逆序复装闭锁评定 S/A/B/C 职级',
      examBadge: '军械师盲拆考核',
      stageDisassembly: (done, total) => `阶段 1/2 · 盲拆 ${done}/${total}`,
      stageReassembly: (done, total) => `阶段 2/2 · 复装 ${done}/${total}`,
      stageCompleted: '考核完赛 · 闭锁归位',
      blindNodeLabel: (orderLabel, status) =>
        status === 'done'
          ? `${orderLabel} ✓`
          : status === 'current'
            ? `${orderLabel} ●`
            : `${orderLabel} ?`,
      disassemblyPromptTitle: '阶段一：全盲拓扑分解（0 → N）',
      disassemblyPromptDesc:
        '步骤名称与提示已全部隐去，请直接在 3D 视口依正确机械解锁顺序点击零件拆解（误触锁死件 -75 PTS）。',
      reassemblyPromptTitle: '阶段二：全盲逆序复装（N → 0）',
      reassemblyPromptDesc:
        '全部分解到位！请立即按逆向拓扑顺序逐一点选 3D 零件归位复装至完全闭锁（逆序干涉 -75 PTS）。',
      interferenceBadge: '盲考干涉 -75 PTS',
      interferenceStripMsg:
        '机械闭锁干涉（-75 PTS）— 存在前置锁定组件尚未拆解，请观察 3D 结构自行研判拓扑顺序！',
      interferenceReassembleMsg:
        '逆序复装干涉（-75 PTS）— 后续关联部件尚未先行装回，请按严格逆序拓扑归位！',
      wrongPartMsg:
        '无效拆装目标（-75 PTS）— 该部件不属于当前阶段可拆装运动子总成！',
      certBadge: 'WP-13 军械师资格认证',
      certTitle: '全盲计时勤务拆装考核证书',
      statFinalScore: '综合总分',
      statElapsedTime: '完赛耗时',
      statTimeBonus: '速拆奖励',
      statMistakes: '干涉失误',
      bestSummary: (rank, score, bestTime) =>
        `历史最佳：${rank} 级 · ${score} PTS · 最快 ${bestTime}`,
      retryBtn: '再战刷新纪录',
      exitBtn: '退出考核',
    },
    triage: {
      toggleBtn: '随机盲测排障 · Blind Triage',
      toggleActiveBtn: '退出盲测',
      toggleTitle:
        '随机抽取未知机械卡阻并隐去故障名称与成因提示，先观察 3D 剖面定性诊断，再依序执行盲测排障动作',
      examBadge: '未知卡阻盲测排障',
      rerollBtn: '换题重测',
      rerollTitle: '重新随机抽取另一项未知机械故障从头考核',
      stageDiagnosis: 'STEP A · 故障定性研判',
      stageClearance: (done, total) => `STEP B · 盲测排障 ${done}/${total}`,
      stageCompleted: '排障认证完成',
      redactedBadge: '未知卡阻 · 待定性',
      redactedHeadline:
        '??? 未知机械卡阻 — 请开启剖视 [C] / 透视 [X] 观察内部啮合状态并诊断故障类型',
      redactedSubnote:
        '检视弹膛、抛壳窗、抽壳钩、击针与供弹路径的三维卡滞特征，点击下方四项故障之一完成定性（误判 -120 PTS）。',
      quickSectionBtn: '剖视 [C]',
      quickXrayBtn: '透视 [X]',
      choicePromptTag: '点击诊断',
      wrongGuessTag: '误判 -120',
      confirmedGuessTag: '确诊 ✓',
      wrongDiagnosisAlert:
        '故障定性误判（-120 PTS）— 当前 3D 弹膛与自动机啮合姿态与该故障不符，请结合剖视/透视重新核查！',
      diagnosisConfirmedHeadline: (scenarioTitle) =>
        `定性准确：${scenarioTitle}`,
      clearanceInstruction:
        '第二阶段：排障卡片已随机打乱且隐去序号提示，请按真实军械安全规程依序点选处置动作（乱序点击 -60 PTS）。',
      wrongClearanceAlert:
        '排障工序错误（-60 PTS）— 违反安全排障先后因果顺序，请先执行前置卸压/退弹动作！',
      lockedStepsNotice:
        '排障动作卡锁定中 — 请先在上方完成 STEP A 未知故障定性诊断后解锁。',
      blindActionBadge: '??',
      blindActionSub: (stepNumber) => `点击作为第 ${stepNumber} 步排障工序执行`,
      completedActionBadge: (orderLabel) => `${orderLabel} ✓`,
      certBadge: 'WP-13 排障盲测认证',
      certTitle: '未知卡阻定性与盲测排障资格证书',
      statFinalScore: '综合总分',
      statElapsedTime: '排障耗时',
      statTimeBonus: '速排奖励',
      statPenalties: '误判 / 乱序',
      debriefPrefix: '机理解密复盘：',
      bestSummary: (rank, score) => `本枪最佳排障认证：${rank} 级 · ${score} PTS`,
      retryBtn: '再战刷新纪录',
      exitBtn: '退出考核',
    },
  },

  en: {
    ranks: {
      S: {
        rank: 'S',
        title: 'Master Armorer',
        badgeLabel: 'S · Master Armorer',
        criteriaHint: '>= 1050 PTS & 0 Mistakes',
      },
      A: {
        rank: 'A',
        title: 'Senior Armorer',
        badgeLabel: 'A · Senior Armorer',
        criteriaHint: '>= 880 PTS & <= 1 Mistake',
      },
      B: {
        rank: 'B',
        title: 'Qualified',
        badgeLabel: 'B · Qualified',
        criteriaHint: '>= 700 PTS',
      },
      C: {
        rank: 'C',
        title: 'Trainee',
        badgeLabel: 'C · Trainee',
        criteriaHint: '< 700 PTS',
      },
    },
    common: {
      ptsUnit: 'PTS',
      parPrefix: (seconds) =>
        `Par Time ${seconds.toFixed(0)}s (up to +200 speed bonus)`,
      scoreLabel: 'SCORE',
      mistakesCount: (count) =>
        count === 1 ? '1 Mistake' : `${count} Mistakes`,
      newRecordBadge: 'NEW RECORD',
      personalBestTitle: (rank, score) =>
        `Personal Best Certification: Rank ${rank} (${score} PTS)`,
      lockedBtnTag: 'Exam Locked',
    },
    fieldStrip: {
      toggleBtn: 'Blind Exam',
      toggleActiveBtn: 'Exit Exam',
      toggleTitle:
        'Launch Blind Timed Armorer Certification: hides all step names, part hints, and auto-solve buttons across 0->N disassembly and N->0 reverse reassembly',
      examBadge: 'BLIND ARMORER EXAM',
      stageDisassembly: (done, total) => `STAGE 1/2 · STRIP ${done}/${total}`,
      stageReassembly: (done, total) =>
        `STAGE 2/2 · REASSEMBLE ${done}/${total}`,
      stageCompleted: 'CERTIFIED · IN BATTERY',
      blindNodeLabel: (orderLabel, status) =>
        status === 'done'
          ? `${orderLabel} ✓`
          : status === 'current'
            ? `${orderLabel} ●`
            : `${orderLabel} ?`,
      disassemblyPromptTitle: 'Stage 1: Blind Topological Disassembly (0 -> N)',
      disassemblyPromptDesc:
        'All step titles and hints are redacted. Click unblocked 3D parts directly in valid mechanical order (-75 PTS per interference error).',
      reassemblyPromptTitle: 'Stage 2: Blind Reverse Reassembly (N -> 0)',
      reassemblyPromptDesc:
        'Disassembly complete! Click 3D sub-assemblies in reverse topological order to restore full battery (-75 PTS per order error).',
      interferenceBadge: 'INTERFERENCE -75 PTS',
      interferenceStripMsg:
        'Mechanical lock interference (-75 PTS) — A prerequisite assembly still retains this component. Inspect 3D engagement to deduce order!',
      interferenceReassembleMsg:
        'Reverse-assembly interference (-75 PTS) — Seat dependent sub-assemblies first before reinstalling this component!',
      wrongPartMsg:
        'Invalid target (-75 PTS) — Component is not an active removable sub-assembly in the current exam phase!',
      certBadge: 'WP-13 ARMORER QUALIFICATION',
      certTitle: 'Blind Timed Field-Strip & Reassembly Certificate',
      statFinalScore: 'Final Score',
      statElapsedTime: 'Elapsed Time',
      statTimeBonus: 'Speed Bonus',
      statMistakes: 'Interferences',
      bestSummary: (rank, score, bestTime) =>
        `Personal Best: Rank ${rank} · ${score} PTS · Best ${bestTime}`,
      retryBtn: 'Retry for Record',
      exitBtn: 'Exit Exam',
    },
    triage: {
      toggleBtn: 'Blind Triage',
      toggleActiveBtn: 'Exit Triage',
      toggleTitle:
        'Spawn a random unknown stoppage with all names and root causes redacted; inspect in 3D cutaway to diagnose and clear in sequence',
      examBadge: 'BLIND STOPPAGE TRIAGE',
      rerollBtn: 'New Stoppage',
      rerollTitle: 'Draw a fresh random unknown stoppage and restart triage exam',
      stageDiagnosis: 'STEP A · IDENTIFY FAULT',
      stageClearance: (done, total) =>
        `STEP B · CLEARANCE ${done}/${total}`,
      stageCompleted: 'TRIAGE CERTIFIED',
      redactedBadge: 'UNKNOWN STOPPAGE',
      redactedHeadline:
        '??? Unknown Mechanical Stoppage — Enable Section [C] / X-Ray [X] to inspect internal engagement and diagnose the fault',
      redactedSubnote:
        'Inspect the 3D chamber, ejection port, extractor, firing pin, and feed path, then select the matching stoppage below (-120 PTS per wrong guess).',
      quickSectionBtn: 'Section [C]',
      quickXrayBtn: 'X-Ray [X]',
      choicePromptTag: 'Diagnose',
      wrongGuessTag: 'Wrong -120',
      confirmedGuessTag: 'Confirmed ✓',
      wrongDiagnosisAlert:
        'Misdiagnosis (-120 PTS) — Internal 3D stoppage geometry does not match that classification. Check breech and feed alignment!',
      diagnosisConfirmedHeadline: (scenarioTitle) =>
        `Confirmed: ${scenarioTitle}`,
      clearanceInstruction:
        'Step B: Remedial actions are shuffled with sequence numbers redacted. Click each action in strict armorer SOP order (-60 PTS per out-of-order click).',
      wrongClearanceAlert:
        'Out-of-order action (-60 PTS) — Violates safe remedial sequence. Complete prerequisite unloading or clearing steps first!',
      lockedStepsNotice:
        'Remedial clearance cards locked — Complete Step A stoppage diagnosis above to unlock.',
      blindActionBadge: '??',
      blindActionSub: (stepNumber) =>
        `Click to execute as Clearance Step ${stepNumber}`,
      completedActionBadge: (orderLabel) => `${orderLabel} ✓`,
      certBadge: 'WP-13 TRIAGE QUALIFICATION',
      certTitle: 'Unknown Stoppage Diagnosis & Clearance Certificate',
      statFinalScore: 'Final Score',
      statElapsedTime: 'Clearance Time',
      statTimeBonus: 'Speed Bonus',
      statPenalties: 'Diag / Order Err',
      debriefPrefix: 'Mechanical Debrief:',
      bestSummary: (rank, score) =>
        `Personal Best Triage: Rank ${rank} · ${score} PTS`,
      retryBtn: 'Retry for Record',
      exitBtn: 'Exit Triage',
    },
  },
};

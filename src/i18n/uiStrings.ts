import type { ArmoryEnvironmentPreset } from '../engine/canvas/GunsmithStageMat';
import type { GraphicsQualityTier } from '../engine/canvas/graphicsQuality';
import type { FireSelectorMode } from '../engine/interaction/InteractiveActionController';
import type { ArmoryWearPreset } from '../engine/materials/armoryShader';
import type { LanguageCode } from '../narration/types';
import {
  WEAPON_IDS,
  type ArmoryCategory,
  type CameraPresetType,
  type MaterialKind,
} from '../weapons/types';

const VAULT_EXHIBIT_COUNT = WEAPON_IDS.length; // 29
const VAULT_EXHIBIT_ZH = '二十九';
const VAULT_PARTS_TOTAL = 731;
const VAULT_TEXTURES_TOTAL = 369;
const VAULT_SUITES_TOTAL = 86;
const VAULT_AUDIO_TOTAL = 1694;
const LAB_CALIBER_TOTAL = 16;
const LAB_CALIBER_ZH = '十六';
const TANK_ORDNANCE_TOTAL = 3;
const ORDNANCE_TOTAL = LAB_CALIBER_TOTAL + TANK_ORDNANCE_TOTAL; // 19
const BALLISTICS_PROFILES_TOTAL = 21;

export interface UiDictionary {
  watermark: string;
  langToggleTitle: string;
  geoBuildBanner: (shortLabel: string, ready: number, total: number) => string;
  studio: {
    envGroupAria: string;
    presets: Record<
      ArmoryEnvironmentPreset,
      {
        label: string;
        title: string;
      }
    >;
    postFxChip: string;
    postFxTitle: (enabled: boolean) => string;
    wearGroupAria: string;
    wearPresets: Record<
      ArmoryWearPreset,
      {
        label: string;
        title: string;
      }
    >;
    qualityTitle: (tier: GraphicsQualityTier) => string;
    qualityLabels: Record<GraphicsQualityTier, string>;
    hideUiChip: string;
    hideUiTitle: string;
    showUiChip: string;
    showUiTitle: string;
    fullscreenEnterChip: string;
    fullscreenExitChip: string;
    fullscreenTitle: (active: boolean) => string;
    immersiveBarAria: string;
  };
  armory: {
    title: string;
    subtitle: string;
    filterAria: string;
    categories: Record<ArmoryCategory | 'lmg' | 'shotgun' | 'archery', string>;
    showcaseBtn: string;
    showcaseTitle: string;
    cartridgeLabBtn: string;
    cartridgeLabTitle: string;
    ballisticsLabBtn: string;
    ballisticsLabTitle: string;
    posterBtn: string;
    posterTitle: string;
    certRackTitle: (rank: string) => string;
    certPlaqueLabel: string;
    certPlaqueSub: (
      stripRank: string | null,
      triageRank: string | null
    ) => string;
    storyBtn: string;
    storyBtnTitle: string;
    enterBenchBtn: (shortTag: string) => string;
    caliberLabel: string;
    precisionLabel: string;
    precisionValue: (assemblies: number, parts: number) => string;
    mechanismLabel: string;
    metrologyTitle: string;
    oalLabel: string;
    barrelLabel: string;
    weightLabel: string;
    muzzleVelLabel: string;
    rangeLabel: string;
    rofLabel: string;
    plaqueStoryCta: string;
    plaqueStorySub: string;
    plaquePrimaryCta: (shortTag: string) => string;
    pbrOn: string;
    pbrOff: string;
    pbrTitle: string;
    atlasBtn: string;
    atlasTitle: string;
    rotateOn: string;
    rotateOff: string;
    rotateTitle: string;
    xrayBtn: string;
    xrayTitle: string;
    sectionOn: string;
    sectionOff: string;
    sectionTitle: string;
    tintBtn: string;
    tintTitle: string;
    stageHint: string;
    rackAria: string;
    rackTitle: string;
    rackTip: string;
    scrollLeft: string;
    scrollRight: string;
    previewingBadge: string;
    plannedBadge: string;
    partsNodeSuffix: (count: number) => string;
    cardEnterCta: string;
    plannedToast: (name: string) => string;
    archeryPlaque: {
      caliberLabel: string;
      mechanismLabel: string;
      metrologyTitle: string;
      oalLabel: string;
      barrelLabel: string;
      weightLabel: string;
      muzzleVelLabel: string;
      rangeLabel: string;
      rofLabel: string;
      plaquePrimaryCta: (shortTag: string) => string;
      stageHint: string;
    };
  };
  atlasModal: {
    dialogAria: string;
    kicker: string;
    weaponSwitcherAria: string;
    subtitle: string;
    liveOn: string;
    liveOff: string;
    closeAria: string;
    ormBadge: string;
    ormChannelTitle: string;
    downloadTitle: (fileName: string) => string;
    loadingFallback: (shortLabel: string) => string;
  };
  workbench: {
    backBtn: string;
    backTitle: string;
    viewAngles: Record<
      Extract<CameraPresetType, 'iso' | 'right' | 'left' | 'top'>,
      string
    >;
    storyChip: string;
    storyChipTitle: string;
    firingChip: string;
    firingChipTitle: string;
    pbrChip: string;
    pbrChipTitle: string;
    atlasChip: string;
    atlasChipTitle: string;
    xrayChip: string;
    xrayChipTitle: string;
    sectionChip: string;
    sectionChipTitle: string;
    tintChip: string;
    tintChipTitle: string;
    fieldStripChip: string;
    fieldStripChipTitle: string;
    malfunctionChip: string;
    malfunctionChipTitle: string;
    caliperChip: string;
    caliperChipTitle: string;
    cartridgeChip: string;
    cartridgeChipTitle: string;
    ballisticsChip: string;
    ballisticsChipTitle: string;
    posterChip: string;
    posterChipTitle: string;
    edgesChip: string;
    edgesChipTitle: string;
    labelsChip: string;
    labelsChipTitle: (count: number) => string;
    sfxChip: string;
    sfxChipTitle: (muted: boolean) => string;
    resetChip: string;
    resetChipTitle: string;
  };
  bom: {
    collapsedBtn: (count: number) => string;
    collapsedTitle: string;
    headerTitle: string;
    collapseAction: string;
    collapseTitle: string;
    showGroup: string;
    hideGroup: string;
  };
  inspector: {
    firingBadge: (stepNum: string) => string;
    closeTitle: string;
    minimizeBtn: string;
    minimizeTitle: string;
    expandBtn: string;
    expandTitle: string;
    roleLabel: string;
    materialLabel: string;
    envelopeLabel: string;
    envelopeTitle: string;
    envelopeBuilding: string;
    meshLabel: string;
    meshTitle: string;
    meshBuilding: string;
    meshTriangles: (formatted: string) => string;
    materials: Record<MaterialKind, string>;
    voiceGuideBtnPlay: string;
    voiceGuideBtnPause: string;
    voiceGuideLoading: string;
    autoVoiceLabel: string;
    autoVoiceTitle: string;
    secOverview: string;
    secCraft: string;
    secKinematics: string;
    secDesign: string;
    openStoryLink: string;
    isolateEnter: string;
    isolateExit: string;
    prevPart: string;
    nextPart: string;
    archery: {
      firingBadge: (stepNum: string) => string;
      minimizeTitle: string;
      materialLabel: string;
      materials: Record<MaterialKind, string>;
      secKinematics: string;
      openStoryLink: string;
    };
  };
  timeline: {
    modeExplode: string;
    modeFieldStrip: string;
    modeFiring: string;
    modeMalfunction: string;
    speeds: Record<'0.25' | '0.5' | '1', string>;
    loopOn: string;
    loopOff: string;
    loopTitle: string;
    hudPill: string;
    hudTitle: (open: boolean) => string;
    gasFlowPill: string;
    gasFlowTitle: string;
    sfxPill: string;
    sfxTitle: string;
    selectorGroupAria: string;
    selectorShort: Record<FireSelectorMode, string>;
    selectorBlockedHint: string;
    pressCheckBtn: string;
    pressCheckActiveBtn: string;
    pressCheckTitle: string;
    holdTriggerBtn: string;
    holdTriggerSafeBtn: string;
    holdTriggerResetBtn: string;
    holdTriggerTitle: string;
    pause: string;
    autoExplode: string;
    playExplodeTitle: (playing: boolean) => string;
    ticksExplode: [string, string, string, string];
    singleShot: string;
    singleShotTitle: string;
    resumeFiring: string;
    firingPlayTitle: string;
    ticksFiring: {
      cocked: string;
      ignition: string;
      unlockFallback: string;
      eject: string;
      feedLock: string;
      reset: string;
    };
    archery: {
      modeFiring: string;
      hudTitle: (open: boolean) => string;
      gasFlowPill: string;
      gasFlowTitle: string;
      sfxTitle: string;
      selectorGroupAria: string;
      selectorShort: Record<FireSelectorMode, string>;
      pressCheckBtn: string;
      pressCheckActiveBtn: string;
      pressCheckTitle: string;
      holdTriggerBtn: string;
      holdTriggerSafeBtn: string;
      holdTriggerResetBtn: string;
      holdTriggerTitle: string;
      singleShot: string;
      singleShotTitle: string;
      ticksFiring: {
        cocked: string;
        ignition: string;
        unlockFallback: string;
        eject: string;
        feedLock: string;
        reset: string;
      };
    };
  };
  story: {
    badge: string;
    drawerSubtitle: string;
    closeTitle: string;
    minimizeBtn: string;
    minimizeTitle: string;
    expandBtn: string;
    expandTitle: string;
    miniIdleSubtitle: string;
    playFullStory: string;
    pauseStory: string;
    directorBtn: string;
    directorBtnTitle: string;
    cinemaModeBtn: string;
    cinemaModeTitle: string;
    liveSubtitlesLabel: string;
    playingActPrefix: string;
    actVoicePlay: string;
    actVoicePlaying: string;
    inspectPartBtn: (partLabel: string) => string;
    breakthroughsTitle: string;
    breakthroughsSub: string;
    milestonesTitle: string;
    milestonesSub: string;
    loadingTitle: string;
    loadingDesc: string;
    pendingTitle: string;
    pendingDesc: string;
    switchToAk15Btn: string;
    aiAttribution: string;
    playbackRateTitle: string;
    archeryDrawerSubtitle: string;
    archeryMinimizeTitle: string;
  };
  engineeringTint: {
    badge: string;
    closeTitle: string;
    filterHint: string;
    showAllBtn: string;
    gasFlowToggle: string;
    gasFlowToggleTitle: string;
    liveGasCta: string;
    archery: {
      gasFlowToggle: string;
      gasFlowToggleTitle: string;
      liveGasCta: string;
    };
  };
  fieldStrip: {
    badge: string;
    phaseStrip: string;
    phaseReassemble: string;
    progressLabel: (done: number, total: number) => string;
    hintBtn: string;
    hintTitle: string;
    autoStepBtn: string;
    autoStepTitle: string;
    resetBtn: string;
    resetTitle: string;
    exitBtn: string;
    exitTitle: string;
    nextActionPrefixStrip: string;
    nextActionPrefixReassemble: string;
    click3dHint: string;
    interferenceBadge: string;
    infoBadge: string;
    dismissAlert: string;
    completedTitle: string;
    completedDesc: string;
    shareCertPosterBtn: string;
    shareCertPosterTitle: string;
  };
  malfunction: {
    badge: string;
    progressLabel: (done: number, total: number) => string;
    nextStepBtn: string;
    nextStepTitle: string;
    resetDrillBtn: string;
    resetDrillTitle: string;
    exitBtn: string;
    exitTitle: string;
    rootCauseLabel: string;
    safetyNoteLabel: string;
    drillStepsAria: string;
    click3dHint: string;
    clearedTitle: string;
    clearedDesc: string;
    shareCertPosterBtn: string;
    shareCertPosterTitle: string;
    archeryBadge: string;
    archeryRootCauseLabel: string;
    archerySafetyNoteLabel: string;
    archeryClick3dHint: string;
    archeryClearedTitle: string;
    archeryClearedDesc: string;
  };
  caliper: {
    badge: string;
    closeTitle: string;
    unitNote: string;
    promptPointA: string;
    promptPointB: string;
    lockedLabel: string;
    pointALabel: string;
    pointBLabel: string;
    deltaX: string;
    deltaY: string;
    deltaZ: string;
    benchmarksLabel: string;
    benchmarks: Record<
      'overall_envelope' | 'barrel_length' | 'bolt_lug_span',
      string
    >;
    envelopeRulerBtn: string;
    envelopeRulerTitle: string;
    clearBtn: string;
    clearTitle: string;
    envelopeSummary: (
      lenMm: string,
      heightMm: string,
      widthMm: string
    ) => string;
    archery: {
      unitNote: string;
      promptPointA: string;
      deltaX: string;
      benchmarks: Record<
        'overall_envelope' | 'barrel_length' | 'bolt_lug_span',
        string
      >;
      envelopeRulerBtn: string;
      envelopeRulerTitle: string;
    };
  };
  cartridgeLab: {
    badge: string;
    title: string;
    subtitle: string;
    gallerySwitchAria: string;
    gallerySmallArmsBtn: string;
    gallerySmallArmsTitle: string;
    galleryTankOrdnanceBtn: string;
    galleryTankOrdnanceTitle: string;
    tankOrdnanceBadge: string;
    tankOrdnanceTitle: string;
    tankOrdnanceSubtitle: string;
    backVaultBtn: string;
    backVaultTitle: string;
    lineupBtn: string;
    lineupTitle: string;
    tankLineupBtn: string;
    tankLineupTitle: string;
    focusSpecimenBtn: string;
    focusSpecimenTitle: string;
    cutawayOn: string;
    cutawayOff: string;
    cutawayTitle: string;
    edgesBtn: string;
    edgesTitle: string;
    matrixToggleOpen: string;
    matrixToggleClose: string;
    matrixToggleTitle: string;
    tankMatrixToggleTitle: string;
    explodeLabel: string;
    explodeReset: string;
    caliberSelectorAria: string;
    anatomyCardBadge: string;
    dimOalCase: string;
    dimRimBullet: string;
    chargeVolumeMass: string;
    projectileSpec: string;
    pressureVelocity: string;
    muzzleEnergy: string;
    propellantLabel: string;
    primerLabel: string;
    coreAnatomyLabel: string;
    chamberInWeaponBtn: (weaponLabel: string) => string;
    ballisticsRangeBtn: string;
    ballisticsRangeTitle: string;
    tableCaption: string;
    tankTableCaption: string;
    colCaliber: string;
    colStandard: string;
    colCaseOal: string;
    colCharge: string;
    colProjectile: string;
    colPressure: string;
    colVelocity: string;
    colEnergy: string;
    colWeapons: string;
  };
  monograph: {
    entryChip: string;
    entryChipTitle: string;
    plaqueCtaMain: string;
    plaqueCtaSub: string;
    studioBadge: string;
    studioTitle: string;
    studioSub: string;
    weaponSelectAria: string;
    styleDk: string;
    styleDkTip: string;
    styleKids: string;
    styleKidsTip: string;
    stylePro: string;
    styleProTip: string;
    editionDk: string;
    editionDkTip: string;
    editionObsidian: string;
    editionObsidianTip: string;
    editionBlueprint: string;
    editionBlueprintTip: string;
    layoutSpreadA3: string;
    layoutSpreadA3Tip: string;
    layoutPortraitA4: string;
    layoutPortraitA4Tip: string;
    mode8p: string;
    mode4p: string;
    mode4Spreads: string;
    mode2Spreads: string;
    qualityStandard: string;
    qualityStandardTip: string;
    qualityPrint: string;
    qualityPrintTip: string;
    prepressToggle: string;
    prepressToggleTip: string;
    cyclesBadge: (cyclesCount: number, total: number) => string;
    callsignLabel: string;
    callsignPlaceholder: string;
    reshootBtn: string;
    reshootTitle: string;
    printCta: string;
    printCapturingCta: (done: number, total: number) => string;
    printHint: string;
    printHintDkSpread: string;
    closeTitle: string;
    capturingTitle: (shortTag: string, done: number, total: number) => string;
    capturingSub: string;
    seriesHeader: string;
    editionStampDk: string;
    editionStampObsidian: string;
    editionStampBlueprint: string;
    coverMonographTag: string;
    coverScaleTag: string;
    coverCollectorLabel: string;
    coverDefaultCollector: string;
    coverHighlightsHeading: string;
    secChronicleI: string;
    secChronicleISub: string;
    secMilestonesHeading: string;
    secChronicleII: string;
    secChronicleIISub: string;
    secBreakthroughsHeading: string;
    plateBreechCaption: string;
    secCutawayRoles: string;
    secCutawayRolesSub: string;
    plateStencilCaption: string;
    plateRolesCaption: string;
    secCycle7Heading: string;
    secExplodedPlate: string;
    secExplodedPlateSub: string;
    explodedLegendNote: string;
    secBomLedger: string;
    secBomLedgerSub: (partsCount: number, trisFormatted: string) => string;
    bomColCode: string;
    bomColComponent: string;
    bomColMaterial: string;
    bomColEnvelope: string;
    bomColPrinciple: string;
    secBallistics: string;
    secBallisticsSub: string;
    chartPressureTitle: string;
    chartCartridgeTitle: string;
    energyLadderTitle: string;
    secArmorerManual: string;
    secArmorerManualSub: string;
    fieldStripHeading: string;
    interferencePrefix: string;
    malfunctionsHeading: string;
    backSealBadge: string;
    backSealTitle: string;
    backQrTitle: string;
    backQrSub: string;
    backColophon: string;
    footerPage: (idx: number, total: number) => string;
    kids: {
      seriesHeader: string;
      editionBright: string;
      editionDark: string;
      explorerLabel: string;
      defaultExplorer: string;
      coverBadge: string;
      heroSticker: (partsCount: number) => string;
      funFeaturesLabel: string;
      p2Kicker: string;
      p2Title: string;
      p2Sub: string;
      viewRightTag: string;
      viewLeftTag: string;
      viewTopTag: string;
      p3Kicker: string;
      p3Title: string;
      p3Sub: string;
      xrayBadge: string;
      xrayTip: string;
      cutawayBadge: string;
      cutawayTip: string;
      p4Kicker: string;
      p4Title: string;
      p4Sub: string;
      teamPartsUnit: (n: number) => string;
      p5Kicker: string;
      p5Title: string;
      p5Sub: string;
      treasureHuntLabel: (n: number) => string;
      p6Kicker: string;
      p6Title: string;
      p6Sub: string;
      bagLabel: (num: string) => string;
      p7Kicker: string;
      p7Title: string;
      p7Sub: string;
      ammoStripBadge: (isArchery: boolean) => string;
      statSpeed: string;
      statEnergy: string;
      p8Kicker: string;
      p8Title: string;
      p8Sub: string;
      macroZoomBadge: string;
      stepsTitle: (n: number) => string;
      qrTitle: string;
      qrSub: string;
      qrCertBadge: string;
      pageFooter: (idx: number, total: number) => string;
    };
  };
  mechanismShowdown: {
    entryBtn: string;
    entryBtnTitle: string;
    plaqueCompareBtn: (rivalShort: string) => string;
    plaqueCompareTitle: (selfShort: string, rivalShort: string) => string;
    dialogAria: string;
    badge: string;
    exhibitCountPill: (exhibits: number, axes: number) => string;
    title: string;
    subtitle: string;
    modeMatrix: string;
    modeShowdown: string;
    closeTitle: string;
    stagingLabel: string;
    stagingHint: string;
    slotALabel: string;
    slotBLabel: string;
    swapPairTitle: string;
    openShowdownCta: string;
    allAxesTab: string;
    familyCountBadge: (count: number) => string;
    prosLabel: string;
    consLabel: string;
    compareWithSlotBtn: string;
    compareWithRivalBtn: string;
    presetsLabel: string;
    selectWeaponAAria: string;
    selectWeaponBAria: string;
    sharedTraitBadge: string;
    diffTraitBadge: string;
    axisShortDrive: string;
    axisShortLocking: string;
    axisShortFeed: string;
    cutawayBenchBtn: (shortLabel: string) => string;
    cutawayBenchTitle: string;
    liveCycleBenchBtn: string;
    liveCycleBenchTitle: string;
    chartTitle: string;
    chartSub: string;
    scaleNormalized: string;
    scaleRelative: string;
    crossDomainNote: string;
    legendPressure: (shortLabel: string) => string;
    legendVelocity: (shortLabel: string) => string;
    scrubReadoutLabel: (pct: number) => string;
    scrubHoverHint: string;
    axisProgressLabel: string;
    metricsTitle: string;
    metricsSub: string;
    metricVelocity: string;
    metricEnergy: string;
    metricPeakLoad: string;
    metricCyclic: string;
    metricOalBarrel: string;
    metricMassParts: string;
    archBreakdownTitle: string;
    rowDrive: string;
    rowLocking: string;
    rowFeed: string;
    rowFireControl: string;
    rowVerdict: string;
    strengthTag: string;
    tradeoffTag: string;
  };
}

export const UI_STRINGS: Record<LanguageCode, UiDictionary> = {
  zh: {
    watermark:
      '1:1 精密机械结构与 5 通道 ORM 物理材质还原 · Google Gemini 中英双语研发故事与零件语音导览',
    langToggleTitle: '一键切换全站中英文讲解与语音导览 (中文 / English)',
    geoBuildBanner: (shortLabel, ready, total) =>
      `正在异步构建 ${shortLabel} CSG 机械内构 · ${ready} / ${total}`,
    studio: {
      envGroupAria: '军械展厅光影环境预设',
      presets: {
        tactical_vault: {
          label: '军械暗室',
          title:
            '战术暗室金库 (Tactical Vault)：冷蓝钨丝背光 + 深黑阳极氧化金属反射穹顶 + 靶场混响声场',
        },
        gunsmith_bench: {
          label: '匠人台',
          title:
            '军械师工作台 (Gunsmith Bench)：暖钨顶灯 + 1:1 氯丁橡胶拆解垫 + 近场工作台声学 IR',
        },
        blueprint_daylight: {
          label: '工程白昼',
          title:
            '工程蓝图白昼 (Blueprint Daylight)：高对比度测绘白昼漫反射棚 + 浅色工程图纸界面',
        },
      },
      postFxChip: 'GTAO',
      postFxTitle: (enabled) =>
        enabled
          ? '已启用 GTAO 毫米级接触环境光遮蔽 + HDR 选择性辉光 + 近景微距景深 + AgX 电影级色调映射 + SMAA 抗锯齿'
          : '点击开启 GTAO 环境光遮蔽 + 电影镜头光学后处理管线',
      wearGroupAria: '枪械服役磨损与枪油包浆状态',
      wearPresets: {
        factory_new: {
          label: '出厂',
          title: '全新典藏状态 (0% 磨损)：出厂完好磷化/烤蓝与洁净枪油光泽',
        },
        field_oiled: {
          label: '微油',
          title: '轻度实操微油 (35% 磨损·默认)：自然棱边轻磨亮、CLP 枪油微反光与接缝暗角',
        },
        battle_worn: {
          label: '沧桑',
          title: '实战沧桑状态 (95% 磨损)：明显导轨与棱边露白、擦痕与火药积碳包浆',
        },
      },
      qualityTitle: (tier) =>
        tier === 'ultra'
          ? '当前画质：极致 (Ultra · 2K/4K 阴影 + GTAO + 微距景深 + SMAA)，点击切换画质档位'
          : tier === 'balanced'
            ? '当前画质：均衡 (Balanced · 半分辨率 GTAO + 1.5x DPR)，点击切换画质档位'
            : '当前画质：流畅省电 (Eco · 关闭后处理，适配核显与移动设备)，点击切换画质档位',
      qualityLabels: {
        ultra: '极致',
        balanced: '均衡',
        eco: '流畅',
      },
      hideUiChip: '隐藏按钮',
      hideUiTitle:
        '隐藏全部界面按钮与控制面板，进入 100% 纯净全屏 3D 展示视图 (快捷键: H，按 H 或 Esc 恢复)',
      showUiChip: '显示按钮',
      showUiTitle: '恢复显示全部界面按钮与控制面板 (快捷键: H / Esc)',
      fullscreenEnterChip: '全屏展示',
      fullscreenExitChip: '退出全屏',
      fullscreenTitle: (active) =>
        active
          ? '退出浏览器全屏展示模式 (Esc)'
          : '切换浏览器 100% 原生全屏展示模式；搭配「隐藏按钮 (H)」可获得无遮挡纯净 3D 检视与录屏体验',
      immersiveBarAria: '纯净展示浮动控制栏',
    },
    armory: {
      title: '枪械、弓弩与主战坦克 1:1 3D 数字兵器库',
      subtitle: `${VAULT_EXHIBIT_ZH}款传奇名枪、特种复合弓弩与 1:1 主战坦克交互式陈列馆 · Google Gemini 中英研发史纪录片与全零件语音拆解导览`,
      filterAria: '装备类别筛选',
      categories: {
        all: '全部馆藏',
        assault: '突击/步枪/无托',
        lmg: '机枪/转管',
        smg: '冲锋枪 / PDW',
        sniper: '狙击/反器材',
        shotgun: '战术霰弹',
        pistol: '手枪 / 转轮',
        archery: '复合弓 / 弩',
        armor: '重装甲大厅',
      },
      showcaseBtn: '产品宣传页',
      showcaseTitle: '打开项目官方宣传与架构展示主页',
      cartridgeLabBtn: '1:1 实弹剖视馆',
      cartridgeLabTitle: `打开 ${ORDNANCE_TOTAL} 口径（${LAB_CALIBER_TOTAL} 轻武器实弹 + ${TANK_ORDNANCE_TOTAL} 坦克主炮弹）1:1 纵剖对比实验室：并排纵剖陈列 4.73mm 无壳弹、9×19mm 至 .50 BMG 与 88/120/125mm 穿甲弹定量对比矩阵 (B)`,
      ballisticsLabBtn: '1000m 外弹道 [R]',
      ballisticsLabTitle: `打开 1,000m RK4 外弹道（${BALLISTICS_PROFILES_TOTAL} 套弹道档案）、横风偏流、第一像面圣诞树分划板与狙击 DOPE 射表实验室 (快捷键: R)`,
      posterBtn: '剖视海报 [U]',
      posterTitle:
        '打开即时高清 3D 剖视社交分享海报工坊：合成 16:9 / 4:5 图鉴卡与军械师认证章 (快捷键: U)',
      certRackTitle: (rank) => `军械师考核认证：${rank} 级资质徽章`,
      certPlaqueLabel: '军械师考核认证',
      certPlaqueSub: (s, t) => `快拆 ${s ?? '—'} · 排障 ${t ?? '—'}`,
      storyBtn: '枪械研发故事',
      storyBtnTitle: '打开当前枪械完整四幕研发历史故事与双语语音纪录片',
      enterBenchBtn: (tag) => `进入 ${tag} 拆解台`,
      caliberLabel: '口径规格',
      precisionLabel: '建模精度',
      precisionValue: (a, p) => `${a} 总成 / ${p} 零件`,
      mechanismLabel: '核心自动与闭锁原理',
      metrologyTitle: '1:1 原厂测绘与内弹道参数',
      oalLabel: '全枪长 (OAL)',
      barrelLabel: '枪管与膛线',
      weightLabel: '空枪质量',
      muzzleVelLabel: '枪口初速',
      rangeLabel: '有效射程',
      rofLabel: '理论射速',
      plaqueStoryCta: '聆听完整研发故事 (中/EN 语音)',
      plaqueStorySub: '四幕研发历程 · 核心工程突破 · 零件联动透视',
      plaquePrimaryCta: (tag) => `进入 ${tag} 分解与发射演示`,
      pbrOn: '真实 PBR 贴图已启用',
      pbrOff: 'PBR 贴图已关闭',
      pbrTitle:
        '开启或关闭真实 2K/4K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)',
      atlasBtn: '查看 PBR 贴图图集',
      atlasTitle: '检视并下载全部定制 2K/4K WebP 材质贴图原图',
      rotateOn: '展台旋转中',
      rotateOff: '自动旋转已停',
      rotateTitle: '开启或暂停 3D 展台自动环绕旋转',
      xrayBtn: 'X-Ray 透视预览',
      xrayTitle: '在枪库展台内直接预览内部枪机与火控透视结构 (X)',
      sectionOn: '军械剖视已启用',
      sectionOff: '军械剖视预览',
      sectionTitle:
        '双通道 Stencil 实心金属阴影线纵剖切面：切开右侧机匣/套筒/弹匣壳体，直视内部膛线、闭锁突笋与实弹供弹机构 (C)',
      tintBtn: '原理分色 [T]',
      tintTitle:
        '按闭锁承压、导气驱动、自动机框、火控击发、储能弹簧与机匣供弹 6 大机械职能实时分色渲染 (T)',
      stageHint: '拖拽检视 · 单击枪体直达分解',
      rackAria: `兵器库${VAULT_EXHIBIT_ZH}槽展架`,
      rackTitle: `兵器库陈列展架 · ${VAULT_EXHIBIT_COUNT}-BAY WEAPON VAULT RACK`,
      rackTip: '单击卡片切换展台预览 · 再次点击或点蓝字进入 3D 拆解台',
      scrollLeft: '向左滚动查看槽位',
      scrollRight: '向右滚动查看槽位',
      previewingBadge: '预览中',
      plannedBadge: '待接入',
      partsNodeSuffix: (n) => `${n} 零件节点`,
      cardEnterCta: '进入 3D 内部拆解与发射演示',
      plannedToast: (name) =>
        `「${name}」模块正在接入中，当前可预览并拆解已入库枪械`,
      archeryPlaque: {
        caliberLabel: '箭矢与磅数',
        mechanismLabel: '核心凸轮与储能原理',
        metrologyTitle: '1:1 原厂测绘与弓弩动力学参数',
        oalLabel: '轮轴距 / 全长',
        barrelLabel: '做功行程 / 弓档',
        weightLabel: '裸弓 / 裸弩质量',
        muzzleVelLabel: '离弦箭速',
        rangeLabel: '有效射程',
        rofLabel: '峰值拉力 / 省力',
        plaquePrimaryCta: (tag) => `进入 ${tag} 分解与发射演示`,
        stageHint: '拖拽检视 · 单击弓弩直达分解',
      },
    },
    atlasModal: {
      dialogAria: 'PBR 真实贴图图集检视器',
      kicker: `${VAULT_EXHIBIT_COUNT}-EXHIBIT 2K/4K PBR ATLAS`,
      weaponSwitcherAria: `${VAULT_EXHIBIT_ZH}款馆藏兵器 PBR 贴图库切换`,
      subtitle: `全馆${VAULT_EXHIBIT_ZH}款名枪、复合弓弩与主战坦克共 ${VAULT_TEXTURES_TOTAL} 张定制 2K/4K WebP 物理材质贴图（${VAULT_SUITES_TOTAL} 套图集 · public/textures/*.webp）· 已按三角面 UV 实时绑定至全部 ${VAULT_PARTS_TOTAL} 个精密零件`,
      liveOn: '3D 实时贴图：已开启',
      liveOff: '3D 实时贴图：已关闭',
      closeAria: '关闭贴图检视窗口',
      ormBadge: 'ORM · R/G/B',
      ormChannelTitle: '复合通道 (R:AO · G:粗糙 · B:金属)',
      downloadTitle: (fileName) => `下载 ${fileName}`,
      loadingFallback: (shortLabel) =>
        `正在按需加载 ${shortLabel} 材质图集元数据...`,
    },
    workbench: {
      backBtn: '枪库',
      backTitle: '返回 3D 数字枪库选择其他枪型 (Esc)',
      viewAngles: {
        iso: '等轴测',
        right: '右侧',
        left: '左侧',
        top: '俯视',
      },
      storyChip: '研发故事',
      storyChipTitle: '打开当前枪械完整研发历史纪录片与中英语音导览',
      firingChip: '发射演示',
      firingChipTitle: '切换子弹动态发射与抛壳复进流程演示',
      pbrChip: 'PBR 贴图',
      pbrChipTitle:
        '开启/关闭真实 2K/4K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)',
      atlasChip: '图集',
      atlasChipTitle: '打开真实 PBR 材质贴图图集检视器',
      xrayChip: 'X-Ray 透视',
      xrayChipTitle: '将外层机匣/套筒、护木与弹匣壳体切换为半透明透视材质 (X)',
      sectionChip: '军械剖视',
      sectionChipTitle:
        '双通道 Stencil 实心金属剖面线纵剖切面：切开右侧机匣/套筒/弹匣壳体，直视内部膛线、闭锁突笋与实弹供弹机构 (C)',
      tintChip: '原理分色',
      tintChipTitle:
        '开启/关闭 6 大机械职能语义分色与剖切面同步着色，支持按类聚光检视 (T)',
      fieldStripChip: '亲手快拆',
      fieldStripChipTitle:
        '开启军械师引导式野战勤务拆装实操模式：在 3D 视口直接点击零件按教范逐步拆解与逆序复装 (G)',
      malfunctionChip: '故障排障',
      malfunctionChipTitle:
        '开启经典枪械故障剖视排障室：烟囱卡壳、双进弹、底火轻敲拒发与未闭锁击发阻断一键剖视排障 (J)',
      caliperChip: '游标卡尺',
      caliperChipTitle:
        '开启 1:1 3D 军械游标卡尺与空间包络标尺：在 3D 表面点选任意两点测量毫米级间距与轴向分量 (K)',
      cartridgeChip: '实弹馆',
      cartridgeChipTitle: `打开 ${ORDNANCE_TOTAL} 口径（${LAB_CALIBER_TOTAL} 轻武器实弹 + ${TANK_ORDNANCE_TOTAL} 坦克主炮弹）1:1 纵剖对比实验室 (B)`,
      ballisticsChip: '外弹道',
      ballisticsChipTitle: `打开当前口径 1,000m RK4 外弹道（${BALLISTICS_PROFILES_TOTAL} 套弹道档案）、横风偏流与光学分划板实验室 (R)`,
      posterChip: '分享海报',
      posterChipTitle:
        '截取当前 3D 剖视视口生成高清 16:9 / 4:5 社交分享海报与二维码 (U)',
      edgesChip: 'CAD 描边',
      edgesChipTitle: '开启/关闭工业 CAD 硬边轮廓线 (E)',
      labelsChip: '零件标签',
      labelsChipTitle: (n) => `显示全部 ${n} 个零件的 3D 空间编号引出签 (L)`,
      sfxChip: '机械声效',
      sfxChipTitle: (muted) =>
        muted
          ? '军械机械咬合与实弹声场已静音，点击开启 (M)'
          : `开启/静音 Web Audio 军械机械咬合声与 ${ORDNANCE_TOTAL} 口径实弹/主炮声场 (M)`,
      resetChip: '复位',
      resetChipTitle: '重置回默认合拢态与标准视角 (Shift+R)',
    },
    bom: {
      collapsedBtn: (n) => `零件目录 (${n})`,
      collapsedTitle: '展开 BOM 零件目录',
      headerTitle: 'BOM 零件结构树',
      collapseAction: '收起',
      collapseTitle: '收起侧栏',
      showGroup: '显示该总成',
      hideGroup: '隐藏该总成',
    },
    inspector: {
      firingBadge: (step) => `发射循环实时解析 · ${step} / 07`,
      closeTitle: '关闭详情并停止零件语音 (Esc)',
      minimizeBtn: '最小化',
      minimizeTitle: '收起详情卡片，不中断语音继续自由观察 3D 枪械 (Esc)',
      expandBtn: '展开详情',
      expandTitle: '展开完整零件工程拆解卡片',
      roleLabel: '机械定位',
      materialLabel: '典型材质',
      envelopeLabel: 'CAD 包络尺寸',
      envelopeTitle:
        '局部 CAD 轴向包络尺寸：轴长 X × 高度 Y × 宽度 Z (1 场景单位 = 10 mm)',
      envelopeBuilding: '实时 CSG 测绘中...',
      meshLabel: 'CSG 网格拓扑',
      meshTitle: '实时布尔 CSG / 参数化流形三角网格面数',
      meshBuilding: '构建中...',
      meshTriangles: (f) => `${f} Δ 三角面`,
      materials: {
        nitride_steel: '碳氮共渗/磷化烤漆合金钢',
        barrel_steel: '冷锻精密枪管钢 (镀硬铬/氮化)',
        stainless: '精密冲压/锻造不锈钢与镀铬活塞钢',
        polymer_frame: '高强度玻纤增强尼龙/聚酰胺聚合物',
        spring_steel: '高疲劳强度多股琴钢丝弹簧',
        follower_orange: '高辨识度防卡滞工程聚合物',
        copper_accent: '黄铜合金示意表面',
      },
      voiceGuideBtnPlay: '语音讲解该零件',
      voiceGuideBtnPause: '暂停语音讲解',
      voiceGuideLoading: '加载音频...',
      autoVoiceLabel: '点选自动播报',
      autoVoiceTitle:
        '开启后，点击任意 3D 零件或 BOM 节点将自动播放对应语音讲解',
      secOverview: '结构与功能定位',
      secCraft: '材质工艺与几何特征',
      secKinematics: '击发运动与拆解时序',
      secDesign: '研发演进与工程巧思',
      openStoryLink: '查看全枪完整研发故事',
      isolateEnter: '单独隔离查看该零件',
      isolateExit: '退出单独隔离',
      prevPart: '上一个零件',
      nextPart: '下一个零件',
      archery: {
        firingBadge: (step) => `做功发射实时解析 · ${step} / 07`,
        minimizeTitle: '收起详情卡片，不中断语音继续自由观察 3D 弓弩 (Esc)',
        materialLabel: '复合材质 / 合金',
        materials: {
          nitride_steel: 'CNC 硬质阳极氧化 7075-T6 铝合金',
          barrel_steel: '精密冷锻高强合金钢',
          stainless: '17-4PH 精密不锈钢与 Ti-6Al-4V 钛合金',
          polymer_frame: '3K 碳纤维增强复合材质与玻纤聚合物',
          spring_steel: 'BCY-X 高模量编织弦索与琴钢丝弹簧',
          follower_orange: '高弹吸振弹性体与高可视工程聚合物',
          copper_accent: '古铜金硬质阳极铝与防空放青铜合金',
        },
        secKinematics: '拉放做功运动与拆解时序',
        openStoryLink: '查看弓弩完整研发故事',
      },
    },
    timeline: {
      modeExplode: '结构爆炸拆解模式',
      modeFieldStrip: '军械师亲手快拆 [G]',
      modeFiring: '子弹动态发射流程演示',
      modeMalfunction: '故障剖视排障 [J]',
      speeds: {
        '0.25': '0.25x 超慢',
        '0.5': '0.5x 慢放',
        '1': '1.0x 标准',
      },
      loopOn: '连续循环',
      loopOff: '单发停止',
      loopTitle: '切换连续循环击发或单发停止',
      hudPill: 'HUD 示波',
      hudTitle: (open) =>
        open
          ? '显示/隐藏实时 SAAMI/CIP 膛压 P(t) 与初速 V(t) 内弹道遥测示波器'
          : '点击展开实时 SAAMI/CIP 内弹道膛压与初速遥测示波器',
      gasFlowPill: '燃气导流',
      gasFlowTitle:
        '显示/隐藏 60fps 高压火药燃气膛内膨胀、导气孔分流与活塞/气匙冲击流线',
      sfxPill: '实弹声场',
      sfxTitle: `开启/静音立体声卷积混响与 ${ORDNANCE_TOTAL} 口径实弹/主炮合成声效 (M)`,
      selectorGroupAria: '快慢机火控档位切换 (V)',
      selectorShort: {
        safe: '保险 SAFE',
        semi: '半自动 SEMI',
        auto: '全自动 AUTO',
      },
      selectorBlockedHint: '保险锁死 · 禁止击发',
      pressCheckBtn: '半拉验膛 [P]',
      pressCheckActiveBtn: '松手复进 [P]',
      pressCheckTitle:
        '半拉套筒/拉机柄 28% 执行军械验膛 (Press-Check)，检视弹膛内黄铜实弹状态 (快捷键 P，也可直接在 3D 中拖拽套筒/枪机)',
      holdTriggerBtn: '按住扣扳机 [F]',
      holdTriggerSafeBtn: '保险锁死 [F]',
      holdTriggerResetBtn: '松开复位 [F]',
      holdTriggerTitle:
        '按住模拟两道火扳机行程与阻铁释放 (快捷键 F)：SAFE 机械阻断，SEMI 单发阻铁截获需松手复位，AUTO 闭锁连发',
      pause: '暂停',
      autoExplode: '自动拆解',
      playExplodeTitle: (playing) =>
        playing ? '暂停自动拆解 (Space)' : '自动播放分阶段拆解动画 (Space)',
      ticksExplode: ['0% 合拢', '30% 一级快拆', '65% 二级分解', '100% 全爆炸'],
      singleShot: '扣扳机单发',
      singleShotTitle: '从 0% 重新扣动扳机完整演示一次单发射击循环',
      resumeFiring: '继续演示',
      firingPlayTitle: '播放或暂停发射循环演示 (Space)',
      ticksFiring: {
        cocked: '待击',
        ignition: '底火击发',
        unlockFallback: '出膛/开锁',
        eject: '后坐抛壳',
        feedLock: '推弹闭锁',
        reset: '复位',
      },
      archery: {
        modeFiring: '弓弩拉弦储能与发射演示',
        hudTitle: (open) =>
          open
            ? '显示/隐藏实时 ATA/IBO 拉力曲线 F(x) 与矢箭速度 V(t) 遥测示波器'
            : '点击展开实时 ATA/IBO 拉力曲线与矢箭速度遥测示波器',
        gasFlowPill: '弹性势能流',
        gasFlowTitle: '显示/隐藏 60fps 碳纤弓片弹性储能弯曲与凸轮做功轨迹流线',
        sfxTitle: '开启/静音立体声卷积混响与复合弓弩弦轮声效 (M)',
        selectorGroupAria: '撒放安全保险档位切换 (V)',
        selectorShort: {
          safe: '保险 SAFE',
          semi: '实射 LIVE',
          auto: '连发 AUTO',
        },
        pressCheckBtn: '拉距检查 [P]',
        pressCheckActiveBtn: '松弦回位 [P]',
        pressCheckTitle:
          '轻拉弓弦 28% 检查凸轮同步与箭尾扣合状态 (快捷键 P，也可直接在 3D 中拖拽弓弦/滑架)',
        holdTriggerBtn: '按住撒放 [F]',
        holdTriggerSafeBtn: '保险锁死 [F]',
        holdTriggerResetBtn: '松手复位 [F]',
        holdTriggerTitle:
          '按住模拟拉弦蓄能与扳机脱扣撒放 (快捷键 F)：SAFE 锁死防空放，实射档需松手复位',
        singleShot: '放箭',
        singleShotTitle: '从 0% 完整演示一次拉弓储能、撒放与箭矢推射循环',
        ticksFiring: {
          cocked: '搭箭待发',
          ignition: '凸轮拉弓',
          unlockFallback: '撒放做功',
          eject: '离弦飞出',
          feedLock: '回弦补箭',
          reset: '复位',
        },
      },
    },
    story: {
      badge: 'GEMINI R&D DOCUMENTARY',
      drawerSubtitle: '枪械研发历史全景纪录 · 机械突破与 3D 零件联动导览',
      closeTitle: '关闭研发故事并停止旁白',
      minimizeBtn: '最小化',
      minimizeTitle: '最小化为顶部迷你播放条，边看 3D 枪械边听讲解 (Esc)',
      expandBtn: '展开全文',
      expandTitle: '展开完整四幕研发历史讲解抽屉',
      miniIdleSubtitle: '四幕研发历史语音导览 · 可边看枪械边听讲',
      playFullStory: '连播四幕研发纪录片',
      pauseStory: '暂停纪录片旁白',
      directorBtn: '3D 导演运镜',
      directorBtnTitle:
        '随旁白自动切入拆解台、飞跃核心零件、联动纵向剖视 C / X-Ray 与 0.25x 慢放击发',
      cinemaModeBtn: '悬浮字幕观影',
      cinemaModeTitle: '最小化为顶部同步字幕条，全屏无遮挡观看 3D 导演自动运镜',
      liveSubtitlesLabel: '旁白同步字幕 · 点击任意句跳转进度',
      playingActPrefix: '正在播报',
      actVoicePlay: '本幕配音',
      actVoicePlaying: '播报中',
      inspectPartBtn: (label) => `在 3D 中聚焦「${label}」`,
      breakthroughsTitle: '三大核心工程突破 (点击联动 3D 零件)',
      breakthroughsSub: '将实战痛点转化为机械可靠性的关键结构演进',
      milestonesTitle: '研发定型历史时间轴',
      milestonesSub: '从立项试制、靶场迭代到列装定型的关键节点',
      loadingTitle: '正在加载研发历史与双语讲解资源...',
      loadingDesc: '正在读取 Google Gemini 生成的双语工程档案。',
      pendingTitle: '双语研发档案未能加载',
      pendingDesc: `请检查本地静态资源服务是否正常运行（全部 ${VAULT_EXHIBIT_COUNT} 款馆藏名枪、弓弩与主战坦克的四幕研发故事、${VAULT_PARTS_TOTAL} 枚零件双语讲解与 ${VAULT_AUDIO_TOTAL} 段 Google Gemini TTS 语音均已内置于 public/ 目录）。`,
      switchToAk15Btn: '切换至 AK-15M1 研发故事档案',
      aiAttribution:
        '文本与语音由 Google Gemini 3.8 Flash & Gemini TTS 基于 1:1 军械测绘参数生成',
      playbackRateTitle: '播放倍速：1.0x / 1.25x / 1.5x',
      archeryDrawerSubtitle:
        '复合弓弩研发历史全景纪录 · 机械突破与 3D 零件联动导览',
      archeryMinimizeTitle:
        '最小化为顶部迷你播放条，边看 3D 弓弩边听讲解 (Esc)',
    },
    engineeringTint: {
      badge: 'WP-05 · 机械职能语义分色',
      closeTitle: '关闭机械原理分色视图 (T)',
      filterHint: '点击图例单独聚光该类机构 · 再次点击恢复全彩',
      showAllBtn: '全显',
      gasFlowToggle: '高压燃气流线',
      gasFlowToggleTitle: '在发射演示模式下动态显示膛内燃气膨胀与导气分流轨迹',
      liveGasCta: '切至发射看导气',
      archery: {
        gasFlowToggle: '弹性储能流线',
        gasFlowToggleTitle:
          '在发射演示模式下动态显示碳纤弓片蓄能弯曲与凸轮做功轨迹',
        liveGasCta: '演示弹性储能流',
      },
    },
    fieldStrip: {
      badge: 'WP-07 · 军械教范引导拆装',
      phaseStrip: '拆解阶段',
      phaseReassemble: '逆序复装',
      progressLabel: (done, total) => `已拆 ${done} / ${total} 步`,
      hintBtn: '提示下一步',
      hintTitle: '在 3D 视口中以翠绿脉冲高亮当前符合军械教范的下一步待操作部件',
      autoStepBtn: '执行当前步',
      autoStepTitle: '按军械教范拓扑顺序自动执行当前推荐的拆解或复装步骤',
      resetBtn: '全部复原',
      resetTitle: '将全部拆解步骤清零复原至闭膛合拢状态',
      exitBtn: '退出实操',
      exitTitle: '退出亲手快拆实操模式并返回连续滑块爆炸模式 (G)',
      nextActionPrefixStrip: '下一步拆解：',
      nextActionPrefixReassemble: '下一步复装：',
      click3dHint:
        '直接在 3D 视口点击对应零件完成操作（按住 Shift 点击可打开零件详情卡）',
      interferenceBadge: '机械干涉阻断',
      infoBadge: '勤务拆装提示',
      dismissAlert: '知道了',
      completedTitle: '全套野战快拆与逆序复装考核圆满完成！',
      completedDesc:
        '全部运动总成已按真实军械教范无干涉归位闭锁，可再次点击零件复练或切换发射演示检验闭锁。',
      shareCertPosterBtn: '生成资格海报',
      shareCertPosterTitle:
        '生成带本枪军械师考核等级印章与扫码直达剖视台二维码的高清分享海报 (U)',
    },
    malfunction: {
      badge: 'WP-09 · 经典枪械故障剖视排障室',
      progressLabel: (done, total) => `排障进度 ${done} / ${total}`,
      nextStepBtn: '执行下一步排障',
      nextStepTitle:
        '按标准军械排障教范执行当前步骤并同步驱动 3D 枪机/弹匣动作',
      resetDrillBtn: '复现故障定格',
      resetDrillTitle: '重置回该故障初始卡阻定格帧以便重新观察或实操排障',
      exitBtn: '退出排障室',
      exitTitle: '退出故障剖视排障模式并返回正常发射演示 (J)',
      rootCauseLabel: '机械卡阻成因：',
      safetyNoteLabel: '军械安全规范：',
      drillStepsAria: '标准排障步骤序列',
      click3dHint:
        '可直接点击 3D 高亮运动件（套筒/拉机柄/弹匣）或下方按钮逐步排障',
      clearedTitle: '故障已彻底排除 · 新弹已推入膛内完全闭锁！',
      clearedDesc:
        '卡阻弹壳与供弹干涉已按标准军械教范清除，闭锁突笋恢复 100% 啮合，可切换其他故障继续演练。',
      shareCertPosterBtn: '生成资格海报',
      shareCertPosterTitle:
        '生成带本枪排障诊断考核等级印章与扫码直达剖视台二维码的高清分享海报 (U)',
      archeryBadge: 'WP-09 · 弓弩机械故障剖视排障室',
      archeryRootCauseLabel: '弓弩机械诱因：',
      archerySafetyNoteLabel: '防空放安全规范：',
      archeryClick3dHint:
        '可直接点击 3D 高亮机械件（弓弦 / D环 / 箭台 / 滑座 / 挂弦锁）或下方按钮逐步排障',
      archeryClearedTitle: '矢箭干涉已解除 · 弦轮同步与安全挂弦复原！',
      archeryClearedDesc:
        '羽片刮擦、夹箭与空放隐患已按弓弩技师教范排除，滑轮凸轮组与弓弦恢复标准支距啮合，可切换其他工况演练。',
    },
    caliper: {
      badge: 'WP-10 · 1:1 3D 军械游标卡尺',
      closeTitle: '关闭 3D 游标卡尺与全枪包络标尺 (K)',
      unitNote: '1 场景单位 = 10.0 mm · 支持穿透纵剖面点选内部闭锁与枪管表面',
      promptPointA: '第 1 步：在 3D 枪械表面单击拾取测量基准点 A',
      promptPointB: '第 2 步：移动光标实时预览跨度，单击锁定测量终点 B',
      lockedLabel: '两点空间直线跨度 (A → B)',
      pointALabel: '基准爪 A',
      pointBLabel: '游标爪 B',
      deltaX: '|ΔX| 轴长',
      deltaY: '|ΔY| 垂高',
      deltaZ: '|ΔZ| 横宽',
      benchmarksLabel: '一键原厂基准量测：',
      benchmarks: {
        overall_envelope: '全枪总包络长',
        barrel_length: '枪管实测全长',
        bolt_lug_span: '枪机/套筒行程体',
      },
      envelopeRulerBtn: '全枪包络标尺',
      envelopeRulerTitle: '开关 3D 全枪外包络长×高×宽毫米刻度标尺线框',
      clearBtn: '清零重测',
      clearTitle: '清除当前 A/B 测点重新拾取',
      envelopeSummary: (l, h, w) => `包络：长 ${l} × 高 ${h} × 宽 ${w} mm`,
      archery: {
        unitNote:
          '1 场景单位 = 10.0 mm · 支持穿透剖面精准测绘弓把、凸轮与箭矢跨度',
        promptPointA: '第 1 步：在 3D 弓弩表面单击拾取测量基准点 A',
        deltaX: '|ΔX| 轴跨',
        benchmarks: {
          overall_envelope: '整弓全幅包络',
          barrel_length: '箭矢 / 滑轨跨度',
          bolt_lug_span: '弓把 / 轮轴跨度',
        },
        envelopeRulerBtn: '整弓包络标尺',
        envelopeRulerTitle: '开关 3D 全幅外包络长×高×宽毫米刻度标尺线框',
      },
    },
    cartridgeLab: {
      badge: 'WP-06 · SAAMI / CIP 1:1 实弹纵剖馆',
      title: `${LAB_CALIBER_ZH}大口径实弹 1:1 纵剖对比实验室`,
      subtitle:
        '严格遵循 1 单位 = 10mm 绝对比例并排纵剖陈列 · 直视发射药柱、4.73 无壳药块、底火砧座、12号鹿弹碗塞与双芯穿甲锥结构',
      gallerySwitchAria: '弹药展馆尺度切换',
      gallerySmallArmsBtn: '轻武器实弹 (15)',
      gallerySmallArmsTitle:
        '切换至 15 大口径轻武器 1:1 实弹剖视陈列（29.69–138.43 mm）',
      galleryTankOrdnanceBtn: '坦克主炮弹 (3)',
      galleryTankOrdnanceTitle:
        '切换至 3 大口径主战坦克 1:1 主炮炮弹纵剖馆（88mm / 120mm / 125mm）',
      tankOrdnanceBadge: 'HEAVY ORDNANCE · 1:1 坦克炮弹剖视馆',
      tankOrdnanceTitle: '1:1 主战坦克炮弹纵剖对比实验室',
      tankOrdnanceSubtitle:
        '88×571mmR PzGr.39 · 120×570mm NATO APFSDS · 125mm DTC10-125 绝对物理比例纵剖',
      backVaultBtn: '返回数字枪库',
      backVaultTitle: '返回 3D 数字枪库武器展厅 (Esc / B)',
      lineupBtn: `1:1 ${LAB_CALIBER_ZH}弹同框全景`,
      lineupTitle: `拉远镜头以 1:1 绝对比例同屏并排对比全部 ${LAB_CALIBER_TOTAL} 款口径实弹`,
      tankLineupBtn: '1:1 三款炮弹同框全景',
      tankLineupTitle:
        '拉远镜头以 1:1 绝对比例同屏并排对比全部 3 款主战坦克主炮炮弹（88mm / 120mm / 125mm）',
      focusSpecimenBtn: '微距聚焦当前弹种',
      focusSpecimenTitle: '推近镜头微距检视当前选中实弹的底火砧座与弹芯纵剖面',
      cutawayOn: '180° 纵剖已开启 [C]',
      cutawayOff: '切换全壳外观 [C]',
      cutawayTitle: '切换 180° 轴向纵剖切面与完整弹壳外观 (C)',
      edgesBtn: 'CAD 轮廓线',
      edgesTitle: '开启或关闭实弹几何硬边 CAD 轮廓描边',
      matrixToggleOpen: '定量对比总表',
      matrixToggleClose: '收起对比总表',
      matrixToggleTitle: `展开或收起 ${LAB_CALIBER_TOTAL} 大口径装药量、膛压、初速与枪口动能定量对比矩阵表`,
      tankMatrixToggleTitle:
        '展开或收起 3 款主战坦克主炮炮弹装药量、膛压、初速与兆焦级枪口动能定量对比矩阵表',
      explodeLabel: '弹体结构轴向分解',
      explodeReset: '复位合拢',
      caliberSelectorAria: `馆藏${LAB_CALIBER_ZH}大口径实弹切换栏`,
      anatomyCardBadge: '1:1 弹药工程解剖档案',
      dimOalCase: '全弹长 / 壳长',
      dimRimBullet: '弹头径 / 底缘径',
      chargeVolumeMass: '药室容积 / 装药量',
      projectileSpec: '弹头质量',
      pressureVelocity: '峰值膛压 / 初速',
      muzzleEnergy: '枪口动能',
      propellantLabel: '发射药体系',
      primerLabel: '底火与传火孔',
      coreAnatomyLabel: '被甲与弹芯解剖',
      chamberInWeaponBtn: (w) => `装填入 ${w} 发射演示`,
      ballisticsRangeBtn: '1,000m 外弹道靶场 [R]',
      ballisticsRangeTitle:
        '在 1,000m RK4 外弹道实验室检视当前口径下坠、横风偏流、跨音速区与圣诞树分划板 (R)',
      tableCaption: `SAAMI / CIP / NATO ${LAB_CALIBER_ZH}大馆藏口径实弹 1:1 几何尺寸与内弹道定量对比矩阵`,
      tankTableCaption:
        'NATO STANAG / PLA GJB / WWII 三款主战坦克炮弹 1:1 几何尺寸与内弹道定量对比矩阵',
      colCaliber: '口径代号',
      colStandard: '标准规范',
      colCaseOal: '壳长 / 全长 (mm)',
      colCharge: '容积 / 装药',
      colProjectile: '弹重 (g / gr)',
      colPressure: '峰值膛压 (MPa)',
      colVelocity: '初速 (m/s)',
      colEnergy: '枪口动能 (J)',
      colWeapons: '配用馆藏武器',
    },
    monograph: {
      entryChip: '宣传图册',
      entryChipTitle:
        '打开 3D 机械绘本与军事宣传图册印前工坊：一键打印 17 幅高清 3D 大图少儿绘本或专业军工档案 (Ctrl/Cmd + P)',
      plaqueCtaMain: '打印 3D 机械图解绘本 / 典藏军事图册 (A4 / PDF)',
      plaqueCtaSub:
        '17 幅高清 3D 实景大图 · 少儿多图科普绘本 / 专业军工档案双模式切换',
      studioBadge: '3D ILLUSTRATED MONOGRAPH STUDIO',
      studioTitle: '3D 机械图解绘本 & 典藏宣传图册 · 印前工坊',
      studioSub:
        '实时离屏冲印 17 幅高清 3D 透视/分解/四格连环画大图 · 支持「少儿多图绘本」与「专业军工档案」一键切换',
      weaponSelectAria: '选择要印制图册的馆藏装备',
      styleDk: 'DK 图鉴典藏版',
      styleDkTip:
        '国际博物视觉百科出版标准：纯白铜版纸无边框透明抠图、0.35pt 精讲引导线、圆形光学放大镜特写、1:1 原大弹药纵剖与跨页对开版式',
      styleKids: '少儿多图绘本',
      styleKidsTip:
        '专为儿童与青少年设计：17 幅无裁切高清 3D 大图铺满全页，配大字短句贴纸、乐高分装包特写与四格慢动作连环画',
      stylePro: '专业军工档案',
      styleProTip:
        '硬核军迷收藏版：包含四幕研发史深度长文、全零件冶金包络总表、SAAMI 内弹道示波曲线与排障教范',
      editionDk: 'DK 纯白铜版纸',
      editionDkTip:
        '纯白铜版纸底配透明 Alpha 抠图与柔和台面投影，还原国际博物馆精装百科出版质感',
      editionObsidian: '炫酷暗黑画册版',
      editionObsidianTip:
        '深邃影棚暗调画册风格，最适合平板阅读、导出高清 PDF 收藏或铜版相纸满版彩印',
      editionBlueprint: '明亮绘本省墨版',
      editionBlueprintTip:
        '清爽白底彩色绘本与工程图风格，节省约 90% 黑色墨水，最适合家用彩色喷墨/激光打印机装订成册',
      layoutSpreadA3: 'A3 跨页对开',
      layoutSpreadA3Tip:
        'DK 经典双页跨幅画册排版（420×297mm 横向对开），枪械主体气势磅礴横跨中缝',
      layoutPortraitA4: 'A4 竖版单页',
      layoutPortraitA4Tip:
        '标准 A4 竖版单页排版（210×297mm），兼容家用打印机与桌面装订收藏',
      mode8p: '8 页全彩完整本',
      mode4p: '4 页精选速印版',
      mode4Spreads: '4 跨页 (8P 典藏)',
      mode2Spreads: '2 跨页 (4P 精选)',
      qualityStandard: '快速 1440px',
      qualityStandardTip:
        '1440×900 实时离屏渲染，秒级流畅预览全部图版与排版',
      qualityPrint: '300 DPI 超清',
      qualityPrintTip:
        '2880×1800 印刷级超清渲染（约 300 DPI），推荐在导出精装 PDF 或大幅面彩印前启用',
      prepressToggle: '3mm 出血+裁切线',
      prepressToggleTip:
        '开启 ISO 12647 印前 3mm 四边出血与四角裁切定位线（A3 扩展至 426×303mm / A4 扩展至 216×303mm）',
      cyclesBadge: (cyclesCount, total) =>
        `Cycles 4K 母版 (${cyclesCount}/${total})`,
      callsignLabel: '专属署名',
      callsignPlaceholder: '输入小朋友姓名或收藏呼号（印入封面证书）',
      reshootBtn: '重拍大图',
      reshootTitle: '重新执行全部 17 镜头 WebGL 离屏高清 3D 渲染采样',
      printCta: '立即打印画册 / 导出 PDF',
      printCapturingCta: (done, total) =>
        `正在拍摄 3D 大图 (${done}/${total})…`,
      printHint:
        '打印小贴士：在系统打印窗口选择「A4 纵向 · 边距：无」，并勾选「背景图形（Background graphics）」即可输出满版彩色绘本。',
      printHintDkSpread:
        'DK A3 跨页提示：打印窗口选择「A3 横向 (420×297mm) · 边距：无」并勾选「背景图形」，或使用 npm run monograph:pdf 一键直出 300 DPI 印前 PDF。',
      closeTitle: '关闭图册印前工坊 (Esc)',
      capturingTitle: (tag, done, total) =>
        `正在拍摄 ${tag} 高清 3D 绘本大图 (${done} / ${total})`,
      capturingSub:
        '正在渲染三视图、X 光透视、激光切半、彩虹分工、乐高分装包与四格慢动作连环画…',
      seriesHeader: 'DIGITAL ARMORY 3D · 典藏级轻武器防务技术专刊',
      editionStampDk: 'DK VISUAL ENCYCLOPEDIA · 博物典藏铜版纸',
      editionStampObsidian: 'COLLECTOR DARK FOLIO · 典藏黑金装帧',
      editionStampBlueprint: 'ISO 128 ORDNANCE MANUAL · 军工蓝图教范',
      coverMonographTag: '1:1 精密机械与内弹道工程档案',
      coverScaleTag: 'CAD 基准 1:1 · 单位 mm',
      coverCollectorLabel: '典藏持有人 / ARMORER',
      coverDefaultCollector: 'DIGITAL ARMORY ARCHIVE EDITION',
      coverHighlightsHeading: '核心防务技术特征',
      secChronicleI: 'CHAPTER 01 · 时代命题与研制破局纪实',
      secChronicleISub: '立项背景、战术指标博弈与材料工艺革新脉络',
      secMilestonesHeading: '研发与列装编年史坐标',
      secChronicleII: 'CHAPTER 02 · 结构定型与三大核心机械突破',
      secChronicleIISub: '自动机运动学精粹、闭锁安全裕度与实战演进',
      secBreakthroughsHeading: '三大决定性机械工程突破',
      plateBreechCaption:
        'FIG 2.1 · 核心机匣闭锁突笋、弹膛节套与火控待击机构 X-Ray 透视啮合微距图版',
      secCutawayRoles: 'CHAPTER 03 · 实心金属纵剖面与六色机械职能解构',
      secCutawayRolesSub:
        'ISO 128 45° 金属剖面线纵剖透视 · 六大工程子系统语义分色与七阶循环时序',
      plateStencilCaption:
        'FIG 3.1 · 双通道 WebGL Stencil 实心纵向剖视图（揭示枪管膛线、导气通道、闭锁面与供弹坡道壁厚）',
      plateRolesCaption:
        'FIG 3.2 · 34% 半分解态六大机械职能分色图版（闭锁承压 / 导气驱动 / 自动机框 / 火控击发 / 储能弹簧 / 机匣供弹）',
      secCycle7Heading: '七阶段自动循环运动学时序链',
      secExplodedPlate: 'CHAPTER 04 · 全枪 100% 阶梯爆炸分解工程总图',
      secExplodedPlateSub:
        '零穿模多级分解轨迹 · 顶/底双轨纯矢量防重叠 BOM 编号标引拉页（支持 1200 DPI 无损放大装裱）',
      explodedLegendNote:
        '标引色系说明：冷青 = 套筒/自动机总成 · 翠绿 = 枪管/机匣总成 · 绯红 = 火控击发总成 · 琥珀 = 弹匣供弹总成',
      secBomLedger: 'CHAPTER 05 · 全零件冶金材质与 1:1 三维几何包络总表',
      secBomLedgerSub: (partsCount, tris) =>
        `全枪共 ${partsCount} 个独立参数化 CSG 机械节点 · 累计流形网格 ${tris} 三角面 · 1:1 毫米级包络实测`,
      bomColCode: '编号',
      bomColComponent: '零件标准名称 (中 / EN)',
      bomColMaterial: '军工材料与表面处理',
      bomColEnvelope: '1:1 包络 (L×H×W)',
      bomColPrinciple: '机械职能与装配啮合关系',
      secBallistics: 'CHAPTER 06 · SAAMI/CIP 实弹纵剖解剖与内弹道定量示波',
      secBallisticsSub: `膛压 P(t) 与膛内初速 V(t) 双轴定量曲线 · 1:1 制式弹药半剖尺寸图与馆藏${LAB_CALIBER_ZH}口径动能天梯`,
      chartPressureTitle:
        'FIG 6.1 · 击发膛压 P(t) [MPa] 与弹头初速 V(t) [m/s] 耦合曲线',
      chartCartridgeTitle: 'FIG 6.2 · 配用制式实弹 1:1 半剖结构与装药参数',
      energyLadderTitle: `馆藏 ${LAB_CALIBER_TOTAL} 大制式口径枪口动能横向标尺 (J)`,
      secArmorerManual: 'CHAPTER 07 · 野战勤务快拆教范、排障卡与防伪封底',
      secArmorerManualSub:
        '原厂级有向拓扑野战分解规程、机械干涉红线、四大典型故障排障口诀与数字交互防伪印鉴',
      fieldStripHeading: '标准野战勤务快拆规程 (Field-Strip DAG)',
      interferencePrefix: '干涉禁令：',
      malfunctionsHeading: '四大经典卡阻与安全阻断排障卡',
      backSealBadge: 'AUTHENTICATED DIGITAL ARMORY MONOGRAPH',
      backSealTitle: '数字军械博物馆 · 1:1 工程典藏认证章',
      backQrTitle: '扫码启动实时 3D 拆解与语音纪录片',
      backQrSub:
        '使用手机相机扫描左侧矢量二维码，即可在浏览器免安装直达本枪 3D 剖视工作台、亲手快拆与双语配音导览。',
      backColophon:
        '本图册全部三维渲染图版、毫米级包络与内弹道曲线均由 Digital Armory 3D 引擎实时解算生成 · 仅供轻武器机械工程历史科普与学术收藏鉴赏，不含任何制造加工公差图纸。',
      footerPage: (idx, total) =>
        `PAGE ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      kids: {
        seriesHeader: '3D 趣味机械科学大画册 · 少儿多图探索版',
        editionBright: '明亮彩印绘本',
        editionDark: '暗夜炫酷绘本',
        explorerLabel: '小小机械探索家',
        defaultExplorer: '未来小工程师',
        coverBadge: '1:1 真实比例 · 3D 机械积木图鉴',
        heroSticker: (partsCount) => `共 ${partsCount} 块 3D 精密机械积木`,
        funFeaturesLabel: '三大超酷机械亮点',
        p2Kicker: '第 1 站 · 360° 转圈看一看',
        p2Title: '右边、左边和头顶全景大照片',
        p2Sub: '绕着它转一圈仔细瞧，你能找出左右两边哪里长得不一样吗？',
        viewRightTag: '右侧全景视图 · RIGHT VIEW',
        viewLeftTag: '左侧全景视图 · LEFT VIEW',
        viewTopTag: '头顶俯视全景 · TOP-DOWN VIEW',
        p3Kicker: '第 2 站 · 神奇透视超能力',
        p3Title: 'X 光透明外壳 vs 正中间切开一半',
        p3Sub: '不用拆螺丝！打开透视眼，一眼看清肚子里面藏着什么秘密机关',
        xrayBadge: '透视超能力 ① · X 光半透明外壳',
        xrayTip: '把外面的壳变透明，藏在里面的弹簧、滑块和杠杆全都现身啦！',
        cutawayBadge: '透视超能力 ② · 激光正中切开一半',
        cutawayTip:
          '像切西瓜一样从正中间剖开，看清内部通道与严丝合缝的积木咬合！',
        p4Kicker: '第 3 站 · 彩虹六小队分工图',
        p4Title: '六种鲜艳颜色 · 一眼认出谁负责干什么',
        p4Sub: '每一种颜色代表一支机械小分队，大家齐心协力才能顺利运转！',
        teamPartsUnit: (n) => `${n} 块零件`,
        p5Kicker: '第 4 站 · 超级零件大爆炸海报',
        p5Title: '所有积木飞到空中排好队！',
        p5Sub: '顺着图上的彩色编号细线找一找，看看每一块零件原来躲在哪里',
        treasureHuntLabel: (n) => `寻宝对号卡（全部 ${n} 块零件名称）`,
        p6Kicker: '第 5 站 · 四大积木分装包相册',
        p6Title: '像拼乐高一样分成 4 大核心组件包',
        p6Sub: '把每个组件包单独拿到放大镜下拍特写，细节看得清清楚楚！',
        bagLabel: (num) => `第 ${num} 号积木包`,
        p7Kicker: '第 6 站 · 四格 3D 慢动作连环画',
        p7Title: '把时间放慢 100 倍！四步看懂机械动作',
        p7Sub: '一眨眼的功夫里，里面的弹簧和滑块其实完成了超精彩的接力赛',
        ammoStripBadge: (isArchery) =>
          isArchery
            ? '1:1 碳纤维箭矢内部结构放大图'
            : '1:1 铜壳解剖放大图（科学模型）',
        statSpeed: '飞行速度',
        statEnergy: '运动能量',
        p8Kicker: '第 7 站 · 核心微距放大镜 & 动手拆装闯关',
        p8Title: '按顺序一步步拆装 + 扫码变 3D 互动玩具台',
        p8Sub: '记住正确的先后顺序，还能用爸妈手机扫码亲手旋转拆装 3D 模型！',
        macroZoomBadge: '核心机械咬合微距大特写 · MACRO ZOOM',
        stepsTitle: (n) => `小小工程师拆装顺序卡（共 ${n} 步）`,
        qrTitle: '手机扫一扫 · 纸质画册秒变 3D 互动玩具台！',
        qrSub:
          '免下载打开网页，就能用手指 360° 旋转、开关 X 光透视、亲手点击拆装每一个零件，还有语音讲故事！',
        qrCertBadge: '少年机械科学探索纪念章',
        pageFooter: (idx, total) =>
          `第 ${String(idx).padStart(2, '0')} 页 / 共 ${String(total).padStart(2, '0')} 页`,
      },
    },
    mechanismShowdown: {
      entryBtn: '流派对照 [S]',
      entryBtnTitle:
        '打开自动原理流派对照矩阵与双展品同屏对比实验室：总览驱动/闭锁/供弹三大机械谱系并叠绘内弹道曲线 (S)',
      plaqueCompareBtn: (rivalShort) => `与 ${rivalShort} 同屏原理对比`,
      plaqueCompareTitle: (selfShort, rivalShort) =>
        `打开双展品原理对照实验室：同屏对比 ${selfShort} 与 ${rivalShort} 的自动驱动、闭锁、供弹与内弹道曲线 (S)`,
      dialogAria: '自动原理流派对照矩阵与双展品同屏对比实验室',
      badge: 'WP-11 · 自动原理流派对照馆',
      exhibitCountPill: (exhibits, axes) =>
        `${exhibits} 款馆藏 · ${axes} 大正交机械轴`,
      title: '自动原理流派谱系矩阵 & 双展品同屏对照实验室',
      subtitle:
        '横跨能量驱动、枪机闭锁与供弹架构三大正交工程维度 · 1:1 内弹道/做功曲线叠绘与机械取舍定量解构',
      modeMatrix: '三维流派谱系矩阵',
      modeShowdown: '双展品同屏对照',
      closeTitle: '关闭原理对照矩阵 (Esc / S)',
      stagingLabel: '当前对照席位',
      stagingHint:
        '点击谱系卡片内任意两款展品分配至 A / B 席位，或点「加入右侧对比」一键进入双展品同屏对决',
      slotALabel: '展品 A',
      slotBLabel: '展品 B',
      swapPairTitle: '互换展品 A 与展品 B 对照席位',
      openShowdownCta: '开启 A vs B 同屏深度对照',
      allAxesTab: '全部三大机械轴',
      familyCountBadge: (count) => `${count} 款展品`,
      prosLabel: '核心工程优势',
      consLabel: '物理与结构代价',
      compareWithSlotBtn: '加入右侧对比',
      compareWithRivalBtn: '与代表对手对比',
      presetsLabel: '经典流派宿命对决：',
      selectWeaponAAria: '选择左侧对照展品 A',
      selectWeaponBAria: '选择右侧对照展品 B',
      sharedTraitBadge: '同源流派',
      diffTraitBadge: '异构分流',
      axisShortDrive: '驱动',
      axisShortLocking: '闭锁',
      axisShortFeed: '供弹',
      cutawayBenchBtn: (shortLabel) => `剖视检视 ${shortLabel} · Cutaway`,
      cutawayBenchTitle:
        '进入该展品 3D 拆解工作台并自动开启 Stencil 纵剖切面与 6 色机械职能分色',
      liveCycleBenchBtn: '动态击发循环',
      liveCycleBenchTitle: '进入 3D 工作台动态发射演示模式观察实弹循环',
      chartTitle: '内弹道 / 做功动力学双曲线同屏叠绘',
      chartSub:
        '横轴为单次发射循环进度 f ∈ [0%, 100%] · 实线阴影为膛压/拉力 P(f)，虚线为弹头/箭矢速度 V(f)',
      scaleNormalized: '归一化波形 (0–100%)',
      scaleRelative: '同域峰值比例',
      crossDomainNote:
        '注：枪械火药膛压 (MPa) 与弓弩凸轮拉力 (N) 属不同物理量纲，已按各自峰值归一化叠绘时序波形',
      legendPressure: (shortLabel) => `${shortLabel} 膛压/拉力`,
      legendVelocity: (shortLabel) => `${shortLabel} 初速 V(t)`,
      scrubReadoutLabel: (pct) =>
        `循环相位 f = ${pct}% · 移动光标逐帧比对瞬时遥测`,
      scrubHoverHint:
        '在曲线图上移动鼠标，实时比对任一击发相位的瞬时膛压/拉力与弹速',
      axisProgressLabel:
        '击发/做功循环进度 f (0% 待击 → 点火/撒放 → 出膛 → 抽抛壳 → 100% 闭锁复位)',
      metricsTitle: '六维定量工程指标横向对决',
      metricsSub: '实时提取自 SAAMI/CIP/ATA 物理引擎与 1:1 原厂测绘档案',
      metricVelocity: '枪口 / 离弦初速',
      metricEnergy: '枪口 / 矢箭动能',
      metricPeakLoad: '峰值膛压 / 峰值拉力',
      metricCyclic: '理论射速 / 动作机制',
      metricOalBarrel: '全长 (枪管/做功行程)',
      metricMassParts: '空重 (3D 零件数)',
      archBreakdownTitle: '四大机械子系统与工程取舍深度对照',
      rowDrive: '能量来源与自动驱动',
      rowLocking: '闭锁机构与开锁时机',
      rowFeed: '供弹路线与抛壳几何',
      rowFireControl: '火控击发与保险架构',
      rowVerdict: '决定性优势 vs 工程代价',
      strengthTag: '优势',
      tradeoffTag: '代价',
    },
  },
  en: {
    watermark:
      '1:1 Precision Mechanical CAD & 5-Channel ORM PBR · Google Gemini Bilingual R&D Story & Part Voice Guide',
    langToggleTitle:
      'Switch language & voice narration between Chinese and English',
    geoBuildBanner: (shortLabel, ready, total) =>
      `Streaming ${shortLabel} manifold CSG internals · ${ready} / ${total}`,
    studio: {
      envGroupAria: 'Studio lighting environment preset',
      presets: {
        tactical_vault: {
          label: 'Vault',
          title:
            'Tactical Vault: Deep anodized gunmetal dark room with cool rim softboxes & indoor range convolution IR',
        },
        gunsmith_bench: {
          label: 'Bench',
          title:
            'Gunsmith Bench: Warm overhead tungsten task lighting, 1:1 neoprene takedown mat & close-mic bench IR',
        },
        blueprint_daylight: {
          label: 'Blueprint',
          title:
            'Blueprint Daylight: High-contrast metrology daylight cyclorama & crisp light engineering HUD',
        },
      },
      postFxChip: 'GTAO',
      postFxTitle: (enabled) =>
        enabled
          ? 'GTAO Sub-mm Contact AO + Selective HDR Bloom + Close-Up Macro DOF + AgX Tone Mapping + SMAA active'
          : 'Enable GTAO Contact Ambient Occlusion + Filmic Macro PostFX pipeline',
      wearGroupAria: 'Firearm service condition & oil patina',
      wearPresets: {
        factory_new: {
          label: 'Mint',
          title: 'Factory Mint (0% wear): pristine parkerized/blued finish with clean factory oil sheen',
        },
        field_oiled: {
          label: 'Oiled',
          title: 'Field Oiled (35% wear · Default): subtle CNC edge burnish, CLP oil patina & crevice AO',
        },
        battle_worn: {
          label: 'Worn',
          title: 'Battle-Worn (95% wear): exposed steel edges, holster micro-scratches & carbon patina',
        },
      },
      qualityTitle: (tier) =>
        tier === 'ultra'
          ? 'Graphics Quality: Ultra (2K/4K shadows, GTAO, Macro DOF & SMAA) — click to cycle'
          : tier === 'balanced'
            ? 'Graphics Quality: Balanced (Half-res GTAO, 1.5x DPR) — click to cycle'
            : 'Graphics Quality: Eco (Lightweight renderer for mobile / integrated GPUs) — click to cycle',
      qualityLabels: {
        ultra: 'Ultra',
        balanced: 'Bal',
        eco: 'Eco',
      },
      hideUiChip: 'Hide UI',
      hideUiTitle:
        'Hide all UI buttons and HUD panels for unobstructed 3D showcase (Shortcut: H, press H or Esc to restore)',
      showUiChip: 'Show UI',
      showUiTitle: 'Restore all UI buttons and HUD panels (Shortcut: H / Esc)',
      fullscreenEnterChip: 'Fullscreen',
      fullscreenExitChip: 'Exit Fullscreen',
      fullscreenTitle: (active) =>
        active
          ? 'Exit native browser fullscreen mode (Esc)'
          : 'Toggle native browser fullscreen; pair with Hide UI (H) for borderless 3D presentation',
      immersiveBarAria: 'Clean showcase floating controls',
    },
    armory: {
      title: '3D Digital Armory & Mechanical Cutaway Vault',
      subtitle: `${VAULT_EXHIBIT_COUNT} Iconic World Firearms, Compound Archery & 1:1 Main Battle Tanks · Google Gemini R&D Documentary & Component Voice Disassembly`,
      filterAria: 'Filter collection by category',
      categories: {
        all: 'All Vault',
        assault: 'Rifle / Carbine',
        lmg: 'LMG / Rotary',
        smg: 'SMG / PDW',
        sniper: 'Sniper / Anti-Materiel',
        shotgun: 'Shotguns',
        pistol: 'Pistol / Revolver',
        archery: 'Bow / Crossbow',
        armor: 'Heavy Armor',
      },
      showcaseBtn: 'Showcase',
      showcaseTitle: 'Open official product & engineering showcase page',
      cartridgeLabBtn: '1:1 Cartridge Lab',
      cartridgeLabTitle: `Open ${ORDNANCE_TOTAL}-Caliber (${LAB_CALIBER_TOTAL} Small-Arms + ${TANK_ORDNANCE_TOTAL} Tank Ordnance) 1:1 Cutaway Lab: side-by-side anatomy & quantitative ballistics from 4.73mm Caseless & 9×19mm to .50 BMG and 88/120/125mm tank cannon rounds (B)`,
      ballisticsLabBtn: '1,000m Range [R]',
      ballisticsLabTitle: `Open 1,000m RK4 External Ballistics (${BALLISTICS_PROFILES_TOTAL} profiles), Crosswind Drift, FFP Reticle & Sniper DOPE Lab (Shortcut: R)`,
      posterBtn: '3D Poster [U]',
      posterTitle:
        'Open Instant HD 3D Cutaway Social Poster Studio: export 16:9 / 4:5 cards with QR & Armorer Rank seal (Shortcut: U)',
      certRackTitle: (rank) => `Earned Armorer Qualification: Rank ${rank}`,
      certPlaqueLabel: 'Armorer Qualification',
      certPlaqueSub: (s, t) => `Strip ${s ?? '—'} · Triage ${t ?? '—'}`,
      storyBtn: 'R&D Story',
      storyBtnTitle: 'Open 4-Act Firearm R&D Documentary & Bilingual Voiceover',
      enterBenchBtn: (tag) => `Inspect ${tag}`,
      caliberLabel: 'Caliber',
      precisionLabel: 'CAD Nodes',
      precisionValue: (a, p) => `${a} Groups / ${p} Parts`,
      mechanismLabel: 'Operating & Locking System',
      metrologyTitle: '1:1 Factory Metrology & Ballistics',
      oalLabel: 'Overall Length',
      barrelLabel: 'Barrel & Rifling',
      weightLabel: 'Empty Weight',
      muzzleVelLabel: 'Muzzle Velocity',
      rangeLabel: 'Effective Range',
      rofLabel: 'Rate of Fire',
      plaqueStoryCta: 'Listen to Full R&D Story (EN / ZH)',
      plaqueStorySub: '4-Act Documentary · Key Breakthroughs · 3D Part Focus',
      plaquePrimaryCta: (tag) => `Enter ${tag} 3D Disassembly & Firing`,
      pbrOn: '2K/4K PBR Textures: ON',
      pbrOff: '2K/4K PBR Textures: OFF',
      pbrTitle:
        'Toggle 2K/4K 5-channel PBR textures (Albedo + Normal + Packed ORM)',
      atlasBtn: 'Inspect PBR Atlas',
      atlasTitle: 'Inspect & download custom 2K/4K WebP PBR texture maps',
      rotateOn: 'Turntable: Rotating',
      rotateOff: 'Turntable: Paused',
      rotateTitle: 'Toggle 3D showcase turntable auto-rotation',
      xrayBtn: 'X-Ray Cutaway',
      xrayTitle: 'Preview internal bolt & fire-control mechanism in X-Ray (X)',
      sectionOn: 'Section Cut: ON',
      sectionOff: 'Armorer Section Cut',
      sectionTitle:
        'Two-pass WebGL Stencil solid cross-section cutaway with ISO 128 metallic hatching revealing chamber, rifling & feed path (C)',
      tintBtn: 'Role Tint [T]',
      tintTitle:
        'Color-code all components by 6 mechanical engineering roles: Locking, Gas System, Carrier, Fire Control, Springs & Housing (T)',
      stageHint: 'Drag to orbit · Click firearm to enter workbench',
      rackAria: `${VAULT_EXHIBIT_COUNT}-Bay Weapon Vault Rack`,
      rackTitle: `${VAULT_EXHIBIT_COUNT}-BAY WEAPON VAULT RACK · INTERACTIVE COLLECTION`,
      rackTip:
        'Click card to preview on turntable · Click again to enter 3D Workbench',
      scrollLeft: 'Scroll rack left',
      scrollRight: 'Scroll rack right',
      previewingBadge: 'On Stage',
      plannedBadge: 'Planned',
      partsNodeSuffix: (n) => `${n} CAD Parts`,
      cardEnterCta: 'Enter 3D Disassembly & Firing',
      plannedToast: (name) =>
        `"${name}" module is being integrated; select an active vault firearm to inspect.`,
      archeryPlaque: {
        caliberLabel: 'Projectile & Draw',
        mechanismLabel: 'Cam & Energy System',
        metrologyTitle: '1:1 Factory Metrology & Bow Kinetics',
        oalLabel: 'ATA / Overall Len',
        barrelLabel: 'Power Stroke / Brace',
        weightLabel: 'Bare Weight',
        muzzleVelLabel: 'Arrow Velocity',
        rangeLabel: 'Effective Range',
        rofLabel: 'Draw Wt / Cycle',
        plaquePrimaryCta: (tag) => `Enter ${tag} 3D Disassembly & Launch`,
        stageHint: 'Drag to orbit · Click exhibit to enter workbench',
      },
    },
    atlasModal: {
      dialogAria: 'PBR Texture Atlas Inspector',
      kicker: `${VAULT_EXHIBIT_COUNT}-EXHIBIT 2K/4K PBR ATLAS`,
      weaponSwitcherAria: `Switch ${VAULT_EXHIBIT_COUNT}-exhibit PBR texture library`,
      subtitle: `${VAULT_TEXTURES_TOTAL} custom 2K/4K WebP PBR textures (${VAULT_SUITES_TOTAL} suites · public/textures/*.webp) across all ${VAULT_EXHIBIT_COUNT} vault firearms, archery & heavy armor exhibits · UV-bound live to all ${VAULT_PARTS_TOTAL} precision CAD parts`,
      liveOn: 'Live 3D Textures: ON',
      liveOff: 'Live 3D Textures: OFF',
      closeAria: 'Close PBR texture atlas inspector',
      ormBadge: 'ORM · R/G/B',
      ormChannelTitle: 'Packed ORM (AO · Rough · Metal)',
      downloadTitle: (fileName) => `Download ${fileName}`,
      loadingFallback: (shortLabel) =>
        `Loading ${shortLabel} PBR atlas metadata on demand...`,
    },
    workbench: {
      backBtn: 'Vault',
      backTitle: 'Return to 3D Digital Armory Vault (Esc)',
      viewAngles: {
        iso: 'Iso',
        right: 'Right',
        left: 'Left',
        top: 'Top',
      },
      storyChip: 'R&D Story',
      storyChipTitle: 'Open full 4-Act R&D History Documentary & Voice Guide',
      firingChip: 'Live Cycle',
      firingChipTitle:
        'Switch to 7-phase dynamic firing, extraction & feeding simulation',
      pbrChip: 'PBR',
      pbrChipTitle:
        'Toggle 2K/4K 5-channel PBR textures (Albedo + Normal + Packed ORM)',
      atlasChip: 'Atlas',
      atlasChipTitle: 'Open 2K/4K PBR Texture Atlas Inspector',
      xrayChip: 'X-Ray',
      xrayChipTitle:
        'Render receiver, handguard & magazine shells translucent (X)',
      sectionChip: 'Section Cut',
      sectionChipTitle:
        'Two-pass WebGL Stencil solid cross-section cutaway with ISO 128 metallic hatching revealing chamber, rifling & lockup (C)',
      tintChip: 'Role Tint',
      tintChipTitle:
        'Toggle 6-role mechanical engineering functional color-coding & cutaway cap tint (T)',
      fieldStripChip: 'Field-Strip',
      fieldStripChipTitle:
        'Toggle hands-on military field-strip & reverse reassembly DAG mode: click 3D parts in sequence (G)',
      malfunctionChip: 'Malfunctions',
      malfunctionChipTitle:
        'Toggle classic firearm malfunction cutaway & clearing diagnostics: Stovepipe, Double-Feed, Light-Strike & Out-of-Battery (J)',
      caliperChip: '3D Caliper',
      caliperChipTitle:
        'Toggle 1:1 3D armorer vernier caliper & CAD envelope scale ruler: click any 2 surface points for millimeter measurement (K)',
      cartridgeChip: 'Ammo Lab',
      cartridgeChipTitle: `Open ${ORDNANCE_TOTAL}-Caliber (${LAB_CALIBER_TOTAL} Small-Arms + ${TANK_ORDNANCE_TOTAL} Tank Ordnance) 1:1 Cutaway Lab (B)`,
      ballisticsChip: '1km Range',
      ballisticsChipTitle: `Open 1,000m RK4 External Ballistics (${BALLISTICS_PROFILES_TOTAL} profiles), Crosswind & FFP Scope Lab for current caliber (R)`,
      posterChip: 'Poster',
      posterChipTitle:
        'Capture live 3D cutaway viewport into an HD 16:9 / 4:5 social share poster with QR deep-link (U)',
      edgesChip: 'CAD Edges',
      edgesChipTitle: 'Toggle industrial CAD hard-edge wireframe overlay (E)',
      labelsChip: 'Callouts',
      labelsChipTitle: (n) =>
        `Toggle 3D leader callouts for all ${n} parts (L)`,
      sfxChip: 'Mech SFX',
      sfxChipTitle: (muted) =>
        muted
          ? 'Gunsmith mechanical & ballistic SFX muted — click to unmute (M)'
          : `Toggle Web Audio gunsmith mechanical clicks & ${ORDNANCE_TOTAL}-caliber ballistic & cannon SFX (M)`,
      resetChip: 'Reset',
      resetChipTitle:
        'Reset to 0% assembled state & default isometric camera (Shift+R)',
    },
    bom: {
      collapsedBtn: (n) => `BOM Parts (${n})`,
      collapsedTitle: 'Expand Bill of Materials (BOM) part tree',
      headerTitle: 'BOM Assembly Tree',
      collapseAction: 'Hide',
      collapseTitle: 'Collapse BOM sidebar',
      showGroup: 'Show assembly group',
      hideGroup: 'Hide assembly group',
    },
    inspector: {
      firingBadge: (step) => `LIVE FIRING CYCLE · PHASE ${step} / 07`,
      closeTitle: 'Close inspector & stop part audio (Esc)',
      minimizeBtn: 'Minimize',
      minimizeTitle:
        'Minimize card to inspect 3D firearm without stopping narration (Esc)',
      expandBtn: 'Expand',
      expandTitle: 'Expand full component engineering breakdown',
      roleLabel: 'Mechanical Role',
      materialLabel: 'Metallurgy / Polymer',
      envelopeLabel: 'CAD Envelope',
      envelopeTitle:
        'Local CAD bounding dimensions: Length X × Height Y × Width Z (1 unit = 10 mm)',
      envelopeBuilding: 'Measuring CSG...',
      meshLabel: 'CSG Topology',
      meshTitle: 'Real-time manifold CSG triangle count',
      meshBuilding: 'Building...',
      meshTriangles: (f) => `${f} Δ tris`,
      materials: {
        nitride_steel: 'Carbonitrided / Phosphated Alloy Steel',
        barrel_steel: 'Cold-Hammer-Forged Chrome-Lined Barrel Steel',
        stainless: 'Precision Forged Stainless & Chrome Piston Steel',
        polymer_frame: 'Glass-Fiber Reinforced Polyamide Polymer',
        spring_steel: 'High-Fatigue Braided Music-Wire Spring Steel',
        follower_orange: 'High-Visibility Low-Friction Polymer',
        copper_accent: 'Brass / Copper Cartridge Alloy',
      },
      voiceGuideBtnPlay: 'Play Part Audio Guide',
      voiceGuideBtnPause: 'Pause Audio Guide',
      voiceGuideLoading: 'Loading Audio...',
      autoVoiceLabel: 'Auto-Voice',
      autoVoiceTitle:
        'Automatically play spoken narration whenever you click a 3D part or BOM item',
      secOverview: 'Function & Mounting',
      secCraft: 'Material & Geometry',
      secKinematics: '7-Stage Kinematics & Strip',
      secDesign: 'R&D Engineering Insight',
      openStoryLink: 'Open Full Weapon R&D Story',
      isolateEnter: 'Isolate Selected Part',
      isolateExit: 'Exit Part Isolation',
      prevPart: 'Previous component',
      nextPart: 'Next component',
      archery: {
        firingBadge: (step) => `LIVE LAUNCH CYCLE · PHASE ${step} / 07`,
        minimizeTitle:
          'Minimize card to inspect 3D bow/crossbow without stopping narration (Esc)',
        materialLabel: 'Composite / Alloy',
        materials: {
          nitride_steel: 'CNC Hard-Anodized 7075-T6 Aluminum Alloy',
          barrel_steel: 'Precision Forged High-Strength Alloy Steel',
          stainless: '17-4PH Precision Stainless & Ti-6Al-4V Titanium',
          polymer_frame: '3K Carbon-Fiber Composite & Reinforced Polymer',
          spring_steel: 'BCY-X High-Modulus Bowstring & Music-Wire Spring',
          follower_orange: 'High-Visibility Elastomer & Low-Friction Polymer',
          copper_accent: 'Bronze-Anodized Alloy & Anti-Dry-Fire Brass',
        },
        secKinematics: '7-Stage Draw & Launch Kinematics',
        openStoryLink: 'Open Full Archery R&D Story',
      },
    },
    timeline: {
      modeExplode: 'Exploded Disassembly',
      modeFieldStrip: 'Hands-On Field-Strip [G]',
      modeFiring: 'Dynamic Firing Cycle',
      modeMalfunction: 'Malfunction Drill [J]',
      speeds: {
        '0.25': '0.25x Ultra-Slow',
        '0.5': '0.5x Slow-Mo',
        '1': '1.0x Normal',
      },
      loopOn: 'Loop Cycle',
      loopOff: 'Single Cycle',
      loopTitle: 'Toggle continuous loop vs single-cycle stop',
      hudPill: 'HUD Scope',
      hudTitle: (open) =>
        open
          ? 'Toggle real-time SAAMI/CIP chamber pressure P(t) & bore velocity V(t) oscilloscope HUD'
          : 'Open real-time SAAMI/CIP chamber pressure P(t) & bore velocity V(t) oscilloscope HUD',
      gasFlowPill: 'Gas Flow',
      gasFlowTitle:
        'Toggle 60fps propellant bore expansion, gas-port tap & piston/BCG flow streamlines',
      sfxPill: 'Acoustic SFX',
      sfxTitle: `Toggle stereo convolution IR & ${ORDNANCE_TOTAL}-caliber waveguide ballistic & cannon Web Audio SFX (M)`,
      selectorGroupAria: 'Fire-control selector mode (V)',
      selectorShort: {
        safe: 'SAFE',
        semi: 'SEMI',
        auto: 'AUTO',
      },
      selectorBlockedHint: 'SAFE engaged · Sear blocked',
      pressCheckBtn: 'Press-Check [P]',
      pressCheckActiveBtn: 'Release Bolt [P]',
      pressCheckTitle:
        'Retract slide/bolt 28% for armorer Press-Check chamber inspection (Key P, or drag slide/bolt directly in 3D)',
      holdTriggerBtn: 'Hold Trigger [F]',
      holdTriggerSafeBtn: 'SAFE Locked [F]',
      holdTriggerResetBtn: 'Release Reset [F]',
      holdTriggerTitle:
        'Hold for two-stage trigger take-up & sear break (Key F): SAFE blocks sear, SEMI requires release for disconnector reset, AUTO cycles continuously',
      pause: 'Pause',
      autoExplode: 'Auto Strip',
      playExplodeTitle: (playing) =>
        playing
          ? 'Pause automatic disassembly (Space)'
          : 'Play staged disassembly animation (Space)',
      ticksExplode: [
        '0% Assembled',
        '30% Field Strip',
        '65% Sub-Strip',
        '100% Full Explode',
      ],
      singleShot: 'Pull Trigger',
      singleShotTitle: 'Fire a single complete 7-phase cycle from 0%',
      resumeFiring: 'Play Cycle',
      firingPlayTitle: 'Play or pause dynamic firing simulation (Space)',
      ticksFiring: {
        cocked: 'Cocked',
        ignition: 'Ignition',
        unlockFallback: 'Unlock',
        eject: 'Eject',
        feedLock: 'Feed & Lock',
        reset: 'Reset',
      },
      archery: {
        modeFiring: 'Draw & Power-Stroke Cycle',
        hudTitle: (open) =>
          open
            ? 'Toggle real-time ATA/IBO draw-force F(x) & arrow velocity V(t) oscilloscope HUD'
            : 'Open real-time ATA/IBO draw-force F(x) & arrow velocity V(t) oscilloscope HUD',
        gasFlowPill: 'Elastic Flow',
        gasFlowTitle:
          'Toggle 60fps split-limb elastic strain storage & cam power-stroke streamlines',
        sfxTitle:
          'Toggle stereo convolution IR & compound cam / bowstring Web Audio SFX (M)',
        selectorGroupAria: 'Release & safety selector mode (V)',
        selectorShort: {
          safe: 'SAFE',
          semi: 'LIVE',
          auto: 'AUTO',
        },
        pressCheckBtn: 'Draw-Check [P]',
        pressCheckActiveBtn: 'Let-Down [P]',
        pressCheckTitle:
          'Partial 28% Draw-Check to inspect cam timing & nock alignment (Key P, or drag bowstring/sled directly in 3D)',
        holdTriggerBtn: 'Hold to Release [F]',
        holdTriggerSafeBtn: 'SAFE Locked [F]',
        holdTriggerResetBtn: 'Release Reset [F]',
        holdTriggerTitle:
          'Hold to draw / trip release sear (Key F): SAFE locks sear against dry-fire; LIVE cycles single shot & resets on release',
        singleShot: 'Loose Arrow',
        singleShotTitle:
          'Run a complete 7-phase draw, power-stroke & arrow launch cycle from 0%',
        ticksFiring: {
          cocked: 'Ready',
          ignition: 'Cam Draw',
          unlockFallback: 'Release',
          eject: 'Exit',
          feedLock: 'Re-Nock',
          reset: 'Reset',
        },
      },
    },
    story: {
      badge: 'GEMINI R&D DOCUMENTARY',
      drawerSubtitle:
        'Complete Firearm R&D History · Mechanical Breakthroughs & 3D Part Links',
      closeTitle: 'Close R&D Story & stop narration',
      minimizeBtn: 'Minimize',
      minimizeTitle:
        'Minimize to floating bar so you can inspect the 3D firearm while listening (Esc)',
      expandBtn: 'Expand',
      expandTitle: 'Expand full 4-Act R&D documentary drawer',
      miniIdleSubtitle: '4-Act R&D Audio Guide · Inspect 3D while listening',
      playFullStory: 'Play All 4 Acts',
      pauseStory: 'Pause Narration',
      directorBtn: '3D Director',
      directorBtnTitle:
        'Automatically enter workbench, fly camera to focus parts, toggle Section-Cut (C) / X-Ray, and run 0.25x slow-mo live firing in sync with narration',
      cinemaModeBtn: 'Cinema Bar',
      cinemaModeTitle:
        'Minimize drawer into top live-caption bar for unobstructed 3D director choreography',
      liveSubtitlesLabel: 'LIVE SYNCED CAPTIONS · CLICK ANY SENTENCE TO SEEK',
      playingActPrefix: 'Now Playing',
      actVoicePlay: 'Play Act',
      actVoicePlaying: 'Playing',
      inspectPartBtn: (label) => `Focus "${label}" in 3D`,
      breakthroughsTitle: 'Key Mechanical Breakthroughs (Click to Focus in 3D)',
      breakthroughsSub:
        'How combat lessons shaped lockup, reliability, and ergonomics',
      milestonesTitle: 'Chronological R&D Milestones',
      milestonesSub:
        'From doctrinal requirement and trials to service adoption',
      loadingTitle: 'Loading R&D Documentary & Bilingual Archive...',
      loadingDesc: 'Fetching structured history & voiceover metadata.',
      pendingTitle: 'Unable to Load Bilingual R&D Archive',
      pendingDesc: `Please verify your static asset server is reachable. Full 4-act R&D documentaries, ${VAULT_PARTS_TOTAL} component breakdowns, and ${VAULT_AUDIO_TOTAL} Google Gemini TTS voiceovers across all ${VAULT_EXHIBIT_COUNT} vault exhibits (firearms, archery & heavy armor) are bundled under public/.`,
      switchToAk15Btn: 'Switch to AK-15M1 R&D Archive',
      aiAttribution:
        'Authored & voiced with Google Gemini 3.8 Flash & Gemini TTS grounded in 1:1 CAD specs',
      playbackRateTitle: 'Narration Speed: 1.0x / 1.25x / 1.5x',
      archeryDrawerSubtitle:
        'Complete Archery R&D History · Mechanical Breakthroughs & 3D Part Links',
      archeryMinimizeTitle:
        'Minimize to floating bar so you can inspect the 3D bow/crossbow while listening (Esc)',
    },
    engineeringTint: {
      badge: 'WP-05 · FUNCTIONAL ROLE TINT',
      closeTitle: 'Disable functional role tint (T)',
      filterHint: 'Click any role chip to spotlight · Click again to show all',
      showAllBtn: 'All Roles',
      gasFlowToggle: 'Gas Streamlines',
      gasFlowToggleTitle:
        'Visualize bore propellant plasma & gas-port flow streamlines in Live Cycle mode',
      liveGasCta: 'Watch Gas Flow',
      archery: {
        gasFlowToggle: 'Elastic Streamlines',
        gasFlowToggleTitle:
          'Visualize split-limb elastic strain storage & cam power-stroke streamlines in Live Cycle mode',
        liveGasCta: 'Watch Elastic Flow',
      },
    },
    fieldStrip: {
      badge: 'WP-07 · GUIDED FIELD-STRIP DAG',
      phaseStrip: 'Strip Phase',
      phaseReassemble: 'Reassemble',
      progressLabel: (done, total) => `${done} / ${total} Stripped`,
      hintBtn: 'Hint Next',
      hintTitle:
        'Pulse the next valid component in emerald green inside the 3D viewport',
      autoStepBtn: 'Do Next Step',
      autoStepTitle:
        'Automatically execute the next valid topological strip or reassembly step',
      resetBtn: 'Reset Strip',
      resetTitle: 'Reset all field-strip steps back to fully assembled state',
      exitBtn: 'Exit Mode',
      exitTitle:
        'Exit hands-on field-strip mode and return to continuous explode slider (G)',
      nextActionPrefixStrip: 'Next Strip: ',
      nextActionPrefixReassemble: 'Next Reinstall: ',
      click3dHint:
        'Click the target part directly in the 3D viewport (Shift+Click to open Part Inspector)',
      interferenceBadge: 'MECHANICAL INTERFERENCE',
      infoBadge: 'ARMORER NOTE',
      dismissAlert: 'Dismiss',
      completedTitle:
        'Full Military Field-Strip & Reverse Reassembly Completed!',
      completedDesc:
        'All operating groups were stripped and reinstalled in strict topological order without mechanical interference.',
      shareCertPosterBtn: 'Share Rank Poster',
      shareCertPosterTitle:
        'Generate an HD 3D Cutaway Share Poster stamped with your earned Armorer Qualification Rank & QR code (U)',
    },
    malfunction: {
      badge: 'WP-09 · MALFUNCTION CUTAWAY & CLEARING LAB',
      progressLabel: (done, total) => `Clearing ${done} / ${total}`,
      nextStepBtn: 'Execute Next Step',
      nextStepTitle:
        'Execute the current standard armorer clearing drill step in 3D',
      resetDrillBtn: 'Re-Stage Jam',
      resetDrillTitle:
        'Reset back to the initial stoppage freeze-frame to inspect or practice again',
      exitBtn: 'Exit Lab',
      exitTitle:
        'Exit malfunction diagnostics and return to live firing cycle (J)',
      rootCauseLabel: 'Mechanical Root Cause:',
      safetyNoteLabel: 'Armorer Safety Protocol:',
      drillStepsAria: 'Ordered clearing drill sequence',
      click3dHint:
        'Click highlighted 3D action parts (slide/bolt/magazine) directly or use the step button',
      clearedTitle:
        'Stoppage Cleared · Fresh Cartridge Seated in Full Battery!',
      clearedDesc:
        'All jammed brass and feed obstructions were cleared per military Remedial Action doctrine, restoring 100% bolt lockup.',
      shareCertPosterBtn: 'Share Rank Poster',
      shareCertPosterTitle:
        'Generate an HD 3D Cutaway Share Poster stamped with your earned Triage Qualification Rank & QR code (U)',
      archeryBadge: 'WP-09 · ARCHERY TIMING & STOP DIAGNOSTICS',
      archeryRootCauseLabel: 'Archery Root Cause:',
      archerySafetyNoteLabel: 'Anti-Dry-Fire Safety Protocol:',
      archeryClick3dHint:
        'Click highlighted 3D archery parts (bowstring/D-loop/rest/sled/latch) directly or use the step button',
      archeryClearedTitle:
        'Stoppage Cleared · Cam Timing & String Latch Restored!',
      archeryClearedDesc:
        'All vane contact, nock pinch, and dry-fire interlock hazards were cleared per pro-shop technician doctrine, restoring proper brace alignment.',
    },
    caliper: {
      badge: 'WP-10 · 1:1 3D VERNIER CALIPER',
      closeTitle: 'Close 3D vernier caliper & CAD envelope ruler (K)',
      unitNote:
        '1 world unit = 10.0 mm · Raycasts through cutaway planes onto internal locking surfaces',
      promptPointA: 'Step 1: Click any 3D firearm surface to place Jaw A datum',
      promptPointB:
        'Step 2: Hover for live span preview, then click to lock Jaw B',
      lockedLabel: '3D Point-to-Point Span (A → B)',
      pointALabel: 'Datum Jaw A',
      pointBLabel: 'Vernier Jaw B',
      deltaX: '|ΔX| Bore',
      deltaY: '|ΔY| Height',
      deltaZ: '|ΔZ| Width',
      benchmarksLabel: '1-Click CAD Benchmarks:',
      benchmarks: {
        overall_envelope: 'Overall Length',
        barrel_length: 'Barrel Length',
        bolt_lug_span: 'Bolt / Slide Span',
      },
      envelopeRulerBtn: 'Envelope Ruler',
      envelopeRulerTitle:
        'Toggle full-weapon 3D CAD bounding length × height × width millimeter scale frame',
      clearBtn: 'Clear Points',
      clearTitle: 'Clear A/B surface points to measure a new span',
      envelopeSummary: (l, h, w) => `Envelope: L ${l} × H ${h} × W ${w} mm`,
      archery: {
        unitNote:
          '1 world unit = 10.0 mm · Raycasts through cutaway planes onto riser, cam & arrow surfaces',
        promptPointA:
          'Step 1: Click any 3D bow or crossbow surface to place Jaw A datum',
        deltaX: '|ΔX| Span',
        benchmarks: {
          overall_envelope: 'Overall Span',
          barrel_length: 'Arrow / Rail Span',
          bolt_lug_span: 'Riser / Axle Span',
        },
        envelopeRulerBtn: 'Envelope Ruler',
        envelopeRulerTitle:
          'Toggle full-platform 3D CAD bounding length × height × width millimeter scale frame',
      },
    },
    cartridgeLab: {
      badge: 'WP-06 · SAAMI / CIP 1:1 CARTRIDGE CUTAWAY LAB',
      title: `${LAB_CALIBER_TOTAL}-Caliber 1:1 SAAMI Cartridge Cutaway Lab`,
      subtitle:
        'True 1:1 side-by-side longitudinal cutaways (1 unit = 10 mm) · Compare propellant columns, 4.73mm caseless blocks, Boxer anvils, 12ga buckshot wads, dual-core penetrators & muzzle energy',
      gallerySwitchAria: 'Ordnance Gallery Scale Switcher',
      gallerySmallArmsBtn: 'Small Arms (15)',
      gallerySmallArmsTitle:
        'Switch to 15-caliber 1:1 Small-Arms Cutaway Gallery (29.69–138.43 mm)',
      galleryTankOrdnanceBtn: 'Tank Ordnance (3)',
      galleryTankOrdnanceTitle:
        'Switch to 3-caliber 1:1 Main Battle Tank Cannon Ordnance Gallery (88mm / 120mm / 125mm)',
      tankOrdnanceBadge: 'HEAVY ORDNANCE · 1:1 TANK ORDNANCE LAB',
      tankOrdnanceTitle: '1:1 Main Battle Tank Ordnance Cutaway Lab',
      tankOrdnanceSubtitle:
        'Absolute 1:1 cutaway comparison: 88mm PzGr.39, 120mm NATO APFSDS & 125mm DTC10-125',
      backVaultBtn: 'Return to Vault',
      backVaultTitle: 'Return to 3D Digital Armory Vault (Esc / B)',
      lineupBtn: `1:1 Full ${LAB_CALIBER_TOTAL}-Caliber Lineup`,
      lineupTitle: `Frame all ${LAB_CALIBER_TOTAL} cartridges side-by-side at exact 1:1 physical scale`,
      tankLineupBtn: '1:1 Full 3-Ordnance Lineup',
      tankLineupTitle:
        'Frame all 3 main battle tank cannon rounds side-by-side at exact 1:1 physical scale',
      focusSpecimenBtn: 'Macro Specimen Focus',
      focusSpecimenTitle:
        'Zoom into the active cartridge cutaway to inspect primer anvil & bullet core',
      cutawayOn: '180° Cutaway: ON [C]',
      cutawayOff: 'Full Case / Hull [C]',
      cutawayTitle:
        'Toggle 180° longitudinal cross-section cutaway vs intact cartridge case (C)',
      edgesBtn: 'CAD Edges',
      edgesTitle: 'Toggle crisp CAD hard-edge wireframe on cartridge anatomy',
      matrixToggleOpen: 'Quantitative Matrix',
      matrixToggleClose: 'Hide Matrix',
      matrixToggleTitle: `Toggle ${LAB_CALIBER_TOTAL}-caliber quantitative comparison table (dimensions, charge, pressure & energy)`,
      tankMatrixToggleTitle:
        'Toggle 3-ordnance tank cannon quantitative comparison table (dimensions, charge, pressure & energy)',
      explodeLabel: 'Axial Anatomy Explode',
      explodeReset: 'Collapse',
      caliberSelectorAria: 'Select caliber specimen in 1:1 cutaway lineup',
      anatomyCardBadge: '1:1 AMMUNITION ENGINEERING DOSSIER',
      dimOalCase: 'OAL / Case Length',
      dimRimBullet: 'Bullet Ø / Rim Ø',
      chargeVolumeMass: 'Case Vol / Charge',
      projectileSpec: 'Projectile Mass',
      pressureVelocity: 'Peak Pmax / MV',
      muzzleEnergy: 'Muzzle Energy',
      propellantLabel: 'Propellant System',
      primerLabel: 'Primer & Flash Hole',
      coreAnatomyLabel: 'Jacket & Core Anatomy',
      chamberInWeaponBtn: (w) => `Chamber in ${w} Live Cycle`,
      ballisticsRangeBtn: '1,000m Trajectory Lab [R]',
      ballisticsRangeTitle:
        'Inspect drop, crosswind drift, transonic Mach 1.0 zone & FFP reticle for this caliber in the 1,000m Range Lab (R)',
      tableCaption: `SAAMI / CIP / NATO ${LAB_CALIBER_TOTAL}-Caliber 1:1 Dimensional & Internal Ballistics Comparison Matrix`,
      tankTableCaption:
        'NATO STANAG / PLA GJB / WWII 3-Ordnance Tank Cannon 1:1 Dimensional & Internal Ballistics Matrix',
      colCaliber: 'Caliber',
      colStandard: 'Standard',
      colCaseOal: 'Case / OAL (mm)',
      colCharge: 'Vol / Charge',
      colProjectile: 'Bullet (g / gr)',
      colPressure: 'Peak Pmax (MPa)',
      colVelocity: 'Velocity (m/s)',
      colEnergy: 'Muzzle Energy (J)',
      colWeapons: 'Vault Firearms',
    },
    monograph: {
      entryChip: 'Picture Book',
      entryChipTitle:
        'Open 3D Illustrated Picture Book & Military Monograph Print Studio: print a 17-plate 3D visual album for kids or a full technical dossier (Ctrl/Cmd + P)',
      plaqueCtaMain:
        'Print 3D Illustrated Picture Book / Collector Monograph (A4 / PDF)',
      plaqueCtaSub:
        '17 Big 3D Studio Plates · Kids Multi-Picture Book & Pro Technical Dossier Modes',
      studioBadge: '3D ILLUSTRATED MONOGRAPH STUDIO',
      studioTitle:
        '3D Mechanical Picture Book & Collector Monograph · Print Studio',
      studioSub:
        'Renders 17 offscreen HD 3D studio plates (360° views, X-Ray, Cutaway, LEGO Sub-Assemblies & 4-Panel Action Comic) · Switch between Kids Picture Book & Pro Dossier',
      weaponSelectAria: 'Select exhibit for picture book printing',
      styleDk: 'DK Encyclopedia',
      styleDkTip:
        'DK Publishing museum standard: frameless transparent cutouts on pure white paper, 0.35pt hairline callouts, optical loupes, 1:1 actual-size ammunition & gatefold spreads',
      styleKids: 'Kids Picture Book',
      styleKidsTip:
        'Designed for young explorers: 17 giant uncropped 3D pictures, short playful stickers, LEGO-style sub-assembly bags & 4-panel slow-motion comic',
      stylePro: 'Pro Technical Dossier',
      styleProTip:
        'Collector defense edition: 4-act R&D history essays, full BOM metallurgy ledger, SAAMI pressure/velocity curves & clearing drills',
      editionDk: 'DK Pure White',
      editionDkTip:
        'Pure white coated art paper with transparent alpha cutouts and grounded studio contact shadows',
      editionObsidian: 'Dark Studio Album',
      editionObsidianTip:
        'Rich dark studio aesthetic — great for tablet reading, PDF archiving, or full-bleed glossy photo paper',
      editionBlueprint: 'Bright Picture-Book (Ink-Saver)',
      editionBlueprintTip:
        'Crisp bright white & sky-blue picture-book paper — saves ~90% black ink on home color printers',
      layoutSpreadA3: 'A3 Spread',
      layoutSpreadA3Tip:
        'Classic DK double-page gatefold layout (420×297mm landscape) sweeping heroically across the center fold',
      layoutPortraitA4: 'A4 Portrait',
      layoutPortraitA4Tip:
        'Standard A4 single-page portrait layout (210×297mm) for home color printers and archival binders',
      mode8p: '8-Page Full Color Book',
      mode4p: '4-Page Quick Print',
      mode4Spreads: '4 Spreads (8P Full)',
      mode2Spreads: '2 Spreads (4P Compact)',
      qualityStandard: 'Fast 1440px',
      qualityStandardTip:
        '1440×900 offscreen WebGL plates for rapid interactive preview',
      qualityPrint: '300 DPI 2880px',
      qualityPrintTip:
        '2880×1800 print-grade master capture (~300 DPI) for press-ready PDF & museum framing',
      prepressToggle: '3mm Bleed + Crops',
      prepressToggleTip:
        'Enable ISO 12647 3mm pre-press bleed and corner registration crop marks (426×303mm A3 / 216×303mm A4)',
      cyclesBadge: (cyclesCount, total) =>
        `Cycles 4K Masters (${cyclesCount}/${total})`,
      callsignLabel: 'Name Stamp',
      callsignPlaceholder: 'Child Name / Collector Callsign (on cover)',
      reshootBtn: 'Re-Shoot 3D',
      reshootTitle: 'Re-render all 17 offscreen HD WebGL 3D studio plates',
      printCta: 'Print Picture Book / Export PDF',
      printCapturingCta: (done, total) =>
        `Shooting 3D Plates (${done}/${total})…`,
      printHint:
        'Print Tip: Choose "A4 Portrait · Margins: None" and check "Background graphics" in your print dialog for edge-to-edge color pages.',
      printHintDkSpread:
        'DK A3 Spread Tip: Choose "A3 Landscape (420×297mm) · Margins: None" with "Background graphics", or run npm run monograph:pdf for automated 300 DPI pre-press PDF.',
      closeTitle: 'Close Print Studio (Esc)',
      capturingTitle: (tag, done, total) =>
        `Shooting ${tag} HD 3D Picture Plates (${done} / ${total})`,
      capturingSub:
        'Rendering 360° turnaround, X-Ray vision, laser half-cutaway, rainbow teams, LEGO bags & 4-panel slow-mo comic…',
      seriesHeader: 'DIGITAL ARMORY 3D · ORDNANCE ENGINEERING MONOGRAPH SERIES',
      editionStampDk: 'DK VISUAL ENCYCLOPEDIA · COATED ART PAPER',
      editionStampObsidian: 'COLLECTOR DARK FOLIO · LIMITED ARCHIVE EDITION',
      editionStampBlueprint: 'ISO 128 ORDNANCE TECHNICAL MANUAL · INK-SAVER',
      coverMonographTag: '1:1 MECHANICAL & INTERNAL BALLISTICS DOSSIER',
      coverScaleTag: 'CAD DATUM 1:1 · UNIT mm',
      coverCollectorLabel: 'ISSUED TO / ARMORER',
      coverDefaultCollector: 'DIGITAL ARMORY ARCHIVE EDITION',
      coverHighlightsHeading: 'KEY ORDNANCE ENGINEERING ATTRIBUTES',
      secChronicleI: 'CHAPTER 01 · DOCTRINAL ORIGINS & R&D GENESIS',
      secChronicleISub:
        'Operational Trials, Procurement Mandates & Material Metallurgy Evolution',
      secMilestonesHeading: 'CHRONOLOGICAL SERVICE MILESTONES',
      secChronicleII:
        'CHAPTER 02 · PRODUCTION ARCHITECTURE & CORE BREAKTHROUGHS',
      secChronicleIISub:
        'Operating Kinematics, Breech Locking Margin & Combat Refinement',
      secBreakthroughsHeading: 'THREE DEFINING MECHANICAL BREAKTHROUGHS',
      plateBreechCaption:
        'FIG 2.1 · Macro X-Ray Engagement Plate: Locking Lugs, Barrel Extension & Fire-Control Sear Interface',
      secCutawayRoles:
        'CHAPTER 03 · SOLID LONGITUDINAL CUTAWAY & 6-ROLE ANATOMY',
      secCutawayRolesSub:
        'ISO 128 45° Hatched Solid Section Cut · Six Functional Subsystem Roles & 7-Phase Kinematic Sequence',
      plateStencilCaption:
        'FIG 3.1 · Two-Pass WebGL Stencil Longitudinal Section Cutaway (Bore Rifling, Gas Manifold, Breech Lock & Feed Path)',
      plateRolesCaption:
        'FIG 3.2 · 34% Semi-Exploded Six-Role Functional Classification Plate (Locking / Gas / Carrier / FCG / Springs / Housing)',
      secCycle7Heading: '7-PHASE OPERATING KINEMATIC SEQUENCE',
      secExplodedPlate:
        'CHAPTER 04 · FULL 100% EXPLODED ORDNANCE BLUEPRINT PLATE',
      secExplodedPlateSub:
        'Collision-Free Staged Disassembly · Dual-Rail Vector BOM Callout Pins (Infinite-DPI Scalable Wall Poster)',
      explodedLegendNote:
        'Callout Palette: Cyan = Slide/Carrier Group · Emerald = Barrel/Receiver · Rose = Fire-Control Group · Amber = Magazine Feed',
      secBomLedger:
        'CHAPTER 05 · COMPLETE BILL OF MATERIALS & METALLURGY LEDGER',
      secBomLedgerSub: (partsCount, tris) =>
        `${partsCount} Parametric Manifold CSG Nodes · ${tris} Total Triangles · Live 1:1 Millimeter Bounding Envelopes`,
      bomColCode: 'Code',
      bomColComponent: 'Component Designation & Group',
      bomColMaterial: 'Ordnance Metallurgy & Finish',
      bomColEnvelope: '1:1 Envelope (L×H×W)',
      bomColPrinciple: 'Mechanical Function & Mating Interface',
      secBallistics:
        'CHAPTER 06 · 1:1 SAAMI CARTRIDGE CUTAWAY & INTERNAL BALLISTICS',
      secBallisticsSub: `Coupled Chamber Pressure P(t) & Bore Velocity V(t) Curves · 1:1 Half-Section Schematic & ${LAB_CALIBER_TOTAL}-Caliber Energy Ladder`,
      chartPressureTitle:
        'FIG 6.1 · Coupled Chamber Pressure P(t) [MPa] & Bore Velocity V(t) [m/s]',
      chartCartridgeTitle:
        'FIG 6.2 · 1:1 Service Cartridge Half-Section & Propellant Spec',
      energyLadderTitle: `${LAB_CALIBER_TOTAL}-Caliber Vault Muzzle Kinetic Energy Scale (J)`,
      secArmorerManual:
        'CHAPTER 07 · FIELD-STRIP DAG, STOPPAGE DRILLS & COLOPHON',
      secArmorerManualSub:
        'Directed Topological Field-Strip Procedure, Mechanical Interference Locks, Four Clearing Drills & QR Deep-Link',
      backSealBadge: 'AUTHENTICATED DIGITAL ARMORY MONOGRAPH',
      backSealTitle: 'Digital Armory 3D · 1:1 Engineering Certificate Seal',
      backQrTitle: 'Scan for Live 3D Disassembly & Voice Documentary',
      backQrSub:
        'Scan this vector QR code with your phone camera to launch interactive 3D cutaway inspection, guided field-strip, and bilingual voiceover directly in your browser.',
      backColophon:
        'All 3D PBR/cutaway plates, millimeter envelopes, and ballistic curves in this monograph are synthesized in real time by Digital Armory 3D · Educational mechanical history edition; contains zero manufacturing tolerances.',
      fieldStripHeading: 'AUTHORIZED FIELD-STRIP SEQUENCE (DAG)',
      interferencePrefix: 'Interference Lock: ',
      malfunctionsHeading: 'FOUR CANONICAL STOPPAGE & SAFETY DIAGNOSTICS',
      footerPage: (idx, total) =>
        `PAGE ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
      kids: {
        seriesHeader:
          '3D MECHANICAL SCIENCE PICTURE BOOK · JUNIOR EXPLORER EDITION',
        editionBright: 'BRIGHT PICTURE BOOK',
        editionDark: 'DARK STUDIO BOOK',
        explorerLabel: 'JUNIOR EXPLORER',
        defaultExplorer: 'Future Young Engineer',
        coverBadge: '1:1 REAL SCALE · 3D MECHANICAL BRICK ATLAS',
        heroSticker: (partsCount) => `${partsCount} Interlocking 3D Parts`,
        funFeaturesLabel: '3 COOL MECHANICAL HIGHLIGHTS',
        p2Kicker: 'STOP 01 · 360° ALL-AROUND LOOK',
        p2Title: 'Right Side, Left Side & Top-Down Giant Photos',
        p2Sub:
          'Walk all the way around it — can you spot the differences between the left and right sides?',
        viewRightTag: 'RIGHT SIDE FULL VIEW',
        viewLeftTag: 'LEFT SIDE FULL VIEW',
        viewTopTag: 'TOP-DOWN BIRD’S-EYE VIEW',
        p3Kicker: 'STOP 02 · SUPER X-RAY VISION',
        p3Title: 'See-Through Shell vs Sliced Right Down the Middle',
        p3Sub:
          'Turn on X-Ray eyes to peek at the secret springs, levers, and sliders hiding inside!',
        xrayBadge: 'SUPERPOWER ① · X-RAY SEE-THROUGH SHELL',
        xrayTip:
          'Makes the outer cover translucent so every hidden spring and moving block pops into view!',
        cutawayBadge: 'SUPERPOWER ② · SLICED IN HALF',
        cutawayTip:
          'Sliced cleanly along the center line to reveal inner tunnels and interlocking metal parts!',
        p4Kicker: 'STOP 03 · RAINBOW 6-TEAM COLOR MAP',
        p4Title: 'Six Bright Colors Show Each Team’s Job',
        p4Sub:
          'Every color is a special mechanical squad working together like a relay team!',
        teamPartsUnit: (n) => `${n} pcs`,
        p5Kicker: 'STOP 04 · GIANT LEGO-STYLE EXPLODED POSTER',
        p5Title: 'Every Single Part Floating in Mid-Air!',
        p5Sub:
          'Follow the numbered lines like a treasure map to find where each piece belongs',
        treasureHuntLabel: (n) => `Part Name Treasure Map (All ${n} Pieces)`,
        p6Kicker: 'STOP 05 · 4 SUB-ASSEMBLY BRICK BAGS',
        p6Title: 'Grouped into 4 Core Building Bags Like LEGO',
        p6Sub:
          'Close-up studio photos of each group all by itself so every detail shines!',
        bagLabel: (num) => `BAG #${num}`,
        p7Kicker: 'STOP 06 · 4-PANEL 3D SLOW-MO COMIC',
        p7Title: '100× Slow Motion! Watch How It Cycles in 4 Steps',
        p7Sub:
          'In the blink of an eye, springs and sliders complete an amazing mechanical relay race',
        ammoStripBadge: (isArchery) =>
          isArchery
            ? '1:1 Carbon Arrow Anatomy Cutaway'
            : '1:1 Brass Cutaway Science Diagram',
        statSpeed: 'Launch Speed',
        statEnergy: 'Kinetic Energy',
        p8Kicker: 'STOP 07 · MACRO ZOOM & STEP-BY-STEP PUZZLE',
        p8Title: 'Take-Apart Order Cards & Scan for 3D Toy Bench',
        p8Sub:
          'Follow the numbered order — then scan with a phone to spin and take it apart in 3D!',
        macroZoomBadge: 'CORE MECHANISM MACRO ZOOM',
        stepsTitle: (n) => `Junior Engineer Step-by-Step Order (${n} Steps)`,
        qrTitle: 'Scan with a Phone · Turn Paper into a Live 3D Toy Bench!',
        qrSub:
          'Opens instantly in the browser — spin 360°, toggle X-Ray vision, click parts to take them apart, and listen to voice stories!',
        qrCertBadge: 'JUNIOR MECHANICAL EXPLORER SEAL',
        pageFooter: (idx, total) =>
          `PAGE ${String(idx).padStart(2, '0')} OF ${String(total).padStart(2, '0')}`,
      },
    },
    mechanismShowdown: {
      entryBtn: 'Showdown [S]',
      entryBtnTitle:
        'Open Mechanism Showdown 3-Axis Lineage Matrix & Dual-Exhibit Comparison Lab: compare Drive, Locking, Feed & internal ballistics (S)',
      plaqueCompareBtn: (rivalShort) => `Compare vs ${rivalShort}`,
      plaqueCompareTitle: (selfShort, rivalShort) =>
        `Open A-vs-B Mechanism Showdown comparing ${selfShort} against ${rivalShort} across drive, locking, feed & ballistics (S)`,
      dialogAria:
        'Mechanism Showdown Lineage Matrix and Dual-Exhibit Comparison Lab',
      badge: 'WP-11 · MECHANISM SHOWDOWN',
      exhibitCountPill: (exhibits, axes) =>
        `${exhibits} EXHIBITS · ${axes} TAXONOMY AXES`,
      title: 'Mechanical Lineage Matrix & Dual-Exhibit Showdown Lab',
      subtitle:
        'Orthogonal taxonomy across Operating Drive, Breech Locking & Feed Architecture · Live overlaid internal ballistics & trade-off analysis',
      modeMatrix: '3-Axis Lineage Matrix',
      modeShowdown: 'A vs B Showdown',
      closeTitle: 'Close Mechanism Showdown (Esc / S)',
      stagingLabel: 'Active Showdown Pair',
      stagingHint:
        'Click any exhibit chip to stage into Slot A / B, or click "Compare vs A" to launch side-by-side showdown',
      slotALabel: 'EXHIBIT A',
      slotBLabel: 'EXHIBIT B',
      swapPairTitle: 'Swap Exhibit A and Exhibit B',
      openShowdownCta: 'Launch A vs B Showdown',
      allAxesTab: 'All 3 Taxonomy Axes',
      familyCountBadge: (count) =>
        `${count} ${count === 1 ? 'Exhibit' : 'Exhibits'}`,
      prosLabel: 'Engineering Advantage',
      consLabel: 'Mechanical Trade-Off',
      compareWithSlotBtn: 'Compare vs A',
      compareWithRivalBtn: 'Compare Rival',
      presetsLabel: 'Classic Rivalries:',
      selectWeaponAAria: 'Select Exhibit A for comparison',
      selectWeaponBAria: 'Select Exhibit B for comparison',
      sharedTraitBadge: 'SHARED',
      diffTraitBadge: 'DIFF',
      axisShortDrive: 'Drive',
      axisShortLocking: 'Locking',
      axisShortFeed: 'Feed',
      cutawayBenchBtn: (shortLabel) => `Cutaway ${shortLabel} in Workbench`,
      cutawayBenchTitle:
        'Enter 3D Workbench for this exhibit with longitudinal Stencil Section-Cut and 6-role Functional Tint enabled',
      liveCycleBenchBtn: 'Live Cycle',
      liveCycleBenchTitle: 'Enter 3D Workbench Live Firing Cycle mode',
      chartTitle: 'Overlaid Internal Ballistics & Power-Stroke Curves',
      chartSub:
        'Cycle progress f ∈ [0%, 100%] · Solid shaded = Pressure/Draw P(f), Dashed = Projectile Velocity V(f)',
      scaleNormalized: 'Normalized Shape',
      scaleRelative: 'Relative Magnitude',
      crossDomainNote:
        'Note: Firearm breech pressure (MPa) and archery draw thrust (N) span distinct physical domains; normalized to 100% peak to compare cycle timing',
      legendPressure: (shortLabel) => `${shortLabel} P(t) / Force`,
      legendVelocity: (shortLabel) => `${shortLabel} Vel V(t)`,
      scrubReadoutLabel: (pct) =>
        `Cycle Phase f = ${pct}% · Move cursor across trace to inspect live telemetry`,
      scrubHoverHint:
        'Hover across the SVG trace to compare instantaneous pressure/draw and velocity at any cycle phase',
      axisProgressLabel:
        'Firing / Launch Cycle Progress f (0% Ready → Ignition/Release → Exit → Eject → 100% Battery)',
      metricsTitle: 'Quantitative Engineering Showdown',
      metricsSub:
        'Computed live from SAAMI/CIP/ATA ballistics engine & 1:1 factory metrology',
      metricVelocity: 'Muzzle / Launch Velocity',
      metricEnergy: 'Muzzle Kinetic Energy',
      metricPeakLoad: 'Peak Breech P / Peak Draw',
      metricCyclic: 'Cyclic Rate / Action Mode',
      metricOalBarrel: 'Overall Length (Barrel/Stroke)',
      metricMassParts: 'Unloaded Mass (CAD Parts)',
      archBreakdownTitle:
        'Subsystem Architecture & Engineering Trade-Off Matrix',
      rowDrive: 'Energy & Operating Drive',
      rowLocking: 'Breech Locking & Unlock Timing',
      rowFeed: 'Ammunition Feed & Ejection',
      rowFireControl: 'Fire Control & Safety System',
      rowVerdict: 'Signature Strength vs Penalty',
      strengthTag: 'PRO',
      tradeoffTag: 'CON',
    },
  },
};

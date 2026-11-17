import type { ArmoryEnvironmentPreset } from '../engine/canvas/GunsmithStageMat';
import type { FireSelectorMode } from '../engine/interaction/InteractiveActionController';
import type { LanguageCode } from '../narration/types';
import type {
  ArmoryCategory,
  CameraPresetType,
  MaterialKind,
} from '../weapons/types';

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
    categories: Record<ArmoryCategory, string>;
    showcaseBtn: string;
    showcaseTitle: string;
    cartridgeLabBtn: string;
    cartridgeLabTitle: string;
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
  };
  engineeringTint: {
    badge: string;
    closeTitle: string;
    filterHint: string;
    showAllBtn: string;
    gasFlowToggle: string;
    gasFlowToggleTitle: string;
    liveGasCta: string;
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
  };
  cartridgeLab: {
    badge: string;
    title: string;
    subtitle: string;
    backVaultBtn: string;
    backVaultTitle: string;
    lineupBtn: string;
    lineupTitle: string;
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
    tableCaption: string;
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
    editionObsidian: string;
    editionObsidianTip: string;
    editionBlueprint: string;
    editionBlueprintTip: string;
    mode8p: string;
    mode4p: string;
    callsignLabel: string;
    callsignPlaceholder: string;
    reshootBtn: string;
    reshootTitle: string;
    printCta: string;
    printCapturingCta: (done: number, total: number) => string;
    printHint: string;
    closeTitle: string;
    capturingTitle: (shortTag: string, done: number, total: number) => string;
    capturingSub: string;
    seriesHeader: string;
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
          ? '已启用 GTAO 毫米级接触环境光遮蔽 + HDR 选择性辉光 + AgX 电影级色调映射 + SMAA 抗锯齿'
          : '点击开启 GTAO 环境光遮蔽 + HDR 辉光与 AgX 后处理管线',
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
      title: '枪械内部结构 3D 数字枪库',
      subtitle:
        '十一款世界名枪交互式陈列馆 · Google Gemini 中英研发史纪录片与全零件语音拆解导览',
      filterAria: '枪械类别筛选',
      categories: {
        all: '全部馆藏',
        assault: '突击/卡宾/无托',
        smg: '冲锋枪 / PDW',
        sniper: '狙击/反器材',
        pistol: '半自动手枪',
      },
      showcaseBtn: '产品宣传页',
      showcaseTitle: '打开项目官方宣传与架构展示主页',
      cartridgeLabBtn: '1:1 实弹剖视馆',
      cartridgeLabTitle:
        '打开 7 口径 SAAMI/CIP 1:1 实弹纵剖对比实验室：并排纵剖陈列 9×19mm 至 .50 BMG 弹道解剖与定量对比矩阵 (B)',
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
        '开启或关闭真实 2K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)',
      atlasBtn: '查看 PBR 贴图图集',
      atlasTitle: '检视并下载全部定制 2K WebP 材质贴图原图',
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
      rackAria: '枪库十一槽武器展架',
      rackTitle: '枪库武器陈列架 · 11-BAY WEAPON VAULT RACK',
      rackTip: '单击卡片切换展台预览 · 再次点击或点蓝字进入 3D 拆解台',
      scrollLeft: '向左滚动查看槽位',
      scrollRight: '向右滚动查看槽位',
      previewingBadge: '预览中',
      plannedBadge: '待接入',
      partsNodeSuffix: (n) => `${n} 零件节点`,
      cardEnterCta: '进入 3D 内部拆解与发射演示',
      plannedToast: (name) =>
        `「${name}」模块正在接入中，当前可预览并拆解已入库枪械`,
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
        '开启/关闭真实 2K 5通道 PBR 材质贴图 (Albedo + Normal + Packed ORM)',
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
      cartridgeChipTitle:
        '打开 7 口径 SAAMI/CIP 1:1 实弹纵剖对比实验室 (B)',
      edgesChip: 'CAD 描边',
      edgesChipTitle: '开启/关闭工业 CAD 硬边轮廓线 (E)',
      labelsChip: '零件标签',
      labelsChipTitle: (n) => `显示全部 ${n} 个零件的 3D 空间编号引出签 (L)`,
      sfxChip: '机械声效',
      sfxChipTitle: (muted) =>
        muted
          ? '军械机械咬合与实弹声场已静音，点击开启 (M)'
          : '开启/静音 Web Audio 军械机械咬合声与 7 口径实弹声场 (M)',
      resetChip: '复位',
      resetChipTitle: '重置回默认合拢态与标准视角 (R)',
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
      sfxTitle: '开启/静音立体声卷积混响与 7 口径实弹合成声效 (M)',
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
      pendingDesc:
        '请检查本地静态资源服务是否正常运行（全部 11 款馆藏名枪的四幕研发故事、278 枚零件双语讲解与 644 段 Google Gemini TTS 语音均已内置于 public/ 目录）。',
      switchToAk15Btn: '切换至 AK-15M1 研发故事档案',
      aiAttribution:
        '文本与语音由 Google Gemini 3.8 Flash & Gemini TTS 基于 1:1 军械测绘参数生成',
    },
    engineeringTint: {
      badge: 'WP-05 · 机械职能语义分色',
      closeTitle: '关闭机械原理分色视图 (T)',
      filterHint: '点击图例单独聚光该类机构 · 再次点击恢复全彩',
      showAllBtn: '全显',
      gasFlowToggle: '高压燃气流线',
      gasFlowToggleTitle:
        '在发射演示模式下动态显示膛内燃气膨胀与导气分流轨迹',
      liveGasCta: '切至发射看导气',
    },
    fieldStrip: {
      badge: 'WP-07 · 军械教范引导拆装',
      phaseStrip: '拆解阶段',
      phaseReassemble: '逆序复装',
      progressLabel: (done, total) => `已拆 ${done} / ${total} 步`,
      hintBtn: '提示下一步',
      hintTitle:
        '在 3D 视口中以翠绿脉冲高亮当前符合军械教范的下一步待操作部件',
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
    },
    malfunction: {
      badge: 'WP-09 · 经典枪械故障剖视排障室',
      progressLabel: (done, total) => `排障进度 ${done} / ${total}`,
      nextStepBtn: '执行下一步排障',
      nextStepTitle: '按标准军械排障教范执行当前步骤并同步驱动 3D 枪机/弹匣动作',
      resetDrillBtn: '复现故障定格',
      resetDrillTitle: '重置回该故障初始卡阻定格帧以便重新观察或实操排障',
      exitBtn: '退出排障室',
      exitTitle: '退出故障剖视排障模式并返回正常发射演示 (J)',
      rootCauseLabel: '机械卡阻成因：',
      safetyNoteLabel: '军械安全规范：',
      drillStepsAria: '标准排障步骤序列',
      click3dHint: '可直接点击 3D 高亮运动件（套筒/拉机柄/弹匣）或下方按钮逐步排障',
      clearedTitle: '故障已彻底排除 · 新弹已推入膛内完全闭锁！',
      clearedDesc:
        '卡阻弹壳与供弹干涉已按标准军械教范清除，闭锁突笋恢复 100% 啮合，可切换其他故障继续演练。',
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
    },
    cartridgeLab: {
      badge: 'WP-06 · SAAMI / CIP 1:1 实弹纵剖馆',
      title: '七大口径实弹 1:1 纵剖对比实验室',
      subtitle:
        '严格遵循 1 单位 = 10mm 绝对比例并排纵剖陈列 · 直视发射药柱、三脚底火砧座、双芯钢穿甲锥与枪口动能跨度',
      backVaultBtn: '返回数字枪库',
      backVaultTitle: '返回 3D 数字枪库武器展厅 (Esc / B)',
      lineupBtn: '1:1 七弹同框全景',
      lineupTitle: '拉远镜头以 1:1 绝对比例同屏并排对比全部 7 款口径实弹',
      focusSpecimenBtn: '微距聚焦当前弹种',
      focusSpecimenTitle: '推近镜头微距检视当前选中实弹的底火砧座与弹芯纵剖面',
      cutawayOn: '180° 纵剖已开启 [C]',
      cutawayOff: '切换全壳外观 [C]',
      cutawayTitle: '切换 180° 轴向纵剖切面与完整黄铜弹壳外观 (C)',
      edgesBtn: 'CAD 轮廓线',
      edgesTitle: '开启或关闭实弹几何硬边 CAD 轮廓描边',
      matrixToggleOpen: '定量对比总表',
      matrixToggleClose: '收起对比总表',
      matrixToggleTitle: '展开或收起 7 大口径装药量、膛压、初速与枪口动能定量对比矩阵表',
      explodeLabel: '弹体结构轴向分解',
      explodeReset: '复位合拢',
      caliberSelectorAria: '馆藏七大口径实弹切换栏',
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
      tableCaption:
        'SAAMI / CIP / NATO 七大馆藏口径实弹 1:1 几何尺寸与内弹道定量对比矩阵',
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
        '打开典藏级军事宣传图册印前工坊：生成 8 页 A4 高清 3D 剖视、爆炸编号总图、内弹道曲线与军械教范画册 (Ctrl/Cmd + P)',
      plaqueCtaMain: '印制典藏级军事宣传图册 (A4 画册 / 矢量 PDF)',
      plaqueCtaSub: '8 页防务专刊 · 5 幅 3D 影棚冲印 · 爆炸标号总图 · 内弹道与快拆教范',
      studioBadge: 'ORDNANCE MONOGRAPH PRINT STUDIO',
      studioTitle: '典藏级军事宣传图册 · 印前排版与冲印工坊',
      studioSub:
        '实时离屏冲印 5 幅 1920×1200 影棚级 PBR/剖视图版 + 纯矢量爆炸标引、SAAMI 内弹道与军械教范',
      weaponSelectAria: '选择要印制图册的馆藏枪械',
      editionObsidian: '黑金典藏画册版',
      editionObsidianTip:
        'Vickers Guide / 防务展奢华暗调画册风格，最适合导出高清 PDF 收藏或铜版相纸满版彩印',
      editionBlueprint: '军工蓝图省墨版',
      editionBlueprintTip:
        'ISO 128 / 军械师原厂白底工程制图风格，节省约 90% 黑色墨粉，最适合家用/办公激光与喷墨打印',
      mode8p: '8 页全本典藏刊',
      mode4p: '4 页战术精粹版',
      callsignLabel: '收藏署名',
      callsignPlaceholder: '输入收藏者呼号/姓名（印入图签）',
      reshootBtn: '重拍图版',
      reshootTitle: '重新执行 5 镜头 WebGL 离屏高清渲染采样',
      printCta: '打印图册 / 导出典藏 PDF',
      printCapturingCta: (done, total) => `正在冲印图版 (${done}/${total})…`,
      printHint:
        '提示：在系统打印窗口建议选择「A4 纵向 · 边距：无」，勾选「背景图形（Background graphics）」即可输出无白边矢量画册。',
      closeTitle: '关闭图册印前工坊 (Esc)',
      capturingTitle: (tag, done, total) =>
        `正在离屏冲印 ${tag} 1920×1200 军械影棚图版 (${done} / ${total})`,
      capturingSub:
        '正在执行 2K 5 通道 PBR 光照、Stencil 45° 实心金属剖切与全零件矢量标引投影…',
      seriesHeader: 'DIGITAL ARMORY 3D · 典藏级轻武器防务技术专刊',
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
      secBallisticsSub:
        '膛压 P(t) 与膛内初速 V(t) 双轴定量曲线 · 1:1 制式弹药半剖尺寸图与馆藏七口径动能天梯',
      chartPressureTitle: 'FIG 6.1 · 击发膛压 P(t) [MPa] 与弹头初速 V(t) [m/s] 耦合曲线',
      chartCartridgeTitle: 'FIG 6.2 · 配用制式实弹 1:1 半剖结构与装药参数',
      energyLadderTitle: '馆藏 7 大制式口径枪口动能横向标尺 (J)',
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
          ? 'GTAO Sub-mm Contact Ambient Occlusion + Selective HDR Bloom + AgX Tone Mapping + SMAA active'
          : 'Enable GTAO Contact Ambient Occlusion + HDR Bloom & AgX PostFX pipeline',
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
      title: '3D Digital Firearm Armory & Cutaway Vault',
      subtitle:
        '11 Iconic World Firearms · Google Gemini R&D Documentary & Component-by-Component Voice Disassembly',
      filterAria: 'Filter firearms by category',
      categories: {
        all: 'All Vault',
        assault: 'Rifle / Carbine',
        smg: 'SMG / PDW',
        sniper: 'Sniper / Anti-Materiel',
        pistol: 'Service Pistol',
      },
      showcaseBtn: 'Showcase',
      showcaseTitle: 'Open official product & engineering showcase page',
      cartridgeLabBtn: '1:1 Cartridge Lab',
      cartridgeLabTitle:
        'Open 7-Caliber SAAMI/CIP 1:1 Cartridge Cutaway Lab: side-by-side cutaway anatomy & quantitative ballistics from 9×19mm to .50 BMG (B)',
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
      plaqueStoryCta: 'Listen to Full R&D Story (EN / 中文)',
      plaqueStorySub: '4-Act Documentary · Key Breakthroughs · 3D Part Focus',
      plaquePrimaryCta: (tag) => `Enter ${tag} 3D Disassembly & Firing`,
      pbrOn: '2K PBR Textures: ON',
      pbrOff: '2K PBR Textures: OFF',
      pbrTitle:
        'Toggle 2K 5-channel PBR textures (Albedo + Normal + Packed ORM)',
      atlasBtn: 'Inspect PBR Atlas',
      atlasTitle: 'Inspect & download custom 2K WebP PBR texture maps',
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
      rackAria: '11-Bay Weapon Vault Rack',
      rackTitle: '11-BAY WEAPON VAULT RACK · INTERACTIVE COLLECTION',
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
        'Toggle 2K 5-channel PBR textures (Albedo + Normal + Packed ORM)',
      atlasChip: 'Atlas',
      atlasChipTitle: 'Open 2K PBR Texture Atlas Inspector',
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
      cartridgeChipTitle:
        'Open 7-Caliber SAAMI/CIP 1:1 Cartridge Cutaway Lab (B)',
      edgesChip: 'CAD Edges',
      edgesChipTitle: 'Toggle industrial CAD hard-edge wireframe overlay (E)',
      labelsChip: 'Callouts',
      labelsChipTitle: (n) =>
        `Toggle 3D leader callouts for all ${n} parts (L)`,
      sfxChip: 'Mech SFX',
      sfxChipTitle: (muted) =>
        muted
          ? 'Gunsmith mechanical & ballistic SFX muted — click to unmute (M)'
          : 'Toggle Web Audio gunsmith mechanical clicks & 7-caliber ballistic SFX (M)',
      resetChip: 'Reset',
      resetChipTitle:
        'Reset to 0% assembled state & default isometric camera (R)',
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
      sfxTitle:
        'Toggle stereo convolution IR & 7-caliber waveguide ballistic Web Audio SFX (M)',
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
      pendingDesc:
        'Please verify your static asset server is reachable. Full 4-act R&D documentaries, 278 component breakdowns, and 644 Google Gemini TTS voiceovers across all 11 vault firearms are bundled under public/.',
      switchToAk15Btn: 'Switch to AK-15M1 R&D Archive',
      aiAttribution:
        'Authored & voiced with Google Gemini 3.8 Flash & Gemini TTS grounded in 1:1 CAD specs',
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
    },
    cartridgeLab: {
      badge: 'WP-06 · SAAMI / CIP 1:1 CARTRIDGE CUTAWAY LAB',
      title: '7-Caliber 1:1 SAAMI Cartridge Cutaway Lab',
      subtitle:
        'True 1:1 side-by-side longitudinal cutaways (1 unit = 10 mm) · Compare propellant charge columns, Boxer anvils, dual-core penetrators & muzzle energy',
      backVaultBtn: 'Return to Vault',
      backVaultTitle: 'Return to 3D Digital Armory Vault (Esc / B)',
      lineupBtn: '1:1 Full 7-Caliber Lineup',
      lineupTitle:
        'Frame all 7 cartridges side-by-side at exact 1:1 physical scale',
      focusSpecimenBtn: 'Macro Specimen Focus',
      focusSpecimenTitle:
        'Zoom into the active cartridge cutaway to inspect primer anvil & bullet core',
      cutawayOn: '180° Cutaway: ON [C]',
      cutawayOff: 'Full Brass Case [C]',
      cutawayTitle:
        'Toggle 180° longitudinal cross-section cutaway vs intact cartridge case (C)',
      edgesBtn: 'CAD Edges',
      edgesTitle: 'Toggle crisp CAD hard-edge wireframe on cartridge anatomy',
      matrixToggleOpen: 'Quantitative Matrix',
      matrixToggleClose: 'Hide Matrix',
      matrixToggleTitle:
        'Toggle 7-caliber quantitative comparison table (dimensions, charge, pressure & energy)',
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
      tableCaption:
        'SAAMI / CIP / NATO 7-Caliber 1:1 Dimensional & Internal Ballistics Comparison Matrix',
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
      entryChip: 'Monograph',
      entryChipTitle:
        'Open Collector Military Monograph Print Studio: generate an 8-page A4 folio with 3D studio plates, vector-pinned exploded blueprint, ballistics & armorer manual (Ctrl/Cmd + P)',
      plaqueCtaMain: 'Print Collector Military Monograph (A4 Folio / Vector PDF)',
      plaqueCtaSub: '8-Page Defense Folio · 5 Studio 3D Plates · Pinned Exploded Blueprint · Ballistics & Field-Strip',
      studioBadge: 'ORDNANCE MONOGRAPH PRINT STUDIO',
      studioTitle: 'Collector Military Monograph · Pre-Press & Darkroom Studio',
      studioSub:
        'Offscreen 1920×1200 2K PBR & Stencil cutaway plates + infinite-DPI vector BOM callouts, SAAMI ballistics & armorer manual',
      weaponSelectAria: 'Select firearm for monograph printing',
      editionObsidian: 'Obsidian Collector Folio',
      editionObsidianTip:
        'Vickers Guide / Defense-catalog dark luxury aesthetic — ideal for PDF archiving or full-bleed matte photo paper',
      editionBlueprint: 'Ordnance Blueprint (Ink-Saver)',
      editionBlueprintTip:
        'ISO 128 / TM 9-1005 archival light blueprint layout — saves ~90% black ink/toner on home and office printers',
      mode8p: '8-Page Full Monograph',
      mode4p: '4-Page Tactical Brief',
      callsignLabel: 'Collector Stamp',
      callsignPlaceholder: 'Callsign / Collector Name (stamped on folio)',
      reshootBtn: 'Re-Shoot Plates',
      reshootTitle: 'Re-render all 5 offscreen 1920×1200 WebGL studio plates',
      printCta: 'Print Booklet / Export Vector PDF',
      printCapturingCta: (done, total) => `Developing Plates (${done}/${total})…`,
      printHint:
        'Print Tip: Select "A4 Portrait · Margins: None" and enable "Background graphics" in your browser print dialog for full-bleed vector output.',
      closeTitle: 'Close Monograph Print Studio (Esc)',
      capturingTitle: (tag, done, total) =>
        `Developing ${tag} 1920×1200 Studio Plates (${done} / ${total})`,
      capturingSub:
        'Computing 2K 5-channel PBR reflections, ISO 128 Stencil cross-sections & vector BOM callout projections…',
      seriesHeader: 'DIGITAL ARMORY 3D · ORDNANCE ENGINEERING MONOGRAPH SERIES',
      editionStampObsidian: 'COLLECTOR DARK FOLIO · LIMITED ARCHIVE EDITION',
      editionStampBlueprint: 'ISO 128 ORDNANCE TECHNICAL MANUAL · INK-SAVER',
      coverMonographTag: '1:1 MECHANICAL & INTERNAL BALLISTICS DOSSIER',
      coverScaleTag: 'CAD DATUM 1:1 · UNIT mm',
      coverCollectorLabel: 'ISSUED TO / ARMORER',
      coverDefaultCollector: 'DIGITAL ARMORY ARCHIVE EDITION',
      coverHighlightsHeading: 'KEY ORDNANCE ENGINEERING ATTRIBUTES',
      secChronicleI: 'CHAPTER 01 · DOCTRINAL ORIGINS & R&D GENESIS',
      secChronicleISub: 'Operational Trials, Procurement Mandates & Material Metallurgy Evolution',
      secMilestonesHeading: 'CHRONOLOGICAL SERVICE MILESTONES',
      secChronicleII: 'CHAPTER 02 · PRODUCTION ARCHITECTURE & CORE BREAKTHROUGHS',
      secChronicleIISub: 'Operating Kinematics, Breech Locking Margin & Combat Refinement',
      secBreakthroughsHeading: 'THREE DEFINING MECHANICAL BREAKTHROUGHS',
      plateBreechCaption:
        'FIG 2.1 · Macro X-Ray Engagement Plate: Locking Lugs, Barrel Extension & Fire-Control Sear Interface',
      secCutawayRoles: 'CHAPTER 03 · SOLID LONGITUDINAL CUTAWAY & 6-ROLE ANATOMY',
      secCutawayRolesSub:
        'ISO 128 45° Hatched Solid Section Cut · Six Functional Subsystem Roles & 7-Phase Kinematic Sequence',
      plateStencilCaption:
        'FIG 3.1 · Two-Pass WebGL Stencil Longitudinal Section Cutaway (Bore Rifling, Gas Manifold, Breech Lock & Feed Path)',
      plateRolesCaption:
        'FIG 3.2 · 34% Semi-Exploded Six-Role Functional Classification Plate (Locking / Gas / Carrier / FCG / Springs / Housing)',
      secCycle7Heading: '7-PHASE OPERATING KINEMATIC SEQUENCE',
      secExplodedPlate: 'CHAPTER 04 · FULL 100% EXPLODED ORDNANCE BLUEPRINT PLATE',
      secExplodedPlateSub:
        'Collision-Free Staged Disassembly · Dual-Rail Vector BOM Callout Pins (Infinite-DPI Scalable Wall Poster)',
      explodedLegendNote:
        'Callout Palette: Cyan = Slide/Carrier Group · Emerald = Barrel/Receiver · Rose = Fire-Control Group · Amber = Magazine Feed',
      secBomLedger: 'CHAPTER 05 · COMPLETE BILL OF MATERIALS & METALLURGY LEDGER',
      secBomLedgerSub: (partsCount, tris) =>
        `${partsCount} Parametric Manifold CSG Nodes · ${tris} Total Triangles · Live 1:1 Millimeter Bounding Envelopes`,
      bomColCode: 'Code',
      bomColComponent: 'Component Designation (EN / 中文)',
      bomColMaterial: 'Ordnance Metallurgy & Finish',
      bomColEnvelope: '1:1 Envelope (L×H×W)',
      bomColPrinciple: 'Mechanical Function & Mating Interface',
      secBallistics: 'CHAPTER 06 · 1:1 SAAMI CARTRIDGE CUTAWAY & INTERNAL BALLISTICS',
      secBallisticsSub:
        'Coupled Chamber Pressure P(t) & Bore Velocity V(t) Curves · 1:1 Half-Section Schematic & 7-Caliber Energy Ladder',
      chartPressureTitle: 'FIG 6.1 · Coupled Chamber Pressure P(t) [MPa] & Bore Velocity V(t) [m/s]',
      chartCartridgeTitle: 'FIG 6.2 · 1:1 Service Cartridge Half-Section & Propellant Spec',
      energyLadderTitle: '7-Caliber Vault Muzzle Kinetic Energy Scale (J)',
      secArmorerManual: 'CHAPTER 07 · FIELD-STRIP DAG, STOPPAGE DRILLS & COLOPHON',
      secArmorerManualSub:
        'Directed Topological Field-Strip Procedure, Mechanical Interference Locks, Four Clearing Drills & QR Deep-Link',
      fieldStripHeading: 'AUTHORIZED FIELD-STRIP SEQUENCE (DAG)',
      interferencePrefix: 'Interference Lock: ',
      malfunctionsHeading: 'FOUR CANONICAL STOPPAGE & SAFETY DIAGNOSTICS',
      backSealBadge: 'AUTHENTICATED DIGITAL ARMORY MONOGRAPH',
      backSealTitle: 'Digital Armory 3D · 1:1 Engineering Certificate Seal',
      backQrTitle: 'Scan for Live 3D Disassembly & Voice Documentary',
      backQrSub:
        'Scan this vector QR code with your phone camera to launch interactive 3D cutaway inspection, guided field-strip, and bilingual voiceover directly in your browser.',
      backColophon:
        'All 3D PBR/cutaway plates, millimeter envelopes, and ballistic curves in this monograph are synthesized in real time by Digital Armory 3D · Educational mechanical history edition; contains zero manufacturing tolerances.',
      footerPage: (idx, total) =>
        `PAGE ${String(idx).padStart(2, '0')} / ${String(total).padStart(2, '0')}`,
    },
  },
};

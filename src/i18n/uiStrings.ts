import type { LanguageCode } from '../narration/types';
import type {
  ArmoryCategory,
  CameraPresetType,
  MaterialKind,
} from '../weapons/types';

export interface UiDictionary {
  watermark: string;
  langToggleTitle: string;
  armory: {
    title: string;
    subtitle: string;
    filterAria: string;
    categories: Record<ArmoryCategory, string>;
    showcaseBtn: string;
    showcaseTitle: string;
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
    edgesChip: string;
    edgesChipTitle: string;
    labelsChip: string;
    labelsChipTitle: (count: number) => string;
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
    modeFiring: string;
    speeds: Record<'0.25' | '0.5' | '1', string>;
    loopOn: string;
    loopOff: string;
    loopTitle: string;
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
    playFullStory: string;
    pauseStory: string;
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
}

export const UI_STRINGS: Record<LanguageCode, UiDictionary> = {
  zh: {
    watermark:
      '1:1 精密机械结构与 5 通道 ORM 物理材质还原 · Google Gemini 中英双语研发故事与零件语音导览',
    langToggleTitle: '一键切换全站中英文讲解与语音导览 (中文 / English)',
    armory: {
      title: '枪械内部结构 3D 数字枪库',
      subtitle:
        '十款世界名枪交互式陈列馆 · Google Gemini 中英研发史纪录片与全零件语音拆解导览',
      filterAria: '枪械类别筛选',
      categories: {
        all: '全部馆藏',
        assault: '突击/卡宾/无托',
        smg: '冲锋枪',
        sniper: '狙击/反器材',
        pistol: '半自动手枪',
      },
      showcaseBtn: '产品宣传页',
      showcaseTitle: '打开项目官方宣传与架构展示主页',
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
        '沿纵向中轴切开外层机匣/套筒/弹匣右侧壳体，原色直视内部膛线、闭锁突笋与实弹供弹机构 (C)',
      stageHint: '拖拽检视 · 单击枪体直达分解',
      rackAria: '枪库十槽武器展架',
      rackTitle: '枪库武器陈列架 · 10-BAY WEAPON VAULT RACK',
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
        '沿纵向中轴切开外层机匣/套筒/弹匣右侧壳体，原色直视内部膛线、闭锁突笋与实弹供弹机构 (C)',
      edgesChip: 'CAD 描边',
      edgesChipTitle: '开启/关闭工业 CAD 硬边轮廓线 (E)',
      labelsChip: '零件标签',
      labelsChipTitle: (n) => `显示全部 ${n} 个零件的 3D 空间编号引出签 (L)`,
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
      closeTitle: '关闭详情 (Esc)',
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
      modeFiring: '子弹动态发射流程演示',
      speeds: {
        '0.25': '0.25x 超慢',
        '0.5': '0.5x 慢放',
        '1': '1.0x 标准',
      },
      loopOn: '连续循环',
      loopOff: '单发停止',
      loopTitle: '切换连续循环击发或单发停止',
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
      closeTitle: '关闭研发故事抽屉 (Esc)',
      playFullStory: '连播四幕研发纪录片',
      pauseStory: '暂停纪录片旁白',
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
        '请检查本地静态资源服务是否正常运行（全部 10 款馆藏名枪的四幕研发故事、253 枚零件双语讲解与 586 段 Google Gemini TTS 语音均已内置于 public/ 目录）。',
      switchToAk15Btn: '切换至 AK-15M1 研发故事档案',
      aiAttribution:
        '文本与语音由 Google Gemini 3.8 Flash & Gemini TTS 基于 1:1 军械测绘参数生成',
    },
  },
  en: {
    watermark:
      '1:1 Precision Mechanical CAD & 5-Channel ORM PBR · Google Gemini Bilingual R&D Story & Part Voice Guide',
    langToggleTitle:
      'Switch language & voice narration between Chinese and English',
    armory: {
      title: '3D Digital Firearm Armory & Cutaway Vault',
      subtitle:
        '10 Iconic World Firearms · Google Gemini R&D Documentary & Component-by-Component Voice Disassembly',
      filterAria: 'Filter firearms by category',
      categories: {
        all: 'All Vault',
        assault: 'Rifle / Carbine',
        smg: 'SMG',
        sniper: 'Sniper / Anti-Materiel',
        pistol: 'Service Pistol',
      },
      showcaseBtn: 'Showcase',
      showcaseTitle: 'Open official product & engineering showcase page',
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
        'Slice outer receiver/slide/magazine along centerline to inspect rifling, lugs & feed path (C)',
      stageHint: 'Drag to orbit · Click firearm to enter workbench',
      rackAria: '10-Bay Weapon Vault Rack',
      rackTitle: '10-BAY WEAPON VAULT RACK · INTERACTIVE COLLECTION',
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
        'Longitudinal centerline cutaway revealing chamber, rifling & lockup (C)',
      edgesChip: 'CAD Edges',
      edgesChipTitle: 'Toggle industrial CAD hard-edge wireframe overlay (E)',
      labelsChip: 'Callouts',
      labelsChipTitle: (n) =>
        `Toggle 3D leader callouts for all ${n} parts (L)`,
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
      closeTitle: 'Close part inspector (Esc)',
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
      modeFiring: 'Dynamic Firing Cycle',
      speeds: {
        '0.25': '0.25x Ultra-Slow',
        '0.5': '0.5x Slow-Mo',
        '1': '1.0x Normal',
      },
      loopOn: 'Loop Cycle',
      loopOff: 'Single Cycle',
      loopTitle: 'Toggle continuous loop vs single-cycle stop',
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
      closeTitle: 'Close R&D Story Drawer (Esc)',
      playFullStory: 'Play All 4 Acts',
      pauseStory: 'Pause Narration',
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
        'Please verify your static asset server is reachable. Full 4-act R&D documentaries, 253 component breakdowns, and 586 Google Gemini TTS voiceovers across all 10 vault firearms are bundled under public/.',
      switchToAk15Btn: 'Switch to AK-15M1 R&D Archive',
      aiAttribution:
        'Authored & voiced with Google Gemini 3.8 Flash & Gemini TTS grounded in 1:1 CAD specs',
    },
  },
};

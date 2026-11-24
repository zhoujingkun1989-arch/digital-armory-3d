import type { LanguageCode } from '../narration/types';
import {
  MUSEUM_BALLISTICS_PROFILE_COUNT,
  MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT,
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_HALL_COUNT,
  MUSEUM_HEAVY_ARMOR_COUNT,
  MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT,
  MUSEUM_ORDNANCE_COUNT,
  MUSEUM_PBR_SUITE_COUNT,
  MUSEUM_PBR_WEBP_COUNT,
  MUSEUM_SMALL_ARMS_CALIBER_COUNT,
  MUSEUM_TOTAL_PARTS,
} from '../weapons/museumMetrics';

export interface CommandPaletteStringBundle {
  trigger: {
    label: string;
    shortLabel: string;
    title: string;
    ariaLabel: string;
    kbdMac: string;
    kbdOther: string;
  };
  modal: {
    dialogAria: string;
    searchPlaceholder: string;
    clearAria: string;
    emptyTitle: string;
    emptyHint: string;
    resultsCount: (count: number) => string;
    activeWeaponContext: (label: string, partsCount: number) => string;
    activeBadge: string;
    onBadge: string;
    offBadge: string;
    groups: {
      weapons: string;
      parts: string;
      labs: string;
      actions: string;
    };
    footer: {
      navigate: string;
      execute: string;
      close: string;
      toggle: string;
    };
  };
  labs: {
    armoryTitle: string;
    armorySub: string;
    showcaseTitle: string;
    showcaseSub: string;
    cartridgesTitle: string;
    cartridgesSub: string;
    ballisticsTitle: string;
    ballisticsSub: string;
    showdownTitle: string;
    showdownSub: string;
    atlasTitle: string;
    atlasSub: string;
    posterTitle: string;
    posterSub: string;
    monographTitle: string;
    monographSub: string;
    storyTitle: string;
    storySub: string;
  };
  actions: {
    sectionCutTitle: string;
    sectionCutSub: string;
    xrayTitle: string;
    xraySub: string;
    wearCycleTitle: string;
    wearCycleSub: (currentLabel: string, nextLabel: string) => string;
    envVaultTitle: string;
    envVaultSub: string;
    envBenchTitle: string;
    envBenchSub: string;
    envDaylightTitle: string;
    envDaylightSub: string;
    fieldStripTitle: string;
    fieldStripSub: string;
    malfunctionTitle: string;
    malfunctionSub: string;
    caliperTitle: string;
    caliperSub: string;
    engineeringTintTitle: string;
    engineeringTintSub: string;
    firingModeTitle: string;
    firingModeSub: string;
    edgesTitle: string;
    edgesSub: string;
    labelsTitle: string;
    labelsSub: string;
    sfxTitle: string;
    sfxSub: string;
    hudHiddenTitle: string;
    hudHiddenSub: string;
    langSwitchTitle: string;
    langSwitchSub: string;
    resetAllTitle: string;
    resetAllSub: string;
  };
  sectionPlane: {
    barAria: string;
    label: string;
    sliderAria: string;
    depthTitle: string;
    flipRightLabel: string;
    flipLeftLabel: string;
    flipXForwardLabel: string;
    flipXBackwardLabel: string;
    flipYTopLabel: string;
    flipYBottomLabel: string;
    flipTitle: string;
    scanStartLabel: string;
    scanStopLabel: string;
    scanTitle: string;
    resetLabel: string;
    resetTitle: string;
    closeTitle: string;
    axisLabels: {
      z: string;
      x: string;
      y: string;
      box: string;
    };
    axisTitles: {
      z: string;
      x: string;
      y: string;
      box: string;
    };
    boxReadout: string;
    boxAxisX: string;
    boxAxisY: string;
    boxAxisZ: string;
    boxSpanLabel: string;
  };
  workbenchMenus: {
    studioBtnLabel: string;
    studioBtnTitle: string;
    studioPopoverAria: string;
    studioWearHeading: string;
    studioQualityHeading: string;
    studioPostFxHeading: string;
    studioPostFxDesc: string;
    toolsBtnLabel: string;
    toolsBtnTitle: string;
    toolsPopoverAria: string;
    toolsModesHeading: string;
    toolsLabsHeading: string;
    toolsVisualsHeading: string;
    showdownLabel: string;
    showdownTitle: string;
  };
}

export const COMMAND_PALETTE_STRINGS: Record<
  LanguageCode,
  CommandPaletteStringBundle
> = {
  zh: {
    trigger: {
      label: '快速检索',
      shortLabel: '搜索',
      title: `打开全局命令面板：秒搜 ${MUSEUM_EXHIBIT_COUNT} 款馆藏、${MUSEUM_TOTAL_PARTS} 零件、实验室与控制项 (Cmd/Ctrl+K)`,
      ariaLabel: '打开全局命令面板 (Cmd+K)',
      kbdMac: '⌘K',
      kbdOther: 'Ctrl K',
    },
    modal: {
      dialogAria: '全局命令面板',
      searchPlaceholder: `搜索 ${MUSEUM_EXHIBIT_COUNT} 款名枪、弓弩、1:1 主战坦克与航空重武、${MUSEUM_TOTAL_PARTS} 零件、实验室或快捷操作...`,
      clearAria: '清空搜索词',
      emptyTitle: '未找到匹配项',
      emptyHint:
        '试试输入型号（如 ZTZ-99A / M1A2 / Leopard 2A7V / Tiger 131 / GAU-8 / M1911 / K98k / MG 42）、口径（30mm / 125mm / 120mm / 88mm）、BOM 编号（如 B-03）或“重装甲 / 航空重武 / 剖视 / 外弹道 / 白昼”',
      resultsCount: (count) => `${count} 项结果`,
      activeWeaponContext: (label, partsCount) =>
        `当前展品：${label} · ${partsCount} 个零件`,
      activeBadge: '当前',
      onBadge: '已开启',
      offBadge: '已关闭',
      groups: {
        weapons: `馆藏展品（${MUSEUM_EXHIBIT_COUNT} 款）`,
        parts: '当前展品零件',
        labs: '展馆与工程实验室',
        actions: '快捷操作与视觉控制',
      },
      footer: {
        navigate: '选择',
        execute: '执行',
        close: '关闭',
        toggle: '唤出',
      },
    },
    labs: {
      armoryTitle: '数字枪库展厅',
      armorySub: `返回 ${MUSEUM_EXHIBIT_COUNT} 款馆藏 / ${MUSEUM_HALL_COUNT} 大展厅转台大厅（含 ${MUSEUM_HEAVY_ARMOR_COUNT} 款 1:1 主战坦克与 ${MUSEUM_ORDNANCE_COUNT} 款 30mm 航空重武）与流派筛选架`,
      showcaseTitle: '博物馆官方首页',
      showcaseSub: '返回旗舰宣传导览页与馆藏总览',
      cartridgesTitle: '1:1 实弹、航炮弹与坦克炮弹剖视对比实验室',
      cartridgesSub: `${MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT} 大口径（${MUSEUM_SMALL_ARMS_CALIBER_COUNT} 轻武器实弹 + ${MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT} 航炮与坦克主炮弹）绝对比例纵剖同台陈列`,
      ballisticsTitle: '1,000m 千米外弹道 DOPE 实验室与 3D 靶场',
      ballisticsSub: `${MUSEUM_BALLISTICS_PROFILE_COUNT} 套弹道档案 RK4 气动解算、1,000m 三维实弹靶场与第一像面 MIL 分划板`,
      showdownTitle: '自动原理流派谱系与同屏对照',
      showdownSub: '三轴机械流派矩阵与双展品内弹道曲线对比',
      atlasTitle: '2K/4K PBR 材质贴图图集检视器',
      atlasSub: `检视全馆 ${MUSEUM_PBR_SUITE_COUNT} 套图集 / ${MUSEUM_PBR_WEBP_COUNT} 张 2K/4K WebP Albedo / Normal / Packed ORM 通道贴图`,
      posterTitle: '高清 3D 剖视分享海报工坊',
      posterSub: '一键抓取实时 WebGL 画面合成 16:9 / 4:5 海报卡片',
      monographTitle: '收藏工程图鉴与儿童绘本打印工坊',
      monographSub: '离屏抓拍 17 图版并排版输出 A4 / Letter 打印版',
      storyTitle: '四幕研发史纪录片与 AI 语音导览',
      storySub: '打开当前展品四幕故事抽屉与 3D 导演自动运镜',
    },
    actions: {
      sectionCutTitle: '切换实时 CT 纵剖面视图',
      sectionCutSub: '开启/关闭 Stencil 实体金属剖切与可拖拽剖切面',
      xrayTitle: '切换外壳 X-Ray 透视模式',
      xraySub: '半透明化机匣与套筒以观察内部运动闭锁件',
      wearCycleTitle: '切换枪械表面磨损包浆',
      wearCycleSub: (currentLabel, nextLabel) =>
        `当前：${currentLabel} → 切换至：${nextLabel}`,
      envVaultTitle: '影棚光效：暗室展厅',
      envVaultSub: '深邃高对比度暗室棚拍与冷峻枪钢高光',
      envBenchTitle: '影棚光效：军械匠人台',
      envBenchSub: '暖钨丝顶光与氯丁橡胶拆枪垫工作台氛围',
      envDaylightTitle: '影棚光效：工程白昼蓝图',
      envDaylightSub: '明亮 CAD 工程白昼影棚与亮色蓝图主题 UI',
      fieldStripTitle: '切换军械师野战快拆与限时盲考',
      fieldStripSub: '按真实教范顺序亲手拆装或挑战 S/A/B/C 盲拆认证',
      malfunctionTitle: '切换经典故障剖视排障室',
      malfunctionSub: '模拟烟囱卡壳、双进弹、底火拒发与未闭锁阻断',
      caliperTitle: '切换 1:1 3D 军械游标卡尺',
      caliperSub: '毫米级拾取任意两点三维间距与全枪包络标尺',
      engineeringTintTitle: '切换 6 大机械职能语义分色',
      engineeringTintSub: '按闭锁、导气、枪机框、火控、弹簧、供弹着色',
      firingModeTitle: '切换 7 阶段动态击发仿真',
      firingModeSub: '实时演练闭锁、点火、开锁抛壳与复进上膛循环',
      edgesTitle: '切换 CAD 硬边线框轮廓',
      edgesSub: '叠加工程棱边轮廓线突出倒角与几何折面',
      labelsTitle: '切换 3D 零件引线编号标签',
      labelsSub: '显示或隐藏拆解视图中的建筑级细线引出标注',
      sfxTitle: '切换军械机械声效与实弹声场',
      sfxSub: '静音或恢复 Web Audio 金属咬合声与分口径枪声',
      hudHiddenTitle: '切换纯净无按钮展陈模式',
      hudHiddenSub: '隐藏全部 HUD 面板，专注全屏 3D 机械欣赏',
      langSwitchTitle: 'Switch to English (切换至英文界面)',
      langSwitchSub: '全站界面、命令面板、零件参数与语音导览切换为英文',
      resetAllTitle: '重置工作台视角与剖切深度',
      resetAllSub: '复原爆炸进度、剖切面居中 (0.0 mm) 与默认视角',
    },
    sectionPlane: {
      barAria: '实时 CT 剖切面深度控制条',
      label: 'CT 剖切面',
      sliderAria: '实时调节剖切面深度（毫米）',
      depthTitle: '当前剖切面相对基准轴的偏移深度',
      flipRightLabel: '+Z 右侧剖开',
      flipLeftLabel: '-Z 左侧剖开',
      flipXForwardLabel: '+X 前向剖开',
      flipXBackwardLabel: '-X 后向剖开',
      flipYTopLabel: '+Y 俯视剖开',
      flipYBottomLabel: '-Y 仰视剖开',
      flipTitle: '翻转当前剖切方向',
      scanStartLabel: '扫描',
      scanStopLabel: '停止',
      scanTitle: '自动平滑往返扫描整机内部横截面 (CT Scan)',
      resetLabel: '居中',
      resetTitle: '将剖切面重置回基准零位 (+0.0 mm)',
      closeTitle: '关闭实时剖视模式 [C]',
      axisLabels: {
        z: 'Z 纵剖',
        x: 'X 横切',
        y: 'Y 俯剖',
        box: '3D 切片框',
      },
      axisTitles: {
        z: 'Z 轴经典纵向对半剖切（机匣中轴 / 弹匣视窗）',
        x: 'X 轴横截面切片（垂直膛线与闭锁突笋锁合面）',
        y: 'Y 轴水平俯视剖切（俯瞰转盘装弹机、弹链与滑轮导轨）',
        box: '六面体 3D 局部切片盒（隔离检视任意三维机械区段）',
      },
      boxReadout: '3D 切片框',
      boxAxisX: 'X 前后',
      boxAxisY: 'Y 高度',
      boxAxisZ: 'Z 侧向',
      boxSpanLabel: '盒宽 ±',
    },
    workbenchMenus: {
      studioBtnLabel: '画面',
      studioBtnTitle: '调节表面磨损包浆、渲染画质与 GTAO/HDR 后处理',
      studioPopoverAria: '画面与影棚高级设置',
      studioWearHeading: '表面磨损包浆',
      studioQualityHeading: 'GPU 渲染画质档位',
      studioPostFxHeading: '电影级后处理管线',
      studioPostFxDesc: '半分辨率 GTAO 环境光遮蔽 + HDR 辉光 + AgX 色调映射',
      toolsBtnLabel: '实验室与工具',
      toolsBtnTitle: '展开更多实操模式、实验室入口与 CAD 视图开关',
      toolsPopoverAria: '工作台实验室与视图工具菜单',
      toolsModesHeading: '交互实操模式',
      toolsLabsHeading: '专题实验室与对照',
      toolsVisualsHeading: '材质与 CAD 叠加',
      showdownLabel: '流派对照',
      showdownTitle: '打开自动原理流派谱系与双展品同屏对照矩阵 [S]',
    },
  },
  en: {
    trigger: {
      label: 'Quick Search',
      shortLabel: 'Search',
      title: `Open Global Command Palette: search ${MUSEUM_EXHIBIT_COUNT} exhibits, ${MUSEUM_TOTAL_PARTS} parts, labs & actions (Cmd/Ctrl+K)`,
      ariaLabel: 'Open Global Command Palette (Cmd+K)',
      kbdMac: '⌘K',
      kbdOther: 'Ctrl K',
    },
    modal: {
      dialogAria: 'Global Command Palette',
      searchPlaceholder: `Search ${MUSEUM_EXHIBIT_COUNT} exhibits (firearms, archery, 1:1 MBTs & GAU-8/A), ${MUSEUM_TOTAL_PARTS} parts, labs, or quick controls...`,
      clearAria: 'Clear search query',
      emptyTitle: 'No matching results',
      emptyHint:
        'Try a model (ZTZ-99A, M1A2, Leopard 2A7V, Tiger 131, GAU-8/A, M1911, K98k, MG 42), caliber (30mm, 125mm, 120mm, 88mm), BOM code (B-03), or "Heavy Armor", "cutaway", "ballistics", "blueprint"',
      resultsCount: (count) =>
        `${count} ${count === 1 ? 'result' : 'results'}`,
      activeWeaponContext: (label, partsCount) =>
        `Active: ${label} · ${partsCount} parts`,
      activeBadge: 'Active',
      onBadge: 'ON',
      offBadge: 'OFF',
      groups: {
        weapons: `Museum Exhibits (${MUSEUM_EXHIBIT_COUNT})`,
        parts: 'Active Exhibit Parts',
        labs: 'Navigation & Engineering Labs',
        actions: 'Quick Actions & Visual Controls',
      },
      footer: {
        navigate: 'Navigate',
        execute: 'Select',
        close: 'Close',
        toggle: 'Toggle',
      },
    },
    labs: {
      armoryTitle: 'Digital Armory Vault',
      armorySub: `Return to the ${MUSEUM_EXHIBIT_COUNT}-exhibit / ${MUSEUM_HALL_COUNT}-hall turntable vault (incl. ${MUSEUM_HEAVY_ARMOR_COUNT} 1:1 MBTs & ${MUSEUM_ORDNANCE_COUNT} 30mm GAU-8/A) & category rack`,
      showcaseTitle: 'Museum Showcase Home',
      showcaseSub: 'Return to the flagship museum landing overview',
      cartridgesTitle: '1:1 Cartridge, Aero Cannon & Tank Ordnance Cutaway Lab',
      cartridgesSub: `Compare all ${MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT} calibers (${MUSEUM_SMALL_ARMS_CALIBER_COUNT} small-arms + ${MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT} aero & tank cannon rounds) at true 1:1 scale`,
      ballisticsTitle: '1,000m External Ballistics DOPE Lab & 3D Range',
      ballisticsSub: `${MUSEUM_BALLISTICS_PROFILE_COUNT} RK4 3-DOF ballistic profiles, 3D 1,000m firing range & FFP MIL reticle`,
      showdownTitle: 'Mechanism Showdown Matrix',
      showdownSub: '3-axis action taxonomy & side-by-side internal ballistics comparison',
      atlasTitle: '2K/4K PBR Texture Atlas Inspector',
      atlasSub: `Inspect all ${MUSEUM_PBR_SUITE_COUNT} suites / ${MUSEUM_PBR_WEBP_COUNT} 2K/4K WebP Albedo, Normal & Packed ORM channels`,
      posterTitle: 'HD 3D Cutaway Share Poster Studio',
      posterSub: 'Capture live WebGL canvas into 16:9 or 4:5 collector cards',
      monographTitle: 'Collector Monograph & Kids Print Studio',
      monographSub: 'Capture 17 orthographic/3D plates into printable A4 / Letter layouts',
      storyTitle: '4-Act R&D Documentary & AI Voice Guide',
      storySub: 'Open exhibit history drawer with automated 3D director camera',
    },
    actions: {
      sectionCutTitle: 'Toggle Live CT-Scan Cutaway',
      sectionCutSub: 'Enable solid hatched Stencil cross-section with live depth slider',
      xrayTitle: 'Toggle X-Ray Housing Transparency',
      xraySub: 'Make outer receivers & slides translucent to expose internal lockup',
      wearCycleTitle: 'Cycle Service Wear Patina',
      wearCycleSub: (currentLabel, nextLabel) =>
        `Current: ${currentLabel} -> Next: ${nextLabel}`,
      envVaultTitle: 'Studio Lighting: Tactical Vault',
      envVaultSub: 'High-contrast dark gallery lighting with crisp gunmetal speculars',
      envBenchTitle: 'Studio Lighting: Gunsmith Bench',
      envBenchSub: 'Warm tungsten overhead bench lighting on neoprene takedown mat',
      envDaylightTitle: 'Studio Lighting: Blueprint Daylight',
      envDaylightSub: 'Bright CAD daylight studio paired with crisp light blueprint UI',
      fieldStripTitle: 'Toggle Field-Strip & Blind Armorer Exam',
      fieldStripSub: 'Disassemble by authentic manual sequence or take S/A/B/C blind test',
      malfunctionTitle: 'Toggle Malfunction Cutaway Diagnostics',
      malfunctionSub: 'Inspect Stovepipe, Double Feed, Light Strike & Out-of-Battery',
      caliperTitle: 'Toggle 1:1 3D Armorer Vernier Caliper',
      caliperSub: 'Measure millimeter surface-to-surface spans & full envelope rulers',
      engineeringTintTitle: 'Toggle 6-Role Engineering Functional Tint',
      engineeringTintSub: 'Color-code locking, gas drive, carrier, FCG, springs & feed parts',
      firingModeTitle: 'Toggle 7-Stage Live Firing Simulation',
      firingModeSub: 'Animate lockup, ignition, extraction, ejection & reset cycle',
      edgesTitle: 'Toggle CAD Hard-Edge Wireframe',
      edgesSub: 'Overlay machined chamfer creases and silhouette edges',
      labelsTitle: 'Toggle 3D Part Leader Callouts',
      labelsSub: 'Show or hide architectural hairline part numbers in explode view',
      sfxTitle: 'Toggle Mechanical Foley & Ballistic Audio',
      sfxSub: 'Mute or restore Web Audio steel clicks and caliber soundscapes',
      hudHiddenTitle: 'Toggle Clean Showcase Mode (Hide UI)',
      hudHiddenSub: 'Hide all HUD panels for an unobstructed fullscreen 3D view',
      langSwitchTitle: 'Switch Language to Chinese (ZH)',
      langSwitchSub: 'Switch all menus, search labels, specs & voiceovers to Chinese',
      resetAllTitle: 'Reset Workbench View & Section Plane',
      resetAllSub: 'Restore assembled pose, center CT plane (+0.0 mm) & default camera',
    },
    sectionPlane: {
      barAria: 'Live CT-Scan section plane depth control',
      label: 'CT Section',
      sliderAria: 'Adjust live section plane depth in millimeters',
      depthTitle: 'Current section plane offset along active axis',
      flipRightLabel: '+Z Right Cut',
      flipLeftLabel: '-Z Left Cut',
      flipXForwardLabel: '+X Fore Cut',
      flipXBackwardLabel: '-X Aft Cut',
      flipYTopLabel: '+Y Top Cut',
      flipYBottomLabel: '-Y Bottom Cut',
      flipTitle: 'Flip active cutaway direction',
      scanStartLabel: 'Sweep',
      scanStopLabel: 'Stop',
      scanTitle: 'Smoothly sweep the CT section plane back and forth through the mechanism',
      resetLabel: 'Center',
      resetTitle: 'Reset section plane to datum (+0.0 mm)',
      closeTitle: 'Exit live cutaway mode [C]',
      axisLabels: {
        z: 'Z Long.',
        x: 'X Cross',
        y: 'Y Top',
        box: '3D Box',
      },
      axisTitles: {
        z: 'Z-axis longitudinal cutaway along bore and receiver centerline',
        x: 'X-axis transverse cross-section slicing across chamber & locking lugs',
        y: 'Y-axis horizontal plan cutaway exposing feedways, pulleys & carousels',
        box: '6-plane 3D Slice Box isolating any sub-volume of the assembly',
      },
      boxReadout: '3D Slice Box',
      boxAxisX: 'X Bore',
      boxAxisY: 'Y Elev',
      boxAxisZ: 'Z Side',
      boxSpanLabel: 'Span ±',
    },
    workbenchMenus: {
      studioBtnLabel: 'Display',
      studioBtnTitle: 'Adjust surface wear patina, render quality & GTAO/HDR post-processing',
      studioPopoverAria: 'Display & studio rendering settings',
      studioWearHeading: 'Service Wear Patina',
      studioQualityHeading: 'GPU Render Quality',
      studioPostFxHeading: 'Cinematic Post-Processing',
      studioPostFxDesc: 'Half-res GTAO ambient occlusion + HDR bloom + AgX tonemapping',
      toolsBtnLabel: 'Labs & Tools',
      toolsBtnTitle: 'Open interactive modes, engineering labs & CAD overlays',
      toolsPopoverAria: 'Workbench labs and tools menu',
      toolsModesHeading: 'Interactive Modes',
      toolsLabsHeading: 'Museum Labs & Showdown',
      toolsVisualsHeading: 'Material & CAD Overlays',
      showdownLabel: 'Showdown',
      showdownTitle: 'Open Mechanism Showdown taxonomy & comparison matrix [S]',
    },
  },
};

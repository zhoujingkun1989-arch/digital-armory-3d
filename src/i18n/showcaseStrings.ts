import type { LanguageCode } from '../narration/types';
import type { ArmoryCategory, WeaponId } from '../weapons/types';

export type ShowcaseGalleryAction =
  | 'armory'
  | 'explode'
  | 'firing'
  | 'section'
  | 'atlas';

export interface ShowcaseGalleryItemCopy {
  id: string;
  badge: string;
  title: string;
  subtitle: string;
  imageFile: string;
  weaponId: WeaponId;
  actionType: ShowcaseGalleryAction;
  ctaLabel: string;
}

export interface ShowcaseArchPillarCopy {
  code: string;
  iconKey: 'git' | 'cpu' | 'gauge' | 'sparkles' | 'scissors' | 'shield';
  title: string;
  desc: string;
  metric: string;
}

export interface ShowcaseDictionary {
  nav: {
    ariaLabel: string;
    versionBadge: string;
    capabilities: string;
    documentary: string;
    gallery: string;
    arsenal: string;
    architecture: string;
    quickstart: string;
    launchArmory: string;
  };
  hero: {
    eyebrow: string;
    titlePrefix: string;
    titleHighlight: string;
    titleSuffix: string;
    subLead: string;
    subPartsStrong: string;
    subMid1: string;
    subMapsStrong: string;
    subMid2: string;
    subAudioStrong: string;
    subTail: string;
    ctaArmory: string;
    ctaDirector: (shortTag: string) => string;
    ctaExplode: (shortTag: string) => string;
    ctaFiring: string;
    dragStageTitle: string;
    liveBadge: string;
    partsUnit: (count: number) => string;
    stageGroupAria: string;
    stageLabel: string;
    modePbr: string;
    modeSection: string;
    modeXray: string;
    modeExplode: string;
    rotateOn: string;
    rotateOff: string;
    weaponPillsAria: string;
  };
  metrics: readonly { val: string; lbl: string }[];
  capabilities: {
    kicker: string;
    title: string;
    desc: string;
    cards: {
      explode: {
        alt: string;
        tag: string;
        title: string;
        descPrefix: string;
        descSuffix: string;
        cta: string;
      };
      firing: {
        alt: string;
        tag: string;
        title: string;
        desc: string;
        cta: string;
      };
      section: {
        alt: string;
        tag: string;
        title: string;
        descPrefix: string;
        descSuffix: string;
        cta: string;
      };
      pbr: {
        alt: string;
        tag: string;
        title: string;
        desc: string;
        cta: string;
      };
    };
  };
  documentary: {
    kicker: string;
    title: string;
    desc: string;
    directorBadge: string;
    directorTitle: string;
    directorDesc: string;
    acts: readonly {
      actTag: string;
      stageBadge: string;
      title: string;
      detail: string;
    }[];
    pickWeaponLabel: string;
    launchTourCta: (shortTag: string) => string;
    openDrawerCta: string;
    soundBadge: string;
    soundTitle: string;
    soundDesc: string;
    caliberRows: readonly {
      caliber: string;
      weaponTag: string;
      freqTag: string;
      signature: string;
    }[];
    soundFeatures: readonly string[];
    testSlowMoCta: string;
  };
  gallery: {
    kicker: string;
    title: string;
    desc: string;
    zoomTitle: string;
    zoomPill: string;
    closeLightboxAria: string;
    items: readonly ShowcaseGalleryItemCopy[];
  };
  arsenal: {
    kicker: string;
    title: string;
    desc: string;
    filterAria: string;
    categories: Record<ArmoryCategory, string>;
    partsPill: (count: number) => string;
    specCaliber: string;
    specOal: string;
    specVel: string;
    specRange: string;
    btnExplode: string;
    btnFire: string;
    btnStory: string;
  };
  architecture: {
    kicker: string;
    title: string;
    desc: string;
    pipelineAria: string;
    pipelineSteps: readonly string[];
    pillars: readonly ShowcaseArchPillarCopy[];
  };
  quickstart: {
    cloneTitle: string;
    copied: string;
    copy: string;
    badgeTests: string;
    shortcutsTitle: string;
    shortcuts: readonly { key: string; label: string }[];
    finalKicker: string;
    finalTitle: string;
    finalSub: string;
    finalLaunchBtn: string;
    finalStarBtn: string;
    footerBrand: string;
    footerDisclaimer: string;
  };
}

export const SHOWCASE_STRINGS: Record<LanguageCode, ShowcaseDictionary> = {
  zh: {
    nav: {
      ariaLabel: '产品宣传页主导航',
      versionBadge: 'v3.0 · 声画合一版',
      capabilities: '四大核心模式',
      documentary: 'AI 导演纪录片',
      gallery: '实机渲染画廊',
      arsenal: '十一款馆藏名枪',
      architecture: '三维引擎架构',
      quickstart: '开源快速部署',
      launchArmory: '进入 3D 数字枪库',
    },
    hero: {
      eyebrow:
        'OPEN-SOURCE WEBGL 2.0 MUSEUM · 11 FIREARMS · 644 AI VOICE CLIPS · WEB AUDIO',
      titlePrefix: '把十一款世界传奇名枪的 ',
      titleHighlight: '1:1 机械内构与声画纪录片',
      titleSuffix: '，装进你的浏览器',
      subLead: '纯代码实时 CSG 布尔建模 ',
      subPartsStrong: '278 个独立运动零件',
      subMid1: '、',
      subMapsStrong: '64 张 2K 5 通道 ORM 物理贴图',
      subMid2: ' 与 ',
      subAudioStrong: '644 段双语语音 + Web Audio 分口径实弹声场',
      subTail:
        '。零客户端下载，一键开启 3D 导演自动运镜，60 FPS 丝滑透视每一根膛线、闭锁突笋与火药燃气联动。',
      ctaArmory: '立即进入 3D 数字枪库',
      ctaDirector: (tag) => `3D 导演连播 ${tag} 纪录片`,
      ctaExplode: (tag) => `直达 ${tag} 爆炸拆解台`,
      ctaFiring: '播放实弹击发与声浪',
      dragStageTitle: '按住左键拖拽可自由旋转 3D 展台',
      liveBadge: 'LIVE 360° 展台旋转 · 可拖拽检视',
      partsUnit: (n) => `${n} 独立零件`,
      stageGroupAria: '实时渲染模式切换',
      stageLabel: '实时 3D 展台预览：',
      modePbr: '真铁 PBR 原貌',
      modeSection: '纵向军械剖视',
      modeXray: 'X-Ray 透视内构',
      modeExplode: '58% 悬浮半爆炸',
      rotateOn: '展台旋转中',
      rotateOff: '展台旋转已停',
      weaponPillsAria: '快速切换舞台展示枪械',
    },
    metrics: [
      { val: '11 款', lbl: '传奇制式名枪 · 7 大闭锁与供弹原理' },
      { val: '278 件', lbl: '实时 CSG 布尔零件 · 零穿模' },
      { val: '64 张', lbl: '2K 5 通道 ORM 物理材质贴图' },
      { val: '644 段', lbl: '中英双语 AI 研发故事与零件配音' },
      { val: 'Web Audio', lbl: '7 口径实弹声浪 · 7 阶段机械咬合' },
    ],
    capabilities: {
      kicker: 'FOUR CORE CAPABILITIES',
      title: '四大军械级三维检视与仿真模式',
      desc: '从外层磷化钢滚印到腔内闭锁突笋咬合，每一把武器均打通「多级爆炸拆解、7 阶段实弹循环、纵向中轴剖视、5 通道物理材质」全链路交互。',
      cards: {
        explode: {
          alt: 'AK-15M1 零回流引线与多级爆炸拆解工作台',
          tag: 'MODE 01 · EXPLODED CAD & CALLOUTS',
          title: '渐进式三级爆炸拆解 + 零回流防遮挡引线标注',
          descPrefix:
            '支持「合拢态 0% → 野战一级快拆 30% → 枪机护木细拆 65% → 全枪 100% 爆炸图」无级阻尼拖拽；3D 表面锚点实时投影为工程细线引出签，自动避让 HUD 面板并精准读取每一枚零件的 ',
          descSuffix: ' 毫米三维包络尺寸。',
          cta: '打开 AK-15M1 拆解演示台',
        },
        firing: {
          alt: 'Barrett M82A1 .50 BMG 整管短后坐与箭头制退侧喷',
          tag: 'MODE 02 · 7-STAGE KINEMATICS & BALLISTICS',
          title: '7 阶段真实运动学循环 + 7 口径 SAAMI/CIP 实弹内弹道',
          desc: '严格遵循各枪机械运动定律：长/短行程导气活塞、斯通纳气吹、P90 顶置 90° 螺旋供弹自由枪机、MP5 4:1 滚柱延迟、M82A1 整管短后坐、AWM 60° 栓动及布朗宁闭锁下倾；同步触发分口径声浪与抛壳轨迹。',
          cta: '体验巴雷特 .50 BMG 慢放击发',
        },
        section: {
          alt: '纵向中轴军械剖视切面',
          tag: 'MODE 03 · LONGITUDINAL SECTION-CUT (C)',
          title: 'GPU 纵向中轴军械剖视与穿透射线拾取',
          descPrefix: '按下 ',
          descSuffix:
            ' 键即可沿枪膛纵轴切开右侧机匣、套筒与弹匣壳体，保留左侧完整真铁涂装；鼠标可直接穿过剖切面点选内部膛线、击锤、导气活塞与托弹簧并听取零件语音导览。',
          cta: '直达纵向军械剖视模式',
        },
        pbr: {
          alt: '5 通道 Packed ORM 物理贴图图集检视器',
          tag: 'MODE 04 · 5-CHANNEL PACKED ORM PBR',
          title: 'Khronos 校准五级深色金属/聚合物分离与图集检视',
          desc: '针对锰系磷化钢、硬质阳极铝、CNC 导轨倒角、玻纤尼龙与硫化橡胶建立五级光学梯度，内置按需加载的 2K WebP 三通道贴图检视与原图下载面板。',
          cta: '打开 64 张 PBR 贴图图集检视器',
        },
      },
    },
    documentary: {
      kicker: 'MULTIMODAL AUDIO-VISUAL ENGINE · V3.0',
      title: 'AI 四幕双语研发纪录片 · 3D 导演运镜 & 军械声场',
      desc: '告别无声手动拖拽模型的传统看图模式：全馆藏 11 款名枪内置中英双语四幕研发史、278 枚零件独立配音、自动镜头编排器与程序化 Web Audio 机械合成声效。',
      directorBadge: '3D STORY DIRECTOR · 自动运镜编排',
      directorTitle: '四幕研发纪录片「3D 导演自动运镜模式」',
      directorDesc:
        '点击连播即可随旁白时序自动切入拆解工作台、飞跃聚焦核心零件，并在四幕剧情间无缝切换纵向剖视、X-Ray 与超慢动作实弹循环，配合可点击跳转的逐句高亮同步字幕。',
      acts: [
        {
          actTag: 'ACT I · 立项溯源',
          stageBadge: '1:1 真铁特写 → 30% 野战快拆',
          title: '战术痛点与枪管/底盘特写',
          detail:
            '镜头飞跃定格核心立项部件（如冷锻枪管、铝合金主梁），随叙事推进自动展开 30% 野战一级快拆总成。',
        },
        {
          actTag: 'ACT II · 实战淬火',
          stageBadge: 'C 纵向中轴军械剖视',
          title: '剖开右侧壳体直视供弹与火控',
          detail:
            '自动开启 GPU 纵向剖视切面并旋转至右侧正交视角，穿透机匣聚焦快慢机、弹匣供弹坡与加速子改进点。',
        },
        {
          actTag: 'ACT III · 机械灵魂',
          stageBadge: 'X-Ray 透视 + 52% 机构分解',
          title: '闭锁突笋、滚柱与导气活塞拆解',
          detail:
            '切换半透明 X-Ray 透视外衣并展开 52% 二级分解，让回转枪机螺旋樟槽、双滚柱与活塞头悬浮呈现。',
        },
        {
          actTag: 'ACT IV · 弹道传奇',
          stageBadge: '0.25x 超慢放 + 剖视实弹击发',
          title: '声画同步超慢动作内弹道谢幕',
          detail:
            '启动 0.25x 超慢速连续击发并切换纵向剖视，伴随自动闪避（-12 dB）的机械咬合声观察底火点燃与抛壳。',
        },
      ],
      pickWeaponLabel: '选择馆藏名枪立即体验 3D 导演纪录片：',
      launchTourCta: (tag) => `全屏导演播放 ${tag} 四幕纪录片`,
      openDrawerCta: '打开图文+字幕抽屉',
      soundBadge: 'PROCEDURAL WEB AUDIO · 零外部音频膨胀',
      soundTitle: '7 口径差异化实弹声浪 & 7 阶段军械咬合合成引擎',
      soundDesc:
        '基于 Web Audio API 实时物理建模（零额外 WAV/MP3 体积）：1.0x 标准射速清晰区分反器材重炮与手枪脆响；0.25x 超慢放精准剥离每一次金属撞击，并在播报语音时自动执行 Audio Ducking 闪避。',
      caliberRows: [
        {
          caliber: '12.7×99mm (.50 BMG)',
          weaponTag: 'M82A1',
          freqTag: '38 Hz 超低频震波',
          signature: '双室 60° 箭头制退侧向轰鸣 + 整管短后坐沉重撞击',
        },
        {
          caliber: '.338 Lapua Magnum',
          weaponTag: 'AWM',
          freqTag: '50 Hz 高压裂空',
          signature: '超音速鞭响 + 60° 螺旋防冰枪机拉栓抽壳金属声',
        },
        {
          caliber: '.50 AE / 7.62×39mm',
          weaponTag: 'DEAGLE / AK-15',
          freqTag: '58–68 Hz 浑厚膛音',
          signature: '导气孔高压放气冲击活塞头 + 35° 双突笋回转闭锁咔哒',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M4A1 / P90 / MP5 / G17',
          freqTag: '84–118 Hz 高频穿甲与清鸣',
          signature: 'P90 90° 螺旋供弹高速连发缓冲 / M4 缓冲簧余韵 / 9mm 弹壳清鸣',
        },
      ],
      soundFeatures: [
        '8 点相位硬绑定：阻铁释放 → 击针撞底火 → 膛口爆轰 → 导气/后坐 → 凸轮开锁 → 抛壳清鸣 → 复进簧摩擦 → 闭锁复位',
        'TTS 智能闪避：旁白与零件语音播放时，机械与枪声自动平滑衰减至 -12.4 dB，人声清晰不掩蔽',
        '独立静音控制：工作台顶栏、发射时间轴与全局快捷键 M 随时一键静音/恢复机械声效',
      ],
      testSlowMoCta: '实测巴雷特 .50 BMG 0.25x 慢放声场',
    },
    gallery: {
      kicker: 'LIVE METAL WEBGL 2.0 CAPTURES',
      title: '100% 浏览器实时渲染实机画廊',
      desc: '以下全部画面均由本项目前端引擎在浏览器内实时生成（零预渲染离线视频、零外部三维模型资产），点击图片可放大检视细节或一键进入同款实时视口。',
      zoomTitle: '点击放大检视高清实机渲染图',
      zoomPill: '点击放大高清检视',
      closeLightboxAria: '关闭大图预览',
      items: [
        {
          id: 'ak15-section',
          badge: 'GPU CLIPPING CUTAWAY · 纵向剖视',
          title: 'AK-15M1 冲压机匣与弹匣供弹中轴剖视',
          subtitle:
            '沿枪膛中轴实时剖开右侧壳体，原色直视复进簧、双突笋回转枪机、长行程活塞、击锤阻铁咬合与弧形弹匣托弹簧。',
          imageFile: 'showcase/ak15-section.webp',
          weaponId: 'ak15',
          actionType: 'section',
          ctaLabel: '进入 AK-15M1 剖视实测',
        },
        {
          id: 'm82a1-firing',
          badge: '.50 BMG SHORT RECOIL · 实弹内弹道',
          title: '巴雷特 M82A1 整管短后坐与 60° 箭头制退冲击波',
          subtitle:
            '29 英寸开槽重枪管与双室箭头制退器同步后坐，加速子撬动枪机框解锁，配合 X-Ray 透视双联枪管缓冲簧动态形变。',
          imageFile: 'showcase/m82a1-firing.webp',
          weaponId: 'm82a1',
          actionType: 'firing',
          ctaLabel: '播放 .50 BMG 击发循环',
        },
        {
          id: 'deagle-chrome',
          badge: 'BRUSHED HARD CHROME · 5-CH ORM',
          title: '沙漠之鹰 Mark XIX .50 AE 拉丝硬铬与正向导气活塞',
          subtitle:
            '定制 2K 5 通道 ORM 贴图精准分离镜面抛光侧壁、哑光喷砂顶槽与 Hogue 橡胶握把，完整还原膛底固定枪管导气结构。',
          imageFile: 'showcase/deagle-chrome.webp',
          weaponId: 'deagle',
          actionType: 'explode',
          ctaLabel: '拆解沙漠之鹰 24 零件',
        },
        {
          id: 'awm-section',
          badge: '.338 LAPUA MAGNUM · 精密栓动',
          title: '精密国际 AWM 防冰槽六突笋枪机与施密特瞄具剖视',
          subtitle:
            '铝合金贯穿主梁底盘、60° 开锁行程螺旋防冰槽枪机、双排双进钢弹匣与 S&B PM II 高倍瞄准镜 1:1 空间配合。',
          imageFile: 'showcase/awm-section.webp',
          weaponId: 'awm',
          actionType: 'section',
          ctaLabel: '进入 AWM 栓动剖视',
        },
        {
          id: 'm4a1-iso',
          badge: 'MIL-STD-1913 · 枪匠影棚级深色分层',
          title: 'Colt M4A1 卡宾枪三色导轨齿与干膜灰 STANAG 弹匣',
          subtitle:
            '双侧掠射柔光箱与磷化转化膜着色曲线加持，清晰区分磷酸盐钢枪管、7075 阳极氧化机匣、KAC RAS 导轨齿顶与尼龙枪托。',
          imageFile: 'showcase/m4a1-iso.webp',
          weaponId: 'm4a1',
          actionType: 'explode',
          ctaLabel: '查看 M4A1 气吹内构',
        },
        {
          id: 'pbr-atlas',
          badge: '2048×1024 WEBP · 贴图图集检视器',
          title: '内置三通道 PBR 图集检视器（Albedo / Normal / ORM）',
          subtitle:
            '支持在浏览器内实时切换、放大并下载全库 64 张程序化烘焙贴图，无损级高压缩比极速秒开。',
          imageFile: 'showcase/pbr-atlas.webp',
          weaponId: 'ak15',
          actionType: 'atlas',
          ctaLabel: '打开实时 PBR 贴图图集',
        },
      ],
    },
    arsenal: {
      kicker: '11-BAY MASTER ROSTER · FACTORY 1:1',
      title: '十一大世界经典名枪 1:1 测绘馆藏矩阵',
      desc: '涵盖俄、美、德、奥、英、比、以七国代表性轻武器体系，每款均配备双语四幕研发纪录片、全零件配音、独立总成与自动闭锁运动学方程。',
      filterAria: '馆藏分类筛选',
      categories: {
        all: '全部馆藏',
        assault: '突击 / 卡宾 / 无托',
        smg: '冲锋枪 / PDW',
        sniper: '狙击 / 反器材',
        pistol: '半自动手枪',
      },
      partsPill: (n) => `${n} 零件`,
      specCaliber: '口径',
      specOal: '全枪长 (OAL)',
      specVel: '枪口初速',
      specRange: '有效射程',
      btnExplode: '3D 爆炸拆解',
      btnFire: '实弹击发演示',
      btnStory: '3D 导演纪录片',
    },
    architecture: {
      kicker: 'ENGINEERING ARCHITECTURE',
      title: '纯 TypeScript + Python + Web Audio 工业级管线',
      desc: '拒绝臃肿黑盒静态资产，以严谨的前端图形与声学工程管线解决大规模 CSG 布尔运算、高频动画状态同步、语音导演联动与显存生命周期管理。',
      pipelineAria: '渲染与建模流水线',
      pipelineSteps: [
        'Manifest 轻量目录 (<8KB)',
        '插件动态分包预热',
        'Worker 异步 CSG 建模',
        'Transferable 零拷贝传输',
        '60Hz 瞬态时钟零重渲染',
        'Web Audio 相位声场合成',
      ],
      pillars: [
        {
          code: 'ARCH-01',
          iconKey: 'git',
          title: '自包含武器插件与首屏秒开分包',
          desc: '首屏仅加载轻量展架清单（manifests.ts）；11 款武器的零件 BOM、运动学方程、双语档案与 CSG 脚本均通过动态分包按需懒加载。',
          metric: '11 独立插件 Chunk',
        },
        {
          code: 'ARCH-02',
          iconKey: 'cpu',
          title: 'Web Worker 异步 CSG 与零拷贝回传',
          desc: '重度 three-bvh-csg 膛线镂空、闭锁突笋与防冰槽布尔运算完全隔离在后台 Worker 线程，通过 Transferable Float32Array 流式回传主线程，杜绝掉帧卡顿。',
          metric: '0 ms 主线程阻塞',
        },
        {
          code: 'ARCH-03',
          iconKey: 'gauge',
          title: '60Hz 瞬态时钟与 Web Audio 硬同步',
          desc: '高频拆解插值与击发进度下沉至非受控瞬态时钟 playbackClock.ts，零堆内存分配同时驱动 R3F 3D 矩阵形变与 8 点军械机械/实弹合成声效。',
          metric: '60 FPS 零重渲染',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: '5 通道 Packed ORM 与双语导演编排',
          desc: '离线烘焙 Albedo + 法线 + ORM 贴图还原真实磷化/硬铬质感；3D 导演编排器根据 Gemini TTS 语音进度自动驱动镜头聚焦、剖视与慢放击发。',
          metric: '644 段双语语音',
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: 'GPU 局部剖切面与剖视穿透拾取',
          desc: '定制 sectionAwareMeshRaycast 拦截器联动 Three.js GPU 局部裁剪平面，剖开右侧机匣壳体的同时让鼠标射线无缝穿透虚空切面，精准点选内部火控与枪机。',
          metric: '亚毫米级 BVH 拾取',
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: '401 步运动学防穿模与声画契约门禁',
          desc: 'Vitest 自动化契约套件对全部 11 枪 278 零件执行法线、UV、Khronos 亮度、644 段配音完整性及导演/声学相位连续性断言，锁死工业级交付标准。',
          metric: '全量自动化契约',
        },
      ],
    },
    quickstart: {
      cloneTitle: '30 秒本地克隆与极速启动',
      copied: '已复制命令',
      copy: '复制命令',
      badgeTests: 'Vitest 全量几何与双语声画契约',
      shortcutsTitle: '工作台全局工程快捷键',
      shortcuts: [
        { key: 'Space', label: '播放 / 暂停拆解或实弹击发循环' },
        { key: 'C', label: '开启 / 关闭 1:1 纵向军械剖视切面' },
        { key: 'X', label: '切换外层机匣与套筒 X-Ray 透视' },
        { key: 'M', label: '开启 / 静音军械机械与实弹合成声效' },
        { key: 'E', label: '显示 / 隐藏工业 CAD 硬边轮廓线' },
        { key: 'L', label: '开关零回流 3D 零件引出编号签' },
        { key: 'R', label: '一键复位默认合拢态与等轴视角' },
        { key: 'Esc', label: '最小化字幕 / 取消选中 / 返回枪库' },
      ],
      finalKicker: 'READY FOR INSPECTION',
      finalTitle: '现在进入 3D 数字枪库，开启声画同步机械探索之旅',
      finalSub:
        '支持中英双语自由切换与 URL 深度链接分享任意枪械、拆解进度与实弹演示；开源免费，如果这个项目对你有启发，欢迎在 GitHub 点亮一颗 Star。',
      finalLaunchBtn: '启动 11 槽 3D 数字枪库',
      finalStarBtn: '前往 GitHub 点亮 Star',
      footerBrand: 'Digital Armory 3D · 枪械内部结构 3D 数字博物馆',
      footerDisclaimer:
        '原理示意级（Schematic / Educational Level）机械科普与三维声画可视化开源工程 · 不包含任何工业制造加工公差或可打印图纸。',
    },
  },
  en: {
    nav: {
      ariaLabel: 'Product showcase primary navigation',
      versionBadge: 'v3.0 · AUDIO-VISUAL EDITION',
      capabilities: '4 Core Modes',
      documentary: 'AI 3D Director',
      gallery: 'Live Captures',
      arsenal: '11-Firearm Vault',
      architecture: 'Engine Architecture',
      quickstart: 'Quick Start',
      launchArmory: 'Enter 3D Armory',
    },
    hero: {
      eyebrow:
        'OPEN-SOURCE WEBGL 2.0 MUSEUM · 11 FIREARMS · 644 AI VOICE CLIPS · WEB AUDIO',
      titlePrefix: 'Explore ',
      titleHighlight: '1:1 Mechanical Cutaways & 3D AI Documentaries',
      titleSuffix: ' of 11 Iconic Firearms in Your Browser',
      subLead: 'Procedural real-time CSG modeling of ',
      subPartsStrong: '278 moving CAD components',
      subMid1: ', ',
      subMapsStrong: '64 custom 2K 5-channel ORM textures',
      subMid2: ', and ',
      subAudioStrong:
        '644 bilingual voice clips + Web Audio ballistic acoustics',
      subTail:
        '. Zero installs—launch 3D Director Mode to inspect every rifling land, locking lug, and gas piston at 60 FPS.',
      ctaArmory: 'Enter 3D Digital Armory',
      ctaDirector: (tag) => `Play ${tag} 3D Documentary`,
      ctaExplode: (tag) => `Open ${tag} Disassembly`,
      ctaFiring: 'Live Ballistics & SFX',
      dragStageTitle: 'Hold left mouse button and drag to orbit 3D turntable',
      liveBadge: 'LIVE 360° WEBGL TURNTABLE · DRAG TO ORBIT',
      partsUnit: (n) => `${n} CAD Parts`,
      stageGroupAria: 'Live 3D rendering mode selector',
      stageLabel: 'Live 3D Stage:',
      modePbr: '1:1 Factory PBR',
      modeSection: 'Section-Cut (C)',
      modeXray: 'X-Ray Cutaway',
      modeExplode: '58% Semi-Explode',
      rotateOn: 'Rotating',
      rotateOff: 'Paused',
      weaponPillsAria: 'Switch live stage firearm',
    },
    metrics: [
      { val: '11 Icons', lbl: 'Service Firearms · 7 Feed & Lock Systems' },
      { val: '278 Parts', lbl: 'Manifold CSG Nodes · Zero Clipping' },
      { val: '64 Maps', lbl: '2K 5-Channel Packed ORM Textures' },
      { val: '644 Clips', lbl: 'Bilingual Gemini TTS R&D & Part Audio' },
      { val: 'Web Audio', lbl: '7-Caliber Blasts · 7-Stage Mech Foley' },
    ],
    capabilities: {
      kicker: 'FOUR CORE CAPABILITIES',
      title: 'Four Armorer-Grade 3D Inspection & Simulation Modes',
      desc: 'From phosphated steel roll-marks to internal locking-lug engagement, every firearm integrates multi-stage disassembly, 7-stage live ballistics, GPU longitudinal cutaway, and 5-channel PBR.',
      cards: {
        explode: {
          alt: 'AK-15M1 zero-reflow callout leaders and multi-stage exploded workbench',
          tag: 'MODE 01 · EXPLODED CAD & CALLOUTS',
          title: 'Progressive 3-Stage Disassembly + Zero-Reflow 3D Callouts',
          descPrefix:
            'Scrub smoothly across 0% Assembled → 30% Field Strip → 65% Sub-Assembly → 100% Full Explode; 3D surface anchors project architectural leader lines with live ',
          descSuffix: ' millimeter bounding dimensions.',
          cta: 'Open AK-15M1 Disassembly Bench',
        },
        firing: {
          alt: 'Barrett M82A1 .50 BMG barrel short-recoil and 60-degree arrowhead muzzle blast',
          tag: 'MODE 02 · 7-STAGE KINEMATICS & BALLISTICS',
          title: '7-Stage Coupled Kinematics + 7-Caliber SAAMI/CIP Ballistics',
          desc: 'Faithfully models long/short-stroke pistons, Stoner DI gas tube, P90 90° helical top-feed blowback, MP5 4:1 roller delay, M82A1 short-recoil accelerator, AWM 60° bolt lift, and Browning tilting barrel.',
          cta: 'Launch Barrett .50 BMG Slow-Mo Cycle',
        },
        section: {
          alt: 'GPU longitudinal centerline armorer section-cut',
          tag: 'MODE 03 · LONGITUDINAL SECTION-CUT (C)',
          title: 'GPU Centerline Section-Cut & Cutaway Raycast Picking',
          descPrefix: 'Press ',
          descSuffix:
            ' to slice open the right receiver, slide, and magazine wall along the bore axis while preserving full PBR on the left; click directly through the cutaway plane to inspect internal parts with spoken narration.',
          cta: 'Launch Longitudinal Cutaway Bench',
        },
        pbr: {
          alt: '5-Channel Packed ORM PBR Texture Atlas Inspector',
          tag: 'MODE 04 · 5-CHANNEL PACKED ORM PBR',
          title: 'Khronos-Calibrated 5-Tier Metal/Polymer PBR & Live Atlas',
          desc: 'Separates manganese phosphate steel, hard-coat anodized aluminum, CNC rail chamfers, glass-filled nylon, and overmolded rubber with an in-browser 2K WebP channel inspector.',
          cta: 'Inspect All 64 2K PBR Texture Maps',
        },
      },
    },
    documentary: {
      kicker: 'MULTIMODAL AUDIO-VISUAL ENGINE · V3.0',
      title: 'Bilingual 4-Act AI Documentary · 3D Director & Acoustic Engine',
      desc: 'Beyond silent manual model viewers: all 11 firearms ship with bilingual 4-act R&D documentaries, 278 spoken component breakdowns, automated 3D camera choreography, and procedural Web Audio gunsmith acoustics.',
      directorBadge: '3D STORY DIRECTOR · AUTO-CHOREOGRAPHY',
      directorTitle: '4-Act Documentary "3D Director Auto-Tour Mode"',
      directorDesc:
        'Press Play to automatically enter the 3D workbench, fly the camera onto key mechanical parts, toggle longitudinal cutaway, X-Ray, and 0.25x slow-motion firing across story beats—with click-to-seek synced captions.',
      acts: [
        {
          actTag: 'ACT I · ORIGINS',
          stageBadge: '1:1 PBR Focus → 30% Field Strip',
          title: 'Doctrinal Requirement & Barrel/Chassis Focus',
          detail:
            'Flies the camera to the foundational component (cold-forged barrel or chassis beam), then smoothly opens into a 30% field strip.',
        },
        {
          actTag: 'ACT II · COMBAT TRIALS',
          stageBadge: 'Section-Cut (C) Flank View',
          title: 'Longitudinal Cutaway of Feed & Fire Control',
          detail:
            'Activates GPU centerline section-cut and swings to the right flank, exposing selectors, feed ramps, and combat-driven upgrades.',
        },
        {
          actTag: 'ACT III · LOCKING SOUL',
          stageBadge: 'X-Ray + 52% Mechanism Strip',
          title: 'Rotating Lugs, Rollers & Gas Piston Separation',
          detail:
            'Switches outer housings to translucent X-Ray and separates sub-assemblies to 52% to reveal helical cam slots, rollers, and pistons.',
        },
        {
          actTag: 'ACT IV · LIVE LEGACY',
          stageBadge: '0.25x Slow-Mo + Cutaway Firing',
          title: 'Ultra-Slow Live Ballistics with Audio Ducking',
          detail:
            'Runs 0.25x ultra-slow live firing in X-Ray and Section-Cut while ducked (-12 dB) mechanical clicks and muzzle blasts play beneath narration.',
        },
      ],
      pickWeaponLabel: 'Launch an interactive 3D Director Documentary now:',
      launchTourCta: (tag) => `Launch ${tag} 3D Director Tour`,
      openDrawerCta: 'Open Full Essay & Captions',
      soundBadge: 'PROCEDURAL WEB AUDIO · ZERO ASSET BLOAT',
      soundTitle: '7-Caliber Ballistic Blasts & 7-Stage Gunsmith Foley Synth',
      soundDesc:
        'Real-time procedural Web Audio synthesis (0 KB external audio bloat): distinguishes anti-materiel shockwaves from crisp PDW & 9mm snaps at 1.0x, separates every metallic click at 0.25x, and ducks automatically under TTS voice.',
      caliberRows: [
        {
          caliber: '12.7×99mm (.50 BMG)',
          weaponTag: 'M82A1',
          freqTag: '38 Hz Seismic Sub-Bass',
          signature:
            '60° dual-baffle brake roar + heavy 29" barrel short-recoil thud',
        },
        {
          caliber: '.338 Lapua Magnum',
          weaponTag: 'AWM',
          freqTag: '50 Hz Supersonic Crack',
          signature:
            'High-pressure whip crack + 60° fluted bolt lift & primary extraction',
        },
        {
          caliber: '.50 AE / 7.62×39mm',
          weaponTag: 'DEAGLE / AK-15',
          freqTag: '58–68 Hz Heavy Bark',
          signature:
            'Gas-port bleed striking piston cup + 35° dual-lug rotary lockup clunk',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M4A1 / P90 / MP5 / G17',
          freqTag: '84–118 Hz Crisp PDW & Snap',
          signature:
            'P90 90° helical feed & elastomer buffer / M4 buffer twang / 9mm brass ring',
        },
      ],
      soundFeatures: [
        '8-Point Phase Binding: Sear release → Primer strike → Muzzle blast → Gas/recoil → Cam unlock → Brass casing ring → Spring rasp → Lockup & reset',
        'Smart TTS Audio Ducking: Smoothly attenuates mechanical & ballistic SFX to -12.4 dB whenever Gemini TTS narration is speaking',
        'Independent Mute Control: Instant SFX toggle in Workbench Header, Firing Dock, or keyboard shortcut M',
      ],
      testSlowMoCta: 'Test Barrett .50 BMG 0.25x Acoustic Cycle',
    },
    gallery: {
      kicker: 'LIVE METAL WEBGL 2.0 CAPTURES',
      title: '100% Real-Time Browser WebGL 2.0 Captures',
      desc: 'Every frame below is rendered live in the browser by our procedural CSG + PBR engine (zero pre-rendered videos, zero external .glb meshes). Click to zoom or jump straight into the live viewport.',
      zoomTitle: 'Click to inspect high-resolution WebGL capture',
      zoomPill: 'Click to Enlarge',
      closeLightboxAria: 'Close high-resolution preview',
      items: [
        {
          id: 'ak15-section',
          badge: 'GPU CLIPPING CUTAWAY · SECTION-CUT',
          title: 'AK-15M1 Stamped Receiver & Magazine Centerline Cutaway',
          subtitle:
            'Slices the right receiver wall along the bore centerline, exposing the recoil spring, 2-lug rotating bolt, long-stroke piston, hammer-sear engagement, and curved magazine spring.',
          imageFile: 'showcase/ak15-section.webp',
          weaponId: 'ak15',
          actionType: 'section',
          ctaLabel: 'Open AK-15M1 Live Cutaway',
        },
        {
          id: 'm82a1-firing',
          badge: '.50 BMG SHORT RECOIL · LIVE BALLISTICS',
          title: 'Barrett M82A1 Barrel Short-Recoil & 60° Arrowhead Plume',
          subtitle:
            '29-inch fluted barrel and dual-chamber brake recoil together as the accelerator lever cams unlock the carrier, paired with dynamic dual recoil spring compression.',
          imageFile: 'showcase/m82a1-firing.webp',
          weaponId: 'm82a1',
          actionType: 'firing',
          ctaLabel: 'Play .50 BMG Firing Cycle',
        },
        {
          id: 'deagle-chrome',
          badge: 'BRUSHED HARD CHROME · 5-CH ORM',
          title: 'Desert Eagle Mark XIX .50 AE Brushed Chrome & Gas Piston',
          subtitle:
            'Custom 2K 5-channel ORM maps separate mirror-brushed flats, matte bead-blasted ribs, and Hogue rubber grips over a fixed barrel and forward gas piston.',
          imageFile: 'showcase/deagle-chrome.webp',
          weaponId: 'deagle',
          actionType: 'explode',
          ctaLabel: 'Disassemble Desert Eagle (24 Parts)',
        },
        {
          id: 'awm-section',
          badge: '.338 LAPUA MAGNUM · PRECISION BOLT',
          title: 'Accuracy International AWM Anti-Ice 6-Lug Bolt & S&B Optic',
          subtitle:
            'Full-length aluminum chassis beam, 60°-throw helical anti-ice fluted bolt, double-stack steel magazine, and Schmidt & Bender PM II optic in 1:1 alignment.',
          imageFile: 'showcase/awm-section.webp',
          weaponId: 'awm',
          actionType: 'section',
          ctaLabel: 'Open AWM Bolt-Action Cutaway',
        },
        {
          id: 'm4a1-iso',
          badge: 'MIL-STD-1913 · STUDIO DARK METALLURGY',
          title: 'Colt M4A1 Carbine Quad-Rail & Dry-Film Gray STANAG Mag',
          subtitle:
            'Dual grazing softboxes and Khronos reflectance curves separate phosphate barrel steel, 7075 hard-anodized receivers, CNC rail teeth, and fiber-reinforced stock.',
          imageFile: 'showcase/m4a1-iso.webp',
          weaponId: 'm4a1',
          actionType: 'explode',
          ctaLabel: 'Inspect M4A1 Direct Impingement',
        },
        {
          id: 'pbr-atlas',
          badge: '2048×1024 WEBP · TEXTURE INSPECTOR',
          title: 'Built-In 3-Channel PBR Atlas Inspector (Albedo / Normal / ORM)',
          subtitle:
            'Toggle, zoom, and download all 64 procedurally baked 2K WebP maps directly in the browser with ultra-fast lossless-grade compression.',
          imageFile: 'showcase/pbr-atlas.webp',
          weaponId: 'ak15',
          actionType: 'atlas',
          ctaLabel: 'Open Live PBR Texture Atlas',
        },
      ],
    },
    arsenal: {
      kicker: '11-BAY MASTER ROSTER · FACTORY 1:1',
      title: '11 Iconic World Firearms · 1:1 Metrology Vault Matrix',
      desc: 'Spanning Russian, American, German, Austrian, British, Belgian, and Israeli small-arms lineages—each complete with a 4-act bilingual documentary, spoken part guides, and coupled kinematics.',
      filterAria: 'Filter vault collection by category',
      categories: {
        all: 'All Vault',
        assault: 'Rifle / Carbine / Bullpup',
        smg: 'SMG / PDW',
        sniper: 'Sniper / Anti-Materiel',
        pistol: 'Service Pistol',
      },
      partsPill: (n) => `${n} Parts`,
      specCaliber: 'Caliber',
      specOal: 'Overall Length',
      specVel: 'Muzzle Velocity',
      specRange: 'Effective Range',
      btnExplode: '3D Disassembly',
      btnFire: 'Live Ballistics',
      btnStory: '3D Documentary',
    },
    architecture: {
      kicker: 'ENGINEERING ARCHITECTURE',
      title: 'Industrial-Grade TypeScript + Python + Web Audio Pipeline',
      desc: 'Zero black-box static 3D blobs—combining Worker-isolated manifold CSG, transient 60Hz animation clocks, automated story choreography, and procedural acoustic synthesis.',
      pipelineAria: 'Rendering, CSG and audio pipeline',
      pipelineSteps: [
        'Lightweight Manifest (<8KB)',
        'On-Demand Plugin Chunks',
        'Worker Async CSG Build',
        'Zero-Copy Float32 Transfer',
        '60Hz Zero-Rerender Clock',
        'Phase-Locked Web Audio',
      ],
      pillars: [
        {
          code: 'ARCH-01',
          iconKey: 'git',
          title: 'Self-Contained Plugins & Instant Cold-Start',
          desc: 'Initial load pulls static catalog metadata (manifests.ts); all 11 weapon BOMs, kinematic equations, narration JSONs, and CSG builders lazy-load on demand.',
          metric: '11 Dynamic Chunks',
        },
        {
          code: 'ARCH-02',
          iconKey: 'cpu',
          title: 'Web Worker Async CSG & Zero-Copy Streaming',
          desc: 'Heavy three-bvh-csg rifling cuts, locking lugs, and flutes run off-main-thread inside a dedicated Worker and stream back via Transferable Float32Arrays.',
          metric: '0 ms Main-Thread Block',
        },
        {
          code: 'ARCH-03',
          iconKey: 'gauge',
          title: '60Hz Transient Clock & Web Audio Lockstep',
          desc: 'Continuous explode and firing progress lives in playbackClock.ts, driving R3F matrices with zero GC while triggering 8-point mechanical & ballistic Web Audio cues.',
          metric: '60 FPS Zero Re-render',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: '5-Channel Packed ORM & 3D Story Director',
          desc: 'Python pbr_core bakes Albedo + Normal + ORM maps while storyDirector.ts choreographs camera flights, cutaways, and 0.25x firing to 644 Gemini TTS clips.',
          metric: '644 Bilingual Clips',
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: 'GPU Clipping Plane & Cutaway Raycast Picking',
          desc: 'Custom sectionAwareMeshRaycast intercepts Three.js raycasting across GPU clipping planes so clicks pass cleanly through sliced shells onto internal parts.',
          metric: 'Sub-mm BVH Picking',
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: '401-Step Anti-Clipping & Audio-Visual Contracts',
          desc: 'Automated Vitest suites verify unit normals, UV bounds, Khronos PBR luminance floors, 644 audio assets, and director/acoustic phase invariants.',
          metric: 'Full Contract Suite',
        },
      ],
    },
    quickstart: {
      cloneTitle: 'Clone & Launch Locally in 30 Seconds',
      copied: 'Copied!',
      copy: 'Copy Snippet',
      badgeTests: 'Vitest Geometry & Audio-Visual Contracts',
      shortcutsTitle: 'Global Engineering Shortcuts',
      shortcuts: [
        { key: 'Space', label: 'Play / Pause disassembly or live firing cycle' },
        { key: 'C', label: 'Toggle 1:1 longitudinal armorer section-cut' },
        { key: 'X', label: 'Toggle outer receiver & slide X-Ray cutaway' },
        { key: 'M', label: 'Mute / Unmute mechanical & ballistic Web Audio' },
        { key: 'E', label: 'Show / Hide industrial CAD hard-edge lines' },
        { key: 'L', label: 'Toggle zero-reflow 3D component callout tags' },
        { key: 'R', label: 'Reset to 0% assembled state & isometric camera' },
        { key: 'Esc', label: 'Minimize captions / Clear part / Exit to Vault' },
      ],
      finalKicker: 'READY FOR INSPECTION',
      finalTitle: 'Step Inside the 3D Armory & Experience Interactive Engineering',
      finalSub:
        'Full Chinese/English parity with shareable URL deep links for any weapon, mode, and language. Open-source under MIT—star the repo on GitHub if you enjoy it!',
      finalLaunchBtn: 'Launch 11-Bay 3D Armory',
      finalStarBtn: 'Star on GitHub',
      footerBrand: 'Digital Armory 3D · Open-Source 3D Firearms Mechanical Museum',
      footerDisclaimer:
        'Schematic / Educational-grade mechanical visualization & interactive encyclopedia · Contains zero manufacturing tolerances or 3D-printable blueprints.',
    },
  },
};

import type { LanguageCode } from '../narration/types';
import {
  WEAPON_IDS,
  type ArmoryCategory,
  type WeaponId,
} from '../weapons/types';

const VAULT_EXHIBIT_COUNT = WEAPON_IDS.length; // 27
const VAULT_ARCHERY_COUNT = 2;
const VAULT_ARMOR_COUNT = 4;
const VAULT_FIREARM_COUNT =
  VAULT_EXHIBIT_COUNT - VAULT_ARCHERY_COUNT - VAULT_ARMOR_COUNT; // 21
const VAULT_EXHIBIT_ZH = '二十七';
const VAULT_PARTS_TOTAL = 683;
const VAULT_TEXTURES_TOTAL = 351;
const VAULT_SUITES_TOTAL = 80;
const VAULT_AUDIO_TOTAL = 1582;
const LAB_CALIBER_TOTAL = 15;
const TANK_ORDNANCE_TOTAL = 3;
const ORDNANCE_TOTAL = LAB_CALIBER_TOTAL + TANK_ORDNANCE_TOTAL; // 18
const BALLISTICS_PROFILES_TOTAL = 20;

export type ShowcaseGalleryAction =
  'armory' | 'explode' | 'firing' | 'section' | 'atlas';

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
    ctaShowdown: string;
    ctaShowdownTitle: string;
    ctaCartridges: string;
    ctaCartridgesTitle: string;
    ctaBallistics: string;
    ctaBallisticsTitle: string;
    ctaPoster: string;
    ctaPosterTitle: string;
    ctaMonograph: (shortTag: string) => string;
    ctaMonographTitle: string;
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
    monographCta: (shortTag: string) => string;
    monographCtaTitle: string;
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
    categories: Record<ArmoryCategory | 'lmg', string>;
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
      versionBadge: `v4.0 · ${VAULT_EXHIBIT_COUNT} 馆藏重装甲旗舰版`,
      capabilities: '四大核心模式',
      documentary: 'AI 导演纪录片',
      gallery: '实机渲染画廊',
      arsenal: `${VAULT_EXHIBIT_ZH}款馆藏兵器`,
      architecture: '三维引擎架构',
      quickstart: '开源快速部署',
      launchArmory: '进入 3D 数字枪库',
    },
    hero: {
      eyebrow: `OPEN-SOURCE WEBGL 2.0 MUSEUM · ${VAULT_EXHIBIT_COUNT} EXHIBITS · ${VAULT_AUDIO_TOTAL} AI VOICE CLIPS · 1,000M BALLISTICS LAB`,
      titlePrefix: `把${VAULT_EXHIBIT_ZH}款传奇名枪、复合弓弩与 1:1 主战坦克的 `,
      titleHighlight: '1:1 机械内构与声画纪录片',
      titleSuffix: '，装进你的浏览器',
      subLead: 'Blender 5.2 高模 Draco + 实时 CSG 双轨建模 ',
      subPartsStrong: `${VAULT_PARTS_TOTAL} 个独立运动零件`,
      subMid1: '、',
      subMapsStrong: `${VAULT_TEXTURES_TOTAL} 张 2K/4K 5 通道 ORM 物理贴图（${VAULT_SUITES_TOTAL} 套图集）`,
      subMid2: ' 与 ',
      subAudioStrong: `${VAULT_AUDIO_TOTAL} 段双语语音 + Web Audio 分口径/主炮声场`,
      subTail: `。零客户端下载，一键开启 3D 导演运镜、1,000m RK4 外弹道与光学分划板靶场（R · ${BALLISTICS_PROFILES_TOTAL} 套弹道档案）、原理流派对照矩阵（S）、${ORDNANCE_TOTAL} 口径轻武器实弹与坦克主炮弹纵剖馆（B）、高清 3D 剖视海报分享（U）与 17 图版绘本打印工坊（Ctrl/Cmd+P），60 FPS 丝滑透视 ZTZ-99A 22 发转盘装弹机、M1A2 SEP v3 燃气轮机、豹 2A7V 箭簇装甲与虎式 131 88mm 水平楔闩等机械奇观。`,
      ctaArmory: '立即进入 3D 数字枪库',
      ctaDirector: (tag) => `3D 导演连播 ${tag} 纪录片`,
      ctaExplode: (tag) => `直达 ${tag} 爆炸拆解台`,
      ctaFiring: '播放实弹击发与声浪',
      ctaShowdown: '原理流派对照矩阵 (S)',
      ctaShowdownTitle:
        '打开三轴机械谱系矩阵与双展品同屏定量对照实验室 (快捷键: S)',
      ctaCartridges: `${ORDNANCE_TOTAL} 口径弹药与炮弹馆 (B)`,
      ctaCartridgesTitle: `进入 ${LAB_CALIBER_TOTAL} 口径轻武器实弹 + ${TANK_ORDNANCE_TOTAL} 口径主战坦克炮弹 1:1 纵剖对比实验室 (快捷键: B)`,
      ctaBallistics: '1,000m 外弹道靶场 (R)',
      ctaBallisticsTitle: `打开 1,000m RK4 外弹道（${BALLISTICS_PROFILES_TOTAL} 套弹道档案）、横风偏流、第一像面圣诞树分划板与 DOPE 射表实验室 (快捷键: R)`,
      ctaPoster: '3D 剖视分享海报 (U)',
      ctaPosterTitle:
        '生成带二维码与军械师考核认证章的高清 16:9 / 4:5 社交分享海报 (快捷键: U)',
      ctaMonograph: (tag) => `打印 ${tag} 3D 绘本 / 图鉴`,
      ctaMonographTitle:
        '打开 17 图版 3D 绘本与收藏图鉴打印工坊 (快捷键: Ctrl/Cmd+P)',
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
      {
        val: `${VAULT_EXHIBIT_COUNT} 款`,
        lbl: `${VAULT_FIREARM_COUNT} 名枪 + ${VAULT_ARCHERY_COUNT} 弓弩 + ${VAULT_ARMOR_COUNT} 款 1:1 主战坦克 · 全流派覆盖`,
      },
      { val: `${VAULT_PARTS_TOTAL} 件`, lbl: 'Draco 高模 + 实时 CSG 零件 · 零穿模' },
      {
        val: `${VAULT_TEXTURES_TOTAL} 张`,
        lbl: `2K/4K 5 通道 ORM 物理贴图 · ${VAULT_SUITES_TOTAL} 套材质图集`,
      },
      {
        val: `${VAULT_AUDIO_TOTAL} 段`,
        lbl: '中英双语 AI 研发故事与零件配音',
      },
      {
        val: `${ORDNANCE_TOTAL} 口径 · ${BALLISTICS_PROFILES_TOTAL} 弹道`,
        lbl: '15 实弹 + 3 坦克炮弹纵剖 · 1,000m RK4 靶场',
      },
    ],
    capabilities: {
      kicker: 'FOUR CORE CAPABILITIES',
      title: '四大军械级三维检视与仿真模式',
      desc: `从磷化钢滚印、90° 无壳转膛、六管加特林与滑轮钢索双发，到重装甲大厅 ZTZ-99A 转盘装弹机、M1A2 SEP v3 燃气轮机隔爆尾舱、豹 2A7V 箭簇装甲与虎式 131 88mm 水平楔闩，全部 ${VAULT_EXHIBIT_COUNT} 款展品 ${VAULT_PARTS_TOTAL} 个零件均打通「多级爆炸拆解、7 阶段内弹道、纵向中轴剖视、5 通道 ORM 贴图」，并配套 1,000m 外弹道（R · ${BALLISTICS_PROFILES_TOTAL} 档案）、原理对照矩阵（S）、${ORDNANCE_TOTAL} 口径弹药馆（B）与分享海报（U）。`,
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
          title: `7 阶段真实运动学循环 + ${ORDNANCE_TOTAL} 口径实弹/坦克炮弹与复合弓弩内弹道`,
          desc: '严格遵循各枪、弓弩与 1:1 主战坦克机械定律：长/短行程活塞、G11 90° 无壳旋转弹膛、VSS 6 级斜挡板消音、M134D 六管加特林、AN-94 滑轮钢索预供弹、ZTZ-99A 22 发底置转盘自动装弹机、M1A2 与豹 2A7V 隔爆门 120mm 装填、虎式 131 88mm 水平滑楔炮闩及双凸轮弓弩；同步触发分口径声浪。',
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
          title: 'Khronos 校准五级深色金属/胡桃木/聚合物/装甲与图集检视',
          desc: '针对锰系磷化钢、皇家烤蓝、硬质阳极铝、亚麻籽油黑胡桃实木、玻纤尼龙与 4K 复合/防磁装甲建立光学梯度，内置按需加载的 2K/4K WebP 三通道贴图检视与原图下载面板。',
          cta: `打开 ${VAULT_TEXTURES_TOTAL} 张 PBR 贴图图集检视器`,
        },
      },
    },
    documentary: {
      kicker: 'MULTIMODAL AUDIO-VISUAL ENGINE · V4.0',
      title: 'AI 四幕双语研发纪录片 · 3D 导演运镜 & 军械声场',
      desc: `告别无声手动拖拽模型的传统看图模式：全馆藏 ${VAULT_EXHIBIT_COUNT} 款名枪、复合弓弩与 1:1 主战坦克内置中英双语四幕研发史、${VAULT_PARTS_TOTAL} 枚零件独立配音、自动镜头编排器与程序化 Web Audio 机械合成声效。`,
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
      pickWeaponLabel: '选择馆藏名枪、弓弩或主战坦克立即体验 3D 导演纪录片：',
      launchTourCta: (tag) => `全屏导演播放 ${tag} 四幕纪录片`,
      openDrawerCta: '打开图文+字幕抽屉',
      monographCta: (tag) => `打印 ${tag} 17 图版绘本 / 图鉴`,
      monographCtaTitle:
        '一键离线抓拍 17 图版并排版打印双语绘本与收藏图鉴 (Ctrl/Cmd+P)',
      soundBadge: 'PROCEDURAL WEB AUDIO · 零外部音频膨胀',
      soundTitle: `${ORDNANCE_TOTAL} 口径实弹/主炮 + 复合弓弩差异化声浪 & 7 阶段咬合引擎`,
      soundDesc:
        '基于 Web Audio API 实时物理建模（零额外 WAV/MP3 体积）：1.0x 标准射速清晰区分 125/120/88mm 坦克主炮雷霆震波、.50 BMG 重炮轰鸣、M134D 六管 3,000 RPM 电锯怒吼、G11 2,100 RPM 无壳三连发、AN-94 1,800 RPM 双发口哨声、VSS 130 dB 亚音速微声消音、M1 加兰德末发漏夹「PING!」金属长鸣与复合弓弩阻尼闷响；0.25x 超慢放精准剥离每一次金属撞击，并在播报语音时自动执行 Audio Ducking 闪避。',
      caliberRows: [
        {
          caliber: '125mm / 120×570mm / 88×571mmR',
          weaponTag: 'ZTZ-99A / M1A2 SEP v3 / Leopard 2A7V / Tiger 131',
          freqTag: '24–34 Hz 坦克主炮震波与装弹机构',
          signature:
            '125mm 650 MPa 滑膛炮与转盘举升链推 / M1A2 隔爆门与 AGT1500 涡轮啸叫 / 豹 2A7V L/55A1 / 虎式 88mm 水平楔闩',
        },
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
          caliber: '.50 AE / 7.62×39mm / .45 ACP',
          weaponTag: 'DEAGLE / AK-15 / KRISS Vector',
          freqTag: '58–74 Hz 浑厚重弹与偏轴连发',
          signature:
            'Vector 110° Super V 滑块 1,200 RPM 亚音速连射 / 导气活塞冲击与 35° 双突笋回转闭锁',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M249 SAW / M4A1 / P90 / MP5 / P08 / G17',
          freqTag: '84–118 Hz 弹链拨爪与肘节清鸣',
          signature:
            'M249 双拨爪 M27 铁链节剥离 / P08 54° 肘节折起咔哒 / P90 90° 螺旋供弹与 9mm 弹壳清鸣',
        },
        {
          caliber: '.30-06 / 12 Gauge / .357 Magnum',
          weaponTag: 'M1 Garand / Benelli M4 / Python',
          freqTag: '62 Hz 轰鸣 + 1.74 kHz 漏夹长鸣',
          signature:
            '伽兰德 8 发弹簧钢漏夹末发「PING!」音叉高亢共鸣 / 双 ARGO 撞击与托弹舌咔哒 / 转轮 60° 棘爪分度',
        },
        {
          caliber: '7.62×51mm NATO / 5.45×39mm',
          weaponTag: 'M134D Minigun / AN-94 Abakan',
          freqTag: '48–82 Hz 电驱火风暴与双发哨鸣',
          signature:
            'M134D 六管 28V 电驱 3,000 RPM 低沉电锯怒吼 / AN-94 滑轮钢索 1,800 RPM 双发重叠与 8 字制退器哨声',
        },
        {
          caliber: '4.73×33mm DM11 / 9×39mm SP-5',
          weaponTag: 'H&K G11 K2 / VSS Vintorez',
          freqTag: '110 Hz 无壳钟表与 130 dB 暗夜微声',
          signature:
            'G11 90° 旋转弹膛无壳 2,100 RPM 三连发零抛壳声 / VSS 多孔泄气枪管与 6 级斜挡板极静亚音速消音',
        },
        {
          caliber: '400 gr Carbon Arrow / Bolt · 348–500 FPS',
          weaponTag: 'LIFT 33 / Ravin R500',
          freqTag: '46–54 Hz 弦阻尼闷响',
          signature:
            'SwitchWeight-X / HexCoil 凸轮急速退绕 + BCY-X 高张力弦谐振与止弦垫沉闷吸能（零燃气爆轰）',
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
      desc: '以下全部画面均由本仓库开源 Blender 5.2 Draco .glb + 实时动态 CSG 双轨引擎在浏览器内实时渲染生成（零预渲染离线视频、零闭源第三方模型），点击图片可放大检视细节或一键进入同款实时视口。',
      zoomTitle: '点击放大检视高清实机渲染图',
      zoomPill: '点击放大高清检视',
      closeLightboxAria: '关闭大图预览',
      items: [
        {
          id: 'ztz99a-cutaway',
          badge: '1:1 重装甲大厅 · ±1,800MM CT 纵剖',
          title: 'ZTZ-99A 主战坦克 22 发转盘自动装弹机与 150HB V12',
          subtitle:
            '1:1 重装装配机库 4K PBR 与 ±1,800 mm 实时 CT 纵剖面劈开复合炮塔与车体，直视 125mm ZPT-98 滑膛炮闭锁、战斗室转盘与 1,500 马力动力舱。',
          imageFile: 'showcase/ztz99a-cutaway.webp',
          weaponId: 'ztz99a',
          actionType: 'section',
          ctaLabel: '进入 ZTZ-99A 1:1 剖视台',
        },
        {
          id: 'tiger1-macro',
          badge: '4K ZIMMERIT · 96 块独立履带板',
          title: '虎式 I 131 号重型坦克 88mm 主炮与交错负重轮',
          subtitle:
            '4096×4096 锯齿防磁装甲贴图配合 512px 三平面 RNM 轧制钢细节与单侧 96 块独立下垂 Kgs 63 履带板，完整再现 48 轮交错底盘与 88mm KwK 36 炮塔。',
          imageFile: 'showcase/tiger1-macro.webp',
          weaponId: 'tiger1',
          actionType: 'explode',
          ctaLabel: '拆解虎式 131 重型坦克',
        },
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
          badge: '2K / 4K WEBP · 贴图图集检视器',
          title: '内置三通道 PBR 图集检视器（Albedo / Normal / ORM）',
          subtitle: `支持在浏览器内实时切换、放大并下载全库 ${VAULT_TEXTURES_TOTAL} 张 2K/4K Cycles 烘焙贴图，无损级高压缩比极速秒开。`,
          imageFile: 'showcase/pbr-atlas.webp',
          weaponId: 'ak15',
          actionType: 'atlas',
          ctaLabel: '打开实时 PBR 贴图图集',
        },
      ],
    },
    arsenal: {
      kicker: `${VAULT_EXHIBIT_COUNT}-BAY MASTER ROSTER · FACTORY 1:1`,
      title: `${VAULT_EXHIBIT_ZH}大传奇名枪、复合弓弩与 1:1 主战坦克测绘馆藏矩阵`,
      desc: '全面覆盖人类轻武器三大正交机械谱系、精密复合弓/弩体系与全新 1:1 重装甲大厅（中国 ZTZ-99A、美国 M1A2 SEP v3 艾布拉姆斯、德国 KMW 豹 2A7V、二战虎式 131），每款均配备 Blender 5.2 高模 Draco + CSG 双轨内构、四幕双语纪录片、全零件配音与同屏定量对照能力（S）。',
      filterAria: '馆藏分类筛选',
      categories: {
        all: '全部馆藏',
        assault: '突击 / 步枪 / 无托',
        lmg: '机枪 / 转管',
        smg: '冲锋枪 / PDW',
        sniper: '狙击 / 反器材',
        shotgun: '战术霰弹',
        pistol: '手枪 / 转轮',
        archery: '复合弓 / 弩',
        armor: '重装甲大厅',
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
      title: '纯 TypeScript + Blender 5.2 + Web Audio 工业级管线',
      desc: '完全开源可复现的 Blender 5.2 Draco `.glb` + Web Worker 动态 CSG 双轨架构（零闭源黑盒模型），以严谨图形与声学管线解决大尺度几何、60Hz 动画时钟与显存生命周期管理。',
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
          desc: `首屏仅加载轻量展架清单（manifests.ts）；${VAULT_EXHIBIT_COUNT} 款展品的零件 BOM、运动学方程、双语档案与 CSG 脚本均通过动态分包按需懒加载。`,
          metric: `${VAULT_EXHIBIT_COUNT} 独立插件 Chunk`,
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
          title: '60Hz 内外弹道解算与卷积混响声场',
          desc: `非受控瞬态时钟零 GC 驱动 60fps ${ORDNANCE_TOTAL} 口径 SAAMI/CIP 与坦克主炮膛压示波、1,000m RK4 外弹道（${BALLISTICS_PROFILES_TOTAL} 套档案，R）、流派对照曲线（S）与立体声卷积 IR 波导声效。`,
          metric: '60 FPS 零重渲染',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: 'GTAO + AgX 管线、分享海报与绘本打印',
          desc: `全馆 ${VAULT_SUITES_TOTAL} 套图集 ${VAULT_TEXTURES_TOTAL} 张 5 通道 ORM 贴图配合亚毫米 GTAO 环境光遮蔽、HDR 辉光与 AgX 色调映射；3D 导演同步 ${VAULT_AUDIO_TOTAL} 段 Gemini TTS 语音，内置分享海报（U）与 17 图版绘本打印（Ctrl/Cmd+P）。`,
          metric: `${VAULT_AUDIO_TOTAL} 语音 · ${VAULT_SUITES_TOTAL} 图集`,
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: '双通道 Stencil 实心剖视与穿透拾取',
          desc: 'WebGL Stencil 奇偶计数封盖切口并叠加 ISO 128 金属剖面线，配合 sectionAwareMeshRaycast 穿透切面精准点选内部火控与枪机。',
          metric: '实心金属剖面线',
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: '全馆藏运动学防穿模与声画契约门禁',
          desc: `自动化 Vitest 契约套件对全部 ${VAULT_EXHIBIT_COUNT} 款展品 ${VAULT_PARTS_TOTAL} 零件执行法线、UV、Khronos 亮度、${VAULT_AUDIO_TOTAL} 段配音完整性、1,000m 外弹道与军械师考核评分断言。`,
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
        {
          key: 'Cmd / Ctrl + K',
          label: '打开全局双语瞬搜指令面板（27 展品 / 683 零件 / 实验室与开关）',
        },
        { key: 'Space', label: '播放 / 暂停拆解或实弹击发循环' },
        { key: 'C', label: '开启 / 关闭 Stencil 实心纵向军械剖视' },
        {
          key: 'T',
          label: '开启 / 关闭 6 大机械职能分色与 60fps 燃气导流流线',
        },
        { key: 'G', label: '进入 / 退出军械师引导式快拆与盲拆限时考核 (DAG)' },
        {
          key: 'J',
          label: '开启 / 退出经典故障剖视排障室与随机盲考诊断',
        },
        { key: 'K', label: '开启 / 退出 1:1 3D 军械游标卡尺 (mm) 与包络标尺' },
        {
          key: 'R',
          label: '进入 / 返回 1,000m RK4 外弹道、横风偏流与光学分划板靶场',
        },
        {
          key: 'U',
          label: '打开 / 关闭高清 3D 剖视社交分享海报工坊 (含军械师认证章)',
        },
        {
          key: 'B',
          label: `进入 / 退出 ${ORDNANCE_TOTAL} 口径轻武器实弹与坦克主炮弹 1:1 纵剖对比实验室`,
        },
        {
          key: 'S',
          label: '打开 / 关闭自动原理流派谱系矩阵与双展品同屏对照实验室',
        },
        { key: 'P / V / F', label: '半拉验膛 / 切换快慢机 / 按住两道火扣扳机' },
        { key: 'X', label: '切换外层机匣与套筒 X-Ray 透视' },
        { key: 'M', label: '开启 / 静音军械机械与实弹合成声效' },
        { key: 'E', label: '显示 / 隐藏工业 CAD 硬边轮廓线' },
        { key: 'L', label: '开关零回流 3D 零件引出编号签' },
        { key: 'H', label: '隐藏 / 恢复全部界面按钮，进入纯净全屏展示' },
        { key: 'Ctrl/Cmd+P', label: '打开 17 图版 3D 绘本与收藏图鉴打印工坊' },
        { key: 'Shift+R / Esc', label: '一键复位合拢态 / 取消选中返回枪库' },
      ],
      finalKicker: 'READY FOR INSPECTION',
      finalTitle: '现在进入 3D 数字枪库，开启声画同步机械探索之旅',
      finalSub:
        '支持中英双语自由切换、1,000m 外弹道靶场（R）、高清 3D 剖视海报分享（U）、17 图版绘本打印（Ctrl/Cmd+P）及平板触控优化；开源免费，欢迎在 GitHub 点亮一颗 Star。',
      finalLaunchBtn: `启动 ${VAULT_EXHIBIT_COUNT} 槽 3D 数字枪库`,
      finalStarBtn: '前往 GitHub 点亮 Star',
      footerBrand: 'Digital Armory 3D · 枪械内部结构 3D 数字博物馆',
      footerDisclaimer:
        '原理示意级（Schematic / Educational Level）机械科普与三维声画可视化开源工程 · 不包含任何工业制造加工公差或可打印图纸。',
    },
  },
  en: {
    nav: {
      ariaLabel: 'Product showcase primary navigation',
      versionBadge: `v4.0 · ${VAULT_EXHIBIT_COUNT}-EXHIBIT HEAVY ARMOR`,
      capabilities: '4 Core Modes',
      documentary: 'AI 3D Director',
      gallery: 'Live Captures',
      arsenal: `${VAULT_EXHIBIT_COUNT}-Exhibit Vault`,
      architecture: 'Engine Architecture',
      quickstart: 'Quick Start',
      launchArmory: 'Enter 3D Armory',
    },
    hero: {
      eyebrow: `OPEN-SOURCE WEBGL 2.0 MUSEUM · ${VAULT_EXHIBIT_COUNT} EXHIBITS · ${VAULT_AUDIO_TOTAL} AI VOICE CLIPS · 1,000M BALLISTICS LAB`,
      titlePrefix: 'Explore ',
      titleHighlight: '1:1 Mechanical Cutaways & 3D AI Documentaries',
      titleSuffix: ` of ${VAULT_EXHIBIT_COUNT} Iconic Firearms, Archery & 1:1 Main Battle Tanks in Your Browser`,
      subLead: 'Dual-track Blender 5.2 Draco & procedural CSG modeling of ',
      subPartsStrong: `${VAULT_PARTS_TOTAL} moving CAD components`,
      subMid1: ', ',
      subMapsStrong: `${VAULT_TEXTURES_TOTAL} custom 2K/4K 5-channel ORM textures (${VAULT_SUITES_TOTAL} suites)`,
      subMid2: ', and ',
      subAudioStrong: `${VAULT_AUDIO_TOTAL} bilingual voice clips + Web Audio ballistic & cannon acoustics`,
      subTail: `. Zero installs—launch 3D Director Mode, test 1,000m RK4 External Ballistics & FFP Reticles (R · ${BALLISTICS_PROFILES_TOTAL} profiles), compare mechanisms in Showdown Lab (S), explore the ${ORDNANCE_TOTAL}-Caliber Small-Arms & Tank Ordnance Lab (B), export HD 3D Share Posters (U), or print 17-Plate Monographs (Ctrl/Cmd+P) at 60 FPS—inspecting ZTZ-99A carousel autoloaders, M1A2 SEP v3 gas turbines, Leopard 2A7V Arrowhead armor, and Tiger 131 88mm breeches.`,
      ctaArmory: 'Enter 3D Digital Armory',
      ctaDirector: (tag) => `Play ${tag} 3D Documentary`,
      ctaExplode: (tag) => `Open ${tag} Disassembly`,
      ctaFiring: 'Live Ballistics & SFX',
      ctaShowdown: 'Mechanism Showdown (S)',
      ctaShowdownTitle:
        'Open 3-Axis Mechanical Lineage Matrix & Dual-Exhibit Showdown Lab (Shortcut: S)',
      ctaCartridges: `${ORDNANCE_TOTAL}-Caliber Ordnance Lab (B)`,
      ctaCartridgesTitle: `Open ${ORDNANCE_TOTAL}-Caliber (${LAB_CALIBER_TOTAL} Small-Arms + ${TANK_ORDNANCE_TOTAL} Tank Ordnance) 1:1 Cutaway Lab (Shortcut: B)`,
      ctaBallistics: '1,000m Trajectory Lab (R)',
      ctaBallisticsTitle: `Open 1,000m RK4 External Ballistics (${BALLISTICS_PROFILES_TOTAL} profiles), Crosswind Drift, FFP Reticle & Sniper DOPE Lab (Shortcut: R)`,
      ctaPoster: 'HD 3D Share Poster (U)',
      ctaPosterTitle:
        'Open Instant HD 3D Cutaway Social Poster Studio with QR Deep-Link & Armorer Rank Seal (Shortcut: U)',
      ctaMonograph: (tag) => `Print ${tag} 3D Picture Book / Monograph`,
      ctaMonographTitle:
        'Open 17-Plate 3D Picture Book & Collector Monograph Print Studio (Ctrl/Cmd+P)',
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
      {
        val: `${VAULT_EXHIBIT_COUNT} Icons`,
        lbl: `${VAULT_FIREARM_COUNT} Firearms, ${VAULT_ARCHERY_COUNT} Archery & ${VAULT_ARMOR_COUNT} 1:1 MBTs · Full Lineage`,
      },
      {
        val: `${VAULT_PARTS_TOTAL} Parts`,
        lbl: 'Draco + Manifold CSG Nodes · Zero Clipping',
      },
      {
        val: `${VAULT_TEXTURES_TOTAL} Maps`,
        lbl: `2K/4K 5-Channel Packed ORM · ${VAULT_SUITES_TOTAL} Texture Suites`,
      },
      {
        val: `${VAULT_AUDIO_TOTAL} Clips`,
        lbl: 'Bilingual Gemini TTS R&D & Part Audio',
      },
      {
        val: `${ORDNANCE_TOTAL} Ordnance · ${BALLISTICS_PROFILES_TOTAL} RK4`,
        lbl: '15 Small-Arms + 3 Tank Rounds · 1,000m Ballistics',
      },
    ],
    capabilities: {
      kicker: 'FOUR CORE CAPABILITIES',
      title: 'Four Armorer-Grade 3D Inspection & Simulation Modes',
      desc: `From phosphated roll-marks, 90° caseless rotary breeches, and 6-barrel Gatling cams to the Heavy Armor Hall (ZTZ-99A carousel autoloader, M1A2 SEP v3 gas turbine & blast doors, Leopard 2A7V Arrowhead wedges, and Tiger 131 88mm horizontal wedge), all ${VAULT_EXHIBIT_COUNT} exhibits (${VAULT_PARTS_TOTAL} parts) unify disassembly, 7-stage ballistics, GPU cutaway, 5-channel PBR, 1,000m Range Lab (R · ${BALLISTICS_PROFILES_TOTAL} profiles), Showdown (S), ${ORDNANCE_TOTAL}-Caliber Lab (B), and Share Posters (U).`,
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
          title: `7-Stage Coupled Kinematics + ${ORDNANCE_TOTAL}-Caliber Small-Arms/Tank & Archery Ballistics`,
          desc: 'Faithfully models long/short-stroke pistons, H&K G11 90° caseless rotary breech, VSS 6-baffle suppressor, M134D 6-barrel Gatling, AN-94 pulley-cable hyperburst, ZTZ-99A 22-round floor carousel autoloader, M1A2 & Leopard 2A7V blast-door 120mm reloading, Tiger 131 88mm horizontal sliding-wedge breech, and compound archery.',
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
          title: 'Khronos-Calibrated Metal / Walnut / Polymer / Armor PBR & Live Atlas',
          desc: 'Separates manganese phosphate steel, Colt Royal Blue, hard-coat anodized aluminum, linseed-oiled American walnut, nylon, and 4K composite/Zimmerit armor with an in-browser 2K/4K WebP channel inspector.',
          cta: `Inspect All ${VAULT_TEXTURES_TOTAL} 2K/4K PBR Texture Maps`,
        },
      },
    },
    documentary: {
      kicker: 'MULTIMODAL AUDIO-VISUAL ENGINE · V4.0',
      title: 'Bilingual 4-Act AI Documentary · 3D Director & Acoustic Engine',
      desc: `Beyond silent manual model viewers: all ${VAULT_EXHIBIT_COUNT} firearms, compound archery & 1:1 main battle tank exhibits ship with bilingual 4-act R&D documentaries, ${VAULT_PARTS_TOTAL} spoken component breakdowns, automated 3D camera choreography, and procedural Web Audio acoustics.`,
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
      monographCta: (tag) => `Print ${tag} 17-Plate Picture Book / Monograph`,
      monographCtaTitle:
        'Capture 17 offscreen 3D plates and print bilingual Kids Picture Book or Collector Monograph (Ctrl/Cmd+P)',
      soundBadge: 'PROCEDURAL WEB AUDIO · ZERO ASSET BLOAT',
      soundTitle: `${ORDNANCE_TOTAL}-Caliber Small-Arms/Tank & Archery Acoustics & 7-Stage Foley Synth`,
      soundDesc:
        'Real-time procedural Web Audio synthesis (0 KB external audio bloat): distinguishes 125/120/88mm main battle tank cannon blasts, .50 BMG shockwaves, M134D 3,000 RPM six-barrel buzzsaw roars, H&K G11 2,100 RPM caseless bursts, AN-94 1,800 RPM whistling hyperbursts, VSS 130 dB subsonic whispers, M1 Garand en-bloc "PING!" ringing, and compound bow/crossbow thumps at 1.0x, separates every metallic click at 0.25x, and ducks automatically under TTS voice.',
      caliberRows: [
        {
          caliber: '125mm / 120×570mm / 88×571mmR',
          weaponTag: 'ZTZ-99A / M1A2 SEP v3 / Leopard 2A7V / Tiger 131',
          freqTag: '24–34 Hz Tank Cannon Shockwave & Breech',
          signature:
            '125mm 650 MPa smoothbore & carousel hoist / M1A2 blast-door slam & AGT1500 turbine / Leopard 2A7V L/55A1 / Tiger 131 88mm wedge',
        },
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
          caliber: '.50 AE / 7.62×39mm / .45 ACP',
          weaponTag: 'DEAGLE / AK-15 / KRISS Vector',
          freqTag: '58–74 Hz Heavy Bark & Super V',
          signature:
            'Vector 110° Super V slider 1,200 RPM .45 burst / Gas piston strike + 35° dual-lug rotary lockup clunk',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M249 SAW / M4A1 / P90 / MP5 / P08 / G17',
          freqTag: '84–118 Hz Belt Shuttle & Toggle Snap',
          signature:
            'M249 M27 steel link strip / Luger P08 54° knee-joint toggle snap / P90 90° helical feed & 9mm brass ring',
        },
        {
          caliber: '.30-06 / 12 Gauge / .357 Magnum',
          weaponTag: 'M1 Garand / Benelli M4 / Python',
          freqTag: '62 Hz Boom + 1.74 kHz Clip Ping',
          signature:
            'WWII M1 Garand spring-steel en-bloc clip "PING!" ring / Twin ARGO tappet clink & 12ga elevator / 60° revolver ratchet click',
        },
        {
          caliber: '7.62×51mm NATO / 5.45×39mm',
          weaponTag: 'M134D Minigun / AN-94 Abakan',
          freqTag: '48–82 Hz Rotary Roar & Hyperburst',
          signature:
            'M134D 28V electric 3,000 RPM six-barrel buzzsaw / AN-94 pulley-cable 1,800 RPM twin-shot & figure-8 whistle',
        },
        {
          caliber: '4.73×33mm DM11 / 9×39mm SP-5',
          weaponTag: 'H&K G11 K2 / VSS Vintorez',
          freqTag: '110 Hz Caseless & 130 dB Subsonic',
          signature:
            'G11 90-deg rotary caseless 2,100 RPM 3-rd burst (zero brass) / VSS ported barrel & 6-baffle whispered subsonic thump',
        },
        {
          caliber: '400 gr Carbon Arrow / Bolt · 348–500 FPS',
          weaponTag: 'LIFT 33 / Ravin R500',
          freqTag: '46–54 Hz String Dampener Thump',
          signature:
            'SwitchWeight-X / HexCoil cam uncoil + braided BCY-X bowstring twang & string dampener thump (zero propellant blast)',
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
      desc: 'Every frame below is rendered live in the browser by our open-source dual-track Blender 5.2 Draco .glb + dynamic CSG engine (zero pre-rendered videos, zero closed-source third-party meshes). Click to zoom or jump straight into the live viewport.',
      zoomTitle: 'Click to inspect high-resolution WebGL capture',
      zoomPill: 'Click to Enlarge',
      closeLightboxAria: 'Close high-resolution preview',
      items: [
        {
          id: 'ztz99a-cutaway',
          badge: '1:1 HEAVY ARMOR HALL · ±1,800MM CT CUTAWAY',
          title: 'ZTZ-99A MBT 22-Round Carousel Autoloader & 150HB V12',
          subtitle:
            '1:1 Heavy Armor Assembly Hangar 4K PBR and ±1,800 mm live CT section slice cleanly through composite hull & turret armor, exposing the 125mm ZPT-98 breech, floor carousel, and 1,500 hp V12 engine.',
          imageFile: 'showcase/ztz99a-cutaway.webp',
          weaponId: 'ztz99a',
          actionType: 'section',
          ctaLabel: 'Open ZTZ-99A 1:1 Cutaway',
        },
        {
          id: 'tiger1-macro',
          badge: '4K ZIMMERIT · 96-LINK TRACKS PER SIDE',
          title: 'Tiger I Ausf. E "131" 88mm KwK 36 & Interleaved Roadwheels',
          subtitle:
            '4096x4096 serrated Zimmerit paste maps paired with 512px triplanar RNM rolled-steel detail and 96 articulated sagged Kgs 63 track links per side over the iconic 48-wheel Schachtellaufwerk suspension.',
          imageFile: 'showcase/tiger1-macro.webp',
          weaponId: 'tiger1',
          actionType: 'explode',
          ctaLabel: 'Disassemble Tiger 131 Heavy Tank',
        },
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
          badge: '2K / 4K WEBP · TEXTURE INSPECTOR',
          title:
            'Built-In 3-Channel PBR Atlas Inspector (Albedo / Normal / ORM)',
          subtitle: `Toggle, zoom, and download all ${VAULT_TEXTURES_TOTAL} Cycles-baked 2K/4K WebP maps directly in the browser with ultra-fast lossless-grade compression.`,
          imageFile: 'showcase/pbr-atlas.webp',
          weaponId: 'ak15',
          actionType: 'atlas',
          ctaLabel: 'Open Live PBR Texture Atlas',
        },
      ],
    },
    arsenal: {
      kicker: `${VAULT_EXHIBIT_COUNT}-BAY MASTER ROSTER · FACTORY 1:1`,
      title: `${VAULT_EXHIBIT_COUNT} Iconic Firearms, Archery & 1:1 Main Battle Tanks · Metrology Matrix`,
      desc: 'Spanning all 3 orthogonal firearm axes, compound archery, and the new 1:1 Heavy Armor Hall (ZTZ-99A, M1A2 SEP v3 Abrams, KMW Leopard 2A7V, WWII Tiger 131)—each equipped with Blender 5.2 Draco + CSG internals, a 4-act bilingual documentary, Armorer Qualification exams, and Dual-Exhibit Mechanism Showdown (S).',
      filterAria: 'Filter vault collection by category',
      categories: {
        all: 'All Vault',
        assault: 'Rifle / Carbine / Bullpup',
        lmg: 'LMG / Rotary',
        smg: 'SMG / PDW',
        sniper: 'Sniper / Anti-Materiel',
        shotgun: 'Shotguns',
        pistol: 'Pistol / Revolver',
        archery: 'Bow / Crossbow',
        armor: 'Heavy Armor',
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
      title: 'Industrial-Grade TypeScript + Blender 5.2 + Web Audio Pipeline',
      desc: 'Zero closed-source static 3D blobs—combining reproducible MIT Blender 5.2 Draco .glb meshes, Worker-isolated dynamic CSG springs, transient 60Hz animation clocks, automated story choreography, and procedural acoustic synthesis.',
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
          desc: `Initial load pulls static catalog metadata (manifests.ts); all ${VAULT_EXHIBIT_COUNT} exhibit BOMs, kinematic equations, narration JSONs, and CSG builders lazy-load on demand.`,
          metric: `${VAULT_EXHIBIT_COUNT} Dynamic Chunks`,
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
          title: '60Hz Internal/External Ballistics & IR Audio',
          desc: `Zero-GC transient clock drives 60fps ${ORDNANCE_TOTAL}-caliber small-arms & tank cannon chamber curves, 1,000m RK4 FFP ballistics (${BALLISTICS_PROFILES_TOTAL} profiles, R), Showdown traces (S), and stereo convolution waveguide SFX.`,
          metric: '60 FPS Zero Re-render',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: 'GTAO + AgX Cinema, Share Poster & Print Studio',
          desc: `${VAULT_SUITES_TOTAL} suites (${VAULT_TEXTURES_TOTAL} 5-channel ORM maps) pair with sub-mm GTAO, HDR bloom, and AgX tone mapping; 3D Director syncs to ${VAULT_AUDIO_TOTAL} TTS clips alongside Share Posters (U) and 17-Plate Monographs (Ctrl/Cmd+P).`,
          metric: `${VAULT_AUDIO_TOTAL} Clips · ${VAULT_SUITES_TOTAL} Suites`,
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: 'Two-Pass Stencil Cutaway & Raycast Picking',
          desc: 'WebGL Stencil front/back parity caps solid cross-sections with ISO 128 metallic hatching while sectionAwareMeshRaycast picks internal parts cleanly.',
          metric: 'Solid Cross-Section',
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: 'Full-Vault Anti-Clipping & Ballistics Contracts',
          desc: `Automated Vitest suites verify unit normals, UV bounds, Khronos PBR luminance floors, ${VAULT_AUDIO_TOTAL} audio assets, 1,000m RK4 trajectories, and Armorer Qualification grading across all ${VAULT_PARTS_TOTAL} parts.`,
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
        {
          key: 'Cmd / Ctrl + K',
          label:
            'Open Global Bilingual Command Palette (27 exhibits, 683 parts, labs & toggles)',
        },
        {
          key: 'Space',
          label: 'Play / Pause disassembly or live firing cycle',
        },
        { key: 'C', label: 'Toggle Stencil solid armorer section-cut' },
        {
          key: 'T',
          label: 'Toggle 6-Role Engineering Tint & 60fps propellant gas flow',
        },
        {
          key: 'G',
          label: 'Toggle Hands-On Field-Strip & Timed Blind Exam (DAG)',
        },
        {
          key: 'J',
          label:
            'Toggle Classic Malfunction Cutaway & Mystery Triage Exam',
        },
        {
          key: 'K',
          label: 'Toggle 1:1 3D Armorer Vernier Caliper (mm) & envelope ruler',
        },
        {
          key: 'R',
          label:
            'Open / Return from 1,000m RK4 External Ballistics & FFP Reticle Lab',
        },
        {
          key: 'U',
          label:
            'Open / Close Instant HD 3D Cutaway Social Poster Studio & QR Seal',
        },
        {
          key: 'B',
          label: `Open / Exit ${ORDNANCE_TOTAL}-Caliber Small-Arms & Tank Ordnance 1:1 Cutaway Lab`,
        },
        {
          key: 'S',
          label:
            'Open / Close 3-Axis Mechanism Showdown & Dual-Exhibit Comparison Lab',
        },
        {
          key: 'P / V / F',
          label: 'Press-Check / Fire Selector / Hold Trigger',
        },
        { key: 'X', label: 'Toggle outer receiver & slide X-Ray cutaway' },
        { key: 'M', label: 'Mute / Unmute mechanical & ballistic Web Audio' },
        { key: 'E', label: 'Show / Hide industrial CAD hard-edge lines' },
        { key: 'L', label: 'Toggle zero-reflow 3D component callout tags' },
        {
          key: 'H',
          label:
            'Hide / Restore all HUD UI chrome for Clean Fullscreen 3D view',
        },
        {
          key: 'Ctrl/Cmd+P',
          label:
            'Open 17-Plate 3D Picture Book & Collector Monograph Print Studio',
        },
        {
          key: 'Shift+R / Esc',
          label: 'Reset 0% state / Clear part or exit to Vault',
        },
      ],
      finalKicker: 'READY FOR INSPECTION',
      finalTitle:
        'Step Inside the 3D Armory & Experience Interactive Engineering',
      finalSub:
        'Full Chinese/English parity, 1,000m Trajectory Lab (R), HD 3D Cutaway Share Posters (U), 17-Plate Monograph printing (Ctrl/Cmd+P), and touch-optimized iPad/mobile controls. Open-source under MIT—star the repo on GitHub!',
      finalLaunchBtn: `Launch ${VAULT_EXHIBIT_COUNT}-Bay 3D Armory`,
      finalStarBtn: 'Star on GitHub',
      footerBrand:
        'Digital Armory 3D · Open-Source 3D Firearms Mechanical Museum',
      footerDisclaimer:
        'Schematic / Educational-grade mechanical visualization & interactive encyclopedia · Contains zero manufacturing tolerances or 3D-printable blueprints.',
    },
  },
};

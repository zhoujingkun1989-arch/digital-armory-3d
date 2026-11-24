import type { LanguageCode } from '../narration/types';
import {
  MUSEUM_ARCHERY_COUNT,
  MUSEUM_BALLISTICS_PROFILE_COUNT,
  MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT,
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_FIREARM_COUNT,
  MUSEUM_HALL_COUNT,
  MUSEUM_HEAVY_ARMOR_COUNT,
  MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT,
  MUSEUM_ORDNANCE_COUNT,
  MUSEUM_PBR_SUITE_COUNT,
  MUSEUM_PBR_WEBP_COUNT,
  MUSEUM_PENETRATOR_COUNT,
  MUSEUM_SMALL_ARMS_CALIBER_COUNT,
  MUSEUM_TOTAL_PARTS,
  MUSEUM_VERSION,
} from '../weapons/museumMetrics';
import type { ArmoryCategory, WeaponId } from '../weapons/types';

const VAULT_EXHIBIT_COUNT = MUSEUM_EXHIBIT_COUNT; // 34
const VAULT_HALLS_COUNT = MUSEUM_HALL_COUNT; // 10
const VAULT_ARCHERY_COUNT = MUSEUM_ARCHERY_COUNT; // 2
const VAULT_ARMOR_COUNT = MUSEUM_HEAVY_ARMOR_COUNT; // 4
const VAULT_ORDNANCE_COUNT = MUSEUM_ORDNANCE_COUNT; // 1
const VAULT_FIREARM_COUNT = MUSEUM_FIREARM_COUNT; // 27
const VAULT_EXHIBIT_ZH = '三十四';
const VAULT_PARTS_TOTAL = MUSEUM_TOTAL_PARTS; // 854
const VAULT_TEXTURES_TOTAL = MUSEUM_PBR_WEBP_COUNT; // 414
const VAULT_SUITES_TOTAL = MUSEUM_PBR_SUITE_COUNT; // 101
const VAULT_AUDIO_TOTAL = 1980;
const LAB_CALIBER_TOTAL = MUSEUM_SMALL_ARMS_CALIBER_COUNT; // 17
const TANK_ORDNANCE_TOTAL = MUSEUM_HEAVY_ORDNANCE_CALIBER_COUNT; // 4
const ORDNANCE_TOTAL = MUSEUM_CARTRIDGE_LAB_TOTAL_COUNT; // 21
const BALLISTICS_PROFILES_TOTAL = MUSEUM_BALLISTICS_PROFILE_COUNT; // 23
const PENETRATOR_TOTAL = MUSEUM_PENETRATOR_COUNT; // 5
const SHOWDOWN_RIVALRIES_TOTAL = 30;
const CUSTOM_DUEL_MATRIX_LABEL = `${VAULT_EXHIBIT_COUNT} × ${VAULT_EXHIBIT_COUNT - 1}`;
const VAULT_RATIO = `${VAULT_EXHIBIT_COUNT}/${VAULT_EXHIBIT_COUNT}`;
const GLOSSARY_TERMS_TOTAL = 28;
const VERSION_UPPER = MUSEUM_VERSION.toUpperCase();

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

export interface ShowcaseCertificationBadgeCopy {
  id: 'exhibits' | 'wcag' | 'webgl' | 'pwa' | 'bilingual';
  tone: 'cyan' | 'emerald' | 'amber';
  value: string;
  label: string;
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
    ctaArmorTheater: string;
    ctaArmorTheaterTitle: string;
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
    carouselPrevAria: string;
    carouselNextAria: string;
    ctaArmoryVault: string;
    ctaDirectorWatch: (shortTag: string) => string;
  };
  physicsLabs: {
    kicker: string;
    title: string;
    desc: string;
    cards: {
      range3d: { badge: string; title: string; desc: string; cta: string };
      armorTheater: { badge: string; title: string; desc: string; cta: string };
      cartridgeLab: { badge: string; title: string; desc: string; cta: string };
      showdown: { badge: string; title: string; desc: string; cta: string };
      explode: {
        badge: string;
        title: string;
        desc: string;
        cta: (shortTag: string) => string;
      };
      firing: { badge: string; title: string; desc: string; cta: string };
      poster: { badge: string; title: string; desc: string; cta: string };
      monograph: {
        badge: string;
        title: string;
        desc: string;
        cta: (shortTag: string) => string;
      };
      scaleWall: { badge: string; title: string; desc: string; cta: string };
      recoilLab: { badge: string; title: string; desc: string; cta: string };
    };
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
    certificationsAria: string;
    certifications: readonly ShowcaseCertificationBadgeCopy[];
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
      versionBadge: `${MUSEUM_VERSION} · ${VAULT_EXHIBIT_COUNT} 馆藏 ${VAULT_HALLS_COUNT} 展厅三维物理旗舰版`,
      capabilities: '四大核心模式',
      documentary: 'AI 导演纪录片',
      gallery: '实机渲染画廊',
      arsenal: `${VAULT_EXHIBIT_ZH}款馆藏兵器`,
      architecture: '三维引擎架构',
      quickstart: '开源快速部署',
      launchArmory: '进入 3D 数字枪库',
    },
    hero: {
      eyebrow: `OPEN-SOURCE WEBGL 2.0 MUSEUM · ${VAULT_EXHIBIT_COUNT} EXHIBITS · ${VAULT_HALLS_COUNT} HALLS · ${VAULT_AUDIO_TOTAL} AI VOICE CLIPS · 3D PHYSICS THEATERS`,
      titlePrefix: `把${VAULT_EXHIBIT_ZH}款传奇名枪、主战坦克与 1:1 30mm 航炮的 `,
      titleHighlight: '1:1 机械内构与三维物理剧场',
      titleSuffix: '，装进你的浏览器',
      subLead: 'Blender 5.2 高模 + 实时 CSG 双轨雕塑 ',
      subPartsStrong: `${VAULT_PARTS_TOTAL} 枚运动零件`,
      subMid1: '、',
      subMapsStrong: `${VAULT_TEXTURES_TOTAL} 张 2K/4K PBR 贴图`,
      subMid2: ' 与 ',
      subAudioStrong: `${VAULT_AUDIO_TOTAL} 段双语导览语音`,
      subTail: '。零安装 60 FPS 直入实时 CT 纵剖、3D 穿甲剧场与千米实弹靶场。',
      ctaArmory: '立即进入 3D 数字枪库',
      ctaDirector: (tag) => `3D 导演连播 ${tag} 纪录片`,
      ctaExplode: (tag) => `直达 ${tag} 爆炸拆解台`,
      ctaFiring: '播放实弹击发与声浪',
      ctaShowdown: '原理流派对照矩阵 (S)',
      ctaShowdownTitle: `打开三轴机械谱系矩阵与双展品同屏定量对照实验室（${SHOWDOWN_RIVALRIES_TOTAL} 组经典对决 · 快捷键: S）`,
      ctaCartridges: `${ORDNANCE_TOTAL} 口径弹药与炮弹馆 (B)`,
      ctaCartridgesTitle: `进入 ${LAB_CALIBER_TOTAL} 口径轻武器实弹 + ${TANK_ORDNANCE_TOTAL} 口径航炮/主战坦克炮弹 1:1 纵剖对比实验室 (快捷键: B)`,
      ctaBallistics: '3D 千米靶场与子弹镜头 (R)',
      ctaBallisticsTitle: `打开 3D 1,000m 交互实弹靶场、子弹时间追踪镜头（Bullet-Cam）、AR500 钢靶与弹道明胶实验室（${BALLISTICS_PROFILES_TOTAL} 套 RK4 档案 · 快捷键: R）`,
      ctaArmorTheater: '3D 复合装甲穿甲剧场',
      ctaArmorTheaterTitle:
        '打开 1:1 复合装甲三维慢动作穿甲剖视剧场，实时推演 5 款动能穿甲弹（含 30×173mm GAU-8 API）冲击 ERA 与崩落粒子锥',
      ctaPoster: '3D 剖视分享海报 (U)',
      ctaPosterTitle:
        '生成带二维码与军械师考核认证章的高清 16:9 / 4:5 社交分享海报 (快捷键: U)',
      ctaMonograph: (tag) => `打印 ${tag} 3D 绘本 / 图鉴`,
      ctaMonographTitle:
        `打开 ${VAULT_RATIO} Cycles 17 图版 3D 绘本与收藏图鉴打印工坊 (快捷键: Ctrl/Cmd+P)`,
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
      carouselPrevAria: '向左滚动展品轮播',
      carouselNextAria: '向右滚动展品轮播',
      ctaArmoryVault: `进入 ${VAULT_EXHIBIT_COUNT} 展位 3D 数字枪库`,
      ctaDirectorWatch: (tag) => `观看 ${tag} 3D 导演纪录片`,
    },
    physicsLabs: {
      kicker: `3D PHYSICS THEATERS & ENGINEERING LABS · ${VERSION_UPPER}`,
      title: '探索三维物理剧场与交互工程实验室',
      desc: `超越静态展柜：在 1,000m 实弹靶场追踪 Litz 旋转漂移与施利伦马赫锥、在 1:1 复合装甲剧场观摩 Tate 流体侵彻、横跨 ${CUSTOM_DUEL_MATRIX_LABEL} 任意定制机构对决与 ${GLOSSARY_TERMS_TOTAL} 词条工程词典，一键直达暗室与工程白昼双影棚。`,
      cards: {
        range3d: {
          badge: '3D PROVING GROUND · R',
          title: '3D 1,000m 实弹靶场与子弹时间追踪',
          desc: `${BALLISTICS_PROFILES_TOTAL} 套 RK4 G1/G7 弹道、Applied Ballistics Litz 旋转漂移、Don Miller Sg 稳定性、施利伦马赫锥、AR500 撞击火花与 d/343 声波回传。`,
          cta: '进入千米实弹靶场',
        },
        armorTheater: {
          badge: '3D ARMOR THEATER',
          title: '1:1 复合装甲三维慢动作穿甲剧场',
          desc: `${PENETRATOR_TOTAL} 款动能穿甲弹（含 30mm GAU-8 API 与 125mm APFSDS）实时求解 Tate 流体侵彻方程，演绎 ERA 双飞板剪切与车内崩落粒子锥。`,
          cta: '启动三维穿甲剧场',
        },
        cartridgeLab: {
          badge: '1:1 ORDNANCE LAB · B',
          title: `${ORDNANCE_TOTAL} 口径实弹、航炮与坦克穿甲弹纵剖馆`,
          desc: `${LAB_CALIBER_TOTAL} 款轻武器实弹 + ${TANK_ORDNANCE_TOTAL} 款重型炮弹 1:1 毫米标尺并排纵剖，直视 APFSDS 尾翼穿甲杆、三瓣弹托与双弹对比。`,
          cta: '进入弹药纵剖馆',
        },
        showdown: {
          badge: 'LIVE 3D SPLIT-SCREEN · S',
          title: `通用 ${CUSTOM_DUEL_MATRIX_LABEL} 定制机构对决与六维雷达`,
          desc: `${SHOWDOWN_RIVALRIES_TOTAL} 组跨时代经典对决 + 通用 ${CUSTOM_DUEL_MATRIX_LABEL} 任意自由配对、六轴工程指标雷达与单画布双视口 3D 同步剖视击发。`,
          cta: '打开原理对照台',
        },
        explode: {
          badge: 'WORKBENCH · DAG & GLOSSARY',
          title: `三维螺旋膛线剖视、精拆 DAG 与 ${GLOSSARY_TERMS_TOTAL} 词条百科`,
          desc: `全馆 ${VAULT_EXHIBIT_COUNT} 款支持真三维螺旋膛线剖切、野战/全枪两级精拆 DAG、${GLOSSARY_TERMS_TOTAL} 词条双语机械百科、模块化光学/枪口改装（O）与工程白昼影棚。`,
          cta: (tag) => `直达 ${tag} 爆炸拆解`,
        },
        firing: {
          badge: 'BALLISTICS & HEAVY SFX',
          title: '膛内燃爆辉光、三瓣脱壳分离与重装声场',
          desc: '膛内底火燃爆辉光、1:1 主战坦克三瓣铝制弹托 120° 气动分离、抽烟装置排烟、GAU-8/M134 旋翼动态模糊光环与脱壳气爆/底托撞击/液压电机声效。',
          cta: '播放实弹击发循环',
        },
        poster: {
          badge: 'SHARE STUDIO · U',
          title: '高清 3D 剖视与膛线计量海报工坊',
          desc: '一键合成 16:9 / 4:5 博物馆收藏级 3D 剖视海报，内嵌缠距膛线与闭锁原理印记、直达二维码与军械师认证印章。',
          cta: '制作分享海报',
        },
        monograph: {
          badge: 'PRINT STUDIO · CMD+P',
          title: `${VAULT_EXHIBIT_COUNT}/${VAULT_EXHIBIT_COUNT} Cycles 17 图版 3D 绘本与图鉴`,
          desc: '调用全馆 2880×1800 Cycles 印刷主图，一键排版双语儿童 3D 机械绘本与 DK 风格视觉百科。',
          cta: (tag) => `打印 ${tag} 17 图版图鉴`,
        },
        scaleWall: {
          badge: '1:1 TRUE SCALE',
          title: `史密森尼式 1:1 真实尺度对比墙（全馆 ${VAULT_EXHIBIT_COUNT} 展品）`,
          desc: '按毫米级绝对比例并排比对手枪、步枪、6.06m GAU-8 航炮、10m 主战坦克与 1.75m 人体参照。',
          cta: '打开 1:1 尺度墙',
        },
        recoilLab: {
          badge: 'RECOIL & TORQUE LAB',
          title: '后坐冲量、燃气动量与枪口上跳物理实验室',
          desc: '定量分解弹丸与火药燃气喷射动量、制退器反推减冲、120 点 F(t) 力波形与枪管轴线上跳力矩。',
          cta: '启动后坐实验室',
        },
      },
    },
    metrics: [
      {
        val: `${VAULT_EXHIBIT_COUNT} 款 · ${VAULT_HALLS_COUNT} 展厅`,
        lbl: `${VAULT_FIREARM_COUNT} 名枪 + ${VAULT_ARCHERY_COUNT} 弓弩 + ${VAULT_ARMOR_COUNT} 坦克 + ${VAULT_ORDNANCE_COUNT} 航炮`,
      },
      { val: `${VAULT_PARTS_TOTAL} 件`, lbl: 'Draco 高模 + 实时 CSG 零件 · 零穿模' },
      {
        val: `${VAULT_TEXTURES_TOTAL} 张`,
        lbl: `2K/4K 5 通道 ORM 物理贴图 · ${VAULT_SUITES_TOTAL} 套材质图集`,
      },
      {
        val: `${VAULT_AUDIO_TOTAL} 段`,
        lbl: '中英双语 Charon AI 研发故事与零件配音',
      },
      {
        val: `${ORDNANCE_TOTAL} 口径 · ${BALLISTICS_PROFILES_TOTAL} 弹道`,
        lbl: `${LAB_CALIBER_TOTAL} 实弹 + ${TANK_ORDNANCE_TOTAL} 航炮/坦克弹 · 3D 千米靶场`,
      },
    ],
    capabilities: {
      kicker: `FOUR CORE CAPABILITIES · ${VERSION_UPPER} 3D THEATERS`,
      title: '四大军械级三维检视、改装与物理剧场模式',
      desc: `从 M1911A1 单绞链、MG 42 对称双滚柱、毛瑟 98k 大抓钩、汤姆逊 50 发发条圆鼓到第十展厅 1:1 GAU-8/A「复仇者」30mm 七管航炮与四大主战坦克，全部 ${VAULT_EXHIBIT_COUNT} 款展品 ${VAULT_PARTS_TOTAL} 个零件打通「真三维螺旋膛线与膛内燃爆辉光、三瓣脱壳分离与旋翼模糊光环、三轴 CT 纵剖、${GLOSSARY_TERMS_TOTAL} 词条工程百科、模块化光学/枪口改装（O）与工程白昼影棚」，并联动 3D Tate 穿甲剧场、3D 1,000m Litz/施利伦实弹靶场（R · ${BALLISTICS_PROFILES_TOTAL} 档案）、通用 ${CUSTOM_DUEL_MATRIX_LABEL} 对决矩阵（S）与 ${ORDNANCE_TOTAL} 口径弹药馆（B）。`,
      cards: {
        explode: {
          alt: 'AK-15M1 零回流引线与多级爆炸拆解工作台',
          tag: 'MODE 01 · EXPLODED CAD, MODS (O) & GLOSSARY',
          title: `渐进式三级爆炸拆解、${GLOSSARY_TERMS_TOTAL} 词条百科与模块化改装 (O)`,
          descPrefix:
            '支持「0% 合拢 → 30% 野战快拆 → 65% 细拆 → 100% 全爆炸」与两级精拆 DAG、内联 28 词条史密森尼式双语工程百科，一键挂载钛合金 K 挡板消音器、双室制退器、1–8× LPVO 与串列 FLIR（O），实时耦合燃气涡旋、声学衰减与 ',
          descSuffix: ' 毫米三维包络尺寸。',
          cta: '打开 AK-15M1 拆解演示台',
        },
        firing: {
          alt: 'Barrett M82A1 .50 BMG 整管短后坐与箭头制退侧喷',
          tag: 'MODE 02 · SABOT DISCARD, ROTARY HALO & 3D THEATERS',
          title: `膛内燃爆辉光、三瓣脱壳分离、旋翼光环与 ${ORDNANCE_TOTAL} 口径内弹道`,
          desc: `严格遵循全部 ${VAULT_EXHIBIT_COUNT} 款机械定律：新增膛内底火燃爆辉光、1:1 主战坦克三瓣铝制弹托 120° 气动分离与抽烟装置排烟、GAU-8/A 与 M134D 旋翼动态模糊光环；联动 Applied Ballistics Litz 旋转漂移 / Don Miller Sg / 施利伦马赫锥 / AR500 火花千米靶场，以及 Tate 流体侵彻 3D 复合装甲剧场。`,
          cta: '体验巴雷特 .50 BMG 慢放击发',
        },
        section: {
          alt: '纵向中轴军械剖视切面',
          tag: 'MODE 03 · 3D HELICAL RIFLING BORE & TRI-AXIAL CT (C)',
          title: `全馆 ${VAULT_RATIO} 真三维螺旋膛线剖视、三轴 CT 与 6 面 3D 剖切盒`,
          descPrefix: '按下 ',
          descSuffix:
            ` 键沿 Z/X/Y 三轴或 6 面 3D 剖切盒实时切开枪管、机匣、螺旋弹鼓与消音器内部 7 级 K 挡板，直视全馆 ${VAULT_EXHIBIT_COUNT} 款真三维螺旋阴线/阳线缠距与博克塞底火引燃闪光；鼠标穿透剖面精准点选内部零件听取双语讲解。`,
          cta: '直达纵向军械剖视模式',
        },
        pbr: {
          alt: '5 通道 Packed ORM 物理贴图图集检视器',
          tag: 'MODE 04 · BLUEPRINT DAYLIGHT & 5-CHANNEL ORM',
          title: '暗室展厅 / 工程白昼双影棚、2K/4K PBR 与 KTX2 离线管线',
          desc: '在深邃战术暗室与高对比度工程白昼（Blueprint Daylight）影棚间无缝切换，精准区分磷化钢、皇家烤蓝、黑胡桃木与 4K 复合/防磁装甲，配合 KTX2 / CDN / PWA 离线缓存与浏览器内 2K/4K WebP 三通道图集检视。',
          cta: `打开 ${VAULT_TEXTURES_TOTAL} 张 PBR 贴图图集检视器`,
        },
      },
    },
    documentary: {
      kicker: `MULTIMODAL AUDIO-VISUAL ENGINE · ${VERSION_UPPER}`,
      title: 'AI 四幕双语研发纪录片 · 3D 导演运镜 & 军械声场',
      desc: `告别无声手动拖拽模型的传统看图模式：全馆藏 ${VAULT_EXHIBIT_COUNT} 款名枪、复合弓弩、1:1 主战坦克与 1:1 GAU-8/A 30mm 七管航炮内置中英双语四幕研发史、${VAULT_PARTS_TOTAL} 枚零件独立配音、1080p 导演录屏、自动镜头编排器与物理耦合 Web Audio 声场。`,
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
      pickWeaponLabel: '选择馆藏名枪、弓弩、主战坦克或 30mm 航炮立即体验 3D 导演纪录片：',
      launchTourCta: (tag) => `全屏导演播放 ${tag} 四幕纪录片`,
      openDrawerCta: '打开图文+字幕抽屉',
      monographCta: (tag) => `打印 ${tag} 17 图版绘本 / 图鉴`,
      monographCtaTitle:
        '一键离线抓拍 17 图版并排版打印双语绘本与收藏图鉴 (Ctrl/Cmd+P)',
      soundBadge: 'PROCEDURAL WEB AUDIO · 四场所卷积与重装声学',
      soundTitle: `${ORDNANCE_TOTAL} 口径重装脱壳、旋翼电机与四场所卷积混响声场`,
      soundDesc:
        '基于 Web Audio API 实时物理建模（零外部音频体积膨胀）：新增 125/120mm APFSDS 超音速脱壳气爆、主战坦克转盘/尾舱底托撞击与虎式 88mm 全黄铜壳长鸣、GAU-8/A 双液压与 M134D 28V 直流电机启停谐波啸叫，搭配四场所立体声卷积混响（近场台/靶道/穹顶/旷野）、欧拉-伯努利钢材波导与模块化消音/制退实时频谱耦合。',
      caliberRows: [
        {
          caliber: '125mm / 120×570mm / 88×571mmR / 30×173mm',
          weaponTag: 'ZTZ-99A / M1A2 / Leopard 2A7V / Tiger 131 / GAU-8/A',
          freqTag: '24–42 Hz 脱壳气爆、底托撞击与双液压咆哮',
          signature:
            'APFSDS 三瓣弹托超音速裂空 + AZ 转盘/尾舱底托金属撞击 + 虎式 88mm 黄铜壳余鸣 + GAU-8/A 双液压马达啸叫与 3,900 RPM 65 Hz「BRRRT!」',
        },
        {
          caliber: '12.7×99mm (.50 BMG) / 7.92×57mm Mauser',
          weaponTag: 'M82A1 / MG 42 / Mauser K98k',
          freqTag: '38–54 Hz 重炮震波与 1,200 RPM 撕布声',
          signature:
            'MG 42 对称双滚柱 1,200 RPM 极速连射 / 毛瑟 98k 90° 抬栓清脆拉机 / 巴雷特 60° 箭头制退侧喷轰鸣',
        },
        {
          caliber: '.338 Lapua Magnum',
          weaponTag: 'AWM',
          freqTag: '50 Hz 高压裂空',
          signature: '超音速鞭响 + 60° 螺旋防冰枪机拉栓抽壳金属声',
        },
        {
          caliber: '.50 AE / 7.62×39mm / .45 ACP',
          weaponTag: 'DEAGLE / AK-15 / M1911A1 / Thompson / KRISS Vector',
          freqTag: '58–74 Hz 重弹、布利什锁与偏轴连发',
          signature:
            'M1911A1 锻钢套筒闭锁 / 汤姆逊 50 发圆鼓连射 / Vector 110° Super V 滑块 1,200 RPM 亚音速连射 / AK 导气活塞冲击',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M249 SAW / M4A1 / P90 / MP5 / P08 / G17',
          freqTag: '84–118 Hz 弹链拨爪与肘节清鸣',
          signature:
            'M249 双拨爪 M27 铁链节剥离 / P08 54° 肘节折起咔哒 / P90 90° 螺旋供弹与 9mm 弹壳清鸣',
        },
        {
          caliber: '.30-30 Win / .30-06 / 12 Gauge / .357 Mag',
          weaponTag: 'Winchester 1894 / M1 Garand / Benelli M4 / Rem 870 / Python',
          freqTag: '62 Hz 轰鸣 + 1.74 kHz 漏夹清鸣',
          signature:
            'Winchester 94 杠杆闭锁滑块叮响 / Remington 870 双拉杆唧筒推拉 / 伽兰德漏夹「PING!」/ ARGO 与转轮分度',
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
        '重装与旋翼同步声学：APFSDS 超音速脱壳气爆、主战坦克底托金属撞击、GAU-8/A 液压与 M134D 28V 电机启停啸叫 + 4 场所卷积混响与声学试听台',
        '8 点相位硬绑定 + TTS 智能闪避：旁白与零件语音播放时，机械与重炮声效自动平滑衰减至 -12.4 dB，人声清晰不掩蔽',
        '独立静音与试听控制：工作台声学试听台、发射时间轴与全局快捷键 M 随时一键静音或试听实弹/拉栓/抛壳声效',
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
      kicker: `${VAULT_EXHIBIT_COUNT}-BAY · ${VAULT_HALLS_COUNT}-HALL MASTER ROSTER · FACTORY 1:1`,
      title: `${VAULT_EXHIBIT_ZH}大传奇名枪、弓弩、主战坦克与 1:1 30mm 航炮测绘馆藏矩阵`,
      desc: `全面覆盖人类轻武器三大正交机械谱系（含 V6.0 新增 M1911A1、MG 42、毛瑟 98k、汤姆逊 M1928A1）、复合弓弩、1:1 重装甲大厅（ZTZ-99A、M1A2 SEP v3、豹 2A7V、虎式 131）与第十展厅「航空重武」（1:1 GAU-8/A「复仇者」30mm 七管航炮），全馆 100% 配备 Blender 5.2 高模 Draco + CSG 双轨内构、四幕双语纪录片、全零件配音与同屏定量对照（S · ${SHOWDOWN_RIVALRIES_TOTAL} 组对决）。`,
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
        ordnance: '航空重武',
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
      kicker: 'ENGINEERING ARCHITECTURE & LIVE CERTIFICATIONS',
      title: '纯 TypeScript + Blender 5.2 + Web Audio 工业级管线',
      desc: '完全开源可复现的 Blender 5.2 Draco `.glb` + Web Worker 动态 CSG 双轨架构，打通暗室/工程白昼双影棚、真三维螺旋膛线与脱壳分离 VFX、四场所重装声学，并获 75/75 WCAG 2.1 AA 与 60 FPS WebGL 实机认证。',
      certificationsAria: '实时工程认证与架构指标徽章',
      certifications: [
        {
          id: 'exhibits',
          tone: 'cyan',
          value: `${VAULT_EXHIBIT_COUNT} 馆藏 · ${VAULT_HALLS_COUNT} 展厅`,
          label: `${VAULT_PARTS_TOTAL} 枚运动零件`,
        },
        {
          id: 'wcag',
          tone: 'emerald',
          value: '75/75 WCAG 2.1 AA',
          label: '100% 实机无障碍认证',
        },
        {
          id: 'webgl',
          tone: 'cyan',
          value: '60 FPS WebGL 2.0',
          label: '暗室与工程白昼双影棚',
        },
        {
          id: 'pwa',
          tone: 'amber',
          value: '零依赖离线 PWA',
          label: `${VAULT_TEXTURES_TOTAL} PBR 贴图 · ${VAULT_AUDIO_TOTAL} 语音`,
        },
        {
          id: 'bilingual',
          tone: 'emerald',
          value: '100% 中英双语',
          label: `${GLOSSARY_TERMS_TOTAL} 词条百科 · ${CUSTOM_DUEL_MATRIX_LABEL} 对决`,
        },
      ],
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
          title: '60Hz 三维物理剧场、脱壳 VFX 与重装声场',
          desc: `零 GC 瞬态时钟同步驱动 ${ORDNANCE_TOTAL} 口径内弹道、Tate 流体侵彻 3D 装甲剧场、Litz/Miller/施利伦 3D 千米靶场（${BALLISTICS_PROFILES_TOTAL} 档案，R）、三瓣脱壳与旋翼光环 VFX 及四场所卷积重装声效。`,
          metric: '60 FPS 零重渲染',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: 'GTAO + AgX、工程白昼影棚与离线 PWA 出版',
          desc: `全馆 ${VAULT_SUITES_TOTAL} 套图集 ${VAULT_TEXTURES_TOTAL} 张 5 通道 ORM 贴图支持暗室/工程白昼双影棚、toktx KTX2 / CDN / PWA 离线博物馆；3D 导演同步 ${VAULT_AUDIO_TOTAL} 段语音，内置 1080p 录屏、膛线海报（U）与 ${VAULT_EXHIBIT_COUNT}/${VAULT_EXHIBIT_COUNT} Cycles 图鉴打印（Ctrl/Cmd+P）。`,
          metric: `${VAULT_AUDIO_TOTAL} 语音 · ${VAULT_SUITES_TOTAL} 图集`,
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: `${VAULT_RATIO} 真三维螺旋膛线、膛内燃爆与三轴 CT 剖切`,
          desc: `WebGL Stencil 奇偶计数封盖三轴 CT 与 6 面 3D 剖切盒并叠加 ISO 128 金属剖面线，实时剖开全馆 ${VAULT_EXHIBIT_COUNT} 款真三维螺旋阴线/阳线膛线、底火燃爆辉光、螺旋弹鼓与消音器 K 挡板。`,
          metric: `${VAULT_RATIO} 膛线 · 3D 剖切盒`,
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: '95+ 契约套件、75/75 WCAG 2.1 AA 与 60 FPS QA 门禁',
          desc: `95+ 套 Vitest 自动化契约守护全部 ${VAULT_EXHIBIT_COUNT} 款展品 ${VAULT_PARTS_TOTAL} 零件、${VAULT_AUDIO_TOTAL} 段配音、${GLOSSARY_TERMS_TOTAL} 词条百科与三维物理剧场，配套 assets:audit（<= 12 MB）与实机 75/75 (100%) WCAG 2.1 AA / 60 FPS 无头 Chromium 门禁。`,
          metric: '75/75 WCAG · 60 FPS QA',
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
          label: `打开全局双语瞬搜指令面板（${VAULT_EXHIBIT_COUNT} 展品 / ${VAULT_PARTS_TOTAL} 零件 / ${VAULT_HALLS_COUNT} 展厅与三维剧场）`,
        },
        { key: 'Space', label: '播放 / 暂停拆解或实弹击发循环' },
        {
          key: 'C',
          label: '开启 / 关闭三轴实时 CT 扫描纵剖与 6 面 3D 剖切盒',
        },
        {
          key: 'O',
          label:
            '打开 / 关闭物理耦合模块化光学与枪口改装工作台（消音器/制退器/LPVO/FLIR）',
        },
        {
          key: 'T',
          label: '开启 / 关闭 6 大机械职能分色与 60fps 燃气导流流线',
        },
        {
          key: 'G',
          label: '进入 / 退出军械师野战快拆、全枪精拆与限时盲拆考核 (DAG)',
        },
        {
          key: 'J',
          label: '开启 / 退出经典故障剖视排障室与随机盲考诊断',
        },
        { key: 'K', label: '开启 / 退出 1:1 3D 军械游标卡尺 (mm) 与包络标尺' },
        {
          key: 'R',
          label: `进入 / 返回 3D 1,000m 交互实弹靶场、子弹时间镜头与 RK4 DOPE 实验室（${BALLISTICS_PROFILES_TOTAL} 档案）`,
        },
        {
          key: 'U',
          label: '打开 / 关闭高清 3D 剖视社交分享海报工坊 (含军械师认证章)',
        },
        {
          key: 'B',
          label: `进入 / 退出 ${ORDNANCE_TOTAL} 口径轻武器实弹、航炮与坦克主炮弹 1:1 纵剖对比实验室`,
        },
        {
          key: 'S',
          label: `打开 / 关闭自动原理流派谱系矩阵与双展品同屏对照实验室（${SHOWDOWN_RIVALRIES_TOTAL} 组对决）`,
        },
        { key: 'P / V / F', label: '半拉验膛 / 切换快慢机 / 按住两道火扣扳机' },
        { key: 'X', label: '切换外层机匣、套筒与弹鼓 X-Ray 透视' },
        { key: 'M', label: '开启 / 静音军械机械与实弹合成声效' },
        { key: 'E', label: '显示 / 隐藏工业 CAD 硬边轮廓线' },
        { key: 'L', label: '开关零回流 3D 零件引出编号签' },
        { key: 'H', label: '隐藏 / 恢复全部界面按钮，进入纯净全屏展示' },
        { key: 'Ctrl/Cmd+P', label: `打开 ${VAULT_RATIO} Cycles 17 图版 3D 绘本与图鉴打印工坊` },
        { key: 'Shift+R / Esc', label: '一键复位合拢态 / 取消选中返回枪库' },
      ],
      finalKicker: `READY FOR INSPECTION · ${VERSION_UPPER}`,
      finalTitle: '现在进入 3D 数字枪库，体验三维物理剧场与十殿堂机械美学',
      finalSub:
        `覆盖全馆 ${VAULT_EXHIBIT_COUNT} 款真三维螺旋膛线与脱壳分离 VFX、重装同步声场、${GLOSSARY_TERMS_TOTAL} 词条机械百科、${CUSTOM_DUEL_MATRIX_LABEL} 定制机构对决、1,000m Litz/施利伦实弹靶场（R）、Tate 流体 3D 穿甲剧场、1:1 尺度墙与后坐实验室、暗室/工程白昼双影棚、75/75 WCAG 2.1 AA 认证与 PWA 离线博物馆；MIT 开源免费，欢迎点亮 Star。`,
      finalLaunchBtn: `启动 ${VAULT_EXHIBIT_COUNT} 槽 ${VAULT_HALLS_COUNT} 展厅数字枪库`,
      finalStarBtn: '前往 GitHub 点亮 Star',
      footerBrand: `Digital Armory 3D ${MUSEUM_VERSION} · 轻武器、重装甲与航空重武 3D 数字博物馆`,
      footerDisclaimer:
        '原理示意级（Schematic / Educational Level）机械科普与三维声画可视化开源工程 · 不包含任何工业制造加工公差或可打印图纸。',
    },
  },
  en: {
    nav: {
      ariaLabel: 'Product showcase primary navigation',
      versionBadge: `${MUSEUM_VERSION} · ${VAULT_EXHIBIT_COUNT} EXHIBITS · ${VAULT_HALLS_COUNT} HALLS`,
      capabilities: '4 Core Modes',
      documentary: 'AI 3D Director',
      gallery: 'Live Captures',
      arsenal: `${VAULT_EXHIBIT_COUNT}-Exhibit Vault`,
      architecture: 'Engine Architecture',
      quickstart: 'Quick Start',
      launchArmory: 'Enter 3D Armory',
    },
    hero: {
      eyebrow: `OPEN-SOURCE WEBGL 2.0 MUSEUM · ${VAULT_EXHIBIT_COUNT} EXHIBITS · ${VAULT_HALLS_COUNT} HALLS · ${VAULT_AUDIO_TOTAL} AI VOICE CLIPS · 3D PHYSICS THEATERS`,
      titlePrefix: '1:1 ',
      titleHighlight: '3D Cutaways & Ballistics',
      titleSuffix: ` — ${VAULT_EXHIBIT_COUNT} Firearms, Tanks & 30mm Cannon`,
      subLead: '1:1 CAD museum: ',
      subPartsStrong: `${VAULT_PARTS_TOTAL} parts`,
      subMid1: ', ',
      subMapsStrong: `${VAULT_TEXTURES_TOTAL} PBR maps`,
      subMid2: ', ',
      subAudioStrong: `${VAULT_AUDIO_TOTAL} audio guides`,
      subTail: '—60 FPS live cutaways, armor theater & 1,000m range.',
      ctaArmory: 'Enter 3D Digital Armory',
      ctaDirector: (tag) => `Play ${tag} 3D Documentary`,
      ctaExplode: (tag) => `Open ${tag} Disassembly`,
      ctaFiring: 'Live Ballistics & SFX',
      ctaShowdown: 'Mechanism Showdown (S)',
      ctaShowdownTitle: `Open 3-Axis Mechanical Lineage Matrix & Dual-Exhibit Showdown Lab (${SHOWDOWN_RIVALRIES_TOTAL} rivalries · Shortcut: S)`,
      ctaCartridges: `${ORDNANCE_TOTAL}-Caliber Ordnance Lab (B)`,
      ctaCartridgesTitle: `Open ${ORDNANCE_TOTAL}-Caliber (${LAB_CALIBER_TOTAL} Small-Arms + ${TANK_ORDNANCE_TOTAL} Heavy/Aero Ordnance) 1:1 Cutaway Lab (Shortcut: B)`,
      ctaBallistics: '3D 1,000m Range & Bullet-Cam (R)',
      ctaBallisticsTitle: `Open 3D 1,000m Interactive Firing Range, Slow-Motion Bullet-Cam, AR500 Steel Gong & Ballistic Gel Lab (${BALLISTICS_PROFILES_TOTAL} RK4 profiles · Shortcut: R)`,
      ctaArmorTheater: '3D Armor Penetration Theater',
      ctaArmorTheaterTitle:
        'Open 1:1 3D Slow-Motion Composite Armor Penetration Cutaway Theater across 5 kinetic penetrators (incl. 30x173mm GAU-8 API), ERA shearing & spall cones',
      ctaPoster: 'HD 3D Share Poster (U)',
      ctaPosterTitle:
        'Open Instant HD 3D Cutaway Social Poster Studio with QR Deep-Link & Armorer Rank Seal (Shortcut: U)',
      ctaMonograph: (tag) => `Print ${tag} 3D Picture Book / Monograph`,
      ctaMonographTitle:
        `Open ${VAULT_RATIO} Cycles 17-Plate 3D Picture Book & Collector Monograph Print Studio (Ctrl/Cmd+P)`,
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
      carouselPrevAria: 'Scroll exhibit carousel left',
      carouselNextAria: 'Scroll exhibit carousel right',
      ctaArmoryVault: `Enter ${VAULT_EXHIBIT_COUNT}-Bay 3D Vault`,
      ctaDirectorWatch: (tag) => `Watch ${tag} 3D Documentary`,
    },
    physicsLabs: {
      kicker: `3D PHYSICS THEATERS & ENGINEERING LABS · ${VERSION_UPPER}`,
      title: 'Explore 3D Physics Theaters & Engineering Labs',
      desc: `Go beyond static displays: track Applied Ballistics Litz spin-drift & Schlieren Mach cones down a 1,000m 3D proving ground, replay Tate hydrodynamic composite armor erosion, compare any ${CUSTOM_DUEL_MATRIX_LABEL} mechanism duel with our ${GLOSSARY_TERMS_TOTAL}-term Smithsonian engineering glossary, and switch seamlessly between Dark Vault and Blueprint Daylight studios.`,
      cards: {
        range3d: {
          badge: '3D PROVING GROUND · R',
          title: '3D 1,000m Interactive Range & Bullet-Cam',
          desc: `${BALLISTICS_PROFILES_TOTAL} RK4 G1/G7 profiles with Applied Ballistics Litz spin-drift, Don Miller Sg stability, Schlieren Mach-cone waves, AR500 impact sparks & d/343 acoustic return.`,
          cta: 'Launch 1,000m Range',
        },
        armorTheater: {
          badge: '3D ARMOR THEATER',
          title: '1:1 3D Composite Armor Penetration Theater',
          desc: `Watch ${PENETRATOR_TOTAL} kinetic penetrators (incl. 30mm GAU-8 API & 125mm APFSDS) solve Tate hydrodynamic armor erosion, shear ERA flyer plates & project spall cones.`,
          cta: 'Open Armor Theater',
        },
        cartridgeLab: {
          badge: '1:1 ORDNANCE LAB · B',
          title: `${ORDNANCE_TOTAL}-Caliber 1:1 Ordnance Cutaway Lab`,
          desc: `Compare ${LAB_CALIBER_TOTAL} small-arms cartridges & ${TANK_ORDNANCE_TOTAL} heavy cannon shells side-by-side at 1:1 millimeter scale with finned APFSDS darts & 3-petal sabots.`,
          cta: 'Enter Ordnance Lab',
        },
        showdown: {
          badge: 'LIVE 3D SPLIT-SCREEN · S',
          title: `Universal ${CUSTOM_DUEL_MATRIX_LABEL} Custom Duel & 6-Axis Radar`,
          desc: `${SHOWDOWN_RIVALRIES_TOTAL} cross-era rivalries plus a universal ${CUSTOM_DUEL_MATRIX_LABEL} custom duel builder, 6-axis engineering radar & single-canvas live 3D split-screen cutaways.`,
          cta: 'Launch Showdown Lab',
        },
        explode: {
          badge: 'WORKBENCH · DAG & GLOSSARY',
          title: `3D Helical Rifling, Detail-Strip & ${GLOSSARY_TERMS_TOTAL}-Term Glossary`,
          desc: `True 3D cutaway helical rifling across all ${VAULT_EXHIBIT_COUNT} exhibits, Field/Detail-Strip DAGs, ${GLOSSARY_TERMS_TOTAL}-term bilingual engineering glossary, modular optics/muzzles (O) & Blueprint Daylight Studio.`,
          cta: (tag) => `Disassemble ${tag}`,
        },
        firing: {
          badge: 'BALLISTICS & HEAVY SFX',
          title: 'In-Bore Glow, Discarding Sabots & Heavy Acoustics',
          desc: 'In-bore propellant deflagration glow, 1:1 MBT 3-petal discarding sabot separation, bore-evacuator vent plumes, GAU-8/M134 rotary blur halo & sabot/stub/motor acoustics.',
          cta: 'Launch Live Ballistics',
        },
        poster: {
          badge: 'SHARE STUDIO · U',
          title: 'HD 3D Cutaway & Rifling Metrology Poster Studio',
          desc: 'Compose museum-grade 16:9 / 4:5 cutaway posters stamped with bore rifling twist, engineering principles, QR deep-links & your Armorer Rank seal.',
          cta: 'Create 3D Poster',
        },
        monograph: {
          badge: 'PRINT STUDIO · CMD+P',
          title: `${VAULT_EXHIBIT_COUNT}/${VAULT_EXHIBIT_COUNT} Cycles 17-Plate Monograph Print Studio`,
          desc: 'Lay out 2880x1800 Cycles studio plates into bilingual 3D picture books and DK-style engineering encyclopedias.',
          cta: (tag) => `Print ${tag} Monograph`,
        },
        scaleWall: {
          badge: '1:1 TRUE SCALE',
          title: `Smithsonian 1:1 True-Scale Museum Wall (All ${VAULT_EXHIBIT_COUNT} Exhibits)`,
          desc: 'Compare pistols, rifles, the 6.06m GAU-8 cannon & 10m MBTs side-by-side in true millimeters against a 1.75m human silhouette.',
          cta: 'Open 1:1 Scale Wall',
        },
        recoilLab: {
          badge: 'RECOIL & TORQUE LAB',
          title: 'Recoil Impulse, Gas-Jet & Muzzle-Climb Physics Lab',
          desc: 'Decompose projectile vs rocket gas-jet momentum, muzzle-brake counter-thrust, 120-pt F(t) waveforms & bore-axis climb torque.',
          cta: 'Open Recoil Lab',
        },
      },
    },
    metrics: [
      {
        val: `${VAULT_EXHIBIT_COUNT} Icons · ${VAULT_HALLS_COUNT} Halls`,
        lbl: `${VAULT_FIREARM_COUNT} Firearms, ${VAULT_ARCHERY_COUNT} Archery, ${VAULT_ARMOR_COUNT} MBTs & ${VAULT_ORDNANCE_COUNT} Aero Cannon`,
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
        lbl: 'Bilingual Charon Gemini TTS R&D & Part Audio',
      },
      {
        val: `${ORDNANCE_TOTAL} Ordnance · ${BALLISTICS_PROFILES_TOTAL} RK4`,
        lbl: `${LAB_CALIBER_TOTAL} Small-Arms + ${TANK_ORDNANCE_TOTAL} Heavy Ordnance · 3D 1,000m Range`,
      },
    ],
    capabilities: {
      kicker: `FOUR CORE CAPABILITIES · ${VERSION_UPPER} 3D THEATERS`,
      title: 'Four Armorer-Grade 3D Inspection, Modding & Physics Modes',
      desc: `From M1911A1 single-link short-recoil, MG 42 twin-roller 1,200 RPM cycles, Mauser K98k CRF claws, and Thompson 50-rd drums to the 10th Hall 1:1 GE GAU-8/A Avenger 30mm rotary cannon and 4 1:1 MBTs, all ${VAULT_EXHIBIT_COUNT} exhibits (${VAULT_PARTS_TOTAL} parts) unify true 3D cutaway helical rifling & in-bore propellant deflagration glow, 3-petal discarding sabot separation & rotary blur halos, ${GLOSSARY_TERMS_TOTAL}-term Smithsonian engineering glossary, Modular Optics & Muzzle Bench (O), Blueprint Daylight Studio, Tate 3D Armor Theater, Litz/Schlieren 1,000m Range (R · ${BALLISTICS_PROFILES_TOTAL} profiles), Universal ${CUSTOM_DUEL_MATRIX_LABEL} Showdown (S), and ${ORDNANCE_TOTAL}-Caliber Lab (B).`,
      cards: {
        explode: {
          alt: 'AK-15M1 zero-reflow callout leaders and multi-stage exploded workbench',
          tag: 'MODE 01 · EXPLODED CAD, MODS (O) & GLOSSARY',
          title: `Progressive Disassembly, ${GLOSSARY_TERMS_TOTAL}-Term Glossary & Modular Bench (O)`,
          descPrefix:
            'Scrub 0% Assembled → 30% Field Strip → 65% Sub-Assembly → 100% Full Explode with Detail-Strip DAGs, cross-linked 28-term bilingual Smithsonian engineering glossary & physically coupled K-baffle suppressors, competition brakes, 1-8x LPVOs & clip-on FLIR optics (O) with live ',
          descSuffix: ' millimeter bounding dimensions.',
          cta: 'Open AK-15M1 Disassembly Bench',
        },
        firing: {
          alt: 'Barrett M82A1 .50 BMG barrel short-recoil and 60-degree arrowhead muzzle blast',
          tag: 'MODE 02 · SABOT DISCARD, ROTARY HALO & 3D THEATERS',
          title: `In-Bore Deflagration, 3-Petal Sabot Discard, Rotary Halo & ${ORDNANCE_TOTAL}-Caliber Ballistics`,
          desc: `Models all ${VAULT_EXHIBIT_COUNT} exhibits with in-bore propellant deflagration glow, 1:1 smoothbore MBT 3-petal aluminum discarding sabot separation & bore-evacuator vent plumes, plus GAU-8/A & M134D rotary motion-blur halos—paired with Applied Ballistics Litz spin-drift / Miller Sg / Schlieren Mach-cone / AR500 sparks in the 1,000m Range and Tate hydrodynamic erosion in the 3D Armor Theater.`,
          cta: 'Launch Barrett .50 BMG Slow-Mo Cycle',
        },
        section: {
          alt: 'GPU longitudinal centerline armorer section-cut',
          tag: 'MODE 03 · 3D HELICAL RIFLING BORE & TRI-AXIAL CT (C)',
          title: `${VAULT_RATIO} True 3D Cutaway Helical Rifling Bore, Tri-Axial CT & 3D Slice Box`,
          descPrefix: 'Press ',
          descSuffix:
            ` to sweep Z/X/Y orthogonal planes or a 6-plane 3D Slice Box right through barrels, receivers, helical drums & mounted K-baffle suppressors—exposing true 3D helical lands/grooves and Boxer primer ignition glow across all ${VAULT_EXHIBIT_COUNT} exhibits with precision raycast picking.`,
          cta: 'Launch Longitudinal Cutaway Bench',
        },
        pbr: {
          alt: '5-Channel Packed ORM PBR Texture Atlas Inspector',
          tag: 'MODE 04 · BLUEPRINT DAYLIGHT & 5-CHANNEL ORM',
          title: 'Dark Tactical Vault / Blueprint Daylight Studio & 2K/4K PBR Atlas',
          desc: 'Switch effortlessly between Dark Tactical Vault and crisp high-contrast Blueprint Daylight Studio, separating manganese phosphate steel, Colt Royal Blue, walnut & 4K composite/Zimmerit armor—backed by KTX2 (toktx), optional CDN routing, offline PWA caching & an in-browser 2K/4K WebP inspector.',
          cta: `Inspect All ${VAULT_TEXTURES_TOTAL} 2K/4K PBR Texture Maps`,
        },
      },
    },
    documentary: {
      kicker: `MULTIMODAL AUDIO-VISUAL ENGINE · ${VERSION_UPPER}`,
      title: 'Bilingual 4-Act AI Documentary · 3D Director & Acoustic Engine',
      desc: `Beyond silent manual model viewers: all ${VAULT_EXHIBIT_COUNT} firearms, compound archery, 1:1 main battle tanks & the 1:1 GE GAU-8/A 30mm rotary cannon ship with bilingual 4-act R&D documentaries, ${VAULT_PARTS_TOTAL} spoken component breakdowns, 1080p Director Reel video capture, automated 3D camera choreography, and physically coupled Web Audio acoustics.`,
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
      soundBadge: 'PROCEDURAL WEB AUDIO · 4-ROOM CONVOLUTION & HEAVY SFX',
      soundTitle: `${ORDNANCE_TOTAL}-Caliber Sabot Crack, Rotary Drive Whine & 4-Room Convolution Acoustics`,
      soundDesc:
        'Real-time procedural Web Audio synthesis (0 KB external audio bloat): adds 125/120mm APFSDS supersonic discarding-sabot air-crack, MBT autoloader & bustle stub-case clang, Tiger I 88mm drawn-brass bell ring, and GAU-8/A hydraulic + M134D 28V DC electric drive motor spin-up whine—routed through 4-room stereo convolution reverb, Euler-Bernoulli steel waveguides, and modular muzzle coupling.',
      caliberRows: [
        {
          caliber: '125mm / 120×570mm / 88×571mmR / 30×173mm',
          weaponTag: 'ZTZ-99A / M1A2 / Leopard 2A7V / Tiger 131 / GAU-8/A',
          freqTag: '24–42 Hz Sabot Crack, Stub Clang & Hydraulic Roar',
          signature:
            'APFSDS 3-petal sabot whip-crack + AZ carousel/bustle stub-case clang + Tiger 88mm drawn-brass ring + GAU-8/A dual hydraulic motor whine & 3,900 RPM 65 Hz "BRRRT!"',
        },
        {
          caliber: '12.7×99mm (.50 BMG) / 7.92×57mm Mauser',
          weaponTag: 'M82A1 / MG 42 / Mauser K98k',
          freqTag: '38–54 Hz Heavy Shockwave & 1,200 RPM Buzzsaw',
          signature:
            'MG 42 twin-roller 1,200 RPM burst / Mauser K98k 90-deg claw bolt cycle / Barrett 60-deg arrowhead brake roar',
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
          weaponTag: 'DEAGLE / AK-15 / M1911A1 / Thompson / KRISS Vector',
          freqTag: '58–74 Hz Heavy Bark, Blish Lock & Super V',
          signature:
            'M1911A1 steel slide lockup / Thompson 50-rd drum burst / Vector 110° Super V slider 1,200 RPM .45 burst / Gas piston strike',
        },
        {
          caliber: '5.56 NATO / 5.7×28mm / 9×19mm',
          weaponTag: 'M249 SAW / M4A1 / P90 / MP5 / P08 / G17',
          freqTag: '84–118 Hz Belt Shuttle & Toggle Snap',
          signature:
            'M249 M27 steel link strip / Luger P08 54° knee-joint toggle snap / P90 90° helical feed & 9mm brass ring',
        },
        {
          caliber: '.30-30 Win / .30-06 / 12 Gauge / .357 Mag',
          weaponTag: 'Winchester 1894 / M1 Garand / Benelli M4 / Rem 870 / Python',
          freqTag: '62 Hz Boom + 1.74 kHz Clip Ping',
          signature:
            'Winchester 1894 rising H-block lever clack / Remington 870 twin-bar pump rack / Garand en-bloc "PING!" / ARGO & revolver ratchet',
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
        'Synchronized Heavy-Ordnance Acoustics: APFSDS supersonic sabot air-crack, MBT stub-case clang, GAU-8/A hydraulic & M134D 28V electric drive motor whine + 4-room convolution reverb & live Studio Audition Deck',
        '8-Point Phase Binding + Smart TTS Ducking: Smoothly attenuates mechanical & ballistic SFX to -12.4 dB whenever Gemini TTS narration is speaking',
        'Instant Audition & Mute Controls: Audition live-shot, action, brass & lockup cues directly in the Acoustic Studio Deck or press M to mute',
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
      kicker: `${VAULT_EXHIBIT_COUNT}-BAY · ${VAULT_HALLS_COUNT}-HALL MASTER ROSTER · FACTORY 1:1`,
      title: `${VAULT_EXHIBIT_COUNT} Iconic Firearms, Tanks & 1:1 30mm Rotary Cannon · Metrology Matrix`,
      desc: `Spanning all 3 orthogonal firearm axes (incl. V6.0 M1911A1, MG 42, Mauser K98k & Thompson M1928A1), compound archery, the 1:1 Heavy Armor Hall (ZTZ-99A, M1A2 SEP v3, Leopard 2A7V, Tiger 131), and the 10th Hall Heavy Aero Ordnance (1:1 GE GAU-8/A Avenger 30mm rotary cannon)—each equipped with Blender 5.2 Draco + CSG internals, 4-act bilingual documentary, Armorer Qualification exams, and Mechanism Showdown (S · ${SHOWDOWN_RIVALRIES_TOTAL} rivalries).`,
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
        ordnance: 'Heavy Ordnance',
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
      kicker: 'ENGINEERING ARCHITECTURE & LIVE CERTIFICATIONS',
      title: 'Industrial-Grade TypeScript + Blender 5.2 + Web Audio Pipeline',
      desc: 'Zero closed-source static 3D blobs—combining reproducible MIT Blender 5.2 Draco .glb meshes, Worker-isolated CSG springs, Dark Vault & Blueprint Daylight studios, 3D rifling/sabot/rotary VFX, 4-room heavy acoustics, and live 75/75 WCAG 2.1 AA + 60 FPS WebGL certification.',
      certificationsAria: 'Live engineering certifications and architecture badges',
      certifications: [
        {
          id: 'exhibits',
          tone: 'cyan',
          value: `${VAULT_EXHIBIT_COUNT} Exhibits · ${VAULT_HALLS_COUNT} Halls`,
          label: `${VAULT_PARTS_TOTAL} CAD Parts`,
        },
        {
          id: 'wcag',
          tone: 'emerald',
          value: '75/75 WCAG 2.1 AA',
          label: '100% Live CDP Certified',
        },
        {
          id: 'webgl',
          tone: 'cyan',
          value: '60 FPS WebGL 2.0',
          label: 'Dark Vault & Blueprint Daylight',
        },
        {
          id: 'pwa',
          tone: 'amber',
          value: 'Zero-Dependency Offline PWA',
          label: `${VAULT_TEXTURES_TOTAL} PBR Maps · ${VAULT_AUDIO_TOTAL} Clips`,
        },
        {
          id: 'bilingual',
          tone: 'emerald',
          value: 'Bilingual ZH/EN',
          label: `${GLOSSARY_TERMS_TOTAL}-Term Glossary · ${CUSTOM_DUEL_MATRIX_LABEL} Duels`,
        },
      ],
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
          title: '60Hz Physics Theaters, Sabot VFX & Heavy IR Audio',
          desc: `Zero-GC transient clock drives ${ORDNANCE_TOTAL}-caliber ballistics, Tate hydrodynamic 3D Armor Theater, Litz/Miller/Schlieren 1,000m Range (${BALLISTICS_PROFILES_TOTAL} profiles, R), 3-petal sabot & rotary blur VFX, and 4-room convolution heavy-ordnance acoustics.`,
          metric: '60 FPS Zero Re-render',
        },
        {
          code: 'ARCH-04',
          iconKey: 'sparkles',
          title: 'GTAO + AgX, Blueprint Daylight & Offline PWA Studio',
          desc: `${VAULT_SUITES_TOTAL} suites (${VAULT_TEXTURES_TOTAL} 5-channel ORM maps) support Dark Vault & Blueprint Daylight studios, toktx KTX2 / CDN / PWA Offline Museum; 3D Director syncs ${VAULT_AUDIO_TOTAL} Charon clips with 1080p Reels, Rifling Posters (U) & ${VAULT_EXHIBIT_COUNT}/${VAULT_EXHIBIT_COUNT} Cycles Monographs (Ctrl/Cmd+P).`,
          metric: `${VAULT_AUDIO_TOTAL} Clips · ${VAULT_SUITES_TOTAL} Suites`,
        },
        {
          code: 'ARCH-05',
          iconKey: 'scissors',
          title: `${VAULT_RATIO} 3D Helical Rifling Bore, In-Bore Glow & CT Box`,
          desc: `WebGL Stencil front/back parity caps Z/X/Y planes and a 6-plane 3D Slice Box with ISO 128 hatching—exposing true 3D helical lands/grooves, Boxer primer deflagration glow, helical drums & K-baffle suppressors across all ${VAULT_EXHIBIT_COUNT} exhibits.`,
          metric: `${VAULT_RATIO} Rifling · 3D Box`,
        },
        {
          code: 'ARCH-06',
          iconKey: 'shield',
          title: '95+ Contract Suites, 75/75 WCAG 2.1 AA & 60 FPS QA',
          desc: `95+ Vitest suites verify geometry, PBR luminance, ${VAULT_AUDIO_TOTAL} audio clips, ${GLOSSARY_TERMS_TOTAL}-term glossary & 3D physics across all ${VAULT_PARTS_TOTAL} parts—backed by assets:audit (<= 12 MB) and live 75/75 (100%) WCAG 2.1 AA + 60 FPS Chromium gates.`,
          metric: '75/75 WCAG · 60 FPS QA',
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
          label: `Open Global Bilingual Command Palette (${VAULT_EXHIBIT_COUNT} exhibits, ${VAULT_PARTS_TOTAL} parts, ${VAULT_HALLS_COUNT} halls & 3D theaters)`,
        },
        {
          key: 'Space',
          label: 'Play / Pause disassembly or live firing cycle',
        },
        {
          key: 'C',
          label: 'Toggle Tri-Axial CT section-cut & 6-plane 3D Slice Box',
        },
        {
          key: 'O',
          label:
            'Toggle Physically Coupled Modular Optics & Muzzle Bench (Suppressor / Brake / LPVO / FLIR)',
        },
        {
          key: 'T',
          label: 'Toggle 6-Role Engineering Tint & 60fps propellant gas flow',
        },
        {
          key: 'G',
          label: 'Toggle Field-Strip, Full Detail-Strip & Timed Blind Exam (DAG)',
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
          label: `Open / Return from 3D 1,000m Firing Range, Bullet-Cam & RK4 DOPE Lab (${BALLISTICS_PROFILES_TOTAL} profiles)`,
        },
        {
          key: 'U',
          label:
            'Open / Close Instant HD 3D Cutaway Social Poster Studio & QR Seal',
        },
        {
          key: 'B',
          label: `Open / Exit ${ORDNANCE_TOTAL}-Caliber Small-Arms, Aero & Tank Ordnance 1:1 Cutaway Lab`,
        },
        {
          key: 'S',
          label: `Open / Close 3-Axis Mechanism Showdown & Dual-Exhibit Comparison Lab (${SHOWDOWN_RIVALRIES_TOTAL} rivalries)`,
        },
        {
          key: 'P / V / F',
          label: 'Press-Check / Fire Selector / Hold Trigger',
        },
        { key: 'X', label: 'Toggle outer receiver, slide & drum X-Ray cutaway' },
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
            `Open ${VAULT_RATIO} Cycles 17-Plate 3D Picture Book & Collector Monograph Print Studio`,
        },
        {
          key: 'Shift+R / Esc',
          label: 'Reset 0% state / Clear part or exit to Vault',
        },
      ],
      finalKicker: `READY FOR INSPECTION · ${VERSION_UPPER}`,
      finalTitle:
        'Step Inside the 10-Hall 3D Armory & Live Physics Theaters',
      finalSub:
        `Explore ${VAULT_RATIO} 3D cutaway helical rifling & discarding-sabot VFX, synchronized heavy-ordnance acoustics, the ${GLOSSARY_TERMS_TOTAL}-term Smithsonian engineering glossary, universal ${CUSTOM_DUEL_MATRIX_LABEL} Showdown duels, the Litz/Schlieren 1,000m Proving Ground (R), Tate 3D Armor Theater, 1:1 Scale Wall, Recoil Lab, Blueprint Daylight Studio, live 75/75 WCAG 2.1 AA certification & Offline PWA—MIT open-source!`,
      finalLaunchBtn: `Launch ${VAULT_EXHIBIT_COUNT}-Bay ${VAULT_HALLS_COUNT}-Hall 3D Armory`,
      finalStarBtn: 'Star on GitHub',
      footerBrand:
        `Digital Armory 3D ${MUSEUM_VERSION} · Open-Source 3D Firearms, Heavy Armor & Aero Ordnance Museum`,
      footerDisclaimer:
        'Schematic / Educational-grade mechanical visualization & interactive encyclopedia · Contains zero manufacturing tolerances or 3D-printable blueprints.',
    },
  },
};

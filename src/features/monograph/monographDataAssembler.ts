import {
  archeryProjectileToLabSpec,
  CARTRIDGE_LAB_SPECS,
  type CartridgeLabSpec,
  getArcheryProjectileMeta,
} from '../../engine/cartridges/cartridgeSpecs';
import { FIELD_STRIP_PLANS } from '../../engine/fieldstrip/fieldStripSpecs';
import { getCachedPartGeometry } from '../../engine/geometry/geometryService';
import {
  getMalfunctionScenario,
  MALFUNCTION_ORDER,
} from '../../engine/malfunctions/malfunctionSpecs';
import {
  ENGINEERING_ROLE_ORDER,
  type EngineeringRole,
  getEngineeringRoleMeta,
  resolvePartEngineeringRole,
} from '../../engine/materials/engineeringRoles';
import {
  type CaliberBallisticsSpec,
  getCaliberBallisticsSpec,
  isTankWeapon,
} from '../../engine/physics/armoryPhysics';
import {
  getLocalizedShortWeaponLabel,
  resolveFiringPhaseText,
  resolvePartMaterialLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import type {
  LanguageCode,
  StoryActItem,
  StoryBreakthroughItem,
  StoryMilestoneItem,
  WeaponNarrationBundle,
} from '../../narration/types';
import { getWeaponManifest } from '../../weapons/manifests';
import type {
  AssemblyGroupKey,
  CaliberProfile,
  WeaponId,
  WeaponRuntimePlugin,
} from '../../weapons/types';
import type { MonographPlateKey } from './monographCaptureStore';
import { buildQrSvgPath, encodeQrMatrix } from './qrCodeSvg';

export interface MonographBomRow {
  partId: string;
  bomCode: string;
  primaryName: string;
  secondaryName: string;
  groupKey: AssemblyGroupKey;
  groupTitle: string;
  badgeColor: string;
  materialLabel: string;
  envelopeMm: string;
  triangles: number;
  principleText: string;
}

export interface MonographRoleSummary {
  role: EngineeringRole;
  label: string;
  shortLabel: string;
  kidTeamTitle: string;
  kidShortTip: string;
  desc: string;
  colorHex: string;
  parts: { bomCode: string; name: string }[];
}

export interface MonographFiringPhaseRow {
  stepNum: string;
  shortLabel: string;
  title: string;
  description: string;
}

export interface MonographFieldStripRow {
  orderLabel: string;
  title: string;
  actionHint: string;
  interferenceNote: string;
}

export interface MonographMalfunctionCard {
  code: string;
  badge: string;
  title: string;
  rootCause: string;
  drillSummary: string;
}

export interface KidsSubAssemblyPhotoCard {
  groupKey: AssemblyGroupKey;
  plateKey: Extract<
    MonographPlateKey,
    'group_slide' | 'group_frame' | 'group_fcg' | 'group_mag'
  >;
  bagNumber: string;
  title: string;
  badgeColor: string;
  partCount: number;
  partTags: { bomCode: string; name: string }[];
}

export interface KidsComicFrameSpec {
  stepBadge: string;
  plateKey: Extract<
    MonographPlateKey,
    'comic_1_ready' | 'comic_2_ignition' | 'comic_3_eject' | 'comic_4_reload'
  >;
  title: string;
  caption: string;
}

export interface KidsFunStatCard {
  label: string;
  value: string;
  funCompare: string;
}

export interface MonographDossierData {
  weaponId: WeaponId;
  isArchery: boolean;
  isTank: boolean;
  lang: LanguageCode;
  serialCode: string;
  bayCode: string;
  volumeIndex: number;
  shortTag: string;
  modelCode: string;
  name: string;
  subtitle: string;
  originTag: string;
  caliberLabel: string;
  caliberProfile: CaliberProfile;
  actionMechanism: string;
  description: string;
  kidTagline: string;
  highlights: string[];
  metrics: {
    oal: string;
    barrel: string;
    weight: string;
    muzzleVelocity: string;
    effectiveRange: string;
    rateOfFire: string;
    muzzleEnergyJ: string;
  };
  kidsFunStats: [
    KidsFunStatCard,
    KidsFunStatCard,
    KidsFunStatCard,
    KidsFunStatCard,
  ];
  subAssemblyCards: KidsSubAssemblyPhotoCard[];
  comicFrames: [
    KidsComicFrameSpec,
    KidsComicFrameSpec,
    KidsComicFrameSpec,
    KidsComicFrameSpec,
  ];
  headline: string;
  deck: string;
  acts: StoryActItem[];
  breakthroughs: StoryBreakthroughItem[];
  milestones: StoryMilestoneItem[];
  roleSummaries: MonographRoleSummary[];
  firingPhases: MonographFiringPhaseRow[];
  bomRows: MonographBomRow[];
  totalTrianglesFormatted: string;
  cartridgeSpec: CartridgeLabSpec;
  ballisticsSpec: CaliberBallisticsSpec;
  fieldStripManualTitle: string;
  fieldStripRows: MonographFieldStripRow[];
  malfunctionCards: MonographMalfunctionCard[];
  deepLinkUrl: string;
  qrSvg: { pathD: string; viewSize: number };
}

const KID_ROLE_COPY: Record<
  EngineeringRole,
  { zhTitle: string; zhTip: string; enTitle: string; enTip: string }
> = {
  locking: {
    zhTitle: '橙色 · 安全锁小队',
    zhTip: '牢牢锁紧核心结构，引导直线前进',
    enTitle: 'Orange · Safety Lock Team',
    enTip: 'Locks tightly and guides straight motion',
  },
  gas_drive: {
    zhTitle: '青色 · 能量推手队',
    zhTip: '巧妙借用气流或杠杆力往后推动',
    enTitle: 'Cyan · Power Boost Team',
    enTip: 'Channels gas or cam leverage to drive motion',
  },
  bolt_carrier: {
    zhTitle: '蓝色 · 往返滑块队',
    zhTip: '像小火车一样前后滑行完成循环',
    enTitle: 'Blue · Sliding Carrier Team',
    enTip: 'Glides back and forth like a mini train',
  },
  fire_control: {
    zhTitle: '红色 · 扳机开关队',
    zhTip: '手指轻轻一按，精准发出启动口令',
    enTitle: 'Red · Trigger Switch Team',
    enTip: 'Releases the start signal with one press',
  },
  energy_spring: {
    zhTitle: '绿色 · 大力弹簧队',
    zhTip: '压扁蓄满力气，把零件推回原位',
    enTitle: 'Green · Super Spring Team',
    enTip: 'Stores elastic energy to snap parts home',
  },
  housing_feed: {
    zhTitle: '银灰 · 盔甲与弹盒队',
    zhTip: '保护内部零件的外壳与排队等候仓',
    enTitle: 'Grey · Armor & Feed Box',
    enTip: 'Protective outer body and waiting bay',
  },
};

const KID_ARCHERY_ROLE_COPY: Record<
  EngineeringRole,
  { zhTitle: string; zhTip: string; enTitle: string; enTip: string }
> = {
  locking: {
    zhTitle: '橙色 · 凸轮与轮轴队',
    zhTip: '用偏心滑轮省力转弯，稳稳锁住超大拉力',
    enTitle: 'Orange · Cam & Axle Team',
    enTip: 'Spins offset cams to ease draw and lock high tension',
  },
  gas_drive: {
    zhTitle: '青色 · 弯曲弓片队',
    zhTip: '把碳纤维弓片压弯蓄满弹力，联动副缆同步转',
    enTitle: 'Cyan · Flex Limb & Cable Team',
    enTip: 'Bends carbon limbs and sync cables to store launch power',
  },
  bolt_carrier: {
    zhTitle: '蓝色 · 弓弦推射队',
    zhTip: '像弹力弹弓一样前后高速推进，把箭笔直射出',
    enTitle: 'Blue · Bowstring Drive Team',
    enTip: 'Drives the bowstring and sled forward to launch straight',
  },
  fire_control: {
    zhTitle: '红色 · 撒放瞄准队',
    zhTip: '精准瞄准锁定目标，一按开关瞬间松弦放箭',
    enTitle: 'Red · Aim & Release Team',
    enTip: 'Lines up sights and releases the string with one click',
  },
  energy_spring: {
    zhTitle: '绿色 · 减震回弹队',
    zhTip: '吸收发射后的震动余波，让弹簧与止弦器快速回稳',
    enTitle: 'Green · Damper & Spring Team',
    enTip: 'Soaks up vibration and snaps release latches back steady',
  },
  housing_feed: {
    zhTitle: '银灰 · 弓把与箭壶队',
    zhTip: '坚固镂空主骨架加上侧挂箭壶，保护并携带好碳箭',
    enTitle: 'Grey · Riser & Quiver Team',
    enTip: 'Strong truss frame and side quiver holding carbon arrows',
  },
};

const KID_ARMOR_ROLE_COPY: Record<
  EngineeringRole,
  { zhTitle: string; zhTip: string; enTitle: string; enTip: string }
> = {
  locking: {
    zhTitle: '橙色 · 主炮闭锁队',
    zhTip: '稳稳锁紧巨型炮膛，让高能穿甲弹笔直飞向远方',
    enTitle: 'Orange · Cannon Breech Team',
    enTip: 'Locks the massive main gun breech to launch high-speed shells',
  },
  gas_drive: {
    zhTitle: '青色 · 驻退制退队',
    zhTip: '像超级液压减震器一样缓冲开炮时排山倒海的后坐力',
    enTitle: 'Cyan · Recoil Brake Team',
    enTip: 'Absorbs enormous cannon recoil like a giant hydraulic damper',
  },
  bolt_carrier: {
    zhTitle: '蓝色 · 炮塔驱动队',
    zhTip: '稳稳转动钢铁炮塔与炮管，实现行进间双轴稳定瞄准',
    enTitle: 'Blue · Turret Drive Team',
    enTip: 'Spins the heavy steel turret smoothly with gyro stabilization',
  },
  fire_control: {
    zhTitle: '红色 · 火控观瞄队',
    zhTip: '用热成像周视镜与测距激光快速锁定目标并精准击发',
    enTitle: 'Red · Fire-Control Optics Team',
    enTip: 'Tracks distant targets with thermal sights and laser ranging',
  },
  energy_spring: {
    zhTitle: '绿色 · 履带减震队',
    zhTip: '扭杆弹簧与负重轮像坦克大脚掌一样稳稳越过崎岖地形',
    enTitle: 'Green · Track & Torsion Team',
    enTip: 'Torsion bars and roadwheels cushion rough terrain on steel tracks',
  },
  housing_feed: {
    zhTitle: '银灰 · 复合装甲与弹舱队',
    zhTip: '厚实装甲外壳守护乘员舱，并把大口径炮弹安全排好队',
    enTitle: 'Grey · Armor & Ammo Bay Team',
    enTip: 'Heavy layered armor protects the crew and stores main-gun shells',
  },
};

const GROUP_TO_PLATE: Record<
  AssemblyGroupKey,
  KidsSubAssemblyPhotoCard['plateKey']
> = {
  slide: 'group_slide',
  frame: 'group_frame',
  fire_control: 'group_fcg',
  magazine: 'group_mag',
};

function parseFirstFloat(str: string, fallback: number): number {
  const cleaned = str.replace(/,/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  return m ? parseFloat(m[1]) : fallback;
}

function buildKidsFunStats(
  oalStr: string,
  weightStr: string,
  partsCount: number,
  velMps: number,
  lang: LanguageCode,
  isArchery = false,
  isTank = false
): [KidsFunStatCard, KidsFunStatCard, KidsFunStatCard, KidsFunStatCard] {
  const isZh = lang === 'zh';
  const oalMm = parseFirstFloat(oalStr, 750);
  const weightKg = parseFirstFloat(weightStr, 3.0);
  const effectiveIsTank = isTank || oalMm >= 3000 || weightKg >= 1000;
  const oalCm = Number((oalMm / 10).toFixed(1));
  const oalM = (oalMm / 1000).toFixed(2);
  const rulers = Math.max(1, Math.round((oalMm / 300) * 10) / 10);
  const bottles = Math.max(1, Math.round(weightKg / 0.5));
  const tonnes = (weightKg / 1000).toFixed(1);
  const elephants = Math.max(1, Math.round(weightKg / 5000));
  const mach = velMps / 340;
  const kmh = Math.round(velMps * 3.6);
  const formattedVel = Number.isInteger(velMps)
    ? velMps.toLocaleString('en-US')
    : velMps.toFixed(1);

  const lengthCompare = effectiveIsTank
    ? isZh
      ? `全长 ${oalM} 米（含主炮），快赶上一辆城市大公交车啦！`
      : `${oalM} m long (incl. gun) — nearly as long as a city bus!`
    : isZh
      ? oalMm < 260
        ? '差不多等于 1 支新铅笔的长度'
        : oalMm < 580
          ? '差不多有小朋友的书包那么高'
          : oalMm < 980
            ? `大约等于 ${rulers} 把 30cm 学生尺连起来`
            : `全长 ${oalCm} cm，快赶上小朋友的身高啦！`
      : oalMm < 260
        ? 'About as long as 1 new pencil'
        : oalMm < 580
          ? 'About as tall as a school backpack'
          : oalMm < 980
            ? `About ${rulers} school rulers end-to-end`
            : `${oalCm} cm — almost as tall as a young explorer!`;

  const weightCompare = effectiveIsTank
    ? isZh
      ? `重约 ${tonnes} 吨，相当于 ${elephants} 头成年非洲象的体重！`
      : `About ${tonnes} tonnes — as heavy as ${elephants} African elephants!`
    : isZh
      ? `大约等于 ${bottles} 瓶矿泉水的重量`
      : `Weighs about ${bottles} water bottles`;

  const partsCompare = isZh
    ? effectiveIsTank
      ? '像重装钢铁工程积木一样层层咬合'
      : isArchery
        ? '像碳纤维与金属乐高积木一样严丝合缝'
        : '像金属乐高积木一样层层咬合'
    : effectiveIsTank
      ? 'Interlocks like heavy steel engineering blocks'
      : isArchery
        ? 'Interlocks just like carbon & alloy LEGO bricks'
        : 'Interlocks just like precision LEGO bricks';

  const speedCompare = isZh
    ? mach >= 1.05
      ? `超音速 ${mach.toFixed(1)} 倍！比声音跑得还快`
      : kmh >= 420
        ? `时速约 ${kmh} km/h，接近声音传播速度的一半！`
        : kmh >= 250
          ? `时速约 ${kmh} km/h，比飞驰的高铁列车还要快！`
          : `时速约 ${kmh} km/h，比猎豹冲刺还快！`
    : mach >= 1.05
      ? `Mach ${mach.toFixed(1)} — faster than sound!`
      : kmh >= 420
        ? `${kmh} km/h — nearly half the speed of sound!`
        : kmh >= 250
          ? `${kmh} km/h — faster than a high-speed train!`
          : `${kmh} km/h — faster than a sprinting cheetah!`;

  return [
    {
      label: isZh ? '总长度' : 'Total Length',
      value: `${Math.round(oalMm).toLocaleString('en-US')} mm`,
      funCompare: lengthCompare,
    },
    {
      label: isZh
        ? effectiveIsTank
          ? '战斗全重'
          : '机身重量'
        : effectiveIsTank
          ? 'Combat Weight'
          : 'Total Weight',
      value: effectiveIsTank
        ? `${Math.round(weightKg).toLocaleString('en-US')} kg`
        : `${weightKg.toFixed(2)} kg`,
      funCompare: weightCompare,
    },
    {
      label: isZh ? '积木零件数' : '3D Parts Count',
      value: isZh ? `${partsCount} 块` : `${partsCount} pcs`,
      funCompare: partsCompare,
    },
    {
      label: isZh ? '发射速度' : 'Launch Speed',
      value: `${formattedVel} m/s`,
      funCompare: speedCompare,
    },
  ];
}

function buildKidsComicFrames(
  isArchery: boolean,
  lang: LanguageCode,
  isTank = false
): [
  KidsComicFrameSpec,
  KidsComicFrameSpec,
  KidsComicFrameSpec,
  KidsComicFrameSpec,
] {
  const isZh = lang === 'zh';
  if (isTank) {
    return isZh
      ? [
          {
            stepBadge: '第 ① 格',
            plateKey: 'comic_1_ready',
            title: '装填闭锁',
            caption: '楔形炮闩牢牢封死巨型炮膛，双轴稳定炮塔静静锁定目标',
          },
          {
            stepBadge: '第 ② 格',
            plateKey: 'comic_2_ignition',
            title: '主炮轰鸣',
            caption: '电底火点燃数公斤发射药，穿甲弹瞬间以超音速冲出炮口',
          },
          {
            stepBadge: '第 ③ 格',
            plateKey: 'comic_3_eject',
            title: '液压驻退',
            caption: '整根炮管向后压缩液压驻退机，炮闩下落退出滚烫的金属弹底',
          },
          {
            stepBadge: '第 ④ 格',
            plateKey: 'comic_4_reload',
            title: '复进上弹',
            caption: '复进机把炮管稳稳推回原位，自动机或装填手迅速推入下一发',
          },
        ]
      : [
          {
            stepBadge: 'STEP ①',
            plateKey: 'comic_1_ready',
            title: 'Breech Locked',
            caption: 'Sliding wedge seals the cannon breech while gyros steady the aim',
          },
          {
            stepBadge: 'STEP ②',
            plateKey: 'comic_2_ignition',
            title: 'Main Gun Fire',
            caption: 'Electric primer fires massive propellant, launching a supersonic dart',
          },
          {
            stepBadge: 'STEP ③',
            plateKey: 'comic_3_eject',
            title: 'Hydraulic Recoil',
            caption: 'Barrel recoils into hydraulic brakes as the breech ejects the stub base',
          },
          {
            stepBadge: 'STEP ④',
            plateKey: 'comic_4_reload',
            title: 'Recuperator Reset',
            caption: 'Recuperator glides the barrel forward ready for the next cannon round',
          },
        ];
  }
  if (isArchery) {
    return isZh
      ? [
          {
            stepBadge: '第 ① 格',
            plateKey: 'comic_1_ready',
            title: '拉满蓄力',
            caption: '弓片弯成满月储存满满弹性势能，偏心凸轮进入省力谷',
          },
          {
            stepBadge: '第 ② 格',
            plateKey: 'comic_2_ignition',
            title: '撒放加速',
            caption: '扣动开关松开弓弦，双凸轮同步翻转推着箭矢飞驰',
          },
          {
            stepBadge: '第 ③ 格',
            plateKey: 'comic_3_eject',
            title: '离弦飞出',
            caption: '落箭台瞬间让路，尾羽引导碳箭笔直飞向前方',
          },
          {
            stepBadge: '第 ④ 格',
            plateKey: 'comic_4_reload',
            title: '减震归位',
            caption: '阻尼器吸收多余震动，弓片与弓弦稳稳回到初始位置',
          },
        ]
      : [
          {
            stepBadge: 'STEP ①',
            plateKey: 'comic_1_ready',
            title: 'Full Draw Energy',
            caption: 'Limbs flex to store elastic energy as cams settle into let-off',
          },
          {
            stepBadge: 'STEP ②',
            plateKey: 'comic_2_ignition',
            title: 'String Release',
            caption: 'Latch opens and twin cams uncoil smoothly to launch the arrow',
          },
          {
            stepBadge: 'STEP ③',
            plateKey: 'comic_3_eject',
            title: 'Clean Flight',
            caption: 'Rest drops clear while vanes stabilize straight-line flight',
          },
          {
            stepBadge: 'STEP ④',
            plateKey: 'comic_4_reload',
            title: 'Damped Return',
            caption: 'Dampers absorb vibration as limbs settle back to brace',
          },
        ];
  }

  return isZh
    ? [
        {
          stepBadge: '第 ① 格',
          plateKey: 'comic_1_ready',
          title: '整装待命',
          caption: '小弹头安静停在起点，击锤与弹簧已经蓄满能量',
        },
        {
          stepBadge: '第 ② 格',
          plateKey: 'comic_2_ignition',
          title: '点火冲刺',
          caption: '扳机释放撞针，膨胀气流推着弹头沿旋转膛线飞出',
        },
        {
          stepBadge: '第 ③ 格',
          plateKey: 'comic_3_eject',
          title: '后退抛壳',
          caption: '滑块向后滑动压紧大弹簧，顺便把空铜壳高高抛出去',
        },
        {
          stepBadge: '第 ④ 格',
          plateKey: 'comic_4_reload',
          title: '弹簧推回',
          caption: '复进大弹簧伸展发力，把滑块和下一颗新弹推回原位',
        },
      ]
    : [
        {
          stepBadge: 'STEP ①',
          plateKey: 'comic_1_ready',
          title: 'Locked & Ready',
          caption: 'Springs hold stored energy while the breech stays safely locked',
        },
        {
          stepBadge: 'STEP ②',
          plateKey: 'comic_2_ignition',
          title: 'Launch Impulse',
          caption: 'Expanding gas accelerates the projectile down the rifled bore',
        },
        {
          stepBadge: 'STEP ③',
          plateKey: 'comic_3_eject',
          title: 'Slide Recoil & Eject',
          caption: 'Carrier glides back, compressing the main spring & tossing brass',
        },
        {
          stepBadge: 'STEP ④',
          plateKey: 'comic_4_reload',
          title: 'Spring Return',
          caption: 'Main spring expands forward to seat the next round into lockup',
        },
      ];
}

function buildFallbackStory(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  lang: LanguageCode,
  name: string,
  actionMechanism: string,
  description: string
): {
  headline: string;
  deck: string;
  acts: StoryActItem[];
  breakthroughs: StoryBreakthroughItem[];
  milestones: StoryMilestoneItem[];
} {
  const isZh = lang === 'zh';
  const groupNameByKey = new Map(
    plugin.partGroups.map((g) => [g.key, isZh ? g.nameZh : g.nameEn])
  );
  const focusParts = plugin.parts.slice(0, 4);
  const acts: StoryActItem[] = [0, 1, 2, 3].map((idx) => {
    const p = focusParts[idx] ?? plugin.parts[0];
    const pName = isZh ? p.nameZh : p.nameEn;
    const grpLabel = groupNameByKey.get(p.group) ?? p.group;
    return {
      id: `fallback_act_${idx + 1}`,
      actNumber: isZh
        ? `第${['一', '二', '三', '四'][idx]}幕`
        : `ACT ${['I', 'II', 'III', 'IV'][idx]}`,
      eraTag: `STAGE 0${idx + 1}`,
      title: isZh ? `${pName}与总体机械布局` : `${pName} & System Architecture`,
      paragraphs: [
        description,
        isZh
          ? p.description
          : `${p.nameEn} (${p.bomCode}) — precision component within the ${grpLabel}.`,
      ],
      audioScript: '',
      audioUrl: '',
      focusPartId: p.id,
      focusPartLabel: pName,
    };
  });

  const breakthroughs: StoryBreakthroughItem[] = plugin.parts
    .slice(0, 3)
    .map((p, idx) => {
      const grpLabel = groupNameByKey.get(p.group) ?? p.group;
      return {
        id: `fb_bt_${idx}`,
        title: isZh ? p.nameZh : p.nameEn,
        tag: p.bomCode,
        summary: isZh
          ? p.description
          : `${p.nameEn} (${p.bomCode}) — core mechanical interface in the ${grpLabel}.`,
        focusPartId: p.id,
        focusPartLabel: isZh ? p.nameZh : p.nameEn,
      };
    });

  const milestones: StoryMilestoneItem[] = [
    {
      year: getWeaponManifest(weaponId).catalog.bayCode,
      title: name,
      detail: actionMechanism,
    },
  ];

  return {
    headline: name,
    deck: description,
    acts,
    breakthroughs,
    milestones,
  };
}

export function buildWeaponDeepLinkUrl(
  weaponId: WeaponId,
  lang: LanguageCode,
  originOverride?: string
): string {
  const baseOrigin =
    originOverride ??
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${window.location.pathname.replace(/showcase\.html$/, '')}`
      : 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/');
  const cleanBase = baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`;
  return `${cleanBase}?weapon=${weaponId}&screen=workbench&lang=${lang}`;
}

export function assembleMonographDossier(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null,
  originOverride?: string
): MonographDossierData {
  const isZh = lang === 'zh';
  const manifest = getWeaponManifest(weaponId);
  const catalog = manifest.catalog;
  const displayMeta = resolveWeaponDisplayMeta(weaponId, lang, bundle);
  const shortTag = getLocalizedShortWeaponLabel(weaponId, lang);
  const caliberProfile = manifest.caliberProfile;

  const archMeta = getArcheryProjectileMeta(caliberProfile);
  const isArchery = Boolean(archMeta) || catalog.category === 'archery';
  const isTank = catalog.category === 'armor' || isTankWeapon(weaponId);
  const cartridgeSpec = archMeta
    ? archeryProjectileToLabSpec(archMeta)
    : CARTRIDGE_LAB_SPECS[caliberProfile as keyof typeof CARTRIDGE_LAB_SPECS];
  const ballisticsSpec = getCaliberBallisticsSpec(caliberProfile);

  const serialTag =
    shortTag.replace(/[^A-Za-z0-9]/g, '').toUpperCase() ||
    weaponId.toUpperCase();
  const serialCode = `DA-2026-${catalog.bayCode}-${serialTag}`;

  const localizedStory =
    bundle?.story?.[lang] ??
    buildFallbackStory(
      weaponId,
      plugin,
      lang,
      displayMeta.name,
      displayMeta.actionMechanism,
      displayMeta.description
    );

  // Kid-friendly short 1-liner for cover
  const kidTagline = isZh
    ? `由 ${plugin.parts.length} 块精密 3D 机械积木拼成 · 核心原理：${displayMeta.actionMechanism}`
    : `Built from ${plugin.parts.length} interlocking 3D parts · ${displayMeta.actionMechanism}`;

  const kidsFunStats = buildKidsFunStats(
    displayMeta.overallLengthMm,
    displayMeta.weightKg,
    plugin.parts.length,
    cartridgeSpec.muzzleVelocityMps,
    lang,
    isArchery,
    isTank
  );

  // 4 Sub-Assembly Isolated Photo Cards
  const groupOrder: AssemblyGroupKey[] = [
    'slide',
    'frame',
    'fire_control',
    'magazine',
  ];
  const subAssemblyCards: KidsSubAssemblyPhotoCard[] = groupOrder.map(
    (gKey, idx) => {
      const grp = plugin.partGroups.find((g) => g.key === gKey);
      const gParts = plugin.parts.filter((p) => p.group === gKey);
      return {
        groupKey: gKey,
        plateKey: GROUP_TO_PLATE[gKey],
        bagNumber: `0${idx + 1}`,
        title: isZh ? (grp?.nameZh ?? gKey) : (grp?.nameEn ?? gKey),
        badgeColor: grp?.badgeColor ?? '#0284c7',
        partCount: gParts.length,
        partTags: gParts.slice(0, 6).map((p) => ({
          bomCode: p.bomCode,
          name: isZh ? p.nameZh : p.nameEn,
        })),
      };
    }
  );

  const comicFrames = buildKidsComicFrames(isArchery, lang, isTank);

  // 6-Role Functional Classification Matrix
  const roleBuckets = new Map<
    EngineeringRole,
    { bomCode: string; name: string }[]
  >();
  for (const r of ENGINEERING_ROLE_ORDER) {
    roleBuckets.set(r, []);
  }
  for (const part of plugin.parts) {
    const role = resolvePartEngineeringRole(weaponId, part);
    const partNarr = bundle?.parts?.[part.id];
    const pName = isZh ? part.nameZh : partNarr?.calloutLabelEn || part.nameEn;
    roleBuckets.get(role)?.push({
      bomCode: part.bomCode,
      name: pName,
    });
  }

  const roleSummaries: MonographRoleSummary[] = ENGINEERING_ROLE_ORDER.map(
    (role) => {
      const meta = getEngineeringRoleMeta(role, weaponId);
      const kidCopy = isArchery
        ? KID_ARCHERY_ROLE_COPY[role]
        : isTank
          ? KID_ARMOR_ROLE_COPY[role]
          : KID_ROLE_COPY[role];
      return {
        role,
        label: isZh ? meta.labelZh : meta.labelEn,
        shortLabel: isZh ? meta.shortZh : meta.shortEn,
        kidTeamTitle: isZh ? kidCopy.zhTitle : kidCopy.enTitle,
        kidShortTip: isZh ? kidCopy.zhTip : kidCopy.enTip,
        desc: isZh ? meta.descZh : meta.descEn,
        colorHex: meta.colorHex,
        parts: roleBuckets.get(role) ?? [],
      };
    }
  );

  // 7-Phase Firing Kinematics
  const firingPhases: MonographFiringPhaseRow[] = plugin.firingPhases.map(
    (ph) => {
      const loc = resolveFiringPhaseText(ph, lang, bundle);
      return {
        stepNum: ph.stepNum,
        shortLabel: loc.shortLabel,
        title: loc.title,
        description: loc.description,
      };
    }
  );

  // Complete Precision BOM Ledger + Live CSG Millimeter Envelopes
  let totalTriangles = 0;
  const bomRows: MonographBomRow[] = plugin.parts.map((part) => {
    const grp = plugin.partGroups.find((g) => g.key === part.group);
    const groupTitle = isZh
      ? (grp?.nameZh ?? part.group)
      : (grp?.nameEn ?? part.group);
    const badgeColor = grp?.badgeColor ?? '#0284c7';

    const geo = getCachedPartGeometry(weaponId, part.id);
    let envelopeMm = '—';
    let tris = 0;
    if (geo) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox) {
        const b = geo.boundingBox;
        const lx = ((b.max.x - b.min.x) * 10).toFixed(1);
        const ly = ((b.max.y - b.min.y) * 10).toFixed(1);
        const lz = ((b.max.z - b.min.z) * 10).toFixed(1);
        envelopeMm = `${lx}×${ly}×${lz} mm`;
      }
      const idx = geo.getIndex();
      const pos = geo.getAttribute('position');
      tris = idx
        ? Math.round(idx.count / 3)
        : pos
          ? Math.round(pos.count / 3)
          : 0;
      totalTriangles += tris;
    }

    const partNarr = bundle?.parts?.[part.id]?.[lang];
    const principleRaw =
      partNarr?.kinematicRole ||
      partNarr?.overview ||
      (isZh ? part.description : `${part.nameEn} · ${groupTitle}`);

    const principleText =
      principleRaw.length > 96
        ? `${principleRaw.slice(0, 94).trim()}…`
        : principleRaw;

    return {
      partId: part.id,
      bomCode: part.bomCode,
      primaryName: isZh ? part.nameZh : part.nameEn,
      secondaryName: isZh ? part.nameEn : groupTitle,
      groupKey: part.group,
      groupTitle,
      badgeColor,
      materialLabel: resolvePartMaterialLabel(weaponId, part, lang),
      envelopeMm,
      triangles: tris,
      principleText,
    };
  });

  // Field-Strip DAG & Interference Warnings
  const fsPlan = FIELD_STRIP_PLANS[weaponId];
  const fieldStripManualTitle = isZh
    ? fsPlan.manualCodeZh
    : fsPlan.manualCodeEn;
  const fieldStripRows: MonographFieldStripRow[] = fsPlan.steps.map((st) => ({
    orderLabel: st.orderLabel,
    title: isZh ? st.titleZh : st.titleEn,
    actionHint: isZh ? st.actionHintZh : st.actionHintEn,
    interferenceNote: isZh
      ? st.stripBlockedNoteZh || st.reassembleBlockedNoteZh
      : st.stripBlockedNoteEn || st.reassembleBlockedNoteEn,
  }));

  // 4 Canonical Stoppage Cards (automatically selects archery diagnostics for lift33 / r500)
  const malfunctionCards: MonographMalfunctionCard[] = MALFUNCTION_ORDER.map(
    (kind) => {
      const sc = getMalfunctionScenario(kind, weaponId);
      const stepTitles = sc.steps
        .map((st) => `${st.orderLabel}. ${isZh ? st.titleZh : st.titleEn}`)
        .join(' → ');
      return {
        code: sc.code,
        badge: isZh ? sc.badgeZh : sc.badgeEn,
        title: isZh ? sc.shortZh : sc.shortEn,
        rootCause: isZh ? sc.rootCauseZh : sc.rootCauseEn,
        drillSummary: stepTitles,
      };
    }
  );

  const deepLinkUrl = buildWeaponDeepLinkUrl(weaponId, lang, originOverride);
  const qrMatrix = encodeQrMatrix(deepLinkUrl);
  const qrSvg = buildQrSvgPath(qrMatrix, 2);

  return {
    weaponId,
    isArchery,
    isTank,
    lang,
    serialCode,
    bayCode: catalog.bayCode,
    volumeIndex: manifest.orderIndex,
    shortTag,
    modelCode: catalog.modelCode,
    name: displayMeta.name,
    subtitle: catalog.subtitleEn,
    originTag: displayMeta.originTag,
    caliberLabel: displayMeta.caliber,
    caliberProfile,
    actionMechanism: displayMeta.actionMechanism,
    description: displayMeta.description,
    kidTagline,
    highlights: displayMeta.highlights,
    metrics: {
      oal: displayMeta.overallLengthMm,
      barrel: displayMeta.barrelSpec,
      weight: displayMeta.weightKg,
      muzzleVelocity: displayMeta.muzzleVelocityMs,
      effectiveRange: displayMeta.effectiveRangeM,
      rateOfFire: displayMeta.rateOfFire,
      muzzleEnergyJ:
        cartridgeSpec.muzzleEnergyJ >= 1_000_000
          ? `${(cartridgeSpec.muzzleEnergyJ / 1_000_000).toFixed(2)} MJ`
          : `${cartridgeSpec.muzzleEnergyJ.toLocaleString('en-US')} J`,
    },
    kidsFunStats,
    subAssemblyCards,
    comicFrames,
    headline: localizedStory.headline,
    deck: localizedStory.deck,
    acts: localizedStory.acts,
    breakthroughs: localizedStory.breakthroughs,
    milestones: localizedStory.milestones,
    roleSummaries,
    firingPhases,
    bomRows,
    totalTrianglesFormatted: totalTriangles.toLocaleString('en-US'),
    cartridgeSpec,
    ballisticsSpec,
    fieldStripManualTitle,
    fieldStripRows,
    malfunctionCards,
    deepLinkUrl,
    qrSvg,
  };
}

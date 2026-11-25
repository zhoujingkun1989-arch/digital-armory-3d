import { buildCentennialMalfunctionProfiles } from '../../weapons/expansion/centennialProjectors';
import type { WeaponId } from '../../weapons/types';
import { isArcheryWeapon } from '../physics/armoryPhysics';

/**
 * WP-09 — Classic Firearm Malfunction Cutaway & Clearing Diagnostics Specifications
 * ---------------------------------------------------------------------------------
 * Defines the 4 canonical stoppages & mechanical safety blocks across all 11 firearms:
 *   1. `stovepipe`      — Failure to Eject / Upright Case Pinch (烟囱卡壳)
 *   2. `double_feed`    — Type-3 Double-Feed Chamber Stoppage (双进弹卡阻)
 *   3. `light_strike`   — Shallow Primer Indent / Failure to Fire (底火轻敲拒发)
 *   4. `out_of_battery` — Out-of-Battery (OOB) Safety Interception (未闭锁击发阻断)
 */

export type MalfunctionKind =
  | 'stovepipe'
  | 'double_feed'
  | 'light_strike'
  | 'out_of_battery';

export const MALFUNCTION_ORDER: readonly MalfunctionKind[] = [
  'stovepipe',
  'double_feed',
  'light_strike',
  'out_of_battery',
];

export interface MalfunctionDrillStepSpec {
  id: string;
  orderLabel: string;
  titleZh: string;
  titleEn: string;
  detailZh: string;
  detailEn: string;
}

export interface MalfunctionScenarioSpec {
  kind: MalfunctionKind;
  code: string;
  shortZh: string;
  shortEn: string;
  titleZh: string;
  titleEn: string;
  badgeZh: string;
  badgeEn: string;
  symptomZh: string;
  symptomEn: string;
  rootCauseZh: string;
  rootCauseEn: string;
  safetyNoteZh: string;
  safetyNoteEn: string;
  steps: readonly MalfunctionDrillStepSpec[];
}

export interface WeaponMalfunctionProfile {
  weaponId: WeaponId;
  actionPartIds: readonly string[];
  lockingPartIds: readonly string[];
  extractorPartId: string;
  fireControlPartIds: readonly string[];
  magazinePartIds: readonly string[];
  /** World-space magazine removal translation `[dx, dy, dz]` (cm; -Y for bottom mag, +Y for P90 top mag) */
  magStripOffsetCm: readonly [number, number, number];
  /** Ejection direction sign (+1 upward/right port, -1 downward chute on FN P90) */
  ejectionUpSign: 1 | -1;
  /** Freeze `fireProgress` values along the 7-phase cycle for each malfunction */
  stovepipeF: number;
  doubleFeedF: number;
  rackFullOpenF: number;
  lightStrikeF: number;
  outOfBatteryF: number;
}

export const MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'TYPE-2 · FTE',
    shortZh: '烟囱卡壳',
    shortEn: 'Stovepipe',
    titleZh: '烟囱式抛壳卡阻（Failure to Eject / Stovepipe）',
    titleEn: 'Stovepipe Case Pinch (Type-2 Failure to Eject)',
    badgeZh: '二级故障 · 抛壳夹持',
    badgeEn: 'Type-2 Stoppage · Port Pinch',
    symptomZh:
      '空弹壳未能彻底飞离抛壳窗，呈约 80° 竖直“烟囱状”被复进回程的套筒/枪机框前缘死死夹持在弹膛口上方。',
    symptomEn:
      'Spent brass fails to clear the ejection port and stands ~80° upright like a chimney, pinched between the returning bolt/slide face and barrel hood.',
    rootCauseZh:
      '常见于发射药膛压偏弱、射手手腕支撑松软（Limp-Wristing 吸收套筒后坐冲量）、抽壳钩弹簧积碳疲软或抛壳挺尖端磨损，导致空壳角速度不足以赶在复进前飞出。',
    rootCauseEn:
      'Caused by under-powered ammunition, shooter limp-wristing absorbing slide recoil energy, fouled extractor tension, or a worn ejector failing to impart sufficient angular velocity.',
    safetyNoteZh:
      '排障铁律：食指脱离扳机护圈，枪口指向安全方向，切勿直接将空壳硬塞回抛壳窗。',
    safetyNoteEn:
      'Safety rule: index finger off trigger, muzzle pointed downrange; sweep and rack rearward rather than pushing brass inward.',
    steps: [
      {
        id: 'sp_rack_sweep',
        orderLabel: '01',
        titleZh: '后拉自动机解脱夹持并甩出烟囱空壳',
        titleEn: 'Rack Action Rearward & Sweep Upright Brass',
        detailZh:
          '果断将套筒/拉机柄拉到底，卸除复进簧对空壳颈部的夹紧力，使竖立空壳顺抛壳窗翻滚脱落。',
        detailEn:
          'Pull the slide or charging handle sharply to the rear, releasing pinch tension so the upright spent case tumbles clear of the port.',
      },
      {
        id: 'sp_strip_feed',
        orderLabel: '02',
        titleZh: '检视弹膛净空并释放复进推弹',
        titleEn: 'Verify Clear Port & Release to Strip Next Round',
        detailZh:
          '确认弹膛与抛壳窗无残留异物后松开拉机柄（切勿随手缓放），靠复进簧全行程势能推次发实弹入膛。',
        detailEn:
          'Confirm an unobstructed chamber, then release the action cleanly without riding it forward to strip a fresh round.',
      },
      {
        id: 'sp_lock_ready',
        orderLabel: '03',
        titleZh: '确认闭锁到位与抽壳钩啮合恢复待击',
        titleEn: 'Confirm Full Battery & Extractor Engagement',
        detailZh:
          '复检枪机突笋/套筒完全归位闭锁，抽壳钩跨入新弹底缘沟槽，排障闭环完成。',
        detailEn:
          'Verify full breech lockup with the extractor claw seated cleanly in the rim groove—firearm restored to battery.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'TYPE-3 · DBL',
    shortZh: '双进弹',
    shortEn: 'Double Feed',
    titleZh: '双进弹恶性卡阻（Type-3 Double-Feed Stoppage）',
    titleEn: 'Double-Feed Chamber Wedge (Type-3 Stoppage)',
    badgeZh: '三级重度故障 · 双弹顶死',
    badgeEn: 'Type-3 Severe Jam · Dual-Round Wedge',
    symptomZh:
      '首发射击后的空壳（或实弹）滞留膛内未抽出，自动机回程又从弹匣抱弹口推出第二发实弹，弹尖向上斜顶在膛内弹底缘后方彻底卡死。',
    symptomEn:
      'Round #1 remains stuck inside the chamber while the returning bolt strips Round #2 up the feed ramp, wedging its bullet nose against Round #1’s case head.',
    rootCauseZh:
      '多因膛壁积碳膨胀粘连、抽壳钩断裂滑脱底缘（Failure to Extract），或弹匣抱弹口变形导致双发同时越出抱弹唇。单纯“拍拉瞄”无法解除此故障！',
    rootCauseEn:
      'Triggered by extractor slip over a fouled/expanded chambered case or spread magazine feed lips. Standard Tap-Rack fails because the magazine spring pins the jam.',
    safetyNoteZh:
      '三级排障核心：必须先挂机卸压并强行拔除弹匣，否则下方实弹在托弹簧顶推下绝无退路。',
    safetyNoteEn:
      'Critical Type-3 rule: lock the action open to relieve bolt pressure BEFORE ripping out the magazine.',
    steps: [
      {
        id: 'df_lock_rear',
        orderLabel: '01',
        titleZh: '拉柄挂机卸除自动机前顶压力（Lock）',
        titleEn: 'Lock Bolt / Slide to the Rear (Lock)',
        detailZh:
          '后拉套筒/枪机框并上抬空仓挂机杆锁死在后方，解除枪机面对第二发斜卡实弹的轴向挤压力。',
        detailEn:
          'Retract the slide/carrier and engage the catch to remove forward spring load from the wedged second cartridge.',
      },
      {
        id: 'df_rip_mag',
        orderLabel: '02',
        titleZh: '按下弹匣扣强行拔除供弹弹匣（Rip）',
        titleEn: 'Depress Catch & Rip Out Magazine (Rip)',
        detailZh:
          '由于次发实弹半脱出抱弹口，弹匣常存在摩擦阻滞，需果断拔出弹匣使松动的斜顶实弹从弹匣井掉落。',
        detailEn:
          'Forcibly strip the partially bound magazine from the well so the unseated second cartridge drops free.',
      },
      {
        id: 'df_rack_clear',
        orderLabel: '03',
        titleZh: '连续拉栓三次彻底钩出膛内滞留壳（Rack ×3）',
        titleEn: 'Work Action Vigorously to Extract Stuck Case (Rack)',
        detailZh:
          '在无弹匣状态下反复拉动自动机，让抽壳钩重新越过膛内滞留弹底缘并将其干净抛出。',
        detailEn:
          'Cycle the empty action so the extractor claw snaps over the stuck chamber rim and ejects it clear.',
      },
      {
        id: 'df_reload_chamber',
        orderLabel: '04',
        titleZh: '换插完好弹匣并释栓推弹闭锁（Reload）',
        titleEn: 'Insert Verified Magazine & Chamber Round (Reload)',
        detailZh:
          '插入抱弹口完好的备份弹匣，释放挂机推弹入膛并完成刚性闭锁。',
        detailEn:
          'Seat a serviceable magazine and release the bolt/slide to chamber a fresh round into full lockup.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'TYPE-1 · FTF',
    shortZh: '轻敲拒发',
    shortEn: 'Light Strike',
    titleZh: '底火轻敲拒发（Light Primer Strike / Misfire）',
    titleEn: 'Light Primer Strike & Failure to Ignite (Type-1)',
    badgeZh: '一级故障 · 击发能量不足',
    badgeEn: 'Type-1 Misfire · Shallow Indent',
    symptomZh:
      '枪机完全闭锁且扣下扳机听到清脆击锤/击针释放在前声（Click No Bang），但镀镍底火杯仅留下极浅微凹痕，击发药未起爆。',
    symptomEn:
      'Audible hammer/striker drop on a locked chamber with zero detonation; inspection reveals a shallow off-spec dimple unable to crush priming compound against the Boxer anvil.',
    rootCauseZh:
      '击针孔道内淤积黄铜碎屑、碳渣或严寒凝固枪油阻碍击针冲程；击针簧/击锤簧金属疲劳衰减；或军规底火杯壁过硬、底火压入过深。',
    rootCauseEn:
      'Carbon/brass debris or congealed lubricant dragging inside the firing-pin channel, fatigued striker/hammer spring, or deeply seated hard military primer cups.',
    safetyNoteZh:
      '靶场处置注意：排除疑似迟发弹（Hangfire）风险后，快速拉栓将拒发整弹抛离，事后分解清理击针通道。',
    safetyNoteEn:
      'Range protocol: maintain downrange discipline against potential hangfire, then rack briskly to eject the intact misfired cartridge.',
    steps: [
      {
        id: 'ls_tap_mag',
        orderLabel: '01',
        titleZh: '向上拍实弹匣底板确认供弹到位（Tap）',
        titleEn: 'Slap Magazine Floorplate Upward (Tap)',
        detailZh:
          '掌根有力拍击弹匣底板，确保弹匣卡笋彻底咬合，为下一步拉栓重新推弹做好准备。',
        detailEn:
          'Strike the baseplate firmly to guarantee positive magazine latch engagement before cycling.',
      },
      {
        id: 'ls_rack_eject',
        orderLabel: '02',
        titleZh: '全行程拉栓抛出浅坑拒发整弹（Rack）',
        titleEn: 'Rack Action Fully to Eject Misfired Live Round (Rack)',
        detailZh:
          '到底拉动套筒/拉机柄，抽壳钩将带有浅印痕的完整未爆实弹（含弹头）整体钩出抛离机匣，并重新压倒击锤/待击击针。',
        detailEn:
          'Pull the action briskly through full travel, ejecting the complete unfired cartridge while re-cocking the hammer or striker.',
      },
      {
        id: 'ls_chamber_ready',
        orderLabel: '03',
        titleZh: '复进上膛闭锁并标记检修击针簧（Assess）',
        titleEn: 'Release into Battery & Flag Firing-Pin Channel Inspection',
        detailZh:
          '松手推次发新弹入膛完成闭锁恢复射击，勤务后须拆出击针清理油泥并检测击针突出量。',
        detailEn:
          'Feed a fresh cartridge into full battery; schedule post-shoot firing-pin channel cleaning and protrusion gauge check.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · OOB',
    shortZh: '未闭锁阻断',
    shortEn: 'OOB Safety',
    titleZh: '未闭锁不到位保险阻断（Out-of-Battery Safety Block）',
    titleEn: 'Out-of-Battery (OOB) Mechanical Safety Interception',
    badgeZh: '核心安全保护 · 炸膛防护',
    badgeEn: 'Breech Safety · Kaboom Prevention',
    symptomZh:
      '实弹距完全入膛尚差约 4.2mm，回转枪机突笋/闭锁滚柱未旋入节套闭锁槽；此时即便扣动扳机，枪机框尾部/不到位断连器亦物理阻断击锤触碰击针！',
    symptomEn:
      'Cartridge stops ~4.2mm short of full seating with locking lugs/rollers unengaged; carrier geometry and OOB disconnector physically block hammer/striker contact with the firing pin.',
    rootCauseZh:
      '弹壳肩部轻微鼓胀变形、坡膛积碳环卡滞，或随手缓放拉机柄导致复进末段动能不足以克服闭锁凸轮摩擦。不到位保险避免了 350–430 MPa 高压燃气在未闭锁机匣内炸膛！',
    rootCauseEn:
      'Caused by a bulged case shoulder, fouled chamber throat, or riding the charging handle forward. OOB safety geometry prevents 350–430 MPa detonation in an unlocked breech.',
    safetyNoteZh:
      '严禁对变形超规弹强行猛砸助推器！应先退弹检查弹膛与闭锁突笋端面是否有异物。',
    safetyNoteEn:
      'Never hammer an out-of-spec bulged round into the chamber; extract and inspect chamber neck & locking recesses.',
    steps: [
      {
        id: 'oob_retract_extract',
        orderLabel: '01',
        titleZh: '松开扳机并后拉自动机抽出卡滞实弹',
        titleEn: 'Release Trigger & Retract Action to Extract Bound Round',
        detailZh:
          '停止扣压扳机，后拉套筒/拉机柄解脱半入膛卡滞弹药并将其安全抛出。',
        detailEn:
          'Release the trigger shoe and pull the slide/carrier fully rearward to extract and eject the out-of-spec cartridge.',
      },
      {
        id: 'oob_inspect_lugs',
        orderLabel: '02',
        titleZh: '检视弹膛肩部与闭锁突笋槽积碳异物',
        titleEn: 'Inspect Chamber Datum & Locking Recesses',
        detailZh:
          '通过剖视窗口确认节套闭锁凹槽、枪管坡膛无碎铜皮或碳环阻挡枪机回转到位。',
        detailEn:
          'Verify that barrel extension locking lugs and chamber throat are free of brass shavings or carbon rings.',
      },
      {
        id: 'oob_full_lockup',
        orderLabel: '03',
        titleZh: '全势能释放自动机完成 100% 刚性闭锁',
        titleEn: 'Slingshot Action into 100% Positive Breech Lockup',
        detailZh:
          '拉到底干脆释放拉机柄，使枪机突笋彻底旋入闭锁承压面（0.0mm 间隙），不到位保险自动解除。',
        detailEn:
          'Release from full retraction so locking lugs rotate into full engagement (0.0mm breech gap), clearing the OOB interlock.',
      },
    ],
  },
};

export function isArcheryMalfunctionWeapon(
  weaponId: WeaponId | string | null | undefined
): boolean {
  return isArcheryWeapon(weaponId);
}

/**
 * 4 Canonical Archery Mechanical Stoppages & Anti-Dry-Fire Safety Scenarios (WP-09)
 * Note: Preserves exact [3, 4, 3, 3] step counts so `malfunctionStore` clear curves
 * and progress counters remain 100% synchronized.
 */
export const ARCHERY_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'ARCHERY · VANE',
    shortZh: '羽片干涉',
    shortEn: 'Vane Hang-Up',
    titleZh: '箭台延时刮羽 / 压箭片干涉卡阻（Vane / Rest Hang-Up）',
    titleEn: 'Vane Contact & Drop-Away Rest Timing Hang-Up',
    badgeZh: '外物卡滞 · 箭道偏斜',
    badgeEn: 'Rest Timing · Fletching Interference',
    symptomZh:
      '碳箭高速推射经过箭窗时，下落式箭台叉片未能提前下落让位或弩压箭臂弹力失调，尾部羽片擦挂叉片造成箭体抬头偏斜、初速骤降并残留撕裂尾羽碎屑。',
    symptomEn:
      'Fletching vanes strike the drop-away launcher fork or bolt retention arm due to timing cord slack or uneven fletch index, deflecting tail trajectory and stripping velocity.',
    rootCauseZh:
      '下落式箭台拉绳张力松弛（Timing Lag）、尾扣未旋转至垂直开羽方位（Cock Vane Index Error），或弩箭压簧积尘导致弹片回弹卡滞。',
    rootCauseEn:
      'Delayed launcher drop caused by timing-cord stretch, mis-indexed cock vane hitting the shelf edge, or grit fouling the crossbow bolt retention spring.',
    safetyNoteZh:
      '严禁直接徒手硬拔卡滞羽片或顶着弓弦拉拽！必须先卸除蓄力状态检查碳箭杆体是否有纵裂分层。',
    safetyNoteEn:
      'Never shoot a cracked carbon shaft or force a pinched vane forward under draw tension—flex-test shaft integrity before re-nocking.',
    steps: [
      {
        id: 'arch_vane_safe',
        orderLabel: '01',
        titleZh: '拨入保险档并泄除撒放预紧张力（Let-Down）',
        titleEn: 'Engage Safety & Let Down / De-Cock Safely (Safe)',
        detailZh:
          '将快慢机/防空放锁置于 SAFE 位，稳妥解除凸轮/滑座蓄力状态再接近箭台工作区。',
        detailEn:
          'Select SAFE mode and safely control tension off the cams/trigger sled before touching the rest window.',
      },
      {
        id: 'arch_vane_clear',
        orderLabel: '02',
        titleZh: '清除箭台挂羽并检查碳箭弯折裂纹（Clear & Flex）',
        titleEn: 'Clear Obstructed Arrow & Flex-Test Carbon Shaft',
        detailZh:
          '点击卡滞箭体移出箭窗，弯折监听碳纤杆有无纤维劈裂声并清理叉片绒毛磨损屑。',
        detailEn:
          'Extract the hung-up arrow from the launcher/rail channel and flex-test the carbon weave for delamination.',
      },
      {
        id: 'arch_vane_retune',
        orderLabel: '03',
        titleZh: '校正主羽片索引方位与箭台同步落差（Index）',
        titleEn: 'Re-Index Cock Vane & Rest Drop-Away Timing',
        detailZh:
          '旋转箭尾扣确保副羽顺窗隙无刮擦通过，复测下落式箭台 / 压箭臂动作顺畅后装回新箭。',
        detailEn:
          'Rotate nock for 100% vane clearance, confirm crisp launcher/retention drop timing, and reload a verified shaft.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'ARCHERY · NOCK',
    shortZh: '夹箭重卡',
    shortEn: 'Nock Pinch',
    titleZh: '箭尾夹弦偏移与备用箭干涉双卡（Nock Pinch / Quiver Foul）',
    titleEn: 'Nock Pinch & Side-Quiver Feed Interference',
    badgeZh: '供箭干涉 · 弦扣偏扭',
    badgeEn: 'Feed Obstruction · Nock Pinch',
    symptomZh:
      '复合弓高角度大弦角或未压实箭尾扣引发剧烈夹弦（Nock Pinch），与此同时侧挂箭壶拨片松动导致副箭移位顶撞，主副两箭相互别卡无法合位。',
    symptomEn:
      'Sharp string angle pinches the nock throat upward off center while an unlatched side-quiver shaft intrudes into the draw plane, preventing clean seating.',
    rootCauseZh:
      'D 环预留间隙过紧在满弓时挤压箭尾扣耳片，导致半脱扣风险；外加侧挂箭壶卡扣未锁紧使备用碳箭窜位。',
    rootCauseEn:
      'Over-tight D-loop spacing squeezes nock ears at full draw (inducing false nock separation) combined with an unseated quiver retention latch.',
    safetyNoteZh:
      '夹箭脱扣极易在撒放瞬间等价于“半空放（Dry-Fire）”，释放数百焦耳冲击波炸伤弓片或损坏螺旋轮槽！',
    safetyNoteEn:
      'A pinched or cracked nock splitting on release mimics a catastrophic dry-fire—always inspect nock ears with light before drawing.',
    steps: [
      {
        id: 'arch_nock_lock',
        orderLabel: '01',
        titleZh: '控稳弦路并检查挂弦锁 / 撒放环间隙（Hold & Check）',
        titleEn: 'Stabilize String Path & Inspect D-Loop / Sled Gap',
        detailZh:
          '在未进入拉弓行程前停止上膛，检查 D 环结距是否给箭尾扣留出 0.5mm 自由浮动余量。',
        detailEn:
          'Halt draw immediately and inspect the D-loop or latch throat for excessive axial pinch on the nock.',
      },
      {
        id: 'arch_nock_quiver',
        orderLabel: '02',
        titleZh: '解脱侧挂箭壶并移出窜位副箭（Strip Quiver）',
        titleEn: 'Detach Quiver Assembly & Clear Intrusive Shaft',
        detailZh:
          '点击侧挂箭壶向右拆离弓身，将错位干涉的备用碳箭从供箭空间彻底取出。',
        detailEn:
          'Click to detach the side quiver right, freeing the workspace and clearing the interfering backup arrow.',
      },
      {
        id: 'arch_nock_inspect',
        orderLabel: '03',
        titleZh: '退出损伤夹尾主箭并更换完整尾扣（Clear Pinch）',
        titleEn: 'Remove Pinched Primary Shaft & Replace Nock',
        detailZh:
          '拔出原夹弦主箭并报废裂纹尾扣，检查弦中心护弦缠线（Serving）有无散股抽丝。',
        detailEn:
          'Withdraw the pinched primary shaft, discard any stressed plastic nock, and check center serving tightness.',
      },
      {
        id: 'arch_nock_reseat',
        orderLabel: '04',
        titleZh: '锁回箭壶并将新箭听到清脆“咔哒”声搭弦就位（Reseat）',
        titleEn: 'Re-Latch Quiver & Seat Fresh Bolt/Arrow with Positive Click',
        detailZh:
          '装回箭壶卡扣，垂直压紧新碳箭尾扣至中心护弦位，轻甩测试箭矢无自滑脱落。',
        detailEn:
          'Re-secure the quiver latch and press a fresh carbon shaft onto the string/rail until positively seated.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'ARCHERY · LATCH',
    shortZh: '挂弦检校',
    shortEn: 'Latch Check',
    titleZh: '挂弦抓爪未闭合 / D 环偏转阻滞（Incomplete Latch Check）',
    titleEn: 'Incomplete String Latch & Release D-Loop Alignment Check',
    badgeZh: '释弦机构 · 啮合偏差',
    badgeEn: 'Release Mechanism · Incomplete Latch',
    symptomZh:
      '弩 Trac-Trigger 悬浮挂弦爪因弓弦护线歪斜未能 100% 越过顶锁点，或复合弓 D 环打结滑移导致撒放器钳口咬偏、扣扳机无响应（Dead Trigger）。',
    symptomEn:
      'Floating string latch fails to snap fully around off-center string serving, or rotated D-loop prevents sear engagement, locking out trigger release.',
    rootCauseZh:
      '中心护弦缠线厚度磨损超差、螺旋挂弦滑座未到底触发卡位，或阻铁弹簧夹杂凝脂造成单边挂爪虚啮合。',
    rootCauseEn:
      'Frayed center serving, incomplete sled homing forward to pick up the string, or asymmetric jaw engagement inside the D-loop.',
    safetyNoteZh:
      '挂爪虚啮合在拉绞途中可能突发提前滑脱，务必透过侧窗确认指示销完全归位后再继续上弦。',
    safetyNoteEn:
      'Partial latch engagement risks premature slippage under 300 lb draw load—verify full indicator engagement before cranking.',
    steps: [
      {
        id: 'arch_latch_safe',
        orderLabel: '01',
        titleZh: '确认安全闭锁并停止继续摇柄上弦（Hold & Safe）',
        titleEn: 'Confirm SAFE Interlock & Halt Cocking Stroke',
        detailZh:
          '切至 SAFE 位阻断扳机连杆，防止排障手部介入时卡爪受震突发释放。',
        detailEn:
          'Verify SAFE selector engagement to lock the trigger sear prior to inspecting the latch jaws.',
      },
      {
        id: 'arch_latch_unload',
        orderLabel: '02',
        titleZh: '卸载箭体并前后校对 D 环/悬浮挂弦爪啮合窗口（Inspect Latch）',
        titleEn: 'Unload Projectile & Cycle Latch / D-Loop Alignment',
        detailZh:
          '退出箭体并复核中心护弦是否严密落入卡爪槽底或 D 环双结居中无侧扭。',
        detailEn:
          'Clear the projectile and inspect the string serving seat inside the floating latch hook or D-loop alignment.',
      },
      {
        id: 'arch_latch_verify',
        orderLabel: '03',
        titleZh: '测试单发火控复位并重装新箭（Verify Reset）',
        titleEn: 'Verify Clean Sear Lockup & Re-Nock Projectile',
        detailZh:
          '确认挂爪双耳对称吃弦、防空放顶杆复位，重新装回 400 gr 碳箭进入待发基准姿态。',
        detailEn:
          'Confirm symmetric string jaw lockup and re-seat the verified 400 gr carbon arrow or bolt.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · ADF',
    shortZh: '防空放脱轨',
    shortEn: 'ADF / Cam Lock',
    titleZh: '未装箭防空放自锁阻断 / 凸轮弦槽偏轨（ADF & Cam Derail Block）',
    titleEn: 'Anti-Dry-Fire (ADF) Safety Block & Cam Track Alignment',
    badgeZh: '防空放安全 · 凸轮护槽',
    badgeEn: 'Dry-Fire Interlock · Cam Timing',
    symptomZh:
      '半月箭尾未顶推防空放阻块（ADF）到位，阻块刚性顶死 Trac-Trigger 击发连杆使扳机完全无法扣动；同步检查凸轮轮缘是否因侧向扭弦发生脱槽（Cam Derail）。',
    symptomEn:
      'Bolt nock falls short of depressing the Anti-Dry-Fire (ADF) safety pawl, physically blocking trigger release while cam-track inspection guards against cable derailment.',
    rootCauseZh:
      '未使用专用半月尾扣、装箭未顶抵弦心，或手工大扭矩扭捏弓把（Hand Torque）拉偏 Y 形同步副缆导致偏心轮弦离槽。',
    rootCauseEn:
      'Non-seated flat/half-moon nock leaving the ADF sear engaged, or shooter hand torque pulling the string out of cam track grooves.',
    safetyNoteZh:
      '空放瞬间 145–301 J 能量无处释放会全部回灌入碳纤维弓片与铝凸轮导致爆裂！绝不可绕过防空放（ADF）机构试机。',
    safetyNoteEn:
      'Never defeat the ADF safety or fire without a seated projectile—145–301 J of undamped strain rebounds directly into limbs and cams.',
    steps: [
      {
        id: 'arch_adf_halt',
        orderLabel: '01',
        titleZh: '立即停止扣扳机并锁定防空放保险阻块（Lock ADF）',
        titleEn: 'Release Trigger & Hold Anti-Dry-Fire Interlock',
        detailZh:
          '松开扳机手指确认 ADF 铜色联动挡块已顶死阻铁，杜绝任何无箭释弦风险。',
        detailEn:
          'Keep finger off trigger while verifying the mechanical ADF block physically isolates the trigger sear.',
      },
      {
        id: 'arch_adf_camtrack',
        orderLabel: '02',
        titleZh: '逐轮核查上下/左右凸轮轮槽与同步缆线居中度（Inspect Cams）',
        titleEn: 'Inspect Binary / HexCoil Cam Grooves & Yoke Timing',
        detailZh:
          '沿 SwitchWeight-X / HexCoil 轮缘检查主弦与副缆均完整嵌入导槽，轮轴无偏斜倾角。',
        detailEn:
          'Verify bowstring and power/yoke cables sit dead-center inside every cam track with synchronized timing marks.',
      },
      {
        id: 'arch_adf_seat',
        orderLabel: '03',
        titleZh: '顶实半月尾扣解除 ADF 阻断并归位满装待发（Full Seat）',
        titleEn: 'Seat Nock Flush Against String to Clear ADF Lock',
        detailZh:
          '将合格 400 gr 碳箭推到底使半月尾扣平贴弓弦并解锁 ADF 阻块，确认 100% 安全待发姿态。',
        detailEn:
          'Push a verified 400 gr projectile flush onto the string to smoothly disengage the ADF interlock for safe release.',
      },
    ],
  },
};

export const REVOLVER_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'REVOLVER · STAR',
    shortZh: '退壳越缘',
    shortEn: 'Rim Slip',
    titleZh: '星形退壳器越缘滑脱卡壳（Under-Extractor Rim Slip）',
    titleEn: 'Under-Extractor Rim Slip & Fouled Chamber Stick',
    badgeZh: '退壳卡阻 · 空壳越星',
    badgeEn: 'Extraction Jam · Rim Slip',
    symptomZh:
      '摆出弹巢拍击退壳杆时，未燃烧火药残渣垫起六角星形退壳器，导致膨胀 .357 空壳底缘滑入星形盘背下方死死卡住弹巢摇臂无法合拢。',
    symptomEn:
      'Unburned powder flakes under the 6-point extractor star allow a swelled .357 case rim to slip beneath the star, jamming the cylinder open.',
    rootCauseZh:
      '退壳时不按教范枪口朝天垂直拍杆（水平侧倾拍杆导致碎火药粒掉入星形盘定位销槽），或大量练习低压 .38 弹后弹膛前段积碳环抱紧较长的 .357 弹壳。',
    rootCauseEn:
      'Horizontal rod strokes spill unburned powder beneath the extractor star, or .38 Special carbon rings seize longer .357 Magnum brass.',
    safetyNoteZh:
      '严禁强行把卡有越缘弹壳的摇臂硬拍回机匣框，否则会永久压弯精密摇臂（Crane Sprung）破坏同轴度！',
    safetyNoteEn:
      'Never slam a bound crane shut—forcing an unseated extractor star bends the precision crane yoke out of alignment.',
    steps: [
      {
        id: 'rev_star_vertical',
        orderLabel: '01',
        titleZh: '枪口竖直朝上稳持摆出的弹巢摇臂（Muzzle Up）',
        titleEn: 'Point Muzzle Vertically Upward & Stabilize Crane',
        detailZh:
          '将枪口指向正上方利用重力协助火药碎屑滑落，松开退壳顶杆让复位簧推回星形退壳器夹住滑脱底缘。',
        detailEn:
          'Orient muzzle straight up and release the ejector rod so the return spring snaps the star back beneath the slipped rim.',
      },
      {
        id: 'rev_star_pluck',
        orderLabel: '02',
        titleZh: '扣出越缘空弹壳并吹扫星形盘背面残渣（Clear Under-Star）',
        titleEn: 'Pluck Trapped Brass & Brush Under Extractor Star',
        detailZh:
          '剥离滑入星形盘下方的膨胀空壳，彻底清理星形棘轮背面的未燃发射药颗粒与黄铜屑。',
        detailEn:
          'Extract the trapped case and brush unburned propellant granules from the extractor star seat and alignment pins.',
      },
      {
        id: 'rev_star_close',
        orderLabel: '03',
        titleZh: '推压星形盘平齐落座、装入新弹并合拢弹巢（Reload & Lock）',
        titleEn: 'Confirm Flush Star Seat, Speedload & Close Cylinder',
        detailZh:
          '确认星形退壳器与弹巢后端面 100% 平齐贴合后，用快装器压入新弹并轻推弹巢入框闭锁。',
        detailEn:
          'Verify the extractor star sits flush against the cylinder face, speedload fresh .357 rounds, and press the cylinder into lockup.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'REVOLVER · BIND',
    shortZh: '转轮抱死',
    shortEn: 'Cylinder Bind',
    titleZh: '高底火擦框 / 拔弹跳头锁死转轮（High-Primer & Crimp-Jump Bind）',
    titleEn: 'High-Primer Recoil-Shield Drag & Bullet Crimp-Jump Bind',
    badgeZh: '重度抱死 · 分度停摆',
    badgeEn: 'Severe Bind · Rotation Seized',
    symptomZh:
      '双动扣压扳机时转轮完全咬死转不动：后端一枚未压平凸起底火死死顶在机匣击针衬套平面上，同时相邻膛内马格南弹头受后坐惯性拔出壳口（Crimp Jump）探出弹巢前端面撞住枪管坡口！',
    symptomEn:
      'Cylinder seizes solid mid-stroke: a proud unseated primer drags hard against the frame recoil shield while a recoil-pulled bullet nose protrudes past the cylinder face into the forcing cone.',
    rootCauseZh:
      '复装弹底火未压入低于壳底 0.08mm，或大威力 .357 轻壳口滚花卷边（Roll Crimp）不足，连续猛烈后坐宛如“惯性拔弹锤”将待发弹头向前震出弹巢。',
    rootCauseEn:
      'Proudly seated primer above the case head combined with insufficient roll-crimp allowing heavy .357 recoil to pull an unfired bullet forward out of its case.',
    safetyNoteZh:
      '切勿用蛮力猛扣双动扳机强转抱死弹巢——强行刮擦凸起底火存在框外挤压殉爆风险，且会刮伤拨爪（Hand）尖齿！',
    safetyNoteEn:
      'Never muscle the DA trigger against a bound cylinder—shearing a proud primer risks out-of-alignment detonation and bends the hand pawl.',
    steps: [
      {
        id: 'rev_bind_release',
        orderLabel: '01',
        titleZh: '立即松开扳机使回弹杠杆归位锁定击锤（Release Trigger）',
        titleEn: 'Release Trigger Shoe to Reset Rebound Safety',
        detailZh:
          '停止扣扳机让回弹安全杠杆退回保险位，解除手拨棘爪对星形棘齿的强推剪切力。',
        detailEn:
          'Release trigger tension immediately so the rebound lever retracts the hammer and relieves hand pawl load.',
      },
      {
        id: 'rev_bind_swing',
        orderLabel: '02',
        titleZh: '后拉水滴锁栓小心推开卡滞弹巢摇臂（Unlatch & Swing）',
        titleEn: 'Pull Cylinder Latch & Carefully Ease Cylinder Out',
        detailZh:
          '向后拉满左侧解脱栓，稳托弹巢绕开枪管坡口凸出的跳头弹尖，向外摆出摇臂。',
        detailEn:
          'Retract the teardrop thumbpiece fully and ease the bound cylinder clear of the barrel forcing cone.',
      },
      {
        id: 'rev_bind_dump',
        orderLabel: '03',
        titleZh: '垂直拍杆清空全部6发故障弹并检视弹巢间隙（Dump All 6）',
        titleEn: 'Eject All 6 Suspect Rounds & Inspect B/C Gap',
        detailZh:
          '将凸底火弹与拔出弹头的故障弹整组退出隔离，检查弹巢前端面与枪管坡口无铅屑堆积。',
        detailEn:
          'Dump the entire 6-round charge, quarantine high-primer/crimp-jumped cartridges, and inspect forcing-cone clearance.',
      },
      {
        id: 'rev_bind_reload',
        orderLabel: '04',
        titleZh: '装填标准重卷边原厂 .357 弹并复核自由旋转（Reload Factory）',
        titleEn: 'Load Heavy Roll-Crimped Duty .357 & Verify Free Spin',
        detailZh:
          '压入底火微凹、重滚花锁口的标准勤务弹，合拢弹巢确认 6 膛分度顺滑无阻。',
        detailEn:
          'Load factory roll-crimped .357 Magnum with recessed primers, close the crane, and verify silky indexing.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'REVOLVER · V-SPRING',
    shortZh: 'V簧轻敲',
    shortEn: 'Light Strike',
    titleZh: '折叠V型主簧张力螺钉松退拒发（Mainspring Strain Light Strike）',
    titleEn: 'V-Mainspring Tension Loss & Shallow Primer Strike',
    badgeZh: '双动拒发 · 浅坑哑弹',
    badgeEn: 'DA Misfire · Shallow Dimple',
    symptomZh:
      '双动击发只闻清脆空击声，该膛底火仅留下极浅凹痕未引燃；柯尔特 Python 若在拒发瞬间没有盲目摆巢，直接再次扣动双动扳机即可瞬间转入下一膛实弹补射！',
    symptomEn:
      'Hammer fall yields a click and shallow primer dimple without ignition; revolver kinematics allow an immediate second DA pull to index a fresh chamber.',
    rootCauseZh:
      '射手为追求极致轻扳机力私自旋松握把前缘主簧张力螺钉（或垫薄 V 型板簧），或框内浮动惯性击针孔积油凝结消耗了击锤动能。',
    rootCauseEn:
      'Backed-out V-mainspring tension or congealed oil inside the frame-mounted inertial firing-pin channel sapping double-action hammer energy.',
    safetyNoteZh:
      '实战补射与靶场排障分流：实战可立即二次双动扣扳机转入下一发；靶场遇疑似迟发弹须稳指靶心静候 30 秒再摆巢退弹。',
    safetyNoteEn:
      'Duty vs. range SOP: in combat, pull DA again to index a live chamber; on the range, hold downrange 30 seconds for hang-fire safety before opening.',
    steps: [
      {
        id: 'rev_ls_hold',
        orderLabel: '01',
        titleZh: '保持枪口稳指安全区防范迟发或二次双动转膛（Hold / Index）',
        titleEn: 'Maintain Muzzle Control & Index Past Misfired Chamber',
        detailZh:
          '严格保持枪口指向安全方向，确认无迟发迹象后拉栓摆出弹巢定位浅坑拒发弹。',
        detailEn:
          'Hold downrange through the hang-fire window, then pull the latch and swing out the cylinder to isolate the shallow-struck round.',
      },
      {
        id: 'rev_ls_eject',
        orderLabel: '02',
        titleZh: '退出浅坑拒发弹并点检框内浮动击针突出量（Check Pin）',
        titleEn: 'Extract Misfired Cartridge & Verify Inertial Firing Pin',
        detailZh:
          '取出底火轻敲弹，检查框内浮动击针尖端无断损且复位簧往复干脆无油泥粘滞。',
        detailEn:
          'Remove the light-struck round and verify clean protrusion and spring return of the frame-mounted firing pin.',
      },
      {
        id: 'rev_ls_restore',
        orderLabel: '03',
        titleZh: '恢复原厂折叠V簧全张力并装入新弹归位（Full V-Spring）',
        titleEn: 'Restore Factory V-Mainspring Tension & Reload',
        detailZh:
          '确保原厂调校 V 型主发条簧处于满额击发势能，补满 6 发弹巢合拢待击。',
        detailEn:
          'Confirm full factory V-mainspring preload, reload a fresh .357 cartridge, and lock the cylinder into battery.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · REBOUND',
    shortZh: '分度闭锁阻断',
    shortEn: 'Index / Rebound Lock',
    titleZh: '未分度到位止转笋与回弹杠杆双重互锁（Out-of-Index & Rebound Safety）',
    titleEn: 'Out-of-Index Cylinder Bolt & Rebound Lever Safety Interception',
    badgeZh: '金库闭锁 · 偏膛防炸',
    badgeEn: 'Bank-Vault Timing · Off-Axis Block',
    symptomZh:
      '弹巢因棘齿污损差约 3° 未完全转正对齐枪管中心线（止转笋尚未弹入弹巢外周止转槽），与此同时回弹安全杠杆刚性托住击锤，阻止击针在偏膛状态敲击底火削飞铅片！',
    symptomEn:
      'Fouled ratchet teeth leave the cylinder ~3° short of index before the cylinder bolt drops into its notch; the rebound lever blocks hammer-to-pin contact to prevent off-axis shaving.',
    rootCauseZh:
      '星形棘轮齿根积存铅碳泥阻滞双阶拨爪（Hand）二级精推行程，导致扣扳机末段弹巢未能实现柯尔特标志性的“落锤前零旷量满锁（Full Lockup Before Hammer Fall）”。',
    rootCauseEn:
      'Lead/carbon buildup in the star ratchet teeth impedes the secondary step of the hand pawl, preventing full cylinder-bolt drop prior to sear release.',
    safetyNoteZh:
      '偏膛击发（Out-of-Time Firing）会使高速弹头撞削枪管坡口侧壁向两侧喷射致命铅铜碎片！发现未锁正严禁继续扣击。',
    safetyNoteEn:
      'Firing out-of-time shaves jacket and lead fragments violently sideways from the forcing cone—never fire a revolver with incomplete bolt lockup.',
    steps: [
      {
        id: 'rev_oob_stop',
        orderLabel: '01',
        titleZh: '松开扳机激活回弹安全杠杆隔离浮动击针（Engage Rebound）',
        titleEn: 'Release Trigger to Seat Rebound Lever Safety Block',
        detailZh:
          '松手让回弹杠杆前臂插入击锤下方安全台肩，物理锁死击锤使其绝对无法触碰击针尾端。',
        detailEn:
          'Allow the rebound lever cam to wedge beneath the hammer safety stud, positively isolating the firing pin.',
      },
      {
        id: 'rev_oob_clean',
        orderLabel: '02',
        titleZh: '摆出弹巢清理六角星形棘齿与止转导槽污垢（Clean Ratchet）',
        titleEn: 'Swing Cylinder & Clean Star Ratchet Teeth & Bolt Notches',
        detailZh:
          '打开弹巢刷净后端六齿分度棘轮槽与弹巢外圆 6 处引导止转凹槽，检查双阶拨爪无崩角。',
        detailEn:
          'Brush clean all six star ratchet teeth and cylinder locking notches so the two-step hand and bolt engage crisply.',
      },
      {
        id: 'rev_oob_vault',
        orderLabel: '03',
        titleZh: '合拢弹巢验证“银行金库级”零旷量同轴满锁（Vault Lockup）',
        titleEn: 'Close Cylinder & Confirm Zero-Play Bank-Vault Lockup',
        detailZh:
          '确认止转笋清脆咔哒落入锁槽、弹膛与枪管坡口 100% 同轴零晃动，恢复柯尔特精密闭锁。',
        detailEn:
          'Confirm audible cylinder-bolt lockup with zero rotational play—chamber aligned dead-coaxial with the 6" bore.',
      },
    ],
  },
};

export const M249_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'SAW · LINK',
    shortZh: '夹壳卡链',
    shortEn: 'Link / Port Pinch',
    titleZh: 'M27 散落链节与空壳抛壳窗横向夹滞（Belt-Link & Brass Pinch）',
    titleEn: 'M27 Disintegrating Link & Spent Brass Port Pinch',
    badgeZh: '抛壳受阻 · 链节干涉',
    badgeEn: 'Port Jam · Belt-Link Pinch',
    symptomZh:
      '高速连发中一枚变形 M27 弹簧钢空链节未及时脱离右下方排链口，阻挡 5.56mm 空弹壳抛飞并被前冲复进的长行程活塞枪机组横向夹死在抛壳窗！',
    symptomEn:
      'A bent M27 spring-steel belt link hangs in the lower-right chute and blocks a spent 5.56mm case, pinching it upright in the ejection port.',
    rootCauseZh:
      '下导气筒积碳过重使活塞后坐行程缩短、排链口沾附泥沙阻碍空链节重力脱落，或卧姿贴地扫射时地面杂物顶堵右侧抛壳/排链通道。',
    rootCauseEn:
      'Carbon buildup in the gas cylinder short-stroking the piston slide, mud obstructing the link chute, or ground debris blocking right-side ejection.',
    safetyNoteZh:
      '开膛机枪排障第一铁律：掀开受弹器顶盖前，必须先把拉机柄向后拉到底挂稳开膛阻铁并推入横闩保险，严防半压复进簧突然前冲推弹击发！',
    safetyNoteEn:
      'Open-bolt SAW rule #1: always pull the charging handle rearward onto the sear and engage the cross-bolt safety BEFORE lifting the top cover!',
    steps: [
      {
        id: 'm249_sp_lock_sear',
        orderLabel: '01',
        titleZh: '后拉右侧拉机柄挂稳开膛阻铁并推回前位上保险（Lock & Safe）',
        titleEn: 'Pull Handle Rearward onto Open-Bolt Sear & Engage Safety',
        detailZh:
          '向后拉满右侧非随动拉机柄使活塞滑块咬合开膛阻铁，将拉机柄推回前锁位并向右按下横闩保险。',
        detailEn:
          'Pull the right charging handle fully rearward until the sear clicks, return the handle forward, and push the cross-bolt safety to SAFE.',
      },
      {
        id: 'm249_sp_clear_link',
        orderLabel: '02',
        titleZh: '扫除抛壳口夹壳与变形 M27 钢链节（Sweep Brass & Link）',
        titleEn: 'Sweep Pinched 5.56mm Brass & Deformed M27 Link Clear',
        detailZh:
          '枪机锁停后方解除夹紧力后，侧倾枪身剥离卡在抛壳窗与排链槽口的空弹壳及变形三环钢链节。',
        detailEn:
          'With the bolt group locked to the rear, tilt the weapon right to shake free the pinched brass casing and bent M27 steel link.',
      },
      {
        id: 'm249_sp_ready',
        orderLabel: '03',
        titleZh: '核对受弹盘首弹定位、合盖解锁恢复开膛待击（Ready SAW）',
        titleEn: 'Verify Belt Alignment on Feed Tray & Resume Open-Bolt Ready',
        detailZh:
          '确认下一发 M855 实弹紧贴受弹器挡弹肩，闭合顶盖推开红环保险，恢复标准开膛待击压制状态。',
        detailEn:
          'Confirm the next M855 round sits against the cartridge stop, latch the feed cover shut, and disengage safety for open-bolt fire.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'SAW · BELT',
    shortZh: '双进卡链',
    shortEn: 'Belt Double-Feed',
    titleZh: '受弹盘双弹顶撞与 M27 弹链错齿咬死（Belt Mis-Index Double-Feed）',
    titleEn: 'Belt Shuttle Mis-Index & Dual-Cartridge Tray Stoppage',
    badgeZh: '重度卡链 · 掀盖清盘',
    badgeEn: 'Severe Stoppage · Clear Feed Tray',
    symptomZh:
      '前一发膨胀弹壳仍滞留在弹膛坡口，顶盖双级梭动拨爪已将下一发 M855 实弹推抵中央受弹槽，枪机前冲推弹脱链瞬间两发弹头尾死死顶楔在节套口！',
    symptomEn:
      'A stuck casing occupies the chamber while the dual-stage shuttle pawls index a fresh M855 round onto the center groove, wedging both rounds nose-to-base.',
    rootCauseZh:
      '抽壳钩弹簧槽积存铜屑导致抽壳滑脱，或 200 发弹链扭曲打结造成拨弹滑板半行程错齿，引发退壳失败与强行剥弹叠加。',
    rootCauseEn:
      'Fouled extractor claw slipping off a hot case rim, or twisted M27 belt drag causing shuttle-pawl mis-indexing onto an occupied chamber.',
    safetyNoteZh:
      '若灼热枪管刚打完长点射（>150 发），滞留膛内的实弹在 10 秒内存在受热自燃（Cook-Off）风险——严禁将脸部凑近掀开的顶盖正上方！',
    safetyNoteEn:
      'Hot-barrel cook-off hazard: keep head and hands clear above the open receiver when clearing a live round from a heat-soaked SAW barrel!',
    steps: [
      {
        id: 'm249_df_lock_safe',
        orderLabel: '01',
        titleZh: '强力后拉拉机柄挂锁开膛阻铁并推入横闩保险（Lock Rear）',
        titleEn: 'Retract Charging Handle onto Open-Bolt Sear & Engage SAFE',
        detailZh:
          '将活塞滑块与双突笋枪机彻底拉回后方待击位卸除前顶推力，推回拉机柄并锁定横闩保险。',
        detailEn:
          'Pull the piston/bolt group fully onto the rear open-bolt sear, return the charging handle forward, and engage the safety.',
      },
      {
        id: 'm249_df_strip_belt',
        orderLabel: '02',
        titleZh: '捏开尾锁掀翻受弹器顶盖并整条提离 M27 弹链（Lift Belt）',
        titleEn: 'Open Hinged Top Cover & Lift M27 Belt Off Feed Tray',
        detailZh:
          '向上掀开压铸顶盖，将 M27 金属弹链连同半脱链的错位次发实弹从受弹器托盘上彻底移开。',
        detailEn:
          'Unlatch and raise the top cover, lifting the M27 belt and partially stripped second round clear of the feed tray.',
      },
      {
        id: 'm249_df_clear_chamber',
        orderLabel: '03',
        titleZh: '退出弹膛滞留弹壳并检查受弹盘与 STANAG 弹匣井净空（Clear）',
        titleEn: 'Extract Stuck Casing & Inspect Chamber / Feed Throat',
        detailZh:
          '清理滞留节套的卡壳，透过敞开受弹器目视确认弹膛、双突笋闭锁槽及左下应急弹匣井全无异物。',
        detailEn:
          'Remove the stuck chamber brass and visually verify that the barrel extension lugs and dual belt/STANAG feed throat are clear.',
      },
      {
        id: 'm249_df_reload_belt',
        orderLabel: '04',
        titleZh: '重铺完好 M27 弹链抵住挡弹壁、拍合顶盖恢复待发（Reload）',
        titleEn: 'Seat Fresh M27 Link Belt on Tray, Latch Cover & Ready',
        detailZh:
          '剔除变形链节后将首弹平放于受弹槽抵实右侧挡弹壁，向下拍紧顶盖锁栓，推开保险待命。',
        detailEn:
          'Place the first intact linked M855 round against the tray stop, snap the top cover shut, and shift safety to FIRE.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'SAW · SEAR/PIN',
    shortZh: '轻敲与失控',
    shortEn: 'Light Strike / Sear',
    titleZh: '导气积碳复进乏力底火轻敲 / 开膛阻铁磨损防疯枪检校',
    titleEn: 'Fouled-Slide Light Strike & Open-Bolt Sear Runaway Inspection',
    badgeZh: '开膛勤务 · 阻铁严检',
    badgeEn: 'Open-Bolt Check · Sear / Pin',
    symptomZh:
      '活塞滑块复进末段受重度积碳阻滞未能走完最后 6.5mm 凸轮行程，联动击针突出量不足仅在底火留下浅痕；同步排查开膛阻铁挂鼻崩钝引发松扳机不停火（Runaway Gun）隐患！',
    symptomEn:
      'Heavy carbon drag slows final slide travel so the mechanically linked firing pin leaves only a shallow primer dimple; also flags worn sear-nose runaway risk.',
    rootCauseZh:
      '连续消耗上千发弹药后碳垢淤塞下导气筒与活塞刮碳环，削弱复进冲量；若开膛阻铁渗碳鼻磨损变圆，后坐不足时滑块甚至会越过阻铁形成失控连发。',
    rootCauseEn:
      'Fouled gas tube and piston rings rob forward slide momentum; if combined with a rounded open-bolt sear catch, short-stroking can induce an unstoppable runaway burst.',
    safetyNoteZh:
      '实战若遇松扳机仍疯狂连发（Runaway SAW）：切勿去拉拉机柄！应稳控枪口指向靶区，一手猛扭拧断 M27 弹链切断供弹即可安全停火！',
    safetyNoteEn:
      'Runaway SAW emergency drill: keep muzzle downrange and twist/break the M27 belt sharply at the feed throat to starve ammunition—never grab a cycling handle!',
    steps: [
      {
        id: 'm249_ls_hold_wait',
        orderLabel: '01',
        titleZh: '稳指安全区静防热膛迟发/自燃，后拉挂稳阻铁（Hold & Lock）',
        titleEn: 'Hold Downrange for Cook-Off Window, Then Lock onto Sear',
        detailZh:
          '保持双脚架稳指靶区度过迟发窗口，随后将拉机柄拉到底确认重型开膛阻铁挂合清脆牢靠并上保险。',
        detailEn:
          'Maintain downrange muzzle control, then pull the charging handle fully rearward to verify crisp open-bolt sear capture and set SAFE.',
      },
      {
        id: 'm249_ls_eject_round',
        orderLabel: '02',
        titleZh: '退出浅坑哑弹并检视滑块联动击针孔与阻铁方槽（Inspect）',
        titleEn: 'Eject Misfired M855 Round & Inspect Linked Pin / Sear Notch',
        detailZh:
          '抛出未爆整弹，检查活塞滑块联动击针横销完好无断损、滑块底部待击方槽棱角分明。',
        detailEn:
          'Clear the shallow-struck M855 cartridge and inspect firing-pin tip protrusion and the hardened sear notch under the piston slide.',
      },
      {
        id: 'm249_ls_resume',
        orderLabel: '03',
        titleZh: '刮除导气箍积碳、重新压链合盖恢复可靠闭锁击发（Restore）',
        titleEn: 'Clean Gas Regulator Carbon, Re-Index Belt & Ready SAW',
        detailZh:
          '清除导气调节塞排气孔碳渣恢复全额复进速度，合拢顶盖进入满势能开膛待击状态。',
        detailEn:
          'Clear carbon from the front gas regulator collar, close the feed cover over a fresh belt round, and verify full open-bolt readiness.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · SLIDE-PIN',
    shortZh: '联动防早发',
    shortEn: 'Slide-Pin OOB',
    titleZh: '滑块联动击针机械防早发闭锁保护（Slide-Linked Firing-Pin OOB Block）',
    titleEn: 'Slide-Linked Firing-Pin Mechanical Out-of-Battery Interception',
    badgeZh: '开膛核心安全 · 刚性防炸',
    badgeEn: 'Open-Bolt Safety · Kaboom Proof',
    symptomZh:
      '变形 M27 链节耳片或药室积碳环使双突笋枪机停在距膛口约 4.5mm 处未能旋入节套；此时与活塞滑块横销硬连接的击针被几何行程死死缩藏在枪机镜面内，绝无未闭锁刺火可能！',
    symptomEn:
      'A bent M27 link tab halts the 2-lug bolt ~4.5mm short of 30° lockup; because the firing pin is pinned to the piston slide tower, it stays physically retracted behind the bolt face!',
    rootCauseZh:
      'FN Minimi / M249 摒弃了早期开膛冲锋枪危险的“枪机镜面固定凸起击针”，改为唯当枪机抵定膛口、滑块独自走完最后 6.5mm 螺旋闭锁行程时击针尖才能伸出镜面。',
    rootCauseEn:
      'Unlike crude fixed-pin open-bolt SMGs, the M249 pins its firing pin to the lower slide carrier: firing-pin protrusion is geometrically impossible until 30° lug rotation finishes.',
    safetyNoteZh:
      '严禁向前猛拍拉机柄强推卡滞实弹入膛！开膛拉机柄仅单向向后钩拉滑块，必须后拉挂锁后掀盖排障。',
    safetyNoteEn:
      'Never hammer forward on a stalled open-bolt round—the non-reciprocating handle only pulls rearward; lock onto the sear and clear via the top cover.',
    steps: [
      {
        id: 'm249_oob_retract',
        orderLabel: '01',
        titleZh: '后拉拉机柄将半闭锁枪机拉回开膛阻铁挂定（Retract to Sear）',
        titleEn: 'Pull Charging Handle Rearward to Lock Group on Open-Bolt Sear',
        detailZh:
          '果断向后拉满右侧拉机柄，抽回半入膛卡滞弹药并将活塞滑块稳稳锁定在开膛阻铁上。',
        detailEn:
          'Pull the right-side charging handle all the way back to extract the stalled round and latch the slide carrier onto the sear.',
      },
      {
        id: 'm249_oob_inspect',
        orderLabel: '02',
        titleZh: '掀盖剔除超规变形弹链节并擦净双突笋节套槽（Clean Lugs）',
        titleEn: 'Open Top Cover, Discard Deformed Link & Inspect Barrel Lugs',
        detailZh:
          '打开顶盖取出变形 M27 链节与受阻实弹，检视快拆枪管节套双闭锁凹槽无碎铜皮残留。',
        detailEn:
          'Raise the top cover to remove the deformed link/cartridge and confirm the quick-change barrel locking recesses are clean.',
      },
      {
        id: 'm249_oob_lockup',
        orderLabel: '03',
        titleZh: '重装标准弹链合盖，验证满势能 30° 顺畅闭锁循环（Full Cycle）',
        titleEn: 'Reload Spec M27 Belt, Close Cover & Confirm 100% Lockup Stroke',
        detailZh:
          '装妥完好弹链闭合顶盖，确认全行程预压复进主簧能无阻推动双突笋旋入 0.0mm 满闭锁。',
        detailEn:
          'Seat an intact M27 belt, close the feed cover, and confirm unimpeded driving-spring stroke into 30° positive lockup.',
      },
    ],
  },
};

export const P08_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'P08 · CHIMNEY',
    shortZh: '垂直烟囱卡壳',
    shortEn: 'Toggle Stovepipe',
    titleZh: '鲁格顶窗垂直“真·烟囱卡壳”（Classic Upward Toggle Stovepipe）',
    titleEn: 'Classic Upward Knee-Toggle "True Chimney" Stovepipe Jam',
    badgeZh: '词源本尊 · 肘节半折夹壳',
    badgeEn: 'Etymology Origin · Top-Port Pinch',
    symptomZh:
      '一枚 9×19mm 空弹壳正以 90° 笔直朝天姿态像铁皮烟囱一样竖立卡死在敞开的叉形节套顶窗中央，后方双连杆肘节被弹壳腰身顶住半折在空中无法拍平闭锁！',
    symptomEn:
      'A spent 9×19mm brass case stands 90° straight up like a stovepipe chimney in the open top receiver window, propping the knee-joint toggle half-buckled.',
    rootCauseZh:
      '这正是英文军械术语“Stovepipe（烟囱卡壳）”的历史起源！鲁格 P08 肘节机构对膛压冲量匹配极为挑剔：使用装药偏弱的低压 9mm 弹或手腕松软（Limp-Wristing）吸收了 6.5mm 短后坐冲量，导致肘节屈曲速度不足以让右侧抛壳挺将弹壳彻底踢出顶窗。',
    rootCauseEn:
      'Historical origin of the term "stovepipe": underloaded 9mm ammo or a limp wrist robs the 6.5mm short-recoil impulse needed to snap the toggle fully up the curved frame ramps.',
    safetyNoteZh:
      '严禁用手掌向下硬拍双圆耳肘节强压黄铜空壳——那会磕伤精密矩形枪机镜面与顶部 GELADEN 抽壳钩爪！',
    safetyNoteEn:
      'Never slap downward on the buckled toggle links over trapped brass—doing so burrs the precision breechblock face and GELADEN extractor lip.',
    steps: [
      {
        id: 'p08_sp_lift_toggle',
        orderLabel: '01',
        titleZh: '双指捏住菱格圆耳向上后方提拉肘节解除夹紧力（Lift Toggle）',
        titleEn: 'Pinch Knurled Toggle Ears & Pull Upward-Rearward',
        detailZh:
          '食指与拇指扣住后肘节两侧 24 线滚花圆盘拉耳向后上方微提，张开矩形枪机镜面释放空壳。',
        detailEn:
          'Grip both diamond-knurled rear toggle ears and draw upward-rearward to retract the breechblock away from the pinched case.',
      },
      {
        id: 'p08_sp_sweep',
        orderLabel: '02',
        titleZh: '侧倾枪身将竖立烟囱空弹壳抖出叉形节套顶窗（Sweep Chimney）',
        titleEn: 'Roll Pistol & Sweep Upright Brass Clear of Top Window',
        detailZh:
          '顺势将鲁格向右微倾，令摆脱夹持的 9×19mm 空弹壳干净利落地从敞开顶窗滚落脱离。',
        detailEn:
          'Cant the pistol briskly rightward so the freed 9×19mm casing drops cleanly clear of the forked barrel extension.',
      },
      {
        id: 'p08_sp_overcenter',
        orderLabel: '03',
        titleZh: '干脆松开双圆耳，由握把 S 连杆拉平肘节过死点闭锁（Snap Lock）',
        titleEn: 'Slingshot Toggle Ears into 1.5° Over-Center Lockup',
        detailZh:
          '满行程松手释放肘节耳，握把内螺旋复进簧经 S 形挂钩迅猛下拽肘节拍入死点下方 1.5° 刚性闭锁。',
        detailEn:
          'Release the toggle ears crisply from full lift so the grip recoil spring and S-link snap the knee joint 1.5° below dead-center.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'P08 · 55° LIP',
    shortZh: '斜匣双进卡死',
    shortEn: '55° Feed-Lip Jam',
    titleZh: '55° 钢板弹匣抱弹唇张开双进弹顶死肘节（55° Magazine Double-Feed）',
    titleEn: '55° Sheet-Steel Feed-Lip Spread & Toggle Double-Feed Jam',
    badgeZh: '高耸屈膝卡滞 · 拔耳退匣',
    badgeEn: 'Buckled Toggle Jam · Rip Mag',
    symptomZh:
      '未抽出的空弹壳滞留 4 英寸枪管膛内，55° 大倾角镀镍弹匣已顶出下一发圆头 9mm 实弹斜抵壳底，将刻有 DWM 花体的前肘节高高顶起约 38° 僵停半空！',
    symptomEn:
      'An unextracted casing remains in the 4" chamber while the 55° magazine feeds a live 9mm round into its base, freezing the DWM toggle ~38° open.',
    rootCauseZh:
      '鲁格冲压镀镍单排弹匣抱弹唇公差极其精密：若磕碰变形外张超过 0.2mm 会导致实弹过早跳脱抱弹口，或膛壁污垢抱死弹壳致使顶置抽壳钩越缘滑脱。',
    rootCauseEn:
      'Luger sheet-steel magazine feed lips are notoriously geometry-sensitive: lip spread >0.2mm releases rounds early, or chamber fouling causes extractor slip.',
    safetyNoteZh:
      '拔除卡滞弹匣时善用一战堑壕双圆耳同心纹底座，手指切勿伸入高张力屈曲肘节下方以防夹伤！',
    safetyNoteEn:
      'Keep fingers clear beneath the spring-loaded buckled toggle knee while pulling the concentric twin-ear magazine floorplate!',
    steps: [
      {
        id: 'p08_df_hold_toggle',
        orderLabel: '01',
        titleZh: '提拉双圆耳后肘节到底卸除矩形枪机前推挤压力（Retract Toggle）',
        titleEn: 'Pull Knurled Toggle Ears Full Rearward to Relieve Pressure',
        detailZh:
          '向后上方拉满双圆耳肘节（约 52° 峰值屈曲），解除枪机推弹筋对弹匣顶弹的死锁摩擦力。',
        detailEn:
          'Draw the rear toggle ears to full 52° upward articulation, relieving breechblock pressure on the wedged magazine round.',
      },
      {
        id: 'p08_df_rip_mag',
        orderLabel: '02',
        titleZh: '按压滚花释放钮并抠住同心圆双耳底座拔出 55° 弹匣（Pull Mag）',
        titleEn: 'Press Catch & Pull Twin-Ear Base to Strip 55° Magazine',
        detailZh:
          '拇指按住握把左侧滚花弹匣卡笋，食指与拇指捏紧底座两侧同心圆防滑耳沿 55° 斜角果断抽出弹匣。',
        detailEn:
          'Depress the knurled magazine catch and grip the twin concentric pull-ears to withdraw the 55° nickel magazine.',
      },
      {
        id: 'p08_df_rack_clear',
        orderLabel: '03',
        titleZh: '连续提放肘节钩出膛内滞留空壳并抖落散弹（Clear Breech）',
        titleEn: 'Cycle Toggle Train Briskly to Eject Stuck Brass & Loose Round',
        detailZh:
          '前后拉放双圆耳驱动顶置 GELADEN 抽壳钩与右侧片簧抛壳挺清出残壳，检视叉形节套滑道净空。',
        detailEn:
          'Cycle the toggle assembly so the top GELADEN extractor and right leaf ejector clear the chamber and receiver channel.',
      },
      {
        id: 'p08_df_reload',
        orderLabel: '04',
        titleZh: '换入唇口完好的 8 发备用弹匣并提耳释放推弹闭锁（Reload & Snap）',
        titleEn: 'Insert Verified 8-Rd Nickel Magazine & Snap Toggle Home',
        detailZh:
          '推入抱弹唇完好的标准弹匣咔哒锁定，提拉双圆耳干脆松手推新弹入膛，GELADEN 指示器清晰翘起。',
        detailEn:
          'Seat a gauge-checked 8-round magazine, pull and release the toggle ears into full battery, and confirm the raised GELADEN tab.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'P08 · STRIKER',
    shortZh: '三槽击针阻滞',
    shortEn: 'Striker Drag',
    titleZh: '空心三槽击针腔凝脂阻滞轻敲拒发（Fluted Striker Light Strike）',
    titleEn: 'Congealed Fluted-Striker Channel Drag & Shallow Primer Strike',
    badgeZh: '平移击针 · 刺刀尾塞清腔',
    badgeEn: 'Internal Striker · Shallow Dimple',
    symptomZh:
      '扣动麦秆黄月牙扳机经 L 形换向杠杆释放水平阻铁条，枪机内仅传出沉闷轻响，膛顶 GELADEN 抽壳钩依然翘起，底火仅留浅印未能激发标准高压 9×19mm 军用弹。',
    symptomEn:
      'Pulling the crescent trigger trips the L-bellcrank and horizontal sear bar with a muted click; GELADEN stays raised over an unfired, shallow-dimpled primer.',
    rootCauseZh:
      '严寒战壕中枪机空心腔体内的防锈黄油凝固粘稠，或长期射击残留的底火碎铜屑塞入三道纵向泄气槽，严重损耗螺旋击针主簧刺火末速。',
    rootCauseEn:
      'Congealed grease in cold weather or brass primer fouling inside the three longitudinal gas-relief flutes damps helical striker impact velocity.',
    safetyNoteZh:
      '遇底火轻敲哑弹须稳指靶区防范迟发；鲁格向上提拉肘节抛弹时未爆实弹会向正上方跃出，切勿低头俯视顶窗！',
    safetyNoteEn:
      'Hold downrange for hang-fire safety, and keep face clear above the receiver—lifting the toggle ejects the live 9mm cartridge upward!',
    steps: [
      {
        id: 'p08_ls_hold',
        orderLabel: '01',
        titleZh: '稳控 55° 握把指向安全区并触检顶置 GELADEN 指示（Hold Safe）',
        titleEn: 'Maintain Downrange Control & Confirm GELADEN Indicator',
        detailZh:
          '保持自然指向静候度过迟发风险期，拇指轻触或目视确认顶部抽壳钩仍处于有弹翘起态。',
        detailEn:
          'Hold steady on target through the hang-fire interval while confirming the loaded-chamber extractor remains raised.',
      },
      {
        id: 'p08_ls_eject',
        orderLabel: '02',
        titleZh: '向上迅猛提拉双圆耳到底，将浅坑哑弹自顶窗抛出（Snap Up）',
        titleEn: 'Snap Toggle Ears Full Rearward to Eject Misfired 9mm Round',
        detailZh:
          '干脆提满双圆耳肘节，借前肘节下凸趾重新压倒三槽击针挂上水平阻铁条，同时抛出拒发整弹。',
        detailEn:
          'Pull the toggle ears briskly to full lift, ejecting the misfired cartridge upward while the front-toggle toe re-cocks the striker.',
      },
      {
        id: 'p08_ls_chamber',
        orderLabel: '03',
        titleZh: '松手拍平肘节推次发入膛，标记勤务旋开刺刀尾塞洗腔（Reset）',
        titleEn: 'Release Toggle Over-Center & Flag Bayonet Striker Cleaning',
        detailZh:
          '释放肘节推新弹入膛恢复射击；射击后须逆旋 90° 拆出刺刀尾塞彻底擦净三槽击针腔油泥。',
        detailEn:
          'Chamber a fresh 9×19mm round into over-center lockup and schedule post-fire bayonet guide removal to degrease the striker bore.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · KNEE',
    shortZh: '肘节断连保护',
    shortEn: 'Knee / Sear OOB',
    titleZh: '肘节未过死点与 L 形换向杠杆天然断路保护（Over-Center & Bellcrank OOB）',
    titleEn: 'Incomplete Over-Center Toggle & Sideplate Bellcrank OOB Block',
    badgeZh: '乔治·鲁格双保险 · 防炸膛',
    badgeEn: 'Luger Dual Interlock · OOB Safe',
    symptomZh:
      '超规鼓胀弹壳使矩形枪机差约 3.5mm 未抵实膛口，中央膝关节仍微拱于枪管轴线上方约 6° 未能落入死点下方锁槽；此时侧盖板 L 形换向杠杆与上机匣水平阻铁柱塞完全错位脱开，扣穿扳机亦无法释放击针！',
    symptomEn:
      'A bulged case halts the breechblock ~3.5mm open with the toggle knee ~6° above bore centerline; the displaced sear-bar plunger misses the sideplate L-bellcrank, disconnecting the trigger!',
    rootCauseZh:
      '随手缓放双圆耳（Riding the Toggle）损失了握把 S 连杆的下拍冲击力，或药室积碳卡滞弹壳；鲁格侧向换向火控的精妙之处在于上机匣只要后退逾 2mm，阻铁柱塞便物理脱离侧盖板杠杆实现绝对防早发。',
    rootCauseEn:
      'Riding the toggle ears forward by hand or a fouled chamber throat prevents below-center lockup; >2mm extension setback physically uncouples the sear plunger from the frame bellcrank.',
    safetyNoteZh:
      '严禁在肘节高拱未锁平状态下强砸后肘节！未落入过中心死点（-1.5°）击发会导致肘节瞬间暴烈上弹崩裂铰销。',
    safetyNoteEn:
      'Never force a stalled toggle over an out-of-spec cartridge—firing above dead-center would slam the toggle upward under peak 235 MPa chamber pressure.',
    steps: [
      {
        id: 'p08_oob_retract',
        orderLabel: '01',
        titleZh: '松开月牙扳机并提拉双圆耳抽出半入膛超规弹（Retract Toggle）',
        titleEn: 'Release Crescent Trigger & Pull Toggle Ears to Extract Round',
        detailZh:
          '松开扳机让 L 形换向杠杆归位，向后上方拉满双圆耳将卡滞鼓胀实弹从顶窗安全抛出。',
        detailEn:
          'Release trigger tension so the sideplate bellcrank resets, then pull the toggle ears full rear to eject the out-of-spec cartridge.',
      },
      {
        id: 'p08_oob_inspect',
        orderLabel: '02',
        titleZh: '检视 1917 节套导轨、坡膛与肘节死点支承面净空（Check Rails）',
        titleEn: 'Inspect 1917 Extension Rails, Chamber Throat & Toggle Stops',
        detailZh:
          '透过敞开顶窗确认枪管坡口无铜屑碳环，叉形节套过中心止铁平面干净无异物垫起。',
        detailEn:
          'Confirm the 9×19mm chamber mouth, forked extension rails, and below-center toggle stop pads are free of brass shavings or grit.',
      },
      {
        id: 'p08_oob_slingshot',
        orderLabel: '03',
        titleZh: '高提双圆耳干脆弹放，确认肘节拍平过死点对齐换向杆（Lockup）',
        titleEn: 'Slingshot Toggle Ears into Full -1.5° Over-Center Battery',
        detailZh:
          '拉满后凌厉松手，使双连杆肘节清脆拍落至枪管轴线下方 1.5°，水平阻铁柱塞重新精准对正 L 形杠杆。',
        detailEn:
          'Release cleanly from full lift so the toggle snaps 1.5° below centerline, realigning the horizontal sear plunger with the L-bellcrank.',
      },
    ],
  },
};

export const VECTOR_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'VEC · PORT',
    shortZh: '大壳横夹',
    shortEn: '.45 Port Pinch',
    titleZh: '1,200 RPM 极速循环 .45 粗胖空壳抛壳窗夹滞（High-Cyclic .45 Stovepipe）',
    titleEn: '1,200 RPM High-Cyclic .45 ACP Brass Ejection-Port Pinch',
    badgeZh: '50ms 极速窗 · 右倾清壳',
    badgeEn: '50ms Cycle · Sweep .45 Brass',
    symptomZh:
      '在每分钟 1,200 发（单发循环仅 50 毫秒！）暴风射速下，一枚直径 12mm 的粗短 .45 ACP 黄铜空壳擦碰抛壳窗前缘反弹，被沿 +65° 斜槽迅猛上扑复进的凸轮耳枪机横向夹死！',
    symptomEn:
      'During 50ms/round (1,200 RPM) cyclic fire, a wide 12mm .45 ACP spent case rebounds off the port rim and gets pinched sideways by the surging cam-trunnion bolt.',
    rootCauseZh:
      '使用装药偏弱的亚音速靶场练习弹导致 Super V 钨钢配重滑块未能触及 -65° 导杆底缓冲垫即提前回弹，或贴近室内掩体右侧墙壁射击使抛飞弹壳反弹回窗内。',
    rootCauseEn:
      'Underpowered target loads short-stroking the -65° Super V tungsten slider above its bottom buffer, or CQB wall bounce deflecting fat .45 brass back into the port.',
    safetyNoteZh:
      '操作左侧黄铜铰链折叠拉机柄时保持食指离开高置水平扳机，并优先推上握把上方的双侧 S/F 拇指保险！',
    safetyNoteEn:
      'Keep finger off the high-mounted horizontal trigger and engage the lower S/F thumb safety while racking the left folding handle!',
    steps: [
      {
        id: 'vec_sp_rack',
        orderLabel: '01',
        titleZh: '扳开左侧黄铜铰链折叠拉机柄向后拉驱滑块下潜（Rack Handle）',
        titleEn: 'Unfold Left Brass-Pivot Charging Handle & Pull Rearward',
        detailZh:
          '向外翻开左侧非随动拉机柄向后拉动，迫使枪机后退并压下 Super V 钨钢滑块松开夹壳口。',
        detailEn:
          'Flip out the left non-reciprocating charging handle and pull rearward, driving the bolt back and the Super V slider down the chute.',
      },
      {
        id: 'vec_sp_sweep',
        orderLabel: '02',
        titleZh: '枪身右倾 45° 让夹扁 .45 ACP 空铜壳脱离抛壳窗（Roll & Clear）',
        titleEn: 'Roll Vector 45° Right to Drop Pinched .45 ACP Brass',
        detailZh:
          '向右翻转枪身利用重力抖落粗短空弹壳，确认右侧宽幅抛壳口与双凸轮耳滑道畅通无阻。',
        detailEn:
          'Cant the submachine gun rightward so the heavy .45 ACP spent casing falls free of the ejection port.',
      },
      {
        id: 'vec_sp_release',
        orderLabel: '03',
        titleZh: '干脆松开折叠拉机柄由 -65° 复进簧顶升滑块推弹闭锁（Slingshot）',
        titleEn: 'Slingshot Handle Home to Drive Super V Slider into Battery',
        detailZh:
          '满行程松手（切勿随手缓送！），让斜置复进簧猛推钨钢滑块上行经凸轮槽闭锁次发 .45 实弹。',
        detailEn:
          'Release the folding handle cleanly at full stroke—never ride it—so the -65° spring drives the slider up into positive lockup.',
      },
    ],
  },

  double_feed: {
    kind: 'double_feed',
    code: 'VEC · RAMP',
    shortZh: '大倾角双进',
    shortEn: '.45 Ramp Wedge',
    titleZh: '66° MagEx2 加长匣 230gr 圆头弹坡道双进顶死（.45 Feed-Ramp Double-Feed）',
    titleEn: '66° MagEx2 Extended Tower & 230gr .45 Feed-Ramp Double-Feed',
    badgeZh: '重弹双楔 · 卸匣排障',
    badgeEn: 'Type-3 Jam · Strip MagEx2',
    symptomZh:
      '膛内残壳未退，下方 66° 前倾 25 发 MagEx2 加长弹匣强力簧已将一枚粗壮的 230 格令 .45 ACP 圆头实弹推上低轴线节套坡膛，两枚 12mm 大口径铜弹上下楔死，Super V 滑块卡在导槽半途！',
    symptomEn:
      'An unextracted .45 case blocks the low-bore chamber while the 25-round MagEx2 spring drives a fat 230gr FMJ round up the feed ramp, wedging the Super V slider mid-chute.',
    rootCauseZh:
      '满装 25 发重逾半公斤的加长弹匣在高射速震动下若未拍实到位、或抽壳钩沟槽积聚铅铜垢滑脱弹底缘，极易在紧凑供弹喉内造成大直径弹头顶撞。',
    rootCauseEn:
      'Extractor rim slip on a fouled chamber combined with high upward follower force from the 25-round Glock-21 pattern MagEx2 column.',
    safetyNoteZh:
      '严禁敲击拉机柄硬挤两枚 .45 实弹——后发圆头铜被甲若猛顶前发大号手枪底火，存在机匣内殉爆风险！',
    safetyNoteEn:
      'Never force the bolt forward onto double-fed .45 cartridges—driving a bullet nose into a Large Pistol primer risks out-of-battery detonation!',
    steps: [
      {
        id: 'vec_df_retract',
        orderLabel: '01',
        titleZh: '后拉左侧折叠拉机柄压低 Super V 滑块解除楔紧力（Lock/Hold Rear）',
        titleEn: 'Pull Left Folding Charging Handle Rearward to Relieve Wedge',
        detailZh:
          '向后拉满拉机柄使双凸轮耳枪机退离弹匣抱弹口（可配合左侧挂机钮锁停枪机），卸除顶压负荷。',
        detailEn:
          'Draw the left charging handle fully rearward so the cam-trunnion bolt clears the magazine feed lips and relieves ramp pressure.',
      },
      {
        id: 'vec_df_strip_mag',
        orderLabel: '02',
        titleZh: '按下前护手左侧释放钮果断拔除 25 发 MagEx2 加长匣（Strip MagEx2）',
        titleEn: 'Depress Left Mag Catch & Strip 25-Rd MagEx2 Magazine',
        detailZh:
          '握住沙色防滑扩容护套沿 66° 导槽向下强力抽出加长弹匣，腾空并联弹匣井排弹通道。',
        detailEn:
          'Press the forward left-side magazine release and pull the extended 25-round MagEx2 magazine downward out of the 66° well.',
      },
      {
        id: 'vec_df_rack_twice',
        orderLabel: '03',
        titleZh: '反复全行程拉放拉机柄清空坡膛散弹与滞留残壳（Rack Clear）',
        titleEn: 'Cycle Super V Action Briskly to Clear Loose .45 & Stuck Case',
        detailZh:
          '连续干脆拉放左侧拉机柄，让错位实弹自弹匣井坠落并由重型抽壳钩将膛内残壳彻底抛出右窗。',
        detailEn:
          'Rack the folding charging handle sharply so the loose .45 round drops free and the claw extractor flings the stuck brass clear.',
      },
      {
        id: 'vec_df_reload',
        orderLabel: '04',
        titleZh: '拍实新 25 发 MagEx2 弹匣并全势能释放拉机柄闭锁（Reload & Lock）',
        titleEn: 'Seat Fresh MagEx2 Magazine & Slingshot Charging Handle Home',
        detailZh:
          '有力拍击防摔底盖确认弹匣卡笋咬合，拉满左侧拉机柄凌厉松手推 230gr 新弹入低轴线弹膛。',
        detailEn:
          'Slap the MagEx2 bumper baseplate to verify lockup, then pull and release the charging handle from full stroke to chamber a fresh .45 round.',
      },
    ],
  },

  light_strike: {
    kind: 'light_strike',
    code: 'VEC · HAMMER',
    shortZh: '倒装锤轻敲',
    shortEn: 'Top-Hammer Strike',
    titleZh: '顶置倒装击锤 / 低轴线浮动击针积碳轻敲拒发（Inverted-Hammer Light Strike）',
    titleEn: 'Inverted Top-Hammer & Fouled Inertial Firing-Pin Light Strike',
    badgeZh: '上下跨层击发 · 浅坑排障',
    badgeEn: 'Cross-Deck FCG · Tap-Rack',
    symptomZh:
      '高置水平扳机清脆释放顶层倒装击锤向下挥摆敲击，但下方低轴线枪机内的 .45 ACP 实弹未响，退弹可见大号手枪底火仅有一枚极浅中心凹点。',
    symptomEn:
      'The horizontal trigger crisply drops the inverted top-deck hammer downward, yet the chambered .45 ACP fails to ignite with only a faint primer dimple.',
    rootCauseZh:
      '加装偏心消音器以 1,200 RPM 倾泻亚音速 .45 弹后，倒灌碳油泥淤积在阶梯式浮动击针与防惯性回位簧孔道内，或上下机匣结合横销未插紧造成跨层敲击偏心。',
    rootCauseEn:
      'Heavy blowback carbon fouling inside the stepped inertial firing-pin channel after high-cyclic/suppressed fire, or hard NATO-spec primer cups.',
    safetyNoteZh:
      '拉动左侧拉机柄退弹时手掌切勿遮挡右侧抛壳窗，以防大直径未爆整弹卡手或磕碰底火！',
    safetyNoteEn:
      'Keep support hand on the forward hand-stop and clear of the right ejection port while racking out a live 230gr .45 cartridge!',
    steps: [
      {
        id: 'vec_ls_tap',
        orderLabel: '01',
        titleZh: '稳指靶心并向上拍实 MagEx2 防摔缓冲弹匣底板（Tap Bumper）',
        titleEn: 'Keep Low-Bore Muzzle Safe & Tap MagEx2 Bumper Baseplate',
        detailZh:
          '保持枪口指向安全方向，掌根有力向上拍击加长弹匣底盖确保 25 发重弹柱完全顶抵抱弹口。',
        detailEn:
          'Maintain downrange muzzle discipline and strike the ribbed MagEx2 baseplate upward to confirm positive magazine lockup.',
      },
      {
        id: 'vec_ls_rack',
        orderLabel: '02',
        titleZh: '迅猛拉满左侧折叠拉机柄抛出浅坑哑弹并压回顶置击锤（Rack）',
        titleEn: 'Rack Left Folding Handle Full Stroke to Eject Misfired .45',
        detailZh:
          '全行程拉动拉机柄：枪机后退抛出未爆 .45 整弹，同时枪机顶背自动向上把倒装击锤重新压回上机匣阻铁待击！',
        detailEn:
          'Pull the left charging handle briskly through full travel, ejecting the misfired .45 round while the bolt top re-cocks the inverted hammer.',
      },
      {
        id: 'vec_ls_assess',
        orderLabel: '03',
        titleZh: '松手复进闭锁恢复射击，标记四销快拆清洗浮动击针（Assess）',
        titleEn: 'Release into Battery & Flag 4-Pin Strip for Firing-Pin Cleaning',
        detailZh:
          '干脆松手推新弹入膛；勤务后徒手拔出四枚快拆横销，抽出枪机彻底清洗阶梯击针回位簧积碳。',
        detailEn:
          'Feed a fresh .45 round into full battery; schedule tool-free 4-pin takedown to clean carbon sludge from the firing-pin spring bore.',
      },
    ],
  },

  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · SUPER-V',
    shortZh: '滑块遮针保护',
    shortEn: 'Super V OOB',
    titleZh: 'Super V 滑块顶冠遮蔽击针不到位防炸膛保护（Super V Slider OOB Shield）',
    titleEn: 'Super V Counterweight Slider Crown Out-of-Battery Hammer Block',
    badgeZh: '轴外延迟核心保护 · 防炸膛',
    badgeEn: 'Off-Axis Safety · Breech Shield',
    symptomZh:
      '复进末段 Super V 钨钢滑块停在距 -65° 导槽死点尚差约 6mm 处，双侧凸轮耳尚未把 .45 枪机推抵节套端面（留有 ~3.8mm 露铜间隙）；此时钨钢滑块顶冠正好挡在浮动击针尾钮正上方，物理拦截顶置倒装击锤的下摆敲击！',
    symptomEn:
      'The Super V tungsten slider stalls ~6mm below top dead center leaving a ~3.8mm breech gap; the unseated slider crown physically shrouds the firing-pin tail from the downward-swinging top hammer!',
    rootCauseZh:
      '射手拉动左侧折叠拉机柄后未直接松手而是缓慢送回（Riding the Handle），损失了 -65° 斜置复进簧克服上部变角度凸轮槽陡坡摩擦所需的上冲势能。',
    rootCauseEn:
      'Riding the folding charging handle forward robs the -65° recoil spring of the momentum needed to cam the lateral bolt trunnions over the steep upper locking ramp.',
    safetyNoteZh:
      '半自由延迟枪机绝不允许未贴合节套即引燃 .45 ACP（峰值膛压 145 MPa）：由于无前助推器，发现未闭锁必须全行程重拉干脆释放！',
    safetyNoteEn:
      'Delayed-blowback .45 ACP (145 MPa peak) requires 100% bolt-face seating—Vector has no forward assist; always re-rack and slingshot cleanly!',
    steps: [
      {
        id: 'vec_oob_retract',
        orderLabel: '01',
        titleZh: '松开水平扳机并拉满左侧折叠拉机柄退除半入膛实弹（Retract）',
        titleEn: 'Release Horizontal Trigger & Retract Handle to Clear Round',
        detailZh:
          '停止扣压扳机，向后拉到底退出受阻 .45 ACP 实弹并让倒装击锤稳稳挂回顶层阻铁。',
        detailEn:
          'Release the trigger shoe and pull the left folding charging handle full rear to extract and eject the unseated .45 cartridge.',
      },
      {
        id: 'vec_oob_inspect',
        orderLabel: '02',
        titleZh: '检视 -65° 钨钢滑块变角度凸轮槽与低轴线坡膛清洁润滑（Check Cam）',
        titleEn: 'Inspect Super V Cam Slots, Bolt Trunnions & Low-Bore Ramp',
        detailZh:
          '透过抛壳窗检查枪机两侧圆柱凸轮耳与滑块斜槽油膜润泽、无干涸碳渣阻滞最后上顶闭锁。',
        detailEn:
          'Verify that the lateral bolt trunnions, polished Super V cam slots, and chamber throat are lubricated and free of brass debris.',
      },
      {
        id: 'vec_oob_slingshot',
        orderLabel: '03',
        titleZh: '拉满折叠拉机柄零迟疑松手，确认钨钢滑块登顶满闭锁（Full Lock）',
        titleEn: 'Slingshot Handle from Full Stroke into 0.0mm Super V Lockup',
        detailZh:
          '后拉到底瞬间松指弹放，令滑块登顶把枪机严密压实节套（0.0mm 间隙），让出击针尾钮解除保护。',
        detailEn:
          'Release crisply from full retraction so the tungsten slider reaches top dead center (0.0mm breech gap), uncovering the firing pin.',
      },
    ],
  },
};

const G11_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'MALF-G11-01',
    shortZh: '药块残渣卡阻',
    shortEn: 'HITP Jam',
    titleZh: '无壳药块不完全燃尽残渣卡滞 90° 旋转弹膛（Caseless Residue Hang-Up）',
    titleEn: 'Incomplete HITP Block Combustion Fouling 90-Degree Rotary Breech',
    badgeZh: '无壳弹独有故障 · 零铜壳',
    badgeEn: 'Caseless Exclusive · Zero Brass',
    symptomZh:
      '潮湿变质的 4.73×33mm DM11 模压药块未能 100% 汽化，残余焦化硬块卡在 90° 旋转弹膛端面与浮置内机匣密封环之间，导致旋转弹膛滞停在半转位。',
    symptomEn:
      'A degraded 4.73x33mm DM11 propellant block leaves charred nitramine debris wedged between the 90-degree rotary cylinder and floating receiver seal, halting rotation mid-cycle.',
    rootCauseZh:
      '无壳弹无黄铜弹壳带走 35% 射击废热与碳渣；若药块受潮碎裂或连射积碳过厚，旋转弹膛端面气密槽阻力剧增，短行程导气活塞无法将其转回 0° 水平位。',
    rootCauseEn:
      'Without an ejected brass case to carry away heat and fouling, chipped propellant granules jam the rotary cylinder seal gap, stalling the clockwork gear return.',
    safetyNoteZh:
      'G11 彻底取消侧面抛壳窗：切勿敲击方盒外壳，必须使用左侧折叠上弦旋柄逆转旋膛，通过机身底面紧急清理口排出哑弹与碎块！',
    safetyNoteEn:
      'G11 has no side ejection port—never strike the polymer casing; crank the left winding knob to rotate and expel the dud downward through the bottom emergency port!',
    steps: [
      {
        id: 'g11_sp_crank',
        orderLabel: '01',
        titleZh: '顺时针旋动左侧折叠上弦旋柄手动驱动钟表齿轮旋转 90°（Crank）',
        titleEn: 'Crank Left Folding Winding Knob to Index Clockwork Gears 90 Degrees',
        detailZh:
          '展开左侧圆形折叠旋柄并旋转一周，借齿轮增力矩强行剪断卡滞碳渣，将旋转弹膛转至垂直清理位。',
        detailEn:
          'Unfold and crank the left winding knob to shear carbon residue via gear torque and align the rotary chamber vertically.',
      },
      {
        id: 'g11_sp_purge',
        orderLabel: '02',
        titleZh: '顶推竖直推弹杆从底面紧急清膛口顶落残留 DM11 药块（Purge）',
        titleEn: 'Drive Vertical Rammer to Expel Fouled DM11 Block Out Bottom Chute',
        detailZh:
          '竖直进弹杆向下贯穿旋转圆柱弹膛，将未燃尽的方形无壳哑弹直接从机身底面防尘盖顶出枪外。',
        detailEn:
          'The vertical loading rammer punches straight through the vertical breech bore, dropping the dud caseless block out the bottom floor port.',
      },
      {
        id: 'g11_sp_return',
        orderLabel: '03',
        titleZh: '旋柄归零将新无壳弹转回水平闭锁位恢复 2,100 RPM 待发（Ready）',
        titleEn: 'Return Rotary Breech to 0-Degree Horizontal Lockup for Ready State',
        detailZh:
          '确认 90° 旋转弹膛顺滑归回 0° 水平轴线且前后密封环零阻滞，随即恢复三连发高速待击状态。',
        detailEn:
          'Confirm the rotary breech rotates cleanly back to 0-degree bore alignment with fresh DM11 chambered for 2,100 RPM fire.',
      },
    ],
  },
  double_feed: {
    kind: 'double_feed',
    code: 'MALF-G11-02',
    shortZh: '顶置双弹挤压',
    shortEn: 'Top-Feed Jam',
    titleZh: '置顶 45 发条形无壳弹匣推弹错位双块挤压（Overhead Rammer Double-Feed）',
    titleEn: 'Overhead 45-Rd Stick Magazine Misaligned Caseless Block Jam',
    badgeZh: '垂直推弹错位 · 需卸顶匣',
    badgeEn: 'Vertical Feed Jam · Pull Top Mag',
    symptomZh:
      '旋转弹膛内仍残留未完全顶落的上一发 DM11 药块，同时置顶长条弹匣弹簧已将下一发方形无壳弹推至竖直推弹口正上方，造成两块药柱垂直顶撞卡死。',
    symptomEn:
      'An unexpelled DM11 block remains inside the vertical breech while the overhead magazine spring pushes the next square caseless round under the rammer, locking both vertically.',
    rootCauseZh:
      '在 2,100 RPM 极速三连发期间，置顶弹匣内 45 发长柱弹簧受浮置机匣剧烈后坐惯性共振影响，局部供弹节拍超前导致竖直推弹杆压偏药块棱角。',
    rootCauseEn:
      'During 2,100 RPM burst recoil, spring surge in the 45-round overhead tube advances a round slightly off-pitch, causing the vertical rammer to bind on the square block edge.',
    safetyNoteZh:
      '切忌强压推弹杆压碎硝胺药块：必须先沿枪管正上方前抽卸出 45 发条形弹匣，彻底切断向下供弹压力！',
    safetyNoteEn:
      'Never force the rammer onto a jammed nitramine block—slide the 45-round overhead stick magazine forward first to relieve feed tension!',
    steps: [
      {
        id: 'g11_df_lock',
        orderLabel: '01',
        titleZh: '转动左侧上弦旋柄将旋转弹膛停在 90° 垂直检修位（Index）',
        titleEn: 'Hold Rotary Breech at 90-Degree Vertical Service Index',
        detailZh:
          '点击旋转弹膛或上弦旋柄稳住钟表传动系，避免卸匣瞬间齿轮回弹剪碎无壳药块。',
        detailEn:
          'Steady the rotary breech and winding knob at 90 degrees so gear spring-back does not crush the caseless propellant block.',
      },
      {
        id: 'g11_df_strip',
        orderLabel: '02',
        titleZh: '沿枪管正上方前向抽出 45 发透明条形无壳弹匣（Pull Top Mag）',
        titleEn: 'Slide Overhead 45-Rd Caseless Magazine Forward & Clear',
        detailZh:
          '向前滑脱置顶弹匣总成，解除长条复进托弹簧对旋转弹膛顶口的持续后推压迫。',
        detailEn:
          'Pull the overhead stick magazine forward off the barrel rail to remove horizontal follower pressure on the breech throat.',
      },
      {
        id: 'g11_df_clear',
        orderLabel: '03',
        titleZh: '连摇左侧旋柄两周，经底面排弹盖清空残余无壳弹块（Purge）',
        titleEn: 'Cycle Winding Knob Twice to Drop Both Jammed Blocks Out Bottom',
        detailZh:
          '连续旋动钟表机构推动竖直推弹杆，确认卡阻的两枚无壳弹全部从底部紧急清理口掉出。',
        detailEn:
          'Crank the clockwork twice so the vertical rammer pushes both jammed caseless blocks cleanly out the lower dump hatch.',
      },
      {
        id: 'g11_df_reload',
        orderLabel: '04',
        titleZh: '重插 45 发 DM11 无壳弹匣并旋柄上膛首弹（Reload & Wind）',
        titleEn: 'Reseat 45-Rd DM11 Stick Magazine & Wind First Round into Breech',
        detailZh:
          '后推锁紧置顶无壳弹匣，旋转上弦旋柄一周将首枚 DM11 垂直推入并转平 90° 完成闭锁。',
        detailEn:
          'Seat the overhead caseless magazine until latched and turn the winding knob one full revolution to chamber horizontally.',
      },
    ],
  },
  light_strike: {
    kind: 'light_strike',
    code: 'MALF-G11-03',
    shortZh: '可燃底火拒发',
    shortEn: 'Primer Dud',
    titleZh: '同轴击针浅击 DM11 可燃底火片拒发（Caseless Primer Light Strike）',
    titleEn: 'Coaxial Firing-Pin Light Strike on Combustible DM11 Primer Wafer',
    badgeZh: '防迟发自燃 · 机械底排',
    badgeEn: 'Cook-Off Guard · Bottom Dump',
    symptomZh:
      '扣动扳机后听见清脆击锤释放声，同轴击针撞击 DM11 尾部可燃底火片却未引燃硝胺药块；无壳弹完全密封于旋转弹膛内无法从外部目视。',
    symptomEn:
      'The trigger releases crisply and the coaxial firing pin indents the combustible DM11 primer wafer without ignition, leaving a live caseless block sealed inside the rotary cylinder.',
    rootCauseZh:
      '旋转弹膛尾端击针孔积聚硝胺凝结碳垢阻滞击针行程，或可燃底火片受潮导致撞击点火阈值升高。',
    rootCauseEn:
      'Nitramine fouling inside the rear rotary-breech firing-pin channel damps strike energy, or moisture raises primer ignition threshold.',
    safetyNoteZh:
      '保持枪口指向安全区静候 10 秒防迟发（Hangfire）与高温弹膛自燃，随后转动左侧旋柄将哑弹推落底部排出！',
    safetyNoteEn:
      'Maintain safe muzzle discipline for 10 seconds against hangfire/cook-off, then crank the left winding knob to eject the dud downward!',
    steps: [
      {
        id: 'g11_ls_wait',
        orderLabel: '01',
        titleZh: '保持安全指向静候防迟发，确认保险与弹匣就位（Safe Wait）',
        titleEn: 'Hold Safe Muzzle Against Hangfire & Verify Overhead Mag Latch',
        detailZh:
          '等待延迟点火窗口过去并轻按置顶 45 发无壳弹匣，确认下一发待供药块紧贴进弹口。',
        detailEn:
          'Wait out the hangfire window and confirm the overhead 45-round magazine is seated flush over the breech.',
      },
      {
        id: 'g11_ls_crank',
        orderLabel: '02',
        titleZh: '完整旋动左侧折叠上弦旋柄一周：以新弹顶落底部哑弹（Wind & Dump）',
        titleEn: 'Crank Left Winding Knob Full Turn to Push Dud Out Bottom Port',
        detailZh:
          'G11 独创“新弹顶哑弹”排障逻辑：旋膛转垂 90° 后，竖直推弹杆压入新弹的同时把哑弹直接从底孔顶出！',
        detailEn:
          'Unique G11 clearing cycle: rotating vertical allows the incoming DM11 round to push the dud directly out the bottom port!',
      },
      {
        id: 'g11_ls_ready',
        orderLabel: '03',
        titleZh: '旋回水平 0° 轴线完成击发准备，战后拆洗旋转弹膛击针孔（Assess）',
        titleEn: 'Lock New Round Horizontally & Flag Breech Firing-Pin Channel Clean',
        detailZh:
          '旋转弹膛归位 0° 后恢复待发；勤务后抽出圆柱弹膛清洗同轴击针通道积碳。',
        detailEn:
          'Return the rotary cylinder to 0 degrees for immediate fire and schedule breech pin-channel cleaning afterward.',
      },
    ],
  },
  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · G11-ROT',
    shortZh: '旋膛未平阻断',
    shortEn: 'Rotary OOB',
    titleZh: '90° 旋转弹膛未完全回正 0° 轴线击针机械闭锁保护（Rotary Alignment Interlock）',
    titleEn: 'Rotary Cylinder Off-Axis Mechanical Firing-Pin Safety Interlock',
    badgeZh: '旋转弹膛防泄压保护',
    badgeEn: 'Rotary Seal Interlock',
    symptomZh:
      '旋转圆柱弹膛滞留在约 14° 偏角，尚未与 540mm 浮置枪管完全同轴密封；此时内机匣安全凸轮强制顶死同轴击针，防止 360 MPa 高压火药燃气从斜缝喷毁钟表齿轮箱！',
    symptomEn:
      'The cylindrical breech pauses ~14 degrees shy of horizontal bore alignment; an internal cam interlock mechanically blocks the coaxial firing pin so 360 MPa gas cannot vent into the clockwork!',
    rootCauseZh:
      '手动上弦旋柄未转到完整止点或浮置导轨干涩，导致齿条拉杆差最后 3mm 未把旋转弹膛推抵 0° 机械硬止位。',
    rootCauseEn:
      'Short-stroking the manual winding knob or dry floating rails prevents the toothed driving rack from seating the rotary cylinder flush against its 0-degree stop.',
    safetyNoteZh:
      '无壳弹没有黄铜壳充当二次闭气垫圈，全靠旋转弹膛端面 ±0.02mm 精密贴合密封；未完全归零时绝不可强扣扳机！',
    safetyNoteEn:
      'Without a brass case to obturate the breech, G11 relies strictly on precision 0-degree cylinder sealing—never force the trigger off-axis!',
    steps: [
      {
        id: 'g11_oob_stop',
        orderLabel: '01',
        titleZh: '松开扳机并停止按压，点击旋转弹膛检查偏角间隙（Inspect）',
        titleEn: 'Release Trigger & Inspect Rotary Breech Angular Misalignment',
        detailZh:
          '移开食指解除扳机压力，通过纵剖视观察圆柱弹膛轴线与枪管尾端之间的错位夹角。',
        detailEn:
          'Remove trigger pressure and inspect the angular misalignment between the rotary breech chamber and barrel throat.',
      },
      {
        id: 'g11_oob_cycle',
        orderLabel: '02',
        titleZh: '将左侧上弦旋柄转满完整行程复位齿条与钟表齿轮相位（Full Wind）',
        titleEn: 'Complete Full Winding-Knob Stroke to Re-Index Rack & Gears',
        detailZh:
          '将左侧折叠旋柄干脆转到底并松回，令浮置主复进簧与齿条齿轮组完整同步归零。',
        detailEn:
          'Turn the left winding knob to its full positive stop so the toothed driving rack and clockwork gears re-synchronize.',
      },
      {
        id: 'g11_oob_lock',
        orderLabel: '03',
        titleZh: '确认旋转弹膛严密归零 0.0° 同轴贴合，解除击针安全互锁（Full Lock）',
        titleEn: 'Verify 0.0-Degree Coaxial Cylinder Lockup & Clear Safety Interlock',
        detailZh:
          '当旋转弹膛与枪管 100% 同轴密合时，机械互锁自动撤除，恢复精准单发与 2,100 RPM 三连发能力。',
        detailEn:
          'Once the rotary cylinder locks dead-level at 0.0 degrees, the firing-pin interlock retracts cleanly for safe ignition.',
      },
    ],
  },
};

const VSS_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'MALF-VSS-01',
    shortZh: '微声低压卡壳',
    shortEn: 'Subsonic Stovepipe',
    titleZh: '9×39mm 亚音速低燃压空壳夹滞抛壳窗（Subsonic Low-Impulse Stovepipe）',
    titleEn: '9x39mm Subsonic Low-Velocity Spent Case Stovepipe Jam',
    badgeZh: '微声步枪常见故障',
    badgeEn: 'Suppressed Cycle Jam',
    symptomZh:
      '发射 290 m/s 9×39mm SP-6 亚音速穿甲弹后，涂漆钢壳未能被彻底抛离机匣，被复进的六突笋枪机框斜夹在右侧抛壳窗边缘形成烟囱卡壳。',
    symptomEn:
      'After firing a 290 m/s subsonic 9x39mm SP-6 round, the lacquered steel case fails to clear the ejection port and is pinched upright by the returning bolt carrier.',
    rootCauseZh:
      '整体消音器六级隔板腔内高压燃气回流积碳污染导气活塞与铣削机匣导轨，导致低膛压亚音速弹后坐能量裕度不足、枪机短行程复进。',
    rootCauseEn:
      'Suppressor back-pressure carbon fouling slows the long-stroke piston inside the milled receiver, reducing carrier rearward velocity below reliable ejection energy.',
    safetyNoteZh:
      '整体消音外筒连续射击后蓄热极高，手掌扫壳拉栓时切勿触碰前端消音器筒壁以免灼伤！',
    safetyNoteEn:
      'The integral suppressor sleeve retains extreme heat—keep hands strictly on the rear bolt handle while sweeping the stovepiped case!',
    steps: [
      {
        id: 'vss_sp_sweep',
        orderLabel: '01',
        titleZh: '向左倾斜枪身并向后拉动右侧拉机柄释放被夹 9×39mm 钢壳（Rack）',
        titleEn: 'Cant Rifle & Pull Right Bolt Handle Rearward to Free Pinched Case',
        detailZh:
          '向后拉动长行程活塞枪机框消除夹紧力，顺势将烟囱状卡壳的绿漆钢壳抖落机匣外。',
        detailEn:
          'Retract the long-stroke bolt carrier to release tension on the pinched 9x39mm steel case and sweep it clear.',
      },
      {
        id: 'vss_sp_check',
        orderLabel: '02',
        titleZh: '检查六闭锁突笋枪机面与弹膛积碳无阻滞（Inspect Chamber）',
        titleEn: 'Inspect 6-Lug Rotating Bolt Face & Chamber Throat for Carbon',
        detailZh:
          '确认抛壳窗与铣削弹膛内无残留异物，微声泄压枪管导气室保持通畅。',
        detailEn:
          'Confirm the 6-lug bolt face, extractor claw, and chamber mouth are clear of heavy subsonic carbon buildup.',
      },
      {
        id: 'vss_sp_release',
        orderLabel: '03',
        titleZh: '干脆松手释放枪机框，令六闭锁突笋旋转满闭锁推入新 SP-6 弹（Feed）',
        titleEn: 'Release Bolt Carrier Crisply to Lock 6 Lugs on Fresh SP-6 Round',
        detailZh:
          '切勿随手护送拉机柄，让复进簧满能量驱动六突笋枪机旋转锁紧并同步压挂线性击针。',
        detailEn:
          'Release the handle sharply so the recoil spring rotates all 6 locking lugs home and cocks the silent linear striker.',
      },
    ],
  },
  double_feed: {
    kind: 'double_feed',
    code: 'MALF-VSS-02',
    shortZh: '9×39 双进弹',
    shortEn: '9x39 Double-Feed',
    titleZh: '10 发梅子红华夫弹匣 9×39mm 粗径重弹双进弹卡死（Subsonic Double-Feed）',
    titleEn: '9x39mm Heavy Subsonic Round Double-Feed Chamber Jam',
    badgeZh: '重度卡阻 · 需摇卸弹匣',
    badgeEn: 'Severe Jam · Rock Out Mag',
    symptomZh:
      '粗大的 9.25mm 250 格令 SP-6 重弹头顶在未抽出的前一枚钢壳底缘上，枪机框被两枚 9×39mm 枪弹死死楔紧在半开位置。',
    symptomEn:
      'A heavy 250 gr 9x39mm SP-6 round drives into the base of an unextracted spent case in the chamber, locking the bolt carrier half-open.',
    rootCauseZh:
      '亚音速枪弹积碳增厚使拉壳钩爪滑脱钢壳底缘，或梅子红聚合物弹匣唇口磨损变形导致双排供弹提前弹出。',
    rootCauseEn:
      'Carbon-fouled chamber walls cause the extractor to slip off the steel rim, or worn plum polymer feed lips release a round prematurely.',
    safetyNoteZh:
      '切勿用蛮力前砸拉机柄：粗重 SP-6 穿甲弹尖撞击底火可能引发未闭锁击发，必须先压笋前摇卸除弹匣！',
    safetyNoteEn:
      'Never hammer the charging handle forward onto a jammed 9x39mm AP tip—rock out the 10-round plum magazine first!',
    steps: [
      {
        id: 'vss_df_retract',
        orderLabel: '01',
        titleZh: '向后拉满右侧拉机柄解除六突笋枪机对双弹的轴向挤压（Retract）',
        titleEn: 'Pull Bolt Carrier Fully Rearward to Relieve Jam Tension',
        detailZh:
          '向后稳拉枪机框让开弹匣唇口空间，消除对 10 发梅子红弹匣卡笋的摩擦卡死。',
        detailEn:
          'Hold the bolt carrier rearward so the bolt face no longer binds the top cartridge against the magazine feed lips.',
      },
      {
        id: 'vss_df_strip',
        orderLabel: '02',
        titleZh: '按压弹匣卡笋向前摇卸 10 发梅子红华夫 9×39mm 弹匣（Strip Mag）',
        titleEn: 'Depress Paddle Catch & Rock Out 10-Rd Plum Waffle Magazine',
        detailZh:
          '前摇抽出 10 发聚合物弹匣，彻底解除向上供弹推力，让第二枚实弹自由脱落弹匣井。',
        detailEn:
          'Rock the 10-round plum magazine forward and down to clear the feeding cartridge out of the receiver well.',
      },
      {
        id: 'vss_df_rack',
        orderLabel: '03',
        titleZh: '干脆来回猛拉枪机框三次，彻底抽出滞膛空壳并检视空膛（Rack x3）',
        titleEn: 'Cycle Bolt Carrier Three Times to Extract Stuck Case & Verify Clear',
        detailZh:
          '连续三次全行程拉放枪机，确保抓壳钩咬合排出卡滞的 9×39mm 钢壳并目视膛内清净。',
        detailEn:
          'Work the charging handle briskly three times to eject the stuck steel case and visually verify an empty chamber.',
      },
      {
        id: 'vss_df_reload',
        orderLabel: '04',
        titleZh: '重新挂钩扣实 10 发梅子红弹匣并松手推入新 SP-6 穿甲弹（Reload）',
        titleEn: 'Rock In Seated 10-Rd Plum Magazine & Chamber Fresh SP-6 Round',
        detailZh:
          '前唇挂入铣削机匣后向后扣响锁定弹匣，拉满枪机干脆松手闭锁恢复微声射击。',
        detailEn:
          'Hook the front lug, rock the magazine locked, and slingshot the bolt carrier into full 6-lug battery.',
      },
    ],
  },
  light_strike: {
    kind: 'light_strike',
    code: 'MALF-VSS-03',
    shortZh: '线性击针浅击',
    shortEn: 'Striker Dud',
    titleZh: '无击锤式线性平滑击针撞击俄制硬底火拒发（Linear Striker Light Strike）',
    titleEn: 'Silent Linear Striker Light Strike on Hard Lacquered Military Primer',
    badgeZh: '线性击针故障 · 静默排障',
    badgeEn: 'Linear Striker · Silent Clear',
    symptomZh:
      'VSS 摒弃传统回转击锤以降低击发机械噪音；扣动扳机后仅听见轻微滑动撞击声，线性平滑击针未能引燃 9×39mm 漆封军用底火。',
    symptomEn:
      'To minimize mechanical signature, VSS fires via a linear striker instead of a swinging hammer; pulling the trigger produces a muted click with no ignition.',
    rootCauseZh:
      '消音器倒灌火药残渣凝结于线性击针滑道或严寒低温使润滑脂黏滞，削弱了击针簧冲量未能击穿厚杯军用伯丹底火。',
    rootCauseEn:
      'Suppressor carbon sludge or sub-zero grease viscosity slows the linear striker rod below the impact energy required for hard military Berdan primers.',
    safetyNoteZh:
      '保持隐蔽瞄准安全指向等待数秒排查迟发弹，随后轻声拉栓退除哑弹并推入新弹！',
    safetyNoteEn:
      'Hold muzzle safely downrange for hangfire clearance before cycling the bolt handle to eject the dud 9x39mm cartridge!',
    steps: [
      {
        id: 'vss_ls_tap',
        orderLabel: '01',
        titleZh: '拍实 10 发梅子红弹匣底盖确认锁止无松脱（Tap）',
        titleEn: 'Seat 10-Rd Plum Waffle Magazine Firmly Against Latch (Tap)',
        detailZh:
          '向上轻拍弹匣底盖确认后锁齿咬合牢固，防止供弹位偏移干扰复进闭锁。',
        detailEn:
          'Tap the magazine baseplate upward to ensure the rear locking lug is positively engaged.',
      },
      {
        id: 'vss_ls_rack',
        orderLabel: '02',
        titleZh: '全行程后拉长行程活塞枪机框排出哑弹并重挂线性击针（Rack）',
        titleEn: 'Rack Bolt Carrier Full Stroke to Eject Dud & Recock Linear Striker',
        detailZh:
          '向后拉到底抛出未发火的 9×39mm SP-6 实弹，同步将无击锤线性平滑击针压缩挂回阻铁。',
        detailEn:
          'Pull the charging handle fully rearward to eject the dud SP-6 round and re-compress the linear striker onto the sear.',
      },
      {
        id: 'vss_ls_assess',
        orderLabel: '03',
        titleZh: '干脆松手推新弹入膛闭锁，战后拆洗线性击针滑槽与消音芯（Assess）',
        titleEn: 'Release into Battery & Flag Linear Striker Track for Carbon Cleaning',
        detailZh:
          '释放枪机推新弹锁紧六突笋，任务后拆下机匣盖与整体消音筒彻底清除积碳油泥。',
        detailEn:
          'Slingshot a fresh round into battery and schedule post-mission cleaning of the linear striker track and 6-stage baffles.',
      },
    ],
  },
  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · VSS-6LUG',
    shortZh: '六突笋未闭锁',
    shortEn: '6-Lug OOB',
    titleZh: '六闭锁突笋微声枪机未完全旋转闭锁安全阻断（6-Lug Out-of-Battery Guard）',
    titleEn: '6-Lug Rotating Bolt Incomplete Lockup Auto-Sear Safety Interlock',
    badgeZh: '精密微声闭锁保护',
    badgeEn: '6-Lug Lockup Shield',
    symptomZh:
      '静默手动缓慢送栓时，六闭锁突笋枪机在距完全闭锁尚差约 12° 旋角处停滞，枪机框尾端凸轮尚未压下不到位保险阻铁，线性击针被强制机械锁定！',
    symptomEn:
      'Quietly easing the bolt handle forward leaves the 6-lug bolt ~12 degrees shy of full rotation; the carrier fails to trip the out-of-battery sear, blocking the linear striker!',
    rootCauseZh:
      '特种狙击手为隐蔽行踪刻意“手护拉机柄轻声慢推闭锁”（Silent Ride），导致复进簧在最后一段凸轮旋锁阻力前动能耗尽。',
    rootCauseEn:
      'Slowly riding the bolt handle forward for noise discipline robs the carrier of the momentum required to rotate all six locking lugs over carbon buildup.',
    safetyNoteZh:
      '即便 9×39mm 属亚音速弹，其峰值膛压仍高达 280 MPa：绝不可在六突笋未旋转落锁前击发，必须补推拉机柄至死点或重拉干脆释放！',
    safetyNoteEn:
      'Despite subsonic velocity, 9x39mm reaches 280 MPa peak chamber pressure—never fire until all 6 lugs lock fully at 0.0mm gap!',
    steps: [
      {
        id: 'vss_oob_stop',
        orderLabel: '01',
        titleZh: '松开扳机并拉动枪机框退出半入膛的 9×39mm 穿甲实弹（Retract）',
        titleEn: 'Release Trigger & Retract Bolt Carrier to Clear Unseated Round',
        detailZh:
          '停止扣动扳机并将枪机框拉至后方，抽出受阻未闭锁的 SP-6 枪弹避免卡膛。',
        detailEn:
          'Remove finger from trigger and pull the bolt handle back to extract the unseated 9x39mm cartridge.',
      },
      {
        id: 'vss_oob_inspect',
        orderLabel: '02',
        titleZh: '检视铣削机匣六槽闭锁凹肩与枪机螺旋开锁导槽清洁度（Inspect）',
        titleEn: 'Inspect Milled Receiver 6-Lug Recesses & Carrier Cam Track',
        detailZh:
          '确认六枚对称闭锁突笋凹槽内无消音器回流结焦碳块阻挡最终旋转落位。',
        detailEn:
          'Verify that the six milled locking recesses and bolt cam pin are clear of hardened carbon crust.',
      },
      {
        id: 'vss_oob_lock',
        orderLabel: '03',
        titleZh: '拉满拉机柄后松手干脆复进，确认六闭锁突笋 100% 旋转锁固（Full Lock）',
        titleEn: 'Slingshot Bolt Carrier Home for 100% 6-Lug Rotary Lockup',
        detailZh:
          '以满额复进簧张力将六突笋枪机旋转到位并解脱不到位保险，恢复静默精准待击。',
        detailEn:
          'Allow full recoil-spring energy to snap all six locking lugs home and trip the OOB safety ready to fire.',
      },
    ],
  },
};

const M134_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'MALF-M134-01',
    shortZh: '底排壳口壅塞',
    shortEn: 'Chute Back-Up',
    titleZh: '3,000 RPM 底部抛壳导管铜壳壅塞卡滞转子枪机（Ejection Chute Back-Up）',
    titleEn: '3,000 RPM Lower Brass Ejection Chute Back-Up Stalling Bolt',
    badgeZh: '加特林高速排壳故障',
    badgeEn: 'Rotary Brass Chute Jam',
    symptomZh:
      '每秒 50 发 7.62×51mm NATO 炽热铜壳在底部排壳导管弯折处发生堆积回堵，一枚空壳卡死在 5 点钟抛壳位枪机槽口，触发驱动马达过载保护停转！',
    symptomEn:
      'At 50 rounds per second, spent 7.62 NATO brass backs up in a kinked lower ejection chute and wedges inside the 5-o’clock rotor bolt track, tripping the motor clutch!',
    rootCauseZh:
      '车载/机载抛壳软管弯曲半径过小或排壳口被杂物遮挡，导致高速喷涌的空弹壳与 M13 离散弹链片倒灌回转子槽。',
    rootCauseEn:
      'A sharp bend or obstruction in the flexible brass disposal chute causes hot 7.62 cases to pile back up into the spinning 6-flute rotor.',
    safetyNoteZh:
      '排除电动加特林卡阻前，必须先松开双手铲形握把火控开关并确认 28V 直流主电源断电隔离！',
    safetyNoteEn:
      'Before touching any rotary bolt track, release the spade-grip firing triggers and isolate 28V DC motor power!',
    steps: [
      {
        id: 'm134_sp_power',
        orderLabel: '01',
        titleZh: '松开铲形握把双电门并逆向微盘转子卸除过载离合器扭矩（De-Power）',
        titleEn: 'Release Spade-Grip Switches & Relieve Rotor Clutch Torque',
        detailZh:
          '切断 28V 直流驱动电流，点击中央六槽转子微调卸荷，解除对卡滞铜壳的挤压剪切力。',
        detailEn:
          'Cut 28V DC power and jog the central 6-flute rotor slightly to take clutch torque off the wedged brass casing.',
      },
      {
        id: 'm134_sp_clear',
        orderLabel: '02',
        titleZh: '理顺底部抛壳导管并清出 5 点钟枪机槽内回堵的 7.62 空壳（Clear Chute）',
        titleEn: 'Straighten Lower Ejection Chute & Clear Wedged 7.62 Brass',
        detailZh:
          '检查底部排壳导管通畅无弯折，从转子排壳窗口清除变形空铜壳与残留链节。',
        detailEn:
          'Remove the kink in the brass disposal chute and clear deformed 7.62mm casings from the lower rotor exit.',
      },
      {
        id: 'm134_sp_spin',
        orderLabel: '03',
        titleZh: '手动旋检转子顺滑无阻，重接 28V 电源恢复 3,000 RPM 齐射（Spin Ready）',
        titleEn: 'Verify Free Rotor Rotation & Re-Arm 28V DC Drive for 3,000 RPM',
        detailZh:
          '确认全部六枚滚轮枪机在正弦凸轮槽内往复顺滑，重新待命执行六管饱和火力压制。',
        detailEn:
          'Confirm all six cam-roller bolts cycle freely inside the sinusoidal track and re-energize the 28V drive.',
      },
    ],
  },
  double_feed: {
    kind: 'double_feed',
    code: 'MALF-M134-02',
    shortZh: '脱链供弹卡滞',
    shortEn: 'Delinker Jam',
    titleZh: '狄龙 M134D 星形脱链机 M13 弹链跨齿双弹卡阻（Delinker Sprocket Jam）',
    titleEn: 'Dillon M134D Star-Wheel Delinker M13 Link Cross-Feed Jam',
    badgeZh: '脱链供弹卡死 · 需清链',
    badgeEn: 'Delinker Bind · Pull Chute',
    symptomZh:
      '扭曲的 M13 可散弹链片未能在星形拨轮剥离口顺利脱落，带偏下一发 7.62 NATO 实弹与前一枚脱链弹在 8 点钟转子入口交叉卡死。',
    symptomEn:
      'A bent M13 disintegrating link fails to strip cleanly inside the Dillon star-wheel delinker, wedging two 7.62 NATO rounds across the 8-o’clock rotor feed throat.',
    rootCauseZh:
      '左侧柔性不锈钢供弹槽内弹链进给受阻拉力过大，导致压弹离合簧超限打滑、星形脱链拨轮与中央转子相位错齿。',
    rootCauseEn:
      'Excessive ammo-chute pull load causes the feeder clutch to slip, throwing the star-wheel delinker out of phase with the 6-flute rotor.',
    safetyNoteZh:
      '电动外能源武器不会因卡弹自动停手：必须先断电卸开柔性供弹滑槽与脱链机，严禁通电硬冲强转！',
    safetyNoteEn:
      'Never power-jog a bound delinker with 28V DC—isolate power and unlatch the M13 feed chute first to prevent crushed live rounds!',
    steps: [
      {
        id: 'm134_df_stop',
        orderLabel: '01',
        titleZh: '断电停转中央转子，开启保险扇形块并释放离合器卡滞压力（Cut Power）',
        titleEn: 'Cut 28V Motor Power & Relieve Rotor-to-Delinker Gear Bind',
        detailZh:
          '点击中央转子或驱动马达彻底断电停转，防止高扭矩直流马达压变形 7.62 实弹壳颈。',
        detailEn:
          'Ensure the 28V DC motor is de-energized and relieve mechanical bind across the rotor-to-delinker spur gears.',
      },
      {
        id: 'm134_df_strip',
        orderLabel: '02',
        titleZh: '脱开左侧不锈钢 M13 柔性供弹槽切断 7.62 弹链张力（Detach Chute）',
        titleEn: 'Unlatch Left Stainless M13 Ammo Chute to Clear Belt Tension',
        detailZh:
          '拔出快拆销分离柔性供弹滑槽，彻底卸除整条 M13 金属弹链对脱链星轮的拉力。',
        detailEn:
          'Disconnect the flexible stainless M13 feed chute so belt drag no longer binds the star-wheel sprocket.',
      },
      {
        id: 'm134_df_clear',
        orderLabel: '03',
        titleZh: '手动清除狄龙脱链机内变形 M13 链节与双卡实弹并校对正时（Clear & Time）',
        titleEn: 'Extract Bent M13 Links, Clear Both 7.62 Rounds & Re-Time Sprocket',
        detailZh:
          '取出卡死的两发 7.62 NATO 枪弹与损坏链片，对准脱链拨轮与转子正时标记。',
        detailEn:
          'Remove the bent M13 link and jammed rounds, then verify star-wheel sprocket timing marks align with Rotor Track #1.',
      },
      {
        id: 'm134_df_reload',
        orderLabel: '04',
        titleZh: '重新挂接 M13 弹链滑槽，手盘转子确认首弹入位恢复待射（Reload）',
        titleEn: 'Re-Latch M13 Ammo Chute & Hand-Index First Round to Ready',
        detailZh:
          '扣紧不锈钢供弹槽并顺滑盘转一圈，确认六管循环供弹与脱链节拍 100% 恢复同步。',
        detailEn:
          'Re-latch the ammo chute and confirm smooth delinking into the 8-o’clock rotor pocket ready for electric fire.',
      },
    ],
  },
  light_strike: {
    kind: 'light_strike',
    code: 'MALF-M134-03',
    shortZh: '外能源抛哑弹',
    shortEn: 'Auto-Clear Dud',
    titleZh: '单发哑弹拒发与加特林外能源自动抛除演练（External-Drive Dud Pass-Through）',
    titleEn: 'Single-Round Primer Failure & External Electric Auto-Clear Cycle',
    badgeZh: '加特林核心优势 · 不停射',
    badgeEn: 'Gatling Advantage · No Stop',
    symptomZh:
      '某发 7.62×51mm NATO 枪弹在 12 点钟击发点遭击针撞击后底火失效拒发；但因 M134D 由 28V 电动马达而非火药燃气驱动，其余五根枪管照常高速循环！',
    symptomEn:
      'A defective 7.62 NATO primer fails to ignite at 12 o’clock; because external 28V DC power drives the rotor instead of propellant gas, the weapon never stops cycling!',
    rootCauseZh:
      '弹药受潮底火失效或某枚枪机击针尖端磨损；在传统导气机枪上会立刻停射，但在加特林机枪上仅表现为单管瞬时漏响。',
    rootCauseEn:
      'A dead #34 military primer or worn bolt firing pin causes a single misfire without interrupting the externally powered 6-barrel rotation.',
    safetyNoteZh:
      '注意地面落壳区可能混入未击发的 7.62 NATO 完整哑弹！勤务检查必须排查涉事编号枪机的击针伸出量。',
    safetyNoteEn:
      'Watch for live ejected duds in the spent-brass chute! After firing, inspect the affected bolt number for firing-pin protrusion wear.',
    steps: [
      {
        id: 'm134_ls_verify',
        orderLabel: '01',
        titleZh: '确认 28V 电动马达持续驱动转子携哑弹越过 12 点钟位置（Drive Past）',
        titleEn: 'Confirm 28V DC Rotor Carries Dud Round Past 12-O’Clock Firing Point',
        detailZh:
          '电动外能源无视单发无膛压状态，强行带动涉事枪机沿正弦凸轮槽后退完成机械抽壳。',
        detailEn:
          'External motor torque rotates the misfired barrel past 12 o’clock and cams its bolt rearward along the sinusoidal track.',
      },
      {
        id: 'm134_ls_eject',
        orderLabel: '02',
        titleZh: '在 5 点钟抛壳位自动抽出并沿底槽排出完整哑弹（Auto-Eject）',
        titleEn: 'Auto-Extract & Expel Live Dud Round Down 5-O’Clock Chute',
        detailZh:
          '涉事枪机在 5 点钟开锁位将完整哑弹平稳拔出弹膛并投入排壳导管，零人工干预排障！',
        detailEn:
          'At 5 o’clock the bolt extracts and dumps the unfired dud cartridge through the disposal chute with zero stoppage.',
      },
      {
        id: 'm134_ls_inspect',
        orderLabel: '03',
        titleZh: '连续推入后续 7.62 实弹维持 3,000 RPM 火力，并记录枪机号检修击针（Assess）',
        titleEn: 'Maintain 3,000 RPM Fire & Log Bolt Head for Firing-Pin Check',
        detailZh:
          '下一根枪管瞬间在 12 点钟无缝接续击发，停射后对涉事枪机执行击针突伸量规检测。',
        detailEn:
          'Subsequent barrels fire seamlessly at 3,000 RPM; log the misfiring bolt slot for post-flight firing-pin gauging.',
      },
    ],
  },
  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · M134-SAFE',
    shortZh: '保险扇区锁止',
    shortEn: 'Safing Sector',
    titleZh: '12 点钟保险闭锁扇形块未入位击发阻断（Safing Sector Firing Interlock）',
    titleEn: '12-O’Clock Safing Sector Cam Track Firing-Pin Interlock',
    badgeZh: '加特林防早发核心保险',
    badgeEn: 'Rotary OOB Interlock',
    symptomZh:
      '枪机滚轮尚在 10 点钟上坡进弹段推进，枪机头尚未完全旋转 22° 闭锁进转子卡槽；同时若 12 点钟保险扇形块翻起解脱，击针翘板将被强制托离底火轴线！',
    symptomEn:
      'The cam-roller bolt is still ascending the 10-o’clock ramming ramp short of its 22-degree locked rotation; the top safing sector mechanically holds the firing pin cocked off the primer!',
    rootCauseZh:
      '主机匣顶部可翻盖式保险扇形块（Safing Sector）未压紧锁死，或在装弹清枪后未重新合拢该防早发机械安全门。',
    rootCauseEn:
      'The hinged 12-o’clock safing sector was left disengaged after clearing, intentionally decoupling the firing-pin sear cam from all six passing bolts.',
    safetyNoteZh:
      '保险扇形块是 M134D 的“机械安全门”：开启时允许空转电机排空膛内实弹而绝对不会触发底火，实弹射击前必须确认锁舌完全落槽！',
    safetyNoteEn:
      'The safing sector lets crews spin-clear live rounds safely with zero primer strikes—lock it closed only when ready for live fire!',
    steps: [
      {
        id: 'm134_oob_stop',
        orderLabel: '01',
        titleZh: '松开铲形握把火控电门，检查 12 点钟顶部保险扇形块锁止状态（Inspect）',
        titleEn: 'Release Firing Switches & Inspect 12-O’Clock Safing Sector Position',
        detailZh:
          '观察机匣 12 点钟位置可动扇形块与凸轮环平齐度，确认击针是否正处于安全托起状态。',
        detailEn:
          'Inspect the top 12-o’clock hinged safing sector to verify whether the firing-pin trip ramp is intentionally retracted.',
      },
      {
        id: 'm134_oob_align',
        orderLabel: '02',
        titleZh: '确认所有六枚枪机滚轮准确嵌合正弦凸轮轨道无脱轨（Verify Track）',
        titleEn: 'Verify All Six Bolt Cam Rollers Track Cleanly Inside Stator Groove',
        detailZh:
          '透过剖视检视六枚枪机滚轮顺畅贴合螺旋导槽，确认 12 点钟位置枪机头旋转闭锁零间隙。',
        detailEn:
          'Confirm every bolt roller rides squarely in the elliptical stator track and achieves full 22-degree lockup at 12 o’clock.',
      },
      {
        id: 'm134_oob_engage',
        orderLabel: '03',
        titleZh: '压实锁紧 12 点钟保险扇形块恢复 100% 闭锁击发联动（Engage）',
        titleEn: 'Latch 12-O’Clock Safing Sector Flush for Full Locked Fire',
        detailZh:
          '将保险扇形块稳固扣平锁死，使仅当枪机在 12 点钟 100% 闭锁瞬间才精确释放击针。',
        detailEn:
          'Snap the safing sector flush into its firing detent so firing pins release strictly at full 12-o’clock battery.',
      },
    ],
  },
};

const AN94_MALFUNCTION_SCENARIOS: Readonly<
  Record<MalfunctionKind, MalfunctionScenarioSpec>
> = {
  stovepipe: {
    kind: 'stovepipe',
    code: 'MALF-AN94-01',
    shortZh: '双发高速卡壳',
    shortEn: 'Hyperburst Jam',
    titleZh: '1,800 RPM 极速双连发首弹空壳滞窗卡阻（Hyperburst First-Round Stovepipe）',
    titleEn: '1,800 RPM Hyperburst First-Round Steel Case Stovepipe Jam',
    badgeZh: '双发超高速特有故障',
    badgeEn: '1,800 RPM Timing Jam',
    symptomZh:
      '浮置枪管内机匣后滑 42mm 期间，首发 5.45×39mm 绿漆钢壳在 33 毫秒极速循环内未能及时抛离，被前冲推取第二发弹的枪机框夹立于右侧抛壳长槽！',
    symptomEn:
      'During the 33-millisecond 1,800 RPM cycle while the barreled receiver floats rearward 42mm, the spent 5.45mm steel case fails to clear and gets pinched by the returning bolt!',
    rootCauseZh:
      '浮置内机匣滑动导轨积尘干涩，略微改变了内机匣与枪机框之间的相对后坐速度差，削弱了首弹抛壳挺撞击冲量。',
    rootCauseEn:
      'Fouled outer-housing glide rails alter the relative recoil timing between the floating inner receiver and bolt carrier, robbing ejector impulse.',
    safetyNoteZh:
      'AN-94 处于双发高速态时第二发实弹可能已由滑轮预供弹滑块托举在半途！排障拉栓务必一拉到底彻底清空两级通道！',
    safetyNoteEn:
      'In AN-94 hyperburst, a second live 5.45mm round may already sit staged on the bronze pre-feed rammer—always rack full stroke!',
    steps: [
      {
        id: 'an94_sp_rack',
        orderLabel: '01',
        titleZh: '向后全行程拉动枪机框，同步卸荷抛落夹滞的 5.45 钢壳（Rack）',
        titleEn: 'Pull Bolt Carrier Full Stroke to Free Pinched 5.45mm Steel Case',
        detailZh:
          '向右倾枪后拉枪机框释放卡滞空壳，同时确认青铜二级预供弹滑块平滑回位。',
        detailEn:
          'Tilt ejection port downward and retract the bolt carrier to clear the pinched steel case while resetting the pre-feed rammer.',
      },
      {
        id: 'an94_sp_check',
        orderLabel: '02',
        titleZh: '目视检查二级预供弹托盘与浮置枪管弹膛无残留双弹（Check Tray）',
        titleEn: 'Inspect Bronze Pre-Feed Shuttle & Floating Chamber for Loose Round',
        detailZh:
          '核查滑轮钢索驱动的二级预供弹盘上没有残留未定位实弹，避免复进引发二次双进弹。',
        detailEn:
          'Confirm no loose 5.45mm cartridge remains trapped on the cable-driven pre-feed tray ahead of the chamber.',
      },
      {
        id: 'an94_sp_release',
        orderLabel: '03',
        titleZh: '松手干脆释放枪机框归零浮置机匣，恢复 1,800 RPM 双发待击（Ready）',
        titleEn: 'Release Bolt Carrier Crisply to Restore Floating-Action Battery',
        detailZh:
          '让高劲度枪机复进簧与外机匣缓冲主簧同步回弹到位，恢复精准双发同孔连射状态。',
        detailEn:
          'Release cleanly so both the bolt return spring and floating receiver buffer spring seat solidly in battery.',
      },
    ],
  },
  double_feed: {
    kind: 'double_feed',
    code: 'MALF-AN94-02',
    shortZh: '二级预供卡阻',
    shortEn: 'Pre-Feed Jam',
    titleZh: '滑轮钢索二级预供弹滑块与 15° 右倾弹匣双弹干涉（2-Stage Pre-Feed Double-Feed）',
    titleEn: 'Cable-Pulley 2-Stage Pre-Feed Shuttle & Canted Magazine Double-Feed',
    badgeZh: '阿巴坎标志排障 · 清双通道',
    badgeEn: 'Abakan 2-Stage Jam · Clear Tray',
    symptomZh:
      '浮置枪膛内残留前发弹壳，而 CNC 槽轮滑轮与编织钢索已将青铜二级预供弹滑块向前拽出并从 15° 右倾弹匣带出第二发 5.45×39mm 实弹，两弹在预供弹斜坡剧烈顶撞！',
    symptomEn:
      'A spent case remains in the floating chamber while the grooved pulley and braided steel cable haul a live 5.45mm round onto the bronze pre-feed tray, locking both stages!',
    rootCauseZh:
      '在半行程拉栓检查后未清膛直接松手，致使滑轮钢索预供弹机构提前向托弹盘输送了一发 5.45mm 实弹，与膛内原有弹药发生双层叠加干涉。',
    rootCauseEn:
      'Short-stroking the charging handle actuates the pulley-cable pre-feed rammer early, staging an extra 5.45mm cartridge behind a round already in the chamber.',
    safetyNoteZh:
      '必须先卸载 15° 右倾弧形弹匣，再多次全行程拉栓以同时清空“枪膛”与“二级预供弹托盘”两处藏弹位！',
    safetyNoteEn:
      'Always remove the 15-degree canted magazine first, then cycle fully to clear BOTH the chamber AND the 2-stage pre-feed tray!',
    steps: [
      {
        id: 'an94_df_retract',
        orderLabel: '01',
        titleZh: '后拉枪机框松弛传动钢索并卸除对预供弹托盘的挤压（Retract）',
        titleEn: 'Pull Bolt Carrier Rearward to Relieve Tension on Pre-Feed Shuttle',
        detailZh:
          '稳拉枪机框让开 15° 弹匣口上方空间，防止弹匣唇口被预供弹滑块咬死难以拔出。',
        detailEn:
          'Retract the bolt carrier to take forward spring load off the jammed cartridges above the 15-degree canted magazine.',
      },
      {
        id: 'an94_df_strip',
        orderLabel: '02',
        titleZh: '顺着 15° 右倾角按下卡笋摇卸 30 发 5.45×39mm 弧形弹匣（Strip Mag）',
        titleEn: 'Rock Out 15-Degree Right-Canted 30-Rd 5.45x39mm Banana Magazine',
        detailZh:
          '沿 15° 右偏轴线果断卸除弹匣，切断向二级青铜预供弹滑块的后续供弹源。',
        detailEn:
          'Depress the paddle catch and pull the canted 30-round magazine clear along its 15-degree right axis.',
      },
      {
        id: 'an94_df_clear',
        orderLabel: '03',
        titleZh: '连续三次满行程拉放枪机框，同步排空枪膛与二级预供弹托盘（Rack x3）',
        titleEn: 'Cycle Bolt Carrier Three Times to Empty Chamber & Pre-Feed Tray',
        detailZh:
          '反复带动槽轮滑轮与钢索全行程往复，确认弹膛和青铜预供托盘内全部卡滞弹清空。',
        detailEn:
          'Work the charging handle briskly three times so both the floating barrel chamber and pre-feed shuttle dump clear.',
      },
      {
        id: 'an94_df_reload',
        orderLabel: '04',
        titleZh: '顺 15° 角重新插实 5.45 弧形弹匣并一拉到底松手上膛（Reload）',
        titleEn: 'Reseat 15-Degree Canted Magazine & Slingshot Fresh 5.45mm Round',
        detailZh:
          '扣响锁定右倾弹匣，满行程拉放枪机一次将首弹经二级预供顺滑送入浮置枪膛。',
        detailEn:
          'Lock the canted magazine firmly and execute one crisp full-stroke slingshot into battery.',
      },
    ],
  },
  light_strike: {
    kind: 'light_strike',
    code: 'MALF-AN94-03',
    shortZh: '高速击发拒发',
    shortEn: 'Hyperburst Dud',
    titleZh: '1,800 RPM 延迟后坐击锤轻敲 5.45 漆封底火拒发（Hyperburst Light Strike）',
    titleEn: '1,800 RPM Floating-Action Hammer Light Strike on 5.45mm Primer',
    badgeZh: '双发断续 · 即时复拉',
    badgeEn: 'Burst Interruption · Tap-Rack',
    symptomZh:
      '在两发高速连射中，击锤二次释放撞击惯性击针却未引燃 5.45×39mm 7N6 底火，浮置内机匣失去燃气后推直接提前复进停顿。',
    symptomEn:
      'During the 2-round hyperburst, the hammer strikes the firing pin without igniting the 5.45mm 7N6 primer, halting the gas-driven floating recoil cycle immediately.',
    rootCauseZh:
      '军用漆封 7N6 底火装药失效，或枪机框在 1,800 RPM 极高速复进中轻微反弹造成击锤能量损耗。',
    rootCauseEn:
      'A defective lacquer-sealed 7N6 primer or slight carrier bounce during the ultra-rapid 1,800 RPM return damps hammer energy.',
    safetyNoteZh:
      '保持枪口指向靶区并完整拉满一次拉机柄（切勿半拉！），防止二级预供机构额外带出双弹！',
    safetyNoteEn:
      'Keep muzzle downrange and execute ONE complete full-stroke rack (never short-stroke!) so the pulley pre-feed stays synchronized!',
    steps: [
      {
        id: 'an94_ls_tap',
        orderLabel: '01',
        titleZh: '沿 15° 斜角向上拍紧 30 发 5.45×39mm 弧形弹匣底盖（Tap）',
        titleEn: 'Tap 15-Degree Canted 5.45mm Magazine Firmly into Magwell (Tap)',
        detailZh:
          '确认右倾弹匣完全锁紧，确保弹匣口与青铜二级预供弹滑块高度精准齐平。',
        detailEn:
          'Verify the canted 30-round magazine is seated solidly flush with the bronze pre-feed rammer throat.',
      },
      {
        id: 'an94_ls_rack',
        orderLabel: '02',
        titleZh: '一拉到底排出未击发 5.45 哑弹并同步滑轮预供新弹（Full Rack）',
        titleEn: 'Rack Full Stroke to Eject 5.45mm Dud & Sync Pulley Pre-Feed',
        detailZh:
          '拉满枪机框弹出哑弹，同时让 CNC 滑轮钢索将下一发 5.45 实弹干净拨上托弹盘。',
        detailEn:
          'Pull the bolt handle cleanly to its rear stop to eject the dud and cycle the pulley-cable pre-feed smoothly.',
      },
      {
        id: 'an94_ls_assess',
        orderLabel: '03',
        titleZh: '干脆松手闭锁恢复双发高速射击，战后检查编织钢索张力（Assess）',
        titleEn: 'Release into Battery & Schedule Pulley-Cable Tension Inspection',
        detailZh:
          '确认浮置内机匣与双突笋枪机双双归零闭锁，勤务后检查编织传动钢索无毛刺疲劳。',
        detailEn:
          'Confirm both the 2-lug bolt and floating receiver return to full battery; inspect the braided steel cable post-mission.',
      },
    ],
  },
  out_of_battery: {
    kind: 'out_of_battery',
    code: 'SAFETY · AN94-FLT',
    shortZh: '浮置未闭锁保护',
    shortEn: 'Floating OOB',
    titleZh: '双突笋枪机未锁紧浮置内机匣自动阻铁安全阻断（Floating-Action OOB Safety）',
    titleEn: '2-Lug Bolt & Floating Inner Receiver Out-of-Battery Auto-Sear Block',
    badgeZh: '浮置双重闭锁保护',
    badgeEn: 'Floating Lockup Shield',
    symptomZh:
      '浮置枪管内机匣虽已滑回前止点，但双闭锁突笋枪机在进弹末段受阻尚差 4mm 未完成 35.5° 旋转闭锁；内机匣自动阻铁锁死击锤防止 294 MPa 膛压炸匣！',
    symptomEn:
      'The floating inner receiver returns forward, yet the 2-lug bolt stops ~4mm short of completing its 35.5-degree lockup rotation; the auto-sear traps the hammer to prevent a 294 MPa rupture!',
    rootCauseZh:
      '拉动拉机柄后缓慢护送前推，导致高劲度复进簧动能不足以克服编织钢索滑轮阻尼与双突笋最终旋锁摩擦。',
    rootCauseEn:
      'Riding the charging handle forward steals the spring energy needed to overcome pulley-cable friction and rotate the 2-lug bolt fully into battery.',
    safetyNoteZh:
      '切勿前砸拉机柄强迫编织钢索与青铜预供滑块硬顶入位，必须拉满重放或退出受阻枪弹排查滑轮导槽！',
    safetyNoteEn:
      'Never beat the charging handle forward against pulley-cable resistance—retract cleanly, clear the round, and slingshot into lockup!',
    steps: [
      {
        id: 'an94_oob_stop',
        orderLabel: '01',
        titleZh: '松开扳机并拉动枪机框退出半入膛的 5.45×39mm 枪弹（Retract）',
        titleEn: 'Release Trigger & Retract Bolt Carrier to Clear Unseated 5.45mm Round',
        detailZh:
          '停止扣压扳机并将枪机框拉至后位，抽出受阻未闭锁的 7N6 实弹检查壳体无凹陷。',
        detailEn:
          'Remove trigger pressure and pull the bolt handle rearward to clear the unseated 5.45mm cartridge.',
      },
      {
        id: 'an94_oob_inspect',
        orderLabel: '02',
        titleZh: '检查浮置钢制内机匣滑轨、CNC 滑轮与编织钢索无异物缠绕（Inspect）',
        titleEn: 'Inspect Floating Receiver Rails, Grooved Pulley & Steel Cable',
        detailZh:
          '确认外机匣内壁浮置导轨顺滑、槽轮钢索位于轮槽正中无跳槽卡滞。',
        detailEn:
          'Verify the braided steel cable tracks centered in the CNC pulley groove and the floating rails glide freely.',
      },
      {
        id: 'an94_oob_slingshot',
        orderLabel: '03',
        titleZh: '满行程拉放枪机零迟疑松手，确认双突笋 35.5° 旋转满闭锁（Full Lock）',
        titleEn: 'Slingshot Bolt Carrier from Full Rear into 35.5-Degree Full Lockup',
        detailZh:
          '令枪机复进簧满能量推动枪机旋转 35.5° 锁入浮置节套，解脱不到位保险恢复待射。',
        detailEn:
          'Release crisply from full retraction so the 2-lug bolt rotates 35.5 degrees into locked battery and clears the auto-sear.',
      },
    ],
  },
};

export function getMalfunctionScenario(
  kind: MalfunctionKind,
  weaponId?: WeaponId | string
): MalfunctionScenarioSpec {
  if (isArcheryMalfunctionWeapon(weaponId)) {
    return ARCHERY_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'python') {
    return REVOLVER_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'm249') {
    return M249_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'p08') {
    return P08_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'vector') {
    return VECTOR_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'g11') {
    return G11_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'vss') {
    return VSS_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'm134') {
    return M134_MALFUNCTION_SCENARIOS[kind];
  }
  if (weaponId === 'an94') {
    return AN94_MALFUNCTION_SCENARIOS[kind];
  }
  return MALFUNCTION_SCENARIOS[kind];
}

export const WEAPON_MALFUNCTION_PROFILES: Readonly<
  Record<WeaponId, WeaponMalfunctionProfile>
> = {
  ak15: {
    weaponId: 'ak15',
    actionPartIds: ['ak_bolt_carrier', 'ak_bolt'],
    lockingPartIds: ['ak_bolt', 'ak_barrel'],
    extractorPartId: 'ak_extractor',
    fireControlPartIds: [
      'ak_firing_pin',
      'ak_hammer',
      'ak_trigger',
      'ak_disconnector',
    ],
    magazinePartIds: [
      'ak_mag_body',
      'ak_mag_follower',
      'ak_mag_spring',
      'ak_mag_floorplate',
    ],
    magStripOffsetCm: [0.6, -4.6, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.72,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.54,
    lightStrikeF: 0.12,
    outOfBatteryF: 0.81,
  },
  m4a1: {
    weaponId: 'm4a1',
    actionPartIds: ['m4a1_bolt_carrier', 'm4a1_bolt', 'm4a1_charging_handle'],
    lockingPartIds: ['m4a1_bolt', 'm4a1_barrel'],
    extractorPartId: 'm4a1_bolt',
    fireControlPartIds: ['m4a1_firing_pin', 'm4a1_hammer', 'm4a1_trigger'],
    magazinePartIds: [
      'm4a1_mag_body',
      'm4a1_mag_follower',
      'm4a1_mag_spring',
      'm4a1_mag_floorplate',
    ],
    magStripOffsetCm: [0, -4.5, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.12,
    outOfBatteryF: 0.81,
  },
  mp5: {
    weaponId: 'mp5',
    actionPartIds: ['mp5_bolt_carrier', 'mp5_bolt_head', 'mp5_charging_handle'],
    lockingPartIds: [
      'mp5_locking_rollers',
      'mp5_locking_roller_left',
      'mp5_locking_piece',
      'mp5_bolt_head',
    ],
    extractorPartId: 'mp5_bolt_head',
    fireControlPartIds: ['mp5_firing_pin', 'mp5_hammer', 'mp5_trigger'],
    magazinePartIds: [
      'mp5_mag_body',
      'mp5_mag_follower',
      'mp5_mag_spring',
      'mp5_mag_floorplate',
    ],
    magStripOffsetCm: [0.3, -4.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.72,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.5,
    lightStrikeF: 0.11,
    outOfBatteryF: 0.82,
  },
  g17: {
    weaponId: 'g17',
    actionPartIds: ['slide'],
    lockingPartIds: ['barrel', 'locking_block'],
    extractorPartId: 'extractor',
    fireControlPartIds: [
      'striker',
      'firing_pin_safety',
      'trigger_with_bar',
      'connector',
    ],
    magazinePartIds: ['mag_body', 'mag_follower', 'mag_spring', 'mag_base_plate'],
    magStripOffsetCm: [-0.7, -3.8, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.14,
    outOfBatteryF: 0.81,
  },
  m82a1: {
    weaponId: 'm82a1',
    actionPartIds: ['m82a1_bolt_carrier', 'm82a1_bolt'],
    lockingPartIds: [
      'm82a1_bolt',
      'm82a1_barrel_extension',
      'm82a1_accelerator',
    ],
    extractorPartId: 'm82a1_bolt',
    fireControlPartIds: [
      'm82a1_firing_pin',
      'm82a1_striker',
      'm82a1_sear',
      'm82a1_trigger',
    ],
    magazinePartIds: [
      'm82a1_mag_body',
      'm82a1_mag_follower',
      'm82a1_mag_spring',
      'm82a1_mag_floorplate',
    ],
    magStripOffsetCm: [0, -5.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.73,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.83,
  },
  awm: {
    weaponId: 'awm',
    actionPartIds: ['awm_bolt_body', 'awm_bolt_shroud'],
    lockingPartIds: ['awm_bolt_body', 'awm_action_receiver', 'awm_barrel'],
    extractorPartId: 'awm_extractor',
    fireControlPartIds: ['awm_striker', 'awm_sear', 'awm_trigger_shoe'],
    magazinePartIds: [
      'awm_mag_body',
      'awm_mag_follower',
      'awm_mag_spring',
      'awm_mag_floorplate',
    ],
    magStripOffsetCm: [0, -4.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.82,
    doubleFeedF: 0.78,
    rackFullOpenF: 0.68,
    lightStrikeF: 0.18,
    outOfBatteryF: 0.92,
  },
  scar: {
    weaponId: 'scar',
    actionPartIds: ['scar_bolt_carrier', 'scar_bolt', 'scar_charging_handle'],
    lockingPartIds: ['scar_bolt', 'scar_barrel'],
    extractorPartId: 'scar_bolt',
    fireControlPartIds: [
      'scar_firing_pin',
      'scar_hammer',
      'scar_trigger',
      'scar_disconnector',
    ],
    magazinePartIds: [
      'scar_mag_body',
      'scar_mag_follower',
      'scar_mag_spring',
      'scar_mag_floorplate',
    ],
    magStripOffsetCm: [0, -4.5, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.12,
    outOfBatteryF: 0.81,
  },
  deagle: {
    weaponId: 'deagle',
    actionPartIds: ['deagle_slide', 'deagle_bolt'],
    lockingPartIds: ['deagle_bolt', 'deagle_cam_pin', 'deagle_barrel'],
    extractorPartId: 'deagle_extractor',
    fireControlPartIds: [
      'deagle_firing_pin',
      'deagle_hammer',
      'deagle_sear',
      'deagle_trigger',
    ],
    magazinePartIds: [
      'deagle_mag_body',
      'deagle_mag_follower',
      'deagle_mag_spring',
      'deagle_mag_baseplate',
    ],
    magStripOffsetCm: [-0.65, -4.1, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.12,
    outOfBatteryF: 0.81,
  },
  aug: {
    weaponId: 'aug',
    actionPartIds: ['aug_bolt_carrier', 'aug_bolt', 'aug_charging_handle'],
    lockingPartIds: ['aug_bolt', 'aug_barrel'],
    extractorPartId: 'aug_bolt',
    fireControlPartIds: ['aug_firing_pin', 'aug_hammer', 'aug_trigger'],
    magazinePartIds: [
      'aug_mag_body',
      'aug_mag_follower',
      'aug_mag_spring',
      'aug_mag_floorplate',
    ],
    magStripOffsetCm: [0, -4.4, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.13,
    outOfBatteryF: 0.81,
  },
  p320: {
    weaponId: 'p320',
    actionPartIds: ['p320_slide'],
    lockingPartIds: ['p320_barrel', 'p320_fcu_chassis'],
    extractorPartId: 'p320_extractor',
    fireControlPartIds: [
      'p320_striker',
      'p320_safety_lock',
      'p320_sear_group',
      'p320_trigger_shoe',
    ],
    magazinePartIds: [
      'p320_mag_body',
      'p320_mag_follower',
      'p320_mag_spring',
      'p320_mag_baseplate',
    ],
    magStripOffsetCm: [-0.65, -3.9, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.63,
    rackFullOpenF: 0.52,
    lightStrikeF: 0.14,
    outOfBatteryF: 0.81,
  },
  p90: {
    weaponId: 'p90',
    actionPartIds: ['p90_bolt', 'p90_charging_handles'],
    lockingPartIds: ['p90_bolt', 'p90_barrel'],
    extractorPartId: 'p90_bolt',
    fireControlPartIds: ['p90_firing_pin', 'p90_hammer', 'p90_trigger'],
    magazinePartIds: [
      'p90_mag_body',
      'p90_helical_ramp',
      'p90_mag_follower',
      'p90_mag_spring',
      'p90_mag_floorplate',
    ],
    // Top-mounted horizontal 50-rd magazine lifts UPWARD (+Y) during Type-3 clearing
    magStripOffsetCm: [0, 3.6, 0],
    // Bottom chute ejection (-Y)
    ejectionUpSign: -1,
    stovepipeF: 0.7,
    doubleFeedF: 0.62,
    rackFullOpenF: 0.5,
    lightStrikeF: 0.12,
    outOfBatteryF: 0.81,
  },
  lift33: {
    weaponId: 'lift33',
    actionPartIds: ['lift33_bowstring', 'lift33_d_loop', 'lift33_launcher_fork'],
    lockingPartIds: [
      'lift33_upper_cam',
      'lift33_lower_cam',
      'lift33_cam_axles',
      'lift33_yoke_cables',
    ],
    extractorPartId: 'lift33_arrow_shaft',
    fireControlPartIds: [
      'lift33_d_loop',
      'lift33_drop_away_rest',
      'lift33_launcher_fork',
    ],
    magazinePartIds: [
      'lift33_quiver_frame',
      'lift33_quiver_hood',
      'lift33_quiver_latch',
      'lift33_arrow_shaft',
    ],
    magStripOffsetCm: [0, 0, 5.2],
    ejectionUpSign: 1,
    stovepipeF: 0.44,
    doubleFeedF: 0.24,
    rackFullOpenF: 0.28,
    lightStrikeF: 0.29,
    outOfBatteryF: 0.16,
  },
  r500: {
    weaponId: 'r500',
    actionPartIds: [
      'r500_trigger_sled',
      'r500_bowstring',
      'r500_versadrive_screw',
    ],
    lockingPartIds: [
      'r500_string_latch',
      'r500_anti_dry_fire',
      'r500_left_cam',
      'r500_right_cam',
    ],
    extractorPartId: 'r500_carbon_bolt',
    fireControlPartIds: [
      'r500_trigger_sled',
      'r500_string_latch',
      'r500_anti_dry_fire',
      'r500_trigger_sear',
      'r500_safety_selector',
    ],
    magazinePartIds: [
      'r500_quiver_frame',
      'r500_retention_arm',
      'r500_carbon_bolt',
    ],
    magStripOffsetCm: [0, -1.6, 5.2],
    ejectionUpSign: 1,
    stovepipeF: 0.42,
    doubleFeedF: 0.28,
    rackFullOpenF: 0.24,
    lightStrikeF: 0.31,
    outOfBatteryF: 0.18,
  },
  python: {
    weaponId: 'python',
    actionPartIds: ['python_hammer', 'python_cylinder', 'python_hand'],
    lockingPartIds: ['python_cylinder_bolt', 'python_crane', 'python_barrel'],
    extractorPartId: 'python_extractor_star',
    fireControlPartIds: [
      'python_trigger',
      'python_hammer',
      'python_rebound_lever',
      'python_mainspring',
      'python_firing_pin',
    ],
    magazinePartIds: ['python_speedloader', 'python_extractor_rod'],
    magStripOffsetCm: [0, -4.2, -4.8],
    ejectionUpSign: 1,
    stovepipeF: 0.14,
    doubleFeedF: 0.09,
    rackFullOpenF: 0.16,
    lightStrikeF: 0.19,
    outOfBatteryF: 0.11,
  },
  benellim4: {
    weaponId: 'benellim4',
    actionPartIds: ['benellim4_bolt_carrier', 'benellim4_charging_handle'],
    lockingPartIds: ['benellim4_bolt_head', 'benellim4_cam_pin', 'benellim4_barrel'],
    extractorPartId: 'benellim4_bolt_head',
    fireControlPartIds: [
      'benellim4_trigger',
      'benellim4_hammer',
      'benellim4_firing_pin',
      'benellim4_safety_button',
    ],
    magazinePartIds: [
      'benellim4_shell_elevator',
      'benellim4_mag_follower',
      'benellim4_mag_spring',
    ],
    magStripOffsetCm: [0, -2.8, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.72,
    doubleFeedF: 0.68,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.095,
    outOfBatteryF: 0.865,
  },
  garand: {
    weaponId: 'garand',
    actionPartIds: ['garand_op_rod', 'garand_bolt'],
    lockingPartIds: ['garand_bolt', 'garand_barrel'],
    extractorPartId: 'garand_bolt',
    fireControlPartIds: [
      'garand_trigger',
      'garand_hammer',
      'garand_firing_pin',
      'garand_trigger_guard',
    ],
    magazinePartIds: [
      'garand_follower',
      'garand_follower_arm',
      'garand_enbloc_clip',
      'garand_clip_latch',
    ],
    magStripOffsetCm: [0, -3.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.71,
    doubleFeedF: 0.66,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.092,
    outOfBatteryF: 0.84,
  },
  m249: {
    weaponId: 'm249',
    actionPartIds: [
      'm249_piston_carrier',
      'm249_bolt',
      'm249_charging_handle',
    ],
    lockingPartIds: ['m249_bolt', 'm249_barrel'],
    extractorPartId: 'm249_bolt',
    fireControlPartIds: [
      'm249_firing_pin',
      'm249_open_bolt_sear',
      'm249_trigger',
      'm249_sear_spring',
    ],
    magazinePartIds: [
      'm249_m27_belt',
      'm249_ammo_box',
      'm249_feed_tray',
      'm249_feed_pawls',
    ],
    magStripOffsetCm: [0, -5.2, -3.5],
    ejectionUpSign: 1,
    stovepipeF: 0.44,
    doubleFeedF: 0.16,
    rackFullOpenF: 0.0,
    lightStrikeF: 0.215,
    outOfBatteryF: 0.18,
  },
  p08: {
    weaponId: 'p08',
    actionPartIds: [
      'p08_rear_toggle',
      'p08_front_toggle',
      'p08_breechblock',
    ],
    lockingPartIds: [
      'p08_front_toggle',
      'p08_rear_toggle',
      'p08_barrel_extension',
      'p08_barrel',
    ],
    extractorPartId: 'p08_extractor',
    fireControlPartIds: [
      'p08_striker',
      'p08_sear_bar',
      'p08_trigger_lever',
      'p08_trigger',
    ],
    magazinePartIds: [
      'p08_mag_body',
      'p08_mag_follower',
      'p08_mag_spring',
      'p08_mag_base',
    ],
    magStripOffsetCm: [-2.2, -4.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.66,
    doubleFeedF: 0.6,
    rackFullOpenF: 0.43,
    lightStrikeF: 0.11,
    outOfBatteryF: 0.78,
  },
  vector: {
    weaponId: 'vector',
    actionPartIds: [
      'vector_bolt',
      'vector_slider',
      'vector_charging_handle',
    ],
    lockingPartIds: ['vector_bolt', 'vector_slider', 'vector_barrel'],
    extractorPartId: 'vector_bolt',
    fireControlPartIds: [
      'vector_firing_pin',
      'vector_hammer',
      'vector_fcu_chassis',
      'vector_trigger',
    ],
    magazinePartIds: [
      'vector_mag_body',
      'vector_mag_follower',
      'vector_mag_spring',
      'vector_mag_baseplate',
    ],
    magStripOffsetCm: [-1.8, -4.4, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.72,
    doubleFeedF: 0.65,
    rackFullOpenF: 0.5,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.84,
  },
  g11: {
    weaponId: 'g11',
    actionPartIds: [
      'g11_rotary_breech',
      'g11_winding_knob',
      'g11_clockwork_gears',
      'g11_driving_rod',
    ],
    lockingPartIds: ['g11_rotary_breech', 'g11_inner_receiver', 'g11_barrel'],
    extractorPartId: 'g11_loading_rammer',
    fireControlPartIds: [
      'g11_firing_pin',
      'g11_trigger_pack',
      'g11_trigger',
      'g11_selector',
    ],
    magazinePartIds: [
      'g11_mag_tube',
      'g11_mag_follower',
      'g11_mag_spring',
      'g11_mag_endcap',
    ],
    magStripOffsetCm: [6.0, 4.2, 0],
    ejectionUpSign: -1,
    stovepipeF: 0.48,
    doubleFeedF: 0.44,
    rackFullOpenF: 0.46,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.68,
  },
  vss: {
    weaponId: 'vss',
    actionPartIds: ['vss_bolt_carrier', 'vss_bolt'],
    lockingPartIds: ['vss_bolt', 'vss_receiver', 'vss_barrel'],
    extractorPartId: 'vss_bolt',
    fireControlPartIds: [
      'vss_striker',
      'vss_striker_spring',
      'vss_sear',
      'vss_trigger',
      'vss_firing_pin',
    ],
    magazinePartIds: [
      'vss_mag_body',
      'vss_mag_follower',
      'vss_mag_spring',
      'vss_mag_floorplate',
    ],
    magStripOffsetCm: [0.4, -4.4, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.72,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.82,
  },
  m134: {
    weaponId: 'm134',
    actionPartIds: [
      'm134_rotor_assembly',
      'm134_drive_motor',
      'm134_bolt_1',
      'm134_bolt_2',
    ],
    lockingPartIds: [
      'm134_bolt_1',
      'm134_cam_track_ring',
      'm134_safing_sector',
      'm134_barrel_cluster',
    ],
    extractorPartId: 'm134_bolt_1',
    fireControlPartIds: [
      'm134_drive_motor',
      'm134_drive_gear',
      'm134_clutch_spring',
      'm134_safing_sector',
      'm134_spade_grip',
    ],
    magazinePartIds: [
      'm134_ammo_chute',
      'm134_delinker_housing',
      'm134_delinker_sprocket',
      'm134_feeder_spring',
    ],
    magStripOffsetCm: [0, -4.6, -4.2],
    ejectionUpSign: -1,
    stovepipeF: 0.46,
    doubleFeedF: 0.56,
    rackFullOpenF: 0.45,
    lightStrikeF: 0.085,
    outOfBatteryF: 0.78,
  },
  an94: {
    weaponId: 'an94',
    actionPartIds: [
      'an94_bolt_carrier',
      'an94_bolt',
      'an94_pulley_wheel',
      'an94_feed_rammer',
    ],
    lockingPartIds: ['an94_bolt', 'an94_inner_receiver', 'an94_barrel'],
    extractorPartId: 'an94_bolt',
    fireControlPartIds: [
      'an94_firing_pin',
      'an94_hammer',
      'an94_trigger',
      'an94_fire_selector',
    ],
    magazinePartIds: [
      'an94_mag_body',
      'an94_mag_follower',
      'an94_mag_spring',
      'an94_mag_floorplate',
    ],
    magStripOffsetCm: [1.4, -4.6, 1.3],
    ejectionUpSign: 1,
    stovepipeF: 0.54,
    doubleFeedF: 0.46,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.65,
  },
  ztz99a: {
    weaponId: 'ztz99a',
    actionPartIds: [
      'ztz99a_breech_block',
      'ztz99a_main_gun',
      'ztz99a_rammer_chain',
      'ztz99a_loading_tray',
    ],
    lockingPartIds: [
      'ztz99a_breech_block',
      'ztz99a_main_gun',
      'ztz99a_gun_cradle',
    ],
    extractorPartId: 'ztz99a_stub_ejector',
    fireControlPartIds: [
      'ztz99a_breech_block',
      'ztz99a_optics_citv',
      'ztz99a_crew_stations',
    ],
    magazinePartIds: [
      'ztz99a_autoloader_carousel',
      'ztz99a_loading_tray',
      'ztz99a_rammer_chain',
      'ztz99a_rammer_spring',
    ],
    magStripOffsetCm: [-24, -46, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.48,
    doubleFeedF: 0.62,
    rackFullOpenF: 0.42,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.86,
  },
  m1a2: {
    weaponId: 'm1a2',
    actionPartIds: [
      'm1a2_breech_block',
      'm1a2_main_gun',
      'm1a2_blast_doors',
      'm1a2_ready_round',
    ],
    lockingPartIds: ['m1a2_breech_block', 'm1a2_main_gun', 'm1a2_gun_mantlet'],
    extractorPartId: 'm1a2_stub_deflector',
    fireControlPartIds: [
      'm1a2_breech_block',
      'm1a2_crows_optics',
      'm1a2_crew_stations',
    ],
    magazinePartIds: [
      'm1a2_ammo_bustle',
      'm1a2_blast_doors',
      'm1a2_door_spring',
      'm1a2_ready_round',
    ],
    magStripOffsetCm: [-58, 0, 0],
    ejectionUpSign: -1,
    stovepipeF: 0.46,
    doubleFeedF: 0.6,
    rackFullOpenF: 0.4,
    lightStrikeF: 0.08,
    outOfBatteryF: 0.85,
  },
  leopard2a7: {
    weaponId: 'leopard2a7',
    actionPartIds: [
      'leo_breech_block',
      'leo_main_gun',
      'leo_blast_door',
      'leo_ready_round',
    ],
    lockingPartIds: ['leo_breech_block', 'leo_main_gun', 'leo_gun_mantlet'],
    extractorPartId: 'leo_breech_block',
    fireControlPartIds: [
      'leo_breech_block',
      'leo_optics_peri',
      'leo_crew_stations',
    ],
    magazinePartIds: [
      'leo_ammo_bustle',
      'leo_blast_door',
      'leo_hull_ammo_rack',
      'leo_ready_round',
    ],
    magStripOffsetCm: [-62, 0, 0],
    ejectionUpSign: -1,
    stovepipeF: 0.46,
    doubleFeedF: 0.6,
    rackFullOpenF: 0.4,
    lightStrikeF: 0.08,
    outOfBatteryF: 0.84,
  },
  tiger1: {
    weaponId: 'tiger1',
    actionPartIds: [
      'tiger_breech_block',
      'tiger_main_gun',
      'tiger_recoil_cradle',
      'tiger_ready_round',
    ],
    lockingPartIds: [
      'tiger_breech_block',
      'tiger_main_gun',
      'tiger_gun_mantlet',
    ],
    extractorPartId: 'tiger_shell_guard',
    fireControlPartIds: [
      'tiger_breech_block',
      'tiger_optics_tzf9b',
      'tiger_crew_stations',
    ],
    magazinePartIds: [
      'tiger_ammo_racks',
      'tiger_ready_round',
      'tiger_shell_guard',
    ],
    magStripOffsetCm: [0, -34, 48],
    ejectionUpSign: -1,
    stovepipeF: 0.52,
    doubleFeedF: 0.66,
    rackFullOpenF: 0.46,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.86,
  },
  winchester1894: {
    weaponId: 'winchester1894',
    actionPartIds: ['win94_lever', 'win94_breech_bolt', 'win94_link'],
    lockingPartIds: ['win94_locking_bolt', 'win94_breech_bolt', 'win94_barrel'],
    extractorPartId: 'win94_breech_bolt',
    fireControlPartIds: [
      'win94_trigger',
      'win94_hammer',
      'win94_firing_pin',
      'win94_tang_safety',
    ],
    magazinePartIds: [
      'win94_mag_tube',
      'win94_mag_follower',
      'win94_mag_spring',
      'win94_carrier',
      'win94_loading_gate',
    ],
    magStripOffsetCm: [14, -7.2, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.54,
    doubleFeedF: 0.66,
    rackFullOpenF: 0.48,
    lightStrikeF: 0.1,
    outOfBatteryF: 0.86,
  },
  rem870: {
    weaponId: 'rem870',
    actionPartIds: ['rem870_forend', 'rem870_action_bars', 'rem870_breech_bolt'],
    lockingPartIds: ['rem870_locking_block', 'rem870_breech_bolt', 'rem870_barrel'],
    extractorPartId: 'rem870_breech_bolt',
    fireControlPartIds: [
      'rem870_trigger',
      'rem870_hammer',
      'rem870_firing_pin',
      'rem870_action_release',
    ],
    magazinePartIds: [
      'rem870_mag_tube',
      'rem870_mag_cap',
      'rem870_mag_follower',
      'rem870_shell_carrier',
    ],
    magStripOffsetCm: [16, -7.5, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.5,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.44,
    lightStrikeF: 0.095,
    outOfBatteryF: 0.88,
  },
  m1911: {
    weaponId: 'm1911',
    actionPartIds: ['m1911_slide', 'm1911_barrel', 'm1911_barrel_link'],
    lockingPartIds: ['m1911_barrel', 'm1911_barrel_link', 'm1911_slide'],
    extractorPartId: 'm1911_extractor',
    fireControlPartIds: [
      'm1911_hammer',
      'm1911_trigger',
      'm1911_sear_disconnector',
      'm1911_grip_safety',
      'm1911_firing_pin',
    ],
    magazinePartIds: ['m1911_mag_body', 'm1911_mag_follower', 'm1911_mag_spring'],
    magStripOffsetCm: [-2.4, -7.8, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.56,
    doubleFeedF: 0.65,
    rackFullOpenF: 0.57,
    lightStrikeF: 0.145,
    outOfBatteryF: 0.81,
  },
  mg42: {
    weaponId: 'mg42',
    actionPartIds: ['mg42_charging_handle', 'mg42_bolt_carrier', 'mg42_bolt_head'],
    lockingPartIds: [
      'mg42_locking_rollers',
      'mg42_locking_roller_left',
      'mg42_locking_wedge',
      'mg42_barrel',
    ],
    extractorPartId: 'mg42_bolt_head',
    fireControlPartIds: ['mg42_trigger', 'mg42_sear', 'mg42_locking_wedge'],
    magazinePartIds: [
      'mg42_top_cover',
      'mg42_ammo_drum',
      'mg42_ammo_belt',
      'mg42_feed_tray',
      'mg42_feed_pawl',
    ],
    magStripOffsetCm: [0, -6.5, -9.5],
    ejectionUpSign: -1,
    stovepipeF: 0.52,
    doubleFeedF: 0.64,
    rackFullOpenF: 0.6,
    lightStrikeF: 0.21,
    outOfBatteryF: 0.16,
  },
  k98k: {
    weaponId: 'k98k',
    actionPartIds: ['k98k_bolt_body', 'k98k_claw_extractor', 'k98k_bolt_shroud'],
    lockingPartIds: ['k98k_bolt_body', 'k98k_receiver', 'k98k_barrel'],
    extractorPartId: 'k98k_claw_extractor',
    fireControlPartIds: [
      'k98k_trigger',
      'k98k_sear',
      'k98k_firing_pin',
      'k98k_flag_safety',
    ],
    magazinePartIds: [
      'k98k_trigger_guard',
      'k98k_mag_floorplate',
      'k98k_mag_follower',
      'k98k_mag_spring',
      'k98k_stripper_clip',
    ],
    magStripOffsetCm: [0, -7.5, 0],
    ejectionUpSign: 1,
    stovepipeF: 0.62,
    doubleFeedF: 0.72,
    rackFullOpenF: 0.58,
    lightStrikeF: 0.125,
    outOfBatteryF: 0.91,
  },
  thompson: {
    weaponId: 'thompson',
    actionPartIds: ['thompson_actuator', 'thompson_bolt', 'thompson_blish_lock'],
    lockingPartIds: ['thompson_blish_lock', 'thompson_bolt', 'thompson_barrel'],
    extractorPartId: 'thompson_bolt',
    fireControlPartIds: ['thompson_trigger', 'thompson_sear', 'thompson_hammer_pin'],
    magazinePartIds: [
      'thompson_drum_mag',
      'thompson_drum_rotor',
      'thompson_drum_rounds',
    ],
    magStripOffsetCm: [0, -8.5, -7.2],
    ejectionUpSign: 1,
    stovepipeF: 0.54,
    doubleFeedF: 0.66,
    rackFullOpenF: 0.62,
    lightStrikeF: 0.23,
    outOfBatteryF: 0.18,
  },
  gau8: {
    weaponId: 'gau8',
    actionPartIds: [
      'gau8_rotor_core',
      'gau8_bolt_1',
      'gau8_bolt_2',
      'gau8_bolt_3',
      'gau8_bolt_4',
      'gau8_bolt_5',
      'gau8_bolt_6',
      'gau8_bolt_7',
    ],
    lockingPartIds: ['gau8_cam_track', 'gau8_bolt_1', 'gau8_barrel_cluster'],
    extractorPartId: 'gau8_bolt_3',
    fireControlPartIds: [
      'gau8_hydraulic_motors',
      'gau8_transfer_unit',
      'gau8_striker_spring',
    ],
    magazinePartIds: ['gau8_ammo_drum', 'gau8_chute_feed', 'gau8_chute_return'],
    magStripOffsetCm: [-46.0, 0.0, 0.0],
    ejectionUpSign: -1,
    stovepipeF: 0.44,
    doubleFeedF: 0.62,
    rackFullOpenF: 0.56,
    lightStrikeF: 0.09,
    outOfBatteryF: 0.89,
  },
  ...buildCentennialMalfunctionProfiles(),
};

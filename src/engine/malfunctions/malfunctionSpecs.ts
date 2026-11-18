import type { WeaponId } from '../../weapons/types';

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
  return weaponId === 'lift33' || weaponId === 'r500';
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
};

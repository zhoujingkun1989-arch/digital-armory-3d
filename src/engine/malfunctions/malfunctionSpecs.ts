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
  weaponId: WeaponId | 'lift33' | 'r500';
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

export function getMalfunctionScenario(
  kind: MalfunctionKind,
  weaponId?: WeaponId | string
): MalfunctionScenarioSpec {
  if (isArcheryMalfunctionWeapon(weaponId)) {
    return ARCHERY_MALFUNCTION_SCENARIOS[kind];
  }
  return MALFUNCTION_SCENARIOS[kind];
}

export const WEAPON_MALFUNCTION_PROFILES: Readonly<
  Record<WeaponId | 'lift33' | 'r500', WeaponMalfunctionProfile>
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
};

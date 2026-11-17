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
};

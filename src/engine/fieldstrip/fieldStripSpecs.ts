import { buildCentennialFieldStripPlans } from '../../weapons/expansion/centennialProjectors';
import type { WeaponId } from '../../weapons/types';

/**
 * WP-07 — Guided Hands-On Military Field-Strip Specifications (11 Weapons)
 * ------------------------------------------------------------------------
 * Defines authentic military armorer field-strip Directed Acyclic Graphs (DAGs)
 * for all 11 firearms in Digital Armory 3D. Each step binds directly to verified
 * collision-free `explodeSteps` indices on `WeaponPartSpec`, guaranteeing C¹-smooth
 * multi-segment trajectories during both disassembly (`0 → 1`) and reverse-order
 * reassembly (`1 → 0`), with zero external mesh assets.
 */

export interface FieldStripPartMotionBinding {
  partId: string;
  /** Sequential indices into `part.explodeSteps` driven across [0..1] by this step */
  explodeStepIndices: readonly number[];
}

export interface FieldStripStepSpec {
  id: string;
  orderLabel: string;
  titleZh: string;
  titleEn: string;
  actionHintZh: string;
  actionHintEn: string;
  /** Step IDs that must be stripped BEFORE this step can be stripped */
  requires: readonly string[];
  /** Shown when attempting to strip this step while any `requires` step is still assembled */
  stripBlockedNoteZh: string;
  stripBlockedNoteEn: string;
  /** Shown when attempting to reassemble a prerequisite while this dependent step is still stripped */
  reassembleBlockedNoteZh: string;
  reassembleBlockedNoteEn: string;
  /** Primary clickable part IDs that directly trigger this step and pulse on hints */
  triggerPartIds: readonly string[];
  /** Exact `explodeSteps` bindings moved by this step's [0..1] progress */
  bindings: readonly FieldStripPartMotionBinding[];
}

export interface FieldStripWeaponPlan {
  weaponId: WeaponId;
  manualCodeZh: string;
  manualCodeEn: string;
  steps: readonly FieldStripStepSpec[];
}

function bind(
  partId: string,
  ...explodeStepIndices: number[]
): FieldStripPartMotionBinding {
  return { partId, explodeStepIndices };
}

export const FIELD_STRIP_PLANS: Readonly<
  Record<WeaponId, FieldStripWeaponPlan>
> = {
  // ===========================================================================
  // 1. Kalashnikov AK-15M1 (7.62×39mm) — 6-Step Russian Service Field Strip
  // ===========================================================================
  ak15: {
    weaponId: 'ak15',
    manualCodeZh: '俄军勤务教范 · 六步野战快拆',
    manualCodeEn: 'Russian Service Manual · 6-Step Field Strip',
    steps: [
      {
        id: 'ak_strip_mag',
        orderLabel: '01',
        titleZh: '卸下 30 发观察窗弧形弹匣',
        titleEn: 'Detach 30-Round Windowed Magazine',
        actionHintZh: '点击弹匣体或底板，前压卡笋向前下方旋出弧形弹匣。',
        actionHintEn:
          'Click the magazine body to rock it forward and clear the receiver well.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '弹匣抱弹口会顶住枪机下突笋，必须先装回枪机框总成再挂入弹匣。',
        reassembleBlockedNoteEn:
          'Magazine feed lips obstruct the bolt lugs; reinstall the bolt carrier group before seating the magazine.',
        triggerPartIds: ['ak_mag_body', 'ak_mag_floorplate'],
        bindings: [
          bind('ak_mag_body', 0),
          bind('ak_mag_follower', 0),
          bind('ak_mag_spring', 0),
          bind('ak_mag_floorplate', 0),
        ],
      },
      {
        id: 'ak_strip_cover',
        orderLabel: '02',
        titleZh: '拔销掀开皮卡汀尼导轨机匣盖',
        titleEn: 'Hinge & Lift Picatinny Dust Cover',
        actionHintZh: '点击顶部导轨机匣盖或觇孔照门，解脱尾部横销向上掀开。',
        actionHintEn:
          'Click the railed dust cover or rear sight to unlatch and lift it clear.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '机匣盖必须在枪机框与复进簧全部装回机匣导轨后最后扣合闭锁。',
        reassembleBlockedNoteEn:
          'Close the railed dust cover last—only after the bolt carrier and recoil spring are seated inside the receiver.',
        triggerPartIds: ['ak_dust_cover', 'ak_rear_sight'],
        bindings: [bind('ak_dust_cover', 0), bind('ak_rear_sight', 0)],
      },
      {
        id: 'ak_strip_recoil',
        orderLabel: '03',
        titleZh: '前推尾座抽出伸缩复进簧组件',
        titleEn: 'Withdraw Telescoping Recoil Spring',
        actionHintZh:
          '点击复进簧或导杆尾座，前推脱离机匣尾榫槽后向上取出复进簧组。',
        actionHintEn:
          'Click the recoil spring or guide rod to unseat its heel from the rear trunnion.',
        requires: ['ak_strip_cover'],
        stripBlockedNoteZh:
          '导轨机匣盖正锁死在复进簧尾座上方，必须先掀开机匣盖才能取出复进簧！',
        stripBlockedNoteEn:
          'The railed dust cover encloses the recoil spring assembly—open the dust cover first!',
        reassembleBlockedNoteZh:
          '复进簧导杆前端需插入枪机框空心长孔，必须先将枪机框装入机匣再装复进簧。',
        reassembleBlockedNoteEn:
          'The recoil guide rod seats inside the bolt carrier channel—reinstall the bolt carrier before the recoil spring.',
        triggerPartIds: ['ak_recoil_spring', 'ak_recoil_guide'],
        bindings: [bind('ak_recoil_guide', 0), bind('ak_recoil_spring', 0)],
      },
      {
        id: 'ak_strip_bcg',
        orderLabel: '04',
        titleZh: '后拉到底提出长行程活塞枪机框组',
        titleEn: 'Extract Bolt Carrier & Long-Stroke Piston',
        actionHintZh:
          '点击枪机框，沿机匣导轨拉至尾部缺口并向上提出活塞与枪机总成。',
        actionHintEn:
          'Click the bolt carrier to slide it to the rear rail cutouts and lift it clear.',
        requires: ['ak_strip_mag', 'ak_strip_cover', 'ak_strip_recoil'],
        stripBlockedNoteZh:
          '抽出枪机框前必须先卸下弹匣、掀开机匣盖并取出复进簧尾座，否则后退行程受阻！',
        stripBlockedNoteEn:
          'Remove the magazine, dust cover, and recoil spring assembly before withdrawing the bolt carrier group!',
        reassembleBlockedNoteZh:
          '必须先将双突笋枪机旋入枪机框且装妥导气管，才能把枪机框总成推回机匣。',
        reassembleBlockedNoteEn:
          'Cam the rotating bolt back into the carrier and seat the gas tube before inserting the carrier into the receiver.',
        triggerPartIds: ['ak_bolt_carrier'],
        bindings: [
          bind('ak_bolt_carrier', 0, 1),
          bind('ak_bolt', 0, 1),
          bind('ak_firing_pin', 0, 1),
          bind('ak_extractor', 0, 1),
        ],
      },
      {
        id: 'ak_strip_bolt',
        orderLabel: '05',
        titleZh: '回转 35° 从凸轮槽分离双突笋枪机',
        titleEn: 'Rotate 35° & Separate 2-Lug Bolt',
        actionHintZh:
          '点击双突笋枪机或击针，向后退至螺旋槽底旋转 35° 向前抽出枪机。',
        actionHintEn:
          'Click the 2-lug bolt to cam its lug out of the carrier helical track and slide forward.',
        requires: ['ak_strip_bcg'],
        stripBlockedNoteZh:
          '双突笋枪机被闭锁在机匣节套与枪机框导槽内，必须先抽出枪机框总成！',
        stripBlockedNoteEn:
          'The rotating bolt is captured inside the receiver rails and carrier—extract the bolt carrier group first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['ak_bolt', 'ak_firing_pin', 'ak_extractor'],
        bindings: [
          bind('ak_bolt_carrier', 2),
          bind('ak_bolt', 2),
          bind('ak_firing_pin', 2),
          bind('ak_extractor', 2),
        ],
      },
      {
        id: 'ak_strip_gas_tube',
        orderLabel: '06',
        titleZh: '扳开锁扣取下导气管与浮置上护木',
        titleEn: 'Release & Lift Gas Tube & Upper Handguard',
        actionHintZh: '点击导气管或上护木，待长行程活塞退出导气室后向上取下。',
        actionHintEn:
          'Click the gas tube or upper handguard once the piston has cleared the gas block.',
        requires: ['ak_strip_bcg'],
        stripBlockedNoteZh:
          '长行程导气活塞仍深入导气管内腔，必须先抽出枪机框连同活塞后才能取下导气管！',
        stripBlockedNoteEn:
          'The long-stroke gas piston sits inside the gas tube—withdraw the bolt carrier group before removing the gas tube!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['ak_gas_tube', 'ak_upper_handguard'],
        bindings: [bind('ak_upper_handguard', 0), bind('ak_gas_tube', 0)],
      },
    ],
  },

  // ===========================================================================
  // 2. Colt M4A1 Carbine (5.56×45mm) — US Army TM 9-1005-319-10 6-Step Strip
  // ===========================================================================
  m4a1: {
    weaponId: 'm4a1',
    manualCodeZh: '美军 TM 9-1005-319-10 · 六步勤务分解',
    manualCodeEn: 'US Army TM 9-1005-319-10 · 6-Step Field Strip',
    steps: [
      {
        id: 'm4_strip_mag',
        orderLabel: '01',
        titleZh: '按压右侧释放钮卸下 STANAG 弹匣',
        titleEn: 'Drop 30-Round STANAG Magazine',
        actionHintZh: '点击铝制弹匣体或底板，垂直退出 30 发双排弹匣。',
        actionHintEn:
          'Click the STANAG magazine body to release it straight out of the lower magwell.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '清枪合拢规程要求先闭合上下机匣完成验枪，最后再插入实弹匣。',
        reassembleBlockedNoteEn:
          'Close and lock the upper and lower receivers before inserting the magazine.',
        triggerPartIds: ['m4a1_mag_body', 'm4a1_mag_floorplate'],
        bindings: [
          bind('m4a1_mag_body', 0),
          bind('m4a1_mag_follower', 0),
          bind('m4a1_mag_spring', 0),
          bind('m4a1_mag_floorplate', 0),
        ],
      },
      {
        id: 'm4_strip_upper',
        orderLabel: '02',
        titleZh: '推出前后结合销分离上机匣总成',
        titleEn: 'Push Takedown Pins & Separate Upper Receiver',
        actionHintZh: '点击上机匣、提把或枪管，推出结合销分离上下机匣。',
        actionHintEn:
          'Click the upper receiver, carry handle, or barrel to separate the upper group from the lower.',
        requires: ['m4_strip_mag'],
        stripBlockedNoteZh:
          '分解上下机匣前必须先卸下弹匣完成清枪安全确认！',
        stripBlockedNoteEn:
          'Always drop the magazine to clear the weapon before pushing the receiver takedown pins!',
        reassembleBlockedNoteZh:
          '闭合上下机匣前，必须先将枪机框/拉机柄推入上机匣、装回缓冲器及护木。',
        reassembleBlockedNoteEn:
          'Reinstall the BCG/charging handle, buffer assembly, and RAS handguards before mating the receivers.',
        triggerPartIds: [
          'm4a1_upper_receiver',
          'm4a1_carry_handle',
          'm4a1_barrel',
        ],
        bindings: [
          bind('m4a1_upper_receiver', 0),
          bind('m4a1_carry_handle', 0),
          bind('m4a1_charging_handle', 0),
          bind('m4a1_dust_cover', 0),
          bind('m4a1_bolt_carrier', 0),
          bind('m4a1_bolt', 0),
          bind('m4a1_firing_pin', 0),
          bind('m4a1_gas_tube', 0),
          bind('m4a1_ras_upper', 0),
          bind('m4a1_ras_lower', 0),
          bind('m4a1_barrel', 0),
          bind('m4a1_flash_hider', 0),
          bind('m4a1_front_sight_base', 0),
        ],
      },
      {
        id: 'm4_strip_bcg',
        orderLabel: '03',
        titleZh: '后拉 T 形拉机柄抽出气吹枪机框总成',
        titleEn: 'Withdraw BCG & T-Charging Handle',
        actionHintZh: '点击磷化枪机框或 T 形拉机柄，从上机匣尾口向后平拉抽出。',
        actionHintEn:
          'Click the bolt carrier or T-charging handle to slide both rearward out of the upper receiver.',
        requires: ['m4_strip_upper'],
        stripBlockedNoteZh:
          '下机匣缓冲管尾座封堵在上机匣后方，必须先分离上下机匣才能向后抽出枪机框！',
        stripBlockedNoteEn:
          'The lower receiver buffer tower blocks the rear of the upper—separate the upper receiver first!',
        reassembleBlockedNoteZh:
          '必须先将七突笋枪机与击针装回枪机框，才能把枪机框推入上机匣。',
        reassembleBlockedNoteEn:
          'Reassemble the 7-lug bolt and firing pin into the carrier before sliding the BCG into the upper.',
        triggerPartIds: ['m4a1_bolt_carrier', 'm4a1_charging_handle'],
        bindings: [
          bind('m4a1_charging_handle', 1),
          bind('m4a1_bolt_carrier', 1),
          bind('m4a1_bolt', 1),
          bind('m4a1_firing_pin', 1),
        ],
      },
      {
        id: 'm4_strip_bolt',
        orderLabel: '04',
        titleZh: '拔出开口销与凸轮销分离七突笋枪机',
        titleEn: 'Pull Firing Pin & Extract 7-Lug Bolt',
        actionHintZh: '点击七突笋枪机或镀铬击针，拔销抽出击针并向前拔出枪机。',
        actionHintEn:
          'Click the 7-lug bolt or firing pin to drop the firing pin and slide the bolt out of the carrier.',
        requires: ['m4_strip_bcg'],
        stripBlockedNoteZh:
          '凸轮销与击针闭锁销位于上机匣内腔，必须先从上机匣抽出枪机框总成！',
        stripBlockedNoteEn:
          'The cam pin and firing pin retaining pin are enclosed inside the upper—withdraw the BCG first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m4a1_bolt', 'm4a1_firing_pin'],
        bindings: [bind('m4a1_bolt', 2), bind('m4a1_firing_pin', 2)],
      },
      {
        id: 'm4_strip_buffer',
        orderLabel: '05',
        titleZh: '压下缓冲定位销取出 H2 缓冲器与缓冲簧',
        titleEn: 'Depress Retainer & Extract H2 Buffer',
        actionHintZh: '点击 H2 重型缓冲器或缓冲复进簧，从下机匣尾管内向前取出。',
        actionHintEn:
          'Click the H2 buffer or action spring to depress the buffer retainer and slide them out.',
        requires: ['m4_strip_upper'],
        stripBlockedNoteZh:
          '合拢态下枪机框尾部正顶住缓冲器面，必须先分离上机匣才能弹出缓冲器！',
        stripBlockedNoteEn:
          'The bolt carrier tail presses against the buffer face when closed—separate the upper receiver first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m4a1_buffer', 'm4a1_buffer_spring'],
        bindings: [bind('m4a1_buffer', 0), bind('m4a1_buffer_spring', 0)],
      },
      {
        id: 'm4_strip_ras',
        orderLabel: '06',
        titleZh: '压下三角环取下 KAC RAS 上下导轨护木',
        titleEn: 'Pull Delta Ring & Remove KAC RAS Rails',
        actionHintZh: '点击上下四面导轨护木，后压星形环解脱隔热护木。',
        actionHintEn:
          'Click the upper or lower KAC M4 RAS handguard to retract the delta ring and lift the rails.',
        requires: ['m4_strip_upper'],
        stripBlockedNoteZh:
          '请先分离上下机匣确保空仓安全后，再拆卸导轨护木检视不锈钢气吹管。',
        stripBlockedNoteEn:
          'Separate the upper receiver assembly first before stripping the KAC RAS handguard halves.',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m4a1_ras_upper', 'm4a1_ras_lower'],
        bindings: [bind('m4a1_ras_upper', 1), bind('m4a1_ras_lower', 1)],
      },
    ],
  },

  // ===========================================================================
  // 3. HK MP5A3 (9×19mm) — Oberndorf Roller-Delayed 6-Step Armorer Strip
  // ===========================================================================
  mp5: {
    weaponId: 'mp5',
    manualCodeZh: 'HK 奥伯多夫教范 · 滚柱延迟六步快拆',
    manualCodeEn: 'HK Oberndorf Manual · 6-Step Roller-Delayed Strip',
    steps: [
      {
        id: 'mp5_strip_mag',
        orderLabel: '01',
        titleZh: '前推桨式卡笋卸下 30 发弯弧钢弹匣',
        titleEn: 'Paddle-Release 30-Round Curved Magazine',
        actionHintZh: '点击 9mm 弯弧冲压钢弹匣，解除弹匣井锁定向下拔出。',
        actionHintEn:
          'Click the curved 30-round steel magazine to drop it from the fluted upper magwell.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须先装回滚柱枪机、握把座与伸缩枪托尾盖，最后再插入弯弹匣。',
        reassembleBlockedNoteEn:
          'Reassemble the bolt group, grip housing, and A3 stock endcap before seating the magazine.',
        triggerPartIds: ['mp5_mag_body', 'mp5_mag_floorplate'],
        bindings: [
          bind('mp5_mag_body', 0),
          bind('mp5_mag_follower', 0),
          bind('mp5_mag_spring', 0),
          bind('mp5_mag_floorplate', 0),
        ],
      },
      {
        id: 'mp5_strip_stock',
        orderLabel: '02',
        titleZh: '拔出后横销卸下 A3 双轨伸缩托与缓冲尾盖',
        titleEn: 'Pull Rear Pin & Slide Off A3 Stock Endcap',
        actionHintZh: '点击 A3 伸缩钢托或 H 缓冲尾盖，向后拔脱上机匣尾口。',
        actionHintEn:
          'Click the A3 retractable buttstock or buffered endcap to pull it off the rear receiver.',
        requires: ['mp5_strip_mag'],
        stripBlockedNoteZh:
          '勤务分解前必须先卸下 30 发弯弹匣确保弹膛无供弹！',
        stripBlockedNoteEn:
          'Drop the curved magazine first before pulling the rear receiver takedown pin!',
        reassembleBlockedNoteZh:
          'A3 缓冲尾盖封闭上机匣后端口并压住握把座尾耳，必须先装回枪机框与握把座！',
        reassembleBlockedNoteEn:
          'The A3 endcap seals the receiver rear and captures the grip housing tang—reinstall the BCG and lower first!',
        triggerPartIds: ['mp5_buttstock', 'mp5_stock_endcap'],
        bindings: [bind('mp5_buttstock', 0), bind('mp5_stock_endcap', 0)],
      },
      {
        id: 'mp5_strip_lower',
        orderLabel: '03',
        titleZh: '向下摆出海军版子弹图标握把座与火控盒',
        titleEn: 'Swing Down Navy Grip Housing & Trigger Pack',
        actionHintZh:
          '点击聚合物握把座或扳机，绕前卡耳向下分离抽屉式火控总成。',
        actionHintEn:
          'Click the Navy pictogram grip housing or trigger to pivot the lower fire-control group free.',
        requires: ['mp5_strip_stock'],
        stripBlockedNoteZh:
          'A3 枪托尾盖套箍正套在握把座后连接耳外侧，必须先卸下尾盖与伸缩托！',
        stripBlockedNoteEn:
          'The A3 stock endcap sleeve captures the rear tang of the grip housing—remove the stock endcap first!',
        reassembleBlockedNoteZh:
          '握把座内的长杠杆抛壳挺与击锤伸入枪机轨道，必须先将滚柱枪机框推入上机匣再扣合握把座。',
        reassembleBlockedNoteEn:
          'The ejector lever and hammer protrude into the bolt track—slide the bolt group into the upper before attaching the grip housing.',
        triggerPartIds: ['mp5_grip_housing', 'mp5_trigger_pack', 'mp5_trigger'],
        bindings: [
          bind('mp5_grip_housing', 0),
          bind('mp5_trigger_pack', 0),
          bind('mp5_hammer', 0),
          bind('mp5_trigger', 0),
          bind('mp5_selector', 0),
        ],
      },
      {
        id: 'mp5_strip_bcg',
        orderLabel: '04',
        titleZh: '从上机匣尾端抽出滚柱枪机框与复进簧组',
        titleEn: 'Withdraw Roller-Delayed Bolt Group & Recoil Rod',
        actionHintZh:
          '点击重型滚柱枪机框或复进簧，从敞开的上机匣尾部向后平拉抽出。',
        actionHintEn:
          'Click the bolt carrier or recoil spring to withdraw the complete operating group out the rear.',
        requires: ['mp5_strip_stock', 'mp5_strip_lower'],
        stripBlockedNoteZh:
          '必须先卸下 A3 缓冲尾盖并摆开下握把火控座（避让击锤与抛壳挺），才能从机匣尾部抽出枪机框！',
        stripBlockedNoteEn:
          'Remove the A3 stock endcap and swing down the Navy grip housing so the hammer and ejector clear the bolt carrier!',
        reassembleBlockedNoteZh:
          '必须先将机头、左右 Ø8mm 滚柱、45° 闭锁楔与击针装回枪机框，才能整体推入机匣。',
        reassembleBlockedNoteEn:
          'Lock the bolt head, twin 8mm rollers, 45° locking piece, and firing pin onto the carrier before inserting it.',
        triggerPartIds: [
          'mp5_bolt_carrier',
          'mp5_recoil_spring',
          'mp5_recoil_rod',
        ],
        bindings: [
          bind('mp5_bolt_carrier', 0),
          bind('mp5_bolt_head', 0),
          bind('mp5_locking_rollers', 0),
          bind('mp5_locking_roller_left', 0),
          bind('mp5_locking_piece', 0),
          bind('mp5_firing_pin', 0),
          bind('mp5_recoil_rod', 0),
          bind('mp5_recoil_spring', 0),
        ],
      },
      {
        id: 'mp5_strip_rollers',
        orderLabel: '05',
        titleZh: '旋转机头 90° 分解双闭锁滚柱与 45° 楔铁',
        titleEn: 'Twist Bolt Head 90° & Separate Rollers / Wedge',
        actionHintZh:
          '点击机头、闭锁滚柱或 45° 闭锁楔铁，解脱卡口展开 1:4 延迟闭锁核心。',
        actionHintEn:
          'Click the bolt head, Ø8mm rollers, or 45° locking piece to Twist-unlock them from the carrier.',
        requires: ['mp5_strip_bcg'],
        stripBlockedNoteZh:
          '滚柱机头位于冲压上机匣闭锁节套内部，必须先从机匣尾部抽出枪机框总成！',
        stripBlockedNoteEn:
          'The roller bolt head is enclosed inside the trunnion—withdraw the bolt carrier group from the upper first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'mp5_bolt_head',
          'mp5_locking_rollers',
          'mp5_locking_roller_left',
          'mp5_locking_piece',
          'mp5_firing_pin',
        ],
        bindings: [
          bind('mp5_bolt_carrier', 1),
          bind('mp5_bolt_head', 1),
          bind('mp5_locking_rollers', 1),
          bind('mp5_locking_roller_left', 1),
          bind('mp5_locking_piece', 1),
          bind('mp5_firing_pin', 1),
        ],
      },
      {
        id: 'mp5_strip_forearm',
        orderLabel: '06',
        titleZh: '拔出准星座前横销取下热带加宽隔热护木',
        titleEn: 'Pull Front Pin & Detach Wide Tropical Forearm',
        actionHintZh: '点击前部聚合物宽护木，拔出单枚横插锁销向下脱钩取下。',
        actionHintEn:
          'Click the wide tropical polymer forearm to pull its front cross-pin and unhook it.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['mp5_forearm'],
        bindings: [bind('mp5_forearm', 0)],
      },
    ],
  },

  // ===========================================================================
  // 4. Glock 17 Gen5 (9×19mm) — Austrian Armorer 5-Step Field & Striker Strip
  // ===========================================================================
  g17: {
    weaponId: 'g17',
    manualCodeZh: 'Glock 军械师规范 · 五大件与击针快拆',
    manualCodeEn: 'Glock Armorer Manual · 5-Step Field & Striker Strip',
    steps: [
      {
        id: 'g17_strip_mag',
        orderLabel: '01',
        titleZh: '按下方形卡笋退出 17 发双排弹匣',
        titleEn: 'Drop 17-Round Double-Stack Magazine',
        actionHintZh: '点击握把弹匣体或底板，沿 20° 握把倾角向下滑出弹匣。',
        actionHintEn:
          'Click the magazine body or baseplate to drop it clear of the polymer grip frame.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          'Glock 安全复装规程要求先将套筒总成滑回下机匣导轨闭锁，最后再插入弹匣。',
        reassembleBlockedNoteEn:
          'Slide the complete upper assembly back onto the frame rails and lock before inserting the magazine.',
        triggerPartIds: ['mag_body', 'mag_base_plate', 'magazine_catch'],
        bindings: [
          bind('mag_body', 0, 1),
          bind('mag_follower', 0, 1),
          bind('mag_spring', 0, 1),
          bind('mag_base_plate', 0, 1),
        ],
      },
      {
        id: 'g17_strip_slide',
        orderLabel: '02',
        titleZh: '双侧下拉分解锁片向前推下套筒总成',
        titleEn: 'Pull Down Slide Lock & Slide Off Upper Group',
        actionHintZh:
          '点击套筒或分解锁片，释放十字尾阻铁后将套筒总成沿导轨向前滑出。',
        actionHintEn:
          'Click the slide or slide-lock tabs to release sear engagement and slide the upper assembly forward.',
        requires: ['g17_strip_mag'],
        stripBlockedNoteZh:
          '严禁带弹匣分解 Glock 套筒！必须先退出弹匣确保空膛，再下拉分解锁片推下套筒！',
        stripBlockedNoteEn:
          'Never strip a Glock with a seated magazine! Drop the magazine first before pulling down the slide lock!',
        reassembleBlockedNoteZh:
          '必须先将枪管放入套筒抛壳窗、装妥复进簧导杆及击针尾盖后，才能将套筒装回下机匣。',
        reassembleBlockedNoteEn:
          'Seat the barrel, recoil spring assembly, and striker group inside the slide before sliding onto the frame.',
        triggerPartIds: ['slide', 'slide_lock', 'front_sight', 'rear_sight'],
        bindings: [
          bind('slide', 0, 1),
          bind('front_sight', 0, 1),
          bind('rear_sight', 0, 1),
          bind('barrel', 0, 1),
          bind('recoil_guide_rod', 0, 1),
          bind('recoil_spring', 0, 1),
          bind('slide_cover_plate', 0, 1),
          bind('striker', 0, 1),
          bind('striker_spring', 0, 1),
          bind('firing_pin_safety', 0, 1),
          bind('extractor', 0, 1),
          bind('extractor_plunger', 0, 1),
        ],
      },
      {
        id: 'g17_strip_recoil',
        orderLabel: '03',
        titleZh: '微压导杆底缘取下捕获式复进簧总成',
        titleEn: 'Compress & Lift Captive Recoil Spring Assembly',
        actionHintZh:
          '点击复进簧或导杆，微微前压脱离枪管下闭锁半月槽后向上提出。',
        actionHintEn:
          'Click the recoil spring or guide rod to unseat it from the barrel lug notch and lift clear.',
        requires: ['g17_strip_slide'],
        stripBlockedNoteZh:
          '复进簧总成被封闭在套筒前下腔与下机匣防尘盖之间，必须先推下套筒总成！',
        stripBlockedNoteEn:
          'The recoil spring is enclosed inside the dust cover and slide tunnel—remove the slide assembly first!',
        reassembleBlockedNoteZh:
          '复进簧导杆后端必须卡在枪管下闭锁凸耳凹槽上，请先将枪管装回套筒再装复进簧！',
        reassembleBlockedNoteEn:
          'The recoil guide rod rests on the barrel underlug step—drop the barrel into the slide before the recoil spring!',
        triggerPartIds: ['recoil_guide_rod', 'recoil_spring'],
        bindings: [
          bind('recoil_guide_rod', 2),
          bind('recoil_spring', 2),
          bind('slide', 2),
          bind('front_sight', 2),
          bind('rear_sight', 2),
          bind('slide_cover_plate', 2),
          bind('striker', 2),
          bind('striker_spring', 2),
          bind('firing_pin_safety', 2),
          bind('extractor', 2),
          bind('extractor_plunger', 2),
        ],
      },
      {
        id: 'g17_strip_barrel',
        orderLabel: '04',
        titleZh: '前推下倾从套筒内提出多边形膛线枪管',
        titleEn: 'Tilt & Lift Marksman Barrel Out of Slide',
        actionHintZh: '点击枪管，稍向前推使方形弹膛脱离抛壳窗后向上后方提出。',
        actionHintEn:
          'Click the barrel to nudge its rectangular hood clear of the ejection port and lift it out.',
        requires: ['g17_strip_recoil'],
        stripBlockedNoteZh:
          '复进簧导杆正顶在枪管下闭锁凸耳台阶上形成干涉，必须先取下复进簧总成才能提出枪管！',
        stripBlockedNoteEn:
          'The recoil spring assembly captures the barrel underlug—remove the recoil spring before lifting out the barrel!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['barrel'],
        bindings: [bind('barrel', 2)],
      },
      {
        id: 'g17_strip_striker',
        orderLabel: '05',
        titleZh: '前压隔套滑下套筒尾盖抽出平移击针组',
        titleEn: 'Slide Off Backplate & Extract Striker Assembly',
        actionHintZh: '点击套筒尾盖或平移击针，下滑尾盖释放并向后抽出击针总成。',
        actionHintEn:
          'Click the slide cover plate or striker to slide down the backplate and withdraw the striker.',
        requires: ['g17_strip_slide'],
        stripBlockedNoteZh:
          '套筒尾盖下方受握把火控座阻挡，必须先将套筒总成从下机匣拆下才能滑出尾盖！',
        stripBlockedNoteEn:
          'The polymer frame blocks downward travel of the slide cover plate—remove the slide from the frame first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['slide_cover_plate', 'striker', 'striker_spring'],
        bindings: [
          bind('slide_cover_plate', 3, 4),
          bind('striker', 3),
          bind('striker_spring', 3),
        ],
      },
    ],
  },

  // ===========================================================================
  // 5. Barrett M82A1 (.50 BMG) — US Army M107 5-Step Heavy Anti-Materiel Strip
  // ===========================================================================
  m82a1: {
    weaponId: 'm82a1',
    manualCodeZh: '美军 M107 教范 · .50 BMG 重枪管短后坐分解',
    manualCodeEn: 'US Army TM 9-1005-239-10 · 5-Step M82A1 Strip',
    steps: [
      {
        id: 'm82_strip_mag',
        orderLabel: '01',
        titleZh: '前推护圈卡笋卸下 10 发 .50 BMG 重型钢弹匣',
        titleEn: 'Detach 10-Round .50 BMG Steel Box Magazine',
        actionHintZh: '点击宽幅重型钢弹匣，先解脱后卡耳向下旋出 10 发弹匣。',
        actionHintEn:
          'Click the 10-round .50 BMG box magazine to unlatch and rock it clear of the lower receiver.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须先闭合上下机匣并锁紧前后快拆横销，最后才能挂入 .50 BMG 弹匣。',
        reassembleBlockedNoteEn:
          'Mate and pin the upper and lower sheet-steel receivers before inserting the .50 BMG magazine.',
        triggerPartIds: ['m82a1_mag_body', 'm82a1_mag_floorplate'],
        bindings: [
          bind('m82a1_mag_body', 0),
          bind('m82a1_mag_follower', 0),
          bind('m82a1_mag_spring', 0),
          bind('m82a1_mag_floorplate', 0),
        ],
      },
      {
        id: 'm82_strip_upper',
        orderLabel: '02',
        titleZh: '拔出前后快拆横销掀起冲压钢上机匣总成',
        titleEn: 'Pull Cross-Pins & Lift Upper Receiver Group',
        actionHintZh: '点击上机匣、折叠提把或瞄准镜，分离上下双层钢板机匣。',
        actionHintEn:
          'Click the upper receiver, carry handle, or optic to unpin and lift the upper assembly.',
        requires: ['m82_strip_mag'],
        stripBlockedNoteZh:
          '分解 M82A1 上下机匣前必须先卸下 .50 BMG 弹匣完成清枪！',
        stripBlockedNoteEn:
          'Remove the 10-round .50 BMG magazine before unpinning the upper receiver shell!',
        reassembleBlockedNoteZh:
          '闭合上下机匣前，必须先装回 29 寸重枪管复位簧组与加速子枪机框总成。',
        reassembleBlockedNoteEn:
          'Reinstall the 29" barrel return springs and bolt carrier/accelerator assembly before closing the upper.',
        triggerPartIds: [
          'm82a1_upper_receiver',
          'm82a1_carry_handle',
          'm82a1_scope',
        ],
        bindings: [
          bind('m82a1_upper_receiver', 0),
          bind('m82a1_muzzle_brake', 0),
          bind('m82a1_barrel', 0),
          bind('m82a1_barrel_extension', 0),
          bind('m82a1_barrel_springs', 0),
          bind('m82a1_carry_handle', 0),
          bind('m82a1_scope', 0),
          bind('m82a1_scope_rings', 0),
          bind('m82a1_lower_receiver', 0),
        ],
      },
      {
        id: 'm82_strip_bcg',
        orderLabel: '03',
        titleZh: '解脱枪机框尾栓抽出三突笋枪机框与加速子',
        titleEn: 'Extract Bolt Carrier & Accelerator Lever Group',
        actionHintZh:
          '点击枪机框或加速子杠杆，脱离下机匣缓冲筒后将枪机框组整体提出。',
        actionHintEn:
          'Click the bolt carrier or accelerator to unhook from the mainspring buffer and lift clear.',
        requires: ['m82_strip_upper'],
        stripBlockedNoteZh:
          '枪机框总成被封闭在上下机匣盒体内部，必须先拔销掀起上机匣总成！',
        stripBlockedNoteEn:
          'The bolt carrier rides inside the closed sheet-steel receiver—unpin and lift the upper receiver first!',
        reassembleBlockedNoteZh:
          '必须先装回重枪管节套并将三突笋枪机装回枪机框，再把枪机框放入机匣导轨。',
        reassembleBlockedNoteEn:
          'Reinstall the barrel assembly and reassemble the 3-lug bolt onto the carrier before seating the BCG.',
        triggerPartIds: [
          'm82a1_bolt_carrier',
          'm82a1_accelerator',
          'm82a1_recoil_spring',
        ],
        bindings: [
          bind('m82a1_bolt_carrier', 0),
          bind('m82a1_accelerator', 0),
          bind('m82a1_bolt', 0),
          bind('m82a1_firing_pin', 0),
          bind('m82a1_recoil_spring', 0),
        ],
      },
      {
        id: 'm82_strip_barrel',
        orderLabel: '04',
        titleZh: '摘除双枪管复位拉簧向前抽出 29 寸重枪管',
        titleEn: 'Unhook Twin Return Springs & Pull 29" Barrel',
        actionHintZh:
          '点击 29 寸凹槽枪管、箭头制退器或双复位簧，解脱枪管锁键向前抽出。',
        actionHintEn:
          'Click the fluted barrel, arrowhead brake, or twin return springs to withdraw the barrel forward.',
        requires: ['m82_strip_upper', 'm82_strip_bcg'],
        stripBlockedNoteZh:
          '三突笋枪机仍闭锁在枪管节套内，必须先分离上机匣并抽出枪机框总成后才能抽出重枪管！',
        stripBlockedNoteEn:
          'The 3-lug bolt locks into the barrel extension—lift the upper and extract the bolt carrier group first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'm82a1_barrel',
          'm82a1_barrel_springs',
          'm82a1_muzzle_brake',
          'm82a1_barrel_extension',
        ],
        bindings: [
          bind('m82a1_barrel_springs', 1),
          bind('m82a1_barrel', 1),
          bind('m82a1_muzzle_brake', 1),
          bind('m82a1_barrel_extension', 1),
        ],
      },
      {
        id: 'm82_strip_bolt',
        orderLabel: '05',
        titleZh: '拔出闭锁销分解三突笋枪机、加速子与击针',
        titleEn: 'Unpin 3-Lug Bolt, Accelerator & Firing Pin',
        actionHintZh: '点击三突笋枪机或长击针，从枪机框总成内拆出闭锁与击发核心。',
        actionHintEn:
          'Click the 3-lug bolt or firing pin to separate the bolt, accelerator lever, and firing pin.',
        requires: ['m82_strip_bcg'],
        stripBlockedNoteZh:
          '必须先将枪机框总成从机匣内提出，才能进一步拔销分解三突笋枪机与击针！',
        stripBlockedNoteEn:
          'Extract the bolt carrier assembly from the receiver before disassembling the bolt and firing pin!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m82a1_bolt', 'm82a1_firing_pin'],
        bindings: [
          bind('m82a1_bolt_carrier', 1),
          bind('m82a1_bolt', 1),
          bind('m82a1_accelerator', 1),
          bind('m82a1_firing_pin', 1),
        ],
      },
    ],
  },

  // ===========================================================================
  // 6. Accuracy International AWM / L115A3 (.338 Lapua) — 5-Step Sniper Strip
  // ===========================================================================
  awm: {
    weaponId: 'awm',
    manualCodeZh: '英军 L115A3 狙击教范 · 五步勤务保养分解',
    manualCodeEn: 'UK MoD L115A3 Manual · 5-Step Sniper Field Strip',
    steps: [
      {
        id: 'awm_strip_mag',
        orderLabel: '01',
        titleZh: '前推护圈桨片卸下 5 发 .338LM 钢制弹匣',
        titleEn: 'Release 5-Round .338LM Steel Box Magazine',
        actionHintZh: '点击 .338LM 盒式弹匣或弹匣卡笋，向下垂直退出弹匣。',
        actionHintEn:
          'Click the 5-round .338 Lapua steel magazine to drop it straight out of the aluminum chassis.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '请先将六突笋枪机推回钢机匣闭膛并装妥护壳，最后再插入 .338LM 弹匣。',
        reassembleBlockedNoteEn:
          'Reinsert the 6-lug bolt assembly and chassis skins before seating the .338LM box magazine.',
        triggerPartIds: ['awm_mag_body', 'awm_mag_floorplate', 'awm_mag_catch'],
        bindings: [
          bind('awm_mag_body', 0),
          bind('awm_mag_follower', 0),
          bind('awm_mag_spring', 0),
          bind('awm_mag_floorplate', 0),
        ],
      },
      {
        id: 'awm_strip_bolt',
        orderLabel: '02',
        titleZh: '抬柄 60° 按下左侧枪机卡扣向后抽出防冰槽枪机',
        titleEn: 'Lift 60° & Withdraw Fluted 6-Lug Bolt Group',
        actionHintZh:
          '点击六突笋防冰槽枪机或三档保险尾罩，从平侧壁钢机匣尾部平拉抽出。',
        actionHintEn:
          'Click the 6-lug fluted bolt body or shroud to depress the bolt stop and pull it clear.',
        requires: ['awm_strip_mag'],
        stripBlockedNoteZh:
          '抽出狙击枪机前必须先卸下 .338LM 弹匣，避免推弹突笋刮擦托弹板并确保空膛安全！',
        stripBlockedNoteEn:
          'Remove the .338LM magazine before withdrawing the 6-lug bolt assembly from the action!',
        reassembleBlockedNoteZh:
          '必须先将平移击针、击针簧与三档尾罩旋紧回枪机体内，才能把枪机推入机匣。',
        reassembleBlockedNoteEn:
          'Thread the striker, spring, and 3-position shroud back into the bolt body before inserting the bolt.',
        triggerPartIds: ['awm_bolt_body', 'awm_bolt_shroud'],
        bindings: [
          bind('awm_bolt_body', 0, 1),
          bind('awm_bolt_shroud', 0, 1),
          bind('awm_striker', 0, 1),
          bind('awm_firing_pin_spring', 0, 1),
          bind('awm_extractor', 0, 1),
        ],
      },
      {
        id: 'awm_strip_striker',
        orderLabel: '03',
        titleZh: '置于中间保险档旋下尾罩分解击针与击针簧',
        titleEn: 'Unthread Bolt Shroud & Strip Firing Pin Assembly',
        actionHintZh:
          '点击击针或击针簧，将保险拨至中间档释放待击斜面后旋出击针总成。',
        actionHintEn:
          'Click the striker or firing-pin spring to unthread the shroud from the 6-lug bolt body.',
        requires: ['awm_strip_bolt'],
        stripBlockedNoteZh:
          '枪机尾罩只有在六突笋枪机从钢机匣内完全抽出后，才能在手头安全旋下分解！',
        stripBlockedNoteEn:
          'Withdraw the 6-lug bolt assembly from the steel receiver before unthreading the bolt shroud!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'awm_striker',
          'awm_firing_pin_spring',
          'awm_extractor',
        ],
        bindings: [
          bind('awm_bolt_body', 2),
          bind('awm_bolt_shroud', 2),
          bind('awm_striker', 2),
          bind('awm_firing_pin_spring', 2),
          bind('awm_extractor', 2),
        ],
      },
      {
        id: 'awm_strip_optic',
        orderLabel: '04',
        titleZh: '松开双夹紧螺母取下 S&B PM II 瞄准镜一体桥',
        titleEn: 'Detach S&B PM II Scope & One-Piece Dovetail Mount',
        actionHintZh: '点击光学瞄准镜或一体镜桥，从 11mm 燕尾导轨上方快拆取下。',
        actionHintEn:
          'Click the S&B PM II scope or one-piece mount to lift it off the integral receiver dovetail.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['awm_scope', 'awm_scope_mount'],
        bindings: [bind('awm_scope', 0), bind('awm_scope_mount', 0)],
      },
      {
        id: 'awm_strip_skins',
        orderLabel: '05',
        titleZh: '拔出前插栓两脚架并拆下橄榄绿玻纤底盘护壳',
        titleEn: 'Unplug Spigot Bipod & Remove Polymer Chassis Skins',
        actionHintZh:
          '点击橄榄绿拇指孔护壳或前两脚架，露出内部 CNC 铝合金贯穿主梁。',
        actionHintEn:
          'Click the olive-drab thumbhole skins or spigot bipod to expose the CNC aluminum chassis beam.',
        requires: ['awm_strip_mag'],
        stripBlockedNoteZh:
          '拆卸两片式玻纤底盘护壳前请先卸下 .338LM 弹匣！',
        stripBlockedNoteEn:
          'Remove the .338LM magazine before detaching the two-piece polymer chassis skins!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['awm_chassis_skins', 'awm_bipod'],
        bindings: [bind('awm_bipod', 0), bind('awm_chassis_skins', 0)],
      },
    ],
  },

  // ===========================================================================
  // 7. FN SCAR-L Mk 16 (5.56×45mm) — SOCOM 6-Step Monolithic Upper Strip
  // ===========================================================================
  scar: {
    weaponId: 'scar',
    manualCodeZh: '美军特战 Mk 16 教范 · 随动拉机柄圆孔解锁六步快拆',
    manualCodeEn: 'USSOCOM Mk 16 Manual · 6-Step SCAR-L Field Strip',
    steps: [
      {
        id: 'scar_strip_mag',
        orderLabel: '01',
        titleZh: '按压双侧释放钮卸下 FDE 30 发弹匣',
        titleEn: 'Drop 30-Round FDE STANAG Magazine',
        actionHintZh: '点击 FDE 弹匣体或底板，垂直卸下 30 发弹匣。',
        actionHintEn:
          'Click the FDE STANAG magazine body to release it from the polymer lower receiver.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '请先将枪托尾盖、复进簧与导气活塞全部装回闭合后，最后再插入弹匣。',
        reassembleBlockedNoteEn:
          'Reassemble the buttstock assembly, recoil rod, and gas piston before inserting the magazine.',
        triggerPartIds: ['scar_mag_body', 'scar_mag_floorplate'],
        bindings: [
          bind('scar_mag_body', 0),
          bind('scar_mag_follower', 0),
          bind('scar_mag_spring', 0),
          bind('scar_mag_floorplate', 0),
        ],
      },
      {
        id: 'scar_strip_stock_recoil',
        orderLabel: '02',
        titleZh: '推出前结合销滑下折叠枪托并抽出复进簧导杆',
        titleEn: 'Slide Off UGG Boot Stock & Withdraw Recoil Rod',
        actionHintZh:
          '点击折叠枪托、贴腮板或复进簧，向下滑脱尾座敞开一体式铝上机匣尾口。',
        actionHintEn:
          'Click the folding buttstock or recoil spring to slide off the rear plate and pull the recoil rod.',
        requires: ['scar_strip_mag'],
        stripBlockedNoteZh:
          '分解 SCAR 机匣尾座前必须先卸下弹匣确保清枪安全！',
        stripBlockedNoteEn:
          'Drop the magazine to clear the rifle before sliding off the folding buttstock assembly!',
        reassembleBlockedNoteZh:
          '必须先将枪机框推至机匣圆孔处插回随动拉机柄并前推到位，才能扣回复进簧与折叠枪托！',
        reassembleBlockedNoteEn:
          'Insert the bolt carrier and lock the reciprocating charging handle through the keyway before reinstalling the stock!',
        triggerPartIds: [
          'scar_buttstock',
          'scar_cheek_riser',
          'scar_recoil_rod',
          'scar_recoil_spring',
          'scar_upper_receiver',
        ],
        bindings: [
          bind('scar_buttstock', 0),
          bind('scar_cheek_riser', 0),
          bind('scar_buttpad', 0),
          bind('scar_recoil_rod', 0),
          bind('scar_recoil_spring', 0),
          bind('scar_upper_receiver', 0),
          bind('scar_rear_sight', 0),
        ],
      },
      {
        id: 'scar_strip_ch',
        orderLabel: '03',
        titleZh: '后拉随动拉机柄对齐机匣圆孔横向拔出',
        titleEn: 'Align Keyway Cutout & Pull Charging Handle Out',
        actionHintZh:
          '点击随动拉机柄，沿导槽后拉至圆形分解孔处向侧方拔脱枪机框。',
        actionHintEn:
          'Click the reciprocating charging handle to slide it back to the circular keyway and pull it laterally free.',
        requires: ['scar_strip_stock_recoil'],
        stripBlockedNoteZh:
          '必须先拆下折叠枪托尾座与复进簧释放后退阻力，才能将拉机柄退至分解圆孔处拔出！',
        stripBlockedNoteEn:
          'Remove the buttstock plate and recoil spring assembly first before aligning the charging handle with the keyway!',
        reassembleBlockedNoteZh:
          'SCAR 铁律：复装时必须先将重型枪机框推入上机匣对齐圆孔，才能把随动拉机柄横向插回枪机框前孔！',
        reassembleBlockedNoteEn:
          'SCAR rule: slide the bolt carrier group into the upper keyway BEFORE inserting the charging handle into the carrier!',
        triggerPartIds: ['scar_charging_handle'],
        bindings: [bind('scar_charging_handle', 0, 1)],
      },
      {
        id: 'scar_strip_bcg',
        orderLabel: '04',
        titleZh: '从一体挤压铝上机匣尾口平拉抽出重型枪机框',
        titleEn: 'Slide Heavy Bolt Carrier Group Out Rear of Upper',
        actionHintZh: '点击方形重型枪机框，无干涉地从上机匣尾部向后抽出。',
        actionHintEn:
          'Click the monolithic bolt carrier to slide the complete BCG out the open rear of the upper.',
        requires: ['scar_strip_ch'],
        stripBlockedNoteZh:
          '经典机械干涉：SCAR 随动拉机柄直接插在枪机框内并卡在上机匣导槽中！必须先点击拉机柄退至圆孔拔出！',
        stripBlockedNoteEn:
          'Classic SCAR interference: the reciprocating charging handle pins through the carrier inside the receiver slot—pull the charging handle out first!',
        reassembleBlockedNoteZh:
          '必须先将七突笋枪机与击针装回枪机框总成，再推入上机匣导轨。',
        reassembleBlockedNoteEn:
          'Reinstall the 7-lug bolt and firing pin into the carrier before sliding the BCG into the upper receiver.',
        triggerPartIds: ['scar_bolt_carrier'],
        bindings: [
          bind('scar_bolt_carrier', 0, 1),
          bind('scar_bolt', 0, 1),
          bind('scar_firing_pin', 0, 1),
        ],
      },
      {
        id: 'scar_strip_bolt',
        orderLabel: '05',
        titleZh: '抽出击针定位圈分离七突笋枪机与击针',
        titleEn: 'Pull Retaining Pin & Separate 7-Lug Bolt',
        actionHintZh: '点击七突笋回转枪机或击针，从枪机框内向前分解出枪机头。',
        actionHintEn:
          'Click the 7-lug rotating bolt or firing pin to extract them from the heavy carrier.',
        requires: ['scar_strip_bcg'],
        stripBlockedNoteZh:
          '枪机总成仍位于一体式铝上机匣内部，必须先拔拉机柄并抽出枪机框总成！',
        stripBlockedNoteEn:
          'The bolt is still inside the monolithic upper—withdraw the bolt carrier group first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['scar_bolt', 'scar_firing_pin'],
        bindings: [
          bind('scar_bolt_carrier', 2),
          bind('scar_bolt', 2),
          bind('scar_firing_pin', 2),
        ],
      },
      {
        id: 'scar_strip_piston',
        orderLabel: '06',
        titleZh: '旋出导气调节塞向前抽出短行程不锈钢活塞顶杆',
        titleEn: 'Unlatch Regulator & Pull Short-Stroke Gas Tappet',
        actionHintZh:
          '点击导气箍或短行程活塞顶杆，从准星座前方抽出 14mm 冲量活塞。',
        actionHintEn:
          'Click the gas block or short-stroke stainless tappet piston to withdraw it out the front.',
        requires: ['scar_strip_mag'],
        stripBlockedNoteZh: '保养导气活塞前请先卸下弹匣确保清枪安全！',
        stripBlockedNoteEn:
          'Drop the magazine to clear the rifle before extracting the front gas tappet piston!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['scar_gas_piston', 'scar_gas_block'],
        bindings: [bind('scar_gas_block', 0), bind('scar_gas_piston', 0)],
      },
    ],
  },

  // ===========================================================================
  // 8. IMI / MRI Desert Eagle Mark XIX (.50 AE) — Barrel-First Gas Pistol Strip
  // ===========================================================================
  deagle: {
    weaponId: 'deagle',
    manualCodeZh: 'MRI Mark XIX 教范 · 先拆枪管后脱套筒五步快拆',
    manualCodeEn: 'Magnum Research Manual · 5-Step Barrel-First Strip',
    steps: [
      {
        id: 'deagle_strip_mag',
        orderLabel: '01',
        titleZh: '按下卡笋退出 7 发 .50 AE 单排钢弹匣',
        titleEn: 'Eject 7-Round .50 AE Single-Stack Magazine',
        actionHintZh: '点击 .50 AE 钢制弹匣或底板，向下退出巨型手枪弹匣。',
        actionHintEn:
          'Click the 7-round .50 AE steel magazine body to drop it from the grip frame.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须先滑回桥式套筒并扣锁 6 寸导气枪管，最后再插入 .50 AE 弹匣。',
        reassembleBlockedNoteEn:
          'Slide on the bridge slide and lock the 6" barrel into place before inserting the .50 AE magazine.',
        triggerPartIds: [
          'deagle_mag_body',
          'deagle_mag_baseplate',
          'deagle_mag_catch',
        ],
        bindings: [
          bind('deagle_mag_body', 0, 1),
          bind('deagle_mag_follower', 0, 1),
          bind('deagle_mag_spring', 0, 1),
          bind('deagle_mag_baseplate', 0, 1),
        ],
      },
      {
        id: 'deagle_strip_barrel',
        orderLabel: '02',
        titleZh: '压钮旋下分解杆向前上方解脱 6 寸导气重枪管',
        titleEn: 'Rotate Takedown Lever & Lift 6" Gas-Ported Barrel',
        actionHintZh:
          '点击 6 寸燕尾导轨重枪管或准星，脱离下机匣闭锁槽向前上方取下。',
        actionHintEn:
          'Click the 6" polygonal gas-ported barrel to unlock it from the frame bridge and lift forward.',
        requires: ['deagle_strip_mag'],
        stripBlockedNoteZh: '旋下分解杆拆卸重枪管前必须先退出 .50 AE 弹匣！',
        stripBlockedNoteEn:
          'Eject the .50 AE magazine before unlocking and lifting off the 6" fixed barrel!',
        reassembleBlockedNoteZh:
          '沙漠之鹰逆序要点：必须先将套筒与双复进簧滑回下机匣导轨，最后才能把枪管前端套入活塞杆压下闭锁！',
        reassembleBlockedNoteEn:
          'Desert Eagle rule: slide the bridge slide & twin recoil springs onto the frame BEFORE seating the barrel over the piston!',
        triggerPartIds: [
          'deagle_barrel',
          'deagle_front_sight',
          'deagle_takedown_lever',
        ],
        bindings: [bind('deagle_barrel', 0), bind('deagle_front_sight', 0)],
      },
      {
        id: 'deagle_strip_slide',
        orderLabel: '03',
        titleZh: '向前滑出桥式套筒（连同前导气活塞与回转枪机）',
        titleEn: 'Slide Forward Bridge Slide & Front Piston Group',
        actionHintZh: '点击桥式套筒或照门，沿全长下机匣导轨向前滑脱。',
        actionHintEn:
          'Click the bridge slide to pull it forward off the steel frame rails.',
        requires: ['deagle_strip_barrel'],
        stripBlockedNoteZh:
          '沙漠之鹰独特干涉：套筒前端的一体式导气活塞正插在固定枪管前下方的导气杯内！必须先拆下枪管才能滑出套筒！',
        stripBlockedNoteEn:
          'Desert Eagle mechanical lock: the slide front gas piston is captured inside the barrel gas cup—remove the barrel FIRST!',
        reassembleBlockedNoteZh:
          '必须先将四突笋枪机装回套筒并挂妥并联双复进簧，再把套筒滑回下机匣导轨。',
        reassembleBlockedNoteEn:
          'Reinstall the 4-lug rotating bolt and twin recoil springs before sliding the slide onto the frame.',
        triggerPartIds: ['deagle_slide', 'deagle_rear_sight'],
        bindings: [
          bind('deagle_slide', 0, 1),
          bind('deagle_bolt', 0, 1),
          bind('deagle_cam_pin', 0, 1),
          bind('deagle_firing_pin', 0, 1),
          bind('deagle_extractor', 0, 1),
          bind('deagle_safety', 0, 1),
          bind('deagle_rear_sight', 0, 1),
        ],
      },
      {
        id: 'deagle_strip_recoil',
        orderLabel: '04',
        titleZh: '从套筒下托座摘出并联双复进簧与双导杆',
        titleEn: 'Lift Parallel Twin Recoil Springs & Guide Rods',
        actionHintZh: '点击双复进簧或双导杆，解脱前托板取出双联复进机构。',
        actionHintEn:
          'Click the twin parallel recoil springs or guide rods to lift the dual recoil assembly clear.',
        requires: ['deagle_strip_slide'],
        stripBlockedNoteZh:
          '并联双复进簧被夹持在枪管底座与套筒下颚之间，必须先拆枪管并滑下套筒！',
        stripBlockedNoteEn:
          'The twin recoil springs are captured beneath the barrel and slide—remove the barrel and slide first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['deagle_recoil_rods', 'deagle_recoil_springs'],
        bindings: [
          bind('deagle_recoil_rods', 0),
          bind('deagle_recoil_springs', 0),
        ],
      },
      {
        id: 'deagle_strip_bolt',
        orderLabel: '05',
        titleZh: '滑开击针锁板拔出凸轮销分离四突笋步枪级枪机',
        titleEn: 'Pull Cam Pin & Extract 4-Lug Rotating Bolt',
        actionHintZh: '点击四突笋回转枪机、凸轮销或击针，从桥式套筒内分解枪机。',
        actionHintEn:
          'Click the 4-lug bolt, cam pin, or firing pin to strip the rotating bolt from the slide.',
        requires: ['deagle_strip_slide'],
        stripBlockedNoteZh:
          '回转枪机封装在套筒桥部腔体内，必须先将套筒从下机匣滑出后才能拔凸轮销拆枪机！',
        stripBlockedNoteEn:
          'The 4-lug bolt is enclosed inside the slide bridge—slide the upper off the frame before pulling the cam pin!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['deagle_bolt', 'deagle_cam_pin', 'deagle_firing_pin'],
        bindings: [
          bind('deagle_bolt', 2),
          bind('deagle_cam_pin', 2),
          bind('deagle_firing_pin', 2),
          bind('deagle_extractor', 2),
        ],
      },
    ],
  },

  // ===========================================================================
  // 9. Steyr AUG A1 (5.56×45mm) — Austrian Modular 6-Group Bullpup Breakdown
  // ===========================================================================
  aug: {
    weaponId: 'aug',
    manualCodeZh: '奥地利 StG 77 教范 · 无工具六大模块快拆',
    manualCodeEn: 'Austrian StG 77 Manual · 6-Group Modular Bullpup Strip',
    steps: [
      {
        id: 'aug_strip_mag',
        orderLabel: '01',
        titleZh: '按压井后拇指卡笋卸下 30 发半透明华夫格弹匣',
        titleEn: 'Release 30-Round Translucent Waffle Magazine',
        actionHintZh: '点击枪托后部半透明聚合物弹匣，向下拔出 30 发弹匣。',
        actionHintEn:
          'Click the translucent waffle magazine in the bullpup stock to drop it clear.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '请先将机匣、快拆枪管与全塑击发机盒全部装回聚合物枪托，最后再插入弹匣。',
        reassembleBlockedNoteEn:
          'Reinstall the receiver, quick-change barrel, and polymer hammer pack before inserting the magazine.',
        triggerPartIds: ['aug_mag_body', 'aug_mag_floorplate'],
        bindings: [
          bind('aug_mag_body', 0),
          bind('aug_mag_follower', 0),
          bind('aug_mag_spring', 0),
          bind('aug_mag_floorplate', 0),
        ],
      },
      {
        id: 'aug_strip_barrel',
        orderLabel: '02',
        titleZh: '压下枪管锁扣握持前握把旋转 45° 秒拆冷锻枪管',
        titleEn: 'Press Barrel Lock, Twist 45° & Pull Quick-Change Barrel',
        actionHintZh:
          '点击枪管、折叠前握把或导气箍，解锁八突笋节套向前抽出枪管总成。',
        actionHintEn:
          'Click the barrel, vertical foregrip, or gas block to twist-unlock and pull the barrel forward.',
        requires: ['aug_strip_mag'],
        stripBlockedNoteZh: '秒拆 AUG 枪管前必须先卸下无托弹匣完成清枪确认！',
        stripBlockedNoteEn:
          'Drop the bullpup waffle magazine first before unlocking the quick-change barrel!',
        reassembleBlockedNoteZh:
          '枪管节套必须插入铝合金机匣前端承力环，请先将机匣与枪机框装回枪托再插入枪管！',
        reassembleBlockedNoteEn:
          'The barrel locks into the aluminum receiver collar—reinstall the receiver and BCG into the stock first!',
        triggerPartIds: ['aug_barrel', 'aug_foregrip', 'aug_gas_block'],
        bindings: [
          bind('aug_barrel', 0, 1),
          bind('aug_flash_hider', 0, 1),
          bind('aug_gas_block', 0, 1),
          bind('aug_gas_regulator', 0, 1),
          bind('aug_gas_piston', 0, 1),
          bind('aug_foregrip', 0, 1),
        ],
      },
      {
        id: 'aug_strip_receiver',
        orderLabel: '03',
        titleZh: '横推机匣分解横栓向前抽出 1.5× 瞄准镜一体机匣',
        titleEn: 'Push Takedown Wedge & Slide Out Optic Receiver',
        actionHintZh:
          '点击一体式 1.5× 瞄准镜机匣或横栓，沿聚合物枪身导槽向前脱出。',
        actionHintEn:
          'Click the integrated 1.5× Swarovski optic receiver or takedown pin to slide the receiver out.',
        requires: ['aug_strip_barrel'],
        stripBlockedNoteZh:
          '建议先按压锁扣秒拆快拆枪管减轻前部配重，再横推机匣锁栓分离铝合金机匣！',
        stripBlockedNoteEn:
          'Detach the quick-change barrel assembly first before pushing the housing takedown wedge!',
        reassembleBlockedNoteZh:
          '必须先将双长导杆枪机框总成装入机匣导孔，才能把机匣推回聚合物枪托。',
        reassembleBlockedNoteEn:
          'Slide the twin-rod bolt carrier assembly back into the receiver guide tubes before mating with the stock.',
        triggerPartIds: [
          'aug_receiver_optic',
          'aug_takedown_pin',
          'aug_barrel_lock',
          'aug_charging_handle',
        ],
        bindings: [
          bind('aug_takedown_pin', 0),
          bind('aug_receiver_optic', 0),
          bind('aug_barrel_lock', 0),
          bind('aug_charging_handle', 0),
        ],
      },
      {
        id: 'aug_strip_bcg',
        orderLabel: '04',
        titleZh: '抽出双空心长导杆枪机框与双复进簧组',
        titleEn: 'Withdraw Twin-Guide-Rod Bolt Carrier & Recoil Springs',
        actionHintZh: '点击无托枪机框或双复进簧，从分离后的机匣后部平拉抽出。',
        actionHintEn:
          'Click the twin-rod bolt carrier or recoil springs to withdraw the operating group.',
        requires: ['aug_strip_receiver'],
        stripBlockedNoteZh:
          '双导杆枪机框封闭在聚合物无托枪腔与铝机匣之间，必须先推栓分离一体机匣！',
        stripBlockedNoteEn:
          'The bolt carrier rides sealed inside the stock and receiver—push the takedown wedge and slide off the receiver first!',
        reassembleBlockedNoteZh:
          '必须先将七突笋回转枪机与击针旋回枪机框内，再装入机匣导孔。',
        reassembleBlockedNoteEn:
          'Cam the 7-lug bolt and firing pin back into the carrier before sliding into the receiver.',
        triggerPartIds: ['aug_bolt_carrier', 'aug_recoil_springs'],
        bindings: [
          bind('aug_bolt_carrier', 0, 1),
          bind('aug_bolt', 0, 1),
          bind('aug_firing_pin', 0, 1),
          bind('aug_recoil_springs', 0),
        ],
      },
      {
        id: 'aug_strip_hammer_pack',
        orderLabel: '05',
        titleZh: '压入尾托卡销取下橡胶抵肩垫并抽出全塑击发机盒',
        titleEn: 'Pull Buttpad Pin & Extract Polymer Hammer Pack',
        actionHintZh:
          '点击橡胶抵肩垫或全塑击锤组件，从枪托尾门向后拉出火控盒。',
        actionHintEn:
          'Click the rubber buttpad or polymer hammer pack to unlatch the stock heel and slide the pack out.',
        requires: ['aug_strip_mag'],
        stripBlockedNoteZh: '开启枪托尾门抽出全塑火控盒前必须先卸下弹匣！',
        stripBlockedNoteEn:
          'Remove the waffle magazine before pulling the buttpad latch to extract the hammer pack!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['aug_buttpad', 'aug_hammer_pack', 'aug_hammer'],
        bindings: [
          bind('aug_buttpad', 0),
          bind('aug_hammer_pack', 0),
          bind('aug_hammer', 0),
        ],
      },
      {
        id: 'aug_strip_bolt',
        orderLabel: '06',
        titleZh: '捏合凸轮锁分离七突笋枪机与右偏置短行程活塞',
        titleEn: 'Separate 7-Lug Rotating Bolt & Short-Stroke Piston',
        actionHintZh:
          '点击七突笋枪机、击针或导气活塞，细拆闭锁机头与短行程导气活塞。',
        actionHintEn:
          'Click the 7-lug bolt, firing pin, or gas piston to strip the bolt head and gas regulator/piston.',
        requires: ['aug_strip_bcg', 'aug_strip_barrel'],
        stripBlockedNoteZh:
          '必须先卸下快拆枪管并抽出双导杆枪机框总成，才能细拆七突笋枪机与短行程活塞！',
        stripBlockedNoteEn:
          'Remove both the quick-change barrel and the bolt carrier group before stripping the bolt and gas piston!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'aug_bolt',
          'aug_firing_pin',
          'aug_gas_piston',
          'aug_gas_regulator',
        ],
        bindings: [
          bind('aug_bolt', 2),
          bind('aug_firing_pin', 2),
          bind('aug_gas_regulator', 2),
          bind('aug_gas_piston', 2),
        ],
      },
    ],
  },

  // ===========================================================================
  // 10. SIG Sauer P320 M17 (9×19mm) — US Army Modular FCU Chassis Takedown
  // ===========================================================================
  p320: {
    weaponId: 'p320',
    manualCodeZh: '美军 TM 9-1005-470-10 · 弹匣联锁与 FCU 模块化快拆',
    manualCodeEn: 'US Army M17 Manual · 5-Step Mag-Interlock & FCU Strip',
    steps: [
      {
        id: 'p320_strip_mag',
        orderLabel: '01',
        titleZh: '按下三角形卡笋卸下 17 发狼棕底板钢弹匣',
        titleEn: 'Drop 17-Round Coyote-Baseplate Magazine',
        actionHintZh:
          '点击弹匣体或底板退出弹匣，自动解除 P320 弹匣井分解安全联锁杆。',
        actionHintEn:
          'Click the magazine body to drop it—clearing SIG’s mechanical magazine-well takedown safety interlock.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          'P320 机械联锁：若先插入弹匣，托弹板会顶起联锁杆阻止快拆柄旋回水平锁死位！请先锁好快拆柄再插弹匣！',
        reassembleBlockedNoteEn:
          'P320 mechanical interlock: inserting the magazine blocks the takedown lever from rotating back to horizontal—lock the lever FIRST!',
        triggerPartIds: [
          'p320_mag_body',
          'p320_mag_baseplate',
          'p320_mag_catch',
        ],
        bindings: [
          bind('p320_mag_body', 0, 1),
          bind('p320_mag_follower', 0, 1),
          bind('p320_mag_spring', 0, 1),
          bind('p320_mag_baseplate', 0, 1),
        ],
      },
      {
        id: 'p320_strip_lever',
        orderLabel: '02',
        titleZh: '顺时针旋转快拆解脱柄 90°（自动顶起阻铁免扣扳机）',
        titleEn: 'Rotate Takedown Lever 90° Clockwise (No Trigger Pull)',
        actionHintZh: '点击左侧快拆解脱柄，顺时针下旋 90° 解锁套筒导轨并抬起阻铁。',
        actionHintEn:
          'Click the takedown lever to rotate it 90° downward—cams the sear clear without pulling the trigger.',
        requires: ['p320_strip_mag'],
        stripBlockedNoteZh:
          'SIG P320 防走火机械联锁生效：弹匣在位时分解安全联锁杆锁死快拆柄，物理上无法旋转 90°！必须先退出弹匣！',
        stripBlockedNoteEn:
          'SIG P320 takedown interlock active: a seated magazine physically blocks the takedown lever from rotating 90°—drop the magazine first!',
        reassembleBlockedNoteZh:
          '必须先装回 FCU 火控内胆并将套筒总成滑回导轨挂机位，才能将快拆解脱柄逆时针旋回水平锁定位！',
        reassembleBlockedNoteEn:
          'Seat the FCU chassis and slide the upper assembly back onto the rails before rotating the takedown lever horizontal!',
        triggerPartIds: ['p320_takedown_lever'],
        bindings: [bind('p320_takedown_lever', 0)],
      },
      {
        id: 'p320_strip_slide',
        orderLabel: '03',
        titleZh: '向前平推滑出狼棕 PVD 套筒总成',
        titleEn: 'Slide Coyote Tan PVD Upper Assembly Forward',
        actionHintZh: '点击狼棕 PVD 套筒或红点盖板，无需扣动扳机直接向前滑脱。',
        actionHintEn:
          'Click the Coyote Tan PVD slide to glide the complete upper assembly forward off the FCU rails.',
        requires: ['p320_strip_lever'],
        stripBlockedNoteZh:
          '快拆解脱柄仍处于水平闭锁位挡住枪管下凸耳，必须先点击快拆柄顺时针旋转 90°！',
        stripBlockedNoteEn:
          'The horizontal takedown lever blocks the barrel cam lug—rotate the takedown lever 90° first!',
        reassembleBlockedNoteZh:
          '必须先将 FCU 不锈钢内胆装回聚合物握把壳，并将枪管与复进簧装妥于套筒内，再装回套筒。',
        reassembleBlockedNoteEn:
          'Seat the stainless FCU chassis in the grip module and install the barrel & recoil spring in the slide first.',
        triggerPartIds: [
          'p320_slide',
          'p320_optic_plate_sight',
          'p320_front_sight',
        ],
        bindings: [
          bind('p320_slide', 0, 1),
          bind('p320_optic_plate_sight', 0, 1),
          bind('p320_front_sight', 0, 1),
          bind('p320_barrel', 0, 1),
          bind('p320_recoil_guide_rod', 0, 1),
          bind('p320_recoil_spring', 0, 1),
          bind('p320_striker', 0, 1),
          bind('p320_striker_spring', 0, 1),
          bind('p320_striker_housing', 0, 1),
          bind('p320_safety_lock', 0, 1),
          bind('p320_extractor', 0, 1),
        ],
      },
      {
        id: 'p320_strip_recoil_barrel',
        orderLabel: '04',
        titleZh: '取下扁钢丝捕获式复进簧并提出 4.7 寸枪管',
        titleEn: 'Lift Captive Recoil Spring & 4.7" Nitride Barrel',
        actionHintZh: '点击复进簧、导杆或 4.7 寸枪管，从倒置套筒内分离复进簧与枪管。',
        actionHintEn:
          'Click the captive recoil spring, guide rod, or 4.7" barrel to lift them from the slide.',
        requires: ['p320_strip_slide'],
        stripBlockedNoteZh:
          '枪管与捕获式复进簧位于套筒与握把防尘盖内部，必须先旋转快拆柄并滑下套筒总成！',
        stripBlockedNoteEn:
          'The barrel and recoil spring are captured inside the closed slide—remove the slide assembly first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'p320_recoil_guide_rod',
          'p320_recoil_spring',
          'p320_barrel',
        ],
        bindings: [
          bind('p320_recoil_guide_rod', 2),
          bind('p320_recoil_spring', 2),
          bind('p320_barrel', 2),
          bind('p320_slide', 2),
          bind('p320_optic_plate_sight', 2),
          bind('p320_front_sight', 2),
          bind('p320_striker', 2),
          bind('p320_striker_spring', 2),
          bind('p320_striker_housing', 2),
          bind('p320_safety_lock', 2),
          bind('p320_extractor', 2),
        ],
      },
      {
        id: 'p320_strip_fcu',
        orderLabel: '05',
        titleZh: '拔出快拆轴销垂直提出带序列号不锈钢 FCU 火控内胆',
        titleEn: 'Pull Takedown Pin & Lift Serialized Stainless FCU Chassis',
        actionHintZh:
          '点击不锈钢 FCU 导轨内胆、扳机或手动保险，无工具整体提出法定火控核心。',
        actionHintEn:
          'Click the serialized stainless FCU chassis, trigger, or manual safety to lift the entire fire-control unit out.',
        requires: ['p320_strip_slide'],
        stripBlockedNoteZh:
          '套筒正咬合在不锈钢 FCU 四段导轨上且快拆柄横穿内胆前孔，必须先滑下套筒总成才能拔出快拆柄提出 FCU！',
        stripBlockedNoteEn:
          'The slide rides on the FCU rails—remove the slide assembly before pulling the takedown lever and lifting the FCU!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'p320_fcu_chassis',
          'p320_trigger_shoe',
          'p320_sear_group',
          'p320_manual_safety',
        ],
        bindings: [
          bind('p320_takedown_lever', 1),
          bind('p320_fcu_chassis', 0),
          bind('p320_slide_catch', 0),
          bind('p320_trigger_shoe', 0),
          bind('p320_trigger_bar', 0),
          bind('p320_sear_group', 0),
          bind('p320_manual_safety', 0),
          bind('p320_slide', 3),
          bind('p320_optic_plate_sight', 3),
          bind('p320_front_sight', 3),
          bind('p320_striker', 3),
          bind('p320_striker_spring', 3),
          bind('p320_striker_housing', 3),
          bind('p320_safety_lock', 3),
          bind('p320_extractor', 3),
        ],
      },
    ],
  },

  // ===========================================================================
  // 11. FN P90 (5.7×28mm) — Herstal 6-Step Top-Mag Bullpup PDW Strip
  // ===========================================================================
  p90: {
    weaponId: 'p90',
    manualCodeZh: 'FN Herstal 教范 · 置顶螺旋供弹六步模块化快拆',
    manualCodeEn: 'FN Herstal Manual · 6-Step Modular Bullpup PDW Strip',
    steps: [
      {
        id: 'p90_strip_mag',
        orderLabel: '01',
        titleZh: '后拉双翼卡笋向上取下 50 发置顶透明水平弹匣',
        titleEn: 'Pull Twin Catches & Lift 50-Round Horizontal Magazine',
        actionHintZh:
          '点击顶部半透明聚碳酸酯弹匣或 90° 螺旋供弹坡道，向上垂直取下。',
        actionHintEn:
          'Click the top-mounted 50-round translucent magazine or 90° helical ramp to lift it off.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '50 发水平弹匣前端卡入上机匣、后端锁在枪身卡笋上，必须先装回上机匣与尾托底板后再扣合弹匣！',
        reassembleBlockedNoteEn:
          'The horizontal magazine bridges the upper receiver and stock catches—reinstall the upper and buttplate first!',
        triggerPartIds: [
          'p90_mag_body',
          'p90_helical_ramp',
          'p90_mag_floorplate',
          'p90_mag_catches',
        ],
        bindings: [
          bind('p90_mag_body', 0),
          bind('p90_helical_ramp', 0),
          bind('p90_mag_follower', 0),
          bind('p90_mag_spring', 0),
          bind('p90_mag_floorplate', 0),
        ],
      },
      {
        id: 'p90_strip_upper',
        orderLabel: '02',
        titleZh: '按下机匣分解锁扣向前滑出枪管与瞄具上机匣总成',
        titleEn: 'Depress Takedown Lock & Slide Barrel/Optic Upper Forward',
        actionHintZh:
          '点击铝合金上机匣、枪管或光学瞄具，按压弹匣槽下方的闭锁键向前抽出。',
        actionHintEn:
          'Click the alloy upper receiver, barrel, or ring sight to depress the takedown plunger and slide forward.',
        requires: ['p90_strip_mag'],
        stripBlockedNoteZh:
          'P90 置顶弹匣横跨锁扣在上机匣与聚合物枪身之间，且遮蔽分解锁扣，必须先取下顶部弹匣！',
        stripBlockedNoteEn:
          'The top-mounted 50-round magazine bridges the upper receiver and covers the takedown plunger—remove the magazine first!',
        reassembleBlockedNoteZh:
          '必须先将双导杆自由枪机总成滑回聚合物枪身腔体，才能从前方推入上机匣闭锁！',
        reassembleBlockedNoteEn:
          'Seat the twin-rod blowback bolt group inside the polymer stock cavity before sliding the upper receiver back on!',
        triggerPartIds: [
          'p90_upper_receiver',
          'p90_barrel',
          'p90_ring_sight',
          'p90_takedown_lock',
        ],
        bindings: [
          bind('p90_upper_receiver', 0),
          bind('p90_barrel', 0),
          bind('p90_flash_hider', 0),
          bind('p90_ring_sight', 0),
          bind('p90_charging_handles', 0),
        ],
      },
      {
        id: 'p90_strip_bolt',
        orderLabel: '03',
        titleZh: '从枪身前开口向前倾斜抽出重型自由枪机总成',
        titleEn: 'Tip & Withdraw Heavy Blowback Bolt Group Forward',
        actionHintZh:
          '点击重型方形枪机或双导杆复进簧，从聚合物枪身前腔轻松滑出。',
        actionHintEn:
          'Click the heavy blowback bolt or twin recoil rods to slide the moving assembly out the front.',
        requires: ['p90_strip_upper'],
        stripBlockedNoteZh:
          '铝合金上机匣封闭在聚合物枪身前口，必须先按锁扣向前拆下上机匣总成才能取出自由枪机！',
        stripBlockedNoteEn:
          'The aluminum upper receiver seals the front of the stock—slide off the upper receiver assembly first!',
        reassembleBlockedNoteZh:
          '必须先将双平行导杆与双复进簧插回重型枪机，才能将枪机总成装回枪身。',
        reassembleBlockedNoteEn:
          'Reassemble the twin guide rods and recoil springs into the bolt block before inserting into the stock.',
        triggerPartIds: ['p90_bolt', 'p90_firing_pin'],
        bindings: [
          bind('p90_bolt', 0),
          bind('p90_firing_pin', 0),
          bind('p90_guide_rods', 0),
          bind('p90_recoil_springs', 0),
        ],
      },
      {
        id: 'p90_strip_recoil_rods',
        orderLabel: '04',
        titleZh: '抽出双平行复进导杆与双螺旋复进簧',
        titleEn: 'Separate Twin Guide Rods & Dual Recoil Springs',
        actionHintZh: '点击双导杆或双复进簧，从重型自由枪机通孔内向后抽出导杆组。',
        actionHintEn:
          'Click the twin guide rods or recoil springs to pull them clear of the blowback bolt.',
        requires: ['p90_strip_bolt'],
        stripBlockedNoteZh:
          '必须先将自由枪机总成从聚合物枪身内抽出，才能分离双平行导杆与复进簧！',
        stripBlockedNoteEn:
          'Withdraw the blowback bolt assembly from the polymer stock before separating the guide rods!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['p90_guide_rods', 'p90_recoil_springs'],
        bindings: [
          bind('p90_bolt', 1),
          bind('p90_firing_pin', 1),
          bind('p90_guide_rods', 1),
          bind('p90_recoil_springs', 1),
        ],
      },
      {
        id: 'p90_strip_buttplate',
        orderLabel: '05',
        titleZh: '压下尾托卡笋向下滑脱聚合物抵肩底板',
        titleEn: 'Depress Heel Latch & Slide Buttplate Down',
        actionHintZh: '点击尾部抵肩底板，向下滑开敞开后置火控舱门。',
        actionHintEn:
          'Click the polymer buttplate to depress its catch and slide it downward off the stock heel.',
        requires: ['p90_strip_mag'],
        stripBlockedNoteZh: '打开尾托舱门前请先取下顶部 50 发透明弹匣！',
        stripBlockedNoteEn:
          'Remove the top-mounted 50-round magazine before unlatching the rear buttplate!',
        reassembleBlockedNoteZh:
          '必须先将全聚合物击发机盒推回枪托尾舱内，才能上滑锁闭抵肩底板！',
        reassembleBlockedNoteEn:
          'Slide the modular polymer hammer pack back into the rear stock bay before closing the buttplate!',
        triggerPartIds: ['p90_buttplate'],
        bindings: [bind('p90_buttplate', 0)],
      },
      {
        id: 'p90_strip_hammer_pack',
        orderLabel: '06',
        titleZh: '从枪托尾舱向后平拉抽出全塑模块化击发机盒',
        titleEn: 'Slide Modular Polymer Hammer Group Out Rear',
        actionHintZh: '点击全塑击发机盒或回转击锤，无工具向后抽出独立火控模块。',
        actionHintEn:
          'Click the modular polymer hammer pack or hammer to pull it straight out the open stock heel.',
        requires: ['p90_strip_buttplate'],
        stripBlockedNoteZh:
          '聚合物抵肩底板封闭在枪托尾口，必须先压卡笋向下滑脱抵肩底板才能抽出击发机盒！',
        stripBlockedNoteEn:
          'The buttplate seals the rear stock compartment—slide down the buttplate first before pulling the hammer pack!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['p90_hammer_pack', 'p90_hammer'],
        bindings: [bind('p90_hammer_pack', 0), bind('p90_hammer', 0)],
      },
    ],
  },

  lift33: {
    weaponId: 'lift33',
    manualCodeZh: 'Mathews LIFT 33 SwitchWeight-X 弓匠标准勤务保养教范',
    manualCodeEn: 'Mathews LIFT 33 SwitchWeight-X Technician Service SOP',
    steps: [
      {
        id: 'lift33_strip_arrow',
        orderLabel: '01',
        titleZh: '卸下搭弦 400 gr 碳纤维猎箭与三刃猎箭头',
        titleEn: 'Un-Nock 400 gr Carbon Arrow & 3-Blade Broadhead',
        actionHintZh:
          '点击 3D 碳箭或猎箭头，先将实弹箭矢从 D 环与下落式箭台叉片上安全取下。',
        actionHintEn:
          'Click the carbon arrow or broadhead to un-nock and clear the live arrow from the launcher fork.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '复装箭支前必须确保 QAD 下落式箭台、弓弦与 D 环已完整复位！',
        reassembleBlockedNoteEn:
          'Reinstall the drop-away rest, bowstring, and D-loop before nocking the carbon arrow!',
        triggerPartIds: ['lift33_arrow_shaft', 'lift33_broadhead'],
        bindings: [
          bind('lift33_arrow_shaft', 0),
          bind('lift33_broadhead', 0, 1),
        ],
      },
      {
        id: 'lift33_strip_quiver',
        orderLabel: '02',
        titleZh: '解锁 LowPro 快拆拨扣并拆下五支装箭壶总成',
        titleEn: 'Unlatch & Detach LowPro 5-Arrow Quiver Assembly',
        actionHintZh:
          '点击箭壶骨架或快拆拨扣，将侧挂 LowPro 五箭壶连同护头罩向右移出弓身。',
        actionHintEn:
          'Click the LowPro quiver frame or latch to release and detach the 5-arrow quiver assembly.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'lift33_quiver_frame',
          'lift33_quiver_latch',
          'lift33_quiver_hood',
        ],
        bindings: [
          bind('lift33_quiver_latch', 0),
          bind('lift33_quiver_frame', 0),
          bind('lift33_quiver_hood', 0),
        ],
      },
      {
        id: 'lift33_strip_stabilizer',
        orderLabel: '03',
        titleZh: '旋松止付锁紧并抽下 Bridge-Lock 10 英寸减震平衡杆',
        titleEn: 'Unlock & Withdraw 10" Bridge-Lock Stabilizer',
        actionHintZh:
          '点击前方碳纤维平衡杆，顺轴向前抽离 Bridge-Lock 贯穿安装槽。',
        actionHintEn:
          'Click the front carbon stabilizer to draw it forward out of the Bridge-Lock riser pass-through.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['lift33_stabilizer'],
        bindings: [bind('lift33_stabilizer', 0)],
      },
      {
        id: 'lift33_strip_sight_rest',
        orderLabel: '04',
        titleZh: '拆下五针燕尾瞄准器与 QAD Integrate 下落式箭台',
        titleEn: 'Remove Bridge-Lock 5-Pin Sight & QAD Drop-Away Rest',
        actionHintZh:
          '点击瞄准器框体或下落式箭台座，将瞄准光学件与叉片组件分离弓把。',
        actionHintEn:
          'Click the sight housing or QAD rest body to clear the optics and drop-away launcher assembly.',
        requires: ['lift33_strip_arrow'],
        stripBlockedNoteZh:
          '箭杆仍穿过箭台叉片与瞄准环窗口，必须先卸下搭弦碳箭（步骤 01）！',
        stripBlockedNoteEn:
          'The nocked arrow passes directly through the rest launcher—un-nock the arrow (Step 01) first!',
        reassembleBlockedNoteZh:
          '主弦与同步缆正从箭台驱动位置穿过，必须先挂回弓弦总成再锁固瞄具与箭台！',
        reassembleBlockedNoteEn:
          'Reinstall the bowstring and bus cables before remounting the QAD drop-away rest and sight!',
        triggerPartIds: [
          'lift33_sight_housing',
          'lift33_sight_pins',
          'lift33_drop_away_rest',
          'lift33_launcher_fork',
        ],
        bindings: [
          bind('lift33_sight_housing', 0),
          bind('lift33_sight_pins', 0, 1),
          bind('lift33_drop_away_rest', 0),
          bind('lift33_launcher_fork', 0),
        ],
      },
      {
        id: 'lift33_strip_strings_cables',
        orderLabel: '05',
        titleZh: '架上弓压机卸张力并取下主弓弦、D 环与 Y 形同步缆',
        titleEn: 'Press Bow & Remove Bowstring, D-Loop, Yoke Cables & Dampeners',
        actionHintZh:
          '点击主弓弦、D 环或副缆，卸除弹性预紧并脱离双偏心轮弦槽。',
        actionHintEn:
          'Click the bowstring, D-loop, or yoke cables to lift the string set clear of both cam tracks.',
        requires: ['lift33_strip_arrow', 'lift33_strip_sight_rest'],
        stripBlockedNoteZh:
          '必须先清空搭弦箭矢并拆除下落式箭台（步骤 01、04），避免卸弦时拉断驱动缆或刮伤叉片！',
        stripBlockedNoteEn:
          'Un-nock the arrow and clear the drop-away rest (Steps 01 & 04) before pressing and unhooking the bowstring!',
        reassembleBlockedNoteZh:
          '请先将 SwitchWeight-X 偏心轮与四分体碳弓片插回弓兜并穿入轮轴，再挂装主弦与同步缆！',
        reassembleBlockedNoteEn:
          'Reinstall the SwitchWeight-X cams, axles, and split limbs into the pockets before stringing the bow!',
        triggerPartIds: [
          'lift33_bowstring',
          'lift33_d_loop',
          'lift33_yoke_cables',
          'lift33_limb_dampeners',
        ],
        bindings: [
          bind('lift33_bowstring', 0),
          bind('lift33_d_loop', 0),
          bind('lift33_yoke_cables', 0),
          bind('lift33_limb_dampeners', 0),
        ],
      },
      {
        id: 'lift33_strip_cams_limbs',
        orderLabel: '06',
        titleZh: '抽出钛合金轮轴并分解 SwitchWeight-X 凸轮与四分体弓片',
        titleEn: 'Pull Cam Axles & Strip SwitchWeight-X Cams, Limbs & Pockets',
        actionHintZh:
          '点击上下偏心轮或轮轴，完整分解双同步凸轮、四分体碳弓片与上下弓片兜。',
        actionHintEn:
          'Click either SwitchWeight-X cam or axle to disassemble both cams, split limbs, and limb pockets.',
        requires: ['lift33_strip_strings_cables'],
        stripBlockedNoteZh:
          '主弓弦与 Y 形副缆在数百牛顿张力下将凸轮与弓片锁死在轮轴上，严禁带弦强行拔轴！请先完成步骤 05。',
        stripBlockedNoteEn:
          'String and yoke cable tension locks the cams onto the axles—unhook the strings/cables (Step 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'lift33_upper_cam',
          'lift33_lower_cam',
          'lift33_cam_axles',
          'lift33_upper_limbs',
          'lift33_lower_limbs',
        ],
        bindings: [
          bind('lift33_cam_axles', 0),
          bind('lift33_upper_cam', 0),
          bind('lift33_lower_cam', 0),
          bind('lift33_upper_limbs', 0),
          bind('lift33_lower_limbs', 0),
          bind('lift33_upper_pocket', 0),
          bind('lift33_lower_pocket', 0),
        ],
      },
    ],
  },

  r500: {
    weaponId: 'r500',
    manualCodeZh: 'Ravin R500 HexCoil 军械级勤务保养与滑座拆装教范',
    manualCodeEn: 'Ravin R500 HexCoil Armorer Service & Sled Maintenance SOP',
    steps: [
      {
        id: 'r500_strip_quiver',
        orderLabel: '01',
        titleZh: '拆下侧挂三支装低阻力碳箭壶总成',
        titleEn: 'Detach Side-Mount 3-Bolt Carbon Quiver',
        actionHintZh:
          '点击右侧挂箭壶体，沿横向导座将三箭箭壶总成向右侧整体拆离机匣。',
        actionHintEn:
          'Click the side-mounted quiver frame to slide the 3-bolt quiver clear to the right.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['r500_quiver_frame'],
        bindings: [bind('r500_quiver_frame', 0)],
      },
      {
        id: 'r500_strip_scope',
        orderLabel: '02',
        titleZh: '旋松快拆夹具取下 1–8×24 发光测距弩镜',
        titleEn: 'Unclamp 1–8×24 Illuminated Ballistic Crossbow Scope',
        actionHintZh:
          '点击顶部 1–8×24 弩镜，将其从悬空飞轨皮卡汀尼瞄镜桥上垂直取下。',
        actionHintEn:
          'Click the top 1–8×24 scope to lift it upward off the Picatinny optical bridge.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须先将顶部悬浮飞轨及皮卡汀尼瞄镜桥锁固回位，才能重新架装光学弩镜！',
        reassembleBlockedNoteEn:
          'Reinstall the top flight track optical bridge before clamping the 1–8×24 scope back on!',
        triggerPartIds: ['r500_scope'],
        bindings: [bind('r500_scope', 0)],
      },
      {
        id: 'r500_strip_bolt',
        orderLabel: '03',
        titleZh: '抬起弹簧压箭片并向前抽出 20 英寸竞赛碳纤维弩箭',
        titleEn: 'Lift Bolt Retention Arm & Unload 20" Match Carbon Bolt',
        actionHintZh:
          '点击压箭弹片或碳纤维弩箭，释放尾扣压力并将实弹弩箭向前端安全退出。',
        actionHintEn:
          'Click the retention arm or carbon bolt to clear tension and slide the 20" bolt forward.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须在顶部飞轨与 Trac-Trigger 滑座就位后，再装入碳箭并压紧防跳压片！',
        reassembleBlockedNoteEn:
          'Ensure the top flight track and Trac-Trigger sled are seated before reloading the carbon bolt!',
        triggerPartIds: ['r500_carbon_bolt', 'r500_retention_arm'],
        bindings: [
          bind('r500_carbon_bolt', 0),
          bind('r500_retention_arm', 0),
        ],
      },
      {
        id: 'r500_strip_buttstock_crank',
        orderLabel: '04',
        titleZh: '拆下无托镂空枪托并抽出 Versa-Drive 双向丝杠驱动轴',
        titleEn: 'Remove Bullpup Buttstock & Withdraw Versa-Drive Leadscrew',
        actionHintZh:
          '点击尾部抵肩枪托或双向螺旋丝杠，从主机匣后端向后抽出精密传动丝杠。',
        actionHintEn:
          'Click the bullpup buttstock or Versa-Drive leadscrew to withdraw the crank screw rearward.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '必须先将 Trac-Trigger 滑座复位入轨，再穿入 Versa-Drive 丝杠并闭合无托尾段！',
        reassembleBlockedNoteEn:
          'Seat the Trac-Trigger sled inside the rail bay before threading in the Versa-Drive leadscrew!',
        triggerPartIds: ['r500_buttstock', 'r500_versadrive_screw'],
        bindings: [
          bind('r500_buttstock', 0),
          bind('r500_versadrive_screw', 0, 1),
        ],
      },
      {
        id: 'r500_strip_flight_rail',
        orderLabel: '05',
        titleZh: '拆除高架悬空飞轨与皮卡汀尼瞄具桥盖',
        titleEn: 'Lift Elevated Zero-Friction Flight Track & Optical Bridge',
        actionHintZh:
          '点击顶部悬空飞轨桥壳，垂直抬起敞开内部 Trac-Trigger 悬浮火控滑道。',
        actionHintEn:
          'Click the top flight track bridge to lift the upper housing clear of the sled channel.',
        requires: ['r500_strip_scope', 'r500_strip_bolt'],
        stripBlockedNoteZh:
          '顶部光学瞄具与压紧中的 20 英寸弩箭卡住飞轨桥体，请先拆下弩镜并退出碳箭（步骤 02、03）！',
        stripBlockedNoteEn:
          'The mounted scope and retained 20" bolt pin down the flight rail—remove the scope and bolt (Steps 02 & 03) first!',
        reassembleBlockedNoteZh:
          '必须先将 Trac-Trigger 悬浮滑座、挂弦爪与防空放阻铁装回滑道内，再闭合顶部飞轨桥！',
        reassembleBlockedNoteEn:
          'Reinstall the Trac-Trigger sled, string latch, and anti-dry-fire lock before closing the flight track!',
        triggerPartIds: ['r500_flight_rail'],
        bindings: [bind('r500_flight_rail', 0)],
      },
      {
        id: 'r500_strip_trigger_sled',
        orderLabel: '06',
        titleZh: '取出 Trac-Trigger 悬浮挂弦滑座、防空放阻块与复位簧',
        titleEn: 'Withdraw Trac-Trigger Sled, String Latch & Anti-Dry-Fire Pack',
        actionHintZh:
          '点击内部悬浮火控滑座、挂弦卡爪或铜色防空放锁，将精密释放总成整体升起取出。',
        actionHintEn:
          'Click the floating trigger sled, string latch, or anti-dry-fire safety to lift the release assembly out.',
        requires: ['r500_strip_flight_rail', 'r500_strip_buttstock_crank'],
        stripBlockedNoteZh:
          'Trac-Trigger 滑座被顶部飞轨桥遮盖且内孔仍啮合在 Versa-Drive 丝杠上，请先拆飞轨并抽出丝杠（步骤 04、05）！',
        stripBlockedNoteEn:
          'The flight bridge encloses the sled and the Versa-Drive screw threads through it—remove the rail and crank screw (Steps 04 & 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'r500_trigger_sled',
          'r500_string_latch',
          'r500_anti_dry_fire',
          'r500_trigger_spring',
        ],
        bindings: [
          bind('r500_trigger_sled', 0),
          bind('r500_string_latch', 0),
          bind('r500_anti_dry_fire', 0),
          bind('r500_trigger_spring', 0),
        ],
      },
    ],
  },

  python: {
    weaponId: 'python',
    manualCodeZh: 'Colt 1955 军械师保养手册 · I型转轮框与V簧发条拆装教范',
    manualCodeEn: 'Colt 1955 Factory Shop Manual · I-Frame & V-Spring Clockwork SOP',
    steps: [
      {
        id: 'python_strip_latch',
        orderLabel: '01',
        titleZh: '向后拉动左侧水滴形防滑弹巢解脱栓',
        titleEn: 'Pull Rearward Checkered Teardrop Cylinder Latch',
        actionHintZh:
          '点击转轮框左侧滚花水滴形开锁推钮，向后抽退中心定位销解脱弹巢前锁。',
        actionHintEn:
          'Click the left-side checkered teardrop thumbpiece to retract the center pin and unlock the cylinder.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '复装锁栓归位前，必须先将摇臂与 6 发弹巢总成合拢锁入转轮框窗内！',
        reassembleBlockedNoteEn:
          'Close the crane and 6-shot cylinder back into the frame window before resetting the thumbpiece latch!',
        triggerPartIds: ['python_cylinder_latch'],
        bindings: [bind('python_cylinder_latch', 0)],
      },
      {
        id: 'python_strip_swing_cylinder',
        orderLabel: '02',
        titleZh: '向左摆出摇臂与6发弹巢并移开快装器验枪',
        titleEn: 'Swing Out Crane & 6-Shot Cylinder Assembly to Clear',
        actionHintZh:
          '点击6发凹槽弹巢、摇臂或快装器，将弹巢总成沿左侧铰链轴摆出框窗清空弹膛。',
        actionHintEn:
          'Click the fluted cylinder, crane yoke, or speedloader to swing the cylinder assembly clear to the left.',
        requires: ['python_strip_latch'],
        stripBlockedNoteZh:
          '中心定位销仍锁死弹巢尾端，严禁强行硬掰摇臂！请先向后拉动左侧弹巢解脱栓（步骤 01）。',
        stripBlockedNoteEn:
          'The center pin still locks the cylinder—pull back the teardrop cylinder latch (Step 01) before swinging out the crane!',
        reassembleBlockedNoteZh:
          '合拢摇臂前必须先将星形退壳器、退壳杆与复位簧旋紧装回弹巢孔内！',
        reassembleBlockedNoteEn:
          'Reassemble the extractor star, ejector rod, and return spring into the cylinder before closing the crane!',
        triggerPartIds: ['python_cylinder', 'python_crane', 'python_speedloader'],
        bindings: [
          bind('python_crane', 0),
          bind('python_cylinder', 0),
          bind('python_extractor_star', 0),
          bind('python_extractor_rod', 0),
          bind('python_extractor_spring', 0),
          bind('python_speedloader', 0),
        ],
      },
      {
        id: 'python_strip_extractor',
        orderLabel: '03',
        titleZh: '逆旋拧下左旋螺纹退壳杆并分解星形退壳器组',
        titleEn: 'Unscrew Left-Hand Ejector Rod & Strip Extractor Star Assembly',
        actionHintZh:
          '点击滚花退壳顶杆或六角星形退壳器，拆出中心退壳杆、复位压簧与棘轮星形盘。',
        actionHintEn:
          'Click the knurled ejector rod or extractor star to separate the rod, return spring, and 6-star ratchet.',
        requires: ['python_strip_swing_cylinder'],
        stripBlockedNoteZh:
          '退壳杆被枪管下方全长护罩严密包覆，必须先摆出弹巢摇臂总成（步骤 02）！',
        stripBlockedNoteEn:
          'The full-lug underbarrel shroud encloses the ejector rod—swing out the cylinder assembly (Step 02) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'python_extractor_rod',
          'python_extractor_star',
          'python_extractor_spring',
        ],
        bindings: [
          bind('python_crane', 1),
          bind('python_cylinder', 1),
          bind('python_extractor_star', 1),
          bind('python_extractor_rod', 1),
          bind('python_extractor_spring', 1),
          bind('python_speedloader', 1),
        ],
      },
      {
        id: 'python_strip_grips',
        orderLabel: '04',
        titleZh: '旋下握把贯通螺钉并取下左右胡桃木靶用护片',
        titleEn: 'Unscrew & Detach Checkered American Walnut Target Grips',
        actionHintZh:
          '点击左或右侧菱格纹美洲胡桃木握把护片，露握把骨架内的折叠 V 型主发条簧。',
        actionHintEn:
          'Click either checkered American walnut target grip panel to expose the frame grip strap and V-mainspring.',
        requires: ['python_strip_swing_cylinder'],
        stripBlockedNoteZh:
          '军械师拆装铁律：进入内部火控拆解前必须先摆出弹巢清空验枪（步骤 02）！',
        stripBlockedNoteEn:
          'Armorer safety rule: swing out and clear the 6-shot cylinder (Step 02) before stripping grips or lockwork!',
        reassembleBlockedNoteZh:
          '装回胡桃木握把护片前，必须先装妥全部火控机件并锁紧左侧机匣盖板与螺钉！',
        reassembleBlockedNoteEn:
          'Reinstall the V-mainspring, lockwork, and fitted sideplate screws before mounting the walnut grip panels!',
        triggerPartIds: ['python_grip_left', 'python_grip_right'],
        bindings: [bind('python_grip_left', 0), bind('python_grip_right', 0)],
      },
      {
        id: 'python_strip_sideplate',
        orderLabel: '05',
        titleZh: '用专用平口起子旋出盖板螺钉并轻敲震落侧盖板',
        titleEn: 'Remove Gunsmith Sideplate Screws & Tap Off Fitted Sideplate',
        actionHintZh:
          '点击机匣侧盖板或螺钉（严禁撬动边缘），垂直平移取下精配严丝合缝的侧盖板。',
        actionHintEn:
          'Click the fitted lockwork sideplate or screws to lift the sideplate straight off without prying.',
        requires: ['python_strip_grips'],
        stripBlockedNoteZh:
          '后下方盖板边缘延伸至胡桃木靶用握把护片下方遮挡，请先拆下胡桃木握把（步骤 04）！',
        stripBlockedNoteEn:
          'The target walnut grips overlap the lower sideplate heel—remove the walnut grips (Step 04) first!',
        reassembleBlockedNoteZh:
          '合上侧盖板前必须先将双动击锤、扳机、回弹杠杆、双阶拨爪与 V 型主簧装回销轴！',
        reassembleBlockedNoteEn:
          'Seat the DA/SA hammer, trigger, rebound lever, hand, and V-mainspring onto their studs before closing the sideplate!',
        triggerPartIds: ['python_sideplate', 'python_sideplate_screws'],
        bindings: [
          bind('python_sideplate_screws', 0),
          bind('python_sideplate', 0),
        ],
      },
      {
        id: 'python_strip_clockwork',
        orderLabel: '06',
        titleZh: '摘除折叠V型主簧并依次取出击锤、回弹杆与拨爪组',
        titleEn: 'Unhook Folded V-Mainspring & Lift DA/SA Lockwork Assembly',
        actionHintZh:
          '点击折叠 V 型板簧、宽大靶用击锤或回弹安全杠杆，完整分解柯尔特手工调校钟表级火控组。',
        actionHintEn:
          'Click the V-mainspring, wide target hammer, or rebound lever to strip the hand-tuned Colt clockwork.',
        requires: ['python_strip_sideplate'],
        stripBlockedNoteZh:
          '火控机件与销轴全数封闭于机匣侧盖板内腔，请先拆下侧盖板与螺钉（步骤 05）！',
        stripBlockedNoteEn:
          'All lockwork pivots are enclosed beneath the fitted sideplate—remove the sideplate (Step 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'python_mainspring',
          'python_hammer',
          'python_rebound_lever',
          'python_trigger',
          'python_hand',
          'python_cylinder_bolt',
        ],
        bindings: [
          bind('python_mainspring', 0),
          bind('python_hammer', 0),
          bind('python_hammer_stirrup', 0),
          bind('python_rebound_lever', 0),
          bind('python_trigger', 0),
          bind('python_hand', 0),
          bind('python_cylinder_bolt', 0),
          bind('python_firing_pin', 0),
        ],
      },
    ],
  },

  benellim4: {
    weaponId: 'benellim4',
    manualCodeZh: 'USMC TM 10698A-10/1 · M1014 免工具野战勤务分解教范',
    manualCodeEn: 'USMC TM 10698A-10/1 · M1014 Combat Shotgun Tool-Less Field-Strip',
    steps: [
      {
        id: 'bm4_strip_mag_cap',
        orderLabel: '01',
        titleZh: '验枪清仓后徒手旋下防松棘齿管仓前端盖',
        titleEn: 'Clear Chamber/Tube & Unscrew Ratcheting Magazine End-Cap',
        actionHintZh:
          '点击弹仓最前端粗滚花钢制螺盖，克服弹簧定位销咔哒棘齿阻力向前旋出。',
        actionHintEn:
          'Click the knurled front magazine tube end-cap to unscrew it past the spring-loaded detentclicks.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '旋紧弹仓前端螺盖前，必须先将 18.5 英寸枪管导环与双片式护木套回管式弹仓上！',
        reassembleBlockedNoteEn:
          'Slide the 18.5" barrel guide ring and two-piece forend back over the magazine tube before threading the cap!',
        triggerPartIds: ['benellim4_mag_cap'],
        bindings: [bind('benellim4_mag_cap', 0)],
      },
      {
        id: 'bm4_strip_barrel_forend',
        orderLabel: '02',
        titleZh: '向前拔出 18.5 英寸枪管（连同 ARGO 导气座）与双片护木',
        titleEn: 'Pull Forward 18.5" Barrel Assembly & Two-Piece Polymer Forend',
        actionHintZh:
          '点击镀铬滑膛枪管或聚合物护木，顺弹仓轴线向前整体抽离铝机匣节套。',
        actionHintEn:
          'Click the 18.5" barrel or polymer forend to draw the barrel/ARGO block assembly forward off the receiver.',
        requires: ['bm4_strip_mag_cap'],
        stripBlockedNoteZh:
          '枪管导环与护木前端被防松棘齿弹仓端盖死死压紧固定，请先旋下弹仓前端螺盖（步骤 01）！',
        stripBlockedNoteEn:
          'The ratcheting magazine end-cap clamps the barrel guide ring and forend—unscrew the cap (Step 01) first!',
        reassembleBlockedNoteZh:
          '插回枪管前，必须先将双路不锈钢 ARGO 活塞装回导气筒并将枪机框总成推入机匣导轨！',
        reassembleBlockedNoteEn:
          'Reinstall the twin ARGO pistons/plugs and seat the bolt carrier group into the receiver before fitting the barrel!',
        triggerPartIds: ['benellim4_barrel', 'benellim4_forend'],
        bindings: [
          bind('benellim4_barrel', 0),
          bind('benellim4_front_sight', 0),
          bind('benellim4_argo_plugs', 0),
          bind('benellim4_argo_pistons', 0),
          bind('benellim4_forend', 0),
        ],
      },
      {
        id: 'bm4_strip_argo',
        orderLabel: '03',
        titleZh: '以拉机柄作扳手旋下导气塞并抽出左右双路 ARGO 活塞',
        titleEn: 'Unscrew Dual Gas Plugs & Withdraw Twin Stainless ARGO Pistons',
        actionHintZh:
          '点击枪管下方左右并列导气螺塞或不锈钢短行程活塞杆，向前抽出自清洁双活塞组。',
        actionHintEn:
          'Click the dual ARGO front gas plugs or stainless short-stroke pistons to extract both gas tappets.',
        requires: ['bm4_strip_barrel_forend'],
        stripBlockedNoteZh:
          '护木前罩遮挡导气筒操作空间，请先向前拆下枪管与护木总成（步骤 02）！',
        stripBlockedNoteEn:
          'Remove the barrel and two-piece forend assembly (Step 02) before servicing the dual ARGO gas plugs!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['benellim4_argo_plugs', 'benellim4_argo_pistons'],
        bindings: [
          bind('benellim4_argo_plugs', 1),
          bind('benellim4_argo_pistons', 1),
        ],
      },
      {
        id: 'bm4_strip_charging_bcg',
        orderLabel: '04',
        titleZh: '旋转拔出滚花拉机柄并将回转枪机框总成向前滑出机匣',
        titleEn: 'Twist-Pull Knurled Charging Handle & Slide Bolt Carrier Group Out',
        actionHintZh:
          '点击右侧拉机柄或枪机框体，旋转解锁拉机柄卡槽后将枪机组顺机匣前口滑出。',
        actionHintEn:
          'Click the knurled charging handle or bolt carrier to twist-pull the handle and slide the BCG forward.',
        requires: ['bm4_strip_barrel_forend'],
        stripBlockedNoteZh:
          '枪管节套封堵机匣前端且拉机柄阻挡枪机框前移，请先拆下 18.5 英寸枪管总成（步骤 02）！',
        stripBlockedNoteEn:
          'The barrel extension closes the front of the receiver—pull off the barrel assembly (Step 02) first!',
        reassembleBlockedNoteZh:
          '将枪机框推回机匣前，必须先合装硬铬双突笋枪机头、凸轮销与长击针，并先装回火控盒！',
        reassembleBlockedNoteEn:
          'Reassemble the bolt head, cam pin, and firing pin into the carrier and seat the trigger pack before sliding the BCG in!',
        triggerPartIds: ['benellim4_charging_handle', 'benellim4_bolt_carrier'],
        bindings: [
          bind('benellim4_charging_handle', 0),
          bind('benellim4_bolt_carrier', 0),
          bind('benellim4_bolt_head', 0),
          bind('benellim4_cam_pin', 0),
          bind('benellim4_firing_pin', 0),
        ],
      },
      {
        id: 'bm4_strip_bolt_head',
        orderLabel: '05',
        titleZh: '抽出枪机凸轮销并分离硬铬双突笋枪机头与长击针',
        titleEn: 'Pull Cam Pin & Separate Hard-Chrome 2-Lug Bolt Head & Firing Pin',
        actionHintZh:
          '点击硬铬双突笋枪机头、凸轮销或击针，完整分解枪机螺旋解锁核心组件。',
        actionHintEn:
          'Click the hard-chrome 2-lug bolt head, cam pin, or firing pin to field-strip the rotating bolt group.',
        requires: ['bm4_strip_charging_bcg'],
        stripBlockedNoteZh:
          '凸轮销被铝机匣内导轨侧面限位封闭，必须先拔拉机柄并滑出枪机框总成（步骤 04）！',
        stripBlockedNoteEn:
          'Receiver guide rails retain the cam pin—extract the charging handle and bolt carrier group (Step 04) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'benellim4_bolt_head',
          'benellim4_cam_pin',
          'benellim4_firing_pin',
        ],
        bindings: [
          bind('benellim4_cam_pin', 1),
          bind('benellim4_bolt_head', 1),
          bind('benellim4_firing_pin', 1),
          bind('benellim4_bolt_carrier', 1),
        ],
      },
      {
        id: 'bm4_strip_trigger_pack',
        orderLabel: '06',
        titleZh: '用拉机柄尖端顶出机匣横销并向下取出火控盒与升降托弹板',
        titleEn: 'Push Receiver Cross-Pin & Drop Modular Trigger Pack w/ Shell Elevator',
        actionHintZh:
          '点击铝合金扳机护圈座或不锈钢升降托弹板，压住放弹片将模块化火控总成向前下方抽出。',
        actionHintEn:
          'Click the aluminum trigger housing or stainless shell elevator to drop the modular trigger group free.',
        requires: ['bm4_strip_charging_bcg'],
        stripBlockedNoteZh:
          '机匣内的枪机框底面压制击锤与托弹板连杆，请先滑出枪机框总成（步骤 04）再拆火控盒！',
        stripBlockedNoteEn:
          'Clear the bolt carrier group (Step 04) from the receiver before dropping the trigger pack and shell elevator!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'benellim4_trigger_housing',
          'benellim4_trigger',
          'benellim4_shell_elevator',
        ],
        bindings: [
          bind('benellim4_trigger_housing', 0),
          bind('benellim4_trigger', 0),
          bind('benellim4_hammer', 0),
          bind('benellim4_hammer_spring', 0),
          bind('benellim4_safety_button', 0),
          bind('benellim4_shell_elevator', 0),
        ],
      },
    ],
  },

  garand: {
    weaponId: 'garand',
    manualCodeZh: 'US Army FM 23-5 · M1 加兰德步枪三大总成与机件野战分解教范',
    manualCodeEn: 'US Army FM 23-5 · U.S. Rifle Cal. .30 M1 Garand Field-Strip SOP',
    steps: [
      {
        id: 'garand_strip_clip',
        orderLabel: '01',
        titleZh: '后拉挂机按压左侧漏夹卡笋弹出 8 发弹簧钢整装漏夹',
        titleEn: 'Lock Action, Depress Clip Latch & Eject 8-Round En-Bloc Clip',
        actionHintZh:
          '点击开顶机匣内的黑色弹簧钢 8 发漏夹，排空弹仓并闭合枪机后拨上护圈冬季保险。',
        actionHintEn:
          'Click the parked 8-round spring-steel en-bloc clip to eject it from the receiver well and clear the rifle.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '压入 8 发弹簧钢整装漏夹前，必须先将枪机、拉机柄、胡桃木枪托与火控组全部复装锁紧！',
        reassembleBlockedNoteEn:
          'Complete full rifle reassembly—bolt, op-rod, stock, and latched trigger guard—before inserting the en-bloc clip!',
        triggerPartIds: ['garand_enbloc_clip'],
        bindings: [bind('garand_enbloc_clip', 0)],
      },
      {
        id: 'garand_strip_trigger_group',
        orderLabel: '02',
        titleZh: '向后上方勾开铣削扳机护圈锁耳并垂直抽出快拆火控总成',
        titleEn: 'Unlatch Milled Trigger Guard & Lift Out Trigger Housing Group',
        actionHintZh:
          '点击冬季大扳机护圈或锻钢火控盒，以护圈作杠杆解脱机匣挂耳并整体抽出火控组。',
        actionHintEn:
          'Click the milled trigger guard or trigger housing to unlatch the locking lugs and pull the trigger group free.',
        requires: ['garand_strip_clip'],
        stripBlockedNoteZh:
          '军械安全死命令：严禁带夹带弹分解火控盒！必须先按压卡笋弹出 8 发漏夹清空弹膛（步骤 01）。',
        stripBlockedNoteEn:
          'FM 23-5 safety rule: eject the 8-round en-bloc clip and clear the chamber (Step 01) before unlatching the trigger guard!',
        reassembleBlockedNoteZh:
          '锁紧扳机护圈前必须先将机匣枪管总成压入美洲黑胡桃木全枪托槽内定位（扳机护圈兼作机匣与木托的主锁紧楔）！',
        reassembleBlockedNoteEn:
          'Seat the barreled receiver into the American black walnut stock before latching the clamping trigger group!',
        triggerPartIds: [
          'garand_trigger_guard',
          'garand_trigger_housing',
          'garand_trigger',
        ],
        bindings: [
          bind('garand_trigger_guard', 0, 1),
          bind('garand_trigger_housing', 0),
          bind('garand_trigger', 0),
          bind('garand_hammer', 0),
          bind('garand_hammer_spring', 0),
        ],
      },
      {
        id: 'garand_strip_stock',
        orderLabel: '03',
        titleZh: '将机匣枪管金属总成向上抬离油浸美洲黑胡桃木全枪托',
        titleEn: 'Separate Barreled Receiver Group from American Black Walnut Stock',
        actionHintZh:
          '点击一体式胡桃木枪托或钢制枪托底板，使金属受压总成与木托彻底分离为三大勤务组件。',
        actionHintEn:
          'Click the walnut stock or steel buttplate to separate the barreled receiver from the stock group.',
        requires: ['garand_strip_trigger_group'],
        stripBlockedNoteZh:
          '扳机护圈锁耳将机匣与胡桃木枪托上下紧紧楔死咬合，请先勾开护圈拆出火控总成（步骤 02）！',
        stripBlockedNoteEn:
          'The latched trigger housing clamps the receiver into the walnut bedding—remove the trigger group (Step 02) first!',
        reassembleBlockedNoteZh:
          '扣合胡桃木枪托前必须先装回回转枪机、长行程拉机柄并将复进簧叉钩挂回托弹臂！',
        reassembleBlockedNoteEn:
          'Reinstall the rotating bolt, curved op-rod, and operating-rod spring onto the receiver before bedding the stock!',
        triggerPartIds: ['garand_walnut_stock', 'garand_buttplate'],
        bindings: [
          bind('garand_walnut_stock', 0),
          bind('garand_buttplate', 0),
        ],
      },
      {
        id: 'garand_strip_op_rod_spring',
        orderLabel: '04',
        titleZh: '摘脱托弹臂叉口并从拉机柄空心管内抽出超长复进簧',
        titleEn: 'Unhook Follower Rod Fork & Withdraw Long Op-Rod Recoil Spring',
        actionHintZh:
          '点击枪管下方长行程螺旋复进簧，稳控预紧弹力解除叉口啮合并向后平顺抽出弹簧。',
        actionHintEn:
          'Click the long operating-rod recoil spring to unhook the follower rod fork and withdraw the spring rearward.',
        requires: ['garand_strip_stock'],
        stripBlockedNoteZh:
          '下托弹臂与复进簧后段深藏在胡桃木枪托前护木槽内，请先分离胡桃木枪托（步骤 03）！',
        stripBlockedNoteEn:
          'The walnut stock forend encloses the follower rod and recoil spring—separate the stock (Step 03) first!',
        reassembleBlockedNoteZh:
          '穿入长行程复进簧前，必须先将 S 形弯曲拉机柄导笋压回机匣右侧导槽内就位！',
        reassembleBlockedNoteEn:
          'Seat the curved S-bend operating rod back onto its receiver track before inserting the recoil spring!',
        triggerPartIds: ['garand_op_rod_spring'],
        bindings: [bind('garand_op_rod_spring', 0)],
      },
      {
        id: 'garand_strip_op_rod',
        orderLabel: '05',
        titleZh: '后拉对准机匣分解缺口并向上外挑脱出 S 形弯曲长行程拉机柄',
        titleEn: 'Align Dismount Notch & Lift S-Curved Operating Rod Off Track',
        actionHintZh:
          '点击右侧 S 形避让弯曲长行程拉机柄，对准机匣导轨分解缺口上提并向前抽出不锈钢导气筒。',
        actionHintEn:
          'Click the S-curved long-stroke operating rod to lift its tab out of the dismount notch and draw it clear.',
        requires: ['garand_strip_op_rod_spring'],
        stripBlockedNoteZh:
          '拉机柄空心管内仍穿有高预紧度复进簧顶死，严禁带簧强撬拉机柄！请先抽出复进簧（步骤 04）。',
        stripBlockedNoteEn:
          'High recoil-spring tension loads the op-rod tube—unhook and withdraw the op-rod spring (Step 04) first!',
        reassembleBlockedNoteZh:
          '装回拉机柄前必须先将双突笋回转枪机与长击针斜旋压入机匣导轨，使右侧开锁突笋等待嵌入拉机柄驼峰凸轮槽！',
        reassembleBlockedNoteEn:
          'Cam the 2-lug rotating bolt and firing pin into the receiver bridge before engaging the op-rod cam hump!',
        triggerPartIds: ['garand_op_rod'],
        bindings: [bind('garand_op_rod', 0)],
      },
      {
        id: 'garand_strip_bolt',
        orderLabel: '06',
        titleZh: '向前上方斜推旋出双突笋回转闭锁枪机与防惯性长击针',
        titleEn: 'Cam 2-Lug Rotating Breech Bolt & Firing Pin Forward-Upward Out',
        actionHintZh:
          '点击开顶机匣内的双突笋回转枪机或长击针，令右闭锁突笋滑离机匣桥槽向上取出枪机。',
        actionHintEn:
          'Click the 2-lug rotating bolt or firing pin to cam the right lug free of the receiver tang and lift out.',
        requires: ['garand_strip_op_rod'],
        stripBlockedNoteZh:
          '枪机右侧操作突笋正嵌在拉机柄螺旋驼峰凸轮槽内锁合，必须先卸下 S 形拉机柄（步骤 05）！',
        stripBlockedNoteEn:
          'The bolt’s right operating lug rides captive inside the op-rod cam hump—remove the op-rod (Step 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['garand_bolt', 'garand_firing_pin'],
        bindings: [bind('garand_bolt', 0), bind('garand_firing_pin', 0)],
      },
    ],
  },

  // =========================================================================
  // 17. FN M249 SAW (5.56x45mm NATO) — Open-Bolt Belt/STANAG Squad Automatic Weapon
  // =========================================================================
  m249: {
    weaponId: 'm249',
    manualCodeZh: 'TM 9-1005-201-10 · 美军M249班用机枪野战快拆教范',
    manualCodeEn: 'TM 9-1005-201-10 · U.S. M249 SAW Operator Field-Strip',
    steps: [
      {
        id: 'm249_strip_cover_belt',
        orderLabel: '01',
        titleZh: '捏压尾锁栓掀开受弹器顶盖，清卸 M27 弹链与 200 发突击弹箱',
        titleEn: 'Unlatch Top Feed Cover & Clear M27 Belt / 200-Rd SAW Box',
        actionHintZh:
          '点击铰接顶盖、M27 可散金属弹链、受弹器托盘或下挂 200 发聚合物弹箱，执行清枪验膛。',
        actionHintEn:
          'Click the hinged top cover, M27 belt, feed tray, or 200-round assault box to clear ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '合拢受弹器顶盖并装挂弹链前，必须先装回快拆枪管、活塞枪机组、复进簧与握把火控盒！',
        reassembleBlockedNoteEn:
          'Reinstall the quick-change barrel, piston/bolt group, recoil spring, and trigger frame before closing the feed cover!',
        triggerPartIds: [
          'm249_top_cover',
          'm249_m27_belt',
          'm249_ammo_box',
          'm249_feed_tray',
        ],
        bindings: [
          bind('m249_top_cover', 0),
          bind('m249_rear_sight', 0),
          bind('m249_feed_lever', 0),
          bind('m249_feed_pawls', 0),
          bind('m249_m27_belt', 0),
          bind('m249_ammo_box', 0),
          bind('m249_feed_tray', 0),
        ],
      },
      {
        id: 'm249_strip_barrel',
        orderLabel: '02',
        titleZh: '按压快拆锁舌并提握隔热提把向前秒拆 18.3 英寸镀铬重枪管',
        titleEn: 'Depress Barrel Latch & Withdraw 18.3" Quick-Change Barrel Forward',
        actionHintZh:
          '点击 18.3 英寸快拆枪管、折叠隔热提把或前导气调节箍，免工具向前抽出枪管总成。',
        actionHintEn:
          'Click the 18.3" barrel, insulated carry handle, or gas regulator collar to slide the barrel forward.',
        requires: ['m249_strip_cover_belt'],
        stripBlockedNoteZh:
          '安全红线：拆卸快拆枪管前必须先掀开受弹器顶盖、清卸 M27 弹链并确认弹膛无弹（步骤 01）！',
        stripBlockedNoteEn:
          'TM 9-1005-201-10 safety rule: open the top cover and clear the M27 belt (Step 01) before removing the barrel!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'm249_barrel',
          'm249_barrel_handle',
          'm249_gas_regulator',
        ],
        bindings: [
          bind('m249_barrel', 0),
          bind('m249_barrel_handle', 0),
          bind('m249_gas_regulator', 0),
          bind('m249_front_sight', 0),
        ],
      },
      {
        id: 'm249_strip_stock_spring',
        orderLabel: '03',
        titleZh: '拔出机匣上横销下折枪托与液压缓冲器，向后抽出长行程复进主簧',
        titleEn: 'Unpin Buttstock / Hydraulic Buffer & Withdraw Driving Recoil Spring',
        actionHintZh:
          '点击聚合物固定枪托、内置液压阻尼缓冲器或长行程螺旋复进簧，释放尾端蓄能约束。',
        actionHintEn:
          'Click the polymer buttstock, hydraulic buffer, or captive recoil spring to release rear spring tension.',
        requires: ['m249_strip_cover_belt'],
        stripBlockedNoteZh:
          '释放高预紧度复进驱动主簧前，必须先掀开顶盖清空 M27 弹链（步骤 01），严防枪机失控前冲推弹走火！',
        stripBlockedNoteEn:
          'Clear the top cover and M27 belt (Step 01) before unpinning the buttstock—releasing spring tension on a live belt risks discharge!',
        reassembleBlockedNoteZh:
          '插回长复进主簧并锁合液压缓冲枪托前，必须先将长行程活塞枪机组与火控盒装回机匣导轨！',
        reassembleBlockedNoteEn:
          'Slide the piston/bolt carrier group and trigger pack back into the receiver before seating the recoil spring and buttstock!',
        triggerPartIds: [
          'm249_buttstock',
          'm249_hydraulic_buffer',
          'm249_recoil_spring',
        ],
        bindings: [
          bind('m249_buttstock', 0),
          bind('m249_hydraulic_buffer', 0),
          bind('m249_recoil_spring', 0),
        ],
      },
      {
        id: 'm249_strip_piston_bcg',
        orderLabel: '04',
        titleZh: '后拉右侧拉机柄，从机匣尾口平顺抽出长行程导气活塞与枪机总成',
        titleEn: 'Retract Charging Handle & Withdraw Long-Stroke Piston / Bolt Group',
        actionHintZh:
          '点击带顶部拨弹滚轮的长行程导气活塞滑块或右侧拉机柄，将自动机总成向后抽出机匣。',
        actionHintEn:
          'Click the long-stroke gas piston slide carrier or right-side charging handle to withdraw the moving group rearward.',
        requires: ['m249_strip_stock_spring'],
        stripBlockedNoteZh:
          '机匣尾口正被聚合物枪托、液压缓冲器与长行程复进簧封堵，请先拆下尾托与复进主簧（步骤 03）！',
        stripBlockedNoteEn:
          'The buttstock, hydraulic buffer, and recoil spring seal the rear of the receiver—complete Step 03 first!',
        reassembleBlockedNoteZh:
          '将活塞滑块推入机匣导轨前，必须先将双突笋回转枪机与联动击针装回滑块塔座（步骤 05）！',
        reassembleBlockedNoteEn:
          'Mount the 2-lug rotating bolt and slide-linked firing pin onto the piston tower (Step 05) before inserting into the receiver!',
        triggerPartIds: ['m249_piston_carrier', 'm249_charging_handle'],
        bindings: [
          bind('m249_charging_handle', 0),
          bind('m249_piston_carrier', 0),
          bind('m249_bolt', 0),
          bind('m249_firing_pin', 0),
        ],
      },
      {
        id: 'm249_strip_bolt_pin',
        orderLabel: '05',
        titleZh: '从活塞滑块塔座上解脱双突笋回转闭锁枪机与防早发联动击针',
        titleEn: 'Separate 2-Lug Rotating Breech Bolt & Timed Firing Pin from Piston Tower',
        actionHintZh:
          '点击镀铬双突笋回转枪机或滑块联动击针，将其与长行程导气活塞滑块分离擦拭积碳。',
        actionHintEn:
          'Click the hard-chrome 2-lug rotating bolt or firing pin to separate them from the piston slide tower.',
        requires: ['m249_strip_piston_bcg'],
        stripBlockedNoteZh:
          '回转枪机与击针受机匣硬化内导轨约束锁合在活塞滑块上，请先从机匣后方抽出活塞枪机总成（步骤 04）！',
        stripBlockedNoteEn:
          'Receiver rails retain the bolt and firing pin on the piston carrier—withdraw the moving group (Step 04) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m249_bolt', 'm249_firing_pin'],
        bindings: [
          bind('m249_piston_carrier', 1),
          bind('m249_bolt', 1),
          bind('m249_firing_pin', 1),
        ],
      },
      {
        id: 'm249_strip_trigger_pack',
        orderLabel: '06',
        titleZh: '推出机匣腹下系留横销，向下卸除快拆握把与重型开膛待击阻铁盒',
        titleEn: 'Push Lower Cross-Pins & Drop Open-Bolt Sear Trigger Mechanism',
        actionHintZh:
          '点击快拆握把火控座、重型渗碳开膛阻铁或宽弧面钢扳机，整体取下下部火控模块。',
        actionHintEn:
          'Click the pinned trigger frame, heavy open-bolt sear, or trigger shoe to drop the fire-control module.',
        requires: ['m249_strip_stock_spring'],
        stripBlockedNoteZh:
          '枪托下连接耳与复进簧预紧载荷正锁压火控横销，请先解脱枪托并取出复进主簧（步骤 03）！',
        stripBlockedNoteEn:
          'The buttstock lower lug and recoil-spring load retain the trigger cross-pins—complete Step 03 first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'm249_trigger_frame',
          'm249_open_bolt_sear',
          'm249_trigger',
        ],
        bindings: [
          bind('m249_trigger_frame', 0),
          bind('m249_trigger', 0),
          bind('m249_open_bolt_sear', 0),
          bind('m249_sear_spring', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 18. Luger P08 Parabellum (9x19mm) — Short-Recoil Over-Center Toggle Lock
  // =========================================================================
  p08: {
    weaponId: 'p08',
    manualCodeZh: 'D.V.E. Nr. 179 · 德军1908式鲁格手枪军械拆装教范',
    manualCodeEn: 'H.Dv. 254 / Pistole 08 · Imperial & Wehrmacht Field-Strip',
    steps: [
      {
        id: 'p08_strip_mag',
        orderLabel: '01',
        titleZh: '按压滚花卡笋向下抽出 8 发 55° 镀镍钢板弹匣并提肘节验膛',
        titleEn: 'Depress Catch & Withdraw 8-Rd 55° Nickel Sheet-Steel Magazine',
        actionHintZh:
          '点击 55° 镀镍弹匣体或双耳同心圆纹底座，退出弹匣并确认顶置 GELADEN 抽壳钩平落无弹。',
        actionHintEn:
          'Click the 55° brushed-nickel magazine body or twin-ear pull-knob floorplate to clear the magazine.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '插入 8 发斜置弹匣前，必须先装回护把复进簧、滑入叉形上机匣肘节总成并锁死麦秆黄快拆杆！',
        reassembleBlockedNoteEn:
          'Reinstall the recoil spring/grips, upper toggle receiver, and straw takedown lever before inserting the magazine!',
        triggerPartIds: ['p08_mag_body', 'p08_mag_base'],
        bindings: [
          bind('p08_mag_body', 0),
          bind('p08_mag_follower', 0),
          bind('p08_mag_spring', 0),
          bind('p08_mag_base', 0),
        ],
      },
      {
        id: 'p08_strip_takedown_sideplate',
        orderLabel: '02',
        titleZh: '微拉上机匣将麦秆黄快拆杆下旋 90°，取下左侧 L 形换向杠杆盖板',
        titleEn: 'Swing Straw Takedown Lever 90° Down & Lift Left Bellcrank Sideplate',
        actionHintZh:
          '点击麦秆黄旋转快拆锁杆、左侧火控锁盖板或 L 形换向杠杆，一秒解除上下机匣前滑闭锁。',
        actionHintEn:
          'Click the straw-tempered takedown lever, left sideplate, or L-bellcrank transfer lever to unlock the frame.',
        requires: ['p08_strip_mag'],
        stripBlockedNoteZh:
          '德军《Pistole 08》安全铁律：下旋快拆杆分解前，必须先抽出 8 发弹匣（步骤 01）清空弹源！',
        stripBlockedNoteEn:
          'Pistole 08 safety rule: remove the 8-round magazine (Step 01) before rotating the takedown lever!',
        reassembleBlockedNoteZh:
          '扣回左侧扳机杠杆盖板并上旋锁紧麦秆黄快拆杆前，必须先将叉形枪管节套总成沿导轨推回机匣到位（步骤 03）！',
        reassembleBlockedNoteEn:
          'Slide the forked barrel extension and toggle group back onto the frame rails (Step 03) before locking the sideplate!',
        triggerPartIds: [
          'p08_takedown_lever',
          'p08_sideplate',
          'p08_trigger_lever',
        ],
        bindings: [
          bind('p08_takedown_lever', 0, 1),
          bind('p08_sideplate', 0),
          bind('p08_trigger_lever', 0),
        ],
      },
      {
        id: 'p08_strip_upper',
        orderLabel: '03',
        titleZh: '摘脱握把 S 形复进挂钩，将 4 英寸枪管、叉形节套与肘节总成向前滑脱',
        titleEn: 'Unhook S-Link & Slide 4" Barrel, Forked Extension & Toggle Group Forward',
        actionHintZh:
          '点击 4 英寸锥形枪管或顶刻 1917 钢印的叉形枪管节套，沿下机匣导轨向前平顺滑出上机匣总成。',
        actionHintEn:
          'Click the 4" tapered barrel or 1917 forked barrel extension to slide the upper assembly forward off the frame.',
        requires: ['p08_strip_takedown_sideplate'],
        stripBlockedNoteZh:
          '左侧火控盖板与麦秆黄偏心快拆杆仍死死挡在节套前滑路径上，请先下旋快拆杆取下左盖板（步骤 02）！',
        stripBlockedNoteEn:
          'The left sideplate and takedown lever block forward travel of the barrel extension—complete Step 02 first!',
        reassembleBlockedNoteZh:
          '将上机匣滑回锻造下机匣导轨前，必须先将矩形枪机、DWM 双连杆肘节与尾轴销装入叉形节套内（步骤 04）！',
        reassembleBlockedNoteEn:
          'Install the breechblock, DWM toggle links, and rear cross-axle pin into the barrel extension (Step 04) first!',
        triggerPartIds: ['p08_barrel', 'p08_barrel_extension'],
        bindings: [
          bind('p08_barrel', 0),
          bind('p08_barrel_extension', 0),
          bind('p08_breechblock', 0),
          bind('p08_extractor', 0),
          bind('p08_front_toggle', 0),
          bind('p08_rear_toggle', 0),
          bind('p08_toggle_pins', 0),
          bind('p08_striker', 0),
          bind('p08_striker_spring', 0),
          bind('p08_ejector', 0),
          bind('p08_sear_bar', 0),
        ],
      },
      {
        id: 'p08_strip_toggle_train',
        orderLabel: '04',
        titleZh: '向内顶出后肘节横轴大帽销，从节套尾槽抽出双圆耳肘节与矩形枪机链',
        titleEn: 'Push Out Rear Toggle Axle Pin & Withdraw Knee-Joint Toggle / Breechblock Train',
        actionHintZh:
          '点击双圆耳后肘节、DWM 前肘节、矩形滑动枪机或肘节横轴销，将四杆闭锁运动链自叉形节套抽出。',
        actionHintEn:
          'Click the knurled rear toggle, DWM front toggle, breechblock, or toggle axle pins to withdraw the toggle train.',
        requires: ['p08_strip_upper'],
        stripBlockedNoteZh:
          '下机匣高耸的弧形开锁导坡两侧完全遮蔽了后肘节横轴销孔，必须先向前滑脱上机匣总成（步骤 03）！',
        stripBlockedNoteEn:
          'The frame’s curved unlocking ramps shroud the rear toggle axle pin—slide off the upper assembly (Step 03) first!',
        reassembleBlockedNoteZh:
          '将肘节与矩形枪机滑回叉形节套前，必须先装入三槽泄气击针并旋锁刺刀式击针簧尾塞（步骤 05）！',
        reassembleBlockedNoteEn:
          'Insert the fluted striker and quarter-turn the bayonet mainspring guide into the breechblock (Step 05) first!',
        triggerPartIds: [
          'p08_rear_toggle',
          'p08_front_toggle',
          'p08_breechblock',
          'p08_toggle_pins',
        ],
        bindings: [
          bind('p08_toggle_pins', 1),
          bind('p08_rear_toggle', 1),
          bind('p08_front_toggle', 1),
          bind('p08_breechblock', 1),
          bind('p08_extractor', 1),
        ],
      },
      {
        id: 'p08_strip_striker',
        orderLabel: '05',
        titleZh: '顶压逆旋 90° 解锁刺刀尾塞，从矩形枪机空腔取出三槽泄气击针与主簧',
        titleEn: 'Quarter-Turn Bayonet Spring Guide & Extract Fluted Striker / Mainspring',
        actionHintZh:
          '点击三槽泄气空心击针或螺旋击针主簧，释放琴钢丝预紧力完成击针腔细拆清洁。',
        actionHintEn:
          'Click the three-flute internal striker or helical mainspring to unlock the bayonet guide and extract them.',
        requires: ['p08_strip_toggle_train'],
        stripBlockedNoteZh:
          '矩形枪机尾部正与前肘节铰接封堵在叉形节套滑道内，请先抽出后轴销分离肘节枪机链（步骤 04）！',
        stripBlockedNoteEn:
          'The breechblock rear is hinged inside the toggle train—withdraw the toggle/breechblock assembly (Step 04) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['p08_striker', 'p08_striker_spring'],
        bindings: [
          bind('p08_striker', 1, 2),
          bind('p08_striker_spring', 1, 2),
        ],
      },
      {
        id: 'p08_strip_grips_recoil',
        orderLabel: '06',
        titleZh: '卸下两侧 20 线欧洲胡桃木菱格护把，检视握把背脊螺旋复进簧与 S 连杆',
        titleEn: 'Remove Checkered European Walnut Grips & Unhook Grip Recoil Spring / S-Link',
        actionHintZh:
          '点击左/右欧洲胡桃木护把或握把内置螺旋复进簧总成，敞开 55° 握把框内腔。',
        actionHintEn:
          'Click the left/right checkered walnut grip panels or grip-housed recoil spring to expose the grip frame.',
        requires: ['p08_strip_mag'],
        stripBlockedNoteZh:
          '拆卸胡桃木护把与握把复进簧前，请先退出握把井内的 8 发钢板弹匣（步骤 01）以免干涉内衬！',
        stripBlockedNoteEn:
          'Remove the 8-round sheet-steel magazine (Step 01) before detaching the walnut grips and recoil spring!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'p08_grip_left',
          'p08_grip_right',
          'p08_recoil_spring',
        ],
        bindings: [
          bind('p08_grip_left', 0),
          bind('p08_grip_right', 0),
          bind('p08_recoil_spring', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 19. KRISS Vector SMG Gen II (.45 ACP) — Super V Off-Axis Delayed Blowback
  // =========================================================================
  vector: {
    weaponId: 'vector',
    manualCodeZh: 'KRISS-GEN2-OM · 维克托 Super V 免工具四销快拆规程',
    manualCodeEn: 'KRISS USA Gen II OM · Tool-Free 4-Pin Super V Field-Strip',
    steps: [
      {
        id: 'vector_strip_mag',
        orderLabel: '01',
        titleZh: '按压左侧释放钮退出 25 发 Kriss MagEx2 加长 .45 ACP 双排弹匣',
        titleEn: 'Depress Catch & Drop 25-Rd Kriss MagEx2 Extended .45 ACP Magazine',
        actionHintZh:
          '点击 66° 前倾 25 发 MagEx2 弹匣体、橙色防倾托弹板或防摔缓冲底盖，清空大口径弹源。',
        actionHintEn:
          'Click the 25-round MagEx2 .45 ACP magazine body, orange follower, or bumper baseplate to drop the magazine.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '插入 25 发 MagEx2 加长弹匣前，必须先装回 Super V 滑块枪机组、扣合上机匣并插紧四枚快拆横销！',
        reassembleBlockedNoteEn:
          'Reinstall the Super V slider/bolt group, seat the upper housing, and lock all takedown pins before inserting the magazine!',
        triggerPartIds: [
          'vector_mag_body',
          'vector_mag_follower',
          'vector_mag_baseplate',
        ],
        bindings: [
          bind('vector_mag_body', 0),
          bind('vector_mag_follower', 0),
          bind('vector_mag_spring', 0),
          bind('vector_mag_baseplate', 0),
        ],
      },
      {
        id: 'vector_strip_pins',
        orderLabel: '02',
        titleZh: '徒手向左横向推出上下机匣结合耳上的四枚自锁防丢快拆钢销',
        titleEn: 'Push Out Captive Tool-Free Steel Receiver Takedown Pins',
        actionHintZh:
          '点击横穿机匣的免工具快推分解横销组，克服定位钢珠阻力将其横向拔出解锁。',
        actionHintEn:
          'Click the quick-push captive receiver takedown pins to unpin the upper housing from the lower chassis.',
        requires: ['vector_strip_mag'],
        stripBlockedNoteZh:
          'KRISS 原厂安全规程：拔出上下机匣快拆横销前，必须先退出 25 发 .45 ACP 弹匣（步骤 01）并验膛！',
        stripBlockedNoteEn:
          'KRISS safety rule: drop the 25-round .45 ACP magazine (Step 01) and clear the chamber before pushing takedown pins!',
        reassembleBlockedNoteZh:
          '推入四枚自锁横销锁固前，必须先将带顶置火控架的双色上机匣垂直压回下机匣结合槽内（步骤 03）！',
        reassembleBlockedNoteEn:
          'Seat the two-tone upper housing flush onto the lower chassis (Step 03) before pushing the takedown pins home!',
        triggerPartIds: ['vector_takedown_pins'],
        bindings: [bind('vector_takedown_pins', 0)],
      },
      {
        id: 'vector_strip_upper',
        orderLabel: '03',
        titleZh: '向上整体分离带顶置倒装击锤火控盒的双色 FDE 上机匣壳体',
        titleEn: 'Lift Two-Tone Upper Housing w/ Inverted Top-Deck FCU Off Lower Chassis',
        actionHintZh:
          '点击战斗沙色上机匣壳体或顶置不锈钢火控副车架，将其自 Super V 下机匣上方整体抬离。',
        actionHintEn:
          'Click the FDE upper polymer housing or top-deck stainless FCU frame to lift the upper assembly clear.',
        requires: ['vector_strip_pins'],
        stripBlockedNoteZh:
          '上下机匣与顶置火控架正由四枚淬火钢快拆横销刚性穿锁，请先横向推出快拆销（步骤 02）！',
        stripBlockedNoteEn:
          'Four captive steel takedown pins lock the upper and lower housings together—push out the pins (Step 02) first!',
        reassembleBlockedNoteZh:
          '扣合上机匣封闭 -65° 导槽井顶口前，必须先将复进簧导杆及 Super V 钨钢滑块枪机组滑入下机匣（步骤 04）！',
        reassembleBlockedNoteEn:
          'Lower the recoil assembly and Super V slider/bolt group into the -65° chute (Step 04) before seating the upper housing!',
        triggerPartIds: ['vector_upper_housing', 'vector_fcu_chassis'],
        bindings: [
          bind('vector_upper_housing', 0),
          bind('vector_front_sight', 0),
          bind('vector_rear_sight', 0),
          bind('vector_fcu_chassis', 0),
          bind('vector_hammer', 0),
          bind('vector_hammer_spring', 0),
          bind('vector_fire_selector', 0),
          bind('vector_thumb_safety', 0),
        ],
      },
      {
        id: 'vector_strip_superv_group',
        orderLabel: '04',
        titleZh: '从下机匣 -65° 导槽顶口直接向上提拔抽出凸轮耳枪机与 Super V 钨钢滑块',
        titleEn: 'Draw Cam-Trunnion .45 Bolt & Super V Counterweight Slider Out of Chute',
        actionHintZh:
          '点击 Super V 专利钨钢垂直下潜配重滑块或横向双凸轮耳 .45 枪机，无工具向上抽出核心自动机。',
        actionHintEn:
          'Click the KRISS Super V tungsten counterweight slider or cam-trunnion .45 bolt to lift them out the top of the chute.',
        requires: ['vector_strip_upper'],
        stripBlockedNoteZh:
          '上机匣与顶置倒装火控盒完全封闭在枪机与 -65° 下潜井正上方，必须先向上分离上机匣（步骤 03）！',
        stripBlockedNoteEn:
          'The upper housing and inverted FCU seal the top of the -65° Super V chute—remove the upper housing (Step 03) first!',
        reassembleBlockedNoteZh:
          '将钨钢滑块总成压回 -65° 导轨槽前，必须先装回斜置复进簧导杆（步骤 06）并将枪机凸轮耳重新啮合滑块导槽（步骤 05）！',
        reassembleBlockedNoteEn:
          'Seat the -65° recoil rod/spring (Step 06) and couple the bolt trunnions into the Super V slider (Step 05) first!',
        triggerPartIds: ['vector_slider', 'vector_bolt'],
        bindings: [
          bind('vector_bolt', 0),
          bind('vector_firing_pin', 0),
          bind('vector_slider', 0),
        ],
      },
      {
        id: 'vector_strip_decouple_bolt',
        orderLabel: '05',
        titleZh: '侧向滑脱解耦 .45 枪机双凸轮耳与 Super V 钨钢滑块变角度导槽及击针',
        titleEn: 'Decouple Bolt Lateral Cam Trunnions from Super V Slider & Firing Pin',
        actionHintZh:
          '点击双凸轮耳延迟枪机或阶梯式浮动击针，将水平闭锁枪机与垂直下潜钨钢配重块彻底解耦。',
        actionHintEn:
          'Click the cam-trunnion .45 bolt or stepped inertial firing pin to slide the bolt free of the Super V cam slots.',
        requires: ['vector_strip_superv_group'],
        stripBlockedNoteZh:
          '枪机与钨钢滑块两侧正受下机匣 -65° 垂直导轨壁限位，请先将其向上抽出下机匣导槽（步骤 04）！',
        stripBlockedNoteEn:
          'Lower chassis rail walls confine the bolt trunnions inside the slider—lift the Super V group out of the chute (Step 04) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['vector_bolt', 'vector_firing_pin'],
        bindings: [
          bind('vector_bolt', 1),
          bind('vector_firing_pin', 1),
          bind('vector_slider', 1),
        ],
      },
      {
        id: 'vector_strip_recoil_assembly',
        orderLabel: '06',
        titleZh: '从下机匣 -65° 垂直井内抽出无心磨削复进导杆与高疲劳螺旋复进簧',
        titleEn: 'Withdraw Inclined -65° Recoil Guide Rod & Helical Drive Spring',
        actionHintZh:
          '点击 -65° 斜置螺旋复进簧或不锈钢复进导杆与聚氨酯底缓冲垫，完成下潜腔全面清碳保养。',
        actionHintEn:
          'Click the inclined -65° helical recoil spring or steel guide rod to pull the recoil assembly out of the lower well.',
        requires: ['vector_strip_superv_group'],
        stripBlockedNoteZh:
          '-65° 复进簧与导杆贯穿于 Super V 钨钢配重滑块中心弹簧腔内，必须先向上抽出滑块枪机组（步骤 04）！',
        stripBlockedNoteEn:
          'The -65° recoil rod and spring ride captive inside the Super V slider bore—withdraw the slider group (Step 04) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['vector_recoil_spring', 'vector_guide_rod'],
        bindings: [
          bind('vector_recoil_spring', 0),
          bind('vector_guide_rod', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 20. H&K G11 K2 (4.73×33mm DM11 Caseless) — Floating Clockwork Rotary Breech
  // =========================================================================
  g11: {
    weaponId: 'g11',
    manualCodeZh: 'TDv 1005/070-12 · 德国联邦国防军 G11 K2 无壳弹钟表浮置机匣拆解规程',
    manualCodeEn: 'Bundeswehr TDv 1005/070 · H&K G11 K2 Caseless Clockwork Field-Strip',
    steps: [
      {
        id: 'g11_strip_mag',
        orderLabel: '01',
        titleZh: '前拉卸下枪管正上方 45 发 4.73×33mm DM11 无壳弹匣与双联备用夹',
        titleEn: 'Slide Forward & Remove Overhead 45-Rd DM11 Caseless Magazine & Clips',
        actionHintZh:
          '点击置顶透明 45 发条形无壳弹匣、前端压帽或侧挂双联备用弹匣夹，沿枪管轴线向前抽出。',
        actionHintEn:
          'Click the overhead 45-round caseless stick magazine, front endcap, or spare clips to pull them forward clear of the breech.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '装回 45 发无壳弹匣前，必须先复装旋转弹膛、齿轮组、复进簧、聚合物外壳与光学提把！',
        reassembleBlockedNoteEn:
          'Reinstall the rotary breech, clockwork gears, recoil spring, outer housing, and optic handle before seating the caseless magazine!',
        triggerPartIds: ['g11_mag_tube', 'g11_mag_endcap', 'g11_spare_clips'],
        bindings: [
          bind('g11_mag_tube', 0),
          bind('g11_mag_follower', 0),
          bind('g11_mag_spring', 0),
          bind('g11_mag_endcap', 0),
          bind('g11_spare_clips', 0),
        ],
      },
      {
        id: 'g11_strip_optic',
        orderLabel: '02',
        titleZh: '松开燕尾快拆锁卸下 Hensoldt 1×/3.5× 集成光学瞄准提把',
        titleEn: 'Unlock & Lift Integral Hensoldt 1x/3.5x Optical Carry Handle',
        actionHintZh:
          '点击顶部一体化 Hensoldt 光学提把组件，向上垂直卸离外壳顶梁以暴露弹匣槽盖。',
        actionHintEn:
          'Click the integral Hensoldt optical carry handle to lift it cleanly off the top rail.',
        requires: ['g11_strip_mag'],
        stripBlockedNoteZh:
          'H&K 安全规程：拆卸集成光学提把前，必须先卸除 45 发 DM11 无壳弹匣（步骤 01）并旋转确认旋转弹膛空膛！',
        stripBlockedNoteEn:
          'H&K safety rule: remove the 45-round DM11 caseless magazine (Step 01) and verify the rotary chamber is clear first!',
        reassembleBlockedNoteZh:
          '锁回 Hensoldt 光学提把前，必须先将橄榄炭黑单体聚合物外壳套回浮置机匣并扣紧尾盖（步骤 03）！',
        reassembleBlockedNoteEn:
          'Slide the olive-charcoal monocoque outer housing and buttplate back onto the chassis (Step 03) before mounting the optic handle!',
        triggerPartIds: ['g11_optic_handle'],
        bindings: [bind('g11_optic_handle', 0)],
      },
      {
        id: 'g11_strip_housing',
        orderLabel: '03',
        titleZh: '拔出双尾销取下硫化橡胶托底板并整体分离单体聚合物方盒外壳',
        titleEn: 'Unpin Rubber Buttplate & Separate Monocoque Polymer Outer Housing',
        actionHintZh:
          '点击尾部橡胶缓冲托底板或整块式玻纤聚合物方盒外壳，彻底暴露全套浮置机匣与钟表传动腔。',
        actionHintEn:
          'Click the ribbed rubber buttplate or monocoque polymer outer casing to expose the floating inner receiver and clockwork cavity.',
        requires: ['g11_strip_optic'],
        stripBlockedNoteZh:
          '顶部集成 Hensoldt 光学提把正卡扣于单体聚合物外壳顶肋，请先卸除光学提把（步骤 02）！',
        stripBlockedNoteEn:
          'The integral Hensoldt carry handle locks onto the outer casing spine—remove the optic handle (Step 02) first!',
        reassembleBlockedNoteZh:
          '套回全封闭聚合物方盒外壳前，必须先将旋转弹膛、齿轮传动组及浮置主复进簧复原归位（步骤 04）！',
        reassembleBlockedNoteEn:
          'Reassemble the rotary breech, clockwork gear train, and floating recoil spring (Step 04) before closing the outer polymer housing!',
        triggerPartIds: ['g11_buttplate', 'g11_outer_housing', 'g11_winding_knob'],
        bindings: [
          bind('g11_buttplate', 0),
          bind('g11_outer_housing', 0),
          bind('g11_winding_knob', 0),
        ],
      },
      {
        id: 'g11_strip_recoil_spring',
        orderLabel: '04',
        titleZh: '卸除浮置主复进簧与下置短行程导气活塞组件',
        titleEn: 'Release Floating-Action Main Recoil Spring & Under-Barrel Gas Piston',
        actionHintZh:
          '点击同轴高能浮置主复进簧或枪管下方短行程导气活塞，解除浮置自动机弹性预紧力。',
        actionHintEn:
          'Click the main floating-action helical recoil spring or under-barrel short-stroke gas piston to relieve spring tension.',
        requires: ['g11_strip_housing'],
        stripBlockedNoteZh:
          '浮置主复进簧与导气活塞被密封在单体聚合物方盒外壳内部，必须先卸除托底板与方盒外壳（步骤 03）！',
        stripBlockedNoteEn:
          'The floating recoil spring and gas piston are enclosed inside the outer casing—remove the outer housing (Step 03) first!',
        reassembleBlockedNoteZh:
          '装回浮置复进簧与导气活塞前，必须先将齿条拉杆、钟表齿轮组与竖直推弹杆啮合回位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the toothed driving rack, clockwork gears, and vertical rammer (Step 05) before seating the recoil spring and piston!',
        triggerPartIds: ['g11_recoil_spring', 'g11_gas_piston'],
        bindings: [
          bind('g11_recoil_spring', 0),
          bind('g11_gas_piston', 0),
        ],
      },
      {
        id: 'g11_strip_clockwork',
        orderLabel: '05',
        titleZh: '拆解齿条传动杆、瑞士钟表级同步齿轮组与竖直进弹推杆',
        titleEn: 'Disengage Toothed Driving Rack, Clockwork Gears & Vertical Rammer',
        actionHintZh:
          '点击精密同步齿轮组、齿条传动拉杆或竖直进弹推弹杆，解除与 90° 旋转弹膛的齿面咬合。',
        actionHintEn:
          'Click the precision clockwork gear train, toothed driving rack, or vertical loading rammer to decouple the breech drive.',
        requires: ['g11_strip_recoil_spring'],
        stripBlockedNoteZh:
          '齿条传动拉杆正受短行程导气活塞与主复进簧预紧顶推，请先卸除复进簧与导气活塞（步骤 04）！',
        stripBlockedNoteEn:
          'Spring and gas-piston tension loads the driving rack—remove the recoil spring and gas piston (Step 04) first!',
        reassembleBlockedNoteZh:
          '装回钟表齿轮组啮合前，必须先将 90° 旋转圆柱弹膛与同轴击针装入浮置内机匣轴承座（步骤 06）！',
        reassembleBlockedNoteEn:
          'Seat the 90-degree rotary breech cylinder and firing pin into the inner receiver (Step 06) before meshing the clockwork gears!',
        triggerPartIds: ['g11_clockwork_gears', 'g11_driving_rod', 'g11_loading_rammer'],
        bindings: [
          bind('g11_clockwork_gears', 0),
          bind('g11_driving_rod', 0),
          bind('g11_loading_rammer', 0),
        ],
      },
      {
        id: 'g11_strip_rotary_breech',
        orderLabel: '06',
        titleZh: '侧向抽出 90° 旋转圆柱无壳弹膛与同轴线性击针完成清碳保养',
        titleEn: 'Extract 90-Degree Rotating Cylindrical Breech & Coaxial Firing Pin',
        actionHintZh:
          '点击核心 90° 旋转圆柱弹膛或同轴平移击针，将其自浮置内机匣轴孔抽出检查密封环。',
        actionHintEn:
          'Click the 90-degree rotary breech cylinder or coaxial firing pin to slide them out of the floating inner receiver.',
        requires: ['g11_strip_clockwork'],
        stripBlockedNoteZh:
          '90° 旋转弹膛端面正被同步齿轮组与竖直推弹杆锁止啮合，请先拆下钟表齿轮组（步骤 05）！',
        stripBlockedNoteEn:
          'The clockwork gear train and vertical rammer lock the rotary breech axially—remove the clockwork drive (Step 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['g11_rotary_breech', 'g11_firing_pin'],
        bindings: [
          bind('g11_rotary_breech', 0),
          bind('g11_firing_pin', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 21. VSS Vintorez (9×39mm SP-6) — Integral Suppressed Sniper Rifle
  // =========================================================================
  vss: {
    weaponId: 'vss',
    manualCodeZh: 'GRAU 6P29 RE · 俄制 VSS 温托雷兹特种微声狙击步枪三段快拆规程',
    manualCodeEn: 'GRAU 6P29 Manual · VSS Vintorez 3-Module Covert Field-Strip',
    steps: [
      {
        id: 'vss_strip_mag',
        orderLabel: '01',
        titleZh: '压下弹匣卡笋前摇卸出 10 发梅子红华夫纹 9×39mm 弹匣',
        titleEn: 'Rock Out & Remove 10-Rd Plum Waffle 9x39mm Magazine',
        actionHintZh:
          '点击梅子红色聚合物华夫弹匣体或底盖，解除卡笋锁止并安全清空 9×39mm 亚音速穿甲弹。',
        actionHintEn:
          'Click the plum waffle 9x39mm magazine body or floorplate to rock the magazine clear of the milled receiver.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '重新扣入 10 发 9×39mm 弹匣前，必须先复装整体消音套筒、机框、机匣盖、桦木托与瞄准镜！',
        reassembleBlockedNoteEn:
          'Reassemble the integral suppressor, bolt carrier, dust cover, stock, and optic before locking in the 9x39mm magazine!',
        triggerPartIds: ['vss_mag_body', 'vss_mag_floorplate'],
        bindings: [
          bind('vss_mag_body', 0),
          bind('vss_mag_follower', 0),
          bind('vss_mag_spring', 0),
          bind('vss_mag_floorplate', 0),
        ],
      },
      {
        id: 'vss_strip_optic_stock',
        orderLabel: '02',
        titleZh: '扳开偏心锁卸下 PSO-1 瞄准镜并按下快拆钮脱卸镂空桦木枪托',
        titleEn: 'Slide Off PSO-1 Side-Rail Scope & Detach Skeletonized Birch Stock',
        actionHintZh:
          '点击左侧燕尾导轨上的 PSO-1 四倍瞄准镜或尾部快拆镂空桦木层压枪托，将其向后滑脱。',
        actionHintEn:
          'Click the PSO-1 side-rail scope or quick-detach birch skeleton stock to slide both rearward off the receiver.',
        requires: ['vss_strip_mag'],
        stripBlockedNoteZh:
          '俄军安全教范：脱卸瞄准镜与快拆枪托前，必须先卸除 10 发 9×39mm 弹匣（步骤 01）并验膛！',
        stripBlockedNoteEn:
          'Russian armorer rule: remove the 10-round 9x39mm magazine (Step 01) and clear the chamber before stripping optic and stock!',
        reassembleBlockedNoteZh:
          '滑装 PSO-1 瞄准镜与桦木枪托前，必须先扣紧顶部冲压钢机匣防尘盖（步骤 04）！',
        reassembleBlockedNoteEn:
          'Latch the stamped steel top dust cover (Step 04) before sliding the PSO-1 optic and birch stock back on!',
        triggerPartIds: ['vss_pso1_scope', 'vss_wood_stock'],
        bindings: [
          bind('vss_pso1_scope', 0),
          bind('vss_wood_stock', 0),
        ],
      },
      {
        id: 'vss_strip_suppressor',
        orderLabel: '03',
        titleZh: '按下锁销旋脱整体消音器外筒并抽出六级斜角隔板芯',
        titleEn: 'Unlock Integral Suppressor Outer Sleeve & Pull 6-Stage Baffle Stack',
        actionHintZh:
          '点击前端整体消音外筒或内部斜切隔板消音芯，沿枪管向前旋出完成微声室清碳保养。',
        actionHintEn:
          'Click the integral suppressor outer tube or 6-stage slant baffle stack to twist and slide them forward off the ported barrel.',
        requires: ['vss_strip_mag'],
        stripBlockedNoteZh:
          '拆卸消音外筒暴露微声泄压孔枪管前，必须先卸除 10 发 9×39mm 弹匣（步骤 01）确认空膛！',
        stripBlockedNoteEn:
          'Remove the 10-round 9x39mm magazine (Step 01) and verify an empty chamber before detaching the integral suppressor!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['vss_suppressor_tube', 'vss_baffle_stack'],
        bindings: [
          bind('vss_suppressor_tube', 0),
          bind('vss_baffle_stack', 0),
        ],
      },
      {
        id: 'vss_strip_dust_cover',
        orderLabel: '04',
        titleZh: '向前压入尾锁按钮向上掀起冲压钢顶置机匣防尘盖',
        titleEn: 'Depress Rear Retainer & Lift Stamped Steel Top Dust Cover',
        actionHintZh:
          '点击铣削机匣顶部的冲压烤蓝防尘盖，解除后部复进簧尾座卡扣并将其向上取下。',
        actionHintEn:
          'Click the stamped steel top dust cover to release the rear spring retainer and lift the cover clear.',
        requires: ['vss_strip_optic_stock'],
        stripBlockedNoteZh:
          'PSO-1 侧装镜架横跨机匣盖正上方，必须先向后滑卸瞄准镜与枪托（步骤 02）！',
        stripBlockedNoteEn:
          'The PSO-1 side mount bridges over the dust cover—slide off the scope and stock (Step 02) first!',
        reassembleBlockedNoteZh:
          '扣合顶部机匣防尘盖前，必须先将复进簧组件与线性微声击针总成压回机匣导槽（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the recoil assembly and silent linear striker (Step 05) before snapping the dust cover shut!',
        triggerPartIds: ['vss_dust_cover'],
        bindings: [bind('vss_dust_cover', 0)],
      },
      {
        id: 'vss_strip_recoil_striker',
        orderLabel: '05',
        titleZh: '前推脱槽取出复进簧导杆组与无击锤式线性平滑击针总成',
        titleEn: 'Withdraw Recoil Guide/Spring & Silent Linear Striker Assembly',
        actionHintZh:
          '点击上层复进簧、复进导杆或下层线性平滑击针及其弹簧，向后上方整体抽出。',
        actionHintEn:
          'Click the helical recoil spring, guide rod, or silent linear striker to withdraw both spring-driven rods from the receiver.',
        requires: ['vss_strip_dust_cover'],
        stripBlockedNoteZh:
          '复进簧与线性击针总成完全封盖在顶部机匣防尘盖下方，请先掀开机匣盖（步骤 04）！',
        stripBlockedNoteEn:
          'The recoil assembly and linear striker sit beneath the top dust cover—remove the dust cover (Step 04) first!',
        reassembleBlockedNoteZh:
          '压装复进簧与线性击针前，必须先将长行程活塞枪机框与六闭锁突笋枪机滑回铣削机匣（步骤 06）！',
        reassembleBlockedNoteEn:
          'Seat the piston bolt carrier and 6-lug rotating bolt back into the milled receiver (Step 06) before reinstalling the springs!',
        triggerPartIds: ['vss_recoil_spring', 'vss_recoil_guide', 'vss_striker'],
        bindings: [
          bind('vss_recoil_spring', 0),
          bind('vss_recoil_guide', 0),
          bind('vss_striker', 0),
          bind('vss_striker_spring', 0),
        ],
      },
      {
        id: 'vss_strip_bolt_group',
        orderLabel: '06',
        titleZh: '后拉至缺口提起长行程活塞机框并旋出六闭锁突笋微声枪机',
        titleEn: 'Extract Long-Stroke Piston Carrier & 6-Lug Rotating Bolt',
        actionHintZh:
          '点击长行程活塞枪机框、六突笋对称闭锁枪机或浮动击针，完成核心自动机全套野战拆解。',
        actionHintEn:
          'Click the long-stroke piston bolt carrier, 6-lug rotating bolt, or firing pin to lift the action free of the receiver.',
        requires: ['vss_strip_recoil_striker'],
        stripBlockedNoteZh:
          '复进导杆与线性平滑击针正插入枪机框尾孔中限位，必须先抽出复进簧与击针组（步骤 05）！',
        stripBlockedNoteEn:
          'The recoil rod and linear striker occupy the carrier bore—withdraw them (Step 05) before lifting out the bolt carrier!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['vss_bolt_carrier', 'vss_bolt', 'vss_firing_pin'],
        bindings: [
          bind('vss_bolt_carrier', 0),
          bind('vss_bolt', 0),
          bind('vss_firing_pin', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 22. GE M134D Minigun (7.62×51mm NATO) — 6-Barrel Electric Rotary Gatling
  // =========================================================================
  m134: {
    weaponId: 'm134',
    manualCodeZh: 'TM 9-1005-298-10 · 美军 M134D 六管电动加特林机枪野战勤务拆解规程',
    manualCodeEn: 'US Army TM 9-1005-298-10 · GE M134D Minigun Organizational Field-Strip',
    steps: [
      {
        id: 'm134_strip_chute',
        orderLabel: '01',
        titleZh: '解脱左侧不锈钢 M13 柔性供弹滑槽与底部抛壳导管完成安全断弹',
        titleEn: 'Disconnect Flexible Stainless M13 Ammo Feed Chute & Brass Ejection Chute',
        actionHintZh:
          '点击左侧柔性不锈钢弹链供弹槽或底部空弹壳排出导管，彻底切断 7.62 NATO 弹链供给。',
        actionHintEn:
          'Click the left flexible stainless ammo feed chute or lower brass ejection chute to isolate the weapon from ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '挂回柔性供弹槽与抛壳导管前，必须先装回转子枪机、凸轮环、六联枪管、马达与脱链供弹机！',
        reassembleBlockedNoteEn:
          'Reinstall the rotor/bolts, cam housing, barrel cluster, drive motor, and delinker before reattaching the feed chutes!',
        triggerPartIds: ['m134_ammo_chute', 'm134_ejection_chute'],
        bindings: [
          bind('m134_ammo_chute', 0),
          bind('m134_ejection_chute', 0),
        ],
      },
      {
        id: 'm134_strip_delinker',
        orderLabel: '02',
        titleZh: '拔出双快拆销卸下狄龙 M134D 星形旋转脱链供弹机总成',
        titleEn: 'Unpin & Lift Dillon M134D Rotary Delinker Feeder Assembly',
        actionHintZh:
          '点击左侧脱链供弹机外壳、星形脱链拨轮或压弹离合簧，将其自机匣侧面整体卸下。',
        actionHintEn:
          'Click the Dillon delinker housing, star-wheel sprocket, or feeder tension spring to pull the delinker clear.',
        requires: ['m134_strip_chute'],
        stripBlockedNoteZh:
          '美军航空军械规程：拆卸脱链供弹机前必须先断开 M13 柔性供弹槽与排壳管（步骤 01）！',
        stripBlockedNoteEn:
          'Aviation armorer rule: disconnect the M13 feed chute and ejection chute (Step 01) before removing the delinker!',
        reassembleBlockedNoteZh:
          '装回狄龙脱链机并与转子齿轮啮合前，必须先将凸轮槽环（步骤 05）与六联枪管簇（步骤 04）安装就位！',
        reassembleBlockedNoteEn:
          'Seat the cam-track ring (Step 05) and 6-barrel cluster (Step 04) before pinning the delinker feeder back onto the housing!',
        triggerPartIds: ['m134_delinker_housing', 'm134_delinker_sprocket', 'm134_feeder_spring'],
        bindings: [
          bind('m134_delinker_housing', 0),
          bind('m134_delinker_sprocket', 0),
          bind('m134_feeder_spring', 0),
        ],
      },
      {
        id: 'm134_strip_motor',
        orderLabel: '03',
        titleZh: '断电卸除顶部 28V 直流驱动马达、过载离合簧与减速齿轮箱',
        titleEn: 'Detach 28V DC Electric Drive Motor, Clutch Spring & Gear Housing',
        actionHintZh:
          '点击顶部圆柱 28V 直流驱动马达、斜齿减速箱或主驱动齿轮，向上分离外能源动力单元。',
        actionHintEn:
          'Click the 28V DC electric drive motor, reduction gear housing, or main drive gear to decouple external electrical power.',
        requires: ['m134_strip_chute'],
        stripBlockedNoteZh:
          '拆解 28V 高扭矩电动驱动总成前，必须先断开柔性供弹槽完成彻底断弹隔离（步骤 01）！',
        stripBlockedNoteEn:
          'Disconnect the ammunition feed chute (Step 01) before uncoupling the 28V DC electric drive motor assembly!',
        reassembleBlockedNoteZh:
          '重新啮合 28V 驱动马达与斜齿减速箱前，必须先将中央转子与凸轮槽环装回主机匣（步骤 05）！',
        reassembleBlockedNoteEn:
          'Install the central rotor and cam-track ring (Step 05) before remounting the 28V DC motor and gear housing!',
        triggerPartIds: ['m134_drive_motor', 'm134_gear_housing', 'm134_drive_gear'],
        bindings: [
          bind('m134_drive_motor', 0),
          bind('m134_gear_housing', 0),
          bind('m134_drive_gear', 0),
          bind('m134_clutch_spring', 0),
        ],
      },
      {
        id: 'm134_strip_barrels',
        orderLabel: '04',
        titleZh: '旋松膛口消焰器与箍紧卡箍并将六根 558mm 枪管簇向前拔离转子',
        titleEn: 'Unclamp Flash Suppressor & Withdraw 6-Barrel 558mm Cluster Forward',
        actionHintZh:
          '点击六管前部消焰器、防振枪管夹箍或六联枪管簇，解除断续螺纹锁止并向前整体抽出。',
        actionHintEn:
          'Click the 6-tube flash suppressor, mid-barrel clamp, or 6-barrel cluster to twist and slide the barrels forward out of the rotor.',
        requires: ['m134_strip_delinker'],
        stripBlockedNoteZh:
          '前向拆解枪管簇前请先卸除脱链供弹机（步骤 02），避免误转转子导致弹链卡阻！',
        stripBlockedNoteEn:
          'Remove the delinker feeder (Step 02) before unclamping and withdrawing the 6-barrel cluster!',
        reassembleBlockedNoteZh:
          '将六联枪管簇插回转子断续螺纹座前，必须先将中央六槽转子与六枚滚轮枪机装入主机匣（步骤 06）！',
        reassembleBlockedNoteEn:
          'Seat the 6-flute rotor and all six cam-roller bolts inside the housing (Step 06) before mounting the 6-barrel cluster!',
        triggerPartIds: ['m134_barrel_clamp', 'm134_flash_suppressor', 'm134_barrel_cluster'],
        bindings: [
          bind('m134_flash_suppressor', 0),
          bind('m134_barrel_clamp', 0),
          bind('m134_barrel_cluster', 0),
        ],
      },
      {
        id: 'm134_strip_cam_ring',
        orderLabel: '05',
        titleZh: '脱开主机匣凸轮槽定子环与 12 点钟保险闭锁扇形块',
        titleEn: 'Separate Elliptical Cam-Track Stator Ring & 12-O’Clock Safing Sector',
        actionHintZh:
          '点击包裹在主机匣内圈的正弦螺旋凸轮槽环或顶部保险扇形块，敞开全部六枚枪机滑道。',
        actionHintEn:
          'Click the sinusoidal cam-track stator ring or top safing sector to unlock all six bolt roller tracks.',
        requires: ['m134_strip_delinker', 'm134_strip_motor'],
        stripBlockedNoteZh:
          '凸轮定子环受顶部驱动齿轮箱与左侧脱链供弹机双重锁固，请先卸除脱链机（步骤 02）与 28V 马达（步骤 03）！',
        stripBlockedNoteEn:
          'Both the delinker (Step 02) and 28V drive motor/gearbox (Step 03) retain the cam housing—remove both first!',
        reassembleBlockedNoteZh:
          '合拢凸轮槽定子环与保险扇形块前，必须先将中央转子与全部六枚滚轮枪机精准入轨（步骤 06）！',
        reassembleBlockedNoteEn:
          'Install the central rotor and align all six bolt rollers (Step 06) before closing the cam-track stator ring!',
        triggerPartIds: ['m134_cam_track_ring', 'm134_safing_sector'],
        bindings: [
          bind('m134_cam_track_ring', 0),
          bind('m134_safing_sector', 0),
        ],
      },
      {
        id: 'm134_strip_bolts',
        orderLabel: '06',
        titleZh: '从主机匣抽出六槽中央转子与六枚独立滚轮往复枪机组件',
        titleEn: 'Withdraw 6-Flute Central Rotor & Six Independent Cam-Roller Bolts',
        actionHintZh:
          '点击六槽实心转子总成或任意一枚滚轮闭锁枪机，将全部六个并行击发单元抽出机匣保养。',
        actionHintEn:
          'Click the central 6-flute rotor assembly or any cam-roller bolt to slide the complete rotary action clear of the housing.',
        requires: ['m134_strip_barrels', 'm134_strip_cam_ring'],
        stripBlockedNoteZh:
          '六槽转子前端锁接六联枪管簇、外周嵌入凸轮槽环，必须先拆下枪管簇（步骤 04）与凸轮环（步骤 05）！',
        stripBlockedNoteEn:
          'The 6-barrel cluster (Step 04) and cam-track ring (Step 05) retain the rotor and bolts—remove both first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m134_rotor_assembly', 'm134_bolt_1', 'm134_bolt_2'],
        bindings: [
          bind('m134_rotor_assembly', 0),
          bind('m134_bolt_1', 0),
          bind('m134_bolt_2', 0),
          bind('m134_bolt_3', 0),
          bind('m134_bolt_4', 0),
          bind('m134_bolt_5', 0),
          bind('m134_bolt_6', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 23. Nikonov AN-94 "Abakan" (5.45×39mm) — Pulley-Cable Floating Hyperburst
  // =========================================================================
  an94: {
    weaponId: 'an94',
    manualCodeZh: 'GRAU 6P33 RE · 伊热夫斯克 AN-94 阿巴坎滑轮钢索双发高速步枪拆解规程',
    manualCodeEn: 'GRAU 6P33 Manual · Izhmash AN-94 Abakan Pulley-Cable Field-Strip',
    steps: [
      {
        id: 'an94_strip_mag',
        orderLabel: '01',
        titleZh: '按下卡笋退出 15° 右倾 30 发 5.45×39mm 弧形弹匣',
        titleEn: 'Release & Rock Out 15-Degree Right-Canted 30-Rd 5.45x39mm Magazine',
        actionHintZh:
          '点击向右偏斜 15° 安装的 30 发 5.45×39mm 弧形弹匣体或底盖，为二级预供弹通道清空弹源。',
        actionHintEn:
          'Click the 15-degree canted 30-round 5.45x39mm banana magazine body or floorplate to clear the magazine well.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '插入 15° 右倾 5.45×39mm 弹匣前，必须先装回浮置内机匣、滑轮钢索、枪机框、复进簧与防尘顶盖！',
        reassembleBlockedNoteEn:
          'Reinstall the floating receiver, pulley-cable shuttle, bolt carrier, recoil spring, and dust cover before inserting the magazine!',
        triggerPartIds: ['an94_mag_body', 'an94_mag_floorplate'],
        bindings: [
          bind('an94_mag_body', 0),
          bind('an94_mag_follower', 0),
          bind('an94_mag_spring', 0),
          bind('an94_mag_floorplate', 0),
        ],
      },
      {
        id: 'an94_strip_dust_cover',
        orderLabel: '02',
        titleZh: '解锁尾部卡扣向上掀起加强肋冲压钢防尘顶盖',
        titleEn: 'Release Rear Latch & Lift Ribbed Stamped Steel Top Dust Cover',
        actionHintZh:
          '点击聚酰胺外机匣顶部的黑色加强肋冲压防尘盖，敞开浮置内机匣与滑轮传动室。',
        actionHintEn:
          'Click the ribbed stamped steel top dust cover to expose the floating inner receiver and cable-pulley chamber.',
        requires: ['an94_strip_mag'],
        stripBlockedNoteZh:
          '俄军勤务规范：掀开机匣顶盖检查滑轮与枪机前，必须先卸除 15° 右倾 5.45×39mm 弹匣（步骤 01）！',
        stripBlockedNoteEn:
          'Armorer safety rule: remove the 15-degree canted 5.45x39mm magazine (Step 01) before lifting the top dust cover!',
        reassembleBlockedNoteZh:
          '扣回冲压钢防尘顶盖前，必须先将双套管伸缩复进导杆与主复进簧压装回位（步骤 03）！',
        reassembleBlockedNoteEn:
          'Seat the telescoping recoil guide rod and main return spring (Step 03) before latching the stamped dust cover!',
        triggerPartIds: ['an94_dust_cover'],
        bindings: [bind('an94_dust_cover', 0)],
      },
      {
        id: 'an94_strip_recoil_spring',
        orderLabel: '03',
        titleZh: '前压脱槽抽出双套管伸缩枪机复进导杆与高速螺旋复进簧',
        titleEn: 'Withdraw Telescoping Dual Recoil Guide Rod & High-Rate Return Spring',
        actionHintZh:
          '点击插装于浮置内机匣尾壁的螺旋枪机主复进簧或伸缩导杆，释放 1,800 RPM 高劲度簧力。',
        actionHintEn:
          'Click the high-rate helical bolt-carrier return spring or telescoping guide rod to withdraw them from the inner receiver.',
        requires: ['an94_strip_dust_cover'],
        stripBlockedNoteZh:
          '伸缩复进导杆与高速复进簧封锁在加强肋冲压防尘顶盖下方，请先掀开防尘顶盖（步骤 02）！',
        stripBlockedNoteEn:
          'The telescoping recoil rod and spring sit under the stamped dust cover—remove the dust cover (Step 02) first!',
        reassembleBlockedNoteZh:
          '压装枪机复进簧与伸缩导杆前，必须先将双突笋枪机与枪机框滑入浮置内机匣导轨（步骤 04）！',
        reassembleBlockedNoteEn:
          'Slide the bolt carrier and 2-lug rotating bolt back into the floating inner receiver (Step 04) before seating the return spring!',
        triggerPartIds: ['an94_recoil_spring', 'an94_recoil_guide'],
        bindings: [
          bind('an94_recoil_spring', 0),
          bind('an94_recoil_guide', 0),
        ],
      },
      {
        id: 'an94_strip_bolt_group',
        orderLabel: '04',
        titleZh: '向后滑出枪机框、双突笋回转枪机与惯性击针',
        titleEn: 'Extract Bolt Carrier, 2-Lug Rotating Bolt & Inertial Firing Pin',
        actionHintZh:
          '点击枪机框总成、双对称闭锁突笋枪机或击针，从浮置钢制内机匣导轨向后上方取出。',
        actionHintEn:
          'Click the bolt carrier, 2-lug rotating bolt, or firing pin to lift the operating group out of the floating inner receiver.',
        requires: ['an94_strip_recoil_spring'],
        stripBlockedNoteZh:
          '伸缩复进导杆与主复进簧正贯穿插装在枪机框尾腔内，必须先抽出复进簧总成（步骤 03）！',
        stripBlockedNoteEn:
          'The telescoping recoil spring occupies the rear carrier bore—remove the recoil assembly (Step 03) first!',
        reassembleBlockedNoteZh:
          '滑回枪机框与回转枪机前，必须先将槽轮滑轮、编织钢索与二级青铜预供弹滑块挂接回位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the grooved pulley, braided steel cable, and 2-stage pre-feed rammer (Step 05) before inserting the bolt carrier!',
        triggerPartIds: ['an94_bolt_carrier', 'an94_bolt', 'an94_firing_pin'],
        bindings: [
          bind('an94_bolt_carrier', 0),
          bind('an94_bolt', 0),
          bind('an94_firing_pin', 0),
        ],
      },
      {
        id: 'an94_strip_pulley_rammer',
        orderLabel: '05',
        titleZh: '脱挂编织传动钢索、精密 CNC 槽轮滑轮与二级青铜预供弹滑块',
        titleEn: 'Unhook Braided Steel Cable, CNC Grooved Pulley & Pre-Feed Rammer',
        actionHintZh:
          '点击 AN-94 标志性的精密槽轮滑轮、高强度编织钢索或二级预供弹滑块，将其自浮置机匣卸出。',
        actionHintEn:
          'Click the iconic CNC grooved pulley wheel, braided steel cable, or bronze pre-feed rammer to lift the hyperburst linkage clear.',
        requires: ['an94_strip_bolt_group'],
        stripBlockedNoteZh:
          '传动钢索后端钩挂在枪机框下方滑块上，必须先向后抽出枪机框与枪机总成（步骤 04）！',
        stripBlockedNoteEn:
          'The bolt carrier traps the steel transmission cable and pulley shuttle—remove the bolt group (Step 04) first!',
        reassembleBlockedNoteZh:
          '挂接滑轮钢索与二级预供弹滑块前，必须先将浮置钢制内机匣与枪管滑回聚酰胺外机匣（步骤 06）！',
        reassembleBlockedNoteEn:
          'Slide the floating barreled inner receiver and buffer spring back into the outer housing (Step 06) before rigging the pulley!',
        triggerPartIds: ['an94_pulley_wheel', 'an94_steel_cable', 'an94_feed_rammer'],
        bindings: [
          bind('an94_pulley_wheel', 0),
          bind('an94_steel_cable', 0),
          bind('an94_feed_rammer', 0),
        ],
      },
      {
        id: 'an94_strip_floating_action',
        orderLabel: '06',
        titleZh: '旋下 8 字哨音双室制退器并整体抽出浮置枪管内机匣与缓冲主簧',
        titleEn: 'Remove Figure-8 Muzzle Brake & Slide Floating Barreled Action Clear',
        actionHintZh:
          '点击 8 字形双室膛口制退器、浮置内机匣或外机匣缓冲主簧，完成延迟后坐滑动总成全拆。',
        actionHintEn:
          'Click the figure-8 whistling muzzle brake, floating inner receiver, or receiver buffer spring to pull the floating unit clear.',
        requires: ['an94_strip_pulley_rammer'],
        stripBlockedNoteZh:
          '请先拆下槽轮滑轮、传动钢索与二级预供弹滑块（步骤 05），再整体滑出浮置枪管内机匣总成！',
        stripBlockedNoteEn:
          'Remove the pulley, steel cable, and pre-feed rammer (Step 05) before sliding the floating barreled receiver clear!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['an94_inner_receiver', 'an94_muzzle_brake', 'an94_receiver_buffer_spring'],
        bindings: [
          bind('an94_muzzle_brake', 0),
          bind('an94_inner_receiver', 0),
          bind('an94_barrel', 0),
          bind('an94_gas_tube', 0),
          bind('an94_receiver_buffer_spring', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 24. PLA ZTZ-99A Main Battle Tank (125mm ZPT-98 L/50) — 6-Step Depot Strip
  // =========================================================================
  ztz99a: {
    weaponId: 'ztz99a',
    manualCodeZh: 'GJB 重装保障教范 · ZTZ-99A 六步大修级拆解规程',
    manualCodeEn: 'PLA Heavy Depot Manual · ZTZ-99A 6-Step Overhaul Strip',
    steps: [
      {
        id: 'ztz99a_strip_era_skirts',
        orderLabel: '01',
        titleZh: '卸除箭簇形 FY-4 双防反应装甲模块与车体侧裙板',
        titleEn: 'Unbolt FY-4 Arrowhead ERA Wedges, Glacis Blocks & Side Skirts',
        actionHintZh:
          '点击炮塔楔形 FY-4 反应装甲块、首上反应装甲或橡胶-钢复合侧裙板，外推分离附加防护模块。',
        actionHintEn:
          'Click the turret FY-4 ERA wedges, glacis ERA blocks, or side skirts to unbolt external armor modules.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '重新挂载 FY-4 反应装甲与侧裙板前，必须先将炮塔装甲壳体（步骤 04）与后动力舱盖板（步骤 02）复位锁紧！',
        reassembleBlockedNoteEn:
          'Reinstall the turret shell (Step 04) and rear engine deck (Step 02) before bolting the ERA modules and side skirts back on!',
        triggerPartIds: ['ztz99a_era_wedges', 'ztz99a_glacis_era', 'ztz99a_side_skirts'],
        bindings: [
          bind('ztz99a_era_wedges', 0),
          bind('ztz99a_glacis_era', 0),
          bind('ztz99a_side_skirts', 0),
        ],
      },
      {
        id: 'ztz99a_strip_rear_deck',
        orderLabel: '02',
        titleZh: '开启车尾装甲百叶动力舱顶盖板',
        titleEn: 'Unlatch & Lift Armored Rear Engine Deck Louvers',
        actionHintZh:
          '点击车体后部百叶窗装甲动力舱顶盖，向上掀起以敞开 150HB-2 V12 动力包舱室。',
        actionHintEn:
          'Click the armored rear engine deck to open the 150HB-2 powerpack compartment.',
        requires: ['ztz99a_strip_era_skirts'],
        stripBlockedNoteZh:
          '重装保障规程：掀开动力舱顶盖前必须先卸除车体侧裙板与外挂反应装甲（步骤 01）以腾出吊装作业面！',
        stripBlockedNoteEn:
          'Depot safety rule: remove the side skirts and ERA modules (Step 01) before lifting the rear engine deck!',
        reassembleBlockedNoteZh:
          '合拢车尾装甲动力舱顶盖前，必须先将 1,500 马力 V12 柴油机与 CH-1000 传动箱吊装入舱（步骤 03）！',
        reassembleBlockedNoteEn:
          'Drop the 150HB-2 V12 engine and CH-1000 transmission back into the hull (Step 03) before latching the rear deck!',
        triggerPartIds: ['ztz99a_rear_deck'],
        bindings: [bind('ztz99a_rear_deck', 0)],
      },
      {
        id: 'ztz99a_strip_powerpack',
        orderLabel: '03',
        titleZh: '整体吊出 1,500 马力 150HB-2 V12 发动机与 CH-1000 液力综合传动',
        titleEn: 'Hoist 1,500 hp 150HB-2 V12 Diesel & CH-1000 Transmission Powerpack',
        actionHintZh:
          '点击横置 150HB-2 双涡轮 V12 柴油机或 CH-1000 综合传动箱，解脱快接管路并垂直吊出检修。',
        actionHintEn:
          'Click the 150HB-2 V12 diesel engine or CH-1000 transmission to hoist the integrated powerpack clear.',
        requires: ['ztz99a_strip_rear_deck'],
        stripBlockedNoteZh:
          '动力包被厚重的车尾装甲动力舱盖板压锁，请先开启动力舱顶盖（步骤 02）！',
        stripBlockedNoteEn:
          'The armored rear engine deck seals the powerpack bay—lift the rear deck (Step 02) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['ztz99a_v12_engine', 'ztz99a_transmission'],
        bindings: [
          bind('ztz99a_v12_engine', 0),
          bind('ztz99a_transmission', 0),
        ],
      },
      {
        id: 'ztz99a_strip_turret_shell',
        orderLabel: '04',
        titleZh: '卸除顶部武器站、CITV 猎歼观瞄并吊离焊接主炮塔壳体',
        titleEn: 'Detach Roof Armaments, CITV Hunter-Killer Optics & Welded Turret Shell',
        actionHintZh:
          '点击焊接炮塔装甲壳体、车长独立热像仪（CITV）或车顶高射机枪，整体向上吊开暴露主炮尾与转盘舱。',
        actionHintEn:
          'Click the welded turret shell, CITV optics, or roof armaments to crane the armored shell off the gun cradle.',
        requires: ['ztz99a_strip_era_skirts'],
        stripBlockedNoteZh:
          '炮塔正前与两翼螺栓固定有箭簇形 FY-4 反应装甲模块，请先拆下外挂 ERA（步骤 01）！',
        stripBlockedNoteEn:
          'FY-4 ERA wedges bolt across the turret cheeks—remove the ERA and side skirts (Step 01) first!',
        reassembleBlockedNoteZh:
          '回装焊接主炮塔壳体前，必须先将 125mm ZPT-98 主炮、驻退机与炮尾闭锁总成装配归位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Seat the 125mm ZPT-98 main gun, recoil cylinders, and breech block (Step 05) before lowering the turret shell!',
        triggerPartIds: ['ztz99a_turret_shell', 'ztz99a_optics_citv', 'ztz99a_roof_armaments'],
        bindings: [
          bind('ztz99a_turret_shell', 0),
          bind('ztz99a_optics_citv', 0),
          bind('ztz99a_roof_armaments', 0),
        ],
      },
      {
        id: 'ztz99a_strip_main_gun',
        orderLabel: '05',
        titleZh: '前抽 125mm ZPT-98 L/50 滑膛炮、液气驻退复进机与立式楔形炮闩',
        titleEn: 'Withdraw 125mm ZPT-98 L/50 Smoothbore, Recoil Cylinders & Breech Block',
        actionHintZh:
          '点击 125mm 滑膛炮管、炮尾立楔炮闩、液气驻退筒或高刚度螺旋复进簧，分解主武器闭锁总成。',
        actionHintEn:
          'Click the 125mm main gun, vertical wedge breech block, recoil cylinders, or recoil springs to strip the main ordnance.',
        requires: ['ztz99a_strip_turret_shell'],
        stripBlockedNoteZh:
          '125mm 主炮耳轴与驻退复进机封装在焊接炮塔壳体内，请先吊离炮塔壳体（步骤 04）！',
        stripBlockedNoteEn:
          'The welded turret shell encloses the gun trunnions and recoil cradle—remove the turret shell (Step 04) first!',
        reassembleBlockedNoteZh:
          '装回 125mm 主炮与立式楔形炮闩前，必须先将 22 发底置转盘自动装弹机与推弹机构安装就位（步骤 06）！',
        reassembleBlockedNoteEn:
          'Reinstall the 22-round carousel autoloader and rammer chain (Step 06) before mounting the 125mm main gun!',
        triggerPartIds: ['ztz99a_main_gun', 'ztz99a_breech_block', 'ztz99a_recoil_cylinders'],
        bindings: [
          bind('ztz99a_main_gun', 0),
          bind('ztz99a_gun_cradle', 0),
          bind('ztz99a_recoil_cylinders', 0),
          bind('ztz99a_recoil_springs', 0),
          bind('ztz99a_breech_block', 0),
        ],
      },
      {
        id: 'ztz99a_strip_autoloader',
        orderLabel: '06',
        titleZh: '吊出 22 发底置转盘自动装弹机、垂直举升托架与链式推弹器',
        titleEn: 'Extract 22-Round Carousel Autoloader, Lift Tray & Rammer Chain',
        actionHintZh:
          '点击战斗室底部的 22 发转盘自动装弹机、升降托弹架、推弹链条或弹底抛壳机构，完成核心装填系统全拆。',
        actionHintEn:
          'Click the 22-round carousel autoloader, loading tray, rammer chain, or stub ejector to extract the loading assembly.',
        requires: ['ztz99a_strip_main_gun'],
        stripBlockedNoteZh:
          '125mm 炮尾与炮架横跨在转盘自动装弹机正上方，必须先拆下主炮与立楔炮尾（步骤 05）！',
        stripBlockedNoteEn:
          'The 125mm breech sits directly above the carousel hoist—withdraw the main gun assembly (Step 05) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['ztz99a_autoloader_carousel', 'ztz99a_loading_tray', 'ztz99a_rammer_chain'],
        bindings: [
          bind('ztz99a_autoloader_carousel', 0),
          bind('ztz99a_loading_tray', 0),
          bind('ztz99a_rammer_chain', 0),
          bind('ztz99a_rammer_spring', 0),
          bind('ztz99a_stub_ejector', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 25. M1A2 SEP v3 Abrams (120mm M256 L/44) — 6-Step US Army Depot Strip
  // =========================================================================
  m1a2: {
    weaponId: 'm1a2',
    manualCodeZh: 'US Army TM 9-2350-388 · M1A2 SEP v3 六步军械大修拆解',
    manualCodeEn: 'US Army TM 9-2350-388 · M1A2 SEP v3 6-Step Depot Strip',
    steps: [
      {
        id: 'm1a2_strip_skirts_panels',
        orderLabel: '01',
        titleZh: '卸除重型复合侧裙板与尾舱顶置泄压防爆板',
        titleEn: 'Unbolt Ballistic Side Skirts & Turret Bustle Blow-Off Panels',
        actionHintZh:
          '点击车体两侧重型复合防弹裙板或炮塔尾部顶置泄压防爆板，开启弹药舱与行走系统检修口。',
        actionHintEn:
          'Click the heavy ballistic side skirts or bustle blow-off panels to clear upper bustle and suspension access.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '锁回泄压防爆板与侧裙板前，必须先合拢动力舱顶盖（步骤 02）并装回隔爆尾舱弹架（步骤 04）！',
        reassembleBlockedNoteEn:
          'Close the engine deck (Step 02) and reinstall the bustle rack & blast doors (Step 04) before securing blow-off panels!',
        triggerPartIds: ['m1a2_side_skirts', 'm1a2_blowoff_panels'],
        bindings: [
          bind('m1a2_side_skirts', 0),
          bind('m1a2_blowoff_panels', 0),
        ],
      },
      {
        id: 'm1a2_strip_engine_deck',
        orderLabel: '02',
        titleZh: '掀开车尾散热格栅与燃气轮机动力舱装甲顶盖',
        titleEn: 'Lift Armored Rear Turbine Engine Deck & Exhaust Grilles',
        actionHintZh:
          '点击车体后部装甲动力舱盖板，向上开启以暴露霍尼韦尔 AGT1500 燃气轮机舱。',
        actionHintEn:
          'Click the armored rear engine deck to expose the Honeywell AGT1500 gas turbine bay.',
        requires: ['m1a2_strip_skirts_panels'],
        stripBlockedNoteZh:
          '开启后部动力舱盖板前，请先卸除两侧防弹裙板与泄压板（步骤 01）完成整车安全卸压！',
        stripBlockedNoteEn:
          'Remove the side skirts and blow-off panels (Step 01) before lifting the rear engine deck!',
        reassembleBlockedNoteZh:
          '合拢动力舱顶盖前，必须先将 AGT1500 燃气轮机、X1100 传动箱与主油箱吊回底盘（步骤 03）！',
        reassembleBlockedNoteEn:
          'Reinstall the AGT1500 turbine, X1100 transmission, and fuel cells (Step 03) before closing the engine deck!',
        triggerPartIds: ['m1a2_engine_deck'],
        bindings: [bind('m1a2_engine_deck', 0)],
      },
      {
        id: 'm1a2_strip_turbine_pack',
        orderLabel: '03',
        titleZh: '吊出 AGT1500 1,500 hp 燃气轮机、X1100-3B 传动箱与主油箱',
        titleEn: 'Hoist AGT1500 1,500 hp Gas Turbine, X1100-3B Transmission & Fuel Cells',
        actionHintZh:
          '点击霍尼韦尔 AGT1500 多燃料燃气轮机、X1100-3B 十字传动箱或装甲燃料箱，整体向后上方吊离。',
        actionHintEn:
          'Click the AGT1500 gas turbine, X1100-3B transmission, or fuel cells to pull the complete powerpack clear.',
        requires: ['m1a2_strip_engine_deck'],
        stripBlockedNoteZh:
          'AGT1500 燃气轮机动力包位于车尾装甲顶盖下方，必须先掀开动力舱顶盖（步骤 02）！',
        stripBlockedNoteEn:
          'The armored engine deck covers the turbine compartment—open the engine deck (Step 02) first!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m1a2_agt1500_turbine', 'm1a2_x1100_transmission', 'm1a2_fuel_cells'],
        bindings: [
          bind('m1a2_agt1500_turbine', 0),
          bind('m1a2_x1100_transmission', 0),
          bind('m1a2_fuel_cells', 0),
        ],
      },
      {
        id: 'm1a2_strip_bustle_ammo',
        orderLabel: '04',
        titleZh: '开启液压防爆隔离门、退出待发 M829A4 穿甲弹并撤出 36 发隔爆尾舱',
        titleEn: 'Open Hydraulic Blast Doors, Unload Ready M829A4 & Pull 36-Rd Bustle',
        actionHintZh:
          '点击液压防爆隔离门、待发 120mm 穿甲弹或 36 发尾舱隔爆弹架，完成战斗室彻底清弹隔离。',
        actionHintEn:
          'Click the armored blast doors, ready M829A4 round, or 36-round ammo bustle to clear turret ordnance.',
        requires: ['m1a2_strip_skirts_panels'],
        stripBlockedNoteZh:
          '清拆隔爆尾舱弹架前，请先卸除顶置泄压防爆板与侧裙板（步骤 01）！',
        stripBlockedNoteEn:
          'Unbolt the bustle blow-off panels and side skirts (Step 01) before extracting the bustle rack!',
        reassembleBlockedNoteZh:
          '装回隔爆尾舱弹架与防爆隔离门前，必须先将炮塔壳体与 NGAP 贫铀复合装甲复位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the turret shell and NGAP composite armor (Step 05) before seating the ammo bustle and blast doors!',
        triggerPartIds: ['m1a2_blast_doors', 'm1a2_ammo_bustle', 'm1a2_ready_round'],
        bindings: [
          bind('m1a2_blast_doors', 0),
          bind('m1a2_door_spring', 0),
          bind('m1a2_ready_round', 0),
          bind('m1a2_ammo_bustle', 0),
        ],
      },
      {
        id: 'm1a2_strip_turret_armor',
        orderLabel: '05',
        titleZh: '卸除 CROWS-LP 观瞄、烟幕弹具、NGAP 复合装甲夹层与主炮塔壳体',
        titleEn: 'Strip CROWS-LP Optics, NGAP DU Composite Armor & Turret Shell',
        actionHintZh:
          '点击炮塔主装甲壳体、NGAP 贫铀/陶瓷复合装甲夹层或 CROWS-LP 观瞄站，向上吊开暴露 M256 主炮尾。',
        actionHintEn:
          'Click the turret shell, NGAP composite armor array, or CROWS-LP optics to expose the M256 gun cradle.',
        requires: ['m1a2_strip_bustle_ammo'],
        stripBlockedNoteZh:
          '吊离炮塔装甲壳体前必须先清空 36 发尾舱弹药架与防爆隔离门（步骤 04）！',
        stripBlockedNoteEn:
          'Unload the 36-round ammo bustle and blast doors (Step 04) before craning off the turret shell!',
        reassembleBlockedNoteZh:
          '回装炮塔壳体与 NGAP 复合装甲前，必须先将 120mm M256 滑膛炮、立楔炮闩与复进簧安装回位（步骤 06）！',
        reassembleBlockedNoteEn:
          'Install the 120mm M256 main gun, breech block, and recoil springs (Step 06) before lowering the turret shell!',
        triggerPartIds: ['m1a2_turret_shell', 'm1a2_composite_armor', 'm1a2_crows_optics'],
        bindings: [
          bind('m1a2_turret_shell', 0),
          bind('m1a2_composite_armor', 0),
          bind('m1a2_crows_optics', 0),
          bind('m1a2_smoke_launchers', 0),
        ],
      },
      {
        id: 'm1a2_strip_main_gun',
        orderLabel: '06',
        titleZh: '前抽 120mm L/44 M256 滑膛炮、炮盾、螺旋复进簧与立楔炮尾',
        titleEn: 'Withdraw 120mm L/44 M256 Smoothbore, Mantlet, Recoil Springs & Breech',
        actionHintZh:
          '点击 120mm M256 镀铬滑膛炮管、防盾、螺旋复进簧、立楔炮闩或弹底导流罩，完成主炮大修拆解。',
        actionHintEn:
          'Click the 120mm M256 barrel, mantlet, recoil springs, breech block, or stub deflector to withdraw the main gun.',
        requires: ['m1a2_strip_turret_armor'],
        stripBlockedNoteZh:
          '120mm M256 主炮闭锁于厚重的炮塔壳体与复合装甲内，请先吊离炮塔装甲与 NGAP 夹层（步骤 05）！',
        stripBlockedNoteEn:
          'Remove the turret shell and NGAP composite armor (Step 05) before withdrawing the 120mm M256 main gun!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['m1a2_main_gun', 'm1a2_breech_block', 'm1a2_recoil_springs'],
        bindings: [
          bind('m1a2_main_gun', 0),
          bind('m1a2_gun_mantlet', 0),
          bind('m1a2_recoil_springs', 0),
          bind('m1a2_breech_block', 0),
          bind('m1a2_stub_deflector', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 26. KMW Leopard 2A7V (120mm Rh-120 L/55A1) — 6-Step Bundeswehr Depot Strip
  // =========================================================================
  leopard2a7: {
    weaponId: 'leopard2a7',
    manualCodeZh: '德国联邦国防军 TDv 2350/041 · 豹 2A7V 六步快换大修拆解',
    manualCodeEn: 'Bundeswehr TDv 2350/041 · Leopard 2A7V 6-Step Powerpack Strip',
    steps: [
      {
        id: 'leo_strip_wedges_skirts',
        orderLabel: '01',
        titleZh: '卸除标志性空心楔形箭簇炮塔装甲与北约迷彩重型侧裙板',
        titleEn: 'Unbolt Spaced Arrowhead Turret Wedges & Heavy Ballistic Side Skirts',
        actionHintZh:
          '点击炮塔前部空心箭簇形附加装甲楔块或车体两侧重型复合裙板，外摆卸下模块防护组件。',
        actionHintEn:
          'Click the iconic hollow arrowhead turret wedges or heavy ballistic side skirts to unbolt modular add-on armor.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '挂回楔形箭簇装甲与重型侧裙板前，必须先复位动力舱盖板（步骤 02）与炮塔主壳体（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the engine deck (Step 02) and turret shell (Step 05) before bolting back the arrowhead wedges and side skirts!',
        triggerPartIds: ['leo_arrowhead_wedges', 'leo_side_skirts'],
        bindings: [
          bind('leo_arrowhead_wedges', 0),
          bind('leo_side_skirts', 0),
        ],
      },
      {
        id: 'leo_strip_engine_deck',
        orderLabel: '02',
        titleZh: '开启车尾动力舱盖板并吊离双轴流高速散热风扇组',
        titleEn: 'Lift Rear Armored Engine Deck & Dual Axial Cooling Fan Assembly',
        actionHintZh:
          '点击车尾装甲动力舱顶盖或双环形冷却散热风扇，向上开启敞开 MTU 动力包吊装井。',
        actionHintEn:
          'Click the rear engine deck or dual cooling fans to open the 15-minute quick-change powerpack bay.',
        requires: ['leo_strip_wedges_skirts'],
        stripBlockedNoteZh:
          '拆解车尾散热风扇与动力舱盖前，请先卸除侧裙板与箭簇附加装甲（步骤 01）！',
        stripBlockedNoteEn:
          'Remove the side skirts and arrowhead wedges (Step 01) before lifting the engine deck and cooling fans!',
        reassembleBlockedNoteZh:
          '合拢动力舱顶盖与散热风扇前，必须先将 MTU MB 873 V12 与 RENK 传动箱吊入舱室（步骤 03）！',
        reassembleBlockedNoteEn:
          'Drop the MTU V12 engine and RENK transmission back into the hull (Step 03) before closing the deck!',
        triggerPartIds: ['leo_engine_deck', 'leo_cooling_fans'],
        bindings: [
          bind('leo_engine_deck', 0),
          bind('leo_cooling_fans', 0),
        ],
      },
      {
        id: 'leo_strip_mtu_pack',
        orderLabel: '03',
        titleZh: '执行 15 分钟野战快换：整体吊出 MTU MB 873 V12 柴油机与 RENK 传动箱',
        titleEn: '15-Minute Field Swap: Hoist MTU MB 873 V12 Diesel & RENK HSWL 354',
        actionHintZh:
          '点击 47.6 升 MTU MB 873 双涡轮 V12 柴油机或 RENK HSWL 354 液力变速箱，一键垂直吊离动力包。',
        actionHintEn:
          'Click the MTU MB 873 V12 twin-turbo diesel or RENK HSWL 354 gearbox to hoist the modular Euro-powerpack.',
        requires: ['leo_strip_engine_deck'],
        stripBlockedNoteZh:
          'MTU V12 动力包被动力舱盖板与顶置冷却风扇组封闭，请先拆开引擎盖与风扇（步骤 02）！',
        stripBlockedNoteEn:
          'Lift the armored engine deck and cooling fans (Step 02) before hoisting the MTU powerpack!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['leo_mtu_v12', 'leo_renk_transmission'],
        bindings: [
          bind('leo_mtu_v12', 0),
          bind('leo_renk_transmission', 0),
        ],
      },
      {
        id: 'leo_strip_bustle_ammo',
        orderLabel: '04',
        titleZh: '滑开尾舱防爆门、退出 DM63A1 待发弹并清拆尾舱与前车体双弹架',
        titleEn: 'Slide Blast Door, Clear Ready DM63A1 & Pull Bustle + Hull Ammo Racks',
        actionHintZh:
          '点击电动防爆门、待发 DM63A1 穿甲弹、15 发隔爆尾舱或 27 发车体前备弹架，完成全车彻底清弹。',
        actionHintEn:
          'Click the blast door, ready DM63A1 round, 15-rd bustle, or 27-rd hull rack to clear all 120mm ordnance.',
        requires: ['leo_strip_wedges_skirts'],
        stripBlockedNoteZh:
          '清拆全车弹药架前，请先卸除箭簇附加装甲与侧裙板（步骤 01）！',
        stripBlockedNoteEn:
          'Remove the arrowhead wedges and side skirts (Step 01) before clearing the ammo racks!',
        reassembleBlockedNoteZh:
          '重装尾舱与前车体弹药架前，必须先将炮塔装甲壳体与 PERI R17A3 观瞄仪归位（步骤 05）！',
        reassembleBlockedNoteEn:
          'Seat the turret shell and PERI R17A3 optics (Step 05) before reloading the ammo racks and blast door!',
        triggerPartIds: ['leo_blast_door', 'leo_ammo_bustle', 'leo_hull_ammo_rack', 'leo_ready_round'],
        bindings: [
          bind('leo_blast_door', 0),
          bind('leo_ready_round', 0),
          bind('leo_ammo_bustle', 0),
          bind('leo_hull_ammo_rack', 0),
        ],
      },
      {
        id: 'leo_strip_turret_shell',
        orderLabel: '05',
        titleZh: '卸除 PERI R17A3 周视热像仪、烟幕发射器并吊离焊接炮塔壳体',
        titleEn: 'Detach PERI R17A3 Panoramic Sight, Smoke Dischargers & Turret Shell',
        actionHintZh:
          '点击炮塔主装甲壳体、车长独立周视仪 PERI R17A3 或 16 联烟幕弹发射器，向上吊开暴露 L/55A1 炮架。',
        actionHintEn:
          'Click the turret shell, PERI R17A3 panoramic optic, or smoke dischargers to expose the Rh-120 breech.',
        requires: ['leo_strip_bustle_ammo'],
        stripBlockedNoteZh:
          '吊离炮塔壳体前必须先清空 15 发隔爆尾舱与 27 发前车体弹药架（步骤 04）！',
        stripBlockedNoteEn:
          'Clear the bustle and hull ammunition racks (Step 04) before lifting the turret shell!',
        reassembleBlockedNoteZh:
          '回装炮塔装甲壳体前，必须先将 6.6m Rh-120 L/55A1 主炮与同轴驻退复进系统装配回位（步骤 06）！',
        reassembleBlockedNoteEn:
          'Reinstall the 6.6m Rh-120 L/55A1 gun and concentric recoil system (Step 06) before lowering the turret shell!',
        triggerPartIds: ['leo_turret_shell', 'leo_optics_peri', 'leo_smoke_dischargers'],
        bindings: [
          bind('leo_turret_shell', 0),
          bind('leo_optics_peri', 0),
          bind('leo_smoke_dischargers', 0),
        ],
      },
      {
        id: 'leo_strip_rh120_gun',
        orderLabel: '06',
        titleZh: '前抽 6.6m Rh-120 L/55A1 超长滑膛炮、同轴驻退机与立楔炮尾',
        titleEn: 'Withdraw 6.6m Rh-120 L/55A1 Smoothbore, Concentric Recoil & Breech',
        actionHintZh:
          '点击 6.6 米 Rh-120 L/55A1 滑膛炮管、防盾、同轴驻退系统、复进簧或立式楔形炮闩，完成主炮大修。',
        actionHintEn:
          'Click the 6.6m Rh-120 L/55A1 gun, mantlet, concentric recoil system, springs, or breech block to strip main ordnance.',
        requires: ['leo_strip_turret_shell'],
        stripBlockedNoteZh:
          'Rh-120 L/55A1 主炮耳轴锁固于焊接炮塔内壁，必须先吊离炮塔壳体（步骤 05）！',
        stripBlockedNoteEn:
          'Remove the turret shell (Step 05) before withdrawing the 6.6m Rh-120 L/55A1 main gun!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['leo_main_gun', 'leo_breech_block', 'leo_recoil_system'],
        bindings: [
          bind('leo_main_gun', 0),
          bind('leo_gun_mantlet', 0),
          bind('leo_recoil_system', 0),
          bind('leo_recoil_springs', 0),
          bind('leo_breech_block', 0),
          bind('leo_breech_spring', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 27. Pz.Kpfw. VI Ausf. E "Tiger 131" (88mm KwK 36 L/56) — 6-Step Overhaul
  // =========================================================================
  tiger1: {
    weaponId: 'tiger1',
    manualCodeZh: '德军 D 656/27 虎式战车教范 (Tigerfibel) · 六步重装大修拆解',
    manualCodeEn: 'Wehrmacht D 656/27 Tigerfibel · Tiger 131 6-Step Depot Overhaul',
    steps: [
      {
        id: 'tiger_strip_fenders_ammo',
        orderLabel: '01',
        titleZh: '卸除侧翼履带挡泥板并清空侧舷 88mm PzGr. 39 弹药架',
        titleEn: 'Unbolt Side Mudguard Fenders & Unload 88mm Sponson Ammo Racks',
        actionHintZh:
          '点击车体两侧钢制挡泥板、待发 88mm 穿甲弹或侧舷弹药架，完成 92 发战斗室彻底退弹隔离。',
        actionHintEn:
          'Click the side fenders, ready 88mm PzGr. 39 round, or sponson ammo racks to clear live shells safely.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh:
          '装回 88mm 侧舷弹药架与挡泥板前，必须先复位动力舱顶盖（步骤 02）与马蹄形炮塔（步骤 04）！',
        reassembleBlockedNoteEn:
          'Reinstall the engine deck (Step 02) and horseshoe turret (Step 04) before reloading sponson racks and fenders!',
        triggerPartIds: ['tiger_side_fenders', 'tiger_ammo_racks', 'tiger_ready_round'],
        bindings: [
          bind('tiger_side_fenders', 0),
          bind('tiger_ready_round', 0),
          bind('tiger_ammo_racks', 0),
        ],
      },
      {
        id: 'tiger_strip_engine_deck',
        orderLabel: '02',
        titleZh: '开启车尾装甲引擎舱盖板并分离双侧主油箱与散热舱',
        titleEn: 'Lift Rear Armored Engine Deck & Uncouple Twin Hull Fuel Tanks',
        actionHintZh:
          '点击车尾散热百叶装甲顶盖或两侧主油箱总成，向上开启暴露迈巴赫 HL230 V12 引擎舱。',
        actionHintEn:
          'Click the armored rear engine deck or twin fuel tanks to expose the Maybach HL230 engine bay.',
        requires: ['tiger_strip_fenders_ammo'],
        stripBlockedNoteZh:
          '大修动力舱前请先清空侧舷 88mm 弹药架并卸除侧挡泥板（步骤 01）防止油火隐患！',
        stripBlockedNoteEn:
          'Clear the 88mm ammo racks and side fenders (Step 01) before opening the rear engine deck!',
        reassembleBlockedNoteZh:
          '合拢车尾装甲引擎舱盖前，必须先将迈巴赫 HL230 V12、中央传动轴与前置变速箱装回底盘（步骤 03）！',
        reassembleBlockedNoteEn:
          'Reinstall the Maybach V12, driveshaft, and Olvar transmission (Step 03) before closing the engine deck!',
        triggerPartIds: ['tiger_engine_deck', 'tiger_fuel_tanks'],
        bindings: [
          bind('tiger_engine_deck', 0),
          bind('tiger_fuel_tanks', 0),
        ],
      },
      {
        id: 'tiger_strip_maybach_drivetrain',
        orderLabel: '03',
        titleZh: '吊出迈巴赫 HL230 V12 汽油机、贯穿主传动轴与前置 Olvar 8 速变速箱',
        titleEn: 'Hoist Maybach HL230 V12, Central Driveshaft & Front Olvar Gearbox',
        actionHintZh:
          '点击 700 马力迈巴赫 HL230 P45 V12 引擎、贯穿底盘主传动轴或前置奥尔瓦 8 速变速箱，整体抽出动力链。',
        actionHintEn:
          'Click the Maybach HL230 V12 engine, central driveshaft, or front Olvar 8-speed transmission to extract the drivetrain.',
        requires: ['tiger_strip_engine_deck'],
        stripBlockedNoteZh:
          '迈巴赫 V12 与油箱管道受车尾装甲引擎舱盖封闭，请先开启引擎舱盖与油箱（步骤 02）！',
        stripBlockedNoteEn:
          'Open the rear engine deck and uncouple fuel tanks (Step 02) before hoisting the Maybach drivetrain!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['tiger_maybach_v12', 'tiger_transmission', 'tiger_driveshaft'],
        bindings: [
          bind('tiger_maybach_v12', 0),
          bind('tiger_driveshaft', 0),
          bind('tiger_transmission', 0),
        ],
      },
      {
        id: 'tiger_strip_turret_shell',
        orderLabel: '04',
        titleZh: '卸除车长指挥塔舱盖、TZF 9b 瞄准镜并吊离马蹄形厚壁炮塔壳体',
        titleEn: 'Detach Commander Cupola, TZF 9b Sight & Horseshoe Turret Shell',
        actionHintZh:
          '点击标志性马蹄形 80mm 厚壁炮塔、高顶车长指挥塔或 TZF 9b 双目瞄准镜，吊离暴露 88mm 主炮总成。',
        actionHintEn:
          'Click the horseshoe turret shell, commander cupola, or TZF 9b sight to lift the armored turret off the KwK 36 cradle.',
        requires: ['tiger_strip_fenders_ammo'],
        stripBlockedNoteZh:
          '吊离重型马蹄炮塔前，请先退出待发弹并清空侧舷 88mm 弹药架（步骤 01）！',
        stripBlockedNoteEn:
          'Unload the ready 88mm round and sponson racks (Step 01) before lifting the horseshoe turret shell!',
        reassembleBlockedNoteZh:
          '落位马蹄形炮塔壳体前，必须先将 88mm KwK 36 L/56 主炮与克虏伯水平楔闩装回摇架（步骤 05）！',
        reassembleBlockedNoteEn:
          'Reinstall the 88mm KwK 36 gun and Krupp horizontal breech (Step 05) before lowering the turret shell!',
        triggerPartIds: ['tiger_turret_shell', 'tiger_cupola_hatches', 'tiger_optics_tzf9b'],
        bindings: [
          bind('tiger_turret_shell', 0),
          bind('tiger_cupola_hatches', 0),
          bind('tiger_optics_tzf9b', 0),
        ],
      },
      {
        id: 'tiger_strip_kwk36_gun',
        orderLabel: '05',
        titleZh: '前抽 88mm KwK 36 L/56 线膛炮、阶梯防盾、驻退摇架与克虏伯水平楔闩',
        titleEn: 'Withdraw 88mm KwK 36 L/56 Cannon, Mantlet, Cradle & Krupp Breech',
        actionHintZh:
          '点击 88mm 线膛炮管（带双室制退器）、阶梯型炮盾、克虏伯水平滑楔炮闩或帆布退壳护篮，完成传奇主炮全拆。',
        actionHintEn:
          'Click the 88mm KwK 36 barrel, stepped mantlet, Krupp horizontal wedge breech, or recoil cradle to strip the main gun.',
        requires: ['tiger_strip_turret_shell'],
        stripBlockedNoteZh:
          '88mm 主炮与厚重炮盾密封在马蹄形炮塔前端，必须先吊离炮塔壳体（步骤 04）！',
        stripBlockedNoteEn:
          'Lift the horseshoe turret shell (Step 04) before withdrawing the 88mm KwK 36 main gun assembly!',
        reassembleBlockedNoteZh:
          '回装 88mm 主炮与克虏伯炮尾前，必须先复位象牙白炮塔吊篮与 48 交错负重轮组（步骤 06）！',
        reassembleBlockedNoteEn:
          'Reinstall the turret basket and interleaved road wheels (Step 06) before mounting the 88mm KwK 36 cannon!',
        triggerPartIds: ['tiger_main_gun', 'tiger_breech_block', 'tiger_recoil_cradle'],
        bindings: [
          bind('tiger_main_gun', 0),
          bind('tiger_gun_mantlet', 0),
          bind('tiger_recoil_cradle', 0),
          bind('tiger_recoil_springs', 0),
          bind('tiger_breech_block', 0),
          bind('tiger_breech_spring', 0),
          bind('tiger_shell_guard', 0),
        ],
      },
      {
        id: 'tiger_strip_basket_wheels',
        orderLabel: '06',
        titleZh: '吊出象牙白炮塔吊篮并检修标志性 48 轮交错负重轮组',
        titleEn: 'Extract Elfenbein Turret Basket & Service 48 Interleaved Road Wheels',
        actionHintZh:
          '点击象牙白涂装（Elfenbein）炮塔战斗室吊篮或 48 枚交错重叠负重轮（Schachtellaufwerk）展开底盘大修。',
        actionHintEn:
          'Click the Elfenbein turret basket or 48 interleaved Schachtellaufwerk road wheels to complete the heavy overhaul.',
        requires: ['tiger_strip_kwk36_gun'],
        stripBlockedNoteZh:
          '炮塔吊篮与底盘检修需先拆离上方的 88mm KwK 36 主炮与炮尾摇架（步骤 05）！',
        stripBlockedNoteEn:
          'Remove the 88mm KwK 36 gun and cradle (Step 05) before lifting the turret basket and servicing the road wheels!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['tiger_turret_basket', 'tiger_interleaved_wheels'],
        bindings: [
          bind('tiger_turret_basket', 0),
          bind('tiger_interleaved_wheels', 0),
        ],
      },
    ],
  },

  // ===========================================================================
  // 28. Winchester Model 1894 (.30-30 WCF) — 5-Step Lever-Action Field Strip
  // ===========================================================================
  winchester1894: {
    weaponId: 'winchester1894',
    manualCodeZh: '温彻斯特军械匠规范 · 五步杠杆拆解',
    manualCodeEn: 'Winchester Armorer Manual · 5-Step Lever Strip',
    steps: [
      {
        id: 'win94_strip_lever_link',
        orderLabel: '01',
        titleZh: '旋出指环杠杆枢纽销并卸下 D 型杠杆与底部连杆桥',
        titleEn: 'Pull Finger-Lever Pin & Drop D-Ring Lever & Link Bridge',
        actionHintZh: '点击 D 型指环杠杆、底部铰接连杆桥或金氏侧装弹口，释放垂直闭锁通道。',
        actionHintEn: 'Click the D-ring lever, bottom link bridge, or King loading gate to clear the action bottom.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '回装 D 型指环杠杆与连杆前，请先复装 H 型垂直闭锁块与顶抛枪机（步骤 02）！',
        reassembleBlockedNoteEn: 'Reinstall the vertical locking bolt and breech bolt (Step 02) before pinning the finger lever!',
        triggerPartIds: ['win94_lever', 'win94_link', 'win94_loading_gate'],
        bindings: [
          bind('win94_lever', 0),
          bind('win94_link', 0),
          bind('win94_loading_gate', 0),
        ],
      },
      {
        id: 'win94_strip_locking_bolt',
        orderLabel: '02',
        titleZh: '向下抽离勃朗宁 H 型垂直闭锁块，并向后抽出顶抛圆柱枪机与击针',
        titleEn: 'Drop Vertical H-Locking Block & Withdraw Breech Bolt & Firing Pin',
        actionHintZh: '点击 H 型垂直闭锁块、顶抛圆柱枪机或两段式防早发长击针完成闭锁机构分解。',
        actionHintEn: 'Click the H-locking block, breech bolt, or firing pin to strip the breech assembly.',
        requires: ['win94_strip_lever_link'],
        stripBlockedNoteZh: 'H 型垂直闭锁块由底部 D 型杠杆与连杆托举限位，请先拆下杠杆与连杆（步骤 01）！',
        stripBlockedNoteEn: 'Remove the D-ring lever and link bridge (Step 01) before dropping the vertical H-locking block!',
        reassembleBlockedNoteZh: '装入垂直闭锁块与圆柱枪机前，请先装回黑胡桃木直握把后托与外露火控（步骤 03）！',
        reassembleBlockedNoteEn: 'Reinstall the walnut buttstock and external hammer FCG (Step 03) before sliding in the bolt!',
        triggerPartIds: ['win94_locking_bolt', 'win94_breech_bolt', 'win94_firing_pin'],
        bindings: [
          bind('win94_locking_bolt', 0),
          bind('win94_breech_bolt', 0, 1),
          bind('win94_firing_pin', 0, 1),
        ],
      },
      {
        id: 'win94_strip_stock_fcg',
        orderLabel: '03',
        titleZh: '拆下直握把黑胡桃木后托、钢托底板与外露击锤螺旋主簧组',
        titleEn: 'Detach Straight Walnut Stock, Buttplate & Hammer Mainspring FCG',
        actionHintZh: '点击黑胡桃木后托、钢托底板、外露击锤或扳机主簧露出上下尾舌火控夹层。',
        actionHintEn: 'Click the walnut buttstock, buttplate, exposed hammer, or mainspring to strip the tang FCG.',
        requires: ['win94_strip_locking_bolt'],
        stripBlockedNoteZh: '请先卸除闭锁块与后坐枪机（步骤 02）再分解上/下尾舌木托与击锤火控组！',
        stripBlockedNoteEn: 'Withdraw the locking bolt and breech bolt (Step 02) before detaching the tang walnut stock!',
        reassembleBlockedNoteZh: '安装胡桃木后托前，请先装回护木、马鞍环与全长管式弹仓（步骤 04-05）！',
        reassembleBlockedNoteEn: 'Reassemble the forend and tubular magazine (Steps 04-05) before locking the rear stock!',
        triggerPartIds: ['win94_walnut_stock', 'win94_buttplate', 'win94_hammer', 'win94_trigger', 'win94_mainspring'],
        bindings: [
          bind('win94_walnut_stock', 0),
          bind('win94_buttplate', 0, 1),
          bind('win94_hammer', 0),
          bind('win94_trigger', 0),
          bind('win94_mainspring', 0),
          bind('win94_tang_safety', 0),
          bind('win94_sear_spring', 0),
        ],
      },
      {
        id: 'win94_strip_forend_barrel',
        orderLabel: '04',
        titleZh: '卸下前护木鼻箍钢锁环、黑胡桃木前护木、马鞍环与表尺瞄具组',
        titleEn: 'Unscrew Barrel Band, Forend, Saddle Ring & Buckhorn Sights',
        actionHintZh: '点击护木鼻箍锁环、黑胡桃木前护木、左侧马鞍铁环或 20 英寸枪管分解前端护木。',
        actionHintEn: 'Click the barrel band, walnut forend, saddle ring, or 20" barrel to strip the forward furniture.',
        requires: ['win94_strip_stock_fcg'],
        stripBlockedNoteZh: '请先完成握把枪托与火控分离（步骤 03）再拆离前端箍环与胡桃木护木！',
        stripBlockedNoteEn: 'Strip the walnut stock and FCG (Step 03) before unbolting the barrel band and forend!',
        reassembleBlockedNoteZh: '安装胡桃木前护木前，请先复位全长下挂管式弹仓与黄铜升降托弹勺（步骤 05）！',
        reassembleBlockedNoteEn: 'Reinstall the full-length tubular magazine and brass carrier (Step 05) first!',
        triggerPartIds: ['win94_barrel_bands', 'win94_forend', 'win94_saddle_ring', 'win94_barrel'],
        bindings: [
          bind('win94_barrel_bands', 0),
          bind('win94_forend', 0),
          bind('win94_saddle_ring', 0),
          bind('win94_barrel', 0),
          bind('win94_front_sight', 0, 1),
          bind('win94_rear_sight', 0, 1),
        ],
      },
      {
        id: 'win94_strip_mag_carrier',
        orderLabel: '05',
        titleZh: '抽出全长管式弹仓 42 圈长簧、黄铜柱塞与升降黄铜托弹勺',
        titleEn: 'Extract Tubular Mag Spring, Brass Follower & Brass Lifter Carrier',
        actionHintZh: '点击全长管式弹仓、42 圈螺旋托弹簧、黄铜推弹柱塞或黄铜托弹勺完成彻底拆检。',
        actionHintEn: 'Click the tubular mag, 42-coil spring, brass follower, or brass carrier to complete inspection.',
        requires: ['win94_strip_forend_barrel'],
        stripBlockedNoteZh: '护木鼻箍与前护木紧压固定着下挂管式弹仓，请先拆下鼻箍与护木（步骤 04）！',
        stripBlockedNoteEn: 'Remove the barrel band and walnut forend (Step 04) before sliding out the tubular magazine!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['win94_mag_tube', 'win94_mag_spring', 'win94_mag_follower', 'win94_carrier'],
        bindings: [
          bind('win94_mag_tube', 0),
          bind('win94_mag_follower', 0),
          bind('win94_mag_spring', 0),
          bind('win94_carrier', 0),
        ],
      },
    ],
  },

  // ===========================================================================
  // 29. Remington Model 870 Police Magnum (12ga) — 5-Step Pump-Shotgun Strip
  // ===========================================================================
  rem870: {
    weaponId: 'rem870',
    manualCodeZh: '美国警用军械士规范 · 五步免工具泵动分解',
    manualCodeEn: 'US Police Armorer Manual · 5-Step Tool-Less Strip',
    steps: [
      {
        id: 'rem870_strip_cap_barrel',
        orderLabel: '01',
        titleZh: '徒手旋下滚花弹仓端盖，向前抽出 18 英寸磷化厚壁枪管',
        titleEn: 'Unscrew Knurled Magazine Cap & Pull Forward 18" Heavy Barrel',
        actionHintZh: '点击前端滚花弹仓帽或 18 英寸重壁枪管与白点准星，免工具分离枪管。',
        actionHintEn: 'Click the knurled magazine cap or 18" heavy barrel to slide the barrel free without tools.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '安装 18 英寸厚壁枪管前，必须先装回玉米棒护木、双推杆与硬铬枪机（步骤 02-03）！',
        reassembleBlockedNoteEn: 'Reinstall the forend, twin action bars, and chrome bolt (Steps 02-03) before seating the barrel!',
        triggerPartIds: ['rem870_mag_cap', 'rem870_barrel', 'rem870_front_sight', 'rem870_rear_sight'],
        bindings: [
          bind('rem870_mag_cap', 0, 1),
          bind('rem870_barrel', 0),
          bind('rem870_front_sight', 0, 1),
          bind('rem870_rear_sight', 0),
        ],
      },
      {
        id: 'rem870_strip_forend_bars',
        orderLabel: '02',
        titleZh: '拨开弹仓内阻弹片，向前同步抽出玉米棒前护木与双平行钢推杆',
        titleEn: 'Depress Shell Latches & Draw Corn-Cob Forend + Twin Action Bars Forward',
        actionHintZh: '点击玉米棒核桃木泵动护木或双平行钢推拉连杆，连同枪机滑块一起前抽拆出。',
        actionHintEn: 'Click the grooved walnut forend or twin steel action bars to slide the pump assembly clear.',
        requires: ['rem870_strip_cap_barrel'],
        stripBlockedNoteZh: '枪管导环卡在双推杆前端套管上方，请先拧下端盖并拔出枪管（步骤 01）！',
        stripBlockedNoteEn: 'Remove the magazine cap and 18" barrel (Step 01) before sliding off the pump forend & action bars!',
        reassembleBlockedNoteZh: '插回双平行钢推杆前，请先放回硬铬枪机与倾斜楔形闭锁块（步骤 03）！',
        reassembleBlockedNoteEn: 'Seat the chrome bolt and tilting locking block onto the slide (Step 03) before sliding bars back!',
        triggerPartIds: ['rem870_forend', 'rem870_action_bars', 'rem870_slide_block'],
        bindings: [
          bind('rem870_forend', 0),
          bind('rem870_action_bars', 0),
          bind('rem870_slide_block', 0),
        ],
      },
      {
        id: 'rem870_strip_bolt_wedge',
        orderLabel: '03',
        titleZh: '分离亮银硬铬枪机体、上翘楔形闭锁块与弹簧复位惯性击针',
        titleEn: 'Separate Hard-Chrome Bolt, Tilting Locking Wedge & Firing Pin',
        actionHintZh: '点击亮银硬铬枪机、上翘楔形闭锁块或惯性击针与复位簧完成闭锁核心分解。',
        actionHintEn: 'Click the chrome bolt body, tilting locking block, or firing pin & spring to strip the breech.',
        requires: ['rem870_strip_forend_bars'],
        stripBlockedNoteZh: '请先拨开挡片并连同双推杆抽出硬铬枪机组（步骤 02）再分拆斜楔闭锁块！',
        stripBlockedNoteEn: 'Draw the twin action bars and slide block forward (Step 02) before removing the breech bolt!',
        reassembleBlockedNoteZh: '落位硬铬枪机组前，请先复位双销铝合金警用火控座与硬铬托弹勺（步骤 04）！',
        reassembleBlockedNoteEn: 'Reinstall the dual-pin aluminum trigger plate & Flexitab carrier (Step 04) first!',
        triggerPartIds: ['rem870_breech_bolt', 'rem870_locking_block', 'rem870_firing_pin', 'rem870_firing_pin_spring'],
        bindings: [
          bind('rem870_breech_bolt', 0),
          bind('rem870_locking_block', 0),
          bind('rem870_firing_pin', 0),
          bind('rem870_firing_pin_spring', 0),
        ],
      },
      {
        id: 'rem870_strip_trigger_plate',
        orderLabel: '04',
        titleZh: '顶出机匣前后双定位横销，向下整体抽出铝合金警用火控座与托弹勺',
        titleEn: 'Drive Dual Receiver Pins & Drop Police Trigger Plate + Shell Carrier',
        actionHintZh: '点击双销铝合金扳机座、内置击锤、推杆释放钮或硬铬升降托弹勺拆离下火控总成。',
        actionHintEn: 'Click the aluminum trigger plate, hammer, release lever, or shell carrier to drop the FCG.',
        requires: ['rem870_strip_bolt_wedge'],
        stripBlockedNoteZh: '建议先抽出上方双推杆与硬铬枪机避免划伤托弹勺定位槽（步骤 03）！',
        stripBlockedNoteEn: 'Remove the chrome bolt and locking block (Step 03) before driving out the dual trigger plate pins!',
        reassembleBlockedNoteZh: '装回火控座前，请先检查管式弹仓长簧、橙红托弹杯及胡桃木后托螺栓（步骤 05）！',
        reassembleBlockedNoteEn: 'Service the mag follower, 34-coil spring, and stock bolt (Step 05) before pinning the FCG!',
        triggerPartIds: ['rem870_trigger_plate', 'rem870_trigger', 'rem870_hammer', 'rem870_action_release', 'rem870_shell_carrier'],
        bindings: [
          bind('rem870_trigger_plate', 0),
          bind('rem870_trigger', 0, 1),
          bind('rem870_hammer', 0, 1),
          bind('rem870_action_release', 0, 1),
          bind('rem870_hammer_spring', 0, 1),
          bind('rem870_shell_carrier', 0),
        ],
      },
      {
        id: 'rem870_strip_mag_stock',
        orderLabel: '05',
        titleZh: '抽出高可视橙红托弹杯与 34 圈长簧，并旋下橡胶肩垫与通心枪托长螺栓',
        titleEn: 'Inspect Orange Mag Follower, 34-Coil Spring & Unbolt Walnut Stock',
        actionHintZh: '点击 4+1 钢制管式弹仓、鲜橙托弹杯、通气橡胶垫或警用胡桃木枪托与通心长螺栓。',
        actionHintEn: 'Click the steel mag tube, orange follower, recoil pad, or walnut stock & draw-bolt.',
        requires: ['rem870_strip_trigger_plate'],
        stripBlockedNoteZh: '拆解警用胡桃木枪托与清仓时请先卸除双销火控总成（步骤 04）！',
        stripBlockedNoteEn: 'Drop the dual-pin trigger plate (Step 04) before extracting the mag spring and stock draw-bolt!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['rem870_mag_tube', 'rem870_mag_follower', 'rem870_mag_spring', 'rem870_walnut_stock', 'rem870_stock_bolt'],
        bindings: [
          bind('rem870_mag_tube', 0),
          bind('rem870_mag_follower', 0),
          bind('rem870_mag_spring', 0),
          bind('rem870_walnut_stock', 0),
          bind('rem870_buttplate', 0, 1),
          bind('rem870_stock_bolt', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 30. Colt M1911A1 U.S. Army (.45 ACP) — 5-Step Toolless Field Strip
  // =========================================================================
  m1911: {
    weaponId: 'm1911',
    manualCodeZh: '美军 FM 23-35 教范 · 五步免工具野战分解',
    manualCodeEn: 'U.S. Army FM 23-35 · 5-Step Toolless Field Strip',
    steps: [
      {
        id: 'm1911_strip_magazine',
        orderLabel: '01',
        titleZh: '按下左侧弹匣释放钮，抽出 7 发 .45 ACP 单排钢弹匣',
        titleEn: 'Depress Magazine Catch & Withdraw 7-Rd .45 ACP Single-Stack Magazine',
        actionHintZh: '点击 7 发单排钢制弹匣总成（M-01/M-02/M-03）安全退出弹匣井。',
        actionHintEn: 'Click the 7-round single-stack magazine assembly to clear the magwell.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '插回 7 发单排弹匣前，必须先装复套筒、枪管与空仓挂机横销（步骤 02–05）！',
        reassembleBlockedNoteEn: 'Reassemble the slide, barrel, and slide-stop pin (Steps 02–05) before inserting the magazine!',
        triggerPartIds: ['m1911_mag_body', 'm1911_mag_follower', 'm1911_mag_spring'],
        bindings: [
          bind('m1911_mag_body', 0, 1),
          bind('m1911_mag_follower', 0, 1),
          bind('m1911_mag_spring', 0, 1),
        ],
      },
      {
        id: 'm1911_strip_bushing_plug',
        orderLabel: '02',
        titleZh: '压入滚花复进簧帽，顺时针旋转枪口衬套 45° 释放复进簧帽',
        titleEn: 'Depress Recoil Plug & Rotate Barrel Bushing 45 deg Clockwise',
        actionHintZh: '点击枪口旋转衬套（U-04）或滚花复进簧帽（U-05）卸除 16 磅复进簧张力。',
        actionHintEn: 'Click the muzzle barrel bushing (U-04) or checkered recoil plug (U-05) to release spring tension.',
        requires: ['m1911_strip_magazine'],
        stripBlockedNoteZh: '军械规范铁律：分解复进簧帽前请务必先卸除 7 发弹匣并验明空膛（步骤 01）！',
        stripBlockedNoteEn: 'Clear and withdraw the 7-round magazine (Step 01) before releasing the recoil plug!',
        reassembleBlockedNoteZh: '锁定枪口衬套与复进簧帽前，请先插回空仓挂机横销穿过单绞链下孔（步骤 03）！',
        reassembleBlockedNoteEn: 'Pin the slide stop through the swinging barrel link (Step 03) before locking the muzzle bushing!',
        triggerPartIds: ['m1911_barrel_bushing', 'm1911_recoil_plug'],
        bindings: [
          bind('m1911_barrel_bushing', 0, 1),
          bind('m1911_recoil_plug', 0, 1),
        ],
      },
      {
        id: 'm1911_strip_slide_stop',
        orderLabel: '03',
        titleZh: '对齐套筒半圆拆解缺口，横向推出空仓挂机杆与单绞链横销',
        titleEn: 'Align Slide Takedown Notch & Push Out Slide Stop Cross-Pin',
        actionHintZh: '点击左侧空仓挂机杆（F-02）抽出贯穿底把与单绞链的中心主销。',
        actionHintEn: 'Click the left-side slide stop lever (F-02) to withdraw the barrel-link cross-pin.',
        requires: ['m1911_strip_bushing_plug'],
        stripBlockedNoteZh: '复进簧正强力顶推枪管下耳压紧横销，请先旋开枪口衬套释出复进簧帽（步骤 02）！',
        stripBlockedNoteEn: 'Relieve recoil-spring tension at the bushing and plug (Step 02) before pushing out the slide stop!',
        reassembleBlockedNoteZh: '插入空仓挂机横销前，请先将枪管、单绞链、复进簧与套筒套回底把导轨（步骤 04）！',
        reassembleBlockedNoteEn: 'Mount the barrel, link, recoil spring, and slide onto the frame rails (Step 04) first!',
        triggerPartIds: ['m1911_slide_stop'],
        bindings: [bind('m1911_slide_stop', 0)],
      },
      {
        id: 'm1911_strip_slide_barrel',
        orderLabel: '04',
        titleZh: '前推磷化锻钢套筒滑脱底把，取出 16 磅复进簧、导杆、5" 枪管与单绞链',
        titleEn: 'Slide Upper Assembly Forward & Extract Recoil Spring, Guide, 5" Barrel & Link',
        actionHintZh: '点击磷化钢套筒（U-01）、5" 双闭锁筋枪管（U-02）、单绞链（U-03）或复进簧完成上机匣分解。',
        actionHintEn: 'Click the slide (U-01), 5" barrel (U-02), swinging link (U-03), or recoil spring to strip the upper.',
        requires: ['m1911_strip_slide_stop'],
        stripBlockedNoteZh: '空仓挂机横销仍锁定在底把与枪管单绞链之间，请先抽出空仓挂机杆（步骤 03）！',
        stripBlockedNoteEn: 'Push out the slide stop cross-pin (Step 03) before sliding the upper off the frame!',
        reassembleBlockedNoteZh: '套回上套筒总成前，请先复装火控、双菱格胡桃木护片与弧背主簧壳（步骤 05）！',
        reassembleBlockedNoteEn: 'Reassemble the fire control group, walnut grips, and mainspring housing (Step 05) first!',
        triggerPartIds: [
          'm1911_slide',
          'm1911_barrel',
          'm1911_barrel_link',
          'm1911_recoil_spring',
          'm1911_recoil_guide',
          'm1911_firing_pin',
          'm1911_extractor',
        ],
        bindings: [
          bind('m1911_slide', 0, 1),
          bind('m1911_barrel', 0, 1),
          bind('m1911_barrel_link', 0, 1),
          bind('m1911_recoil_spring', 0, 1),
          bind('m1911_recoil_guide', 0, 1),
          bind('m1911_firing_pin', 0, 1),
          bind('m1911_extractor', 0, 1),
        ],
      },
      {
        id: 'm1911_strip_frame_fcg',
        orderLabel: '05',
        titleZh: '拆解双菱格胡桃木护片、拇指保险、弧背主簧壳、握把保险、三叉板簧与击锤火控',
        titleEn: 'Strip Walnut Grips, Thumb Safety, Arched Housing, Grip Safety & Single-Action FCG',
        actionHintZh: '点击双菱格护片、拇指保险、弧背主簧壳或外露击锤完成底把火控全拆。',
        actionHintEn: 'Click the walnut grips, thumb safety, arched mainspring housing, or spur hammer to strip the FCG.',
        requires: ['m1911_strip_slide_barrel'],
        stripBlockedNoteZh: '细拆下机匣火控组前，请先卸除上套筒与枪管组件（步骤 04）！',
        stripBlockedNoteEn: 'Remove the slide and barrel group (Step 04) before stripping the lower frame fire control!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'm1911_grip_left',
          'm1911_grip_right',
          'm1911_thumb_safety',
          'm1911_mainspring_housing',
          'm1911_grip_safety',
          'm1911_hammer',
          'm1911_trigger',
          'm1911_sear_disconnector',
          'm1911_leaf_spring',
          'm1911_mainspring',
        ],
        bindings: [
          bind('m1911_grip_left', 0),
          bind('m1911_grip_right', 0),
          bind('m1911_thumb_safety', 0),
          bind('m1911_mainspring_housing', 0),
          bind('m1911_grip_safety', 0),
          bind('m1911_hammer', 0),
          bind('m1911_trigger', 0),
          bind('m1911_sear_disconnector', 0),
          bind('m1911_leaf_spring', 0),
          bind('m1911_mainspring', 0),
        ],
      },
    ],
  },

  // =========================================================================
  // 31. MG 42 General-Purpose Machine Gun (7.92×57mm) — 5-Step Armorer Strip
  // =========================================================================
  mg42: {
    weaponId: 'mg42',
    manualCodeZh: '德军 H.Dv. 181/2 教范 · 五步极速换管与滚柱机分解',
    manualCodeEn: 'H.Dv. 181/2 Armorer Manual · 5-Step Barrel Swap & Roller Strip',
    steps: [
      {
        id: 'mg42_strip_cover_belt',
        orderLabel: '01',
        titleZh: '掀开顶盖，卸除 50 发突击弹鼓与 Gurt 34 钢链',
        titleEn: 'Open Top Cover & Remove 50-Rd Gurttrommel Drum & Belt',
        actionHintZh: '点击受弹器顶盖、50 发侧挂突击弹鼓或 7.92mm 钢链段清枪验膛。',
        actionHintEn: 'Click the hinged top cover, 50-rd drum, or 7.92mm steel belt to clear ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '合上顶盖并挂装弹鼓前，请先复装快拆枪管（步骤 02）！',
        reassembleBlockedNoteEn: 'Reinstall the 530mm quick-change barrel (Step 02) before closing the top cover!',
        triggerPartIds: ['mg42_top_cover', 'mg42_ammo_drum', 'mg42_ammo_belt', 'mg42_feed_tray'],
        bindings: [
          bind('mg42_top_cover', 0, 1, 2),
          bind('mg42_ammo_drum', 0, 1, 2),
          bind('mg42_ammo_belt', 0, 1, 2),
          bind('mg42_feed_tray', 0, 1, 2),
        ],
      },
      {
        id: 'mg42_strip_barrel',
        orderLabel: '02',
        titleZh: '前推右侧铰接换管锁门，5 秒侧抽 530 mm 枪管',
        titleEn: 'Swing Right Hinged Barrel Latch & Withdraw 530mm Barrel',
        actionHintZh: '点击右侧铰接换管侧门或 530mm 快拆枪管体验 5 秒热管抽换。',
        actionHintEn: 'Click the right-side barrel latch door or 530mm barrel for a 5-second quick change.',
        requires: ['mg42_strip_cover_belt'],
        stripBlockedNoteZh: '更换枪管前必须先掀开顶盖卸除弹链与弹鼓并确认开膛（步骤 01）！',
        stripBlockedNoteEn: 'Open the top cover and clear the belt/drum (Step 01) before pulling the barrel!',
        reassembleBlockedNoteZh: '装回 530mm 枪管前，请先装好尾座枪托、缓冲器与复进簧（步骤 03）！',
        reassembleBlockedNoteEn: 'Reinstall buttstock, recoil buffer, and braided spring (Step 03) before locking the barrel!',
        triggerPartIds: ['mg42_barrel_latch', 'mg42_barrel'],
        bindings: [
          bind('mg42_barrel_latch', 0, 1, 2),
          bind('mg42_barrel', 0, 1, 2),
        ],
      },
      {
        id: 'mg42_strip_stock_buffer',
        orderLabel: '03',
        titleZh: '旋转 90° 卸下胶木枪托，抽出摩擦环缓冲器与三股复进簧',
        titleEn: 'Twist Buttstock 90° & Extract Friction Buffer & Braided Spring',
        actionHintZh: '点击旋锁胶木枪托、尾座缓冲器或三股绞合复进主簧。',
        actionHintEn: 'Click the twist-lock Bakelite buttstock, rear buffer, or braided driving spring.',
        requires: ['mg42_strip_barrel'],
        stripBlockedNoteZh: '拆枪托抽出复进簧前，请先卸除枪管卸荷（步骤 02）！',
        stripBlockedNoteEn: 'Withdraw the quick-change barrel (Step 02) before twisting off the buttstock!',
        reassembleBlockedNoteZh: '旋回枪托与复进簧前，请先将双滚柱枪机组滑入机匣（步骤 04）！',
        reassembleBlockedNoteEn: 'Slide the twin-roller bolt group into the receiver (Step 04) before locking the buttstock!',
        triggerPartIds: ['mg42_buttstock', 'mg42_recoil_buffer', 'mg42_buffer_spring', 'mg42_recoil_spring'],
        bindings: [
          bind('mg42_buttstock', 0, 1, 2),
          bind('mg42_recoil_buffer', 0, 1, 2),
          bind('mg42_buffer_spring', 0, 1, 2),
          bind('mg42_recoil_spring', 0, 1, 2),
        ],
      },
      {
        id: 'mg42_strip_roller_bcg',
        orderLabel: '04',
        titleZh: '向后抽出 550g 机框，分解双对称闭锁滚柱与击针斜楔',
        titleEn: 'Withdraw 550g Carrier & Strip Twin Locking Rollers & Wedge',
        actionHintZh: '点击重型机框、双滚柱机头、左右闭锁滚柱或击针斜楔。',
        actionHintEn: 'Click the bolt carrier, roller bolt head, twin rollers, or firing-pin locking wedge.',
        requires: ['mg42_strip_stock_buffer'],
        stripBlockedNoteZh: '机匣尾端由胶木枪托与缓冲器封堵，请先旋拆枪托与复进簧（步骤 03）！',
        stripBlockedNoteEn: 'Remove the buttstock, buffer, and driving spring (Step 03) to clear the rear bolt path!',
        reassembleBlockedNoteZh: '装入双滚柱枪机组前，请先装回握把火控盒与枪口助退器（步骤 05）！',
        reassembleBlockedNoteEn: 'Reattach the Bakelite grip frame and muzzle booster (Step 05) before inserting the bolt!',
        triggerPartIds: [
          'mg42_bolt_carrier',
          'mg42_bolt_head',
          'mg42_locking_rollers',
          'mg42_locking_roller_left',
          'mg42_locking_wedge',
          'mg42_charging_handle',
        ],
        bindings: [
          bind('mg42_bolt_carrier', 0, 1, 2),
          bind('mg42_bolt_head', 0, 1, 2),
          bind('mg42_locking_rollers', 0, 1, 2),
          bind('mg42_locking_roller_left', 0, 1, 2),
          bind('mg42_locking_wedge', 0, 1, 2),
          bind('mg42_charging_handle', 0, 1),
        ],
      },
      {
        id: 'mg42_strip_fcg_booster',
        orderLabel: '05',
        titleZh: '旋卸枪口锥形助退器并拆离胶木握把火控盒与两脚架',
        titleEn: 'Unscrew Muzzle Recoil Booster & Strip Grip FCG, Sights & Bipod',
        actionHintZh: '点击枪口助退器、胶木握把火控座、高射蛛网照门或两脚架完成深度勤务拆解。',
        actionHintEn: 'Click the muzzle booster, grip frame, AA spider sight, or bipod to finish detail strip.',
        requires: ['mg42_strip_roller_bcg'],
        stripBlockedNoteZh: '请先取出双滚柱枪机组（步骤 04）后再分解握把火控与助退器！',
        stripBlockedNoteEn: 'Extract the roller bolt group (Step 04) before stripping the grip FCG and booster!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'mg42_muzzle_booster',
          'mg42_grip_frame',
          'mg42_trigger',
          'mg42_sear',
          'mg42_sear_spring',
          'mg42_feed_pawl',
          'mg42_aa_sight',
          'mg42_bipod',
        ],
        bindings: [
          bind('mg42_muzzle_booster', 0, 1, 2),
          bind('mg42_grip_frame', 0, 1, 2),
          bind('mg42_trigger', 0, 1, 2),
          bind('mg42_sear', 0, 1, 2),
          bind('mg42_sear_spring', 0, 1, 2),
          bind('mg42_feed_pawl', 0, 1, 2),
          bind('mg42_aa_sight', 0, 1, 2),
          bind('mg42_bipod', 0, 1),
        ],
      },
    ],
  },

  // =========================================================================
  // 32. Mauser Karabiner 98k (7.92×57mm) — 5-Step Wehrmacht Strip
  // =========================================================================
  k98k: {
    weaponId: 'k98k',
    manualCodeZh: '德国陆军 H.Dv. 240 教范 · 五步毛瑟 98k 野战分解',
    manualCodeEn: 'Wehrmacht H.Dv. 240 Manual · 5-Step Mauser 98k Strip',
    steps: [
      {
        id: 'k98k_strip_clip_bolt',
        orderLabel: '01',
        titleZh: '卸下 5 发黄铜桥夹，竖立旗式保险并向外拨开止动卡笋抽出枪机总成',
        titleEn: 'Clear Brass Clip, Flip Flag Safety Vertical & Withdraw Bolt Assembly',
        actionHintZh: '点击 5 发黄铜桥夹、三突笋旋转枪机体、三档旗式保险或枪机尾套，整组向后抽出毛瑟枪机。',
        actionHintEn: 'Click the brass stripper clip, 3-lug bolt body, flag safety, or bolt shroud to draw the bolt clear.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '回装毛瑟 98 枪机总成与黄铜桥夹前，必须先复装内部击针主簧与长击针（步骤 02）！',
        reassembleBlockedNoteEn: 'Reassemble the firing pin, mainspring, and claw extractor (Step 02) before sliding in the bolt!',
        triggerPartIds: ['k98k_stripper_clip', 'k98k_bolt_body', 'k98k_bolt_shroud', 'k98k_flag_safety'],
        bindings: [
          bind('k98k_stripper_clip', 0),
          bind('k98k_bolt_body', 0, 1),
          bind('k98k_bolt_shroud', 0, 1),
          bind('k98k_flag_safety', 0, 1, 2),
        ],
      },
      {
        id: 'k98k_strip_striker_claw',
        orderLabel: '02',
        titleZh: '借枪托钢制拆解盘顶压尾铁，拆离长击针、24 圈主簧与不旋转大抓钩',
        titleEn: 'Strip Firing Pin, Mainspring & Non-Rotating Claw Extractor via Stock Disk',
        actionHintZh: '点击长击针、击针螺旋主簧或全长不旋转大抓钩抽壳钩，完成毛瑟枪机免工具彻底分解。',
        actionHintEn: 'Click the firing pin, firing pin mainspring, or claw extractor to strip the bolt sub-assembly.',
        requires: ['k98k_strip_clip_bolt'],
        stripBlockedNoteZh: '请先将毛瑟 98 枪机总成从大环机匣内完整抽出（步骤 01），再借拆解盘分解击针与抓钩！',
        stripBlockedNoteEn: 'Withdraw the Mauser 98 bolt assembly from the receiver (Step 01) before stripping the striker & claw!',
        reassembleBlockedNoteZh: '将击针与大抓钩装回枪机前，请先复装下挂通条、前后 H 型枪箍与上护木（步骤 03）！',
        reassembleBlockedNoteEn: 'Reinstall the cleaning rod, H-bands, and handguard (Step 03) before finalizing the bolt!',
        triggerPartIds: ['k98k_firing_pin', 'k98k_firing_pin_spring', 'k98k_claw_extractor'],
        bindings: [
          bind('k98k_firing_pin', 0, 1),
          bind('k98k_firing_pin_spring', 0, 1),
          bind('k98k_claw_extractor', 0, 1),
        ],
      },
      {
        id: 'k98k_strip_rod_bands_hg',
        orderLabel: '03',
        titleZh: '旋出下挂钢制通条，按压箍簧前推卸下 H 型前箍、后箍与层压榉木上护木',
        titleEn: 'Unscrew Cleaning Rod & Slide Off H-Band, Rear Band & Upper Handguard',
        actionHintZh: '点击下挂通条、H 型前枪箍、后枪箍或层压榉木上护木，暴露 600mm 阶梯枪管全貌。',
        actionHintEn: 'Click the cleaning rod, front H-band, rear band, or laminated handguard to expose the barrel.',
        requires: ['k98k_strip_striker_claw'],
        stripBlockedNoteZh: '遵循 H.Dv. 240 规范，请先安全抽出并分解毛瑟枪机组件（步骤 01–02）再拆卸护木与枪箍！',
        stripBlockedNoteEn: 'Clear and strip the Mauser bolt assembly (Steps 01–02) before unfastening the barrel bands!',
        reassembleBlockedNoteZh: '扣合层压榉木上护木与前后枪箍前，请先将层压榉木主枪托与护圈弹仓框复位（步骤 04–05）！',
        reassembleBlockedNoteEn: 'Seat the laminated stock and trigger guard magazine box (Steps 04–05) before sliding on the bands!',
        triggerPartIds: ['k98k_cleaning_rod', 'k98k_front_band', 'k98k_rear_band', 'k98k_handguard'],
        bindings: [
          bind('k98k_cleaning_rod', 0),
          bind('k98k_front_band', 0),
          bind('k98k_rear_band', 0),
          bind('k98k_handguard', 0),
        ],
      },
      {
        id: 'k98k_strip_floorplate_stock',
        orderLabel: '04',
        titleZh: '用弹尖顶开弹仓底板取出托弹簧与阶梯托弹板，旋出护圈与层压榉木主枪托',
        titleEn: 'Release Magazine Floorplate, Follower & Spring, Then Drop Trigger Guard & Stock',
        actionHintZh: '点击可拆弹仓底板、铣削护圈弹仓框、阶梯托弹板或层压榉木枪托分离木托与弹仓机构。',
        actionHintEn: 'Click the floorplate, trigger guard, follower, or laminated stock to detach the bottom metal and stock.',
        requires: ['k98k_strip_rod_bands_hg'],
        stripBlockedNoteZh: '前后枪箍将层压榉木枪托紧箍在枪管上，请先卸下通条、前后箍与上护木（步骤 03）！',
        stripBlockedNoteEn: 'Remove the cleaning rod, barrel bands, and handguard (Step 03) before separating the stock!',
        reassembleBlockedNoteZh: '装回层压榉木主枪托前，请先确认 600mm 阶梯枪管与两道火扳机阻铁已就位（步骤 05）！',
        reassembleBlockedNoteEn: 'Ensure the stepped barrel, sights, and two-stage trigger group (Step 05) are installed first!',
        triggerPartIds: [
          'k98k_mag_floorplate',
          'k98k_mag_spring',
          'k98k_mag_follower',
          'k98k_trigger_guard',
          'k98k_stock',
          'k98k_buttplate',
        ],
        bindings: [
          bind('k98k_mag_floorplate', 0, 1),
          bind('k98k_mag_spring', 0),
          bind('k98k_mag_follower', 0),
          bind('k98k_trigger_guard', 0),
          bind('k98k_stock', 0),
          bind('k98k_buttplate', 0, 1),
        ],
      },
      {
        id: 'k98k_strip_barrel_fcg',
        orderLabel: '05',
        titleZh: '分解两道火毛瑟扳机、杠杆阻铁与立式阻铁簧，检视 600mm 阶梯枪管与表尺',
        titleEn: 'Strip Two-Stage Trigger, Sear & Return Spring and Separate Stepped Barrel & Sights',
        actionHintZh: '点击两道火扳机、杠杆阻铁、600mm 阶梯枪管或弧形表尺完成军械师级全枪大修拆检。',
        actionHintEn: 'Click the two-stage trigger, sear, stepped barrel, or tangent sight for full armorer inspection.',
        requires: ['k98k_strip_floorplate_stock'],
        stripBlockedNoteZh: '两道火扳机与枪管由层压木托和护圈螺钉包覆固定，请先卸除弹仓底板与木托（步骤 04）！',
        stripBlockedNoteEn: 'Remove the bottom metal and laminated stock (Step 04) before stripping the trigger and barrel!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'k98k_trigger',
          'k98k_sear',
          'k98k_sear_spring',
          'k98k_barrel',
          'k98k_rear_sight',
          'k98k_front_sight',
        ],
        bindings: [
          bind('k98k_trigger', 0),
          bind('k98k_sear', 0),
          bind('k98k_sear_spring', 0),
          bind('k98k_barrel', 0),
          bind('k98k_rear_sight', 0, 1),
          bind('k98k_front_sight', 0, 1),
        ],
      },
    ],
  },

  // =========================================================================
  // 33. Thompson M1928A1 (.45 ACP) — 5-Step Drum & Blish-Lock Strip
  // =========================================================================
  thompson: {
    weaponId: 'thompson',
    manualCodeZh: '美军 FM 23-40 教范 · 五步圆鼓与布利什锁快拆',
    manualCodeEn: 'U.S. Army FM 23-40 · 5-Step Drum & Blish-Lock Strip',
    steps: [
      {
        id: 'thompson_strip_drum',
        orderLabel: '01',
        titleZh: '拨起弹鼓卡笋，横滑卸下 50 发 L 型发条大弹鼓',
        titleEn: 'Lift Catch & Slide Off 50-Round Type L Clockwork Drum',
        actionHintZh: '点击 50 发 L 型圆鼓、四翼发条转子或左侧弹鼓卡笋卸载弹药。',
        actionHintEn: 'Click the 50-round Type L drum, rotor, or left mag catch to clear ammunition.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '挂回 50 发 L 型圆鼓前，请先锁回快拆黑胡桃木后枪托（步骤 02）！',
        reassembleBlockedNoteEn: 'Slide on the detachable walnut buttstock (Step 02) before locking the 50-rd drum!',
        triggerPartIds: [
          'thompson_drum_mag',
          'thompson_drum_rotor',
          'thompson_drum_rounds',
          'thompson_drum_spring',
        ],
        bindings: [
          bind('thompson_drum_mag', 0, 1, 2),
          bind('thompson_drum_rotor', 0, 1, 2),
          bind('thompson_drum_rounds', 0, 1, 2),
          bind('thompson_drum_spring', 0, 1, 2),
        ],
      },
      {
        id: 'thompson_strip_stock',
        orderLabel: '02',
        titleZh: '按压尾部燕尾滑锁，向后抽出快拆黑胡桃木枪托',
        titleEn: 'Depress Slide Catch & Detach Quick-Release Walnut Buttstock',
        actionHintZh: '点击黑胡桃木后枪托或钢制暗门托底板沿滑轨向后卸除。',
        actionHintEn: 'Click the quick-detach walnut buttstock or steel buttplate to slide it off.',
        requires: ['thompson_strip_drum'],
        stripBlockedNoteZh: '安全第一：请先横滑卸除 50 发发条大弹鼓（步骤 01）！',
        stripBlockedNoteEn: 'Safety first: slide off the 50-round Type L drum (Step 01) first!',
        reassembleBlockedNoteZh: '滑装胡桃木后枪托前，请先扣合下机匣火控盒（步骤 03）！',
        reassembleBlockedNoteEn: 'Mate the lower trigger frame (Step 03) before sliding on the walnut buttstock!',
        triggerPartIds: ['thompson_buttstock', 'thompson_buttplate'],
        bindings: [
          bind('thompson_buttstock', 0, 1, 2),
          bind('thompson_buttplate', 0, 1, 2),
        ],
      },
      {
        id: 'thompson_strip_lower',
        orderLabel: '03',
        titleZh: '按下后缓冲锁钮，滑离整块铣削下机匣与火控握把组',
        titleEn: 'Depress Buffer Button & Slide Off Milled Lower Trigger Frame',
        actionHintZh: '点击下机匣火控盒、黑胡桃木后握把或双拨片快慢机分离下机身。',
        actionHintEn: 'Click the lower trigger frame, walnut pistol grip, or selector paddles to separate.',
        requires: ['thompson_strip_stock'],
        stripBlockedNoteZh: '后枪托挡住下机匣尾端滑道，请先拆下快拆木枪托（步骤 02）！',
        stripBlockedNoteEn: 'Remove the quick-detach buttstock (Step 02) to clear the lower frame rails!',
        reassembleBlockedNoteZh: '扣合下机匣前，请先装回复进簧、导杆、青铜布利什块与枪机（步骤 04）！',
        reassembleBlockedNoteEn: 'Reinstall recoil spring, buffer pilot, bronze Blish lock, and bolt (Step 04) first!',
        triggerPartIds: [
          'thompson_lower_frame',
          'thompson_pistol_grip',
          'thompson_trigger',
          'thompson_sear',
          'thompson_sear_spring',
          'thompson_selector_levers',
          'thompson_mag_catch',
        ],
        bindings: [
          bind('thompson_lower_frame', 0, 1, 2),
          bind('thompson_pistol_grip', 0, 1, 2),
          bind('thompson_trigger', 0, 1, 2),
          bind('thompson_sear', 0, 1, 2),
          bind('thompson_sear_spring', 0, 1, 2),
          bind('thompson_selector_levers', 0, 1, 2),
          bind('thompson_mag_catch', 0, 1, 2),
        ],
      },
      {
        id: 'thompson_strip_blish_bolt',
        orderLabel: '04',
        titleZh: '取出纤维缓冲导杆、复进簧、青铜 H 型布利什锁与顶置拉柄枪机',
        titleEn: 'Withdraw Fiber Buffer, Spring, Bronze Blish Lock & Top-Actuator Bolt',
        actionHintZh: '点击青铜布利什块、铣削枪机、顶置滚花拉机柄或复进簧完成核心分解。',
        actionHintEn: 'Click the bronze Blish H-piece, bolt, top actuator knob, or recoil spring.',
        requires: ['thompson_strip_lower'],
        stripBlockedNoteZh: '枪机与复进簧封闭于上下机匣间，请先滑离下机匣（步骤 03）！',
        stripBlockedNoteEn: 'Slide off the lower trigger frame (Step 03) to open the upper receiver bottom!',
        reassembleBlockedNoteZh: '装回布利什枪机组前，请先复装散热鳍枪管、卡茨防跳器与前握把（步骤 05）！',
        reassembleBlockedNoteEn: 'Reassemble the finned barrel, Cutts comp, and vertical foregrip (Step 05) first!',
        triggerPartIds: [
          'thompson_buffer_pilot',
          'thompson_recoil_spring',
          'thompson_blish_lock',
          'thompson_bolt',
          'thompson_actuator',
          'thompson_hammer_pin',
          'thompson_oiler',
        ],
        bindings: [
          bind('thompson_buffer_pilot', 0, 1, 2),
          bind('thompson_recoil_spring', 0, 1, 2),
          bind('thompson_blish_lock', 0, 1, 2),
          bind('thompson_bolt', 0, 1, 2),
          bind('thompson_actuator', 0, 1, 2),
          bind('thompson_hammer_pin', 0, 1, 2),
          bind('thompson_oiler', 0, 1),
        ],
      },
      {
        id: 'thompson_strip_front',
        orderLabel: '05',
        titleZh: '拆解垂直黑胡桃木前握把、卡茨防跳器、28 道散热鳍枪管与莱曼照门',
        titleEn: 'Strip Vertical Foregrip, Cutts Comp, 28-Fin Barrel & Lyman Sight',
        actionHintZh: '点击垂直前握把、卡茨防跳器、散热鳍枪管或莱曼梯形表尺完成全拆。',
        actionHintEn: 'Click the vertical foregrip, Cutts comp, finned barrel, or Lyman ladder sight.',
        requires: ['thompson_strip_blish_bolt'],
        stripBlockedNoteZh: '请先抽出青铜布利什枪机组（步骤 04）后再分解前段与表尺！',
        stripBlockedNoteEn: 'Extract the Blish bolt group (Step 04) before stripping the front assembly!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: [
          'thompson_foregrip',
          'thompson_cutts_comp',
          'thompson_barrel',
          'thompson_lyman_sight',
        ],
        bindings: [
          bind('thompson_foregrip', 0, 1),
          bind('thompson_cutts_comp', 0, 1),
          bind('thompson_barrel', 0, 1),
          bind('thompson_lyman_sight', 0, 1),
        ],
      },
    ],
  },

  // =========================================================================
  // 34. GE GAU-8/A Avenger (30×173mm) — 6-Step USAF Heavy Armament Strip
  // =========================================================================
  gau8: {
    weaponId: 'gau8',
    manualCodeZh: 'USAF T.O. 1A-10A-2 航炮勤务教范 · 六步重武吊装分解',
    manualCodeEn: 'USAF T.O. 1A-10A-2 Armament Manual · 6-Step Heavy Strip',
    steps: [
      {
        id: 'gau8_strip_chutes',
        orderLabel: '01',
        titleZh: '解脱双侧无链进弹与空壳返鼓滑槽',
        titleEn: 'Unbolt Twin Linkless Feed & Return Conveyor Chutes',
        actionHintZh: '点击左侧实弹输送槽或右侧空壳返鼓槽，向外解脱法兰断开弹鼓与炮尾连接。',
        actionHintEn: 'Click the left live feed chute or right return chute to uncouple the drum from the breech transfer unit.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '必须先将巨型螺旋弹鼓推回对位并装好交接单元，最后再扣锁双侧无链滑槽。',
        reassembleBlockedNoteEn: 'Re-dock the helical drum and transfer unit before bolting on the twin linkless chutes.',
        triggerPartIds: ['gau8_chute_feed', 'gau8_chute_return'],
        bindings: [
          bind('gau8_chute_feed', 0, 1),
          bind('gau8_chute_return', 0, 1),
        ],
      },
      {
        id: 'gau8_strip_drum',
        orderLabel: '02',
        titleZh: '后移 1,150 发螺旋弹鼓并吊出 30mm 弹药阵与转子',
        titleEn: 'Roll Back 1,150-Rd Helical Drum & Hoist 30mm Spiral',
        actionHintZh: '点击航空橄榄绿螺旋弹鼓或内部 30×173mm 弹药阵列，后滚弹鼓并升出内转子。',
        actionHintEn: 'Click the helical ammo drum or 30x173mm round stack to roll the drum aft and hoist the rotor clear.',
        requires: ['gau8_strip_chutes'],
        stripBlockedNoteZh: '双侧无链输弹滑槽仍锁接在弹鼓前法兰上，请先拆离两侧滑槽！',
        stripBlockedNoteEn: 'The twin linkless chutes are still bolted to the drum front ports—remove the chutes first!',
        reassembleBlockedNoteZh: '螺旋弹鼓与内部弹药阵必须在交接单元和液压驱动安装完毕前就位。',
        reassembleBlockedNoteEn: 'Reassemble the helical drum before re-attaching the twin conveyor chutes.',
        triggerPartIds: ['gau8_ammo_drum', 'gau8_ammo_belt_stack', 'gau8_drum_rotor'],
        bindings: [
          bind('gau8_ammo_drum', 0, 1),
          bind('gau8_ammo_belt_stack', 0, 1),
          bind('gau8_drum_rotor', 0, 1),
        ],
      },
      {
        id: 'gau8_strip_clamps',
        orderLabel: '03',
        titleZh: '前抽穿孔热回火炮口箍与中段双钛合金稳定箍',
        titleEn: 'Pull Forward Muzzle Clamp & Mid Titanium Barrel Spiders',
        actionHintZh: '点击前段穿孔炮口箍或中段钛合金稳定箍，释放七根 2.3 米炮管前支点。',
        actionHintEn: 'Click the perforated muzzle clamp or mid titanium spider clamps to free the seven 2.3 m barrels.',
        requires: [],
        stripBlockedNoteZh: '',
        stripBlockedNoteEn: '',
        reassembleBlockedNoteZh: '炮口箍与稳定箍须在七管炮管簇回锁至星形转子后再向前套入锁紧。',
        reassembleBlockedNoteEn: 'Seat the seven-barrel cluster into the star-rotor before sliding on the titanium clamps.',
        triggerPartIds: ['gau8_muzzle_clamp', 'gau8_barrel_clamps'],
        bindings: [
          bind('gau8_muzzle_clamp', 0, 1, 2),
          bind('gau8_barrel_clamps', 0, 1, 2),
        ],
      },
      {
        id: 'gau8_strip_hydraulics',
        orderLabel: '04',
        titleZh: '卸压并吊离双 38.5 马力液压驱动马达与交接单元',
        titleEn: 'Hoist Twin 38.5-HP Hydraulic Motors & Breech Transfer Unit',
        actionHintZh: '点击钴蓝色双液压驱动马达或炮尾无链交接单元，解除 3,000 PSI 动力输入与清膛门。',
        actionHintEn: 'Click the twin hydraulic drive motors or breech transfer unit to clear the rear housing.',
        requires: ['gau8_strip_chutes'],
        stripBlockedNoteZh: '无链滑槽仍锚固于交接单元左右法兰，请先拆离双侧输弹滑槽！',
        stripBlockedNoteEn: 'Disconnect the left and right linkless chutes from the transfer unit first!',
        reassembleBlockedNoteZh: '必须先将星形转子、七炮闩与 360° 凸轮套筒装回主炮匣，再安装尾部双液压马达。',
        reassembleBlockedNoteEn: 'Reinstall the cam track, star-rotor, and seven bolts before bolting on the hydraulic gearbox.',
        triggerPartIds: ['gau8_hydraulic_motors', 'gau8_transfer_unit', 'gau8_buffer_spring'],
        bindings: [
          bind('gau8_hydraulic_motors', 0, 1),
          bind('gau8_transfer_unit', 0, 1),
          bind('gau8_buffer_spring', 0, 1),
        ],
      },
      {
        id: 'gau8_strip_barrels_buffers',
        orderLabel: '05',
        titleZh: '前抽七管 2.3 米炮管簇并分离双液气反后坐缓冲筒',
        titleEn: 'Withdraw 7-Barrel Cluster & Dual Hydro-Pneumatic Buffers',
        actionHintZh: '点击七管旋转炮管簇或左右双液气缓冲筒，释放炮管闭锁盘与反后坐复进簧。',
        actionHintEn: 'Click the seven-barrel cluster or twin recoil buffers to withdraw them from the gun housing.',
        requires: ['gau8_strip_clamps'],
        stripBlockedNoteZh: '穿孔炮口箍与中段稳定箍仍抱紧七根炮管，请先卸除炮口箍与稳定箍！',
        stripBlockedNoteEn: 'Remove the muzzle clamp and mid titanium barrel clamps before pulling the seven barrels!',
        reassembleBlockedNoteZh: '必须先将主炮匣与内部星形转子就位，再旋装七根 2.3 米重型炮管。',
        reassembleBlockedNoteEn: 'Re-seat the housing and star-rotor before locking the seven-barrel cluster back in place.',
        triggerPartIds: ['gau8_barrel_cluster', 'gau8_recoil_buffers', 'gau8_recoil_springs'],
        bindings: [
          bind('gau8_barrel_cluster', 0, 1, 2),
          bind('gau8_recoil_buffers', 0, 1),
          bind('gau8_recoil_springs', 0, 1),
        ],
      },
      {
        id: 'gau8_strip_rotor_cam',
        orderLabel: '06',
        titleZh: '航吊抬升主炮匣，抽出 360° 凸轮套筒、星形转子与七套炮闩',
        titleEn: 'Hoist Gun Housing & Extract 360° Cam Track, Rotor & 7 Bolts',
        actionHintZh: '点击主炮匣、360° 正弦凸轮套筒或星形转子，将核心旋转机构呈七芒星完整展开。',
        actionHintEn: 'Click the gun housing, cam track sleeve, or star-rotor to fan out all seven titanium rotary bolts.',
        requires: ['gau8_strip_hydraulics', 'gau8_strip_barrels_buffers'],
        stripBlockedNoteZh: '七管炮管簇或尾部双液压马达仍锁连主转子，请先完成第 4、5 步再抽出转子与七套炮闩！',
        stripBlockedNoteEn: 'Remove the hydraulic motors and seven-barrel cluster before extracting the cam sleeve and star-rotor!',
        reassembleBlockedNoteZh: '',
        reassembleBlockedNoteEn: '',
        triggerPartIds: ['gau8_gun_housing', 'gau8_cam_track', 'gau8_rotor_core', 'gau8_bolt_1', 'gau8_striker_spring'],
        bindings: [
          bind('gau8_gun_housing', 0, 1),
          bind('gau8_cam_track', 0, 1),
          bind('gau8_rotor_core', 0, 1),
          bind('gau8_striker_spring', 0, 1),
          bind('gau8_bolt_1', 0, 1),
          bind('gau8_bolt_2', 0, 1),
          bind('gau8_bolt_3', 0, 1),
          bind('gau8_bolt_4', 0, 1),
          bind('gau8_bolt_5', 0, 1),
          bind('gau8_bolt_6', 0, 1),
          bind('gau8_bolt_7', 0, 1),
        ],
      },
    ],
  },
  ...buildCentennialFieldStripPlans(),
};

export function getFieldStripPlan(weaponId: WeaponId): FieldStripWeaponPlan {
  return FIELD_STRIP_PLANS[weaponId];
}

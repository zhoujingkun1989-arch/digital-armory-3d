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
};

export function getFieldStripPlan(weaponId: WeaponId): FieldStripWeaponPlan {
  return FIELD_STRIP_PLANS[weaponId];
}

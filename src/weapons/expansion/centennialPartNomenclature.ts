import type {
  AssemblyGroupKey,
  AssemblyGroupMeta,
  MaterialKind,
} from '../types';
import type { CentennialWeaponBlueprint } from './centennialTypes';

// ============================================================================
// Digital Armory 3D — Centennial 20-Part Archetype-Aware Bilingual Nomenclature
// ----------------------------------------------------------------------------
// Pure leaf module (ONLY `import type` — zero runtime imports from store,
// catalog, stage, i18n, or three). Projects authentic domain-tailored Chinese
// and English engineering nomenclature across all 66 Centennial exhibits.
// ============================================================================

export const CENTENNIAL_PART_SLOTS = [
  'receiver',
  'barrel',
  'muzzle',
  'bolt_carrier',
  'bolt',
  'recoil_spring',
  'handguard',
  'stock',
  'grip',
  'optic',
  'gas_system',
  'mount_rail',
  'trigger',
  'hammer',
  'hammer_spring',
  'selector',
  'mag_body',
  'follower',
  'mag_spring',
  'mag_base',
] as const;

export type CentennialPartSlot = (typeof CENTENNIAL_PART_SLOTS)[number];

export interface CentennialPartSlotMeta {
  readonly slot: CentennialPartSlot;
  readonly bomCode: string;
  readonly group: AssemblyGroupKey;
  readonly material: MaterialKind;
  readonly isShell: boolean;
  readonly nameZh: string;
  readonly nameEn: string;
  readonly calloutLabelZh: string;
  readonly calloutLabelEn: string;
  readonly roleTagZh: string;
  readonly roleTagEn: string;
  readonly descZh: string;
  readonly descEn: string;
}

interface SlotStructuralDefaults {
  readonly bomCode: string;
  readonly group: AssemblyGroupKey;
  readonly defaultMaterial: MaterialKind;
  readonly isShell: boolean;
}

const SLOT_STRUCTURAL_DEFAULTS: Readonly<
  Record<CentennialPartSlot, SlotStructuralDefaults>
> = {
  receiver: {
    bomCode: 'U-01',
    group: 'slide',
    defaultMaterial: 'nitride_steel',
    isShell: true,
  },
  barrel: {
    bomCode: 'U-02',
    group: 'slide',
    defaultMaterial: 'barrel_steel',
    isShell: false,
  },
  muzzle: {
    bomCode: 'U-03',
    group: 'slide',
    defaultMaterial: 'nitride_steel',
    isShell: false,
  },
  bolt_carrier: {
    bomCode: 'U-04',
    group: 'slide',
    defaultMaterial: 'stainless',
    isShell: false,
  },
  bolt: {
    bomCode: 'U-05',
    group: 'slide',
    defaultMaterial: 'stainless',
    isShell: false,
  },
  recoil_spring: {
    bomCode: 'U-06',
    group: 'slide',
    defaultMaterial: 'spring_steel',
    isShell: false,
  },
  handguard: {
    bomCode: 'F-01',
    group: 'frame',
    defaultMaterial: 'polymer_frame',
    isShell: false,
  },
  stock: {
    bomCode: 'F-02',
    group: 'frame',
    defaultMaterial: 'polymer_frame',
    isShell: false,
  },
  grip: {
    bomCode: 'F-03',
    group: 'frame',
    defaultMaterial: 'polymer_frame',
    isShell: false,
  },
  optic: {
    bomCode: 'F-04',
    group: 'frame',
    defaultMaterial: 'nitride_steel',
    isShell: false,
  },
  gas_system: {
    bomCode: 'F-05',
    group: 'frame',
    defaultMaterial: 'stainless',
    isShell: false,
  },
  mount_rail: {
    bomCode: 'F-06',
    group: 'frame',
    defaultMaterial: 'nitride_steel',
    isShell: false,
  },
  trigger: {
    bomCode: 'T-01',
    group: 'fire_control',
    defaultMaterial: 'nitride_steel',
    isShell: false,
  },
  hammer: {
    bomCode: 'T-02',
    group: 'fire_control',
    defaultMaterial: 'stainless',
    isShell: false,
  },
  hammer_spring: {
    bomCode: 'T-03',
    group: 'fire_control',
    defaultMaterial: 'spring_steel',
    isShell: false,
  },
  selector: {
    bomCode: 'T-04',
    group: 'fire_control',
    defaultMaterial: 'copper_accent',
    isShell: false,
  },
  mag_body: {
    bomCode: 'M-01',
    group: 'magazine',
    defaultMaterial: 'polymer_frame',
    isShell: true,
  },
  follower: {
    bomCode: 'M-02',
    group: 'magazine',
    defaultMaterial: 'follower_orange',
    isShell: false,
  },
  mag_spring: {
    bomCode: 'M-03',
    group: 'magazine',
    defaultMaterial: 'spring_steel',
    isShell: false,
  },
  mag_base: {
    bomCode: 'M-04',
    group: 'magazine',
    defaultMaterial: 'nitride_steel',
    isShell: false,
  },
};

type PartTextSpec = Omit<
  CentennialPartSlotMeta,
  'slot' | 'bomCode' | 'group' | 'material' | 'isShell'
> & {
  readonly material?: MaterialKind;
};

function makeMeta(
  slot: CentennialPartSlot,
  spec: PartTextSpec
): CentennialPartSlotMeta {
  const base = SLOT_STRUCTURAL_DEFAULTS[slot];
  return {
    slot,
    bomCode: base.bomCode,
    group: base.group,
    material: spec.material ?? base.defaultMaterial,
    isShell: base.isShell,
    nameZh: spec.nameZh,
    nameEn: spec.nameEn,
    calloutLabelZh: spec.calloutLabelZh,
    calloutLabelEn: spec.calloutLabelEn,
    roleTagZh: spec.roleTagZh,
    roleTagEn: spec.roleTagEn,
    descZh: spec.descZh,
    descEn: spec.descEn,
  };
}

function resolveMuzzleText(bp: CentennialWeaponBlueprint): PartTextSpec {
  switch (bp.cad.muzzleStyle) {
    case 'suppressor':
      return {
        nameZh: '低回压膛口消音器',
        nameEn: 'Flow-Through Muzzle Suppressor',
        calloutLabelZh: '膛口消音器',
        calloutLabelEn: 'Muzzle Suppressor',
        roleTagZh: '降噪降焰',
        roleTagEn: 'Acoustic Dampening',
        descZh: `适配 ${bp.caliberLabel} 的多室膨胀消音器，通过内部挡板延迟高压火药燃气排出并大幅削减枪口爆音与焰光。`,
        descEn: `Multi-baffle suppressor tuned for ${bp.caliberLabel}, expanding and cooling propellant gas to cut acoustic signature and muzzle flash.`,
      };
    case 'brake':
      return {
        nameZh: '多室膛口制退补偿器',
        nameEn: 'Multi-Chamber Muzzle Brake',
        calloutLabelZh: '膛口制退器',
        calloutLabelEn: 'Muzzle Brake',
        roleTagZh: '制退抑跳',
        roleTagEn: 'Recoil Mitigation',
        descZh: `将 ${bp.caliberLabel} 膛口高压火药燃气向侧后方偏转喷射，产生向前反推分力以显著削减后坐冲量与枪口上跳。`,
        descEn: `Redirects ${bp.caliberLabel} muzzle gas laterally and rearward to generate counter-thrust that cuts recoil impulse and muzzle climb.`,
      };
    case 'flash_hider':
      return {
        nameZh: '开槽膛口消焰器',
        nameEn: 'Slotted Muzzle Flash Hider',
        calloutLabelZh: '膛口消焰器',
        calloutLabelEn: 'Flash Hider',
        roleTagZh: '消焰护口',
        roleTagEn: 'Flash Suppression',
        descZh: `在 ${bp.barrelLengthMm} mm 枪管前端打散未燃尽火药燃气羽流，防止夜间射击暴露射手位置并保护膛口冠部。`,
        descEn: `Disperses unburnt propellant plume at the tip of the ${bp.barrelLengthMm} mm barrel to suppress flash signature and guard the crown.`,
      };
    case 'shroud':
      return {
        nameZh: '穿孔散热枪管护筒',
        nameEn: 'Perforated Barrel Cooling Shroud',
        calloutLabelZh: '穿孔散热筒',
        calloutLabelEn: 'Cooling Shroud',
        roleTagZh: '散热防护',
        roleTagEn: 'Thermal Shielding',
        descZh: `包覆 ${bp.shortLabel} 枪管外侧的穿孔钢制散热护筒，强化持续连发对流冷却并防止射手烫伤。`,
        descEn: `Perforated steel shroud enveloping the ${bp.shortLabel} barrel to promote convective cooling and shield the operator during sustained fire.`,
      };
    case 'rotary_clamp':
      return {
        nameZh: '多管旋转膛口定位箍',
        nameEn: 'Rotary Barrel Cluster Muzzle Clamp',
        calloutLabelZh: '旋转膛口箍',
        calloutLabelEn: 'Rotary Muzzle Clamp',
        roleTagZh: '多管定心',
        roleTagEn: 'Cluster Alignment',
        descZh: `在高速旋转离心载荷下精确锁定 ${bp.shortLabel} 多根炮管轴向间距，确保超高射速弹道散布可控。`,
        descEn: `Locks the radial spacing of the spinning ${bp.shortLabel} barrel cluster under centrifugal load to keep high-cadence dispersion tight.`,
      };
    case 'tank_evacuator':
      return {
        nameZh: '主炮抽烟装置与炮口基准镜',
        nameEn: 'Bore Evacuator & Muzzle Reference',
        calloutLabelZh: '抽烟器/基准镜',
        calloutLabelEn: 'Bore Evacuator & MRS',
        roleTagZh: '排烟校准',
        roleTagEn: 'Fume Extraction',
        descZh: `利用压差在炮闩开启前向前吹除炮膛有毒火药烟气，并在炮口端配备火控身管弯曲基准反射镜。`,
        descEn: `Uses pressure-differential jetting to purge toxic propellant fumes forward before breech opening, paired with an optical muzzle reference sensor.`,
      };
    case 'artillery_brake':
      return {
        nameZh: '双室重载火炮膛口制退器',
        nameEn: 'Heavy Dual-Baffle Artillery Brake',
        calloutLabelZh: '重炮制退器',
        calloutLabelEn: 'Artillery Muzzle Brake',
        roleTagZh: '重载减冲',
        roleTagEn: 'Heavy Recoil Brake',
        descZh: `承受巨额火炮发射药气流冲击并将部分后坐能量转化为前拉力，减轻 ${bp.shortLabel} 炮架与反后坐装置峰值载荷。`,
        descEn: `Channels extreme propellant blast laterally to absorb recoil energy and reduce peak loads on the ${bp.shortLabel} recoil cradle and carriage.`,
      };
    case 'bare':
    default:
      return {
        nameZh: '精密膛口冠部与准星座',
        nameEn: 'Crowned Muzzle & Front Sight Base',
        calloutLabelZh: '膛口冠/准星',
        calloutLabelEn: 'Muzzle Crown & Sight',
        roleTagZh: '射流定心',
        roleTagEn: 'Crown Symmetry',
        descZh: `经精密倒角加工的 ${bp.caliberLabel} 膛口冠部，确保弹头出膛瞬间燃气对称脱离以维持稳定弹道。`,
        descEn: `Precision-chamfered muzzle crown for ${bp.caliberLabel}, ensuring symmetric gas release as the projectile exits the bore.`,
      };
  }
}

function resolveFeedAssembly(
  bp: CentennialWeaponBlueprint,
  slot: 'mag_body' | 'follower' | 'mag_spring' | 'mag_base'
): PartTextSpec {
  const cap = bp.magCapacity;
  const cal = bp.caliberLabel;

  if (bp.cad.magStyle === 'belt') {
    if (slot === 'mag_body') {
      return {
        material: 'nitride_steel',
        nameZh: `${cap} 发金属弹链供弹盒与受弹机`,
        nameEn: `${cap}-Rd Belt Feed Tray & Ammo Box`,
        calloutLabelZh: '弹链供弹盒',
        calloutLabelEn: 'Belt Feed Tray',
        roleTagZh: '弹链供弹',
        roleTagEn: 'Belt Feed Housing',
        descZh: `容纳并导向 ${cap} 发 ${cal} 金属弹链的供弹受弹机构，配合顶盖双棘爪完成高速横向拨弹。`,
        descEn: `Guides and feeds ${cap}-round ${cal} metallic belts smoothly beneath the feed pawls during sustained automatic fire.`,
      };
    }
    if (slot === 'follower') {
      return {
        nameZh: '双向拨弹棘爪与定位滑板',
        nameEn: 'Belt Feed Pawl & Indexing Shuttle',
        calloutLabelZh: '拨弹棘爪滑板',
        calloutLabelEn: 'Feed Pawl Shuttle',
        roleTagZh: '步进输弹',
        roleTagEn: 'Belt Indexing',
        descZh: `随枪机框往复运动驱动弹链逐发横移对正弹膛中心线，确保连发射击供弹零错位。`,
        descEn: `Translates carrier reciprocation into lateral belt indexing, aligning each cartridge squarely with the chamber axis.`,
      };
    }
    if (slot === 'mag_spring') {
      return {
        nameZh: '拨弹止逆棘爪复位簧',
        nameEn: 'Feed Pawl Tension & Anti-Reverse Spring',
        calloutLabelZh: '拨弹止逆簧',
        calloutLabelEn: 'Feed Pawl Spring',
        roleTagZh: '止逆张紧',
        roleTagEn: 'Pawl Tensioning',
        descZh: `向拨弹爪与止逆卡爪施加恒定压紧力，防止重型弹链在剧烈振动下倒滑脱链。`,
        descEn: `Maintains steady downward tension on feed and retention pawls to prevent heavy belt slip under vibration.`,
      };
    }
    return {
      nameZh: '弹链挂架底座与退链导槽',
      nameEn: 'Ammo Box Hanger & Link Ejection Chute',
      calloutLabelZh: '弹箱挂架底座',
      calloutLabelEn: 'Feed Box Hanger',
      roleTagZh: '挂装退链',
      roleTagEn: 'Link Chute & Mount',
      descZh: `将弹箱刚性锁挂于机匣下侧并顺畅导出击发后脱离的空弹链节。`,
      descEn: `Secures the ammunition container beneath the receiver and directs spent belt links cleanly away from the action.`,
    };
  }

  if (bp.cad.magStyle === 'pan') {
    if (slot === 'mag_body') {
      return {
        material: 'nitride_steel',
        nameZh: `${cap} 发顶置辐射式圆盘弹匣`,
        nameEn: `${cap}-Rd Top-Mounted Pan Magazine`,
        calloutLabelZh: `${cap}发圆盘弹匣`,
        calloutLabelEn: `${cap}-Rd Top Pan Mag`,
        roleTagZh: '辐射供弹',
        roleTagEn: 'Radial Pan Feed',
        descZh: `将 ${cap} 发 ${cal} 凸缘弹药呈辐射状向心排列于上下双盘之间，彻底避免凸缘互锁卡弹。`,
        descEn: `Arranges ${cap} rimmed ${cal} rounds radially inside twin stamped steel dishes to eliminate rim-lock stoppages.`,
      };
    }
    if (slot === 'follower') {
      return {
        nameZh: '圆盘螺旋拨弹推臂',
        nameEn: 'Pan Magazine Rotary Feed Arm',
        calloutLabelZh: '圆盘拨弹推臂',
        calloutLabelEn: 'Pan Rotary Follower',
        roleTagZh: '旋转输弹',
        roleTagEn: 'Rotary Feed Drive',
        descZh: `在中心发条驱动下推动辐射弹列逐发转入底部供弹口，保证稳定进弹。`,
        descEn: `Sweeps radial cartridges around the pan circumference into the bottom feed throat under clockwork torque.`,
      };
    }
    if (slot === 'mag_spring') {
      return {
        nameZh: '中心平面涡卷发条主簧',
        nameEn: 'Central Clockwork Spiral Drive Spring',
        calloutLabelZh: '圆盘发条主簧',
        calloutLabelEn: 'Pan Clockwork Spring',
        roleTagZh: '发条储能',
        roleTagEn: 'Torsional Feed Energy',
        descZh: `储存旋转弹盘所需持续扭矩的平面钢带卷簧，确保末发弹药仍具足够进弹速度。`,
        descEn: `Flat-coil torsional clockwork spring storing rotational torque to feed all ${cap} cartridges consistently.`,
      };
    }
    return {
      nameZh: '弹盘锁扣盖板与定心轴座',
      nameEn: 'Pan Center Hub & Locking Retainer',
      calloutLabelZh: '弹盘定心轴座',
      calloutLabelEn: 'Pan Hub & Latch',
      roleTagZh: '顶装锁紧',
      roleTagEn: 'Pan Retention',
      descZh: `将圆盘弹匣快装定位于机匣顶部供弹桥并承载发条旋转中心轴。`,
      descEn: `Locks the pan magazine atop the receiver feed bridge while supporting the central clockwork spindle.`,
    };
  }

  if (bp.cad.magStyle === 'drum') {
    const isHelical = bp.id === 'bizon';
    if (slot === 'mag_body') {
      return {
        material: 'nitride_steel',
        nameZh: isHelical
          ? `${cap} 发下置螺旋筒形弹筒`
          : `${cap} 发大容积圆鼓弹匣`,
        nameEn: isHelical
          ? `${cap}-Rd Under-Barrel Helical Magazine`
          : `${cap}-Rd High-Capacity Drum Magazine`,
        calloutLabelZh: isHelical ? `${cap}发螺旋弹筒` : `${cap}发圆鼓弹匣`,
        calloutLabelEn: isHelical
          ? `${cap}-Rd Helical Mag`
          : `${cap}-Rd Drum Magazine`,
        roleTagZh: '大容供弹',
        roleTagEn: 'High-Cap Feed',
        descZh: isHelical
          ? `兼具前护木握持功能的 ${cap} 发螺旋轨道弹筒，让 ${cal} 弹药沿螺旋导槽轴向推进。`
          : `紧凑容纳 ${cap} 发 ${cal} 弹药的圆鼓供弹壳体，为近距压制提供持久火力密度。`,
        descEn: isHelical
          ? `Doubles as a tubular forend while guiding ${cap} ${cal} rounds along an internal Archimedes helical track.`
          : `High-capacity cylindrical drum housing ${cap} rounds of ${cal} for sustained close-quarters suppression.`,
      };
    }
    if (slot === 'follower') {
      return {
        nameZh: isHelical ? '螺旋导槽旋转推弹头' : '弹鼓蜗轮旋转拨弹臂',
        nameEn: isHelical
          ? 'Helical Track Rotating Follower'
          : 'Drum Rotary Feed Spider',
        calloutLabelZh: isHelical ? '螺旋推弹头' : '弹鼓旋转拨臂',
        calloutLabelEn: isHelical ? 'Helical Follower' : 'Drum Feed Rotor',
        roleTagZh: '旋推进弹',
        roleTagEn: 'Rotary Feed',
        descZh: `将发条扭矩转化为持续平稳的供弹推力，逐发推送弹药进入供弹唇口。`,
        descEn: `Converts clockwork spring torque into continuous cartridge advancement up to the feed lips.`,
      };
    }
    if (slot === 'mag_spring') {
      return {
        nameZh: '发条储能螺旋主簧',
        nameEn: 'Drum Clockwork Drive Spring',
        calloutLabelZh: '弹鼓发条主簧',
        calloutLabelEn: 'Drum Drive Spring',
        roleTagZh: '扭矩储能',
        roleTagEn: 'Feed Torque',
        descZh: `内置高张力储能发条簧，为高速连发供弹提供恒定角动量。`,
        descEn: `High-tension torsion spring providing steady angular force for high-cadence cyclic feeding.`,
      };
    }
    return {
      nameZh: '弹鼓上弦旋钮与快拆底盖',
      nameEn: 'Drum Winding Key & Rear Cover',
      calloutLabelZh: '弹鼓上弦盖板',
      calloutLabelEn: 'Drum Cover & Winder',
      roleTagZh: '上弦闭壳',
      roleTagEn: 'Winding & Cover',
      descZh: `用于装弹预紧发条与快速拆检清理弹鼓内部导轨的锁扣端盖。`,
      descEn: `Winds the internal torsion spring during loading and latches shut to seal the drum tracks.`,
    };
  }

  if (bp.cad.magStyle === 'tube') {
    if (slot === 'mag_body') {
      return {
        material: 'nitride_steel',
        nameZh: `${cap} 发枪管下置管状弹仓`,
        nameEn: `${cap}-Rd Under-Barrel Tubular Magazine`,
        calloutLabelZh: '管状弹仓筒',
        calloutLabelEn: 'Tubular Magazine',
        roleTagZh: '纵列储弹',
        roleTagEn: 'Tubular Storage',
        descZh: `沿枪管下方纵向串联容纳 ${cap} 发 ${cal} 霰弹的无缝钢管弹仓，重心贴近握持轴线。`,
        descEn: `Seamless steel tube beneath the barrel storing ${cap} ${cal} shells inline to keep balance close to the bore.`,
      };
    }
    if (slot === 'follower') {
      return {
        nameZh: '高可见度管仓圆柱托弹头',
        nameEn: 'High-Visibility Tubular Follower',
        calloutLabelZh: '管仓托弹头',
        calloutLabelEn: 'Tube Mag Follower',
        roleTagZh: '空仓指示',
        roleTagEn: 'Shell Feed & Check',
        descZh: `低摩擦高醒目色圆柱托弹塞，将末发霰弹推入托弹板并兼作空仓目视/触觉提示。`,
        descEn: `Low-friction high-visibility plunger pushing shells onto the carrier while signaling an empty tube by sight or touch.`,
      };
    }
    if (slot === 'mag_spring') {
      return {
        nameZh: '全长螺旋管仓托弹簧',
        nameEn: 'Full-Length Tubular Magazine Spring',
        calloutLabelZh: '管仓长托弹簧',
        calloutLabelEn: 'Tube Mag Spring',
        roleTagZh: '推弹储能',
        roleTagEn: 'Tube Feed Force',
        descZh: `贯穿管状弹仓全长的耐疲劳螺旋弹簧，持续将霰弹向后送往双阻铁托弹机构。`,
        descEn: `Full-length helical compression spring pushing shells rearward against the twin receiver shell latches.`,
      };
    }
    return {
      nameZh: '滚花弹仓端帽与背带环座',
      nameEn: 'Knurled Magazine Cap & Sling Stud',
      calloutLabelZh: '弹仓滚花端帽',
      calloutLabelEn: 'Magazine End Cap',
      roleTagZh: '封口固管',
      roleTagEn: 'Cap & Barrel Lock',
      descZh: `旋紧封闭管状弹仓前端并将枪管环抱锁紧于机匣的滚花钢制端帽。`,
      descEn: `Threaded knurled cap retaining the magazine spring and clamping the barrel lug solidly to the receiver.`,
    };
  }

  if (bp.cad.magStyle === 'box_internal') {
    if (slot === 'mag_body') {
      return {
        material: 'nitride_steel',
        nameZh: `${cap} 发内置固定弹仓体`,
        nameEn: `${cap}-Rd Integral Box Magazine`,
        calloutLabelZh: `${cap}发内置弹仓`,
        calloutLabelEn: `${cap}-Rd Integral Mag`,
        roleTagZh: '内置储弹',
        roleTagEn: 'Integral Magazine',
        descZh: `与机匣底部刚性一体的 ${cap} 发 ${cal} 内置弹仓，支持机匣顶部桥夹一键快速压弹。`,
        descEn: `Fixed ${cap}-round ${cal} internal box magazine built flush into the stock for rapid top stripper-clip loading.`,
      };
    }
    if (slot === 'follower') {
      return {
        nameZh: '铰接式托弹板与空仓止动面',
        nameEn: 'Hinged Follower & Bolt-Stop Shelf',
        calloutLabelZh: '铰接托弹板',
        calloutLabelEn: 'Integral Follower',
        roleTagZh: '托弹阻机',
        roleTagEn: 'Cartridge Lift',
        descZh: `托举弹列上行并在末发击发后上顶枪机头或空仓挂机杆，提示射手及时桥夹装填。`,
        descEn: `Lifts cartridges cleanly to feed height and blocks or locks the bolt open after the final round fires.`,
      };
    }
    if (slot === 'mag_spring') {
      return {
        nameZh: 'Z 形折叠钢板托弹主簧',
        nameEn: 'Z-Folded Flat-Leaf Magazine Spring',
        calloutLabelZh: 'Z形折叠托弹簧',
        calloutLabelEn: 'Z-Leaf Mag Spring',
        roleTagZh: '平顺举升',
        roleTagEn: 'Leaf Spring Lift',
        descZh: `高弹性折叠片簧提供近乎恒定的托弹举升力，适配固定弹仓狭小垂直空间。`,
        descEn: `Zig-zag leaf spring delivering uniform upward lift inside the low-profile internal magazine well.`,
      };
    }
    return {
      nameZh: '铰链式快泄弹仓底板',
      nameEn: 'Hinged Quick-Dump Floorplate',
      calloutLabelZh: '铰链弹仓底板',
      calloutLabelEn: 'Hinged Floorplate',
      roleTagZh: '快泄清膛',
      roleTagEn: 'Quick Unload',
      descZh: `拨动护圈前锁扣即可向下翻开底板，安全快速倾出弹仓内剩余实弹。`,
      descEn: `Pivots downward via a release catch to dump unfired ammunition safely without cycling the bolt.`,
    };
  }

  // Default box magazine (`curved`, `straight`, `pistol_grip`)
  const shapeZh =
    bp.cad.magStyle === 'curved'
      ? '弧形'
      : bp.cad.magStyle === 'pistol_grip'
        ? '握把内置双排'
        : '直列盒式';
  const shapeEn =
    bp.cad.magStyle === 'curved'
      ? 'Curved'
      : bp.cad.magStyle === 'pistol_grip'
        ? 'Grip Box'
        : 'Straight Box';

  if (slot === 'mag_body') {
    return {
      material:
        bp.cad.magStyle === 'pistol_grip' ? 'nitride_steel' : 'polymer_frame',
      nameZh: `${cap} 发 ${shapeZh}弹匣体`,
      nameEn: `${cap}-Rd ${shapeEn} Magazine Body`,
      calloutLabelZh: `${cap}发${shapeZh}弹匣`,
      calloutLabelEn: `${cap}-Rd ${shapeEn} Mag`,
      roleTagZh: '盒式储弹',
      roleTagEn: 'Magazine Housing',
      descZh: `适配 ${cal} 弹壳锥度的 ${cap} 发可拆弹匣壳体，顶部硬化供弹唇精确控制进弹仰角。`,
      descEn: `Detachable ${cap}-round magazine body contoured for ${cal} case taper with hardened feed lips setting entry angle.`,
    };
  }
  if (slot === 'follower') {
    return {
      nameZh: '防倾倒高可见度托弹板',
      nameEn: 'Anti-Tilt High-Vis Follower',
      calloutLabelZh: '防倾倒托弹板',
      calloutLabelEn: 'Anti-Tilt Follower',
      roleTagZh: '防倾进弹',
      roleTagEn: 'Cartridge Feed',
      descZh: `长导向裙边防止满载压弹倾卡，并在打空后触发空仓挂机释放杆。`,
      descEn: `Extended skirt geometry prevents nose-dive tilting and actuates the slide/bolt hold-open on empty.`,
    };
  }
  if (slot === 'mag_spring') {
    return {
      nameZh: '矩形高疲劳寿命托弹簧',
      nameEn: 'High-Cycle Magazine Spring',
      calloutLabelZh: '弹匣托弹簧',
      calloutLabelEn: 'Magazine Spring',
      roleTagZh: '持续推弹',
      roleTagEn: 'Feed Compression',
      descZh: `硅铬合金钢托弹弹簧在长期满载储存后仍保持稳定上推速率，跟上 ${bp.rateOfFireRpm} 发/分射速。`,
      descEn: `Chrome-silicon magazine spring sustaining upward feed velocity to keep pace with ${bp.rateOfFireRpm} RPM cycling.`,
    };
  }
  return {
    nameZh: '抗摔快拆弹匣底板',
    nameEn: 'Impact-Resistant Magazine Floorplate',
    calloutLabelZh: '弹匣快拆底板',
    calloutLabelEn: 'Mag Floorplate',
    roleTagZh: '承压封底',
    roleTagEn: 'Base Retention',
    descZh: `承受满载托弹簧预压力与换匣落地冲击，按压底销即可滑出清理弹匣内腔。`,
    descEn: `Absorbs spring preload and drop impacts while sliding off via a locking stud for field cleaning.`,
  };
}

function resolveMbtSlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isCarousel = bp.kinematicLaw === 'tank_carousel';
  const isWwii = bp.archetype === 'mbt_wwii';
  const isFrontEngine = bp.id === 'merkava4';
  const cal = bp.caliberLabel;
  const weightTonnes = Number((bp.emptyWeightKg / 1000).toFixed(1));

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: 'nitride_steel',
      nameZh: isWwii ? '铸造斜甲主炮塔壳体' : '复合装甲主炮塔壳体',
      nameEn: isWwii ? 'Cast Sloped Turret Shell' : 'Composite Armored Turret Shell',
      calloutLabelZh: isWwii ? '铸造炮塔壳' : '复合装甲炮塔',
      calloutLabelEn: isWwii ? 'Cast Turret Shell' : 'Composite Turret',
      roleTagZh: '主战炮塔',
      roleTagEn: 'Armored Turret',
      descZh: `${bp.nameZh}核心装甲炮塔舱室，集成主炮耳轴承力架、炮长火控通道与全方位复合防护。`,
      descEn: `Primary armored turret enclosure of the ${bp.nameEn}, housing the main gun trunnions, crew stations, and multi-layer protection.`,
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: `${bp.barrelLengthMm} mm 坦克主炮身管`,
      nameEn: `${bp.barrelLengthMm} mm Main Tank Cannon`,
      calloutLabelZh: '主炮高膛压身管',
      calloutLabelEn: 'Main Tank Cannon',
      roleTagZh: '动能主炮',
      roleTagEn: 'Main Armament',
      descZh: `自紧工艺高强炮钢身管，承受 ${bp.peakPressureMpa} MPa 峰压并将 ${cal} 加速至 ${bp.muzzleVelocityMs} m/s。`,
      descEn: `Autofrettaged ordnance-steel cannon enduring ${bp.peakPressureMpa} MPa peak pressure to accelerate ${cal} to ${bp.muzzleVelocityMs} m/s.`,
    },
    muzzle: resolveMuzzleText(bp),
    bolt_carrier: {
      material: 'stainless',
      nameZh: '主炮液压反后坐摇架总成',
      nameEn: 'Main Gun Recoil Cradle & Guard',
      calloutLabelZh: '反后坐摇架',
      calloutLabelEn: 'Gun Recoil Cradle',
      roleTagZh: '制退承力',
      roleTagEn: 'Recoil Absorption',
      descZh: `支撑并导向主炮发射时的后坐行程，将数万牛·秒巨额后坐冲量平稳卸入炮塔耳轴。`,
      descEn: `Guides cannon recoil travel during firing and transfers massive recoil impulse smoothly into the turret trunnions.`,
    },
    bolt: {
      material: 'stainless',
      nameZh: '半自动立楔/横楔式主炮炮闩',
      nameEn: 'Semi-Automatic Sliding-Wedge Breech',
      calloutLabelZh: '滑楔式炮闩',
      calloutLabelEn: 'Sliding-Wedge Breech',
      roleTagZh: '高压闭锁',
      roleTagEn: 'Breech Lockup',
      descZh: `闭锁 ${bp.peakPressureMpa} MPa 主炮膛压并在复进末段自动开闩抛出空弹筒底托。`,
      descEn: `Seals ${bp.peakPressureMpa} MPa cannon pressure and opens automatically at the end of counter-recoil to eject the stub case.`,
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: '液气式复进机储能弹簧组',
      nameEn: 'Hydro-Pneumatic Recuperator Spring',
      calloutLabelZh: '主炮复进储能簧',
      calloutLabelEn: 'Cannon Recuperator',
      roleTagZh: '复进复位',
      roleTagEn: 'Counter-Recoil',
      descZh: `吸收主炮后坐势能并在毫秒级制动后将数吨重炮管精确推回待发基准位。`,
      descEn: `Stores cannon recoil energy and returns the multi-ton barrel assembly smoothly to battery after firing.`,
    },
    handguard: {
      material: 'nitride_steel',
      nameZh: isWwii
        ? '大倾角首上均质钢装甲板'
        : isFrontEngine
          ? '前置动力舱复合防弹首上甲'
          : '首上复合与爆炸反应装甲阵',
      nameEn: isWwii
        ? 'Sloped Glacis RHA Armor Plate'
        : isFrontEngine
          ? 'Front-Engine Composite Glacis'
          : 'Composite & ERA Glacis Array',
      calloutLabelZh: isWwii ? '斜甲首上装甲' : '首上爆反/复合甲',
      calloutLabelEn: isWwii ? 'Sloped RHA Glacis' : 'Composite ERA Glacis',
      roleTagZh: '正面主防',
      roleTagEn: 'Frontal Protection',
      descZh: `坦克正面最高等效防护区域，利用倾斜角与复合夹层剪切并偏转穿甲弹长杆。`,
      descEn: `Primary frontal ballistic armor zone engineered to shear, erode, and deflect incoming kinetic penetrators.`,
    },
    stock: {
      material: 'nitride_steel',
      nameZh: '全焊接高强度装甲车体底盘',
      nameEn: 'Welded Armored Lower Hull Chassis',
      calloutLabelZh: '装甲车体底盘',
      calloutLabelEn: 'Armored Hull Chassis',
      roleTagZh: '承载车体',
      roleTagEn: 'Hull Structure',
      descZh: `承载炮塔座圈、动力传动舱、乘员舱与防雷车底结构的 ${weightTonnes} 吨级重型底盘。`,
      descEn: `Monocoque armored hull supporting the turret ring, powertrain, crew bay, and blast protection of the ${weightTonnes}-ton tank.`,
    },
    grip: {
      material: 'polymer_frame',
      nameZh: isFrontEngine ? '车尾步兵载员舱与防弹尾门' : '炮塔尾舱置物篮与防护栏',
      nameEn: isFrontEngine
        ? 'Rear Crew Bay & Armored Hatch'
        : 'Turret Bustle Rack & Slat Cage',
      calloutLabelZh: isFrontEngine ? '车尾装甲门' : '尾舱置物护篮',
      calloutLabelEn: isFrontEngine ? 'Rear Crew Hatch' : 'Turret Bustle Cage',
      roleTagZh: '外挂辅助',
      roleTagEn: 'Bustle & Access',
      descZh: isFrontEngine
        ? '梅卡瓦标志性车尾装甲通道门，支持弹药快速补给与战地急救后送。'
        : '炮塔后部储物格栅与格挡防弹护栏，平衡主炮前伸配重并收纳随车装具。',
      descEn: isFrontEngine
        ? 'Merkava’s signature armored rear corridor enabling rapid ammunition resupply and casualty evacuation under fire.'
        : 'Rear turret stowage basket and slat protection counterbalancing the long cannon overhang.',
    },
    optic: {
      material: 'nitride_steel',
      nameZh: isWwii ? '车长指挥塔潜望观察环' : '车长猎-歼周视热成像仪',
      nameEn: isWwii
        ? 'Commander Cupola Periscope Ring'
        : 'Commander Hunter-Killer CITV Thermal',
      calloutLabelZh: isWwii ? '指挥塔潜望镜' : '猎歼热成像观瞄',
      calloutLabelEn: isWwii ? 'Commander Cupola' : 'Hunter-Killer CITV',
      roleTagZh: '全域观瞄',
      roleTagEn: 'All-Weather Optics',
      descZh: isWwii
        ? '360° 环视装甲指挥塔潜望镜组，显著扩大车长战场态势感知视野。'
        : '独立稳定式 360° 热成像周视瞄具，支持车长发现并一键向炮长交接目标。',
      descEn: isWwii
        ? '360-degree armored cupola vision blocks granting the tank commander unobstructed battlefield awareness.'
        : 'Independently stabilized 360° thermal viewer allowing the commander to designate targets for the gunner.',
    },
    gas_system: {
      material: 'nitride_steel',
      nameZh: '负重轮、扭杆悬挂与履带行走系',
      nameEn: 'Roadwheels, Torsion Suspension & Tracks',
      calloutLabelZh: '履带与悬挂系',
      calloutLabelEn: 'Tracks & Suspension',
      roleTagZh: '越野机动',
      roleTagEn: 'Armored Mobility',
      descZh: `承载 ${weightTonnes} 吨全车重量并吸收高速越野冲击，维持行进间火炮双向稳定。`,
      descEn: `Distributes ${weightTonnes} tonnes across low ground pressure while damping cross-country shocks for stabilized fire.`,
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: isWwii ? '侧装甲钢裙与外挂副油箱' : '侧裙复合装甲与主动防护模块',
      nameEn: isWwii
        ? 'Side Hull Armor & Auxiliary Fuel Drums'
        : 'Composite Side Skirts & APS Array',
      calloutLabelZh: isWwii ? '侧甲与副油箱' : '侧裙装甲模块',
      calloutLabelEn: isWwii ? 'Hull Sides & Tanks' : 'Armor Side Skirts',
      roleTagZh: '侧翼防护',
      roleTagEn: 'Flank Armor',
      descZh: `保护车体侧翼与行走装置免受破甲弹聚能射流与侧向穿甲打击。`,
      descEn: `Shields lower hull flanks and suspension components from shaped-charge jets and flanking fire.`,
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: '炮长双向稳定火控操纵台',
      nameEn: 'Gunner Dual-Axis Stabilized Control',
      calloutLabelZh: '炮长火控台',
      calloutLabelEn: 'Gunner FCS Grip',
      roleTagZh: '火控解算',
      roleTagEn: 'Fire Control Input',
      descZh: `整合激光测距、弹道解算与主炮电击发按钮的炮长操纵手柄。`,
      descEn: `Integrates laser rangefinding, ballistic lead computation, and electric firing triggers for the gunner.`,
    },
    hammer: {
      material: 'copper_accent',
      nameZh: isWwii ? '机械/电发火主炮击针组件' : '主炮电击发高压底火触针',
      nameEn: isWwii
        ? 'Mechanical Cannon Firing Pin'
        : 'Electric Main-Gun Firing Contact',
      calloutLabelZh: '主炮电击发针',
      calloutLabelEn: 'Cannon Firing Pin',
      roleTagZh: '主炮击发',
      roleTagEn: 'Primer Ignition',
      descZh: `在炮闩完全闭锁联锁信号确认后瞬间引燃 ${cal} 主装药底火。`,
      descEn: `Ignites the ${cal} primer instantaneously once full breech lockup interlock is confirmed.`,
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: '炮闩闭锁与抽壳储能弹簧',
      nameEn: 'Breech Lock & Ejector Spring Pack',
      calloutLabelZh: '炮闩储能簧',
      calloutLabelEn: 'Breech Spring Pack',
      roleTagZh: '闭锁抽壳',
      roleTagEn: 'Breech Actuation',
      descZh: `驱动滑楔炮闩高速闭合上膛并弹出残余金属底托的高强螺旋簧组。`,
      descEn: `Drives rapid sliding-wedge closure on loading and briskly kicks spent base stubs clear.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: '弹种选择与主炮/并列机枪切换器',
      nameEn: 'Ammo-Type & Weapon Mode Selector',
      calloutLabelZh: '弹种火控切换',
      calloutLabelEn: 'FCS Mode Selector',
      roleTagZh: '火控模式',
      roleTagEn: 'Ballistic Select',
      descZh: `在穿甲弹（APFSDS）、破甲/高爆弹与 7.62mm 并列机枪弹道表之间毫秒切换。`,
      descEn: `Switches ballistic computer solutions between APFSDS, HE/HEAT rounds, and the coaxial machine gun.`,
    },
    mag_body: {
      material: 'nitride_steel',
      nameZh: isCarousel
        ? `${bp.magCapacity} 发底置转盘自动装弹机`
        : `${bp.magCapacity} 发装甲隔离主炮弹药架`,
      nameEn: isCarousel
        ? `${bp.magCapacity}-Rd Floor Carousel Autoloader`
        : `${bp.magCapacity}-Rd Armored Ammo Stowage Rack`,
      calloutLabelZh: isCarousel ? '转盘自动装弹机' : '隔离主炮弹药架',
      calloutLabelEn: isCarousel ? 'Carousel Autoloader' : 'Armored Ammo Rack',
      roleTagZh: isCarousel ? '自动装填' : '装甲储弹',
      roleTagEn: isCarousel ? 'Autoloader' : 'Ammo Stowage',
      descZh: isCarousel
        ? `位于炮塔吊篮底部的 ${bp.magCapacity} 发双层旋转供弹环，以每分钟 ${bp.rateOfFireRpm} 发节奏自动举升推弹。`
        : `为 ${bp.magCapacity} 发 ${cal} 主炮弹提供防二次殉爆装甲隔离防护与待发快取位。`,
      descEn: isCarousel
        ? `Floor-mounted ${bp.magCapacity}-round carousel indexing and lifting rounds automatically at up to ${bp.rateOfFireRpm} RPM.`
        : `Armored stowage compartment protecting ${bp.magCapacity} ready-use ${cal} rounds against sympathetic detonation.`,
    },
    follower: {
      material: 'follower_orange',
      nameZh: isCarousel ? '链式电动推弹机与举升臂' : '炮弹托弹滑架与装填导向槽',
      nameEn: isCarousel
        ? 'Electromechanical Hoist & Chain Rammer'
        : 'Manual Loading Tray & Breech Guide',
      calloutLabelZh: isCarousel ? '举升推弹机' : '装填导槽托架',
      calloutLabelEn: isCarousel ? 'Hoist & Rammer' : 'Breech Loading Tray',
      roleTagZh: '推弹入膛',
      roleTagEn: 'Round Ramming',
      descZh: isCarousel
        ? '将转盘内的穿甲弹芯与发射药筒精准举升至主炮轴线并由链式推弹机送入炮膛。'
        : '引导装填手将沉重主炮弹快速平滑推入滑楔炮闩并触发自动闭闩。',
      descEn: isCarousel
        ? 'Lifts projectile and propellant charge to bore height and rams them cleanly into the breech.'
        : 'Guides heavy main-gun ammunition smoothly into the open breech to trip automatic wedge closure.',
    },
    mag_spring: {
      material: 'spring_steel',
      nameZh: '供弹防震限位缓冲弹簧组',
      nameEn: 'Ammo Stowage Shock-Damper Springs',
      calloutLabelZh: '弹架防震缓冲簧',
      calloutLabelEn: 'Stowage Damper Spring',
      roleTagZh: '防震稳弹',
      roleTagEn: 'Ammo Stabilization',
      descZh: `在高速越野与炮击震动下牢牢夹持主炮弹体并辅助弹托复位。`,
      descEn: `Cushions stowed cannon ammunition against cross-country jolts and blast shock.`,
    },
    mag_base: {
      material: 'nitride_steel',
      nameZh: isFrontEngine ? '前置 1,500 马力 V12 柴油动力包' : '后置大功率 V12 坦克动力包',
      nameEn: isFrontEngine
        ? 'Front-Mounted V12 Diesel Powerpack'
        : 'Rear V12 Armored Powerpack Deck',
      calloutLabelZh: 'V12 坦克动力包',
      calloutLabelEn: 'V12 Tank Powerpack',
      roleTagZh: '核心动力',
      roleTagEn: 'Tank Propulsion',
      descZh: isFrontEngine
        ? '前置布置的 V12 涡轮增压柴油动力舱兼作保护车组乘员的额外厚重装甲屏障。'
        : '驱动数十吨重装甲车体高速机动的整体吊装式 V12 柴油发动机与液力传动舱。',
      descEn: isFrontEngine
        ? 'Forward-mounted V12 turbodiesel powerpack doubling as extra ballistic protection ahead of the crew.'
        : 'Modular V12 diesel powerpack and transmission driving the heavy armored hull across rough terrain.',
    },
  };

  return makeMeta(slot, map[slot]);
}

function resolveOrdnanceSlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isRotary = bp.archetype === 'rotary_cannon';
  const isAa = bp.archetype === 'aa_autocannon';
  const cal = bp.caliberLabel;

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '360° 正弦凸轮机匣壳体'
        : isAa
          ? '40mm 重型防空炮箱机匣'
          : '155mm 钛合金炮尾摇架总成',
      nameEn: isRotary
        ? '360° Helical Cam Rotor Housing'
        : isAa
          ? '40mm Autocannon Breech Casing'
          : '155mm Titanium Cradle & Breech Ring',
      calloutLabelZh: isRotary
        ? '螺旋凸轮机匣'
        : isAa
          ? '防空炮箱机匣'
          : '钛合金炮尾摇架',
      calloutLabelEn: isRotary
        ? 'Helical Cam Housing'
        : isAa
          ? 'Autocannon Casing'
          : 'Titanium Gun Cradle',
      roleTagZh: '主承力壳',
      roleTagEn: 'Ordnance Housing',
      descZh: isRotary
        ? '内壁精铣 360° 闭合正弦凸轮槽，同步驱动六组旋转枪机完成推弹、闭锁、击发与退壳。'
        : isAa
          ? '承载 40mm 炮管短后坐滑轨与顶装供弹箱的高刚度防空火炮机匣。'
          : '采用钛合金轻量化铸造的主承载摇架，将 155mm 重型榴弹炮战斗全重压至仅 4.2 吨。',
      descEn: isRotary
        ? 'Machined with a continuous 360° sinusoidal cam track cycling all six rotating bolts synchronously.'
        : isAa
          ? 'Rigid steel ordnance casing guiding 40mm barrel recoil rails and top-clip feeding.'
          : 'Lightweight titanium-alloy cradle anchoring the 155mm tube while holding total howitzer mass to 4.2 tonnes.',
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: isRotary
        ? '6 管 20mm 旋转炮管簇'
        : isAa
          ? '40mm L/60 高初速快换炮管'
          : '155mm 39 倍径线膛榴弹炮身管',
      nameEn: isRotary
        ? '6-Barrel 20mm Rotary Cluster'
        : isAa
          ? '40mm L/60 High-Velocity Barrel'
          : '155mm L/39 Rifled Howitzer Tube',
      calloutLabelZh: isRotary
        ? '6管旋转炮管簇'
        : isAa
          ? '40mm L/60 炮管'
          : '155mm L/39 炮管',
      calloutLabelEn: isRotary
        ? '6-Barrel Rotary Cluster'
        : isAa
          ? '40mm L/60 Barrel'
          : '155mm L/39 Tube',
      roleTagZh: '重型身管',
      roleTagEn: 'Heavy Ordnance Bore',
      descZh: `全长 ${bp.barrelLengthMm} mm 重型线膛炮管，将 ${cal} 加速至 ${bp.muzzleVelocityMs} m/s。`,
      descEn: `${bp.barrelLengthMm} mm heavy rifled ordnance barrel accelerating ${cal} projectiles to ${bp.muzzleVelocityMs} m/s.`,
    },
    muzzle: resolveMuzzleText(bp),
    bolt_carrier: {
      material: 'stainless',
      nameZh: isRotary
        ? '6 槽高速旋转转子主轴'
        : isAa
          ? '短后坐管退滑块与摇臂'
          : '双缸液气式反后坐驻退机',
      nameEn: isRotary
        ? '6-Track Rotary Rotor Spindle'
        : isAa
          ? 'Short-Recoil Barrel Slide & Crank'
          : 'Twin Hydro-Pneumatic Recoil Brakes',
      calloutLabelZh: isRotary
        ? '6槽旋转转子'
        : isAa
          ? '管退滑块摇臂'
          : '液气反后坐驻退机',
      calloutLabelEn: isRotary
        ? '6-Track Main Rotor'
        : isAa
          ? 'Recoil Slide Crank'
          : 'Hydro Recoil Brakes',
      roleTagZh: '循环驱动',
      roleTagEn: 'Cycle Drive',
      descZh: isRotary
        ? '高速自旋核心转子，带动六根炮管与六套枪机以每分钟 6,000 发节奏同步循环。'
        : isAa
          ? '利用 40mm 炮弹发射后坐能量驱动曲柄开闩、抛壳并压缩复进簧。'
          : '对称液气驻退系统平稳耗散 155mm 远射巨额后坐能量，防止轻量化大架跳离地面。',
      descEn: isRotary
        ? 'Central high-speed rotor synchronizing all six barrels and bolts up to 6,000 RPM.'
        : isAa
          ? 'Harnesses 40mm barrel recoil to crank open the breech, eject brass, and cock the mechanism.'
          : 'Twin hydro-pneumatic cylinders dissipate extreme 155mm recoil energy smoothly into the lightweight trails.',
    },
    bolt: {
      material: 'stainless',
      nameZh: isRotary
        ? '6 套凸轮滚轮回转闭锁枪机'
        : isAa
          ? '立楔式垂直升降闭锁炮闩'
          : '间断螺纹式旋开主炮炮闩',
      nameEn: isRotary
        ? '6-Bolt Cam-Roller Locking Set'
        : isAa
          ? 'Vertical Sliding-Wedge Breechblock'
          : 'Interrupted-Screw Swinging Breech',
      calloutLabelZh: isRotary
        ? '6套滚轮枪机'
        : isAa
          ? '立楔式炮闩'
          : '间断螺纹炮闩',
      calloutLabelEn: isRotary
        ? 'Rotary Cam Bolts'
        : isAa
          ? 'Vertical Wedge Breech'
          : 'Interrupted-Screw Breech',
      roleTagZh: '重炮闭锁',
      roleTagEn: 'Ordnance Lockup',
      descZh: `承受 ${bp.peakPressureMpa} MPa 重型膛压并实现快速可靠开闭锁与退壳。`,
      descEn: `Locks safely against ${bp.peakPressureMpa} MPa ordnance chamber pressure while cycling smoothly.`,
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: isRotary ? '转子轴向缓冲与供弹预紧簧' : '重型套筒式复进储能弹簧',
      nameEn: isRotary
        ? 'Rotor Thrust & Clearing Spring Pack'
        : 'Heavy Concentric Recuperator Spring',
      calloutLabelZh: isRotary ? '转子缓冲簧' : '主炮复进储能簧',
      calloutLabelEn: isRotary ? 'Rotor Buffer Spring' : 'Recuperator Spring',
      roleTagZh: '复进储能',
      roleTagEn: 'Return Energy',
      descZh: `在每次高能量发射循环后提供稳定复位势能，确保连续作战节奏。`,
      descEn: `Delivers consistent return force after each high-energy ordnance cycle.`,
    },
    handguard: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '炮管中段支撑盘与隔热罩'
        : isAa
          ? '双侧装甲防盾与身管护套'
          : '前稳定脚与液压耳轴防盾',
      nameEn: isRotary
        ? 'Mid-Barrel Support Clamp & Shroud'
        : isAa
          ? 'Splinter Shield & Barrel Jacket'
          : 'Forward Stabilizer Legs & Cradle',
      calloutLabelZh: isRotary
        ? '炮管支撑盘'
        : isAa
          ? '防空炮防盾'
          : '前稳定支撑脚',
      calloutLabelEn: isRotary
        ? 'Mid-Barrel Clamp'
        : isAa
          ? 'Armor Splinter Shield'
          : 'Forward Stabilizers',
      roleTagZh: '支撑防护',
      roleTagEn: 'Structural Brace',
      descZh: `为高载荷长身管提供抗弯刚度与乘员防护屏障。`,
      descEn: `Braces the long heavy ordnance barrel against whip while protecting operating crews.`,
    },
    stock: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '航空机腹刚性安装减振支架'
        : isAa
          ? '360° 舰载/野战十字底盘炮座'
          : '钛合金分叉大架与驻锄组件',
      nameEn: isRotary
        ? 'Airframe Rigid Mount & Recoil Adapter'
        : isAa
          ? '360° Pedestal & Cruciform Carriage'
          : 'Titanium Split-Trail & Ground Spades',
      calloutLabelZh: isRotary
        ? '航炮安装支架'
        : isAa
          ? '360° 防空炮座'
          : '钛合金分叉大架',
      calloutLabelEn: isRotary
        ? 'Airframe Mount Frame'
        : isAa
          ? '360° AA Pedestal'
          : 'Titanium Split Trails',
      roleTagZh: '底座承载',
      roleTagEn: 'Carriage Mount',
      descZh: `将重型火炮稳固锚定于战机机身、舰艇甲板或地面阵地，承载全部后坐反力。`,
      descEn: `Anchors the heavy weapon firmly to aircraft bulkheads, naval decks, or earth spades under firing load.`,
    },
    grip: {
      material: 'polymer_frame',
      nameZh: isRotary
        ? '外置液压马达与减速齿轮箱'
        : isAa
          ? '高低/方向双速手轮操纵组'
          : '炮手牵引锁与手动高低机手轮',
      nameEn: isRotary
        ? 'Hydraulic Drive Motor & Gearbox'
        : isAa
          ? 'Elevation & Traverse Handwheels'
          : 'Elevation Handwheel & Tow Lunette',
      calloutLabelZh: isRotary
        ? '液压驱动马达'
        : isAa
          ? '高低方向手轮'
          : '高低机与牵引架',
      calloutLabelEn: isRotary
        ? 'Hydraulic Drive Motor'
        : isAa
          ? 'Aiming Handwheels'
          : 'Elevation & Tow Rig',
      roleTagZh: '动力操控',
      roleTagEn: 'Drive & Aiming',
      descZh: isRotary
        ? '外部液压马达在 0.4 秒内将六管转子加速至每分钟 6,000 发满速，哑弹直接自动排出不停机。'
        : '赋予炮班精准俯仰与方向跟踪操控能力，在无电力支援下仍可手动应战。',
      descEn: isRotary
        ? 'External hydraulic motor spins the six-barrel rotor to 6,000 RPM in 0.4 s, clearing misfires automatically.'
        : 'Provides smooth mechanical elevation and traverse aiming with full manual backup.',
    },
    optic: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '机载雷达火控联动接口'
        : isAa
          ? '防空提前量环形机械瞄准镜'
          : '数字激光惯导火控瞄具（DFCS）',
      nameEn: isRotary
        ? 'Airborne Radar FCS Interface'
        : isAa
          ? 'Ring-Lead Anti-Aircraft Sight'
          : 'Digital Fire-Control Sight (DFCS)',
      calloutLabelZh: isRotary
        ? '雷达火控接口'
        : isAa
          ? '防空提前量镜'
          : '数字惯导火控镜',
      calloutLabelEn: isRotary
        ? 'Radar FCS Interface'
        : isAa
          ? 'AA Lead Ring Sight'
          : 'Digital FCS Optic',
      roleTagZh: '火控瞄准',
      roleTagEn: 'Fire Control Sight',
      descZh: `实时解算空中高速目标提前量或 30 公里级间接火力射击诸元。`,
      descEn: `Computes lead angles for fast aerial targets or precision indirect-fire ballistic solutions.`,
    },
    gas_system: {
      material: 'stainless',
      nameZh: isRotary
        ? '气动清膛与液压冷却管路'
        : isAa
          ? '液压高低平衡机与缓冲筒'
          : '氮气平衡机与全液压高低俯仰缸',
      nameEn: isRotary
        ? 'Hydraulic Manifold & Clearing Drive'
        : isAa
          ? 'Elevation Equilibrator & Buffer'
          : 'Nitrogen Equilibrator & Elev Cylinders',
      calloutLabelZh: isRotary
        ? '液压驱动管路'
        : isAa
          ? '高低平衡缓冲筒'
          : '氮气高低平衡机',
      calloutLabelEn: isRotary
        ? 'Hydraulic Manifold'
        : isAa
          ? 'Recoil Equilibrator'
          : 'Nitrogen Equilibrator',
      roleTagZh: '流体平衡',
      roleTagEn: 'Fluid Balancing',
      descZh: `平衡重型炮管偏心重力矩并调节高强度连发下的机械运动阻尼。`,
      descEn: `Counterbalances heavy barrel overhang torque and damps high-rate firing motion.`,
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '双向无链供弹柔性导槽支架'
        : isAa
          ? '防空炮座俯仰扇形齿弧'
          : '炮架液压调平支腿与测速雷达座',
      nameEn: isRotary
        ? 'Linkless Chute Bracing Frame'
        : isAa
          ? 'Elevation Geared Sector Arc'
          : 'Leveling Jacks & Muzzle Radar Mount',
      calloutLabelZh: isRotary
        ? '供弹导槽支架'
        : isAa
          ? '俯仰扇形齿弧'
          : '测速雷达/支腿',
      calloutLabelEn: isRotary
        ? 'Feed Chute Frame'
        : isAa
          ? 'Elevation Gear Arc'
          : 'Radar & Level Jacks',
      roleTagZh: '精密俯仰',
      roleTagEn: 'Gear & Telemetry',
      descZh: `提供精密仰角分度与外挂测速/供弹刚性支撑。`,
      descEn: `Delivers precise elevation indexing and rigid structural mounting for telemetry or feed chutes.`,
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '28V 电控击发继电器总成'
        : isAa
          ? '炮手脚踏连发击发踏板'
          : '手动拉火绳与电气双模击发器',
      nameEn: isRotary
        ? '28V Electric Solenoid Trigger Unit'
        : isAa
          ? 'Foot-Operated Firing Pedal Linkage'
          : 'Lanyard & Electric Firing Mechanism',
      calloutLabelZh: isRotary
        ? '电控击发继电器'
        : isAa
          ? '脚踏击发连杆'
          : '拉火绳击发器',
      calloutLabelEn: isRotary
        ? 'Electric Firing Relay'
        : isAa
          ? 'Firing Foot Pedal'
          : 'Lanyard Firing Unit',
      roleTagZh: '击发控制',
      roleTagEn: 'Firing Control',
      descZh: `将飞行员手柄或炮手击发指令毫秒级传导至重炮底火点火机构。`,
      descEn: `Transmits pilot stick or gunner firing commands cleanly into the ordnance ignition system.`,
    },
    hammer: {
      material: 'copper_accent',
      nameZh: isRotary
        ? '28V 电击发底火滑环触点'
        : isAa
          ? '大质量惯性撞针击发总成'
          : '底火拉火撞击/电发火头',
      nameEn: isRotary
        ? '28V Electric Primer Contact Ring'
        : isAa
          ? 'Heavy Inertia Percussion Striker'
          : 'Percussion & Primer Ignition Head',
      calloutLabelZh: isRotary
        ? '电击发滑环触点'
        : isAa
          ? '惯性击发撞针'
          : '炮闩击发底火头',
      calloutLabelEn: isRotary
        ? 'Electric Primer Ring'
        : isAa
          ? 'Inertia Firing Pin'
          : 'Primer Ignition Head',
      roleTagZh: '底火引燃',
      roleTagEn: 'Primer Ignition',
      descZh: `仅在炮闩到达12点全闭锁工位时接通高压点火，杜绝未闭锁早爆风险。`,
      descEn: `Energizes or strikes the primer exclusively at full top-dead-center breech lockup.`,
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: '重炮击发储能主簧与安全联锁簧',
      nameEn: 'Ordnance Striker & Interlock Spring',
      calloutLabelZh: '击发联锁主簧',
      calloutLabelEn: 'Striker Interlock Spring',
      roleTagZh: '击发储能',
      roleTagEn: 'Ignition Energy',
      descZh: `保障底火高能可靠击发并在未闭锁状态机械锁死击针行程。`,
      descEn: `Ensures positive primer ignition while mechanically blocking premature out-of-battery firing.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: isRotary
        ? '4,000 / 6,000 RPM 双射速切换阀'
        : isAa
          ? '单发 / 连发防空射击切换柄'
          : '保险 / 击发安全联锁拨杆',
      nameEn: isRotary
        ? '4,000 / 6,000 RPM Rate Selector'
        : isAa
          ? 'Single / Automatic Fire Selector'
          : 'Breech Safety Interlock Lever',
      calloutLabelZh: isRotary
        ? '双射速切换阀'
        : isAa
          ? '单/连发切换柄'
          : '炮闩安全联锁杆',
      calloutLabelEn: isRotary
        ? 'RPM Rate Selector'
        : isAa
          ? 'Fire Mode Selector'
          : 'Breech Safety Lever',
      roleTagZh: '射速安全',
      roleTagEn: 'Cadence & Safety',
      descZh: `控制重型火炮射击节拍与待发安全机械互锁状态。`,
      descEn: `Regulates firing cadence and enforces mechanical safety interlocks prior to ignition.`,
    },
    mag_body: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? `${bp.magCapacity} 发闭环无链螺旋弹鼓`
        : isAa
          ? '顶部 4 发桥夹连续重力供弹斗'
          : '155mm 分装发射药与待发弹托架',
      nameEn: isRotary
        ? `${bp.magCapacity}-Rd Linkless Closed-Loop Drum`
        : isAa
          ? 'Top 4-Round Clip Gravity Hopper'
          : '155mm Separate-Loading Tray',
      calloutLabelZh: isRotary
        ? '闭环无链弹鼓'
        : isAa
          ? '4发顶装供弹斗'
          : '155mm 分装弹托',
      calloutLabelEn: isRotary
        ? 'Linkless Helical Drum'
        : isAa
          ? '4-Rd Top Clip Hopper'
          : '155mm Loading Tray',
      roleTagZh: '重弹供输',
      roleTagEn: 'Ordnance Feed',
      descZh: isRotary
        ? `无链闭环存储 ${bp.magCapacity} 发 20mm 炮弹并同步回收空壳，防止高机动空战抛壳伤机。`
        : isAa
          ? '装填手可不断向顶部重力漏斗插入 4 发桥夹，维持 120 发/分不间断防空弹幕。'
          : '承托 43 kg 级 155mm 榴弹与模块化药包对齐炮尾，实现快速人工或半自动装填。',
      descEn: isRotary
        ? `Stores ${bp.magCapacity} rounds of 20mm linklessly while returning spent brass to preserve aircraft center of gravity.`
        : isAa
          ? 'Allows loaders to drop 4-round clips continuously into the gravity hopper for uninterrupted 120 RPM fire.'
          : 'Aligns 43 kg 155mm projectiles and modular propelling charges cleanly with the open screw breech.',
    },
    follower: {
      material: 'follower_orange',
      nameZh: isRotary
        ? '星轮同步输弹拨轮（Delinker）'
        : isAa
          ? '双侧棘爪自动压弹送弹器'
          : '重型推弹杆与炮膛定心导轨',
      nameEn: isRotary
        ? 'Synchronized Sprocket Feed Wheel'
        : isAa
          ? 'Automatic Clip-Indexing Rammer'
          : 'Heavy Rammer & Breech Tray',
      calloutLabelZh: isRotary
        ? '星轮同步输弹器'
        : isAa
          ? '自动压弹送弹器'
          : '重炮推弹导轨',
      calloutLabelEn: isRotary
        ? 'Feed Sprocket Wheel'
        : isAa
          ? 'Clip Indexing Rammer'
          : 'Breech Rammer Tray',
      roleTagZh: '同步输弹',
      roleTagEn: 'Synchronized Feed',
      descZh: `精确步进推送重型炮弹入膛，防止高速循环错位卡弹。`,
      descEn: `Indexes heavy ordnance ammunition cleanly into the breech without timing misalignment.`,
    },
    mag_spring: {
      material: 'spring_steel',
      nameZh: '供弹张紧与阻弹缓冲主簧',
      nameEn: 'Feed Tension & Retention Spring',
      calloutLabelZh: '供弹张紧缓冲簧',
      calloutLabelEn: 'Feed Tension Spring',
      roleTagZh: '张紧限位',
      roleTagEn: 'Feed Retention',
      descZh: `在剧烈发射震动下保持炮弹定位与供弹棘爪可靠复位。`,
      descEn: `Keeps ordnance rounds positively seated and feed pawls reset under heavy firing shock.`,
    },
    mag_base: {
      material: 'nitride_steel',
      nameZh: isRotary
        ? '双通道空壳回流导槽底盘'
        : isAa
          ? '40mm 空弹壳下抛导流槽'
          : '重炮底火装填仓与尾座托板',
      nameEn: isRotary
        ? 'Spent-Case Return Chute Base'
        : isAa
          ? '40mm Brass Ejection Chute'
          : 'Primer Magazine & Trail Baseplate',
      calloutLabelZh: isRotary
        ? '空壳回流导槽'
        : isAa
          ? '空壳下抛导槽'
          : '底火仓/尾座板',
      calloutLabelEn: isRotary
        ? 'Case Return Chute'
        : isAa
          ? 'Brass Eject Chute'
          : 'Primer Mag & Plate',
      roleTagZh: '退壳收底',
      roleTagEn: 'Ejection & Base',
      descZh: `安全导出或回收击发后的重型黄铜弹壳并支撑供弹基座。`,
      descEn: `Routes or recovers fired ordnance cases safely while reinforcing the feed assembly base.`,
    },
  };

  return makeMeta(slot, map[slot]);
}

function resolveArcherySlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isCrossbow = bp.archetype === 'crossbow_recurve';
  const isLongbow = bp.archetype === 'bow_longbow';

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: isLongbow ? 'polymer_frame' : 'nitride_steel',
      nameZh: isLongbow
        ? '单体欧洲紫杉弓身主梁'
        : isCrossbow
          ? 'CNC 阳极氧化铝合金箭道机匣'
          : '中空双管碳纤维桁架弓把',
      nameEn: isLongbow
        ? 'Monolithic Self-Yew Stave Riser'
        : isCrossbow
          ? 'CNC Anodized Aluminum Flight Rail'
          : 'Hollow Carbon-Tube Truss Riser',
      calloutLabelZh: isLongbow
        ? '紫杉单体弓身'
        : isCrossbow
          ? 'CNC 铝合金箭道'
          : '碳纤桁架弓把',
      calloutLabelEn: isLongbow
        ? 'Self-Yew Bow Stave'
        : isCrossbow
          ? 'CNC Flight Rail'
          : 'Carbon Truss Riser',
      roleTagZh: '核心骨架',
      roleTagEn: 'Primary Chassis',
      descZh: isLongbow
        ? '整根欧洲紫杉木剖制，背侧抗拉边材与腹侧抗压心材天然构成自然界最强复合梁。'
        : isCrossbow
          ? '高精度铣削铝合金导向箭道，保证 400 gr 弩箭在 122 m/s 加速瞬间零偏摆。'
          : '50 束高模量单向碳纤维手工铺层制成的中空桁架弓把，以极轻质量抵抗满弓扭转。',
      descEn: isLongbow
        ? 'Carved from a single European yew stave combining tension-strong sapwood back and compression-strong heartwood belly.'
        : isCrossbow
          ? 'CNC-machined anodized flight rail guiding 400-grain bolts cleanly at 122 m/s launch velocity.'
          : 'Hand-laid hollow dual-tube carbon truss riser resisting torsional twist at full draw while weighing under 2 kg.',
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: isLongbow
        ? '重型破甲白蜡木战箭（Bodkin）'
        : isCrossbow
          ? '18 英寸 400 gr 碳纤维弩箭'
          : '400 gr 高刚度碳纤维猎箭',
      nameEn: isLongbow
        ? 'Heavy Bodkin Ash War Arrow'
        : isCrossbow
          ? '18" 400 gr Carbon Crossbow Bolt'
          : '400 gr Spine-Matched Carbon Arrow',
      calloutLabelZh: isLongbow
        ? '破甲白蜡战箭'
        : isCrossbow
          ? '碳纤维重弩箭'
          : '碳纤维猎箭',
      calloutLabelEn: isLongbow
        ? 'Bodkin War Arrow'
        : isCrossbow
          ? 'Carbon Crossbow Bolt'
          : 'Carbon Hunting Arrow',
      roleTagZh: '发射箭矢',
      roleTagEn: 'Projectile Shaft',
      descZh: `以 ${bp.muzzleVelocityMs} m/s 离弦速度飞出，凭借三片螺旋羽片产生气动自旋稳定。`,
      descEn: `Launches at ${bp.muzzleVelocityMs} m/s with helical fletching inducing aerodynamic spin stabilization.`,
    },
    muzzle: {
      material: 'copper_accent',
      nameZh: isLongbow
        ? '锻钢四棱破甲箭头与牛角弦槽'
        : isCrossbow
          ? '橡胶减震止弦器与脚蹬脚踏环'
          : '跌落式精密箭台与微调箭座',
      nameEn: isLongbow
        ? 'Forged Bodkin Point & Horn Nocks'
        : isCrossbow
          ? 'Foot Stirrup & String Suppressors'
          : 'Drop-Away Arrow Launcher Rest',
      calloutLabelZh: isLongbow
        ? '破甲箭头/角梢'
        : isCrossbow
          ? '脚踏环/止弦器'
          : '跌落式箭台',
      calloutLabelEn: isLongbow
        ? 'Bodkin & Horn Nocks'
        : isCrossbow
          ? 'Stirrup & Dampers'
          : 'Drop-Away Rest',
      roleTagZh: '箭尖/止弦',
      roleTagEn: 'Tip & Guidance',
      descZh: isLongbow
        ? '加固牛角弓梢防止 150 lbf 亚麻弓弦切入紫杉木纤维，配四棱钢质破甲箭头。'
        : isCrossbow
          ? '前端高强脚踏环便于上弦稳定，双橡胶止弦垫在撒放瞬间吸收弓弦余震噪音。'
          : '箭矢离弦毫秒内自动下沉避让尾羽，消除传统箭台摩擦擦羽误差。',
      descEn: isLongbow
        ? 'Reinforced horn tip nocks resist 150 lbf string shear while the forged bodkin point penetrates armor.'
        : isCrossbow
          ? 'Front foot stirrup anchors cocking while twin rubber suppressors deaden string slap upon release.'
          : 'Drops clear milliseconds after launch so helical vanes pass with zero contact interference.',
    },
    bolt_carrier: {
      material: 'stainless',
      nameZh: isLongbow
        ? '紫杉上/下弹性储能弓臂'
        : isCrossbow
          ? '高张力纯反曲复合玻纤弩片'
          : '分体式高储能复合材料弓片',
      nameEn: isLongbow
        ? 'Upper & Lower Yew Flexing Limbs'
        : isCrossbow
          ? 'High-Modulus Recurve Fiberglass Limbs'
          : 'Split High-Modulus Composite Limbs',
      calloutLabelZh: isLongbow
        ? '紫杉储能弓臂'
        : isCrossbow
          ? '反曲储能弩片'
          : '分体储能弓片',
      calloutLabelEn: isLongbow
        ? 'Yew Bending Limbs'
        : isCrossbow
          ? 'Recurve Power Limbs'
          : 'Split Composite Limbs',
      roleTagZh: '弹性储能',
      roleTagEn: 'Elastic Storage',
      descZh: `在满弓拉距 ${bp.barrelLengthMm} mm 时储存全部弯曲应变能，撒放瞬间高效转化为箭矢动能。`,
      descEn: `Stores peak bending strain energy across the ${bp.barrelLengthMm} mm draw stroke and releases it cleanly into the arrow.`,
    },
    bolt: {
      material: 'copper_accent',
      nameZh: isLongbow
        ? '手工搓制亚麻纤维主弓弦'
        : isCrossbow
          ? '高强编织反曲主弩弦'
          : 'HBX 双偏心同步凸轮轮组',
      nameEn: isLongbow
        ? 'Hand-Twisted Waxed Linen Bowstring'
        : isCrossbow
          ? 'High-Tension Braided Crossbow String'
          : 'HBX Synchronized Binary Cam Set',
      calloutLabelZh: isLongbow
        ? '亚麻主弓弦'
        : isCrossbow
          ? '高强反曲弩弦'
          : '双偏心同步凸轮',
      calloutLabelEn: isLongbow
        ? 'Waxed Linen String'
        : isCrossbow
          ? 'Recurve Bowstring'
          : 'Binary Eccentric Cams',
      roleTagZh: isLongbow || isCrossbow ? '传力弓弦' : '省力凸轮',
      roleTagEn: isLongbow || isCrossbow ? 'Drive String' : 'Let-Off Cams',
      descZh: isLongbow || isCrossbow
        ? '低延展高强纤维主弦将双侧弓臂弹性势能无损聚焦于箭尾凹槽。'
        : '通过变力臂偏心轨迹在满弓谷底实现 80% 省力比，让射手从容稳瞄。',
      descEn: isLongbow || isCrossbow
        ? 'Low-creep braided string transferring symmetric limb force directly into the arrow nock.'
        : 'Variable-leverage eccentric cams deliver 80% full-draw let-off for steady aiming.',
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: isLongbow
        ? '弓臂弹性回弹力线与护弦缠线'
        : isCrossbow
          ? '反曲弩片抗振耦合储能簧'
          : '预拉伸 WireWRX 主弦与同步副缆',
      nameEn: isLongbow
        ? 'Center Serving & Stave Flex Axis'
        : isCrossbow
          ? 'Limb Damping & String Tension Axis'
          : 'Pre-Stretched Bowstring & Yoke Cables',
      calloutLabelZh: isLongbow
        ? '护弦中心缠线'
        : isCrossbow
          ? '弩片张紧耦合系'
          : '主弓弦与同步缆',
      calloutLabelEn: isLongbow
        ? 'String Center Serving'
        : isCrossbow
          ? 'Limb Tension Axis'
          : 'Bowstring & Cables',
      roleTagZh: '动载传力',
      roleTagEn: 'Dynamic Tension',
      descZh: `随拉弓与撒放实时弹性形变，精确同步上下弓臂回弹相位。`,
      descEn: `Flexes dynamically through draw and release to keep upper and lower limb recovery synchronized.`,
    },
    handguard: {
      material: 'polymer_frame',
      nameZh: isLongbow
        ? '弓腹箭道耐磨牛角嵌片'
        : isCrossbow
          ? '防夹手护指前托（Finger Guard）'
          : '减震弓片插槽（Limb Pockets）',
      nameEn: isLongbow
        ? 'Inlaid Horn Arrow Pass Plate'
        : isCrossbow
          ? 'Forend Wing & Finger Safety Guard'
          : 'Zero-Tolerance Pivoting Limb Pockets',
      calloutLabelZh: isLongbow
        ? '牛角过箭嵌片'
        : isCrossbow
          ? '护指防夹前托'
          : '高精度弓片插槽',
      calloutLabelEn: isLongbow
        ? 'Horn Arrow Pass'
        : isCrossbow
          ? 'Finger Safety Forend'
          : 'Pivoting Limb Pockets',
      roleTagZh: '导向防护',
      roleTagEn: 'Guard & Alignment',
      descZh: `精准约束弓臂根部对中或保护前手免受高速回弹弓弦擦伤。`,
      descEn: `Maintains zero-play limb alignment or shields the support hand cleanly below the string path.`,
    },
    stock: {
      material: 'polymer_frame',
      nameZh: isLongbow
        ? '紫杉下弓臂与握把过渡锥段'
        : isCrossbow
          ? 'Tru-Fit 可调贴腮与伸缩后托'
          : '低重心碳纤减震平衡杆',
      nameEn: isLongbow
        ? 'Lower Yew Stave & Belly Taper'
        : isCrossbow
          ? 'Adjustable Buttstock & Cheekpiece'
          : 'Low-CG Carbon Vibration Stabilizer',
      calloutLabelZh: isLongbow
        ? '下弓臂过渡段'
        : isCrossbow
          ? '可调伸缩后托'
          : '碳纤减震平衡杆',
      calloutLabelEn: isLongbow
        ? 'Lower Stave Taper'
        : isCrossbow
          ? 'Adjustable Stock'
          : 'Carbon Stabilizer',
      roleTagZh: '平衡减震',
      roleTagEn: 'Balance & Damping',
      descZh: `优化全弓转动惯量与握持重心，抑制撒放瞬间余震与前倾。`,
      descEn: `Optimizes rotational inertia and center of gravity to damp post-shot vibration.`,
    },
    grip: {
      material: 'polymer_frame',
      nameZh: isLongbow
        ? '手工缠绕植鞣皮革防滑弓握'
        : '人体工学防扭转防滑握把',
      nameEn: isLongbow
        ? 'Hand-Wrapped Leather Stave Grip'
        : 'Low-Torque Ergonomic Riser Grip',
      calloutLabelZh: isLongbow ? '植鞣皮革弓握' : '防扭转握把',
      calloutLabelEn: isLongbow ? 'Leather Stave Grip' : 'Low-Torque Grip',
      roleTagZh: '零扭握持',
      roleTagEn: 'Torque-Free Grip',
      descZh: `将推弓反作用力精准导过弓把中心平面，防止手腕侧扭导致箭道偏飞。`,
      descEn: `Centers push force cleanly on the riser plane to prevent hand torque from deflecting arrow flight.`,
    },
    optic: {
      material: 'nitride_steel',
      nameZh: isLongbow
        ? '传统直觉瞄准与弓身测距参考'
        : isCrossbow
          ? '多距分划照明重弩瞄准镜'
          : '5 针光纤微调复合弓瞄具',
      nameEn: isLongbow
        ? 'Instinctive Stave Sighting Reference'
        : isCrossbow
          ? 'Illuminated Multi-Range Crossbow Scope'
          : '5-Pin Fiber-Optic Dovetail Sight',
      calloutLabelZh: isLongbow
        ? '直觉测距参照'
        : isCrossbow
          ? '照明测距弩镜'
          : '5针光纤弓瞄',
      calloutLabelEn: isLongbow
        ? 'Instinctive Reference'
        : isCrossbow
          ? 'Crossbow Scope'
          : '5-Pin Fiber Sight',
      roleTagZh: '分距瞄准',
      roleTagEn: 'Range Aiming',
      descZh: `针对高抛物线箭矢弹道提供多距离仰角分划标定。`,
      descEn: `Compensates for arched arrow trajectory across multiple target distances.`,
    },
    gas_system: {
      material: 'stainless',
      nameZh: isLongbow
        ? '全弓自然弓档（Brace Height）张力区'
        : isCrossbow
          ? '内置 Charger 静音棘轮上弦曲柄'
          : '分叉式低摩擦滚轮分弦滑杆',
      nameEn: isLongbow
        ? 'Natural Brace-Height Tension Zone'
        : isCrossbow
          ? 'Integrated Silent Charger Ratchet Crank'
          : 'Roller Cable Guard & Slide Rod',
      calloutLabelZh: isLongbow
        ? '弓档张力平衡区'
        : isCrossbow
          ? '静音棘轮曲柄'
          : '滚轮分弦滑杆',
      calloutLabelEn: isLongbow
        ? 'Brace-Height Zone'
        : isCrossbow
          ? 'Silent Charger Crank'
          : 'Roller Cable Guard',
      roleTagZh: isCrossbow ? '省力上弦' : '分弦稳态',
      roleTagEn: isCrossbow ? 'Crank Cocking' : 'Cable Clearance',
      descZh: isCrossbow
        ? '内置静音棘轮曲柄将 290 lbf 巨大拉弓阻力降至约 12 lbf 省力摇动，并可安全无声卸弦。'
        : '将辅助缆绳侧向平滑引开，为箭矢尾羽留出无障碍飞行通道。',
      descEn: isCrossbow
        ? 'Internal ratchet crank cuts 290 lbf draw load to ~12 lbf effort and allows silent de-cocking.'
        : 'Holds power cables cleanly clear of arrow fletching while minimizing lateral cam torque.',
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: isLongbow
        ? '牛皮护臂与传统矢道基准'
        : '一体化燕尾瞄具与平衡杆接口',
      nameEn: isLongbow
        ? 'Traditional Stave Balance Reference'
        : 'Integrated Dovetail Optic & Stabilizer Mount',
      calloutLabelZh: isLongbow ? '弓身配平基准' : '一体化燕尾接口',
      calloutLabelEn: isLongbow ? 'Stave Balance Ref' : 'Dovetail Accessory Rail',
      roleTagZh: '附件挂载',
      roleTagEn: 'Accessory Interface',
      descZh: `为瞄具、箭壶与减震平衡杆提供零松动刚性锁紧接口。`,
      descEn: `Provides zero-play structural mounting for optics, quivers, and stabilizers.`,
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: isCrossbow
        ? 'Pro-Shot 两段式竞赛扳机'
        : 'D-Loop 撒放环与撒放器接口',
      nameEn: isCrossbow
        ? 'Pro-Shot Two-Stage Match Trigger'
        : 'D-Loop & Release Aid Interface',
      calloutLabelZh: isCrossbow ? '两段式竞赛扳机' : 'D-Loop 撒放环',
      calloutLabelEn: isCrossbow ? 'Two-Stage Trigger' : 'D-Loop Release Point',
      roleTagZh: '精密撒放',
      roleTagEn: 'Clean Release',
      descZh: isCrossbow
        ? '清脆零拖滞两段式扳机机构，精准控制重弩击发瞬间。'
        : '将手指或机械撒放器拉力居中作用于箭尾正后方，消除弓弦侧向偏折。',
      descEn: isCrossbow
        ? 'Crisp two-stage match trigger breaking cleanly with minimal creep.'
        : 'Centers draw and release force squarely behind the arrow nock to eliminate string pinch.',
    },
    hammer: {
      material: 'stainless',
      nameZh: isCrossbow
        ? '重负荷弓弦阻铁抓钩（String Latch）'
        : '箭尾扣弦点（Nocking Point）',
      nameEn: isCrossbow
        ? 'Heavy-Duty String Catch Latch'
        : 'Brass Nocking Point Collar',
      calloutLabelZh: isCrossbow ? '重负荷抓弦阻铁' : '弓弦扣箭定位点',
      calloutLabelEn: isCrossbow ? 'String Catch Latch' : 'Nocking Point',
      roleTagZh: '锁弦释放',
      roleTagEn: 'String Retention',
      descZh: isCrossbow
        ? '承受 290 lbf 满弦张力并在扣动扳机瞬间向上弹开零摩擦释放弩弦。'
        : '精确标定箭尾垂直扣弦位置，确保每箭离弦仰角完全一致。',
      descEn: isCrossbow
        ? 'Holds 290 lbf full draw cleanly and flips free instantly when the trigger breaks.'
        : 'Indexes vertical arrow-nock elevation for repeatable launch alignment on every shot.',
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: '防空放安全锁与阻铁复位簧',
      nameEn: 'Anti-Dry-Fire & Latch Return Spring',
      calloutLabelZh: '防空放复位簧',
      calloutLabelEn: 'Anti-Dry-Fire Spring',
      roleTagZh: '安全阻断',
      roleTagEn: 'Dry-Fire Safety',
      descZh: `防止无箭空放导致数百磅势能反噬劈裂弓片的核心保护弹簧。`,
      descEn: `Powers the safety latch that prevents catastrophic dry-firing when no arrow or bolt is seated.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: isCrossbow
        ? '自动保险与 CeaseFire 防空放拨片'
        : '拉距微调模组锁止销',
      nameEn: isCrossbow
        ? 'Auto Safety & CeaseFire Interlock'
        : 'Draw-Length Indexing Module Lock',
      calloutLabelZh: isCrossbow ? '防空放保险拨片' : '拉距微调锁止销',
      calloutLabelEn: isCrossbow ? 'Dry-Fire Safety' : 'Draw-Length Module',
      roleTagZh: '安全调节',
      roleTagEn: 'Safety & Tuning',
      descZh: isCrossbow
        ? '上弦自动挂入保险并检测弩箭到位，无箭状态机械锁死扳机。'
        : '允许免弓床微调拉距与省力壁手感，精准贴合不同射手臂长。',
      descEn: isCrossbow
        ? 'Engages automatically on cocking and blocks trigger release until a bolt seats properly.'
        : 'Indexes draw length and back-wall feel precisely to each archer’s geometry.',
    },
    mag_body: {
      material: 'polymer_frame',
      nameZh: `${bp.magCapacity} 支装快拆侧挂箭壶`,
      nameEn: `${bp.magCapacity}-Arrow Quick-Detach Quiver`,
      calloutLabelZh: `${bp.magCapacity}支侧挂箭壶`,
      calloutLabelEn: `${bp.magCapacity}-Arrow Quiver`,
      roleTagZh: '箭矢携行',
      roleTagEn: 'Arrow Storage',
      descZh: `紧贴弓身低风阻收纳 ${bp.magCapacity} 支备用箭矢，并严密包覆锋利猎箭头。`,
      descEn: `Carries ${bp.magCapacity} spare shafts snugly against the riser while shielding sharp broadhead blades.`,
    },
    follower: {
      material: 'follower_orange',
      nameZh: '减震橡胶卡箭夹齿',
      nameEn: 'Vibration-Damping Arrow Gripper',
      calloutLabelZh: '橡胶卡箭夹齿',
      calloutLabelEn: 'Arrow Gripper Clip',
      roleTagZh: '静音固箭',
      roleTagEn: 'Silent Retention',
      descZh: `双排弹性橡胶卡槽牢牢夹持碳纤箭杆，野外潜行零晃动异响。`,
      descEn: `Dual elastomer grippers hold arrow shafts quietly with zero rattle in the field.`,
    },
    mag_spring: {
      material: 'spring_steel',
      nameZh: '箭壶快拆锁扣弹片',
      nameEn: 'Quiver Quick-Detach Latch Spring',
      calloutLabelZh: '箭壶快拆弹片',
      calloutLabelEn: 'Quiver Latch Spring',
      roleTagZh: '快拆锁紧',
      roleTagEn: 'Quick Detach',
      descZh: `单手拨动即可快速装卸箭壶，消除射箭瞬间额外侧向摆动。`,
      descEn: `Secures the quiver mount tightly and releases cleanly with one thumb motion.`,
    },
    mag_base: {
      material: 'nitride_steel',
      nameZh: '防割护箭帽盖与内衬泡沫',
      nameEn: 'Broadhead Protective Hood & Insert',
      calloutLabelZh: '护箭帽盖总成',
      calloutLabelEn: 'Broadhead Hood',
      roleTagZh: '刃口防护',
      roleTagEn: 'Tip Shielding',
      descZh: `包覆固定或机械猎箭头锋刃，保护射手安全并防止刀片磕钝。`,
      descEn: `Encloses fixed or mechanical broadheads safely while preventing blade dulling.`,
    },
  };

  return makeMeta(slot, map[slot]);
}

function resolveRevolverSlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isSingleAction = bp.archetype === 'revolver_sa';
  const cal = bp.caliberLabel;

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: bp.finishPalette === 'stainless' ? 'stainless' : 'nitride_steel',
      nameZh: isSingleAction ? '一体式实心顶梁转轮底把' : '重型 X 框不锈钢转轮底把',
      nameEn: isSingleAction
        ? 'Solid-Topstrap Single-Action Frame'
        : 'Heavy X-Frame Stainless Revolver Frame',
      calloutLabelZh: isSingleAction ? '实心顶梁底把' : '重型转轮底把',
      calloutLabelEn: isSingleAction ? 'Solid-Topstrap Frame' : 'Heavy Revolver Frame',
      roleTagZh: '转轮框架',
      roleTagEn: 'Revolver Frame',
      descZh: `高强锻钢转轮框架，封闭顶梁承受 ${cal} 击发时的轴向拉伸载荷并精准对正弹巢与枪管。`,
      descEn: `Forged revolver frame whose topstrap resists ${cal} firing stretch while keeping cylinder and bore aligned.`,
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: `${bp.barrelLengthMm} mm 线膛转轮枪管与强迫锥`,
      nameEn: `${bp.barrelLengthMm} mm Rifled Barrel & Forcing Cone`,
      calloutLabelZh: '转轮线膛枪管',
      calloutLabelEn: 'Rifled Barrel & Cone',
      roleTagZh: '引导加速',
      roleTagEn: 'Forcing Cone & Bore',
      descZh: `后端切削精密强迫锥，平顺引导弹头跨越弹巢间隙进入 ${bp.rifling.grooveCount} 条膛线。`,
      descEn: `Rear forcing cone smoothly centers the projectile across the cylinder gap into ${bp.rifling.grooveCount}-groove rifling.`,
    },
    muzzle: resolveMuzzleText(bp),
    bolt_carrier: {
      material: 'stainless',
      nameZh: isSingleAction ? '弹巢中心轴与退壳杆套筒' : '外摆式转轮摇架（Crane / Yoke）',
      nameEn: isSingleAction
        ? 'Cylinder Base Pin & Ejector Housing'
        : 'Swing-Out Cylinder Crane / Yoke',
      calloutLabelZh: isSingleAction ? '弹巢轴与退壳筒' : '外摆式转轮摇架',
      calloutLabelEn: isSingleAction ? 'Base Pin & Ejector' : 'Swing-Out Crane',
      roleTagZh: '转轮支承',
      roleTagEn: 'Cylinder Axis',
      descZh: isSingleAction
        ? '承载 6 发转轮弹巢定心旋转并配合右侧推杆逐发顶出空弹壳。'
        : '支撑重载转轮向左侧翻出装填，闭合时靠前后双锁销刚性锁定。',
      descEn: isSingleAction
        ? 'Centers cylinder rotation on a solid axis pin alongside a spring-loaded side ejector rod.'
        : 'Swings the heavy cylinder left for rapid reloading and locks solidly fore-and-aft on closure.',
    },
    bolt: {
      material: 'stainless',
      nameZh: '60° 星形棘轮拨齿与止转笋',
      nameEn: 'Cylinder Ratchet Hand & Stop Bolt',
      calloutLabelZh: '棘轮拨齿/止转笋',
      calloutLabelEn: 'Ratchet & Stop Bolt',
      roleTagZh: '分度锁正',
      roleTagEn: 'Cylinder Indexing',
      descZh: `扳动击锤或扳机时拨动星形棘轮旋转下一弹膛，并由底部止转笋精确定位锁正枪管轴线。`,
      descEn: `Advances the cylinder star ratchet to the next chamber and locks it squarely inline with the bore via the stop bolt.`,
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: '退壳杆复位螺旋弹簧',
      nameEn: 'Ejector Rod Return Helical Spring',
      calloutLabelZh: '退壳杆复位簧',
      calloutLabelEn: 'Ejector Return Spring',
      roleTagZh: '退壳复位',
      roleTagEn: 'Ejector Return',
      descZh: `完成推壳清膛后迅速将退壳推杆拉回待发位置。`,
      descEn: `Returns the manual ejector rod cleanly to rest after pushing spent brass clear.`,
    },
    handguard: {
      material: 'nitride_steel',
      nameZh: isSingleAction ? '枪管下置退壳杆护槽' : '全长配重下挂套（Full Underlug）',
      nameEn: isSingleAction
        ? 'Under-Barrel Ejector Rod Housing'
        : 'Full-Length Weighted Barrel Underlug',
      calloutLabelZh: isSingleAction ? '退壳杆护槽' : '全长配重下挂套',
      calloutLabelEn: isSingleAction ? 'Ejector Rod Housing' : 'Full Barrel Underlug',
      roleTagZh: '配重抑跳',
      roleTagEn: 'Muzzle Balance',
      descZh: `保护退壳推杆并增加枪口配重以显著抑制大威力马格南弹上跳。`,
      descEn: `Shields the ejector rod while adding forward mass to tame heavy magnum muzzle flip.`,
    },
    stock: {
      material: 'polymer_frame',
      nameZh: isSingleAction ? '经典犁柄弧形握把骨架' : '吸震橡胶全包覆 X 框握把',
      nameEn: isSingleAction
        ? 'Classic Plowhandle Backstrap Frame'
        : 'Recoil-Absorbing Elastomer Grip Frame',
      calloutLabelZh: isSingleAction ? '犁柄握把骨架' : '吸震握把骨架',
      calloutLabelEn: isSingleAction ? 'Plowhandle Backstrap' : 'Recoil Grip Frame',
      roleTagZh: '卸力握柄',
      roleTagEn: 'Recoil Control',
      descZh: isSingleAction
        ? '圆弧犁柄允许后坐时枪柄在掌心自然向上滚转，顺势将大拇指送至击锤压钩处。'
        : '封闭式减震握把背垫吸收高能 .500 马格南猛烈后坐冲量，保护虎口骨骼。',
      descEn: isSingleAction
        ? 'Curved plowhandle naturally rolls upward in the palm under recoil, aligning the thumb for re-cocking.'
        : 'Enclosed recoil-damping backstrap cushions severe magnum impulse across the web of the hand.',
    },
    grip: {
      material: 'polymer_frame',
      nameZh: bp.cad.hasWoodFurniture ? '胡桃木经典贴片握把' : '防滑指槽软胶握把套',
      nameEn: bp.cad.hasWoodFurniture
        ? 'Contoured Walnut Grip Panels'
        : 'Checkered Finger-Groove Grip Sleeve',
      calloutLabelZh: bp.cad.hasWoodFurniture ? '胡桃木握把贴片' : '防滑软胶握把',
      calloutLabelEn: bp.cad.hasWoodFurniture ? 'Walnut Grip Panels' : 'Textured Grip Sleeve',
      roleTagZh: '防滑贴合',
      roleTagEn: 'Ergonomic Grip',
      descZh: `贴合掌心曲线提供稳固抓握力与经典博物馆美学质感。`,
      descEn: `Contours naturally to the firing hand for steady control under heavy recoil.`,
    },
    optic: {
      material: 'nitride_steel',
      nameZh: isSingleAction ? '机匣顶槽固定缺口与刀片准星' : '微调白框照门与光纤准星',
      nameEn: isSingleAction
        ? 'Topstrap Groove Notch & Blade Front'
        : 'Micrometer Adjustable Iron Sights',
      calloutLabelZh: isSingleAction ? '顶槽缺口准星' : '微调精密铁瞄',
      calloutLabelEn: isSingleAction ? 'Topstrap Iron Sights' : 'Adjustable Sights',
      roleTagZh: '机械瞄准',
      roleTagEn: 'Iron Sighting',
      descZh: `清晰锐利的机械瞄准基线，支持远距精准瞄准与风偏高低校正。`,
      descEn: `Crisp iron sight picture calibrated for accurate point-of-aim shooting.`,
    },
    gas_system: {
      material: 'stainless',
      nameZh: '弹巢闭锁球珠与转轮止动销',
      nameEn: 'Cylinder Detent & Crane Lock Pin',
      calloutLabelZh: '转轮锁止销',
      calloutLabelEn: 'Cylinder Lock Pin',
      roleTagZh: '精密定心',
      roleTagEn: 'Radial Lockup',
      descZh: `确保击发瞬间弹膛与枪管同轴偏差小于数百分之一毫米。`,
      descEn: `Holds cylinder-to-bore radial concentricity within hundredths of a millimeter at ignition.`,
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: isSingleAction ? '右侧翻开式装弹门（Loading Gate）' : '顶梁光学瞄具接口槽',
      nameEn: isSingleAction
        ? 'Right-Side Hinged Loading Gate'
        : 'Drilled Topstrap Optic Mount',
      calloutLabelZh: isSingleAction ? '右侧装弹门' : '顶梁镜桥接口',
      calloutLabelEn: isSingleAction ? 'Side Loading Gate' : 'Topstrap Optic Mount',
      roleTagZh: isSingleAction ? '单发装填' : '光学挂载',
      roleTagEn: isSingleAction ? 'Single Loading' : 'Optic Interface',
      descZh: isSingleAction
        ? '打开右侧装弹门并拨至半待击位即可逐发装弹或推杆退壳。'
        : '预留加固螺孔以直接安装耐高后坐手枪红点或长出瞳瞄准镜。',
      descEn: isSingleAction
        ? 'Flips open at half-cock to expose chambers one by one for loading and rod ejection.'
        : 'Reinforced topstrap mount engineered to hold optics under magnum recoil.',
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: isSingleAction ? '纯单动精密扳机与护圈' : '双动/单动平滑滚轮扳机',
      nameEn: isSingleAction
        ? 'Crisp Single-Action Trigger & Guard'
        : 'DA/SA Smooth Trigger & Guard',
      calloutLabelZh: isSingleAction ? '单动精密扳机' : '双动/单动扳机',
      calloutLabelEn: isSingleAction ? 'Single-Action Trigger' : 'DA/SA Trigger',
      roleTagZh: '击发触发',
      roleTagEn: 'Trigger Break',
      descZh: isSingleAction
        ? '手动压倒击锤后仅需极短行程即可清脆释放阻铁击发。'
        : '支持直接扣动长行程双动连发或先压击锤享受清脆轻盈单动击发。',
      descEn: isSingleAction
        ? 'Delivers a crisp, short single-action release once the hammer is thumb-cocked.'
        : 'Operates smoothly in either long double-action pull or light crisp single-action mode.',
    },
    hammer: {
      material: 'stainless',
      nameZh: isSingleAction ? '滚花高翘外露大击锤（含一体击针）' : '滚花外露双动击锤与传力杆',
      nameEn: isSingleAction
        ? 'Checkered Spur Hammer & Firing Pin'
        : 'Checkered DA Hammer & Transfer Bar',
      calloutLabelZh: '外露滚花击锤',
      calloutLabelEn: 'Exposed Spur Hammer',
      roleTagZh: '蓄能撞击',
      roleTagEn: 'Hammer Ignition',
      descZh: `标志性滚花拇指压钩外露击锤，释放主簧高能精准撞击弹药底火。`,
      descEn: `Checkered thumb-spur hammer delivering crisp mainspring impact to ignite the cartridge primer.`,
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: isSingleAction ? '握把内弧形平板主簧' : '高张力螺旋/片状主击发簧',
      nameEn: isSingleAction
        ? 'Flat-Leaf Mainspring in Grip Frame'
        : 'High-Tension Revolver Mainspring',
      calloutLabelZh: '转轮击发主簧',
      calloutLabelEn: 'Revolver Mainspring',
      roleTagZh: '击发储能',
      roleTagEn: 'Mainspring Force',
      descZh: `深藏握把内部为击锤提供清脆高能打击力，可靠引燃厚底马格南底火。`,
      descEn: `Housed inside the grip frame to drive brisk hammer fall for reliable magnum primer ignition.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: isSingleAction ? '四档击锤保险槽（半待击装填）' : '左侧拇指转轮释放推钮',
      nameEn: isSingleAction
        ? '4-Click Hammer Safety & Half-Cock Notch'
        : 'Thumb Cylinder Release Latch',
      calloutLabelZh: isSingleAction ? '半待击保险档' : '转轮释放推钮',
      calloutLabelEn: isSingleAction ? 'Half-Cock Safety' : 'Cylinder Release',
      roleTagZh: '安全锁控',
      roleTagEn: 'Safety & Release',
      descZh: isSingleAction
        ? '经典的「四声咔哒」击锤档位，半待击位解脱止转笋以便安全旋转装弹。'
        : '向前推动拇指拨钮解除弹巢锁销，一秒外摆清膛或装填。',
      descEn: isSingleAction
        ? 'Classic four-click hammer notch geometry freeing the cylinder at half-cock for loading.'
        : 'Forward-sliding thumb latch unlocking the cylinder crane for rapid swing-out reloads.',
    },
    mag_body: {
      material: 'stainless',
      nameZh: `${bp.magCapacity} 发开槽锻钢转轮弹巢`,
      nameEn: `${bp.magCapacity}-Shot Fluted Steel Cylinder`,
      calloutLabelZh: `${bp.magCapacity}发转轮弹巢`,
      calloutLabelEn: `${bp.magCapacity}-Shot Cylinder`,
      roleTagZh: '旋转弹膛',
      roleTagEn: 'Revolving Chambers',
      descZh: `集弹仓与高压弹膛于一体的 ${bp.magCapacity} 发开槽锻钢弹巢，可承受 ${bp.peakPressureMpa} MPa 峰压。`,
      descEn: `Combines magazine and ${bp.magCapacity} high-pressure chambers machined from solid alloy steel rated to ${bp.peakPressureMpa} MPa.`,
    },
    follower: {
      material: 'follower_orange',
      nameZh: '星形抽壳器与棘轮分度盘',
      nameEn: 'Star Extractor & Ratchet Wheel',
      calloutLabelZh: '星形抽壳棘轮',
      calloutLabelEn: 'Star Extractor',
      roleTagZh: '同步退壳',
      roleTagEn: 'Simultaneous Eject',
      descZh: `位于弹巢后端中心，兼具步进棘轮齿槽与一键同步顶出全部空弹壳功能。`,
      descEn: `Rear cylinder star meshing with the indexing hand while extracting all spent rims simultaneously.`,
    },
    mag_spring: {
      material: 'spring_steel',
      nameZh: '止转笋与拨弹手双联复位簧',
      nameEn: 'Hand & Cylinder-Stop Bias Spring',
      calloutLabelZh: '棘轮止转复位簧',
      calloutLabelEn: 'Indexing Bias Spring',
      roleTagZh: '棘轮贴合',
      roleTagEn: 'Ratchet Tension',
      descZh: `始终保持拨弹手紧贴棘轮齿面并使止转笋精准卡入弹巢外周凹槽。`,
      descEn: `Keeps the advancing hand engaged on the star ratchet and snaps the stop bolt into cylinder notches.`,
    },
    mag_base: {
      material: 'nitride_steel',
      nameZh: '护盾式防烟气闭气底面',
      nameEn: 'Recoil Shield & Ratchet Seat',
      calloutLabelZh: '防后坐闭气护盾',
      calloutLabelEn: 'Recoil Shield',
      roleTagZh: '承受后推',
      roleTagEn: 'Breech Thrust Face',
      descZh: `直接承受击发瞬间弹壳底部巨额向后推力，并阻挡高温燃气漏向射手面部。`,
      descEn: `Supports full rearward cartridge-head thrust at ignition and shields the shooter from gas escape.`,
    },
  };

  return makeMeta(slot, map[slot]);
}

function resolvePistolSlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isBroomhandle = bp.archetype === 'pistol_broomhandle';
  const isOpenSlide = bp.id === 'beretta92';
  const isDirectBlowback =
    bp.kinematicLaw === 'closed_bolt_blowback' ||
    bp.kinematicLaw === 'open_bolt_blowback';
  const isLeverDelayed = bp.kinematicLaw === 'lever_delayed';
  const cal = bp.caliberLabel;

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: 'nitride_steel',
      nameZh: isBroomhandle
        ? '整体枪管节套延长体（Barrel Extension）'
        : isOpenSlide
          ? '敞顶镂空锻钢套筒'
          : '全封闭式锻钢往复套筒',
      nameEn: isBroomhandle
        ? 'Integral Barrel Extension Receiver'
        : isOpenSlide
          ? 'Open-Top Forged Steel Slide'
          : 'Forged Steel Reciprocating Slide',
      calloutLabelZh: isBroomhandle
        ? '枪管延长机匣'
        : isOpenSlide
          ? '敞顶锻钢套筒'
          : '锻钢往复套筒',
      calloutLabelEn: isBroomhandle
        ? 'Barrel Extension'
        : isOpenSlide
          ? 'Open-Top Slide'
          : 'Forged Steel Slide',
      roleTagZh: '套筒壳体',
      roleTagEn: 'Slide Housing',
      descZh: isBroomhandle
        ? '毛瑟 C96 标志性一体锻造枪管与机匣延长体，内部滑动内置枪机与下落闭锁卡铁。'
        : `构成 ${bp.shortLabel} 上部运动主体，承载闭锁、抽壳、抛壳与瞄具基线。`,
      descEn: isBroomhandle
        ? 'Mauser C96 monolithic barrel-and-receiver forging housing the internal sliding bolt and locking block.'
        : `Primary upper reciprocating housing of the ${bp.shortLabel}, integrating lockup, extraction, and sights.`,
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: `${bp.barrelLengthMm} mm 精密线膛手枪管`,
      nameEn: `${bp.barrelLengthMm} mm Rifled Pistol Barrel`,
      calloutLabelZh: '线膛手枪枪管',
      calloutLabelEn: 'Rifled Pistol Barrel',
      roleTagZh: '弹道加速',
      roleTagEn: 'Bore & Chamber',
      descZh: `${bp.rifling.grooveCount} 条膛线精密冷锻枪管，将 ${cal} 稳定加速至 ${bp.muzzleVelocityMs} m/s。`,
      descEn: `${bp.rifling.grooveCount}-groove precision barrel accelerating ${cal} cleanly to ${bp.muzzleVelocityMs} m/s.`,
    },
    muzzle: resolveMuzzleText(bp),
    bolt_carrier: {
      material: 'stainless',
      nameZh: isBroomhandle
        ? '内置矩形往复枪机体'
        : isDirectBlowback
          ? '固定枪管套筒惯性后坐块'
          : isLeverDelayed
            ? '延迟杠杆缓冲滑块总成'
            : bp.kinematicLaw === 'falling_block_pistol'
              ? '双翼下落式楔形闭锁块'
              : '枪管下方开闭锁凸轮耳',
      nameEn: isBroomhandle
        ? 'Internal Reciprocating Bolt Body'
        : isDirectBlowback
          ? 'Fixed-Barrel Blowback Slide Mass'
          : isLeverDelayed
            ? 'Lever-Delayed Recoil Buffer Block'
            : bp.kinematicLaw === 'falling_block_pistol'
              ? 'Falling-Block Locking Wedge'
              : 'Barrel Locking Cam Lug',
      calloutLabelZh: isBroomhandle
        ? '内置矩形枪机'
        : isDirectBlowback
          ? '套筒惯性后坐块'
          : isLeverDelayed
            ? '延迟缓冲滑块'
            : bp.kinematicLaw === 'falling_block_pistol'
              ? '下落式闭锁楔块'
              : '枪管开锁凸轮耳',
      calloutLabelEn: isBroomhandle
        ? 'Internal Bolt Body'
        : isDirectBlowback
          ? 'Blowback Slide Mass'
          : isLeverDelayed
            ? 'Delay Buffer Block'
            : bp.kinematicLaw === 'falling_block_pistol'
              ? 'Falling Locking Block'
              : 'Barrel Locking Lug',
      roleTagZh: isDirectBlowback
        ? '自由枪机后坐'
        : isLeverDelayed
          ? '杠杆延迟后坐'
          : '短后坐闭锁',
      roleTagEn: isDirectBlowback
        ? 'Blowback Inertia'
        : isLeverDelayed
          ? 'Delayed Blowback'
          : 'Locking Interface',
      descZh: `执行 ${bp.actionMechanismZh} 核心闭锁与延迟开锁动作。`,
      descEn: `Executes the core ${bp.actionMechanismEn.toLowerCase()} lockup and unlock timing.`,
    },
    bolt: {
      material: 'stainless',
      nameZh: '弹底窝镜面与外置弹簧抓壳钩',
      nameEn: 'Breechface & Spring Claw Extractor',
      calloutLabelZh: '镜面与抓壳钩',
      calloutLabelEn: 'Breechface & Extractor',
      roleTagZh: '闭气抽壳',
      roleTagEn: 'Breech & Extraction',
      descZh: `贴合弹壳底部承受 ${bp.peakPressureMpa} MPa 峰压并在后坐行程牢牢抓出空壳。`,
      descEn: `Supports ${bp.peakPressureMpa} MPa breech thrust and positively extracts spent brass during slide recoil.`,
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: '全长导杆与螺旋复进主簧',
      nameEn: 'Full-Length Guide Rod & Recoil Spring',
      calloutLabelZh: '套筒螺旋复进簧',
      calloutLabelEn: 'Recoil Guide & Spring',
      roleTagZh: '复进推弹',
      roleTagEn: 'Slide Return',
      descZh: `吸收套筒后坐动能并在复进途中推动下一发 ${cal} 上膛完成闭锁。`,
      descEn: `Absorbs slide recoil velocity and drives the slide forward to strip and chamber the next ${cal} round.`,
    },
    handguard: {
      material: 'nitride_steel',
      nameZh: isBroomhandle ? '前置弹仓防尘壁与导轨' : '底把前端防尘盖与战术槽',
      nameEn: isBroomhandle
        ? 'Forward Magazine Wall & Frame Rails'
        : 'Frame Dust Cover & Accessory Rail',
      calloutLabelZh: isBroomhandle ? '前弹仓防尘壁' : '底把前防尘盖',
      calloutLabelEn: isBroomhandle ? 'Mag Well Dust Cover' : 'Frame Dust Cover',
      roleTagZh: '防尘导向',
      roleTagEn: 'Dust Shield & Rail',
      descZh: `封闭复进簧导杆槽防止泥沙侵入，并支撑套筒长导轨平稳滑行。`,
      descEn: `Seals the recoil-spring tunnel against grit while extending full-length slide guide rails.`,
    },
    stock: {
      material: bp.finishPalette === 'tactical_black' ? 'polymer_frame' : 'nitride_steel',
      nameZh: isBroomhandle ? '全钢下机匣与扫帚柄骨架' : '金属/聚合物手枪主底把',
      nameEn: isBroomhandle
        ? 'Machined Lower Frame & Broomhandle Tang'
        : 'Pistol Lower Receiver Frame',
      calloutLabelZh: isBroomhandle ? '下机匣扫帚柄架' : '手枪主底把框架',
      calloutLabelEn: isBroomhandle ? 'Lower Frame Tang' : 'Pistol Lower Frame',
      roleTagZh: '承力底把',
      roleTagEn: 'Primary Frame',
      descZh: `承载扳机火控组、套筒滑轨与弹匣井的核心主底把，膛轴高 ${bp.boreAxisMm} mm。`,
      descEn: `Houses the trigger group, slide rails, and magazine well at a ${bp.boreAxisMm} mm bore-axis height.`,
    },
    grip: {
      material: 'polymer_frame',
      nameZh: bp.cad.hasWoodFurniture
        ? '经典横槽/格纹核桃木握把片'
        : '人体工学防滑纹握把',
      nameEn: bp.cad.hasWoodFurniture
        ? 'Ribbed Classic Hardwood Grip Panels'
        : 'Checkered Ergonomic Pistol Grip',
      calloutLabelZh: bp.cad.hasWoodFurniture ? '核桃木握把片' : '防滑战术握把',
      calloutLabelEn: bp.cad.hasWoodFurniture ? 'Hardwood Grip Panels' : 'Textured Pistol Grip',
      roleTagZh: '防滑指向',
      roleTagEn: 'Natural Pointability',
      descZh: `契合手掌自然握持角度，稳固抵御手枪连射时的腕部翻转力矩。`,
      descEn: `Shaped to align the bore naturally with the forearm and resist recoil torque.`,
    },
    optic: {
      material: 'nitride_steel',
      nameZh: isBroomhandle ? '50–1,000 米切线式滑动表尺' : '三点高对比机械照门与准星',
      nameEn: isBroomhandle
        ? '50–1,000 m Tangent Sliding Rear Sight'
        : 'High-Contrast 3-Dot Iron Sights',
      calloutLabelZh: isBroomhandle ? '切线式滑动表尺' : '三点机械照门',
      calloutLabelEn: isBroomhandle ? 'Tangent Rear Sight' : '3-Dot Iron Sights',
      roleTagZh: '快速瞄准',
      roleTagEn: 'Target Acquisition',
      descZh: `清晰锐利的对比瞄准基线，支持微光与快速出枪目标捕获。`,
      descEn: `High-contrast iron sighting reference engineered for rapid target acquisition.`,
    },
    gas_system: {
      material: 'stainless',
      nameZh: '分解锁销与空仓挂机杠杆',
      nameEn: 'Takedown Lever & Slide-Stop Pin',
      calloutLabelZh: '分解杆/空仓挂机',
      calloutLabelEn: 'Takedown & Slide Stop',
      roleTagZh: '快拆挂机',
      roleTagEn: 'Field-Strip & Hold',
      descZh: `兼任野战快拆旋转轴与末发空仓自动挂机止动杆。`,
      descEn: `Serves as the tool-free field-strip pivot and locks the slide open after the final round.`,
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: '底把全长滑轨与分解锁定槽',
      nameEn: 'Full-Length Slide Rails & Locking Block',
      calloutLabelZh: '套筒导轨锁块',
      calloutLabelEn: 'Slide Rails & Block',
      roleTagZh: '精密滑轨',
      roleTagEn: 'Slide Guidance',
      descZh: `精密配合的金属滑轨约束套筒直线往复运动，直接决定连续射击精度。`,
      descEn: `Precision-mated metal slide rails maintain tight lockup consistency shot after shot.`,
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: '弧形扳机与侧面扳机连杆',
      nameEn: 'Curved Trigger Shoe & Transfer Bar',
      calloutLabelZh: '扳机与传力连杆',
      calloutLabelEn: 'Trigger & Transfer Bar',
      roleTagZh: '单/双动控制',
      roleTagEn: 'Trigger Linkage',
      descZh: `将食指扣压力平顺传导至尾部阻铁与跌落保险解脱杆。`,
      descEn: `Transfers finger pull cleanly to the rear sear and internal firing-pin block.`,
    },
    hammer: {
      material: 'stainless',
      nameZh: bp.id === 'fiveseven' ? '内置隐蔽式回转击锤' : '外露式回转击锤与惯性击针',
      nameEn:
        bp.id === 'fiveseven'
          ? 'Concealed Internal Hammer & Pin'
          : 'Exposed Hammer & Firing Pin',
      calloutLabelZh: bp.id === 'fiveseven' ? '内置回转击锤' : '外露击锤/击针',
      calloutLabelEn: bp.id === 'fiveseven' ? 'Internal Hammer' : 'Hammer & Firing Pin',
      roleTagZh: '撞针击发',
      roleTagEn: 'Primer Ignition',
      descZh: `经击针跌落安全锁验证后撞击底火完成发火，防止意外跌落走火。`,
      descEn: `Strikes the primer only when the trigger-actuated firing-pin safety clears the firing pin.`,
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: '握把内置击锤主簧与撑杆',
      nameEn: 'Mainspring & Hammer Strut Assembly',
      calloutLabelZh: '击锤主簧撑杆',
      calloutLabelEn: 'Hammer Mainspring',
      roleTagZh: '击发储能',
      roleTagEn: 'Hammer Drive',
      descZh: `驱动击锤高速下摆撞击击针的高张力储能弹簧。`,
      descEn: `Drives crisp hammer fall speed for fast lock time and positive primer ignition.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: '待击解脱与手动拇指保险杆',
      nameEn: 'Manual Safety & Decocking Lever',
      calloutLabelZh: '手动保险/解脱杆',
      calloutLabelEn: 'Safety & Decocker',
      roleTagZh: '安全解脱',
      roleTagEn: 'Safe Decocking',
      descZh: `允许安全泄放待击击锤而不触碰底火，兼任携行手动保险。`,
      descEn: `Safely lowers a cocked hammer off the firing pin and locks the fire-control linkage.`,
    },
    mag_body: resolveFeedAssembly(bp, 'mag_body'),
    follower: resolveFeedAssembly(bp, 'follower'),
    mag_spring: resolveFeedAssembly(bp, 'mag_spring'),
    mag_base: resolveFeedAssembly(bp, 'mag_base'),
  };

  return makeMeta(slot, map[slot]);
}

function resolveStandardSmallArmSlotMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  const isBullpup =
    bp.archetype === 'bullpup_rifle' || bp.archetype === 'sniper_bullpup';
  const isBoltAction = bp.kinematicLaw === 'bolt_action';
  const isPump = bp.kinematicLaw === 'pump_action';
  const isLever = bp.kinematicLaw === 'lever_action';
  const isBlowback =
    bp.kinematicLaw === 'open_bolt_blowback' ||
    bp.kinematicLaw === 'closed_bolt_blowback' ||
    bp.kinematicLaw === 'roller_delayed' ||
    bp.kinematicLaw === 'lever_delayed';
  const isDi = bp.kinematicLaw === 'direct_impingement';
  const isHeavyMg = bp.archetype === 'heavy_mg';
  const cal = bp.caliberLabel;

  const map: Record<CentennialPartSlot, PartTextSpec> = {
    receiver: {
      material: 'nitride_steel',
      nameZh: isBullpup
        ? '无托一体化承力机匣壳体'
        : isHeavyMg
          ? '重型铆接钢板大口径机匣'
          : '主承力机匣与防尘盖总成',
      nameEn: isBullpup
        ? 'Monolithic Bullpup Receiver Shell'
        : isHeavyMg
          ? 'Heavy Riveted .50-Cal Receiver'
          : 'Primary Receiver & Dust Cover',
      calloutLabelZh: isBullpup
        ? '无托主承力机匣'
        : isHeavyMg
          ? '重型钢板机匣'
          : '主承力机匣壳体',
      calloutLabelEn: isBullpup
        ? 'Bullpup Receiver'
        : isHeavyMg
          ? 'Heavy .50 Receiver'
          : 'Primary Receiver',
      roleTagZh: '核心机匣',
      roleTagEn: 'Core Receiver',
      descZh: `容纳 ${bp.shortLabel} 闭锁耳轴、导轨与自动机行程的主体骨架，承受击发结构反力。`,
      descEn: `Core structural backbone of the ${bp.shortLabel}, housing locking trunnions, bolt rails, and operating cycle travel.`,
    },
    barrel: {
      material: 'barrel_steel',
      nameZh: `${bp.barrelLengthMm} mm 线膛/重型精密枪管`,
      nameEn: `${bp.barrelLengthMm} mm Precision Barrel`,
      calloutLabelZh: `${bp.barrelLengthMm}mm 主枪管`,
      calloutLabelEn: `${bp.barrelLengthMm} mm Barrel`,
      roleTagZh: '身管加速',
      roleTagEn: 'Bore & Rifling',
      descZh: `承受 ${bp.peakPressureMpa} MPa 峰压并将 ${cal} 加速至 ${bp.muzzleVelocityMs} m/s（${bp.rifling.noteZh}）。`,
      descEn: `Withstands ${bp.peakPressureMpa} MPa peak pressure to accelerate ${cal} to ${bp.muzzleVelocityMs} m/s (${bp.rifling.noteEn}).`,
    },
    muzzle: resolveMuzzleText(bp),
    bolt_carrier: {
      material: 'stainless',
      nameZh: isBoltAction
        ? '旋转拉机柄与防冰槽枪机主体'
        : isPump
          ? '双连杆泵动枪机滑架'
          : isLever
            ? '指环杠杆四连杆滑块'
            : isBlowback
              ? '大质量往复延迟枪机框'
              : '往复运动枪机框与凸轮导槽',
      nameEn: isBoltAction
        ? 'Turn-Bolt Body & Swept Handle'
        : isPump
          ? 'Twin-Bar Pump Action Slide'
          : isLever
            ? 'Finger-Lever Action Linkage'
            : isBlowback
              ? 'Weighted Blowback Carrier Mass'
              : 'Reciprocating Bolt Carrier Group',
      calloutLabelZh: isBoltAction
        ? '栓动枪机与拉柄'
        : isPump
          ? '双连杆泵动滑架'
          : isLever
            ? '杠杆连杆机构'
            : '往复运动枪机框',
      calloutLabelEn: isBoltAction
        ? 'Bolt Body & Handle'
        : isPump
          ? 'Pump Action Slide'
          : isLever
            ? 'Lever Linkage'
            : 'Bolt Carrier Group',
      roleTagZh: '自动往复',
      roleTagEn: 'Action Carrier',
      descZh: `驱动 ${bp.shortLabel} 开锁、抽壳、压倒击锤与推弹闭锁的核心运动件。`,
      descEn: `Drives unlocking, extraction, cocking, and chambering across the ${bp.shortLabel} operating cycle.`,
    },
    bolt: {
      material: 'stainless',
      nameZh: isBoltAction
        ? '刚性多突笋闭锁枪机头'
        : bp.kinematicLaw === 'roller_delayed'
          ? '对称双滚柱延迟枪机头'
          : bp.kinematicLaw === 'lever_delayed'
            ? '杠杆延迟闭锁枪机头'
            : bp.kinematicLaw === 'tilting_bolt'
              ? '尾部下倾偏移闭锁枪机'
              : '回转闭锁枪机头与抓壳钩',
      nameEn: isBoltAction
        ? 'Multi-Lug Locking Bolt Head'
        : bp.kinematicLaw === 'roller_delayed'
          ? 'Dual-Roller Delayed Bolt Head'
          : bp.kinematicLaw === 'lever_delayed'
            ? 'Lever-Delayed Bolt Head'
            : bp.kinematicLaw === 'tilting_bolt'
              ? 'Rear-Dropping Tilting Bolt'
              : 'Rotating Locking Bolt & Extractor',
      calloutLabelZh:
        bp.kinematicLaw === 'roller_delayed'
          ? '双滚柱延迟机头'
          : bp.kinematicLaw === 'tilting_bolt'
            ? '偏移闭锁枪机'
            : '闭锁枪机头总成',
      calloutLabelEn:
        bp.kinematicLaw === 'roller_delayed'
          ? 'Roller-Delayed Bolt'
          : bp.kinematicLaw === 'tilting_bolt'
            ? 'Tilting Breech Bolt'
            : 'Locking Bolt Head',
      roleTagZh: '高压闭锁',
      roleTagEn: 'Chamber Lockup',
      descZh: `在弹头离膛前牢牢封闭 ${bp.peakPressureMpa} MPa 弹膛高压，开锁后由抓壳钩抽出弹壳。`,
      descEn: `Seals ${bp.peakPressureMpa} MPa chamber pressure until bullet exit, then extracts the fired case.`,
    },
    recoil_spring: {
      material: 'spring_steel',
      nameZh: isBoltAction
        ? '栓动击针强力螺旋主簧'
        : isHeavyMg
          ? '双并联重型复进簧与液压缓冲'
          : '全长螺旋复进储能弹簧',
      nameEn: isBoltAction
        ? 'Bolt-Action Helical Striker Spring'
        : isHeavyMg
          ? 'Heavy Recoil Spring & Oil Buffer'
          : 'Helical Recoil Return Spring',
      calloutLabelZh: isBoltAction ? '击针螺旋主簧' : '主螺旋复进簧',
      calloutLabelEn: isBoltAction ? 'Bolt Striker Spring' : 'Recoil Return Spring',
      roleTagZh: '复进储能',
      roleTagEn: 'Cycle Return',
      descZh: isBoltAction
        ? '旋转拉栓时压缩储能，扣扳机瞬间释放以毫秒级击发时间撞击底火。'
        : '吸收自动机后坐能量并驱动枪机框高速复进，完成连续推弹上膛与闭锁。',
      descEn: isBoltAction
        ? 'Compresses on bolt lift and snaps forward with rapid lock time upon trigger release.'
        : 'Absorbs carrier recoil energy and powers smooth forward chambering and lockup.',
    },
    handguard: {
      material: bp.cad.hasWoodFurniture ? 'polymer_frame' : 'nitride_steel',
      nameZh: bp.cad.hasWoodFurniture
        ? '经典实木隔热前护木'
        : isPump
          ? '防滑罗纹往复泵动前护木'
          : '战术散热护木与隔热罩',
      nameEn: bp.cad.hasWoodFurniture
        ? 'Classic Hardwood Forend Handguard'
        : isPump
          ? 'Ribbed Reciprocating Pump Forend'
          : 'Ventilated Tactical Handguard',
      calloutLabelZh: bp.cad.hasWoodFurniture
        ? '实木前护木'
        : isPump
          ? '泵动滑动护木'
          : '战术散热护木',
      calloutLabelEn: bp.cad.hasWoodFurniture
        ? 'Hardwood Forend'
        : isPump
          ? 'Pump Forend Slide'
          : 'Tactical Handguard',
      roleTagZh: isPump ? '手动抽拉' : '隔热握持',
      roleTagEn: isPump ? 'Manual Cycling' : 'Heat Shield',
      descZh: isPump
        ? '通过双钢连杆直连枪机滑架，前后拉推即可干脆利落完成退壳上膛。'
        : '隔绝连发高温枪管热辐射，提供稳定前手支撑与附件挂载空间。',
      descEn: isPump
        ? 'Coupled via twin action bars to the bolt carrier for brisk manual shell cycling.'
        : 'Insulates the support hand from barrel heat while bracing steady forward control.',
    },
    stock: {
      material: 'polymer_frame',
      nameZh: isHeavyMg
        ? '后置双铲形握把与缓冲尾板'
        : bp.cad.hasWoodFurniture
          ? '经典胡桃/桦木定型枪托'
          : isBullpup
            ? '无托减震橡胶抵肩托板'
            : '战术固定/可折叠抵肩枪托',
      nameEn: isHeavyMg
        ? 'Twin Spade Grips & Buffer Backplate'
        : bp.cad.hasWoodFurniture
          ? 'Classic Hardwood Rifle Buttstock'
          : isBullpup
            ? 'Bullpup Recoil-Pad Buttplate'
            : 'Tactical Rifle Buttstock',
      calloutLabelZh: isHeavyMg
        ? '双铲形握把尾板'
        : bp.cad.hasWoodFurniture
          ? '实木抵肩枪托'
          : '战术抵肩枪托',
      calloutLabelEn: isHeavyMg
        ? 'Twin Spade Grips'
        : bp.cad.hasWoodFurniture
          ? 'Hardwood Buttstock'
          : 'Tactical Buttstock',
      roleTagZh: '抵肩传力',
      roleTagEn: 'Recoil Transfer',
      descZh: `将 ${bp.recoilImpulseNs} N·s 后坐冲量平稳导至肩窝或三脚架基座，维持精准瞄准视线。`,
      descEn: `Channels ${bp.recoilImpulseNs} N·s recoil impulse evenly into the shoulder or mount for steady sight recovery.`,
    },
    grip: {
      material: 'polymer_frame',
      nameZh: isHeavyMg
        ? '右侧防烫快换枪管提把'
        : isLever
          ? '经典直握颈与下压指环杠杆'
          : '人体工学防滑主握把',
      nameEn: isHeavyMg
        ? 'Heavy Quick-Change Barrel Handle'
        : isLever
          ? 'Straight Wrist Grip & Finger Loop'
          : 'Ergonomic Checkered Pistol Grip',
      calloutLabelZh: isHeavyMg
        ? '快换枪管提把'
        : isLever
          ? '握颈与指环杠杆'
          : '人体工学主握把',
      calloutLabelEn: isHeavyMg
        ? 'Barrel Carry Handle'
        : isLever
          ? 'Grip & Finger Lever'
          : 'Ergonomic Main Grip',
      roleTagZh: '人机操控',
      roleTagEn: 'Firing Control',
      descZh: `提供清晰触发手指角度与稳固防滑抓握力，适配连续射击操控。`,
      descEn: `Positions the firing hand cleanly for consistent trigger reach and recoil stability.`,
    },
    optic: {
      material: 'nitride_steel',
      nameZh: bp.cad.hasOptic
        ? '精密光学瞄准镜与高强镜环'
        : bp.cad.hasCarryHandle
          ? '一体化提把与翻转觇孔照门'
          : '可调表尺机械照门与护翼准星',
      nameEn: bp.cad.hasOptic
        ? 'Precision Optical Scope & Mount'
        : bp.cad.hasCarryHandle
          ? 'Integral Carry Handle & Aperture Sight'
          : 'Adjustable Tangent Iron Sights',
      calloutLabelZh: bp.cad.hasOptic
        ? '精密光学瞄准镜'
        : bp.cad.hasCarryHandle
          ? '提把与觇孔照门'
          : '机械表尺照门',
      calloutLabelEn: bp.cad.hasOptic
        ? 'Precision Optic Scope'
        : bp.cad.hasCarryHandle
          ? 'Carry Handle & Sight'
          : 'Adjustable Iron Sights',
      roleTagZh: '瞄准分划',
      roleTagEn: 'Sighting System',
      descZh: `覆盖 ${bp.effectiveRangeM} 米有效射程分划标定，确保快速捕获与精准命中。`,
      descEn: `Graduated across the ${bp.effectiveRangeM} m effective range envelope for rapid, accurate sighting.`,
    },
    gas_system: {
      material: 'stainless',
      nameZh: isDi
        ? '斯通纳直推不锈钢导气管'
        : isBlowback
          ? '缓冲器与延迟闭锁导槽组'
          : isBoltAction || isPump || isLever
            ? '手动导轨锁止与退壳挺组件'
            : '导气箍、调气阀与导气活塞组',
      nameEn: isDi
        ? 'Stoner Direct-Impingement Gas Tube'
        : isBlowback
          ? 'Recoil Buffer & Delay Cam Track'
          : isBoltAction || isPump || isLever
            ? 'Manual Action Rails & Ejector Stop'
            : 'Gas Block, Regulator & Piston Rod',
      calloutLabelZh: isDi
        ? '直推不锈钢导气管'
        : isBlowback
          ? '缓冲与延迟导槽'
          : isBoltAction || isPump || isLever
            ? '导轨与退壳挺'
            : '导气箍与活塞组',
      calloutLabelEn: isDi
        ? 'Direct Gas Tube'
        : isBlowback
          ? 'Delay Cam & Buffer'
          : isBoltAction || isPump || isLever
            ? 'Action Rails & Ejector'
            : 'Gas Block & Piston',
      roleTagZh: isBlowback || isBoltAction || isPump || isLever ? '缓冲限位' : '导气驱动',
      roleTagEn: isBlowback || isBoltAction || isPump || isLever ? 'Motion Guidance' : 'Gas Operation',
      descZh: isDi
        ? '将枪管高压燃气直导机匣内部枪机框膨胀气室，减轻前部运动质量。'
        : isBlowback
          ? '控制无导气孔自动机的开锁延迟与尾端缓冲吸能。'
          : isBoltAction || isPump || isLever
            ? '精密导向手动循环运动轨迹并在后止点干净弹出空弹壳。'
            : '从枪管导气孔引出高压火药燃气推动活塞，向自动机提供充沛循环能量。',
      descEn: isDi
        ? 'Routes high-pressure bore gas straight into the internal carrier expansion chamber.'
        : isBlowback
          ? 'Regulates blowback delay timing and cushions rearward bolt-carrier travel.'
          : isBoltAction || isPump || isLever
            ? 'Guides manual cycling cleanly and kicks fired brass clear at rear stroke.'
            : 'Taps bore propellant gas to drive the piston and power reliable automatic cycling.',
    },
    mount_rail: {
      material: 'nitride_steel',
      nameZh: bp.cad.hasBipod
        ? '折叠式战术两脚架与导轨座'
        : '皮卡汀尼战术导轨与附件接口',
      nameEn: bp.cad.hasBipod
        ? 'Folding Tactical Bipod & Rail Mount'
        : 'Accessory Rail & Sling Interface',
      calloutLabelZh: bp.cad.hasBipod ? '折叠战术两脚架' : '战术导轨接口',
      calloutLabelEn: bp.cad.hasBipod ? 'Folding Bipod Mount' : 'Tactical Rail Mount',
      roleTagZh: bp.cad.hasBipod ? '卧姿支撑' : '模块化挂载',
      roleTagEn: bp.cad.hasBipod ? 'Prone Stability' : 'Modular Mount',
      descZh: bp.cad.hasBipod
        ? '在阵地卧姿与远距压制射击时提供稳固三点支撑，大幅收敛散布。'
        : '用于零归零偏移安装白光瞄具、激光指示器或枪带附件。',
      descEn: bp.cad.hasBipod
        ? 'Stabilizes prone precision or sustained automatic bursts across long sightlines.'
        : 'Maintains repeatable zero for optics, illuminators, and sling hardware.',
    },
    trigger: {
      material: 'nitride_steel',
      nameZh: isHeavyMg ? '尾板蝶形拇指击发扳机' : '两道火精密扳机与阻铁连杆',
      nameEn: isHeavyMg
        ? 'Backplate Butterfly Thumb Trigger'
        : 'Two-Stage Trigger & Sear Linkage',
      calloutLabelZh: isHeavyMg ? '蝶形拇指扳机' : '扳机与阻铁连杆',
      calloutLabelEn: isHeavyMg ? 'Butterfly Trigger' : 'Trigger & Sear Bar',
      roleTagZh: '两道火控',
      roleTagEn: 'Trigger Control',
      descZh: `清晰分离预压行程与击发释放点，配合断连器精准控制单发与连发。`,
      descEn: `Separates take-up cleanly from crisp sear break alongside the semi-auto disconnector.`,
    },
    hammer: {
      material: 'stainless',
      nameZh:
        bp.kinematicLaw === 'open_bolt_blowback'
          ? '固定式开膛击针与阻铁钩'
          : isBoltAction
            ? '直线惯性撞针与尾盖指示销'
            : '回转击锤与防惯性击针组',
      nameEn:
        bp.kinematicLaw === 'open_bolt_blowback'
          ? 'Open-Bolt Fixed Firing Pin'
          : isBoltAction
            ? 'Linear Striker & Cocking Indicator'
            : 'Pivoting Hammer & Firing Pin',
      calloutLabelZh:
        bp.kinematicLaw === 'open_bolt_blowback'
          ? '开膛固定击针'
          : isBoltAction
            ? '直线撞针尾销'
            : '回转击锤与击针',
      calloutLabelEn:
        bp.kinematicLaw === 'open_bolt_blowback'
          ? 'Open-Bolt Striker'
          : isBoltAction
            ? 'Linear Firing Pin'
            : 'Hammer & Firing Pin',
      roleTagZh: '撞击底火',
      roleTagEn: 'Primer Ignition',
      descZh: `仅在枪机完全闭锁到位后释放打击能引燃 ${cal} 底火。`,
      descEn: `Delivers clean primer ignition exclusively once the bolt reaches full lockup.`,
    },
    hammer_spring: {
      material: 'spring_steel',
      nameZh: '双股扭转击锤主簧与断连簧',
      nameEn: 'Torsion Hammer & Disconnector Spring',
      calloutLabelZh: '击锤扭转主簧',
      calloutLabelEn: 'Hammer Mainspring',
      roleTagZh: '击发储能',
      roleTagEn: 'Ignition Energy',
      descZh: `为击锤提供迅猛角加速度以缩短击发时间并防止严寒迟发。`,
      descEn: `Drives fast hammer lock time and reliable ignition across temperature extremes.`,
    },
    selector: {
      material: 'copper_accent',
      nameZh: isBoltAction || isPump || isLever
        ? '手动机械保险拨杆与阻铁锁'
        : 'SAFE / SEMI / AUTO 快慢机轴',
      nameEn:
        isBoltAction || isPump || isLever
          ? 'Manual Mechanical Safety Lever'
          : 'SAFE / SEMI / AUTO Fire Selector',
      calloutLabelZh:
        isBoltAction || isPump || isLever ? '手动机械保险' : '三档快慢机轴',
      calloutLabelEn:
        isBoltAction || isPump || isLever ? 'Manual Safety' : 'Fire Mode Selector',
      roleTagZh: '安全火控',
      roleTagEn: 'Fire Control Safety',
      descZh:
        isBoltAction || isPump || isLever
          ? '机械锁止击针或扳机阻铁，确保携行与装填操作绝对安全。'
          : '在保险锁死、单发断连截获与全自动连发三档火控状态之间清脆切换。',
      descEn:
        isBoltAction || isPump || isLever
          ? 'Mechanically blocks the striker or sear for safe administrative handling.'
          : 'Indexes crisply between safe lock, semi-auto disconnector catch, and automatic fire.',
    },
    mag_body: resolveFeedAssembly(bp, 'mag_body'),
    follower: resolveFeedAssembly(bp, 'follower'),
    mag_spring: resolveFeedAssembly(bp, 'mag_spring'),
    mag_base: resolveFeedAssembly(bp, 'mag_base'),
  };

  return makeMeta(slot, map[slot]);
}

/**
 * Resolves authentic, archetype-tailored bilingual part nomenclature for any
 * of the 66 Centennial exhibits and 20 canonical structural slots.
 */
export function resolveCentennialPartMeta(
  bp: CentennialWeaponBlueprint,
  slot: CentennialPartSlot
): CentennialPartSlotMeta {
  if (bp.category === 'armor') {
    return resolveMbtSlotMeta(bp, slot);
  }
  if (bp.category === 'ordnance') {
    return resolveOrdnanceSlotMeta(bp, slot);
  }
  if (bp.category === 'archery') {
    return resolveArcherySlotMeta(bp, slot);
  }
  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    return resolveRevolverSlotMeta(bp, slot);
  }
  if (
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle'
  ) {
    return resolvePistolSlotMeta(bp, slot);
  }
  return resolveStandardSmallArmSlotMeta(bp, slot);
}

/**
 * Resolves the 4 canonical `AssemblyGroupMeta` sections (`slide`, `frame`,
 * `fire_control`, `magazine`) tailored cleanly to each Centennial weapon class.
 */
export function resolveCentennialGroupMetas(
  bp: CentennialWeaponBlueprint
): AssemblyGroupMeta[] {
  if (bp.category === 'armor') {
    const isCarousel = bp.kinematicLaw === 'tank_carousel';
    return [
      {
        key: 'slide',
        nameZh: '装甲炮塔、主炮身管与滑楔炮闩组',
        nameEn: 'Armored Turret, Main Cannon & Breech',
        badgeColor: '#0ea5e9',
      },
      {
        key: 'frame',
        nameZh: '复合装甲车体、履带行走与周视观瞄组',
        nameEn: 'Armored Hull, Tracks & CITV Optics',
        badgeColor: '#65a30d',
      },
      {
        key: 'fire_control',
        nameZh: '双向稳定火控与主炮电击发组',
        nameEn: 'Stabilized FCS & Electric Firing Group',
        badgeColor: '#d97706',
      },
      {
        key: 'magazine',
        nameZh: isCarousel
          ? '底置转盘自动装弹机与 V12 动力包'
          : '装甲隔离弹药架与 V12 动力包',
        nameEn: isCarousel
          ? 'Carousel Autoloader & V12 Powerpack'
          : 'Armored Ammo Stowage & V12 Powerpack',
        badgeColor: '#e11d48',
      },
    ];
  }

  if (bp.category === 'ordnance') {
    const isRotary = bp.archetype === 'rotary_cannon';
    return [
      {
        key: 'slide',
        nameZh: isRotary
          ? '六管旋转炮管簇、凸轮机匣与转子枪机组'
          : '重型火炮身管、反后坐摇架与炮闩组',
        nameEn: isRotary
          ? '6-Barrel Rotary Cluster, Cam & Bolts'
          : 'Heavy Ordnance Tube, Recoil & Breech',
        badgeColor: '#0ea5e9',
      },
      {
        key: 'frame',
        nameZh: isRotary
          ? '机载支架、液压马达与雷达火控接口'
          : '炮架底盘、平衡机与防空/数字瞄具组',
        nameEn: isRotary
          ? 'Airframe Mount, Hydraulic Drive & FCS'
          : 'Carriage Trails, Equilibrator & Sights',
        badgeColor: '#7c3aed',
      },
      {
        key: 'fire_control',
        nameZh: '重炮电控/拉火击发与安全联锁组',
        nameEn: 'Ordnance Firing Control & Safety Lock',
        badgeColor: '#d97706',
      },
      {
        key: 'magazine',
        nameZh: isRotary
          ? '无链闭环螺旋弹鼓与星轮输弹组'
          : '重弹供输漏斗/分装弹托与退壳槽',
        nameEn: isRotary
          ? 'Linkless Helical Drum & Sprocket Feed'
          : 'Ordnance Feed Hopper / Tray & Ejection',
        badgeColor: '#e11d48',
      },
    ];
  }

  if (bp.category === 'archery') {
    const isLongbow = bp.archetype === 'bow_longbow';
    return [
      {
        key: 'slide',
        nameZh: isLongbow
          ? '紫杉单体弓身、弹性弓臂与战箭组'
          : '弓把/箭道、储能弓片与凸轮弓弦组',
        nameEn: isLongbow
          ? 'Self-Yew Stave, Flexing Limbs & War Arrow'
          : 'Riser/Rail, Power Limbs, Cams & String',
        badgeColor: '#0284c7',
      },
      {
        key: 'frame',
        nameZh: '握持手柄、光学瞄具与分弦/上弦机构',
        nameEn: 'Grip, Sighting Optics & Cable/Crank System',
        badgeColor: '#7c3aed',
      },
      {
        key: 'fire_control',
        nameZh: '精密撒放器/扳机与防空放安全联锁',
        nameEn: 'Release / Trigger & Anti-Dry-Fire Lock',
        badgeColor: '#d97706',
      },
      {
        key: 'magazine',
        nameZh: '快拆箭壶、减震卡箭夹与护箭帽',
        nameEn: 'Quick-Detach Quiver & Broadhead Hood',
        badgeColor: '#e11d48',
      },
    ];
  }

  if (bp.archetype === 'revolver_sa' || bp.archetype === 'revolver_da') {
    return [
      {
        key: 'slide',
        nameZh: '顶梁底把、线膛枪管与棘轮分度机构',
        nameEn: 'Topstrap Frame, Barrel & Ratchet Indexing',
        badgeColor: '#0284c7',
      },
      {
        key: 'frame',
        nameZh: '配重下挂套、握把贴片与机械瞄具组',
        nameEn: 'Underlug, Grip Panels & Iron Sights',
        badgeColor: '#7c3aed',
      },
      {
        key: 'fire_control',
        nameZh: '外露滚花击锤、扳机阻铁与主簧火控',
        nameEn: 'Exposed Hammer, Trigger & Mainspring FCG',
        badgeColor: '#d97706',
      },
      {
        key: 'magazine',
        nameZh: `${bp.magCapacity} 发开槽转轮弹巢与星形抽壳器`,
        nameEn: `${bp.magCapacity}-Shot Fluted Cylinder & Star Extractor`,
        badgeColor: '#e11d48',
      },
    ];
  }

  if (
    bp.archetype === 'pistol_slide' ||
    bp.archetype === 'pistol_broomhandle'
  ) {
    return [
      {
        key: 'slide',
        nameZh: '锻钢套筒、线膛枪管与闭锁复进组',
        nameEn: 'Forged Slide, Barrel & Locking Assembly',
        badgeColor: '#0284c7',
      },
      {
        key: 'frame',
        nameZh: '手枪底把、滑轨导槽与三点瞄具组',
        nameEn: 'Lower Frame, Slide Rails & Iron Sights',
        badgeColor: '#7c3aed',
      },
      {
        key: 'fire_control',
        nameZh: '击锤/扳机连杆与手动解脱保险组',
        nameEn: 'Hammer, Trigger Bar & Safety Decocker',
        badgeColor: '#d97706',
      },
      {
        key: 'magazine',
        nameZh: `${bp.magCapacity} 发 ${bp.caliberLabel} 盒式弹匣组`,
        nameEn: `${bp.magCapacity}-Rd ${bp.caliberLabel} Magazine`,
        badgeColor: '#e11d48',
      },
    ];
  }

  const magNameZh =
    bp.cad.magStyle === 'belt'
      ? '金属弹链供弹盒与拨弹棘爪组'
      : bp.cad.magStyle === 'pan'
        ? `${bp.magCapacity} 发顶置圆盘弹匣组`
        : bp.cad.magStyle === 'drum'
          ? `${bp.magCapacity} 发大容弹鼓/螺旋弹筒`
          : bp.cad.magStyle === 'tube'
            ? `${bp.magCapacity} 发下置管状弹仓组`
            : `${bp.magCapacity} 发 ${bp.caliberLabel} 供弹组`;

  const magNameEn =
    bp.cad.magStyle === 'belt'
      ? 'Metallic Belt Feed Tray & Pawls'
      : bp.cad.magStyle === 'pan'
        ? `${bp.magCapacity}-Rd Top Pan Magazine`
        : bp.cad.magStyle === 'drum'
          ? `${bp.magCapacity}-Rd Drum / Helical Mag`
          : bp.cad.magStyle === 'tube'
            ? `${bp.magCapacity}-Rd Tubular Magazine`
            : `${bp.magCapacity}-Rd ${bp.caliberLabel} Feed Group`;

  return [
    {
      key: 'slide',
      nameZh: '承力机匣、精密枪管与自动闭锁枪机组',
      nameEn: 'Receiver, Precision Barrel & Bolt Group',
      badgeColor: '#0284c7',
    },
    {
      key: 'frame',
      nameZh: '护木枪托、导气/缓冲系统与瞄具导轨',
      nameEn: 'Furniture, Operating System & Sights',
      badgeColor: '#7c3aed',
    },
    {
      key: 'fire_control',
      nameZh: '两道火扳机、击锤撞针与快慢机火控组',
      nameEn: 'Two-Stage Trigger, Hammer & Selector FCG',
      badgeColor: '#d97706',
    },
    {
      key: 'magazine',
      nameZh: magNameZh,
      nameEn: magNameEn,
      badgeColor: '#e11d48',
    },
  ];
}

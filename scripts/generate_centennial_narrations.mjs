#!/usr/bin/env node
/**
 * Digital Armory 3D — Deterministic Bilingual 4-Act + 20-Part Narration Generator
 *
 * Generates `WeaponNarrationBundle` JSON files (`schemaVersion: 1`, `audioUrl: ""`)
 * for Centennial Expansion exhibits (`BAY-35..BAY-100`) so every new exhibit ships
 * with a rich bilingual 4-Act documentary, 3 engineering breakthroughs, 5 milestones,
 * complete `uiMetaEn` (4 timeline presets + 7 firing phases), and all 20 canonical
 * part voice scripts ready for zero-404 Web Speech API narration playback.
 *
 * Usage:
 *   node scripts/generate_centennial_narrations.mjs --dry-run
 *   node scripts/generate_centennial_narrations.mjs --out-dir public/narrations
 *   node scripts/generate_centennial_narrations.mjs --only uzi,m200 --out-dir /tmp/narr
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
export const DEFAULT_REPO_ROOT = path.resolve(SCRIPT_DIR, '..');
export const DEFAULT_GENERATED_AT = '2026-11-25T00:00:00.000Z';

export const CJK_OR_FULLWIDTH_RE =
  /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;
export const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

/** Canonical 20 part slots matching `centennialGeometryFactory` & `centennialPluginFactory`. */
export const CANONICAL_20_PART_SLOTS = Object.freeze([
  { slot: 'receiver', bomCode: 'U-01', group: 'slide' },
  { slot: 'barrel', bomCode: 'U-02', group: 'slide' },
  { slot: 'muzzle', bomCode: 'U-03', group: 'slide' },
  { slot: 'bolt_carrier', bomCode: 'U-04', group: 'slide' },
  { slot: 'bolt', bomCode: 'U-05', group: 'slide' },
  { slot: 'recoil_spring', bomCode: 'U-06', group: 'slide' },
  { slot: 'handguard', bomCode: 'F-01', group: 'frame' },
  { slot: 'stock', bomCode: 'F-02', group: 'frame' },
  { slot: 'grip', bomCode: 'F-03', group: 'frame' },
  { slot: 'optic', bomCode: 'F-04', group: 'frame' },
  { slot: 'gas_system', bomCode: 'F-05', group: 'frame' },
  { slot: 'mount_rail', bomCode: 'F-06', group: 'frame' },
  { slot: 'trigger', bomCode: 'T-01', group: 'fire_control' },
  { slot: 'hammer', bomCode: 'T-02', group: 'fire_control' },
  { slot: 'hammer_spring', bomCode: 'T-03', group: 'fire_control' },
  { slot: 'selector', bomCode: 'T-04', group: 'fire_control' },
  { slot: 'mag_body', bomCode: 'M-01', group: 'magazine' },
  { slot: 'follower', bomCode: 'M-02', group: 'magazine' },
  { slot: 'mag_spring', bomCode: 'M-03', group: 'magazine' },
  { slot: 'mag_base', bomCode: 'M-04', group: 'magazine' },
]);

const CATALOG_MODULES = Object.freeze([
  { file: 'riflesAndLmgs.ts', exportName: 'RIFLES_AND_LMGS_BLUEPRINTS' },
  { file: 'smgsAndSnipers.ts', exportName: 'SMGS_AND_SNIPERS_BLUEPRINTS' },
  { file: 'shotgunsAndPistols.ts', exportName: 'SHOTGUNS_AND_PISTOLS_BLUEPRINTS' },
  {
    file: 'archeryArmorOrdnance.ts',
    exportName: 'ARCHERY_ARMOR_ORDNANCE_BLUEPRINTS',
  },
]);

const FINISH_MATERIALS = Object.freeze({
  blued_steel: {
    zh: '高温发蓝锻造合金钢',
    en: 'hot-salt blued forged alloy steel',
  },
  parkerized: {
    zh: '磷酸锰军规磷化钢',
    en: 'manganese-phosphate Parkerized ordnance steel',
  },
  stainless: {
    zh: '416R 精密拉丝不锈钢',
    en: 'precision-machined 416R stainless steel',
  },
  fde: {
    zh: '沙色陶瓷涂层航空铝合金与氮化钢',
    en: 'Flat Dark Earth Cerakote 7075 aluminum and nitrided steel',
  },
  od_green: {
    zh: '橄榄绿军规防腐涂层钢与增强聚合物',
    en: 'OD-green protective-coated steel and reinforced polymer',
  },
  bakelite_ak: {
    zh: '苏联烤漆冲压钢与酚醛玻璃纤维电木',
    en: 'Soviet-enamel stamped steel and glass-filled Bakelite',
  },
  walnut_classic: {
    zh: '发蓝锻钢与油润精选胡桃木/桦木托',
    en: 'blued forged ordnance steel paired with oil-finished walnut',
  },
  tactical_black: {
    zh: '硬质阳极氧化铝合金、氮化钢与高强度聚合物',
    en: 'hard-coat anodized aluminum, nitrided steel, and reinforced polymer',
  },
  desert_carc: {
    zh: '沙漠 CARC 抗化学涂层复合装甲钢',
    en: 'desert CARC chemical-resistant composite armor steel',
  },
  nato_camo: {
    zh: '北约三色低红外涂装复合装甲钢',
    en: 'NATO three-tone low-IR composite armor steel',
  },
  russian_green: {
    zh: '俄军墨绿特种涂装均质轧制与爆反装甲钢',
    en: 'Russian dark-green rolled homogeneous and ERA armor steel',
  },
  wwii_soviet: {
    zh: '战时 4BO 橄榄绿轧制焊接与铸造装甲钢',
    en: 'wartime 4BO olive-green rolled and cast armor steel',
  },
  titanium_matte: {
    zh: '哑光航空级钛合金与高强度 CNC 铝合金',
    en: 'matte aerospace titanium alloy and billet aluminum',
  },
  yew_wood: {
    zh: '自然风干紫杉木心材/边材复合层压坯料',
    en: 'seasoned heartwood-and-sapwood European yew laminate',
  },
  carbon_camo: {
    zh: '高模量单向碳纤维铺层与 CNC 阳极氧化铝合金',
    en: 'high-modulus unidirectional carbon fiber and CNC anodized aluminum',
  },
});

const CATEGORY_LABELS_EN = Object.freeze({
  rifle: 'Assault & Battle Rifle',
  lmg: 'Machine Gun',
  smg: 'Submachine Gun',
  sniper: 'Sniper Rifle',
  shotgun: 'Combat Shotgun',
  pistol: 'Handgun',
  archery: 'Archery & Crossbow',
  armor: '1:1 Main Battle Tank',
  ordnance: 'Aviation & Heavy Ordnance',
});

const KINEMATIC_DESCRIPTORS = Object.freeze({
  long_stroke_piston: {
    milestoneEn: 'Long-Stroke Unlock',
    zh: '长行程导气活塞带动枪机框完成自由行程并驱动旋转闭锁解锁',
    en: 'long-stroke gas piston drives carrier free-travel before cam-rotating the locking bolt',
  },
  direct_impingement: {
    milestoneEn: 'Gas Tube Unlock',
    zh: '导气管将高压火药燃气直引机框内气室，推动多突笋枪机旋转开锁',
    en: 'direct gas tube vents propellant pressure into the internal carrier piston to rotate the multi-lug bolt',
  },
  short_stroke_piston: {
    milestoneEn: 'Short-Stroke Pulse',
    zh: '独立短行程活塞瞬时脉冲撞击枪机框，将热负荷与振源隔离在机匣前方',
    en: 'independent short-stroke piston delivers a clean impulse while isolating heat forward of the receiver',
  },
  roller_delayed: {
    milestoneEn: 'Roller Retraction',
    zh: '对称双闭锁滚柱受斜面力学杠杆约束延迟后退，待膛压安全后再整体后坐',
    en: 'twin locking rollers delay breech opening through angled mechanical disadvantage until pressure drops',
  },
  lever_delayed: {
    milestoneEn: 'Lever Retardation',
    zh: '不等臂延迟杠杆放大机框惯性阻力，延缓弹壳初抽直至膛压跌入安全窗口',
    en: 'unequal-arm delay lever multiplies carrier inertia to hold breech lockup during peak chamber pressure',
  },
  tilting_bolt: {
    milestoneEn: 'Bolt Tilt Unlock',
    zh: '导气机框斜面抬起闭锁块尾部脱离机匣闭锁肩，实现直线抽壳抛壳',
    en: 'carrier cam ramps lift the tilting bolt tail clear of the receiver locking shoulder for extraction',
  },
  open_bolt_blowback: {
    milestoneEn: 'Open-Bolt Slam',
    zh: '重型枪机自后方阻铁释放前冲完成推弹、闭膛与惯性击发循环',
    en: 'heavy open bolt strips a cartridge on its forward lunge and fires via fixed-pin inertia',
  },
  closed_bolt_blowback: {
    milestoneEn: 'Blowback Cycle',
    zh: '闭膛击发后弹壳底缘克服枪机质量与复进簧阻力直线后坐完成抽抛',
    en: 'closed-bolt firing relies on breechblock inertia and recoil spring tension to cycle reliably',
  },
  browning_tilt_barrel: {
    milestoneEn: 'Barrel Tilt Unlock',
    zh: '枪管与套筒短距共同后坐后由下凸耳引导枪管尾端下倾脱离闭锁槽',
    en: 'barrel and slide recoil locked together before the lower cam lug tilts the breech downward to unlock',
  },
  falling_block_pistol: {
    milestoneEn: 'Locking Block Drop',
    zh: '枪管保持直线短后坐，下方卡铁块在解锁销驱动下垂直下沉释放套筒',
    en: 'straight-line barrel recoil actuates a falling locking block that drops clear of the slide recesses',
  },
  bolt_action: {
    milestoneEn: 'Manual Bolt Cycle',
    zh: '射手手动旋转枪机手柄使刚性闭锁突笋脱槽，向后抽抛并推进新弹入膛',
    en: 'manual bolt rotation disengages rigid locking lugs before rearward extraction and forward chambering',
  },
  pump_action: {
    milestoneEn: 'Twin-Bar Pump',
    zh: '护木双联动拉杆向后拉动枪机托架使闭锁楔块降落，完成抽抛与托弹上膛',
    en: 'dual action bars draw the slide carrier rearward to drop the locking block and lift the next shell',
  },
  lever_action: {
    milestoneEn: 'Lever Throw Cycle',
    zh: '扳机护圈杠杆下摆驱动闭锁块解锁并牵引载弹托板将新弹升至弹膛轴线',
    en: 'pivoting finger lever unlocks the breechblock and elevates the next round smoothly onto the bore axis',
  },
  revolver_cylinder: {
    milestoneEn: 'Cylinder Indexing',
    zh: '扣动扳机联动拨轮棘爪精准转动转轮巢室并与枪管轴线刚性锁止对齐',
    en: 'trigger and hand pawl index the fluted cylinder cleanly into locked alignment with the forcing cone',
  },
  compound_bow: {
    milestoneEn: 'Cam Peak & Let-Off',
    zh: '偏心双凸轮滑轮组储存弯片弹性势能，满拉后进入低拉力省力谷底等待撒放',
    en: 'eccentric cams load elastic limb energy and roll over into a high-let-off valley before release',
  },
  recurve_crossbow: {
    milestoneEn: 'Power-Stroke Launch',
    zh: '反曲高张力弩片在扳机释放瞬间沿箭道爆发弹性势能加速碳纤弩箭',
    en: 'high-tension recurve limbs discharge stored elastic energy down the machined rail upon trigger break',
  },
  self_longbow: {
    milestoneEn: 'Yew Stave Release',
    zh: '紫杉木心材受压、边材受拉协同储能在撒放瞬间将重箭推向抛物弹道',
    en: 'heartwood compression and sapwood tension unwind simultaneously to drive a heavy bodkin arrow',
  },
  tank_carousel: {
    milestoneEn: 'Autoloader Ramming',
    zh: '底置转盘自动装弹机自动提升定装/分装炮弹与药筒推入滑膛炮闩闭锁',
    en: 'hull carousel autoloader hoists and rams projectile and propellant charge into the vertical wedge breech',
  },
  tank_manual: {
    milestoneEn: 'Breech Lock & Recoil',
    zh: '主炮发射后液压驻退复进机吸收巨额炮膛后坐并自动开闩抛壳待装',
    en: 'hydropneumatic recoil cylinders damp main-gun impulse and semi-automatically open the sliding breech',
  },
  rotary_gatling: {
    milestoneEn: 'Rotary Cam Firing',
    zh: '六管旋转簇与 360° 螺旋凸轮轨道同步完成供弹、闭锁、电击发与抽壳循环',
    en: 'six rotating barrels follow a stationary 360-degree helical cam track for continuous firing cycles',
  },
  aa_sliding_wedge: {
    milestoneEn: 'Recoil Wedge Cycle',
    zh: '长后坐炮管复进过程中自动驱动立楔炮闩并由顶部弹夹连续重力供弹',
    en: 'long-recoil barrel runout cycles the vertical sliding breech and feeds continuous 4-round top clips',
  },
  artillery_howitzer: {
    milestoneEn: 'Hydro-Pneumatic Recoil',
    zh: '螺式炮闩闭锁 155mm 高压药室，发射后液气驻退机经钛合金大架导力入地',
    en: 'interrupted-screw breech seals 155mm chamber pressure while hydropneumatic buffers anchor recoil into titanium trails',
  },
});

function clampCalloutEn(label) {
  const clean = String(label).replace(/\s+/g, ' ').trim();
  if (clean.length <= 32) return clean;
  return `${clean.slice(0, 31).trimEnd()}.`;
}

function getArchetypeFamily(bp) {
  const a = bp.archetype;
  if (a === 'mbt_modern' || a === 'mbt_wwii') return 'mbt';
  if (a === 'rotary_cannon') return 'rotary';
  if (a === 'aa_autocannon') return 'autocannon';
  if (a === 'howitzer') return 'howitzer';
  if (a === 'bow_compound') return 'bow_compound';
  if (a === 'crossbow_recurve') return 'crossbow';
  if (a === 'bow_longbow') return 'longbow';
  if (a === 'revolver_sa' || a === 'revolver_da') return 'revolver';
  if (a === 'pistol_slide' || a === 'pistol_broomhandle') return 'pistol';
  if (a === 'shotgun_pump' || a === 'shotgun_auto' || a === 'shotgun_lever') {
    return 'shotgun';
  }
  if (a === 'lmg_belt' || a === 'lmg_pan' || a === 'heavy_mg') return 'lmg';
  if (a === 'sniper_bolt' || a === 'sniper_bullpup' || a === 'sniper_dmr') {
    return 'sniper';
  }
  if (a === 'smg_tube' || a === 'smg_drum' || a === 'smg_pdw') return 'smg';
  return 'rifle';
}

function describeMuzzleSlot(bp, family) {
  if (family === 'mbt') {
    return {
      nameZh: '抽烟装置与炮口基准镜',
      nameEn: 'Bore Evacuator & Muzzle Reference',
      calloutEn: 'Bore Evacuator & MRS',
      roleZh: '炮膛排烟与热弯校准',
      roleEn: 'Fume Extractor & Alignment',
    };
  }
  if (family === 'rotary') {
    return {
      nameZh: '六管前端束箍与膛口夹环',
      nameEn: '6-Barrel Front Clamp Collar',
      calloutEn: '6-Barrel Front Clamp',
      roleZh: '多管同心度锁定',
      roleEn: 'Cluster Alignment Clamp',
    };
  }
  if (family === 'autocannon' || family === 'howitzer') {
    return {
      nameZh: '重型多室炮口制退器',
      nameEn: 'Heavy Multi-Baffle Muzzle Brake',
      calloutEn: 'Heavy Muzzle Brake',
      roleZh: '巨额后坐能量泄压',
      roleEn: 'Recoil Impulse Mitigation',
    };
  }
  if (family === 'bow_compound' || family === 'crossbow' || family === 'longbow') {
    return {
      nameZh: family === 'longbow' ? '弓梢牛角弦槽组件' : '前端减震与脚蹬/箭台组件',
      nameEn:
        family === 'longbow'
          ? 'Horn Tip Nocks Assembly'
          : 'Front Stirrup & Arrow Launcher',
      calloutEn:
        family === 'longbow' ? 'Horn Tip Nocks' : 'Front Rest & Stirrup',
      roleZh: '弦梢定位与撒放导向',
      roleEn: 'Launch Alignment Interface',
    };
  }
  switch (bp.cad.muzzleStyle) {
    case 'suppressor':
      return {
        nameZh: '多室消音器与膛口耦合节',
        nameEn: 'Multi-Baffle Acoustic Suppressor',
        calloutEn: 'Acoustic Suppressor',
        roleZh: '火药燃气降噪消焰',
        roleEn: 'Acoustic & Flash Attenuation',
      };
    case 'brake':
      return {
        nameZh: '高效多室膛口制退器',
        nameEn: 'Multi-Chamber Muzzle Brake',
        calloutEn: 'Muzzle Recoil Brake',
        roleZh: '侧向导气抑跳制退',
        roleEn: 'Lateral Gas Recoil Control',
      };
    case 'shroud':
      return {
        nameZh: '多孔散热护筒与膛口防跳口',
        nameEn: 'Perforated Shroud & Compensator',
        calloutEn: 'Ventilated Muzzle Shroud',
        roleZh: '散热防护与膛口稳控',
        roleEn: 'Thermal Shield & Brake',
      };
    case 'flash_hider':
      return {
        nameZh: '开槽式膛口消焰装置',
        nameEn: 'Slotted Muzzle Flash Hider',
        calloutEn: 'Muzzle Flash Hider',
        roleZh: '抑制膛口炽热焰辉',
        roleEn: 'Muzzle Flash Suppression',
      };
    default:
      return {
        nameZh: '枪口冠面与准星座组件',
        nameEn: 'Muzzle Crown & Front Sight Base',
        calloutEn: 'Muzzle Crown & Sight',
        roleZh: '弹头离膛气密基准',
        roleEn: 'Exit Crown & Sight Datum',
      };
  }
}

function describeMagazineSlot(bp, family) {
  if (family === 'mbt') {
    const isCarousel = bp.cad.magStyle === 'carousel';
    return {
      mag: {
        nameZh: isCarousel ? '底置转盘自动装弹机弹仓' : '尾舱隔爆泄压主炮弹药架',
        nameEn: isCarousel
          ? 'Hull Carousel Autoloader Drum'
          : 'Bustle Blow-Off Ammunition Rack',
        calloutEn: isCarousel ? 'Carousel Autoloader' : 'Bustle Ammo Rack',
        roleZh: '主炮重型弹药储供',
        roleEn: 'Main-Gun Munition Storage',
      },
      follower: {
        nameZh: isCarousel ? '推弹链与升降托弹臂' : '装填手托弹导槽与防爆门',
        nameEn: isCarousel
          ? 'Autoloader Hoist & Rammer Tray'
          : 'Blast Door & Loading Tray',
        calloutEn: isCarousel ? 'Autoloader Rammer Tray' : 'Blast Door & Tray',
        roleZh: '炮弹定向输送入膛',
        roleEn: 'Projectile Feed Alignment',
      },
      spring: {
        nameZh: '装弹缓冲储能弹簧组',
        nameEn: 'Loader Buffer Return Spring',
        calloutEn: 'Loader Buffer Spring',
        roleZh: '推弹定位柔性缓冲',
        roleEn: 'Feed Cycle Tensioning',
      },
      base: {
        nameZh: isCarousel ? '转盘装甲护罩底盘' : '泄压装甲舱盖总成',
        nameEn: isCarousel
          ? 'Carousel Armored Floor Shield'
          : 'Blow-Off Roof Panel Assembly',
        calloutEn: isCarousel ? 'Carousel Armor Shield' : 'Blow-Off Roof Panel',
        roleZh: '二次殉爆防护屏障',
        roleEn: 'Crew Survivability Shield',
      },
    };
  }
  if (family === 'rotary') {
    return {
      mag: {
        nameZh: '无链螺旋供弹鼓与导槽',
        nameEn: 'Linkless Helical Feed Drum',
        calloutEn: 'Linkless Feed Drum',
        roleZh: '高射速连续供弹储仓',
        roleEn: 'High-Rate Ammunition Drum',
      },
      follower: {
        nameZh: '螺旋供弹拨轮与导向滑块',
        nameEn: 'Helical Conveyor Sprocket',
        calloutEn: 'Feed Conveyor Sprocket',
        roleZh: '炮弹同步导送入膛',
        roleEn: 'Synchronized Feed Drive',
      },
      spring: {
        nameZh: '供弹离合张紧弹簧组',
        nameEn: 'Feed Clutch Tension Spring',
        calloutEn: 'Feed Tension Spring',
        roleZh: '防止高速断链卡弹',
        roleEn: 'High-RPM Feed Tension',
      },
      base: {
        nameZh: '弹鼓端盖与弹壳回收集槽',
        nameEn: 'Drum Endplate & Return Chute',
        calloutEn: 'Drum Endplate & Chute',
        roleZh: '闭合供弹回路封装',
        roleEn: 'Closed-Loop Drum Seal',
      },
    };
  }
  if (family === 'autocannon' || family === 'howitzer') {
    const isClip = bp.cad.magStyle === 'top_clip';
    return {
      mag: {
        nameZh: isClip ? '顶部 4 发漏夹重力供弹斗' : '分装炮弹与模块化发射药装填台',
        nameEn: isClip
          ? 'Top 4-Round Stripper Feed Hopper'
          : '155mm Loading Tray & Charge Cradle',
        calloutEn: isClip ? 'Top 4-Rd Feed Hopper' : '155mm Loading Tray',
        roleZh: '炮弹快速连续供弹',
        roleEn: 'Ordnance Munition Feed',
      },
      follower: {
        nameZh: isClip ? '重力供弹压弹爪' : '推弹杆与定位托架',
        nameEn: isClip ? 'Gravity Feed Pawl Assembly' : 'Breech Ramming Guide',
        calloutEn: isClip ? 'Gravity Feed Pawls' : 'Breech Ramming Guide',
        roleZh: '炮弹入膛精准限位',
        roleEn: 'Chambering Alignment',
      },
      spring: {
        nameZh: '供弹棘爪复进弹簧',
        nameEn: 'Feed Pawl Return Spring',
        calloutEn: 'Feed Pawl Spring',
        roleZh: '棘爪复位保持供弹节拍',
        roleEn: 'Feed Indexing Return',
      },
      base: {
        nameZh: isClip ? '弹斗锁扣底板' : '药筒底火装填挡板',
        nameEn: isClip ? 'Feed Hopper Locking Plate' : 'Primer Magazine Block',
        calloutEn: isClip ? 'Hopper Lock Plate' : 'Primer Mag Block',
        roleZh: '供弹机构固定承托',
        roleEn: 'Feed Base Retention',
      },
    };
  }
  if (family === 'bow_compound' || family === 'crossbow' || family === 'longbow') {
    return {
      mag: {
        nameZh: '箭壶本体与碳纤箭矢组',
        nameEn: 'Quiver Body & Arrow Assembly',
        calloutEn: 'Quiver & Arrow Set',
        roleZh: '箭矢随身携带储槽',
        roleEn: 'Arrow Carry & Indexing',
      },
      follower: {
        nameZh: '减震卡箭夹与箭尾定位卡',
        nameEn: 'Vibration-Damped Arrow Gripper',
        calloutEn: 'Arrow Retention Clip',
        roleZh: '静音防松动夹持箭杆',
        roleEn: 'Silent Shaft Retention',
      },
      spring: {
        nameZh: '快拆箭壶弹性卡紧簧',
        nameEn: 'Quiver Quick-Lock Spring',
        calloutEn: 'Quiver Lock Spring',
        roleZh: '箭壶防脱弹性锁定',
        roleEn: 'Quick-Detach Tension',
      },
      base: {
        nameZh: '防护箭头罩与配重底盖',
        nameEn: 'Broadhead Shield Hood',
        calloutEn: 'Broadhead Hood',
        roleZh: '锋利猎箭头安全包覆',
        roleEn: 'Broadhead Tip Guard',
      },
    };
  }
  if (family === 'revolver') {
    return {
      mag: {
        nameZh: '凹槽式多发旋转弹巢（转轮）',
        nameEn: 'Fluted Revolving Cylinder',
        calloutEn: 'Fluted Cylinder',
        roleZh: '多发弹膛旋转供弹',
        roleEn: 'Rotating Multi-Chamber Feed',
      },
      follower: {
        nameZh: '星形退壳挺杆与棘轮拨盘',
        nameEn: 'Extractor Star & Ratchet',
        calloutEn: 'Extractor Star & Ratchet',
        roleZh: '同步退壳与转轮分度',
        roleEn: 'Ejection & Cylinder Indexing',
      },
      spring: {
        nameZh: '退壳挺杆与中心轴复位簧',
        nameEn: 'Extractor Rod Return Spring',
        calloutEn: 'Extractor Return Spring',
        roleZh: '退壳后自动复位星轮',
        roleEn: 'Star Extractor Return',
      },
      base: {
        nameZh: '转轮摆臂与闭锁卡榫座',
        nameEn: 'Cylinder Crane & Latch Base',
        calloutEn: 'Cylinder Crane & Latch',
        roleZh: '转轮轴向承托与锁止',
        roleEn: 'Cylinder Pivot & Lock',
      },
    };
  }

  switch (bp.cad.magStyle) {
    case 'drum':
      return {
        mag: {
          nameZh: '大容量圆鼓/螺旋弹筒壳体',
          nameEn: 'High-Capacity Drum Magazine Body',
          calloutEn: 'Drum Magazine Body',
          roleZh: '高容量持续压制供弹',
          roleEn: 'High-Capacity Feed Drum',
        },
        follower: {
          nameZh: '螺旋拨弹臂与托弹块',
          nameEn: 'Rotary Feed Arm & Follower',
          calloutEn: 'Rotary Feed Follower',
          roleZh: '大容积弹药顺畅螺旋输送',
          roleEn: 'Helical Round Feeding',
        },
        spring: {
          nameZh: '高扭矩发条卷簧组件',
          nameEn: 'Clockwork Drum Feed Spring',
          calloutEn: 'Drum Mainspring',
          roleZh: '恒定推力驱动高速供弹',
          roleEn: 'Continuous Drum Tension',
        },
        base: {
          nameZh: '铰接式弹鼓前盖与上弦钮',
          nameEn: 'Hinged Drum Cover & Winder',
          calloutEn: 'Drum Cover & Winder',
          roleZh: '装弹开口密封与上弦',
          roleEn: 'Drum Access & Winding',
        },
      };
    case 'pan':
      return {
        mag: {
          nameZh: '顶置 47 发扁平圆盘弹盘',
          nameEn: 'Top-Mounted Flat Pan Magazine',
          calloutEn: 'Top Pan Magazine',
          roleZh: '水平辐射状旋转供弹',
          roleEn: 'Radial Top-Feed Pan',
        },
        follower: {
          nameZh: '放射状拨弹齿盘',
          nameEn: 'Radial Rotating Feed Disc',
          calloutEn: 'Radial Feed Disc',
          roleZh: '带动 7.62 弹药旋转至供弹口',
          roleEn: 'Radial Cartridge Indexing',
        },
        spring: {
          nameZh: '弹盘中心扭转卷簧',
          nameEn: 'Central Pan Torsion Spring',
          calloutEn: 'Pan Torsion Spring',
          roleZh: '驱动圆盘连续稳定转动',
          roleEn: 'Rotary Pan Drive Spring',
        },
        base: {
          nameZh: '弹盘顶盖与中心锁紧螺母',
          nameEn: 'Pan Lid & Center Lock Nut',
          calloutEn: 'Pan Lid & Lock Nut',
          roleZh: '弹盘防尘封闭与快拆',
          roleEn: 'Pan Dust Seal & Latch',
        },
      };
    case 'belt':
      return {
        mag: {
          nameZh: '弹链受弹盘与挂弹箱体',
          nameEn: 'Ammunition Belt Feed Tray & Box',
          calloutEn: 'Belt Feed Tray & Box',
          roleZh: '金属弹链大持续火力供弹',
          roleEn: 'Continuous Belt Supply',
        },
        follower: {
          nameZh: '拨弹滑板与单向止退棘爪',
          nameEn: 'Belt Feed Pawls & Cam Slide',
          calloutEn: 'Belt Feed Pawls',
          roleZh: '两步拨弹精准送入进弹口',
          roleEn: 'Two-Stage Belt Indexing',
        },
        spring: {
          nameZh: '拨弹棘爪压紧扭簧',
          nameEn: 'Feed Pawl Tension Spring',
          calloutEn: 'Feed Pawl Spring',
          roleZh: '防止大仰角射击弹链滑脱',
          roleEn: 'Anti-Slip Belt Retention',
        },
        base: {
          nameZh: '受弹机盖卡扣与防尘护板',
          nameEn: 'Feed Cover Latch & Chute Plate',
          calloutEn: 'Feed Tray Base Plate',
          roleZh: '弹链通路支撑与排壳导向',
          roleEn: 'Feed Path Support',
        },
      };
    case 'tube':
      return {
        mag: {
          nameZh: '枪管下方管状内置弹仓',
          nameEn: 'Under-Barrel Tubular Magazine',
          calloutEn: 'Tubular Magazine',
          roleZh: '轴向串联储存弹药',
          roleEn: 'Inline Tubular Storage',
        },
        follower: {
          nameZh: '高可见度圆柱托弹塞与托弹板',
          nameEn: 'High-Vis Shell Follower & Lifter',
          calloutEn: 'Shell Follower & Lifter',
          roleZh: '推弹入托板并抬升至弹膛口',
          roleEn: 'Shell Feed & Elevation',
        },
        spring: {
          nameZh: '长行程螺旋管仓托弹簧',
          nameEn: 'Long Helical Tube Mag Spring',
          calloutEn: 'Tube Magazine Spring',
          roleZh: '稳定推送重型霰弹/步枪弹',
          roleEn: 'Axial Tube Feed Force',
        },
        base: {
          nameZh: '管仓前端旋盖与背带环座',
          nameEn: 'Magazine Tube End Cap & Stud',
          calloutEn: 'Mag Tube End Cap',
          roleZh: '封固管仓并兼锁枪管前环',
          roleEn: 'Tube Seal & Barrel Lock',
        },
      };
    case 'box_internal':
      return {
        mag: {
          nameZh: '机匣内置固定盒式弹仓',
          nameEn: 'Internal Fixed Box Magazine',
          calloutEn: 'Internal Box Magazine',
          roleZh: '桥夹快速装填内置储弹',
          roleEn: 'Stripper-Clip Internal Feed',
        },
        follower: {
          nameZh: '铰接式托弹板与空仓顶块',
          nameEn: 'Machined Internal Follower',
          calloutEn: 'Internal Mag Follower',
          roleZh: '托举全威力弹对齐枪机推面',
          roleEn: 'Precision Round Presentation',
        },
        spring: {
          nameZh: 'W 型片状/螺旋托弹仓簧',
          nameEn: 'Internal Magazine Lift Spring',
          calloutEn: 'Internal Mag Spring',
          roleZh: '为末发大威力弹提供恒定托力',
          roleEn: 'Constant Upward Feed Force',
        },
        base: {
          nameZh: '铰接快卸弹仓底板总成',
          nameEn: 'Hinged Magazine Floorplate',
          calloutEn: 'Hinged Mag Floorplate',
          roleZh: '一键开启清弹与野战清理',
          roleEn: 'Quick-Dump Floorplate',
        },
      };
    default:
      return {
        mag: {
          nameZh: `${bp.magCapacity} 发可拆式双排弹匣壳体`,
          nameEn: `${bp.magCapacity}-Round Detachable Magazine Body`,
          calloutEn: `${bp.magCapacity}-Rd Magazine Body`,
          roleZh: '高速快换供弹核心',
          roleEn: 'Detachable Ammunition Feed',
        },
        follower: {
          nameZh: '防倾倒高对比度托弹板',
          nameEn: 'Anti-Tilt High-Vis Follower',
          calloutEn: 'Anti-Tilt Follower',
          roleZh: '保持供弹仰角与空仓挂机触发',
          roleEn: 'Feed Angle & Hold-Open',
        },
        spring: {
          nameZh: '高弹性不锈钢托弹弹簧',
          nameEn: 'Stainless Magazine Lift Spring',
          calloutEn: 'Magazine Lift Spring',
          roleZh: '高射速下可靠托举下一发弹',
          roleEn: 'Rapid-Cycle Feed Tension',
        },
        base: {
          nameZh: '防震快拆弹匣底板与锁片',
          nameEn: 'Reinforced Magazine Floorplate',
          calloutEn: 'Magazine Floorplate',
          roleZh: '底盖防跌落缓冲与快速拆洗',
          roleEn: 'Impact-Resistant Baseplate',
        },
      };
  }
}

export function getCanonicalPartDescriptors(bp) {
  const family = getArchetypeFamily(bp);
  const muzzle = describeMuzzleSlot(bp, family);
  const magPack = describeMagazineSlot(bp, family);

  const isMbt = family === 'mbt';
  const isArchery =
    family === 'bow_compound' || family === 'crossbow' || family === 'longbow';
  const isPistol = family === 'pistol';
  const isRevolver = family === 'revolver';
  const isRotary = family === 'rotary';
  const isArtillery = family === 'autocannon' || family === 'howitzer';

  const entries = {
    receiver: isMbt
      ? {
          nameZh: '主战坦克复合装甲炮塔壳体',
          nameEn: 'Composite Armored Turret Shell',
          calloutEn: 'Armored Turret Shell',
          roleZh: '主炮与乘员核心装甲防护',
          roleEn: 'Primary Turret Armor',
        }
      : isArchery
        ? {
            nameZh:
              family === 'longbow'
                ? '中段弓把握持核心区'
                : family === 'crossbow'
                  ? 'CNC 铝合金箭道主机匣'
                  : '高刚度中空桁架主弓把',
            nameEn:
              family === 'longbow'
                ? 'Central Yew Bow Handle'
                : family === 'crossbow'
                  ? 'CNC Aluminum Crossbow Rail'
                  : 'Hollow Truss Compound Riser',
            calloutEn:
              family === 'longbow'
                ? 'Yew Bow Handle'
                : family === 'crossbow'
                  ? 'CNC Flight Rail'
                  : 'Compound Bow Riser',
            roleZh: '拉距载荷承力主骨架',
            roleEn: 'Primary Structural Backbone',
          }
        : isPistol
          ? {
              nameZh:
                bp.archetype === 'pistol_broomhandle'
                  ? '一体锻造上机匣延伸框'
                  : '精密铣削往复式钢制套筒',
              nameEn:
                bp.archetype === 'pistol_broomhandle'
                  ? 'Monolithic Barrel Extension'
                  : 'Machined Steel Reciprocating Slide',
              calloutEn:
                bp.archetype === 'pistol_broomhandle'
                  ? 'Barrel Extension Frame'
                  : 'Steel Reciprocating Slide',
              roleZh: '闭锁往复运动与抛壳导轨',
              roleEn: 'Reciprocating Breech Housing',
            }
          : isRevolver
            ? {
                nameZh: '一体式重型锻钢转轮框桥',
                nameEn: 'Solid-Forged Revolver Top Strap',
                calloutEn: 'Forged Revolver Frame',
                roleZh: '承受大口径转轮膛压主框架',
                roleEn: 'High-Pressure Main Frame',
              }
            : isRotary
              ? {
                  nameZh: '固定式 360° 螺旋凸轮主外壳',
                  nameEn: 'Stationary Helical Cam Housing',
                  calloutEn: 'Helical Cam Housing',
                  roleZh: '驱动六路枪机同步循环导轨',
                  roleEn: '360-Deg Cam Track Housing',
                }
              : isArtillery
                ? {
                    nameZh: '炮尾摇架与耳轴承力机匣',
                    nameEn: 'Ordnance Cradle & Trunnion Ring',
                    calloutEn: 'Cradle & Trunnion Ring',
                    roleZh: '大口径火炮俯仰后坐导轨',
                    roleEn: 'Elevation & Recoil Cradle',
                  }
                : {
                    nameZh: '主体机匣与闭锁承力框架',
                    nameEn: 'Primary Receiver & Lock Housing',
                    calloutEn: 'Primary Receiver',
                    roleZh: '核心机构基准与耐压承力',
                    roleEn: 'Core Structural Chassis',
                  },

    barrel: isMbt
      ? {
          nameZh: `${bp.barrelLengthMm}mm 主炮高膛压身管`,
          nameEn: `${bp.barrelLengthMm}mm High-Pressure Main Gun Barrel`,
          calloutEn: 'Main Gun Cannon Barrel',
          roleZh: '穿甲弹超高速加速通道',
          roleEn: 'High-Velocity Ordnance Bore',
        }
      : isArchery
        ? {
            nameZh:
              family === 'longbow'
                ? '上下对称紫杉木弹性弓臂'
                : '高储能复合/反曲弹性弓片组',
            nameEn:
              family === 'longbow'
                ? 'Tapered Yew Self-Bow Limbs'
                : 'High-Energy Split Elastic Limbs',
            calloutEn:
              family === 'longbow' ? 'Tapered Yew Limbs' : 'High-Energy Bow Limbs',
            roleZh: '弹性势能储存与瞬时释放',
            roleEn: 'Elastic Potential Energy Store',
          }
        : isRotary
          ? {
              nameZh: '六管旋转冷锻身管集群',
              nameEn: 'Six-Barrel Rotary Forged Cluster',
              calloutEn: '6-Barrel Rotary Cluster',
              roleZh: '轮换射散热与弹道稳定',
              roleEn: 'Thermal-Sharing Barrel Cluster',
            }
          : {
              nameZh: `${bp.barrelLengthMm}mm 精密内膛枪管总成`,
              nameEn: `${bp.barrelLengthMm}mm Precision Rifled Barrel`,
              calloutEn: `${bp.barrelLengthMm}mm Precision Barrel`,
              roleZh: '密闭高压燃气并赋予弹头自旋',
              roleEn: 'Pressure Vessel & Spin Axis',
            },

    muzzle,

    bolt_carrier: isMbt
      ? {
          nameZh: '主炮炮尾防盾与液气驻退机框',
          nameEn: 'Gun Mantlet & Recoil Buffer Cradle',
          calloutEn: 'Gun Mantlet & Buffer',
          roleZh: '主炮俯仰装甲防护与制退',
          roleEn: 'Mantlet & Recoil Damping',
        }
      : isArchery
        ? {
            nameZh:
              family === 'bow_compound'
                ? '双同步偏心凸轮滑轮组'
                : family === 'crossbow'
                  ? '静音棘轮拉弦滑车组件'
                  : '400gr 碳纤维/白蜡木猎箭本体',
            nameEn:
              family === 'bow_compound'
                ? 'Synchronized Eccentric Cam Pair'
                : family === 'crossbow'
                  ? 'Silent Ratchet Cocking Sled'
                  : 'Heavy Warbow Arrow Assembly',
            calloutEn:
              family === 'bow_compound'
                ? 'Eccentric Cam System'
                : family === 'crossbow'
                  ? 'Cocking Carriage Sled'
                  : 'Warbow Arrow Assembly',
            roleZh: '拉距力学转换与能量加速',
            roleEn: 'Mechanical Advantage Drive',
          }
        : isRotary
          ? {
              nameZh: '中心六路旋转主转子总成',
              nameEn: 'Central 6-Track Rotor Assembly',
              calloutEn: 'Central 6-Track Rotor',
              roleZh: '每分钟数千转高速回转传动',
              roleEn: 'High-Speed Rotary Carrier',
            }
          : isArtillery
            ? {
                nameZh: '炮尾环与液气复进筒组',
                nameEn: 'Breech Ring & Recoil Cylinders',
                calloutEn: 'Breech Ring & Recoil',
                roleZh: '吸收巨额发射后坐冲量',
                roleEn: 'Hydropneumatic Recoil Unit',
              }
            : {
                nameZh: isPistol ? '复进导杆与闭锁凸轮滑块' : '枪机框与拉机操作传动组',
                nameEn: isPistol
                  ? 'Recoil Guide & Locking Cam Block'
                  : 'Bolt Carrier & Operating Group',
                calloutEn: isPistol ? 'Locking Cam Block' : 'Bolt Carrier Group',
                roleZh: '驱动解锁、后坐与复位循环',
                roleEn: 'Primary Cycling Actuator',
              },

    bolt: isMbt || isArtillery
      ? {
          nameZh: '重型立楔/螺式主炮炮闩',
          nameEn: 'Heavy Sliding-Wedge / Screw Breech',
          calloutEn: 'Heavy Cannon Breech',
          roleZh: '密闭数百兆帕高压炮膛',
          roleEn: 'High-Pressure Breech Seal',
        }
      : isArchery
        ? {
            nameZh: '主弓弦与同步分弦缆绳',
            nameEn: 'Main Bowstring & Power Cables',
            calloutEn: 'Bowstring & Cables',
            roleZh: '传递弓片张力直推箭尾',
            roleEn: 'Direct Launch Drive String',
          }
        : {
            nameZh: isRevolver ? '转轮闭锁止动块与弹底挡板' : '高强度闭锁枪机头与抽壳钩',
            nameEn: isRevolver
              ? 'Cylinder Stop & Recoil Shield'
              : 'Hardened Locking Bolt & Extractor',
            calloutEn: isRevolver ? 'Cylinder Stop & Shield' : 'Locking Bolt Head',
            roleZh: '刚性闭锁膛压并可靠抽壳',
            roleEn: 'Breech Lock & Case Extraction',
          },

    recoil_spring: {
      nameZh: isMbt || isArtillery ? '主炮重型复进弹簧组' : isArchery ? '弓弦储能张力缓冲单元' : '主复进螺旋弹簧总成',
      nameEn:
        isMbt || isArtillery
          ? 'Main-Gun Recuperator Spring'
          : isArchery
            ? 'String Tension Return Assembly'
            : 'Main Helical Recoil Spring',
      calloutEn:
        isMbt || isArtillery
          ? 'Recuperator Spring'
          : isArchery
            ? 'String Tension Spring'
            : 'Helical Recoil Spring',
      roleZh: '吸收后坐动能并驱动复进闭膛',
      roleEn: 'Recoil Storage & Return Drive',
    },

    handguard: isMbt
      ? {
          nameZh: '倾斜首上复合装甲车体前部',
          nameEn: 'Sloped Glacis Composite Hull Front',
          calloutEn: 'Sloped Glacis Hull',
          roleZh: '正面抗穿甲弹主防护盾',
          roleEn: 'Frontal Kinetic Armor',
        }
      : isArchery
        ? {
            nameZh: '箭道护手板与弓片减震支座',
            nameEn: 'Limb Pocket & Forend Guard',
            calloutEn: 'Limb Pocket & Forend',
            roleZh: '稳定弓片夹角并防护握持手',
            roleEn: 'Limb Alignment & Guard',
          }
        : isArtillery || isRotary
          ? {
              nameZh: '防盾护板与散热框架罩',
              nameEn: 'Gun Shield & Structural Shroud',
              calloutEn: 'Gun Shield & Shroud',
              roleZh: '炮手防护与结构抗扭支撑',
              roleEn: 'Crew Shield & Chassis',
            }
          : {
              nameZh: bp.cad.hasWoodFurniture ? '油润实木前护木组件' : '散热隔热战术前护木',
              nameEn: bp.cad.hasWoodFurniture
                ? 'Oil-Finished Walnut Forend'
                : 'Ventilated Tactical Handguard',
              calloutEn: bp.cad.hasWoodFurniture ? 'Walnut Forend' : 'Tactical Handguard',
              roleZh: '隔绝枪管高温并提供稳定握持',
              roleEn: 'Thermal Shield & Support Hand',
            },

    stock: isMbt
      ? {
          nameZh: '坦克主装甲下车体与动力舱',
          nameEn: 'Armored Lower Hull & Engine Deck',
          calloutEn: 'Armored Hull & Engine',
          roleZh: '整车动力与全向装甲承重体',
          roleEn: 'Hull Chassis & Powerpack',
        }
      : isArtillery
        ? {
            nameZh: '开脚大架/双耳轴炮架底座',
            nameEn: 'Split-Trail / Pedestal Carriage',
            calloutEn: 'Artillery Carriage Base',
            roleZh: '将发射反冲力稳固导入地面',
            roleEn: 'Ground Recoil Anchoring',
          }
        : isPistol || isRevolver
          ? {
              nameZh: '下套筒座与人机握把骨架',
              nameEn: 'Lower Frame & Grip Chassis',
              calloutEn: 'Lower Frame Chassis',
              roleZh: '统筹击发机构与手掌抵御后坐',
              roleEn: 'Main Chassis & Ergonomics',
            }
          : {
              nameZh: bp.cad.hasWoodFurniture ? '经典实木抵肩枪托' : '高刚度战术抵肩枪托',
              nameEn: bp.cad.hasWoodFurniture
                ? 'Classic Hardwood Buttstock'
                : 'Tactical Ergonomic Buttstock',
              calloutEn: bp.cad.hasWoodFurniture ? 'Hardwood Buttstock' : 'Tactical Buttstock',
              roleZh: '直线传导后坐并支撑贴腮瞄准',
              roleEn: 'Recoil Transfer & Cheek Weld',
            },

    grip: isMbt
      ? {
          nameZh: '车长/炮长操纵台与吊篮座椅',
          nameEn: 'Turret Basket & Crew Controls',
          calloutEn: 'Turret Crew Controls',
          roleZh: '火控解算与双轴稳定操控',
          roleEn: 'FCS Crew Interface',
        }
      : {
          nameZh: bp.cad.hasWoodFurniture ? '刻纹实木握把组件' : '人体工学防滑主握把',
          nameEn: bp.cad.hasWoodFurniture
            ? 'Checkered Hardwood Pistol Grip'
            : 'Ergonomic Textured Main Grip',
          calloutEn: bp.cad.hasWoodFurniture ? 'Checkered Wood Grip' : 'Ergonomic Main Grip',
          roleZh: '锁定手腕角度优化扳机控枪',
          roleEn: 'Wrist Alignment & Control',
        },

    optic: isMbt
      ? {
          nameZh: '车长周视热成像与炮长稳像瞄准镜',
          nameEn: 'Hunter-Killer Thermal Sight Suite',
          calloutEn: 'Thermal FCS Optic Suite',
          roleZh: '昼夜猎歼瞄准与激光测距',
          roleEn: 'Hunter-Killer Targeting',
        }
      : {
          nameZh: bp.cad.hasOptic
            ? '精密光学瞄准镜与高刚度镜座'
            : bp.cad.hasCarryHandle
              ? '一体提把与机械照门组件'
              : '可调机械准星照门组',
          nameEn: bp.cad.hasOptic
            ? 'Precision Optical Sight & Mount'
            : bp.cad.hasCarryHandle
              ? 'Carry Handle & Aperture Sight'
              : 'Adjustable Iron Sight Assembly',
          calloutEn: bp.cad.hasOptic
            ? 'Precision Optical Sight'
            : bp.cad.hasCarryHandle
              ? 'Carry Handle & Sight'
              : 'Adjustable Iron Sights',
          roleZh: '建立精准弹道瞄准基线',
          roleEn: 'Ballistic Sightline Datum',
        },

    gas_system: isMbt
      ? {
          nameZh: '双侧负重轮扭杆/液气悬挂履带组',
          nameEn: 'Roadwheel Suspension & Track Run',
          calloutEn: 'Suspension & Track Run',
          roleZh: '全地形高速越野与射击平台稳定',
          roleEn: 'All-Terrain Mobility Train',
        }
      : isArchery
        ? {
            nameZh: '分弦滑杆与弓片张力调节座',
            nameEn: 'Cable Guard & Draw-Weight Tiller',
            calloutEn: 'Cable Guard & Tiller',
            roleZh: '隔离箭羽干涉并精调拉力曲线',
            roleEn: 'Fletching Clearance & Tune',
          }
        : isRotary
          ? {
              nameZh: '大功率液压/电动驱动马达与减速箱',
              nameEn: 'Rotary Drive Motor & Gearbox',
              calloutEn: 'Rotary Drive Motor',
              roleZh: '外能源驱动数千发每分射速',
              roleEn: 'External Rotary Powerplant',
            }
          : {
              nameZh: '导气活塞/缓冲传动调节组件',
              nameEn: 'Gas Drive / Recoil Buffer System',
              calloutEn: 'Gas & Recoil System',
              roleZh: '定量调控自动循环能量平衡',
              roleEn: 'Operating Energy Regulation',
            },

    mount_rail: isMbt
      ? {
          nameZh: '侧裙爆炸反应装甲与格栅组件',
          nameEn: 'Side ERA Skirt & Armor Array',
          calloutEn: 'Side ERA Armor Array',
          roleZh: '偏折破甲射流与杆式穿甲弹',
          roleEn: 'Reactive Side Protection',
        }
      : {
          nameZh: bp.cad.hasBipod
            ? '折叠精密两脚架与战术导轨座'
            : '战术附件导轨与背带支座',
          nameEn: bp.cad.hasBipod
            ? 'Folding Bipod & Accessory Rail'
            : 'Accessory Rail & Sling Mount',
          calloutEn: bp.cad.hasBipod ? 'Folding Bipod & Rail' : 'Accessory Mount Rail',
          roleZh: '提供稳固依托与模块化拓展',
          roleEn: 'Modular Support & Optics Base',
        },

    trigger: {
      nameZh: isMbt || isRotary ? '电控击发扳机与火控开关' : '精密机械扳机与护圈总成',
      nameEn:
        isMbt || isRotary
          ? 'Electric Firing Switch & Solenoid'
          : 'Precision Trigger & Guard Assembly',
      calloutEn: isMbt || isRotary ? 'Firing Switch Solenoid' : 'Trigger & Guard',
      roleZh: '清晰干脆释放阻铁启动击发',
      roleEn: 'Crisp Firing Release Input',
    },

    hammer: {
      nameZh: isArchery
        ? '防空放撒放钳口棘爪'
        : isMbt || isArtillery
          ? '电/机械双模式主炮击针组'
          : '硬化击锤/平移击针击发组件',
      nameEn: isArchery
        ? 'Anti-Dry-Fire Release Sear Jaw'
        : isMbt || isArtillery
          ? 'Dual-Mode Cannon Firing Pin'
          : 'Hardened Hammer / Striker Unit',
      calloutEn: isArchery
        ? 'Release Sear Jaw'
        : isMbt || isArtillery
          ? 'Cannon Firing Pin'
          : 'Hammer / Striker Unit',
      roleZh: '高速释放储能精确击发底火/弓弦',
      roleEn: 'High-Speed Ignition Impactor',
    },

    hammer_spring: {
      nameZh: '主击发扭簧/螺旋打击簧',
      nameEn: 'Main Hammer / Striker Drive Spring',
      calloutEn: 'Hammer Drive Spring',
      roleZh: '为可靠击发提供充沛冲击能量',
      roleEn: 'Ignition Drive Energy',
    },

    selector: {
      nameZh: isMbt || isArtillery ? '火控安全联锁与击发模式开关' : '快慢机与机械保险杠杆',
      nameEn:
        isMbt || isArtillery
          ? 'FCS Interlock & Firing Mode Switch'
          : 'Fire Selector & Safety Lever',
      calloutEn: isMbt || isArtillery ? 'FCS Mode & Safety' : 'Fire Selector & Safety',
      roleZh: '可靠锁止扳机阻铁并切换射态',
      roleEn: 'Safety Interlock & Mode Control',
    },

    mag_body: magPack.mag,
    follower: magPack.follower,
    mag_spring: magPack.spring,
    mag_base: magPack.base,
  };

  return CANONICAL_20_PART_SLOTS.map(({ slot, bomCode, group }) => {
    const info = entries[slot];
    return {
      slot,
      partId: `${bp.id}_${slot}`,
      bomCode,
      group,
      nameZh: info.nameZh,
      nameEn: info.nameEn,
      calloutLabelEn: clampCalloutEn(info.calloutEn),
      roleTagZh: info.roleZh,
      roleTagEn: info.roleEn,
    };
  });
}

function buildFiringPhasesEn(bp, family, kinematic) {
  if (family === 'bow_compound' || family === 'crossbow' || family === 'longbow') {
    return {
      phase_1: {
        shortLabel: 'Draw & Load',
        title: `Phase 1 · ${bp.shortLabel} Energy Draw & Nocking`,
        description: `Drawing the bowstring stores elastic potential energy across the ${bp.barrelLengthMm} mm power stroke of the ${bp.nameEn} limbs.`,
      },
      phase_2: {
        shortLabel: 'Full Anchor',
        title: 'Phase 2 · Peak Tension & Mechanical Anchor',
        description: `At full draw, ${kinematic.en}, holding the ${bp.caliberLabel} projectile aligned on the launch datum.`,
      },
      phase_3: {
        shortLabel: 'Sear Release',
        title: 'Phase 3 · Crisp Trigger / Finger Release',
        description: `Disengaging the latch frees the taut bowstring cleanly without lateral torque, initiating forward energy transfer.`,
      },
      phase_4: {
        shortLabel: 'Limb Unwind',
        title: 'Phase 4 · Elastic Limb Recovery & Acceleration',
        description: `Stored strain energy unwinds rapidly along the rail, accelerating the projectile toward ${bp.muzzleVelocityMs} m/s.`,
      },
      phase_5: {
        shortLabel: 'Launch Exit',
        title: 'Phase 5 · Rest Clearance & Fletching Spin',
        description: `The shaft clears the launcher with ${bp.muzzleEnergyJ} J of kinetic energy as helical fletching initiates aerodynamic stabilization.`,
      },
      phase_6: {
        shortLabel: 'String Damping',
        title: 'Phase 6 · Brace-Height Stop & Vibration Decay',
        description: `String stops and riser dampeners absorb residual oscillation cleanly to preserve quiet acoustic discipline.`,
      },
      phase_7: {
        shortLabel: 'Reset & Nock',
        title: 'Phase 7 · Safety Engagement & Next-Shot Prep',
        description: `The release assembly resets automatically, preparing the ${bp.shortLabel} for the next precision launch out to ${bp.effectiveRangeM} m.`,
      },
    };
  }

  if (family === 'mbt' || family === 'autocannon' || family === 'howitzer') {
    return {
      phase_1: {
        shortLabel: 'FCS Fire Solenoid',
        title: `Phase 1 · ${bp.shortLabel} Firing Solenoid & Primer Ignition`,
        description: `Closing the crew firing circuit energizes the breech firing pin, igniting the primary propellant charge inside the sealed ${bp.caliberLabel} chamber.`,
      },
      phase_2: {
        shortLabel: 'Peak Pressure',
        title: `Phase 2 · ${bp.peakPressureMpa} MPa Chamber Deflagration`,
        description: `Rapid propellant burn drives chamber pressure to ${bp.peakPressureMpa} MPa against the heavy locked breechblock while accelerating the heavy projectile.`,
      },
      phase_3: {
        shortLabel: 'In-Bore Travel',
        title: `Phase 3 · ${bp.barrelLengthMm} mm Ordnance Acceleration`,
        description: `Expanding gases accelerate the ${bp.caliberLabel} round along the ${bp.barrelLengthMm} mm barrel up to ${bp.muzzleVelocityMs} m/s (${bp.muzzleEnergyJ.toLocaleString('en-US')} J).`,
      },
      phase_4: {
        shortLabel: 'Muzzle Exit',
        title: 'Phase 4 · Bore Clearance & Muzzle Blast',
        description: `The projectile clears the muzzle crown cleanly for engagements out to ${bp.effectiveRangeM} m while bore gases evacuate safely away from the crew.`,
      },
      phase_5: {
        shortLabel: 'Recoil Stroke',
        title: 'Phase 5 · Hydropneumatic Recoil Absorption',
        description: `Recoil cylinders absorb ${bp.recoilImpulseNs} N-s of impulse smoothly across the cradle while transferring residual load into the chassis.`,
      },
      phase_6: {
        shortLabel: 'Breech Ejection',
        title: 'Phase 6 · Breech Opening & Stub Extraction',
        description: `During battery runout, ${kinematic.en}, ejecting the spent base stub cleanly into the deflector bin.`,
      },
      phase_7: {
        shortLabel: 'Reload & Ready',
        title: 'Phase 7 · Munition Ramming & Battery Lock',
        description: `The next ${bp.caliberLabel} round seats into the chamber and locks the breechblock back into firing readiness.`,
      },
    };
  }

  return {
    phase_1: {
      shortLabel: 'Trigger & Sear',
      title: `Phase 1 · ${bp.shortLabel} Trigger Release & Ignition Drive`,
      description: `Pulling the trigger disengages the sear, freeing the spring-driven hammer or striker to impact the ${bp.caliberLabel} primer.`,
    },
    phase_2: {
      shortLabel: 'Primer Ignition',
      title: `Phase 2 · ${bp.peakPressureMpa} MPa Chamber Pressure Rise`,
      description: `The propellant charge ignites inside the locked chamber, driving peak pressure to ${bp.peakPressureMpa} MPa while sealing the cartridge case against the breech.`,
    },
    phase_3: {
      shortLabel: 'Bore Acceleration',
      title: `Phase 3 · ${bp.barrelLengthMm} mm Barrel Engraving & Acceleration`,
      description: `The projectile engages the ${bp.rifling.grooveCount > 0 ? `${bp.rifling.grooveCount}-groove` : 'smooth'} bore and accelerates to ${bp.muzzleVelocityMs} m/s (${bp.muzzleEnergyJ} J).`,
    },
    phase_4: {
      shortLabel: kinematic.milestoneEn,
      title: `Phase 4 · ${kinematic.milestoneEn} & Operating Impulse`,
      description: `Once chamber pressure decays safely, ${kinematic.en}.`,
    },
    phase_5: {
      shortLabel: 'Extract & Eject',
      title: 'Phase 5 · Spent Case Extraction & Ejection',
      description: `The extractor pulls the fired brass clear of the chamber and pivots it out the ejection port while the recoil spring compresses.`,
    },
    phase_6: {
      shortLabel: 'Feed & Lock',
      title: 'Phase 6 · Next-Round Stripping & Breech Lockup',
      description: `Driven forward by the recoil spring, the breech strips the next round from the ${bp.magCapacity}-round supply and locks solidly into battery.`,
    },
    phase_7: {
      shortLabel: 'Trigger Reset',
      title: 'Phase 7 · Disconnector Handoff & Sear Reset',
      description: `Releasing the trigger hands control cleanly back to the primary sear, leaving the ${bp.shortLabel} staged for its ${bp.rateOfFireLabelEn} cadence.`,
    },
  };
}

/**
 * Deterministically builds a full, schema-compliant `WeaponNarrationBundle`
 * (`schemaVersion: 1`, `audioUrl: ""`) for any Centennial Expansion blueprint.
 */
export function buildCentennialNarrationBundle(bp) {
  const family = getArchetypeFamily(bp);
  const finish = FINISH_MATERIALS[bp.finishPalette] ?? FINISH_MATERIALS.tactical_black;
  const kinematic =
    KINEMATIC_DESCRIPTORS[bp.kinematicLaw] ??
    KINEMATIC_DESCRIPTORS.short_stroke_piston;
  const categoryLabelEn = CATEGORY_LABELS_EN[bp.category] ?? 'Museum Exhibit';
  const partDescriptors = getCanonicalPartDescriptors(bp);
  const partBySlot = Object.fromEntries(partDescriptors.map((p) => [p.slot, p]));

  const isHeavy = family === 'mbt' || family === 'rotary' || family === 'autocannon' || family === 'howitzer';
  const isArchery =
    family === 'bow_compound' || family === 'crossbow' || family === 'longbow';

  const uiMetaEn = {
    name: bp.nameEn,
    subtitle: bp.subtitleEn,
    originCountry: bp.originCountryEn,
    weaponType: bp.weaponTypeEn,
    categoryLabel: categoryLabelEn,
    actionMechanism: bp.actionMechanismEn,
    statusLabel: 'Vault Ready · Interactive 3D',
    description: bp.descriptionEn,
    highlights: [...bp.highlightsEn],
    workbenchTitle: `${bp.nameEn} 3D Mechanical Teardown & Kinematics`,
    workbenchSubtitle: `4 Assemblies · 20 Core Components · ${bp.actionMechanismEn}`,
    cutawayLabel: isMbtOrArtilleryCutawayLabel(family),
    cutawayTitle: `Engage live longitudinal cutaway on ${bp.nameEn} to inspect internal locking and feed geometry`,
    searchPlaceholder:
      'Search part name or BOM code (e.g., Barrel, Bolt, U-01, M-01)...',
    firingMilestoneLabel: kinematic.milestoneEn,
    rateOfFire: bp.rateOfFireLabelEn,
    timelinePresets: {
      assembled: {
        label: 'Fully Assembled',
        subLabel: '0%',
        desc: `${bp.nameEn} (${bp.year}) in complete operational battery with all 20 assemblies seated in 1:1 alignment.`,
      },
      field_strip: {
        label: 'Field Strip',
        subLabel: '30%',
        desc: `Primary operator maintenance stage: clear ammunition supply and separate upper operating group for routine inspection.`,
      },
      sub_assembly: {
        label: 'Sub-Assembly',
        subLabel: '65%',
        desc: `Intermediate armorer teardown exposing locking interfaces, fire-control linkage, and recoil energy storage springs.`,
      },
      full_exploded: {
        label: 'Full Exploded View',
        subLabel: '100%',
        desc: `Complete 20-component isometric CAD explosion displaying every functional group across ${bp.overallLengthDisplayEn}.`,
      },
    },
    firingPhases: buildFiringPhasesEn(bp, family, kinematic),
  };

  // Milestones (>= 5 chronological points anchored on bp.year)
  const preYear = Math.max(1380, bp.year - (bp.year < 1850 ? 25 : 4));
  const fieldYear = Math.min(2025, bp.year + (bp.year < 1900 ? 8 : 3));
  const legacyYear = Math.min(2026, Math.max(fieldYear + 2, bp.year + 15));

  const storyZh = {
    headline: `${bp.nameZh}：${bp.year} 年机械传奇与工程剖析`,
    deck: `${bp.descriptionZh} 本馆以 1:1 真实工程比例重现其 20 大核心构件与完整工作循环。`,
    acts: [
      {
        id: 'act1',
        actNumber: '第一幕',
        eraTag: `${preYear}–${bp.year}`,
        title: `时代召唤与研发立项：${bp.shortLabel} 的诞生背景`,
        paragraphs: [
          `${bp.year} 年问世的 ${bp.nameZh} 由${bp.originCountryZh}${bp.manufacturerZh}主导研制，定位为经典的${bp.weaponTypeZh}。${bp.historicalFactZh}`,
          `${bp.descriptionZh} 整件装备总长 ${bp.overallLengthDisplayZh}、空重 ${bp.emptyWeightKg} kg，成为同期${bp.categoryZh}领域最具辨识度的里程碑之一。`,
        ],
        audioScript: `第一幕，时代起源。${bp.year} 年，${bp.originCountryZh}${bp.manufacturerZh}推出了划时代的${bp.nameZh}。${bp.historicalFactZh} 它的核心设计聚焦于${bp.highlightsZh[0]}，奠定了其在${bp.categoryZh}发展史中的经典地位。`,
        audioUrl: '',
        focusPartId: partBySlot.receiver.partId,
        focusPartLabel: partBySlot.receiver.nameZh,
      },
      {
        id: 'act2',
        actNumber: '第二幕',
        eraTag: `${bp.year}`,
        title: `核心机械构造与闭锁奥秘`,
        paragraphs: [
          `${bp.nameZh} 的机械灵魂在于其「${bp.actionMechanismZh}」结构体系。在发射工作循环中，${kinematic.zh}，将高压能量精确约束于承力框架之内。`,
          `制造工艺方面，关键承力件采用${finish.zh}精加工而成。${bp.highlightsZh[1]}，在严苛实战条件下依然保持顺畅节拍与长期尺寸稳定性。`,
        ],
        audioScript: `第二幕，核心机械原理。${bp.nameZh} 采用${bp.actionMechanismZh}。在每个击发周期中，${kinematic.zh}。借助${finish.zh}工艺与高强度配合，实现了${bp.highlightsZh[1]}。`,
        audioUrl: '',
        focusPartId: partBySlot.bolt.partId,
        focusPartLabel: partBySlot.bolt.nameZh,
      },
      {
        id: 'act3',
        actNumber: '第三幕',
        eraTag: `${bp.year}–${fieldYear}`,
        title: `弹道性能、内膛工艺与实战效能`,
        paragraphs: [
          `该平台配用 ${bp.caliberLabel} 弹药规格与 ${bp.barrelSpecZh}，最高工作膛压约 ${bp.peakPressureMpa} MPa，可赋予弹头 ${bp.muzzleVelocityMs} m/s 的出膛初速与 ${bp.muzzleEnergyJ.toLocaleString('en-US')} J 动能，有效作用距离达 ${bp.effectiveRangeM} 米。`,
          `内膛技术特点方面，${bp.rifling.noteZh}。同时，${bp.highlightsZh[2]}，令其在 ${bp.rateOfFireLabelZh} 的节奏下兼具精准控制与可靠输出。`,
        ],
        audioScript: `第三幕，弹道与实战表现。配备 ${bp.barrelLengthMm} 毫米身管与 ${bp.caliberLabel} 口径，${bp.nameZh} 实现了每秒 ${bp.muzzleVelocityMs} 米的初速与 ${bp.effectiveRangeM} 米有效射程。${bp.rifling.noteZh}，展现了卓越的工程平衡。`,
        audioUrl: '',
        focusPartId: partBySlot.barrel.partId,
        focusPartLabel: partBySlot.barrel.nameZh,
      },
      {
        id: 'act4',
        actNumber: '第四幕',
        eraTag: `${legacyYear}–2026`,
        title: `人机工效、供弹哲学与百年遗产`,
        paragraphs: [
          `围绕 ${bp.magCapacity} 发容量的${partBySlot.mag_body.nameZh}与 ${bp.boreAxisMm} mm 膛轴设计，${bp.nameZh} 将单发后坐冲量控制在 ${bp.recoilImpulseNs} N·s 水平。${bp.highlightsZh[3]}。`,
          `如今在数字兵器库 3D 百年展厅（${bp.bayCode}）中，您可以随时通过三轴剖视、100% 爆炸视图与实时运动学滑块，零距离拆解这座跨越时代的机械工程杰作。`,
        ],
        audioScript: `第四幕，百年遗产。凭借 ${bp.magCapacity} 发容量的${partBySlot.mag_body.nameZh}与出色的整体工效，${bp.highlightsZh[3]}。欢迎在 ${bp.bayCode} 展位亲手切开剖面、逐件拆解，感受 ${bp.nameZh} 的机械魅力。`,
        audioUrl: '',
        focusPartId: partBySlot.mag_body.partId,
        focusPartLabel: partBySlot.mag_body.nameZh,
      },
    ],
    breakthroughs: [
      {
        id: 'bt1',
        title: '核心动作与闭锁架构',
        tag: bp.bayCode,
        summary: `${bp.actionMechanismZh}；${bp.highlightsZh[0]}。`,
        focusPartId: partBySlot.bolt.partId,
        focusPartLabel: partBySlot.bolt.nameZh,
      },
      {
        id: 'bt2',
        title: '内膛弹道与能量释放',
        tag: `${bp.muzzleVelocityMs} m/s`,
        summary: `${bp.barrelSpecZh}，${bp.rifling.noteZh}。`,
        focusPartId: partBySlot.barrel.partId,
        focusPartLabel: partBySlot.barrel.nameZh,
      },
      {
        id: 'bt3',
        title: '供弹与实战人机工效',
        tag: `${bp.magCapacity} rds`,
        summary: `${bp.highlightsZh[2]}；${bp.highlightsZh[3]}。`,
        focusPartId: partBySlot.mag_body.partId,
        focusPartLabel: partBySlot.mag_body.nameZh,
      },
    ],
    milestones: [
      {
        year: `${preYear}`,
        title: '战术指标与概念构型',
        detail: `${bp.originCountryZh}提出新一代${bp.weaponTypeZh}战术指标，确立口径与机动平衡方向。`,
      },
      {
        year: `${bp.year}`,
        title: `${bp.shortLabel} 正式定型投产`,
        detail: `${bp.manufacturerZh}完成 ${bp.modelCode} 定型，采用${bp.actionMechanismZh}架构。`,
      },
      {
        year: `${fieldYear}`,
        title: '实战部署与工艺演进',
        detail: `${bp.highlightsZh[0]}，在全球多个战区与演训环境中验证了高可靠性。`,
      },
      {
        year: `${legacyYear}`,
        title: '工程典范与历史传承',
        detail: `${bp.historicalFactZh}`,
      },
      {
        year: '2026',
        title: `入藏数字兵器库 3D（${bp.bayCode}）`,
        detail: `完整构建 1:1 参数化 20 零件三维装配模型，支持剖切、爆炸与运动学实时仿真。`,
      },
    ],
  };

  const storyEn = {
    headline: `${bp.nameEn}: The ${bp.year} Mechanical Legend`,
    deck: `${bp.descriptionEn} Preserved in 1:1 interactive 3D CAD scale across all 20 functional assemblies in ${bp.bayCode}.`,
    acts: [
      {
        id: 'act1',
        actNumber: 'Act I',
        eraTag: `${preYear}–${bp.year}`,
        title: `Origins & Operational Mandate of the ${bp.shortLabel}`,
        paragraphs: [
          `Introduced in ${bp.year} by ${bp.manufacturerEn} in ${bp.originCountryEn}, the ${bp.nameEn} emerged as a defining ${bp.weaponTypeEn}. ${bp.historicalFactEn}`,
          `${bp.descriptionEn} Measuring ${bp.overallLengthDisplayEn} at an unloaded weight of ${bp.emptyWeightKg} kg, it reshaped expectations across the ${categoryLabelEn} class.`,
        ],
        audioScript: `Act One: Historical Origins. In ${bp.year}, ${bp.manufacturerEn} of ${bp.originCountryEn} introduced the ${bp.nameEn}. ${bp.historicalFactEn} Anchored by its hallmark design trait — ${bp.highlightsEn[0]} — it quickly established an enduring engineering benchmark.`,
        audioUrl: '',
        focusPartId: partBySlot.receiver.partId,
        focusPartLabel: partBySlot.receiver.nameEn,
      },
      {
        id: 'act2',
        actNumber: 'Act II',
        eraTag: `${bp.year}`,
        title: 'Core Operating Architecture & Lockup Mechanics',
        paragraphs: [
          `At the mechanical heart of the ${bp.nameEn} sits its ${bp.actionMechanismEn}. Throughout every firing cycle, ${kinematic.en}, containing ${bp.peakPressureMpa} MPa of operating pressure safely.`,
          `Constructed in ${finish.en}, the assembly achieves durable field tolerances. Notably, ${bp.highlightsEn[1]}, sustaining dependable operation under severe environmental stress.`,
        ],
        audioScript: `Act Two: Core Mechanical Architecture. The ${bp.nameEn} relies on ${bp.actionMechanismEn}. During each cycle, ${kinematic.en}. Machined from ${finish.en}, it delivers standout engineering reliability: ${bp.highlightsEn[1]}.`,
        audioUrl: '',
        focusPartId: partBySlot.bolt.partId,
        focusPartLabel: partBySlot.bolt.nameEn,
      },
      {
        id: 'act3',
        actNumber: 'Act III',
        eraTag: `${bp.year}–${fieldYear}`,
        title: 'Ballistic Performance, Bore Craft & Range Reach',
        paragraphs: [
          `Chambered for ${bp.caliberLabel} with ${bp.barrelSpecEn}, the ${bp.nameEn} develops ${bp.muzzleVelocityMs} m/s muzzle velocity and ${bp.muzzleEnergyJ.toLocaleString('en-US')} J of kinetic energy for effective engagement out to ${bp.effectiveRangeM} meters.`,
          `Internally, ${bp.rifling.noteEn}. Combined with its ${bp.rateOfFireLabelEn} tempo, ${bp.highlightsEn[2]}, delivering disciplined accuracy across demanding field conditions.`,
        ],
        audioScript: `Act Three: Ballistic Performance. Driving ${bp.caliberLabel} through its ${bp.barrelLengthMm} millimeter bore, the ${bp.nameEn} achieves ${bp.muzzleVelocityMs} meters per second and ${bp.effectiveRangeM} meters of effective reach. ${bp.rifling.noteEn}.`,
        audioUrl: '',
        focusPartId: partBySlot.barrel.partId,
        focusPartLabel: partBySlot.barrel.nameEn,
      },
      {
        id: 'act4',
        actNumber: 'Act IV',
        eraTag: `${legacyYear}–2026`,
        title: 'Feed Philosophy, Ergonomics & Centennial Legacy',
        paragraphs: [
          `Fed by a ${bp.magCapacity}-round ${partBySlot.mag_body.nameEn.toLowerCase()} with a ${bp.boreAxisMm} mm bore-axis height, the platform manages ${bp.recoilImpulseNs} N-s of recoil impulse cleanly. ${bp.highlightsEn[3]}.`,
          `Now archived in Digital Armory 3D Centennial Gallery (${bp.bayCode}), all 20 interactive assemblies can be sectioned live along three axes, exploded to 100%, and inspected part by part.`,
        ],
        audioScript: `Act Four: Engineering Legacy. Pairing its ${bp.magCapacity}-round ${partBySlot.mag_body.nameEn.toLowerCase()} with disciplined recoil geometry, ${bp.highlightsEn[3]}. Explore ${bp.bayCode} in live section cut and exploded disassembly to study every working link of the ${bp.nameEn}.`,
        audioUrl: '',
        focusPartId: partBySlot.mag_body.partId,
        focusPartLabel: partBySlot.mag_body.nameEn,
      },
    ],
    breakthroughs: [
      {
        id: 'bt1',
        title: 'Operating & Lockup Principle',
        tag: bp.bayCode,
        summary: `${bp.actionMechanismEn} — ${bp.highlightsEn[0]}.`,
        focusPartId: partBySlot.bolt.partId,
        focusPartLabel: partBySlot.bolt.nameEn,
      },
      {
        id: 'bt2',
        title: 'Bore & Ballistic Efficiency',
        tag: `${bp.muzzleVelocityMs} m/s`,
        summary: `${bp.barrelSpecEn}; ${bp.rifling.noteEn}.`,
        focusPartId: partBySlot.barrel.partId,
        focusPartLabel: partBySlot.barrel.nameEn,
      },
      {
        id: 'bt3',
        title: 'Feed & Ergonomic Mastery',
        tag: `${bp.magCapacity} rds`,
        summary: `${bp.highlightsEn[2]}; ${bp.highlightsEn[3]}.`,
        focusPartId: partBySlot.mag_body.partId,
        focusPartLabel: partBySlot.mag_body.nameEn,
      },
    ],
    milestones: [
      {
        year: `${preYear}`,
        title: 'Operational Requirement Defined',
        detail: `${bp.originCountryEn} ordnance planners established specifications for a new ${bp.weaponTypeEn} class.`,
      },
      {
        year: `${bp.year}`,
        title: `${bp.shortLabel} Official Introduction`,
        detail: `${bp.manufacturerEn} finalized ${bp.modelCode} around ${bp.actionMechanismEn}.`,
      },
      {
        year: `${fieldYear}`,
        title: 'Field Deployment & Service Validation',
        detail: `${bp.highlightsEn[0]}, proving mechanical endurance across real-world operations.`,
      },
      {
        year: `${legacyYear}`,
        title: 'Enduring Historical Influence',
        detail: bp.historicalFactEn,
      },
      {
        year: '2026',
        title: `Archived in Digital Armory 3D (${bp.bayCode})`,
        detail:
          'Modeled as a 1:1 interactive 20-component CAD exhibit with live cutaway, exploded disassembly, and kinematics.',
      },
    ],
  };

  const parts = {};
  for (const desc of partDescriptors) {
    const isSpring =
      desc.slot === 'recoil_spring' ||
      desc.slot === 'hammer_spring' ||
      desc.slot === 'mag_spring';
    const isWoodPart =
      bp.cad.hasWoodFurniture &&
      (desc.slot === 'handguard' ||
        desc.slot === 'stock' ||
        desc.slot === 'grip');

    const matZh = isSpring
      ? '高疲劳寿命硅铬琴钢丝冷卷热定型弹簧钢'
      : isWoodPart
        ? '经亚麻籽油浸润的精选实木/层压木料与钢制护箍'
        : finish.zh;
    const matEn = isSpring
      ? 'cold-wound heat-set chrome-silicon music-wire spring steel'
      : isWoodPart
        ? 'oil-finished selected hardwood paired with steel reinforcement ferrules'
        : finish.en;

    const kinZh =
      desc.slot === 'bolt' || desc.slot === 'bolt_carrier' || desc.slot === 'gas_system'
        ? `在击发循环中承担核心联动：${kinematic.zh}。`
        : isSpring
          ? `通过 GPU 实时螺旋压缩形变储存与释放弹性势能，保障 ${bp.rateOfFireLabelZh} 的连续稳定节拍。`
          : isHeavy
            ? `与 ${bp.nameZh} 重装结构刚性耦合，承受 ${bp.peakPressureMpa} MPa 级发射载荷与整备震动。`
            : isArchery
              ? `在 ${bp.barrelLengthMm} mm 拉距与撒放瞬间保持几何同心度，将能量平稳传递至箭矢。`
              : `与相邻模块保持精密基准配合，协同支撑 ${bp.caliberLabel} 发射周期中的定位、操持与可靠复位。`;

    const kinEn =
      desc.slot === 'bolt' || desc.slot === 'bolt_carrier' || desc.slot === 'gas_system'
        ? `Drives the core operating sequence: ${kinematic.en}.`
        : isSpring
          ? `Stores and returns cyclic elastic energy via live coil compression to maintain ${bp.rateOfFireLabelEn} timing.`
          : isHeavy
            ? `Anchors rigidly within the ${bp.nameEn} heavy assembly to withstand ${bp.peakPressureMpa} MPa firing loads.`
            : isArchery
              ? `Preserves geometric alignment across the ${bp.barrelLengthMm} mm power stroke for consistent arrow launch.`
              : `Maintains datum alignment with adjacent ${bp.shortLabel} assemblies throughout recoil, extraction, and return to battery.`;

    const hlIndex = CANONICAL_20_PART_SLOTS.findIndex((s) => s.slot === desc.slot) % 4;

    parts[desc.partId] = {
      partId: desc.partId,
      bomCode: desc.bomCode,
      calloutLabelEn: desc.calloutLabelEn,
      zh: {
        roleTag: desc.roleTagZh,
        overview: `${bp.nameZh}（${desc.bomCode}）的${desc.nameZh}，隶属 20 件套标准装配体系，负责${desc.roleTagZh}。`,
        craftAndMaterial: `采用${matZh}制造，表面按${bp.year}年代${bp.manufacturerZh}军械标准精整，兼顾耐磨与防蚀。`,
        kinematicRole: kinZh,
        designHighlight: `工程亮点呼应整枪特征：${bp.highlightsZh[hlIndex]}。`,
        audioScript: `${desc.bomCode}，${desc.nameZh}。作为 ${bp.nameZh} 的关键构件，它采用${matZh}制造，主要承担${desc.roleTagZh}职能。${kinZh}`,
        audioUrl: '',
      },
      en: {
        roleTag: desc.roleTagEn,
        overview: `${desc.nameEn} (${desc.bomCode}) of the ${bp.nameEn}, serving as the dedicated ${desc.roleTagEn.toLowerCase()} node within the 20-part assembly.`,
        craftAndMaterial: `Manufactured from ${matEn} to ${bp.manufacturerEn} service tolerances for wear and corrosion resistance.`,
        kinematicRole: kinEn,
        designHighlight: `Integrated directly with the platform's defining strength: ${bp.highlightsEn[hlIndex]}.`,
        audioScript: `${desc.bomCode}, ${desc.nameEn}. Crafted from ${matEn} for the ${bp.nameEn}, this component handles ${desc.roleTagEn.toLowerCase()}. ${kinEn}`,
        audioUrl: '',
      },
    };
  }

  return {
    schemaVersion: 1,
    weaponId: bp.id,
    generatedAt: DEFAULT_GENERATED_AT,
    generatorModels: {
      text: 'centennial-blueprint-v1',
      storyTts: 'web-speech-api',
      partTts: 'web-speech-api',
    },
    uiMetaEn,
    story: {
      zh: storyZh,
      en: storyEn,
    },
    parts,
  };
}

function isMbtOrArtilleryCutawayLabel(family) {
  if (family === 'mbt') return 'Turret Breech & Autoloader Cutaway';
  if (family === 'rotary') return 'Helical Cam & Rotor Cutaway';
  if (family === 'autocannon' || family === 'howitzer') {
    return 'Breech & Recoil Cradle Cutaway';
  }
  if (family === 'bow_compound' || family === 'crossbow' || family === 'longbow') {
    return 'Riser & Launch Rail Cutaway';
  }
  return 'Breech & Action Cutaway';
}

/**
 * Loads all currently existing Centennial catalog blueprint modules from disk
 * (using native Node 22+/24 TypeScript type-stripping or Vitest module loader)
 * sorted deterministically by `orderIndex`.
 */
export async function loadCentennialBlueprints(repoRoot = DEFAULT_REPO_ROOT) {
  const catalogDir = path.join(
    repoRoot,
    'src',
    'weapons',
    'expansion',
    'catalog'
  );
  const all = [];
  const loadedModules = [];

  for (const mod of CATALOG_MODULES) {
    const fullPath = path.join(catalogDir, mod.file);
    if (!fs.existsSync(fullPath)) continue;
    const imported = await import(pathToFileURL(fullPath).href);
    const list = imported[mod.exportName];
    if (Array.isArray(list)) {
      all.push(...list);
      loadedModules.push({ file: mod.file, count: list.length });
    }
  }

  all.sort((a, b) => a.orderIndex - b.orderIndex);
  return { blueprints: all, loadedModules };
}

export function parseCliArgs(argv) {
  const args = {
    outDir: path.join(DEFAULT_REPO_ROOT, 'public', 'narrations'),
    dryRun: false,
    only: null,
    json: false,
  };

  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (token === '--dry-run') {
      args.dryRun = true;
    } else if (token === '--json') {
      args.json = true;
    } else if (token === '--out-dir' && argv[i + 1]) {
      args.outDir = path.resolve(argv[i + 1]);
      i += 1;
    } else if (token.startsWith('--out-dir=')) {
      args.outDir = path.resolve(token.slice('--out-dir='.length));
    } else if (token === '--only' && argv[i + 1]) {
      args.only = new Set(
        argv[i + 1]
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
      i += 1;
    } else if (token.startsWith('--only=')) {
      args.only = new Set(
        token
          .slice('--only='.length)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      );
    }
  }

  return args;
}

export async function generateCentennialNarrations(options = {}) {
  const repoRoot = options.repoRoot ?? DEFAULT_REPO_ROOT;
  const outDir =
    options.outDir ?? path.join(repoRoot, 'public', 'narrations');
  const dryRun = Boolean(options.dryRun);
  const only = options.only ?? null;

  const { blueprints, loadedModules } = await loadCentennialBlueprints(repoRoot);
  const selected = only
    ? blueprints.filter((bp) => only.has(bp.id))
    : blueprints;

  if (!dryRun) {
    fs.mkdirSync(outDir, { recursive: true });
  }

  const generated = [];
  let totalBytes = 0;

  for (const bp of selected) {
    const bundle = buildCentennialNarrationBundle(bp);
    const jsonText = `${JSON.stringify(bundle, null, 2)}\n`;
    const bytes = Buffer.byteLength(jsonText, 'utf8');
    totalBytes += bytes;
    const outPath = path.join(outDir, `${bp.id}.json`);
    if (!dryRun) {
      fs.writeFileSync(outPath, jsonText, 'utf8');
    }
    generated.push({
      id: bp.id,
      orderIndex: bp.orderIndex,
      outPath,
      partsCount: Object.keys(bundle.parts).length,
      bytes,
    });
  }

  return {
    dryRun,
    outDir,
    loadedModules,
    count: generated.length,
    totalParts: generated.reduce((s, g) => s + g.partsCount, 0),
    totalBytes,
    generated,
  };
}

async function main() {
  const cli = parseCliArgs(process.argv.slice(2));
  const result = await generateCentennialNarrations(cli);

  if (cli.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    return;
  }

  const mode = result.dryRun ? 'DRY-RUN' : 'WRITTEN';
  process.stdout.write(
    `[centennial-narrations] ${mode} ${result.count} exhibit bundles (${result.totalParts} parts, ${(result.totalBytes / 1024).toFixed(1)} KB) -> ${result.outDir}\n`
  );
  for (const mod of result.loadedModules) {
    process.stdout.write(`  - ${mod.file}: ${mod.count} blueprints\n`);
  }
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  main().catch((err) => {
    process.stderr.write(
      `[centennial-narrations] ERROR: ${err instanceof Error ? err.stack ?? err.message : String(err)}\n`
    );
    process.exitCode = 1;
  });
}

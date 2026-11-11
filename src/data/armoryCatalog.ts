import { AUG_MODULE } from './weapons/augModule';
import { AWM_MODULE } from './weapons/awmModule';
import { DEAGLE_MODULE } from './weapons/deagleModule';
import { M4A1_MODULE } from './weapons/m4a1Module';
import { M82A1_MODULE } from './weapons/m82a1Module';
import { MP5_MODULE } from './weapons/mp5Module';
import { P320_MODULE } from './weapons/p320Module';
import { SCAR_MODULE } from './weapons/scarModule';

export type ArmoryCategory =
  | 'all'
  | 'assault'
  | 'smg'
  | 'sniper'
  | 'pistol';

export interface ArmoryWeaponItem {
  id: string;
  bayCode: string;
  modelCode: string;
  nameCn: string;
  subtitleEn: string;
  originCountryCn?: string;
  weaponTypeCn?: string;
  category: 'pistol' | 'rifle' | 'smg' | 'sniper';
  categoryCn: string;
  caliber: string;
  actionMechanism: string;
  assembliesCount: number;
  partsCount: number;
  firingStagesCount: number;
  available: boolean;
  statusLabel: string;
  description: string;
  highlights: string[];
}

export const AK15_CATALOG_ITEM: ArmoryWeaponItem = {
  id: 'ak15',
  bayCode: 'BAY-01',
  modelCode: 'KALASHNIKOV AK-15M1 · 6П71М (OBR. 2023)',
  nameCn: '卡拉什尼科夫 AK-15M1 突击步枪',
  subtitleEn: '7.62×39mm Latest 5th-Gen Kalashnikov Service Rifle',
  originCountryCn: '俄罗斯',
  weaponTypeCn: '突击步枪',
  category: 'rifle',
  categoryCn: '突击步枪',
  caliber: '7.62×39mm (M43)',
  actionMechanism: '长行程导气活塞 · 双突笋回转枪机闭锁',
  assembliesCount: 4,
  partsCount: 26,
  firingStagesCount: 7,
  available: true,
  statusLabel: '最新入库 · 可拆解',
  description:
    'AK-47 家族正统 7.62×39mm 最新定型第五代军用制式步枪（6П71М 2023-2025 实战改进型）：配备五槽快拆消音器接口消焰器、90°导气箍兼准星座、自由浮置耐热护木、横插锁销全通导轨机匣盖、全天候双觇孔照门、取消两连发的双侧拇指快慢机（ПР/АВ/ОД）、EVO 可调贴腮折叠托及透明余弹窗大弯弹匣。',
  highlights: [
    '长行程活塞 + 35°回转枪机',
    '2023 双侧快慢机 & EVO 贴腮托',
    '7.62×39 透明余弹窗弧形弹匣',
    '2K 俄式烤漆与活塞烧蚀贴图',
  ],
};

export const G17_CATALOG_ITEM: ArmoryWeaponItem = {
  id: 'g17',
  bayCode: 'BAY-04',
  modelCode: 'GLOCK 17 · GEN3',
  nameCn: '格洛克 G17 制式手枪',
  subtitleEn: '9×19mm Safe Action Schematic',
  originCountryCn: '奥地利',
  weaponTypeCn: '半自动手枪',
  category: 'pistol',
  categoryCn: '半自动手枪',
  caliber: '9×19mm Parabellum',
  actionMechanism: '枪管短后坐偏移闭锁 · 平移击针',
  assembliesCount: 4,
  partsCount: 28,
  firingStagesCount: 7,
  available: true,
  statusLabel: '已入库 · 可拆解',
  description:
    '现代聚合物机匣勤务手枪代表作。完整构建氮化钢套筒、冷锻枪管、Safe Action 三重被动保险火控及钢衬双排弹匣共 28 个精密节点，支持分阶段爆炸拆解与动态击发抛壳演示。',
  highlights: [
    '2K 真实 PBR 材质贴图',
    '4 大总成 / 28 零件爆炸拆解',
    '7 阶段子弹动态发射模拟',
    'X-Ray 外壳透视咬合特写',
  ],
};

export const ARMORY_WEAPONS: ArmoryWeaponItem[] = [
  // BAY-01: Kalashnikov AK-15M1 (7.62x39mm)
  AK15_CATALOG_ITEM,
  // BAY-02: Colt M4A1 Carbine (5.56x45mm NATO)
  { ...M4A1_MODULE.catalog, available: true },
  // BAY-03: H&K MP5A3 Submachine Gun (9x19mm)
  { ...MP5_MODULE.catalog, category: 'smg', available: true },
  // BAY-04: Glock 17 Gen3 Pistol (9x19mm)
  G17_CATALOG_ITEM,
  // BAY-05: Barrett M82A1 Anti-Materiel Rifle (.50 BMG)
  { ...M82A1_MODULE.catalog, category: 'sniper', available: true },
  // BAY-06: Accuracy International AWM Sniper Rifle (.338 Lapua Magnum)
  { ...AWM_MODULE.catalog, category: 'sniper', available: true },
  // BAY-07: FN SCAR-L Mk 16 Mod 0 Modular Rifle (5.56x45mm NATO)
  { ...SCAR_MODULE.catalog, available: true },
  // BAY-08: Desert Eagle Mark XIX Pistol (.50 AE)
  { ...DEAGLE_MODULE.catalog, available: true },
  // BAY-09: Steyr AUG A1 Bullpup Rifle (5.56x45mm NATO)
  { ...AUG_MODULE.catalog, available: true },
  // BAY-10: SIG Sauer P320 M17 Service Pistol (9x19mm)
  { ...P320_MODULE.catalog, available: true },
];

export function matchesArmoryCategory(
  item: ArmoryWeaponItem,
  filter: ArmoryCategory
): boolean {
  if (filter === 'all') return true;
  const typeTag = `${item.weaponTypeCn ?? ''} ${item.categoryCn}`;
  const isPistol = item.category === 'pistol' || typeTag.includes('手枪');
  const isSmg =
    item.id === 'mp5' || item.category === 'smg' || typeTag.includes('冲锋');
  const isSniper =
    item.id === 'm82a1' ||
    item.id === 'awm' ||
    item.category === 'sniper' ||
    typeTag.includes('狙击') ||
    typeTag.includes('反器材');

  if (filter === 'pistol') return isPistol;
  if (filter === 'smg') return isSmg;
  if (filter === 'sniper') return isSniper;
  if (filter === 'assault') return !isPistol && !isSmg && !isSniper;
  return true;
}

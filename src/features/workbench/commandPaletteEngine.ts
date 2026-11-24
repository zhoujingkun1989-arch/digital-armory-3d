import { openKeyboardShortcutsModal } from '../../app/useKeyboardShortcuts';
import {
  copyCurrent3dViewLink,
  triggerSlowMoCutawayCinema,
} from '../../app/useUrlStateSync';
import { playWorkbenchFoley } from '../../engine/audio/mechanicalSoundEngine';
import {
  ARMORY_WEAR_PRESETS,
  resolveWearPresetFromLevel,
} from '../../engine/materials/armoryShader';
import { isTankWeapon } from '../../engine/physics/armoryPhysics';
import { useTankCrewStore } from '../../engine/tank/tankCrewStore';
import { COMMAND_PALETTE_STRINGS } from '../../i18n/commandPaletteStrings';
import { UI_STRINGS } from '../../i18n/uiStrings';
import { WEAPON_EN_FALLBACKS } from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { type AppState, useAppStore } from '../../store/useAppStore';
import { WEAPON_MANIFESTS } from '../../weapons/manifests';
import {
  MUSEUM_EXHIBIT_COUNT,
  MUSEUM_TIMELINE_LINEAGE_COUNT,
  MUSEUM_TIMELINE_MAX_YEAR,
  MUSEUM_TIMELINE_MIN_YEAR,
  MUSEUM_TIMELINE_SPAN_LABEL,
  MUSEUM_TIMELINE_TOUR_COUNT,
  resolveArmorLabPresetForWeapon,
} from '../../weapons/museumMetrics';
import type { WeaponId, WeaponPartSpec } from '../../weapons/types';
import { queueMechanismShowdownLaunch } from '../armory/mechanismShowdownSpecs';

export type CommandPaletteGroupId = 'weapons' | 'parts' | 'labs' | 'actions';

export type CommandPaletteIconKey =
  | 'weapon'
  | 'part'
  | 'armory'
  | 'showcase'
  | 'cartridge'
  | 'ballistics'
  | 'showdown'
  | 'atlas'
  | 'poster'
  | 'monograph'
  | 'story'
  | 'cutaway'
  | 'xray'
  | 'wear'
  | 'env_vault'
  | 'env_bench'
  | 'env_daylight'
  | 'fieldstrip'
  | 'malfunction'
  | 'caliper'
  | 'tint'
  | 'firing'
  | 'edges'
  | 'labels'
  | 'sfx'
  | 'hud'
  | 'lang'
  | 'reset';

export type CommandStatusTone = 'cyan' | 'teal' | 'amber' | 'emerald' | 'muted';

export interface CommandPaletteItem {
  id: string;
  group: CommandPaletteGroupId;
  icon: CommandPaletteIconKey;
  title: string;
  subtitle: string;
  codeBadge?: string;
  shortcut?: string;
  statusBadge?: string;
  statusTone?: CommandStatusTone;
  isActive?: boolean;
  weaponId?: WeaponId;
  partId?: string;
  /** Weighted search fields: primary terms first, secondary metadata & bilingual aliases after. */
  primaryFields: readonly string[];
  secondaryFields: readonly string[];
  execute: () => void;
}

export interface CommandPaletteGroup {
  id: CommandPaletteGroupId;
  label: string;
  items: CommandPaletteItem[];
}

export interface CommandPaletteBuildContext {
  state: AppState;
  activeWeaponParts: readonly WeaponPartSpec[];
}

export const COMMAND_GROUP_ORDER: readonly CommandPaletteGroupId[] = [
  'weapons',
  'parts',
  'labs',
  'actions',
];

/**
 * Safely launches the Mechanism Showdown Matrix modal from ANY screen,
 * including both non-Armory screens (via `queueMechanismShowdownLaunch` + `returnToArmory`)
 * and when already standing inside `ArmoryView`.
 */
export function launchMechanismShowdownFromPalette(): void {
  const st = useAppStore.getState();
  st.closeCommandPalette();
  playWorkbenchFoley('preset_detent');
  if (st.screen === 'armory') {
    if (st.hudHidden) {
      st.setHudHidden(false);
    }
    if (typeof window !== 'undefined') {
      window.dispatchEvent(
        new KeyboardEvent('keydown', { key: 's', bubbles: true })
      );
    }
    return;
  }
  queueMechanismShowdownLaunch('matrix', st.activeWeaponId);
  st.returnToArmory();
}

function isWordBoundary(text: string, idx: number): boolean {
  if (idx <= 0) return true;
  const prev = text.charCodeAt(idx - 1);
  // Space, punctuation, dash, slash, dot, parens
  return (
    prev === 32 ||
    prev === 45 ||
    prev === 47 ||
    prev === 46 ||
    prev === 40 ||
    prev === 95 ||
    prev === 183
  );
}

/**
 * Computes a deterministic match score for a single normalized token against one field.
 * Returns `0` when no match exists.
 */
function scoreTokenAgainstField(token: string, rawField: string): number {
  const field = rawField.trim().toLowerCase();
  if (!field || !token) return 0;

  if (field === token) return 140;
  if (field.startsWith(token)) return 100;

  const idx = field.indexOf(token);
  if (idx >= 0) {
    return isWordBoundary(field, idx) ? 76 : 56;
  }

  // Ordered compact fuzzy subsequence match for ASCII tokens (e.g. "m4b", "ctsc", "ak15")
  if (token.length >= 2 && /^[\x20-\x7e]+$/.test(token)) {
    let qi = 0;
    let firstMatch = -1;
    let lastMatch = -1;
    let boundaryHits = 0;

    for (let fi = 0; fi < field.length && qi < token.length; fi++) {
      if (field[fi] === token[qi]) {
        if (firstMatch < 0) firstMatch = fi;
        if (isWordBoundary(field, fi)) boundaryHits++;
        lastMatch = fi;
        qi++;
      }
    }

    if (qi === token.length && firstMatch >= 0) {
      const span = lastMatch - firstMatch + 1;
      const maxSpan = token.length * 3 + 4;
      if (span <= maxSpan) {
        const tightness = token.length / span;
        return Math.round(16 + tightness * 18 + Math.min(8, boundaryHits * 3));
      }
    }
  }

  return 0;
}

/**
 * Scores a multi-token query against primary & secondary search fields.
 * Every whitespace-separated token must match at least one field.
 */
export function scoreSearchMatch(
  query: string,
  primaryFields: readonly string[],
  secondaryFields: readonly string[] = []
): number {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return 1;

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length === 0) return 1;

  let total = 0;
  for (const token of tokens) {
    let bestTokenScore = 0;
    for (const f of primaryFields) {
      const s = scoreTokenAgainstField(token, f);
      if (s > bestTokenScore) bestTokenScore = s;
    }
    for (const f of secondaryFields) {
      const s = Math.round(scoreTokenAgainstField(token, f) * 0.72);
      if (s > bestTokenScore) bestTokenScore = s;
    }
    if (bestTokenScore === 0) {
      return 0;
    }
    total += bestTokenScore;
  }

  // Bonus if the full unsplit phrase appears directly in a primary field
  if (tokens.length > 1) {
    for (const f of primaryFields) {
      if (f.toLowerCase().includes(normalized)) {
        total += 45;
        break;
      }
    }
  }

  return total;
}

function getWeaponCategoryTokens(
  id: WeaponId,
  category: string,
  categoryCn: string,
  weaponTypeCn?: string,
  weaponTypeEn?: string
): string[] {
  const tokens = [category, categoryCn];
  if (weaponTypeCn) tokens.push(weaponTypeCn);
  if (weaponTypeEn) tokens.push(weaponTypeEn);
  if (category === 'lmg' || id === 'm249' || id === 'm134') {
    tokens.push('lmg', 'machine gun', '轻机枪', '机枪');
  }
  if (id === 'm249') {
    tokens.push('saw', 'minimi');
  }
  if (id === 'g11') {
    tokens.push('caseless', 'clockwork', 'hk', '无壳弹', '发条', '转膛');
  }
  if (id === 'vss') {
    tokens.push(
      'vintorez',
      'subsonic',
      'suppressor',
      'pso-1',
      '微声',
      '消音',
      '亚音速'
    );
  }
  if (id === 'm134') {
    tokens.push(
      'minigun',
      'gatling',
      'rotary',
      'electric',
      '加特林',
      '转管',
      '米尼冈'
    );
  }
  if (id === 'an94') {
    tokens.push('abakan', 'pulley', 'hyperburst', '阿巴坎', '滑轮', '双发点射');
  }
  if (category === 'armor') {
    tokens.push(
      'armor',
      'heavy armor',
      'heavy armor hall',
      'tank',
      'mbt',
      'main battle tank',
      '重装甲',
      '重装甲大厅',
      '重装战车',
      '坦克',
      '主战坦克'
    );
  }
  if (id === 'ztz99a') {
    tokens.push(
      '99a',
      'ztz-99a',
      'type 99a',
      'zpt-98',
      '125mm',
      'apfsds',
      'dtc10',
      'fy-4',
      'era',
      'autoloader',
      'carousel',
      '99a主战坦克',
      '自动装弹机',
      '爆反',
      '穿甲弹'
    );
  }
  if (id === 'm1a2') {
    tokens.push(
      'abrams',
      'sep v3',
      'sepv3',
      'm256',
      '120mm',
      'apfsds',
      'm829a4',
      'agt1500',
      'turbine',
      'gas turbine',
      'chobham',
      'blast door',
      '艾布拉姆斯',
      '燃气轮机',
      '防爆门',
      '贫铀装甲'
    );
  }
  if (id === 'leopard2a7') {
    tokens.push(
      'leopard',
      'leopard 2',
      '2a7v',
      'kmw',
      'rh-120',
      'l55',
      'l/55a1',
      '120mm',
      'apfsds',
      'dm63a1',
      'mtu',
      'mb873',
      'arrowhead',
      '豹2',
      '豹2a7v',
      '箭簇装甲',
      '动力包'
    );
  }
  if (id === 'tiger1') {
    tokens.push(
      'tiger',
      'tiger 131',
      'tiger i',
      'pzkpfw vi',
      'kwk 36',
      '88mm',
      'pzgr39',
      'maybach',
      'hl230',
      'schachtellaufwerk',
      'wwii',
      'heavy tank',
      '虎式',
      '虎式131',
      '88炮',
      '迈巴赫',
      '交错负重轮',
      '重型坦克'
    );
  }
  if (id === 'winchester1894') {
    tokens.push(
      'winchester',
      '1894',
      'm1894',
      '30-30',
      'lever',
      'carbine',
      'browning',
      'saddle ring',
      '温彻斯特',
      '1894',
      '杠杆步枪',
      '马鞍环',
      '.30-30'
    );
  }
  if (id === 'rem870') {
    tokens.push(
      'remington',
      '870',
      'rem870',
      'police magnum',
      'pump',
      '12ga',
      '12 gauge',
      'shotgun',
      'action bars',
      '雷明顿',
      '870',
      '泵动霰弹枪',
      '玉米棒'
    );
  }
  if (id === 'm1911') {
    tokens.push(
      'm1911',
      'm1911a1',
      '1911',
      'colt',
      'browning',
      '45 acp',
      '.45',
      'swinging link',
      'government model',
      '柯尔特',
      '勃朗宁',
      '单绞链',
      '手枪'
    );
  }
  if (id === 'mg42') {
    tokens.push(
      'mg42',
      'mg 42',
      'maschinengewehr',
      'buzzsaw',
      'roller',
      '7.92',
      '8mm mauser',
      '1200 rpm',
      'gurttrommel',
      '通用机枪',
      '双滚柱',
      '撕布机'
    );
  }
  if (id === 'k98k') {
    tokens.push(
      'k98k',
      'kar98k',
      'karabiner 98k',
      'mauser',
      '98k',
      'byf 43',
      '7.92',
      '8mm mauser',
      'claw extractor',
      'stripper clip',
      '毛瑟',
      '毛瑟98k',
      '栓动步枪',
      '桥夹'
    );
  }
  if (id === 'thompson') {
    tokens.push(
      'thompson',
      'm1928a1',
      'tommy gun',
      'chicago typewriter',
      'blish',
      'drum',
      'cutts',
      '45 acp',
      '汤姆逊',
      '芝加哥打字机',
      '布利什',
      '发条弹鼓'
    );
  }
  if (category === 'ordnance' || id === 'gau8') {
    tokens.push(
      'ordnance',
      'heavy ordnance',
      'aero cannon',
      'autocannon',
      'gau-8',
      'gau8',
      'avenger',
      'a-10',
      'warthog',
      'brrrt',
      '30mm',
      '30x173',
      'pgu-14',
      'gatling',
      'rotary cannon',
      '航空重武',
      '航空机炮',
      '复仇者',
      '疣猪',
      '30毫米',
      '加特林航炮'
    );
  }
  if (category === 'rifle') {
    tokens.push('assault', 'carbine', '步枪');
  }
  if (category === 'archery') {
    tokens.push('bow', 'crossbow', 'archery', '弓弩', '复合弓', '复合弩');
  }
  return tokens;
}

/**
 * Builds the complete searchable command catalog for the current Zustand store snapshot
 * and active weapon's loaded runtime parts.
 */
export function buildCommandPaletteItems(
  ctx: CommandPaletteBuildContext
): CommandPaletteItem[] {
  const { state, activeWeaponParts } = ctx;
  const lang: LanguageCode = state.lang;
  const str = COMMAND_PALETTE_STRINGS[lang];
  const studioUi = UI_STRINGS[lang].studio;
  const items: CommandPaletteItem[] = [];

  // 1. All Museum Exhibits (derived dynamically from WEAPON_MANIFESTS)
  for (const manifest of WEAPON_MANIFESTS) {
    const id = manifest.id;
    const cat = manifest.catalog;
    const enFallback = WEAPON_EN_FALLBACKS[id];
    const isCurrent = state.activeWeaponId === id;

    const title = lang === 'en' ? enFallback.name : cat.nameCn;
    const caliberLabel =
      lang === 'en' ? (enFallback.caliber ?? cat.caliber) : cat.caliber;
    const actionLabel =
      lang === 'en' ? enFallback.actionMechanism : cat.actionMechanism;
    const subtitle = `${caliberLabel} · ${actionLabel}`;

    items.push({
      id: `weapon:${id}`,
      group: 'weapons',
      icon: 'weapon',
      title,
      subtitle,
      codeBadge: cat.bayCode,
      statusBadge: isCurrent ? str.modal.activeBadge : undefined,
      statusTone: isCurrent ? 'cyan' : undefined,
      isActive: isCurrent,
      weaponId: id,
      primaryFields: [
        id,
        cat.bayCode,
        manifest.shortLabel,
        enFallback.shortLabel,
        cat.nameCn,
        enFallback.name,
        cat.modelCode,
      ],
      secondaryFields: [
        cat.caliber,
        enFallback.caliber ?? '',
        cat.actionMechanism,
        enFallback.actionMechanism,
        cat.subtitleEn,
        cat.originCountryCn ?? '',
        enFallback.originCountry,
        ...getWeaponCategoryTokens(
          id,
          cat.category,
          cat.categoryCn,
          cat.weaponTypeCn,
          enFallback.weaponType
        ),
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().enterWorkbench(id, 'explode');
      },
    });
  }

  // 2. Active Weapon's Parts
  const activeManifest = WEAPON_MANIFESTS.find(
    (w) => w.id === state.activeWeaponId
  );
  const activeShort =
    lang === 'en'
      ? WEAPON_EN_FALLBACKS[state.activeWeaponId].shortLabel
      : (activeManifest?.shortLabel ?? state.activeWeaponId.toUpperCase());

  const GROUP_EN_LABELS: Record<WeaponPartSpec['group'], string> = {
    slide: 'Upper / Bolt Group',
    frame: 'Receiver / Frame',
    fire_control: 'Fire Control Group',
    magazine: 'Magazine & Feed',
  };

  for (const part of activeWeaponParts) {
    const isSelected =
      state.screen === 'workbench' && state.selectedPartId === part.id;
    const title = lang === 'en' ? part.nameEn : part.nameZh;
    const subtitle =
      lang === 'en'
        ? `${activeShort} · ${GROUP_EN_LABELS[part.group]} · ${part.bomCode}`
        : `${activeShort} · ${part.nameEn}`;

    items.push({
      id: `part:${state.activeWeaponId}:${part.id}`,
      group: 'parts',
      icon: 'part',
      title,
      subtitle,
      codeBadge: part.bomCode,
      statusBadge: isSelected ? str.modal.activeBadge : undefined,
      statusTone: isSelected ? 'cyan' : undefined,
      isActive: isSelected,
      weaponId: state.activeWeaponId,
      partId: part.id,
      primaryFields: [
        part.bomCode,
        part.nameZh,
        part.nameEn,
        part.calloutLabel,
        part.id,
      ],
      secondaryFields: [
        part.roleTag,
        part.group,
        part.material,
        activeShort,
        state.activeWeaponId,
      ],
      execute: () => {
        playWorkbenchFoley('part_select');
        useAppStore.getState().focusWorkbenchPart(part.id);
      },
    });
  }

  // 3. Navigation & Lab Modes
  items.push(
    {
      id: 'lab:armory',
      group: 'labs',
      icon: 'armory',
      title: str.labs.armoryTitle,
      subtitle: str.labs.armorySub,
      statusBadge: state.screen === 'armory' ? str.modal.activeBadge : undefined,
      statusTone: state.screen === 'armory' ? 'cyan' : undefined,
      isActive: state.screen === 'armory',
      primaryFields: [
        str.labs.armoryTitle,
        'Digital Armory Vault',
        '数字枪库',
        '枪库展厅',
      ],
      secondaryFields: [
        'armory',
        'vault',
        'hall',
        'heavy armor',
        'armor',
        'tank',
        'gallery',
        '展馆',
        '重装甲大厅',
        '坦克',
        '转台',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().returnToArmory();
      },
    },
    {
      id: 'lab:cartridges',
      group: 'labs',
      icon: 'cartridge',
      title: str.labs.cartridgesTitle,
      subtitle: str.labs.cartridgesSub,
      shortcut: 'B',
      statusBadge:
        state.screen === 'cartridges' ? str.modal.activeBadge : undefined,
      statusTone: state.screen === 'cartridges' ? 'cyan' : undefined,
      isActive: state.screen === 'cartridges',
      primaryFields: [
        str.labs.cartridgesTitle,
        '1:1 Cartridge Cutaway Lab',
        '实弹剖视对比实验室',
        '弹药剖视馆',
      ],
      secondaryFields: [
        'cartridge',
        'ammo',
        'ammunition',
        'ordnance',
        'caliber',
        'saami',
        'bullet',
        '88mm',
        '120mm',
        '125mm',
        'apfsds',
        'pzgr39',
        '弹药',
        '子弹',
        '炮弹',
        '穿甲弹',
        '口径',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openCartridgeLab();
      },
    },
    {
      id: 'lab:tank_ordnance',
      group: 'labs',
      icon: 'cartridge',
      title:
        lang === 'en'
          ? '1:1 Tank & Aero Cannon Ordnance Cutaway Lab'
          : '1:1 航空机炮弹与主战坦克炮弹纵剖对比馆',
      subtitle:
        lang === 'en'
          ? '30×173mm PGU-14/B · 88mm PzGr.39 · 120mm NATO APFSDS · 125mm DTC10-125 at 1:1 scale'
          : '30×173mm 航炮弹 · 88mm PzGr.39 · 120mm NATO APFSDS · 125mm DTC10-125 绝对比例纵剖同台陈列',
      codeBadge: '30/88/120/125mm',
      primaryFields: [
        '1:1 Tank Cannon Ordnance Cutaway Lab',
        '主战坦克炮弹纵剖对比馆',
        'Tank Ordnance',
        '坦克炮弹',
        '30mm PGU-14/B',
        '125mm APFSDS',
        '120mm APFSDS',
        '88mm PzGr.39',
      ],
      secondaryFields: [
        'apfsds',
        'sabot',
        'pzgr39',
        'dtc10',
        'm829a4',
        'dm63a1',
        'pgu-14',
        'gau8',
        '30mm',
        'armor',
        'tank',
        'heavy armor',
        '穿甲弹',
        '脱壳穿甲弹',
        '航炮弹',
        '主炮弹',
        '重装甲',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const st = useAppStore.getState();
        st.openCartridgeLab('125mm_apfsds');
        st.setCartridgeLineupOverview(true);
      },
    },
    {
      id: 'lab:ballistics',
      group: 'labs',
      icon: 'ballistics',
      title: str.labs.ballisticsTitle,
      subtitle: str.labs.ballisticsSub,
      shortcut: 'R',
      statusBadge:
        state.screen === 'ballistics' ? str.modal.activeBadge : undefined,
      statusTone: state.screen === 'ballistics' ? 'cyan' : undefined,
      isActive: state.screen === 'ballistics',
      primaryFields: [
        str.labs.ballisticsTitle,
        '1,000m External Ballistics DOPE Lab',
        '千米外弹道实验室',
        '外弹道靶场',
      ],
      secondaryFields: [
        'ballistics',
        'external',
        'dope',
        'rk4',
        '1000m',
        'reticle',
        'mil',
        'moa',
        'wind',
        '125mm',
        '120mm',
        '88mm',
        'apfsds',
        '外弹道',
        '分划板',
        '风偏',
        '射表',
        '坦克炮弹道',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openExternalBallistics();
      },
    },
    {
      id: 'lab:showdown',
      group: 'labs',
      icon: 'showdown',
      title: str.labs.showdownTitle,
      subtitle: str.labs.showdownSub,
      shortcut: 'S',
      primaryFields: [
        str.labs.showdownTitle,
        'Mechanism Showdown',
        '自动原理流派对照',
        '流派谱系矩阵',
      ],
      secondaryFields: [
        'showdown',
        'compare',
        'matrix',
        'taxonomy',
        'vs',
        '对比',
        '流派',
        '对照',
      ],
      execute: () => {
        launchMechanismShowdownFromPalette();
      },
    },
    {
      id: 'lab:split_showdown',
      group: 'labs',
      icon: 'showdown',
      title:
        lang === 'en'
          ? 'Live 3D Split-Screen Showdown'
          : '双展品实时 3D 同屏剖视对比台',
      subtitle:
        lang === 'en'
          ? 'Side-by-side synchronized 3D orbit, explosion, live firing & tri-axial CT cutaway'
          : '单画布双 3D 视口同步运镜、动作时序、击发曲线与多轴 CT 剖视对照',
      codeBadge: '3D VS',
      primaryFields: [
        'Live 3D Split-Screen Showdown',
        '双展品实时 3D 同屏剖视对比台',
        'Split Showdown',
        '同屏对比',
        '3D对比',
      ],
      secondaryFields: [
        'split',
        'side by side',
        '3d compare',
        'vs',
        'showdown',
        '双屏',
        '同步运镜',
        '对照',
      ],
      execute: () => {
        const st = useAppStore.getState();
        st.closeCommandPalette();
        playWorkbenchFoley('preset_detent');
        st.openSplitShowdown(st.activeWeaponId);
      },
    },
    {
      id: 'lab:causality',
      group: 'labs',
      icon: 'firing',
      title:
        state.lang === 'zh'
          ? '闭锁与内弹道因果沙盒'
          : 'Ballistic & Action Causality Sandbox',
      subtitle:
        state.lang === 'zh'
          ? '实时调参导气量、复进簧 k、机框质量与装药量并驱动 3D 射速与后坐'
          : 'Live-couple gas port, spring k, bolt mass, and charge to 3D cadence',
      statusBadge: state.causalitySandboxOpen ? str.modal.onBadge : undefined,
      statusTone: state.causalitySandboxOpen ? 'cyan' : undefined,
      isActive: state.causalitySandboxOpen,
      primaryFields: [
        'Ballistic & Action Causality Sandbox',
        '闭锁与内弹道因果沙盒',
        'Overgas Short-Stroke Bolt Mass',
      ],
      secondaryFields: [
        'causality',
        'sandbox',
        'gas',
        'spring',
        'overgas',
        'short stroke',
        '沙盒',
        '导气',
        '复进簧',
        '因果',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        if (cur.screen !== 'workbench') {
          cur.enterWorkbench(cur.activeWeaponId, 'firing');
        }
        useAppStore.getState().setCausalitySandboxOpen(true);
      },
    },
    {
      id: 'lab:armor-penetration',
      group: 'labs',
      icon: 'armory',
      title:
        state.lang === 'zh'
          ? '1:1 复合装甲与穿甲抗弹实验室'
          : '1:1 Composite Armor Penetration Lab',
      subtitle:
        state.lang === 'zh'
          ? '125mm/120mm APFSDS、88mm PzGr.39、30mm PGU-14/B 对抗 ZTZ-99A / M1A2 / 豹2A7 / 虎式装甲'
          : 'Lanz-Odermatt APFSDS & 30mm PGU-14/B vs ZTZ-99A, M1A2, Leopard 2A7V & Tiger I composite/ERA arrays',
      statusBadge: state.armorPenetrationModalOpen
        ? str.modal.onBadge
        : undefined,
      statusTone: state.armorPenetrationModalOpen ? 'amber' : undefined,
      isActive: state.armorPenetrationModalOpen,
      primaryFields: [
        '1:1 Composite Armor Penetration Lab',
        '穿甲抗弹实验室',
        'APFSDS RHAe ERA Composite 30mm',
      ],
      secondaryFields: [
        'armor',
        'penetration',
        'apfsds',
        'era',
        'rhae',
        'ricochet',
        'gau8',
        '30mm',
        '穿甲',
        '装甲',
        '反应装甲',
        '跳弹',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        cur.openArmorPenetrationModal(
          resolveArmorLabPresetForWeapon(cur.activeWeaponId)
        );
      },
    },
    {
      id: 'lab:director-reel',
      group: 'labs',
      icon: 'monograph',
      title:
        state.lang === 'zh'
          ? '导演级 3D 短片录制与导出'
          : 'WebGL Director Reel Video Exporter',
      subtitle:
        state.lang === 'zh'
          ? '实时合成 1080p WebM/MP4 机械短片与混音音轨'
          : 'Capture 1080p 16:9 or 9:16 mechanical showcase reels with SFX',
      statusBadge: state.directorReelModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.directorReelModalOpen ? 'amber' : undefined,
      isActive: state.directorReelModalOpen,
      primaryFields: [
        'Director Reel Video Capture',
        '导演短片录制导出',
        'WebM MP4 Video',
      ],
      secondaryFields: ['video', 'record', 'reel', 'webm', 'mp4', '录制', '视频', '导出'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openDirectorReelModal();
      },
    },
    {
      id: 'lab:passport',
      group: 'labs',
      icon: 'fieldstrip',
      title:
        state.lang === 'zh'
          ? `军械师全馆 ${MUSEUM_EXHIBIT_COUNT} 展品资格护照`
          : `${MUSEUM_EXHIBIT_COUNT}-Exhibit Armorer Mastery Passport`,
      subtitle:
        state.lang === 'zh'
          ? '汇总野战快拆、全拆精修与盲考等级并支持 JSON 导出/恢复'
          : `Unified S/A/B/C mastery ledger & JSON import/export across ${MUSEUM_EXHIBIT_COUNT} exhibits`,
      statusBadge: state.passportModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.passportModalOpen ? 'emerald' : undefined,
      isActive: state.passportModalOpen,
      primaryFields: [
        'Armorer Mastery Passport',
        '军械师资格护照',
        'Certification Ledger JSON',
      ],
      secondaryFields: ['passport', 'certification', 'ledger', 'rank', 'json', '护照', '证书', '档案'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openPassportModal();
      },
    },
    {
      id: 'lab:tank-crew',
      group: 'labs',
      icon: 'ballistics',
      title:
        state.lang === 'zh'
          ? '1:1 主战坦克车长 / 炮长火控台'
          : '1:1 Tank Crew Station & FLIR Gunner FCS',
      subtitle:
        state.lang === 'zh'
          ? '实时回转炮塔、俯仰主炮、热像白热/黑热切换与 LRF 自动装表'
          : 'Turret traverse, gun elevation, FLIR optics & LRF auto-lay (ZTZ-99A / M1A2 / Leo 2A7 / Tiger I)',
      primaryFields: [
        'Tank Crew Station FLIR Turret',
        '主战坦克车长火控台',
        'Turret Yaw Gunner Reticle',
      ],
      secondaryFields: ['tank', 'crew', 'turret', 'flir', 'gunner', 'fcs', '炮塔', '火控', '热像'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        const targetId = isTankWeapon(cur.activeWeaponId)
          ? cur.activeWeaponId
          : 'ztz99a';
        if (cur.screen !== 'workbench' || cur.activeWeaponId !== targetId) {
          cur.enterWorkbench(targetId, 'explode');
        }
        useTankCrewStore.getState().setActive(true);
      },
    },
    {
      id: 'lab:history-timeline',
      group: 'labs',
      icon: 'story',
      title:
        state.lang === 'zh'
          ? `${MUSEUM_TIMELINE_SPAN_LABEL} 枪械与装甲演化时间轴`
          : `${MUSEUM_TIMELINE_MIN_YEAR} - ${MUSEUM_TIMELINE_MAX_YEAR} Interactive History & Lineage Timeline`,
      subtitle:
        state.lang === 'zh'
          ? `${MUSEUM_TIMELINE_LINEAGE_COUNT} 大机构脉系、祖源连线追踪与 ${MUSEUM_TIMELINE_TOUR_COUNT} 条精选策展导览路线`
          : `Explore all ${MUSEUM_EXHIBIT_COUNT} exhibits across ${MUSEUM_TIMELINE_LINEAGE_COUNT} mechanical lineages & ${MUSEUM_TIMELINE_TOUR_COUNT} curated tours`,
      statusBadge: state.timelineModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.timelineModalOpen ? 'amber' : undefined,
      isActive: state.timelineModalOpen,
      primaryFields: [
        'History Timeline Patent Lineage',
        '演化时间轴专利谱系',
        `${MUSEUM_TIMELINE_MIN_YEAR} ${MUSEUM_TIMELINE_MAX_YEAR} Cold War Evolution`,
      ],
      secondaryFields: ['timeline', 'history', 'lineage', 'patent', 'evolution', '时间轴', '历史', '脉系'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openTimelineModal();
      },
    },
    {
      id: 'lab:scale-wall',
      group: 'labs',
      icon: 'caliper',
      title: UI_STRINGS[lang].workbench.scaleWallCmdTitle,
      subtitle: UI_STRINGS[lang].workbench.scaleWallCmdSub,
      statusBadge: state.scaleWallModalOpen ? str.modal.onBadge : '1:1',
      statusTone: state.scaleWallModalOpen ? 'cyan' : 'amber',
      isActive: state.scaleWallModalOpen,
      primaryFields: [
        UI_STRINGS[lang].workbench.scaleWallCmdTitle,
        '1:1 True-Scale Museum Wall',
        'Smithsonian True Scale Comparator',
        '1:1 真实尺度对比墙',
      ],
      secondaryFields: [
        'scale',
        'wall',
        '1:1',
        'size',
        'length',
        'ruler',
        'human',
        'hand',
        'smithsonian',
        'compare',
        '尺度',
        '尺寸',
        '比例',
        '对比墙',
        '身高',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openScaleWallModal();
      },
    },
    {
      id: 'lab:recoil-lab',
      group: 'labs',
      icon: 'firing',
      title: UI_STRINGS[lang].workbench.recoilLabCmdTitle,
      subtitle: UI_STRINGS[lang].workbench.recoilLabCmdSub,
      statusBadge: state.recoilLabOpen ? str.modal.onBadge : 'N·s',
      statusTone: state.recoilLabOpen ? 'amber' : 'cyan',
      isActive: state.recoilLabOpen,
      primaryFields: [
        UI_STRINGS[lang].workbench.recoilLabCmdTitle,
        'Recoil Impulse Gas-Jet Momentum Muzzle Climb Lab',
        '后坐冲量与枪口上跳实验室',
        '后坐实验室',
      ],
      secondaryFields: [
        'recoil',
        'impulse',
        'gas jet',
        'muzzle climb',
        'torque',
        'momentum',
        'brake',
        'bore axis',
        '后坐力',
        '后坐',
        '冲量',
        '枪口上跳',
        '制退器',
        '力矩',
        '动量',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openRecoilLab();
      },
    },
    {
      id: 'lab:offline-museum',
      group: 'labs',
      icon: 'atlas',
      title:
        state.lang === 'zh'
          ? 'PWA 离线博物馆与 KTX2 纹理中心'
          : 'PWA Offline Museum Cache & KTX2 Pipeline',
      subtitle:
        state.lang === 'zh'
          ? '按展品预缓存 GLB 精模与 4K 贴图以支持离线断网博物馆漫游'
          : 'Pre-cache GLB models & PBR textures for air-gapped offline museum browsing',
      statusBadge: state.offlineModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.offlineModalOpen ? 'emerald' : undefined,
      isActive: state.offlineModalOpen,
      primaryFields: [
        'Offline Museum Cache PWA KTX2',
        '离线博物馆缓存与 KTX2',
        'Basis Universal Transcoder',
      ],
      secondaryFields: ['offline', 'pwa', 'cache', 'ktx2', 'basis', '离线', '缓存'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openOfflineModal();
      },
    },
    {
      id: 'lab:atlas',
      group: 'labs',
      icon: 'atlas',
      title: str.labs.atlasTitle,
      subtitle: str.labs.atlasSub,
      statusBadge: state.textureModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.textureModalOpen ? 'cyan' : undefined,
      isActive: state.textureModalOpen,
      primaryFields: [
        str.labs.atlasTitle,
        'Texture Atlas Inspector',
        'PBR 材质贴图图集',
      ],
      secondaryFields: [
        'texture',
        'atlas',
        'pbr',
        'orm',
        'albedo',
        'normal',
        '贴图',
        '材质',
        '图集',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().setTextureModalOpen(true);
      },
    },
    {
      id: 'lab:poster',
      group: 'labs',
      icon: 'poster',
      title: str.labs.posterTitle,
      subtitle: str.labs.posterSub,
      shortcut: 'U',
      statusBadge: state.posterShareModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.posterShareModalOpen ? 'amber' : undefined,
      isActive: state.posterShareModalOpen,
      primaryFields: [
        str.labs.posterTitle,
        'HD Share Poster',
        '3D 剖视分享海报',
      ],
      secondaryFields: ['poster', 'share', 'card', 'png', '海报', '分享'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        cur.openPosterModal({ weaponId: cur.activeWeaponId });
      },
    },
    {
      id: 'lab:monograph',
      group: 'labs',
      icon: 'monograph',
      title: str.labs.monographTitle,
      subtitle: str.labs.monographSub,
      shortcut: '⌘P',
      statusBadge: state.monographModalOpen ? str.modal.onBadge : undefined,
      statusTone: state.monographModalOpen ? 'amber' : undefined,
      isActive: state.monographModalOpen,
      primaryFields: [
        str.labs.monographTitle,
        'Monograph Print',
        '收藏工程图鉴',
        '儿童绘本',
      ],
      secondaryFields: [
        'monograph',
        'print',
        'pdf',
        'book',
        'kids',
        '图鉴',
        '绘本',
        '打印',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        cur.openMonographModal(cur.activeWeaponId);
      },
    },
    {
      id: 'lab:story',
      group: 'labs',
      icon: 'story',
      title: str.labs.storyTitle,
      subtitle: str.labs.storySub,
      statusBadge: state.storyOpen ? str.modal.onBadge : undefined,
      statusTone: state.storyOpen ? 'cyan' : undefined,
      isActive: state.storyOpen,
      primaryFields: [
        str.labs.storyTitle,
        '4-Act R&D Documentary Story',
        '研发故事纪录片',
      ],
      secondaryFields: [
        'story',
        'documentary',
        'history',
        'director',
        'narration',
        'tts',
        '故事',
        '纪录片',
        '语音',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        const cur = useAppStore.getState();
        if (
          cur.screen === 'showcase' ||
          cur.screen === 'cartridges' ||
          cur.screen === 'ballistics'
        ) {
          cur.enterWorkbench(cur.activeWeaponId, 'explode');
        }
        useAppStore.getState().setStoryOpen(true);
      },
    },
    {
      id: 'lab:showcase',
      group: 'labs',
      icon: 'showcase',
      title: str.labs.showcaseTitle,
      subtitle: str.labs.showcaseSub,
      statusBadge:
        state.screen === 'showcase' ? str.modal.activeBadge : undefined,
      statusTone: state.screen === 'showcase' ? 'cyan' : undefined,
      isActive: state.screen === 'showcase',
      primaryFields: [
        str.labs.showcaseTitle,
        'Museum Showcase Home',
        '博物馆首页',
      ],
      secondaryFields: ['showcase', 'home', 'landing', '宣传页', '首页'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().openShowcase();
      },
    }
  );

  // 4. Quick Actions & Visual Controls
  const activeWear = resolveWearPresetFromLevel(state.weaponWearLevel);
  const nextWear =
    ARMORY_WEAR_PRESETS[
      (ARMORY_WEAR_PRESETS.indexOf(activeWear) + 1) % ARMORY_WEAR_PRESETS.length
    ];
  const currentWearLabel = studioUi.wearPresets[activeWear].label;
  const nextWearLabel = studioUi.wearPresets[nextWear].label;

  items.push(
    {
      id: 'action:slow-mo-cutaway-cinema',
      group: 'actions',
      icon: 'firing',
      title: UI_STRINGS[lang].timeline.cinemaDemoCmdTitle,
      subtitle: UI_STRINGS[lang].timeline.cinemaDemoCmdSub,
      statusBadge: '0.25x CT',
      statusTone: 'amber',
      primaryFields: [
        UI_STRINGS[lang].timeline.cinemaDemoCmdTitle,
        'Slow-Mo Cutaway Cinema Demo',
        'Matt Rittman Slow Motion Cutaway',
        '一键慢动作剖视演示',
      ],
      secondaryFields: [
        'cinema',
        'demo',
        'slow',
        'slowmo',
        '0.25x',
        'cutaway',
        'firing',
        'gas',
        'rittman',
        '慢动作',
        '剖视',
        '演示',
        '击发',
      ],
      execute: () => {
        triggerSlowMoCutawayCinema();
      },
    },
    {
      id: 'action:copy-3d-view-link',
      group: 'actions',
      icon: 'poster',
      title: UI_STRINGS[lang].workbench.copyViewLinkBtn,
      subtitle: UI_STRINGS[lang].workbench.copyViewLinkCmdSub,
      statusBadge: 'URL',
      statusTone: 'cyan',
      primaryFields: [
        UI_STRINGS[lang].workbench.copyViewLinkBtn,
        'Copy 3D View Link',
        'Share Deep Link URL',
        '复制 3D 视角链接',
      ],
      secondaryFields: [
        'copy',
        'link',
        'url',
        'share',
        'deeplink',
        'clipboard',
        '复制',
        '链接',
        '分享',
        '直达',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        void copyCurrent3dViewLink();
      },
    },
    {
      id: 'action:section-cut',
      group: 'actions',
      icon: 'cutaway',
      title: str.actions.sectionCutTitle,
      subtitle: str.actions.sectionCutSub,
      shortcut: 'C',
      statusBadge: state.sectionCut ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.sectionCut ? 'teal' : 'muted',
      isActive: state.sectionCut,
      primaryFields: [
        str.actions.sectionCutTitle,
        'Toggle Live Cutaway',
        'CT-Scan Section Plane',
        '实时纵剖面',
        '军械剖视',
      ],
      secondaryFields: [
        'cutaway',
        'section',
        'slice',
        'ct',
        'stencil',
        '剖视',
        '纵剖',
        '切面',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        const cur = useAppStore.getState();
        if (cur.screen === 'cartridges') {
          cur.toggleCartridgeSectionCut();
          return;
        }
        if (cur.screen === 'showcase' || cur.screen === 'ballistics') {
          cur.enterWorkbench(cur.activeWeaponId, 'explode');
          useAppStore.getState().setSectionCut(true);
          return;
        }
        cur.toggleSectionCut();
      },
    },
    {
      id: 'action:xray',
      group: 'actions',
      icon: 'xray',
      title: str.actions.xrayTitle,
      subtitle: str.actions.xraySub,
      shortcut: 'X',
      statusBadge: state.xrayShells ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.xrayShells ? 'cyan' : 'muted',
      isActive: state.xrayShells,
      primaryFields: [
        str.actions.xrayTitle,
        'Toggle X-Ray',
        'X-Ray Transparency',
        '外壳透视',
      ],
      secondaryFields: ['xray', 'x-ray', 'transparent', 'shell', '透视'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        const cur = useAppStore.getState();
        if (
          cur.screen === 'showcase' ||
          cur.screen === 'cartridges' ||
          cur.screen === 'ballistics'
        ) {
          cur.enterWorkbench(cur.activeWeaponId, 'explode');
          useAppStore.getState().setXrayShells(true);
          return;
        }
        cur.toggleXrayShells();
      },
    },
    {
      id: 'action:wear-cycle',
      group: 'actions',
      icon: 'wear',
      title: str.actions.wearCycleTitle,
      subtitle: str.actions.wearCycleSub(currentWearLabel, nextWearLabel),
      statusBadge: currentWearLabel,
      statusTone:
        activeWear === 'battle_worn'
          ? 'amber'
          : activeWear === 'field_oiled'
            ? 'cyan'
            : 'muted',
      primaryFields: [
        str.actions.wearCycleTitle,
        'Cycle Wear Patina',
        'Factory Field-Oiled Battle-Worn',
        '表面磨损包浆',
      ],
      secondaryFields: [
        'wear',
        'patina',
        'factory',
        'oiled',
        'battle',
        'worn',
        '磨损',
        '出厂',
        '勤务',
        '战损',
        '包浆',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().setWeaponWearPreset(nextWear);
      },
    },
    {
      id: 'action:env-vault',
      group: 'actions',
      icon: 'env_vault',
      title: str.actions.envVaultTitle,
      subtitle: str.actions.envVaultSub,
      statusBadge:
        state.environmentPreset === 'tactical_vault'
          ? str.modal.activeBadge
          : undefined,
      statusTone:
        state.environmentPreset === 'tactical_vault' ? 'cyan' : undefined,
      isActive: state.environmentPreset === 'tactical_vault',
      primaryFields: [
        str.actions.envVaultTitle,
        'Tactical Vault',
        '暗室展厅',
      ],
      secondaryFields: ['studio', 'lighting', 'dark', 'vault', '影棚', '暗室'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().setEnvironmentPreset('tactical_vault');
      },
    },
    {
      id: 'action:env-bench',
      group: 'actions',
      icon: 'env_bench',
      title: str.actions.envBenchTitle,
      subtitle: str.actions.envBenchSub,
      statusBadge:
        state.environmentPreset === 'gunsmith_bench'
          ? str.modal.activeBadge
          : undefined,
      statusTone:
        state.environmentPreset === 'gunsmith_bench' ? 'amber' : undefined,
      isActive: state.environmentPreset === 'gunsmith_bench',
      primaryFields: [
        str.actions.envBenchTitle,
        'Gunsmith Bench',
        '军械匠人台',
      ],
      secondaryFields: ['studio', 'lighting', 'warm', 'bench', '影棚', '匠人台'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().setEnvironmentPreset('gunsmith_bench');
      },
    },
    {
      id: 'action:env-daylight',
      group: 'actions',
      icon: 'env_daylight',
      title: str.actions.envDaylightTitle,
      subtitle: str.actions.envDaylightSub,
      statusBadge:
        state.environmentPreset === 'blueprint_daylight'
          ? str.modal.activeBadge
          : undefined,
      statusTone:
        state.environmentPreset === 'blueprint_daylight' ? 'cyan' : undefined,
      isActive: state.environmentPreset === 'blueprint_daylight',
      primaryFields: [
        str.actions.envDaylightTitle,
        'Blueprint Daylight',
        '工程白昼',
      ],
      secondaryFields: [
        'studio',
        'lighting',
        'light',
        'daylight',
        'blueprint',
        'theme',
        '影棚',
        '白昼',
        '蓝图',
        '亮色',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().setEnvironmentPreset('blueprint_daylight');
      },
    },
    {
      id: 'action:field-strip',
      group: 'actions',
      icon: 'fieldstrip',
      title: str.actions.fieldStripTitle,
      subtitle: str.actions.fieldStripSub,
      shortcut: 'G',
      statusBadge: state.fieldStripActive
        ? str.modal.onBadge
        : str.modal.offBadge,
      statusTone: state.fieldStripActive ? 'emerald' : 'muted',
      isActive: state.fieldStripActive,
      primaryFields: [
        str.actions.fieldStripTitle,
        'Toggle Field-Strip',
        'Armorer Blind Exam',
        '亲手快拆',
        '野战拆装',
      ],
      secondaryFields: [
        'fieldstrip',
        'field',
        'strip',
        'exam',
        'blind',
        'disassemble',
        '快拆',
        '盲拆',
        '考核',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().toggleFieldStripMode();
      },
    },
    {
      id: 'action:malfunction',
      group: 'actions',
      icon: 'malfunction',
      title: str.actions.malfunctionTitle,
      subtitle: str.actions.malfunctionSub,
      shortcut: 'J',
      statusBadge: state.malfunctionActive
        ? str.modal.onBadge
        : str.modal.offBadge,
      statusTone: state.malfunctionActive ? 'amber' : 'muted',
      isActive: state.malfunctionActive,
      primaryFields: [
        str.actions.malfunctionTitle,
        'Malfunctions Diagnostics',
        '故障排障室',
      ],
      secondaryFields: [
        'malfunction',
        'jam',
        'stovepipe',
        'double feed',
        'light strike',
        '故障',
        '卡壳',
        '排障',
      ],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().toggleMalfunctionMode();
      },
    },
    {
      id: 'action:caliper',
      group: 'actions',
      icon: 'caliper',
      title: str.actions.caliperTitle,
      subtitle: str.actions.caliperSub,
      shortcut: 'K',
      statusBadge: state.caliperActive ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.caliperActive ? 'cyan' : 'muted',
      isActive: state.caliperActive,
      primaryFields: [
        str.actions.caliperTitle,
        '3D Caliper',
        'Vernier Caliper',
        '游标卡尺',
      ],
      secondaryFields: ['caliper', 'measure', 'ruler', 'mm', '测量', '卡尺', '标尺'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleCaliperMode();
      },
    },
    {
      id: 'action:engineering-tint',
      group: 'actions',
      icon: 'tint',
      title: str.actions.engineeringTintTitle,
      subtitle: str.actions.engineeringTintSub,
      shortcut: 'T',
      statusBadge: state.engineeringTint
        ? str.modal.onBadge
        : str.modal.offBadge,
      statusTone: state.engineeringTint ? 'amber' : 'muted',
      isActive: state.engineeringTint,
      primaryFields: [
        str.actions.engineeringTintTitle,
        'Engineering Tint',
        'Functional Role Color',
        '原理分色',
      ],
      secondaryFields: ['tint', 'role', 'color', 'engineering', '分色', '职能'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        const cur = useAppStore.getState();
        if (
          cur.screen === 'showcase' ||
          cur.screen === 'cartridges' ||
          cur.screen === 'ballistics'
        ) {
          cur.enterWorkbench(cur.activeWeaponId, 'explode');
          useAppStore.getState().setEngineeringTint(true);
          return;
        }
        cur.toggleEngineeringTint();
      },
    },
    {
      id: 'action:firing-mode',
      group: 'actions',
      icon: 'firing',
      title: str.actions.firingModeTitle,
      subtitle: str.actions.firingModeSub,
      statusBadge:
        state.screen === 'workbench' &&
        state.mode === 'firing' &&
        !state.malfunctionActive
          ? str.modal.onBadge
          : str.modal.offBadge,
      statusTone:
        state.screen === 'workbench' &&
        state.mode === 'firing' &&
        !state.malfunctionActive
          ? 'amber'
          : 'muted',
      isActive:
        state.screen === 'workbench' &&
        state.mode === 'firing' &&
        !state.malfunctionActive,
      primaryFields: [
        str.actions.firingModeTitle,
        'Live Firing Simulation',
        '动态击发仿真',
      ],
      secondaryFields: ['fire', 'firing', 'shoot', 'cycle', '击发', '实弹', '射击'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        const cur = useAppStore.getState();
        if (cur.screen !== 'workbench') {
          cur.enterWorkbench(cur.activeWeaponId, 'firing');
        } else {
          cur.setMode(
            cur.mode === 'firing' && !cur.malfunctionActive
              ? 'explode'
              : 'firing'
          );
        }
      },
    },
    {
      id: 'action:edges',
      group: 'actions',
      icon: 'edges',
      title: str.actions.edgesTitle,
      subtitle: str.actions.edgesSub,
      shortcut: 'E',
      statusBadge: state.showEdges ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.showEdges ? 'cyan' : 'muted',
      isActive: state.showEdges,
      primaryFields: [str.actions.edgesTitle, 'CAD Hard-Edge Wireframe', '线框轮廓'],
      secondaryFields: ['edges', 'wireframe', 'cad', '线框', '棱边'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleShowEdges();
      },
    },
    {
      id: 'action:labels',
      group: 'actions',
      icon: 'labels',
      title: str.actions.labelsTitle,
      subtitle: str.actions.labelsSub,
      shortcut: 'L',
      statusBadge: state.showLabels ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.showLabels ? 'cyan' : 'muted',
      isActive: state.showLabels,
      primaryFields: [str.actions.labelsTitle, '3D Part Leader Callouts', '零件编号标注'],
      secondaryFields: ['labels', 'callout', 'annotations', '标注', '引线'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleShowLabels();
      },
    },
    {
      id: 'action:sfx',
      group: 'actions',
      icon: 'sfx',
      title: str.actions.sfxTitle,
      subtitle: str.actions.sfxSub,
      shortcut: 'M',
      statusBadge: !state.sfxMuted ? str.modal.onBadge : str.modal.offBadge,
      statusTone: !state.sfxMuted ? 'cyan' : 'muted',
      isActive: !state.sfxMuted,
      primaryFields: [str.actions.sfxTitle, 'Audio SFX Mute', '机械声效静音'],
      secondaryFields: ['audio', 'sound', 'sfx', 'mute', '声效', '静音'],
      execute: () => {
        useAppStore.getState().toggleSfxMuted();
      },
    },
    {
      id: 'action:hud-hidden',
      group: 'actions',
      icon: 'hud',
      title: str.actions.hudHiddenTitle,
      subtitle: str.actions.hudHiddenSub,
      shortcut: 'H',
      statusBadge: state.hudHidden ? str.modal.onBadge : str.modal.offBadge,
      statusTone: state.hudHidden ? 'cyan' : 'muted',
      isActive: state.hudHidden,
      primaryFields: [str.actions.hudHiddenTitle, 'Hide UI Clean Showcase', '纯净展陈隐藏按钮'],
      secondaryFields: ['hud', 'hide', 'clean', 'immersive', '纯净', '隐藏'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleHudHidden();
      },
    },
    {
      id: 'action:language',
      group: 'actions',
      icon: 'lang',
      title: str.actions.langSwitchTitle,
      subtitle: str.actions.langSwitchSub,
      statusBadge: lang === 'zh' ? 'ZH → EN' : 'EN -> ZH',
      statusTone: 'cyan',
      primaryFields: [
        str.actions.langSwitchTitle,
        'Language ZH EN',
        'Switch to English',
        '切换语言 中文 英文',
      ],
      secondaryFields: ['lang', 'language', 'chinese', 'english', 'zh', 'en', '双语', '语言'],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleLang();
      },
    },
    {
      id: 'action:gpu-telemetry',
      group: 'actions',
      icon: 'edges',
      title: UI_STRINGS[lang].workbench.gpuTelemetryCmdTitle,
      subtitle: UI_STRINGS[lang].workbench.gpuTelemetryCmdSub,
      statusBadge: state.gpuTelemetryOpen
        ? str.modal.onBadge
        : str.modal.offBadge,
      statusTone: state.gpuTelemetryOpen ? 'emerald' : 'muted',
      isActive: state.gpuTelemetryOpen,
      primaryFields: [
        UI_STRINGS[lang].workbench.gpuTelemetryCmdTitle,
        'GPU & WebGL Telemetry',
        'FPS Draw Calls Memory',
        '实时 GPU 性能遥测',
        '帧率 显存',
      ],
      secondaryFields: [
        'gpu',
        'fps',
        'webgl',
        'telemetry',
        'vram',
        'memory',
        'perf',
        'performance',
        'draw',
        'ktx2',
        'lru',
        '性能',
        '遥测',
        '帧率',
        '显存',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleGpuTelemetry();
      },
    },
    {
      id: 'action:workbench-orbit',
      group: 'actions',
      icon: 'reset',
      title:
        lang === 'en' ? 'Workbench Auto-Orbit' : '工作台展厅环绕检视',
      subtitle: UI_STRINGS[lang].workbench.orbitTitle(
        state.workbenchAutoOrbit
      ),
      statusBadge: state.workbenchAutoOrbit
        ? str.modal.onBadge
        : str.modal.offBadge,
      statusTone: state.workbenchAutoOrbit ? 'cyan' : 'muted',
      isActive: state.workbenchAutoOrbit,
      primaryFields: [
        lang === 'en' ? 'Workbench Auto-Orbit' : '工作台展厅环绕检视',
        'Orbit Camera Rotate',
        '环绕 旋转 检视',
      ],
      secondaryFields: [
        'orbit',
        'turntable',
        'spin',
        'rotate',
        'camera',
        '环绕',
        '自动旋转',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        useAppStore.getState().toggleWorkbenchAutoOrbit();
      },
    },
    {
      id: 'action:keyboard-shortcuts',
      group: 'actions',
      icon: 'story',
      title: UI_STRINGS[lang].shortcutsModal.cmdPaletteTitle,
      subtitle: UI_STRINGS[lang].shortcutsModal.cmdPaletteSub,
      shortcut: '?',
      primaryFields: [
        UI_STRINGS[lang].shortcutsModal.cmdPaletteTitle,
        'Keyboard Shortcuts',
        'Hotkeys Keymap Reference',
        '快捷键一览',
        '键盘快捷键',
      ],
      secondaryFields: [
        'keyboard',
        'shortcuts',
        'hotkey',
        'keymap',
        'help',
        '?',
        '按键',
        '热键',
        '帮助',
      ],
      execute: () => {
        playWorkbenchFoley('toggle_switch');
        openKeyboardShortcutsModal();
      },
    },
    {
      id: 'action:reset-all',
      group: 'actions',
      icon: 'reset',
      title: str.actions.resetAllTitle,
      subtitle: str.actions.resetAllSub,
      shortcut: '⇧R',
      primaryFields: [str.actions.resetAllTitle, 'Reset All Workbench', '重置视角'],
      secondaryFields: ['reset', 'restore', 'center', '重置', '复原'],
      execute: () => {
        playWorkbenchFoley('preset_detent');
        useAppStore.getState().resetAll();
      },
    }
  );

  return items;
}

export interface FilterCommandPaletteOptions {
  /** Max items per group when query is empty (keeps default browse list crisp). */
  emptyGroupCaps?: Partial<Record<CommandPaletteGroupId, number>>;
}

const DEFAULT_EMPTY_CAPS: Record<CommandPaletteGroupId, number> = {
  weapons: WEAPON_MANIFESTS.length,
  parts: 8,
  labs: 11,
  actions: 12,
};

/**
 * Filters, ranks, and groups command palette items deterministically for a query.
 */
export function filterCommandPaletteItems(
  items: readonly CommandPaletteItem[],
  query: string,
  lang: LanguageCode,
  options?: FilterCommandPaletteOptions
): { groups: CommandPaletteGroup[]; flatItems: CommandPaletteItem[] } {
  const str = COMMAND_PALETTE_STRINGS[lang];
  const trimmed = query.trim();

  const buckets: Record<
    CommandPaletteGroupId,
    Array<{ item: CommandPaletteItem; score: number; order: number }>
  > = {
    weapons: [],
    parts: [],
    labs: [],
    actions: [],
  };

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    if (!trimmed) {
      buckets[item.group].push({ item, score: item.isActive ? 2 : 1, order: i });
      continue;
    }
    const score = scoreSearchMatch(
      trimmed,
      item.primaryFields,
      item.secondaryFields
    );
    if (score > 0) {
      buckets[item.group].push({ item, score, order: i });
    }
  }

  const caps = { ...DEFAULT_EMPTY_CAPS, ...options?.emptyGroupCaps };
  const groups: CommandPaletteGroup[] = [];
  const flatItems: CommandPaletteItem[] = [];

  for (const groupId of COMMAND_GROUP_ORDER) {
    const list = buckets[groupId];
    if (list.length === 0) continue;

    if (trimmed) {
      list.sort((a, b) => b.score - a.score || a.order - b.order);
    } else if (groupId === 'weapons') {
      // Keep active exhibit surfaced first when browsing empty query
      list.sort((a, b) => Number(Boolean(b.item.isActive)) - Number(Boolean(a.item.isActive)) || a.order - b.order);
    }

    const sliced = trimmed ? list : list.slice(0, caps[groupId]);
    const groupItems = sliced.map((entry) => entry.item);
    groups.push({
      id: groupId,
      label: str.modal.groups[groupId],
      items: groupItems,
    });
    for (const item of groupItems) {
      flatItems.push(item);
    }
  }

  return { groups, flatItems };
}

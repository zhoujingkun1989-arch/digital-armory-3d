import { resolveWeaponDisplayMeta, resolvePartMaterialLabel } from '../../i18n/weaponFallbacks';
import type { LanguageCode } from '../../narration/types';
import { getWeaponManifest } from '../../weapons/manifests';
import { getLoadedWeaponPlugin } from '../../weapons/registry';
import type {
  ArmoryCategory,
  WeaponId,
  WeaponPartSpec,
} from '../../weapons/types';
import {
  WEAPON_RIFLING_SPECS,
  type RiflingKind,
  type RiflingTwistDirection,
} from '../ballistics/riflingSpecs';
import { getGlossaryTermsForWeapon } from '../encyclopedia/engineeringGlossary';
import {
  getEngineeringRoleMeta,
  resolvePartEngineeringRole,
} from '../materials/engineeringRoles';
import {
  CALIBER_BALLISTICS,
  isArcheryWeapon,
} from '../physics/armoryPhysics';

const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const DEFAULT_SHARE_ORIGIN =
  'https://zhoujingkun1989-arch.github.io/digital-armory-3d/';

export interface ExhibitProvenanceMeta {
  readonly year: number;
  readonly manufacturerEn: string;
  readonly manufacturerZh: string;
}

/**
 * Authoritative historical introduction year & manufacturer provenance across
 * all 34 exhibits (cross-checked against `HISTORY_TIMELINE_NODES` in tests;
 * kept local to avoid eagerly pulling lazy timeline modal chunks into `main`).
 */
export const EXHIBIT_PROVENANCE_TABLE: Readonly<
  Record<WeaponId, ExhibitProvenanceMeta>
> = {
  ak15: { year: 2023, manufacturerEn: 'Kalashnikov Concern', manufacturerZh: '卡拉什尼科夫集团' },
  m4a1: { year: 1994, manufacturerEn: 'Colt Defense', manufacturerZh: '柯尔特防务公司' },
  mp5: { year: 1966, manufacturerEn: 'Heckler & Koch', manufacturerZh: '黑克勒-科赫 (H&K)' },
  g17: { year: 1982, manufacturerEn: 'Glock Ges.m.b.H.', manufacturerZh: '格洛克公司' },
  m82a1: { year: 1982, manufacturerEn: 'Barrett Firearms', manufacturerZh: '巴雷特枪械制造公司' },
  awm: { year: 1996, manufacturerEn: 'Accuracy International', manufacturerZh: '英国精密国际 (AI)' },
  scar: { year: 2004, manufacturerEn: 'FN Herstal', manufacturerZh: '比利时 FN 赫斯塔尔' },
  deagle: { year: 1983, manufacturerEn: 'Magnum Research / IMI', manufacturerZh: '马格南研究 / 以色列军事工业' },
  aug: { year: 1977, manufacturerEn: 'Steyr Mannlicher', manufacturerZh: '奥地利斯太尔-曼利夏' },
  p320: { year: 2014, manufacturerEn: 'SIG Sauer', manufacturerZh: '西格绍尔 (SIG Sauer)' },
  p90: { year: 1990, manufacturerEn: 'FN Herstal', manufacturerZh: '比利时 FN 赫斯塔尔' },
  lift33: { year: 2024, manufacturerEn: 'Mathews Inc.', manufacturerZh: '马修斯复合弓 (Mathews)' },
  r500: { year: 2022, manufacturerEn: 'Ravin Crossbows', manufacturerZh: '拉文弩业 (Ravin)' },
  python: { year: 1955, manufacturerEn: "Colt's Manufacturing Co.", manufacturerZh: '柯尔特制造公司' },
  benellim4: { year: 1999, manufacturerEn: 'Benelli Armi SpA', manufacturerZh: '意大利伯奈利军工' },
  garand: { year: 1936, manufacturerEn: 'Springfield Armory', manufacturerZh: '美国春田兵工厂' },
  m249: { year: 1984, manufacturerEn: 'FN Herstal / FN America', manufacturerZh: 'FN 赫斯塔尔 / FN 美国' },
  p08: { year: 1900, manufacturerEn: 'DWM (Deutsche Waffen- und Munitionsfabriken)', manufacturerZh: '德国武器弹药工厂 (DWM)' },
  vector: { year: 2009, manufacturerEn: 'KRISS USA (TDI)', manufacturerZh: 'KRISS 美国 / 瑞士 TDI' },
  g11: { year: 1990, manufacturerEn: 'Heckler & Koch / Dynamit Nobel', manufacturerZh: '黑克勒-科赫 / 诺贝尔炸药公司' },
  vss: { year: 1987, manufacturerEn: 'TsNIITochMash (Tula Arms)', manufacturerZh: '俄中央精密机械研究院 (图拉)' },
  m134: { year: 1963, manufacturerEn: 'General Electric / Dillon Aero', manufacturerZh: '通用电气 / 狄龙航空' },
  an94: { year: 1994, manufacturerEn: 'Izhmash (Gennady Nikonov)', manufacturerZh: '伊热夫斯克兵工厂 (尼科诺夫)' },
  ztz99a: { year: 2011, manufacturerEn: 'NORINCO (First Machinery Group)', manufacturerZh: '中国兵器工业集团 (一机集团)' },
  m1a2: { year: 2017, manufacturerEn: 'General Dynamics Land Systems', manufacturerZh: '通用动力陆地系统 (GDLS)' },
  leopard2a7: { year: 2019, manufacturerEn: 'KNDS Deutschland (KMW / Rheinmetall)', manufacturerZh: '克劳斯-玛菲·韦格曼 / 莱茵金属' },
  tiger1: { year: 1942, manufacturerEn: 'Henschel & Sohn / Krupp', manufacturerZh: '亨舍尔公司 / 克虏伯炮厂' },
  winchester1894: { year: 1894, manufacturerEn: 'Winchester Repeating Arms (John Browning)', manufacturerZh: '温彻斯特连发武器公司 (勃朗宁)' },
  rem870: { year: 1950, manufacturerEn: 'Remington Arms Co.', manufacturerZh: '雷明顿武器公司' },
  m1911: { year: 1911, manufacturerEn: "Colt's Patent Fire Arms (John Browning)", manufacturerZh: '柯尔特专利枪械公司 (勃朗宁)' },
  mg42: { year: 1942, manufacturerEn: 'Metall- und Lackierwarenfabrik Johannes Großfuß', manufacturerZh: '德国格罗斯富斯金属冲压厂' },
  k98k: { year: 1935, manufacturerEn: 'Mauser-Werke Oberndorf', manufacturerZh: '德国奥伯恩多夫毛瑟工厂' },
  thompson: { year: 1928, manufacturerEn: 'Auto-Ordnance Corporation', manufacturerZh: '美国自动军械公司' },
  gau8: { year: 1977, manufacturerEn: 'General Electric Armament Systems', manufacturerZh: '通用电气军械系统部' },
};

const HALL_CLASSIFICATION_LABELS: Readonly<
  Record<ArmoryCategory | 'rifle', { en: string; zh: string }>
> = {
  all: { en: 'Master Vault Collection', zh: '全馆馆藏' },
  assault: { en: 'Assault Rifle & Service Carbine Hall', zh: '突击步枪与卡宾展厅' },
  rifle: { en: 'Assault Rifle & Service Carbine Hall', zh: '突击步枪与卡宾展厅' },
  lmg: { en: 'Machine Gun & Rotary Support Hall', zh: '机枪与转管火力展厅' },
  smg: { en: 'Submachine Gun & PDW Hall', zh: '冲锋枪与个人防卫展厅' },
  sniper: { en: 'Precision Sniper & Anti-Materiel Hall', zh: '精确狙击与反器材展厅' },
  shotgun: { en: 'Tactical & Combat Shotgun Hall', zh: '战术霰弹枪展厅' },
  pistol: { en: 'Service Pistol & Magnum Revolver Hall', zh: '战术手枪与转轮展厅' },
  archery: { en: 'Compound Archery Mechanics Hall', zh: '复合弓弩机械展厅' },
  armor: { en: '1:1 Heavy Armor Main Battle Tank Hall', zh: '1:1 重装主战坦克大厅' },
  ordnance: { en: '1:1 Heavy Aero Rotary Ordnance Hall', zh: '1:1 重型航空旋转机炮展厅' },
};

const RIFLING_PROFILE_LABELS: Readonly<
  Record<RiflingKind, { en: string; zh: string }>
> = {
  cut_rifled: { en: 'Cut / Cold Hammer-Forged Rifling', zh: '切削 / 冷锻螺旋膛线' },
  polygonal: { en: 'Polygonal Rifling', zh: '多边形螺旋膛线' },
  smoothbore: { en: 'Smoothbore (Unrifled)', zh: '滑膛内膛（无膛线）' },
  none: { en: 'Non-Rifled (Compound Archery)', zh: '无枪管膛线（复合弓弩储能机构）' },
};

const TWIST_DIRECTION_LABELS: Readonly<
  Record<RiflingTwistDirection, { en: string; zh: string }>
> = {
  RH: { en: 'Right-Hand (RH)', zh: '右旋 (RH)' },
  LH: { en: 'Left-Hand (LH)', zh: '左旋 (LH)' },
  none: { en: 'N/A', zh: '无旋向' },
};

export interface TechDossierPartOverride {
  part: WeaponPartSpec;
  groupTitle?: string;
  materialLabel?: string;
  engineeringNote?: string;
  cadEnvelopeMm?: string;
}

export interface FormatTechDossierParams {
  weaponId: WeaponId;
  partId?: string | null;
  lang: LanguageCode;
  shareUrl?: string;
  /** Optional pre-resolved part detail from active UI context */
  partOverride?: TechDossierPartOverride | null;
}

function sanitizeEnglishText(value: string, fallback: string): string {
  const trimmed = value.trim();
  if (!trimmed || CJK_RE.test(trimmed)) return fallback;
  return trimmed;
}

function formatMuzzleEnergy(energyJ: number, lang: LanguageCode): string {
  if (energyJ >= 1_000_000) {
    const mj = (energyJ / 1_000_000).toFixed(2);
    return lang === 'en'
      ? `${mj} MJ (${Math.round(energyJ).toLocaleString('en-US')} J)`
      : `${mj} MJ（${Math.round(energyJ).toLocaleString('en-US')} J）`;
  }
  return `${Math.round(energyJ).toLocaleString('en-US')} J`;
}

function resolveHallLabel(
  weaponId: WeaponId,
  lang: LanguageCode
): string {
  const manifest = getWeaponManifest(weaponId);
  const cat = manifest.catalog.category;
  if (weaponId === 'm249' || weaponId === 'm134' || weaponId === 'mg42') {
    return HALL_CLASSIFICATION_LABELS.lmg[lang];
  }
  const entry =
    HALL_CLASSIFICATION_LABELS[
      cat as keyof typeof HALL_CLASSIFICATION_LABELS
    ] ?? HALL_CLASSIFICATION_LABELS.assault;
  return entry[lang];
}

function resolveDefaultShareUrl(
  weaponId: WeaponId,
  partId?: string | null
): string {
  const base = `${DEFAULT_SHARE_ORIGIN}?screen=workbench&weapon=${encodeURIComponent(weaponId)}`;
  return partId ? `${base}&part=${encodeURIComponent(partId)}` : base;
}

/**
 * Formats a self-contained Smithsonian / IEEE-style Markdown engineering
 * specification dossier for any of the 34 exhibits (and optional selected part).
 * Pure, DOM-free, zero-circular-import formatter with 0 EN CJK & 0 WP-XX leaks.
 */
export function formatWeaponPartTechDossierMarkdown(
  params: FormatTechDossierParams
): string {
  const { weaponId, partId = null, lang, shareUrl, partOverride } = params;
  const manifest = getWeaponManifest(weaponId);
  const provenance = EXHIBIT_PROVENANCE_TABLE[weaponId];
  const displayMeta = resolveWeaponDisplayMeta(weaponId, lang, null);
  const caliberSpec = CALIBER_BALLISTICS[manifest.caliberProfile];
  const rifling = WEAPON_RIFLING_SPECS[weaponId];
  const glossaryTerms = getGlossaryTermsForWeapon(weaponId);
  const archery = isArcheryWeapon(weaponId);

  const exhibitTitle =
    lang === 'en'
      ? sanitizeEnglishText(displayMeta.name, manifest.shortLabel)
      : displayMeta.name;
  const nation =
    lang === 'en'
      ? sanitizeEnglishText(displayMeta.originTag, 'International')
      : displayMeta.originTag;
  const manufacturer =
    lang === 'en' ? provenance.manufacturerEn : provenance.manufacturerZh;
  const hallLabel = resolveHallLabel(weaponId, lang);
  const mechanism =
    lang === 'en'
      ? sanitizeEnglishText(
          displayMeta.actionMechanism,
          'Mechanical Operating System'
        )
      : displayMeta.actionMechanism;
  const caliberDisplay =
    lang === 'en'
      ? sanitizeEnglishText(caliberSpec.labelEn, displayMeta.caliber)
      : caliberSpec.labelZh;
  const oalDisplay =
    lang === 'en'
      ? sanitizeEnglishText(displayMeta.overallLengthMm, 'See 1:1 Metrology')
      : displayMeta.overallLengthMm;
  const rofDisplay =
    lang === 'en'
      ? sanitizeEnglishText(displayMeta.rateOfFire, 'Manual / Semi-Auto')
      : displayMeta.rateOfFire;

  const resolvedShareUrl =
    shareUrl && shareUrl.trim().length > 0
      ? shareUrl.trim()
      : resolveDefaultShareUrl(weaponId, partId);

  const lines: string[] = [];

  if (lang === 'en') {
    lines.push(`# ${exhibitTitle} — Technical Engineering Dossier`);
    lines.push('');
    lines.push(
      `> **Digital Armory 3D** · ${manifest.catalog.bayCode} · ${manifest.catalog.modelCode}`
    );
    lines.push('');
    lines.push('## 1. Exhibit Provenance & Operating Architecture');
    lines.push(`- **Introduction Year**: ${provenance.year}`);
    lines.push(`- **Nation / Manufacturer**: ${nation} · ${manufacturer}`);
    lines.push(`- **Museum Hall**: ${hallLabel}`);
    lines.push(`- **Operating Mechanism**: ${mechanism}`);
    lines.push(`- **Overall Length**: ${oalDisplay}`);
    lines.push('');

    lines.push('## 2. Ballistic & Kinematic Metrology');
    lines.push('| Metric | Value |');
    lines.push('| :--- | :--- |');
    if (archery && caliberSpec.archerySpec) {
      const a = caliberSpec.archerySpec;
      lines.push(`| Projectile | ${caliberDisplay} (${a.grainWeight} gr) |`);
      lines.push(
        `| Peak Draw Weight | ${a.peakDrawForceLb} lbf (${a.peakDrawForceN} N · ${a.letOffPercent}% Let-Off) |`
      );
      lines.push(
        `| Launch Velocity | ${caliberSpec.muzzleVelocityMps} m/s (${a.velocityFps} FPS) |`
      );
      lines.push(
        `| Kinetic Energy | ${formatMuzzleEnergy(caliberSpec.muzzleEnergyJ, 'en')} |`
      );
      lines.push(
        `| Power Stroke / Brace Height | ${a.powerStrokeMm} mm / ${a.braceHeightMm} mm |`
      );
    } else {
      lines.push(`| Caliber | ${caliberDisplay} |`);
      lines.push(
        `| Peak Chamber Pressure | ${caliberSpec.peakPressureMPa} MPa (${caliberSpec.standard}) |`
      );
      lines.push(`| Muzzle Velocity | ${caliberSpec.muzzleVelocityMps} m/s |`);
      lines.push(
        `| Muzzle Energy | ${formatMuzzleEnergy(caliberSpec.muzzleEnergyJ, 'en')} |`
      );
      lines.push(`| Cyclic Rate / Action | ${rofDisplay} |`);
    }
    lines.push('');

    lines.push('## 3. Bore & Rifling Specification');
    lines.push(`- **Profile**: ${RIFLING_PROFILE_LABELS[rifling.kind].en}`);
    if (rifling.boreDiameterMm > 0) {
      lines.push(`- **Nominal Bore Diameter**: Ø${rifling.boreDiameterMm} mm`);
    }
    if (rifling.kind === 'cut_rifled' || rifling.kind === 'polygonal') {
      lines.push(`- **Lands & Grooves**: ${rifling.grooves}`);
      lines.push(
        `- **Twist Rate & Direction**: 1:${rifling.twistInches}" (${rifling.twistMm} mm) · ${TWIST_DIRECTION_LABELS[rifling.direction].en}`
      );
    } else if (rifling.kind === 'smoothbore') {
      lines.push('- **Lands & Grooves**: 0 (Smoothbore)');
      lines.push('- **Twist Rate**: N/A (Fin-Stabilized / Smoothbore)');
    }
    lines.push(
      `- **Bore Lining**: ${rifling.chromeLined ? 'Hard-Chrome Lined' : 'Ordnance Steel / Non-Chrome'}`
    );
    lines.push(`- **Specification Note**: ${rifling.labelEn}`);
    lines.push('');
  } else {
    lines.push(`# ${exhibitTitle} — 机械工程技术档案`);
    lines.push('');
    lines.push(
      `> **Digital Armory 3D 数字军械博物馆** · ${manifest.catalog.bayCode} · ${manifest.catalog.modelCode}`
    );
    lines.push('');
    lines.push('## 1. 馆藏溯源与自动机构分类');
    lines.push(`- **定型 / 列装年份**：${provenance.year}`);
    lines.push(`- **研发国别 / 厂商**：${nation} · ${manufacturer}`);
    lines.push(`- **所属展厅**：${hallLabel}`);
    lines.push(`- **自动与闭锁原理**：${mechanism}`);
    lines.push(`- **全长尺寸**：${oalDisplay}`);
    lines.push('');

    lines.push('## 2. 弹道与运动学定量参数');
    lines.push('| 工程指标 | 标定数值 |');
    lines.push('| :--- | :--- |');
    if (archery && caliberSpec.archerySpec) {
      const a = caliberSpec.archerySpec;
      lines.push(`| 箭矢规格 | ${caliberDisplay}（${a.grainWeight} 格令） |`);
      lines.push(
        `| 峰值拉磅 / 省力比 | ${a.peakDrawForceLb} lbf（${a.peakDrawForceN} N · ${a.letOffPercent}% 省力比） |`
      );
      lines.push(
        `| 离弦初速 | ${caliberSpec.muzzleVelocityMps} m/s（${a.velocityFps} FPS） |`
      );
      lines.push(
        `| 箭矢动能 | ${formatMuzzleEnergy(caliberSpec.muzzleEnergyJ, 'zh')} |`
      );
      lines.push(
        `| 动力行程 / 弓档 | ${a.powerStrokeMm} mm / ${a.braceHeightMm} mm |`
      );
    } else {
      lines.push(`| 弹药口径 | ${caliberDisplay} |`);
      lines.push(
        `| 峰值膛压 | ${caliberSpec.peakPressureMPa} MPa（${caliberSpec.standard}） |`
      );
      lines.push(`| 枪/炮口初速 | ${caliberSpec.muzzleVelocityMps} m/s |`);
      lines.push(
        `| 枪/炮口动能 | ${formatMuzzleEnergy(caliberSpec.muzzleEnergyJ, 'zh')} |`
      );
      lines.push(`| 理论射速 / 循环 | ${rofDisplay} |`);
    }
    lines.push('');

    lines.push('## 3. 内膛与膛线工程规格');
    lines.push(`- **内膛型式**：${RIFLING_PROFILE_LABELS[rifling.kind].zh}`);
    if (rifling.boreDiameterMm > 0) {
      lines.push(`- **标称内径**：Ø${rifling.boreDiameterMm} mm`);
    }
    if (rifling.kind === 'cut_rifled' || rifling.kind === 'polygonal') {
      lines.push(`- **阴线 / 阳线数**：${rifling.grooves} 条`);
      lines.push(
        `- **缠距与旋向**：1:${rifling.twistInches}"（${rifling.twistMm} mm）· ${TWIST_DIRECTION_LABELS[rifling.direction].zh}`
      );
    } else if (rifling.kind === 'smoothbore') {
      lines.push('- **阴线 / 阳线数**：0（滑膛无膛线）');
      lines.push('- **缠距**：无（尾翼稳定 / 滑膛发射）');
    }
    lines.push(
      `- **内膛镀层**：${rifling.chromeLined ? '硬铬镀层内膛' : '军用特种钢 / 非镀铬'}`
    );
    lines.push(`- **规格注记**：${rifling.labelZh}`);
    lines.push('');
  }

  // Optional Section 4: Active Selected Part
  const loadedPlugin = getLoadedWeaponPlugin(weaponId);
  const resolvedPart: WeaponPartSpec | null =
    partOverride?.part ??
    (partId
      ? (loadedPlugin?.parts.find((p) => p.id === partId) ?? null)
      : null);

  let nextSectionNum = 4;
  if (resolvedPart) {
    const engRole = resolvePartEngineeringRole(weaponId, resolvedPart);
    const engRoleMeta = getEngineeringRoleMeta(engRole, weaponId);
    const roleLabel =
      lang === 'en' ? engRoleMeta.labelEn : engRoleMeta.labelZh;
    const rawMaterialLabel =
      partOverride?.materialLabel ??
      resolvePartMaterialLabel(weaponId, resolvedPart, lang);
    const materialLabel =
      lang === 'en'
        ? sanitizeEnglishText(rawMaterialLabel, 'Ordnance Alloy')
        : rawMaterialLabel;
    const partGroupMeta = loadedPlugin?.partGroups.find(
      (g) => g.key === resolvedPart.group
    );
    const rawGroupTitle =
      partOverride?.groupTitle ??
      (lang === 'en'
        ? (partGroupMeta?.nameEn ?? resolvedPart.group)
        : (partGroupMeta?.nameZh ?? resolvedPart.group));
    const groupTitle =
      lang === 'en'
        ? sanitizeEnglishText(rawGroupTitle, 'Mechanical Assembly')
        : rawGroupTitle;
    const rawNote =
      partOverride?.engineeringNote ?? resolvedPart.description ?? '';
    const note =
      lang === 'en'
        ? sanitizeEnglishText(
            rawNote,
            `${resolvedPart.nameEn} (${resolvedPart.bomCode}) — ${roleLabel} within the ${groupTitle} assembly, fabricated from ${materialLabel}.`
          )
        : rawNote;

    if (lang === 'en') {
      lines.push(`## ${nextSectionNum}. Selected Component Specification`);
      lines.push(
        `- **Part**: ${sanitizeEnglishText(resolvedPart.nameEn, resolvedPart.id)} (\`${resolvedPart.bomCode}\`)`
      );
      lines.push(`- **Sub-Assembly**: ${groupTitle}`);
      lines.push(`- **Engineering Role**: ${roleLabel}`);
      lines.push(`- **Material / Finish**: ${materialLabel}`);
      if (
        partOverride?.cadEnvelopeMm &&
        !CJK_RE.test(partOverride.cadEnvelopeMm)
      ) {
        lines.push(`- **CAD Bounding Envelope**: ${partOverride.cadEnvelopeMm}`);
      }
      lines.push(`- **Engineering Note**: ${note}`);
    } else {
      lines.push(`## ${nextSectionNum}. 当前选定零件规格`);
      lines.push(
        `- **零件名称**：${resolvedPart.nameZh}（${resolvedPart.nameEn} · \`${resolvedPart.bomCode}\`）`
      );
      lines.push(`- **所属总成**：${groupTitle}`);
      lines.push(`- **机械职能**：${roleLabel}`);
      lines.push(`- **材质与表面工艺**：${materialLabel}`);
      if (partOverride?.cadEnvelopeMm) {
        lines.push(`- **三维包络尺寸**：${partOverride.cadEnvelopeMm}`);
      }
      lines.push(`- **工程说明**：${note}`);
    }
    lines.push('');
    nextSectionNum += 1;
  }

  // Section 4/5: Smithsonian Engineering Glossary Cross-References
  if (glossaryTerms.length > 0) {
    lines.push(
      lang === 'en'
        ? `## ${nextSectionNum}. Engineering Principles & Glossary`
        : `## ${nextSectionNum}. 核心机械原理与百科词条`
    );
    for (const term of glossaryTerms) {
      if (lang === 'en') {
        lines.push(`- **${term.termEn}**: ${term.summaryEn}`);
      } else {
        lines.push(`- **${term.termZh}（${term.termEn}）**：${term.summaryZh}`);
      }
    }
    lines.push('');
  }

  // Footer Deep-Link
  lines.push('---');
  lines.push(
    lang === 'en'
      ? `Interactive 3D Cutaway Deep-Link: [${exhibitTitle}](${resolvedShareUrl})`
      : `在线 3D 交互剖视直达链接：[${exhibitTitle}](${resolvedShareUrl})`
  );

  return lines.join('\n');
}

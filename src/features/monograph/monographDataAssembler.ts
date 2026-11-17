import {
  archeryProjectileToLabSpec,
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
  isArcheryCaliberProfile,
  type CartridgeLabSpec,
} from '../../engine/cartridges/cartridgeSpecs';
import { FIELD_STRIP_PLANS } from '../../engine/fieldstrip/fieldStripSpecs';
import { getCachedPartGeometry } from '../../engine/geometry/geometryService';
import {
  getMalfunctionScenario,
  MALFUNCTION_ORDER,
} from '../../engine/malfunctions/malfunctionSpecs';
import {
  ENGINEERING_ROLE_META,
  ENGINEERING_ROLE_ORDER,
  type EngineeringRole,
  resolvePartEngineeringRole,
} from '../../engine/materials/engineeringRoles';
import {
  type CaliberBallisticsSpec,
  getCaliberBallisticsSpec,
} from '../../engine/physics/armoryPhysics';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  getLocalizedShortWeaponLabel,
  resolveFiringPhaseText,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import type {
  LanguageCode,
  StoryActItem,
  StoryBreakthroughItem,
  StoryMilestoneItem,
  WeaponNarrationBundle,
} from '../../narration/types';
import { getWeaponManifest } from '../../weapons/manifests';
import type {
  AssemblyGroupKey,
  CaliberProfile,
  WeaponId,
  WeaponRuntimePlugin,
} from '../../weapons/types';
import { buildQrSvgPath, encodeQrMatrix } from './qrCodeSvg';

export interface MonographBomRow {
  partId: string;
  bomCode: string;
  primaryName: string;
  secondaryName: string;
  groupKey: AssemblyGroupKey;
  groupTitle: string;
  badgeColor: string;
  materialLabel: string;
  envelopeMm: string;
  triangles: number;
  principleText: string;
}

export interface MonographRoleSummary {
  role: EngineeringRole;
  label: string;
  shortLabel: string;
  desc: string;
  colorHex: string;
  parts: { bomCode: string; name: string }[];
}

export interface MonographFiringPhaseRow {
  stepNum: string;
  shortLabel: string;
  title: string;
  description: string;
}

export interface MonographFieldStripRow {
  orderLabel: string;
  title: string;
  actionHint: string;
  interferenceNote: string;
}

export interface MonographMalfunctionCard {
  code: string;
  badge: string;
  title: string;
  rootCause: string;
  drillSummary: string;
}

export interface MonographDossierData {
  weaponId: WeaponId;
  lang: LanguageCode;
  serialCode: string;
  bayCode: string;
  volumeIndex: number;
  shortTag: string;
  modelCode: string;
  name: string;
  subtitle: string;
  originTag: string;
  caliberLabel: string;
  caliberProfile: CaliberProfile;
  actionMechanism: string;
  description: string;
  highlights: string[];
  metrics: {
    oal: string;
    barrel: string;
    weight: string;
    muzzleVelocity: string;
    effectiveRange: string;
    rateOfFire: string;
    muzzleEnergyJ: string;
  };
  headline: string;
  deck: string;
  acts: StoryActItem[];
  breakthroughs: StoryBreakthroughItem[];
  milestones: StoryMilestoneItem[];
  roleSummaries: MonographRoleSummary[];
  firingPhases: MonographFiringPhaseRow[];
  bomRows: MonographBomRow[];
  totalTrianglesFormatted: string;
  cartridgeSpec: CartridgeLabSpec;
  ballisticsSpec: CaliberBallisticsSpec;
  fieldStripManualTitle: string;
  fieldStripRows: MonographFieldStripRow[];
  malfunctionCards: MonographMalfunctionCard[];
  deepLinkUrl: string;
  qrSvg: { pathD: string; viewSize: number };
}

function buildFallbackStory(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  lang: LanguageCode,
  name: string,
  actionMechanism: string,
  description: string
): {
  headline: string;
  deck: string;
  acts: StoryActItem[];
  breakthroughs: StoryBreakthroughItem[];
  milestones: StoryMilestoneItem[];
} {
  const isZh = lang === 'zh';
  const focusParts = plugin.parts.slice(0, 4);
  const acts: StoryActItem[] = [0, 1, 2, 3].map((idx) => {
    const p = focusParts[idx] ?? plugin.parts[0];
    const pName = isZh ? p.nameZh : p.nameEn;
    return {
      id: `fallback_act_${idx + 1}`,
      actNumber: isZh ? `第${['一', '二', '三', '四'][idx]}幕` : `ACT ${['I', 'II', 'III', 'IV'][idx]}`,
      eraTag: `STAGE 0${idx + 1}`,
      title: isZh ? `${pName}与总体机械布局` : `${pName} & System Architecture`,
      paragraphs: [description, p.description],
      audioScript: '',
      audioUrl: '',
      focusPartId: p.id,
      focusPartLabel: pName,
    };
  });

  const breakthroughs: StoryBreakthroughItem[] = plugin.parts
    .slice(0, 3)
    .map((p, idx) => ({
      id: `fb_bt_${idx}`,
      title: isZh ? p.nameZh : p.nameEn,
      tag: p.bomCode,
      summary: p.description,
      focusPartId: p.id,
      focusPartLabel: isZh ? p.nameZh : p.nameEn,
    }));

  const milestones: StoryMilestoneItem[] = [
    {
      year: getWeaponManifest(weaponId).catalog.bayCode,
      title: name,
      detail: actionMechanism,
    },
  ];

  return {
    headline: name,
    deck: description,
    acts,
    breakthroughs,
    milestones,
  };
}

export function buildWeaponDeepLinkUrl(
  weaponId: WeaponId,
  lang: LanguageCode,
  originOverride?: string
): string {
  const baseOrigin =
    originOverride ??
    (typeof window !== 'undefined' && window.location?.origin
      ? `${window.location.origin}${window.location.pathname.replace(/showcase\.html$/, '')}`
      : 'https://zhoujingkun1989-arch.github.io/digital-armory-3d/');
  const cleanBase = baseOrigin.endsWith('/') ? baseOrigin : `${baseOrigin}/`;
  return `${cleanBase}?weapon=${weaponId}&screen=workbench&lang=${lang}`;
}

export function assembleMonographDossier(
  weaponId: WeaponId,
  plugin: WeaponRuntimePlugin,
  lang: LanguageCode,
  bundle: WeaponNarrationBundle | null,
  originOverride?: string
): MonographDossierData {
  const isZh = lang === 'zh';
  const manifest = getWeaponManifest(weaponId);
  const catalog = manifest.catalog;
  const displayMeta = resolveWeaponDisplayMeta(weaponId, lang, bundle);
  const shortTag = getLocalizedShortWeaponLabel(weaponId, lang);
  const caliberProfile = manifest.caliberProfile;
  const isArcheryWeapon =
    (weaponId as string) === 'lift33' || (weaponId as string) === 'r500';
  const isArcheryCal =
    isArcheryCaliberProfile(caliberProfile as string) || isArcheryWeapon;
  const archeryMeta = isArcheryCal
    ? getArcheryProjectileMeta(
        isArcheryCaliberProfile(caliberProfile as string)
          ? caliberProfile
          : (weaponId as string) === 'lift33'
            ? 'arrow_400gr'
            : 'bolt_400gr'
      )
    : null;
  const cartridgeSpec: CartridgeLabSpec = archeryMeta
    ? archeryProjectileToLabSpec(archeryMeta)
    : CARTRIDGE_LAB_SPECS[caliberProfile];
  const rawBallisticsSpec = getCaliberBallisticsSpec(caliberProfile);
  const ballisticsSpec: CaliberBallisticsSpec =
    archeryMeta && (rawBallisticsSpec.caliber as string) !== (caliberProfile as string)
      ? {
          ...rawBallisticsSpec,
          caliber: caliberProfile,
          labelZh: archeryMeta.nameZh,
          labelEn: archeryMeta.nameEn,
          standard: 'ATA / IBO' as CaliberBallisticsSpec['standard'],
          peakPressureMPa: archeryMeta.peakDrawForceN,
          safeUnlockPressureMPa: Math.round(
            archeryMeta.peakDrawForceN * (1 - archeryMeta.letOffPercent / 100)
          ),
          muzzleVelocityMps: archeryMeta.muzzleVelocityMps,
          projectileMassG: archeryMeta.projectileMassG,
          muzzleEnergyJ: archeryMeta.muzzleEnergyJ,
          referenceBarrelMm: archeryMeta.powerStrokeMm,
          boreTimeMs: archeryMeta.caliber === 'arrow_400gr' ? 11.4 : 6.7,
        }
      : rawBallisticsSpec;
  const inspUi = UI_STRINGS[lang].inspector;

  const serialTag = shortTag.replace(/[^A-Za-z0-9]/g, '').toUpperCase() || weaponId.toUpperCase();
  const serialCode = `DA-2026-${catalog.bayCode}-${serialTag}`;

  const localizedStory =
    bundle?.story?.[lang] ??
    buildFallbackStory(
      weaponId,
      plugin,
      lang,
      displayMeta.name,
      displayMeta.actionMechanism,
      displayMeta.description
    );

  // 6-Role Functional Classification Matrix
  const roleBuckets = new Map<EngineeringRole, { bomCode: string; name: string }[]>();
  for (const r of ENGINEERING_ROLE_ORDER) {
    roleBuckets.set(r, []);
  }
  for (const part of plugin.parts) {
    const role = resolvePartEngineeringRole(weaponId, part);
    const partNarr = bundle?.parts?.[part.id];
    const pName = isZh
      ? part.nameZh
      : (partNarr?.calloutLabelEn || part.nameEn);
    roleBuckets.get(role)?.push({
      bomCode: part.bomCode,
      name: pName,
    });
  }

  const roleSummaries: MonographRoleSummary[] = ENGINEERING_ROLE_ORDER.map(
    (role) => {
      const meta = ENGINEERING_ROLE_META[role];
      return {
        role,
        label: isZh ? meta.labelZh : meta.labelEn,
        shortLabel: isZh ? meta.shortZh : meta.shortEn,
        desc: isZh ? meta.descZh : meta.descEn,
        colorHex: meta.colorHex,
        parts: roleBuckets.get(role) ?? [],
      };
    }
  );

  // 7-Phase Firing Kinematics
  const firingPhases: MonographFiringPhaseRow[] = plugin.firingPhases.map(
    (ph) => {
      const loc = resolveFiringPhaseText(ph, lang, bundle);
      return {
        stepNum: ph.stepNum,
        shortLabel: loc.shortLabel,
        title: loc.title,
        description: loc.description,
      };
    }
  );

  // Complete Precision BOM Ledger + Live CSG Millimeter Envelopes
  let totalTriangles = 0;
  const bomRows: MonographBomRow[] = plugin.parts.map((part) => {
    const grp = plugin.partGroups.find((g) => g.key === part.group);
    const groupTitle = isZh
      ? (grp?.nameZh ?? part.group)
      : (grp?.nameEn ?? part.group);
    const badgeColor = grp?.badgeColor ?? '#0284c7';

    const geo = getCachedPartGeometry(weaponId, part.id);
    let envelopeMm = '—';
    let tris = 0;
    if (geo) {
      if (!geo.boundingBox) geo.computeBoundingBox();
      if (geo.boundingBox) {
        const b = geo.boundingBox;
        const lx = ((b.max.x - b.min.x) * 10).toFixed(1);
        const ly = ((b.max.y - b.min.y) * 10).toFixed(1);
        const lz = ((b.max.z - b.min.z) * 10).toFixed(1);
        envelopeMm = `${lx}×${ly}×${lz} mm`;
      }
      const idx = geo.getIndex();
      const pos = geo.getAttribute('position');
      tris = idx
        ? Math.round(idx.count / 3)
        : pos
          ? Math.round(pos.count / 3)
          : 0;
      totalTriangles += tris;
    }

    const partNarr = bundle?.parts?.[part.id]?.[lang];
    const principleRaw =
      partNarr?.kinematicRole ||
      partNarr?.overview ||
      (isZh ? part.description : `${part.nameEn} (${part.roleTag})`);

    const principleText =
      principleRaw.length > 96
        ? `${principleRaw.slice(0, 94).trim()}…`
        : principleRaw;

    return {
      partId: part.id,
      bomCode: part.bomCode,
      primaryName: isZh ? part.nameZh : part.nameEn,
      secondaryName: isZh ? part.nameEn : part.nameZh,
      groupKey: part.group,
      groupTitle,
      badgeColor,
      materialLabel: inspUi.materials[part.material],
      envelopeMm,
      triangles: tris,
      principleText,
    };
  });

  // Field-Strip DAG & Interference Warnings
  const fsPlan = FIELD_STRIP_PLANS[weaponId] ?? FIELD_STRIP_PLANS.ak15;
  const fieldStripManualTitle = isZh
    ? fsPlan.manualCodeZh
    : fsPlan.manualCodeEn;
  const fieldStripRows: MonographFieldStripRow[] = fsPlan.steps.map((st) => ({
    orderLabel: st.orderLabel,
    title: isZh ? st.titleZh : st.titleEn,
    actionHint: isZh ? st.actionHintZh : st.actionHintEn,
    interferenceNote: isZh
      ? st.stripBlockedNoteZh || st.reassembleBlockedNoteZh
      : st.stripBlockedNoteEn || st.reassembleBlockedNoteEn,
  }));

  // 4 Canonical Stoppage Cards
  const malfunctionCards: MonographMalfunctionCard[] = MALFUNCTION_ORDER.map(
    (kind) => {
      const sc = getMalfunctionScenario(kind, weaponId);
      const stepTitles = sc.steps
        .map((st) => `${st.orderLabel}. ${isZh ? st.titleZh : st.titleEn}`)
        .join(' → ');
      return {
        code: sc.code,
        badge: isZh ? sc.badgeZh : sc.badgeEn,
        title: isZh ? sc.shortZh : sc.shortEn,
        rootCause: isZh ? sc.rootCauseZh : sc.rootCauseEn,
        drillSummary: stepTitles,
      };
    }
  );

  const deepLinkUrl = buildWeaponDeepLinkUrl(weaponId, lang, originOverride);
  const qrMatrix = encodeQrMatrix(deepLinkUrl);
  const qrSvg = buildQrSvgPath(qrMatrix, 2);

  return {
    weaponId,
    lang,
    serialCode,
    bayCode: catalog.bayCode,
    volumeIndex: manifest.orderIndex,
    shortTag,
    modelCode: catalog.modelCode,
    name: displayMeta.name,
    subtitle: catalog.subtitleEn,
    originTag: displayMeta.originTag,
    caliberLabel: catalog.caliber,
    caliberProfile,
    actionMechanism: displayMeta.actionMechanism,
    description: displayMeta.description,
    highlights: displayMeta.highlights,
    metrics: {
      oal: displayMeta.overallLengthMm,
      barrel: displayMeta.barrelSpec,
      weight: catalog.specs1To1.emptyWeightKg,
      muzzleVelocity: catalog.specs1To1.muzzleVelocityMs,
      effectiveRange: catalog.specs1To1.effectiveRangeM,
      rateOfFire: displayMeta.rateOfFire,
      muzzleEnergyJ: `${archeryMeta ? archeryMeta.muzzleEnergyJ.toFixed(1) : cartridgeSpec.muzzleEnergyJ.toLocaleString('en-US')} J`,
    },
    headline: localizedStory.headline,
    deck: localizedStory.deck,
    acts: localizedStory.acts,
    breakthroughs: localizedStory.breakthroughs,
    milestones: localizedStory.milestones,
    roleSummaries,
    firingPhases,
    bomRows,
    totalTrianglesFormatted: totalTriangles.toLocaleString('en-US'),
    cartridgeSpec,
    ballisticsSpec,
    fieldStripManualTitle,
    fieldStripRows,
    malfunctionCards,
    deepLinkUrl,
    qrSvg,
  };
}

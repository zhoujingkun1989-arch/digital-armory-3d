import {
  CARTRIDGE_LAB_SPECS,
  getArcheryProjectileMeta,
  isArcheryCaliberProfile,
  type CartridgeLabSpec,
} from '../../engine/cartridges/cartridgeSpecs';
import {
  getExhibitClassification,
  type DriveFamilyId,
  type FeedFamilyId,
  type LockingFamilyId,
} from '../armory/mechanismShowdownSpecs';
import type { LanguageCode } from '../../narration/types';
import { getWeaponManifest } from '../../weapons/manifests';
import type { AssemblyGroupKey, WeaponId } from '../../weapons/types';
import type {
  MonographBomRow,
  MonographDossierData,
} from './monographDataAssembler';

// ============================================================================
// DK Visual Encyclopedia — Editorial Data Layer & Curation Engine
// Zero external runtime dependencies · 100% Bilingual (zh / en) · All 19 Exhibits
// ============================================================================

export const DK_PALETTE = {
  ink: '#111827',
  inkSecondary: '#334155',
  crimson: '#B91C1C',
  crimsonSoft: 'rgba(185, 28, 28, 0.06)',
  brass: '#9A6B2F',
  brassSoft: 'rgba(154, 107, 47, 0.08)',
  muted: '#64748B',
  rule: '#CBD5E1',
  ruleLight: '#E2E8F0',
  paperTint: '#F8FAFC',
  paper: '#FFFFFF',
} as const;

export type DkSilhouetteKind = 'hand' | 'human' | 'archer';

export interface DkScaleReference {
  oalMm: number;
  barrelMm: number;
  weightKg: number;
  silhouetteKind: DkSilhouetteKind;
  referenceLengthMm: number;
  ratioPercent: number;
  caption: string;
}

export type DkEraRelation =
  | 'ancestor'
  | 'predecessor'
  | 'current'
  | 'rival'
  | 'successor';

export interface DkTimelineNode {
  year: string;
  name: string;
  subtitle: string;
  isCurrent: boolean;
  eraRelation: DkEraRelation;
}

export type DkLoupePlateKey =
  | 'group_slide'
  | 'group_frame'
  | 'group_fcg'
  | 'group_mag'
  | 'breech_closeup';

export interface DkLoupeSpec {
  plateKey: DkLoupePlateKey;
  magnification: string;
  title: string;
  caption: string;
}

export interface DkPartMicroCopy {
  title: string;
  microCopy: string;
}

export type DkCalloutSide = 'top' | 'bottom' | 'left' | 'right';

export interface DkCalloutGeometryInput {
  partId: string;
  bomCode: string;
  group?: AssemblyGroupKey;
  side: DkCalloutSide;
  anchorU: number;
  anchorV: number;
  kneeU: number;
  kneeV: number;
  labelU: number;
  labelV: number;
  align: 'left' | 'right' | 'center';
}

export interface DkEnrichedCalloutSpec {
  partId: string;
  bomCode: string;
  side: DkCalloutSide;
  anchorU: number;
  anchorV: number;
  kneeU: number;
  kneeV: number;
  labelU: number;
  labelV: number;
  align: 'left' | 'right' | 'center';
  title: string;
  microCopy: string;
}

export interface DkCartridgePlateLayout {
  isArchery: boolean;
  orientation: 'vertical' | 'horizontal';
  scaleDenom: 1 | 4 | 5;
  oalMm: number;
  caseLengthMm: number;
  bulletDiameterMm: number;
  maxDiameterMm: number;
  drawnLengthMm: number;
  drawnMaxDiameterMm: number;
  svgWidthMm: number;
  svgHeightMm: number;
  scaleStamp: string;
  scaleStampSecondary: string;
}

export interface DkEditorialPack {
  weaponId: WeaponId;
  lang: LanguageCode;
  scaleReference: DkScaleReference;
  evolutionTimeline: DkTimelineNode[];
  loupeSpecs: DkLoupeSpec[];
  partMicroCopyById: Record<string, DkPartMicroCopy>;
  cartridgePlateLayout: DkCartridgePlateLayout;
}

interface BilingualText {
  zh: string;
  en: string;
}

// ----------------------------------------------------------------------------
// 1. DK Part Micro-Copy Distillation (zh: 16–32 chars | en: 45–88 chars)
// ----------------------------------------------------------------------------

const EN_DANGLING_END_WORDS = new Set([
  'a',
  'an',
  'the',
  'of',
  'in',
  'on',
  'at',
  'to',
  'for',
  'with',
  'by',
  'from',
  'into',
  'onto',
  'through',
  'across',
  'during',
  'while',
  'before',
  'after',
  'under',
  'over',
  'between',
  'within',
  'against',
  'via',
  'and',
  'or',
  'but',
  'as',
  'its',
  'their',
  'that',
  'which',
  'where',
  'when',
  'is',
  'are',
  'be',
  'using',
  'allowing',
  'ensuring',
]);

const ZH_DANGLING_CHARS = new Set([
  '的',
  '与',
  '及',
  '和',
  '并',
  '将',
  '把',
  '在',
  '于',
  '由',
  '对',
  '向',
  '以',
  '为',
  '而',
  '且',
  '或',
  '从',
  '经',
  '被',
  '使',
  '令',
  '至',
  '约',
  '含',
  '带',
]);

function hasCjk(text: string): boolean {
  return /[\u4e00-\u9fff]/.test(text);
}

function cleanCalloutTitle(rawTitle: string, lang: LanguageCode): string {
  const collapsed = rawTitle.replace(/\s+/g, ' ').trim();
  if (!collapsed) return rawTitle;
  const maxLen = lang === 'zh' ? 18 : 34;
  if (collapsed.length <= maxLen) return collapsed;

  const withoutParen = collapsed
    .replace(/\s*[（(][^）)]*[）)]\s*/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  if (withoutParen.length >= 2 && withoutParen.length <= maxLen) {
    return withoutParen;
  }
  return withoutParen.length >= 2 ? withoutParen : collapsed;
}

function shortenMaterial(materialLabel: string, lang: LanguageCode): string {
  const cleaned = materialLabel
    .replace(/\s*[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (lang === 'zh') {
    const first = cleaned.split(/[·,/／、]/)[0]?.trim() || cleaned;
    return first.slice(0, 8);
  }
  const words = cleaned.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(' ');
}

function shortenGroup(groupTitle: string, lang: LanguageCode): string {
  const cleaned = groupTitle
    .replace(/\s*[（(][^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (lang === 'zh') {
    return cleaned.split(/[·/&＆]/)[0]?.trim().slice(0, 8) || cleaned.slice(0, 8);
  }
  const first = cleaned.split(/[·/]/)[0]?.trim() || cleaned;
  const words = first.split(/\s+/);
  return words.slice(0, 3).join(' ');
}

function stripIncompleteZhTail(text: string): string {
  const hadEllipsis = /(?:…|\.\.\.)\s*$/.test(text);
  let out = text.replace(/(?:…|\.\.\.)+\s*$/g, '').trim();
  if (hadEllipsis) {
    const lastStop = Math.max(
      out.lastIndexOf('。'),
      out.lastIndexOf('；'),
      out.lastIndexOf('，')
    );
    if (lastStop >= 10) {
      out = out.slice(0, lastStop).trim();
    }
  }
  return out;
}

function trimZhPhraseToRange(raw: string, minLen: number, maxLen: number): string {
  let s = raw
    .replace(/[，,；;：:、\s]+$/g, '')
    .replace(/。+$/g, '')
    .trim();

  if (s.length <= maxLen - 1) {
    while (s.length > minLen && ZH_DANGLING_CHARS.has(s[s.length - 1])) {
      s = s.slice(0, -1).trim();
    }
    return `${s}。`;
  }

  // Try natural clause boundaries before cutting
  const breakTokens = [
    '，从而',
    '，实现',
    '，确保',
    '，同时',
    '，并',
    '，',
    '从而',
    '以便',
    '并实现',
    '并在',
    '并',
    '同时',
  ];
  for (const tok of breakTokens) {
    let idx = s.lastIndexOf(tok, maxLen - 1);
    while (idx >= minLen - 1) {
      const candidate = s.slice(0, idx).replace(/[，,；;、\s]+$/g, '').trim();
      if (candidate.length >= minLen - 1 && candidate.length <= maxLen - 1) {
        let clean = candidate;
        while (clean.length > minLen - 1 && ZH_DANGLING_CHARS.has(clean[clean.length - 1])) {
          clean = clean.slice(0, -1).trim();
        }
        if (clean.length >= minLen - 1) {
          return `${clean}。`;
        }
      }
      idx = s.lastIndexOf(tok, idx - 1);
    }
  }

  // Avoid splitting ASCII numbers/units (e.g. "9×19mm", "235 MPa", "35°")
  let cut = Math.min(s.length, maxLen - 1);
  while (
    cut > minLen &&
    /[A-Za-z0-9.%°×/-]/.test(s[cut - 1]) &&
    cut < s.length &&
    /[A-Za-z0-9.%°×/-]/.test(s[cut])
  ) {
    cut--;
  }
  let sliced = s.slice(0, cut).replace(/[，,；;：:、\s（(]+$/g, '').trim();
  // Remove unmatched opening paren/bracket/quote
  const openParen = (sliced.match(/[（(]/g) ?? []).length;
  const closeParen = (sliced.match(/[）)]/g) ?? []).length;
  if (openParen > closeParen) {
    const lastOpen = Math.max(sliced.lastIndexOf('（'), sliced.lastIndexOf('('));
    if (lastOpen >= minLen - 2) {
      sliced = sliced.slice(0, lastOpen).replace(/[，,；;、\s]+$/g, '').trim();
    }
  }
  while (sliced.length > minLen - 1 && ZH_DANGLING_CHARS.has(sliced[sliced.length - 1])) {
    sliced = sliced.slice(0, -1).trim();
  }
  return `${sliced}。`;
}

function distillZhMicroCopy(row: MonographBomRow): string {
  const MIN = 16;
  const MAX = 32;

  let text = stripIncompleteZhTail(row.principleText || '');
  // Strip disassembly timeline progress chatter that clutters DK cutaway callouts
  text = text
    .replace(/[；;，,]?\s*(?:在)?(?:野战|不完全|完全|深度|子组件|细致)?分解(?:进度|初期|阶段|时)?[^。；;]*$/g, '')
    .replace(/[（(][^）)]*(?:进度|%|分解)[^）)]*[）)]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Prefer the first substantive mechanical sentence
  const sentences = text
    .split(/[。；;]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 6);

  let core = sentences[0] ?? text;

  // Trim verbose opener boilerplate if over budget
  if (core.length > MAX - 1) {
    const trimmedOpener = core
      .replace(
        /^(?:在)?(?:整个)?(?:射击|击发|自动)(?:循环|全过程|全程|全阶段|周期|阶段\d*|第[一二三四五六七\d]阶段)(?:中|内|期间|时)?[，,]?\s*/g,
        ''
      )
      .replace(/^(?:这是|本件为|该零件为?|此构件为?)\s*/g, '')
      .trim();
    if (trimmedOpener.length >= MIN - 1) {
      core = trimmedOpener;
    }
  }

  // If core has comma clauses, combine leading clauses that fit cleanly within [MIN..MAX]
  if (core.length > MAX - 1 && core.includes('，')) {
    const clauses = core
      .split('，')
      .map((c) => c.trim())
      .filter(Boolean);
    let acc = '';
    for (const c of clauses) {
      const next = acc ? `${acc}，${c}` : c;
      if (next.length <= MAX - 1) {
        acc = next;
      } else {
        break;
      }
    }
    if (acc.length >= MIN - 1) {
      core = acc;
    } else if (clauses[0] && clauses[0].length >= MIN - 1) {
      core = clauses[0];
    }
  }

  // Clean trailing punctuation before length check
  core = core.replace(/[。，,；;：:、…\s]+$/g, '').trim();

  // Enrich if too short (e.g. brief description or fallback)
  if (core.length < MIN - 1) {
    const grp = shortenGroup(row.groupTitle, 'zh');
    const mat = shortenMaterial(row.materialLabel, 'zh');
    const nameShort = cleanCalloutTitle(row.primaryName, 'zh').slice(0, 10);
    if (!core) {
      core = `${mat}精密${nameShort}，承担${grp}机械联动`;
    } else if (core.length + grp.length + 7 <= MAX - 1) {
      core = `${core}，承担${grp}核心协同`;
    } else if (core.length + mat.length + 5 <= MAX - 1) {
      core = `${mat}制，${core}`;
    } else {
      core = `${core}，保障机构精密运转`;
    }
  }

  // If still slightly under MIN after enrichment, pad cleanly with factual group context
  if (core.length < MIN - 1) {
    core = `${core}，保障总成精准稳定运行`;
  }

  return trimZhPhraseToRange(core, MIN, MAX);
}

function stripIncompleteEnTail(text: string): string {
  const hadEllipsis = /(?:…|\.\.\.)\s*$/.test(text);
  let out = text.replace(/(?:…|\.\.\.)+\s*$/g, '').trim();
  if (hadEllipsis) {
    // Drop any cut trailing word fragment immediately
    const lastSpace = out.lastIndexOf(' ');
    if (lastSpace > 12) {
      out = out.slice(0, lastSpace).trim();
    }
    // Trim dangling punctuation/stop-words at the end
    out = out.replace(/[,;:\-–—]+$/g, '').trim();
  }
  return out;
}

function cleanEnWordsEnding(phrase: string): string {
  let words = phrase
    .replace(/[,;:\-–—]+$/g, '')
    .replace(/\.+$/g, '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);

  // Strip unmatched trailing open parenthesis or quote
  while (words.length > 3) {
    const last = words[words.length - 1];
    const bare = last.replace(/[^A-Za-z]/g, '').toLowerCase();
    if (
      EN_DANGLING_END_WORDS.has(bare) ||
      /^[([{"']/.test(last) ||
      /[,;:\-–—]$/.test(last)
    ) {
      words = words.slice(0, -1);
      continue;
    }
    break;
  }

  // Close or remove unbalanced parentheses
  const joined = words.join(' ').replace(/[,;:\-–—]+$/g, '').trim();
  const opens = (joined.match(/\(/g) ?? []).length;
  const closes = (joined.match(/\)/g) ?? []).length;
  if (opens > closes) {
    const idx = joined.lastIndexOf('(');
    if (idx > 20) {
      return cleanEnWordsEnding(joined.slice(0, idx));
    }
  }
  return joined;
}

function fitEnToRange(raw: string, minLen: number, maxLen: number): string {
  let s = raw.replace(/\s+/g, ' ').trim();
  if (!s) return '';

  // Capitalize first letter
  s = s.charAt(0).toUpperCase() + s.slice(1);
  s = s.replace(/\.+$/g, '').trim();

  if (s.length <= maxLen - 1) {
    const clean = cleanEnWordsEnding(s);
    if (clean.length >= minLen - 1) {
      return `${clean}.`;
    }
    return `${s.replace(/[,;:\-–—]+$/g, '').trim()}.`;
  }

  // Try natural clause delimiters inside [minLen-1 .. maxLen-1]
  const clauseDelimiters = ['; ', ' — ', ', while ', ', before ', ', allowing ', ', ensuring ', ', ', ' while ', ' before ', ' during ', ' to '];
  for (const delim of clauseDelimiters) {
    let idx = s.lastIndexOf(delim, maxLen - 1);
    while (idx >= minLen - 1) {
      const cand = cleanEnWordsEnding(s.slice(0, idx));
      if (cand.length >= minLen - 1 && cand.length <= maxLen - 1) {
        return `${cand}.`;
      }
      idx = s.lastIndexOf(delim, idx - 1);
    }
  }

  // Walk back by whole words (never cutting mid-word!)
  const words = s.split(/\s+/);
  let built = '';
  for (const w of words) {
    const candidate = built ? `${built} ${w}` : w;
    if (candidate.length <= maxLen - 1) {
      built = candidate;
    } else {
      break;
    }
  }
  const cleaned = cleanEnWordsEnding(built);
  if (cleaned.length >= minLen - 1) {
    return `${cleaned}.`;
  }
  return `${built.replace(/[,;:\-–—]+$/g, '').trim()}.`;
}

function distillEnMicroCopy(row: MonographBomRow): string {
  const MIN = 45;
  const MAX = 88;

  let text = stripIncompleteEnTail(row.principleText || '');
  // Strip disassembly percentage/step meta-text
  text = text
    .replace(
      /[;,]?\s*(?:it\s+)?(?:separates|detaches|lifts|slides|explodes|is removed|unthreads|withdraws)\b.*$/i,
      ''
    )
    .replace(/\bDuring\s+(?:field\s+|primary\s+|detailed\s+)?(?:strip|disassembly)[^.]*$/i, '')
    .replace(/\s+/g, ' ')
    .trim();

  // Split into sentences
  const sentences = text
    .split(/(?<=[.!?])\s+|;\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 12);

  let core = sentences[0] ?? text;
  core = core.replace(/\.+$/g, '').trim();

  // If sentence 1 is brief and sentence 2 fits, join them cleanly
  if (core.length < MIN - 1 && sentences.length > 1) {
    const combined = `${core}; ${sentences[1].replace(/\.+$/g, '').trim()}`;
    if (combined.length <= MAX + 20) {
      core = combined;
    }
  }

  // Detect fallback pattern `"Part Name · Group Title"` or short copy < 45 chars
  const looksLikeFallbackPair = core.includes(' · ') && core.length < 64;
  if (looksLikeFallbackPair || core.length < MIN - 1) {
    const mat = shortenMaterial(row.materialLabel, 'en');
    const grp = shortenGroup(row.groupTitle, 'en');
    const cleanName = cleanCalloutTitle(row.primaryName, 'en');
    if (looksLikeFallbackPair || !core) {
      core = `Precision ${mat.toLowerCase()} ${cleanName.toLowerCase()} driving the ${grp.toLowerCase()}`;
    } else {
      const candidate = `${core} within the ${grp.toLowerCase()} (${mat.toLowerCase()})`;
      core = candidate;
    }
  }

  let result = fitEnToRange(core, MIN, MAX);

  // Final safety floor: if still under MIN (45 chars), expand cleanly with assembly role
  if (result.length < MIN) {
    const grp = shortenGroup(row.groupTitle, 'en').toLowerCase();
    const mat = shortenMaterial(row.materialLabel, 'en').toLowerCase();
    const base = result.replace(/\.+$/g, '').trim();
    const expanded = base.toLowerCase().includes(grp)
      ? `${base}, machined from ${mat} for cycle reliability`
      : `${base} within the precision ${grp} assembly`;
    result = fitEnToRange(expanded, MIN, MAX);
  }

  return result;
}

/**
 * Produces a crisp DK Eyewitness callout pair (`{ title, microCopy }`) from a
 * dossier + partId OR directly from a `MonographBomRow`.
 * Guarantees clean complete phrasing (zh: 16–32 chars; en: 45–88 chars) with
 * zero mid-word cuts and no trailing ellipses.
 */
export function buildDkPartMicroCopy(
  dossier: MonographDossierData,
  partId: string
): DkPartMicroCopy;
export function buildDkPartMicroCopy(
  row: MonographBomRow,
  lang?: LanguageCode
): DkPartMicroCopy;
export function buildDkPartMicroCopy(
  dossierOrRow: MonographDossierData | MonographBomRow,
  partIdOrLang?: string
): DkPartMicroCopy {
  let row: MonographBomRow | undefined;
  let lang: LanguageCode;

  if ('bomRows' in dossierOrRow) {
    lang = dossierOrRow.lang;
    row = dossierOrRow.bomRows.find((r) => r.partId === partIdOrLang);
    if (!row) {
      const fallbackLabel = partIdOrLang ?? dossierOrRow.shortTag;
      return {
        title: fallbackLabel,
        microCopy:
          lang === 'zh'
            ? `${dossierOrRow.shortTag} 核心机械协同构件，承载精密运动配合。`
            : `Precision mechanical sub-component engineered within the ${dossierOrRow.shortTag} assembly.`,
      };
    }
  } else {
    row = dossierOrRow;
    if (partIdOrLang === 'zh' || partIdOrLang === 'en') {
      lang = partIdOrLang;
    } else {
      lang = hasCjk(row.primaryName) || hasCjk(row.principleText) ? 'zh' : 'en';
    }
  }

  const title = cleanCalloutTitle(row.primaryName, lang);
  const microCopy = lang === 'zh' ? distillZhMicroCopy(row) : distillEnMicroCopy(row);
  return { title, microCopy };
}

/**
 * Convenience mapper combining geometry-solved DK callout positions (`DkCalloutItem`)
 * with distilled bilingual DK micro-copy for direct consumption by `DkAnnotatedPlateOverlay`.
 */
export function enrichDkCallouts(
  dossier: MonographDossierData,
  callouts: readonly DkCalloutGeometryInput[]
): DkEnrichedCalloutSpec[] {
  return callouts.map((c) => {
    const copy = buildDkPartMicroCopy(dossier, c.partId);
    return {
      partId: c.partId,
      bomCode: c.bomCode,
      side: c.side,
      anchorU: c.anchorU,
      anchorV: c.anchorV,
      kneeU: c.kneeU,
      kneeV: c.kneeV,
      labelU: c.labelU,
      labelV: c.labelV,
      align: c.align,
      title: copy.title,
      microCopy: copy.microCopy,
    };
  });
}

// ----------------------------------------------------------------------------
// 2. Scale & Silhouette Reference (19 Exhibits · Hand 190mm / Adult 1,750mm)
// ----------------------------------------------------------------------------

function parseMaxLeadingMillimeters(raw: string, fallback: number): number {
  const head = raw.split('(')[0].replace(/,/g, '');
  const matches = head.match(/\d+(?:\.\d+)?/g);
  if (!matches || matches.length === 0) return fallback;
  let result = Number(matches[0]);
  if (head.includes('–') || head.includes('-')) {
    for (let i = 1; i < matches.length; i++) {
      const v = Number(matches[i]);
      if (Number.isFinite(v) && v > result) {
        result = v;
      }
    }
  }
  return Number.isFinite(result) && result > 0 ? result : fallback;
}

function parseFirstPositiveFloat(raw: string, fallback: number): number {
  const cleaned = raw.replace(/,/g, '');
  const m = cleaned.match(/(\d+(?:\.\d+)?)/);
  if (!m) return fallback;
  const val = Number(m[1]);
  return Number.isFinite(val) && val > 0 ? val : fallback;
}

export function buildDkScaleReference(
  dossier: MonographDossierData
): DkScaleReference;
export function buildDkScaleReference(
  weaponId: WeaponId,
  lang?: LanguageCode
): DkScaleReference;
export function buildDkScaleReference(
  dossierOrWeaponId: MonographDossierData | WeaponId,
  langArg?: LanguageCode
): DkScaleReference {
  const weaponId: WeaponId =
    typeof dossierOrWeaponId === 'string'
      ? dossierOrWeaponId
      : dossierOrWeaponId.weaponId;
  const lang: LanguageCode =
    typeof dossierOrWeaponId === 'string'
      ? (langArg ?? 'zh')
      : dossierOrWeaponId.lang;

  const manifest = getWeaponManifest(weaponId);
  const specs = manifest.catalog.specs1To1;
  const oalSource =
    typeof dossierOrWeaponId === 'string'
      ? specs.overallLengthMm
      : dossierOrWeaponId.metrics.oal || specs.overallLengthMm;
  const barrelSource =
    typeof dossierOrWeaponId === 'string'
      ? specs.barrelSpec
      : dossierOrWeaponId.metrics.barrel || specs.barrelSpec;
  const weightSource =
    typeof dossierOrWeaponId === 'string'
      ? specs.emptyWeightKg
      : dossierOrWeaponId.metrics.weight || specs.emptyWeightKg;

  const oalMm = parseMaxLeadingMillimeters(oalSource, 750);
  const barrelMm = parseFirstPositiveFloat(barrelSource, 300);
  const weightKg = parseFirstPositiveFloat(weightSource, 3.0);

  const category = manifest.catalog.category;
  const silhouetteKind: DkSilhouetteKind =
    category === 'pistol'
      ? 'hand'
      : category === 'archery'
        ? 'archer'
        : 'human';

  const referenceLengthMm = silhouetteKind === 'hand' ? 190 : 1750;
  const ratioPercent = Math.max(1, Math.round((oalMm / referenceLengthMm) * 100));
  const oalFmt = Math.round(oalMm).toLocaleString('en-US');

  let caption: string;
  if (lang === 'zh') {
    if (silhouetteKind === 'hand') {
      caption = `全长 ${oalFmt} mm · 约为成人手掌 (190 mm) 的 ${ratioPercent}%`;
    } else if (weaponId === 'lift33') {
      caption = `轮轴距 ${oalFmt} mm · 约为成人身高的 ${ratioPercent}%`;
    } else {
      caption = `全长 ${oalFmt} mm · 约为成人身高的 ${ratioPercent}%`;
    }
  } else {
    if (silhouetteKind === 'hand') {
      caption = `${oalFmt} mm OAL · ~${ratioPercent}% of adult hand (190 mm)`;
    } else if (weaponId === 'lift33') {
      caption = `${oalFmt} mm ATA · ~${ratioPercent}% of adult archer height`;
    } else if (silhouetteKind === 'archer') {
      caption = `${oalFmt} mm OAL · ~${ratioPercent}% of adult archer height`;
    } else {
      caption = `${oalFmt} mm OAL · ~${ratioPercent}% of adult height`;
    }
  }

  return {
    oalMm,
    barrelMm,
    weightKg,
    silhouetteKind,
    referenceLengthMm,
    ratioPercent,
    caption,
  };
}

// ----------------------------------------------------------------------------
// 3. Evolutionary Lineage Timeline (5 Curated Chronological Nodes × 19 Exhibits)
// ----------------------------------------------------------------------------

interface TimelineSeedNode {
  year: string;
  name: BilingualText;
  subtitle: BilingualText;
  eraRelation: DkEraRelation;
}

const EVOLUTION_TIMELINE_SEEDS: Readonly<
  Record<WeaponId, readonly [TimelineSeedNode, TimelineSeedNode, TimelineSeedNode, TimelineSeedNode, TimelineSeedNode]>
> = {
  ak15: [
    {
      year: '1936',
      name: { zh: 'M1 加兰德', en: 'M1 Garand' },
      subtitle: { zh: '长行程拉杆 · 双突笋闭锁鼻祖', en: 'Long-Stroke Op-Rod · 2-Lug Ancestor' },
      eraRelation: 'ancestor',
    },
    {
      year: '1947',
      name: { zh: 'AK-47 / AKM', en: 'AK-47 / AKM' },
      subtitle: { zh: '7.62×39mm 卡氏长活塞奠基作', en: 'Classic 7.62mm Kalashnikov Architecture' },
      eraRelation: 'predecessor',
    },
    {
      year: '2023',
      name: { zh: 'AK-15M1 (6П71М)', en: 'AK-15M1 (6P71M)' },
      subtitle: { zh: '第五代浮置护木 · 全通导轨', en: '5th-Gen Free-Float · Cross-Pin Rail' },
      eraRelation: 'current',
    },
    {
      year: '2023',
      name: { zh: 'CZ BREN 2 / SCAR', en: 'CZ BREN 2 / SCAR' },
      subtitle: { zh: '西方短行程活塞模块化竞品', en: 'Western Short-Stroke Modular Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2025',
      name: { zh: 'AK-15K 短管演进', en: 'AK-15K Compact' },
      subtitle: { zh: '紧凑特战枪管与数字光电生态', en: 'Compact CQB Barrel & Digital Optics' },
      eraRelation: 'successor',
    },
  ],
  m4a1: [
    {
      year: '1956',
      name: { zh: '阿玛莱特 AR-10', en: 'ArmaLite AR-10' },
      subtitle: { zh: '斯通纳同轴气吹直托先驱', en: 'Stoner Coaxial DI & Straight-Stock Origin' },
      eraRelation: 'ancestor',
    },
    {
      year: '1964',
      name: { zh: 'M16A1 / XM177', en: 'M16A1 / XM177' },
      subtitle: { zh: '5.56mm 七突笋气吹制式步枪', en: '5.56mm 7-Lug Direct-Impingement Lineage' },
      eraRelation: 'predecessor',
    },
    {
      year: '1994',
      name: { zh: 'Colt M4A1 RAS', en: 'Colt M4A1 RAS' },
      subtitle: { zh: '14.5" 气吹卡宾 · 四导轨标杆', en: '14.5" DI Carbine · Quad-Rail Benchmark' },
      eraRelation: 'current',
    },
    {
      year: '2004',
      name: { zh: 'HK416 / FN SCAR-L', en: 'HK416 / FN SCAR-L' },
      subtitle: { zh: '短行程导气活塞模块化劲敌', en: 'Short-Stroke Gas Piston Modular Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2022',
      name: { zh: '美军 XM7 (NGSW)', en: 'U.S. XM7 (NGSW)' },
      subtitle: { zh: '6.8×51mm 高膛压新世代步枪', en: '6.8×51mm High-Pressure Next-Gen Rifle' },
      eraRelation: 'successor',
    },
  ],
  mp5: [
    {
      year: '1945',
      name: { zh: '毛瑟 StG 45(M)', en: 'Mauser StG 45(M)' },
      subtitle: { zh: '滚柱延迟半自由枪机原理鼻祖', en: 'Roller-Delayed Blowback Principle Origin' },
      eraRelation: 'ancestor',
    },
    {
      year: '1959',
      name: { zh: 'H&K G3 步枪', en: 'H&K G3 Rifle' },
      subtitle: { zh: '7.62mm 双滚柱楔铁冲压架构', en: '7.62mm Dual-Roller Stamped Receiver' },
      eraRelation: 'predecessor',
    },
    {
      year: '1966',
      name: { zh: 'H&K MP5A3', en: 'H&K MP5A3' },
      subtitle: { zh: '9mm 闭膛双滚柱反恐标杆', en: '9mm Closed-Bolt Roller-Delayed Icon' },
      eraRelation: 'current',
    },
    {
      year: '1990',
      name: { zh: 'FN P90 / MP7', en: 'FN P90 / MP7' },
      subtitle: { zh: '北约高速穿甲单兵防卫对手', en: 'NATO High-Velocity Armor-Piercing PDW' },
      eraRelation: 'rival',
    },
    {
      year: '2017',
      name: { zh: 'B&T APC9 / SP5', en: 'B&T APC9 / SP5' },
      subtitle: { zh: '液压缓冲与现代化直装导轨', en: 'Hydraulic-Buffered Modern Tactical SMG' },
      eraRelation: 'successor',
    },
  ],
  g17: [
    {
      year: '1911',
      name: { zh: '柯尔特 M1911', en: 'Colt M1911' },
      subtitle: { zh: '勃朗宁枪管短后坐偏移闭锁鼻祖', en: 'Browning Short-Recoil Tilting Origin' },
      eraRelation: 'ancestor',
    },
    {
      year: '1970',
      name: { zh: 'H&K VP70', en: 'H&K VP70' },
      subtitle: { zh: '人类首款量产聚合物握把套筒手枪', en: 'World’s First Polymer-Frame Pistol' },
      eraRelation: 'predecessor',
    },
    {
      year: '1982',
      name: { zh: 'Glock 17 Gen3', en: 'Glock 17 Gen3' },
      subtitle: { zh: 'Safe Action 击针 · 聚合物典范', en: 'Safe Action Striker · Polymer Benchmark' },
      eraRelation: 'current',
    },
    {
      year: '2014',
      name: { zh: 'SIG P320 (M17)', en: 'SIG P320 (M17)' },
      subtitle: { zh: '可拆模块化不锈钢火控内胆劲敌', en: 'Modular Serialized Stainless FCU Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2021',
      name: { zh: 'Glock 17 Gen5 MOS', en: 'Glock 17 Gen5 MOS' },
      subtitle: { zh: '光学红点直装与双侧操控演进', en: 'Optic-Ready Slide & Ambi Control Evo' },
      eraRelation: 'successor',
    },
  ],
  m82a1: [
    {
      year: '1918',
      name: { zh: '毛瑟 T-Gewehr', en: 'Mauser T-Gewehr' },
      subtitle: { zh: '人类首款 13.2mm 反坦克步枪', en: 'First Purpose-Built 13mm Anti-Tank Rifle' },
      eraRelation: 'ancestor',
    },
    {
      year: '1933',
      name: { zh: '勃朗宁 M2HB', en: 'Browning M2HB' },
      subtitle: { zh: '.50 BMG 管退重机枪弹药先驱', en: '.50 BMG Short-Recoil Heavy MG Origin' },
      eraRelation: 'predecessor',
    },
    {
      year: '1982',
      name: { zh: 'Barrett M82A1', en: 'Barrett M82A1' },
      subtitle: { zh: '短后坐加速子 · 双室箭头制退器', en: 'Short-Recoil Accelerator · Arrow Brake' },
      eraRelation: 'current',
    },
    {
      year: '1995',
      name: { zh: 'McMillan TAC-50', en: 'McMillan TAC-50' },
      subtitle: { zh: '固定重管手动栓动 .50 狙击对手', en: 'Fixed-Barrel Bolt-Action .50 Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2011',
      name: { zh: 'Barrett M107A1', en: 'Barrett M107A1' },
      subtitle: { zh: '钛合金减重与圆柱快拆消音构型', en: 'Titanium Lightened Suppressor-Ready SASR' },
      eraRelation: 'successor',
    },
  ],
  awm: [
    {
      year: '1898',
      name: { zh: '毛瑟 Gewehr 98', en: 'Mauser Gewehr 98' },
      subtitle: { zh: '现代旋转后拉闭锁栓动步枪鼻祖', en: 'Modern Rotating Bolt-Action Foundation' },
      eraRelation: 'ancestor',
    },
    {
      year: '1982',
      name: { zh: 'AI PM / L96A1', en: 'AI PM / L96A1' },
      subtitle: { zh: '全长 CNC 铝梁底盘狙击枪首创', en: 'Full-Length Aluminum Chassis Pioneer' },
      eraRelation: 'predecessor',
    },
    {
      year: '1996',
      name: { zh: 'AI AWM (L115A3)', en: 'AI AWM (L115A3)' },
      subtitle: { zh: '60° 六突笋 · .338 LM 极寒传奇', en: '60° 6-Lug · .338 LM Arctic Legend' },
      eraRelation: 'current',
    },
    {
      year: '2000',
      name: { zh: 'Sako TRG-42', en: 'Sako TRG-42' },
      subtitle: { zh: '芬兰冷锻三突笋 .338 远射劲敌', en: 'Finnish 3-Lug .338 Match Sniper Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2014',
      name: { zh: 'AI AXMC / AXSR', en: 'AI AXMC / AXSR' },
      subtitle: { zh: '多口径快换枪管与模块化护木', en: 'Multi-Caliber Quick-Barrel Evolution' },
      eraRelation: 'successor',
    },
  ],
  scar: [
    {
      year: '1953',
      name: { zh: 'FN FAL 步枪', en: 'FN FAL Rifle' },
      subtitle: { zh: '比利时短行程导气活塞经典鼻祖', en: 'Belgian Short-Stroke Gas Piston Icon' },
      eraRelation: 'ancestor',
    },
    {
      year: '1979',
      name: { zh: 'FN FNC 步枪', en: 'FN FNC Rifle' },
      subtitle: { zh: 'FN 5.56mm 回转闭锁折叠托前身', en: 'FN 5.56mm Folding-Stock Predecessor' },
      eraRelation: 'predecessor',
    },
    {
      year: '2004',
      name: { zh: 'FN SCAR-L Mk 16', en: 'FN SCAR-L Mk 16' },
      subtitle: { zh: '一体铝挤上机匣 · 五十度沙色', en: 'Monolithic Upper · Short-Stroke FDE' },
      eraRelation: 'current',
    },
    {
      year: '2005',
      name: { zh: 'HK416 / ACR', en: 'HK416 / ACR' },
      subtitle: { zh: '美军特战短行程活塞模块化劲敌', en: 'USSOCOM Short-Piston Modular Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2021',
      name: { zh: 'SCAR-L NRCH', en: 'SCAR-L NRCH' },
      subtitle: { zh: '双侧非随动拉机柄实战升级型', en: 'Dual Non-Reciprocating Handle Upgrade' },
      eraRelation: 'successor',
    },
  ],
  deagle: [
    {
      year: '1935',
      name: { zh: 'S&W .357 马格南', en: 'S&W .357 Magnum' },
      subtitle: { zh: '大威力马格南手枪弹药时代开启', en: 'Birth of High-Energy Magnum Handguns' },
      eraRelation: 'ancestor',
    },
    {
      year: '1971',
      name: { zh: 'Auto Mag .44 AMP', en: 'Auto Mag .44 AMP' },
      subtitle: { zh: '半自动回转闭锁马格南手枪先驱', en: 'Rotating-Bolt Magnum Semi-Auto Pioneer' },
      eraRelation: 'predecessor',
    },
    {
      year: '1983',
      name: { zh: '沙漠之鹰 Mk XIX', en: 'Desert Eagle XIX' },
      subtitle: { zh: '膛底导气活塞 · 四突笋 .50 AE', en: 'Gas-Operated 4-Lug Bolt · .50 AE' },
      eraRelation: 'current',
    },
    {
      year: '1992',
      name: { zh: 'Colt Anaconda', en: 'Colt Anaconda' },
      subtitle: { zh: '大口径双动马格南转轮同期对手', en: 'Heavy-Frame Magnum Revolver Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2018',
      name: { zh: 'Mark XIX L5 / IMB', en: 'Mark XIX L5 / IMB' },
      subtitle: { zh: '轻量化铝机匣与一体制退器演进', en: 'Lightened Frame & Integral Muzzle Brake' },
      eraRelation: 'successor',
    },
  ],
  aug: [
    {
      year: '1951',
      name: { zh: '英国 EM-2 步枪', en: 'British EM-2' },
      subtitle: { zh: '早期无托构型与集成光学镜先驱', en: 'Early Optical-Sight Bullpup Pioneer' },
      eraRelation: 'ancestor',
    },
    {
      year: '1966',
      name: { zh: 'Steyr 无托试验型', en: 'Steyr Bullpup Trials' },
      subtitle: { zh: '奥地利聚合物模块化步枪原型', en: 'Austrian Modular Polymer Prototypes' },
      eraRelation: 'predecessor',
    },
    {
      year: '1977',
      name: { zh: 'Steyr AUG A1', en: 'Steyr AUG A1' },
      subtitle: { zh: '20" 快拆长管 · 全塑击锤无托典范', en: '20" Quick-Barrel · Polymer Hammer Pack' },
      eraRelation: 'current',
    },
    {
      year: '1978',
      name: { zh: 'FAMAS F1 / SA80', en: 'FAMAS F1 / SA80' },
      subtitle: { zh: '欧洲同期无托军用制式步枪对手', en: 'European Cold-War Bullpup Rivals' },
      eraRelation: 'rival',
    },
    {
      year: '2014',
      name: { zh: 'AUG A3 M1 / EF88', en: 'AUG A3 M1 / EF88' },
      subtitle: { zh: '全通皮轨、空仓挂机与轻量演进', en: 'Full-Length Rail & Ergonomic Modernization' },
      eraRelation: 'successor',
    },
  ],
  p320: [
    {
      year: '1975',
      name: { zh: 'SIG Sauer P220', en: 'SIG Sauer P220' },
      subtitle: { zh: '方形弹膛嵌入抛壳窗闭锁先驱', en: 'Squared Barrel-Hood Lockup Pioneer' },
      eraRelation: 'ancestor',
    },
    {
      year: '2007',
      name: { zh: 'SIG Sauer P250', en: 'SIG Sauer P250' },
      subtitle: { zh: '可拆法定序列号不锈钢 FCU 首创', en: 'First Removable Serialized FCU Chassis' },
      eraRelation: 'predecessor',
    },
    {
      year: '2014',
      name: { zh: 'SIG P320 M17', en: 'SIG P320 M17' },
      subtitle: { zh: '美军 MHS 模块化全预压击针制式', en: 'US Army MHS Modular Striker Pistol' },
      eraRelation: 'current',
    },
    {
      year: '2017',
      name: { zh: 'Glock 19X', en: 'Glock 19X' },
      subtitle: { zh: '美军模块化手枪决赛直接竞争对手', en: 'US Army MHS Trials Finalist Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2023',
      name: { zh: 'P320-M18 / Flux', en: 'P320-M18 / Flux' },
      subtitle: { zh: '全军紧凑光学直装与底盘生态', en: 'Compact Optic-Ready & PDW Chassis Era' },
      eraRelation: 'successor',
    },
  ],
  p90: [
    {
      year: '1941',
      name: { zh: '美军 M1 卡宾枪', en: 'U.S. M1 Carbine' },
      subtitle: { zh: '二线兵员轻量化个人防卫武器雏形', en: 'Rear-Echelon Personal Defense Concept' },
      eraRelation: 'ancestor',
    },
    {
      year: '1986',
      name: { zh: 'NATO CRISAT 规范', en: 'NATO CRISAT Spec' },
      subtitle: { zh: '北约 200 米穿透防弹衣 PDW 指标', en: '200m Body-Armor Penetration PDW Brief' },
      eraRelation: 'predecessor',
    },
    {
      year: '1990',
      name: { zh: 'FN Herstal P90', en: 'FN Herstal P90' },
      subtitle: { zh: '顶置 50 发 90° 螺旋供弹 · 5.7mm', en: 'Top 50-Rd 90° Helical Feed · 5.7mm' },
      eraRelation: 'current',
    },
    {
      year: '2001',
      name: { zh: 'H&K MP7A1', en: 'H&K MP7A1' },
      subtitle: { zh: '4.6×30mm 德系短活塞 PDW 宿敌', en: '4.6×30mm German Gas-Piston PDW Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2015',
      name: { zh: 'P90 TR / USG', en: 'P90 TR / USG' },
      subtitle: { zh: '三面战术导轨与现代光学微冲平台', en: 'Triple-Rail Modern CQB Optics Evolution' },
      eraRelation: 'successor',
    },
  ],
  lift33: [
    {
      year: '1966',
      name: { zh: 'Allen 复合弓专利', en: 'Allen Cam Patent' },
      subtitle: { zh: '偏心滑轮省力谷打破胡克线性定律', en: 'Eccentric Pulley Let-Off Invention' },
      eraRelation: 'ancestor',
    },
    {
      year: '1992',
      name: { zh: 'Mathews SoloCam', en: 'Mathews SoloCam' },
      subtitle: { zh: '单偏心轮高同步低震动猎弓里程碑', en: 'Single-Cam Zero-Timing-Drift Milestone' },
      eraRelation: 'predecessor',
    },
    {
      year: '2024',
      name: { zh: 'Mathews LIFT 33', en: 'Mathews LIFT 33' },
      subtitle: { zh: '桥式铝桁架 · 85% 省力双同步轮', en: 'Bridged Truss Riser · SwitchWeight-X' },
      eraRelation: 'current',
    },
    {
      year: '2024',
      name: { zh: 'Hoyt Carbon RX-8', en: 'Hoyt Carbon RX-8' },
      subtitle: { zh: '碳纤维空心弓把双轮旗舰狩猎劲敌', en: 'Carbon-Tube Riser Twin-Cam Flagship' },
      eraRelation: 'rival',
    },
    {
      year: '2025',
      name: { zh: 'LIFT X 微调演进', en: 'LIFT X Limb-Shift' },
      subtitle: { zh: '免开弓器轮轴微调与中轴减震整合', en: 'Press-Free Cam Tuning & Bridge-Lock' },
      eraRelation: 'successor',
    },
  ],
  r500: [
    {
      year: '1934',
      name: { zh: '现代钢片机械猎弩', en: 'Modern Steel Crossbow' },
      subtitle: { zh: '二十世纪精密扳机与机械上弦兴起', en: '20th-Century Mechanical Crossbow Revival' },
      eraRelation: 'ancestor',
    },
    {
      year: '2017',
      name: { zh: 'Ravin R9 / R10', en: 'Ravin R9 / R10' },
      subtitle: { zh: 'HeliCoil 螺旋凸轮与零轨悬浮首秀', en: 'HeliCoil Cam & Zero-Rail Track Debut' },
      eraRelation: 'predecessor',
    },
    {
      year: '2021',
      name: { zh: 'Ravin R500', en: 'Ravin R500' },
      subtitle: { zh: 'HexCoil 360° 螺旋轮 · 500 FPS', en: 'HexCoil 360° Cams · 500 FPS Launch' },
      eraRelation: 'current',
    },
    {
      year: '2022',
      name: { zh: 'TenPoint Nitro 505', en: 'TenPoint Nitro 505' },
      subtitle: { zh: '反向弓片超长行程 505 FPS 劲敌', en: 'Reverse-Draw 505 FPS Speed Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2024',
      name: { zh: 'Ravin R500E 电动版', en: 'Ravin R500E Electric' },
      subtitle: { zh: '内置电动伺服丝杠一键上弦退弦', en: 'Motorized Electric-Drive Cocking System' },
      eraRelation: 'successor',
    },
  ],
  python: [
    {
      year: '1873',
      name: { zh: 'Colt SAA 单动左轮', en: 'Colt Single Action' },
      subtitle: { zh: '柯尔特转轮手枪机械体系开山之作', en: 'Iconic Colt Revolving Cylinder Origin' },
      eraRelation: 'ancestor',
    },
    {
      year: '1908',
      name: { zh: 'Colt Official Police', en: 'Colt Official Police' },
      subtitle: { zh: 'I 型锻造框架与折叠 V 形主簧前身', en: 'Forged I-Frame & V-Leaf Spring Lineage' },
      eraRelation: 'predecessor',
    },
    {
      year: '1955',
      name: { zh: 'Colt Python 6"', en: 'Colt Python 6"' },
      subtitle: { zh: '皇家烤蓝三孔肋条 · 金库级闭锁', en: 'Royal Blue Vent-Rib · Bank-Vault Lock' },
      eraRelation: 'current',
    },
    {
      year: '1957',
      name: { zh: 'S&W Model 27 / 19', en: 'S&W Model 27 / 19' },
      subtitle: { zh: '史密斯-韦森 .357 靶用转轮宿敌', en: 'Smith & Wesson .357 Magnum Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2020',
      name: { zh: 'Colt Python 2020', en: 'Colt Python 2020' },
      subtitle: { zh: '现代不锈钢强化顶桥 CNC 复刻版', en: 'Re-Engineered Stainless CNC Revival' },
      eraRelation: 'successor',
    },
  ],
  benellim4: [
    {
      year: '1902',
      name: { zh: '勃朗宁 Auto-5', en: 'Browning Auto-5' },
      subtitle: { zh: '人类首款量产枪管长后坐自动霰弹枪', en: 'First Mass-Produced Semi-Auto Shotgun' },
      eraRelation: 'ancestor',
    },
    {
      year: '1986',
      name: { zh: 'Benelli M1 / M3', en: 'Benelli M1 / M3' },
      subtitle: { zh: '伯奈利惯性后坐战术霰弹枪前身', en: 'Benelli Inertia-Driven Tactical Lineage' },
      eraRelation: 'predecessor',
    },
    {
      year: '1999',
      name: { zh: 'Benelli M4 (M1014)', en: 'Benelli M4 (M1014)' },
      subtitle: { zh: 'ARGO 双短活塞 · 7 发管仓托弹板', en: 'Twin ARGO Pistons · USMC Combat Spec' },
      eraRelation: 'current',
    },
    {
      year: '2013',
      name: { zh: 'Beretta 1301 Tac', en: 'Beretta 1301 Tac' },
      subtitle: { zh: 'B-Link 极速单活塞轻量战术对手', en: 'B-Link Rapid-Cycling Gas Shotgun Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2023',
      name: { zh: 'Benelli M4 T-Pro', en: 'Benelli M4 T-Pro' },
      subtitle: { zh: 'M-LOK 护木与加大战术操纵件演进', en: 'M-LOK Handguard & Oversized Controls' },
      eraRelation: 'successor',
    },
  ],
  garand: [
    {
      year: '1903',
      name: { zh: '春田 M1903 步枪', en: 'Springfield M1903' },
      subtitle: { zh: '.30-06 全威力弹与美军栓动基准', en: '.30-06 Springfield Bolt-Action Baseline' },
      eraRelation: 'ancestor',
    },
    {
      year: '1929',
      name: { zh: '春田 T1E1 / T3E2', en: 'Springfield T1E1/T3E2' },
      subtitle: { zh: '加兰德弯拉杆与顶装漏夹定型样枪', en: 'Garand Op-Rod & En-Bloc Prototypes' },
      eraRelation: 'predecessor',
    },
    {
      year: '1936',
      name: { zh: 'U.S. M1 Garand', en: 'U.S. M1 Garand' },
      subtitle: { zh: '首款全面列装半自动 · 8 发漏夹', en: 'First Standard Semi-Auto · 8-Rd Clip' },
      eraRelation: 'current',
    },
    {
      year: '1940',
      name: { zh: 'SVT-40 / G43', en: 'SVT-40 / G43' },
      subtitle: { zh: '二战同期苏德制式半自动步枪劲敌', en: 'WWII Soviet & German Semi-Auto Rivals' },
      eraRelation: 'rival',
    },
    {
      year: '1957',
      name: { zh: '美军 M14 / Mini-14', en: 'U.S. M14 / Mini-14' },
      subtitle: { zh: '20 发可拆弹匣与短活塞演进后裔', en: 'Detachable 20-Rd Mag & Short-Piston Heir' },
      eraRelation: 'successor',
    },
  ],
  m249: [
    {
      year: '1942',
      name: { zh: '德军 MG 42 机枪', en: 'German MG 42' },
      subtitle: { zh: '受机盖 S 槽高速拨链机构设计鼻祖', en: 'Top-Cover S-Cam Belt Shuttle Pioneer' },
      eraRelation: 'ancestor',
    },
    {
      year: '1958',
      name: { zh: 'FN MAG (M240)', en: 'FN MAG (M240)' },
      subtitle: { zh: '7.62mm 开膛长活塞通用机枪前身', en: '7.62mm Open-Bolt Long-Stroke GPMG' },
      eraRelation: 'predecessor',
    },
    {
      year: '1984',
      name: { zh: 'FN M249 SAW', en: 'FN M249 SAW' },
      subtitle: { zh: '5.56 开膛双路供弹 · 3 秒换管', en: '5.56 Open-Bolt Belt/STANAG Dual Feed' },
      eraRelation: 'current',
    },
    {
      year: '2001',
      name: { zh: 'H&K MG4 / Negev', en: 'H&K MG4 / Negev' },
      subtitle: { zh: '现代 5.56mm 班用弹链轻机枪对手', en: 'Modern 5.56mm Belt-Fed Squad LMG Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2021',
      name: { zh: 'FN EVOLYS / Mk3', en: 'FN EVOLYS / Mk3' },
      subtitle: { zh: '5.5 kg 超轻侧装弹链机枪新世代', en: 'Ultralight Side-Feed LMG Evolution' },
      eraRelation: 'successor',
    },
  ],
  p08: [
    {
      year: '1893',
      name: { zh: '博查特 C93 手枪', en: 'Borchardt C93' },
      subtitle: { zh: '人类首款量产肘节闭锁半自动手枪', en: 'First Commercial Toggle-Lock Pistol' },
      eraRelation: 'ancestor',
    },
    {
      year: '1900',
      name: { zh: '鲁格 M1900 / P04', en: 'Luger M1900 / P04' },
      subtitle: { zh: '55° 握把重构与 9×19mm 弹药诞生', en: '55° Grip Angle & 9×19mm Birth' },
      eraRelation: 'predecessor',
    },
    {
      year: '1908',
      name: { zh: 'DWM Luger P08', en: 'DWM Luger P08' },
      subtitle: { zh: '过死点屈膝肘节 · 麦秆黄回火', en: 'Over-Center Knee Toggle · Sideplate FCG' },
      eraRelation: 'current',
    },
    {
      year: '1911',
      name: { zh: 'Colt M1911 / C96', en: 'Colt M1911 / C96' },
      subtitle: { zh: '同期军用偏移套筒与毛瑟劲敌', en: 'WWI Military Service Pistol Rivals' },
      eraRelation: 'rival',
    },
    {
      year: '1938',
      name: { zh: '瓦尔特 Walther P38', en: 'Walther P38' },
      subtitle: { zh: '双动卡铁落块量产替代制式手枪', en: 'DA/SA Locking-Block Wartime Successor' },
      eraRelation: 'successor',
    },
  ],
  vector: [
    {
      year: '1921',
      name: { zh: '汤姆逊 M1921', en: 'Thompson M1921' },
      subtitle: { zh: '.45 ACP 高射速冲锋枪百年鼻祖', en: 'Classic High-ROF .45 ACP SMG Origin' },
      eraRelation: 'ancestor',
    },
    {
      year: '2006',
      name: { zh: 'TDI Super V 原型', en: 'TDI Super V Proto' },
      subtitle: { zh: '克尔布拉偏轴滑块矢量延迟验证机', en: 'Kerbrat Off-Axis Recoil Proof-of-Concept' },
      eraRelation: 'predecessor',
    },
    {
      year: '2009',
      name: { zh: 'KRISS Vector Gen II', en: 'KRISS Vector Gen II' },
      subtitle: { zh: '-65° 钨钢下潜滑块 · 1,200 RPM', en: '-65° Off-Axis Slider · 1,200 RPM .45' },
      eraRelation: 'current',
    },
    {
      year: '2011',
      name: { zh: 'H&K UMP45 / APC45', en: 'H&K UMP45 / APC45' },
      subtitle: { zh: '传统同轴直线后坐 .45 冲锋枪对手', en: 'Inline Blowback .45 ACP SMG Rival' },
      eraRelation: 'rival',
    },
    {
      year: '2024',
      name: { zh: 'KRISS Vector Gen 3', en: 'KRISS Vector Gen 3' },
      subtitle: { zh: 'M-LOK 模块化护木与 AR 握把升级', en: 'M-LOK Handguard & Modular AR-Grip Evo' },
      eraRelation: 'successor',
    },
  ],
};

export function buildDkEvolutionTimeline(
  dossier: MonographDossierData
): DkTimelineNode[];
export function buildDkEvolutionTimeline(
  weaponId: WeaponId,
  lang?: LanguageCode
): DkTimelineNode[];
export function buildDkEvolutionTimeline(
  dossierOrWeaponId: MonographDossierData | WeaponId,
  langArg?: LanguageCode
): DkTimelineNode[] {
  const weaponId: WeaponId =
    typeof dossierOrWeaponId === 'string'
      ? dossierOrWeaponId
      : dossierOrWeaponId.weaponId;
  const lang: LanguageCode =
    typeof dossierOrWeaponId === 'string'
      ? (langArg ?? 'zh')
      : dossierOrWeaponId.lang;

  const seeds = EVOLUTION_TIMELINE_SEEDS[weaponId] ?? EVOLUTION_TIMELINE_SEEDS.ak15;
  return seeds.map((node) => ({
    year: node.year,
    name: node.name[lang],
    subtitle: node.subtitle[lang],
    isCurrent: node.eraRelation === 'current',
    eraRelation: node.eraRelation,
  }));
}

// ----------------------------------------------------------------------------
// 4. DK Inset Loupe Metadata (4 Curated Optical Magnification Cards per Exhibit)
// ----------------------------------------------------------------------------

const LOCKING_LOUPE_COPY: Readonly<
  Record<LockingFamilyId, { title: BilingualText; caption: BilingualText }>
> = {
  rotating_lug_bolt: {
    title: { zh: '回转突笋闭锁区', en: 'Rotating-Lug Breech Lock' },
    caption: {
      zh: '径向闭锁突笋旋入节套刚性承压，待安全泄压后沿螺旋凸轮槽解锁抽壳。',
      en: 'Radial bolt lugs lock axially into the barrel extension before camming open after blowdown.',
    },
  },
  tilting_barrel_cam: {
    title: { zh: '枪管偏移开锁区', en: 'Tilting-Barrel Breech Cam' },
    caption: {
      zh: '方形弹膛直锁抛壳窗共同后坐泄压，随后下突笋沿斜面下沉脱离套筒。',
      en: 'Squared barrel hood recoils locked in the slide before the underlug ramp cams it downward.',
    },
  },
  toggle_knee_joint: {
    title: { zh: '过死点屈膝肘节', en: 'Over-Center Knee Toggle' },
    caption: {
      zh: '双连杆停于死点下方 1.5° 自锁，撞击尾坡后如人膝上折 53.5° 完成抛壳。',
      en: 'Twin toggle links rest 1.5° below dead-center until frame ramps snap the joint 53.5° skyward.',
    },
  },
  super_v_off_axis_cam: {
    title: { zh: 'Super V 偏轴凸轮腔', en: 'Super V 110° Cam Well' },
    caption: {
      zh: '枪机凸轮耳驱动高密度钨钢滑块沿 -65° 导槽下潜，延迟开锁并抑平枪口上跳。',
      en: 'Bolt cam lugs drive a tungsten counterweight 110° downward to delay opening and cut muzzle climb.',
    },
  },
  roller_or_mass_blowback: {
    title: { zh: '延迟半自由闭锁区', en: 'Delayed-Blowback Breech' },
    caption: {
      zh: '固定冷锻枪管免除偏摆，凭借滚柱机械减速比或枪机惯性质量稳控泄压窗口。',
      en: 'Rigid fixed barrel pairs with roller-wedge leverage or calibrated bolt inertia to hold breech seal.',
    },
  },
  cylinder_notch_ratchet: {
    title: { zh: '六巢棘轮止转闭锁', en: '60° Ratchet & Bolt Lockup' },
    caption: {
      zh: '竖直拨齿推动星盘分度 60°，击发瞬间止转笋与回弹杠杆零旷量抱死弹巢。',
      en: 'Rising hand indexes the 6-point star 60° before the stop-bolt locks the chamber coaxially.',
    },
  },
  cam_letoff_or_adf_sled: {
    title: { zh: '偏心凸轮储能与止点', en: 'Cam Track & Release Lock' },
    caption: {
      zh: '精密偏心轮槽变换力矩比蓄满弹性势能，满拉后进入稳瞄省力谷或悬浮锁止。',
      en: 'Precision cam tracks modulate leverage to store limb strain cleanly at full draw or cocked lock.',
    },
  },
};

const DRIVE_LOUPE_COPY: Readonly<
  Record<DriveFamilyId, { title: BilingualText; caption: BilingualText }>
> = {
  long_stroke_piston: {
    title: { zh: '长行程导气自动机', en: 'Long-Stroke Piston Drive' },
    caption: {
      zh: '镀铬导气活塞与枪机框刚性一体走完全程，凭大往复动量强力破除泥沙阻力。',
      en: 'Gas piston travels rigidly with the carrier through full stroke for high extraction margin.',
    },
  },
  short_stroke_piston: {
    title: { zh: '短行程活塞驱动组', en: 'Short-Stroke Tappet Group' },
    caption: {
      zh: '不锈钢活塞仅做短距瞬态撞击即将动能传给枪机框，将高温积碳隔绝于前部。',
      en: 'Tappet piston imparts a crisp forward impulse while keeping carbon fouling out of the receiver.',
    },
  },
  direct_impingement: {
    title: { zh: '斯通纳气吹内活塞', en: 'Direct-Impingement BCG' },
    caption: {
      zh: '导气管将燃气直喷气匙并在机框内腔同轴膨胀，消除偏心活塞力矩提升精度。',
      en: 'Gas tube pipes propellant pressure straight into the carrier key for zero off-axis torque.',
    },
  },
  short_recoil_barrel: {
    title: { zh: '短后坐套筒与枪管', en: 'Short-Recoil Upper Group' },
    caption: {
      zh: '枪管与套筒或节套锁定共同短距后坐，借动量守恒平滑完成安全泄压与解锁。',
      en: 'Locked barrel and upper recoil together briefly to bleed peak pressure without gas ports.',
    },
  },
  delayed_or_straight_blowback: {
    title: { zh: '直线往复自动机框', en: 'Linear Blowback Carrier' },
    caption: {
      zh: '弹底后推力沿纯直线驱动枪机复进循环，省去导气管路实现极速紧凑连发。',
      en: 'Direct case-head thrust drives a linear breech cycle with zero gas plumbing for compact bursts.',
    },
  },
  manual_bolt_or_revolver_linkage: {
    title: { zh: '精密手动主运动组', en: 'Manual Precision Action' },
    caption: {
      zh: '击发瞬间零自动机质量扰动，以纯机械人力闭锁换取极致弹道一致性。',
      en: 'Zero reciprocating action mass during ignition maximizes cold-bore ballistic consistency.',
    },
  },
  compound_cam_elastic: {
    title: { zh: '分体碳玻弓片与轮组', en: 'Split Carbon Limbs & Cams' },
    caption: {
      zh: '四片抛物线碳玻弓片同步弯曲蓄积弹性应变能，经轮组零损耗转为箭矢动能。',
      en: 'Split quad carbon limbs flex under synchronized cam leverage to store and launch elastic energy.',
    },
  },
};

const FEED_LOUPE_COPY: Readonly<
  Record<FeedFamilyId, { title: BilingualText; caption: BilingualText }>
> = {
  staggered_box_magazine: {
    title: { zh: '盒式弹匣供输总成', en: 'Box Magazine Feed Path' },
    caption: {
      zh: '防倾托弹板经高弹力托簧将弹药顶至抱弹口，复进枪机顺坡直线剥弹入膛。',
      en: 'Anti-tilt follower presents cartridges to hardened feed lips for straight-line chambering.',
    },
  },
  disintegrating_belt_shuttle: {
    title: { zh: 'M27 弹链与应急双供', en: 'M27 Belt & STANAG Feed' },
    caption: {
      zh: '顶盖 S 槽驱动内外双拨爪接力横移可散钢链，左侧同步保留步枪弹匣应急井。',
      en: 'Top-cover S-cam drives dual pawls across M27 steel links alongside an emergency STANAG well.',
    },
  },
  top_helical_90deg: {
    title: { zh: '顶置 90° 螺旋供弹坡', en: '90° Helical Feed Ramp' },
    caption: {
      zh: '50 发横向平铺弹药在双阶螺旋通道内顺时针旋正 90°，空壳由底部垂直抛出。',
      en: 'Fifty sideways rounds twist 90° clockwise down a helical ramp above a downward ejection chute.',
    },
  },
  swing_out_cylinder: {
    title: { zh: '侧摆六巢与星形退壳', en: 'Swing-Out 6-Rd Cylinder' },
    caption: {
      zh: '鹤臂向左摆出凹槽弹巢，按压退壳杆通过星形棘盘将六枚凸缘空壳同步顶出。',
      en: 'Fluted cylinder swings clear on its crane so the star extractor ejects all six rimmed cases.',
    },
  },
  underbarrel_tubular_elevator: {
    title: { zh: '管式弹仓与升降托板', en: 'Tube Mag & Shell Elevator' },
    caption: {
      zh: '下置 7 发管仓释放霰弹滑上不锈钢托弹板，上抬对准弹膛并支持随时补弹。',
      en: 'Underbarrel 7-round tube drops shells onto a pivoting stainless elevator aligned to the bore.',
    },
  },
  top_enbloc_clip: {
    title: { zh: '8 发弹簧钢整装漏夹', en: '8-Rd En-Bloc Clip System' },
    caption: {
      zh: '8 发步枪弹连同冲压钢夹顶压入仓，末发抛壳瞬间凌空弹射发出清脆“PING!”响。',
      en: 'Eight .30-06 rounds press whole into the receiver and ping skyward automatically on shot eight.',
    },
  },
  drop_away_or_flight_track: {
    title: { zh: '碳纤维箭矢与导向槽', en: 'Carbon Projectile & Rest' },
    caption: {
      zh: '高模量微径碳箭搭扣弦环或悬浮箭道，撒放瞬间零刮擦清离尾羽笔直飞出。',
      en: 'High-modulus carbon shaft clears drop-away forks or zero-rail track with zero fletching drag.',
    },
  },
};

const FCG_LOUPE_OVERRIDES: Partial<
  Record<WeaponId, { title: BilingualText; caption: BilingualText }>
> = {
  p08: {
    title: { zh: '侧盖板直角钟表火控', en: 'Sideplate Bellcrank FCG' },
    caption: {
      zh: '新月扳机驱动侧板内 L 形直角杠杆横推阻铁条，以瑞士钟表级轻脆手感释放击针。',
      en: 'Crescent trigger cams an L-shaped sideplate lever laterally to trip the leaf sear cleanly.',
    },
  },
  m249: {
    title: { zh: '开膛待击阻铁与保险', en: 'Open-Bolt Auto Sear Pack' },
    caption: {
      zh: '停射时强力阻铁将枪机锁在后方保持弹膛风冷，杜绝持续扫射红热枪管自燃。',
      en: 'Heavy open-bolt sear holds the carrier rearward between bursts so air cools the chamber.',
    },
  },
  vector: {
    title: { zh: '顶置倒装击锤与快慢机', en: 'Inverted Top Hammer FCG' },
    caption: {
      zh: '击锤倒挂于低膛轴枪管上方，配合独立双侧保险与单/两连/全自动三档快慢机。',
      en: 'Inverted upper hammer pack pairs with separate safeties and Semi/2-Rd/1,200 RPM Auto modes.',
    },
  },
  g17: {
    title: { zh: 'Safe Action 三重保险', en: 'Safe Action Striker Group' },
    caption: {
      zh: '半待击平移击针结合扳机舌、击针柱塞与跌落防走火槽，无需手动外保险即刻响应。',
      en: 'Half-cocked striker integrates trigger tab, plunger block, and drop shelf passive safeties.',
    },
  },
  p320: {
    title: { zh: '可拆序列号不锈钢 FCU', en: 'Modular Stainless FCU' },
    caption: {
      zh: '一体冲压不锈钢内胆集成全部导轨与双阶阻铁，免工具整体提出实现跨握把换装。',
      en: 'Tool-free removable serialized stainless chassis unifies rails, dual-notch sear, and safety.',
    },
  },
  python: {
    title: { zh: '折叠 V 形主簧与回弹杆', en: 'V-Mainspring & Rebound' },
    caption: {
      zh: '手工调校折叠 V 形板簧配合回弹安全杠杆，赋予单动如玻璃折断般的顺滑扳机感。',
      en: 'Hand-tuned folded V-leaf mainspring and positive rebound lever yield glass-crisp trigger break.',
    },
  },
  lift33: {
    title: { zh: 'QAD 落箭台与桥式弓把', en: 'QAD Launcher & Truss Riser' },
    caption: {
      zh: '7075-T6 桥式镂空桁架内嵌燕尾导槽，撒放 4 毫秒内落箭叉瞬间翻落避让尾羽。',
      en: '7075-T6 bridged truss riser houses dovetail mounts as the drop-away fork collapses in 4 ms.',
    },
  },
  r500: {
    title: { zh: 'Trac-Trigger 悬浮滑台', en: 'Trac-Trigger ADF Sled' },
    caption: {
      zh: '丝杠驱动悬浮阻铁滑台咬合弓弦中心，铜质防空放联锁舌杜绝无箭误击发风险。',
      en: 'Floating sled latches the string center with a copper Anti-Dry-Fire interlock preventing mishaps.',
    },
  },
};

export function buildDkLoupeSpecs(
  dossier: MonographDossierData
): DkLoupeSpec[];
export function buildDkLoupeSpecs(
  weaponId: WeaponId,
  lang?: LanguageCode
): DkLoupeSpec[];
export function buildDkLoupeSpecs(
  dossierOrWeaponId: MonographDossierData | WeaponId,
  langArg?: LanguageCode
): DkLoupeSpec[] {
  const weaponId: WeaponId =
    typeof dossierOrWeaponId === 'string'
      ? dossierOrWeaponId
      : dossierOrWeaponId.weaponId;
  const lang: LanguageCode =
    typeof dossierOrWeaponId === 'string'
      ? (langArg ?? 'zh')
      : dossierOrWeaponId.lang;
  const isArchery =
    typeof dossierOrWeaponId === 'string'
      ? getWeaponManifest(weaponId).catalog.category === 'archery'
      : dossierOrWeaponId.isArchery;

  const cls = getExhibitClassification(weaponId);
  const lockCopy = LOCKING_LOUPE_COPY[cls.lockingFamily];
  const driveCopy = DRIVE_LOUPE_COPY[cls.driveFamily];
  const feedCopy = FEED_LOUPE_COPY[cls.feedFamily];
  const fcgOverride = FCG_LOUPE_OVERRIDES[weaponId];

  const defaultFcgTitle = isArchery
    ? lang === 'zh'
      ? '撒放与防空放机构'
      : 'Release & Interlock Group'
    : lang === 'zh'
      ? '火控击发与保险机构'
      : 'Fire-Control & Safety Group';

  const defaultFcgCaption = isArchery
    ? lang === 'zh'
      ? '精准锁持满弦高张力并在扣动瞬间零扭矩释放，防止无箭空放损伤弓片。'
      : 'Holds full draw tension securely and releases torque-free with mechanical dry-fire protection.'
    : lang === 'zh'
      ? '击锤或击针与阻铁、断连器协同工作，在单发复位与保险锁死间精确切换。'
      : 'Hammer or striker coordinates with sear, disconnector, and safety for crisp semi/auto cycling.';

  const breechSpec: DkLoupeSpec =
    weaponId === 'lift33'
      ? {
          plateKey: 'breech_closeup',
          magnification: '3.0×',
          title: lang === 'zh' ? 'SwitchWeight-X 双凸轮' : 'SwitchWeight-X Binary Cam',
          caption:
            lang === 'zh'
              ? '同步偏心轮在满拉末端骤降 85% 持弓拉力，钛合金止点柱构筑坚实稳瞄后墙。'
              : 'Synchronized binary cams drop holding weight 85% against a solid titanium draw-stop wall.',
        }
      : weaponId === 'r500'
        ? {
            plateKey: 'breech_closeup',
            magnification: '3.0×',
            title: lang === 'zh' ? 'HexCoil 360° 螺旋凸轮' : 'HexCoil 360° Helical Cam',
            caption:
              lang === 'zh'
                ? '多层螺旋槽令弓弦缠绕整圈 360°，将满弦轮轴距极限收窄至仅 91 毫米。'
                : 'Stacked helical grooves coil strings a full 360°, shrinking cocked axle width to just 91 mm.',
          }
        : {
            plateKey: 'breech_closeup',
            magnification: '3.0×',
            title: lockCopy.title[lang],
            caption: lockCopy.caption[lang],
          };

  return [
    breechSpec,
    {
      plateKey: 'group_slide',
      magnification: '2.0×',
      title: driveCopy.title[lang],
      caption: driveCopy.caption[lang],
    },
    {
      plateKey: 'group_fcg',
      magnification: '2.5×',
      title: fcgOverride ? fcgOverride.title[lang] : defaultFcgTitle,
      caption: fcgOverride ? fcgOverride.caption[lang] : defaultFcgCaption,
    },
    {
      plateKey: 'group_mag',
      magnification: '2.0×',
      title: feedCopy.title[lang],
      caption: feedCopy.caption[lang],
    },
  ];
}

// ----------------------------------------------------------------------------
// 5. True-Scale 1:1 Actual-Size Cartridge (and 1:4 / 1:5 Archery) Layout Math
// ----------------------------------------------------------------------------

/**
 * Computes exact physical millimeter SVG canvas & drawing coordinates for
 * `DkActualSizeCartridgePlate`.
 * - All 11 metallic cartridges render at literal `1:1` scale (`1 SVG unit = 1 mm`).
 * - Archery projectiles (`arrow_400gr` 736.6mm, `bolt_400gr` 508mm) automatically
 *   render at exact `1:5` or `1:4` scale so they fit comfortably on A4/A3 print sheets
 *   with zero overflow or NaN.
 */
export function computeDkCartridgePlateLayout(
  cartridgeSpec: CartridgeLabSpec,
  lang: LanguageCode,
  orientation: 'vertical' | 'horizontal' = 'vertical'
): DkCartridgePlateLayout {
  const caliberStr = String(cartridgeSpec.caliber);
  const isArchery = isArcheryCaliberProfile(caliberStr);
  const archeryMeta = isArchery ? getArcheryProjectileMeta(caliberStr) : null;

  const safeNum = (v: number | null | undefined, fb: number): number =>
    typeof v === 'number' && Number.isFinite(v) && v > 0 ? v : fb;

  const oalMm = safeNum(archeryMeta?.oalMm ?? cartridgeSpec.oalMm, 50);
  const caseLengthMm = safeNum(
    archeryMeta?.shaftLengthMm ?? cartridgeSpec.caseLengthMm,
    35
  );
  const bulletDiameterMm = safeNum(
    archeryMeta?.shaftDiameterMm ?? cartridgeSpec.bulletDiameterMm,
    9
  );
  const maxDiameterMm = isArchery
    ? safeNum(archeryMeta?.broadheadDiameterMm, 28)
    : Math.max(
        safeNum(cartridgeSpec.rimDiameterMm, bulletDiameterMm),
        safeNum(cartridgeSpec.baseDiameterMm, bulletDiameterMm),
        safeNum(cartridgeSpec.shoulderDiameterMm, 0),
        safeNum(cartridgeSpec.neckDiameterMm, bulletDiameterMm),
        bulletDiameterMm
      );

  const scaleDenom: 1 | 4 | 5 = isArchery
    ? oalMm > 600
      ? 5
      : 4
    : 1;

  const drawnLengthMm = Number((oalMm / scaleDenom).toFixed(2));
  const drawnMaxDiameterMm = Number((maxDiameterMm / scaleDenom).toFixed(2));

  // Generous physical-mm annotation margins so dimension arrows & callouts never clip
  const svgWidthMm =
    orientation === 'vertical'
      ? Number(Math.max(54, drawnMaxDiameterMm + 44).toFixed(2))
      : Number(Math.max(66, drawnLengthMm + 24).toFixed(2));

  const svgHeightMm =
    orientation === 'vertical'
      ? Number(Math.max(46, drawnLengthMm + 18).toFixed(2))
      : Number(Math.max(40, drawnMaxDiameterMm + 30).toFixed(2));

  const scaleStamp =
    scaleDenom === 1
      ? lang === 'zh'
        ? '1:1 真实原大'
        : '1:1 ACTUAL SIZE'
      : lang === 'zh'
        ? `1:${scaleDenom} 缩尺剖视`
        : `1:${scaleDenom} SCALE CUTAWAY`;

  const scaleStampSecondary =
    scaleDenom === 1
      ? lang === 'zh'
        ? '1:1 ACTUAL SIZE'
        : 'TRUE SCALE · MM'
      : lang === 'zh'
        ? `1:${scaleDenom} SCALE`
        : 'TRUE PROPORTION';

  return {
    isArchery,
    orientation,
    scaleDenom,
    oalMm,
    caseLengthMm,
    bulletDiameterMm,
    maxDiameterMm,
    drawnLengthMm,
    drawnMaxDiameterMm,
    svgWidthMm,
    svgHeightMm,
    scaleStamp,
    scaleStampSecondary,
  };
}

/**
 * Convenience lookup returning a metallic `CartridgeLabSpec` or archery lab spec
 * for any weapon ID (useful for standalone tests & layout cards).
 */
export function resolveWeaponCartridgeSpec(weaponId: WeaponId): CartridgeLabSpec {
  const manifest = getWeaponManifest(weaponId);
  const caliber = manifest.caliberProfile;
  const archMeta = getArcheryProjectileMeta(caliber);
  if (archMeta) {
    return {
      caliber,
      code: archMeta.code,
      standard: 'SAAMI',
      nameZh: archMeta.nameZh,
      nameEn: archMeta.nameEn,
      loadSubtitleZh: archMeta.loadSubtitleZh,
      loadSubtitleEn: archMeta.loadSubtitleEn,
      representativeWeapons: [archMeta.primaryWeaponId],
      primaryWeaponId: archMeta.primaryWeaponId,
      lineupXCm: 0,
      caseLengthMm: archMeta.shaftLengthMm,
      oalMm: archMeta.oalMm,
      bulletDiameterMm: archMeta.shaftDiameterMm,
      neckDiameterMm: archMeta.shaftDiameterMm,
      shoulderDiameterMm: null,
      baseDiameterMm: archMeta.shaftDiameterMm,
      rimDiameterMm: archMeta.shaftDiameterMm,
      rimThicknessMm: 2,
      caseCapacityMl: 0,
      propellantMassG: archMeta.projectileMassG,
      propellantFillRatio: 0,
      propellantTypeZh: archMeta.energyDriveZh,
      propellantTypeEn: archMeta.energyDriveEn,
      primerTypeZh: archMeta.nockLatchZh,
      primerTypeEn: archMeta.nockLatchEn,
      projectileMassG: archMeta.projectileMassG,
      projectileGrain: archMeta.projectileGrain,
      coreKind: 'fmj_lead',
      coreAnatomyZh: archMeta.coreAnatomyZh,
      coreAnatomyEn: archMeta.coreAnatomyEn,
      peakPressureMPa: archMeta.peakDrawForceN,
      muzzleVelocityMps: archMeta.muzzleVelocityMps,
      muzzleEnergyJ: archMeta.muzzleEnergyJ,
      highlightZh: archMeta.highlightZh,
      highlightEn: archMeta.highlightEn,
      caseColor: archMeta.shaftColor,
      jacketColor: archMeta.broadheadColor,
      penetratorColor: archMeta.vaneColor,
      coreSlugColor: archMeta.nockColor,
      propellantColor: '#1e293b',
    };
  }
  return CARTRIDGE_LAB_SPECS[caliber];
}

// ----------------------------------------------------------------------------
// 6. Single-Call Editorial Pack Aggregator
// ----------------------------------------------------------------------------

export function assembleDkEditorialPack(
  dossier: MonographDossierData
): DkEditorialPack {
  const partMicroCopyById: Record<string, DkPartMicroCopy> = {};
  for (const row of dossier.bomRows) {
    partMicroCopyById[row.partId] = buildDkPartMicroCopy(row, dossier.lang);
  }

  return {
    weaponId: dossier.weaponId,
    lang: dossier.lang,
    scaleReference: buildDkScaleReference(dossier),
    evolutionTimeline: buildDkEvolutionTimeline(dossier),
    loupeSpecs: buildDkLoupeSpecs(dossier),
    partMicroCopyById,
    cartridgePlateLayout: computeDkCartridgePlateLayout(
      dossier.cartridgeSpec,
      dossier.lang,
      'vertical'
    ),
  };
}

import React, { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ClipboardCopy,
  Crosshair,
  Focus,
  Gauge,
  GitCompareArrows,
  Loader2,
  Maximize2,
  Minimize2,
  Pause,
  Play,
  Scissors,
  ShieldCheck,
  Volume2,
  VolumeX,
  X,
} from 'lucide-react';
import {
  getWeaponBespokeAcousticSignature,
  playWorkbenchFoley,
} from '../../engine/audio/mechanicalSoundEngine';
import {
  WEAPON_RIFLING_SPECS,
  type RiflingKind,
} from '../../engine/ballistics/riflingSpecs';
import {
  playbackClock,
  useActiveFiringPhase,
} from '../../engine/clock/playbackClock';
import {
  getCachedPartGeometry,
  subscribeGeometryStatus,
} from '../../engine/geometry/geometryService';
import {
  getEngineeringRoleMeta,
  resolvePartEngineeringRole,
} from '../../engine/materials/engineeringRoles';
import { isArcheryWeapon } from '../../engine/physics/armoryPhysics';
import { formatWeaponPartTechDossierMarkdown } from '../../engine/utils/techDossierMarkdown';
import { UI_STRINGS } from '../../i18n/uiStrings';
import {
  resolveFiringPhaseText,
  resolvePartMaterialLabel,
  resolveWeaponDisplayMeta,
} from '../../i18n/weaponFallbacks';
import {
  getNarrationAudioSnapshot,
  playNarrationPlaylist,
  playOrToggleNarrationTrack,
  stopNarrationAudio,
  useNarrationAudioPlayer,
} from '../../narration/audioPlayer';
import { useWeaponNarration } from '../../narration/narrationService';
import type { LanguageCode } from '../../narration/types';
import { useAppStore } from '../../store/useAppStore';
import { getWeaponManifest } from '../../weapons/manifests';
import {
  getLoadedWeaponPlugin,
  useWeaponPlugin,
} from '../../weapons/registry';
import type {
  FiringPhaseInfo,
  MaterialKind,
  WeaponId,
} from '../../weapons/types';
import { getSuggestedRivalWeaponId } from '../armory/mechanismShowdownSpecs';
import { GlossaryTermChips } from './GlossaryTermChips';

const EMPTY_FIRING_PHASES: readonly FiringPhaseInfo[] = [];

const LIGHT_GROUP_BADGE_MAP: Readonly<Record<string, string>> = {
  '#38bdf8': '#0284c7',
  '#94a3b8': '#475569',
  '#f59e0b': '#b45309',
  '#fb923c': '#c2410c',
  '#34d399': '#047857',
  '#10b981': '#047857',
};

const MATERIAL_SWATCH_MAP: Readonly<Record<MaterialKind, string>> = {
  nitride_steel: '#64748b',
  barrel_steel: '#94a3b8',
  stainless: '#cbd5e1',
  polymer_frame: '#475569',
  spring_steel: '#38bdf8',
  follower_orange: '#f97316',
  copper_accent: '#d97706',
};

const RIFLING_KIND_LABELS: Readonly<
  Record<Exclude<RiflingKind, 'none'>, { zh: string; en: string }>
> = {
  cut_rifled: { zh: '切削/冷锻膛线', en: 'Rifled Bore' },
  polygonal: { zh: '多边形膛线', en: 'Polygonal Rifling' },
  smoothbore: { zh: '镜面滑膛', en: 'Smoothbore' },
};

const BARREL_PART_EN_RE = /barrel|bore|chamber|tube|cannon|gun|muzzle/i;
const BARREL_PART_ZH_RE = /枪管|炮管|身管|内膛|弹膛|主炮/;
const INSPECTOR_CJK_RE = /[\u3400-\u9fff\u3000-\u303f\uff00-\uffef]/;
const DOSSIER_COPY_RESET_MS = 2200;

async function copyDossierTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to legacy textarea execCommand fallback
    }
  }
  if (typeof document !== 'undefined' && document.body) {
    try {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      textarea.setAttribute('readonly', '');
      textarea.style.position = 'fixed';
      textarea.style.opacity = '0';
      textarea.style.pointerEvents = 'none';
      document.body.appendChild(textarea);
      textarea.select();
      const copied = document.execCommand('copy');
      document.body.removeChild(textarea);
      return copied;
    } catch {
      return false;
    }
  }
  return false;
}

export function resolvePartInspectorSecondaryTitle(params: {
  lang: LanguageCode;
  part: { bomCode: string; nameEn: string; nameZh: string };
  primaryTitle: string;
  groupTitle: string;
  engineeringRoleLabel: string;
  roleTagDisplay: string;
}): string {
  const {
    lang,
    part,
    primaryTitle,
    groupTitle,
    engineeringRoleLabel,
    roleTagDisplay,
  } = params;
  if (lang !== 'en') {
    return part.nameEn;
  }
  const cleanRoleTag = roleTagDisplay.trim();
  if (
    cleanRoleTag.length > 0 &&
    cleanRoleTag.toLowerCase() !== primaryTitle.trim().toLowerCase() &&
    !INSPECTOR_CJK_RE.test(cleanRoleTag)
  ) {
    return `${part.bomCode} · ${cleanRoleTag}`;
  }
  const safeGroup = INSPECTOR_CJK_RE.test(groupTitle) ? 'Assembly' : groupTitle;
  const safeEngRole = INSPECTOR_CJK_RE.test(engineeringRoleLabel)
    ? 'Mechanical Component'
    : engineeringRoleLabel;
  return `${part.bomCode} · ${safeEngRole} · ${safeGroup}`;
}

export function resolvePartInspectorFallbackDescription(params: {
  lang: LanguageCode;
  part: { bomCode: string; nameEn: string; description: string };
  groupTitle: string;
  engineeringRoleLabel: string;
  materialLabel: string;
}): string {
  const { lang, part, groupTitle, engineeringRoleLabel, materialLabel } = params;
  if (lang !== 'en' || !INSPECTOR_CJK_RE.test(part.description)) {
    return part.description;
  }
  const safeGroup = INSPECTOR_CJK_RE.test(groupTitle) ? 'Assembly' : groupTitle;
  const safeEngRole = INSPECTOR_CJK_RE.test(engineeringRoleLabel)
    ? 'Mechanical Component'
    : engineeringRoleLabel;
  const safeMaterial = INSPECTOR_CJK_RE.test(materialLabel)
    ? 'Ordnance Alloy'
    : materialLabel;
  return `${part.nameEn} (${part.bomCode}) — ${safeEngRole} in the ${safeGroup} assembly, manufactured from ${safeMaterial}.`;
}

export function isBarrelOrBorePart(part: {
  id: string;
  nameEn: string;
  nameZh: string;
}): boolean {
  return (
    BARREL_PART_EN_RE.test(part.id) ||
    BARREL_PART_EN_RE.test(part.nameEn) ||
    BARREL_PART_ZH_RE.test(part.nameZh)
  );
}

/**
 * 1-click Z-axis longitudinal CT cutaway helper that immediately collapses any
 * exploded separation so the Cycle 8E 3D helical rifling bore liner is revealed.
 */
export function activateBoreRiflingCutaway(): void {
  const store = useAppStore.getState();
  playWorkbenchFoley('preset_detent');
  store.setSectionCutAxis('z');
  store.resetSectionCutOffset();
  if (
    store.mode === 'explode' &&
    (playbackClock.getState().targetProgress > 0.02 ||
      playbackClock.getState().animatedProgress > 0.02)
  ) {
    store.setTargetProgress(0);
    playbackClock.setTargetProgress(0, true);
  }
  store.setSectionCut(true);
}

export interface PartInspectorCardProps {
  /** Optional overrides for SSR/unit testing; runtime reads directly from `useAppStore`. */
  weaponIdOverride?: WeaponId;
  partIdOverride?: string | null;
  modeOverride?: 'explode' | 'firing';
  langOverride?: LanguageCode;
}

export const PartInspectorCard: React.FC<PartInspectorCardProps> = ({
  weaponIdOverride,
  partIdOverride,
  modeOverride,
  langOverride,
}) => {
  const storeWeaponId = useAppStore((s) => s.activeWeaponId);
  const activeWeaponId = weaponIdOverride ?? storeWeaponId;
  const storeLang = useAppStore((s) => s.lang);
  const lang = langOverride ?? storeLang;
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const autoPlayPartAudio = useAppStore((s) => s.autoPlayPartAudio);
  const toggleAutoPlayPartAudio = useAppStore((s) => s.toggleAutoPlayPartAudio);
  const inspectorMinimized = useAppStore((s) => s.inspectorMinimized);
  const setInspectorMinimized = useAppStore((s) => s.setInspectorMinimized);
  const setStoryOpen = useAppStore((s) => s.setStoryOpen);
  const storeMode = useAppStore((s) => s.mode);
  const mode = modeOverride ?? storeMode;
  const storeSelectedPartId = useAppStore((s) => s.selectedPartId);
  const selectedPartId =
    partIdOverride !== undefined ? partIdOverride : storeSelectedPartId;
  const isolateSelected = useAppStore((s) => s.isolateSelected);
  const selectPart = useAppStore((s) => s.selectPart);
  const toggleIsolateSelected = useAppStore((s) => s.toggleIsolateSelected);
  const activateCutawayFocus = useAppStore((s) => s.activateCutawayFocus);

  const [mobileFiringExpanded, setMobileFiringExpanded] = useState(false);
  const [copiedSignature, setCopiedSignature] = useState<string | null>(null);
  const copyResetTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [, setGeoTick] = useState(0);
  useEffect(() => {
    return () => {
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
        copyResetTimerRef.current = null;
      }
    };
  }, []);
  useEffect(() => {
    return subscribeGeometryStatus((changedWeaponId) => {
      if (changedWeaponId === activeWeaponId) {
        setGeoTick((n) => n + 1);
      }
    });
  }, [activeWeaponId]);

  const plugin =
    useWeaponPlugin(activeWeaponId) ?? getLoadedWeaponPlugin(activeWeaponId);
  const { bundle } = useWeaponNarration(activeWeaponId);
  const audio = useNarrationAudioPlayer();

  const weaponParts = plugin?.parts ?? [];
  const partGroups = plugin?.partGroups ?? [];
  const liveFiringPhase = useActiveFiringPhase(
    plugin?.firingPhases ?? EMPTY_FIRING_PHASES
  );
  const activePhase =
    liveFiringPhase ??
    (modeOverride === 'firing' ? (plugin?.firingPhases[0] ?? null) : null);

  const currentIdx = selectedPartId
    ? weaponParts.findIndex((p) => p.id === selectedPartId)
    : -1;
  const part = currentIdx >= 0 ? weaponParts[currentIdx] : null;
  const partNarrationEntry = part ? (bundle?.parts[part.id] ?? null) : null;
  const localizedPartNarration = partNarrationEntry
    ? partNarrationEntry[lang]
    : null;

  const autoVoiceSignature =
    part && localizedPartNarration
      ? `${activeWeaponId}:${part.id}:${lang}:${localizedPartNarration.audioUrl}`
      : null;

  const lastAutoPlayedRef = useRef<string | null>(null);

  // Auto-play part voiceover when clicking a new part (or switching language while inspecting a part)
  useEffect(() => {
    if (!autoVoiceSignature) {
      lastAutoPlayedRef.current = null;
      return;
    }
    if (lastAutoPlayedRef.current === autoVoiceSignature) {
      return;
    }
    lastAutoPlayedRef.current = autoVoiceSignature;

    if (!autoPlayPartAudio || !part || !localizedPartNarration) {
      return;
    }
    const snap = getNarrationAudioSnapshot();
    if (
      snap.activeKind === 'story' &&
      (snap.isPlaying || snap.isLoading || useAppStore.getState().storyOpen)
    ) {
      return;
    }
    const titleStr = lang === 'en' ? part.nameEn : part.nameZh;
    playNarrationPlaylist(
      [
        {
          key: `part:${activeWeaponId}:${lang}:${part.id}`,
          relativeUrl: localizedPartNarration.audioUrl,
          label: `${part.bomCode} · ${titleStr}`,
          kind: 'part',
          partId: part.id,
          fallbackText: localizedPartNarration.audioScript,
          lang,
        },
      ],
      0
    );
  }, [
    autoVoiceSignature,
    autoPlayPartAudio,
    activeWeaponId,
    lang,
    part,
    localizedPartNarration,
  ]);

  const rawUi = UI_STRINGS[lang].inspector;
  const ui = isArcheryWeapon(activeWeaponId)
    ? { ...rawUi, ...rawUi.archery }
    : rawUi;
  const displayMeta = resolveWeaponDisplayMeta(activeWeaponId, lang, bundle);

  if (!selectedPartId) {
    if (mode === 'firing') {
      if (!activePhase) return null;
      const locPhase = resolveFiringPhaseText(activePhase, lang, bundle);
      return (
        <div
          className={`inspector-card firing-compact-card ${
            mobileFiringExpanded ? 'is-mobile-expanded' : ''
          }`}
        >
          <div className="firing-compact-head">
            <div className="guide-badge firing-badge">
              {ui.firingBadge(activePhase.stepNum)}
            </div>
            <button
              type="button"
              className="firing-mobile-expand-btn"
              data-testid="firing-card-mobile-toggle"
              aria-expanded={mobileFiringExpanded}
              aria-label={
                mobileFiringExpanded
                  ? lang === 'zh'
                    ? '收起击发阶段说明'
                    : 'Collapse firing phase details'
                  : lang === 'zh'
                    ? '展开击发阶段说明'
                    : 'Expand firing phase details'
              }
              onClick={() => {
                playWorkbenchFoley('toggle_switch');
                setMobileFiringExpanded((prev) => !prev);
              }}
            >
              <ChevronDown
                size={13}
                className={mobileFiringExpanded ? 'is-open' : ''}
                aria-hidden="true"
              />
            </button>
          </div>
          <h3 className="guide-title">{locPhase.title}</h3>
          <p className="guide-desc">{locPhase.description}</p>
        </div>
      );
    }

    return (
      <button
        className="floating-cutaway-pill"
        onClick={activateCutawayFocus}
        title={displayMeta.cutawayTitle}
      >
        <ShieldCheck size={14} />
        <span>{displayMeta.cutawayLabel}</span>
      </button>
    );
  }

  if (!part) return null;

  const groupMeta = partGroups.find((g) => g.key === part.group);
  const rawBadgeColor = groupMeta?.badgeColor ?? '#0284c7';
  const badgeColor =
    environmentPreset === 'blueprint_daylight'
      ? (LIGHT_GROUP_BADGE_MAP[rawBadgeColor.toLowerCase()] ?? rawBadgeColor)
      : rawBadgeColor;
  const groupTitle =
    lang === 'en'
      ? (groupMeta?.nameEn ?? part.group)
      : (groupMeta?.nameZh ?? part.group);

  const cachedGeo = getCachedPartGeometry(activeWeaponId, part.id);
  let cadEnvelopeLabel = ui.envelopeBuilding;
  let meshTriLabel = ui.meshBuilding;
  if (cachedGeo) {
    if (!cachedGeo.boundingBox) {
      cachedGeo.computeBoundingBox();
    }
    const box = cachedGeo.boundingBox;
    if (box) {
      const dxMm = (box.max.x - box.min.x) * 10;
      const dyMm = (box.max.y - box.min.y) * 10;
      const dzMm = (box.max.z - box.min.z) * 10;
      cadEnvelopeLabel = `${dxMm.toFixed(1)} × ${dyMm.toFixed(1)} × ${dzMm.toFixed(1)} mm`;
    }
    const indexAttr = cachedGeo.getIndex();
    const posAttr = cachedGeo.getAttribute('position');
    const triCount = indexAttr
      ? Math.round(indexAttr.count / 3)
      : posAttr
        ? Math.round(posAttr.count / 3)
        : 0;
    meshTriLabel = ui.meshTriangles(triCount.toLocaleString('en-US'));
  }

  const goPrev = () => {
    const prevIdx = (currentIdx - 1 + weaponParts.length) % weaponParts.length;
    selectPart(weaponParts[prevIdx].id);
  };

  const goNext = () => {
    const nextIdx = (currentIdx + 1) % weaponParts.length;
    selectPart(weaponParts[nextIdx].id);
  };

  const primaryTitle = lang === 'en' ? part.nameEn : part.nameZh;
  const engineeringRole = resolvePartEngineeringRole(activeWeaponId, part);
  const engineeringRoleMeta = getEngineeringRoleMeta(
    engineeringRole,
    activeWeaponId
  );
  const engineeringRoleLabel =
    lang === 'en' ? engineeringRoleMeta.labelEn : engineeringRoleMeta.labelZh;
  const rawRoleTag =
    localizedPartNarration?.roleTag ??
    (lang === 'en' ? engineeringRoleLabel : part.roleTag);
  const roleTagDisplay =
    lang === 'en' && INSPECTOR_CJK_RE.test(rawRoleTag)
      ? engineeringRoleLabel
      : rawRoleTag;
  const secondaryTitle = resolvePartInspectorSecondaryTitle({
    lang,
    part,
    primaryTitle,
    groupTitle,
    engineeringRoleLabel,
    roleTagDisplay,
  });
  const materialLabel = resolvePartMaterialLabel(activeWeaponId, part, lang);
  const fallbackDescription = resolvePartInspectorFallbackDescription({
    lang,
    part,
    groupTitle,
    engineeringRoleLabel,
    materialLabel,
  });
  const materialSwatchHex = MATERIAL_SWATCH_MAP[part.material] ?? '#94a3b8';
  const suggestedRivalId = getSuggestedRivalWeaponId(activeWeaponId) as WeaponId;
  const rivalShortLabel = getWeaponManifest(suggestedRivalId).shortLabel;
  const bespokeAcoustics = getWeaponBespokeAcousticSignature(activeWeaponId);
  const riflingSpec = WEAPON_RIFLING_SPECS[activeWeaponId];
  const isBarrelFocus = isBarrelOrBorePart(part);

  const handleOpenSplitShowdown = () => {
    playWorkbenchFoley('preset_detent');
    useAppStore.getState().openSplitShowdown(activeWeaponId, suggestedRivalId);
  };

  const handleOpenRecoilLab = () => {
    playWorkbenchFoley('preset_detent');
    useAppStore.getState().openRecoilLab();
  };

  const handleTriggerBoreCutaway = () => {
    activateBoreRiflingCutaway();
  };

  const activeCopySignature = `${activeWeaponId}:${part.id}:${lang}`;
  const dossierCopied = copiedSignature === activeCopySignature;

  const handleCopyTechDossier = () => {
    const shareUrl =
      typeof window !== 'undefined' ? window.location.href : undefined;
    const markdown = formatWeaponPartTechDossierMarkdown({
      weaponId: activeWeaponId,
      partId: part.id,
      lang,
      shareUrl,
      partOverride: {
        part,
        groupTitle,
        materialLabel,
        engineeringNote: localizedPartNarration?.overview ?? fallbackDescription,
        cadEnvelopeMm: cachedGeo ? cadEnvelopeLabel : undefined,
      },
    });
    void copyDossierTextToClipboard(markdown).then((ok) => {
      if (!ok) return;
      playWorkbenchFoley('preset_detent');
      setCopiedSignature(activeCopySignature);
      if (copyResetTimerRef.current !== null) {
        clearTimeout(copyResetTimerRef.current);
      }
      copyResetTimerRef.current = setTimeout(() => {
        copyResetTimerRef.current = null;
        setCopiedSignature(null);
      }, DOSSIER_COPY_RESET_MS);
    });
  };

  const trackKey = `part:${activeWeaponId}:${lang}:${part.id}`;
  const isThisPartActive = audio.activeKey === trackKey;
  const isThisPartPlaying = isThisPartActive && audio.isPlaying;
  const isThisPartLoading = isThisPartActive && audio.isLoading;

  const handleTogglePartVoice = () => {
    if (!localizedPartNarration) return;
    playOrToggleNarrationTrack({
      key: trackKey,
      relativeUrl: localizedPartNarration.audioUrl,
      label: `${part.bomCode} · ${primaryTitle}`,
      kind: 'part',
      partId: part.id,
      fallbackText: localizedPartNarration.audioScript,
      lang,
    });
  };

  const handleCloseInspector = () => {
    if (audio.activeKind === 'part') {
      stopNarrationAudio();
    }
    selectPart(null);
  };

  if (inspectorMinimized) {
    return (
      <div className="inspector-mini-pill">
        {localizedPartNarration && (
          <button
            type="button"
            className={`inspector-mini-play-btn ${
              isThisPartPlaying ? 'playing' : ''
            }`}
            onClick={handleTogglePartVoice}
            title={
              isThisPartPlaying ? ui.voiceGuideBtnPause : ui.voiceGuideBtnPlay
            }
          >
            {isThisPartLoading ? (
              <Loader2 size={13} className="spin-icon" />
            ) : isThisPartPlaying ? (
              <Pause size={13} />
            ) : (
              <Play size={13} />
            )}
            {isThisPartPlaying && (
              <span className="eq-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>
        )}

        <span
          className="inspector-mini-code"
          style={{ borderColor: badgeColor, color: badgeColor }}
        >
          {part.bomCode}
        </span>

        <span className="inspector-mini-title" title={primaryTitle}>
          {primaryTitle}
        </span>

        <div className="inspector-mini-nav">
          <button type="button" onClick={goPrev} title={ui.prevPart}>
            <ChevronLeft size={13} />
          </button>
          <button type="button" onClick={goNext} title={ui.nextPart}>
            <ChevronRight size={13} />
          </button>
        </div>

        <button
          type="button"
          className="inspector-mini-expand-btn"
          onClick={() => setInspectorMinimized(false)}
          title={ui.expandTitle}
        >
          <Maximize2 size={12} />
          <span>{ui.expandBtn}</span>
        </button>

        <button
          type="button"
          className="close-btn"
          onClick={handleCloseInspector}
          title={ui.closeTitle}
        >
          <X size={14} />
        </button>
      </div>
    );
  }

  return (
    <div
      className={`inspector-card ${
        localizedPartNarration ? 'has-deep-narration' : ''
      }`}
    >
      <div className="inspector-top">
        <span
          className="part-group-badge"
          style={{
            borderColor: badgeColor,
            color: badgeColor,
          }}
        >
          {part.bomCode} · {groupTitle}
        </span>
        <div className="inspector-top-actions">
          <button
            type="button"
            className="inspector-minimize-btn"
            onClick={() => setInspectorMinimized(true)}
            title={ui.minimizeTitle}
          >
            <Minimize2 size={12} />
            <span>{ui.minimizeBtn}</span>
          </button>
          <button
            className="close-btn"
            onClick={handleCloseInspector}
            title={ui.closeTitle}
          >
            <X size={15} />
          </button>
        </div>
      </div>

      <h2 className="part-title-zh">{primaryTitle}</h2>
      <div className="part-title-en" data-testid="part-inspector-subtitle">
        {secondaryTitle}
      </div>

      <div className="inspector-spec-pills">
        <span
          className="inspector-role-pill"
          data-engineering-role={engineeringRole}
          title={ui.engineeringRoleBadgeTitle}
          style={{
            borderColor: `${engineeringRoleMeta.colorHex}66`,
            backgroundColor: `${engineeringRoleMeta.colorHex}1a`,
          }}
        >
          <span
            className="inspector-role-dot"
            style={{ backgroundColor: engineeringRoleMeta.colorHex }}
            aria-hidden="true"
          />
          <span>{engineeringRoleLabel}</span>
        </span>
        <span
          className="inspector-material-tag"
          data-material-kind={part.material}
          title={ui.metallurgyTagTitle}
        >
          <span
            className="inspector-material-swatch"
            style={{ backgroundColor: materialSwatchHex }}
            aria-hidden="true"
          />
          <span>{materialLabel}</span>
        </span>
      </div>

      {/* Google Gemini TTS Part Audio Guide Bar */}
      {localizedPartNarration && (
        <div className="part-voice-bar">
          <button
            type="button"
            className={`part-voice-play-btn ${
              isThisPartPlaying ? 'playing' : ''
            }`}
            onClick={handleTogglePartVoice}
          >
            {isThisPartLoading ? (
              <Loader2 size={13} className="spin-icon" />
            ) : isThisPartPlaying ? (
              <Pause size={13} />
            ) : (
              <Play size={13} />
            )}
            <span>
              {isThisPartLoading
                ? ui.voiceGuideLoading
                : isThisPartPlaying
                  ? ui.voiceGuideBtnPause
                  : ui.voiceGuideBtnPlay}
            </span>
            {isThisPartPlaying && (
              <span className="eq-bars" aria-hidden="true">
                <i />
                <i />
                <i />
              </span>
            )}
          </button>

          <button
            type="button"
            className={`part-auto-voice-btn ${
              autoPlayPartAudio ? 'active' : ''
            }`}
            aria-pressed={autoPlayPartAudio}
            onClick={toggleAutoPlayPartAudio}
            title={ui.autoVoiceTitle}
          >
            {autoPlayPartAudio ? <Volume2 size={12} /> : <VolumeX size={12} />}
            <span>{ui.autoVoiceLabel}</span>
          </button>
        </div>
      )}

      <div
        className={localizedPartNarration ? 'inspector-scroll-area' : undefined}
      >
        <div className="meta-grid">
          <div className="meta-row">
            <span className="meta-label">{ui.roleLabel}</span>
            <span className="meta-value highlight">{roleTagDisplay}</span>
          </div>
          <div className="meta-row">
            <span className="meta-label">{ui.materialLabel}</span>
            <span className="meta-value">
              {resolvePartMaterialLabel(activeWeaponId, part, lang)}
            </span>
          </div>
          <div className="meta-row" title={ui.envelopeTitle}>
            <span className="meta-label">{ui.envelopeLabel}</span>
            <span className="meta-value mono">{cadEnvelopeLabel}</span>
          </div>
          <div className="meta-row" title={ui.meshTitle}>
            <span className="meta-label">{ui.meshLabel}</span>
            <span className="meta-value mono">{meshTriLabel}</span>
          </div>
        </div>

        {localizedPartNarration ? (
          <>
            <div className="part-narration-sections">
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secOverview}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.overview}
                </p>
              </div>
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secCraft}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.craftAndMaterial}
                </p>
              </div>
              <div className="part-narration-sec">
                <span className="part-sec-label">{ui.secKinematics}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.kinematicRole}
                </p>
              </div>
              <div className="part-narration-sec highlight-sec">
                <span className="part-sec-label">{ui.secDesign}</span>
                <p className="part-sec-body">
                  {localizedPartNarration.designHighlight}
                </p>
              </div>
            </div>

            <button
              type="button"
              className="part-story-jump-link"
              onClick={() => setStoryOpen(true)}
            >
              <BookOpen size={12} />
              <span>{ui.openStoryLink}</span>
            </button>
          </>
        ) : (
          <div className="part-description">{fallbackDescription}</div>
        )}
      </div>

      {riflingSpec.kind !== 'none' && (
        <div
          className={`inspector-rifling-card ${
            isBarrelFocus ? 'is-barrel-highlight' : ''
          }`}
          data-testid="inspector-rifling-badge"
          data-rifling-kind={riflingSpec.kind}
          data-barrel-focus={isBarrelFocus ? 'true' : 'false'}
        >
          <div className="inspector-rifling-top">
            <span className="inspector-rifling-kicker">
              {lang === 'en' ? 'Bore & Rifling' : '膛线与内膛'}
            </span>
            <div className="inspector-rifling-tags">
              <span className="inspector-rifling-chip">
                {RIFLING_KIND_LABELS[riflingSpec.kind][lang]}
              </span>
              <span className="inspector-rifling-chip is-mono">
                Ø{riflingSpec.boreDiameterMm} mm
              </span>
              {riflingSpec.chromeLined && (
                <span className="inspector-rifling-chip is-chrome">
                  {lang === 'en' ? 'Chrome-Lined' : '硬铬内膛'}
                </span>
              )}
            </div>
          </div>
          <div className="inspector-rifling-bottom">
            <span
              className="inspector-rifling-label"
              title={lang === 'en' ? riflingSpec.labelEn : riflingSpec.labelZh}
            >
              {lang === 'en' ? riflingSpec.labelEn : riflingSpec.labelZh}
            </span>
            <button
              type="button"
              className="inspector-bore-cutaway-btn"
              data-testid="inspector-bore-cutaway-btn"
              onClick={handleTriggerBoreCutaway}
              title={
                lang === 'en'
                  ? 'Activate Z-axis CT longitudinal cutaway to inspect 3D helical rifling bore ([C])'
                  : '一键开启 Z 轴纵剖面并合拢枪身，直视 3D 螺旋膛线与内膛结构 ([C])'
              }
            >
              <Scissors size={11} aria-hidden="true" />
              <span>{lang === 'en' ? 'Bore Cutaway' : '膛线纵剖'}</span>
              <kbd className="inspector-kbd-hint">C</kbd>
            </button>
          </div>
        </div>
      )}

      {bespokeAcoustics && (
        <div
          className="inspector-acoustics-badge"
          data-testid="inspector-bespoke-acoustics-badge"
          data-acoustic-style={bespokeAcoustics.mechanismStyle}
          title={
            lang === 'en' ? bespokeAcoustics.labelEn : bespokeAcoustics.labelZh
          }
        >
          <Volume2 size={11} aria-hidden="true" />
          <span className="inspector-acoustics-kicker">
            {lang === 'en' ? 'Bespoke Acoustics' : '专属机械声学'}
          </span>
          <span className="inspector-acoustics-summary">
            {lang === 'en'
              ? bespokeAcoustics.labelEn
              : bespokeAcoustics.labelZh}
          </span>
        </div>
      )}

      <GlossaryTermChips weaponId={activeWeaponId} lang={lang} />

      <div className="inspector-lab-links">
        <button
          type="button"
          className="inspector-split-cta"
          onClick={handleOpenSplitShowdown}
          title={ui.compareSplit3dTitle(rivalShortLabel)}
          data-rival-id={suggestedRivalId}
        >
          <GitCompareArrows size={13} aria-hidden="true" />
          <span>{ui.compareSplit3dBtn(rivalShortLabel)}</span>
        </button>

        <button
          type="button"
          className="inspector-recoil-cta"
          data-testid="inspector-recoil-lab-btn"
          onClick={handleOpenRecoilLab}
          title={
            lang === 'en'
              ? 'Open Recoil Impulse, Gas-Jet & Muzzle-Climb Lab'
              : '打开后坐冲量、燃气动量与枪口上跳物理实验室'
          }
        >
          <Gauge size={13} aria-hidden="true" />
          <span>{lang === 'en' ? 'Recoil Lab' : '后坐物理'}</span>
        </button>
      </div>

      <div className="inspector-copy-dossier-row">
        <button
          type="button"
          className={`inspector-copy-dossier-btn ${dossierCopied ? 'is-copied' : ''}`}
          data-testid="inspector-copy-dossier-btn"
          onClick={handleCopyTechDossier}
          title={
            lang === 'en'
              ? 'Copy Smithsonian Markdown engineering specification sheet for this exhibit & selected component'
              : '一键复制当前展品与所选零件的史密森尼式 Markdown 工程技术规格卡'
          }
        >
          {dossierCopied ? (
            <Check size={13} aria-hidden="true" />
          ) : (
            <ClipboardCopy size={13} aria-hidden="true" />
          )}
          <span>
            {dossierCopied
              ? lang === 'en'
                ? 'Copied Markdown Spec ✓'
                : '已复制 Markdown 工程卡 ✓'
              : lang === 'en'
                ? 'Copy Tech Dossier'
                : '复制工程卡'}
          </span>
        </button>
        <span
          className="inspector-copy-dossier-status"
          role="status"
          aria-live="polite"
          aria-atomic="true"
          data-testid="inspector-copy-dossier-status"
        >
          {dossierCopied
            ? lang === 'en'
              ? 'Copied Markdown Spec ✓'
              : '已复制 Markdown 工程卡 ✓'
            : ''}
        </span>
      </div>

      <div className="inspector-actions">
        <button
          className={`isolate-btn ${isolateSelected ? 'active' : ''}`}
          onClick={toggleIsolateSelected}
        >
          <Focus size={14} />
          <span>{isolateSelected ? ui.isolateExit : ui.isolateEnter}</span>
        </button>

        <div className="step-nav">
          <button onClick={goPrev} title={ui.prevPart}>
            <ChevronLeft size={15} />
          </button>
          <span className="step-counter">
            <Crosshair size={12} />
            {currentIdx + 1} / {weaponParts.length}
          </span>
          <button onClick={goNext} title={ui.nextPart}>
            <ChevronRight size={15} />
          </button>
        </div>
      </div>
    </div>
  );
};

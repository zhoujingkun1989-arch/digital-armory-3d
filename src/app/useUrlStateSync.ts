import { useEffect, useRef, useState } from 'react';
import {
  clampSectionCutOffset,
  type SectionCutAxis,
} from '../engine/actors/StencilSectionCap';
import type {
  MuzzleAttachmentId,
  OpticAttachmentId,
} from '../engine/attachments/attachmentSpecs';
import { useAttachmentStore } from '../engine/attachments/attachmentStore';
import { playWorkbenchFoley } from '../engine/audio/mechanicalSoundEngine';
import type { ArmoryEnvironmentPreset } from '../engine/canvas/GunsmithStageMat';
import { playbackClock } from '../engine/clock/playbackClock';
import {
  CARTRIDGE_LAB_SPECS,
  isCaliberProfile,
  isTankOrdnanceProfile,
} from '../engine/cartridges/cartridgeSpecs';
import {
  EXTERNAL_PROJECTILE_SPECS,
  type ExternalProjectileId,
  normalizeExternalProjectileId,
} from '../engine/physics/externalBallistics';
import { isTankWeapon } from '../engine/physics/armoryPhysics';
import { useTankCrewStore } from '../engine/tank/tankCrewStore';
import type {
  MonographCaptureQuality,
  MonographEdition,
  MonographLayoutMode,
  MonographPageMode,
  MonographStyleMode,
} from '../features/monograph/monographCaptureStore';
import { getLocalizedShortWeaponLabel } from '../i18n/weaponFallbacks';
import type { LanguageCode } from '../narration/types';
import {
  type AppScreen,
  type AppViewMode,
  detectBrowserDefaultLanguage,
  type MonographModalLaunchOptions,
  useAppStore,
} from '../store/useAppStore';
import { getWeaponManifest } from '../weapons/manifests';
import {
  getLoadedWeaponPlugin,
  loadWeaponPlugin,
} from '../weapons/registry';
import {
  type CaliberProfile,
  isWeaponId,
  type WeaponId,
} from '../weapons/types';

export interface WorkbenchDeepLinkOptions {
  sectionCutAxis?: SectionCutAxis;
  sectionCutOffset?: number;
  xrayShells?: boolean;
  engineeringTint?: boolean;
  muzzle?: MuzzleAttachmentId;
  optic?: OpticAttachmentId;
  selectedPartId?: string | null;
  explodeProgress?: number;
}

const VALID_SECTION_AXES = new Set<SectionCutAxis>(['z', 'x', 'y', 'box']);
const SAFE_PART_ID_RE = /^[a-z0-9_]{2,64}$/;
const DEFAULT_ENVIRONMENT_PRESET: ArmoryEnvironmentPreset = 'tactical_vault';

/**
 * Parses studio environment preset from URL query parameters:
 * - `?env=blueprint_daylight` -> `'blueprint_daylight'`
 * - `?env=gunsmith_bench` -> `'gunsmith_bench'`
 * - `?env=tactical_vault` or `?env=dark_studio` -> `'tactical_vault'`
 * - Fallback aliases when `env` is omitted or unrecognized:
 *   `?theme=light` -> `'blueprint_daylight'`, `?theme=dark` -> `'tactical_vault'`
 */
export function parseEnvironmentPresetUrlParam(
  rawEnv: string | null | undefined,
  rawTheme?: string | null | undefined
): ArmoryEnvironmentPreset | null {
  if (rawEnv) {
    const norm = rawEnv.trim().toLowerCase();
    if (norm === 'blueprint_daylight') return 'blueprint_daylight';
    if (norm === 'gunsmith_bench') return 'gunsmith_bench';
    if (norm === 'tactical_vault' || norm === 'dark_studio') {
      return 'tactical_vault';
    }
  }
  if (rawTheme) {
    const normTheme = rawTheme.trim().toLowerCase();
    if (normTheme === 'light') return 'blueprint_daylight';
    if (normTheme === 'dark') return 'tactical_vault';
  }
  return null;
}

/**
 * Serializes studio environment preset into canonical `?env=` param, omitting
 * the default dark studio preset (`tactical_vault`) so default URLs stay clean.
 */
export function serializeEnvironmentPresetUrlParam(
  preset: ArmoryEnvironmentPreset | undefined
): string | null {
  if (!preset || preset === DEFAULT_ENVIRONMENT_PRESET) return null;
  return preset;
}

export function parseSectionAxisUrlParam(
  raw: string | null | undefined
): SectionCutAxis | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase() as SectionCutAxis;
  return VALID_SECTION_AXES.has(norm) ? norm : null;
}

export function parseMuzzleUrlParam(
  raw: string | null | undefined
): MuzzleAttachmentId | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  if (norm === 'suppressor') return 'suppressor';
  if (norm === 'brake' || norm === 'muzzle_brake') return 'muzzle_brake';
  if (norm === 'flash_hider') return 'flash_hider';
  return null;
}

export function serializeMuzzleUrlParam(
  muzzle: MuzzleAttachmentId | undefined
): string | null {
  if (!muzzle || muzzle === 'none') return null;
  if (muzzle === 'muzzle_brake') return 'brake';
  return muzzle;
}

export function parseOpticUrlParam(
  raw: string | null | undefined
): OpticAttachmentId | null {
  if (!raw) return null;
  const norm = raw.trim().toLowerCase();
  if (norm === 'red_dot' || norm === 'lpvo' || norm === 'thermal') {
    return norm;
  }
  return null;
}

/**
 * Parses optional `?explode=<0..1>` Workbench disassembly progress query param,
 * clamping finite numeric values cleanly into `[0, 1]` and returning `null`
 * when omitted or non-numeric.
 */
export function parseExplodeUrlParam(
  raw: string | null | undefined
): number | null {
  if (raw === null || raw === undefined) return null;
  const trimmed = raw.trim();
  if (trimmed.length === 0) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return null;
  const clamped = Math.max(0, Math.min(1, parsed));
  return Math.round(clamped * 1000) / 1000;
}

/**
 * Serializes Workbench explode progress into canonical `?explode=` param,
 * omitting `0` (assembled default) so default URLs stay clean.
 */
export function serializeExplodeUrlParam(
  progress: number | undefined
): string | null {
  if (typeof progress !== 'number' || !Number.isFinite(progress)) {
    return null;
  }
  const clamped = Math.max(0, Math.min(1, progress));
  if (clamped <= 0.005) return null;
  const rounded = Math.round(clamped * 100) / 100;
  return String(rounded);
}

const copyLinkToastListeners = new Set<() => void>();

export function subscribeCopyViewLinkToast(listener: () => void): () => void {
  copyLinkToastListeners.add(listener);
  return () => {
    copyLinkToastListeners.delete(listener);
  };
}

export function notifyCopyViewLinkToast(): void {
  copyLinkToastListeners.forEach((fn) => fn());
}

/**
 * Copies the exact current 3D view URL (`window.location.href`) using the async
 * Clipboard API with a resilient offscreen `<textarea>` fallback.
 */
export async function copyCurrent3dViewLink(): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  const url = window.location.href;
  try {
    if (
      typeof navigator !== 'undefined' &&
      navigator.clipboard &&
      typeof navigator.clipboard.writeText === 'function'
    ) {
      await navigator.clipboard.writeText(url);
      notifyCopyViewLinkToast();
      return true;
    }
  } catch {
    // Fall through to legacy textarea copy
  }
  try {
    if (typeof document !== 'undefined' && document.body) {
      const ta = document.createElement('textarea');
      ta.value = url;
      ta.setAttribute('readonly', 'true');
      ta.style.position = 'fixed';
      ta.style.top = '-9999px';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const copied =
        typeof document.execCommand === 'function' &&
        document.execCommand('copy');
      ta.remove();
      if (copied) {
        notifyCopyViewLinkToast();
        return true;
      }
    }
  } catch {
    // Ignore clipboard rejection in restricted contexts
  }
  notifyCopyViewLinkToast();
  return false;
}

/**
 * 1-Click "Matt Rittman Slow-Mo Cutaway Cinema Demo" orchestrator:
 * enters Workbench firing mode with live CT cutaway, gas flow vectors,
 * internal ballistics oscilloscope, 0.25x ultra-slow playback, and cutaway focus.
 */
export function triggerSlowMoCutawayCinema(): void {
  const cur = useAppStore.getState();
  if (cur.screen !== 'workbench') {
    cur.enterWorkbench(cur.activeWeaponId, 'firing');
  }
  const st = useAppStore.getState();
  st.setMode('firing');
  st.setSectionCut(true);
  st.setXrayShells(false);
  st.setGasFlowVisible(true);
  st.setTelemetryHudOpen(true);
  st.setFireSpeedMultiplier(0.25);
  if (!useAppStore.getState().fireLoop) {
    useAppStore.getState().toggleFireLoop();
  }
  st.triggerCameraPreset('cutaway_focus');
  if (!useAppStore.getState().isFiringPlaying) {
    useAppStore.getState().toggleFiringPlay();
  }
  playWorkbenchFoley('director_cue');
}

export interface DocumentTitleOptions {
  mode?: AppViewMode;
  sectionCut?: boolean;
  cartridgeCaliber?: CaliberProfile;
  ballisticsCaliber?: ExternalProjectileId;
  splitWeaponA?: WeaponId;
  splitWeaponB?: WeaponId;
}

/**
 * Formats an authentic, dynamic bilingual `document.title` for every museum
 * screen & exhibit (strictly 0 CJK characters when `lang === 'en'`).
 */
export function formatMuseumDocumentTitle(
  screen: AppScreen,
  weaponId: WeaponId,
  lang: LanguageCode,
  options?: DocumentTitleOptions
): string {
  const shortLabel = getLocalizedShortWeaponLabel(weaponId, lang);
  if (screen === 'showcase') {
    return lang === 'en'
      ? 'Digital Armory 3D | Open-Source 1:1 Firearm & Armor Mechanical Museum'
      : '数字兵器库 | Digital Armory 3D 开源 1:1 枪械与重装甲机械博物馆';
  }
  if (screen === 'cartridges') {
    const calId: CaliberProfile = options?.cartridgeCaliber ?? '556_nato';
    const calCode = CARTRIDGE_LAB_SPECS[calId].code;
    return lang === 'en'
      ? `${calCode} · 1:1 Ordnance Cutaway Lab | Digital Armory 3D`
      : `${calCode} · 1:1 实弹与炮弹纵剖馆 | 数字兵器库`;
  }
  if (screen === 'ballistics') {
    const projId = normalizeExternalProjectileId(
      options?.ballisticsCaliber ?? '338_lapua'
    );
    const calLabel = EXTERNAL_PROJECTILE_SPECS[projId].code;
    return lang === 'en'
      ? `${calLabel} · 1,000m Proving Ground | Digital Armory 3D`
      : `${calLabel} · 1,000m 三维实弹靶场 | 数字兵器库`;
  }
  if (screen === 'split_showdown') {
    const labelA = getLocalizedShortWeaponLabel(
      options?.splitWeaponA ?? weaponId,
      lang
    );
    const labelB = getLocalizedShortWeaponLabel(
      options?.splitWeaponB ?? 'm4a1',
      lang
    );
    return lang === 'en'
      ? `${labelA} vs ${labelB} · Linked 3D Split Showdown | Digital Armory 3D`
      : `${labelA} vs ${labelB} · 3D 联屏剖视对决 | 数字兵器库`;
  }
  if (screen === 'workbench') {
    const viewLabel = options?.sectionCut
      ? lang === 'en'
        ? '3D Cutaway'
        : '3D 剖视工作台'
      : options?.mode === 'firing'
        ? lang === 'en'
          ? 'Live Ballistics'
          : '实弹内弹道演示'
        : lang === 'en'
          ? '3D Disassembly'
          : '3D 结构拆解台';
    return lang === 'en'
      ? `${shortLabel} · ${viewLabel} | Digital Armory 3D`
      : `${shortLabel} · ${viewLabel} | 数字兵器库`;
  }
  return lang === 'en'
    ? `${shortLabel} · 34-Bay Mechanical Vault | Digital Armory 3D`
    : `${shortLabel} · 34 槽 10 展厅数字兵器库 | 数字兵器库`;
}

export function getDefaultEntryScreen(): 'showcase' | 'armory' {
  if (
    typeof window !== 'undefined' &&
    window.__DIGITAL_ARMORY_ENTRY__ === 'armory'
  ) {
    return 'armory';
  }
  return 'showcase';
}

export interface MonographDeepLinkParams extends MonographModalLaunchOptions {
  open: boolean;
  weaponId?: WeaponId;
  lang?: LanguageCode;
}

const VALID_MONOGRAPH_STYLES = new Set<MonographStyleMode>([
  'dk_encyclopedia',
  'pro_dossier',
  'kids_pictorial',
]);
const VALID_MONOGRAPH_EDITIONS = new Set<MonographEdition>([
  'dk_encyclopedia',
  'blueprint_manual',
  'obsidian_folio',
]);
const VALID_MONOGRAPH_LAYOUTS = new Set<MonographLayoutMode>([
  'spread_a3',
  'portrait_a4',
]);
const VALID_MONOGRAPH_PAGES = new Set<MonographPageMode>([
  'full_8p',
  'compact_4p',
]);
const VALID_MONOGRAPH_QUALITIES = new Set<MonographCaptureQuality>([
  'standard_1440',
  'print_2880',
]);

/**
 * Parses Monograph Studio / Automated Pre-Press PDF deep-link query parameters:
 * `?monograph=1&weapon=<id>&style=<style>&edition=<edition>&layout=<layout>&pages=<pages>&quality=<quality>&lang=<lang>&prepress=<0|1>&callsign=<str>`
 */
export function parseMonographDeepLinkParams(
  searchOverride?: string
): MonographDeepLinkParams {
  const rawSearch =
    searchOverride !== undefined
      ? searchOverride
      : typeof window !== 'undefined'
        ? window.location.search
        : '';
  const params = new URLSearchParams(rawSearch);
  const rawMonograph = params.get('monograph')?.trim().toLowerCase();
  const open = rawMonograph === '1' || rawMonograph === 'true';

  const result: MonographDeepLinkParams = { open };

  const rawWeapon = params.get('weapon')?.trim().toLowerCase();
  if (isWeaponId(rawWeapon)) {
    result.weaponId = rawWeapon;
  }

  const rawStyle = params.get('style')?.trim() as MonographStyleMode | undefined;
  if (rawStyle && VALID_MONOGRAPH_STYLES.has(rawStyle)) {
    result.styleMode = rawStyle;
  }

  const rawEdition = params.get('edition')?.trim() as
    | MonographEdition
    | undefined;
  if (rawEdition && VALID_MONOGRAPH_EDITIONS.has(rawEdition)) {
    result.edition = rawEdition;
  }

  const rawLayout = params.get('layout')?.trim() as
    | MonographLayoutMode
    | undefined;
  if (rawLayout && VALID_MONOGRAPH_LAYOUTS.has(rawLayout)) {
    result.layoutMode = rawLayout;
  }

  const rawPages = params.get('pages')?.trim() as MonographPageMode | undefined;
  if (rawPages && VALID_MONOGRAPH_PAGES.has(rawPages)) {
    result.pageMode = rawPages;
  }

  const rawQuality = params.get('quality')?.trim() as
    | MonographCaptureQuality
    | undefined;
  if (rawQuality && VALID_MONOGRAPH_QUALITIES.has(rawQuality)) {
    result.quality = rawQuality;
  }

  const rawLang = params.get('lang')?.trim().toLowerCase();
  if (rawLang === 'zh' || rawLang === 'en') {
    result.lang = rawLang;
  }

  const rawPrepress = params.get('prepress')?.trim().toLowerCase();
  if (rawPrepress === '1' || rawPrepress === 'true') {
    result.prepress = true;
  } else if (rawPrepress === '0' || rawPrepress === 'false') {
    result.prepress = false;
  }

  const rawCallsign = params.get('callsign');
  if (rawCallsign !== null) {
    const trimmed = rawCallsign.trim().slice(0, 32);
    if (trimmed.length > 0) {
      result.collectorCallsign = trimmed;
    }
  }

  return result;
}

export function applyLocationToStore(searchOverride?: string): void {
  if (searchOverride === undefined && typeof window === 'undefined') return;
  const rawSearch = searchOverride ?? window.location.search;
  const params = new URLSearchParams(rawSearch);
  const rawWeapon = params.get('weapon');
  const rawScreen = params.get('screen');
  const rawMode = params.get('mode');
  const rawLang = params.get('lang');
  const rawCaliber = params.get('caliber');
  const rawCut = params.get('cut');
  const monographDeepLink = parseMonographDeepLinkParams(rawSearch);

  const current = useAppStore.getState();
  if (rawLang === 'en' || rawLang === 'zh') {
    current.setLang(rawLang);
  } else {
    current.setLang(detectBrowserDefaultLanguage());
  }
  const weaponId: WeaponId = isWeaponId(rawWeapon)
    ? rawWeapon
    : current.activeWeaponId;
  const defaultScreen = getDefaultEntryScreen();
  const targetScreen: AppScreen =
    rawScreen === 'workbench'
      ? 'workbench'
      : rawScreen === 'cartridges'
        ? 'cartridges'
        : rawScreen === 'ballistics'
          ? 'ballistics'
          : rawScreen === 'split_showdown'
            ? 'split_showdown'
            : rawScreen === 'showcase'
              ? 'showcase'
              : rawScreen === 'armory'
                ? 'armory'
                : defaultScreen;
  const targetMode: AppViewMode = rawMode === 'firing' ? 'firing' : 'explode';

  if (targetScreen === 'workbench') {
    current.enterWorkbench(weaponId, targetMode);
    const wbStore = useAppStore.getState();
    const scaleProfile = getWeaponManifest(weaponId).workbenchMeta.scaleProfile;

    // Hydrate optional `?explode=<0..1>` disassembly progress on Workbench load
    const parsedExplode = parseExplodeUrlParam(params.get('explode'));
    if (parsedExplode !== null && rawMode !== 'firing') {
      if (wbStore.mode !== 'explode') {
        wbStore.setMode('explode');
      }
      playbackClock.setTargetProgress(parsedExplode, true);
    }

    // Apply X-Ray first so explicit `cut=1` takes visual precedence when both are present
    const rawXray = params.get('xray')?.trim().toLowerCase();
    if (rawXray === '1' || rawXray === 'true') {
      wbStore.setXrayShells(true);
    } else if (rawXray === '0' || rawXray === 'false') {
      wbStore.setXrayShells(false);
    }

    const isCutEnabled = rawCut === '1' || rawCut === 'true';
    const parsedAxis = parseSectionAxisUrlParam(params.get('axis'));
    if (isCutEnabled) {
      wbStore.setSectionCut(true);
    }
    if (parsedAxis) {
      wbStore.setSectionCutAxis(parsedAxis);
    }
    const effectiveAxis: SectionCutAxis = parsedAxis ?? 'z';
    const rawSlice = params.get('slice');
    if (isCutEnabled && rawSlice !== null && effectiveAxis !== 'box') {
      const sliceMm = Number(rawSlice);
      if (Number.isFinite(sliceMm)) {
        const clampedCm = clampSectionCutOffset(
          sliceMm / 10,
          scaleProfile,
          effectiveAxis
        );
        wbStore.setSectionCutOffset(clampedCm);
      }
    }

    const rawTint = params.get('tint')?.trim().toLowerCase();
    if (rawTint === '1' || rawTint === 'true') {
      wbStore.setEngineeringTint(true);
    } else if (rawTint === '0' || rawTint === 'false') {
      wbStore.setEngineeringTint(false);
    }

    const parsedMuzzle = parseMuzzleUrlParam(params.get('muzzle'));
    if (parsedMuzzle) {
      useAttachmentStore.getState().setMuzzle(weaponId, parsedMuzzle);
    }
    const rawPanelCheck = params.get('panel');
    if (rawPanelCheck !== 'crew') {
      const parsedOptic = parseOpticUrlParam(params.get('optic'));
      if (parsedOptic) {
        useAttachmentStore.getState().setOptic(weaponId, parsedOptic);
      }
    }

    const rawPart = params.get('part')?.trim();
    if (rawPart && SAFE_PART_ID_RE.test(rawPart)) {
      const loadedPlugin = getLoadedWeaponPlugin(weaponId);
      if (loadedPlugin) {
        if (loadedPlugin.parts.some((p) => p.id === rawPart)) {
          useAppStore.getState().selectPart(rawPart);
        }
      } else {
        void loadWeaponPlugin(weaponId).then((plugin) => {
          const live = useAppStore.getState();
          if (
            live.screen === 'workbench' &&
            live.activeWeaponId === weaponId &&
            plugin.parts.some((p) => p.id === rawPart)
          ) {
            live.selectPart(rawPart);
          }
        });
      }
    }
  } else if (targetScreen === 'split_showdown') {
    const rawWA = params.get('weaponA');
    const rawWB = params.get('weaponB') ?? params.get('splitWeapon');
    current.openSplitShowdown(
      isWeaponId(rawWA) ? rawWA : weaponId,
      isWeaponId(rawWB) ? rawWB : undefined
    );
    const splitStore = useAppStore.getState();
    const rawXray = params.get('xray')?.trim().toLowerCase();
    if (rawXray === '1' || rawXray === 'true') {
      splitStore.setXrayShells(true);
    }
    if (rawCut === '1' || rawCut === 'true') {
      splitStore.setSectionCut(true);
    }
    const parsedAxis = parseSectionAxisUrlParam(params.get('axis'));
    if (parsedAxis) {
      splitStore.setSectionCutAxis(parsedAxis);
    }
  } else if (targetScreen === 'cartridges') {
    if (rawWeapon && isWeaponId(rawWeapon)) {
      current.selectArmoryWeapon(rawWeapon);
    }
    current.openCartridgeLab(
      isCaliberProfile(rawCaliber) || isTankOrdnanceProfile(rawCaliber)
        ? rawCaliber
        : undefined
    );
  } else if (targetScreen === 'ballistics') {
    if (rawWeapon && isWeaponId(rawWeapon)) {
      current.selectArmoryWeapon(rawWeapon);
    }
    current.openExternalBallistics(rawCaliber ?? undefined);
  } else if (targetScreen === 'showcase') {
    if (current.screen !== 'showcase') {
      current.openShowcase();
    }
    if (rawWeapon && isWeaponId(rawWeapon)) {
      current.selectArmoryWeapon(rawWeapon);
    }
  } else if (rawWeapon && isWeaponId(rawWeapon)) {
    if (current.screen !== 'armory') {
      current.returnToArmory();
    }
    current.selectArmoryWeapon(rawWeapon);
  } else if (current.screen !== 'armory') {
    current.returnToArmory();
  }

  // Hydrate studio lighting & UI theme preset after screen/mode transition so
  // acoustic room auto-sync reflects both the target preset and target mode.
  const parsedEnv = parseEnvironmentPresetUrlParam(
    params.get('env'),
    params.get('theme')
  );
  const targetEnv: ArmoryEnvironmentPreset =
    parsedEnv ?? DEFAULT_ENVIRONMENT_PRESET;
  if (useAppStore.getState().environmentPreset !== targetEnv) {
    useAppStore.getState().setEnvironmentPreset(targetEnv);
  }

  if (monographDeepLink.open) {
    const launchOptions: MonographModalLaunchOptions = {};
    if (monographDeepLink.styleMode) {
      launchOptions.styleMode = monographDeepLink.styleMode;
    }
    if (monographDeepLink.edition) {
      launchOptions.edition = monographDeepLink.edition;
    }
    if (monographDeepLink.layoutMode) {
      launchOptions.layoutMode = monographDeepLink.layoutMode;
    }
    if (monographDeepLink.pageMode) {
      launchOptions.pageMode = monographDeepLink.pageMode;
    }
    if (monographDeepLink.quality) {
      launchOptions.quality = monographDeepLink.quality;
    }
    if (monographDeepLink.prepress !== undefined) {
      launchOptions.prepress = monographDeepLink.prepress;
    }
    if (monographDeepLink.collectorCallsign !== undefined) {
      launchOptions.collectorCallsign = monographDeepLink.collectorCallsign;
    }
    useAppStore
      .getState()
      .openMonographModal(monographDeepLink.weaponId ?? weaponId, launchOptions);
  }

  const rawPanel = params.get('panel');
  if (rawPanel === 'causality') {
    const st = useAppStore.getState();
    if (st.screen !== 'workbench') {
      st.enterWorkbench(weaponId, 'firing');
    }
    useAppStore.getState().setCausalitySandboxOpen(true);
  } else if (rawPanel === 'armor') {
    useAppStore.getState().openArmorPenetrationModal();
  } else if (rawPanel === 'reel') {
    useAppStore.getState().openDirectorReelModal();
  } else if (rawPanel === 'passport') {
    useAppStore.getState().openPassportModal();
  } else if (rawPanel === 'timeline') {
    useAppStore.getState().openTimelineModal();
  } else if (rawPanel === 'offline') {
    useAppStore.getState().openOfflineModal();
  } else if (rawPanel === 'scalewall') {
    useAppStore.getState().openScaleWallModal();
  } else if (rawPanel === 'recoil') {
    useAppStore.getState().openRecoilLab();
  } else if (rawPanel === 'poster') {
    useAppStore.getState().openPosterModal({ weaponId });
  } else if (rawPanel === 'atlas') {
    useAppStore.getState().setTextureModalOpen(true);
  } else if (rawPanel === 'monograph') {
    if (!monographDeepLink.open) {
      useAppStore.getState().openMonographModal(weaponId);
    }
  } else if (rawPanel === 'crew') {
    const targetId = isTankWeapon(weaponId) ? weaponId : 'ztz99a';
    const st = useAppStore.getState();
    if (st.screen !== 'workbench' || st.activeWeaponId !== targetId) {
      st.enterWorkbench(targetId, 'explode');
    }
    const crew = useTankCrewStore.getState();
    crew.setActive(true);
    if (params.get('optic') === 'flir') {
      crew.setStation('gunner');
      crew.setOpticMode('flir_whot');
      crew.setTurretYawDeg(18);
      crew.setGunElevDeg(4.5, targetId);
    }
  } else {
    const liveModalState = useAppStore.getState();
    if (liveModalState.scaleWallModalOpen) {
      liveModalState.closeScaleWallModal();
    }
    if (liveModalState.recoilLabOpen) {
      liveModalState.closeRecoilLab();
    }
    if (liveModalState.posterShareModalOpen) {
      liveModalState.closePosterModal();
    }
    if (liveModalState.textureModalOpen) {
      liveModalState.setTextureModalOpen(false);
    }
    if (liveModalState.monographModalOpen && !monographDeepLink.open) {
      liveModalState.closeMonographModal();
    }
  }
}

export function buildSearchString(
  weaponId: WeaponId,
  screen: AppScreen,
  mode: AppViewMode,
  sectionCut: boolean,
  lang: LanguageCode,
  activeCartridgeCaliber: CaliberProfile,
  cartridgeLineupOverview: boolean,
  activeBallisticsCaliber: ExternalProjectileId,
  baseSearch?: string,
  splitShowdownPair?: { weaponA: WeaponId; weaponB: WeaponId },
  workbenchDeepLink?: WorkbenchDeepLinkOptions,
  scaleWallModalOpen?: boolean,
  recoilLabOpen?: boolean,
  environmentPreset?: ArmoryEnvironmentPreset,
  posterShareModalOpen?: boolean,
  textureModalOpen?: boolean,
  monographModalOpen?: boolean
): string {
  const rawSearch =
    baseSearch ?? (typeof window !== 'undefined' ? window.location.search : '');
  const params = new URLSearchParams(rawSearch);
  const defaultScreen = getDefaultEntryScreen();
  const isCrewPanel = params.get('panel') === 'crew';
  params.set('weapon', weaponId);
  params.delete('splitWeapon');
  if (screen === 'workbench') {
    params.set('screen', 'workbench');
    params.set('mode', mode);
    params.delete('caliber');
    params.delete('weaponA');
    params.delete('weaponB');
    if (sectionCut) {
      params.set('cut', '1');
    } else {
      params.delete('cut');
    }
    if (workbenchDeepLink) {
      const axis = workbenchDeepLink.sectionCutAxis ?? 'z';
      if (sectionCut && axis !== 'z') {
        params.set('axis', axis);
      } else {
        params.delete('axis');
      }
      if (
        sectionCut &&
        axis !== 'box' &&
        typeof workbenchDeepLink.sectionCutOffset === 'number' &&
        Number.isFinite(workbenchDeepLink.sectionCutOffset)
      ) {
        const scaleProfile =
          getWeaponManifest(weaponId).workbenchMeta.scaleProfile;
        const clampedCm = clampSectionCutOffset(
          workbenchDeepLink.sectionCutOffset,
          scaleProfile,
          axis
        );
        if (Math.abs(clampedCm) > 0.005) {
          const mm = Math.round(clampedCm * 100) / 10;
          params.set('slice', String(Object.is(mm, -0) ? 0 : mm));
        } else {
          params.delete('slice');
        }
      } else {
        params.delete('slice');
      }

      if (workbenchDeepLink.xrayShells) {
        params.set('xray', '1');
      } else {
        params.delete('xray');
      }

      if (workbenchDeepLink.engineeringTint) {
        params.set('tint', '1');
      } else {
        params.delete('tint');
      }

      const serializedMuzzle = serializeMuzzleUrlParam(
        workbenchDeepLink.muzzle
      );
      if (serializedMuzzle) {
        params.set('muzzle', serializedMuzzle);
      } else {
        params.delete('muzzle');
      }

      if (!isCrewPanel) {
        if (workbenchDeepLink.optic && workbenchDeepLink.optic !== 'none') {
          params.set('optic', workbenchDeepLink.optic);
        } else {
          params.delete('optic');
        }
      }

      if (
        workbenchDeepLink.selectedPartId &&
        SAFE_PART_ID_RE.test(workbenchDeepLink.selectedPartId)
      ) {
        params.set('part', workbenchDeepLink.selectedPartId);
      } else {
        params.delete('part');
      }

      if (mode === 'explode') {
        if (workbenchDeepLink.explodeProgress !== undefined) {
          const serializedExplode = serializeExplodeUrlParam(
            workbenchDeepLink.explodeProgress
          );
          if (serializedExplode) {
            params.set('explode', serializedExplode);
          } else {
            params.delete('explode');
          }
        }
      } else {
        params.delete('explode');
      }
    } else if (mode !== 'explode') {
      params.delete('explode');
    }
  } else if (screen === 'split_showdown') {
    params.set('screen', 'split_showdown');
    params.delete('mode');
    params.delete('explode');
    params.delete('caliber');
    if (sectionCut) {
      params.set('cut', '1');
    } else {
      params.delete('cut');
    }
    params.delete('axis');
    params.delete('slice');
    params.delete('xray');
    params.delete('tint');
    params.delete('muzzle');
    params.delete('part');
    if (!isCrewPanel) params.delete('optic');
    if (splitShowdownPair) {
      params.set('weaponA', splitShowdownPair.weaponA);
      params.set('weaponB', splitShowdownPair.weaponB);
    }
  } else if (screen === 'cartridges') {
    params.set('screen', 'cartridges');
    params.delete('mode');
    params.delete('explode');
    params.delete('cut');
    params.delete('axis');
    params.delete('slice');
    params.delete('xray');
    params.delete('tint');
    params.delete('muzzle');
    params.delete('part');
    if (!isCrewPanel) params.delete('optic');
    params.delete('weaponA');
    params.delete('weaponB');
    if (cartridgeLineupOverview) {
      params.delete('caliber');
    } else {
      params.set('caliber', activeCartridgeCaliber);
    }
  } else if (screen === 'ballistics') {
    params.set('screen', 'ballistics');
    params.delete('mode');
    params.delete('explode');
    params.delete('cut');
    params.delete('axis');
    params.delete('slice');
    params.delete('xray');
    params.delete('tint');
    params.delete('muzzle');
    params.delete('part');
    if (!isCrewPanel) params.delete('optic');
    params.delete('weaponA');
    params.delete('weaponB');
    params.set(
      'caliber',
      normalizeExternalProjectileId(activeBallisticsCaliber)
    );
  } else {
    params.delete('mode');
    params.delete('explode');
    params.delete('caliber');
    params.delete('cut');
    params.delete('axis');
    params.delete('slice');
    params.delete('xray');
    params.delete('tint');
    params.delete('muzzle');
    params.delete('part');
    if (!isCrewPanel) params.delete('optic');
    params.delete('weaponA');
    params.delete('weaponB');
    if (screen === defaultScreen) {
      params.delete('screen');
    } else {
      params.set('screen', screen);
    }
  }
  if (scaleWallModalOpen === true) {
    params.set('panel', 'scalewall');
  } else if (recoilLabOpen === true) {
    params.set('panel', 'recoil');
  } else if (posterShareModalOpen === true) {
    params.set('panel', 'poster');
  } else if (textureModalOpen === true) {
    params.set('panel', 'atlas');
  } else if (monographModalOpen === true) {
    if (!params.has('monograph')) {
      params.set('panel', 'monograph');
    }
  } else if (
    (scaleWallModalOpen === false && params.get('panel') === 'scalewall') ||
    (recoilLabOpen === false && params.get('panel') === 'recoil') ||
    (posterShareModalOpen === false && params.get('panel') === 'poster') ||
    (textureModalOpen === false && params.get('panel') === 'atlas') ||
    (monographModalOpen === false && params.get('panel') === 'monograph')
  ) {
    params.delete('panel');
  }
  if (environmentPreset !== undefined) {
    const serializedEnv =
      serializeEnvironmentPresetUrlParam(environmentPreset);
    if (serializedEnv) {
      params.set('env', serializedEnv);
    } else {
      params.delete('env');
    }
    params.delete('theme');
  }
  const browserDefaultLang = detectBrowserDefaultLanguage();
  const explicitParamLang = params.get('lang');
  if (lang !== browserDefaultLang || explicitParamLang === lang) {
    params.set('lang', lang);
  } else {
    params.delete('lang');
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Bi-directional synchronization between URL query parameters
 * (`?weapon=m4a1&screen=workbench&mode=firing&cut=1&lang=en`) and `useAppStore`.
 */
export function useUrlStateSync(): void {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);
  const sectionCut = useAppStore((s) => s.sectionCut);
  const sectionCutAxis = useAppStore((s) => s.sectionCutAxis);
  const sectionCutOffset = useAppStore((s) => s.sectionCutOffset);
  const xrayShells = useAppStore((s) => s.xrayShells);
  const engineeringTint = useAppStore((s) => s.engineeringTint);
  const selectedPartId = useAppStore((s) => s.selectedPartId);
  const lang = useAppStore((s) => s.lang);
  const activeCartridgeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const cartridgeLineupOverview = useAppStore(
    (s) => s.cartridgeLineupOverview
  );
  const activeBallisticsCaliber = useAppStore((s) => s.activeBallisticsCaliber);
  const splitShowdownWeaponA = useAppStore((s) => s.splitShowdownWeaponA);
  const splitShowdownWeaponB = useAppStore((s) => s.splitShowdownWeaponB);
  const scaleWallModalOpen = useAppStore((s) => s.scaleWallModalOpen);
  const recoilLabOpen = useAppStore((s) => s.recoilLabOpen);
  const posterShareModalOpen = useAppStore((s) => s.posterShareModalOpen);
  const textureModalOpen = useAppStore((s) => s.textureModalOpen);
  const monographModalOpen = useAppStore((s) => s.monographModalOpen);
  const isPlaying = useAppStore((s) => s.isPlaying);
  const environmentPreset = useAppStore((s) => s.environmentPreset);
  const activeLoadout = useAttachmentStore((s) => s.loadouts[activeWeaponId]);
  const activeMuzzle: MuzzleAttachmentId = activeLoadout?.muzzle ?? 'none';
  const activeOptic: OpticAttachmentId = activeLoadout?.optic ?? 'none';

  const [syncedExplodeProgress, setSyncedExplodeProgress] = useState<number>(
    () => Math.round(playbackClock.getState().targetProgress * 100) / 100
  );

  const initializedRef = useRef(false);
  const applyingPopStateRef = useRef(false);
  const prevScreenRef = useRef<AppScreen>(screen);

  // Track discrete Workbench explode progress updates (skip 60Hz churn during continuous playback)
  useEffect(() => {
    return playbackClock.subscribeExplodeProgress((nextT) => {
      if (useAppStore.getState().isPlaying) return;
      const quantized = Math.round(nextT * 100) / 100;
      setSyncedExplodeProgress((prev) =>
        prev === quantized ? prev : quantized
      );
    });
  }, []);

  // Hydrate initial store state from URL & listen to browser back/forward
  useEffect(() => {
    if (typeof window === 'undefined') return;

    applyingPopStateRef.current = true;
    applyLocationToStore();
    applyingPopStateRef.current = false;
    initializedRef.current = true;
    prevScreenRef.current = useAppStore.getState().screen;

    const onPopState = () => {
      applyingPopStateRef.current = true;
      applyLocationToStore();
      prevScreenRef.current = useAppStore.getState().screen;
      applyingPopStateRef.current = false;
    };

    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  // Sync document <html lang> and page <title> with active language & route (WCAG 3.1.1 & 2.4.2)
  useEffect(() => {
    if (typeof document === 'undefined') return;
    document.documentElement.lang = lang === 'en' ? 'en' : 'zh-CN';
    document.title = formatMuseumDocumentTitle(screen, activeWeaponId, lang, {
      mode,
      sectionCut,
      cartridgeCaliber: activeCartridgeCaliber,
      ballisticsCaliber: activeBallisticsCaliber,
      splitWeaponA: splitShowdownWeaponA,
      splitWeaponB: splitShowdownWeaponB,
    });
  }, [
    activeWeaponId,
    screen,
    mode,
    sectionCut,
    lang,
    activeCartridgeCaliber,
    activeBallisticsCaliber,
    splitShowdownWeaponA,
    splitShowdownWeaponB,
  ]);

  // Push/replace URL query parameters when store navigation or 3D cutaway deep-link state changes
  useEffect(() => {
    if (
      typeof window === 'undefined' ||
      !initializedRef.current ||
      applyingPopStateRef.current
    ) {
      return;
    }

    // Under React StrictMode, initial URL hydration in the mount effect above may have
    // already updated the store ahead of this render's closure values; bail out so we
    // never clobber `window.location.search` with stale initial defaults.
    const live = useAppStore.getState();
    // Never overwrite `?monograph=1&...` URL state while MonographPrintModal or its
    // offscreen capture rig temporarily switches screen/mode/sectionCut.
    if (live.monographModalOpen) {
      return;
    }
    const liveLoadout = useAttachmentStore.getState().loadouts[activeWeaponId];
    if (
      live.activeWeaponId !== activeWeaponId ||
      live.screen !== screen ||
      live.mode !== mode ||
      live.sectionCut !== sectionCut ||
      live.sectionCutAxis !== sectionCutAxis ||
      live.sectionCutOffset !== sectionCutOffset ||
      live.xrayShells !== xrayShells ||
      live.engineeringTint !== engineeringTint ||
      live.selectedPartId !== selectedPartId ||
      (liveLoadout?.muzzle ?? 'none') !== activeMuzzle ||
      (liveLoadout?.optic ?? 'none') !== activeOptic ||
      live.lang !== lang ||
      live.activeCartridgeCaliber !== activeCartridgeCaliber ||
      live.cartridgeLineupOverview !== cartridgeLineupOverview ||
      live.activeBallisticsCaliber !== activeBallisticsCaliber ||
      live.splitShowdownWeaponA !== splitShowdownWeaponA ||
      live.splitShowdownWeaponB !== splitShowdownWeaponB ||
      live.scaleWallModalOpen !== scaleWallModalOpen ||
      live.recoilLabOpen !== recoilLabOpen ||
      live.posterShareModalOpen !== posterShareModalOpen ||
      live.textureModalOpen !== textureModalOpen ||
      live.monographModalOpen !== monographModalOpen ||
      live.environmentPreset !== environmentPreset
    ) {
      return;
    }

    const liveExplodeProgress =
      mode === 'explode'
        ? Math.round(playbackClock.getState().targetProgress * 100) / 100
        : 0;

    const nextSearch = buildSearchString(
      activeWeaponId,
      screen,
      mode,
      sectionCut,
      lang,
      activeCartridgeCaliber,
      cartridgeLineupOverview,
      activeBallisticsCaliber,
      undefined,
      { weaponA: splitShowdownWeaponA, weaponB: splitShowdownWeaponB },
      {
        sectionCutAxis,
        sectionCutOffset,
        xrayShells,
        engineeringTint,
        muzzle: activeMuzzle,
        optic: activeOptic,
        selectedPartId,
        explodeProgress: liveExplodeProgress,
      },
      scaleWallModalOpen,
      recoilLabOpen,
      environmentPreset,
      posterShareModalOpen,
      textureModalOpen,
      monographModalOpen
    );
    if (window.location.search === nextSearch) {
      prevScreenRef.current = screen;
      return;
    }

    const nextUrl = `${window.location.pathname}${nextSearch}${window.location.hash}`;
    if (prevScreenRef.current !== screen) {
      window.history.pushState(null, '', nextUrl);
    } else {
      window.history.replaceState(null, '', nextUrl);
    }
    prevScreenRef.current = screen;
  }, [
    activeWeaponId,
    screen,
    mode,
    sectionCut,
    sectionCutAxis,
    sectionCutOffset,
    xrayShells,
    engineeringTint,
    selectedPartId,
    activeMuzzle,
    activeOptic,
    lang,
    activeCartridgeCaliber,
    cartridgeLineupOverview,
    activeBallisticsCaliber,
    splitShowdownWeaponA,
    splitShowdownWeaponB,
    scaleWallModalOpen,
    recoilLabOpen,
    posterShareModalOpen,
    textureModalOpen,
    monographModalOpen,
    isPlaying,
    syncedExplodeProgress,
    environmentPreset,
  ]);
}

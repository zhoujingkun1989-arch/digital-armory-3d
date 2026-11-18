import { useEffect, useRef } from 'react';
import {
  CARTRIDGE_LAB_SPECS,
  isCaliberProfile,
} from '../engine/cartridges/cartridgeSpecs';
import {
  EXTERNAL_PROJECTILE_SPECS,
  type ExternalProjectileId,
  normalizeExternalProjectileId,
} from '../engine/physics/externalBallistics';
import type { LanguageCode } from '../narration/types';
import {
  type AppScreen,
  type AppViewMode,
  detectBrowserDefaultLanguage,
  useAppStore,
} from '../store/useAppStore';
import { getShortWeaponLabel } from '../weapons/manifests';
import {
  type CaliberProfile,
  isWeaponId,
  type WeaponId,
} from '../weapons/types';

export function getDefaultEntryScreen(): 'showcase' | 'armory' {
  if (
    typeof window !== 'undefined' &&
    window.__DIGITAL_ARMORY_ENTRY__ === 'armory'
  ) {
    return 'armory';
  }
  return 'showcase';
}

function applyLocationToStore(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const rawWeapon = params.get('weapon');
  const rawScreen = params.get('screen');
  const rawMode = params.get('mode');
  const rawLang = params.get('lang');
  const rawCaliber = params.get('caliber');
  const rawCut = params.get('cut');

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
          : rawScreen === 'showcase'
            ? 'showcase'
            : rawScreen === 'armory'
              ? 'armory'
              : defaultScreen;
  const targetMode: AppViewMode = rawMode === 'firing' ? 'firing' : 'explode';

  if (targetScreen === 'workbench') {
    current.enterWorkbench(weaponId, targetMode);
    if (rawCut === '1' || rawCut === 'true') {
      useAppStore.getState().setSectionCut(true);
    }
  } else if (targetScreen === 'cartridges') {
    if (rawWeapon && isWeaponId(rawWeapon)) {
      current.selectArmoryWeapon(rawWeapon);
    }
    current.openCartridgeLab(
      isCaliberProfile(rawCaliber) ? rawCaliber : undefined
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
}

function buildSearchString(
  weaponId: WeaponId,
  screen: AppScreen,
  mode: AppViewMode,
  sectionCut: boolean,
  lang: LanguageCode,
  activeCartridgeCaliber: CaliberProfile,
  cartridgeLineupOverview: boolean,
  activeBallisticsCaliber: ExternalProjectileId
): string {
  const params = new URLSearchParams(window.location.search);
  const defaultScreen = getDefaultEntryScreen();
  params.set('weapon', weaponId);
  if (screen === 'workbench') {
    params.set('screen', 'workbench');
    params.set('mode', mode);
    params.delete('caliber');
    if (sectionCut) {
      params.set('cut', '1');
    } else {
      params.delete('cut');
    }
  } else if (screen === 'cartridges') {
    params.set('screen', 'cartridges');
    params.delete('mode');
    params.delete('cut');
    if (cartridgeLineupOverview) {
      params.delete('caliber');
    } else {
      params.set('caliber', activeCartridgeCaliber);
    }
  } else if (screen === 'ballistics') {
    params.set('screen', 'ballistics');
    params.delete('mode');
    params.delete('cut');
    params.set(
      'caliber',
      normalizeExternalProjectileId(activeBallisticsCaliber)
    );
  } else {
    params.delete('mode');
    params.delete('caliber');
    params.delete('cut');
    if (screen === defaultScreen) {
      params.delete('screen');
    } else {
      params.set('screen', screen);
    }
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
  const lang = useAppStore((s) => s.lang);
  const activeCartridgeCaliber = useAppStore((s) => s.activeCartridgeCaliber);
  const cartridgeLineupOverview = useAppStore(
    (s) => s.cartridgeLineupOverview
  );
  const activeBallisticsCaliber = useAppStore((s) => s.activeBallisticsCaliber);

  const initializedRef = useRef(false);
  const applyingPopStateRef = useRef(false);
  const prevScreenRef = useRef<AppScreen>(screen);

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
    const shortTag = getShortWeaponLabel(activeWeaponId);
    if (screen === 'showcase') {
      document.title =
        lang === 'en'
          ? 'Digital Armory 3D — Open-Source 1:1 Firearm Mechanical Museum & AI Documentary'
          : 'Digital Armory 3D — 开源 1:1 枪械内部结构 3D 数字博物馆与双语声画纪录片';
    } else if (screen === 'cartridges') {
      const calCode = CARTRIDGE_LAB_SPECS[activeCartridgeCaliber].code;
      document.title =
        lang === 'en'
          ? `${calCode} · 1:1 SAAMI Cartridge Cutaway Lab — Digital Armory 3D`
          : `${calCode} · 1:1 实弹纵剖对比实验室 — Digital Armory 3D`;
    } else if (screen === 'ballistics') {
      const projSpec =
        EXTERNAL_PROJECTILE_SPECS[
          normalizeExternalProjectileId(activeBallisticsCaliber)
        ];
      const calLabel = projSpec.code;
      document.title =
        lang === 'en'
          ? `${calLabel} · 1,000m External Ballistics & Reticle Lab — Digital Armory 3D`
          : `${calLabel} · 1,000m 外弹道与分划板实验室 — Digital Armory 3D`;
    } else if (screen === 'workbench') {
      document.title =
        lang === 'en'
          ? `${shortTag} · ${mode === 'firing' ? 'Live Ballistics' : '3D Disassembly'} — Digital Armory 3D`
          : `${shortTag} · ${mode === 'firing' ? '实弹内弹道演示' : '3D 结构拆解台'} — Digital Armory 3D`;
    } else {
      document.title =
        lang === 'en'
          ? `${shortTag} · 3D Digital Armory Vault`
          : `${shortTag} · 枪械内部结构 3D 数字枪库`;
    }
  }, [
    activeWeaponId,
    screen,
    mode,
    lang,
    activeCartridgeCaliber,
    activeBallisticsCaliber,
  ]);

  // Push/replace URL query parameters when store navigation changes
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
    if (
      live.activeWeaponId !== activeWeaponId ||
      live.screen !== screen ||
      live.mode !== mode ||
      live.sectionCut !== sectionCut ||
      live.lang !== lang ||
      live.activeCartridgeCaliber !== activeCartridgeCaliber ||
      live.cartridgeLineupOverview !== cartridgeLineupOverview ||
      live.activeBallisticsCaliber !== activeBallisticsCaliber
    ) {
      return;
    }

    const nextSearch = buildSearchString(
      activeWeaponId,
      screen,
      mode,
      sectionCut,
      lang,
      activeCartridgeCaliber,
      cartridgeLineupOverview,
      activeBallisticsCaliber
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
    lang,
    activeCartridgeCaliber,
    cartridgeLineupOverview,
    activeBallisticsCaliber,
  ]);
}

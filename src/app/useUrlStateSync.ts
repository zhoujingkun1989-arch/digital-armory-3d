import { useEffect, useRef } from 'react';
import {
  type AppScreen,
  type AppViewMode,
  useAppStore,
} from '../store/useAppStore';
import { isWeaponId, type WeaponId } from '../weapons/types';

function getDefaultEntryScreen(): 'showcase' | 'armory' {
  if (
    typeof window !== 'undefined' &&
    window.__DIGITAL_ARMORY_ENTRY__ === 'showcase'
  ) {
    return 'showcase';
  }
  return 'armory';
}

function applyLocationToStore(): void {
  if (typeof window === 'undefined') return;
  const params = new URLSearchParams(window.location.search);
  const rawWeapon = params.get('weapon');
  const rawScreen = params.get('screen');
  const rawMode = params.get('mode');

  const current = useAppStore.getState();
  const weaponId: WeaponId = isWeaponId(rawWeapon)
    ? rawWeapon
    : current.activeWeaponId;
  const defaultScreen = getDefaultEntryScreen();
  const targetScreen: AppScreen =
    rawScreen === 'workbench'
      ? 'workbench'
      : rawScreen === 'showcase'
        ? 'showcase'
        : rawScreen === 'armory'
          ? 'armory'
          : defaultScreen;
  const targetMode: AppViewMode = rawMode === 'firing' ? 'firing' : 'explode';

  if (targetScreen === 'workbench') {
    current.enterWorkbench(weaponId, targetMode);
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
  mode: AppViewMode
): string {
  const params = new URLSearchParams(window.location.search);
  const defaultScreen = getDefaultEntryScreen();
  params.set('weapon', weaponId);
  if (screen === 'workbench') {
    params.set('screen', 'workbench');
    params.set('mode', mode);
  } else {
    params.delete('mode');
    if (screen === defaultScreen) {
      params.delete('screen');
    } else {
      params.set('screen', screen);
    }
  }
  const qs = params.toString();
  return qs ? `?${qs}` : '';
}

/**
 * Bi-directional synchronization between URL query parameters
 * (`?weapon=m4a1&screen=workbench&mode=firing`) and `useAppStore`.
 */
export function useUrlStateSync(): void {
  const activeWeaponId = useAppStore((s) => s.activeWeaponId);
  const screen = useAppStore((s) => s.screen);
  const mode = useAppStore((s) => s.mode);

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
      live.mode !== mode
    ) {
      return;
    }

    const nextSearch = buildSearchString(activeWeaponId, screen, mode);
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
  }, [activeWeaponId, screen, mode]);
}

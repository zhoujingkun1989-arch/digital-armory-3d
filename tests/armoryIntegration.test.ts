import { beforeEach, describe, expect, it } from 'vitest';
import { getAcousticEnvironment } from '../src/engine/audio/mechanicalSoundEngine';
import {
  getSupportedSelectorModes,
  interactiveActionStore,
} from '../src/engine/interaction/InteractiveActionController';
import {
  getArmoryThermalVisualState,
  setArmoryThermalVisualState,
} from '../src/engine/materials/armoryShader';
import {
  applyArmoryShot,
  getArmoryPhysicsState,
} from '../src/engine/physics/armoryPhysics';
import { TELEMETRY_HUD_STRINGS } from '../src/features/workbench/BallisticsTelemetryHud';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import {
  resolveAcousticEnvironmentForState,
  useAppStore,
} from '../src/store/useAppStore';

function collectStructuralMismatches(
  zhNode: unknown,
  enNode: unknown,
  path: string,
  issues: string[]
): void {
  if (typeof zhNode !== typeof enNode) {
    issues.push(
      `${path}: typeof mismatch (${typeof zhNode} vs ${typeof enNode})`
    );
    return;
  }

  if (typeof zhNode === 'string' && typeof enNode === 'string') {
    if (zhNode.trim().length === 0) {
      issues.push(`${path} [zh]: empty string`);
    }
    if (enNode.trim().length === 0) {
      issues.push(`${path} [en]: empty string`);
    }
    return;
  }

  if (typeof zhNode === 'function' && typeof enNode === 'function') {
    const zhFn = zhNode as (...args: unknown[]) => unknown;
    const enFn = enNode as (...args: unknown[]) => unknown;
    if (zhFn.length !== enFn.length) {
      issues.push(
        `${path}: function arity mismatch (${zhFn.length} vs ${enFn.length})`
      );
    }
    return;
  }

  if (Array.isArray(zhNode) && Array.isArray(enNode)) {
    if (zhNode.length !== enNode.length) {
      issues.push(
        `${path}: array length mismatch (${zhNode.length} vs ${enNode.length})`
      );
      return;
    }
    for (let i = 0; i < zhNode.length; i++) {
      collectStructuralMismatches(zhNode[i], enNode[i], `${path}[${i}]`, issues);
    }
    return;
  }

  if (
    zhNode !== null &&
    enNode !== null &&
    typeof zhNode === 'object' &&
    typeof enNode === 'object'
  ) {
    const zhObj = zhNode as Record<string, unknown>;
    const enObj = enNode as Record<string, unknown>;
    const zhKeys = Object.keys(zhObj).sort();
    const enKeys = Object.keys(enObj).sort();
    if (zhKeys.join('|') !== enKeys.join('|')) {
      issues.push(
        `${path}: key set mismatch (zh=[${zhKeys.join(',')}] vs en=[${enKeys.join(',')}])`
      );
      return;
    }
    for (const k of zhKeys) {
      collectStructuralMismatches(zhObj[k], enObj[k], `${path}.${k}`, issues);
    }
  }
}

describe('Wave-2 Master Armory Integration & Bilingual UI Parity', () => {
  beforeEach(() => {
    useAppStore.setState({
      screen: 'armory',
      activeWeaponId: 'ak15',
      mode: 'explode',
      environmentPreset: 'tactical_vault',
      postFxEnabled: true,
      telemetryHudOpen: true,
    });
    useAppStore.getState().resetAll();
  });

  it('initializes studio environment, GTAO PostFX & telemetry HUD defaults and cycles cleanly', () => {
    const s0 = useAppStore.getState();
    expect(s0.environmentPreset).toBe('tactical_vault');
    expect(s0.postFxEnabled).toBe(true);
    expect(s0.telemetryHudOpen).toBe(true);

    s0.cycleEnvironmentPreset();
    expect(useAppStore.getState().environmentPreset).toBe('gunsmith_bench');

    useAppStore.getState().cycleEnvironmentPreset();
    expect(useAppStore.getState().environmentPreset).toBe('blueprint_daylight');

    useAppStore.getState().cycleEnvironmentPreset();
    expect(useAppStore.getState().environmentPreset).toBe('tactical_vault');

    useAppStore.getState().togglePostFx();
    expect(useAppStore.getState().postFxEnabled).toBe(false);
    useAppStore.getState().togglePostFx();
    expect(useAppStore.getState().postFxEnabled).toBe(true);

    useAppStore.getState().toggleTelemetryHud();
    expect(useAppStore.getState().telemetryHudOpen).toBe(false);
    useAppStore.getState().toggleTelemetryHud();
    expect(useAppStore.getState().telemetryHudOpen).toBe(true);
  });

  it('synchronizes stereo convolution IR acoustic room with environmentPreset and workbench mode', () => {
    expect(resolveAcousticEnvironmentForState('tactical_vault', 'explode')).toBe(
      'tactical_hall'
    );
    expect(resolveAcousticEnvironmentForState('tactical_vault', 'firing')).toBe(
      'indoor_range'
    );
    expect(resolveAcousticEnvironmentForState('gunsmith_bench', 'firing')).toBe(
      'bench_close'
    );
    expect(
      resolveAcousticEnvironmentForState('blueprint_daylight', 'explode')
    ).toBe('bench_close');

    // Live store subscription sync check
    expect(getAcousticEnvironment()).toBe('tactical_hall');

    useAppStore.getState().setMode('firing');
    expect(getAcousticEnvironment()).toBe('indoor_range');

    useAppStore.getState().setEnvironmentPreset('gunsmith_bench');
    expect(getAcousticEnvironment()).toBe('bench_close');

    useAppStore.getState().setEnvironmentPreset('blueprint_daylight');
    expect(getAcousticEnvironment()).toBe('bench_close');

    useAppStore.getState().setEnvironmentPreset('tactical_vault');
    expect(getAcousticEnvironment()).toBe('indoor_range');

    useAppStore.getState().setMode('explode');
    expect(getAcousticEnvironment()).toBe('tactical_hall');
  });

  it('resets internal ballistics physics, barrel thermal shader state & interactive FCG on resetAll and weapon switches', () => {
    useAppStore.getState().enterWorkbench('m4a1', 'firing');
    expect(useAppStore.getState().activeWeaponId).toBe('m4a1');
    expect(interactiveActionStore.getState().weaponId).toBe('m4a1');

    // Simulate multi-round firing heat, carbon fouling, press-check & SAFE selector
    applyArmoryShot('556_nato');
    applyArmoryShot('556_nato');
    setArmoryThermalVisualState({
      weaponId: 'm4a1',
      barrelHeat01: 0.72,
      carbonFouling01: 0.55,
    });
    interactiveActionStore.setPressCheck(true);
    interactiveActionStore.setSelectorMode('safe');

    expect(getArmoryPhysicsState().shotCount).toBe(2);
    expect(getArmoryPhysicsState().barrelHeat01).toBeGreaterThan(0);
    expect(getArmoryThermalVisualState().barrelHeat01).toBeCloseTo(0.72, 3);
    expect(interactiveActionStore.getState().isPressCheck).toBe(true);
    expect(interactiveActionStore.getState().selectorMode).toBe('safe');

    // 1. resetAll() clears physics, thermal uniforms, and resets FCG to default 'semi'
    useAppStore.getState().resetAll();
    expect(getArmoryPhysicsState().shotCount).toBe(0);
    expect(getArmoryPhysicsState().barrelHeat01).toBe(0);
    expect(getArmoryPhysicsState().carbonFouling01).toBe(0);
    expect(getArmoryThermalVisualState().barrelHeat01).toBe(0);
    expect(getArmoryThermalVisualState().carbonFouling01).toBe(0);
    expect(interactiveActionStore.getState().isPressCheck).toBe(false);
    expect(interactiveActionStore.getState().selectorMode).toBe('semi');

    // 2. Switching weapon via selectArmoryWeapon('g17') resets heat/physics and clamps unsupported 'safe' mode
    applyArmoryShot('556_nato');
    setArmoryThermalVisualState({
      weaponId: 'm4a1',
      barrelHeat01: 0.48,
      carbonFouling01: 0.31,
    });
    interactiveActionStore.setSelectorMode('auto');

    useAppStore.getState().selectArmoryWeapon('g17');
    expect(useAppStore.getState().activeWeaponId).toBe('g17');
    expect(getArmoryPhysicsState().shotCount).toBe(0);
    expect(getArmoryThermalVisualState().weaponId).toBe('g17');
    expect(getArmoryThermalVisualState().barrelHeat01).toBe(0);
    expect(interactiveActionStore.getState().weaponId).toBe('g17');
    expect(getSupportedSelectorModes('g17')).toEqual(['safe', 'semi']);
    expect(interactiveActionStore.getState().selectorMode).toBe('semi');

    // 3. Entering workbench on P90 syncs P90 FCG (`safe / semi / auto`) and clears physics
    applyArmoryShot('9mm_para');
    useAppStore.getState().enterWorkbench('p90', 'firing');
    expect(getArmoryPhysicsState().shotCount).toBe(0);
    expect(interactiveActionStore.getState().weaponId).toBe('p90');
    expect(getSupportedSelectorModes('p90')).toEqual(['safe', 'semi', 'auto']);
  });

  it('enforces 100% zh/en structural key parity across UI_STRINGS, SHOWCASE_STRINGS & TELEMETRY_HUD_STRINGS', () => {
    const issues: string[] = [];
    collectStructuralMismatches(
      UI_STRINGS.zh,
      UI_STRINGS.en,
      'UI_STRINGS',
      issues
    );
    collectStructuralMismatches(
      SHOWCASE_STRINGS.zh,
      SHOWCASE_STRINGS.en,
      'SHOWCASE_STRINGS',
      issues
    );
    collectStructuralMismatches(
      TELEMETRY_HUD_STRINGS.zh,
      TELEMETRY_HUD_STRINGS.en,
      'TELEMETRY_HUD_STRINGS',
      issues
    );
    expect(issues).toEqual([]);

    // Dynamic formatter functions produce non-empty localized text in both languages
    for (const lang of ['zh', 'en'] as const) {
      expect(
        UI_STRINGS[lang].geoBuildBanner('AK-15', 12, 28).length
      ).toBeGreaterThan(4);
      expect(UI_STRINGS[lang].studio.postFxTitle(true).length).toBeGreaterThan(
        4
      );
      expect(UI_STRINGS[lang].studio.postFxTitle(false).length).toBeGreaterThan(
        4
      );
      expect(UI_STRINGS[lang].timeline.hudTitle(true).length).toBeGreaterThan(
        4
      );
      expect(UI_STRINGS[lang].timeline.hudTitle(false).length).toBeGreaterThan(
        4
      );
    }
  });
});

import fs from 'node:fs';
import path from 'node:path';
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
import {
  isBrowserFullscreenActive,
  isBrowserFullscreenSupported,
  toggleBrowserFullscreen,
} from '../src/app/useFullscreen';
import {
  applyLocationToStore,
  buildSearchString,
  getDefaultEntryScreen,
} from '../src/app/useUrlStateSync';
import {
  ARCHERY_ROLE_META,
  ENGINEERING_ROLE_ORDER,
  getEngineeringRoleMeta,
} from '../src/engine/materials/engineeringRoles';
import {
  ATLAS_EN_STRINGS,
  getLocalizedAtlasHeading,
  getLocalizedAtlasSuite,
} from '../src/i18n/atlasStrings';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import {
  getLocalizedCatalogSpecs,
  resolveWeaponDisplayMeta,
} from '../src/i18n/weaponFallbacks';
import type { WeaponNarrationBundle } from '../src/narration/types';
import {
  resolveAcousticEnvironmentForState,
  useAppStore,
} from '../src/store/useAppStore';
import { getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS } from '../src/weapons/types';

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
    expect(getDefaultEntryScreen()).toBe('showcase');
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

    // 4. Switching to archery (`lift33` / `r500`) clamps FCG to `safe / semi` & preserves zero thermal/fouling
    useAppStore.getState().enterWorkbench('lift33', 'firing');
    expect(interactiveActionStore.getState().weaponId).toBe('lift33');
    expect(getSupportedSelectorModes('lift33')).toEqual(['safe', 'semi']);
    expect(interactiveActionStore.getState().selectorMode).toBe('semi');
    applyArmoryShot('arrow_400gr');
    expect(getArmoryPhysicsState().barrelHeat01).toBe(0);
    expect(getArmoryPhysicsState().carbonFouling01).toBe(0);

    useAppStore.getState().selectArmoryWeapon('r500');
    expect(interactiveActionStore.getState().weaponId).toBe('r500');
    expect(getSupportedSelectorModes('r500')).toEqual(['safe', 'semi']);
    applyArmoryShot('bolt_400gr');
    expect(getArmoryPhysicsState().barrelHeat01).toBe(0);
    expect(getArmoryPhysicsState().carbonFouling01).toBe(0);
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
      expect(
        UI_STRINGS[lang].studio.fullscreenTitle(true).length
      ).toBeGreaterThan(4);
      expect(
        UI_STRINGS[lang].studio.fullscreenTitle(false).length
      ).toBeGreaterThan(4);
    }
  });

  it('toggles clean showcase HUD visibility (hudHidden) and browser fullscreen API cleanly', async () => {
    expect(useAppStore.getState().hudHidden).toBe(false);

    useAppStore.getState().setTextureModalOpen(true);
    expect(useAppStore.getState().textureModalOpen).toBe(true);

    // Entering clean HUD-hidden presentation automatically dismisses texture modal
    useAppStore.getState().setHudHidden(true);
    expect(useAppStore.getState().hudHidden).toBe(true);
    expect(useAppStore.getState().textureModalOpen).toBe(false);

    // Opening story drawer or texture modal automatically restores HUD visibility
    useAppStore.getState().setStoryOpen(true);
    expect(useAppStore.getState().hudHidden).toBe(false);

    useAppStore.getState().toggleHudHidden();
    expect(useAppStore.getState().hudHidden).toBe(true);

    useAppStore.getState().resetAll();
    expect(useAppStore.getState().hudHidden).toBe(false);

    // Browser Fullscreen API helper (standard + Safari webkit + rejection resilience)
    expect(isBrowserFullscreenSupported(null)).toBe(false);
    expect(isBrowserFullscreenActive(null)).toBe(false);
    expect(await toggleBrowserFullscreen(null)).toBe(false);

    let fsEl: object | null = null;
    const mockRoot = {
      requestFullscreen: async () => {
        fsEl = mockRoot;
      },
    };
    const mockDoc = {
      fullscreenEnabled: true,
      get fullscreenElement() {
        return fsEl;
      },
      documentElement: mockRoot,
      exitFullscreen: async () => {
        fsEl = null;
      },
    } as unknown as Document;

    expect(isBrowserFullscreenSupported(mockDoc)).toBe(true);
    expect(isBrowserFullscreenActive(mockDoc)).toBe(false);
    expect(await toggleBrowserFullscreen(mockDoc)).toBe(true);
    expect(isBrowserFullscreenActive(mockDoc)).toBe(true);
    expect(await toggleBrowserFullscreen(mockDoc)).toBe(false);
    expect(isBrowserFullscreenActive(mockDoc)).toBe(false);

    // Restricted iframe rejection returns false without throwing
    const blockedDoc = {
      fullscreenEnabled: true,
      fullscreenElement: null,
      documentElement: {
        requestFullscreen: async () => {
          throw new Error('Permissions check failed');
        },
      },
    } as unknown as Document;
    expect(await toggleBrowserFullscreen(blockedDoc)).toBe(false);
  });

  it('prevents Armory & Workbench HUD panels from overlapping wrapped header buttons', () => {
    const stylesDir = path.resolve(__dirname, '../src/styles');
    const armoryCss = fs.readFileSync(
      path.join(stylesDir, 'armory.css'),
      'utf8'
    );
    const workbenchCss = fs.readFileSync(
      path.join(stylesDir, 'workbench.css'),
      'utf8'
    );
    const storyCss = fs.readFileSync(path.join(stylesDir, 'story.css'), 'utf8');
    const responsiveCss = fs.readFileSync(
      path.join(stylesDir, 'responsive.css'),
      'utf8'
    );

    // Armory overlay uses 3-row CSS Grid (`header` / `plaque controls` / `rack`) so plaque never covers header buttons
    expect(armoryCss).toContain('grid-template-areas:');
    expect(armoryCss).toContain('grid-area: header');
    expect(armoryCss).toContain('grid-area: plaque');
    expect(armoryCss).toContain('grid-area: controls');
    expect(armoryCss).toContain('grid-area: rack');
    expect(armoryCss).not.toMatch(/top:\s*7[0-9]px/);

    // Workbench & Story overlays dynamically track `--hud-top-offset` instead of fixed `top: 72px / 108px`
    expect(workbenchCss).toContain('var(--hud-top-offset');
    expect(workbenchCss).not.toMatch(/top:\s*7[0-9]px/);
    expect(storyCss).toContain('var(--hud-top-offset');
    expect(storyCss).not.toMatch(/top:\s*7[0-9]px/);
    expect(responsiveCss).not.toMatch(/\btop:\s*108px/);

    // Canonical light-theme `.schematic-watermark` lives solely in `workbench.css` (not duplicated in `armory.css`)
    expect(workbenchCss).toContain(
      ":is([data-theme='light'], .theme-light) .schematic-watermark"
    );
    expect(armoryCss).not.toContain('.schematic-watermark');
  });

  it('resolves getLocalizedCatalogSpecs & resolveWeaponDisplayMeta in English with zero CJK characters across all 19 WEAPON_IDS', () => {
    const cjkRe = /[\u4e00-\u9fff]/;
    const narrationsDir = path.resolve(__dirname, '../public/narrations');

    expect(WEAPON_IDS.length).toBe(19);

    for (const id of WEAPON_IDS) {
      const specs = getLocalizedCatalogSpecs(id, 'en');
      for (const [key, val] of Object.entries(specs)) {
        expect(val.trim().length, `${id} specs.${key} empty`).toBeGreaterThan(0);
        expect(val, `${id} specs.${key} CJK leak`).not.toMatch(cjkRe);
      }

      const bundle = JSON.parse(
        fs.readFileSync(path.join(narrationsDir, `${id}.json`), 'utf8')
      ) as WeaponNarrationBundle;

      for (const [label, meta] of [
        ['null-bundle', resolveWeaponDisplayMeta(id, 'en', null)],
        ['narration-bundle', resolveWeaponDisplayMeta(id, 'en', bundle)],
      ] as const) {
        expect(meta.caliber).toBe(specs.caliber);
        expect(meta.compactCaliber).toBe(specs.compactCaliber);
        expect(meta.weightKg).toBe(specs.weightKg);
        expect(meta.muzzleVelocityMs).toBe(specs.muzzleVelocityMs);
        expect(meta.effectiveRangeM).toBe(specs.effectiveRangeM);

        for (const [key, val] of Object.entries(meta)) {
          if (Array.isArray(val)) {
            expect(
              val.length,
              `${id} (${label}) meta.${key} empty array`
            ).toBeGreaterThan(0);
            for (const item of val) {
              expect(
                item.trim().length,
                `${id} (${label}) meta.${key} item empty`
              ).toBeGreaterThan(0);
              expect(
                item,
                `${id} (${label}) meta.${key} item CJK leak`
              ).not.toMatch(cjkRe);
            }
          } else {
            expect(
              val.trim().length,
              `${id} (${label}) meta.${key} empty`
            ).toBeGreaterThan(0);
            expect(val, `${id} (${label}) meta.${key} CJK leak`).not.toMatch(
              cjkRe
            );
          }
        }
      }
    }
  });

  it('covers 100% of WEAPON_IDS headings and pbrSuites in atlasStrings.ts with zero CJK leaks in English', async () => {
    const cjkRe = /[\u4e00-\u9fff]/;

    expect(Object.keys(ATLAS_EN_STRINGS).sort()).toEqual([...WEAPON_IDS].sort());
    expect(WEAPON_IDS.length).toBe(19);

    let totalSuites = 0;
    for (const weaponId of WEAPON_IDS) {
      const manifest = getWeaponManifest(weaponId);
      const plugin = await loadWeaponPlugin(weaponId);

      const enHeading = getLocalizedAtlasHeading(
        weaponId,
        'en',
        manifest.atlasHeadingCn
      );
      const zhHeading = getLocalizedAtlasHeading(
        weaponId,
        'zh',
        manifest.atlasHeadingCn
      );

      expect(enHeading.trim().length).toBeGreaterThan(8);
      expect(enHeading).not.toBe(manifest.atlasHeadingCn);
      expect(enHeading).not.toMatch(cjkRe);
      expect(zhHeading).toBe(manifest.atlasHeadingCn);

      expect(Object.keys(ATLAS_EN_STRINGS[weaponId].suites).sort()).toEqual(
        plugin.pbrSuites.map((s) => s.id).sort()
      );

      plugin.pbrSuites.forEach((suite, idx) => {
        totalSuites += 1;
        const enSuite = getLocalizedAtlasSuite(weaponId, suite, 'en', idx);
        const zhSuite = getLocalizedAtlasSuite(weaponId, suite, 'zh', idx);

        expect(enSuite.id).toBe(suite.id);
        expect(enSuite.weapon).toBe(weaponId);
        expect(enSuite.title.trim().length).toBeGreaterThan(4);
        expect(enSuite.tabTitle.trim().length).toBeGreaterThan(2);
        expect(enSuite.partTag.trim().length).toBeGreaterThan(1);
        expect(enSuite.resolution.trim().length).toBeGreaterThan(2);
        expect(enSuite.summary.trim().length).toBeGreaterThan(12);
        expect(enSuite.highlights.length).toBe(suite.highlights.length);
        expect(enSuite.channels.length).toBe(suite.channels.length);

        expect(enSuite.title).not.toMatch(cjkRe);
        expect(enSuite.tabTitle).not.toMatch(cjkRe);
        expect(enSuite.partTag).not.toMatch(cjkRe);
        expect(enSuite.resolution).not.toMatch(cjkRe);
        expect(enSuite.summary).not.toMatch(cjkRe);

        for (const h of enSuite.highlights) {
          expect(h.trim().length).toBeGreaterThan(4);
          expect(h).not.toMatch(cjkRe);
        }

        for (const ch of enSuite.channels) {
          expect(ch.label.trim().length).toBeGreaterThan(2);
          expect(ch.note.trim().length).toBeGreaterThan(4);
          expect(ch.fileName.trim().length).toBeGreaterThan(4);
          expect(ch.label).not.toMatch(cjkRe);
          expect(ch.note).not.toMatch(cjkRe);
        }

        expect(zhSuite.title.trim().length).toBeGreaterThan(2);
        expect(zhSuite.tabTitle.trim().length).toBeGreaterThan(1);
        expect(zhSuite.summary.trim().length).toBeGreaterThan(8);
        expect(zhSuite.channels.length).toBe(suite.channels.length);
      });
    }

    expect(totalSuites).toBeGreaterThanOrEqual(46);
  });

  it('keeps atlasModal and all archery UI dictionaries complete and free of firearm jargon', () => {
    const cjkRe = /[\u4e00-\u9fff]/;
    const zhFirearmJargonRe =
      /枪管|膛线|枪口|空枪|枪械|全枪|火药燃气|弹膛|枪机|套筒|抛壳|推弹|弹匣|闭锁|底火|射速/;
    const enFirearmJargonRe =
      /\b(firearm|rifling|muzzle|chamber|breech|eject|ejecting|propellant|spent brass|brass casing|brass case|cartridge|magazine|striker|slide|bolt\s*carrier|rate of fire|pull trigger|SAAMI|CIP)\b/i;

    const collectStrings = (node: unknown, out: string[] = []): string[] => {
      if (typeof node === 'string') {
        out.push(node);
      } else if (typeof node === 'function') {
        const fn = node as (arg: unknown) => string;
        out.push(fn('LIFT 33'));
      } else if (Array.isArray(node)) {
        for (const item of node) collectStrings(item, out);
      } else if (node !== null && typeof node === 'object') {
        for (const val of Object.values(node as Record<string, unknown>)) {
          collectStrings(val, out);
        }
      }
      return out;
    };

    // 1. atlasModal completeness & zero CJK in English
    for (const lang of ['zh', 'en'] as const) {
      const modal = UI_STRINGS[lang].atlasModal;
      const strings = [
        ...collectStrings(modal),
        modal.downloadTitle('ak15_receiver_albedo.webp'),
        modal.loadingFallback('LIFT 33'),
      ];
      for (const s of strings) {
        expect(s.trim().length).toBeGreaterThan(0);
        if (lang === 'en') {
          expect(s).not.toMatch(cjkRe);
        }
      }
      expect(modal.subtitle).toContain('127');
      expect(modal.subtitle).toContain('480');
      expect(modal.kicker).toContain('19');
    }

    // 2. Archery UI sub-dictionaries: completeness, zero CJK in EN, zero leftover firearm jargon
    const archerySlices = {
      'armory.archeryPlaque': [
        UI_STRINGS.zh.armory.archeryPlaque,
        UI_STRINGS.en.armory.archeryPlaque,
      ],
      'timeline.archery': [
        UI_STRINGS.zh.timeline.archery,
        UI_STRINGS.en.timeline.archery,
      ],
      'caliper.archery': [
        UI_STRINGS.zh.caliper.archery,
        UI_STRINGS.en.caliper.archery,
      ],
      'engineeringTint.archery': [
        UI_STRINGS.zh.engineeringTint.archery,
        UI_STRINGS.en.engineeringTint.archery,
      ],
      'inspector.archery': [
        UI_STRINGS.zh.inspector.archery,
        UI_STRINGS.en.inspector.archery,
      ],
    } as const;

    for (const [sliceName, [zhSlice, enSlice]] of Object.entries(
      archerySlices
    )) {
      const zhStrings = collectStrings(zhSlice);
      const enStrings = collectStrings(enSlice);
      if (sliceName === 'timeline.archery') {
        zhStrings.push(UI_STRINGS.zh.timeline.archery.hudTitle(false));
        enStrings.push(UI_STRINGS.en.timeline.archery.hudTitle(false));
      }

      for (const s of zhStrings) {
        expect(s.trim().length, `${sliceName} zh empty`).toBeGreaterThan(0);
        expect(s, `${sliceName} zh jargon leak`).not.toMatch(
          zhFirearmJargonRe
        );
      }

      for (const s of enStrings) {
        expect(s.trim().length, `${sliceName} en empty`).toBeGreaterThan(0);
        expect(s, `${sliceName} en CJK leak`).not.toMatch(cjkRe);
        expect(s, `${sliceName} en jargon leak`).not.toMatch(
          enFirearmJargonRe
        );
      }
    }

    // 3. ARCHERY_ROLE_META & getEngineeringRoleMeta consistency for archery exhibits
    for (const role of ENGINEERING_ROLE_ORDER) {
      const meta = ARCHERY_ROLE_META[role];
      expect(getEngineeringRoleMeta(role, 'lift33')).toBe(meta);
      expect(getEngineeringRoleMeta(role, 'r500')).toBe(meta);
      expect(`${meta.labelZh} ${meta.shortZh} ${meta.descZh}`).not.toMatch(
        zhFirearmJargonRe
      );
      expect(`${meta.labelEn} ${meta.shortEn} ${meta.descEn}`).not.toMatch(
        cjkRe
      );
      expect(`${meta.labelEn} ${meta.shortEn} ${meta.descEn}`).not.toMatch(
        enFirearmJargonRe
      );
    }
  });

  it('synchronizes SHOWCASE_STRINGS metrics (19 / 480 / 1112 / 127) with WEAPON_IDS, plugins, audio & public/textures', async () => {
    const texturesDir = path.resolve(__dirname, '../public/textures');
    const audioDir = path.resolve(__dirname, '../public/audio');

    const textureFiles = fs
      .readdirSync(texturesDir)
      .filter((f) => f.endsWith('.webp'));
    expect(textureFiles.length).toBe(127);

    const countMp3Files = (dir: string): number => {
      let count = 0;
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) count += countMp3Files(full);
        else if (entry.isFile() && entry.name.endsWith('.mp3')) count += 1;
      }
      return count;
    };
    expect(countMp3Files(audioDir)).toBe(1112);

    let totalParts = 0;
    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      totalParts += plugin.parts.length;
    }
    expect(WEAPON_IDS.length).toBe(19);
    expect(totalParts).toBe(480);

    for (const lang of ['zh', 'en'] as const) {
      const showcase = SHOWCASE_STRINGS[lang];
      const metricValues = showcase.metrics.map((m) => m.val).join(' | ');
      expect(metricValues).toContain('19');
      expect(metricValues).toContain('480');
      expect(metricValues).toContain('127');
      expect(metricValues).toContain('1112');

      expect(showcase.hero.eyebrow).toContain('19');
      expect(showcase.hero.eyebrow).toContain('1112');
      expect(showcase.hero.subPartsStrong).toContain('480');
      expect(showcase.hero.subMapsStrong).toContain('127');
      expect(showcase.hero.subAudioStrong).toContain('1112');

      const caliberText = showcase.documentary.caliberRows
        .map((r) => `${r.caliber} ${r.weaponTag} ${r.signature}`)
        .join(' ');
      expect(caliberText).toContain('LIFT 33');
      expect(caliberText).toContain('Ravin R500');
      expect(caliberText).toContain('M1 Garand');
      expect(caliberText).toContain('Benelli M4');
      expect(caliberText).toContain('Python');
      expect(caliberText).toContain('M249 SAW');
      expect(caliberText).toContain('P08');
      expect(caliberText).toContain('KRISS Vector');
    }
  });

  it('hydrates and serializes ?screen=ballistics, ?screen=cartridges, and ?cut=1 URL deep-link states cleanly', () => {
    // 1. ?screen=workbench&weapon=vector&cut=1&lang=en -> activates longitudinal section-cut directly
    applyLocationToStore('?screen=workbench&weapon=vector&cut=1&lang=en');
    expect(useAppStore.getState().screen).toBe('workbench');
    expect(useAppStore.getState().activeWeaponId).toBe('vector');
    expect(useAppStore.getState().sectionCut).toBe(true);
    expect(useAppStore.getState().lang).toBe('en');

    const cutUrl = buildSearchString(
      'vector',
      'workbench',
      'explode',
      true,
      'en',
      '45_acp',
      false,
      '45_acp',
      ''
    );
    expect(cutUrl).toContain('screen=workbench');
    expect(cutUrl).toContain('weapon=vector');
    expect(cutUrl).toContain('cut=1');

    const uncutUrl = buildSearchString(
      'vector',
      'workbench',
      'explode',
      false,
      'en',
      '45_acp',
      false,
      '45_acp',
      '?cut=1'
    );
    expect(uncutUrl).not.toContain('cut=');

    // 2. ?screen=ballistics&weapon=m249&caliber=45_acp&lang=en -> opens 1,000m External Ballistics Lab on requested caliber
    applyLocationToStore(
      '?screen=ballistics&weapon=m249&caliber=45_acp&lang=en'
    );
    expect(useAppStore.getState().screen).toBe('ballistics');
    expect(useAppStore.getState().activeWeaponId).toBe('m249');
    expect(useAppStore.getState().activeBallisticsCaliber).toBe('45_acp');

    const ballisticsUrl = buildSearchString(
      'm249',
      'ballistics',
      'explode',
      false,
      'en',
      '556_nato',
      false,
      '45_acp',
      '?cut=1&mode=firing'
    );
    expect(ballisticsUrl).toContain('screen=ballistics');
    expect(ballisticsUrl).toContain('caliber=45_acp');
    expect(ballisticsUrl).not.toContain('cut=');
    expect(ballisticsUrl).not.toContain('mode=');

    // 3. ?screen=cartridges&weapon=vector&caliber=45_acp -> opens 11-Caliber Cutaway Lab on .45 ACP
    applyLocationToStore('?screen=cartridges&weapon=vector&caliber=45_acp');
    expect(useAppStore.getState().screen).toBe('cartridges');
    expect(useAppStore.getState().activeCartridgeCaliber).toBe('45_acp');
  });
});

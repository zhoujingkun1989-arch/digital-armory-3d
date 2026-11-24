import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ARMORY_AUTO_ROTATE_SPEED,
  computeEffectiveOrbitAutoRotate,
  WORKBENCH_AUTO_ORBIT_SPEED,
} from '../src/engine/canvas/ArmoryViewport';
import {
  isGpuTelemetryEnabled,
  resetGpuTelemetryBus,
} from '../src/engine/canvas/gpuTelemetryBus';
import { OFFLINE_MUSEUM_STRINGS } from '../src/features/offline/OfflineMuseumModal';
import { PASSPORT_STRINGS } from '../src/features/passport/passportStrings';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import { WorkbenchHeader } from '../src/features/workbench/WorkbenchHeader';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';

const CJK_REGEX = /[\u4e00-\u9fff]/;
const WP_LEAK_REGEX = /\bWP-\d+[a-z]?\b/i;

function assertNoPatternDeep(
  value: unknown,
  pattern: RegExp,
  label: string,
  reason: string
): void {
  if (typeof value === 'string') {
    expect(value, `${reason} in ${label}: "${value}"`).not.toMatch(pattern);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, idx) =>
      assertNoPatternDeep(v, pattern, `${label}[${idx}]`, reason)
    );
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoPatternDeep(v, pattern, `${label}.${k}`, reason);
    }
  }
}

afterEach(() => {
  resetGpuTelemetryBus();
  useAppStore.getState().setGpuTelemetryOpen(false);
  useAppStore.getState().setWorkbenchAutoOrbit(false);
  useAppStore.setState({
    lang: 'zh',
    screen: 'armory',
    activeWeaponId: 'ak15',
    fieldStripActive: false,
    caliperActive: false,
    malfunctionActive: false,
    hudHidden: false,
  });
});

describe('Cycle 3G — GPU Telemetry Wiring, Workbench Auto-Orbit & Zero WP-XX Museum Polish', () => {
  it('syncs gpuTelemetryOpen store state with gpuTelemetryBus and lazy-mounts GpuTelemetryOverlay in App.tsx', () => {
    const store = useAppStore.getState();
    expect(store.gpuTelemetryOpen).toBe(false);
    expect(isGpuTelemetryEnabled()).toBe(false);

    store.toggleGpuTelemetry();
    expect(useAppStore.getState().gpuTelemetryOpen).toBe(true);
    expect(isGpuTelemetryEnabled()).toBe(true);

    useAppStore.getState().setGpuTelemetryOpen(false);
    expect(useAppStore.getState().gpuTelemetryOpen).toBe(false);
    expect(isGpuTelemetryEnabled()).toBe(false);

    useAppStore.getState().setGpuTelemetryOpen(true);
    expect(useAppStore.getState().gpuTelemetryOpen).toBe(true);
    expect(isGpuTelemetryEnabled()).toBe(true);

    // Static guard: App.tsx must lazy-load and conditionally mount GpuTelemetryOverlay
    const appSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/App.tsx'),
      'utf8'
    );
    expect(appSrc).toContain(
      "import('./features/workbench/GpuTelemetryOverlay')"
    );
    expect(appSrc).toContain('{gpuTelemetryOpen && (');
  });

  it('controls smooth cinematic workbenchAutoOrbit with 0.65 speed, tool auto-pause, and resetAll cleanup', () => {
    expect(WORKBENCH_AUTO_ORBIT_SPEED).toBe(0.65);
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(false);

    useAppStore.getState().toggleWorkbenchAutoOrbit();
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(true);

    // Pure orbit resolver
    expect(
      computeEffectiveOrbitAutoRotate({
        screen: 'workbench',
        armoryAutoRotate: true,
        workbenchAutoOrbit: true,
        showcaseDragging: false,
        fieldStripActive: false,
        caliperActive: false,
      })
    ).toEqual({ autoRotate: true, autoRotateSpeed: 0.65 });

    expect(
      computeEffectiveOrbitAutoRotate({
        screen: 'workbench',
        armoryAutoRotate: true,
        workbenchAutoOrbit: true,
        showcaseDragging: false,
        fieldStripActive: true,
        caliperActive: false,
      }).autoRotate
    ).toBe(false);

    expect(
      computeEffectiveOrbitAutoRotate({
        screen: 'workbench',
        armoryAutoRotate: true,
        workbenchAutoOrbit: true,
        showcaseDragging: false,
        fieldStripActive: false,
        caliperActive: true,
      }).autoRotate
    ).toBe(false);

    expect(
      computeEffectiveOrbitAutoRotate({
        screen: 'armory',
        armoryAutoRotate: true,
        workbenchAutoOrbit: false,
        showcaseDragging: false,
        fieldStripActive: false,
        caliperActive: false,
      })
    ).toEqual({ autoRotate: true, autoRotateSpeed: ARMORY_AUTO_ROTATE_SPEED });

    // Enabling Field-Strip auto-pauses workbenchAutoOrbit
    useAppStore.getState().setFieldStripActive(true);
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(false);

    // Enabling Caliper auto-pauses workbenchAutoOrbit
    useAppStore.getState().setWorkbenchAutoOrbit(true);
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(true);
    useAppStore.getState().setCaliperActive(true);
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(false);

    // resetAll cleanly resets workbenchAutoOrbit
    useAppStore.getState().setWorkbenchAutoOrbit(true);
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().workbenchAutoOrbit).toBe(false);
  });

  it('exposes GPU Telemetry, Auto-Orbit, and [?] Shortcuts controls across Cmd+K, WorkbenchHeader & ImmersiveFloatingBar', () => {
    for (const [lang, query] of [
      ['en', 'GPU Telemetry'],
      ['zh', 'GPU 性能遥测'],
    ] as const) {
      const items = buildCommandPaletteItems({
        state: { ...useAppStore.getState(), lang },
        activeWeaponParts: [],
      });
      const res = filterCommandPaletteItems(items, query, lang);
      const gpuCmd = res.flatItems.find(
        (item) => item.id === 'action:gpu-telemetry'
      );
      expect(gpuCmd).toBeDefined();
      if (lang === 'en') {
        expect(gpuCmd?.title).not.toMatch(CJK_REGEX);
        expect(gpuCmd?.subtitle).not.toMatch(CJK_REGEX);
      }

      const before = useAppStore.getState().gpuTelemetryOpen;
      gpuCmd?.execute();
      expect(useAppStore.getState().gpuTelemetryOpen).toBe(!before);
      expect(isGpuTelemetryEnabled()).toBe(!before);

      const orbitRes = filterCommandPaletteItems(
        items,
        lang === 'en' ? 'Orbit' : '环绕',
        lang
      );
      expect(
        orbitRes.flatItems.some((item) => item.id === 'action:workbench-orbit')
      ).toBe(true);
    }

    // WorkbenchHeader renders Orbit toggle & compact [?] Shortcuts button
    const headerHtml = renderToStaticMarkup(
      React.createElement(WorkbenchHeader)
    );
    expect(headerHtml).toContain('wb-orbit-btn');
    expect(headerHtml).toContain('wb-shortcuts-btn');
    expect(headerHtml).toContain('<kbd class="wb-shortcuts-kbd">?</kbd>');

    // ImmersiveFloatingBar includes compact [?] Shortcuts trigger
    const immersiveSrc = fs.readFileSync(
      path.resolve(process.cwd(), 'src/features/workbench/ImmersiveFloatingBar.tsx'),
      'utf8'
    );
    expect(immersiveSrc).toContain('immersive-shortcuts-btn');
    expect(immersiveSrc).toContain('openKeyboardShortcutsModal');
  });

  it('guarantees zero internal WP-XX sprint badges across audited museum UI dictionaries & source files (and zero CJK in EN)', () => {
    // 1. Runtime string dictionaries (ZH & EN)
    assertNoPatternDeep(
      UI_STRINGS.zh,
      WP_LEAK_REGEX,
      'UI_STRINGS.zh',
      'Public WP-XX sprint badge leak'
    );
    assertNoPatternDeep(
      UI_STRINGS.en,
      WP_LEAK_REGEX,
      'UI_STRINGS.en',
      'Public WP-XX sprint badge leak'
    );
    assertNoPatternDeep(
      OFFLINE_MUSEUM_STRINGS.zh,
      WP_LEAK_REGEX,
      'OFFLINE_MUSEUM_STRINGS.zh',
      'Public WP-XX sprint badge leak'
    );
    assertNoPatternDeep(
      OFFLINE_MUSEUM_STRINGS.en,
      WP_LEAK_REGEX,
      'OFFLINE_MUSEUM_STRINGS.en',
      'Public WP-XX sprint badge leak'
    );
    assertNoPatternDeep(
      PASSPORT_STRINGS.zh,
      WP_LEAK_REGEX,
      'PASSPORT_STRINGS.zh',
      'Public WP-XX sprint badge leak'
    );
    assertNoPatternDeep(
      PASSPORT_STRINGS.en,
      WP_LEAK_REGEX,
      'PASSPORT_STRINGS.en',
      'Public WP-XX sprint badge leak'
    );

    // 2. Source-level guard across all audited public modals, HUDs & i18n strings
    const auditedFiles = [
      'src/features/offline/OfflineMuseumModal.tsx',
      'src/features/passport/passportStrings.ts',
      'src/features/passport/ArmorerPassportModal.tsx',
      'src/features/armory/MechanismShowdownModal.tsx',
      'src/features/workbench/FieldStripHud.tsx',
      'src/features/workbench/MalfunctionHud.tsx',
      'src/features/workbench/CaliperHud.tsx',
      'src/features/story/WeaponStoryDrawer.tsx',
      'src/features/atlas/TextureAtlasModal.tsx',
      'src/features/workbench/commandPaletteEngine.ts',
      'src/i18n/uiStrings.ts',
    ];
    for (const relPath of auditedFiles) {
      const content = fs.readFileSync(
        path.resolve(process.cwd(), relPath),
        'utf8'
      );
      expect(
        content,
        `Residual WP-XX reference found in ${relPath}`
      ).not.toMatch(WP_LEAK_REGEX);
    }

    // 3. Zero CJK leaks in English dictionaries & new formatter functions
    assertNoPatternDeep(
      UI_STRINGS.en.workbench,
      CJK_REGEX,
      'UI_STRINGS.en.workbench',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.engineeringTint,
      CJK_REGEX,
      'UI_STRINGS.en.engineeringTint',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.fieldStrip,
      CJK_REGEX,
      'UI_STRINGS.en.fieldStrip',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.malfunction,
      CJK_REGEX,
      'UI_STRINGS.en.malfunction',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.caliper,
      CJK_REGEX,
      'UI_STRINGS.en.caliper',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.cartridgeLab,
      CJK_REGEX,
      'UI_STRINGS.en.cartridgeLab',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      UI_STRINGS.en.mechanismShowdown,
      CJK_REGEX,
      'UI_STRINGS.en.mechanismShowdown',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      OFFLINE_MUSEUM_STRINGS.en,
      CJK_REGEX,
      'OFFLINE_MUSEUM_STRINGS.en',
      'CJK leak in EN'
    );
    assertNoPatternDeep(
      PASSPORT_STRINGS.en,
      CJK_REGEX,
      'PASSPORT_STRINGS.en',
      'CJK leak in EN'
    );
    expect(UI_STRINGS.en.workbench.orbitTitle(true)).not.toMatch(CJK_REGEX);
    expect(UI_STRINGS.en.workbench.orbitTitle(false)).not.toMatch(CJK_REGEX);
  });

  it('enforces compact non-blocking mobile layout rules for FieldStripHud, MalfunctionHud, and CaliperHud', () => {
    const responsiveCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/responsive.css'),
      'utf8'
    );
    expect(responsiveCss).toMatch(
      /\.field-strip-steps-grid,\s*\.malf-scenario-tabs,\s*\.malfunction-steps-list\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s
    );
    expect(responsiveCss).toMatch(
      /\.ballistics-telemetry-slot > \.caliper-hud,\s*\.caliper-hud\s*\{[^}]*max-height:\s*min\(34vh,\s*210px\);/s
    );
  });
});

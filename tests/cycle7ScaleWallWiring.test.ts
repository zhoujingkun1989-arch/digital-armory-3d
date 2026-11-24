import fs from 'node:fs';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
} from '../src/app/useUrlStateSync';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

afterEach(() => {
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 7B — Global Lazy Wiring for Smithsonian 1:1 True-Scale Museum Wall', () => {
  it('manages scaleWallModalOpen state, mutual modal exclusivity, and resetAll cleanly', () => {
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);

    useAppStore.getState().openTimelineModal();
    expect(useAppStore.getState().timelineModalOpen).toBe(true);

    useAppStore.getState().openScaleWallModal();
    expect(useAppStore.getState().scaleWallModalOpen).toBe(true);
    expect(useAppStore.getState().timelineModalOpen).toBe(false);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);

    // Opening another modal cleanly closes ScaleWall
    useAppStore.getState().openPassportModal();
    expect(useAppStore.getState().passportModalOpen).toBe(true);
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);

    // resetAll clears scaleWallModalOpen
    useAppStore.getState().openScaleWallModal();
    expect(useAppStore.getState().scaleWallModalOpen).toBe(true);
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);
  });

  it('round-trips ?panel=scalewall deep-link hydration and URL serialization cleanly', () => {
    applyLocationToStore('?screen=armory&weapon=gau8&panel=scalewall&lang=en');
    expect(useAppStore.getState().scaleWallModalOpen).toBe(true);
    expect(useAppStore.getState().activeWeaponId).toBe('gau8');
    expect(useAppStore.getState().lang).toBe('en');

    const openQs = buildSearchString(
      'gau8',
      'armory',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '30x173_gau8',
      '',
      undefined,
      undefined,
      true
    );
    expect(new URLSearchParams(openQs).get('panel')).toBe('scalewall');

    const closedQs = buildSearchString(
      'gau8',
      'armory',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '30x173_gau8',
      openQs,
      undefined,
      undefined,
      false
    );
    expect(new URLSearchParams(closedQs).has('panel')).toBe(false);

    // Navigating back to a URL without panel=scalewall closes the modal
    applyLocationToStore('?screen=armory&weapon=gau8');
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);
  });

  it('surfaces 1:1 True-Scale Museum Wall in Cmd+K bilingual search and executes openScaleWallModal()', () => {
    useAppStore.getState().setLang('en');
    const itemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    for (const q of ['scale', '1:1', 'smithsonian']) {
      const res = filterCommandPaletteItems(itemsEn, q, 'en');
      expect(
        res.flatItems.some((item) => item.id === 'lab:scale-wall'),
        `Query "${q}" should match lab:scale-wall`
      ).toBe(true);
    }

    useAppStore.getState().setLang('zh');
    const itemsZh = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });
    for (const q of ['尺度', '对比墙', '1:1']) {
      const res = filterCommandPaletteItems(itemsZh, q, 'zh');
      expect(
        res.flatItems.some((item) => item.id === 'lab:scale-wall'),
        `ZH query "${q}" should match lab:scale-wall`
      ).toBe(true);
    }

    const scaleItem = itemsEn.find((i) => i.id === 'lab:scale-wall');
    expect(scaleItem).toBeDefined();
    scaleItem!.execute();
    expect(useAppStore.getState().scaleWallModalOpen).toBe(true);
  });

  it('preserves strict lazy chunk isolation for ScaleWallModal and zero EN CJK / WP-XX leaks', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain(
      "lazy(\n  () => import('./features/scalewall/ScaleWallModal')\n)"
    );
    expect(appSrc).not.toMatch(/import\s+\{[^}]*ScaleWallModal[^}]*\}\s+from/);
    expect(appSrc).toContain('{scaleWallModalOpen && (');

    // No eager static runtime imports of ScaleWallModal or scaleWallSpecs in shell modules
    for (const rel of [
      'src/store/useAppStore.ts',
      'src/app/useUrlStateSync.ts',
      'src/features/workbench/WorkbenchHeader.tsx',
      'src/features/workbench/commandPaletteEngine.ts',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must not statically import scalewall`).not.toMatch(
        /from\s+['"][^'"]*scalewall/
      );
    }

    const headerSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/WorkbenchHeader.tsx'),
      'utf8'
    );
    expect(headerSrc).toContain('wb-scale-wall-btn');
    expect(headerSrc).toContain('openScaleWallModal');

    for (const s of [
      UI_STRINGS.en.workbench.scaleWallChip,
      UI_STRINGS.en.workbench.scaleWallChipTitle,
      UI_STRINGS.en.workbench.scaleWallCmdTitle,
      UI_STRINGS.en.workbench.scaleWallCmdSub,
    ]) {
      expect(CJK_RE.test(s), `CJK leak in EN string: "${s}"`).toBe(false);
      expect(WP_LEAK_RE.test(s), `WP-XX leak in EN string: "${s}"`).toBe(false);
    }
    for (const s of [
      UI_STRINGS.zh.workbench.scaleWallChip,
      UI_STRINGS.zh.workbench.scaleWallChipTitle,
      UI_STRINGS.zh.workbench.scaleWallCmdTitle,
      UI_STRINGS.zh.workbench.scaleWallCmdSub,
    ]) {
      expect(WP_LEAK_RE.test(s), `WP-XX leak in ZH string: "${s}"`).toBe(false);
    }
  });
});

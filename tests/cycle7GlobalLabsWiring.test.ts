import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
} from '../src/app/useUrlStateSync';
import { ArmoryView } from '../src/features/armory/ArmoryView';
import { ShowcaseView } from '../src/features/showcase/ShowcaseView';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
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

describe('Cycle 7E — Global Lazy Wiring for Recoil Impulse Lab & Armory/Showcase Parity', () => {
  it('manages recoilLabOpen state, mutual modal exclusivity, and screen/reset transitions cleanly', () => {
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    // Opening Recoil Lab closes sibling modals (Scale Wall, Timeline, etc.)
    useAppStore.getState().openScaleWallModal();
    expect(useAppStore.getState().scaleWallModalOpen).toBe(true);

    useAppStore.getState().openRecoilLab();
    expect(useAppStore.getState().recoilLabOpen).toBe(true);
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);
    expect(useAppStore.getState().commandPaletteOpen).toBe(false);

    // Toggle closes and re-opens cleanly
    useAppStore.getState().toggleRecoilLab();
    expect(useAppStore.getState().recoilLabOpen).toBe(false);
    useAppStore.getState().toggleRecoilLab();
    expect(useAppStore.getState().recoilLabOpen).toBe(true);

    // Opening sibling modals cleanly dismisses Recoil Lab
    useAppStore.getState().openPassportModal();
    expect(useAppStore.getState().passportModalOpen).toBe(true);
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    useAppStore.getState().openRecoilLab();
    useAppStore.getState().openTimelineModal();
    expect(useAppStore.getState().timelineModalOpen).toBe(true);
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    useAppStore.getState().openRecoilLab();
    useAppStore.getState().openArmorPenetrationModal();
    expect(useAppStore.getState().armorPenetrationModalOpen).toBe(true);
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    // Screen transitions & resetAll always reset recoilLabOpen cleanly
    useAppStore.getState().openRecoilLab();
    useAppStore.getState().returnToArmory();
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    useAppStore.getState().openRecoilLab();
    useAppStore.getState().enterWorkbench('ak15', 'explode');
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    useAppStore.getState().openRecoilLab();
    useAppStore.getState().openShowcase();
    expect(useAppStore.getState().recoilLabOpen).toBe(false);

    useAppStore.getState().openRecoilLab();
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().recoilLabOpen).toBe(false);
  });

  it('round-trips ?panel=recoil deep-link hydration and URL serialization without clobbering other panels', () => {
    applyLocationToStore('?screen=workbench&weapon=m82a1&panel=recoil&lang=en');
    expect(useAppStore.getState().recoilLabOpen).toBe(true);
    expect(useAppStore.getState().scaleWallModalOpen).toBe(false);
    expect(useAppStore.getState().activeWeaponId).toBe('m82a1');
    expect(useAppStore.getState().lang).toBe('en');

    const openQs = buildSearchString(
      'm82a1',
      'workbench',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '50_bmg',
      '',
      undefined,
      undefined,
      false,
      true
    );
    expect(new URLSearchParams(openQs).get('panel')).toBe('recoil');

    const closedQs = buildSearchString(
      'm82a1',
      'workbench',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '50_bmg',
      openQs,
      undefined,
      undefined,
      false,
      false
    );
    expect(new URLSearchParams(closedQs).has('panel')).toBe(false);

    // Preserves unrelated ?panel=timeline when recoilLabOpen is false
    const timelinePreservedQs = buildSearchString(
      'm82a1',
      'armory',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '50_bmg',
      '?screen=armory&panel=timeline',
      undefined,
      undefined,
      false,
      false
    );
    expect(new URLSearchParams(timelinePreservedQs).get('panel')).toBe(
      'timeline'
    );

    // Navigating back to a URL without panel closes Recoil Lab
    applyLocationToStore('?screen=workbench&weapon=m82a1');
    expect(useAppStore.getState().recoilLabOpen).toBe(false);
  });

  it('surfaces Recoil Impulse Lab in Cmd+K bilingual search and executes openRecoilLab()', () => {
    useAppStore.getState().setLang('en');
    const itemsEn = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    for (const q of [
      'recoil',
      'impulse',
      'gas jet',
      'muzzle climb',
      'torque',
    ]) {
      const res = filterCommandPaletteItems(itemsEn, q, 'en');
      expect(
        res.flatItems.some((item) => item.id === 'lab:recoil-lab'),
        `EN query "${q}" should match lab:recoil-lab`
      ).toBe(true);
    }

    useAppStore.getState().setLang('zh');
    const itemsZh = buildCommandPaletteItems({
      state: useAppStore.getState(),
      activeWeaponParts: [],
    });

    for (const q of ['后坐力', '冲量', '枪口上跳', '制退器']) {
      const res = filterCommandPaletteItems(itemsZh, q, 'zh');
      expect(
        res.flatItems.some((item) => item.id === 'lab:recoil-lab'),
        `ZH query "${q}" should match lab:recoil-lab`
      ).toBe(true);
    }

    const recoilItem = itemsEn.find((i) => i.id === 'lab:recoil-lab');
    expect(recoilItem).toBeDefined();
    recoilItem!.execute();
    expect(useAppStore.getState().recoilLabOpen).toBe(true);
  });

  it('wires Scale Wall & Recoil Lab into Armory Labs popover without top-bar bloat and into Showcase 10-card Bento Deck', () => {
    // 1. Armory header remains <= 7 top-level triggers while Labs popover contains both entries
    const armoryHtml = renderToStaticMarkup(React.createElement(ArmoryView));
    const controlsMatch = armoryHtml.match(
      /<div class="armory-header-controls">([\s\S]*?)<\/header>/
    );
    expect(controlsMatch).not.toBeNull();
    const topLevelTriggerCount = (
      controlsMatch![1].match(/<button\b/g) ?? []
    ).length;
    expect(topLevelTriggerCount).toBeLessThanOrEqual(7);

    const armorySrc = fs.readFileSync(
      path.join(ROOT, 'src/features/armory/ArmoryView.tsx'),
      'utf8'
    );
    expect(armorySrc).toContain('data-testid="armory-scale-wall-btn"');
    expect(armorySrc).toContain('openScaleWallModal()');
    expect(armorySrc).toContain('data-testid="armory-recoil-lab-btn"');
    expect(armorySrc).toContain('openRecoilLab()');

    // 2. Workbench Tools/Labs popover contains both entries (zero top-bar bloat)
    const wbHeaderSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/WorkbenchHeader.tsx'),
      'utf8'
    );
    expect(wbHeaderSrc).toContain('data-testid="wb-scale-wall-btn"');
    expect(wbHeaderSrc).toContain('data-testid="wb-recoil-lab-btn"');
    expect(wbHeaderSrc).toContain('openRecoilLab');

    // 3. Showcase #physics-labs Bento Deck renders all 10 balanced lab cards
    const showcaseHtml = renderToStaticMarkup(
      React.createElement(ShowcaseView)
    );
    const physicsSectionMatch = showcaseHtml.match(
      /<section[^>]*id="physics-labs"[\s\S]*?<\/section>/
    );
    expect(physicsSectionMatch).not.toBeNull();
    const labCardsCount = (
      physicsSectionMatch![0].match(/class="lab-bento-card\b/g) ?? []
    ).length;
    expect(labCardsCount).toBe(10);
    expect(physicsSectionMatch![0]).toContain(
      'data-testid="showcase-lab-scalewall"'
    );
    expect(physicsSectionMatch![0]).toContain(
      'data-testid="showcase-lab-recoil"'
    );
    expect(physicsSectionMatch![0]).toContain('labs-bento-grid-duo');
  });

  it('enforces strict lazy chunk isolation for RecoilLabModal & ScaleWallModal and 0 EN CJK / WP-XX leaks', () => {
    const appSrc = fs.readFileSync(path.join(ROOT, 'src/App.tsx'), 'utf8');
    expect(appSrc).toContain(
      "lazy(\n  () => import('./features/recoillab/RecoilLabModal')\n)"
    );
    expect(appSrc).toContain(
      "lazy(\n  () => import('./features/scalewall/ScaleWallModal')\n)"
    );
    expect(appSrc).not.toMatch(/import\s+\{[^}]*RecoilLabModal[^}]*\}\s+from/);
    expect(appSrc).toContain('{recoilLabOpen && (');
    expect(appSrc).toContain('{scaleWallModalOpen && (');

    // Zero eager static imports of recoillab or scalewall across shell & view files
    for (const rel of [
      'src/store/useAppStore.ts',
      'src/app/useUrlStateSync.ts',
      'src/features/workbench/WorkbenchHeader.tsx',
      'src/features/workbench/commandPaletteEngine.ts',
      'src/features/armory/ArmoryView.tsx',
      'src/features/showcase/ShowcaseView.tsx',
    ]) {
      const src = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      expect(src, `${rel} must not statically import recoillab`).not.toMatch(
        /from\s+['"][^'"]*recoillab/
      );
      expect(src, `${rel} must not statically import scalewall`).not.toMatch(
        /from\s+['"][^'"]*scalewall/
      );
    }

    // Bilingual string purity: 0 CJK in EN, 0 WP-XX in ZH/EN
    const enChecks = [
      UI_STRINGS.en.workbench.recoilLabChip,
      UI_STRINGS.en.workbench.recoilLabChipTitle,
      UI_STRINGS.en.workbench.recoilLabCmdTitle,
      UI_STRINGS.en.workbench.recoilLabCmdSub,
      SHOWCASE_STRINGS.en.physicsLabs.cards.scaleWall.badge,
      SHOWCASE_STRINGS.en.physicsLabs.cards.scaleWall.title,
      SHOWCASE_STRINGS.en.physicsLabs.cards.scaleWall.desc,
      SHOWCASE_STRINGS.en.physicsLabs.cards.scaleWall.cta,
      SHOWCASE_STRINGS.en.physicsLabs.cards.recoilLab.badge,
      SHOWCASE_STRINGS.en.physicsLabs.cards.recoilLab.title,
      SHOWCASE_STRINGS.en.physicsLabs.cards.recoilLab.desc,
      SHOWCASE_STRINGS.en.physicsLabs.cards.recoilLab.cta,
    ];
    for (const s of enChecks) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(CJK_RE.test(s), `CJK leak in EN string: "${s}"`).toBe(false);
      expect(WP_LEAK_RE.test(s), `WP-XX leak in EN string: "${s}"`).toBe(false);
    }

    const zhChecks = [
      UI_STRINGS.zh.workbench.recoilLabChip,
      UI_STRINGS.zh.workbench.recoilLabChipTitle,
      UI_STRINGS.zh.workbench.recoilLabCmdTitle,
      UI_STRINGS.zh.workbench.recoilLabCmdSub,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.scaleWall.badge,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.scaleWall.title,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.scaleWall.desc,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.scaleWall.cta,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.recoilLab.badge,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.recoilLab.title,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.recoilLab.desc,
      SHOWCASE_STRINGS.zh.physicsLabs.cards.recoilLab.cta,
    ];
    for (const s of zhChecks) {
      expect(s.trim().length).toBeGreaterThan(0);
      expect(WP_LEAK_RE.test(s), `WP-XX leak in ZH string: "${s}"`).toBe(false);
    }
  });
});

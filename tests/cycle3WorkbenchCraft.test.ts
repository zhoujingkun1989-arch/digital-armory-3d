import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  closeKeyboardShortcutsModal,
  isKeyboardShortcutsModalOpen,
  isShortcutsModalTriggerEvent,
  openKeyboardShortcutsModal,
  toggleKeyboardShortcutsModal,
} from '../src/app/useKeyboardShortcuts';
import { getAxisSectionCutRange } from '../src/engine/actors/StencilSectionCap';
import {
  ENGINEERING_ROLE_ORDER,
  resolvePartEngineeringRole,
} from '../src/engine/materials/engineeringRoles';
import { getSuggestedRivalWeaponId } from '../src/features/armory/mechanismShowdownSpecs';
import {
  BallisticsTelemetryHud,
  TELEMETRY_HUD_STRINGS,
} from '../src/features/workbench/BallisticsTelemetryHud';
import {
  BomTreeSidebar,
  matchesBomPartSearch,
} from '../src/features/workbench/BomTreeSidebar';
import {
  buildCommandPaletteItems,
  filterCommandPaletteItems,
} from '../src/features/workbench/commandPaletteEngine';
import {
  KEYBOARD_SHORTCUT_GROUPS,
  KeyboardShortcutsModal,
} from '../src/features/workbench/KeyboardShortcutsModal';
import {
  getLiveSectionQuickPresets,
  LiveSectionPlaneBar,
} from '../src/features/workbench/LiveSectionPlaneBar';
import { PartInspectorCard } from '../src/features/workbench/PartInspectorCard';
import { UI_STRINGS } from '../src/i18n/uiStrings';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';

const CJK_REGEX = /[\u4e00-\u9fff]/;

function assertNoCjkDeep(value: unknown, label: string): void {
  if (typeof value === 'string') {
    expect(value, `Unexpected CJK leak in ${label}: "${value}"`).not.toMatch(
      CJK_REGEX
    );
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((v, idx) => assertNoCjkDeep(v, `${label}[${idx}]`));
    return;
  }
  if (value && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      assertNoCjkDeep(v, `${label}.${k}`);
    }
  }
}

afterEach(() => {
  closeKeyboardShortcutsModal();
  useAppStore.setState({
    lang: 'zh',
    screen: 'armory',
    activeWeaponId: 'ak15',
    selectedPartId: null,
    sectionCut: false,
    sectionCutAxis: 'z',
    sectionCutOffset: 0,
    sidebarCollapsed: true,
    inspectorMinimized: false,
  });
});

describe('Cycle 3C — Workbench Craft, Discoverability & Micro-UX Polish', () => {
  it('supports instant bilingual & mechanical role BOM search across all 34 exhibits', async () => {
    const plugins = await Promise.all(
      WEAPON_MANIFESTS.map((m) => loadWeaponPlugin(m.id))
    );
    expect(plugins).toHaveLength(34);

    for (const plugin of plugins) {
      const id = plugin.id;
      expect(plugin.parts.length).toBeGreaterThan(0);

      // Every part matches its own bomCode, bilingual names, and exact resolved role
      for (const part of plugin.parts) {
        expect(matchesBomPartSearch(id, part, part.bomCode)).toBe(true);
        expect(matchesBomPartSearch(id, part, part.nameEn)).toBe(true);
        expect(matchesBomPartSearch(id, part, part.nameZh)).toBe(true);
        const role = resolvePartEngineeringRole(id, part);
        expect(matchesBomPartSearch(id, part, '', role)).toBe(true);
        const otherRole = ENGINEERING_ROLE_ORDER.find((r) => r !== role)!;
        expect(matchesBomPartSearch(id, part, '', otherRole)).toBe(false);
      }

      // Role keyword searches ("闭锁" / "breech" / "spring" / "弹簧") match every exhibit with those roles
      const lockingParts = plugin.parts.filter(
        (p) => resolvePartEngineeringRole(id, p) === 'locking'
      );
      if (lockingParts.length > 0) {
        const cnHits = plugin.parts.filter((p) =>
          matchesBomPartSearch(id, p, '闭锁')
        );
        const enHits = plugin.parts.filter((p) =>
          matchesBomPartSearch(id, p, 'breech')
        );
        expect(cnHits.length).toBeGreaterThanOrEqual(lockingParts.length);
        expect(enHits.length).toBeGreaterThanOrEqual(lockingParts.length);
      }

      const springParts = plugin.parts.filter(
        (p) => resolvePartEngineeringRole(id, p) === 'energy_spring'
      );
      if (springParts.length > 0) {
        const springEn = plugin.parts.filter((p) =>
          matchesBomPartSearch(id, p, 'spring')
        );
        const springZh = plugin.parts.filter((p) =>
          matchesBomPartSearch(id, p, '弹簧')
        );
        expect(springEn.length).toBeGreaterThanOrEqual(springParts.length);
        expect(springZh.length).toBeGreaterThanOrEqual(springParts.length);
      }
    }

    // SSR BomTreeSidebar: match counter badge, clear button, role chips & bilingual empty state
    const htmlMatched = renderToStaticMarkup(
      React.createElement(BomTreeSidebar, {
        forceExpanded: true,
        weaponIdOverride: 'ak15',
        initialQuery: 'bolt',
      })
    );
    expect(htmlMatched).toContain('data-testid="bom-match-count"');
    expect(htmlMatched).toContain('sidebar-search-clear');
    expect(htmlMatched).toContain('bom-role-filter-row');
    expect(htmlMatched).not.toContain('bom-empty-state');

    const htmlEmpty = renderToStaticMarkup(
      React.createElement(BomTreeSidebar, {
        forceExpanded: true,
        weaponIdOverride: 'ak15',
        initialQuery: 'zz_nonexistent_part_xyz',
      })
    );
    expect(htmlEmpty).toContain('bom-empty-state');
    expect(htmlEmpty).toContain('bom-empty-reset-btn');
    expect(htmlEmpty).toContain('0/');
  });

  it('enriches PartInspectorCard with color-matched engineering role pill, metallurgy tag & Split 3D compare CTA', async () => {
    await Promise.all([
      loadWeaponPlugin('m1911'),
      loadWeaponPlugin('ztz99a'),
      loadWeaponPlugin('gau8'),
    ]);

    for (const [weaponId, partId, expectedRole] of [
      ['m1911', 'm1911_barrel', 'locking'],
      ['ztz99a', 'ztz99a_main_gun', 'locking'],
      ['gau8', 'gau8_barrel_cluster', 'locking'],
    ] as const) {
      const rivalId = getSuggestedRivalWeaponId(weaponId);
      expect(rivalId).not.toBe(weaponId);

      const html = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: weaponId,
          partIdOverride: partId,
        })
      );
      expect(html).toContain('inspector-spec-pills');
      expect(html).toContain(`data-engineering-role="${expectedRole}"`);
      expect(html).toContain('inspector-material-tag');
      expect(html).toContain('data-material-kind=');
      expect(html).toContain('inspector-split-cta');
      expect(html).toContain(`data-rival-id="${rivalId}"`);

      // Verify store action invoked by CTA cleanly opens Split 3D Showdown
      useAppStore.getState().openSplitShowdown(weaponId, rivalId);
      const st = useAppStore.getState();
      expect(st.screen).toBe('split_showdown');
      expect(st.splitShowdownWeaponA).toBe(weaponId);
      expect(st.splitShowdownWeaponB).toBe(rivalId);
    }
  });

  it('computes scale-aware Live CT quick-slice presets for small arms vs 1:1 MBTs & GAU-8 and preserves slider contract', () => {
    for (const axis of ['z', 'x', 'y'] as const) {
      const smallPresets = getLiveSectionQuickPresets('rifle', axis, 'ak15');
      const smallRange = getAxisSectionCutRange(axis, 'rifle');
      expect(smallPresets).toHaveLength(4);
      expect(smallPresets[0].id).toBe('center');
      expect(smallPresets[0].offset).toBe(0);
      for (const p of smallPresets) {
        expect(p.offset).toBeGreaterThanOrEqual(smallRange.min);
        expect(p.offset).toBeLessThanOrEqual(smallRange.max);
      }

      const tankPresets = getLiveSectionQuickPresets(
        'main_battle_tank',
        axis,
        'ztz99a'
      );
      const tankRange = getAxisSectionCutRange(axis, 'main_battle_tank');
      expect(tankPresets).toHaveLength(4);
      expect(tankPresets[0].id).toBe('center');
      expect(tankPresets[0].offset).toBe(0);
      expect(tankPresets[1].labelKey).toBe('tankBreech');
      expect(tankPresets[2].labelKey).toBe('tankAutoloader');
      for (const p of tankPresets) {
        expect(p.offset).toBeGreaterThanOrEqual(tankRange.min);
        expect(p.offset).toBeLessThanOrEqual(tankRange.max);
      }

      // 1:1 MBT/GAU-8 offsets must scale significantly beyond small-arms ranges
      expect(Math.abs(tankPresets[1].offset)).toBeGreaterThan(
        Math.abs(smallPresets[1].offset) * 8
      );
    }

    const gau8Presets = getLiveSectionQuickPresets(
      'main_battle_tank',
      'z',
      'gau8'
    );
    expect(gau8Presets[1].labelKey).toBe('locking');
    expect(Math.abs(gau8Presets[1].offset)).toBeGreaterThan(25);

    const bowPresets = getLiveSectionQuickPresets(
      'compound_bow',
      'z',
      'lift33'
    );
    expect(bowPresets[1].labelKey).toBe('archeryCam');
    expect(bowPresets[2].labelKey).toBe('archeryLimb');

    // SSR LiveSectionPlaneBar for small arms & 1:1 tank
    const htmlRifle = renderToStaticMarkup(
      React.createElement(LiveSectionPlaneBar, {
        forceVisible: true,
        weaponIdOverride: 'ak15',
        offsetOverride: 0.75,
      })
    );
    expect(htmlRifle).toContain('live-section-presets-row');
    expect(htmlRifle).toContain('data-section-preset="center"');
    expect(htmlRifle).toContain('data-section-preset="locking"');
    expect(htmlRifle).toContain('data-section-preset="feed"');
    expect(htmlRifle).toContain('min="-2.5"');
    expect(htmlRifle).toContain('max="2.5"');
    expect(htmlRifle).toContain('+7.5 mm');

    const htmlTank = renderToStaticMarkup(
      React.createElement(LiveSectionPlaneBar, {
        forceVisible: true,
        weaponIdOverride: 'ztz99a',
        offsetOverride: 48,
      })
    );
    expect(htmlTank).toContain('min="-180"');
    expect(htmlTank).toContain('max="180"');
    expect(htmlTank).toContain('data-section-preset="locking"');
  });

  it('polishes mobile TimelineDock horizontal single-row layout and BallisticsTelemetryHud collapse toggle', () => {
    const responsiveCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/responsive.css'),
      'utf8'
    );
    const workbenchCss = fs.readFileSync(
      path.resolve(process.cwd(), 'src/styles/workbench.css'),
      'utf8'
    );

    // Desktop firing-action-strip preserves flat flex layout via display: contents
    expect(workbenchCss).toMatch(/\.firing-action-strip\s*\{[^}]*display:\s*contents/s);

    // Mobile <= 768px forces single-row horizontal scroll on presets & 7-phase pills (no 4-row grid bloat)
    expect(responsiveCss).toMatch(
      /\.timeline-presets,\s*\.firing-phases-grid\s*\{[^}]*display:\s*flex;[^}]*flex-wrap:\s*nowrap;[^}]*overflow-x:\s*auto;/s
    );
    expect(responsiveCss).not.toMatch(
      /\.firing-phases-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2/s
    );

    // Oscilloscope expanded vs collapsed SSR rendering
    const htmlExpanded = renderToStaticMarkup(
      React.createElement(BallisticsTelemetryHud, {
        weaponId: 'ak15',
        alwaysVisible: true,
        defaultCollapsed: false,
      })
    );
    expect(htmlExpanded).toContain('data-testid="ballistics-collapse-btn"');
    expect(htmlExpanded).toContain('aria-expanded="true"');
    expect(htmlExpanded).toContain('data-collapsed="false"');
    expect(htmlExpanded).toContain('<canvas');

    const htmlCollapsed = renderToStaticMarkup(
      React.createElement(BallisticsTelemetryHud, {
        weaponId: 'ak15',
        alwaysVisible: true,
        defaultCollapsed: true,
      })
    );
    expect(htmlCollapsed).toContain('data-testid="ballistics-collapse-btn"');
    expect(htmlCollapsed).toContain('aria-expanded="false"');
    expect(htmlCollapsed).toContain('data-collapsed="true"');
    expect(htmlCollapsed).not.toContain('<canvas');
  });

  it('wires ? hotkey, Cmd+K entry, WCAG 2.1 AA ARIA attributes, and zero CJK leaks in English for KeyboardShortcutsModal', () => {
    // 1. Hotkey matcher
    expect(isShortcutsModalTriggerEvent({ key: '?' })).toBe(true);
    expect(
      isShortcutsModalTriggerEvent({ key: '/', code: 'Slash', shiftKey: true })
    ).toBe(true);
    expect(
      isShortcutsModalTriggerEvent({ key: '/', code: 'Slash', shiftKey: false })
    ).toBe(false);
    expect(isShortcutsModalTriggerEvent({ key: '?', ctrlKey: true })).toBe(
      false
    );
    expect(isShortcutsModalTriggerEvent({ key: '?', metaKey: true })).toBe(
      false
    );
    expect(isShortcutsModalTriggerEvent({ key: '?', altKey: true })).toBe(
      false
    );

    // 2. Visibility store bus
    expect(isKeyboardShortcutsModalOpen()).toBe(false);
    openKeyboardShortcutsModal();
    expect(isKeyboardShortcutsModalOpen()).toBe(true);
    toggleKeyboardShortcutsModal();
    expect(isKeyboardShortcutsModalOpen()).toBe(false);

    // 3. Command Palette action discovery & execution
    const enItems = buildCommandPaletteItems({
      state: { ...useAppStore.getState(), lang: 'en' },
      activeWeaponParts: [],
    });
    const enFiltered = filterCommandPaletteItems(
      enItems,
      'Keyboard Shortcuts',
      'en'
    );
    const shortcutCmd = enFiltered.flatItems.find(
      (item) => item.id === 'action:keyboard-shortcuts'
    );
    expect(shortcutCmd).toBeDefined();
    expect(shortcutCmd?.shortcut).toBe('?');
    expect(shortcutCmd?.title).not.toMatch(CJK_REGEX);
    expect(shortcutCmd?.subtitle).not.toMatch(CJK_REGEX);
    shortcutCmd?.execute();
    expect(isKeyboardShortcutsModalOpen()).toBe(true);
    closeKeyboardShortcutsModal();

    const zhItems = buildCommandPaletteItems({
      state: { ...useAppStore.getState(), lang: 'zh' },
      activeWeaponParts: [],
    });
    const zhFiltered = filterCommandPaletteItems(zhItems, '快捷键', 'zh');
    expect(
      zhFiltered.flatItems.some((item) => item.id === 'action:keyboard-shortcuts')
    ).toBe(true);

    // 4. SSR WCAG 2.1 AA ARIA attributes & 4 shortcut groups (ZH + EN)
    expect(KEYBOARD_SHORTCUT_GROUPS.map((g) => g.id)).toEqual([
      'viewport',
      'cutaway',
      'firing',
      'navigation',
    ]);

    for (const lang of ['zh', 'en'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(KeyboardShortcutsModal, {
          onClose: () => {},
          langOverride: lang,
        })
      );
      expect(html).toContain('role="dialog"');
      expect(html).toContain('aria-modal="true"');
      const labelledByMatch = html.match(/aria-labelledby="([^"]+)"/);
      expect(labelledByMatch).not.toBeNull();
      const headingId = labelledByMatch![1];
      expect(html).toContain(`<h2 id="${headingId}"`);
      expect(html).toContain('data-shortcut-group="viewport"');
      expect(html).toContain('data-shortcut-group="cutaway"');
      expect(html).toContain('data-shortcut-group="firing"');
      expect(html).toContain('data-shortcut-group="navigation"');
      expect(html).toContain('<kbd class="kb-keycap">?</kbd>');

      if (lang === 'en') {
        expect(html).not.toMatch(CJK_REGEX);
      }
    }

    // 5. Strict zero CJK leak sweep across all new Cycle 3C English dictionaries & formatter outputs
    assertNoCjkDeep(UI_STRINGS.en.bom, 'UI_STRINGS.en.bom');
    assertNoCjkDeep(UI_STRINGS.en.inspector, 'UI_STRINGS.en.inspector');
    assertNoCjkDeep(
      UI_STRINGS.en.sectionPresets,
      'UI_STRINGS.en.sectionPresets'
    );
    assertNoCjkDeep(
      UI_STRINGS.en.shortcutsModal,
      'UI_STRINGS.en.shortcutsModal'
    );
    assertNoCjkDeep(TELEMETRY_HUD_STRINGS.en, 'TELEMETRY_HUD_STRINGS.en');
    expect(UI_STRINGS.en.bom.matchCount(4, 25)).not.toMatch(CJK_REGEX);
    expect(UI_STRINGS.en.inspector.compareSplit3dBtn('M4A1')).not.toMatch(
      CJK_REGEX
    );
    expect(UI_STRINGS.en.inspector.compareSplit3dTitle('M4A1')).not.toMatch(
      CJK_REGEX
    );
    for (const group of KEYBOARD_SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(item.labelEn).not.toMatch(CJK_REGEX);
      }
    }
  });
});

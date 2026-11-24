import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { playbackClock } from '../src/engine/clock/playbackClock';
import { ArmoryView } from '../src/features/armory/ArmoryView';
import {
  KEYBOARD_POWER_TOOLS,
  KEYBOARD_SHORTCUT_GROUPS,
  KeyboardShortcutsModal,
} from '../src/features/workbench/KeyboardShortcutsModal';
import {
  PartInspectorCard,
  activateBoreRiflingCutaway,
  isBarrelOrBorePart,
} from '../src/features/workbench/PartInspectorCard';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

const REAL_SINGLE_KEY_BINDINGS = new Set([
  'C',
  'X',
  'T',
  'E',
  'L',
  'H',
  'M',
  'Space',
  'G',
  'J',
  'K',
  'O',
  'Shift',
  'R',
  'F',
  'V',
  'P',
  'S',
  'B',
  'U',
  '⌘ / Ctrl',
  '?',
  'Esc',
]);

function escapeHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;');
}

afterEach(() => {
  useAppStore.getState().setLang('zh');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 9C — 3D Helical Rifling UI Metrology & Complete Bilingual Keyboard Shortcuts', () => {
  it('renders Bore & Rifling badges for barreled exhibits, hides for archery, highlights barrel parts & activates Z-axis bore cutaway', async () => {
    const [m1911, g17, ztz99a, tiger1, gau8, lift33, r500] = await Promise.all([
      loadWeaponPlugin('m1911'),
      loadWeaponPlugin('g17'),
      loadWeaponPlugin('ztz99a'),
      loadWeaponPlugin('tiger1'),
      loadWeaponPlugin('gau8'),
      loadWeaponPlugin('lift33'),
      loadWeaponPlugin('r500'),
    ]);

    const cases: readonly {
      weaponId: WeaponId;
      partId: string;
      expectedKind: string;
      expectedEnToken: string;
      expectBarrelHighlight: boolean;
    }[] = [
      {
        weaponId: 'm1911',
        partId:
          m1911.parts.find((p) => isBarrelOrBorePart(p))?.id ??
          m1911.parts[0].id,
        expectedKind: 'cut_rifled',
        expectedEnToken: 'LH',
        expectBarrelHighlight: true,
      },
      {
        weaponId: 'g17',
        partId:
          g17.parts.find((p) => isBarrelOrBorePart(p))?.id ?? g17.parts[0].id,
        expectedKind: 'polygonal',
        expectedEnToken: 'Polygonal',
        expectBarrelHighlight: true,
      },
      {
        weaponId: 'ztz99a',
        partId:
          ztz99a.parts.find((p) => isBarrelOrBorePart(p))?.id ??
          ztz99a.parts[0].id,
        expectedKind: 'smoothbore',
        expectedEnToken: 'Smoothbore',
        expectBarrelHighlight: true,
      },
      {
        weaponId: 'tiger1',
        partId:
          tiger1.parts.find((p) => isBarrelOrBorePart(p))?.id ??
          tiger1.parts[0].id,
        expectedKind: 'cut_rifled',
        expectedEnToken: '32-Groove',
        expectBarrelHighlight: true,
      },
      {
        weaponId: 'gau8',
        partId:
          gau8.parts.find((p) => isBarrelOrBorePart(p))?.id ?? gau8.parts[0].id,
        expectedKind: 'cut_rifled',
        expectedEnToken: '9-Groove',
        expectBarrelHighlight: true,
      },
    ];

    for (const c of cases) {
      const spec = WEAPON_RIFLING_SPECS[c.weaponId];
      const htmlEn = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: c.weaponId,
          partIdOverride: c.partId,
          langOverride: 'en',
        })
      );
      expect(htmlEn).toContain('data-testid="inspector-rifling-badge"');
      expect(htmlEn).toContain(`data-rifling-kind="${c.expectedKind}"`);
      expect(htmlEn).toContain(
        `data-barrel-focus="${c.expectBarrelHighlight ? 'true' : 'false'}"`
      );
      expect(htmlEn).toContain(`Ø${spec.boreDiameterMm} mm`);
      expect(htmlEn).toContain(escapeHtml(spec.labelEn));
      expect(htmlEn).toContain(c.expectedEnToken);
      expect(htmlEn).toContain('data-testid="inspector-bore-cutaway-btn"');
      expect(htmlEn).toContain('Bore Cutaway');
      if (spec.chromeLined) {
        expect(htmlEn).toContain('Chrome-Lined');
      }
      expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

      const htmlZh = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: c.weaponId,
          partIdOverride: c.partId,
          langOverride: 'zh',
        })
      );
      expect(htmlZh).toContain(escapeHtml(spec.labelZh));
      expect(htmlZh).toContain('膛线纵剖');
    }

    // Compound archery cleanly omits Bore & Rifling badge
    for (const [id, plugin] of [
      ['lift33', lift33],
      ['r500', r500],
    ] as const) {
      const html = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: id,
          partIdOverride: plugin.parts[0].id,
          langOverride: 'en',
        })
      );
      expect(html).not.toContain('inspector-rifling-badge');
      expect(html).not.toContain('inspector-bore-cutaway-btn');
    }

    // Mobile firing compact card stays 100% untouched
    const compactFiringHtml = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'm1911',
        partIdOverride: null,
        modeOverride: 'firing',
      })
    );
    expect(compactFiringHtml).toContain('firing-compact-card');
    expect(compactFiringHtml).not.toContain('inspector-rifling-badge');

    // 1-click Bore Cutaway trigger collapses exploded view and activates Z-axis CT cutaway
    useAppStore.getState().enterWorkbench('m1911', 'explode');
    useAppStore.getState().setSectionCutAxis('x');
    useAppStore.getState().setSectionCutOffset(12);
    useAppStore.getState().setTargetProgress(0.75);
    playbackClock.setTargetProgress(0.75, true);
    expect(useAppStore.getState().sectionCut).toBe(false);

    activateBoreRiflingCutaway();
    expect(useAppStore.getState().sectionCut).toBe(true);
    expect(useAppStore.getState().sectionCutAxis).toBe('z');
    expect(useAppStore.getState().sectionCutOffset).toBe(0);
    expect(playbackClock.getState().targetProgress).toBe(0);
    expect(playbackClock.getState().animatedProgress).toBe(0);
  });

  it('displays authentic Bore & Rifling row in Armory exhibit plaque for barreled exhibits, omits for archery, and keeps <= 7 header controls', () => {
    for (const weaponId of [
      'm1911',
      'g17',
      'ztz99a',
      'tiger1',
      'gau8',
    ] as const) {
      const spec = WEAPON_RIFLING_SPECS[weaponId];
      const htmlEn = renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: weaponId,
          langOverride: 'en',
        })
      );
      expect(htmlEn).toContain('data-testid="armory-plaque-rifling-row"');
      expect(htmlEn).toContain(`data-rifling-kind="${spec.kind}"`);
      expect(htmlEn).toContain('Bore &amp; Rifling');
      expect(htmlEn).toContain(`Ø${spec.boreDiameterMm} mm`);
      expect(htmlEn).toContain(escapeHtml(spec.labelEn));

      // Header top-level button budget preserved strictly <= 7
      const controlsMatch = htmlEn.match(
        /<div class="armory-header-controls">([\s\S]*?)<\/header>/
      );
      expect(controlsMatch).not.toBeNull();
      const topLevelTriggerCount = (
        controlsMatch![1].match(/<button\b/g) ?? []
      ).length;
      expect(topLevelTriggerCount).toBeLessThanOrEqual(7);

      const htmlZh = renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: weaponId,
          langOverride: 'zh',
        })
      );
      expect(htmlZh).toContain('膛线规格');
      expect(htmlZh).toContain(escapeHtml(spec.labelZh));
    }

    for (const archeryId of ['lift33', 'r500'] as const) {
      const html = renderToStaticMarkup(
        React.createElement(ArmoryView, {
          weaponIdOverride: archeryId,
          langOverride: 'en',
        })
      );
      expect(html).not.toContain('armory-plaque-rifling-row');
    }
  });

  it('audits KeyboardShortcutsModal for accurate implemented keycaps, complete power-tool coverage, 0 EN CJK, 0 WP-XX & Blueprint Daylight CSS', () => {
    // 4 canonical group IDs preserved
    expect(KEYBOARD_SHORTCUT_GROUPS.map((g) => g.id)).toEqual([
      'viewport',
      'cutaway',
      'firing',
      'navigation',
    ]);

    // Every listed keycap corresponds strictly to a real implemented shortcut (zero fabricated hotkeys!)
    const allKeycapTokens: string[] = [];
    for (const group of KEYBOARD_SHORTCUT_GROUPS) {
      for (const item of group.items) {
        expect(CJK_RE.test(item.labelEn), `CJK in EN: ${item.id}`).toBe(false);
        expect(WP_LEAK_RE.test(item.labelEn), `WP in EN: ${item.id}`).toBe(
          false
        );
        expect(WP_LEAK_RE.test(item.labelZh), `WP in ZH: ${item.id}`).toBe(
          false
        );
        for (const k of item.keys) {
          expect(
            REAL_SINGLE_KEY_BINDINGS.has(k),
            `Unexpected/unimplemented hotkey token "${k}" on "${item.id}"`
          ).toBe(true);
          allKeycapTokens.push(k);
        }
      }
    }

    // Core implemented hotkeys present
    for (const reqKey of ['C', 'O', 'R', 'S', '?', 'K', 'M']) {
      expect(allKeycapTokens).toContain(reqKey);
    }

    // All 6 zero-hotkey museum power tools honestly surfaced via Cmd+K / toolbar launchers
    const powerToolIds = KEYBOARD_POWER_TOOLS.map((t) => t.id);
    expect(powerToolIds).toEqual(
      expect.arrayContaining([
        'slow-mo-cinema',
        'acoustic-deck',
        'scale-wall',
        'recoil-lab',
        'armor-theater',
        'copy-deep-link',
      ])
    );
    for (const tool of KEYBOARD_POWER_TOOLS) {
      expect(CJK_RE.test(tool.labelEn)).toBe(false);
      expect(CJK_RE.test(tool.accessEn)).toBe(false);
      expect(WP_LEAK_RE.test(tool.labelEn)).toBe(false);
      expect(WP_LEAK_RE.test(tool.labelZh)).toBe(false);
    }

    const htmlEn = renderToStaticMarkup(
      React.createElement(KeyboardShortcutsModal, {
        onClose: () => {},
        langOverride: 'en',
      })
    );
    expect(htmlEn).toContain('data-testid="kb-power-tools-section"');
    expect(htmlEn).toContain('Slow-Mo Cutaway Cinema');
    expect(htmlEn).toContain('Acoustic Studio Deck');
    expect(htmlEn).toContain('1:1 True-Scale Museum Wall');
    expect(htmlEn).toContain('Recoil Impulse');
    expect(htmlEn).toContain('3D Composite Armor Penetration Theater');
    expect(htmlEn).toContain('Copy Exact 3D View Deep-Link');
    expect(CJK_RE.test(htmlEn)).toBe(false);
    expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

    const htmlZh = renderToStaticMarkup(
      React.createElement(KeyboardShortcutsModal, {
        onClose: () => {},
        langOverride: 'zh',
      })
    );
    expect(htmlZh).toContain('data-testid="kb-power-tools-section"');
    expect(WP_LEAK_RE.test(htmlZh)).toBe(false);

    // Verify dark + [data-theme='light'] Blueprint Daylight CSS & balanced braces in workbench.css & armory.css
    for (const rel of ['src/styles/workbench.css', 'src/styles/armory.css']) {
      const css = fs.readFileSync(path.join(ROOT, rel), 'utf8');
      const openBraces = (css.match(/\{/g) ?? []).length;
      const closeBraces = (css.match(/\}/g) ?? []).length;
      expect(openBraces, `Unbalanced braces in ${rel}`).toBe(closeBraces);
    }
    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.inspector-rifling-card');
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .inspector-rifling-card");
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .kb-access-pill");

    const armoryCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/armory.css'),
      'utf8'
    );
    expect(armoryCss).toContain('.plaque-rifling-cell');
    expect(armoryCss).toContain(":is([data-theme='light'], .theme-light) .plaque-rifling-cell");
  });
});

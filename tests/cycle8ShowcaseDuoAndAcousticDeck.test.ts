import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it } from 'vitest';
import {
  ACOUSTIC_ENVIRONMENT_CONFIGS,
  ACOUSTIC_ENVIRONMENT_PRESETS,
  getAcousticEnvironment,
  getWeaponBespokeAcousticSignature,
} from '../src/engine/audio/mechanicalSoundEngine';
import {
  AcousticDeckPopover,
  MECHANISM_STYLE_LABELS,
  getBrassDropUnsupportedReason,
  isBrassDropFoleySupported,
} from '../src/features/workbench/AcousticDeckPopover';
import { PartInspectorCard } from '../src/features/workbench/PartInspectorCard';
import { WorkbenchHeader } from '../src/features/workbench/WorkbenchHeader';
import { useAppStore } from '../src/store/useAppStore';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

const BESPOKE_WEAPONS: readonly WeaponId[] = [
  'gau8',
  'mg42',
  'thompson',
  'mp5',
  'm1911',
  'k98k',
];

const NON_BRASS_WEAPONS: readonly WeaponId[] = [
  'g11',
  'gau8',
  'lift33',
  'r500',
  'python',
];

afterEach(() => {
  useAppStore.getState().setLang('zh');
  useAppStore.getState().setEnvironmentPreset('tactical_vault');
  useAppStore.getState().resetAll();
  useAppStore.getState().returnToArmory();
});

describe('Cycle 8F — Balanced Showcase Duo Grid, Acoustic Studio & Foley Deck, and Inspector Links', () => {
  it('defines balanced .labs-bento-grid-duo rules for desktop/tablet and <= 640px mobile collapse in showcase.css', () => {
    const showcaseCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/showcase.css'),
      'utf8'
    );
    expect(showcaseCss).toMatch(
      /\.labs-bento-grid\.labs-bento-grid-duo\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\);[\s\S]*?margin-top:\s*18px;/
    );
    expect(showcaseCss).toMatch(
      /@media\s*\(max-width:\s*640px\)[\s\S]*?\.labs-bento-grid\.labs-bento-grid-duo\s*\{[\s\S]*?grid-template-columns:\s*1fr;/
    );

    const openBraces = (showcaseCss.match(/\{/g) ?? []).length;
    const closeBraces = (showcaseCss.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });

  it('round-trips all acoustic environment presets in useAppStore while preserving studio auto-coupling', () => {
    // Default synced with tactical_vault + explode -> tactical_hall
    expect(useAppStore.getState().acousticEnvironment).toBe('tactical_hall');
    expect(useAppStore.getState().acousticEnvironmentManual).toBe(false);

    // Manual override round-trips every exported room preset & syncs soundEngine
    for (const preset of ACOUSTIC_ENVIRONMENT_PRESETS) {
      useAppStore.getState().setAcousticEnvironmentPreset(preset);
      expect(useAppStore.getState().acousticEnvironment).toBe(preset);
      expect(useAppStore.getState().acousticEnvironmentManual).toBe(true);
      expect(getAcousticEnvironment()).toBe(preset);
    }

    // Manual room pick persists across explode <-> firing mode flips
    useAppStore.getState().setAcousticEnvironmentPreset('bench_close');
    useAppStore.getState().setMode('firing');
    expect(useAppStore.getState().acousticEnvironment).toBe('bench_close');
    expect(getAcousticEnvironment()).toBe('bench_close');

    // Changing Studio Environment re-syncs acoustic room cleanly
    useAppStore.getState().setEnvironmentPreset('tactical_vault');
    expect(useAppStore.getState().acousticEnvironmentManual).toBe(false);
    expect(useAppStore.getState().acousticEnvironment).toBe('indoor_range');
    expect(getAcousticEnvironment()).toBe('indoor_range');

    // Explicit auto-reset & resetAll restore studio-coupled room
    useAppStore.getState().setAcousticEnvironmentPreset('bench_close');
    useAppStore.getState().resetAcousticEnvironmentAuto();
    expect(useAppStore.getState().acousticEnvironmentManual).toBe(false);
    expect(useAppStore.getState().acousticEnvironment).toBe('indoor_range');

    useAppStore.getState().setAcousticEnvironmentPreset('bench_close');
    useAppStore.getState().resetAll();
    expect(useAppStore.getState().acousticEnvironmentManual).toBe(false);
    expect(useAppStore.getState().acousticEnvironment).toBe('tactical_hall');
    expect(getAcousticEnvironment()).toBe('tactical_hall');
  });

  it('renders AcousticDeckPopover with all reverb rooms, all 6 bespoke signatures, foley auditions, 0 EN CJK & 0 WP-XX', () => {
    // Header integrates AcousticDeckPopover without top-bar bloat
    const headerHtml = renderToStaticMarkup(
      React.createElement(WorkbenchHeader)
    );
    expect(headerHtml).toContain('data-testid="wb-acoustic-deck-trigger"');
    expect(headerHtml).toContain('aria-expanded="false"');
    expect(headerHtml).toContain('aria-haspopup="dialog"');
    expect(headerHtml).not.toContain('toggle-chip active-amber');

    // Verify every bespoke weapon renders its full signature, modal partials & 0 EN CJK / WP-XX
    for (const weaponId of BESPOKE_WEAPONS) {
      const sig = getWeaponBespokeAcousticSignature(weaponId);
      expect(sig, `Expected bespoke signature for ${weaponId}`).not.toBeNull();

      const htmlEn = renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          defaultOpen: true,
          weaponIdOverride: weaponId,
          langOverride: 'en',
        })
      );
      const htmlZh = renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          defaultOpen: true,
          weaponIdOverride: weaponId,
          langOverride: 'zh',
        })
      );

      for (const preset of ACOUSTIC_ENVIRONMENT_PRESETS) {
        expect(htmlEn).toContain(`data-testid="acoustic-room-${preset}"`);
        expect(htmlZh).toContain(`data-testid="acoustic-room-${preset}"`);
        expect(htmlEn).toContain(
          `RT60 ${ACOUSTIC_ENVIRONMENT_CONFIGS[preset].rt60LowSec.toFixed(2)}s`
        );
      }

      expect(htmlEn).toContain('data-testid="acoustic-deck-mute-toggle"');
      expect(htmlEn).toContain('data-testid="acoustic-bespoke-badge"');
      expect(htmlEn).toContain('Bespoke Acoustics');
      expect(htmlEn).toContain(
        sig!.labelEn.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
      );
      expect(htmlEn).toContain('data-testid="acoustic-audition-action"');
      expect(htmlEn).toContain('data-testid="acoustic-audition-brass"');
      expect(htmlEn).toContain('data-testid="acoustic-audition-chamber"');

      expect(CJK_RE.test(htmlEn), `CJK leak in EN AcousticDeck for ${weaponId}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(htmlEn), `WP leak in EN AcousticDeck for ${weaponId}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(htmlZh), `WP leak in ZH AcousticDeck for ${weaponId}`).toBe(
        false
      );
    }

    // Verify brass drop disable logic for caseless / linkless / revolver / archery vs brass-ejecting weapons
    for (const id of NON_BRASS_WEAPONS) {
      expect(isBrassDropFoleySupported(id)).toBe(false);
      const reasonEn = getBrassDropUnsupportedReason(id, 'en');
      const reasonZh = getBrassDropUnsupportedReason(id, 'zh');
      expect(reasonEn.length).toBeGreaterThan(0);
      expect(reasonZh.length).toBeGreaterThan(0);
      expect(CJK_RE.test(reasonEn)).toBe(false);

      const disabledHtml = renderToStaticMarkup(
        React.createElement(AcousticDeckPopover, {
          defaultOpen: true,
          weaponIdOverride: id,
          langOverride: 'en',
        })
      );
      expect(disabledHtml).toMatch(
        /data-testid="acoustic-audition-brass"[^>]*disabled=""/
      );
    }
    for (const id of ['m1911', 'k98k', 'mg42', 'thompson', 'mp5', 'ak15'] as const) {
      expect(isBrassDropFoleySupported(id)).toBe(true);
    }

    // All 30 mechanism style labels have 0 CJK in EN and 0 WP-XX
    for (const [style, labels] of Object.entries(MECHANISM_STYLE_LABELS)) {
      expect(CJK_RE.test(labels.en), `CJK in EN style ${style}`).toBe(false);
      expect(WP_LEAK_RE.test(labels.en), `WP in EN style ${style}`).toBe(false);
      expect(WP_LEAK_RE.test(labels.zh), `WP in ZH style ${style}`).toBe(false);
    }

    // Dark + [data-theme='light'] Blueprint Daylight + reduced motion rules exist in workbench.css
    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.acoustic-deck-popover');
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .acoustic-room-btn.is-active");
    expect(wbCss).toContain(":is([data-theme='light'], .theme-light) .inspector-recoil-cta");
    const openBraces = (wbCss.match(/\{/g) ?? []).length;
    const closeBraces = (wbCss.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });

  it('enriches PartInspectorCard with Recoil Lab CTA & bespoke-acoustics badge while keeping mobile firing-compact-card untouched', async () => {
    const [, ak15Plugin] = await Promise.all([
      loadWeaponPlugin('gau8'),
      loadWeaponPlugin('ak15'),
      loadWeaponPlugin('p08'),
    ]);

    // Bespoke weapon (gau8) shows BOTH bespoke acoustics badge and Recoil Lab pill beside Split 3D CTA
    const gau8Html = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'gau8',
        partIdOverride: 'gau8_barrel_cluster',
      })
    );
    expect(gau8Html).toContain('inspector-lab-links');
    expect(gau8Html).toContain('inspector-split-cta');
    expect(gau8Html).toContain('data-testid="inspector-recoil-lab-btn"');
    expect(gau8Html).toContain('data-testid="inspector-bespoke-acoustics-badge"');
    expect(gau8Html).toContain('data-acoustic-style="hydraulic_rotary_cannon"');

    // Non-bespoke weapon (ak15) shows Recoil Lab CTA without bespoke badge
    const ak15Html = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'ak15',
        partIdOverride: ak15Plugin.parts[0].id,
      })
    );
    expect(ak15Html).toContain('data-testid="inspector-recoil-lab-btn"');
    expect(ak15Html).not.toContain('inspector-bespoke-acoustics-badge');

    // Mobile firing compact card stays 100% clean (no Recoil CTA or acoustics badge bloat)
    const compactFiringHtml = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'p08',
        partIdOverride: null,
        modeOverride: 'firing',
      })
    );
    expect(compactFiringHtml).toContain('firing-compact-card');
    expect(compactFiringHtml).not.toContain('inspector-recoil-lab-btn');
    expect(compactFiringHtml).not.toContain('inspector-bespoke-acoustics-badge');

    // Source explicitly links openRecoilLab
    const inspectorSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/PartInspectorCard.tsx'),
      'utf8'
    );
    expect(inspectorSrc).toContain('openRecoilLab()');
  });
});

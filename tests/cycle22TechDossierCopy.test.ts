import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { WEAPON_RIFLING_SPECS } from '../src/engine/ballistics/riflingSpecs';
import { getGlossaryTermsForWeapon } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  CALIBER_BALLISTICS,
  isArcheryWeapon,
} from '../src/engine/physics/armoryPhysics';
import {
  EXHIBIT_PROVENANCE_TABLE,
  formatWeaponPartTechDossierMarkdown,
} from '../src/engine/utils/techDossierMarkdown';
import { HISTORY_TIMELINE_NODES } from '../src/features/timeline/historyTimelineSpecs';
import { PartInspectorCard } from '../src/features/workbench/PartInspectorCard';
import { WEAPON_MANIFESTS } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import type { WeaponId } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_LEAK_RE = /\bWP-\d{2}[a-z]?\b/i;

describe('Cycle 22D — 1-Click Smithsonian Engineering Technical Dossier Copy', () => {
  it('maintains 100% provenance year parity with HISTORY_TIMELINE_NODES across all 100 exhibits', () => {
    expect(WEAPON_MANIFESTS.length).toBe(100);
    expect(Object.keys(EXHIBIT_PROVENANCE_TABLE)).toHaveLength(100);

    const timelineYearByWeapon = new Map<string, number>();
    for (const node of HISTORY_TIMELINE_NODES) {
      timelineYearByWeapon.set(node.weaponId, node.year);
    }

    for (const manifest of WEAPON_MANIFESTS) {
      const prov = EXHIBIT_PROVENANCE_TABLE[manifest.id];
      expect(prov, `Missing provenance for ${manifest.id}`).toBeDefined();
      expect(prov.year).toBe(timelineYearByWeapon.get(manifest.id));
      expect(prov.manufacturerEn.length).toBeGreaterThan(2);
      expect(prov.manufacturerZh.length).toBeGreaterThan(2);
      expect(
        CJK_RE.test(prov.manufacturerEn),
        `CJK in EN manufacturer for ${manifest.id}`
      ).toBe(false);
    }
  });

  it('formats complete bilingual Smithsonian Markdown dossiers across all 34/34 exhibits with 0 EN CJK & 0 WP-XX', () => {
    for (const manifest of WEAPON_MANIFESTS) {
      const weaponId = manifest.id;
      const shareUrl = `https://example.org/digital-armory-3d/?screen=workbench&weapon=${weaponId}`;
      const rifling = WEAPON_RIFLING_SPECS[weaponId];
      const ballistics = CALIBER_BALLISTICS[manifest.caliberProfile];
      const glossary = getGlossaryTermsForWeapon(weaponId);
      const prov = EXHIBIT_PROVENANCE_TABLE[weaponId];
      const archery = isArcheryWeapon(weaponId);

      const mdEn = formatWeaponPartTechDossierMarkdown({
        weaponId,
        partId: null,
        lang: 'en',
        shareUrl,
      });
      const mdZh = formatWeaponPartTechDossierMarkdown({
        weaponId,
        partId: null,
        lang: 'zh',
        shareUrl,
      });

      // Zero EN CJK & Zero WP-XX across all 34 exhibits
      expect(
        CJK_RE.test(mdEn),
        `CJK leak in EN tech dossier for ${weaponId}:\n${mdEn}`
      ).toBe(false);
      expect(WP_LEAK_RE.test(mdEn), `WP-XX leak in EN dossier ${weaponId}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(mdZh), `WP-XX leak in ZH dossier ${weaponId}`).toBe(
        false
      );

      // Core structure, provenance, ballistics, rifling, glossary & deep-link
      expect(mdEn).toContain('# ');
      expect(mdEn).toContain(manifest.catalog.bayCode);
      expect(mdEn).toContain(String(prov.year));
      expect(mdEn).toContain(prov.manufacturerEn);
      expect(mdEn).toContain(rifling.labelEn);
      expect(mdEn).toContain(shareUrl);

      expect(mdZh).toContain('# ');
      expect(mdZh).toContain(manifest.catalog.bayCode);
      expect(mdZh).toContain(String(prov.year));
      expect(mdZh).toContain(prov.manufacturerZh);
      expect(mdZh).toContain(rifling.labelZh);
      expect(mdZh).toContain(shareUrl);

      if (archery) {
        expect(mdEn).toContain('lbf');
        expect(mdEn).toContain('FPS');
        expect(mdZh).toContain('lbf');
      } else {
        expect(mdEn).toContain(`${ballistics.peakPressureMPa} MPa`);
        expect(mdEn).toContain(`${ballistics.muzzleVelocityMps} m/s`);
        expect(mdZh).toContain(`${ballistics.peakPressureMPa} MPa`);
        if (ballistics.muzzleEnergyJ >= 1_000_000) {
          expect(mdEn).toContain('MJ');
          expect(mdZh).toContain('MJ');
        } else {
          expect(mdEn).toContain(' J');
        }
      }

      expect(glossary.length).toBeGreaterThanOrEqual(2);
      expect(mdEn).toContain(glossary[0].termEn);
      expect(mdZh).toContain(glossary[0].termZh);
    }
  });

  it('includes detailed Selected Component Specification when a part is selected across diverse halls', async () => {
    const sampleIds: readonly WeaponId[] = [
      'ak15',
      'ztz99a',
      'gau8',
      'lift33',
      'm1911',
      'k98k',
      'tiger1',
    ];

    for (const weaponId of sampleIds) {
      const plugin = await loadWeaponPlugin(weaponId);
      const part = plugin.parts[0];
      const shareUrl = `https://example.org/?screen=workbench&weapon=${weaponId}&part=${part.id}`;

      const mdEn = formatWeaponPartTechDossierMarkdown({
        weaponId,
        partId: part.id,
        lang: 'en',
        shareUrl,
        partOverride: {
          part,
          cadEnvelopeMm: '142.0 × 38.5 × 24.0 mm',
        },
      });
      const mdZh = formatWeaponPartTechDossierMarkdown({
        weaponId,
        partId: part.id,
        lang: 'zh',
        shareUrl,
        partOverride: {
          part,
          cadEnvelopeMm: '142.0 × 38.5 × 24.0 mm',
        },
      });

      expect(mdEn).toContain('## 4. Selected Component Specification');
      expect(mdEn).toContain(part.bomCode);
      expect(mdEn).toContain('142.0 × 38.5 × 24.0 mm');
      expect(mdEn).toContain('## 5. Engineering Principles & Glossary');
      expect(
        CJK_RE.test(mdEn),
        `EN CJK leak in selected-part dossier for ${weaponId}:${part.id}`
      ).toBe(false);
      expect(WP_LEAK_RE.test(mdEn)).toBe(false);

      expect(mdZh).toContain('## 4. 当前选定零件规格');
      expect(mdZh).toContain(part.nameZh);
      expect(mdZh).toContain(part.bomCode);
      expect(mdZh).toContain('## 5. 核心机械原理与百科词条');
      expect(WP_LEAK_RE.test(mdZh)).toBe(false);
    }
  });

  it('renders accessible Copy Tech Dossier button in PartInspectorCard, preserves mobile firing card & validates scoped CSS', async () => {
    const [ak15Plugin, ztzPlugin, gau8Plugin] = await Promise.all([
      loadWeaponPlugin('ak15'),
      loadWeaponPlugin('ztz99a'),
      loadWeaponPlugin('gau8'),
    ]);

    const cases: Array<{ id: WeaponId; partId: string }> = [
      { id: 'ak15', partId: ak15Plugin.parts[0].id },
      { id: 'ztz99a', partId: ztzPlugin.parts[0].id },
      { id: 'gau8', partId: gau8Plugin.parts[0].id },
    ];

    for (const c of cases) {
      const htmlEn = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: c.id,
          partIdOverride: c.partId,
          langOverride: 'en',
        })
      );
      const htmlZh = renderToStaticMarkup(
        React.createElement(PartInspectorCard, {
          weaponIdOverride: c.id,
          partIdOverride: c.partId,
          langOverride: 'zh',
        })
      );

      expect(htmlEn).toContain('data-testid="inspector-copy-dossier-btn"');
      expect(htmlEn).toContain('Copy Tech Dossier');
      expect(htmlEn).toContain('data-testid="inspector-copy-dossier-status"');
      expect(htmlEn).toContain('role="status"');
      expect(htmlEn).toContain('aria-live="polite"');
      expect(CJK_RE.test(htmlEn), `CJK leak in EN Inspector for ${c.id}`).toBe(
        false
      );
      expect(WP_LEAK_RE.test(htmlEn)).toBe(false);

      expect(htmlZh).toContain('data-testid="inspector-copy-dossier-btn"');
      expect(htmlZh).toContain('复制工程卡');
      expect(WP_LEAK_RE.test(htmlZh)).toBe(false);
    }

    // Mobile firing compact card stays spotless
    const firingHtml = renderToStaticMarkup(
      React.createElement(PartInspectorCard, {
        weaponIdOverride: 'ak15',
        partIdOverride: null,
        modeOverride: 'firing',
        langOverride: 'en',
      })
    );
    expect(firingHtml).toContain('firing-compact-card');
    expect(firingHtml).not.toContain('inspector-copy-dossier-btn');

    // Clipboard fallback & timer cleanup verified in source
    const inspectorSrc = fs.readFileSync(
      path.join(ROOT, 'src/features/workbench/PartInspectorCard.tsx'),
      'utf8'
    );
    expect(inspectorSrc).toContain('navigator.clipboard');
    expect(inspectorSrc).toContain("document.execCommand('copy')");
    expect(inspectorSrc).toContain('clearTimeout(copyResetTimerRef.current)');

    // Scoped .inspector-copy-dossier-* CSS rules in workbench.css (Dark + Daylight + Mobile + Reduced Motion)
    const wbCss = fs.readFileSync(
      path.join(ROOT, 'src/styles/workbench.css'),
      'utf8'
    );
    expect(wbCss).toContain('.inspector-copy-dossier-row');
    expect(wbCss).toContain('.inspector-copy-dossier-btn');
    expect(wbCss).toContain('.inspector-copy-dossier-btn.is-copied');
    expect(wbCss).toContain('.inspector-copy-dossier-btn:focus-visible');
    expect(wbCss).toContain(
      ":is([data-theme='light'], .theme-light) .inspector-copy-dossier-btn"
    );
    expect(wbCss).toMatch(
      /@media\s*\(max-width:\s*768px\)[\s\S]*?\.inspector-copy-dossier-btn\s*\{[\s\S]*?min-height:\s*36px;/
    );
    expect(wbCss).toMatch(
      /@media\s*\(prefers-reduced-motion:\s*reduce\)[\s\S]*?\.inspector-copy-dossier-btn/
    );
    const openBraces = (wbCss.match(/\{/g) ?? []).length;
    const closeBraces = (wbCss.match(/\}/g) ?? []).length;
    expect(openBraces).toBe(closeBraces);
  });
});

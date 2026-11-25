import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import { MechanismShowdownModal } from '../src/features/armory/MechanismShowdownModal';
import { getClassicRivalryPresets } from '../src/features/armory/mechanismShowdownSpecs';
import {
  ATLAS_PIPELINE_STRINGS,
  ATLAS_SUITE_SEARCH_INDEX,
  classifyAtlasSuiteResolution,
  searchAtlasSuites,
  TANK_4K_ATLAS_SUITE_IDS,
  TextureAtlasModal,
} from '../src/features/atlas/TextureAtlasModal';
import { assembleMonographDossier } from '../src/features/monograph/monographDataAssembler';
import { MonographDkDocument } from '../src/features/monograph/MonographDkDocument';
import { MonographKidsDocument } from '../src/features/monograph/MonographKidsDocument';
import {
  getDkEncyclopediaStrings,
  getMonographDomainLabels,
} from '../src/features/monograph/monographStrings';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { FLAGSHIP_34_IDS } from '../src/weapons/expansion/centennialTypes';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const ROOT_DIR = path.resolve(__dirname, '..');
const NARRATIONS_DIR = path.join(ROOT_DIR, 'public/narrations');
const TEXTURES_DIR = path.join(ROOT_DIR, 'public/textures');

const CJK_RE = /[\u4e00-\u9fff]/;
const WP_BADGE_RE = /\bWP-\d+[a-z]?\b/i;

function loadNarration(weaponId: WeaponId): WeaponNarrationBundle {
  return JSON.parse(
    fs.readFileSync(path.join(NARRATIONS_DIR, `${weaponId}.json`), 'utf8')
  ) as WeaponNarrationBundle;
}

function collectStrings(value: unknown): string[] {
  if (typeof value === 'string') return [value];
  if (typeof value === 'function') {
    try {
      const sample = (value as (...args: unknown[]) => unknown)(34, 105, 'A');
      return typeof sample === 'string' ? [sample] : [];
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) {
    return value.flatMap(collectStrings);
  }
  if (value && typeof value === 'object') {
    return Object.values(value).flatMap(collectStrings);
  }
  return [];
}

describe('Cycle 5B · Print Studio (DK & Kids 34-Exhibit Audit)', () => {
  it('provides authentic bilingual domain labels for firearm, archery, heavy armor (MBT), and heavy ordnance (GAU-8/A) with zero CJK in EN and zero stale WP-XX or 7-caliber leaks', () => {
    const domains: Array<{
      label: string;
      isArchery: boolean;
      isTank: boolean;
      isOrdnance: boolean;
    }> = [
      { label: 'firearm', isArchery: false, isTank: false, isOrdnance: false },
      { label: 'archery', isArchery: true, isTank: false, isOrdnance: false },
      { label: 'armor', isArchery: false, isTank: true, isOrdnance: false },
      { label: 'ordnance', isArchery: false, isTank: false, isOrdnance: true },
    ];

    for (const d of domains) {
      const enDomain = getMonographDomainLabels(
        'en',
        d.isArchery,
        d.isTank,
        d.isOrdnance
      );
      const zhDomain = getMonographDomainLabels(
        'zh',
        d.isArchery,
        d.isTank,
        d.isOrdnance
      );
      const enDk = getDkEncyclopediaStrings(
        'en',
        d.isArchery,
        d.isTank,
        d.isOrdnance
      );
      const zhDk = getDkEncyclopediaStrings(
        'zh',
        d.isArchery,
        d.isTank,
        d.isOrdnance
      );

      for (const txt of [...collectStrings(enDomain), ...collectStrings(enDk)]) {
        expect(txt, `[${d.label}] EN string leaked CJK: ${txt}`).not.toMatch(
          CJK_RE
        );
        expect(txt, `[${d.label}] EN string leaked WP-XX: ${txt}`).not.toMatch(
          WP_BADGE_RE
        );
        expect(txt, `[${d.label}] EN string leaked stale 7-Caliber`).not.toMatch(
          /\b7-Caliber\b/
        );
      }

      for (const txt of [...collectStrings(zhDomain), ...collectStrings(zhDk)]) {
        expect(txt, `[${d.label}] ZH string leaked WP-XX: ${txt}`).not.toMatch(
          WP_BADGE_RE
        );
        expect(txt, `[${d.label}] ZH string leaked stale 7 大口径`).not.toMatch(
          /(?<!\d)7\s*大口径/
        );
      }
    }

    // Heavy Ordnance (GAU-8/A) specific engineering terminology
    const ordEn = getMonographDomainLabels('en', false, false, true);
    const ordZh = getMonographDomainLabels('zh', false, false, true);
    const ordDkEn = getDkEncyclopediaStrings('en', false, false, true);
    const ordDkZh = getDkEncyclopediaStrings('zh', false, false, true);

    expect(ordEn.weightLabel).toContain('Loaded System Mass');
    expect(ordEn.barrelLabel).toContain('7-Barrel');
    expect(ordEn.secBallistics).toContain('30x173mm');
    expect(ordZh.weightLabel).toContain('满载系统总重');
    expect(ordZh.barrelLabel).toContain('七管');
    expect(ordZh.secBallistics).toContain('30×173mm');
    expect(ordDkEn.ballisticsHeading).toContain('30');
    expect(ordDkZh.ballisticsHeading).toContain('30');

    // Heavy Armor (MBT) specific engineering terminology
    const tankEn = getMonographDomainLabels('en', false, true, false);
    const tankZh = getMonographDomainLabels('zh', false, true, false);
    expect(tankEn.weightLabel).toContain('Combat Weight');
    expect(tankZh.weightLabel).toContain('战斗全重');
  });

  it('SSR-renders MonographDkDocument & MonographKidsDocument for GAU-8/A and ZTZ-99A in EN and ZH with authentic domain badges and zero CJK in EN', async () => {
    const targetExhibits: Array<{
      weaponId: WeaponId;
      expectedDkEn: string;
      expectedDkZh: string;
      expectedKidsEn: string;
      expectedKidsZh: string;
    }> = [
      {
        weaponId: 'gau8',
        expectedDkEn: 'Loaded System Mass',
        expectedDkZh: '满载系统总重',
        expectedKidsEn: '30x173mm AERO CANNON SHELL',
        expectedKidsZh: '30×173mm 航空机炮弹',
      },
      {
        weaponId: 'ztz99a',
        expectedDkEn: 'Combat Weight',
        expectedDkZh: '战斗全重',
        expectedKidsEn: '1:10 TANK CANNON SHELL',
        expectedKidsZh: '1:10 坦克主炮穿甲弹',
      },
    ];

    for (const target of targetExhibits) {
      const plugin = await loadWeaponPlugin(target.weaponId);
      const narration = loadNarration(target.weaponId);

      const dossierEn = assembleMonographDossier(
        target.weaponId,
        plugin,
        'en',
        narration,
        'https://armory.example.test'
      );
      const dossierZh = assembleMonographDossier(
        target.weaponId,
        plugin,
        'zh',
        narration,
        'https://armory.example.test'
      );

      const dkEnHtml = renderToStaticMarkup(
        React.createElement(MonographDkDocument, {
          dossier: dossierEn,
          captureBundle: null,
          layoutMode: 'spread_a3',
          pageMode: 'full_8p',
          collectorCallsign: 'ARCHIVIST',
        })
      );
      const dkZhHtml = renderToStaticMarkup(
        React.createElement(MonographDkDocument, {
          dossier: dossierZh,
          captureBundle: null,
          layoutMode: 'spread_a3',
          pageMode: 'full_8p',
          collectorCallsign: '博物馆策展人',
        })
      );

      expect(dkEnHtml).toContain(target.expectedDkEn);
      expect(dkEnHtml).not.toMatch(CJK_RE);
      expect(dkEnHtml).not.toMatch(WP_BADGE_RE);
      expect(dkZhHtml).toContain(target.expectedDkZh);
      expect(dkZhHtml).not.toMatch(WP_BADGE_RE);

      const kidsEnHtml = renderToStaticMarkup(
        React.createElement(MonographKidsDocument, {
          dossier: dossierEn,
          captureBundle: null,
          edition: 'blueprint_manual',
          pageMode: 'full_8p',
          collectorCallsign: 'EXPLORER',
        })
      );
      const kidsZhHtml = renderToStaticMarkup(
        React.createElement(MonographKidsDocument, {
          dossier: dossierZh,
          captureBundle: null,
          edition: 'blueprint_manual',
          pageMode: 'full_8p',
          collectorCallsign: '小小探索家',
        })
      );

      expect(kidsEnHtml).toContain(target.expectedKidsEn);
      expect(kidsEnHtml).not.toMatch(CJK_RE);
      expect(kidsEnHtml).not.toMatch(WP_BADGE_RE);
      expect(kidsZhHtml).toContain(target.expectedKidsZh);
      expect(kidsZhHtml).not.toMatch(WP_BADGE_RE);
    }
  });

  it('assembles clean monograph dossiers for all 100 exhibits including Centennial expansion, V6.0 WWII classics, MBTs, and GAU-8/A', async () => {
    expect(WEAPON_IDS.length).toBe(100);
    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const narration = loadNarration(weaponId);
      const dossierEn = assembleMonographDossier(
        weaponId,
        plugin,
        'en',
        narration,
        'https://armory.example.test'
      );

      expect(dossierEn.weaponId).toBe(weaponId);
      expect(dossierEn.bomRows.length).toBeGreaterThanOrEqual(8);
      expect(dossierEn.name).not.toMatch(CJK_RE);
      expect(dossierEn.caliberLabel).not.toMatch(CJK_RE);
      expect(dossierEn.originTag).not.toMatch(CJK_RE);
      expect(dossierEn.serialCode).toBeTruthy();
    }
  });

  it('preserves @media print integrity while adding <= 768px screen-only mobile preview polish', () => {
    const monographCss = fs.readFileSync(
      path.join(ROOT_DIR, 'src/styles/monograph.css'),
      'utf8'
    );
    const dkCss = fs.readFileSync(
      path.join(ROOT_DIR, 'src/styles/dk-monograph.css'),
      'utf8'
    );

    expect(monographCss).toContain('@media print');
    expect(monographCss).toContain('@media screen and (max-width: 768px)');
    expect(dkCss).toContain('@media print');
    expect(dkCss).toContain('@media screen and (max-width: 768px)');
    expect(monographCss).not.toMatch(WP_BADGE_RE);
    expect(dkCss).not.toMatch(WP_BADGE_RE);
  });
});

describe('Cycle 5B · 9x9x9 Mechanism Showdown -> Split-Screen 3D Cutaway Unification', () => {
  it('renders 1-click Split-3D Cutaway triggers in header, staging bar, every rivalry preset pill, and active comparison verdict banner', () => {
    const presets = getClassicRivalryPresets('en');
    expect(presets.length).toBe(30);

    const matrixHtml = renderToStaticMarkup(
      React.createElement(MechanismShowdownModal, {
        initialMode: 'matrix',
        initialWeaponA: 'gau8',
        initialWeaponB: 'm134',
        onClose: () => {},
      })
    );

    expect(matrixHtml).toContain('role="dialog"');
    expect(matrixHtml).toContain('aria-modal="true"');
    expect(matrixHtml).toContain('data-testid="sd-header-split3d-cta"');
    expect(matrixHtml).toContain('data-testid="sd-staging-split3d-cta"');
    expect(matrixHtml).not.toMatch(WP_BADGE_RE);

    const showdownHtml = renderToStaticMarkup(
      React.createElement(MechanismShowdownModal, {
        initialMode: 'showdown',
        initialWeaponA: 'ztz99a',
        initialWeaponB: 'm1a2',
        onClose: () => {},
      })
    );

    expect(showdownHtml).toContain('data-testid="sd-header-split3d-cta"');
    expect(showdownHtml).toContain('data-testid="sd-active-split3d-cta"');
    for (const preset of presets) {
      expect(showdownHtml).toContain(`data-testid="sd-preset-split3d-${preset.id}"`);
    }
    expect(showdownHtml).not.toMatch(WP_BADGE_RE);
  });

  it('contains zero WP-XX leaks and defines <= 768px mobile polish in MechanismShowdownModal & showdown.css', () => {
    const tsxSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/features/armory/MechanismShowdownModal.tsx'),
      'utf8'
    );
    const cssSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/styles/showdown.css'),
      'utf8'
    );

    expect(tsxSrc).not.toMatch(WP_BADGE_RE);
    expect(cssSrc).not.toMatch(WP_BADGE_RE);
    expect(cssSrc).toContain('@media (max-width: 768px)');
    expect(cssSrc).toContain('.sd-launch-split3d-btn');
    expect(cssSrc).toContain('.sd-preset-split3d-btn');
    expect(cssSrc).toContain('.sd-verdict-split3d-cta');
  });
});

describe('Cycle 5B · 101-Suite PBR Texture Atlas Inspector Upgrade', () => {
  it('indexes all 34 exhibits (101+ PBR suites) and accurately classifies all 8 4K MBT exterior suites on disk', () => {
    expect(ATLAS_SUITE_SEARCH_INDEX.length).toBeGreaterThanOrEqual(101);

    const indexedWeapons = new Set(
      ATLAS_SUITE_SEARCH_INDEX.map((e) => e.weaponId)
    );
    expect(indexedWeapons.size).toBe(34);
    for (const id of FLAGSHIP_34_IDS) {
      expect(indexedWeapons.has(id), `Missing weapon ${id} in atlas search index`).toBe(
        true
      );
    }

    expect(TANK_4K_ATLAS_SUITE_IDS.size).toBe(8);
    for (const suiteId of TANK_4K_ATLAS_SUITE_IDS) {
      const cls = classifyAtlasSuiteResolution(suiteId);
      expect(cls.tier).toBe('4k_tank');
      expect(cls.pixelDims).toBe('4096 × 4096 px');
      expect(cls.badgeEn).toContain('4096x4096');
      expect(cls.badgeEn).not.toMatch(CJK_RE);
      expect(
        fs.existsSync(path.join(TEXTURES_DIR, `${suiteId}_albedo.webp`)),
        `Missing 4K albedo file for ${suiteId}`
      ).toBe(true);
    }

    const gau8Cls = classifyAtlasSuiteResolution('gau8_v3_barrels_shroud');
    expect(gau8Cls.tier).toBe('2k_suite');
    expect(gau8Cls.pixelDims).toBe('2048 × 2048 px');
    expect(gau8Cls.badgeEn).not.toMatch(CJK_RE);
  });

  it('supports instant bilingual exhibit/material search and 4K/2K tier filtering across all 101+ suites', () => {
    const only4k = searchAtlasSuites('', '4k_tank');
    expect(only4k.length).toBe(8);
    expect(new Set(only4k.map((s) => s.weaponId))).toEqual(
      new Set(['ztz99a', 'm1a2', 'leopard2a7', 'tiger1'])
    );

    const only2k = searchAtlasSuites('', '2k_suite');
    expect(only2k.length).toBe(ATLAS_SUITE_SEARCH_INDEX.length - 8);

    const zhWalnut = searchAtlasSuites('胡桃木');
    const enWalnut = searchAtlasSuites('walnut');
    expect(zhWalnut.length).toBeGreaterThan(0);
    expect(enWalnut.length).toBeGreaterThan(0);

    const zhZimmerit = searchAtlasSuites('防磁');
    const enZimmerit = searchAtlasSuites('zimmerit');
    expect(zhZimmerit.some((s) => s.suiteId === 'tiger1_v3_hull_zimmerit')).toBe(
      true
    );
    expect(enZimmerit.some((s) => s.suiteId === 'tiger1_v3_hull_zimmerit')).toBe(
      true
    );

    const gau8Results = searchAtlasSuites('gau8');
    expect(gau8Results.length).toBe(3);
    expect(gau8Results.every((s) => s.weaponId === 'gau8')).toBe(true);
  });

  it('keeps ATLAS_PIPELINE_STRINGS 100% bilingual with zero CJK in EN and zero WP-XX leaks', () => {
    expect(Object.keys(ATLAS_PIPELINE_STRINGS.en).sort()).toEqual(
      Object.keys(ATLAS_PIPELINE_STRINGS.zh).sort()
    );
    for (const s of collectStrings(ATLAS_PIPELINE_STRINGS.en)) {
      expect(s, `ATLAS_PIPELINE_STRINGS.en leaked CJK: ${s}`).not.toMatch(
        CJK_RE
      );
      expect(s, `ATLAS_PIPELINE_STRINGS.en leaked WP-XX: ${s}`).not.toMatch(
        WP_BADGE_RE
      );
    }
    for (const s of collectStrings(ATLAS_PIPELINE_STRINGS.zh)) {
      expect(s, `ATLAS_PIPELINE_STRINGS.zh leaked WP-XX: ${s}`).not.toMatch(
        WP_BADGE_RE
      );
    }
  });

  it('SSR-renders TextureAtlasModal with search bar, resolution/ORM/KTX2 spec strip, dialog a11y, and mobile CSS', () => {
    const html = renderToStaticMarkup(
      React.createElement(TextureAtlasModal, { forceOpen: true })
    );

    expect(html).toContain('role="dialog"');
    expect(html).toContain('aria-modal="true"');
    expect(html).toContain('data-testid="atlas-search-bar"');
    expect(html).toContain('data-testid="atlas-search-input"');
    expect(html).toContain('data-testid="atlas-pipeline-badges"');
    expect(html).toContain('Packed ORM');
    expect(html).not.toMatch(WP_BADGE_RE);

    const cssSrc = fs.readFileSync(
      path.join(ROOT_DIR, 'src/styles/atlas-modal.css'),
      'utf8'
    );
    expect(cssSrc).toContain('.tex-search-bar');
    expect(cssSrc).toContain('.tex-pipeline-strip');
    expect(cssSrc).toContain('@media (max-width: 768px)');
    expect(cssSrc).not.toMatch(WP_BADGE_RE);
  });
});

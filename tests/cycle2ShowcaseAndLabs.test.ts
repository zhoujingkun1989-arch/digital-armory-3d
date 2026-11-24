import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  applyLocationToStore,
  buildSearchString,
} from '../src/app/useUrlStateSync';
import {
  CARTRIDGE_LAB_SPECS,
  getCartridgeLabMeshBundle,
} from '../src/engine/cartridges/cartridgeSpecs';
import { EXTERNAL_BALLISTICS_STRINGS } from '../src/features/ballistics/externalBallisticsStrings';
import { ExternalBallisticsView } from '../src/features/ballistics/ExternalBallisticsView';
import { CartridgeLabView } from '../src/features/cartridges/CartridgeLabView';
import {
  computeSplitCameraFraming,
  computeSplitViewportRects,
  DEFAULT_SPLIT_AZIMUTH,
  DEFAULT_SPLIT_POLAR,
  DEFAULT_SPLIT_ZOOM,
  SPLIT_MAX_HORIZONTAL_OCCUPANCY,
  SPLIT_MOBILE_BREAKPOINT_PX,
} from '../src/features/showdown3d/splitShowdownCamera';
import { ShowcaseView } from '../src/features/showcase/ShowcaseView';
import { SHOWCASE_STRINGS } from '../src/i18n/showcaseStrings';
import { useAppStore } from '../src/store/useAppStore';
import { WEAPON_IDS } from '../src/weapons/types';

const ROOT = path.resolve(__dirname, '..');
const CJK_RE = /[\u3400-\u9fff\uf900-\ufaff]/;

function readRepoFile(relPath: string): string {
  return fs.readFileSync(path.join(ROOT, relPath), 'utf8');
}

function collectLeafStrings(obj: unknown, out: string[] = []): string[] {
  if (typeof obj === 'string') {
    out.push(obj);
    return out;
  }
  if (typeof obj === 'function') {
    const sample = (obj as (...args: unknown[]) => unknown)(
      'AK-15',
      10,
      '1.0',
      '2.0'
    );
    if (typeof sample === 'string') out.push(sample);
    return out;
  }
  if (Array.isArray(obj)) {
    for (const item of obj) collectLeafStrings(item, out);
    return out;
  }
  if (obj && typeof obj === 'object') {
    for (const val of Object.values(obj)) {
      collectLeafStrings(val, out);
    }
  }
  return out;
}

describe('Cycle 2B · Showcase Luxury Overhaul, APFSDS Lab, 3D-First Range & Split-Screen Framing', () => {
  it('1. Declutters Showcase hero to 2 primary CTAs, single-row exhibit carousel, below-fold Physics Labs bento & lazy+async images', () => {
    const prevLang = useAppStore.getState().lang;
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en' });
      const htmlEn = renderToStaticMarkup(React.createElement(ShowcaseView));

      // Exactly 2 primary CTA buttons inside `.showcase-hero-ctas`
      const ctasMatch = htmlEn.match(
        /<div class="showcase-hero-ctas">([\s\S]*?)<\/div>/
      );
      expect(ctasMatch).not.toBeNull();
      const ctaButtonCount = (ctasMatch![1].match(/<button\b/g) ?? []).length;
      expect(ctaButtonCount).toBe(2);

      // Single-row horizontal exhibit carousel with left/right scroll buttons
      expect(htmlEn).toContain('stage-carousel-shell');
      expect(htmlEn).toContain('stage-weapon-carousel');
      expect((htmlEn.match(/stage-carousel-arrow/g) ?? []).length).toBe(2);

      // Below-fold Explore 3D Physics Theaters & Engineering Labs bento with all 8 destinations
      expect(htmlEn).toContain('id="physics-labs"');
      expect(htmlEn).toContain('labs-bento-grid');
      expect((htmlEn.match(/lab-bento-card/g) ?? []).length).toBe(8);

      // Zero CJK leaks in English ShowcaseView (except language toggle pill '中文')
      expect(CJK_RE.test(htmlEn.replace(/中文/g, ''))).toBe(false);
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }

    // Verify EVERY <img> in ShowcaseView.tsx declares both loading="lazy" and decoding="async"
    const showcaseSrc = readRepoFile('src/features/showcase/ShowcaseView.tsx');
    const imgTags = showcaseSrc.match(/<img[\s\S]*?\/>/g) ?? [];
    expect(imgTags.length).toBeGreaterThanOrEqual(6);
    for (const tag of imgTags) {
      expect(tag).toContain('loading="lazy"');
      expect(tag).toContain('decoding="async"');
    }

    // Verify 100% bilingual parity and 0 CJK in English physicsLabs strings
    expect(Object.keys(SHOWCASE_STRINGS.en.physicsLabs)).toEqual(
      Object.keys(SHOWCASE_STRINGS.zh.physicsLabs)
    );
    expect(Object.keys(SHOWCASE_STRINGS.en.physicsLabs.cards)).toEqual(
      Object.keys(SHOWCASE_STRINGS.zh.physicsLabs.cards)
    );
    for (const str of collectLeafStrings(SHOWCASE_STRINGS.en.physicsLabs)) {
      expect(str.length).toBeGreaterThan(0);
      expect(CJK_RE.test(str)).toBe(false);
    }
  });

  it('2. Generates authentic photorealistic APFSDS finned dart, 3-petal sabot & bundled propellant sticks for 120mm & 125mm', () => {
    for (const cal of ['120mm_apfsds', '125mm_apfsds'] as const) {
      const spec = CARTRIDGE_LAB_SPECS[cal];
      const caseH = spec.caseLengthMm / 10;
      const oalH = spec.oalMm / 10;
      const boreR = spec.bulletDiameterMm / 20;

      for (const cutaway of [true, false]) {
        const bundle = getCartridgeLabMeshBundle(cal, cutaway);
        expect(bundle.penetratorGeo).not.toBeNull();

        const geometries = [
          bundle.caseGeo,
          bundle.primerCupGeo,
          bundle.anvilGeo,
          bundle.propellantGeo,
          bundle.jacketGeo,
          bundle.coreSlugGeo,
          bundle.penetratorGeo!,
        ];
        for (const geo of geometries) {
          const pos = geo.getAttribute('position');
          expect(pos.count).toBeGreaterThan(24);
          for (let i = 0; i < pos.count; i++) {
            expect(Number.isFinite(pos.getX(i))).toBe(true);
            expect(Number.isFinite(pos.getY(i))).toBe(true);
            expect(Number.isFinite(pos.getZ(i))).toBe(true);
          }
          geo.computeBoundingBox();
        }

        // Case spans [0 .. caseH]
        const caseBox = bundle.caseGeo.boundingBox!;
        expect(caseBox.min.y).toBeCloseTo(0, 1);
        expect(caseBox.max.y).toBeCloseTo(caseH, 1);

        // Finned tungsten penetrator dart (`jacketGeo`) spans deep inside the case up to exact `oalH`
        const dartBox = bundle.jacketGeo.boundingBox!;
        expect(dartBox.min.y).toBeLessThan(caseH * 0.5);
        expect(dartBox.max.y).toBeCloseTo(oalH, 1);

        // Verify sub-caliber slender rod radius above sabot vs wide stabilizing tail fins inside case
        const dartPos = bundle.jacketGeo.getAttribute('position');
        let maxUpperShaftR = 0;
        let maxTailFinR = 0;
        for (let i = 0; i < dartPos.count; i++) {
          const y = dartPos.getY(i);
          const r = Math.hypot(dartPos.getX(i), dartPos.getZ(i));
          if (y > oalH - 22 && y < oalH - 15) {
            maxUpperShaftR = Math.max(maxUpperShaftR, r);
          }
          if (y > dartBox.min.y + 1 && y < dartBox.min.y + 14) {
            maxTailFinR = Math.max(maxTailFinR, r);
          }
        }
        // Slender Ø25-26mm dart (~1.25–1.30 cm radius) << full bore radius (6.0–6.25 cm)
        expect(maxUpperShaftR).toBeGreaterThan(1.0);
        expect(maxUpperShaftR).toBeLessThan(2.0);
        // Swept tail fins span visibly wider than the dart rod (> 3.8 cm radius)
        expect(maxTailFinR).toBeGreaterThan(3.8);

        // 3-petal hourglass saddle sabot (`coreSlugGeo`) grips around case mouth at full bore diameter
        const sabotBox = bundle.coreSlugGeo.boundingBox!;
        expect(sabotBox.min.y).toBeLessThan(caseH);
        expect(sabotBox.max.y).toBeGreaterThan(caseH + 18);
        expect(sabotBox.max.x).toBeGreaterThan(boreR * 0.92);

        // Bundled cylindrical combustible propellant sticks have rich multi-cylinder geometry
        expect(bundle.propellantGeo.getAttribute('position').count).toBeGreaterThan(
          800
        );
      }
    }

    // CartridgeCutawayStage removes washed-out blue emissive tint on caseGeo & renders numeric mm ruler texture
    const stageSrc = readRepoFile(
      'src/engine/actors/CartridgeCutawayStage.tsx'
    );
    expect(stageSrc).not.toContain("emissive={isActive ? '#0ea5e9'");
    expect(stageSrc).toContain('createElevationRulerLabelTexture');
    expect(stageSrc).toContain('TANK_ACTIVE_INNER_HALO_GEO');
    expect(stageSrc).toContain('leftRulerTex?.dispose()');
    expect(stageSrc).toContain('rightRulerTex?.dispose()');

    // Zero `WP-06` internal badge leak in CartridgeLabView (small arms & heavy ordnance, zh & en)
    const prevState = useAppStore.getState();
    const initialSnap = useAppStore.getInitialState() as {
      lang: 'zh' | 'en';
      activeCartridgeCaliber: string;
    };
    const prevInitLang = initialSnap.lang;
    const prevInitCal = initialSnap.activeCartridgeCaliber;
    try {
      for (const lang of ['en', 'zh'] as const) {
        for (const cal of ['556_nato', '125mm_apfsds'] as const) {
          initialSnap.lang = lang;
          initialSnap.activeCartridgeCaliber = cal;
          useAppStore.setState({ lang, activeCartridgeCaliber: cal });
          const html = renderToStaticMarkup(
            React.createElement(CartridgeLabView)
          );
          expect(html).not.toContain('WP-06');
          if (lang === 'en') {
            expect(CJK_RE.test(html.replace(/中文/g, ''))).toBe(false);
          }
        }
      }
    } finally {
      initialSnap.lang = prevInitLang;
      initialSnap.activeCartridgeCaliber = prevInitCal;
      useAppStore.setState({
        lang: prevState.lang,
        activeCartridgeCaliber: prevState.activeCartridgeCaliber,
      });
    }

    // Verify #15 mobile specificity rule resides cleanly in cartridges.css
    const cartridgesCss = readRepoFile('src/styles/cartridges.css');
    expect(cartridgesCss).toContain('@media (max-width: 440px)');
    expect(cartridgesCss).toContain('.cartridge-header .brand-block');
  });

  it('3. Delivers 3D-first 1,000m Proving Ground layout, zero WP-14 badge leak & realistic textured terrain/sky/bench', () => {
    // Zero WP-14 public badge leak + 100% bilingual parity
    expect(EXTERNAL_BALLISTICS_STRINGS.zh.badge).not.toContain('WP-14');
    expect(EXTERNAL_BALLISTICS_STRINGS.en.badge).not.toContain('WP-14');
    expect(Object.keys(EXTERNAL_BALLISTICS_STRINGS.en)).toEqual(
      Object.keys(EXTERNAL_BALLISTICS_STRINGS.zh)
    );
    expect(
      CJK_RE.test(EXTERNAL_BALLISTICS_STRINGS.en.controlsDeckToggleExpand)
    ).toBe(false);
    expect(
      CJK_RE.test(EXTERNAL_BALLISTICS_STRINGS.en.controlsDeckToggleCollapse)
    ).toBe(false);
    expect(
      CJK_RE.test(EXTERNAL_BALLISTICS_STRINGS.en.controlsDeckSummaryLabel)
    ).toBe(false);

    // 3D-First DOM ordering: `range-3d-section` renders BEFORE `eb-controls-drawer-shell` & `eb-selector-deck`
    const prevLang = useAppStore.getState().lang;
    const initialSnap = useAppStore.getInitialState() as { lang: 'zh' | 'en' };
    const prevInitialLang = initialSnap.lang;
    try {
      initialSnap.lang = 'en';
      useAppStore.setState({ lang: 'en' });
      const htmlEn = renderToStaticMarkup(
        React.createElement(ExternalBallisticsView, {
          initialCaliber: '338_lapua',
        })
      );
      expect(htmlEn).not.toContain('WP-14');
      const idxRange3d = htmlEn.indexOf('range-3d-section');
      const idxControlsDrawer = htmlEn.indexOf('eb-controls-drawer-shell');
      const idxSelectorDeck = htmlEn.indexOf('eb-selector-deck');
      expect(idxRange3d).toBeGreaterThan(-1);
      expect(idxControlsDrawer).toBeGreaterThan(idxRange3d);
      expect(idxSelectorDeck).toBeGreaterThan(idxRange3d);
      expect(CJK_RE.test(htmlEn.replace(/中文/g, ''))).toBe(false);
    } finally {
      initialSnap.lang = prevInitialLang;
      useAppStore.setState({ lang: prevLang });
    }

    // Verify Range3DScene upgrades: no flatShading, textured gravel + bump (R3F-safe linear lock), sky dome & 100/300/600/1000m gates
    const rangeSrc = readRepoFile('src/features/ballistics/Range3DScene.tsx');
    expect(rangeSrc).not.toContain('flatShading');
    expect(rangeSrc).toContain('createProvingGroundTerrainTextures');
    expect(rangeSrc).toContain('lockLinearTextureColorSpace(bumpTex)');
    expect(rangeSrc).toContain('createAtmosphericSkyTexture');
    expect(rangeSrc).toContain('terrainTextures?.albedoTex.dispose()');
    expect(rangeSrc).toContain('terrainTextures?.bumpTex.dispose()');
    expect(rangeSrc).toContain('skyDomeTex?.dispose()');
    expect(rangeSrc).toContain('[100, 300, 600, 1000]');
  });

  it('4. Parses ?splitWeapon= URL alias, enforces >= 14% anti-clipping margins across all 34 exhibits & computes mobile vertical scissor split', () => {
    // 4a. URL alias `?splitWeapon=` support
    applyLocationToStore('?screen=split_showdown&weapon=m134&splitWeapon=gau8');
    const stAlias = useAppStore.getState();
    expect(stAlias.screen).toBe('split_showdown');
    expect(stAlias.splitShowdownWeaponA).toBe('m134');
    expect(stAlias.splitShowdownWeaponB).toBe('gau8');

    // Canonical `weaponB` still takes priority over `splitWeapon` if both are present
    applyLocationToStore(
      '?screen=split_showdown&weaponA=ak15&weaponB=m4a1&splitWeapon=mp5'
    );
    expect(useAppStore.getState().splitShowdownWeaponA).toBe('ak15');
    expect(useAppStore.getState().splitShowdownWeaponB).toBe('m4a1');

    // buildSearchString strips stale `splitWeapon` and writes canonical `weaponA`/`weaponB`
    const rebuilt = buildSearchString(
      'm134',
      'split_showdown',
      'explode',
      false,
      'en',
      '556_nato',
      true,
      '338_lapua',
      '?screen=split_showdown&weapon=m134&splitWeapon=gau8',
      { weaponA: 'm134', weaponB: 'gau8' }
    );
    expect(rebuilt).toContain('weaponA=m134');
    expect(rebuilt).toContain('weaponB=gau8');
    expect(rebuilt).not.toContain('splitWeapon=');

    // 4b. Mobile top/bottom vs Desktop left/right scissor viewport math
    expect(SPLIT_MOBILE_BREAKPOINT_PX).toBe(768);
    const desktopLayout = computeSplitViewportRects(1920, 1080);
    expect(desktopLayout.layout).toBe('horizontal');
    expect(desktopLayout.rectA).toEqual({
      x: 0,
      y: 0,
      width: 960,
      height: 1080,
      aspect: 960 / 1080,
    });
    expect(desktopLayout.rectB).toEqual({
      x: 960,
      y: 0,
      width: 960,
      height: 1080,
      aspect: 960 / 1080,
    });

    const mobileLayout = computeSplitViewportRects(390, 844);
    expect(mobileLayout.layout).toBe('vertical');
    // WebGL y = 0 is bottom: Slot A = TOP half (y = 422), Slot B = BOTTOM half (y = 0)
    expect(mobileLayout.rectA).toEqual({
      x: 0,
      y: 422,
      width: 390,
      height: 422,
      aspect: 390 / 422,
    });
    expect(mobileLayout.rectB).toEqual({
      x: 0,
      y: 0,
      width: 390,
      height: 422,
      aspect: 390 / 422,
    });

    // 4c. Anti-clipping projected horizontal occupancy <= 72% (>= 14% margin on BOTH sides!)
    // Verified across ALL 34 exhibits on desktop & mobile viewports, both assembled & exploded
    const testAspects = [
      desktopLayout.rectA.aspect,
      computeSplitViewportRects(1280, 800).rectA.aspect,
      mobileLayout.rectA.aspect,
    ];
    for (const weaponId of WEAPON_IDS) {
      for (const aspect of testAspects) {
        for (const explodeT of [0, 1]) {
          const frame = computeSplitCameraFraming(
            weaponId,
            explodeT,
            aspect,
            DEFAULT_SPLIT_AZIMUTH,
            DEFAULT_SPLIT_POLAR,
            DEFAULT_SPLIT_ZOOM
          );
          expect(Number.isFinite(frame.radius)).toBe(true);
          expect(frame.projectedHorizontalOccupancy).toBeLessThanOrEqual(
            SPLIT_MAX_HORIZONTAL_OCCUPANCY + 1e-4
          );
          const marginEachSide =
            (1 - frame.projectedHorizontalOccupancy) * 0.5;
          expect(marginEachSide).toBeGreaterThanOrEqual(0.1399);
        }
      }
    }

    // Verify studio floor vignette texture disposal in SplitShowdownViewport
    const splitVpSrc = readRepoFile(
      'src/features/showdown3d/SplitShowdownViewport.tsx'
    );
    expect(splitVpSrc).toContain('computeSplitViewportRects');
    expect(splitVpSrc).toContain('createSplitStageVignetteTexture');
    expect(splitVpSrc).toContain('stageVignetteTex?.dispose()');
    expect(splitVpSrc).toContain('<gridHelper');
  });
});

import fs from 'node:fs';
import path from 'node:path';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import {
  ARCHERY_PROJECTILE_SPECS,
  archeryProjectileToLabSpec,
  CARTRIDGE_LAB_ORDER,
  CARTRIDGE_LAB_SPECS,
  TANK_ORDNANCE_ORDER,
} from '../src/engine/cartridges/cartridgeSpecs';
import {
  assembleDkEditorialPack,
  buildDkEvolutionTimeline,
  buildDkLoupeSpecs,
  buildDkPartMicroCopy,
  buildDkScaleReference,
  computeDkCartridgePlateLayout,
  enrichDkCallouts,
  resolveWeaponCartridgeSpec,
  type DkEraRelation,
} from '../src/features/monograph/dkEditorialData';
import {
  DkActualSizeCartridgePlate,
  DkAnnotatedPlateOverlay,
  DkCircularLoupeStrip,
  DkEvolutionTimelineStrip,
  DkLoupeHeroConnectorOverlay,
  DkTrueScaleRuler,
} from '../src/features/monograph/DkVectorComponents';
import { assembleMonographDossier } from '../src/features/monograph/monographDataAssembler';
import type { WeaponNarrationBundle } from '../src/narration/types';
import { getWeaponManifest } from '../src/weapons/manifests';
import { loadWeaponPlugin } from '../src/weapons/registry';
import { WEAPON_IDS, type WeaponId } from '../src/weapons/types';

const NARRATIONS_DIR = path.resolve(__dirname, '../public/narrations');

function loadNarrationBundle(weaponId: WeaponId): WeaponNarrationBundle {
  const jsonPath = path.join(NARRATIONS_DIR, `${weaponId}.json`);
  return JSON.parse(fs.readFileSync(jsonPath, 'utf8')) as WeaponNarrationBundle;
}

describe('DK Visual Encyclopedia Editorial Data Layer & Vector Components', () => {
  it('produces valid bilingual DkScaleReference for all 34 exhibits with accurate silhouettes', () => {
    expect(WEAPON_IDS.length).toBe(34);

    for (const weaponId of WEAPON_IDS) {
      const manifest = getWeaponManifest(weaponId);
      const isTank = manifest.catalog.category === 'armor';
      const isHeavyOrdnance = manifest.catalog.category === 'ordnance';
      const expectedSilhouette =
        manifest.catalog.category === 'pistol'
          ? 'hand'
          : manifest.catalog.category === 'archery'
            ? 'archer'
            : 'human';

      for (const lang of ['zh', 'en'] as const) {
        const ref = buildDkScaleReference(weaponId, lang);
        expect(Number.isFinite(ref.oalMm)).toBe(true);
        if (isTank) {
          expect(ref.oalMm).toBeGreaterThanOrEqual(7000);
          expect(ref.oalMm).toBeLessThanOrEqual(12000);
          expect(Number.isFinite(ref.barrelMm)).toBe(true);
          expect(ref.barrelMm).toBeGreaterThanOrEqual(4000);
          expect(Number.isFinite(ref.weightKg)).toBe(true);
          expect(ref.weightKg).toBeGreaterThanOrEqual(40000);
          expect(ref.weightKg).toBeLessThanOrEqual(80000);
          expect(ref.ratioPercent).toBeGreaterThanOrEqual(400);
          expect(ref.ratioPercent).toBeLessThanOrEqual(750);
        } else if (isHeavyOrdnance) {
          expect(ref.oalMm).toBeGreaterThanOrEqual(2500);
          expect(ref.oalMm).toBeLessThanOrEqual(7000);
          expect(Number.isFinite(ref.barrelMm)).toBe(true);
          expect(ref.barrelMm).toBeGreaterThanOrEqual(1500);
          expect(Number.isFinite(ref.weightKg)).toBe(true);
          expect(ref.weightKg).toBeGreaterThanOrEqual(100);
          expect(ref.weightKg).toBeLessThanOrEqual(2500);
          expect(ref.ratioPercent).toBeGreaterThanOrEqual(150);
          expect(ref.ratioPercent).toBeLessThanOrEqual(450);
        } else {
          expect(ref.oalMm).toBeGreaterThanOrEqual(180);
          expect(ref.oalMm).toBeLessThanOrEqual(1600);
          expect(Number.isFinite(ref.barrelMm)).toBe(true);
          expect(ref.barrelMm).toBeGreaterThanOrEqual(90);
          expect(Number.isFinite(ref.weightKg)).toBe(true);
          expect(ref.weightKg).toBeGreaterThan(0.4);
          expect(ref.weightKg).toBeLessThan(20);
          expect(ref.ratioPercent).toBeGreaterThanOrEqual(10);
          expect(ref.ratioPercent).toBeLessThanOrEqual(200);
        }
        expect(ref.silhouetteKind).toBe(expectedSilhouette);
        expect(ref.referenceLengthMm).toBe(
          expectedSilhouette === 'hand' ? 190 : 1750
        );
        expect(ref.caption.length).toBeGreaterThan(12);
        expect(ref.caption).not.toContain('NaN');
        if (lang === 'zh') {
          expect(/[\u4e00-\u9fff]/.test(ref.caption)).toBe(true);
        } else {
          expect(ref.caption).toMatch(/mm/i);
        }
      }
    }

    // Spot-check real-world physical bounds (small arms + 1:1 MBTs)
    expect(buildDkScaleReference('g17', 'en').oalMm).toBe(202);
    expect(buildDkScaleReference('p08', 'en').oalMm).toBe(222);
    expect(buildDkScaleReference('m82a1', 'en').oalMm).toBe(1448);
    expect(buildDkScaleReference('vector', 'zh').oalMm).toBe(617);
    expect(buildDkScaleReference('vector', 'en').oalMm).toBe(617);
    expect(buildDkScaleReference('m1a2', 'en').oalMm).toBe(9770);
    expect(buildDkScaleReference('leopard2a7', 'en').oalMm).toBe(10970);
    expect(buildDkScaleReference('tiger1', 'en').oalMm).toBe(8450);
  });

  it('produces strictly chronological 5-node DkEvolutionTimeline with exactly one current node across all 27 exhibits', () => {
    const expectedRelations: DkEraRelation[] = [
      'ancestor',
      'predecessor',
      'current',
      'rival',
      'successor',
    ];

    for (const weaponId of WEAPON_IDS) {
      for (const lang of ['zh', 'en'] as const) {
        const timeline = buildDkEvolutionTimeline(weaponId, lang);
        expect(timeline.length).toBe(5);

        const currentNodes = timeline.filter((n) => n.isCurrent);
        expect(currentNodes.length).toBe(1);
        expect(currentNodes[0].eraRelation).toBe('current');

        expect(timeline.map((n) => n.eraRelation)).toEqual(expectedRelations);

        let prevYear = 0;
        for (const node of timeline) {
          expect(node.year).toMatch(/^\d{4}$/);
          const yearNum = Number(node.year);
          expect(yearNum).toBeGreaterThanOrEqual(1850);
          expect(yearNum).toBeLessThanOrEqual(2030);
          expect(yearNum).toBeGreaterThanOrEqual(prevYear);
          prevYear = yearNum;

          expect(node.name.trim().length).toBeGreaterThanOrEqual(3);
          expect(node.subtitle.trim().length).toBeGreaterThanOrEqual(6);
        }
      }
    }
  });

  it('produces curated bilingual DkLoupeSpecs for all 27 exhibits with domain-specific archery copy', () => {
    for (const weaponId of WEAPON_IDS) {
      const isArchery = getWeaponManifest(weaponId).catalog.category === 'archery';

      for (const lang of ['zh', 'en'] as const) {
        const loupes = buildDkLoupeSpecs(weaponId, lang);
        expect(loupes.length).toBeGreaterThanOrEqual(3);
        expect(loupes.length).toBeLessThanOrEqual(4);

        const keys = loupes.map((l) => l.plateKey);
        expect(keys).toContain('breech_closeup');
        expect(keys).toContain('group_fcg');
        expect(keys).toContain('group_slide');

        for (const loupe of loupes) {
          expect(loupe.magnification).toMatch(/^\d(?:\.\d)?×$/);
          expect(loupe.title.trim().length).toBeGreaterThanOrEqual(4);
          expect(loupe.caption.trim().length).toBeGreaterThanOrEqual(12);
          if (isArchery) {
            expect(loupe.caption).not.toMatch(/枪管|弹匣|火药/);
            expect(loupe.caption.toLowerCase()).not.toMatch(/gunpowder|brass case/);
          }
        }
      }
    }
  });

  it('distills crisp bilingual buildDkPartMicroCopy across all 683 parts of all 27 exhibits without ellipses or mid-word cuts', async () => {
    let totalPartsChecked = 0;

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const bundle = loadNarrationBundle(weaponId);

      for (const lang of ['zh', 'en'] as const) {
        const dossier = assembleMonographDossier(
          weaponId,
          plugin,
          lang,
          bundle,
          'https://armory.example.org/'
        );
        const pack = assembleDkEditorialPack(dossier);
        expect(pack.weaponId).toBe(weaponId);
        expect(pack.lang).toBe(lang);
        expect(pack.evolutionTimeline.length).toBe(5);
        expect(pack.loupeSpecs.length).toBe(4);

        for (const row of dossier.bomRows) {
          const byDossier = buildDkPartMicroCopy(dossier, row.partId);
          const byRow = buildDkPartMicroCopy(row, lang);
          const fromPack = pack.partMicroCopyById[row.partId];

          expect(byDossier).toEqual(byRow);
          expect(fromPack).toEqual(byRow);

          expect(byDossier.title.trim().length).toBeGreaterThan(1);
          expect(byDossier.microCopy).not.toMatch(/…|\.\.\./);
          expect(byDossier.microCopy).not.toContain('undefined');
          expect(byDossier.microCopy).not.toContain('NaN');

          if (lang === 'zh') {
            expect(
              byDossier.title.length,
              `[${weaponId}/${row.partId}/zh title] "${byDossier.title}"`
            ).toBeLessThanOrEqual(13);
            expect(
              byDossier.microCopy.length,
              `[${weaponId}/${row.partId}/zh] "${byDossier.microCopy}"`
            ).toBeGreaterThanOrEqual(12);
            expect(
              byDossier.microCopy.length,
              `[${weaponId}/${row.partId}/zh] "${byDossier.microCopy}"`
            ).toBeLessThanOrEqual(24);
          } else {
            expect(
              byDossier.title.length,
              `[${weaponId}/${row.partId}/en title] "${byDossier.title}"`
            ).toBeLessThanOrEqual(26);
            expect(
              byDossier.microCopy.length,
              `[${weaponId}/${row.partId}/en] "${byDossier.microCopy}"`
            ).toBeGreaterThanOrEqual(26);
            expect(
              byDossier.microCopy.length,
              `[${weaponId}/${row.partId}/en] "${byDossier.microCopy}"`
            ).toBeLessThanOrEqual(48);
            expect(byDossier.microCopy.endsWith('.')).toBe(true);
            // Must never end with an incomplete dangling subordinate noun phrase or bare number
            expect(
              byDossier.microCopy,
              `[${weaponId}/${row.partId}/en dangling] "${byDossier.microCopy}"`
            ).not.toMatch(/\b(?:while|before|after|where|when)\s+(?:the|a|an|its|their)\s+\w+\.$/i);
            expect(
              byDossier.microCopy,
              `[${weaponId}/${row.partId}/en bare-num] "${byDossier.microCopy}"`
            ).not.toMatch(/\b(?:to|at|by)\s+(?:roughly|about|approx\.?)?\s*\d+(?:\.\d+)?(?:\s+meters?)?\.$/i);
          }

          totalPartsChecked++;
        }

        // Regression guards on previously reported AK-15 & Garand spoken-number defects
        if (weaponId === 'ak15' && lang === 'en') {
          const r02 = buildDkPartMicroCopy(dossier, 'ak_barrel');
          expect(r02.microCopy).toContain('715 m/s');
          expect(r02.microCopy).not.toMatch(/seven hundred/i);
          const r08 = buildDkPartMicroCopy(dossier, 'ak_pistol_grip');
          expect(r08.microCopy).not.toMatch(/while the guard/i);
        }
        if (weaponId === 'garand' && lang === 'zh') {
          const b01 = buildDkPartMicroCopy(dossier, 'garand_barrel');
          expect(b01.microCopy).toContain('345 MPa');
          expect(b01.microCopy).not.toContain('三百四十五');
          const f05 = buildDkPartMicroCopy(dossier, 'garand_front_handguard');
          expect(f05.microCopy).toContain('108 mm');
          expect(f05.microCopy).not.toContain('一百零八');
        }

        // Verify graceful missing partId fallback & enrichDkCallouts helper
        const missing = buildDkPartMicroCopy(dossier, 'nonexistent_part_id');
        expect(missing.title).toBe('nonexistent_part_id');
        expect(missing.microCopy.length).toBeGreaterThan(12);

        const samplePart = dossier.bomRows[0];
        const enriched = enrichDkCallouts(dossier, [
          {
            partId: samplePart.partId,
            bomCode: samplePart.bomCode,
            side: 'top',
            anchorU: 0.45,
            anchorV: 0.42,
            kneeU: 0.45,
            kneeV: 0.18,
            labelU: 0.45,
            labelV: 0.1,
            align: 'center',
          },
        ]);
        expect(enriched.length).toBe(1);
        expect(enriched[0].title).toBe(pack.partMicroCopyById[samplePart.partId].title);
        expect(enriched[0].microCopy).toBe(
          pack.partMicroCopyById[samplePart.partId].microCopy
        );
      }
    }

    // 34 exhibits (854 total parts) × 2 languages = 1,708 part micro-copies checked
    expect(totalPartsChecked).toBe(1708);
  });

  it('handles null narration fallback cleanly in buildDkPartMicroCopy for both zh and en', async () => {
    for (const weaponId of ['p08', 'ak15', 'lift33', 'ztz99a'] as const) {
      const plugin = await loadWeaponPlugin(weaponId);
      for (const lang of ['zh', 'en'] as const) {
        const dossier = assembleMonographDossier(weaponId, plugin, lang, null);
        for (const row of dossier.bomRows) {
          const res = buildDkPartMicroCopy(dossier, row.partId);
          expect(res.microCopy).not.toMatch(/…|\.\.\./);
          if (lang === 'zh') {
            expect(res.title.length).toBeLessThanOrEqual(13);
            expect(res.microCopy.length).toBeGreaterThanOrEqual(12);
            expect(res.microCopy.length).toBeLessThanOrEqual(24);
          } else {
            expect(res.title.length).toBeLessThanOrEqual(26);
            expect(res.microCopy.length).toBeGreaterThanOrEqual(26);
            expect(res.microCopy.length).toBeLessThanOrEqual(48);
          }
        }
      }
    }
  });

  it('computes exact 1:1 physical mm cartridge layouts for all 17 small-arms calibers, 1:10 for 4 heavy ordnance rounds, and 1:4/1:5 for archery without NaN or A4 overflow', () => {
    expect(CARTRIDGE_LAB_ORDER.length).toBe(17);
    expect(TANK_ORDNANCE_ORDER.length).toBe(4);

    for (const caliber of CARTRIDGE_LAB_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[caliber];
      for (const lang of ['zh', 'en'] as const) {
        for (const orientation of ['vertical', 'horizontal'] as const) {
          const layout = computeDkCartridgePlateLayout(spec, lang, orientation);
          expect(layout.isArchery).toBe(false);
          expect(layout.isTankOrdnance).toBe(false);
          expect(layout.scaleDenom).toBe(1);
          expect(layout.drawnLengthMm).toBeCloseTo(spec.oalMm, 1);
          expect(Number.isFinite(layout.svgWidthMm)).toBe(true);
          expect(Number.isFinite(layout.svgHeightMm)).toBe(true);
          expect(layout.svgWidthMm).toBeGreaterThan(30);
          expect(layout.svgHeightMm).toBeGreaterThan(30);
          // Must fit comfortably inside printable A4 column/page bounds (< 185mm)
          expect(layout.svgWidthMm).toBeLessThanOrEqual(185);
          expect(layout.svgHeightMm).toBeLessThanOrEqual(185);
          expect(layout.scaleStamp).toContain('1:1');
        }
      }
    }

    for (const tankCaliber of TANK_ORDNANCE_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[tankCaliber];
      for (const lang of ['zh', 'en'] as const) {
        for (const orientation of ['vertical', 'horizontal'] as const) {
          const layout = computeDkCartridgePlateLayout(spec, lang, orientation);
          expect(layout.isArchery).toBe(false);
          expect(layout.isTankOrdnance).toBe(true);
          expect(layout.scaleDenom).toBe(10);
          expect(layout.drawnLengthMm).toBeCloseTo(spec.oalMm / 10, 1);
          expect(Number.isFinite(layout.svgWidthMm)).toBe(true);
          expect(Number.isFinite(layout.svgHeightMm)).toBe(true);
          expect(layout.svgWidthMm).toBeLessThanOrEqual(185);
          expect(layout.svgHeightMm).toBeLessThanOrEqual(185);
          expect(layout.scaleStamp).toContain('1:10');
        }
      }
    }

    for (const archeryCaliber of ['arrow_400gr', 'bolt_400gr'] as const) {
      const spec = archeryProjectileToLabSpec(
        ARCHERY_PROJECTILE_SPECS[archeryCaliber]
      );
      for (const lang of ['zh', 'en'] as const) {
        for (const orientation of ['vertical', 'horizontal'] as const) {
          const layout = computeDkCartridgePlateLayout(spec, lang, orientation);
          expect(layout.isArchery).toBe(true);
          expect(layout.isTankOrdnance).toBe(false);
          expect(layout.scaleDenom).toBe(archeryCaliber === 'arrow_400gr' ? 5 : 4);
          expect(Number.isFinite(layout.svgWidthMm)).toBe(true);
          expect(Number.isFinite(layout.svgHeightMm)).toBe(true);
          expect(layout.svgWidthMm).toBeLessThanOrEqual(185);
          expect(layout.svgHeightMm).toBeLessThanOrEqual(185);
          expect(layout.scaleStamp).toContain(`1:${layout.scaleDenom}`);
        }
      }
    }

    // All 27 exhibits resolve a valid cartridge / ordnance spec
    for (const weaponId of WEAPON_IDS) {
      const cSpec = resolveWeaponCartridgeSpec(weaponId);
      const layout = computeDkCartridgePlateLayout(cSpec, 'en', 'vertical');
      expect(layout.svgWidthMm).toBeGreaterThan(30);
      expect(layout.svgHeightMm).toBeGreaterThan(30);
    }
  });

  it('renders all 5 DK print-grade pure SVG vector components via SSR with exact CSS mm sizing and zero NaN', () => {
    // 1. DkAnnotatedPlateOverlay
    const overlayHtml = renderToStaticMarkup(
      React.createElement(DkAnnotatedPlateOverlay, {
        callouts: [
          {
            partId: 'p08_rear_toggle',
            bomCode: 'U-06',
            side: 'top',
            anchorU: 0.42,
            anchorV: 0.44,
            kneeU: 0.42,
            kneeV: 0.2,
            labelU: 0.42,
            labelV: 0.12,
            align: 'center',
            title: '后肘节连杆',
            microCopy: '撞击尾坡后以 53.5° 向上屈膝折起完成抽壳。',
          },
          {
            partId: 'p08_trigger',
            bomCode: 'F-01',
            side: 'bottom',
            anchorU: 0.56,
            anchorV: 0.62,
            kneeU: 0.56,
            kneeV: 0.82,
            labelU: 0.56,
            labelV: 0.88,
            align: 'left',
            title: '麦秆黄新月扳机',
            microCopy: '向上顶推侧板直角杠杆横推阻铁释放击针。',
          },
        ],
      })
    );
    expect(overlayHtml).toContain('dk-annotated-plate-overlay');
    expect(overlayHtml).toContain('U-06');
    expect(overlayHtml).toContain('r="3.2"');
    expect(overlayHtml).toContain('max-width:22%');
    expect(overlayHtml).not.toContain('max-height:16.5mm');
    expect(overlayHtml).not.toContain('max-height:12.5mm');
    expect(overlayHtml).toContain('padding:1.5px 5px 2.5px');
    expect(overlayHtml).toContain('white-space:nowrap');
    expect(overlayHtml).toContain('-webkit-line-clamp:2');
    expect(overlayHtml).toContain('font-size:5.8pt');
    expect(overlayHtml).toContain('font-size:6.4pt');
    expect(overlayHtml).toContain('font-size:5.5pt');
    expect(overlayHtml).not.toContain('NaN');

    // Verify dynamic maxWidth scaling for 5-top, 6-bottom, and left/right callout densities
    const makeDenseCallout = (
      idx: number,
      side: 'top' | 'bottom' | 'left' | 'right'
    ) => ({
      partId: `${side}_${idx}`,
      bomCode: `P-${idx}`,
      side,
      anchorU: 0.2 + (idx % 5) * 0.15,
      anchorV: 0.5,
      kneeU: 0.2 + (idx % 5) * 0.15,
      kneeV: side === 'top' ? 0.18 : 0.82,
      labelU: 0.2 + (idx % 5) * 0.15,
      labelV: side === 'top' ? 0.08 : 0.92,
      align: 'center' as const,
      title: `Part ${idx}`,
      microCopy: 'Precision locking interface for cycle timing.',
    });
    const denseOverlayHtml = renderToStaticMarkup(
      React.createElement(DkAnnotatedPlateOverlay, {
        callouts: [
          ...[0, 1, 2, 3, 4].map((i) => makeDenseCallout(i, 'top')),
          ...[0, 1, 2, 3, 4, 5].map((i) => makeDenseCallout(i, 'bottom')),
          makeDenseCallout(0, 'left'),
          makeDenseCallout(1, 'right'),
        ],
      })
    );
    expect(denseOverlayHtml).toContain('max-width:18.5%');
    expect(denseOverlayHtml).toContain('max-width:15.8%');
    expect(denseOverlayHtml).toContain('max-width:21%');

    // 2. DkCircularLoupeStrip + DkLoupeHeroConnectorOverlay
    const p08Loupes = buildDkLoupeSpecs('p08', 'zh');
    const loupeAnchors = {
      breech_closeup: { u: 0.48, v: 0.36 },
      group_slide: { u: 0.55, v: 0.32 },
      group_fcg: { u: 0.44, v: 0.58 },
      group_mag: { u: 0.36, v: 0.72 },
    };
    const loupeHtml = renderToStaticMarkup(
      React.createElement(DkCircularLoupeStrip, {
        loupes: p08Loupes,
        plates: {
          breech_closeup: 'data:image/png;base64,AAAA',
          group_slide: 'data:image/png;base64,BBBB',
          group_fcg: 'data:image/png;base64,CCCC',
          group_mag: 'data:image/png;base64,DDDD',
        },
        loupeAnchors,
        lang: 'zh',
      })
    );
    expect(loupeHtml).toContain('dk-circular-loupe-strip');
    expect(loupeHtml).toContain('3.0×');
    expect(loupeHtml).toContain('2.5×');
    expect(loupeHtml).toContain('dk-loupe-connector-bridge');
    expect(loupeHtml).toContain('scale(1.06)');
    expect(loupeHtml).toContain('scale(1.24)');
    expect(loupeHtml).not.toContain('NaN');

    const heroConnHtml = renderToStaticMarkup(
      React.createElement(DkLoupeHeroConnectorOverlay, {
        loupes: p08Loupes,
        loupeAnchors,
      })
    );
    expect(heroConnHtml).toContain('dk-loupe-hero-connector-svg');
    expect(heroConnHtml).not.toContain('NaN');

    // 3. DkTrueScaleRuler across hand, human, archer & MBT silhouettes
    for (const [wid, lang] of [
      ['p08', 'zh'],
      ['ak15', 'en'],
      ['lift33', 'zh'],
      ['ztz99a', 'en'],
    ] as const) {
      const rulerHtml = renderToStaticMarkup(
        React.createElement(DkTrueScaleRuler, {
          scaleRef: buildDkScaleReference(wid, lang),
          lang,
          isArchery: wid === 'lift33',
        })
      );
      expect(rulerHtml).toContain('dk-true-scale-ruler');
      expect(rulerHtml).not.toContain('NaN');
    }

    // 4. DkActualSizeCartridgePlate across all 15 small-arms, 3 tank cannon rounds & 2 archery calibers
    for (const cal of CARTRIDGE_LAB_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[cal];
      for (const orientation of ['vertical', 'horizontal'] as const) {
        const layout = computeDkCartridgePlateLayout(spec, 'en', orientation);
        const plateHtml = renderToStaticMarkup(
          React.createElement(DkActualSizeCartridgePlate, {
            cartridgeSpec: spec,
            lang: 'en',
            orientation,
          })
        );
        expect(plateHtml).toContain(`width:${layout.svgWidthMm}mm`);
        expect(plateHtml).toContain(`height:${layout.svgHeightMm}mm`);
        expect(plateHtml).toContain('1:1 ACTUAL SIZE');
        expect(plateHtml).not.toContain('NaN');
      }
    }

    for (const tankCal of TANK_ORDNANCE_ORDER) {
      const spec = CARTRIDGE_LAB_SPECS[tankCal];
      for (const orientation of ['vertical', 'horizontal'] as const) {
        const layout = computeDkCartridgePlateLayout(spec, 'en', orientation);
        const plateHtml = renderToStaticMarkup(
          React.createElement(DkActualSizeCartridgePlate, {
            cartridgeSpec: spec,
            lang: 'en',
            orientation,
          })
        );
        expect(plateHtml).toContain(`width:${layout.svgWidthMm}mm`);
        expect(plateHtml).toContain(`height:${layout.svgHeightMm}mm`);
        expect(plateHtml).toContain('1:10 SCALE CUTAWAY');
        expect(plateHtml).not.toContain('NaN');
      }
    }

    for (const archeryCal of ['arrow_400gr', 'bolt_400gr'] as const) {
      const spec = archeryProjectileToLabSpec(
        ARCHERY_PROJECTILE_SPECS[archeryCal]
      );
      for (const orientation of ['vertical', 'horizontal'] as const) {
        const layout = computeDkCartridgePlateLayout(spec, 'zh', orientation);
        const plateHtml = renderToStaticMarkup(
          React.createElement(DkActualSizeCartridgePlate, {
            cartridgeSpec: spec,
            lang: 'zh',
            orientation,
          })
        );
        expect(plateHtml).toContain(`width:${layout.svgWidthMm}mm`);
        expect(plateHtml).toContain(`height:${layout.svgHeightMm}mm`);
        expect(plateHtml).toContain(`1:${layout.scaleDenom}`);
        expect(plateHtml).not.toContain('NaN');
      }
    }

    // 5. DkEvolutionTimelineStrip
    const timelineHtml = renderToStaticMarkup(
      React.createElement(DkEvolutionTimelineStrip, {
        nodes: buildDkEvolutionTimeline('p08', 'en'),
        lang: 'en',
      })
    );
    expect(timelineHtml).toContain('dk-evolution-timeline-strip');
    expect(timelineHtml).toContain('1893');
    expect(timelineHtml).toContain('1908');
    expect(timelineHtml).toContain('DWM Luger P08');
    expect(timelineHtml).toContain('is-current');
    expect(timelineHtml).not.toContain('NaN');
  });

  it('guarantees zero CJK leakage in English mode across all 27 editorial packs and all 5 rendered DK vector components', async () => {
    const cjkRe = /[\u4e00-\u9fff]/;

    for (const weaponId of WEAPON_IDS) {
      const plugin = await loadWeaponPlugin(weaponId);
      const bundle = loadNarrationBundle(weaponId);
      const dossier = assembleMonographDossier(weaponId, plugin, 'en', bundle);
      const pack = assembleDkEditorialPack(dossier);

      expect(cjkRe.test(pack.scaleReference.caption), `${weaponId} scale`).toBe(false);
      expect(cjkRe.test(pack.cartridgePlateLayout.scaleStamp), `${weaponId} stamp`).toBe(false);
      expect(
        cjkRe.test(pack.cartridgePlateLayout.scaleStampSecondary),
        `${weaponId} stamp2`
      ).toBe(false);

      for (const node of pack.evolutionTimeline) {
        expect(cjkRe.test(node.name), `${weaponId} tl name`).toBe(false);
        expect(cjkRe.test(node.subtitle), `${weaponId} tl sub`).toBe(false);
      }
      for (const loupe of pack.loupeSpecs) {
        expect(cjkRe.test(loupe.title), `${weaponId} loupe title`).toBe(false);
        expect(cjkRe.test(loupe.caption), `${weaponId} loupe cap`).toBe(false);
      }
      for (const [pid, mc] of Object.entries(pack.partMicroCopyById)) {
        expect(cjkRe.test(mc.title), `${weaponId}/${pid} title`).toBe(false);
        expect(cjkRe.test(mc.microCopy), `${weaponId}/${pid} copy`).toBe(false);
      }

      const sampleCallouts = enrichDkCallouts(
        dossier,
        dossier.bomRows.slice(0, 3).map((r, i) => ({
          partId: r.partId,
          bomCode: r.bomCode,
          side: i % 2 === 0 ? 'top' : 'bottom',
          anchorU: 0.25 + i * 0.25,
          anchorV: 0.48,
          kneeU: 0.25 + i * 0.25,
          kneeV: i % 2 === 0 ? 0.22 : 0.78,
          labelU: 0.25 + i * 0.25,
          labelV: i % 2 === 0 ? 0.12 : 0.88,
          align: 'center',
        }))
      );

      const rendered = [
        renderToStaticMarkup(
          React.createElement(DkAnnotatedPlateOverlay, { callouts: sampleCallouts })
        ),
        renderToStaticMarkup(
          React.createElement(DkCircularLoupeStrip, {
            loupes: pack.loupeSpecs,
            plates: null,
            lang: 'en',
          })
        ),
        renderToStaticMarkup(
          React.createElement(DkTrueScaleRuler, {
            scaleRef: pack.scaleReference,
            lang: 'en',
            exhibitLabel: dossier.shortTag,
            isArchery: dossier.isArchery,
          })
        ),
        renderToStaticMarkup(
          React.createElement(DkActualSizeCartridgePlate, {
            cartridgeSpec: dossier.cartridgeSpec,
            lang: 'en',
          })
        ),
        renderToStaticMarkup(
          React.createElement(DkEvolutionTimelineStrip, {
            nodes: pack.evolutionTimeline,
            lang: 'en',
          })
        ),
      ].join('\n');

      expect(cjkRe.test(rendered), `${weaponId} rendered EN components`).toBe(false);
      expect(rendered).not.toContain('NaN');
    }
  });
});

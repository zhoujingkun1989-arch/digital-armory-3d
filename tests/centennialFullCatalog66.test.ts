import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { ENGINEERING_GLOSSARY_TERMS } from '../src/engine/encyclopedia/engineeringGlossary';
import {
  CENTENNIAL_BLUEPRINT_MAP,
  CENTENNIAL_BLUEPRINTS,
  getCentennialBlueprint,
} from '../src/weapons/expansion/centennialCatalog';
import {
  CENTENNIAL_PART_SLOTS,
  resolveCentennialGroupMetas,
  resolveCentennialPartMeta,
} from '../src/weapons/expansion/centennialPartNomenclature';
import {
  CENTENNIAL_66_IDS,
  FLAGSHIP_34_IDS,
} from '../src/weapons/expansion/centennialTypes';

const CJK_OR_FULLWIDTH_RE = /[\u3000-\u303f\u3400-\u9fff\uf900-\ufaff\uff00-\uffef]/;
const WP_JARGON_RE = /\bWP-\d+[a-z]?\b/i;

const EXPECTED_BOM_CODES = [
  'U-01',
  'U-02',
  'U-03',
  'U-04',
  'U-05',
  'U-06',
  'F-01',
  'F-02',
  'F-03',
  'F-04',
  'F-05',
  'F-06',
  'T-01',
  'T-02',
  'T-03',
  'T-04',
  'M-01',
  'M-02',
  'M-03',
  'M-04',
] as const;

describe('100-Weapon Expansion Phase 2G — Unified 66-Exhibit Catalog & 1,320-Part Bilingual Nomenclature', () => {
  it('enforces strict pure-leaf import boundaries on centennialCatalog.ts and centennialPartNomenclature.ts', () => {
    const catalogSrc = fs.readFileSync(
      path.resolve(__dirname, '../src/weapons/expansion/centennialCatalog.ts'),
      'utf8'
    );
    const catalogRuntimeImports = [
      ...catalogSrc.matchAll(/^import\s+(?!type\b)[\s\S]*?from\s+['"]([^'"]+)['"]/gm),
    ].map((m) => m[1]);
    expect(catalogRuntimeImports.length).toBe(4);
    for (const specifier of catalogRuntimeImports) {
      expect(specifier.startsWith('./catalog/')).toBe(true);
    }

    const nomenSrc = fs.readFileSync(
      path.resolve(
        __dirname,
        '../src/weapons/expansion/centennialPartNomenclature.ts'
      ),
      'utf8'
    );
    const runtimeImportRe = /^import\s+(?!type\b)/m;
    expect(runtimeImportRe.test(nomenSrc)).toBe(false);
  });

  it('aggregates all 66 Centennial blueprints in exact BAY-35..BAY-100 order with exact hall distribution and 0 EN CJK / 0 WP-XX', () => {
    expect(CENTENNIAL_BLUEPRINTS).toHaveLength(66);
    expect(CENTENNIAL_BLUEPRINTS.map((b) => b.id)).toEqual([
      ...CENTENNIAL_66_IDS,
    ]);
    expect(new Set(CENTENNIAL_BLUEPRINTS.map((b) => b.id)).size).toBe(66);

    const liveGlossaryIds = new Set(
      ENGINEERING_GLOSSARY_TERMS.map((t) => t.id)
    );
    const hallCounts: Record<string, number> = {};

    CENTENNIAL_BLUEPRINTS.forEach((bp, idx) => {
      const expectedOrder = 35 + idx;
      expect(bp.orderIndex).toBe(expectedOrder);
      expect(bp.bayCode).toBe(`BAY-${expectedOrder}`);
      expect(CENTENNIAL_BLUEPRINT_MAP[bp.id]).toBe(bp);
      expect(getCentennialBlueprint(bp.id)).toBe(bp);

      hallCounts[bp.category] = (hallCounts[bp.category] ?? 0) + 1;

      expect(bp.glossaryTermIds.length).toBeGreaterThanOrEqual(2);
      for (const termId of bp.glossaryTermIds) {
        expect(liveGlossaryIds.has(termId)).toBe(true);
      }

      const enFields = [
        bp.shortLabel,
        bp.modelCode,
        bp.originCountryEn,
        bp.manufacturerEn,
        bp.nameEn,
        bp.subtitleEn,
        bp.weaponTypeEn,
        bp.caliberLabel,
        bp.actionMechanismEn,
        bp.overallLengthDisplayEn,
        bp.barrelSpecEn,
        bp.rateOfFireLabelEn,
        bp.rifling.noteEn,
        bp.descriptionEn,
        bp.historicalFactEn,
        ...bp.highlightsEn,
      ];
      for (const field of enFields) {
        expect(field.trim().length).toBeGreaterThan(0);
        expect(
          CJK_OR_FULLWIDTH_RE.test(field),
          `EN CJK/fullwidth in ${bp.id}: ${field}`
        ).toBe(false);
        expect(
          WP_JARGON_RE.test(field),
          `WP leak in EN ${bp.id}: ${field}`
        ).toBe(false);
      }

      const zhFields = [
        bp.originCountryZh,
        bp.manufacturerZh,
        bp.nameZh,
        bp.weaponTypeZh,
        bp.categoryZh,
        bp.actionMechanismZh,
        bp.overallLengthDisplayZh,
        bp.barrelSpecZh,
        bp.rateOfFireLabelZh,
        bp.rifling.noteZh,
        bp.descriptionZh,
        bp.historicalFactZh,
        ...bp.highlightsZh,
      ];
      for (const field of zhFields) {
        expect(field.trim().length).toBeGreaterThan(0);
        expect(
          WP_JARGON_RE.test(field),
          `WP leak in ZH ${bp.id}: ${field}`
        ).toBe(false);
      }
    });

    // Exact hall breakdown summing to 66
    expect(hallCounts).toEqual({
      rifle: 15,
      lmg: 7,
      smg: 9,
      sniper: 9,
      shotgun: 6,
      pistol: 10,
      archery: 3,
      armor: 4,
      ordnance: 3,
    });

    // Flagships and unknown IDs cleanly return undefined
    for (const flagshipId of FLAGSHIP_34_IDS) {
      expect(getCentennialBlueprint(flagshipId)).toBeUndefined();
    }
    expect(getCentennialBlueprint('nonexistent')).toBeUndefined();
  });

  it('resolves all 66 × 20 = 1,320 part nomenclature entries and 264 assembly groups with unique BOM codes, <= 32-char calloutLabelEn, 0 EN CJK & domain accuracy', () => {
    expect(CENTENNIAL_PART_SLOTS).toHaveLength(20);

    let totalPartsChecked = 0;

    for (const bp of CENTENNIAL_BLUEPRINTS) {
      const bomCodes: string[] = [];

      for (const slot of CENTENNIAL_PART_SLOTS) {
        const meta = resolveCentennialPartMeta(bp, slot);
        totalPartsChecked += 1;

        expect(meta.slot).toBe(slot);
        bomCodes.push(meta.bomCode);
        expect(meta.isShell).toBe(slot === 'receiver' || slot === 'mag_body');

        // Callout label length strictly within [3, 32]
        expect(
          meta.calloutLabelEn.length,
          `calloutLabelEn length out of [3, 32] on ${bp.id}.${slot}: "${meta.calloutLabelEn}"`
        ).toBeGreaterThanOrEqual(3);
        expect(
          meta.calloutLabelEn.length,
          `calloutLabelEn length > 32 on ${bp.id}.${slot}: "${meta.calloutLabelEn}"`
        ).toBeLessThanOrEqual(32);

        const enFields = [
          meta.nameEn,
          meta.calloutLabelEn,
          meta.roleTagEn,
          meta.descEn,
        ];
        for (const f of enFields) {
          expect(f.trim().length).toBeGreaterThan(0);
          expect(
            CJK_OR_FULLWIDTH_RE.test(f),
            `EN CJK/fullwidth in ${bp.id}.${slot}: ${f}`
          ).toBe(false);
          expect(
            WP_JARGON_RE.test(f),
            `WP leak in EN ${bp.id}.${slot}: ${f}`
          ).toBe(false);
        }

        const zhFields = [
          meta.nameZh,
          meta.calloutLabelZh,
          meta.roleTagZh,
          meta.descZh,
        ];
        for (const f of zhFields) {
          expect(f.trim().length).toBeGreaterThan(0);
          expect(
            WP_JARGON_RE.test(f),
            `WP leak in ZH ${bp.id}.${slot}: ${f}`
          ).toBe(false);
        }
      }

      expect(bomCodes).toEqual([...EXPECTED_BOM_CODES]);

      const groups = resolveCentennialGroupMetas(bp);
      expect(groups.map((g) => g.key)).toEqual([
        'slide',
        'frame',
        'fire_control',
        'magazine',
      ]);
      for (const g of groups) {
        expect(g.nameZh.trim().length).toBeGreaterThan(0);
        expect(g.nameEn.trim().length).toBeGreaterThan(0);
        expect(g.badgeColor).toMatch(/^#[0-9a-f]{6}$/i);
        expect(CJK_OR_FULLWIDTH_RE.test(g.nameEn)).toBe(false);
        expect(WP_JARGON_RE.test(g.nameEn)).toBe(false);
        expect(WP_JARGON_RE.test(g.nameZh)).toBe(false);
      }
    }

    expect(totalPartsChecked).toBe(1320);

    // Domain specialization spot-checks across distinct weapon classes
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.t90m, 'mag_body').nameEn
    ).toContain('Carousel Autoloader');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.englishlongbow, 'receiver')
        .nameEn
    ).toContain('Self-Yew');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.m777, 'stock').nameEn
    ).toContain('Titanium Split-Trail');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.saa1873, 'mag_body')
        .nameEn
    ).toContain('Cylinder');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.dp28, 'mag_body').nameEn
    ).toContain('Pan Magazine');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.m61vulcan, 'barrel')
        .nameEn
    ).toContain('Rotary Cluster');
    expect(
      resolveCentennialPartMeta(CENTENNIAL_BLUEPRINT_MAP.bizon, 'mag_body').nameEn
    ).toContain('Helical');
  });
});
